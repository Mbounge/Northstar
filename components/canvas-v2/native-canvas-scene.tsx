"use client";

import {
  createElement,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  applyCanvasV2ArtifactThemeToElement,
  createCanvasV2ArtifactThemeState,
  type CanvasV2ArtifactTheme,
} from "@/lib/canvas-v2/artifact-theme";
import { buildCanvasV2RuntimeDocument } from "@/lib/canvas-v2/runtime-document";
import { scopeCanvasV2ArtifactCss } from "@/lib/canvas-v2/style-isolation";
import {
  canvasV2NativeSceneNodeMap,
  canvasV2NativeSceneNodeHasRenderableNamespace,
  canvasV2NativeSceneNodeIsWritable,
  canvasV2NativeSceneNodeSupportsTextEditing,
  canvasV2NativeSceneNodeUsesHostBackground,
  canvasV2NativeSceneSourceNodeMap,
  compileCanvasV2NativeScene,
  normalizeCanvasV2ReactInlineStyle,
  type CanvasV2NativeSceneDocument,
  type CanvasV2NativeSceneNode,
} from "@/lib/canvas-v2/native-scene";
import { canvasV2ObjectOrigin } from "@/lib/canvas-v2/working-context";
import type { CanvasV2NativeTextContentUpdate } from "@/lib/canvas-v2/manual-mutations";
import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import type {
  CanvasV2InspectableElement,
  CanvasV2SelectionIntent,
} from "@/lib/canvas-v2/element-inspection";
import { buildCanvasV2ConnectorGeometry, canvasV2ConnectorBoundaryAnchor, type CanvasV2ConnectorVariant } from "@/lib/canvas-v2/connector-geometry";
import type { CanvasV2TransientGeometry } from "@/components/canvas-v2/canvas-scene";

export interface CanvasV2NativeCanvasSceneProps {
  revision: CanvasV2ArtifactRevision;
  theme: CanvasV2ArtifactTheme;
  width: number;
  height: number;
  framePointerEvents: "auto" | "none";
  inspectionEnabled: boolean;
  selectedNodeId?: string;
  selectedNodeIds?: readonly string[];
  onElementHover?: (element?: CanvasV2InspectableElement) => void;
  onElementSelect?: (element?: CanvasV2InspectableElement, intent?: CanvasV2SelectionIntent) => void;
  onSelectionRefresh?: (elements: CanvasV2InspectableElement[]) => void;
  onSceneSnapshot?: (elements: CanvasV2InspectableElement[]) => void;
  onNativeScene?: (scene: CanvasV2NativeSceneDocument) => void;
  sceneOverride?: CanvasV2NativeSceneDocument;
  onElementDoubleClick?: (element: CanvasV2InspectableElement) => void;
  onElementTextCommit?: (element: CanvasV2InspectableElement, text: string, nativeContent?: CanvasV2NativeTextContentUpdate[], layout?: { width?: number; height?: number }) => void;
  onWorkspaceWheel?: (event: { clientX: number; clientY: number; deltaX: number; deltaY: number; deltaMode?: number; ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean }) => void;
  onWorkspacePointer?: (event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean }) => void;
  onElementPointer?: (event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean; element: CanvasV2InspectableElement }) => void;
  transientGeometry?: Readonly<Record<string, CanvasV2TransientGeometry>>;
}

export interface CanvasV2NativeCanvasSceneHandle {
  applyTransientGeometry: (geometry?: Readonly<Record<string, CanvasV2TransientGeometry>>) => void;
  previewNodeRemoval: (nodeIds: readonly string[]) => void;
  restoreNodeRemovalPreview: () => void;
  commitNodeRemovalPreview: () => void;
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function camelCaseStyle(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function reactAttributes(node: CanvasV2NativeSceneNode): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.attributes)) {
    if (name === "class") attributes.className = value;
    else if (name === "for") attributes.htmlFor = value;
    else if (name === "tabindex") attributes.tabIndex = Number(value);
    else if (["hidden", "disabled", "checked", "multiple", "readonly", "required"].includes(name)) attributes[name === "readonly" ? "readOnly" : name] = value !== "false";
    else if (node.namespace === "svg" && name.includes("-") && !name.startsWith("data-") && !name.startsWith("aria-")) attributes[camelCaseStyle(name)] = value;
    else attributes[name] = value;
  }
  return attributes;
}

function absoluteGeometry(node: CanvasV2NativeSceneNode, byId: Map<string, CanvasV2NativeSceneNode>) {
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
  return { x, y, width: node.geometry.width, height: node.geometry.height };
}

export function placeCanvasV2CaretAtPoint(editable: HTMLElement, clientX: number, clientY: number): boolean {
  const document = editable.ownerDocument;
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const insideEditable = (node: Node) => node === editable || editable.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode);
  let range: Range | undefined;

  // Browser caret hit-testing is unreliable inside a deeply scaled canvas:
  // Chromium can return the matching x-position from the line above the one
  // that was actually double-clicked. Compare real painted caret boundaries
  // across every descendant text node so the chosen line and character both
  // come from the user's viewport point.
  let nearest: { node: Text; offset: number; score: number } | undefined;
  const walker = document.createTreeWalker(editable, 4 /* NodeFilter.SHOW_TEXT */);
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    for (let offset = 0; offset <= text.length; offset += 1) {
      const candidate = document.createRange();
      candidate.setStart(text, offset);
      candidate.collapse(true);
      let rect = candidate.getBoundingClientRect();
      if (rect.height === 0 && text.length) {
        const character = document.createRange();
        const start = Math.min(offset, text.length - 1);
        character.setStart(text, start);
        character.setEnd(text, start + 1);
        const characterRect = character.getBoundingClientRect();
        rect = {
          ...characterRect,
          x: offset === text.length ? characterRect.right : characterRect.left,
          left: offset === text.length ? characterRect.right : characterRect.left,
          right: offset === text.length ? characterRect.right : characterRect.left,
          width: 0,
        } as DOMRect;
      }
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.height <= 0) continue;
      const verticalDistance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const score = verticalDistance * 10_000 + Math.abs(rect.left - clientX);
      if (!nearest || score < nearest.score) nearest = { node: text, offset, score };
    }
    current = walker.nextNode();
  }
  if (nearest) {
    range = document.createRange();
    range.setStart(nearest.node, nearest.offset);
    range.collapse(true);
  } else {
    const position = caretDocument.caretPositionFromPoint?.(clientX, clientY);
    if (position && insideEditable(position.offsetNode)) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    } else {
      const pointRange = caretDocument.caretRangeFromPoint?.(clientX, clientY);
      if (pointRange && insideEditable(pointRange.startContainer)) {
        range = pointRange;
        range.collapse(true);
      }
    }
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
  }
  const selection = document.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return Boolean(nearest || caretDocument.caretPositionFromPoint || caretDocument.caretRangeFromPoint);
}

function canvasV2NativeTextContent(editable: HTMLElement): CanvasV2NativeTextContentUpdate[] {
  const elements = [editable, ...Array.from(editable.querySelectorAll<HTMLElement>("[data-canvas-v2-native-scene-id]"))];
  const updates = new Map<string, CanvasV2NativeTextContentUpdate>();
  const flattenedText = (element: Element): string => {
    if (element.tagName === "BR") return "\n";
    const value = Array.from(element.childNodes).map((child) => child.nodeType === Node.TEXT_NODE
      ? child.textContent ?? ""
      : child.nodeType === Node.ELEMENT_NODE ? flattenedText(child as Element) : "").join("");
    return /^(DIV|P|LI)$/.test(element.tagName) ? `${value}\n` : value;
  };
  for (const element of elements) {
    const sceneNodeId = element.dataset.canvasV2NativeSceneId;
    if (!sceneNodeId || updates.has(sceneNodeId)) continue;
    const content: CanvasV2NativeTextContentUpdate["content"] = [];
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) content.push({ kind: "text", value: child.textContent });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const childElement = child as HTMLElement;
      const childId = childElement.dataset.canvasV2NativeSceneId;
      if (childId) content.push({ kind: "node", id: childId });
      else {
        const value = flattenedText(childElement);
        if (value) content.push({ kind: "text", value });
      }
    }
    updates.set(sceneNodeId, { sceneNodeId, content });
  }
  return Array.from(updates.values());
}

function roundSceneMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The iframe compiles structure and the initial authored coordinate system,
 * but the public scene is the final visual authority. It can have app-loaded
 * fonts that an isolated srcDoc cannot inherit. Reconcile flow geometry from
 * the actual public DOM once, before handing native truth to the interaction
 * engine, so detaching a node preserves the exact box the user was looking at
 * instead of an approximation measured with fallback font metrics.
 */
function reconcilePublicSceneGeometry(
  scene: CanvasV2NativeSceneDocument,
  root: HTMLElement,
): CanvasV2NativeSceneDocument {
  const rootRect = root.getBoundingClientRect();
  const scaleX = rootRect.width / scene.width;
  const scaleY = rootRect.height / scene.height;
  if (!Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY) || scaleY <= 0) return scene;
  const elements = new Map<string, HTMLElement>();
  for (const node of scene.nodes) {
    const selector = `[data-canvas-v2-native-scene-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(node.id) : node.id.replaceAll('"', '\\"')}"]`;
    const element = root.querySelector<HTMLElement>(selector);
    if (element) elements.set(node.id, element);
  }
  let changed = false;
  const nodes = scene.nodes.map((node) => {
    // Absolute canvas objects already have authoritative world geometry from
    // the native scene. Reading their painted browser pixels back through the
    // camera scale quantizes sub-pixel coordinates and silently moves an
    // untouched collaborator on every later AI commit. Reconciliation exists
    // only to materialize browser-owned normal-flow layout.
    if (node.layoutMode === "absolute") return node;
    const element = elements.get(node.id);
    if (!element || node.geometry.rotation !== 0) return node;
    const rect = element.getBoundingClientRect();
    const parentRect = node.parentId ? elements.get(node.parentId)?.getBoundingClientRect() : rootRect;
    if (!parentRect || rect.width <= 0 || rect.height <= 0) return node;
    const geometry = {
      ...node.geometry,
      x: roundSceneMetric((rect.left - parentRect.left) / scaleX),
      y: roundSceneMetric((rect.top - parentRect.top) / scaleY),
      width: roundSceneMetric(rect.width / scaleX),
      height: roundSceneMetric(rect.height / scaleY),
    };
    if (geometry.x === node.geometry.x
      && geometry.y === node.geometry.y
      && geometry.width === node.geometry.width
      && geometry.height === node.geometry.height) return node;
    changed = true;
    return { ...node, geometry };
  });
  return changed ? { ...scene, nodes } : scene;
}

function inspectNativeNode(
  node: CanvasV2NativeSceneNode,
  byId: Map<string, CanvasV2NativeSceneNode>,
  element?: Element | null,
): CanvasV2InspectableElement {
  const computed = element ? element.ownerDocument.defaultView?.getComputedStyle(element) : undefined;
  const inheritedAttribute = (name: string): string | undefined => {
    let current: CanvasV2NativeSceneNode | undefined = node;
    while (current) {
      const value = current.attributes[name];
      if (value !== undefined) return value;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return undefined;
  };
  const evidenceAuthorityValue = inheritedAttribute("data-canvas-v2-evidence-authority");
  const shapeVariantValue = node.attributes["data-canvas-v2-shape"];
  const shapeVariant = shapeVariantValue === "rectangle" || shapeVariantValue === "ellipse" || shapeVariantValue === "diamond" || shapeVariantValue === "triangle" || shapeVariantValue === "pill"
    ? shapeVariantValue
    : undefined;
  const connector = node.kind === "connector" ? (() => {
    const numberAttribute = (name: string, fallback: number) => {
      const value = Number(node.attributes[name]);
      return Number.isFinite(value) ? value : fallback;
    };
    const bounds = absoluteGeometry(node, byId);
    const variantValue = node.attributes["data-canvas-v2-connector-variant"];
    const variant: CanvasV2ConnectorVariant = variantValue === "straight" || variantValue === "curve" ? variantValue : "arrow";
    const from = { x: numberAttribute("data-canvas-v2-connector-from-x", bounds.x + 16), y: numberAttribute("data-canvas-v2-connector-from-y", bounds.y + bounds.height / 2) };
    const to = { x: numberAttribute("data-canvas-v2-connector-to-x", bounds.x + bounds.width - 16), y: numberAttribute("data-canvas-v2-connector-to-y", bounds.y + bounds.height / 2) };
    const bend = numberAttribute("data-canvas-v2-connector-bend", variant === "curve" ? 72 : 0);
    const controlX = Number(node.attributes["data-canvas-v2-connector-control-x"]);
    const controlY = Number(node.attributes["data-canvas-v2-connector-control-y"]);
    return {
      variant,
      from: { ...from, ...(node.attributes["data-canvas-v2-connector-from"] ? { attachedNodeId: node.attributes["data-canvas-v2-connector-from"] } : {}) },
      to: { ...to, ...(node.attributes["data-canvas-v2-connector-to"] ? { attachedNodeId: node.attributes["data-canvas-v2-connector-to"] } : {}) },
      control: buildCanvasV2ConnectorGeometry({ start: from, end: to, variant, bend, ...(Number.isFinite(controlX) && Number.isFinite(controlY) ? { control: { x: controlX, y: controlY } } : {}) }).control,
      bend,
    };
  })() : undefined;
  return {
    nodeId: node.sourceNodeId ?? node.id,
    parentNodeId: node.parentId ? byId.get(node.parentId)?.sourceNodeId : undefined,
    tagName: node.tagName,
    kind: node.kind,
    label: node.attributes["aria-label"],
    textPreview: element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || node.directText?.trim().slice(0, 120) || undefined,
    textEditable: canvasV2NativeSceneNodeSupportsTextEditing(node, byId),
    writable: canvasV2NativeSceneNodeIsWritable(node),
    locked: node.locked,
    hidden: node.hidden,
    userEdited: node.userEdited,
    origin: canvasV2ObjectOrigin(node),
    lastAuthor: node.lastAuthor,
    editVersion: node.editVersion,
    rotation: node.geometry.rotation,
    canonicalEvidence: node.canonicalEvidence,
    evidenceId: node.attributes["data-canvas-v2-evidence-id"],
    evidencePacketId: inheritedAttribute("data-canvas-v2-evidence-packet-id"),
    evidenceSourceId: inheritedAttribute("data-canvas-v2-evidence-source-id"),
    evidenceAuthority: evidenceAuthorityValue === "observed" || evidenceAuthorityValue === "supplied" || evidenceAuthorityValue === "calculated" || evidenceAuthorityValue === "inferred"
      ? evidenceAuthorityValue
      : undefined,
    altText: node.kind === "image" ? node.attributes.alt ?? "" : undefined,
    ...(shapeVariant ? { shapeVariant } : {}),
    ...(connector ? { connector } : {}),
    visualStyle: {
      // Inspector state describes durable authored truth. The public DOM can
      // carry a reversible light/dark contrast override, which is what the
      // person sees but not what a paint-mode change should sample as its hue.
      color: node.inlineStyle.color ?? computed?.color ?? "",
      backgroundColor: node.inlineStyle["background-color"] ?? node.inlineStyle.background ?? computed?.backgroundColor ?? "",
      borderColor: node.inlineStyle["border-color"] ?? computed?.borderColor ?? "",
      borderStyle: node.inlineStyle["border-style"] ?? computed?.borderStyle ?? "",
      borderWidth: node.inlineStyle["border-width"] ?? computed?.borderWidth ?? "",
      borderRadius: node.inlineStyle["border-radius"] ?? computed?.borderRadius ?? "",
      fontFamily: computed?.fontFamily ?? "",
      fontSize: computed?.fontSize ?? "",
      lineHeight: computed?.lineHeight ?? "",
      fontWeight: computed?.fontWeight ?? "",
      fontStyle: computed?.fontStyle ?? "",
      textAlign: computed?.textAlign ?? "",
      textDecoration: computed?.textDecorationLine ?? "",
      opacity: computed?.opacity ?? "1",
      objectFit: computed?.objectFit ?? "fill",
    },
    bounds: absoluteGeometry(node, byId),
  };
}

const NATIVE_TRANSIENT_PROPERTIES = [
  "--canvas-v2-native-x",
  "--canvas-v2-native-y",
  "--canvas-v2-native-delta-x",
  "--canvas-v2-native-delta-y",
  "--canvas-v2-native-width",
  "--canvas-v2-native-height",
  "--canvas-v2-native-rotation",
  "width",
  "height",
  "max-width",
  "max-height",
  "font-size",
  "line-height",
] as const;

interface NativeTransientStyleSnapshot {
  element: HTMLElement;
  transientAttribute: boolean;
  properties: Record<string, { value: string; priority: string }>;
}

interface NativeRemovalPreviewSnapshot {
  element: HTMLElement;
  previewAttribute: boolean;
  visibility: { value: string; priority: string };
}

// Scene z-order is relative object geometry. Keep that entire range above the
// public scene's own interaction plane so a connector at endpointLayer - 1
// remains behind its shapes without becoming unclickable behind the canvas.
const CANVAS_V2_NATIVE_STACK_BASE = 1_000;

function restoreNativeTransientStyle(snapshot: NativeTransientStyleSnapshot): void {
  for (const [property, original] of Object.entries(snapshot.properties)) {
    if (original.value) snapshot.element.style.setProperty(property, original.value, original.priority);
    else snapshot.element.style.removeProperty(property);
  }
  if (snapshot.transientAttribute) snapshot.element.setAttribute("data-canvas-v2-native-transient", "true");
  else snapshot.element.removeAttribute("data-canvas-v2-native-transient");
}

const NativeNode = memo(function NativeNode({
  node,
  byId,
}: {
  node: CanvasV2NativeSceneNode;
  byId: Map<string, CanvasV2NativeSceneNode>;
}) {
  const parent = node.parentId ? byId.get(node.parentId) : undefined;
  if (!canvasV2NativeSceneNodeHasRenderableNamespace(node, parent)) return null;
  const narrowSelectable = node.selectable && node.namespace === "html" && (node.geometry.width <= 6 || node.geometry.height <= 6);
  const hostOwnsBackground = canvasV2NativeSceneNodeUsesHostBackground(node);
  const eagerCanonicalEvidenceImage = node.kind === "image"
    && (node.canonicalEvidence || node.attributes["data-canvas-v2-evidence-role"] === "canonical");
  const safeInlineStyle = normalizeCanvasV2ReactInlineStyle(node.inlineStyle);
  const style = Object.fromEntries(Object.entries(safeInlineStyle).map(([property, value]) => [camelCaseStyle(property), value])) as CSSProperties;
  const runtimeStyle = {
    ...style,
    ...(hostOwnsBackground ? {
      background: "transparent",
      boxShadow: "none",
    } : {}),
    "--canvas-v2-native-x": `${node.geometry.x}px`,
    "--canvas-v2-native-y": `${node.geometry.y}px`,
    "--canvas-v2-native-delta-x": "0px",
    "--canvas-v2-native-delta-y": "0px",
    "--canvas-v2-native-width": `${node.geometry.width}px`,
    "--canvas-v2-native-height": `${node.geometry.height}px`,
    "--canvas-v2-native-rotation": `${node.geometry.rotation}deg`,
    zIndex: CANVAS_V2_NATIVE_STACK_BASE + node.geometry.zIndex,
    ...(node.kind === "image" && !eagerCanonicalEvidenceImage ? {
      contentVisibility: "auto",
      containIntrinsicSize: `${Math.max(1, node.geometry.width)}px ${Math.max(1, node.geometry.height)}px`,
    } : {}),
  } as CSSProperties;
  const content = node.content.map((item, index) => {
    if (item.kind === "text") return item.value;
    const child = byId.get(item.id);
    return child ? <NativeNode key={child.id} node={child} byId={byId} /> : <span key={`missing-${index}`} />;
  });
  const props: Record<string, unknown> = {
    ...reactAttributes(node),
    key: node.id,
    style: runtimeStyle,
    "data-canvas-v2-native-layout": node.layoutMode,
    ...(canvasV2NativeSceneNodeSupportsTextEditing(node, byId) ? { "data-canvas-v2-text-editable": "true" } : {}),
    ...(narrowSelectable ? {
      "data-canvas-v2-narrow-hit-target": node.geometry.width <= 6 ? "vertical" : "horizontal",
    } : {}),
    ...(node.kind === "image" ? {
      draggable: false,
      // Canonical rails are the visible source record, not scroll-driven
      // gallery content. Request every grounded screen immediately so a rail
      // never appears incomplete until the user pans the canvas. Other image
      // objects retain lazy loading for normal workspace performance.
      loading: eagerCanonicalEvidenceImage ? "eager" : node.attributes.loading ?? "lazy",
      // The private render gate has already fetched these canonical assets.
      // Decode them synchronously when the accepted public scene mounts so
      // Chromium cannot present a partially rasterized rail until the next
      // pan, zoom, or composition invalidates its tiles.
      decoding: eagerCanonicalEvidenceImage ? "sync" : node.attributes.decoding ?? "async",
      ...(eagerCanonicalEvidenceImage ? { fetchPriority: "high" } : {}),
    } : {}),
    suppressContentEditableWarning: true,
  };
  if (VOID_TAGS.has(node.tagName)) return createElement(node.tagName, props);
  return createElement(node.tagName, props, ...content);
});

export const CanvasV2NativeCanvasScene = forwardRef<CanvasV2NativeCanvasSceneHandle, CanvasV2NativeCanvasSceneProps>(function CanvasV2NativeCanvasScene({
  revision,
  theme,
  width,
  height,
  framePointerEvents,
  inspectionEnabled,
  selectedNodeId,
  selectedNodeIds,
  onElementHover,
  onElementSelect,
  onSelectionRefresh,
  onSceneSnapshot,
  onNativeScene,
  sceneOverride,
  onElementDoubleClick,
  onElementTextCommit,
  onWorkspaceWheel,
  onWorkspacePointer,
  onElementPointer,
  transientGeometry,
}, imperativeRef) {
  const compilerRef = useRef<HTMLIFrameElement>(null);
  const publicSceneRef = useRef<HTMLDivElement>(null);
  const compileSequenceRef = useRef(0);
  const reconciledSceneRef = useRef<CanvasV2NativeSceneDocument | undefined>(undefined);
  const publicThemeStateRef = useRef(createCanvasV2ArtifactThemeState());
  const transientStyleSnapshotsRef = useRef(new Map<string, NativeTransientStyleSnapshot>());
  const transientConnectorIdsRef = useRef(new Set<string>());
  const transientSceneRef = useRef<CanvasV2NativeSceneDocument | undefined>(undefined);
  const removalPreviewSnapshotsRef = useRef<NativeRemovalPreviewSnapshot[]>([]);
  const [scene, setScene] = useState<CanvasV2NativeSceneDocument>();
  const [compileError, setCompileError] = useState<string>();
  const [compiledRevisionId, setCompiledRevisionId] = useState<string>();
  const activePointerRef = useRef<{ pointerId: number; element?: CanvasV2InspectableElement } | undefined>(undefined);
  const hoveredPointerNodeRef = useRef<string | undefined>(undefined);
  const runtimeDocument = useMemo(() => buildCanvasV2RuntimeDocument(revision), [revision]);
  const renderedScene = sceneOverride ?? scene;
  const byId = useMemo(() => renderedScene ? canvasV2NativeSceneNodeMap(renderedScene) : new Map<string, CanvasV2NativeSceneNode>(), [renderedScene]);
  const bySourceId = useMemo(() => renderedScene ? canvasV2NativeSceneSourceNodeMap(renderedScene) : new Map<string, CanvasV2NativeSceneNode>(), [renderedScene]);

  const compile = useCallback(async () => {
    const sequence = ++compileSequenceRef.current;
    const document = compilerRef.current?.contentDocument;
    if (!document?.body) return;
    if (document.documentElement.dataset.canvasV2RevisionId !== revision.id) return;
    try {
      // Compile durable native truth from authored styles. Light/dark contrast
      // is a reversible public-render concern below; compiling after a theme
      // pass would bake a dark-mode substitute into the next manual edit and
      // destroy the user's original hue when the theme changes.
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (sequence !== compileSequenceRef.current
        || compilerRef.current?.contentDocument !== document
        || document.documentElement.dataset.canvasV2RevisionId !== revision.id) return;
      const next = compileCanvasV2NativeScene({ document, revision, width, height });
      setScene(next);
      setCompileError(undefined);
      // The compiler is a measurement boundary, not a second live canvas.
      // Retire its duplicate 12,000 × 8,000 DOM as soon as native truth exists;
      // the next revision remounts a fresh compiler automatically.
      setCompiledRevisionId(revision.id);
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "The native scene could not be compiled.");
    }
  }, [height, revision, width]);

  useEffect(() => {
    if (compilerRef.current?.contentDocument?.body) void compile();
  }, [compile]);

  useLayoutEffect(() => {
    const root = publicSceneRef.current;
    if (!root || !renderedScene) return;
    applyCanvasV2ArtifactThemeToElement(root, theme, publicThemeStateRef.current);
  }, [renderedScene, theme]);

  const applyTransientGeometry = useCallback((nextTransientGeometry?: Readonly<Record<string, CanvasV2TransientGeometry>>) => {
    const root = publicSceneRef.current;
    if (!root || !renderedScene) return;
    const snapshots = transientStyleSnapshotsRef.current;
    // A committed scene is already the durable geometry that replaces the
    // preview. Never restore pre-gesture inline values over that new truth.
    if (transientSceneRef.current !== renderedScene) {
      snapshots.clear();
      transientSceneRef.current = renderedScene;
    }
    const activeIds = new Set(Object.keys(nextTransientGeometry ?? {}));
    for (const [nodeId, snapshot] of Array.from(snapshots.entries())) {
      if (activeIds.has(nodeId)) continue;
      restoreNativeTransientStyle(snapshot);
      snapshots.delete(nodeId);
    }
    for (const [nodeId, geometry] of Object.entries(nextTransientGeometry ?? {})) {
      const node = bySourceId.get(nodeId);
      if (!node) continue;
      const selectorId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(nodeId) : nodeId.replaceAll('"', '\\"');
      const element = root.querySelector<HTMLElement>(`[data-canvas-v2-node-id="${selectorId}"]`);
      if (!element) continue;
      let snapshot = snapshots.get(nodeId);
      if (!snapshot || snapshot.element !== element) {
        if (snapshot) restoreNativeTransientStyle(snapshot);
        snapshot = {
          element,
          transientAttribute: element.hasAttribute("data-canvas-v2-native-transient"),
          properties: Object.fromEntries(NATIVE_TRANSIENT_PROPERTIES.map((property) => [property, {
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property),
          }])),
        };
        snapshots.set(nodeId, snapshot);
      } else {
        restoreNativeTransientStyle(snapshot);
      }
      element.setAttribute("data-canvas-v2-native-transient", "true");
      if (node.layoutMode === "absolute") {
        element.style.setProperty("--canvas-v2-native-x", `${node.geometry.x + (geometry.deltaX ?? 0)}px`);
        element.style.setProperty("--canvas-v2-native-y", `${node.geometry.y + (geometry.deltaY ?? 0)}px`);
      } else {
        element.style.setProperty("--canvas-v2-native-delta-x", `${geometry.deltaX ?? 0}px`);
        element.style.setProperty("--canvas-v2-native-delta-y", `${geometry.deltaY ?? 0}px`);
      }
      if (geometry.kind === "resize") {
        if (geometry.width !== undefined) {
          element.style.setProperty("--canvas-v2-native-width", `${geometry.width}px`);
          if (node.layoutMode === "flow") {
            element.style.setProperty("width", `${geometry.width}px`, "important");
            element.style.setProperty("max-width", "none", "important");
          }
        }
        if (geometry.height !== undefined) {
          element.style.setProperty("--canvas-v2-native-height", `${geometry.height}px`);
          if (node.layoutMode === "flow") {
            element.style.setProperty("height", `${geometry.height}px`, "important");
            element.style.setProperty("max-height", "none", "important");
          }
        }
        if (geometry.fontSize !== undefined) element.style.setProperty("font-size", `${geometry.fontSize}px`, "important");
        if (geometry.lineHeight !== undefined) element.style.setProperty("line-height", `${geometry.lineHeight}px`, "important");
      }
      if (geometry.kind === "rotate" && geometry.rotation !== undefined) {
        element.style.setProperty("--canvas-v2-native-rotation", `${geometry.rotation}deg`);
      }
    }
    const transientById = nextTransientGeometry ?? {};
    const affectedConnectorIds = new Set<string>();
    for (const connector of renderedScene.nodes) {
      if (connector.kind !== "connector" || !connector.sourceNodeId || transientById[connector.sourceNodeId]) continue;
      const fromId = connector.attributes["data-canvas-v2-connector-from"];
      const toId = connector.attributes["data-canvas-v2-connector-to"];
      if ((fromId && transientById[fromId]) || (toId && transientById[toId])) affectedConnectorIds.add(connector.id);
    }
    const connectorIdsToPaint = new Set([...transientConnectorIdsRef.current, ...affectedConnectorIds]);
    const previewBounds = (target: CanvasV2NativeSceneNode) => {
      const bounds = absoluteGeometry(target, byId);
      const transient = target.sourceNodeId ? transientById[target.sourceNodeId] : undefined;
      return transient ? {
        x: bounds.x + (transient.deltaX ?? 0),
        y: bounds.y + (transient.deltaY ?? 0),
        width: transient.width ?? bounds.width,
        height: transient.height ?? bounds.height,
      } : bounds;
    };
    const numericAttribute = (node: CanvasV2NativeSceneNode, name: string, fallback: number) => {
      const value = Number(node.attributes[name]);
      return Number.isFinite(value) ? value : fallback;
    };
    for (const connectorId of connectorIdsToPaint) {
      const connector = byId.get(connectorId);
      if (!connector?.sourceNodeId) continue;
      const selectorId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(connector.sourceNodeId) : connector.sourceNodeId.replaceAll('"', '\\"');
      const element = root.querySelector<HTMLElement>(`[data-canvas-v2-node-id="${selectorId}"]`);
      if (!element) continue;
      const fromId = connector.attributes["data-canvas-v2-connector-from"];
      const toId = connector.attributes["data-canvas-v2-connector-to"];
      const from = fromId ? bySourceId.get(fromId) : undefined;
      const to = toId ? bySourceId.get(toId) : undefined;
      const freeStart = {
        x: numericAttribute(connector, "data-canvas-v2-connector-from-x", absoluteGeometry(connector, byId).x + 16),
        y: numericAttribute(connector, "data-canvas-v2-connector-from-y", absoluteGeometry(connector, byId).y + connector.geometry.height / 2),
      };
      const freeEnd = {
        x: numericAttribute(connector, "data-canvas-v2-connector-to-x", absoluteGeometry(connector, byId).x + connector.geometry.width - 16),
        y: numericAttribute(connector, "data-canvas-v2-connector-to-y", absoluteGeometry(connector, byId).y + connector.geometry.height / 2),
      };
      const fromBounds = from ? previewBounds(from) : undefined;
      const toBounds = to ? previewBounds(to) : undefined;
      const fromCenter = fromBounds ? { x: fromBounds.x + fromBounds.width / 2, y: fromBounds.y + fromBounds.height / 2 } : freeStart;
      const toCenter = toBounds ? { x: toBounds.x + toBounds.width / 2, y: toBounds.y + toBounds.height / 2 } : freeEnd;
      const start = fromBounds ? canvasV2ConnectorBoundaryAnchor(fromBounds, toCenter) : freeStart;
      const end = toBounds ? canvasV2ConnectorBoundaryAnchor(toBounds, fromCenter) : freeEnd;
      const variantValue = connector.attributes["data-canvas-v2-connector-variant"];
      const variant: CanvasV2ConnectorVariant = variantValue === "straight" || variantValue === "curve" ? variantValue : "arrow";
      const controlX = Number(connector.attributes["data-canvas-v2-connector-control-x"]);
      const controlY = Number(connector.attributes["data-canvas-v2-connector-control-y"]);
      const geometry = buildCanvasV2ConnectorGeometry({
        start,
        end,
        variant,
        bend: numericAttribute(connector, "data-canvas-v2-connector-bend", 72),
        ...(variant === "curve" && Number.isFinite(controlX) && Number.isFinite(controlY) ? { control: { x: controlX, y: controlY } } : {}),
      });
      const parentOrigin = connector.parentId && byId.get(connector.parentId) ? absoluteGeometry(byId.get(connector.parentId)!, byId) : { x: 0, y: 0 };
      element.style.setProperty("--canvas-v2-native-x", `${geometry.bounds.x - parentOrigin.x}px`);
      element.style.setProperty("--canvas-v2-native-y", `${geometry.bounds.y - parentOrigin.y}px`);
      element.style.setProperty("--canvas-v2-native-width", `${geometry.bounds.width}px`);
      element.style.setProperty("--canvas-v2-native-height", `${geometry.bounds.height}px`);
      element.setAttribute("viewBox", `0 0 ${geometry.bounds.width} ${geometry.bounds.height}`);
      const path = element.querySelector<SVGPathElement>('[data-canvas-v2-connector-part="path"]');
      path?.setAttribute("d", geometry.path);
      const hitPath = element.querySelector<SVGPathElement>('[data-canvas-v2-connector-part="hit"]');
      hitPath?.setAttribute("d", geometry.path);
      const startPart = element.querySelector<SVGCircleElement>('[data-canvas-v2-connector-part="start"]');
      startPart?.setAttribute("cx", String(geometry.localStart.x));
      startPart?.setAttribute("cy", String(geometry.localStart.y));
      const endPart = element.querySelector<SVGElement>('[data-canvas-v2-connector-part="end"]');
      if (endPart?.tagName.toLowerCase() === "polyline") endPart.setAttribute("points", geometry.arrowPoints);
      else if (endPart) {
        endPart.setAttribute("cx", String(geometry.localEnd.x));
        endPart.setAttribute("cy", String(geometry.localEnd.y));
      }
    }
    transientConnectorIdsRef.current = affectedConnectorIds;
  }, [byId, bySourceId, renderedScene]);

  const restoreNodeRemovalPreview = useCallback(() => {
    for (const snapshot of removalPreviewSnapshotsRef.current) {
      if (snapshot.visibility.value) snapshot.element.style.setProperty("visibility", snapshot.visibility.value, snapshot.visibility.priority);
      else snapshot.element.style.removeProperty("visibility");
      if (snapshot.previewAttribute) snapshot.element.setAttribute("data-canvas-v2-removal-preview", "true");
      else snapshot.element.removeAttribute("data-canvas-v2-removal-preview");
    }
    removalPreviewSnapshotsRef.current = [];
  }, []);

  const previewNodeRemoval = useCallback((nodeIds: readonly string[]) => {
    restoreNodeRemovalPreview();
    const root = publicSceneRef.current;
    if (!root) return;
    const snapshots: NativeRemovalPreviewSnapshot[] = [];
    const seen = new Set<HTMLElement>();
    for (const nodeId of new Set(nodeIds)) {
      const selectorId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(nodeId) : nodeId.replaceAll('"', '\\"');
      for (const element of root.querySelectorAll<HTMLElement>(`[data-canvas-v2-node-id="${selectorId}"]`)) {
        if (seen.has(element)) continue;
        seen.add(element);
        snapshots.push({
          element,
          previewAttribute: element.hasAttribute("data-canvas-v2-removal-preview"),
          visibility: {
            value: element.style.getPropertyValue("visibility"),
            priority: element.style.getPropertyPriority("visibility"),
          },
        });
        // Deletion is an immediate visual transaction. Keep the DOM node only
        // long enough for the durable scene/history commit to replace it; it
        // must stop painting and receiving pointer input in this input task.
        element.setAttribute("data-canvas-v2-removal-preview", "true");
        element.style.setProperty("visibility", "hidden", "important");
      }
    }
    removalPreviewSnapshotsRef.current = snapshots;
  }, [restoreNodeRemovalPreview]);

  const commitNodeRemovalPreview = useCallback(() => {
    // The accepted native scene removes these nodes. Dropping the snapshots
    // without restoring their styles prevents a flash of the retired DOM while
    // React commits that scene immediately after this event handler returns.
    removalPreviewSnapshotsRef.current = [];
  }, []);

  useImperativeHandle(imperativeRef, () => ({
    applyTransientGeometry,
    previewNodeRemoval,
    restoreNodeRemovalPreview,
    commitNodeRemovalPreview,
  }), [applyTransientGeometry, commitNodeRemovalPreview, previewNodeRemoval, restoreNodeRemovalPreview]);

  useLayoutEffect(() => {
    applyTransientGeometry(transientGeometry);
  }, [applyTransientGeometry, transientGeometry]);

  useEffect(() => () => {
    for (const snapshot of transientStyleSnapshotsRef.current.values()) restoreNativeTransientStyle(snapshot);
    transientStyleSnapshotsRef.current.clear();
    transientConnectorIdsRef.current.clear();
    restoreNodeRemovalPreview();
  }, [restoreNodeRemovalPreview]);

  useLayoutEffect(() => {
    if (!renderedScene || reconciledSceneRef.current === renderedScene) return;
    const root = publicSceneRef.current;
    const reconciled = root ? reconcilePublicSceneGeometry(renderedScene, root) : renderedScene;
    reconciledSceneRef.current = reconciled;
    // A committed override is already native truth for absolute objects, but
    // its still-flowing text and layout children were first measured in the
    // isolated compiler. Reconcile those children against the public canvas
    // as well. This is what preserves the exact stretched/wrapped box when a
    // person later detaches a heading or label. Absolute user geometry is
    // deliberately ignored by reconcilePublicSceneGeometry, so a verifier
    // can never rewrite a completed drag or resize.
    if (!sceneOverride && reconciled !== scene) setScene(reconciled);
    onNativeScene?.(reconciled);
  }, [onNativeScene, renderedScene, scene, sceneOverride]);

  const targetNode = useCallback((target: EventTarget | null) => {
    let element = target && typeof (target as Element).closest === "function"
      ? (target as Element).closest<HTMLElement>("[data-canvas-v2-node-id]")
      : null;
    while (element) {
      const sourceNodeId = element.dataset.canvasV2NodeId;
      const node = sourceNodeId ? bySourceId.get(sourceNodeId) : undefined;
      if (node?.selectable) return { node, element };
      element = element.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]") ?? null;
    }
    return undefined;
  }, [bySourceId]);

  const inspectHoverTarget = useCallback((target: EventTarget | null) => {
    const targetResult = targetNode(target);
    const nodeId = targetResult?.node.sourceNodeId ?? targetResult?.node.id;
    if (hoveredPointerNodeRef.current === nodeId) return;
    hoveredPointerNodeRef.current = nodeId;
    onElementHover?.(targetResult ? inspectNativeNode(targetResult.node, byId, targetResult.element) : undefined);
  }, [byId, onElementHover, targetNode]);

  useEffect(() => {
    hoveredPointerNodeRef.current = undefined;
    if (!inspectionEnabled) onElementHover?.(undefined);
  }, [inspectionEnabled, onElementHover, renderedScene]);

  const allInspectable = useCallback(() => {
    if (!renderedScene) return [];
    const elementsBySourceId = new Map(Array.from(publicSceneRef.current?.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]") ?? [])
      .flatMap((element) => element.dataset.canvasV2NodeId ? [[element.dataset.canvasV2NodeId, element] as const] : []));
    return renderedScene.nodes.flatMap((node) => {
      if (!node.selectable || !node.sourceNodeId) return [];
      return [inspectNativeNode(node, byId, elementsBySourceId.get(node.sourceNodeId))];
    });
  }, [byId, renderedScene]);

  useEffect(() => {
    if (!renderedScene) return;
    onSceneSnapshot?.(allInspectable());
  }, [allInspectable, onSceneSnapshot, renderedScene]);

  useEffect(() => {
    if (!renderedScene || !onSelectionRefresh) return;
    const ids = selectedNodeIds?.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    if (!ids.length) return;
    onSelectionRefresh(ids.flatMap((id) => {
      const node = bySourceId.get(id);
      if (!node) return [];
      const selector = `[data-canvas-v2-node-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replaceAll('"', '\\"')}"]`;
      const element = publicSceneRef.current?.querySelector(selector);
      return [inspectNativeNode(node, byId, element)];
    }));
  }, [byId, bySourceId, onSelectionRefresh, renderedScene, selectedNodeId, selectedNodeIds]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const targetResult = inspectionEnabled ? targetNode(event.target) : undefined;
    const inspected = targetResult ? inspectNativeNode(targetResult.node, byId, targetResult.element) : undefined;
    activePointerRef.current = { pointerId: event.pointerId, ...(inspected ? { element: inspected } : {}) };
    // Text objects need the browser's compatibility click sequence so a
    // physical double-click can produce click/dblclick after object selection.
    // The scene already disables ordinary text selection until edit mode, so
    // preserving the default here does not leak a browser-native selection.
    if (inspected && event.button === 0 && !inspected.textEditable) event.preventDefault();
    // Do not capture the pointer on the scene root. Retargeting pointer-up to
    // the root also retargets the browser's click/double-click sequence, which
    // prevents the authored text leaf from entering inline edit mode. The
    // workspace's window-level gesture listeners already own drag completion
    // when the pointer leaves the scene.
    if (inspected && event.button === 0 && onElementPointer) {
      onElementPointer({ phase: "down", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey, element: inspected });
    } else {
      onWorkspacePointer?.({ phase: "down", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey });
    }
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (inspectionEnabled && !activePointerRef.current) inspectHoverTarget(event.target);
    const active = activePointerRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.element && onElementPointer) onElementPointer({ phase: "move", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey, element: active.element });
    else onWorkspacePointer?.({ phase: "move", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey });
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = activePointerRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activePointerRef.current = undefined;
    if (active.element && onElementPointer) onElementPointer({ phase: "up", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey, element: active.element });
    else onWorkspacePointer?.({ phase: "up", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey });
  };

  const beginTextEditing = (
    targetResult: { node: CanvasV2NativeSceneNode; element: HTMLElement },
    inspected: CanvasV2InspectableElement,
    clientX: number,
    clientY: number,
  ) => {
    if (!inspected.textEditable || inspected.locked || targetResult.element.dataset.canvasV2DirectEditing === "true") return;
    onElementSelect?.(inspected, { additive: false, range: false, directEdit: true });
    onElementDoubleClick?.(inspected);
    const editable = targetResult.element;
    const original = editable.textContent ?? "";
    const originalAriaLabel = editable.getAttribute("aria-label");
    const originalOutline = editable.style.getPropertyValue("outline");
    const originalOutlinePriority = editable.style.getPropertyPriority("outline");
    const originalUserSelect = editable.style.getPropertyValue("user-select");
    const originalUserSelectPriority = editable.style.getPropertyPriority("user-select");
    const originalCursor = editable.style.getPropertyValue("cursor");
    const originalCursorPriority = editable.style.getPropertyPriority("cursor");
    let cancelled = false;
    const finish = () => {
      editable.removeEventListener("blur", finish);
      editable.removeEventListener("keydown", keydown);
      editable.removeAttribute("contenteditable");
      editable.removeAttribute("data-canvas-v2-direct-editing");
      editable.removeAttribute("role");
      if (originalOutline) editable.style.setProperty("outline", originalOutline, originalOutlinePriority);
      else editable.style.removeProperty("outline");
      if (originalUserSelect) editable.style.setProperty("user-select", originalUserSelect, originalUserSelectPriority);
      else editable.style.removeProperty("user-select");
      if (originalCursor) editable.style.setProperty("cursor", originalCursor, originalCursorPriority);
      else editable.style.removeProperty("cursor");
      if (originalAriaLabel === null) editable.removeAttribute("aria-label");
      else editable.setAttribute("aria-label", originalAriaLabel);
      if (cancelled) editable.textContent = original;
      else if ((editable.textContent ?? "") !== original) {
        // Empty writable surfaces keep their authored width and grow only
        // when the human's copy genuinely needs more vertical room. The text
        // and this geometry adjustment are one mutation/history entry.
        const layout = inspected.writable
          ? { height: Math.max(inspected.bounds.height, Math.ceil(editable.scrollHeight)) }
          : undefined;
        onElementTextCommit?.(inspected, editable.textContent ?? "", canvasV2NativeTextContent(editable), layout);
      }
      // Leaving text-edit mode returns to object selection, matching the rest
      // of the canvas and making the next duplicate/move/style command apply
      // to the object the user just edited.
      onElementSelect?.(inspected, { additive: false, range: false, directEdit: false });
    };
    const keydown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        keyboardEvent.preventDefault();
        cancelled = true;
        editable.blur();
      } else if (keyboardEvent.key === "Enter" && (keyboardEvent.metaKey || keyboardEvent.ctrlKey)) {
        keyboardEvent.preventDefault();
        editable.blur();
      }
    };
    editable.contentEditable = "plaintext-only";
    editable.dataset.canvasV2DirectEditing = "true";
    editable.setAttribute("role", "textbox");
    editable.setAttribute("aria-label", `Edit ${inspected.nodeId} on canvas`);
    editable.style.setProperty("outline", "none", "important");
    editable.style.setProperty("user-select", "text", "important");
    editable.style.setProperty("cursor", "text", "important");
    editable.addEventListener("blur", finish, { once: true });
    editable.addEventListener("keydown", keydown);
    editable.focus({ preventScroll: true });
    placeCanvasV2CaretAtPoint(editable, clientX, clientY);
  };

  const doubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!inspectionEnabled) return;
    const targetResult = targetNode(event.target);
    const inspected = targetResult ? inspectNativeNode(targetResult.node, byId, targetResult.element) : undefined;
    if (!inspected?.textEditable || inspected.locked || !targetResult) return;
    event.preventDefault();
    event.stopPropagation();
    beginTextEditing(targetResult, inspected, event.clientX, event.clientY);
  };

  const repeatedClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!inspectionEnabled || event.button !== 0 || event.detail < 2) return;
    const targetResult = targetNode(event.target);
    let inspected = targetResult ? inspectNativeNode(targetResult.node, byId, targetResult.element) : undefined;
    let editableTarget = targetResult;

    // Selection can reconcile a newly materialized text fragment between the
    // first and second click. The browser still reports click detail 2, but
    // its event target may now be the fragment's structural parent. Resolve
    // the selected native identity at the same point so editing never depends
    // on React retaining one particular DOM instance across the click pair.
    if (!inspected?.textEditable) {
      const selectedId = selectedNodeIds?.at(-1) ?? selectedNodeId;
      const selectedNode = selectedId ? bySourceId.get(selectedId) : undefined;
      const selector = selectedId
        ? `[data-canvas-v2-node-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedId) : selectedId.replaceAll('"', '\\"')}"]`
        : undefined;
      const selectedElement = selector ? publicSceneRef.current?.querySelector<HTMLElement>(selector) : undefined;
      if (selectedNode?.selectable && selectedElement) {
        const bounds = selectedElement.getBoundingClientRect();
        if (event.clientX >= bounds.left && event.clientX <= bounds.right
          && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
          editableTarget = { node: selectedNode, element: selectedElement };
          inspected = inspectNativeNode(selectedNode, byId, selectedElement);
        }
      }
    }
    if (!editableTarget || !inspected?.textEditable || inspected.locked) return;
    event.preventDefault();
    event.stopPropagation();
    beginTextEditing(editableTarget, inspected, event.clientX, event.clientY);
  };

  const wheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!onWorkspaceWheel) return;
    event.preventDefault();
    onWorkspaceWheel({ clientX: event.clientX, clientY: event.clientY, deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
  };

  const nativeLayoutGuard = `
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-native-runtime-node="true"] {
      cursor:inherit!important;
    }
    [data-canvas-v2-native-scene="true"] > [data-canvas-v2-native-runtime-node="true"][data-canvas-v2-design-region]:not([data-canvas-v2-surface-treatment="earned-card"]) {
      background:transparent!important;
      box-shadow:none!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-native-runtime-node="true"][data-canvas-v2-native-layout="absolute"] {
      box-sizing:border-box!important;
      position:absolute!important;
      left:var(--canvas-v2-native-x)!important;
      top:var(--canvas-v2-native-y)!important;
      width:var(--canvas-v2-native-width)!important;
      height:var(--canvas-v2-native-height)!important;
      min-width:0!important;
      min-height:0!important;
      max-width:none!important;
      max-height:none!important;
      margin:0!important;
      transform:none!important;
      translate:none!important;
      rotate:var(--canvas-v2-native-rotation)!important;
      transform-origin:center!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-native-runtime-node="true"][hidden] { display:none!important; }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-writable="true"] {
      white-space:pre-wrap!important;
      overflow-wrap:anywhere!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-writable="true"]:not([data-canvas-v2-locked="true"]) {
      cursor:text!important;
    }
    [data-canvas-v2-native-scene="true"] img[data-canvas-v2-native-runtime-node="true"] {
      -webkit-user-drag:none!important;
      user-select:none!important;
    }
    /* A grounded witness is one native image object, not a stage-width box
       containing a narrower raster. Older accepted revisions can still carry
       both authored dimensions; normalize only untouched flow witnesses here
       so their selector, hit target, and visible screenshot share one honest
       intrinsic-ratio footprint. A human resize remains authoritative. */
    [data-canvas-v2-native-scene="true"] img[data-canvas-v2-native-runtime-node="true"][data-canvas-v2-native-layout="flow"][data-canvas-v2-evidence-role="analysis-copy"]:not([data-canvas-v2-user-edited]) {
      width:auto!important;
      height:auto!important;
      inline-size:auto!important;
      block-size:auto!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-native-runtime-node="true"][data-canvas-v2-native-layout="flow"] {
      translate:var(--canvas-v2-native-delta-x) var(--canvas-v2-native-delta-y)!important;
      rotate:var(--canvas-v2-native-rotation)!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-primitive="connector"] {
      overflow:visible!important;
      pointer-events:auto!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-primitive="connector"] [data-canvas-v2-connector-part="path"] {
      pointer-events:none!important;
      transition:filter 140ms ease,opacity 140ms ease;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-primitive="connector"] [data-canvas-v2-connector-part="hit"] {
      cursor:pointer!important;
      pointer-events:stroke!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-primitive="connector"]:hover [data-canvas-v2-connector-part="path"] {
      filter:drop-shadow(0 0 4px rgba(103,84,222,.32));
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-narrow-hit-target]::after {
      content:"";
      position:absolute;
      z-index:2;
      background:transparent;
      pointer-events:auto;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-narrow-hit-target="vertical"]::after { inset:-10px -9px; }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-narrow-hit-target="horizontal"]::after { inset:-9px -10px; }
  `;

  const publicSceneCss = useMemo(
    () => scopeCanvasV2ArtifactCss(renderedScene?.css ?? revision.document.css),
    [renderedScene?.css, revision.document.css],
  );

  return (
    <div className="relative" style={{ width, height, pointerEvents: framePointerEvents }}>
      {compiledRevisionId !== revision.id && <iframe
        ref={compilerRef}
        title={`Canvas V2 ${revision.state} native scene compiler`}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="canvas-v2-native-compiler"
        sandbox="allow-same-origin"
        srcDoc={runtimeDocument}
        onLoad={() => void compile()}
        className="pointer-events-none fixed border-0 opacity-0"
        style={{ left: -100_000, top: -100_000, width, height }}
      />}
      <div
        ref={publicSceneRef}
        data-testid="canvas-v2-native-scene"
        data-canvas-v2-native-scene="true"
        data-revision-id={revision.id}
        className="relative overflow-visible bg-transparent"
        style={{
          width,
          height,
          pointerEvents: framePointerEvents,
          userSelect: "none",
          // Runtime nodes use an internal positive stack offset so authored
          // negative layers remain hit-testable. Contain that offset here;
          // otherwise a connector at z=999 can paint above the workspace's
          // z=50 endpoint controls and turn an endpoint drag into a whole-line
          // move. Canvas chrome must always sit above authored object layers.
          isolation: "isolate",
          colorScheme: theme,
          "--northstar-ink": theme === "dark" ? "#f4f3f8" : "#151620",
          "--northstar-muted": theme === "dark" ? "#c7c3cf" : "#737686",
          "--northstar-violet": theme === "dark" ? "#9d8cff" : "#6b4dff",
          "--northstar-line": theme === "dark" ? "rgba(255,255,255,.12)" : "rgba(78,67,135,.14)",
          "--northstar-surface": theme === "dark" ? "#1b1a22" : "#ffffff",
          "--northstar-surface-subtle": theme === "dark" ? "#23212b" : "#f6f5fa",
          "--northstar-note-surface": theme === "dark" ? "#3a3218" : "#fff2a8",
          "--northstar-note-ink": theme === "dark" ? "#fff0b8" : "#332e1e",
          "--northstar-note-line": theme === "dark" ? "#8f7a31" : "#d8bd51",
          "--northstar-note-shadow": theme === "dark" ? "rgba(0,0,0,.28)" : "rgba(71,59,10,.12)",
        } as CSSProperties}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerLeave={() => {
          hoveredPointerNodeRef.current = undefined;
          onElementHover?.(undefined);
        }}
        onClickCapture={repeatedClick}
        // Capture before an authored descendant, browser word-selection, or
        // freshly mounted selection chrome can consume the second click. The
        // public native scene—not arbitrary model HTML—owns entry into edit
        // mode, so every editable AI text leaf follows one deterministic path.
        onDoubleClickCapture={doubleClick}
        onWheel={wheel}
        onKeyDown={(event) => {
          if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "a" || (event.target as HTMLElement).closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
          event.preventDefault();
          onSelectionRefresh?.(allInspectable());
        }}
      >
        <style data-canvas-v2-artifact-styles="scoped">{publicSceneCss}</style>
        <style>{nativeLayoutGuard}</style>
        {renderedScene?.rootIds.map((rootId) => {
          const node = byId.get(rootId);
          return node ? <NativeNode key={node.id} node={node} byId={byId} /> : null;
        })}
      </div>
      {compileError && <div role="alert" className="absolute left-6 top-6 rounded-lg bg-red-950 px-4 py-3 text-sm text-white">Native scene compilation failed: {compileError}</div>}
    </div>
  );
});
