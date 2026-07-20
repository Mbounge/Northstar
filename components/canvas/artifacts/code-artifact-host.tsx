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
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardChangeKind,
  NorthstarArtboardMutationBatch,
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
    | "northstar.artifact.mutation-received"
    | "northstar.artifact.mutation-applied"
    | "northstar.artifact.mutation-rejected";
  artifactId: string;
  surfaceId?: string;
  revisionId?: string;
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
  changedNodeIds?: string[];
  meaningfulChangedNodeIds?: string[];
  changeKinds?: NorthstarArtboardChangeKind[];
  requiredAssetUrls?: string[];
  loadedAssetUrls?: string[];
  missingAssetUrls?: string[];
  snapshot?: NorthstarLiveSurfaceSnapshot;
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

interface CodeArtifactHostProps {
  artifact?: CanvasCodeArtifactPayload;
  selected: boolean;
  width: number;
  height: number;
  viewportZoom: number;
  onRequestSelect: () => void;
  onCanvasDragStart: (clientX: number, clientY: number) => void;
  onRuntimeReview: (review: CanvasCodeArtifactRuntimeReview) => void;
  onContentSize: (size: CanvasCodeArtifactContentSize) => void;
  onBrowserCommit: (commit: NorthstarBrowserCommit) => void;
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
  selected,
  width,
  height,
  viewportZoom,
  onRequestSelect,
  onCanvasDragStart,
  onRuntimeReview,
  onContentSize,
  onBrowserCommit,
  onCanvasWheel,
}: CodeArtifactHostProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const latestArtifactRef = useRef<CanvasCodeArtifactPayload | undefined>(artifact);
  const mountedSurfaceRef = useRef<CanvasCodeArtifactPayload | undefined>(artifact);
  const appliedMutationIdsRef = useRef<Set<string>>(new Set());
  const failedMutationIdsRef = useRef<Set<string>>(new Set());
  const inFlightProposalRef = useRef<{
    proposalId: string;
    ackToken: string;
    baseRevisionId?: string;
    revisionId: string;
    mutationId: string;
    received: boolean;
    receivedAt?: number;
    dispatchAttempts: number;
    lastDispatchedAt: number;
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
      mountedSurfaceRef.current = artifact;
      setMountedSurface(artifact);
      appliedMutationIdsRef.current = new Set();
      failedMutationIdsRef.current = new Set();
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
    if (!frame?.contentWindow) return false;
    input.proposal.dispatchAttempts += 1;
    input.proposal.lastDispatchedAt = Date.now();
    frame.contentWindow.postMessage({
      type: "northstar.artifact.apply-mutation",
      artifactId: input.artifact.artifactId,
      surfaceId: input.artifact.surfaceId ?? input.artifact.artifactId,
      revisionId: input.artifact.revisionId,
      baseRevisionId: input.artifact.parentRevisionId,
      proposalId: input.proposal.proposalId,
      ackToken: input.proposal.ackToken,
      batch: input.batch,
      assetUrls: input.artifact.dataBundle?.allowedAssetUrls ?? [],
    }, "*");
    return true;
  }, []);

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
      dispatchAttempts: 0,
      lastDispatchedAt: 0,
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
  }) => {
    const latest = latestArtifactRef.current;
    const mounted = mountedSurfaceRef.current;
    const inFlight = inFlightProposalRef.current;
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

    const acknowledgement: NorthstarArtifactMutationAcknowledgement = {
      schema: "northstar.artboard-ack.v1",
      proposalId,
      ackToken,
      baseRevisionId: input.message.baseRevisionId
        ?? (!isFoundationReady ? inFlight?.baseRevisionId : current.parentRevisionId),
      artifactId: current.artifactId,
      surfaceId: current.surfaceId ?? current.artifactId,
      revisionId,
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
      snapshot: input.message.snapshot,
      acknowledgedAt: new Date().toISOString(),
    };

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
    } finally {
      const pending = pendingAcknowledgementDeliveriesRef.current.get(acknowledgement.ackToken);
      if (pending) pending.sending = false;
    }
  }, [deliverAcknowledgement]);

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
    // postMessage has no delivery guarantee. Retry the exact idempotent proposal
    // until its token leaves the authoritative package. The iframe caches and
    // replays terminal results, so this never needs to remount or blank the board.
    const interval = window.setInterval(() => {
      const proposal = inFlightProposalRef.current;
      const current = latestArtifactRef.current;
      if (!proposal || !current || !readyRef.current) return;
      if (current.pendingAckToken !== proposal.ackToken) {
        inFlightProposalRef.current = null;
        pumpNextMutation();
        return;
      }
      const retryInterval = proposal.received ? 900 : 400;
      if (Date.now() - proposal.lastDispatchedAt < retryInterval) return;
      const batch = (current.mutationJournal ?? []).find(
        (candidate) => candidate.mutationId === proposal.mutationId,
      );
      if (!batch) return;
      dispatchMutationProposal({ proposal, batch, artifact: current });
    }, 200);
    return () => window.clearInterval(interval);
  }, [dispatchMutationProposal, postAcknowledgement, pumpNextMutation]);

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

      if (event.data.type === "northstar.artifact.ready") {
        for (const id of event.data.appliedMutationIds ?? []) appliedMutationIdsRef.current.add(id);
        if (event.data.size) {
          latestSizeRef.current = event.data.size;
          liveSizeSequenceRef.current = Math.max(liveSizeSequenceRef.current, event.data.size.sequence ?? -1);
          setLiveSize(event.data.size);
          onContentSize(event.data.size);
        }
        if (event.data.review) latestReviewRef.current = event.data.review;
        readyRef.current = true;
        browserRevisionRef.current = event.data.revisionId ?? current.revisionId;
        setSurfaceReady(true);
        setRuntimeError(null);
        postCurrentContext();
        // Ready with a mutation id is provisional. Only mutation-applied or
        // mutation-rejected may commit/clear that exact proposal token.
        const hasPendingMutation = Boolean(
          current.pendingAckToken
          && (current.mutationJournal ?? []).some((batch) =>
            !appliedMutationIdsRef.current.has(batch.mutationId)
            && !failedMutationIdsRef.current.has(batch.mutationId),
          ),
        );
        if (!event.data.mutationId && !hasPendingMutation) {
          onBrowserCommit({
            artifactId: event.data.artifactId,
            revisionId: event.data.revisionId ?? current.revisionId,
            size: event.data.size,
            review: event.data.review,
            snapshot: event.data.snapshot,
          });
          void postAcknowledgement({ status: "ready", message: event.data })
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
        }
        return;
      }

      if (event.data.type === "northstar.artifact.runtime-error") {
        if (event.data.mutationId) {
          failedMutationIdsRef.current.add(event.data.mutationId);
          if (inFlightProposalRef.current?.mutationId === event.data.mutationId) {
            browserRevisionRef.current = inFlightProposalRef.current.baseRevisionId;
            inFlightProposalRef.current = null;
          }
          setVisibleMutationLabel("Repairing an invalid adjustment on this same artboard");
          void postAcknowledgement({ status: "rejected", message: event.data, reason: event.data.message || "Runtime mutation error." })
            .then(() => setVisibleMutationLabel(null))
            .catch((error: unknown) => {
              console.warn("Northstar could not report the rejected mutation; the rolled-back artboard remains locally usable.", error);
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
        const nextSequence = event.data.size.sequence ?? liveSizeSequenceRef.current + 1;
        if (nextSequence < liveSizeSequenceRef.current) return;
        liveSizeSequenceRef.current = nextSequence;
        latestSizeRef.current = event.data.size;
        // Provisional reflow, asset loading, and rollback never move or zoom the
        // outer Canvas object. Ready and mutation-applied are the only events
        // allowed to publish a settled size to the workspace.
        return;
      }

      if (event.data.type === "northstar.artifact.runtime-review" && event.data.review) {
        latestReviewRef.current = event.data.review;
        onRuntimeReview(event.data.review);
        return;
      }

      if (event.data.type === "northstar.artifact.mutation-rejected") {
        // The runtime has already rolled the DOM back. Never commit the rejected mutation's
        // transient geometry to the outer Canvas object.
        if (event.data.mutationId) failedMutationIdsRef.current.add(event.data.mutationId);
        const rejectedProposal = inFlightProposalRef.current;
        if (rejectedProposal && event.data.mutationId && rejectedProposal.mutationId === event.data.mutationId) {
          browserRevisionRef.current = rejectedProposal.baseRevisionId;
          inFlightProposalRef.current = null;
        }
        if (event.data.review) { latestReviewRef.current = event.data.review; onRuntimeReview(event.data.review); }
        setVisibleMutationLabel("Northstar is repairing this rejected adjustment");
        void postAcknowledgement({ status: "rejected", message: event.data, reason: event.data.message || "The live runtime rejected the adjustment." })
          .then(() => setVisibleMutationLabel(null))
          .catch((error: unknown) => {
            console.warn("Northstar acknowledgement transport failed; the runtime rollback remains authoritative locally.", error);
            setVisibleMutationLabel(null);
          });
        return;
      }

      if (event.data.type === "northstar.artifact.mutation-applied") {
        if (event.data.size) {
          latestSizeRef.current = event.data.size;
          liveSizeSequenceRef.current = Math.max(liveSizeSequenceRef.current, event.data.size.sequence ?? -1);
          setLiveSize(event.data.size);
          onContentSize(event.data.size);
        }
        if (event.data.review) { latestReviewRef.current = event.data.review; onRuntimeReview(event.data.review); }
        onBrowserCommit({
          artifactId: event.data.artifactId,
          revisionId: event.data.revisionId ?? current.revisionId,
          mutationId: event.data.mutationId,
          size: event.data.size,
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
        void postAcknowledgement({ status: "applied", message: event.data })
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
  }, [height, liveSize, onBrowserCommit, onCanvasDragStart, onCanvasWheel, onContentSize, onRequestSelect, onRuntimeReview, postAcknowledgement, postCurrentContext, pumpNextMutation, width]);

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
            onError={() => {
              console.warn("Northstar isolated surface emitted a load error; retaining the continuously mounted frame.");
              setSurfaceReady(true);
            }}
          />
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
    previous.selected === next.selected &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.viewportZoom === next.viewportZoom,
);
