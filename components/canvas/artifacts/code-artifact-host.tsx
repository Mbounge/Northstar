// Northstar Canvas Live Web Artifact Host v0.7.9 — persistent iframe transactions with an idempotent acknowledgement outbox.
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, Loader2, TriangleAlert } from "lucide-react";
import { buildCanvasArtifactRuntimeDocument } from "@/lib/canvas-artifacts/runtime-document";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  NORTHSTAR_ARTIFACT_ACK_EVENT,
  northstarArtifactAcknowledgementChannelName,
} from "@/lib/canvas-ai/northstar-artboard-ack";
import type { NorthstarBrowserCommit } from "@/lib/canvas-ai/northstar-transaction-kernel";
import { NORTHSTAR_HEALTH_POLICY } from "@/lib/canvas-ai/northstar-health-policy";
import { acceptNorthstarContentSize } from "@/lib/canvas-artifacts/content-size-coordinator";
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardChangeKind,
  NorthstarArtboardMutationBatch,
  NorthstarEvidenceRegistryReceipt,
  NorthstarLiveSurfaceSnapshot,
} from "@/lib/canvas-artifacts/types";

const MINIMUM_INTERACTIVE_ZOOM = 0.24;

interface ArtifactPointerMessage {
  type:
    | "northstar.artifact.select"
    | "northstar.artifact.drag-start"
    | "northstar.artifact.wheel"
    | "northstar.artifact.ready"
    | "northstar.artifact.runtime-error"
    | "northstar.artifact.runtime-review"
    | "northstar.artifact.content-size"
    | "northstar.artifact.transport-probe-ack"
    | "northstar.artifact.mutation-received"
    | "northstar.artifact.mutation-applied"
    | "northstar.artifact.mutation-rejected";
  artifactId: string;
  surfaceId?: string;
  revisionId?: string;
  browserRevisionId?: string;
  baseRevisionId?: string;
  proposalId?: string;
  ackToken?: string;
  mutationId?: string;
  appliedMutationIds?: string[];
  visibleChange?: string;
  clientX?: number;
  clientY?: number;
  deltaX?: number;
  deltaY?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  message?: string;
  review?: CanvasCodeArtifactRuntimeReview;
  size?: CanvasCodeArtifactContentSize;
  restoredSize?: CanvasCodeArtifactContentSize;
  changedNodeIds?: string[];
  meaningfulChangedNodeIds?: string[];
  changeKinds?: NorthstarArtboardChangeKind[];
  requiredAssetUrls?: string[];
  loadedAssetUrls?: string[];
  missingAssetUrls?: string[];
  evidenceRegistry?: NorthstarEvidenceRegistryReceipt;
  snapshot?: NorthstarLiveSurfaceSnapshot;
  rollbackDurationMs?: number;
  candidateDurationMs?: number;
  probeId?: string;
  frameInstanceId?: string;
}

let browserRealtimeClient: ReturnType<typeof createSupabaseClient> | undefined;

function browserRealtime() {
  browserRealtimeClient ??= createSupabaseClient();
  return browserRealtimeClient;
}

async function broadcastBrowserAcknowledgement(
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
): Promise<void> {
  const client = browserRealtime();
  const channel = client.channel(
    northstarArtifactAcknowledgementChannelName(acknowledgement.artifactId),
    { config: { broadcast: { self: false, ack: true } } },
  );
  try {
    // Before subscribe, Supabase sends Broadcast over its REST transport. This
    // reaches the long-running Vercel request without relying on API affinity.
    await channel.httpSend(NORTHSTAR_ARTIFACT_ACK_EVENT, acknowledgement);
  } finally {
    await client.removeChannel(channel).catch(() => undefined);
  }
}

export interface NorthstarArtifactLifecycleEvent {
  name:
    | "revision.sent"
    | "revision.received"
    | "revision.acknowledged"
    | "revision.rejected"
    | "revision.timed_out"
    | "transport.probe_acknowledged"
    | "ack.delivery_failed"
    | "authority.surface_ready"
    | "render.health";
  artifactId: string;
  revisionId: string;
  ackToken?: string;
  proposalId?: string;
  mutationId?: string;
  browserRevisionId?: string;
  authorityState?:
    | "foundation-ready"
    | "candidate-staged"
    | "candidate-received"
    | "candidate-committed"
    | "candidate-rejected"
    | "candidate-timed-out";
  acceptedRevisionId?: string;
  candidateRevisionId?: string;
  frameInstanceId?: string;
  surfaceMountCount?: number;
  rollbackDurationMs?: number;
  candidateDurationMs?: number;
  transportPhase?: "delivery" | "application";
  transportOutcome?:
    | "probe-acknowledged"
    | "delivery-deadline-expired-before-application"
    | "frame-reloaded-before-delivery"
    | "frame-unresponsive-before-delivery"
    | "mutation-not-entered-after-live-probe"
    | "mutation-entered-without-terminal";
  payloadBytes?: number;
  firstSentAt?: number;
  deliveryDeadlineAt?: number;
  terminalDeadlineAt?: number;
  probeId?: string;
  probeAcknowledgedAt?: number;
  receivedAt?: number;
  frameLoadCount?: number;
  snapshotSanitized?: boolean;
  evidenceRegistry?: NorthstarEvidenceRegistryReceipt;
  evidenceCollisionPairs?: Array<[string, string]>;
  detail?: string;
  renderHealth?: {
    /** Operational health only. Creative-review warnings must never block construction. */
    healthy: boolean;
    operationallyHealthy: boolean;
    severity: "pass" | "warning" | "fatal";
    creativeIssueCount: number;
    visible: boolean;
    pendingImageCount: number;
    failedAssetUrls: string[];
    missingRequiredNodeIds: string[];
    overflowX: number;
    overflowY: number;
    extremeGrowth: boolean;
    evidenceRegistry?: NorthstarEvidenceRegistryReceipt;
    evidenceCollisionPairs: Array<[string, string]>;
  };
  timestamp: number;
}


export interface NorthstarCreativeActivity {
  artifactId: string;
  revisionId?: string;
  phase: "authoring" | "dispatching" | "reviewing";
  label: string;
  stageIndex?: number;
  updatedAt: number;
}

interface CodeArtifactHostProps {
  artifact?: CanvasCodeArtifactPayload;
  creativeActivity?: NorthstarCreativeActivity;
  selected: boolean;
  width: number;
  height: number;
  viewportZoom: number;
  onRequestSelect: () => void;
  onCanvasDragStart: (clientX: number, clientY: number) => void;
  onRuntimeReview: (review: CanvasCodeArtifactRuntimeReview) => void;
  onContentSize: (size: CanvasCodeArtifactContentSize) => void;
  onBrowserCommit: (commit: NorthstarBrowserCommit) => void;
  onLifecycleEvent?: (event: NorthstarArtifactLifecycleEvent) => void;
  onCanvasWheel: (input: {
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    metaKey: boolean;
  }) => void;
}

function isArtifactPointerMessage(value: unknown): value is ArtifactPointerMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArtifactPointerMessage>;
  return typeof candidate.type === "string" && candidate.type.startsWith("northstar.artifact.") && typeof candidate.artifactId === "string";
}

function surfaceIdentity(artifact?: CanvasCodeArtifactPayload): string | undefined {
  if (!artifact) return undefined;
  return artifact.surfaceId ?? artifact.artifactId;
}

function serializedMessageBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(serialized).byteLength
      : serialized.length;
  } catch {
    // Transport telemetry must never prevent the actual proposal from being sent.
    return 0;
  }
}

export function isNorthstarAuthoredSnapshotSanitized(
  snapshot?: NorthstarLiveSurfaceSnapshot,
): boolean | undefined {
  if (!snapshot) return undefined;
  const serialized = [
    snapshot.html,
    snapshot.css,
    ...Object.values(snapshot.cssLayers ?? {}),
  ].join("\n");
  return !/data-ns-runtime-(?:owned|inherited|spatial)|data-ns-spatial-system|northstar-(?:publication-presentation-state|source-owned-intrinsic-geometry)/i.test(serialized);
}

function artifactGeometry(
  artifact: CanvasCodeArtifactPayload | undefined,
  width: number,
  height: number,
  liveSize?: CanvasCodeArtifactContentSize,
) {
  const bounds = liveSize?.contentBounds ?? artifact?.intrinsicBounds;
  const measuredWidth = bounds ? Math.max(1, bounds.maxX - bounds.minX) : 1;
  const measuredHeight = bounds ? Math.max(1, bounds.maxY - bounds.minY) : 1;
  const intrinsicWidth = Math.max(1, liveSize?.intrinsicWidth ?? artifact?.preferredWidth ?? 1, measuredWidth);
  const intrinsicHeight = Math.max(1, liveSize?.intrinsicHeight ?? artifact?.preferredHeight ?? 1, measuredHeight);
  const scale = Math.max(0.01, Math.min(width / intrinsicWidth, height / intrinsicHeight));
  return {
    intrinsicWidth,
    intrinsicHeight,
    scale,
    left: (width - intrinsicWidth * scale) / 2,
    top: (height - intrinsicHeight * scale) / 2,
  };
}

function CodeArtifactHostImpl({
  artifact,
  creativeActivity,
  selected,
  width,
  height,
  viewportZoom,
  onRequestSelect,
  onCanvasDragStart,
  onRuntimeReview,
  onContentSize,
  onBrowserCommit,
  onLifecycleEvent = () => undefined,
  onCanvasWheel,
}: CodeArtifactHostProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameInstanceIdRef = useRef(
    `northstar-frame-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
  );
  const frameLoadCountRef = useRef(0);
  const surfaceMountCountRef = useRef(artifact ? 1 : 0);
  const latestArtifactRef = useRef<CanvasCodeArtifactPayload | undefined>(artifact);
  const mountedSurfaceRef = useRef<CanvasCodeArtifactPayload | undefined>(artifact);
  const appliedMutationIdsRef = useRef<Set<string>>(new Set());
  const failedMutationIdsRef = useRef<Set<string>>(new Set());
  const terminalProposalByAckTokenRef = useRef<Map<string, {
    status: "ready" | "applied" | "rejected" | "timed_out";
    revisionId: string;
    baseRevisionId?: string;
    mutationId?: string;
    settledAt: number;
  }>>(new Map());
  const ignoredLateTerminalEventsRef = useRef<Set<string>>(new Set());
  const inFlightProposalRef = useRef<{
    proposalId: string;
    ackToken: string;
    baseRevisionId?: string;
    revisionId: string;
    mutationId: string;
    received: boolean;
    receivedAt?: number;
    probeSentAt: number;
    probeDeadlineAt: number;
    firstSentAt: number;
    deliveryDeadlineAt: number;
    terminalDeadlineAt?: number;
    payloadBytes: number;
    probeId: string;
    probeAcknowledgedAt?: number;
    mutationMessage?: Record<string, unknown>;
    frameLoadCount: number;
    terminalizing: boolean;
  } | null>(null);
  const pendingAcknowledgementDeliveriesRef = useRef<Map<string, {
    acknowledgement: NorthstarArtifactMutationAcknowledgement;
    attempts: number;
    lastAttemptAt: number;
    sending: boolean;
  }>>(new Map());
  const readyRef = useRef(false);
  const browserRevisionRef = useRef<string | undefined>(artifact?.revisionId);
  const latestSizeRef = useRef<CanvasCodeArtifactContentSize | undefined>(undefined);
  const latestReviewRef = useRef<CanvasCodeArtifactRuntimeReview | undefined>(undefined);
  const lastRenderHealthFingerprintRef = useRef<string | null>(null);
  const [mountedSurface, setMountedSurface] = useState<CanvasCodeArtifactPayload | undefined>(artifact);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [liveSize, setLiveSize] = useState<CanvasCodeArtifactContentSize | undefined>(undefined);
  const liveSizeSequenceRef = useRef(-1);
  const [dragShieldActive, setDragShieldActive] = useState(false);
  const [visibleMutationLabel, setVisibleMutationLabel] = useState<string | null>(null);

  const activeSurfaceId = surfaceIdentity(artifact);
  const mountedSurfaceId = surfaceIdentity(mountedSurface);

  useEffect(() => {
    latestArtifactRef.current = artifact;
    if (!artifact) return;
    // A surface identity is a browser process boundary. Once mounted, package
    // updates and recovery actions must travel through the mutation protocol;
    // remounting the iframe would blank the board and discard its terminal
    // result cache. Only a genuinely different surface may create a new frame.
    if (!mountedSurface || activeSurfaceId !== mountedSurfaceId) {
      if (!mountedSurface || mountedSurfaceId !== activeSurfaceId) {
        surfaceMountCountRef.current += mountedSurface ? 1 : surfaceMountCountRef.current === 0 ? 1 : 0;
      }
      mountedSurfaceRef.current = artifact;
      setMountedSurface(artifact);
      appliedMutationIdsRef.current = new Set();
      failedMutationIdsRef.current = new Set();
      terminalProposalByAckTokenRef.current = new Map();
      ignoredLateTerminalEventsRef.current = new Set();
      inFlightProposalRef.current = null;
      readyRef.current = false;
      browserRevisionRef.current = artifact.revisionId;
      latestSizeRef.current = undefined;
      latestReviewRef.current = undefined;
      liveSizeSequenceRef.current = -1;
      setLiveSize(undefined);
      setSurfaceReady(false);
      setRuntimeError(null);
      setVisibleMutationLabel(null);
    }
  }, [activeSurfaceId, artifact, mountedSurface, mountedSurfaceId]);

  useEffect(() => {
    mountedSurfaceRef.current = mountedSurface;
  }, [mountedSurface]);

  const runtimeDocument = useMemo(
    () => mountedSurface ? buildCanvasArtifactRuntimeDocument(mountedSurface) : undefined,
    [mountedSurface],
  );

  const postCurrentContext = useCallback(() => {
    const current = latestArtifactRef.current;
    const frame = frameRef.current;
    if (!current || !frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      type: "northstar.artifact.update-context",
      artifactId: current.artifactId,
      revisionId: current.revisionId,
      dataBundle: current.dataBundle,
      creativeDirection: current.creativeDirection,
      creativeReviews: current.creativeReviews,
      publicationState: current.publicationState,
      provisional: current.provisional,
      allowedAssetUrls: current.dataBundle?.allowedAssetUrls ?? [],
    }, "*");
    frame.contentWindow.postMessage({
      type: "northstar.artifact.set-stage",
      artifactId: current.artifactId,
      stageIndex: current.activeStageIndex ?? 0,
    }, "*");
  }, []);

  const dispatchMutationProposal = useCallback((input: {
    proposal: NonNullable<typeof inFlightProposalRef.current>;
    batch: NorthstarArtboardMutationBatch;
    artifact: CanvasCodeArtifactPayload;
  }) => {
    const frame = frameRef.current;
    const targetWindow = frame?.contentWindow;
    if (!targetWindow) return false;
    // A proposal is delivered exactly once. Reposting the same large mutation
    // while the iframe is busy obscures the original failure boundary and can
    // build an unbounded task queue inside the sandboxed surface.
    if (input.proposal.firstSentAt > 0) return true;
    if (input.proposal.probeSentAt > 0) return true;
    const probeSentAt = Date.now();
    const mutationMessage = {
      type: "northstar.artifact.apply-mutation",
      artifactId: input.artifact.artifactId,
      surfaceId: input.artifact.surfaceId ?? input.artifact.artifactId,
      revisionId: input.artifact.revisionId,
      baseRevisionId: input.artifact.parentRevisionId,
      proposalId: input.proposal.proposalId,
      ackToken: input.proposal.ackToken,
      batch: input.batch,
      layoutBaseWidth: input.artifact.layoutBaseWidth ?? input.artifact.preferredWidth,
      layoutBaseHeight: input.artifact.layoutBaseHeight ?? input.artifact.preferredHeight,
      assetUrls: input.artifact.dataBundle?.allowedAssetUrls ?? [],
    };
    input.proposal.probeSentAt = probeSentAt;
    input.proposal.probeDeadlineAt = probeSentAt + NORTHSTAR_HEALTH_POLICY.acknowledgement.deliveryTimeoutMs;
    input.proposal.mutationMessage = mutationMessage;
    input.proposal.payloadBytes = serializedMessageBytes(mutationMessage);
    input.proposal.frameLoadCount = frameLoadCountRef.current;
    targetWindow.postMessage({
      type: "northstar.artifact.transport-probe",
      artifactId: input.artifact.artifactId,
      frameInstanceId: frameInstanceIdRef.current,
      probeId: input.proposal.probeId,
      proposalId: input.proposal.proposalId,
      ackToken: input.proposal.ackToken,
      revisionId: input.proposal.revisionId,
      mutationId: input.proposal.mutationId,
    }, "*");
    return true;
  }, [onLifecycleEvent]);

  const pumpNextMutation = useCallback(() => {
    if (!readyRef.current) return;
    const current = latestArtifactRef.current;
    if (!current || !frameRef.current?.contentWindow) return;
    const activeProposal = inFlightProposalRef.current;
    if (activeProposal) {
      if (activeProposal.ackToken === current.pendingAckToken) return;
      // An action can advance or roll back the authoritative package while an
      // old callback is queued. Never retain a proposal for another token.
      inFlightProposalRef.current = null;
    }
    const journal = [...(current.mutationJournal ?? [])].sort((a, b) => a.sequence - b.sequence);
    const next = journal.find((batch) =>
      !appliedMutationIdsRef.current.has(batch.mutationId) &&
      !failedMutationIdsRef.current.has(batch.mutationId),
    );
    if (!next) {
      setVisibleMutationLabel(null);
      return;
    }
    const ackToken = current.pendingAckToken;
    if (!ackToken) return;
    const proposalId = ackToken.split(":").at(-1) || ackToken;
    const proposal = {
      proposalId,
      ackToken,
      baseRevisionId: current.parentRevisionId,
      revisionId: current.revisionId,
      mutationId: next.mutationId,
      received: false,
      receivedAt: undefined,
      probeSentAt: 0,
      probeDeadlineAt: 0,
      firstSentAt: 0,
      deliveryDeadlineAt: 0,
      terminalDeadlineAt: undefined,
      payloadBytes: 0,
      probeId: crypto.randomUUID(),
      probeAcknowledgedAt: undefined,
      frameLoadCount: frameLoadCountRef.current,
      terminalizing: false,
    };
    inFlightProposalRef.current = proposal;
    setVisibleMutationLabel(next.label);
    dispatchMutationProposal({ proposal, batch: next, artifact: current });
  }, [dispatchMutationProposal]);

  useEffect(() => {
    if (!artifact || activeSurfaceId !== mountedSurfaceId) return;
    postCurrentContext();
    pumpNextMutation();
  }, [activeSurfaceId, artifact, artifact?.activeStageIndex, artifact?.revisionId, artifact?.mutationJournal, mountedSurfaceId, postCurrentContext, pumpNextMutation]);

  const deliverAcknowledgement = useCallback(async (
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): Promise<void> => {
    const deliveries = await Promise.allSettled([
      broadcastBrowserAcknowledgement(acknowledgement),
      (async () => {
        const response = await fetch("/api/canvas-ai/artifact-ack", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(acknowledgement),
          cache: "no-store",
          keepalive: true,
        });
        if (!response.ok) throw new Error(`Live artboard acknowledgement failed with ${response.status}.`);
      })(),
    ]);
    if (deliveries.every((delivery) => delivery.status === "rejected")) {
      const failure = deliveries.find((delivery) => delivery.status === "rejected");
      throw failure?.status === "rejected" && failure.reason instanceof Error
        ? failure.reason
        : new Error("Live artboard acknowledgement transport failed.");
    }
  }, []);

  const postAcknowledgement = useCallback(async (input: {
    status: "applied" | "rejected" | "ready";
    message: ArtifactPointerMessage;
    reason?: string;
    proposal?: NonNullable<typeof inFlightProposalRef.current>;
    browserRevisionId?: string;
    terminalStatus?: "ready" | "applied" | "rejected" | "timed_out";
    lifecycleName?: "revision.acknowledged" | "revision.rejected" | "revision.timed_out";
    authorityState?: "foundation-ready" | "candidate-committed" | "candidate-rejected" | "candidate-timed-out";
    transportPhase?: NorthstarArtifactLifecycleEvent["transportPhase"];
    transportOutcome?: NorthstarArtifactLifecycleEvent["transportOutcome"];
  }) => {
    const latest = latestArtifactRef.current;
    const mounted = mountedSurfaceRef.current;
    const inFlight = input.proposal ?? inFlightProposalRef.current;
    const isFoundationReady = input.status === "ready" && !input.message.mutationId;

    // The acknowledgement belongs to the exact mounted browser event. Later
    // React props may already contain the next speculative package, so they must
    // never supply proposal identity for the event currently being acknowledged.
    const ackToken = input.message.ackToken
      ?? (!isFoundationReady ? inFlight?.ackToken : mounted?.pendingAckToken);
    const proposalId = input.message.proposalId
      ?? (!isFoundationReady ? inFlight?.proposalId : undefined)
      ?? (ackToken ? ackToken.split(":").at(-1) || ackToken : undefined);
    const current = mounted ?? latest;
    const revisionId = input.message.revisionId
      ?? (!isFoundationReady ? inFlight?.revisionId : current?.revisionId);

    if (!current || !ackToken || !proposalId || !revisionId) return;

    const priorTerminal = terminalProposalByAckTokenRef.current.get(ackToken);
    if (priorTerminal) {
      const lateEventKey = `${ackToken}:${input.status}:${input.message.mutationId ?? "none"}`;
      if (!ignoredLateTerminalEventsRef.current.has(lateEventKey)) {
        ignoredLateTerminalEventsRef.current.add(lateEventKey);
        onLifecycleEvent({
          name: "revision.received",
          artifactId: current.artifactId,
          revisionId,
          ackToken,
          proposalId,
          mutationId: input.message.mutationId ?? inFlight?.mutationId,
          browserRevisionId: input.browserRevisionId ?? input.message.browserRevisionId ?? browserRevisionRef.current,
          detail: priorTerminal.status === "timed_out"
            ? `Ignored a late ${input.status} receipt after proposal ${proposalId} had already timed out and been rolled back.`
            : `Ignored a duplicate terminal ${input.status} receipt for proposal ${proposalId}.`,
          timestamp: Date.now(),
        });
      }
      return;
    }

    // Applied events must be emitted by the exact candidate revision currently
    // mounted. Rejected events are different: the runtime atomically rolls the
    // DOM back before posting its terminal receipt, so the browser revision is
    // expected to be the proposal base while the receipt revision remains the
    // rejected candidate.
    const observedBrowserRevision = input.browserRevisionId
      ?? input.message.browserRevisionId
      ?? browserRevisionRef.current;
    const rejectedEnvelopeIsExact = input.status === "rejected"
      && Boolean(inFlight)
      && revisionId === inFlight?.revisionId
      && (input.message.mutationId ?? inFlight?.mutationId) === inFlight?.mutationId
      && (observedBrowserRevision === inFlight?.baseRevisionId || observedBrowserRevision === inFlight?.revisionId);
    const appliedEnvelopeIsExact = input.status !== "rejected" && observedBrowserRevision === revisionId;
    if (!isFoundationReady && !rejectedEnvelopeIsExact && !appliedEnvelopeIsExact) {
      onLifecycleEvent({
        name: "revision.received",
        artifactId: current.artifactId,
        revisionId,
        ackToken,
        proposalId,
        mutationId: input.message.mutationId ?? inFlight?.mutationId,
        browserRevisionId: observedBrowserRevision,
        detail: `Ignored stale terminal browser report for ${revisionId}; mounted browser revision is ${observedBrowserRevision ?? "unknown"}.`,
        timestamp: Date.now(),
      });
      return;
    }

    const acknowledgement: NorthstarArtifactMutationAcknowledgement = {
      schema: "northstar.artboard-ack.v1",
      proposalId,
      ackToken,
      baseRevisionId: input.message.baseRevisionId
        ?? (!isFoundationReady ? inFlight?.baseRevisionId : current.parentRevisionId),
      artifactId: current.artifactId,
      surfaceId: current.surfaceId ?? current.artifactId,
      revisionId,
      browserRevisionId: observedBrowserRevision,
      mutationId: input.message.mutationId
        ?? (!isFoundationReady ? inFlight?.mutationId : undefined),
      status: input.status,
      reason: input.reason,
      size: input.message.size ?? latestSizeRef.current,
      review: input.message.review ?? latestReviewRef.current,
      changedNodeIds: input.message.changedNodeIds ?? [],
      meaningfulChangedNodeIds: input.message.meaningfulChangedNodeIds ?? [],
      changeKinds: input.message.changeKinds ?? [],
      requiredAssetUrls: input.message.requiredAssetUrls ?? [],
      loadedAssetUrls: input.message.loadedAssetUrls ?? [],
      missingAssetUrls: input.message.missingAssetUrls ?? [],
      evidenceRegistry: input.message.evidenceRegistry ?? input.message.review?.evidenceRegistry,
      snapshot: input.message.snapshot,
      rollbackDurationMs: input.message.rollbackDurationMs,
      candidateDurationMs: input.message.candidateDurationMs,
      snapshotSanitized: isNorthstarAuthoredSnapshotSanitized(input.message.snapshot),
      acknowledgedAt: new Date().toISOString(),
    };

    terminalProposalByAckTokenRef.current.set(acknowledgement.ackToken, {
      status: input.terminalStatus ?? acknowledgement.status,
      revisionId: acknowledgement.revisionId,
      baseRevisionId: acknowledgement.baseRevisionId,
      mutationId: acknowledgement.mutationId,
      settledAt: Date.now(),
    });
    if (terminalProposalByAckTokenRef.current.size > 120) {
      const oldestToken = terminalProposalByAckTokenRef.current.keys().next().value;
      if (oldestToken) terminalProposalByAckTokenRef.current.delete(oldestToken);
    }

    // Broadcast is ephemeral. Retain the exact idempotent terminal message until
    // React receives the committed package and clears this proposal token.
    const delivery = {
      acknowledgement,
      attempts: 1,
      lastAttemptAt: Date.now(),
      sending: true,
    };
    pendingAcknowledgementDeliveriesRef.current.set(acknowledgement.ackToken, delivery);
    if (pendingAcknowledgementDeliveriesRef.current.size > 80) {
      const oldestToken = pendingAcknowledgementDeliveriesRef.current.keys().next().value;
      if (oldestToken) pendingAcknowledgementDeliveriesRef.current.delete(oldestToken);
    }
    try {
      await deliverAcknowledgement(acknowledgement);
      pendingAcknowledgementDeliveriesRef.current.delete(acknowledgement.ackToken);
      const lifecycleName = input.lifecycleName
        ?? (acknowledgement.status === "rejected" ? "revision.rejected" : "revision.acknowledged");
      const authorityState = input.authorityState
        ?? (acknowledgement.status === "rejected"
          ? "candidate-rejected"
          : isFoundationReady
            ? "foundation-ready"
            : "candidate-committed");
      onLifecycleEvent({
        name: lifecycleName,
        artifactId: acknowledgement.artifactId,
        revisionId: acknowledgement.revisionId,
        ackToken: acknowledgement.ackToken,
        proposalId: acknowledgement.proposalId,
        mutationId: acknowledgement.mutationId,
        browserRevisionId: observedBrowserRevision,
        authorityState,
        acceptedRevisionId: acknowledgement.status === "rejected"
          ? observedBrowserRevision
          : acknowledgement.revisionId,
        candidateRevisionId: isFoundationReady ? undefined : acknowledgement.revisionId,
        frameInstanceId: frameInstanceIdRef.current,
        surfaceMountCount: surfaceMountCountRef.current,
        rollbackDurationMs: acknowledgement.rollbackDurationMs,
        candidateDurationMs: acknowledgement.candidateDurationMs,
        snapshotSanitized: acknowledgement.snapshotSanitized,
        evidenceRegistry: acknowledgement.evidenceRegistry,
        evidenceCollisionPairs: acknowledgement.review?.evidenceCollisionPairs,
        transportPhase: input.transportPhase ?? (lifecycleName === "revision.timed_out"
          ? (inFlight?.received ? "application" : "delivery")
          : undefined),
        transportOutcome: input.transportOutcome ?? (lifecycleName === "revision.timed_out"
          ? inFlight?.received
            ? "mutation-entered-without-terminal"
            : inFlight?.probeAcknowledgedAt
              ? "mutation-not-entered-after-live-probe"
              : "frame-unresponsive-before-delivery"
          : undefined),
        payloadBytes: inFlight?.payloadBytes,
        firstSentAt: inFlight?.firstSentAt,
        deliveryDeadlineAt: inFlight?.deliveryDeadlineAt,
        terminalDeadlineAt: inFlight?.terminalDeadlineAt,
        probeId: inFlight?.probeId,
        probeAcknowledgedAt: inFlight?.probeAcknowledgedAt,
        receivedAt: inFlight?.receivedAt,
        frameLoadCount: inFlight?.frameLoadCount,
        detail: acknowledgement.reason,
        timestamp: Date.now(),
      });
    } catch (error) {
      onLifecycleEvent({
        name: "ack.delivery_failed",
        artifactId: acknowledgement.artifactId,
        revisionId: acknowledgement.revisionId,
        ackToken: acknowledgement.ackToken,
        proposalId: acknowledgement.proposalId,
        mutationId: acknowledgement.mutationId,
        browserRevisionId: browserRevisionRef.current,
        authorityState: acknowledgement.status === "rejected"
          ? "candidate-rejected"
          : isFoundationReady
            ? "foundation-ready"
            : "candidate-committed",
        acceptedRevisionId: acknowledgement.status === "rejected"
          ? observedBrowserRevision
          : acknowledgement.revisionId,
        candidateRevisionId: isFoundationReady ? undefined : acknowledgement.revisionId,
        frameInstanceId: frameInstanceIdRef.current,
        surfaceMountCount: surfaceMountCountRef.current,
        rollbackDurationMs: acknowledgement.rollbackDurationMs,
        candidateDurationMs: acknowledgement.candidateDurationMs,
        snapshotSanitized: acknowledgement.snapshotSanitized,
        evidenceRegistry: acknowledgement.evidenceRegistry,
        evidenceCollisionPairs: acknowledgement.review?.evidenceCollisionPairs,
        detail: error instanceof Error ? error.message : "Acknowledgement delivery failed.",
        timestamp: Date.now(),
      });
      throw error;
    } finally {
      const pending = pendingAcknowledgementDeliveriesRef.current.get(acknowledgement.ackToken);
      if (pending) pending.sending = false;
    }
  }, [deliverAcknowledgement, onLifecycleEvent]);

  useEffect(() => {
    // A successful REST Broadcast response means accepted by the broker, not
    // observed by the long-running route. Redeliver while the exact proposal is
    // still pending so a brief Realtime reconnect cannot lose the only result.
    const interval = window.setInterval(() => {
      for (const [ackToken, pending] of pendingAcknowledgementDeliveriesRef.current) {
        const retryDelay = Math.min(15_000, 500 * (2 ** Math.min(pending.attempts, 5)));
        if (pending.sending || Date.now() - pending.lastAttemptAt < retryDelay) continue;
        pending.sending = true;
        pending.attempts += 1;
        pending.lastAttemptAt = Date.now();
        void deliverAcknowledgement(pending.acknowledgement)
          .then(() => pendingAcknowledgementDeliveriesRef.current.delete(ackToken))
          .catch((error: unknown) => console.warn("Northstar acknowledgement redelivery remains queued.", error))
          .finally(() => {
            const active = pendingAcknowledgementDeliveriesRef.current.get(ackToken);
            if (active) active.sending = false;
          });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [deliverAcknowledgement]);

  useEffect(() => {
    // Never blind-replay a mutation. A single immutable delivery deadline
    // distinguishes an unreachable frame from a mutation that entered the
    // runtime but failed to settle, without filling the iframe task queue.
    const interval = window.setInterval(() => {
      const proposal = inFlightProposalRef.current;
      const current = latestArtifactRef.current;
      if (!proposal || !current || !readyRef.current) return;
      if (current.pendingAckToken !== proposal.ackToken) {
        inFlightProposalRef.current = null;
        pumpNextMutation();
        return;
      }
      if (proposal.terminalizing || proposal.probeSentAt <= 0) return;
      const now = Date.now();
      const deadlineAt = proposal.received
        ? proposal.terminalDeadlineAt
        : proposal.firstSentAt > 0
          ? proposal.deliveryDeadlineAt
          : proposal.probeDeadlineAt;
      if (!deadlineAt || now <= deadlineAt) return;

      proposal.terminalizing = true;
      failedMutationIdsRef.current.add(proposal.mutationId);
      const transportOutcome = proposal.received
        ? "mutation-entered-without-terminal"
        : frameLoadCountRef.current !== proposal.frameLoadCount
          ? "frame-reloaded-before-delivery"
          : proposal.probeAcknowledgedAt
            ? "mutation-not-entered-after-live-probe"
            : "frame-unresponsive-before-delivery";
      const reasonCode = transportOutcome === "mutation-entered-without-terminal"
        ? "NORTHSTAR_TRANSPORT_MUTATION_ENTERED_WITHOUT_TERMINAL"
        : transportOutcome === "frame-reloaded-before-delivery"
          ? "NORTHSTAR_TRANSPORT_FRAME_RELOADED_BEFORE_DELIVERY"
          : transportOutcome === "mutation-not-entered-after-live-probe"
            ? "NORTHSTAR_TRANSPORT_MUTATION_NOT_ENTERED_AFTER_LIVE_PROBE"
            : "NORTHSTAR_TRANSPORT_FRAME_UNRESPONSIVE_BEFORE_DELIVERY";
      const detail = proposal.received
        ? `${reasonCode}: The runtime received proposal ${proposal.proposalId} but did not return a terminal result within ${NORTHSTAR_HEALTH_POLICY.acknowledgement.terminalTimeoutMs}ms.`
        : `${reasonCode}: The runtime did not enter proposal ${proposal.proposalId} within ${NORTHSTAR_HEALTH_POLICY.acknowledgement.deliveryTimeoutMs}ms.`;

      if (proposal.received) {
        frameRef.current?.contentWindow?.postMessage({
          type: "northstar.artifact.cancel-mutation",
          artifactId: current.artifactId,
          surfaceId: current.surfaceId ?? current.artifactId,
          revisionId: proposal.revisionId,
          baseRevisionId: proposal.baseRevisionId,
          proposalId: proposal.proposalId,
          ackToken: proposal.ackToken,
          mutationId: proposal.mutationId,
          reason: "HOST_TERMINAL_TIMEOUT",
        }, "*");
      }

      void postAcknowledgement({
        status: "rejected",
        terminalStatus: "timed_out",
        lifecycleName: "revision.timed_out",
        authorityState: "candidate-timed-out",
        transportPhase: proposal.received ? "application" : "delivery",
        transportOutcome,
        proposal,
        browserRevisionId: proposal.baseRevisionId ?? browserRevisionRef.current,
        reason: detail,
        message: {
          type: "northstar.artifact.mutation-rejected",
          artifactId: current.artifactId,
          surfaceId: current.surfaceId ?? current.artifactId,
          revisionId: proposal.revisionId,
          browserRevisionId: proposal.baseRevisionId ?? browserRevisionRef.current,
          baseRevisionId: proposal.baseRevisionId,
          proposalId: proposal.proposalId,
          ackToken: proposal.ackToken,
          mutationId: proposal.mutationId,
          message: detail,
          review: latestReviewRef.current,
          size: latestSizeRef.current,
        },
      }).catch((error: unknown) => {
        console.warn("Northstar could not publish the transport containment receipt; the accepted artboard remains mounted.", error);
      }).finally(() => {
        if (inFlightProposalRef.current?.ackToken === proposal.ackToken) {
          inFlightProposalRef.current = null;
        }
        setVisibleMutationLabel("Northstar preserved the last verified artboard");
      });
    }, NORTHSTAR_HEALTH_POLICY.acknowledgement.pumpIntervalMs);
    return () => window.clearInterval(interval);
  }, [postAcknowledgement, pumpNextMutation]);

  useEffect(() => {
    if (!dragShieldActive) return;
    const release = () => setDragShieldActive(false);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
    };
  }, [dragShieldActive]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isArtifactPointerMessage(event.data) || event.source !== frameRef.current?.contentWindow) return;
      const current = latestArtifactRef.current;
      if (!current || event.data.artifactId !== current.artifactId) return;

      if (event.data.type === "northstar.artifact.transport-probe-ack") {
        const proposal = inFlightProposalRef.current;
        if (
          proposal
          && !proposal.terminalizing
          && event.data.probeId === proposal.probeId
          && event.data.ackToken === proposal.ackToken
          && event.data.proposalId === proposal.proposalId
          && event.data.mutationId === proposal.mutationId
          && event.data.frameInstanceId === frameInstanceIdRef.current
        ) {
          proposal.probeAcknowledgedAt = Date.now();
          if (proposal.firstSentAt <= 0 && proposal.mutationMessage) {
            const targetWindow = frameRef.current?.contentWindow;
            if (targetWindow) {
              const firstSentAt = Date.now();
              const deliveryDeadlineAt = firstSentAt + NORTHSTAR_HEALTH_POLICY.acknowledgement.deliveryTimeoutMs;
              const mutationMessage = { ...proposal.mutationMessage, deliveryDeadlineAt };
              proposal.firstSentAt = firstSentAt;
              proposal.deliveryDeadlineAt = deliveryDeadlineAt;
              proposal.payloadBytes = serializedMessageBytes(mutationMessage);
              targetWindow.postMessage(mutationMessage, "*");
              onLifecycleEvent({
                name: "revision.sent",
                artifactId: current.artifactId,
                revisionId: proposal.revisionId,
                ackToken: proposal.ackToken,
                proposalId: proposal.proposalId,
                mutationId: proposal.mutationId,
                browserRevisionId: browserRevisionRef.current,
                authorityState: "candidate-staged",
                acceptedRevisionId: browserRevisionRef.current,
                candidateRevisionId: proposal.revisionId,
                frameInstanceId: frameInstanceIdRef.current,
                surfaceMountCount: surfaceMountCountRef.current,
                payloadBytes: proposal.payloadBytes,
                firstSentAt,
                deliveryDeadlineAt,
                probeId: proposal.probeId,
                probeAcknowledgedAt: proposal.probeAcknowledgedAt,
                frameLoadCount: proposal.frameLoadCount,
                timestamp: firstSentAt,
              });
            }
          }
          onLifecycleEvent({
            name: "transport.probe_acknowledged",
            artifactId: current.artifactId,
            revisionId: proposal.revisionId,
            ackToken: proposal.ackToken,
            proposalId: proposal.proposalId,
            mutationId: proposal.mutationId,
            browserRevisionId: browserRevisionRef.current,
            authorityState: "candidate-staged",
            acceptedRevisionId: browserRevisionRef.current,
            candidateRevisionId: proposal.revisionId,
            frameInstanceId: frameInstanceIdRef.current,
            surfaceMountCount: surfaceMountCountRef.current,
            transportPhase: "delivery",
            transportOutcome: "probe-acknowledged",
            payloadBytes: proposal.payloadBytes,
            firstSentAt: proposal.firstSentAt,
            deliveryDeadlineAt: proposal.deliveryDeadlineAt,
            probeId: proposal.probeId,
            probeAcknowledgedAt: proposal.probeAcknowledgedAt,
            frameLoadCount: proposal.frameLoadCount,
            timestamp: proposal.probeAcknowledgedAt,
          });
        }
        return;
      }

      const terminalForEvent = event.data.ackToken
        ? terminalProposalByAckTokenRef.current.get(event.data.ackToken)
        : undefined;
      if (
        terminalForEvent?.status === "timed_out"
        && (event.data.type === "northstar.artifact.mutation-applied"
          || event.data.type === "northstar.artifact.mutation-rejected"
          || event.data.type === "northstar.artifact.mutation-received"
          || event.data.type === "northstar.artifact.runtime-error")
      ) {
        const lateEventKey = `${event.data.ackToken}:${event.data.type}:${event.data.mutationId ?? "none"}`;
        if (!ignoredLateTerminalEventsRef.current.has(lateEventKey)) {
          ignoredLateTerminalEventsRef.current.add(lateEventKey);
          onLifecycleEvent({
            name: "revision.received",
            artifactId: current.artifactId,
            revisionId: event.data.revisionId ?? terminalForEvent.revisionId,
            ackToken: event.data.ackToken,
            proposalId: event.data.proposalId,
            mutationId: event.data.mutationId,
            browserRevisionId: event.data.browserRevisionId ?? browserRevisionRef.current,
            detail: `Ignored ${event.data.type} because the exact proposal had already reached the strict timed-out terminal state.`,
            timestamp: Date.now(),
          });
        }
        frameRef.current?.contentWindow?.postMessage({
          type: "northstar.artifact.cancel-mutation",
          artifactId: current.artifactId,
          surfaceId: current.surfaceId ?? current.artifactId,
          revisionId: terminalForEvent.revisionId,
          baseRevisionId: terminalForEvent.baseRevisionId,
          ackToken: event.data.ackToken,
          proposalId: event.data.proposalId,
          mutationId: terminalForEvent.mutationId ?? event.data.mutationId,
          reason: "LATE_TERMINAL_RECEIPT",
        }, "*");
        if (terminalForEvent.baseRevisionId) browserRevisionRef.current = terminalForEvent.baseRevisionId;
        return;
      }



      if (event.data.type === "northstar.artifact.ready") {
        for (const id of event.data.appliedMutationIds ?? []) appliedMutationIdsRef.current.add(id);
        // Ready with a mutation id is provisional. Only mutation-applied or
        // mutation-rejected may publish geometry and settle that exact proposal.
        const hasPendingMutation = Boolean(
          current.pendingAckToken
          && (current.mutationJournal ?? []).some((batch) =>
            !appliedMutationIdsRef.current.has(batch.mutationId)
            && !failedMutationIdsRef.current.has(batch.mutationId),
          ),
        );
        let acceptedReadySize: CanvasCodeArtifactContentSize | undefined;
        if (event.data.size) {
          acceptedReadySize = acceptNorthstarContentSize({
            candidate: event.data.size,
            artifactId: current.artifactId,
            revisionId: event.data.revisionId ?? current.revisionId,
            previous: latestSizeRef.current,
            previousIntrinsicWidth: current.preferredWidth,
            previousIntrinsicHeight: current.preferredHeight,
            allowEqualSequence: true,
          });
          if (acceptedReadySize) {
            latestSizeRef.current = acceptedReadySize;
            liveSizeSequenceRef.current = Math.max(liveSizeSequenceRef.current, acceptedReadySize.sequence ?? -1);
            if (!event.data.mutationId && !hasPendingMutation) {
              setLiveSize(acceptedReadySize);
            }
          }
        }
        if (event.data.review) latestReviewRef.current = event.data.review;
        readyRef.current = true;
        browserRevisionRef.current = event.data.revisionId ?? current.revisionId;
        setSurfaceReady(true);
        setRuntimeError(null);
        onLifecycleEvent({
          name: "authority.surface_ready",
          artifactId: current.artifactId,
          revisionId: event.data.revisionId ?? current.revisionId,
          browserRevisionId: event.data.revisionId ?? current.revisionId,
          authorityState: "foundation-ready",
          acceptedRevisionId: event.data.revisionId ?? current.revisionId,
          frameInstanceId: frameInstanceIdRef.current,
          surfaceMountCount: surfaceMountCountRef.current,
          snapshotSanitized: isNorthstarAuthoredSnapshotSanitized(event.data.snapshot),
          evidenceRegistry: event.data.evidenceRegistry ?? event.data.review?.evidenceRegistry,
          evidenceCollisionPairs: event.data.review?.evidenceCollisionPairs,
          timestamp: Date.now(),
        });
        postCurrentContext();
        if (!event.data.mutationId && !hasPendingMutation) {
          const readyMessage = acceptedReadySize
            ? { ...event.data, size: acceptedReadySize }
            : event.data;
          onBrowserCommit({
            artifactId: event.data.artifactId,
            revisionId: event.data.revisionId ?? current.revisionId,
            size: acceptedReadySize,
            review: event.data.review,
            snapshot: event.data.snapshot,
          });
          void postAcknowledgement({ status: "ready", message: readyMessage })
            .then(() => window.setTimeout(pumpNextMutation, 40))
            .catch((error: unknown) => {
              console.warn("Northstar foundation acknowledgement transport failed; the mounted artboard remains locally usable.", error);
              setVisibleMutationLabel(null);
            });
        } else {
          pumpNextMutation();
        }
        return;
      }

      if (event.data.type === "northstar.artifact.mutation-received") {
        const proposal = inFlightProposalRef.current;
        if (
          proposal
          && event.data.ackToken === proposal.ackToken
          && event.data.proposalId === proposal.proposalId
          && event.data.mutationId === proposal.mutationId
        ) {
          proposal.received = true;
          proposal.receivedAt = Date.now();
          proposal.terminalDeadlineAt = proposal.receivedAt
            + NORTHSTAR_HEALTH_POLICY.acknowledgement.terminalTimeoutMs;
          onLifecycleEvent({
            name: "revision.received",
            artifactId: current.artifactId,
            revisionId: proposal.revisionId,
            ackToken: proposal.ackToken,
            proposalId: proposal.proposalId,
            mutationId: proposal.mutationId,
            browserRevisionId: browserRevisionRef.current,
            authorityState: "candidate-received",
            acceptedRevisionId: browserRevisionRef.current,
            candidateRevisionId: proposal.revisionId,
            frameInstanceId: frameInstanceIdRef.current,
            surfaceMountCount: surfaceMountCountRef.current,
            transportPhase: "delivery",
            payloadBytes: proposal.payloadBytes,
            firstSentAt: proposal.firstSentAt,
            deliveryDeadlineAt: proposal.deliveryDeadlineAt,
            terminalDeadlineAt: proposal.terminalDeadlineAt,
            probeId: proposal.probeId,
            probeAcknowledgedAt: proposal.probeAcknowledgedAt,
            receivedAt: proposal.receivedAt,
            frameLoadCount: proposal.frameLoadCount,
            timestamp: proposal.receivedAt,
          });
        }
        return;
      }

      if (event.data.type === "northstar.artifact.runtime-error") {
        if (event.data.mutationId) {
          failedMutationIdsRef.current.add(event.data.mutationId);
          const failedProposal = inFlightProposalRef.current?.mutationId === event.data.mutationId
            ? inFlightProposalRef.current
            : undefined;
          const rollbackRevisionId = failedProposal?.baseRevisionId ?? event.data.browserRevisionId;
          if (rollbackRevisionId) browserRevisionRef.current = rollbackRevisionId;
          setVisibleMutationLabel("Repairing an invalid adjustment on this same artboard");
          void postAcknowledgement({
            status: "rejected",
            message: {
              ...event.data,
              revisionId: failedProposal?.revisionId ?? event.data.revisionId,
              baseRevisionId: failedProposal?.baseRevisionId ?? event.data.baseRevisionId,
              proposalId: failedProposal?.proposalId ?? event.data.proposalId,
              ackToken: failedProposal?.ackToken ?? event.data.ackToken,
              mutationId: failedProposal?.mutationId ?? event.data.mutationId,
              browserRevisionId: rollbackRevisionId,
            },
            proposal: failedProposal,
            browserRevisionId: rollbackRevisionId,
            reason: event.data.message || "Runtime mutation error.",
          })
            .then(() => {
              if (failedProposal && inFlightProposalRef.current?.ackToken === failedProposal.ackToken) {
                inFlightProposalRef.current = null;
              }
              setVisibleMutationLabel(null);
            })
            .catch((error: unknown) => {
              console.warn("Northstar could not report the rejected mutation; the rolled-back artboard remains locally usable.", error);
              if (failedProposal && inFlightProposalRef.current?.ackToken === failedProposal.ackToken) {
                inFlightProposalRef.current = null;
              }
              setVisibleMutationLabel(null);
            });
        } else {
          // Preserve the last painted DOM. Runtime telemetry must never cover a
          // usable artboard with a fatal overlay or trigger an iframe remount.
          console.warn("Northstar runtime reported a non-transaction fault; the last painted artboard remains visible.", event.data.message);
          setSurfaceReady(true);
        }
        return;
      }

      if (event.data.type === "northstar.artifact.content-size" && event.data.size) {
        const acceptedSize = acceptNorthstarContentSize({
          candidate: event.data.size,
          artifactId: current.artifactId,
          revisionId: event.data.revisionId ?? current.revisionId,
          previous: latestSizeRef.current,
          previousIntrinsicWidth: current.preferredWidth,
          previousIntrinsicHeight: current.preferredHeight,
        });
        if (!acceptedSize) return;
        liveSizeSequenceRef.current = acceptedSize.sequence ?? liveSizeSequenceRef.current + 1;
        latestSizeRef.current = acceptedSize;
        const canonicalRuntimeUpdate =
          acceptedSize.measurementMode === "isolated-compiler"
          && acceptedSize.settled === true
          && !inFlightProposalRef.current
          && (event.data.revisionId ?? current.revisionId) === (browserRevisionRef.current ?? current.revisionId);
        if (canonicalRuntimeUpdate) {
          setLiveSize(acceptedSize);
          onContentSize(acceptedSize);
        }
        return;
      }

      if (event.data.type === "northstar.artifact.runtime-review" && event.data.review) {
        latestReviewRef.current = event.data.review;
        onRuntimeReview(event.data.review);
        const review = event.data.review;
        const pendingImageCount = review.pendingImageCount ?? 0;
        const failedAssetUrls = review.failedAssetUrls ?? [];
        const missingRequiredNodeIds = review.missingRequiredNodeIds ?? [];
        const visible = review.visible !== false;
        const extremeGrowth = review.extremeGrowth === true;
        const operationallyHealthy = review.healthy ?? (
          visible
          && pendingImageCount === 0
          && failedAssetUrls.length === 0
          && (review.missingImageCount ?? 0) === 0
          && missingRequiredNodeIds.length === 0
          && extremeGrowth === false
          && (review.hardFailureCount ?? 0) === 0
          && (review.missingRequiredAssetCount ?? 0) === 0
        );
        const creativeIssueCount =
          (review.overflowElementCount ?? 0)
          + (review.clippedTextCount ?? 0)
          + (review.smallTextCount ?? 0)
          + (review.tinyInteractiveCount ?? 0)
          + (review.documentScrollRisk ? 1 : 0);
        const severity = operationallyHealthy
          ? (creativeIssueCount > 0 ? "warning" : "pass")
          : "fatal";
        const revisionId = review.revisionId || browserRevisionRef.current || current.revisionId;
        const fingerprint = JSON.stringify({
          artifactId: current.artifactId,
          revisionId,
          operationallyHealthy,
          severity,
          creativeIssueCount,
          visible,
          pendingImageCount,
          failedAssetUrls,
          missingRequiredNodeIds,
          overflowX: review.overflowX ?? 0,
          overflowY: review.overflowY ?? 0,
          extremeGrowth,
          evidenceRegistry: review.evidenceRegistry,
          evidenceCollisionPairs: review.evidenceCollisionPairs ?? [],
        });
        if (lastRenderHealthFingerprintRef.current !== fingerprint) {
          lastRenderHealthFingerprintRef.current = fingerprint;
          onLifecycleEvent({
            name: "render.health",
            artifactId: current.artifactId,
            revisionId,
            browserRevisionId: browserRevisionRef.current,
            detail: operationallyHealthy && creativeIssueCount > 0
              ? `${review.summary} Construction may continue; these are refinement warnings.`
              : review.summary,
            renderHealth: {
              healthy: operationallyHealthy,
              operationallyHealthy,
              severity,
              creativeIssueCount,
              visible,
              pendingImageCount,
              failedAssetUrls,
              missingRequiredNodeIds,
              overflowX: review.overflowX ?? 0,
              overflowY: review.overflowY ?? 0,
              extremeGrowth,
              evidenceRegistry: review.evidenceRegistry,
              evidenceCollisionPairs: review.evidenceCollisionPairs ?? [],
            },
            authorityState: inFlightProposalRef.current
              ? "candidate-received"
              : "foundation-ready",
            acceptedRevisionId: browserRevisionRef.current,
            candidateRevisionId: inFlightProposalRef.current?.revisionId,
            frameInstanceId: frameInstanceIdRef.current,
            surfaceMountCount: surfaceMountCountRef.current,
            evidenceRegistry: review.evidenceRegistry,
            evidenceCollisionPairs: review.evidenceCollisionPairs,
            timestamp: Date.now(),
          });
        }
        return;
      }

      if (event.data.type === "northstar.artifact.mutation-rejected") {
        // The runtime has already rolled the DOM back, but the terminal receipt
        // must retain the rejected candidate identity. Capture the proposal
        // before clearing it and acknowledge the candidate revision while
        // reporting the rolled-back browser revision separately.
        if (event.data.mutationId) failedMutationIdsRef.current.add(event.data.mutationId);
        const rejectedProposal = inFlightProposalRef.current;
        const rollbackRevisionId = event.data.browserRevisionId ?? rejectedProposal?.baseRevisionId;
        // Settlement is locally authoritative before any network delivery. A
        // subsequent render capture or proposal must never observe the rejected
        // candidate revision while its acknowledgement is in flight.
        if (rollbackRevisionId) browserRevisionRef.current = rollbackRevisionId;
        if (event.data.restoredSize && rollbackRevisionId) {
          const restoredSize = acceptNorthstarContentSize({
            candidate: event.data.restoredSize,
            artifactId: current.artifactId,
            revisionId: rollbackRevisionId,
            previous: latestSizeRef.current,
            previousIntrinsicWidth: current.preferredWidth,
            previousIntrinsicHeight: current.preferredHeight,
            allowEqualSequence: true,
          });
          if (restoredSize) {
            latestSizeRef.current = restoredSize;
            liveSizeSequenceRef.current = Math.max(liveSizeSequenceRef.current, restoredSize.sequence ?? -1);
            setLiveSize(restoredSize);
            // Restore the outer Canvas geometry together with the iframe DOM.
            // A mechanically failed atomic action must leave no speculative
            // width, height, or position behind.
            onContentSize(restoredSize);
          }
        }
        if (event.data.review) { latestReviewRef.current = event.data.review; onRuntimeReview(event.data.review); }
        setVisibleMutationLabel("Northstar is repairing this rejected adjustment");
        const transportDeadlineExpired = event.data.message?.startsWith(
          "NORTHSTAR_TRANSPORT_DELIVERY_DEADLINE_EXPIRED",
        ) === true;
        void postAcknowledgement({
          status: "rejected",
          terminalStatus: transportDeadlineExpired ? "timed_out" : undefined,
          lifecycleName: transportDeadlineExpired ? "revision.timed_out" : undefined,
          authorityState: transportDeadlineExpired ? "candidate-timed-out" : undefined,
          transportPhase: transportDeadlineExpired ? "delivery" : undefined,
          transportOutcome: transportDeadlineExpired
            ? "delivery-deadline-expired-before-application"
            : undefined,
          message: {
            ...event.data,
            revisionId: rejectedProposal?.revisionId ?? event.data.revisionId,
            baseRevisionId: rejectedProposal?.baseRevisionId ?? event.data.baseRevisionId,
            proposalId: rejectedProposal?.proposalId ?? event.data.proposalId,
            ackToken: rejectedProposal?.ackToken ?? event.data.ackToken,
            mutationId: rejectedProposal?.mutationId ?? event.data.mutationId,
            browserRevisionId: rollbackRevisionId,
          },
          proposal: rejectedProposal ?? undefined,
          browserRevisionId: rollbackRevisionId,
          reason: event.data.message || "The live runtime rejected the adjustment.",
        })
          .then(() => {
            if (rejectedProposal && inFlightProposalRef.current?.ackToken === rejectedProposal.ackToken) {
              browserRevisionRef.current = rejectedProposal.baseRevisionId;
              inFlightProposalRef.current = null;
            }
            setVisibleMutationLabel(null);
          })
          .catch((error: unknown) => {
            console.warn("Northstar acknowledgement transport failed; the runtime rollback remains authoritative locally.", error);
            if (rejectedProposal && inFlightProposalRef.current?.ackToken === rejectedProposal.ackToken) {
              browserRevisionRef.current = rejectedProposal.baseRevisionId;
              inFlightProposalRef.current = null;
            }
            setVisibleMutationLabel(null);
          });
        return;
      }

      if (event.data.type === "northstar.artifact.mutation-applied") {
        let acceptedAppliedSize: CanvasCodeArtifactContentSize | undefined;
        if (event.data.size) {
          acceptedAppliedSize = acceptNorthstarContentSize({
            candidate: event.data.size,
            artifactId: current.artifactId,
            revisionId: event.data.revisionId ?? current.revisionId,
            previous: latestSizeRef.current,
            previousIntrinsicWidth: current.preferredWidth,
            previousIntrinsicHeight: current.preferredHeight,
            allowEqualSequence: true,
          });
          if (acceptedAppliedSize) {
            latestSizeRef.current = acceptedAppliedSize;
            liveSizeSequenceRef.current = Math.max(liveSizeSequenceRef.current, acceptedAppliedSize.sequence ?? -1);
            setLiveSize(acceptedAppliedSize);
          }
        }
        const appliedMessage = acceptedAppliedSize
          ? { ...event.data, size: acceptedAppliedSize }
          : event.data;
        if (event.data.review) { latestReviewRef.current = event.data.review; onRuntimeReview(event.data.review); }
        onBrowserCommit({
          artifactId: event.data.artifactId,
          revisionId: event.data.revisionId ?? current.revisionId,
          mutationId: event.data.mutationId,
          size: acceptedAppliedSize,
          review: event.data.review,
          snapshot: event.data.snapshot,
        });
        if (event.data.mutationId) appliedMutationIdsRef.current.add(event.data.mutationId);
        const appliedProposal = inFlightProposalRef.current;
        if (appliedProposal && event.data.mutationId && appliedProposal.mutationId === event.data.mutationId) {
          browserRevisionRef.current = event.data.revisionId ?? appliedProposal.revisionId;
          inFlightProposalRef.current = null;
        }
        setVisibleMutationLabel(event.data.visibleChange || null);
        void postAcknowledgement({ status: "applied", message: appliedMessage })
          .then(() => {
            window.setTimeout(() => {
              setVisibleMutationLabel(null);
              pumpNextMutation();
            }, 180);
          })
          .catch((error: unknown) => {
            console.warn("Northstar acknowledgement transport failed; the accepted local artboard remains usable and recoverable.", error);
            setVisibleMutationLabel(null);
          });
        return;
      }

      if (event.data.type === "northstar.artifact.select") {
        onRequestSelect();
        return;
      }

      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const geometry = artifactGeometry(current, width, height, liveSize);
      const point = {
        x: rect.left + (event.data.clientX ?? 0) * (rect.width / Math.max(1, geometry.intrinsicWidth)),
        y: rect.top + (event.data.clientY ?? 0) * (rect.height / Math.max(1, geometry.intrinsicHeight)),
      };
      if (event.data.type === "northstar.artifact.drag-start") {
        onRequestSelect();
        setDragShieldActive(true);
        onCanvasDragStart(point.x, point.y);
        return;
      }
      if (event.data.type === "northstar.artifact.wheel") {
        onCanvasWheel({
          clientX: point.x,
          clientY: point.y,
          deltaX: event.data.deltaX ?? 0,
          deltaY: event.data.deltaY ?? 0,
          ctrlKey: Boolean(event.data.ctrlKey),
          metaKey: Boolean(event.data.metaKey),
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [height, liveSize, onBrowserCommit, onCanvasDragStart, onCanvasWheel, onContentSize, onRequestSelect, onRuntimeReview, onLifecycleEvent, postAcknowledgement, postCurrentContext, pumpNextMutation, width]);

  if (!artifact && !mountedSurface) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F7F7FC] p-8 text-center">
        <div><TriangleAlert className="mx-auto h-7 w-7 text-amber-500" /><p className="mt-3 text-sm font-extrabold text-zinc-900">Artifact payload is missing</p></div>
      </div>
    );
  }

  const current = artifact ?? mountedSurface;
  const geometry = artifactGeometry(current, width, height, liveSize);
  const liveInteractionEnabled = viewportZoom >= MINIMUM_INTERACTIVE_ZOOM;
  const pendingMutation = Boolean(current && (current.mutationJournal ?? []).some((batch: NorthstarArtboardMutationBatch) =>
    !appliedMutationIdsRef.current.has(batch.mutationId) &&
    !failedMutationIdsRef.current.has(batch.mutationId),
  ));

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#ECECF3] text-zinc-950" style={{ contain: "strict", isolation: "isolate" }}>
      {mountedSurface && (
        <div
          className="absolute overflow-hidden bg-white shadow-[0_20px_60px_rgba(32,27,78,0.14)]"
          style={{
            left: geometry.left,
            top: geometry.top,
            width: geometry.intrinsicWidth,
            height: geometry.intrinsicHeight,
            transform: `translateZ(0) scale(${geometry.scale})`,
            transformOrigin: "top left",
            contain: "strict",
          }}
        >
          <iframe
            key={mountedSurfaceId ?? "surface"}
            ref={frameRef}
            data-testid="northstar-live-artboard-frame"
            data-ns-surface-id={mountedSurfaceId}
            title={current?.title ?? mountedSurface.title}
            src={runtimeDocument ? undefined : mountedSurface.runtimeUrl}
            srcDoc={runtimeDocument}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="eager"
            tabIndex={liveInteractionEnabled ? 0 : -1}
            className="block border-0 bg-white"
            style={{
              width: geometry.intrinsicWidth,
              height: geometry.intrinsicHeight,
              pointerEvents: liveInteractionEnabled && !dragShieldActive ? "auto" : "none",
            }}
            onLoad={() => {
              frameLoadCountRef.current += 1;
            }}
            onError={() => {
              console.warn("Northstar isolated surface emitted a load error; retaining the continuously mounted frame.");
              setSurfaceReady(true);
            }}
          />
        </div>
      )}

      {creativeActivity && creativeActivity.artifactId === current?.artifactId && !runtimeError && (
        <div
          className="pointer-events-none absolute inset-0 z-[35] overflow-hidden"
          data-ns-ephemeral-creative-activity={creativeActivity.phase}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(107,92,255,0.09),transparent_42%)] animate-pulse" />
          <div className="absolute left-1/2 top-3 flex max-w-[78%] -translate-x-1/2 items-center gap-2 rounded-full border border-[#6B5CFF]/20 bg-white/92 px-3 py-1.5 text-[10px] font-[850] text-zinc-700 shadow-lg backdrop-blur-xl">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#6B5CFF]" />
            <span className="truncate">{creativeActivity.label}</span>
          </div>
          <div className="absolute inset-x-[8%] bottom-3 h-px overflow-hidden bg-black/[0.05]">
            <div className="h-full w-1/3 animate-[ns-host-creative-scan_1.8s_ease-in-out_infinite] bg-[#6B5CFF]/70" />
          </div>
          <style>{`@keyframes ns-host-creative-scan{0%{transform:translateX(-120%)}100%{transform:translateX(420%)}}`}</style>
        </div>
      )}

      {!surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/88 px-3 py-1.5 text-xs font-bold text-zinc-500 shadow-sm backdrop-blur-xl"><Loader2 className="h-4 w-4 animate-spin text-[#6B5CFF]" />Mounting the one live artboard…</div>
        </div>
      )}

      {runtimeError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#FFF9F7] p-8 text-center">
          <div><TriangleAlert className="mx-auto h-7 w-7 text-[#FF6B45]" /><p className="mt-3 text-sm font-extrabold text-zinc-900">The persistent artifact surface did not load</p><p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{runtimeError}</p></div>
        </div>
      )}

      {dragShieldActive && typeof document !== "undefined" && createPortal(
        <div data-canvas-ui="true" aria-hidden="true" className="fixed inset-0 z-[2147483000] cursor-grabbing touch-none select-none" style={{ background: "transparent" }} />,
        document.body,
      )}

      <div className="absolute inset-x-0 top-0 z-30 h-3 cursor-grab active:cursor-grabbing" />
      <div className="absolute inset-x-0 bottom-0 z-30 h-3 cursor-grab active:cursor-grabbing" />
      <div className="absolute inset-y-0 left-0 z-30 w-3 cursor-grab active:cursor-grabbing" />
      <div className="absolute inset-y-0 right-0 z-30 w-3 cursor-grab active:cursor-grabbing" />

      {selected && surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-40 flex max-w-[70%] -translate-x-1/2 items-center gap-1.5 truncate rounded-full border border-black/[0.06] bg-white/88 px-2.5 py-1 text-[9px] font-[850] text-zinc-500 shadow-md backdrop-blur-xl">
          {pendingMutation || visibleMutationLabel ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#6B5CFF]" /> : <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[#6B5CFF]" />}
          <span className="truncate">{visibleMutationLabel || (pendingMutation ? "Northstar is adjusting this same artboard" : current?.buildState.isBuilding ? current.buildState.message : "Drag the frame or any non-interactive area")}</span>
        </div>
      )}

      {!liveInteractionEnabled && surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full border border-black/[0.06] bg-white/88 px-2.5 py-1 text-[9px] font-[850] text-zinc-500 shadow-md backdrop-blur-xl">Zoom in to use artifact controls</div>
      )}
    </div>
  );
}

export const CodeArtifactHost = memo(
  CodeArtifactHostImpl,
  (previous: CodeArtifactHostProps, next: CodeArtifactHostProps) =>
    previous.artifact === next.artifact &&
    previous.creativeActivity === next.creativeActivity &&
    previous.selected === next.selected &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.viewportZoom === next.viewportZoom,
);
