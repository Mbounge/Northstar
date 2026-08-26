"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AppWindow,
  Bold,
  ChevronDown,
  Circle,
  Copy,
  Diamond,
  EyeOff,
  Grid3X3,
  Hand,
  Group,
  Image as ImageIcon,
  Italic,
  Layers3,
  Lock,
  MessageSquare,
  Minus,
  Moon,
  MousePointer2,
  Palette,
  Pencil,
  Plus,
  Shapes,
  Slash,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Redo2,
  RotateCw,
  Settings2,
  Ungroup,
  Unlock,
  Upload,
  Sun,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import {
  CanvasV2CanvasScene,
  type CanvasV2CanvasSceneHandle,
  type CanvasV2TransientGeometry,
} from "@/components/canvas-v2/canvas-scene";
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
import { buildCanvasV2ConnectorGeometry, canvasV2ConnectorBoundaryAnchor, type CanvasV2ConnectorPoint, type CanvasV2ConnectorVariant } from "@/lib/canvas-v2/connector-geometry";
import { readCanvasV2BoardObjectGraph, type CanvasV2BoardObject } from "@/lib/canvas-v2/board-object-graph";
import { resolveCanvasV2ContextToolbarPosition } from "@/lib/canvas-v2/context-toolbar-placement";
import {
  applyCanvasV2ManualMutation,
  describeCanvasV2ManualMutation,
  type CanvasV2ManualMutation,
  type CanvasV2ManualPoint,
  type CanvasV2EditableStyleProperty,
  type CanvasV2ManualPrimitive,
  type CanvasV2ShapeVariant,
} from "@/lib/canvas-v2/manual-mutations";
import {
  applyCanvasV2NativeSceneMutation,
  canvasV2NativeSceneSelectionContainsTarget,
  serializeCanvasV2NativeScene,
  type CanvasV2NativeSceneDocument,
} from "@/lib/canvas-v2/native-scene";
import {
  canvasV2BoundsIntersect,
  constrainCanvasV2ResizeAspectRatio,
  canvasV2RotationFromPointer,
  scaleCanvasV2FontSize,
  scaleCanvasV2ObjectBounds,
  snapCanvasV2ObjectDelta,
  translateCanvasV2ObjectBounds,
  unionCanvasV2ObjectBounds,
  type CanvasV2SnapGuide,
} from "@/lib/canvas-v2/object-interaction";
import { discardObsoleteCanvasV2LocalState } from "@/lib/canvas-v2/session-lifecycle";
import { buildCanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";
import {
  CANVAS_V2_WORKSPACE,
  CANVAS_V2_EMPTY_INSETS,
  canvasV2FrameableSceneBounds,
  canvasV2NavigationAtmosphere,
  canvasV2NormalizedWheelDelta,
  canvasV2TrackpadPanDelta,
  canvasV2TrackpadZoomScale,
  canvasV2ViewportPlacementAnchor,
  canvasV2VisibleWorkspaceBounds,
  centeredCanvasV2WorkspaceOrigin,
  centeredCanvasV2WorkspaceViewport,
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
type CanvasTool = "select" | "pan" | "draw";
type HumanAuthoringTab = "basics" | "shapes" | "diagram" | "connectors" | "media";

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
  hasDragged: boolean;
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

interface CanvasV2ObjectMenu {
  x: number;
  y: number;
}

interface CanvasV2PrimitiveDrag {
  primitive: CanvasV2ManualPrimitive;
  shapeVariant?: CanvasV2ShapeVariant;
  connectorVariant?: CanvasV2ConnectorVariant;
}

interface CanvasV2ConnectorGesture {
  kind: "endpoint" | "curve";
  pointerId: number;
  nodeId: string;
  endpoint?: "from" | "to";
  variant: CanvasV2ConnectorVariant;
  start: CanvasV2ConnectorPoint;
  end: CanvasV2ConnectorPoint;
  control: CanvasV2ConnectorPoint;
  draftPoint: CanvasV2ConnectorPoint;
  attachNodeId?: string;
  originalAttachNodeId?: string;
}

interface CanvasV2DrawingGesture {
  pointerId: number;
  points: CanvasV2ManualPoint[];
}

interface DirectGesturePreview {
  bounds: CanvasV2InspectableElement["bounds"];
  elementBounds: Record<string, CanvasV2InspectableElement["bounds"]>;
  rotations?: Record<string, number>;
  guides?: CanvasV2SnapGuide[];
}

function transientGeometryForDirectGesture(
  gesture: DirectGesture,
  preview: DirectGesturePreview,
): Readonly<Record<string, CanvasV2TransientGeometry>> {
  return Object.fromEntries(gesture.originals.flatMap((item) => {
    const next = preview.elementBounds[item.nodeId];
    const rotation = preview.rotations?.[item.nodeId];
    if (!next && rotation === undefined) return [];
    return [[item.nodeId, {
      kind: gesture.kind,
      deltaX: next ? next.x - item.bounds.x : 0,
      deltaY: next ? next.y - item.bounds.y : 0,
      ...(gesture.kind === "resize" && next ? { width: next.width, height: next.height } : {}),
      ...(gesture.kind === "resize" && next && item.textEditable && item.visualStyle?.fontSize
        ? { fontSize: scaleCanvasV2FontSize(Number.parseFloat(item.visualStyle.fontSize), gesture.original, gesture.draftBounds) }
        : {}),
      ...(rotation !== undefined ? { rotation } : {}),
    } satisfies CanvasV2TransientGeometry]];
  }));
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
      && candidate.connector?.variant === item.connector?.variant
      && candidate.connector?.from.x === item.connector?.from.x
      && candidate.connector?.from.y === item.connector?.from.y
      && candidate.connector?.from.attachedNodeId === item.connector?.from.attachedNodeId
      && candidate.connector?.to.x === item.connector?.to.x
      && candidate.connector?.to.y === item.connector?.to.y
      && candidate.connector?.to.attachedNodeId === item.connector?.to.attachedNodeId
      && candidate.connector?.bend === item.connector?.bend
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
    const connector = node.kind === "connector" ? (() => {
      const numberAttribute = (name: string, fallback: number) => {
        const value = Number(node.attributes[name]);
        return Number.isFinite(value) ? value : fallback;
      };
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
      ...(connector ? { connector } : {}),
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
  { label: "Note", icon: StickyNote, primitive: "note" as const },
  { label: "Shape", icon: Circle, primitive: "shape" as const },
  { label: "Connector", icon: Workflow, primitive: "connector" as const, connectorVariant: "arrow" as const },
];

const HUMAN_AUTHORING_ITEMS: ReadonlyArray<{
  label: string;
  description: string;
  icon: typeof Square;
  primitive: CanvasV2ManualPrimitive;
  shapeVariant?: CanvasV2ShapeVariant;
  connectorVariant?: CanvasV2ConnectorVariant;
  tab: HumanAuthoringTab;
}> = [
  { label: "Text", description: "Editable type", icon: Type, primitive: "text", tab: "basics" },
  { label: "Note", description: "Quick thought", icon: StickyNote, primitive: "note", tab: "basics" },
  { label: "Rectangle", description: "Rounded card", icon: Square, primitive: "shape", shapeVariant: "rectangle", tab: "shapes" },
  { label: "Ellipse", description: "Circle or oval", icon: Circle, primitive: "shape", shapeVariant: "ellipse", tab: "shapes" },
  { label: "Diamond", description: "Decision point", icon: Diamond, primitive: "shape", shapeVariant: "diamond", tab: "shapes" },
  { label: "Triangle", description: "Direction", icon: Shapes, primitive: "shape", shapeVariant: "triangle", tab: "shapes" },
  { label: "Pill", description: "Status or label", icon: Circle, primitive: "shape", shapeVariant: "pill", tab: "shapes" },
  { label: "Frame", description: "Section boundary", icon: Square, primitive: "frame", tab: "diagram" },
  { label: "Divider", description: "Independent line", icon: Slash, primitive: "line", tab: "diagram" },
  { label: "Straight", description: "Two-ended relationship", icon: Minus, primitive: "connector", connectorVariant: "straight", tab: "connectors" },
  { label: "Arrow", description: "Directional relationship", icon: Workflow, primitive: "connector", connectorVariant: "arrow", tab: "connectors" },
  { label: "Curve", description: "Adjustable relationship", icon: Workflow, primitive: "connector", connectorVariant: "curve", tab: "connectors" },
  { label: "Drawing", description: "Paint directly on canvas", icon: Pencil, primitive: "drawing", tab: "media" },
];

const HUMAN_AUTHORING_TABS: ReadonlyArray<{ id: HumanAuthoringTab; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "shapes", label: "Shapes" },
  { id: "diagram", label: "Diagram" },
  { id: "connectors", label: "Connectors" },
  { id: "media", label: "Media" },
];

function primitiveSilhouette(input: CanvasV2PrimitiveDrag): { width: number; height: number; style: CSSProperties } {
  const paint = "rgba(109,89,237,.24)";
  const stroke = "rgba(109,89,237,.92)";
  if (input.primitive === "text") return { width: 112, height: 34, style: { borderBottom: `3px solid ${stroke}`, background: "linear-gradient(transparent 38%, rgba(109,89,237,.13) 38%)" } };
  if (input.primitive === "note") return { width: 92, height: 76, style: { border: "1px solid #c9aa37", borderRadius: 7, background: "rgba(255,232,116,.72)", boxShadow: "0 8px 22px rgba(71,59,10,.16)" } };
  if (input.primitive === "frame") return { width: 126, height: 84, style: { border: `2px solid ${stroke}`, borderRadius: 14, background: "rgba(255,255,255,.55)" } };
  if (input.primitive === "line" || input.primitive === "connector") return { width: 128, height: 4, style: { borderRadius: 99, background: stroke, boxShadow: "0 0 0 8px rgba(109,89,237,.06)" } };
  if (input.primitive === "table") return { width: 120, height: 72, style: { border: `2px solid ${stroke}`, borderRadius: 7, backgroundImage: `linear-gradient(90deg, transparent 49%, ${stroke} 49%, ${stroke} 51%, transparent 51%),linear-gradient(transparent 49%, ${stroke} 49%, ${stroke} 51%, transparent 51%)`, backgroundColor: "rgba(255,255,255,.72)" } };
  if (input.primitive === "drawing") return { width: 120, height: 54, style: { borderBottom: `5px solid ${stroke}`, borderRadius: "20% 80% 35% 65%", rotate: "-8deg" } };
  if (input.primitive === "image") return { width: 120, height: 82, style: { border: `2px solid ${stroke}`, borderRadius: 11, background: "linear-gradient(145deg,rgba(109,89,237,.08),rgba(109,89,237,.28))" } };
  const variant = input.shapeVariant ?? "rectangle";
  const wide = variant === "pill";
  return {
    width: wide ? 112 : 74,
    height: wide ? 46 : 74,
    style: {
      border: `2px solid ${stroke}`,
      background: paint,
      borderRadius: variant === "ellipse" || variant === "pill" ? 999 : 14,
      ...(variant === "diamond" ? { clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)", borderRadius: 5 } : {}),
      ...(variant === "triangle" ? { clipPath: "polygon(50% 0,100% 100%,0 100%)", borderRadius: 0 } : {}),
    },
  };
}

function CanvasV2PrimitiveThumbnail({ input, drag = false }: { input: CanvasV2PrimitiveDrag; drag?: boolean }) {
  const stroke = drag ? "rgba(92,72,226,.96)" : "#7661f3";
  const fill = drag ? "rgba(118,97,243,.28)" : "rgba(118,97,243,.2)";
  const common = { fill, stroke, strokeWidth: drag ? 3 : 2.5, vectorEffect: "non-scaling-stroke" as const };
  if (input.primitive === "shape") {
    const variant = input.shapeVariant ?? "rectangle";
    if (variant === "pill") return <svg aria-hidden viewBox="0 0 140 72" className="h-full w-full overflow-visible"><rect x="4" y="8" width="132" height="56" rx="28" {...common} /></svg>;
    return <svg aria-hidden viewBox="0 0 100 100" className="h-full w-full overflow-visible">
      {variant === "ellipse" ? <ellipse cx="50" cy="50" rx="42" ry="42" {...common} />
        : variant === "diamond" ? <polygon points="50,5 95,50 50,95 5,50" {...common} />
          : variant === "triangle" ? <polygon points="50,5 95,92 5,92" {...common} />
            : <rect x="6" y="8" width="88" height="84" rx="22" {...common} />}
    </svg>;
  }
  if (input.primitive === "line") return <svg aria-hidden viewBox="0 0 160 48" className="h-full w-full overflow-visible"><line x1="12" y1="24" x2="148" y2="24" stroke="#7661f3" strokeOpacity=".13" strokeWidth="13" strokeLinecap="round" /><line x1="12" y1="24" x2="148" y2="24" stroke={stroke} strokeWidth="5" strokeLinecap="round" /><circle cx="12" cy="24" r="4" fill="#8f7fff" /><circle cx="148" cy="24" r="4" fill="#5a43db" /></svg>;
  if (input.primitive === "connector") {
    const variant = input.connectorVariant ?? "arrow";
    const path = variant === "curve" ? "M12 35 Q80 -3 148 35" : "M12 24 L148 24";
    return <svg aria-hidden viewBox="0 0 160 48" className="h-full w-full overflow-visible"><path d={path} fill="none" stroke="#7661f3" strokeOpacity=".12" strokeWidth="13" strokeLinecap="round" /><path d={path} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" /><circle cx="12" cy={variant === "curve" ? 35 : 24} r="6.5" fill="white" stroke={stroke} strokeWidth="3" />{variant === "arrow" ? <path d="M135 12l14 12-14 12" fill="white" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : <circle cx="148" cy={variant === "curve" ? 35 : 24} r="6.5" fill="white" stroke={stroke} strokeWidth="3" />}{variant === "curve" && <><line x1="80" y1="8" x2="80" y2="22" stroke={stroke} strokeOpacity=".28" strokeDasharray="3 3" /><circle cx="80" cy="8" r="4" fill={stroke} /></>}</svg>;
  }
  if (input.primitive === "frame") return <svg aria-hidden viewBox="0 0 140 92" className="h-full w-full overflow-visible"><rect x="5" y="5" width="130" height="82" rx="15" fill="rgba(255,255,255,.5)" stroke={stroke} strokeWidth="3" strokeDasharray="8 5" /></svg>;
  if (input.primitive === "table") return <svg aria-hidden viewBox="0 0 140 88" className="h-full w-full overflow-visible"><rect x="5" y="5" width="130" height="78" rx="10" fill="rgba(255,255,255,.65)" stroke={stroke} strokeWidth="3" /><path d="M70 5v78M5 44h130" stroke={stroke} strokeWidth="2.5" /></svg>;
  if (input.primitive === "drawing") return <svg aria-hidden viewBox="0 0 140 70" className="h-full w-full overflow-visible"><path d="M6 47C24 8 38 64 59 28s29 36 48 2 22 8 27 14" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (input.primitive === "note") return <div aria-hidden className="h-full w-full rounded-[9px] border border-[#d3b13f] bg-[#fff0a0] shadow-[0_8px_20px_rgba(84,69,10,.15)]"><span className="mx-auto mt-4 block h-1 w-2/3 rounded-full bg-[#9a822e]/35" /><span className="mx-auto mt-2 block h-1 w-1/2 rounded-full bg-[#9a822e]/25" /></div>;
  if (input.primitive === "text") return <div aria-hidden className="flex h-full w-full items-end border-b-[3px] border-[#7661f3] pb-1 text-left text-3xl font-black tracking-tight text-[#5545c8]">Aa</div>;
  return <div aria-hidden className="grid h-full w-full place-items-center rounded-xl border-2 border-[#7661f3] bg-[#7661f3]/10 text-[#6653e8]"><ImageIcon className="h-7 w-7" /></div>;
}

const CANVAS_COLOR_SWATCH_ROWS = [
  [
    { label: "Ink", value: "#1f1f20" },
    { label: "Graphite", value: "#8d8d8d" },
    { label: "Vermilion", value: "#ff4f2e" },
    { label: "Orange", value: "#ffa23f" },
    { label: "Sunflower", value: "#ffc84b" },
    { label: "Green", value: "#62d378" },
    { label: "Teal", value: "#57cec8" },
    { label: "Blue", value: "#42a8ee" },
    { label: "Violet", value: "#874cf2" },
    { label: "Pink", value: "#f044b5" },
    { label: "White", value: "#ffffff" },
  ],
  [
    { label: "Silver", value: "#bdbdbd" },
    { label: "Cloud", value: "#e3e3e3" },
    { label: "Blush", value: "#ffc4bf" },
    { label: "Peach", value: "#ffe0c4" },
    { label: "Butter", value: "#ffe9b8" },
    { label: "Mint", value: "#c9efd1" },
    { label: "Sea glass", value: "#c6efed" },
    { label: "Sky", value: "#c5e3f7" },
    { label: "Lavender", value: "#d9cef7" },
    { label: "Rose", value: "#f6c9e6" },
  ],
] as const;

// Keep the previous symbol alive for one Fast Refresh boundary. A dev server
// can briefly execute the previous render closure after accepting the module's
// new constants; retaining this read-only alias prevents an HMR-only crash.
const CANVAS_COLOR_SWATCHES = CANVAS_COLOR_SWATCH_ROWS.flat().map((swatch) => ({ ...swatch, preview: swatch.value }));
void CANVAS_COLOR_SWATCHES;

function normalizedPaletteColor(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map((character) => character.repeat(2)).join("")}`;
  }
  const rgb = normalized.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 1)) return normalized;
  return `#${rgb.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Math.round(Number(channel)))).toString(16).padStart(2, "0")).join("")}`;
}

const TEXT_STYLE_OPTIONS = [
  { label: "Simple", value: "Inter,ui-sans-serif,system-ui,sans-serif" },
  { label: "Bookish", value: "Georgia,serif" },
  { label: "Technical", value: "ui-monospace,SFMono-Regular,monospace" },
] as const;

const TEXT_SIZE_OPTIONS = [12, 16, 20, 24, 28, 32, 40, 48, 64, 80] as const;
const CANVAS_V2_GRID_PREFERENCE_KEY = "northstar.canvas-v2.show-grid.v1";

function canvasV2SvgCursor(svg: string, hotspot: { x: number; y: number }, fallback: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot.x} ${hotspot.y}, ${fallback}`;
}

const CANVAS_V2_SELECT_CURSOR = canvasV2SvgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="42" height="44" viewBox="0 0 42 44">
  <defs><filter id="s" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#65a8ff" flood-opacity=".5"/><feDropShadow dx="0" dy="1" stdDeviation=".8" flood-color="#111827" flood-opacity=".42"/></filter></defs>
  <path filter="url(#s)" d="M10 9 32 19.8l-9.2 3.3-3.5 9.7L10 9Z" fill="#07080a" stroke="#fff" stroke-opacity=".9" stroke-width="1.8" stroke-linejoin="round"/>
</svg>`, { x: 10, y: 9 }, "default");

const CANVAS_V2_DRAWING_CURSOR = canvasV2SvgCursor(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="46" viewBox="0 0 44 46">
  <defs><filter id="s" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="2" stdDeviation="2.8" flood-color="#111827" flood-opacity=".34"/></filter></defs>
  <path filter="url(#s)" d="m10 36 4.4-13.3L28.2 8.9a2.2 2.2 0 0 1 3.1 0l4 4a2.2 2.2 0 0 1 0 3.1L21.5 29.8 10 36Z" fill="#07080a" stroke="#fff" stroke-opacity=".9" stroke-width="1.8" stroke-linejoin="round"/>
</svg>`, { x: 10, y: 36 }, "crosshair");

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
  const [authoringTab, setAuthoringTab] = useState<HumanAuthoringTab>("shapes");
  const [chatOpen, setChatOpen] = useState(true);
  const [northStarMenuOpen, setNorthStarMenuOpen] = useState(false);
  const [showCanvasGrid, setShowCanvasGrid] = useState(false);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [hoveredElement, setHoveredElement] = useState<CanvasV2InspectableElement>();
  const [selectedElements, setSelectedElements] = useState<CanvasV2InspectableElement[]>([]);
  const selectedElement = selectedElements[selectedElements.length - 1];
  const [editingNodeId, setEditingNodeId] = useState<string>();
  // Conversation and run lifecycle belong to the workspace, not to the
  // collapsible presentation panel. Closing the panel or visiting Apps must
  // never discard a routing request, transcript, selected model, or the turn
  // that is following the active design loop.
  const [selectionTarget, setSelectionTarget] = useState<string>();
  const [historySelectionRestore, setHistorySelectionRestore] = useState<{ revisionId: string; nodeIds: string[] }>();
  const [sceneElements, setSceneElements] = useState<CanvasV2InspectableElement[]>([]);
  const [marquee, setMarquee] = useState<MarqueeGesture>();
  const [mutationError, setMutationError] = useState<string>();
  const [layersOpen, setLayersOpen] = useState(false);
  const [objectMenu, setObjectMenu] = useState<CanvasV2ObjectMenu>();
  const [toolbarMenu, setToolbarMenu] = useState<"color" | "font" | "size" | "image" | "more">();
  const [colorProperty, setColorProperty] = useState<CanvasV2EditableStyleProperty>("background-color");
  const [customColorDraft, setCustomColorDraft] = useState("#6d59ed");
  const [altTextDraft, setAltTextDraft] = useState("");
  const [toolbarSize, setToolbarSize] = useState({ width: 420, height: 58 });
  // A fresh board opens at the origin of its large world plane. This is a one-time camera
  // bootstrap; after the first measured frame, navigation belongs exclusively
  // to the person and AI commits never pan or zoom it.
  const [viewport, setViewport] = useState<CanvasV2WorkspaceViewport>(() => centeredCanvasV2WorkspaceViewport({ width: 1_440, height: 900 }));
  const viewportRef = useRef(viewport);
  const renderedViewportRef = useRef(viewport);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 1_440, height: 900 });
  const workspaceSizeRef = useRef(workspaceSize);
  const workspaceOriginRef = useRef({ left: 0, top: 0 });
  const initialCameraCenteredRef = useRef(false);
  const [spacePan, setSpacePan] = useState(false);
  const [canvasGeometry, setCanvasGeometry] = useState<CanvasV2CanvasGeometry>(CANVAS_V2_MIN_CANVAS);
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceSurfaceRef = useRef<HTMLDivElement>(null);
  const canvasSceneRef = useRef<CanvasV2CanvasSceneHandle>(null);
  const selectionOverlayRef = useRef<HTMLDivElement>(null);
  const selectionMemberOverlayRefs = useRef(new Map<string, HTMLDivElement>());
  const snapGuideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const marqueeElementRef = useRef<HTMLDivElement>(null);
  const gridOverlayRef = useRef<HTMLDivElement>(null);
  const zoomPercentageRef = useRef<HTMLButtonElement>(null);
  const canvasMenuRef = useRef<HTMLDivElement>(null);
  const northStarMenuRef = useRef<HTMLDivElement>(null);
  const statusPillRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLElement>(null);
  const contextualToolbarRef = useRef<HTMLElement>(null);
  const activeSelectionBoundsRef = useRef<CanvasV2InspectableElement["bounds"] | undefined>(undefined);
  const objectMenuRef = useRef<HTMLDivElement>(null);
  const localImageInputRef = useRef<HTMLInputElement>(null);
  const imageReplaceTargetRef = useRef<string | undefined>(undefined);
  const localImageUrlsRef = useRef(new Set<string>());
  const dragSilhouetteRef = useRef<HTMLDivElement>(null);
  const primitiveDragRef = useRef<CanvasV2PrimitiveDrag | undefined>(undefined);
  const [primitiveDrag, setPrimitiveDrag] = useState<CanvasV2PrimitiveDrag>();
  const connectorGestureRef = useRef<CanvasV2ConnectorGesture | undefined>(undefined);
  const connectorPreviewPathRef = useRef<SVGPathElement>(null);
  const connectorPreviewEndRef = useRef<SVGPolylineElement>(null);
  const connectorStartHandleRef = useRef<HTMLButtonElement>(null);
  const connectorEndHandleRef = useRef<HTMLButtonElement>(null);
  const connectorCurveHandleRef = useRef<HTMLButtonElement>(null);
  const connectorGestureElementRef = useRef<{ element: HTMLElement; visibility: string } | undefined>(undefined);
  const drawingGestureRef = useRef<CanvasV2DrawingGesture | undefined>(undefined);
  const drawingPreviewRef = useRef<SVGPolylineElement>(null);
  const geometryRef = useRef(canvasGeometry);
  const panRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | undefined>(undefined);
  const directGestureRef = useRef<DirectGesture | undefined>(undefined);
  const marqueeRef = useRef<MarqueeGesture | undefined>(undefined);
  const viewportPreviewFrameRef = useRef<number | undefined>(undefined);
  const wheelCommitTimerRef = useRef<number | undefined>(undefined);
  const pendingViewportRef = useRef<CanvasV2WorkspaceViewport | undefined>(undefined);
  const gesturePreviewFrameRef = useRef<number | undefined>(undefined);
  const pendingGesturePreviewRef = useRef<DirectGesturePreview | undefined>(undefined);
  const marqueePreviewFrameRef = useRef<number | undefined>(undefined);
  const updateDirectGestureHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number, constrain?: boolean) => boolean>(() => false);
  const finishDirectGestureHandlerRef = useRef<(pointerId: number) => boolean>(() => false);
  const updateConnectorGestureHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number) => boolean>(() => false);
  const finishConnectorGestureHandlerRef = useRef<(pointerId: number) => boolean>(() => false);
  const startDrawingGestureHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number) => boolean>(() => false);
  const updateDrawingGestureHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number) => boolean>(() => false);
  const finishDrawingGestureHandlerRef = useRef<(pointerId: number, clientX?: number, clientY?: number) => boolean>(() => false);
  const workspaceKeydownHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const workspaceKeyupHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const workspaceWheelHandlerRef = useRef<(event: globalThis.WheelEvent) => void>(() => undefined);
  const sceneElementsRef = useRef<CanvasV2InspectableElement[]>([]);
  const internalClipboardRef = useRef<{ nodeIds: string[]; cut: boolean }>({ nodeIds: [], cut: false });
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    try {
      setShowCanvasGrid(window.localStorage.getItem(CANVAS_V2_GRID_PREFERENCE_KEY) === "true");
    } catch {
      // A restricted storage environment keeps the intentional default: off.
    }
  }, []);

  useEffect(() => {
    if (!northStarMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (northStarMenuRef.current?.contains(target) || canvasMenuRef.current?.contains(target))) return;
      setNorthStarMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNorthStarMenuOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [northStarMenuOpen]);

  useEffect(() => {
    if (!objectMenu) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && objectMenuRef.current?.contains(target)) return;
      setObjectMenu(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setObjectMenu(undefined);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [objectMenu]);

  useEffect(() => () => {
    for (const url of localImageUrlsRef.current) URL.revokeObjectURL(url);
    localImageUrlsRef.current.clear();
  }, []);

  const setCanvasGridVisible = useCallback((visible: boolean) => {
    setShowCanvasGrid(visible);
    try {
      window.localStorage.setItem(CANVAS_V2_GRID_PREFERENCE_KEY, String(visible));
    } catch {
      // The visual preference still applies for the current session.
    }
  }, []);
  useLayoutEffect(() => {
    viewportRef.current = viewport;
    renderedViewportRef.current = viewport;
    if (contextualToolbarRef.current) contextualToolbarRef.current.style.transform = "";
  }, [viewport]);
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const update = () => {
      const bounds = workspace.getBoundingClientRect();
      workspaceOriginRef.current = { left: bounds.left, top: bounds.top };
      const next = { width: workspace.clientWidth, height: workspace.clientHeight };
      if (!next.width || !next.height) return;
      workspaceSizeRef.current = next;
      setWorkspaceSize((current) => current.width === next.width && current.height === next.height ? current : next);
      if (!initialCameraCenteredRef.current) {
        initialCameraCenteredRef.current = true;
        const centered = centeredCanvasV2WorkspaceViewport(next, viewportRef.current.scale);
        viewportRef.current = centered;
        setViewport(centered);
      }
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(workspace);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
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
    setHistorySelectionRestore(undefined);
    setEditingNodeId(intent?.directEdit && element ? element.nodeId : undefined);
    setSelectedElements((current) => {
      if (!element) return [];
      if (!intent?.additive) return [element];
      return current.some((item) => item.nodeId === element.nodeId)
        ? current.filter((item) => item.nodeId !== element.nodeId)
        : [...current, element];
    });
    setSelectionTarget(element?.nodeId);
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
    if (historySelectionRestore?.revisionId === engine.committed.id) {
      setSelectionTarget(primary?.nodeId);
      setHistorySelectionRestore(undefined);
    }
  }, [engine.committed.id, historySelectionRestore]);
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
    const rect = workspaceOriginRef.current;
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

  const chat = useCanvasV2Chat({
    endpoint: routerEndpoint,
    engine,
    selection: selectedElement,
    selections: selectedElements,
    getWorkingContext: (selectionPolicy) => buildCanvasV2WorkingContext({
      scene: engine.readNativeScene(),
      selections: selectedElements,
      visibleBounds: canvasV2VisibleWorkspaceBounds(viewportRef.current, workspaceSizeRef.current, contentInsets()),
      viewport: viewportRef.current,
      selectionPolicy,
    }),
  });

  const applyViewportVisual = useCallback((next: CanvasV2WorkspaceViewport) => {
    const surface = workspaceSurfaceRef.current;
    if (surface) {
      surface.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
    const grid = gridOverlayRef.current;
    if (grid) {
      grid.style.backgroundSize = `${CANVAS_V2_WORKSPACE.grid * next.scale}px ${CANVAS_V2_WORKSPACE.grid * next.scale}px`;
      grid.style.backgroundPosition = `${next.x}px ${next.y}px`;
    }
    if (zoomPercentageRef.current) zoomPercentageRef.current.textContent = `${Math.round(next.scale * 100)}%`;
    const toolbar = contextualToolbarRef.current;
    const selection = activeSelectionBoundsRef.current;
    if (toolbar && selection) {
      const rendered = renderedViewportRef.current;
      const placement = toolbar.dataset.placement;
      if (placement === "dock") toolbar.style.transform = "";
      else {
        const anchorX = selection.x + selection.width / 2;
        const anchorY = placement === "above" ? selection.y
          : placement === "below" ? selection.y + selection.height
            : selection.y + selection.height / 2;
        const deltaX = next.x + anchorX * next.scale - (rendered.x + anchorX * rendered.scale);
        const deltaY = next.y + anchorY * next.scale - (rendered.y + anchorY * rendered.scale);
        // Tailwind's -translate-x-1/2 owns the CSS `translate` longhand used to
        // center this inspector. A separate transform preserves that centering
        // while following the selected object on every camera preview frame.
        toolbar.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
      }
      toolbar.style.visibility = "";
    }
    const workspace = workspaceRef.current;
    if (workspace) {
      // Camera preview is a hot path. Cached ResizeObserver geometry avoids a
      // DOM read after the surface write, which would force synchronous layout
      // on every trackpad frame.
      const atmosphere = canvasV2NavigationAtmosphere(next, workspaceSizeRef.current, CANVAS_V2_EMPTY_INSETS);
      workspace.style.setProperty("--canvas-v2-atmosphere-primary-x", `${atmosphere.primaryX}%`);
      workspace.style.setProperty("--canvas-v2-atmosphere-primary-y", `${atmosphere.primaryY}%`);
      workspace.style.setProperty("--canvas-v2-atmosphere-secondary-x", `${atmosphere.secondaryX}%`);
      workspace.style.setProperty("--canvas-v2-atmosphere-secondary-y", `${atmosphere.secondaryY}%`);
      workspace.style.setProperty("--canvas-v2-atmosphere-angle", `${atmosphere.angle}deg`);
      const frame = Number(workspace.dataset.canvasV2CameraPreviewFrame ?? "0") + 1;
      workspace.dataset.canvasV2CameraPreviewFrame = String(frame);
    }
  }, []);

  const stopPendingViewportFrame = useCallback(() => {
    if (viewportPreviewFrameRef.current !== undefined) cancelAnimationFrame(viewportPreviewFrameRef.current);
    viewportPreviewFrameRef.current = undefined;
    pendingViewportRef.current = undefined;
  }, []);

  const commitViewport = useCallback((update: CanvasV2WorkspaceViewport | ((current: CanvasV2WorkspaceViewport) => CanvasV2WorkspaceViewport)) => {
    stopPendingViewportFrame();
    const current = viewportRef.current;
    const next = typeof update === "function" ? update(current) : update;
    viewportRef.current = next;
    applyViewportVisual(next);
    setViewport((rendered) => rendered.x === next.x && rendered.y === next.y && rendered.scale === next.scale ? rendered : next);
  }, [applyViewportVisual, stopPendingViewportFrame]);

  const previewViewport = useCallback((update: CanvasV2WorkspaceViewport | ((current: CanvasV2WorkspaceViewport) => CanvasV2WorkspaceViewport)) => {
    const current = viewportRef.current;
    const next = typeof update === "function" ? update(current) : update;
    viewportRef.current = next;
    pendingViewportRef.current = next;
    if (viewportPreviewFrameRef.current === undefined) {
      viewportPreviewFrameRef.current = requestAnimationFrame(() => {
        viewportPreviewFrameRef.current = undefined;
        const pending = pendingViewportRef.current;
        pendingViewportRef.current = undefined;
        if (pending) applyViewportVisual(pending);
      });
    }
    return next;
  }, [applyViewportVisual]);

  const beginCameraPreview = useCallback(() => {
    const workspace = workspaceRef.current;
    if (workspace) workspace.dataset.canvasV2CameraPreview = "active";
  }, []);

  const finishCameraPreview = useCallback(() => {
    if (wheelCommitTimerRef.current !== undefined) clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = undefined;
    const next = viewportRef.current;
    if (viewportPreviewFrameRef.current !== undefined) cancelAnimationFrame(viewportPreviewFrameRef.current);
    viewportPreviewFrameRef.current = undefined;
    pendingViewportRef.current = undefined;
    applyViewportVisual(next);
    setViewport((rendered) => rendered.x === next.x && rendered.y === next.y && rendered.scale === next.scale ? rendered : next);
    const workspace = workspaceRef.current;
    if (workspace) delete workspace.dataset.canvasV2CameraPreview;
  }, [applyViewportVisual]);

  const scheduleWheelCommit = useCallback(() => {
    if (wheelCommitTimerRef.current !== undefined) clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = window.setTimeout(finishCameraPreview, 96);
  }, [finishCameraPreview]);

  useEffect(() => () => {
    if (viewportPreviewFrameRef.current !== undefined) cancelAnimationFrame(viewportPreviewFrameRef.current);
    if (gesturePreviewFrameRef.current !== undefined) cancelAnimationFrame(gesturePreviewFrameRef.current);
    if (marqueePreviewFrameRef.current !== undefined) cancelAnimationFrame(marqueePreviewFrameRef.current);
    if (wheelCommitTimerRef.current !== undefined) clearTimeout(wheelCommitTimerRef.current);
  }, []);

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
    const constrained = constrainCanvasV2WorkspaceViewport(candidate, workspaceSizeRef.current, CANVAS_V2_EMPTY_INSETS);
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
  }, []);

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

  const receiveGeometry = useCallback((geometry: CanvasV2CanvasGeometry) => {
    geometryRef.current = geometry;
    setCanvasGeometry(geometry);
    // Geometry is observation metadata, not a second camera authority. Earlier
    // builds fitted this legacy document rectangle after the scene snapshot,
    // overwriting the AI-safe frame and causing visible zoom jumps, edge-clung
    // work, and occasional partially painted Chromium layers.
  }, []);

  const preferredAiPlacement = useMemo(() => canvasV2ViewportPlacementAnchor(
    viewport,
    workspaceSize,
    contentInsets(),
    120,
  ), [contentInsets, viewport, workspaceSize]);

  const navigationAtmosphere = useMemo(() => canvasV2NavigationAtmosphere(
    viewport,
    workspaceSize,
    contentInsets(),
  ), [contentInsets, viewport, workspaceSize]);

  const zoomAtCenter = (factor: number) => {
    claimCameraForUser();
    const camera = workspaceSizeRef.current;
    const insets = contentInsets();
    const anchor = {
      x: insets.left + (camera.width - insets.left - insets.right) / 2,
      y: insets.top + (camera.height - insets.top - insets.bottom) / 2,
    };
    commitViewport((current) => zoomViewportAtPoint(current, current.scale * factor, anchor));
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    claimCameraForUser();
    if (tool === "draw" && !spacePan && event.button === 0) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      startDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      return;
    }
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
    const current = viewportRef.current;
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: current.x, originY: current.y };
    beginCameraPreview();
  };

  const forwardedWorkspacePointer = useCallback((event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean }) => {
    if (event.phase === "down") claimCameraForUser();
    const activeDrawing = drawingGestureRef.current?.pointerId === event.pointerId;
    if (tool === "draw" && !spacePan && (event.button === 0 || activeDrawing)) {
      if (event.phase === "down") startDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      else if (event.phase === "move") updateDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      else finishDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      return;
    }
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
        publishMarqueePreview();
      } else if (marqueeRef.current?.pointerId === event.pointerId && event.phase === "up") {
        finishMarquee(marqueeRef.current);
      }
      return;
    }
    if (event.phase === "down") {
      const current = viewportRef.current;
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: current.x, originY: current.y };
      beginCameraPreview();
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.phase === "up") {
      panRef.current = undefined;
      finishCameraPreview();
      return;
    }
    previewViewport((current) => constrainViewport({ ...current, x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y }));
  }, [beginCameraPreview, claimCameraForUser, constrainViewport, finishCameraPreview, previewViewport, selectElement, spacePan, tool, workspacePoint]);

  const finishMarquee = (gesture: MarqueeGesture) => {
    if (marqueePreviewFrameRef.current !== undefined) cancelAnimationFrame(marqueePreviewFrameRef.current);
    marqueePreviewFrameRef.current = undefined;
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

  const publishMarqueePreview = () => {
    if (marqueePreviewFrameRef.current !== undefined) return;
    marqueePreviewFrameRef.current = requestAnimationFrame(() => {
      marqueePreviewFrameRef.current = undefined;
      const gesture = marqueeRef.current;
      const marqueeElement = marqueeElementRef.current;
      if (!gesture || !marqueeElement) return;
      const left = Math.min(gesture.screenStart.x, gesture.screenCurrent.x);
      const top = Math.min(gesture.screenStart.y, gesture.screenCurrent.y);
      const width = Math.abs(gesture.screenCurrent.x - gesture.screenStart.x);
      const height = Math.abs(gesture.screenCurrent.y - gesture.screenStart.y);
      marqueeElement.style.left = `${left}px`;
      marqueeElement.style.top = `${top}px`;
      marqueeElement.style.width = `${width}px`;
      marqueeElement.style.height = `${height}px`;
      marqueeElement.style.visibility = width >= 3 || height >= 3 ? "visible" : "hidden";
    });
  };

  const paintSnapGuides = (guides: readonly CanvasV2SnapGuide[]) => {
    for (let index = 0; index < snapGuideRefs.current.length; index += 1) {
      const element = snapGuideRefs.current[index];
      if (!element) continue;
      const guide = guides[index];
      if (!guide) {
        element.style.display = "none";
        continue;
      }
      element.style.display = "block";
      element.style.left = `${guide.axis === "x" ? guide.position : guide.from}px`;
      element.style.top = `${guide.axis === "x" ? guide.from : guide.position}px`;
      element.style.width = `${guide.axis === "x" ? 1 : guide.to - guide.from}px`;
      element.style.height = `${guide.axis === "x" ? guide.to - guide.from : 1}px`;
    }
  };

  const paintSelectionPreview = (gesture: DirectGesture, preview: DirectGesturePreview) => {
    canvasSceneRef.current?.applyTransientGeometry(transientGeometryForDirectGesture(gesture, preview));
    const selection = selectionOverlayRef.current;
    if (selection) {
      selection.style.left = `${preview.bounds.x}px`;
      selection.style.top = `${preview.bounds.y}px`;
      selection.style.width = `${preview.bounds.width}px`;
      selection.style.height = `${preview.bounds.height}px`;
      if (gesture.originals.length === 1) {
        selection.style.setProperty("rotate", `${preview.rotations?.[gesture.originals[0].nodeId] ?? gesture.originals[0].rotation ?? 0}deg`);
      }
    }
    for (const item of gesture.originals) {
      const element = selectionMemberOverlayRefs.current.get(item.nodeId);
      const bounds = preview.elementBounds[item.nodeId];
      if (!element || !bounds) continue;
      element.style.left = `${bounds.x}px`;
      element.style.top = `${bounds.y}px`;
      element.style.width = `${bounds.width}px`;
      element.style.height = `${bounds.height}px`;
      element.style.setProperty("rotate", `${preview.rotations?.[item.nodeId] ?? item.rotation ?? 0}deg`);
    }
    if (gesture.originals.length === 1 && gesture.originals[0].connector) {
      const item = gesture.originals[0];
      const connector = item.connector;
      const next = preview.elementBounds[item.nodeId];
      if (next && connector) {
        const deltaX = next.x - item.bounds.x;
        const deltaY = next.y - item.bounds.y;
        const moveHandle = (handle: HTMLButtonElement | null, point: CanvasV2ConnectorPoint) => {
          if (!handle) return;
          handle.style.left = `${point.x + deltaX}px`;
          handle.style.top = `${point.y + deltaY}px`;
        };
        moveHandle(connectorStartHandleRef.current, connector.from);
        moveHandle(connectorEndHandleRef.current, connector.to);
        moveHandle(connectorCurveHandleRef.current, connector.control);
      }
    }
    paintSnapGuides(preview.guides ?? []);
  };

  const restoreDirectGesturePreview = (gesture: DirectGesture) => {
    canvasSceneRef.current?.applyTransientGeometry();
    const selection = selectionOverlayRef.current;
    if (selection) {
      selection.style.left = `${gesture.original.x}px`;
      selection.style.top = `${gesture.original.y}px`;
      selection.style.width = `${gesture.original.width}px`;
      selection.style.height = `${gesture.original.height}px`;
      if (gesture.originals.length === 1) selection.style.setProperty("rotate", `${gesture.originals[0].rotation ?? 0}deg`);
    }
    for (const item of gesture.originals) {
      const element = selectionMemberOverlayRefs.current.get(item.nodeId);
      if (!element) continue;
      element.style.left = `${item.bounds.x}px`;
      element.style.top = `${item.bounds.y}px`;
      element.style.width = `${item.bounds.width}px`;
      element.style.height = `${item.bounds.height}px`;
      element.style.setProperty("rotate", `${item.rotation ?? 0}deg`);
    }
    if (gesture.originals.length === 1 && gesture.originals[0].connector) {
      const connector = gesture.originals[0].connector;
      const restoreHandle = (handle: HTMLButtonElement | null, point: CanvasV2ConnectorPoint) => {
        if (!handle) return;
        handle.style.left = `${point.x}px`;
        handle.style.top = `${point.y}px`;
      };
      restoreHandle(connectorStartHandleRef.current, connector.from);
      restoreHandle(connectorEndHandleRef.current, connector.to);
      restoreHandle(connectorCurveHandleRef.current, connector.control);
    }
    paintSnapGuides([]);
    if (contextualToolbarRef.current) contextualToolbarRef.current.style.visibility = "";
  };

  const finishDirectGestureChrome = () => {
    paintSnapGuides([]);
    if (contextualToolbarRef.current) contextualToolbarRef.current.style.visibility = "";
  };

  const publishDirectGesturePreview = (preview: DirectGesturePreview) => {
    pendingGesturePreviewRef.current = preview;
    if (gesturePreviewFrameRef.current !== undefined) return;
    gesturePreviewFrameRef.current = requestAnimationFrame(() => {
      gesturePreviewFrameRef.current = undefined;
      const pending = pendingGesturePreviewRef.current;
      pendingGesturePreviewRef.current = undefined;
      const gesture = directGestureRef.current;
      if (!pending || !gesture) return;
      paintSelectionPreview(gesture, pending);
    });
  };

  const cancelDirectGesturePreview = () => {
    if (gesturePreviewFrameRef.current !== undefined) cancelAnimationFrame(gesturePreviewFrameRef.current);
    gesturePreviewFrameRef.current = undefined;
    pendingGesturePreviewRef.current = undefined;
  };

  const updateDirectGesture = (pointerId: number, clientX: number, clientY: number, constrain = false) => {
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
        const rawRotationDelta = ((nextRotation - (directGesture.startRotation ?? nextRotation) + 540) % 360) - 180;
        const rotationDelta = constrain ? Math.round(rawRotationDelta / 15) * 15 : rawRotationDelta;
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
        publishDirectGesturePreview({
          bounds: unionCanvasV2ObjectBounds(Object.values(nextElements)) ?? directGesture.original,
          elementBounds: nextElements,
          rotations,
        });
        return true;
      }
      if (directGesture.kind === "move") {
        // A press is selection until it travels far enough to become a drag.
        // Running snap math at zero movement could otherwise nudge an object
        // on click—and moving an attached connector deliberately detaches both
        // ends. The small screen-space threshold also absorbs pointer jitter.
        if (!directGesture.hasDragged && Math.hypot(clientX - directGesture.startX, clientY - directGesture.startY) < 3) return true;
        directGesture.hasDragged = true;
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
        publishDirectGesturePreview({ bounds: next, elementBounds: nextElements, guides: snapped.guides });
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
      const handle = directGesture.handle ?? "south-east";
      const resized = resizeCanvasV2WorkspaceBounds(directGesture.original, handle, relativeDelta, relativeMinimum);
      const next = constrain
        ? translateCanvasV2WorkspaceBounds(constrainCanvasV2ResizeAspectRatio(directGesture.original, resized, handle), { x: 0, y: 0 })
        : resized;
      const nextElements = Object.fromEntries(directGesture.originals.map((item) => [item.nodeId, scaleCanvasV2ObjectBounds(item.bounds, directGesture.original, next)]));
      directGesture.draftBounds = next;
      directGesture.draftElementBounds = nextElements;
      publishDirectGesturePreview({ bounds: next, elementBounds: nextElements });
      return true;
    }
    return false;
  };

  const finishDirectGesture = (pointerId: number) => {
    const directGesture = directGestureRef.current;
    if (directGesture?.pointerId !== pointerId) return false;
    directGestureRef.current = undefined;
    cancelDirectGesturePreview();
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
          restoreDirectGesturePreview(directGesture);
        } else {
          // Keep the final imperative geometry painted until the committed
          // native scene replaces it in React's layout phase. Clearing it
          // early would expose one frame of the pre-gesture object.
          finishDirectGestureChrome();
        }
      } else {
        restoreDirectGesturePreview(directGesture);
      }
      return true;
    }
    const finalBounds = directGesture.draftBounds;
    const moved = Math.abs(finalBounds.x - directGesture.original.x) >= 0.01
      || Math.abs(finalBounds.y - directGesture.original.y) >= 0.01;
    const resized = Math.abs(finalBounds.width - directGesture.original.width) >= 0.01
      || Math.abs(finalBounds.height - directGesture.original.height) >= 0.01;
    // A pointer down/up with no geometric change is selection, not authorship.
    if (!moved && !resized) {
      if (directGesture.clickSelection) {
        setSelectedElements(directGesture.clickSelection);
        setSelectionTarget(directGesture.clickSelection.at(-1)?.nodeId);
      }
      restoreDirectGesturePreview(directGesture);
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
      restoreDirectGesturePreview(directGesture);
    } else {
      finishDirectGestureChrome();
    }
    return true;
  };

  updateDirectGestureHandlerRef.current = updateDirectGesture;
  finishDirectGestureHandlerRef.current = finishDirectGesture;

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (updateDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY)) return;
    if (updateConnectorGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY)) return;
    if (updateDirectGesture(event.pointerId, event.clientX, event.clientY, event.shiftKey)) return;
    const marqueeGesture = marqueeRef.current;
    if (marqueeGesture?.pointerId === event.pointerId) {
      const next = { ...marqueeGesture, current: workspacePoint(event.clientX, event.clientY), screenCurrent: { x: event.clientX, y: event.clientY } };
      marqueeRef.current = next;
      publishMarqueePreview();
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    previewViewport((current) => constrainViewport({ ...current, x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y }));
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY)) return;
    if (finishConnectorGestureHandlerRef.current(event.pointerId)) return;
    if (finishDirectGesture(event.pointerId)) return;
    if (marqueeRef.current?.pointerId === event.pointerId) {
      finishMarquee(marqueeRef.current);
      return;
    }
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = undefined;
      finishCameraPreview();
    }
  };

  useEffect(() => {
    // Authored objects live inside a same-origin iframe while North Star's
    // floating chrome lives in the parent document. A drag that crosses under
    // the menu, chat panel, status pill, or bottom toolbar therefore leaves the
    // iframe. Keep the gesture owned by the workspace until its terminal
    // pointer event so those overlays never become invisible canvas edges.
    const move = (event: PointerEvent) => {
      const ownsDirect = directGestureRef.current?.pointerId === event.pointerId;
      const ownsConnector = connectorGestureRef.current?.pointerId === event.pointerId;
      const ownsDrawing = drawingGestureRef.current?.pointerId === event.pointerId;
      if (!ownsDirect && !ownsConnector && !ownsDrawing) return;
      event.preventDefault();
      if (ownsDrawing) updateDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      else if (ownsConnector) updateConnectorGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      else updateDirectGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY, event.shiftKey);
    };
    const finish = (event: PointerEvent) => {
      const ownsDirect = directGestureRef.current?.pointerId === event.pointerId;
      const ownsConnector = connectorGestureRef.current?.pointerId === event.pointerId;
      const ownsDrawing = drawingGestureRef.current?.pointerId === event.pointerId;
      if (!ownsDirect && !ownsConnector && !ownsDrawing) return;
      event.preventDefault();
      if (ownsDrawing) finishDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      else if (ownsConnector) finishConnectorGestureHandlerRef.current(event.pointerId);
      else finishDirectGestureHandlerRef.current(event.pointerId);
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
  }, []);

  const startDirectGesture = (kind: DirectGesture["kind"], pointerId: number, clientX: number, clientY: number, elements: CanvasV2InspectableElement[], handle?: CanvasV2ResizeHandle, clickSelection?: CanvasV2InspectableElement[]) => {
    cancelDirectGesturePreview();
    const mutable = elements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    const selectionBounds = unionCanvasV2ObjectBounds(mutable.map((item) => item.bounds));
    if (!mutable.length || !selectionBounds || engine.running || engine.applyingManualEdit) return false;
    const elementBounds = Object.fromEntries(mutable.map((item) => [item.nodeId, item.bounds]));
    const pointer = workspacePoint(clientX, clientY);
    const center = { x: selectionBounds.x + selectionBounds.width / 2, y: selectionBounds.y + selectionBounds.height / 2 };
    directGestureRef.current = { kind, handle, pointerId, startX: clientX, startY: clientY, original: selectionBounds, originals: mutable, startRotation: kind === "rotate" ? canvasV2RotationFromPointer(center, pointer) : undefined, draftBounds: selectionBounds, draftElementBounds: elementBounds, draftRotations: {}, hasDragged: false, clickSelection };
    if (contextualToolbarRef.current) contextualToolbarRef.current.style.visibility = "hidden";
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
    if (tool === "draw" && !spacePan) {
      if (event.phase === "down" && event.button === 0) startDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      else if (event.phase === "move") updateDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      else if (event.phase === "up") finishDrawingGestureHandlerRef.current(event.pointerId, event.clientX, event.clientY);
      return;
    }
    if (event.phase === "move") {
      updateDirectGesture(event.pointerId, event.clientX, event.clientY, Boolean(event.shiftKey));
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
      const atomicMutations = mutation.kind === "batch" ? mutation.mutations : [mutation];
      const createdSelection = atomicMutations.flatMap((item) => item.kind === "create"
        ? [item.nodeId]
        : item.kind === "duplicate"
          ? [item.newNodeId]
          : item.kind === "group"
            ? [item.groupNodeId]
            : []);
      const clearsSelection = atomicMutations.some((item) => item.kind === "delete"
        || item.kind === "ungroup"
        || (item.kind === "visibility" && item.hidden));
      const historySelectionNodeIds = createdSelection.length
        ? createdSelection
        : clearsSelection
          ? []
          : selectedElements.map((item) => item.nodeId);
      if (!engine.applyManualDocument(document, describeCanvasV2ManualMutation(mutation), undefined, nextNativeScene, {
        // Model turns must retain their grounded sources. An explicit human
        // delete is different: user ownership wins, including for a canonical
        // screenshot or an entire selected set of screenshots.
        allowEvidenceRemoval: mutation.kind === "delete"
          || (mutation.kind === "batch" && mutation.mutations.some((item) => item.kind === "delete")),
        selectionNodeIds: historySelectionNodeIds,
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

  const drawingPoint = (clientX: number, clientY: number): CanvasV2ManualPoint => {
    const point = workspacePoint(clientX, clientY);
    return {
      x: Math.max(0, Math.min(CANVAS_V2_WORKSPACE.width, point.x)),
      y: Math.max(0, Math.min(CANVAS_V2_WORKSPACE.height, point.y)),
    };
  };

  const paintDrawingGesture = (gesture: CanvasV2DrawingGesture) => {
    const preview = drawingPreviewRef.current;
    if (!preview) return;
    const visiblePoints = gesture.points.length === 1
      ? [gesture.points[0], { x: gesture.points[0].x + 0.01, y: gesture.points[0].y + 0.01 }]
      : gesture.points;
    preview.setAttribute("points", visiblePoints.map((point) => `${point.x},${point.y}`).join(" "));
    preview.style.visibility = "visible";
  };

  const cancelDrawingGesture = () => {
    drawingGestureRef.current = undefined;
    const preview = drawingPreviewRef.current;
    if (preview) {
      preview.style.visibility = "hidden";
      preview.removeAttribute("points");
    }
  };

  const startDrawingGesture = (pointerId: number, clientX: number, clientY: number) => {
    if (drawingGestureRef.current || !engine.ready || engine.running || engine.applyingManualEdit) return false;
    claimCameraForUser();
    selectElement(undefined);
    const gesture = { pointerId, points: [drawingPoint(clientX, clientY)] };
    drawingGestureRef.current = gesture;
    paintDrawingGesture(gesture);
    workspaceRef.current?.focus({ preventScroll: true });
    return true;
  };

  const updateDrawingGesture = (pointerId: number, clientX: number, clientY: number) => {
    const gesture = drawingGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;
    const point = drawingPoint(clientX, clientY);
    const previous = gesture.points.at(-1)!;
    // One point per roughly 1.25 screen pixels is visually continuous while
    // avoiding an unnecessarily huge scene node during long freehand marks.
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= Math.max(0.75, 1.25 / viewportRef.current.scale)) {
      gesture.points.push(point);
      paintDrawingGesture(gesture);
    }
    return true;
  };

  const finishDrawingGesture = (pointerId: number, clientX?: number, clientY?: number) => {
    const gesture = drawingGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;
    if (clientX !== undefined && clientY !== undefined) updateDrawingGesture(pointerId, clientX, clientY);
    drawingGestureRef.current = undefined;
    const preview = drawingPreviewRef.current;
    if (preview) {
      preview.style.visibility = "hidden";
      preview.removeAttribute("points");
    }
    const points = gesture.points.length === 1
      ? [gesture.points[0], { x: gesture.points[0].x + 0.01, y: gesture.points[0].y + 0.01 }]
      : gesture.points;
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const padding = 8;
    const x = Math.max(0, minX - padding);
    const y = Math.max(0, minY - padding);
    const width = Math.max(16, Math.min(CANVAS_V2_WORKSPACE.width - x, maxX - x + padding));
    const height = Math.max(16, Math.min(CANVAS_V2_WORKSPACE.height - y, maxY - y + padding));
    const localPoints = points.map((point) => ({ x: point.x - x, y: point.y - y }));
    submitMutation({
      kind: "create",
      primitive: "drawing",
      nodeId: `manual-drawing-${Date.now().toString(36)}`,
      x,
      y,
      width,
      height,
      points: localPoints,
    });
    return true;
  };

  startDrawingGestureHandlerRef.current = startDrawingGesture;
  updateDrawingGestureHandlerRef.current = updateDrawingGesture;
  finishDrawingGestureHandlerRef.current = finishDrawingGesture;

  const paintConnectorGesture = (gesture: CanvasV2ConnectorGesture) => {
    const start = gesture.kind === "endpoint" && gesture.endpoint === "from" ? gesture.draftPoint : gesture.start;
    const end = gesture.kind === "endpoint" && gesture.endpoint === "to" ? gesture.draftPoint : gesture.end;
    const geometry = buildCanvasV2ConnectorGeometry({
      start,
      end,
      variant: gesture.variant,
      ...(gesture.variant === "curve" ? { control: gesture.kind === "curve" ? gesture.draftPoint : gesture.control } : {}),
    });
    const path = connectorPreviewPathRef.current;
    if (path) {
      path.style.visibility = "visible";
      path.setAttribute("d", gesture.variant === "curve"
        ? `M ${start.x} ${start.y} Q ${geometry.control.x} ${geometry.control.y} ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
    }
    const arrow = connectorPreviewEndRef.current;
    if (arrow) {
      if (gesture.variant === "arrow") {
        arrow.style.visibility = "visible";
        arrow.setAttribute("points", geometry.arrowPoints.split(" ").map((pair) => {
          const [x, y] = pair.split(",").map(Number);
          return `${x + geometry.bounds.x},${y + geometry.bounds.y}`;
        }).join(" "));
      } else arrow.style.visibility = "hidden";
    }
    const positionHandle = (handle: HTMLButtonElement | null, point: CanvasV2ConnectorPoint) => {
      if (!handle) return;
      handle.style.left = `${point.x}px`;
      handle.style.top = `${point.y}px`;
    };
    positionHandle(connectorStartHandleRef.current, start);
    positionHandle(connectorEndHandleRef.current, end);
    positionHandle(connectorCurveHandleRef.current, geometry.control);
    const activeHandle = gesture.endpoint === "from" ? connectorStartHandleRef.current : connectorEndHandleRef.current;
    if (activeHandle) {
      activeHandle.dataset.attached = gesture.attachNodeId ? "true" : "false";
      activeHandle.style.backgroundColor = gesture.attachNodeId ? "#18a873" : "#ffffff";
      activeHandle.style.boxShadow = gesture.attachNodeId ? "0 0 0 5px rgba(24,168,115,.18)" : "0 0 0 4px rgba(109,89,237,.14)";
    }
  };

  const resetConnectorGesturePreview = () => {
    if (connectorPreviewPathRef.current) connectorPreviewPathRef.current.style.visibility = "hidden";
    if (connectorPreviewEndRef.current) connectorPreviewEndRef.current.style.visibility = "hidden";
    const hiddenConnector = connectorGestureElementRef.current;
    if (hiddenConnector) hiddenConnector.element.style.visibility = hiddenConnector.visibility;
    connectorGestureElementRef.current = undefined;
    if (contextualToolbarRef.current) contextualToolbarRef.current.style.visibility = "";
  };

  const updateConnectorGesture = (pointerId: number, clientX: number, clientY: number) => {
    const gesture = connectorGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;
    const point = workspacePoint(clientX, clientY);
    if (gesture.kind === "curve") {
      gesture.draftPoint = point;
      paintConnectorGesture(gesture);
      return true;
    }
    const other = gesture.endpoint === "from" ? gesture.end : gesture.start;
    const threshold = 18 / viewportRef.current.scale;
    const candidates = sceneElementsRef.current.filter((item) => item.nodeId !== gesture.nodeId
      && item.nodeId !== "canvas"
      && item.kind !== "root"
      && item.kind !== "connector"
      && !item.hidden
      && point.x >= item.bounds.x - threshold
      && point.x <= item.bounds.x + item.bounds.width + threshold
      && point.y >= item.bounds.y - threshold
      && point.y <= item.bounds.y + item.bounds.height + threshold);
    const candidate = candidates.sort((a, b) => {
      const distance = (item: CanvasV2InspectableElement) => Math.hypot(point.x - (item.bounds.x + item.bounds.width / 2), point.y - (item.bounds.y + item.bounds.height / 2));
      return distance(a) - distance(b);
    })[0];
    gesture.attachNodeId = candidate?.nodeId;
    gesture.draftPoint = candidate ? canvasV2ConnectorBoundaryAnchor(candidate.bounds, other) : point;
    paintConnectorGesture(gesture);
    return true;
  };

  const finishConnectorGesture = (pointerId: number) => {
    const gesture = connectorGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;
    connectorGestureRef.current = undefined;
    resetConnectorGesturePreview();
    if (gesture.kind === "curve") {
      if (Math.hypot(gesture.draftPoint.x - gesture.control.x, gesture.draftPoint.y - gesture.control.y) >= 0.01) submitMutation({ kind: "connector-curve", nodeId: gesture.nodeId, x: gesture.draftPoint.x, y: gesture.draftPoint.y });
      return true;
    }
    const original = gesture.endpoint === "from" ? gesture.start : gesture.end;
    const moved = Math.hypot(gesture.draftPoint.x - original.x, gesture.draftPoint.y - original.y) >= 0.01;
    if (moved || gesture.attachNodeId !== gesture.originalAttachNodeId) submitMutation({
      kind: "connector-endpoint",
      nodeId: gesture.nodeId,
      endpoint: gesture.endpoint!,
      x: gesture.draftPoint.x,
      y: gesture.draftPoint.y,
      ...(gesture.attachNodeId ? { attachNodeId: gesture.attachNodeId } : {}),
    });
    return true;
  };

  updateConnectorGestureHandlerRef.current = updateConnectorGesture;
  finishConnectorGestureHandlerRef.current = finishConnectorGesture;

  const beginConnectorGesture = (kind: CanvasV2ConnectorGesture["kind"], event: ReactPointerEvent<HTMLButtonElement>, endpoint?: "from" | "to") => {
    const connector = selectedElement?.connector;
    if (!selectedElement || !connector || selectedElement.locked || engine.running || engine.applyingManualEdit) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    claimCameraForUser();
    // Endpoint and curve controls own their pointer sequence exclusively. A
    // connector was initially selected through the scene's forwarded pointer
    // channel, whose terminal event can race the parent overlay becoming
    // interactive. Retire any leftover selection-only move gesture before the
    // control starts; otherwise its later pointer-up can translate the whole
    // connector and detach the endpoint that was not being edited.
    const staleDirectGesture = directGestureRef.current;
    if (staleDirectGesture) {
      directGestureRef.current = undefined;
      cancelDirectGesturePreview();
      restoreDirectGesturePreview(staleDirectGesture);
    }
    connectorGestureRef.current = {
      kind,
      pointerId: event.pointerId,
      nodeId: selectedElement.nodeId,
      endpoint,
      variant: connector.variant,
      start: connector.from,
      end: connector.to,
      control: connector.control,
      draftPoint: kind === "curve" ? connector.control : endpoint === "from" ? connector.from : connector.to,
      originalAttachNodeId: endpoint === "from" ? connector.from.attachedNodeId : connector.to.attachedNodeId,
      attachNodeId: endpoint === "from" ? connector.from.attachedNodeId : connector.to.attachedNodeId,
    };
    const selectorId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedElement.nodeId) : selectedElement.nodeId.replaceAll('"', '\\"');
    const connectorElement = workspaceSurfaceRef.current?.querySelector<HTMLElement>(`[data-canvas-v2-node-id="${selectorId}"]`);
    if (connectorElement) {
      connectorGestureElementRef.current = { element: connectorElement, visibility: connectorElement.style.visibility };
      connectorElement.style.visibility = "hidden";
    }
    if (contextualToolbarRef.current) contextualToolbarRef.current.style.visibility = "hidden";
    paintConnectorGesture(connectorGestureRef.current);
  };

  const batchForSelection = (label: string, create: (element: CanvasV2InspectableElement, index: number) => Exclude<CanvasV2ManualMutation, { kind: "batch" }> | undefined) => {
    const mutations = selectedElements.flatMap((element, index) => {
      const mutation = create(element, index);
      return mutation ? [mutation] : [];
    });
    if (mutations.length) submitMutation({ kind: "batch", label, mutations });
  };

  const toggleSelectionLock = () => {
    // A mixed selection is one set: the first click locks every unlocked
    // member, and only an entirely locked set toggles back to unlocked.
    const locked = selectedElements.some((item) => !item.locked);
    batchForSelection(
      `${locked ? "Locked" : "Unlocked"} selected objects.`,
      (item) => item.nodeId === "canvas" || item.locked === locked ? undefined : { kind: "lock", nodeId: item.nodeId, locked },
    );
    setToolbarMenu(undefined);
    setObjectMenu(undefined);
  };

  const layerSelection = (direction: "forward" | "backward" | "front" | "back") => {
    const mutable = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    // Backward operations prepend/lower nodes, so reverse the transaction
    // order to retain the selected objects' existing relative stack.
    const ordered = direction === "back" || direction === "backward" ? [...mutable].reverse() : mutable;
    if (!ordered.length) return;
    submitMutation({
      kind: "batch",
      label: `Moved ${ordered.length} selected object${ordered.length === 1 ? "" : "s"} ${direction}.`,
      mutations: ordered.map((item) => ({ kind: "layer", nodeId: item.nodeId, direction })),
    });
    setToolbarMenu(undefined);
    setObjectMenu(undefined);
  };

  const styleSelection = (property: CanvasV2EditableStyleProperty, value: string) => {
    batchForSelection(
      `Updated ${property} for ${selectedElements.length} selected object${selectedElements.length === 1 ? "" : "s"}.`,
      (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "style", nodeId: item.nodeId, property, value },
    );
    setToolbarMenu(undefined);
  };

  const alignObjectSelection = (mode: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    const mutable = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    const bounds = unionCanvasV2ObjectBounds(mutable.map((item) => item.bounds));
    if (!bounds || mutable.length < 2) return;
    const mutations = mutable.map((item) => {
      const horizontal = mode === "left" || mode === "center" || mode === "right";
      const x = mode === "left" ? bounds.x
        : mode === "right" ? bounds.x + bounds.width - item.bounds.width
          : mode === "center" ? bounds.x + (bounds.width - item.bounds.width) / 2 : item.bounds.x;
      const y = mode === "top" ? bounds.y
        : mode === "bottom" ? bounds.y + bounds.height - item.bounds.height
          : mode === "middle" ? bounds.y + (bounds.height - item.bounds.height) / 2 : item.bounds.y;
      return { kind: "move" as const, nodeId: item.nodeId, deltaX: horizontal ? x - item.bounds.x : 0, deltaY: horizontal ? 0 : y - item.bounds.y };
    });
    submitMutation({ kind: "batch", label: `Aligned ${mutable.length} objects ${mode}.`, mutations });
  };

  const distributeObjectSelection = (axis: "horizontal" | "vertical") => {
    const mutable = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    if (mutable.length < 3) return;
    const sorted = [...mutable].sort((left, right) => axis === "horizontal"
      ? left.bounds.x - right.bounds.x
      : left.bounds.y - right.bounds.y);
    const first = sorted[0];
    const last = sorted.at(-1)!;
    const spanStart = axis === "horizontal" ? first.bounds.x : first.bounds.y;
    const spanEnd = axis === "horizontal" ? last.bounds.x + last.bounds.width : last.bounds.y + last.bounds.height;
    const occupied = sorted.reduce((total, item) => total + (axis === "horizontal" ? item.bounds.width : item.bounds.height), 0);
    const gap = (spanEnd - spanStart - occupied) / (sorted.length - 1);
    let cursor = spanStart;
    const mutations = sorted.map((item) => {
      const delta = cursor - (axis === "horizontal" ? item.bounds.x : item.bounds.y);
      cursor += (axis === "horizontal" ? item.bounds.width : item.bounds.height) + gap;
      return { kind: "move" as const, nodeId: item.nodeId, deltaX: axis === "horizontal" ? delta : 0, deltaY: axis === "vertical" ? delta : 0 };
    });
    submitMutation({ kind: "batch", label: `Distributed ${mutable.length} objects ${axis}ly.`, mutations });
  };

  const groupSelection = () => {
    const items = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked);
    const bounds = unionCanvasV2ObjectBounds(items.map((item) => item.bounds));
    if (items.length < 2 || !bounds) return;
    return submitMutation({
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

  const copySelection = () => {
    internalClipboardRef.current = { nodeIds: selectedElements.filter((item) => item.nodeId !== "canvas").map((item) => item.nodeId), cut: false };
    setObjectMenu(undefined);
  };

  const cutSelection = () => {
    const ids = selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked).map((item) => item.nodeId);
    internalClipboardRef.current = { nodeIds: ids, cut: true };
    if (ids.length) {
      batchForSelection(`Cut ${ids.length} objects.`, (item) => ids.includes(item.nodeId) ? { kind: "visibility", nodeId: item.nodeId, hidden: true } : undefined);
      selectElement(undefined);
    }
    setObjectMenu(undefined);
  };

  const pasteClipboard = () => {
    const clipboard = internalClipboardRef.current;
    if (!clipboard.nodeIds.length) return;
    const stamp = Date.now().toString(36);
    const newIds = clipboard.nodeIds.map((nodeId, index) => `${nodeId}-paste-${stamp}-${index}`);
    const mutations = clipboard.nodeIds.flatMap((nodeId, index) => [
      { kind: "duplicate" as const, nodeId, newNodeId: newIds[index] },
      { kind: "visibility" as const, nodeId: newIds[index], hidden: false },
      ...(clipboard.cut ? [{ kind: "delete" as const, nodeId }] : []),
    ]);
    if (submitMutation({
      kind: "batch",
      label: `Pasted ${clipboard.nodeIds.length} objects.`,
      mutations,
    })) internalClipboardRef.current = { nodeIds: newIds, cut: false };
    setObjectMenu(undefined);
  };

  const createPrimitive = (primitive: CanvasV2ManualPrimitive, options: { shapeVariant?: CanvasV2ShapeVariant; connectorVariant?: CanvasV2ConnectorVariant; src?: string; alt?: string; origin?: { x: number; y: number } } = {}) => {
    cancelDrawingGesture();
    setTool("select");
    const suffix = options.shapeVariant ? `-${options.shapeVariant}` : options.connectorVariant ? `-${options.connectorVariant}` : "";
    const nodeId = `manual-${primitive}${suffix}-${Date.now().toString(36)}`;
    const size = primitive === "frame" ? { width: 360, height: 240 }
      : primitive === "note" ? { width: 220, height: 180 }
        : primitive === "shape" && options.shapeVariant === "pill" ? { width: 220, height: 88 }
          : primitive === "shape" ? { width: 160, height: 160 }
        : primitive === "table" ? { width: 480, height: 120 }
          : primitive === "image" ? { width: 320, height: 220 }
            : primitive === "drawing" ? { width: 180, height: 72 }
              : primitive === "line" || primitive === "connector" ? { width: 240, height: 4 }
                : { width: 220, height: 48 };
    const centered = options.origin
      ? { x: options.origin.x - size.width / 2, y: options.origin.y - size.height / 2 }
      : centeredCanvasV2WorkspaceOrigin(size, viewport, cameraSize(), contentInsets());
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
    const connectorTargets = primitive === "connector"
      ? selectedElements.filter((item) => item.nodeId !== "canvas" && !item.locked).slice(-2)
      : [];
    const start = connectorTargets.length === 2
      ? { x: connectorTargets[0].bounds.x + connectorTargets[0].bounds.width / 2, y: connectorTargets[0].bounds.y + connectorTargets[0].bounds.height / 2 }
      : { x: origin.x, y: origin.y };
    const end = connectorTargets.length === 2
      ? { x: connectorTargets[1].bounds.x + connectorTargets[1].bounds.width / 2, y: connectorTargets[1].bounds.y + connectorTargets[1].bounds.height / 2 }
      : { x: origin.x + size.width, y: origin.y };
    return submitMutation({
      kind: "create",
      primitive,
      nodeId,
      x: start.x,
      y: start.y,
      width: size.width,
      height: size.height,
      ...(primitive === "line" || primitive === "connector" ? { endX: end.x, endY: end.y } : {}),
      ...(options.shapeVariant ? { shapeVariant: options.shapeVariant } : {}),
      ...(options.connectorVariant ? { connectorVariant: options.connectorVariant } : {}),
      ...(connectorTargets.length === 2 ? { fromNodeId: connectorTargets[0].nodeId, toNodeId: connectorTargets[1].nodeId } : {}),
      ...(options.src ? { src: options.src, alt: options.alt ?? "" } : {}),
    });
  };

  const chooseLocalImage = (replaceNodeId?: string) => {
    imageReplaceTargetRef.current = replaceNodeId;
    if (localImageInputRef.current) localImageInputRef.current.value = "";
    localImageInputRef.current?.click();
  };

  const addLocalImage = (file: File, origin?: { x: number; y: number }, replaceNodeId?: string) => {
    if (!file.type.startsWith("image/")) {
      setMutationError("Choose an image file to add to the canvas.");
      return false;
    }
    const url = URL.createObjectURL(file);
    const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    const accepted = replaceNodeId
      ? submitMutation({ kind: "image-source", nodeId: replaceNodeId, src: url, alt })
      : createPrimitive("image", { src: url, alt, origin });
    if (accepted) localImageUrlsRef.current.add(url);
    else URL.revokeObjectURL(url);
    return accepted;
  };

  const receiveLocalImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const target = imageReplaceTargetRef.current;
    imageReplaceTargetRef.current = undefined;
    addLocalImage(file, undefined, target);
  };

  const beginPrimitiveDrag = (event: ReactDragEvent<HTMLElement>, primitive: CanvasV2ManualPrimitive, shapeVariant?: CanvasV2ShapeVariant, connectorVariant?: CanvasV2ConnectorVariant) => {
    const payload = { primitive, ...(shapeVariant ? { shapeVariant } : {}), ...(connectorVariant ? { connectorVariant } : {}) };
    primitiveDragRef.current = payload;
    setPrimitiveDrag(payload);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-northstar-canvas-object", JSON.stringify({ primitive, shapeVariant, connectorVariant }));
    event.dataTransfer.setData("text/plain", `North Star ${shapeVariant ?? connectorVariant ?? primitive}`);
    const silhouette = primitiveSilhouette(payload);
    const ghost = document.createElement("div");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.cssText = `position:fixed;left:-1000px;top:-1000px;width:${silhouette.width}px;height:${silhouette.height}px;box-sizing:border-box;`;
    Object.assign(ghost.style, silhouette.style);
    document.body.append(ghost);
    event.dataTransfer.setDragImage(ghost, silhouette.width / 2, silhouette.height / 2);
    window.setTimeout(() => ghost.remove(), 0);
  };

  const clearPrimitiveDrag = () => {
    primitiveDragRef.current = undefined;
    setPrimitiveDrag(undefined);
  };

  const previewCanvasDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const payload = primitiveDragRef.current;
    const preview = dragSilhouetteRef.current;
    if (!payload || !preview) return;
    const silhouette = primitiveSilhouette(payload);
    preview.style.transform = `translate3d(${event.clientX - silhouette.width / 2}px,${event.clientY - silhouette.height / 2}px,0)`;
  };

  const dropOnCanvas = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!engine.ready || engine.running || engine.applyingManualEdit) return;
    const origin = workspacePoint(event.clientX, event.clientY);
    const imageFile = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    clearPrimitiveDrag();
    if (imageFile) {
      addLocalImage(imageFile, origin);
      return;
    }
    const serialized = event.dataTransfer.getData("application/x-northstar-canvas-object");
    if (!serialized) return;
    try {
      const payload = JSON.parse(serialized) as { primitive?: CanvasV2ManualPrimitive; shapeVariant?: CanvasV2ShapeVariant; connectorVariant?: CanvasV2ConnectorVariant };
      if (!payload.primitive || !HUMAN_AUTHORING_ITEMS.some((item) => item.primitive === payload.primitive)) return;
      createPrimitive(payload.primitive, { shapeVariant: payload.shapeVariant, connectorVariant: payload.connectorVariant, origin });
    } catch {
      setMutationError("That object could not be dropped onto the canvas.");
    }
  };

  const openObjectMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = (event.target as HTMLElement).closest<HTMLElement>("[data-canvas-v2-node-id]")?.dataset.canvasV2NodeId;
    const element = nodeId ? sceneElementsRef.current.find((item) => item.nodeId === nodeId) : undefined;
    if (element && !selectedElements.some((item) => item.nodeId === element.nodeId)) selectElement(element);
    else if (!element && selectedElements.length) selectElement(undefined);
    const width = 230;
    const height = element ? 410 : 54;
    setObjectMenu({
      x: Math.max(10, Math.min(window.innerWidth - width - 10, event.clientX)),
      y: Math.max(10, Math.min(window.innerHeight - height - 10, event.clientY)),
    });
  };

  const insertResearchFlow = (app: AppDataApp, flow: AppDataFlow, result: CanvasV2ResearchResult) => {
    try {
      const insertion = insertCanvasV2CanonicalFlow({ document: engine.committed.document, currentEvidence: engine.committed.evidence, app, flow, evidence: result.evidence });
      if (!engine.applyManualDocument(insertion.document, `Inserted the complete ordered ${app.name} ${flow.name} evidence flow.`, insertion.evidence, undefined, { selectionNodeIds: [insertion.laneNodeId] })) throw new Error("Wait for the current revision to finish rendering.");
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
      if (!engine.applyManualDocument(insertion.document, `Inserted ${asset.label} as exact grounded evidence.`, insertion.evidence, undefined, { selectionNodeIds: [insertion.nodeId] })) throw new Error("Wait for the current revision to finish rendering.");
      setPanel("chat");
      setSelectionTarget(insertion.nodeId);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The screenshot could not be inserted.");
    }
  };

  const undoCanvas = () => {
    const restored = engine.undo();
    setEditingNodeId(undefined);
    setSelectedElements([]);
    setSelectionTarget(undefined);
    setToolbarMenu(undefined);
    setHistorySelectionRestore(restored?.selectionNodeIds.length ? {
      revisionId: restored.revisionId,
      nodeIds: restored.selectionNodeIds,
    } : undefined);
  };

  const redoCanvas = () => {
    const restored = engine.redo();
    setEditingNodeId(undefined);
    setSelectedElements([]);
    setSelectionTarget(undefined);
    setToolbarMenu(undefined);
    setHistorySelectionRestore(restored?.selectionNodeIds.length ? {
      revisionId: restored.revisionId,
      nodeIds: restored.selectionNodeIds,
    } : undefined);
  };

  workspaceKeydownHandlerRef.current = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
      const command = event.metaKey || event.ctrlKey;
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePan(true);
      } else if (event.key === "Escape") {
        cancelDrawingGesture();
        if (tool === "draw") setTool("select");
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
        copySelection();
      } else if (command && event.key.toLowerCase() === "x" && selectedElements.length) {
        event.preventDefault();
        cutSelection();
      } else if (command && event.key.toLowerCase() === "v" && internalClipboardRef.current.nodeIds.length) {
        event.preventDefault();
        pasteClipboard();
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
  workspaceKeyupHandlerRef.current = (event: KeyboardEvent) => {
    if (event.code === "Space") setSpacePan(false);
  };

  useEffect(() => {
    // Gesture previews can legitimately render the workspace once per frame.
    // Keep global keyboard listeners stable instead of detaching and attaching
    // them during that work; refs always dispatch to the latest scene state.
    const keydown = (event: KeyboardEvent) => workspaceKeydownHandlerRef.current(event);
    const keyup = (event: KeyboardEvent) => workspaceKeyupHandlerRef.current(event);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, []);

  const navigateWorkspaceWheel = useCallback((event: { clientX: number; clientY: number; deltaX: number; deltaY: number; deltaMode?: number; ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean }) => {
    claimCameraForUser();
    beginCameraPreview();
    const camera = workspaceSizeRef.current;
    const deltaX = canvasV2NormalizedWheelDelta(event.deltaX, event.deltaMode, camera.width);
    const deltaY = canvasV2NormalizedWheelDelta(event.deltaY, event.deltaMode, camera.height);
    if (event.ctrlKey || event.metaKey) {
      const rect = workspaceOriginRef.current;
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      previewViewport((current) => {
        return zoomViewportAtPoint(
          current,
          canvasV2TrackpadZoomScale(current.scale, deltaY),
          { x: localX, y: localY },
        );
      });
    } else {
      const horizontalDelta = canvasV2TrackpadPanDelta(event.shiftKey && Math.abs(deltaX) < 0.01 ? deltaY : deltaX);
      const verticalDelta = canvasV2TrackpadPanDelta(event.shiftKey && Math.abs(deltaX) < 0.01 ? 0 : deltaY);
      previewViewport((current) => constrainViewport({ ...current, x: current.x - horizontalDelta, y: current.y - verticalDelta }));
    }
    scheduleWheelCommit();
  }, [beginCameraPreview, claimCameraForUser, constrainViewport, previewViewport, scheduleWheelCommit, zoomViewportAtPoint]);

  workspaceWheelHandlerRef.current = (event: globalThis.WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    navigateWorkspaceWheel(event);
  };

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    // React's delegated wheel layer cannot guarantee cancellation of native
    // browser pinch zoom on macOS. Own the wheel at the DOM boundary with an
    // explicitly non-passive capture listener so a canvas pinch never scales
    // the whole page. WebKit gesture events are suppressed for the same reason.
    const wheel = (event: globalThis.WheelEvent) => workspaceWheelHandlerRef.current(event);
    const suppressBrowserZoom = (event: Event) => event.preventDefault();
    workspace.addEventListener("wheel", wheel, { capture: true, passive: false });
    workspace.addEventListener("gesturestart", suppressBrowserZoom, { capture: true, passive: false });
    workspace.addEventListener("gesturechange", suppressBrowserZoom, { capture: true, passive: false });
    workspace.addEventListener("gestureend", suppressBrowserZoom, { capture: true, passive: false });
    return () => {
      workspace.removeEventListener("wheel", wheel, true);
      workspace.removeEventListener("gesturestart", suppressBrowserZoom, true);
      workspace.removeEventListener("gesturechange", suppressBrowserZoom, true);
      workspace.removeEventListener("gestureend", suppressBrowserZoom, true);
    };
  }, []);

  const selectionNodeIds = useMemo(() => selectedElements.map((item) => item.nodeId), [selectedElements]);
  const requestedSelectionNodeIds = historySelectionRestore?.revisionId === engine.committed.id
    ? historySelectionRestore.nodeIds
    : selectionNodeIds;
  const activeSelectionBounds = unionCanvasV2ObjectBounds(selectedElements.map((item) => item.bounds));
  const visibleResizeHandles = activeSelectionBounds ? RESIZE_HANDLES.filter(({ handle }) => {
    const screenWidth = activeSelectionBounds.width * viewport.scale;
    const screenHeight = activeSelectionBounds.height * viewport.scale;
    if (screenWidth < 18 && screenHeight < 18) return handle === "south-east";
    if (screenWidth < 18) return handle === "north" || handle === "east" || handle === "south" || handle === "south-east";
    if (screenHeight < 18) return handle === "west" || handle === "south" || handle === "east" || handle === "south-east";
    return true;
  }) : RESIZE_HANDLES;
  const selectionPermanent = selectedElements.some((item) => item.nodeId === "canvas");
  const selectionIsText = Boolean(selectedElements.length === 1 && selectedElement?.textEditable && (
    selectedElement.textPreview !== undefined
    || ["p", "span", "small", "strong", "em", "label", "button", "h1", "h2", "h3", "h4", "h5", "h6"].includes(selectedElement.tagName)
  ));
  const selectionIsImage = selectedElements.length === 1 && selectedElement?.kind === "image";
  const selectionHasStroke = selectedElements.length === 1 && (selectedElement?.kind === "line" || selectedElement?.kind === "connector" || selectedElement?.kind === "drawing");
  const selectionCanFill = selectedElements.length === 1 && !selectionIsText && !selectionIsImage && !selectionHasStroke && !selectionPermanent;
  const selectedVisualStyle = selectedElement?.visualStyle;
  activeSelectionBoundsRef.current = activeSelectionBounds;
  const selectedPaletteValue = normalizedPaletteColor(
    colorProperty === "color" ? selectedVisualStyle?.color
      : colorProperty === "border-color" ? selectedVisualStyle?.borderColor
        : selectedVisualStyle?.backgroundColor,
  );
  const paletteSubject = colorProperty === "color" ? "Text" : colorProperty === "border-color" ? "Border" : selectionHasStroke ? "Stroke" : "Fill";
  const paletteSupportsRemoval = colorProperty !== "color";
  const paletteIsTransparent = selectedPaletteValue === "transparent" || selectedPaletteValue?.startsWith("rgba(");
  const paletteHasNoFill = selectedPaletteValue === "none" || selectedPaletteValue === "unset";
  const sourceNodes = useMemo(() => {
    const selectableIds = new Set(sceneElements.map((element) => element.nodeId));
    const sourceGraph = readCanvasV2BoardObjectGraph(engine.committed.document);
    const sourceById = new Map(sourceGraph.map((node) => [node.nodeId, node]));
    // Layers mirrors the objects a person can actually select on the board.
    // Generated section/flow/island wrappers remain internal layout structure
    // and must not reintroduce implicit groups through an alternate UI path.
    // Explicit user-created groups are selectable scene elements and remain.
    // Compiler-materialized painted lines are selectable as well. They can
    // exist in native truth before the first manual edit serializes them into
    // source, so merge those honest scene objects into Layers immediately.
    const authored = sourceGraph.filter((node) => node.kind !== "root" && selectableIds.has(node.nodeId));
    const authoredIds = new Set(authored.map((node) => node.nodeId));
    const nativeOnly = sceneElements.flatMap<CanvasV2BoardObject>((element) => {
      if (authoredIds.has(element.nodeId) || element.kind === "root") return [];
      const sourceParent = element.parentNodeId ? sourceById.get(element.parentNodeId) : undefined;
      return [{
        nodeId: element.nodeId,
        ...(element.parentNodeId ? { parentNodeId: element.parentNodeId } : {}),
        childNodeIds: sceneElements.filter((candidate) => candidate.parentNodeId === element.nodeId).map((candidate) => candidate.nodeId),
        depth: sourceParent ? sourceParent.depth + 1 : 0,
        tagName: element.tagName,
        kind: element.kind ?? "object",
        label: element.label,
        hidden: element.hidden,
        locked: element.locked,
        userEdited: Boolean(element.userEdited),
        editVersion: element.editVersion ?? 0,
        rotation: element.rotation ?? 0,
        canonicalEvidence: Boolean(element.canonicalEvidence),
      }];
    });
    return [...authored, ...nativeOnly];
  }, [engine.committed, sceneElements]);
  const contextualToolbarPosition = useMemo(() => {
    if (!activeSelectionBounds) return undefined;
    const availableWidth = workspaceRef.current?.clientWidth ?? 1_440;
    const availableHeight = workspaceRef.current?.clientHeight ?? 900;
    const bottomChrome = 92;
    const resolvedToolbarWidth = Math.min(toolbarSize.width, availableWidth - 32);
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
    const chosen = resolveCanvasV2ContextToolbarPosition({
      selection: {
        left: selectionLeft,
        top: selectionTop,
        right: selectionRight,
        bottom: selectionBottom,
      },
      toolbar: { width: resolvedToolbarWidth, height: toolbarSize.height },
      viewport: {
        left: (chatOpen ? 430 : 16) + 12,
        top: 18,
        right: availableWidth - 16,
        bottom: availableHeight - bottomChrome,
      },
      obstacles: occupied,
      chrome,
    });
    return {
      placement: chosen.placement,
      style: { left: chosen.center, top: chosen.top },
    };
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
    <main className="relative h-screen min-h-[680px] overflow-hidden bg-[#fafbff] text-[#181824] transition-colors duration-300 dark:bg-[#0d0e16] dark:text-[#f4f3f8]">
      <p id="canvas-v2-keyboard-help" className="sr-only">Canvas workspace. Use Command or Control plus A to select objects, arrow keys to nudge, Shift plus arrow keys for larger nudges, and Delete to remove unlocked objects.</p>
      <input ref={localImageInputRef} type="file" accept="image/*" onChange={receiveLocalImage} className="sr-only" aria-label="Choose an image for the canvas" />
      {primitiveDrag && (() => {
        const silhouette = primitiveSilhouette(primitiveDrag);
        return <div ref={dragSilhouetteRef} data-testid="canvas-v2-drop-silhouette" aria-hidden className="pointer-events-none fixed left-0 top-0 z-[90] grid place-items-center opacity-80 drop-shadow-[0_12px_18px_rgba(70,56,160,.22)]" style={{ width: silhouette.width, height: silhouette.height, transform: "translate3d(-1000px,-1000px,0)" }}><CanvasV2PrimitiveThumbnail input={primitiveDrag} drag /></div>;
      })()}
      <div ref={canvasMenuRef} className="absolute left-5 top-5 z-50 flex h-14 items-center overflow-hidden rounded-2xl border border-[#dedfea] bg-white shadow-[0_10px_32px_rgba(51,45,95,.13)] dark:border-white/[.1] dark:bg-[#1d1c24] dark:shadow-[0_14px_40px_rgba(0,0,0,.32)]">
        <button
          type="button"
          aria-label="Open North Star menu"
          aria-haspopup="menu"
          aria-expanded={northStarMenuOpen}
          onClick={() => setNorthStarMenuOpen((open) => !open)}
          className={`grid h-14 w-14 place-items-center border-r border-[#e8e8ef] bg-[#181824] text-sm font-black text-white transition dark:border-white/[.08] ${northStarMenuOpen ? "shadow-[inset_0_-3px_0_#7865ff]" : "hover:bg-[#242431]"}`}
        >N</button>
        <button className="flex h-14 items-center gap-3 px-4 text-left" aria-label="Canvas menu">
          <span><span className="block text-[10px] font-black uppercase tracking-[.16em] text-[#8c8c9a] dark:text-[#8e8b99]">North Star</span><span className="block text-sm font-bold tracking-[-.01em]">Untitled canvas</span></span>
          <ChevronDown className="h-4 w-4 text-[#7c7c8a] dark:text-[#9995a5]" />
        </button>
        {!chatOpen && <button aria-label="Open North Star panel" onClick={() => setChatOpen(true)} className="grid h-14 w-12 place-items-center border-l border-[#e8e8ef] text-[#6653e8] hover:bg-[#f2efff] dark:border-white/[.08] dark:text-[#b4a9ff] dark:hover:bg-white/[.06]"><MessageSquare className="h-4 w-4" /></button>}
      </div>

      {northStarMenuOpen && (
        <div
          ref={northStarMenuRef}
          role="menu"
          aria-label="North Star settings"
          data-testid="canvas-v2-northstar-menu"
          className="absolute left-5 top-[84px] z-[60] w-[310px] overflow-hidden rounded-[22px] border border-[#ddddea] bg-white/95 p-2.5 shadow-[0_24px_70px_rgba(49,42,104,.2)] backdrop-blur-xl dark:border-white/[.11] dark:bg-[#1a1922]/95 dark:shadow-[0_28px_80px_rgba(0,0,0,.46)]"
        >
          <div className="px-3 pb-2 pt-2">
            <span className="block text-[10px] font-black uppercase tracking-[.18em] text-[#7562ed] dark:text-[#aa9cff]">North Star</span>
            <span className="mt-1 block text-sm font-bold tracking-[-.01em] text-[#242430] dark:text-[#f4f2f8]">Canvas preferences</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showCanvasGrid}
            onClick={() => setCanvasGridVisible(!showCanvasGrid)}
            className="flex w-full items-center gap-3 rounded-[16px] border border-[#e8e7f0] bg-[#fafaff] px-3 py-3 text-left transition hover:border-[#cfc8ff] hover:bg-[#f5f2ff] dark:border-white/[.08] dark:bg-white/[.045] dark:hover:border-[#7665d8] dark:hover:bg-white/[.075]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#ece8ff] text-[#6653e8] dark:bg-[#302b48] dark:text-[#b6aaff]"><Grid3X3 className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-[#333340] dark:text-[#f0eef5]">Show canvas grid</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-[#82818f] dark:text-[#a6a2af]">Overlay the precision grid on the canvas.</span>
            </span>
            <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${showCanvasGrid ? "bg-[#6d59ed]" : "bg-[#d7d6df] dark:bg-[#4a4755]"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${showCanvasGrid ? "translate-x-6" : "translate-x-1"}`} />
            </span>
          </button>
        </div>
      )}

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

        {panel === "chat" ? <CanvasV2ChatPanel chat={chat} engine={engine} selection={selectedElement} selections={selectedElements} /> : panel === "apps" ? <CanvasV2ResearchPanel endpoint={researchEndpoint} busy={engine.running || engine.applyingManualEdit} onInsertFlow={insertResearchFlow} onInsertScreen={insertResearchScreen} /> : <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
          <div className="flex items-end justify-between px-1"><div><span className="text-[10px] font-black uppercase tracking-[.18em] text-[#735fef] dark:text-[#aa9cff]">Object library</span><h2 className="mt-1 text-base font-black tracking-[-.02em]">Add to canvas</h2></div><span className="pb-0.5 text-[10px] font-semibold text-[#92919e] dark:text-[#8f8b99]">Click or drag</span></div>
          <div role="tablist" aria-label="Object library categories" className="mt-4 grid grid-cols-5 gap-1 rounded-[14px] bg-[#f2f1f6] p-1 dark:bg-white/[.05]">
            {HUMAN_AUTHORING_TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={authoringTab === item.id} onClick={() => setAuthoringTab(item.id)} className={`h-8 rounded-[10px] text-[10px] font-black transition ${authoringTab === item.id ? "bg-white text-[#5545c8] shadow-[0_2px_9px_rgba(45,41,78,.1)] dark:bg-white/[.12] dark:text-[#c8c0ff]" : "text-[#858391] hover:text-[#4e4d58] dark:text-[#928e9d] dark:hover:text-[#d4d1da]"}`}>{item.label}</button>)}
          </div>
          <div className={`mt-4 grid min-h-0 flex-1 content-start overflow-y-auto px-1 pb-3 ${authoringTab === "connectors" ? "grid-cols-3 gap-x-2 gap-y-5" : "grid-cols-3 gap-x-2 gap-y-4"}`}>
            {HUMAN_AUTHORING_ITEMS.filter((item) => item.tab === authoringTab).map(({ label, primitive, shapeVariant, connectorVariant }) => {
              const payload = { primitive, ...(shapeVariant ? { shapeVariant } : {}), ...(connectorVariant ? { connectorVariant } : {}) };
              const silhouette = primitiveSilhouette(payload);
              const relationship = primitive === "line" || primitive === "connector";
              if (primitive === "drawing") return <button key={label} type="button" aria-label="Drawing" aria-pressed={tool === "draw"} onClick={() => { selectElement(undefined); setTool("draw"); setChatOpen(false); }} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className={`group flex h-[108px] flex-col items-center justify-center bg-transparent text-center transition disabled:opacity-35 ${tool === "draw" ? "text-[#5d49da]" : ""}`}><span className="grid h-[78px] w-full place-items-center"><span className="block h-[54px] w-[96px] transition duration-200 group-hover:scale-110 group-active:scale-95"><CanvasV2PrimitiveThumbnail input={payload} /></span></span><span className="text-[11px] font-black text-[#555362] transition group-hover:text-[#5d49da] dark:text-[#d5d1dc] dark:group-hover:text-[#b8adff]">Drawing</span><span aria-hidden className="mt-1 text-[9px] font-semibold text-[#9996a3] dark:text-[#8f8b99]">Select, then paint</span></button>;
              return <button key={label} type="button" draggable onDragStart={(event) => beginPrimitiveDrag(event, primitive, shapeVariant, connectorVariant)} onDragEnd={clearPrimitiveDrag} onClick={() => createPrimitive(primitive, { shapeVariant, connectorVariant })} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className={`group flex cursor-grab flex-col items-center justify-center bg-transparent text-center transition active:cursor-grabbing disabled:opacity-35 ${relationship ? "h-[132px]" : "h-[108px]"}`}><span className={`grid w-full place-items-center ${relationship ? "h-[92px]" : "h-[78px]"}`}><span className="block transition duration-200 group-hover:scale-110 group-active:scale-95" style={{ width: relationship ? 104 : Math.min(96, silhouette.width * 0.76), height: relationship ? 48 : Math.min(72, silhouette.height * 0.76) }}><CanvasV2PrimitiveThumbnail input={payload} /></span></span><span className="text-[11px] font-black text-[#555362] transition group-hover:text-[#5d49da] dark:text-[#d5d1dc] dark:group-hover:text-[#b8adff]">{label}</span>{relationship && <span className="mt-1 text-[9px] font-semibold text-[#9996a3] dark:text-[#8f8b99]">{primitive === "connector" ? "2 attachable ends" : "Independent"}</span>}</button>;
            })}
            {authoringTab === "media" && <button type="button" onClick={() => chooseLocalImage()} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className="group flex h-[108px] flex-col items-center justify-center bg-transparent text-center disabled:opacity-35"><span className="grid h-[78px] w-full place-items-center"><span className="block h-[64px] w-[88px] transition duration-200 group-hover:scale-110"><CanvasV2PrimitiveThumbnail input={{ primitive: "image" }} /></span></span><span className="text-[11px] font-black text-[#555362] transition group-hover:text-[#5d49da] dark:text-[#d5d1dc] dark:group-hover:text-[#b8adff]">Image</span></button>}
          </div>
          <div className="flex items-center justify-center gap-2 pb-1 pt-2 text-[10px] text-[#94929f] dark:text-[#8f8b99]">{authoringTab === "media" ? <><Pencil className="h-3.5 w-3.5 text-[#7461ea]" />Select Drawing, then paint on canvas</> : <><MousePointer2 className="h-3.5 w-3.5 text-[#7461ea]" />Drag to preview and place precisely</>}</div>
        </div>}
      </aside>}

      <section
        ref={workspaceRef}
        tabIndex={0}
        aria-label="Canvas workspace"
        aria-describedby="canvas-v2-keyboard-help"
        data-canvas-v2-render-count={renderCountRef.current}
        data-canvas-v2-native-wheel-capture="true"
        data-canvas-v2-cursor={tool === "pan" || spacePan ? "pan" : tool}
        className={`absolute inset-0 overflow-clip overscroll-none ${tool === "pan" || spacePan ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{
          "--canvas-v2-atmosphere-primary-x": `${navigationAtmosphere.primaryX}%`,
          "--canvas-v2-atmosphere-primary-y": `${navigationAtmosphere.primaryY}%`,
          "--canvas-v2-atmosphere-secondary-x": `${navigationAtmosphere.secondaryX}%`,
          "--canvas-v2-atmosphere-secondary-y": `${navigationAtmosphere.secondaryY}%`,
          "--canvas-v2-atmosphere-angle": `${navigationAtmosphere.angle}deg`,
          backgroundColor: theme === "dark" ? "#0d0e16" : "#fafbff",
          backgroundImage: theme === "dark"
            ? "radial-gradient(ellipse 82% 72% at var(--canvas-v2-atmosphere-primary-x) var(--canvas-v2-atmosphere-primary-y), rgba(101,82,255,.30) 0%, rgba(67,76,184,.13) 34%, transparent 72%), radial-gradient(ellipse 58% 52% at var(--canvas-v2-atmosphere-secondary-x) var(--canvas-v2-atmosphere-secondary-y), rgba(69,145,255,.08) 0%, transparent 70%), linear-gradient(var(--canvas-v2-atmosphere-angle), #11121d 0%, #0d0e16 54%, #10111b 100%)"
            : "radial-gradient(ellipse 82% 72% at var(--canvas-v2-atmosphere-primary-x) var(--canvas-v2-atmosphere-primary-y), rgba(111,91,246,.22) 0%, rgba(69,145,255,.09) 36%, transparent 72%), radial-gradient(ellipse 58% 52% at var(--canvas-v2-atmosphere-secondary-x) var(--canvas-v2-atmosphere-secondary-y), rgba(74,166,255,.07) 0%, transparent 70%), linear-gradient(var(--canvas-v2-atmosphere-angle), #fbfcff 0%, #f8faff 54%, #ffffff 100%)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%",
          overscrollBehavior: "none",
          touchAction: "none",
          ...(!spacePan && tool === "draw"
            ? { cursor: CANVAS_V2_DRAWING_CURSOR }
            : !spacePan && tool === "select" ? { cursor: CANVAS_V2_SELECT_CURSOR } : {}),
          boxShadow: theme === "dark"
            ? "inset 0 1px 0 rgba(203,198,255,.09)"
            : "inset 0 1px 0 rgba(112,91,237,.13)",
        } as CSSProperties}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onContextMenu={openObjectMenu}
        onDragOver={previewCanvasDrop}
        onDrop={dropOnCanvas}
        onScroll={(event) => {
          // A synchronous JSX boundary complements the lifecycle listener and
          // makes the invariant explicit in tests and during React remounts.
          event.currentTarget.scrollLeft = 0;
          event.currentTarget.scrollTop = 0;
        }}
      >
        {showCanvasGrid && (
          <div
            ref={gridOverlayRef}
            aria-hidden="true"
            data-testid="canvas-v2-grid-overlay"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle, ${theme === "dark" ? "rgba(185,174,255,.2)" : "rgba(109,89,237,.14)"} 1px, transparent 1px)`,
              backgroundSize: `${CANVAS_V2_WORKSPACE.grid * viewportRef.current.scale}px ${CANVAS_V2_WORKSPACE.grid * viewportRef.current.scale}px`,
              backgroundPosition: `${viewportRef.current.x}px ${viewportRef.current.y}px`,
            }}
          />
        )}
        <div
          ref={workspaceSurfaceRef}
          data-testid="canvas-v2-workspace-surface"
          data-canvas-v2-workspace-surface
          className="absolute origin-top-left overflow-visible bg-transparent"
          style={{
            left: 0,
            top: 0,
            width: CANVAS_V2_WORKSPACE.width,
            height: CANVAS_V2_WORKSPACE.height,
            transform: `translate(${viewportRef.current.x}px, ${viewportRef.current.y}px) scale(${viewportRef.current.scale})`,
            transformOrigin: "0 0",
            // Keep a standard 2D transform without will-change/translate3d.
            // That avoids layout-changing left/top writes while still letting
            // Chromium tile the large surface instead of forcing one GPU layer.
            contain: "layout style",
          }}
        >
          <div
            data-canvas-v2-workspace-content
            className="relative overflow-visible"
            style={{ width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height }}
          >
            <CanvasV2CanvasScene
              ref={canvasSceneRef}
              revision={engine.displayed}
              theme={theme}
              onObservation={engine.receiveObservation}
              onCaptureError={engine.captureFailed}
              bare
              framePointerEvents={tool === "pan" || spacePan ? "none" : "auto"}
              inspectionEnabled={tool === "select" && !spacePan}
              selectedNodeId={selectionTarget}
              selectedNodeIds={requestedSelectionNodeIds}
              onElementHover={hoverElement}
              onElementSelect={selectCanvasElement}
              onSelectionRefresh={refreshSelection}
              onSceneSnapshot={receiveScene}
              onNativeScene={engine.receiveNativeScene}
              nativeSceneOverride={engine.nativeScene}
              preferredPlacement={preferredAiPlacement}
              onElementTextCommit={(element, text, nativeContent, layout) => submitMutation({ kind: "text", nodeId: element.nodeId, text, nativeContent, layout })}
              width={CANVAS_V2_WORKSPACE.width}
              height={CANVAS_V2_WORKSPACE.height}
              captureEnabled={false}
              onWorkspaceWheel={navigateWorkspaceWheel}
              onWorkspacePointer={forwardedWorkspacePointer}
              onElementPointer={forwardedElementPointer}
            />
            <svg aria-hidden data-testid="canvas-v2-drawing-preview" viewBox={`0 0 ${CANVAS_V2_WORKSPACE.width} ${CANVAS_V2_WORKSPACE.height}`} className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
              <polyline ref={drawingPreviewRef} fill="none" stroke="#6754de" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" style={{ visibility: "hidden" }} />
            </svg>
            {tool === "select" && selectedElements.length === 0 && hoveredElement && hoveredElement.nodeId !== "canvas" && hoveredElement.kind !== "root" && hoveredElement.kind !== "connector" && !selectionNodeIds.includes(hoveredElement.nodeId) && <div aria-hidden className="pointer-events-none absolute border border-[#8d7cff]/70 bg-[#7661f3]/[.025]" style={{ left: hoveredElement.bounds.x, top: hoveredElement.bounds.y, width: hoveredElement.bounds.width, height: hoveredElement.bounds.height }} />}
            {!editingNodeId && selectedElements.length > 1 && selectedElements.map((element) => <div
              key={element.nodeId}
              ref={(node) => {
                if (node) selectionMemberOverlayRefs.current.set(element.nodeId, node);
                else selectionMemberOverlayRefs.current.delete(element.nodeId);
              }}
              aria-hidden
              className="pointer-events-none absolute border border-[#8d7cff]/70"
              style={{ left: element.bounds.x, top: element.bounds.y, width: element.bounds.width, height: element.bounds.height, rotate: `${element.rotation ?? 0}deg` }}
            />)}
            {!editingNodeId && selectedElement && activeSelectionBounds && <div ref={selectionOverlayRef} data-testid="canvas-v2-element-selection" className="pointer-events-none absolute border-[#1597f4]" style={{ left: activeSelectionBounds.x, top: activeSelectionBounds.y, width: activeSelectionBounds.width, height: activeSelectionBounds.height, borderWidth: selectedElements.length === 1 && selectedElement.kind === "connector" ? 0 : 1 / viewport.scale, rotate: selectedElements.length === 1 ? `${selectedElement.rotation ?? 0}deg` : undefined }}>
              {selectedElements.length > 1 && !selectionPermanent && <button
                type="button"
                aria-label={`Move ${selectedElements.length} selected objects`}
                title="Drag the selection"
                data-testid="canvas-v2-aggregate-drag-surface"
                onPointerDown={(event) => beginDirectGesture("move", event)}
                className="pointer-events-auto absolute inset-0 z-[5] cursor-move bg-transparent"
              />}
              {!selectionPermanent && selectedElement.kind !== "connector" && visibleResizeHandles.map(({ handle, className, cursor }) => <button key={handle} aria-label={`Resize ${selectedElement.nodeId} from ${handle}`} onPointerDown={(event) => beginDirectGesture("resize", event, handle)} style={{ scale: `${0.625 / viewport.scale}` }} className={`pointer-events-auto absolute z-10 h-4 w-4 rounded-sm border-2 border-[#6d5df5] bg-white dark:bg-[#1f1d27] ${className} ${cursor}`} />)}
              {!selectionPermanent && selectedElement.kind !== "connector" && ROTATE_CORNERS.map(({ corner, className, iconClassName }) => {
                // Keep the invisible rotation hit target compact and entirely
                // outside the selected corner. Oversized 28px targets around
                // tiny zoomed-out screens intercepted clicks meant for nearby
                // objects even while no rotate icon was visible.
                const offset = -(14 / viewport.scale + 10);
                return <button key={corner} aria-label={`Rotate selected objects from ${corner}`} title="Drag to rotate" onPointerDown={(event) => beginDirectGesture("rotate", event)} style={{ scale: `${0.6 / viewport.scale}`, ...(corner.includes("west") ? { left: offset } : { right: offset }), ...(corner.includes("north") ? { top: offset } : { bottom: offset }) }} className={`group pointer-events-auto absolute z-20 h-7 w-7 cursor-grab rounded-full bg-transparent active:cursor-grabbing ${className}`}><span className={`pointer-events-none absolute grid h-6 w-6 scale-75 place-items-center rounded-full border border-[#dad6ff] bg-white text-[#6d59ed] opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 dark:border-[#554a89] dark:bg-[#211e2b] dark:text-[#b9adff] ${iconClassName}`}><RotateCw className="h-3.5 w-3.5" /></span></button>;
              })}
            </div>}
            {!editingNodeId && selectedElements.length === 1 && selectedElement?.connector && <>
              <svg aria-hidden className="pointer-events-none absolute inset-0 z-40 overflow-visible" width={CANVAS_V2_WORKSPACE.width} height={CANVAS_V2_WORKSPACE.height}>
                <path ref={connectorPreviewPathRef} data-testid="canvas-v2-connector-gesture-preview" visibility="hidden" fill="none" stroke="#6d59ed" strokeWidth={4} strokeLinecap="round" />
                <polyline ref={connectorPreviewEndRef} visibility="hidden" fill="none" stroke="#6d59ed" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {(["from", "to"] as const).map((endpoint) => {
                const value = selectedElement.connector![endpoint];
                const attached = Boolean(value.attachedNodeId);
                return <button
                  key={endpoint}
                  ref={endpoint === "from" ? connectorStartHandleRef : connectorEndHandleRef}
                  type="button"
                  aria-label={`Move connector ${endpoint === "from" ? "start" : "end"}${attached ? `, attached to ${value.attachedNodeId}` : ", free"}`}
                  title={attached ? `Attached to ${value.attachedNodeId} · drag away to detach` : "Drag onto an object to attach"}
                  data-canvas-v2-connector-endpoint={endpoint}
                  data-attached={attached}
                  onPointerDown={(event) => beginConnectorGesture("endpoint", event, endpoint)}
                  className="pointer-events-auto absolute z-50 h-4 w-4 cursor-crosshair rounded-full border-[3px] border-[#6d59ed] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1597f4]"
                  style={{ left: value.x, top: value.y, transform: `translate(-50%,-50%) scale(${1 / viewport.scale})`, backgroundColor: attached ? "#18a873" : "#ffffff", boxShadow: attached ? "0 0 0 5px rgba(24,168,115,.18)" : "0 0 0 4px rgba(109,89,237,.14)" }}
                />;
              })}
              {selectedElement.connector.variant === "curve" && <button
                ref={connectorCurveHandleRef}
                type="button"
                aria-label="Adjust connector curve"
                title="Drag to adjust the curve"
                data-canvas-v2-connector-curve-handle
                onPointerDown={(event) => beginConnectorGesture("curve", event)}
                className="pointer-events-auto absolute z-50 h-3.5 w-3.5 cursor-move rotate-45 rounded-[3px] border-2 border-white bg-[#6d59ed] shadow-[0_0_0_2px_rgba(109,89,237,.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1597f4]"
                style={{ left: selectedElement.connector.control.x, top: selectedElement.connector.control.y, transform: `translate(-50%,-50%) rotate(45deg) scale(${1 / viewport.scale})` }}
              />}
            </>}
            {[0, 1].map((index) => <div
              key={`snap-guide-${index}`}
              ref={(element) => { snapGuideRefs.current[index] = element; }}
              aria-hidden
              data-canvas-v2-snap-guide={index}
              className="pointer-events-none absolute z-30 hidden bg-[#ef4fb8]"
            />)}
            {engine.running && <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-[#ddd9ff] bg-white/90 px-4 py-2 text-xs font-bold text-[#6652e9] shadow-lg backdrop-blur dark:border-[#5b4f91] dark:bg-[#24212e]/92 dark:text-[#b8adff]">{engine.loop?.status === "thinking" ? "North Star is reviewing" : "Rendering revision"}</div>}
          </div>
        </div>
        {marquee && (
          <div
            ref={marqueeElementRef}
            data-testid="canvas-v2-marquee-selection"
            aria-hidden
            className="pointer-events-none fixed z-[70] border border-[#6d5df5] bg-[#6d5df5]/[.035] shadow-[0_0_0_1px_rgba(255,255,255,.22)_inset]"
            style={{
              left: Math.min(marquee.screenStart.x, marquee.screenCurrent.x),
              top: Math.min(marquee.screenStart.y, marquee.screenCurrent.y),
              width: Math.abs(marquee.screenCurrent.x - marquee.screenStart.x),
              height: Math.abs(marquee.screenCurrent.y - marquee.screenStart.y),
              visibility: "hidden",
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
            relocatablePlacementNodeIds={engine.inspectionRelocatableNodeIds}
            preferredPlacement={preferredAiPlacement}
            bare
            framePointerEvents="none"
          />
        </div>
      )}

      {!editingNodeId && selectedElement && contextualToolbarPosition && !layersOpen && <aside
        ref={contextualToolbarRef}
        aria-label="Element inspector"
        data-testid="canvas-v2-context-toolbar"
        data-placement={contextualToolbarPosition.placement}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          navigateWorkspaceWheel(event);
        }}
        className="absolute z-50 flex min-h-14 max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-1 rounded-[18px] border border-white/[.08] bg-[#1c1c20]/[.98] px-2.5 text-white shadow-[0_18px_60px_rgba(21,18,38,.34)] backdrop-blur-xl"
        style={contextualToolbarPosition.style}
      >
        {selectedElements.length > 1 && <>
          <span className="px-2 text-xs font-bold text-white/75">{selectedElements.length} selected</span>
          <button title="Align left" aria-label="Align selected objects left" onClick={() => alignObjectSelection("left")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignLeft className="h-4 w-4" /></button>
          <button title="Align centers" aria-label="Align selected object centers" onClick={() => alignObjectSelection("center")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignCenter className="h-4 w-4" /></button>
          <button title="Align right" aria-label="Align selected objects right" onClick={() => alignObjectSelection("right")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><AlignRight className="h-4 w-4" /></button>
          <button title="Align top" aria-label="Align selected objects top" onClick={() => alignObjectSelection("top")} className="grid h-9 w-9 place-items-center rounded-xl text-[10px] font-black hover:bg-white/[.1]">T</button>
          <button title="Align middle" aria-label="Align selected object middles" onClick={() => alignObjectSelection("middle")} className="grid h-9 w-9 place-items-center rounded-xl text-[10px] font-black hover:bg-white/[.1]">M</button>
          <button title="Align bottom" aria-label="Align selected objects bottom" onClick={() => alignObjectSelection("bottom")} className="grid h-9 w-9 place-items-center rounded-xl text-[10px] font-black hover:bg-white/[.1]">B</button>
          <button title="Distribute horizontally" aria-label="Distribute selected objects horizontally" onClick={() => distributeObjectSelection("horizontal")} disabled={selectedElements.length < 3} className="h-9 rounded-xl px-2 text-[10px] font-black hover:bg-white/[.1] disabled:opacity-30">H↔</button>
          <button title="Distribute vertically" aria-label="Distribute selected objects vertically" onClick={() => distributeObjectSelection("vertical")} disabled={selectedElements.length < 3} className="h-9 rounded-xl px-2 text-[10px] font-black hover:bg-white/[.1] disabled:opacity-30">V↕</button>
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

        {selectionHasStroke && <button title="Stroke color" aria-label="Change stroke color" onClick={() => { setColorProperty("background-color"); setToolbarMenu((current) => current === "color" ? undefined : "color"); }} className="flex h-9 items-center gap-2 rounded-xl px-2 hover:bg-white/[.1]"><span className="h-1 w-6 rounded-full" style={{ background: selectedVisualStyle?.backgroundColor || "#6754de" }} /><span className="text-xs font-bold">Stroke</span></button>}

        {selectionIsImage && <>
          <ImageIcon className="mx-2 h-4 w-4 text-[#a99cff]" />
          <button title="Show the whole image" aria-label="Contain image" onClick={() => styleSelection("object-fit", "contain")} className={`h-9 rounded-xl px-2 text-xs font-bold hover:bg-white/[.1] ${selectedVisualStyle?.objectFit === "contain" ? "bg-white/[.12]" : ""}`}>Contain</button>
          <button title="Crop image to fill its bounds" aria-label="Crop image to fill" onClick={() => styleSelection("object-fit", "cover")} className={`h-9 rounded-xl px-2 text-xs font-bold hover:bg-white/[.1] ${selectedVisualStyle?.objectFit === "cover" ? "bg-white/[.12]" : ""}`}>Crop</button>
          <button title="Stretch image to fill" aria-label="Stretch image to fill" onClick={() => styleSelection("object-fit", "fill")} className={`h-9 rounded-xl px-2 text-xs font-bold hover:bg-white/[.1] ${selectedVisualStyle?.objectFit === "fill" ? "bg-white/[.12]" : ""}`}>Fill</button>
          {selectedElement.origin === "user" && <button title="Replace local image" aria-label="Replace image" onClick={() => chooseLocalImage(selectedElement.nodeId)} className="h-9 rounded-xl px-2 text-xs font-bold hover:bg-white/[.1]">Replace</button>}
          <button title="Edit image alt text" aria-label="Edit image alt text" onClick={() => { setAltTextDraft(selectedElement.altText ?? ""); setToolbarMenu((current) => current === "image" ? undefined : "image"); }} className="h-9 rounded-xl px-3 text-xs font-bold hover:bg-white/[.1]">Alt text</button>
        </>}

        <div className="mx-1 h-7 w-px bg-white/[.12]" />
        <button title="Duplicate" aria-label="Duplicate selected elements" onClick={duplicateSelection} disabled={selectionPermanent || engine.running || engine.applyingManualEdit} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30"><Copy className="h-4 w-4" /></button>
        {selectedElements.length > 1 ? <button title="Group selection (⌘G)" aria-label="Group selected elements" onClick={groupSelection} disabled={selectionPermanent} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30"><Group className="h-4 w-4" /></button> : selectedElement.kind === "group" ? <button title="Ungroup (⇧⌘G)" aria-label="Ungroup selected elements" onClick={() => submitMutation({ kind: "ungroup", nodeId: selectedElement.nodeId })} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><Ungroup className="h-4 w-4" /></button> : null}
        <button title="Lock or unlock" aria-label="Toggle lock for selected elements" onClick={toggleSelectionLock} disabled={selectionPermanent || engine.running || engine.applyingManualEdit} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30">{selectedElements.every((item) => item.locked) ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</button>
        <button title="Delete" aria-label="Delete selected elements" onClick={() => batchForSelection("Deleted selected objects.", (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "delete", nodeId: item.nodeId })} disabled={selectionPermanent || engine.running || engine.applyingManualEdit || selectedElements.every((item) => item.locked)} className="grid h-9 w-9 place-items-center rounded-xl text-[#ff8f91] hover:bg-red-500/[.14] disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
        <button title="More object actions" aria-label="More object actions" onClick={() => setToolbarMenu((current) => current === "more" ? undefined : "more")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1]"><Settings2 className="h-4 w-4" /></button>
        <button title="Clear selection" aria-label="Clear element selection" onClick={() => selectElement(undefined)} className="grid h-9 w-9 place-items-center rounded-xl text-white/70 hover:bg-white/[.1] hover:text-white"><X className="h-4 w-4" /></button>

        {toolbarMenu === "font" && <div aria-label="Text style menu" className={`absolute left-12 w-[180px] rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-2 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          {TEXT_STYLE_OPTIONS.map((option) => <button key={option.label} onClick={() => styleSelection("font-family", option.value)} className="flex h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold hover:bg-white/[.1]" style={{ fontFamily: option.value }}>{option.label}</button>)}
        </div>}

        {toolbarMenu === "size" && <div aria-label="Font size menu" className={`absolute left-[162px] grid w-[104px] grid-cols-2 gap-1 rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-2 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          {TEXT_SIZE_OPTIONS.map((size) => <button key={size} onClick={() => styleSelection("font-size", `${size}px`)} className="grid h-10 place-items-center rounded-xl text-sm font-bold hover:bg-white/[.1]">{size}</button>)}
        </div>}

        {toolbarMenu === "color" && <div data-testid="canvas-v2-color-palette" aria-label="Color palette" className={`absolute left-1/2 w-[340px] max-w-[calc(100vw-20px)] -translate-x-1/2 overflow-hidden rounded-[16px] border border-white/[.08] bg-[#1d1d1f] text-white shadow-[0_16px_44px_rgba(0,0,0,.42)] ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+7px)]" : "top-[calc(100%+7px)]"}`}>
          <div className="flex min-h-[40px] items-center gap-1 px-2.5 py-1.5">
            <button
              aria-label={`Use solid ${paletteSubject.toLowerCase()}`}
              aria-pressed={!paletteIsTransparent && !paletteHasNoFill}
              onClick={() => styleSelection(colorProperty, /^#[0-9a-f]{6}$/i.test(customColorDraft) ? customColorDraft : "#6d59ed")}
              className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[11px] font-semibold transition ${!paletteIsTransparent && !paletteHasNoFill ? "bg-[#8f46ff] shadow-[0_0_0_1px_#a467ff]" : "hover:bg-white/[.08]"}`}
            >
              <span className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border border-white/90"><span className="h-2 w-2 rounded-[1px] border border-white/75" /></span>
              {paletteSubject}
            </button>
            {paletteSupportsRemoval && <>
              <button aria-label={`Make ${paletteSubject.toLowerCase()} transparent`} aria-pressed={paletteIsTransparent} onClick={() => styleSelection(colorProperty, "transparent")} className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[11px] font-semibold transition ${paletteIsTransparent ? "bg-white/[.12]" : "hover:bg-white/[.08]"}`}>
                <Grid3X3 className="h-3.5 w-3.5" />Transparent
              </button>
              <button aria-label={`Remove ${paletteSubject.toLowerCase()}`} aria-pressed={paletteHasNoFill} onClick={() => styleSelection(colorProperty, selectionHasStroke ? "none" : "unset")} className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[11px] font-semibold transition ${paletteHasNoFill ? "bg-white/[.12]" : "hover:bg-white/[.08]"}`}>
                <Square className="h-3.5 w-3.5" />No {paletteSubject.toLowerCase()}
              </button>
            </>}
          </div>
          <div className="h-px bg-white/[.12]" />
          <div className="space-y-2 px-2.5 py-2.5">
            {CANVAS_COLOR_SWATCH_ROWS.map((row, rowIndex) => <div key={rowIndex} className="grid grid-cols-11 items-center gap-1.5">
              {row.map((swatch) => {
                const selected = selectedPaletteValue === swatch.value;
                return <button
                  key={swatch.label}
                  title={swatch.label}
                  aria-label={`Use ${swatch.label}`}
                  aria-pressed={selected}
                  onClick={() => { setCustomColorDraft(swatch.value.toUpperCase()); styleSelection(colorProperty, swatch.value); }}
                  className={`h-6 w-6 rounded-full border shadow-[0_1px_1px_rgba(0,0,0,.18)_inset] transition hover:scale-110 ${selected ? "border-[#1d1d1f] ring-2 ring-[#934cff] ring-offset-1 ring-offset-[#1d1d1f]" : swatch.value === "#1f1f20" ? "border-white/20" : "border-white/30"}`}
                  style={{ background: swatch.value }}
                />;
              })}
              {rowIndex === 1 && <label title="Choose a custom color" className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-white/30 bg-[conic-gradient(from_90deg,#ff4f4f,#ffd84d,#58dc76,#4dc8ff,#8c5cff,#ff4db8,#ff4f4f)] shadow-inner transition hover:scale-110 hover:border-white/70">
                <span className="absolute inset-[5px] rounded-full bg-white/20 blur-[1px]" />
                <input aria-label="Choose custom color" type="color" value={/^#[0-9a-f]{6}$/i.test(customColorDraft) ? customColorDraft : "#6d59ed"} onChange={(event) => { const value = event.target.value.toUpperCase(); setCustomColorDraft(value); styleSelection(colorProperty, value); }} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>}
            </div>)}
          </div>
        </div>}

        {toolbarMenu === "image" && <form onSubmit={(event) => { event.preventDefault(); submitMutation({ kind: "attribute", nodeId: selectedElement.nodeId, name: "alt", value: altTextDraft }); setToolbarMenu(undefined); }} className={`absolute left-1/2 flex w-[320px] -translate-x-1/2 items-center gap-2 rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-3 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          <input aria-label="Image alt text" value={altTextDraft} onChange={(event) => setAltTextDraft(event.target.value)} placeholder="Describe this image" className="h-10 min-w-0 flex-1 rounded-xl bg-white/[.1] px-3 text-sm outline-none placeholder:text-white/40 focus:ring-2 focus:ring-[#8f7fff]" />
          <button type="submit" className="h-10 rounded-xl bg-[#7158ef] px-4 text-xs font-bold">Save</button>
        </form>}

        {toolbarMenu === "more" && <div aria-label="Object actions" className={`absolute right-0 flex items-center gap-1 rounded-[18px] border border-white/[.1] bg-[#1c1c20] p-2 shadow-2xl ${contextualToolbarPosition.placement === "above" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"}`}>
          <button title="Hide" aria-label="Hide selected elements" onClick={() => batchForSelection("Hid selected objects.", (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "visibility", nodeId: item.nodeId, hidden: true })} disabled={selectionPermanent || engine.running || engine.applyingManualEdit} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[.1] disabled:opacity-30"><EyeOff className="h-4 w-4" /></button>
          <button title="Send backward" aria-label="Send selected objects backward" onClick={() => layerSelection("backward")} disabled={selectionPermanent || selectedElements.every((item) => item.locked)} className="h-9 rounded-xl px-2 text-[11px] font-bold hover:bg-white/[.1] disabled:opacity-30">−1</button>
          <button title="Bring forward" aria-label="Bring selected objects forward" onClick={() => layerSelection("forward")} disabled={selectionPermanent || selectedElements.every((item) => item.locked)} className="h-9 rounded-xl px-2 text-[11px] font-bold hover:bg-white/[.1] disabled:opacity-30">+1</button>
        </div>}
      </aside>}
      {mutationError && <div role="alert" className="absolute right-5 top-[90px] z-50 max-w-[340px] rounded-2xl border border-red-200 bg-white/95 px-4 py-3 text-xs leading-5 text-red-700 shadow-xl backdrop-blur dark:border-red-500/25 dark:bg-[#241d24]/95 dark:text-red-300">{mutationError}</div>}

      {objectMenu && <div ref={objectMenuRef} role="menu" aria-label="Canvas object menu" data-testid="canvas-v2-object-menu" className="absolute z-[70] w-[230px] rounded-[18px] border border-[#ddddea] bg-white/98 p-2 text-xs font-semibold shadow-[0_22px_70px_rgba(44,39,88,.22)] backdrop-blur-xl dark:border-white/[.11] dark:bg-[#1c1b23]/98 dark:shadow-[0_24px_75px_rgba(0,0,0,.48)]" style={{ left: objectMenu.x, top: objectMenu.y }}>
        {selectedElements.length ? <>
          <button role="menuitem" onClick={copySelection} className="flex h-9 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-[#f1eff9] dark:hover:bg-white/[.07]"><span>Copy</span><kbd className="text-[10px] text-[#9694a2]">⌘C</kbd></button>
          <button role="menuitem" onClick={cutSelection} disabled={selectedElements.every((item) => item.locked)} className="flex h-9 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-[#f1eff9] disabled:opacity-35 dark:hover:bg-white/[.07]"><span>Cut</span><kbd className="text-[10px] text-[#9694a2]">⌘X</kbd></button>
          <button role="menuitem" onClick={() => { duplicateSelection(); setObjectMenu(undefined); }} className="flex h-9 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-[#f1eff9] dark:hover:bg-white/[.07]"><span>Duplicate</span><kbd className="text-[10px] text-[#9694a2]">⌘D</kbd></button>
          {selectedElements.length > 1 ? <button role="menuitem" onClick={() => { groupSelection(); setObjectMenu(undefined); }} disabled={selectedElements.filter((item) => !item.locked).length < 2} className="flex h-9 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-[#f1eff9] disabled:opacity-35 dark:hover:bg-white/[.07]"><span>Group</span><kbd className="text-[10px] text-[#9694a2]">⌘G</kbd></button> : selectedElement?.kind === "group" ? <button role="menuitem" onClick={() => { submitMutation({ kind: "ungroup", nodeId: selectedElement.nodeId }); setObjectMenu(undefined); }} className="flex h-9 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-[#f1eff9] dark:hover:bg-white/[.07]"><span>Ungroup</span><kbd className="text-[10px] text-[#9694a2]">⇧⌘G</kbd></button> : null}
          <div className="my-1 h-px bg-[#eceaf1] dark:bg-white/[.08]" />
          <button role="menuitem" onClick={() => layerSelection("front")} disabled={selectedElements.every((item) => item.locked)} className="h-9 w-full rounded-xl px-3 text-left hover:bg-[#f1eff9] disabled:opacity-35 dark:hover:bg-white/[.07]">Bring to front</button>
          <button role="menuitem" onClick={() => layerSelection("back")} disabled={selectedElements.every((item) => item.locked)} className="h-9 w-full rounded-xl px-3 text-left hover:bg-[#f1eff9] disabled:opacity-35 dark:hover:bg-white/[.07]">Send to back</button>
          <button role="menuitem" onClick={toggleSelectionLock} className="h-9 w-full rounded-xl px-3 text-left hover:bg-[#f1eff9] dark:hover:bg-white/[.07]">{selectedElements.every((item) => item.locked) ? "Unlock" : "Lock"}</button>
          <button role="menuitem" onClick={() => { batchForSelection("Hid selected objects.", (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "visibility", nodeId: item.nodeId, hidden: true }); setObjectMenu(undefined); }} disabled={selectedElements.every((item) => item.locked)} className="h-9 w-full rounded-xl px-3 text-left hover:bg-[#f1eff9] disabled:opacity-35 dark:hover:bg-white/[.07]">Hide</button>
          <div className="my-1 h-px bg-[#eceaf1] dark:bg-white/[.08]" />
          <button role="menuitem" onClick={() => { batchForSelection("Deleted selected objects.", (item) => item.nodeId === "canvas" || item.locked ? undefined : { kind: "delete", nodeId: item.nodeId }); setObjectMenu(undefined); }} disabled={selectedElements.every((item) => item.locked)} className="h-9 w-full rounded-xl px-3 text-left text-red-600 hover:bg-red-50 disabled:opacity-35 dark:text-red-300 dark:hover:bg-red-500/[.12]">Delete</button>
        </> : <button role="menuitem" onClick={pasteClipboard} disabled={!internalClipboardRef.current.nodeIds.length} className="flex h-9 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-[#f1eff9] disabled:opacity-35 dark:hover:bg-white/[.07]"><span>Paste</span><kbd className="text-[10px] text-[#9694a2]">⌘V</kbd></button>}
      </div>}

      {layersOpen && <aside aria-label="Layers panel" className="absolute bottom-24 right-6 z-40 max-h-[420px] w-[300px] overflow-hidden rounded-[22px] border border-[#dedfec] bg-white/95 shadow-[0_18px_55px_rgba(50,45,100,.16)] backdrop-blur-xl dark:border-white/[.1] dark:bg-[#1b1a22]/95 dark:shadow-[0_20px_60px_rgba(0,0,0,.35)]"><div className="flex items-center justify-between border-b border-[#e8e8f0] px-4 py-3 dark:border-white/[.08]"><div className="flex items-center gap-2 text-sm font-black"><Layers3 className="h-4 w-4 text-[#6d59ed]" />Objects</div><span className="text-[10px] font-bold text-[#9999a8]">{sourceNodes.length} nodes</span></div><div className="max-h-[350px] overflow-y-auto p-2">{sourceNodes.map((node) => <div key={node.nodeId} style={{ paddingLeft: 8 + Math.min(4, node.depth) * 14 }} className={`flex items-center gap-2 rounded-xl py-2 pr-2 text-xs ${selectionNodeIds.includes(node.nodeId) ? "bg-[#eeeaff] text-[#5744d5] dark:bg-[#302b4a] dark:text-[#c6bdff]" : "hover:bg-[#f6f5fa] dark:hover:bg-white/[.05]"}`}><button onClick={(event) => { const element = sceneElements.find((item) => item.nodeId === node.nodeId); if (element) selectElement(element, { additive: event.shiftKey || event.metaKey, range: event.shiftKey, directEdit: false }); else { setSelectedElements([]); setSelectionTarget(node.nodeId); } setLayersOpen(false); }} disabled={node.hidden} className="min-w-0 flex-1 truncate text-left font-semibold disabled:opacity-40"><span className="mr-2 font-mono text-[9px] uppercase text-[#9999a8]">{node.kind}</span>{node.nodeId}</button><button aria-label={`${node.hidden ? "Show" : "Hide"} ${node.nodeId}`} onClick={() => submitMutation({ kind: "visibility", nodeId: node.nodeId, hidden: !node.hidden })} disabled={node.nodeId === "canvas"} className="text-[#777789] disabled:opacity-25 dark:text-[#a09ca9]">{node.hidden ? "Show" : <EyeOff className="h-3.5 w-3.5" />}</button><button aria-label={`${node.locked ? "Unlock" : "Lock"} ${node.nodeId}`} onClick={() => submitMutation({ kind: "lock", nodeId: node.nodeId, locked: !node.locked })} disabled={node.nodeId === "canvas"} className="text-[#777789] disabled:opacity-25 dark:text-[#a09ca9]">{node.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button></div>)}</div></aside>}

      <div aria-label="Canvas tools" className="absolute bottom-[18px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-[18px] border border-[#dedee8]/90 bg-white/92 p-1.5 shadow-[0_10px_34px_rgba(50,45,100,.15)] backdrop-blur-2xl dark:border-white/[.1] dark:bg-[#1c1b23]/92 dark:shadow-[0_14px_38px_rgba(0,0,0,.34)]">
        <button onClick={undoCanvas} disabled={!engine.canUndo} title="Undo" aria-label="Undo canvas action" className="grid h-10 w-10 place-items-center rounded-[11px] text-[#696979] transition hover:bg-[#f3f2f8] disabled:opacity-25 dark:text-[#aaa6b4] dark:hover:bg-white/[.06]"><Undo2 className="h-[18px] w-[18px]" /></button>
        <button onClick={redoCanvas} disabled={!engine.canRedo} title="Redo" aria-label="Redo canvas action" className="grid h-10 w-10 place-items-center rounded-[11px] text-[#696979] transition hover:bg-[#f3f2f8] disabled:opacity-25 dark:text-[#aaa6b4] dark:hover:bg-white/[.06]"><Redo2 className="h-[18px] w-[18px]" /></button>
        <div className="mx-0.5 h-6 w-px bg-[#e4e3eb] dark:bg-white/[.09]" />
        <button onClick={() => { cancelDrawingGesture(); setTool("select"); }} title="Select" aria-pressed={tool === "select"} className={`grid h-10 w-10 place-items-center rounded-[11px] transition ${tool === "select" ? "bg-[#7257f5] text-white shadow-[0_4px_12px_rgba(93,70,220,.24)]" : "text-[#646474] hover:bg-[#f3f2f8] dark:text-[#aaa6b4] dark:hover:bg-white/[.06]"}`}><MousePointer2 className="h-[19px] w-[19px]" /></button>
        <button onClick={() => { cancelDrawingGesture(); setTool("pan"); }} title="Pan" aria-pressed={tool === "pan"} className={`grid h-10 w-10 place-items-center rounded-[11px] transition ${tool === "pan" ? "bg-[#7257f5] text-white shadow-[0_4px_12px_rgba(93,70,220,.24)]" : "text-[#646474] hover:bg-[#f3f2f8] dark:text-[#aaa6b4] dark:hover:bg-white/[.06]"}`}><Hand className="h-[19px] w-[19px]" /></button>
        <button onClick={() => { selectElement(undefined); setTool("draw"); }} title="Draw freehand" aria-label="Draw freehand" aria-pressed={tool === "draw"} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className={`grid h-10 w-10 place-items-center rounded-[11px] transition disabled:opacity-35 ${tool === "draw" ? "bg-[#7257f5] text-white shadow-[0_4px_12px_rgba(93,70,220,.24)]" : "text-[#646474] hover:bg-[#f3f2f8] dark:text-[#aaa6b4] dark:hover:bg-white/[.06]"}`}><Pencil className="h-[19px] w-[19px]" /></button>
        <div className="mx-0.5 h-6 w-px bg-[#e4e3eb] dark:bg-white/[.09]" />
        {TOOL_ITEMS.map(({ label, icon: Icon, primitive, ...options }) => <button key={label} title={`Create ${label} · drag to place`} draggable onDragStart={(event) => beginPrimitiveDrag(event, primitive, undefined, options.connectorVariant)} onDragEnd={clearPrimitiveDrag} onClick={() => createPrimitive(primitive, options)} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className="grid h-10 w-10 cursor-grab place-items-center rounded-[11px] text-[#686879] transition hover:bg-[#f1effb] hover:text-[#6d59ed] active:cursor-grabbing disabled:opacity-35 dark:text-[#aaa6b4] dark:hover:bg-white/[.06] dark:hover:text-[#b3a7ff]"><Icon className="h-[19px] w-[19px]" /></button>)}
        <button title="Upload image · or drop a file on canvas" onClick={() => chooseLocalImage()} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className="grid h-10 w-10 place-items-center rounded-[11px] text-[#686879] transition hover:bg-[#f1effb] hover:text-[#6d59ed] disabled:opacity-35 dark:text-[#aaa6b4] dark:hover:bg-white/[.06] dark:hover:text-[#b3a7ff]"><Upload className="h-[19px] w-[19px]" /></button>
        <button title="More creation tools" onClick={() => { setPanel("shapes"); setChatOpen(true); }} className="grid h-10 w-10 place-items-center rounded-[11px] text-[#686879] transition hover:bg-[#f1effb] hover:text-[#6d59ed] dark:text-[#aaa6b4] dark:hover:bg-white/[.06] dark:hover:text-[#b3a7ff]"><Plus className="h-[19px] w-[19px]" /></button>
        <div className="mx-0.5 h-6 w-px bg-[#e4e3eb] dark:bg-white/[.09]" />
        <button aria-label="Layers" title="Layers" onClick={() => setLayersOpen((open) => !open)} className={`grid h-10 w-10 place-items-center rounded-[11px] transition ${layersOpen ? "bg-[#ebe7ff] text-[#6650e4] dark:bg-[#302b4a] dark:text-[#b3a7ff]" : "text-[#646474] hover:bg-[#f3f2f8] dark:text-[#aaa6b4] dark:hover:bg-white/[.06]"}`}><Layers3 className="h-[19px] w-[19px]" /></button>
      </div>

      <nav aria-label="Canvas navigation" data-testid="canvas-v2-navigation-controls" className="absolute bottom-[18px] right-[18px] z-40 flex items-center gap-1.5 text-[#4f4f5d] dark:text-[#d7d3df]">
        <div className="flex h-9 items-center overflow-hidden rounded-[12px] border border-[#dedee8]/90 bg-white/92 shadow-[0_8px_24px_rgba(50,45,100,.11)] backdrop-blur-2xl dark:border-white/[.1] dark:bg-[#1c1b23]/92 dark:shadow-[0_10px_28px_rgba(0,0,0,.28)]">
          <button onClick={() => zoomAtCenter(1 / 1.2)} aria-label="Zoom out" title="Zoom out" className="grid h-9 w-9 place-items-center transition hover:bg-[#f1eff9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7763ee] dark:hover:bg-white/[.07]"><Minus className="h-4 w-4" /></button>
          <button ref={zoomPercentageRef} onClick={() => fitContent()} aria-label={`Zoom ${Math.round(viewport.scale * 100)} percent; fit content`} title="Fit content · Pinch to zoom · Two-finger scroll to pan" className="h-9 min-w-[52px] border-x border-[#e7e6ed] px-1.5 text-[11px] font-bold tabular-nums transition hover:bg-[#f1eff9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7763ee] dark:border-white/[.09] dark:hover:bg-white/[.07]">{Math.round(viewportRef.current.scale * 100)}%</button>
          <button onClick={() => zoomAtCenter(1.2)} aria-label="Zoom in" title="Zoom in" className="grid h-9 w-9 place-items-center transition hover:bg-[#f1eff9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7763ee] dark:hover:bg-white/[.07]"><Plus className="h-4 w-4" /></button>
        </div>
      </nav>
    </main>
  );
}
