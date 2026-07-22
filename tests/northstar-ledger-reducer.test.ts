import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialNorthstarLedgerState,
  NorthstarLedgerInvariantError,
  reduceNorthstarLedger,
} from "@/lib/canvas-ledger/northstar-ledger-reducer";
import { createNorthstarLedgerHash } from "@/lib/canvas-ledger/northstar-ledger-value";
import type { NorthstarLedgerCommit, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

function createState() {
  return createInitialNorthstarLedgerState({
    runId: "run-1",
    objective: "Explain onboarding differences",
    rootCommitHash: "H0",
    rootStateSnapshot: { artboard: "empty" },
    createdAt: 1,
  });
}

const activity = {
  kind: "analysis" as const,
  intent: "Compare the evidence",
  expectedOutcome: "A committed comparison",
  executionInput: { evidenceIds: ["e1", "e2"] },
};

function createTaskCommit(input: {
  taskKind?: "analysis" | "artboard-mutation";
  stateSnapshot?: { analysis?: string[]; artboard?: string };
} = {}): NorthstarLedgerCommit {
  const taskKind = input.taskKind ?? "analysis";
  const stateSnapshot = input.stateSnapshot ?? { analysis: ["Trust versus speed"] };
  const result: NorthstarLedgerValue = taskKind === "artboard-mutation"
    ? { changed: true }
    : { conclusion: "Trust versus speed" };
  const stateHash = createNorthstarLedgerHash(stateSnapshot);
  const hash = createNorthstarLedgerHash({
    kind: "task",
    runId: "run-1",
    parentHash: "H0",
    taskId: "T1",
    attemptId: "A1",
    taskKind,
    sequence: 1,
    result,
    stateHash,
    stateSnapshot,
  });
  return {
    hash,
    stateHash,
    runId: "run-1",
    sequence: 1,
    kind: "task",
    parentHash: "H0",
    taskId: "T1",
    attemptId: "A1",
    taskKind,
    result,
    stateSnapshot,
    createdAt: 4,
  };
}

test("the reducer permits exactly one unresolved task", () => {
  const state = reduceNorthstarLedger(createState(), {
    type: "create-task",
    taskId: "T1",
    activity,
    timestamp: 2,
  });

  assert.equal(state.run.activeTaskId, "T1");
  assert.throws(
    () => reduceNorthstarLedger(state, {
      type: "create-task",
      taskId: "T2",
      activity,
      timestamp: 3,
    }),
    NorthstarLedgerInvariantError,
  );
});

test("failed attempts leave HEAD unchanged and allow another attempt under the same task", () => {
  let state = reduceNorthstarLedger(createState(), {
    type: "create-task",
    taskId: "T1",
    activity,
    timestamp: 2,
  });
  state = reduceNorthstarLedger(state, {
    type: "start-attempt",
    taskId: "T1",
    attemptId: "A1",
    executionInput: activity.executionInput,
    timestamp: 3,
  });
  state = reduceNorthstarLedger(state, {
    type: "record-attempt-failure",
    taskId: "T1",
    attemptId: "A1",
    failure: {
      kind: "transient",
      code: "TIMEOUT",
      detail: "The request timed out.",
      phase: "execution",
    },
    timestamp: 4,
  });

  assert.equal(state.run.headCommitHash, "H0");
  assert.equal(state.run.activeTaskId, "T1");
  assert.equal(state.tasks[0]?.status, "retryable-failure");

  state = reduceNorthstarLedger(state, {
    type: "start-attempt",
    taskId: "T1",
    attemptId: "A2",
    executionInput: activity.executionInput,
    timestamp: 5,
  });
  assert.equal(state.attempts[1]?.taskId, "T1");
  assert.equal(state.attempts[1]?.attemptNumber, 2);
});

test("a task commit atomically advances HEAD, completes the attempt and releases progression", () => {
  let state = reduceNorthstarLedger(createState(), {
    type: "create-task",
    taskId: "T1",
    activity,
    timestamp: 2,
  });
  state = reduceNorthstarLedger(state, {
    type: "start-attempt",
    taskId: "T1",
    attemptId: "A1",
    executionInput: activity.executionInput,
    timestamp: 3,
  });

  const commit = createTaskCommit();
  state = reduceNorthstarLedger(state, {
    type: "commit-task",
    taskId: "T1",
    attemptId: "A1",
    commit,
    result: commit.result,
    stateSnapshot: commit.stateSnapshot,
    timestamp: 4,
  });

  assert.equal(state.run.headCommitHash, commit.hash);
  assert.equal(state.run.activeTaskId, null);
  assert.equal(state.tasks[0]?.status, "completed");
  assert.equal(state.attempts[0]?.status, "completed");
  assert.equal(state.commits.length, 2);
  assert.deepEqual(
    state.events.slice(-2).map((event) => event.type),
    ["commit.created", "task.completed"],
  );
});

test("artboard tasks cannot commit without preparation and exact projected state", () => {
  const artboardActivity = { ...activity, kind: "artboard-mutation" as const };
  let state = reduceNorthstarLedger(createState(), {
    type: "create-task",
    taskId: "T1",
    activity: artboardActivity,
    timestamp: 2,
  });
  state = reduceNorthstarLedger(state, {
    type: "start-attempt",
    taskId: "T1",
    attemptId: "A1",
    executionInput: artboardActivity.executionInput,
    timestamp: 3,
  });

  const commit = createTaskCommit({
    taskKind: "artboard-mutation",
    stateSnapshot: { artboard: "changed" },
  });

  assert.throws(
    () => reduceNorthstarLedger(state, {
      type: "commit-task",
      taskId: "T1",
      attemptId: "A1",
      commit,
      result: commit.result,
      stateSnapshot: commit.stateSnapshot,
      timestamp: 4,
    }),
    /must be prepared/,
  );

  state = reduceNorthstarLedger(state, {
    type: "record-attempt-prepared",
    taskId: "T1",
    attemptId: "A1",
    preparedResult: { candidateHash: "candidate" },
    candidateCommitHash: commit.hash,
    candidateStateHash: commit.stateHash,
    result: commit.result,
    stateSnapshot: commit.stateSnapshot,
    timestamp: 4,
  });

  assert.throws(
    () => reduceNorthstarLedger(state, {
      type: "commit-task",
      taskId: "T1",
      attemptId: "A1",
      commit,
      result: commit.result,
      stateSnapshot: commit.stateSnapshot,
      projectionReceipt: {
        commitHash: commit.hash,
        projectedStateHash: "wrong-state",
        surfaceSessionId: "surface",
        verified: true,
        projectedAt: 5,
      },
      timestamp: 5,
    }),
    /Projected state/,
  );
  assert.equal(state.run.headCommitHash, "H0");
});

test("transient projection failure preserves the same prepared attempt and candidate", () => {
  const artboardActivity = { ...activity, kind: "artboard-mutation" as const };
  let state = reduceNorthstarLedger(createState(), {
    type: "create-task",
    taskId: "T1",
    activity: artboardActivity,
    timestamp: 2,
  });
  state = reduceNorthstarLedger(state, {
    type: "start-attempt",
    taskId: "T1",
    attemptId: "A1",
    executionInput: artboardActivity.executionInput,
    timestamp: 3,
  });
  const stateSnapshot = { artboard: "changed" };
  const stateHash = createNorthstarLedgerHash(stateSnapshot);
  const candidateCommitHash = createNorthstarLedgerHash({
    kind: "task",
    runId: "run-1",
    parentHash: "H0",
    taskId: "T1",
    attemptId: "A1",
    taskKind: "artboard-mutation",
    sequence: 1,
    result: { changed: true },
    stateHash,
    stateSnapshot,
  });
  state = reduceNorthstarLedger(state, {
    type: "record-attempt-prepared",
    taskId: "T1",
    attemptId: "A1",
    preparedResult: { ready: true },
    candidateCommitHash,
    candidateStateHash: stateHash,
    result: { changed: true },
    stateSnapshot,
    timestamp: 4,
  });
  state = reduceNorthstarLedger(state, {
    type: "record-projection-failure",
    taskId: "T1",
    attemptId: "A1",
    failure: {
      kind: "transient",
      code: "RESPONSE_LOST",
      detail: "Projection may have succeeded but the response was lost.",
      phase: "projection",
    },
    timestamp: 5,
  });

  assert.equal(state.tasks[0]?.status, "awaiting-projection");
  assert.equal(state.tasks[0]?.currentAttemptId, "A1");
  assert.equal(state.attempts[0]?.status, "prepared");
  assert.equal(state.attempts[0]?.candidateCommitHash, candidateCommitHash);
  assert.equal(state.attempts[0]?.projectionFailures?.length, 1);
  assert.equal(state.run.headCommitHash, "H0");
});

test("idempotent redelivery is a no-op while contradictory redelivery is rejected", () => {
  const created = reduceNorthstarLedger(createState(), {
    type: "create-task",
    taskId: "T1",
    activity,
    timestamp: 2,
  });
  const same = reduceNorthstarLedger(created, {
    type: "create-task",
    taskId: "T1",
    activity,
    timestamp: 3,
  });
  assert.equal(same, created);

  assert.throws(
    () => reduceNorthstarLedger(created, {
      type: "create-task",
      taskId: "T1",
      activity: { ...activity, intent: "A contradictory intent" },
      timestamp: 3,
    }),
    /contradictory content/,
  );
});
