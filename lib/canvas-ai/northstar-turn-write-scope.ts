import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarCommittedSemanticNode,
} from "@/lib/canvas-artifacts/types";

const NODE_ID_ATTRIBUTE = /data-ns-node-id\s*=\s*["']([^"']+)["']/gi;

function introducedNodeIds(mutation: NorthstarArtboardMutationDraft): string[] {
  const ids: string[] = [];
  for (const operation of mutation.operations) {
    if (operation.op !== "insert-html" && operation.op !== "set-html" && operation.op !== "recompose-region") continue;
    NODE_ID_ATTRIBUTE.lastIndex = 0;
    for (let match = NODE_ID_ATTRIBUTE.exec(operation.html); match; match = NODE_ID_ATTRIBUTE.exec(operation.html)) {
      if (match[1] && !ids.includes(match[1])) ids.push(match[1]);
    }
  }
  return ids;
}

export type NorthstarTurnWriteScope = {
  baseRevisionId: string;
  writableExistingNodeIds: string[];
  introducedNodeIds: string[];
  insertionContainerNodeIds: string[];
  /** Existing relation references that anchor the current turn in a semantic flow. */
  relationReferenceNodeIds: string[];
  /** Protected flow siblings temporarily authorized for translation-only reflow. */
  supportingMovementNodeIds: string[];
  measuredContainerContracts: NorthstarMeasuredContainerContract[];
  protectedNodeIds: string[];
};

export type NorthstarMeasuredContainerContract = {
  nodeId: string;
  memberNodeIds: string[];
  observedWidth: number;
  observedHeight: number;
  requiredWidth?: number;
  requiredHeight?: number;
  overflowLeft: number;
  overflowTop: number;
  overflowRight: number;
  overflowBottom: number;
};

export type NorthstarMeasuredRepairScope = {
  scope: NorthstarTurnWriteScope;
  subjectNodeIds: string[];
  anchorNodeIds: string[];
  obstacleNodeIds: string[];
  supportingMovementNodeIds: string[];
  measuredContainerContracts: NorthstarMeasuredContainerContract[];
  reason: "no-current-turn-finding" | "no-measured-flow" | "measured-flow-suffix";
};

type RepairFindingLike = {
  subjectNodeId?: string;
  kind?: string;
  relatedNodeIds: string[];
  measurement?: Record<string, string | number | boolean>;
};

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function directlyMeasured(node: NorthstarCommittedSemanticNode | undefined): node is NorthstarCommittedSemanticNode & {
  bounds: NonNullable<NorthstarCommittedSemanticNode["bounds"]>;
} {
  return Boolean(node?.bounds && Number.isFinite(node.bounds.left) && Number.isFinite(node.bounds.top));
}

function dominantFlowAxis(nodes: Array<NorthstarCommittedSemanticNode & { bounds: NonNullable<NorthstarCommittedSemanticNode["bounds"]> }>): "x" | "y" {
  if (nodes.length < 2) return "x";
  const centersX = nodes.map((node) => node.bounds.left + node.bounds.width / 2);
  const centersY = nodes.map((node) => node.bounds.top + node.bounds.height / 2);
  return Math.max(...centersX) - Math.min(...centersX) >= Math.max(...centersY) - Math.min(...centersY) ? "x" : "y";
}

/** Freeze continuation authority from the first accepted action of a turn. */
export function createNorthstarTurnWriteScope(input: {
  mutation: NorthstarArtboardMutationDraft;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
}): NorthstarTurnWriteScope {
  const existingNodeIds = new Set(input.acknowledgement.snapshot?.semanticNodes?.map((node) => node.nodeId) ?? []);
  const writableExistingNodeIds = input.mutation.operations.flatMap((operation) => {
    if (operation.op === "insert-html" || !("targetId" in operation)) return [];
    return existingNodeIds.has(operation.targetId) ? [operation.targetId] : [];
  });
  const relationSubjects = (input.mutation.relations ?? [])
    .map((relation) => relation.subjectId)
    .filter((nodeId) => existingNodeIds.has(nodeId));
  const insertionContainerNodeIds = input.mutation.operations
    .filter((operation) => operation.op === "insert-html")
    .map((operation) => operation.targetId)
    .filter((nodeId, index, all) => all.indexOf(nodeId) === index);
  const writable = [...new Set([...writableExistingNodeIds, ...relationSubjects])];
  const currentTurnSubjects = new Set([...writable, ...introducedNodeIds(input.mutation)]);
  const relationReferenceNodeIds = unique((input.mutation.relations ?? []).flatMap((relation) =>
    currentTurnSubjects.has(relation.subjectId) ? relation.references.map((reference) => reference.nodeId) : [],
  )).filter((nodeId) => existingNodeIds.has(nodeId));
  return {
    baseRevisionId: input.acknowledgement.revisionId,
    writableExistingNodeIds: writable,
    introducedNodeIds: introducedNodeIds(input.mutation),
    insertionContainerNodeIds,
    relationReferenceNodeIds,
    supportingMovementNodeIds: [],
    measuredContainerContracts: [],
    protectedNodeIds: [...existingNodeIds].filter((nodeId) => !writable.includes(nodeId)),
  };
}

function finiteMeasurement(measurement: Record<string, string | number | boolean> | undefined, key: string): number | undefined {
  const value = measurement?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function measuredContainerContracts(input: {
  findings: RepairFindingLike[];
  currentTurnNodeIds: Set<string>;
}): NorthstarMeasuredContainerContract[] {
  const contracts = new Map<string, NorthstarMeasuredContainerContract>();
  for (const finding of input.findings) {
    if (finding.kind !== "group-congruence") continue;
    const containerId = finding.relatedNodeIds.find((nodeId) => input.currentTurnNodeIds.has(nodeId));
    if (!containerId) continue;
    const measurement = finding.measurement;
    const existing = contracts.get(containerId);
    const contract: NorthstarMeasuredContainerContract = {
      nodeId: containerId,
      memberNodeIds: unique([...(existing?.memberNodeIds ?? []), ...(finding.subjectNodeId ? [finding.subjectNodeId] : [])]),
      observedWidth: finiteMeasurement(measurement, "groupWidth") ?? existing?.observedWidth ?? 0,
      observedHeight: finiteMeasurement(measurement, "groupHeight") ?? existing?.observedHeight ?? 0,
      requiredWidth: finiteMeasurement(measurement, "requiredContainerWidth") ?? existing?.requiredWidth,
      requiredHeight: finiteMeasurement(measurement, "requiredContainerHeight") ?? existing?.requiredHeight,
      overflowLeft: Math.max(existing?.overflowLeft ?? 0, finiteMeasurement(measurement, "overflowLeft") ?? 0),
      overflowTop: Math.max(existing?.overflowTop ?? 0, finiteMeasurement(measurement, "overflowTop") ?? 0),
      overflowRight: Math.max(existing?.overflowRight ?? 0, finiteMeasurement(measurement, "overflowRight") ?? 0),
      overflowBottom: Math.max(existing?.overflowBottom ?? 0, finiteMeasurement(measurement, "overflowBottom") ?? 0),
    };
    contracts.set(containerId, contract);
  }
  return [...contracts.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/**
 * Convert browser-measured obstruction into the smallest safe reflow authority.
 *
 * A current-turn subject may need room beside an existing relation reference.
 * When a rendered finding proves that it does not fit, authorize only the
 * measured sibling suffix in that reference's semantic parent. The runtime
 * does not choose coordinates or a visual solution; it exposes the exact
 * supporting nodes that the designer may translate as one coherent flow.
 */
export function expandNorthstarMeasuredRepairScope(input: {
  scope: NorthstarTurnWriteScope;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  findings: RepairFindingLike[];
}): NorthstarMeasuredRepairScope {
  const nodes = input.acknowledgement.snapshot?.semanticNodes ?? [];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const currentTurnNodeIds = new Set([...input.scope.writableExistingNodeIds, ...input.scope.introducedNodeIds]);
  const currentFindings = input.findings.filter((finding) =>
    Boolean(finding.subjectNodeId && currentTurnNodeIds.has(finding.subjectNodeId))
    || finding.relatedNodeIds.some((nodeId) => currentTurnNodeIds.has(nodeId)),
  );
  const subjectNodeIds = unique(currentFindings.flatMap((finding) =>
    finding.subjectNodeId && currentTurnNodeIds.has(finding.subjectNodeId) ? [finding.subjectNodeId] : [],
  ));
  const obstacleNodeIds = unique(currentFindings.flatMap((finding) =>
    finding.relatedNodeIds.filter((nodeId) => !currentTurnNodeIds.has(nodeId)),
  ));
  const containerContracts = measuredContainerContracts({ findings: currentFindings, currentTurnNodeIds });
  if (currentFindings.length === 0) {
    return { scope: input.scope, subjectNodeIds, anchorNodeIds: [], obstacleNodeIds, supportingMovementNodeIds: [], measuredContainerContracts: [], reason: "no-current-turn-finding" };
  }

  const anchorNodeIds = input.scope.relationReferenceNodeIds.filter((nodeId) => directlyMeasured(byId.get(nodeId)));
  const support = new Set<string>();
  for (const finding of currentFindings) {
    if (finding.kind !== "group-congruence" || !finding.subjectNodeId || currentTurnNodeIds.has(finding.subjectNodeId)) continue;
    if (finding.relatedNodeIds.some((nodeId) => currentTurnNodeIds.has(nodeId)) && directlyMeasured(byId.get(finding.subjectNodeId))) {
      support.add(finding.subjectNodeId);
    }
  }
  for (const anchorId of anchorNodeIds) {
    const anchor = byId.get(anchorId);
    if (!directlyMeasured(anchor) || !anchor.parentId) continue;
    const siblings = nodes.filter((node) =>
      node.parentId === anchor.parentId
      && directlyMeasured(node)
      && !currentTurnNodeIds.has(node.nodeId),
    ) as Array<NorthstarCommittedSemanticNode & { bounds: NonNullable<NorthstarCommittedSemanticNode["bounds"]> }>;
    if (siblings.length < 2) continue;
    const axis = dominantFlowAxis(siblings);
    const coordinate = (node: typeof siblings[number]) => axis === "x" ? node.bounds.left : node.bounds.top;
    const ordered = [...siblings].sort((first, second) => coordinate(first) - coordinate(second));
    const anchorIndex = ordered.findIndex((node) => node.nodeId === anchorId);
    if (anchorIndex < 0) continue;
    const sameFlowObstacles = new Set(obstacleNodeIds.filter((nodeId) => byId.get(nodeId)?.parentId === anchor.parentId));
    const firstObstacleIndex = ordered.findIndex((node, index) => index > anchorIndex && sameFlowObstacles.has(node.nodeId));
    const suffixStart = firstObstacleIndex >= 0 ? firstObstacleIndex : anchorIndex + 1;
    for (const node of ordered.slice(suffixStart)) support.add(node.nodeId);
  }

  const supportingMovementNodeIds = [...support];
  if (supportingMovementNodeIds.length === 0) {
    const scope = containerContracts.length > 0
      ? { ...input.scope, measuredContainerContracts: containerContracts }
      : input.scope;
    return { scope, subjectNodeIds, anchorNodeIds, obstacleNodeIds, supportingMovementNodeIds, measuredContainerContracts: containerContracts, reason: "no-measured-flow" };
  }
  const expandedScope: NorthstarTurnWriteScope = {
    ...input.scope,
    supportingMovementNodeIds: unique([...input.scope.supportingMovementNodeIds, ...supportingMovementNodeIds]),
    measuredContainerContracts: containerContracts,
    protectedNodeIds: input.scope.protectedNodeIds.filter((nodeId) => !support.has(nodeId)),
  };
  return { scope: expandedScope, subjectNodeIds, anchorNodeIds, obstacleNodeIds, supportingMovementNodeIds, measuredContainerContracts: containerContracts, reason: "measured-flow-suffix" };
}

const MOVEMENT_ONLY_STYLE_PROPERTIES = new Set([
  "transform", "translate", "left", "top", "right", "bottom",
  "margin-left", "margin-top", "margin-right", "margin-bottom",
]);

const CONTAINER_GEOMETRY_STYLE_PROPERTIES = new Set(["width", "height", "min-width", "min-height"]);

function cssPixels(value: string | null): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : undefined;
}

export function validateNorthstarContinuationWriteScope(input: {
  scope: NorthstarTurnWriteScope;
  mutation: NorthstarArtboardMutationDraft;
}): { valid: boolean; violations: string[]; introducedNodeIds: string[] } {
  const candidateIntroducedNodeIds = introducedNodeIds(input.mutation);
  const writable = new Set([
    ...input.scope.writableExistingNodeIds,
    ...input.scope.introducedNodeIds,
    ...candidateIntroducedNodeIds,
  ]);
  const movementOnly = new Set(input.scope.supportingMovementNodeIds);
  const containerContracts = new Map(input.scope.measuredContainerContracts.map((contract) => [contract.nodeId, contract]));
  const touchedContainerIds = new Set<string>();
  const insertionContainers = new Set(input.scope.insertionContainerNodeIds);
  const violations: string[] = [];
  for (const operation of input.mutation.operations) {
    if (operation.op === "set-css-layer" || operation.op === "set-runtime-module") {
      violations.push(`${operation.op} is global and cannot be used by a scoped continuation.`);
      continue;
    }
    if (operation.op === "request-space") continue;
    if (!("targetId" in operation)) continue;
    if (operation.op === "insert-html") {
      if (!insertionContainers.has(operation.targetId) && !writable.has(operation.targetId)) {
        violations.push(`insert-html targets protected container ${operation.targetId}.`);
      }
      continue;
    }
    if (movementOnly.has(operation.targetId)) {
      if (operation.op !== "set-styles") {
        violations.push(`${operation.op} exceeds movement-only authority for supporting node ${operation.targetId}.`);
        continue;
      }
      const forbiddenProperties = Object.keys(operation.styles).filter((property) => !MOVEMENT_ONLY_STYLE_PROPERTIES.has(property.toLowerCase()));
      if (forbiddenProperties.length > 0) {
        violations.push(`set-styles exceeds movement-only authority for supporting node ${operation.targetId}: ${forbiddenProperties.join(", ")}.`);
      }
      continue;
    }
    const containerContract = containerContracts.get(operation.targetId);
    if (containerContract) {
      if (operation.op !== "set-styles") {
        violations.push(`${operation.op} exceeds measured container geometry authority for ${operation.targetId}.`);
        continue;
      }
      const properties = Object.keys(operation.styles).map((property) => property.toLowerCase());
      const forbiddenProperties = properties.filter((property) => !CONTAINER_GEOMETRY_STYLE_PROPERTIES.has(property));
      if (forbiddenProperties.length > 0) {
        violations.push(`set-styles exceeds measured container geometry authority for ${operation.targetId}: ${forbiddenProperties.join(", ")}.`);
      }
      for (const property of ["width", "height"] as const) {
        const required = property === "width" ? containerContract.requiredWidth : containerContract.requiredHeight;
        if (required === undefined || !Object.prototype.hasOwnProperty.call(operation.styles, property)) continue;
        const pixels = cssPixels(operation.styles[property]);
        const observed = property === "width" ? containerContract.observedWidth : containerContract.observedHeight;
        const maximum = Math.min(required + Math.max(32, required * 0.15), observed > 0 ? observed * 2 : required + 32);
        if (pixels === undefined) {
          violations.push(`${operation.targetId} ${property} must use an explicit measured px value.`);
        } else if (pixels + 1 < required || pixels > maximum) {
          violations.push(`${operation.targetId} ${property}=${String(operation.styles[property])} is outside the measured containment contract [${required}px, ${maximum}px].`);
        }
        touchedContainerIds.add(operation.targetId);
      }
      continue;
    }
    if (!writable.has(operation.targetId)) violations.push(`${operation.op} targets protected node ${operation.targetId}.`);
    if (operation.op === "move" && !insertionContainers.has(operation.parentId) && !writable.has(operation.parentId)) {
      violations.push(`move targets protected parent ${operation.parentId}.`);
    }
  }
  for (const relation of input.mutation.relations ?? []) {
    if (!writable.has(relation.subjectId)) violations.push(`relation ${relation.id} controls protected subject ${relation.subjectId}.`);
  }
  for (const contract of containerContracts.values()) {
    const requiresWidth = contract.overflowLeft > 1 || contract.overflowRight > 1;
    const requiresHeight = contract.overflowTop > 1 || contract.overflowBottom > 1;
    const movedMembers = contract.memberNodeIds.some((nodeId) => movementOnly.has(nodeId)
      && input.mutation.operations.some((operation) => operation.op === "set-styles" && operation.targetId === nodeId));
    if ((requiresWidth || requiresHeight) && !touchedContainerIds.has(contract.nodeId) && !movedMembers) {
      violations.push(`Measured container ${contract.nodeId} requires either its bounded geometry correction or translation of a measured detached member before the candidate can render.`);
    }
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)], introducedNodeIds: candidateIntroducedNodeIds };
}

export function extendNorthstarTurnWriteScope(
  scope: NorthstarTurnWriteScope,
  nodeIds: string[],
): NorthstarTurnWriteScope {
  const introduced = [...new Set([...scope.introducedNodeIds, ...nodeIds])];
  return {
    ...scope,
    introducedNodeIds: introduced,
    supportingMovementNodeIds: scope.supportingMovementNodeIds,
    measuredContainerContracts: scope.measuredContainerContracts,
    protectedNodeIds: scope.protectedNodeIds.filter((nodeId) => !introduced.includes(nodeId)),
  };
}
