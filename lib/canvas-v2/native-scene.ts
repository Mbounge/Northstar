import type { CanvasV2ArtifactDocument, CanvasV2ArtifactRevision, CanvasV2ElementBounds, CanvasV2RenderObservation, CanvasV2SurfaceZoneId } from "@/lib/canvas-v2/types";
import type { CanvasV2BoardObjectKind } from "@/lib/canvas-v2/board-object-graph";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import type { CanvasV2ManualMutation } from "@/lib/canvas-v2/manual-mutations";
import { findCanvasV2OpenPlacement } from "@/lib/canvas-v2/multiplayer-placement";

export const CANVAS_V2_NATIVE_SCENE_SCHEMA = "canvas-v2.native-scene.v1" as const;

export interface CanvasV2NativeSceneGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface CanvasV2NativeSceneNode {
  id: string;
  sourceNodeId?: string;
  parentId?: string;
  /** Evidence/source nesting retained only for compatibility serialization. */
  detachedFromParentId?: string;
  detachedFromParentIndex?: number;
  childIds: string[];
  order: number;
  tagName: string;
  namespace: "html" | "svg";
  layoutMode: "absolute" | "flow";
  kind: CanvasV2BoardObjectKind;
  selectable: boolean;
  hidden: boolean;
  locked: boolean;
  canonicalEvidence: boolean;
  userEdited: boolean;
  lastAuthor?: "user" | "northstar";
  editVersion: number;
  geometry: CanvasV2NativeSceneGeometry;
  attributes: Record<string, string>;
  inlineStyle: Record<string, string>;
  /**
   * Browser-resolved visual style captured by the isolated compiler. It is
   * deliberately separate from authored inline style until an object leaves
   * its CSS ancestry; detachment then materializes it so reparenting cannot
   * change typography, paint, or the layout of nested content.
   */
  resolvedStyle?: Record<string, string>;
  directText?: string;
  content: Array<{ kind: "text"; value: string } | { kind: "node"; id: string }>;
  evidence?: {
    id: string;
    role?: string;
    sourceNodeId?: string;
  };
}

export interface CanvasV2NativeSceneDocument {
  schema: typeof CANVAS_V2_NATIVE_SCENE_SCHEMA;
  revisionId: string;
  width: number;
  height: number;
  css: string;
  rootIds: string[];
  nodes: CanvasV2NativeSceneNode[];
}

/**
 * A selected group owns pointer interaction for every node in its subtree.
 * Browsers hit-test the deepest painted child, but canvas selection semantics
 * must resolve that leaf back to the already-selected ancestor before a drag
 * begins. The stable source identity is used because that is what the public
 * selection model exposes.
 */
export function canvasV2NativeSceneSelectionContainsTarget(
  scene: CanvasV2NativeSceneDocument | undefined,
  selectedNodeIds: readonly string[],
  targetNodeId: string,
): boolean {
  if (!scene || !selectedNodeIds.length) return false;
  const selected = new Set(selectedNodeIds);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const bySelectionId = new Map(scene.nodes.map((node) => [node.sourceNodeId ?? node.id, node]));
  let current = bySelectionId.get(targetNodeId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (selected.has(current.sourceNodeId ?? current.id)) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function cssAngleDegrees(value: string): number {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(deg|rad|grad|turn)$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  switch (match[2].toLowerCase()) {
    case "rad": return amount * 180 / Math.PI;
    case "grad": return amount * 0.9;
    case "turn": return amount * 360;
    default: return amount;
  }
}

/**
 * CSS transforms paint outside an element's untransformed border box.
 * getBoundingClientRect() therefore returns an axis-aligned *painted* box,
 * which cannot be reused as native geometry without losing the transform.
 * Reduce the computed transform into the rotation and scale that the native
 * object model owns; translation remains represented by the painted center.
 */
function computedTransformMetrics(computed?: CSSStyleDeclaration): {
  rotation: number;
  scaleX: number;
  scaleY: number;
} {
  if (!computed) return { rotation: 0, scaleX: 1, scaleY: 1 };
  let rotation = cssAngleDegrees(computed.getPropertyValue("rotate"));
  let scaleX = 1;
  let scaleY = 1;
  const individualScale = computed.getPropertyValue("scale").trim();
  if (individualScale && individualScale !== "none") {
    const values = individualScale.split(/\s+/).map(Number).filter(Number.isFinite);
    if (values[0] !== undefined) scaleX *= Math.abs(values[0]);
    if (values[1] !== undefined) scaleY *= Math.abs(values[1]);
    else if (values[0] !== undefined) scaleY *= Math.abs(values[0]);
  }
  const transform = computed.transform.trim();
  const matrix = transform.match(/^matrix\(([^)]+)\)$/i);
  const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/i);
  const values = (matrix?.[1] ?? matrix3d?.[1])?.split(",").map(Number);
  if (values?.every(Number.isFinite)) {
    const a = values[0];
    const b = values[1];
    const c = matrix ? values[2] : values[4];
    const d = matrix ? values[3] : values[5];
    const matrixScaleX = Math.hypot(a, b);
    const determinant = a * d - b * c;
    const matrixScaleY = matrixScaleX > 0 ? Math.abs(determinant) / matrixScaleX : Math.hypot(c, d);
    if (matrixScaleX > 0) scaleX *= matrixScaleX;
    if (matrixScaleY > 0) scaleY *= matrixScaleY;
    rotation += Math.atan2(b, a) * 180 / Math.PI;
  }
  return {
    rotation: round(rotation),
    scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
    scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
  };
}

function nativeMeasuredGeometry(
  element: Element,
  rect: DOMRect,
  parentRect: DOMRect,
  computed?: CSSStyleDeclaration,
): Pick<CanvasV2NativeSceneGeometry, "x" | "y" | "width" | "height" | "rotation"> {
  const metrics = computedTransformMetrics(computed);
  const offsetWidth = Number((element as HTMLElement).offsetWidth);
  const offsetHeight = Number((element as HTMLElement).offsetHeight);
  const width = round((Number.isFinite(offsetWidth) && offsetWidth > 0 ? offsetWidth : rect.width) * metrics.scaleX);
  const height = round((Number.isFinite(offsetHeight) && offsetHeight > 0 ? offsetHeight : rect.height) * metrics.scaleY);
  // Normalize every source transform around the native object's center. The
  // painted center is invariant under a change of transform-origin, so this
  // preserves the exact visible placement while giving the editor one
  // consistent resize/rotate/selection lifecycle.
  return {
    x: round(rect.left + rect.width / 2 - parentRect.left - width / 2),
    y: round(rect.top + rect.height / 2 - parentRect.top - height / 2),
    width,
    height,
    rotation: metrics.rotation,
  };
}

function kindFor(element: Element): CanvasV2BoardObjectKind {
  const html = element as HTMLElement;
  const nodeId = html.dataset?.canvasV2NodeId;
  if (html.dataset?.canvasV2WorkspaceRoot === "true" || html.dataset?.canvasV2PermanentRoot === "true" || nodeId === "canvas") return "root";
  if (html.dataset?.canvasV2Group === "true") return "group";
  if (html.dataset?.canvasV2IslandId || html.dataset?.canvasV2DesignRegion !== undefined) return "island";
  if (html.dataset?.canvasV2EvidenceId) return element.tagName === "IMG" ? "image" : "evidence";
  if (element.tagName === "IMG") return "image";
  if (/^H[1-6]$/.test(element.tagName) || ["P", "SPAN", "SMALL", "STRONG", "EM", "LABEL", "BUTTON"].includes(element.tagName)) return "text";
  if (element.tagName === "TABLE") return "table";
  if (html.dataset?.canvasV2UserEdited?.includes("create") && element.tagName === "SECTION") return "frame";
  if (["SVG", "PATH", "LINE", "CIRCLE", "RECT", "POLYGON", "POLYLINE", "ELLIPSE"].includes(element.tagName)) return "shape";
  return "object";
}

function inlineStyle(element: Element): Record<string, string> {
  const style = (element as HTMLElement | SVGElement).style;
  const entries: Array<[string, string]> = [];
  for (let index = 0; index < style.length; index += 1) {
    const property = style.item(index);
    const value = style.getPropertyValue(property);
    if (property && value) entries.push([property, value]);
  }
  return Object.fromEntries(entries);
}

const DETACHMENT_STYLE_PROPERTIES = [
  "display",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variant",
  "font-feature-settings",
  "font-kerning",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration-line",
  "text-decoration-color",
  "text-decoration-style",
  "text-transform",
  "text-indent",
  "text-shadow",
  "white-space",
  "word-break",
  "overflow-wrap",
  "writing-mode",
  "background-color",
  "background-image",
  "background-position",
  "background-size",
  "background-repeat",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "opacity",
  "filter",
  "mix-blend-mode",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "overflow-x",
  "overflow-y",
  "grid-template-columns",
  "grid-template-rows",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "column-gap",
  "row-gap",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "align-content",
  "object-fit",
  "object-position",
  "fill",
  "stroke",
  "stroke-width",
] as const;

const DETACHMENT_TEXT_STYLE_PROPERTIES = new Set<string>([
  "display",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variant",
  "font-feature-settings",
  "font-kerning",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration-line",
  "text-decoration-color",
  "text-decoration-style",
  "text-transform",
  "text-indent",
  "text-shadow",
  "white-space",
  "word-break",
  "overflow-wrap",
  "writing-mode",
  "background-color",
  "background-image",
  "background-position",
  "background-size",
  "background-repeat",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "opacity",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
]);

function resolvedDetachmentStyle(computed?: CSSStyleDeclaration): Record<string, string> {
  if (!computed) return {};
  return Object.fromEntries(DETACHMENT_STYLE_PROPERTIES.flatMap((property) => {
    const value = computed.getPropertyValue(property).trim();
    return value ? [[property, value] as const] : [];
  }));
}

function safeAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name === "style" || name === "class" || name === "contenteditable" || name.startsWith("on")) continue;
    if (name === "srcdoc" || name === "sandbox") continue;
    attributes[attribute.name] = attribute.value;
  }
  if (element.getAttribute("class")) attributes.class = element.getAttribute("class")!;
  return attributes;
}

function directText(element: Element): string | undefined {
  const value = Array.from(element.childNodes)
    .filter((node) => node.nodeType === node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("");
  return value ? value : undefined;
}

/**
 * Compile a fully laid-out HTML candidate into the live native scene format.
 * The iframe document is an isolated measuring instrument: none of its DOM
 * nodes, focus state, scrolling, or coordinate system survives this boundary.
 */
export function compileCanvasV2NativeScene(input: {
  document: Document;
  revision: CanvasV2ArtifactRevision;
  width: number;
  height: number;
  /**
   * The committed scene that existed before this candidate was authored.
   * Source HTML is not allowed to become a second placement authority: an
   * unchanged object keeps its existing world position while only genuinely
   * new top-level objects search for open territory around it.
   */
  placementReferenceScene?: CanvasV2NativeSceneDocument;
}): CanvasV2NativeSceneDocument {
  const bodyRect = input.document.body.getBoundingClientRect();
  const allElements = Array.from(input.document.body.querySelectorAll("*"))
    .filter((element) => !["SCRIPT", "STYLE", "LINK", "META", "BASE", "TEMPLATE"].includes(element.tagName));
  const runtimeIds = new Map<Element, string>();
  const usedIds = new Set<string>();
  let renderSequence = 0;
  for (const [elementIndex, element] of allElements.entries()) {
    let sourceNodeId = element.getAttribute("data-canvas-v2-node-id")?.trim();
    if (!sourceNodeId && element.children.length === 0) {
      const computed = input.document.defaultView?.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const tagIsPrimitive = /^(H[1-6]|P|SPAN|SMALL|STRONG|EM|LABEL|BUTTON|HR|SVG|PATH|LINE|CIRCLE|RECT|POLYGON|POLYLINE|ELLIPSE)$/.test(element.tagName);
      const hasPaint = Boolean(element.textContent?.trim())
        || element.tagName === "HR"
        || computed?.backgroundColor !== "rgba(0, 0, 0, 0)"
        || ["top", "right", "bottom", "left"].some((edge) => (
          Number.parseFloat(computed?.getPropertyValue(`border-${edge}-width`) ?? "0") > 0
          && computed?.getPropertyValue(`border-${edge}-style`) !== "none"
        ));
      if (rect.width > 0 && rect.height > 0 && computed?.display !== "none" && computed?.visibility !== "hidden" && (tagIsPrimitive || hasPaint)) {
        sourceNodeId = `primitive-${elementIndex + 1}`;
        while (usedIds.has(sourceNodeId)) sourceNodeId = `${sourceNodeId}-leaf`;
        // Visible authored leaves are canvas objects even if a model or legacy
        // template omitted identity. Persist the synthesized ID immediately so
        // subsequent edits and model turns retain the same multiplayer object.
        element.setAttribute("data-canvas-v2-node-id", sourceNodeId);
      }
    }
    let id = sourceNodeId || `render-${input.revision.id}-${++renderSequence}`;
    while (usedIds.has(id)) id = `${id}-${++renderSequence}`;
    usedIds.add(id);
    runtimeIds.set(element, id);
  }

  const nodes = allElements.map((element, order): CanvasV2NativeSceneNode => {
    const id = runtimeIds.get(element)!;
    const sourceNodeId = element.getAttribute("data-canvas-v2-node-id")?.trim() || undefined;
    const parentElement = element.parentElement && runtimeIds.has(element.parentElement) ? element.parentElement : undefined;
    const parentId = parentElement ? runtimeIds.get(parentElement) : undefined;
    const parentRect = parentElement?.getBoundingClientRect() ?? bodyRect;
    const rect = element.getBoundingClientRect();
    const computed = input.document.defaultView?.getComputedStyle(element);
    const html = element as HTMLElement;
    const measuredGeometry = nativeMeasuredGeometry(element, rect, parentRect, computed);
    const nativeMetric = (property: string, fallback: number) => {
      // Browser measurements are normalized once when compatibility HTML is
      // first compiled. A serialized native scene already owns exact world
      // geometry, so reading and rounding it again would make untouched
      // collaborator objects drift by a hundredth of a pixel on every AI
      // revision.
      if (!html.dataset?.canvasV2SceneLayout) return round(fallback);
      const value = Number.parseFloat(html.style.getPropertyValue(property));
      return Number.isFinite(value) ? value : round(fallback);
    };
    const evidenceId = html.dataset?.canvasV2EvidenceId;
    const attributes = safeAttributes(element);
    attributes["data-canvas-v2-native-runtime-node"] = "true";
    attributes["data-canvas-v2-native-scene-id"] = id;
    if (sourceNodeId) attributes["data-canvas-v2-node-id"] = sourceNodeId;
    return {
      id,
      ...(sourceNodeId ? { sourceNodeId } : {}),
      ...(parentId ? { parentId } : {}),
      childIds: Array.from(element.children).flatMap((child) => runtimeIds.get(child) ?? []),
      order,
      tagName: element.tagName.toLowerCase(),
      namespace: element.namespaceURI === SVG_NAMESPACE ? "svg" : "html",
      layoutMode: parentElement && computed?.position !== "absolute" && computed?.position !== "fixed" ? "flow" : "absolute",
      kind: kindFor(element),
      selectable: Boolean(sourceNodeId) && kindFor(element) !== "root",
      hidden: html.hidden || computed?.display === "none" || computed?.visibility === "hidden",
      locked: html.dataset?.canvasV2Locked === "true" || kindFor(element) === "root",
      canonicalEvidence: Boolean(element.closest("[data-canvas-v2-canonical-flow]")),
      userEdited: Boolean(html.dataset?.canvasV2UserEdited),
      ...(html.dataset?.canvasV2LastAuthor === "user" || html.dataset?.canvasV2LastAuthor === "northstar"
        ? { lastAuthor: html.dataset.canvasV2LastAuthor }
        : {}),
      editVersion: Number(html.dataset?.canvasV2EditVersion) || 0,
      geometry: {
        // A compatibility document serialized from native truth carries the
        // untransformed scene rectangle explicitly. getBoundingClientRect()
        // is an axis-aligned box *after* rotation; feeding that back as base
        // geometry and then rotating it again causes delayed jumps, growth,
        // and apparent image copies. Browser measurement is used only for the
        // first HTML-to-native compilation.
        x: nativeMetric("--canvas-v2-scene-x", measuredGeometry.x),
        y: nativeMetric("--canvas-v2-scene-y", measuredGeometry.y),
        width: nativeMetric("--canvas-v2-scene-width", measuredGeometry.width),
        height: nativeMetric("--canvas-v2-scene-height", measuredGeometry.height),
        rotation: nativeMetric("--canvas-v2-scene-rotation", measuredGeometry.rotation),
        zIndex: Number.parseInt(computed?.zIndex ?? "0", 10) || 0,
      },
      attributes,
      inlineStyle: inlineStyle(element),
      resolvedStyle: resolvedDetachmentStyle(computed),
      ...(directText(element) !== undefined ? { directText: directText(element) } : {}),
      content: Array.from(element.childNodes).reduce<CanvasV2NativeSceneNode["content"]>((content, child) => {
        if (child.nodeType === child.TEXT_NODE) {
          if (child.textContent) content.push({ kind: "text", value: child.textContent });
          return content;
        }
        if (child.nodeType === child.ELEMENT_NODE) {
          const id = runtimeIds.get(child as Element);
          if (id) content.push({ kind: "node", id });
        }
        return content;
      }, []),
      ...(evidenceId ? {
        evidence: {
          id: evidenceId,
          ...(html.dataset?.canvasV2EvidenceRole ? { role: html.dataset.canvasV2EvidenceRole } : {}),
          ...(html.dataset?.canvasV2EvidenceCopyOf ? { sourceNodeId: html.dataset.canvasV2EvidenceCopyOf } : {}),
        },
      } : {}),
    };
  });

  // Generated HTML commonly uses stable IDs on both a semantic wrapper and
  // every painted object inside it. The wrapper is layout structure, not an
  // implicit Figma group. Making both levels selectable produced enormous
  // island/flow boundaries and made precise marquee selection impossible.
  // Keep explicit user-created groups selectable, but otherwise expose the
  // deepest stable objects only. A text node that merely contains an
  // unaddressed <em>/<strong> child remains selectable as one object.
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const hasStableDescendant = (node: CanvasV2NativeSceneNode): boolean => {
    const pending = [...node.childIds];
    const visited = new Set<string>();
    while (pending.length) {
      const childId = pending.pop()!;
      if (visited.has(childId)) continue;
      visited.add(childId);
      const child = nodesById.get(childId);
      if (!child) continue;
      if (child.sourceNodeId) return true;
      pending.push(...child.childIds);
    }
    return false;
  };
  for (const node of nodes) {
    const explicitGroup = node.attributes["data-canvas-v2-group"] === "true";
    if (!explicitGroup && hasStableDescendant(node)) node.selectable = false;
  }

  // Source documents from early V2 phases may place authored siblings directly
  // on the body, while newer documents keep them beneath a full-workspace
  // compatibility root. Normalize both forms into the same useful opening
  // territory. This is a one-time scene compilation offset, never a camera
  // change, so zoom and pan remain wholly user-owned.
  const preferredLeft = CANVAS_V2_WORKSPACE.aiAuthoringOriginX;
  const preferredTop = CANVAS_V2_WORKSPACE.aiAuthoringInset;
  const roots = nodes.filter((node) => !node.parentId);
  const fullWorkspaceRoot = roots.find((node) => node.kind === "root" && node.geometry.width >= input.width * 0.9);
  const placementNodes = fullWorkspaceRoot
    ? nodes.filter((node) => node.parentId === fullWorkspaceRoot.id)
    : roots;
  const visiblePlacementNodes = placementNodes.filter((node) => !node.hidden && node.geometry.width > 0 && node.geometry.height > 0);
  const referenceScene = input.placementReferenceScene;
  const referencedNodeIds = new Set<string>();
  if (referenceScene) {
    for (const node of visiblePlacementNodes) {
      if (!node.sourceNodeId) continue;
      const referenceBounds = nativeAbsoluteBounds(referenceScene, node.sourceNodeId);
      if (!referenceBounds) continue;
      // Preserve the durable anchor, but retain the candidate's newly
      // measured footprint so intentional content/style updates can grow.
      node.geometry.x = round(referenceBounds.x - (fullWorkspaceRoot?.geometry.x ?? 0));
      node.geometry.y = round(referenceBounds.y - (fullWorkspaceRoot?.geometry.y ?? 0));
      referencedNodeIds.add(node.id);
    }
  }
  const alreadyPlacedNodes = visiblePlacementNodes.filter((node) => (
    referencedNodeIds.has(node.id) || Boolean(node.attributes["data-canvas-v2-scene-layout"])
  ));
  const newlyMeasuredNodes = visiblePlacementNodes.filter((node) => !alreadyPlacedNodes.includes(node));
  if (newlyMeasuredNodes.length) {
    const inset = CANVAS_V2_WORKSPACE.aiAuthoringInset;
    const placementOriginX = fullWorkspaceRoot?.geometry.x ?? 0;
    const placementOriginY = fullWorkspaceRoot?.geometry.y ?? 0;
    const placementWidth = fullWorkspaceRoot?.geometry.width ?? input.width;
    const placementHeight = fullWorkspaceRoot?.geometry.height ?? input.height;
    const bounds = {
      x: Math.max(0, CANVAS_V2_WORKSPACE.aiAuthoringOriginX - placementOriginX),
      y: Math.max(0, inset - placementOriginY),
      width: Math.min(placementWidth, input.width - inset - placementOriginX)
        - Math.max(0, CANVAS_V2_WORKSPACE.aiAuthoringOriginX - placementOriginX),
      height: Math.min(placementHeight, input.height - inset - placementOriginY)
        - Math.max(0, inset - placementOriginY),
    };
    const obstacles = alreadyPlacedNodes.map((node) => ({
        nodeId: node.sourceNodeId ?? node.id,
        x: node.geometry.x,
        y: node.geometry.y,
        width: node.geometry.width,
        height: node.geometry.height,
      }));
    // Place each new top-level object as its own multiplayer participant.
    // Bundling several newly-authored roots into one huge footprint made one
    // awkward sibling force the entire turn back onto occupied evidence. Each
    // accepted placement becomes the next obstacle, so sequential additions
    // remain collision-free without moving existing user/research objects.
    for (const node of newlyMeasuredNodes) {
      const footprint = { width: node.geometry.width, height: node.geometry.height };
      const isGroundedEvidence = node.attributes.class?.split(/\s+/).includes("canvas-v2-grounded-evidence")
        || node.childIds.some((childId) => nodesById.get(childId)?.attributes["data-canvas-v2-canonical-flow"] !== undefined);
      const placement = findCanvasV2OpenPlacement({
        preferred: {
          x: preferredLeft - placementOriginX,
          // Reserve a real narrative opening above the first canonical atlas.
          // This is world-space placement, not a camera offset, so a later
          // title and reading axis can occupy the opening without moving or
          // covering already grounded research.
          y: preferredTop - placementOriginY + (isGroundedEvidence ? 600 : 0),
        },
        bounds,
        footprint,
        obstacles,
      });
      if (placement) {
        node.geometry.x = round(placement.x);
        node.geometry.y = round(placement.y);
      } else {
        // Keep the measured candidate finite so validation can report the
        // genuine lack of territory. Never fabricate a preferred-position
        // fallback that silently overlaps an existing canvas participant.
        node.geometry.x = round(Math.max(bounds.x, Math.min(node.geometry.x, bounds.x + bounds.width - footprint.width)));
        node.geometry.y = round(Math.max(bounds.y, Math.min(node.geometry.y, bounds.y + bounds.height - footprint.height)));
      }
      obstacles.push({
        nodeId: node.sourceNodeId ?? node.id,
        x: node.geometry.x,
        y: node.geometry.y,
        width: footprint.width,
        height: footprint.height,
      });
    }
  }

  const compiledScene: CanvasV2NativeSceneDocument = {
    schema: CANVAS_V2_NATIVE_SCENE_SCHEMA,
    revisionId: input.revision.id,
    width: input.width,
    height: input.height,
    css: input.revision.document.css,
    rootIds: nodes.filter((node) => !node.parentId).map((node) => node.id),
    nodes,
  };
  // Earlier 8C revisions made a visually moved child absolute but left its
  // structural parent attached. Upgrade those revisions at the compiler
  // boundary: a user-moved object that was not subsequently regrouped is a
  // root-level canvas object and must not follow its former group later.
  normalizeUserDetachedNodes(compiledScene);
  return compiledScene;
}

export function canvasV2NativeSceneNodeMap(scene: CanvasV2NativeSceneDocument): Map<string, CanvasV2NativeSceneNode> {
  return new Map(scene.nodes.map((node) => [node.id, node]));
}

export function canvasV2NativeSceneSourceNodeMap(scene: CanvasV2NativeSceneDocument): Map<string, CanvasV2NativeSceneNode> {
  return new Map(scene.nodes.flatMap((node) => node.sourceNodeId ? [[node.sourceNodeId, node] as const] : []));
}

function nativeAbsoluteBounds(
  scene: CanvasV2NativeSceneDocument,
  sourceNodeId: string | undefined,
): CanvasV2ElementBounds | undefined {
  if (!sourceNodeId) return undefined;
  const byId = canvasV2NativeSceneNodeMap(scene);
  const node = scene.nodes.find((candidate) => candidate.sourceNodeId === sourceNodeId);
  if (!node) return undefined;
  let x = node.geometry.x;
  let y = node.geometry.y;
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.geometry.x;
    y += parent.geometry.y;
    parentId = parent.parentId;
  }
  return {
    nodeId: sourceNodeId,
    x: round(x),
    y: round(y),
    width: node.geometry.width,
    height: node.geometry.height,
  };
}

function unionNativeBounds(bounds: readonly CanvasV2ElementBounds[]): CanvasV2ElementBounds | undefined {
  if (!bounds.length) return undefined;
  const x = Math.min(...bounds.map((item) => item.x));
  const y = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: round(x), y: round(y), width: round(right - x), height: round(bottom - y) };
}

function nativeIntersectionArea(left: CanvasV2ElementBounds, right: CanvasV2ElementBounds): number {
  return Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
}

/**
 * Candidate screenshots are measured in the isolated HTML compiler, while
 * the public editor renders the translated native scene. Persisted model
 * context must describe that public world-space truth—especially after a
 * human object already owns coordinates and a later AI turn is placed around
 * it. This projection keeps the full visual observation but replaces every
 * stable-node footprint used for placement with native absolute geometry.
 */
export function projectCanvasV2ObservationToNativeScene(
  observation: CanvasV2RenderObservation,
  scene: CanvasV2NativeSceneDocument,
): CanvasV2RenderObservation {
  if (observation.revisionId !== scene.revisionId) return observation;
  const projectBounds = (bounds: CanvasV2ElementBounds, nodeId: string) => nativeAbsoluteBounds(scene, nodeId) ?? bounds;
  const authoredSurface = observation.spatial.authoredSurface;
  const canvasBounds = { x: 0, y: 0, width: scene.width, height: scene.height };
  const projectedEvidence = observation.spatial.evidence.map((item) => ({ ...item, bounds: projectBounds(item.bounds, item.nodeId) }));
  const projectedRegions = observation.spatial.designRegions?.map((region) => {
    const bounds = projectBounds(region.bounds, region.nodeId);
    return {
      ...region,
      bounds,
      canvasWidthShare: round(bounds.width / Math.max(1, scene.width)),
      canvasHeightShare: round(bounds.height / Math.max(1, scene.height)),
      canvasAreaShare: round((bounds.width * bounds.height) / Math.max(1, scene.width * scene.height)),
      centerXShare: round((bounds.x + bounds.width / 2) / Math.max(1, scene.width)),
      centerYShare: round((bounds.y + bounds.height / 2) / Math.max(1, scene.height)),
      edgeSpace: {
        left: round(bounds.x),
        top: round(bounds.y),
        right: round(scene.width - bounds.x - bounds.width),
        bottom: round(scene.height - bounds.y - bounds.height),
      },
    };
  });
  const projectedOccupants = authoredSurface?.placementOccupants?.map((occupant) => ({
    ...occupant,
    bounds: projectBounds(occupant.bounds, occupant.nodeId),
  }));
  const canonicalLanes = scene.nodes.flatMap((node) => {
    if (!node.sourceNodeId || node.attributes["data-canvas-v2-canonical-flow"] === undefined) return [];
    const bounds = nativeAbsoluteBounds(scene, node.sourceNodeId);
    return bounds ? [{ nodeId: node.sourceNodeId, bounds }] : [];
  });
  const projectedCanonicalLaneBounds = unionNativeBounds(canonicalLanes.map((lane) => lane.bounds))
    ?? unionNativeBounds(projectedEvidence.filter((item) => item.role === "canonical" && item.visible).map((item) => item.bounds));
  const projectedAuthoredBounds = unionNativeBounds((projectedRegions ?? []).map((region) => region.bounds));
  const projectedAnalysisEvidenceBounds = unionNativeBounds(projectedEvidence
    .filter((item) => item.role === "analysis-copy" && item.visible)
    .map((item) => item.bounds));
  const readingOrder = [...(projectedRegions ?? [])]
    .sort((left, right) => {
      const verticalDelta = left.bounds.y - right.bounds.y;
      const rowTolerance = Math.max(24, Math.min(left.bounds.height, right.bounds.height) * 0.18);
      return Math.abs(verticalDelta) <= rowTolerance ? left.bounds.x - right.bounds.x : verticalDelta;
    })
    .map((region) => region.nodeId);
  const surfaceZones = authoredSurface ? (["top", "middle", "bottom"] as const).flatMap((row, rowIndex) => (
    (["left", "center", "right"] as const).map((column, columnIndex) => {
      const bounds: CanvasV2ElementBounds = {
        x: round(scene.width * columnIndex / 3),
        y: round(scene.height * rowIndex / 3),
        width: round(scene.width / 3),
        height: round(scene.height / 3),
      };
      const occupants = (projectedOccupants ?? []).filter((occupant) => nativeIntersectionArea(occupant.bounds, bounds) > 4);
      const occupiedArea = Math.min(bounds.width * bounds.height, occupants.reduce((sum, occupant) => sum + nativeIntersectionArea(occupant.bounds, bounds), 0));
      const area = Math.max(1, bounds.width * bounds.height);
      return {
        id: `${row}-${column}` as CanvasV2SurfaceZoneId,
        bounds,
        designRegionNodeIds: (projectedRegions ?? []).filter((region) => nativeIntersectionArea(region.bounds, bounds) > 4).map((region) => region.nodeId),
        canonicalLaneNodeIds: canonicalLanes.filter((lane) => nativeIntersectionArea(lane.bounds, bounds) > 4).map((lane) => lane.nodeId),
        occupantNodeIds: occupants.map((occupant) => occupant.nodeId),
        userOwnedNodeIds: occupants.filter((occupant) => occupant.owner === "user").map((occupant) => occupant.nodeId),
        occupiedAreaShare: round(occupiedArea / area),
        availableAreaShare: round(1 - occupiedArea / area),
      };
    })
  )) : undefined;
  return {
    ...observation,
    contentBounds: canvasBounds,
    spatial: {
      ...observation.spatial,
      nodes: observation.spatial.nodes.map((node) => ({ ...node, bounds: projectBounds(node.bounds, node.nodeId) })),
      evidence: projectedEvidence,
      designRegions: projectedRegions,
      authoredRelationships: observation.spatial.authoredRelationships?.map((relationship) => ({
        ...relationship,
        bounds: projectBounds(relationship.bounds, relationship.nodeId),
      })),
      authoredAnnotations: observation.spatial.authoredAnnotations?.map((annotation) => ({
        ...annotation,
        bounds: projectBounds(annotation.bounds, annotation.nodeId),
      })),
      ...(authoredSurface ? {
        authoredSurface: {
          ...authoredSurface,
          canvasBounds,
          ...(projectedAuthoredBounds ? { authoredBounds: projectedAuthoredBounds } : {}),
          authoredAreaShare: round((projectedRegions ?? []).reduce((sum, region) => sum + region.bounds.width * region.bounds.height, 0) / Math.max(1, scene.width * scene.height)),
          readingOrder,
          ...(projectedCanonicalLaneBounds ? { canonicalLaneBounds: projectedCanonicalLaneBounds } : {}),
          ...(projectedAnalysisEvidenceBounds ? { analysisEvidenceBounds: projectedAnalysisEvidenceBounds } : {}),
          placementOccupants: projectedOccupants,
          zones: surfaceZones ?? authoredSurface.zones,
        },
      } : {}),
    },
  };
}

function cloneScene(scene: CanvasV2NativeSceneDocument): CanvasV2NativeSceneDocument {
  return {
    ...scene,
    rootIds: [...scene.rootIds],
    nodes: scene.nodes.map((node) => ({
      ...node,
      childIds: [...node.childIds],
      geometry: { ...node.geometry },
      attributes: { ...node.attributes },
      inlineStyle: { ...node.inlineStyle },
      ...(node.resolvedStyle ? { resolvedStyle: { ...node.resolvedStyle } } : {}),
      content: node.content.map((item) => ({ ...item })),
      ...(node.evidence ? { evidence: { ...node.evidence } } : {}),
    })),
  };
}

function sourceNode(scene: CanvasV2NativeSceneDocument, nodeId: string): CanvasV2NativeSceneNode {
  const node = scene.nodes.find((candidate) => candidate.sourceNodeId === nodeId);
  if (!node) throw new Error(`Canvas V2 expected one native scene node named ${nodeId}.`);
  if (node.kind === "root") throw new Error("The workspace root is permanent. Select an element inside it instead.");
  return node;
}

function markNativeUserEdit(node: CanvasV2NativeSceneNode, kind: string): void {
  const edits = new Set((node.attributes["data-canvas-v2-user-edited"] ?? "").split(/\s+/).filter(Boolean));
  edits.add(kind);
  node.attributes["data-canvas-v2-user-edited"] = Array.from(edits).join(" ");
  node.attributes["data-canvas-v2-last-author"] = "user";
  node.editVersion += 1;
  node.attributes["data-canvas-v2-edit-version"] = String(node.editVersion);
  node.userEdited = true;
  node.lastAuthor = "user";
}

function removeNodeReference(scene: CanvasV2NativeSceneDocument, id: string): void {
  scene.rootIds = scene.rootIds.filter((rootId) => rootId !== id);
  for (const node of scene.nodes) {
    node.childIds = node.childIds.filter((childId) => childId !== id);
    node.content = node.content.filter((item) => item.kind !== "node" || item.id !== id);
  }
}

function removeNativeSubtree(scene: CanvasV2NativeSceneDocument, id: string): void {
  const byId = canvasV2NativeSceneNodeMap(scene);
  const remove = new Set<string>();
  const visit = (nodeId: string) => {
    if (remove.has(nodeId)) return;
    remove.add(nodeId);
    byId.get(nodeId)?.childIds.forEach(visit);
  };
  visit(id);
  for (const node of scene.nodes) {
    if (!node.detachedFromParentId || !remove.has(node.detachedFromParentId)) continue;
    node.detachedFromParentId = undefined;
    node.detachedFromParentIndex = undefined;
    delete node.attributes["data-canvas-v2-detached-from"];
    delete node.attributes["data-canvas-v2-detached-index"];
  }
  removeNodeReference(scene, id);
  scene.nodes = scene.nodes.filter((node) => !remove.has(node.id));
}

function freezeFlowSiblings(scene: CanvasV2NativeSceneDocument, node: CanvasV2NativeSceneNode): void {
  if (node.layoutMode !== "flow") return;
  if (!node.parentId) {
    node.layoutMode = "absolute";
    return;
  }
  const byId = canvasV2NativeSceneNodeMap(scene);
  const parent = byId.get(node.parentId);
  if (!parent) {
    node.layoutMode = "absolute";
    return;
  }
  // A flex/grid child leaving flow must not pull every sibling into its old
  // slot. Freeze the measured sibling positions and the parent's measured
  // footprint before direct manipulation. This turns an authored layout group
  // into a stable canvas group at the first geometry edit without changing
  // what the user sees.
  parent.inlineStyle.width = `${parent.geometry.width}px`;
  parent.inlineStyle.height = `${parent.geometry.height}px`;
  parent.inlineStyle["min-width"] = `${parent.geometry.width}px`;
  parent.inlineStyle["min-height"] = `${parent.geometry.height}px`;
  parent.attributes["data-canvas-v2-frozen-children"] = "true";
  for (const childId of parent.childIds) {
    const sibling = byId.get(childId);
    if (sibling) sibling.layoutMode = "absolute";
  }
}

function materializeResolvedSubtreeStyle(scene: CanvasV2NativeSceneDocument, node: CanvasV2NativeSceneNode): void {
  const byId = canvasV2NativeSceneNodeMap(scene);
  const visited = new Set<string>();
  const visit = (current: CanvasV2NativeSceneNode, isSelectionRoot = false) => {
    if (visited.has(current.id)) return;
    visited.add(current.id);
    if (current.resolvedStyle) {
      // Explicit author/user styles remain authoritative. Resolved values
      // fill only the properties that were supplied through inheritance or
      // ancestry-sensitive selectors and would otherwise vanish when this
      // subtree becomes a root-level canvas object.
      // The selected object may depend on any ancestor-sensitive paint or
      // internal layout property, so preserve its complete resolved surface.
      // Descendants only need materialization when they paint text; retaining
      // dozens of redundant computed properties on every image in a 48-screen
      // flow needlessly pushed valid revisions over the artifact size limit.
      const resolved = isSelectionRoot || current.kind === "text" || current.directText?.trim()
        ? Object.fromEntries(Object.entries(current.resolvedStyle).filter(([property]) => (
            isSelectionRoot || DETACHMENT_TEXT_STYLE_PROPERTIES.has(property)
          )))
        : {};
      current.inlineStyle = { ...resolved, ...current.inlineStyle };
    }
    for (const childId of current.childIds) {
      const child = byId.get(childId);
      if (child) visit(child);
    }
  };
  visit(node, true);
}

function detachNativeNodeFromParent(scene: CanvasV2NativeSceneDocument, node: CanvasV2NativeSceneNode): void {
  if (!node.parentId) return;
  materializeResolvedSubtreeStyle(scene, node);
  const byId = canvasV2NativeSceneNodeMap(scene);
  const semanticParentId = node.parentId;
  const semanticParent = byId.get(semanticParentId);
  let semanticIndex = semanticParent?.content.findIndex((item) => item.kind === "node" && item.id === node.id) ?? -1;
  // Removing an earlier sibling contracts the parent's live content array.
  // A later sibling can therefore report the same current index even though
  // it occupied a distinct position in the authored sequence. Reserve every
  // already-detached semantic slot before recording this one so serialization
  // can reconstruct the exact canonical order instead of swapping screens and
  // causing all subsequent commits to fail evidence validation.
  const reservedSemanticIndices = scene.nodes.flatMap((candidate) => (
    candidate.detachedFromParentId === semanticParentId && candidate.detachedFromParentIndex !== undefined
      ? [candidate.detachedFromParentIndex]
      : []
  )).sort((left, right) => left - right);
  // The parent's live content has already contracted around every earlier
  // detached child. Reconstruct the new child's index in the original
  // semantic sequence by shifting once for *each* reserved slot at or before
  // the candidate position. Checking only for an exact collision worked for
  // adjacent early screens but placed middle/late screens one slot too early,
  // which made canonical validation reject the gesture and appear to snap it
  // back.
  for (const reservedIndex of reservedSemanticIndices) {
    if (reservedIndex <= semanticIndex) semanticIndex += 1;
  }
  let x = node.geometry.x;
  let y = node.geometry.y;
  let parentId: string | undefined = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.geometry.x;
    y += parent.geometry.y;
    parentId = parent.parentId;
  }
  removeNodeReference(scene, node.id);
  node.parentId = undefined;
  node.layoutMode = "absolute";
  node.geometry.x = round(x);
  node.geometry.y = round(y);
  node.detachedFromParentId = semanticParentId;
  node.detachedFromParentIndex = Math.max(0, semanticIndex);
  node.attributes["data-canvas-v2-detached"] = "true";
  node.attributes["data-canvas-v2-detached-from"] = semanticParentId;
  node.attributes["data-canvas-v2-detached-index"] = String(node.detachedFromParentIndex);
  if (!scene.rootIds.includes(node.id)) scene.rootIds.push(node.id);
}

function prepareNativeGeometryMutation(scene: CanvasV2NativeSceneDocument, node: CanvasV2NativeSceneNode): void {
  // Position, size, and rotation are all independent canvas geometry. The
  // old implementation detached on move but left resize/rotate nested inside
  // an authored flex sequence. That gave screenshots a different lifecycle
  // depending on which handle the user touched: resize appeared to work, then
  // inherited a later parent layout and snapped back. Freeze the former group
  // once and promote the edited object for every geometry mutation.
  materializeResolvedSubtreeStyle(scene, node);
  freezeFlowSiblings(scene, node);
  detachNativeNodeFromParent(scene, node);
  node.layoutMode = "absolute";
}

function normalizeUserDetachedNodes(scene: CanvasV2NativeSceneDocument): void {
  const byId = canvasV2NativeSceneNodeMap(scene);
  for (const node of scene.nodes) {
    const edits = new Set((node.attributes["data-canvas-v2-user-edited"] ?? "").split(/\s+/).filter(Boolean));
    const detached = node.attributes["data-canvas-v2-detached"];
    // Upgrade an already-open 8C scene that predates the typed semantic
    // detachment fields. Its compatibility attributes still carry enough
    // information to keep the independent object visible while restoring the
    // canonical source sequence for validation and future edits.
    if (!node.parentId && detached === "true" && !node.detachedFromParentId) {
      const declaredParentId = node.attributes["data-canvas-v2-detached-from"];
      const declaredIndex = Number(node.attributes["data-canvas-v2-detached-index"]);
      if (declaredParentId && byId.has(declaredParentId)) {
        node.detachedFromParentId = declaredParentId;
        if (Number.isInteger(declaredIndex) && declaredIndex >= 0) node.detachedFromParentIndex = declaredIndex;
      }
    }
    if (node.parentId && (detached === "true" || (detached === undefined && edits.has("move") && !edits.has("group")))) {
      detachNativeNodeFromParent(scene, node);
    }
  }
}

function nativePrimitiveNode(
  scene: CanvasV2NativeSceneDocument,
  mutation: Extract<CanvasV2ManualMutation, { kind: "create" }>,
): CanvasV2NativeSceneNode {
  const base = {
    id: mutation.nodeId,
    sourceNodeId: mutation.nodeId,
    childIds: [],
    order: scene.nodes.length,
    namespace: "html" as const,
    layoutMode: "absolute" as const,
    selectable: true,
    hidden: false,
    locked: false,
    canonicalEvidence: false,
    userEdited: true,
    lastAuthor: "user" as const,
    editVersion: 1,
    attributes: {
      "data-canvas-v2-node-id": mutation.nodeId,
      "data-canvas-v2-user-edited": "create",
      "data-canvas-v2-last-author": "user",
      "data-canvas-v2-edit-version": "1",
      "data-canvas-v2-native-runtime-node": "true",
      "data-canvas-v2-native-scene-id": mutation.nodeId,
    },
    inlineStyle: {},
  };
  if (mutation.primitive === "text") return {
    ...base,
    tagName: "p",
    kind: "text",
    geometry: { x: round(mutation.x), y: round(mutation.y), width: 220, height: 48, rotation: 0, zIndex: 0 },
    inlineStyle: { margin: "0", font: "600 28px/1.3 Inter,system-ui,sans-serif", color: "var(--northstar-ink)" },
    directText: "New text",
    content: [{ kind: "text", value: "New text" }],
  };
  if (mutation.primitive === "frame") return {
    ...base,
    tagName: "section",
    kind: "frame",
    geometry: { x: round(mutation.x), y: round(mutation.y), width: 360, height: 240, rotation: 0, zIndex: 0 },
    inlineStyle: { border: "2px solid var(--northstar-violet)", "border-radius": "20px", background: "var(--northstar-surface)" },
    content: [],
  };
  if (mutation.primitive === "shape") return {
    ...base,
    tagName: "div",
    kind: "shape",
    geometry: { x: round(mutation.x), y: round(mutation.y), width: 160, height: 160, rotation: 0, zIndex: 0 },
    inlineStyle: { "border-radius": "24px", background: "#7661f3" },
    content: [],
  };
  return {
    ...base,
    tagName: "table",
    kind: "table",
    geometry: { x: round(mutation.x), y: round(mutation.y), width: 480, height: 120, rotation: 0, zIndex: 0 },
    inlineStyle: { "border-collapse": "collapse", background: "var(--northstar-surface)", color: "var(--northstar-ink)" },
    directText: "Cell 1    Cell 2\nCell 3    Cell 4",
    content: [{ kind: "text", value: "Cell 1    Cell 2\nCell 3    Cell 4" }],
  };
}

function applyAtomicNativeMutation(
  scene: CanvasV2NativeSceneDocument,
  mutation: Exclude<CanvasV2ManualMutation, { kind: "batch" }>,
): void {
  if (mutation.kind === "create") {
    if (scene.nodes.some((node) => node.sourceNodeId === mutation.nodeId)) throw new Error("A created node requires a unique identity.");
    const node = nativePrimitiveNode(scene, mutation);
    scene.nodes.push(node);
    scene.rootIds.push(node.id);
    return;
  }
  if (mutation.kind === "group") {
    const groupedNodes = mutation.items.map((item) => sourceNode(scene, item.nodeId));
    const group: CanvasV2NativeSceneNode = {
      id: mutation.groupNodeId,
      sourceNodeId: mutation.groupNodeId,
      childIds: groupedNodes.map((node) => node.id),
      order: scene.nodes.length,
      tagName: "div",
      namespace: "html",
      layoutMode: "absolute",
      kind: "group",
      selectable: true,
      hidden: false,
      locked: false,
      canonicalEvidence: groupedNodes.some((node) => node.canonicalEvidence),
      userEdited: true,
      lastAuthor: "user",
      editVersion: 1,
      geometry: { ...mutation.bounds, rotation: 0, zIndex: Math.max(0, ...groupedNodes.map((node) => node.geometry.zIndex)) },
      attributes: {
        "data-canvas-v2-node-id": mutation.groupNodeId,
        "data-canvas-v2-group": "true",
        "data-canvas-v2-user-edited": "group",
        "data-canvas-v2-last-author": "user",
        "data-canvas-v2-edit-version": "1",
        "data-canvas-v2-native-runtime-node": "true",
        "data-canvas-v2-native-scene-id": mutation.groupNodeId,
        "aria-label": mutation.label ?? "Object group",
      },
      inlineStyle: {},
      content: groupedNodes.map((node) => ({ kind: "node" as const, id: node.id })),
    };
    for (const [index, node] of groupedNodes.entries()) {
      removeNodeReference(scene, node.id);
      node.parentId = group.id;
      node.layoutMode = "absolute";
      node.geometry.x = mutation.items[index].bounds.x - mutation.bounds.x;
      node.geometry.y = mutation.items[index].bounds.y - mutation.bounds.y;
      node.detachedFromParentId = undefined;
      node.detachedFromParentIndex = undefined;
      node.attributes["data-canvas-v2-detached"] = "false";
      delete node.attributes["data-canvas-v2-detached-from"];
      delete node.attributes["data-canvas-v2-detached-index"];
      markNativeUserEdit(node, "group");
    }
    scene.nodes.push(group);
    scene.rootIds.push(group.id);
    return;
  }
  const node = sourceNode(scene, mutation.nodeId);
  if (mutation.kind === "move") {
    prepareNativeGeometryMutation(scene, node);
    node.geometry.x = round(node.geometry.x + mutation.deltaX);
    node.geometry.y = round(node.geometry.y + mutation.deltaY);
  } else if (mutation.kind === "resize") {
    prepareNativeGeometryMutation(scene, node);
    node.geometry.width = Math.max(Math.max(1, Math.min(24, node.geometry.width * 0.1)), round(mutation.width));
    node.geometry.height = Math.max(Math.max(1, Math.min(24, node.geometry.height * 0.1)), round(mutation.height));
    if (mutation.fontSize !== undefined) node.inlineStyle["font-size"] = `${round(mutation.fontSize)}px`;
  } else if (mutation.kind === "transform") {
    prepareNativeGeometryMutation(scene, node);
    node.geometry.x = round(node.geometry.x + mutation.deltaX);
    node.geometry.y = round(node.geometry.y + mutation.deltaY);
    node.geometry.width = Math.max(Math.max(1, Math.min(24, node.geometry.width * 0.1)), round(mutation.width));
    node.geometry.height = Math.max(Math.max(1, Math.min(24, node.geometry.height * 0.1)), round(mutation.height));
    if (mutation.fontSize !== undefined) node.inlineStyle["font-size"] = `${round(mutation.fontSize)}px`;
  } else if (mutation.kind === "text") {
    node.content = [{ kind: "text", value: mutation.text }];
    node.childIds = [];
    node.directText = mutation.text;
  } else if (mutation.kind === "style") {
    node.inlineStyle[mutation.property] = mutation.value;
  } else if (mutation.kind === "attribute") {
    node.attributes.alt = mutation.value;
  } else if (mutation.kind === "delete") {
    // Deleting a child from an authored flex/grid rail is a spatial edit, not
    // a request to recompose the rail. Freeze the measured sibling geometry
    // before removal so later screenshots keep their exact canvas positions
    // and the deleted object's slot remains visibly empty.
    freezeFlowSiblings(scene, node);
    removeNativeSubtree(scene, node.id);
    return;
  } else if (mutation.kind === "duplicate") {
    const byId = canvasV2NativeSceneNodeMap(scene);
    const cloneIds = new Map<string, string>();
    const collect = (id: string) => {
      const current = byId.get(id);
      if (!current) return;
      cloneIds.set(id, id === node.id ? mutation.newNodeId : `${mutation.newNodeId}-${cloneIds.size}`);
      current.childIds.forEach(collect);
    };
    collect(node.id);
    const copies = Array.from(cloneIds).map(([sourceId, copyId]) => {
      const source = byId.get(sourceId)!;
      const sourceNodeId = sourceId === node.id ? mutation.newNodeId : source.sourceNodeId ? `${mutation.newNodeId}-${source.sourceNodeId}` : undefined;
      return {
        ...source,
        id: copyId,
        ...(sourceNodeId ? { sourceNodeId } : { sourceNodeId: undefined }),
        parentId: sourceId === node.id ? source.parentId : source.parentId ? cloneIds.get(source.parentId) : undefined,
        childIds: source.childIds.map((id) => cloneIds.get(id)!).filter(Boolean),
        content: source.content.map((item) => item.kind === "node" ? { kind: "node" as const, id: cloneIds.get(item.id)! } : { ...item }),
        geometry: { ...source.geometry, ...(sourceId === node.id ? { x: source.geometry.x + 36, y: source.geometry.y + 36 } : {}) },
        attributes: { ...source.attributes, ...(sourceNodeId ? { "data-canvas-v2-node-id": sourceNodeId } : {}) },
        inlineStyle: { ...source.inlineStyle },
        ...(source.resolvedStyle ? { resolvedStyle: { ...source.resolvedStyle } } : {}),
        canonicalEvidence: false,
        evidence: source.evidence ? { ...source.evidence, role: "analysis-copy", sourceNodeId: source.sourceNodeId } : undefined,
      } satisfies CanvasV2NativeSceneNode;
    });
    scene.nodes.push(...copies);
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      parent?.childIds.push(mutation.newNodeId);
      parent?.content.push({ kind: "node", id: mutation.newNodeId });
    } else scene.rootIds.push(mutation.newNodeId);
    copies.forEach((copy) => markNativeUserEdit(copy, "duplicate"));
    return;
  } else if (mutation.kind === "layer") {
    const values = scene.nodes.map((item) => item.geometry.zIndex);
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    node.geometry.zIndex = mutation.direction === "front" ? maximum + 1
      : mutation.direction === "back" ? minimum - 1
        : mutation.direction === "forward" ? node.geometry.zIndex + 1
          : node.geometry.zIndex - 1;
  } else if (mutation.kind === "visibility") {
    node.hidden = mutation.hidden;
    if (mutation.hidden) node.attributes.hidden = "";
    else delete node.attributes.hidden;
  } else if (mutation.kind === "lock") {
    node.locked = mutation.locked;
    node.attributes["data-canvas-v2-locked"] = String(mutation.locked);
  } else if (mutation.kind === "rotate") {
    prepareNativeGeometryMutation(scene, node);
    node.geometry.rotation = round(mutation.rotation);
    node.attributes["data-canvas-v2-rotation"] = String(node.geometry.rotation);
  } else if (mutation.kind === "ungroup") {
    if (node.kind !== "group") throw new Error("Only a group can be ungrouped.");
    const byId = canvasV2NativeSceneNodeMap(scene);
    const childIds = [...node.childIds];
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      child.parentId = node.parentId;
      child.geometry.x += node.geometry.x;
      child.geometry.y += node.geometry.y;
      if (node.parentId) {
        const parent = byId.get(node.parentId);
        parent?.childIds.push(child.id);
        parent?.content.push({ kind: "node", id: child.id });
      } else scene.rootIds.push(child.id);
      markNativeUserEdit(child, "ungroup");
    }
    // The children have been reparented above. Detach them from the group
    // before removing the group itself so subtree deletion cannot consume the
    // newly promoted objects.
    node.childIds = [];
    node.content = node.content.filter((item) => item.kind !== "node" || !childIds.includes(item.id));
    removeNativeSubtree(scene, node.id);
    return;
  }
  markNativeUserEdit(node, mutation.kind);
}

export function applyCanvasV2NativeSceneMutation(
  source: CanvasV2NativeSceneDocument,
  mutation: CanvasV2ManualMutation,
): CanvasV2NativeSceneDocument {
  const scene = cloneScene(source);
  // Hot-reloaded or already-open revisions may predate the explicit detached
  // marker. Normalize them before the next mutation so moving an old group
  // cannot carry a child that the user had already pulled away.
  normalizeUserDetachedNodes(scene);
  if (mutation.kind === "batch") {
    for (const item of mutation.mutations) applyAtomicNativeMutation(scene, item);
  } else applyAtomicNativeMutation(scene, mutation);
  scene.nodes.forEach((node, order) => { node.order = order; });
  return scene;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function serializeAttributes(node: CanvasV2NativeSceneNode): string {
  const entries = Object.entries(node.attributes)
    .filter(([name]) => !name.startsWith("data-canvas-v2-native-"))
    // This marker is derived scene state. Keeping the value captured from the
    // previous revision and then appending the new value produced duplicate
    // HTML attributes; browsers keep the first one, so an object changed from
    // flow to absolute snapped back on the next compile.
    .filter(([name]) => name !== "data-canvas-v2-scene-layout")
    .filter(([name]) => name !== "style")
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`);
  if (node.sourceNodeId && !entries.some((entry) => entry.startsWith("data-canvas-v2-node-id="))) {
    entries.push(`data-canvas-v2-node-id="${escapeHtml(node.sourceNodeId)}"`);
  }
  const style = {
    ...node.inlineStyle,
    "--canvas-v2-scene-x": `${node.geometry.x}px`,
    "--canvas-v2-scene-y": `${node.geometry.y}px`,
    "--canvas-v2-scene-width": `${node.geometry.width}px`,
    "--canvas-v2-scene-height": `${node.geometry.height}px`,
    "--canvas-v2-scene-rotation": `${node.geometry.rotation}deg`,
    "z-index": String(node.geometry.zIndex),
  };
  entries.push(`style="${escapeHtml(Object.entries(style).map(([property, value]) => `${property}:${value}`).join(";"))}"`);
  entries.push(`data-canvas-v2-scene-layout="${node.layoutMode}"`);
  return entries.join(" ");
}

export function serializeCanvasV2NativeScene(scene: CanvasV2NativeSceneDocument): CanvasV2ArtifactDocument {
  const byId = canvasV2NativeSceneNodeMap(scene);
  const detachedBySemanticParent = new Map<string, CanvasV2NativeSceneNode[]>();
  for (const node of scene.nodes) {
    if (!node.detachedFromParentId || !byId.has(node.detachedFromParentId)) continue;
    const siblings = detachedBySemanticParent.get(node.detachedFromParentId) ?? [];
    siblings.push(node);
    detachedBySemanticParent.set(node.detachedFromParentId, siblings);
  }
  for (const siblings of detachedBySemanticParent.values()) {
    siblings.sort((left, right) => (left.detachedFromParentIndex ?? Number.MAX_SAFE_INTEGER) - (right.detachedFromParentIndex ?? Number.MAX_SAFE_INTEGER));
  }
  const absoluteOrigin = (id: string) => {
    const node = byId.get(id);
    if (!node) return { x: 0, y: 0 };
    let x = node.geometry.x;
    let y = node.geometry.y;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      x += parent.geometry.x;
      y += parent.geometry.y;
      parentId = parent.parentId;
    }
    return { x, y };
  };
  const serialize = (id: string, semanticParentId?: string): string => {
    const node = byId.get(id);
    if (!node) return "";
    const attributesNode = semanticParentId && node.detachedFromParentId === semanticParentId
      ? {
          ...node,
          geometry: {
            ...node.geometry,
            x: round(node.geometry.x - absoluteOrigin(semanticParentId).x),
            y: round(node.geometry.y - absoluteOrigin(semanticParentId).y),
          },
        }
      : node;
    const attributes = serializeAttributes(attributesNode);
    const opening = `<${node.tagName}${attributes ? ` ${attributes}` : ""}>`;
    if (VOID_ELEMENTS.has(node.tagName)) return opening;
    const contentItems = node.content.map((item) => ({ ...item }));
    for (const child of detachedBySemanticParent.get(node.id) ?? []) {
      const index = Math.min(contentItems.length, Math.max(0, child.detachedFromParentIndex ?? contentItems.length));
      contentItems.splice(index, 0, { kind: "node", id: child.id });
    }
    const content = contentItems.map((item) => item.kind === "text" ? escapeHtml(item.value) : serialize(item.id, node.id)).join("");
    return `${opening}${content}</${node.tagName}>`;
  };
  const geometryGuard = `
/* canvas-v2-native-scene-geometry-v1 */
[data-canvas-v2-scene-layout="absolute"]{box-sizing:border-box!important;position:absolute!important;left:var(--canvas-v2-scene-x)!important;top:var(--canvas-v2-scene-y)!important;width:var(--canvas-v2-scene-width)!important;height:var(--canvas-v2-scene-height)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;translate:none!important;rotate:var(--canvas-v2-scene-rotation)!important;transform-origin:center!important}
[data-canvas-v2-scene-layout="flow"]{position:relative!important;rotate:var(--canvas-v2-scene-rotation)!important;transform-origin:center!important}
/* /canvas-v2-native-scene-geometry-v1 */`;
  const css = scene.css.replace(/\n?\/\* canvas-v2-native-scene-geometry-v1 \*\/[\s\S]*?\/\* \/canvas-v2-native-scene-geometry-v1 \*\//g, "");
  // An empty visible board is still a valid canvas revision. The native
  // compiler intentionally omits inert <template> metadata from its node
  // graph, so deleting the final object would otherwise serialize to an empty
  // string and trip the source validator. Preserve a non-rendering metadata
  // sentinel; it never becomes a scene object or a second surface.
  const workspaceMetadata = `<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true" aria-label="North Star canvas metadata"></template>`;
  return {
    html: `${workspaceMetadata}${scene.rootIds
      .filter((id) => {
        const node = byId.get(id);
        return !node?.detachedFromParentId || !byId.has(node.detachedFromParentId);
      })
      .map((id) => serialize(id))
      .join("")}`,
    css: `${css}\n${geometryGuard}`,
  };
}
