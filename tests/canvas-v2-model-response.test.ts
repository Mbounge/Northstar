import assert from "node:assert/strict";
import test from "node:test";

import { parseCanvasV2DesignDecision } from "@/lib/canvas-v2/model-response";
import { validateCanvasV2EvidenceContinuity } from "@/lib/canvas-v2/artifact-safety";

const creativeDirection = {
  designIntent: "Make the comparison clear.",
  visualThesis: "Two paths with one shared question.",
  compositionStrategy: "Use an editorial sequence.",
  visualLanguage: "Warm white, strong type, restrained violet.",
  evidenceStrategy: "Keep source flows complete.",
  currentFocus: "Establish the frame.",
  unresolvedOpportunities: ["Develop a meaningful evidence relationship."],
  nextMoves: ["Develop the analysis"],
};
const reflection = {
  observedResult: "The current surface is readable.",
  remainingOpportunity: "The hierarchy can be stronger.",
  conceptRead: "The concept is present but conventional.",
  hierarchyRead: "The title leads, while the analysis is too quiet.",
  evidenceRead: "Evidence remains visible but is not yet analytical.",
  relationshipRead: "No visual relationship is developed yet.",
  legibilityRead: "Body copy is readable at inspection scale.",
  distinctivenessRead: "The composition needs a more specific point of view.",
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

const emptyDocument = { html: '<main data-canvas-v2-node-id="artboard"></main>', css: "" };

test("parses a bounded source-patch edit", () => {
  const decision = parseCanvasV2DesignDecision({
    decision: "edit",
    moveKind: "composition",
    creativeDirection,
    spatialStrategy,
    reflection,
    summary: "Recomposed the artboard.",
    expectedVisualResult: "A clear two-column composition.",
    patch: { operations: [
      { op: "append-html", targetNodeId: "artboard", html: '<section data-canvas-v2-node-id="safe">Safe</section>' },
      { op: "upsert-css", layerId: "composition", css: ".northstar-artboard { display:grid; }" },
    ] },
  }, [], emptyDocument);
  assert.equal(decision.decision, "edit");
  if (decision.decision === "edit") assert.match(decision.document.html, /data-canvas-v2-node-id="safe"/);
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
    patch: { operations: [{ op: "append-html", targetNodeId: "artboard", html: "<script>alert(1)</script>" }] },
  }, [], emptyDocument), /prohibited executable/);
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
    patch: { operations: [{ op: "append-html", targetNodeId: "artboard", html: '<img data-canvas-v2-node-id="screen-1-node" data-canvas-v2-copy-evidence-id="screen-1" alt="Screen">' }] },
  };
  const previous = { html: '<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-node-id="flow-1" data-canvas-v2-canonical-flow="flow:1"><img data-canvas-v2-node-id="flow-1-screen-1" data-canvas-v2-evidence-id="screen-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/screen.png"></article></main>', css: "" };
  assert.equal(parseCanvasV2DesignDecision(value, [{ id: "screen-1", url: "https://evidence.test/screen.png", label: "Screen" }], previous).decision, "edit");
  assert.throws(() => parseCanvasV2DesignDecision(value, [], previous), /not grounded/);
});

test("repairs omitted analytical image identities without changing model-authored layout", () => {
  const approved = [{ id: "screen-1", url: "https://evidence.test/screen.png", label: "Screen" }];
  const previous = {
    html: '<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-node-id="flow-1" data-canvas-v2-canonical-flow="flow:1"><img data-canvas-v2-node-id="flow-1-screen-1" data-canvas-v2-evidence-id="screen-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/screen.png"></article></main>',
    css: ".analysis { display:grid; }",
  };
  const decision = parseCanvasV2DesignDecision({
    decision: "edit",
    moveKind: "analysis",
    creativeDirection,
    spatialStrategy,
    reflection,
    summary: "Added a grounded inspection.",
    expectedVisualResult: "The copied screen is visible in the analysis.",
    patch: { operations: [{ op: "insert-after", targetNodeId: "flow-1", html: '<section class="analysis" data-canvas-v2-node-id="analysis"><img data-canvas-v2-node-id="analysis-screen-1" data-canvas-v2-copy-evidence-id="screen-1" alt="Inspection"></section>' }] },
  }, approved, previous);
  assert.equal(decision.decision, "edit");
  if (decision.decision !== "edit") return;
  assert.match(decision.document.html, /data-canvas-v2-node-id="analysis-screen-1"/);
  assert.match(decision.document.html, /data-canvas-v2-evidence-role="analysis-copy"/);
  assert.match(decision.document.html, /data-canvas-v2-source-node-id="flow-1-screen-1"/);
  assert.match(decision.document.html, /<section class="analysis"/);
  assert.deepEqual(validateCanvasV2EvidenceContinuity(previous, decision.document, approved), []);
});

test("parses completion with model-authored direction and reflection, not a visual evaluator", () => {
  const resolvedDirection = { ...creativeDirection, unresolvedOpportunities: [], nextMoves: [] };
  const resolvedReflection = { ...reflection, remainingOpportunity: "none" };
  assert.deepEqual(parseCanvasV2DesignDecision({ decision: "complete", summary: "The requested source is already present.", creativeDirection: resolvedDirection, spatialStrategy, reflection: resolvedReflection }), {
    schema: "canvas-v2.decision.v1",
    decision: "complete",
    creativeDirection: resolvedDirection,
    spatialStrategy,
    reflection: resolvedReflection,
    summary: "The requested source is already present.",
  });
});

test("completion rejects unresolved model-authored visual opportunities", () => {
  assert.throws(() => parseCanvasV2DesignDecision({
    decision: "complete",
    summary: "Done.",
    creativeDirection: { ...creativeDirection, nextMoves: [] },
    spatialStrategy,
    reflection,
  }), /unresolved opportunity|remaining model-authored visual opportunities/);
});

test("requires creative direction, spatial strategy, and rendered reflection on every decision", () => {
  assert.throws(() => parseCanvasV2DesignDecision({ decision: "complete", summary: "Done." }), /Creative direction is required/);
  assert.throws(() => parseCanvasV2DesignDecision({ decision: "complete", summary: "Done.", creativeDirection }), /Spatial strategy is required/);
  assert.throws(() => parseCanvasV2DesignDecision({ decision: "complete", summary: "Done.", creativeDirection, spatialStrategy }), /Rendered reflection is required/);
});
