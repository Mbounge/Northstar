import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarDirectArtboardProjector } from "@/lib/canvas-projection/projector";
import { prepareNorthstarProjection } from "@/lib/canvas-projection/prepare";
import { createNorthstarMemoryProjectionSurface, type NorthstarMemoryProjectionSurface } from "@/lib/canvas-projection/memory-surface";
import { NorthstarProjectionSurfaceError } from "@/lib/canvas-projection/surface";
import type { NorthstarProjectionSurface } from "@/lib/canvas-projection/types";
import { hashNorthstarProjectionState } from "@/lib/canvas-projection/state";
import { parseNorthstarPreparedProjection, parseNorthstarProjectionState } from "@/lib/canvas-projection/validation";
import type { NorthstarLedgerLLMContext, NorthstarLedgerTask, NorthstarLedgerTaskAttempt, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { projectionDraft, projectionFixtureState } from "@/tests/northstar-projection-fixtures";

function ledgerValue(value: unknown): NorthstarLedgerValue {
  return value as NorthstarLedgerValue;
}

function correctionValue(
  failure: { correctionContext?: NorthstarLedgerValue },
  key: string,
): NorthstarLedgerValue | undefined {
  const context = failure.correctionContext;
  if (!context || typeof context !== "object" || Array.isArray(context)) return undefined;
  return (context as { readonly [name: string]: NorthstarLedgerValue })[key];
}

function projectorFixture(operations = [
  { type: "set-text" as const, nodeId: "title-text", text: "Projected title" },
]) {
  const base = projectionFixtureState();
  const draft = projectionDraft(operations);
  const preparedOutcome = prepareNorthstarProjection({ baseStateSnapshot: ledgerValue(base), draft: ledgerValue(draft) });
  assert.equal(preparedOutcome.type, "prepared");
  if (preparedOutcome.type !== "prepared") throw new Error("fixture preparation failed");
  const prepared = parseNorthstarPreparedProjection(preparedOutcome.preparedResult);
  const target = parseNorthstarProjectionState(preparedOutcome.stateSnapshot);
  const task: NorthstarLedgerTask = {
    id: "task-projection",
    runId: "run-projection",
    sequence: 1,
    kind: "artboard-mutation",
    intent: "Project artboard",
    expectedOutcome: "Artboard matches target",
    initialExecutionInput: {},
    status: "awaiting-projection",
    baseCommitHash: "commit-root",
    currentAttemptId: "attempt-projection",
    createdAt: 1,
  };
  const attempt: NorthstarLedgerTaskAttempt = {
    id: "attempt-projection",
    runId: task.runId,
    taskId: task.id,
    attemptNumber: 1,
    executionInput: {},
    status: "prepared",
    result: draft as unknown as NorthstarLedgerValue,
    stateSnapshot: target as unknown as NorthstarLedgerValue,
    preparedResult: prepared as unknown as NorthstarLedgerValue,
    candidateCommitHash: "candidate-commit-hash",
    candidateStateHash: hashNorthstarProjectionState(target),
    startedAt: 2,
    draftedAt: 3,
    preparedAt: 4,
  };
  const context: NorthstarLedgerLLMContext = {
    schema: "northstar.ledger-context.v1",
    run: { id: task.runId, objective: "Project", status: "active", createdAt: 0 },
    currentHead: {
      hash: task.baseCommitHash,
      stateHash: hashNorthstarProjectionState(base),
      sequence: 0,
      stateSnapshot: ledgerValue(base),
    },
    activeTask: { task, attempts: [attempt] },
    tasks: [task],
    attempts: [attempt],
    commits: [],
    events: [],
    outstandingObligations: [task.expectedOutcome],
  };
  return {
    base,
    target,
    prepared,
    task,
    attempt,
    context,
    input: {
      context,
      task,
      attempt,
      result: draft as unknown as NorthstarLedgerValue,
      stateSnapshot: target as unknown as NorthstarLedgerValue,
      preparedResult: prepared as unknown as NorthstarLedgerValue,
      candidateCommitHash: attempt.candidateCommitHash!,
      candidateStateHash: attempt.candidateStateHash!,
    },
  };
}

test("projector applies each primitive and returns an exact receipt", async () => {
  const fixture = projectorFixture();
  const surface = createNorthstarMemoryProjectionSurface({ initialState: fixture.base });
  const outcome = await createNorthstarDirectArtboardProjector({
    surface,
    now: () => 42,
  }).project(fixture.input);
  assert.equal(outcome.type, "projected");
  if (outcome.type === "projected") {
    assert.equal(outcome.receipt.commitHash, fixture.input.candidateCommitHash);
    assert.equal(outcome.receipt.projectedStateHash, fixture.input.candidateStateHash);
    assert.equal(outcome.receipt.surfaceSessionId, "surface-session-memory-1");
    assert.equal(outcome.receipt.projectedAt, 42);
  }
  assert.equal(hashNorthstarProjectionState(surface.getState()), hashNorthstarProjectionState(fixture.target));
  assert.equal(surface.getAppliedOperations().length, fixture.prepared.operations.length);
});

test("projector confirms an already-projected candidate without replaying operations", async () => {
  const fixture = projectorFixture();
  const surface = createNorthstarMemoryProjectionSurface({ initialState: fixture.target });
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project(fixture.input);
  assert.equal(outcome.type, "projected");
  assert.equal(surface.getAppliedOperations().length, 0);
  if (outcome.type === "projected") {
    assert.deepEqual(outcome.receipt.metadata, {
      protocol: "northstar.direct-projection.v1",
      operationCount: fixture.prepared.operations.length,
      alreadyProjected: true,
    });
  }
});

test("projector refuses to mutate a live surface that diverged from ledger HEAD", async () => {
  const fixture = projectorFixture();
  const divergent = structuredClone(fixture.base);
  divergent.space.right = 1;
  const surface = createNorthstarMemoryProjectionSurface({ initialState: divergent });
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project(fixture.input);
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "terminal");
    assert.equal(outcome.failure.code, "PROJECTION_LIVE_BASE_MISMATCH");
    const firstDifference = correctionValue(outcome.failure, "firstDifferenceFromBase");
    assert.ok(firstDifference && typeof firstDifference === "object" && !Array.isArray(firstDifference));
    assert.equal((firstDifference as { path?: unknown }).path, "$state.space.right");
  }
  assert.equal(surface.getAppliedOperations().length, 0);
});

test("a lost operation response that actually reached the target is confirmed", async () => {
  const fixture = projectorFixture();
  const surface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.base,
    afterApply() {
      throw new NorthstarProjectionSurfaceError({
        code: "OPERATION_RESPONSE_LOST",
        message: "Operation response was lost.",
        failureKind: "transient",
        outcomeUnknown: true,
      });
    },
  });
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project(fixture.input);
  assert.equal(outcome.type, "projected");
  assert.equal(hashNorthstarProjectionState(surface.getState()), hashNorthstarProjectionState(fixture.target));
});

test("partial projection failure rolls back and remains retryable on the same candidate", async () => {
  const fixture = projectorFixture([
    { type: "set-text", nodeId: "title-text", text: "Step one" },
    { type: "set-text", nodeId: "card-b-text", text: "Step two" },
  ]);
  let failed = false;
  const surface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.base,
    beforeApply(input) {
      if (input.operationIndex === 1 && !failed) {
        failed = true;
        throw new NorthstarProjectionSurfaceError({
          code: "RUNTIME_TEMPORARILY_BUSY",
          message: "Runtime was temporarily busy.",
          failureKind: "transient",
          outcomeUnknown: false,
        });
      }
    },
  });
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project(fixture.input);
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "transient");
    assert.equal(outcome.failure.code, "RUNTIME_TEMPORARILY_BUSY_ROLLED_BACK");
  }
  assert.equal(hashNorthstarProjectionState(surface.getState()), hashNorthstarProjectionState(fixture.base));
});

test("known-invalid browser operation becomes correctable after rollback", async () => {
  const fixture = projectorFixture([
    { type: "set-text", nodeId: "title-text", text: "Step one" },
    { type: "set-text", nodeId: "card-b-text", text: "Step two" },
  ]);
  const surface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.base,
    beforeApply(input) {
      if (input.operationIndex === 1) {
        throw new NorthstarProjectionSurfaceError({
          code: "INVALID_STYLE_VALUE",
          message: "Browser rejected the value.",
          failureKind: "correctable",
        });
      }
    },
  });
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project(fixture.input);
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") assert.equal(outcome.failure.kind, "correctable");
  assert.equal(hashNorthstarProjectionState(surface.getState()), hashNorthstarProjectionState(fixture.base));
});

test("surface remount during an uncertain operation is terminal", async () => {
  const fixture = projectorFixture();
  const surface: NorthstarMemoryProjectionSurface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.base,
    afterApply() {
      surface.replaceSession("surface-session-remounted");
      throw new NorthstarProjectionSurfaceError({
        code: "OPERATION_RESPONSE_LOST",
        message: "Response lost during remount.",
        failureKind: "transient",
        outcomeUnknown: true,
      });
    },
  });
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project(fixture.input);
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "terminal");
    assert.equal(outcome.failure.code, "PROJECTION_SURFACE_REMOUNTED");
  }
});

test("rollback failure is terminal and never claims a receipt", async () => {
  const fixture = projectorFixture([
    { type: "set-text", nodeId: "title-text", text: "Step one" },
    { type: "set-text", nodeId: "card-b-text", text: "Step two" },
  ]);
  const surface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.base,
    beforeApply(input) {
      if (input.operationIndex === 1) {
        throw new NorthstarProjectionSurfaceError({
          code: "APPLY_FAILED",
          message: "Apply failed.",
          failureKind: "transient",
        });
      }
      if (input.operationIndex < 0) {
        throw new NorthstarProjectionSurfaceError({
          code: "ROLLBACK_LINK_LOST",
          message: "Rollback transport failed.",
          failureKind: "terminal",
          outcomeUnknown: true,
        });
      }
    },
  });
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project(fixture.input);
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "terminal");
    assert.equal(outcome.failure.code, "ROLLBACK_LINK_LOST");
  }
});

test("projector rejects candidate hash contradictions before touching the surface", async () => {
  const fixture = projectorFixture();
  const surface = createNorthstarMemoryProjectionSurface({ initialState: fixture.base });
  const contradictoryHash = "nsl1-" + "0".repeat(64);
  const attempt = { ...fixture.attempt, candidateStateHash: contradictoryHash };
  const context = {
    ...fixture.context,
    activeTask: { task: fixture.task, attempts: [attempt] },
    attempts: [attempt],
  };
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project({
    ...fixture.input,
    context,
    attempt,
    candidateStateHash: contradictoryHash,
  });
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") assert.equal(outcome.failure.code, "PROJECTION_CANDIDATE_HASH_MISMATCH");
  assert.equal(surface.getAppliedOperations().length, 0);
});

test("projector rejects stale ledger authority before capturing or mutating the surface", async () => {
  const fixture = projectorFixture();
  let captures = 0;
  const memory = createNorthstarMemoryProjectionSurface({ initialState: fixture.base });
  const surface: NorthstarProjectionSurface = {
    prepare: (input) => memory.prepare(input),
    async capture(signal) {
      captures += 1;
      return memory.capture(signal);
    },
    apply: (input) => memory.apply(input),
  };
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project({
    ...fixture.input,
    candidateCommitHash: "different-candidate",
  });
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") assert.equal(outcome.failure.code, "PROJECTION_AUTHORITY_MISMATCH");
  assert.equal(captures, 0);
  assert.equal(memory.getAppliedOperations().length, 0);
});

test("projector proves the prepared operations reproduce the candidate before touching the surface", async () => {
  const fixture = projectorFixture();
  const memory = createNorthstarMemoryProjectionSurface({ initialState: fixture.base });
  let captures = 0;
  const surface: NorthstarProjectionSurface = {
    prepare: (input) => memory.prepare(input),
    async capture(signal) {
      captures += 1;
      return memory.capture(signal);
    },
    apply: (input) => memory.apply(input),
  };
  const contradictoryPrepared = { ...fixture.prepared, operations: [] };
  const outcome = await createNorthstarDirectArtboardProjector({ surface }).project({
    ...fixture.input,
    preparedResult: ledgerValue(contradictoryPrepared),
  });
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") assert.equal(outcome.failure.code, "PROJECTION_PLAN_TARGET_MISMATCH");
  assert.equal(captures, 0);
  assert.equal(memory.getAppliedOperations().length, 0);
});

test("an uncertain final verification capture resumes the same candidate and confirms the existing target", async () => {
  const fixture = projectorFixture();
  const memory = createNorthstarMemoryProjectionSurface({ initialState: fixture.base });
  let captures = 0;
  const surface: NorthstarProjectionSurface = {
    prepare: (input) => memory.prepare(input),
    async capture(signal) {
      captures += 1;
      if (captures === 2) {
        throw new NorthstarProjectionSurfaceError({
          code: "VERIFY_RESPONSE_LOST",
          message: "Final capture response was lost.",
          failureKind: "transient",
          outcomeUnknown: true,
        });
      }
      return memory.capture(signal);
    },
    apply: (input) => memory.apply(input),
  };
  const projector = createNorthstarDirectArtboardProjector({ surface });
  const first = await projector.project(fixture.input);
  assert.equal(first.type, "failure");
  if (first.type !== "failure") throw new Error("expected uncertain verification failure");
  assert.equal(first.failure.kind, "transient");
  assert.equal(correctionValue(first.failure, "outcomeUnknown"), true);
  assert.equal(hashNorthstarProjectionState(memory.getState()), hashNorthstarProjectionState(fixture.target));

  const attempt = { ...fixture.attempt, projectionFailures: [first.failure] };
  const second = await projector.project({
    ...fixture.input,
    attempt,
    context: {
      ...fixture.context,
      activeTask: { task: fixture.task, attempts: [attempt] },
      attempts: [attempt],
    },
  });
  assert.equal(second.type, "projected");
  assert.equal(memory.getAppliedOperations().length, fixture.prepared.operations.length);
});

test("an uncertain partial application is rolled back on the same surface before the same candidate retries", async () => {
  const fixture = projectorFixture([
    { type: "set-text", nodeId: "title-text", text: "Partial one" },
    { type: "set-text", nodeId: "card-b-text", text: "Partial two" },
  ]);
  const memory = createNorthstarMemoryProjectionSurface({ initialState: fixture.base });
  let captureCalls = 0;
  let failSecondOperation = true;
  let hideResolutionCapture = true;
  const surface: NorthstarProjectionSurface = {
    prepare: (input) => memory.prepare(input),
    async capture(signal) {
      captureCalls += 1;
      if (hideResolutionCapture && captureCalls === 2) {
        hideResolutionCapture = false;
        throw new NorthstarProjectionSurfaceError({
          code: "CAPTURE_UNAVAILABLE",
          message: "The partial result could not be observed.",
          failureKind: "transient",
          outcomeUnknown: true,
        });
      }
      return memory.capture(signal);
    },
    async apply(input) {
      if (input.operationIndex === 1 && failSecondOperation) {
        failSecondOperation = false;
        throw new NorthstarProjectionSurfaceError({
          code: "APPLY_RESPONSE_UNKNOWN",
          message: "The second operation outcome is unknown.",
          failureKind: "transient",
          outcomeUnknown: true,
        });
      }
      return memory.apply(input);
    },
  };
  const projector = createNorthstarDirectArtboardProjector({ surface });
  const first = await projector.project(fixture.input);
  assert.equal(first.type, "failure");
  if (first.type !== "failure") throw new Error("expected ambiguous application failure");
  assert.equal(first.failure.kind, "transient");
  assert.equal(correctionValue(first.failure, "outcomeUnknown"), true);

  const recoveringAttempt = { ...fixture.attempt, projectionFailures: [first.failure] };
  const recoveringInput = {
    ...fixture.input,
    attempt: recoveringAttempt,
    context: {
      ...fixture.context,
      activeTask: { task: fixture.task, attempts: [recoveringAttempt] },
      attempts: [recoveringAttempt],
    },
  };
  const recovery = await projector.project(recoveringInput);
  assert.equal(recovery.type, "failure");
  if (recovery.type !== "failure") throw new Error("expected rollback retry signal");
  assert.equal(recovery.failure.code, "PROJECTION_AMBIGUOUS_STATE_ROLLED_BACK");
  assert.equal(hashNorthstarProjectionState(memory.getState()), hashNorthstarProjectionState(fixture.base));

  const retryAttempt = {
    ...fixture.attempt,
    projectionFailures: [first.failure, recovery.failure],
  };
  const completed = await projector.project({
    ...fixture.input,
    attempt: retryAttempt,
    context: {
      ...fixture.context,
      activeTask: { task: fixture.task, attempts: [retryAttempt] },
      attempts: [retryAttempt],
    },
  });
  assert.equal(completed.type, "projected");
  assert.equal(hashNorthstarProjectionState(memory.getState()), hashNorthstarProjectionState(fixture.target));
});

test("cancelling after a partial live application restores the committed base before rejecting", async () => {
  const fixture = projectorFixture([
    { type: "set-text", nodeId: "title-text", text: "Cancellation step one" },
    { type: "set-text", nodeId: "card-b-text", text: "Cancellation step two" },
  ]);
  const controller = new AbortController();
  const surface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.base,
    afterApply(input) {
      if (input.operationIndex === 0) controller.abort();
    },
  });
  const projector = createNorthstarDirectArtboardProjector({
    surface,
    signal: controller.signal,
  });

  await assert.rejects(
    projector.project(fixture.input),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  assert.equal(
    hashNorthstarProjectionState(surface.getState()),
    hashNorthstarProjectionState(fixture.base),
  );
});
