// Northstar v0.7.9 â€” bounded run-health primitives for irreversible terminal control.

import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";

export type NorthstarRunTerminalState = "complete" | "incomplete" | "blocked" | "failed" | "cancelled";

export type NorthstarVisualStage =
  | "foundation"
  | "evidence"
  | "analysis"
  | "recommendation"
  | "refinement"
  | "publication";

export class NorthstarRunHealthError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(input: {
    code: string;
    message: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "NorthstarRunHealthError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
  }
}

export class NorthstarVisualStageBlockedError extends NorthstarRunHealthError {
  readonly stage: NorthstarVisualStage;

  constructor(stage: NorthstarVisualStage, reason: string, cause?: unknown) {
    super({
      code: "NORTHSTAR_VISUAL_STAGE_BLOCKED",
      message: `Northstar could not safely commit the ${stage} stage: ${reason}`,
      retryable: false,
      cause,
    });
    this.name = "NorthstarVisualStageBlockedError";
    this.stage = stage;
  }
}

export class NorthstarBudgetExceededError extends NorthstarRunHealthError {
  readonly scope: string;
  readonly limit: number;

  constructor(scope: string, limit: number, detail?: string) {
    super({
      code: "NORTHSTAR_ATTEMPT_BUDGET_EXCEEDED",
      message: detail || `Northstar exhausted the bounded ${scope} attempt budget (${limit}).`,
      retryable: false,
    });
    this.name = "NorthstarBudgetExceededError";
    this.scope = scope;
    this.limit = limit;
  }
}

export class NorthstarOperationTimeoutError extends NorthstarRunHealthError {
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number, cause?: unknown) {
    super({
      code: "NORTHSTAR_OPERATION_TIMEOUT",
      message: `${label} exceeded its ${Math.ceil(timeoutMs / 1_000)} second safety deadline.`,
      retryable: true,
      cause,
    });
    this.name = "NorthstarOperationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class NorthstarAttemptBudget {
  private readonly counts = new Map<string, number>();

  consume(scope: string, limit: number, detail?: string): number {
    const safeLimit = Math.max(1, Math.floor(limit));
    const next = (this.counts.get(scope) ?? 0) + 1;
    this.counts.set(scope, next);
    if (next > safeLimit) throw new NorthstarBudgetExceededError(scope, safeLimit, detail);
    return next;
  }

  used(scope: string): number {
    return this.counts.get(scope) ?? 0;
  }

  reset(scope: string): void {
    this.counts.delete(scope);
  }
}

export class NorthstarRunLifecycle {
  private terminalState?: NorthstarRunTerminalState;

  terminal(): NorthstarRunTerminalState | undefined {
    return this.terminalState;
  }

  assertActive(): void {
    if (this.terminalState) {
      throw new NorthstarRunHealthError({
        code: "NORTHSTAR_RUN_ALREADY_TERMINAL",
        message: `Northstar cannot continue after the run became ${this.terminalState}.`,
      });
    }
  }

  finish(state: NorthstarRunTerminalState): void {
    if (this.terminalState && this.terminalState !== state) {
      throw new NorthstarRunHealthError({
        code: "NORTHSTAR_TERMINAL_STATE_CONFLICT",
        message: `Northstar cannot change a terminal run from ${this.terminalState} to ${state}.`,
      });
    }
    this.terminalState = state;
  }
}

export type NorthstarVisualDispatchStage =
  | "continuity"
  | "publication-preparation"
  | "actor"
  | "candidate-deduplication"
  | "action-build"
  | "browser"
  | "contract-review"
  | "semantic-review"
  | "commit";

export type NorthstarVisualDispatchResult =
  | {
      status: "committed";
      detail: string;
      stage: "commit";
      reasonCode: "COMMITTED";
      browserDispatched: true;
      recoverable: false;
      acknowledgement: NorthstarArtifactMutationAcknowledgement;
    }
  | {
      status: "skipped";
      detail: string;
      stage: NorthstarVisualDispatchStage;
      reasonCode: string;
      browserDispatched: boolean;
      recoverable: true;
      acknowledgement?: NorthstarArtifactMutationAcknowledgement;
    }
  | {
      status: "rejected";
      detail: string;
      stage: NorthstarVisualDispatchStage;
      reasonCode: string;
      browserDispatched: boolean;
      recoverable: true;
      acknowledgement?: NorthstarArtifactMutationAcknowledgement;
      operationIndex?: number;
      operation?: string;
      targetId?: string;
    }
  | {
      status: "blocked";
      detail: string;
      stage: NorthstarVisualDispatchStage;
      reasonCode: string;
      browserDispatched: boolean;
      recoverable: false;
      acknowledgement?: NorthstarArtifactMutationAcknowledgement;
    }
  | {
      status: "timed-out";
      detail: string;
      stage: NorthstarVisualDispatchStage;
      reasonCode: string;
      browserDispatched: boolean;
      recoverable: false;
      acknowledgement?: NorthstarArtifactMutationAcknowledgement;
    };

/**
 * A rejected mutation is a completed no-op only when the browser explicitly
 * says the requested semantic state was already present. An empty delta alone
 * is not enough: lineage, transport, and runtime failures also report no
 * changed nodes and must be retried or reconciled instead of marked complete.
 */
export function isNorthstarVerifiedNoopReason(reason: string | undefined): boolean {
  return /did not produce an observable material delta|did not visibly change enough semantic content|requested visual state was already present|already represented by the verified artboard/i.test(reason || "");
}

export function isNorthstarNonMaterialCompositionalDeltaReason(
  reason: string | undefined,
): boolean {
  return /did not produce a palpable compositional delta|changed area\s+[0-9.]+%\s*<\s*[0-9.]+%/i.test(reason || "");
}

export function isNorthstarVerifiedNoop(
  acknowledgement: NorthstarArtifactMutationAcknowledgement | undefined,
): boolean {
  return acknowledgement?.status === "rejected"
    && isNorthstarVerifiedNoopReason(acknowledgement.reason);
}

export function isNorthstarLineageRejection(
  acknowledgement: NorthstarArtifactMutationAcknowledgement | undefined,
): boolean {
  if (acknowledgement?.status !== "rejected") return false;
  const reason = acknowledgement.reason || "";
  return /base revision does not match|lineage is discontinuous|proposal identity/i.test(reason);
}

export async function runNorthstarOperationWithTimeout<T>(input: {
  label: string;
  timeoutMs: number;
  parentSignal: AbortSignal;
  operation: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  if (input.parentSignal.aborted) throw new DOMException("Aborted", "AbortError");

  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = Math.max(1_000, Math.floor(input.timeoutMs));
  const abortFromParent = () => controller.abort(input.parentSignal.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Timed out", "TimeoutError"));
  }, timeoutMs);
  input.parentSignal.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await input.operation(controller.signal);
  } catch (error) {
    if (input.parentSignal.aborted) throw new DOMException("Aborted", "AbortError");
    if (timedOut) throw new NorthstarOperationTimeoutError(input.label, timeoutMs, error);
    throw error;
  } finally {
    clearTimeout(timer);
    input.parentSignal.removeEventListener("abort", abortFromParent);
  }
}