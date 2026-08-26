import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import {
  canvasV2NativeSceneAbsoluteBounds,
  type CanvasV2NativeSceneDocument,
  type CanvasV2NativeSceneNode,
} from "@/lib/canvas-v2/native-scene";
import type { CanvasV2ElementBounds } from "@/lib/canvas-v2/types";
import type { CanvasV2WorkspaceViewport } from "@/lib/canvas-v2/workspace-coordinate-space";

export const CANVAS_V2_WORKING_CONTEXT_SCHEMA = "canvas-v2.working-context.v1" as const;

export type CanvasV2SelectionPolicy = "none" | "modify" | "reference";
export type CanvasV2ObjectOrigin = "user" | "northstar" | "research" | "imported";

export interface CanvasV2WorkingObject {
  nodeId: string;
  parentNodeId?: string;
  kind: string;
  origin: CanvasV2ObjectOrigin;
  lastAuthor?: "user" | "northstar";
  userEdited: boolean;
  editVersion: number;
  locked: boolean;
  hidden: boolean;
  canonicalEvidence: boolean;
  bounds: CanvasV2ElementBounds;
  textPreview?: string;
  evidenceId?: string;
}

export interface CanvasV2WorkingRelationship {
  nodeId: string;
  sourceNodeIds: string[];
  targetNodeIds: string[];
}

/**
 * Exact browser-owned state captured when a person submits a Northstar turn.
 * The camera remains a read-only input: this context never authorizes AI code
 * to pan, zoom, select, unlock, reveal, or otherwise take over the workspace.
 */
export interface CanvasV2WorkingContext {
  schema: typeof CANVAS_V2_WORKING_CONTEXT_SCHEMA;
  scope: "selection" | "viewport";
  selectionPolicy: CanvasV2SelectionPolicy;
  selectedNodeIds: string[];
  selectedBounds?: CanvasV2ElementBounds;
  visibleBounds: CanvasV2ElementBounds;
  viewportScale: number;
  visibleNodeIds: string[];
  nearbyNodeIds: string[];
  editableNodeIds: string[];
  protectedNodeIds: string[];
  objects: CanvasV2WorkingObject[];
  relationships: CanvasV2WorkingRelationship[];
}

const ORIGINS = new Set<CanvasV2ObjectOrigin>(["user", "northstar", "research", "imported"]);

function boundedNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function bounds(value: unknown): CanvasV2ElementBounds | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const x = boundedNumber(source.x, Number.NaN);
  const y = boundedNumber(source.y, Number.NaN);
  const width = boundedNumber(source.width, Number.NaN);
  const height = boundedNumber(source.height, Number.NaN);
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) return undefined;
  return {
    ...(typeof source.nodeId === "string" && source.nodeId.trim() ? { nodeId: source.nodeId.trim().slice(0, 240) } : {}),
    x,
    y,
    width,
    height,
  };
}

function identityList(value: unknown, maximum = 240): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 240)] : []))).slice(0, maximum);
}

function intersects(left: CanvasV2ElementBounds, right: CanvasV2ElementBounds, margin = 0): boolean {
  return left.x - margin < right.x + right.width
    && left.x + left.width + margin > right.x
    && left.y - margin < right.y + right.height
    && left.y + left.height + margin > right.y;
}

function union(input: readonly CanvasV2ElementBounds[]): CanvasV2ElementBounds | undefined {
  if (!input.length) return undefined;
  const x = Math.min(...input.map((item) => item.x));
  const y = Math.min(...input.map((item) => item.y));
  const right = Math.max(...input.map((item) => item.x + item.width));
  const bottom = Math.max(...input.map((item) => item.y + item.height));
  return { x, y, width: right - x, height: bottom - y };
}

function relationshipIds(value: string | undefined): string[] {
  return Array.from(new Set((value ?? "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 40);
}

export function canvasV2ObjectOrigin(node: CanvasV2NativeSceneNode): CanvasV2ObjectOrigin {
  const declared = node.attributes["data-canvas-v2-origin"] as CanvasV2ObjectOrigin | undefined;
  if (declared && ORIGINS.has(declared)) return declared;
  if (node.canonicalEvidence || node.evidence || node.attributes["data-canvas-v2-evidence-id"]) return "research";
  const editKinds = new Set((node.attributes["data-canvas-v2-user-edited"] ?? "").split(/\s+/).filter(Boolean));
  if (editKinds.has("create") || editKinds.has("group")) return "user";
  if (node.lastAuthor === "northstar" || node.attributes["data-canvas-v2-island-id"] || node.attributes["data-canvas-v2-design-region"] !== undefined) return "northstar";
  return node.lastAuthor === "user" ? "imported" : "imported";
}

function textPreview(node: CanvasV2NativeSceneNode, byId: ReadonlyMap<string, CanvasV2NativeSceneNode>): string | undefined {
  const values: string[] = [];
  const visit = (candidate: CanvasV2NativeSceneNode, seen: Set<string>) => {
    if (seen.has(candidate.id) || values.join(" ").length >= 240) return;
    seen.add(candidate.id);
    for (const item of candidate.content) {
      if (item.kind === "text") values.push(item.value);
      else {
        const child = byId.get(item.id);
        if (child) visit(child, seen);
      }
    }
  };
  visit(node, new Set());
  const value = values.join(" ").replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 240) : undefined;
}

export function buildCanvasV2WorkingContext(input: {
  scene?: CanvasV2NativeSceneDocument;
  selections: readonly CanvasV2InspectableElement[];
  visibleBounds: CanvasV2ElementBounds;
  viewport: CanvasV2WorkspaceViewport;
  selectionPolicy: CanvasV2SelectionPolicy;
}): CanvasV2WorkingContext | undefined {
  if (!input.scene) return undefined;
  const byId = new Map(input.scene.nodes.map((node) => [node.id, node]));
  const selectedNodeIds = Array.from(new Set(input.selections.map((item) => item.nodeId))).slice(0, 80);
  const selectedSet = new Set(selectedNodeIds);
  const objects = input.scene.nodes.flatMap<CanvasV2WorkingObject>((node) => {
    const nodeId = node.sourceNodeId;
    if (!nodeId || node.kind === "root") return [];
    const absolute = canvasV2NativeSceneAbsoluteBounds(input.scene!, nodeId);
    if (!absolute) return [];
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    return [{
      nodeId,
      ...(parent?.sourceNodeId ? { parentNodeId: parent.sourceNodeId } : {}),
      kind: node.kind,
      origin: canvasV2ObjectOrigin(node),
      ...(node.lastAuthor ? { lastAuthor: node.lastAuthor } : {}),
      userEdited: node.userEdited,
      editVersion: node.editVersion,
      locked: node.locked,
      hidden: node.hidden,
      canonicalEvidence: node.canonicalEvidence,
      bounds: absolute,
      ...(textPreview(node, byId) ? { textPreview: textPreview(node, byId) } : {}),
      ...(node.evidence?.id || node.attributes["data-canvas-v2-evidence-id"]
        ? { evidenceId: node.evidence?.id ?? node.attributes["data-canvas-v2-evidence-id"] }
        : {}),
    }];
  });
  const objectById = new Map(objects.map((object) => [object.nodeId, object]));
  const selectedBounds = union(selectedNodeIds.flatMap((nodeId) => objectById.get(nodeId)?.bounds ?? []));
  const visibleNodeIds = objects.filter((object) => !object.hidden && intersects(object.bounds, input.visibleBounds)).map((object) => object.nodeId);
  const nearbyAnchor = selectedBounds ?? input.visibleBounds;
  const nearbyNodeIds = objects.filter((object) => !object.hidden && intersects(object.bounds, nearbyAnchor, 480)).map((object) => object.nodeId);
  const editableNodeIds = input.selectionPolicy === "modify"
    ? selectedNodeIds.filter((nodeId) => {
        const object = objectById.get(nodeId);
        return Boolean(object && !object.locked && !object.hidden);
      })
    : [];
  const editableSet = new Set(editableNodeIds);
  const protectedNodeIds = objects.filter((object) => (
    object.locked
    || object.hidden
    || (object.userEdited && !editableSet.has(object.nodeId))
  )).map((object) => object.nodeId);
  const includedIds = new Set([...selectedNodeIds, ...visibleNodeIds, ...nearbyNodeIds, ...protectedNodeIds]);
  const prioritizedObjects = objects
    .filter((object) => includedIds.has(object.nodeId))
    .sort((left, right) => (
      Number(selectedSet.has(right.nodeId)) - Number(selectedSet.has(left.nodeId))
      || Number(right.userEdited || right.locked || right.hidden) - Number(left.userEdited || left.locked || left.hidden)
      || left.bounds.y - right.bounds.y
      || left.bounds.x - right.bounds.x
    ))
    .slice(0, 240);
  const relationships = input.scene.nodes.flatMap<CanvasV2WorkingRelationship>((node) => {
    if (!node.sourceNodeId) return [];
    const sourceNodeIds = relationshipIds(node.attributes["data-canvas-v2-relationship-source"]);
    const targetNodeIds = relationshipIds(node.attributes["data-canvas-v2-relationship-target"]);
    return sourceNodeIds.length || targetNodeIds.length ? [{ nodeId: node.sourceNodeId, sourceNodeIds, targetNodeIds }] : [];
  }).filter((relationship) => (
    includedIds.has(relationship.nodeId)
    || relationship.sourceNodeIds.some((nodeId) => includedIds.has(nodeId))
    || relationship.targetNodeIds.some((nodeId) => includedIds.has(nodeId))
  )).slice(0, 80);
  return {
    schema: CANVAS_V2_WORKING_CONTEXT_SCHEMA,
    scope: selectedNodeIds.length && input.selectionPolicy !== "none" ? "selection" : "viewport",
    selectionPolicy: selectedNodeIds.length ? input.selectionPolicy : "none",
    selectedNodeIds,
    ...(selectedBounds ? { selectedBounds } : {}),
    visibleBounds: { ...input.visibleBounds },
    viewportScale: input.viewport.scale,
    visibleNodeIds: visibleNodeIds.slice(0, 240),
    nearbyNodeIds: nearbyNodeIds.slice(0, 240),
    editableNodeIds,
    protectedNodeIds: protectedNodeIds.slice(0, 240),
    objects: prioritizedObjects,
    relationships,
  };
}

export function parseCanvasV2WorkingContext(value: unknown): CanvasV2WorkingContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (source.schema !== CANVAS_V2_WORKING_CONTEXT_SCHEMA) return undefined;
  const visibleBounds = bounds(source.visibleBounds);
  if (!visibleBounds) return undefined;
  const selectionPolicy: CanvasV2SelectionPolicy = source.selectionPolicy === "modify" || source.selectionPolicy === "reference" ? source.selectionPolicy : "none";
  const selectedNodeIds = identityList(source.selectedNodeIds, 80);
  const selectedSet = new Set(selectedNodeIds);
  const protectedNodeIds = identityList(source.protectedNodeIds);
  const protectedSet = new Set(protectedNodeIds);
  const objects = Array.isArray(source.objects) ? source.objects.slice(0, 240).flatMap<CanvasV2WorkingObject>((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const object = entry as Record<string, unknown>;
    const nodeId = typeof object.nodeId === "string" ? object.nodeId.trim().slice(0, 240) : "";
    const objectBounds = bounds(object.bounds);
    if (!nodeId || !objectBounds) return [];
    const origin = typeof object.origin === "string" && ORIGINS.has(object.origin as CanvasV2ObjectOrigin)
      ? object.origin as CanvasV2ObjectOrigin
      : "imported";
    return [{
      nodeId,
      ...(typeof object.parentNodeId === "string" && object.parentNodeId.trim() ? { parentNodeId: object.parentNodeId.trim().slice(0, 240) } : {}),
      kind: typeof object.kind === "string" ? object.kind.slice(0, 40) : "object",
      origin,
      ...(object.lastAuthor === "user" || object.lastAuthor === "northstar" ? { lastAuthor: object.lastAuthor } : {}),
      userEdited: object.userEdited === true,
      editVersion: Math.max(0, Math.floor(boundedNumber(object.editVersion))),
      locked: object.locked === true,
      hidden: object.hidden === true,
      canonicalEvidence: object.canonicalEvidence === true,
      bounds: objectBounds,
      ...(typeof object.textPreview === "string" && object.textPreview.trim() ? { textPreview: object.textPreview.trim().slice(0, 240) } : {}),
      ...(typeof object.evidenceId === "string" && object.evidenceId.trim() ? { evidenceId: object.evidenceId.trim().slice(0, 512) } : {}),
    }];
  }) : [];
  const relationships = Array.isArray(source.relationships) ? source.relationships.slice(0, 80).flatMap<CanvasV2WorkingRelationship>((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const relationship = entry as Record<string, unknown>;
    const nodeId = typeof relationship.nodeId === "string" ? relationship.nodeId.trim().slice(0, 240) : "";
    return nodeId ? [{ nodeId, sourceNodeIds: identityList(relationship.sourceNodeIds, 40), targetNodeIds: identityList(relationship.targetNodeIds, 40) }] : [];
  }) : [];
  return {
    schema: CANVAS_V2_WORKING_CONTEXT_SCHEMA,
    scope: source.scope === "selection" && selectedNodeIds.length ? "selection" : "viewport",
    selectionPolicy: selectedNodeIds.length ? selectionPolicy : "none",
    selectedNodeIds,
    ...(bounds(source.selectedBounds) ? { selectedBounds: bounds(source.selectedBounds) } : {}),
    visibleBounds,
    viewportScale: Math.max(0.01, Math.min(8, boundedNumber(source.viewportScale, 1))),
    visibleNodeIds: identityList(source.visibleNodeIds),
    nearbyNodeIds: identityList(source.nearbyNodeIds),
    editableNodeIds: selectionPolicy === "modify" ? identityList(source.editableNodeIds, 80).filter((nodeId) => selectedSet.has(nodeId) && !protectedSet.has(nodeId)) : [],
    protectedNodeIds,
    objects,
    relationships,
  };
}
