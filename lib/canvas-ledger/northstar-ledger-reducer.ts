import {
  cloneNorthstarLedgerFailure,
  cloneNorthstarLedgerValue,
  cloneNorthstarProjectionReceipt,
  createNorthstarLedgerHash,
  stableStringifyNorthstarLedgerValue,
} from "@/lib/canvas-ledger/northstar-ledger-value";
import type {
  NorthstarActivityDraft,
  NorthstarLedgerCommit,
  NorthstarLedgerEvent,
  NorthstarLedgerFailure,
  NorthstarLedgerState,
  NorthstarLedgerTask,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
  NorthstarProjectionReceipt,
} from "@/lib/canvas-ledger/types";

export class NorthstarLedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NorthstarLedgerInvariantError";
  }
}

export interface CreateNorthstarLedgerStateInput {
  runId: string;
  objective: string;
  rootCommitHash: string;
  rootStateSnapshot: NorthstarLedgerValue;
  createdAt: number;
}

export type NorthstarLedgerCommand =
  | {
      type: "record-decision";
      summary: string;
      payload?: NorthstarLedgerValue;
      timestamp: number;
    }
  | {
      type: "record-control-failure";
      failure: NorthstarLedgerFailure;
      taskId?: string;
      timestamp: number;
    }
  | {
      type: "create-task";
      taskId: string;
      activity: NorthstarActivityDraft;
      timestamp: number;
    }
  | {
      type: "start-attempt";
      taskId: string;
      attemptId: string;
      executionInput: NorthstarLedgerValue;
      timestamp: number;
    }
  | {
      type: "record-artboard-draft";
      taskId: string;
      attemptId: string;
      draft: NorthstarLedgerValue;
      timestamp: number;
    }
  | {
      type: "record-attempt-transport-uncertain";
      taskId: string;
      attemptId: string;
      requestId: string;
      code: string;
      detail: string;
      retryable: boolean;
      timestamp: number;
    }
  | {
      type: "record-attempt-transport-retry";
      taskId: string;
      attemptId: string;
      requestId: string;
      timestamp: number;
    }
  | {
      type: "record-attempt-prepared";
      taskId: string;
      attemptId: string;
      preparedResult: NorthstarLedgerValue;
      candidateCommitHash: string;
      candidateStateHash: string;
      result: NorthstarLedgerValue;
      stateSnapshot: NorthstarLedgerValue;
      timestamp: number;
    }
  | {
      type: "record-attempt-failure";
      taskId: string;
      attemptId: string;
      failure: NorthstarLedgerFailure;
      timestamp: number;
    }
  | {
      type: "record-preparation-failure";
      taskId: string;
      attemptId: string;
      failure: NorthstarLedgerFailure;
      timestamp: number;
    }
  | {
      type: "record-projection-failure";
      taskId: string;
      attemptId: string;
      failure: NorthstarLedgerFailure;
      timestamp: number;
    }
  | {
      type: "commit-task";
      taskId: string;
      attemptId: string;
      commit: NorthstarLedgerCommit;
      result: NorthstarLedgerValue;
      stateSnapshot: NorthstarLedgerValue;
      projectionReceipt?: NorthstarProjectionReceipt;
      timestamp: number;
    }
  | {
      type: "cancel-task";
      taskId: string;
      reason: string;
      timestamp: number;
    }
  | {
      type: "supersede-task";
      taskId: string;
      reason: string;
      timestamp: number;
    }
  | {
      type: "complete-run";
      summary?: NorthstarLedgerValue;
      timestamp: number;
    }
  | {
      type: "fail-run";
      failure: NorthstarLedgerFailure;
      timestamp: number;
    }
  | {
      type: "cancel-run";
      reason: string;
      timestamp: number;
    };

function appendEvent(
  state: NorthstarLedgerState,
  input: Omit<NorthstarLedgerEvent, "sequence" | "runId">,
): NorthstarLedgerState {
  const event: NorthstarLedgerEvent = {
    ...input,
    payload: input.payload === undefined
      ? undefined
      : cloneNorthstarLedgerValue(input.payload),
    sequence: state.run.nextEventSequence,
    runId: state.run.id,
  };

  return {
    ...state,
    run: {
      ...state.run,
      nextEventSequence: state.run.nextEventSequence + 1,
    },
    events: [...state.events, event],
  };
}

function requireActiveRun(state: NorthstarLedgerState): void {
  if (state.run.status !== "active") {
    throw new NorthstarLedgerInvariantError(`Run ${state.run.id} is ${state.run.status}, not active.`);
  }
}

function requireTask(state: NorthstarLedgerState, taskId: string): NorthstarLedgerTask {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new NorthstarLedgerInvariantError(`Unknown task ${taskId}.`);
  return task;
}

function requireAttempt(
  state: NorthstarLedgerState,
  taskId: string,
  attemptId: string,
): NorthstarLedgerTaskAttempt {
  const attempt = state.attempts.find(
    (candidate) => candidate.id === attemptId && candidate.taskId === taskId,
  );
  if (!attempt) {
    throw new NorthstarLedgerInvariantError(
      `Unknown attempt ${attemptId} for task ${taskId}.`,
    );
  }
  return attempt;
}

function replaceTask(
  tasks: readonly NorthstarLedgerTask[],
  taskId: string,
  update: (task: NorthstarLedgerTask) => NorthstarLedgerTask,
): readonly NorthstarLedgerTask[] {
  return tasks.map((task) => (task.id === taskId ? update(task) : task));
}

function replaceAttempt(
  attempts: readonly NorthstarLedgerTaskAttempt[],
  attemptId: string,
  update: (attempt: NorthstarLedgerTaskAttempt) => NorthstarLedgerTaskAttempt,
): readonly NorthstarLedgerTaskAttempt[] {
  return attempts.map((attempt) => (attempt.id === attemptId ? update(attempt) : attempt));
}

function ledgerValuesEqual(
  left: NorthstarLedgerValue,
  right: NorthstarLedgerValue,
): boolean {
  return stableStringifyNorthstarLedgerValue(left) === stableStringifyNorthstarLedgerValue(right);
}

function failuresEqual(
  left: NorthstarLedgerFailure,
  right: NorthstarLedgerFailure,
): boolean {
  return (
    left.kind === right.kind &&
    left.code === right.code &&
    left.detail === right.detail &&
    left.phase === right.phase &&
    ledgerValuesEqual(left.correctionContext ?? null, right.correctionContext ?? null)
  );
}

function projectionReceiptsEqual(
  left: NorthstarProjectionReceipt | undefined,
  right: NorthstarProjectionReceipt | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.commitHash === right.commitHash &&
    left.projectedStateHash === right.projectedStateHash &&
    left.surfaceSessionId === right.surfaceSessionId &&
    left.verified === right.verified &&
    ledgerValuesEqual(left.metadata ?? null, right.metadata ?? null)
  );
}

export function createInitialNorthstarLedgerState(
  input: CreateNorthstarLedgerStateInput,
): NorthstarLedgerState {
  const rootCommit: NorthstarLedgerCommit = {
    hash: input.rootCommitHash,
    stateHash: createNorthstarLedgerHash(input.rootStateSnapshot),
    runId: input.runId,
    sequence: 0,
    kind: "root",
    parentHash: null,
    taskId: null,
    attemptId: null,
    taskKind: null,
    result: { type: "root" },
    stateSnapshot: cloneNorthstarLedgerValue(input.rootStateSnapshot),
    createdAt: input.createdAt,
  };

  return {
    run: {
      id: input.runId,
      objective: input.objective,
      status: "active",
      headCommitHash: input.rootCommitHash,
      activeTaskId: null,
      nextTaskSequence: 1,
      nextCommitSequence: 1,
      nextEventSequence: 3,
      createdAt: input.createdAt,
    },
    tasks: [],
    attempts: [],
    commits: [rootCommit],
    events: [
      {
        sequence: 1,
        runId: input.runId,
        type: "run.created",
        summary: "Northstar ledger run created.",
        timestamp: input.createdAt,
      },
      {
        sequence: 2,
        runId: input.runId,
        commitHash: input.rootCommitHash,
        type: "commit.created",
        summary: "Root commit created.",
        payload: { commitSequence: 0 },
        timestamp: input.createdAt,
      },
    ],
  };
}

export function reduceNorthstarLedger(
  state: NorthstarLedgerState,
  command: NorthstarLedgerCommand,
): NorthstarLedgerState {
  switch (command.type) {
    case "record-decision": {
      requireActiveRun(state);
      return appendEvent(state, {
        type: "decision.recorded",
        summary: command.summary,
        payload: command.payload,
        timestamp: command.timestamp,
      });
    }

    case "record-control-failure": {
      requireActiveRun(state);
      if (command.taskId) requireTask(state, command.taskId);
      return appendEvent(state, {
        type: "control.failed",
        taskId: command.taskId,
        summary: `${command.failure.phase} control failure: ${command.failure.code}`,
        payload: {
          failureKind: command.failure.kind,
          detail: command.failure.detail,
          correctionContext: command.failure.correctionContext ?? null,
        },
        timestamp: command.timestamp,
      });
    }

    case "create-task": {
      requireActiveRun(state);
      const duplicate = state.tasks.find((task) => task.id === command.taskId);
      if (duplicate) {
        const matches =
          duplicate.kind === command.activity.kind &&
          duplicate.intent === command.activity.intent &&
          duplicate.expectedOutcome === command.activity.expectedOutcome &&
          ledgerValuesEqual(duplicate.initialExecutionInput, command.activity.executionInput);
        if (matches) return state;
        throw new NorthstarLedgerInvariantError(
          `Task ${command.taskId} was redelivered with contradictory content.`,
        );
      }
      if (state.run.activeTaskId) {
        throw new NorthstarLedgerInvariantError(
          `Cannot create a task while ${state.run.activeTaskId} is unresolved.`,
        );
      }

      const task: NorthstarLedgerTask = {
        id: command.taskId,
        runId: state.run.id,
        sequence: state.run.nextTaskSequence,
        kind: command.activity.kind,
        intent: command.activity.intent,
        expectedOutcome: command.activity.expectedOutcome,
        initialExecutionInput: cloneNorthstarLedgerValue(command.activity.executionInput),
        status: "created",
        baseCommitHash: state.run.headCommitHash,
        currentAttemptId: null,
        createdAt: command.timestamp,
      };

      return appendEvent(
        {
          ...state,
          run: {
            ...state.run,
            activeTaskId: task.id,
            nextTaskSequence: state.run.nextTaskSequence + 1,
          },
          tasks: [...state.tasks, task],
        },
        {
          type: "task.created",
          taskId: task.id,
          summary: `Task ${task.sequence} created: ${task.intent}`,
          payload: {
            kind: task.kind,
            baseCommitHash: task.baseCommitHash,
            expectedOutcome: task.expectedOutcome,
          },
          timestamp: command.timestamp,
        },
      );
    }

    case "start-attempt": {
      requireActiveRun(state);
      const task = requireTask(state, command.taskId);
      if (state.run.activeTaskId !== task.id) {
        throw new NorthstarLedgerInvariantError(`Task ${task.id} is not the active obligation.`);
      }
      if (["completed", "cancelled", "superseded"].includes(task.status)) {
        throw new NorthstarLedgerInvariantError(`Task ${task.id} is already ${task.status}.`);
      }

      const duplicate = state.attempts.find((attempt) => attempt.id === command.attemptId);
      if (duplicate) {
        if (
          duplicate.taskId === command.taskId &&
          ledgerValuesEqual(duplicate.executionInput, command.executionInput)
        ) return state;
        throw new NorthstarLedgerInvariantError(
          `Attempt ${command.attemptId} was redelivered with contradictory content.`,
        );
      }
      if (task.currentAttemptId) {
        const currentAttempt = requireAttempt(state, task.id, task.currentAttemptId);
        if (currentAttempt.status === "active" || currentAttempt.status === "drafted" || currentAttempt.status === "prepared") {
          throw new NorthstarLedgerInvariantError(
            `Task ${task.id} already has unresolved attempt ${currentAttempt.id}.`,
          );
        }
      }

      const attemptNumber = state.attempts.filter(
        (attempt) => attempt.taskId === task.id,
      ).length + 1;
      const attempt: NorthstarLedgerTaskAttempt = {
        id: command.attemptId,
        runId: state.run.id,
        taskId: task.id,
        attemptNumber,
        executionInput: cloneNorthstarLedgerValue(command.executionInput),
        status: "active",
        startedAt: command.timestamp,
      };

      return appendEvent(
        {
          ...state,
          tasks: replaceTask(state.tasks, task.id, (current) => ({
            ...current,
            status: "active",
            currentAttemptId: attempt.id,
          })),
          attempts: [...state.attempts, attempt],
        },
        {
          type: "attempt.started",
          taskId: task.id,
          attemptId: attempt.id,
          summary: `Attempt ${attempt.attemptNumber} started for task ${task.sequence}.`,
          payload: { executionInput: attempt.executionInput },
          timestamp: command.timestamp,
        },
      );
    }

    case "record-attempt-transport-uncertain": {
      requireActiveRun(state);
      const task = requireTask(state, command.taskId);
      const attempt = requireAttempt(state, task.id, command.attemptId);
      if (state.run.activeTaskId !== task.id || task.currentAttemptId !== attempt.id) {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} is not the active obligation for task ${task.id}.`,
        );
      }
      if (attempt.status !== "active" && attempt.status !== "transport-uncertain") {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} cannot enter transport uncertainty from ${attempt.status}.`,
        );
      }
      const existing = attempt.transportUncertainty;
      if (existing && existing.requestId !== command.requestId) {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} transport request ${existing.requestId} cannot change to ${command.requestId}.`,
        );
      }
      if (existing && existing.code === command.code && existing.detail === command.detail && existing.retryable === command.retryable) {
        return state;
      }
      return appendEvent(
        {
          ...state,
          tasks: replaceTask(state.tasks, task.id, (current) => ({
            ...current,
            status: "awaiting-transport-resolution",
          })),
          attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
            ...current,
            status: "transport-uncertain",
            transportUncertainty: {
              requestId: command.requestId,
              code: command.code,
              detail: command.detail,
              retryable: command.retryable,
              deliveryAttempts: existing?.deliveryAttempts ?? 1,
              firstObservedAt: existing?.firstObservedAt ?? command.timestamp,
              lastObservedAt: command.timestamp,
            },
          })),
        },
        {
          type: "attempt.transport-uncertain",
          taskId: task.id,
          attemptId: attempt.id,
          summary: `Transport outcome is uncertain for task ${task.sequence} attempt ${attempt.attemptNumber}.`,
          payload: {
            requestId: command.requestId,
            code: command.code,
            detail: command.detail,
            retryable: command.retryable,
          },
          timestamp: command.timestamp,
        },
      );
    }

    case "record-attempt-transport-retry": {
      requireActiveRun(state);
      const task = requireTask(state, command.taskId);
      const attempt = requireAttempt(state, task.id, command.attemptId);
      const uncertainty = attempt.transportUncertainty;
      if (state.run.activeTaskId !== task.id || task.currentAttemptId !== attempt.id) {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} is not the active obligation for task ${task.id}.`,
        );
      }
      if (attempt.status !== "transport-uncertain" || task.status !== "awaiting-transport-resolution" || !uncertainty) {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} is not awaiting transport resolution.`,
        );
      }
      if (uncertainty.requestId !== command.requestId) {
        throw new NorthstarLedgerInvariantError(
          `Transport retry ${command.requestId} does not match ${uncertainty.requestId}.`,
        );
      }
      return appendEvent(
        {
          ...state,
          attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
            ...current,
            transportUncertainty: current.transportUncertainty
              ? {
                  ...current.transportUncertainty,
                  deliveryAttempts: current.transportUncertainty.deliveryAttempts + 1,
                }
              : undefined,
          })),
        },
        {
          type: "attempt.transport-retrying",
          taskId: task.id,
          attemptId: attempt.id,
          summary: `Retrying the exact transport request for task ${task.sequence} attempt ${attempt.attemptNumber}.`,
          payload: {
            requestId: command.requestId,
            deliveryAttempt: uncertainty.deliveryAttempts + 1,
          },
          timestamp: command.timestamp,
        },
      );
    }

    case "record-artboard-draft": {
      requireActiveRun(state);
      const task = requireTask(state, command.taskId);
      const attempt = requireAttempt(state, task.id, command.attemptId);
      if (task.kind !== "artboard-mutation") {
        throw new NorthstarLedgerInvariantError(
          `Only artboard tasks can record mutation drafts; ${task.id} is ${task.kind}.`,
        );
      }
      if (attempt.status === "drafted") {
        if (ledgerValuesEqual(attempt.result ?? null, command.draft)) return state;
        throw new NorthstarLedgerInvariantError(
          `Drafted attempt ${attempt.id} was redelivered with contradictory content.`,
        );
      }
      if ((attempt.status !== "active" && attempt.status !== "transport-uncertain") || task.currentAttemptId !== attempt.id) {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} is not the active attempt for task ${task.id}.`,
        );
      }
      if (task.baseCommitHash !== state.run.headCommitHash) {
        throw new NorthstarLedgerInvariantError(
          `Task ${task.id} was based on ${task.baseCommitHash}, but HEAD is ${state.run.headCommitHash}.`,
        );
      }

      return appendEvent(
        {
          ...state,
          tasks: replaceTask(state.tasks, task.id, (current) => ({
            ...current,
            status: "awaiting-preparation",
          })),
          attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
            ...current,
            status: "drafted",
            result: cloneNorthstarLedgerValue(command.draft),
            draftedAt: command.timestamp,
          })),
        },
        {
          type: "attempt.drafted",
          taskId: task.id,
          attemptId: attempt.id,
          summary: `Attempt ${attempt.attemptNumber} produced an artboard mutation draft.`,
          payload: { draft: command.draft },
          timestamp: command.timestamp,
        },
      );
    }

    case "record-attempt-prepared": {
      requireActiveRun(state);
      const task = requireTask(state, command.taskId);
      const attempt = requireAttempt(state, task.id, command.attemptId);
      if (attempt.status === "prepared") {
        const matches =
          attempt.candidateCommitHash === command.candidateCommitHash &&
          attempt.candidateStateHash === command.candidateStateHash &&
          ledgerValuesEqual(attempt.preparedResult ?? null, command.preparedResult) &&
          ledgerValuesEqual(attempt.result ?? null, command.result) &&
          ledgerValuesEqual(attempt.stateSnapshot ?? null, command.stateSnapshot);
        if (matches) return state;
        throw new NorthstarLedgerInvariantError(
          `Prepared attempt ${attempt.id} was redelivered with contradictory content.`,
        );
      }
      if (task.kind !== "artboard-mutation") {
        throw new NorthstarLedgerInvariantError(
          `Only artboard tasks require preparation; ${task.id} is ${task.kind}.`,
        );
      }
      if ((attempt.status !== "active" && attempt.status !== "transport-uncertain" && attempt.status !== "drafted") || task.currentAttemptId !== attempt.id) {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} is not the active or drafted attempt for task ${task.id}.`,
        );
      }
      if (attempt.status === "drafted" && !ledgerValuesEqual(attempt.result ?? null, command.result)) {
        throw new NorthstarLedgerInvariantError(
          `Prepared result for ${attempt.id} does not match its recorded mutation draft.`,
        );
      }
      if (task.baseCommitHash !== state.run.headCommitHash) {
        throw new NorthstarLedgerInvariantError(
          `Task ${task.id} was based on ${task.baseCommitHash}, but HEAD is ${state.run.headCommitHash}.`,
        );
      }

      const expectedCandidateStateHash = createNorthstarLedgerHash(command.stateSnapshot);
      if (command.candidateStateHash !== expectedCandidateStateHash) {
        throw new NorthstarLedgerInvariantError(
          `Candidate state hash ${command.candidateStateHash} does not match ${expectedCandidateStateHash}.`,
        );
      }
      const expectedCandidateCommitHash = createNorthstarLedgerHash({
        kind: "task",
        runId: state.run.id,
        parentHash: state.run.headCommitHash,
        taskId: task.id,
        attemptId: attempt.id,
        taskKind: task.kind,
        sequence: state.run.nextCommitSequence,
        result: command.result,
        stateHash: expectedCandidateStateHash,
        stateSnapshot: command.stateSnapshot,
      });
      if (command.candidateCommitHash !== expectedCandidateCommitHash) {
        throw new NorthstarLedgerInvariantError(
          `Candidate commit hash ${command.candidateCommitHash} does not match ${expectedCandidateCommitHash}.`,
        );
      }

      return appendEvent(
        {
          ...state,
          tasks: replaceTask(state.tasks, task.id, (current) => ({
            ...current,
            status: "awaiting-projection",
          })),
          attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
            ...current,
            status: "prepared",
            preparedResult: cloneNorthstarLedgerValue(command.preparedResult),
            candidateCommitHash: command.candidateCommitHash,
            candidateStateHash: command.candidateStateHash,
            result: cloneNorthstarLedgerValue(command.result),
            stateSnapshot: cloneNorthstarLedgerValue(command.stateSnapshot),
            preparedAt: command.timestamp,
          })),
        },
        {
          type: "attempt.prepared",
          taskId: task.id,
          attemptId: attempt.id,
          summary: `Attempt ${attempt.attemptNumber} prepared for projection.`,
          payload: {
            candidateCommitHash: command.candidateCommitHash,
            candidateStateHash: command.candidateStateHash,
            preparedResult: command.preparedResult,
          },
          timestamp: command.timestamp,
        },
      );
    }

    case "record-attempt-failure":
    case "record-preparation-failure":
    case "record-projection-failure": {
      requireActiveRun(state);
      const task = requireTask(state, command.taskId);
      const attempt = requireAttempt(state, task.id, command.attemptId);

      const isTransientPreparationRetry =
        command.type === "record-preparation-failure" &&
        command.failure.kind === "transient" &&
        attempt.status === "drafted";
      const isTransientProjectionRetry =
        command.type === "record-projection-failure" &&
        command.failure.kind === "transient" &&
        attempt.status === "prepared";

      if (isTransientPreparationRetry) {
        if (task.currentAttemptId !== attempt.id || task.status !== "awaiting-preparation") {
          throw new NorthstarLedgerInvariantError(
            `Drafted attempt ${attempt.id} is not awaiting preparation for task ${task.id}.`,
          );
        }
        return appendEvent(
          {
            ...state,
            attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
              ...current,
              preparationFailures: [
                ...(current.preparationFailures ?? []),
                cloneNorthstarLedgerFailure(command.failure),
              ],
            })),
          },
          {
            type: "preparation.retrying",
            taskId: task.id,
            attemptId: attempt.id,
            summary: `Preparation retry required for task ${task.sequence}: ${command.failure.code}`,
            payload: {
              failureKind: command.failure.kind,
              detail: command.failure.detail,
              correctionContext: command.failure.correctionContext ?? null,
            },
            timestamp: command.timestamp,
          },
        );
      }

      if (isTransientProjectionRetry) {
        if (task.currentAttemptId !== attempt.id || task.status !== "awaiting-projection") {
          throw new NorthstarLedgerInvariantError(
            `Prepared attempt ${attempt.id} is not awaiting projection for task ${task.id}.`,
          );
        }
        return appendEvent(
          {
            ...state,
            attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
              ...current,
              projectionFailures: [
                ...(current.projectionFailures ?? []),
                cloneNorthstarLedgerFailure(command.failure),
              ],
            })),
          },
          {
            type: "projection.retrying",
            taskId: task.id,
            attemptId: attempt.id,
            commitHash: attempt.candidateCommitHash,
            summary: `Projection retry required for task ${task.sequence}: ${command.failure.code}`,
            payload: {
              failureKind: command.failure.kind,
              detail: command.failure.detail,
              correctionContext: command.failure.correctionContext ?? null,
            },
            timestamp: command.timestamp,
          },
        );
      }

      if (attempt.status === "failed") {
        if (attempt.failure && failuresEqual(attempt.failure, command.failure)) return state;
        throw new NorthstarLedgerInvariantError(
          `Failed attempt ${attempt.id} was redelivered with a contradictory failure.`,
        );
      }
      if (task.currentAttemptId !== attempt.id) {
        throw new NorthstarLedgerInvariantError(
          `Attempt ${attempt.id} is not current for task ${task.id}.`,
        );
      }

      const taskStatus = command.failure.kind === "transient"
        ? "retryable-failure"
        : "blocked";
      const eventType = command.type === "record-projection-failure"
        ? "projection.failed"
        : command.type === "record-preparation-failure"
          ? "preparation.failed"
          : "attempt.failed";

      return appendEvent(
        {
          ...state,
          tasks: replaceTask(state.tasks, task.id, (current) => ({
            ...current,
            status: taskStatus,
            currentAttemptId: null,
          })),
          attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
            ...current,
            status: "failed",
            failure: cloneNorthstarLedgerFailure(command.failure),
            completedAt: command.timestamp,
          })),
        },
        {
          type: eventType,
          taskId: task.id,
          attemptId: attempt.id,
          summary: `${command.failure.phase} failed for task ${task.sequence}: ${command.failure.code}`,
          payload: {
            failureKind: command.failure.kind,
            detail: command.failure.detail,
            correctionContext: command.failure.correctionContext ?? null,
          },
          timestamp: command.timestamp,
        },
      );
    }

    case "commit-task": {
      requireActiveRun(state);
      const existingCommit = state.commits.find(
        (candidate) => candidate.hash === command.commit.hash,
      );
      if (existingCommit) {
        const matches =
          existingCommit.runId === command.commit.runId &&
          existingCommit.sequence === command.commit.sequence &&
          existingCommit.kind === command.commit.kind &&
          existingCommit.parentHash === command.commit.parentHash &&
          existingCommit.taskId === command.taskId &&
          existingCommit.attemptId === command.attemptId &&
          existingCommit.taskKind === command.commit.taskKind &&
          existingCommit.stateHash === command.commit.stateHash &&
          ledgerValuesEqual(existingCommit.result, command.result) &&
          ledgerValuesEqual(existingCommit.stateSnapshot, command.stateSnapshot) &&
          projectionReceiptsEqual(existingCommit.projectionReceipt, command.projectionReceipt);
        if (matches) return state;
        throw new NorthstarLedgerInvariantError(
          `Commit ${command.commit.hash} was redelivered with contradictory content.`,
        );
      }

      const task = requireTask(state, command.taskId);
      const attempt = requireAttempt(state, task.id, command.attemptId);
      if (task.status === "completed" && task.resultCommitHash === command.commit.hash) {
        return state;
      }
      if (state.run.activeTaskId !== task.id || task.currentAttemptId !== attempt.id) {
        throw new NorthstarLedgerInvariantError(
          `Task ${task.id} and attempt ${attempt.id} are not the active obligation.`,
        );
      }
      if (command.commit.parentHash !== state.run.headCommitHash) {
        throw new NorthstarLedgerInvariantError(
          `Commit parent ${command.commit.parentHash} does not match HEAD ${state.run.headCommitHash}.`,
        );
      }
      if (command.commit.sequence !== state.run.nextCommitSequence) {
        throw new NorthstarLedgerInvariantError(
          `Commit sequence ${command.commit.sequence} does not match expected ${state.run.nextCommitSequence}.`,
        );
      }
      if (
        command.commit.taskId !== task.id ||
        command.commit.attemptId !== attempt.id ||
        command.commit.taskKind !== task.kind
      ) {
        throw new NorthstarLedgerInvariantError(
          `Commit ${command.commit.hash} does not belong to task ${task.id} attempt ${attempt.id}.`,
        );
      }

      const expectedStateHash = createNorthstarLedgerHash(command.stateSnapshot);
      if (command.commit.stateHash !== expectedStateHash) {
        throw new NorthstarLedgerInvariantError(
          `Commit state hash ${command.commit.stateHash} does not match state ${expectedStateHash}.`,
        );
      }
      if (
        !ledgerValuesEqual(command.commit.result, command.result) ||
        !ledgerValuesEqual(command.commit.stateSnapshot, command.stateSnapshot)
      ) {
        throw new NorthstarLedgerInvariantError(
          `Commit ${command.commit.hash} payload does not match the task result.`,
        );
      }
      const expectedCommitHash = createNorthstarLedgerHash({
        kind: "task",
        runId: state.run.id,
        parentHash: state.run.headCommitHash,
        taskId: task.id,
        attemptId: attempt.id,
        taskKind: task.kind,
        sequence: state.run.nextCommitSequence,
        result: command.result,
        stateHash: expectedStateHash,
        stateSnapshot: command.stateSnapshot,
      });
      if (command.commit.hash !== expectedCommitHash) {
        throw new NorthstarLedgerInvariantError(
          `Commit hash ${command.commit.hash} does not match ${expectedCommitHash}.`,
        );
      }

      if (task.kind === "artboard-mutation") {
        if (attempt.status !== "prepared") {
          throw new NorthstarLedgerInvariantError(
            `Artboard attempt ${attempt.id} must be prepared before commit.`,
          );
        }
        if (attempt.candidateCommitHash !== command.commit.hash) {
          throw new NorthstarLedgerInvariantError(
            `Prepared candidate ${attempt.candidateCommitHash ?? "missing"} does not match commit ${command.commit.hash}.`,
          );
        }
        if (attempt.candidateStateHash !== command.commit.stateHash) {
          throw new NorthstarLedgerInvariantError(
            `Prepared state ${attempt.candidateStateHash ?? "missing"} does not match commit state ${command.commit.stateHash}.`,
          );
        }
        if (!command.projectionReceipt?.verified) {
          throw new NorthstarLedgerInvariantError(
            `Artboard task ${task.id} requires a verified projection receipt.`,
          );
        }
        if (command.projectionReceipt.commitHash !== command.commit.hash) {
          throw new NorthstarLedgerInvariantError(
            `Projection receipt does not match commit ${command.commit.hash}.`,
          );
        }
        if (command.projectionReceipt.projectedStateHash !== command.commit.stateHash) {
          throw new NorthstarLedgerInvariantError(
            `Projected state ${command.projectionReceipt.projectedStateHash} does not match candidate state ${command.commit.stateHash}.`,
          );
        }
      }

      const committedCommit: NorthstarLedgerCommit = {
        ...command.commit,
        result: cloneNorthstarLedgerValue(command.commit.result),
        stateSnapshot: cloneNorthstarLedgerValue(command.commit.stateSnapshot),
        projectionReceipt: command.commit.projectionReceipt
          ? cloneNorthstarProjectionReceipt(command.commit.projectionReceipt)
          : undefined,
      };

      const committedState: NorthstarLedgerState = {
        ...state,
        run: {
          ...state.run,
          headCommitHash: command.commit.hash,
          activeTaskId: null,
          nextCommitSequence: state.run.nextCommitSequence + 1,
        },
        tasks: replaceTask(state.tasks, task.id, (current) => ({
          ...current,
          status: "completed",
          currentAttemptId: null,
          resultCommitHash: command.commit.hash,
          completedAt: command.timestamp,
        })),
        attempts: replaceAttempt(state.attempts, attempt.id, (current) => ({
          ...current,
          status: "completed",
          result: cloneNorthstarLedgerValue(command.result),
          stateSnapshot: cloneNorthstarLedgerValue(command.stateSnapshot),
          projectionReceipt: command.projectionReceipt
            ? cloneNorthstarProjectionReceipt(command.projectionReceipt)
            : undefined,
          completedAt: command.timestamp,
        })),
        commits: [...state.commits, committedCommit],
      };

      const withCommitEvent = appendEvent(committedState, {
        type: "commit.created",
        taskId: task.id,
        attemptId: attempt.id,
        commitHash: command.commit.hash,
        summary: `Commit ${command.commit.sequence} created for task ${task.sequence}.`,
        payload: {
          parentHash: command.commit.parentHash,
          taskKind: task.kind,
          projected: command.projectionReceipt?.verified ?? false,
        },
        timestamp: command.timestamp,
      });

      return appendEvent(withCommitEvent, {
        type: "task.completed",
        taskId: task.id,
        attemptId: attempt.id,
        commitHash: command.commit.hash,
        summary: `Task ${task.sequence} completed: ${task.intent}`,
        payload: { expectedOutcome: task.expectedOutcome },
        timestamp: command.timestamp,
      });
    }

    case "cancel-task":
    case "supersede-task": {
      requireActiveRun(state);
      const task = requireTask(state, command.taskId);
      if (state.run.activeTaskId !== task.id) {
        throw new NorthstarLedgerInvariantError(`Task ${task.id} is not active.`);
      }
      const currentAttempt = task.currentAttemptId
        ? requireAttempt(state, task.id, task.currentAttemptId)
        : null;
      const attemptIsUnresolved = currentAttempt !== null &&
        ["active", "transport-uncertain", "drafted", "prepared"].includes(currentAttempt.status);
      const nextAttempts = attemptIsUnresolved && currentAttempt
        ? replaceAttempt(state.attempts, currentAttempt.id, (attempt) => ({
            ...attempt,
            status: "cancelled",
            completedAt: command.timestamp,
          }))
        : state.attempts;

      const cancelled = command.type === "cancel-task";
      return appendEvent(
        {
          ...state,
          run: { ...state.run, activeTaskId: null },
          tasks: replaceTask(state.tasks, task.id, (current) => ({
            ...current,
            status: cancelled ? "cancelled" : "superseded",
            currentAttemptId: null,
            ...(cancelled
              ? { cancelledAt: command.timestamp }
              : { supersededAt: command.timestamp }),
          })),
          attempts: nextAttempts,
        },
        {
          type: cancelled ? "task.cancelled" : "task.superseded",
          taskId: task.id,
          summary: `${cancelled ? "Cancelled" : "Superseded"} task ${task.sequence}: ${command.reason}`,
          payload: { reason: command.reason },
          timestamp: command.timestamp,
        },
      );
    }

    case "complete-run": {
      requireActiveRun(state);
      if (state.run.activeTaskId) {
        throw new NorthstarLedgerInvariantError(
          `Cannot complete run while ${state.run.activeTaskId} is unresolved.`,
        );
      }
      return appendEvent(
        {
          ...state,
          run: {
            ...state.run,
            status: "completed",
            completedAt: command.timestamp,
          },
        },
        {
          type: "run.completed",
          summary: "Northstar ledger run completed.",
          payload: command.summary,
          timestamp: command.timestamp,
        },
      );
    }

    case "fail-run": {
      requireActiveRun(state);
      if (state.run.activeTaskId) {
        throw new NorthstarLedgerInvariantError(
          `Cannot fail the run while ${state.run.activeTaskId} remains unresolved.`,
        );
      }
      return appendEvent(
        {
          ...state,
          run: {
            ...state.run,
            status: "failed",
            failure: cloneNorthstarLedgerFailure(command.failure),
            completedAt: command.timestamp,
          },
        },
        {
          type: "run.failed",
          summary: `Northstar ledger run failed: ${command.failure.code}`,
          payload: {
            failureKind: command.failure.kind,
            detail: command.failure.detail,
          },
          timestamp: command.timestamp,
        },
      );
    }

    case "cancel-run": {
      requireActiveRun(state);
      if (state.run.activeTaskId) {
        throw new NorthstarLedgerInvariantError(
          `Cannot cancel run while ${state.run.activeTaskId} remains unresolved.`,
        );
      }
      if (!command.reason.trim()) {
        throw new NorthstarLedgerInvariantError("Run cancellation reason cannot be empty.");
      }
      return appendEvent(
        {
          ...state,
          run: {
            ...state.run,
            status: "cancelled",
            completedAt: command.timestamp,
          },
        },
        {
          type: "run.cancelled",
          summary: `Northstar ledger run cancelled: ${command.reason}`,
          payload: { reason: command.reason },
          timestamp: command.timestamp,
        },
      );
    }
  }
}
