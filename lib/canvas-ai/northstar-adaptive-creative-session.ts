import type {
  NorthstarEmergentCreativeCritique,
} from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import type {
  NorthstarSceneAssessment,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import { NorthstarCreativeJournal } from "@/lib/canvas-ai/northstar-creative-journal";
import { decideNorthstarCreativeConvergence } from "@/lib/canvas-ai/northstar-creative-convergence";
import type { NorthstarIndependentCreativeReview } from "@/lib/canvas-ai/northstar-independent-creative-review";
import type { NorthstarCreativeClosureAdjudication } from "@/lib/canvas-ai/northstar-creative-closure-adjudication";

export const NORTHSTAR_ADAPTIVE_CREATIVE_SESSION_VERSION =
  "northstar.adaptive-creative-session.v2" as const;

export type NorthstarAdaptiveThinkingDepth = "low" | "medium" | "high";

export interface NorthstarAdaptiveCreativeBudget {
  requiresAcceptedCreativeAct: boolean;
  maximumAcceptedActs: number;
  maximumTotalAttempts: number;
  maximumConsecutiveRejections: number;
  maximumOptionalConsecutiveRejectionsAfterAccepted: number;
  maximumRepeatedFailureFingerprints: number;
  maximumElapsedMs: number;
  authoringTimeoutMs: number;
  critiqueTimeoutMs: number;
  authoringOutputTokens: number;
  critiqueOutputTokens: number;
  independentReviewTimeoutMs: number;
  independentReviewOutputTokens: number;
  independentReviewTemperature: number;
  authoringTemperature: number;
}

export interface NorthstarAdaptiveAcceptedActMemory {
  revisionId: string;
  fingerprint: string;
  intention: string;
  viewerUnderstanding: string;
  visibleChange: string;
  affectedNodeIds: string[];
  operationKinds: string[];
  acceptedAt: number;
}

export interface NorthstarAdaptiveRejectedActMemory {
  revisionId: string;
  fingerprint?: string;
  reason: string;
  attemptedIntention?: string;
  rejectedAt: number;
}

export interface NorthstarAdaptiveRenderedCritiqueMemory {
  revisionId: string;
  summary: string;
  observedEffect: string;
  whatImproved: string[];
  whatStillWeak: string[];
  recommendedNextMove: string;
  continueWorking: boolean;
  recordedAt: number;
}


export interface NorthstarAdaptiveIndependentReviewMemory {
  revisionId: string;
  interpretation: string;
  strongestAspect: string;
  unresolvedProblems: string[];
  recommendedIntervention: string;
  materialImprovementAvailable: boolean;
  publicationReady: boolean;
  structuralBlockers: string[];
  recordedAt: number;
}

export interface NorthstarAdaptiveCreativeSessionSnapshot {
  version: typeof NORTHSTAR_ADAPTIVE_CREATIVE_SESSION_VERSION;
  thinkingDepth: NorthstarAdaptiveThinkingDepth;
  startedAt: number;
  elapsedMs: number;
  acceptedActCount: number;
  rejectedActCount: number;
  totalAttemptCount: number;
  systemRepairAttemptCount: number;
  consecutiveRejectionCount: number;
  acceptedActs: NorthstarAdaptiveAcceptedActMemory[];
  rejectedActs: NorthstarAdaptiveRejectedActMemory[];
  renderedCritiques: NorthstarAdaptiveRenderedCritiqueMemory[];
  independentReviews: NorthstarAdaptiveIndependentReviewMemory[];
  creativeJournal: ReturnType<NorthstarCreativeJournal["snapshot"]>;
  latestRecommendedMove?: string;
  latestCreativeWeaknesses: string[];
  latestContinueWorking?: boolean;
}

export interface NorthstarAdaptiveReadiness {
  operationallyReady: boolean;
  communicativelyReady: boolean;
  blockingObservations: string[];
  advisoryObservations: string[];
}

export interface NorthstarAdaptiveContinuationDecision {
  continueWorking: boolean;
  readyForPublication: boolean;
  settleWithNotes: boolean;
  reason: string;
  reasonCode: import("@/lib/canvas-ai/northstar-creative-convergence").NorthstarCreativeConvergenceReasonCode;
  readiness: NorthstarAdaptiveReadiness;
  knownLimitations: string[];
  authorRequestedContinuation?: boolean;
  reviewerRequestedContinuation?: boolean;
}

export function northstarAdaptiveCreativeBudget(
  depth: NorthstarAdaptiveThinkingDepth,
): NorthstarAdaptiveCreativeBudget {
  if (depth === "low") {
    return {
      requiresAcceptedCreativeAct: true,
      maximumAcceptedActs: 7,
      maximumTotalAttempts: 12,
      maximumConsecutiveRejections: 3,
      maximumOptionalConsecutiveRejectionsAfterAccepted: 2,
      maximumRepeatedFailureFingerprints: 2,
      maximumElapsedMs: 6 * 60_000,
      authoringTimeoutMs: 48_000,
      critiqueTimeoutMs: 32_000,
      authoringOutputTokens: 9_000,
      critiqueOutputTokens: 2_800,
      independentReviewTimeoutMs: 30_000,
      independentReviewOutputTokens: 2_400,
      independentReviewTemperature: 0.46,
      authoringTemperature: 0.82,
    };
  }
  if (depth === "high") {
    return {
      requiresAcceptedCreativeAct: true,
      maximumAcceptedActs: 14,
      maximumTotalAttempts: 24,
      maximumConsecutiveRejections: 5,
      maximumOptionalConsecutiveRejectionsAfterAccepted: 4,
      maximumRepeatedFailureFingerprints: 2,
      maximumElapsedMs: 12 * 60_000,
      authoringTimeoutMs: 95_000,
      critiqueTimeoutMs: 60_000,
      authoringOutputTokens: 13_000,
      critiqueOutputTokens: 5_500,
      independentReviewTimeoutMs: 62_000,
      independentReviewOutputTokens: 4_800,
      independentReviewTemperature: 0.58,
      authoringTemperature: 0.94,
    };
  }
  return {
    requiresAcceptedCreativeAct: true,
    maximumAcceptedActs: 9,
    maximumTotalAttempts: 16,
    maximumConsecutiveRejections: 4,
    maximumOptionalConsecutiveRejectionsAfterAccepted: 3,
    maximumRepeatedFailureFingerprints: 2,
    maximumElapsedMs: 8 * 60_000,
    authoringTimeoutMs: 72_000,
    critiqueTimeoutMs: 46_000,
    authoringOutputTokens: 10_500,
    critiqueOutputTokens: 4_400,
    independentReviewTimeoutMs: 46_000,
    independentReviewOutputTokens: 3_600,
    independentReviewTemperature: 0.52,
    authoringTemperature: 0.89,
  };
}

export function assessNorthstarAdaptiveReadiness(
  assessment: NorthstarSceneAssessment,
): NorthstarAdaptiveReadiness {
  const blockingObservations: string[] = [];
  const advisoryObservations: string[] = [];

  if (!assessment.rootNodePresent || !assessment.canonicalSurfacePresent) {
    blockingObservations.push("The canonical living artboard root is not present.");
  }
  if (!assessment.groundedEvidencePresent) {
    blockingObservations.push("The visible artifact does not retain grounded evidence.");
  }
  if (!assessment.geometryVerified) {
    blockingObservations.push("The exact browser render has not passed geometry and asset verification.");
  }
  if (assessment.duplicateSemanticIds.length > 0) {
    blockingObservations.push(
      `Duplicate semantic identities remain: ${assessment.duplicateSemanticIds.join(", ")}.`,
    );
  }


  if (assessment.modelSourceAuthority) {
    if (!assessment.visualThesisPresent) {
      advisoryObservations.push("The model-authored source does not yet present a legible governing point of view.");
    }
    if (!assessment.evidenceHierarchyPresent) {
      advisoryObservations.push("The model may still strengthen evidence hierarchy, but no runtime-owned composition grammar will be imposed.");
    }
    return {
      operationallyReady: blockingObservations.length === 0,
      communicativelyReady: blockingObservations.length === 0
        && assessment.visualThesisPresent
        && assessment.groundedEvidencePresent,
      blockingObservations,
      advisoryObservations,
    };
  }

  const communicativeSignals = [
    assessment.visualThesisPresent,
    assessment.synthesisPresent,
    assessment.contextualResolutionPresent,
    assessment.hypothesisResolvedOrPromoted,
    assessment.relationshipPresent,
  ].filter(Boolean).length;

  if (!assessment.visualThesisPresent) {
    advisoryObservations.push("The artifact does not yet communicate a decisive governing point of view.");
  }
  if (!assessment.evidenceHierarchyPresent) {
    advisoryObservations.push("Grounded evidence still reads too much like equal-weight inventory.");
  }
  if (!assessment.relationshipPresent) {
    advisoryObservations.push("The artifact has not yet made a meaningful relationship between proof and conclusion unmistakable.");
  }
  if (!assessment.synthesisPresent && !assessment.contextualResolutionPresent) {
    advisoryObservations.push("The artifact has not yet resolved the research into a clear implication, conclusion, or decision.");
  }
  if (!assessment.hypothesisTested && !assessment.hypothesisResolvedOrPromoted) {
    advisoryObservations.push("The current interpretation has not yet been visibly tested or transformed by the evidence.");
  }

  return {
    operationallyReady: blockingObservations.length === 0,
    communicativelyReady: communicativeSignals >= 2
      && assessment.visualThesisPresent
      && (assessment.synthesisPresent || assessment.contextualResolutionPresent || assessment.hypothesisResolvedOrPromoted),
    blockingObservations,
    advisoryObservations,
  };
}

function cleanFailureFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "#id")
    .replace(/artifact-[a-z0-9-]+/g, "artifact-#")
    .replace(/revision-[a-z0-9-]+/g, "revision-#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

export class NorthstarAdaptiveCreativeSession {
  readonly budget: NorthstarAdaptiveCreativeBudget;
  readonly startedAt: number;
  private acceptedActsValue: NorthstarAdaptiveAcceptedActMemory[] = [];
  private rejectedActsValue: NorthstarAdaptiveRejectedActMemory[] = [];
  private critiquesValue: NorthstarAdaptiveRenderedCritiqueMemory[] = [];
  private independentReviewsValue: NorthstarAdaptiveIndependentReviewMemory[] = [];
  private latestIndependentReviewValue?: NorthstarIndependentCreativeReview;
  private readonly journal: NorthstarCreativeJournal;
  private totalAttemptCountValue = 0;
  private systemRepairAttemptCountValue = 0;
  private consecutiveRejectionCountValue = 0;
  private readonly failureFingerprintCounts = new Map<string, number>();

  constructor(
    readonly thinkingDepth: NorthstarAdaptiveThinkingDepth,
    startedAt = Date.now(),
    userOutcomeBeingSolved = "Create the strongest evidence-grounded visual artifact for the user.",
  ) {
    this.startedAt = startedAt;
    this.budget = northstarAdaptiveCreativeBudget(thinkingDepth);
    this.journal = new NorthstarCreativeJournal(userOutcomeBeingSolved);
  }

  noteAttempt(): void {
    this.totalAttemptCountValue += 1;
  }

  reclassifyLastAttemptAsSystemRepair(): void {
    if (this.totalAttemptCountValue > 0) this.totalAttemptCountValue -= 1;
    this.systemRepairAttemptCountValue += 1;
  }

  recordAcceptedAct(
    input: Omit<NorthstarAdaptiveAcceptedActMemory, "acceptedAt" | "operationKinds"> & {
      operationKinds?: string[];
    },
  ): void {
    const operationKinds = input.operationKinds ?? [];
    this.acceptedActsValue.push({ ...input, operationKinds, acceptedAt: Date.now() });
    this.acceptedActsValue = this.acceptedActsValue.slice(-18);
    this.journal.recordAcceptedMove({
      revisionId: input.revisionId,
      intention: input.intention,
      visibleResult: input.visibleChange,
      affectedNodeIds: input.affectedNodeIds,
      operationKinds,
    });
    this.consecutiveRejectionCountValue = 0;
  }

  recordRejectedAct(input: Omit<NorthstarAdaptiveRejectedActMemory, "rejectedAt">): number {
    const reason = cleanFailureFingerprint(input.reason);
    this.rejectedActsValue.push({ ...input, reason, rejectedAt: Date.now() });
    this.rejectedActsValue = this.rejectedActsValue.slice(-18);
    this.consecutiveRejectionCountValue += 1;
    const fingerprint = `${input.revisionId}:${input.fingerprint ?? "none"}:${reason}`;
    const count = (this.failureFingerprintCounts.get(fingerprint) ?? 0) + 1;
    this.failureFingerprintCounts.set(fingerprint, count);
    if (input.attemptedIntention) {
      this.journal.recordRejectedMove({
        revisionId: input.revisionId,
        intention: input.attemptedIntention,
        reason,
      });
    }
    return count;
  }

  recordCritique(
    revisionId: string,
    critique: NorthstarEmergentCreativeCritique,
  ): void {
    this.critiquesValue.push({
      revisionId,
      summary: critique.summary,
      observedEffect: critique.observedEffect,
      whatImproved: critique.whatImproved,
      whatStillWeak: critique.whatStillWeak,
      recommendedNextMove: critique.recommendedNextMove,
      continueWorking: critique.continueWorking,
      recordedAt: Date.now(),
    });
    this.critiquesValue = this.critiquesValue.slice(-14);
    this.journal.recordCritique({
      summary: critique.summary,
      unresolvedProblems: critique.whatStillWeak,
    });
  }

  recordIndependentReview(
    revisionId: string,
    review: NorthstarIndependentCreativeReview,
  ): void {
    this.latestIndependentReviewValue = review;
    this.independentReviewsValue.push({
      revisionId,
      interpretation: review.interpretation,
      strongestAspect: review.strongestAspect,
      unresolvedProblems: review.unresolvedProblems,
      recommendedIntervention: review.recommendedIntervention,
      materialImprovementAvailable: review.materialImprovementAvailable,
      publicationReady: review.publicationReady,
      structuralBlockers: review.structuralBlockers,
      recordedAt: Date.now(),
    });
    this.independentReviewsValue = this.independentReviewsValue.slice(-12);
    this.journal.recordIndependentReview(review);
  }

  latestIndependentReview(): NorthstarIndependentCreativeReview | undefined {
    return this.latestIndependentReviewValue;
  }

  repeatedFailureCount(input: {
    revisionId: string;
    fingerprint?: string;
    reason: string;
  }): number {
    const key = `${input.revisionId}:${input.fingerprint ?? "none"}:${cleanFailureFingerprint(input.reason)}`;
    return this.failureFingerprintCounts.get(key) ?? 0;
  }

  assertCanAttempt(now = Date.now()): void {
    if (
      this.acceptedActsValue.length > 0
      && this.consecutiveRejectionCountValue
        >= this.budget.maximumOptionalConsecutiveRejectionsAfterAccepted
    ) {
      throw new Error(
        `The adaptive creative session reached an optional-refinement plateau after ${this.consecutiveRejectionCountValue} consecutive rejected acts following a verified creative improvement.`,
      );
    }
    if (this.totalAttemptCountValue >= this.budget.maximumTotalAttempts) {
      throw new Error(
        `The adaptive creative session exhausted its ${this.budget.maximumTotalAttempts} total-attempt safety budget.`,
      );
    }
    if (this.consecutiveRejectionCountValue >= this.budget.maximumConsecutiveRejections) {
      throw new Error(
        `The adaptive creative session stopped after ${this.consecutiveRejectionCountValue} consecutive rejected acts without a committed visual improvement.`,
      );
    }
    if (now - this.startedAt >= this.budget.maximumElapsedMs) {
      throw new Error(
        `The adaptive creative session reached its ${Math.round(this.budget.maximumElapsedMs / 60_000)} minute safety budget.`,
      );
    }
  }

  decideContinuation(
    assessment: NorthstarSceneAssessment,
    critique?: NorthstarEmergentCreativeCritique,
    independentReview: NorthstarIndependentCreativeReview | undefined = this.latestIndependentReviewValue,
    closureAdjudication?: NorthstarCreativeClosureAdjudication,
  ): NorthstarAdaptiveContinuationDecision {
    const readiness = assessNorthstarAdaptiveReadiness(assessment);
    const acceptedCount = this.acceptedActsValue.length;
    const convergence = decideNorthstarCreativeConvergence({
      readiness,
      thinkingDepth: this.thinkingDepth,
      acceptedActCount: acceptedCount,
      reachedMaximumAcceptedActs: acceptedCount >= this.budget.maximumAcceptedActs,
      authorCritique: critique,
      independentReview,
      closureAdjudication,
      cosmeticDriftWarnings: this.journal.cosmeticDriftWarnings(),
    });
    return {
      continueWorking: convergence.continueWorking,
      readyForPublication: convergence.readyForPublication,
      settleWithNotes: convergence.settleWithNotes,
      reason: convergence.reason,
      reasonCode: convergence.reasonCode,
      readiness,
      knownLimitations: convergence.knownLimitations,
      authorRequestedContinuation: convergence.authorRequestedContinuation,
      reviewerRequestedContinuation: convergence.reviewerRequestedContinuation,
    };
  }

  snapshot(now = Date.now()): NorthstarAdaptiveCreativeSessionSnapshot {
    const latestCritique = this.critiquesValue.at(-1);
    return {
      version: NORTHSTAR_ADAPTIVE_CREATIVE_SESSION_VERSION,
      thinkingDepth: this.thinkingDepth,
      startedAt: this.startedAt,
      elapsedMs: Math.max(0, now - this.startedAt),
      acceptedActCount: this.acceptedActsValue.length,
      rejectedActCount: this.rejectedActsValue.length,
      totalAttemptCount: this.totalAttemptCountValue,
      systemRepairAttemptCount: this.systemRepairAttemptCountValue,
      consecutiveRejectionCount: this.consecutiveRejectionCountValue,
      acceptedActs: [...this.acceptedActsValue],
      rejectedActs: [...this.rejectedActsValue],
      renderedCritiques: [...this.critiquesValue],
      independentReviews: [...this.independentReviewsValue],
      creativeJournal: this.journal.snapshot(),
      latestRecommendedMove: latestCritique?.recommendedNextMove,
      latestCreativeWeaknesses: latestCritique?.whatStillWeak ?? [],
      latestContinueWorking: latestCritique?.continueWorking,
    };
  }
}
