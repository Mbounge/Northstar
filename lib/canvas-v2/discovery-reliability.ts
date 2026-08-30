import type { CanvasV2LoopState } from "@/lib/canvas-v2/design-loop";
import type {
  CanvasV2DiscoveryMove,
  CanvasV2DiscoverySourceCategory,
  CanvasV2DiscoveryStateTransition,
} from "@/lib/canvas-v2/discovery-state";
import {
  canvasV2ProviderUsageSignals,
  canvasV2ProviderUsageFromAttempts,
  mergeCanvasV2ProviderUsage,
  type CanvasV2ProviderAttemptAudit,
} from "@/lib/canvas-v2/request-reliability";

export const CANVAS_V2_MOUNT_OLYMPUS_RECEIPT_SCHEMA = "canvas-v2.mount-olympus-receipt.v1" as const;

export interface CanvasV2MountOlympusReceipt {
  schema: typeof CANVAS_V2_MOUNT_OLYMPUS_RECEIPT_SCHEMA;
  runId: string;
  objective: string;
  status: CanvasV2LoopState["status"];
  sourceRouting: {
    consulted: CanvasV2DiscoverySourceCategory[];
    transitions: Array<{
      from: CanvasV2DiscoverySourceCategory;
      to: CanvasV2DiscoverySourceCategory;
      moveId: string;
    }>;
    nonlinear: boolean;
    repeatedExternalRequestCount: number;
  };
  decisionReadiness: {
    ready: boolean;
    criteria: string[];
    satisfiedCriteria: string[];
    materialOpenRequirements: string[];
    rationale: string;
  };
  humanAuthority: {
    inputCount: number;
    conclusionCount: number;
    validationResultCount: number;
    selectedCanvasNodeCount: number;
    preserved: boolean;
  };
  composition: {
    verifiedCommitCount: number;
    researchCommitCount: number;
    designCommitCount: number;
    timeToFirstUsefulCanvasMs?: number;
    materialTurnLatencyMs: number[];
    finalSummaryPresent: boolean;
  };
  reliability: {
    providerAttemptCount: number;
    firstPass: boolean;
    attributed: boolean;
    invalidDraftCount: number;
    providerRejectionCount: number;
    infrastructureFailureCount: number;
    privateRenderRepairCount: number;
    privatePhaseRecoveryCount: number;
    retryStorm: boolean;
    recoverableFailureLeaked: boolean;
  };
  efficiency: {
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    cacheReadShare: number;
    diagnosticSignals: Array<"request-density" | "uncached-input-density" | "cache-write-density">;
  };
  epistemicIntegrity: {
    observationAndCalculationLineageComplete: boolean;
    humanResultsKeepHumanLineage: boolean;
    openContradictionCount: number;
  };
  release: {
    healthy: boolean;
    blockers: string[];
  };
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function canvasV2ExternalDiscoveryFingerprint(move: Pick<CanvasV2DiscoveryMove, "kind" | "question" | "targetNames" | "externalResearchRequest">): string | undefined {
  if (!move.externalResearchRequest) return undefined;
  return normalized([
    move.kind,
    move.question,
    move.externalResearchRequest.question,
    move.externalResearchRequest.evidenceGap,
    ...move.targetNames,
  ].join(" | "));
}

/**
 * Public research is governed by information progress, not a move count. A
 * repeated request for the same unresolved gap is redirected to synthesis;
 * a materially different gap remains eligible regardless of run length.
 */
export function constrainCanvasV2ExternalDiscoveryProgress(input: {
  transition: CanvasV2DiscoveryStateTransition;
  acceptedMoves: ReadonlyArray<Pick<CanvasV2DiscoveryMove, "kind" | "question" | "targetNames" | "sourceCategories" | "externalResearchRequest">>;
}): CanvasV2DiscoveryStateTransition {
  if (!input.transition.move.sourceCategories.includes("external")) return input.transition;
  const fingerprint = canvasV2ExternalDiscoveryFingerprint(input.transition.move);
  if (!fingerprint) return input.transition;
  const repeated = input.acceptedMoves.some((move) => (
    move.sourceCategories.includes("external")
    && canvasV2ExternalDiscoveryFingerprint(move) === fingerprint
  ));
  if (!repeated) return input.transition;
  const move = { ...input.transition.move };
  delete move.externalResearchRequest;
  return {
    ...input.transition,
    move: {
      ...move,
      kind: "compose",
      label: "Synthesize the retained evidence",
      rationale: "The same public-evidence gap was already investigated. Repeating it would add activity without reducing uncertainty, so use the retained sources or state the remaining boundary.",
      expectedInformationGain: "Turn the retained evidence into decision-relevant understanding without repeating an unchanged search.",
      sourceCategories: ["canvas"],
      targetNames: [],
      evidenceNodeIds: [],
      cost: "low",
      latency: "instant",
      status: "active",
      visibleAction: "compose",
      continueWhen: "A materially different unresolved question emerges from the synthesis.",
      stopWhen: "The requested synthesis and its evidence boundaries are visible.",
    },
    progress: {
      stage: "composing",
      label: "Turning the research into a decision",
      detail: "The useful outside evidence is gathered. North Star is now making the answer legible on the board.",
    },
  };
}

function attemptKey(attempt: CanvasV2ProviderAttemptAudit): string {
  return [
    attempt.model,
    attempt.provider ?? "",
    attempt.role ?? "",
    attempt.attempt ?? "",
    attempt.outcome,
    attempt.durationMs,
    attempt.detail ?? "",
    JSON.stringify(attempt.usage ?? {}),
    JSON.stringify(attempt.request ?? {}),
  ].join(":");
}

function allAttempts(loop: CanvasV2LoopState, routerAttempts: readonly CanvasV2ProviderAttemptAudit[]): CanvasV2ProviderAttemptAudit[] {
  const byKey = new Map<string, CanvasV2ProviderAttemptAudit>();
  for (const attempt of [
    ...routerAttempts,
    ...(loop.priorSteps ?? []).flatMap((step) => step.providerAttempts ?? []),
    ...loop.steps.flatMap((step) => step.providerAttempts ?? []),
    ...(loop.providerAttempts ?? []),
  ]) byKey.set(attemptKey(attempt), attempt);
  return Array.from(byKey.values());
}

function sourceJourney(loop: CanvasV2LoopState): CanvasV2DiscoveryMove[] {
  const moves = loop.discoveryState?.moves ?? [
    ...(loop.priorSteps ?? []).flatMap((step) => step.discoveryMove ? [step.discoveryMove] : []),
    ...loop.steps.flatMap((step) => step.discoveryMove ? [step.discoveryMove] : []),
  ];
  const seen = new Set<string>();
  return moves.filter((move) => {
    if (seen.has(move.id)) return false;
    seen.add(move.id);
    return true;
  });
}

export function buildCanvasV2MountOlympusReceipt(input: {
  loop: CanvasV2LoopState;
  routerAttempts?: readonly CanvasV2ProviderAttemptAudit[];
  recoverableFailureLeaked?: boolean;
}): CanvasV2MountOlympusReceipt {
  const { loop } = input;
  const moves = sourceJourney(loop);
  const consulted = unique(moves.flatMap((move) => move.sourceCategories));
  const transitions: CanvasV2MountOlympusReceipt["sourceRouting"]["transitions"] = [];
  let previous: CanvasV2DiscoverySourceCategory | undefined;
  for (const move of moves) {
    for (const category of move.sourceCategories) {
      if (previous && previous !== category) transitions.push({ from: previous, to: category, moveId: move.id });
      previous = category;
    }
  }
  const externalFingerprints = moves.flatMap((move) => {
    const fingerprint = canvasV2ExternalDiscoveryFingerprint(move);
    return fingerprint ? [fingerprint] : [];
  });
  const repeatedExternalRequestCount = externalFingerprints.length - new Set(externalFingerprints).size;
  const attempts = allAttempts(loop, input.routerAttempts ?? []);
  const usage = mergeCanvasV2ProviderUsage(
    canvasV2ProviderUsageFromAttempts(attempts),
    attempts.length ? undefined : loop.providerUsage,
  );
  const invalidDraftCount = attempts.filter((attempt) => attempt.outcome === "invalid-response").length;
  const providerRejectionCount = attempts.filter((attempt) => attempt.outcome === "rejected").length;
  const infrastructureFailureCount = attempts.filter((attempt) => ["provider-unavailable", "rate-limited", "timeout", "transport"].includes(attempt.outcome)).length;
  const attributed = attempts.every((attempt) => Boolean(attempt.role) && Boolean(attempt.provider || attempt.model));
  const privateRenderRepairCount = [...(loop.priorSteps ?? []), ...loop.steps]
    .reduce((total, step) => total + (step.renderRepairCount ?? 0), loop.renderRepair?.attempt ?? 0);
  const privatePhaseRecoveryCount = [...(loop.priorSteps ?? []), ...loop.steps]
    .reduce((total, step) => total + (step.privateRecoveryCount ?? 0), loop.privateRecovery?.occurrence ?? 0);
  const semanticFailureCount = invalidDraftCount + providerRejectionCount;
  const retryStorm = semanticFailureCount > 1 || privateRenderRepairCount > 1 || privatePhaseRecoveryCount > 1;
  const discovery = loop.discoveryState;
  const readiness = discovery?.completion;
  const humanInputs = discovery?.humanInputs ?? [];
  const humanConclusions = discovery?.humanConclusions ?? [];
  const validationResults = (discovery?.validationBacklog ?? []).filter((plan) => Boolean(plan.result));
  const activeValidationIds = (discovery?.validationBacklog ?? [])
    .filter((plan) => plan.status === "proposed" || plan.status === "accepted" || plan.status === "in-progress")
    .map((plan) => plan.id);
  const presentedValidationIds = new Set(discovery?.presentedValidationIds ?? []);
  const unpresentedValidationIds = activeValidationIds.filter((id) => !presentedValidationIds.has(id));
  const validationCriterion = /\b(?:human[- ]run|validation|interview|experiment|measurement|research brief|decision gate|strengthen|weaken|overturn)\b/i;
  const receiptSatisfiedCriteria = (readiness?.satisfiedCriteria ?? []).filter((criterion) => (
    !unpresentedValidationIds.length || !validationCriterion.test(criterion)
  ));
  const decisionReady = loop.status === "completed"
    && loop.steps.length > 0
    && Boolean(loop.finalSummary?.trim())
    && (!discovery || (
      discovery.status === "complete"
      && readiness?.readiness === "complete"
      && readiness.materialOpenRequirements.length === 0
      && readiness.criteria.every((criterion) => receiptSatisfiedCriteria.includes(criterion))
    ));
  const observationAndCalculationLineageComplete = (discovery?.statements ?? []).every((statement) => (
    (statement.kind !== "observation" && statement.kind !== "calculation") || statement.evidenceNodeIds.length > 0
  ));
  const humanResultsKeepHumanLineage = validationResults.every((plan) => (
    Boolean(plan.result?.humanInputId)
    && Boolean(humanInputs.find((humanInput) => humanInput.id === plan.result?.humanInputId))
  ));
  const blockers: string[] = [];
  if (loop.status === "completed" && !decisionReady) blockers.push("A completed run is not decision-ready against its inquiry-specific criteria.");
  if (input.recoverableFailureLeaked) blockers.push("A recoverable internal failure leaked into the product experience.");
  if (!attributed && attempts.length) blockers.push("At least one provider attempt lacks role or provider attribution.");
  if (semanticFailureCount) blockers.push("A provider draft failed a deterministic phase contract.");
  if (privateRenderRepairCount) blockers.push("A composition required private browser-render repair instead of a first-pass commit.");
  if (privatePhaseRecoveryCount) blockers.push("A private phase required replanning from committed truth instead of succeeding first-pass.");
  if (retryStorm) blockers.push("The run entered a corrective retry storm.");
  if (repeatedExternalRequestCount) blockers.push("The run repeated an unchanged public-evidence request.");
  if (!observationAndCalculationLineageComplete) blockers.push("An observation or calculation lacks exact evidence lineage.");
  if (!humanResultsKeepHumanLineage) blockers.push("A human-supplied result lost its human-input lineage.");
  if (unpresentedValidationIds.length) blockers.push("A human validation exists in discovery state without a verified visible validation chapter on the canvas.");
  if (loop.status === "completed" && loop.steps.length === 0) blockers.push("A mutating run completed without a verified canvas commit.");
  const elapsed = [...(loop.priorSteps ?? []), ...loop.steps].flatMap((step) => typeof step.elapsedMs === "number" ? [step.elapsedMs] : []);
  const inputTokens = usage.inputTokens;
  const usageSignals = canvasV2ProviderUsageSignals(usage, loop.providerUsageCheckpoint);
  return {
    schema: CANVAS_V2_MOUNT_OLYMPUS_RECEIPT_SCHEMA,
    runId: loop.id,
    objective: loop.instruction,
    status: loop.status,
    sourceRouting: {
      consulted,
      transitions,
      nonlinear: transitions.length > 0 || humanInputs.length > 0,
      repeatedExternalRequestCount,
    },
    decisionReadiness: {
      ready: decisionReady,
      criteria: [...(readiness?.criteria ?? [])],
      satisfiedCriteria: receiptSatisfiedCriteria,
      materialOpenRequirements: [...(readiness?.materialOpenRequirements ?? [])],
      rationale: readiness?.rationale ?? loop.finalSummary ?? "The inquiry has not reached a completion judgment.",
    },
    humanAuthority: {
      inputCount: humanInputs.length,
      conclusionCount: humanConclusions.length,
      validationResultCount: validationResults.length,
      selectedCanvasNodeCount: discovery?.selectedCanvasNodeIds.length ?? loop.workingContext?.selectedNodeIds.length ?? 0,
      preserved: humanResultsKeepHumanLineage,
    },
    composition: {
      verifiedCommitCount: loop.steps.length,
      researchCommitCount: loop.steps.filter((step) => step.kind === "research").length,
      designCommitCount: loop.steps.filter((step) => step.kind === "design").length,
      ...(elapsed.length ? { timeToFirstUsefulCanvasMs: elapsed[0] } : {}),
      materialTurnLatencyMs: elapsed,
      finalSummaryPresent: Boolean(loop.finalSummary?.trim()),
    },
    reliability: {
      providerAttemptCount: attempts.length,
      firstPass: attempts.every((attempt) => attempt.outcome === "completed" && (attempt.attempt ?? 1) === 1) && privateRenderRepairCount === 0 && privatePhaseRecoveryCount === 0,
      attributed,
      invalidDraftCount,
      providerRejectionCount,
      infrastructureFailureCount,
      privateRenderRepairCount,
      privatePhaseRecoveryCount,
      retryStorm,
      recoverableFailureLeaked: Boolean(input.recoverableFailureLeaked),
    },
    efficiency: {
      inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      totalTokens: usage.totalTokens,
      cacheReadShare: inputTokens ? Number((usage.cachedInputTokens / inputTokens).toFixed(4)) : 0,
      diagnosticSignals: usageSignals.signals,
    },
    epistemicIntegrity: {
      observationAndCalculationLineageComplete,
      humanResultsKeepHumanLineage,
      openContradictionCount: discovery?.contradictions.filter((item) => item.status === "open").length ?? 0,
    },
    release: {
      healthy: blockers.length === 0,
      blockers,
    },
  };
}
