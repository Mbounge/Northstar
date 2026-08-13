import assert from "node:assert/strict";
import test from "node:test";

import {
  completeCanvasV2Loop,
  createCanvasV2Loop,
  failCanvasV2Loop,
  recordCanvasV2CommittedEdit,
  stopCanvasV2Loop,
} from "@/lib/canvas-v2/design-loop";

const creativeDirection = {
  designIntent: "Clarify the story.",
  visualThesis: "One continuous editorial argument.",
  compositionStrategy: "Move from frame to evidence to implication.",
  visualLanguage: "Warm white, black type, violet signal.",
  evidenceStrategy: "Preserve complete evidence.",
  currentFocus: "Strengthen hierarchy.",
  nextMoves: ["Develop analysis"],
};
const reflection = {
  observedResult: "The current render is stable.",
  remainingOpportunity: "The hierarchy can improve.",
  nextMoveReason: "The next edit will advance the argument.",
};
const spatialStrategy = {
  growthDirection: "vertical" as const,
  layoutSystem: "Editorial grid.",
  primaryAnchor: "Top-left title.",
  hierarchyAndScale: "One dominant title.",
  spacingRhythm: "12px-based rhythm.",
  relationshipLogic: "Shared alignment rails.",
  currentAdjustment: "Open the layout.",
  intentionalOverlaps: [],
};

test("each rendered edit advances one observed turn", () => {
  const started = createCanvasV2Loop({ id: "run-1", instruction: "Recompose the board" });
  const rendering = { ...started, status: "rendering" as const };
  const continued = recordCanvasV2CommittedEdit({
    loop: rendering,
    revisionId: "revision-2",
    moveKind: "composition",
    summary: "Opened the layout.",
    expectedVisualResult: "A clearer hierarchy.",
    creativeDirection,
    spatialStrategy,
    reflection,
    maxEdits: 3,
  });
  assert.equal(continued.status, "thinking");
  assert.deepEqual(continued.steps.map((step) => [step.turn, step.revisionId]), [[1, "revision-2"]]);
  assert.equal(continued.creativeDirection?.visualThesis, creativeDirection.visualThesis);
  assert.equal(continued.spatialStrategy?.layoutSystem, spatialStrategy.layoutSystem);
});

test("the edit limit stops continuation on the last committed revision", () => {
  const started = createCanvasV2Loop({ id: "run-1", instruction: "Recompose" });
  const limited = recordCanvasV2CommittedEdit({
    loop: { ...started, status: "rendering" },
    revisionId: "revision-2",
    moveKind: "refinement",
    summary: "Edited.",
    expectedVisualResult: "Changed.",
    creativeDirection,
    spatialStrategy,
    reflection,
    maxEdits: 1,
  });
  assert.equal(limited.status, "edit-limit-reached");
  assert.equal(limited.steps.at(-1)?.revisionId, "revision-2");
});

test("continuation starts a fresh bounded run while preserving design direction", () => {
  const priorStep = {
    turn: 8,
    revisionId: "revision-research",
    kind: "research" as const,
    moveKind: "research" as const,
    summary: "Grounded the final required flow.",
    expectedVisualResult: "Both complete evidence lanes are visible.",
    creativeDirection,
    spatialStrategy,
    reflection,
  };
  const continued = createCanvasV2Loop({
    id: "run-2",
    instruction: "Recompose",
    continuation: {
      previousRunId: "run-1",
      priorSteps: [priorStep],
      creativeDirection,
      spatialStrategy,
      researchTargets: ["Awin", "Ghost"],
      researchMode: "synthesis",
    },
  });
  assert.equal(continued.status, "thinking");
  assert.equal(continued.continuationOf, "run-1");
  assert.deepEqual(continued.steps, []);
  assert.deepEqual(continued.priorSteps, [priorStep]);
  assert.equal(continued.creativeDirection?.visualThesis, creativeDirection.visualThesis);
  assert.equal(continued.spatialStrategy?.layoutSystem, spatialStrategy.layoutSystem);
  assert.deepEqual(continued.researchTargets, ["Awin", "Ghost"]);
  assert.equal(continued.researchMode, "synthesis");
});

test("completion, stop, and failure are terminal without synthetic repair", () => {
  const started = createCanvasV2Loop({ id: "run-1", instruction: "Recompose" });
  const completed = completeCanvasV2Loop(started, "Done", creativeDirection, spatialStrategy, reflection);
  assert.equal(completed.status, "completed");
  assert.equal(completed.finalReflection?.observedResult, reflection.observedResult);
  assert.equal(stopCanvasV2Loop(started).status, "stopped");
  assert.deepEqual(failCanvasV2Loop(started, "Provider unavailable"), {
    ...started,
    status: "failed",
    error: "Provider unavailable",
  });
});
