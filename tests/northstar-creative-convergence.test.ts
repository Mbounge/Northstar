import assert from "node:assert/strict";
import test from "node:test";
import { decideNorthstarCreativeConvergence } from "@/lib/canvas-ai/northstar-lifecycle-authority";

const readiness = {
  operationallyReady: true,
  communicativelyReady: true,
  blockingObservations: [],
  advisoryObservations: [],
};

function review(input?: Partial<Parameters<typeof decideNorthstarCreativeConvergence>[0]["independentReview"]>) {
  return {
    interpretation: "The artifact solves the communication problem.",
    strongestAspect: "Its visual argument is decisive.",
    unresolvedProblems: [],
    evidenceCommunicationAssessment: "Grounded proof remains inspectable.",
    recommendedIntervention: "Stop; another act would be decorative.",
    materialImprovementAvailable: false,
    publicationReady: true,
    universalQualityBarMet: true,
    governingVisualIdeaAssessment: "The governing idea is unmistakable in the composition.",
    evidenceTransformationAssessment: "Evidence has been curated and transformed into the argument.",
    containerAndSurfaceAssessment: "Boundaries are sparse and purposeful.",
    originalityAssessment: "The structure belongs to this exact problem.",
    structuralBlockers: [],
    rationale: "No material weakness remains.",
    ...input,
  };
}

const stoppedCritique = {
  summary: "The result is complete.",
  observedEffect: "The argument is immediate and coherent.",
  whatImproved: ["Evidence and implication are connected."],
  whatStillWeak: [],
  implementationDefects: [],
  recommendedNextMove: "No further material act.",
  continueWorking: false,
};

test("publication requires the universal creative quality verdict at every thinking level", () => {
  for (const thinkingDepth of ["low", "medium", "high"] as const) {
    const decision = decideNorthstarCreativeConvergence({
      readiness,
      thinkingDepth,
      acceptedActCount: 2,
      reachedMaximumAcceptedActs: false,
      authorCritique: stoppedCritique,
      independentReview: review(),
      cosmeticDriftWarnings: [],
    });
    assert.equal(decision.readyForPublication, true, thinkingDepth);
    assert.equal(decision.continueWorking, false, thinkingDepth);
    assert.equal(decision.reasonCode, "CREATIVE_QUALITY_CONVERGED");
  }
});

test("Low cannot publish an operationally healthy but generic screenshot inventory", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "low",
    acceptedActCount: 1,
    reachedMaximumAcceptedActs: false,
    authorCritique: stoppedCritique,
    independentReview: review({
      interpretation: "The board is clean but remains a screenshot wall with a thesis card.",
      publicationReady: false,
      materialImprovementAvailable: true,
      structuralBlockers: [
        "The inherited screenshot grid remains the governing composition.",
        "Repeated rectangular containers substitute for a problem-specific spatial idea.",
      ],
    }),
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, true);
  assert.equal(decision.readyForPublication, false);
  assert.equal(decision.reasonCode, "CREATIVE_CLOSURE_ADJUDICATION_REQUIRED");
});

test("Medium continues optional improvements only after the publication bar is already met", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "medium",
    acceptedActCount: 2,
    reachedMaximumAcceptedActs: false,
    authorCritique: stoppedCritique,
    independentReview: review({ materialImprovementAvailable: true }),
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, true);
  assert.equal(decision.readyForPublication, false);
  assert.equal(decision.reasonCode, "REVIEWER_REQUESTED_CONTINUATION");
});

test("Low may converge sooner only after the same publication bar is met", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "low",
    acceptedActCount: 1,
    reachedMaximumAcceptedActs: false,
    authorCritique: stoppedCritique,
    independentReview: review({ materialImprovementAvailable: true }),
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, false);
  assert.equal(decision.readyForPublication, true);
  assert.equal(decision.reasonCode, "CREATIVE_QUALITY_CONVERGED");
});

test("budget exhaustion does not publish a composition below the quality floor", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "high",
    acceptedActCount: 14,
    reachedMaximumAcceptedActs: true,
    authorCritique: stoppedCritique,
    independentReview: review({
      publicationReady: false,
      structuralBlockers: ["No visible governing idea survives without explanatory copy."],
    }),
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, false);
  assert.equal(decision.readyForPublication, false);
  assert.equal(decision.settleWithNotes, true);
  assert.equal(decision.reasonCode, "CREATIVE_CLOSURE_SETTLE_WITH_NOTES");
});


test("the creative model may publish only after explicitly resolving its own intent and reviewer blockers", () => {
  const blocker = "The visible comparison remains descriptive and does not resolve the promised executive implication.";
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "low",
    acceptedActCount: 1,
    reachedMaximumAcceptedActs: false,
    authorCritique: {
      ...stoppedCritique,
      whatStillWeak: [blocker],
    },
    independentReview: review({
      publicationReady: false,
      materialImprovementAvailable: true,
      structuralBlockers: [blocker],
      unresolvedProblems: [blocker],
    }),
    closureAdjudication: {
      version: "northstar.creative-closure-adjudication.v1",
      decision: "publish",
      intendedOutcomeSatisfied: true,
      renderedResultMatchesIntent: true,
      viewerOutcomeResolved: true,
      unresolvedMaterialProblems: [],
      reviewResponses: [{
        issue: blocker,
        disposition: "reframe",
        response: "The exact rendered comparison now communicates the implication through spatial emphasis rather than a prescribed recommendation component.",
      }],
      nextCreativeMove: "Preserve the exact verified source.",
      closureRationale: "The model reconciled the promised outcome with the visible browser result and explicitly answered the review blocker.",
    },
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, false);
  assert.equal(decision.readyForPublication, true);
  assert.equal(decision.settleWithNotes, false);
});

test("a closure adjudication that still sees material work returns to model-owned source authorship", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "low",
    acceptedActCount: 1,
    reachedMaximumAcceptedActs: false,
    authorCritique: stoppedCritique,
    independentReview: review({ publicationReady: false, materialImprovementAvailable: true }),
    closureAdjudication: {
      version: "northstar.creative-closure-adjudication.v1",
      decision: "continue",
      intendedOutcomeSatisfied: false,
      renderedResultMatchesIntent: false,
      viewerOutcomeResolved: false,
      unresolvedMaterialProblems: ["The intended argument is not yet visible."],
      reviewResponses: [],
      nextCreativeMove: "Recompose the exact source into a stronger model-chosen visual argument.",
      closureRationale: "The browser result does not yet match the authored intention.",
    },
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, true);
  assert.equal(decision.readyForPublication, false);
  assert.equal(decision.reasonCode, "CREATIVE_CLOSURE_CONTINUE");
});
