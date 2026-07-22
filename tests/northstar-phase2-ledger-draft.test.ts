import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarLedgerLLMContext } from "@/lib/canvas-ledger/northstar-ledger-context";
import { createNorthstarTaskController } from "@/lib/canvas-ledger/northstar-task-controller";
import { createTurnLedger } from "./northstar-turn-fixtures";

test("an artboard draft is ledger history but does not advance HEAD", () => {
  const ledger = createTurnLedger();
  const rootHead = ledger.getSnapshot().run.headCommitHash;
  const task = ledger.createTask({
    kind: "artboard-mutation",
    intent: "Draft a change",
    expectedOutcome: "Draft awaits preparation",
    executionInput: { evidenceIds: ["e1"] },
  });
  const attempt = ledger.startAttempt(task.id);
  const draft = { operations: [{ type: "set-text", target: "title", text: "Evidence" }] };
  ledger.recordArtboardDraft(task.id, attempt.id, draft);

  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.run.headCommitHash, rootHead);
  assert.equal(snapshot.activeTask?.status, "awaiting-preparation");
  assert.equal(snapshot.attempts[0]?.status, "drafted");
  assert.deepEqual(snapshot.attempts[0]?.result, draft);
  assert.ok(snapshot.events.some((event) => event.type === "attempt.drafted"));
  assert.match(createNorthstarLedgerLLMContext(snapshot).outstandingObligations.join(" "), /Prepare and project/);
});

test("identical draft redelivery is idempotent and contradictory redelivery is rejected", () => {
  const ledger = createTurnLedger();
  const task = ledger.createTask({
    kind: "artboard-mutation",
    intent: "Draft a change",
    expectedOutcome: "Draft awaits preparation",
    executionInput: {},
  });
  const attempt = ledger.startAttempt(task.id);
  const draft = { operations: [{ type: "set-text", text: "A" }] };
  ledger.recordArtboardDraft(task.id, attempt.id, draft);
  const eventCount = ledger.getSnapshot().events.length;
  ledger.recordArtboardDraft(task.id, attempt.id, draft);
  assert.equal(ledger.getSnapshot().events.length, eventCount);
  assert.throws(
    () => ledger.recordArtboardDraft(task.id, attempt.id, { operations: [{ type: "set-text", text: "B" }] }),
    /contradictory/,
  );
});

test("Phase 2 controller stops at awaiting runtime instead of fabricating preparation", async () => {
  const ledger = createTurnLedger();
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "artboard-mutation",
            intent: "Draft evidence",
            expectedOutcome: "Draft awaits runtime",
            executionInput: {},
          },
        };
      },
    },
    executor: {
      async executeAttempt({ context }) {
        return {
          type: "success",
          result: { operations: [{ type: "insert-html", target: "root", html: "<p>Evidence</p>" }] },
          stateSnapshot: context.currentHead.stateSnapshot,
        };
      },
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-awaiting-artboard-runtime");
  assert.equal((await controller.resumeActiveTask()).type, "task-awaiting-artboard-runtime");
  assert.equal(ledger.getSnapshot().attempts.length, 1);
});
