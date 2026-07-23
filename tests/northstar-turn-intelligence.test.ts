import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import { createNorthstarLedgerLLMContext } from "@/lib/canvas-ledger/northstar-ledger-context";
import {
  buildNorthstarAdaptiveDecisionProtocol,
  buildNorthstarArtboardExecutionProtocol,
  buildNorthstarDesignIntelligenceExecutionProtocol,
  buildNorthstarResearchExecutionProtocol,
  buildNorthstarVerificationExecutionProtocol,
  createNorthstarCreativeDiversityAnchor,
  northstarAuthoringQualityObligations,
} from "@/lib/canvas-ai/northstar-turn-intelligence";
import { buildNorthstarCorrectionPrompt, buildNorthstarDecisionPrompt, buildNorthstarExecutionPrompt } from "@/lib/canvas-ai/northstar-turn-prompts";

function context(runId = "run-intelligence-a") {
  const ledger = createNorthstarEphemeralLedger({
    runId,
    objective: "Investigate the evidence and create the clearest original answer for the user",
    initialStateSnapshot: { artboard: "root" },
  });
  return { ledger, context: createNorthstarLedgerLLMContext(ledger.getSnapshot()) };
}

test("creative diversity anchors vary by run without mapping prompts to layouts", () => {
  const a = createNorthstarCreativeDiversityAnchor(context("run-a").context);
  const b = createNorthstarCreativeDiversityAnchor(context("run-b").context);
  assert.notEqual(a, b);
  assert.equal(a.length, 16);
});

test("decision protocol requires adaptive research, design intelligence, and progressive authorship", () => {
  const { context: ledgerContext } = context();
  const protocol = buildNorthstarAdaptiveDecisionProtocol(ledgerContext);
  assert.match(protocol, /Research is adaptive, not a fixed pipeline/);
  assert.match(protocol, /before the first artboard mutation/);
  assert.match(protocol, /northstar\.design-intelligence-result\.v1/);
  assert.match(protocol, /author progressively on one canonical surface/);
  assert.doesNotMatch(protocol, /Awin|Whop/);
});

test("research contract preserves exact identities and prompt-derived breadth", () => {
  const protocol = buildNorthstarResearchExecutionProtocol();
  assert.match(protocol, /northstar\.research-result\.v1/);
  assert.match(protocol, /number of subjects, flows, screenshots, and research rounds must follow the user's objective/);
  assert.match(protocol, /flow IDs/);
});

test("design intelligence uses the existing universal design system rather than a request template", () => {
  const protocol = buildNorthstarDesignIntelligenceExecutionProtocol(context().context);
  assert.match(protocol, /NORTHSTAR VISUAL IDENTITY/);
  assert.match(protocol, /governingVisualIdea/);
  assert.match(protocol, /alternateDirectionsConsidered/);
  assert.match(protocol, /Do not select a standard dashboard/);
});



test("verification uses a strict latest-HEAD quality contract", () => {
  const protocol = buildNorthstarVerificationExecutionProtocol();
  assert.match(protocol, /northstar\.verification-result\.v1/);
  assert.match(protocol, /Recommend finalize only when every boolean is true/);
  assert.match(protocol, /Do not mutate the artboard/);
});

test("artboard authorship requires one cumulative thesis-to-pixels move", () => {
  const protocol = buildNorthstarArtboardExecutionProtocol(context().context);
  assert.match(protocol, /one bounded, meaningful visible move/);
  assert.match(protocol, /geometry, hierarchy, scale, rhythm/);
  assert.match(protocol, /one living design process/);
});

test("turn prompts embed adaptive intelligence according to task kind", () => {
  const { ledger, context: ledgerContext } = context();
  const decision = buildNorthstarDecisionPrompt({
    protocolVersion: "northstar.turn.v1",
    requestId: "request-decision-1",
    type: "decide-next-activity",
    ledgerContext,
  });
  assert.match(decision.systemInstruction, /NORTHSTAR ADAPTIVE ORCHESTRATION/);

  const task = ledger.createTask({
    kind: "analysis",
    intent: "Originate the next visual direction",
    expectedOutcome: "A grounded design-intelligence result",
    executionInput: { mode: "design-intelligence" },
  });
  const attempt = ledger.startAttempt(task.id);
  const execution = buildNorthstarExecutionPrompt({
    protocolVersion: "northstar.turn.v1",
    requestId: "request-execution-1",
    type: "execute-task-attempt",
    ledgerContext: createNorthstarLedgerLLMContext(ledger.getSnapshot()),
    task: ledger.getSnapshot().activeTask!,
    attempt: ledger.getSnapshot().attempts.find((item) => item.id === attempt.id)!,
  });
  assert.match(execution.systemInstruction, /DESIGN INTELLIGENCE RESULT CONTRACT/);
});


test("correction prompting distinguishes invalid tool input from invalid model output", () => {
  const { ledger } = context("run-correction-contract");
  const task = ledger.createTask({
    kind: "research",
    intent: "Select representative onboarding evidence",
    expectedOutcome: "Exact flow and screenshot identities",
    executionInput: {
      toolCalls: [{ name: "prepare_composition_evidence", args: { appNames: ["Awin", "Whop"] } }],
    },
  });
  const attempt = ledger.startAttempt(task.id);
  ledger.recordAttemptFailure(task.id, attempt.id, {
    kind: "correctable",
    code: "MODEL_OUTPUT_INVALID",
    detail: "The research result did not match the required schema.",
    phase: "execution",
  });
  const snapshot = ledger.getSnapshot();
  const prompt = buildNorthstarCorrectionPrompt({
    protocolVersion: "northstar.turn.v1",
    requestId: "request-correction-1",
    type: "correct-active-task",
    ledgerContext: createNorthstarLedgerLLMContext(snapshot),
    task: snapshot.activeTask!,
    latestAttempt: snapshot.attempts.at(-1)!,
  });
  assert.match(prompt.systemInstruction, /For MODEL_OUTPUT_INVALID, preserve the same successful tool\/evidence input/);
  assert.match(prompt.systemInstruction, /Do not repeat unchanged input only when the failure proves that input itself is invalid or empty/);
});

test("visual tenant objectives cannot finalize before evidence, design intelligence, and a verified artboard commit", () => {
  const ledger = createNorthstarEphemeralLedger({
    runId: "run-visual-obligations",
    objective: "Build a visual canvas comparing onboarding flows and screenshots and leave the working surface visible so I can see the progression",
    initialStateSnapshot: { artboard: "H0" },
  });
  const obligations = northstarAuthoringQualityObligations(
    createNorthstarLedgerLLMContext(ledger.getSnapshot()),
  );
  assert.ok(obligations.some((item) => /design-intelligence/.test(item)));
  assert.ok(obligations.some((item) => /browser-verify/.test(item)));
  assert.ok(obligations.some((item) => /at least two verified artboard commits/.test(item)));
  assert.ok(obligations.some((item) => /exact tenant/.test(item)));
  assert.ok(obligations.some((item) => /screenshot-grounded/.test(item)));
});

test("a written objective is not forced to create an artboard", () => {
  const ledger = createNorthstarEphemeralLedger({
    runId: "run-written-obligations",
    objective: "Write a concise executive answer about pricing strategy",
    initialStateSnapshot: { notes: [] },
  });
  const obligations = northstarAuthoringQualityObligations(
    createNorthstarLedgerLLMContext(ledger.getSnapshot()),
  );
  assert.deepEqual(obligations, []);
});
