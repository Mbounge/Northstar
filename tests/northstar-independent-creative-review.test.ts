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
    publicationReady: false,
    governingVisualIdeaAssessment: "The hierarchy is present, but the governing idea is not yet carried through the ending.",
    evidenceTransformationAssessment: "The evidence is curated, but the final proof-to-implication relationship remains incomplete.",
    containerAndSurfaceAssessment: "The open surface is used well and containers are restrained.",
    originalityAssessment: "The visual argument is problem-specific rather than a generic dashboard.",
    mediumFitnessAssessment: "The spatial evidence path is a better fit than a dashboard or forced chart.",
    precisionAndLegibilityAssessment: "Labels and evidence connectors are readable and correctly anchored at rendered scale.",
    governingIdeaFidelityAssessment: "The rendered geometry visibly realizes the authored tension-path concept.",
    memorableAuthorshipAssessment: "The continuous evidence path is distinctive and specific to this problem.",
    universalQualityBarMet: false,
    structuralBlockers: ["The evidence sequence does not resolve into the final implication."],
    rationale: "The open ending weakens the user-facing decision despite the strong hierarchy.",
  });
  assert.equal(review.materialImprovementAvailable, true);
  assert.equal(review.publicationReady, false);
  assert.equal(review.universalQualityBarMet, false);
  assert.equal(review.structuralBlockers.length, 1);
  assert.equal(review.unresolvedProblems.length, 1);
});
