"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  applyCanvasV2ArtifactTheme,
  applyCanvasV2ArtifactThemeToElement,
  createCanvasV2ArtifactThemeState,
  type CanvasV2ArtifactTheme,
} from "@/lib/canvas-v2/artifact-theme";
import { buildCanvasV2RuntimeDocument } from "@/lib/canvas-v2/runtime-document";
import {
  canvasV2NativeSceneNodeMap,
  canvasV2NativeSceneSourceNodeMap,
  compileCanvasV2NativeScene,
  type CanvasV2NativeSceneDocument,
  type CanvasV2NativeSceneNode,
} from "@/lib/canvas-v2/native-scene";
import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import type {
  CanvasV2InspectableElement,
  CanvasV2SelectionIntent,
} from "@/lib/canvas-v2/element-inspection";
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
  onElementTextCommit?: (element: CanvasV2InspectableElement, text: string) => void;
  onWorkspaceWheel?: (event: { clientX: number; clientY: number; deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean }) => void;
  onWorkspacePointer?: (event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean }) => void;
  onElementPointer?: (event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean; element: CanvasV2InspectableElement }) => void;
  transientGeometry?: Readonly<Record<string, CanvasV2TransientGeometry>>;
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
  return {
    nodeId: node.sourceNodeId ?? node.id,
    parentNodeId: node.parentId ? byId.get(node.parentId)?.sourceNodeId : undefined,
    tagName: node.tagName,
    kind: node.kind,
    label: node.attributes["aria-label"],
    textPreview: element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || node.directText?.trim().slice(0, 120) || undefined,
    textEditable: node.kind === "text" && node.childIds.length === 0,
    locked: node.locked,
    hidden: node.hidden,
    userEdited: node.userEdited,
    editVersion: node.editVersion,
    rotation: node.geometry.rotation,
    canonicalEvidence: node.canonicalEvidence,
    altText: node.kind === "image" ? node.attributes.alt ?? "" : undefined,
    visualStyle: {
      color: computed?.color ?? "",
      backgroundColor: computed?.backgroundColor ?? "",
      borderColor: computed?.borderColor ?? "",
      borderRadius: computed?.borderRadius ?? "",
      fontFamily: computed?.fontFamily ?? "",
      fontSize: computed?.fontSize ?? "",
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

function NativeNode({
  node,
  byId,
  transientGeometry,
}: {
  node: CanvasV2NativeSceneNode;
  byId: Map<string, CanvasV2NativeSceneNode>;
  transientGeometry?: Readonly<Record<string, CanvasV2TransientGeometry>>;
}) {
  const transient = node.sourceNodeId ? transientGeometry?.[node.sourceNodeId] : undefined;
  const style = Object.fromEntries(Object.entries(node.inlineStyle).map(([property, value]) => [camelCaseStyle(property), value])) as CSSProperties;
  const runtimeStyle = {
    ...style,
    "--canvas-v2-native-x": `${node.geometry.x + (node.layoutMode === "absolute" ? transient?.deltaX ?? 0 : 0)}px`,
    "--canvas-v2-native-y": `${node.geometry.y + (node.layoutMode === "absolute" ? transient?.deltaY ?? 0 : 0)}px`,
    "--canvas-v2-native-delta-x": `${transient?.deltaX ?? 0}px`,
    "--canvas-v2-native-delta-y": `${transient?.deltaY ?? 0}px`,
    "--canvas-v2-native-width": `${transient?.width ?? node.geometry.width}px`,
    "--canvas-v2-native-height": `${transient?.height ?? node.geometry.height}px`,
    "--canvas-v2-native-rotation": `${transient?.rotation ?? node.geometry.rotation}deg`,
    ...(node.layoutMode === "flow" && transient?.width !== undefined ? { width: `${transient.width}px`, maxWidth: "none" } : {}),
    ...(node.layoutMode === "flow" && transient?.height !== undefined ? { height: `${transient.height}px`, maxHeight: "none" } : {}),
    ...(transient?.fontSize !== undefined ? { fontSize: `${transient.fontSize}px` } : {}),
  } as CSSProperties;
  const content = node.content.map((item, index) => {
    if (item.kind === "text") return item.value;
    const child = byId.get(item.id);
    return child ? <NativeNode key={child.id} node={child} byId={byId} transientGeometry={transientGeometry} /> : <span key={`missing-${index}`} />;
  });
  const props: Record<string, unknown> = {
    ...reactAttributes(node),
    key: node.id,
    style: runtimeStyle,
    "data-canvas-v2-native-layout": node.layoutMode,
    ...(transient ? { "data-canvas-v2-native-transient": "true" } : {}),
    ...(node.kind === "image" ? { draggable: false } : {}),
    suppressContentEditableWarning: true,
  };
  if (VOID_TAGS.has(node.tagName)) return createElement(node.tagName, props);
  return createElement(node.tagName, props, ...content);
}

export function CanvasV2NativeCanvasScene({
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
}: CanvasV2NativeCanvasSceneProps) {
  const compilerRef = useRef<HTMLIFrameElement>(null);
  const publicSceneRef = useRef<HTMLDivElement>(null);
  const compileSequenceRef = useRef(0);
  const reconciledSceneRef = useRef<CanvasV2NativeSceneDocument | undefined>(undefined);
  const themeStateRef = useRef(createCanvasV2ArtifactThemeState());
  const publicThemeStateRef = useRef(createCanvasV2ArtifactThemeState());
  const [scene, setScene] = useState<CanvasV2NativeSceneDocument>();
  const [compileError, setCompileError] = useState<string>();
  const activePointerRef = useRef<{ pointerId: number; element?: CanvasV2InspectableElement } | undefined>(undefined);
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
      themeStateRef.current = createCanvasV2ArtifactThemeState();
      applyCanvasV2ArtifactTheme(document, theme, themeStateRef.current);
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (sequence !== compileSequenceRef.current
        || compilerRef.current?.contentDocument !== document
        || document.documentElement.dataset.canvasV2RevisionId !== revision.id) return;
      const next = compileCanvasV2NativeScene({ document, revision, width, height });
      setScene(next);
      setCompileError(undefined);
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "The native scene could not be compiled.");
    }
  }, [height, onNativeScene, revision, theme, width]);

  useEffect(() => {
    if (compilerRef.current?.contentDocument?.body) void compile();
  }, [compile]);

  useLayoutEffect(() => {
    const root = publicSceneRef.current;
    if (!root || !renderedScene) return;
    applyCanvasV2ArtifactThemeToElement(root, theme, publicThemeStateRef.current);
  }, [renderedScene, theme]);

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
    const element = target && typeof (target as Element).closest === "function"
      ? (target as Element).closest<HTMLElement>("[data-canvas-v2-node-id]")
      : null;
    const sourceNodeId = element?.dataset.canvasV2NodeId;
    const node = sourceNodeId ? bySourceId.get(sourceNodeId) : undefined;
    return node?.selectable ? { node, element: element! } : undefined;
  }, [bySourceId]);

  const inspectTarget = useCallback((target: EventTarget | null) => {
    const targetResult = targetNode(target);
    return targetResult ? inspectNativeNode(targetResult.node, byId, targetResult.element) : undefined;
  }, [byId, targetNode]);

  const allInspectable = useCallback(() => renderedScene?.nodes.flatMap((node) => {
    if (!node.selectable || !node.sourceNodeId) return [];
    const selector = `[data-canvas-v2-node-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(node.sourceNodeId) : node.sourceNodeId.replaceAll('"', '\\"')}"]`;
    const element = compilerRef.current?.parentElement?.querySelector(selector);
    return [inspectNativeNode(node, byId, element)];
  }) ?? [], [byId, renderedScene]);

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
      const element = compilerRef.current?.parentElement?.querySelector(selector);
      return [inspectNativeNode(node, byId, element)];
    }));
  }, [byId, bySourceId, onSelectionRefresh, renderedScene, selectedNodeId, selectedNodeIds]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const inspected = inspectionEnabled ? inspectTarget(event.target) : undefined;
    activePointerRef.current = { pointerId: event.pointerId, ...(inspected ? { element: inspected } : {}) };
    if (inspected && event.button === 0) event.preventDefault();
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
    if (inspectionEnabled && !activePointerRef.current) onElementHover?.(inspectTarget(event.target));
    const active = activePointerRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.element && onElementPointer) onElementPointer({ phase: "move", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, element: active.element });
    else onWorkspacePointer?.({ phase: "move", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button });
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = activePointerRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activePointerRef.current = undefined;
    if (active.element && onElementPointer) onElementPointer({ phase: "up", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, element: active.element });
    else onWorkspacePointer?.({ phase: "up", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button });
  };

  const doubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!inspectionEnabled) return;
    const inspected = inspectTarget(event.target);
    const target = event.target as HTMLElement;
    if (!inspected?.textEditable || inspected.locked || !target.closest("[data-canvas-v2-node-id]")) return;
    event.preventDefault();
    event.stopPropagation();
    onElementSelect?.(inspected, { additive: false, range: false, directEdit: true });
    onElementDoubleClick?.(inspected);
    const editable = target.closest<HTMLElement>("[data-canvas-v2-node-id]")!;
    const original = editable.textContent ?? "";
    const originalAriaLabel = editable.getAttribute("aria-label");
    let cancelled = false;
    const finish = () => {
      editable.removeEventListener("blur", finish);
      editable.removeEventListener("keydown", keydown);
      editable.removeAttribute("contenteditable");
      editable.removeAttribute("data-canvas-v2-direct-editing");
      editable.removeAttribute("role");
      if (originalAriaLabel === null) editable.removeAttribute("aria-label");
      else editable.setAttribute("aria-label", originalAriaLabel);
      if (cancelled) editable.textContent = original;
      else if ((editable.textContent ?? "") !== original) onElementTextCommit?.(inspected, editable.textContent ?? "");
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
    editable.addEventListener("blur", finish, { once: true });
    editable.addEventListener("keydown", keydown);
    editable.focus({ preventScroll: true });
  };

  const wheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!onWorkspaceWheel) return;
    event.preventDefault();
    onWorkspaceWheel({ clientX: event.clientX, clientY: event.clientY, deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
  };

  const nativeLayoutGuard = `
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
    [data-canvas-v2-native-scene="true"] img[data-canvas-v2-native-runtime-node="true"] {
      -webkit-user-drag:none!important;
      user-select:none!important;
    }
    [data-canvas-v2-native-scene="true"] [data-canvas-v2-native-runtime-node="true"][data-canvas-v2-native-layout="flow"] {
      translate:var(--canvas-v2-native-delta-x) var(--canvas-v2-native-delta-y)!important;
      rotate:var(--canvas-v2-native-rotation)!important;
    }
  `;

  return (
    <div className="relative" style={{ width, height, pointerEvents: framePointerEvents }}>
      <iframe
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
      />
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
          colorScheme: theme,
          "--northstar-ink": theme === "dark" ? "#f4f3f8" : "#151620",
          "--northstar-muted": theme === "dark" ? "#c7c3cf" : "#737686",
          "--northstar-violet": theme === "dark" ? "#9d8cff" : "#6b4dff",
          "--northstar-line": theme === "dark" ? "rgba(255,255,255,.12)" : "rgba(78,67,135,.14)",
          "--northstar-surface": theme === "dark" ? "#1b1a22" : "#ffffff",
          "--northstar-surface-subtle": theme === "dark" ? "#23212b" : "#f6f5fa",
        } as CSSProperties}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerLeave={() => onElementHover?.(undefined)}
        onDoubleClick={doubleClick}
        onWheel={wheel}
        onKeyDown={(event) => {
          if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "a" || (event.target as HTMLElement).closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
          event.preventDefault();
          onSelectionRefresh?.(allInspectable());
        }}
      >
        <style>{renderedScene?.css ?? revision.document.css}</style>
        <style>{nativeLayoutGuard}</style>
        {renderedScene?.rootIds.map((rootId) => {
          const node = byId.get(rootId);
          return node ? <NativeNode key={node.id} node={node} byId={byId} transientGeometry={transientGeometry} /> : null;
        })}
      </div>
      {compileError && <div role="alert" className="absolute left-6 top-6 rounded-lg bg-red-950 px-4 py-3 text-sm text-white">Native scene compilation failed: {compileError}</div>}
    </div>
  );
}
