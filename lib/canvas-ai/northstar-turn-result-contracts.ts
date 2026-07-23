import {
  collectNorthstarKnownEvidenceIdentities,
  exactIdentityLedgerValues,
} from "@/lib/canvas-ai/northstar-evidence-identities";
import type {
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";
import {
  assertValidNorthstarLedgerValue,
  cloneNorthstarLedgerValue,
  stableStringifyNorthstarLedgerValue,
} from "@/lib/canvas-ledger/northstar-ledger-value";
import { NorthstarTurnValidationError } from "@/lib/canvas-ai/northstar-turn-validation";
import type { NorthstarTurnEvidenceAsset } from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  normalizeNorthstarArtboardMutationResult,
  normalizeNorthstarDesignResult,
  normalizeNorthstarResearchResult,
  normalizeNorthstarVerificationResult,
  northstarObjectiveNeedsResilientVisualPipeline,
} from "@/lib/canvas-ai/northstar-turn-resilience";

function fail(code: string, message: string): never {
  throw new NorthstarTurnValidationError(code, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail("RESULT_CONTRACT_INVALID", `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail("RESULT_CONTRACT_INVALID", `${path} must be an array.`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fail("RESULT_CONTRACT_INVALID", `${path} must be a non-empty string.`);
  }
  return value.trim();
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((entry, index) => string(entry, `${path}[${index}]`));
}

function ledgerArray(value: unknown, path: string): NorthstarLedgerValue[] {
  return array(value, path).map((entry, index) => {
    try {
      assertValidNorthstarLedgerValue(entry, `${path}[${index}]`);
      return cloneNorthstarLedgerValue(entry);
    } catch (error) {
      return fail(
        "RESULT_CONTRACT_INVALID",
        error instanceof Error ? error.message : `${path}[${index}] must be a ledger value.`,
      );
    }
  });
}

function mergeUniqueLedgerValues(
  left: readonly NorthstarLedgerValue[],
  right: readonly NorthstarLedgerValue[],
): NorthstarLedgerValue[] {
  const values = new Map<string, NorthstarLedgerValue>();
  for (const value of [...left, ...right]) {
    values.set(stableStringifyNorthstarLedgerValue(value), cloneNorthstarLedgerValue(value));
  }
  return [...values.values()];
}

function toolContextHasFailedResult(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(toolContextHasFailedResult);
  if (!value || typeof value !== "object") return false;
  const recordValue = value as Record<string, unknown>;
  if (recordValue.ok === false) return true;
  return Object.values(recordValue).some(toolContextHasFailedResult);
}


function visualObservationIds(
  value: NorthstarLedgerValue,
  path: string,
): string[] {
  const observation = record(value, path);
  const direct = typeof observation.screenshotId === "string" && observation.screenshotId.trim()
    ? [observation.screenshotId.trim()]
    : [];
  const multiple = observation.screenshotIds === undefined
    ? []
    : stringArray(observation.screenshotIds, `${path}.screenshotIds`);
  const ids = [...new Set([...direct, ...multiple])];
  if (ids.length === 0) {
    return fail(
      "VISUAL_OBSERVATION_IDENTITY_MISSING",
      `${path} must cite screenshotId or screenshotIds.`,
    );
  }
  return ids;
}

function validateModelTenantIdentities(
  modelIdentities: readonly NorthstarLedgerValue[],
  deterministicIdentities: ReturnType<typeof collectNorthstarKnownEvidenceIdentities>,
): void {
  const appIds = new Set(deterministicIdentities.apps.map((identity) => identity.appId));
  const flowIds = new Set(deterministicIdentities.flows.map((identity) => identity.flowId));
  const screenshotIds = new Set(
    deterministicIdentities.screenshots.map((identity) => identity.screenshotId),
  );
  modelIdentities.forEach((identity, index) => {
    if (!identity || typeof identity !== "object" || Array.isArray(identity)) return;
    const record = identity as Record<string, NorthstarLedgerValue>;
    if (typeof record.appId === "string" && !appIds.has(record.appId)) {
      fail(
        "EXACT_IDENTITY_UNGROUNDED",
        `$.result.exactIdentities[${index}].appId was not returned by committed tenant evidence.`,
      );
    }
    if (typeof record.flowId === "string" && !flowIds.has(record.flowId)) {
      fail(
        "EXACT_IDENTITY_UNGROUNDED",
        `$.result.exactIdentities[${index}].flowId was not returned by committed tenant evidence.`,
      );
    }
    if (typeof record.screenshotId === "string" && !screenshotIds.has(record.screenshotId)) {
      fail(
        "EXACT_IDENTITY_UNGROUNDED",
        `$.result.exactIdentities[${index}].screenshotId was not returned by committed tenant evidence.`,
      );
    }
  });
}

function validateResearchResult(
  result: NorthstarLedgerValue,
  toolContext: NorthstarLedgerValue | undefined,
  ledgerContext: NorthstarLedgerLLMContext | undefined,
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[],
): NorthstarLedgerValue {
  const input = record(result, "$.result");
  if (input.schema !== "northstar.research-result.v1") {
    return fail("RESEARCH_RESULT_SCHEMA_INVALID", "Research tasks must return schema northstar.research-result.v1.");
  }
  const findings = ledgerArray(input.findings, "$.result.findings");
  const modelIdentities = ledgerArray(input.exactIdentities, "$.result.exactIdentities");
  const evidenceGraphDelta = ledgerArray(input.evidenceGraphDelta, "$.result.evidenceGraphDelta");
  const visualObservations = ledgerArray(input.visualObservations, "$.result.visualObservations");
  const remainingGaps = stringArray(input.remainingGaps, "$.result.remainingGaps");
  if (typeof input.sufficientForNextStep !== "boolean") {
    return fail("RESEARCH_RESULT_SCHEMA_INVALID", "$.result.sufficientForNextStep must be boolean.");
  }
  if (visualObservations.length > 0 && evidenceAssets.length === 0) {
    return fail(
      "VISUAL_OBSERVATION_UNGROUNDED",
      "Research returned visual observations without any attached screenshot evidence.",
    );
  }
  if (visualObservations.length > 0) {
    const attachedIds = new Set(evidenceAssets.map((asset) => asset.id));
    visualObservations.forEach((observation, index) => {
      for (const screenshotId of visualObservationIds(
        observation,
        `$.result.visualObservations[${index}]`,
      )) {
        if (!attachedIds.has(screenshotId)) {
          return fail(
            "VISUAL_OBSERVATION_IDENTITY_MISMATCH",
            `$.result.visualObservations[${index}] cites unattached screenshot ${screenshotId}.`,
          );
        }
      }
    });
  }

  const deterministicIdentityGraph = collectNorthstarKnownEvidenceIdentities({
    ledgerContext,
    toolContext,
  });
  validateModelTenantIdentities(modelIdentities, deterministicIdentityGraph);
  const deterministicIdentities = exactIdentityLedgerValues(deterministicIdentityGraph);
  const exactIdentities = mergeUniqueLedgerValues(modelIdentities, deterministicIdentities);
  const suggestedNextEvidenceActivities = input.suggestedNextEvidenceActivities === undefined
    ? undefined
    : ledgerArray(input.suggestedNextEvidenceActivities, "$.result.suggestedNextEvidenceActivities");
  const sufficientForNextStep = toolContextHasFailedResult(toolContext)
    ? false
    : input.sufficientForNextStep;

  return {
    schema: "northstar.research-result.v1",
    findings,
    exactIdentities,
    evidenceGraphDelta,
    visualObservations,
    remainingGaps,
    sufficientForNextStep,
    ...(suggestedNextEvidenceActivities ? { suggestedNextEvidenceActivities } : {}),
  };
}

function validateDesignIntelligenceResult(result: NorthstarLedgerValue): NorthstarLedgerValue {
  const input = record(result, "$.result");
  if (input.schema !== "northstar.design-intelligence-result.v1") {
    return fail(
      "DESIGN_INTELLIGENCE_SCHEMA_INVALID",
      "Analysis tasks must return schema northstar.design-intelligence-result.v1.",
    );
  }
  const nextVisibleMoveInput = record(input.nextVisibleMove, "$.result.nextVisibleMove");
  const alternateDirections = array(
    input.alternateDirectionsConsidered,
    "$.result.alternateDirectionsConsidered",
  ).map((entry, index) => {
    const direction = record(entry, `$.result.alternateDirectionsConsidered[${index}]`);
    return {
      concept: string(direction.concept, `$.result.alternateDirectionsConsidered[${index}].concept`),
      whyRejectedForNow: string(
        direction.whyRejectedForNow,
        `$.result.alternateDirectionsConsidered[${index}].whyRejectedForNow`,
      ),
    };
  });
  if (typeof input.provisional !== "boolean") {
    return fail("DESIGN_INTELLIGENCE_SCHEMA_INVALID", "$.result.provisional must be boolean.");
  }
  return {
    schema: "northstar.design-intelligence-result.v1",
    viewerJob: string(input.viewerJob, "$.result.viewerJob"),
    editorialArgument: string(input.editorialArgument, "$.result.editorialArgument"),
    threeSecondRead: string(input.threeSecondRead, "$.result.threeSecondRead"),
    visualThesis: string(input.visualThesis, "$.result.visualThesis"),
    informationTopology: string(input.informationTopology, "$.result.informationTopology"),
    evidenceHierarchy: ledgerArray(input.evidenceHierarchy, "$.result.evidenceHierarchy"),
    governingVisualIdea: string(input.governingVisualIdea, "$.result.governingVisualIdea"),
    spatialLogic: string(input.spatialLogic, "$.result.spatialLogic"),
    emotionalRegister: string(input.emotionalRegister, "$.result.emotionalRegister"),
    signatureMove: string(input.signatureMove, "$.result.signatureMove"),
    provisional: input.provisional,
    unresolvedQuestions: stringArray(input.unresolvedQuestions, "$.result.unresolvedQuestions"),
    nextVisibleMove: {
      intent: string(nextVisibleMoveInput.intent, "$.result.nextVisibleMove.intent"),
      expectedVisibleDelta: string(
        nextVisibleMoveInput.expectedVisibleDelta,
        "$.result.nextVisibleMove.expectedVisibleDelta",
      ),
      acceptanceCriteria: stringArray(
        nextVisibleMoveInput.acceptanceCriteria,
        "$.result.nextVisibleMove.acceptanceCriteria",
      ),
    },
    alternateDirectionsConsidered: alternateDirections,
  };
}

function validateVerificationResult(result: NorthstarLedgerValue): NorthstarLedgerValue {
  const input = record(result, "$.result");
  if (input.schema !== "northstar.verification-result.v1") {
    return fail(
      "VERIFICATION_RESULT_SCHEMA_INVALID",
      "Verification tasks must return schema northstar.verification-result.v1.",
    );
  }
  for (const field of [
    "objectiveSatisfied",
    "evidenceGrounded",
    "artboardStable",
    "readingPathClear",
  ] as const) {
    if (typeof input[field] !== "boolean") {
      return fail(
        "VERIFICATION_RESULT_SCHEMA_INVALID",
        `$.result.${field} must be boolean.`,
      );
    }
  }
  const objectiveSatisfied = input.objectiveSatisfied as boolean;
  const evidenceGrounded = input.evidenceGrounded as boolean;
  const artboardStable = input.artboardStable as boolean;
  const readingPathClear = input.readingPathClear as boolean;
  const issues = stringArray(input.issues, "$.result.issues");
  if (input.recommendation !== "finalize" && input.recommendation !== "revise") {
    return fail(
      "VERIFICATION_RESULT_SCHEMA_INVALID",
      "$.result.recommendation must be finalize or revise.",
    );
  }
  const recommendation = input.recommendation;
  const allClear = objectiveSatisfied
    && evidenceGrounded
    && artboardStable
    && readingPathClear
    && issues.length === 0;
  if ((recommendation === "finalize") !== Boolean(allClear)) {
    return fail(
      "VERIFICATION_RESULT_INCONSISTENT",
      "Verification may recommend finalize only when every check passes and issues is empty.",
    );
  }
  return {
    schema: "northstar.verification-result.v1",
    objectiveSatisfied,
    evidenceGrounded,
    artboardStable,
    readingPathClear,
    issues,
    recommendation,
  };
}

function validateArtboardMutationDraft(result: NorthstarLedgerValue): NorthstarLedgerValue {
  const input = record(result, "$.result");
  if (input.schema !== "northstar.artboard-mutation-draft.v1") {
    return fail(
      "ARTBOARD_MUTATION_SCHEMA_INVALID",
      "Artboard mutation tasks must return schema northstar.artboard-mutation-draft.v1.",
    );
  }
  const operations = array(input.operations, "$.result.operations");
  if (operations.length === 0) {
    return fail("ARTBOARD_MUTATION_EMPTY", "An artboard mutation must contain at least one primitive operation.");
  }
  return cloneNorthstarLedgerValue(result);
}

export function validateNorthstarTaskResultContract(input: {
  task: NorthstarLedgerTask;
  result: NorthstarLedgerValue;
  toolContext?: NorthstarLedgerValue;
  ledgerContext?: NorthstarLedgerLLMContext;
  evidenceAssets?: readonly NorthstarTurnEvidenceAsset[];
  evidenceAttachmentReport?: NorthstarLedgerValue;
}): NorthstarLedgerValue {
  if (!input.ledgerContext) return cloneNorthstarLedgerValue(input.result);
  if (!northstarObjectiveNeedsResilientVisualPipeline(input.ledgerContext.run.objective)) {
    if (input.task.kind === "research") {
      return validateResearchResult(
        input.result,
        input.toolContext,
        input.ledgerContext,
        input.evidenceAssets ?? [],
      );
    }
    if (input.task.kind === "analysis") return validateDesignIntelligenceResult(input.result);
    if (input.task.kind === "artboard-mutation") return validateArtboardMutationDraft(input.result);
    if (input.task.kind === "verification") return validateVerificationResult(input.result);
    return cloneNorthstarLedgerValue(input.result);
  }
  if (input.task.kind === "research") {
    return normalizeNorthstarResearchResult({
      modelResult: input.result,
      toolContext: input.toolContext,
      ledgerContext: input.ledgerContext,
      evidenceAssets: input.evidenceAssets ?? [],
      attachmentReport: input.evidenceAttachmentReport,
    });
  }
  if (input.task.kind === "analysis") {
    return normalizeNorthstarDesignResult({
      modelResult: input.result,
      ledgerContext: input.ledgerContext,
    });
  }
  if (input.task.kind === "artboard-mutation") {
    return normalizeNorthstarArtboardMutationResult({
      modelResult: input.result,
      ledgerContext: input.ledgerContext,
      evidenceAssets: input.evidenceAssets ?? [],
    });
  }
  if (input.task.kind === "verification") {
    return normalizeNorthstarVerificationResult({
      modelResult: input.result,
      ledgerContext: input.ledgerContext,
    });
  }
  return cloneNorthstarLedgerValue(input.result);
}
