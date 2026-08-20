import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

export type CanvasV2BoardObjectKind = "root" | "frame" | "group" | "island" | "text" | "image" | "shape" | "table" | "evidence" | "object";

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
  editVersion: number;
  rotation: number;
  canonicalEvidence: boolean;
}
function kindFor(element: HTMLElement): CanvasV2BoardObjectKind {
  if (element.dataset.canvasV2WorkspaceRoot === "true" || element.dataset.canvasV2PermanentRoot === "true" || element.dataset.canvasV2NodeId === "canvas") return "root";
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
      lastAuthor: element.dataset.canvasV2LastAuthor === "user" ? "user" : element.dataset.canvasV2LastAuthor === "northstar" ? "northstar" : undefined,
      editVersion: Number(element.dataset.canvasV2EditVersion) || 0,
      rotation: Number(element.dataset.canvasV2Rotation) || 0,
      canonicalEvidence: Boolean(element.closest("[data-canvas-v2-canonical-flow]")),
    }];
  });
}
