import { createNorthstarTurnClient, type NorthstarTurnClient } from "@/lib/canvas-ai/northstar-turn-client";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import type {
  NorthstarEphemeralLedger,
  NorthstarLedgerCommit,
  NorthstarLedgerSnapshot,
  NorthstarLedgerTask,
  NorthstarLedgerValue,
  NorthstarLedgerFailure,
} from "@/lib/canvas-ledger/types";
import {
  createNorthstarProjectionTaskController,
} from "@/lib/canvas-projection/controller";
import { NorthstarProjectionSurfaceError } from "@/lib/canvas-projection/surface";
import type { NorthstarProjectionSurface } from "@/lib/canvas-projection/types";
import type {
  NorthstarControllerStepResult,
  NorthstarTaskController,
} from "@/lib/canvas-ledger/northstar-task-controller";

export type NorthstarWorkspaceRuntimeStatus =
  | "idle"
  | "initializing"
  | "running"
  | "awaiting-recovery"
  | "blocked"
  | "completed"
  | "cancelled"
  | "failed"
  | "disposed";

export interface NorthstarWorkspaceRuntimeSnapshot {
  status: NorthstarWorkspaceRuntimeStatus;
  ledger: NorthstarLedgerSnapshot | null;
  lastStep: NorthstarControllerStepResult | null;
  finalSummary?: NorthstarLedgerValue;
  error?: string;
  recovery?: {
    taskId: string;
    attemptId: string;
    requestId: string;
  };
}

export interface NorthstarWorkspaceRunResult {
  status: Extract<NorthstarWorkspaceRuntimeStatus, "completed" | "awaiting-recovery" | "blocked" | "cancelled" | "failed">;
  ledger: NorthstarLedgerSnapshot | null;
  finalSummary?: NorthstarLedgerValue;
  error?: string;
}

export interface CreateNorthstarWorkspaceRuntimeInput {
  projectionSurface: NorthstarProjectionSurface;
  turnClient?: NorthstarTurnClient;
  maximumTasksPerRun?: number;
  initialCaptureAttempts?: number;
  initialCaptureRetryMs?: number;
  createLedger?: typeof createNorthstarEphemeralLedger;
  /**
   * Runs after an artboard commit is verified and before the next LLM decision.
   * Product state synchronization is therefore part of the progression gate.
   */
  onVerifiedArtboardCommit?(input: {
    task: NorthstarLedgerTask;
    commit: NorthstarLedgerCommit;
    ledger: NorthstarLedgerSnapshot;
  }): void | Promise<void>;
}

export interface NorthstarWorkspaceRuntime {
  getSnapshot(): NorthstarWorkspaceRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  startRun(objective: string): Promise<NorthstarWorkspaceRunResult>;
  resumeRun(): Promise<NorthstarWorkspaceRunResult>;
  cancelRun(reason?: string): void;
  dispose(): void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Northstar run was aborted.", "AbortError"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback();
    };
    const timer = setTimeout(() => finish(resolve), ms);
    const abort = () => finish(() => {
      clearTimeout(timer);
      reject(new DOMException("Northstar run was aborted.", "AbortError"));
    });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function finalSummaryFrom(snapshot: NorthstarLedgerSnapshot): NorthstarLedgerValue | undefined {
  const event = [...snapshot.events].reverse().find((candidate) => candidate.type === "run.completed");
  return event?.payload;
}

function normalizePositiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 1) {
    throw new Error(`${name} must be a finite positive number.`);
  }
  return Math.floor(resolved);
}

export function createNorthstarWorkspaceRuntime(
  input: CreateNorthstarWorkspaceRuntimeInput,
): NorthstarWorkspaceRuntime {
  const maximumTasksPerRun = normalizePositiveInteger(input.maximumTasksPerRun, 64, "maximumTasksPerRun");
  const initialCaptureAttempts = normalizePositiveInteger(input.initialCaptureAttempts, 50, "initialCaptureAttempts");
  const initialCaptureRetryMs = normalizePositiveInteger(input.initialCaptureRetryMs, 100, "initialCaptureRetryMs");
  const turnClient = input.turnClient ?? createNorthstarTurnClient();
  const createLedger = input.createLedger ?? createNorthstarEphemeralLedger;
  const listeners = new Set<() => void>();

  let state: NorthstarWorkspaceRuntimeSnapshot = {
    status: "idle",
    ledger: null,
    lastStep: null,
  };
  let ledger: NorthstarEphemeralLedger | null = null;
  let ledgerUnsubscribe: (() => void) | null = null;
  let controller: NorthstarTaskController | null = null;
  let runAbort: AbortController | null = null;
  let running: Promise<NorthstarWorkspaceRunResult> | null = null;
  let cancellationReason: string | null = null;
  let disposed = false;

  const publish = (patch: Partial<NorthstarWorkspaceRuntimeSnapshot> = {}): void => {
    if (disposed) return;
    state = {
      ...state,
      ...patch,
      ledger: ledger ? ledger.getSnapshot() : state.ledger,
    };
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Read-only observers cannot influence authoritative execution.
      }
    }
  };

  const teardownLedger = (): void => {
    ledgerUnsubscribe?.();
    ledgerUnsubscribe = null;
    ledger?.dispose();
    ledger = null;
    controller = null;
  };

  const captureInitialState = async (signal: AbortSignal): Promise<NorthstarLedgerValue> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= initialCaptureAttempts; attempt += 1) {
      try {
        const capture = await input.projectionSurface.capture(signal);
        return capture.state as unknown as NorthstarLedgerValue;
      } catch (error) {
        if (isAbortError(error) || signal.aborted) throw error;
        lastError = error;
        const retryable = error instanceof NorthstarProjectionSurfaceError
          ? error.failureKind === "transient"
          : true;
        if (!retryable || attempt === initialCaptureAttempts) break;
        await wait(initialCaptureRetryMs, signal);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Northstar could not capture the mounted artboard.");
  };

  const cancelAuthoritativeLedger = (reason: string): void => {
    if (!ledger) return;
    const snapshot = ledger.getSnapshot();
    if (snapshot.run.status !== "active") return;
    if (snapshot.activeTask) ledger.cancelTask(snapshot.activeTask.id, reason);
    ledger.cancelRun(reason);
  };

  const failAuthoritativeLedger = (
    code: string,
    detail: string,
    phase: NorthstarLedgerFailure["phase"] = "control",
  ): void => {
    if (!ledger) return;
    const snapshot = ledger.getSnapshot();
    if (snapshot.run.status !== "active") return;
    if (snapshot.activeTask) ledger.cancelTask(snapshot.activeTask.id, detail);
    ledger.failRun({
      kind: "terminal",
      code,
      detail,
      phase,
    });
  };


  const disposedCancellationResult = (): NorthstarWorkspaceRunResult => ({
    status: "cancelled",
    ledger: null,
    error: cancellationReason ?? "Workspace unmounted.",
  });

  const resultFromState = (): NorthstarWorkspaceRunResult => {
    const status = state.status;
    if (!["completed", "awaiting-recovery", "blocked", "cancelled", "failed"].includes(status)) {
      throw new Error(`Northstar runtime cannot return a ${status} result.`);
    }
    const snapshot = ledger?.getSnapshot() ?? null;
    if (!snapshot && status !== "cancelled" && status !== "failed") {
      throw new Error(`Northstar runtime has no authoritative ledger for ${status}.`);
    }
    return {
      status: status as NorthstarWorkspaceRunResult["status"],
      ledger: snapshot,
      finalSummary: state.finalSummary,
      error: state.error,
    };
  };

  const drive = async (): Promise<NorthstarWorkspaceRunResult> => {
    if (!ledger || !controller || !runAbort) throw new Error("Northstar run is not initialized.");
    let completedTasks = ledger.getSnapshot().tasks.filter((task) => task.status === "completed").length;

    while (true) {
      if (runAbort.signal.aborted || cancellationReason) {
        if (disposed) return disposedCancellationResult();
        const reason = cancellationReason ?? "Northstar run was cancelled.";
        cancelAuthoritativeLedger(reason);
        publish({ status: "cancelled", error: undefined, recovery: undefined });
        return resultFromState();
      }

      const snapshot = ledger.getSnapshot();
      if (snapshot.run.status === "completed") {
        const finalSummary = finalSummaryFrom(snapshot);
        publish({ status: "completed", finalSummary, error: undefined, recovery: undefined });
        return resultFromState();
      }
      if (snapshot.run.status === "cancelled") {
        publish({ status: "cancelled", error: undefined, recovery: undefined });
        return resultFromState();
      }

      let step: NorthstarControllerStepResult;
      try {
        step = snapshot.activeTask
          ? await controller.resumeActiveTask()
          : await controller.runNextTask();
      } catch (error) {
        if (isAbortError(error) || runAbort.signal.aborted || cancellationReason) {
          if (disposed) return disposedCancellationResult();
          const reason = cancellationReason ?? "Northstar run was cancelled.";
          cancelAuthoritativeLedger(reason);
          publish({ status: "cancelled", error: undefined, recovery: undefined });
          return resultFromState();
        }
        const detail = error instanceof Error ? error.message : String(error);
        failAuthoritativeLedger("WORKSPACE_RUNTIME_FAILED", detail);
        publish({
          status: "failed",
          error: detail,
          recovery: undefined,
        });
        return resultFromState();
      }

      publish({ lastStep: step });
      if (runAbort.signal.aborted || cancellationReason) {
        if (
          (step.type === "task-blocked" || step.type === "control-blocked") &&
          step.failure.kind === "terminal"
        ) {
          failAuthoritativeLedger(step.failure.code, step.failure.detail, step.failure.phase);
          publish({ status: "failed", error: step.failure.detail, recovery: undefined });
          return resultFromState();
        }
        if (disposed) return disposedCancellationResult();
        const reason = cancellationReason ?? "Northstar run was cancelled.";
        cancelAuthoritativeLedger(reason);
        publish({ status: "cancelled", error: undefined, recovery: undefined });
        return resultFromState();
      }
      if (step.type === "task-completed") {
        completedTasks += 1;
        if (completedTasks > maximumTasksPerRun) {
          const error = `Northstar exceeded the ${maximumTasksPerRun}-task run limit.`;
          failAuthoritativeLedger("WORKSPACE_TASK_LIMIT_EXCEEDED", error);
          publish({ status: "failed", error, recovery: undefined });
          return resultFromState();
        }
        const committedSnapshot = ledger.getSnapshot();
        const committedTask = committedSnapshot.tasks.find((task) => task.id === step.taskId);
        const committed = committedSnapshot.commits.find((commit) => commit.hash === step.commitHash);
        if (committedTask?.kind === "artboard-mutation" && committed && input.onVerifiedArtboardCommit) {
          try {
            await input.onVerifiedArtboardCommit({
              task: committedTask,
              commit: committed,
              ledger: committedSnapshot,
            });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            failAuthoritativeLedger("ARTBOARD_MODEL_SYNC_FAILED", detail, "control");
            publish({
              status: "failed",
              error: "The verified artboard could not be synchronized back into the canvas document.",
              recovery: undefined,
            });
            return resultFromState();
          }
        }
        continue;
      }
      if (step.type === "task-cancelled" || step.type === "task-superseded") continue;
      if (step.type === "run-completed") {
        const finalSummary = finalSummaryFrom(ledger.getSnapshot());
        publish({ status: "completed", finalSummary, error: undefined, recovery: undefined });
        return resultFromState();
      }
      if (step.type === "task-awaiting-transport-resolution") {
        publish({
          status: "awaiting-recovery",
          error: "The last request may have completed, but its response was not confirmed. Resume to reconcile the exact same attempt.",
          recovery: {
            taskId: step.taskId,
            attemptId: step.attemptId,
            requestId: step.requestId,
          },
        });
        return resultFromState();
      }
      if (step.type === "task-awaiting-artboard-runtime") {
        publish({
          status: "blocked",
          error: "The active artboard task is waiting for a projection runtime.",
          recovery: undefined,
        });
        return resultFromState();
      }
      publish({
        status: "blocked",
        error: step.failure.detail,
        recovery: undefined,
      });
      return resultFromState();
    }
  };

  const beginDrive = (): Promise<NorthstarWorkspaceRunResult> => {
    if (running) return running;
    running = drive().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    getSnapshot() {
      return state;
    },

    subscribe(listener) {
      if (disposed) throw new Error("Northstar workspace runtime is disposed.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async startRun(objective) {
      if (disposed) throw new Error("Northstar workspace runtime is disposed.");
      if (!objective.trim()) throw new Error("Northstar run objective cannot be empty.");
      if (running || state.status === "initializing" || state.status === "running") {
        throw new Error("Northstar already has an active run.");
      }
      if (state.status === "awaiting-recovery" || state.status === "blocked") {
        throw new Error("Resolve or cancel the existing Northstar run before starting another one.");
      }

      teardownLedger();
      runAbort?.abort();
      runAbort = new AbortController();
      cancellationReason = null;
      state = { status: "initializing", ledger: null, lastStep: null };
      publish();

      try {
        const initialStateSnapshot = await captureInitialState(runAbort.signal);
        if (runAbort.signal.aborted || cancellationReason) {
          throw new DOMException("Northstar run was aborted.", "AbortError");
        }
        ledger = createLedger({ objective: objective.trim(), initialStateSnapshot });
        ledgerUnsubscribe = ledger.subscribe(() => publish());
        controller = createNorthstarProjectionTaskController({
          ledger,
          client: turnClient,
          projectionSurface: input.projectionSurface,
          signal: runAbort.signal,
          reduceCommittedResult({ context }) {
            // Research, analysis and verification commits preserve the exact
            // artboard state. Only Phase 3 projection changes canonical state.
            return context.currentHead.stateSnapshot;
          },
        });
        publish({ status: "running", error: undefined, finalSummary: undefined, recovery: undefined });
        return await beginDrive();
      } catch (error) {
        if (isAbortError(error) || runAbort.signal.aborted || cancellationReason) {
          if (disposed) return disposedCancellationResult();
          if (ledger) cancelAuthoritativeLedger(cancellationReason ?? "Northstar run was cancelled.");
          publish({ status: "cancelled", error: undefined, recovery: undefined });
          return resultFromState();
        }
        publish({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          recovery: undefined,
        });
        if (!ledger) {
          // Initialization failed before an authoritative ledger existed.
          throw error;
        }
        return resultFromState();
      }
    },

    async resumeRun() {
      if (disposed) throw new Error("Northstar workspace runtime is disposed.");
      if (!ledger || !controller || !runAbort) throw new Error("Northstar has no run to resume.");
      if (running) return running;
      if (state.status !== "awaiting-recovery" && state.status !== "blocked") {
        throw new Error(`A ${state.status} Northstar run cannot be resumed.`);
      }
      if (!ledger.getSnapshot().activeTask) {
        throw new Error("Northstar has no unresolved task to resume.");
      }
      cancellationReason = null;
      publish({ status: "running", error: undefined, recovery: undefined });
      return beginDrive();
    },

    cancelRun(reason = "Cancelled by the user.") {
      if (disposed) return;
      cancellationReason = reason;
      runAbort?.abort();
      if (!running && ledger) {
        cancelAuthoritativeLedger(reason);
        publish({ status: "cancelled", error: undefined, recovery: undefined });
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancellationReason = "Workspace unmounted.";
      runAbort?.abort();
      if (ledger) {
        try {
          cancelAuthoritativeLedger(cancellationReason);
        } catch {
          // Disposal must remain best-effort and cannot revive authority.
        }
      }
      teardownLedger();
      state = { ...state, status: "disposed", ledger: null };
      listeners.clear();
    },
  };
}
