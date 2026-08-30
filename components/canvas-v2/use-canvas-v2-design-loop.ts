"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  CANVAS_V2_MAX_CONTEXT_STEPS,
  awaitCanvasV2HumanJudgment,
  canvasV2LoopIsActive,
  completeCanvasV2Loop,
  createCanvasV2Loop,
  failCanvasV2Loop,
  recordCanvasV2CommittedEdit,
  refreshCanvasV2MountOlympusReceipt,
  stopCanvasV2Loop,
  type CanvasV2LoopContinuation,
  type CanvasV2LoopState,
} from "@/lib/canvas-v2/design-loop";
import {
  commitCanvasV2Candidate,
  createCanvasV2CandidateRevision,
  createCanvasV2CommittedRevision,
} from "@/lib/canvas-v2/revisions";
import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2EvidencePacket,
  type CanvasV2ArtifactDocument,
  type CanvasV2ArtifactRevision,
  type CanvasV2CreativeMoveKind,
  type CanvasV2DesignDecision,
  type CanvasV2EditDecision,
  type CanvasV2EvidenceAsset,
  type CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";
import {
  assertCanvasV2SceneTransaction,
  compileCanvasV2SceneTransaction,
  reconcileCanvasV2ObjectAuthorship,
} from "@/lib/canvas-v2/scene-transaction";
import {
  assertCanvasV2ArtifactDocument,
  validateCanvasV2EvidenceBindings,
  validateCanvasV2EvidenceContinuity,
} from "@/lib/canvas-v2/artifact-safety";
import { insertCanvasV2CanonicalFlow } from "@/lib/canvas-v2/flow-insertion";
import { insertCanvasV2EvidencePackets } from "@/lib/canvas-v2/evidence-packet-insertion";
import { mergeCanvasV2EvidencePackets } from "@/lib/canvas-v2/evidence-packets";
import type { CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";
import {
  validateCanvasV2RenderedAnalysisEvidenceScale,
  validateCanvasV2RenderedDesignRegionContentIntegrity,
  validateCanvasV2RenderedDesignRegionLegibility,
  validateCanvasV2RenderedDesignRegionTerritoryIntegrity,
  validateCanvasV2RenderedEvidenceIntegrity,
  validateCanvasV2RenderedIslandNarrativeIntegrity,
  validateCanvasV2RenderedComparisonCommunication,
  validateCanvasV2RenderedRelationshipGeometry,
  repairCanvasV2RenderedDesignRegionTypeFloors,
  invalidCanvasV2RenderedRelationshipNodeIds,
  collidingCanvasV2OptionalRelationshipLabelNodeIds,
} from "@/lib/canvas-v2/evidence-authorship";
import { repairCanvasV2RenderedRelationshipGeometry, retireCanvasV2BrokenAuthoredRelationships, retireCanvasV2CollidingRelationshipLabels } from "@/lib/canvas-v2/source-patch";
import {
  CANVAS_V2_DESIGN_REQUEST_POLICY,
  CanvasV2RequestError,
  canvasV2ProviderUsageFromAttempts,
  canvasV2PublicFailureMessage,
  mergeCanvasV2ProviderUsage,
  requestCanvasV2Json,
  type CanvasV2ProviderAttemptAudit,
  type CanvasV2ProviderUsage,
} from "@/lib/canvas-v2/request-reliability";
import {
  settleCanvasV2ResearchRequirement,
  type CanvasV2ResearchRequirement,
} from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";
import type { CanvasV2ModelSelection } from "@/lib/canvas-v2/model-catalog";
import type { CanvasV2DiscoveryState, CanvasV2DiscoveryStateTransition } from "@/lib/canvas-v2/discovery-state";
import type { CanvasV2ChatAttachment } from "@/lib/canvas-v2/chat-attachments";
import {
  canvasV2FailureAuthority,
  canvasV2PrivateFailureFingerprint,
} from "@/lib/canvas-v2/failure-authority";
import { projectCanvasV2ObservationToNativeScene, type CanvasV2NativeSceneDocument } from "@/lib/canvas-v2/native-scene";
import { validateCanvasV2MultiplayerPlacement } from "@/lib/canvas-v2/multiplayer-placement";
import {
  commitCanvasV2HistoryTransaction,
  createCanvasV2TransactionalHistory,
  travelCanvasV2History,
  type CanvasV2TransactionalHistory,
} from "@/lib/canvas-v2/transactional-history";

interface PendingManualEdit {
  summary: string;
  selectionNodeIds: string[];
}

interface PendingResearch {
  appId: string;
  flowId: string;
}

type PendingCanvasV2Edit = Omit<CanvasV2EditDecision, "moveKind"> & {
  moveKind: CanvasV2CreativeMoveKind;
  relationshipGeometryRecoveryAttempt?: number;
  discoveryState?: CanvasV2DiscoveryState;
  discoveryProgress?: CanvasV2DiscoveryStateTransition["progress"];
};

const STARTER_DOCUMENT = {
  // The workspace is rendered and navigated by the host. The initial artifact
  // therefore contains metadata only—never a second visible rectangle. Model
  // and human authored objects are body-level canvas objects from the start.
  html: `<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true" aria-label="North Star canvas metadata"></template>`,
  css: ``,
};
// First-pass commit remains the health standard. This one bounded correction
// is a last-resort seatbelt for a private browser-render variance; it may not
// cascade into a structural replan or another full discovery cycle.
const MAX_EMERGENCY_RENDER_CORRECTIONS = 1;

function recoverCanvasV2LoopFromCommittedTruth(input: {
  loop: CanvasV2LoopState;
  kind: NonNullable<CanvasV2LoopState["privateRecovery"]>["kind"];
  failures: readonly string[];
  rejectedMove?: string;
  providerAttempts?: readonly CanvasV2ProviderAttemptAudit[];
}): CanvasV2LoopState {
  const failures = input.failures.map((failure) => failure.trim()).filter(Boolean).slice(-12);
  const fingerprint = canvasV2PrivateFailureFingerprint(input.kind, failures);
  const occurrence = input.loop.privateRecovery?.fingerprint === fingerprint
    ? input.loop.privateRecovery.occurrence + 1
    : 1;
  const priorAttempts = [
    ...(input.loop.privateRecovery?.providerAttemptsBeforeRecovery ?? []),
    ...(input.loop.renderRepair?.providerAttemptsBeforeRepair ?? []),
    ...(input.providerAttempts ?? input.loop.providerAttempts ?? []),
  ];
  const recovered: CanvasV2LoopState = {
    ...input.loop,
    status: "thinking",
    retry: undefined,
    privateRecovery: {
      kind: input.kind,
      fingerprint,
      occurrence,
      failures,
      ...(input.rejectedMove ? { rejectedMove: input.rejectedMove } : {}),
      ...(priorAttempts.length ? { providerAttemptsBeforeRecovery: priorAttempts } : {}),
    },
    lastRenderIntegrityFailures: failures,
  };
  delete recovered.renderRepair;
  delete recovered.error;
  delete recovered.pauseReason;
  return recovered;
}

function instructionExplicitlyRequiresNativeRelationships(instruction: string): boolean {
  return /\b(?:connectors?|endpoint(?:-dependent)?|svg|arrows?|curves?|(?:explicit|native|causal|dependency)\s+relationships?|relationship\s+geometry|(?:causal|dependency)\s+(?:paths?|lines?))\b/i.test(instruction);
}

function rejectedCandidateContext(
  document: CanvasV2ArtifactDocument,
  observation: CanvasV2RenderObservation,
): NonNullable<NonNullable<CanvasV2LoopState["renderRepair"]>["rejectedCandidate"]> {
  const content = observation.contentBounds;
  const evidenceGeometry = observation.spatial.evidence
    .filter((item) => {
      const right = item.bounds.x + item.bounds.width;
      const bottom = item.bounds.y + item.bounds.height;
      const outside = item.bounds.x < content.x
        || item.bounds.y < content.y
        || right > content.x + content.width
        || bottom > content.y + content.height;
      return outside || item.clippingAncestorNodeIds.length > 0 || item.role === "analysis-copy";
    })
    .sort((left, right) => Number(right.role === "canonical") - Number(left.role === "canonical"))
    .slice(0, 20)
    .map((item) => ({
      nodeId: item.nodeId,
      evidenceId: item.evidenceId,
      role: item.role,
      sourceNodeId: item.sourceNodeId,
      bounds: item.bounds,
      clippingAncestorNodeIds: item.clippingAncestorNodeIds,
      canonicalPeerHeight: item.canonicalPeerHeight,
      scaleVsCanonicalHeight: item.scaleVsCanonicalHeight,
      designRegionNodeId: item.designRegionNodeId,
      designRegionHeightShare: item.designRegionHeightShare,
      designRegionAreaShare: item.designRegionAreaShare,
      visualRole: item.visualRole,
      treatment: item.treatment,
    }));
  const designRegions = (observation.spatial.designRegions ?? []).slice(0, 24).map((region) => ({ ...region }));
  const relationshipGeometry = (observation.spatial.authoredRelationships ?? []).slice(0, 24).map((relationship) => ({ ...relationship }));
  const nodeIds = Array.from(new Set([
    ...evidenceGeometry.map((item) => item.nodeId),
    ...designRegions.map((item) => String(item.nodeId)),
    ...relationshipGeometry.map((item) => String(item.nodeId)),
  ])).slice(0, 32);
  const nodeHtmlExcerpts = nodeIds.flatMap((nodeId) => {
    const doubleQuoted = document.html.indexOf(`data-canvas-v2-node-id="${nodeId}"`);
    const singleQuoted = document.html.indexOf(`data-canvas-v2-node-id='${nodeId}'`);
    const index = doubleQuoted >= 0 ? doubleQuoted : singleQuoted;
    if (index < 0) return [];
    return [{
      nodeId,
      html: document.html.slice(Math.max(0, index - 500), Math.min(document.html.length, index + 2_500)),
    }];
  });
  return {
    canvasGeometry: {
      contentBounds: observation.contentBounds,
      ...(observation.spatial.authoredSurface?.canonicalLaneBounds
        ? { canonicalLaneBounds: observation.spatial.authoredSurface.canonicalLaneBounds }
        : {}),
      ...(observation.spatial.authoredSurface?.placementOccupants
        ? { placementOccupants: observation.spatial.authoredSurface.placementOccupants.slice(0, 80) }
        : {}),
    },
    evidenceGeometry,
    designRegions,
    relationshipGeometry,
    nodeHtmlExcerpts,
    cssTail: document.css.slice(-18_000),
  };
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useCanvasV2DesignLoop(designEndpoint: string) {
  const initial = useMemo(() => createCanvasV2CommittedRevision({
    id: "canvas-v2-initial-revision",
    document: STARTER_DOCUMENT,
    evidence: [],
    createdAt: new Date().toISOString(),
  }), []);
  const initialHistory = useMemo(() => createCanvasV2TransactionalHistory(initial), [initial]);
  const [committed, setCommitted] = useState<CanvasV2ArtifactRevision>(initial);
  const [history, setHistory] = useState<CanvasV2ArtifactRevision[]>(initialHistory.revisions);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [candidate, setCandidate] = useState<CanvasV2ArtifactRevision>();
  const [pendingEdit, setPendingEdit] = useState<PendingCanvasV2Edit>();
  const [pendingActionKind, setPendingActionKind] = useState<"research" | "design">("design");
  const [pendingResearch, setPendingResearch] = useState<PendingResearch>();
  const [pendingManualEdit, setPendingManualEdit] = useState<PendingManualEdit>();
  const [manualError, setManualError] = useState<string>();
  const [manualNotice, setManualNotice] = useState<string>();
  const [observations, setObservations] = useState<Record<string, CanvasV2RenderObservation>>({});
  const [nativeScene, setNativeScene] = useState<CanvasV2NativeSceneDocument>();
  // Direct manipulation can finish more than once before React has rendered
  // the preceding commit (a quick drag followed by resize is the common
  // case). State-only authority leaves the second gesture reading the prior
  // revision and its release is then discarded as stale. Keep the committed
  // revision and native scene synchronously readable by the event pipeline;
  // React state remains the render subscription, not the transaction lock.
  const committedRef = useRef<CanvasV2ArtifactRevision>(initial);
  const nativeSceneRef = useRef<CanvasV2NativeSceneDocument | undefined>(undefined);
  const inspectionScenesRef = useRef(new Map<string, CanvasV2NativeSceneDocument>());
  const transactionalHistoryRef = useRef<CanvasV2TransactionalHistory>(initialHistory);
  const observationsRef = useRef<Record<string, CanvasV2RenderObservation>>({});
  const [instruction, setInstruction] = useState("");
  const [loop, setLoop] = useState<CanvasV2LoopState>();
  const loopRef = useRef<CanvasV2LoopState | undefined>(undefined);
  const activeRunId = useRef<string | undefined>(undefined);
  const requestController = useRef<AbortController | undefined>(undefined);
  // A discovery run is a sequence of observed transactions. Serialize model
  // requests so a repair, recovery, or late observer cannot race a newer
  // committed revision and make visible progress appear to reverse.
  const modelRequestQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedModelRequestKeys = useRef(new Set<string>());
  const pendingInitialRequest = useRef<{ runId: string; revisionId: string } | undefined>(undefined);
  // One material turn spans every private model/review/repair attempt until a
  // verified revision is promoted. Provider timings alone under-report the
  // person's actual wait, so retain a wall-clock boundary across retries.
  const activeStepStartedAt = useRef<number | undefined>(undefined);
  // Resize observers and iframe load/settle events may publish the same
  // candidate observation more than once before React commits the next state.
  // Settlement is a revision transaction: exactly one observation may accept,
  // reject, or repair a candidate revision.
  const settledCandidateRevisionIds = useRef(new Set<string>());
  // The public canvas is committed truth only. Automatic and manual
  // candidates render in the workspace's off-screen inspection frame and are
  // promoted here only after every rendered-integrity check passes. This
  // prevents rejected geometry from flashing and disappearing in front of the
  // user while preserving the exact render-before-commit architecture.
  const displayed = committed;
  const running = canvasV2LoopIsActive(loop);
  const applyingManualEdit = Boolean(pendingManualEdit && candidate);
  const receiveNativeScene = useCallback((next: CanvasV2NativeSceneDocument) => {
    if (next.revisionId !== committedRef.current.id) {
      // Candidate compilation is hidden, but its collision-free native
      // geometry is the exact scene that must become visible if validation
      // accepts it. Retaining it prevents the committed renderer from
      // reinterpreting source HTML at a different origin one frame later.
      inspectionScenesRef.current.set(next.revisionId, next);
      return;
    }
    // The compiler establishes native truth for a newly committed AI source.
    // A direct manual mutation then updates that scene synchronously. Any
    // later compiler callback for the *same* revision is verification only;
    // it may never replace the already-authoritative native coordinates.
    if (nativeSceneRef.current?.revisionId === next.revisionId) {
      const current = nativeSceneRef.current;
      const nextById = new Map(next.nodes.map((node) => [node.id, node]));
      let flowGeometryChanged = false;
      const nodes = current.nodes.map((node) => {
        // Public-font and normal-flow layout can settle after the hidden
        // compiler has produced the candidate. Accept that one measured
        // refinement for flow nodes only. Absolute objects—including every
        // completed manual move/resize—remain transactionally immutable.
        if (node.layoutMode !== "flow") return node;
        const measured = nextById.get(node.id);
        if (!measured || measured.layoutMode !== "flow") return node;
        const geometryChanged = measured.geometry.x !== node.geometry.x
          || measured.geometry.y !== node.geometry.y
          || measured.geometry.width !== node.geometry.width
          || measured.geometry.height !== node.geometry.height;
        if (!geometryChanged) return node;
        flowGeometryChanged = true;
        return { ...node, geometry: measured.geometry };
      });
      if (!flowGeometryChanged) return;
      const reconciled = { ...current, nodes };
      nativeSceneRef.current = reconciled;
      setNativeScene(reconciled);
      return;
    }
    nativeSceneRef.current = next;
    setNativeScene(next);
    const observed = observationsRef.current[next.revisionId];
    if (observed) {
      const projected = projectCanvasV2ObservationToNativeScene(observed, next);
      observationsRef.current = { ...observationsRef.current, [next.revisionId]: projected };
      setObservations((current) => ({ ...current, [next.revisionId]: projected }));
    }
  }, []);

  const discardInspectionScene = (revisionId?: string) => {
    if (!revisionId) return;
    inspectionScenesRef.current.delete(revisionId);
  };

  const settleCandidateRevision = (revisionId: string): boolean => {
    const settled = settledCandidateRevisionIds.current;
    if (settled.has(revisionId)) return false;
    settled.add(revisionId);
    // Candidate ids are immutable and never reused. Retain the settlement
    // marker after promotion/discard so a late ResizeObserver or load event
    // cannot replay the same transaction against the newly committed parent.
    // Bound the journal for very long-lived canvas sessions.
    while (settled.size > 256) {
      const oldest = settled.values().next().value;
      if (typeof oldest !== "string") break;
      settled.delete(oldest);
    }
    return true;
  };

  const readNativeScene = useCallback(() => {
    const current = nativeSceneRef.current;
    return current?.revisionId === committedRef.current.id ? current : undefined;
  }, []);

  const publishLoop = (next: CanvasV2LoopState | undefined) => {
    const refreshed = next ? refreshCanvasV2MountOlympusReceipt(next) : undefined;
    loopRef.current = refreshed;
    setLoop(refreshed);
  };

  const acceptCommittedRevision = (
    revision: CanvasV2ArtifactRevision,
    transactionId = `user:${revision.id}`,
    selectionNodeIds: readonly string[] = [],
  ) => {
    committedRef.current = revision;
    // Compute and publish history synchronously. A state-updater callback is
    // not a transaction lock: several direct gestures can finish before React
    // executes it, and an undo followed by a new edit must branch from the
    // travelled revision rather than resurrecting the discarded future.
    const nextHistory = commitCanvasV2HistoryTransaction({
      history: transactionalHistoryRef.current,
      revision,
      transactionId,
      selectionNodeIds,
      nativeScene: nativeSceneRef.current?.revisionId === revision.id ? nativeSceneRef.current : undefined,
    });
    transactionalHistoryRef.current = nextHistory;
    setCommitted(revision);
    setHistory(nextHistory.revisions);
    setHistoryIndex(nextHistory.index);
  };

  const askModel = async (
    activeLoop: CanvasV2LoopState,
    revision: CanvasV2ArtifactRevision,
    observation: CanvasV2RenderObservation,
    commitParent: CanvasV2ArtifactRevision = revision,
  ) => {
    if (activeRunId.current !== activeLoop.id) return;
    const controller = new AbortController();
    requestController.current = controller;
    publishLoop({ ...activeLoop, status: "thinking", retry: undefined });
    try {
      const payload = await requestCanvasV2Json<{
        decision?: CanvasV2DesignDecision;
        evidence?: CanvasV2EvidenceAsset[];
        snapshotEvidencePackets?: CanvasV2EvidencePacket[];
        retrievedEvidencePackets?: CanvasV2EvidencePacket[];
        evidencePackets?: CanvasV2EvidencePacket[];
        research?: CanvasV2ResearchResult;
        researchStatus?: CanvasV2ResearchRequirement[];
        discoveryState?: CanvasV2DiscoveryState;
        discoveryProgress?: CanvasV2DiscoveryStateTransition["progress"];
        discoveryQuestion?: { question: string; whyItMatters: string };
        model?: string;
        fallbackUsed?: boolean;
        providerAttempts?: CanvasV2ProviderAttemptAudit[];
        error?: string;
      }>({
        endpoint: designEndpoint,
        signal: controller.signal,
        requestId: `${activeLoop.id}:${revision.id}:phase-${activeLoop.steps.length + 1}`,
        policy: CANVAS_V2_DESIGN_REQUEST_POLICY,
        body: {
          instruction: activeLoop.instruction,
          revision,
          observation,
          run: {
            turn: activeLoop.steps.length + 1,
            currentRunStepCount: activeLoop.steps.length,
            priorSteps: [...(activeLoop.priorSteps ?? []), ...activeLoop.steps].slice(-CANVAS_V2_MAX_CONTEXT_STEPS),
            creativeDirection: activeLoop.creativeDirection,
            spatialStrategy: activeLoop.spatialStrategy,
            compositionState: activeLoop.compositionState,
            researchTargets: activeLoop.researchTargets,
            researchMode: activeLoop.researchMode,
            modelSelection: activeLoop.modelSelection,
            renderRepair: activeLoop.renderRepair,
            privateRecovery: activeLoop.privateRecovery,
            workingContext: activeLoop.workingContext,
            // A new user turn can add a human answer, validation result, or
            // decision before any new canvas revision exists. The active run
            // therefore owns the freshest inquiry state. Preferring the
            // committed revision here made the chat visibly acknowledge the
            // findings and then silently removed their provenance before the
            // discovery director saw them.
            discoveryState: activeLoop.discoveryState ?? revision.discoveryState,
            providerUsage: activeLoop.providerUsage,
            providerUsageCheckpoint: activeLoop.providerUsageCheckpoint,
            // Pixels are sent once for multimodal interpretation (and remain
            // available through any private first-turn repair). After the
            // first verified commit, revision-owned evidence packets carry
            // their exact source without duplicating the chat payload.
            attachments: activeLoop.steps.length === 0 ? activeLoop.attachments : undefined,
          },
        },
        onRetry: (retry) => {
          if (activeRunId.current !== activeLoop.id) return;
          publishLoop({ ...activeLoop, status: "thinking", retry });
        },
      });
      if (activeRunId.current !== activeLoop.id) return;
      const responseProviderUsage = canvasV2ProviderUsageFromAttempts(payload.providerAttempts);
      const cumulativeProviderUsage = mergeCanvasV2ProviderUsage(activeLoop.providerUsage, responseProviderUsage);
      const responseDiscoveryState = payload.discoveryState ?? activeLoop.discoveryState ?? revision.discoveryState;
      const responseDiscoveryProgress = payload.discoveryProgress ?? activeLoop.discoveryProgress ?? (responseDiscoveryState ? (
        payload.discoveryQuestion
          ? { stage: "waiting" as const, label: "Your judgment will shape the answer", detail: "One material choice needs your direction before the canvas changes." }
          : payload.snapshotEvidencePackets?.length || payload.decision?.decision === "research"
            ? { stage: "investigating" as const, label: "Gathering the relevant evidence", detail: "North Star is bringing the source material needed for this decision into view." }
            : payload.decision?.decision === "complete"
              ? { stage: "concluding" as const, label: "Understanding resolved", detail: payload.decision.summary }
              : { stage: "composing" as const, label: "Developing the visual answer", detail: "North Star is shaping the next useful part of the canvas." }
      ) : undefined);
      const phaseProviderAttempts = activeLoop.renderRepair
        ? [...(activeLoop.renderRepair.providerAttemptsBeforeRepair ?? []), ...(payload.providerAttempts ?? [])]
        : activeLoop.privateRecovery
          ? [...(activeLoop.privateRecovery.providerAttemptsBeforeRecovery ?? []), ...(payload.providerAttempts ?? [])]
          : payload.providerAttempts;
      const loopWithProvider: CanvasV2LoopState = {
        ...activeLoop,
        activeModel: payload.model,
        providerAttempts: phaseProviderAttempts,
        providerUsage: cumulativeProviderUsage,
        ...(responseDiscoveryState ? { discoveryState: responseDiscoveryState } : {}),
        ...(responseDiscoveryProgress ? { discoveryProgress: responseDiscoveryProgress } : {}),
      };
      if (payload.discoveryQuestion && payload.discoveryState && payload.discoveryProgress) {
        publishLoop(awaitCanvasV2HumanJudgment(loopWithProvider, {
          discoveryState: payload.discoveryState,
          progress: payload.discoveryProgress,
          clarification: payload.discoveryQuestion,
        }));
        activeRunId.current = undefined;
        return;
      }
      if (payload.snapshotEvidencePackets?.length) {
        const retrievedPackets = mergeCanvasV2EvidencePackets(
          revision.evidencePackets,
          payload.retrievedEvidencePackets ?? payload.snapshotEvidencePackets,
        );
        const packetInsertion = insertCanvasV2EvidencePackets({
          document: revision.document,
          currentEvidence: revision.evidence,
          currentPackets: retrievedPackets,
          packets: payload.snapshotEvidencePackets,
        });
        if (packetInsertion.document.html === revision.document.html && packetInsertion.document.css === revision.document.css) {
          throw new Error("Canvas V2 returned snapshot evidence that is already fully materialized.");
        }
        const sceneTransaction = compileCanvasV2SceneTransaction({
          origin: "research",
          baseRevisionId: revision.id,
          previous: revision.document,
          next: packetInsertion.document,
        });
        const packetDomains = Array.from(new Set(payload.snapshotEvidencePackets.map((packet) => packet.kind === "marketing-signal"
          ? "marketing"
          : packet.kind === "business-record"
            ? "business"
            : packet.source.providerId === "openai-web-search"
              ? "external"
              : "product")));
        const domainLabel = packetDomains.join(" and ");
        const promotedExternalTitles = payload.snapshotEvidencePackets
          .filter((packet) => packet.source.providerId === "openai-web-search")
          .map((packet) => packet.title);
        const snapshotEdit: PendingCanvasV2Edit = {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "edit",
          moveKind: "research",
          creativeDirection: activeLoop.creativeDirection ?? {
            designIntent: "Ground the requested decision in deliberately selected source truth before interpreting it.",
            visualThesis: "Source truth becomes useful when it is visible, inspectable, and bounded on the canvas.",
            compositionStrategy: "Materialize only the source witnesses that earned canvas space, using a native evidence grammar before authored synthesis.",
            visualLanguage: "Premium editorial evidence surfaces with clear hierarchy, provenance, and source boundaries.",
            evidenceStrategy: "Preserve every consulted source in discovery memory while keeping visible evidence selective, cited, and exact.",
            currentFocus: `Make the promoted ${domainLabel} source evidence visible.`,
            unresolvedOpportunities: ["Interpret the newly visible evidence after observing its exact rendered state."],
            nextMoves: ["Interpret the newly visible evidence after observing its exact rendered state."],
          },
          spatialStrategy: activeLoop.spatialStrategy ?? {
            growthDirection: "vertical",
            layoutSystem: "Source-native editorial witnesses placed as inspectable evidence islands on the open working surface.",
            primaryAnchor: "The source title, original URL, and provenance boundary anchor each witness.",
            hierarchyAndScale: "Visual evidence leads at inspection scale; factual findings and metrics follow an open editorial hierarchy.",
            spacingRhythm: "Use generous source-to-source separation and a compact internal evidence cadence.",
            relationshipLogic: "Facts and metrics remain adjacent to the exact captures and sources that authorize them.",
            currentAdjustment: `Place the promoted ${domainLabel} witness before any synthesis is authored.`,
            intentionalOverlaps: [],
          },
          compositionState: activeLoop.compositionState,
          reflection: {
            observedResult: `A material ${domainLabel} source witness was retrieved but was not yet visible on the canvas.`,
            remainingOpportunity: "Interpret the source material only after its native objects pass rendered verification.",
            conceptRead: "This is a source-acquisition move, not a synthesized claim.",
            hierarchyRead: "Each evidence domain receives a distinct source-native hierarchy.",
            evidenceRead: "Every supplied asset, fact, and metric retains its packet and provider lineage.",
            relationshipRead: "Source relationships are explicit; causal relationships are not inferred.",
            legibilityRead: "The packet renderer gives the retrieved material an inspectable canvas footprint.",
            distinctivenessRead: "Each promoted witness uses a visual grammar appropriate to its source type without becoming generic card furniture.",
            nextMoveReason: "Observe and commit the selected witness before asking North Star to reason from the expanded evidence graph.",
          },
          document: packetInsertion.document,
          summary: promotedExternalTitles.length === 1
            ? `Grounded “${promotedExternalTitles[0]}” as a cited external witness.`
            : `Placed ${payload.snapshotEvidencePackets.length} grounded ${domainLabel} source witness${payload.snapshotEvidencePackets.length === 1 ? "" : "es"} on the visible canvas.`,
          expectedVisualResult: "The promoted sources appear as premium, independently selectable evidence objects with original citations and limitations intact.",
          sceneTransaction,
          discoveryState: responseDiscoveryState,
          discoveryProgress: responseDiscoveryProgress,
        };
        setPendingEdit(snapshotEdit);
        setPendingActionKind("research");
        setPendingResearch(undefined);
        setCandidate(createCanvasV2CandidateRevision({
          id: id("snapshot-research-revision"),
          parent: commitParent,
          document: packetInsertion.document,
          evidence: packetInsertion.evidence,
          evidencePackets: packetInsertion.evidencePackets,
          discoveryState: responseDiscoveryState,
          createdAt: new Date().toISOString(),
          sceneTransaction,
        }));
        publishLoop({ ...loopWithProvider, status: "rendering", retry: undefined, researchStatus: payload.researchStatus ?? loopWithProvider.researchStatus });
        return;
      }
      if (!payload.decision) throw new Error(payload.error || "Canvas V2 did not return a decision.");
      if (payload.decision.decision === "complete") {
        // A rendered candidate is still private until every compiler and
        // multiplayer check has accepted it. During a repair turn `revision`
        // is the rejected candidate while `commitParent` remains the public
        // canvas. Letting the model complete from that private document made
        // the run say "Completed" even though the visible committed revision
        // never changed. Completion is authoritative only when the model has
        // observed the exact revision currently owned by the public canvas.
        if (revision.id !== commitParent.id || revision.id !== committedRef.current.id) {
          const renderFailure = activeLoop.renderRepair?.failures?.slice(-3).join(" ");
          throw new Error([
            "North Star cannot complete from an uncommitted render candidate. It must return a corrected edit that passes render-before-commit validation.",
            renderFailure,
          ].filter(Boolean).join(" "));
        }
        publishLoop({
          ...completeCanvasV2Loop(loopWithProvider, payload.decision.summary, payload.decision.creativeDirection, payload.decision.spatialStrategy, payload.decision.compositionState, payload.decision.reflection),
          // A terminal provider response may omit catalog status because no
          // further retrieval decision is needed. Omission cannot erase the
          // locally verified fact that the preceding research transaction is
          // now visibly committed on the canvas.
          researchStatus: payload.researchStatus ?? loopWithProvider.researchStatus,
          providerAttempts: payload.providerAttempts,
          ...(responseDiscoveryState ? { discoveryState: responseDiscoveryState } : {}),
          ...(responseDiscoveryProgress ? { discoveryProgress: responseDiscoveryProgress } : {}),
        });
        activeRunId.current = undefined;
        return;
      }
      if (payload.decision.decision === "research") {
        const app = payload.research?.apps[0];
        const flow = payload.research?.flows[0];
        if (!app || !flow || !payload.research) throw new Error("Canvas V2 returned an incomplete research action.");
        const sequencePacket = payload.research.packets.find((packet) => packet.kind === "screenshot-sequence" && packet.appId === app.id);
        const flowInsertion = insertCanvasV2CanonicalFlow({ document: revision.document, currentEvidence: revision.evidence, app, flow, evidence: payload.research.evidence, packet: sequencePacket });
        const supplementalPackets = payload.research.packets.filter((packet) => packet.id !== sequencePacket?.id);
        // The evidence bridge has already selected these packets for this
        // exact research move. Materialize that selected evidence through the
        // compiler-owned native packet renderer so render-before-commit can
        // verify the same product, marketing, and business truth that later
        // reasoning receives. This is not generic profile furniture: packets
        // that were not selected for the turn never enter this transaction.
        const retainedResearchPackets = mergeCanvasV2EvidencePackets(
          revision.evidencePackets,
          payload.retrievedEvidencePackets,
        );
        const packetInsertion = insertCanvasV2EvidencePackets({
          document: flowInsertion.document,
          currentEvidence: flowInsertion.evidence,
          currentPackets: mergeCanvasV2EvidencePackets(retainedResearchPackets, sequencePacket ? [sequencePacket] : []),
          packets: supplementalPackets,
        });
        const researchDocument = packetInsertion.document;
        const researchEvidence = packetInsertion.evidence;
        const evidencePackets = packetInsertion.evidencePackets;
        const sceneTransaction = compileCanvasV2SceneTransaction({
          origin: "research",
          baseRevisionId: revision.id,
          previous: revision.document,
          next: researchDocument,
        });
        setPendingEdit({
          schema: payload.decision.schema,
          decision: "edit",
          moveKind: payload.decision.moveKind,
          creativeDirection: payload.decision.creativeDirection,
          spatialStrategy: payload.decision.spatialStrategy,
          compositionState: payload.decision.compositionState,
          reflection: payload.decision.reflection,
          document: researchDocument,
          summary: payload.decision.summary,
          expectedVisualResult: payload.decision.expectedVisualResult,
          sceneTransaction,
          discoveryState: responseDiscoveryState,
          discoveryProgress: responseDiscoveryProgress,
        });
        setPendingActionKind("research");
        setPendingResearch({ appId: payload.decision.appId, flowId: payload.decision.flowId });
        const anticipatedResearchStatus = settleCanvasV2ResearchRequirement(
          payload.researchStatus ?? loopWithProvider.researchStatus,
          payload.decision.appId,
          payload.decision.flowId,
        ) ?? [];
        const moreRequiredFlowsRemain = anticipatedResearchStatus.some((requirement) => requirement.state === "unresolved" || requirement.state === "pending");
        setCandidate(createCanvasV2CandidateRevision({ id: id(moreRequiredFlowsRemain ? "research-fast-revision" : "research-revision"), parent: commitParent, document: researchDocument, evidence: researchEvidence, evidencePackets, discoveryState: responseDiscoveryState, createdAt: new Date().toISOString(), sceneTransaction }));
        publishLoop({ ...loopWithProvider, status: "rendering", retry: undefined, researchStatus: payload.researchStatus ?? loopWithProvider.researchStatus });
        return;
      }
      const authoredDecision = {
        ...payload.decision,
        document: reconcileCanvasV2ObjectAuthorship({
          previous: revision.document,
          next: payload.decision.document,
          origin: "northstar",
        }),
      };
      const responseSceneTransaction = authoredDecision.sceneTransaction ?? compileCanvasV2SceneTransaction({
        origin: "northstar",
        baseRevisionId: revision.id,
        previous: revision.document,
        next: authoredDecision.document,
        execution: authoredDecision.islandExecution,
        workingContext: activeLoop.workingContext,
      });
      assertCanvasV2SceneTransaction({
        transaction: responseSceneTransaction,
        baseRevisionId: revision.id,
        previous: revision.document,
        next: authoredDecision.document,
      });
      const committedSceneTransaction = revision.id === commitParent.id
        ? responseSceneTransaction
        : compileCanvasV2SceneTransaction({
            origin: "northstar",
            baseRevisionId: commitParent.id,
            previous: commitParent.document,
            next: authoredDecision.document,
            execution: authoredDecision.islandExecution,
            workingContext: activeLoop.workingContext,
          });
      setPendingEdit({ ...authoredDecision, sceneTransaction: committedSceneTransaction, discoveryState: responseDiscoveryState, discoveryProgress: responseDiscoveryProgress });
      setPendingActionKind("design");
      setPendingResearch(undefined);
      setCandidate(createCanvasV2CandidateRevision({
        id: id("revision"),
        parent: commitParent,
        document: authoredDecision.document,
        evidence: payload.evidence,
        evidencePackets: payload.evidencePackets,
        discoveryState: responseDiscoveryState,
        createdAt: new Date().toISOString(),
        sceneTransaction: committedSceneTransaction,
      }));
      publishLoop({ ...loopWithProvider, status: "rendering", retry: undefined, researchStatus: payload.researchStatus ?? loopWithProvider.researchStatus });
    } catch (requestError) {
      if (controller.signal.aborted || activeRunId.current !== activeLoop.id) return;
      const authority = canvasV2FailureAuthority(requestError);
      if (authority === "silent-cancel") return;
      const message = canvasV2PublicFailureMessage(requestError);
      const failedProviderAttempts = requestError instanceof CanvasV2RequestError
        ? requestError.providerAttempts
        : undefined;
      const usageAwareLoop: CanvasV2LoopState = failedProviderAttempts?.length
        ? {
            ...activeLoop,
            providerAttempts: failedProviderAttempts,
            providerUsage: mergeCanvasV2ProviderUsage(
              activeLoop.providerUsage,
              canvasV2ProviderUsageFromAttempts(failedProviderAttempts),
            ),
          }
        : activeLoop;
      if (authority === "private-contract") {
        discardInspectionScene(candidate?.id);
        setCandidate(undefined);
        setPendingEdit(undefined);
        setPendingActionKind("design");
        setPendingResearch(undefined);
        const failureDetails = [
          requestError instanceof Error ? requestError.message : "The private phase contract was not satisfied.",
          ...(failedProviderAttempts ?? []).flatMap((attempt) => attempt.detail ? [attempt.detail] : []),
        ];
        const recoveryLoop = recoverCanvasV2LoopFromCommittedTruth({
          loop: usageAwareLoop,
          kind: "phase-contract",
          failures: failureDetails,
          providerAttempts: failedProviderAttempts,
        });
        publishLoop(recoveryLoop);
        const publicRevision = committedRef.current;
        const publicObservation = observationsRef.current[publicRevision.id];
        if (publicObservation) enqueueModelRequest(recoveryLoop, publicRevision, publicObservation);
        else pendingInitialRequest.current = { runId: recoveryLoop.id, revisionId: publicRevision.id };
        return;
      }
      publishLoop(failCanvasV2Loop(usageAwareLoop, message));
      activeRunId.current = undefined;
    } finally {
      if (requestController.current === controller) requestController.current = undefined;
    }
  };

  const enqueueModelRequest = (
    activeLoop: CanvasV2LoopState,
    revision: CanvasV2ArtifactRevision,
    observation: CanvasV2RenderObservation,
    commitParent: CanvasV2ArtifactRevision = revision,
  ) => {
    const requestKey = [
      activeLoop.id,
      revision.id,
      commitParent.id,
      `turn-${activeLoop.steps.length + 1}`,
      `repair-${activeLoop.renderRepair?.attempt ?? 0}`,
      `recovery-${activeLoop.privateRecovery?.fingerprint ?? "none"}-${activeLoop.privateRecovery?.occurrence ?? 0}`,
    ].join(":");
    if (queuedModelRequestKeys.current.has(requestKey)) return;
    queuedModelRequestKeys.current.add(requestKey);
    const queued = modelRequestQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (activeRunId.current !== activeLoop.id) return;
        await askModel(activeLoop, revision, observation, commitParent);
      })
      .finally(() => {
        queuedModelRequestKeys.current.delete(requestKey);
      });
    modelRequestQueue.current = queued;
  };

  const start = (
    currentInstruction = instruction,
    currentObservation?: CanvasV2RenderObservation,
    continuation?: CanvasV2LoopContinuation,
    researchTargets?: string[],
    researchMode?: CanvasV2ResearchMode,
    modelSelection?: CanvasV2ModelSelection,
    workingContext?: CanvasV2WorkingContext,
    discoveryState?: CanvasV2DiscoveryState,
    initialProviderUsage?: CanvasV2ProviderUsage,
    attachments?: CanvasV2ChatAttachment[],
    routerProviderAttempts?: CanvasV2ProviderAttemptAudit[],
  ): string | undefined => {
    const objective = currentInstruction.trim();
    if (!objective || activeRunId.current || canvasV2LoopIsActive(loopRef.current)) return undefined;
    // A candidate without an active automatic or manual render is orphaned UI
    // state. It must never leave the primary run action looking enabled while
    // silently refusing the user's objective.
    if (candidate) {
      discardInspectionScene(candidate.id);
      setCandidate(undefined);
      setPendingEdit(undefined);
      setPendingManualEdit(undefined);
      setPendingActionKind("design");
      setPendingResearch(undefined);
    }
    const nextLoop = createCanvasV2Loop({ id: id("run"), instruction: objective, continuation, researchTargets, researchMode, modelSelection, workingContext, discoveryState, providerUsage: initialProviderUsage, routerProviderAttempts, attachments });
    activeStepStartedAt.current = Date.now();
    activeRunId.current = nextLoop.id;
    publishLoop(nextLoop);
    const currentCommitted = committedRef.current;
    const observation = currentObservation?.revisionId === currentCommitted.id
      ? currentObservation
      : observationsRef.current[currentCommitted.id];
    if (!observation) {
      pendingInitialRequest.current = { runId: nextLoop.id, revisionId: currentCommitted.id };
      return nextLoop.id;
    }
    enqueueModelRequest(nextLoop, currentCommitted, observation);
    return nextLoop.id;
  };

  const stop = () => {
    const activeLoop = loopRef.current;
    if (pendingManualEdit && candidate) {
      discardInspectionScene(candidate.id);
      setCandidate(undefined);
      setPendingManualEdit(undefined);
      setManualError(undefined);
      setManualNotice("Stopped the uncommitted manual revision. The latest committed canvas remains visible.");
      return;
    }
    if (!activeLoop || !canvasV2LoopIsActive(activeLoop)) return;
    requestController.current?.abort();
    requestController.current = undefined;
    queuedModelRequestKeys.current.clear();
    pendingInitialRequest.current = undefined;
    activeRunId.current = undefined;
    discardInspectionScene(candidate?.id);
    setCandidate(undefined);
    setPendingEdit(undefined);
    setPendingActionKind("design");
    setPendingResearch(undefined);
    publishLoop(stopCanvasV2Loop(activeLoop));
  };

  const applyManualDocument = (
    document: CanvasV2ArtifactDocument,
    summary: string,
    evidence?: readonly CanvasV2EvidenceAsset[],
    nativeSceneRevision?: CanvasV2NativeSceneDocument,
    options: { allowEvidenceRemoval?: boolean; selectionNodeIds?: readonly string[]; evidencePackets?: CanvasV2ArtifactRevision["evidencePackets"] } = {},
  ): boolean => {
    // Native object edits already carry measured, finite-canvas geometry. They
    // do not need to wait for the compatibility HTML compiler to rediscover
    // geometry the native scene owns. Keeping them in the candidate pipeline
    // made the canvas look ready while a hidden transaction still rejected a
    // quick follow-up resize/group action. Validate source safety, then commit
    // native truth synchronously; the off-screen compiler remains a verifier.
    const currentCommitted = committedRef.current;
    if (running || candidate || (!nativeSceneRevision && !observationsRef.current[currentCommitted.id])) return false;
    if (nativeSceneRevision && nativeSceneRevision.revisionId !== currentCommitted.id) return false;
    try {
      const safeDocument = assertCanvasV2ArtifactDocument(document);
      const nextEvidence = evidence ?? currentCommitted.evidence;
      const failures = [
        ...validateCanvasV2EvidenceBindings(safeDocument, nextEvidence),
        ...validateCanvasV2EvidenceContinuity(currentCommitted.document, safeDocument, nextEvidence, {
          allowUserEvidenceRemoval: options.allowEvidenceRemoval,
        }),
      ];
      if (failures.length) throw new Error(Array.from(new Set(failures)).join(" "));
      const nextCandidate = createCanvasV2CandidateRevision({
        id: id("manual-revision"),
        parent: currentCommitted,
        document: safeDocument,
        evidence: nextEvidence,
        evidencePackets: options.evidencePackets,
        createdAt: new Date().toISOString(),
        sceneTransaction: compileCanvasV2SceneTransaction({
          origin: "user",
          baseRevisionId: currentCommitted.id,
          previous: currentCommitted.document,
          next: safeDocument,
        }),
      });
      setManualError(undefined);
      setManualNotice(undefined);
      if (nativeSceneRevision) {
        const nextCommitted = commitCanvasV2Candidate({ candidate: nextCandidate, expectedParentId: currentCommitted.id });
        const nextNativeScene = { ...nativeSceneRevision, revisionId: nextCommitted.id };
        nativeSceneRef.current = nextNativeScene;
        setNativeScene(nextNativeScene);
        acceptCommittedRevision(nextCommitted, `user:${nextCommitted.id}`, options.selectionNodeIds);
        setManualNotice(summary);
        return true;
      }
      setPendingManualEdit({ summary, selectionNodeIds: [...(options.selectionNodeIds ?? [])] });
      setCandidate(nextCandidate);
      return true;
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "The manual revision could not be validated.");
      return false;
    }
  };

  const receiveObservation = (observation: CanvasV2RenderObservation) => {
    // ResizeObserver/load callbacks can outlive the React render that created
    // them. The loop ref is updated synchronously by publishLoop and is the
    // transaction authority; using the captured `loop` here can lose a
    // just-published repair attempt and incorrectly treat its observation as
    // a fresh rejection (or pause it with the previous phase's state).
    const activeLoop = loopRef.current;
    const publicCommitted = committedRef.current;
    const observedScene = nativeSceneRef.current?.revisionId === observation.revisionId
      ? nativeSceneRef.current
      : inspectionScenesRef.current.get(observation.revisionId);
    // Candidate compilation normalizes user-detached objects into the same
    // native world the public renderer will promote. Validate that normalized
    // scene, not the compatibility DOM's semantic nesting; otherwise a card
    // the person moved correctly appears to overflow/collide with its former
    // parent on the next AI turn.
    const projectedObservation = observedScene ? projectCanvasV2ObservationToNativeScene(observation, observedScene) : observation;
    const previousObservation = observationsRef.current[publicCommitted.id];
    // Hidden deterministic repairs do not change canonical evidence rails.
    // Reuse their already-verified detail atlas instead of recapturing dozens
    // of product screenshots before the same composition can commit.
    const factualObservation = projectedObservation.railDetails?.length || !previousObservation?.railDetails?.length
      ? projectedObservation
      : { ...projectedObservation, railDetails: previousObservation.railDetails };
    observationsRef.current = { ...observationsRef.current, [observation.revisionId]: factualObservation };
    setObservations((current) => ({ ...current, [observation.revisionId]: factualObservation }));
    if (!candidate
      && activeLoop
      && activeRunId.current === activeLoop.id
      && pendingInitialRequest.current?.runId === activeLoop.id
      && pendingInitialRequest.current.revisionId === observation.revisionId) {
      pendingInitialRequest.current = undefined;
      enqueueModelRequest(activeLoop, publicCommitted, factualObservation);
      return;
    }
    if (candidate && observation.revisionId === candidate.id) {
      if (!settleCandidateRevision(candidate.id)) return;
    }
    if (candidate && !pendingManualEdit && activeRunId.current !== activeLoop?.id) return;
    if (candidate && observation.revisionId === candidate.id) {
      if (pendingManualEdit) {
        // Human-authored geometry is canvas truth once the candidate renders.
        // The source-level checks in applyManualDocument already protect
        // evidence identity, provenance, and continuity. Re-running the AI's
        // composition-quality rules here used to reject legitimate direct
        // manipulation—most visibly moving or resizing a canonical evidence
        // screen because it no longer formed the AI-authored rail. Grounded
        // evidence remains protected from deletion, but its placement, size,
        // fit, rotation, and presentation belong to the user.
        try {
          const nextCommitted = commitCanvasV2Candidate({ candidate, expectedParentId: committedRef.current.id });
          acceptCommittedRevision(nextCommitted, `user:${nextCommitted.id}`, pendingManualEdit.selectionNodeIds);
          setManualNotice(pendingManualEdit.summary);
        } catch (error) {
          setManualError(error instanceof Error ? error.message : "The manual revision could not be committed.");
        }
        discardInspectionScene(candidate.id);
        setCandidate(undefined);
        setPendingManualEdit(undefined);
        return;
      }
      const relationshipFailures = validateCanvasV2RenderedRelationshipGeometry(factualObservation);
      const legibilityFailures = validateCanvasV2RenderedDesignRegionLegibility(factualObservation);
      const otherNonRelationshipIntegrityFailures = [
        ...validateCanvasV2RenderedEvidenceIntegrity(candidate.document, factualObservation),
        ...validateCanvasV2RenderedAnalysisEvidenceScale(factualObservation),
        ...validateCanvasV2RenderedDesignRegionContentIntegrity(factualObservation),
        ...validateCanvasV2RenderedDesignRegionTerritoryIntegrity(factualObservation),
        ...validateCanvasV2RenderedIslandNarrativeIntegrity(factualObservation),
        ...(pendingEdit?.moveKind !== "research" && activeLoop?.instruction
          ? validateCanvasV2RenderedComparisonCommunication(factualObservation, activeLoop.instruction, {
              storyRole: pendingEdit?.islandExecution?.target.storyRole,
            })
          : []),
        ...(pendingEdit?.sceneTransaction && observationsRef.current[publicCommitted.id]
          ? validateCanvasV2MultiplayerPlacement({
              previous: observationsRef.current[publicCommitted.id],
              candidate: factualObservation,
              transaction: pendingEdit.sceneTransaction,
            })
          : []),
      ];
      const nonRelationshipIntegrityFailures = [...otherNonRelationshipIntegrityFailures, ...legibilityFailures];
      const integrityFailures = [...nonRelationshipIntegrityFailures, ...relationshipFailures];
      if (integrityFailures.length) {
        const hasDeterministicTypeFloorFailures = legibilityFailures
          .some((failure) => /below the canvas-scale legibility floor/i.test(failure));
        if (hasDeterministicTypeFloorFailures && pendingEdit && activeLoop?.status === "rendering") {
          const recoveredDocument = repairCanvasV2RenderedDesignRegionTypeFloors(candidate.document, factualObservation);
          if (recoveredDocument !== candidate.document) {
            const commitParent = committedRef.current;
            const recoveredTransaction = compileCanvasV2SceneTransaction({
              origin: "northstar",
              baseRevisionId: commitParent.id,
              previous: commitParent.document,
              next: recoveredDocument,
              execution: pendingEdit.islandExecution,
              workingContext: activeLoop.workingContext,
            });
            discardInspectionScene(candidate.id);
            setPendingEdit({ ...pendingEdit, document: recoveredDocument, sceneTransaction: recoveredTransaction });
            setCandidate(createCanvasV2CandidateRevision({
              id: id("type-floor-recovery-revision"),
              parent: commitParent,
              document: recoveredDocument,
              evidence: candidate.evidence,
              evidencePackets: candidate.evidencePackets,
              discoveryState: candidate.discoveryState,
              createdAt: new Date().toISOString(),
              sceneTransaction: recoveredTransaction,
            }));
            // Browser-measured type floors are deterministic compiler policy.
            // Correct exact undersized leaves and re-observe privately before
            // asking a model to solve any remaining creative defect. This also
            // keeps an unrelated spacing/collision failure from turning fixed
            // pixel floors into repeated provider repair work.
            publishLoop({ ...activeLoop, status: "rendering" });
            return;
          }
        }
        const collidingRelationshipLabelNodeIds = collidingCanvasV2OptionalRelationshipLabelNodeIds(factualObservation);
        if (collidingRelationshipLabelNodeIds.length && pendingEdit && activeLoop?.status === "rendering") {
          const recoveredDocument = retireCanvasV2CollidingRelationshipLabels(candidate.document, collidingRelationshipLabelNodeIds);
          if (recoveredDocument !== candidate.document) {
            const commitParent = committedRef.current;
            const recoveredTransaction = compileCanvasV2SceneTransaction({
              origin: "northstar",
              baseRevisionId: commitParent.id,
              previous: commitParent.document,
              next: recoveredDocument,
              execution: pendingEdit.islandExecution,
              workingContext: activeLoop.workingContext,
            });
            discardInspectionScene(candidate.id);
            setPendingEdit({ ...pendingEdit, document: recoveredDocument, sceneTransaction: recoveredTransaction });
            setCandidate(createCanvasV2CandidateRevision({
              id: id("relationship-label-recovery-revision"),
              parent: commitParent,
              document: recoveredDocument,
              evidence: candidate.evidence,
              discoveryState: candidate.discoveryState,
              createdAt: new Date().toISOString(),
              sceneTransaction: recoveredTransaction,
            }));
            // Optional SVG verbs never consume a provider correction. Remove
            // only the exact colliding labels, then re-observe the unchanged
            // required paths and stage objects through the normal private gate.
            publishLoop({ ...activeLoop, status: "rendering" });
            return;
          }
        }
        const invalidRelationshipNodeIds = new Set(invalidCanvasV2RenderedRelationshipNodeIds(factualObservation));
        const relationshipGeometryRecoveryAttempt = pendingEdit?.relationshipGeometryRecoveryAttempt ?? 0;
        if (relationshipFailures.length
          && invalidRelationshipNodeIds.size
          && relationshipGeometryRecoveryAttempt < 2
          && pendingEdit
          && activeLoop?.status === "rendering") {
          const invalidRelationships = (factualObservation.spatial.authoredRelationships ?? [])
            .filter((relationship) => invalidRelationshipNodeIds.has(relationship.nodeId));
          const recoveredDocument = repairCanvasV2RenderedRelationshipGeometry(candidate.document, invalidRelationships);
          if (recoveredDocument !== candidate.document) {
            const commitParent = committedRef.current;
            const recoveredTransaction = compileCanvasV2SceneTransaction({
              origin: "northstar",
              baseRevisionId: commitParent.id,
              previous: commitParent.document,
              next: recoveredDocument,
              execution: pendingEdit.islandExecution,
              workingContext: activeLoop.workingContext,
            });
            discardInspectionScene(candidate.id);
            setPendingEdit({
              ...pendingEdit,
              document: recoveredDocument,
              sceneTransaction: recoveredTransaction,
              relationshipGeometryRecoveryAttempt: relationshipGeometryRecoveryAttempt + 1,
            });
            setCandidate(createCanvasV2CandidateRevision({
              id: id("relationship-geometry-recovery-revision"),
              parent: commitParent,
              document: recoveredDocument,
              evidence: candidate.evidence,
              discoveryState: candidate.discoveryState,
              createdAt: new Date().toISOString(),
              sceneTransaction: recoveredTransaction,
            }));
            // Endpoint coordinates are a browser-measured clerical concern,
            // not a creative model decision. Re-observe the corrected private
            // candidate before consuming another provider repair attempt.
            publishLoop({ ...activeLoop, status: "rendering" });
            return;
          }
        }
        discardInspectionScene(candidate.id);
        setCandidate(undefined);
        setPendingActionKind("design");
        setPendingResearch(undefined);
        if (activeLoop?.status === "rendering") {
          if (!nonRelationshipIntegrityFailures.length
            && pendingEdit
            && !instructionExplicitlyRequiresNativeRelationships(activeLoop.instruction)) {
            const invalidRelationshipNodeIds = invalidCanvasV2RenderedRelationshipNodeIds(factualObservation);
            const recoveredDocument = retireCanvasV2BrokenAuthoredRelationships(candidate.document, invalidRelationshipNodeIds);
            if (recoveredDocument !== candidate.document) {
              const commitParent = committedRef.current;
              const recoveredTransaction = compileCanvasV2SceneTransaction({
                origin: "northstar",
                baseRevisionId: commitParent.id,
                previous: commitParent.document,
                next: recoveredDocument,
                execution: pendingEdit.islandExecution,
                workingContext: activeLoop.workingContext,
              });
              setPendingEdit({ ...pendingEdit, document: recoveredDocument, sceneTransaction: recoveredTransaction });
              setCandidate(createCanvasV2CandidateRevision({
                id: id("relationship-recovery-revision"),
                parent: commitParent,
                document: recoveredDocument,
                evidence: candidate.evidence,
                discoveryState: candidate.discoveryState,
                createdAt: new Date().toISOString(),
                sceneTransaction: recoveredTransaction,
              }));
              // Keep the compiler-owned fallback private and run the same
              // render-before-commit gate again. Endpoint distances remain in
              // diagnostics, never in a red user-facing terminal failure.
              publishLoop({ ...activeLoop, status: "rendering" });
              return;
            }
          }
          const repairAttempt = (activeLoop.renderRepair?.attempt ?? 0) + 1;
          if (repairAttempt <= MAX_EMERGENCY_RENDER_CORRECTIONS) {
            const failedMove = [pendingEdit?.summary, pendingEdit?.expectedVisualResult].filter(Boolean).join(" — ").slice(0, 1_600);
            const originalMove = activeLoop.renderRepair?.originalMove ?? (pendingEdit ? {
              summary: pendingEdit.summary,
              expectedVisualResult: pendingEdit.expectedVisualResult,
            } : undefined);
            setPendingEdit(undefined);
            const repairLoop: CanvasV2LoopState = {
              ...activeLoop,
              status: "thinking",
              lastRenderIntegrityFailures: integrityFailures.slice(-12),
              renderRepair: {
                attempt: repairAttempt,
                maxAttempts: MAX_EMERGENCY_RENDER_CORRECTIONS,
                failures: [...(activeLoop.renderRepair?.failures ?? []), ...integrityFailures].slice(-12),
                ...(failedMove ? { failedMove } : {}),
                ...(originalMove ? { originalMove } : {}),
                providerAttemptsBeforeRepair: activeLoop.renderRepair?.providerAttemptsBeforeRepair ?? activeLoop.providerAttempts,
                ...(pendingEdit?.islandExecution ? { islandExecution: pendingEdit.islandExecution } : {}),
                rejectedCandidate: rejectedCandidateContext(candidate.document, factualObservation),
              },
            };
            publishLoop(repairLoop);
            const repairFromCommitted = pendingEdit?.islandExecution?.target.action === "recompose";
            const repairRevision = repairFromCommitted ? publicCommitted : candidate;
            const repairObservation = repairFromCommitted
              ? (observationsRef.current[publicCommitted.id] ?? factualObservation)
              : factualObservation;
            enqueueModelRequest(repairLoop, repairRevision, repairObservation, publicCommitted);
            return;
          }
          setPendingEdit(undefined);
          // The emergency correction was still private. Replan a genuinely new
          // bounded move from committed truth with the exact failure evidence;
          // a validator is never allowed to manufacture a user checkpoint.
          const failures = [
            ...(activeLoop.renderRepair?.failures ?? activeLoop.lastRenderIntegrityFailures ?? []),
            ...integrityFailures,
          ].slice(-12);
          const recoveryLoop = recoverCanvasV2LoopFromCommittedTruth({
            loop: activeLoop,
            kind: "render-integrity",
            failures,
            rejectedMove: [pendingEdit?.summary, pendingEdit?.expectedVisualResult].filter(Boolean).join(" — ").slice(0, 1_600),
          });
          publishLoop(recoveryLoop);
          const publicObservation = observationsRef.current[publicCommitted.id];
          if (publicObservation) enqueueModelRequest(recoveryLoop, publicCommitted, publicObservation);
          else pendingInitialRequest.current = { runId: recoveryLoop.id, revisionId: publicCommitted.id };
        }
        return;
      }
    }
    if (!candidate || !pendingEdit || !activeLoop || activeLoop.status !== "rendering" || observation.revisionId !== candidate.id) return;
    const commitParent = committedRef.current;
    // An observer callback belongs to the render that created it. If another
    // accepted observation has already advanced public truth, this callback is
    // superseded and must be a no-op—not a user-visible stale-parent failure.
    // The active render owns its own newer callback and will settle normally.
    if (candidate.parentId !== commitParent.id) return;
    const nextCommitted = commitCanvasV2Candidate({ candidate, expectedParentId: commitParent.id });
    // The candidate itself is authoritative. React state can still contain the
    // previous turn's action kind when a fast deterministic research render is
    // captured in the same frame that scheduled setPendingActionKind.
    const committedActionKind = pendingEdit.moveKind === "research" ? "research" : pendingActionKind;
    const committedDiscoveryProgress = committedActionKind === "research"
      ? {
          stage: "composing" as const,
          label: "Reading the grounded evidence",
          detail: "North Star is comparing what is now visible on the canvas and choosing the highest-value next move.",
        }
      : pendingEdit.discoveryProgress ?? activeLoop.discoveryProgress;
    const nextLoop = recordCanvasV2CommittedEdit({
      loop: activeLoop,
      revisionId: nextCommitted.id,
      summary: activeLoop.renderRepair?.originalMove?.summary ?? pendingEdit.summary,
      expectedVisualResult: activeLoop.renderRepair?.originalMove?.expectedVisualResult ?? pendingEdit.expectedVisualResult,
      kind: committedActionKind,
      moveKind: pendingEdit.moveKind,
      creativeDirection: pendingEdit.creativeDirection,
      spatialStrategy: pendingEdit.spatialStrategy,
      compositionState: pendingEdit.compositionState,
      islandExecution: pendingEdit.islandExecution,
      reflection: pendingEdit.reflection,
      elapsedMs: Date.now() - (activeStepStartedAt.current ?? Date.now()),
      researchStatus: pendingResearch
        ? settleCanvasV2ResearchRequirement(activeLoop.researchStatus, pendingResearch.appId, pendingResearch.flowId)
        : activeLoop.researchStatus,
      discoveryState: nextCommitted.discoveryState,
      discoveryProgress: committedDiscoveryProgress,
    });
    const acceptedScene = inspectionScenesRef.current.get(candidate.id);
    if (acceptedScene) {
      nativeSceneRef.current = acceptedScene;
      setNativeScene(acceptedScene);
    }
    discardInspectionScene(candidate.id);
    acceptCommittedRevision(
      nextCommitted,
      `northstar:${activeLoop.historyTransactionId}`,
      nextLoop.workingContext?.selectedNodeIds ?? activeLoop.workingContext?.selectedNodeIds,
    );
    setCandidate(undefined);
    setPendingEdit(undefined);
    setPendingActionKind("design");
    setPendingResearch(undefined);
    publishLoop(nextLoop);
    activeStepStartedAt.current = Date.now();
    if (nextLoop.status === "thinking") enqueueModelRequest(nextLoop, nextCommitted, factualObservation);
    else activeRunId.current = undefined;
  };

  const captureFailed = (message: string) => {
    const activeLoop = loopRef.current;
    if (pendingManualEdit && candidate) {
      discardInspectionScene(candidate.id);
      setCandidate(undefined);
      setPendingManualEdit(undefined);
      setManualNotice(undefined);
      setManualError(message);
      return;
    }
    if (activeRunId.current !== activeLoop?.id) return;
    if (!activeLoop || activeLoop.status !== "rendering") return;
    discardInspectionScene(candidate?.id);
    setCandidate(undefined);
    setPendingEdit(undefined);
    setPendingActionKind("design");
    setPendingResearch(undefined);
    // A browser capture is private verification. Replan from the committed
    // revision instead of exposing a validator checkpoint or submitting the
    // same unobservable candidate again.
    const recoveryLoop = recoverCanvasV2LoopFromCommittedTruth({
      loop: activeLoop,
      kind: "capture",
      failures: [message],
      rejectedMove: [pendingEdit?.summary, pendingEdit?.expectedVisualResult].filter(Boolean).join(" — ").slice(0, 1_600),
    });
    publishLoop(recoveryLoop);
    const publicRevision = committedRef.current;
    const publicObservation = observationsRef.current[publicRevision.id];
    if (publicObservation) enqueueModelRequest(recoveryLoop, publicRevision, publicObservation);
    else pendingInitialRequest.current = { runId: recoveryLoop.id, revisionId: publicRevision.id };
  };

  const travelHistory = (direction: -1 | 1) => {
    if (running || candidate) return;
    const nextHistory = travelCanvasV2History(transactionalHistoryRef.current, direction);
    if (nextHistory.index === transactionalHistoryRef.current.index) return;
    transactionalHistoryRef.current = nextHistory;
    const revision = nextHistory.revisions[nextHistory.index];
    const restoredNativeScene = nextHistory.nativeScenes[nextHistory.index]
      ? structuredClone(nextHistory.nativeScenes[nextHistory.index])
      : undefined;
    setHistoryIndex(nextHistory.index);
    committedRef.current = revision;
    nativeSceneRef.current = restoredNativeScene;
    setNativeScene(restoredNativeScene);
    setCommitted(revision);
    publishLoop(undefined);
    setManualError(undefined);
    setManualNotice(undefined);
    return {
      revisionId: revision.id,
      selectionNodeIds: [...(nextHistory.selectionNodeIds[nextHistory.index] ?? [])],
    };
  };

  return {
    committed,
    displayed,
    inspectionCandidate: candidate,
    inspectionRelocatableNodeIds: (() => {
      const execution = pendingEdit?.islandExecution;
      if (!execution) return [];
      const wholeBoard = execution.target.action === "recompose";
      const exactPlacementRepair = execution.target.action === "repair"
        && ["above", "below", "left", "right"].includes(execution.territory.relation)
        ? execution.target.islandId
        : undefined;
      if (!wholeBoard && !exactPlacementRepair) return [];
      return (nativeScene?.rootIds ?? []).flatMap((rootId) => {
        const node = nativeScene?.nodes.find((candidate) => candidate.id === rootId);
        if (!node?.sourceNodeId || node.userEdited || node.locked) return [];
        if (node.attributes["data-canvas-v2-origin"] !== "northstar") return [];
        if (node.attributes["data-canvas-v2-design-region"] === undefined) return [];
        if (exactPlacementRepair && node.sourceNodeId !== exactPlacementRepair) return [];
        return [node.sourceNodeId];
      });
    })(),
    instruction,
    setInstruction,
    loop,
    running,
    applyingManualEdit,
    manualSummary: pendingManualEdit?.summary,
    manualError,
    manualNotice,
    history,
    historyIndex,
    canUndo: historyIndex > 0 && !running && !candidate,
    canRedo: historyIndex < history.length - 1 && !running && !candidate,
    ready: Boolean(observations[committed.id]),
    displayedObservation: observations[displayed.id],
    start,
    stop,
    applyManualDocument,
    nativeScene: nativeScene?.revisionId === committed.id ? nativeScene : undefined,
    readNativeScene,
    receiveNativeScene,
    undo: () => travelHistory(-1),
    redo: () => travelHistory(1),
    receiveObservation,
    captureFailed,
  };
}
