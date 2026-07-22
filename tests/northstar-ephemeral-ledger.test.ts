import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";

function deterministicLedger() {
  let now = 100;
  let id = 0;
  return createNorthstarEphemeralLedger({
    objective: "Build a comparison",
    initialStateSnapshot: { artboard: [] },
    clock: () => ++now,
    idFactory: () => `id-${++id}`,
  });
}

test("the store, not the LLM draft, owns run, task and attempt identity", () => {
  const ledger = deterministicLedger();
  const task = ledger.createTask({
    kind: "research",
    intent: "Find onboarding evidence",
    expectedOutcome: "Evidence is available",
    executionInput: { query: "onboarding" },
  });
  const attempt = ledger.startAttempt(task.id);

  assert.equal(ledger.getSnapshot().run.id, "run_id-1");
  assert.equal(task.id, "task_id-2");
  assert.equal(attempt.id, "attempt_id-3");
  assert.equal(task.sequence, 1);
  assert.equal(attempt.attemptNumber, 1);
});

test("a failure remains attached to the same task and does not advance HEAD", () => {
  const ledger = deterministicLedger();
  const originalHead = ledger.getSnapshot().run.headCommitHash;
  const task = ledger.createTask({
    kind: "research",
    intent: "Find evidence",
    expectedOutcome: "Evidence found",
    executionInput: { query: "Awin" },
  });
  const first = ledger.startAttempt(task.id);
  ledger.recordAttemptFailure(task.id, first.id, {
    kind: "transient",
    code: "NETWORK",
    detail: "Network unavailable",
    phase: "execution",
  });
  const second = ledger.startAttempt(task.id);

  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.run.headCommitHash, originalHead);
  assert.equal(snapshot.run.activeTaskId, task.id);
  assert.equal(second.taskId, task.id);
  assert.equal(second.attemptNumber, 2);
});

test("successful work becomes an immutable commit before the next task can exist", () => {
  const ledger = deterministicLedger();
  const task = ledger.createTask({
    kind: "analysis",
    intent: "Synthesize evidence",
    expectedOutcome: "Synthesis committed",
    executionInput: { evidence: ["e1"] },
  });
  const attempt = ledger.startAttempt(task.id);
  const commit = ledger.commitTask({
    taskId: task.id,
    attemptId: attempt.id,
    result: { conclusion: "Trust before speed" },
    stateSnapshot: { analyses: ["Trust before speed"] },
  });

  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.run.headCommitHash, commit.hash);
  assert.equal(snapshot.run.activeTaskId, null);
  assert.equal(snapshot.headCommit.taskId, task.id);
  assert.equal(snapshot.headCommit.stateHash, commit.stateHash);
  assert.deepEqual(snapshot.headCommit.result, { conclusion: "Trust before speed" });

  const next = ledger.createTask({
    kind: "verification",
    intent: "Verify the conclusion",
    expectedOutcome: "Conclusion verified",
    executionInput: { commitHash: commit.hash },
  });
  assert.equal(next.sequence, 2);
  assert.equal(next.baseCommitHash, commit.hash);
});

test("artboard commits require a prepared attempt and the exact projected state", () => {
  const ledger = deterministicLedger();
  const task = ledger.createTask({
    kind: "artboard-mutation",
    intent: "Add evidence",
    expectedOutcome: "Evidence appears",
    executionInput: { operations: [] },
  });
  const attempt = ledger.startAttempt(task.id);

  assert.throws(
    () => ledger.commitTask({
      taskId: task.id,
      attemptId: attempt.id,
      result: { changed: true },
      stateSnapshot: { artboard: ["evidence"] },
    }),
    /must be prepared/,
  );

  const candidate = ledger.prepareArtboardCommit({
    taskId: task.id,
    attemptId: attempt.id,
    preparedResult: { candidate: "ready" },
    result: { changed: true },
    stateSnapshot: { artboard: ["evidence"] },
  });

  assert.throws(
    () => ledger.commitTask({
      taskId: task.id,
      attemptId: attempt.id,
      result: { changed: true },
      stateSnapshot: { artboard: ["evidence"] },
      projectionReceipt: {
        commitHash: candidate.hash,
        projectedStateHash: "wrong-state",
        surfaceSessionId: "surface-1",
        verified: true,
        projectedAt: 500,
      },
    }),
    /does not match candidate state/,
  );
  assert.notEqual(ledger.getSnapshot().run.headCommitHash, candidate.hash);

  const commit = ledger.commitTask({
    taskId: task.id,
    attemptId: attempt.id,
    result: { changed: true },
    stateSnapshot: { artboard: ["evidence"] },
    projectionReceipt: {
      commitHash: candidate.hash,
      projectedStateHash: candidate.stateHash,
      surfaceSessionId: "surface-1",
      verified: true,
      projectedAt: 501,
    },
  });

  assert.equal(commit.projectionReceipt?.commitHash, commit.hash);
  assert.equal(commit.projectionReceipt?.projectedStateHash, commit.stateHash);
  assert.equal(ledger.getSnapshot().run.headCommitHash, commit.hash);
});

test("identical duplicate completion is idempotent and contradictory completion is rejected", () => {
  const ledger = deterministicLedger();
  const task = ledger.createTask({
    kind: "analysis",
    intent: "Synthesize evidence",
    expectedOutcome: "Synthesis committed",
    executionInput: { evidence: ["e1"] },
  });
  const attempt = ledger.startAttempt(task.id);
  const input = {
    taskId: task.id,
    attemptId: attempt.id,
    result: { conclusion: "Trust before speed" },
    stateSnapshot: { analyses: ["Trust before speed"] },
  } as const;
  const first = ledger.commitTask(input);
  const duplicate = ledger.commitTask(input);
  assert.equal(duplicate.hash, first.hash);
  assert.equal(ledger.getSnapshot().commits.length, 2);

  assert.throws(
    () => ledger.commitTask({
      ...input,
      result: { conclusion: "Contradictory conclusion" },
      stateSnapshot: { analyses: ["Contradictory conclusion"] },
    }),
    /contradictory content/,
  );
});

test("transient projection failure keeps the same candidate prepared", () => {
  const ledger = deterministicLedger();
  const task = ledger.createTask({
    kind: "artboard-mutation",
    intent: "Add evidence",
    expectedOutcome: "Evidence appears",
    executionInput: { operations: [] },
  });
  const attempt = ledger.startAttempt(task.id);
  const candidate = ledger.prepareArtboardCommit({
    taskId: task.id,
    attemptId: attempt.id,
    preparedResult: { candidate: "ready" },
    result: { changed: true },
    stateSnapshot: { artboard: ["evidence"] },
  });
  ledger.recordProjectionFailure(task.id, attempt.id, {
    kind: "transient",
    code: "RESPONSE_LOST",
    detail: "Projection response was lost.",
    phase: "projection",
  });

  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.activeTask?.currentAttemptId, attempt.id);
  assert.equal(snapshot.activeTask?.status, "awaiting-projection");
  assert.equal(snapshot.attempts[0]?.status, "prepared");
  assert.equal(snapshot.attempts[0]?.candidateCommitHash, candidate.hash);
  assert.equal(snapshot.attempts[0]?.projectionFailures?.length, 1);
});

test("subscriptions observe transitions and dispose ends the session", () => {
  const ledger = deterministicLedger();
  let notifications = 0;
  const unsubscribe = ledger.subscribe(() => {
    notifications += 1;
  });
  ledger.recordDecision("Research next");
  unsubscribe();
  ledger.recordDecision("No listener");
  assert.equal(notifications, 1);

  const exported = ledger.exportJSON();
  assert.equal(exported.schema, "northstar.ephemeral-ledger-export.v1");
  assert.equal(exported.snapshot.events.length, 4);

  ledger.dispose();
  assert.throws(() => ledger.getSnapshot(), /disposed/);
});

test("returned snapshots cannot mutate authoritative ledger history", () => {
  const ledger = deterministicLedger();
  const input = { evidenceIds: ["e1"] };
  const task = ledger.createTask({
    kind: "research",
    intent: "Collect evidence",
    expectedOutcome: "Evidence collected",
    executionInput: input,
  });
  input.evidenceIds.push("external-mutation");

  const firstSnapshot = ledger.getSnapshot();
  assert.deepEqual(firstSnapshot.tasks[0]?.initialExecutionInput, { evidenceIds: ["e1"] });

  const exposedInput = firstSnapshot.tasks[0]?.initialExecutionInput as {
    evidenceIds: string[];
  };
  exposedInput.evidenceIds.push("snapshot-mutation");
  assert.deepEqual(ledger.getSnapshot().tasks[0]?.initialExecutionInput, {
    evidenceIds: ["e1"],
  });

  const attempt = ledger.startAttempt(task.id);
  const stateSnapshot = { evidenceIds: ["e1"] };
  ledger.commitTask({
    taskId: task.id,
    attemptId: attempt.id,
    result: { count: 1 },
    stateSnapshot,
  });
  stateSnapshot.evidenceIds.push("after-commit-mutation");
  assert.deepEqual(ledger.getSnapshot().headCommit.stateSnapshot, {
    evidenceIds: ["e1"],
  });
});

test("observer failures cannot abort or roll back an authoritative transition", () => {
  const observerErrors: unknown[] = [];
  let now = 0;
  let id = 0;
  const ledger = createNorthstarEphemeralLedger({
    objective: "Observer isolation",
    initialStateSnapshot: { artboard: [] },
    clock: () => ++now,
    idFactory: () => `observer-${++id}`,
    onSubscriberError: (error) => observerErrors.push(error),
  });
  ledger.subscribe(() => {
    throw new Error("inspector render failed");
  });

  const task = ledger.createTask({
    kind: "research",
    intent: "Collect evidence",
    expectedOutcome: "Evidence collected",
    executionInput: { query: "Awin" },
  });

  assert.equal(ledger.getSnapshot().activeTask?.id, task.id);
  assert.equal(observerErrors.length, 1);
});

test("the ledger rejects duplicate system IDs instead of aliasing a prior task", () => {
  const ids = ["run", "same", "attempt", "same"];
  const ledger = createNorthstarEphemeralLedger({
    objective: "ID safety",
    initialStateSnapshot: {},
    idFactory: () => ids.shift() ?? "same",
  });
  const firstTask = ledger.createTask({
    kind: "research",
    intent: "First",
    expectedOutcome: "First done",
    executionInput: {},
  });
  const firstAttempt = ledger.startAttempt(firstTask.id);
  ledger.commitTask({
    taskId: firstTask.id,
    attemptId: firstAttempt.id,
    result: { done: true },
    stateSnapshot: { done: true },
  });
  assert.throws(
    () => ledger.createTask({
      kind: "research",
      intent: "Second",
      expectedOutcome: "Second done",
      executionInput: {},
    }),
    /duplicate ID/,
  );
});
