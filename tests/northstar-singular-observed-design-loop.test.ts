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
  assert.match(instruction, /semantic visual intent, not by primitive DOM operation count/);
  assert.match(instruction, /complete self-contained composition/);
  assert.match(instruction, /Do not split a container from its contents/);
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
        verifiedNodeIds: ["evidence"],
        measuredFacts: ["The browser measured the requested state."],
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
        verifiedNodeIds: ["evidence"],
        measuredFacts: ["The browser measured an overlap with evidence."],
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
        verifiedNodeIds: ["evidence"],
        measuredFacts: ["The previous browser revision contained the object."],
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

const identityAuthority = {
  browserRevisionId: "current-revision",
  knownNodeIds: ["evidence", "existing-label", "first", "second"],
  knownRegionIds: ["research"],
  knownConceptIds: ["research"],
  knownAuthoredRelationIds: ["relationship-connector-01"],
  protectedEvidenceNodeIds: ["evidence"],
};

test("completion requires browser-measured facts", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: {
      turn: 1,
      observedBaseRevisionId: "current-revision",
      understanding: "The requested state appears present.",
      objectivePlan: {
        objectiveSummary: "Create the requested state.",
        plannedActions: [],
        completedActions: ["Created it."],
      },
      decision: "objective-complete",
      completionRationale: "The requested state appears present.",
      completionEvidence: {
        observedRevisionId: "current-revision",
        satisfiedSignals: ["The requested state appears present."],
        remainingIssues: [],
        verifiedNodeIds: ["evidence"],
        measuredFacts: [],
      },
    },
    turn: 1,
    baseRevisionId: "current-revision",
    identityAuthority,
  }), /current browser measurements/);
});

test("completion cannot invent a verified browser identity", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: {
      turn: 1,
      observedBaseRevisionId: "current-revision",
      understanding: "The requested state is measured and present.",
      objectivePlan: {
        objectiveSummary: "Create the requested state.",
        plannedActions: [],
        completedActions: ["Created it."],
      },
      decision: "objective-complete",
      completionRationale: "The browser measured the requested state.",
      completionEvidence: {
        observedRevisionId: "current-revision",
        satisfiedSignals: ["The requested state is present."],
        remainingIssues: [],
        verifiedNodeIds: ["invented-node"],
        measuredFacts: ["The browser measured the requested state."],
      },
    },
    turn: 1,
    baseRevisionId: "current-revision",
    identityAuthority,
  }), /unknown browser identity/);
});

test("an executable action cannot invent its resolved browser identity", () => {
  const raw = executableDecision([
    { op: "set-text", targetId: "existing-label", text: "Updated" },
  ]);
  raw.grounding.resolvedNodeId = "invented-node";
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw,
    turn: 1,
    baseRevisionId: "current-revision",
    identityAuthority,
  }), /unknown referent/);
});

test("an observed design turn accepts one complete newly authored composition", () => {
  const decision = sanitizeNorthstarObjectiveDecisionResponse({
    raw: executableDecision([
      {
        op: "insert-html",
        targetId: "analysis-region",
        position: "beforeend",
        html: '<section data-ns-node-id="analysis-card"><h3 data-ns-node-id="analysis-title">Analysis</h3></section>',
      },
      { op: "set-text", targetId: "analysis-title", text: "Role selection friction" },
    ]),
    turn: 1,
    baseRevisionId: "current-revision",
  });
  assert.equal(decision.decision, "execute-action");
  assert.equal(decision.mutation.operations.length, 2);
});

test("an observed design turn rejects multiple unrelated existing-node edits", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: executableDecision([
      { op: "set-text", targetId: "first", text: "First" },
      { op: "set-text", targetId: "second", text: "Second" },
    ]),
    turn: 1,
    baseRevisionId: "current-revision",
  }), /one coherent visual action/);
});

test("space creation and insertion require separate browser-observed actions", () => {
  assert.throws(() => sanitizeNorthstarObjectiveDecisionResponse({
    raw: executableDecision([
      { op: "request-space", bottom: 320 },
      {
        op: "insert-html",
        targetId: "analysis-region",
        position: "beforeend",
        html: '<section data-ns-node-id="analysis-card">Analysis</section>',
      },
    ]),
    turn: 1,
    baseRevisionId: "current-revision",
  }), /fresh browser observation/);
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
  assert.match(loop, /for \(let objectiveTurn = firstObjectiveTurn;/);
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
  assert.match(loop, /rejectedActionStrategies\.get\(actionStrategyFingerprint\)/);
  assert.match(loop, /design\.objective_turn\.semantic_strategy_blocked/);
  assert.match(loop, /semanticStrategyBlocked: true/);
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

test("design fallback is one overload-only handoff with no retry loop", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("async function callNorthstarDesignJsonWithOverloadFallback");
  const end = route.indexOf("function collectSelectedVisualCandidates", start);
  assert.ok(start >= 0 && end > start);
  const fallback = route.slice(start, end);
  assert.match(route, /NORTHSTAR_DESIGN_PRIMARY_MODEL = GEMINI_MODEL/);
  assert.match(route, /NORTHSTAR_DESIGN_OVERLOAD_FALLBACK_MODEL = "gemini-3\.5-flash-lite"/);
  assert.match(fallback, /attempt: 1/);
  assert.match(fallback, /attempt: 2/);
  assert.match(fallback, /model: NORTHSTAR_DESIGN_OVERLOAD_FALLBACK_MODEL/);
  const fallbackAttempt = fallback.slice(fallback.indexOf('attempt: 2'));
  assert.doesNotMatch(fallbackAttempt, /temperature:/);
  assert.doesNotMatch(fallback, /for \(|while \(|setTimeout|sleep/);
  assert.match(fallback, /status: "paused"/);
});

test("quota, authentication, validation, and schema failures never trigger design fallback", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("function isNorthstarTrueProviderOverload");
  const end = route.indexOf("async function callNorthstarDesignJsonWithOverloadFallback", start);
  assert.ok(start >= 0 && end > start);
  const classifier = route.slice(start, end);
  assert.match(classifier, /quota|rate limit|billing|authentication|permission/);
  assert.match(classifier, /invalid-request|invalid-response|schema/);
  assert.match(classifier, /502|503|504/);
  assert.match(classifier, /cause\.status === 429[\s\S]*return false/);
});

test("an overload pause preserves the exact objective and browser revision", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("async function runSingularObservedDesignObjectiveQueue");
  const end = route.indexOf("function sanitizeObservation", start);
  assert.ok(start >= 0 && end > start);
  const loop = route.slice(start, end);
  assert.match(loop, /design\.objective_loop\.paused/);
  assert.match(loop, /objectiveIndex/);
  assert.match(loop, /instruction/);
  assert.match(loop, /revisionId: currentPackage\.revisionId/);
  assert.match(loop, /pauseCheckpoint = \{/);
  assert.match(loop, /objectiveTurn/);
  assert.match(loop, /designTurnIndex/);
  assert.match(loop, /browserRevisionId: acknowledgement\.browserRevisionId/);
  assert.match(loop, /if \(pauseCheckpoint\) break objectiveLoop/);
  assert.match(loop, /status: "paused"/);
  assert.match(loop, /status: "finished"/);
});

test("provider overload exits through one resumable checkpoint and resumes before research", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const resumeStart = route.indexOf("const activeDesignPause = activeResumeCheckpoint?.designPause");
  const researchStart = route.indexOf("const selectedArtifactDataBundle", resumeStart);
  assert.ok(resumeStart >= 0 && researchStart > resumeStart);
  const resume = route.slice(resumeStart, researchStart);
  assert.match(resume, /resumePause: activeDesignPause/);
  assert.match(resume, /if \(resumed\.status === "paused"\)/);
  assert.match(resume, /pauseDesignObjectiveQueue\(resumed/);
  assert.match(resume, /completeResumedDesignObjectiveQueue\(resumed\.artifact/);
  assert.match(route, /emitCompositionCheckpoint\("building", ledger, toolResults, result\.pause\)/);
  assert.match(route, /if \(designQueueResult\.status === "paused"\)/);
  assert.doesNotMatch(resume, /runRecursiveCompositionResearch|buildCompositionBlueprint/);
});

test("every provisional action is blocked by browser-measured collision clearance and containment before commit", () => {
  const runtime = readFileSync(new URL("../lib/canvas-artifacts/runtime-document.ts", import.meta.url), "utf8");
  const safetyStart = runtime.indexOf("const visualSafetySnapshot = () => {");
  const commitStart = runtime.indexOf("const applyMutationBatch", safetyStart);
  assert.ok(safetyStart >= 0 && commitStart > safetyStart);
  const safety = runtime.slice(safetyStart, commitStart);
  assert.match(safety, /spatialCollisionPairs/);
  assert.match(safety, /spatialClearanceViolations/);
  assert.match(safety, /spatialContainmentViolations/);
  assert.match(safety, /localSemanticClearanceGroupFor/);
  assert.match(safety, /The provisional composition creates browser-measured content collisions/);
  assert.match(safety, /The provisional composition violates browser-measured minimum clearance/);
  assert.match(safety, /The provisional composition places content outside its semantic owner/);

  const provisionalSafety = runtime.indexOf("const afterVisualSafety = visualSafetySnapshot();", commitStart);
  const rejectionBoundary = runtime.indexOf("if (rejectedReason) {", provisionalSafety);
  const rollback = runtime.indexOf("root.innerHTML = acknowledgement.transaction.html", rejectionBoundary);
  const rollbackComplete = runtime.indexOf("endAtomicCandidateValidation", rollback);
  assert.ok(provisionalSafety > commitStart && rejectionBoundary > provisionalSafety && rollback > rejectionBoundary);
  assert.match(runtime.slice(provisionalSafety, rejectionBoundary), /visualSafetyFailure\(/);
  assert.match(runtime.slice(rejectionBoundary, rollbackComplete), /currentRevisionId = rollbackRevisionId/);
});

test("local semantic typography does not masquerade as an inter-object clearance failure", () => {
  const runtime = readFileSync(new URL("../lib/canvas-artifacts/runtime-document.ts", import.meta.url), "utf8");
  const safetyStart = runtime.indexOf("const visualSafetySnapshot = () => {");
  const commitStart = runtime.indexOf("const applyMutationBatch", safetyStart);
  assert.ok(safetyStart >= 0 && commitStart > safetyStart);
  const safety = runtime.slice(safetyStart, commitStart);
  const collisionCheck = safety.indexOf("if (overlapWidth > 2 && overlapHeight > 2 && overlapArea > 16)");
  const localGroupCheck = safety.indexOf("const firstLocalClearanceGroup");
  const clearanceCheck = safety.indexOf("const requiredClearance", localGroupCheck);
  assert.ok(collisionCheck >= 0 && localGroupCheck > collisionCheck && clearanceCheck > localGroupCheck);
  assert.match(safety, /immediateWrapper === spatialOwner/);
  assert.match(safety, /img, video, canvas, svg/);
  assert.match(safety, /firstLocalClearanceGroup === secondLocalClearanceGroup/);
});

test("a rejected spatial composition returns measured obstruction facts to the next reasoning turn", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const receiptStart = route.indexOf("const compactRejectedBrowserReceipt");
  const receiptEnd = route.indexOf("const classifyRejectedBrowserReceipt", receiptStart);
  assert.ok(receiptStart >= 0 && receiptEnd > receiptStart);
  const receipt = route.slice(receiptStart, receiptEnd);
  assert.match(receipt, /spatialCollisionPairs/);
  assert.match(receipt, /spatialClearanceViolations/);
  assert.match(receipt, /spatialContainmentViolations/);

  const classifierEnd = route.indexOf("await callbacks.trace", receiptEnd);
  const classifier = route.slice(receiptEnd, classifierEnd);
  assert.match(classifier, /spatial-collision/);
  assert.match(classifier, /spatial-clearance/);
  assert.match(classifier, /spatial-containment/);
});
