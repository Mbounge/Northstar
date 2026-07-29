import type { NorthstarAdaptiveReadiness, NorthstarAdaptiveThinkingDepth } from "@/lib/canvas-ai/northstar-adaptive-creative-session";
import type { NorthstarEmergentCreativeCritique } from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import type { NorthstarIndependentCreativeReview } from "@/lib/canvas-ai/northstar-independent-creative-review";
import {
  northstarClosureRespondsToIssues,
  type NorthstarCreativeClosureAdjudication,
} from "@/lib/canvas-ai/northstar-creative-closure-adjudication";

export type NorthstarCreativeConvergenceReasonCode =
  | "CREATIVE_ACT_REQUIRED"
  | "OPERATIONAL_BLOCKER"
  | "CREATIVE_QUALITY_BLOCKER"
  | "CREATIVE_CLOSURE_ADJUDICATION_REQUIRED"
  | "CREATIVE_CLOSURE_CONTINUE"
  | "CREATIVE_CLOSURE_SETTLE_WITH_NOTES"
  | "AUTHOR_REQUESTED_CONTINUATION"
  | "REVIEWER_REQUESTED_CONTINUATION"
  | "CREATIVE_QUALITY_CONVERGED"
  | "CREATIVE_DRIFT_RECONSIDERATION";

export interface NorthstarCreativeConvergenceDecision {
  continueWorking: boolean;
  readyForPublication: boolean;
  settleWithNotes: boolean;
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
  closureAdjudication?: NorthstarCreativeClosureAdjudication;
  cosmeticDriftWarnings: string[];
}): NorthstarCreativeConvergenceDecision {
  const limitations = Array.from(new Set([
    ...input.readiness.blockingObservations,
    ...input.readiness.advisoryObservations,
    ...(input.authorCritique?.whatStillWeak ?? []),
    ...(input.independentReview?.unresolvedProblems ?? []),
    ...(input.independentReview?.structuralBlockers ?? []),
    ...(input.closureAdjudication?.unresolvedMaterialProblems ?? []),
    ...input.cosmeticDriftWarnings,
  ].filter(Boolean))).slice(0, 24);

  const authorRequestedContinuation = input.authorCritique?.continueWorking;
  const reviewerRequestedContinuation = input.independentReview?.materialImprovementAvailable;
  const reviewerStructuralIssues = Array.from(new Set([
    ...(input.independentReview?.structuralBlockers ?? []),
    ...(input.independentReview?.publicationReady === false
      ? input.independentReview.unresolvedProblems
      : []),
  ].filter(Boolean)));
  const reviewerBlocksPublication = Boolean(
    input.independentReview
    && (
      input.independentReview.publicationReady !== true
      || input.independentReview.universalQualityBarMet !== true
      || input.independentReview.structuralBlockers.length > 0
    )
  );
  const authorNamedMaterialWeakness = (input.authorCritique?.whatStillWeak.length ?? 0) > 0;

  const base = {
    knownLimitations: limitations,
    authorRequestedContinuation,
    reviewerRequestedContinuation,
  };

  if (input.acceptedActCount === 0) {
    return {
      ...base,
      continueWorking: true,
      readyForPublication: false,
      settleWithNotes: false,
      reason: "At least one genuine browser-verified model-authored creative act is required before publication.",
      reasonCode: "CREATIVE_ACT_REQUIRED",
    };
  }

  if (!input.readiness.operationallyReady) {
    return {
      ...base,
      continueWorking: !input.reachedMaximumAcceptedActs,
      readyForPublication: false,
      settleWithNotes: false,
      reason: input.reachedMaximumAcceptedActs
        ? "The creative budget is exhausted while deterministic browser or evidence invariants remain unresolved."
        : "The verified artifact still has operational or evidence-integrity blockers.",
      reasonCode: "OPERATIONAL_BLOCKER",
    };
  }

  if (authorRequestedContinuation === true && !input.reachedMaximumAcceptedActs) {
    return {
      ...base,
      continueWorking: true,
      readyForPublication: false,
      settleWithNotes: false,
      reason: input.cosmeticDriftWarnings.length > 0
        ? "The browser-verified artifact is deliverable, and the author requested a structural reconsideration because the visual journal detected circular or cosmetic drift."
        : "The browser-verified artifact is deliverable, and the author identified a material improvement worth attempting.",
      reasonCode: input.cosmeticDriftWarnings.length > 0
        ? "CREATIVE_DRIFT_RECONSIDERATION"
        : "AUTHOR_REQUESTED_CONTINUATION",
    };
  }

  const closureNeedsAdjudication = !input.readiness.communicativelyReady
    || reviewerBlocksPublication
    || authorNamedMaterialWeakness
    || input.cosmeticDriftWarnings.length > 0;

  if (closureNeedsAdjudication && !input.closureAdjudication) {
    if (input.reachedMaximumAcceptedActs) {
      return {
        ...base,
        continueWorking: false,
        readyForPublication: false,
        settleWithNotes: true,
        reason: "The browser-verified artifact remains useful, but the creative budget ended before the model could reconcile its stated intent, visible weaknesses, and independent review. Preserve it without claiming publication-quality closure.",
        reasonCode: "CREATIVE_CLOSURE_SETTLE_WITH_NOTES",
      };
    }
    return {
      ...base,
      continueWorking: true,
      readyForPublication: false,
      settleWithNotes: false,
      reason: "The author attempted to stop while its own critique, measured communication state, or independent review still identified material incompleteness. The creative model must adjudicate closure against the exact rendered result before publication.",
      reasonCode: "CREATIVE_CLOSURE_ADJUDICATION_REQUIRED",
    };
  }

  if (input.closureAdjudication) {
    const closure = input.closureAdjudication;
    const answeredReview = northstarClosureRespondsToIssues(closure, reviewerStructuralIssues);
    const closureComplete = closure.decision === "publish"
      && closure.intendedOutcomeSatisfied
      && closure.renderedResultMatchesIntent
      && closure.viewerOutcomeResolved
      && closure.unresolvedMaterialProblems.length === 0
      && answeredReview;

    if (closureComplete) {
      return {
        ...base,
        continueWorking: false,
        readyForPublication: true,
        settleWithNotes: false,
        reason: closure.closureRationale,
        reasonCode: "CREATIVE_QUALITY_CONVERGED",
      };
    }

    if (closure.decision === "settle-with-notes" && input.reachedMaximumAcceptedActs) {
      return {
        ...base,
        continueWorking: false,
        readyForPublication: false,
        settleWithNotes: true,
        reason: closure.closureRationale,
        reasonCode: "CREATIVE_CLOSURE_SETTLE_WITH_NOTES",
      };
    }

    if (input.reachedMaximumAcceptedActs) {
      return {
        ...base,
        continueWorking: false,
        readyForPublication: false,
        settleWithNotes: true,
        reason: "The exact browser-verified revision is preserved, but the creative budget ended while the model still identified material closure work.",
        reasonCode: "CREATIVE_CLOSURE_SETTLE_WITH_NOTES",
      };
    }

    return {
      ...base,
      continueWorking: true,
      readyForPublication: false,
      settleWithNotes: false,
      reason: closure.nextCreativeMove || closure.closureRationale,
      reasonCode: "CREATIVE_CLOSURE_CONTINUE",
    };
  }

  if (!input.readiness.communicativelyReady) {
    return {
      ...base,
      continueWorking: !input.reachedMaximumAcceptedActs,
      readyForPublication: false,
      settleWithNotes: input.reachedMaximumAcceptedActs,
      reason: "The browser transaction is healthy, but the model-authored artifact has not yet resolved the user's communication outcome.",
      reasonCode: input.reachedMaximumAcceptedActs
        ? "CREATIVE_CLOSURE_SETTLE_WITH_NOTES"
        : "CREATIVE_QUALITY_BLOCKER",
    };
  }

  if (reviewerBlocksPublication) {
    return {
      ...base,
      continueWorking: !input.reachedMaximumAcceptedActs,
      readyForPublication: false,
      settleWithNotes: input.reachedMaximumAcceptedActs,
      reason: "Independent review identified publication-level incompleteness that the creative model has not yet adjudicated against the visible result.",
      reasonCode: input.reachedMaximumAcceptedActs
        ? "CREATIVE_CLOSURE_SETTLE_WITH_NOTES"
        : "CREATIVE_QUALITY_BLOCKER",
    };
  }

  if (
    input.thinkingDepth !== "low"
    && reviewerRequestedContinuation === true
    && !input.reachedMaximumAcceptedActs
  ) {
    return {
      ...base,
      continueWorking: true,
      readyForPublication: false,
      settleWithNotes: false,
      reason: "The publication bar is met, and the independent review identified one material improvement worth returning to the creative model.",
      reasonCode: "REVIEWER_REQUESTED_CONTINUATION",
    };
  }

  return {
    ...base,
    continueWorking: false,
    readyForPublication: true,
    settleWithNotes: false,
    reason: "The exact browser-verified artifact satisfies the operational and communicative contract, the author identified no material weakness, and independent review found no publication blocker.",
    reasonCode: "CREATIVE_QUALITY_CONVERGED",
  };
}
