import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import {
  createNorthstarTaskController,
  type NorthstarArtboardPreparer,
  type NorthstarArtboardProjector,
} from "@/lib/canvas-ledger/northstar-task-controller";
import { createNorthstarDirectArtboardPreparer } from "@/lib/canvas-projection/prepare";
import { createNorthstarDirectArtboardProjector } from "@/lib/canvas-projection/projector";
import { createNorthstarMemoryProjectionSurface } from "@/lib/canvas-projection/memory-surface";
import { parseNorthstarProjectionState } from "@/lib/canvas-projection/validation";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { projectionDraft, projectionFixtureState } from "@/tests/northstar-projection-fixtures";

function ledgerValue(value: unknown): NorthstarLedgerValue {
  return value as NorthstarLedgerValue;
}

function ledgerForProjection() {
  let clock = 100;
  let id = 0;
  return createNorthstarEphemeralLedger({
    objective: "Project one bounded artboard task",
    initialStateSnapshot: ledgerValue(projectionFixtureState()),
    clock: () => ++clock,
    idFactory: () => `phase3-${++id}`,
  });
}

function activity() {
  return {
    type: "activity" as const,
    activity: {
      kind: "artboard-mutation" as const,
      intent: "Change the title",
      expectedOutcome: "The title is committed on the live artboard",
      executionInput: { title: "Phase 3" },
    },
  };
}

test("Phase 2 draft flows through Phase 3 preparation, projection, and ledger commit", async () => {
  const ledger = ledgerForProjection();
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  let decisions = 0;
  let executions = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        decisions += 1;
        return activity();
      },
    },
    executor: {
      async executeAttempt({ context }) {
        executions += 1;
        return {
          type: "success",
          result: ledgerValue(projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Phase 3" }])),
          stateSnapshot: context.currentHead.stateSnapshot,
        };
      },
    },
    artboardPreparer: createNorthstarDirectArtboardPreparer(surface),
    artboardProjector: createNorthstarDirectArtboardProjector({ surface, now: () => 500 }),
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(decisions, 1);
  assert.equal(executions, 1);
  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.activeTask, null);
  assert.equal(snapshot.tasks[0]?.status, "completed");
  assert.equal(snapshot.attempts[0]?.status, "completed");
  assert.equal(snapshot.commits.length, 2);
  assert.equal(snapshot.headCommit.projectionReceipt?.verified, true);
  const target = parseNorthstarProjectionState(snapshot.headCommit.stateSnapshot);
  const artboard = target.root.children[1];
  const title = artboard?.kind === "element" ? artboard.children[0] : undefined;
  const text = title?.kind === "element" ? title.children[0] : undefined;
  assert.equal(text?.kind === "text" ? text.text : undefined, "Phase 3");
  assert.deepEqual(
    snapshot.events.filter((event) => event.taskId === snapshot.tasks[0]?.id && ["attempt.drafted", "attempt.prepared", "commit.created", "task.completed"].includes(event.type)).map((event) => event.type),
    ["attempt.drafted", "attempt.prepared", "commit.created", "task.completed"],
  );
});

test("transient detached preparation retries the same draft and attempt without rerunning the LLM", async () => {
  const ledger = ledgerForProjection();
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  const direct = createNorthstarDirectArtboardPreparer(surface);
  let preparationCalls = 0;
  let executionCalls = 0;
  const preparer: NorthstarArtboardPreparer = {
    async prepare(input) {
      preparationCalls += 1;
      if (preparationCalls === 1) {
        return {
          type: "failure",
          failure: {
            kind: "transient",
            code: "DETACHED_RUNTIME_BUSY",
            detail: "Try the exact draft again.",
            phase: "preparation",
          },
        };
      }
      return direct.prepare(input);
    },
  };
  const controller = createNorthstarTaskController({
    ledger,
    maximumPreparationAttempts: 2,
    decisionProvider: { async decideNext() { return activity(); } },
    executor: {
      async executeAttempt({ context }) {
        executionCalls += 1;
        return {
          type: "success",
          result: ledgerValue(projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Retried draft" }])),
          stateSnapshot: context.currentHead.stateSnapshot,
        };
      },
    },
    artboardPreparer: preparer,
    artboardProjector: createNorthstarDirectArtboardProjector({ surface }),
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(preparationCalls, 2);
  assert.equal(executionCalls, 1);
  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.attempts.length, 1);
  assert.equal(snapshot.attempts[0]?.preparationFailures?.length, 1);
  assert.equal(snapshot.events.filter((event) => event.type === "preparation.retrying").length, 1);
});

test("correctable preparation keeps one task but creates a corrected new attempt", async () => {
  const ledger = ledgerForProjection();
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  let executionCalls = 0;
  let correctionCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() { return activity(); },
      async correctActiveTask() {
        correctionCalls += 1;
        return { type: "retry", executionInput: { corrected: true } };
      },
    },
    executor: {
      async executeAttempt({ context, attempt }) {
        executionCalls += 1;
        return {
          type: "success",
          result: ledgerValue(attempt.attemptNumber === 1
            ? { operations: [{ type: "replace-document", html: "<main/>" }] }
            : projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Corrected" }])),
          stateSnapshot: context.currentHead.stateSnapshot,
        };
      },
    },
    artboardPreparer: createNorthstarDirectArtboardPreparer(surface),
    artboardProjector: createNorthstarDirectArtboardProjector({ surface }),
  });

  const first = await controller.runNextTask();
  assert.equal(first.type, "task-blocked");
  const taskId = ledger.getSnapshot().activeTask?.id;
  const second = await controller.resumeActiveTask();
  assert.equal(second.type, "task-completed");
  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0]?.id, taskId);
  assert.equal(snapshot.attempts.length, 2);
  assert.equal(snapshot.attempts[0]?.failure?.kind, "correctable");
  assert.deepEqual(snapshot.attempts[1]?.executionInput, { corrected: true });
  assert.equal(correctionCalls, 1);
  assert.equal(executionCalls, 2);
});

test("transient projection retry reuses the exact prepared candidate", async () => {
  const ledger = ledgerForProjection();
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  const directProjector = createNorthstarDirectArtboardProjector({ surface });
  const candidateIdentities: string[] = [];
  let projectionCalls = 0;
  const projector: NorthstarArtboardProjector = {
    async project(input) {
      candidateIdentities.push(`${input.attempt.id}:${input.candidateCommitHash}:${input.candidateStateHash}`);
      projectionCalls += 1;
      if (projectionCalls === 1) {
        return {
          type: "failure",
          failure: {
            kind: "transient",
            code: "SURFACE_TEMPORARILY_BUSY",
            detail: "Retry the exact candidate.",
            phase: "projection",
          },
        };
      }
      return directProjector.project(input);
    },
  };
  let executionCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    maximumProjectionAttempts: 2,
    decisionProvider: { async decideNext() { return activity(); } },
    executor: {
      async executeAttempt({ context }) {
        executionCalls += 1;
        return {
          type: "success",
          result: ledgerValue(projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Same candidate" }])),
          stateSnapshot: context.currentHead.stateSnapshot,
        };
      },
    },
    artboardPreparer: createNorthstarDirectArtboardPreparer(surface),
    artboardProjector: projector,
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(executionCalls, 1);
  assert.equal(projectionCalls, 2);
  assert.equal(new Set(candidateIdentities).size, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 1);
  assert.equal(ledger.getSnapshot().attempts[0]?.projectionFailures?.length, 1);
});

test("without a Phase 3 preparer, corrected Phase 2 behavior remains awaiting runtime", async () => {
  const ledger = ledgerForProjection();
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: { async decideNext() { return activity(); } },
    executor: {
      async executeAttempt({ context }) {
        return {
          type: "success",
          result: ledgerValue(projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Awaiting" }])),
          stateSnapshot: context.currentHead.stateSnapshot,
        };
      },
    },
  });
  const result = await controller.runNextTask();
  assert.equal(result.type, "task-awaiting-artboard-runtime");
  assert.equal(ledger.getSnapshot().activeTask?.status, "awaiting-preparation");
  assert.equal(ledger.getSnapshot().attempts[0]?.status, "drafted");
});

test("another LLM decision remains blocked until projection commits", async () => {
  const ledger = ledgerForProjection();
  let decisions = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        decisions += 1;
        return activity();
      },
    },
    executor: {
      async executeAttempt({ context }) {
        return {
          type: "success",
          result: ledgerValue(projectionDraft([{ type: "set-text", nodeId: "title-text", text: "Pending" }])),
          stateSnapshot: context.currentHead.stateSnapshot,
        };
      },
    },
  });
  await controller.runNextTask();
  await assert.rejects(controller.runNextTask(), /unresolved/);
  assert.equal(decisions, 1);
});
