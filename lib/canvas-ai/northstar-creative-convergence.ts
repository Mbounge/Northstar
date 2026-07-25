import type { NorthstarAdaptiveReadiness, NorthstarAdaptiveThinkingDepth } from "@/lib/canvas-ai/northstar-adaptive-creative-session";
import type { NorthstarEmergentCreativeCritique } from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import type { NorthstarIndependentCreativeReview } from "@/lib/canvas-ai/northstar-independent-creative-review";

export type NorthstarCreativeConvergenceReasonCode =
  | "CREATIVE_ACT_REQUIRED"
  | "OPERATIONAL_BLOCKER"
  | "AUTHOR_REQUESTED_CONTINUATION"
  | "REVIEWER_REQUESTED_CONTINUATION"
  | "AUTHOR_CONVERGED_LOW_DEPTH"
  | "AUTHOR_AND_REVIEWER_CONVERGED"
  | "CREATIVE_BUDGET_SETTLED"
  | "CREATIVE_DRIFT_RECONSIDERATION";

export interface NorthstarCreativeConvergenceDecision {
  continueWorking: boolean;
  readyForPublication: boolean;
  knownLimitations: string[];
  reason: string;
  reasonCode: NorthstarCreativeConvergenceReasonCode;
  authorRequestedContinuation?: boolean;
  reviewerRequestedContinuation?: boolean;
}

export function decideNorthstarCreativeConvergence(input: {
  readiness: NorthstarAdaptiveReadiness;
  thinkingDepth: NorthstarAdaptiveThinkingDepth;
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

  const authorRequestedContinuation = input.authorCritique?.continueWorking;
  const reviewerRequestedContinuation = input.independentReview?.materialImprovementAvailable;

  if (input.acceptedActCount === 0) {
    return {
      continueWorking: true,
      readyForPublication: false,
      knownLimitations: limitations,
      reason: "At least one genuine browser-verified model-authored creative act is required before publication.",
      reasonCode: "CREATIVE_ACT_REQUIRED",
      authorRequestedContinuation,
      reviewerRequestedContinuation,
    };
  }

  if (!input.readiness.operationallyReady) {
    if (input.reachedMaximumAcceptedActs) {
      return {
        continueWorking: false,
        readyForPublication: false,
        knownLimitations: limitations,
        reason: "The creative budget is exhausted while deterministic browser or evidence invariants remain unresolved.",
        reasonCode: "OPERATIONAL_BLOCKER",
        authorRequestedContinuation,
        reviewerRequestedContinuation,
      };
    }
    return {
      continueWorking: true,
      readyForPublication: false,
      knownLimitations: limitations,
      reason: "The verified artifact still has operational or evidence-integrity blockers.",
      reasonCode: "OPERATIONAL_BLOCKER",
      authorRequestedContinuation,
      reviewerRequestedContinuation,
    };
  }

  if (input.reachedMaximumAcceptedActs) {
    return {
      continueWorking: false,
      readyForPublication: true,
      knownLimitations: limitations,
      reason: "The thinking-level budget is exhausted; Northstar will settle the latest operationally verified artifact and retain the remaining creative limitations honestly.",
      reasonCode: "CREATIVE_BUDGET_SETTLED",
      authorRequestedContinuation,
      reviewerRequestedContinuation,
    };
  }

  // The author's explicit stop decision is authoritative at Low depth. Weaknesses remain
  // useful as known limitations; their mere existence must not silently reverse that decision.
  if (authorRequestedContinuation === false && input.thinkingDepth === "low") {
    return {
      continueWorking: false,
      readyForPublication: true,
      knownLimitations: limitations,
      reason: reviewerRequestedContinuation
        ? "The Low-depth author explicitly converged on an operationally verified artifact. The isolated reviewer's optional refinements are retained as known limitations rather than forcing another act."
        : "The Low-depth author explicitly converged on an operationally verified artifact; remaining imperfections are retained as known limitations.",
      reasonCode: "AUTHOR_CONVERGED_LOW_DEPTH",
      authorRequestedContinuation,
      reviewerRequestedContinuation,
    };
  }

  if (authorRequestedContinuation === false && reviewerRequestedContinuation !== true) {
    return {
      continueWorking: false,
      readyForPublication: true,
      knownLimitations: limitations,
      reason: "The author and isolated reviewer found no material improvement worth another revision, and the exact browser artifact is operationally ready.",
      reasonCode: "AUTHOR_AND_REVIEWER_CONVERGED",
      authorRequestedContinuation,
      reviewerRequestedContinuation,
    };
  }

  if (authorRequestedContinuation === true) {
    return {
      continueWorking: true,
      readyForPublication: false,
      knownLimitations: limitations,
      reason: input.cosmeticDriftWarnings.length > 0
        ? "The author requested another revision, but the visual journal detected circular or cosmetic drift; the next act must reconsider the artifact structurally rather than repeat local polish."
        : "The author explicitly identified another material creative act.",
      reasonCode: input.cosmeticDriftWarnings.length > 0
        ? "CREATIVE_DRIFT_RECONSIDERATION"
        : "AUTHOR_REQUESTED_CONTINUATION",
      authorRequestedContinuation,
      reviewerRequestedContinuation,
    };
  }

  if (reviewerRequestedContinuation === true) {
    return {
      continueWorking: true,
      readyForPublication: false,
      knownLimitations: limitations,
      reason: "At this thinking depth, the isolated reviewer identified a material opportunity to improve the user's understanding.",
      reasonCode: "REVIEWER_REQUESTED_CONTINUATION",
      authorRequestedContinuation,
      reviewerRequestedContinuation,
    };
  }

  // No explicit critique exists yet, so the agent must inspect the verified result before settling.
  return {
    continueWorking: true,
    readyForPublication: false,
    knownLimitations: limitations,
    reason: "Northstar has not yet received an explicit rendered convergence decision for the latest verified artifact.",
    reasonCode: "AUTHOR_REQUESTED_CONTINUATION",
    authorRequestedContinuation,
    reviewerRequestedContinuation,
  };
}
