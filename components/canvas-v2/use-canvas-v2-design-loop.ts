"use client";

import { useMemo, useRef, useState } from "react";

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
  assertCanvasV2ArtifactDocument,
  validateCanvasV2EvidenceBindings,
  validateCanvasV2EvidenceContinuity,
} from "@/lib/canvas-v2/artifact-safety";
import { insertCanvasV2CanonicalFlow } from "@/lib/canvas-v2/flow-insertion";
import type { CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";
import { validateCanvasV2RenderedEvidenceIntegrity } from "@/lib/canvas-v2/evidence-authorship";
import { CANVAS_V2_DESIGN_REQUEST_POLICY, CanvasV2RequestError, requestCanvasV2Json, type CanvasV2ProviderAttemptAudit } from "@/lib/canvas-v2/request-reliability";
import {
  settleCanvasV2ResearchRequirement,
  type CanvasV2ResearchRequirement,
} from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";

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
  html: `<main class="northstar-artboard" data-canvas-v2-node-id="artboard" aria-label="Empty North Star artboard"></main>`,
  css: `.northstar-artboard { position:relative; box-sizing:border-box; width:1680px; min-width:1680px; min-height:945px; overflow:visible; padding:56px; background:#fff; color:#151620; }`,
};
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
  const observationsRef = useRef<Record<string, CanvasV2RenderObservation>>({});
  const [instruction, setInstruction] = useState("");
  const [loop, setLoop] = useState<CanvasV2LoopState>();
  const loopRef = useRef<CanvasV2LoopState | undefined>(undefined);
  const activeRunId = useRef<string | undefined>(undefined);
  const requestController = useRef<AbortController | undefined>(undefined);
  const displayed = candidate ?? committed;
  const running = canvasV2LoopIsActive(loop);
  const applyingManualEdit = Boolean(pendingManualEdit && candidate);

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
            researchTargets: activeLoop.researchTargets,
            researchMode: activeLoop.researchMode,
          },
        },
        onRetry: (retry) => {
          if (activeRunId.current !== activeLoop.id) return;
          publishLoop({ ...activeLoop, status: "thinking", retry });
        },
      });
      if (activeRunId.current !== activeLoop.id) return;
      if (!payload.decision) throw new Error(payload.error || "Canvas V2 did not return a decision.");
      if (payload.decision.decision === "complete") {
        publishLoop({
          ...completeCanvasV2Loop(activeLoop, payload.decision.summary, payload.decision.creativeDirection, payload.decision.spatialStrategy, payload.decision.reflection),
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
        setPendingEdit({
          schema: payload.decision.schema,
          decision: "edit",
          moveKind: payload.decision.moveKind,
          creativeDirection: payload.decision.creativeDirection,
          spatialStrategy: payload.decision.spatialStrategy,
          reflection: payload.decision.reflection,
          document: insertion.document,
          summary: payload.decision.summary,
          expectedVisualResult: payload.decision.expectedVisualResult,
        });
        setPendingActionKind("research");
        setPendingResearch({ appId: payload.decision.appId, flowId: payload.decision.flowId });
        setCandidate(createCanvasV2CandidateRevision({ id: id("research-revision"), parent: revision, document: insertion.document, evidence: insertion.evidence, createdAt: new Date().toISOString() }));
        publishLoop({ ...activeLoop, status: "rendering", retry: undefined, researchStatus: payload.researchStatus, providerAttempts: payload.providerAttempts });
        return;
      }
      setPendingEdit(payload.decision);
      setPendingActionKind("design");
      setPendingResearch(undefined);
      setCandidate(createCanvasV2CandidateRevision({
        id: id("revision"),
        parent: revision,
        document: payload.decision.document,
        evidence: payload.evidence,
        createdAt: new Date().toISOString(),
      }));
      publishLoop({ ...activeLoop, status: "rendering", retry: undefined, researchStatus: payload.researchStatus, providerAttempts: payload.providerAttempts });
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
    const nextLoop = createCanvasV2Loop({ id: id("run"), instruction: objective, continuation, researchTargets, researchMode });
    activeRunId.current = nextLoop.id;
    publishLoop(nextLoop);
    const observation = currentObservation ?? observationsRef.current[committed.id];
    if (!observation) {
      publishLoop(failCanvasV2Loop(nextLoop, "The artboard is still preparing its first visual observation. Try again in a moment."));
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
      setManualNotice("Stopped the uncommitted manual revision. The latest committed artboard remains visible.");
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

  const applyManualDocument = (document: CanvasV2ArtifactDocument, summary: string, evidence?: readonly CanvasV2EvidenceAsset[]): boolean => {
    if (running || candidate || !observationsRef.current[committed.id]) return false;
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
      });
      setManualError(undefined);
      setManualNotice(undefined);
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
    if (candidate && !pendingManualEdit && activeRunId.current !== loop?.id) return;
    if (candidate && observation.revisionId === candidate.id) {
      const integrityFailures = validateCanvasV2RenderedEvidenceIntegrity(candidate.document, observation);
      if (integrityFailures.length) {
        const message = integrityFailures.join(" ");
        setCandidate(undefined);
        setPendingEdit(undefined);
        setPendingActionKind("design");
        setPendingResearch(undefined);
        if (pendingManualEdit) {
          setPendingManualEdit(undefined);
          setManualError(message);
        } else if (loop?.status === "rendering") {
          publishLoop(failCanvasV2Loop(loop, message));
          activeRunId.current = undefined;
        }
        return;
      }
    }
    if (candidate && pendingManualEdit && observation.revisionId === candidate.id) {
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
    undo: () => travelHistory(-1),
    redo: () => travelHistory(1),
    receiveObservation,
    captureFailed,
  };
}
