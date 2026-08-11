// Northstar production design loop — one universal path for every objective.
import { createHash } from "node:crypto";
import {
  NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
  appendNorthstarArtboardMutation,
  sanitizeNorthstarArtboardMutationDraft,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardMutationBatch,
  NorthstarAuthoredDesignRelation,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarLiveSurfaceSnapshot,
} from "@/lib/canvas-artifacts/types";
import {
  buildNorthstarCumulativeIntentAudit,
  type NorthstarCumulativeIntentAudit,
  type NorthstarCollateralGeometryFinding,
} from "@/lib/canvas-ai/northstar-cumulative-intent-audit";
import {
  buildNorthstarRenderedIntegrityAudit,
  type NorthstarRenderedIntegrityAudit,
} from "@/lib/canvas-ai/northstar-rendered-integrity-audit";
import {
  buildNorthstarObservedSpatialFacts,
  type NorthstarObservedPlacementTerritory,
  type NorthstarPlacementSide,
} from "@/lib/canvas-ai/northstar-turn-write-scope";

export const NORTHSTAR_PRODUCTION_DESIGN_LOOP_VERSION =
  "northstar.production-design-loop.v1" as const;

// Patch 3A keeps the live artboard as the only design surface. A model turn is
// applied first; Patch 1/2 review the exact browser result afterwards. There is
// no hidden review candidate or promotion phase in this protocol.
export const NORTHSTAR_PATCH_3A_DIRECT_LIVE_REVIEW_VERSION =
  "northstar.patch3a.direct-live-review.v1" as const;
export const NORTHSTAR_DESIGN_TURN_VISIBLE_TARGET_MS = 5_000 as const;
export const NORTHSTAR_PATCH_3B_LIVE_REPAIR_VERSION =
  "northstar.patch3b.live-repair-loop.v1" as const;
export const NORTHSTAR_PATCH_3B_REPAIR_MEMORY_ADDON_VERSION =
  "northstar.patch3b.repair-memory-addon.v1" as const;
export const NORTHSTAR_PATCH_3B_COLLATERAL_CHANGE_ADDON_VERSION =
  "northstar.patch3b.collateral-change-addon.v1" as const;
export const NORTHSTAR_PATCH_3B_REACTIVE_CONVERGENCE_ADDON_VERSION =
  "northstar.patch3b.reactive-aware-convergence-addon.v1" as const;

// A sequence number is telemetry, never policy. Any positive objective index is
// accepted and the engine must not branch on a particular value.
export type NorthstarDesignResetTurn = number;


export type NorthstarSemanticRelation = "below" | "right-of" | "relationship-between" | "equal-space-with-annotation" | "explains" | "reuses" | "none";

export type NorthstarDesignResetGrounding = {
  conceptId: "research" | "evidence-relationship" | "evidence-gap-annotation" | "evidence-explanation" | "flow-structure" | "evidence-reuse";
  resolvedNodeId: string;
  requestedRelation: NorthstarSemanticRelation;
  placementSpace: "artboard-world";
  referenceContinuity: "pixel-stable";
  expansionDirection: "down" | "right" | "none";
  evidenceNodeIds: string[];
  expectedPreservedNodeIds: string[];
  interpretation: string;
};

export type NorthstarArtboardSemanticGraph = {
  schema: "northstar.artboard-semantic-graph.v1";
  revisionId: string;
  sourceSha256: string;
  concepts: Array<{
    conceptId: string;
    label: string;
    definition: string;
    canonicalNodeIds: string[];
    aliases: string[];
    exclusions: string[];
  }>;
  regions: Array<{
    regionId: string;
    conceptId: string;
    rootNodeId: string;
    memberNodeIds: string[];
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    anchors?: { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number };
    preservation: "permanent" | "editable" | "derived";
    continuity?: {
      source: "unchanged";
      evidenceIdentity: "unchanged";
      itemDimensions: "unchanged";
      itemOrder: "unchanged";
      placement: "recomposable-when-needed";
      visualAppearance: "unchanged";
    };
  }>;
  artboard: {
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    expansionModel: "infinite-world-space";
  };
  evidenceItems: Array<{
    nodeId: string;
    flowId: string;
    index: number;
    evidenceId?: string;
    appName?: string;
    flowName?: string;
    title?: string;
    journeyStage?: string;
    visibleCopy: string[];
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    anchors?: { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number };
  }>;
  nodes: Array<{
    nodeId: string;
    parentId?: string;
    role: string;
    text: string;
    evidenceId?: string;
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    anchors?: { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number };
  }>;
  relationships: Array<{ subjectId: string; predicate: string; objectId: string }>;
  vocabulary: {
    research: string;
    workingReasoning: string;
    below: string;
    rightOf: string;
    verticalCenterAlignment: string;
    authoritativeSpatialAnchors: string;
    evidenceIntegrity: string;
    spatialRecomposition: string;
    worldSpaceObjectTopology: string;
    authoredNodeIdentity: string;
    authoredRelationshipProvenance: string;
    authoredAnnotationProvenance: string;
    reactiveSpatialDependencies: string;
  };
};

export type NorthstarDesignResetProviderAttemptAudit = {
  attempt: number;
  model: string;
  requestUrl: string;
  requestBody: unknown;
  requestBodyBytes: number;
  requestBodySha256: string;
  requestedAt: string;
  completedAt?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  providerPayload?: unknown;
  providerPayloadBytes?: number;
  providerPayloadSha256?: string;
  rawModelText?: string;
  rawModelTextBytes?: number;
  rawModelTextSha256?: string;
  parsedModelResponse?: unknown;
  usage?: NorthstarModelTokenUsage;
  error?: string;
};

export type NorthstarModelTokenUsage = {
  promptTokenCount: number;
  cachedContentTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
};

export function readNorthstarModelTokenUsage(payload: unknown): NorthstarModelTokenUsage | undefined {
  if (!isRecord(payload) || !isRecord(payload.usageMetadata)) return undefined;
  const usage = payload.usageMetadata;
  const count = (key: string) => {
    const value = usage[key];
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  };
  const result = {
    promptTokenCount: count("promptTokenCount"),
    cachedContentTokenCount: count("cachedContentTokenCount"),
    candidatesTokenCount: count("candidatesTokenCount"),
    thoughtsTokenCount: count("thoughtsTokenCount"),
    totalTokenCount: count("totalTokenCount"),
  };
  return Object.values(result).some((value) => value > 0) ? result : undefined;
}

export type NorthstarExactStringDiff = {
  unchangedPrefixLength: number;
  unchangedSuffixLength: number;
  removed: string;
  added: string;
};

export type NorthstarExactDocumentDiff = {
  html: NorthstarExactStringDiff;
  css: NorthstarExactStringDiff;
  javascript: NorthstarExactStringDiff;
  creativeJavascript: NorthstarExactStringDiff;
  cssLayers: {
    added: Record<string, string>;
    removed: Record<string, string>;
    changed: Record<string, { before: string; after: string; diff: NorthstarExactStringDiff }>;
  };
};

export type NorthstarObjectiveActionPlan = {
  objectiveSummary: string;
  plannedActions: string[];
  completedActions: string[];
};

export type NorthstarDesignResetModelResponse = {
  turn: NorthstarDesignResetTurn;
  observedBaseRevisionId: string;
  understanding: string;
  grounding: NorthstarDesignResetGrounding;
  mutation: NorthstarArtboardMutationDraft;
};

export type NorthstarDesignResetExecuteResponse = NorthstarDesignResetModelResponse & {
  objectivePlan: NorthstarObjectiveActionPlan;
  decision: "execute-action";
  action: {
    actionId: string;
    intent: string;
    successSignal: string;
  };
};

export type NorthstarDesignResetCompleteResponse = {
  turn: NorthstarDesignResetTurn;
  observedBaseRevisionId: string;
  understanding: string;
  objectivePlan: NorthstarObjectiveActionPlan;
  decision: "objective-complete";
  completionRationale: string;
  completionEvidence: {
    observedRevisionId: string;
    satisfiedSignals: string[];
    verifiedNodeIds: string[];
    measuredFacts: string[];
    remainingIssues: string[];
  };
};

export type NorthstarDesignTurnIdentityAuthority = {
  browserRevisionId: string;
  knownNodeIds: string[];
  knownRegionIds: string[];
  knownConceptIds: string[];
  knownAuthoredRelationIds: string[];
  protectedEvidenceNodeIds: string[];
};

export type NorthstarObservedObjectiveTurn = {
  actionId: string;
  intent: string;
  successSignal: string;
  baseRevisionId: string;
  observedRevisionId: string;
  changedNodeIds: string[];
  browserStatus: NorthstarArtifactMutationAcknowledgement["status"];
  remainingFindings: string[];
};

export type NorthstarObjectiveDecisionResponse =
  | NorthstarDesignResetExecuteResponse
  | NorthstarDesignResetCompleteResponse;

export type NorthstarDesignResetTurnArchive = {
  schema: "northstar.design-reset-turn-archive.v5";
  resetVersion: typeof NORTHSTAR_PRODUCTION_DESIGN_LOOP_VERSION;
  runId: string;
  artifactId: string;
  turn: NorthstarDesignResetTurn;
  requestedThinkingMode: "low" | "medium" | "high";
  effectiveDesignMode: "ordered-objective-queue";
  instruction: string;
  status: "model-failed" | "dispatch-failed" | "committed";
  recordedAt: string;
  sourceBefore: {
    revisionId: string;
    package: NorthstarGeneratedCodeArtifactPackage;
    snapshot?: NorthstarLiveSurfaceSnapshot;
    observationSource: "browser-snapshot" | "canonical-package";
    acknowledgement: NorthstarArtifactMutationAcknowledgement;
    sourceSha256: string;
    semanticGraph: NorthstarArtboardSemanticGraph;
  };
  modelBoundary: {
    systemInstruction: string;
    contents: unknown[];
    responseSchema: unknown;
    providerAttempt: NorthstarDesignResetProviderAttemptAudit;
    providerAttempts?: NorthstarDesignResetProviderAttemptAudit[];
    rawParsedResponse?: unknown;
    acceptedResponse?: NorthstarDesignResetModelResponse;
    normalizationDiff?: NorthstarExactStringDiff;
  };
  modelAuthoredPatch?: NorthstarArtboardMutationDraft;
  appliedMutationBatch?: NorthstarArtboardMutationBatch;
  candidateBeforeBrowser?: NorthstarGeneratedCodeArtifactPackage;
  sourceAfter?: {
    revisionId: string;
    package: NorthstarGeneratedCodeArtifactPackage;
    snapshot?: NorthstarLiveSurfaceSnapshot;
    observationSource: "browser-snapshot" | "canonical-package";
    acknowledgement: NorthstarArtifactMutationAcknowledgement;
    sourceSha256: string;
    semanticGraph: NorthstarArtboardSemanticGraph;
  };
  semanticGraphDiff?: {
    addedNodeIds: string[];
    removedNodeIds: string[];
    retainedNodeIds: string[];
    conceptChanges: string[];
  };
  exactSourceDiff?: NorthstarExactDocumentDiff;
  /** Audit-only cumulative dependency classification. Never enters the model boundary or execution path. */
  cumulativeIntentAudit?: NorthstarCumulativeIntentAudit;
  /** Audit construction failures are archived without affecting the committed design turn. */
  cumulativeIntentAuditFailure?: string;
  /** Audit-only rendered clearance, relationship, group, and attribution observations. */
  renderedIntegrityAudit?: NorthstarRenderedIntegrityAudit;
  /** Rendered-integrity construction failures are archived without affecting the committed design turn. */
  renderedIntegrityAuditFailure?: string;
  repairHistory?: unknown[];
  failure?: string;
};

export type NorthstarLiveRepairFinding = {
  key: string;
  source: "cumulative-intent" | "rendered-integrity";
  kind: string;
  status: string;
  subjectNodeId?: string;
  relatedNodeIds: string[];
  detail: string;
  measurement?: Record<string, string | number | boolean>;
  collateralGeometryChanges?: NorthstarCollateralGeometryFinding[];
};

export type NorthstarLiveRepairOutcome = {
  status: "resolved" | "partial-progress" | "no-progress" | "same-findings-changed-measurements" | "changed-defects";
  resolvedFindingKeys: string[];
  remainingFindingKeys: string[];
  introducedFindingKeys: string[];
  unchangedMeasurementFindingKeys: string[];
  changedMeasurements: Array<{
    findingKey: string;
    before: Record<string, string | number | boolean>;
    after: Record<string, string | number | boolean>;
  }>;
};

/** Mechanical identity only: prose changes cannot disguise the same executable repair. */
export function northstarLiveRepairExecutableFingerprint(mutation: NorthstarArtboardMutationDraft): string {
  const executable = JSON.stringify({
    geometryIntent: mutation.geometryIntent,
    operations: mutation.operations,
    relations: mutation.relations ?? [],
  });
  return createHash("sha256").update(executable).digest("hex");
}

/** Mechanical strategy identity: catches numeric escalation of the same repair shape. */
export function northstarLiveRepairStrategyFingerprint(mutation: NorthstarArtboardMutationDraft): string {
  const strategy = {
    operations: mutation.operations.map((operation) => {
      if (operation.op === "set-styles") {
        return {
          op: operation.op,
          targetId: operation.targetId,
          properties: Object.keys(operation.styles).map((property) => property.toLowerCase()).sort(),
        };
      }
      if (operation.op === "set-attributes") {
        return {
          op: operation.op,
          targetId: operation.targetId,
          properties: Object.keys(operation.attributes).map((property) => property.toLowerCase()).sort(),
        };
      }
      if (operation.op === "move") {
        return { op: operation.op, targetId: operation.targetId, parentId: operation.parentId };
      }
      if (operation.op === "insert-html") {
        return { op: operation.op, targetId: operation.targetId, position: operation.position };
      }
      if (operation.op === "set-css-layer") return { op: operation.op, layerId: operation.layerId };
      if (operation.op === "set-runtime-module") return { op: operation.op, moduleId: operation.moduleId };
      return "targetId" in operation ? { op: operation.op, targetId: operation.targetId } : { op: operation.op };
    }),
    relations: (mutation.relations ?? []).map((relation) => ({
      subjectId: relation.subjectId,
      kind: relation.kind,
      references: relation.references
        .map((reference) => ({ role: reference.role, nodeId: reference.nodeId }))
        .sort((a, b) => `${a.role}:${a.nodeId}`.localeCompare(`${b.role}:${b.nodeId}`)),
    })),
  };
  return createHash("sha256").update(JSON.stringify(strategy)).digest("hex");
}

/**
 * Semantic identity for an objective action on one browser-verified revision.
 * Generated ids, markup, prose, and numeric nudges are deliberately excluded:
 * changing those does not make a rejected placement strategy new. A changed
 * target, relationship, operation topology, or canonical revision does.
 */
export function northstarObjectiveActionStrategyFingerprint(input: {
  baseRevisionId: string;
  grounding: NorthstarDesignResetGrounding;
  mutation: NorthstarArtboardMutationDraft;
  identityAuthority: NorthstarDesignTurnIdentityAuthority;
}): string {
  const knownIds = new Set([
    ...input.identityAuthority.knownNodeIds,
    ...input.identityAuthority.knownRegionIds,
    ...input.identityAuthority.knownAuthoredRelationIds,
  ]);
  const canonicalId = (value: string | undefined) => {
    if (!value) return undefined;
    return knownIds.has(value) ? value : "$new";
  };
  const operationStrategy = input.mutation.operations.map((operation) => {
    if (operation.op === "set-styles") return {
      op: operation.op,
      targetId: canonicalId(operation.targetId),
      properties: Object.keys(operation.styles).map((property) => property.toLowerCase()).sort(),
    };
    if (operation.op === "set-attributes") return {
      op: operation.op,
      targetId: canonicalId(operation.targetId),
      properties: Object.keys(operation.attributes).map((property) => property.toLowerCase()).sort(),
    };
    if (operation.op === "set-classes") return {
      op: operation.op,
      targetId: canonicalId(operation.targetId),
      changes: [operation.add?.length ? "add" : "", operation.remove?.length ? "remove" : ""].filter(Boolean),
    };
    if (operation.op === "move") return {
      op: operation.op,
      targetId: canonicalId(operation.targetId),
      parentId: canonicalId(operation.parentId),
      beforeId: canonicalId(operation.beforeId),
    };
    if (operation.op === "insert-html") return {
      op: operation.op,
      targetId: canonicalId(operation.targetId),
      position: operation.position,
    };
    if (operation.op === "recompose-region") return {
      op: operation.op,
      targetId: canonicalId(operation.targetId),
      placements: operation.placements.map((placement) => ({
        targetId: canonicalId(placement.targetId),
        parentId: canonicalId(placement.parentId),
        beforeId: canonicalId(placement.beforeId),
        preserveGeometry: Boolean(placement.preserveGeometry),
      })),
      retireNodeIds: (operation.retireNodeIds ?? []).map(canonicalId).sort(),
    };
    if (operation.op === "set-css-layer") return { op: operation.op, layerId: canonicalId(operation.layerId) };
    if (operation.op === "set-runtime-module") return { op: operation.op, moduleId: canonicalId(operation.moduleId) };
    if (operation.op === "request-space") return {
      op: operation.op,
      sides: (["left", "top", "right", "bottom"] as const).filter((side) => operation[side] !== undefined),
    };
    return { op: operation.op, targetId: canonicalId(operation.targetId) };
  });
  const strategy = {
    baseRevisionId: input.baseRevisionId,
    grounding: {
      conceptId: input.grounding.conceptId,
      resolvedNodeId: canonicalId(input.grounding.resolvedNodeId),
      requestedRelation: input.grounding.requestedRelation,
      placementSpace: input.grounding.placementSpace,
      expansionDirection: input.grounding.expansionDirection,
      evidenceNodeIds: input.grounding.evidenceNodeIds.map(canonicalId).sort(),
      expectedPreservedNodeIds: input.grounding.expectedPreservedNodeIds.map(canonicalId).sort(),
    },
    operations: operationStrategy,
    relations: (input.mutation.relations ?? []).map((relation) => ({
      subjectId: canonicalId(relation.subjectId),
      kind: relation.kind,
      references: relation.references
        .map((reference) => ({ role: reference.role, nodeId: canonicalId(reference.nodeId) }))
        .sort((a, b) => `${a.role}:${a.nodeId}`.localeCompare(`${b.role}:${b.nodeId}`)),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  return createHash("sha256").update(JSON.stringify(strategy)).digest("hex");
}

/**
 * Compares observed defect sets without deciding what visual solution is good.
 * The designer receives the raw before/after measurements and interprets them.
 */
export function summarizeNorthstarLiveRepairOutcome(
  before: NorthstarLiveRepairFinding[],
  after: NorthstarLiveRepairFinding[],
): NorthstarLiveRepairOutcome {
  const beforeByKey = new Map(before.map((finding) => [finding.key, finding]));
  const afterByKey = new Map(after.map((finding) => [finding.key, finding]));
  const resolvedFindingKeys = [...beforeByKey.keys()].filter((key) => !afterByKey.has(key)).sort();
  const remainingFindingKeys = [...beforeByKey.keys()].filter((key) => afterByKey.has(key)).sort();
  const introducedFindingKeys = [...afterByKey.keys()].filter((key) => !beforeByKey.has(key)).sort();
  const unchangedMeasurementFindingKeys: string[] = [];
  const changedMeasurements: NorthstarLiveRepairOutcome["changedMeasurements"] = [];
  for (const key of remainingFindingKeys) {
    const beforeMeasurement = beforeByKey.get(key)?.measurement ?? {};
    const afterMeasurement = afterByKey.get(key)?.measurement ?? {};
    if (JSON.stringify(beforeMeasurement) === JSON.stringify(afterMeasurement)) {
      unchangedMeasurementFindingKeys.push(key);
    } else {
      changedMeasurements.push({ findingKey: key, before: beforeMeasurement, after: afterMeasurement });
    }
  }
  let status: NorthstarLiveRepairOutcome["status"];
  if (after.length === 0) status = "resolved";
  else if (resolvedFindingKeys.length > 0) status = "partial-progress";
  else if (introducedFindingKeys.length > 0) status = "changed-defects";
  else if (changedMeasurements.length > 0) status = "same-findings-changed-measurements";
  else status = "no-progress";
  return {
    status,
    resolvedFindingKeys,
    remainingFindingKeys,
    introducedFindingKeys,
    unchangedMeasurementFindingKeys,
    changedMeasurements,
  };
}

function northstarReactiveRelationChannels(relation: NorthstarAuthoredDesignRelation): string[] {
  const parameters = relation.parameters ?? {};
  if (relation.kind === "connector-attachment") return ["connector"];
  if (relation.kind === "relative-placement") {
    const side = String(parameters.side ?? "right");
    const channels = [side === "right" || side === "left" ? "x" : "y"];
    if ((side === "right" || side === "left") && ["top", "center", "bottom"].includes(String(parameters.alignY ?? ""))) channels.push("y");
    if ((side === "above" || side === "below") && ["left", "center", "right"].includes(String(parameters.alignX ?? ""))) channels.push("x");
    return channels;
  }
  if (relation.kind === "between-placement") {
    const axis = String(parameters.axis ?? "x") === "y" ? "y" : "x";
    const crossAlign = String(parameters.crossAlign ?? (axis === "x" ? parameters.alignY : parameters.alignX) ?? "preserve");
    return crossAlign === "preserve" ? [axis] : [axis, axis === "x" ? "y" : "x"];
  }
  return [];
}

export type NorthstarReactiveRelationConflict = {
  subjectId: string;
  channel: string;
  existingRelationId: string;
  competingRelationId: string;
};

/** Mechanical dependency-protocol check only; it never selects or rewrites a relation. */
export function findNorthstarNewReactiveRelationConflicts(input: {
  existingRelations: NorthstarAuthoredDesignRelation[];
  proposedRelations: NorthstarAuthoredDesignRelation[];
}): NorthstarReactiveRelationConflict[] {
  const conflictMap = (relations: NorthstarAuthoredDesignRelation[]) => {
    const owners = new Map<string, string>();
    const conflicts = new Map<string, NorthstarReactiveRelationConflict>();
    for (const relation of relations) {
      for (const channel of northstarReactiveRelationChannels(relation)) {
        const ownerKey = `${relation.subjectId}::${channel}`;
        const priorId = owners.get(ownerKey);
        if (!priorId || priorId === relation.id) {
          owners.set(ownerKey, relation.id);
          continue;
        }
        const ids = [priorId, relation.id].sort();
        const key = `${ownerKey}::${ids.join("::")}`;
        conflicts.set(key, {
          subjectId: relation.subjectId,
          channel,
          existingRelationId: ids[0],
          competingRelationId: ids[1],
        });
      }
    }
    return conflicts;
  };
  const before = conflictMap(input.existingRelations);
  const finalById = new Map(input.existingRelations.map((relation) => [relation.id, relation]));
  for (const relation of input.proposedRelations) finalById.set(relation.id, relation);
  return [...conflictMap([...finalById.values()]).entries()]
    .filter(([key]) => !before.has(key))
    .map(([, conflict]) => conflict)
    .sort((a, b) => `${a.subjectId}:${a.channel}:${a.competingRelationId}`.localeCompare(`${b.subjectId}:${b.channel}:${b.competingRelationId}`));
}

function currentTurnAffectedNodeIds(audit: NorthstarCumulativeIntentAudit): Set<string> {
  const affectedCommitmentIds = new Set([
    ...audit.affectedComposition.directCommitmentIds,
    ...audit.affectedComposition.continuityDependentCommitmentIds,
    ...audit.affectedComposition.spatiallyExposedCommitmentIds,
  ]);
  return new Set([
    ...audit.directEditScope.directNodeIds,
    ...audit.directEditScope.introducedNodeIds,
    ...audit.directEditScope.containerContextNodeIds,
    ...audit.directEditScope.relationSubjectNodeIds,
    ...audit.directEditScope.relationReferenceNodeIds,
    ...audit.directEditScope.structuralMemberNodeIds,
    ...audit.affectedComposition.continuityAnchorNodeIds,
    ...audit.affectedComposition.geometryChangedNodeIds,
    ...audit.affectedComposition.dependencyPaths.flatMap((path) => [path.fromNodeId, path.toNodeId].filter((value): value is string => Boolean(value))),
    ...audit.activeCommitmentLedger
      .filter((commitment) => affectedCommitmentIds.has(commitment.commitmentId))
      .map((commitment) => commitment.nodeId),
  ]);
}

/**
 * Patch 3B turns Patch 1/2 observations into model feedback without turning the
 * runtime into a designer. Only high-confidence rendered findings that touch
 * this mutation's affected composition are actionable. A finding already owned
 * by the current repair loop remains actionable until it disappears, even when
 * a weak correction failed to touch the original subject.
 */
export function selectNorthstarLiveRepairFindings(input: {
  cumulativeIntentAudit?: NorthstarCumulativeIntentAudit;
  renderedIntegrityAudit?: NorthstarRenderedIntegrityAudit;
  carryFindingKeys?: Iterable<string>;
}): NorthstarLiveRepairFinding[] {
  if (!input.cumulativeIntentAudit) return [];
  const affectedNodeIds = currentTurnAffectedNodeIds(input.cumulativeIntentAudit);
  const carryFindingKeys = new Set(input.carryFindingKeys ?? []);
  const findings: NorthstarLiveRepairFinding[] = [];

  const collateralChanges = input.cumulativeIntentAudit.affectedComposition.collateralGeometryFindings ?? [];
  if (collateralChanges.length > 0) {
    const maxCenterDisplacement = Math.max(...collateralChanges.map((change) => change.delta.centerDistance));
    const maxSizeChange = Math.max(...collateralChanges.flatMap((change) => [Math.abs(change.delta.width), Math.abs(change.delta.height)]));
    findings.push({
      key: "intent:unexplained-collateral-geometry-change",
      source: "cumulative-intent",
      kind: "unexplained-collateral-geometry-change",
      status: "unresolved",
      relatedNodeIds: collateralChanges.map((change) => change.nodeId),
      detail: `${collateralChanges.length} pre-existing rendered node(s) materially changed geometry outside the composition explained by this turn. Preserve the turn's successful objective while repairing this collateral displacement; the runtime is reporting the before/after geometry, not prescribing a layout solution.`,
      measurement: {
        changedNodeCount: collateralChanges.length,
        maxCenterDisplacementPx: maxCenterDisplacement,
        maxSizeChangePx: maxSizeChange,
      },
      collateralGeometryChanges: collateralChanges,
    });
  }

  for (const warning of input.cumulativeIntentAudit.resolutionWarnings) {
    const key = `intent:${warning.code}:${warning.nodeId ?? "turn"}:${warning.detail}`;
    // A graph-level inference warning without an exact authored subject is
    // diagnostic context, not a design instruction. Repair only warnings tied
    // to a concrete affected node (or one already owned by this repair loop).
    if ((!warning.nodeId || !affectedNodeIds.has(warning.nodeId)) && !carryFindingKeys.has(key)) continue;
    findings.push({
      key,
      source: "cumulative-intent",
      kind: warning.code,
      status: "unresolved",
      subjectNodeId: warning.nodeId,
      relatedNodeIds: warning.candidateNodeIds ?? [],
      detail: warning.detail,
    });
  }

  for (const finding of input.renderedIntegrityAudit?.highConfidenceFindings ?? []) {
    const touchesAffectedComposition = affectedNodeIds.has(finding.subjectNodeId)
      || finding.relatedNodeIds.some((nodeId) => affectedNodeIds.has(nodeId));
    if (!touchesAffectedComposition && !carryFindingKeys.has(finding.findingId)) continue;
    findings.push({
      key: finding.findingId,
      source: "rendered-integrity",
      kind: finding.kind,
      status: finding.status,
      subjectNodeId: finding.subjectNodeId,
      relatedNodeIds: finding.relatedNodeIds,
      detail: finding.rationale,
      measurement: finding.measurement,
    });
  }
  return findings.sort((first, second) => first.key.localeCompare(second.key));
}

export const NORTHSTAR_DESIGN_RESET_MODEL_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    turn: { type: "integer", minimum: 1 },
    observedBaseRevisionId: { type: "string", minLength: 1 },
    understanding: { type: "string", minLength: 1, maxLength: 1200 },
    grounding: {
      type: "object",
      additionalProperties: false,
      properties: {
        conceptId: { type: "string", enum: ["research", "evidence-relationship", "evidence-gap-annotation", "evidence-explanation", "flow-structure", "evidence-reuse"] },
        resolvedNodeId: { type: "string", minLength: 1, maxLength: 120 },
        requestedRelation: { type: "string", enum: ["below", "right-of", "relationship-between", "equal-space-with-annotation", "explains", "reuses", "none"] },
        placementSpace: { type: "string", enum: ["artboard-world"] },
        referenceContinuity: { type: "string", enum: ["pixel-stable"] },
        expansionDirection: { type: "string", enum: ["down", "right", "none"] },
        evidenceNodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
        expectedPreservedNodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
        interpretation: { type: "string", minLength: 1, maxLength: 1200 },
      },
      required: ["conceptId", "resolvedNodeId", "requestedRelation", "placementSpace", "referenceContinuity", "expansionDirection", "evidenceNodeIds", "expectedPreservedNodeIds", "interpretation"],
    },
    mutation: NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
  },
  required: ["turn", "observedBaseRevisionId", "understanding", "grounding", "mutation"],
} as const;

export const NORTHSTAR_OBJECTIVE_DECISION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    turn: { type: "integer", minimum: 1 },
    observedBaseRevisionId: { type: "string", minLength: 1 },
    understanding: { type: "string", minLength: 1, maxLength: 1200 },
    objectivePlan: {
      type: "object",
      additionalProperties: false,
      properties: {
        objectiveSummary: { type: "string", minLength: 1, maxLength: 1200 },
        plannedActions: { type: "array", items: { type: "string", minLength: 1, maxLength: 500 }, maxItems: 12 },
        completedActions: { type: "array", items: { type: "string", minLength: 1, maxLength: 500 }, maxItems: 12 },
      },
      required: ["objectiveSummary", "plannedActions", "completedActions"],
    },
    decision: { type: "string", enum: ["execute-action", "objective-complete"] },
    action: {
      type: "object",
      additionalProperties: false,
      properties: {
        actionId: { type: "string", minLength: 1, maxLength: 120 },
        intent: { type: "string", minLength: 1, maxLength: 500 },
        successSignal: { type: "string", minLength: 1, maxLength: 500 },
      },
      required: ["actionId", "intent", "successSignal"],
    },
    completionRationale: { type: "string", minLength: 1, maxLength: 1200 },
    completionEvidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        observedRevisionId: { type: "string", minLength: 1 },
        satisfiedSignals: { type: "array", items: { type: "string", minLength: 1, maxLength: 500 }, minItems: 1, maxItems: 12 },
        verifiedNodeIds: { type: "array", items: { type: "string", minLength: 1, maxLength: 120 }, minItems: 1, maxItems: 24 },
        measuredFacts: { type: "array", items: { type: "string", minLength: 1, maxLength: 500 }, minItems: 1, maxItems: 12 },
        remainingIssues: { type: "array", items: { type: "string", minLength: 1, maxLength: 500 }, maxItems: 12 },
      },
      required: ["observedRevisionId", "satisfiedSignals", "verifiedNodeIds", "measuredFacts", "remainingIssues"],
    },
    grounding: {
      type: "object",
      additionalProperties: false,
      properties: {
        conceptId: { type: "string", enum: ["research", "evidence-relationship", "evidence-gap-annotation", "evidence-explanation", "flow-structure", "evidence-reuse"] },
        resolvedNodeId: { type: "string", minLength: 1, maxLength: 120 },
        requestedRelation: { type: "string", enum: ["below", "right-of", "relationship-between", "equal-space-with-annotation", "explains", "reuses", "none"] },
        placementSpace: { type: "string", enum: ["artboard-world"] },
        referenceContinuity: { type: "string", enum: ["pixel-stable"] },
        expansionDirection: { type: "string", enum: ["down", "right", "none"] },
        evidenceNodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
        expectedPreservedNodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
        interpretation: { type: "string", minLength: 1, maxLength: 1200 },
      },
      required: ["conceptId", "resolvedNodeId", "requestedRelation", "placementSpace", "referenceContinuity", "expansionDirection", "evidenceNodeIds", "expectedPreservedNodeIds", "interpretation"],
    },
    mutation: {
      ...NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
      properties: {
        ...NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA.properties,
        operations: {
          ...NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA.properties.operations,
          minItems: 1,
          maxItems: 1,
        },
      },
    },
  },
  required: ["turn", "observedBaseRevisionId", "understanding", "objectivePlan", "decision"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

export function northstarDesignResetSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceHash(snapshot: NorthstarLiveSurfaceSnapshot): string {
  return northstarDesignResetSha256(jsonText({
    html: snapshot.html,
    css: snapshot.css,
    cssLayers: snapshot.cssLayers ?? {},
    javascript: snapshot.javascript ?? "",
    creativeJavascript: snapshot.creativeJavascript ?? "",
  }));
}

function canonicalPackageSnapshot(artifact: NorthstarGeneratedCodeArtifactPackage): NorthstarLiveSurfaceSnapshot {
  return {
    html: artifact.document.html,
    css: artifact.document.css,
    cssLayers: artifact.document.cssLayers ?? {},
    javascript: artifact.document.javascript ?? "",
    creativeJavascript: artifact.document.creativeJavascript ?? "",
    capturedAt: new Date().toISOString(),
  };
}

function strongestSourceObservation(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
}): { snapshot: NorthstarLiveSurfaceSnapshot; source: "browser-snapshot" | "canonical-package" } {
  return input.acknowledgement.snapshot
    ? { snapshot: input.acknowledgement.snapshot, source: "browser-snapshot" }
    : { snapshot: canonicalPackageSnapshot(input.artifact), source: "canonical-package" };
}

export function northstarDesignResetSourceHash(snapshot: NorthstarLiveSurfaceSnapshot): string {
  return sourceHash(snapshot);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function rectFromUnknown(value: unknown): { left: number; top: number; right: number; bottom: number; width: number; height: number } | undefined {
  if (!isRecord(value)) return undefined;
  const left = finiteNumber(value.left) ?? finiteNumber(value.x);
  const top = finiteNumber(value.top) ?? finiteNumber(value.y);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (left === undefined || top === undefined || width === undefined || height === undefined) return undefined;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function anchorsFromBounds(bounds: { left: number; top: number; right: number; bottom: number } | undefined) {
  if (!bounds) return undefined;
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom,
    centerX: bounds.left + ((bounds.right - bounds.left) / 2),
    centerY: bounds.top + ((bounds.bottom - bounds.top) / 2),
  };
}


function nodesFromFlowRoot(flowId: string): string {
  return `flow-${flowId.replace(/--/g, "-").replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function buildNorthstarArtboardSemanticGraph(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
}): NorthstarArtboardSemanticGraph {
  const { snapshot } = strongestSourceObservation(input);
  const snapshotRecord = snapshot as unknown as Record<string, unknown>;
  const semanticNodesRaw = Array.isArray(snapshotRecord.semanticNodes) ? snapshotRecord.semanticNodes : [];
  const registry = isRecord(snapshotRecord.evidenceRegistry)
    ? snapshotRecord.evidenceRegistry
    : isRecord((input.acknowledgement as unknown as Record<string, unknown>).evidenceRegistry)
      ? (input.acknowledgement as unknown as Record<string, unknown>).evidenceRegistry as Record<string, unknown>
      : {};
  const manifest = Array.isArray(registry.presentationManifest) ? registry.presentationManifest : [];
  // Persisted legacy artifacts and focused contract tests can legitimately omit
  // the research bundle. Geometry observation must remain usable in that case.
  const screenshots = input.artifact.dataBundle?.screenshots ?? [];
  const screenshotsById = new Map(screenshots.map((screenshot) => [screenshot.id, screenshot]));
  const flowsById = new Map((input.artifact.dataBundle?.flows ?? []).map((flow) => [flow.id, flow]));
  const normalizeLookup = (value: string | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  // presentationManifest.index is a legacy global presentation ordinal in
  // some live artifacts. Instruction ordinals are semantic and flow-local:
  // "the first Whop screenshot" must resolve to the first Whop member even
  // when its manifest index follows every Awin member.
  const localIndexByNodeId = new Map<string, number>();
  const nextIndexByFlowId = new Map<string, number>();
  for (const entry of manifest) {
    if (!isRecord(entry) || typeof entry.nodeId !== "string") continue;
    const flowId = typeof entry.flowId === "string" ? entry.flowId : "";
    const localIndex = nextIndexByFlowId.get(flowId) ?? 0;
    localIndexByNodeId.set(entry.nodeId, localIndex);
    nextIndexByFlowId.set(flowId, localIndex + 1);
  }
  const evidenceItems = manifest.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.nodeId !== "string") return [];
    const bounds = rectFromUnknown(entry);
    const flowId = typeof entry.flowId === "string" ? entry.flowId : "";
    const manifestIndex = finiteNumber(entry.index) ?? 0;
    const index = localIndexByNodeId.get(entry.nodeId) ?? manifestIndex;
    const evidenceId = typeof entry.evidenceId === "string" ? entry.evidenceId : undefined;
    const flowScreenshotIds = flowsById.get(flowId)?.screenshotIds ?? [];
    const screenshot = (evidenceId ? screenshotsById.get(evidenceId) : undefined)
      ?? (flowScreenshotIds[index] ? screenshotsById.get(flowScreenshotIds[index]!) : undefined)
      ?? screenshots.find((candidate) =>
        normalizeLookup(candidate.flowName) === normalizeLookup(flowId)
        && (candidate.index ?? 0) === index
      );
    return [{
      nodeId: entry.nodeId,
      flowId,
      index,
      evidenceId,
      appName: screenshot?.appName,
      flowName: screenshot?.flowName,
      title: screenshot?.title,
      journeyStage: screenshot?.journeyStage,
      visibleCopy: screenshot?.visibleCopy.slice(0, 4).map((copy) => copy.slice(0, 160)) ?? [],
      bounds,
      anchors: anchorsFromBounds(bounds),
    }];
  });
  const evidenceNodeIds = manifest.map((entry) => isRecord(entry) ? String(entry.nodeId ?? "") : "").filter(Boolean);
  const flowGroups = [...new Set(evidenceItems.map((item) => item.flowId).filter(Boolean))].map((flowId) => {
    const members = evidenceItems.filter((item) => item.flowId === flowId).sort((a, b) => a.index - b.index);
    const measured = members.map((item) => item.bounds).filter((value): value is NonNullable<typeof value> => Boolean(value));
    const bounds = measured.length ? {
      left: Math.min(...measured.map((rect) => rect.left)),
      top: Math.min(...measured.map((rect) => rect.top)),
      right: Math.max(...measured.map((rect) => rect.right)),
      bottom: Math.max(...measured.map((rect) => rect.bottom)),
      width: 0,
      height: 0,
    } : undefined;
    if (bounds) {
      bounds.width = bounds.right - bounds.left;
      bounds.height = bounds.bottom - bounds.top;
    }
    const normalizedName = flowId.replace(/--/g, " ").replace(/[-_]+/g, " ").trim();
    const rootNodeId = nodesFromFlowRoot(flowId);
    return { flowId, normalizedName, rootNodeId, members, bounds, anchors: anchorsFromBounds(bounds) };
  });
  const evidenceBounds = manifest.map((entry) => rectFromUnknown(entry)).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const researchBounds = evidenceBounds.length ? {
    left: Math.min(...evidenceBounds.map((r) => r.left)),
    top: Math.min(...evidenceBounds.map((r) => r.top)),
    right: Math.max(...evidenceBounds.map((r) => r.right)),
    bottom: Math.max(...evidenceBounds.map((r) => r.bottom)),
    width: 0,
    height: 0,
  } : undefined;
  if (researchBounds) {
    researchBounds.width = researchBounds.right - researchBounds.left;
    researchBounds.height = researchBounds.bottom - researchBounds.top;
  }
  const nodes = semanticNodesRaw.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.nodeId !== "string") return [];
    const attrs = isRecord(raw.normalizedAttributes) ? raw.normalizedAttributes : {};
    const bounds = rectFromUnknown(raw.bounds ?? raw.rect ?? raw.layout);
    return [{
      nodeId: raw.nodeId,
      parentId: typeof raw.parentId === "string" ? raw.parentId : undefined,
      role: String(attrs["data-ns-semantic-role"] ?? attrs["data-ns-working-role"] ?? attrs["data-ns-stage"] ?? "content"),
      text: typeof raw.normalizedText === "string" ? raw.normalizedText : "",
      evidenceId: typeof attrs["data-ns-evidence-id"] === "string" ? attrs["data-ns-evidence-id"] : undefined,
      bounds,
      anchors: anchorsFromBounds(bounds),
    }];
  });
  const researchRootId = nodes.some((node) => node.nodeId === "evidence") ? "evidence" : "evidence";
  const size = input.acknowledgement.size;
  const artboardBounds = size ? {
    left: 0,
    top: 0,
    right: size.intrinsicWidth,
    bottom: size.intrinsicHeight,
    width: size.intrinsicWidth,
    height: size.intrinsicHeight,
  } : undefined;
  const authoredRelationships = semanticNodesRaw.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.nodeId !== "string") return [];
    const attrs = isRecord(raw.normalizedAttributes) ? raw.normalizedAttributes : {};
    const sourceId = typeof attrs["data-ns-source-node-id"] === "string" ? attrs["data-ns-source-node-id"] : undefined;
    const targetId = typeof attrs["data-ns-target-node-id"] === "string" ? attrs["data-ns-target-node-id"] : undefined;
    const isAuthoredRelationship = attrs["data-ns-authored-relationship"] === "true";
    if (!isAuthoredRelationship || !sourceId || !targetId) return [];
    return [{ subjectId: sourceId, predicate: "visually-related-to", objectId: targetId }];
  });
  const authoredGapAnnotations = semanticNodesRaw.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.nodeId !== "string") return [];
    const attrs = isRecord(raw.normalizedAttributes) ? raw.normalizedAttributes : {};
    const beforeId = typeof attrs["data-ns-between-before-node-id"] === "string" ? attrs["data-ns-between-before-node-id"] : undefined;
    const afterId = typeof attrs["data-ns-between-after-node-id"] === "string" ? attrs["data-ns-between-after-node-id"] : undefined;
    const isAuthoredAnnotation = attrs["data-ns-authored-annotation"] === "true";
    if (!isAuthoredAnnotation || !beforeId || !afterId) return [];
    return [
      { subjectId: raw.nodeId, predicate: "annotates-gap-after", objectId: beforeId },
      { subjectId: raw.nodeId, predicate: "annotates-gap-before", objectId: afterId },
    ];
  });
  const relationships = [
    ...evidenceNodeIds.map((nodeId) => ({ subjectId: researchRootId, predicate: "contains", objectId: nodeId })),
    ...authoredRelationships,
    ...authoredGapAnnotations,
  ];
  return {
    schema: "northstar.artboard-semantic-graph.v1",
    revisionId: input.artifact.revisionId,
    sourceSha256: sourceHash(snapshot),
    concepts: [
      {
        conceptId: "research",
        label: "Research",
        definition: "The complete canonical evidence area containing the ordered flows. This is the referent for requests that name the research or evidence area.",
        canonicalNodeIds: [researchRootId],
        aliases: ["research", "evidence", "research section", "evidence reservoir", "grounded evidence"],
        exclusions: ["presentation", "reasoning-zone", "thought-primary", "thought-secondary", "synthesis", "decision"],
      },
      ...flowGroups.map((flow) => ({
        conceptId: `flow:${flow.flowId}`,
        label: flow.normalizedName,
        definition: `The ordered collective evidence region for ${flow.normalizedName}.`,
        canonicalNodeIds: [flow.rootNodeId],
        aliases: [flow.normalizedName, flow.flowId, ...flow.normalizedName.split(/\s+/).filter(Boolean)],
        exclusions: flowGroups.filter((other) => other.flowId !== flow.flowId).map((other) => other.rootNodeId),
      })),
      {
        conceptId: "working-reasoning",
        label: "Working reasoning",
        definition: "Temporary hypotheses and open questions. It is not the canonical research evidence.",
        canonicalNodeIds: ["reasoning-zone"],
        aliases: ["reasoning", "hypothesis", "open question"],
        exclusions: [researchRootId],
      },
    ],
    regions: [
      { regionId: "research", conceptId: "research", rootNodeId: researchRootId, memberNodeIds: evidenceNodeIds, bounds: researchBounds, anchors: anchorsFromBounds(researchBounds), preservation: "permanent", continuity: { source: "unchanged", evidenceIdentity: "unchanged", itemDimensions: "unchanged", itemOrder: "unchanged", placement: "recomposable-when-needed", visualAppearance: "unchanged" } },
      ...flowGroups.map((flow) => ({
        regionId: `flow:${flow.flowId}`,
        conceptId: `flow:${flow.flowId}`,
        rootNodeId: flow.rootNodeId,
        memberNodeIds: flow.members.map((item) => item.nodeId),
        bounds: flow.bounds,
        anchors: flow.anchors,
        preservation: "permanent" as const,
        continuity: { source: "unchanged" as const, evidenceIdentity: "unchanged" as const, itemDimensions: "unchanged" as const, itemOrder: "unchanged" as const, placement: "recomposable-when-needed" as const, visualAppearance: "unchanged" as const },
      })),
      { regionId: "working-reasoning", conceptId: "working-reasoning", rootNodeId: "reasoning-zone", memberNodeIds: [], preservation: "editable" },
    ],
    artboard: { bounds: artboardBounds, expansionModel: "infinite-world-space" },
    evidenceItems,
    nodes,
    relationships,
    vocabulary: {
      research: "Resolve to node evidence and all canonical evidence descendants, never reasoning-zone or presentation.",
      workingReasoning: "Resolve to reasoning-zone; it is distinct from research.",
      below: "For an explicit directional extension, below means the subject's rendered top is beyond the referenced region's rendered bottom. Preserve that reference while satisfying the requested relation unless the instruction also asks to modify it; request additional artboard space when needed.",
      rightOf: "For an explicit directional extension, right means the subject's rendered left is beyond the referenced region's rendered right. Preserve that reference while satisfying the requested relation unless the instruction also asks to modify it; request additional artboard space when needed.",
      verticalCenterAlignment: "Vertically center-align means the rendered vertical center of the new node equals the authoritative anchors.centerY of the reference region. Do not recompute centerY from top, bottom, or height. Do not guess the new node height. Author a self-measuring CSS relationship that remains exact after layout, such as placing the node top at anchors.centerY and translating the node by -50% of its own rendered height, or another equivalently exact authored relationship.",
      authoritativeSpatialAnchors: "Each measured node and region exposes authoritative anchors: left, top, right, bottom, centerX, and centerY. Use these values directly for relational geometry. Do not recalculate them from rounded bounds.",
      evidenceIntegrity: "Protected evidence keeps its source identity, content, rendered dimensions, visual appearance, visibility, and sequence order. Protection does not freeze x/y position: intact evidence may be explicitly translated when the current composition needs space, while unrelated evidence remains stable.",
      spatialRecomposition: "Every design objective has the same spatial agency. Use current rendered measurements to decide whether the intended communication fits. If it does not, create space by explicitly recomposing the smallest coherent affected structure, update dependent authored work, and request artboard growth when useful. No objective receives a privileged movement recipe.",
      worldSpaceObjectTopology: "Every independently positioned artboard-world object is authored as a direct child of the canonical artboard root node artboard. Reference regions such as evidence are anchors for geometry and meaning, not parents for external world-space objects.",
      authoredNodeIdentity: "Every authored visual object must have a unique data-ns-node-id attribute. The semantic graph, browser measurements, later design turns, diagnostics, and source diffs use data-ns-node-id as the stable object identity; an HTML id attribute alone is not sufficient.",
      authoredRelationshipProvenance: "A model-authored relationship object carries data-ns-authored-relationship=\"true\", data-ns-source-node-id, and data-ns-target-node-id on the authored relationship object itself. These attributes describe provenance only; they do not choose, route, style, validate, repair, or replace the model-authored visual treatment. Every independently addressable visual primitive inside the relationship also carries its own unique data-ns-node-id.",
      authoredAnnotationProvenance: "A model-authored gap annotation carries data-ns-authored-annotation=\"true\", data-ns-between-before-node-id, and data-ns-between-after-node-id on the annotation object itself. These attributes describe which adjacent evidence nodes bound the annotated gap; they do not choose placement, validate spacing, or repair the model-authored result.",
      reactiveSpatialDependencies: "Spatial intent persists across turns in mutation.relations, which is the canonical model-authored dependency graph. References declare exact semantic node identities, anchors, and geometry modes; parameters declare only the axes, alignments, and offsets chosen by the model. The browser realizes live relations from current rendered geometry without changing the canonical authored source and without inventing styling, spacing, routing, dimensions, or cross-axis alignment.",
    },
  };
}

function semanticGraphDiff(before: NorthstarArtboardSemanticGraph, after: NorthstarArtboardSemanticGraph) {
  const beforeIds = new Set(before.nodes.map((node) => node.nodeId));
  const afterIds = new Set(after.nodes.map((node) => node.nodeId));
  return {
    addedNodeIds: [...afterIds].filter((id) => !beforeIds.has(id)),
    removedNodeIds: [...beforeIds].filter((id) => !afterIds.has(id)),
    retainedNodeIds: [...afterIds].filter((id) => beforeIds.has(id)),
    conceptChanges: before.concepts.map((concept) => JSON.stringify(concept)).join("\
") === after.concepts.map((concept) => JSON.stringify(concept)).join("\
") ? [] : ["canonical-concept-definition-changed"],
  };
}

export function buildNorthstarDesignResetSystemInstruction(): string {
  return `You are editing the exact current source of one living Northstar artboard.

Every artboard turn is singular. First form a provisional ordered plan for the current objective. Then either declare the objective complete from the exact current browser revision, or execute exactly one coherent visual action. Never combine dependent actions when the second action needs to observe the rendered result of the first. After an executed action, the browser will render and measure it and you will receive that exact new revision before choosing the next action. Replan from what actually happened, not from what you predicted. Continue one action at a time until the objective is visibly satisfied. Declare completion only when you can name the rendered success signals and completionEvidence.remainingIssues is empty.

Singularity is defined by semantic visual intent, not by primitive DOM operation count. One action may author a complete self-contained composition in one browser transaction—for example a new container together with its text, image, chart, table, local styling, and internal relations—when every primitive belongs to that one newly authored composition and none depends on observing another primitive's rendered result. Do not split a container from its contents merely to satisfy an operation-count rule. Never bundle unrelated edits to existing nodes into that composition.

Actions remain separate whenever the next choice depends on fresh browser observation. Creating or requesting space and then placing content into the newly rendered space are separate actions. Moving existing content and then inserting into the resulting gap are separate actions. Positioning and then correcting that position are separate actions. This rule applies universally to every objective and is not benchmark-specific.

The user will give you one short design instruction, the complete current artboard source, and an authoritative semantic-spatial graph derived from that exact committed revision. The graph defines stable concepts, regions, membership, exclusions, and current measured bounds.

First resolve every noun, spatial relation, and alignment instruction through the semantic graph. Research always means the canonical evidence region rooted at node evidence; reasoning-zone and presentation are explicitly not research. The graph's bounds and anchors describe the current committed revision, but every persistent dependency must also be authored in mutation.relations so it survives later geometry changes.

Treat communication quality and evidence safety as part of every design decision, on every turn. Anything you add must be clear, readable, and understandable from the rendered artboard itself. When an addition refers to specific evidence, its content and visual treatment must make that reference understandable without relying on diagnostics. General comments, synthesis, or remarks may address the whole artifact without pointing to one exact node. Never place cards, annotations, labels, text, filled shapes, or decorative surfaces over protected evidence pixels. Do not crop, cover, dim, restyle, replace, distort, or visually contaminate evidence.

Treat the current layout as a composition you can solve, not as a field of immovable obstacles. Evidence protection preserves each evidence item's source identity, content, rendered dimensions, visual appearance, visibility, and sequence order; it does not freeze its x/y position forever. When the current objective cannot read cleanly in the available space, create deliberate negative space by recomposing the smallest coherent affected structure necessary. You may translate an intact screenshot, a sequence suffix, or a whole evidence flow when that supporting movement is necessary to make the requested communication clear, provided you preserve evidence integrity and order and explicitly author the movement. Move dependent authored annotations or relationships with the affected composition, and request artboard growth when useful. Keep unrelated regions stable. Never move content merely to make the board different or to avoid solving the requested design problem.

Use the same spatial problem-solving ability on every turn. Before choosing coordinates for a new object, inspect the occupied space around its semantic target and ask whether the complete composition has enough room for the object, its attribution, and existing relationships. If not, plan the space first: decide which smallest coherent surrounding structure can move, how much negative space the communication needs, which prior authored relationships must be rerouted or repositioned, and whether the artboard should grow. Then author only the next singular coordinated action. A local coordinate tweak is not inherently safer than moving a coherent row or flow; choose the action that moves the rendered composition toward the clearest complete result with the least necessary disruption.

Before authoring any placement, perform a simple fit test from the current rendered measurements. On the placement axis, required span is the planned outer size of the new or moved subject plus the clear space its treatment needs; available span is the actual empty distance from the intended target edge to the nearest relevant occupied object or semantic-region edge. If available span is smaller than required span, that local placement does not fit. Do not try nearby coordinates inside the same insufficient space. Create enough room first by explicitly moving the smallest coherent affected structure, request artboard growth when useful, or choose a materially different treatment whose footprint actually fits. This is design reasoning you perform from the supplied measurements, not a runtime layout rule. Apply the fit test on the first attempt, not only after a collision is reported.

Intentional movement must be mechanically explicit in the mutation. If you expect several pre-existing objects to move, explicitly move their coherent containing structure when that is truly the intended unit, or explicitly target every intended moved object. Do not change margin, gap, flex growth/shrink, grid tracks, wrapping, or another normal-flow constraint on one child as a proxy for making its siblings move: that delegates composition to browser reflow and can silently translate or resize unrelated evidence. Prefer explicit positional translation/repositioning for intact evidence. Preserve every protected evidence item's measured border-box width and height exactly while translating it. Request outer artboard space separately when needed. Before returning, compare the objects you intend to move with their current measured bounds and make sure every expected movement has an explicit owner and no protected evidence dimensions changed as a side effect.

Before returning a mutation, review the exact current source, browser acknowledgement, semantic graph, rendered bounds, evidence registry, and prior model-authored additions together. Check the whole candidate you intend to author: wording, visual attribution, hierarchy, clipping, overflow, contrast, evidence interference, relation continuity, preservation, and artboard containment. Correct every issue you can identify in the same complete response. The system is your rendering, measurement, memory, and recovery partner; it does not choose the design and it does not block a visual approach merely because it differs from a template.

Continuity is evaluated on every turn. Preserve evidence identity and pixels, semantic identity, meaning, target references, and provenance, but do not freeze spatial coordinates when the current instruction requires a coherent affected-area recomposition. Prior authored additions attached to affected nodes or regions are available for model-authored recomposition, and intact evidence items may be translated when necessary to create the space that recomposition requires. Reassess placement, visual membership, hierarchy, spacing, and relationship treatment as part of the complete cumulative design whenever the new turn changes their context. Unrelated authored work remains stable.

A visual relationship does not require a runtime relation unless the instruction explicitly declares below, right-of, or equal-space-between placement. For other intent, choose among spatial arrangement, grouping, alignment, repeated emphasis, labels, brackets, connectors, insets, comparison regions, and other open-ended visual treatments; mutation.relations is optional. Explicit spatial instructions require one authored relation as the positioning authority. Ground it in the exact semantic node identified by grounding.resolvedNodeId and choose its geometry mode from that semantic target: border-box for the object's own rendered box, or semantic-descendant-union for the complete rendered subtree. A below/above relation must declare alignX; a left/right relation must declare alignY. Do not search coordinates: redundant model-authored positional CSS and repeated continuation space requests are mechanically discarded before rendering.

A relation is typed model-authored intent, separate from HTML and separate from browser-resolved geometry. The model chooses every subject, reference, anchor, geometry mode, controlled axis, alignment, offset, dimension, style, route, and amount of artboard growth. The browser only realizes the exact declared relation against current rendered geometry. It does not infer missing relationships, choose cross-axis alignment, invent spacing, route connectors, resize annotations, or repair a design. Use realizationPolicy "live" only for dependencies that must follow references on later turns. Use reference geometry "semantic-descendant-union" when a relation targets the complete research region rooted at evidence; use "border-box" for individual screenshots. A relation id is the stable update identity: when correcting an existing dependency, reuse that exact id so the authored definition is replaced instead of stacking another controller onto the same subject geometry channel. Do not rely on optional data-ns-* markup attributes as the canonical dependency record.

Every resolved CSS placement relation returns a browser-authored placementPreview receipt. It reports the subject in artboard coordinates and in its actual containing-block coordinates, the containing-block identity and scale, each requested and realized edge, the realization error, and whether a between-placement subject fits the declared gap. Treat that receipt as the only coordinate authority. Never copy artboard left/top values into a nested positioned container. On a continuation, preserve the same relation contract and correct the authored surrounding composition when fitsDeclaredGap is false; do not remove the relation and search with raw coordinates.

For an explicit below or right-of instruction, declare kind "relative-placement" with the dependent subjectId and the exact grounded node as role "reference". The browser takes a static subject out of normal flow, measures the subject's actual rendered size, converts the declared world relationship into its real containing-block coordinate space, and owns CSS geometry on the controlled axes. Declare cross-axis alignment so the subject remains visually attached to its reference.

When your chosen design uses a reactive connector, author the complete SVG treatment yourself and declare kind "connector-attachment" with exactly one source reference, exactly one target reference, their anchors, and primitiveNodeId. The canonical roles are source and target; common semantic aliases such as from/to and start/end are normalized without changing your design. The runtime may update only the endpoint geometry of an authored SVG line, polyline, or supported open path; it does not choose the connector form, path, label, stroke, route, styling, dimensions, or whether surrounding content should move. Referenced evidence follows the same integrity and recomposition rules as on every other design turn. Put data-ns-authored-relationship="true", data-ns-source-node-id, and data-ns-target-node-id on the relationship object for observational provenance, and give each addressable primitive its own data-ns-node-id. If reactive attachment is unnecessary, omit connector-attachment and keep the relationship entirely visual.

For an explicit equal-space-between instruction, declare kind "between-placement" with the two exact grounded evidence nodes as before and after references, the authored axis, and crossAlign so the annotation remains visually attached to the pair. The runtime centers the subject's rendered border box between their current edges and owns CSS geometry on the controlled axes. Use the same fit, evidence-integrity, explicit-movement, and smallest-coherent-recomposition reasoning used for every other design objective.

When a design reuses existing evidence in another authored context, preserve the original evidence instance and treat the reused view as a distinct authored presentation instance with its own unique data-ns-node-id. Keep provenance attached to the original evidence through exact evidence references and source-node provenance such as data-ns-source-node-id. Reused evidence is not a new source. This is an evidence-integrity rule, not a placement recipe; choose its composition using the same general spatial reasoning as every other addition.

Every independently positioned artboard-world object should be a direct child of the canonical artboard root node artboard unless the authored topology intentionally uses a nested positioned container; relation realization must remain correct in either topology. Every authored visual object must carry a unique data-ns-node-id. Use focused set-styles or set-attributes operations for existing nodes instead of replacing an entire evidence sequence.

When the current instruction uses an existing region as an explicit directional reference, preserve that reference for the requested relation. In particular, a request to add something below or to the right of a region means external extension in artboard world space unless the user explicitly asks to modify that region. For that directional objective, the referenced region stays fixed: its source, bounds, internal layout, order, scale, styling, and visual appearance do not change. Expand the artboard in the requested direction and place the new authored content outside the unchanged region footprint. This directional-reference rule does not globally freeze evidence placement for later objectives whose affected composition genuinely needs spatial recomposition.

Declare that grounding in your response. Decide the complete authored solution yourself, including HTML, CSS, SVG, JavaScript, visual style, dimensions, spacing, layout method, placement, and amount of artboard expansion. Read the exact source and current measurements rather than relying on assumptions. Use request-space to author the required outer artboard growth. New content placed outside a pixel-stable reference region must be taken out of normal document flow with model-authored world-space positioning (for example position:absolute with explicit left/top coordinates chosen from the measured graph). A normal-flow sibling can reflow the reference and is therefore not a valid artboard-world extension. You may use insert-html with position afterend on an anchor node when that is the correct source relationship; do not append to a convenient ancestor when it cannot produce the requested world-space relationship.

When a post-render repair includes same-turn attempt memory, reason about failed design strategies rather than merely trying unused coordinates. Read the prior mutations together with their measured before/after findings. A repeated local-placement strategy remains the same strategy even when its x/y values differ. Moving only the same failing subject remains one subject-only placement strategy even when its side or offset changes. If that subject-only strategy has already rendered while actionable findings remained, run the fit test again before touching its coordinates. Do not move that subject alone again unless you are authoring a materially different treatment whose new footprint demonstrably fits the measured available span and resolves the whole constraint. Otherwise stop searching nearby coordinates and broaden the affected composition: create the missing space, explicitly move the smallest coherent surrounding structure, and update dependent authored relationships together. Trading an overlap below the target for an overlap to its right is not progress toward a viable composition. If an earlier attempt used browser reflow as an indirect movement mechanism and produced collateral translation or resizing, restore protected evidence dimensions first, then explicitly author the intended positions for the coherent affected structure; do not oscillate between natural-flow and absolute/translated strategy families. Use the measured before/after results to choose a materially different composition. Do not repeat a strategy family that the live artboard has already shown cannot satisfy the whole set of findings.

Make only the requested design change. Do not perform unrelated redesign work. Return the exact source mutation you chose in the required JSON schema. The protocol boundary may canonicalize unambiguous relation-role aliases, retain an accepted continuation's relation identity and references, and remove positional CSS owned by a live relation. Those mechanical steps never choose placement, styling, content, routing, or composition. Your resulting mutation is applied directly to the live artboard. If the post-render audit finds a communication defect caused or worsened by the turn, your next call for that same turn starts from that exact live revision with the measured defects attached. Preserve the original turn objective and author an incremental correction to the current live artboard. When same-turn repair memory is attached, treat it as authoritative history of already attempted rendered results: use its before/after evidence to avoid repeating ineffective executable moves, while choosing the next design solution yourself. The next design objective does not begin until those actionable findings are resolved. Return JSON only.`;
}

export function buildNorthstarCompactDesignTurnSystemInstruction(): string {
  return `You are editing one living Northstar artboard from its latest browser-measured revision.

Resolve the objective through singular observed turns. Return objective-complete or exactly one executable mutation operation. The browser will render and measure the result before you choose another action. Never predict a dependent second action.

Each action is a provisional browser transaction until its measured receipt says applied. The browser must reject and roll back a failed transaction; its receipt becomes the next observation. Do not search nearby blindly; use that receipt to make space, recompose the smallest affected structure, change the footprint, or choose a proven viable location.

The observedTurnJournal is exact rendered history. Do not repeat an executable action that was applied or rejected. A receipt may justify a different action on the same node. Creating measured space and placing are separate observed turns. Replan from the current revision.

After an applied action, compare current referents, relations, measurements, and findings with the objective. If visibly satisfied with no remaining issue, return objective-complete immediately.

Use only the compact context as fact. Its node ids, region membership, bounds, anchors, artboard bounds, relations, preservation rules, and last browser outcome are authoritative. Ground every subject in those ids; never invent identity or geometry. Treat a rejected candidate's browserReceipt as an exact measurement of its attempted composition even though the canonical revision was restored. If safe completion is not yet possible, create the required space or structure.

Semantic evidence labels identify screenshot meaning; observedSpatialFacts are current browser measurements. Resolve the exact semantic referent, then inspect placementFeasibility.requiredForCurrentObjective and candidateSlots. When requiredForCurrentObjective is false, connectors and grouping-only changes do not require a placement slot. When true, the planned outer border-box must fit wholly in a semantically appropriate candidateSlot; each slot is browser-proven empty with clearance applied. If no slot fits, create adequate space or grow the artboard now, observe it, and place later.

Preserve protected evidence identity, content, order, visibility, appearance, width, and height. Translate it only when the objective requires recomposing the smallest coherent affected structure. Keep unrelated regions stable and never cover readable content. Compare footprint plus clearance with measured space before placement; if it cannot fit, create space or grow the artboard.

Use mutation.relations for live geometric dependencies: relative-placement for directional placement, between-placement between two references, and connector-attachment only for a connector whose endpoints follow references. You choose design, dimensions, spacing, style, route, and operation; the browser realizes and measures declared intent.

Inserted objects require unique data-ns-node-id values. Prefer focused operations on stable ids; never replace whole evidence flows for a local change. Completion is valid only when the current revision visibly satisfies the objective, observedRevisionId equals revision.browserRevisionId, verifiedNodeIds names known nodes or relations proving it, measuredFacts cites current browser measurements, and remainingIssues is empty. Return JSON only.`;
}


function instructionTokens(value: string): Set<string> {
  const semanticStopWords = new Set([
    "add", "align", "and", "are", "been", "being", "between", "center", "construct", "create", "equal", "from", "insert",
    "into", "make", "move", "place", "reposition", "space", "that", "the", "their", "then", "these", "this", "those", "with",
  ]);
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter((token) => token.length > 2 && !semanticStopWords.has(token)));
}

function focusScore(instruction: Set<string>, values: string[]): number {
  const candidate = instructionTokens(values.join(" "));
  let score = 0;
  for (const token of instruction) if (candidate.has(token)) score += 1;
  return score;
}

function ordinalLabel(index: number): string {
  return ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][index]
    ?? `item ${index + 1}`;
}

const NORTHSTAR_ORDINAL_WORDS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
] as const;

function normalizedSemanticPhrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function instructionOrdinalIndexes(value: string): number[] {
  const normalized = normalizedSemanticPhrase(value);
  const indexes = new Set<number>();
  NORTHSTAR_ORDINAL_WORDS.forEach((word, index) => {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) indexes.add(index);
  });
  for (const match of normalized.matchAll(/\b(\d+)(?:st|nd|rd|th)\b/g)) {
    const ordinal = Number(match[1]) - 1;
    if (ordinal >= 0) indexes.add(ordinal);
  }
  return [...indexes];
}

function phraseOccurs(instruction: string, phrase: string): boolean {
  const normalizedPhrase = normalizedSemanticPhrase(phrase);
  if (!normalizedPhrase) return false;
  return ` ${normalizedSemanticPhrase(instruction)} `.includes(` ${normalizedPhrase} `);
}

function ordinalIndexesNearAliases(instruction: string, aliases: string[]): number[] {
  const normalized = normalizedSemanticPhrase(instruction);
  const indexes = new Set<number>();
  for (const alias of aliases.map(normalizedSemanticPhrase).filter(Boolean)) {
    let aliasIndex = normalized.indexOf(alias);
    while (aliasIndex >= 0) {
      const window = normalized.slice(Math.max(0, aliasIndex - 72), Math.min(normalized.length, aliasIndex + alias.length + 32));
      instructionOrdinalIndexes(window).forEach((index) => indexes.add(index));
      aliasIndex = normalized.indexOf(alias, aliasIndex + alias.length);
    }
  }
  return [...indexes];
}

function evidenceIntentScore(
  item: NorthstarArtboardSemanticGraph["evidenceItems"][number],
  instruction: string,
): number {
  const request = normalizedSemanticPhrase(instruction);
  const semanticText = normalizedSemanticPhrase([
    item.title,
    item.journeyStage,
    ...item.visibleCopy,
  ].filter(Boolean).join(" "));
  let score = focusScore(instructionTokens(instruction), [semanticText]);
  const requestsRoleSelection = /\b(role|persona|profession|professional|account type|describes (?:the )?user|chooses? (?:their )?role)\b/.test(request);
  if (requestsRoleSelection) {
    if (/\b(role selection|choose (?:your )?role|select (?:your )?role|account type|persona|profession|professional role|what describes you)\b/.test(semanticText)) score += 24;
    if (/\b(advertiser|publisher|agency|merchant|seller|creator|affiliate type|partner type)\b/.test(semanticText)) score += 10;
  }
  return score;
}

function regionPairGeometry(
  first: NorthstarArtboardSemanticGraph["regions"][number],
  second: NorthstarArtboardSemanticGraph["regions"][number],
) {
  const a = first.bounds;
  const b = second.bounds;
  if (!a || !b) return undefined;
  const horizontalGap = a.right <= b.left
    ? { left: a.right, right: b.left, top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) }
    : b.right <= a.left
      ? { left: b.right, right: a.left, top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) }
      : undefined;
  const verticalGap = a.bottom <= b.top
    ? { left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: a.bottom, bottom: b.top }
    : b.bottom <= a.top
      ? { left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: b.bottom, bottom: a.top }
      : undefined;
  const gap = horizontalGap ?? verticalGap;
  return {
    firstRegionId: first.regionId,
    secondRegionId: second.regionId,
    orientation: horizontalGap ? "horizontal" : verticalGap ? "vertical" : "overlapping",
    gap: gap ? { ...gap, width: Math.max(0, gap.right - gap.left), height: Math.max(0, gap.bottom - gap.top) } : undefined,
  };
}

function resolveNorthstarInstructionFocus(input: {
  instruction: string;
  graph: NorthstarArtboardSemanticGraph;
}) {
  const tokens = instructionTokens(input.instruction);
  const conceptCandidates = input.graph.concepts.map((concept) => ({
    kind: "concept" as const,
    id: concept.conceptId,
    label: concept.label,
    canonicalNodeIds: concept.canonicalNodeIds,
    score: focusScore(tokens, [concept.label, concept.definition, ...concept.aliases]),
  }));
  const regionCandidates = input.graph.regions.map((region) => {
    const concept = input.graph.concepts.find((item) => item.conceptId === region.conceptId);
    return {
      kind: "region" as const,
      id: region.regionId,
      label: concept?.label ?? region.regionId,
      rootNodeId: region.rootNodeId,
      memberNodeIds: region.memberNodeIds,
      bounds: region.bounds,
      anchors: region.anchors,
      score: focusScore(tokens, [region.regionId, concept?.label ?? "", ...(concept?.aliases ?? [])]),
    };
  });
  const evidenceCandidates = input.graph.evidenceItems.map((item) => {
    const nodes = input.graph.nodes.filter((node) => node.nodeId === item.nodeId || node.parentId === item.nodeId);
    const suppliedSemanticText = [item.title, item.journeyStage, ...item.visibleCopy]
      .filter((value): value is string => Boolean(value));
    const semanticText = suppliedSemanticText.length
      ? suppliedSemanticText
      : nodes.map((node) => node.text.slice(0, 240)).filter(Boolean).slice(0, 4);
    return {
      kind: "evidence" as const,
      id: item.nodeId,
      flowId: item.flowId,
      index: item.index,
      evidenceId: item.evidenceId,
      bounds: item.bounds,
      anchors: item.anchors,
      semanticText,
      appName: item.appName,
      flowName: item.flowName,
      title: item.title,
      journeyStage: item.journeyStage,
      visibleCopy: item.visibleCopy,
      ordinal: ordinalLabel(item.index),
      score: focusScore(tokens, [
        item.flowId,
        item.appName ?? "",
        item.flowName ?? "",
        item.title ?? "",
        item.journeyStage ?? "",
        ordinalLabel(item.index),
        String(item.index),
        ...semanticText,
      ]),
    };
  });
  const candidates = [...conceptCandidates, ...regionCandidates, ...evidenceCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
  const instruction = input.instruction;
  const normalizedInstruction = normalizedSemanticPhrase(instruction);
  const evidenceByFlow = new Map<string, typeof evidenceCandidates>();
  for (const candidate of evidenceCandidates) {
    const members = evidenceByFlow.get(candidate.flowId) ?? [];
    members.push(candidate);
    evidenceByFlow.set(candidate.flowId, members);
  }
  for (const members of evidenceByFlow.values()) members.sort((first, second) => first.index - second.index);

  const rawFlowAliases = new Map<string, string[]>();
  for (const [flowId, members] of evidenceByFlow) {
    rawFlowAliases.set(flowId, [...new Set([
      flowId,
      flowId.replace(/[-_]+/g, " "),
      ...members.flatMap((member) => [member.appName ?? "", member.flowName ?? ""]),
    ].filter(Boolean))]);
  }
  const aliasUseCount = new Map<string, number>();
  for (const aliases of rawFlowAliases.values()) {
    for (const alias of new Set(aliases.map(normalizedSemanticPhrase))) {
      aliasUseCount.set(alias, (aliasUseCount.get(alias) ?? 0) + 1);
    }
  }
  const flowAliases = new Map([...rawFlowAliases].map(([flowId, aliases]) => [
    flowId,
    aliases.filter((alias) => alias === flowId || aliasUseCount.get(normalizedSemanticPhrase(alias)) === 1),
  ]));
  const mentionedFlowIds = [...flowAliases.entries()]
    .filter(([, aliases]) => aliases.some((alias) => phraseOccurs(instruction, alias)))
    .map(([flowId]) => flowId);
  const allOrdinalIndexes = instructionOrdinalIndexes(instruction);
  const authoritative = new Map<string, { candidate: (typeof candidates)[number]; reason: string }>();
  const selectCandidate = (candidate: (typeof candidates)[number] | undefined, reason: string) => {
    if (candidate && !authoritative.has(`${candidate.kind}:${candidate.id}`)) {
      authoritative.set(`${candidate.kind}:${candidate.id}`, { candidate, reason });
    }
  };

  const requestsCollectiveFlows = /\b(flows?|groups?|sections?|separate groups?|onboarding flows?)\b/.test(normalizedInstruction);
  const requestsAllCurrentFlows = /\b(?:all|both|current|existing) (?:onboarding )?flows?\b/.test(normalizedInstruction)
    || /\bbelow (?:the )?(?:current |existing )?(?:onboarding )?flows?\b/.test(normalizedInstruction);
  if (requestsCollectiveFlows) {
    const targetFlowIds = requestsAllCurrentFlows || mentionedFlowIds.length === 0
      ? [...evidenceByFlow.keys()]
      : mentionedFlowIds;
    for (const flowId of targetFlowIds) {
      selectCandidate(regionCandidates.find((candidate) => candidate.id === `flow:${flowId}`), "explicit collective flow region");
    }
  }
  if (/\b(research|grounded evidence|evidence trail|research area|research section)\b/.test(normalizedInstruction)) {
    selectCandidate(regionCandidates.find((candidate) => candidate.id === "research"), "explicit research region");
  }

  for (const flowId of mentionedFlowIds) {
    const aliases = flowAliases.get(flowId) ?? [];
    const localOrdinals = ordinalIndexesNearAliases(instruction, aliases);
    const ordinalIndexes = localOrdinals.length
      ? localOrdinals
      : allOrdinalIndexes.length === 1
        ? allOrdinalIndexes
        : [];
    const members = evidenceByFlow.get(flowId) ?? [];
    for (const ordinal of ordinalIndexes) {
      selectCandidate(members.find((candidate) => candidate.index === ordinal), `explicit ${ordinalLabel(ordinal)} item in named flow`);
    }
  }

  if (mentionedFlowIds.length === 0 && evidenceByFlow.size === 1) {
    const [members] = evidenceByFlow.values();
    for (const ordinal of allOrdinalIndexes) {
      selectCandidate(members.find((candidate) => candidate.index === ordinal), `explicit ${ordinalLabel(ordinal)} item in unambiguous flow`);
    }
  }

  const requestsSpecificScreen = /\b(screen|screenshot|step|view)\b/.test(normalizedInstruction);
  if (requestsSpecificScreen && mentionedFlowIds.length > 0 && allOrdinalIndexes.length === 0) {
    for (const flowId of mentionedFlowIds) {
      const ranked = (evidenceByFlow.get(flowId) ?? [])
        .map((candidate) => ({ candidate, intentScore: evidenceIntentScore(
          input.graph.evidenceItems.find((item) => item.nodeId === candidate.id)!,
          instruction,
        ) }))
        .sort((first, second) => second.intentScore - first.intentScore || second.candidate.score - first.candidate.score);
      if ((ranked[0]?.intentScore ?? 0) > 0) selectCandidate(ranked[0]?.candidate, "best semantic match inside named flow");
    }
  }

  if (authoritative.size === 0) {
    const maximumScore = Math.max(0, ...candidates.map((candidate) => candidate.score));
    const fallback = candidates.filter((candidate) => candidate.score === maximumScore && candidate.score > 0);
    (fallback.length ? fallback : candidates.slice(0, 1)).forEach((candidate) => selectCandidate(candidate, "semantic ranking fallback"));
  }
  const authoritativeCandidates = [...authoritative.values()].map(({ candidate }) => candidate);
  const authoritativeReferents = [...authoritative.values()].map(({ candidate, reason }) => ({
    kind: candidate.kind,
    id: candidate.id,
    label: candidate.kind === "evidence"
      ? candidate.title ?? [candidate.appName, candidate.ordinal].filter(Boolean).join(" ")
      : candidate.label,
    reason,
  }));
  const authoritativeEvidence = authoritativeCandidates.filter((candidate) => candidate.kind === "evidence");
  const pairRequest = /\b(between|connect|connector|relationship|equal space|gap)\b/.test(normalizedInstruction);
  const referencePairs = pairRequest && authoritativeEvidence.length === 2
    ? [{
      purpose: /\b(equal space|gap|annotation)\b/.test(normalizedInstruction) ? "measured-gap" : "authored-relationship",
      firstNodeId: authoritativeEvidence[0]!.id,
      secondNodeId: authoritativeEvidence[1]!.id,
    }]
    : [];
  const focusedRegions = authoritativeCandidates
    .filter((candidate) => candidate.kind === "region")
    .slice(0, 6);
  const regionPairs = focusedRegions.flatMap((first, index) => focusedRegions.slice(index + 1).flatMap((second) => {
    const firstRegion = input.graph.regions.find((region) => region.regionId === first.id);
    const secondRegion = input.graph.regions.find((region) => region.regionId === second.id);
    const geometry = firstRegion && secondRegion ? regionPairGeometry(firstRegion, secondRegion) : undefined;
    return geometry ? [geometry] : [];
  }));
  return { candidates, authoritativeCandidates, authoritativeReferents, referencePairs, regionPairs };
}

function requestedPlacementSides(instruction: string): NorthstarPlacementSide[] {
  const normalized = normalizedSemanticPhrase(instruction);
  const sides: NorthstarPlacementSide[] = [];
  if (/\b(?:below|beneath|under)\b/.test(normalized)) sides.push("bottom");
  if (/\b(?:to the )?right(?: of)?\b/.test(normalized)) sides.push("right");
  if (/\babove\b/.test(normalized)) sides.push("top");
  if (/\b(?:to the )?left(?: of)?\b/.test(normalized)) sides.push("left");
  return [...new Set(sides)];
}

function instructionAuthorsOuterFootprint(instruction: string): boolean {
  const normalized = normalizedSemanticPhrase(instruction);
  return /\b(?:add|place|put|insert|create|reuse|duplicate|copy|reposition|position|move|resize|scale|compose|render)\b/.test(normalized)
    && /\b(?:card|annotation|explanation|area|panel|label|note|callout|caption|view|object|item|screen|screenshot|image|shape|frame)\b/.test(normalized);
}

function resolveNorthstarPlacementTerritories(input: {
  instruction: string;
  graph: NorthstarArtboardSemanticGraph;
  focus: ReturnType<typeof resolveNorthstarInstructionFocus>;
}): NorthstarObservedPlacementTerritory[] {
  if (!instructionAuthorsOuterFootprint(input.instruction)) return [];

  const artboardTerritory = input.graph.artboard.bounds ? {
    territoryId: "artboard",
    kind: "artboard" as const,
    bounds: input.graph.artboard.bounds,
  } : undefined;
  if (requestedPlacementSides(input.instruction).length > 0) {
    return artboardTerritory ? [artboardTerritory] : [];
  }

  const territories = new Map<string, NorthstarObservedPlacementTerritory>();
  const addRegion = (region: NorthstarArtboardSemanticGraph["regions"][number] | undefined) => {
    if (!region?.bounds || territories.has(region.regionId)) return;
    territories.set(region.regionId, {
      territoryId: region.regionId,
      kind: "semantic-region",
      bounds: region.bounds,
    });
  };
  for (const candidate of input.focus.authoritativeCandidates) {
    if (candidate.kind === "region") {
      addRegion(input.graph.regions.find((region) => region.regionId === candidate.id));
    } else if (candidate.kind === "evidence") {
      input.graph.regions
        .filter((region) => region.rootNodeId === candidate.id || region.memberNodeIds.includes(candidate.id))
        .forEach(addRegion);
    } else {
      input.graph.regions.filter((region) => region.conceptId === candidate.id).forEach(addRegion);
    }
  }
  if (territories.size === 0 && artboardTerritory) territories.set(artboardTerritory.territoryId, artboardTerritory);
  return [...territories.values()].slice(0, 4);
}

function buildNorthstarContinuityContext(input: {
  graph: NorthstarArtboardSemanticGraph;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  focus: ReturnType<typeof resolveNorthstarInstructionFocus>;
}) {
  const snapshotNodes = input.acknowledgement.snapshot?.semanticNodes ?? [];
  const evidenceIds = new Set(input.graph.evidenceItems.map((item) => item.nodeId));
  const regionRootIds = new Set(input.graph.regions.map((region) => region.rootNodeId));
  const authoredRelations = input.acknowledgement.authoredDesignRelations ?? [];
  const targetIdsBySubject = new Map<string, Set<string>>();
  for (const relation of authoredRelations) {
    const targets = targetIdsBySubject.get(relation.subjectId) ?? new Set<string>();
    for (const reference of relation.references ?? []) targets.add(reference.nodeId);
    targetIdsBySubject.set(relation.subjectId, targets);
  }
  const additions = snapshotNodes.flatMap((node) => {
    if (evidenceIds.has(node.nodeId) || regionRootIds.has(node.nodeId)) return [];
    const attrs = node.normalizedAttributes ?? {};
    const identity = [node.nodeId, attrs["data-ns-role"] ?? "", ...(node.normalizedClasses ?? [])].join(" ").toLowerCase();
    const targetIds = new Set(targetIdsBySubject.get(node.nodeId) ?? []);
    for (const key of ["data-ns-explains-node-id", "data-ns-source-node-id", "data-ns-target-node-id", "data-ns-between-before-node-id", "data-ns-between-after-node-id"]) {
      const value = attrs[key];
      if (value) targetIds.add(value);
    }
    const authored = targetIds.size > 0 || /(?:annotation|callout|caption|explanation|comment|remark|note|card|connector|relationship|label)/.test(identity);
    if (!authored) return [];
    const targetRegionIds = input.graph.regions
      .filter((region) => [...targetIds].some((targetId) => region.rootNodeId === targetId || region.memberNodeIds.includes(targetId)))
      .map((region) => region.regionId);
    return [{
      nodeId: node.nodeId,
      parentId: node.parentId,
      text: node.normalizedText,
      bounds: node.bounds,
      targetNodeIds: [...targetIds],
      targetRegionIds,
      semanticIdentityProtected: true,
      meaningAndTargetProtected: true,
      visualFormAndPlacementRecomposable: true,
    }];
  });
  const focusedIds = new Set(input.focus.authoritativeCandidates.flatMap((candidate) => {
    if (candidate.kind === "concept") {
      const matchingRegions = input.graph.regions.filter((region) => region.conceptId === candidate.id);
      return [...candidate.canonicalNodeIds, ...matchingRegions.flatMap((region) => [region.rootNodeId, ...region.memberNodeIds])];
    }
    if (candidate.kind === "region") return [candidate.rootNodeId, ...candidate.memberNodeIds];
    return [candidate.id];
  }));
  const dependencyIds = new Set(focusedIds);
  let dependencyChanged = true;
  while (dependencyChanged) {
    dependencyChanged = false;
    for (const relation of authoredRelations) {
      const relationIds = [relation.subjectId, ...(relation.references ?? []).map((reference) => reference.nodeId)];
      if (!relationIds.some((id) => dependencyIds.has(id))) continue;
      for (const id of relationIds) {
        if (dependencyIds.has(id)) continue;
        dependencyIds.add(id);
        dependencyChanged = true;
      }
    }
    for (const addition of additions) {
      const additionIds = [addition.nodeId, addition.parentId, ...addition.targetNodeIds, ...addition.targetRegionIds]
        .filter((value): value is string => Boolean(value));
      if (!additionIds.some((id) => dependencyIds.has(id))) continue;
      for (const id of additionIds) {
        if (dependencyIds.has(id)) continue;
        dependencyIds.add(id);
        dependencyChanged = true;
      }
    }
  }
  const affectedAdditions = additions.filter((addition) => dependencyIds.has(addition.nodeId));
  const relevantAuthoredRelations = authoredRelations.filter((relation) =>
    dependencyIds.has(relation.subjectId)
    || (relation.references ?? []).some((reference) => dependencyIds.has(reference.nodeId))
  );
  return {
    policy: "preserve meaning and evidence; recompose affected authored work when needed for cumulative congruence",
    appliesToEveryTurn: true,
    priorAuthoredAdditions: additions,
    affectedAuthoredAdditions: affectedAdditions,
    protectedEvidenceNodeIds: [...evidenceIds],
    evidencePositionPolicy: "recomposable-when-needed",
    recomposableEvidenceNodeIds: [...evidenceIds],
    recomposableAuthoredNodeIds: affectedAdditions.map((item) => item.nodeId),
    unrelatedAuthoredNodeIds: additions.filter((item) => !affectedAdditions.includes(item)).map((item) => item.nodeId),
    affectedCompositionNodeIds: [...dependencyIds],
    relevantAuthoredRelations,
    browserContinuityObservations: input.acknowledgement.review?.authoredContinuityObservations ?? [],
  };
}

export function buildNorthstarDesignResetModelInput(input: {
  turn: NorthstarDesignResetTurn;
  instruction: string;
  artifact: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  objectiveProgress?: {
    objectiveIndex: number;
    designTurnIndex: number;
    priorPlan?: NorthstarObjectiveActionPlan;
    previousOutcome?: {
      status: "applied" | "rejected";
      actionId?: string;
      detail: string;
      revisionId?: string;
    };
  };
}): unknown {
  const observation = strongestSourceObservation(input);
  const snapshot = observation.snapshot;
  const semanticGraph = buildNorthstarArtboardSemanticGraph(input);
  const instruction = input.instruction;
  const focus = resolveNorthstarInstructionFocus({ instruction, graph: semanticGraph });
  const continuityContext = buildNorthstarContinuityContext({ graph: semanticGraph, acknowledgement: input.acknowledgement, focus });
  const instructionResolution = {
    resolver: "northstar.semantic-focus.v1",
    instruction,
    focusCandidates: focus.candidates,
    selectedRegionPairs: focus.regionPairs,
    availableSpatialRelations: {
      relativePlacement: {
        kind: "relative-placement",
        purpose: "Keep an authored subject spatially dependent on one referenced node or semantic region.",
        referenceGeometry: ["border-box", "semantic-descendant-union"],
        authoredParameters: ["side", "offsetX", "offsetY", "alignX", "alignY"],
      },
      connectorAttachment: {
        kind: "connector-attachment",
        purpose: "Optionally keep endpoints of a model-authored SVG relationship attached to exact rendered anchors after later geometry changes.",
        authoredParameters: ["primitiveNodeId", "source anchor", "target anchor"],
      },
      betweenPlacement: {
        kind: "between-placement",
        purpose: "Keep a model-authored subject centered between two exact references when that dependency must remain live.",
        authoredParameters: ["axis", "crossAlign"],
      },
    },
    groundingInstruction: "Resolve the exact subject, objects, and collective regions named by the instruction from these candidates and the complete graph. The candidate ranking is semantic assistance, not a design decision. You may select a lower-ranked candidate when the source and browser state support it.",
    structuralInstruction: "For requests about groups, flows, sections, boundaries, or new analysis areas, reason from collective region membership and rendered bounds. The provided pair geometry is observational. Choose the visual treatment yourself and declare no runtime relation unless your authored result genuinely needs a persistent dependency.",
    preservationInstruction: "Preserve evidence source identity, content, dimensions, order, visibility, appearance, and provenance. Evidence placement is not globally frozen: when the current objective needs space, you may explicitly translate the smallest coherent affected evidence structure while keeping each item intact and keeping unrelated regions stable. When reusing evidence, preserve the original instance and create a distinct authored presentation instance for the reused view.",
    compositionInstruction: "Solve the complete affected composition, not just the new object's coordinates. Before placing anything, compare required span (planned subject outer size plus intended clearance) with the measured available empty span on the placement axis. If it does not fit, create deliberate negative space by explicitly moving the smallest coherent surrounding structure, reposition dependent authored work, and grow the artboard when useful; do not search coordinates inside the same insufficient space. Every expected movement of pre-existing content must have an explicit mutation owner (the object itself or its genuinely coherent container); never rely on flex/grid/margin/gap reflow of one child to move siblings. Preserve protected evidence border-box width and height exactly. Prefer one coordinated spatial plan over repeated local collision avoidance.",
  };
  return {
    resetVersion: NORTHSTAR_PRODUCTION_DESIGN_LOOP_VERSION,
    turn: input.turn,
    instruction,
    objectiveProgress: input.objectiveProgress,
    semanticContract: {
      authoritative: true,
      graph: semanticGraph,
      instructionResolution: {
        ...instructionResolution,
        note: "The full graph and browser state are available on every turn. Instruction focus ranks likely referents and measures their current geometry without selecting a design. You choose the exact grounding, authored objects, layout, styling, relationships, and any required artboard growth.",
      },
    },
    currentArtboard: {
      package: input.artifact,
      browserAcknowledgement: input.acknowledgement,
      browserMaterializedSource: observation.source === "browser-snapshot" ? snapshot : undefined,
      canonicalSource: snapshot,
      sourceSha256: sourceHash(snapshot),
      observationAvailability: {
        canonicalSource: "available",
        browserAcknowledgement: input.acknowledgement.status === "ready" ? "missing" : "current",
        browserGeometry: input.acknowledgement.snapshot?.semanticNodes?.length ? "available" : "missing",
        browserSnapshot: observation.source === "browser-snapshot" ? "available" : "missing",
      },
    },
    designPartnerContext: {
      appliesToEveryTurn: true,
      objective: "Help the model reach a complete, clear, readable, correctly attributed, evidence-safe result through singular observed artboard actions while preserving design ownership.",
      protectedEvidenceNodeIds: semanticGraph.evidenceItems.map((item) => item.nodeId),
      currentEvidencePresentation: input.acknowledgement.evidenceRegistry?.presentationManifest ?? [],
      currentAuthoredInterferencePairs: input.acknowledgement.review?.authoredInterferencePairs ?? [],
      currentRuntimeReview: input.acknowledgement.review,
      currentResolvedRelations: input.acknowledgement.resolvedDesignRelations ?? [],
      currentAuthoredRelations: input.acknowledgement.authoredDesignRelations ?? [],
      currentSemanticNodes: snapshot.semanticNodes ?? [],
      continuityContext,
      authoringQuestions: [
        "Is every addition readable and fully rendered inside its own bounds?",
        "Can a viewer understand why each addition is present and what it refers to?",
        "Does any text, card, label, annotation, fill, or decoration obscure protected evidence?",
        "Does any connector, leader, bracket, line, or relationship mark cross text, cards, annotations, labels, or other readable authored content in a way that creates ambiguity?",
        "Is there actually enough negative space for this addition and its attribution, or should I first move the smallest coherent surrounding row, sequence, or flow to create it?",
        "On the intended placement axis, is measured available empty span at least the planned subject outer size plus clearance? If not, create space before choosing coordinates.",
        "Am I treating an existing x/y position as sacred even though evidence identity, pixels, dimensions, appearance, and order could be preserved while the intact item or flow is translated?",
        "Does every pre-existing object I expect to move have an explicit movement owner in this mutation, or am I relying on normal-flow reflow to move siblings for me?",
        "Did any protected evidence border-box width or height change? If so, restore its exact measured dimensions before returning the mutation.",
        "After this turn, do all earlier additions still read clearly together, or should you reroute, reposition, redesign, or create more space while preserving their meaning?",
        "Did this turn change the context of any prior authored addition, and if so did you recompose that affected addition while preserving its identity, meaning, target, and provenance?",
        "Did the mutation preserve evidence source, size, order, visibility, appearance, and unrelated prior work while limiting supporting movement to the smallest coherent affected structure?",
        "Did the design create enough negative space or artboard growth instead of compressing or covering content?",
        "Will every authored live relation remain understandable and attached after browser realization?",
      ],
    },
  };
}

export function buildNorthstarCompactDesignTurnContext(input: {
  turn: NorthstarDesignResetTurn;
  instruction: string;
  artifact: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  objectiveProgress?: {
    objectiveIndex: number;
    designTurnIndex: number;
    priorPlan?: NorthstarObjectiveActionPlan;
    previousOutcome?: {
      status: "applied" | "rejected";
      actionId?: string;
      detail: string;
      revisionId?: string;
      browserReceipt?: Record<string, unknown>;
    };
    observedTurns?: readonly NorthstarObservedObjectiveTurn[];
  };
}) {
  const graph = buildNorthstarArtboardSemanticGraph(input);
  const focus = resolveNorthstarInstructionFocus({ instruction: input.instruction, graph });
  const placementRequired = instructionAuthorsOuterFootprint(input.instruction);
  const preferredPlacementSides = requestedPlacementSides(input.instruction);
  const placementTerritories = resolveNorthstarPlacementTerritories({
    instruction: input.instruction,
    graph,
    focus,
  });
  const activeFocusCandidates = focus.authoritativeCandidates;
  const expandFocusCandidateNodeIds = (candidate: (typeof focus.candidates)[number]) => {
    if (candidate.kind === "concept") {
      const matchingRegions = graph.regions.filter((region) => region.conceptId === candidate.id);
      return [
        ...candidate.canonicalNodeIds,
        ...matchingRegions.flatMap((region) => [region.rootNodeId, ...region.memberNodeIds]),
      ];
    }
    if (candidate.kind === "region") return [candidate.rootNodeId, ...candidate.memberNodeIds];
    return [candidate.id];
  };
  const relevantIds = new Set<string>();
  for (const candidate of activeFocusCandidates) {
    expandFocusCandidateNodeIds(candidate).forEach((id) => relevantIds.add(id));
  }
  const changedNodeIds = input.acknowledgement.meaningfulChangedNodeIds.length
    ? input.acknowledgement.meaningfulChangedNodeIds
    : input.acknowledgement.changedNodeIds;
  changedNodeIds.forEach((id) => relevantIds.add(id));
  for (const changedId of changedNodeIds) {
    let parentId = graph.nodes.find((node) => node.nodeId === changedId)?.parentId;
    while (parentId && !relevantIds.has(parentId)) {
      relevantIds.add(parentId);
      parentId = graph.nodes.find((node) => node.nodeId === parentId)?.parentId;
    }
  }
  for (const relation of graph.relationships) {
    if (relevantIds.has(relation.subjectId) || relevantIds.has(relation.objectId)) {
      relevantIds.add(relation.subjectId);
      relevantIds.add(relation.objectId);
    }
  }
  const relevantNodes = graph.nodes.filter((node) =>
    relevantIds.has(node.nodeId) || (node.parentId ? relevantIds.has(node.parentId) : false)
  );
  relevantNodes.forEach((node) => relevantIds.add(node.nodeId));
  const priorPlan = input.objectiveProgress?.priorPlan;
  const previousOutcome = input.objectiveProgress?.previousOutcome;
  const spatialFocusNodeIds = [...new Set(activeFocusCandidates.flatMap(expandFocusCandidateNodeIds))];
  const observedSpatialFacts = buildNorthstarObservedSpatialFacts({
    acknowledgement: input.acknowledgement,
    focusNodeIds: spatialFocusNodeIds,
    referencePairs: focus.referencePairs,
    placementTerritories,
    placementRequired,
    preferredSides: preferredPlacementSides,
  });
  const continuity = buildNorthstarContinuityContext({ graph, acknowledgement: input.acknowledgement, focus });
  const relevantObservationIds = new Set([...continuity.affectedCompositionNodeIds, ...changedNodeIds]);
  for (const region of graph.regions) {
    if (!relevantObservationIds.has(region.rootNodeId) && !region.memberNodeIds.some((id) => relevantObservationIds.has(id))) continue;
    relevantObservationIds.add(region.regionId);
    relevantObservationIds.add(region.regionId.replace(/^flow:/, ""));
  }
  const relevantInterference = (input.acknowledgement.review?.authoredInterferencePairs ?? []).filter((finding) =>
    [finding.relationshipId, finding.primitiveId, finding.obstacleId].some((id) => relevantObservationIds.has(id))
  ).slice(0, 8);
  const relevantContinuity = (input.acknowledgement.review?.authoredContinuityObservations ?? []).filter((finding) =>
    relevantObservationIds.has(finding.additionId)
    || finding.targetNodeIds.some((id) => relevantObservationIds.has(id))
  ).slice(0, 8);
  const relevantRegionIntrusions = (input.acknowledgement.review?.semanticRegionIntrusions ?? []).filter((finding) =>
    relevantObservationIds.has(finding.additionId)
    || relevantObservationIds.has(finding.intendedFlowId)
    || relevantObservationIds.has(finding.intrudedFlowId)
  ).slice(0, 8);
  const relevantResolvedRelations = (input.acknowledgement.resolvedDesignRelations ?? []).filter((relation) =>
    continuity.relevantAuthoredRelations.some((authored) => authored.id === relation.relationId)
  );
  const currentRelevantRelations = {
    authored: continuity.relevantAuthoredRelations.map((relation) => ({
      kind: relation.kind,
      subjectId: relation.subjectId,
      referenceNodeIds: (relation.references ?? []).map((reference) => reference.nodeId),
    })),
    resolved: relevantResolvedRelations.map((relation) => ({
      relationId: relation.relationId,
      status: relation.status,
      inputBounds: relation.inputBounds,
      outputBounds: relation.outputBounds,
    })),
  };
  const identityAuthority: NorthstarDesignTurnIdentityAuthority = {
    browserRevisionId: input.acknowledgement.browserRevisionId ?? input.artifact.revisionId,
    knownNodeIds: [...new Set([
      ...graph.nodes.map((node) => node.nodeId),
      ...graph.evidenceItems.map((item) => item.nodeId),
      ...graph.regions.flatMap((region) => [region.rootNodeId, ...region.memberNodeIds]),
    ])].sort(),
    knownRegionIds: [...new Set(graph.regions.map((region) => region.regionId))].sort(),
    knownConceptIds: [...new Set([
      ...graph.concepts.map((concept) => concept.conceptId),
      ...graph.regions.map((region) => region.conceptId),
    ])].sort(),
    knownAuthoredRelationIds: [...new Set([
      ...(input.acknowledgement.authoredDesignRelations ?? []).map((relation) => relation.id),
      ...(input.acknowledgement.resolvedDesignRelations ?? []).map((relation) => relation.relationId),
    ])].sort(),
    protectedEvidenceNodeIds: [...new Set(graph.evidenceItems.map((item) => item.nodeId))].sort(),
  };
  return {
    schema: "northstar.compact-design-turn-context.v1" as const,
    objective: input.instruction,
    turn: input.turn,
    objectiveIndex: input.objectiveProgress?.objectiveIndex,
    revision: {
      artifactId: input.artifact.artifactId,
      revisionId: input.artifact.revisionId,
      browserRevisionId: input.acknowledgement.browserRevisionId,
      sourceSha256: graph.sourceSha256,
    },
    artboard: graph.artboard,
    identityAuthority,
    focus: {
      authoritativeReferents: focus.authoritativeReferents,
      referencePairs: focus.referencePairs,
      candidates: focus.candidates.slice(0, 6),
      regionPairs: focus.regionPairs,
    },
    relevantRegions: graph.regions.filter((region) =>
      relevantIds.has(region.rootNodeId) || region.memberNodeIds.some((id) => relevantIds.has(id))
    ),
    relevantNodes: relevantNodes.map((node) => ({
      ...node,
      text: node.text.slice(0, 180),
    })),
    evidenceIndex: graph.evidenceItems.map(({ nodeId, flowId, index, evidenceId, appName, flowName, title, journeyStage, bounds, anchors }) => ({
      nodeId,
      flowId,
      index,
      evidenceId,
      appName,
      flowName,
      title,
      journeyStage,
      bounds,
      anchors,
    })),
    focusedEvidence: graph.evidenceItems
      .filter((item) => relevantIds.has(item.nodeId))
      .map(({ nodeId, visibleCopy }) => ({
        nodeId,
        visibleCopy: visibleCopy.slice(0, 8).map((copy) => copy.slice(0, 180)),
      })),
    semanticSpatialRules: graph.vocabulary,
    observedSpatialFacts,
    priorAuthoredObjects: continuity.priorAuthoredAdditions.map((addition) => ({
      ...addition,
      text: addition.text.slice(0, relevantIds.has(addition.nodeId) ? 180 : 80),
    })),
    relations: {
      semantic: graph.relationships.filter((relation) =>
        relevantIds.has(relation.subjectId) || relevantIds.has(relation.objectId)
      ),
      authored: continuity.relevantAuthoredRelations,
      resolved: relevantResolvedRelations,
    },
    browserFindings: {
      status: input.acknowledgement.status,
      changedNodeIds,
      interference: relevantInterference,
      continuity: relevantContinuity,
      regionIntrusions: relevantRegionIntrusions,
    },
    progress: {
      objectiveSummary: priorPlan?.objectiveSummary,
      plannedActions: priorPlan?.plannedActions.slice(0, 6) ?? [],
      completedActions: priorPlan?.completedActions.slice(0, 6) ?? [],
      previousOutcome: previousOutcome ? {
        status: previousOutcome.status,
        actionId: previousOutcome.actionId,
        revisionId: previousOutcome.revisionId,
        detail: previousOutcome.detail.slice(0, 1_200),
        browserReceipt: previousOutcome.browserReceipt,
      } : undefined,
      observedTurnJournal: (input.objectiveProgress?.observedTurns ?? []).slice(-6).map((turn) => ({
        ...turn,
        intent: turn.intent.slice(0, 300),
        successSignal: turn.successSignal.slice(0, 300),
        changedNodeIds: turn.changedNodeIds.slice(0, 24),
        remainingFindings: turn.remainingFindings.slice(0, 8).map((finding) => finding.slice(0, 500)),
      })),
    },
    objectiveSatisfaction: {
      previousActionStatus: previousOutcome?.status,
      observedRevisionId: input.acknowledgement.browserRevisionId,
      authoritativeReferentIds: focus.authoritativeReferents.map((referent) => referent.id),
      currentRelevantRelations,
      changedNodeIds,
      remainingBrowserIssueCount:
        relevantInterference.length + relevantContinuity.length + relevantRegionIntrusions.length,
      instruction: "Return objective-complete as soon as this exact current revision satisfies the objective; do not issue a redundant polish or assertion action.",
    },
    rules: {
      oneOperation: true,
      observeBeforeNextAction: true,
      protectedEvidenceDimensionsAreImmutable: true,
      explicitMovementOnly: true,
      preserveUnrelatedRegions: true,
    },
  };
}

export function sanitizeNorthstarDesignResetModelResponse(input: {
  raw: unknown;
  turn: NorthstarDesignResetTurn;
  baseRevisionId: string;
  continuation?: boolean;
  existingRelations?: NorthstarAuthoredDesignRelation[];
  identityAuthority?: NorthstarDesignTurnIdentityAuthority;
}): NorthstarDesignResetModelResponse {
  // The browser remains the spatial authority. Before execution, this boundary
  // only rejects invented semantic identities and stale browser revisions.
  const raw = isRecord(input.raw) ? input.raw : {};
  const groundingRaw = isRecord(raw.grounding) ? raw.grounding : {};
  const mutation = sanitizeNorthstarArtboardMutationDraft(
    (isRecord(raw.mutation) ? raw.mutation : { operations: [] }) as unknown as NorthstarArtboardMutationDraft,
  );
  const response: NorthstarDesignResetModelResponse = {
    turn: input.turn,
    observedBaseRevisionId: input.baseRevisionId,
    understanding: typeof raw.understanding === "string" ? raw.understanding.trim() : "",
    grounding: {
      conceptId: groundingRaw.conceptId === "evidence-relationship"
        ? "evidence-relationship"
        : groundingRaw.conceptId === "evidence-gap-annotation"
          ? "evidence-gap-annotation"
          : groundingRaw.conceptId === "evidence-explanation"
            ? "evidence-explanation"
            : groundingRaw.conceptId === "flow-structure"
              ? "flow-structure"
              : groundingRaw.conceptId === "evidence-reuse"
                ? "evidence-reuse"
                : "research",
      resolvedNodeId: typeof groundingRaw.resolvedNodeId === "string" ? groundingRaw.resolvedNodeId : "",
      requestedRelation: groundingRaw.requestedRelation === "below" || groundingRaw.requestedRelation === "right-of" || groundingRaw.requestedRelation === "relationship-between" || groundingRaw.requestedRelation === "equal-space-with-annotation" || groundingRaw.requestedRelation === "explains" || groundingRaw.requestedRelation === "reuses" || groundingRaw.requestedRelation === "none"
        ? groundingRaw.requestedRelation
        : "none",
      placementSpace: groundingRaw.placementSpace === "artboard-world" ? "artboard-world" : "artboard-world",
      referenceContinuity: groundingRaw.referenceContinuity === "pixel-stable" ? "pixel-stable" : "pixel-stable",
      expansionDirection: groundingRaw.expansionDirection === "down" || groundingRaw.expansionDirection === "right" || groundingRaw.expansionDirection === "none"
        ? groundingRaw.expansionDirection
        : "none",
      evidenceNodeIds: Array.isArray(groundingRaw.evidenceNodeIds)
        ? groundingRaw.evidenceNodeIds.filter((value): value is string => typeof value === "string")
        : [],
      expectedPreservedNodeIds: Array.isArray(groundingRaw.expectedPreservedNodeIds)
        ? groundingRaw.expectedPreservedNodeIds.filter((value): value is string => typeof value === "string")
        : [],
      interpretation: typeof groundingRaw.interpretation === "string" ? groundingRaw.interpretation.trim() : "",
    },
    mutation,
  };
  if (input.identityAuthority) {
    const authority = input.identityAuthority;
    if (authority.browserRevisionId !== input.baseRevisionId) {
      throw new Error(`Identity authority observed revision ${authority.browserRevisionId} instead of current revision ${input.baseRevisionId}.`);
    }
    const knownNodeIds = new Set(authority.knownNodeIds);
    const knownReferentIds = new Set([
      ...authority.knownNodeIds,
      ...authority.knownRegionIds,
      ...authority.knownConceptIds,
      "artboard",
    ]);
    if (!knownReferentIds.has(response.grounding.resolvedNodeId)) {
      throw new Error(`The model grounded the action in unknown referent ${response.grounding.resolvedNodeId || "missing"}.`);
    }
    for (const nodeId of response.grounding.evidenceNodeIds) {
      if (!knownNodeIds.has(nodeId)) throw new Error(`The model grounded the action in unknown evidence node ${nodeId}.`);
    }
    for (const nodeId of response.grounding.expectedPreservedNodeIds) {
      if (!knownNodeIds.has(nodeId)) throw new Error(`The model attempted to preserve unknown node ${nodeId}.`);
    }
  }
  const normalized = normalizeNorthstarSpatialAuthority({
    response,
    continuation: input.continuation,
    existingRelations: input.existingRelations,
  });
  if (normalized.issues.length) throw new Error(normalized.issues.join(" "));
  return normalized.response;
}

export function sanitizeNorthstarObjectiveDecisionResponse(input: {
  raw: unknown;
  turn: NorthstarDesignResetTurn;
  baseRevisionId: string;
  existingRelations?: NorthstarAuthoredDesignRelation[];
  identityAuthority?: NorthstarDesignTurnIdentityAuthority;
}): NorthstarObjectiveDecisionResponse {
  const raw = isRecord(input.raw) ? input.raw : {};
  if (raw.observedBaseRevisionId !== input.baseRevisionId) {
    throw new Error(`The model observed revision ${String(raw.observedBaseRevisionId || "missing")} instead of current revision ${input.baseRevisionId}.`);
  }
  const planRaw = isRecord(raw.objectivePlan) ? raw.objectivePlan : {};
  const cleanActions = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];
  const objectivePlan: NorthstarObjectiveActionPlan = {
    objectiveSummary: typeof planRaw.objectiveSummary === "string" ? planRaw.objectiveSummary.trim() : "",
    plannedActions: cleanActions(planRaw.plannedActions),
    completedActions: cleanActions(planRaw.completedActions),
  };
  if (!objectivePlan.objectiveSummary) throw new Error("The model did not return an objective plan.");
  const understanding = typeof raw.understanding === "string" ? raw.understanding.trim() : "";
  if (raw.decision === "objective-complete") {
    const completionRationale = typeof raw.completionRationale === "string" ? raw.completionRationale.trim() : "";
    if (!completionRationale) throw new Error("The model declared completion without a rendered-state rationale.");
    const evidenceRaw = isRecord(raw.completionEvidence) ? raw.completionEvidence : {};
    const observedRevisionId = typeof evidenceRaw.observedRevisionId === "string"
      ? evidenceRaw.observedRevisionId.trim()
      : "";
    if (observedRevisionId !== input.baseRevisionId) {
      throw new Error(`Completion evidence observed revision ${observedRevisionId || "missing"} instead of current revision ${input.baseRevisionId}.`);
    }
    const satisfiedSignals = cleanActions(evidenceRaw.satisfiedSignals);
    const verifiedNodeIds = cleanActions(evidenceRaw.verifiedNodeIds);
    const measuredFacts = cleanActions(evidenceRaw.measuredFacts);
    const remainingIssues = cleanActions(evidenceRaw.remainingIssues);
    if (!satisfiedSignals.length) throw new Error("The model declared completion without rendered success evidence.");
    if (!verifiedNodeIds.length) throw new Error("The model declared completion without exact verified node identities.");
    if (!measuredFacts.length) throw new Error("The model declared completion without current browser measurements.");
    if (remainingIssues.length) throw new Error(`The model declared completion with unresolved issues: ${remainingIssues.join(" ")}`);
    if (input.identityAuthority) {
      if (input.identityAuthority.browserRevisionId !== input.baseRevisionId) {
        throw new Error(`Identity authority observed revision ${input.identityAuthority.browserRevisionId} instead of current revision ${input.baseRevisionId}.`);
      }
      const completionIds = new Set([
        ...input.identityAuthority.knownNodeIds,
        ...input.identityAuthority.knownRegionIds,
        ...input.identityAuthority.knownAuthoredRelationIds,
      ]);
      for (const nodeId of verifiedNodeIds) {
        if (!completionIds.has(nodeId)) throw new Error(`Completion cited unknown browser identity ${nodeId}.`);
      }
    }
    return {
      turn: input.turn,
      observedBaseRevisionId: input.baseRevisionId,
      understanding,
      objectivePlan,
      decision: "objective-complete",
      completionRationale,
      completionEvidence: { observedRevisionId, satisfiedSignals, verifiedNodeIds, measuredFacts, remainingIssues },
    };
  }
  if (raw.decision !== "execute-action") throw new Error("The model must execute one action or declare the objective complete.");
  const actionRaw = isRecord(raw.action) ? raw.action : {};
  const action = {
    actionId: typeof actionRaw.actionId === "string" ? actionRaw.actionId.trim() : "",
    intent: typeof actionRaw.intent === "string" ? actionRaw.intent.trim() : "",
    successSignal: typeof actionRaw.successSignal === "string" ? actionRaw.successSignal.trim() : "",
  };
  if (!action.actionId || !action.intent || !action.successSignal) throw new Error("The model did not define one complete singular action.");
  const executable = sanitizeNorthstarDesignResetModelResponse({
    raw,
    turn: input.turn,
    baseRevisionId: input.baseRevisionId,
    existingRelations: input.existingRelations,
    identityAuthority: input.identityAuthority,
  });
  assertNorthstarCoherentObservedAction(executable.mutation);
  return { ...executable, objectivePlan, decision: "execute-action", action };
}

function collectNorthstarAuthoredIds(html: string): Set<string> {
  const ids = new Set<string>();
  const pattern = /\bdata-ns-node-id\s*=\s*(["'])([^"'<>]+)\1/gi;
  for (const match of html.matchAll(pattern)) {
    const id = match[2]?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

function assertNorthstarCoherentObservedAction(mutation: NorthstarArtboardMutationBatch): void {
  const operations = mutation.operations;
  if (operations.length === 1) return;

  const insertions = operations.filter((operation) => operation.op === "insert-html");
  if (insertions.length !== 1) {
    throw new Error("A singular observed design turn must contain one coherent visual action. Multiple edits to existing or unrelated nodes require separate browser-observed actions.");
  }

  const rootInsertion = insertions[0];
  const authoredIds = collectNorthstarAuthoredIds(rootInsertion.html);
  if (authoredIds.size === 0) {
    throw new Error("An atomic composition must declare stable data-ns-node-id identities for every node refined in the same action.");
  }

  for (const operation of operations) {
    if (operation === rootInsertion) continue;
    if (operation.op === "request-space" || operation.op === "insert-html" || operation.op === "set-html" || operation.op === "recompose-region" || operation.op === "remove" || operation.op === "set-css-layer" || operation.op === "set-runtime-module") {
      throw new Error("This action contains a geometry-dependent or structurally separate step that requires a fresh browser observation before the next action.");
    }
    const targetId = "targetId" in operation && typeof operation.targetId === "string"
      ? operation.targetId.trim()
      : "";
    if (!targetId || !authoredIds.has(targetId)) {
      throw new Error("An atomic composition may only refine nodes authored inside its one new composition root; existing or unrelated nodes require separate browser-observed actions.");
    }
  }

  for (const relation of mutation.relations ?? []) {
    if (!authoredIds.has(relation.subjectId)) {
      throw new Error("An atomic composition may only establish relations whose subject is authored inside that same new composition.");
    }
  }
}

const POSITION_STYLE_CHANNELS = {
  x: new Set(["left", "right", "margin-left", "margin-right", "transform", "translate"]),
  y: new Set(["top", "bottom", "margin-top", "margin-bottom", "transform", "translate"]),
} as const;

export function normalizeNorthstarSpatialAuthority(input: {
  response: NorthstarDesignResetModelResponse;
  continuation?: boolean;
  existingRelations?: NorthstarAuthoredDesignRelation[];
}): { response: NorthstarDesignResetModelResponse; issues: string[]; normalizedFields: string[] } {
  const response = structuredClone(input.response);
  const requested = response.grounding.requestedRelation;
  const issues: string[] = [];
  const normalizedFields: string[] = [];
  const groundedIds = response.grounding.evidenceNodeIds.slice(0, 2);
  const canonicalRolesFor = (relation: NorthstarAuthoredDesignRelation): string[] | undefined => {
    if (relation.kind === "relative-placement" && relation.references.length === 1) {
      const referenceId = relation.references[0].nodeId;
      if (referenceId === response.grounding.resolvedNodeId || response.grounding.evidenceNodeIds.includes(referenceId)) return ["reference"];
    }
    if (groundedIds.length !== 2 || relation.references.length !== 2) return undefined;
    const receivedIds = relation.references.map((reference) => reference.nodeId);
    if (new Set(receivedIds).size !== 2 || groundedIds.some((nodeId) => !receivedIds.includes(nodeId))) return undefined;
    if (relation.kind === "between-placement") return receivedIds.map((nodeId) => nodeId === groundedIds[0] ? "before" : "after");
    if (relation.kind === "connector-attachment") return receivedIds.map((nodeId) => nodeId === groundedIds[0] ? "source" : "target");
    return undefined;
  };
  response.mutation.relations = (response.mutation.relations ?? []).map((relation) => {
    const roles = canonicalRolesFor(relation);
    if (!roles) return relation;
    const references = relation.references.map((reference, index) => {
      if (reference.role === roles[index]) return reference;
      normalizedFields.push(`relation.${relation.id}.references.${index}.role`);
      return { ...reference, role: roles[index] };
    });
    return { ...relation, references };
  });

  if (input.continuation && input.existingRelations?.length) {
    const proposed = [...(response.mutation.relations ?? [])];
    for (const contract of input.existingRelations) {
      let index = proposed.findIndex((relation) => relation.id === contract.id || relation.subjectId === contract.subjectId);
      if (index < 0 && input.existingRelations.length === 1 && proposed.length === 1) index = 0;
      if (index < 0) {
        proposed.push(structuredClone(contract));
        normalizedFields.push(`continuation.relation.${contract.id}.inherited`);
        continue;
      }
      const candidate = proposed[index];
      const preserved = {
        ...candidate,
        id: contract.id,
        subjectId: contract.subjectId,
        kind: contract.kind,
        references: structuredClone(contract.references),
        realizationPolicy: contract.realizationPolicy,
      };
      if (candidate.id !== contract.id) normalizedFields.push(`continuation.relation.${contract.id}.id`);
      if (candidate.subjectId !== contract.subjectId) normalizedFields.push(`continuation.relation.${contract.id}.subjectId`);
      if (candidate.kind !== contract.kind) normalizedFields.push(`continuation.relation.${contract.id}.kind`);
      if (JSON.stringify(candidate.references) !== JSON.stringify(contract.references)) normalizedFields.push(`continuation.relation.${contract.id}.references`);
      if (candidate.realizationPolicy !== contract.realizationPolicy) normalizedFields.push(`continuation.relation.${contract.id}.realizationPolicy`);
      proposed[index] = preserved;
    }
    response.mutation.relations = proposed;
  }

  const isSpatialKind = (kind: NorthstarAuthoredDesignRelation["kind"]): kind is "relative-placement" | "between-placement" =>
    kind === "relative-placement" || kind === "between-placement";
  const proposedSpatialRelations = (response.mutation.relations ?? []).filter((relation) => isSpatialKind(relation.kind));
  const continuationContracts = input.continuation
    ? (input.existingRelations ?? []).filter((relation) => isSpatialKind(relation.kind))
    : [];
  const kind = continuationContracts.length === 1
    ? continuationContracts[0].kind
    : proposedSpatialRelations.length === 1
      ? proposedSpatialRelations[0].kind
      : undefined;
  if (!kind) return { response, issues, normalizedFields: [...new Set(normalizedFields)] };
  let relations = (response.mutation.relations ?? []).filter((relation) => relation.kind === kind);
  if (input.continuation && continuationContracts.length === 1) {
    const contract = continuationContracts[0];
    if (kind === "relative-placement") {
      const reference = contract.references.find((candidate) => candidate.role === "reference");
      if (reference && response.grounding.resolvedNodeId !== reference.nodeId) {
        response.grounding.resolvedNodeId = reference.nodeId;
        normalizedFields.push("continuation.grounding.resolvedNodeId");
      }
    } else {
      const referenceIds = contract.references
        .filter((candidate) => candidate.role === "before" || candidate.role === "after")
        .sort((a, b) => a.role === "before" ? -1 : b.role === "before" ? 1 : 0)
        .map((candidate) => candidate.nodeId);
      if (referenceIds.length === 2 && JSON.stringify(response.grounding.evidenceNodeIds.slice(0, 2)) !== JSON.stringify(referenceIds)) {
        response.grounding.evidenceNodeIds = referenceIds;
        normalizedFields.push("continuation.grounding.evidenceNodeIds");
      }
    }
  }
  if (relations.length !== 1) {
    return { response, issues: [`Spatial authority requires exactly one ${kind} relation.`], normalizedFields };
  }
  const relation = relations[0];
  if (kind === "relative-placement") {
    const reference = relation.references.find((candidate) => candidate.role === "reference");
    const side = String(relation.parameters?.side ?? "");
    const explicitExpectedSide = requested === "below" ? "below" : requested === "right-of" ? "right" : undefined;
    const groundedReferenceIds = new Set(response.grounding.evidenceNodeIds);
    if (!reference) {
      issues.push("A relative-placement relation must declare one reference node.");
    } else if (explicitExpectedSide && reference.nodeId !== response.grounding.resolvedNodeId) {
      issues.push(`The spatial relation must reference exact grounded node ${response.grounding.resolvedNodeId}.`);
    } else if (!explicitExpectedSide && groundedReferenceIds.size > 0 && !groundedReferenceIds.has(reference.nodeId)) {
      issues.push("The relative-placement relation must reference one of the grounded evidence nodes.");
    }
    if (!["above", "below", "left", "right"].includes(side)) issues.push("A relative-placement relation must declare side as above, below, left, or right.");
    if (explicitExpectedSide && side !== explicitExpectedSide) issues.push(`The spatial relation side must be ${explicitExpectedSide}.`);
    if ((side === "above" || side === "below") && !["left", "center", "right"].includes(String(relation.parameters?.alignX ?? ""))) {
      issues.push("A vertical directional relation must declare alignX as left, center, or right.");
    }
    if ((side === "left" || side === "right") && !["top", "center", "bottom"].includes(String(relation.parameters?.alignY ?? ""))) {
      issues.push("A horizontal directional relation must declare alignY as top, center, or bottom.");
    }
  } else {
    const referenceIds = new Set(relation.references.filter((candidate) => candidate.role === "before" || candidate.role === "after").map((candidate) => candidate.nodeId));
    const expectedIds = response.grounding.evidenceNodeIds.slice(0, 2);
    if (expectedIds.length !== 2 || expectedIds.some((nodeId) => !referenceIds.has(nodeId))) {
      issues.push("The between-placement relation must use the two exact grounded evidence nodes.");
    }
    if (!String(relation.parameters?.crossAlign ?? relation.parameters?.alignY ?? relation.parameters?.alignX ?? "")) {
      issues.push("A between-placement relation must declare crossAlign.");
    }
  }
  if (input.continuation && input.existingRelations?.length) {
    const prior = input.existingRelations.find((candidate) => candidate.id === relation.id);
    if (!prior || prior.kind !== relation.kind || JSON.stringify(prior.references) !== JSON.stringify(relation.references)) {
      issues.push("A continuation must reuse the existing relation id, kind, and references.");
    }
  }
  const channels = northstarReactiveRelationChannels(relation).filter((channel): channel is "x" | "y" => channel === "x" || channel === "y");
  const controlledStyles = new Set(channels.flatMap((channel) => [...POSITION_STYLE_CHANNELS[channel]]));
  response.mutation.operations = response.mutation.operations.map((operation) => {
    if (input.continuation && operation.op === "request-space") {
      normalizedFields.push("continuation.request-space");
      return { ...operation, left: 0, top: 0, right: 0, bottom: 0 };
    }
    if (operation.op === "set-styles" && operation.targetId === relation.subjectId) {
      const styles = Object.fromEntries(Object.entries(operation.styles).filter(([name]) => !controlledStyles.has(name.toLowerCase())));
      for (const name of Object.keys(operation.styles)) if (!(name in styles)) normalizedFields.push(`set-styles.${relation.subjectId}.${name}`);
      return { ...operation, styles };
    }
    if (operation.op === "insert-html" || operation.op === "set-html" || operation.op === "recompose-region") {
      const escapedId = relation.subjectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tagPattern = new RegExp(`(<[^>]*data-ns-node-id=["']${escapedId}["'][^>]*style=["'])([^"']*)(["'][^>]*>)`, "i");
      const html = operation.html.replace(tagPattern, (_tag, before, style, after) => {
        const kept = String(style).split(";").filter((declaration) => {
          const name = declaration.split(":", 1)[0].trim().toLowerCase();
          if (!controlledStyles.has(name)) return true;
          normalizedFields.push(`inline-style.${relation.subjectId}.${name}`);
          return false;
        }).join(";");
        return before + kept + after;
      });
      return { ...operation, html };
    }
    return operation;
  });
  if (input.continuation) {
    const contract = continuationContracts.find((candidate) => candidate.id === relation.id);
    const relationParametersChanged = Boolean(contract)
      && JSON.stringify(contract?.parameters ?? {}) !== JSON.stringify(relation.parameters ?? {});
    const hasEffectiveOperation = response.mutation.operations.some((operation) => {
      if (operation.op === "set-styles") return Object.keys(operation.styles).length > 0;
      if (operation.op === "request-space") return Boolean(operation.left || operation.top || operation.right || operation.bottom);
      return true;
    });
    const strippedControlledCoordinate = normalizedFields.some((field) => field.startsWith(`set-styles.${relation.subjectId}.`) || field.startsWith(`inline-style.${relation.subjectId}.`));
    if (strippedControlledCoordinate && !hasEffectiveOperation && !relationParametersChanged) {
      issues.push("The continuation attempted only coordinates owned by the live relation. Change relation parameters or the writable surrounding composition instead.");
    }
  }
  return { response, issues: [...new Set(issues)], normalizedFields: [...new Set(normalizedFields)] };
}

export function northstarAuthoredRelationRealizationIssues(
  response: NorthstarDesignResetModelResponse,
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
): string[] {
  const authored = acknowledgement.authoredDesignRelations ?? [];
  const resolvedById = new Map(
    (acknowledgement.resolvedDesignRelations ?? []).map((relation) => [relation.relationId, relation]),
  );
  const issues: string[] = [];
  for (const declared of response.mutation.relations ?? []) {
    const browserAuthored = authored.find((relation) => relation.id === declared.id);
    if (!browserAuthored) {
      issues.push(`browser acknowledgement omitted authored relation ${declared.id}`);
      continue;
    }
    const realized = resolvedById.get(declared.id);
    if (!realized || realized.status !== "resolved") {
      issues.push(`browser acknowledgement did not resolve relation ${declared.id}${realized?.message ? `: ${realized.message}` : ""}`);
    }
  }
  for (const relation of authored.filter((candidate) => candidate.realizationPolicy === "live")) {
    const realized = resolvedById.get(relation.id);
    if (!realized || realized.status !== "resolved") {
      const issue = `cumulative live relation ${relation.id} is ${realized?.status ?? "missing"}${realized?.message ? `: ${realized.message}` : ""}`;
      if (!issues.includes(issue)) issues.push(issue);
    }
  }
  return issues;
}

export function createNorthstarDesignResetCandidate(input: {
  base: NorthstarGeneratedCodeArtifactPackage;
  response: NorthstarDesignResetModelResponse;
}): NorthstarGeneratedCodeArtifactPackage {
  return appendNorthstarArtboardMutation({
    previous: input.base,
    draft: input.response.mutation,
    label: input.response.understanding,
    phase: "refinement",
    intent: input.response.understanding,
    verified: false,
    diagnostics: [
      `${NORTHSTAR_PRODUCTION_DESIGN_LOOP_VERSION} turn ${input.response.turn}.`,
      `Exact accepted model mutation: ${JSON.stringify(input.response.mutation)}`,
    ],
    allowTextOnly: true,
    executionPolicy: "linear-design",
    sequenceOverride: input.response.turn,
  });
}

function sameDocument(
  base: NorthstarGeneratedCodeArtifactPackage,
  candidate: NorthstarGeneratedCodeArtifactPackage,
): boolean {
  return base.document.html === candidate.document.html
    && base.document.css === candidate.document.css
    && base.document.javascript === candidate.document.javascript
    && base.document.creativeJavascript === candidate.document.creativeJavascript
    && JSON.stringify(base.document.cssLayers ?? {}) === JSON.stringify(candidate.document.cssLayers ?? {});
}

export function validateNorthstarDesignResetCandidate(input: {
  base: NorthstarGeneratedCodeArtifactPackage;
  candidate: NorthstarGeneratedCodeArtifactPackage;
  turn: NorthstarDesignResetTurn;
}): { ok: boolean; issues: string[]; batch?: NorthstarArtboardMutationBatch } {
  // No candidate-policy validation is performed in the reset. The exact model
  // mutation is sent onward unchanged so diagnostics can reveal its real effect.
  const batch = input.candidate.mutationJournal?.at(-1);
  return { ok: true, issues: [], batch };
}

export function exactStringDiff(before: string, after: string): NorthstarExactStringDiff {
  if (before === after) {
    return { unchangedPrefixLength: before.length, unchangedSuffixLength: 0, removed: "", added: "" };
  }
  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shortest && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix
    && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) suffix += 1;
  return {
    unchangedPrefixLength: prefix,
    unchangedSuffixLength: suffix,
    removed: before.slice(prefix, before.length - suffix),
    added: after.slice(prefix, after.length - suffix),
  };
}

export function exactDocumentDiff(
  before: NorthstarLiveSurfaceSnapshot,
  after: NorthstarLiveSurfaceSnapshot,
): NorthstarExactDocumentDiff {
  const beforeLayers = before.cssLayers ?? {};
  const afterLayers = after.cssLayers ?? {};
  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: Record<string, { before: string; after: string; diff: NorthstarExactStringDiff }> = {};
  for (const key of Object.keys(afterLayers)) {
    if (!(key in beforeLayers)) added[key] = afterLayers[key];
    else if (beforeLayers[key] !== afterLayers[key]) {
      changed[key] = {
        before: beforeLayers[key],
        after: afterLayers[key],
        diff: exactStringDiff(beforeLayers[key], afterLayers[key]),
      };
    }
  }
  for (const key of Object.keys(beforeLayers)) {
    if (!(key in afterLayers)) removed[key] = beforeLayers[key];
  }
  return {
    html: exactStringDiff(before.html, after.html),
    css: exactStringDiff(before.css, after.css),
    javascript: exactStringDiff(before.javascript ?? "", after.javascript ?? ""),
    creativeJavascript: exactStringDiff(before.creativeJavascript ?? "", after.creativeJavascript ?? ""),
    cssLayers: { added, removed, changed },
  };
}

export function buildNorthstarDesignResetTurnArchive(input: {
  runId: string;
  artifactId: string;
  turn: NorthstarDesignResetTurn;
  requestedThinkingMode: "low" | "medium" | "high";
  instruction: string;
  status: NorthstarDesignResetTurnArchive["status"];
  beforePackage: NorthstarGeneratedCodeArtifactPackage;
  beforeAcknowledgement: NorthstarArtifactMutationAcknowledgement;
  systemInstruction: string;
  contents: unknown[];
  responseSchema: unknown;
  providerAttempt: NorthstarDesignResetProviderAttemptAudit;
  providerAttempts?: NorthstarDesignResetProviderAttemptAudit[];
  rawParsedResponse?: unknown;
  acceptedResponse?: NorthstarDesignResetModelResponse;
  candidateBeforeBrowser?: NorthstarGeneratedCodeArtifactPackage;
  mutationBatch?: NorthstarArtboardMutationBatch;
  afterPackage?: NorthstarGeneratedCodeArtifactPackage;
  afterAcknowledgement?: NorthstarArtifactMutationAcknowledgement;
  previousCumulativeIntentAudit?: NorthstarCumulativeIntentAudit;
  repairHistory?: unknown[];
  failure?: string;
}): NorthstarDesignResetTurnArchive {
  const beforeSnapshot = input.beforeAcknowledgement.snapshot;
  const beforeObservation = strongestSourceObservation({ artifact: input.beforePackage, acknowledgement: input.beforeAcknowledgement });
  const afterSnapshot = input.afterAcknowledgement?.snapshot;
  const beforeSemanticGraph = buildNorthstarArtboardSemanticGraph({ artifact: input.beforePackage, acknowledgement: input.beforeAcknowledgement });
  const afterSemanticGraph = input.afterPackage && input.afterAcknowledgement
    ? buildNorthstarArtboardSemanticGraph({ artifact: input.afterPackage, acknowledgement: input.afterAcknowledgement })
    : undefined;
  const rawMutation = isRecord(input.rawParsedResponse) ? input.rawParsedResponse.mutation : undefined;
  const normalizedMutation = input.acceptedResponse?.mutation;
  let cumulativeIntentAudit: NorthstarCumulativeIntentAudit | undefined;
  let cumulativeIntentAuditFailure: string | undefined;
  let renderedIntegrityAudit: NorthstarRenderedIntegrityAudit | undefined;
  let renderedIntegrityAuditFailure: string | undefined;
  if (input.mutationBatch && input.afterPackage && input.afterAcknowledgement && afterSemanticGraph) {
    try {
      cumulativeIntentAudit = buildNorthstarCumulativeIntentAudit({
        turn: input.turn,
        instruction: input.instruction,
        beforePackage: input.beforePackage,
        beforeAcknowledgement: input.beforeAcknowledgement,
        beforeGraph: beforeSemanticGraph,
        currentMutation: input.mutationBatch,
        afterPackage: input.afterPackage,
        afterAcknowledgement: input.afterAcknowledgement,
        afterGraph: afterSemanticGraph,
        previousAudit: input.previousCumulativeIntentAudit,
        acceptedGrounding: input.acceptedResponse?.grounding,
      });
    } catch (error) {
      cumulativeIntentAuditFailure = error instanceof Error ? error.message : String(error);
    }
    if (cumulativeIntentAudit) {
      try {
        renderedIntegrityAudit = buildNorthstarRenderedIntegrityAudit({
          turn: input.turn,
          package: input.afterPackage,
          acknowledgement: input.afterAcknowledgement,
          graph: afterSemanticGraph,
          cumulativeIntentAudit,
        });
      } catch (error) {
        renderedIntegrityAuditFailure = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return {
    schema: "northstar.design-reset-turn-archive.v5",
    resetVersion: NORTHSTAR_PRODUCTION_DESIGN_LOOP_VERSION,
    runId: input.runId,
    artifactId: input.artifactId,
    turn: input.turn,
    requestedThinkingMode: input.requestedThinkingMode,
    effectiveDesignMode: "ordered-objective-queue",
    instruction: input.instruction,
    status: input.status,
    recordedAt: new Date().toISOString(),
    sourceBefore: {
      revisionId: input.beforePackage.revisionId,
      package: input.beforePackage,
      snapshot: beforeSnapshot,
      observationSource: beforeObservation.source,
      acknowledgement: input.beforeAcknowledgement,
      sourceSha256: sourceHash(beforeObservation.snapshot),
      semanticGraph: beforeSemanticGraph,
    },
    modelBoundary: {
      systemInstruction: input.systemInstruction,
      contents: input.contents,
      responseSchema: input.responseSchema,
      providerAttempt: input.providerAttempt,
      providerAttempts: input.providerAttempts?.length ? input.providerAttempts : [input.providerAttempt],
      rawParsedResponse: input.rawParsedResponse,
      acceptedResponse: input.acceptedResponse,
      normalizationDiff: rawMutation === undefined || normalizedMutation === undefined
        ? undefined
        : exactStringDiff(JSON.stringify(rawMutation), JSON.stringify(normalizedMutation)),
    },
    modelAuthoredPatch: input.acceptedResponse?.mutation,
    appliedMutationBatch: input.mutationBatch,
    candidateBeforeBrowser: input.candidateBeforeBrowser,
    sourceAfter: input.afterPackage && input.afterAcknowledgement
      ? {
          revisionId: input.afterPackage.revisionId,
          package: input.afterPackage,
          snapshot: afterSnapshot,
          observationSource: afterSnapshot ? "browser-snapshot" : "canonical-package",
          acknowledgement: input.afterAcknowledgement,
          sourceSha256: sourceHash(strongestSourceObservation({ artifact: input.afterPackage, acknowledgement: input.afterAcknowledgement }).snapshot),
          semanticGraph: afterSemanticGraph!,
        }
      : undefined,
    semanticGraphDiff: afterSemanticGraph ? semanticGraphDiff(beforeSemanticGraph, afterSemanticGraph) : undefined,
    exactSourceDiff: beforeSnapshot && afterSnapshot ? exactDocumentDiff(beforeSnapshot, afterSnapshot) : undefined,
    cumulativeIntentAudit,
    cumulativeIntentAuditFailure,
    renderedIntegrityAudit,
    renderedIntegrityAuditFailure,
    repairHistory: input.repairHistory,
    failure: input.failure,
  };
}
