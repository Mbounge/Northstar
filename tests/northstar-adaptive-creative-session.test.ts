import assert from "node:assert/strict";
import test from "node:test";
import {
  NorthstarAdaptiveCreativeSession,
  assessNorthstarAdaptiveReadiness,
  northstarAdaptiveCreativeBudget,
} from "@/lib/canvas-ai/northstar-adaptive-creative-session";
import type { NorthstarSceneAssessment } from "@/lib/canvas-ai/northstar-continuous-visual-authorship";

function assessment(overrides: Partial<NorthstarSceneAssessment> = {}): NorthstarSceneAssessment {
  return {
    revisionId: "revision-1",
    publicationState: "working",
    transactionState: "materialized",
    rootNodePresent: true,
    canonicalSurfacePresent: true,
    visualThesisPresent: true,
    groundedEvidencePresent: true,
    evidenceHierarchyPresent: true,
    reasoningTheatrePresent: true,
    reasoningTheatreHorizontal: true,
    activeHypothesisPresent: true,
    hypothesisTested: true,
    hypothesisResolvedOrPromoted: true,
    relationshipPresent: true,
    synthesisPresent: true,
    contextualResolutionPresent: true,
    geometryVerified: true,
    processSettled: false,
    publicationClean: false,
    duplicateSemanticIds: [],
    unresolved: [],
    ...overrides,
  };
}

test("thinking levels change persistence budgets without defining visual vocabulary", () => {
  const low = northstarAdaptiveCreativeBudget("low");
  const medium = northstarAdaptiveCreativeBudget("medium");
  const high = northstarAdaptiveCreativeBudget("high");
  assert.equal(low.requiresAcceptedCreativeAct, true);
  assert.equal(medium.requiresAcceptedCreativeAct, true);
  assert.equal(high.requiresAcceptedCreativeAct, true);
  assert.ok(low.maximumAcceptedActs < medium.maximumAcceptedActs);
  assert.ok(medium.maximumAcceptedActs < high.maximumAcceptedActs);
  assert.ok(low.maximumElapsedMs < high.maximumElapsedMs);
  assert.equal(low.authoringOutputTokens, high.authoringOutputTokens);
  assert.equal(medium.authoringOutputTokens, high.authoringOutputTokens);
  assert.equal(low.independentReviewOutputTokens, high.independentReviewOutputTokens);
  assert.equal("visualFamily" in low, false);
  assert.equal("archetype" in high, false);
});

test("operational readiness is separate from open-ended creative advisory observations", () => {
  const readiness = assessNorthstarAdaptiveReadiness(assessment({
    evidenceHierarchyPresent: false,
    relationshipPresent: false,
  }));
  assert.equal(readiness.operationallyReady, true);
  assert.equal(readiness.advisoryObservations.length > 0, true);
  assert.equal(readiness.blockingObservations.length, 0);
});

test("the adaptive session can settle after one exceptional accepted and operationally settled render", () => {
  const session = new NorthstarAdaptiveCreativeSession("high", 1_000);
  session.noteAttempt();
  session.recordAcceptedAct({
    revisionId: "revision-2",
    fingerprint: "fingerprint-1",
    intention: "Clarify the central argument",
    viewerUnderstanding: "The evidence now resolves into one conclusion",
    visibleChange: "The composition becomes decisive",
    affectedNodeIds: ["evidence", "synthesis"],
  });
  const critique = {
    summary: "The artifact now communicates clearly.",
    observedEffect: "The argument is immediately legible.",
    whatImproved: ["The evidence and conclusion now read as one visual argument."],
    whatStillWeak: [],
    implementationDefects: [],
    recommendedNextMove: "No further material act is justified.",
    continueWorking: false,
  };
  session.recordCritique("revision-2", critique);
  session.recordIndependentReview("revision-2", {
    interpretation: "The exact render has one unmistakable governing idea and resolves the user request.",
    strongestAspect: "Evidence and conclusion are choreographed as one visual argument.",
    unresolvedProblems: [],
    evidenceCommunicationAssessment: "Grounded proof is curated, legible, and visibly connected to the conclusion.",
    recommendedIntervention: "No mandatory structural intervention remains.",
    materialImprovementAvailable: false,
    publicationReady: true,
    universalQualityBarMet: true,
    governingVisualIdeaAssessment: "The governing idea survives without explanatory prose or container chrome.",
    evidenceTransformationAssessment: "Evidence has been transformed from inventory into purposeful hierarchy and relationships.",
    containerAndSurfaceAssessment: "The surface carries the composition and every remaining boundary earns its role.",
    originalityAssessment: "The result is problem-specific and does not resemble a reusable dashboard or screenshot wall.",
    structuralBlockers: [],
    rationale: "The artifact meets the universal Northstar publication bar.",
  });
  const decision = session.decideContinuation(assessment({
    revisionId: "revision-2",
    processSettled: true,
    publicationClean: true,
  }), critique);
  assert.equal(decision.readyForPublication, true);
  assert.equal(decision.continueWorking, false);
});

test("repeated unchanged failures are counted against the exact committed revision", () => {
  const session = new NorthstarAdaptiveCreativeSession("medium");
  const first = session.recordRejectedAct({
    revisionId: "revision-1",
    fingerprint: "same",
    reason: "Missing target artifact-12345678-1234-1234-1234-123456789012",
  });
  const second = session.recordRejectedAct({
    revisionId: "revision-1",
    fingerprint: "same",
    reason: "Missing target artifact-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  });
  assert.equal(first, 1);
  assert.equal(second, 2);
});


test("low thinking settles after two optional rejected refinements following an accepted act", () => {
  const session = new NorthstarAdaptiveCreativeSession("low");
  session.recordAcceptedAct({
    revisionId: "revision-accepted",
    fingerprint: "accepted",
    intention: "Create the decisive comparison",
    viewerUnderstanding: "The trade-off is clear",
    visibleChange: "The board now has a strategic synthesis",
    affectedNodeIds: ["synthesis"],
  });
  session.recordRejectedAct({ revisionId: "revision-accepted", reason: "First optional refinement was not material" });
  session.assertCanAttempt();
  session.recordRejectedAct({ revisionId: "revision-accepted", reason: "Second optional refinement was not material" });
  assert.throws(
    () => session.assertCanAttempt(),
    /optional-refinement plateau after 2 consecutive rejected acts/,
  );
});

test("deeper thinking levels preserve a larger optional refinement budget", () => {
  const medium = new NorthstarAdaptiveCreativeSession("medium");
  medium.recordAcceptedAct({
    revisionId: "revision-accepted", fingerprint: "accepted", intention: "Improve",
    viewerUnderstanding: "Clearer", visibleChange: "Changed", affectedNodeIds: ["synthesis"],
  });
  medium.recordRejectedAct({ revisionId: "revision-accepted", reason: "one" });
  medium.recordRejectedAct({ revisionId: "revision-accepted", reason: "two" });
  medium.assertCanAttempt();
  medium.recordRejectedAct({ revisionId: "revision-accepted", reason: "three" });
  assert.throws(() => medium.assertCanAttempt(), /optional-refinement plateau after 3/);

  const high = northstarAdaptiveCreativeBudget("high");
  assert.equal(high.maximumOptionalConsecutiveRejectionsAfterAccepted, 4);
});
