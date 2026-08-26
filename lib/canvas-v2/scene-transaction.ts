import type { CanvasV2ArtifactDocument, CanvasV2IslandExecutionContract } from "@/lib/canvas-v2/types";
import type { CanvasV2ObjectOrigin, CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";

export const CANVAS_V2_SCENE_TRANSACTION_SCHEMA = "canvas-v2.scene-transaction.v1" as const;

export type CanvasV2SceneMutationKind = "create" | "update" | "remove" | "preserve";

export interface CanvasV2SceneMutation {
  kind: CanvasV2SceneMutationKind;
  nodeId: string;
  parentNodeId?: string;
  tagName?: string;
  userEdited: boolean;
  islandId?: string;
  visualRole?: string;
  evidenceId?: string;
  origin?: CanvasV2ObjectOrigin;
  lastAuthor?: "user" | "northstar";
  editVersion?: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface CanvasV2SceneTransaction {
  schema: typeof CANVAS_V2_SCENE_TRANSACTION_SCHEMA;
  origin: "northstar" | "user" | "research";
  baseRevisionId: string;
  targetIslandId?: string;
  mutations: CanvasV2SceneMutation[];
  protectedUserNodeIds: string[];
  beforeObjectCount: number;
  afterObjectCount: number;
  stylesheetChanged: boolean;
  targeting?: Pick<CanvasV2WorkingContext, "scope" | "selectionPolicy" | "selectedNodeIds" | "editableNodeIds" | "protectedNodeIds" | "visibleBounds">;
}

interface SourceObject {
  nodeId: string;
  parentNodeId?: string;
  tagName: string;
  userEdited: boolean;
  userEditKinds: string[];
  islandId?: string;
  visualRole?: string;
  evidenceId?: string;
  origin?: CanvasV2ObjectOrigin;
  lastAuthor?: "user" | "northstar";
  editVersion: number;
  locked: boolean;
  hidden: boolean;
  ownFingerprint: string;
  hasIdentifiedChildren: boolean;
  sourceFingerprint: string;
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const AUTHORABLE_ELEMENTS = new Set([
  "article", "aside", "blockquote", "button", "div", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "li", "ol", "p", "section", "small", "span", "strong", "svg", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function escapedAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function stableSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "object";
}

function sourceObjectOrigin(object: Pick<SourceObject, "origin" | "lastAuthor" | "userEditKinds" | "evidenceId">): CanvasV2ObjectOrigin {
  if (object.origin) return object.origin;
  if (object.evidenceId) return "research";
  if (object.userEditKinds.includes("create") || object.userEditKinds.includes("group")) return "user";
  if (object.lastAuthor === "northstar") return "northstar";
  return "imported";
}

function upsertOpeningAttribute(opening: string, name: string, value: string | undefined): string {
  const pattern = new RegExp(`\\s*${name}\\s*=\\s*["'][^"']*["']`, "ig");
  const without = opening.replace(pattern, "");
  return value === undefined ? without : without.replace(/\s*\/?>(?=$)/, (ending) => ` ${name}="${escapedAttribute(value)}"${ending}`);
}

function withoutAuthorshipAttributes(opening: string): string {
  return ["data-canvas-v2-origin", "data-canvas-v2-last-author", "data-canvas-v2-edit-version", "data-canvas-v2-user-edited"]
    .reduce((current, name) => upsertOpeningAttribute(current, name, undefined), opening);
}

function objectOwnChanged(previous: SourceObject, current: SourceObject): boolean {
  return previous.parentNodeId !== current.parentNodeId
    || previous.ownFingerprint !== current.ownFingerprint
    || (!previous.hasIdentifiedChildren && previous.sourceFingerprint !== current.sourceFingerprint);
}

/**
 * Preserve origin as immutable provenance while recording who made the latest
 * accepted change. Human-edit markers remain a durable part of the history;
 * a later selected AI edit does not erase the fact that a person edited it.
 */
export function reconcileCanvasV2ObjectAuthorship(input: {
  previous: CanvasV2ArtifactDocument;
  next: CanvasV2ArtifactDocument;
  origin: "northstar" | "user" | "research";
}): CanvasV2ArtifactDocument {
  const beforeById = new Map(readSourceObjects(input.previous).map((object) => [object.nodeId, object]));
  const afterById = new Map(readSourceObjects(input.next).map((object) => [object.nodeId, object]));
  const html = input.next.html.replace(/<([a-z][\w:-]*)\b([^>]*)>/gi, (opening, _tagName: string, attributes: string) => {
    const nodeId = attribute(attributes, "data-canvas-v2-node-id");
    if (!nodeId) return opening;
    const previous = beforeById.get(nodeId);
    const current = afterById.get(nodeId);
    if (!current) return opening;
    const changed = Boolean(previous && objectOwnChanged(previous, current));
    if (previous && !changed) return opening;
    const origin = previous ? sourceObjectOrigin(previous) : input.origin === "research" ? "research" : input.origin === "user" ? "user" : "northstar";
    const userEditKinds = previous?.userEditKinds ?? current.userEditKinds;
    const lastAuthor = changed || !previous
      ? input.origin === "user" ? "user" : input.origin === "northstar" ? "northstar" : undefined
      : previous.lastAuthor ?? current.lastAuthor;
    const editVersion = previous
      ? previous.editVersion + (changed ? 1 : 0)
      : input.origin === "user" ? 1 : 0;
    let nextOpening = upsertOpeningAttribute(opening, "data-canvas-v2-origin", origin);
    nextOpening = upsertOpeningAttribute(nextOpening, "data-canvas-v2-last-author", lastAuthor);
    nextOpening = upsertOpeningAttribute(nextOpening, "data-canvas-v2-edit-version", String(editVersion));
    nextOpening = upsertOpeningAttribute(nextOpening, "data-canvas-v2-user-edited", userEditKinds.length ? userEditKinds.join(" ") : undefined);
    return nextOpening;
  });
  return { ...input.next, html };
}

/**
 * Promote every meaningful model-authored descendant to a first-class canvas
 * object before the candidate is rendered. The model remains responsible for
 * the composition; the compiler owns identity and provenance.
 */
export function normalizeCanvasV2SceneObjectIdentities(document: CanvasV2ArtifactDocument): CanvasV2ArtifactDocument {
  const used = new Set(Array.from(document.html.matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi), (match) => match[1]));
  const sequenceByIsland = new Map<string, number>();
  const stack: Array<{ tagName: string; islandId?: string }> = [];
  const tagPattern = /<\/?([a-z][\w:-]*)\b([^>]*)>/gi;
  let cursor = 0;
  let html = "";
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(document.html))) {
    html += document.html.slice(cursor, match.index);
    cursor = tagPattern.lastIndex;
    const source = match[0];
    const tagName = match[1].toLowerCase();
    const closing = source.startsWith("</");
    if (closing) {
      html += source;
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const entry = stack[index];
        stack.splice(index, 1);
        if (entry.tagName === tagName) break;
      }
      continue;
    }

    const attributes = match[2];
    const inheritedIslandId = stack.at(-1)?.islandId;
    const declaredRegion = /\bdata-canvas-v2-design-region(?:\s*=|\s|$)/i.test(attributes);
    const declaredIslandId = attribute(attributes, "data-canvas-v2-island-id")
      ?? (declaredRegion ? attribute(attributes, "data-canvas-v2-node-id") : undefined);
    const islandId = declaredIslandId ?? inheritedIslandId;
    let opening = source;
    if (islandId && AUTHORABLE_ELEMENTS.has(tagName)) {
      let nodeId = attribute(attributes, "data-canvas-v2-node-id");
      if (!nodeId) {
        let sequence = sequenceByIsland.get(islandId) ?? 0;
        do sequence += 1;
        while (used.has(`${stableSlug(islandId)}-${stableSlug(tagName)}-${sequence}`));
        sequenceByIsland.set(islandId, sequence);
        nodeId = `${stableSlug(islandId)}-${stableSlug(tagName)}-${sequence}`;
        used.add(nodeId);
        opening = opening.replace(/\s*\/?>(?=$)/, (ending) => ` data-canvas-v2-node-id="${escapedAttribute(nodeId!)}"${ending}`);
      }
      if (!/\bdata-canvas-v2-last-author\s*=/i.test(opening) && !/\bdata-canvas-v2-user-edited\s*=/i.test(opening)) {
        opening = opening.replace(/\s*\/?>(?=$)/, (ending) => ` data-canvas-v2-origin="northstar" data-canvas-v2-last-author="northstar" data-canvas-v2-edit-version="0"${ending}`);
      }
    }
    html += opening;
    if (!VOID_ELEMENTS.has(tagName) && !/\/\s*>$/.test(source)) stack.push({ tagName, islandId });
  }
  html += document.html.slice(cursor);
  return { ...document, html };
}

function readSourceObjects(document: CanvasV2ArtifactDocument): SourceObject[] {
  interface Frame {
    tagName: string;
    start: number;
    node?: Omit<SourceObject, "sourceFingerprint">;
  }
  // A prefix polynomial lets every subtree receive an exact-position content
  // fingerprint in O(1) when its closing tag is reached. Keeping the complete
  // source for every nested object made a large canvas quadratic in memory and
  // delayed every observed design turn.
  const prefix = new Uint32Array(document.html.length + 1);
  const powers = new Uint32Array(document.html.length + 1);
  powers[0] = 1;
  const base = 16777619;
  for (let index = 0; index < document.html.length; index += 1) {
    prefix[index + 1] = (Math.imul(prefix[index], base) + document.html.charCodeAt(index)) >>> 0;
    powers[index + 1] = Math.imul(powers[index], base) >>> 0;
  }
  const fingerprint = (start: number, end: number) => {
    const length = end - start;
    const hash = (prefix[end] - Math.imul(prefix[start], powers[length])) >>> 0;
    return `${length}:${hash.toString(36)}`;
  };
  const objects: SourceObject[] = [];
  const stack: Frame[] = [];
  const tags = /<\/?([a-z][\w:-]*)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(document.html))) {
    const tagName = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    if (closing) {
      let matchingIndex = stack.length - 1;
      while (matchingIndex >= 0 && stack[matchingIndex].tagName !== tagName) matchingIndex -= 1;
      if (matchingIndex < 0) continue;
      const closed = stack.splice(matchingIndex);
      for (const frame of closed) {
        if (frame.node) objects.push({ ...frame.node, sourceFingerprint: fingerprint(frame.start, tags.lastIndex) });
      }
      continue;
    }

    const attributes = match[2];
    const nodeId = attribute(attributes, "data-canvas-v2-node-id");
    const parentNode = [...stack].reverse().find((frame) => frame.node)?.node;
    const declaredIslandId = attribute(attributes, "data-canvas-v2-island-id");
    const node: Omit<SourceObject, "sourceFingerprint"> | undefined = nodeId ? {
      nodeId,
      parentNodeId: parentNode?.nodeId,
      tagName,
      userEdited: /\bdata-canvas-v2-user-edited\s*=/i.test(attributes),
      userEditKinds: attribute(attributes, "data-canvas-v2-user-edited")?.split(/\s+/).filter(Boolean) ?? [],
      islandId: declaredIslandId ?? parentNode?.islandId,
      visualRole: attribute(attributes, "data-canvas-v2-visual-role"),
      evidenceId: attribute(attributes, "data-canvas-v2-evidence-id"),
      origin: (() : CanvasV2ObjectOrigin | undefined => {
        const value = attribute(attributes, "data-canvas-v2-origin");
        return value === "user" || value === "northstar" || value === "research" || value === "imported" ? value : undefined;
      })(),
      lastAuthor: attribute(attributes, "data-canvas-v2-last-author") === "user" ? "user" as const : attribute(attributes, "data-canvas-v2-last-author") === "northstar" ? "northstar" as const : undefined,
      editVersion: Number(attribute(attributes, "data-canvas-v2-edit-version")) || 0,
      locked: attribute(attributes, "data-canvas-v2-locked") === "true",
      hidden: /\shidden(?:\s|=|>)/i.test(match[0]) || attribute(attributes, "data-canvas-v2-hidden") === "true",
      ownFingerprint: withoutAuthorshipAttributes(match[0]),
      hasIdentifiedChildren: false,
    } : undefined;
    if (node && parentNode) parentNode.hasIdentifiedChildren = true;
    if (VOID_ELEMENTS.has(tagName) || /\/\s*>$/.test(match[0])) {
      if (node) objects.push({ ...node, sourceFingerprint: fingerprint(match.index, tags.lastIndex) });
    } else {
      stack.push({ tagName, start: match.index, node });
    }
  }
  return objects;
}

export function compileCanvasV2SceneTransaction(input: {
  origin: CanvasV2SceneTransaction["origin"];
  baseRevisionId: string;
  previous: CanvasV2ArtifactDocument;
  next: CanvasV2ArtifactDocument;
  execution?: CanvasV2IslandExecutionContract;
  workingContext?: CanvasV2WorkingContext;
}): CanvasV2SceneTransaction {
  const before = readSourceObjects(input.previous);
  const after = readSourceObjects(input.next);
  const beforeById = new Map(before.map((object) => [object.nodeId, object]));
  const afterById = new Map(after.map((object) => [object.nodeId, object]));
  const editableNodeIds = new Set(input.workingContext?.scope === "selection" && input.workingContext.selectionPolicy === "modify"
    ? input.workingContext.editableNodeIds
    : []);
  const protectedUserNodeIds = before.filter((object) => object.userEdited && !editableNodeIds.has(object.nodeId)).map((object) => object.nodeId);
  if (input.origin !== "user") {
    for (const previous of before) {
      const next = afterById.get(previous.nodeId);
      if ((previous.locked || previous.hidden) && (!next || objectOwnChanged(previous, next))) {
        throw new Error(`${previous.locked ? "Locked" : "Hidden"} canvas object ${previous.nodeId} cannot be changed by an AI scene transaction.`);
      }
      if (next && previous.origin && next.origin && previous.origin !== next.origin) {
        throw new Error(`Canvas object ${previous.nodeId} cannot change provenance from ${previous.origin} to ${next.origin}.`);
      }
    }
    for (const nodeId of protectedUserNodeIds) {
      const previous = beforeById.get(nodeId)!;
      const next = afterById.get(nodeId);
      if (!next) throw new Error(`Human-authored canvas object ${nodeId} cannot be removed by an AI scene transaction.`);
      if (objectOwnChanged(previous, next)) throw new Error(`Human-authored canvas object ${nodeId} changed during AI authorship. Compose around it unless the user explicitly requests that edit.`);
    }
  }
  const allIds = Array.from(new Set([...beforeById.keys(), ...afterById.keys()])).sort();
  const mutations = allIds.map((nodeId): CanvasV2SceneMutation => {
    const previous = beforeById.get(nodeId);
    const next = afterById.get(nodeId);
    if (!previous && next) return { kind: "create", nodeId, parentNodeId: next.parentNodeId, tagName: next.tagName, userEdited: next.userEdited, islandId: next.islandId, visualRole: next.visualRole, evidenceId: next.evidenceId, origin: next.origin, lastAuthor: next.lastAuthor, editVersion: next.editVersion, locked: next.locked, hidden: next.hidden };
    if (previous && !next) return { kind: "remove", nodeId, parentNodeId: previous.parentNodeId, tagName: previous.tagName, userEdited: previous.userEdited, islandId: previous.islandId, visualRole: previous.visualRole, evidenceId: previous.evidenceId, origin: previous.origin, lastAuthor: previous.lastAuthor, editVersion: previous.editVersion, locked: previous.locked, hidden: previous.hidden };
    const current = next!;
    return {
      kind: previous!.sourceFingerprint === current.sourceFingerprint && previous!.parentNodeId === current.parentNodeId ? "preserve" : "update",
      nodeId,
      parentNodeId: current.parentNodeId,
      tagName: current.tagName,
      userEdited: current.userEdited,
      islandId: current.islandId,
      visualRole: current.visualRole,
      evidenceId: current.evidenceId,
      origin: current.origin,
      lastAuthor: current.lastAuthor,
      editVersion: current.editVersion,
      locked: current.locked,
      hidden: current.hidden,
    };
  });
  return {
    schema: CANVAS_V2_SCENE_TRANSACTION_SCHEMA,
    origin: input.origin,
    baseRevisionId: input.baseRevisionId,
    targetIslandId: input.execution?.target.islandId,
    mutations,
    protectedUserNodeIds,
    beforeObjectCount: before.length,
    afterObjectCount: after.length,
    stylesheetChanged: input.previous.css !== input.next.css,
    ...(input.workingContext ? { targeting: {
      scope: input.workingContext.scope,
      selectionPolicy: input.workingContext.selectionPolicy,
      selectedNodeIds: input.workingContext.selectedNodeIds,
      editableNodeIds: input.workingContext.editableNodeIds,
      protectedNodeIds: input.workingContext.protectedNodeIds,
      visibleBounds: input.workingContext.visibleBounds,
    } } : {}),
  };
}

export function assertCanvasV2SceneTransaction(input: {
  transaction: CanvasV2SceneTransaction;
  baseRevisionId: string;
  previous: CanvasV2ArtifactDocument;
  next: CanvasV2ArtifactDocument;
}): void {
  if (input.transaction.schema !== CANVAS_V2_SCENE_TRANSACTION_SCHEMA) throw new Error("Canvas scene transaction schema is invalid.");
  if (input.transaction.baseRevisionId !== input.baseRevisionId) throw new Error("Canvas scene transaction was compiled against a different revision.");
  const compiled = compileCanvasV2SceneTransaction({
    origin: input.transaction.origin,
    baseRevisionId: input.baseRevisionId,
    previous: input.previous,
    next: input.next,
    workingContext: input.transaction.targeting ? {
      schema: "canvas-v2.working-context.v1",
      ...input.transaction.targeting,
      viewportScale: 1,
      visibleNodeIds: [],
      nearbyNodeIds: [],
      objects: [],
      relationships: [],
    } : undefined,
  });
  const expected = compiled.mutations.map(({ kind, nodeId, parentNodeId }) => `${kind}:${nodeId}:${parentNodeId ?? ""}`).sort();
  const received = input.transaction.mutations.map(({ kind, nodeId, parentNodeId }) => `${kind}:${nodeId}:${parentNodeId ?? ""}`).sort();
  if (expected.length !== received.length || expected.some((entry, index) => entry !== received[index])) {
    throw new Error("Canvas scene transaction does not match the supplied source revision.");
  }
  if (compiled.stylesheetChanged !== input.transaction.stylesheetChanged) {
    throw new Error("Canvas scene transaction stylesheet state does not match the supplied source revision.");
  }
}

export function buildCanvasV2SceneObjectInventory(document: CanvasV2ArtifactDocument) {
  return readSourceObjects(document).map((object) => ({
    nodeId: object.nodeId,
    ...(object.parentNodeId ? { parentNodeId: object.parentNodeId } : {}),
    tagName: object.tagName,
    userEdited: object.userEdited,
    userEditKinds: object.userEditKinds,
    ...(object.islandId ? { islandId: object.islandId } : {}),
    ...(object.visualRole ? { visualRole: object.visualRole } : {}),
    ...(object.evidenceId ? { evidenceId: object.evidenceId } : {}),
    ...(object.origin ? { origin: object.origin } : {}),
    ...(object.lastAuthor ? { lastAuthor: object.lastAuthor } : {}),
    editVersion: object.editVersion,
    locked: object.locked,
    hidden: object.hidden,
  }));
}
