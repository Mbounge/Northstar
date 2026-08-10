import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildNorthstarCompactDesignTurnSystemInstruction,
  buildNorthstarDesignResetSystemInstruction,
  sanitizeNorthstarObjectiveDecisionResponse,
} from "../lib/canvas-ai/northstar-two-turn-design-reset";

test("the universal design instruction requires one observed action at a time", () => {
  const instruction = buildNorthstarDesignResetSystemInstruction();
  assert.match(instruction, /Every artboard turn is singular/);
  assert.match(instruction, /browser will render and measure it/);
  assert.match(instruction, /Replan from what actually happened/);
  assert.doesNotMatch(instruction, /whole coordinated change in one mutation/);
});

test("the compact reason step treats browser rejection as measured provisional evidence", () => {
  const instruction = buildNorthstarCompactDesignTurnSystemInstruction();
  assert.match(instruction, /provisional browser transaction/);
  assert.match(instruction, /reject and roll back/);
  assert.match(instruction, /browserReceipt as an exact measurement/);
  assert.match(instruction, /Do not repeat an executable action/);
  assert.match(instruction, /placementFeasibility\.requiredForCurrentObjective/);
  assert.match(instruction, /candidateSlots/);
  assert.match(instruction, /create adequate space or grow the artboard/);
  assert.match(instruction, /connectors and grouping-only changes do not require a placement slot/i);
  assert.match(instruction, /When requiredForCurrentObjective is false/);
  assert.doesNotMatch(instruction, /reviewer/i);
});

test("completion is accepted only against the exact current browser revision", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: {
      turn: 1,
      observedBaseRevisionId: "stale-revision",
      understanding: "The requested state is visible.",
      objectivePlan: {
        objectiveSummary: "Create the requested state.",
        plannedActions: [],
        completedActions: ["Created it."],
      },
      decision: "objective-complete",
      completionRationale: "The browser shows the requested state.",
      completionEvidence: {
        observedRevisionId: "stale-revision",
        satisfiedSignals: ["The requested state is visible."],
        remainingIssues: [],
      },
    },
    turn: 1,
    baseRevisionId: "current-revision",
  }), /instead of current revision/);
});

test("completion is rejected while the model still sees unresolved issues", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: {
      turn: 1,
      observedBaseRevisionId: "current-revision",
      understanding: "The content exists but still overlaps evidence.",
      objectivePlan: {
        objectiveSummary: "Create the requested state.",
        plannedActions: [],
        completedActions: ["Created it."],
      },
      decision: "objective-complete",
      completionRationale: "Most of the requested state is visible.",
      completionEvidence: {
        observedRevisionId: "current-revision",
        satisfiedSignals: ["The content exists."],
        remainingIssues: ["The content overlaps evidence."],
      },
    },
    turn: 1,
    baseRevisionId: "current-revision",
  }), /declared completion with unresolved issues/);
});

test("completion evidence cannot refer to an earlier observed revision", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: {
      turn: 2,
      observedBaseRevisionId: "current-revision",
      understanding: "The latest browser revision is visible.",
      objectivePlan: {
        objectiveSummary: "Create the requested state.",
        plannedActions: [],
        completedActions: ["Inserted the requested object."],
      },
      decision: "objective-complete",
      completionRationale: "The earlier revision showed the requested state.",
      completionEvidence: {
        observedRevisionId: "previous-revision",
        satisfiedSignals: ["The requested object existed previously."],
        remainingIssues: [],
      },
    },
    turn: 2,
    baseRevisionId: "current-revision",
  }), /Completion evidence observed revision/);
});

const executableDecision = (operations: Array<Record<string, unknown>>) => ({
  turn: 1,
  observedBaseRevisionId: "current-revision",
  understanding: "Apply only the next operation and observe it.",
  objectivePlan: {
    objectiveSummary: "Make the requested visual change.",
    plannedActions: ["Apply one operation."],
    completedActions: [],
  },
  decision: "execute-action",
  action: {
    actionId: "one-operation",
    intent: "Apply one operation.",
    successSignal: "The browser reports the changed node.",
  },
  grounding: {
    conceptId: "research",
    resolvedNodeId: "evidence",
    requestedRelation: "below",
    placementSpace: "artboard-world",
    referenceContinuity: "pixel-stable",
    expansionDirection: "none",
    evidenceNodeIds: ["evidence"],
    expectedPreservedNodeIds: ["evidence"],
    interpretation: "The evidence region is the spatial reference.",
  },
  mutation: {
    title: "One operation",
    description: "Apply one observable operation.",
    visualStrategy: "Preserve the current composition.",
    visibleChange: "One node changes.",
    geometryIntent: "preserve",
    transitionMs: 120,
    operations,
  },
});

test("an observed design turn rejects more than one mutation operation", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: executableDecision([
      { op: "set-text", targetId: "first", text: "First" },
      { op: "set-text", targetId: "second", text: "Second" },
    ]),
    turn: 1,
    baseRevisionId: "current-revision",
  }), /exactly one mutation operation/);
});

test("a grounding label does not force a spatial relation onto an unrelated operation", () => {
  const decision = sanitizeNorthstarObjectiveDecisionResponse({
    raw: executableDecision([
      { op: "set-text", targetId: "existing-label", text: "Updated" },
    ]),
    turn: 1,
    baseRevisionId: "current-revision",
  });
  assert.equal(decision.decision, "execute-action");
});

test("the active queue observes each applied action before another model decision", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("async function runSingularObservedDesignObjectiveQueue");
  const end = route.indexOf("function sanitizeObservation", start);
  assert.ok(start >= 0 && end > start);
  const loop = route.slice(start, end);
  assert.match(loop, /for \(const \[objectiveOffset, instruction\] of objectives\.entries\(\)\)/);
  assert.match(loop, /for \(let objectiveTurn = 1;/);
  assert.match(loop, /currentPackage = dispatch\.artifact;/);
  assert.match(loop, /revisionId: currentPackage\.revisionId/);
  assert.match(loop, /design\.objective_turn\.contract_rejected/);
  assert.match(loop, /buildNorthstarCompactDesignTurnContext/);
  assert.match(loop, /parts: \[\{ text: JSON\.stringify\(modelInput\) \}\]/);
  assert.match(loop, /maxOutputTokens: 6_000/);
  assert.doesNotMatch(loop, /LAST DESIGN TURN OUTCOME \(authoritative/);
  assert.doesNotMatch(loop, /buildNorthstarDesignResetModelInput\(\{/);
  assert.match(loop, /design\.model_usage_summary/);
  assert.match(loop, /meaningfulChangedNodeIds/);
  assert.match(loop, /observedTurns\.push/);
  assert.doesNotMatch(loop, /observedActionChannels/);
  assert.doesNotMatch(loop, /non_convergent_action/);
  assert.match(loop, /if \(northstarProviderInterruption\(error\)\) throw error/);
  assert.doesNotMatch(loop, /NORTHSTAR_ARTBOARD_BENCHMARK_OBJECTIVES/);
  assert.match(route, /await runSingularObservedDesignObjectiveQueue\(\{/);
});

test("a verified provisional rejection is observed once before a materially different action", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("async function runSingularObservedDesignObjectiveQueue");
  const end = route.indexOf("function sanitizeObservation", start);
  assert.ok(start >= 0 && end > start);
  const loop = route.slice(start, end);
  const contractFailure = loop.slice(
    loop.indexOf('callbacks.trace?.("design.objective_turn.contract_rejected"'),
    loop.indexOf("priorPlan = decision.objectivePlan"),
  );
  const executionFailure = loop.slice(
    loop.indexOf('if (dispatch.status === "execution-failed")'),
    loop.indexOf("currentPackage = dispatch.artifact"),
  );
  assert.match(contractFailure, /break;/);
  assert.doesNotMatch(contractFailure, /continue;/);
  assert.match(executionFailure, /safelyRestored/);
  assert.match(executionFailure, /compactRejectedBrowserReceipt/);
  assert.match(executionFailure, /browserReceipt: receipt/);
  assert.match(executionFailure, /if \(!rejectedAcknowledgement \|\| !safelyRestored\) break;/);
  assert.match(executionFailure, /continue;/);
  assert.match(loop, /rejectedActionFingerprints\.has\(actionFingerprint\)/);
  assert.match(loop, /design\.objective_turn\.duplicate_rejected_action/);
  assert.match(loop, /if \(northstarProviderInterruption\(error\)\) throw error/);
});

test("linear design uses the existing provisional transaction as an operational feasibility gate", () => {
  const runtime = readFileSync(new URL("../lib/canvas-artifacts/runtime-document.ts", import.meta.url), "utf8");
  const start = runtime.indexOf("const afterVisualSafety = visualSafetySnapshot()");
  const end = runtime.indexOf("if (rejectedReason)", start);
  assert.ok(start >= 0 && end > start);
  const gate = runtime.slice(start, end);
  const visualSafetyCall = gate.slice(0, gate.indexOf("const pixelStableReason"));
  assert.match(visualSafetyCall, /visualSafetyFailure\([\s\S]*?afterVisualSafety,\s*\)/);
  assert.doesNotMatch(visualSafetyCall, /linearDesignExecution/);
  assert.match(gate, /const operationalFeasibilityReason = pixelStableReason/);
  assert.match(gate, /\|\| visualSafetyReason/);
  assert.match(gate, /Required evidence assets did not load/);
  assert.match(gate, /\|\| hardIssueReason/);
  assert.ok(gate.indexOf(": operationalFeasibilityReason") < gate.indexOf(": linearDesignExecution"));
});

test("legacy repair-loop architecture is absent from the active route", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /async function runProductionDesignObjectiveQueue/);
  assert.doesNotMatch(route, /northstar-observed-action-ledger/);
  assert.doesNotMatch(route, /design\.objective_turn\.non_convergent_action/);
});
