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
