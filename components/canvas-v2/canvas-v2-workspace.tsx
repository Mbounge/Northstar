"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AppWindow,
  Bold,
  ChevronDown,
  Copy,
  EyeOff,
  FileText,
  Hand,
  Group,
  Image as ImageIcon,
  Italic,
  Layers3,
  Lock,
  Maximize2,
  MessageSquare,
  Minus,
  Moon,
  MousePointer2,
  Palette,
  Plus,
  Shapes,
  Square,
  Table2,
  Trash2,
  Type,
  Undo2,
  Redo2,
  RotateCw,
  Settings2,
  Ungroup,
  Unlock,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";

import { CanvasV2CanvasScene, type CanvasV2TransientGeometry } from "@/components/canvas-v2/canvas-scene";
import { CanvasV2ChatPanel } from "@/components/canvas-v2/canvas-v2-chat-panel";
import { CanvasV2ResearchPanel } from "@/components/canvas-v2/canvas-v2-research-panel";
import { useCanvasV2Chat } from "@/components/canvas-v2/use-canvas-v2-chat";
import { useCanvasV2DesignLoop } from "@/components/canvas-v2/use-canvas-v2-design-loop";
import { useTheme } from "@/components/theme-provider";
import { insertCanvasV2EvidenceAsset } from "@/lib/canvas-v2/evidence-insertion";
import { insertCanvasV2CanonicalFlow } from "@/lib/canvas-v2/flow-insertion";
import type { AppDataApp, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";
import type { CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";
import { CANVAS_V2_MIN_CANVAS, type CanvasV2CanvasGeometry } from "@/lib/canvas-v2/canvas-geometry";
import type { CanvasV2InspectableElement, CanvasV2SelectionIntent } from "@/lib/canvas-v2/element-inspection";
import { readCanvasV2BoardObjectGraph } from "@/lib/canvas-v2/board-object-graph";
import {
  applyCanvasV2ManualMutation,
  describeCanvasV2ManualMutation,
  type CanvasV2ManualMutation,
  type CanvasV2EditableStyleProperty,
} from "@/lib/canvas-v2/manual-mutations";
import {
  applyCanvasV2NativeSceneMutation,
  canvasV2NativeSceneSelectionContainsTarget,
  serializeCanvasV2NativeScene,
  type CanvasV2NativeSceneDocument,
} from "@/lib/canvas-v2/native-scene";
import {
  canvasV2BoundsIntersect,
  canvasV2RotationFromPointer,
  scaleCanvasV2FontSize,
  scaleCanvasV2ObjectBounds,
  snapCanvasV2ObjectDelta,
  translateCanvasV2ObjectBounds,
  unionCanvasV2ObjectBounds,
  type CanvasV2SnapGuide,
} from "@/lib/canvas-v2/object-interaction";
import { discardObsoleteCanvasV2LocalState } from "@/lib/canvas-v2/session-lifecycle";
import {
  CANVAS_V2_WORKSPACE,
  CANVAS_V2_EMPTY_INSETS,
  canvasV2FrameableSceneBounds,
  centeredCanvasV2WorkspaceOrigin,
  clampCanvasV2WorkspaceScale,
  constrainCanvasV2WorkspaceViewport,
  fitCanvasV2WorkspaceBounds,
  resizeCanvasV2WorkspaceBounds,
  translateCanvasV2WorkspaceBounds,
  type CanvasV2ResizeHandle,
  type CanvasV2WorkspaceInsets,
  type CanvasV2WorkspaceViewport,
} from "@/lib/canvas-v2/workspace-coordinate-space";

type Panel = "chat" | "shapes" | "apps";
type CanvasTool = "select" | "pan";

interface DirectGesture {
  kind: "move" | "resize" | "rotate";
  handle?: CanvasV2ResizeHandle;
  pointerId: number;
  startX: number;
  startY: number;
  original: CanvasV2InspectableElement["bounds"];
  originals: CanvasV2InspectableElement[];
  startRotation?: number;
  draftBounds: CanvasV2InspectableElement["bounds"];
  draftElementBounds: Record<string, CanvasV2InspectableElement["bounds"]>;
  draftRotations: Record<string, number>;
  clickSelection?: CanvasV2InspectableElement[];
}

interface MarqueeGesture {
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  screenStart: { x: number; y: number };
  screenCurrent: { x: number; y: number };
  additive: boolean;
}

function sameInspectableElements(
  current: readonly CanvasV2InspectableElement[],
  next: readonly CanvasV2InspectableElement[],
): boolean {
  if (current.length !== next.length) return false;
  return current.every((item, index) => {
    const candidate = next[index];
    return candidate?.nodeId === item.nodeId
      && candidate.parentNodeId === item.parentNodeId
      && candidate.hidden === item.hidden
      && candidate.locked === item.locked
      && candidate.rotation === item.rotation
      && candidate.textPreview === item.textPreview
      && candidate.altText === item.altText
      && candidate.visualStyle?.color === item.visualStyle?.color
      && candidate.visualStyle?.backgroundColor === item.visualStyle?.backgroundColor
      && candidate.visualStyle?.borderColor === item.visualStyle?.borderColor
      && candidate.visualStyle?.fontFamily === item.visualStyle?.fontFamily
      && candidate.visualStyle?.fontSize === item.visualStyle?.fontSize
      && candidate.visualStyle?.fontWeight === item.visualStyle?.fontWeight
      && candidate.visualStyle?.fontStyle === item.visualStyle?.fontStyle
      && candidate.visualStyle?.textAlign === item.visualStyle?.textAlign
      && candidate.visualStyle?.objectFit === item.visualStyle?.objectFit
      && candidate.bounds.x === item.bounds.x
      && candidate.bounds.y === item.bounds.y
      && candidate.bounds.width === item.bounds.width
      && candidate.bounds.height === item.bounds.height;
  });
}

function eligibleCanvasSelection(elements: readonly CanvasV2InspectableElement[]): CanvasV2InspectableElement[] {
  return elements.filter((element) => {
    const { x, y, width, height } = element.bounds;
    return element.nodeId !== "canvas"
      && element.kind !== "root"
      && !element.hidden
      && Number.isFinite(x)
      && Number.isFinite(y)
      && Number.isFinite(width)
      && Number.isFinite(height)
      && width > 0
      && height > 0
      && canvasV2BoundsIntersect(element.bounds, {
        x: 0,
        y: 0,
        width: CANVAS_V2_WORKSPACE.width,
        height: CANVAS_V2_WORKSPACE.height,
      });
  });
}

function individualMarqueeSelection(
  hits: readonly CanvasV2InspectableElement[],
  scene: readonly CanvasV2InspectableElement[],
): CanvasV2InspectableElement[] {
  const candidates = eligibleCanvasSelection(hits);
  const parentIds = new Set(scene.flatMap((element) => element.parentNodeId ? [element.parentNodeId] : []));
  // A marquee is precision selection: it targets painted leaf objects only.
  // Semantic containers remain useful click targets, but their large group or
  // island bounds must never swallow every child touched by a drag rectangle.
  return candidates.filter((element) => !parentIds.has(element.nodeId));
}

function synchronizeSelectionWithNativeScene(
  current: readonly CanvasV2InspectableElement[],
  scene: CanvasV2NativeSceneDocument,
): CanvasV2InspectableElement[] {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const bySourceId = new Map(scene.nodes.flatMap((node) => node.sourceNodeId ? [[node.sourceNodeId, node] as const] : []));
  const absoluteBounds = (nodeId: string) => {
    const node = byId.get(nodeId);
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
    return { x, y, width: node.geometry.width, height: node.geometry.height };
  };
  return current.flatMap((item) => {
    const node = bySourceId.get(item.nodeId);
    const bounds = node ? absoluteBounds(node.id) : undefined;
    if (!node || !bounds) return [];
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const visualStyle = item.visualStyle ? {
      ...item.visualStyle,
      color: node.inlineStyle.color ?? item.visualStyle.color,
      backgroundColor: node.inlineStyle["background-color"] ?? node.inlineStyle.background ?? item.visualStyle.backgroundColor,
      borderColor: node.inlineStyle["border-color"] ?? item.visualStyle.borderColor,
      borderRadius: node.inlineStyle["border-radius"] ?? item.visualStyle.borderRadius,
      fontFamily: node.inlineStyle["font-family"] ?? item.visualStyle.fontFamily,
      fontSize: node.inlineStyle["font-size"] ?? item.visualStyle.fontSize,
      fontWeight: node.inlineStyle["font-weight"] ?? item.visualStyle.fontWeight,
      fontStyle: node.inlineStyle["font-style"] ?? item.visualStyle.fontStyle,
      textAlign: node.inlineStyle["text-align"] ?? item.visualStyle.textAlign,
      textDecoration: node.inlineStyle["text-decoration"] ?? item.visualStyle.textDecoration,
      opacity: node.inlineStyle.opacity ?? item.visualStyle.opacity,
      objectFit: node.inlineStyle["object-fit"] ?? item.visualStyle.objectFit,
    } : undefined;
    return [{
      ...item,
      parentNodeId: parent?.sourceNodeId,
      bounds,
      rotation: node.geometry.rotation,
      hidden: node.hidden,
      locked: node.locked,
      userEdited: node.userEdited,
      editVersion: node.editVersion,
      canonicalEvidence: node.canonicalEvidence,
      textPreview: node.directText?.replace(/\s+/g, " ").trim().slice(0, 120) || item.textPreview,
      altText: node.kind === "image" ? node.attributes.alt ?? "" : item.altText,
      ...(visualStyle ? { visualStyle } : {}),
    }];
  });
}

const RESIZE_HANDLES: ReadonlyArray<{
  handle: CanvasV2ResizeHandle;
  className: string;
  cursor: string;
}> = [
  { handle: "north-west", className: "-left-2 -top-2", cursor: "cursor-nwse-resize" },
  { handle: "north", className: "left-1/2 -top-2 -translate-x-1/2", cursor: "cursor-ns-resize" },
  { handle: "north-east", className: "-right-2 -top-2", cursor: "cursor-nesw-resize" },
  { handle: "east", className: "-right-2 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  { handle: "south-east", className: "-bottom-2 -right-2", cursor: "cursor-nwse-resize" },
  { handle: "south", className: "-bottom-2 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
  { handle: "south-west", className: "-bottom-2 -left-2", cursor: "cursor-nesw-resize" },
  { handle: "west", className: "-left-2 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
];

const ROTATE_CORNERS = [
  { corner: "north-west", className: "-left-9 -top-9", iconClassName: "left-0 top-0" },
  { corner: "north-east", className: "-right-9 -top-9", iconClassName: "right-0 top-0" },
  { corner: "south-east", className: "-bottom-9 -right-9", iconClassName: "bottom-0 right-0" },
  { corner: "south-west", className: "-bottom-9 -left-9", iconClassName: "bottom-0 left-0" },
] as const;

const TOOL_ITEMS = [
  { label: "Frame", icon: Square, primitive: "frame" as const },
  { label: "Text", icon: Type, primitive: "text" as const },
  { label: "Shape", icon: FileText, primitive: "shape" as const },
  { label: "Table", icon: Table2, primitive: "table" as const },
];

const CANVAS_COLOR_SWATCHES = [
  { label: "North Star ink", value: "var(--northstar-ink)", preview: "#181824" },
  { label: "North Star surface", value: "var(--northstar-surface)", preview: "#ffffff" },
  { label: "North Star violet", value: "var(--northstar-violet)", preview: "#6d59ed" },
  { label: "Slate", value: "#6b7280", preview: "#6b7280" },
  { label: "Red", value: "#ef4444", preview: "#ef4444" },
  { label: "Orange", value: "#f97316", preview: "#f97316" },
  { label: "Amber", value: "#f59e0b", preview: "#f59e0b" },
  { label: "Green", value: "#22c55e", preview: "#22c55e" },
  { label: "Teal", value: "#14b8a6", preview: "#14b8a6" },
  { label: "Blue", value: "#3b82f6", preview: "#3b82f6" },
  { label: "Violet", value: "#7c3aed", preview: "#7c3aed" },
  { label: "Pink", value: "#ec4899", preview: "#ec4899" },
] as const;

const TEXT_STYLE_OPTIONS = [
  { label: "Simple", value: "Inter,ui-sans-serif,system-ui,sans-serif" },
  { label: "Bookish", value: "Georgia,serif" },
  { label: "Technical", value: "ui-monospace,SFMono-Regular,monospace" },
] as const;

const TEXT_SIZE_OPTIONS = [12, 16, 20, 24, 28, 32, 40, 48, 64, 80] as const;

export function CanvasV2Workspace({
  designEndpoint = "/api/canvas-v2/design",
  researchEndpoint = "/api/canvas-v2/research",
  routerEndpoint = "/api/canvas-v2/route",
}: {
  designEndpoint?: string;
  researchEndpoint?: string;
  routerEndpoint?: string;
} = {}) {
  useEffect(() => {
    try {
      discardObsoleteCanvasV2LocalState(window.localStorage);
    } catch {
      // The clean in-memory session must not depend on browser storage access.
    }
  }, []);

  const engine = useCanvasV2DesignLoop(designEndpoint);
  const { theme, toggleTheme } = useTheme();
  const [panel, setPanel] = useState<Panel>("chat");
  const [chatOpen, setChatOpen] = useState(true);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [hoveredElement, setHoveredElement] = useState<CanvasV2InspectableElement>();
  const [selectedElements, setSelectedElements] = useState<CanvasV2InspectableElement[]>([]);
  const selectedElement = selectedElements[selectedElements.length - 1];
  // Conversation and run lifecycle belong to the workspace, not to the
  // collapsible presentation panel. Closing the panel or visiting Apps must
  // never discard a routing request, transcript, selected model, or the turn
  // that is following the active design loop.
  const chat = useCanvasV2Chat({
    endpoint: routerEndpoint,
    engine,
    selection: selectedElement,
    selections: selectedElements,
  });
  const [selectionTarget, setSelectionTarget] = useState<string>();
  const [draftBounds, setDraftBounds] = useState<CanvasV2InspectableElement["bounds"]>();
  const [draftElementBounds, setDraftElementBounds] = useState<Record<string, CanvasV2InspectableElement["bounds"]>>({});
  const [draftRotations, setDraftRotations] = useState<Record<string, number>>({});
  const [snapGuides, setSnapGuides] = useState<CanvasV2SnapGuide[]>([]);
  const [sceneElements, setSceneElements] = useState<CanvasV2InspectableElement[]>([]);
  const [marquee, setMarquee] = useState<MarqueeGesture>();
  const [mutationError, setMutationError] = useState<string>();
  const [layersOpen, setLayersOpen] = useState(false);
  const [toolbarMenu, setToolbarMenu] = useState<"color" | "font" | "size" | "image" | "more">();
  const [colorProperty, setColorProperty] = useState<CanvasV2EditableStyleProperty>("background-color");
  const [customColorDraft, setCustomColorDraft] = useState("#6d59ed");
  const [altTextDraft, setAltTextDraft] = useState("");
  const [toolbarSize, setToolbarSize] = useState({ width: 420, height: 58 });
  // The finite canvas begins at the viewport origin. The previous bootstrap
  // used a legacy artboard-style offset ({ x: 450, y: 72 }) which was outside
  // the legal camera range at 24%. Until the first zoom normalized that
  // invalid state, canvas coordinate (0, 0) appeared as a phantom inner edge
  // and objects could not be dragged into the visibly available top/left
  // space. Start with a valid camera so insertion, dragging, and zoom all
  // share one coordinate system from the first painted frame.
  const [viewport, setViewport] = useState<CanvasV2WorkspaceViewport>({ x: 0, y: 0, scale: 0.24 });
  const viewportRef = useRef(viewport);
  const [spacePan, setSpacePan] = useState(false);
  const [canvasGeometry, setCanvasGeometry] = useState<CanvasV2CanvasGeometry>(CANVAS_V2_MIN_CANVAS);
  const workspaceRef = useRef<HTMLElement>(null);
  const canvasMenuRef = useRef<HTMLDivElement>(null);
  const statusPillRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLElement>(null);
  const contextualToolbarRef = useRef<HTMLElement>(null);
  const geometryRef = useRef(canvasGeometry);
  const panRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | undefined>(undefined);
  const directGestureRef = useRef<DirectGesture | undefined>(undefined);
  const marqueeRef = useRef<MarqueeGesture | undefined>(undefined);
  const sceneElementsRef = useRef<CanvasV2InspectableElement[]>([]);
  const internalClipboardRef = useRef<string[]>([]);
  const commitViewport = useCallback((update: CanvasV2WorkspaceViewport | ((current: CanvasV2WorkspaceViewport) => CanvasV2WorkspaceViewport)) => {
    setViewport((current) => {
      const next = typeof update === "function" ? update(current) : update;
      // Pointer messages can arrive between React's state update and its next
      // effect. Keep the imperative camera authority in lockstep so the first
      // gesture after pan/zoom never uses stale geometry.
      viewportRef.current = next;
      return next;
    });
  }, []);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    // `overflow:hidden` still creates a programmatically scrollable element.
    // Chromium will silently scroll that element when an iframe descendant is
    // focused, splitting the browser's scroll offset from North Star's camera
    // transform. The visible result is a phantom rectangle, clipped objects,
    // and selections whose nodes appear to have disappeared. The canvas owns
    // every translation, so native host scrolling is never valid.
    const restoreCanvasAuthority = () => {
      if (workspace.scrollLeft !== 0) workspace.scrollLeft = 0;
      if (workspace.scrollTop !== 0) workspace.scrollTop = 0;
    };
    restoreCanvasAuthority();
    workspace.addEventListener("scroll", restoreCanvasAuthority, { passive: true });
    return () => workspace.removeEventListener("scroll", restoreCanvasAuthority);
  }, []);
  const selectElement = useCallback((element?: CanvasV2InspectableElement, intent?: CanvasV2SelectionIntent) => {
    // The source document keeps a permanent compatibility root for revision
    // and observation bookkeeping, but that identity is not a canvas object.
    // A stale layer click or hot-refresh must never turn it into a selectable,
    // translucent rectangle.
    if (element?.nodeId === "canvas" || element?.kind === "root") element = undefined;
    setSelectedElements((current) => {
      if (!element) return [];
      if (!intent?.additive) return [element];
      return current.some((item) => item.nodeId === element.nodeId)
        ? current.filter((item) => item.nodeId !== element.nodeId)
        : [...current, element];
    });
    setSelectionTarget(element?.nodeId);
    setDraftBounds(undefined);
    setDraftElementBounds({});
    setSnapGuides([]);
    setToolbarMenu(undefined);
    setAltTextDraft(element?.altText ?? "");
    setMutationError(undefined);
  }, []);
  const selectCanvasElement = useCallback((element?: CanvasV2InspectableElement, intent?: CanvasV2SelectionIntent) => {
    setLayersOpen(false);
    selectElement(element, intent);
  }, [selectElement]);
  const refreshSelection = useCallback((elements: CanvasV2InspectableElement[]) => {
    // The native compiler already exposes only real selectable objects.
    // Do not promote refreshed leaf selections back to semantic containers.
    elements = eligibleCanvasSelection(elements);
    setSelectedElements((current) => sameInspectableElements(current, elements) ? current : elements);
    const primary = elements[elements.length - 1];
    if (primary?.kind === "image") setAltTextDraft(primary.altText ?? "");
  }, []);
  const hoverElement = useCallback((element?: CanvasV2InspectableElement) => setHoveredElement(element), []);

  // Fast refresh can preserve selection state created by an older build. The
  // compatibility source root is never an object in Patch 8, so enforce that
  // truth at the state boundary as well as at every pointer/layer entry point.
  useEffect(() => {
    if (selectedElements.some((element) => element.nodeId === "canvas" || element.kind === "root")) {
      setSelectedElements((current) => current.filter((element) => element.nodeId !== "canvas" && element.kind !== "root"));
    }
    if (selectionTarget === "canvas") setSelectionTarget(undefined);
  }, [selectedElements, selectionTarget]);
  const cameraSize = useCallback(() => {
    const workspace = workspaceRef.current;
    return { width: workspace?.clientWidth ?? 1, height: workspace?.clientHeight ?? 1 };
  }, []);

  const workspacePoint = useCallback((clientX: number, clientY: number) => {
    const rect = workspaceRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const current = viewportRef.current;
    return { x: (clientX - rect.left - current.x) / current.scale, y: (clientY - rect.top - current.y) / current.scale };
  }, []);

  const contentInsets = useCallback((): CanvasV2WorkspaceInsets => {
    const workspace = workspaceRef.current?.getBoundingClientRect();
    if (!workspace) return { left: chatOpen ? 430 : 32, top: 116, right: 32, bottom: 92 };
    const chat = chatOpen ? chatPanelRef.current?.getBoundingClientRect() : undefined;
    const menu = canvasMenuRef.current?.getBoundingClientRect();
    const status = statusPillRef.current?.getBoundingClientRect();
    const breathingRoom = 24;
    return {
      // The top menu and status pill share one shallow exclusion band; treating
      // them as full-height left and right columns made wide evidence rails fit
      // into a fictitious sliver and collapse to 4%. Only the open chat panel
      // owns a vertical column.
      left: chat ? Math.max(32, chat.right - workspace.left + breathingRoom) : 32,
      top: Math.max(
        32,
        (menu?.bottom ?? workspace.top) - workspace.top + breathingRoom,
        (status?.bottom ?? workspace.top) - workspace.top + breathingRoom,
      ),
      right: 32,
      bottom: 92,
    };
  }, [chatOpen]);

  // The camera belongs exclusively to the person using the board. North Star
  // publishes honest world-space geometry to the right of the floating panel;
  // accepting a revision never pans or zooms the viewport. Explicit Fit,
  // wheel, pan, and zoom controls are the only camera writers.
  const claimCameraForUser = useCallback(() => {}, []);

  const receiveScene = useCallback((elements: CanvasV2InspectableElement[]) => {
    sceneElementsRef.current = elements;
    setSceneElements((current) => sameInspectableElements(current, elements) ? current : elements);
  }, []);

  const constrainViewport = useCallback((candidate: CanvasV2WorkspaceViewport) => {
    const constrained = constrainCanvasV2WorkspaceViewport(candidate, cameraSize(), CANVAS_V2_EMPTY_INSETS);
    const current = viewportRef.current;
    const continuousAxis = (value: number, currentValue: number, constrainedValue: number) => {
      // AI focus may temporarily place an honest canvas edge inside a chrome
      // inset. Manual navigation must continue from that visible coordinate,
      // but it may only move the camera back toward the ordinary finite-board
      // range—not farther into synthetic overscroll.
      if (currentValue > constrainedValue && value >= constrainedValue) return Math.min(currentValue, value);
      if (currentValue < constrainedValue && value <= constrainedValue) return Math.max(currentValue, value);
      return constrainedValue;
    };
    return {
      ...constrained,
      x: continuousAxis(candidate.x, current.x, constrained.x),
      y: continuousAxis(candidate.y, current.y, constrained.y),
    };
  }, [cameraSize]);

  const zoomViewportAtPoint = useCallback((
    current: CanvasV2WorkspaceViewport,
    nextScale: number,
    anchor: { x: number; y: number },
  ) => {
    const currentScale = clampCanvasV2WorkspaceScale(current.scale);
    const workspaceAnchor = {
      x: (anchor.x - current.x) / currentScale,
      y: (anchor.y - current.y) / currentScale,
    };
    const scale = clampCanvasV2WorkspaceScale(nextScale);
    return constrainViewport({
      scale,
      x: anchor.x - workspaceAnchor.x * scale,
      y: anchor.y - workspaceAnchor.y * scale,
    });
  }, [constrainViewport]);

  const fitContent = useCallback((geometry = geometryRef.current) => {
    claimCameraForUser();
    const authoredBounds = canvasV2FrameableSceneBounds(sceneElementsRef.current);
    commitViewport(fitCanvasV2WorkspaceBounds(
      authoredBounds ?? { x: 0, y: 0, width: geometry.width, height: geometry.height },
      cameraSize(),
      contentInsets(),
      authoredBounds ? 96 : 48,
    ));
  }, [cameraSize, claimCameraForUser, commitViewport, contentInsets]);

  const fitWorkspace = useCallback(() => {
    claimCameraForUser();
    commitViewport(fitCanvasV2WorkspaceBounds(
      { x: 0, y: 0, width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height },
      cameraSize(),
      contentInsets(),
      36,
    ));
  }, [cameraSize, claimCameraForUser, commitViewport, contentInsets]);

  const receiveGeometry = useCallback((geometry: CanvasV2CanvasGeometry) => {
    geometryRef.current = geometry;
    setCanvasGeometry(geometry);
    // Geometry is observation metadata, not a second camera authority. Earlier
    // builds fitted this legacy document rectangle after the scene snapshot,
    // overwriting the AI-safe frame and causing visible zoom jumps, edge-clung
    // work, and occasional partially painted Chromium layers.
  }, []);

  const zoomAtCenter = (delta: number) => {
    claimCameraForUser();
    const camera = cameraSize();
    const insets = contentInsets();
    const anchor = {
      x: insets.left + (camera.width - insets.left - insets.right) / 2,
      y: insets.top + (camera.height - insets.top - insets.bottom) / 2,
    };
    commitViewport((current) => zoomViewportAtPoint(current, current.scale + delta, anchor));
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    claimCameraForUser();
    const target = event.target as HTMLElement;
    const panning = tool === "pan" || spacePan || event.button === 1;
    if (!panning) {
      if (tool === "select" && target.closest("[data-canvas-v2-workspace-content]")) return;
      if (tool === "select") {
        const point = workspacePoint(event.clientX, event.clientY);
        const screen = { x: event.clientX, y: event.clientY };
        const gesture = { pointerId: event.pointerId, start: point, current: point, screenStart: screen, screenCurrent: screen, additive: event.shiftKey || event.metaKey };
        event.currentTarget.setPointerCapture(event.pointerId);
        marqueeRef.current = gesture;
        setMarquee(gesture);
        if (!gesture.additive) selectElement(undefined);
      }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y };
  };

  const forwardedWorkspacePointer = useCallback((event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean }) => {
    if (event.phase === "down") claimCameraForUser();
    // Pointer move events report `button === -1` in Chromium even while the
    // primary button remains held. Once a select gesture owns the pointer,
    // route the complete sequence through marquee handling by pointer id.
    const activeMarquee = marqueeRef.current?.pointerId === event.pointerId;
    if (tool === "select" && (event.button === 0 || activeMarquee)) {
      const point = workspacePoint(event.clientX, event.clientY);
      if (event.phase === "down") {
        const screen = { x: event.clientX, y: event.clientY };
        const gesture = { pointerId: event.pointerId, start: point, current: point, screenStart: screen, screenCurrent: screen, additive: Boolean(event.shiftKey || event.metaKey) };
        marqueeRef.current = gesture;
        setMarquee(gesture);
        if (!gesture.additive) selectElement(undefined);
      } else if (marqueeRef.current?.pointerId === event.pointerId && event.phase === "move") {
        const next = { ...marqueeRef.current, current: point, screenCurrent: { x: event.clientX, y: event.clientY } };
        marqueeRef.current = next;
        setMarquee(next);
      } else if (marqueeRef.current?.pointerId === event.pointerId && event.phase === "up") {
        finishMarquee(marqueeRef.current);
      }
      return;
    }
    if (event.phase === "down") {
      const current = viewportRef.current;
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: current.x, originY: current.y };
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.phase === "up") {
      panRef.current = undefined;
      return;
    }
    commitViewport((current) => constrainViewport({ ...current, x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y }));
  }, [claimCameraForUser, commitViewport, constrainViewport, selectElement, tool, workspacePoint]);

  const finishMarquee = (gesture: MarqueeGesture) => {
    const bounds = {
      x: Math.min(gesture.start.x, gesture.current.x),
      y: Math.min(gesture.start.y, gesture.current.y),
      width: Math.abs(gesture.current.x - gesture.start.x),
      height: Math.abs(gesture.current.y - gesture.start.y),
    };
    const hits = bounds.width < 3 && bounds.height < 3
      ? []
      : sceneElementsRef.current.filter((item) => item.nodeId !== "canvas" && canvasV2BoundsIntersect(bounds, item.bounds));
    const preciseHits = individualMarqueeSelection(hits, sceneElementsRef.current);
    setSelectedElements((current) => gesture.additive
      ? [...current.filter((item) => !preciseHits.some((hit) => hit.nodeId === item.nodeId)), ...preciseHits]
      : preciseHits);
    setSelectionTarget(preciseHits.at(-1)?.nodeId);
    marqueeRef.current = undefined;
    setMarquee(undefined);
    workspaceRef.current?.focus({ preventScroll: true });
  };

  const updateDirectGesture = (pointerId: number, clientX: number, clientY: number) => {
    const directGesture = directGestureRef.current;
    if (directGesture?.pointerId === pointerId) {
      const currentViewport = viewportRef.current;
      const deltaX = (clientX - directGesture.startX) / currentViewport.scale;
      const deltaY = (clientY - directGesture.startY) / currentViewport.scale;
      if (directGesture.kind === "rotate") {
        const pointer = workspacePoint(clientX, clientY);
        const center = { x: directGesture.original.x + directGesture.original.width / 2, y: directGesture.original.y + directGesture.original.height / 2 };
        const nextRotation = canvasV2RotationFromPointer(center, pointer);
        // Keep the gesture continuous when the pointer crosses the -180/180
        // seam instead of making the selection spin almost a full turn.
        const rotationDelta = ((nextRotation - (directGesture.startRotation ?? nextRotation) + 540) % 360) - 180;
        const radians = rotationDelta * Math.PI / 180;
        const rotations = Object.fromEntries(directGesture.originals.map((item) => [item.nodeId, (item.rotation ?? 0) + rotationDelta]));
        const nextElements = Object.fromEntries(directGesture.originals.map((item) => {
          const itemCenter = { x: item.bounds.x + item.bounds.width / 2, y: item.bounds.y + item.bounds.height / 2 };
          const offsetX = itemCenter.x - center.x;
          const offsetY = itemCenter.y - center.y;
          const rotatedCenter = {
            x: center.x + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
            y: center.y + offsetX * Math.sin(radians) + offsetY * Math.cos(radians),
          };
          return [item.nodeId, {
            ...item.bounds,
            x: rotatedCenter.x - item.bounds.width / 2,
            y: rotatedCenter.y - item.bounds.height / 2,
          }];
        }));
        directGesture.draftRotations = rotations;
        directGesture.draftElementBounds = nextElements;
        setDraftRotations(rotations);
        setDraftElementBounds(nextElements);
        setDraftBounds(unionCanvasV2ObjectBounds(Object.values(nextElements)) ?? directGesture.original);
        return true;
      }
      if (directGesture.kind === "move") {
        const selectedIds = new Set(directGesture.originals.map((item) => item.nodeId));
        const snapped = snapCanvasV2ObjectDelta({ moving: directGesture.original, deltaX, deltaY, others: sceneElementsRef.current.filter((item) => item.nodeId !== "canvas" && !selectedIds.has(item.nodeId)).map((item) => item.bounds), threshold: 8 / currentViewport.scale });
        // A gesture translates the selection as one rigid set and the finite
        // canvas owns the final coordinates. The previous unbounded helper
        // allowed negative x/y values, so objects progressively clipped at an
        // old-looking edge, disappeared, and remained selected off-canvas.
        const next = translateCanvasV2WorkspaceBounds(directGesture.original, {
          x: snapped.deltaX,
          y: snapped.deltaY,
        });
        const boundedDeltaX = next.x - directGesture.original.x;
        const boundedDeltaY = next.y - directGesture.original.y;
        const nextElements = Object.fromEntries(directGesture.originals.map((item) => [
          item.nodeId,
          translateCanvasV2ObjectBounds(item.bounds, boundedDeltaX, boundedDeltaY),
        ]));
        directGesture.draftBounds = next;
        directGesture.draftElementBounds = nextElements;
        setDraftBounds(next);
        setDraftElementBounds(nextElements);
        setSnapGuides(snapped.guides);
        return true;
      }
      const relativeMinimum = {
        width: Math.max(1, Math.min(24, directGesture.original.width * 0.1)),
        height: Math.max(1, Math.min(24, directGesture.original.height * 0.1)),
      };
      const relativeDelta = {
        x: deltaX * Math.max(0.05, Math.min(1, directGesture.original.width / 24)),
        y: deltaY * Math.max(0.05, Math.min(1, directGesture.original.height / 24)),
      };
      const next = resizeCanvasV2WorkspaceBounds(directGesture.original, directGesture.handle ?? "south-east", relativeDelta, relativeMinimum);
      const nextElements = Object.fromEntries(directGesture.originals.map((item) => [item.nodeId, scaleCanvasV2ObjectBounds(item.bounds, directGesture.original, next)]));
      directGesture.draftBounds = next;
      directGesture.draftElementBounds = nextElements;
      setDraftBounds(next);
      setDraftElementBounds(nextElements);
      return true;
    }
    return false;
  };

  const finishDirectGesture = (pointerId: number) => {
    const directGesture = directGestureRef.current;
    if (directGesture?.pointerId !== pointerId) return false;
    directGestureRef.current = undefined;
    if (directGesture.kind === "rotate") {
      const mutations = directGesture.originals.flatMap((item) => {
        const rotation = directGesture.draftRotations[item.nodeId];
        const next = directGesture.draftElementBounds[item.nodeId];
        if (rotation === undefined || !next) return [];
        const deltaX = next.x - item.bounds.x;
        const deltaY = next.y - item.bounds.y;
        return [
          ...(Math.abs(deltaX) >= 0.01 || Math.abs(deltaY) >= 0.01
            ? [{ kind: "move" as const, nodeId: item.nodeId, deltaX, deltaY }]
            : []),
          ...(Math.abs(rotation - (item.rotation ?? 0)) >= 0.01
            ? [{ kind: "rotate" as const, nodeId: item.nodeId, rotation }]
            : []),
        ];
      });
      if (mutations.length) {
        if (!submitMutation({ kind: "batch", label: `Rotated ${directGesture.originals.length} selected object${directGesture.originals.length === 1 ? "" : "s"}.`, mutations })) {
          setDraftRotations({});
          setDraftBounds(undefined);
          setDraftElementBounds({});
        } else {
          // Native truth and the source revision commit in this same pointer-up
          // event. Leaving the transient transform mounted for one more render
          // would apply it twice and cause the release-frame jump users saw.
          setDraftRotations({});
          setDraftBounds(undefined);
          setDraftElementBounds({});
        }
      } else {
        setDraftRotations({});
        setDraftBounds(undefined);
        setDraftElementBounds({});
      }
      return true;
    }
    const finalBounds = directGesture.draftBounds;
    const moved = Math.abs(finalBounds.x - directGesture.original.x) >= 0.01
      || Math.abs(finalBounds.y - directGesture.original.y) >= 0.01;
    const resized = Math.abs(finalBounds.width - directGesture.original.width) >= 0.01
      || Math.abs(finalBounds.height - directGesture.original.height) >= 0.01;
    setSnapGuides([]);
    // A pointer down/up with no geometric change is selection, not authorship.
    if (!moved && !resized) {
      if (directGesture.clickSelection) {
        setSelectedElements(directGesture.clickSelection);
        setSelectionTarget(directGesture.clickSelection.at(-1)?.nodeId);
      }
      setDraftBounds(undefined);
      setDraftElementBounds({});
      return true;
    }
    const mutations = directGesture.originals.map((item) => {
      const next = directGesture.draftElementBounds[item.nodeId] ?? item.bounds;
      return directGesture.kind === "move"
        ? { kind: "move" as const, nodeId: item.nodeId, deltaX: next.x - item.bounds.x, deltaY: next.y - item.bounds.y }
        : {
            kind: "transform" as const,
            nodeId: item.nodeId,
            deltaX: next.x - item.bounds.x,
            deltaY: next.y - item.bounds.y,
            width: next.width,
            height: next.height,
            ...(item.textEditable && item.visualStyle?.fontSize
              ? { fontSize: scaleCanvasV2FontSize(Number.parseFloat(item.visualStyle.fontSize), directGesture.original, directGesture.draftBounds) }
              : {}),
          };
    });
    if (!submitMutation({ kind: "batch", label: `${directGesture.kind === "move" ? "Moved" : "Resized"} ${mutations.length} selected object${mutations.length === 1 ? "" : "s"}.`, mutations })) {
      setDraftBounds(undefined);
      setDraftElementBounds({});
    } else {
      // Commit replaces the live transient values atomically. Clearing both in
      // the same event prevents a doubled transform or one-frame old scene.
      setDraftBounds(undefined);
      setDraftElementBounds({});
    }
    return true;
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (updateDirectGesture(event.pointerId, event.clientX, event.clientY)) return;
    const marqueeGesture = marqueeRef.current;
    if (marqueeGesture?.pointerId === event.pointerId) {
      const next = { ...marqueeGesture, current: workspacePoint(event.clientX, event.clientY), screenCurrent: { x: event.clientX, y: event.clientY } };
      marqueeRef.current = next;
      setMarquee(next);
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    commitViewport(constrainViewport({ ...viewport, x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y }));
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishDirectGesture(event.pointerId)) return;
    if (marqueeRef.current?.pointerId === event.pointerId) {
      finishMarquee(marqueeRef.current);
      return;
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = undefined;
  };

  useEffect(() => {
    // Authored objects live inside a same-origin iframe while North Star's
    // floating chrome lives in the parent document. A drag that crosses under
    // the menu, chat panel, status pill, or bottom toolbar therefore leaves the
    // iframe. Keep the gesture owned by the workspace until its terminal
    // pointer event so those overlays never become invisible canvas edges.
    const move = (event: PointerEvent) => {
      if (!directGestureRef.current || directGestureRef.current.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateDirectGesture(event.pointerId, event.clientX, event.clientY);
    };
    const finish = (event: PointerEvent) => {
      if (!directGestureRef.current || directGestureRef.current.pointerId !== event.pointerId) return;
      event.preventDefault();
      finishDirectGesture(event.pointerId);
      workspaceRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, { capture: true, passive: false });
    window.addEventListener("pointercancel", finish, { capture: true, passive: false });
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
  });

  const startDirectGesture = (kind: DirectGesture["kind"], pointerId: number, clientX: number, clientY: number, elements: CanvasV2InspectableElement[], handle?: CanvasV2ResizeHandle, clickSelection?: CanvasV2InspectableElement[]) => {
    const mutable = elements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    const selectionBounds = unionCanvasV2ObjectBounds(mutable.map((item) => item.bounds));
    if (!mutable.length || !selectionBounds || engine.running || engine.applyingManualEdit) return false;
    const elementBounds = Object.fromEntries(mutable.map((item) => [item.nodeId, item.bounds]));
    const pointer = workspacePoint(clientX, clientY);
    const center = { x: selectionBounds.x + selectionBounds.width / 2, y: selectionBounds.y + selectionBounds.height / 2 };
    directGestureRef.current = { kind, handle, pointerId, startX: clientX, startY: clientY, original: selectionBounds, originals: mutable, startRotation: kind === "rotate" ? canvasV2RotationFromPointer(center, pointer) : undefined, draftBounds: selectionBounds, draftElementBounds: elementBounds, draftRotations: {}, clickSelection };
    setDraftBounds(selectionBounds);
    setDraftElementBounds(elementBounds);
    return true;
  };

  const beginDirectGesture = (kind: DirectGesture["kind"], event: ReactPointerEvent<HTMLElement>, handle?: CanvasV2ResizeHandle) => {
    claimCameraForUser();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startDirectGesture(kind, event.pointerId, event.clientX, event.clientY, selectedElements, handle);
  };

  const forwardedElementPointer = (event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean; element: CanvasV2InspectableElement }) => {
    if (event.phase === "move") {
      updateDirectGesture(event.pointerId, event.clientX, event.clientY);
      return;
    }
    if (event.phase === "up") {
      finishDirectGesture(event.pointerId);
      // The iframe receives the browser's terminal click/focus after the
      // pointer-down handler. Reclaim keyboard ownership at the end of the
      // gesture as well so an immediately-following arrow/duplicate/delete
      // command always belongs to the selected canvas objects.
      workspaceRef.current?.focus({ preventScroll: true });
      return;
    }
    claimCameraForUser();
    if (tool !== "select" || event.button !== 0) return;
    setLayersOpen(false);
    const additive = Boolean(event.shiftKey || event.metaKey);
    const selectedNodeIds = selectedElements.map((item) => item.nodeId);
    const currentNativeScene = engine.readNativeScene();
    const selectionOwnsTarget = !additive && (
      Boolean(event.element.parentNodeId && selectedNodeIds.includes(event.element.parentNodeId))
      || canvasV2NativeSceneSelectionContainsTarget(currentNativeScene, selectedNodeIds, event.element.nodeId)
    );
    const alreadySelected = selectedElements.some((item) => item.nodeId === event.element.nodeId);
    const nextSelection = selectionOwnsTarget
      ? selectedElements
      : additive
      ? alreadySelected ? selectedElements : [...selectedElements, event.element]
      : alreadySelected && selectedElements.length > 1 ? selectedElements : [event.element];
    const clickSelection = selectionOwnsTarget
      ? selectedElements
      : additive
      ? alreadySelected ? selectedElements.filter((item) => item.nodeId !== event.element.nodeId) : nextSelection
      : [event.element];
    const interactionElement = selectionOwnsTarget ? selectedElements.at(-1) : event.element;
    setSelectedElements(nextSelection);
    setSelectionTarget(interactionElement?.nodeId);
    setDraftBounds(undefined);
    setDraftElementBounds({});
    setSnapGuides([]);
    setToolbarMenu(undefined);
    setAltTextDraft(interactionElement?.altText ?? "");
    setMutationError(undefined);
    startDirectGesture("move", event.pointerId, event.clientX, event.clientY, nextSelection, undefined, clickSelection);
    // Keyboard manipulation belongs to the canvas, not to the iframe that
    // happened to receive the pointer. Restore focus without scrolling the
    // finite workspace so arrows, duplicate and delete work immediately after
    // direct selection. A later double-click explicitly returns focus to the
    // authored text node for inline editing.
    workspaceRef.current?.focus({ preventScroll: true });
  };

  const submitMutation = (mutation: CanvasV2ManualMutation) => {
    try {
      // Event handlers may run again before React has painted the preceding
      // manual commit. Read the hook's synchronous native authority instead
      // of the render-closure snapshot so rapid, sequential object edits do
      // not build from a stale revision and snap back on release.
      const sourceScene = engine.readNativeScene();
      const nextNativeScene = sourceScene ? applyCanvasV2NativeSceneMutation(sourceScene, mutation) : undefined;
      const document = nextNativeScene
        ? serializeCanvasV2NativeScene(nextNativeScene)
        : applyCanvasV2ManualMutation(engine.committed.document, mutation);
      if (!engine.applyManualDocument(document, describeCanvasV2ManualMutation(mutation), undefined, nextNativeScene, {
        // Model turns must retain their grounded sources. An explicit human
        // delete is different: user ownership wins, including for a canonical
        // screenshot or an entire selected set of screenshots.
        allowEvidenceRemoval: mutation.kind === "delete"
          || (mutation.kind === "batch" && mutation.mutations.some((item) => item.kind === "delete")),
      })) {
        // Busy-state rejections are control flow, not product errors. Controls
        // are disabled while AI work is active; a racing keyboard/pointer
        // event should simply leave committed truth untouched and never leak
        // an internal transaction message onto the canvas.
        setMutationError(undefined);
        return false;
      }
      // The selection overlay is part of the same visual transaction as the
      // object. Updating it from the already-mutated native scene in this
      // event prevents one release frame with new object geometry inside old
      // handles—the resize glitch visible in manual testing.
      if (nextNativeScene) {
        setSelectedElements((current) => synchronizeSelectionWithNativeScene(current, nextNativeScene));
      }
      setMutationError(undefined);
      if (mutation.kind === "delete") selectElement(undefined);
      if (mutation.kind === "visibility" && mutation.hidden) selectElement(undefined);
      if (mutation.kind === "create") {
        setSelectedElements([]);
        setSelectionTarget(mutation.nodeId);
      }
      if (mutation.kind === "duplicate") {
        setSelectedElements([]);
        setSelectionTarget(mutation.newNodeId);
      }
      if (mutation.kind === "group") {
        setSelectedElements([]);
        setSelectionTarget(mutation.groupNodeId);
      }
      if (mutation.kind === "ungroup" || (mutation.kind === "batch" && mutation.mutations.some((item) => item.kind === "delete"))) selectElement(undefined);
      return true;
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The manual edit could not be prepared.");
      return false;
    }
  };

  const batchForSelection = (label: string, create: (element: CanvasV2InspectableElement, index: number) => Exclude<CanvasV2ManualMutation, { kind: "batch" }> | undefined) => {
    const mutations = selectedElements.flatMap((element, index) => {
      const mutation = create(element, index);
      return mutation ? [mutation] : [];
    });
    if (mutations.length) submitMutation({ kind: "batch", label, mutations });
  };

  const styleSelection = (property: CanvasV2EditableStyleProperty, value: string) => {
    batchForSelection(
      `Updated ${property} for ${selectedElements.length} selected object${selectedElements.length === 1 ? "" : "s"}.`,
      (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "style", nodeId: item.nodeId, property, value },
    );
    setToolbarMenu(undefined);
  };

  const commitCustomColor = () => {
    const normalized = customColorDraft.startsWith("#") ? customColorDraft : `#${customColorDraft}`;
    if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
      setMutationError("Enter a six-digit hex color such as #6D59ED.");
      return;
    }
    setCustomColorDraft(normalized.toUpperCase());
    styleSelection(colorProperty, normalized);
  };

  const alignObjectSelection = (mode: "left" | "center" | "right") => {
    const mutable = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    const bounds = unionCanvasV2ObjectBounds(mutable.map((item) => item.bounds));
    if (!bounds || mutable.length < 2) return;
    const mutations = mutable.map((item) => {
      const x = mode === "left"
        ? bounds.x
        : mode === "right"
          ? bounds.x + bounds.width - item.bounds.width
          : bounds.x + (bounds.width - item.bounds.width) / 2;
      return { kind: "move" as const, nodeId: item.nodeId, deltaX: x - item.bounds.x, deltaY: 0 };
    });
    submitMutation({ kind: "batch", label: `Aligned ${mutable.length} objects ${mode}.`, mutations });
  };

  const groupSelection = () => {
    const items = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    const bounds = unionCanvasV2ObjectBounds(items.map((item) => item.bounds));
    if (items.length < 2 || !bounds) return;
    submitMutation({
      kind: "group",
      groupNodeId: `manual-group-${Date.now().toString(36)}`,
      label: "Object group",
      bounds,
      items: items.map((item) => ({ nodeId: item.nodeId, bounds: item.bounds })),
    });
  };

  const duplicateSelection = () => batchForSelection(
    `Duplicated ${selectedElements.length} selected object${selectedElements.length === 1 ? "" : "s"}.`,
    (item, index) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "duplicate", nodeId: item.nodeId, newNodeId: `${item.nodeId}-copy-${Date.now().toString(36)}-${index}` },
  );

  const createPrimitive = (primitive: "text" | "frame" | "shape" | "table") => {
    const nodeId = `manual-${primitive}-${Date.now().toString(36)}`;
    const size = primitive === "frame" ? { width: 360, height: 240 }
      : primitive === "shape" ? { width: 160, height: 160 }
        : primitive === "table" ? { width: 480, height: 120 }
          : { width: 220, height: 48 };
    const centered = centeredCanvasV2WorkspaceOrigin(size, viewport, cameraSize(), contentInsets());
    const occupied = sceneElementsRef.current
      .filter((item) => item.nodeId !== "canvas")
      .map((item) => item.bounds);
    let origin = centered;
    // Consecutive insertions must be separately targetable on their first
    // gesture instead of landing in an accidental topmost z-stack.
    for (let index = 0; index < 12; index += 1) {
      if (!occupied.some((bounds) => canvasV2BoundsIntersect({ ...origin, ...size }, bounds))) break;
      origin = { x: centered.x + (index + 1) * 36, y: centered.y + (index + 1) * 36 };
    }
    submitMutation({ kind: "create", primitive, nodeId, x: origin.x, y: origin.y });
  };

  const insertResearchFlow = (app: AppDataApp, flow: AppDataFlow, result: CanvasV2ResearchResult) => {
    try {
      const insertion = insertCanvasV2CanonicalFlow({ document: engine.committed.document, currentEvidence: engine.committed.evidence, app, flow, evidence: result.evidence });
      if (!engine.applyManualDocument(insertion.document, `Inserted the complete ordered ${app.name} ${flow.name} evidence flow.`, insertion.evidence)) throw new Error("Wait for the current revision to finish rendering.");
      setPanel("chat");
      setSelectionTarget(insertion.laneNodeId);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The flow could not be inserted.");
    }
  };

  const insertResearchScreen = (result: CanvasV2ResearchResult, index: number) => {
    const asset = result.evidence.find((candidate) => candidate.id === `screen:${result.screens[index]?.id}`);
    if (!asset) return setMutationError("That screenshot does not have a renderable evidence asset.");
    try {
      const insertion = insertCanvasV2EvidenceAsset({ document: engine.committed.document, currentEvidence: engine.committed.evidence, asset, nodeId: `evidence-${Date.now().toString(36)}` });
      if (!engine.applyManualDocument(insertion.document, `Inserted ${asset.label} as exact grounded evidence.`, insertion.evidence)) throw new Error("Wait for the current revision to finish rendering.");
      setPanel("chat");
      setSelectionTarget(insertion.nodeId);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The screenshot could not be inserted.");
    }
  };

  const undoCanvas = () => {
    selectElement(undefined);
    engine.undo();
  };

  const redoCanvas = () => {
    selectElement(undefined);
    engine.redo();
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
      const command = event.metaKey || event.ctrlKey;
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePan(true);
      } else if (event.key === "Escape") {
        selectElement(undefined);
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvas(); else undoCanvas();
      } else if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        const selectable = individualMarqueeSelection(sceneElementsRef.current, sceneElementsRef.current);
        setSelectedElements(selectable);
        setSelectionTarget(selectable.at(-1)?.nodeId);
        setToolbarMenu(undefined);
      } else if (command && event.key.toLowerCase() === "g" && event.shiftKey && selectedElement?.kind === "group") {
        event.preventDefault();
        submitMutation({ kind: "ungroup", nodeId: selectedElement.nodeId });
      } else if (command && event.key.toLowerCase() === "g" && selectedElements.length > 1) {
        event.preventDefault();
        groupSelection();
      } else if (command && event.key.toLowerCase() === "c" && selectedElements.length) {
        event.preventDefault();
        internalClipboardRef.current = selectedElements.filter((item) => item.nodeId !== "canvas").map((item) => item.nodeId);
      } else if (command && event.key.toLowerCase() === "x" && selectedElements.length) {
        event.preventDefault();
        internalClipboardRef.current = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked).map((item) => item.nodeId);
        batchForSelection(`Cut ${internalClipboardRef.current.length} objects.`, (item) => internalClipboardRef.current.includes(item.nodeId) ? { kind: "delete", nodeId: item.nodeId } : undefined);
      } else if (command && event.key.toLowerCase() === "v" && internalClipboardRef.current.length) {
        event.preventDefault();
        submitMutation({ kind: "batch", label: `Pasted ${internalClipboardRef.current.length} objects.`, mutations: internalClipboardRef.current.map((nodeId, index) => ({ kind: "duplicate", nodeId, newNodeId: `${nodeId}-paste-${Date.now().toString(36)}-${index}` })) });
      } else if (command && event.key.toLowerCase() === "d" && selectedElements.length) {
        event.preventDefault();
        duplicateSelection();
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedElements.length) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        batchForSelection(`Nudged ${selectedElements.length} selected object${selectedElements.length === 1 ? "" : "s"}.`, (item) => item.nodeId === "canvas" || item.locked ? undefined : ({
          kind: "move", nodeId: item.nodeId,
          deltaX: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0,
          deltaY: event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0,
        }));
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedElements.length) {
        event.preventDefault();
        batchForSelection(`Deleted selected objects.`, (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "delete", nodeId: item.nodeId });
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePan(false);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  });

  const navigateWorkspaceWheel = useCallback((event: { clientX: number; clientY: number; deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean }) => {
    claimCameraForUser();
    if (event.ctrlKey || event.metaKey) {
      const rect = workspaceRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      commitViewport((current) => {
        return zoomViewportAtPoint(
          current,
          current.scale * Math.exp(-event.deltaY * 0.002),
          { x: localX, y: localY },
        );
      });
      return;
    }
    commitViewport((current) => constrainViewport({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
  }, [claimCameraForUser, commitViewport, constrainViewport, zoomViewportAtPoint]);

  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    navigateWorkspaceWheel(event);
  };

  const selectionNodeIds = useMemo(() => selectedElements.map((item) => item.nodeId), [selectedElements]);
  const transientGeometry = useMemo<Readonly<Record<string, CanvasV2TransientGeometry>>>(() => {
    const gesture = directGestureRef.current;
    if (!gesture) return {};
    return Object.fromEntries(selectedElements.flatMap((item) => {
      const next = draftElementBounds[item.nodeId];
      const rotation = draftRotations[item.nodeId];
      if (!next && rotation === undefined) return [];
      return [[item.nodeId, {
        kind: gesture?.kind ?? (rotation !== undefined ? "rotate" : "move"),
        deltaX: next ? next.x - item.bounds.x : 0,
        deltaY: next ? next.y - item.bounds.y : 0,
        ...(gesture?.kind === "resize" && next ? { width: next.width, height: next.height } : {}),
        ...(gesture?.kind === "resize" && next && item.textEditable && item.visualStyle?.fontSize
          ? { fontSize: scaleCanvasV2FontSize(Number.parseFloat(item.visualStyle.fontSize), gesture.original, gesture.draftBounds) }
          : {}),
        ...(rotation !== undefined ? { rotation } : {}),
      } satisfies CanvasV2TransientGeometry]];
    }));
  }, [draftElementBounds, draftRotations, selectedElements]);
  const activeSelectionBounds = draftBounds ?? unionCanvasV2ObjectBounds(selectedElements.map((item) => item.bounds));
  const visibleResizeHandles = activeSelectionBounds ? RESIZE_HANDLES.filter(({ handle }) => {
    const screenWidth = activeSelectionBounds.width * viewport.scale;
    const screenHeight = activeSelectionBounds.height * viewport.scale;
    if (screenWidth < 18 && screenHeight < 18) return handle === "south-east";
    if (screenWidth < 18) return handle === "north" || handle === "east" || handle === "south";
    if (screenHeight < 18) return handle === "west" || handle === "south" || handle === "east";
    return true;
  }) : RESIZE_HANDLES;
  const selectionPermanent = selectedElements.some((item) => item.nodeId === "canvas");
  const selectionIsText = Boolean(selectedElements.length === 1 && selectedElement?.textEditable && (
    selectedElement.textPreview !== undefined
    || ["p", "span", "small", "strong", "em", "label", "button", "h1", "h2", "h3", "h4", "h5", "h6"].includes(selectedElement.tagName)
  ));
  const selectionIsImage = selectedElements.length === 1 && selectedElement?.kind === "image";
  const selectionCanFill = selectedElements.length === 1 && !selectionIsText && !selectionIsImage && !selectionPermanent;
  const selectedVisualStyle = selectedElement?.visualStyle;
  const sourceNodes = useMemo(() => {
    const selectableIds = new Set(sceneElements.map((element) => element.nodeId));
    // Layers mirrors the objects a person can actually select on the board.
    // Generated section/flow/island wrappers remain internal layout structure
    // and must not reintroduce implicit groups through an alternate UI path.
    // Explicit user-created groups are selectable scene elements and remain.
    return readCanvasV2BoardObjectGraph(engine.committed.document)
      .filter((node) => node.kind !== "root" && selectableIds.has(node.nodeId));
  }, [engine.committed, sceneElements]);
  const contextualToolbarPosition = useMemo(() => {
    if (!activeSelectionBounds) return undefined;
    const availableWidth = workspaceRef.current?.clientWidth ?? 1_440;
    const availableHeight = workspaceRef.current?.clientHeight ?? 900;
    const toolbarHeight = toolbarSize.height;
    const bottomChrome = 92;
    const rawCenter = viewport.x + (activeSelectionBounds.x + activeSelectionBounds.width / 2) * viewport.scale;
    const resolvedToolbarWidth = Math.min(toolbarSize.width, availableWidth - 32);
    const halfToolbar = resolvedToolbarWidth / 2;
    const minimumCenter = (chatOpen ? 430 : 16) + halfToolbar + 12;
    const maximumCenter = Math.max(minimumCenter, availableWidth - halfToolbar - 16);
    const clampCenter = (center: number) => Math.max(minimumCenter, Math.min(maximumCenter, center));
    const clampTop = (top: number) => Math.max(18, Math.min(availableHeight - bottomChrome - toolbarHeight, top));
    const selectionLeft = viewport.x + activeSelectionBounds.x * viewport.scale;
    const selectionRight = viewport.x + (activeSelectionBounds.x + activeSelectionBounds.width) * viewport.scale;
    const selectionTop = viewport.y + activeSelectionBounds.y * viewport.scale;
    const selectionBottom = viewport.y + (activeSelectionBounds.y + activeSelectionBounds.height) * viewport.scale;
    const selectedIds = new Set(selectedElements.map((item) => item.nodeId));
    const occupied = sceneElements
      .filter((item) => !selectedIds.has(item.nodeId) && !item.hidden)
      .map((item) => ({
        left: viewport.x + item.bounds.x * viewport.scale - 8,
        top: viewport.y + item.bounds.y * viewport.scale - 8,
        right: viewport.x + (item.bounds.x + item.bounds.width) * viewport.scale + 8,
        bottom: viewport.y + (item.bounds.y + item.bounds.height) * viewport.scale + 8,
      }));
    const chrome = [canvasMenuRef.current, statusPillRef.current]
      .flatMap((element) => {
        if (!element) return [];
        const bounds = element.getBoundingClientRect();
        return [{ left: bounds.left - 8, top: bounds.top - 8, right: bounds.right + 8, bottom: bounds.bottom + 8 }];
      });
    // The inspector belongs outside the selected object. Ranking only against
    // neighboring objects allowed the real, measured toolbar to shave across
    // a tiny zoomed-out selection and consume its resize target.
    const selectionObstacle = {
      left: selectionLeft - 18,
      top: selectionTop - 18,
      right: selectionRight + 18,
      bottom: selectionBottom + 18,
    };
    const candidates = [
      { placement: "above" as const, center: rawCenter, top: selectionTop - toolbarHeight - 54 },
      { placement: "below" as const, center: rawCenter, top: selectionBottom + 54 },
      { placement: "below" as const, center: selectionRight + 54 + halfToolbar, top: (selectionTop + selectionBottom - toolbarHeight) / 2 },
      { placement: "below" as const, center: selectionLeft - 54 - halfToolbar, top: (selectionTop + selectionBottom - toolbarHeight) / 2 },
      // Dense evidence rails can occupy every local direction. A stable top
      // dock is the final collision-free escape hatch and remains outside the
      // floating chat/menu/status chrome.
      { placement: "below" as const, center: rawCenter, top: 18 },
    ].map((candidate) => ({ ...candidate, center: clampCenter(candidate.center), top: clampTop(candidate.top) }));
    const intersectionArea = (candidate: typeof candidates[number], obstacle: typeof occupied[number]) => {
      const left = candidate.center - halfToolbar;
      const right = candidate.center + halfToolbar;
      const overlapWidth = Math.max(0, Math.min(right, obstacle.right) - Math.max(left, obstacle.left));
      const overlapHeight = Math.max(0, Math.min(candidate.top + toolbarHeight, obstacle.bottom) - Math.max(candidate.top, obstacle.top));
      return overlapWidth * overlapHeight;
    };
    const ranked = candidates.map((candidate, index) => ({
      candidate,
      index,
      overlap: [...occupied, ...chrome, selectionObstacle].reduce((total, obstacle) => total + intersectionArea(candidate, obstacle), 0),
    })).sort((left, right) => left.overlap - right.overlap || left.index - right.index);
    const chosen = ranked[0].candidate;
    return { placement: chosen.placement, style: { left: chosen.center, top: chosen.top } };
  }, [activeSelectionBounds, chatOpen, sceneElements, selectedElements, toolbarSize, viewport]);

  useEffect(() => {
    const toolbar = contextualToolbarRef.current;
    if (!toolbar || !selectedElement) return;
    const update = () => setToolbarSize((current) => {
      const next = { width: toolbar.offsetWidth, height: toolbar.offsetHeight };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(toolbar);
    return () => observer?.disconnect();
  }, [selectedElement, selectedElements.length, toolbarMenu]);

  return (
    <main className="relative h-screen min-h-[680px] overflow-hidden bg-[#fefeff] text-[#181824] transition-colors duration-300 dark:bg-[#111117] dark:text-[#f4f3f8]">
      <div ref={canvasMenuRef} className="absolute left-5 top-5 z-50 flex h-14 items-center overflow-hidden rounded-2xl border border-[#dedfea] bg-white shadow-[0_10px_32px_rgba(51,45,95,.13)] dark:border-white/[.1] dark:bg-[#1d1c24] dark:shadow-[0_14px_40px_rgba(0,0,0,.32)]">
        <button aria-label="Open North Star panel" onClick={() => { setChatOpen(true); setPanel("chat"); }} className="grid h-14 w-14 place-items-center border-r border-[#e8e8ef] bg-[#181824] text-sm font-black text-white dark:border-white/[.08] dark:bg-[#6d59ed]">N</button>
        <button className="flex h-14 items-center gap-3 px-4 text-left" aria-label="Canvas menu">
          <span><span className="block text-[10px] font-black uppercase tracking-[.16em] text-[#8c8c9a] dark:text-[#8e8b99]">North Star</span><span className="block text-sm font-bold tracking-[-.01em]">Untitled canvas</span></span>
          <ChevronDown className="h-4 w-4 text-[#7c7c8a] dark:text-[#9995a5]" />
        </button>
        {!chatOpen && <button aria-label="Open North Star panel" onClick={() => setChatOpen(true)} className="grid h-14 w-12 place-items-center border-l border-[#e8e8ef] text-[#6653e8] hover:bg-[#f2efff] dark:border-white/[.08] dark:text-[#b4a9ff] dark:hover:bg-white/[.06]"><MessageSquare className="h-4 w-4" /></button>}
      </div>

      <div ref={statusPillRef} className="absolute right-5 top-5 z-50 flex h-14 items-center gap-3 rounded-2xl border border-[#dedfea] bg-white px-2.5 shadow-[0_10px_32px_rgba(51,45,95,.13)] dark:border-white/[.1] dark:bg-[#1d1c24] dark:shadow-[0_14px_40px_rgba(0,0,0,.32)]">
        <span className={`h-2 w-2 rounded-full ${chat.busy ? "animate-pulse bg-[#735dff]" : "bg-emerald-400"}`} />
        <span data-testid="canvas-v2-loop-status" className="text-xs font-black capitalize text-[#343442] dark:text-[#f1eff6]">{chat.routing ? "understanding request" : engine.loop?.status.replaceAll("-", " ") ?? (chat.busy ? "working" : "ready")}</span>
        <span className="h-6 w-px bg-[#e5e5ed] dark:bg-white/[.09]" />
        <span data-testid="canvas-v2-committed-revision" className="max-w-[150px] truncate font-mono text-[10px] text-[#8b8b99]">{engine.committed.id}</span>
        <button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Toggle theme" className="grid h-9 w-9 place-items-center rounded-[11px] text-[#676573] transition hover:bg-[#f0edff] hover:text-[#6653e8] dark:text-[#aaa6b4] dark:hover:bg-white/[.07] dark:hover:text-[#c1b8ff]">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
      </div>

      {chatOpen && <aside ref={chatPanelRef} data-testid="canvas-v2-floating-panel" className="absolute bottom-24 left-5 top-[90px] z-40 flex w-[390px] flex-col overflow-hidden rounded-[24px] border border-[#dedee8] bg-white shadow-[0_24px_80px_rgba(46,42,88,.14)] dark:border-white/[.1] dark:bg-[#191820] dark:shadow-[0_28px_85px_rgba(0,0,0,.38)] 2xl:bottom-5">
        <div className="flex h-[58px] items-center border-b border-[#ececf2] px-3 dark:border-white/[.08]">
          <div className="grid flex-1 grid-cols-3 gap-1 rounded-[14px] bg-[#f6f6f9] p-1 dark:bg-white/[.045]">
            {(["chat", "shapes", "apps"] as Panel[]).map((item) => {
              const Icon = item === "chat" ? MessageSquare : item === "shapes" ? Shapes : AppWindow;
              return <button key={item} onClick={() => setPanel(item)} className={`flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-2 text-xs font-bold capitalize transition ${panel === item ? "bg-white text-[#272735] shadow-[0_2px_8px_rgba(43,40,72,.08)] dark:bg-white/[.1] dark:text-[#f3f1f7]" : "text-[#898895] hover:text-[#555461] dark:text-[#8f8b99] dark:hover:text-[#d7d4dd]"}`}><Icon className="h-3.5 w-3.5" />{item}</button>;
            })}
          </div>
          <button aria-label="Collapse North Star panel" onClick={() => setChatOpen(false)} className="ml-2 grid h-9 w-9 place-items-center rounded-[11px] text-[#858594] transition hover:bg-[#f0edff] hover:text-[#6653e8] dark:text-[#9692a0] dark:hover:bg-white/[.07] dark:hover:text-[#b9aeff]"><X className="h-4 w-4" /></button>
        </div>

        {panel === "chat" ? <CanvasV2ChatPanel chat={chat} engine={engine} selection={selectedElement} selections={selectedElements} /> : panel === "apps" ? <CanvasV2ResearchPanel endpoint={researchEndpoint} busy={engine.running || engine.applyingManualEdit} onInsertFlow={insertResearchFlow} onInsertScreen={insertResearchScreen} /> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f0edff] text-[#6d59ed] dark:bg-[#292439] dark:text-[#ad9fff]"><Shapes /></div><h2 className="mt-4 font-bold capitalize">{panel}</h2><p className="mt-2 max-w-[250px] text-sm leading-6 text-[#777789] dark:text-[#9995a5]">Create text, frames, shapes, and tables from the toolbar, then edit them directly on the workspace.</p></div>}
      </aside>}

      <section
        ref={workspaceRef}
        tabIndex={-1}
        aria-label="Canvas workspace"
        className={`absolute inset-0 overflow-clip overscroll-none ${tool === "pan" || spacePan ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
        style={{
          backgroundColor: theme === "dark" ? "#111117" : "#fefeff",
          backgroundImage: `radial-gradient(circle, ${theme === "dark" ? "rgba(174,159,255,.17)" : "rgba(109,89,237,.12)"} 1px, transparent 1px)`,
          backgroundSize: `${CANVAS_V2_WORKSPACE.grid * viewport.scale}px ${CANVAS_V2_WORKSPACE.grid * viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onScroll={(event) => {
          // A synchronous JSX boundary complements the lifecycle listener and
          // makes the invariant explicit in tests and during React remounts.
          event.currentTarget.scrollLeft = 0;
          event.currentTarget.scrollTop = 0;
        }}
        onWheel={wheel}
      >
        <div
          data-testid="canvas-v2-workspace-surface"
          data-canvas-v2-workspace-surface
          className="absolute origin-top-left overflow-visible bg-transparent"
          style={{
            left: viewport.x,
            top: viewport.y,
            width: CANVAS_V2_WORKSPACE.width,
            height: CANVAS_V2_WORKSPACE.height,
            transform: `scale(${viewport.scale})`,
            transformOrigin: "0 0",
            backgroundImage: `radial-gradient(circle, ${theme === "dark" ? "rgba(174,159,255,.17)" : "rgba(109,89,237,.12)"} 1px, transparent 1px)`,
            backgroundSize: `${CANVAS_V2_WORKSPACE.grid}px ${CANVAS_V2_WORKSPACE.grid}px`,
            // Do not promote the full 12,000 x 8,000 surface to one GPU paint
            // layer. Chromium can drop that layer (and nearby floating chrome)
            // under zoom/revision pressure. Normal tiled painting is stable.
            contain: "layout style",
          }}
        >
          <div
            data-canvas-v2-workspace-content
            className="relative overflow-visible"
            style={{ width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height }}
          >
            <CanvasV2CanvasScene
              revision={engine.displayed}
              theme={theme}
              onObservation={engine.receiveObservation}
              onCaptureError={engine.captureFailed}
              bare
              framePointerEvents={tool === "pan" || spacePan ? "none" : "auto"}
              inspectionEnabled={tool === "select" && !spacePan}
              selectedNodeId={selectionTarget}
              selectedNodeIds={selectionNodeIds}
              onElementHover={hoverElement}
              onElementSelect={selectCanvasElement}
              onSelectionRefresh={refreshSelection}
              onSceneSnapshot={receiveScene}
              onNativeScene={engine.receiveNativeScene}
              nativeSceneOverride={engine.nativeScene}
              onElementTextCommit={(element, text) => submitMutation({ kind: "text", nodeId: element.nodeId, text })}
              width={CANVAS_V2_WORKSPACE.width}
              height={CANVAS_V2_WORKSPACE.height}
              captureEnabled={false}
              onWorkspaceWheel={navigateWorkspaceWheel}
              onWorkspacePointer={forwardedWorkspacePointer}
              onElementPointer={forwardedElementPointer}
              transientGeometry={transientGeometry}
            />
            {tool === "select" && selectedElements.length === 0 && hoveredElement && hoveredElement.nodeId !== "canvas" && hoveredElement.kind !== "root" && !selectionNodeIds.includes(hoveredElement.nodeId) && <div aria-hidden className="pointer-events-none absolute border border-[#8d7cff]/70 bg-[#7661f3]/[.025]" style={{ left: hoveredElement.bounds.x, top: hoveredElement.bounds.y, width: hoveredElement.bounds.width, height: hoveredElement.bounds.height }} />}
            {selectedElements.length > 1 && selectedElements.map((element) => {
              const bounds = draftElementBounds[element.nodeId] ?? element.bounds;
              return <div key={element.nodeId} aria-hidden className="pointer-events-none absolute border border-[#8d7cff]/70" style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, rotate: `${draftRotations[element.nodeId] ?? element.rotation ?? 0}deg` }} />;
            })}
            {selectedElement && activeSelectionBounds && <div data-testid="canvas-v2-element-selection" className="pointer-events-none absolute border-[#1597f4]" style={{ left: activeSelectionBounds.x, top: activeSelectionBounds.y, width: activeSelectionBounds.width, height: activeSelectionBounds.height, borderWidth: 1 / viewport.scale, rotate: selectedElements.length === 1 ? `${draftRotations[selectedElement.nodeId] ?? selectedElement.rotation ?? 0}deg` : undefined }}>
              {selectedElements.length > 1 && !selectionPermanent && <button
                type="button"
                aria-label={`Move ${selectedElements.length} selected objects`}
                title="Drag the selection"
                data-testid="canvas-v2-aggregate-drag-surface"
                onPointerDown={(event) => beginDirectGesture("move", event)}
                className="pointer-events-auto absolute inset-0 z-[5] cursor-move bg-transparent"
              />}
              {!selectionPermanent && visibleResizeHandles.map(({ handle, className, cursor }) => <button key={handle} aria-label={`Resize ${selectedElement.nodeId} from ${handle}`} onPointerDown={(event) => beginDirectGesture("resize", event, handle)} style={{ scale: `${0.625 / viewport.scale}` }} className={`pointer-events-auto absolute z-10 h-4 w-4 rounded-sm border-2 border-[#6d5df5] bg-white dark:bg-[#1f1d27] ${className} ${cursor}`} />)}
              {!selectionPermanent && ROTATE_CORNERS.map(({ corner, className, iconClassName }) => {
                // Keep the invisible rotation hit target compact and entirely
                // outside the selected corner. Oversized 28px targets around
                // tiny zoomed-out screens intercepted clicks meant for nearby
                // objects even while no rotate icon was visible.
                const offset = -(14 / viewport.scale + 10);
                return <button key={corner} aria-label={`Rotate selected objects from ${corner}`} title="Drag to rotate" onPointerDown={(event) => beginDirectGesture("rotate", event)} style={{ scale: `${0.6 / viewport.scale}`, ...(corner.includes("west") ? { left: offset } : { right: offset }), ...(corner.includes("north") ? { top: offset } : { bottom: offset }) }} className={`group pointer-events-auto absolute z-20 h-7 w-7 cursor-grab rounded-full bg-transparent active:cursor-grabbing ${className}`}><span className={`pointer-events-none absolute grid h-6 w-6 scale-75 place-items-center rounded-full border border-[#dad6ff] bg-white text-[#6d59ed] opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 dark:border-[#554a89] dark:bg-[#211e2b] dark:text-[#b9adff] ${iconClassName}`}><RotateCw className="h-3.5 w-3.5" /></span></button>;
              })}
            </div>}
            {snapGuides.map((guide, index) => <div key={`${guide.axis}-${guide.position}-${index}`} aria-hidden className="pointer-events-none absolute z-30 bg-[#ef4fb8]" style={guide.axis === "x" ? { left: guide.position, top: guide.from, width: 1, height: guide.to - guide.from } : { left: guide.from, top: guide.position, width: guide.to - guide.from, height: 1 }} />)}
            {engine.running && <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-[#ddd9ff] bg-white/90 px-4 py-2 text-xs font-bold text-[#6652e9] shadow-lg backdrop-blur dark:border-[#5b4f91] dark:bg-[#24212e]/92 dark:text-[#b8adff]">{engine.loop?.status === "thinking" ? "North Star is reviewing" : "Rendering revision"}</div>}
          </div>
        </div>
        {marquee && (Math.abs(marquee.screenCurrent.x - marquee.screenStart.x) >= 3 || Math.abs(marquee.screenCurrent.y - marquee.screenStart.y) >= 3) && (
          <div
            data-testid="canvas-v2-marquee-selection"
            aria-hidden
            className="pointer-events-none fixed z-[70] border border-[#6d5df5] bg-[#6d5df5]/[.035] shadow-[0_0_0_1px_rgba(255,255,255,.22)_inset]"
            style={{
              left: Math.min(marquee.screenStart.x, marquee.screenCurrent.x),
              top: Math.min(marquee.screenStart.y, marquee.screenCurrent.y),
              width: Math.abs(marquee.screenCurrent.x - marquee.screenStart.x),
              height: Math.abs(marquee.screenCurrent.y - marquee.screenStart.y),
            }}
          />
        )}
      </section>

      {!engine.displayedObservation && (
        <div
          aria-hidden="true"
          data-testid="canvas-v2-committed-observation-surface"
          className="pointer-events-none fixed overflow-hidden opacity-0"
          style={{ left: -100_000, top: -100_000, width: 1, height: 1 }}
        >
          <CanvasV2CanvasScene
            revision={engine.displayed}
            theme={theme}
            onObservation={engine.receiveObservation}
            onCaptureError={engine.captureFailed}
            onGeometry={receiveGeometry}
            bare
            framePointerEvents="none"
          />
        </div>
      )}

      {engine.inspectionCandidate && (
        <div
          aria-hidden="true"
          data-testid="canvas-v2-candidate-inspection-surface"
          className="pointer-events-none fixed overflow-hidden opacity-0"
          style={{ left: -100_000, top: -100_000, width: 1, height: 1 }}
        >
          <CanvasV2CanvasScene
            revision={engine.inspectionCandidate}
            theme={theme}
            onObservation={engine.receiveObservation}
            onCaptureError={engine.captureFailed}
            onNativeScene={engine.receiveNativeScene}
            placementReferenceScene={engine.nativeScene}
            bare
            framePointerEvents="none"
          />
        </div>
      )}

      {selectedElement && contextualToolbarPosition && !layersOpen && <aside
        ref={contextualToolbarRef}
        aria-label="Element inspector"
        data-testid="canvas-v2-context-toolbar"
        data-placement={contextualToolbarPosition.placement}
        className="absolute z-50 flex min-h-14 max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-1 rounded-[18px] border border-white/[.08] bg-[#1c1c20]/[.98] px-2.5 text-white shadow-[0_18px_60px_rgba(21,18,38,.34)] backdrop-blur-xl"
        style={contextualToolbarPosition.style}
      >
        {selectedElements.length > 1 && <>
          <span className="px-2 text-xs font-bold text-white/75">{selectedElements.length} selected</span>
          <button title="Align left" aria-label="Align selected objects left" onClick={() => alignObjectSelection("left")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignLeft className="h-4 w-4" /></button>
          <button title="Align centers" aria-label="Align selected object centers" onClick={() => alignObjectSelection("center")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignCenter className="h-4 w-4" /></button>
          <button title="Align right" aria-label="Align selected objects right" onClick={() => alignObjectSelection("right")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignRight className="h-4 w-4" /></button>
        </>}

        {selectionIsText && <>
          <button title="Text color" aria-label="Change text color" onClick={() => { setColorProperty("color"); setToolbarMenu((current) => current === "color" ? undefined : "color"); }} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><span className="h-5 w-5 rounded-full border-2 border-white/35" style={{ background: selectedVisualStyle?.color || "var(--northstar-ink)" }} /></button>
          <button aria-label="Text style" title="Text style" onClick={() => setToolbarMenu((current) => current === "font" ? undefined : "font")} className="flex h-9 min-w-[98px] items-center justify-between gap-2 rounded-xl px-3 text-xs font-bold hover:bg-white/[.1]">
            <span>{selectedVisualStyle?.fontFamily?.includes("Georgia") ? "Bookish" : selectedVisualStyle?.fontFamily?.toLowerCase().includes("mono") ? "Technical" : "Simple"}</span><ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button aria-label="Font size" title="Font size" onClick={() => setToolbarMenu((current) => current === "size" ? undefined : "size")} className="flex h-9 min-w-[62px] items-center justify-between gap-2 rounded-xl px-3 text-xs font-bold hover:bg-white/[.1]">
            <span>{Math.round(Number.parseFloat(selectedVisualStyle?.fontSize || "24"))}</span><ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button title="Bold" aria-label="Toggle bold" onClick={() => styleSelection("font-weight", Number.parseInt(selectedVisualStyle?.fontWeight || "400", 10) >= 600 ? "400" : "700")} className={`grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] ${Number.parseInt(selectedVisualStyle?.fontWeight || "400", 10) >= 600 ? "bg-white/[.12]" : ""}`}><Bold className="h-4 w-4" /></button>
          <button title="Italic" aria-label="Toggle italic" onClick={() => styleSelection("font-style", selectedVisualStyle?.fontStyle === "italic" ? "normal" : "italic")} className={`grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] ${selectedVisualStyle?.fontStyle === "italic" ? "bg-white/[.12]" : ""}`}><Italic className="h-4 w-4" /></button>
          <button title="Align left" aria-label="Align text left" onClick={() => styleSelection("text-align", "left")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignLeft className="h-4 w-4" /></button>
          <button title="Align center" aria-label="Align text center" onClick={() => styleSelection("text-align", "center")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignCenter className="h-4 w-4" /></button>
          <button title="Align right" aria-label="Align text right" onClick={() => styleSelection("text-align", "right")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignRight className="h-4 w-4" /></button>
        </>}

        {selectionCanFill && <>
          <button title="Fill color" aria-label="Change fill color" onClick={() => { setColorProperty("background-color"); setToolbarMenu((current) => current === "color" ? undefined : "color"); }} className="flex h-9 items-center gap-2 rounded-xl px-2 hover:bg-white/[.1]"><span className="h-5 w-5 rounded-full border-2 border-white/35" style={{ background: selectedVisualStyle?.backgroundColor || "var(--northstar-surface)" }} /><span className="text-xs font-bold">Fill</span></button>
          <button title="Border color" aria-label="Change border color" onClick={() => { setColorProperty("border-color"); setToolbarMenu((current) => current === "color" ? undefined : "color"); }} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><Palette className="h-4 w-4" /></button>
        </>}

        {selectionIsImage && <>
          <ImageIcon className="mx-2 h-4 w-4 text-[#a99cff]" />
          <button title="Toggle contain or cover" aria-label="Toggle image fit" onClick={() => styleSelection("object-fit", selectedVisualStyle?.objectFit === "cover" ? "contain" : "cover")} className="h-9 rounded-xl px-3 text-xs font-bold capitalize hover:bg-white/[.1]">{selectedVisualStyle?.objectFit === "cover" ? "Cover" : "Contain"}</button>
          <button title="Edit image alt text" aria-label="Edit image alt text" onClick={() => { setAltTextDraft(selectedElement.altText ?? ""); setToolbarMenu((current) => current === "image" ? undefined : "image"); }} className="h-9 rounded-xl px-3 text-xs font-bold hover:bg-white/[.1]">Alt text</button>
        </>}

        <div className="mx-1 h-7 w-px bg-white/[.12]" />
        <button title="Duplicate" aria-label="Duplicate selected elements" onClick={duplicateSelection} disabled={selectionPermanent || engine.running || engine.applyingManualEdit} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30"><Copy className="h-4 w-4" /></button>
        {selectedElements.length > 1 ? <button title="Group selection (⌘G)" aria-label="Group selected elements" onClick={groupSelection} disabled={selectionPermanent} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30"><Group className="h-4 w-4" /></button> : selectedElement.kind === "group" ? <button title="Ungroup (⇧⌘G)" aria-label="Ungroup selected elements" onClick={() => submitMutation({ kind: "ungroup", nodeId: selectedElement.nodeId })} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><Ungroup className="h-4 w-4" /></button> : null}
        <button title="Lock or unlock" aria-label="Toggle lock for selected elements" onClick={() => batchForSelection("Updated selection locks.", (item) => item.nodeId === "canvas" ? undefined : { kind: "lock", nodeId: item.nodeId, locked: !item.locked })} disabled={selectionPermanent || engine.running || engine.applyingManualEdit} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30">{selectedElements.every((item) => item.locked) ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</button>
        <button title="Delete" aria-label="Delete selected elements" onClick={() => batchForSelection("Deleted selected objects.", (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "delete", nodeId: item.nodeId })} disabled={selectionPermanent || engine.running || engine.applyingManualEdit || selectedElements.every((item) => item.locked)} className="grid h-9 w-9 place-items-center rounded-xl text-[#ff8f91] hover:bg-red-500/[.14] disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
        <button title="More object actions" aria-label="More object actions" onClick={() => setToolbarMenu((current) => current === "more" ? undefined : "more")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><Settings2 className="h-4 w-4" /></button>
        <button title="Clear selection" aria-label="Clear element selection" onClick={() => selectElement(undefined)} className="grid h-9 w-9 place-items-center rounded-xl text-white/70 hover:bg-white/[.1] hover:text-white"><X className="h-4 w-4" /></button>

        {toolbarMenu === "font" && <div aria-label="Text style menu" className={`absolute left-12 w-[180px] rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-2 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          {TEXT_STYLE_OPTIONS.map((option) => <button key={option.label} onClick={() => styleSelection("font-family", option.value)} className="flex h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold hover:bg-white/[.1]" style={{ fontFamily: option.value }}>{option.label}</button>)}
        </div>}

        {toolbarMenu === "size" && <div aria-label="Font size menu" className={`absolute left-[162px] grid w-[104px] grid-cols-2 gap-1 rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-2 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          {TEXT_SIZE_OPTIONS.map((size) => <button key={size} onClick={() => styleSelection("font-size", `${size}px`)} className="grid h-10 place-items-center rounded-xl text-sm font-bold hover:bg-white/[.1]">{size}</button>)}
        </div>}

        {toolbarMenu === "color" && <div aria-label="Color palette" className={`absolute left-1/2 w-[286px] -translate-x-1/2 rounded-[20px] border border-white/[.1] bg-[#1c1c20] p-3 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          <div className="grid grid-cols-6 gap-2">
            {CANVAS_COLOR_SWATCHES.map((swatch) => <button key={swatch.label} title={swatch.label} aria-label={`Use ${swatch.label}`} onClick={() => styleSelection(colorProperty, swatch.value)} className="h-8 w-8 rounded-full border-2 border-white/20 shadow-inner transition hover:scale-110 hover:border-white/70" style={{ background: swatch.preview }} />)}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-white/[.1] pt-3">
            <label title="Choose a custom color" className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white/25 bg-[conic-gradient(from_90deg,#ff4d4d,#ffd84d,#53df74,#4dc8ff,#8c5cff,#ff4db8,#ff4d4d)] shadow-inner transition hover:scale-105 hover:border-white/70">
              <input aria-label="Choose custom color" type="color" value={/^#[0-9a-f]{6}$/i.test(customColorDraft) ? customColorDraft : "#6d59ed"} onChange={(event) => setCustomColorDraft(event.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <input aria-label="Custom hex color" value={customColorDraft} maxLength={7} onChange={(event) => setCustomColorDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitCustomColor(); }} className="h-9 min-w-0 flex-1 rounded-xl bg-white/[.09] px-3 font-mono text-xs font-bold uppercase outline-none ring-1 ring-white/[.08] focus:ring-2 focus:ring-[#8f7fff]" placeholder="#6D59ED" />
            <button aria-label="Apply custom color" onClick={commitCustomColor} className="h-9 rounded-xl bg-[#7158ef] px-3 text-xs font-bold hover:bg-[#806af3]">Apply</button>
          </div>
        </div>}

        {toolbarMenu === "image" && <form onSubmit={(event) => { event.preventDefault(); submitMutation({ kind: "attribute", nodeId: selectedElement.nodeId, name: "alt", value: altTextDraft }); setToolbarMenu(undefined); }} className={`absolute left-1/2 flex w-[320px] -translate-x-1/2 items-center gap-2 rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-3 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          <input aria-label="Image alt text" value={altTextDraft} onChange={(event) => setAltTextDraft(event.target.value)} placeholder="Describe this image" className="h-10 min-w-0 flex-1 rounded-xl bg-white/[.1] px-3 text-sm outline-none placeholder:text-white/40 focus:ring-2 focus:ring-[#8f7fff]" />
          <button type="submit" className="h-10 rounded-xl bg-[#7158ef] px-4 text-xs font-bold">Save</button>
        </form>}

        {toolbarMenu === "more" && <div aria-label="Object actions" className={`absolute right-0 flex items-center gap-1 rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-2 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          <button title="Hide" aria-label="Hide selected elements" onClick={() => batchForSelection("Hid selected objects.", (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "visibility", nodeId: item.nodeId, hidden: true })} disabled={selectionPermanent || engine.running || engine.applyingManualEdit} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30"><EyeOff className="h-4 w-4" /></button>
          <button title="Send backward" aria-label="Send selected element backward" onClick={() => submitMutation({ kind: "layer", nodeId: selectedElement.nodeId, direction: "backward" })} disabled={selectionPermanent || selectedElement.locked} className="h-9 rounded-xl px-2 text-[11px] font-bold hover:bg-white/[.1] disabled:opacity-30">−1</button>
          <button title="Bring forward" aria-label="Bring selected element forward" onClick={() => submitMutation({ kind: "layer", nodeId: selectedElement.nodeId, direction: "forward" })} disabled={selectionPermanent || selectedElement.locked} className="h-9 rounded-xl px-2 text-[11px] font-bold hover:bg-white/[.1] disabled:opacity-30">+1</button>
        </div>}
      </aside>}
      {mutationError && <div role="alert" className="absolute right-5 top-[90px] z-50 max-w-[340px] rounded-2xl border border-red-200 bg-white/95 px-4 py-3 text-xs leading-5 text-red-700 shadow-xl backdrop-blur dark:border-red-500/25 dark:bg-[#241d24]/95 dark:text-red-300">{mutationError}</div>}

      {layersOpen && <aside aria-label="Layers panel" className="absolute bottom-24 right-6 z-40 max-h-[420px] w-[300px] overflow-hidden rounded-[22px] border border-[#dedfec] bg-white/95 shadow-[0_18px_55px_rgba(50,45,100,.16)] backdrop-blur-xl dark:border-white/[.1] dark:bg-[#1b1a22]/95 dark:shadow-[0_20px_60px_rgba(0,0,0,.35)]"><div className="flex items-center justify-between border-b border-[#e8e8f0] px-4 py-3 dark:border-white/[.08]"><div className="flex items-center gap-2 text-sm font-black"><Layers3 className="h-4 w-4 text-[#6d59ed]" />Objects</div><span className="text-[10px] font-bold text-[#9999a8]">{sourceNodes.length} nodes</span></div><div className="max-h-[350px] overflow-y-auto p-2">{sourceNodes.map((node) => <div key={node.nodeId} style={{ paddingLeft: 8 + Math.min(4, node.depth) * 14 }} className={`flex items-center gap-2 rounded-xl py-2 pr-2 text-xs ${selectionNodeIds.includes(node.nodeId) ? "bg-[#eeeaff] text-[#5744d5] dark:bg-[#302b4a] dark:text-[#c6bdff]" : "hover:bg-[#f6f5fa] dark:hover:bg-white/[.05]"}`}><button onClick={(event) => { const element = sceneElements.find((item) => item.nodeId === node.nodeId); if (element) selectElement(element, { additive: event.shiftKey || event.metaKey, range: event.shiftKey, directEdit: false }); else { setSelectedElements([]); setSelectionTarget(node.nodeId); } setLayersOpen(false); }} disabled={node.hidden} className="min-w-0 flex-1 truncate text-left font-semibold disabled:opacity-40"><span className="mr-2 font-mono text-[9px] uppercase text-[#9999a8]">{node.kind}</span>{node.nodeId}</button><button aria-label={`${node.hidden ? "Show" : "Hide"} ${node.nodeId}`} onClick={() => submitMutation({ kind: "visibility", nodeId: node.nodeId, hidden: !node.hidden })} disabled={node.nodeId === "canvas"} className="text-[#777789] disabled:opacity-25 dark:text-[#a09ca9]">{node.hidden ? "Show" : <EyeOff className="h-3.5 w-3.5" />}</button><button aria-label={`${node.locked ? "Unlock" : "Lock"} ${node.nodeId}`} onClick={() => submitMutation({ kind: "lock", nodeId: node.nodeId, locked: !node.locked })} disabled={node.nodeId === "canvas"} className="text-[#777789] disabled:opacity-25 dark:text-[#a09ca9]">{node.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button></div>)}</div></aside>}

      <div className="absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[#dddded] bg-white/95 p-2 shadow-[0_18px_55px_rgba(50,45,100,.18)] backdrop-blur-xl dark:border-white/[.1] dark:bg-[#1c1b23]/95 dark:shadow-[0_20px_60px_rgba(0,0,0,.38)]">
        <button onClick={undoCanvas} disabled={!engine.canUndo} title="Undo" className="grid h-11 w-11 place-items-center rounded-xl text-[#646474] disabled:opacity-30 dark:text-[#aaa6b4]"><Undo2 className="h-5 w-5" /></button>
        <button onClick={redoCanvas} disabled={!engine.canRedo} title="Redo" className="grid h-11 w-11 place-items-center rounded-xl text-[#646474] disabled:opacity-30 dark:text-[#aaa6b4]"><Redo2 className="h-5 w-5" /></button>
        <div className="mx-1 h-7 w-px bg-[#e2e2eb] dark:bg-white/[.09]" />
        <button onClick={() => setTool("select")} title="Select" className={`grid h-11 w-11 place-items-center rounded-xl ${tool === "select" ? "bg-[#e9e5ff] text-[#6c57ec] dark:bg-[#302b4a] dark:text-[#b3a7ff]" : "text-[#646474] dark:text-[#aaa6b4]"}`}><MousePointer2 className="h-5 w-5" /></button>
        <button onClick={() => setTool("pan")} title="Pan" className={`grid h-11 w-11 place-items-center rounded-xl ${tool === "pan" ? "bg-[#e9e5ff] text-[#6c57ec] dark:bg-[#302b4a] dark:text-[#b3a7ff]" : "text-[#646474] dark:text-[#aaa6b4]"}`}><Hand className="h-5 w-5" /></button>
        <div className="mx-1 h-7 w-px bg-[#e2e2eb] dark:bg-white/[.09]" />
        {TOOL_ITEMS.map(({ label, icon: Icon, primitive }) => <button key={label} title={`Create ${label}`} onClick={() => createPrimitive(primitive)} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className="grid h-11 w-11 place-items-center rounded-xl text-[#686879] hover:bg-[#f0edff] hover:text-[#6d59ed] disabled:opacity-35 dark:text-[#aaa6b4] dark:hover:bg-white/[.07] dark:hover:text-[#b3a7ff]"><Icon className="h-5 w-5" /></button>)}
        <div className="mx-1 h-7 w-px bg-[#e2e2eb] dark:bg-white/[.09]" />
        <button title="Layers" onClick={() => setLayersOpen((open) => !open)} className={`flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold ${layersOpen ? "bg-[#e9e5ff] text-[#6c57ec] dark:bg-[#302b4a] dark:text-[#b3a7ff]" : "text-[#5e5e6e] dark:text-[#aaa6b4]"}`}><Layers3 className="h-4 w-4" />Layer</button>
      </div>

      <div className="absolute bottom-5 right-5 z-40 flex items-center overflow-hidden rounded-2xl border border-[#dddded] bg-white/95 shadow-[0_12px_40px_rgba(50,45,100,.14)] backdrop-blur-xl dark:border-white/[.1] dark:bg-[#1c1b23]/95 dark:shadow-[0_16px_48px_rgba(0,0,0,.34)]"><button onClick={() => zoomAtCenter(-0.1)} aria-label="Zoom out" className="grid h-12 w-12 place-items-center hover:bg-[#f4f2ff] dark:hover:bg-white/[.06]"><Minus className="h-4 w-4" /></button><button onClick={() => fitContent()} title="Fit content" className="h-12 min-w-[76px] border-x border-[#e5e5ed] px-3 text-sm font-bold hover:bg-[#f4f2ff] dark:border-white/[.09] dark:hover:bg-white/[.06]">{Math.round(viewport.scale * 100)}%</button><button onClick={() => zoomAtCenter(0.1)} aria-label="Zoom in" className="grid h-12 w-12 place-items-center hover:bg-[#f4f2ff] dark:hover:bg-white/[.06]"><Plus className="h-4 w-4" /></button><button onClick={() => fitWorkspace()} aria-label="Fit workspace" title="Fit entire workspace" className="grid h-12 w-12 place-items-center border-l border-[#e5e5ed] hover:bg-[#f4f2ff] dark:border-white/[.09] dark:hover:bg-white/[.06]"><Maximize2 className="h-4 w-4" /></button></div>
    </main>
  );
}
