import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import { createNorthstarLedgerLLMContext } from "@/lib/canvas-ledger/northstar-ledger-context";

function createLedger() {
  let id = 0;
  return createNorthstarEphemeralLedger({
    objective: "Explain onboarding strategy",
    initialStateSnapshot: { artboard: "H0" },
    idFactory: () => `context-${++id}`,
    clock: (() => {
      let now = 0;
      return () => ++now;
    })(),
  });
}

test("the next LLM context contains complete ordered committed history", () => {
  const ledger = createLedger();
  const firstTask = ledger.createTask({
    kind: "research",
    intent: "Collect onboarding evidence",
    expectedOutcome: "Evidence is collected",
    executionInput: { sources: ["Awin", "Whop"] },
  });
  const firstAttempt = ledger.startAttempt(firstTask.id);
  const firstCommit = ledger.commitTask({
    taskId: firstTask.id,
    attemptId: firstAttempt.id,
    result: { evidenceIds: ["e1", "e2"] },
    stateSnapshot: { evidenceIds: ["e1", "e2"], artboard: "H0" },
  });

  const secondTask = ledger.createTask({
    kind: "analysis",
    intent: "Interpret the evidence",
    expectedOutcome: "A strategic tension is identified",
    executionInput: { evidenceCommit: firstCommit.hash },
  });
  const failedAttempt = ledger.startAttempt(secondTask.id);
  ledger.recordAttemptFailure(secondTask.id, failedAttempt.id, {
    kind: "correctable",
    code: "INSUFFICIENT_GROUNDING",
    detail: "The analysis omitted one source.",
    phase: "execution",
    correctionContext: { missingEvidenceId: "e2" },
  });

  const context = createNorthstarLedgerLLMContext(ledger.getSnapshot());

  assert.equal(context.currentHead.hash, firstCommit.hash);
  assert.deepEqual(context.currentHead.stateSnapshot, {
    evidenceIds: ["e1", "e2"],
    artboard: "H0",
  });
  assert.equal(context.tasks.length, 2);
  assert.equal(context.attempts.length, 2);
  assert.equal(context.commits.length, 2);
  assert.equal(context.activeTask?.task.id, secondTask.id);
  assert.equal(context.activeTask?.attempts[0]?.failure?.code, "INSUFFICIENT_GROUNDING");
  assert.deepEqual(context.outstandingObligations, [
    "A strategic tension is identified",
    "Resolve INSUFFICIENT_GROUNDING: The analysis omitted one source.",
  ]);
  assert.deepEqual(
    context.events.map((event) => event.sequence),
    [...context.events.map((_, index) => index + 1)],
  );
});
