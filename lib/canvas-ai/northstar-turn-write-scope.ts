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

export type NorthstarSpatialFeasibilityContext = {
  minimumClearance: number;
  subjects: NorthstarSpatialFeasibilityNode[];
  anchors: NorthstarSpatialFeasibilityNode[];
  obstacles: NorthstarSpatialFeasibilityNode[];
  containers: NorthstarSpatialFeasibilityNode[];
  availableClearanceBySubject: Array<{
    subjectNodeId: string;
    top: number;
    right: number;
    bottom: number;
    left: number;
    blockers: Partial<Record<"top" | "right" | "bottom" | "left", string>>;
  }>;
};

export type NorthstarSpatialFeasibilityNode = {
  nodeId: string;
  parentId?: string;
  bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  protected: boolean;
};

export type NorthstarPlacementSide = "top" | "right" | "bottom" | "left";

export type NorthstarObservedPlacementTerritory = {
  territoryId: string;
  kind: "semantic-region" | "artboard";
  bounds: NorthstarSpatialFeasibilityNode["bounds"];
};

export type NorthstarObservedPlacementSlot = {
  slotId: string;
  territoryId: string;
  territoryKind: NorthstarObservedPlacementTerritory["kind"];
  kind: "reference-gap" | "directional-corridor";
  bounds: NorthstarSpatialFeasibilityNode["bounds"];
  maximumOuterSize: { width: number; height: number };
  relativeToNodeIds: string[];
  compatibleSides: NorthstarPlacementSide[];
};

export type NorthstarObservedSpatialFacts = {
  source: "browser-measurement";
  minimumClearance: number;
  worldBounds?: NorthstarSpatialFeasibilityNode["bounds"];
  focusNodes: NorthstarSpatialFeasibilityNode[];
  focusEnvelope?: NorthstarSpatialFeasibilityNode["bounds"];
  nearbyObstacles: NorthstarSpatialFeasibilityNode[];
  availableClearance: NorthstarSpatialFeasibilityContext["availableClearanceBySubject"];
  measuredGaps: Array<{
    parentId: string;
    axis: "x" | "y";
    beforeNodeId: string;
    afterNodeId: string;
    span: number;
    crossAxisOverlap: number;
  }>;
  referencePairs: NorthstarObservedReferencePair[];
  placementFeasibility: {
    appliesTo: "new-or-transformed-outer-footprints";
    requiredForCurrentObjective: boolean;
    clearanceApplied: number;
    preferredSides: NorthstarPlacementSide[];
    candidateSlots: NorthstarObservedPlacementSlot[];
    conclusion: "not-required" | "measured-slots-available" | "no-measured-slot";
    requiredActionWhenNoFit: "none" | "create-space-or-expand-artboard";
  };
};

export type NorthstarObservedReferencePair = {
  purpose: string;
  firstNodeId: string;
  secondNodeId: string;
  sharedParentId?: string;
  axis: "x" | "y";
  firstBounds: NorthstarSpatialFeasibilityNode["bounds"];
  secondBounds: NorthstarSpatialFeasibilityNode["bounds"];
  centerDelta: { x: number; y: number };
  span: number;
  crossAxisOverlap: number;
  gapBounds?: NorthstarSpatialFeasibilityNode["bounds"];
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

function spatialNode(
  node: NorthstarCommittedSemanticNode,
  protectedNodeIds: Set<string>,
): NorthstarSpatialFeasibilityNode | undefined {
  if (!directlyMeasured(node)) return undefined;
  return { nodeId: node.nodeId, parentId: node.parentId, bounds: node.bounds, protected: protectedNodeIds.has(node.nodeId) };
}

function ancestorIds(nodeId: string, byId: Map<string, NorthstarCommittedSemanticNode>): Set<string> {
  const ancestors = new Set<string>();
  let parentId = byId.get(nodeId)?.parentId;
  while (parentId && !ancestors.has(parentId)) {
    ancestors.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return ancestors;
}

function independentlyPaintedObstacle(
  node: NorthstarCommittedSemanticNode,
  childCounts: Map<string, number>,
  structuralAncestorIds: Set<string>,
): boolean {
  if (structuralAncestorIds.has(node.nodeId)) return false;
  const attributeNames = new Set(Object.keys(node.normalizedAttributes));
  if (attributeNames.has("data-ns-authored-relationship")) return false;
  if ((childCounts.get(node.nodeId) ?? 0) === 0) return true;
  return attributeNames.has("data-ns-evidence-id") || attributeNames.has("data-ns-authored-annotation");
}

function addressablePaintBox(node: NorthstarCommittedSemanticNode): boolean {
  const attributeNames = new Set(Object.keys(node.normalizedAttributes));
  return !attributeNames.has("data-ns-authored-relationship")
    && (
      attributeNames.has("data-ns-node-id")
      || attributeNames.has("data-ns-evidence-id")
      || attributeNames.has("data-ns-authored-annotation")
    );
}

function axisClearance(input: {
  subject: NorthstarSpatialFeasibilityNode;
  container?: NorthstarSpatialFeasibilityNode;
  obstacles: NorthstarSpatialFeasibilityNode[];
}): NorthstarSpatialFeasibilityContext["availableClearanceBySubject"][number] {
  const { subject, container, obstacles } = input;
  const clearances = {
    top: container ? Math.max(0, subject.bounds.top - container.bounds.top) : Number.MAX_SAFE_INTEGER,
    right: container ? Math.max(0, container.bounds.right - subject.bounds.right) : Number.MAX_SAFE_INTEGER,
    bottom: container ? Math.max(0, container.bounds.bottom - subject.bounds.bottom) : Number.MAX_SAFE_INTEGER,
    left: container ? Math.max(0, subject.bounds.left - container.bounds.left) : Number.MAX_SAFE_INTEGER,
  };
  const blockers: Partial<Record<"top" | "right" | "bottom" | "left", string>> = {};
  for (const obstacle of obstacles) {
    const overlapX = Math.min(subject.bounds.right, obstacle.bounds.right) - Math.max(subject.bounds.left, obstacle.bounds.left);
    const overlapY = Math.min(subject.bounds.bottom, obstacle.bounds.bottom) - Math.max(subject.bounds.top, obstacle.bounds.top);
    const candidates: Array<["top" | "right" | "bottom" | "left", number]> = [];
    if (overlapX > 0 && obstacle.bounds.bottom <= subject.bounds.top) candidates.push(["top", subject.bounds.top - obstacle.bounds.bottom]);
    if (overlapX > 0 && obstacle.bounds.top >= subject.bounds.bottom) candidates.push(["bottom", obstacle.bounds.top - subject.bounds.bottom]);
    if (overlapY > 0 && obstacle.bounds.right <= subject.bounds.left) candidates.push(["left", subject.bounds.left - obstacle.bounds.right]);
    if (overlapY > 0 && obstacle.bounds.left >= subject.bounds.right) candidates.push(["right", obstacle.bounds.left - subject.bounds.right]);
    for (const [side, distance] of candidates) {
      if (distance < clearances[side]) {
        clearances[side] = distance;
        blockers[side] = obstacle.nodeId;
      }
    }
  }
  return { subjectNodeId: subject.nodeId, ...clearances, blockers };
}

function unionBounds(nodes: NorthstarSpatialFeasibilityNode[]): NorthstarSpatialFeasibilityNode["bounds"] | undefined {
  if (!nodes.length) return undefined;
  const left = Math.min(...nodes.map((node) => node.bounds.left));
  const top = Math.min(...nodes.map((node) => node.bounds.top));
  const right = Math.max(...nodes.map((node) => node.bounds.right));
  const bottom = Math.max(...nodes.map((node) => node.bounds.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function overlaps(first: NorthstarSpatialFeasibilityNode["bounds"], second: NorthstarSpatialFeasibilityNode["bounds"]): boolean {
  return Math.min(first.right, second.right) > Math.max(first.left, second.left)
    && Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top);
}

function positiveBounds(input: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): NorthstarSpatialFeasibilityNode["bounds"] | undefined {
  const width = input.right - input.left;
  const height = input.bottom - input.top;
  if (width <= 0 || height <= 0) return undefined;
  return { ...input, width, height };
}

function insetBounds(
  bounds: NorthstarSpatialFeasibilityNode["bounds"],
  amount: number,
): NorthstarSpatialFeasibilityNode["bounds"] | undefined {
  return positiveBounds({
    left: bounds.left + amount,
    top: bounds.top + amount,
    right: bounds.right - amount,
    bottom: bounds.bottom - amount,
  });
}

function outsetBounds(
  bounds: NorthstarSpatialFeasibilityNode["bounds"],
  amount: number,
): NorthstarSpatialFeasibilityNode["bounds"] {
  const left = bounds.left - amount;
  const top = bounds.top - amount;
  const right = bounds.right + amount;
  const bottom = bounds.bottom + amount;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function directionalCorridor(input: {
  territory: NorthstarObservedPlacementTerritory;
  side: NorthstarPlacementSide;
  focusEnvelope: NorthstarSpatialFeasibilityNode["bounds"];
  obstacles: NorthstarSpatialFeasibilityNode[];
  clearance: number;
}): NorthstarObservedPlacementSlot | undefined {
  const inner = insetBounds(input.territory.bounds, input.clearance);
  if (!inner) return undefined;
  const focus = input.focusEnvelope;
  const draft = input.side === "right"
    ? {
        left: Math.max(inner.left, focus.right + input.clearance),
        top: Math.max(inner.top, focus.top),
        right: inner.right,
        bottom: Math.min(inner.bottom, focus.bottom),
      }
    : input.side === "left"
      ? {
          left: inner.left,
          top: Math.max(inner.top, focus.top),
          right: Math.min(inner.right, focus.left - input.clearance),
          bottom: Math.min(inner.bottom, focus.bottom),
        }
      : input.side === "bottom"
        ? {
            left: Math.max(inner.left, focus.left),
            top: Math.max(inner.top, focus.bottom + input.clearance),
            right: Math.min(inner.right, focus.right),
            bottom: inner.bottom,
          }
        : {
            left: Math.max(inner.left, focus.left),
            top: inner.top,
            right: Math.min(inner.right, focus.right),
            bottom: Math.min(inner.bottom, focus.top - input.clearance),
          };
  let corridor = positiveBounds(draft);
  if (!corridor) return undefined;

  for (const obstacle of input.obstacles) {
    const obstacleWithClearance = outsetBounds(obstacle.bounds, input.clearance);
    const crossAxisOverlap = input.side === "left" || input.side === "right"
      ? Math.min(corridor.bottom, obstacleWithClearance.bottom) - Math.max(corridor.top, obstacleWithClearance.top)
      : Math.min(corridor.right, obstacleWithClearance.right) - Math.max(corridor.left, obstacleWithClearance.left);
    if (crossAxisOverlap <= 0) continue;
    if (input.side === "right") {
      if (obstacleWithClearance.right <= corridor.left || obstacleWithClearance.left >= corridor.right) continue;
      if (obstacleWithClearance.left <= corridor.left) return undefined;
      corridor = positiveBounds({ ...corridor, right: obstacleWithClearance.left });
    } else if (input.side === "left") {
      if (obstacleWithClearance.left >= corridor.right || obstacleWithClearance.right <= corridor.left) continue;
      if (obstacleWithClearance.right >= corridor.right) return undefined;
      corridor = positiveBounds({ ...corridor, left: obstacleWithClearance.right });
    } else if (input.side === "bottom") {
      if (obstacleWithClearance.bottom <= corridor.top || obstacleWithClearance.top >= corridor.bottom) continue;
      if (obstacleWithClearance.top <= corridor.top) return undefined;
      corridor = positiveBounds({ ...corridor, bottom: obstacleWithClearance.top });
    } else {
      if (obstacleWithClearance.top >= corridor.bottom || obstacleWithClearance.bottom <= corridor.top) continue;
      if (obstacleWithClearance.bottom >= corridor.bottom) return undefined;
      corridor = positiveBounds({ ...corridor, top: obstacleWithClearance.bottom });
    }
    if (!corridor) return undefined;
  }

  return {
    slotId: `corridor:${input.territory.territoryId}:${input.side}`,
    territoryId: input.territory.territoryId,
    territoryKind: input.territory.kind,
    kind: "directional-corridor",
    bounds: corridor,
    maximumOuterSize: { width: corridor.width, height: corridor.height },
    relativeToNodeIds: [],
    compatibleSides: [input.side],
  };
}

function placementSlots(input: {
  focusEnvelope?: NorthstarSpatialFeasibilityNode["bounds"];
  focusNodeIds: string[];
  obstacles: NorthstarSpatialFeasibilityNode[];
  referencePairs: NorthstarObservedReferencePair[];
  territories: NorthstarObservedPlacementTerritory[];
  preferredSides: NorthstarPlacementSide[];
  clearance: number;
}): NorthstarObservedPlacementSlot[] {
  const slots: NorthstarObservedPlacementSlot[] = [];
  for (const pair of input.referencePairs) {
    if (pair.purpose !== "measured-gap" || !pair.gapBounds) continue;
    const safeGap = insetBounds(pair.gapBounds, input.clearance);
    if (!safeGap) continue;
    if (input.obstacles.some((obstacle) => overlaps(safeGap, outsetBounds(obstacle.bounds, input.clearance)))) continue;
    const territory = input.territories.find((candidate) =>
      candidate.bounds.left <= safeGap.left
      && candidate.bounds.top <= safeGap.top
      && candidate.bounds.right >= safeGap.right
      && candidate.bounds.bottom >= safeGap.bottom
    );
    slots.push({
      slotId: `reference-gap:${pair.firstNodeId}:${pair.secondNodeId}`,
      territoryId: territory?.territoryId ?? "measured-reference-pair",
      territoryKind: territory?.kind ?? "semantic-region",
      kind: "reference-gap",
      bounds: safeGap,
      maximumOuterSize: { width: safeGap.width, height: safeGap.height },
      relativeToNodeIds: [pair.firstNodeId, pair.secondNodeId],
      compatibleSides: [],
    });
  }
  if (input.focusEnvelope) {
    const sides = input.preferredSides.length
      ? input.preferredSides
      : ["right", "bottom", "left", "top"] satisfies NorthstarPlacementSide[];
    for (const territory of input.territories) {
      for (const side of sides) {
        const slot = directionalCorridor({
          territory,
          side,
          focusEnvelope: input.focusEnvelope,
          obstacles: input.obstacles,
          clearance: input.clearance,
        });
        if (slot) slots.push({ ...slot, relativeToNodeIds: input.focusNodeIds });
      }
    }
  }
  const uniqueSlots = new Map<string, NorthstarObservedPlacementSlot>();
  for (const slot of slots) {
    const key = [slot.kind, slot.bounds.left, slot.bounds.top, slot.bounds.right, slot.bounds.bottom].join(":");
    if (!uniqueSlots.has(key)) uniqueSlots.set(key, slot);
  }
  const preferred = new Set(input.preferredSides);
  return [...uniqueSlots.values()]
    .sort((first, second) => {
      const firstGap = first.kind === "reference-gap" ? 1 : 0;
      const secondGap = second.kind === "reference-gap" ? 1 : 0;
      if (firstGap !== secondGap) return secondGap - firstGap;
      const firstSemantic = first.territoryKind === "semantic-region" ? 1 : 0;
      const secondSemantic = second.territoryKind === "semantic-region" ? 1 : 0;
      if (firstSemantic !== secondSemantic) return secondSemantic - firstSemantic;
      const firstPreferred = first.compatibleSides.some((side) => preferred.has(side)) ? 1 : 0;
      const secondPreferred = second.compatibleSides.some((side) => preferred.has(side)) ? 1 : 0;
      if (firstPreferred !== secondPreferred) return secondPreferred - firstPreferred;
      return (second.bounds.width * second.bounds.height) - (first.bounds.width * first.bounds.height);
    })
    .slice(0, 6);
}

function referencePairGeometry(input: {
  purpose: string;
  first: NorthstarSpatialFeasibilityNode;
  second: NorthstarSpatialFeasibilityNode;
}): NorthstarObservedReferencePair {
  const { first, second } = input;
  const firstCenter = {
    x: first.bounds.left + (first.bounds.width / 2),
    y: first.bounds.top + (first.bounds.height / 2),
  };
  const secondCenter = {
    x: second.bounds.left + (second.bounds.width / 2),
    y: second.bounds.top + (second.bounds.height / 2),
  };
  const centerDelta = {
    x: secondCenter.x - firstCenter.x,
    y: secondCenter.y - firstCenter.y,
  };
  const axis = Math.abs(centerDelta.x) >= Math.abs(centerDelta.y) ? "x" : "y";
  const firstBeforeSecond = axis === "x"
    ? firstCenter.x <= secondCenter.x
    : firstCenter.y <= secondCenter.y;
  const before = firstBeforeSecond ? first : second;
  const after = firstBeforeSecond ? second : first;
  const span = Math.max(0, axis === "x"
    ? after.bounds.left - before.bounds.right
    : after.bounds.top - before.bounds.bottom);
  const crossAxisOverlap = Math.max(0, axis === "x"
    ? Math.min(first.bounds.bottom, second.bounds.bottom) - Math.max(first.bounds.top, second.bounds.top)
    : Math.min(first.bounds.right, second.bounds.right) - Math.max(first.bounds.left, second.bounds.left));
  const gapBounds = span > 0 ? axis === "x"
    ? {
        left: before.bounds.right,
        top: Math.max(first.bounds.top, second.bounds.top),
        right: after.bounds.left,
        bottom: Math.min(first.bounds.bottom, second.bounds.bottom),
        width: span,
        height: crossAxisOverlap,
      }
    : {
        left: Math.max(first.bounds.left, second.bounds.left),
        top: before.bounds.bottom,
        right: Math.min(first.bounds.right, second.bounds.right),
        bottom: after.bounds.top,
        width: crossAxisOverlap,
        height: span,
      } : undefined;
  return {
    purpose: input.purpose,
    firstNodeId: first.nodeId,
    secondNodeId: second.nodeId,
    sharedParentId: first.parentId && first.parentId === second.parentId ? first.parentId : undefined,
    axis,
    firstBounds: first.bounds,
    secondBounds: second.bounds,
    centerDelta,
    span,
    crossAxisOverlap,
    gapBounds,
  };
}

/**
 * Pure browser facts for the next reasoning call. This is deliberately
 * independent of repair findings and write scope: the model sees measured fit
 * before it authors an operation, rather than discovering obstacles after it.
 */
export function buildNorthstarObservedSpatialFacts(input: {
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  focusNodeIds: string[];
  referencePairs?: Array<{
    purpose: string;
    firstNodeId: string;
    secondNodeId: string;
  }>;
  placementTerritories?: NorthstarObservedPlacementTerritory[];
  placementRequired?: boolean;
  preferredSides?: NorthstarPlacementSide[];
  minimumClearance?: number;
}): NorthstarObservedSpatialFacts {
  const nodes = input.acknowledgement.snapshot?.semanticNodes ?? [];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const focusIds = new Set(input.focusNodeIds);
  const protectedNodeIds = new Set(
    (input.acknowledgement.evidenceRegistry?.presentationManifest ?? [])
      .map((entry) => entry.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );
  const childCounts = new Map<string, number>();
  for (const node of nodes) if (node.parentId) childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1);
  const focusNodes = [...focusIds]
    .map((nodeId) => byId.get(nodeId))
    .filter(directlyMeasured)
    .map((node) => spatialNode(node, protectedNodeIds))
    .filter(Boolean) as NorthstarSpatialFeasibilityNode[];
  const focusEnvelope = unionBounds(focusNodes);
  const focusAncestorIds = new Set([...focusIds].flatMap((nodeId) => [...ancestorIds(nodeId, byId)]));
  const obstacleCandidates = nodes
    .filter(directlyMeasured)
    .filter((node) => !focusIds.has(node.nodeId) && !focusAncestorIds.has(node.nodeId))
    .filter((node) => ![...ancestorIds(node.nodeId, byId)].some((ancestorId) => focusIds.has(ancestorId)))
    .filter((node) => !Object.prototype.hasOwnProperty.call(node.normalizedAttributes, "data-ns-authored-relationship"));
  const addressableObstacleIds = new Set(
    obstacleCandidates.filter(addressablePaintBox).map((node) => node.nodeId),
  );
  const allObstacles = obstacleCandidates
    .filter((node) => ![...ancestorIds(node.nodeId, byId)].some((ancestorId) => addressableObstacleIds.has(ancestorId)))
    .filter((node) => addressablePaintBox(node) || (childCounts.get(node.nodeId) ?? 0) === 0)
    .map((node) => spatialNode(node, protectedNodeIds))
    .filter(Boolean) as NorthstarSpatialFeasibilityNode[];
  const worldBounds = input.acknowledgement.size ? {
    left: 0,
    top: 0,
    right: input.acknowledgement.size.intrinsicWidth,
    bottom: input.acknowledgement.size.intrinsicHeight,
    width: input.acknowledgement.size.intrinsicWidth,
    height: input.acknowledgement.size.intrinsicHeight,
  } : undefined;
  const worldContainer = worldBounds ? {
    nodeId: "artboard",
    bounds: worldBounds,
    protected: false,
  } satisfies NorthstarSpatialFeasibilityNode : undefined;
  const measuredSubjects = [
    ...focusNodes,
    ...(focusEnvelope ? [{ nodeId: "focus-envelope", bounds: focusEnvelope, protected: true }] : []),
  ];
  const availableClearance = measuredSubjects.map((subject) => axisClearance({
    subject,
    container: worldContainer,
    obstacles: allObstacles,
  }));
  const blockerIds = new Set(availableClearance.flatMap((entry) => Object.values(entry.blockers).filter(Boolean) as string[]));
  const nearbyObstacles = allObstacles.filter((obstacle) =>
    blockerIds.has(obstacle.nodeId) || (focusEnvelope ? overlaps(focusEnvelope, obstacle.bounds) : false)
  );
  const siblingGroups = new Map<string, NorthstarSpatialFeasibilityNode[]>();
  for (const focus of focusNodes) {
    if (!focus.parentId) continue;
    const group = siblingGroups.get(focus.parentId) ?? [];
    group.push(focus);
    siblingGroups.set(focus.parentId, group);
  }
  const measuredGaps = [...siblingGroups.entries()].flatMap(([parentId, group]) => {
    if (group.length < 2) return [];
    const measured = group.map((item) => byId.get(item.nodeId)).filter(directlyMeasured);
    const axis = dominantFlowAxis(measured);
    const ordered = [...group].sort((first, second) => axis === "x"
      ? first.bounds.left - second.bounds.left
      : first.bounds.top - second.bounds.top);
    return ordered.slice(0, -1).map((before, index) => {
      const after = ordered[index + 1]!;
      return {
        parentId,
        axis,
        beforeNodeId: before.nodeId,
        afterNodeId: after.nodeId,
        span: Math.max(0, axis === "x" ? after.bounds.left - before.bounds.right : after.bounds.top - before.bounds.bottom),
        crossAxisOverlap: Math.max(0, axis === "x"
          ? Math.min(before.bounds.bottom, after.bounds.bottom) - Math.max(before.bounds.top, after.bounds.top)
          : Math.min(before.bounds.right, after.bounds.right) - Math.max(before.bounds.left, after.bounds.left)),
      };
    });
  });
  const referencePairs = (input.referencePairs ?? []).flatMap((pair) => {
    const firstNode = byId.get(pair.firstNodeId);
    const secondNode = byId.get(pair.secondNodeId);
    if (!directlyMeasured(firstNode) || !directlyMeasured(secondNode)) return [];
    const first = spatialNode(firstNode, protectedNodeIds);
    const second = spatialNode(secondNode, protectedNodeIds);
    return first && second ? [referencePairGeometry({ purpose: pair.purpose, first, second })] : [];
  });
  const minimumClearance = input.minimumClearance ?? 12;
  const preferredSides = [...new Set(input.preferredSides ?? [])];
  const placementRequired = input.placementRequired ?? Boolean(input.placementTerritories?.length);
  const candidateSlots = placementRequired
    ? placementSlots({
        focusEnvelope,
        focusNodeIds: focusNodes.map((node) => node.nodeId),
        obstacles: allObstacles,
        referencePairs,
        territories: input.placementTerritories ?? [],
        preferredSides,
        clearance: minimumClearance,
      })
    : [];
  return {
    source: "browser-measurement",
    minimumClearance,
    worldBounds,
    focusNodes,
    focusEnvelope,
    nearbyObstacles,
    availableClearance,
    measuredGaps,
    referencePairs,
    placementFeasibility: {
      appliesTo: "new-or-transformed-outer-footprints",
      requiredForCurrentObjective: placementRequired,
      clearanceApplied: minimumClearance,
      preferredSides,
      candidateSlots,
      conclusion: !placementRequired
        ? "not-required"
        : candidateSlots.length
          ? "measured-slots-available"
          : "no-measured-slot",
      requiredActionWhenNoFit: placementRequired ? "create-space-or-expand-artboard" : "none",
    },
  };
}

/** Browser facts only. The model remains responsible for choosing a composition. */
export function buildNorthstarSpatialFeasibilityContext(input: {
  scope: NorthstarTurnWriteScope;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  findings: RepairFindingLike[];
  minimumClearance?: number;
}): NorthstarSpatialFeasibilityContext {
  const nodes = input.acknowledgement.snapshot?.semanticNodes ?? [];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const protectedNodeIds = new Set(input.scope.protectedNodeIds);
  const childCounts = new Map<string, number>();
  for (const node of nodes) if (node.parentId) childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1);
  const subjectIds = unique(input.findings.flatMap((finding) => finding.subjectNodeId ? [finding.subjectNodeId] : []));
  const anchorIds = unique(input.scope.relationReferenceNodeIds);
  const explicitlyRelatedIds = new Set(input.findings.flatMap((finding) => finding.relatedNodeIds));
  const focusIds = unique([...subjectIds, ...anchorIds, ...explicitlyRelatedIds]);
  const structuralAncestorIds = new Set(focusIds.flatMap((nodeId) => [...ancestorIds(nodeId, byId)]));
  const focusNodes = focusIds.map((nodeId) => byId.get(nodeId)).filter(directlyMeasured);
  const nearbyProtected = nodes.filter((node) => {
    if (!protectedNodeIds.has(node.nodeId) || !directlyMeasured(node)) return false;
    if (subjectIds.includes(node.nodeId)) return false;
    if (!independentlyPaintedObstacle(node, childCounts, structuralAncestorIds)) return false;
    if (explicitlyRelatedIds.has(node.nodeId)) return true;
    if (anchorIds.includes(node.nodeId)) return false;
    return focusNodes.some((focus) => {
      const horizontal = Math.max(0, Math.max(focus.bounds.left, node.bounds.left) - Math.min(focus.bounds.right, node.bounds.right));
      const vertical = Math.max(0, Math.max(focus.bounds.top, node.bounds.top) - Math.min(focus.bounds.bottom, node.bounds.bottom));
      return Math.hypot(horizontal, vertical) <= 256;
    });
  });
  const subjects = subjectIds.map((nodeId) => byId.get(nodeId)).filter(Boolean).map((node) => spatialNode(node!, protectedNodeIds)).filter(Boolean) as NorthstarSpatialFeasibilityNode[];
  const anchors = anchorIds.map((nodeId) => byId.get(nodeId)).filter(Boolean).map((node) => spatialNode(node!, protectedNodeIds)).filter(Boolean) as NorthstarSpatialFeasibilityNode[];
  const obstacles = nearbyProtected.map((node) => spatialNode(node, protectedNodeIds)).filter(Boolean) as NorthstarSpatialFeasibilityNode[];
  const containerIds = unique(subjects.flatMap((subject) => subject.parentId ? [subject.parentId] : []));
  const containers = containerIds.map((nodeId) => byId.get(nodeId)).filter(Boolean).map((node) => spatialNode(node!, protectedNodeIds)).filter(Boolean) as NorthstarSpatialFeasibilityNode[];
  return {
    minimumClearance: input.minimumClearance ?? 12,
    subjects,
    anchors,
    obstacles,
    containers,
    availableClearanceBySubject: subjects.map((subject) => axisClearance({
      subject,
      container: containers.find((container) => container.nodeId === subject.parentId),
      obstacles,
    })),
  };
}

function signedCssPixels(value: string | null | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : undefined;
}

function intersectionArea(
  first: NorthstarSpatialFeasibilityNode["bounds"],
  second: NorthstarSpatialFeasibilityNode["bounds"],
): number {
  return Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
    * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
}

function finiteParameter(value: string | number | boolean | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function proposedRelationBounds(input: {
  relation: NonNullable<NorthstarArtboardMutationDraft["relations"]>[number];
  subject: NorthstarSpatialFeasibilityNode;
  nodes: Map<string, NorthstarSpatialFeasibilityNode>;
}): { bounds?: NorthstarSpatialFeasibilityNode["bounds"]; violations: string[] } {
  const { relation, subject, nodes } = input;
  const parameters = relation.parameters ?? {};
  const referenceForRole = (role: string) => {
    const reference = relation.references.find((candidate) => candidate.role === role);
    return reference ? nodes.get(reference.nodeId) : undefined;
  };
  const sizedBounds = (left: number, top: number) => ({
    left,
    top,
    width: subject.bounds.width,
    height: subject.bounds.height,
    right: left + subject.bounds.width,
    bottom: top + subject.bounds.height,
  });

  if (relation.kind === "relative-placement") {
    const reference = referenceForRole("reference")
      ?? relation.references.map((candidate) => nodes.get(candidate.nodeId)).find(Boolean);
    if (!reference) return { violations: [] };
    const side = String(parameters.side ?? "right");
    const offsetX = finiteParameter(parameters.offsetX);
    const offsetY = finiteParameter(parameters.offsetY);
    let left = subject.bounds.left;
    let top = subject.bounds.top;
    if (side === "right" || side === "left") {
      left = side === "right" ? reference.bounds.right + offsetX : reference.bounds.left - subject.bounds.width - offsetX;
      const alignY = String(parameters.alignY ?? "preserve");
      if (alignY === "top") top = reference.bounds.top + offsetY;
      else if (alignY === "bottom") top = reference.bounds.bottom - subject.bounds.height + offsetY;
      else if (alignY === "center") top = reference.bounds.top + reference.bounds.height / 2 - subject.bounds.height / 2 + offsetY;
    } else if (side === "below" || side === "above") {
      top = side === "below" ? reference.bounds.bottom + offsetY : reference.bounds.top - subject.bounds.height - offsetY;
      const alignX = String(parameters.alignX ?? "preserve");
      if (alignX === "left") left = reference.bounds.left + offsetX;
      else if (alignX === "right") left = reference.bounds.right - subject.bounds.width + offsetX;
      else if (alignX === "center") left = reference.bounds.left + reference.bounds.width / 2 - subject.bounds.width / 2 + offsetX;
    } else {
      return { violations: [`Relation ${relation.id} has unsupported relative-placement side ${side}.`] };
    }
    return { bounds: sizedBounds(left, top), violations: [] };
  }

  if (relation.kind === "between-placement") {
    const before = referenceForRole("before");
    const after = referenceForRole("after");
    if (!before || !after) return { violations: [] };
    const axis = String(parameters.axis ?? "x") === "y" ? "y" : "x";
    const availableSpan = axis === "x"
      ? Math.max(0, after.bounds.left - before.bounds.right)
      : Math.max(0, after.bounds.top - before.bounds.bottom);
    const requiredSpan = axis === "x" ? subject.bounds.width : subject.bounds.height;
    const violations = availableSpan + 0.75 < requiredSpan
      ? [`Relation ${relation.id} cannot fit ${relation.subjectId} in its declared ${axis}-axis gap: ${Math.round(availableSpan * 100) / 100}px available, ${Math.round(requiredSpan * 100) / 100}px required.`]
      : [];
    let left = subject.bounds.left;
    let top = subject.bounds.top;
    const crossAlign = String(parameters.crossAlign ?? (axis === "x" ? parameters.alignY : parameters.alignX) ?? "preserve");
    if (axis === "x") {
      left = (before.bounds.right + after.bounds.left - subject.bounds.width) / 2;
      const center = (before.bounds.top + before.bounds.height / 2 + after.bounds.top + after.bounds.height / 2) / 2;
      if (crossAlign === "start" || crossAlign === "top") top = Math.min(before.bounds.top, after.bounds.top);
      else if (crossAlign === "end" || crossAlign === "bottom") top = Math.max(before.bounds.bottom, after.bounds.bottom) - subject.bounds.height;
      else if (crossAlign === "center") top = center - subject.bounds.height / 2;
    } else {
      top = (before.bounds.bottom + after.bounds.top - subject.bounds.height) / 2;
      const center = (before.bounds.left + before.bounds.width / 2 + after.bounds.left + after.bounds.width / 2) / 2;
      if (crossAlign === "start" || crossAlign === "left") left = Math.min(before.bounds.left, after.bounds.left);
      else if (crossAlign === "end" || crossAlign === "right") left = Math.max(before.bounds.right, after.bounds.right) - subject.bounds.width;
      else if (crossAlign === "center") left = center - subject.bounds.width / 2;
    }
    return { bounds: sizedBounds(left, top), violations };
  }

  return { violations: [] };
}

/** Reject only collisions exactly predictable from explicit px geometry. */
export function preflightNorthstarPredictableSpatialFeasibility(input: {
  mutation: NorthstarArtboardMutationDraft;
  context: NorthstarSpatialFeasibilityContext;
}): { feasible: boolean; violations: string[] } {
  const byId = new Map([...input.context.subjects, ...input.context.anchors, ...input.context.obstacles, ...input.context.containers].map((node) => [node.nodeId, node]));
  const violations: string[] = [];
  const proposedBySubject = new Map<string, NorthstarSpatialFeasibilityNode["bounds"]>();
  for (const operation of input.mutation.operations) {
    if (operation.op !== "set-styles") continue;
    const current = byId.get(operation.targetId);
    if (!current || !input.context.subjects.some((subject) => subject.nodeId === operation.targetId)) continue;
    const parent = current.parentId ? byId.get(current.parentId) : undefined;
    const leftValue = signedCssPixels(operation.styles.left);
    const topValue = signedCssPixels(operation.styles.top);
    const rightValue = signedCssPixels(operation.styles.right);
    const bottomValue = signedCssPixels(operation.styles.bottom);
    const width = signedCssPixels(operation.styles.width) ?? current.bounds.width;
    const height = signedCssPixels(operation.styles.height) ?? current.bounds.height;
    const left = leftValue !== undefined
      ? (parent?.bounds.left ?? 0) + leftValue
      : rightValue !== undefined && parent
        ? parent.bounds.right - rightValue - width
        : current.bounds.left;
    const top = topValue !== undefined
      ? (parent?.bounds.top ?? 0) + topValue
      : bottomValue !== undefined && parent
        ? parent.bounds.bottom - bottomValue - height
        : current.bounds.top;
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    const proposed = { left, top, width, height, right: left + width, bottom: top + height };
    proposedBySubject.set(operation.targetId, proposed);
  }
  for (const relation of input.mutation.relations ?? []) {
    const subject = byId.get(relation.subjectId);
    if (!subject || !input.context.subjects.some((candidate) => candidate.nodeId === relation.subjectId)) continue;
    const predicted = proposedRelationBounds({ relation, subject, nodes: byId });
    violations.push(...predicted.violations);
    if (predicted.bounds) proposedBySubject.set(relation.subjectId, predicted.bounds);
  }
  for (const [subjectNodeId, proposed] of proposedBySubject) {
    const current = byId.get(subjectNodeId);
    if (!current) continue;
    for (const obstacle of input.context.obstacles) {
      if (obstacle.nodeId === subjectNodeId) continue;
      const before = intersectionArea(current.bounds, obstacle.bounds);
      const after = intersectionArea(proposed, obstacle.bounds);
      if (after > 1 && (before <= 1 || after >= before - 1)) {
        violations.push(`${subjectNodeId} would intersect protected obstacle ${obstacle.nodeId} by ${Math.round(after * 100) / 100}px² (before ${Math.round(before * 100) / 100}px²).`);
      }
    }
    const container = current.parentId ? byId.get(current.parentId) : undefined;
    if (container) {
      const requestedSpace = input.mutation.operations.reduce((total, operation) => operation.op === "request-space"
        ? {
          left: total.left + (operation.left ?? 0),
          top: total.top + (operation.top ?? 0),
          right: total.right + (operation.right ?? 0),
          bottom: total.bottom + (operation.bottom ?? 0),
        }
        : total, { left: 0, top: 0, right: 0, bottom: 0 });
      const usable = {
        left: container.bounds.left - requestedSpace.left,
        top: container.bounds.top - requestedSpace.top,
        right: container.bounds.right + requestedSpace.right,
        bottom: container.bounds.bottom + requestedSpace.bottom,
      };
      if (proposed.left < usable.left - 1 || proposed.top < usable.top - 1 || proposed.right > usable.right + 1 || proposed.bottom > usable.bottom + 1) {
        violations.push(`${subjectNodeId} would fall outside container ${container.nodeId} after declared request-space.`);
      }
    }
  }
  return { feasible: violations.length === 0, violations: unique(violations) };
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
