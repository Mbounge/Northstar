// Northstar Canvas Live Web Artifact Host v0.8.0 — Git-like in-memory HEAD with staged browser commits.
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, Loader2, TriangleAlert } from "lucide-react";
import { useNorthstarArchitecture } from "@/components/canvas/northstar-architecture-context";
import { buildCanvasArtifactRuntimeDocument } from "@/lib/canvas-artifacts/runtime-document";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  NORTHSTAR_ARTIFACT_ACK_EVENT,
  northstarArtifactAcknowledgementChannelName,
} from "@/lib/canvas-ai/northstar-artboard-ack";
import {
  createNorthstarPreparedTree,
  createNorthstarRootCommit,
} from "@/lib/canvas-artifacts/northstar-commit";
import { getNorthstarSurfaceRepository } from "@/lib/canvas-artifacts/northstar-repository";
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardChangeKind,
  NorthstarArtboardCommit,
  NorthstarArtboardMutationBatch,
  NorthstarLiveSurfaceSnapshot,
  NorthstarProjectionReceipt,
  NorthstarRepositoryProposal,
} from "@/lib/canvas-artifacts/types";

const MINIMUM_INTERACTIVE_ZOOM = 0.24;
const PROPOSAL_RETRY_MS = 650;
const ACTIVATION_RETRY_MS = 900;

type RuntimeMessageType =
  | "northstar.artifact.select"
  | "northstar.artifact.drag-start"
  | "northstar.artifact.wheel"
  | "northstar.artifact.ready"
  | "northstar.artifact.runtime-error"
  | "northstar.artifact.runtime-review"
  | "northstar.artifact.content-size"
  | "northstar.artifact.mutation-received"
  | "northstar.artifact.proposal-prepared"
  | "northstar.artifact.commit-projected"
  | "northstar.artifact.mutation-rejected"
  | "northstar.artifact.sync-required"
  | "northstar.artifact.projection-dirty";

interface ArtifactRuntimeMessage {
  type: RuntimeMessageType;
  artifactId: string;
  surfaceId?: string;
  surfaceSessionId?: string;
  transactionId?: string;
  proposalId?: string;
  ackToken?: string;
  revisionId?: string;
  baseRevisionId?: string;
  mutationId?: string;
  commitHash?: string;
  parentCommitHash?: string | null;
  commitSequence?: number;
  documentHash?: string;
  geometryHash?: string;
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
  designObservations?: string[];
}

interface ActiveTransaction {
  proposal: NorthstarRepositoryProposal;
  batch: NorthstarArtboardMutationBatch;
  artifact: CanvasCodeArtifactPayload;
  phase: "staging" | "activating" | "recovering";
  received: boolean;
  candidate?: NorthstarArtboardCommit;
  lastSentAt: number;
  attempts: number;
  failureReason?: string;
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
  /** Telemetry only. Canonical workspace geometry changes only through onProjectCommit. */
  onContentSize: (size: CanvasCodeArtifactContentSize) => void;
  onProjectCommit: (commit: NorthstarArtboardCommit, surfaceSessionId: string) => NorthstarProjectionReceipt;
  onProposalSettled: (ackToken: string, status: "rejected" | "sync-required" | "blocked" | "recovered") => void;
  onCanvasWheel: (input: {
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    metaKey: boolean;
  }) => void;
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
    await channel.httpSend(NORTHSTAR_ARTIFACT_ACK_EVENT, acknowledgement);
  } finally {
    await client.removeChannel(channel).catch(() => undefined);
  }
}

function isArtifactRuntimeMessage(value: unknown): value is ArtifactRuntimeMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArtifactRuntimeMessage>;
  return typeof candidate.type === "string"
    && candidate.type.startsWith("northstar.artifact.")
    && typeof candidate.artifactId === "string";
}

function surfaceIdentity(artifact?: CanvasCodeArtifactPayload): string | undefined {
  return artifact ? artifact.surfaceId ?? artifact.artifactId : undefined;
}

function artifactGeometry(
  artifact: CanvasCodeArtifactPayload | undefined,
  width: number,
  height: number,
  committedSize?: CanvasCodeArtifactContentSize,
) {
  const commitGeometry = artifact?.headCommit?.tree.geometry;
  const bounds = commitGeometry?.contentBounds ?? committedSize?.contentBounds ?? artifact?.intrinsicBounds;
  const measuredWidth = bounds ? Math.max(1, bounds.maxX - bounds.minX) : 1;
  const measuredHeight = bounds ? Math.max(1, bounds.maxY - bounds.minY) : 1;
  const intrinsicWidth = Math.max(1, commitGeometry?.intrinsicWidth ?? committedSize?.intrinsicWidth ?? artifact?.preferredWidth ?? measuredWidth);
  const intrinsicHeight = Math.max(1, commitGeometry?.intrinsicHeight ?? committedSize?.intrinsicHeight ?? artifact?.preferredHeight ?? measuredHeight);
  const scale = Math.max(0.01, Math.min(width / intrinsicWidth, height / intrinsicHeight));
  return {
    intrinsicWidth,
    intrinsicHeight,
    scale,
    left: (width - intrinsicWidth * scale) / 2,
    top: (height - intrinsicHeight * scale) / 2,
  };
}

function LegacyCodeArtifactHostImpl({
  artifact,
  selected,
  width,
  height,
  viewportZoom,
  onRequestSelect,
  onCanvasDragStart,
  onRuntimeReview,
  onContentSize,
  onProjectCommit,
  onProposalSettled,
  onCanvasWheel,
}: CodeArtifactHostProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const latestArtifactRef = useRef(artifact);
  const mountedSurfaceRef = useRef<CanvasCodeArtifactPayload | undefined>(artifact);
  const activeTransactionRef = useRef<ActiveTransaction | null>(null);
  const handledAckTokensRef = useRef(new Set<string>());
  const pendingDeliveriesRef = useRef(new Map<string, {
    acknowledgement: NorthstarArtifactMutationAcknowledgement;
    attempts: number;
    lastAttemptAt: number;
    sending: boolean;
  }>());
  const readyRef = useRef(false);
  const [mountedSurface, setMountedSurface] = useState<CanvasCodeArtifactPayload | undefined>(artifact);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [committedSize, setCommittedSize] = useState<CanvasCodeArtifactContentSize | undefined>();
  const [dragShieldActive, setDragShieldActive] = useState(false);
  const [visibleMutationLabel, setVisibleMutationLabel] = useState<string | null>(null);

  const activeSurfaceId = surfaceIdentity(artifact);
  const mountedSurfaceId = surfaceIdentity(mountedSurface);
  const surfaceSessionIdRef = useRef(crypto.randomUUID());
  const repository = useMemo(
    () => mountedSurfaceId ? getNorthstarSurfaceRepository(mountedSurfaceId) : undefined,
    [mountedSurfaceId],
  );

  useEffect(() => {
    if (!repository) return;
    repository.acquireWriter(surfaceSessionIdRef.current);
  }, [repository]);

  useEffect(() => {
    latestArtifactRef.current = artifact;
    if (!artifact) return;
    if (!mountedSurface || activeSurfaceId !== mountedSurfaceId) {
      mountedSurfaceRef.current = artifact;
      setMountedSurface(artifact);
      surfaceSessionIdRef.current = crypto.randomUUID();
      activeTransactionRef.current = null;
      handledAckTokensRef.current.clear();
      readyRef.current = false;
      setSurfaceReady(false);
      setRuntimeError(null);
      setCommittedSize(undefined);
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
    const candidatePackage = current.pendingProposal?.candidatePackage;
    const dataBundle = candidatePackage?.dataBundle ?? current.dataBundle;
    frame.contentWindow.postMessage({
      type: "northstar.artifact.update-context",
      artifactId: current.artifactId,
      dataBundle,
      creativeDirection: candidatePackage?.creativeDirection ?? current.creativeDirection,
      creativeReviews: candidatePackage?.creativeReviews ?? current.creativeReviews,
      allowedAssetUrls: dataBundle?.allowedAssetUrls ?? [],
    }, "*");
    frame.contentWindow.postMessage({
      type: "northstar.artifact.set-stage",
      artifactId: current.artifactId,
      stageIndex: current.pendingProposal?.stageIndex ?? current.activeStageIndex ?? 0,
    }, "*");
  }, []);

  const deliverAcknowledgement = useCallback(async (
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): Promise<void> => {
    const outcomes = await Promise.allSettled([
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
    if (outcomes.every((outcome) => outcome.status === "rejected")) {
      const failure = outcomes.find((outcome) => outcome.status === "rejected");
      throw failure?.status === "rejected" && failure.reason instanceof Error
        ? failure.reason
        : new Error("Live artboard acknowledgement transport failed.");
    }
  }, []);

  const queueAcknowledgement = useCallback((acknowledgement: NorthstarArtifactMutationAcknowledgement) => {
    const existing = pendingDeliveriesRef.current.get(acknowledgement.ackToken);
    if (existing) {
      if (JSON.stringify(existing.acknowledgement) !== JSON.stringify(acknowledgement)) {
        console.error("Northstar blocked a contradictory acknowledgement for the same transaction.");
      }
      return;
    }
    pendingDeliveriesRef.current.set(acknowledgement.ackToken, {
      acknowledgement,
      attempts: 0,
      lastAttemptAt: 0,
      sending: false,
    });
  }, []);

  const sendQueuedAcknowledgement = useCallback(async (ackToken: string) => {
    const pending = pendingDeliveriesRef.current.get(ackToken);
    if (!pending || pending.sending) return;
    pending.sending = true;
    pending.attempts += 1;
    pending.lastAttemptAt = Date.now();
    try {
      await deliverAcknowledgement(pending.acknowledgement);
      pendingDeliveriesRef.current.delete(ackToken);
    } catch (error) {
      console.warn("Northstar will retry delivery of the exact repository result.", error);
    } finally {
      const current = pendingDeliveriesRef.current.get(ackToken);
      if (current) current.sending = false;
    }
  }, [deliverAcknowledgement]);

  const acknowledgementFrom = useCallback((input: {
    status: NorthstarArtifactMutationAcknowledgement["status"];
    message: ArtifactRuntimeMessage;
    commit?: NorthstarArtboardCommit;
    reason?: string;
  }): NorthstarArtifactMutationAcknowledgement | undefined => {
    const transaction = activeTransactionRef.current;
    const current = latestArtifactRef.current ?? mountedSurfaceRef.current;
    const ackToken = input.message.ackToken ?? transaction?.proposal.ackToken ?? current?.pendingAckToken;
    const proposalId = input.message.proposalId ?? transaction?.proposal.proposalId ?? ackToken?.split(":").at(-1);
    const committedStatus = input.status === "applied" || input.status === "ready";
    const revisionId = input.commit?.revisionId ?? input.message.revisionId ?? current?.revisionId;
    if (!current || !ackToken || !proposalId || !revisionId) return undefined;
    const head = input.commit ?? repository?.head();
    return {
      schema: "northstar.artboard-ack.v1",
      proposalId,
      ackToken,
      baseRevisionId: input.message.baseRevisionId ?? transaction?.artifact.parentRevisionId,
      artifactId: current.artifactId,
      surfaceId: current.surfaceId ?? current.artifactId,
      revisionId,
      mutationId: committedStatus
        ? input.commit?.mutationId ?? input.message.mutationId ?? transaction?.batch.mutationId
        : input.message.mutationId ?? transaction?.batch.mutationId ?? input.commit?.mutationId ?? undefined,
      status: input.status,
      reason: input.reason,
      size: input.message.size ?? (head ? {
        artifactId: head.artifactId,
        revisionId: head.revisionId,
        mutationId: head.mutationId ?? undefined,
        measuredAt: new Date().toISOString(),
        intrinsicWidth: head.tree.geometry.intrinsicWidth,
        intrinsicHeight: head.tree.geometry.intrinsicHeight,
        contentBounds: head.tree.geometry.contentBounds,
        settled: true,
      } : undefined),
      review: input.message.review ?? head?.tree.runtimeReview,
      changedNodeIds: input.message.changedNodeIds ?? [],
      meaningfulChangedNodeIds: input.message.meaningfulChangedNodeIds ?? [],
      changeKinds: input.message.changeKinds ?? [],
      requiredAssetUrls: input.message.requiredAssetUrls ?? [],
      loadedAssetUrls: input.message.loadedAssetUrls ?? [],
      missingAssetUrls: input.message.missingAssetUrls ?? [],
      snapshot: input.message.snapshot ?? (head ? {
        html: head.tree.document.html,
        css: head.tree.document.css,
        capturedAt: new Date().toISOString(),
        semanticNodes: head.tree.semanticNodes,
      } : undefined),
      acknowledgedAt: new Date().toISOString(),
      transactionId: input.message.transactionId ?? transaction?.proposal.transactionId,
      surfaceSessionId: surfaceSessionIdRef.current,
      commitHash: head?.commitHash,
      parentCommitHash: head?.parentCommitHash,
      documentHash: head?.hashes.documentHash,
      geometryHash: head?.hashes.geometryHash,
      commitSequence: head?.commitSequence,
      repositoryStatus: repository?.snapshot().status,
    };
  }, [repository]);

  const postStageProposal = useCallback((transaction: ActiveTransaction) => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    transaction.attempts += 1;
    transaction.lastSentAt = Date.now();
    frame.contentWindow.postMessage({
      type: "northstar.artifact.stage-proposal",
      artifactId: transaction.proposal.artifactId,
      surfaceId: transaction.proposal.surfaceId,
      surfaceSessionId: transaction.proposal.surfaceSessionId,
      transactionId: transaction.proposal.transactionId,
      proposalId: transaction.proposal.proposalId,
      ackToken: transaction.proposal.ackToken,
      revisionId: transaction.proposal.revisionId,
      baseRevisionId: repository?.head().revisionId,
      baseCommitHash: transaction.proposal.baseCommitHash,
      batch: transaction.batch,
      assetUrls: transaction.proposal.assetUrls,
    }, "*");
  }, [repository]);

  const postActivation = useCallback((transaction: ActiveTransaction) => {
    const frame = frameRef.current;
    const candidate = transaction.candidate;
    if (!frame?.contentWindow || !candidate) return;
    transaction.attempts += 1;
    transaction.lastSentAt = Date.now();
    frame.contentWindow.postMessage({
      type: "northstar.artifact.activate-commit",
      artifactId: candidate.artifactId,
      surfaceId: candidate.surfaceId,
      surfaceSessionId: surfaceSessionIdRef.current,
      transactionId: transaction.proposal.transactionId,
      proposalId: transaction.proposal.proposalId,
      ackToken: transaction.proposal.ackToken,
      baseRevisionId: repository?.head().revisionId,
      revisionId: candidate.revisionId,
      mutationId: candidate.mutationId,
      commitHash: candidate.commitHash,
      parentCommitHash: candidate.parentCommitHash,
      commitSequence: candidate.commitSequence,
      documentHash: candidate.hashes.documentHash,
      geometryHash: candidate.hashes.geometryHash,
      visibleChange: transaction.batch.visibleChange,
      changedNodeIds: [],
      meaningfulChangedNodeIds: [],
      changeKinds: transaction.batch.requiredChangeKinds ?? [],
      requiredAssetUrls: transaction.batch.requiredAssetUrls ?? [],
    }, "*");
  }, [repository]);

  const beginRecovery = useCallback((reason: string, original?: ActiveTransaction) => {
    if (!repository || !frameRef.current?.contentWindow) return;
    let head: NorthstarArtboardCommit;
    try {
      head = repository.beginRecovery(reason, surfaceSessionIdRef.current);
    } catch (error) {
      activeTransactionRef.current = null;
      setVisibleMutationLabel(null);
      setRuntimeError(error instanceof Error ? error.message : String(error));
      return;
    }
    const recovery: ActiveTransaction = original ?? {
      proposal: {
        schema: "northstar.repository-proposal.v1",
        transactionId: `checkout:${head.commitHash}`,
        proposalId: `checkout:${head.commitHash}`,
        ackToken: `checkout:${head.commitHash}`,
        artifactId: head.artifactId,
        surfaceId: head.surfaceId,
        surfaceSessionId: surfaceSessionIdRef.current,
        baseCommitHash: head.commitHash,
        revisionId: head.revisionId,
        mutation: {
          schema: "northstar.artboard-mutation.v1",
          mutationId: `checkout:${head.commitHash}`,
          sequence: head.commitSequence,
          label: "Restore repository HEAD",
          phase: "refinement",
          intent: "Restore repository HEAD",
          visibleChange: "Restore the last committed artboard",
          geometryIntent: "preserve",
          transitionMs: 0,
          operations: [],
          createdAt: new Date().toISOString(),
        },
        assetUrls: [],
        createdAt: new Date().toISOString(),
      },
      batch: {
        schema: "northstar.artboard-mutation.v1",
        mutationId: `checkout:${head.commitHash}`,
        sequence: head.commitSequence,
        label: "Restore repository HEAD",
        phase: "refinement",
        intent: "Restore repository HEAD",
        visibleChange: "Restore the last committed artboard",
        geometryIntent: "preserve",
        transitionMs: 0,
        operations: [],
        createdAt: new Date().toISOString(),
      },
      artifact: latestArtifactRef.current ?? mountedSurfaceRef.current!,
      phase: "recovering",
      received: true,
      candidate: head,
      lastSentAt: 0,
      attempts: 0,
    };
    recovery.phase = "recovering";
    recovery.candidate = head;
    recovery.failureReason = reason;
    activeTransactionRef.current = recovery;
    frameRef.current.contentWindow.postMessage({
      type: "northstar.artifact.checkout-commit",
      artifactId: head.artifactId,
      surfaceId: head.surfaceId,
      surfaceSessionId: surfaceSessionIdRef.current,
      transactionId: recovery.proposal.transactionId,
      commit: head,
    }, "*");
  }, [repository]);

  const pumpNextProposal = useCallback(() => {
    if (!readyRef.current || !repository || activeTransactionRef.current) return;
    const current = latestArtifactRef.current;
    if (!current) return;
    const pending = current.pendingProposal;
    const ackToken = pending?.ackToken ?? current.pendingAckToken;
    if (!ackToken || handledAckTokensRef.current.has(ackToken)) return;
    const head = repository.head();
    const journal = [...(current.mutationJournal ?? [])].sort((left, right) => left.sequence - right.sequence);
    const batch = pending?.mutation ?? journal.at(-1);
    if (!batch) return;
    const parentRevisionId = pending?.parentRevisionId ?? current.parentRevisionId;
    if (parentRevisionId && parentRevisionId !== head.revisionId) {
      const synthetic: ArtifactRuntimeMessage = {
        type: "northstar.artifact.sync-required",
        artifactId: current.artifactId,
        surfaceId: current.surfaceId,
        revisionId: head.revisionId,
        baseRevisionId: parentRevisionId,
        proposalId: pending?.proposalId ?? ackToken.split(":").at(-1),
        ackToken,
        mutationId: batch.mutationId,
        message: "The proposal was generated from a revision other than repository HEAD.",
      };
      const acknowledgement = acknowledgementFrom({
        status: "sync-required",
        message: synthetic,
        commit: head,
        reason: synthetic.message,
      });
      if (acknowledgement) {
        handledAckTokensRef.current.add(acknowledgement.ackToken);
        queueAcknowledgement(acknowledgement);
        onProposalSettled(acknowledgement.ackToken, "sync-required");
        void sendQueuedAcknowledgement(acknowledgement.ackToken);
      }
      return;
    }
    const proposalId = pending?.proposalId ?? (ackToken.split(":").at(-1) || ackToken);
    const proposal: NorthstarRepositoryProposal = {
      schema: "northstar.repository-proposal.v1",
      transactionId: pending?.transactionId ?? ackToken,
      proposalId,
      ackToken,
      artifactId: current.artifactId,
      surfaceId: current.surfaceId ?? current.artifactId,
      surfaceSessionId: surfaceSessionIdRef.current,
      baseCommitHash: head.commitHash,
      revisionId: pending?.revisionId ?? current.revisionId,
      mutation: batch,
      assetUrls: pending?.candidatePackage.dataBundle.allowedAssetUrls ?? current.dataBundle?.allowedAssetUrls ?? [],
      createdAt: new Date().toISOString(),
    };
    try {
      repository.indexProposal(proposal, surfaceSessionIdRef.current);
      repository.beginStaging(proposal.transactionId, surfaceSessionIdRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const acknowledgement = acknowledgementFrom({
        status: "sync-required",
        message: {
          type: "northstar.artifact.sync-required",
          artifactId: current.artifactId,
          surfaceId: current.surfaceId,
          revisionId: head.revisionId,
          proposalId,
          ackToken: proposal.ackToken,
          transactionId: proposal.transactionId,
          mutationId: batch.mutationId,
          message,
        },
        commit: head,
        reason: message,
      });
      if (acknowledgement) {
        queueAcknowledgement(acknowledgement);
        onProposalSettled(acknowledgement.ackToken, "sync-required");
        void sendQueuedAcknowledgement(acknowledgement.ackToken);
      }
      return;
    }
    const transaction: ActiveTransaction = {
      proposal,
      batch,
      artifact: current,
      phase: "staging",
      received: false,
      lastSentAt: 0,
      attempts: 0,
    };
    activeTransactionRef.current = transaction;
    setVisibleMutationLabel(batch.label);
    postStageProposal(transaction);
  }, [acknowledgementFrom, onProposalSettled, postStageProposal, queueAcknowledgement, repository, sendQueuedAcknowledgement]);

  useEffect(() => {
    if (!artifact || activeSurfaceId !== mountedSurfaceId) return;
    postCurrentContext();
    pumpNextProposal();
  }, [activeSurfaceId, artifact, artifact?.activeStageIndex, artifact?.pendingAckToken, artifact?.pendingProposal?.transactionId, artifact?.revisionId, mountedSurfaceId, postCurrentContext, pumpNextProposal]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      for (const [ackToken, pending] of pendingDeliveriesRef.current) {
        const retryDelay = Math.min(15_000, 500 * (2 ** Math.min(pending.attempts, 5)));
        if (!pending.sending && Date.now() - pending.lastAttemptAt >= retryDelay) {
          void sendQueuedAcknowledgement(ackToken);
        }
      }
      const transaction = activeTransactionRef.current;
      if (!transaction) {
        pumpNextProposal();
        return;
      }
      const retryMs = transaction.phase === "staging" ? PROPOSAL_RETRY_MS : ACTIVATION_RETRY_MS;
      if (Date.now() - transaction.lastSentAt < retryMs) return;
      if (transaction.phase === "staging") postStageProposal(transaction);
      else if (transaction.phase === "activating") postActivation(transaction);
      else if (transaction.phase === "recovering" && transaction.candidate && frameRef.current?.contentWindow) {
        transaction.lastSentAt = Date.now();
        frameRef.current.contentWindow.postMessage({
          type: "northstar.artifact.checkout-commit",
          artifactId: transaction.candidate.artifactId,
          surfaceId: transaction.candidate.surfaceId,
          surfaceSessionId: surfaceSessionIdRef.current,
          transactionId: transaction.proposal.transactionId,
          commit: transaction.candidate,
        }, "*");
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [postActivation, postStageProposal, pumpNextProposal, sendQueuedAcknowledgement]);

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
      if (!isArtifactRuntimeMessage(event.data) || event.source !== frameRef.current?.contentWindow) return;
      const current = latestArtifactRef.current ?? mountedSurfaceRef.current;
      if (!current || event.data.artifactId !== current.artifactId || !repository) return;
      const message = event.data;

      if (message.type === "northstar.artifact.ready") {
        if (!message.snapshot || !message.size) return;
        try {
          const proposedRoot = createNorthstarRootCommit({ artifact: current, snapshot: message.snapshot, size: message.size, review: message.review });
          const existingHeadHash = repository.snapshot().headCommitHash;
          const head = existingHeadHash
            ? repository.initialize(proposedRoot, surfaceSessionIdRef.current)
            : proposedRoot;
          const workspaceReceipt = onProjectCommit(head, surfaceSessionIdRef.current);
          if (
            workspaceReceipt.commitHash !== head.commitHash
            || workspaceReceipt.documentHash !== head.hashes.documentHash
            || workspaceReceipt.semanticHash !== head.hashes.semanticHash
            || workspaceReceipt.geometryHash !== head.hashes.geometryHash
            || workspaceReceipt.runtimeReviewHash !== head.hashes.runtimeReviewHash
            || workspaceReceipt.treeHash !== head.hashes.treeHash
          ) {
            throw new Error("Workspace failed to reproduce repository HEAD.");
          }
          if (!existingHeadHash) repository.initialize(proposedRoot, surfaceSessionIdRef.current);
          setCommittedSize({
            ...message.size,
            revisionId: head.revisionId,
            intrinsicWidth: head.tree.geometry.intrinsicWidth,
            intrinsicHeight: head.tree.geometry.intrinsicHeight,
            contentBounds: head.tree.geometry.contentBounds,
            settled: true,
          });
          readyRef.current = true;
          setSurfaceReady(true);
          setRuntimeError(null);
          postCurrentContext();
          if (
            (head.commitHash !== proposedRoot.commitHash || repository.snapshot().status !== "clean")
            && frameRef.current?.contentWindow
          ) {
            activeTransactionRef.current = {
              proposal: {
                schema: "northstar.repository-proposal.v1",
                transactionId: `checkout:${head.commitHash}`,
                proposalId: `checkout:${head.commitHash}`,
                ackToken: `checkout:${head.commitHash}`,
                artifactId: head.artifactId,
                surfaceId: head.surfaceId,
                surfaceSessionId: surfaceSessionIdRef.current,
                baseCommitHash: head.commitHash,
                revisionId: head.revisionId,
                mutation: {
                  schema: "northstar.artboard-mutation.v1",
                  mutationId: `checkout:${head.commitHash}`,
                  sequence: head.commitSequence,
                  label: "Restore HEAD",
                  phase: "refinement",
                  intent: "Restore HEAD",
                  visibleChange: "Restore HEAD",
                  geometryIntent: "preserve",
                  transitionMs: 0,
                  operations: [],
                  createdAt: new Date().toISOString(),
                },
                assetUrls: [],
                createdAt: new Date().toISOString(),
              },
              batch: {
                schema: "northstar.artboard-mutation.v1",
                mutationId: `checkout:${head.commitHash}`,
                sequence: head.commitSequence,
                label: "Restore HEAD",
                phase: "refinement",
                intent: "Restore HEAD",
                visibleChange: "Restore HEAD",
                geometryIntent: "preserve",
                transitionMs: 0,
                operations: [],
                createdAt: new Date().toISOString(),
              },
              artifact: current,
              phase: "recovering",
              received: true,
              candidate: head,
              lastSentAt: Date.now(),
              attempts: 1,
            };
            frameRef.current.contentWindow.postMessage({
              type: "northstar.artifact.checkout-commit",
              artifactId: head.artifactId,
              surfaceId: head.surfaceId,
              surfaceSessionId: surfaceSessionIdRef.current,
              transactionId: `checkout:${head.commitHash}`,
              commit: head,
            }, "*");
            return;
          }
          const rootAckToken = current.pendingAckToken;
          if (rootAckToken && !(current.mutationJournal ?? []).length && !handledAckTokensRef.current.has(rootAckToken)) {
            const acknowledgement = acknowledgementFrom({ status: "ready", message, commit: head });
            if (acknowledgement) {
              handledAckTokensRef.current.add(rootAckToken);
              queueAcknowledgement(acknowledgement);
              void sendQueuedAcknowledgement(rootAckToken).finally(() => pumpNextProposal());
            }
          } else {
            pumpNextProposal();
          }
        } catch (error) {
          setRuntimeError(error instanceof Error ? error.message : String(error));
        }
        return;
      }

      if (message.type === "northstar.artifact.mutation-received") {
        const transaction = activeTransactionRef.current;
        if (transaction && message.transactionId === transaction.proposal.transactionId) transaction.received = true;
        return;
      }

      if (message.type === "northstar.artifact.proposal-prepared") {
        const transaction = activeTransactionRef.current;
        if (!transaction || transaction.phase !== "staging" || message.transactionId !== transaction.proposal.transactionId) return;
        if (!message.snapshot || !message.size) {
          beginRecovery("The browser prepared a candidate without a complete snapshot and geometry.", transaction);
          return;
        }
        try {
          const prepared = createNorthstarPreparedTree({
            artifactId: current.artifactId,
            surfaceId: current.surfaceId ?? current.artifactId,
            proposal: transaction.proposal,
            snapshot: message.snapshot,
            size: message.size,
            review: message.review,
            minimumWidth: current.minimumWidth,
            minimumHeight: current.minimumHeight,
            fallbackDocument: current.document!,
          });
          transaction.candidate = repository.prepareCandidate(prepared, surfaceSessionIdRef.current);
          transaction.phase = "activating";
          transaction.attempts = 0;
          transaction.lastSentAt = 0;
          postActivation(transaction);
        } catch (error) {
          beginRecovery(error instanceof Error ? error.message : String(error), transaction);
        }
        return;
      }

      if (message.type === "northstar.artifact.commit-projected") {
        const transaction = activeTransactionRef.current;
        const candidate = transaction?.candidate;
        if (!transaction || !candidate || message.transactionId !== transaction.proposal.transactionId) return;
        if (!message.snapshot || !message.size) {
          beginRecovery("The browser projection did not include its exact snapshot and geometry.", transaction);
          return;
        }
        try {
          const projectedTree = createNorthstarPreparedTree({
            artifactId: candidate.artifactId,
            surfaceId: candidate.surfaceId,
            proposal: transaction.proposal,
            snapshot: message.snapshot,
            size: message.size,
            review: message.review,
            minimumWidth: current.minimumWidth,
            minimumHeight: current.minimumHeight,
            fallbackDocument: candidate.tree.document,
          });
          if (
            message.commitHash !== candidate.commitHash
            || projectedTree.hashes.documentHash !== candidate.hashes.documentHash
            || projectedTree.hashes.semanticHash !== candidate.hashes.semanticHash
            || projectedTree.hashes.geometryHash !== candidate.hashes.geometryHash
            || projectedTree.hashes.runtimeReviewHash !== candidate.hashes.runtimeReviewHash
            || projectedTree.hashes.treeHash !== candidate.hashes.treeHash
          ) {
            throw new Error("The activated browser projection did not reproduce CANDIDATE exactly.");
          }
          const browserReceipt: NorthstarProjectionReceipt = {
            schema: "northstar.projection-receipt.v1",
            projection: "browser",
            artifactId: candidate.artifactId,
            surfaceId: candidate.surfaceId,
            surfaceSessionId: surfaceSessionIdRef.current,
            transactionId: transaction.proposal.transactionId,
            commitHash: candidate.commitHash,
            documentHash: candidate.hashes.documentHash,
            semanticHash: candidate.hashes.semanticHash,
            geometryHash: candidate.hashes.geometryHash,
            runtimeReviewHash: candidate.hashes.runtimeReviewHash,
            treeHash: candidate.hashes.treeHash,
            projectedAt: new Date().toISOString(),
          };
          const workspaceReceipt = onProjectCommit(candidate, surfaceSessionIdRef.current);
          const head = transaction.phase === "recovering"
            ? repository.finishRecovery({ surfaceSessionId: surfaceSessionIdRef.current, browserReceipt, workspaceReceipt })
            : (() => {
                repository.recordProjection(browserReceipt, surfaceSessionIdRef.current);
                repository.recordProjection(workspaceReceipt, surfaceSessionIdRef.current);
                return repository.advanceHead(surfaceSessionIdRef.current);
              })();
          setCommittedSize({
            ...message.size,
            revisionId: head.revisionId,
            mutationId: head.mutationId ?? undefined,
            intrinsicWidth: head.tree.geometry.intrinsicWidth,
            intrinsicHeight: head.tree.geometry.intrinsicHeight,
            contentBounds: head.tree.geometry.contentBounds,
            settled: true,
          });
          if (head.tree.runtimeReview) onRuntimeReview(head.tree.runtimeReview);
          if (transaction.phase === "recovering") {
            const failedAck = acknowledgementFrom({
              status: "sync-required",
              message,
              commit: head,
              reason: transaction.failureReason ?? "The surface was restored to repository HEAD after projection divergence.",
            });
            if (failedAck && !failedAck.ackToken.startsWith("checkout:")) {
              handledAckTokensRef.current.add(failedAck.ackToken);
              queueAcknowledgement(failedAck);
              onProposalSettled(failedAck.ackToken, "recovered");
              void sendQueuedAcknowledgement(failedAck.ackToken);
            }
          } else {
            const acknowledgement = acknowledgementFrom({ status: "applied", message, commit: head });
            if (acknowledgement) {
              handledAckTokensRef.current.add(acknowledgement.ackToken);
              queueAcknowledgement(acknowledgement);
              void sendQueuedAcknowledgement(acknowledgement.ackToken);
            }
          }
          activeTransactionRef.current = null;
          setVisibleMutationLabel(message.visibleChange ?? null);
          window.setTimeout(() => {
            setVisibleMutationLabel(null);
            pumpNextProposal();
          }, 160);
        } catch (error) {
          beginRecovery(error instanceof Error ? error.message : String(error), transaction);
        }
        return;
      }

      if (message.type === "northstar.artifact.mutation-rejected") {
        const transaction = activeTransactionRef.current;
        if (!transaction || message.transactionId !== transaction.proposal.transactionId) return;
        const head = repository.reject(transaction.proposal.transactionId, message.message ?? "Browser rejected staged transaction.", surfaceSessionIdRef.current);
        const acknowledgement = acknowledgementFrom({
          status: "rejected",
          message,
          commit: head,
          reason: message.message ?? "The staged browser transaction failed deterministic integrity checks.",
        });
        if (acknowledgement) {
          handledAckTokensRef.current.add(acknowledgement.ackToken);
          queueAcknowledgement(acknowledgement);
          onProposalSettled(acknowledgement.ackToken, "rejected");
          void sendQueuedAcknowledgement(acknowledgement.ackToken);
        }
        activeTransactionRef.current = null;
        setVisibleMutationLabel(null);
        pumpNextProposal();
        return;
      }

      if (message.type === "northstar.artifact.sync-required" || message.type === "northstar.artifact.projection-dirty") {
        beginRecovery(message.message ?? "The browser projection diverged from repository HEAD.", activeTransactionRef.current ?? undefined);
        return;
      }

      if (message.type === "northstar.artifact.runtime-error") {
        if (activeTransactionRef.current) beginRecovery(message.message ?? "Artifact runtime error.", activeTransactionRef.current);
        else console.warn("Northstar runtime reported a non-transaction fault; HEAD remains visible.", message.message);
        return;
      }

      if (message.type === "northstar.artifact.content-size" && message.size) {
        // Telemetry only. It must never mutate outer Canvas geometry.
        onContentSize(message.size);
        return;
      }
      if (message.type === "northstar.artifact.runtime-review" && message.review) {
        onRuntimeReview(message.review);
        return;
      }
      if (message.type === "northstar.artifact.select") {
        onRequestSelect();
        return;
      }

      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const geometry = artifactGeometry(current, width, height, committedSize);
      const point = {
        x: rect.left + (message.clientX ?? 0) * (rect.width / Math.max(1, geometry.intrinsicWidth)),
        y: rect.top + (message.clientY ?? 0) * (rect.height / Math.max(1, geometry.intrinsicHeight)),
      };
      if (message.type === "northstar.artifact.drag-start") {
        onRequestSelect();
        setDragShieldActive(true);
        onCanvasDragStart(point.x, point.y);
        return;
      }
      if (message.type === "northstar.artifact.wheel") {
        onCanvasWheel({
          clientX: point.x,
          clientY: point.y,
          deltaX: message.deltaX ?? 0,
          deltaY: message.deltaY ?? 0,
          ctrlKey: Boolean(message.ctrlKey),
          metaKey: Boolean(message.metaKey),
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [acknowledgementFrom, beginRecovery, committedSize, height, onCanvasDragStart, onCanvasWheel, onContentSize, onProjectCommit, onProposalSettled, onRequestSelect, onRuntimeReview, postActivation, postCurrentContext, pumpNextProposal, queueAcknowledgement, repository, sendQueuedAcknowledgement, width]);

  if (!artifact && !mountedSurface) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F7F7FC] p-8 text-center">
        <div><TriangleAlert className="mx-auto h-7 w-7 text-amber-500" /><p className="mt-3 text-sm font-extrabold text-zinc-900">Artifact payload is missing</p></div>
      </div>
    );
  }

  const current = artifact ?? mountedSurface;
  const geometry = artifactGeometry(current, width, height, committedSize);
  const liveInteractionEnabled = viewportZoom >= MINIMUM_INTERACTIVE_ZOOM;
  const repositoryBusy = Boolean(activeTransactionRef.current) || (repository && repository.snapshot().status !== "clean" && repository.snapshot().status !== "empty");

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
            data-ns-surface-session-id={surfaceSessionIdRef.current}
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
            onError={() => setRuntimeError("The isolated artboard frame failed to load.")}
          />
        </div>
      )}

      {!surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/88 px-3 py-1.5 text-xs font-bold text-zinc-500 shadow-sm backdrop-blur-xl"><Loader2 className="h-4 w-4 animate-spin text-[#6B5CFF]" />Checking out the artboard…</div>
        </div>
      )}

      {runtimeError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#FFF9F7] p-8 text-center">
          <div><TriangleAlert className="mx-auto h-7 w-7 text-[#FF6B45]" /><p className="mt-3 text-sm font-extrabold text-zinc-900">The artboard repository is blocked</p><p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{runtimeError}</p></div>
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
          {repositoryBusy || visibleMutationLabel ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#6B5CFF]" /> : <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[#6B5CFF]" />}
          <span className="truncate">{visibleMutationLabel || (repositoryBusy ? "Northstar is staging the next commit" : current?.buildState.isBuilding ? current.buildState.message : "Drag the frame or any non-interactive area")}</span>
        </div>
      )}

      {!liveInteractionEnabled && surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full border border-black/[0.06] bg-white/88 px-2.5 py-1 text-[9px] font-[850] text-zinc-500 shadow-md backdrop-blur-xl">Zoom in to use artifact controls</div>
      )}
    </div>
  );
}

const LegacyCodeArtifactHost = memo(
  LegacyCodeArtifactHostImpl,
  (previous: CodeArtifactHostProps, next: CodeArtifactHostProps) =>
    previous.artifact === next.artifact
    && previous.selected === next.selected
    && previous.width === next.width
    && previous.height === next.height
    && previous.viewportZoom === next.viewportZoom,
);

function DirectCodeArtifactHostImpl({
  artifact,
  selected,
  width,
  height,
  viewportZoom,
  onRequestSelect,
  onCanvasDragStart,
  onRuntimeReview,
  onContentSize,
  onCanvasWheel,
}: CodeArtifactHostProps) {
  const architecture = useNorthstarArchitecture();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const unregisterFrameRef = useRef<(() => void) | null>(null);
  const [mountedSurface, setMountedSurface] = useState<CanvasCodeArtifactPayload | undefined>(artifact);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [committedSize, setCommittedSize] = useState<CanvasCodeArtifactContentSize | undefined>();
  const [dragShieldActive, setDragShieldActive] = useState(false);

  const activeSurfaceId = surfaceIdentity(artifact);
  const mountedSurfaceId = surfaceIdentity(mountedSurface);

  useEffect(() => {
    if (!artifact) return;
    const promotingDisplayOnlySurface = Boolean(
      mountedSurface
      && activeSurfaceId === mountedSurfaceId
      && !mountedSurface.document
      && artifact.document
      && artifact.dataBundle,
    );
    const promotingRepositorySurface = Boolean(
      mountedSurface
      && activeSurfaceId === mountedSurfaceId
      && mountedSurface.headCommit
      && !artifact.headCommit
      && artifact.document
      && artifact.dataBundle,
    );
    if (
      !mountedSurface
      || activeSurfaceId !== mountedSurfaceId
      || promotingDisplayOnlySurface
      || promotingRepositorySurface
    ) {
      unregisterFrameRef.current?.();
      unregisterFrameRef.current = null;
      frameRef.current = null;
      setMountedSurface(artifact);
      setSurfaceReady(false);
      setRuntimeError(null);
      setCommittedSize(undefined);
    }
  }, [activeSurfaceId, artifact, mountedSurface, mountedSurfaceId]);

  const runtimeDocument = useMemo(
    () => mountedSurface?.document && mountedSurface.dataBundle
      ? buildCanvasArtifactRuntimeDocument(mountedSurface)
      : undefined,
    [mountedSurface],
  );

  const registerFrame = useCallback((frame: HTMLIFrameElement | null) => {
    unregisterFrameRef.current?.();
    unregisterFrameRef.current = null;
    frameRef.current = frame;
    if (!frame || !mountedSurface || !runtimeDocument) return;
    unregisterFrameRef.current = architecture.registerProjectionFrame({
      artifactId: mountedSurface.artifactId,
      frame,
    });
  }, [architecture, mountedSurface, runtimeDocument]);

  useEffect(() => () => {
    unregisterFrameRef.current?.();
    unregisterFrameRef.current = null;
  }, []);

  useEffect(() => {
    const handlePointerRelease = () => setDragShieldActive(false);
    window.addEventListener("pointerup", handlePointerRelease, true);
    window.addEventListener("pointercancel", handlePointerRelease, true);
    return () => {
      window.removeEventListener("pointerup", handlePointerRelease, true);
      window.removeEventListener("pointercancel", handlePointerRelease, true);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isArtifactRuntimeMessage(event.data) || event.source !== frameRef.current?.contentWindow) return;
      const current = mountedSurface;
      if (!current || event.data.artifactId !== current.artifactId) return;
      const message = event.data;

      if (message.type === "northstar.artifact.ready") {
        frameRef.current?.contentWindow?.postMessage({
          type: "northstar.artifact.set-writer",
          artifactId: current.artifactId,
          writer: "direct-projection",
        }, "*");
        setSurfaceReady(true);
        setRuntimeError(null);
        return;
      }
      if (message.type === "northstar.artifact.runtime-error") {
        setRuntimeError(message.message ?? "The direct projection runtime reported an error.");
        return;
      }
      if (message.type === "northstar.artifact.content-size" && message.size) {
        setCommittedSize(message.size);
        onContentSize(message.size);
        return;
      }
      if (message.type === "northstar.artifact.runtime-review" && message.review) {
        onRuntimeReview(message.review);
        return;
      }
      if (message.type === "northstar.artifact.select") {
        onRequestSelect();
        return;
      }

      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const geometry = artifactGeometry(current, width, height, committedSize);
      const point = {
        x: rect.left + (message.clientX ?? 0) * (rect.width / Math.max(1, geometry.intrinsicWidth)),
        y: rect.top + (message.clientY ?? 0) * (rect.height / Math.max(1, geometry.intrinsicHeight)),
      };
      if (message.type === "northstar.artifact.drag-start") {
        onRequestSelect();
        setDragShieldActive(true);
        onCanvasDragStart(point.x, point.y);
        return;
      }
      if (message.type === "northstar.artifact.wheel") {
        onCanvasWheel({
          clientX: point.x,
          clientY: point.y,
          deltaX: message.deltaX ?? 0,
          deltaY: message.deltaY ?? 0,
          ctrlKey: Boolean(message.ctrlKey),
          metaKey: Boolean(message.metaKey),
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [committedSize, height, mountedSurface, onCanvasDragStart, onCanvasWheel, onContentSize, onRequestSelect, onRuntimeReview, width]);

  if (!artifact && !mountedSurface) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F7F7FC] p-8 text-center">
        <div><TriangleAlert className="mx-auto h-7 w-7 text-amber-500" /><p className="mt-3 text-sm font-extrabold text-zinc-900">Artifact payload is missing</p></div>
      </div>
    );
  }

  const current = mountedSurface ?? artifact!;
  const geometry = artifactGeometry(current, width, height, committedSize);
  const liveInteractionEnabled = viewportZoom >= MINIMUM_INTERACTIVE_ZOOM;

  return (
    <div
      data-northstar-writer="direct-projection"
      className="relative h-full w-full overflow-hidden bg-[#ECECF3] text-zinc-950"
      style={{ contain: "strict", isolation: "isolate" }}
    >
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
          {runtimeDocument ? (
            <iframe
              key={mountedSurfaceId ?? "direct-surface"}
              ref={registerFrame}
              data-testid="northstar-live-artboard-frame"
              data-ns-surface-id={mountedSurfaceId}
              data-ns-writer="direct-projection"
              title={current.title}
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
              onError={() => setRuntimeError("The isolated direct-projection frame failed to load.")}
            />
          ) : mountedSurface.runtimeUrl ? (
            <iframe
              key={mountedSurfaceId ?? "legacy-readonly-surface"}
              ref={registerFrame}
              data-testid="northstar-legacy-artifact-frame"
              data-ns-surface-id={mountedSurfaceId}
              data-ns-writer="display-only"
              title={current.title}
              src={mountedSurface.runtimeUrl}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              loading="eager"
              tabIndex={liveInteractionEnabled ? 0 : -1}
              className="block border-0 bg-white"
              style={{
                width: geometry.intrinsicWidth,
                height: geometry.intrinsicHeight,
                pointerEvents: liveInteractionEnabled && !dragShieldActive ? "auto" : "none",
              }}
              onLoad={() => setSurfaceReady(true)}
              onError={() => setRuntimeError("The existing artifact frame failed to load.")}
            />
          ) : (
            <div
              data-testid="northstar-direct-artifact-incompatible"
              className="grid h-full w-full place-items-center bg-amber-50 p-10 text-center text-sm font-bold text-amber-900"
            >
              This artifact has no renderable document or runtime URL.
            </div>
          )}
        </div>
      )}

      {runtimeDocument && !surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/88 px-3 py-1.5 text-xs font-bold text-zinc-500 shadow-sm backdrop-blur-xl">
            <Loader2 className="h-4 w-4 animate-spin text-[#6B5CFF]" />
            Mounting the direct projection surface…
          </div>
        </div>
      )}

      {runtimeError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#FFF9F7] p-8 text-center">
          <div><TriangleAlert className="mx-auto h-7 w-7 text-[#FF6B45]" /><p className="mt-3 text-sm font-extrabold text-zinc-900">The direct projection surface is blocked</p><p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{runtimeError}</p></div>
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

      {runtimeDocument && selected && surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-40 flex max-w-[70%] -translate-x-1/2 items-center gap-1.5 truncate rounded-full border border-black/[0.06] bg-white/88 px-2.5 py-1 text-[9px] font-[850] text-zinc-500 shadow-md backdrop-blur-xl">
          <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[#6B5CFF]" />
          <span className="truncate">Direct projection owns this artboard</span>
        </div>
      )}

      {!liveInteractionEnabled && surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full border border-black/[0.06] bg-white/88 px-2.5 py-1 text-[9px] font-[850] text-zinc-500 shadow-md backdrop-blur-xl">Zoom in to use artifact controls</div>
      )}
    </div>
  );
}

const DirectCodeArtifactHost = memo(
  DirectCodeArtifactHostImpl,
  (previous, next) =>
    previous.artifact === next.artifact
    && previous.selected === next.selected
    && previous.width === next.width
    && previous.height === next.height
    && previous.viewportZoom === next.viewportZoom,
);

function CodeArtifactHostSwitch(props: CodeArtifactHostProps) {
  const architecture = useNorthstarArchitecture();
  const directWriterOwnsArtifact = Boolean(
    architecture.enabled
    && props.artifact?.artifactId
    && props.artifact.artifactId === architecture.directArtifactId,
  );
  return directWriterOwnsArtifact
    ? <DirectCodeArtifactHost {...props} />
    : <LegacyCodeArtifactHost {...props} />;
}

export const CodeArtifactHost = memo(CodeArtifactHostSwitch);
