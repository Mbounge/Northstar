import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
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
        satisfiedSignals: ["The content exists."],
        remainingIssues: ["The content overlaps evidence."],
      },
    },
    turn: 1,
    baseRevisionId: "current-revision",
  }), /declared completion with unresolved issues/);
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
  const end = route.indexOf("async function runProductionDesignObjectiveQueue", start);
  assert.ok(start >= 0 && end > start);
  const loop = route.slice(start, end);
  assert.match(loop, /for \(const \[objectiveOffset, instruction\] of objectives\.entries\(\)\)/);
  assert.match(loop, /for \(let objectiveTurn = 1;/);
  assert.match(loop, /currentPackage = dispatch\.artifact;/);
  assert.match(loop, /revisionId: currentPackage\.revisionId/);
  assert.match(loop, /design\.objective_turn\.contract_rejected/);
  assert.match(loop, /LAST DESIGN TURN OUTCOME \(authoritative/);
  assert.match(loop, /meaningfulChangedNodeIds/);
  assert.match(loop, /if \(northstarProviderInterruption\(error\)\) throw error/);
  assert.doesNotMatch(loop, /NORTHSTAR_ARTBOARD_BENCHMARK_OBJECTIVES/);
  assert.match(route, /await runSingularObservedDesignObjectiveQueue\(\{/);
});
