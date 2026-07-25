import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_INDEPENDENT_CREATIVE_REVIEW_JSON_SCHEMA,
  sanitizeNorthstarIndependentCreativeReview,
} from "@/lib/canvas-ai/northstar-independent-creative-review";

test("the independent reviewer uses open language rather than visual options", () => {
  const schema = JSON.stringify(NORTHSTAR_INDEPENDENT_CREATIVE_REVIEW_JSON_SCHEMA);
  for (const forbidden of ["visualFamily", "archetype", "template", "layoutOption", "artboardWidth"]) {
    assert.equal(schema.includes(forbidden), false, forbidden);
  }
});

test("independent creative review sanitization preserves material judgment", () => {
  const review = sanitizeNorthstarIndependentCreativeReview({
    interpretation: "The artifact now argues that trust burden delays activation.",
    strongestAspect: "The strongest proof and conclusion read as one visual argument.",
    unresolvedProblems: ["The lower evidence sequence still lacks a clear ending."],
    evidenceCommunicationAssessment: "The sources remain inspectable and connected to the conclusion.",
    recommendedIntervention: "Resolve the lower sequence into a decisive implication without adding more containers.",
    materialImprovementAvailable: true,
    rationale: "The open ending weakens the user-facing decision despite the strong hierarchy.",
  });
  assert.equal(review.materialImprovementAvailable, true);
  assert.equal(review.unresolvedProblems.length, 1);
});
