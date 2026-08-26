import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasV2VisibleProgressSteps,
  completeCanvasV2Loop,
  createCanvasV2Loop,
  failCanvasV2Loop,
  pauseCanvasV2Loop,
  recoverCanvasV2LoopAfterRejectedCandidate,
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
  unresolvedOpportunities: ["Develop evidence relationships."],
  nextMoves: ["Develop analysis"],
};
const reflection = {
  observedResult: "The current render is stable.",
  remainingOpportunity: "The hierarchy can improve.",
  conceptRead: "The concept is visible.",
  hierarchyRead: "The hierarchy can improve.",
  evidenceRead: "Evidence is intact.",
  relationshipRead: "Relationships can be developed.",
  legibilityRead: "The source is readable.",
  distinctivenessRead: "The composition is not yet resolved.",
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
const islandExecution = {
  target: {
    action: "create" as const,
    islandId: "island-revision-2-1",
    storyRole: "title" as const,
    resultingMaturity: "resolved" as const,
    resolutionRationale: "The title and description are complete.",
    openRequirements: [],
  },
  territory: {
    relation: "above" as const,
    anchorNodeId: "flow-awin",
    intendedFootprint: "Compact upper-left narrative origin.",
    rationale: "Every board needs one explicit beginning.",
    placementMode: "evidence-relative-island" as const,
    targetZoneId: "top-left" as const,
  },
  requiredEvidenceIds: [],
  requiredEvidenceHandles: [],
  requiredVisualRoles: ["narrative-title"],
  directorCheckpointJson: JSON.stringify({ materialMove: "Establish the narrative opening." }),
};
const workingContext = {
  schema: "canvas-v2.working-context.v1" as const,
  scope: "selection" as const,
  selectionPolicy: "modify" as const,
  selectedNodeIds: ["editorial-title"],
  visibleBounds: { x: 1_900, y: 1_200, width: 1_680, height: 945 },
  viewportScale: 0.72,
  visibleNodeIds: ["editorial-title"],
  nearbyNodeIds: ["editorial-title"],
  editableNodeIds: ["editorial-title"],
  protectedNodeIds: [],
  objects: [],
  relationships: [],
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
    islandExecution,
    reflection,
  });
  assert.equal(continued.status, "thinking");
  assert.deepEqual(continued.steps.map((step) => [step.turn, step.revisionId]), [[1, "revision-2"]]);
  assert.equal(continued.creativeDirection?.visualThesis, creativeDirection.visualThesis);
  assert.equal(continued.spatialStrategy?.layoutSystem, spatialStrategy.layoutSystem);
  assert.equal(continued.steps[0]?.islandExecution?.target.islandId, "island-revision-2-1");
  assert.equal(continued.steps[0]?.islandExecution?.directorCheckpointJson, islandExecution.directorCheckpointJson);
});

test("the model can continue beyond the former automatic edit ceiling", () => {
  const started = createCanvasV2Loop({ id: "run-1", instruction: "Recompose" });
  let continued = started;
  for (let index = 0; index < 12; index += 1) continued = recordCanvasV2CommittedEdit({
    loop: { ...continued, status: "rendering" }, revisionId: `revision-${index + 2}`, moveKind: "refinement",
    summary: "Edited.", expectedVisualResult: "Changed.", creativeDirection, spatialStrategy, reflection,
  });
  assert.equal(continued.status, "thinking");
  assert.equal(continued.steps.length, 12);
});

test("the visible timeline preserves every accepted design render and research step", () => {
  const steps = [
    { turn: 1, revisionId: "research-awin", kind: "research" as const, moveKind: "research" as const, summary: "Grounded Awin.", expectedVisualResult: "Awin is visible.", creativeDirection, spatialStrategy, reflection },
    { turn: 2, revisionId: "research-whop", kind: "research" as const, moveKind: "research" as const, summary: "Grounded Whop.", expectedVisualResult: "Whop is visible.", creativeDirection, spatialStrategy, reflection },
    { turn: 3, revisionId: "frame-draft", kind: "design" as const, moveKind: "framing" as const, summary: "Established the opening.", expectedVisualResult: "A title is visible.", creativeDirection, spatialStrategy, reflection, providerAttempts: [{ model: "gpt-5.6-luna", role: "visual-director" as const, attempt: 1, outcome: "completed" as const, durationMs: 1_000 }] },
    { turn: 4, revisionId: "frame-corrected", kind: "design" as const, moveKind: "framing" as const, summary: "Resolved the narrative title.", expectedVisualResult: "The opening is complete.", creativeDirection, spatialStrategy, reflection, providerAttempts: [{ model: "gpt-5.6-luna", role: "source-author" as const, attempt: 1, outcome: "completed" as const, durationMs: 2_000 }] },
    { turn: 5, revisionId: "comparison", kind: "design" as const, moveKind: "composition" as const, summary: "Developed the comparison.", expectedVisualResult: "The comparison is visible.", creativeDirection, spatialStrategy, reflection },
  ];
  const visible = canvasV2VisibleProgressSteps(steps);
  assert.deepEqual(visible.map((step) => [step.revisionId, step.moveKind]), [
    ["research-awin", "research"],
    ["research-whop", "research"],
    ["frame-draft", "framing"],
    ["frame-corrected", "framing"],
    ["comparison", "composition"],
  ]);
  assert.equal(visible[2]?.summary, "Established the opening.");
  assert.equal(visible[3]?.summary, "Resolved the narrative title.");
  assert.deepEqual(visible[2]?.providerAttempts?.map((attempt) => attempt.role), ["visual-director"]);
  assert.deepEqual(visible[3]?.providerAttempts?.map((attempt) => attempt.role), ["source-author"]);
});

test("provider exhaustion pauses on the verified revision and remains continuable", () => {
  const started = createCanvasV2Loop({ id: "run-1", instruction: "Continue the comparison" });
  const paused = pauseCanvasV2Loop(started, "Both providers are temporarily unavailable.");
  assert.equal(paused.status, "paused");
  assert.equal(paused.pauseReason, "Both providers are temporarily unavailable.");
  assert.equal(paused.error, undefined);
});

test("render-rejected private candidates replan internally from committed truth", () => {
  const started = createCanvasV2Loop({ id: "run-recovery", instruction: "Create a workshop." });
  const rendering = {
    ...started,
    status: "rendering" as const,
    renderRepair: {
      attempt: 3,
      maxAttempts: 3,
      failures: ["candidate overlaps the title"],
    },
  };
  const firstRecovery = recoverCanvasV2LoopAfterRejectedCandidate(rendering, ["candidate overlaps the title"], "recompose");
  assert.equal(firstRecovery.status, "thinking");
  assert.equal(firstRecovery.renderRepair, undefined);
  assert.deepEqual(firstRecovery.structuralRecovery, {
    attempt: 1,
    failures: ["candidate overlaps the title"],
    failedActions: ["recompose"],
  });
  const secondRecovery = recoverCanvasV2LoopAfterRejectedCandidate(
    { ...firstRecovery, status: "rendering", renderRepair: { attempt: 3, maxAttempts: 3, failures: ["candidate clips the decision record"] } },
    ["candidate clips the decision record"],
    "repair",
  );
  assert.equal(secondRecovery.status, "thinking");
  assert.deepEqual(secondRecovery.structuralRecovery, {
    attempt: 2,
    failures: ["candidate overlaps the title", "candidate clips the decision record"],
    failedActions: ["recompose", "repair"],
  });
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
      historyTransactionId: "run-1",
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
  assert.equal(continued.historyTransactionId, "run-1");
});

test("selection and viewport authority survive every turn and explicit continuation", () => {
  const started = createCanvasV2Loop({ id: "run-selection", instruction: "Rewrite this heading", workingContext });
  assert.deepEqual(started.workingContext, workingContext);
  const committed = recordCanvasV2CommittedEdit({
    loop: { ...started, status: "rendering" },
    revisionId: "revision-selection",
    moveKind: "refinement",
    summary: "Rewrote the exact selected heading.",
    expectedVisualResult: "Only the heading copy changes.",
    creativeDirection,
    spatialStrategy,
    reflection,
  });
  assert.deepEqual(committed.workingContext, workingContext);
  const continued = createCanvasV2Loop({
    id: "run-selection-continuation",
    instruction: "Continue",
    continuation: { previousRunId: started.id, workingContext },
  });
  assert.deepEqual(continued.workingContext, workingContext);
});

test("completion, stop, and failure are terminal without synthetic repair", () => {
  const started = createCanvasV2Loop({ id: "run-1", instruction: "Recompose" });
  const completed = completeCanvasV2Loop(started, "Done", creativeDirection, spatialStrategy, undefined, reflection);
  assert.equal(completed.status, "completed");
  assert.equal(completed.finalReflection?.observedResult, reflection.observedResult);
  assert.equal(stopCanvasV2Loop(started).status, "stopped");
  assert.deepEqual(failCanvasV2Loop(started, "Provider unavailable"), {
    ...started,
    status: "failed",
    error: "Provider unavailable",
  });
});
