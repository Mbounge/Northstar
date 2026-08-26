"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  CANVAS_V2_MAX_CONTEXT_STEPS,
  canvasV2LoopIsActive,
  completeCanvasV2Loop,
  createCanvasV2Loop,
  failCanvasV2Loop,
  pauseCanvasV2Loop,
  recoverCanvasV2LoopAfterRejectedCandidate,
  recordCanvasV2CommittedEdit,
  stopCanvasV2Loop,
  type CanvasV2LoopContinuation,
  type CanvasV2LoopState,
} from "@/lib/canvas-v2/design-loop";
import {
  commitCanvasV2Candidate,
  createCanvasV2CandidateRevision,
  createCanvasV2CommittedRevision,
} from "@/lib/canvas-v2/revisions";
import type {
  CanvasV2ArtifactDocument,
  CanvasV2ArtifactRevision,
  CanvasV2CreativeMoveKind,
  CanvasV2DesignDecision,
  CanvasV2EditDecision,
  CanvasV2EvidenceAsset,
  CanvasV2RenderObservation,
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
import type { CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";
import {
  validateCanvasV2RenderedAnalysisEvidenceScale,
  validateCanvasV2RenderedDesignRegionContentIntegrity,
  validateCanvasV2RenderedDesignRegionLegibility,
  validateCanvasV2RenderedDesignRegionTerritoryIntegrity,
  validateCanvasV2RenderedEvidenceIntegrity,
  validateCanvasV2RenderedIslandNarrativeIntegrity,
  validateCanvasV2RenderedRelationshipGeometry,
  invalidCanvasV2RenderedRelationshipNodeIds,
  collidingCanvasV2OptionalRelationshipLabelNodeIds,
} from "@/lib/canvas-v2/evidence-authorship";
import { repairCanvasV2RenderedRelationshipGeometry, retireCanvasV2BrokenAuthoredRelationships, retireCanvasV2CollidingRelationshipLabels } from "@/lib/canvas-v2/source-patch";
import { CANVAS_V2_DESIGN_REQUEST_POLICY, CanvasV2RequestError, requestCanvasV2Json, type CanvasV2ProviderAttemptAudit } from "@/lib/canvas-v2/request-reliability";
import {
  settleCanvasV2ResearchRequirement,
  type CanvasV2ResearchRequirement,
} from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";
import type { CanvasV2ModelSelection } from "@/lib/canvas-v2/model-catalog";
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
};

const STARTER_DOCUMENT = {
  // The workspace is rendered and navigated by the host. The initial artifact
  // therefore contains metadata only—never a second visible rectangle. Model
  // and human authored objects are body-level canvas objects from the start.
  html: `<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true" aria-label="North Star canvas metadata"></template>`,
  css: ``,
};
const MAX_RENDER_REPAIRS = 3;

function instructionExplicitlyRequiresNativeRelationships(instruction: string): boolean {
  return /\b(?:connectors?|endpoint(?:-dependent)?|svg|arrows?|curves?|(?:explicit|native|causal|dependency)\s+relationships?|relationship\s+geometry|(?:causal|dependency)\s+(?:paths?|lines?))\b/i.test(instruction);
}

function summarizeRenderedIntegrityFailures(failures: readonly string[]): string {
  const outside = failures.filter((failure) => failure.includes("inside the rendered canvas"));
  const clipped = failures.filter((failure) => failure.includes("clipped by its layout"));
  const hidden = failures.filter((failure) => failure.includes("not visibly rendered"));
  const distorted = failures.filter((failure) => failure.includes("aspect ratio") || failure.includes("cropping presentation"));
  const rails = failures.filter((failure) => failure.includes("uninterrupted horizontal rail"));
  const runawayAnalysis = failures.filter((failure) => failure.includes("may not dominate the composition"));
  const clippedAnalysis = failures.filter((failure) => failure.includes("Authored design region") && failure.includes("clips"));
  const illegibleAnalysis = failures.filter((failure) => failure.includes("canvas-scale legibility floor"));
  const detachedRelationships = failures.filter((failure) => failure.includes("relationship") && failure.includes("anchor"));
  const diagnoses = [
    outside.length ? `${outside.length} canonical evidence assets extended beyond the rendered canvas because the candidate constrained the intrinsic evidence width` : "",
    clipped.length ? `${clipped.length} canonical evidence assets were clipped by authored layout` : "",
    hidden.length ? `${hidden.length} grounded assets were no longer visibly rendered` : "",
    distorted.length ? `${distorted.length} grounded assets lost their natural presentation` : "",
    rails.length ? `${rails.length} canonical journeys no longer formed one uninterrupted horizontal rail` : "",
    runawayAnalysis.length ? `${runawayAnalysis.length} analytical screenshots became page-dominating slabs instead of bounded evidence callouts` : "",
    clippedAnalysis.length ? `${clippedAnalysis.length} authored analytical regions hid part of their own content` : "",
    illegibleAnalysis.length ? `${illegibleAnalysis.length} authored regions compressed readable copy into canvas-scale microtext` : "",
    detachedRelationships.length ? `${detachedRelationships.length} authored relationships detached from their evidence endpoints` : "",
  ].filter(Boolean);
  return diagnoses.length
    ? `${diagnoses.join("; ")}. Preserve the complete max-content evidence rails and grow or recompose the analytical surface around them.`
    : Array.from(new Set(failures)).slice(0, 3).join(" ");
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
    loopRef.current = next;
    setLoop(next);
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
        research?: CanvasV2ResearchResult;
        researchStatus?: CanvasV2ResearchRequirement[];
        model?: string;
        fallbackUsed?: boolean;
        providerAttempts?: CanvasV2ProviderAttemptAudit[];
        error?: string;
      }>({
        endpoint: designEndpoint,
        signal: controller.signal,
        requestId: `${activeLoop.id}:${revision.id}:repair-${activeLoop.renderRepair?.attempt ?? 0}:replan-${activeLoop.structuralRecovery?.attempt ?? 0}`,
        policy: CANVAS_V2_DESIGN_REQUEST_POLICY,
        body: {
          instruction: activeLoop.instruction,
          revision,
          observation,
          run: {
            turn: activeLoop.steps.length + 1,
            priorSteps: [...(activeLoop.priorSteps ?? []), ...activeLoop.steps].slice(-CANVAS_V2_MAX_CONTEXT_STEPS),
            creativeDirection: activeLoop.creativeDirection,
            spatialStrategy: activeLoop.spatialStrategy,
            compositionState: activeLoop.compositionState,
            researchTargets: activeLoop.researchTargets,
            researchMode: activeLoop.researchMode,
            modelSelection: activeLoop.modelSelection,
            renderRepair: activeLoop.renderRepair,
            structuralRecovery: activeLoop.structuralRecovery,
            workingContext: activeLoop.workingContext,
          },
        },
        onRetry: (retry) => {
          if (activeRunId.current !== activeLoop.id) return;
          publishLoop({ ...activeLoop, status: "thinking", retry });
        },
      });
      if (activeRunId.current !== activeLoop.id) return;
      if (!payload.decision) throw new Error(payload.error || "Canvas V2 did not return a decision.");
      const loopWithProvider: CanvasV2LoopState = {
        ...activeLoop,
        activeModel: payload.model,
        providerAttempts: payload.providerAttempts,
      };
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
          researchStatus: payload.researchStatus,
          providerAttempts: payload.providerAttempts,
        });
        activeRunId.current = undefined;
        return;
      }
      if (payload.decision.decision === "research") {
        const app = payload.research?.apps[0];
        const flow = payload.research?.flows[0];
        if (!app || !flow || !payload.research) throw new Error("Canvas V2 returned an incomplete research action.");
        const insertion = insertCanvasV2CanonicalFlow({ document: revision.document, currentEvidence: revision.evidence, app, flow, evidence: payload.research.evidence });
        const sceneTransaction = compileCanvasV2SceneTransaction({
          origin: "research",
          baseRevisionId: revision.id,
          previous: revision.document,
          next: insertion.document,
        });
        setPendingEdit({
          schema: payload.decision.schema,
          decision: "edit",
          moveKind: payload.decision.moveKind,
          creativeDirection: payload.decision.creativeDirection,
          spatialStrategy: payload.decision.spatialStrategy,
          compositionState: payload.decision.compositionState,
          reflection: payload.decision.reflection,
          document: insertion.document,
          summary: payload.decision.summary,
          expectedVisualResult: payload.decision.expectedVisualResult,
          sceneTransaction,
        });
        setPendingActionKind("research");
        setPendingResearch({ appId: payload.decision.appId, flowId: payload.decision.flowId });
        setCandidate(createCanvasV2CandidateRevision({ id: id("research-revision"), parent: commitParent, document: insertion.document, evidence: insertion.evidence, createdAt: new Date().toISOString(), sceneTransaction }));
        publishLoop({ ...loopWithProvider, status: "rendering", retry: undefined, researchStatus: payload.researchStatus });
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
      setPendingEdit({ ...authoredDecision, sceneTransaction: committedSceneTransaction });
      setPendingActionKind("design");
      setPendingResearch(undefined);
      setCandidate(createCanvasV2CandidateRevision({
        id: id("revision"),
        parent: commitParent,
        document: authoredDecision.document,
        evidence: payload.evidence,
        createdAt: new Date().toISOString(),
        sceneTransaction: committedSceneTransaction,
      }));
      publishLoop({ ...loopWithProvider, status: "rendering", retry: undefined, researchStatus: payload.researchStatus });
    } catch (requestError) {
      if (controller.signal.aborted || activeRunId.current !== activeLoop.id) return;
      const message = requestError instanceof Error ? requestError.message : "Canvas V2 request failed.";
      if (requestError instanceof CanvasV2RequestError && requestError.code === "invalid-response") {
        const publicRevision = committedRef.current;
        const publicObservation = observationsRef.current[publicRevision.id];
        if (publicObservation) {
          const failedAction = activeLoop.renderRepair?.islandExecution?.target.action;
          const recoveryLoop = {
            ...recoverCanvasV2LoopAfterRejectedCandidate(
              activeLoop,
              ["The private model response did not satisfy the bounded visual-director or source-author contract."],
              failedAction,
            ),
            providerAttempts: requestError.providerAttempts,
          };
          publishLoop(recoveryLoop);
          void askModel(recoveryLoop, publicRevision, publicObservation, publicRevision);
          return;
        }
      }
      publishLoop(requestError instanceof CanvasV2RequestError && !requestError.retryable && requestError.providerAttempts?.length
        ? { ...pauseCanvasV2Loop(activeLoop, message), providerAttempts: requestError.providerAttempts }
        : failCanvasV2Loop(activeLoop, message));
      activeRunId.current = undefined;
    } finally {
      if (requestController.current === controller) requestController.current = undefined;
    }
  };

  const start = (
    currentInstruction = instruction,
    currentObservation?: CanvasV2RenderObservation,
    continuation?: CanvasV2LoopContinuation,
    researchTargets?: string[],
    researchMode?: CanvasV2ResearchMode,
    modelSelection?: CanvasV2ModelSelection,
    workingContext?: CanvasV2WorkingContext,
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
    const nextLoop = createCanvasV2Loop({ id: id("run"), instruction: objective, continuation, researchTargets, researchMode, modelSelection, workingContext });
    activeRunId.current = nextLoop.id;
    publishLoop(nextLoop);
    const currentCommitted = committedRef.current;
    const observation = currentObservation?.revisionId === currentCommitted.id
      ? currentObservation
      : observationsRef.current[currentCommitted.id];
    if (!observation) {
      publishLoop(failCanvasV2Loop(nextLoop, "The canvas is still preparing its first visual observation. Try again in a moment."));
      activeRunId.current = undefined;
      return nextLoop.id;
    }
    void askModel(nextLoop, currentCommitted, observation);
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
    options: { allowEvidenceRemoval?: boolean; selectionNodeIds?: readonly string[] } = {},
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
    const publicCommitted = committedRef.current;
    const observedScene = nativeSceneRef.current?.revisionId === observation.revisionId
      ? nativeSceneRef.current
      : inspectionScenesRef.current.get(observation.revisionId);
    // Candidate compilation normalizes user-detached objects into the same
    // native world the public renderer will promote. Validate that normalized
    // scene, not the compatibility DOM's semantic nesting; otherwise a card
    // the person moved correctly appears to overflow/collide with its former
    // parent on the next AI turn.
    const factualObservation = observedScene ? projectCanvasV2ObservationToNativeScene(observation, observedScene) : observation;
    observationsRef.current = { ...observationsRef.current, [observation.revisionId]: factualObservation };
    setObservations((current) => ({ ...current, [observation.revisionId]: factualObservation }));
    if (candidate && observation.revisionId === candidate.id) {
      if (!settleCandidateRevision(candidate.id)) return;
    }
    if (candidate && !pendingManualEdit && activeRunId.current !== loop?.id) return;
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
      const nonRelationshipIntegrityFailures = [
        ...validateCanvasV2RenderedEvidenceIntegrity(candidate.document, factualObservation),
        ...validateCanvasV2RenderedAnalysisEvidenceScale(factualObservation),
        ...validateCanvasV2RenderedDesignRegionContentIntegrity(factualObservation),
        ...validateCanvasV2RenderedDesignRegionLegibility(factualObservation),
        ...validateCanvasV2RenderedDesignRegionTerritoryIntegrity(factualObservation),
        ...validateCanvasV2RenderedIslandNarrativeIntegrity(factualObservation),
        ...(pendingEdit?.sceneTransaction && observationsRef.current[publicCommitted.id]
          ? validateCanvasV2MultiplayerPlacement({
              previous: observationsRef.current[publicCommitted.id],
              candidate: factualObservation,
              transaction: pendingEdit.sceneTransaction,
            })
          : []),
      ];
      const integrityFailures = [...nonRelationshipIntegrityFailures, ...relationshipFailures];
      if (integrityFailures.length) {
        const collidingRelationshipLabelNodeIds = collidingCanvasV2OptionalRelationshipLabelNodeIds(factualObservation);
        if (collidingRelationshipLabelNodeIds.length && pendingEdit && loop?.status === "rendering") {
          const recoveredDocument = retireCanvasV2CollidingRelationshipLabels(candidate.document, collidingRelationshipLabelNodeIds);
          if (recoveredDocument !== candidate.document) {
            const commitParent = committedRef.current;
            const recoveredTransaction = compileCanvasV2SceneTransaction({
              origin: "northstar",
              baseRevisionId: commitParent.id,
              previous: commitParent.document,
              next: recoveredDocument,
              execution: pendingEdit.islandExecution,
              workingContext: loop.workingContext,
            });
            discardInspectionScene(candidate.id);
            setPendingEdit({ ...pendingEdit, document: recoveredDocument, sceneTransaction: recoveredTransaction });
            setCandidate(createCanvasV2CandidateRevision({
              id: id("relationship-label-recovery-revision"),
              parent: commitParent,
              document: recoveredDocument,
              evidence: candidate.evidence,
              createdAt: new Date().toISOString(),
              sceneTransaction: recoveredTransaction,
            }));
            // Optional SVG verbs never consume a provider correction. Remove
            // only the exact colliding labels, then re-observe the unchanged
            // required paths and stage objects through the normal private gate.
            publishLoop({ ...loop, status: "rendering" });
            return;
          }
        }
        const invalidRelationshipNodeIds = new Set(invalidCanvasV2RenderedRelationshipNodeIds(factualObservation));
        const relationshipGeometryRecoveryAttempt = pendingEdit?.relationshipGeometryRecoveryAttempt ?? 0;
        if (relationshipFailures.length
          && invalidRelationshipNodeIds.size
          && relationshipGeometryRecoveryAttempt < 2
          && pendingEdit
          && loop?.status === "rendering") {
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
              workingContext: loop.workingContext,
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
              createdAt: new Date().toISOString(),
              sceneTransaction: recoveredTransaction,
            }));
            // Endpoint coordinates are a browser-measured clerical concern,
            // not a creative model decision. Re-observe the corrected private
            // candidate before consuming another provider repair attempt.
            publishLoop({ ...loop, status: "rendering" });
            return;
          }
        }
        const message = summarizeRenderedIntegrityFailures(integrityFailures);
        discardInspectionScene(candidate.id);
        setCandidate(undefined);
        const failedMove = [pendingEdit?.summary, pendingEdit?.expectedVisualResult].filter(Boolean).join(" — ").slice(0, 1_600);
        setPendingActionKind("design");
        setPendingResearch(undefined);
        if (loop?.status === "rendering") {
          const repairAttempt = (loop.renderRepair?.attempt ?? 0) + 1;
          if (repairAttempt <= MAX_RENDER_REPAIRS) {
            setPendingEdit(undefined);
            const repairLoop: CanvasV2LoopState = {
              ...loop,
              status: "thinking",
              renderRepair: {
                attempt: repairAttempt,
                maxAttempts: MAX_RENDER_REPAIRS,
                failures: [...(loop.renderRepair?.failures ?? []), ...integrityFailures].slice(-12),
                ...(failedMove ? { failedMove } : {}),
                ...(pendingEdit?.islandExecution ? { islandExecution: pendingEdit.islandExecution } : {}),
                rejectedCandidate: rejectedCandidateContext(candidate.document, factualObservation),
              },
            };
            publishLoop(repairLoop);
            // Continue the same hidden transaction from the exact rejected
            // render. The repaired result still commits against public
            // committed truth, so invalid geometry never flashes on canvas.
            const repairFromCommitted = pendingEdit?.islandExecution?.target.action === "recompose";
            const repairRevision = repairFromCommitted ? publicCommitted : candidate;
            const repairObservation = repairFromCommitted
              ? (observationsRef.current[publicCommitted.id] ?? factualObservation)
              : factualObservation;
            // A failed whole-board recompose contains no new narrative objects.
            // Retry it from public committed truth so dead or contradictory CSS
            // from the rejected candidate cannot accumulate across attempts.
            void askModel(repairLoop, repairRevision, repairObservation, publicCommitted);
          } else if (!nonRelationshipIntegrityFailures.length
            && pendingEdit
            && !instructionExplicitlyRequiresNativeRelationships(loop.instruction)) {
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
                workingContext: loop.workingContext,
              });
              setPendingEdit({ ...pendingEdit, document: recoveredDocument, sceneTransaction: recoveredTransaction });
              setCandidate(createCanvasV2CandidateRevision({
                id: id("relationship-recovery-revision"),
                parent: commitParent,
                document: recoveredDocument,
                evidence: candidate.evidence,
                createdAt: new Date().toISOString(),
                sceneTransaction: recoveredTransaction,
              }));
              // Keep the compiler-owned fallback private and run the same
              // render-before-commit gate again. Endpoint distances remain in
              // diagnostics, never in a red user-facing terminal failure.
              publishLoop({ ...loop, status: "rendering" });
              return;
            }
          }
          if (process.env.NODE_ENV !== "production") console.warn("[canvas-v2] exhausted render repair; replanning from committed canvas", { failures: integrityFailures });
          setPendingEdit(undefined);
          const publicRevision = committedRef.current;
          const publicObservation = observationsRef.current[publicRevision.id];
          if (!publicObservation) {
            publishLoop(failCanvasV2Loop(loop, "North Star could not re-observe the verified canvas after discarding a private revision."));
            activeRunId.current = undefined;
            return;
          }
          const failedAction = pendingEdit?.islandExecution?.target.action;
          const recoveryLoop = recoverCanvasV2LoopAfterRejectedCandidate(loop, integrityFailures, failedAction);
          publishLoop(recoveryLoop);
          void askModel(recoveryLoop, publicRevision, publicObservation, publicRevision);
        }
        return;
      }
    }
    if (!candidate || !pendingEdit || !loop || loop.status !== "rendering" || observation.revisionId !== candidate.id) return;
    const commitParent = committedRef.current;
    // An observer callback belongs to the render that created it. If another
    // accepted observation has already advanced public truth, this callback is
    // superseded and must be a no-op—not a user-visible stale-parent failure.
    // The active render owns its own newer callback and will settle normally.
    if (candidate.parentId !== commitParent.id) return;
    const nextCommitted = commitCanvasV2Candidate({ candidate, expectedParentId: commitParent.id });
    const nextLoop = recordCanvasV2CommittedEdit({
      loop,
      revisionId: nextCommitted.id,
      summary: pendingEdit.summary,
      expectedVisualResult: pendingEdit.expectedVisualResult,
      kind: pendingActionKind,
      moveKind: pendingEdit.moveKind,
      creativeDirection: pendingEdit.creativeDirection,
      spatialStrategy: pendingEdit.spatialStrategy,
      compositionState: pendingEdit.compositionState,
      islandExecution: pendingEdit.islandExecution,
      reflection: pendingEdit.reflection,
      researchStatus: pendingResearch
        ? settleCanvasV2ResearchRequirement(loop.researchStatus, pendingResearch.appId, pendingResearch.flowId)
        : loop.researchStatus,
    });
    const acceptedScene = inspectionScenesRef.current.get(candidate.id);
    if (acceptedScene) {
      nativeSceneRef.current = acceptedScene;
      setNativeScene(acceptedScene);
    }
    discardInspectionScene(candidate.id);
    acceptCommittedRevision(
      nextCommitted,
      `northstar:${loop.historyTransactionId}`,
      nextLoop.workingContext?.selectedNodeIds ?? loop.workingContext?.selectedNodeIds,
    );
    setCandidate(undefined);
    setPendingEdit(undefined);
    setPendingActionKind("design");
    setPendingResearch(undefined);
    publishLoop(nextLoop);
    if (nextLoop.status === "thinking") void askModel(nextLoop, nextCommitted, factualObservation);
    else activeRunId.current = undefined;
  };

  const captureFailed = (message: string) => {
    if (pendingManualEdit && candidate) {
      discardInspectionScene(candidate.id);
      setCandidate(undefined);
      setPendingManualEdit(undefined);
      setManualNotice(undefined);
      setManualError(message);
      return;
    }
    if (activeRunId.current !== loop?.id) return;
    if (!loop || loop.status !== "rendering") return;
    discardInspectionScene(candidate?.id);
    setCandidate(undefined);
    setPendingEdit(undefined);
    setPendingActionKind("design");
    setPendingResearch(undefined);
    publishLoop(failCanvasV2Loop(loop, message));
    activeRunId.current = undefined;
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
