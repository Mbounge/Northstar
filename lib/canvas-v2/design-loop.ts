import type {
  CanvasV2CreativeDirection,
  CanvasV2CreativeMoveKind,
  CanvasV2RenderedReflection,
  CanvasV2SpatialStrategy,
} from "@/lib/canvas-v2/types";
import type { CanvasV2RetryState } from "@/lib/canvas-v2/request-reliability";
import type { CanvasV2ResearchRequirement } from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";

export const CANVAS_V2_MAX_AUTOMATIC_EDITS = 8;

export type CanvasV2LoopStatus =
  | "idle"
  | "thinking"
  | "rendering"
  | "completed"
  | "stopped"
  | "failed"
  | "edit-limit-reached";

export interface CanvasV2LoopStep {
  turn: number;
  revisionId: string;
  kind: "research" | "design";
  moveKind: CanvasV2CreativeMoveKind;
  summary: string;
  expectedVisualResult: string;
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  reflection: CanvasV2RenderedReflection;
}

export interface CanvasV2LoopState {
  id: string;
  instruction: string;
  status: CanvasV2LoopStatus;
  steps: CanvasV2LoopStep[];
  priorSteps?: CanvasV2LoopStep[];
  continuationOf?: string;
  creativeDirection?: CanvasV2CreativeDirection;
  spatialStrategy?: CanvasV2SpatialStrategy;
  finalReflection?: CanvasV2RenderedReflection;
  finalSummary?: string;
  error?: string;
  retry?: CanvasV2RetryState;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
  researchStatus?: CanvasV2ResearchRequirement[];
}

export interface CanvasV2LoopContinuation {
  previousRunId: string;
  priorSteps?: CanvasV2LoopStep[];
  creativeDirection?: CanvasV2CreativeDirection;
  spatialStrategy?: CanvasV2SpatialStrategy;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
  researchStatus?: CanvasV2ResearchRequirement[];
}

export function createCanvasV2Loop(input: {
  id: string;
  instruction: string;
  continuation?: CanvasV2LoopContinuation;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
}): CanvasV2LoopState {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("Canvas V2 requires a design instruction.");
  return {
    id: input.id,
    instruction,
    status: "thinking",
    steps: [],
    researchTargets: Array.from(new Set((input.continuation?.researchTargets ?? input.researchTargets ?? []).map((target) => target.trim()).filter(Boolean))).slice(0, 12),
    researchMode: input.continuation?.researchMode ?? input.researchMode,
    ...(input.continuation ? {
      continuationOf: input.continuation.previousRunId,
      priorSteps: (input.continuation.priorSteps ?? []).slice(-CANVAS_V2_MAX_AUTOMATIC_EDITS),
      creativeDirection: input.continuation.creativeDirection,
      spatialStrategy: input.continuation.spatialStrategy,
      researchStatus: input.continuation.researchStatus,
    } : {}),
  };
}

export function canvasV2LoopIsActive(loop: CanvasV2LoopState | undefined): boolean {
  return loop?.status === "thinking" || loop?.status === "rendering";
}

function withoutRetry(loop: CanvasV2LoopState): CanvasV2LoopState {
  if (!loop.retry) return loop;
  const next = { ...loop };
  delete next.retry;
  return next;
}

export function recordCanvasV2CommittedEdit(input: {
  loop: CanvasV2LoopState;
  revisionId: string;
  kind?: "research" | "design";
  moveKind: CanvasV2CreativeMoveKind;
  summary: string;
  expectedVisualResult: string;
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  reflection: CanvasV2RenderedReflection;
  researchStatus?: CanvasV2ResearchRequirement[];
  maxEdits?: number;
}): CanvasV2LoopState {
  if (input.loop.status !== "rendering") throw new Error("Canvas V2 can record an edit only after candidate rendering.");
  const steps = [...input.loop.steps, {
    turn: input.loop.steps.length + 1,
    revisionId: input.revisionId,
    kind: input.kind ?? "design",
    moveKind: input.moveKind,
    summary: input.summary,
    expectedVisualResult: input.expectedVisualResult,
    creativeDirection: input.creativeDirection,
    spatialStrategy: input.spatialStrategy,
    reflection: input.reflection,
  }];
  const maxEdits = input.maxEdits ?? CANVAS_V2_MAX_AUTOMATIC_EDITS;
  return {
    ...withoutRetry(input.loop),
    status: steps.length >= maxEdits ? "edit-limit-reached" : "thinking",
    steps,
    creativeDirection: input.creativeDirection,
    spatialStrategy: input.spatialStrategy,
    ...(input.researchStatus ? { researchStatus: input.researchStatus } : {}),
  };
}

export function completeCanvasV2Loop(
  loop: CanvasV2LoopState,
  summary: string,
  creativeDirection: CanvasV2CreativeDirection,
  spatialStrategy: CanvasV2SpatialStrategy,
  reflection: CanvasV2RenderedReflection,
): CanvasV2LoopState {
  if (loop.status !== "thinking") throw new Error("Canvas V2 can complete only after observing a committed revision.");
  return { ...withoutRetry(loop), status: "completed", creativeDirection, spatialStrategy, finalReflection: reflection, finalSummary: summary, error: undefined };
}

export function stopCanvasV2Loop(loop: CanvasV2LoopState): CanvasV2LoopState {
  return { ...withoutRetry(loop), status: "stopped", error: undefined };
}

export function failCanvasV2Loop(loop: CanvasV2LoopState, error: string): CanvasV2LoopState {
  return { ...withoutRetry(loop), status: "failed", error };
}
