"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  CANVAS_V2_MAX_CONTEXT_STEPS,
  canvasV2LoopIsActive,
  completeCanvasV2Loop,
  createCanvasV2Loop,
  failCanvasV2Loop,
  pauseCanvasV2Loop,
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
  validateCanvasV2RenderedDesignRegionTerritoryIntegrity,
  validateCanvasV2RenderedEvidenceIntegrity,
  validateCanvasV2RenderedIslandNarrativeIntegrity,
  validateCanvasV2RenderedRelationshipGeometry,
} from "@/lib/canvas-v2/evidence-authorship";
import { CANVAS_V2_DESIGN_REQUEST_POLICY, CanvasV2RequestError, requestCanvasV2Json, type CanvasV2ProviderAttemptAudit } from "@/lib/canvas-v2/request-reliability";
import {
  settleCanvasV2ResearchRequirement,
  type CanvasV2ResearchRequirement,
} from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ModelSelection } from "@/lib/canvas-v2/model-catalog";
import type { CanvasV2NativeSceneDocument } from "@/lib/canvas-v2/native-scene";

interface PendingManualEdit {
  summary: string;
}

interface PendingResearch {
  appId: string;
  flowId: string;
}

type PendingCanvasV2Edit = Omit<CanvasV2EditDecision, "moveKind"> & {
  moveKind: CanvasV2CreativeMoveKind;
};

const STARTER_DOCUMENT = {
  // The workspace is rendered and navigated by the host. The initial artifact
  // therefore contains metadata only—never a second visible rectangle. Model
  // and human authored objects are body-level canvas objects from the start.
  html: `<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true" aria-label="North Star canvas metadata"></template>`,
  css: ``,
};
const MAX_RENDER_REPAIRS = 3;

function summarizeRenderedIntegrityFailures(failures: readonly string[]): string {
  const outside = failures.filter((failure) => failure.includes("inside the rendered canvas"));
  const clipped = failures.filter((failure) => failure.includes("clipped by its layout"));
  const hidden = failures.filter((failure) => failure.includes("not visibly rendered"));
  const distorted = failures.filter((failure) => failure.includes("aspect ratio") || failure.includes("cropping presentation"));
  const rails = failures.filter((failure) => failure.includes("uninterrupted horizontal rail"));
  const runawayAnalysis = failures.filter((failure) => failure.includes("may not dominate the composition"));
  const clippedAnalysis = failures.filter((failure) => failure.includes("Authored design region") && failure.includes("clips"));
  const detachedRelationships = failures.filter((failure) => failure.includes("relationship") && failure.includes("anchor"));
  const diagnoses = [
    outside.length ? `${outside.length} canonical evidence assets extended beyond the rendered canvas because the candidate constrained the intrinsic evidence width` : "",
    clipped.length ? `${clipped.length} canonical evidence assets were clipped by authored layout` : "",
    hidden.length ? `${hidden.length} grounded assets were no longer visibly rendered` : "",
    distorted.length ? `${distorted.length} grounded assets lost their natural presentation` : "",
    rails.length ? `${rails.length} canonical journeys no longer formed one uninterrupted horizontal rail` : "",
    runawayAnalysis.length ? `${runawayAnalysis.length} analytical screenshots became page-dominating slabs instead of bounded evidence callouts` : "",
    clippedAnalysis.length ? `${clippedAnalysis.length} authored analytical regions hid part of their own content` : "",
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
  const [committed, setCommitted] = useState<CanvasV2ArtifactRevision>(initial);
  const [history, setHistory] = useState<CanvasV2ArtifactRevision[]>([initial]);
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
    if (next.revisionId !== committed.id) return;
    // The compiler establishes native truth for a newly committed AI source.
    // A direct manual mutation then updates that scene synchronously. Any
    // later compiler callback for the *same* revision is verification only;
    // it may never replace the already-authoritative native coordinates.
    setNativeScene((current) => current?.revisionId === next.revisionId ? current : next);
  }, [committed.id]);

  const publishLoop = (next: CanvasV2LoopState | undefined) => {
    loopRef.current = next;
    setLoop(next);
  };

  const acceptCommittedRevision = (revision: CanvasV2ArtifactRevision) => {
    setCommitted(revision);
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), revision].slice(-50);
      setHistoryIndex(next.length - 1);
      return next;
    });
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
        requestId: `${activeLoop.id}:${revision.id}`,
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
      const responseSceneTransaction = payload.decision.sceneTransaction ?? compileCanvasV2SceneTransaction({
        origin: "northstar",
        baseRevisionId: revision.id,
        previous: revision.document,
        next: payload.decision.document,
        execution: payload.decision.islandExecution,
      });
      assertCanvasV2SceneTransaction({
        transaction: responseSceneTransaction,
        baseRevisionId: revision.id,
        previous: revision.document,
        next: payload.decision.document,
      });
      const committedSceneTransaction = revision.id === commitParent.id
        ? responseSceneTransaction
        : compileCanvasV2SceneTransaction({
            origin: "northstar",
            baseRevisionId: commitParent.id,
            previous: commitParent.document,
            next: payload.decision.document,
            execution: payload.decision.islandExecution,
          });
      setPendingEdit({ ...payload.decision, sceneTransaction: committedSceneTransaction });
      setPendingActionKind("design");
      setPendingResearch(undefined);
      setCandidate(createCanvasV2CandidateRevision({
        id: id("revision"),
        parent: commitParent,
        document: payload.decision.document,
        evidence: payload.evidence,
        createdAt: new Date().toISOString(),
        sceneTransaction: committedSceneTransaction,
      }));
      publishLoop({ ...loopWithProvider, status: "rendering", retry: undefined, researchStatus: payload.researchStatus });
    } catch (requestError) {
      if (controller.signal.aborted || activeRunId.current !== activeLoop.id) return;
      const message = requestError instanceof Error ? requestError.message : "Canvas V2 request failed.";
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
  ): string | undefined => {
    const objective = currentInstruction.trim();
    if (!objective || activeRunId.current || canvasV2LoopIsActive(loopRef.current)) return undefined;
    // A candidate without an active automatic or manual render is orphaned UI
    // state. It must never leave the primary run action looking enabled while
    // silently refusing the user's objective.
    if (candidate) {
      setCandidate(undefined);
      setPendingEdit(undefined);
      setPendingManualEdit(undefined);
      setPendingActionKind("design");
      setPendingResearch(undefined);
    }
    const nextLoop = createCanvasV2Loop({ id: id("run"), instruction: objective, continuation, researchTargets, researchMode, modelSelection });
    activeRunId.current = nextLoop.id;
    publishLoop(nextLoop);
    const observation = currentObservation ?? observationsRef.current[committed.id];
    if (!observation) {
      publishLoop(failCanvasV2Loop(nextLoop, "The canvas is still preparing its first visual observation. Try again in a moment."));
      activeRunId.current = undefined;
      return nextLoop.id;
    }
    void askModel(nextLoop, committed, observation);
    return nextLoop.id;
  };

  const stop = () => {
    const activeLoop = loopRef.current;
    if (pendingManualEdit && candidate) {
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
  ): boolean => {
    // Native object edits already carry measured, finite-canvas geometry. They
    // do not need to wait for the compatibility HTML compiler to rediscover
    // geometry the native scene owns. Keeping them in the candidate pipeline
    // made the canvas look ready while a hidden transaction still rejected a
    // quick follow-up resize/group action. Validate source safety, then commit
    // native truth synchronously; the off-screen compiler remains a verifier.
    if (running || candidate || (!nativeSceneRevision && !observationsRef.current[committed.id])) return false;
    try {
      const safeDocument = assertCanvasV2ArtifactDocument(document);
      const nextEvidence = evidence ?? committed.evidence;
      const failures = [
        ...validateCanvasV2EvidenceBindings(safeDocument, nextEvidence),
        ...validateCanvasV2EvidenceContinuity(committed.document, safeDocument, nextEvidence),
      ];
      if (failures.length) throw new Error(Array.from(new Set(failures)).join(" "));
      const nextCandidate = createCanvasV2CandidateRevision({
        id: id("manual-revision"),
        parent: committed,
        document: safeDocument,
        evidence: nextEvidence,
        createdAt: new Date().toISOString(),
        sceneTransaction: compileCanvasV2SceneTransaction({
          origin: "user",
          baseRevisionId: committed.id,
          previous: committed.document,
          next: safeDocument,
        }),
      });
      setManualError(undefined);
      setManualNotice(undefined);
      if (nativeSceneRevision) {
        const nextCommitted = commitCanvasV2Candidate({ candidate: nextCandidate, expectedParentId: committed.id });
        setNativeScene({ ...nativeSceneRevision, revisionId: nextCommitted.id });
        acceptCommittedRevision(nextCommitted);
        setManualNotice(summary);
        return true;
      }
      setPendingManualEdit({ summary });
      setCandidate(nextCandidate);
      return true;
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "The manual revision could not be validated.");
      return false;
    }
  };

  const receiveObservation = (observation: CanvasV2RenderObservation) => {
    observationsRef.current = { ...observationsRef.current, [observation.revisionId]: observation };
    setObservations((current) => ({ ...current, [observation.revisionId]: observation }));
    if (candidate && observation.revisionId === candidate.id) {
      if (settledCandidateRevisionIds.current.has(candidate.id)) return;
      settledCandidateRevisionIds.current.add(candidate.id);
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
          acceptCommittedRevision(commitCanvasV2Candidate({ candidate, expectedParentId: committed.id }));
          setManualNotice(pendingManualEdit.summary);
        } catch (error) {
          setManualError(error instanceof Error ? error.message : "The manual revision could not be committed.");
        }
        setCandidate(undefined);
        setPendingManualEdit(undefined);
        return;
      }
      const integrityFailures = [
        ...validateCanvasV2RenderedEvidenceIntegrity(candidate.document, observation),
        ...validateCanvasV2RenderedAnalysisEvidenceScale(observation),
        ...validateCanvasV2RenderedDesignRegionContentIntegrity(observation),
        ...validateCanvasV2RenderedDesignRegionTerritoryIntegrity(observation),
        ...validateCanvasV2RenderedIslandNarrativeIntegrity(observation),
        ...validateCanvasV2RenderedRelationshipGeometry(observation),
      ];
      if (integrityFailures.length) {
        const message = summarizeRenderedIntegrityFailures(integrityFailures);
        setCandidate(undefined);
        const failedMove = [pendingEdit?.summary, pendingEdit?.expectedVisualResult].filter(Boolean).join(" — ").slice(0, 1_600);
        setPendingEdit(undefined);
        setPendingActionKind("design");
        setPendingResearch(undefined);
        if (loop?.status === "rendering") {
          const repairAttempt = (loop.renderRepair?.attempt ?? 0) + 1;
          if (repairAttempt <= MAX_RENDER_REPAIRS) {
            const repairLoop: CanvasV2LoopState = {
              ...loop,
              status: "thinking",
              renderRepair: {
                attempt: repairAttempt,
                maxAttempts: MAX_RENDER_REPAIRS,
                failures: [...(loop.renderRepair?.failures ?? []), ...integrityFailures].slice(-12),
                ...(failedMove ? { failedMove } : {}),
                ...(pendingEdit?.islandExecution ? { islandExecution: pendingEdit.islandExecution } : {}),
                rejectedCandidate: rejectedCandidateContext(candidate.document, observation),
              },
            };
            publishLoop(repairLoop);
            // Continue the same hidden transaction from the exact rejected
            // render. The repaired result still commits against public
            // committed truth, so invalid geometry never flashes on canvas.
            void askModel(repairLoop, candidate, observation, committed);
          } else {
            publishLoop(failCanvasV2Loop(loop, `North Star could not produce a render-safe revision after ${MAX_RENDER_REPAIRS} corrective attempts. ${message}`));
            activeRunId.current = undefined;
          }
        }
        return;
      }
    }
    if (!candidate || !pendingEdit || !loop || loop.status !== "rendering" || observation.revisionId !== candidate.id) return;
    const nextCommitted = commitCanvasV2Candidate({ candidate, expectedParentId: committed.id });
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
    acceptCommittedRevision(nextCommitted);
    setCandidate(undefined);
    setPendingEdit(undefined);
    setPendingActionKind("design");
    setPendingResearch(undefined);
    publishLoop(nextLoop);
    if (nextLoop.status === "thinking") void askModel(nextLoop, nextCommitted, observation);
    else activeRunId.current = undefined;
  };

  const captureFailed = (message: string) => {
    if (pendingManualEdit && candidate) {
      setCandidate(undefined);
      setPendingManualEdit(undefined);
      setManualNotice(undefined);
      setManualError(message);
      return;
    }
    if (activeRunId.current !== loop?.id) return;
    if (!loop || loop.status !== "rendering") return;
    setCandidate(undefined);
    setPendingEdit(undefined);
    setPendingActionKind("design");
    setPendingResearch(undefined);
    publishLoop(failCanvasV2Loop(loop, message));
    activeRunId.current = undefined;
  };

  const travelHistory = (direction: -1 | 1) => {
    if (running || candidate) return;
    const nextIndex = historyIndex + direction;
    const revision = history[nextIndex];
    if (!revision) return;
    setHistoryIndex(nextIndex);
    setCommitted(revision);
    publishLoop(undefined);
    setManualError(undefined);
    setManualNotice(undefined);
  };

  return {
    committed,
    displayed,
    inspectionCandidate: candidate,
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
    receiveNativeScene,
    undo: () => travelHistory(-1),
    redo: () => travelHistory(1),
    receiveObservation,
    captureFailed,
  };
}
