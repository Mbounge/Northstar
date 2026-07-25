import type { NorthstarAdaptiveReadiness } from "@/lib/canvas-ai/northstar-adaptive-creative-session";
import type { NorthstarEmergentCreativeCritique } from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import type { NorthstarIndependentCreativeReview } from "@/lib/canvas-ai/northstar-independent-creative-review";

export interface NorthstarCreativeConvergenceDecision {
  continueWorking: boolean;
  readyForPublication: boolean;
  knownLimitations: string[];
  reason: string;
}

export function decideNorthstarCreativeConvergence(input: {
  readiness: NorthstarAdaptiveReadiness;
  acceptedActCount: number;
  reachedMaximumAcceptedActs: boolean;
  authorCritique?: NorthstarEmergentCreativeCritique;
  independentReview?: NorthstarIndependentCreativeReview;
  cosmeticDriftWarnings: string[];
}): NorthstarCreativeConvergenceDecision {
  const limitations = Array.from(new Set([
    ...input.readiness.blockingObservations,
    ...input.readiness.advisoryObservations,
    ...(input.authorCritique?.whatStillWeak ?? []),
    ...(input.independentReview?.unresolvedProblems ?? []),
    ...input.cosmeticDriftWarnings,
  ].filter(Boolean))).slice(0, 18);

  if (input.acceptedActCount === 0) {
    return {
      continueWorking: true,
      readyForPublication: false,
      knownLimitations: limitations,
      reason: "At least one genuine browser-verified model-authored creative act is required before publication.",
    };
  }

  if (!input.readiness.operationallyReady) {
    if (input.reachedMaximumAcceptedActs) {
      return {
        continueWorking: false,
        readyForPublication: false,
        knownLimitations: limitations,
        reason: "The creative budget is exhausted while deterministic browser or evidence invariants remain unresolved.",
      };
    }
    return {
      continueWorking: true,
      readyForPublication: false,
      knownLimitations: limitations,
      reason: "The verified artifact still has operational or evidence-integrity blockers.",
    };
  }

  const authorWantsMore = input.authorCritique
    ? input.authorCritique.continueWorking || input.authorCritique.whatStillWeak.length > 0
    : true;
  const reviewerWantsMore = input.independentReview
    ? input.independentReview.materialImprovementAvailable
    : authorWantsMore;

  if (!authorWantsMore && !reviewerWantsMore && input.cosmeticDriftWarnings.length === 0) {
    return {
      continueWorking: false,
      readyForPublication: true,
      knownLimitations: limitations,
      reason: "The author and isolated reviewer independently found no material improvement worth another revision, and the exact browser artifact is operationally ready.",
    };
  }

  if (input.reachedMaximumAcceptedActs) {
    return {
      continueWorking: false,
      readyForPublication: true,
      knownLimitations: limitations,
      reason: "The thinking-level budget is exhausted; Northstar will settle the latest operationally verified artifact and retain the remaining creative limitations honestly.",
    };
  }

  return {
    continueWorking: true,
    readyForPublication: false,
    knownLimitations: limitations,
    reason: input.cosmeticDriftWarnings.length > 0
      ? "The visual decision journal detected circular or cosmetic drift; the next act must reconsider the whole artifact rather than repeat local polish."
      : reviewerWantsMore
        ? "The isolated reviewer identified a material opportunity to improve the user's understanding."
        : "The author critique still identifies a material unresolved communication problem.",
  };
}
