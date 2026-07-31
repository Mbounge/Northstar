import type { NorthstarAdaptiveReadiness, NorthstarAdaptiveThinkingDepth } from "@/lib/canvas-ai/northstar-adaptive-creative-session";
import type { NorthstarEmergentCreativeCritique } from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import type { NorthstarIndependentCreativeReview } from "@/lib/canvas-ai/northstar-independent-creative-review";
import {
  northstarClosureRespondsToIssues,
  type NorthstarCreativeClosureAdjudication,
} from "@/lib/canvas-ai/northstar-creative-closure-adjudication";
import {
  NorthstarBudgetExceededError,
  NorthstarDeterministicDesignActError,
  NorthstarVisualStageBlockedError,
} from "@/lib/canvas-ai/northstar-run-health";

export const NORTHSTAR_LIFECYCLE_AUTHORITY_VERSION =
  "northstar.lifecycle-authority.v1" as const;

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

export type NorthstarRunTerminalState =
  | "completed"
  | "completed_with_notes"
  | "incomplete"
  | "cancelled"
  | "infrastructure_failed";

export interface NorthstarTerminalServerState {
  operationalRevisionRequired?: boolean;
  creativeTransformationRequired?: boolean;
  acceptedCreativeActCount?: number;
  materialCreativeRevisionId?: string;
  materialCreativeRevisionPreserved?: boolean;
  publicationRequired: boolean;
  publicationVerified: boolean;
  communicativelyReady: boolean;
  publicationClean: boolean;
  operationalRevisionPreserved: boolean;
  processSettled?: boolean;
  artifactId?: string;
  revisionId?: string;
  blockingObservations?: string[];
  advisoryObservations?: string[];
  unresolved?: string[];
  knownLimitations?: string[];
}

export type NorthstarLifecycleClassification =
  | "verified"
  | "quality-advisory"
  | "recoverable-design"
  | "optional-regression"
  | "transport-degraded"
  | "unsafe"
  | "infrastructure"
  | "cancelled";

export interface NorthstarLifecycleAuthorityReceipt {
  version: typeof NORTHSTAR_LIFECYCLE_AUTHORITY_VERSION;
  terminalState: NorthstarRunTerminalState;
  classification: NorthstarLifecycleClassification;
  reasonCode: string;
  detail: string;
  artifactId?: string;
  revisionId?: string;
  operationalRevisionPreserved: boolean;
  creativeTransformationRequired: boolean;
  acceptedCreativeActCount: number;
  materialCreativeRevisionId?: string;
  materialCreativeRevisionPreserved: boolean;
  publicationVerified: boolean;
  clientReceiptPresent: boolean;
  failedPredicates: string[];
  knownLimitations: string[];
}

export interface NorthstarRunSettlementDecision {
  terminalState: NorthstarRunTerminalState;
  detail: string;
  clientReceipt?: Record<string, unknown>;
  authorityReceipt: NorthstarLifecycleAuthorityReceipt;
}

function cleanText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(record: Record<string, unknown> | undefined, key: string): boolean {
  return record?.[key] === true;
}

function failedSettlementPredicates(input: {
  expectedFinalRevisionId?: string;
  client: Record<string, unknown>;
}): string[] {
  const failed: string[] = [];
  if (input.expectedFinalRevisionId) {
    if (cleanText(input.client.expectedFinalRevisionId) !== input.expectedFinalRevisionId) {
      failed.push("expected revision echo");
    }
    if (cleanText(input.client.acknowledgedFinalRevisionId) !== input.expectedFinalRevisionId) {
      failed.push("browser acknowledgement revision");
    }
    if (cleanText(input.client.materializedFinalRevisionId) !== input.expectedFinalRevisionId) {
      failed.push("outer-canvas materialized revision");
    }
  }
  const booleanPredicates: Array<[string, string]> = [
    ["receivedFinal", "assistant final receipt"],
    ["browserAcknowledged", "browser acknowledgement"],
    ["outerCanvasMaterialized", "outer-canvas materialization"],
    ["persistenceHealthy", "canonical persistence"],
    ["pipelineSettled", "client action pipeline settlement"],
    ["renderHealthy", "render health"],
    ["noHardFailures", "hard-failure clearance"],
    ["localOperationalHealthy", "local operational health"],
  ];
  for (const [key, label] of booleanPredicates) {
    if (!booleanValue(input.client, key)) failed.push(label);
  }
  return Array.from(new Set(failed));
}

function authorityReceipt(input: {
  terminalState: NorthstarRunTerminalState;
  classification: NorthstarLifecycleClassification;
  reasonCode: string;
  detail: string;
  serverState: NorthstarTerminalServerState;
  clientReceiptPresent: boolean;
  failedPredicates?: string[];
  knownLimitations?: string[];
}): NorthstarLifecycleAuthorityReceipt {
  return {
    version: NORTHSTAR_LIFECYCLE_AUTHORITY_VERSION,
    terminalState: input.terminalState,
    classification: input.classification,
    reasonCode: input.reasonCode,
    detail: input.detail,
    artifactId: input.serverState.artifactId,
    revisionId: input.serverState.revisionId,
    operationalRevisionPreserved: input.serverState.operationalRevisionPreserved,
    creativeTransformationRequired:
      input.serverState.creativeTransformationRequired === true,
    acceptedCreativeActCount: Math.max(
      0,
      Math.floor(input.serverState.acceptedCreativeActCount ?? 0),
    ),
    materialCreativeRevisionId: input.serverState.materialCreativeRevisionId,
    materialCreativeRevisionPreserved:
      input.serverState.materialCreativeRevisionPreserved === true,
    publicationVerified: input.serverState.publicationVerified,
    clientReceiptPresent: input.clientReceiptPresent,
    failedPredicates: Array.from(new Set(input.failedPredicates ?? [])),
    knownLimitations: Array.from(new Set([
      ...(input.serverState.knownLimitations ?? []),
      ...(input.knownLimitations ?? []),
    ])).slice(0, 24),
  };
}

export function northstarCreativeTransformationSatisfied(
  serverState: NorthstarTerminalServerState,
): boolean {
  if (serverState.creativeTransformationRequired !== true) return true;
  return (serverState.acceptedCreativeActCount ?? 0) > 0
    && Boolean(cleanText(serverState.materialCreativeRevisionId))
    && serverState.materialCreativeRevisionPreserved === true;
}

/**
 * The only terminal settlement authority. Operational preservation protects
 * the user's last safe pixels. It is not creative completion: visual-design
 * requests also require a browser-accepted material creative revision.
 */
export function decideNorthstarRunSettlement(input: {
  expectedFinalRevisionId?: string;
  serverState: NorthstarTerminalServerState;
  clientReceipt?: Record<string, unknown>;
  receiptFailure?: string;
}): NorthstarRunSettlementDecision {
  const client = input.clientReceipt;
  const preserved = input.serverState.operationalRevisionPreserved;
  const creativeSatisfied = northstarCreativeTransformationSatisfied(input.serverState);
  if (input.serverState.operationalRevisionRequired === false) {
    const detail = "The lifecycle authority verified the completed non-visual response; no browser revision or client settlement receipt was required.";
    return {
      terminalState: "completed",
      detail,
      authorityReceipt: authorityReceipt({
        terminalState: "completed",
        classification: "verified",
        reasonCode: "NON_VISUAL_RESPONSE_COMPLETED",
        detail,
        serverState: input.serverState,
        clientReceiptPresent: false,
      }),
    };
  }
  if (!client) {
    const terminalState = preserved && creativeSatisfied ? "completed_with_notes" : "incomplete";
    const detail = preserved && !creativeSatisfied
      ? "Northstar preserved the operational evidence scaffold, but no browser-accepted material creative revision exists. The visual-design run remains incomplete."
      : preserved
      ? `The exact browser-verified artboard was preserved, but client settlement telemetry did not arrive. The deliverable remains available.${input.receiptFailure ? ` ${input.receiptFailure}` : ""}`
      : `Northstar could not verify an operational final revision.${input.receiptFailure ? ` ${input.receiptFailure}` : ""}`;
    return {
      terminalState,
      detail,
      authorityReceipt: authorityReceipt({
        terminalState,
        classification: preserved && creativeSatisfied ? "transport-degraded" : "unsafe",
        reasonCode: preserved && !creativeSatisfied
          ? "CREATIVE_TRANSFORMATION_REQUIRED"
          : preserved
            ? "SETTLEMENT_RECEIPT_MISSING_PRESERVED"
            : "OPERATIONAL_REVISION_UNVERIFIED",
        detail,
        serverState: input.serverState,
        clientReceiptPresent: false,
        failedPredicates: [
          ...(creativeSatisfied ? [] : ["browser-accepted material creative revision"]),
          "client settlement receipt",
        ],
      }),
    };
  }

  const exactRevision = !input.expectedFinalRevisionId || (
    cleanText(client.expectedFinalRevisionId) === input.expectedFinalRevisionId
    && cleanText(client.acknowledgedFinalRevisionId) === input.expectedFinalRevisionId
    && cleanText(client.materializedFinalRevisionId) === input.expectedFinalRevisionId
  );
  const operational = exactRevision
    && booleanValue(client, "receivedFinal")
    && booleanValue(client, "browserAcknowledged")
    && booleanValue(client, "outerCanvasMaterialized")
    && booleanValue(client, "persistenceHealthy")
    && booleanValue(client, "pipelineSettled")
    && booleanValue(client, "renderHealthy")
    && booleanValue(client, "noHardFailures")
    && booleanValue(client, "localOperationalHealthy");
  const publicationVerified = !input.serverState.publicationRequired || (
    input.serverState.publicationVerified
    && input.serverState.communicativelyReady
    && input.serverState.publicationClean
  );
  const failedPredicates = failedSettlementPredicates({
    expectedFinalRevisionId: input.expectedFinalRevisionId,
    client,
  });
  const verifiedServerState: NorthstarTerminalServerState = operational
    ? {
        ...input.serverState,
        operationalRevisionPreserved: true,
        revisionId: input.expectedFinalRevisionId ?? input.serverState.revisionId,
      }
    : input.serverState;

  if (operational && creativeSatisfied && publicationVerified) {
    const detail = "The lifecycle authority verified the exact browser-acknowledged, outer-canvas-materialized, persisted, communicatively resolved final revision.";
    return {
      terminalState: "completed",
      detail,
      clientReceipt: client,
      authorityReceipt: authorityReceipt({
        terminalState: "completed",
        classification: "verified",
        reasonCode: "END_TO_END_VERIFIED",
        detail,
        serverState: verifiedServerState,
        clientReceiptPresent: true,
      }),
    };
  }
  if (operational && creativeSatisfied) {
    const detail = "The lifecycle authority verified the strongest operational revision. Remaining work is advisory and cannot invalidate the deliverable.";
    return {
      terminalState: "completed_with_notes",
      detail,
      clientReceipt: client,
      authorityReceipt: authorityReceipt({
        terminalState: "completed_with_notes",
        classification: "quality-advisory",
        reasonCode: "OPERATIONAL_REVISION_PRESERVED",
        detail,
        serverState: verifiedServerState,
        clientReceiptPresent: true,
        failedPredicates,
      }),
    };
  }
  if (operational && !creativeSatisfied) {
    const detail = "The lifecycle authority preserved the operational evidence scaffold, but the required browser-accepted material creative transformation never occurred.";
    return {
      terminalState: "incomplete",
      detail,
      clientReceipt: client,
      authorityReceipt: authorityReceipt({
        terminalState: "incomplete",
        classification: "unsafe",
        reasonCode: "CREATIVE_TRANSFORMATION_REQUIRED",
        detail,
        serverState: verifiedServerState,
        clientReceiptPresent: true,
        failedPredicates: ["browser-accepted material creative revision"],
      }),
    };
  }
  const detail = failedPredicates.length > 0
    ? `The lifecycle authority could not verify an operational end-to-end revision. Failed checks: ${failedPredicates.join(", ")}.`
    : "The lifecycle authority could not verify an operational end-to-end revision.";
  return {
    terminalState: "incomplete",
    detail,
    clientReceipt: client,
    authorityReceipt: authorityReceipt({
      terminalState: "incomplete",
      classification: "unsafe",
      reasonCode: "END_TO_END_OPERATIONAL_CONTRACT_FAILED",
      detail,
      serverState: input.serverState,
      clientReceiptPresent: true,
      failedPredicates,
    }),
  };
}

export function classifyNorthstarLifecycleFailure(input: {
  error: unknown;
  serverState: NorthstarTerminalServerState;
}): NorthstarLifecycleAuthorityReceipt {
  const error = input.error;
  const preserved = input.serverState.operationalRevisionPreserved;
  const creativeSatisfied = northstarCreativeTransformationSatisfied(input.serverState);
  const detail = error instanceof Error ? error.message : String(error);
  const recoverable = error instanceof NorthstarDeterministicDesignActError
    || error instanceof NorthstarBudgetExceededError
    || error instanceof NorthstarVisualStageBlockedError;
  if (error instanceof DOMException && error.name === "AbortError") {
    return authorityReceipt({
      terminalState: "cancelled",
      classification: "cancelled",
      reasonCode: "RUN_CANCELLED",
      detail,
      serverState: input.serverState,
      clientReceiptPresent: false,
    });
  }
  if (recoverable && preserved && creativeSatisfied) {
    return authorityReceipt({
      terminalState: "completed_with_notes",
      classification: "recoverable-design",
      reasonCode: "RECOVERABLE_DESIGN_PRESERVED",
      detail,
      serverState: input.serverState,
      clientReceiptPresent: false,
      knownLimitations: [detail],
    });
  }
  if (recoverable) {
    const failedPredicate = input.serverState.creativeTransformationRequired === true
      && !creativeSatisfied
      ? "browser-accepted material creative revision"
      : "operational browser revision";
    return authorityReceipt({
      terminalState: "incomplete",
      classification: "unsafe",
      reasonCode: !creativeSatisfied
        ? "CREATIVE_TRANSFORMATION_REQUIRED"
        : "RECOVERABLE_DESIGN_WITHOUT_DELIVERABLE",
      detail,
      serverState: input.serverState,
      clientReceiptPresent: false,
      failedPredicates: [failedPredicate],
      knownLimitations: [detail],
    });
  }
  // This invariant applies to every exception class, including unexpected
  // lease, lineage, transport, and programming failures. Preserving an
  // evidence scaffold is not a creative deliverable.
  if (!creativeSatisfied) {
    return authorityReceipt({
      terminalState: "incomplete",
      classification: "unsafe",
      reasonCode: "CREATIVE_TRANSFORMATION_REQUIRED",
      detail,
      serverState: input.serverState,
      clientReceiptPresent: false,
      failedPredicates: ["browser-accepted material creative revision"],
      knownLimitations: [detail],
    });
  }
  return authorityReceipt({
    terminalState: preserved ? "completed_with_notes" : "infrastructure_failed",
    classification: preserved ? "optional-regression" : "infrastructure",
    reasonCode: preserved ? "UNEXPECTED_CONTINUATION_PRESERVED" : "INFRASTRUCTURE_FAILURE",
    detail,
    serverState: input.serverState,
    clientReceiptPresent: false,
  });
}
