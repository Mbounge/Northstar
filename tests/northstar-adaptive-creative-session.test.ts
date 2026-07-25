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

test("the adaptive session can settle after one exceptional accepted render regardless of thinking level", () => {
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
    recommendedNextMove: "No further material act is justified.",
    continueWorking: false,
  };
  session.recordCritique("revision-2", critique);
  const decision = session.decideContinuation(assessment({ revisionId: "revision-2" }), critique);
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
