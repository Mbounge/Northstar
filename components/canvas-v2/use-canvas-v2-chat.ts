"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { canvasV2ChatStatusForLoop, type CanvasV2ChatStatus } from "@/lib/canvas-v2/chat-lifecycle";
import type { CanvasV2LoopContinuation, CanvasV2LoopState } from "@/lib/canvas-v2/design-loop";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import {
  canvasV2AuthoritativeCanvasInstruction,
  canvasV2RouteMutatesCanvas,
  type CanvasV2InteractionDecision,
  type CanvasV2InteractionRoute,
  type CanvasV2ResearchMode,
} from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from "@/lib/canvas-v2/types";
import {
  CANVAS_V2_ROUTING_REQUEST_POLICY,
  requestCanvasV2Json,
  type CanvasV2RetryState,
  type CanvasV2ProviderAttemptAudit,
} from "@/lib/canvas-v2/request-reliability";
import {
  CANVAS_V2_DEFAULT_MODEL,
  type CanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";
import type { CanvasV2SelectionPolicy, CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";

export interface CanvasV2ChatTurn {
  id: string;
  message: string;
  createdAt: string;
  status: CanvasV2ChatStatus;
  route?: CanvasV2InteractionRoute;
  routeSummary?: string;
  answer?: string;
  canvasInstruction?: string;
  runId?: string;
  loop?: CanvasV2LoopState;
  priorLoops?: CanvasV2LoopState[];
  error?: string;
  retry?: CanvasV2RetryState;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
  providerAttempts?: CanvasV2ProviderAttemptAudit[];
  workingContext?: CanvasV2WorkingContext;
}

interface DesignEngine {
  committed: CanvasV2ArtifactRevision;
  displayedObservation?: CanvasV2RenderObservation;
  loop?: CanvasV2LoopState;
  running: boolean;
  applyingManualEdit: boolean;
  start: (instruction: string, observation?: CanvasV2RenderObservation, continuation?: CanvasV2LoopContinuation, researchTargets?: string[], researchMode?: CanvasV2ResearchMode, modelSelection?: CanvasV2ModelSelection, workingContext?: CanvasV2WorkingContext) => string | undefined;
  stop: () => void;
}

function id(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useCanvasV2Chat(input: {
  endpoint: string;
  engine: DesignEngine;
  selection?: CanvasV2InspectableElement;
  selections?: readonly CanvasV2InspectableElement[];
  getWorkingContext?: (selectionPolicy: CanvasV2SelectionPolicy) => CanvasV2WorkingContext | undefined;
}) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<CanvasV2ChatTurn[]>([]);
  const [modelSelection, setModelSelection] = useState<CanvasV2ModelSelection>(CANVAS_V2_DEFAULT_MODEL);
  const activeRoutingTurnId = useRef<string | undefined>(undefined);
  const activeDesignTurnId = useRef<string | undefined>(undefined);
  const routingSequence = useRef(0);
  const controller = useRef<{ sequence: number; turnId: string; abortController: AbortController } | undefined>(undefined);
  const routing = turns.some((turn) => turn.status === "routing");
  const designing = turns.some((turn) => turn.status === "running");
  const busy = routing || designing || input.engine.running || input.engine.applyingManualEdit;

  useEffect(() => {
    const loop = input.engine.loop;
    const turnId = activeDesignTurnId.current;
    if (!loop || !turnId) return;
    setTurns((current) => current.map((turn) => turn.id === turnId && turn.runId === loop.id
      ? { ...turn, loop, status: canvasV2ChatStatusForLoop(loop), error: loop.error }
      : turn));
    if (canvasV2ChatStatusForLoop(loop) !== "running") activeDesignTurnId.current = undefined;
  }, [input.engine.loop]);

  const history = useMemo(() => turns.flatMap((turn) => {
    const response = turn.answer || turn.loop?.finalSummary || turn.routeSummary;
    return [{ role: "user", text: turn.message }, ...(response ? [{ role: "assistant", text: response }] : [])];
  }).slice(-12), [turns]);

  const submit = async () => {
    const message = draft.trim();
    if (!message || busy) return;
    const turnId = id();
    const sequence = routingSequence.current + 1;
    routingSequence.current = sequence;
    activeRoutingTurnId.current = turnId;
    const turn: CanvasV2ChatTurn = { id: turnId, message, createdAt: new Date().toISOString(), status: "routing" };
    setTurns((current) => [...current, turn].slice(-30));
    setDraft("");
    const abort = new AbortController();
    controller.current = { sequence, turnId, abortController: abort };
    try {
      const payload = await requestCanvasV2Json<{ decision?: CanvasV2InteractionDecision; providerAttempts?: CanvasV2ProviderAttemptAudit[]; error?: string }>({
        endpoint: input.endpoint,
        signal: abort.signal,
        requestId: turnId,
        policy: CANVAS_V2_ROUTING_REQUEST_POLICY,
        body: {
          message,
          revision: input.engine.committed,
          observation: input.engine.displayedObservation,
          selection: input.selection,
          selections: input.selections,
          workingContext: input.getWorkingContext?.("none"),
          history,
          modelSelection,
        },
        onRetry: (retry) => {
          if (routingSequence.current !== sequence || activeRoutingTurnId.current !== turnId) return;
          setTurns((current) => current.map((item) => item.id === turnId ? { ...item, retry } : item));
        },
      });
      if (abort.signal.aborted || routingSequence.current !== sequence || activeRoutingTurnId.current !== turnId) return;
      if (!payload.decision) throw new Error(payload.error || "North Star could not route that message.");
      const decision = payload.decision;
      if (!canvasV2RouteMutatesCanvas(decision.route)) {
        activeRoutingTurnId.current = undefined;
        setTurns((current) => current.map((item) => item.id === turnId ? {
          ...item,
          status: "responded",
          route: decision.route,
          routeSummary: decision.summary,
          answer: decision.answer,
          retry: undefined,
          providerAttempts: payload.providerAttempts,
        } : item));
        return;
      }
      if (!decision.canvasInstruction) throw new Error("North Star returned no canvas instruction.");
      const canvasInstruction = canvasV2AuthoritativeCanvasInstruction(message, decision.canvasInstruction);
      const workingContext = input.getWorkingContext?.(decision.selectionPolicy ?? "none");
      const runId = input.engine.start(canvasInstruction, input.engine.displayedObservation, undefined, decision.researchTargets, decision.researchMode, modelSelection, workingContext);
      if (!runId) throw new Error("The canvas is not ready to begin another design run.");
      activeRoutingTurnId.current = undefined;
      activeDesignTurnId.current = turnId;
      setTurns((current) => current.map((item) => item.id === turnId ? {
        ...item,
        status: "running",
        route: decision.route,
        routeSummary: decision.summary,
        canvasInstruction,
        runId,
        retry: undefined,
        researchTargets: decision.researchTargets,
        researchMode: decision.researchMode,
        providerAttempts: payload.providerAttempts,
        workingContext,
      } : item));
    } catch (error) {
      if (routingSequence.current !== sequence || activeRoutingTurnId.current !== turnId) return;
      activeRoutingTurnId.current = undefined;
      setTurns((current) => current.map((item) => item.id === turnId ? abort.signal.aborted
        ? { ...item, status: "stopped", error: undefined, retry: undefined }
        : { ...item, status: "failed", error: error instanceof Error ? error.message : "North Star could not process that message.", retry: undefined }
      : item));
    } finally {
      if (controller.current?.sequence === sequence) controller.current = undefined;
      if (activeRoutingTurnId.current === turnId) activeRoutingTurnId.current = undefined;
    }
  };

  const stop = () => {
    routingSequence.current += 1;
    controller.current?.abortController.abort();
    controller.current = undefined;
    input.engine.stop();
    const stoppedTurnIds = new Set([activeRoutingTurnId.current, activeDesignTurnId.current].filter((turnId): turnId is string => Boolean(turnId)));
    if (stoppedTurnIds.size) setTurns((current) => current.map((turn) => stoppedTurnIds.has(turn.id) && (turn.status === "routing" || turn.status === "running") ? { ...turn, status: "stopped", error: undefined, retry: undefined } : turn));
    activeRoutingTurnId.current = undefined;
    activeDesignTurnId.current = undefined;
  };

  const continueTurn = (turnId: string) => {
    if (busy) return;
    const turn = turns.find((candidate) => candidate.id === turnId);
    if (!turn || turn.status !== "incomplete" || !turn.canvasInstruction || !turn.loop) return;
    const priorWorkingContext = turn.loop.workingContext ?? turn.workingContext;
    // Continuation is authority over the scene that exists *now*, not the
    // scene that existed when the interrupted turn began. Rebuild the compact
    // context so a human text/geometry edit made during the pause is visible
    // to Northstar with its current authorship and edit version.
    const workingContext = input.getWorkingContext
      ? input.getWorkingContext(priorWorkingContext?.selectionPolicy ?? "none")
      : priorWorkingContext;
    const continuation: CanvasV2LoopContinuation = {
      previousRunId: turn.loop.id,
      historyTransactionId: turn.loop.historyTransactionId,
      priorSteps: [...(turn.loop.priorSteps ?? []), ...turn.loop.steps],
      creativeDirection: turn.loop.creativeDirection,
      spatialStrategy: turn.loop.spatialStrategy,
      compositionState: turn.loop.compositionState,
      researchTargets: turn.loop.researchTargets ?? turn.researchTargets,
      researchMode: turn.loop.researchMode ?? turn.researchMode,
      researchStatus: turn.loop.researchStatus,
      modelSelection: turn.loop.modelSelection,
      workingContext,
    };
    const runId = input.engine.start(turn.canvasInstruction, input.engine.displayedObservation, continuation, undefined, undefined, continuation.modelSelection ?? modelSelection, workingContext);
    if (!runId) {
      setTurns((current) => current.map((candidate) => candidate.id === turnId ? { ...candidate, error: "The latest committed canvas is still preparing for continuation." } : candidate));
      return;
    }
    activeDesignTurnId.current = turnId;
    setTurns((current) => current.map((candidate) => candidate.id === turnId ? {
      ...candidate,
      status: "running",
      runId,
      priorLoops: [...(candidate.priorLoops ?? []), ...(candidate.loop ? [candidate.loop] : [])],
      loop: undefined,
      workingContext,
      error: undefined,
      retry: undefined,
    } : candidate));
  };

  return { draft, setDraft, turns, busy, routing, submit, stop, continueTurn, modelSelection, setModelSelection };
}
