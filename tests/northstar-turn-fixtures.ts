import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import { createNorthstarLedgerLLMContext } from "@/lib/canvas-ledger/northstar-ledger-context";
import type {
  NorthstarEphemeralLedger,
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerTaskKind,
} from "@/lib/canvas-ledger/types";

export function createTurnLedger(): NorthstarEphemeralLedger {
  let clock = 1_000;
  let id = 0;
  return createNorthstarEphemeralLedger({
    runId: "run-turn-tests",
    objective: "Build a verified competitive analysis",
    initialStateSnapshot: { artboard: "H0", research: [] },
    clock: () => clock++,
    idFactory: () => `turn-${++id}`,
  });
}

export function decisionFixture(): {
  ledger: NorthstarEphemeralLedger;
  context: NorthstarLedgerLLMContext;
} {
  const ledger = createTurnLedger();
  return { ledger, context: createNorthstarLedgerLLMContext(ledger.getSnapshot()) };
}

export function activeAttemptFixture(
  kind: NorthstarLedgerTaskKind = "research",
): {
  ledger: NorthstarEphemeralLedger;
  context: NorthstarLedgerLLMContext;
  task: NorthstarLedgerTask;
  attempt: NorthstarLedgerTaskAttempt;
} {
  const ledger = createTurnLedger();
  const task = ledger.createTask({
    kind,
    intent: kind === "artboard-mutation" ? "Add the next evidence group" : "Collect the next evidence set",
    expectedOutcome: kind === "artboard-mutation" ? "The mutation draft is ready for runtime preparation" : "Evidence is available in the ledger",
    executionInput: kind === "artboard-mutation"
      ? { operations: [{ type: "insert-html", target: "root", html: "<section data-ns-id=\"evidence\"></section>" }] }
      : { query: "Awin onboarding" },
  });
  const attempt = ledger.startAttempt(task.id);
  return {
    ledger,
    context: createNorthstarLedgerLLMContext(ledger.getSnapshot()),
    task: ledger.getSnapshot().activeTask!,
    attempt: ledger.getSnapshot().attempts.find((entry) => entry.id === attempt.id)!,
  };
}

export function correctableFixture(): {
  ledger: NorthstarEphemeralLedger;
  context: NorthstarLedgerLLMContext;
  task: NorthstarLedgerTask;
  attempt: NorthstarLedgerTaskAttempt;
} {
  const fixture = activeAttemptFixture("analysis");
  fixture.ledger.recordAttemptFailure(fixture.task.id, fixture.attempt.id, {
    kind: "correctable",
    code: "MISSING_EVIDENCE_IDS",
    detail: "The analysis must reference committed evidence IDs.",
    phase: "execution",
    correctionContext: { required: ["evidenceIds"] },
  });
  return {
    ledger: fixture.ledger,
    context: createNorthstarLedgerLLMContext(fixture.ledger.getSnapshot()),
    task: fixture.ledger.getSnapshot().activeTask!,
    attempt: fixture.ledger.getSnapshot().attempts.at(-1)!,
  };
}
