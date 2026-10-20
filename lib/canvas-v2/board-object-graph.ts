import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";
import type { CanvasV2NativeSceneDocument, CanvasV2NativeSceneNode } from "./native-scene";

export type CanvasV2BoardObjectKind = "root" | "frame" | "group" | "island" | "text" | "note" | "image" | "model" | "shape" | "line" | "connector" | "drawing" | "table" | "evidence" | "object";

export interface CanvasV2BoardObject {
  nodeId: string;
  parentNodeId?: string;
  childNodeIds: string[];
  depth: number;
  tagName: string;
  kind: CanvasV2BoardObjectKind;
  label?: string;
  hidden: boolean;
  locked: boolean;
  userEdited: boolean;
  lastAuthor?: "user" | "northstar";
  origin?: "user" | "northstar" | "research" | "imported";
  editVersion: number;
  rotation: number;
  canonicalEvidence: boolean;
}

/** The compiled scene is current board truth. Opening Layers should not parse
 * the entire serialized document (including embedded app and image sources). */
export function readCanvasV2NativeBoardObjectGraph(scene: CanvasV2NativeSceneDocument): CanvasV2BoardObject[] {
  const byId = new Map(scene.nodes.map(node => [node.id, node]));
  const sourceId = (node: CanvasV2NativeSceneNode) => node.sourceNodeId || node.attributes["data-canvas-v2-node-id"];
  const parents = new Map<string, CanvasV2NativeSceneNode | undefined>();
  const sourceParent = (node: CanvasV2NativeSceneNode): CanvasV2NativeSceneNode | undefined => {
    if (parents.has(node.id)) return parents.get(node.id);
    const visited = new Set([node.id]);
    let parent = node.parentId ? byId.get(node.parentId) : undefined;
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (sourceId(parent)) { parents.set(node.id, parent); return parent; }
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    parents.set(node.id, undefined);
    return undefined;
  };
  const result = scene.nodes.flatMap<CanvasV2BoardObject>(node => {
    const nodeId = sourceId(node);
    if (!nodeId) return [];
    const parent = sourceParent(node);
    let depth = 0, cursor = parent;
    const visited = new Set([node.id]);
    while (cursor && !visited.has(cursor.id)) { visited.add(cursor.id); depth++; cursor = sourceParent(cursor); }
    const attrs = node.attributes, origin = attrs["data-canvas-v2-origin"];
    return [{
      nodeId, ...(parent ? { parentNodeId: sourceId(parent) } : {}), childNodeIds: [], depth,
      tagName: node.tagName, kind: node.kind, label: attrs["aria-label"],
      hidden: node.hidden, locked: node.locked, userEdited: node.userEdited,
      lastAuthor: node.lastAuthor, editVersion: node.editVersion, rotation: node.geometry.rotation,
      canonicalEvidence: node.canonicalEvidence,
      origin: origin === "user" || origin === "northstar" || origin === "research" || origin === "imported"
        ? origin : node.canonicalEvidence || node.evidence ? "research"
          : node.lastAuthor === "northstar" ? "northstar"
            : attrs["data-canvas-v2-user-edited"]?.includes("create") ? "user" : "imported",
    }];
  });
  const objects = new Map(result.map(node => [node.nodeId, node]));
  for (const node of result) if (node.parentNodeId) objects.get(node.parentNodeId)?.childNodeIds.push(node.nodeId);
  return result;
}
function kindFor(element: HTMLElement): CanvasV2BoardObjectKind {
  if (element.dataset.canvasV2WorkspaceRoot === "true" || element.dataset.canvasV2PermanentRoot === "true" || element.dataset.canvasV2NodeId === "canvas") return "root";
  if (element.hasAttribute("data-canvas-v2-model")) return "model";
  const primitive = element.dataset.canvasV2Primitive;
  if (primitive === "note" || primitive === "line" || primitive === "connector" || primitive === "drawing") return primitive;
  if (element.dataset.canvasV2PaintedEdge) return "shape";
  if (element.dataset.canvasV2Group === "true") return "group";
  if (element.dataset.canvasV2IslandId || element.dataset.canvasV2DesignRegion !== undefined) return "island";
  if (element.dataset.canvasV2EvidenceId) return "evidence";
  if (element instanceof HTMLImageElement || element.tagName === "IMG") return "image";
  if (/^H[1-6]$/.test(element.tagName) || ["P", "SPAN", "SMALL", "STRONG", "EM", "LABEL", "BUTTON"].includes(element.tagName)) return "text";
  if (element.tagName === "TABLE") return "table";
  if (element.dataset.canvasV2UserEdited?.includes("create") && element.tagName === "SECTION") return "frame";
  if (["SVG", "PATH", "LINE", "CIRCLE", "RECT", "POLYGON"].includes(element.tagName)) return "shape";
  return "object";
}

export function readCanvasV2BoardObjectGraph(artifact: CanvasV2ArtifactDocument): CanvasV2BoardObject[] {
  if (typeof DOMParser === "undefined") return [];
  const parsed = new DOMParser().parseFromString(`<body>${artifact.html}</body>`, "text/html");
  const elements = Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"));
  return elements.flatMap((element) => {
    const nodeId = element.dataset.canvasV2NodeId?.trim();
    if (!nodeId) return [];
    const parent = element.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]");
    let depth = 0;
    let cursor = parent;
    while (cursor) {
      depth += 1;
      cursor = cursor.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]") ?? null;
    }
    const childNodeIds = Array.from(element.children).flatMap((child) => {
      const childId = (child as HTMLElement).dataset.canvasV2NodeId?.trim();
      return childId ? [childId] : [];
    });
    return [{
      nodeId,
      parentNodeId: parent?.dataset.canvasV2NodeId,
      childNodeIds,
      depth,
      tagName: element.tagName.toLowerCase(),
      kind: kindFor(element),
      label: element.getAttribute("aria-label") ?? undefined,
      hidden: element.hidden,
      locked: element.dataset.canvasV2Locked === "true",
      userEdited: Boolean(element.dataset.canvasV2UserEdited),
      origin: element.dataset.canvasV2Origin === "user" || element.dataset.canvasV2Origin === "northstar" || element.dataset.canvasV2Origin === "research" || element.dataset.canvasV2Origin === "imported"
        ? element.dataset.canvasV2Origin
        : element.dataset.canvasV2EvidenceId || element.closest("[data-canvas-v2-canonical-flow]") ? "research"
          : element.dataset.canvasV2LastAuthor === "northstar" ? "northstar"
            : element.dataset.canvasV2UserEdited?.includes("create") ? "user" : "imported",
      lastAuthor: element.dataset.canvasV2LastAuthor === "user" ? "user" : element.dataset.canvasV2LastAuthor === "northstar" ? "northstar" : undefined,
      editVersion: Number(element.dataset.canvasV2EditVersion) || 0,
      rotation: Number(element.dataset.canvasV2Rotation) || 0,
      canonicalEvidence: Boolean(element.closest("[data-canvas-v2-canonical-flow]")),
    }];
  });
}
