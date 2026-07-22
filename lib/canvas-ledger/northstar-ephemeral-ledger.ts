import {
  createInitialNorthstarLedgerState,
  reduceNorthstarLedger,
  type NorthstarLedgerCommand,
} from "@/lib/canvas-ledger/northstar-ledger-reducer";
import {
  cloneNorthstarLedgerFailure,
  cloneNorthstarLedgerValue,
  cloneNorthstarProjectionReceipt,
  createNorthstarLedgerHash,
  stableStringifyNorthstarLedgerValue,
} from "@/lib/canvas-ledger/northstar-ledger-value";
import type {
  NorthstarActivityDraft,
  NorthstarCommitTaskInput,
  NorthstarEphemeralLedger,
  NorthstarLedgerCommit,
  NorthstarLedgerExport,
  NorthstarLedgerFailure,
  NorthstarLedgerSnapshot,
  NorthstarLedgerState,
  NorthstarLedgerTask,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
  NorthstarPrepareArtboardCommitInput,
} from "@/lib/canvas-ledger/types";

export interface CreateNorthstarEphemeralLedgerInput {
  objective: string;
  initialStateSnapshot: NorthstarLedgerValue;
  runId?: string;
  clock?: () => number;
  idFactory?: () => string;
  onSubscriberError?: (error: unknown) => void;
}

function defaultClock(): number {
  return Date.now();
}

function defaultIdFactory(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function cloneTask(task: NorthstarLedgerTask): NorthstarLedgerTask {
  return {
    ...task,
    initialExecutionInput: cloneNorthstarLedgerValue(task.initialExecutionInput),
  };
}

function cloneAttempt(attempt: NorthstarLedgerTaskAttempt): NorthstarLedgerTaskAttempt {
  return {
    ...attempt,
    executionInput: cloneNorthstarLedgerValue(attempt.executionInput),
    preparedResult: attempt.preparedResult === undefined
      ? undefined
      : cloneNorthstarLedgerValue(attempt.preparedResult),
    evidence: attempt.evidence === undefined
      ? undefined
      : cloneNorthstarLedgerValue(attempt.evidence),
    result: attempt.result === undefined
      ? undefined
      : cloneNorthstarLedgerValue(attempt.result),
    stateSnapshot: attempt.stateSnapshot === undefined
      ? undefined
      : cloneNorthstarLedgerValue(attempt.stateSnapshot),
    projectionReceipt: attempt.projectionReceipt
      ? cloneNorthstarProjectionReceipt(attempt.projectionReceipt)
      : undefined,
    transportUncertainty: attempt.transportUncertainty
      ? { ...attempt.transportUncertainty }
      : undefined,
    preparationFailures: attempt.preparationFailures
      ? attempt.preparationFailures.map(cloneNorthstarLedgerFailure)
      : undefined,
    projectionFailures: attempt.projectionFailures
      ? attempt.projectionFailures.map(cloneNorthstarLedgerFailure)
      : undefined,
    failure: attempt.failure
      ? cloneNorthstarLedgerFailure(attempt.failure)
      : undefined,
  };
}

function cloneCommit(commit: NorthstarLedgerCommit): NorthstarLedgerCommit {
  return {
    ...commit,
    result: cloneNorthstarLedgerValue(commit.result),
    stateSnapshot: cloneNorthstarLedgerValue(commit.stateSnapshot),
    projectionReceipt: commit.projectionReceipt
      ? cloneNorthstarProjectionReceipt(commit.projectionReceipt)
      : undefined,
  };
}

function valuesEqual(left: NorthstarLedgerValue, right: NorthstarLedgerValue): boolean {
  return stableStringifyNorthstarLedgerValue(left) === stableStringifyNorthstarLedgerValue(right);
}

function projectionReceiptsEquivalent(
  left: NorthstarLedgerCommit["projectionReceipt"],
  right: NorthstarLedgerCommit["projectionReceipt"],
): boolean {
  if (!left || !right) return left === right;
  return (
    left.commitHash === right.commitHash &&
    left.projectedStateHash === right.projectedStateHash &&
    left.surfaceSessionId === right.surfaceSessionId &&
    left.verified === right.verified &&
    valuesEqual(left.metadata ?? null, right.metadata ?? null)
  );
}

function cloneSnapshot(state: NorthstarLedgerState): NorthstarLedgerSnapshot {
  const headCommit = state.commits.find(
    (commit) => commit.hash === state.run.headCommitHash,
  );
  if (!headCommit) {
    throw new Error(`Ledger HEAD ${state.run.headCommitHash} has no matching commit.`);
  }

  const activeTask = state.run.activeTaskId
    ? state.tasks.find((task) => task.id === state.run.activeTaskId) ?? null
    : null;

  return {
    run: {
      ...state.run,
      failure: state.run.failure
        ? cloneNorthstarLedgerFailure(state.run.failure)
        : undefined,
    },
    tasks: state.tasks.map(cloneTask),
    attempts: state.attempts.map(cloneAttempt),
    commits: state.commits.map(cloneCommit),
    events: state.events.map((event) => ({
      ...event,
      payload: event.payload === undefined
        ? undefined
        : cloneNorthstarLedgerValue(event.payload),
    })),
    activeTask: activeTask ? cloneTask(activeTask) : null,
    headCommit: cloneCommit(headCommit),
  };
}

export function createNorthstarEphemeralLedger(
  input: CreateNorthstarEphemeralLedgerInput,
): NorthstarEphemeralLedger {
  const clock = input.clock ?? defaultClock;
  const idFactory = input.idFactory ?? defaultIdFactory;
  const usedIds = new Set<string>();
  const readClock = (): number => {
    const value = clock();
    if (!Number.isFinite(value)) throw new Error("Ledger clock must return a finite timestamp.");
    return value;
  };
  const createSystemId = (prefix: string): string => {
    const rawId = idFactory();
    if (typeof rawId !== "string" || rawId.trim().length === 0) {
      throw new Error(`Ledger ${prefix} ID factory returned an invalid value.`);
    }
    const id = `${prefix}_${rawId}`;
    if (usedIds.has(id)) throw new Error(`Ledger ID factory produced duplicate ID ${id}.`);
    usedIds.add(id);
    return id;
  };
  const runId = input.runId ?? createSystemId("run");
  if (input.runId) {
    if (input.runId.trim().length === 0) throw new Error("Ledger run ID cannot be empty.");
    usedIds.add(input.runId);
  }
  const createdAt = readClock();
  const rootCommitHash = createNorthstarLedgerHash({
    kind: "root",
    runId,
    objective: input.objective,
    stateSnapshot: input.initialStateSnapshot,
  });

  let state = createInitialNorthstarLedgerState({
    runId,
    objective: input.objective,
    rootCommitHash,
    rootStateSnapshot: input.initialStateSnapshot,
    createdAt,
  });
  let disposed = false;
  const listeners = new Set<() => void>();

  const assertUsable = () => {
    if (disposed) throw new Error("This Northstar ephemeral ledger has been disposed.");
  };

  const dispatch = (command: NorthstarLedgerCommand) => {
    assertUsable();
    const next = reduceNorthstarLedger(state, command);
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        input.onSubscriberError?.(error);
      }
    });
  };

  const ledger: NorthstarEphemeralLedger = {
    getSnapshot() {
      assertUsable();
      return cloneSnapshot(state);
    },

    subscribe(listener) {
      assertUsable();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    recordDecision(summary, payload) {
      dispatch({
        type: "record-decision",
        summary,
        payload,
        timestamp: readClock(),
      });
    },

    recordControlFailure(failure, taskId) {
      dispatch({
        type: "record-control-failure",
        failure,
        taskId,
        timestamp: readClock(),
      });
    },

    createTask(activity: NorthstarActivityDraft): NorthstarLedgerTask {
      const taskId = createSystemId("task");
      dispatch({
        type: "create-task",
        taskId,
        activity,
        timestamp: readClock(),
      });
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new Error(`Task ${taskId} was not created.`);
      return cloneTask(task);
    },

    startAttempt(taskId, executionInput): NorthstarLedgerTaskAttempt {
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new Error(`Unknown task ${taskId}.`);
      const attemptId = createSystemId("attempt");
      dispatch({
        type: "start-attempt",
        taskId,
        attemptId,
        executionInput: executionInput ?? task.initialExecutionInput,
        timestamp: readClock(),
      });
      const attempt = state.attempts.find((candidate) => candidate.id === attemptId);
      if (!attempt) throw new Error(`Attempt ${attemptId} was not created.`);
      return cloneAttempt(attempt);
    },

    recordArtboardDraft(taskId, attemptId, draft) {
      dispatch({
        type: "record-artboard-draft",
        taskId,
        attemptId,
        draft,
        timestamp: readClock(),
      });
    },

    recordAttemptEvidence(taskId, attemptId, evidence) {
      dispatch({
        type: "record-attempt-evidence",
        taskId,
        attemptId,
        evidence,
        timestamp: readClock(),
      });
    },

    recordAttemptTransportUncertain(taskId, attemptId, uncertainty) {
      dispatch({
        type: "record-attempt-transport-uncertain",
        taskId,
        attemptId,
        requestId: uncertainty.requestId,
        code: uncertainty.code,
        detail: uncertainty.detail,
        retryable: uncertainty.retryable,
        timestamp: readClock(),
      });
    },

    recordAttemptTransportRetry(taskId, attemptId, requestId) {
      dispatch({
        type: "record-attempt-transport-retry",
        taskId,
        attemptId,
        requestId,
        timestamp: readClock(),
      });
    },

    prepareArtboardCommit(prepareInput: NorthstarPrepareArtboardCommitInput): NorthstarLedgerCommit {
      const task = state.tasks.find((candidate) => candidate.id === prepareInput.taskId);
      const attempt = state.attempts.find(
        (candidate) => candidate.id === prepareInput.attemptId,
      );
      if (!task || !attempt) {
        throw new Error(
          `Cannot prepare unknown task ${prepareInput.taskId} or attempt ${prepareInput.attemptId}.`,
        );
      }
      if (task.kind !== "artboard-mutation") {
        throw new Error(`Task ${task.id} is ${task.kind}, not an artboard mutation.`);
      }

      const candidateStateHash = createNorthstarLedgerHash(prepareInput.stateSnapshot);
      const candidateHash = createNorthstarLedgerHash({
        kind: "task",
        runId: state.run.id,
        parentHash: state.run.headCommitHash,
        taskId: task.id,
        attemptId: attempt.id,
        taskKind: task.kind,
        sequence: state.run.nextCommitSequence,
        result: prepareInput.result,
        stateHash: candidateStateHash,
        stateSnapshot: prepareInput.stateSnapshot,
      });
      const preparedAt = attempt.status === "prepared" && attempt.preparedAt !== undefined
        ? attempt.preparedAt
        : readClock();
      const candidate: NorthstarLedgerCommit = {
        hash: candidateHash,
        stateHash: candidateStateHash,
        runId: state.run.id,
        sequence: state.run.nextCommitSequence,
        kind: "task",
        parentHash: state.run.headCommitHash,
        taskId: task.id,
        attemptId: attempt.id,
        taskKind: task.kind,
        result: cloneNorthstarLedgerValue(prepareInput.result),
        stateSnapshot: cloneNorthstarLedgerValue(prepareInput.stateSnapshot),
        createdAt: preparedAt,
      };

      dispatch({
        type: "record-attempt-prepared",
        taskId: task.id,
        attemptId: attempt.id,
        preparedResult: prepareInput.preparedResult,
        candidateCommitHash: candidate.hash,
        candidateStateHash: candidate.stateHash,
        result: prepareInput.result,
        stateSnapshot: prepareInput.stateSnapshot,
        timestamp: preparedAt,
      });
      return cloneCommit(candidate);
    },

    recordAttemptFailure(taskId, attemptId, failure) {
      dispatch({
        type: "record-attempt-failure",
        taskId,
        attemptId,
        failure,
        timestamp: readClock(),
      });
    },

    recordPreparationFailure(taskId, attemptId, failure) {
      dispatch({
        type: "record-preparation-failure",
        taskId,
        attemptId,
        failure,
        timestamp: readClock(),
      });
    },

    recordProjectionFailure(taskId, attemptId, failure) {
      dispatch({
        type: "record-projection-failure",
        taskId,
        attemptId,
        failure,
        timestamp: readClock(),
      });
    },

    commitTask(commitInput: NorthstarCommitTaskInput): NorthstarLedgerCommit {
      const incomingProjectionReceipt = commitInput.projectionReceipt
        ? cloneNorthstarProjectionReceipt(commitInput.projectionReceipt)
        : undefined;
      const task = state.tasks.find((candidate) => candidate.id === commitInput.taskId);
      const attempt = state.attempts.find(
        (candidate) => candidate.id === commitInput.attemptId,
      );
      if (!task || !attempt) {
        throw new Error(
          `Cannot commit unknown task ${commitInput.taskId} or attempt ${commitInput.attemptId}.`,
        );
      }

      const existingCommit = task.resultCommitHash
        ? state.commits.find((commit) => commit.hash === task.resultCommitHash)
        : undefined;
      if (existingCommit) {
        const matches =
          existingCommit.taskId === commitInput.taskId &&
          existingCommit.attemptId === commitInput.attemptId &&
          valuesEqual(existingCommit.result, commitInput.result) &&
          valuesEqual(existingCommit.stateSnapshot, commitInput.stateSnapshot) &&
          projectionReceiptsEquivalent(existingCommit.projectionReceipt, incomingProjectionReceipt);
        if (matches) return cloneCommit(existingCommit);
        throw new Error(
          `Task ${task.id} was already committed as ${existingCommit.hash} with contradictory content.`,
        );
      }

      const stateHash = createNorthstarLedgerHash(commitInput.stateSnapshot);
      const commitHash = createNorthstarLedgerHash({
        kind: "task",
        runId: state.run.id,
        parentHash: state.run.headCommitHash,
        taskId: task.id,
        attemptId: attempt.id,
        taskKind: task.kind,
        sequence: state.run.nextCommitSequence,
        result: commitInput.result,
        stateHash,
        stateSnapshot: commitInput.stateSnapshot,
      });

      if (task.kind === "artboard-mutation") {
        if (attempt.status !== "prepared" || !attempt.candidateCommitHash) {
          throw new Error(`Artboard attempt ${attempt.id} must be prepared before commit.`);
        }
        if (attempt.candidateCommitHash !== commitHash) {
          throw new Error(
            `Artboard candidate ${attempt.candidateCommitHash ?? "missing"} does not match ${commitHash}.`,
          );
        }
        if (attempt.candidateStateHash !== stateHash) {
          throw new Error(
            `Artboard candidate state ${attempt.candidateStateHash ?? "missing"} does not match ${stateHash}.`,
          );
        }
        if (!incomingProjectionReceipt?.verified) {
          throw new Error(`Projection receipt for ${commitHash} is not verified.`);
        }
        if (incomingProjectionReceipt.commitHash !== commitHash) {
          throw new Error(`Projection receipt does not identify candidate ${commitHash}.`);
        }
        if (incomingProjectionReceipt.projectedStateHash !== stateHash) {
          throw new Error(
            `Projected state ${incomingProjectionReceipt.projectedStateHash} does not match candidate state ${stateHash}.`,
          );
        }
      }

      const projectionReceipt = incomingProjectionReceipt;
      const commit: NorthstarLedgerCommit = {
        hash: commitHash,
        stateHash,
        runId: state.run.id,
        sequence: state.run.nextCommitSequence,
        kind: "task",
        parentHash: state.run.headCommitHash,
        taskId: task.id,
        attemptId: attempt.id,
        taskKind: task.kind,
        result: commitInput.result,
        stateSnapshot: commitInput.stateSnapshot,
        projectionReceipt,
        createdAt: readClock(),
      };

      dispatch({
        type: "commit-task",
        taskId: task.id,
        attemptId: attempt.id,
        commit,
        result: commitInput.result,
        stateSnapshot: commitInput.stateSnapshot,
        projectionReceipt,
        timestamp: commit.createdAt,
      });

      return cloneCommit(commit);
    },

    cancelTask(taskId, reason) {
      dispatch({ type: "cancel-task", taskId, reason, timestamp: readClock() });
    },

    supersedeTask(taskId, reason) {
      dispatch({ type: "supersede-task", taskId, reason, timestamp: readClock() });
    },

    completeRun(summary) {
      dispatch({ type: "complete-run", summary, timestamp: readClock() });
    },

    failRun(failure: NorthstarLedgerFailure) {
      dispatch({ type: "fail-run", failure, timestamp: readClock() });
    },

    cancelRun(reason: string) {
      dispatch({ type: "cancel-run", reason, timestamp: readClock() });
    },

    exportJSON(): NorthstarLedgerExport {
      return {
        schema: "northstar.ephemeral-ledger-export.v1",
        exportedAt: readClock(),
        snapshot: cloneSnapshot(state),
      };
    },

    dispose() {
      disposed = true;
      listeners.clear();
    },
  };

  return ledger;
}
