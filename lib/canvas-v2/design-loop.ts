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
import type { CanvasV2ProviderAttemptAudit, CanvasV2ProviderUsage, CanvasV2RetryState } from "@/lib/canvas-v2/request-reliability";
import type { CanvasV2ResearchRequirement } from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import {
  CANVAS_V2_DEFAULT_MODEL,
  type CanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";
import type {
  CanvasV2DiscoveryMove,
  CanvasV2DiscoveryState,
  CanvasV2DiscoveryStateTransition,
} from "@/lib/canvas-v2/discovery-state";
import {
  CANVAS_V2_MAX_CHAT_ATTACHMENTS,
  type CanvasV2ChatAttachment,
} from "@/lib/canvas-v2/chat-attachments";
import {
  buildCanvasV2MountOlympusReceipt,
  type CanvasV2MountOlympusReceipt,
} from "@/lib/canvas-v2/discovery-reliability";

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
  | "awaiting-user"
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
  /**
   * True wall-clock time from the beginning of this material turn until its
   * verified candidate is atomically promoted. This includes direction,
   * authorship, rendering, observation, and every private corrective attempt.
   */
  elapsedMs?: number;
  providerAttempts?: CanvasV2ProviderAttemptAudit[];
  renderRepairCount?: number;
  privateRecoveryCount?: number;
  /** Exact deterministic failures retained for production diagnostics. */
  renderRepairFailures?: string[];
  discoveryMove?: CanvasV2DiscoveryMove;
  understanding?: string;
}

export interface CanvasV2LoopState {
  id: string;
  /** Stable undo transaction shared by every accepted revision in this user turn. */
  historyTransactionId: string;
  instruction: string;
  /** Human-supplied evidence retained for this run and its private repairs. */
  attachments?: CanvasV2ChatAttachment[];
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
  /** Router work is part of the same user-triggered run and release receipt. */
  routerProviderAttempts?: CanvasV2ProviderAttemptAudit[];
  /** Cumulative paid usage for this user-triggered run. Continuations start fresh. */
  providerUsage?: CanvasV2ProviderUsage;
  /** Paid-usage baseline at the latest verified canvas commit. */
  providerUsageCheckpoint?: CanvasV2ProviderUsage;
  modelSelection?: CanvasV2ModelSelection;
  activeModel?: string;
  workingContext?: CanvasV2WorkingContext;
  discoveryState?: CanvasV2DiscoveryState;
  discoveryProgress?: CanvasV2DiscoveryStateTransition["progress"];
  clarification?: {
    question: string;
    whyItMatters: string;
  };
  renderRepair?: {
    attempt: number;
    maxAttempts: number;
    failures: string[];
    failedMove?: string;
    /** Preserve the authored move's public language across a private correction. */
    originalMove?: {
      summary: string;
      expectedVisualResult: string;
    };
    /** Provider work already spent on the rejected draft, retained for audit. */
    providerAttemptsBeforeRepair?: CanvasV2ProviderAttemptAudit[];
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
   * A rejected private phase is replanned from committed truth without asking
   * the person to continue or exposing validator language. This is diagnostic
   * lineage and corrective context, never a user-facing workflow state.
   */
  privateRecovery?: {
    kind: "phase-contract" | "render-integrity" | "capture";
    fingerprint: string;
    occurrence: number;
    failures: string[];
    rejectedMove?: string;
    providerAttemptsBeforeRecovery?: CanvasV2ProviderAttemptAudit[];
  };
  /**
   * Last browser-measured private rejection, retained across async React and
   * provider phase boundaries for diagnostics. It is never public copy.
   */
  lastRenderIntegrityFailures?: string[];
  /** Internal release and observability truth. Never authored into the canvas. */
  summitReceipt?: CanvasV2MountOlympusReceipt;
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
  discoveryState?: CanvasV2DiscoveryState;
}

/**
 * A new user message starts a new undo transaction, but it must not forget the
 * model-owned composition ledger from the canvas turn that produced the
 * current committed revision. Paused-run continuation supplies a
 * historyTransactionId explicitly; cross-turn lineage deliberately omits it so
 * createCanvasV2Loop allocates the new user turn its own undo slot.
 */
export function canvasV2NewTurnContinuation(
  previous: CanvasV2LoopState | undefined,
  input: {
    modelSelection?: CanvasV2ModelSelection;
    workingContext?: CanvasV2WorkingContext;
    discoveryState?: CanvasV2DiscoveryState;
  } = {},
): CanvasV2LoopContinuation | undefined {
  if (!previous?.compositionState) return undefined;
  return {
    previousRunId: previous.id,
    priorSteps: [...(previous.priorSteps ?? []), ...previous.steps].slice(-CANVAS_V2_MAX_CONTEXT_STEPS),
    creativeDirection: previous.creativeDirection,
    spatialStrategy: previous.spatialStrategy,
    compositionState: previous.compositionState,
    researchStatus: previous.researchStatus,
    modelSelection: input.modelSelection ?? previous.modelSelection,
    workingContext: input.workingContext,
    discoveryState: input.discoveryState ?? previous.discoveryState,
  };
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
  discoveryState?: CanvasV2DiscoveryState;
  providerUsage?: CanvasV2ProviderUsage;
  routerProviderAttempts?: CanvasV2ProviderAttemptAudit[];
  attachments?: CanvasV2ChatAttachment[];
}): CanvasV2LoopState {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("Canvas V2 requires a design instruction.");
  const discoveryState = input.continuation?.discoveryState ?? input.discoveryState;
  const latestHumanInput = discoveryState?.humanInputs.at(-1);
  const initialDiscoveryProgress = latestHumanInput?.kind === "validation-result"
    ? {
        stage: "understanding" as const,
        label: "Reading what you learned",
        detail: "North Star is updating the recommendation from the findings you supplied.",
      }
    : latestHumanInput?.kind === "validation-decision"
      ? {
          stage: "understanding" as const,
          label: "Following your decision",
          detail: "North Star is preserving your choice and adjusting the next useful step.",
        }
      : discoveryState?.sourceCategories.includes("external")
    ? {
        stage: "investigating" as const,
        label: "Checking the world beyond the board",
        detail: "North Star is resolving the smallest public-evidence gap that could materially change the answer.",
      }
    : discoveryState && discoveryState.evidenceNeed !== "irrelevant"
      ? {
          stage: "understanding" as const,
          label: "Reading the grounded context",
          detail: "North Star is deciding which available evidence can materially improve the next move.",
        }
      : undefined;
  const loop: CanvasV2LoopState = {
    id: input.id,
    historyTransactionId: input.continuation?.historyTransactionId ?? input.id,
    instruction,
    ...(input.attachments?.length ? { attachments: input.attachments.slice(0, CANVAS_V2_MAX_CHAT_ATTACHMENTS) } : {}),
    status: "thinking",
    steps: [],
    researchTargets: Array.from(new Set((input.continuation?.researchTargets ?? input.researchTargets ?? []).map((target) => target.trim()).filter(Boolean))).slice(0, 12),
    researchMode: input.continuation?.researchMode ?? input.researchMode,
    modelSelection: input.continuation?.modelSelection ?? input.modelSelection ?? CANVAS_V2_DEFAULT_MODEL,
    workingContext: input.continuation?.workingContext ?? input.workingContext,
    discoveryState,
    ...(input.providerUsage ? { providerUsage: input.providerUsage, providerUsageCheckpoint: input.providerUsage } : {}),
    ...(input.routerProviderAttempts?.length ? { routerProviderAttempts: input.routerProviderAttempts } : {}),
    ...(initialDiscoveryProgress ? { discoveryProgress: initialDiscoveryProgress } : {}),
    ...(input.continuation ? {
      continuationOf: input.continuation.previousRunId,
      priorSteps: (input.continuation.priorSteps ?? []).slice(-CANVAS_V2_MAX_CONTEXT_STEPS),
      creativeDirection: input.continuation.creativeDirection,
      spatialStrategy: input.continuation.spatialStrategy,
      compositionState: input.continuation.compositionState,
      researchStatus: input.continuation.researchStatus,
    } : {}),
  };
  return { ...loop, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop, routerAttempts: loop.routerProviderAttempts }) };
}

export function canvasV2LoopIsActive(loop: CanvasV2LoopState | undefined): boolean {
  return loop?.status === "thinking" || loop?.status === "rendering";
}

export function refreshCanvasV2MountOlympusReceipt(loop: CanvasV2LoopState): CanvasV2LoopState {
  const receiptInput = { ...loop };
  delete receiptInput.summitReceipt;
  return {
    ...receiptInput,
    summitReceipt: buildCanvasV2MountOlympusReceipt({
      loop: receiptInput,
      routerAttempts: receiptInput.routerProviderAttempts,
    }),
  };
}

function withoutRetry(loop: CanvasV2LoopState): CanvasV2LoopState {
  if (!loop.retry) return loop;
  const next = { ...loop };
  delete next.retry;
  return { ...next, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop: next, routerAttempts: next.routerProviderAttempts }) };
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
  elapsedMs?: number;
  researchStatus?: CanvasV2ResearchRequirement[];
  discoveryState?: CanvasV2DiscoveryState;
  discoveryProgress?: CanvasV2DiscoveryStateTransition["progress"];
}): CanvasV2LoopState {
  if (input.loop.status !== "rendering") throw new Error("Canvas V2 can record an edit only after candidate rendering.");
  const latestDiscoveryMove = input.discoveryState?.moves.at(-1);
  const visiblyPresentedValidation = latestDiscoveryMove?.kind === "design-validation"
    && input.islandExecution?.requiredVisualRoles.includes("human-validation-plan")
    && input.islandExecution.requiredVisualRoles.includes("decision-gate")
    ? [...(input.discoveryState?.validationBacklog ?? [])].reverse().find((validation) => (
        validation.status === "proposed" || validation.status === "accepted" || validation.status === "in-progress"
      ))
    : undefined;
  const committedDiscoveryState = input.discoveryState && visiblyPresentedValidation
    ? {
        ...input.discoveryState,
        presentedValidationIds: Array.from(new Set([
          ...(input.discoveryState.presentedValidationIds ?? []),
          visiblyPresentedValidation.id,
        ])),
      }
    : input.discoveryState;
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
    ...(typeof input.elapsedMs === "number" ? { elapsedMs: Math.max(0, Math.round(input.elapsedMs)) } : {}),
    ...(input.loop.providerAttempts?.length ? { providerAttempts: input.loop.providerAttempts } : {}),
    ...(input.loop.renderRepair?.attempt ? { renderRepairCount: input.loop.renderRepair.attempt } : {}),
    ...(input.loop.privateRecovery?.occurrence ? { privateRecoveryCount: input.loop.privateRecovery.occurrence } : {}),
    ...((input.loop.renderRepair?.failures?.length || input.loop.lastRenderIntegrityFailures?.length) ? {
      renderRepairFailures: (input.loop.renderRepair?.failures ?? input.loop.lastRenderIntegrityFailures ?? []).slice(-12),
    } : {}),
    ...(committedDiscoveryState?.moves.at(-1) ? { discoveryMove: committedDiscoveryState.moves.at(-1) } : {}),
    ...(committedDiscoveryState?.latestUnderstanding ? { understanding: committedDiscoveryState.latestUnderstanding } : {}),
  }];
  const next: CanvasV2LoopState = {
    ...withoutRetry(input.loop),
    status: "thinking",
    steps,
    creativeDirection: input.creativeDirection,
    spatialStrategy: input.spatialStrategy,
    compositionState: input.compositionState,
    ...(input.researchStatus ? { researchStatus: input.researchStatus } : {}),
    ...(committedDiscoveryState ? { discoveryState: committedDiscoveryState } : {}),
    ...(input.discoveryProgress ? { discoveryProgress: input.discoveryProgress } : {}),
    ...(input.loop.providerUsage ? { providerUsageCheckpoint: input.loop.providerUsage } : {}),
  };
  delete next.clarification;
  delete next.renderRepair;
  delete next.privateRecovery;
  delete next.lastRenderIntegrityFailures;
  return { ...next, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop: next, routerAttempts: next.routerProviderAttempts }) };
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
  const completed: CanvasV2LoopState = { ...withoutRetry(loop), status: "completed", creativeDirection, spatialStrategy, compositionState, finalReflection: reflection, finalSummary: summary, error: undefined };
  delete completed.privateRecovery;
  return { ...completed, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop: completed, routerAttempts: completed.routerProviderAttempts }) };
}

export function stopCanvasV2Loop(loop: CanvasV2LoopState): CanvasV2LoopState {
  const stopped: CanvasV2LoopState = { ...withoutRetry(loop), status: "stopped", error: undefined };
  return { ...stopped, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop: stopped, routerAttempts: stopped.routerProviderAttempts }) };
}

export function awaitCanvasV2HumanJudgment(
  loop: CanvasV2LoopState,
  input: {
    discoveryState: CanvasV2DiscoveryState;
    progress: CanvasV2DiscoveryStateTransition["progress"];
    clarification: { question: string; whyItMatters: string };
  },
): CanvasV2LoopState {
  const waiting: CanvasV2LoopState = {
    ...withoutRetry(loop),
    status: "awaiting-user",
    discoveryState: input.discoveryState,
    discoveryProgress: input.progress,
    clarification: input.clarification,
    error: undefined,
    pauseReason: undefined,
  };
  return { ...waiting, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop: waiting, routerAttempts: waiting.routerProviderAttempts }) };
}

export function pauseCanvasV2Loop(loop: CanvasV2LoopState, reason: string): CanvasV2LoopState {
  const paused: CanvasV2LoopState = { ...withoutRetry(loop), status: "paused", error: undefined, pauseReason: reason };
  return { ...paused, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop: paused, routerAttempts: paused.routerProviderAttempts }) };
}

export function failCanvasV2Loop(loop: CanvasV2LoopState, error: string): CanvasV2LoopState {
  const failed: CanvasV2LoopState = { ...withoutRetry(loop), status: "failed", error };
  return { ...failed, summitReceipt: buildCanvasV2MountOlympusReceipt({ loop: failed, routerAttempts: failed.routerProviderAttempts }) };
}
