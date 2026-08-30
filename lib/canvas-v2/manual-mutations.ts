import { assertCanvasV2ArtifactDocument } from "@/lib/canvas-v2/artifact-safety";
import { buildCanvasV2ConnectorGeometry, type CanvasV2ConnectorVariant } from "@/lib/canvas-v2/connector-geometry";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

export interface CanvasV2NativeTextContentUpdate {
  sceneNodeId: string;
  content: Array<{ kind: "text"; value: string } | { kind: "node"; id: string }>;
}

export type CanvasV2ManualPrimitive = "text" | "note" | "frame" | "shape" | "line" | "connector" | "table" | "image" | "drawing";
export type CanvasV2ShapeVariant = "rectangle" | "ellipse" | "diamond" | "triangle" | "pill";
export interface CanvasV2ManualPoint { x: number; y: number }

export type CanvasV2AtomicManualMutation =
  | { kind: "move"; nodeId: string; deltaX: number; deltaY: number }
  | { kind: "resize"; nodeId: string; width: number; height: number; fontSize?: number; lineHeight?: number }
  | { kind: "transform"; nodeId: string; deltaX: number; deltaY: number; width: number; height: number; fontSize?: number; lineHeight?: number }
  | { kind: "text"; nodeId: string; text: string; nativeContent?: CanvasV2NativeTextContentUpdate[]; layout?: { width?: number; height?: number } }
  | { kind: "style"; nodeId: string; property: CanvasV2EditableStyleProperty; value: string }
  | { kind: "attribute"; nodeId: string; name: "alt"; value: string }
  | { kind: "image-source"; nodeId: string; src: string; alt?: string }
  | { kind: "connector-endpoint"; nodeId: string; endpoint: "from" | "to"; x: number; y: number; attachNodeId?: string }
  | { kind: "connector-curve"; nodeId: string; x: number; y: number }
  | { kind: "delete"; nodeId: string }
  | { kind: "duplicate"; nodeId: string; newNodeId: string }
  | { kind: "layer"; nodeId: string; direction: "forward" | "backward" | "front" | "back" }
  | { kind: "visibility"; nodeId: string; hidden: boolean }
  | { kind: "lock"; nodeId: string; locked: boolean }
  | { kind: "rotate"; nodeId: string; rotation: number }
  | { kind: "group"; groupNodeId: string; label?: string; items: Array<{ nodeId: string; bounds: { x: number; y: number; width: number; height: number } }>; bounds: { x: number; y: number; width: number; height: number } }
  | { kind: "ungroup"; nodeId: string }
  | {
      kind: "create";
      nodeId: string;
      primitive: CanvasV2ManualPrimitive;
      x: number;
      y: number;
      width?: number;
      height?: number;
      endX?: number;
      endY?: number;
      shapeVariant?: CanvasV2ShapeVariant;
      connectorVariant?: CanvasV2ConnectorVariant;
      fromNodeId?: string;
      toNodeId?: string;
      src?: string;
      alt?: string;
      points?: CanvasV2ManualPoint[];
    };

export type CanvasV2ManualMutation = CanvasV2AtomicManualMutation
  | { kind: "batch"; label: string; mutations: CanvasV2AtomicManualMutation[] };

export type CanvasV2EditableStyleProperty =
  | "color"
  | "background-color"
  | "border-color"
  | "border-radius"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "font-style"
  | "text-align"
  | "text-decoration"
  | "opacity"
  | "object-fit";

const EDITABLE_STYLE_PROPERTIES = new Set<CanvasV2EditableStyleProperty>([
  "color",
  "background-color",
  "border-color",
  "border-radius",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-align",
  "text-decoration",
  "opacity",
  "object-fit",
]);

function safeStyleValue(property: CanvasV2EditableStyleProperty, value: string): string {
  const normalized = value.trim().slice(0, 160);
  if (!normalized || /[{}<>;]/.test(normalized)) throw new Error(`Invalid ${property} style value.`);
  if (property === "opacity") {
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) throw new Error("Opacity must be between zero and one.");
  }
  if (property === "object-fit" && !["contain", "cover", "fill", "scale-down", "none"].includes(normalized)) throw new Error("Unsupported image fit mode.");
  if (property === "text-align" && !["left", "center", "right", "justify", "start", "end"].includes(normalized)) throw new Error("Unsupported text alignment.");
  return normalized;
}

export interface CanvasV2SourceNode {
  nodeId: string;
  parentNodeId?: string;
  depth: number;
  tagName: string;
  hidden: boolean;
  locked: boolean;
  userEdited: boolean;
  lastAuthor?: "user" | "northstar";
  editVersion: number;
  rotation: number;
  kind: "root" | "frame" | "group" | "island" | "text" | "note" | "image" | "shape" | "line" | "connector" | "drawing" | "table" | "evidence" | "object";
}

export function listCanvasV2SourceNodes(artifact: CanvasV2ArtifactDocument): CanvasV2SourceNode[] {
  if (typeof DOMParser === "undefined") return [];
  const parsed = new DOMParser().parseFromString(`<body>${artifact.html}</body>`, "text/html");
  return Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).flatMap((element) => {
    const nodeId = element.dataset.canvasV2NodeId?.trim();
    const parent = element.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]");
    let depth = 0;
    let cursor = parent;
    while (cursor) {
      depth += 1;
      cursor = cursor.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]") ?? null;
    }
    const authoredPrimitive = element.dataset.canvasV2Primitive;
    const kind: CanvasV2SourceNode["kind"] = element.dataset.canvasV2WorkspaceRoot === "true" || element.dataset.canvasV2PermanentRoot === "true" || nodeId === "canvas"
      ? "root"
      : authoredPrimitive === "note" || authoredPrimitive === "line" || authoredPrimitive === "connector" || authoredPrimitive === "drawing"
        ? authoredPrimitive
      : element.dataset.canvasV2PaintedEdge
        ? "shape"
      : element.dataset.canvasV2Group === "true"
        ? "group"
        : element.dataset.canvasV2IslandId || element.dataset.canvasV2DesignRegion !== undefined
          ? "island"
          : element.dataset.canvasV2EvidenceId
            ? "evidence"
            : element.tagName === "IMG"
              ? "image"
              : /^H[1-6]$/.test(element.tagName) || ["P", "SPAN", "SMALL", "STRONG", "EM", "LABEL", "BUTTON"].includes(element.tagName)
                ? "text"
                : element.tagName === "TABLE"
                  ? "table"
                  : ["SVG", "PATH", "LINE", "CIRCLE", "RECT", "POLYGON"].includes(element.tagName)
                    ? "shape"
                    : "object";
    return nodeId ? [{
      nodeId,
      parentNodeId: parent?.dataset.canvasV2NodeId,
      depth,
      tagName: element.tagName.toLowerCase(),
      hidden: element.hidden,
      locked: element.dataset.canvasV2Locked === "true",
      userEdited: Boolean(element.dataset.canvasV2UserEdited),
      lastAuthor: element.dataset.canvasV2LastAuthor === "user" ? "user" : element.dataset.canvasV2LastAuthor === "northstar" ? "northstar" : undefined,
      editVersion: Number(element.dataset.canvasV2EditVersion) || 0,
      rotation: Number(element.dataset.canvasV2Rotation) || 0,
      kind,
    }] : [];
  });
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return Math.round(value * 100) / 100;
}

function safeLocalImageSource(value: string): string {
  const source = value.trim();
  if (!/^blob:[^\s"'<>]+$/i.test(source)) throw new Error("Canvas image files must use a local browser object URL.");
  return source;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function storedNumber(element: HTMLElement, key: "canvasV2ManualX" | "canvasV2ManualY"): number {
  const value = Number(element.dataset[key]);
  if (Number.isFinite(value)) return value;
  const authoredValue = Number.parseFloat(key === "canvasV2ManualX" ? element.style.left : element.style.top);
  return Number.isFinite(authoredValue) ? authoredValue : 0;
}

function storedDimension(element: HTMLElement, key: "canvasV2ManualWidth" | "canvasV2ManualHeight"): number {
  const value = Number(element.dataset[key]);
  if (Number.isFinite(value) && value > 0) return value;
  const authoredValue = Number.parseFloat(key === "canvasV2ManualWidth" ? element.style.width : element.style.height);
  return Number.isFinite(authoredValue) && authoredValue > 0 ? authoredValue : 240;
}

function findUniqueNode(document: Document, nodeId: string): HTMLElement {
  const normalized = nodeId.trim();
  if (!normalized) throw new Error("A manual mutation requires a stable node identity.");
  const matches = Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))
    .filter((element) => element.dataset.canvasV2NodeId === normalized);
  if (matches.length !== 1) throw new Error(`Canvas V2 expected exactly one node named ${normalized}.`);
  return matches[0];
}

function assertMutableNode(element: HTMLElement): void {
  if (element.dataset.canvasV2WorkspaceRoot === "true" || element.dataset.canvasV2PermanentRoot === "true" || element.dataset.canvasV2NodeId === "canvas") {
    throw new Error("The workspace root is permanent. Select an element inside it instead.");
  }
}

function assertDeletableNode(element: HTMLElement): void {
  assertMutableNode(element);
}

function markUserEdit(element: HTMLElement, kind: CanvasV2ManualMutation["kind"]): void {
  const edits = new Set((element.dataset.canvasV2UserEdited ?? "").split(/\s+/).filter(Boolean));
  edits.add(kind);
  element.dataset.canvasV2UserEdited = Array.from(edits).join(" ");
  element.dataset.canvasV2LastAuthor = "user";
  element.dataset.canvasV2EditVersion = String((Number(element.dataset.canvasV2EditVersion) || 0) + 1);
}

function setGeometryStyle(element: HTMLElement, property: "left" | "top" | "width" | "height" | "max-width", value: string): void {
  element.style.setProperty(property, value, "important");
}

export function applyCanvasV2ManualMutation(
  artifact: CanvasV2ArtifactDocument,
  mutation: CanvasV2ManualMutation,
): CanvasV2ArtifactDocument {
  if (typeof DOMParser === "undefined") throw new Error("Manual canvas mutations require a browser document.");
  if (mutation.kind === "batch") {
    // A batch is transactional from the revision authority's point of view:
    // every source operation must compile before a candidate can be rendered.
    return mutation.mutations.reduce((current, item) => applyCanvasV2ManualMutation(current, item), artifact);
  }
  if (mutation.kind === "group") return applyCanvasV2GroupMutation(artifact, mutation);
  const parsed = new DOMParser().parseFromString(`<body>${artifact.html}</body>`, "text/html");
  if (mutation.kind === "create") {
    if (Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).some((element) => element.dataset.canvasV2NodeId === mutation.nodeId)) throw new Error("A created node requires a unique identity.");
    const x = finite(mutation.x, "Horizontal position");
    const y = finite(mutation.y, "Vertical position");
    const width = Math.max(1, finite(mutation.width ?? (mutation.primitive === "table" ? 480 : mutation.primitive === "frame" ? 360 : mutation.primitive === "text" ? 220 : 160), "Width"));
    const height = Math.max(1, finite(mutation.height ?? (mutation.primitive === "table" ? 120 : mutation.primitive === "frame" ? 240 : mutation.primitive === "text" ? 48 : 160), "Height"));
    const provenance = `data-canvas-v2-origin="user" data-canvas-v2-primitive="${mutation.primitive}" data-canvas-v2-user-edited="create" data-canvas-v2-last-author="user" data-canvas-v2-edit-version="1" data-canvas-v2-manual-x="${x}" data-canvas-v2-manual-y="${y}" data-canvas-v2-manual-width="${width}" data-canvas-v2-manual-height="${height}"`;
    const shapeVariant = mutation.shapeVariant ?? "rectangle";
    const shapeStyle = shapeVariant === "ellipse"
      ? "border-radius:999px"
      : shapeVariant === "diamond"
        ? "border-radius:18px;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"
        : shapeVariant === "triangle"
          ? "border-radius:0;clip-path:polygon(50% 0,100% 100%,0 100%)"
          : shapeVariant === "pill" ? "border-radius:999px" : "border-radius:24px";
    const endX = finite(mutation.endX ?? x + width, "Line end X");
    const endY = finite(mutation.endY ?? y, "Line end Y");
    const lineWidth = Math.max(1, Math.hypot(endX - x, endY - y));
    const lineRotation = Math.atan2(endY - y, endX - x) * 180 / Math.PI;
    const lineX = x + (endX - x) / 2 - lineWidth / 2;
    const lineY = y + (endY - y) / 2 - 2;
    const connectorBindings = `${mutation.fromNodeId ? ` data-canvas-v2-connector-from="${escapeAttribute(mutation.fromNodeId)}"` : ""}${mutation.toNodeId ? ` data-canvas-v2-connector-to="${escapeAttribute(mutation.toNodeId)}"` : ""}`;
    const connectorVariant = mutation.connectorVariant ?? "arrow";
    const connectorGeometry = buildCanvasV2ConnectorGeometry({ start: { x, y }, end: { x: endX, y: endY }, variant: connectorVariant });
    const connectorEnd = connectorVariant === "arrow"
      ? `<polyline data-canvas-v2-connector-part="end" points="${connectorGeometry.arrowPoints}" fill="none" stroke="var(--northstar-violet)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></polyline>`
      : `<circle data-canvas-v2-connector-part="end" cx="${connectorGeometry.localEnd.x}" cy="${connectorGeometry.localEnd.y}" r="5.5" fill="var(--northstar-surface)" stroke="var(--northstar-violet)" stroke-width="2.5"></circle>`;
    const drawingPoints = (mutation.points?.length ? mutation.points : [{ x: 4, y: 36 }, { x: 32, y: 8 }, { x: 68, y: 50 }, { x: 112, y: 14 }, { x: 156, y: 34 }])
      .map((point) => `${finite(point.x, "Drawing X")},${finite(point.y, "Drawing Y")}`).join(" ");
    const markup = mutation.primitive === "text"
      ? `<p data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;margin:0;font:600 28px/1.3 Inter,system-ui,sans-serif;color:var(--northstar-ink)">New text</p>`
      : mutation.primitive === "note"
        ? `<article data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} aria-label="Note" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;padding:20px;border:1px solid var(--northstar-note-line);border-radius:8px;background:var(--northstar-note-surface);color:var(--northstar-note-ink);box-shadow:0 8px 22px var(--northstar-note-shadow);font:600 18px/1.45 Inter,system-ui,sans-serif">Add a note</article>`
      : mutation.primitive === "frame"
        ? `<section data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} aria-label="Frame" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;border:2px solid var(--northstar-violet);border-radius:20px;background:var(--northstar-surface)"></section>`
        : mutation.primitive === "shape"
          ? `<div data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} data-canvas-v2-shape="${shapeVariant}" aria-label="${shapeVariant} shape" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;${shapeStyle};background:var(--northstar-violet)"></div>`
          : mutation.primitive === "connector"
            ? `<svg data-canvas-v2-node-id="${mutation.nodeId}" ${provenance}${connectorBindings} data-canvas-v2-connector-variant="${connectorVariant}" data-canvas-v2-connector-from-x="${x}" data-canvas-v2-connector-from-y="${y}" data-canvas-v2-connector-to-x="${endX}" data-canvas-v2-connector-to-y="${endY}" data-canvas-v2-connector-bend="${connectorVariant === "curve" ? 72 : 0}" data-canvas-v2-connector-control-x="${connectorGeometry.control.x}" data-canvas-v2-connector-control-y="${connectorGeometry.control.y}" aria-label="${connectorVariant} connector" viewBox="0 0 ${connectorGeometry.bounds.width} ${connectorGeometry.bounds.height}" style="position:absolute;left:${connectorGeometry.bounds.x}px;top:${connectorGeometry.bounds.y}px;width:${connectorGeometry.bounds.width}px;height:${connectorGeometry.bounds.height}px;${mutation.fromNodeId && mutation.toNodeId ? "z-index:-1;" : ""}overflow:visible"><path data-canvas-v2-connector-part="path" d="${connectorGeometry.path}" fill="none" stroke="var(--northstar-violet)" stroke-width="4" stroke-linecap="round"></path><path data-canvas-v2-connector-part="hit" d="${connectorGeometry.path}" fill="none" stroke="transparent" stroke-width="20" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="stroke"></path><circle data-canvas-v2-connector-part="start" cx="${connectorGeometry.localStart.x}" cy="${connectorGeometry.localStart.y}" r="5.5" fill="var(--northstar-surface)" stroke="var(--northstar-violet)" stroke-width="2.5"></circle>${connectorEnd}</svg>`
            : mutation.primitive === "line"
              ? `<div data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} aria-label="Line" style="position:absolute;left:${lineX}px;top:${lineY}px;width:${lineWidth}px;height:4px;background:var(--northstar-violet);transform-origin:center;rotate:${lineRotation}deg"></div>`
            : mutation.primitive === "image"
              ? `<img data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} data-canvas-v2-local-image="true" src="${escapeAttribute(safeLocalImageSource(mutation.src ?? ""))}" alt="${escapeAttribute(mutation.alt ?? "")}" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;border-radius:16px;object-fit:cover;background:var(--northstar-surface-subtle)">`
              : mutation.primitive === "drawing"
                ? `<svg data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} aria-label="Freehand drawing" viewBox="0 0 ${width} ${height}" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;overflow:visible"><polyline points="${drawingPoints}" fill="none" stroke="var(--northstar-violet)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>`
                : `<table data-canvas-v2-node-id="${mutation.nodeId}" ${provenance} aria-label="Table" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;border-collapse:collapse;background:var(--northstar-surface);color:var(--northstar-ink)"><tbody><tr><td style="border:1px solid var(--northstar-line);padding:14px">Cell 1</td><td style="border:1px solid var(--northstar-line);padding:14px">Cell 2</td></tr><tr><td style="border:1px solid var(--northstar-line);padding:14px">Cell 3</td><td style="border:1px solid var(--northstar-line);padding:14px">Cell 4</td></tr></tbody></table>`;
    parsed.body.insertAdjacentHTML("beforeend", markup);
    return assertCanvasV2ArtifactDocument({ ...artifact, html: parsed.body.innerHTML });
  }
  const element = findUniqueNode(parsed, mutation.nodeId);
  assertMutableNode(element);

  if (mutation.kind === "move") {
    const deltaX = finite(mutation.deltaX, "Horizontal movement");
    const deltaY = finite(mutation.deltaY, "Vertical movement");
    const x = storedNumber(element, "canvasV2ManualX") + deltaX;
    const y = storedNumber(element, "canvasV2ManualY") + deltaY;
    if (element.dataset.canvasV2Primitive === "connector") {
      const moveCoordinate = (key: "canvasV2ConnectorFromX" | "canvasV2ConnectorFromY" | "canvasV2ConnectorToX" | "canvasV2ConnectorToY" | "canvasV2ConnectorControlX" | "canvasV2ConnectorControlY", delta: number) => {
        const value = Number(element.dataset[key]);
        if (Number.isFinite(value)) element.dataset[key] = String(finite(value + delta, "Connector movement"));
      };
      moveCoordinate("canvasV2ConnectorFromX", deltaX);
      moveCoordinate("canvasV2ConnectorFromY", deltaY);
      moveCoordinate("canvasV2ConnectorToX", deltaX);
      moveCoordinate("canvasV2ConnectorToY", deltaY);
      moveCoordinate("canvasV2ConnectorControlX", deltaX);
      moveCoordinate("canvasV2ConnectorControlY", deltaY);
      delete element.dataset.canvasV2ConnectorFrom;
      delete element.dataset.canvasV2ConnectorTo;
    }
    element.dataset.canvasV2ManualX = String(x);
    element.dataset.canvasV2ManualY = String(y);
    element.style.position = element.style.position || "relative";
    setGeometryStyle(element, "left", `${x}px`);
    setGeometryStyle(element, "top", `${y}px`);
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "resize") {
    const width = Math.max(Math.max(1, Math.min(24, storedDimension(element, "canvasV2ManualWidth") * 0.1)), finite(mutation.width, "Width"));
    const height = Math.max(Math.max(1, Math.min(24, storedDimension(element, "canvasV2ManualHeight") * 0.1)), finite(mutation.height, "Height"));
    element.dataset.canvasV2ManualWidth = String(width);
    element.dataset.canvasV2ManualHeight = String(height);
    setGeometryStyle(element, "width", `${width}px`);
    setGeometryStyle(element, "height", `${height}px`);
    setGeometryStyle(element, "max-width", "none");
    if (mutation.fontSize !== undefined) element.style.setProperty("font-size", `${Math.max(6, finite(mutation.fontSize, "Font size"))}px`, "important");
    if (mutation.lineHeight !== undefined) element.style.setProperty("line-height", `${Math.max(1, finite(mutation.lineHeight, "Line height"))}px`, "important");
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "transform") {
    const x = storedNumber(element, "canvasV2ManualX") + finite(mutation.deltaX, "Horizontal movement");
    const y = storedNumber(element, "canvasV2ManualY") + finite(mutation.deltaY, "Vertical movement");
    const width = Math.max(Math.max(1, Math.min(24, storedDimension(element, "canvasV2ManualWidth") * 0.1)), finite(mutation.width, "Width"));
    const height = Math.max(Math.max(1, Math.min(24, storedDimension(element, "canvasV2ManualHeight") * 0.1)), finite(mutation.height, "Height"));
    element.dataset.canvasV2ManualX = String(x);
    element.dataset.canvasV2ManualY = String(y);
    element.dataset.canvasV2ManualWidth = String(width);
    element.dataset.canvasV2ManualHeight = String(height);
    element.style.position = element.style.position || "relative";
    setGeometryStyle(element, "left", `${x}px`);
    setGeometryStyle(element, "top", `${y}px`);
    setGeometryStyle(element, "width", `${width}px`);
    setGeometryStyle(element, "height", `${height}px`);
    setGeometryStyle(element, "max-width", "none");
    if (mutation.fontSize !== undefined) element.style.setProperty("font-size", `${Math.max(6, finite(mutation.fontSize, "Font size"))}px`, "important");
    if (mutation.lineHeight !== undefined) element.style.setProperty("line-height", `${Math.max(1, finite(mutation.lineHeight, "Line height"))}px`, "important");
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "text") {
    if (element.childElementCount) throw new Error("Text editing is available only for a leaf node. Select a text node with its own stable identity.");
    element.textContent = mutation.text;
    if (mutation.layout?.width !== undefined) setGeometryStyle(element, "width", `${Math.max(1, finite(mutation.layout.width, "Text width"))}px`);
    if (mutation.layout?.height !== undefined) setGeometryStyle(element, "height", `${Math.max(1, finite(mutation.layout.height, "Text height"))}px`);
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "style") {
    if (!EDITABLE_STYLE_PROPERTIES.has(mutation.property)) throw new Error("That visual style is not editable on the canvas.");
    const value = safeStyleValue(mutation.property, mutation.value);
    if ((element.dataset.canvasV2Primitive === "drawing" || element.dataset.canvasV2Primitive === "connector") && mutation.property === "background-color") {
      element.querySelectorAll<SVGElement>("[stroke]").forEach((stroke) => {
        if (stroke.dataset.canvasV2ConnectorPart !== "hit") stroke.setAttribute("stroke", value);
      });
    } else element.style.setProperty(mutation.property, value, "important");
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "attribute") {
    if (mutation.name !== "alt" || element.tagName !== "IMG") throw new Error("Alt text is available only for an image object.");
    element.setAttribute("alt", mutation.value.trim().slice(0, 500));
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "image-source") {
    if (element.tagName !== "IMG" || element.dataset.canvasV2LocalImage !== "true") throw new Error("Replace is available only for a user image object.");
    element.setAttribute("src", safeLocalImageSource(mutation.src));
    if (mutation.alt !== undefined) element.setAttribute("alt", mutation.alt.trim().slice(0, 500));
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "connector-endpoint") {
    if (element.dataset.canvasV2Primitive !== "connector") throw new Error("Endpoints are available only for a connector object.");
    const prefix = mutation.endpoint === "from" ? "canvasV2ConnectorFrom" : "canvasV2ConnectorTo";
    element.dataset[`${prefix}X`] = String(finite(mutation.x, "Connector endpoint X"));
    element.dataset[`${prefix}Y`] = String(finite(mutation.y, "Connector endpoint Y"));
    const binding = mutation.endpoint === "from" ? "canvasV2ConnectorFrom" : "canvasV2ConnectorTo";
    if (mutation.attachNodeId) element.dataset[binding] = mutation.attachNodeId;
    else delete element.dataset[binding];
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "connector-curve") {
    if (element.dataset.canvasV2Primitive !== "connector" || element.dataset.canvasV2ConnectorVariant !== "curve") throw new Error("Curve adjustment is available only for a curved connector.");
    element.dataset.canvasV2ConnectorControlX = String(finite(mutation.x, "Connector control X"));
    element.dataset.canvasV2ConnectorControlY = String(finite(mutation.y, "Connector control Y"));
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "delete") {
    assertDeletableNode(element);
    element.remove();
  } else if (mutation.kind === "duplicate") {
    const clone = element.cloneNode(true) as HTMLElement;
    const identified = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))];
    identified.forEach((child, index) => { child.dataset.canvasV2NodeId = index ? `${mutation.newNodeId}-${index}` : mutation.newNodeId; });
    // Copies remain grounded to the same source asset, but they are analytical
    // reuse—not a second canonical rail. Downgrading the copied role keeps the
    // one authoritative evidence sequence unambiguous and safely deletable.
    [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("[data-canvas-v2-canonical-flow], [data-canvas-v2-evidence-role]"))].forEach((child) => {
      if (child.dataset.canvasV2EvidenceId) child.dataset.canvasV2EvidenceCopyOf = child.dataset.canvasV2EvidenceId;
      delete child.dataset.canvasV2CanonicalFlow;
      if (child.dataset.canvasV2EvidenceRole === "canonical") child.dataset.canvasV2EvidenceRole = "copy";
    });
    clone.style.position = clone.style.position || "relative";
    const cloneX = storedNumber(element, "canvasV2ManualX") + 24;
    const cloneY = storedNumber(element, "canvasV2ManualY") + 24;
    clone.dataset.canvasV2ManualX = String(cloneX);
    clone.dataset.canvasV2ManualY = String(cloneY);
    clone.style.left = `${cloneX}px`;
    clone.style.top = `${cloneY}px`;
    markUserEdit(clone, mutation.kind);
    element.insertAdjacentElement("afterend", clone);
  } else if (mutation.kind === "layer") {
    const parent = element.parentElement;
    if (!parent) throw new Error("The selected node has no layer parent.");
    if (mutation.direction === "front") parent.append(element);
    else if (mutation.direction === "back") parent.prepend(element);
    else if (mutation.direction === "forward" && element.nextElementSibling) element.nextElementSibling.insertAdjacentElement("afterend", element);
    else if (mutation.direction === "backward" && element.previousElementSibling) element.previousElementSibling.insertAdjacentElement("beforebegin", element);
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "visibility") {
    element.dataset.canvasV2Hidden = mutation.hidden ? "true" : "false";
    element.hidden = mutation.hidden;
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "lock") {
    element.dataset.canvasV2Locked = mutation.locked ? "true" : "false";
    markUserEdit(element, mutation.kind);
  } else if (mutation.kind === "rotate") {
    const rotation = finite(mutation.rotation, "Rotation");
    element.dataset.canvasV2Rotation = String(rotation);
    element.style.setProperty("rotate", `${rotation}deg`, "important");
    markUserEdit(element, mutation.kind);
  } else {
    if (element.dataset.canvasV2Group !== "true") throw new Error("Only an explicit North Star object group can be ungrouped.");
    const parent = element.parentElement;
    if (!parent) throw new Error("The selected group has no parent.");
    const groupX = storedNumber(element, "canvasV2ManualX");
    const groupY = storedNumber(element, "canvasV2ManualY");
    const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && Boolean(child.dataset.canvasV2NodeId));
    for (const child of children) {
      const x = groupX + storedNumber(child, "canvasV2ManualX");
      const y = groupY + storedNumber(child, "canvasV2ManualY");
      child.dataset.canvasV2ManualX = String(x);
      child.dataset.canvasV2ManualY = String(y);
      child.style.position = "absolute";
      setGeometryStyle(child, "left", `${x}px`);
      setGeometryStyle(child, "top", `${y}px`);
      markUserEdit(child, "ungroup");
      parent.insertBefore(child, element);
    }
    element.remove();
  }

  return assertCanvasV2ArtifactDocument({
    ...artifact,
    html: parsed.body.innerHTML,
  });
}

function applyCanvasV2GroupMutation(
  artifact: CanvasV2ArtifactDocument,
  mutation: Extract<CanvasV2AtomicManualMutation, { kind: "group" }>,
): CanvasV2ArtifactDocument {
  if (typeof DOMParser === "undefined") throw new Error("Manual canvas mutations require a browser document.");
  if (mutation.items.length < 2) throw new Error("Select at least two objects to create a group.");
  const parsed = new DOMParser().parseFromString(`<body>${artifact.html}</body>`, "text/html");
  if (Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).some((candidate) => candidate.dataset.canvasV2NodeId === mutation.groupNodeId)) throw new Error("A group requires a unique stable identity.");
  const elements = mutation.items.map((item) => ({ item, element: findUniqueNode(parsed, item.nodeId) }));
  for (const { element } of elements) assertMutableNode(element);
  const ids = new Set(elements.map(({ item }) => item.nodeId));
  if (elements.some(({ element }) => {
    const parentId = element.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]")?.dataset.canvasV2NodeId;
    return Boolean(parentId && ids.has(parentId));
  })) throw new Error("Select either a parent object or its child, not both.");
  const group = parsed.createElement("section");
  group.dataset.canvasV2NodeId = mutation.groupNodeId;
  group.dataset.canvasV2Group = "true";
  group.dataset.canvasV2ManualX = String(finite(mutation.bounds.x, "Group X"));
  group.dataset.canvasV2ManualY = String(finite(mutation.bounds.y, "Group Y"));
  group.dataset.canvasV2ManualWidth = String(Math.max(24, finite(mutation.bounds.width, "Group width")));
  group.dataset.canvasV2ManualHeight = String(Math.max(24, finite(mutation.bounds.height, "Group height")));
  if (mutation.label) group.setAttribute("aria-label", mutation.label);
  group.style.cssText = `position:absolute;left:${mutation.bounds.x}px;top:${mutation.bounds.y}px;width:${mutation.bounds.width}px;height:${mutation.bounds.height}px;max-width:none;overflow:visible;`;
  markUserEdit(group, "group");
  for (const { item, element } of elements) {
    const localX = finite(item.bounds.x - mutation.bounds.x, "Grouped object X");
    const localY = finite(item.bounds.y - mutation.bounds.y, "Grouped object Y");
    element.dataset.canvasV2ManualX = String(localX);
    element.dataset.canvasV2ManualY = String(localY);
    element.style.position = "absolute";
    setGeometryStyle(element, "left", `${localX}px`);
    setGeometryStyle(element, "top", `${localY}px`);
    markUserEdit(element, "group");
    group.append(element);
  }
  // Groups are first-class canvas objects. They belong to the document's
  // object plane, never inside the legacy composition root whose authored
  // dimensions may be smaller than the finite Patch 8 canvas.
  parsed.body.append(group);
  return assertCanvasV2ArtifactDocument({ ...artifact, html: parsed.body.innerHTML });
}

export function describeCanvasV2ManualMutation(mutation: CanvasV2ManualMutation): string {
  if (mutation.kind === "batch") return mutation.label;
  if (mutation.kind === "move") return `Moved ${mutation.nodeId} by ${Math.round(mutation.deltaX)} × ${Math.round(mutation.deltaY)} pixels.`;
  if (mutation.kind === "resize") return `Resized ${mutation.nodeId} to ${Math.round(mutation.width)} × ${Math.round(mutation.height)} pixels.`;
  if (mutation.kind === "transform") return `Transformed ${mutation.nodeId} by ${Math.round(mutation.deltaX)} × ${Math.round(mutation.deltaY)} to ${Math.round(mutation.width)} × ${Math.round(mutation.height)} pixels.`;
  if (mutation.kind === "text") return `Updated text in ${mutation.nodeId}.`;
  if (mutation.kind === "style") return `Updated ${mutation.property} for ${mutation.nodeId}.`;
  if (mutation.kind === "attribute") return `Updated ${mutation.name} for ${mutation.nodeId}.`;
  if (mutation.kind === "image-source") return `Replaced image ${mutation.nodeId}.`;
  if (mutation.kind === "connector-endpoint") return `${mutation.attachNodeId ? "Attached" : "Moved"} the ${mutation.endpoint} end of ${mutation.nodeId}.`;
  if (mutation.kind === "connector-curve") return `Adjusted the curve of ${mutation.nodeId}.`;
  if (mutation.kind === "delete") return `Deleted ${mutation.nodeId}.`;
  if (mutation.kind === "duplicate") return `Duplicated ${mutation.nodeId}.`;
  if (mutation.kind === "layer") return `Moved ${mutation.nodeId} ${mutation.direction} in its layer stack.`;
  if (mutation.kind === "visibility") return `${mutation.hidden ? "Hid" : "Showed"} ${mutation.nodeId}.`;
  if (mutation.kind === "lock") return `${mutation.locked ? "Locked" : "Unlocked"} ${mutation.nodeId}.`;
  if (mutation.kind === "rotate") return `Rotated ${mutation.nodeId} to ${Math.round(mutation.rotation)} degrees.`;
  if (mutation.kind === "group") return `Grouped ${mutation.items.length} objects as ${mutation.groupNodeId}.`;
  if (mutation.kind === "ungroup") return `Ungrouped ${mutation.nodeId}.`;
  return `Created ${mutation.primitive} ${mutation.nodeId}.`;
}
