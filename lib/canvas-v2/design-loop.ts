import type {
  CanvasV2CompositionState,
  CanvasV2CreativeDirection,
  CanvasV2CreativeMoveKind,
  CanvasV2ElementBounds,
  CanvasV2PlacementOccupantObservation,
  CanvasV2IslandExecutionContract,
  CanvasV2RenderedReflection,
  CanvasV2SpatialStrategy,
} from "@/lib/canvas-v2/types";
import type { CanvasV2ProviderAttemptAudit, CanvasV2RetryState } from "@/lib/canvas-v2/request-reliability";
import type { CanvasV2ResearchRequirement } from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import {
  CANVAS_V2_DEFAULT_MODEL,
  type CanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";

/**
 * Context is compacted independently from execution. This is not a turn cap:
 * the model remains responsible for declaring creative completion, while the
 * user, cancellation, or a provider failure can stop a run at any time.
 */
export const CANVAS_V2_MAX_CONTEXT_STEPS = 24;

export type CanvasV2LoopStatus =
  | "idle"
  | "thinking"
  | "rendering"
  | "completed"
  | "stopped"
  | "paused"
  | "failed";

export interface CanvasV2LoopStep {
  turn: number;
  revisionId: string;
  kind: "research" | "design";
  moveKind: CanvasV2CreativeMoveKind;
  summary: string;
  expectedVisualResult: string;
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  compositionState?: CanvasV2CompositionState;
  /** Exact programmatic island transaction that produced this committed render. */
  islandExecution?: CanvasV2IslandExecutionContract;
  reflection: CanvasV2RenderedReflection;
  providerAttempts?: CanvasV2ProviderAttemptAudit[];
  renderRepairCount?: number;
  /** Exact deterministic failures retained for production diagnostics. */
  renderRepairFailures?: string[];
}

export interface CanvasV2LoopState {
  id: string;
  /** Stable undo transaction shared by every accepted revision in this user turn. */
  historyTransactionId: string;
  instruction: string;
  status: CanvasV2LoopStatus;
  steps: CanvasV2LoopStep[];
  priorSteps?: CanvasV2LoopStep[];
  continuationOf?: string;
  creativeDirection?: CanvasV2CreativeDirection;
  spatialStrategy?: CanvasV2SpatialStrategy;
  compositionState?: CanvasV2CompositionState;
  finalReflection?: CanvasV2RenderedReflection;
  finalSummary?: string;
  error?: string;
  pauseReason?: string;
  retry?: CanvasV2RetryState;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
  researchStatus?: CanvasV2ResearchRequirement[];
  providerAttempts?: CanvasV2ProviderAttemptAudit[];
  modelSelection?: CanvasV2ModelSelection;
  activeModel?: string;
  workingContext?: CanvasV2WorkingContext;
  renderRepair?: {
    attempt: number;
    maxAttempts: number;
    failures: string[];
    failedMove?: string;
    /** The failed candidate's exact island transaction survives every repair pass. */
    islandExecution?: CanvasV2IslandExecutionContract;
    rejectedCandidate?: {
      canvasGeometry: {
        contentBounds: CanvasV2ElementBounds;
        canonicalLaneBounds?: CanvasV2ElementBounds;
        placementOccupants?: CanvasV2PlacementOccupantObservation[];
      };
      evidenceGeometry: Array<Record<string, unknown>>;
      designRegions: Array<Record<string, unknown>>;
      relationshipGeometry: Array<Record<string, unknown>>;
      nodeHtmlExcerpts: Array<{ nodeId: string; html: string }>;
      cssTail: string;
    };
  };
  /**
   * A private candidate may exhaust its tightly scoped render repairs without
   * making the public canvas unsafe. In that case North Star replans from the
   * last committed render inside the same user turn instead of asking the
   * person to resume an implementation failure manually.
   */
  structuralRecovery?: {
    attempt: number;
    failures: string[];
    failedActions: Array<CanvasV2IslandExecutionContract["target"]["action"]>;
  };
}

export interface CanvasV2LoopContinuation {
  previousRunId: string;
  /** A paused continuation remains part of the original undoable AI turn. */
  historyTransactionId?: string;
  priorSteps?: CanvasV2LoopStep[];
  creativeDirection?: CanvasV2CreativeDirection;
  spatialStrategy?: CanvasV2SpatialStrategy;
  compositionState?: CanvasV2CompositionState;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
  researchStatus?: CanvasV2ResearchRequirement[];
  modelSelection?: CanvasV2ModelSelection;
  workingContext?: CanvasV2WorkingContext;
}

/**
 * The execution journal records every accepted revision because each one is
 * authoritative design memory. The chat timeline is also the user's durable
 * inspection trail: every accepted render must remain visible even when two
 * consecutive commits share a move kind. Hidden provider retries and rejected
 * render candidates are never steps, so preserving this journal does not add
 * corrective noise or expose uncommitted work.
 */
export function canvasV2VisibleProgressSteps(
  steps: readonly CanvasV2LoopStep[],
): CanvasV2LoopStep[] {
  return [...steps];
}

export function createCanvasV2Loop(input: {
  id: string;
  instruction: string;
  continuation?: CanvasV2LoopContinuation;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
  modelSelection?: CanvasV2ModelSelection;
  workingContext?: CanvasV2WorkingContext;
}): CanvasV2LoopState {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("Canvas V2 requires a design instruction.");
  return {
    id: input.id,
    historyTransactionId: input.continuation?.historyTransactionId ?? input.id,
    instruction,
    status: "thinking",
    steps: [],
    researchTargets: Array.from(new Set((input.continuation?.researchTargets ?? input.researchTargets ?? []).map((target) => target.trim()).filter(Boolean))).slice(0, 12),
    researchMode: input.continuation?.researchMode ?? input.researchMode,
    modelSelection: input.continuation?.modelSelection ?? input.modelSelection ?? CANVAS_V2_DEFAULT_MODEL,
    workingContext: input.continuation?.workingContext ?? input.workingContext,
    ...(input.continuation ? {
      continuationOf: input.continuation.previousRunId,
      priorSteps: (input.continuation.priorSteps ?? []).slice(-CANVAS_V2_MAX_CONTEXT_STEPS),
      creativeDirection: input.continuation.creativeDirection,
      spatialStrategy: input.continuation.spatialStrategy,
      compositionState: input.continuation.compositionState,
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
  compositionState?: CanvasV2CompositionState;
  islandExecution?: CanvasV2IslandExecutionContract;
  reflection: CanvasV2RenderedReflection;
  researchStatus?: CanvasV2ResearchRequirement[];
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
    compositionState: input.compositionState,
    ...(input.islandExecution ? { islandExecution: input.islandExecution } : {}),
    reflection: input.reflection,
    ...(input.loop.providerAttempts?.length ? { providerAttempts: input.loop.providerAttempts } : {}),
    ...(input.loop.renderRepair?.attempt ? { renderRepairCount: input.loop.renderRepair.attempt } : {}),
    ...(input.loop.renderRepair?.failures?.length ? { renderRepairFailures: input.loop.renderRepair.failures.slice(-12) } : {}),
  }];
  const next: CanvasV2LoopState = {
    ...withoutRetry(input.loop),
    status: "thinking",
    steps,
    creativeDirection: input.creativeDirection,
    spatialStrategy: input.spatialStrategy,
    compositionState: input.compositionState,
    ...(input.researchStatus ? { researchStatus: input.researchStatus } : {}),
  };
  delete next.renderRepair;
  delete next.structuralRecovery;
  return next;
}

export function completeCanvasV2Loop(
  loop: CanvasV2LoopState,
  summary: string,
  creativeDirection: CanvasV2CreativeDirection,
  spatialStrategy: CanvasV2SpatialStrategy,
  compositionState: CanvasV2CompositionState | undefined,
  reflection: CanvasV2RenderedReflection,
): CanvasV2LoopState {
  if (loop.status !== "thinking") throw new Error("Canvas V2 can complete only after observing a committed revision.");
  return { ...withoutRetry(loop), status: "completed", creativeDirection, spatialStrategy, compositionState, finalReflection: reflection, finalSummary: summary, error: undefined };
}

export function stopCanvasV2Loop(loop: CanvasV2LoopState): CanvasV2LoopState {
  return { ...withoutRetry(loop), status: "stopped", error: undefined };
}

export function pauseCanvasV2Loop(loop: CanvasV2LoopState, reason: string): CanvasV2LoopState {
  return { ...withoutRetry(loop), status: "paused", error: undefined, pauseReason: reason };
}

export function recoverCanvasV2LoopAfterRejectedCandidate(
  loop: CanvasV2LoopState,
  failures: readonly string[],
  failedAction?: CanvasV2IslandExecutionContract["target"]["action"],
): CanvasV2LoopState {
  const next: CanvasV2LoopState = {
    ...withoutRetry(loop),
    status: "thinking",
    error: undefined,
    pauseReason: undefined,
    structuralRecovery: {
      attempt: (loop.structuralRecovery?.attempt ?? 0) + 1,
      failures: Array.from(new Set([...(loop.structuralRecovery?.failures ?? []), ...failures])).slice(-18),
      failedActions: Array.from(new Set([
        ...(loop.structuralRecovery?.failedActions ?? []),
        ...(failedAction ? [failedAction] : []),
      ])),
    },
  };
  delete next.renderRepair;
  return next;
}

export function failCanvasV2Loop(loop: CanvasV2LoopState, error: string): CanvasV2LoopState {
  return { ...withoutRetry(loop), status: "failed", error };
}
