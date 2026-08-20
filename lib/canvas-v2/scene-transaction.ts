import type { CanvasV2ArtifactDocument, CanvasV2IslandExecutionContract } from "@/lib/canvas-v2/types";

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
        opening = opening.replace(/\s*\/?>(?=$)/, (ending) => ` data-canvas-v2-last-author="northstar" data-canvas-v2-edit-version="0"${ending}`);
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
    const node = nodeId ? {
      nodeId,
      parentNodeId: parentNode?.nodeId,
      tagName,
      userEdited: /\bdata-canvas-v2-user-edited\s*=/i.test(attributes),
      userEditKinds: attribute(attributes, "data-canvas-v2-user-edited")?.split(/\s+/).filter(Boolean) ?? [],
      islandId: declaredIslandId ?? parentNode?.islandId,
      visualRole: attribute(attributes, "data-canvas-v2-visual-role"),
      evidenceId: attribute(attributes, "data-canvas-v2-evidence-id"),
    } : undefined;
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
}): CanvasV2SceneTransaction {
  const before = readSourceObjects(input.previous);
  const after = readSourceObjects(input.next);
  const beforeById = new Map(before.map((object) => [object.nodeId, object]));
  const afterById = new Map(after.map((object) => [object.nodeId, object]));
  const protectedUserNodeIds = before.filter((object) => object.userEdited).map((object) => object.nodeId);
  if (input.origin !== "user") {
    for (const nodeId of protectedUserNodeIds) {
      const previous = beforeById.get(nodeId)!;
      const next = afterById.get(nodeId);
      if (!next) throw new Error(`Human-authored canvas object ${nodeId} cannot be removed by an AI scene transaction.`);
      if (previous.sourceFingerprint !== next.sourceFingerprint) throw new Error(`Human-authored canvas object ${nodeId} changed during AI authorship. Compose around it unless the user explicitly requests that edit.`);
    }
  }
  const allIds = Array.from(new Set([...beforeById.keys(), ...afterById.keys()])).sort();
  const mutations = allIds.map((nodeId): CanvasV2SceneMutation => {
    const previous = beforeById.get(nodeId);
    const next = afterById.get(nodeId);
    if (!previous && next) return { kind: "create", nodeId, parentNodeId: next.parentNodeId, tagName: next.tagName, userEdited: next.userEdited, islandId: next.islandId, visualRole: next.visualRole, evidenceId: next.evidenceId };
    if (previous && !next) return { kind: "remove", nodeId, parentNodeId: previous.parentNodeId, tagName: previous.tagName, userEdited: previous.userEdited, islandId: previous.islandId, visualRole: previous.visualRole, evidenceId: previous.evidenceId };
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
  return readSourceObjects(document).map(({ sourceFingerprint: _sourceFingerprint, ...object }) => object);
}
