import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardMutationBatch,
  NorthstarAuthoredDesignRelation,
  NorthstarCommittedSemanticNode,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

type NorthstarAuditRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type NorthstarCumulativeIntentGraphView = {
  revisionId: string;
  regions: Array<{
    regionId: string;
    rootNodeId: string;
    memberNodeIds: string[];
    bounds?: NorthstarAuditRect;
  }>;
  evidenceItems: Array<{
    nodeId: string;
    evidenceId?: string;
    flowId: string;
    index: number;
    bounds?: NorthstarAuditRect;
  }>;
  nodes: Array<{
    nodeId: string;
    parentId?: string;
    evidenceId?: string;
    bounds?: NorthstarAuditRect;
  }>;
};

export type NorthstarCumulativeIntentCommitmentKind =
  | "authored-object"
  | "visual-relationship"
  | "evidence-presentation"
  | "region-presentation"
  | "reused-evidence-presentation";

export type NorthstarCumulativeIntentGroundingSource =
  | "explicit-authored-relation"
  | "authored-node-attributes"
  | "accepted-model-grounding"
  | "none";

export type NorthstarCumulativeIntentGrounding = {
  conceptId?: string;
  resolvedNodeId?: string;
  evidenceNodeIds: string[];
  requestedRelation?: string;
  expectedPreservedNodeIds: string[];
  source: NorthstarCumulativeIntentGroundingSource;
};

export type NorthstarCumulativeIntentProvenanceResolution = {
  status: "explicit" | "exact-canonical-asset-match" | "ambiguous" | "missing";
  sourceEvidenceId?: string;
  sourcePresentationNodeId?: string;
  matchedAssetUrl?: string;
  candidateCount: number;
};

export type NorthstarCumulativeIntentResolutionWarning = {
  code:
    | "grounding-target-unresolved"
    | "grounding-conflicts-with-explicit-target"
    | "reuse-provenance-missing"
    | "reuse-provenance-ambiguous"
    | "canonical-asset-not-found";
  nodeId?: string;
  detail: string;
  candidateNodeIds?: string[];
  candidateEvidenceIds?: string[];
};

export type NorthstarCollateralGeometryFinding = {
  nodeId: string;
  originTurn: number;
  changeKind: "position-only" | "size-or-shape";
  explicitlyOwnedInCurrentMutation?: boolean;
  baselineBounds: NorthstarAuditRect;
  renderedBounds: NorthstarAuditRect;
  delta: {
    left: number;
    top: number;
    width: number;
    height: number;
    centerDistance: number;
  };
};

export type NorthstarCumulativeIntentCommitment = {
  commitmentId: string;
  nodeId: string;
  kind: NorthstarCumulativeIntentCommitmentKind;
  parentNodeId?: string;
  originatingTurn?: number;
  originMutationId?: string;
  originIntent?: string;
  latestTurn?: number;
  latestMutationId?: string;
  latestIntent?: string;
  semanticTargetNodeIds: string[];
  semanticRegionIds: string[];
  relationIds: string[];
  sourceEvidenceIds: string[];
  provenanceNodeIds: string[];
  grounding?: NorthstarCumulativeIntentGrounding;
  provenanceResolution?: NorthstarCumulativeIntentProvenanceResolution;
  boundsBefore?: NorthstarAuditRect;
  boundsAfter?: NorthstarAuditRect;
};

export type NorthstarCumulativeIntentDependencyPath = {
  fromNodeId?: string;
  toNodeId: string;
  reason:
    | "current-mutation-target"
    | "current-mutation-introduction"
    | "current-relation-subject"
    | "current-relation-reference"
    | "direct-container-member"
    | "authored-target"
    | "target-inside-direct-container"
    | "changed-collective-anchor"
    | "grounding-target-geometry-changed"
    | "authored-parent"
    | "provenance-source"
    | "canonical-provenance-source-changed"
    | "spatial-intersection";
};

export type NorthstarCumulativeIntentAudit = {
  schema: "northstar.cumulative-intent-audit.v1";
  mode: "audit-only";
  turn: number;
  instruction: string;
  beforeRevisionId: string;
  afterRevisionId: string;
  mutationId: string;
  activeCommitmentLedger: NorthstarCumulativeIntentCommitment[];
  retiredCommitmentIds: string[];
  resolutionWarnings: NorthstarCumulativeIntentResolutionWarning[];
  directEditScope: {
    directNodeIds: string[];
    introducedNodeIds: string[];
    removedNodeIds: string[];
    containerContextNodeIds: string[];
    relationSubjectNodeIds: string[];
    relationReferenceNodeIds: string[];
    structuralMemberNodeIds: string[];
    artboardExpansionRequested: boolean;
    globalPresentationMutation: boolean;
  };
  affectedComposition: {
    directCommitmentIds: string[];
    continuityDependentCommitmentIds: string[];
    spatiallyExposedCommitmentIds: string[];
    unrelatedCommitmentIds: string[];
    continuityAnchorNodeIds: string[];
    geometryChangedNodeIds: string[];
    /** Pre-existing rendered geometry changed without being owned by this turn. */
    collateralGeometryFindings?: NorthstarCollateralGeometryFinding[];
    dependencyPaths: NorthstarCumulativeIntentDependencyPath[];
    spatialExposurePairs: Array<{
      changedNodeId: string;
      exposedCommitmentId: string;
      exposedNodeId: string;
      intersectionArea: number;
    }>;
  };
  classification: {
    activeCommitmentCount: number;
    directCommitmentCount: number;
    continuityDependentCommitmentCount: number;
    spatiallyExposedCommitmentCount: number;
    unrelatedCommitmentCount: number;
    structuralMemberCount: number;
    everyActiveCommitmentClassifiedExactlyOnce: boolean;
    warnings: string[];
  };
  executionInfluence: {
    modelInput: "none";
    modelResponse: "none";
    mutation: "none";
    browserRuntime: "none";
    commitDecision: "none";
  };
};

export type BuildNorthstarCumulativeIntentAuditInput = {
  turn: number;
  instruction: string;
  beforePackage: NorthstarGeneratedCodeArtifactPackage;
  beforeAcknowledgement: NorthstarArtifactMutationAcknowledgement;
  beforeGraph: NorthstarCumulativeIntentGraphView;
  currentMutation: NorthstarArtboardMutationBatch;
  afterPackage: NorthstarGeneratedCodeArtifactPackage;
  afterAcknowledgement: NorthstarArtifactMutationAcknowledgement;
  afterGraph: NorthstarCumulativeIntentGraphView;
  previousAudit?: NorthstarCumulativeIntentAudit;
  acceptedGrounding?: {
    conceptId?: string;
    resolvedNodeId?: string;
    requestedRelation?: string;
    evidenceNodeIds?: string[];
    expectedPreservedNodeIds?: string[];
  };
};

const TARGET_ATTRIBUTE_NAMES = [
  "data-ns-explains-node-id",
  "data-ns-target-node-id",
  "data-ns-between-before-node-id",
  "data-ns-between-after-node-id",
] as const;

const PROVENANCE_ATTRIBUTE_NAMES = [
  "data-ns-source-node-id",
  "data-ns-provenance-node-id",
  "data-ns-canonical-source-node-id",
  "data-ns-derived-from-node-id",
] as const;

function stableUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeRect(value: unknown): NorthstarAuditRect | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const left = finite(record.left);
  const top = finite(record.top);
  const width = finite(record.width);
  const height = finite(record.height);
  const right = finite(record.right) ?? (left !== undefined && width !== undefined ? left + width : undefined);
  const bottom = finite(record.bottom) ?? (top !== undefined && height !== undefined ? top + height : undefined);
  if (left === undefined || top === undefined || right === undefined || bottom === undefined) return undefined;
  return {
    left,
    top,
    right,
    bottom,
    width: width ?? Math.max(0, right - left),
    height: height ?? Math.max(0, bottom - top),
  };
}

function snapshotNodeMap(acknowledgement: NorthstarArtifactMutationAcknowledgement): Map<string, NorthstarCommittedSemanticNode> {
  return new Map((acknowledgement.snapshot?.semanticNodes ?? []).map((node) => [node.nodeId, node]));
}

function nodeIdsFromMarkup(markup: string): string[] {
  const ids: string[] = [];
  const pattern = /\bdata-ns-node-id\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markup)) !== null) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (value) ids.push(value);
  }
  return stableUnique(ids);
}

function operationScope(batch: NorthstarArtboardMutationBatch) {
  const direct = new Set<string>();
  const introduced = new Set<string>();
  const removed = new Set<string>();
  const containers = new Set<string>();
  let artboardExpansionRequested = false;
  let globalPresentationMutation = false;

  const addMarkupIds = (markup: string) => {
    for (const id of nodeIdsFromMarkup(markup)) {
      introduced.add(id);
      direct.add(id);
    }
  };

  for (const operation of batch.operations) {
    switch (operation.op) {
      case "set-text":
      case "set-attributes":
      case "set-styles":
      case "set-classes":
        direct.add(operation.targetId);
        break;
      case "set-html":
        direct.add(operation.targetId);
        addMarkupIds(operation.html);
        break;
      case "insert-html":
        containers.add(operation.targetId);
        addMarkupIds(operation.html);
        break;
      case "remove":
        direct.add(operation.targetId);
        removed.add(operation.targetId);
        break;
      case "move":
        direct.add(operation.targetId);
        containers.add(operation.parentId);
        break;
      case "recompose-region":
        direct.add(operation.targetId);
        addMarkupIds(operation.html);
        for (const placement of operation.placements) {
          direct.add(placement.targetId);
          containers.add(placement.parentId);
        }
        for (const retiredNodeId of operation.retireNodeIds ?? []) removed.add(retiredNodeId);
        break;
      case "request-space":
        artboardExpansionRequested = true;
        break;
      case "set-css-layer":
      case "set-runtime-module":
        globalPresentationMutation = true;
        break;
    }
  }

  const relationSubjectNodeIds = stableUnique((batch.relations ?? []).map((relation) => relation.subjectId));
  const relationReferenceNodeIds = stableUnique((batch.relations ?? []).flatMap((relation) => relation.references.map((reference) => reference.nodeId)));
  for (const nodeId of relationSubjectNodeIds) direct.add(nodeId);

  return {
    directNodeIds: stableUnique(direct),
    introducedNodeIds: stableUnique(introduced),
    removedNodeIds: stableUnique(removed),
    containerContextNodeIds: stableUnique(containers),
    relationSubjectNodeIds,
    relationReferenceNodeIds,
    artboardExpansionRequested,
    globalPresentationMutation,
  };
}

function regionMembership(graph: NorthstarCumulativeIntentGraphView) {
  const byNode = new Map<string, Set<string>>();
  const membersByRoot = new Map<string, Set<string>>();
  for (const region of graph.regions) {
    const rootRegions = byNode.get(region.rootNodeId) ?? new Set<string>();
    rootRegions.add(region.regionId);
    byNode.set(region.rootNodeId, rootRegions);
    const members = membersByRoot.get(region.rootNodeId) ?? new Set<string>();
    for (const nodeId of region.memberNodeIds) {
      members.add(nodeId);
      const regions = byNode.get(nodeId) ?? new Set<string>();
      regions.add(region.regionId);
      byNode.set(nodeId, regions);
    }
    membersByRoot.set(region.rootNodeId, members);
  }
  return { byNode, membersByRoot };
}

function nodeBoundsMap(graph: NorthstarCumulativeIntentGraphView, acknowledgement: NorthstarArtifactMutationAcknowledgement) {
  const map = new Map<string, NorthstarAuditRect>();
  for (const node of acknowledgement.snapshot?.semanticNodes ?? []) {
    const bounds = normalizeRect(node.bounds);
    if (bounds) map.set(node.nodeId, bounds);
  }
  for (const node of graph.nodes) {
    const bounds = normalizeRect(node.bounds);
    if (bounds && !map.has(node.nodeId)) map.set(node.nodeId, bounds);
  }
  for (const item of graph.evidenceItems) {
    const bounds = normalizeRect(item.bounds);
    if (bounds && !map.has(item.nodeId)) map.set(item.nodeId, bounds);
  }
  for (const region of graph.regions) {
    const bounds = normalizeRect(region.bounds);
    if (bounds) map.set(region.rootNodeId, bounds);
  }
  return map;
}

function geometryChanged(before: NorthstarAuditRect | undefined, after: NorthstarAuditRect | undefined): boolean {
  if (!before || !after) return before !== after;
  return ["left", "top", "right", "bottom", "width", "height"].some((key) =>
    Math.abs(before[key as keyof NorthstarAuditRect] - after[key as keyof NorthstarAuditRect]) > 0.5
  );
}

function collateralGeometryDelta(before: NorthstarAuditRect, after: NorthstarAuditRect): NorthstarCollateralGeometryFinding["delta"] {
  const round = (value: number) => Math.round(value * 100) / 100;
  const beforeCenterX = before.left + (before.width / 2);
  const beforeCenterY = before.top + (before.height / 2);
  const afterCenterX = after.left + (after.width / 2);
  const afterCenterY = after.top + (after.height / 2);
  return {
    left: round(after.left - before.left),
    top: round(after.top - before.top),
    width: round(after.width - before.width),
    height: round(after.height - before.height),
    centerDistance: round(Math.hypot(afterCenterX - beforeCenterX, afterCenterY - beforeCenterY)),
  };
}

function materiallyDifferentGeometry(before: NorthstarAuditRect, after: NorthstarAuditRect): boolean {
  const delta = collateralGeometryDelta(before, after);
  return Math.max(Math.abs(delta.left), Math.abs(delta.top), Math.abs(delta.width), Math.abs(delta.height)) > 1;
}

function collateralGeometryChangeKind(
  before: NorthstarAuditRect,
  after: NorthstarAuditRect,
): NorthstarCollateralGeometryFinding["changeKind"] {
  const delta = collateralGeometryDelta(before, after);
  return Math.max(Math.abs(delta.width), Math.abs(delta.height)) > 1
    ? "size-or-shape"
    : "position-only";
}

function intersectionArea(a: NorthstarAuditRect | undefined, b: NorthstarAuditRect | undefined): number {
  if (!a || !b) return 0;
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function relationshipRegistry(input: BuildNorthstarCumulativeIntentAuditInput): NorthstarAuthoredDesignRelation[] {
  return input.afterAcknowledgement.authoredDesignRelations
    ?? input.afterPackage.authoredDesignRelations
    ?? [];
}

function semanticTargetEvidence(node: NorthstarCommittedSemanticNode | undefined, relations: NorthstarAuthoredDesignRelation[]) {
  const relationTargets = new Set<string>();
  const attributeTargets = new Set<string>();
  for (const relation of relations) {
    if (relation.subjectId !== node?.nodeId) continue;
    for (const reference of relation.references) relationTargets.add(reference.nodeId);
  }
  for (const name of TARGET_ATTRIBUTE_NAMES) {
    const value = node?.normalizedAttributes?.[name];
    if (value) attributeTargets.add(value);
  }
  return {
    relationTargets: stableUnique(relationTargets),
    attributeTargets: stableUnique(attributeTargets),
    combinedTargets: stableUnique([...relationTargets, ...attributeTargets]),
  };
}

function provenanceTargets(node: NorthstarCommittedSemanticNode | undefined): string[] {
  const values = new Set<string>();
  for (const name of PROVENANCE_ATTRIBUTE_NAMES) {
    const value = node?.normalizedAttributes?.[name];
    if (value) values.add(value);
  }
  return stableUnique(values);
}

type NorthstarHtmlNodeMetadata = {
  tagName: string;
  attributes: Record<string, string>;
  hasUnaddressedPaintedSvgDescendant: boolean;
};

type NorthstarHtmlAssetIndex = {
  assetUrlsByNodeId: Map<string, Set<string>>;
  nodeMetadataByNodeId: Map<string, NorthstarHtmlNodeMetadata>;
};

type CanonicalEvidenceAsset = {
  nodeId: string;
  evidenceId?: string;
  assetUrl: string;
};

const HTML_VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

function decodeHtmlAttributeValue(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseHtmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes[name] = decodeHtmlAttributeValue(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

const SVG_CONTAINER_TAGS = new Set([
  "svg", "g", "defs", "clipPath", "mask", "marker", "pattern", "symbol",
].map((tagName) => tagName.toLowerCase()));

const SVG_PAINTED_PRIMITIVE_TAGS = new Set([
  "path", "line", "polyline", "polygon", "rect", "circle", "ellipse",
  "text", "tspan", "textPath", "image", "use", "foreignObject",
].map((tagName) => tagName.toLowerCase()));

function styleDeclarationMap(style: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const declaration of (style ?? "").split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const name = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (name && value) result[name] = value;
  }
  return result;
}

function isHiddenPaint(attributes: Record<string, string>): boolean {
  const style = styleDeclarationMap(attributes.style);
  const display = (style.display ?? attributes.display ?? "").trim().toLowerCase();
  const visibility = (style.visibility ?? attributes.visibility ?? "").trim().toLowerCase();
  const opacity = Number(style.opacity ?? attributes.opacity ?? "1");
  return display === "none" || visibility === "hidden" || visibility === "collapse" || Number.isFinite(opacity) && opacity <= 0;
}

function isPotentiallyPaintedSvgPrimitive(tagName: string, attributes: Record<string, string>): boolean {
  if (!SVG_PAINTED_PRIMITIVE_TAGS.has(tagName) || isHiddenPaint(attributes)) return false;
  const style = styleDeclarationMap(attributes.style);
  if (tagName === "line" || tagName === "polyline") {
    const stroke = (style.stroke ?? attributes.stroke ?? "none").trim().toLowerCase();
    return stroke !== "none" && stroke !== "transparent";
  }
  if (["path", "polygon", "rect", "circle", "ellipse"].includes(tagName)) {
    const fill = (style.fill ?? attributes.fill ?? "").trim().toLowerCase();
    const stroke = (style.stroke ?? attributes.stroke ?? "").trim().toLowerCase();
    return fill !== "none" || (stroke !== "" && stroke !== "none" && stroke !== "transparent");
  }
  return true;
}

function htmlAssetIndex(html: string): NorthstarHtmlAssetIndex {
  const assetUrlsByNodeId = new Map<string, Set<string>>();
  const nodeMetadataByNodeId = new Map<string, NorthstarHtmlNodeMetadata>();
  const stack: Array<{ tagName: string; nodeId?: string }> = [];
  const tagPattern = /<!--[^]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const token = match[0];
    if (token.startsWith("<!--") || token.startsWith("<!")) continue;
    const closing = /^<\//.test(token);
    const nameMatch = token.match(/^<\/?\s*([A-Za-z][\w:-]*)/);
    const tagName = nameMatch?.[1]?.toLowerCase();
    if (!tagName) continue;
    if (closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const entry = stack[index];
        stack.pop();
        if (entry?.tagName === tagName) break;
      }
      continue;
    }

    const bodyStart = token.indexOf(tagName) + tagName.length;
    const bodyEnd = token.lastIndexOf(">");
    const attributes = parseHtmlAttributes(token.slice(bodyStart, bodyEnd));
    const nodeId = attributes["data-ns-node-id"]?.trim() || undefined;
    if (nodeId) {
      nodeMetadataByNodeId.set(nodeId, {
        tagName,
        attributes,
        hasUnaddressedPaintedSvgDescendant: nodeMetadataByNodeId.get(nodeId)?.hasUnaddressedPaintedSvgDescendant ?? false,
      });
    } else if (isPotentiallyPaintedSvgPrimitive(tagName, attributes)) {
      const ownerNodeId = [...stack].reverse().find((entry) => entry.nodeId)?.nodeId;
      if (ownerNodeId) {
        const owner = nodeMetadataByNodeId.get(ownerNodeId);
        if (owner) owner.hasUnaddressedPaintedSvgDescendant = true;
      }
    }
    const activeNodeIds = stableUnique([
      ...stack.map((entry) => entry.nodeId ?? ""),
      nodeId ?? "",
    ]);
    if ((tagName === "img" || tagName === "source") && attributes.src) {
      for (const activeNodeId of activeNodeIds) {
        const urls = assetUrlsByNodeId.get(activeNodeId) ?? new Set<string>();
        urls.add(attributes.src);
        assetUrlsByNodeId.set(activeNodeId, urls);
      }
    }
    const selfClosing = /\/\s*>$/.test(token) || HTML_VOID_ELEMENTS.has(tagName);
    if (!selfClosing) stack.push({ tagName, nodeId });
  }
  return { assetUrlsByNodeId, nodeMetadataByNodeId };
}

function addSnapshotAssets(
  index: NorthstarHtmlAssetIndex,
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
): NorthstarHtmlAssetIndex {
  const nodeMap = snapshotNodeMap(acknowledgement);
  for (const node of nodeMap.values()) {
    const src = node.normalizedAttributes?.src;
    if (!src) continue;
    const owners = [node.nodeId, ...ancestorSet(node.nodeId, nodeMap)];
    for (const ownerNodeId of owners) {
      const urls = index.assetUrlsByNodeId.get(ownerNodeId) ?? new Set<string>();
      urls.add(src);
      index.assetUrlsByNodeId.set(ownerNodeId, urls);
    }
  }
  return index;
}

function isTransparentColor(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized || normalized === "transparent") return true;
  const rgba = normalized.match(/^rgba\([^,]+,[^,]+,[^,]+,([0-9.]+)\)$/);
  if (rgba && Number(rgba[1]) <= 0) return true;
  const hsla = normalized.match(/^hsla\([^,]+,[^,]+,[^,]+,([0-9.]+)\)$/);
  return Boolean(hsla && Number(hsla[1]) <= 0);
}

function hasVisibleSvgContainerSurface(
  metadata: NorthstarHtmlNodeMetadata | undefined,
  node: NorthstarCommittedSemanticNode | undefined,
): boolean {
  if (!metadata || !SVG_CONTAINER_TAGS.has(metadata.tagName)) return true;
  if (metadata.hasUnaddressedPaintedSvgDescendant) return true;

  const inlineStyles = styleDeclarationMap(metadata.attributes.style);
  const styles = { ...inlineStyles, ...(node?.normalizedStyles ?? {}) };
  const backgroundImage = (styles["background-image"] ?? "").trim().toLowerCase();
  const background = (styles.background ?? "").trim().toLowerCase();
  const backgroundColor = styles["background-color"] ?? metadata.attributes["background-color"];
  if (backgroundImage && backgroundImage !== "none") return true;
  if (background && background !== "none" && background !== "transparent") return true;
  if (!isTransparentColor(backgroundColor)) return true;

  const boxShadow = (styles["box-shadow"] ?? "").trim().toLowerCase();
  if (boxShadow && boxShadow !== "none") return true;
  const borderStyle = (styles["border-style"] ?? styles.border ?? "").trim().toLowerCase();
  const borderWidth = Number.parseFloat(styles["border-width"] ?? styles.border ?? "0");
  if (borderStyle && !/^(none|0(?:px)?)$/.test(borderStyle) && (!Number.isFinite(borderWidth) || borderWidth > 0)) return true;
  const outlineStyle = (styles["outline-style"] ?? styles.outline ?? "").trim().toLowerCase();
  const outlineWidth = Number.parseFloat(styles["outline-width"] ?? styles.outline ?? "0");
  return Boolean(outlineStyle && !/^(none|0(?:px)?)$/.test(outlineStyle) && (!Number.isFinite(outlineWidth) || outlineWidth > 0));
}

function spatialExposureBounds(
  nodeId: string,
  bounds: NorthstarAuditRect | undefined,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
  htmlIndex: NorthstarHtmlAssetIndex,
): NorthstarAuditRect | undefined {
  const metadata = htmlIndex.nodeMetadataByNodeId.get(nodeId);
  if (!metadata || !SVG_CONTAINER_TAGS.has(metadata.tagName)) return bounds;
  return hasVisibleSvgContainerSurface(metadata, nodeMap.get(nodeId)) ? bounds : undefined;
}

function parentNodeId(
  nodeId: string,
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
  graph: NorthstarCumulativeIntentGraphView,
): string | undefined {
  return snapshotNodeMap(acknowledgement).get(nodeId)?.parentId
    ?? graph.nodes.find((node) => node.nodeId === nodeId)?.parentId;
}

function topLevelIntroducedNodeIds(
  introducedNodeIds: string[],
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
  graph: NorthstarCumulativeIntentGraphView,
): string[] {
  const introduced = new Set(introducedNodeIds);
  return stableUnique(introducedNodeIds.filter((nodeId) => {
    const parentId = parentNodeId(nodeId, acknowledgement, graph);
    return !parentId || !introduced.has(parentId);
  }));
}

function hasIntroducedDescendantWithAsset(
  nodeId: string,
  assetUrls: Set<string>,
  introducedNodeIds: string[],
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
  graph: NorthstarCumulativeIntentGraphView,
  assetIndex: NorthstarHtmlAssetIndex,
): boolean {
  const introduced = new Set(introducedNodeIds);
  const nodeMap = snapshotNodeMap(acknowledgement);
  for (const candidateNodeId of introduced) {
    if (candidateNodeId === nodeId) continue;
    let current = parentNodeId(candidateNodeId, acknowledgement, graph);
    let isDescendant = false;
    while (current) {
      if (current === nodeId) {
        isDescendant = true;
        break;
      }
      current = nodeMap.get(current)?.parentId ?? graph.nodes.find((node) => node.nodeId === current)?.parentId;
    }
    if (!isDescendant) continue;
    const candidateAssets = assetIndex.assetUrlsByNodeId.get(candidateNodeId) ?? new Set<string>();
    if ([...candidateAssets].some((url) => assetUrls.has(url))) return true;
  }
  return false;
}

function canonicalEvidenceAssets(
  graph: NorthstarCumulativeIntentGraphView,
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
  assetIndex: NorthstarHtmlAssetIndex,
): CanonicalEvidenceAsset[] {
  const nodeMap = snapshotNodeMap(acknowledgement);
  const result: CanonicalEvidenceAsset[] = [];
  for (const item of graph.evidenceItems) {
    const urls = new Set(assetIndex.assetUrlsByNodeId.get(item.nodeId) ?? []);
    const directSrc = nodeMap.get(item.nodeId)?.normalizedAttributes?.src;
    if (directSrc) urls.add(directSrc);
    for (const assetUrl of urls) {
      result.push({ nodeId: item.nodeId, evidenceId: item.evidenceId, assetUrl });
    }
  }
  return result.sort((a, b) => `${a.assetUrl}:${a.nodeId}`.localeCompare(`${b.assetUrl}:${b.nodeId}`));
}

function relationProvenanceTargets(nodeId: string, relations: NorthstarAuthoredDesignRelation[]): string[] {
  const sourceRoles = new Set(["source", "origin", "provenance", "canonical-source"]);
  return stableUnique(relations
    .filter((relation) => relation.subjectId === nodeId)
    .flatMap((relation) => {
      const relationDeclaresReuse = /reuse|provenance|derived/i.test(relation.kind);
      return relation.references
        .filter((reference) => sourceRoles.has(reference.role) || (relationDeclaresReuse && reference.role === "reference"))
        .map((reference) => reference.nodeId);
    }));
}

function exactProvenanceResolution(input: {
  nodeId: string;
  explicitProvenanceNodeIds: string[];
  relationProvenanceNodeIds: string[];
  assetUrls: string[];
  canonicalAssets: CanonicalEvidenceAsset[];
}): NorthstarCumulativeIntentProvenanceResolution {
  const explicitCandidates = stableUnique([
    ...input.explicitProvenanceNodeIds,
    ...input.relationProvenanceNodeIds,
  ]);
  if (explicitCandidates.length > 0) {
    const candidates = input.canonicalAssets.filter((candidate) => explicitCandidates.includes(candidate.nodeId));
    const nodeIds = stableUnique(candidates.map((candidate) => candidate.nodeId));
    if (explicitCandidates.length === 1) {
      const candidate = candidates.find((item) => item.nodeId === explicitCandidates[0]);
      return {
        status: "explicit",
        sourcePresentationNodeId: explicitCandidates[0],
        sourceEvidenceId: candidate?.evidenceId,
        matchedAssetUrl: candidate?.assetUrl,
        candidateCount: Math.max(1, nodeIds.length),
      };
    }
    return { status: "ambiguous", candidateCount: explicitCandidates.length };
  }

  const exactMatches = input.canonicalAssets.filter((candidate) => input.assetUrls.includes(candidate.assetUrl));
  const uniqueNodeIds = stableUnique(exactMatches.map((candidate) => candidate.nodeId).filter((nodeId) => nodeId !== input.nodeId));
  if (uniqueNodeIds.length === 1) {
    const candidate = exactMatches.find((item) => item.nodeId === uniqueNodeIds[0]);
    return {
      status: "exact-canonical-asset-match",
      sourcePresentationNodeId: candidate?.nodeId,
      sourceEvidenceId: candidate?.evidenceId,
      matchedAssetUrl: candidate?.assetUrl,
      candidateCount: 1,
    };
  }
  if (uniqueNodeIds.length > 1) return { status: "ambiguous", candidateCount: uniqueNodeIds.length };
  return { status: "missing", candidateCount: 0 };
}

function areGroundingTargetsCompatible(
  resolvedNodeId: string,
  explicitTargetNodeIds: string[],
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
  graph: NorthstarCumulativeIntentGraphView,
): boolean {
  if (explicitTargetNodeIds.includes(resolvedNodeId)) return true;
  const parentByNode = new Map<string, string | undefined>();
  for (const node of acknowledgement.snapshot?.semanticNodes ?? []) parentByNode.set(node.nodeId, node.parentId);
  for (const node of graph.nodes) if (!parentByNode.has(node.nodeId)) parentByNode.set(node.nodeId, node.parentId);
  const ancestors = (nodeId: string) => {
    const result = new Set<string>([nodeId]);
    let current = parentByNode.get(nodeId);
    while (current && !result.has(current)) {
      result.add(current);
      current = parentByNode.get(current);
    }
    return result;
  };
  const resolvedAncestors = ancestors(resolvedNodeId);
  return explicitTargetNodeIds.every((targetNodeId) => {
    const targetAncestors = ancestors(targetNodeId);
    return resolvedAncestors.has(targetNodeId) || targetAncestors.has(resolvedNodeId);
  });
}

function acceptedGroundingRecord(
  grounding: BuildNorthstarCumulativeIntentAuditInput["acceptedGrounding"],
  source: NorthstarCumulativeIntentGroundingSource,
): NorthstarCumulativeIntentGrounding | undefined {
  if (!grounding) return undefined;
  return {
    conceptId: grounding.conceptId,
    resolvedNodeId: grounding.resolvedNodeId,
    evidenceNodeIds: stableUnique(grounding.evidenceNodeIds ?? []),
    requestedRelation: grounding.requestedRelation,
    expectedPreservedNodeIds: stableUnique(grounding.expectedPreservedNodeIds ?? []),
    source,
  };
}

function isAuthoredNode(node: NorthstarCommittedSemanticNode | undefined): boolean {
  if (!node) return false;
  const attributes = node.normalizedAttributes ?? {};
  return Object.keys(attributes).some((name) =>
    name === "data-ns-authored-relationship"
    || name === "data-ns-authored-annotation"
    || name === "data-ns-explains-node-id"
    || name === "data-ns-source-node-id"
    || name === "data-ns-target-node-id"
    || name === "data-ns-between-before-node-id"
    || name === "data-ns-between-after-node-id"
    || name === "data-ns-canonical-source-node-id"
    || name === "data-ns-derived-from-node-id"
  );
}

function buildCommitmentLedger(input: BuildNorthstarCumulativeIntentAuditInput, scope: ReturnType<typeof operationScope>) {
  const beforeNodes = snapshotNodeMap(input.beforeAcknowledgement);
  const afterNodes = snapshotNodeMap(input.afterAcknowledgement);
  const relations = relationshipRegistry(input);
  const relationSubjects = new Set(relations.map((relation) => relation.subjectId));
  const currentRelationSubjects = new Set(scope.relationSubjectNodeIds);
  const targetMetadataTouched = new Set<string>();
  const provenanceMetadataTouched = new Set<string>();
  for (const operation of input.currentMutation.operations) {
    if (operation.op !== "set-attributes") continue;
    const names = Object.keys(operation.attributes);
    if (names.some((name) => (TARGET_ATTRIBUTE_NAMES as readonly string[]).includes(name))) targetMetadataTouched.add(operation.targetId);
    if (names.some((name) => (PROVENANCE_ATTRIBUTE_NAMES as readonly string[]).includes(name))) provenanceMetadataTouched.add(operation.targetId);
  }

  const introduced = new Set(scope.introducedNodeIds);
  const removed = new Set(scope.removedNodeIds);
  const direct = new Set(scope.directNodeIds);
  const prior = new Map((input.previousAudit?.activeCommitmentLedger ?? []).map((commitment) => [commitment.nodeId, commitment]));
  const { byNode: regionsByNode } = regionMembership(input.afterGraph);
  const evidenceByNode = new Map(input.afterGraph.evidenceItems.map((item) => [item.nodeId, item]));
  const regionRoots = new Set(input.afterGraph.regions.map((region) => region.rootNodeId));
  const graphNodeIds = new Set([
    ...input.afterGraph.nodes.map((node) => node.nodeId),
    ...input.afterGraph.evidenceItems.map((item) => item.nodeId),
    ...input.afterGraph.regions.map((region) => region.rootNodeId),
  ]);
  const allAfterNodeIds = new Set([...afterNodes.keys(), ...graphNodeIds]);
  const currentNodeIds = new Set([
    ...prior.keys(),
    ...introduced,
    ...scope.directNodeIds,
    ...relationSubjects,
    ...afterNodes.keys(),
    ...graphNodeIds,
  ]);

  const beforeAssetIndex = addSnapshotAssets(
    htmlAssetIndex(input.beforePackage.document.html),
    input.beforeAcknowledgement,
  );
  const afterAssetIndex = addSnapshotAssets(
    htmlAssetIndex(input.afterPackage.document.html),
    input.afterAcknowledgement,
  );
  const canonicalAssets = canonicalEvidenceAssets(input.beforeGraph, input.beforeAcknowledgement, beforeAssetIndex);
  const topLevelIntroduced = topLevelIntroducedNodeIds(scope.introducedNodeIds, input.afterAcknowledgement, input.afterGraph);
  const groundingRootNodeId = topLevelIntroduced.length === 1 ? topLevelIntroduced[0] : undefined;
  const groundingResolvedNodeId = input.acceptedGrounding?.resolvedNodeId?.trim() || undefined;
  const resolutionWarnings: NorthstarCumulativeIntentResolutionWarning[] = [];
  if (input.acceptedGrounding && scope.introducedNodeIds.length > 0 && topLevelIntroduced.length !== 1) {
    resolutionWarnings.push({
      code: "grounding-target-unresolved",
      detail: `Accepted grounding was not inferred because the mutation introduced ${topLevelIntroduced.length} independent top-level authored roots.`,
      candidateNodeIds: topLevelIntroduced,
    });
  }

  const introducedLeafMediaNodes = new Set(scope.introducedNodeIds.filter((nodeId) => {
    const urls = afterAssetIndex.assetUrlsByNodeId.get(nodeId) ?? new Set<string>();
    return urls.size > 0 && !hasIntroducedDescendantWithAsset(
      nodeId,
      urls,
      scope.introducedNodeIds,
      input.afterAcknowledgement,
      input.afterGraph,
      afterAssetIndex,
    );
  }));

  const commitments: NorthstarCumulativeIntentCommitment[] = [];
  for (const nodeId of currentNodeIds) {
    const afterNode = afterNodes.get(nodeId);
    const priorCommitment = prior.get(nodeId);
    const existsAfter = Boolean(afterNode) || relationSubjects.has(nodeId) || (graphNodeIds.has(nodeId) && !removed.has(nodeId));
    if (!existsAfter) continue;

    const isEvidence = evidenceByNode.has(nodeId) || Boolean(afterNode?.normalizedAttributes?.["data-ns-evidence-id"]);
    const isRegion = regionRoots.has(nodeId);
    const targetEvidence = semanticTargetEvidence(afterNode, relations);
    const explicitTargetSource: NorthstarCumulativeIntentGroundingSource = targetEvidence.relationTargets.length > 0
      ? "explicit-authored-relation"
      : targetEvidence.attributeTargets.length > 0
        ? "authored-node-attributes"
        : "none";
    const explicitProvenance = provenanceTargets(afterNode);
    const relationProvenance = relationProvenanceTargets(nodeId, relations);
    const explicitlyAuthored = isAuthoredNode(afterNode) || relationSubjects.has(nodeId);
    const currentPresentationEdit = direct.has(nodeId) && (isEvidence || isRegion);
    const currentAuthoredObject = introduced.has(nodeId) || explicitlyAuthored || Boolean(priorCommitment);
    if (!currentPresentationEdit && !currentAuthoredObject) continue;

    let grounding = priorCommitment?.grounding;
    let semanticTargetNodeIds = stableUnique(
      currentRelationSubjects.has(nodeId) || targetMetadataTouched.has(nodeId)
        ? targetEvidence.combinedTargets
        : targetEvidence.combinedTargets.length > 0
          ? targetEvidence.combinedTargets
          : (priorCommitment?.semanticTargetNodeIds ?? []),
    );

    if (nodeId === groundingRootNodeId && input.acceptedGrounding) {
      if (!groundingResolvedNodeId || !allAfterNodeIds.has(groundingResolvedNodeId)) {
        grounding = acceptedGroundingRecord(input.acceptedGrounding, explicitTargetSource);
        resolutionWarnings.push({
          code: "grounding-target-unresolved",
          nodeId,
          detail: `Accepted grounding target ${groundingResolvedNodeId ?? "(missing)"} is not present in the committed semantic graph.`,
        });
      } else if (
        semanticTargetNodeIds.length > 0
        && !areGroundingTargetsCompatible(groundingResolvedNodeId, semanticTargetNodeIds, input.afterAcknowledgement, input.afterGraph)
      ) {
        grounding = acceptedGroundingRecord(input.acceptedGrounding, explicitTargetSource);
        resolutionWarnings.push({
          code: "grounding-conflicts-with-explicit-target",
          nodeId,
          detail: `Accepted grounding target ${groundingResolvedNodeId} conflicts with explicit authored targets; explicit authored targets remain authoritative.`,
          candidateNodeIds: semanticTargetNodeIds,
        });
      } else if (semanticTargetNodeIds.length > 0) {
        grounding = acceptedGroundingRecord(input.acceptedGrounding, explicitTargetSource);
      } else {
        grounding = acceptedGroundingRecord(input.acceptedGrounding, "accepted-model-grounding");
        semanticTargetNodeIds = [groundingResolvedNodeId];
      }
    }

    const isVisualRelationshipObject = relationSubjects.has(nodeId)
      || afterNode?.normalizedAttributes?.["data-ns-authored-relationship"] === "true";
    const assetUrls = stableUnique(afterAssetIndex.assetUrlsByNodeId.get(nodeId) ?? []);
    const provenanceCandidate = !isVisualRelationshipObject && (
      explicitProvenance.length > 0
      || relationProvenance.length > 0
      || priorCommitment?.kind === "reused-evidence-presentation"
      || Boolean(priorCommitment?.provenanceResolution)
      || (
        input.acceptedGrounding?.conceptId === "evidence-reuse"
        && introduced.has(nodeId)
        && introducedLeafMediaNodes.has(nodeId)
      )
    );

    let provenanceResolution = priorCommitment?.provenanceResolution;
    let provenanceNodeIds = stableUnique(
      provenanceMetadataTouched.has(nodeId)
        ? explicitProvenance
        : explicitProvenance.length > 0
          ? explicitProvenance
          : (priorCommitment?.provenanceNodeIds ?? []),
    );
    let sourceEvidenceIds = stableUnique([
      evidenceByNode.get(nodeId)?.evidenceId ?? "",
      afterNode?.normalizedAttributes?.["data-ns-evidence-id"] ?? "",
      ...(priorCommitment?.sourceEvidenceIds ?? []),
    ]);

    if (provenanceCandidate) {
      provenanceResolution = exactProvenanceResolution({
        nodeId,
        explicitProvenanceNodeIds: explicitProvenance,
        relationProvenanceNodeIds: relationProvenance,
        assetUrls,
        canonicalAssets,
      });
      if (provenanceResolution.sourcePresentationNodeId) {
        provenanceNodeIds = [provenanceResolution.sourcePresentationNodeId];
      }
      if (provenanceResolution.sourceEvidenceId) {
        sourceEvidenceIds = [provenanceResolution.sourceEvidenceId];
      }
      if (provenanceResolution.status === "ambiguous") {
        const exactCandidates = canonicalAssets.filter((candidate) => assetUrls.includes(candidate.assetUrl));
        resolutionWarnings.push({
          code: "reuse-provenance-ambiguous",
          nodeId,
          detail: `Reused evidence provenance matched ${provenanceResolution.candidateCount} canonical presentations; no source was selected.`,
          candidateNodeIds: stableUnique(exactCandidates.map((candidate) => candidate.nodeId)),
          candidateEvidenceIds: stableUnique(exactCandidates.map((candidate) => candidate.evidenceId ?? "")),
        });
      } else if (provenanceResolution.status === "missing") {
        resolutionWarnings.push({
          code: "reuse-provenance-missing",
          nodeId,
          detail: "No explicit provenance or exact canonical asset match was found for the reused evidence presentation.",
        });
      } else if (provenanceResolution.status === "explicit" && !provenanceResolution.sourceEvidenceId) {
        resolutionWarnings.push({
          code: "canonical-asset-not-found",
          nodeId,
          detail: `Explicit provenance source ${provenanceResolution.sourcePresentationNodeId ?? "(missing)"} is not a canonical evidence presentation in the committed graph.`,
          candidateNodeIds: provenanceResolution.sourcePresentationNodeId ? [provenanceResolution.sourcePresentationNodeId] : [],
        });
      }
    }

    let kind: NorthstarCumulativeIntentCommitmentKind;
    if (isVisualRelationshipObject) {
      kind = "visual-relationship";
    } else if (
      provenanceResolution?.status === "explicit"
      || provenanceResolution?.status === "exact-canonical-asset-match"
      || (provenanceNodeIds.length > 0 && nodeId !== provenanceNodeIds[0])
    ) {
      kind = "reused-evidence-presentation";
    } else if (isEvidence) {
      kind = "evidence-presentation";
    } else if (isRegion) {
      kind = "region-presentation";
    } else {
      kind = "authored-object";
    }

    const relationIds = stableUnique(relations.filter((relation) => relation.subjectId === nodeId).map((relation) => relation.id));
    const touchedThisTurn = direct.has(nodeId) || currentRelationSubjects.has(nodeId);
    commitments.push({
      commitmentId: priorCommitment?.commitmentId ?? `commitment:${nodeId}`,
      nodeId,
      kind,
      parentNodeId: afterNode?.parentId ?? input.afterGraph.nodes.find((node) => node.nodeId === nodeId)?.parentId ?? priorCommitment?.parentNodeId,
      originatingTurn: priorCommitment?.originatingTurn ?? (introduced.has(nodeId) || currentPresentationEdit || currentRelationSubjects.has(nodeId) ? input.turn : undefined),
      originMutationId: priorCommitment?.originMutationId ?? (introduced.has(nodeId) || currentPresentationEdit || currentRelationSubjects.has(nodeId) ? input.currentMutation.mutationId : undefined),
      originIntent: priorCommitment?.originIntent ?? (introduced.has(nodeId) || currentPresentationEdit || currentRelationSubjects.has(nodeId) ? input.currentMutation.intent : undefined),
      latestTurn: touchedThisTurn ? input.turn : priorCommitment?.latestTurn,
      latestMutationId: touchedThisTurn ? input.currentMutation.mutationId : priorCommitment?.latestMutationId,
      latestIntent: touchedThisTurn ? input.currentMutation.intent : priorCommitment?.latestIntent,
      semanticTargetNodeIds,
      semanticRegionIds: stableUnique([...(regionsByNode.get(nodeId) ?? []), ...(priorCommitment?.semanticRegionIds ?? [])]),
      relationIds: stableUnique(relationIds.length > 0 || currentRelationSubjects.has(nodeId) ? relationIds : (priorCommitment?.relationIds ?? [])),
      sourceEvidenceIds,
      provenanceNodeIds,
      grounding,
      provenanceResolution,
      boundsBefore: normalizeRect(beforeNodes.get(nodeId)?.bounds) ?? priorCommitment?.boundsAfter,
      boundsAfter: normalizeRect(afterNode?.bounds)
        ?? normalizeRect(input.afterGraph.nodes.find((node) => node.nodeId === nodeId)?.bounds)
        ?? normalizeRect(input.afterGraph.evidenceItems.find((item) => item.nodeId === nodeId)?.bounds)
        ?? normalizeRect(input.afterGraph.regions.find((region) => region.rootNodeId === nodeId)?.bounds),
    });
  }

  const active = commitments.sort((a, b) => a.commitmentId.localeCompare(b.commitmentId));
  const activeIds = new Set(active.map((commitment) => commitment.commitmentId));
  const retired = stableUnique((input.previousAudit?.activeCommitmentLedger ?? [])
    .filter((commitment) => !activeIds.has(commitment.commitmentId))
    .map((commitment) => commitment.commitmentId));
  return {
    active,
    retired,
    resolutionWarnings: resolutionWarnings
      .filter((warning, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index)
      .sort((a, b) => `${a.code}:${a.nodeId ?? ""}:${a.detail}`.localeCompare(`${b.code}:${b.nodeId ?? ""}:${b.detail}`)),
  };
}

function ancestorSet(nodeId: string, nodeMap: Map<string, NorthstarCommittedSemanticNode>): Set<string> {
  const result = new Set<string>();
  let current = nodeMap.get(nodeId)?.parentId;
  while (current && !result.has(current)) {
    result.add(current);
    current = nodeMap.get(current)?.parentId;
  }
  return result;
}

function hasAncestorRelationship(a: string, b: string, nodeMap: Map<string, NorthstarCommittedSemanticNode>): boolean {
  return ancestorSet(a, nodeMap).has(b) || ancestorSet(b, nodeMap).has(a);
}

export function buildNorthstarCumulativeIntentAudit(input: BuildNorthstarCumulativeIntentAuditInput): NorthstarCumulativeIntentAudit {
  const scope = operationScope(input.currentMutation);
  const ledger = buildCommitmentLedger(input, scope);
  const directNodes = new Set(scope.directNodeIds);
  const afterMembership = regionMembership(input.afterGraph);
  const structuralMembers = new Set<string>();
  for (const directNodeId of directNodes) {
    for (const memberId of afterMembership.membersByRoot.get(directNodeId) ?? []) structuralMembers.add(memberId);
  }

  const beforeBounds = nodeBoundsMap(input.beforeGraph, input.beforeAcknowledgement);
  const afterBounds = nodeBoundsMap(input.afterGraph, input.afterAcknowledgement);
  const geometryChangedNodeIds = stableUnique(new Set([...beforeBounds.keys(), ...afterBounds.keys()]).values())
    .filter((nodeId) => geometryChanged(beforeBounds.get(nodeId), afterBounds.get(nodeId)));
  const changedGeometry = new Set(geometryChangedNodeIds);
  const impactedAnchorNodes = new Set<string>([...directNodes, ...structuralMembers]);
  for (const nodeId of geometryChangedNodeIds) impactedAnchorNodes.add(nodeId);

  const dependencyPaths: NorthstarCumulativeIntentDependencyPath[] = [];
  for (const nodeId of scope.directNodeIds) dependencyPaths.push({ toNodeId: nodeId, reason: "current-mutation-target" });
  for (const nodeId of scope.introducedNodeIds) dependencyPaths.push({ toNodeId: nodeId, reason: "current-mutation-introduction" });
  for (const nodeId of scope.relationSubjectNodeIds) dependencyPaths.push({ toNodeId: nodeId, reason: "current-relation-subject" });
  for (const nodeId of scope.relationReferenceNodeIds) dependencyPaths.push({ toNodeId: nodeId, reason: "current-relation-reference" });
  for (const rootNodeId of scope.directNodeIds) {
    for (const memberNodeId of afterMembership.membersByRoot.get(rootNodeId) ?? []) {
      dependencyPaths.push({ fromNodeId: rootNodeId, toNodeId: memberNodeId, reason: "direct-container-member" });
    }
  }

  const directCommitmentIds = new Set<string>();
  const continuityDependentCommitmentIds = new Set<string>();
  const continuityAnchorNodeIds = new Set<string>(scope.relationReferenceNodeIds);

  const relationTargetsBySubject = new Map<string, Set<string>>();
  for (const relation of relationshipRegistry(input)) {
    relationTargetsBySubject.set(relation.subjectId, new Set(relation.references.map((reference) => reference.nodeId)));
  }

  for (const commitment of ledger.active) {
    if (directNodes.has(commitment.nodeId)) {
      directCommitmentIds.add(commitment.commitmentId);
      continue;
    }

    let path: NorthstarCumulativeIntentDependencyPath | undefined;
    const exactTarget = commitment.semanticTargetNodeIds.find((targetId) => directNodes.has(targetId));
    if (exactTarget) {
      path = { fromNodeId: exactTarget, toNodeId: commitment.nodeId, reason: "authored-target" };
    }
    if (!path) {
      const nestedTarget = commitment.semanticTargetNodeIds.find((targetId) => structuralMembers.has(targetId));
      if (nestedTarget) path = { fromNodeId: nestedTarget, toNodeId: commitment.nodeId, reason: "target-inside-direct-container" };
    }
    if (!path) {
      const changedCollectiveTarget = commitment.semanticTargetNodeIds.find((targetId) => changedGeometry.has(targetId));
      if (changedCollectiveTarget) {
        path = {
          fromNodeId: changedCollectiveTarget,
          toNodeId: commitment.nodeId,
          reason: commitment.grounding?.source === "accepted-model-grounding"
            ? "grounding-target-geometry-changed"
            : "changed-collective-anchor",
        };
      }
    }
    if (!path && commitment.parentNodeId && directNodes.has(commitment.parentNodeId)) {
      path = { fromNodeId: commitment.parentNodeId, toNodeId: commitment.nodeId, reason: "authored-parent" };
    }
    if (!path) {
      const provenanceSource = commitment.provenanceNodeIds.find((nodeId) => impactedAnchorNodes.has(nodeId));
      if (provenanceSource) {
        path = {
          fromNodeId: provenanceSource,
          toNodeId: commitment.nodeId,
          reason: commitment.provenanceResolution?.status === "exact-canonical-asset-match"
            ? "canonical-provenance-source-changed"
            : "provenance-source",
        };
      }
    }
    if (!path) {
      const relationTarget = [...(relationTargetsBySubject.get(commitment.nodeId) ?? [])]
        .find((targetId) => impactedAnchorNodes.has(targetId));
      if (relationTarget) path = { fromNodeId: relationTarget, toNodeId: commitment.nodeId, reason: structuralMembers.has(relationTarget) ? "target-inside-direct-container" : "authored-target" };
    }

    if (path) {
      continuityDependentCommitmentIds.add(commitment.commitmentId);
      dependencyPaths.push(path);
      for (const nodeId of commitment.semanticTargetNodeIds) continuityAnchorNodeIds.add(nodeId);
      for (const nodeId of relationTargetsBySubject.get(commitment.nodeId) ?? []) continuityAnchorNodeIds.add(nodeId);
      for (const nodeId of commitment.provenanceNodeIds) continuityAnchorNodeIds.add(nodeId);
    }
  }

  const afterNodes = snapshotNodeMap(input.afterAcknowledgement);
  // Patch 3B collateral-change addon: the browser is the authority for what
  // actually moved. A pre-existing semantic node becomes a repair obligation
  // only when its rendered geometry changed materially and the current turn
  // did not directly own that node, its containing edit, or a continuity
  // dependant. Same-turn repairs carry the original pre-turn bounds until the
  // collateral displacement is genuinely removed or a later repair explicitly
  // takes ownership of a position-only recomposition. Protected evidence may
  // be translated deliberately, but a width/height change remains collateral
  // even when the evidence node itself is an explicit edit target.
  const explainedGeometryNodeIds = new Set<string>([
    ...scope.directNodeIds,
    ...scope.containerContextNodeIds,
    ...scope.relationSubjectNodeIds,
    ...structuralMembers,
    ...ledger.active
      .filter((commitment) => directCommitmentIds.has(commitment.commitmentId) || continuityDependentCommitmentIds.has(commitment.commitmentId))
      .map((commitment) => commitment.nodeId),
  ]);
  if (scope.artboardExpansionRequested) explainedGeometryNodeIds.add("artboard");
  // Semantic region bounds are derived from their rendered members. A region
  // changing because this turn intentionally moved one of those members is an
  // expected collective consequence, not independent collateral movement.
  for (const region of input.afterGraph.regions) {
    if (region.memberNodeIds.some((nodeId) => directNodes.has(nodeId) || structuralMembers.has(nodeId))) {
      explainedGeometryNodeIds.add(region.rootNodeId);
    }
  }

  const protectedEvidenceRootIds = new Set<string>([
    ...input.beforeGraph.evidenceItems.map((item) => item.nodeId),
    ...input.afterGraph.evidenceItems.map((item) => item.nodeId),
  ]);
  const isProtectedEvidenceGeometryNode = (nodeId: string) =>
    protectedEvidenceRootIds.has(nodeId)
    || [...ancestorSet(nodeId, afterNodes)].some((ancestorId) => protectedEvidenceRootIds.has(ancestorId));
  const isExplicitlyOwnedNow = (nodeId: string) =>
    explainedGeometryNodeIds.has(nodeId)
    || [...ancestorSet(nodeId, afterNodes)].some((ancestorId) => directNodes.has(ancestorId));

  const collateralByNodeId = new Map<string, NorthstarCollateralGeometryFinding>();
  const explicitlyResolvedPriorCollateralNodeIds = new Set<string>();
  const previousAudit = input.previousAudit;
  if (previousAudit && Object.is(previousAudit.turn, input.turn)) {
    for (const priorFinding of previousAudit.affectedComposition.collateralGeometryFindings ?? []) {
      const renderedBounds = afterBounds.get(priorFinding.nodeId);
      if (!renderedBounds || !materiallyDifferentGeometry(priorFinding.baselineBounds, renderedBounds)) continue;
      const explicitlyOwnedInCurrentMutation = isExplicitlyOwnedNow(priorFinding.nodeId);
      const changeKind = collateralGeometryChangeKind(priorFinding.baselineBounds, renderedBounds);
      // A repair is allowed to deliberately adopt a translation that began as
      // collateral. This is how the model can recompose a suffix/row instead of
      // being forced back to stale coordinates. Evidence integrity is stricter:
      // explicit ownership never excuses a changed rendered width or height.
      if (explicitlyOwnedInCurrentMutation && (!isProtectedEvidenceGeometryNode(priorFinding.nodeId) || changeKind === "position-only")) {
        explicitlyResolvedPriorCollateralNodeIds.add(priorFinding.nodeId);
        continue;
      }
      collateralByNodeId.set(priorFinding.nodeId, {
        nodeId: priorFinding.nodeId,
        originTurn: priorFinding.originTurn,
        changeKind,
        explicitlyOwnedInCurrentMutation,
        baselineBounds: priorFinding.baselineBounds,
        renderedBounds,
        delta: collateralGeometryDelta(priorFinding.baselineBounds, renderedBounds),
      });
    }
  }

  const preExistingSemanticNodeIds = stableUnique([
    ...input.beforeGraph.nodes.map((node) => node.nodeId),
    ...input.beforeGraph.evidenceItems.map((item) => item.nodeId),
    ...input.beforeGraph.regions.map((region) => region.rootNodeId),
  ]);
  for (const nodeId of preExistingSemanticNodeIds) {
    if (collateralByNodeId.has(nodeId) || explicitlyResolvedPriorCollateralNodeIds.has(nodeId)) continue;
    const baselineBounds = beforeBounds.get(nodeId);
    const renderedBounds = afterBounds.get(nodeId);
    if (!baselineBounds || !renderedBounds || !materiallyDifferentGeometry(baselineBounds, renderedBounds)) continue;
    const explicitlyOwnedInCurrentMutation = isExplicitlyOwnedNow(nodeId);
    const changeKind = collateralGeometryChangeKind(baselineBounds, renderedBounds);
    // Explicit movement is valid recomposition. Explicit evidence resizing is
    // not: evidence dimensions are a protected integrity property, so surface
    // that damage even when the mutation directly targeted the evidence item.
    if (explicitlyOwnedInCurrentMutation && (!isProtectedEvidenceGeometryNode(nodeId) || changeKind === "position-only")) continue;
    collateralByNodeId.set(nodeId, {
      nodeId,
      originTurn: input.turn,
      changeKind,
      explicitlyOwnedInCurrentMutation,
      baselineBounds,
      renderedBounds,
      delta: collateralGeometryDelta(baselineBounds, renderedBounds),
    });
  }
  const collateralGeometryFindings = [...collateralByNodeId.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  const afterHtmlIndex = htmlAssetIndex(input.afterPackage.document.html);
  const spatiallyExposedCommitmentIds = new Set<string>();
  const spatialExposurePairs: NorthstarCumulativeIntentAudit["affectedComposition"]["spatialExposurePairs"] = [];
  const changedDirectNodes = stableUnique([...directNodes, ...structuralMembers].filter((nodeId) => changedGeometry.has(nodeId) || directNodes.has(nodeId)));
  for (const commitment of ledger.active) {
    if (directCommitmentIds.has(commitment.commitmentId) || continuityDependentCommitmentIds.has(commitment.commitmentId)) continue;
    for (const changedNodeId of changedDirectNodes) {
      if (changedNodeId === commitment.nodeId || hasAncestorRelationship(changedNodeId, commitment.nodeId, afterNodes)) continue;
      const changedBounds = spatialExposureBounds(changedNodeId, afterBounds.get(changedNodeId), afterNodes, afterHtmlIndex);
      const commitmentBounds = spatialExposureBounds(commitment.nodeId, commitment.boundsAfter, afterNodes, afterHtmlIndex);
      const area = intersectionArea(changedBounds, commitmentBounds);
      if (area <= 0) continue;
      spatiallyExposedCommitmentIds.add(commitment.commitmentId);
      spatialExposurePairs.push({
        changedNodeId,
        exposedCommitmentId: commitment.commitmentId,
        exposedNodeId: commitment.nodeId,
        intersectionArea: Math.round(area * 100) / 100,
      });
      dependencyPaths.push({ fromNodeId: changedNodeId, toNodeId: commitment.nodeId, reason: "spatial-intersection" });
      break;
    }
  }

  const classified = new Set([
    ...directCommitmentIds,
    ...continuityDependentCommitmentIds,
    ...spatiallyExposedCommitmentIds,
  ]);
  const unrelatedCommitmentIds = stableUnique(ledger.active
    .filter((commitment) => !classified.has(commitment.commitmentId))
    .map((commitment) => commitment.commitmentId));
  const everyActiveCommitmentClassifiedExactlyOnce = ledger.active.every((commitment) => {
    const count = [
      directCommitmentIds.has(commitment.commitmentId),
      continuityDependentCommitmentIds.has(commitment.commitmentId),
      spatiallyExposedCommitmentIds.has(commitment.commitmentId),
      unrelatedCommitmentIds.includes(commitment.commitmentId),
    ].filter(Boolean).length;
    return count === 1;
  });

  const warnings: string[] = [];
  if (scope.globalPresentationMutation) warnings.push("The current mutation contains a global CSS or runtime-module edit; node-level scope cannot fully represent its reach.");
  if (collateralGeometryFindings.length > 0) warnings.push(`${collateralGeometryFindings.length} pre-existing rendered node(s) changed geometry outside the current turn's explained composition.`);
  if (!everyActiveCommitmentClassifiedExactlyOnce) warnings.push("At least one active commitment was classified into zero or multiple affected-composition categories.");
  const missingPaths = [...continuityDependentCommitmentIds, ...spatiallyExposedCommitmentIds]
    .filter((commitmentId) => {
      const nodeId = ledger.active.find((commitment) => commitment.commitmentId === commitmentId)?.nodeId;
      return !nodeId || !dependencyPaths.some((path) => path.toNodeId === nodeId && path.fromNodeId);
    });
  if (missingPaths.length > 0) warnings.push(`Missing dependency paths for: ${missingPaths.join(", ")}`);

  return {
    schema: "northstar.cumulative-intent-audit.v1",
    mode: "audit-only",
    turn: input.turn,
    instruction: input.instruction,
    beforeRevisionId: input.beforePackage.revisionId,
    afterRevisionId: input.afterPackage.revisionId,
    mutationId: input.currentMutation.mutationId,
    activeCommitmentLedger: ledger.active,
    retiredCommitmentIds: ledger.retired,
    resolutionWarnings: ledger.resolutionWarnings,
    directEditScope: {
      ...scope,
      structuralMemberNodeIds: stableUnique(structuralMembers),
    },
    affectedComposition: {
      directCommitmentIds: stableUnique(directCommitmentIds),
      continuityDependentCommitmentIds: stableUnique(continuityDependentCommitmentIds),
      spatiallyExposedCommitmentIds: stableUnique(spatiallyExposedCommitmentIds),
      unrelatedCommitmentIds,
      continuityAnchorNodeIds: stableUnique(continuityAnchorNodeIds),
      geometryChangedNodeIds,
      collateralGeometryFindings,
      dependencyPaths: dependencyPaths
        .filter((path, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(path)) === index)
        .sort((a, b) => `${a.toNodeId}:${a.fromNodeId ?? ""}:${a.reason}`.localeCompare(`${b.toNodeId}:${b.fromNodeId ?? ""}:${b.reason}`)),
      spatialExposurePairs: spatialExposurePairs.sort((a, b) => `${a.changedNodeId}:${a.exposedNodeId}`.localeCompare(`${b.changedNodeId}:${b.exposedNodeId}`)),
    },
    classification: {
      activeCommitmentCount: ledger.active.length,
      directCommitmentCount: directCommitmentIds.size,
      continuityDependentCommitmentCount: continuityDependentCommitmentIds.size,
      spatiallyExposedCommitmentCount: spatiallyExposedCommitmentIds.size,
      unrelatedCommitmentCount: unrelatedCommitmentIds.length,
      structuralMemberCount: structuralMembers.size,
      everyActiveCommitmentClassifiedExactlyOnce,
      warnings,
    },
    executionInfluence: {
      modelInput: "none",
      modelResponse: "none",
      mutation: "none",
      browserRuntime: "none",
      commitDecision: "none",
    },
  };
}
