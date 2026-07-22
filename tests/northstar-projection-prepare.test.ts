import assert from "node:assert/strict";
import test from "node:test";
import { prepareNorthstarProjection, createNorthstarDirectArtboardPreparer } from "@/lib/canvas-projection/prepare";
import { parseNorthstarPreparedProjection, parseNorthstarProjectionState } from "@/lib/canvas-projection/validation";
import { createNorthstarMemoryProjectionSurface } from "@/lib/canvas-projection/memory-surface";
import { NorthstarProjectionSurfaceError } from "@/lib/canvas-projection/surface";
import type { NorthstarLedgerLLMContext, NorthstarLedgerTask, NorthstarLedgerTaskAttempt, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { projectionDraft, projectionFixtureState } from "@/tests/northstar-projection-fixtures";

function ledgerValue(value: unknown): NorthstarLedgerValue {
  return value as NorthstarLedgerValue;
}

function preparationInput() {
  const state = projectionFixtureState();
  const draft = projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Prepared title" }]);
  const task: NorthstarLedgerTask = {
    id: "task-projection",
    runId: "run-projection",
    sequence: 1,
    kind: "artboard-mutation",
    intent: "Change title",
    expectedOutcome: "Title is projected",
    initialExecutionInput: {},
    status: "awaiting-preparation",
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
    status: "drafted",
    result: ledgerValue(draft),
    startedAt: 2,
    draftedAt: 3,
  };
  const context: NorthstarLedgerLLMContext = {
    schema: "northstar.ledger-context.v1",
    run: { id: task.runId, objective: "Test projection", status: "active", createdAt: 0 },
    currentHead: { hash: "commit-root", stateHash: "state-root", sequence: 0, stateSnapshot: ledgerValue(state) },
    activeTask: { task, attempts: [attempt] },
    tasks: [task],
    attempts: [attempt],
    commits: [],
    events: [],
    outstandingObligations: [task.expectedOutcome],
  };
  return { state, draft, task, attempt, context };
}

test("pure preparation creates deterministic operations and target state", () => {
  const { state, draft } = preparationInput();
  const first = prepareNorthstarProjection({ baseStateSnapshot: ledgerValue(state), draft: ledgerValue(draft) });
  const second = prepareNorthstarProjection({ baseStateSnapshot: ledgerValue(state), draft: ledgerValue(draft) });
  assert.deepEqual(first, second);
  assert.equal(first.type, "prepared");
  if (first.type === "prepared") {
    const prepared = parseNorthstarPreparedProjection(first.preparedResult);
    assert.equal(prepared.operations.length, 1);
    const target = parseNorthstarProjectionState(first.stateSnapshot);
    const artboard = target.root.children[1];
    const title = artboard?.kind === "element" ? artboard.children[0] : undefined;
    const text = title?.kind === "element" ? title.children[0] : undefined;
    assert.equal(text?.kind === "text" ? text.text : undefined, "Prepared title");
  }
});

test("preparation rejects an invalid mutation as correctable", () => {
  const { state } = preparationInput();
  const outcome = prepareNorthstarProjection({
    baseStateSnapshot: ledgerValue(state),
    draft: ledgerValue({ operations: [{ type: "replace-document", html: "<main/>" }] }),
  });
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "correctable");
    assert.equal(outcome.failure.code, "ARTBOARD_DRAFT_INVALID");
  }
});

test("preparation treats an invalid committed base as terminal", () => {
  const { draft } = preparationInput();
  const outcome = prepareNorthstarProjection({ baseStateSnapshot: { not: "a projection" }, draft: ledgerValue(draft) });
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "terminal");
    assert.equal(outcome.failure.code, "ARTBOARD_BASE_STATE_INVALID");
  }
});

test("preparation rejects a no-effect draft instead of fabricating progress", () => {
  const { state } = preparationInput();
  const outcome = prepareNorthstarProjection({
    baseStateSnapshot: ledgerValue(state),
    draft: ledgerValue(projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Original title" }])),
  });
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "correctable");
    assert.equal(outcome.failure.code, "ARTBOARD_DRAFT_NO_EFFECT");
  }
});

test("browser-backed preparation uses detached canonical state", async () => {
  const fixture = preparationInput();
  const surface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.state,
    canonicalizePreparedState(state) {
      const canonical = structuredClone(state);
      const artboard = canonical.root.children[1];
      if (artboard?.kind === "element") {
        const title = artboard.children[0];
        if (title?.kind === "element") {
          title.styles = { color: { value: "rgb(255, 0, 0)", priority: "" } };
        }
      }
      return canonical;
    },
  });
  const preparer = createNorthstarDirectArtboardPreparer(surface);
  const draft = projectionDraft([{
    type: "set-styles",
    nodeId: "title",
    styles: { color: { value: "red", priority: "" } },
  }]);
  const outcome = await preparer.prepare({ ...fixture, draft: ledgerValue(draft), attempt: { ...fixture.attempt, result: ledgerValue(draft) } });
  assert.equal(outcome.type, "prepared");
  if (outcome.type === "prepared") {
    const target = parseNorthstarProjectionState(outcome.stateSnapshot);
    const artboard = target.root.children[1];
    const title = artboard?.kind === "element" ? artboard.children[0] : undefined;
    assert.deepEqual(title?.kind === "element" ? title.styles.color : undefined, {
      value: "rgb(255, 0, 0)",
      priority: "",
    });
  }
  assert.equal(surface.getState().root.children[1]?.id, "artboard");
});

test("detached surface failures retain their correct classification", async () => {
  const fixture = preparationInput();
  const surface = createNorthstarMemoryProjectionSurface({
    initialState: fixture.state,
    beforePrepare() {
      throw new NorthstarProjectionSurfaceError({
        code: "DETACHED_RUNTIME_BUSY",
        message: "Detached runtime is temporarily busy.",
        failureKind: "transient",
      });
    },
  });
  const outcome = await createNorthstarDirectArtboardPreparer(surface).prepare({ ...fixture, draft: ledgerValue(fixture.draft) });
  assert.equal(outcome.type, "failure");
  if (outcome.type === "failure") {
    assert.equal(outcome.failure.kind, "transient");
    assert.equal(outcome.failure.code, "DETACHED_RUNTIME_BUSY");
  }
});
