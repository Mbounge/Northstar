import type { CanvasV2ArtifactDocument, CanvasV2ArtifactRevision, CanvasV2ElementBounds, CanvasV2RenderObservation, CanvasV2SpatialIntersection, CanvasV2SurfaceZoneId, CanvasV2TerritoryRelation } from "@/lib/canvas-v2/types";
import type { CanvasV2BoardObjectKind } from "@/lib/canvas-v2/board-object-graph";
import { CANVAS_V2_WORKSPACE, type CanvasV2WorkspacePoint } from "@/lib/canvas-v2/workspace-coordinate-space";
import type { CanvasV2ManualMutation, CanvasV2ShapeVariant } from "@/lib/canvas-v2/manual-mutations";
import { buildCanvasV2ConnectorGeometry, canvasV2ConnectorBendFromPoint, canvasV2ConnectorBoundaryAnchor, type CanvasV2ConnectorPoint, type CanvasV2ConnectorVariant } from "@/lib/canvas-v2/connector-geometry";
import { findCanvasV2OpenPlacement } from "@/lib/canvas-v2/multiplayer-placement";

export const CANVAS_V2_NATIVE_SCENE_SCHEMA = "canvas-v2.native-scene.v1" as const;

/**
 * React warns when an inline CSS shorthand is updated beside one of its
 * longhands. Native canvas nodes can legitimately contain both: the isolated
 * compiler materializes resolved longhands, and a later human edit adds a
 * precise longhand such as `background-color`. Keep those explicit values
 * authoritative and remove only the overlapping shorthand before React owns
 * the public node. This also ensures palette and typography edits remain
 * visible after a node has been detached from its authored CSS ancestry.
 */
export function normalizeCanvasV2ReactInlineStyle(source: Readonly<Record<string, string>>): Record<string, string> {
  const style = { ...source };
  const fontLonghands = [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-stretch",
    "font-variant",
    "font-variant-ligatures",
    "font-variant-caps",
    "font-variant-numeric",
    "font-variant-east-asian",
    "font-variant-alternates",
    "font-variant-position",
    "line-height",
  ];
  if (style.font && fontLonghands.some((property) => style[property] !== undefined)) delete style.font;
  if (Object.keys(style).some((property) => property.startsWith("font-variant-") && property !== "font-variant")) {
    delete style["font-variant"];
  }

  const backgroundLonghands = Object.keys(style).filter((property) => property.startsWith("background-") && property !== "background");
  if (style.background && backgroundLonghands.length) delete style.background;
  if (style["background-position-x"] || style["background-position-y"]) delete style["background-position"];
  return style;
}

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

const CANVAS_V2_SVG_ONLY_TAGS = new Set([
  "circle", "clipPath", "defs", "ellipse", "g", "line", "marker", "mask",
  "path", "pattern", "polygon", "polyline", "rect", "stop", "symbol", "text",
  "textPath", "tspan", "use",
]);

/**
 * React creates SVG elements through their parent namespace. A malformed
 * model fragment such as a bare <path>, or a transient mutation that leaves a
 * vector leaf orphaned, would otherwise be created as an unknown HTML tag and
 * emit one browser error for every leaf. Keep that invalid intermediate state
 * out of the public scene; valid authored relationships are promoted to a
 * native <svg> root before rendering.
 */
export function canvasV2NativeSceneNodeHasRenderableNamespace(
  node: Pick<CanvasV2NativeSceneNode, "namespace" | "tagName">,
  parent?: Pick<CanvasV2NativeSceneNode, "namespace" | "tagName">,
): boolean {
  if (node.namespace === "html") return !CANVAS_V2_SVG_ONLY_TAGS.has(node.tagName);
  return node.tagName === "svg" || parent?.namespace === "svg";
}

export interface CanvasV2AuthoredRelationshipPromotion {
  nodeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  startInParent: CanvasV2ConnectorPoint;
  endInParent: CanvasV2ConnectorPoint;
  controlInParent: CanvasV2ConnectorPoint;
  curved: boolean;
  arrow: boolean;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity?: string;
}

export function canvasV2NativeSceneLeafNeedsIdentity(input: {
  hasAuthoredAncestor: boolean;
  hasText: boolean;
  ownedByAuthoredTextObject?: boolean;
  tagName: string;
  width: number;
  height: number;
  visible: boolean;
  hasPaint: boolean;
}): boolean {
  const tagIsPrimitive = /^(H[1-6]|P|SPAN|SMALL|STRONG|EM|LABEL|BUTTON|HR|SVG|PATH|LINE|CIRCLE|RECT|POLYGON|POLYLINE|ELLIPSE)$/.test(input.tagName);
  const tagIsTextObject = /^(BLOCKQUOTE|BUTTON|DD|DIV|DT|FIGCAPTION|H[1-6]|LABEL|LI|P|SMALL|SPAN)$/.test(input.tagName);
  const independentlyEditableText = input.hasText && tagIsTextObject && !input.ownedByAuthoredTextObject;
  return (independentlyEditableText || !input.hasAuthoredAncestor)
    && input.width > 0
    && input.height > 0
    && input.visible
    && (tagIsPrimitive || input.hasPaint);
}

export function canvasV2NativeSceneNodeUsesHostBackground(node: CanvasV2NativeSceneNode): boolean {
  return node.kind === "root"
    || node.sourceNodeId === "canvas"
    || node.attributes["data-canvas-v2-workspace-root"] === "true"
    || node.attributes["data-canvas-v2-permanent-root"] === "true"
    || node.attributes.class?.split(/\s+/).includes("northstar-canvas");
}

export type CanvasV2PaintedEdge = "top" | "right" | "bottom" | "left";

export interface CanvasV2PaintedEdgeDescriptor {
  edge: CanvasV2PaintedEdge;
  width: number;
  style: string;
  color: string;
}

const CANVAS_V2_PHRASING_EDGE_OWNERS = new Set([
  "a", "b", "bdi", "bdo", "button", "cite", "code", "data", "del", "em",
  "h1", "h2", "h3", "h4", "h5", "h6", "i", "ins", "kbd", "label", "mark",
  "p", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var",
]);

/** Resolve the final browser paint instead of guessing from a CSS shorthand. */
export function canvasV2NativeScenePaintedEdges(node: CanvasV2NativeSceneNode): CanvasV2PaintedEdgeDescriptor[] {
  return (["top", "right", "bottom", "left"] as const).flatMap((edge) => {
    const width = Number.parseFloat(node.resolvedStyle?.[`border-${edge}-width`] ?? node.inlineStyle[`border-${edge}-width`] ?? "0");
    const style = node.resolvedStyle?.[`border-${edge}-style`] ?? node.inlineStyle[`border-${edge}-style`] ?? "none";
    const color = node.resolvedStyle?.[`border-${edge}-color`] ?? node.inlineStyle[`border-${edge}-color`] ?? "transparent";
    return Number.isFinite(width) && width > 0 && style !== "none" && color !== "transparent" && color !== "rgba(0, 0, 0, 0)"
      ? [{ edge, width: round(width), style, color }]
      : [];
  });
}

function canvasV2CssPaintIsVisible(value: string | undefined): boolean {
  const paint = value?.trim().toLowerCase();
  if (!paint || paint === "none" || paint === "transparent") return false;
  const alpha = /^(?:rgba|hsla)\([^)]*[,/]\s*(0(?:\.0+)?)\s*\)$/.exec(paint);
  return !alpha;
}

/**
 * A model-authored wrapper that visibly paints a card, panel, frame, or
 * filled region is itself a canvas object. Keep it selectable even when its
 * heading and copy also carry stable IDs. Transparent layout wrappers remain
 * structural and are deliberately not promoted into accidental groups.
 */
export function canvasV2NativeSceneNodeOwnsVisibleSurface(node: CanvasV2NativeSceneNode): boolean {
  if (node.hidden || canvasV2NativeSceneNodeUsesHostBackground(node)) return false;
  const opacity = Number.parseFloat(node.resolvedStyle?.opacity ?? node.inlineStyle.opacity ?? "1");
  if (Number.isFinite(opacity) && opacity <= 0) return false;
  const backgroundColor = node.resolvedStyle?.["background-color"] ?? node.inlineStyle["background-color"];
  const backgroundImage = node.resolvedStyle?.["background-image"] ?? node.inlineStyle["background-image"];
  const boxShadow = node.resolvedStyle?.["box-shadow"] ?? node.inlineStyle["box-shadow"];
  return canvasV2CssPaintIsVisible(backgroundColor)
    || canvasV2CssPaintIsVisible(backgroundImage)
    || canvasV2CssPaintIsVisible(boxShadow)
    || canvasV2NativeScenePaintedEdges(node).length >= 2;
}

/**
 * A single CSS edge on a structural wrapper is visually a line, not the
 * wrapper itself. Promote that paint into a stable native child so it has its
 * own identity, line-sized bounds, Layers entry, and full manual-edit
 * lifecycle. The equivalent padding compensation keeps neighbouring copy at
 * the exact authored coordinate after the wrapper stops painting the edge.
 */
export function materializeCanvasV2NativeScenePaintedEdges(
  source: CanvasV2NativeSceneDocument,
): CanvasV2NativeSceneDocument {
  const scene = cloneScene(source);
  const usedSceneIds = new Set(scene.nodes.map((node) => node.id));
  const usedSourceIds = new Set(scene.nodes.flatMap((node) => node.sourceNodeId ? [node.sourceNodeId] : []));
  const candidates = [...scene.nodes];

  for (const owner of candidates) {
    if (owner.selectable || owner.hidden || owner.kind === "root" || !owner.sourceNodeId) continue;
    const painted = canvasV2NativeScenePaintedEdges(owner);
    // A lone edge is an authored rule/line. Multi-edge borders remain the
    // container's frame paint; splitting every card outline into four fake
    // objects would make the object model less truthful, not more.
    if (painted.length !== 1) continue;
    const descriptor = painted[0];
    const edge = descriptor.edge;
    let sourceNodeId = `${owner.sourceNodeId}-border-${edge}`;
    let suffix = 2;
    while (usedSourceIds.has(sourceNodeId)) sourceNodeId = `${owner.sourceNodeId}-border-${edge}-${suffix++}`;
    let id = sourceNodeId;
    while (usedSceneIds.has(id)) id = `${sourceNodeId}-${suffix++}`;
    usedSourceIds.add(sourceNodeId);
    usedSceneIds.add(id);

    const vertical = edge === "left" || edge === "right";
    const width = vertical ? descriptor.width : owner.geometry.width;
    const height = vertical ? owner.geometry.height : descriptor.width;
    const paddingProperty = `padding-${edge}`;
    const borderWidthProperty = `border-${edge}-width`;
    const borderStyleProperty = `border-${edge}-style`;
    const resolvedPadding = Number.parseFloat(owner.resolvedStyle?.[paddingProperty] ?? owner.inlineStyle[paddingProperty] ?? "0");
    const compensatedPadding = round((Number.isFinite(resolvedPadding) ? resolvedPadding : 0) + descriptor.width);
    owner.inlineStyle[paddingProperty] = `${compensatedPadding}px`;
    owner.inlineStyle[borderWidthProperty] = "0px";
    owner.inlineStyle[borderStyleProperty] = "none";
    owner.attributes[`data-canvas-v2-materialized-border-${edge}`] = "true";
    if (owner.resolvedStyle) {
      owner.resolvedStyle[paddingProperty] = `${compensatedPadding}px`;
      owner.resolvedStyle[borderWidthProperty] = "0px";
      owner.resolvedStyle[borderStyleProperty] = "none";
    }

    const line: CanvasV2NativeSceneNode = {
      id,
      sourceNodeId,
      parentId: owner.id,
      childIds: [],
      order: scene.nodes.length,
      // A selectable rule can belong to a paragraph, heading, label, or other
      // phrasing container. Rendering a div there produces invalid HTML and a
      // React hydration warning even though the line is absolutely positioned.
      // Span preserves the identical native geometry without violating the
      // owner's content model.
      tagName: CANVAS_V2_PHRASING_EDGE_OWNERS.has(owner.tagName) ? "span" : "div",
      namespace: "html",
      layoutMode: "absolute",
      kind: "shape",
      selectable: true,
      hidden: false,
      locked: false,
      canonicalEvidence: owner.canonicalEvidence,
      userEdited: false,
      ...(owner.lastAuthor ? { lastAuthor: owner.lastAuthor } : {}),
      editVersion: 0,
      geometry: {
        x: edge === "right" ? round(owner.geometry.width - descriptor.width) : 0,
        y: edge === "bottom" ? round(owner.geometry.height - descriptor.width) : 0,
        width: round(width),
        height: round(height),
        rotation: 0,
        zIndex: Math.max(1, owner.geometry.zIndex + 1),
      },
      attributes: {
        "data-canvas-v2-node-id": sourceNodeId,
        "data-canvas-v2-native-runtime-node": "true",
        "data-canvas-v2-native-scene-id": id,
        "data-canvas-v2-painted-edge": edge,
        "data-canvas-v2-painted-edge-owner": owner.sourceNodeId,
        "aria-label": `${edge[0].toUpperCase()}${edge.slice(1)} accent line · ${owner.sourceNodeId}`,
      },
      inlineStyle: {
        margin: "0",
        padding: "0",
        "background-color": descriptor.color,
        "border-radius": "0",
      },
      resolvedStyle: {
        "background-color": descriptor.color,
        opacity: owner.resolvedStyle?.opacity ?? "1",
      },
      content: [],
    };
    owner.childIds.push(id);
    owner.content.push({ kind: "node", id });
    scene.nodes.push(line);
  }
  scene.nodes.forEach((node, order) => { node.order = order; });
  return scene;
}

const CANVAS_V2_INLINE_TEXT_TAGS = new Set([
  "a", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "em", "i", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);
const CANVAS_V2_TEXT_CONTAINER_TAGS = new Set([
  "blockquote", "button", "dd", "div", "dt", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "label", "li", "p", "small", "span",
]);

const CANVAS_V2_WRITABLE_SURFACE_PATTERN = /(?:^|[\s_-])(answer|assumption|candidate|capture|cell|comment|evidence|feedback|field|idea|input|note|notes|objection|prompt|question|record|response|slot|thought|write|writing)(?:$|[\s_-])/i;

/**
 * Writable is an object capability, not a guess made by the React editor.
 * Northstar declares it explicitly. The compiler also upgrades obvious blank
 * legacy writing surfaces so already-created boards gain the same behavior.
 */
export function canvasV2NativeSceneNodeIsWritable(node: CanvasV2NativeSceneNode): boolean {
  return node.attributes["data-canvas-v2-writable"] === "true";
}

export function canvasV2NativeSceneNodeLooksWritable(node: CanvasV2NativeSceneNode): boolean {
  if (node.attributes["data-canvas-v2-writable"] === "false"
    || !node.sourceNodeId
    || node.hidden
    || node.locked
    || node.namespace !== "html"
    || !CANVAS_V2_TEXT_CONTAINER_TAGS.has(node.tagName)
    || node.childIds.length
    || node.content.some((item) => item.kind === "text" && item.value.trim())
    || node.geometry.width < 72
    || node.geometry.height < 28) return false;
  if (node.attributes["data-canvas-v2-writable"] === "true") return true;
  const semanticText = [
    node.sourceNodeId,
    node.attributes.id,
    node.attributes.class,
    node.attributes["aria-label"],
    node.attributes["data-canvas-v2-visual-role"],
    node.attributes["data-canvas-v2-content-role"],
  ].filter(Boolean).join(" ");
  const hasSurface = canvasV2NativeSceneNodeOwnsVisibleSurface(node)
    || canvasV2NativeScenePaintedEdges(node).length > 0;
  return hasSurface && CANVAS_V2_WRITABLE_SURFACE_PATTERN.test(semanticText);
}

/**
 * Text ownership follows the selectable authored object, not incidental
 * formatting markup inside it. A blockquote containing an anonymous <em>, or
 * a comparison row containing an anonymous <strong>, therefore edits as one
 * text object. Independently authored descendants remain separate objects and
 * keep the container out of text mode.
 */
export function canvasV2NativeSceneNodeSupportsTextEditing(
  node: CanvasV2NativeSceneNode,
  byId: ReadonlyMap<string, CanvasV2NativeSceneNode>,
): boolean {
  if (!node.selectable || node.locked || node.namespace !== "html" || !CANVAS_V2_TEXT_CONTAINER_TAGS.has(node.tagName)) return false;
  const inlineSubtree = (candidate: CanvasV2NativeSceneNode, seen: Set<string>): boolean => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    if (candidate.sourceNodeId || !CANVAS_V2_INLINE_TEXT_TAGS.has(candidate.tagName)) return false;
    return candidate.childIds.every((childId) => {
      const child = byId.get(childId);
      return Boolean(child && inlineSubtree(child, seen));
    });
  };
  const hasText = (candidate: CanvasV2NativeSceneNode, seen: Set<string>): boolean => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    if (candidate.content.some((item) => item.kind === "text" && item.value.length > 0)) return true;
    return candidate.childIds.some((childId) => {
      const child = byId.get(childId);
      return Boolean(child && hasText(child, seen));
    });
  };
  const ownsEditableSubtree = node.childIds.every((childId) => {
    const child = byId.get(childId);
    return Boolean(child && inlineSubtree(child, new Set()));
  });
  return ownsEditableSubtree && (hasText(node, new Set()) || canvasV2NativeSceneNodeIsWritable(node));
}

interface CanvasV2AuthoredPlacementRect extends CanvasV2WorkspacePoint {
  width: number;
  height: number;
}

/**
 * A model revision often inserts one new top-level section between roots that
 * already have durable world coordinates. Anchor that section to the nearest
 * authored sibling instead of treating it as an unrelated object competing
 * for the generic viewport origin. This preserves the document's reading
 * order across iterative turns while the open-placement search still owns
 * collision avoidance.
 */
export function canvasV2PreferredRootPlacement(input: {
  anchor: CanvasV2WorkspacePoint;
  authored: CanvasV2AuthoredPlacementRect;
  authoredOrigin: CanvasV2WorkspacePoint;
  groundedOffset?: number;
  marginTop?: number;
  relation?: CanvasV2TerritoryRelation;
  previous?: {
    placed: CanvasV2AuthoredPlacementRect;
    authored: CanvasV2AuthoredPlacementRect;
    newlyPlaced: boolean;
    marginBottom?: number;
  };
  next?: { placed: CanvasV2AuthoredPlacementRect };
}): CanvasV2WorkspacePoint {
  if (input.previous) {
    const authoredGap = input.previous.newlyPlaced
      ? Math.max(0, input.authored.y - input.previous.authored.y - input.previous.authored.height)
      : Math.max(0, input.marginTop ?? 0, input.previous.marginBottom ?? 0);
    const authoredDeltaX = input.previous.newlyPlaced
      ? input.authored.x - input.previous.authored.x
      : 0;
    const explicitGap = Math.max(CANVAS_V2_WORKSPACE.documentMargin, authoredGap);
    if (input.relation === "right") return {
      x: input.previous.placed.x + input.previous.placed.width + explicitGap,
      y: input.previous.placed.y,
    };
    if (input.relation === "left") return {
      x: input.previous.placed.x - input.authored.width - explicitGap,
      y: input.previous.placed.y,
    };
    if (input.relation === "above") return {
      x: input.previous.placed.x,
      y: input.previous.placed.y - input.authored.height - explicitGap,
    };
    return {
      x: input.previous.placed.x + authoredDeltaX,
      y: input.previous.placed.y + input.previous.placed.height + authoredGap,
    };
  }
  return {
    x: input.next?.placed.x ?? input.anchor.x + input.authored.x - input.authoredOrigin.x,
    y: input.anchor.y + input.authored.y - input.authoredOrigin.y + (input.groundedOffset ?? 0),
  };
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

function relationshipNodeIds(value: string | null): string[] {
  return Array.from(new Set((value ?? "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)));
}

function pointDistanceFromRect(point: CanvasV2ConnectorPoint, rect: DOMRect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

function measureCanvasV2AuthoredRelationship(
  element: Element,
  bodyRect: DOMRect,
  bySourceNodeId: ReadonlyMap<string, Element>,
): CanvasV2AuthoredRelationshipPromotion | undefined {
  const nodeId = element.getAttribute("data-canvas-v2-node-id")?.trim();
  const sourceNodeIds = relationshipNodeIds(element.getAttribute("data-canvas-v2-relationship-source"));
  const targetNodeIds = relationshipNodeIds(element.getAttribute("data-canvas-v2-relationship-target"));
  const geometryCandidates = [element, ...Array.from(element.querySelectorAll("path[d],line,polyline,polygon"))];
  const geometry = geometryCandidates.find((candidate) => (
    typeof (candidate as SVGGeometryElement).getTotalLength === "function"
    && typeof (candidate as SVGGeometryElement).getPointAtLength === "function"
    && typeof (candidate as SVGGeometryElement).getScreenCTM === "function"
  )) as SVGGeometryElement | undefined;
  if (!nodeId || !sourceNodeIds.length || !targetNodeIds.length) return undefined;
  try {
    const computed = element.ownerDocument.defaultView?.getComputedStyle(geometry ?? element);
    let rawStart: CanvasV2ConnectorPoint;
    let rawMid: CanvasV2ConnectorPoint;
    let rawEnd: CanvasV2ConnectorPoint;
    let authoredPath = "";
    let markerEnd = "";
    let authoredStrokeWidth = Number.NaN;
    let authoredStroke = "";
    let authoredDash = "";
    let authoredOpacity = "";
    let curved = false;
    if (geometry) {
      const length = geometry.getTotalLength();
      const transform = geometry.getScreenCTM();
      if (!Number.isFinite(length) || !transform) return undefined;
      const rendered = (at: number) => {
        const point = geometry.getPointAtLength(at).matrixTransform(transform);
        return { x: point.x, y: point.y };
      };
      rawStart = rendered(0);
      rawMid = rendered(length / 2);
      rawEnd = rendered(length);
      authoredPath = geometry.getAttribute("d") ?? "";
      markerEnd = geometry.getAttribute("marker-end") ?? computed?.getPropertyValue("marker-end") ?? "";
      authoredStrokeWidth = Number.parseFloat(computed?.strokeWidth ?? "");
      authoredStroke = computed?.stroke ?? "";
      authoredDash = computed?.strokeDasharray ?? "";
      authoredOpacity = computed?.opacity ?? "";
      const lineMidpoint = { x: (rawStart.x + rawEnd.x) / 2, y: (rawStart.y + rawEnd.y) / 2 };
      curved = /[cqsta]/i.test(authoredPath) || Math.hypot(rawMid.x - lineMidpoint.x, rawMid.y - lineMidpoint.y) > 8;
    } else {
      // Northstar may intentionally express a restrained relationship as a
      // rotated CSS rule rather than an SVG path. It still declares semantic
      // endpoints and must therefore enter the native connector lifecycle.
      // Recover the painted segment from its center, authored width and
      // resolved transform before the measuring DOM is discarded.
      const rect = element.getBoundingClientRect();
      const metrics = computedTransformMetrics(computed);
      const offsetWidth = Number((element as HTMLElement).offsetWidth);
      const segmentLength = (Number.isFinite(offsetWidth) && offsetWidth > 0 ? offsetWidth : Math.hypot(rect.width, rect.height)) * metrics.scaleX;
      const borderWidth = Number.parseFloat(computed?.borderTopWidth ?? "");
      const backgroundThickness = Number((element as HTMLElement).offsetHeight);
      const paintedBackground = Boolean(computed?.backgroundColor && computed.backgroundColor !== "transparent" && computed.backgroundColor !== "rgba(0, 0, 0, 0)");
      if (!Number.isFinite(segmentLength) || segmentLength <= 0 || (!(borderWidth > 0) && !(backgroundThickness > 0 && paintedBackground))) return undefined;
      const radians = metrics.rotation * Math.PI / 180;
      const direction = { x: Math.cos(radians), y: Math.sin(radians) };
      rawMid = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      rawStart = { x: rawMid.x - direction.x * segmentLength / 2, y: rawMid.y - direction.y * segmentLength / 2 };
      rawEnd = { x: rawMid.x + direction.x * segmentLength / 2, y: rawMid.y + direction.y * segmentLength / 2 };
      authoredStrokeWidth = borderWidth > 0 ? borderWidth : backgroundThickness;
      authoredStroke = borderWidth > 0 ? computed?.borderTopColor ?? "" : computed?.backgroundColor ?? "";
      authoredDash = computed?.borderTopStyle === "dashed" ? `${Math.max(8, authoredStrokeWidth * 3)} ${Math.max(7, authoredStrokeWidth * 2)}` : "";
      authoredOpacity = computed?.opacity ?? "";
    }
    const closest = (point: CanvasV2ConnectorPoint, ids: readonly string[]) => ids.flatMap((id) => {
      const target = bySourceNodeId.get(id);
      return target ? [{ id, distance: pointDistanceFromRect(point, target.getBoundingClientRect()) }] : [];
    }).sort((left, right) => left.distance - right.distance)[0];
    const forwardSource = closest(rawStart, sourceNodeIds);
    const forwardTarget = closest(rawEnd, targetNodeIds);
    const reverseSource = closest(rawEnd, sourceNodeIds);
    const reverseTarget = closest(rawStart, targetNodeIds);
    if (!forwardSource || !forwardTarget || !reverseSource || !reverseTarget) return undefined;
    const reversed = reverseSource.distance + reverseTarget.distance < forwardSource.distance + forwardTarget.distance;
    const source = reversed ? reverseSource : forwardSource;
    const target = reversed ? reverseTarget : forwardTarget;
    const start = reversed ? rawEnd : rawStart;
    const end = reversed ? rawStart : rawEnd;
    const parentRect = element.parentElement?.getBoundingClientRect() ?? bodyRect;
    const parentOrigin = { x: parentRect.left, y: parentRect.top };
    const control = {
      x: 2 * rawMid.x - (start.x + end.x) / 2,
      y: 2 * rawMid.y - (start.y + end.y) / 2,
    };
    return {
      nodeId,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      startInParent: { x: round(start.x - parentOrigin.x), y: round(start.y - parentOrigin.y) },
      endInParent: { x: round(end.x - parentOrigin.x), y: round(end.y - parentOrigin.y) },
      controlInParent: { x: round(control.x - parentOrigin.x), y: round(control.y - parentOrigin.y) },
      curved,
      arrow: Boolean((markerEnd && markerEnd !== "none") || element.querySelector("marker,[data-canvas-v2-connector-part='end']")),
      stroke: authoredStroke && authoredStroke !== "none" && authoredStroke !== "rgba(0, 0, 0, 0)" ? authoredStroke : "#6754de",
      strokeWidth: round(Math.max(2.5, Math.min(5.5, Number.isFinite(authoredStrokeWidth) ? authoredStrokeWidth : 4))),
      ...(authoredDash && authoredDash !== "none" ? { strokeDasharray: authoredDash } : {}),
      ...(authoredOpacity && authoredOpacity !== "1" ? { opacity: authoredOpacity } : {}),
    };
  } catch {
    return undefined;
  }
}

function kindFor(element: Element): CanvasV2BoardObjectKind {
  const html = element as HTMLElement;
  const nodeId = html.dataset?.canvasV2NodeId;
  if (html.dataset?.canvasV2WorkspaceRoot === "true" || html.dataset?.canvasV2PermanentRoot === "true" || nodeId === "canvas") return "root";
  // Native connector roots survive compatibility serialization as SVGs. Do
  // not demote them back to generic shapes on the next AI turn: their typed
  // endpoints, curve controls, hit target and attachment lifecycle are all
  // durable scene state.
  if (html.dataset?.canvasV2Primitive === "connector") return "connector";
  if (html.dataset?.canvasV2PaintedEdge) return "shape";
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
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
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
  "justify-self",
  "align-self",
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "grid-column-start",
  "grid-column-end",
  "grid-row-start",
  "grid-row-end",
  "order",
  "object-fit",
  "object-position",
  "fill",
  "stroke",
  "stroke-width",
] as const;

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
 * Compatibility documents often use one full-board `canvas` root whose
 * children remain in normal flow. Flow geometry cannot be moved by merely
 * changing native x/y metadata, so place the root's content inset at the
 * current viewport anchor before browser measurement. Once established, that
 * inset is copied from native reference truth on later AI turns so existing
 * work never jumps back to the source document's upper-left origin.
 */
function placeFreshCanvasRootContentAtViewport(input: {
  document: Document;
  placementReferenceScene?: CanvasV2NativeSceneDocument;
  preferredPlacement?: CanvasV2WorkspacePoint;
}): void {
  const root = input.document.body.querySelector<HTMLElement>('[data-canvas-v2-node-id="canvas"]');
  if (!root) return;
  const referenceRoot = input.placementReferenceScene?.nodes.find((node) => node.kind === "root" && node.sourceNodeId === "canvas");
  const preserved = referenceRoot?.attributes["data-canvas-v2-viewport-placed"] === "true";
  const hasFlowContent = Array.from(root.children).some((child) => {
    const position = input.document.defaultView?.getComputedStyle(child).position;
    return position !== "absolute" && position !== "fixed";
  });
  // An explicitly positioned two-dimensional composition already owns its
  // internal coordinates. It is translated as one native cohort below;
  // adding root padding would distort its relationship geometry.
  if (!preserved && !hasFlowContent) return;
  const referenceHasContent = Boolean(input.placementReferenceScene?.nodes.some((node) => (
    node.kind !== "root" && node.sourceNodeId && !node.hidden
  )));
  if (!preserved && (!input.preferredPlacement || referenceHasContent)) return;

  const bodyRect = input.document.body.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const preservedLeft = Number.parseFloat(referenceRoot?.inlineStyle["padding-left"] ?? "");
  const preservedTop = Number.parseFloat(referenceRoot?.inlineStyle["padding-top"] ?? "");
  const desiredLeft = preserved && Number.isFinite(preservedLeft)
    ? preservedLeft
    : Math.max(0, Math.min(rootRect.width - 1, input.preferredPlacement!.x - (rootRect.left - bodyRect.left)));
  const desiredTop = preserved && Number.isFinite(preservedTop)
    ? preservedTop
    : Math.max(0, Math.min(rootRect.height - 1, input.preferredPlacement!.y - (rootRect.top - bodyRect.top)));
  root.style.setProperty("padding-left", `${round(desiredLeft)}px`, "important");
  root.style.setProperty("padding-top", `${round(desiredTop)}px`, "important");
  root.setAttribute("data-canvas-v2-viewport-placed", "true");
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
  /**
   * Exact existing top-level AI islands whose coordinates may be remeasured
   * for an explicit whole-board recompose or a bounded cardinal placement
   * repair. Every omitted root remains pinned to committed native truth,
   * including user work and grounded evidence.
   */
  relocatablePlacementNodeIds?: readonly string[];
  /** Current unobscured world-space anchor for genuinely new AI work. */
  preferredPlacement?: CanvasV2WorkspacePoint;
}): CanvasV2NativeSceneDocument {
  placeFreshCanvasRootContentAtViewport(input);
  const relocatablePlacementNodeIds = new Set(input.relocatablePlacementNodeIds ?? []);
  if (relocatablePlacementNodeIds.size) {
    // Serialized native compatibility source carries an !important geometry
    // guard. It is correct for ordinary edits, but it also made a deliberate
    // recompose physically incapable of moving an existing island: authored
    // CSS could resize the root while its old x/y always won. Remove only the
    // compiler-owned geometry metadata from explicitly authorized AI roots in
    // this private measuring document. The accepted scene serializes fresh
    // native coordinates immediately after validation.
    input.document.body.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]").forEach((element) => {
      const nodeId = element.dataset.canvasV2NodeId;
      if (!nodeId || !relocatablePlacementNodeIds.has(nodeId)) return;
      element.removeAttribute("data-canvas-v2-scene-layout");
      for (const property of [
        "--canvas-v2-scene-x",
        "--canvas-v2-scene-y",
        "--canvas-v2-scene-width",
        "--canvas-v2-scene-height",
        "--canvas-v2-scene-rotation",
      ]) element.style.removeProperty(property);
    });
  }
  const bodyRect = input.document.body.getBoundingClientRect();
  const allElements = Array.from(input.document.body.querySelectorAll("*"))
    .filter((element) => !["SCRIPT", "STYLE", "LINK", "META", "BASE", "TEMPLATE"].includes(element.tagName));
  const runtimeIds = new Map<Element, string>();
  const usedIds = new Set<string>();
  const measuredMargins = new Map<string, { top: number; bottom: number }>();
  let renderSequence = 0;
  for (const [elementIndex, element] of allElements.entries()) {
    let sourceNodeId = element.getAttribute("data-canvas-v2-node-id")?.trim();
    if (!sourceNodeId && element.children.length === 0) {
      const authoredAncestor = element.parentElement?.closest("[data-canvas-v2-node-id]");
      const computed = input.document.defaultView?.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const hasPaint = Boolean(element.textContent?.trim())
        || element.tagName === "HR"
        || computed?.backgroundColor !== "rgba(0, 0, 0, 0)"
        || ["top", "right", "bottom", "left"].some((edge) => (
          Number.parseFloat(computed?.getPropertyValue(`border-${edge}-width`) ?? "0") > 0
          && computed?.getPropertyValue(`border-${edge}-style`) !== "none"
        ));
      const authoredAncestorOwnsInlineText = Boolean(authoredAncestor
        && CANVAS_V2_TEXT_CONTAINER_TAGS.has(authoredAncestor.tagName.toLowerCase())
        && Array.from(authoredAncestor.children).every((child) => CANVAS_V2_INLINE_TEXT_TAGS.has(child.tagName.toLowerCase())));
      if (canvasV2NativeSceneLeafNeedsIdentity({
        hasAuthoredAncestor: Boolean(authoredAncestor),
        hasText: Boolean(element.textContent?.trim()),
        ownedByAuthoredTextObject: authoredAncestorOwnsInlineText,
        tagName: element.tagName,
        width: rect.width,
        height: rect.height,
        visible: computed?.display !== "none" && computed?.visibility !== "hidden",
        hasPaint,
      })) {
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

  const elementsBySourceNodeId = new Map<string, Element>();
  for (const element of allElements) {
    const sourceNodeId = element.getAttribute("data-canvas-v2-node-id")?.trim();
    if (sourceNodeId && !elementsBySourceNodeId.has(sourceNodeId)) elementsBySourceNodeId.set(sourceNodeId, element);
  }
  // Model-authored relationships may choose any visual treatment, but a path
  // that explicitly declares both semantic endpoints is a real canvas object.
  // Measure its authored route before the isolated DOM is discarded so it can
  // be promoted into the same native connector lifecycle as a human-created
  // connector without flattening Northstar's aesthetic decisions.
  const authoredRelationshipPromotions = allElements.flatMap((element) => {
    const promotion = measureCanvasV2AuthoredRelationship(element, bodyRect, elementsBySourceNodeId);
    return promotion ? [promotion] : [];
  });

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
    measuredMargins.set(id, {
      top: Math.max(0, Number.parseFloat(computed?.marginTop ?? "0") || 0),
      bottom: Math.max(0, Number.parseFloat(computed?.marginBottom ?? "0") || 0),
    });
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
  for (const node of nodes) {
    if (canvasV2NativeSceneNodeLooksWritable(node)) {
      // Persist the upgrade through native serialization so the capability is
      // stable across undo/redo, later AI turns, and future compiles.
      node.attributes["data-canvas-v2-writable"] = "true";
    }
  }
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
    const ownsVisibleSurface = canvasV2NativeSceneNodeOwnsVisibleSurface(node);
    if (!explicitGroup && !ownsVisibleSurface && hasStableDescendant(node)) node.selectable = false;
  }

  // Source documents from early V2 phases may place authored siblings directly
  // on the body, while newer documents keep them beneath a full-workspace
  // compatibility root. Normalize both forms into the same useful opening
  // territory. This is a one-time scene compilation offset, never a camera
  // change, so zoom and pan remain wholly user-owned.
  const preferredLeft = input.preferredPlacement?.x ?? CANVAS_V2_WORKSPACE.aiAuthoringOriginX;
  const preferredTop = input.preferredPlacement?.y ?? CANVAS_V2_WORKSPACE.aiAuthoringOriginY;
  const roots = nodes.filter((node) => !node.parentId);
  const fullWorkspaceRoot = roots.find((node) => node.kind === "root" && node.geometry.width >= input.width * 0.9);
  const placementNodes = fullWorkspaceRoot
    ? nodes.filter((node) => node.parentId === fullWorkspaceRoot.id)
    : roots;
  const visiblePlacementNodes = placementNodes.filter((node) => !node.hidden && node.geometry.width > 0 && node.geometry.height > 0);
  const authoredPlacementGeometry = new Map(visiblePlacementNodes.map((node) => [node.id, { ...node.geometry }]));
  const referenceScene = input.placementReferenceScene;
  const referencedNodeIds = new Set<string>();
  if (referenceScene) {
    for (const node of visiblePlacementNodes) {
      if (!node.sourceNodeId) continue;
      if (relocatablePlacementNodeIds.has(node.sourceNodeId)) continue;
      const referenceBounds = canvasV2NativeSceneAbsoluteBounds(referenceScene, node.sourceNodeId);
      if (!referenceBounds) continue;
      // Preserve the durable anchor, but retain the candidate's newly
      // measured footprint so intentional content/style updates can grow.
      node.geometry.x = round(referenceBounds.x - (fullWorkspaceRoot?.geometry.x ?? 0));
      node.geometry.y = round(referenceBounds.y - (fullWorkspaceRoot?.geometry.y ?? 0));
      referencedNodeIds.add(node.id);
    }
  }
  const viewportPlacedRoot = fullWorkspaceRoot?.attributes["data-canvas-v2-viewport-placed"] === "true";
  const cohortPlacedNodeIds = new Set<string>();
  const absoluteCohort = fullWorkspaceRoot && !viewportPlacedRoot
    ? visiblePlacementNodes.filter((node) => !referencedNodeIds.has(node.id) && node.layoutMode === "absolute")
    : [];
  if (fullWorkspaceRoot && absoluteCohort.length && absoluteCohort.length === visiblePlacementNodes.length - referencedNodeIds.size) {
    const left = Math.min(...absoluteCohort.map((node) => node.geometry.x));
    const top = Math.min(...absoluteCohort.map((node) => node.geometry.y));
    const right = Math.max(...absoluteCohort.map((node) => node.geometry.x + node.geometry.width));
    const bottom = Math.max(...absoluteCohort.map((node) => node.geometry.y + node.geometry.height));
    const width = right - left;
    const height = bottom - top;
    const preferredX = preferredLeft - fullWorkspaceRoot.geometry.x;
    const preferredY = preferredTop - fullWorkspaceRoot.geometry.y;
    const targetX = Math.max(0, Math.min(preferredX, fullWorkspaceRoot.geometry.width - width));
    const targetY = Math.max(0, Math.min(preferredY, fullWorkspaceRoot.geometry.height - height));
    const deltaX = targetX - left;
    const deltaY = targetY - top;
    for (const node of absoluteCohort) {
      node.geometry.x = round(node.geometry.x + deltaX);
      node.geometry.y = round(node.geometry.y + deltaY);
      cohortPlacedNodeIds.add(node.id);
    }
  }
  const alreadyPlacedNodes = visiblePlacementNodes.filter((node) => (
    viewportPlacedRoot
    || cohortPlacedNodeIds.has(node.id)
    || referencedNodeIds.has(node.id)
    || (!referenceScene && Boolean(node.attributes["data-canvas-v2-scene-layout"]))
  ));
  const newlyMeasuredNodes = visiblePlacementNodes.filter((node) => !alreadyPlacedNodes.includes(node));
  if (newlyMeasuredNodes.length) {
    const inset = CANVAS_V2_WORKSPACE.documentMargin;
    const placementOriginX = fullWorkspaceRoot?.geometry.x ?? 0;
    const placementOriginY = fullWorkspaceRoot?.geometry.y ?? 0;
    const placementWidth = fullWorkspaceRoot?.geometry.width ?? input.width;
    const placementHeight = fullWorkspaceRoot?.geometry.height ?? input.height;
    const bounds = {
      x: Math.max(0, inset - placementOriginX),
      y: Math.max(0, inset - placementOriginY),
      width: Math.min(placementWidth, input.width - inset - placementOriginX)
        - Math.max(0, inset - placementOriginX),
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
    const measuredOriginX = Math.min(...newlyMeasuredNodes.map((node) => authoredPlacementGeometry.get(node.id)!.x));
    const measuredOriginY = Math.min(...newlyMeasuredNodes.map((node) => authoredPlacementGeometry.get(node.id)!.y));
    const positionedNodeIds = new Set(alreadyPlacedNodes.map((node) => node.id));
    const newlyPlacedNodeIds = new Set<string>();
    for (const node of newlyMeasuredNodes) {
      const authored = authoredPlacementGeometry.get(node.id)!;
      const nodeIndex = visiblePlacementNodes.indexOf(node);
      const declaredAnchorNodeId = node.attributes["data-canvas-v2-territory-anchor"];
      const declaredAnchor = declaredAnchorNodeId
        ? visiblePlacementNodes.find((candidate) => (
          positionedNodeIds.has(candidate.id)
          && (candidate.sourceNodeId === declaredAnchorNodeId || candidate.id === declaredAnchorNodeId)
        ))
        : undefined;
      const previous = declaredAnchor
        ?? visiblePlacementNodes.slice(0, nodeIndex).reverse().find((candidate) => positionedNodeIds.has(candidate.id));
      const next = visiblePlacementNodes.slice(nodeIndex + 1).find((candidate) => positionedNodeIds.has(candidate.id));
      const previousAuthored = previous ? authoredPlacementGeometry.get(previous.id)! : undefined;
      const margins = measuredMargins.get(node.id);
      const previousMargins = previous ? measuredMargins.get(previous.id) : undefined;
      const footprint = { width: node.geometry.width, height: node.geometry.height };
      const isGroundedEvidence = node.attributes.class?.split(/\s+/).includes("canvas-v2-grounded-evidence")
        || node.childIds.some((childId) => nodesById.get(childId)?.attributes["data-canvas-v2-canonical-flow"] !== undefined);
      const preferred = canvasV2PreferredRootPlacement({
        anchor: { x: preferredLeft - placementOriginX, y: preferredTop - placementOriginY },
        authored,
        authoredOrigin: { x: measuredOriginX, y: measuredOriginY },
        groundedOffset: isGroundedEvidence && !previous ? 600 : 0,
        marginTop: margins?.top,
        relation: node.attributes["data-canvas-v2-territory-relation"] as CanvasV2TerritoryRelation | undefined,
        ...(previous && previousAuthored ? {
          previous: {
            placed: previous.geometry,
            authored: previousAuthored,
            newlyPlaced: newlyPlacedNodeIds.has(previous.id),
            marginBottom: previousMargins?.bottom,
          },
        } : {}),
        ...(next ? { next: { placed: next.geometry } } : {}),
      });
      const placement = findCanvasV2OpenPlacement({
        preferred,
        bounds,
        footprint,
        obstacles,
        // Consecutive document roots already express their intended spacing
        // through measured flow/margins. Keep that authored rhythm; unrelated
        // first roots still receive the normal multiplayer safety gap.
        gap: previous && !previous.userEdited ? 0 : undefined,
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
      positionedNodeIds.add(node.id);
      newlyPlacedNodeIds.add(node.id);
    }
  }

  const compiledScene = materializeCanvasV2NativeScenePaintedEdges({
    schema: CANVAS_V2_NATIVE_SCENE_SCHEMA,
    revisionId: input.revision.id,
    width: input.width,
    height: input.height,
    css: input.revision.document.css,
    rootIds: nodes.filter((node) => !node.parentId).map((node) => node.id),
    nodes,
  });
  // Earlier 8C revisions made a visually moved child absolute but left its
  // structural parent attached. Upgrade those revisions at the compiler
  // boundary: a user-moved object that was not subsequently regrouped is a
  // root-level canvas object and must not follow its former group later.
  normalizeUserDetachedNodes(compiledScene);
  promoteCanvasV2AuthoredRelationships(compiledScene, authoredRelationshipPromotions);
  reconcileCanvasV2NativeConnectors(compiledScene);
  return compiledScene;
}

export function canvasV2NativeSceneNodeMap(scene: CanvasV2NativeSceneDocument): Map<string, CanvasV2NativeSceneNode> {
  return new Map(scene.nodes.map((node) => [node.id, node]));
}

export function canvasV2NativeSceneSourceNodeMap(scene: CanvasV2NativeSceneDocument): Map<string, CanvasV2NativeSceneNode> {
  return new Map(scene.nodes.flatMap((node) => node.sourceNodeId ? [[node.sourceNodeId, node] as const] : []));
}

export function canvasV2NativeSceneAbsoluteBounds(
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
  const nativeById = canvasV2NativeSceneNodeMap(scene);
  const nativeBySourceId = canvasV2NativeSceneSourceNodeMap(scene);
  const projectBounds = (bounds: CanvasV2ElementBounds, nodeId: string) => canvasV2NativeSceneAbsoluteBounds(scene, nodeId) ?? bounds;
  const projectedParentNodeId = (nodeId: string, fallback?: string): string | undefined => {
    const native = nativeBySourceId.get(nodeId);
    if (!native) return fallback;
    let parentId = native.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nativeById.get(parentId);
      if (!parent) return undefined;
      if (parent.sourceNodeId) return parent.sourceNodeId;
      parentId = parent.parentId;
    }
    return undefined;
  };
  const nativeDescendantIds = (rootId: string): string[] => {
    const descendants: string[] = [];
    const pending = [...(nativeById.get(rootId)?.childIds ?? [])];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nativeById.get(id);
      if (!node) continue;
      descendants.push(id);
      pending.push(...node.childIds);
    }
    return descendants;
  };
  const ownsSemanticDetachment = (rootId: string): boolean => {
    const structuralIds = new Set([rootId, ...nativeDescendantIds(rootId)]);
    return scene.nodes.some((node) => node.detachedFromParentId && structuralIds.has(node.detachedFromParentId));
  };
  const nativeSubtreeOverflow = (sourceNodeId: string, bounds: CanvasV2ElementBounds) => {
    const root = nativeBySourceId.get(sourceNodeId);
    if (!root || !ownsSemanticDetachment(root.id)) return undefined;
    const descendantBounds = nativeDescendantIds(root.id).flatMap((id) => {
      const node = nativeById.get(id);
      if (!node || node.hidden || !node.sourceNodeId) return [];
      const projected = canvasV2NativeSceneAbsoluteBounds(scene, node.sourceNodeId);
      return projected ? [projected] : [];
    });
    const painted = unionNativeBounds(descendantBounds);
    if (!painted) return { x: 0, y: 0 };
    return {
      x: round(Math.max(0, bounds.x - painted.x, painted.x + painted.width - (bounds.x + bounds.width))),
      y: round(Math.max(0, bounds.y - painted.y, painted.y + painted.height - (bounds.y + bounds.height))),
    };
  };
  const authoredSurface = observation.spatial.authoredSurface;
  const canvasBounds = { x: 0, y: 0, width: scene.width, height: scene.height };
  const projectedNodes = observation.spatial.nodes.map((node) => ({
    ...node,
    ...(projectedParentNodeId(node.nodeId, node.parentNodeId)
      ? { parentNodeId: projectedParentNodeId(node.nodeId, node.parentNodeId) }
      : { parentNodeId: undefined }),
    bounds: projectBounds(node.bounds, node.nodeId),
  }));
  const projectedNodeById = new Map(projectedNodes.map((node) => [node.nodeId, node]));
  const projectIntersection = (intersection: CanvasV2SpatialIntersection): CanvasV2SpatialIntersection | undefined => {
    const first = projectedNodeById.get(intersection.firstNodeId);
    const second = projectedNodeById.get(intersection.secondNodeId);
    if (!first || !second) return intersection;
    const x = Math.max(first.bounds.x, second.bounds.x);
    const y = Math.max(first.bounds.y, second.bounds.y);
    const right = Math.min(first.bounds.x + first.bounds.width, second.bounds.x + second.bounds.width);
    const bottom = Math.min(first.bounds.y + first.bounds.height, second.bounds.y + second.bounds.height);
    if (right <= x || bottom <= y) return undefined;
    const width = round(right - x);
    const height = round(bottom - y);
    const area = width * height;
    return {
      ...intersection,
      intersection: { x: round(x), y: round(y), width, height },
      firstCoverage: round(area / Math.max(1, first.bounds.width * first.bounds.height)),
      secondCoverage: round(area / Math.max(1, second.bounds.width * second.bounds.height)),
    };
  };
  const projectedEvidence = observation.spatial.evidence.map((item) => ({ ...item, bounds: projectBounds(item.bounds, item.nodeId) }));
  const projectedRegions = observation.spatial.designRegions?.map((region) => {
    const bounds = projectBounds(region.bounds, region.nodeId);
    const nativeOverflow = nativeSubtreeOverflow(region.nodeId, bounds);
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
      ...(nativeOverflow ? {
        contentOverflowX: nativeOverflow.x,
        contentOverflowY: nativeOverflow.y,
      } : {}),
    };
  });
  const projectedOccupants = authoredSurface?.placementOccupants?.map((occupant) => ({
    ...occupant,
    ...(projectedParentNodeId(occupant.nodeId, occupant.parentNodeId)
      ? { parentNodeId: projectedParentNodeId(occupant.nodeId, occupant.parentNodeId) }
      : { parentNodeId: undefined }),
    bounds: projectBounds(occupant.bounds, occupant.nodeId),
  }));
  const canonicalLanes = scene.nodes.flatMap((node) => {
    if (!node.sourceNodeId || node.attributes["data-canvas-v2-canonical-flow"] === undefined) return [];
    const bounds = canvasV2NativeSceneAbsoluteBounds(scene, node.sourceNodeId);
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
      nodes: projectedNodes,
      notableIntersections: observation.spatial.notableIntersections.flatMap((intersection) => {
        const projected = projectIntersection(intersection);
        return projected ? [projected] : [];
      }),
      textCollisions: observation.spatial.textCollisions?.flatMap((intersection) => {
        const projected = projectIntersection(intersection);
        return projected ? [projected] : [];
      }),
      contentOverflowNodeIds: observation.spatial.contentOverflowNodeIds.filter((nodeId) => {
        const bounds = projectedNodeById.get(nodeId)?.bounds;
        if (!bounds) return true;
        const overflow = nativeSubtreeOverflow(nodeId, bounds);
        return !overflow || overflow.x > 2 || overflow.y > 2;
      }),
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
  const visit = (current: CanvasV2NativeSceneNode) => {
    if (visited.has(current.id)) return;
    visited.add(current.id);
    if (current.resolvedStyle) {
      // Detaching a selected card or island removes every ancestry-sensitive
      // selector in one move. Preserve the resolved layout and paint of the
      // complete subtree—not only its text leaves—so nested grids, gaps,
      // margins and rails remain pixel-identical while the object changes
      // world position. Explicit author/user inline styles still win.
      current.inlineStyle = { ...current.resolvedStyle, ...current.inlineStyle };
    }
    for (const childId of current.childIds) {
      const child = byId.get(childId);
      if (child) visit(child);
    }
  };
  visit(node);
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

function nativePrimitiveNodes(
  scene: CanvasV2NativeSceneDocument,
  mutation: Extract<CanvasV2ManualMutation, { kind: "create" }>,
): CanvasV2NativeSceneNode[] {
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
      "data-canvas-v2-origin": "user",
      "data-canvas-v2-primitive": mutation.primitive,
      "data-canvas-v2-user-edited": "create",
      "data-canvas-v2-last-author": "user",
      "data-canvas-v2-edit-version": "1",
      "data-canvas-v2-native-runtime-node": "true",
      "data-canvas-v2-native-scene-id": mutation.nodeId,
    },
    inlineStyle: {},
  };
  const width = Math.max(1, round(mutation.width ?? (mutation.primitive === "table" ? 480 : mutation.primitive === "frame" ? 360 : mutation.primitive === "text" ? 220 : 160)));
  const height = Math.max(1, round(mutation.height ?? (mutation.primitive === "table" ? 120 : mutation.primitive === "frame" ? 240 : mutation.primitive === "text" ? 48 : 160)));
  if (mutation.primitive === "text") return [{
    ...base,
    tagName: "p",
    kind: "text",
    geometry: { x: round(mutation.x), y: round(mutation.y), width, height, rotation: 0, zIndex: 0 },
    inlineStyle: { margin: "0", font: "600 28px/1.3 Inter,system-ui,sans-serif", color: "var(--northstar-ink)" },
    directText: "New text",
    content: [{ kind: "text", value: "New text" }],
  }];
  if (mutation.primitive === "note") return [{
    ...base,
    tagName: "article",
    kind: "note",
    geometry: { x: round(mutation.x), y: round(mutation.y), width, height, rotation: 0, zIndex: 0 },
    attributes: { ...base.attributes, "aria-label": "Note" },
    inlineStyle: {
      padding: "20px",
      border: "1px solid #e8d37a",
      "border-radius": "8px",
      background: "#fff2a8",
      color: "#332e1e",
      "box-shadow": "0 8px 22px rgba(71,59,10,.12)",
      font: "600 18px/1.45 Inter,system-ui,sans-serif",
    },
    directText: "Add a note",
    content: [{ kind: "text", value: "Add a note" }],
  }];
  if (mutation.primitive === "frame") return [{
    ...base,
    tagName: "section",
    kind: "frame",
    geometry: { x: round(mutation.x), y: round(mutation.y), width, height, rotation: 0, zIndex: 0 },
    attributes: { ...base.attributes, "aria-label": "Frame" },
    inlineStyle: { border: "2px solid var(--northstar-violet)", "border-radius": "20px", background: "var(--northstar-surface)" },
    content: [],
  }];
  if (mutation.primitive === "shape") {
    const variant: CanvasV2ShapeVariant = mutation.shapeVariant ?? "rectangle";
    const variantStyle: Record<string, string> = variant === "ellipse"
      ? { "border-radius": "999px" }
      : variant === "diamond"
        ? { "border-radius": "18px", "clip-path": "polygon(50% 0,100% 50%,50% 100%,0 50%)" }
        : variant === "triangle"
          ? { "border-radius": "0", "clip-path": "polygon(50% 0,100% 100%,0 100%)" }
          : variant === "pill" ? { "border-radius": "999px" } : { "border-radius": "24px" };
    return [{
      ...base,
      tagName: "div",
      kind: "shape",
      geometry: { x: round(mutation.x), y: round(mutation.y), width, height, rotation: 0, zIndex: 0 },
      attributes: { ...base.attributes, "data-canvas-v2-shape": variant, "aria-label": `${variant} shape` },
      inlineStyle: { ...variantStyle, background: "#7661f3" },
      content: [],
    }];
  }
  if (mutation.primitive === "connector") {
    const endX = round(mutation.endX ?? mutation.x + width);
    const endY = round(mutation.endY ?? mutation.y);
    const variant: CanvasV2ConnectorVariant = mutation.connectorVariant ?? "arrow";
    const bend = variant === "curve" ? 72 : 0;
    const geometry = buildCanvasV2ConnectorGeometry({ start: { x: mutation.x, y: mutation.y }, end: { x: endX, y: endY }, variant, bend });
    const endpointLayers = [mutation.fromNodeId, mutation.toNodeId].flatMap((nodeId) => {
      const endpoint = nodeId ? scene.nodes.find((node) => node.sourceNodeId === nodeId) : undefined;
      return endpoint ? [endpoint.geometry.zIndex] : [];
    });
    const pathId = `${mutation.nodeId}-path`;
    const hitId = `${mutation.nodeId}-hit`;
    const startId = `${mutation.nodeId}-start`;
    const endId = `${mutation.nodeId}-end`;
    const root: CanvasV2NativeSceneNode = {
      ...base,
      childIds: [pathId, hitId, startId, endId],
      tagName: "svg",
      namespace: "svg",
      kind: "connector",
      geometry: {
        ...geometry.bounds,
        rotation: 0,
        zIndex: endpointLayers.length === 2 ? Math.min(...endpointLayers) - 1 : 0,
      },
      attributes: {
        ...base.attributes,
        viewBox: `0 0 ${geometry.bounds.width} ${geometry.bounds.height}`,
        "aria-label": `${variant} connector`,
        "data-canvas-v2-connector-variant": variant,
        "data-canvas-v2-connector-from-x": String(round(mutation.x)),
        "data-canvas-v2-connector-from-y": String(round(mutation.y)),
        "data-canvas-v2-connector-to-x": String(endX),
        "data-canvas-v2-connector-to-y": String(endY),
        "data-canvas-v2-connector-bend": String(bend),
        "data-canvas-v2-connector-control-x": String(geometry.control.x),
        "data-canvas-v2-connector-control-y": String(geometry.control.y),
        ...(mutation.fromNodeId ? { "data-canvas-v2-connector-from": mutation.fromNodeId } : {}),
        ...(mutation.toNodeId ? { "data-canvas-v2-connector-to": mutation.toNodeId } : {}),
      },
      inlineStyle: { overflow: "visible" },
      content: [{ kind: "node", id: pathId }, { kind: "node", id: hitId }, { kind: "node", id: startId }, { kind: "node", id: endId }],
    };
    const connectorChild = (id: string, tagName: string, attributes: Record<string, string>): CanvasV2NativeSceneNode => ({
      id,
      parentId: root.id,
      childIds: [],
      order: scene.nodes.length + root.childIds.indexOf(id) + 1,
      tagName,
      namespace: "svg",
      layoutMode: "flow",
      kind: "connector",
      selectable: false,
      hidden: false,
      locked: false,
      canonicalEvidence: false,
      userEdited: true,
      lastAuthor: "user",
      editVersion: 1,
      geometry: { x: 0, y: 0, width: geometry.bounds.width, height: geometry.bounds.height, rotation: 0, zIndex: 0 },
      attributes,
      inlineStyle: {},
      content: [],
    });
    return [
      root,
      connectorChild(pathId, "path", { "data-canvas-v2-connector-part": "path", d: geometry.path, fill: "none", stroke: "#6754de", "stroke-width": "4", "stroke-linecap": "round" }),
      connectorChild(hitId, "path", { "data-canvas-v2-connector-part": "hit", d: geometry.path, fill: "none", stroke: "transparent", "stroke-width": "20", "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "pointer-events": "stroke" }),
      connectorChild(startId, "circle", { "data-canvas-v2-connector-part": "start", cx: String(geometry.localStart.x), cy: String(geometry.localStart.y), r: "5.5", fill: "var(--northstar-surface)", stroke: "#6754de", "stroke-width": "2.5" }),
      connectorChild(endId, variant === "arrow" ? "polyline" : "circle", variant === "arrow"
        ? { "data-canvas-v2-connector-part": "end", points: geometry.arrowPoints, fill: "none", stroke: "#6754de", "stroke-width": "3.5", "stroke-linecap": "round", "stroke-linejoin": "round" }
        : { "data-canvas-v2-connector-part": "end", cx: String(geometry.localEnd.x), cy: String(geometry.localEnd.y), r: "5.5", fill: "var(--northstar-surface)", stroke: "#6754de", "stroke-width": "2.5" }),
    ];
  }
  if (mutation.primitive === "line") {
    const endX = round(mutation.endX ?? mutation.x + width);
    const endY = round(mutation.endY ?? mutation.y);
    const lineWidth = Math.max(1, round(Math.hypot(endX - mutation.x, endY - mutation.y)));
    const rotation = round(Math.atan2(endY - mutation.y, endX - mutation.x) * 180 / Math.PI);
    return [{
      ...base,
      tagName: "div",
      kind: "line",
      geometry: { x: round(mutation.x + (endX - mutation.x) / 2 - lineWidth / 2), y: round(mutation.y + (endY - mutation.y) / 2 - 2), width: lineWidth, height: 4, rotation, zIndex: 0 },
      attributes: { ...base.attributes, "aria-label": "Line" },
      inlineStyle: { background: "#6754de", "border-radius": "999px" },
      content: [],
    }];
  }
  if (mutation.primitive === "image") return [{
    ...base,
    tagName: "img",
    kind: "image",
    geometry: { x: round(mutation.x), y: round(mutation.y), width, height, rotation: 0, zIndex: 0 },
    attributes: {
      ...base.attributes,
      "data-canvas-v2-local-image": "true",
      src: mutation.src ?? "",
      alt: mutation.alt ?? "",
      loading: "lazy",
      decoding: "async",
    },
    inlineStyle: { "border-radius": "16px", "object-fit": "cover", background: "#edeaf8" },
    content: [],
  }];
  if (mutation.primitive === "drawing") {
    const pathId = `${mutation.nodeId}-stroke`;
    const points = (mutation.points?.length ? mutation.points : [{ x: 4, y: 36 }, { x: 32, y: 8 }, { x: 68, y: 50 }, { x: 112, y: 14 }, { x: 156, y: 34 }])
      .map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
    const root: CanvasV2NativeSceneNode = {
      ...base,
      childIds: [pathId],
      tagName: "svg",
      namespace: "svg",
      kind: "drawing",
      geometry: { x: round(mutation.x), y: round(mutation.y), width, height, rotation: 0, zIndex: 0 },
      attributes: { ...base.attributes, viewBox: `0 0 ${width} ${height}`, "aria-label": "Freehand drawing" },
      inlineStyle: { overflow: "visible" },
      content: [{ kind: "node", id: pathId }],
    };
    const stroke: CanvasV2NativeSceneNode = {
      id: pathId,
      parentId: root.id,
      childIds: [],
      order: scene.nodes.length + 1,
      tagName: "polyline",
      namespace: "svg",
      layoutMode: "flow",
      kind: "drawing",
      selectable: false,
      hidden: false,
      locked: false,
      canonicalEvidence: false,
      userEdited: true,
      lastAuthor: "user",
      editVersion: 1,
      geometry: { x: 0, y: 0, width, height, rotation: 0, zIndex: 0 },
      attributes: { points, fill: "none", stroke: "#6754de", "stroke-width": "10", "stroke-linecap": "round", "stroke-linejoin": "round" },
      inlineStyle: {},
      content: [],
    };
    return [root, stroke];
  }
  return [{
    ...base,
    tagName: "table",
    kind: "table",
    geometry: { x: round(mutation.x), y: round(mutation.y), width, height, rotation: 0, zIndex: 0 },
    attributes: { ...base.attributes, "aria-label": "Table" },
    inlineStyle: { "border-collapse": "collapse", background: "var(--northstar-surface)", color: "var(--northstar-ink)" },
    directText: "Cell 1    Cell 2\nCell 3    Cell 4",
    content: [{ kind: "text", value: "Cell 1    Cell 2\nCell 3    Cell 4" }],
  }];
}

function nativeAbsoluteOrigin(scene: CanvasV2NativeSceneDocument, node: CanvasV2NativeSceneNode): { x: number; y: number } {
  const byId = canvasV2NativeSceneNodeMap(scene);
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
}

function uniqueNativeNodeId(scene: CanvasV2NativeSceneDocument, preferred: string): string {
  const used = new Set(scene.nodes.map((node) => node.id));
  let candidate = preferred;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${preferred}-${suffix++}`;
  return candidate;
}

/**
 * Turn an explicitly related authored SVG path into a genuine native
 * connector while preserving its colour, weight, dash, opacity and route.
 * The visible stroke remains model-governed. A second transparent path owns a
 * generous screen-stable pointer corridor, making thin and zoomed-out routes
 * as easy to hover and select as every other canvas object.
 */
export function promoteCanvasV2AuthoredRelationships(
  scene: CanvasV2NativeSceneDocument,
  promotions: readonly CanvasV2AuthoredRelationshipPromotion[],
): void {
  for (const promotion of promotions) {
    const connector = scene.nodes.find((node) => node.sourceNodeId === promotion.nodeId);
    if (!connector || connector.kind === "connector") continue;
    const parent = connector.parentId ? scene.nodes.find((node) => node.id === connector.parentId) : undefined;
    const parentOrigin = parent ? nativeAbsoluteOrigin(scene, parent) : { x: 0, y: 0 };
    const start = {
      x: round(parentOrigin.x + promotion.startInParent.x),
      y: round(parentOrigin.y + promotion.startInParent.y),
    };
    const end = {
      x: round(parentOrigin.x + promotion.endInParent.x),
      y: round(parentOrigin.y + promotion.endInParent.y),
    };
    const control = {
      x: round(parentOrigin.x + promotion.controlInParent.x),
      y: round(parentOrigin.y + promotion.controlInParent.y),
    };
    const variant: CanvasV2ConnectorVariant = promotion.curved ? "curve" : promotion.arrow ? "arrow" : "straight";
    const bend = variant === "curve" ? canvasV2ConnectorBendFromPoint(start, end, control) : 0;
    const geometry = buildCanvasV2ConnectorGeometry({
      start,
      end,
      variant,
      bend,
      ...(variant === "curve" ? { control } : {}),
    });

    // Authored relationship leaves are normally paths, but prune any private
    // descendants defensively before replacing the leaf with a connector root.
    const descendants = new Set<string>();
    const pending = [...connector.childIds];
    const byId = canvasV2NativeSceneNodeMap(scene);
    while (pending.length) {
      const id = pending.pop()!;
      if (descendants.has(id)) continue;
      descendants.add(id);
      pending.push(...(byId.get(id)?.childIds ?? []));
    }
    scene.nodes = scene.nodes.filter((node) => !descendants.has(node.id));

    const pathId = uniqueNativeNodeId(scene, `${connector.id}::path`);
    const hitId = uniqueNativeNodeId(scene, `${connector.id}::hit`);
    const endId = promotion.arrow ? uniqueNativeNodeId(scene, `${connector.id}::arrow`) : undefined;
    const childIds = [pathId, hitId, ...(endId ? [endId] : [])];
    const originalAttributes = { ...connector.attributes };
    for (const attribute of ["d", "fill", "marker-end", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "vector-effect", "pointer-events"]) {
      delete originalAttributes[attribute];
    }
    connector.tagName = "svg";
    connector.namespace = "svg";
    connector.layoutMode = "absolute";
    connector.kind = "connector";
    connector.selectable = true;
    connector.geometry = {
      x: round(geometry.bounds.x - parentOrigin.x),
      y: round(geometry.bounds.y - parentOrigin.y),
      width: geometry.bounds.width,
      height: geometry.bounds.height,
      rotation: 0,
      zIndex: connector.geometry.zIndex,
    };
    connector.childIds = childIds;
    connector.content = childIds.map((id) => ({ kind: "node" as const, id }));
    connector.directText = undefined;
    connector.attributes = {
      ...originalAttributes,
      viewBox: `0 0 ${geometry.bounds.width} ${geometry.bounds.height}`,
      "aria-label": originalAttributes["aria-label"] ?? `${promotion.curved ? "Curved " : ""}${promotion.arrow ? "arrow " : ""}relationship from ${promotion.sourceNodeId} to ${promotion.targetNodeId}`,
      "data-canvas-v2-primitive": "connector",
      "data-canvas-v2-native-relationship": "true",
      "data-canvas-v2-connector-variant": variant,
      "data-canvas-v2-connector-from": promotion.sourceNodeId,
      "data-canvas-v2-connector-to": promotion.targetNodeId,
      "data-canvas-v2-connector-from-x": String(start.x),
      "data-canvas-v2-connector-from-y": String(start.y),
      "data-canvas-v2-connector-to-x": String(end.x),
      "data-canvas-v2-connector-to-y": String(end.y),
      "data-canvas-v2-connector-bend": String(bend),
      "data-canvas-v2-connector-control-x": String(geometry.control.x),
      "data-canvas-v2-connector-control-y": String(geometry.control.y),
      ...(promotion.arrow ? { "data-canvas-v2-connector-arrow": "true" } : {}),
    };
    connector.inlineStyle = { ...connector.inlineStyle, overflow: "visible", "pointer-events": "auto" };

    const child = (id: string, tagName: string, attributes: Record<string, string>): CanvasV2NativeSceneNode => ({
      id,
      parentId: connector.id,
      childIds: [],
      order: connector.order + childIds.indexOf(id) + 1,
      tagName,
      namespace: "svg",
      layoutMode: "flow",
      kind: "connector",
      selectable: false,
      hidden: false,
      locked: connector.locked,
      canonicalEvidence: connector.canonicalEvidence,
      userEdited: connector.userEdited,
      ...(connector.lastAuthor ? { lastAuthor: connector.lastAuthor } : {}),
      editVersion: connector.editVersion,
      geometry: { x: 0, y: 0, width: geometry.bounds.width, height: geometry.bounds.height, rotation: 0, zIndex: 0 },
      attributes,
      inlineStyle: {},
      content: [],
    });
    const sharedVisibleStroke = {
      fill: "none",
      stroke: promotion.stroke,
      "stroke-width": String(promotion.strokeWidth),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "pointer-events": "none",
      ...(promotion.strokeDasharray ? { "stroke-dasharray": promotion.strokeDasharray } : {}),
      ...(promotion.opacity ? { opacity: promotion.opacity } : {}),
    };
    scene.nodes.push(
      child(pathId, "path", {
        "data-canvas-v2-connector-part": "path",
        d: geometry.path,
        ...sharedVisibleStroke,
      }),
      child(hitId, "path", {
        "data-canvas-v2-connector-part": "hit",
        d: geometry.path,
        fill: "none",
        stroke: "transparent",
        "stroke-width": "20",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "stroke",
      }),
      ...(endId ? [child(endId, "polyline", {
        "data-canvas-v2-connector-part": "end",
        points: geometry.arrowPoints,
        ...sharedVisibleStroke,
      })] : []),
    );
  }
}

/** Keep relationship endpoints attached through move, resize, group and undo. */
export function reconcileCanvasV2NativeConnectors(scene: CanvasV2NativeSceneDocument): void {
  const bySourceId = canvasV2NativeSceneSourceNodeMap(scene);
  const byId = canvasV2NativeSceneNodeMap(scene);
  const numberAttribute = (node: CanvasV2NativeSceneNode, name: string, fallback: number) => {
    const value = Number(node.attributes[name]);
    return Number.isFinite(value) ? value : fallback;
  };
  const endpointBounds = (node: CanvasV2NativeSceneNode) => {
    const origin = nativeAbsoluteOrigin(scene, node);
    return { x: origin.x, y: origin.y, width: node.geometry.width, height: node.geometry.height };
  };
  for (const connector of scene.nodes.filter((node) => node.kind === "connector")) {
    const fromId = connector.attributes["data-canvas-v2-connector-from"];
    const toId = connector.attributes["data-canvas-v2-connector-to"];
    const from = fromId ? bySourceId.get(fromId) : undefined;
    const to = toId ? bySourceId.get(toId) : undefined;
    if (fromId && !from) delete connector.attributes["data-canvas-v2-connector-from"];
    if (toId && !to) delete connector.attributes["data-canvas-v2-connector-to"];
    const freeStart = {
      x: numberAttribute(connector, "data-canvas-v2-connector-from-x", connector.geometry.x + 16),
      y: numberAttribute(connector, "data-canvas-v2-connector-from-y", connector.geometry.y + connector.geometry.height / 2),
    };
    const freeEnd = {
      x: numberAttribute(connector, "data-canvas-v2-connector-to-x", connector.geometry.x + connector.geometry.width - 16),
      y: numberAttribute(connector, "data-canvas-v2-connector-to-y", connector.geometry.y + connector.geometry.height / 2),
    };
    const fromCenter: CanvasV2ConnectorPoint = from ? (() => { const bounds = endpointBounds(from); return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }; })() : freeStart;
    const toCenter: CanvasV2ConnectorPoint = to ? (() => { const bounds = endpointBounds(to); return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }; })() : freeEnd;
    const start = from ? canvasV2ConnectorBoundaryAnchor(endpointBounds(from), toCenter) : freeStart;
    const end = to ? canvasV2ConnectorBoundaryAnchor(endpointBounds(to), fromCenter) : freeEnd;
    connector.attributes["data-canvas-v2-connector-from-x"] = String(round(start.x));
    connector.attributes["data-canvas-v2-connector-from-y"] = String(round(start.y));
    connector.attributes["data-canvas-v2-connector-to-x"] = String(round(end.x));
    connector.attributes["data-canvas-v2-connector-to-y"] = String(round(end.y));
    const variantValue = connector.attributes["data-canvas-v2-connector-variant"];
    const variant: CanvasV2ConnectorVariant = variantValue === "straight" || variantValue === "curve" ? variantValue : "arrow";
    const storedControlX = Number(connector.attributes["data-canvas-v2-connector-control-x"]);
    const storedControlY = Number(connector.attributes["data-canvas-v2-connector-control-y"]);
    const geometry = buildCanvasV2ConnectorGeometry({
      start,
      end,
      variant,
      bend: numberAttribute(connector, "data-canvas-v2-connector-bend", 72),
      ...(variant === "curve" && Number.isFinite(storedControlX) && Number.isFinite(storedControlY)
        ? { control: { x: storedControlX, y: storedControlY } }
        : {}),
    });
    if (variant === "curve") {
      connector.attributes["data-canvas-v2-connector-control-x"] = String(geometry.control.x);
      connector.attributes["data-canvas-v2-connector-control-y"] = String(geometry.control.y);
    }
    const parentOrigin = connector.parentId
      ? nativeAbsoluteOrigin(scene, byId.get(connector.parentId)!)
      : { x: 0, y: 0 };
    connector.geometry.x = round(geometry.bounds.x - parentOrigin.x);
    connector.geometry.y = round(geometry.bounds.y - parentOrigin.y);
    connector.geometry.width = geometry.bounds.width;
    connector.geometry.height = geometry.bounds.height;
    connector.geometry.rotation = 0;
    connector.attributes.viewBox = `0 0 ${geometry.bounds.width} ${geometry.bounds.height}`;
    for (const childId of connector.childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      child.geometry.width = geometry.bounds.width;
      child.geometry.height = geometry.bounds.height;
      const part = child.attributes["data-canvas-v2-connector-part"];
      if (part === "path" || part === "hit") child.attributes.d = geometry.path;
      else if (part === "start") {
        child.attributes.cx = String(geometry.localStart.x);
        child.attributes.cy = String(geometry.localStart.y);
      } else if (part === "end" && child.tagName === "polyline") child.attributes.points = geometry.arrowPoints;
      else if (part === "end") {
        child.attributes.cx = String(geometry.localEnd.x);
        child.attributes.cy = String(geometry.localEnd.y);
      }
    }
  }
}

function applyAtomicNativeMutation(
  scene: CanvasV2NativeSceneDocument,
  mutation: Exclude<CanvasV2ManualMutation, { kind: "batch" }>,
): void {
  if (mutation.kind === "create") {
    if (scene.nodes.some((node) => node.sourceNodeId === mutation.nodeId)) throw new Error("A created node requires a unique identity.");
    const nodes = nativePrimitiveNodes(scene, mutation);
    scene.nodes.push(...nodes);
    scene.rootIds.push(nodes[0].id);
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
        "data-canvas-v2-origin": "user",
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
    if (node.kind === "connector") {
      const value = (name: string, fallback: number) => {
        const current = Number(node.attributes[name]);
        return Number.isFinite(current) ? current : fallback;
      };
      const origin = nativeAbsoluteOrigin(scene, node);
      node.attributes["data-canvas-v2-connector-from-x"] = String(round(value("data-canvas-v2-connector-from-x", origin.x + 16) + mutation.deltaX));
      node.attributes["data-canvas-v2-connector-from-y"] = String(round(value("data-canvas-v2-connector-from-y", origin.y + node.geometry.height / 2) + mutation.deltaY));
      node.attributes["data-canvas-v2-connector-to-x"] = String(round(value("data-canvas-v2-connector-to-x", origin.x + node.geometry.width - 16) + mutation.deltaX));
      node.attributes["data-canvas-v2-connector-to-y"] = String(round(value("data-canvas-v2-connector-to-y", origin.y + node.geometry.height / 2) + mutation.deltaY));
      if (node.attributes["data-canvas-v2-connector-variant"] === "curve") {
        node.attributes["data-canvas-v2-connector-control-x"] = String(round(value("data-canvas-v2-connector-control-x", origin.x + node.geometry.width / 2) + mutation.deltaX));
        node.attributes["data-canvas-v2-connector-control-y"] = String(round(value("data-canvas-v2-connector-control-y", origin.y + node.geometry.height / 2) + mutation.deltaY));
      }
      delete node.attributes["data-canvas-v2-connector-from"];
      delete node.attributes["data-canvas-v2-connector-to"];
    } else {
      prepareNativeGeometryMutation(scene, node);
      node.geometry.x = round(node.geometry.x + mutation.deltaX);
      node.geometry.y = round(node.geometry.y + mutation.deltaY);
    }
  } else if (mutation.kind === "resize") {
    if (node.kind === "connector") throw new Error("Drag a connector endpoint to resize it.");
    prepareNativeGeometryMutation(scene, node);
    node.geometry.width = Math.max(Math.max(1, Math.min(24, node.geometry.width * 0.1)), round(mutation.width));
    node.geometry.height = Math.max(Math.max(1, Math.min(24, node.geometry.height * 0.1)), round(mutation.height));
    if (mutation.fontSize !== undefined) node.inlineStyle["font-size"] = `${round(mutation.fontSize)}px`;
  } else if (mutation.kind === "transform") {
    if (node.kind === "connector") throw new Error("Drag a connector endpoint to transform it.");
    prepareNativeGeometryMutation(scene, node);
    node.geometry.x = round(node.geometry.x + mutation.deltaX);
    node.geometry.y = round(node.geometry.y + mutation.deltaY);
    node.geometry.width = Math.max(Math.max(1, Math.min(24, node.geometry.width * 0.1)), round(mutation.width));
    node.geometry.height = Math.max(Math.max(1, Math.min(24, node.geometry.height * 0.1)), round(mutation.height));
    if (mutation.fontSize !== undefined) node.inlineStyle["font-size"] = `${round(mutation.fontSize)}px`;
  } else if (mutation.kind === "text") {
    const byId = canvasV2NativeSceneNodeMap(scene);
    const descendants = (rootId: string) => {
      const ids = new Set<string>();
      const pending = [...(byId.get(rootId)?.childIds ?? [])];
      while (pending.length) {
        const id = pending.pop()!;
        if (ids.has(id)) continue;
        ids.add(id);
        pending.push(...(byId.get(id)?.childIds ?? []));
      }
      return ids;
    };
    const originalDescendants = descendants(node.id);
    if (mutation.nativeContent?.length) {
      const editableIds = new Set([node.id, ...originalDescendants]);
      for (const update of mutation.nativeContent) {
        const target = editableIds.has(update.sceneNodeId) ? byId.get(update.sceneNodeId) : undefined;
        if (!target) continue;
        const content: CanvasV2NativeSceneNode["content"] = [];
        for (const item of update.content) {
          if (item.kind === "text") content.push({ kind: "text", value: item.value });
          else if (editableIds.has(item.id) && byId.has(item.id)) content.push({ kind: "node", id: item.id });
        }
        target.content = content;
        target.childIds = content.flatMap((item) => item.kind === "node" ? [item.id] : []);
        const direct = content.filter((item): item is { kind: "text"; value: string } => item.kind === "text").map((item) => item.value).join("");
        target.directText = direct || undefined;
      }
      const remainingDescendants = descendants(node.id);
      scene.nodes = scene.nodes.filter((candidate) => !originalDescendants.has(candidate.id) || remainingDescendants.has(candidate.id));
    } else {
      scene.nodes = scene.nodes.filter((candidate) => !originalDescendants.has(candidate.id));
      node.content = [{ kind: "text", value: mutation.text }];
      node.childIds = [];
      node.directText = mutation.text;
    }
    if (mutation.layout?.width !== undefined) node.geometry.width = Math.max(node.geometry.width, round(mutation.layout.width));
    if (mutation.layout?.height !== undefined) node.geometry.height = Math.max(node.geometry.height, round(mutation.layout.height));
  } else if (mutation.kind === "style") {
    if ((node.kind === "drawing" || node.kind === "connector") && mutation.property === "background-color") {
      const byId = canvasV2NativeSceneNodeMap(scene);
      for (const childId of node.childIds) {
        const stroke = byId.get(childId);
        if (stroke?.attributes.stroke && stroke.attributes["data-canvas-v2-connector-part"] !== "hit") stroke.attributes.stroke = mutation.value;
      }
    } else node.inlineStyle[mutation.property] = mutation.value;
  } else if (mutation.kind === "attribute") {
    node.attributes.alt = mutation.value;
  } else if (mutation.kind === "image-source") {
    if (node.kind !== "image" || node.attributes["data-canvas-v2-local-image"] !== "true") throw new Error("Replace is available only for a user image object.");
    node.attributes.src = mutation.src;
    if (mutation.alt !== undefined) node.attributes.alt = mutation.alt;
  } else if (mutation.kind === "connector-endpoint") {
    if (node.kind !== "connector") throw new Error("Endpoints are available only for a connector object.");
    const coordinatePrefix = mutation.endpoint === "from" ? "data-canvas-v2-connector-from" : "data-canvas-v2-connector-to";
    node.attributes[`${coordinatePrefix}-x`] = String(round(mutation.x));
    node.attributes[`${coordinatePrefix}-y`] = String(round(mutation.y));
    if (mutation.attachNodeId) {
      const target = sourceNode(scene, mutation.attachNodeId);
      if (target.id === node.id || target.kind === "root" || target.kind === "connector" || target.hidden) throw new Error("That object cannot own a connector endpoint.");
      node.attributes[coordinatePrefix] = mutation.attachNodeId;
    } else delete node.attributes[coordinatePrefix];
  } else if (mutation.kind === "connector-curve") {
    if (node.kind !== "connector" || node.attributes["data-canvas-v2-connector-variant"] !== "curve") throw new Error("Curve adjustment is available only for a curved connector.");
    node.attributes["data-canvas-v2-connector-control-x"] = String(round(mutation.x));
    node.attributes["data-canvas-v2-connector-control-y"] = String(round(mutation.y));
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
      const copy: CanvasV2NativeSceneNode = {
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
      if (copy.kind === "connector") {
        delete copy.attributes["data-canvas-v2-connector-from"];
        delete copy.attributes["data-canvas-v2-connector-to"];
      }
      return copy;
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
    if (node.kind === "connector") throw new Error("A connector is controlled by its two endpoints.");
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
  reconcileCanvasV2NativeConnectors(scene);
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
