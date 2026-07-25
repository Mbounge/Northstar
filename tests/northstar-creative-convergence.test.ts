import assert from "node:assert/strict";
import test from "node:test";
import { decideNorthstarCreativeConvergence } from "@/lib/canvas-ai/northstar-creative-convergence";

const readiness = {
  operationallyReady: true,
  communicativelyReady: true,
  blockingObservations: [],
  advisoryObservations: [],
};

test("publication requires evidence-grounded operational readiness and creative convergence", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "medium",
    acceptedActCount: 2,
    reachedMaximumAcceptedActs: false,
    authorCritique: {
      summary: "The result is complete.",
      observedEffect: "The argument is immediate and coherent.",
      whatImproved: ["Evidence and implication are connected."],
      whatStillWeak: [],
      recommendedNextMove: "No further material act.",
      continueWorking: false,
    },
    independentReview: {
      interpretation: "The artifact solves the communication problem.",
      strongestAspect: "Its visual argument is decisive.",
      unresolvedProblems: [],
      evidenceCommunicationAssessment: "Grounded proof remains inspectable.",
      recommendedIntervention: "Stop; another act would be decorative.",
      materialImprovementAvailable: false,
      rationale: "No material weakness remains.",
    },
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.readyForPublication, true);
  assert.equal(decision.continueWorking, false);
});

test("an isolated reviewer can keep the agent working when a material problem remains", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "medium",
    acceptedActCount: 1,
    reachedMaximumAcceptedActs: false,
    authorCritique: {
      summary: "Looks complete.",
      observedEffect: "The hierarchy improved.",
      whatImproved: [],
      whatStillWeak: [],
      recommendedNextMove: "Stop.",
      continueWorking: false,
    },
    independentReview: {
      interpretation: "The conclusion is visually detached from its proof.",
      strongestAspect: "The evidence hierarchy is clear.",
      unresolvedProblems: ["The final implication is disconnected."],
      evidenceCommunicationAssessment: "Proof is visible but not resolved.",
      recommendedIntervention: "Connect the proof to the implication through a materially clearer composition.",
      materialImprovementAvailable: true,
      rationale: "The user still has to infer the answer.",
    },
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, true);
  assert.equal(decision.readyForPublication, false);
});


test("Low depth respects the author's explicit stop decision while retaining reviewer refinements as limitations", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "low",
    acceptedActCount: 1,
    reachedMaximumAcceptedActs: false,
    authorCritique: {
      summary: "The board is clear enough for the requested Low-depth run.",
      observedEffect: "The evidence now resolves into a comparison.",
      whatImproved: ["The strategic trade-off is visible."],
      whatStillWeak: ["A few evidence-to-matrix links remain implicit."],
      recommendedNextMove: "Optional annotation polish.",
      continueWorking: false,
    },
    independentReview: {
      interpretation: "The board is useful and grounded.",
      strongestAspect: "The comparison is clear.",
      unresolvedProblems: ["The final link could be more explicit."],
      evidenceCommunicationAssessment: "The proof remains inspectable.",
      recommendedIntervention: "Add optional callouts.",
      materialImprovementAvailable: true,
      rationale: "A refinement remains, but the artifact already solves the core request.",
    },
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.continueWorking, false);
  assert.equal(decision.readyForPublication, true);
  assert.equal(decision.reasonCode, "AUTHOR_CONVERGED_LOW_DEPTH");
  assert.ok(decision.knownLimitations.some((item) => /implicit/i.test(item)));
});

test("remaining weaknesses do not silently override an explicit author stop", () => {
  const decision = decideNorthstarCreativeConvergence({
    readiness,
    thinkingDepth: "medium",
    acceptedActCount: 2,
    reachedMaximumAcceptedActs: false,
    authorCritique: {
      summary: "The artifact has converged.",
      observedEffect: "The user can understand the answer.",
      whatImproved: [],
      whatStillWeak: ["Minor spacing could be tuned."],
      recommendedNextMove: "No material move.",
      continueWorking: false,
    },
    independentReview: {
      interpretation: "The artifact is complete.",
      strongestAspect: "The argument is coherent.",
      unresolvedProblems: ["Minor spacing could be tuned."],
      evidenceCommunicationAssessment: "Grounded.",
      recommendedIntervention: "Stop.",
      materialImprovementAvailable: false,
      rationale: "Only cosmetic work remains.",
    },
    cosmeticDriftWarnings: [],
  });
  assert.equal(decision.readyForPublication, true);
  assert.equal(decision.continueWorking, false);
});
