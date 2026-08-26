import type { CanvasV2NativeSceneDocument, CanvasV2NativeSceneNode } from "@/lib/canvas-v2/native-scene";
import type { CanvasV2InteractionRoute } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ElementBounds, CanvasV2RenderObservation } from "@/lib/canvas-v2/types";

export const CANVAS_V2_COMPOSITION_SNAPSHOT_SCHEMA = "canvas-v2.composition-snapshot.v1" as const;
export const CANVAS_V2_COMPOSITION_RECEIPT_SCHEMA = "canvas-v2.composition-receipt.v1" as const;
export const CANVAS_V2_COMPOSITION_SUITE_SCHEMA = "canvas-v2.composition-suite.v1" as const;

export type CanvasV2CompositionCaseCategory =
  | "decision-landscape"
  | "causal-system"
  | "sequence"
  | "journey"
  | "prioritization"
  | "comparison"
  | "brief"
  | "uncertainty"
  | "positioning"
  | "pricing"
  | "workshop"
  | "experiment"
  | "roadmap"
  | "operating-model"
  | "campaign"
  | "synthesis";

export type CanvasV2CompositionStartingState = "empty" | "populated" | "selection" | "human-modified";

export interface CanvasV2CompositionPromptFollowUp {
  id: string;
  title: string;
  prompt: string;
  factualExpectations?: CanvasV2CompositionPromptCase["factualExpectations"];
  reviewFocus: string[];
}

export interface CanvasV2CompositionPromptCase {
  id: string;
  title: string;
  category: CanvasV2CompositionCaseCategory;
  prompt: string;
  startingState: CanvasV2CompositionStartingState;
  evidenceMode: "none" | "account" | "provided";
  tags: string[];
  factualExpectations: {
    requiresEvidence?: boolean;
    requiresRelationships?: boolean;
    requiresWritableSurfaces?: boolean;
    requiresUserFacingSummary?: boolean;
    requiresNoVisibleRecovery?: boolean;
    requiresNarrativeProximity?: boolean;
    requiresHumanEditPreservation?: boolean;
    requiresSelectionPreservation?: boolean;
    forbidsEvidence?: boolean;
    forbidsResearch?: boolean;
    expectedInteractionRoute?: Extract<CanvasV2InteractionRoute, "transform" | "research-design" | "selection-transform">;
    requiresPriorObjectPreservation?: boolean;
    requiresRevisionAdvance?: boolean;
  };
  reviewFocus: string[];
  followUps?: CanvasV2CompositionPromptFollowUp[];
}

export interface CanvasV2CompositionSnapshotNode {
  id: string;
  parentId?: string;
  kind: string;
  selectable: boolean;
  writable?: boolean;
  hidden: boolean;
  locked: boolean;
  canonicalEvidence: boolean;
  designRegion: boolean;
  userEdited: boolean;
  origin: "user" | "northstar" | "research" | "imported" | "unknown";
  lastAuthor?: "user" | "northstar";
  editVersion: number;
  bounds: CanvasV2ElementBounds;
  textPreview?: string;
  evidenceId?: string;
  evidenceRole?: string;
  relationshipSourceNodeIds: string[];
  relationshipTargetNodeIds: string[];
  altText?: string;
}

export interface CanvasV2CompositionSnapshot {
  schema: typeof CANVAS_V2_COMPOSITION_SNAPSHOT_SCHEMA;
  caseId: string;
  prompt: string;
  revisionId: string;
  route: string;
  terminalStatus: string;
  capturedAt: string;
  canvasBounds: CanvasV2ElementBounds;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  nodes: CanvasV2CompositionSnapshotNode[];
  runtimeErrors: string[];
  missingEvidenceIds: string[];
  contentOverflowNodeIds: string[];
  interactionRoutes: CanvasV2InteractionRoute[];
  researchRequestCount: number;
  finalSummary?: string;
  visibleErrorCount: number;
  visibleRecoveryCount: number;
}

export type CanvasV2CompositionFindingSeverity = "blocking" | "error" | "review";

export interface CanvasV2CompositionFinding {
  code: string;
  severity: CanvasV2CompositionFindingSeverity;
  message: string;
  nodeIds?: string[];
}

export interface CanvasV2CompositionMetrics {
  objectCount: number;
  visibleObjectCount: number;
  selectableObjectCount: number;
  independentlyManipulableShare: number;
  hiddenObjectCount: number;
  lockedObjectCount: number;
  designRegionCount: number;
  evidenceObjectCount: number;
  relationshipObjectCount: number;
  attachedRelationshipCount: number;
  writableSurfaceCount: number;
  userEditedObjectCount: number;
  overlappingDesignRegionPairCount: number;
  maxConsecutiveDesignRegionGap: number;
  kindCounts: Record<string, number>;
  originCounts: Record<string, number>;
  lastAuthorCounts: Record<string, number>;
  duplicateNodeIds: string[];
  contentBounds?: CanvasV2ElementBounds;
  contentAreaShare: number;
  structuralFingerprint: string;
  semanticFingerprint: string;
}

export interface CanvasV2CompositionHumanReviewDimension {
  id: string;
  label: string;
  question: string;
}

export interface CanvasV2CompositionReceipt {
  schema: typeof CANVAS_V2_COMPOSITION_RECEIPT_SCHEMA;
  caseId: string;
  title: string;
  category: CanvasV2CompositionCaseCategory;
  prompt: string;
  revisionId: string;
  route: string;
  terminalStatus: string;
  capturedAt: string;
  structuralState: "verified" | "needs-attention" | "blocked";
  metrics: CanvasV2CompositionMetrics;
  findings: CanvasV2CompositionFinding[];
  humanReview: {
    status: "unreviewed";
    dimensions: CanvasV2CompositionHumanReviewDimension[];
    caseFocus: string[];
  };
}

export interface CanvasV2CompositionSuiteReceipt {
  schema: typeof CANVAS_V2_COMPOSITION_SUITE_SCHEMA;
  createdAt: string;
  receipts: CanvasV2CompositionReceipt[];
  crossCaseFindings: CanvasV2CompositionFinding[];
}

export const CANVAS_V2_COMPOSITION_HUMAN_REVIEW_DIMENSIONS: readonly CanvasV2CompositionHumanReviewDimension[] = [
  { id: "intent-fidelity", label: "Intent fidelity", question: "Does the composition answer the actual decision or discovery need in the prompt?" },
  { id: "reading-logic", label: "Reading logic", question: "Is the intended path through the ideas immediately understandable without explanation?" },
  { id: "hierarchy", label: "Hierarchy", question: "Do scale, position, contrast, and negative space establish the right priorities?" },
  { id: "legibility", label: "Legibility", question: "Can the important content be read and inspected comfortably at useful canvas zoom levels?" },
  { id: "specificity", label: "Creative specificity", question: "Does the visual language feel particular to this problem instead of like a recycled scaffold?" },
  { id: "evidence-reasoning", label: "Evidence reasoning", question: "Where evidence exists, is it visibly connected to the claims and interpretations it supports?" },
  { id: "decision-value", label: "Decision value", question: "Does the composition make a useful implication, tension, hypothesis, or next decision clearer?" },
  { id: "restraint", label: "Restraint", question: "Has Northstar used only the visual structure needed to strengthen the argument?" },
] as const;

function rounded(value: number, precision = 3): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function splitNodeIds(value?: string): string[] {
  return value?.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean) ?? [];
}

function inferOrigin(node: CanvasV2NativeSceneNode): CanvasV2CompositionSnapshotNode["origin"] {
  const origin = node.attributes["data-canvas-v2-origin"];
  if (origin === "user" || origin === "northstar" || origin === "research" || origin === "imported") return origin;
  if (node.canonicalEvidence || node.evidence) return "research";
  if (node.lastAuthor === "northstar") return "northstar";
  if (node.userEdited) return "user";
  return "unknown";
}

function absoluteBounds(node: CanvasV2NativeSceneNode, byId: ReadonlyMap<string, CanvasV2NativeSceneNode>): CanvasV2ElementBounds {
  let x = node.geometry.x;
  let y = node.geometry.y;
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.geometry.x;
    y += parent.geometry.y;
    parentId = parent.parentId;
  }
  return { nodeId: node.sourceNodeId ?? node.id, x, y, width: node.geometry.width, height: node.geometry.height };
}

/**
 * Convert the native scene and its exact browser observation into a portable
 * evaluation snapshot. This adapter is intentionally factual: it does not
 * infer taste, layout quality, or a preferred visual form.
 */
export function snapshotCanvasV2Composition(input: {
  promptCase: CanvasV2CompositionPromptCase;
  scene: CanvasV2NativeSceneDocument;
  observation?: CanvasV2RenderObservation;
  route?: string;
  terminalStatus?: string;
  capturedAt?: string;
}): CanvasV2CompositionSnapshot {
  const byId = new Map(input.scene.nodes.map((node) => [node.id, node]));
  const nodes = input.scene.nodes.flatMap((node): CanvasV2CompositionSnapshotNode[] => {
    if (!node.sourceNodeId) return [];
    return [{
      id: node.sourceNodeId,
      ...(node.parentId && byId.get(node.parentId)?.sourceNodeId ? { parentId: byId.get(node.parentId)!.sourceNodeId } : {}),
      kind: node.kind,
      selectable: node.selectable,
      writable: node.attributes["data-canvas-v2-writable"] === "true",
      hidden: node.hidden,
      locked: node.locked,
      canonicalEvidence: node.canonicalEvidence,
      designRegion: Object.hasOwn(node.attributes, "data-canvas-v2-design-region") || Boolean(node.attributes["data-canvas-v2-island-id"]),
      userEdited: node.userEdited,
      origin: inferOrigin(node),
      ...(node.lastAuthor ? { lastAuthor: node.lastAuthor } : {}),
      editVersion: node.editVersion,
      bounds: absoluteBounds(node, byId),
      ...(node.directText?.trim() ? { textPreview: node.directText.trim().slice(0, 500) } : {}),
      ...(node.evidence?.id ? { evidenceId: node.evidence.id } : {}),
      ...(node.evidence?.role ? { evidenceRole: node.evidence.role } : {}),
      relationshipSourceNodeIds: splitNodeIds(node.attributes["data-canvas-v2-relationship-source"]),
      relationshipTargetNodeIds: splitNodeIds(node.attributes["data-canvas-v2-relationship-target"]),
      ...(node.tagName === "img" && Object.hasOwn(node.attributes, "alt") ? { altText: node.attributes.alt } : {}),
    }];
  });
  return {
    schema: CANVAS_V2_COMPOSITION_SNAPSHOT_SCHEMA,
    caseId: input.promptCase.id,
    prompt: input.promptCase.prompt,
    revisionId: input.scene.revisionId,
    route: input.route ?? "native-scene",
    terminalStatus: input.terminalStatus ?? "completed",
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    canvasBounds: { x: 0, y: 0, width: input.scene.width, height: input.scene.height },
    viewport: input.observation?.viewport ?? { width: input.scene.width, height: input.scene.height, deviceScaleFactor: 1 },
    nodes,
    runtimeErrors: input.observation?.runtimeErrors.map((error) => error.message) ?? [],
    missingEvidenceIds: input.observation?.missingEvidenceIds ?? [],
    contentOverflowNodeIds: input.observation?.spatial.contentOverflowNodeIds ?? [],
    interactionRoutes: [],
    researchRequestCount: 0,
    visibleErrorCount: 0,
    visibleRecoveryCount: 0,
  };
}

export function canvasV2CompositionPromptSteps(promptCase: CanvasV2CompositionPromptCase): CanvasV2CompositionPromptCase[] {
  const { followUps = [], ...opening } = promptCase;
  return [
    opening,
    ...followUps.map((followUp) => ({
      ...opening,
      id: `${opening.id}--${followUp.id}`,
      title: `${opening.title} · ${followUp.title}`,
      prompt: followUp.prompt,
      startingState: "populated" as const,
      factualExpectations: { ...opening.factualExpectations, ...(followUp.factualExpectations ?? {}) },
      reviewFocus: followUp.reviewFocus,
      tags: [...opening.tags, "follow-up"],
    })),
  ];
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
}

function unionBounds(nodes: readonly CanvasV2CompositionSnapshotNode[]): CanvasV2ElementBounds | undefined {
  if (!nodes.length) return undefined;
  const left = Math.min(...nodes.map((node) => node.bounds.x));
  const top = Math.min(...nodes.map((node) => node.bounds.y));
  const right = Math.max(...nodes.map((node) => node.bounds.x + node.bounds.width));
  const bottom = Math.max(...nodes.map((node) => node.bounds.y + node.bounds.height));
  return { x: rounded(left), y: rounded(top), width: rounded(right - left), height: rounded(bottom - top) };
}

function rectangleGap(left: CanvasV2ElementBounds, right: CanvasV2ElementBounds): number {
  const gapX = Math.max(0, left.x - (right.x + right.width), right.x - (left.x + left.width));
  const gapY = Math.max(0, left.y - (right.y + right.height), right.y - (left.y + left.height));
  return Math.hypot(gapX, gapY);
}

function positiveIntersection(left: CanvasV2ElementBounds, right: CanvasV2ElementBounds): boolean {
  return Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > 1
    && Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) > 1;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function geometrySignature(node: CanvasV2CompositionSnapshotNode, canvas: CanvasV2ElementBounds): string {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  return [
    node.kind,
    rounded((node.bounds.x - canvas.x) / width, 2),
    rounded((node.bounds.y - canvas.y) / height, 2),
    rounded(node.bounds.width / width, 2),
    rounded(node.bounds.height / height, 2),
    node.designRegion ? "region" : "object",
  ].join(":");
}

function finding(input: CanvasV2CompositionFinding): CanvasV2CompositionFinding {
  return input;
}

export function evaluateCanvasV2Composition(
  promptCase: CanvasV2CompositionPromptCase,
  snapshot: CanvasV2CompositionSnapshot,
  context: { previousSnapshot?: CanvasV2CompositionSnapshot } = {},
): CanvasV2CompositionReceipt {
  const objects = snapshot.nodes.filter((node) => node.kind !== "root");
  const visibleObjects = objects.filter((node) => !node.hidden && node.bounds.width > 0 && node.bounds.height > 0);
  const selectableObjects = visibleObjects.filter((node) => node.selectable);
  const idCounts = countBy(objects.map((node) => node.id));
  const duplicateNodeIds = Object.entries(idCounts).filter(([, count]) => count > 1).map(([id]) => id);
  const idSet = new Set(snapshot.nodes.map((node) => node.id));
  const relationships = objects.filter((node) => node.relationshipSourceNodeIds.length || node.relationshipTargetNodeIds.length || node.kind === "connector");
  const attachedRelationships = relationships.filter((node) => node.relationshipSourceNodeIds.length > 0
    && node.relationshipTargetNodeIds.length > 0
    && [...node.relationshipSourceNodeIds, ...node.relationshipTargetNodeIds].every((id) => idSet.has(id)));
  const detachedRelationships = relationships.filter((node) => !attachedRelationships.includes(node));
  const outsideCanvas = visibleObjects.filter((node) => node.bounds.x < snapshot.canvasBounds.x - 1
    || node.bounds.y < snapshot.canvasBounds.y - 1
    || node.bounds.x + node.bounds.width > snapshot.canvasBounds.x + snapshot.canvasBounds.width + 1
    || node.bounds.y + node.bounds.height > snapshot.canvasBounds.y + snapshot.canvasBounds.height + 1);
  const nonselectable = visibleObjects.filter((node) => !node.selectable);
  const imagesWithoutAlt = visibleObjects.filter((node) => node.kind === "image" && node.altText === undefined);
  const contentBounds = unionBounds(visibleObjects);
  const designRegions = visibleObjects.filter((node) => node.designRegion);
  const overlappingDesignRegionPairs = designRegions.flatMap((region, index) => designRegions
    .slice(index + 1)
    .filter((candidate) => positiveIntersection(region.bounds, candidate.bounds))
    .map((candidate) => [region.id, candidate.id] as const));
  const consecutiveDesignRegionGaps = designRegions.slice(1).map((region, index) => rectangleGap(designRegions[index].bounds, region.bounds));
  const maxConsecutiveDesignRegionGap = consecutiveDesignRegionGaps.length ? Math.max(...consecutiveDesignRegionGaps) : 0;
  const canvasArea = Math.max(1, snapshot.canvasBounds.width * snapshot.canvasBounds.height);
  const structuralFingerprint = stableHash(JSON.stringify({
    kinds: countBy(visibleObjects.map((node) => node.kind)),
    origins: countBy(visibleObjects.map((node) => node.origin)),
    regions: visibleObjects.filter((node) => node.designRegion).length,
    relationships: relationships.length,
    geometry: visibleObjects.filter((node) => !node.parentId).map((node) => geometrySignature(node, snapshot.canvasBounds)).sort(),
  }));
  const semanticFingerprint = stableHash(JSON.stringify(visibleObjects
    .map((node) => `${node.kind}:${node.textPreview?.replace(/\s+/g, " ").trim().toLowerCase() ?? ""}`)
    .filter((value) => !value.endsWith(":"))
    .sort()));

  const findings: CanvasV2CompositionFinding[] = [];
  if (snapshot.terminalStatus !== "completed") findings.push(finding({ code: "non-terminal-completion", severity: "blocking", message: `The evaluated turn ended with status ${snapshot.terminalStatus}, not completed.` }));
  if (!visibleObjects.length) findings.push(finding({ code: "empty-composition", severity: "blocking", message: "The completed turn produced no visible native objects." }));
  if (duplicateNodeIds.length) findings.push(finding({ code: "duplicate-stable-ids", severity: "blocking", message: "Multiple native objects share a stable node identity.", nodeIds: duplicateNodeIds }));
  if (snapshot.runtimeErrors.length) findings.push(finding({ code: "runtime-errors", severity: "blocking", message: `${snapshot.runtimeErrors.length} runtime error(s) occurred while rendering the composition.` }));
  if (snapshot.visibleErrorCount) findings.push(finding({ code: "visible-turn-errors", severity: "blocking", message: `${snapshot.visibleErrorCount} user-visible turn error surface(s) remained in the completed conversation.` }));
  if (snapshot.visibleRecoveryCount) findings.push(finding({ code: "visible-recovery-boundaries", severity: "blocking", message: `${snapshot.visibleRecoveryCount} user-visible recovery surface(s) remained in the completed conversation.` }));
  if (nonselectable.length) findings.push(finding({ code: "nonselectable-authored-objects", severity: "error", message: "Visible authored objects are not independently selectable.", nodeIds: nonselectable.map((node) => node.id) }));
  if (outsideCanvas.length) findings.push(finding({ code: "objects-outside-canvas", severity: "error", message: "Visible objects extend beyond the finite native canvas.", nodeIds: outsideCanvas.map((node) => node.id) }));
  if (snapshot.contentOverflowNodeIds.length) findings.push(finding({ code: "content-overflow", severity: "error", message: "The exact render observation reported clipped or overflowing content.", nodeIds: snapshot.contentOverflowNodeIds }));
  if (detachedRelationships.length) findings.push(finding({ code: "detached-relationships", severity: "error", message: "Relationship objects do not resolve both declared endpoints.", nodeIds: detachedRelationships.map((node) => node.id) }));
  if (overlappingDesignRegionPairs.length) findings.push(finding({ code: "overlapping-design-regions", severity: "error", message: "Independently authored narrative regions visibly overlap.", nodeIds: Array.from(new Set(overlappingDesignRegionPairs.flat())) }));
  if (imagesWithoutAlt.length) findings.push(finding({ code: "image-alt-metadata-missing", severity: "error", message: "Visible images are missing explicit alt metadata.", nodeIds: imagesWithoutAlt.map((node) => node.id) }));
  if (snapshot.missingEvidenceIds.length) findings.push(finding({ code: "missing-evidence", severity: "error", message: "The render observation could not resolve required evidence.", nodeIds: snapshot.missingEvidenceIds }));
  if (promptCase.factualExpectations.requiresEvidence && !visibleObjects.some((node) => node.canonicalEvidence || node.evidenceId)) findings.push(finding({ code: "requested-evidence-absent", severity: "error", message: "The prompt explicitly requires evidence, but no visible evidence object was observed." }));
  if (promptCase.factualExpectations.requiresRelationships && !relationships.length) findings.push(finding({ code: "requested-relationships-absent", severity: "error", message: "The prompt explicitly requires relationships, but no native relationship object was observed." }));
  if (promptCase.factualExpectations.requiresWritableSurfaces && !visibleObjects.some((node) => node.writable)) findings.push(finding({ code: "requested-writable-surfaces-absent", severity: "error", message: "The prompt explicitly requires a participatory writing surface, but no visible native writable object was observed." }));
  const completionSummary = snapshot.finalSummary?.trim() ?? "";
  const internalSummaryJargon = /\b(?:openRequirements|contentOverflowNodeIds|render-safe|compiler-owned|lifecycle|maturity state|provider attempts?|render repairs?|corrective attempts?|revision-[a-z0-9-]+|all islands? (?:is|are|remain|resolved)|unresolved islands?)\b/i;
  if (promptCase.factualExpectations.requiresUserFacingSummary && !completionSummary) findings.push(finding({ code: "user-summary-missing", severity: "error", message: "The completed composition did not provide a user-facing summary." }));
  if (promptCase.factualExpectations.requiresUserFacingSummary && internalSummaryJargon.test(completionSummary)) findings.push(finding({ code: "user-summary-internal-jargon", severity: "error", message: "The completion response exposes internal composition diagnostics instead of summarizing the result for the user." }));
  if (promptCase.factualExpectations.requiresNoVisibleRecovery && (snapshot.visibleErrorCount || snapshot.visibleRecoveryCount)) findings.push(finding({ code: "clean-completion-unproven", severity: "blocking", message: "This acceptance case requires a clean completion without a visible error or recovery boundary." }));
  if (promptCase.factualExpectations.requiresNarrativeProximity && maxConsecutiveDesignRegionGap > 1_200) findings.push(finding({ code: "narrative-regions-too-distant", severity: "error", message: `Consecutive narrative regions are separated by up to ${Math.round(maxConsecutiveDesignRegionGap)}px; the user should not need to hunt across the canvas to follow one ordinary composition.` }));
  if (promptCase.factualExpectations.requiresHumanEditPreservation && !objects.some((node) => node.userEdited)) findings.push(finding({ code: "human-edit-preservation-unproven", severity: "error", message: "This case requires preserved human work, but the resulting scene records no user-edited object." }));
  if (promptCase.factualExpectations.forbidsEvidence && visibleObjects.some((node) => node.canonicalEvidence || node.evidenceId)) findings.push(finding({ code: "unrequested-evidence", severity: "error", message: "This prompt should be answerable directly, but the composition introduced account evidence that the user did not request." }));
  if (promptCase.factualExpectations.forbidsResearch && snapshot.researchRequestCount > 0) findings.push(finding({ code: "unrequested-research", severity: "error", message: "This prompt should be answered from the user's request, but the run invoked the account-research boundary." }));
  const expectedInteractionRoute = promptCase.factualExpectations.expectedInteractionRoute;
  if (expectedInteractionRoute && !snapshot.interactionRoutes.includes(expectedInteractionRoute)) findings.push(finding({ code: "unexpected-interaction-route", severity: "error", message: `The prompt expected ${expectedInteractionRoute}, but observed routes were ${snapshot.interactionRoutes.join(", ") || "none"}.` }));
  if (promptCase.factualExpectations.requiresRevisionAdvance && context.previousSnapshot?.revisionId === snapshot.revisionId) findings.push(finding({ code: "follow-up-did-not-advance", severity: "error", message: "The requested follow-up completed without committing a new canvas revision." }));
  if (promptCase.factualExpectations.requiresPriorObjectPreservation && context.previousSnapshot) {
    const priorVisibleIds = context.previousSnapshot.nodes.filter((node) => node.kind !== "root" && !node.hidden && node.bounds.width > 0 && node.bounds.height > 0).map((node) => node.id);
    const currentIds = new Set(snapshot.nodes.map((node) => node.id));
    const missingPriorIds = priorVisibleIds.filter((id) => !currentIds.has(id));
    if (missingPriorIds.length) findings.push(finding({ code: "follow-up-replaced-prior-work", severity: "error", message: "A follow-up that promised to preserve the existing composition removed prior native objects.", nodeIds: missingPriorIds }));
  }
  if (contentBounds && !promptCase.tags.includes("large-canvas") && (
    contentBounds.width / Math.max(1, snapshot.canvasBounds.width) > 0.5
    || contentBounds.height / Math.max(1, snapshot.canvasBounds.height) > 0.5
  )) findings.push(finding({
    code: "unexpected-authored-surface-span",
    severity: "review",
    message: "A prompt without large-canvas intent spans more than half of a canvas axis. Review the screenshot for fragmented or accidentally separated regions.",
  }));

  const metrics: CanvasV2CompositionMetrics = {
    objectCount: objects.length,
    visibleObjectCount: visibleObjects.length,
    selectableObjectCount: selectableObjects.length,
    independentlyManipulableShare: visibleObjects.length ? rounded(selectableObjects.length / visibleObjects.length) : 0,
    hiddenObjectCount: objects.filter((node) => node.hidden).length,
    lockedObjectCount: objects.filter((node) => node.locked).length,
    designRegionCount: visibleObjects.filter((node) => node.designRegion).length,
    evidenceObjectCount: visibleObjects.filter((node) => node.canonicalEvidence || node.evidenceId).length,
    relationshipObjectCount: relationships.length,
    attachedRelationshipCount: attachedRelationships.length,
    writableSurfaceCount: visibleObjects.filter((node) => node.writable).length,
    userEditedObjectCount: objects.filter((node) => node.userEdited).length,
    overlappingDesignRegionPairCount: overlappingDesignRegionPairs.length,
    maxConsecutiveDesignRegionGap: rounded(maxConsecutiveDesignRegionGap),
    kindCounts: countBy(visibleObjects.map((node) => node.kind)),
    originCounts: countBy(visibleObjects.map((node) => node.origin)),
    lastAuthorCounts: countBy(visibleObjects.map((node) => node.lastAuthor ?? "unknown")),
    duplicateNodeIds,
    ...(contentBounds ? { contentBounds } : {}),
    contentAreaShare: contentBounds ? rounded((contentBounds.width * contentBounds.height) / canvasArea) : 0,
    structuralFingerprint,
    semanticFingerprint,
  };
  const structuralState = findings.some((item) => item.severity === "blocking")
    ? "blocked" as const
    : findings.some((item) => item.severity === "error") ? "needs-attention" as const : "verified" as const;
  return {
    schema: CANVAS_V2_COMPOSITION_RECEIPT_SCHEMA,
    caseId: promptCase.id,
    title: promptCase.title,
    category: promptCase.category,
    prompt: promptCase.prompt,
    revisionId: snapshot.revisionId,
    route: snapshot.route,
    terminalStatus: snapshot.terminalStatus,
    capturedAt: snapshot.capturedAt,
    structuralState,
    metrics,
    findings,
    humanReview: {
      status: "unreviewed",
      dimensions: [...CANVAS_V2_COMPOSITION_HUMAN_REVIEW_DIMENSIONS],
      caseFocus: [...promptCase.reviewFocus],
    },
  };
}

export function buildCanvasV2CompositionSuiteReceipt(
  receipts: readonly CanvasV2CompositionReceipt[],
  createdAt = new Date().toISOString(),
): CanvasV2CompositionSuiteReceipt {
  const crossCaseFindings: CanvasV2CompositionFinding[] = [];
  const byStructuralFingerprint = new Map<string, CanvasV2CompositionReceipt[]>();
  const bySemanticFingerprint = new Map<string, CanvasV2CompositionReceipt[]>();
  for (const receipt of receipts) {
    byStructuralFingerprint.set(receipt.metrics.structuralFingerprint, [...(byStructuralFingerprint.get(receipt.metrics.structuralFingerprint) ?? []), receipt]);
    bySemanticFingerprint.set(receipt.metrics.semanticFingerprint, [...(bySemanticFingerprint.get(receipt.metrics.semanticFingerprint) ?? []), receipt]);
  }
  for (const repeated of byStructuralFingerprint.values()) {
    if (new Set(repeated.map((receipt) => receipt.category)).size < 2) continue;
    crossCaseFindings.push({
      code: "repeated-structure-across-distinct-prompts",
      severity: "review",
      message: `Distinct prompt categories produced the same structural fingerprint: ${repeated.map((receipt) => receipt.caseId).join(", ")}. Review for recycled composition logic.`,
    });
  }
  for (const repeated of bySemanticFingerprint.values()) {
    if (new Set(repeated.map((receipt) => receipt.caseId)).size < 2 || repeated[0]?.metrics.semanticFingerprint === stableHash("[]")) continue;
    crossCaseFindings.push({
      code: "repeated-content-across-distinct-prompts",
      severity: "review",
      message: `Distinct prompts produced the same visible content fingerprint: ${repeated.map((receipt) => receipt.caseId).join(", ")}. Review prompt fidelity.`,
    });
  }
  return { schema: CANVAS_V2_COMPOSITION_SUITE_SCHEMA, createdAt, receipts: [...receipts], crossCaseFindings };
}

export function renderCanvasV2CompositionReviewMarkdown(
  suite: CanvasV2CompositionSuiteReceipt,
  screenshotByCaseId: Readonly<Record<string, string>> = {},
): string {
  const lines = [
    "# Northstar Canvas composition review",
    "",
    `Generated: ${suite.createdAt}`,
    "",
    "Structural receipts below are factual runtime checks. The qualitative review is intentionally human, unscored, and composition-specific.",
    "",
  ];
  if (suite.crossCaseFindings.length) {
    lines.push("## Cross-case review signals", "");
    for (const item of suite.crossCaseFindings) lines.push(`- [ ] ${item.message}`);
    lines.push("");
  }
  for (const receipt of suite.receipts) {
    lines.push(`## ${receipt.title}`, "", `Prompt: ${receipt.prompt}`, "", `Structural state: **${receipt.structuralState}** · ${receipt.metrics.visibleObjectCount} visible objects · ${receipt.metrics.independentlyManipulableShare * 100}% independently selectable`, "");
    const screenshot = screenshotByCaseId[receipt.caseId];
    if (screenshot) lines.push(`Screenshot: [open artifact](${screenshot})`, "");
    if (receipt.findings.length) {
      lines.push("Structural findings:", "");
      for (const item of receipt.findings) lines.push(`- ${item.severity.toUpperCase()} · ${item.message}`);
      lines.push("");
    }
    lines.push("Human review:", "");
    for (const dimension of receipt.humanReview.dimensions) lines.push(`- [ ] **${dimension.label}:** ${dimension.question}`, "  Notes:");
    for (const focus of receipt.humanReview.caseFocus) lines.push(`- [ ] **Case focus:** ${focus}`, "  Notes:");
    lines.push("", "Decision: [ ] Ready  [ ] Revise  [ ] Rerun", "", "Reviewer notes:", "", "---", "");
  }
  return lines.join("\n");
}
