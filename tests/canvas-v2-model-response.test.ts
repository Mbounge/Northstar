import assert from "node:assert/strict";
import test from "node:test";

import { parseCanvasV2DesignDecision } from "@/lib/canvas-v2/model-response";

const creativeDirection = {
  designIntent: "Make the comparison clear.",
  visualThesis: "Two paths with one shared question.",
  compositionStrategy: "Use an editorial sequence.",
  visualLanguage: "Warm white, strong type, restrained violet.",
  evidenceStrategy: "Keep source flows complete.",
  currentFocus: "Establish the frame.",
  nextMoves: ["Develop the analysis"],
};
const reflection = {
  observedResult: "The current surface is readable.",
  remainingOpportunity: "The hierarchy can be stronger.",
  nextMoveReason: "A compositional edit will clarify the argument.",
};
const spatialStrategy = {
  growthDirection: "vertical" as const,
  layoutSystem: "A clear editorial grid.",
  primaryAnchor: "The title anchors the top-left.",
  hierarchyAndScale: "One dominant title with readable supporting text.",
  spacingRhythm: "Use a consistent 12px-based rhythm.",
  relationshipLogic: "Shared rails connect related evidence.",
  currentAdjustment: "Strengthen the two-column alignment.",
  intentionalOverlaps: [],
};

test("parses a complete full-source edit", () => {
  const decision = parseCanvasV2DesignDecision({
    decision: "edit",
    moveKind: "composition",
    creativeDirection,
    spatialStrategy,
    reflection,
    summary: "Recomposed the artboard.",
    expectedVisualResult: "A clear two-column composition.",
    document: { html: "<main>Safe</main>", css: "main { display: grid; }" },
  });
  assert.equal(decision.decision, "edit");
  if (decision.decision === "edit") assert.equal(decision.document.html, "<main>Safe</main>");
});

test("rejects executable generated source", () => {
  assert.throws(() => parseCanvasV2DesignDecision({
    decision: "edit",
    moveKind: "composition",
    creativeDirection,
    spatialStrategy,
    reflection,
    summary: "Unsafe",
    expectedVisualResult: "Unsafe",
    document: { html: "<script>alert(1)</script>", css: "" },
  }), /prohibited executable/);
});

test("accepts only exact approved evidence bindings", () => {
  const value = {
    decision: "edit",
    moveKind: "analysis",
    creativeDirection,
    spatialStrategy,
    reflection,
    summary: "Used grounded evidence.",
    expectedVisualResult: "The approved screenshot is visible.",
    document: {
      html: '<img data-canvas-v2-node-id="screen-1-node" data-canvas-v2-evidence-id="screen-1" src="https://evidence.test/screen.png" alt="Screen" />',
      css: "img { width: 320px; }",
    },
  };
  assert.equal(parseCanvasV2DesignDecision(value, [{ id: "screen-1", url: "https://evidence.test/screen.png", label: "Screen" }]).decision, "edit");
  assert.throws(() => parseCanvasV2DesignDecision(value, []), /not approved/);
});

test("parses completion with model-authored direction and reflection, not a visual evaluator", () => {
  assert.deepEqual(parseCanvasV2DesignDecision({ decision: "complete", summary: "The requested source is already present.", creativeDirection, spatialStrategy, reflection }), {
    schema: "canvas-v2.decision.v1",
    decision: "complete",
    creativeDirection,
    spatialStrategy,
    reflection,
    summary: "The requested source is already present.",
  });
});

test("requires creative direction, spatial strategy, and rendered reflection on every decision", () => {
  assert.throws(() => parseCanvasV2DesignDecision({ decision: "complete", summary: "Done." }), /Creative direction is required/);
  assert.throws(() => parseCanvasV2DesignDecision({ decision: "complete", summary: "Done.", creativeDirection }), /Spatial strategy is required/);
  assert.throws(() => parseCanvasV2DesignDecision({ decision: "complete", summary: "Done.", creativeDirection, spatialStrategy }), /Rendered reflection is required/);
});
