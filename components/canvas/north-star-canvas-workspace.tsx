// Northstar Canvas Workspace v0.5.4.2 — live-DOM-authoritative artboard sizing on every layout change
// components/canvas/north-star-canvas-workspace.tsx
// Northstar Canvas v0.5.2.4 — one living artboard, continuous semantic mutations, exact geometry after every move.
// Legacy Shapes Atlas remains available for humans until the Patch 4 cutover

"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  memo,
  useRef,
  useState,
  type ReactNode,
  type ChangeEvent,
  type Dispatch,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Unbounded } from "next/font/google";
import {
  AlignLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  Eye,
  GitBranch,
  Hand,
  Info,
  Layers,
  Link2,
  ListChecks,
  Home,
  ImageIcon,
  LayoutGrid,
  Loader2,
  LocateFixed,
  Maximize2,
  Minimize2,
  MessageSquare,
  PenLine,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Square,
  StickyNote,
  Table2,
  TriangleAlert,
  Type,
  Wrench,
  X,
} from "lucide-react";
import { CodeArtifactHost } from "@/components/canvas/artifacts/code-artifact-host";
import {
  NorthstarArchitectureProvider,
  type NorthstarArchitectureContextValue,
} from "@/components/canvas/northstar-architecture-context";
import { NorthstarLedgerInspector } from "@/components/canvas/northstar-ledger-inspector";
import { ThemeToggle } from "@/components/theme-toggle";
import { createPrototypeCodeArtifactPayload } from "@/lib/canvas-artifacts/prototype";
import { createNorthstarDirectBootstrapArtifactPayload } from "@/lib/canvas-artifacts/northstar-direct-bootstrap";
import {
  canPrepareNorthstarProductSurface,
  prepareNorthstarProductSurface,
} from "@/lib/canvas-artifacts/northstar-product-surface";
import {
  applyCanvasCodeArtifactStage,
  createCanvasCodeArtifactPayloadFromPackage,
  isCanvasCodeArtifactActionEnvelope,
  isCanvasCodeArtifactPayload,
  isNorthstarGeneratedCodeArtifactPackage,
  type CanvasCodeArtifactContentSize,
  type CanvasCodeArtifactPayload,
  type CanvasCodeArtifactRuntimeReview,
} from "@/lib/canvas-artifacts/types";
import { createClient } from "@/lib/supabase/client";
import {
  projectNorthstarCommitIntoArtifact,
} from "@/lib/canvas-ai/northstar-transaction-kernel";
import type {
  NorthstarArtboardCommit,
  NorthstarProjectionReceipt,
} from "@/lib/canvas-artifacts/types";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import type {
  NorthstarEphemeralLedger,
  NorthstarLedgerCommit,
  NorthstarLedgerSnapshot,
  NorthstarLedgerTask,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";
import {
  createNorthstarWorkspaceRuntime,
  type NorthstarWorkspaceRuntime,
  type NorthstarWorkspaceRuntimeSnapshot,
} from "@/lib/canvas-architecture/northstar-workspace-runtime";
import { createNorthstarTurnClient } from "@/lib/canvas-ai/northstar-turn-client";
import { mergeNorthstarEvidenceIntoDataBundle } from "@/lib/canvas-ai/northstar-evidence-data-bundle";
import {
  northstarRecoveryKind,
  northstarUserFacingRunMessage,
  resolveNorthstarProductRunBinding,
  routeNorthstarProductMessage,
  type NorthstarProductRunBinding,
} from "@/lib/canvas-ai/northstar-product-routing";
import { serializeNorthstarProjectionState } from "@/lib/canvas-projection/serialize";
import { parseNorthstarProjectionState } from "@/lib/canvas-projection/validation";
import { createNorthstarWindowProjectionSurface } from "@/lib/canvas-projection/window-surface";
import { cn } from "@/lib/utils";

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700"],
});

type CanvasPointerEvent = ReactPointerEvent<Element>;

type NorthstarIconName =
  | "sparkles"
  | "check"
  | "eye"
  | "home"
  | "image"
  | "link"
  | "info"
  | "layers"
  | "search"
  | "pen"
  | "message"
  | "table"
  | "warning"
  | "wrench"
  | "arrow"
  | "plus"
  | "book"
  | "chart"
  | "branch"
  | "list";

interface FreeformPoint {
  x: number;
  y: number;
}

type Tool = "select" | "pan" | "connector";
type WorkspaceTab = "chat" | "shapes" | "apps";

type ConnectorKind = "straight" | "curved" | "elbow";
type ConnectorEnd = "none" | "arrow";
type ConnectorDash = "solid" | "dashed" | "dotted";
type LayerDirection = "front" | "forward" | "backward" | "back";

type BoxTool =
  | "frame"
  | "note"
  | "card"
  | "text"
  | "image"
  | "rect"
  | "ellipse"
  | "circle"
  | "diamond"
  | "triangle"
  | "pill"
  | "callout"
  | "table"
  | "divider"
  | "icon-chip"
  | "icon"
  | "badge"
  | "pin"
  | "freeform"
  | "highlight-region";

type CanvasBoxType = BoxTool | "flow-header" | "visual-board" | "code-artifact";

type ResizeDirection =
  | "n"
  | "e"
  | "s"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

type ConnectorSide = "top" | "right" | "bottom" | "left";
type ColorPopoverMode = "fill" | "stroke" | "text" | null;
type TextAlign = "left" | "center" | "right";

interface CanvasObjectStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  textColor: string;
  fontSize: number;
  fontWeight: number;
  textAlign: TextAlign;
  radius?: number;
  shadow?: string;
  opacity?: number;
}

type CanvasLayoutKind = "freeform" | "horizontal" | "vertical" | "grid";
type CanvasLayoutAlign = "start" | "center" | "end" | "stretch";
type CanvasLayoutJustify = "start" | "center" | "end" | "space-between";
type CanvasComponentPreset =
  | "section"
  | "stack"
  | "rail"
  | "lane"
  | "grid-layout"
  | "cluster"
  | "spine"
  | "shelf"
  | "drawer"
  | "compare-frame"
  | "workspace-frame"
  | "drop-zone"
  | "stage-marker"
  | "source-chip"
  | "confidence-badge"
  | "citation-chip"
  | "screenshot-tile"
  | "metric-tile"
  | "quote-block"
  | "status-pill"
  | "flow-lane"
  | "reference-flow"
  | "evidence-strip"
  | "insight-card"
  | "evidence-card"
  | "metric-card"
  | "decision-card"
  | "recommendation-block"
  | "comparison-matrix"
  | "matrix"
  | "stage-map"
  | "tradeoff-panel"
  | "research-trail"
  | "source-ledger"
  | "hypothesis-panel"
  | "executive-summary"
  | "scorecard"
  | "chart"
  | "timeline"
  | "research-region"
  | "product-concept"
  | "annotation-callout";

interface CanvasLayoutSpec {
  kind: CanvasLayoutKind;
  gap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  columns?: number;
  align?: CanvasLayoutAlign;
  justify?: CanvasLayoutJustify;
  wrap?: boolean;
  overflow?: "visible" | "clip" | "scroll";
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizeBehavior?: "scale" | "reflow";
}

interface CanvasLayoutItemSpec {
  order?: number;
  grow?: number;
  basis?: number;
  span?: number;
  alignSelf?: CanvasLayoutAlign;
  absolute?: boolean;
}


type CanvasObjectSourceKind =
  | "uploaded-image"
  | "pasted-image"
  | "pasted-text"
  | "northstar-screenshot"
  | "northstar-flow"
  | "generated"
  | "manual"
  | "northstar-visual-board"
  | "northstar-code-artifact";

type CanvasFlowType = "onboarding" | "browsing" | "unknown";
type CanvasSurfaceKind = "working" | "presentation" | "freeform";

type CanvasSemanticRole =
  | "flow-app-icon"
  | "flow-app-name"
  | "flow-title"
  | "flow-screen"
  | "single-screen"
  | "user-content"
  | "artifact-frame"
  | "artifact-title"
  | "artifact-subtitle"
  | "artifact-section"
  | "artifact-evidence"
  | "artifact-insight"
  | "artifact-summary"
  | "working-frame"
  | "working-heading"
  | "working-note"
  | "working-evidence"
  | "visual-board"
  | "visual-root"
  | "visual-section"
  | "visual-component"
  | "visual-heading"
  | "visual-body"
  | "visual-app-icon"
  | "visual-flow-lane"
  | "visual-flow-screen"
  | "visual-flow-connector"
  | "visual-stage-badge"
  | "visual-caption"
  | "visual-source-caption"
  | "visual-table-cell"
  | "visual-chart-axis"
  | "visual-chart-label"
  | "visual-callout"
  | "visual-matrix"
  | "visual-chart-bar"
  | "visual-evidence-note"
  | "visual-hypothesis"
  | "visual-decision"
  | "visual-recommendation"
  | "visual-next-step"
  | "visual-research-region"
  | "visual-source"
  | "visual-metric"
  | "visual-timeline"
  | "visual-diagram-node"
  | "visual-insight";

interface CanvasObjectSource {
  kind: CanvasObjectSourceKind;
  appName?: string;
  appIconUrl?: string;
  flowName?: string;
  flowType?: CanvasFlowType;
  screenLabel?: string;
  screenshotFile?: string;
  screenshotUrl?: string;
  sessionId?: string;
  stepIndex?: number;
  originalWidth?: number;
  originalHeight?: number;
  fileName?: string;
}

interface CanvasObjectSemanticMeta {
  artifactId?: string;
  role?: CanvasSemanticRole;
  label?: string;
  sourceObjectId?: string;
  sectionId?: string;
  parentId?: string;
  componentId?: string;
  componentType?: string;
  layoutRole?: "container" | "item" | "label" | "media" | "connector";
  layout?: CanvasLayoutSpec;
  layoutItem?: CanvasLayoutItemSpec;
  editable?: boolean;
  detachable?: boolean;
  provenanceIds?: string[];
  /** Explicit ownership. Never infer workspace vs. presentation from visual role names. */
  surfaceKind?: CanvasSurfaceKind;
  surfaceRootId?: string;
  sceneRevision?: string;
  structureVariant?: string;
  structureDensity?: "compact" | "balanced" | "spacious";
}

type NorthStarVisualStage = "awareness" | "consideration" | "action" | "verification";

interface NorthStarVisualBoardScreen {
  id: string;
  number: number;
  title: string;
  imageUrl: string;
  stage: NorthStarVisualStage;
  sourceRef: string;
}

interface NorthStarVisualBoardFlow {
  id: string;
  appName: string;
  appIconUrl?: string;
  flowName: string;
  platform: string;
  sessionType: string;
  summary: string;
  screens: NorthStarVisualBoardScreen[];
}

interface NorthStarVisualBoardMatrixRow {
  dimension: string;
  values: string[];
}

interface NorthStarVisualBoardEvidenceNote {
  id: string;
  label: string;
  title: string;
  body: string;
  imageUrl?: string;
  accent: "violet" | "orange" | "green" | "blue";
}

interface NorthStarVisualBoardDocument {
  version: "northstar.visual-board.v87";
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  flows: NorthStarVisualBoardFlow[];
  keyPatterns: Array<{ appName: string; points: string[]; accent: "violet" | "orange" }>;
  matrixRows: NorthStarVisualBoardMatrixRow[];
  stageSeries: Array<{ appName: string; values: Record<NorthStarVisualStage, number>; accent: "violet" | "orange" }>;
  evidenceNotes: NorthStarVisualBoardEvidenceNote[];
  hypotheses: Array<{ label: string; text: string; status: "supported" | "open" | "decided" }>;
  executive: {
    headline: string;
    appSummaries: Array<{ appName: string; iconUrl?: string; text: string; badge: string; accent: "violet" | "orange" }>;
    keyTakeaway: string;
    strategicImplication: string;
    recommendations: string[];
    nextSteps: string[];
  };
}

interface CanvasBoxObject {
  id: string;
  type: CanvasBoxType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text?: string;
  textHtml?: string;
  imageUrl?: string;
  imageStorageKey?: string;
  style: CanvasObjectStyle;
  rows?: number;
  cols?: number;
  cells?: string[][];
  iconName?: NorthstarIconName;
  freeformPoints?: FreeformPoint[];
  source?: CanvasObjectSource;
  semantic?: CanvasObjectSemanticMeta;
  locked?: boolean;
  hidden?: boolean;
  visualBoard?: NorthStarVisualBoardDocument;
  codeArtifact?: CanvasCodeArtifactPayload;
}

interface ConnectorBinding {
  objectId: string;
  /**
   * Relative anchor inside the object. This lets connector ends attach anywhere
   * on a shape/element instead of snapping only to four predefined side points.
   */
  xRatio: number;
  yRatio: number;
  side?: ConnectorSide;
}

interface SnappedConnectionPoint {
  x: number;
  y: number;
  id: string;
  side: ConnectorSide;
  xRatio: number;
  yRatio: number;
  distance: number;
}

interface CanvasConnectorStyle {
  stroke: string;
  strokeWidth: number;
  kind: ConnectorKind;
  end: ConnectorEnd;
  dash: ConnectorDash;
}

interface CanvasConnectorObject {
  id: string;
  type: "connector";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  controlOffset: number;
  controlX?: number;
  controlY?: number;
  startBinding?: ConnectorBinding;
  endBinding?: ConnectorBinding;
  style: CanvasConnectorStyle;
  source?: CanvasObjectSource;
  semantic?: CanvasObjectSemanticMeta;
  locked?: boolean;
  hidden?: boolean;
}

type CanvasObject = CanvasBoxObject | CanvasConnectorObject;

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AlignmentGuides {
  vertical: number[];
  horizontal: number[];
}

interface AxisSnapLock {
  target: number;
  movingPointIndex: 0 | 1 | 2;
}

interface MoveSnapLock {
  x?: AxisSnapLock;
  y?: AxisSnapLock;
}

type ResizeSnapMode = "edge" | "size";

interface ResizeAxisSnapLock {
  mode: ResizeSnapMode;
  target: number;
}

interface ResizeSnapLock {
  x?: ResizeAxisSnapLock;
  y?: ResizeAxisSnapLock;
}

interface PointerMoveFrame {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
}

type Interaction =
  | {
      kind: "pan";
      startClientX: number;
      startClientY: number;
      startViewport: Viewport;
    }
  | {
      kind: "place-box";
      tool: BoxTool;
      startClientX: number;
      startClientY: number;
      startWorld: { x: number; y: number };
    }
  | {
      kind: "marquee";
      additive: boolean;
      startWorld: { x: number; y: number };
    }
  | {
      kind: "move-selection";
      ids: string[];
      startClientX: number;
      startClientY: number;
      startObjects: CanvasObject[];
    }
  | {
      kind: "resize-box";
      id: string;
      direction: ResizeDirection;
      startClientX: number;
      startClientY: number;
      startObject: CanvasBoxObject;
      startChildren: CanvasObject[];
    }
  | {
      kind: "reshape-freeform";
      id: string;
      pointIndex: number;
      startClientX: number;
      startClientY: number;
      startObject: CanvasBoxObject;
    }
  | {
      kind: "rotate-box";
      id: string;
      center: { x: number; y: number };
      startAngle: number;
      startRotation: number;
    }
  | {
      kind: "move-connector";
      id: string;
      startClientX: number;
      startClientY: number;
      startConnector: CanvasConnectorObject;
    }
  | {
      kind: "move-connector-start";
      id: string;
      startClientX: number;
      startClientY: number;
      startConnector: CanvasConnectorObject;
    }
  | {
      kind: "move-connector-end";
      id: string;
      startClientX: number;
      startClientY: number;
      startConnector: CanvasConnectorObject;
    }
  | {
      kind: "adjust-connector-curve";
      id: string;
      startClientX: number;
      startClientY: number;
      startConnector: CanvasConnectorObject;
    }
  | {
      kind: "draw-connector";
      startWorld: { x: number; y: number };
      sourceId?: string;
      sourceSide?: ConnectorSide;
    }
  ;

interface DraftConnector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: ConnectorKind;
}

interface DraftBox {
  type: BoxTool;
  x: number;
  y: number;
  w: number;
  h: number;
}

type ShapePaletteDrag =
  | {
      kind: "shape";
      type: BoxTool;
      clientX: number;
      clientY: number;
      overCanvas: boolean;
    }
  | {
      kind: "component";
      preset: CanvasComponentPreset;
      clientX: number;
      clientY: number;
      overCanvas: boolean;
    };

interface WorkspaceScreenDrag {
  screen: WorkspaceAppScreen;
  clientX: number;
  clientY: number;
  overCanvas: boolean;
}

type ChatCanvasAsset =
  | { kind: "app"; app: WorkspaceApp }
  | { kind: "flow"; app: WorkspaceApp; flow: WorkspaceAppFlow }
  | { kind: "screen"; app: WorkspaceApp; flow: WorkspaceAppFlow; screen: WorkspaceAppScreen }
  | { kind: "image"; name: string; imageUrl: string };

interface ChatCanvasAssetDrag {
  asset: ChatCanvasAsset;
  clientX: number;
  clientY: number;
  overCanvas: boolean;
}

interface ChatImageLightboxState {
  src: string;
  alt: string;
  subtitle?: string;
}

interface ConnectorBoundsInput {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface EditingCell {
  objectId: string;
  row: number;
  col: number;
}

interface CanvasContextMenuState {
  clientX: number;
  clientY: number;
  targetIds: string[];
}

type UnknownRecord = Record<string, unknown>;

interface WorkspaceAppScreen {
  id: string;
  name: string;
  imageUrl?: string;
  sourceUrl?: string;
  createdAt?: string;
}

interface WorkspaceAppFlow {
  id: string;
  name: string;
  description?: string;
  screens: WorkspaceAppScreen[];
}

interface WorkspaceApp {
  id: string;
  name: string;
  tenantId?: string;
  domain?: string;
  logoUrl?: string;
  description?: string;
  category?: string;
  rank?: string;
  revenue?: string;
  employees?: string;
  totalScreens?: number;
  flows: WorkspaceAppFlow[];
}

interface CanvasInsertOptions {
  skipHistory?: boolean;
  select?: boolean;
  worldPoint?: { x: number; y: number };
}


interface CanvasContextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface CanvasContextContentSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number;
}

interface CanvasContextContent {
  /**
   * For full-canvas context this may be a truncated preview so the AI payload
   * stays usable. Selected-context can include the complete text.
   */
  plainText?: string;
  plainTextPreview?: string;
  plainTextLength?: number;
  lineCount?: number;
  isTruncated?: boolean;
  richText?: {
    html: string;
    plainText: string;
    segments: CanvasContextContentSegment[];
    isTruncated?: boolean;
  };
  table?: {
    rows: number;
    cols: number;
    cells: string[][];
  };
  image?: {
    url?: string;
    storageKey?: string;
    alt?: string;
  };
}

interface CanvasContextObjectStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: TextAlign;
  connectorKind?: ConnectorKind;
  connectorEnd?: ConnectorEnd;
  connectorDash?: ConnectorDash;
}

interface CanvasContextObjectCapabilities {
  canMove: boolean;
  canResize: boolean;
  canRotate: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canEditText: boolean;
  canChangeFill: boolean;
  canChangeStroke: boolean;
  canAttachConnector: boolean;
  canDetachConnector: boolean;
}

interface CanvasContextSemanticInterpretation {
  role:
    | "flow-app-icon"
    | "flow-app-name"
    | "flow-title"
    | "flow-screen"
    | "single-screen"
    | "artifact"
    | "working-surface"
    | "connector"
    | "editable-text"
    | "pasted-content"
    | "shape"
    | "table"
    | "frame"
    | "image"
    | "unknown";
  label?: string;
  description?: string;
}

interface CanvasContextAnchor {
  objectId: string;
  xRatio: number;
  yRatio: number;
  side?: ConnectorSide;
}

interface CanvasContextCodeArtifact {
  artifactId: string;
  revisionId: string;
  parentRevisionId?: string;
  title: string;
  description?: string;
  visualStrategy?: string;
  artifactType?: string;
  audience?: string;
  thinkingDepth?: CanvasCodeArtifactPayload["thinkingDepth"];
  activeStageIndex?: number;
  creativeDirection?: CanvasCodeArtifactPayload["creativeDirection"];
  creativeReviews?: CanvasCodeArtifactPayload["creativeReviews"];
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
  document?: CanvasCodeArtifactPayload["document"];
  sourceTsx?: string;
  dataBundle?: CanvasCodeArtifactPayload["dataBundle"];
}

interface CanvasContextObject {
  id: string;
  type: "shape" | "text" | "note" | "image" | "screenshot" | "connector" | "table" | "frame" | "card" | "flow-header" | "code-artifact";
  subtype?: string;
  bounds: CanvasContextBounds;
  rotation: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  content?: CanvasContextContent;
  style?: CanvasContextObjectStyle;
  source?: CanvasObjectSource;
  semantic?: CanvasObjectSemanticMeta;
  codeArtifact?: CanvasContextCodeArtifact;
  interpretation?: CanvasContextSemanticInterpretation;
  relationships?: {
    groupId?: string;
    artifactId?: string;
    connectedTo?: string[];
    containedBy?: string[];
    overlapsWith?: string[];
    nearestObjects?: string[];
  };
  capabilities: CanvasContextObjectCapabilities;
}

interface CanvasContextGroup {
  id: string;
  type: "semantic-artifact" | "spatial-cluster" | "selection";
  objectIds: string[];
  bounds: CanvasContextBounds;
  label?: string;
}

interface CanvasContextFlowArtifact {
  id: string;
  type: "inserted-flow-row";
  appName: string;
  appIconUrl?: string;
  flowName: string;
  flowType: CanvasFlowType;
  objectIds: string[];
  labelObjectIds: {
    appName?: string;
    flowName?: string;
  };
  appIconObjectId?: string;
  screenshotObjectIds: string[];
  bounds: CanvasContextBounds;
  layout: {
    direction: "horizontal" | "vertical" | "mixed";
    screenshotCount: number;
    screenshotSpacing: number;
  };
}

interface CanvasContextRelationships {
  connectors: Array<{
    connectorId: string;
    fromObjectId?: string;
    toObjectId?: string;
    fromPoint: { x: number; y: number };
    toPoint: { x: number; y: number };
    fromAnchor?: CanvasContextAnchor;
    toAnchor?: CanvasContextAnchor;
    style: ConnectorKind;
  }>;
  overlaps: Array<{
    objectA: string;
    objectB: string;
    overlapArea: number;
  }>;
  proximity: Array<{
    objectA: string;
    objectB: string;
    distance: number;
  }>;
  alignment: Array<{
    objectIds: string[];
    axis: "x" | "y";
    alignment: "left" | "center" | "right" | "top" | "middle" | "bottom";
  }>;
}

interface CanvasContextSummary {
  objectCount: number;
  selectedCount: number;
  textCount: number;
  imageCount: number;
  screenshotCount: number;
  shapeCount: number;
  connectorCount: number;
  flowArtifactCount: number;
  generatedArtifactCount: number;
  workingObjectCount: number;
  presentationObjectCount: number;
  appsRepresented: string[];
  flowsRepresented: string[];
  humanReadableSummary: string;
}

interface CanvasContext {
  version: "northstar.canvas-context.v1";
  canvas: {
    id: string;
    title: string;
    createdAt?: string;
    updatedAt?: string;
  };
  viewport: {
    x: number;
    y: number;
    zoom: number;
    visibleBounds: CanvasContextBounds;
  };
  documentBounds: CanvasContextBounds | null;
  selection: {
    selectedIds: string[];
    selectionBounds: CanvasContextBounds | null;
  };
  objects: CanvasContextObject[];
  groups: CanvasContextGroup[];
  flows: CanvasContextFlowArtifact[];
  relationships: CanvasContextRelationships;
  summary: CanvasContextSummary;
}

interface SelectedCanvasContext {
  version: "northstar.selected-canvas-context.v1";
  selectedIds: string[];
  selectionBounds: CanvasContextBounds | null;
  selectedObjects: CanvasContextObject[];
  selectedGroups: CanvasContextGroup[];
  selectedFlowArtifacts: CanvasContextFlowArtifact[];
  connectedObjects: CanvasContextObject[];
  nearbyObjects: CanvasContextObject[];
  editableState: {
    canMove: boolean;
    canResize: boolean;
    canRotate: boolean;
    canEditText: boolean;
    canStyle: boolean;
    canConnect: boolean;
    canGroup: boolean;
    canUngroup: boolean;
    canAnalyzeAsFlow: boolean;
    canAnalyzeAsScreenshots: boolean;
  };
  suggestedInterpretation: {
    selectionKind: "single-object" | "multiple-objects" | "flow-row" | "screenshot-set" | "text-set" | "mixed-selection" | "empty";
    primaryApp?: string;
    primaryFlow?: string;
    humanReadableSummary: string;
  };
}

interface CanvasAreaContext {
  areaBounds: CanvasContextBounds;
  containedObjects: CanvasContextObject[];
  partiallyIntersectingObjects: CanvasContextObject[];
  flowArtifactsInside: CanvasContextFlowArtifact[];
  nearbyObjects: CanvasContextObject[];
}

type CanvasAIContextMode = "canvas" | "selection";
type CanvasAIRunStatus = "idle" | "running" | "completed" | "blocked" | "failed" | "cancelled";

interface CanvasAIReference {
  objectIds: string[];
  label: string;
  reason?: string;
}

interface CanvasAISuggestedAction {
  type: string;
  targetObjectIds: string[];
  description: string;
}

type CanvasAIActivityKind = "context" | "inspection" | "analysis" | "tool" | "reference" | "plan";
type CanvasAIActivityStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "info";
type CanvasAIActivityIcon =
  | "context"
  | "inspect"
  | "analyze"
  | "search"
  | "reference"
  | "flow"
  | "screenshot"
  | "app"
  | "compare"
  | "plan"
  | "tool"
  | "verify"
  | "write"
  | "move"
  | "connect"
  | "select"
  | "warning"
  | "info"
  | "complete";

interface CanvasAIToolResultItem {
  id: string;
  kind: "app" | "flow" | "screenshot";
  title: string;
  subtitle?: string;
  imageUrl?: string;
  appName?: string;
  flowName?: string;
  category?: string;
  platform?: string;
  sessionType?: string;
  screenCount?: number;
  screenshotIndex?: number;
  thumbnails?: Array<{
    id: string;
    title: string;
    imageUrl?: string;
  }>;
}

interface CanvasAIToolResultView {
  kind: "apps" | "app" | "flows" | "flow" | "screenshots" | "screenshot";
  title: string;
  items: CanvasAIToolResultItem[];
  emptyMessage?: string;
}

interface CanvasAIHistoryToolContextEntry {
  messageId: string;
  planTitle?: string;
  tool: string;
  detail?: string;
  resultView?: CanvasAIToolResultView;
}

interface CanvasAIActivityItem {
  id: string;
  kind: CanvasAIActivityKind;
  status: CanvasAIActivityStatus;
  icon: CanvasAIActivityIcon;
  label: string;
  detail?: string;
  objectIds?: string[];
  tool?: string;
  resultView?: CanvasAIToolResultView;
}

type CanvasAIActionTool =
  | "create_shape"
  | "create_visual_component"
  | "create_text"
  | "create_note"
  | "create_connector"
  | "insert_app_icon"
  | "insert_screenshot"
  | "insert_flow"
  | "move_objects"
  | "update_object_style"
  | "resize_objects"
  | "rotate_objects"
  | "update_text"
  | "duplicate_objects"
  | "delete_objects"
  | "arrange_objects"
  | "create_working_surface"
  | "update_working_surface"
  | "create_artifact_shell"
  | "add_artifact_section"
  | "add_artifact_summary"
  | "audit_artifact_semantics"
  | "compose_artifact"
  | "compose_visual_board"
  | "compose_visual_scene"
  | "validate_visual_board"
  | "review_artifact_layout"
  | "refine_artifact_presentation"
  | "align_objects"
  | "distribute_objects"
  | "select_objects"
  | "focus_objects";

interface CanvasAIActionArguments {
  appName?: string;
  flowName?: string;
  query?: string;
  screenshotId?: string;
  shape?: "rect" | "ellipse" | "circle" | "diamond" | "triangle" | "pill" | "callout" | "card" | "frame";
  componentPreset?: CanvasComponentPreset;
  text?: string;
  targetQuery?: string;
  fromQuery?: string;
  toQuery?: string;
  resultKey?: string;
  fromResultKey?: string;
  toResultKey?: string;
  resultKeys?: string[];
  objectIds?: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;
  fill?: string;
  stroke?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  strokeWidth?: number;
  textAlign?: TextAlign;
  scale?: number;
  rotation?: number;
  rotationDelta?: number;
  preserveAspectRatio?: boolean;
  copyCount?: number;
  layout?: "horizontal" | "vertical" | "grid";
  gap?: number;
  columns?: number;
  connectorKind?: ConnectorKind;
  connectorEnd?: ConnectorEnd;
  connectorDash?: ConnectorDash;
  alignment?: "left" | "center" | "right" | "top" | "middle" | "bottom";
  axis?: "horizontal" | "vertical";
  placement?: "center" | "right-of-selection" | "below-selection" | "at-cursor";
  selectAfter?: boolean;
  artifactId?: string;
  artifactType?: "comparison-board" | "journey-map" | "screenshot-analysis" | "strategy-board" | "research-map" | "roadmap" | "causal-map" | "storyboard" | "dashboard" | "operating-model" | "market-map" | "decision-tree" | "design-board" | "workflow" | "product-concept" | "freeform";
  executionDepth?: "quick" | "balanced" | "deep";
  workingVisibility?: "visible" | "compact" | "hidden";
  audience?: "general" | "executive" | "product" | "design" | "research" | "operations" | "sales" | "marketing";
  title?: string;
  subtitle?: string;
  summary?: string;
  compositionJson?: string;
  workingNotesJson?: string;
  workingNoteJson?: string;
  workspacePlanJson?: string;
  replaceExisting?: boolean;
  sectionJson?: string;
  sectionIndex?: number;
  totalSections?: number;
  maxVisibleEvidence?: number;
  sessionType?: "onboarding" | "browsing";
  appNames?: string[];
  visualBoardJson?: string;
}

interface CanvasAIActionAssetScreen {
  id: string;
  name: string;
  imageUrl?: string;
  sourceUrl?: string;
  appName: string;
  flowName: string;
  platform?: string;
  sessionType?: string;
  index: number;
}

interface CanvasAIActionAssetFlow {
  id: string;
  name: string;
  description?: string;
  appName: string;
  appId: string;
  platform?: string;
  sessionType?: string;
  screens: CanvasAIActionAssetScreen[];
}

interface CanvasAIActionAssetApp {
  id: string;
  name: string;
  tenantId: string;
  domain?: string;
  iconUrl?: string;
  description?: string;
  category?: string;
  rank?: string;
  revenue?: string;
  employees?: string;
  totalScreens: number;
  flows: CanvasAIActionAssetFlow[];
}

interface CanvasAIActionRequest {
  actionId: string;
  stepId: string;
  tool: CanvasAIActionTool;
  label: string;
  arguments: CanvasAIActionArguments;
  asset?: {
    app?: CanvasAIActionAssetApp;
    flow?: CanvasAIActionAssetFlow;
    screenshot?: CanvasAIActionAssetScreen;
  };
  assetBundle?: {
    apps: CanvasAIActionAssetApp[];
    flows: CanvasAIActionAssetFlow[];
    screenshots: CanvasAIActionAssetScreen[];
  };
}

interface CanvasAIActionExecutionResult {
  ok: boolean;
  detail: string;
  objectIds: string[];
  targetLabel?: string;
  fromLabel?: string;
  toLabel?: string;
}

interface CanvasAIActionExecutionRecord extends CanvasAIActionExecutionResult {
  stepId: string;
  tool: CanvasAIActionTool;
  label: string;
  arguments: CanvasAIActionArguments;
  asset?: CanvasAIActionRequest["asset"];
}

const CANVAS_AI_ACTION_TOOLS = new Set<CanvasAIActionTool>([
  "create_shape",
  "create_visual_component",
  "create_text",
  "create_note",
  "create_connector",
  "insert_app_icon",
  "insert_screenshot",
  "insert_flow",
  "move_objects",
  "update_object_style",
  "resize_objects",
  "rotate_objects",
  "update_text",
  "duplicate_objects",
  "delete_objects",
  "arrange_objects",
  "create_working_surface",
  "update_working_surface",
  "create_artifact_shell",
  "add_artifact_section",
  "add_artifact_summary",
  "audit_artifact_semantics",
  "compose_artifact",
  "compose_visual_board",
  "compose_visual_scene",
  "validate_visual_board",
  "review_artifact_layout",
  "refine_artifact_presentation",
  "align_objects",
  "distribute_objects",
  "select_objects",
  "focus_objects",
]);

function isCanvasAIActionTool(value: unknown): value is CanvasAIActionTool {
  return (
    typeof value === "string" &&
    CANVAS_AI_ACTION_TOOLS.has(value as CanvasAIActionTool)
  );
}


type CanvasCompositionWorkingNote = {
  label: string;
  text: string;
  kind:
    | "objective"
    | "constraint"
    | "evidence"
    | "hypothesis"
    | "decision"
    | "question"
    | "correction"
    | "rejected"
    | "check";
  evidenceIds?: string[];
};

type CanvasResearchWorkspaceRegion = {
  id: string;
  title: string;
  purpose: "objective" | "app" | "flow" | "hypotheses" | "decisions" | "questions" | "archive" | "synthesis" | "custom";
  x: number;
  y: number;
  w: number;
  h: number;
  layout: "row" | "column" | "grid" | "cluster" | "timeline" | "mixed";
  appName?: string;
  flowName?: string;
  evidenceIds: string[];
  noteLabels: string[];
  emphasis?: "normal" | "primary" | "supporting";
};

type CanvasResearchWorkspacePlan = {
  strategy: string;
  canvasWidth: number;
  canvasHeight: number;
  regions: CanvasResearchWorkspaceRegion[];
};

type CanvasCompositionSection = {
  id: string;
  title: string;
  body: string;
  kind:
    | "app-column"
    | "stage"
    | "evidence-group"
    | "insight"
    | "recommendation"
    | "summary"
    | "matrix"
    | "chart"
    | "timeline"
    | "roadmap"
    | "process"
    | "decision"
    | "hypothesis"
    | "risk"
    | "opportunity"
    | "metric"
    | "diagram"
    | "reference-flow"
    | "source-cluster"
    | "callout"
    | "table";
  appName?: string;
  flowName?: string;
  evidenceIds: string[];
  criteria?: string[];
  emphasis: "normal" | "primary" | "supporting";
};

type CanvasCompositionLayoutRegion = {
  sectionId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  evidenceLayout: "row" | "column" | "grid" | "cluster" | "timeline" | "filmstrip";
  columns?: number;
  emphasis?: "normal" | "primary" | "supporting";
  styleVariant?: "plain" | "soft" | "contrast" | "editorial" | "minimal";
};

type CanvasCompositionBlueprint = {
  artifactId: string;
  artifactType: "comparison-board" | "journey-map" | "screenshot-analysis" | "strategy-board" | "research-map" | "roadmap" | "causal-map" | "storyboard" | "dashboard" | "operating-model" | "market-map" | "decision-tree" | "design-board" | "workflow" | "product-concept" | "freeform";
  executionDepth: "quick" | "balanced" | "deep";
  workingVisibility: "visible" | "compact" | "hidden";
  audience: "general" | "executive" | "product" | "design" | "research" | "operations" | "sales" | "marketing";
  title: string;
  subtitle: string;
  summary: string;
  visualStrategy: string;
  researchDigest: string;
  workingNotes: CanvasCompositionWorkingNote[];
  workingEvidenceIds: string[];
  workingSurfacePlan?: CanvasResearchWorkspacePlan;
  sections: CanvasCompositionSection[];
  layout: {
    direction: "horizontal" | "vertical" | "grid" | "mixed";
    columns: number;
    gap: number;
    evidenceScale: "compact" | "balanced" | "large";
    canvasWidth: number;
    canvasHeight: number;
    regions: CanvasCompositionLayoutRegion[];
  };
};

function safeParseJson<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function repairNorthstarDisplayEncoding(value: string): string {
  let repaired = value;
  const replacements: Array<[RegExp, string]> = [
    [/Â /g, " "],
    [/Â·/g, "·"],
    [/â€”/g, "—"],
    [/â€“/g, "–"],
    [/â€œ/g, "“"],
    [/â€[�]/g, "”"],
    [/â€˜/g, "‘"],
    [/â€™/g, "’"],
    [/â€¦/g, "…"],
  ];
  // Some upstream text has been encoded twice, so run the finite replacement
  // table twice. This is deterministic and leaves valid Unicode untouched.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [pattern, replacement] of replacements) repaired = repaired.replace(pattern, replacement);
  }
  return repaired;
}

function normalizeNorthstarDisplayPayload(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return repairNorthstarDisplayEncoding(value);
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => normalizeNorthstarDisplayPayload(entry, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, normalizeNorthstarDisplayPayload(entry, depth + 1)]),
  );
}

function stableVisualBoardId(parts: Array<string | number | undefined>) {
  return parts
    .filter((part) => part !== undefined && String(part).trim().length > 0)
    .map((part) => String(part).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .join("__");
}

function inferCanvasSurfaceKind(object: CanvasObject): CanvasSurfaceKind | undefined {
  const explicit = object.semantic?.surfaceKind;
  if (explicit) return explicit;
  const role = object.semantic?.role;
  if (role === "working-frame" || role === "working-heading" || role === "working-note" || role === "working-evidence") {
    return "working";
  }
  if (role && (role.startsWith("artifact-") || role.startsWith("visual-"))) return "presentation";
  return undefined;
}

function isCanvasObjectOnSurface(object: CanvasObject, kind: CanvasSurfaceKind): boolean {
  return inferCanvasSurfaceKind(object) === kind;
}

function stampSurfaceOwnership(
  objects: CanvasObject[],
  artifactId: string,
  surfaceKind: CanvasSurfaceKind,
  surfaceRootId: string,
  sceneRevision = `${Date.now()}`,
): CanvasObject[] {
  return objects.map((object) => {
    if (object.semantic?.artifactId !== artifactId) return object;
    return {
      ...object,
      semantic: {
        ...object.semantic,
        artifactId,
        surfaceKind,
        surfaceRootId,
        sceneRevision,
      },
    };
  });
}

function dedupeCanvasObjectsById(objects: CanvasObject[]): CanvasObject[] {
  if (objects.length < 2) return objects;
  const seen = new Set<string>();
  const reversed: CanvasObject[] = [];
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (!object?.id || seen.has(object.id)) continue;
    seen.add(object.id);
    reversed.push(object);
  }
  reversed.reverse();
  return reversed;
}

function normalizeCanvasScene(objects: CanvasObject[]): CanvasObject[] {
  const unique: CanvasObject[] = dedupeCanvasObjectsById(objects);
  const byId = new Map<string, CanvasObject>(unique.map((object): [string, CanvasObject] => [object.id, object]));

  const withSurfaceOwnership: CanvasObject[] = unique.map((object): CanvasObject => {
    const semantic = object.semantic;
    if (!semantic?.artifactId || (semantic.surfaceKind && semantic.surfaceRootId)) return object;

    let cursor: CanvasObject | undefined = object;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      const cursorSemantic: CanvasObjectSemanticMeta | undefined = cursor.semantic;
      const role = cursorSemantic?.role;
      if (cursorSemantic?.surfaceKind && cursorSemantic.surfaceRootId) {
        const inheritedKind: CanvasSurfaceKind = cursorSemantic.surfaceKind;
        return {
          ...object,
          semantic: {
            ...semantic,
            surfaceKind: inheritedKind,
            surfaceRootId: cursorSemantic.surfaceRootId,
          },
        } as CanvasObject;
      }
      if (role === "working-frame") {
        const surfaceKind: CanvasSurfaceKind = "working";
        return {
          ...object,
          semantic: { ...semantic, surfaceKind, surfaceRootId: cursor.id },
        } as CanvasObject;
      }
      if (role === "visual-root" || role === "artifact-frame") {
        const surfaceKind: CanvasSurfaceKind = "presentation";
        return {
          ...object,
          semantic: { ...semantic, surfaceKind, surfaceRootId: cursor.id },
        } as CanvasObject;
      }
      const parentId: string | undefined = cursorSemantic?.parentId;
      cursor = parentId !== undefined ? byId.get(parentId) : undefined;
    }

    const inferred: CanvasSurfaceKind | undefined = inferCanvasSurfaceKind(object);
    if (!inferred) return object;
    return {
      ...object,
      semantic: {
        ...semantic,
        surfaceKind: inferred,
        surfaceRootId: semantic.surfaceRootId ?? object.id,
      },
    } as CanvasObject;
  });

  const idSet = new Set<string>(withSurfaceOwnership.map((object) => object.id));
  const repaired: CanvasObject[] = withSurfaceOwnership.map((object): CanvasObject => {
    const parentId: string | undefined = object.semantic?.parentId;
    if (!parentId || (parentId !== object.id && idSet.has(parentId))) return object;
    if (!object.semantic) return object;
    return {
      ...object,
      semantic: { ...object.semantic, parentId: undefined },
    } as CanvasObject;
  });
  return resolveConnectorBindings(repaired);
}

function validateSurfaceObjects(
  objects: CanvasObject[],
  artifactId: string,
  surfaceKind: CanvasSurfaceKind,
  surfaceRootId: string,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const object of objects) {
    if (ids.has(object.id)) issues.push(`duplicate id ${object.id}`);
    ids.add(object.id);
  }
  const surfaceObjects = objects.filter(
    (object) => object.semantic?.artifactId === artifactId && isCanvasObjectOnSurface(object, surfaceKind),
  );
  if (!surfaceObjects.some((object) => object.id === surfaceRootId)) {
    issues.push(`missing ${surfaceKind} surface root`);
  }
  const surfaceIds = new Set(surfaceObjects.map((object) => object.id));
  for (const object of surfaceObjects) {
    if (object.semantic?.surfaceRootId !== surfaceRootId) issues.push(`invalid surface root for ${object.id}`);
    const parentId = object.semantic?.parentId;
    if (parentId && !surfaceIds.has(parentId)) issues.push(`orphaned child ${object.id}`);
  }
  return issues;
}

function replaceArtifactSurface(
  current: CanvasObject[],
  artifactId: string,
  surfaceKind: CanvasSurfaceKind,
  surfaceRootId: string,
  proposed: CanvasObject[],
): CanvasObject[] {
  const stamped = stampSurfaceOwnership(proposed, artifactId, surfaceKind, surfaceRootId);
  const issues = validateSurfaceObjects(stamped, artifactId, surfaceKind, surfaceRootId);
  if (issues.length > 0) {
    throw new Error(`North Star could not commit the ${surfaceKind} surface: ${issues.slice(0, 3).join("; ")}.`);
  }
  const legacyRootIds = current
    .filter(
      (object) =>
        object.semantic?.artifactId === artifactId &&
        (isCanvasObjectOnSurface(object, surfaceKind) ||
          (surfaceKind === "working" && object.semantic?.role === "working-frame") ||
          (surfaceKind === "presentation" &&
            (object.semantic?.role === "visual-root" || object.semantic?.role === "artifact-frame"))),
    )
    .map((object) => object.id);
  const legacySubtreeIds = new Set([
    ...legacyRootIds,
    ...getSemanticDescendantIds(current, legacyRootIds),
  ]);
  const retained = current.filter(
    (object) =>
      !legacySubtreeIds.has(object.id) &&
      !(object.semantic?.artifactId === artifactId && isCanvasObjectOnSurface(object, surfaceKind)),
  );
  return normalizeCanvasScene([...retained, ...stamped]);
}


function canonicalVisualSessionType(value?: string): "onboarding" | "browsing" | undefined {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/onboard|activation|registration|sign up|signup|account creation|first login/.test(normalized)) return "onboarding";
  if (/brows|discover|explore|navigation|usage/.test(normalized)) return "browsing";
  return undefined;
}

function inferVisualStage(title: string): NorthStarVisualStage {
  const value = title.toLowerCase();
  if (/verify|verification|code|password|security|email validation|confirm/.test(value)) return "verification";
  if (/create|account|sign in|login|name|profile|setup|get started|join/.test(value)) return "action";
  if (/partner|plan|feature|preview|discover|brand|trust|benefit|marketplace/.test(value)) return "consideration";
  return "awareness";
}

function cleanVisualSentence(value: string | undefined, fallback: string) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function buildNorthStarVisualBoardDocument(
  args: CanvasAIActionArguments,
  bundle: CanvasAIActionRequest["assetBundle"],
): NorthStarVisualBoardDocument {
  const blueprint = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
  const scope = [args.title, args.subtitle, args.summary, blueprint?.researchDigest].filter(Boolean).join(" ").toLowerCase();
  const requestedSession = args.sessionType ?? (scope.includes("onboarding") ? "onboarding" : scope.includes("browsing") ? "browsing" : undefined);
  const flowMap = new Map<string, CanvasAIActionAssetFlow>();

  for (const rawFlow of bundle?.flows ?? []) {
    if (requestedSession && canonicalVisualSessionType(`${rawFlow.sessionType ?? ""} ${rawFlow.name} ${rawFlow.description ?? ""}`) !== requestedSession) continue;
    const key = stableVisualBoardId([rawFlow.appName, rawFlow.name, rawFlow.platform, rawFlow.sessionType]);
    const existing = flowMap.get(key);
    const screenMap = new Map<string, CanvasAIActionAssetScreen>();
    [...(existing?.screens ?? []), ...rawFlow.screens]
      .filter((screen) => Boolean(screen.imageUrl))
      .sort((a, b) => a.index - b.index)
      .forEach((screen) => screenMap.set(screen.id || stableVisualBoardId([key, screen.index, screen.name]), screen));
    flowMap.set(key, { ...(existing ?? rawFlow), ...rawFlow, screens: [...screenMap.values()].sort((a, b) => a.index - b.index) });
  }

  const appOrder = new Map<string, number>();
  (args.appNames ?? []).forEach((name, index) => appOrder.set(name.toLowerCase(), index));
  const candidateFlows = [...flowMap.values()]
    .filter((flow) => flow.screens.filter((screen) => Boolean(screen.imageUrl)).length >= 3)
    .sort((a, b) => {
      const appA = appOrder.get(a.appName.toLowerCase()) ?? 99;
      const appB = appOrder.get(b.appName.toLowerCase()) ?? 99;
      if (appA !== appB) return appA - appB;
      return b.screens.length - a.screens.length;
    });

  const chosenByApp = new Map<string, CanvasAIActionAssetFlow>();
  for (const flow of candidateFlows) {
    if (!chosenByApp.has(flow.appName.toLowerCase())) chosenByApp.set(flow.appName.toLowerCase(), flow);
  }
  const chosenFlows = [...chosenByApp.values()].slice(0, 2);
  if (chosenFlows.length < 2) {
    throw new Error(requestedSession
      ? `North Star needs two complete ${requestedSession} reference flows before composing this comparison.`
      : "North Star needs two complete reference flows before composing this comparison.");
  }

  const appIcon = (appName: string) =>
    bundle?.apps.find((app) => app.name.toLowerCase() === appName.toLowerCase())?.iconUrl;
  const sectionForApp = (appName: string) =>
    blueprint?.sections.find((section) => section.appName?.toLowerCase() === appName.toLowerCase() && section.body.trim());
  const maxScreens = args.executionDepth === "deep" ? 11 : args.executionDepth === "balanced" ? 10 : 9;
  const accents: Array<"violet" | "orange"> = ["violet", "orange"];

  const flows: NorthStarVisualBoardFlow[] = chosenFlows.map((flow, flowIndex) => {
    const screens = flow.screens.filter((screen) => Boolean(screen.imageUrl)).slice(0, maxScreens);
    return {
      id: stableVisualBoardId(["reference-flow", flow.appName, flow.name, flow.platform, flow.sessionType]),
      appName: flow.appName,
      appIconUrl: appIcon(flow.appName),
      flowName: flow.name,
      platform: flow.platform || "mobile",
      sessionType: canonicalVisualSessionType(`${flow.sessionType ?? ""} ${flow.name}`) || requestedSession || "flow",
      summary: cleanVisualSentence(sectionForApp(flow.appName)?.body || flow.description, `${flow.appName} uses a ${screens.length}-screen path to move users from first value to activation.`),
      screens: screens.map((screen, index) => ({
        id: stableVisualBoardId(["flow-screen", flow.appName, flow.name, screen.id, index]),
        number: index + 1,
        title: screen.name || `Screen ${index + 1}`,
        imageUrl: screen.imageUrl!,
        stage: inferVisualStage(screen.name || ""),
        sourceRef: `${flow.appName} · ${flow.name} · ${index + 1}`,
      })),
    };
  });

  const stageOrder: NorthStarVisualStage[] = ["awareness", "consideration", "action", "verification"];
  const stageSeries = flows.map((flow, index) => {
    const counts: Record<NorthStarVisualStage, number> = { awareness: 0, consideration: 0, action: 0, verification: 0 };
    flow.screens.forEach((screen) => { counts[screen.stage] += 1; });
    const total = Math.max(1, flow.screens.length);
    const values = Object.fromEntries(stageOrder.map((stage) => [stage, Math.round((counts[stage] / total) * 100)])) as Record<NorthStarVisualStage, number>;
    return { appName: flow.appName, values, accent: accents[index] };
  });

  const firstActionIndex = (flow: NorthStarVisualBoardFlow) => {
    const index = flow.screens.findIndex((screen) => screen.stage === "action");
    return index < 0 ? "Not observed" : `Step ${index + 1}`;
  };
  const firstVerificationIndex = (flow: NorthStarVisualBoardFlow) => {
    const index = flow.screens.findIndex((screen) => screen.stage === "verification");
    return index < 0 ? "Not observed" : `Step ${index + 1}`;
  };
  const dominantStage = (flow: NorthStarVisualBoardFlow) => {
    const counts = new Map<NorthStarVisualStage, number>();
    flow.screens.forEach((screen) => counts.set(screen.stage, (counts.get(screen.stage) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "awareness";
  };

  const matrixRows: NorthStarVisualBoardMatrixRow[] = [
    { dimension: "Entry point", values: flows.map((flow) => flow.screens[0]?.title || "First screen") },
    { dimension: "Observed path", values: flows.map((flow) => `${flow.screens.length} screens`) },
    { dimension: "First commitment", values: flows.map(firstActionIndex) },
    { dimension: "Verification", values: flows.map(firstVerificationIndex) },
    { dimension: "Dominant emphasis", values: flows.map((flow) => dominantStage(flow).replace(/^./, (char) => char.toUpperCase())) },
    { dimension: "Flow posture", values: flows.map((flow) => flow.summary.split(/[.!?]/)[0].slice(0, 74)) },
  ];

  const notes = blueprint?.workingNotes ?? [];
  const keyPatterns = flows.map((flow, index) => {
    const appNotes = notes.filter((note) => note.text.toLowerCase().includes(flow.appName.toLowerCase())).slice(0, 2);
    const section = sectionForApp(flow.appName);
    const points = [section?.body, ...appNotes.map((note) => note.text), flow.summary]
      .filter((value): value is string => Boolean(value?.trim()))
      .flatMap((value) => value.split(/(?<=[.!?])\s+/))
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 3);
    return { appName: flow.appName, points, accent: accents[index] };
  });

  const evidenceNotes: NorthStarVisualBoardEvidenceNote[] = flows.flatMap((flow, flowIndex) => {
    const candidateIndexes = [0, Math.max(0, Math.floor(flow.screens.length / 2)), flow.screens.length - 1];
    return candidateIndexes.slice(0, 2).map((screenIndex, noteIndex) => {
      const screen = flow.screens[screenIndex];
      return {
        id: stableVisualBoardId(["evidence-note", flow.id, screen?.id, noteIndex]),
        label: `${flow.appName} · Screen ${screen?.number ?? screenIndex + 1}`,
        title: screen?.title ?? "Evidence",
        body: noteIndex === 0 ? `The journey opens with “${screen?.title ?? "the first screen"}”, establishing the initial value and expectation.` : `This screen marks the flow's movement toward ${screen?.stage ?? "activation"}.`,
        imageUrl: screen?.imageUrl,
        accent: flowIndex === 0 ? (noteIndex === 0 ? "violet" : "green") : (noteIndex === 0 ? "orange" : "blue"),
      };
    });
  });

  const hypotheses = notes
    .filter((note) => ["hypothesis", "decision", "check"].includes(note.kind))
    .slice(0, 5)
    .map((note, index) => ({
      label: `${note.kind === "decision" ? "D" : "H"}${index + 1}`,
      text: note.text,
      status: note.kind === "decision" ? "decided" as const : note.kind === "check" ? "supported" as const : "open" as const,
    }));
  if (hypotheses.length === 0) {
    hypotheses.push(
      { label: "H1", text: `${flows[0].appName}'s earlier emphasis shapes informed commitment.`, status: "supported" },
      { label: "H2", text: `${flows[1].appName}'s shorter route to action supports conversion momentum.`, status: "supported" },
      { label: "D1", text: "Compare the observed flows using the same journey dimensions.", status: "decided" },
    );
  }

  const recommendationSections = blueprint?.sections.filter((section) => section.kind === "recommendation") ?? [];
  const recommendations = recommendationSections
    .flatMap((section) => [section.body, ...(section.criteria ?? [])])
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (recommendations.length < 3) {
    const actionSteps = flows.map(firstActionIndex);
    recommendations.push(
      `${flows[0].appName}: preserve trust-building while testing a clearer route to action before ${actionSteps[0]}.`,
      `${flows[1].appName}: add confidence-building evidence before or around ${actionSteps[1]}.`,
      "Both: measure progression and abandonment at every observed stage before changing the journey.",
    );
  }

  const appSummaries = flows.map((flow, index) => ({
    appName: flow.appName,
    iconUrl: flow.appIconUrl,
    text: flow.summary,
    badge: dominantStage(flow) === "action" ? "Action-First" : dominantStage(flow) === "verification" ? "Verification-Led" : "Trust-First",
    accent: accents[index],
  }));
  const summary = cleanVisualSentence(args.summary || blueprint?.summary, `${flows[0].appName} and ${flows[1].appName} use distinct but valid approaches to activation.`);
  const keyTakeaway = `${flows[0].appName} emphasizes ${dominantStage(flows[0])}; ${flows[1].appName} emphasizes ${dominantStage(flows[1])}. The stronger approach depends on whether the business prioritizes informed commitment or conversion velocity.`;

  return {
    version: "northstar.visual-board.v87",
    id: args.artifactId || blueprint?.artifactId || stableVisualBoardId(["visual-board", args.title]),
    title: cleanVisualSentence(args.title || blueprint?.title, `${flows[0].appName} vs. ${flows[1].appName}`),
    subtitle: cleanVisualSentence(args.subtitle || blueprint?.subtitle, "Evidence-led comparison of the observed user journeys"),
    summary,
    flows,
    keyPatterns,
    matrixRows,
    stageSeries,
    evidenceNotes,
    hypotheses,
    executive: {
      headline: summary,
      appSummaries,
      keyTakeaway,
      strategicImplication: "Choose the experience philosophy that matches the company's primary growth constraint, then validate the trade-off with real progression and conversion data.",
      recommendations: Array.from(new Set(recommendations)).slice(0, 4),
      nextSteps: ["Validate the strongest assumptions with user testing", "Instrument conversion and abandonment at each stage", "Iterate on the highest-friction moments first"],
    },
  };
}

const NORTHSTAR_VISUAL_TOKENS = {
  surface: "#FFFFFF",
  board: "#F7F7FC",
  line: "#E7E6F0",
  text: "#171820",
  muted: "#737886",
  violet: "#6B5CFF",
  violetSoft: "#F1EEFF",
  orange: "#FF6B2C",
  orangeSoft: "#FFF0E8",
  green: "#20A45B",
  greenSoft: "#ECF9F1",
  blue: "#4F7CFF",
  blueSoft: "#EEF4FF",
  shadow: "0 12px 36px rgba(35,30,78,0.075)",
  radius: 20,
} as const;

function createVisualPrimitive(
  type: CanvasBoxType,
  rect: Rect,
  options: {
    id: string;
    artifactId: string;
    role: CanvasSemanticRole;
    label: string;
    parentId?: string;
    sectionId?: string;
    componentId?: string;
    componentType?: string;
    layoutRole?: CanvasObjectSemanticMeta["layoutRole"];
    layout?: CanvasLayoutSpec;
    layoutItem?: CanvasLayoutItemSpec;
    editable?: boolean;
    detachable?: boolean;
    provenanceIds?: string[];
    surfaceKind?: CanvasSurfaceKind;
    surfaceRootId?: string;
    sceneRevision?: string;
    text?: string;
    imageUrl?: string;
    cells?: string[][];
    rows?: number;
    cols?: number;
    source?: CanvasObjectSource;
    style?: Partial<CanvasObjectStyle>;
    visualBoard?: NorthStarVisualBoardDocument;
  },
): CanvasBoxObject {
  const base = createBoxObject(type === "visual-board" ? "card" : type as BoxTool, rect);
  return {
    ...base,
    id: options.id,
    type,
    text: options.text ?? "",
    textHtml: options.text !== undefined ? htmlFromPlainText(options.text) : undefined,
    imageUrl: options.imageUrl,
    rows: options.rows,
    cols: options.cols,
    cells: options.cells,
    source: options.source ?? { kind: "generated" },
    semantic: {
      artifactId: options.artifactId,
      role: options.role,
      label: options.label,
      parentId: options.parentId,
      sectionId: options.sectionId,
      componentId: options.componentId,
      componentType: options.componentType,
      layoutRole: options.layoutRole,
      layout: options.layout,
      layoutItem: options.layoutItem,
      editable: options.editable ?? true,
      detachable: options.detachable ?? true,
      provenanceIds: options.provenanceIds,
      surfaceKind: options.surfaceKind,
      surfaceRootId: options.surfaceRootId,
      sceneRevision: options.sceneRevision,
    },
    visualBoard: options.visualBoard,
    style: {
      ...base.style,
      fill: options.style?.fill ?? "transparent",
      stroke: options.style?.stroke ?? "transparent",
      strokeWidth: options.style?.strokeWidth ?? 0,
      textColor: options.style?.textColor ?? NORTHSTAR_VISUAL_TOKENS.text,
      fontSize: options.style?.fontSize ?? 14,
      fontWeight: options.style?.fontWeight ?? 600,
      textAlign: options.style?.textAlign ?? "left",
      radius: options.style?.radius,
      shadow: options.style?.shadow,
      opacity: options.style?.opacity,
    },
  };
}

function buildManualVisualComponentPreset(
  preset: CanvasComponentPreset,
  point: { x: number; y: number },
): CanvasObject[] {
  const artifactId = `manual-component-${makeId()}`;
  const objects: CanvasObject[] = [];
  const add = <T extends CanvasObject>(object: T): T => {
    objects.push(object);
    return object;
  };

  const t = NORTHSTAR_VISUAL_TOKENS;
  const ink = t.text;
  const muted = t.muted;
  const line = t.line;
  const violet = t.violet;
  const blue = t.blue;
  const green = t.green;
  const orange = t.orange;
  const paper = "#FFFFFF";
  const wash = "#F8F7FF";
  const grid = "#F4F2FA";

  const layout = (
    kind: CanvasLayoutKind,
    gap: number,
    padding: number,
    extra: Partial<CanvasLayoutSpec> = {},
  ): CanvasLayoutSpec => ({
    kind,
    gap,
    paddingTop: padding,
    paddingRight: padding,
    paddingBottom: padding,
    paddingLeft: padding,
    align: "stretch",
    resizeBehavior: "reflow",
    ...extra,
  });

  const root = (
    componentType: string,
    w: number,
    h: number,
    layoutSpec: CanvasLayoutSpec,
    options: {
      shape?: CanvasBoxType;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      radius?: number;
      shadow?: string;
      role?: CanvasSemanticRole;
    } = {},
  ) => add(createVisualPrimitive(options.shape ?? "card", { x: point.x - w / 2, y: point.y - h / 2, w, h }, {
    id: stableVisualBoardId([artifactId, "root"]),
    artifactId,
    role: options.role ?? "visual-component",
    label: componentType,
    componentId: artifactId,
    componentType,
    layoutRole: "container",
    layout: layoutSpec,
    style: {
      fill: options.fill ?? paper,
      stroke: options.stroke ?? line,
      strokeWidth: options.strokeWidth ?? 1,
      radius: options.radius ?? 18,
      shadow: options.shadow ?? t.shadow,
    },
  }));

  const box = (
    parent: CanvasBoxObject,
    key: string,
    basis: number,
    options: {
      shape?: CanvasBoxType;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      radius?: number;
      shadow?: string;
      layoutSpec?: CanvasLayoutSpec;
      order?: number;
      grow?: number;
      role?: CanvasSemanticRole;
      componentType?: string;
      layoutRole?: CanvasObjectSemanticMeta["layoutRole"];
      alignSelf?: CanvasLayoutAlign;
    } = {},
  ) => add(createVisualPrimitive(options.shape ?? "card", { x: parent.x, y: parent.y, w: parent.w, h: basis }, {
    id: stableVisualBoardId([artifactId, key]),
    artifactId,
    role: options.role ?? "visual-component",
    label: key,
    parentId: parent.id,
    componentId: parent.id,
    componentType: options.componentType ?? key,
    layoutRole: options.layoutRole ?? "container",
    layout: options.layoutSpec,
    layoutItem: { order: options.order ?? objects.length, basis, grow: options.grow, alignSelf: options.alignSelf },
    style: {
      fill: options.fill ?? "transparent",
      stroke: options.stroke ?? "transparent",
      strokeWidth: options.strokeWidth ?? 0,
      radius: options.radius ?? 12,
      shadow: options.shadow,
    },
  }));

  const text = (
    parent: CanvasBoxObject,
    key: string,
    value: string,
    basis: number,
    options: {
      order?: number;
      role?: CanvasSemanticRole;
      layoutRole?: CanvasObjectSemanticMeta["layoutRole"];
      fontSize?: number;
      fontWeight?: number;
      textColor?: string;
      textAlign?: TextAlign;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      radius?: number;
      grow?: number;
      alignSelf?: CanvasLayoutAlign;
      componentType?: string;
    } = {},
  ) => add(createVisualPrimitive("text", { x: parent.x, y: parent.y, w: parent.w, h: basis }, {
    id: stableVisualBoardId([artifactId, key]),
    artifactId,
    role: options.role ?? "visual-body",
    label: value,
    parentId: parent.id,
    componentId: parent.id,
    componentType: options.componentType ?? key,
    layoutRole: options.layoutRole ?? "label",
    layoutItem: { order: options.order ?? objects.length, basis, grow: options.grow, alignSelf: options.alignSelf },
    text: value,
    style: {
      fill: options.fill ?? "transparent",
      stroke: options.stroke ?? "transparent",
      strokeWidth: options.strokeWidth ?? 0,
      textColor: options.textColor ?? ink,
      fontSize: options.fontSize ?? 13,
      fontWeight: options.fontWeight ?? 650,
      textAlign: options.textAlign ?? "left",
      radius: options.radius,
    },
  }));

  const eyebrow = (parent: CanvasBoxObject, value: string, color: string = violet, order = 0) =>
    text(parent, `eyebrow-${value}`, value.toUpperCase(), 18, {
      order,
      role: "visual-caption",
      fontSize: 10,
      fontWeight: 950,
      textColor: color,
    });

  const title = (parent: CanvasBoxObject, key: string, value: string, basis = 38, order = 1) =>
    text(parent, key, value, basis, {
      order,
      role: "visual-heading",
      fontSize: 22,
      fontWeight: 950,
      textColor: ink,
    });

  const body = (parent: CanvasBoxObject, key: string, value: string, basis = 44, order = 2) =>
    text(parent, key, value, basis, {
      order,
      role: "visual-body",
      fontSize: 12,
      fontWeight: 560,
      textColor: "#4D5262",
    });

  const chip = (
    parent: CanvasBoxObject,
    key: string,
    value: string,
    fill: string,
    color: string,
    basis = 32,
    order = objects.length,
  ) => text(parent, key, value, basis, {
    order,
    role: "visual-stage-badge",
    layoutRole: "item",
    fontSize: 11,
    fontWeight: 850,
    textColor: color,
    fill,
    stroke: "transparent",
    radius: 999,
    textAlign: "center",
  });

  const headerTag = (
    parent: CanvasBoxObject,
    key: string,
    value: string,
    color: string,
    basis = 78,
    order = 0,
  ) => text(parent, key, value.toUpperCase(), 30, {
    order,
    role: "visual-stage-badge",
    componentType: "structure-header-tag",
    fontSize: 9,
    fontWeight: 950,
    textColor: color,
    textAlign: "center",
    fill: color === violet ? "#F2EEFF" : color === blue ? "#EEF4FF" : "#F4F2FA",
    radius: 999,
    alignSelf: "center",
  });

  const statDot = (parent: CanvasBoxObject, key: string, fill: string, order: number) =>
    add(createVisualPrimitive("circle", { x: parent.x, y: parent.y, w: 14, h: 14 }, {
      id: stableVisualBoardId([artifactId, key]),
      artifactId,
      role: "visual-stage-badge",
      label: key,
      parentId: parent.id,
      componentId: parent.id,
      layoutRole: "item",
      layoutItem: { order, basis: 14, alignSelf: "center" },
      style: { fill, stroke: paper, strokeWidth: 2, radius: 999, shadow: "0 3px 10px rgba(15, 23, 42, 0.12)" },
    }));

  const addDivider = (parent: CanvasBoxObject, key: string, order: number) =>
    box(parent, key, 1, { shape: "rect", fill: line, order, componentType: "divider", layoutRole: "item" });

  const screenSlot = (parent: CanvasBoxObject, key: string, index: number, stageColor: string, basis = 98) => {
    const slot = box(parent, key, basis, {
      shape: "frame",
      fill: "#FFFFFF",
      stroke: "#E5E2F2",
      strokeWidth: 1,
      radius: 14,
      order: index,
      layoutSpec: layout("vertical", 4, 8, { align: "center" }),
      componentType: "drop-screen-slot",
      role: "visual-flow-screen",
      layoutRole: "container",
    });
    statDot(slot, `${key}-dot`, stageColor, 0);
    text(slot, `${key}-index`, String(index + 1).padStart(2, "0"), 20, {
      order: 1,
      fontSize: 10,
      fontWeight: 950,
      textAlign: "center",
      textColor: stageColor,
      role: "visual-stage-badge",
    });
    text(slot, `${key}-drop`, "Add screen", 24, {
      order: 2,
      fontSize: 10,
      fontWeight: 720,
      textAlign: "center",
      textColor: muted,
      role: "visual-caption",
    });
    return slot;
  };

  if (preset === "stack") {
    const container = root("stack", 480, 410, layout("vertical", 14, 24), { shape: "frame", fill: "#FFFFFF", stroke: "#E5E2EF", strokeWidth: 1, radius: 20 });
    eyebrow(container, "Stack", violet, 0);
    title(container, "title", "Modular vertical rhythm", 40, 1);
    const stackBody = box(container, "stack-body", 270, { order: 2, fill: "#FAFAFD", stroke: "#E7E5EF", strokeWidth: 1, radius: 16, layoutSpec: layout("vertical", 10, 14), componentType: "smart-stack" });
    ["Primary block", "Supporting block", "Optional block"].forEach((label, index) => {
      const item = box(stackBody, `stack-item-${index}`, index === 0 ? 76 : 64, { order: index, fill: index === 0 ? "#F4F1FF" : "#FFFFFF", stroke: index === 0 ? "#8C7CFF" : "#E4E1EF", strokeWidth: index === 0 ? 1.5 : 1, radius: 13, layoutSpec: layout("horizontal", 10, 12, { align: "center" }), componentType: "stack-item" });
      chip(item, `stack-index-${index}`, `0${index + 1}`, index === 0 ? "#6B5CFF" : "#EEEAFE", index === 0 ? "#FFFFFF" : violet, 42, 0);
      text(item, `stack-label-${index}`, label, 36, { order: 1, grow: 1, fontSize: 13, fontWeight: 820, componentType: "structure-centered-label" });
      if (index === 0) chip(item, "stack-primary-state", "ACTIVE", "#E9E5FF", violet, 66, 2);
    });
  } else if (preset === "rail") {
    const container = root("rail", 520, 470, layout("horizontal", 18, 22), { shape: "frame", fill: "#FFFFFF", stroke: "#E6E3EF", strokeWidth: 1, radius: 22 });
    const railBody = box(container, "rail-body", 146, { order: 0, fill: "#F8F7FF", stroke: "#E2DCFF", strokeWidth: 1, radius: 18, layoutSpec: layout("vertical", 10, 12), componentType: "smart-rail" });
    eyebrow(railBody, "Rail", violet, 0);
    ["01", "02", "03", "04", "05"].forEach((value, index) => chip(railBody, `rail-index-${index}`, value, index === 1 ? "#6B5CFF" : "#ECE9FF", index === 1 ? "#FFFFFF" : violet, 46, index + 1));
    const railContent = box(container, "rail-content", 420, { order: 1, grow: 1, layoutSpec: layout("vertical", 12, 0), componentType: "rail-content" });
    title(railContent, "title", "Persistent sequence rail", 42, 0);
    body(railContent, "body", "Use as navigation, evidence index, story rail, or journey anchor.", 48, 1);
    const active = box(railContent, "active-panel", 220, { order: 2, fill: "#FAFAFD", stroke: "#E5E2EF", strokeWidth: 1, radius: 16, layoutSpec: layout("vertical", 10, 16), componentType: "rail-active-panel" });
    text(active, "active-label", "02  Evidence", 34, { order: 0, fontSize: 14, fontWeight: 900, textColor: violet, componentType: "structure-centered-label" });
    [0, 1, 2].forEach((index) => box(active, `rail-line-${index}`, 24, { order: index + 1, fill: index === 0 ? "#D9D2FF" : "#ECEAF2", radius: 999, componentType: "rail-line" }));
  } else if (preset === "lane") {
    const container = root("lane", 860, 340, layout("vertical", 14, 22), { shape: "frame", fill: "#FFFFFF", stroke: "#E4E1ED", strokeWidth: 1, radius: 20 });
    const laneHeader = box(container, "lane-header", 56, { order: 0, layoutSpec: layout("horizontal", 12, 0, { align: "center" }), componentType: "flow-lane-header" });
    chip(laneHeader, "lane-tag", "FLOW LANE", "#141829", "#FFFFFF", 92, 0);
    text(laneHeader, "lane-title", "Ordered reference flow", 34, { order: 1, grow: 1, fontSize: 17, fontWeight: 900 });
    chip(laneHeader, "lane-direction", "→", "#F2EEFF", violet, 42, 2);
    const laneBody = box(container, "lane-body", 210, { order: 1, fill: "#FAFAFD", stroke: "#E6E4EE", strokeWidth: 1, radius: 16, layoutSpec: layout("horizontal", 10, 14, { align: "center" }), componentType: "smart-flow-lane" });
    ["Trigger", "Discover", "Decide", "Build", "Validate", "Outcome"].forEach((label, index) => {
      const stage = box(laneBody, `lane-stage-${index}`, 122, { order: index, fill: index === 2 ? "#F3F0FF" : "#FFFFFF", stroke: index === 2 ? "#9E91FF" : "#DDD9E8", strokeWidth: index === 2 ? 1.5 : 1, radius: 12, layoutSpec: layout("vertical", 5, 10, { align: "center" }), componentType: "flow-stage" });
      chip(stage, `lane-number-${index}`, String(index + 1).padStart(2, "0"), index === 2 ? "#6B5CFF" : "#EEEAFE", index === 2 ? "#FFFFFF" : violet, 34, 0);
      text(stage, `lane-label-${index}`, label, 34, { order: 1, fontSize: 11, fontWeight: 850, textAlign: "center" });
    });
  } else if (preset === "grid-layout") {
    const container = root("grid-layout", 700, 520, layout("vertical", 14, 22), { shape: "frame", fill: "#FFFFFF", stroke: "#E3E0EB", strokeWidth: 1, radius: 18 });
    eyebrow(container, "Grid", blue, 0);
    title(container, "title", "Two-dimensional system", 42, 1);
    const gridBody = box(container, "grid-body", 390, { order: 2, fill: "#FAFBFF", stroke: "#DEE5F1", strokeWidth: 1, radius: 16, layoutSpec: layout("grid", 12, 14, { columns: 3 }), componentType: "smart-grid" });
    Array.from({ length: 9 }).forEach((_, index) => box(gridBody, `grid-cell-${index}`, 112, { order: index, fill: "#FFFFFF", stroke: "#DDE2EC", strokeWidth: 1, radius: 10, componentType: "grid-cell" }));
  } else if (preset === "cluster") {
    const container = root("cluster", 650, 430, layout("vertical", 14, 22), { shape: "frame", fill: "#FFFFFF", stroke: "#E5E2EF", strokeWidth: 1, radius: 22 });
    eyebrow(container, "Cluster", violet, 0);
    title(container, "title", "Contextual grouping field", 40, 1);
    const clusterBody = box(container, "cluster-body", 300, { order: 2, shape: "frame", fill: "rgba(107,92,255,0.025)", stroke: "rgba(107,92,255,0.42)", strokeWidth: 1.5, radius: 22, layoutSpec: layout("grid", 18, 20, { columns: 2 }), componentType: "smart-cluster" });
    [["Evidence", "#F2EEFF"], ["Insight", "#EDF4FF"], ["Source", "#ECFBF1"], ["Decision", "#FFF5E8"]].forEach(([label, fill], index) => {
      const item = box(clusterBody, `cluster-item-${index}`, index % 2 === 0 ? 104 : 126, { order: index, fill, stroke: "transparent", radius: index === 1 ? 18 : index === 2 ? 6 : 12, layoutSpec: layout("vertical", 6, 12), componentType: "cluster-item" });
      text(item, `cluster-label-${index}`, label, 28, { order: 0, fontSize: 12, fontWeight: 900 });
      body(item, `cluster-body-${index}`, "Related block", 32, 1);
    });
  } else if (preset === "spine") {
    const container = root("spine", 620, 550, layout("vertical", 14, 24), { shape: "frame", fill: "#FFFFFF", stroke: "#E3E0EB", strokeWidth: 1, radius: 22 });
    eyebrow(container, "Spine", violet, 0);
    title(container, "title", "Narrative backbone", 42, 1);
    const spineBody = box(container, "spine-body", 400, { order: 2, fill: "#FBFBFE", stroke: "#E6E3EF", strokeWidth: 1, radius: 18, layoutSpec: layout("vertical", 6, 18), componentType: "smart-spine" });
    [
      ["Question", violet, "What are we trying to resolve?"],
      ["Evidence", blue, "What proves or disproves it?"],
      ["Insight", green, "What does the evidence reveal?"],
      ["Decision", orange, "What choice follows?"],
      ["Action", violet, "What happens next?"],
    ].forEach(([label, color, note], index) => {
      const row = box(spineBody, `spine-row-${index}`, 68, { order: index, layoutSpec: layout("horizontal", 0, 0, { align: "center" }), componentType: "spine-node-row" });
      const axis = box(row, `spine-axis-${index}`, 44, { order: 0, fill: "transparent", layoutSpec: layout("vertical", 0, 0, { align: "center", justify: "center" }), componentType: "spine-axis" });
      if (index > 0) box(axis, `spine-line-top-${index}`, 22, { order: 0, shape: "rect", fill: "#CFC9E3", radius: 999, componentType: "spine-line", alignSelf: "center" });
      statDot(axis, `spine-dot-${index}`, color, 1);
      if (index < 4) box(axis, `spine-line-bottom-${index}`, 22, { order: 2, shape: "rect", fill: "#CFC9E3", radius: 999, componentType: "spine-line", alignSelf: "center" });
      box(row, `spine-branch-${index}`, 28, { order: 1, shape: "rect", fill: index === 2 ? color : "#D9D5E6", radius: 999, componentType: "spine-branch", alignSelf: "center" });
      const node = box(row, `spine-content-${index}`, 520, { order: 2, grow: 1, fill: index === 2 ? "#F5F2FF" : "#FFFFFF", stroke: index === 2 ? "#BFB5FF" : "#E7E4EF", strokeWidth: 1, radius: 12, layoutSpec: layout("horizontal", 10, 14, { align: "center" }), componentType: "spine-content" });
      text(node, `spine-label-${index}`, label, 86, { order: 0, fontSize: 13, fontWeight: 900, textColor: color, componentType: "structure-centered-label" });
      text(node, `spine-note-${index}`, note, 36, { order: 1, grow: 1, fontSize: 11, fontWeight: 650, textColor: muted, componentType: "structure-centered-label" });
      chip(node, `spine-state-${index}`, index === 2 ? "FOCUS" : "OPEN", index === 2 ? "#E8E2FF" : "#F1F0F5", index === 2 ? violet : muted, 64, 2);
    });
  } else if (preset === "shelf") {
    const container = root("shelf", 860, 330, layout("vertical", 14, 22), { shape: "frame", fill: "#FFFFFF", stroke: "#E2DFEA", strokeWidth: 1, radius: 22 });
    const shelfHeader = box(container, "shelf-header", 48, { order: 0, layoutSpec: layout("horizontal", 10, 0, { align: "center" }), componentType: "shelf-header" });
    headerTag(shelfHeader, "shelf-tag", "Shelf", blue, 72, 0);
    text(shelfHeader, "shelf-title", "Reference collection", 34, { order: 1, grow: 1, fontSize: 18, fontWeight: 900, componentType: "structure-centered-label" });
    chip(shelfHeader, "shelf-count", "6 ITEMS", "#EEF4FF", blue, 78, 2);
    const shelfBody = box(container, "shelf-body", 202, { order: 1, fill: "#F8FAFC", stroke: "#E1E7EF", strokeWidth: 1, radius: 16, layoutSpec: layout("horizontal", 12, 16, { align: "end" }), componentType: "smart-shelf" });
    [0, 1, 2, 3, 4].forEach((index) => box(shelfBody, `shelf-item-${index}`, index === 2 ? 150 : 126, { order: index, fill: index === 2 ? "#F3F0FF" : "#FFFFFF", stroke: index === 2 ? "#9E91FF" : "#DDE3EC", strokeWidth: index === 2 ? 1.5 : 1, radius: index === 1 ? 6 : 12, shadow: "0 8px 18px rgba(15,23,42,0.06)", componentType: "shelf-item" }));
    box(container, "shelf-scroll", 8, { order: 2, shape: "pill", fill: "#DADFF0", radius: 999, componentType: "shelf-scroll-track" });
  } else if (preset === "drawer") {
    const container = root("drawer", 560, 540, layout("horizontal", 0, 0), { fill: "#FFFFFF", stroke: "#E1DDE9", strokeWidth: 1, radius: 22, shadow: "0 24px 70px rgba(15,23,42,0.13)" });
    const workspace = box(container, "drawer-workspace", 350, { order: 0, grow: 1, fill: "#FAFAFD", layoutSpec: layout("vertical", 12, 20), componentType: "drawer-workspace" });
    eyebrow(workspace, "Drawer", violet, 0);
    title(workspace, "drawer-title", "Pull-out workspace", 42, 1);
    body(workspace, "drawer-context", "A docked context area that stays connected to the composition.", 54, 2);
    const compartments = box(container, "drawer-compartments", 210, { order: 1, fill: "#F6F3FF", stroke: "#DDD6FF", strokeWidth: 1, radius: 20, layoutSpec: layout("vertical", 10, 14), componentType: "smart-drawer" });
    ["Context", "Sources", "Notes", "Links", "Actions"].forEach((label, index) => {
      const row = box(compartments, `drawer-row-${index}`, 58, { order: index, fill: index === 0 ? "#FFFFFF" : "rgba(255,255,255,0.62)", stroke: "#E3DFF0", strokeWidth: 1, radius: 10, layoutSpec: layout("horizontal", 8, 10, { align: "center" }), componentType: "drawer-compartment" });
      text(row, `drawer-label-${index}`, label, 30, { order: 0, grow: 1, fontSize: 12, fontWeight: 820, componentType: "structure-centered-label" });
      chip(row, `drawer-count-${index}`, String(index + 1), "#EAE5FF", violet, 30, 1);
    });
  } else if (preset === "compare-frame") {
    const container = root("compare-frame", 900, 520, layout("vertical", 14, 22), { shape: "frame", fill: "#FFFFFF", stroke: "#DFDCE8", strokeWidth: 1, radius: 22 });
    eyebrow(container, "Compare frame", violet, 0);
    title(container, "title", "Side-by-side synthesis", 42, 1);
    const split = box(container, "split", 384, { order: 2, fill: "#FAFAFD", stroke: "#E3E0EA", strokeWidth: 1, radius: 16, layoutSpec: layout("horizontal", 0, 0), componentType: "smart-compare-frame" });
    ["Option A", "Option B"].forEach((label, index) => {
      const panel = box(split, `compare-panel-${index}`, 450, { order: index, grow: 1, fill: index === 0 ? "#FFFFFF" : "#FCFBFF", stroke: index === 0 ? "transparent" : "#E5E1F3", strokeWidth: index === 0 ? 0 : 1, radius: 0, layoutSpec: layout("vertical", 12, 18), componentType: "compare-panel" });
      text(panel, `compare-title-${index}`, label, 34, { order: 0, fontSize: 16, fontWeight: 900, textColor: index === 0 ? ink : violet });
      [0, 1, 2].forEach((row) => box(panel, `compare-line-${index}-${row}`, 34, { order: row + 1, fill: row === 0 ? "#E9E5FF" : "#ECEAF1", radius: 999, componentType: "compare-content-line" }));
    });
  } else if (preset === "workspace-frame") {
    const container = root("workspace-frame", 960, 560, layout("vertical", 12, 18), { shape: "frame", fill: "#FFFFFF", stroke: "#DDD9E8", strokeWidth: 1, radius: 22 });
    const header = box(container, "workspace-header", 48, { order: 0, layoutSpec: layout("horizontal", 10, 0, { align: "center" }), componentType: "workspace-header" });
    headerTag(header, "workspace-tag", "Workspace", blue, 92, 0);
    text(header, "workspace-title", "Composition surface", 32, { order: 1, grow: 1, fontSize: 17, fontWeight: 900, componentType: "structure-centered-label" });
    chip(header, "workspace-grid-state", "GRID ON", "#EEF4FF", blue, 80, 2);
    const surface = box(container, "workspace-surface", 448, { order: 1, fill: "#FBFCFF", stroke: "#E2E6F0", strokeWidth: 1, radius: 16, layoutSpec: layout("grid", 18, 24, { columns: 3 }), componentType: "smart-workspace-frame" });
    box(surface, "workspace-add", 136, { order: 0, fill: "rgba(107,92,255,0.03)", stroke: "rgba(107,92,255,0.35)", strokeWidth: 1.5, radius: 14, componentType: "workspace-add-zone" });
    const note = box(surface, "workspace-note", 110, { order: 1, fill: "#F3F0FF", stroke: "#C8BFFF", strokeWidth: 1, radius: 10, componentType: "workspace-block" });
    const evidence = box(surface, "workspace-evidence", 160, { order: 5, fill: "#ECFBF1", stroke: "#C8EFD5", strokeWidth: 1, radius: 10, componentType: "workspace-block" });
    box(surface, "workspace-image", 120, { order: 8, fill: "#EAF2FF", stroke: "#C5D9FF", strokeWidth: 1, radius: 8, componentType: "workspace-media" });
  } else if (preset === "drop-zone") {
    const container = root("drop-zone", 360, 280, layout("vertical", 10, 28, { align: "center", justify: "center" }), { shape: "frame", fill: "rgba(107,92,255,0.035)", stroke: "rgba(107,92,255,0.48)", strokeWidth: 1.5, radius: 18, shadow: "none" });
    text(container, "plus", "+", 84, { order: 0, fontSize: 62, fontWeight: 300, textAlign: "center", textColor: violet });
    text(container, "title", "Drop content", 32, { order: 1, fontSize: 16, fontWeight: 900, textAlign: "center" });
    body(container, "body", "Accept blocks, screenshots, notes, or sources.", 44, 2);
  } else if (preset === "stage-marker") {
    const container = root("stage-marker", 300, 92, layout("horizontal", 10, 12, { align: "center" }), { shape: "pill", fill: "#F2EEFF", stroke: "#9A8DFF", strokeWidth: 1.5, radius: 999, shadow: "0 10px 28px rgba(107,92,255,0.12)" });
    chip(container, "index", "01", "#6B5CFF", "#FFFFFF", 54, 0);
    text(container, "label", "Stage 1", 42, { order: 1, grow: 1, fontSize: 17, fontWeight: 900, textColor: violet });
  } else if (preset === "source-chip") {
    const container = root("source-chip", 280, 86, layout("horizontal", 10, 12, { align: "center" }), { shape: "pill", fill: "#F3FFF7", stroke: "#48B977", strokeWidth: 1.25, radius: 999, shadow: "0 8px 22px rgba(32,164,91,0.08)" });
    statDot(container, "source-dot", green, 0);
    text(container, "label", "Survey", 34, { order: 1, grow: 1, fontSize: 15, fontWeight: 850, textColor: "#148546" });
    chip(container, "linked", "LINKED", "#DDF7E6", "#148546", 70, 2);
  } else if (preset === "confidence-badge") {
    const container = root("confidence-badge", 340, 220, layout("horizontal", 18, 20, { align: "center" }), { fill: "#FFFFFF", radius: 20 });
    const ring = box(container, "ring", 120, { order: 0, shape: "circle", fill: "#F4FFF7", stroke: "#27AE60", strokeWidth: 8, radius: 999, layoutSpec: layout("vertical", 0, 0, { align: "center", justify: "center" }), componentType: "confidence-ring" });
    text(ring, "value", "75%", 50, { order: 0, fontSize: 25, fontWeight: 950, textAlign: "center", textColor: "#148546" });
    const details = box(container, "details", 160, { order: 1, grow: 1, layoutSpec: layout("vertical", 8, 0), componentType: "confidence-details" });
    eyebrow(details, "Confidence", green, 0);
    text(details, "label", "High confidence", 34, { order: 1, fontSize: 18, fontWeight: 900 });
    const track = box(details, "track", 18, { order: 2, shape: "pill", fill: "#E8F5EC", radius: 999, componentType: "progress-track" });
    box(track, "fill", 18, { order: 0, shape: "pill", fill: green, radius: 999, componentType: "progress-fill" });
    body(details, "note", "Linked to complete evidence", 38, 3);
  } else if (preset === "citation-chip") {
    const container = root("citation-chip", 300, 96, layout("horizontal", 12, 14, { align: "center" }), { fill: "#FFFFFF", stroke: "#D9D5E8", strokeWidth: 1, radius: 14, shadow: "0 8px 22px rgba(15,23,42,0.06)" });
    text(container, "quote", "“", 50, { order: 0, fontSize: 42, fontWeight: 900, textAlign: "center", textColor: violet });
    text(container, "label", "Smith 2023", 38, { order: 1, grow: 1, fontSize: 15, fontWeight: 850 });
  } else if (preset === "screenshot-tile") {
    const container = root("screenshot-tile", 380, 280, layout("vertical", 10, 14), { fill: "#FFFFFF", stroke: "#DCE1EA", strokeWidth: 1, radius: 16 });
    eyebrow(container, "Screenshot", violet, 0);
    const media = box(container, "media", 180, { order: 1, shape: "frame", fill: "#101827", stroke: "#28344A", strokeWidth: 1, radius: 10, layoutSpec: layout("vertical", 10, 18, { align: "center", justify: "center" }), componentType: "screenshot-drop-slot" });
    text(media, "drop", "Drop screenshot", 34, { order: 0, fontSize: 14, fontWeight: 850, textAlign: "center", textColor: "#C9D3E6" });
    body(container, "caption", "Visual evidence with provenance", 34, 2);
  } else if (preset === "metric-tile") {
    const container = root("metric-tile", 330, 210, layout("vertical", 8, 20), { fill: "#FFFFFF", radius: 18 });
    eyebrow(container, "Metric", blue, 0);
    text(container, "metric-label", "ARR", 24, { order: 1, fontSize: 13, fontWeight: 850, textColor: muted });
    text(container, "metric-value", "$12.4M", 64, { order: 2, role: "visual-metric", fontSize: 42, fontWeight: 950 });
    chip(container, "metric-delta", "↑ 18% vs Q1", "#EAF8EF", "#148546", 112, 3);
  } else if (preset === "quote-block") {
    const container = root("quote-block", 440, 230, layout("vertical", 10, 24), { shape: "rect", fill: "#F5F1FF", stroke: "#CFC6FF", strokeWidth: 1, radius: 8, shadow: "0 14px 32px rgba(107,92,255,0.08)" });
    text(container, "quote-mark", "“", 42, { order: 0, fontSize: 50, fontWeight: 950, textColor: violet });
    text(container, "quote", "The north star changed how we think about value.", 92, { order: 1, fontSize: 20, fontWeight: 760, textColor: "#29223D" });
    text(container, "attribution", "— Product leader", 28, { order: 2, fontSize: 12, fontWeight: 750, textColor: muted, textAlign: "right" });
  } else if (preset === "status-pill") {
    const container = root("status-pill", 250, 72, layout("horizontal", 10, 12, { align: "center" }), { shape: "pill", fill: "#F0FFF5", stroke: "#48B977", strokeWidth: 1.25, radius: 999, shadow: "0 8px 22px rgba(32,164,91,0.08)" });
    statDot(container, "status-dot", green, 0);
    text(container, "label", "On track", 34, { order: 1, grow: 1, fontSize: 15, fontWeight: 850, textColor: "#148546" });
  } else if (preset === "flow-lane") {
    const container = root("flow-lane", 980, 220, layout("horizontal", 18, 18, { align: "stretch" }), { fill: "#FFFFFF", radius: 18 });
    const identity = box(container, "identity", 170, { order: 0, layoutSpec: layout("vertical", 8, 14), fill: "#111827", radius: 16, componentType: "flow-identity" });
    eyebrow(identity, "Flow lane", "#BDB6FF", 0);
    text(identity, "app", "App / journey", 38, { order: 1, fontSize: 20, fontWeight: 950, textColor: "#FFFFFF", role: "visual-heading" });
    body(identity, "meta", "Stage-based row for screenshots, notes, or product moments.", 62, 2);
    identity.style = { ...identity.style, textColor: "#FFFFFF" };
    const rail = box(container, "stage-rail", 740, { order: 1, grow: 1, fill: "#F7F6FF", stroke: "#ECE8FF", strokeWidth: 1, radius: 16, layoutSpec: layout("horizontal", 12, 12, { align: "center" }), componentType: "stage-rail" });
    [violet, blue, blue, green, green, orange].forEach((color, index) => screenSlot(rail, `slot-${index}`, index, color, 86));
  } else if (preset === "reference-flow") {
    const container = root("reference-flow", 1080, 300, layout("vertical", 16, 20), { shape: "rect", fill: "#FBFBFE", radius: 12 });
    const header = box(container, "header", 58, { order: 0, fill: "transparent", layoutSpec: layout("horizontal", 12, 0, { align: "center" }), componentType: "reference-header" });
    chip(header, "source", "REFERENCE FLOW", "#F2F0FF", violet, 128, 0);
    title(header, "title", "Authoritative journey rail", 42, 1);
    text(header, "meta", "Drop ordered screens, attach sources, then annotate only the decisive moments.", 42, { order: 2, grow: 1, fontSize: 12, fontWeight: 560, textColor: muted });
    const rail = box(container, "rail", 180, { order: 1, fill: "#FFFFFF", stroke: "#E8E6F0", strokeWidth: 1, radius: 10, layoutSpec: layout("horizontal", 14, 16, { align: "center" }), componentType: "reference-rail" });
    [violet, violet, blue, blue, green, green, orange, orange].forEach((color, index) => screenSlot(rail, `reference-slot-${index}`, index, color, 104));
  } else if (preset === "evidence-strip") {
    const container = root("evidence-strip", 760, 260, layout("vertical", 14, 20), { shape: "frame", fill: paper, radius: 10 });
    eyebrow(container, "Evidence strip", green, 0);
    title(container, "claim", "Claim with proof attached", 34, 1);
    const strip = box(container, "strip", 122, { order: 2, fill: "#F8FAFC", stroke: "#E5E7EB", strokeWidth: 1, radius: 8, layoutSpec: layout("horizontal", 12, 12, { align: "center" }), componentType: "curated-evidence-strip" });
    [0, 1, 2, 3, 4].forEach((index) => {
      const proof = box(strip, `proof-${index}`, 96, { order: index, fill: "#FFFFFF", stroke: "#E6E3EF", strokeWidth: 1, radius: index % 2 ? 4 : 18, layoutSpec: layout("vertical", 5, 8), componentType: "evidence-slot", role: "visual-source" });
      text(proof, `proof-tag-${index}`, `E${index + 1}`, 18, { order: 0, fontSize: 9, fontWeight: 950, textColor: index % 2 ? blue : violet, textAlign: "center" });
      text(proof, `proof-note-${index}`, "Drop proof", 34, { order: 1, fontSize: 10, fontWeight: 650, textColor: muted, textAlign: "center" });
    });
    body(container, "caption", "Use this when only the decisive evidence should sit near a claim.", 34, 3);
  } else if (preset === "evidence-card") {
    const container = root("evidence-card", 340, 390, layout("vertical", 12, 18), { fill: "#FFFEFB", stroke: "#EEE7D7", radius: 6 });
    eyebrow(container, "Evidence", green, 0);
    const media = box(container, "media", 170, { order: 1, fill: "#F3F5F9", stroke: "#E5E7EB", strokeWidth: 1, radius: 4, layoutSpec: layout("vertical", 8, 16, { align: "center", justify: "center" }), componentType: "proof-media", role: "visual-source" });
    text(media, "media-label", "Drop screenshot / source", 40, { order: 0, fontSize: 12, fontWeight: 780, textColor: muted, textAlign: "center" });
    title(container, "observation", "Grounded observation", 38, 2);
    body(container, "caption", "Explain what this proves and how it changes the decision.", 58, 3);
    chip(container, "confidence", "HIGH RELEVANCE", "#EAFBF0", green, 110, 4);
  } else if (preset === "source-ledger") {
    const container = root("source-ledger", 860, 380, layout("vertical", 12, 22), { shape: "rect", fill: paper, radius: 8 });
    const top = box(container, "top", 60, { order: 0, layoutSpec: layout("horizontal", 12, 0, { align: "center" }), componentType: "ledger-header" });
    eyebrow(top, "Source ledger", violet, 0);
    title(top, "title", "Proof register", 40, 1);
    chip(top, "status", "EDITABLE ROWS", "#F2F0FF", violet, 120, 2);
    const table = box(container, "ledger-table", 242, { order: 1, fill: "#FFFFFF", stroke: "#E3E2EA", strokeWidth: 1, radius: 2, layoutSpec: layout("grid", 0, 0, { columns: 4 }), componentType: "ledger-grid", role: "visual-matrix" });
    const cells = [
      "Source", "Type", "Relevance", "Proof linked",
      "Awin onboarding", "Flow", "High", "Screens 01–05",
      "Whop onboarding", "Flow", "High", "Screens 01–04",
      "Open question", "Gap", "Medium", "Needs validation",
    ];
    cells.forEach((value, index) => text(table, `cell-${index}`, value, 48, {
      order: index,
      role: "visual-table-cell",
      layoutRole: "item",
      fontSize: 11,
      fontWeight: index < 4 ? 900 : index % 4 === 0 ? 820 : 620,
      textColor: index < 4 ? ink : "#424856",
      fill: index < 4 ? "#F5F2FF" : "#FFFFFF",
      stroke: "#E7E5EF",
      strokeWidth: 1,
      radius: 0,
    }));
  } else if (preset === "executive-summary") {
    const container = root("executive-summary", 620, 360, layout("horizontal", 18, 0), { fill: paper, stroke: "#E7E3F8", radius: 18 });
    const spine = box(container, "spine", 16, { order: 0, shape: "rect", fill: violet, radius: 0, componentType: "accent-spine" });
    spine.style = { ...spine.style, shadow: "0 0 34px rgba(107,92,255,0.22)" };
    const content = box(container, "content", 560, { order: 1, grow: 1, layoutSpec: layout("vertical", 12, 22), componentType: "summary-content" });
    eyebrow(content, "Executive summary", violet, 0);
    text(content, "headline", "The answer leadership can act on", 72, { order: 1, role: "visual-heading", fontSize: 30, fontWeight: 950, textColor: ink });
    body(content, "narrative", "State the decision, strongest evidence, confidence, and implication without burying the point.", 58, 2);
    const bullets = box(content, "proof-bullets", 126, { order: 3, fill: "#F8F7FF", stroke: "#ECE8FF", strokeWidth: 1, radius: 14, layoutSpec: layout("vertical", 8, 14), componentType: "summary-proof" });
    ["What changed", "Why it matters", "What to do next"].forEach((v, i) => text(bullets, `bullet-${i}`, `✓ ${v}`, 24, { order: i, fontSize: 13, fontWeight: 760, textColor: i === 2 ? violet : ink }));
  } else if (preset === "insight-card") {
    const container = root("insight-card", 400, 260, layout("vertical", 14, 22), { shape: "callout", fill: "#FFFFFF", radius: 24 });
    eyebrow(container, "Insight", violet, 0);
    text(container, "quote", "“What the evidence reveals”", 60, { order: 1, role: "visual-insight", fontSize: 26, fontWeight: 950, textColor: ink });
    body(container, "body", "Tie one observation to one implication. Keep it sharp enough to drive the next move.", 62, 2);
    const chips = box(container, "chips", 36, { order: 3, layoutSpec: layout("horizontal", 8, 0), componentType: "insight-tags" });
    chip(chips, "evidence", "EVIDENCE", "#EAFBF0", green, 100, 0);
    chip(chips, "impact", "IMPACT", "#F2F0FF", violet, 86, 1);
  } else if (preset === "decision-card") {
    const container = root("decision-card", 420, 300, layout("vertical", 13, 20), { fill: "#111827", stroke: "#111827", radius: 18 });
    eyebrow(container, "Decision", "#C8C1FF", 0);
    text(container, "title", "Choose a path", 44, { order: 1, role: "visual-heading", fontSize: 25, fontWeight: 950, textColor: "#FFFFFF" });
    body(container, "body", "Decision, rationale, owner, confidence, and evidence are kept together.", 54, 2);
    const criteria = box(container, "criteria", 108, { order: 3, fill: "rgba(255,255,255,0.08)", stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, radius: 14, layoutSpec: layout("vertical", 8, 12), componentType: "decision-criteria" });
    ["Rationale", "Owner", "Evidence link"].forEach((v, i) => text(criteria, `criterion-${i}`, v, 22, { order: i, fontSize: 12, fontWeight: 800, textColor: "#FFFFFF" }));
  } else if (preset === "recommendation-block") {
    const container = root("recommendation-block", 520, 330, layout("vertical", 14, 22), { fill: "#F7F3FF", stroke: "#DACFFF", radius: 28 });
    eyebrow(container, "Recommendation", violet, 0);
    text(container, "title", "Recommended path", 48, { order: 1, role: "visual-recommendation", fontSize: 28, fontWeight: 950, textColor: ink });
    body(container, "body", "Explain why this route wins, what evidence supports it, and what happens next.", 50, 2);
    const steps = box(container, "steps", 132, { order: 3, fill: "#FFFFFF", stroke: "#E6E0FF", strokeWidth: 1, radius: 18, layoutSpec: layout("vertical", 8, 14), componentType: "recommendation-steps" });
    ["Lead with the strongest proof", "Remove the highest-friction step", "Measure impact after rollout"].forEach((v, i) => text(steps, `step-${i}`, `${i + 1}. ${v}`, 26, { order: i, fontSize: 13, fontWeight: 760, textColor: i === 0 ? violet : ink }));
  } else if (preset === "hypothesis-panel") {
    const container = root("hypothesis-panel", 620, 360, layout("vertical", 14, 20), { fill: paper, radius: 18 });
    eyebrow(container, "Hypotheses", green, 0);
    title(container, "title", "Tested assumptions", 36, 1);
    const stack = box(container, "stack", 240, { order: 2, fill: "transparent", layoutSpec: layout("vertical", 10, 0), componentType: "hypothesis-stack" });
    [
      ["H1", "Trust signals improve commitment", "Supported", green],
      ["H2", "Speed reduces drop-off", "Likely", orange],
      ["H3", "More data needed before rollout", "Open", blue],
    ].forEach(([id, claim, status, color], i) => {
      const row = box(stack, `hypothesis-${i}`, 70, { order: i, fill: i === 0 ? "#F0FBF4" : i === 1 ? "#FFF7ED" : "#EFF6FF", stroke: "#E7E5EF", strokeWidth: 1, radius: 14, layoutSpec: layout("horizontal", 10, 12, { align: "center" }), componentType: "hypothesis-row" });
      chip(row, `id-${i}`, String(id), "#FFFFFF", String(color), 48, 0);
      text(row, `claim-${i}`, String(claim), 38, { order: 1, grow: 1, fontSize: 13, fontWeight: 800, textColor: ink });
      chip(row, `status-${i}`, String(status), "#FFFFFF", String(color), 90, 2);
    });
  } else if (preset === "comparison-matrix") {
    const container = root("comparison-matrix", 800, 410, layout("vertical", 14, 22), { shape: "rect", fill: paper, radius: 12 });
    eyebrow(container, "Comparison", violet, 0);
    title(container, "title", "Equivalent dimensions", 36, 1);
    const gridBox = box(container, "grid", 270, { order: 2, fill: "#FFFFFF", stroke: "#E3E2EA", strokeWidth: 1, radius: 8, layoutSpec: layout("grid", 0, 0, { columns: 4 }), componentType: "comparison-grid", role: "visual-matrix" });
    const cells = ["Dimension", "Option A", "Option B", "Edge", "Time to value", "Moderate", "Fast", "B", "Trust", "Strong", "Medium", "A", "Friction", "Higher", "Lower", "B"];
    cells.forEach((value, index) => text(gridBox, `cell-${index}`, value, 54, {
      order: index,
      role: "visual-table-cell",
      layoutRole: "item",
      fontSize: 11,
      fontWeight: index < 4 || index % 4 === 0 ? 900 : 650,
      textColor: index % 4 === 3 && index >= 4 ? violet : ink,
      textAlign: index % 4 === 3 ? "center" : "left",
      fill: index < 4 ? "#F5F2FF" : index % 4 === 3 ? "#FAF8FF" : "#FFFFFF",
      stroke: "#E7E5EF",
      strokeWidth: 1,
      radius: 0,
    }));
  } else if (preset === "matrix") {
    const container = root("matrix", 600, 420, layout("vertical", 12, 20), { shape: "rect", fill: paper, radius: 4 });
    eyebrow(container, "Matrix", blue, 0);
    title(container, "title", "2 × 2 decision space", 36, 1);
    const plane = box(container, "plane", 286, { order: 2, fill: "#FAFAFD", stroke: "#E3E2EA", strokeWidth: 1, radius: 0, layoutSpec: layout("grid", 10, 12, { columns: 2 }), componentType: "quadrant-grid", role: "visual-matrix" });
    ["High confidence", "High upside", "Low risk", "Needs proof"].forEach((v, i) => {
      const cell = box(plane, `quadrant-${i}`, 120, { order: i, fill: i === 0 ? "#F0FBF4" : i === 1 ? "#F5F2FF" : i === 2 ? "#EFF6FF" : "#FFF7ED", stroke: "#E7E5EF", strokeWidth: 1, radius: 10, layoutSpec: layout("vertical", 6, 12), componentType: "matrix-quadrant" });
      text(cell, `quadrant-label-${i}`, v, 30, { order: 0, fontSize: 13, fontWeight: 850, textColor: ink });
      body(cell, `quadrant-body-${i}`, "Drop cards or evidence here.", 42, 1);
    });
  } else if (preset === "stage-map") {
    const container = root("stage-map", 860, 280, layout("vertical", 16, 22), { fill: paper, radius: 18 });
    eyebrow(container, "Stage map", green, 0);
    title(container, "title", "Journey stages", 36, 1);
    const track = box(container, "track", 150, { order: 2, fill: "#F8FAFC", stroke: "#E5E7EB", strokeWidth: 1, radius: 18, layoutSpec: layout("horizontal", 12, 18, { align: "center" }), componentType: "stage-track" });
    ["Aware", "Value", "Action", "Verify", "Activate"].forEach((v, i) => {
      const stage = box(track, `stage-${i}`, 132, { order: i, fill: "#FFFFFF", stroke: "#E7E5EF", strokeWidth: 1, radius: 999, layoutSpec: layout("vertical", 4, 10, { align: "center" }), componentType: "stage-node" });
      statDot(stage, `dot-${i}`, [violet, blue, blue, green, orange][i], 0);
      text(stage, `label-${i}`, v, 26, { order: 1, fontSize: 12, fontWeight: 850, textAlign: "center" });
    });
  } else if (preset === "tradeoff-panel") {
    const container = root("tradeoff-panel", 520, 330, layout("vertical", 12, 22), { fill: "#FFFFFF", radius: 22 });
    eyebrow(container, "Trade-offs", orange, 0);
    title(container, "title", "Tensions to choose between", 36, 1);
    const sliders = box(container, "sliders", 202, { order: 2, layoutSpec: layout("vertical", 12, 0), componentType: "tradeoff-sliders" });
    ["Speed ↔ Trust", "Low friction ↔ Qualification", "Short-term ↔ Durable"].forEach((v, i) => {
      const row = box(sliders, `slider-${i}`, 54, { order: i, layoutSpec: layout("horizontal", 10, 0, { align: "center" }), componentType: "tradeoff-row" });
      text(row, `label-${i}`, v, 130, { order: 0, fontSize: 12, fontWeight: 780, textColor: ink });
      const track = box(row, `track-${i}`, 220, { order: 1, fill: "#EEF0F6", radius: 999, componentType: "slider-track" });
      box(track, `fill-${i}`, 20, { order: 0, fill: [violet, green, orange][i], radius: 999, componentType: "slider-fill" });
      chip(row, `edge-${i}`, i === 0 ? "B" : i === 1 ? "B" : "A", "#F5F2FF", violet, 36, 2);
    });
  } else if (preset === "scorecard") {
    const container = root("scorecard", 460, 360, layout("vertical", 13, 22), { fill: "#0F172A", stroke: "#0F172A", radius: 20 });
    eyebrow(container, "Scorecard", "#86EFAC", 0);
    text(container, "score", "87", 72, { order: 1, role: "visual-metric", fontSize: 56, fontWeight: 950, textColor: "#FFFFFF" });
    const rows = box(container, "rows", 190, { order: 2, fill: "rgba(255,255,255,0.08)", stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, radius: 16, layoutSpec: layout("vertical", 9, 14), componentType: "score-rows" });
    ["Clarity", "Friction", "Trust", "Momentum"].forEach((v, i) => text(rows, `metric-${i}`, `${v}  ${[92, 76, 88, 81][i]}%`, 28, { order: i, fontSize: 13, fontWeight: 800, textColor: "#FFFFFF" }));
  } else if (preset === "chart") {
    const container = root("chart", 660, 420, layout("vertical", 14, 22), { fill: paper, radius: 22 });
    const header = box(container, "header", 58, { order: 0, layoutSpec: layout("horizontal", 10, 0, { align: "center" }), componentType: "chart-header" });
    eyebrow(header, "Chart block", violet, 0);
    title(header, "title", "Choose a chart grammar", 40, 1);
    const tabs = box(container, "tabs", 42, { order: 1, layoutSpec: layout("horizontal", 8, 0), componentType: "chart-tabs" });
    ["Bar", "Line", "Pie", "Scatter"].forEach((v, i) => chip(tabs, `tab-${i}`, v, i === 0 ? "#6B5CFF" : "#F4F2FA", i === 0 ? "#FFFFFF" : ink, 88, i));
    const plot = box(container, "plot", 230, { order: 2, fill: "#F8FAFC", stroke: "#E5E7EB", strokeWidth: 1, radius: 18, layoutSpec: layout("horizontal", 14, 18, { align: "end" }), componentType: "chart-plot" });
    [0.42, 0.7, 0.55, 0.88, 0.62].forEach((ratio, i) => box(plot, `bar-${i}`, 42 + ratio * 130, { order: i, shape: "rect", fill: [violet, blue, green, orange, violet][i], radius: 10, componentType: "chart-mark", alignSelf: "end" }));
  } else if (preset === "timeline") {
    const container = root("timeline", 980, 430, layout("vertical", 14, 24), { shape: "frame", fill: "#FFFFFF", stroke: "#E1DDE9", strokeWidth: 1, radius: 22 });
    const header = box(container, "timeline-header", 58, { order: 0, layoutSpec: layout("horizontal", 12, 0, { align: "center" }), componentType: "timeline-header" });
    headerTag(header, "timeline-tag", "Timeline", blue, 78, 0);
    text(header, "timeline-title", "Milestones and dependencies", 34, { order: 1, grow: 1, fontSize: 20, fontWeight: 950, componentType: "structure-centered-label" });
    chip(header, "timeline-mode", "ROADMAP", "#EEF4FF", blue, 92, 2);
    const timelineCanvas = box(container, "timeline-canvas", 288, { order: 1, fill: "#FAFBFE", stroke: "#E4E7EF", strokeWidth: 1, radius: 18, layoutSpec: layout("vertical", 18, 18), componentType: "smart-timeline" });
    const track = box(timelineCanvas, "timeline-track", 104, { order: 0, fill: "#FFFFFF", stroke: "#E6E8F0", strokeWidth: 1, radius: 16, layoutSpec: layout("horizontal", 0, 10, { align: "center" }), componentType: "timeline-track" });
    ["Discover", "Prototype", "Test", "Launch", "Learn"].forEach((label, index) => {
      const milestone = box(track, `timeline-milestone-${index}`, 176, { order: index, grow: 1, fill: "transparent", layoutSpec: layout("vertical", 6, 2, { align: "center" }), componentType: "timeline-milestone" });
      const axis = box(milestone, `timeline-axis-${index}`, 34, { order: 0, layoutSpec: layout("horizontal", 0, 0, { align: "center" }), componentType: "timeline-axis" });
      box(axis, `timeline-left-${index}`, 58, { order: 0, grow: 1, shape: "rect", fill: index === 0 ? "transparent" : index <= 2 ? "#6B5CFF" : "#D8D4E5", radius: 999, componentType: "timeline-line" });
      box(axis, `timeline-dot-${index}`, 24, { order: 1, shape: "circle", fill: index === 2 ? "#6B5CFF" : "#FFFFFF", stroke: index <= 2 ? "#6B5CFF" : "#BDB8CD", strokeWidth: index === 2 ? 4 : 2, radius: 999, componentType: "timeline-dot", alignSelf: "center" });
      box(axis, `timeline-right-${index}`, 58, { order: 2, grow: 1, shape: "rect", fill: index === 4 ? "transparent" : index < 2 ? "#6B5CFF" : "#D8D4E5", radius: 999, componentType: "timeline-line" });
      text(milestone, `timeline-label-${index}`, label, 28, { order: 1, fontSize: 11, fontWeight: 850, textAlign: "center", textColor: index === 2 ? violet : ink, componentType: "structure-centered-label" });
    });
    const detail = box(timelineCanvas, "timeline-detail", 132, { order: 1, fill: "#FFFFFF", stroke: "#DCD7EB", strokeWidth: 1, radius: 16, layoutSpec: layout("horizontal", 14, 16, { align: "center" }), componentType: "timeline-detail-card" });
    chip(detail, "timeline-detail-index", "03", "#6B5CFF", "#FFFFFF", 48, 0);
    const copy = box(detail, "timeline-detail-copy", 106, { order: 1, grow: 1, layoutSpec: layout("vertical", 4, 0, { justify: "center" }), componentType: "timeline-detail-copy" });
    text(copy, "timeline-detail-title", "Validate the direction", 30, { order: 0, fontSize: 15, fontWeight: 900, componentType: "structure-centered-label" });
    text(copy, "timeline-detail-meta", "Owner · Product    Dependency · Prototype", 24, { order: 1, fontSize: 10, fontWeight: 700, textColor: muted, componentType: "structure-centered-label" });
    chip(detail, "timeline-detail-status", "IN PROGRESS", "#F2EEFF", violet, 104, 2);
  } else if (preset === "research-trail") {
    const container = root("research-trail", 420, 420, layout("vertical", 12, 22), { fill: paper, radius: 20 });
    eyebrow(container, "Research trail", green, 0);
    title(container, "title", "What changed the answer", 40, 1);
    const list = box(container, "list", 280, { order: 2, layoutSpec: layout("vertical", 10, 0), componentType: "research-steps" });
    ["Inspected flows", "Mapped friction", "Tested hypotheses", "Chose recommendation"].forEach((v, i) => {
      const row = box(list, `step-${i}`, 58, { order: i, fill: i === 2 ? "#F5F2FF" : "#FFFFFF", stroke: "#E7E5EF", strokeWidth: 1, radius: 12, layoutSpec: layout("horizontal", 10, 10, { align: "center" }), componentType: "research-step" });
      statDot(row, `step-dot-${i}`, i < 3 ? green : violet, 0);
      text(row, `step-label-${i}`, v, 38, { order: 1, grow: 1, fontSize: 13, fontWeight: 780, textColor: ink });
    });
  } else if (preset === "research-region") {
    const container = root("research-region", 760, 460, layout("vertical", 16, 22), { shape: "frame", fill: "#FFFFFF", radius: 12 });
    eyebrow(container, "Research region", green, 0);
    title(container, "title", "Evidence lab", 38, 1);
    const wall = box(container, "wall", 330, { order: 2, fill: "#FAFBFF", stroke: "#E5E7EB", strokeWidth: 1, radius: 10, layoutSpec: layout("grid", 14, 16, { columns: 3 }), componentType: "research-wall" });
    ["Evidence", "Questions", "Hypotheses", "Decisions", "Sources", "Gaps"].forEach((v, i) => {
      const note = box(wall, `note-${i}`, 120, { order: i, fill: ["#ECFBF1", "#FFF8E8", "#F6F0FF", "#EFF4FF", "#FFFFFF", "#FFF1F2"][i], stroke: "#E7E5EF", strokeWidth: 1, radius: i % 2 ? 4 : 14, layoutSpec: layout("vertical", 6, 12), componentType: "research-note" });
      text(note, `note-title-${i}`, v, 26, { order: 0, fontSize: 13, fontWeight: 900 });
      body(note, `note-body-${i}`, "Drop notes or proof here.", 42, 1);
    });
  } else if (preset === "product-concept") {
    const container = root("product-concept", 940, 560, layout("horizontal", 20, 24), { fill: paper, radius: 24 });
    const screens = box(container, "screens", 440, { order: 0, fill: "#F8FAFC", stroke: "#E5E7EB", strokeWidth: 1, radius: 20, layoutSpec: layout("horizontal", 16, 18, { align: "center" }), componentType: "concept-screens" });
    [0, 1, 2].forEach((i) => {
      const phone = box(screens, `phone-${i}`, 124, { order: i, fill: "#FFFFFF", stroke: i === 1 ? violet : "#DDE1EA", strokeWidth: i === 1 ? 2 : 1, radius: 24, layoutSpec: layout("vertical", 8, 12, { align: "center" }), componentType: "product-screen" });
      text(phone, `phone-label-${i}`, i === 1 ? "Primary" : "Screen", 28, { order: 0, fontSize: 12, fontWeight: 900, textAlign: "center", textColor: i === 1 ? violet : muted });
      box(phone, `phone-area-${i}`, 168, { order: 1, fill: "#F5F2FF", stroke: "transparent", radius: 16, componentType: "screen-area" });
    });
    const strategy = box(container, "strategy", 420, { order: 1, grow: 1, layoutSpec: layout("vertical", 14, 0), componentType: "concept-strategy" });
    eyebrow(strategy, "Product concept", green, 0);
    text(strategy, "title", "Evidence-backed direction", 70, { order: 1, role: "visual-heading", fontSize: 32, fontWeight: 950 });
    body(strategy, "body", "Combine references, design principles, and proposed screens into one editable product direction.", 70, 2);
    const principles = box(strategy, "principles", 160, { order: 3, fill: "#F8F7FF", stroke: "#E7E3FF", strokeWidth: 1, radius: 18, layoutSpec: layout("vertical", 8, 14), componentType: "design-principles" });
    ["Pattern to borrow", "Risk to avoid", "Experiment to run"].forEach((v, i) => text(principles, `principle-${i}`, `• ${v}`, 28, { order: i, fontSize: 13, fontWeight: 800, textColor: ink }));
  } else if (preset === "section") {
    const container = root("section", 760, 460, layout("vertical", 0, 0), { shape: "frame", fill: "#FFFFFF", stroke: "#DFDCE8", strokeWidth: 1, radius: 18 });
    const header = box(container, "section-header", 100, { order: 0, fill: "#FFFFFF", layoutSpec: layout("vertical", 6, 22), componentType: "section-header" });
    eyebrow(header, "Section", violet, 0);
    text(header, "section-title", "Untitled section", 38, { order: 1, fontSize: 22, fontWeight: 950 });
    const content = box(container, "section-content", 278, { order: 1, fill: "#FAFAFD", stroke: "#E5E2EF", strokeWidth: 1, radius: 0, layoutSpec: layout("grid", 12, 18, { columns: 2 }), componentType: "smart-section-content" });
    [0, 1, 2, 3].forEach((i) => box(content, `section-slot-${i}`, 112, { order: i, fill: "#FFFFFF", stroke: "#E7E5EF", strokeWidth: 1, radius: 8, componentType: "section-slot" }));
    const footer = box(container, "section-footer", 82, { order: 2, fill: "#FFFFFF", layoutSpec: layout("horizontal", 10, 22, { align: "center" }), componentType: "section-footer" });
    text(footer, "section-context", "Context, source, or next action", 30, { order: 0, grow: 1, fontSize: 11, fontWeight: 700, textColor: muted });
    chip(footer, "section-state", "EDITABLE", "#F2EEFF", violet, 90, 1);
  } else {
    const container = root("annotation-callout", 360, 180, layout("vertical", 10, 20), { shape: "callout", fill: "#FFFFFF", stroke: "#DAD6FF", radius: 20 });
    eyebrow(container, preset === "annotation-callout" ? "Annotation" : "Component", violet, 0);
    title(container, "title", preset === "annotation-callout" ? "Point to what matters" : "Reusable building block", 42, 1);
    body(container, "body", "Connect this note to a screen, claim, decision, or source.", 52, 2);
  }

  return reflowSemanticTree(objects);
}

function normalizeWorkingSurfaceNotes(value: unknown): CanvasCompositionWorkingNote[] {
  if (!Array.isArray(value)) return [];
  const notes = value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) return [];
    const kind = [
      "objective",
      "constraint",
      "evidence",
      "hypothesis",
      "decision",
      "question",
      "correction",
      "rejected",
      "check",
    ].includes(String(record.kind))
      ? (record.kind as CanvasCompositionWorkingNote["kind"])
      : "evidence";
    return [{
      label:
        typeof record.label === "string" && record.label.trim()
          ? record.label.trim()
          : `Research note ${index + 1}`,
      text,
      kind,
      evidenceIds: Array.from(new Set(
        Array.isArray(record.evidenceIds)
          ? record.evidenceIds.filter((id): id is string => typeof id === "string")
          : [],
      )).sort(),
    }];
  });
  const seen = new Set<string>();
  return notes.filter((note) => {
    const signature = JSON.stringify({
      kind: note.kind,
      label: note.label.toLowerCase().replace(/\s+/g, " ").trim(),
      text: note.text.toLowerCase().replace(/\s+/g, " ").trim(),
      evidenceIds: note.evidenceIds,
    });
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}


type NorthStarFlowLaneDensity = "compact" | "balanced" | "large";

type NorthStarFlowLaneBuildOptions = {
  objects: CanvasObject[];
  artifactId: string;
  parentId: string;
  flow: CanvasAIActionAssetFlow;
  appIconUrl?: string;
  rect: Rect;
  laneIndex: number;
  density?: NorthStarFlowLaneDensity;
  maxScreens?: number;
  surfaceKind?: CanvasSurfaceKind;
  surfaceRootId?: string;
  showSummary?: boolean;
};

function northStarStageColor(stage: NorthStarVisualStage) {
  if (stage === "awareness") return NORTHSTAR_VISUAL_TOKENS.violet;
  if (stage === "consideration") return NORTHSTAR_VISUAL_TOKENS.blue;
  if (stage === "action") return NORTHSTAR_VISUAL_TOKENS.green;
  return NORTHSTAR_VISUAL_TOKENS.orange;
}

/**
 * v86 native reference-flow primitive.
 * Screens are direct image primitives rather than image cards. Their full frames
 * remain visible, captions stay in semantic metadata, and the ordered lane is
 * shared by the research workspace and final solution renderer.
 */
function appendEditableFlowLaneObjects({
  objects,
  artifactId,
  parentId,
  flow,
  appIconUrl,
  rect,
  laneIndex,
  density = "balanced",
  maxScreens = 14,
  surfaceKind,
  surfaceRootId,
  showSummary = false,
}: NorthStarFlowLaneBuildOptions): string {
  const laneId = stableVisualBoardId([parentId, "reference-flow", flow.appName, flow.name, flow.platform, flow.sessionType, laneIndex]);
  const screens = flow.screens
    .filter((screen) => Boolean(screen.imageUrl))
    .sort((a, b) => a.index - b.index)
    .slice(0, maxScreens);
  const add = <T extends CanvasObject>(object: T): T => {
    objects.push(object);
    return object;
  };
  const semanticBase = {
    artifactId,
    surfaceKind,
    surfaceRootId,
  };

  add(createVisualPrimitive("card", rect, {
    id: laneId,
    artifactId,
    role: "visual-flow-lane",
    label: `${flow.appName} — ${flow.name}`,
    parentId,
    componentId: laneId,
    componentType: "reference-flow",
    layoutRole: "container",
    provenanceIds: screens.map((screen) => screen.id),
    layout: {
      kind: "freeform",
      gap: density === "compact" ? 10 : 16,
      paddingTop: 18,
      paddingRight: 18,
      paddingBottom: 18,
      paddingLeft: 18,
      align: "center",
      resizeBehavior: "reflow",
    },
    style: {
      fill: "#FFFFFF",
      stroke: "#E5E4ED",
      strokeWidth: 1,
      radius: 22,
      shadow: "0 10px 28px rgba(38,34,78,0.065)",
    },
    surfaceKind,
    surfaceRootId,
  }));

  const identityW = clamp(rect.w * 0.155, density === "compact" ? 132 : 158, 214);
  const identityId = stableVisualBoardId([laneId, "identity"]);
  add(createVisualPrimitive("frame", {
    x: rect.x + 18,
    y: rect.y + 18,
    w: identityW,
    h: rect.h - 36,
  }, {
    id: identityId,
    artifactId,
    role: "visual-component",
    label: `${flow.appName} flow identity`,
    parentId: laneId,
    componentId: identityId,
    componentType: "app-identity",
    layoutRole: "container",
    layoutItem: { order: 0, basis: identityW },
    layout: {
      kind: "freeform",
      gap: 8,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      align: "start",
      resizeBehavior: "reflow",
    },
    style: { fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 0 },
    surfaceKind,
    surfaceRootId,
  }));

  if (appIconUrl) {
    add(createVisualPrimitive("image", {
      x: rect.x + 22,
      y: rect.y + 24,
      w: density === "compact" ? 36 : 46,
      h: density === "compact" ? 36 : 46,
    }, {
      id: stableVisualBoardId([identityId, "app-icon"]),
      artifactId,
      role: "visual-app-icon",
      label: `${flow.appName} icon`,
      parentId: identityId,
      componentId: identityId,
      layoutRole: "media",
      imageUrl: appIconUrl,
      source: { kind: "generated", appName: flow.appName, appIconUrl },
      style: { fill: "#FFFFFF", stroke: "transparent", strokeWidth: 0, radius: 10, shadow: "none" },
      surfaceKind,
      surfaceRootId,
    }));
  }

  const appTextX = rect.x + (appIconUrl ? (density === "compact" ? 66 : 78) : 24);
  add(createVisualPrimitive("text", { x: appTextX, y: rect.y + 25, w: identityW - (appTextX - rect.x) - 6, h: 28 }, {
    id: stableVisualBoardId([identityId, "app-name"]), artifactId, role: "visual-heading", label: flow.appName,
    parentId: identityId, componentId: identityId, layoutRole: "label", text: flow.appName,
    style: { fill: "transparent", stroke: "transparent", fontSize: density === "compact" ? 15 : 19, fontWeight: 900, textColor: NORTHSTAR_VISUAL_TOKENS.text },
    surfaceKind, surfaceRootId,
  }));
  add(createVisualPrimitive("text", { x: rect.x + 22, y: rect.y + 78, w: identityW - 10, h: 42 }, {
    id: stableVisualBoardId([identityId, "flow-name"]), artifactId, role: "visual-heading", label: flow.name,
    parentId: identityId, componentId: identityId, layoutRole: "label", text: flow.name,
    style: { fill: "transparent", stroke: "transparent", fontSize: density === "compact" ? 9.5 : 11.5, fontWeight: 830, textColor: "#343844" },
    surfaceKind, surfaceRootId,
  }));
  add(createVisualPrimitive("text", { x: rect.x + 22, y: rect.y + 126, w: identityW - 10, h: 18 }, {
    id: stableVisualBoardId([identityId, "metadata"]), artifactId, role: "visual-caption", label: "Flow metadata",
    parentId: identityId, componentId: identityId, layoutRole: "label",
    text: `${flow.platform || "mobile"} · ${canonicalVisualSessionType(`${flow.sessionType ?? ""} ${flow.name}`) || flow.sessionType || "captured"}`.toUpperCase(),
    style: { fill: "transparent", stroke: "transparent", fontSize: 7.5, fontWeight: 880, textColor: NORTHSTAR_VISUAL_TOKENS.muted },
    surfaceKind, surfaceRootId,
  }));
  add(createVisualPrimitive("pill", { x: rect.x + 22, y: rect.y + rect.h - 48, w: 82, h: 24 }, {
    id: stableVisualBoardId([identityId, "screen-count"]), artifactId, role: "visual-component", label: `${screens.length} screens`,
    parentId: identityId, componentId: identityId, layoutRole: "item", text: `${screens.length} screens`,
    style: { fill: "#F4F2FF", stroke: "#E3DEFF", strokeWidth: 1, radius: 999, fontSize: 8, fontWeight: 850, textColor: NORTHSTAR_VISUAL_TOKENS.violet, textAlign: "center" },
    surfaceKind, surfaceRootId,
  }));
  if (showSummary && flow.description) {
    add(createVisualPrimitive("text", { x: rect.x + 22, y: rect.y + 150, w: identityW - 16, h: Math.max(28, rect.h - 206) }, {
      id: stableVisualBoardId([identityId, "summary"]), artifactId, role: "visual-body", label: flow.description,
      parentId: identityId, componentId: identityId, layoutRole: "label", text: flow.description,
      style: { fill: "transparent", stroke: "transparent", fontSize: 7.5, fontWeight: 560, textColor: "#626876" },
      surfaceKind, surfaceRootId,
    }));
  }

  const stripX = rect.x + identityW + 38;
  const stripW = Math.max(1, rect.w - identityW - 58);
  const gap = density === "compact" ? 8 : density === "large" ? 18 : 13;
  const topReserve = 30;
  const bottomReserve = 12;
  const availableH = Math.max(90, rect.h - 36 - topReserve - bottomReserve);
  const idealH = Math.min(density === "large" ? 182 : density === "compact" ? 132 : 158, availableH);
  const naturalW = idealH * 0.515;
  const fitW = screens.length > 0 ? (stripW - gap * Math.max(0, screens.length - 1)) / screens.length : naturalW;
  const screenW = clamp(Math.min(naturalW, fitW), density === "compact" ? 42 : 50, density === "large" ? 108 : 94);
  const screenH = Math.min(availableH, screenW / 0.515);
  const totalStripW = screens.length * screenW + Math.max(0, screens.length - 1) * gap;
  const startX = stripX + Math.max(0, (stripW - totalStripW) / 2);
  const imageY = rect.y + 28 + topReserve;

  screens.forEach((screen, index) => {
    const stage = inferVisualStage(screen.name || "");
    const color = northStarStageColor(stage);
    const groupX = startX + index * (screenW + gap);
    const groupId = stableVisualBoardId([laneId, "screen", screen.id, index]);
    add(createVisualPrimitive("frame", { x: groupX, y: rect.y + 20, w: screenW, h: rect.h - 40 }, {
      id: groupId,
      artifactId,
      role: "visual-component",
      label: screen.name || `Screen ${index + 1}`,
      parentId: laneId,
      sectionId: laneId,
      componentId: groupId,
      componentType: "flow-screen",
      layoutRole: "container",
      layoutItem: { order: index + 1, basis: screenW },
      layout: { kind: "freeform", gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, align: "center", resizeBehavior: "reflow" },
      style: { fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 0 },
      provenanceIds: [screen.id],
      surfaceKind,
      surfaceRootId,
    }));
    add(createVisualPrimitive("circle", { x: groupX + Math.max(0, (screenW - 22) / 2), y: rect.y + 19, w: 22, h: 22 }, {
      id: stableVisualBoardId([groupId, "sequence"]), artifactId, role: "visual-stage-badge", label: `${stage} step ${index + 1}`,
      parentId: groupId, sectionId: laneId, componentId: groupId, layoutRole: "item", text: String(index + 1).padStart(2, "0"),
      style: { fill: color, stroke: "#FFFFFF", strokeWidth: 2, radius: 999, fontSize: 6.5, fontWeight: 900, textColor: "#FFFFFF", textAlign: "center", shadow: "0 4px 10px rgba(42,37,88,0.14)" },
      provenanceIds: [screen.id], surfaceKind, surfaceRootId,
    }));
    add(createVisualPrimitive("image", { x: groupX, y: imageY, w: screenW, h: screenH }, {
      id: stableVisualBoardId([groupId, "image"]),
      artifactId,
      role: "visual-flow-screen",
      label: screen.name || `Screen ${index + 1}`,
      parentId: groupId,
      sectionId: laneId,
      componentId: groupId,
      componentType: "flow-screen-image",
      layoutRole: "media",
      imageUrl: screen.imageUrl,
      provenanceIds: [screen.id],
      source: {
        kind: "northstar-screenshot",
        appName: screen.appName || flow.appName,
        flowName: screen.flowName || flow.name,
        flowType: canonicalVisualSessionType(`${screen.sessionType ?? flow.sessionType ?? ""} ${flow.name}`) ?? "unknown",
        screenLabel: screen.name,
        screenshotUrl: screen.imageUrl,
        screenshotFile: screen.sourceUrl,
        stepIndex: screen.index,
      },
      style: { fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 8, shadow: "0 5px 13px rgba(26,24,62,0.07)" },
      surfaceKind,
      surfaceRootId,
    }));

    if (index < screens.length - 1) {
      const nextX = startX + (index + 1) * (screenW + gap);
      const connectorY = imageY + screenH / 2;
      const connector: CanvasConnectorObject = {
        id: stableVisualBoardId([laneId, "connector", index]),
        type: "connector",
        x1: groupX + screenW + 2,
        y1: connectorY,
        x2: nextX - 2,
        y2: connectorY,
        controlOffset: 0,
        controlX: (groupX + screenW + nextX) / 2,
        controlY: connectorY,
        style: { stroke: "#9B9EAA", strokeWidth: 1.3, kind: "straight", end: "arrow", dash: "solid" },
        source: { kind: "generated" },
        semantic: {
          ...semanticBase,
          role: "visual-flow-connector",
          label: "Flow progression",
          parentId: laneId,
          componentId: laneId,
          componentType: "flow-connector",
          layoutRole: "connector",
          editable: true,
          detachable: true,
        },
      };
      add(connector);
    }
  });

  return laneId;
}

function buildEditableResearchWorkspaceObjects({
  artifactId,
  title,
  researchDigest,
  notes,
  apps,
  flows,
  screenshots,
  rect,
  visibility,
}: {
  artifactId: string;
  title: string;
  researchDigest?: string;
  notes: CanvasCompositionWorkingNote[];
  apps: CanvasAIActionAssetApp[];
  flows: CanvasAIActionAssetFlow[];
  screenshots: CanvasAIActionAssetScreen[];
  rect: Rect;
  visibility: "visible" | "compact" | "hidden";
}): CanvasObject[] {
  const objects: CanvasObject[] = [];
  const safeNotes = normalizeWorkingSurfaceNotes(notes);
  const maxFlows = visibility === "compact" ? 2 : 6;
  const maxNotes = visibility === "compact" ? 6 : 18;
  const maxScreens = visibility === "compact" ? 10 : 15;
  const visibleNotes = safeNotes.slice(0, maxNotes);
  const flowCandidates = flows
    .map((flow) => ({
      ...flow,
      screens: flow.screens
        .filter((screen) => Boolean(screen.imageUrl))
        .sort((a, b) => a.index - b.index)
        .filter((screen, index, list) => list.findIndex((candidate) => candidate.id === screen.id) === index)
        .slice(0, maxScreens),
    }))
    .filter((flow) => flow.screens.length > 0)
    .filter((flow, index, list) => list.findIndex((candidate) => stableVisualBoardId([candidate.appName, candidate.name, candidate.platform, candidate.sessionType]) === stableVisualBoardId([flow.appName, flow.name, flow.platform, flow.sessionType])) === index)
    .slice(0, maxFlows);
  const groupedStandaloneScreens = screenshots
    .filter((screen) => Boolean(screen.imageUrl))
    .filter((screen, index, list) => list.findIndex((candidate) => candidate.id === screen.id) === index)
    .filter((screen) => !flowCandidates.some((flow) => flow.screens.some((candidate) => candidate.id === screen.id)))
    .slice(0, visibility === "compact" ? 6 : 12);

  const laneHeight = visibility === "compact" ? 214 : 250;
  const noteColumns = visibility === "compact" ? 2 : 3;
  const noteRows = Math.max(0, Math.ceil(visibleNotes.length / noteColumns));
  const sourcesHeight = groupedStandaloneScreens.length > 0 ? 224 : 0;
  const computedHeight =
    132 +
    flowCandidates.length * (laneHeight + 20) +
    sourcesHeight +
    (noteRows > 0 ? 66 + noteRows * 136 + Math.max(0, noteRows - 1) * 14 : 0) +
    40;
  const frameW = Math.max(rect.w, visibility === "compact" ? 1120 : 1480);
  const frameH = Math.max(rect.h, computedHeight);
  const frameId = stableVisualBoardId([artifactId, "research-workspace"]);

  const add = <T extends CanvasObject>(object: T): T => {
    objects.push(object);
    return object;
  };
  const text = (
    id: string,
    parentId: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Partial<CanvasObjectStyle> = {},
    role: CanvasSemanticRole = "visual-body",
  ) => add(createVisualPrimitive("text", { x, y, w, h }, {
    id, artifactId, role, label: value.slice(0, 120), parentId, componentId: parentId,
    layoutRole: "label", text: value, style: { fill: "transparent", stroke: "transparent", ...style },
    surfaceKind: "working", surfaceRootId: frameId,
  }));

  add(createVisualPrimitive("frame", { x: rect.x, y: rect.y, w: frameW, h: frameH }, {
    id: frameId,
    artifactId,
    role: "working-frame",
    label: "North Star research workspace",
    componentId: frameId,
    componentType: "research-workspace",
    layoutRole: "container",
    layout: { kind: "freeform", gap: 20, paddingTop: 28, paddingRight: 28, paddingBottom: 28, paddingLeft: 28, align: "stretch", resizeBehavior: "reflow" },
    style: { fill: "#F7F7FC", stroke: "#D8D4F5", strokeWidth: 1.5, radius: 24, shadow: "0 18px 50px rgba(37,33,74,0.12)" },
    surfaceKind: "working",
    surfaceRootId: frameId,
  }));
  text(stableVisualBoardId([frameId, "title"]), frameId, title || "North Star research workspace", rect.x + 34, rect.y + 26, frameW - 68, 38, { fontSize: 24, fontWeight: 900 }, "working-heading");
  text(stableVisualBoardId([frameId, "subtitle"]), frameId, researchDigest || "Evidence, hypotheses, corrections, and decisions remain organized as the solution evolves.", rect.x + 34, rect.y + 72, frameW - 68, 38, { fontSize: 11, fontWeight: 560, textColor: NORTHSTAR_VISUAL_TOKENS.muted }, "working-note");

  let cursorY = rect.y + 124;
  flowCandidates.forEach((flow, flowIndex) => {
    const icon = apps.find((app) => app.name.toLowerCase() === flow.appName.toLowerCase())?.iconUrl;
    appendEditableFlowLaneObjects({
      objects,
      artifactId,
      parentId: frameId,
      flow,
      appIconUrl: icon,
      rect: { x: rect.x + 24, y: cursorY, w: frameW - 48, h: laneHeight },
      laneIndex: flowIndex,
      density: visibility === "compact" ? "compact" : "balanced",
      maxScreens,
      surfaceKind: "working",
      surfaceRootId: frameId,
      showSummary: false,
    });
    cursorY += laneHeight + 20;
  });

  if (groupedStandaloneScreens.length > 0) {
    const sourcesId = stableVisualBoardId([frameId, "additional-sources"]);
    add(createVisualPrimitive("card", { x: rect.x + 24, y: cursorY, w: frameW - 48, h: 204 }, {
      id: sourcesId, artifactId, role: "visual-research-region", label: "Additional evidence", parentId: frameId,
      componentId: sourcesId, componentType: "source-cluster", layoutRole: "container",
      style: { fill: "#FFFFFF", stroke: NORTHSTAR_VISUAL_TOKENS.line, strokeWidth: 1, radius: 20, shadow: "0 8px 22px rgba(38,34,78,0.055)" },
      surfaceKind: "working", surfaceRootId: frameId,
    }));
    text(stableVisualBoardId([sourcesId, "title"]), sourcesId, "ADDITIONAL EVIDENCE", rect.x + 44, cursorY + 18, 260, 22, { fontSize: 12, fontWeight: 900 }, "visual-heading");
    const gap = 18;
    const available = frameW - 96;
    const imageW = clamp((available - gap * (groupedStandaloneScreens.length - 1)) / Math.max(1, groupedStandaloneScreens.length), 58, 104);
    const imageH = Math.min(138, imageW / 0.515);
    const stripWidth = groupedStandaloneScreens.length * imageW + Math.max(0, groupedStandaloneScreens.length - 1) * gap;
    const startX = rect.x + 48 + Math.max(0, (available - stripWidth) / 2);
    groupedStandaloneScreens.forEach((screen, index) => {
      const x = startX + index * (imageW + gap);
      add(createVisualPrimitive("circle", { x: x + imageW / 2 - 10, y: cursorY + 48, w: 20, h: 20 }, {
        id: stableVisualBoardId([sourcesId, screen.id, "number"]), artifactId, role: "visual-stage-badge", label: `Evidence ${index + 1}`,
        parentId: sourcesId, componentId: sourcesId, layoutRole: "item", text: String(index + 1).padStart(2, "0"),
        style: { fill: northStarStageColor(inferVisualStage(screen.name || "")), stroke: "#FFFFFF", strokeWidth: 2, radius: 999, fontSize: 6, fontWeight: 900, textColor: "#FFFFFF", textAlign: "center" },
        provenanceIds: [screen.id], surfaceKind: "working", surfaceRootId: frameId,
      }));
      add(createVisualPrimitive("image", { x, y: cursorY + 74, w: imageW, h: imageH }, {
        id: stableVisualBoardId([sourcesId, screen.id, "image"]), artifactId, role: "working-evidence", label: screen.name,
        parentId: sourcesId, componentId: sourcesId, componentType: "source-image", layoutRole: "media", imageUrl: screen.imageUrl,
        provenanceIds: [screen.id],
        source: { kind: "northstar-screenshot", appName: screen.appName, flowName: screen.flowName, flowType: canonicalVisualSessionType(screen.sessionType) ?? "unknown", screenLabel: screen.name, screenshotUrl: screen.imageUrl, screenshotFile: screen.sourceUrl, stepIndex: screen.index },
        style: { fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 8, shadow: "0 5px 13px rgba(26,24,62,0.07)" },
        surfaceKind: "working", surfaceRootId: frameId,
      }));
    });
    cursorY += 224;
  }

  if (visibleNotes.length > 0) {
    text(stableVisualBoardId([frameId, "notes-title"]), frameId, "RESEARCH LEDGER", rect.x + 34, cursorY + 8, 260, 24, { fontSize: 13, fontWeight: 900 }, "visual-heading");
    cursorY += 50;
    const gap = 14;
    const cardW = (frameW - 68 - gap * (noteColumns - 1)) / noteColumns;
    const colors: Record<CanvasCompositionWorkingNote["kind"], { fill: string; accent: string }> = {
      objective: { fill: "#EEF4FF", accent: NORTHSTAR_VISUAL_TOKENS.blue },
      constraint: { fill: "#FFF5E9", accent: NORTHSTAR_VISUAL_TOKENS.orange },
      evidence: { fill: "#F6F5FB", accent: NORTHSTAR_VISUAL_TOKENS.violet },
      hypothesis: { fill: "#FFF9D9", accent: "#B7791F" },
      decision: { fill: "#EDF4FF", accent: "#2D63D8" },
      question: { fill: "#F5ECFF", accent: "#8B5CF6" },
      correction: { fill: "#FFF0E4", accent: "#D65B1F" },
      rejected: { fill: "#FFEDED", accent: "#D64545" },
      check: { fill: "#ECFAF1", accent: NORTHSTAR_VISUAL_TOKENS.green },
    };
    visibleNotes.forEach((note, index) => {
      const col = index % noteColumns;
      const row = Math.floor(index / noteColumns);
      const x = rect.x + 34 + col * (cardW + gap);
      const y = cursorY + row * 150;
      const noteId = stableVisualBoardId([frameId, "note", note.kind, note.label, index]);
      const color = colors[note.kind];
      add(createVisualPrimitive("card", { x, y, w: cardW, h: 134 }, {
        id: noteId, artifactId, role: "working-note", label: note.label, parentId: frameId, componentId: noteId,
        componentType: `research-${note.kind}`, layoutRole: "container", provenanceIds: note.evidenceIds,
        style: { fill: color.fill, stroke: `${color.accent}33`, strokeWidth: 1, radius: 16, shadow: "0 6px 18px rgba(39,35,76,0.045)" },
        surfaceKind: "working", surfaceRootId: frameId,
      }));
      text(stableVisualBoardId([noteId, "kind"]), noteId, note.kind.toUpperCase(), x + 16, y + 14, cardW - 32, 16, { fontSize: 7.5, fontWeight: 900, textColor: color.accent }, "visual-caption");
      text(stableVisualBoardId([noteId, "label"]), noteId, note.label, x + 16, y + 36, cardW - 32, 24, { fontSize: 11, fontWeight: 900 }, "visual-heading");
      text(stableVisualBoardId([noteId, "body"]), noteId, note.text, x + 16, y + 66, cardW - 32, 54, { fontSize: 8.5, fontWeight: 560, textColor: "#535966" }, note.kind === "decision" ? "visual-decision" : note.kind === "hypothesis" ? "visual-hypothesis" : "visual-body");
    });
  }

  return stampSurfaceOwnership(objects, artifactId, "working", frameId);
}

function buildEditableVisualBoardObjects(
  document: NorthStarVisualBoardDocument,
  rect: Rect,
  artifactId: string,
): CanvasObject[] {
  const objects: CanvasObject[] = [];
  const boardX = rect.x;
  const boardY = rect.y;
  const boardW = 1600;
  const boardH = 1080;
  const mainW = 1230;
  const railX = boardX + 1270;
  const railW = 310;
  const gap = 16;

  const stageMeta: Record<NorthStarVisualStage, { color: string; tint: string; label: string }> = {
    awareness: { color: "#8B5CF6", tint: "#F3EEFF", label: "Awareness" },
    consideration: { color: NORTHSTAR_VISUAL_TOKENS.blue, tint: NORTHSTAR_VISUAL_TOKENS.blueSoft, label: "Consideration" },
    action: { color: NORTHSTAR_VISUAL_TOKENS.green, tint: NORTHSTAR_VISUAL_TOKENS.greenSoft, label: "Action" },
    verification: { color: NORTHSTAR_VISUAL_TOKENS.orange, tint: NORTHSTAR_VISUAL_TOKENS.orangeSoft, label: "Verification" },
  };
  const appAccent = (index: number) => index === 0 ? NORTHSTAR_VISUAL_TOKENS.violet : NORTHSTAR_VISUAL_TOKENS.orange;
  const appSoft = (index: number) => index === 0 ? NORTHSTAR_VISUAL_TOKENS.violetSoft : NORTHSTAR_VISUAL_TOKENS.orangeSoft;

  const add = (object: CanvasObject) => {
    objects.push(object);
    return object.id;
  };
  const card = (
    id: string,
    parentId: string | undefined,
    componentType: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string = NORTHSTAR_VISUAL_TOKENS.surface,
    stroke: string = NORTHSTAR_VISUAL_TOKENS.line,
  ) => add(createVisualPrimitive("card", { x, y, w, h }, {
    id,
    artifactId,
    role: componentType === "board" ? "visual-root" : "visual-component",
    label: componentType,
    parentId,
    componentId: id,
    componentType,
    layoutRole: "container",
    style: { fill, stroke, strokeWidth: 1, radius: NORTHSTAR_VISUAL_TOKENS.radius, shadow: NORTHSTAR_VISUAL_TOKENS.shadow },
    visualBoard: componentType === "board" ? document : undefined,
  }));
  const text = (
    id: string,
    parentId: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Partial<CanvasObjectStyle> = {},
    role: CanvasSemanticRole = "visual-body",
  ) => add(createVisualPrimitive("text", { x, y, w, h }, {
    id,
    artifactId,
    role,
    label: value.slice(0, 100),
    parentId,
    componentId: parentId,
    layoutRole: "label",
    text: value,
    style: { fill: "transparent", stroke: "transparent", ...style },
  }));
  const image = (
    id: string,
    parentId: string,
    url: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    source: CanvasObjectSource,
    role: CanvasSemanticRole,
  ) => add(createVisualPrimitive("image", { x, y, w, h }, {
    id,
    artifactId,
    role,
    label,
    parentId,
    componentId: parentId,
    layoutRole: "media",
    imageUrl: url,
    source,
    style: { fill: "#FFFFFF", stroke: "#DEDEE8", strokeWidth: 1, radius: 12, shadow: "0 7px 18px rgba(27,24,71,0.12)" },
  }));
  const shape = (
    type: CanvasBoxType,
    id: string,
    parentId: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    role: CanvasSemanticRole = "visual-component",
    radius = 12,
  ) => add(createVisualPrimitive(type, { x, y, w, h }, {
    id,
    artifactId,
    role,
    label,
    parentId,
    componentId: parentId,
    layoutRole: "item",
    style: { fill, stroke: "transparent", strokeWidth: 0, radius },
  }));

  const rootId = stableVisualBoardId([artifactId, "editable-board-root"]);
  card(rootId, undefined, "board", boardX, boardY, boardW, boardH, NORTHSTAR_VISUAL_TOKENS.board, "#E2E1EC");

  const referenceId = stableVisualBoardId([artifactId, "reference-flows"]);
  card(referenceId, rootId, "reference-flows", boardX + 20, boardY + 20, mainW, 430);
  text(stableVisualBoardId([referenceId, "title"]), referenceId, "REFERENCE FLOWS", boardX + 72, boardY + 38, 300, 28, { fontSize: 17, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([referenceId, "subtitle"]), referenceId, "Grounded journeys studied in their original sequence", boardX + 72, boardY + 67, 420, 20, { fontSize: 10, fontWeight: 650, textColor: NORTHSTAR_VISUAL_TOKENS.muted });
  shape("rect", stableVisualBoardId([referenceId, "icon-bg"]), referenceId, "Reference flows icon", boardX + 36, boardY + 35, 28, 28, NORTHSTAR_VISUAL_TOKENS.violetSoft, "visual-component", 9);
  text(stableVisualBoardId([referenceId, "icon"]), referenceId, "▣", boardX + 42, boardY + 39, 16, 18, { fontSize: 14, fontWeight: 900, textColor: NORTHSTAR_VISUAL_TOKENS.violet, textAlign: "center" });

  let legendX = boardX + 815;
  (Object.keys(stageMeta) as NorthStarVisualStage[]).forEach((stage) => {
    const meta = stageMeta[stage];
    shape("circle", stableVisualBoardId([referenceId, "legend", stage, "dot"]), referenceId, `${meta.label} marker`, legendX, boardY + 43, 10, 10, meta.color, "visual-stage-badge", 999);
    text(stableVisualBoardId([referenceId, "legend", stage, "label"]), referenceId, meta.label, legendX + 15, boardY + 39, 85, 18, { fontSize: 9, fontWeight: 750, textColor: "#545966" });
    legendX += 100;
  });

  document.flows.slice(0, 2).forEach((flow, flowIndex) => {
    const laneY = boardY + 96 + flowIndex * 166;
    const laneId = stableVisualBoardId([artifactId, "flow-lane", flow.id]);
    card(laneId, referenceId, "reference-flow-lane", boardX + 34, laneY, mainW - 28, 154, "#FCFCFE", "#EAE9F2");
    const identityId = stableVisualBoardId([laneId, "identity"]);
    card(identityId, laneId, "app-identity", boardX + 48, laneY + 12, 180, 130, "transparent", "transparent");
    if (flow.appIconUrl) {
      image(stableVisualBoardId([identityId, "icon"]), identityId, flow.appIconUrl, `${flow.appName} icon`, boardX + 60, laneY + 24, 50, 50, { kind: "generated", appName: flow.appName, appIconUrl: flow.appIconUrl }, "visual-app-icon");
    } else {
      shape("card", stableVisualBoardId([identityId, "fallback-icon"]), identityId, `${flow.appName} icon`, boardX + 60, laneY + 24, 50, 50, appSoft(flowIndex), "visual-app-icon", 14);
      text(stableVisualBoardId([identityId, "fallback-letter"]), identityId, flow.appName.charAt(0), boardX + 75, laneY + 35, 20, 24, { fontSize: 22, fontWeight: 900, textAlign: "center", textColor: appAccent(flowIndex) });
    }
    text(stableVisualBoardId([identityId, "app-name"]), identityId, flow.appName, boardX + 118, laneY + 25, 100, 28, { fontSize: 19, fontWeight: 900 }, "visual-heading");
    text(stableVisualBoardId([identityId, "metadata"]), identityId, `${flow.platform} · ${flow.sessionType}`.toUpperCase(), boardX + 118, laneY + 56, 100, 18, { fontSize: 8, fontWeight: 800, textColor: "#8A8E99" });
    text(stableVisualBoardId([identityId, "flow-name"]), identityId, flow.flowName, boardX + 60, laneY + 83, 154, 28, { fontSize: 10, fontWeight: 850 }, "visual-heading");
    text(stableVisualBoardId([identityId, "screen-count"]), identityId, `${flow.screens.length} screens`, boardX + 60, laneY + 116, 72, 20, { fontSize: 8, fontWeight: 800, textColor: "#555A67" });

    const screenAreaX = boardX + 242;
    const screenAreaW = mainW - 250;
    const visibleScreens = flow.screens.slice(0, 11);
    const cellW = Math.min(88, Math.max(68, screenAreaW / Math.max(1, visibleScreens.length)));
    const totalW = cellW * visibleScreens.length;
    const startX = screenAreaX + Math.max(0, (screenAreaW - totalW) / 2);
    visibleScreens.forEach((screen, screenIndex) => {
      const cellX = startX + screenIndex * cellW;
      const screenComponentId = stableVisualBoardId([laneId, "screen", screen.id, screenIndex]);
      card(screenComponentId, laneId, "flow-screen", cellX, laneY + 10, cellW - 4, 136, "transparent", "transparent");
      shape("circle", stableVisualBoardId([screenComponentId, "stage"]), screenComponentId, `${stageMeta[screen.stage].label} stage`, cellX + (cellW - 22) / 2, laneY + 13, 20, 20, stageMeta[screen.stage].color, "visual-stage-badge", 999);
      text(stableVisualBoardId([screenComponentId, "number"]), screenComponentId, String(screen.number).padStart(2, "0"), cellX + (cellW - 18) / 2, laneY + 17, 18, 11, { fontSize: 7, fontWeight: 900, textAlign: "center", textColor: "#FFFFFF" });
      const imageW = Math.min(60, cellW - 16);
      image(stableVisualBoardId([screenComponentId, "image"]), screenComponentId, screen.imageUrl, screen.title, cellX + (cellW - imageW) / 2, laneY + 38, imageW, 88, {
        kind: "northstar-screenshot",
        appName: flow.appName,
        appIconUrl: flow.appIconUrl,
        flowName: flow.flowName,
        flowType: flow.sessionType === "onboarding" ? "onboarding" : flow.sessionType === "browsing" ? "browsing" : "unknown",
        screenLabel: screen.title,
        screenshotUrl: screen.imageUrl,
        stepIndex: screen.number,
      }, "visual-flow-screen");
      text(stableVisualBoardId([screenComponentId, "caption"]), screenComponentId, screen.title, cellX + 2, laneY + 129, cellW - 8, 16, { fontSize: 7, fontWeight: 720, textAlign: "center", textColor: "#474C58" }, "visual-caption");
      if (screenIndex < visibleScreens.length - 1) {
        const connectorId = stableVisualBoardId([laneId, "connector", screenIndex]);
        objects.push({
          id: connectorId,
          type: "connector",
          x1: cellX + cellW - 9,
          y1: laneY + 82,
          x2: cellX + cellW + 2,
          y2: laneY + 82,
          controlOffset: 0,
          style: { stroke: "#9498A4", strokeWidth: 1.5, kind: "straight", end: "arrow", dash: "solid" },
          source: { kind: "generated" },
          semantic: { artifactId, role: "visual-component", label: "Flow progression", parentId: laneId, componentId: laneId, componentType: "flow-connector", layoutRole: "connector" },
        });
      }
    });
  });

  const lowerY = boardY + 470;
  const keyId = stableVisualBoardId([artifactId, "key-patterns"]);
  card(keyId, rootId, "key-patterns", boardX + 20, lowerY, 350, 250);
  text(stableVisualBoardId([keyId, "title"]), keyId, "KEY PATTERNS", boardX + 66, lowerY + 21, 220, 24, { fontSize: 13, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([keyId, "subtitle"]), keyId, "What the flows reveal", boardX + 66, lowerY + 48, 220, 18, { fontSize: 9, textColor: NORTHSTAR_VISUAL_TOKENS.muted });
  shape("rect", stableVisualBoardId([keyId, "icon"]), keyId, "Key patterns icon", boardX + 34, lowerY + 20, 24, 24, NORTHSTAR_VISUAL_TOKENS.violetSoft, "visual-component", 8);
  document.keyPatterns.slice(0, 2).forEach((pattern, index) => {
    const panelY = lowerY + 78 + index * 78;
    const accentColor = index === 0 ? NORTHSTAR_VISUAL_TOKENS.violet : NORTHSTAR_VISUAL_TOKENS.orange;
    const panelId = stableVisualBoardId([keyId, pattern.appName]);
    card(panelId, keyId, "pattern-card", boardX + 34, panelY, 322, 68, index === 0 ? "#F5F2FF" : "#FFF5EE", index === 0 ? "#DED7FF" : "#FFD8C3");
    text(stableVisualBoardId([panelId, "name"]), panelId, pattern.appName, boardX + 49, panelY + 11, 80, 16, { fontSize: 9, fontWeight: 900, textColor: accentColor });
    text(stableVisualBoardId([panelId, "points"]), panelId, pattern.points.slice(0, 2).map((point) => `• ${point}`).join("\n"), boardX + 49, panelY + 31, 290, 30, { fontSize: 7.5, fontWeight: 580, textColor: "#4A4F5B" });
  });

  const matrixId = stableVisualBoardId([artifactId, "comparison-matrix"]);
  card(matrixId, rootId, "comparison-matrix", boardX + 386, lowerY, 510, 250);
  text(stableVisualBoardId([matrixId, "title"]), matrixId, "COMPARISON MATRIX", boardX + 432, lowerY + 21, 250, 24, { fontSize: 13, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([matrixId, "subtitle"]), matrixId, "Equivalent dimensions across both journeys", boardX + 432, lowerY + 48, 300, 18, { fontSize: 9, textColor: NORTHSTAR_VISUAL_TOKENS.muted });
  shape("rect", stableVisualBoardId([matrixId, "icon"]), matrixId, "Comparison matrix icon", boardX + 400, lowerY + 20, 24, 24, NORTHSTAR_VISUAL_TOKENS.violetSoft, "visual-component", 8);
  const matrixCells = [
    ["Dimension", ...document.flows.slice(0, 2).map((flow) => flow.appName)],
    ...document.matrixRows.slice(0, 5).map((row) => [row.dimension, ...row.values.slice(0, 2)]),
  ];
  add(createVisualPrimitive("table", { x: boardX + 402, y: lowerY + 78, w: 478, h: 154 }, {
    id: stableVisualBoardId([matrixId, "table"]), artifactId, role: "visual-matrix", label: "Comparison matrix", parentId: matrixId, componentId: matrixId, componentType: "matrix", layoutRole: "item", rows: matrixCells.length, cols: 3, cells: matrixCells,
    style: { fill: "#FFFFFF", stroke: "#E5E4ED", strokeWidth: 1, radius: 12, textColor: "#474C58", fontSize: 9, fontWeight: 650 },
  }));

  const chartId = stableVisualBoardId([artifactId, "journey-emphasis"]);
  card(chartId, rootId, "journey-emphasis", boardX + 912, lowerY, 338, 250);
  text(stableVisualBoardId([chartId, "title"]), chartId, "JOURNEY EMPHASIS", boardX + 958, lowerY + 21, 220, 24, { fontSize: 13, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([chartId, "subtitle"]), chartId, "Observed screen-stage distribution", boardX + 958, lowerY + 48, 250, 18, { fontSize: 9, textColor: NORTHSTAR_VISUAL_TOKENS.muted });
  shape("rect", stableVisualBoardId([chartId, "icon"]), chartId, "Journey emphasis icon", boardX + 926, lowerY + 20, 24, 24, "#F8ECFF", "visual-component", 8);
  document.stageSeries.slice(0, 2).forEach((series, seriesIndex) => {
    const seriesY = lowerY + 78 + seriesIndex * 78;
    text(stableVisualBoardId([chartId, series.appName, "label"]), chartId, series.appName, boardX + 930, seriesY, 90, 18, { fontSize: 9, fontWeight: 900 });
    (Object.keys(stageMeta) as NorthStarVisualStage[]).forEach((stage, stageIndex) => {
      const rowY = seriesY + 22 + stageIndex * 12;
      text(stableVisualBoardId([chartId, series.appName, stage, "label"]), chartId, stageMeta[stage].label, boardX + 930, rowY, 75, 11, { fontSize: 6.5, fontWeight: 650, textColor: "#5D6270" });
      shape("pill", stableVisualBoardId([chartId, series.appName, stage, "track"]), chartId, `${series.appName} ${stage} track`, boardX + 1005, rowY + 1, 158, 8, "#EAE9F1", "visual-component", 999);
      const value = series.values[stage] ?? 0;
      shape("pill", stableVisualBoardId([chartId, series.appName, stage, "bar"]), chartId, `${series.appName} ${stage}: ${value}%`, boardX + 1005, rowY + 1, Math.max(4, 158 * value / 100), 8, stageMeta[stage].color, "visual-chart-bar", 999);
      text(stableVisualBoardId([chartId, series.appName, stage, "value"]), chartId, `${value}%`, boardX + 1168, rowY - 1, 34, 11, { fontSize: 6.5, fontWeight: 800, textAlign: "right" });
    });
  });

  const evidenceId = stableVisualBoardId([artifactId, "evidence-notes"]);
  card(evidenceId, rootId, "evidence-notes", boardX + 20, boardY + 736, 690, 324);
  text(stableVisualBoardId([evidenceId, "title"]), evidenceId, "EVIDENCE NOTES", boardX + 66, boardY + 758, 240, 24, { fontSize: 13, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([evidenceId, "subtitle"]), evidenceId, "Specific screens supporting the analysis", boardX + 66, boardY + 785, 280, 18, { fontSize: 9, textColor: NORTHSTAR_VISUAL_TOKENS.muted });
  shape("rect", stableVisualBoardId([evidenceId, "icon"]), evidenceId, "Evidence notes icon", boardX + 34, boardY + 757, 24, 24, NORTHSTAR_VISUAL_TOKENS.blueSoft, "visual-component", 8);
  document.evidenceNotes.slice(0, 4).forEach((note, index) => {
    const noteX = boardX + 34 + index * 163;
    const noteId = stableVisualBoardId([evidenceId, note.id]);
    card(noteId, evidenceId, "evidence-note", noteX, boardY + 821, 150, 220, "#FCFCFE", "#E8E7F0");
    if (note.imageUrl) image(stableVisualBoardId([noteId, "image"]), noteId, note.imageUrl, note.title, noteX + 10, boardY + 832, 52, 86, { kind: "northstar-screenshot", screenLabel: note.title, screenshotUrl: note.imageUrl }, "visual-flow-screen");
    text(stableVisualBoardId([noteId, "label"]), noteId, note.label, noteX + 70, boardY + 837, 70, 20, { fontSize: 7, fontWeight: 900, textColor: note.accent === "orange" ? NORTHSTAR_VISUAL_TOKENS.orange : NORTHSTAR_VISUAL_TOKENS.violet });
    text(stableVisualBoardId([noteId, "title"]), noteId, note.title, noteX + 70, boardY + 860, 70, 34, { fontSize: 7.5, fontWeight: 850 });
    text(stableVisualBoardId([noteId, "body"]), noteId, note.body, noteX + 10, boardY + 930, 130, 92, { fontSize: 7, fontWeight: 550, textColor: "#5D6270" }, "visual-evidence-note");
  });

  const hypothesesId = stableVisualBoardId([artifactId, "hypotheses-decisions"]);
  card(hypothesesId, rootId, "hypotheses-decisions", boardX + 726, boardY + 736, 524, 324);
  text(stableVisualBoardId([hypothesesId, "title"]), hypothesesId, "HYPOTHESES & DECISIONS", boardX + 772, boardY + 758, 300, 24, { fontSize: 13, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([hypothesesId, "subtitle"]), hypothesesId, "What was tested and retained", boardX + 772, boardY + 785, 250, 18, { fontSize: 9, textColor: NORTHSTAR_VISUAL_TOKENS.muted });
  shape("rect", stableVisualBoardId([hypothesesId, "icon"]), hypothesesId, "Hypotheses icon", boardX + 740, boardY + 757, 24, 24, "#F8ECFF", "visual-component", 8);
  document.hypotheses.slice(0, 4).forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const itemX = boardX + 740 + col * 248;
    const itemY = boardY + 821 + row * 105;
    const itemId = stableVisualBoardId([hypothesesId, item.label]);
    card(itemId, hypothesesId, item.status === "decided" ? "decision" : "hypothesis", itemX, itemY, 234, 92, "#FCFCFE", "#E8E7F0");
    shape("pill", stableVisualBoardId([itemId, "badge"]), itemId, item.status, itemX + 12, itemY + 12, 36, 18, item.status === "supported" ? NORTHSTAR_VISUAL_TOKENS.greenSoft : item.status === "decided" ? NORTHSTAR_VISUAL_TOKENS.blueSoft : NORTHSTAR_VISUAL_TOKENS.orangeSoft, item.status === "decided" ? "visual-decision" : "visual-hypothesis", 999);
    text(stableVisualBoardId([itemId, "label"]), itemId, item.label, itemX + 19, itemY + 16, 24, 10, { fontSize: 6.5, fontWeight: 900, textAlign: "center", textColor: item.status === "supported" ? NORTHSTAR_VISUAL_TOKENS.green : item.status === "decided" ? NORTHSTAR_VISUAL_TOKENS.blue : NORTHSTAR_VISUAL_TOKENS.orange });
    text(stableVisualBoardId([itemId, "status"]), itemId, item.status.toUpperCase(), itemX + 56, itemY + 15, 80, 12, { fontSize: 6.5, fontWeight: 850, textColor: "#68707D" });
    text(stableVisualBoardId([itemId, "body"]), itemId, item.text, itemX + 12, itemY + 40, 210, 42, { fontSize: 7.5, fontWeight: 560, textColor: "#4D5260" }, item.status === "decided" ? "visual-decision" : "visual-hypothesis");
  });

  const railId = stableVisualBoardId([artifactId, "synthesis-rail"]);
  card(railId, rootId, "synthesis-rail", railX, boardY + 20, railW, 1040, "#FBFAFF", "#E5E2F4");
  text(stableVisualBoardId([railId, "eyebrow"]), railId, "DECISION-READY SYNTHESIS", railX + 58, boardY + 38, 220, 18, { fontSize: 8, fontWeight: 900, textColor: NORTHSTAR_VISUAL_TOKENS.violet }, "visual-heading");
  text(stableVisualBoardId([railId, "title"]), railId, document.title, railX + 24, boardY + 76, railW - 48, 84, { fontSize: 20, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([railId, "subtitle"]), railId, document.subtitle, railX + 24, boardY + 165, railW - 48, 42, { fontSize: 9, fontWeight: 570, textColor: NORTHSTAR_VISUAL_TOKENS.muted });
  shape("rect", stableVisualBoardId([railId, "divider"]), railId, "Divider", railX + 24, boardY + 218, railW - 48, 1, NORTHSTAR_VISUAL_TOKENS.line, "visual-component", 0);
  text(stableVisualBoardId([railId, "summary"]), railId, document.summary, railX + 24, boardY + 238, railW - 48, 74, { fontSize: 11, fontWeight: 760 }, "visual-body");

  document.executive.appSummaries.slice(0, 2).forEach((summary, index) => {
    const summaryY = boardY + 326 + index * 112;
    const appId = stableVisualBoardId([railId, summary.appName]);
    card(appId, railId, "app-summary", railX + 18, summaryY, railW - 36, 96, "#FFFFFF", "#E7E5F0");
    if (summary.iconUrl) image(stableVisualBoardId([appId, "icon"]), appId, summary.iconUrl, `${summary.appName} icon`, railX + 30, summaryY + 16, 32, 32, { kind: "generated", appName: summary.appName, appIconUrl: summary.iconUrl }, "visual-app-icon");
    text(stableVisualBoardId([appId, "name"]), appId, summary.appName, railX + 72, summaryY + 17, 100, 20, { fontSize: 11, fontWeight: 900 }, "visual-heading");
    shape("pill", stableVisualBoardId([appId, "badge"]), appId, summary.badge, railX + railW - 108, summaryY + 16, 76, 20, index === 0 ? NORTHSTAR_VISUAL_TOKENS.violetSoft : NORTHSTAR_VISUAL_TOKENS.orangeSoft, "visual-component", 999);
    text(stableVisualBoardId([appId, "badge-text"]), appId, summary.badge, railX + railW - 103, summaryY + 21, 66, 10, { fontSize: 6.5, fontWeight: 900, textAlign: "center", textColor: appAccent(index) });
    text(stableVisualBoardId([appId, "body"]), appId, summary.text, railX + 30, summaryY + 51, railW - 60, 34, { fontSize: 7.5, fontWeight: 560, textColor: "#5C6170" });
  });

  const takeawayId = stableVisualBoardId([railId, "takeaway"]);
  card(takeawayId, railId, "takeaway", railX + 18, boardY + 556, railW - 36, 132, "#FFFFFF", "#E7E5F0");
  text(stableVisualBoardId([takeawayId, "title"]), takeawayId, "KEY TAKEAWAY", railX + 32, boardY + 573, 180, 18, { fontSize: 9, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([takeawayId, "body"]), takeawayId, document.executive.keyTakeaway, railX + 32, boardY + 603, railW - 64, 70, { fontSize: 10, fontWeight: 780, textColor: "#4E43D8" }, "visual-body");

  const implicationId = stableVisualBoardId([railId, "implication"]);
  card(implicationId, railId, "strategic-implication", railX + 18, boardY + 704, railW - 36, 110, "#FFFFFF", "#E7E5F0");
  text(stableVisualBoardId([implicationId, "title"]), implicationId, "STRATEGIC IMPLICATION", railX + 32, boardY + 721, 200, 18, { fontSize: 9, fontWeight: 900 }, "visual-heading");
  text(stableVisualBoardId([implicationId, "body"]), implicationId, document.executive.strategicImplication, railX + 32, boardY + 751, railW - 64, 48, { fontSize: 7.5, fontWeight: 560, textColor: "#5C6170" });

  const recommendationsId = stableVisualBoardId([railId, "recommendations"]);
  card(recommendationsId, railId, "recommendations", railX + 18, boardY + 830, railW - 36, 126, "#FFFFFF", "#E7E5F0");
  text(stableVisualBoardId([recommendationsId, "title"]), recommendationsId, "RECOMMENDATIONS", railX + 32, boardY + 847, 180, 18, { fontSize: 9, fontWeight: 900 }, "visual-heading");
  document.executive.recommendations.slice(0, 3).forEach((item, index) => {
    shape("circle", stableVisualBoardId([recommendationsId, index, "bullet"]), recommendationsId, "Recommendation bullet", railX + 32, boardY + 878 + index * 22, 12, 12, NORTHSTAR_VISUAL_TOKENS.greenSoft, "visual-recommendation", 999);
    text(stableVisualBoardId([recommendationsId, index, "text"]), recommendationsId, item, railX + 52, boardY + 875 + index * 22, railW - 86, 18, { fontSize: 7, fontWeight: 570, textColor: "#4F5562" }, "visual-recommendation");
  });

  const nextId = stableVisualBoardId([railId, "next-steps"]);
  card(nextId, railId, "next-steps", railX + 18, boardY + 972, railW - 36, 72, "#5C46E8", "#5C46E8");
  text(stableVisualBoardId([nextId, "title"]), nextId, "NEXT STEPS", railX + 32, boardY + 985, 150, 16, { fontSize: 8, fontWeight: 900, textColor: "#FFFFFF" }, "visual-heading");
  document.executive.nextSteps.slice(0, 3).forEach((item, index) => {
    text(stableVisualBoardId([nextId, index, "number"]), nextId, String(index + 1), railX + 34, boardY + 1008 + index * 11, 12, 10, { fontSize: 6.5, fontWeight: 900, textColor: "#DAD4FF", textAlign: "center" }, "visual-next-step");
    text(stableVisualBoardId([nextId, index, "text"]), nextId, item, railX + 52, boardY + 1006 + index * 11, railW - 86, 10, { fontSize: 6.5, fontWeight: 620, textColor: "#FFFFFF" }, "visual-next-step");
  });

  return stampSurfaceOwnership(objects, artifactId, "presentation", rootId);
}


function canonicalAssetFlowKey(flow: CanvasAIActionAssetFlow): string {
  return stableVisualBoardId([
    flow.appId || flow.appName,
    flow.id || flow.name,
    flow.platform || "unknown-platform",
    canonicalVisualSessionType(`${flow.sessionType ?? ""} ${flow.name} ${flow.description ?? ""}`) || flow.sessionType || "unknown-mode",
  ]);
}

function selectCanonicalAssetFlows(
  bundle: CanvasAIActionRequest["assetBundle"],
  options: {
    requestedSession?: "onboarding" | "browsing";
    requestedApps?: string[];
    explicitFlowNames?: string[];
    maxFlowsPerApp?: number;
  } = {},
): CanvasAIActionAssetFlow[] {
  const requestedApps = new Set((options.requestedApps ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const explicitFlowNames = new Set((options.explicitFlowNames ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const maxFlowsPerApp = Math.max(1, Math.min(4, options.maxFlowsPerApp ?? 1));
  const deduped = new Map<string, CanvasAIActionAssetFlow>();

  for (const flow of bundle?.flows ?? []) {
    if (requestedApps.size > 0 && !requestedApps.has(flow.appName.trim().toLowerCase())) continue;
    const mode = canonicalVisualSessionType(`${flow.sessionType ?? ""} ${flow.name} ${flow.description ?? ""}`);
    if (options.requestedSession && mode !== options.requestedSession) continue;
    const screens = [...flow.screens]
      .filter((screen) => Boolean(screen.imageUrl))
      .sort((a, b) => a.index - b.index)
      .filter((screen, index, list) => list.findIndex((candidate) => candidate.id === screen.id) === index);
    if (screens.length === 0) continue;
    const normalized: CanvasAIActionAssetFlow = { ...flow, sessionType: mode ?? flow.sessionType, screens };
    const key = canonicalAssetFlowKey(normalized);
    const existing = deduped.get(key);
    if (!existing || normalized.screens.length > existing.screens.length) deduped.set(key, normalized);
  }

  const byApp = new Map<string, CanvasAIActionAssetFlow[]>();
  for (const flow of deduped.values()) {
    const key = flow.appName.trim().toLowerCase();
    byApp.set(key, [...(byApp.get(key) ?? []), flow]);
  }

  const selected: CanvasAIActionAssetFlow[] = [];
  const appOrder = requestedApps.size > 0
    ? [...requestedApps]
    : [...byApp.keys()].sort((a, b) => a.localeCompare(b));
  for (const appKey of appOrder) {
    const candidates = (byApp.get(appKey) ?? []).sort((a, b) => {
      const aExplicit = explicitFlowNames.has(a.name.trim().toLowerCase()) ? 1 : 0;
      const bExplicit = explicitFlowNames.has(b.name.trim().toLowerCase()) ? 1 : 0;
      return bExplicit - aExplicit || b.screens.length - a.screens.length || a.name.localeCompare(b.name);
    });
    const explicit = candidates.filter((flow) => explicitFlowNames.has(flow.name.trim().toLowerCase()));
    const chosen = explicit.length > 0 ? explicit : candidates.slice(0, maxFlowsPerApp);
    for (const flow of chosen.slice(0, maxFlowsPerApp)) selected.push(flow);
  }
  return selected;
}

type PlannedNativeSection = {
  section: CanvasCompositionSection;
  rect: Rect;
  region?: CanvasCompositionLayoutRegion;
};

function nativeSectionHeight(section: CanvasCompositionSection, evidenceCount: number): number {
  if (section.kind === "reference-flow") return 252;
  if (section.kind === "matrix" || section.kind === "table") return 300;
  if (section.kind === "chart") return 320;
  if (["timeline", "roadmap", "process"].includes(section.kind)) return 270;
  if (["evidence-group", "source-cluster", "stage"].includes(section.kind)) {
    return evidenceCount > 6 ? 360 : 300;
  }
  if (["diagram", "app-column"].includes(section.kind)) return 290;
  const bodyWeight = Math.min(3, Math.ceil((section.body?.length ?? 0) / 260));
  const criteriaWeight = Math.min(3, Math.ceil((section.criteria?.length ?? 0) / 3));
  return 190 + Math.max(bodyWeight, criteriaWeight) * 34;
}

function nativeSectionSpan(section: CanvasCompositionSection, columns: number): number {
  if (columns <= 1) return 1;
  if (section.emphasis === "primary") return columns;
  if (["matrix", "table", "timeline", "roadmap", "process", "diagram"].includes(section.kind)) {
    return Math.min(columns, 2);
  }
  if (["evidence-group", "source-cluster"].includes(section.kind)) return Math.min(columns, 2);
  return 1;
}

function planNativeSections({
  sections,
  regions,
  startX,
  startY,
  contentWidth,
  columns,
  gap,
  evidenceCountBySection,
}: {
  sections: CanvasCompositionSection[];
  regions: Map<string, CanvasCompositionLayoutRegion>;
  startX: number;
  startY: number;
  contentWidth: number;
  columns: number;
  gap: number;
  evidenceCountBySection: Map<string, number>;
}): { plans: PlannedNativeSection[]; bottom: number } {
  const safeColumns = Math.max(1, Math.min(4, columns));
  const unitWidth = (contentWidth - gap * (safeColumns - 1)) / safeColumns;
  const plans: PlannedNativeSection[] = [];
  let cursorY = startY;
  let row: Array<{ section: CanvasCompositionSection; span: number; region?: CanvasCompositionLayoutRegion }> = [];
  let used = 0;

  const flush = () => {
    if (row.length === 0) return;
    const height = Math.max(...row.map(({ section }) => nativeSectionHeight(section, evidenceCountBySection.get(section.id) ?? 0)));
    let col = 0;
    for (const item of row) {
      const width = unitWidth * item.span + gap * (item.span - 1);
      plans.push({
        section: item.section,
        region: item.region,
        rect: { x: startX + col * (unitWidth + gap), y: cursorY, w: width, h: height },
      });
      col += item.span;
    }
    cursorY += height + gap;
    row = [];
    used = 0;
  };

  for (const section of sections) {
    const span = Math.max(1, Math.min(safeColumns, nativeSectionSpan(section, safeColumns)));
    if (used > 0 && used + span > safeColumns) flush();
    row.push({ section, span, region: regions.get(section.id) });
    used += span;
    if (used >= safeColumns) flush();
  }
  flush();
  return { plans, bottom: Math.max(startY, cursorY - gap) };
}

function buildEditableAdaptiveSceneObjects(
  args: CanvasAIActionArguments,
  bundle: CanvasAIActionRequest["assetBundle"],
  rect: Rect,
  artifactId: string,
): { objects: CanvasObject[]; title: string } {
  const blueprint = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
  const title = cleanVisualSentence(args.title || blueprint?.title, "North Star visual solution");
  const subtitle = cleanVisualSentence(args.subtitle || blueprint?.subtitle, "An editable visual answer grounded in the available evidence");
  const requestedSession = args.sessionType ?? (title.toLowerCase().includes("onboarding") ? "onboarding" : title.toLowerCase().includes("browsing") ? "browsing" : undefined);
  const requestedApps = Array.from(new Set(
    (args.appNames?.length ? args.appNames : (bundle?.apps ?? []).map((app) => app.name)).filter(Boolean),
  ));
  const explicitFlowNames = (blueprint?.sections ?? []).map((section) => section.flowName).filter((value): value is string => Boolean(value));
  const selectedFlows = selectCanonicalAssetFlows(bundle, {
    requestedSession,
    requestedApps,
    explicitFlowNames,
    maxFlowsPerApp: 1,
  });
  const appByName = new Map((bundle?.apps ?? []).map((app) => [app.name.toLowerCase(), app]));
  const screenById = new Map<string, CanvasAIActionAssetScreen>();
  for (const screen of bundle?.screenshots ?? []) screenById.set(screen.id, screen);
  for (const flow of selectedFlows) for (const screen of flow.screens) screenById.set(screen.id, screen);

  const rawSections = blueprint?.sections?.length
    ? blueprint.sections
    : [{ id: "answer", title: "Answer", body: cleanVisualSentence(args.summary || blueprint?.summary, "North Star assembled an editable visual answer."), kind: "insight" as const, evidenceIds: [] as string[], emphasis: "primary" as const }];
  const sectionIds = new Set<string>();
  const originalSections = rawSections.filter((section) => {
    if (!section.id || sectionIds.has(section.id)) return false;
    sectionIds.add(section.id);
    return true;
  });
  const flowRelevant = /flow|journey|onboard|sequence|experience|funnel/i.test([title, subtitle, blueprint?.visualStrategy].filter(Boolean).join(" "));
  // Canonical tenant flows are authoritative evidence. The model chooses whether flows
  // belong in the story, but it cannot accidentally omit one requested app or duplicate
  // alternate rendered views of the same flow.
  const canonicalFlowSections: CanvasCompositionSection[] = flowRelevant
    ? selectedFlows.map((flow, index) => ({
        id: `reference-flow-${stableVisualBoardId([flow.appName, flow.id])}`,
        title: `${flow.appName} — ${flow.name}`,
        body: "",
        kind: "reference-flow",
        appName: flow.appName,
        flowName: flow.name,
        evidenceIds: flow.screens.map((screen) => screen.id),
        criteria: [],
        emphasis: index === 0 ? "primary" : "normal",
      }))
    : [];
  const sections = [
    ...canonicalFlowSections,
    ...originalSections.filter((section) => section.kind !== "reference-flow"),
  ];
  const flowSections = sections.filter((section) => section.kind === "reference-flow");
  const contentSections = sections.filter((section) => section.kind !== "reference-flow");
  const explicitRegions = new Map((blueprint?.layout.regions ?? []).map((region) => [region.sectionId, region]));

  const boardW = clamp(blueprint?.layout.canvasWidth ?? 1680, 1180, 2400);
  const gap = clamp(blueprint?.layout.gap ?? 24, 18, 48);
  const outerPadding = 34;
  const contentWidth = boardW - outerPadding * 2;
  const headerH = subtitle ? 116 : 82;
  const flowLaneH = blueprint?.layout.evidenceScale === "large" ? 286 : blueprint?.layout.evidenceScale === "compact" ? 224 : 256;
  const flowStartY = rect.y + headerH;
  const flowPlans = flowSections.map((section, index): PlannedNativeSection => ({
    section,
    region: explicitRegions.get(section.id),
    rect: { x: rect.x + outerPadding, y: flowStartY + index * (flowLaneH + gap), w: contentWidth, h: flowLaneH },
  }));
  const contentStartY = flowStartY + flowSections.length * (flowLaneH + gap);
  const evidenceCountBySection = new Map(contentSections.map((section) => [section.id, section.evidenceIds.length]));
  const columns = clamp(blueprint?.layout.columns ?? (contentSections.length >= 5 ? 3 : contentSections.length >= 2 ? 2 : 1), 1, 3);
  const contentPlan = planNativeSections({
    sections: contentSections,
    regions: explicitRegions,
    startX: rect.x + outerPadding,
    startY: contentStartY,
    contentWidth,
    columns,
    gap,
    evidenceCountBySection,
  });
  const plannedBottom = Math.max(
    flowPlans.length > 0 ? flowPlans[flowPlans.length - 1].rect.y + flowLaneH : flowStartY,
    contentPlan.bottom,
  );
  const boardH = clamp(plannedBottom - rect.y + outerPadding, 760, 6000);
  const rootId = stableVisualBoardId([artifactId, "native-composition-root"]);
  const objects: CanvasObject[] = [];
  const add = <T extends CanvasObject>(object: T): T => { objects.push(object); return object; };

  add(createVisualPrimitive("frame", { x: rect.x, y: rect.y, w: boardW, h: boardH }, {
    id: rootId,
    artifactId,
    role: "visual-root",
    label: title,
    componentId: rootId,
    componentType: blueprint?.artifactType ?? args.artifactType ?? "freeform",
    layoutRole: "container",
    layout: { kind: "freeform", gap, paddingTop: outerPadding, paddingRight: outerPadding, paddingBottom: outerPadding, paddingLeft: outerPadding, align: "stretch", overflow: "visible", resizeBehavior: "reflow" },
    style: { fill: NORTHSTAR_VISUAL_TOKENS.board, stroke: "#E2E1EC", strokeWidth: 1, radius: 26, shadow: "0 18px 54px rgba(35,30,78,0.10)" },
    surfaceKind: "presentation",
    surfaceRootId: rootId,
  }));
  add(createVisualPrimitive("text", { x: rect.x + outerPadding, y: rect.y + 26, w: contentWidth, h: 44 }, {
    id: stableVisualBoardId([rootId, "title"]), artifactId, role: "visual-heading", label: title, parentId: rootId, componentId: rootId, layoutRole: "label", text: title,
    style: { fill: "transparent", stroke: "transparent", fontSize: 28, fontWeight: 920, textColor: NORTHSTAR_VISUAL_TOKENS.text }, surfaceKind: "presentation", surfaceRootId: rootId,
  }));
  if (subtitle) {
    add(createVisualPrimitive("text", { x: rect.x + outerPadding, y: rect.y + 74, w: contentWidth, h: 28 }, {
      id: stableVisualBoardId([rootId, "subtitle"]), artifactId, role: "visual-caption", label: subtitle, parentId: rootId, componentId: rootId, layoutRole: "label", text: subtitle,
      style: { fill: "transparent", stroke: "transparent", fontSize: 11.5, fontWeight: 580, textColor: NORTHSTAR_VISUAL_TOKENS.muted }, surfaceKind: "presentation", surfaceRootId: rootId,
    }));
  }

  const findFlow = (section: CanvasCompositionSection): CanvasAIActionAssetFlow | undefined => {
    const exact = selectedFlows.find((flow) =>
      (!section.appName || flow.appName.toLowerCase() === section.appName.toLowerCase()) &&
      (!section.flowName || flow.name.toLowerCase() === section.flowName.toLowerCase()),
    );
    if (exact) return exact;
    return selectedFlows.find((flow) => section.evidenceIds.some((id) => flow.screens.some((screen) => screen.id === id)));
  };

  for (const [index, plan] of flowPlans.entries()) {
    const flow = findFlow(plan.section);
    if (!flow) continue;
    appendEditableFlowLaneObjects({
      objects,
      artifactId,
      parentId: rootId,
      flow,
      appIconUrl: appByName.get(flow.appName.toLowerCase())?.iconUrl,
      rect: plan.rect,
      laneIndex: index,
      density: blueprint?.layout.evidenceScale === "large" ? "large" : blueprint?.layout.evidenceScale === "compact" ? "compact" : "balanced",
      maxScreens: args.executionDepth === "deep" ? 18 : 14,
      surfaceKind: "presentation",
      surfaceRootId: rootId,
      showSummary: false,
    });
  }

  const palette = [
    { accent: NORTHSTAR_VISUAL_TOKENS.violet, soft: NORTHSTAR_VISUAL_TOKENS.violetSoft },
    { accent: NORTHSTAR_VISUAL_TOKENS.blue, soft: NORTHSTAR_VISUAL_TOKENS.blueSoft },
    { accent: NORTHSTAR_VISUAL_TOKENS.green, soft: NORTHSTAR_VISUAL_TOKENS.greenSoft },
    { accent: NORTHSTAR_VISUAL_TOKENS.orange, soft: NORTHSTAR_VISUAL_TOKENS.orangeSoft },
  ];

  for (const [index, plan] of contentPlan.plans.entries()) {
    const { section, rect: sectionRect, region } = plan;
    const color = palette[index % palette.length];
    const sectionId = stableVisualBoardId([artifactId, "section", section.id]);
    const styleVariant = region?.styleVariant ?? (section.emphasis === "primary" ? "contrast" : "soft");
    const fill = styleVariant === "minimal" ? "rgba(255,255,255,0.76)" : section.emphasis === "primary" ? color.soft : "#FFFFFF";
    add(createVisualPrimitive("card", sectionRect, {
      id: sectionId,
      artifactId,
      role: section.kind === "recommendation" ? "visual-recommendation" : section.kind === "decision" ? "visual-decision" : section.kind === "hypothesis" ? "visual-hypothesis" : section.kind === "callout" ? "visual-callout" : "visual-component",
      label: section.title,
      parentId: rootId,
      componentId: sectionId,
      componentType: section.kind,
      layoutRole: "container",
      layout: { kind: "vertical", gap: 12, paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20, align: "stretch", overflow: "clip", resizeBehavior: "reflow" },
      style: { fill, stroke: section.emphasis === "primary" ? `${color.accent}66` : NORTHSTAR_VISUAL_TOKENS.line, strokeWidth: section.emphasis === "primary" ? 1.5 : 1, radius: 20, shadow: styleVariant === "minimal" ? "none" : NORTHSTAR_VISUAL_TOKENS.shadow },
      provenanceIds: section.evidenceIds,
      surfaceKind: "presentation",
      surfaceRootId: rootId,
    }));
    add(createVisualPrimitive("rect", { x: sectionRect.x + 18, y: sectionRect.y + 18, w: 24, h: 24 }, {
      id: stableVisualBoardId([sectionId, "accent"]), artifactId, role: "visual-component", label: `${section.title} accent`, parentId: sectionId, componentId: sectionId, layoutRole: "item",
      style: { fill: color.soft, stroke: "transparent", strokeWidth: 0, radius: 8 }, surfaceKind: "presentation", surfaceRootId: rootId,
    }));
    add(createVisualPrimitive("text", { x: sectionRect.x + 52, y: sectionRect.y + 17, w: sectionRect.w - 70, h: 30 }, {
      id: stableVisualBoardId([sectionId, "title"]), artifactId, role: "visual-heading", label: section.title, parentId: sectionId, componentId: sectionId, layoutRole: "label", text: section.title,
      style: { fill: "transparent", stroke: "transparent", fontSize: 14, fontWeight: 900, textColor: NORTHSTAR_VISUAL_TOKENS.text }, surfaceKind: "presentation", surfaceRootId: rootId,
    }));
    let contentTop = sectionRect.y + 60;
    if (section.body.trim()) {
      const bodyH = Math.min(90, Math.max(42, Math.ceil(section.body.length / Math.max(32, Math.floor(sectionRect.w / 9))) * 15));
      add(createVisualPrimitive("text", { x: sectionRect.x + 20, y: contentTop, w: sectionRect.w - 40, h: bodyH }, {
        id: stableVisualBoardId([sectionId, "body"]), artifactId, role: "visual-body", label: section.body.slice(0, 120), parentId: sectionId, componentId: sectionId, layoutRole: "label", text: section.body,
        style: { fill: "transparent", stroke: "transparent", fontSize: 9.5, fontWeight: 570, textColor: "#555B68" }, surfaceKind: "presentation", surfaceRootId: rootId,
      }));
      contentTop += bodyH + 12;
    }
    const evidence = section.evidenceIds.map((id) => screenById.get(id)).filter((screen): screen is CanvasAIActionAssetScreen => Boolean(screen?.imageUrl));
    const criteria = (section.criteria ?? []).filter(Boolean);

    if (section.kind === "matrix" || section.kind === "table") {
      const apps = selectedFlows.map((flow) => flow.appName);
      const parsedRows = criteria.map((item) => item.split("|").map((part) => part.trim()).filter(Boolean)).filter((row) => row.length > 1);
      const cells = parsedRows.length > 0 ? parsedRows : [
        ["Dimension", ...apps],
        ["Flow", ...selectedFlows.map((flow) => flow.name)],
        ["Mode", ...selectedFlows.map((flow) => flow.sessionType ?? "—")],
        ["Observed path", ...selectedFlows.map((flow) => `${flow.screens.length} screens`)],
      ];
      add(createVisualPrimitive("table", { x: sectionRect.x + 20, y: contentTop, w: sectionRect.w - 40, h: Math.max(110, sectionRect.y + sectionRect.h - contentTop - 20) }, {
        id: stableVisualBoardId([sectionId, "table"]), artifactId, role: "visual-matrix", label: section.title, parentId: sectionId, componentId: sectionId, componentType: "editorial-table", layoutRole: "item", rows: cells.length, cols: Math.max(...cells.map((row) => row.length)), cells,
        style: { fill: "#FFFFFF", stroke: "#E4E3EC", strokeWidth: 1, radius: 12, textColor: "#484D59", fontSize: 9.5, fontWeight: 650 }, provenanceIds: section.evidenceIds, surfaceKind: "presentation", surfaceRootId: rootId,
      }));
      continue;
    }

    if (section.kind === "chart") {
      const flows = section.appName ? selectedFlows.filter((flow) => flow.appName.toLowerCase() === section.appName?.toLowerCase()) : selectedFlows;
      const stages: NorthStarVisualStage[] = ["awareness", "consideration", "action", "verification"];
      flows.slice(0, 3).forEach((flow, flowIndex) => {
        const counts: Record<NorthStarVisualStage, number> = { awareness: 0, consideration: 0, action: 0, verification: 0 };
        flow.screens.forEach((screen) => { counts[inferVisualStage(screen.name || "")] += 1; });
        const blockY = contentTop + flowIndex * 96;
        add(createVisualPrimitive("text", { x: sectionRect.x + 20, y: blockY, w: 110, h: 18 }, {
          id: stableVisualBoardId([sectionId, flow.appName, "label"]), artifactId, role: "visual-chart-label", label: flow.appName, parentId: sectionId, componentId: sectionId, layoutRole: "label", text: flow.appName,
          style: { fill: "transparent", stroke: "transparent", fontSize: 9, fontWeight: 900, textColor: NORTHSTAR_VISUAL_TOKENS.text }, surfaceKind: "presentation", surfaceRootId: rootId,
        }));
        const maxCount = Math.max(1, ...stages.map((stage) => counts[stage]));
        stages.forEach((stage, stageIndex) => {
          const y = blockY + 24 + stageIndex * 15;
          const trackX = sectionRect.x + 100;
          const trackW = Math.max(90, sectionRect.w - 154);
          add(createVisualPrimitive("text", { x: sectionRect.x + 20, y, w: 72, h: 12 }, {
            id: stableVisualBoardId([sectionId, flow.appName, stage, "label"]), artifactId, role: "visual-chart-label", label: stage, parentId: sectionId, componentId: sectionId, layoutRole: "label", text: stage,
            style: { fill: "transparent", stroke: "transparent", fontSize: 6.5, fontWeight: 650, textColor: "#606674" }, surfaceKind: "presentation", surfaceRootId: rootId,
          }));
          add(createVisualPrimitive("pill", { x: trackX, y: y + 1, w: trackW, h: 9 }, {
            id: stableVisualBoardId([sectionId, flow.appName, stage, "track"]), artifactId, role: "visual-component", label: `${stage} track`, parentId: sectionId, componentId: sectionId, layoutRole: "item",
            style: { fill: "#ECEBF2", stroke: "transparent", strokeWidth: 0, radius: 999 }, surfaceKind: "presentation", surfaceRootId: rootId,
          }));
          add(createVisualPrimitive("pill", { x: trackX, y: y + 1, w: Math.max(4, trackW * counts[stage] / maxCount), h: 9 }, {
            id: stableVisualBoardId([sectionId, flow.appName, stage, "bar"]), artifactId, role: "visual-chart-bar", label: `${flow.appName} ${stage}: ${counts[stage]} observed screens`, parentId: sectionId, componentId: sectionId, layoutRole: "item",
            style: { fill: northStarStageColor(stage), stroke: "transparent", strokeWidth: 0, radius: 999 }, provenanceIds: flow.screens.filter((screen) => inferVisualStage(screen.name || "") === stage).map((screen) => screen.id), surfaceKind: "presentation", surfaceRootId: rootId,
          }));
          add(createVisualPrimitive("text", { x: trackX + trackW + 6, y: y - 1, w: 32, h: 12 }, {
            id: stableVisualBoardId([sectionId, flow.appName, stage, "value"]), artifactId, role: "visual-chart-label", label: `${counts[stage]}`, parentId: sectionId, componentId: sectionId, layoutRole: "label", text: String(counts[stage]),
            style: { fill: "transparent", stroke: "transparent", fontSize: 6.5, fontWeight: 850, textColor: "#4C5260", textAlign: "right" }, surfaceKind: "presentation", surfaceRootId: rootId,
          }));
        });
      });
      continue;
    }

    if (["timeline", "roadmap", "process"].includes(section.kind)) {
      const steps = (criteria.length > 0 ? criteria : evidence.map((screen) => screen.name)).slice(0, 8);
      const stepCount = Math.max(1, steps.length);
      const stepGap = 12;
      const stepW = (sectionRect.w - 40 - stepGap * Math.max(0, stepCount - 1)) / stepCount;
      steps.forEach((step, stepIndex) => {
        const x = sectionRect.x + 20 + stepIndex * (stepW + stepGap);
        add(createVisualPrimitive("circle", { x: x + stepW / 2 - 11, y: contentTop, w: 22, h: 22 }, {
          id: stableVisualBoardId([sectionId, "step", stepIndex, "number"]), artifactId, role: "visual-stage-badge", label: `Step ${stepIndex + 1}`, parentId: sectionId, componentId: sectionId, layoutRole: "item", text: String(stepIndex + 1),
          style: { fill: color.accent, stroke: "#FFFFFF", strokeWidth: 2, radius: 999, fontSize: 7, fontWeight: 900, textColor: "#FFFFFF", textAlign: "center" }, surfaceKind: "presentation", surfaceRootId: rootId,
        }));
        add(createVisualPrimitive("card", { x, y: contentTop + 34, w: stepW, h: Math.max(72, sectionRect.y + sectionRect.h - contentTop - 54) }, {
          id: stableVisualBoardId([sectionId, "step", stepIndex]), artifactId, role: "visual-timeline", label: step, parentId: sectionId, componentId: sectionId, componentType: "timeline-step", layoutRole: "item", text: step,
          style: { fill: "#FCFCFE", stroke: "#E7E6EF", strokeWidth: 1, radius: 14, fontSize: 8.5, fontWeight: 650, textColor: "#4F5562", textAlign: "center" }, surfaceKind: "presentation", surfaceRootId: rootId,
        }));
      });
      continue;
    }

    if (["evidence-group", "source-cluster", "stage"].includes(section.kind)) {
      const visible = evidence.slice(0, args.executionDepth === "deep" ? 12 : 8);
      const evidenceLayout = region?.evidenceLayout ?? "grid";
      const cols = evidenceLayout === "row" || evidenceLayout === "filmstrip" ? Math.max(1, visible.length) : clamp(region?.columns ?? Math.ceil(Math.sqrt(visible.length || 1)), 1, 5);
      const rows = Math.max(1, Math.ceil(visible.length / cols));
      const imageGap = 14;
      const imageW = Math.max(44, (sectionRect.w - 40 - imageGap * Math.max(0, cols - 1)) / cols);
      const availableH = sectionRect.y + sectionRect.h - contentTop - 20;
      const imageH = Math.min(imageW / 0.515, (availableH - imageGap * Math.max(0, rows - 1)) / rows);
      visible.forEach((screen, screenIndex) => {
        const col = screenIndex % cols;
        const row = Math.floor(screenIndex / cols);
        add(createVisualPrimitive("image", { x: sectionRect.x + 20 + col * (imageW + imageGap), y: contentTop + row * (imageH + imageGap), w: imageW, h: imageH }, {
          id: stableVisualBoardId([sectionId, "evidence", screen.id]), artifactId, role: "visual-flow-screen", label: screen.name, parentId: sectionId, componentId: sectionId, componentType: "source-image", layoutRole: "media", imageUrl: screen.imageUrl,
          source: { kind: "northstar-screenshot", appName: screen.appName, flowName: screen.flowName, flowType: canonicalVisualSessionType(screen.sessionType) ?? "unknown", screenLabel: screen.name, screenshotUrl: screen.imageUrl, screenshotFile: screen.sourceUrl, stepIndex: screen.index },
          style: { fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 8, shadow: "0 5px 13px rgba(26,24,62,0.07)" }, provenanceIds: [screen.id], surfaceKind: "presentation", surfaceRootId: rootId,
        }));
      });
      continue;
    }

    const items = criteria.length > 0 ? criteria : section.body.trim() ? [] : evidence.map((screen) => screen.name);
    items.slice(0, 6).forEach((item, itemIndex) => {
      add(createVisualPrimitive("card", { x: sectionRect.x + 20, y: contentTop + itemIndex * 42, w: sectionRect.w - 40, h: 34 }, {
        id: stableVisualBoardId([sectionId, "item", itemIndex]), artifactId,
        role: section.kind === "recommendation" ? "visual-recommendation" : section.kind === "decision" ? "visual-decision" : section.kind === "hypothesis" ? "visual-hypothesis" : "visual-insight",
        label: item, parentId: sectionId, componentId: sectionId, componentType: `${section.kind}-row`, layoutRole: "item", text: item,
        style: { fill: "#FCFCFE", stroke: "#E8E7F0", strokeWidth: 1, radius: 10, fontSize: 8.5, fontWeight: 650, textColor: "#505664" }, surfaceKind: "presentation", surfaceRootId: rootId,
      }));
    });
  }

  const repaired = repairReferenceFlowAssociations(objects);
  const normalized = normalizeCanvasScene(stampSurfaceOwnership(repaired, artifactId, "presentation", rootId));
  return { objects: normalized, title };
}


type NativeSceneValidationResult = { ok: boolean; issues: string[] };

function collectSemanticDescendantIds(
  objects: CanvasObject[],
  rootIds: Iterable<string>,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const object of objects) {
    const parentId = object.semantic?.parentId;
    if (!parentId) continue;
    const children = childrenByParent.get(parentId);
    if (children) children.push(object.id);
    else childrenByParent.set(parentId, [object.id]);
  }

  const descendants = new Set<string>();
  const queue = Array.from(rootIds);
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) continue;
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      queue.push(childId);
    }
  }
  return descendants;
}

function repairReferenceFlowAssociations(objects: CanvasObject[]): CanvasObject[] {
  const lanes = objects.filter(
    (object): object is CanvasBoxObject =>
      isBoxObject(object) && object.semantic?.role === "visual-flow-lane",
  );
  if (lanes.length === 0) return objects;

  const laneEvidence = new Map<string, Set<string>>();
  for (const lane of lanes) {
    laneEvidence.set(lane.id, new Set(lane.semantic?.provenanceIds ?? []));
  }

  return objects.map((object): CanvasObject => {
    if (!isBoxObject(object) || object.semantic?.role !== "visual-flow-screen") return object;
    const provenance = object.semantic?.provenanceIds ?? [];
    const explicitLaneId = object.semantic?.sectionId;
    const matchedLane =
      (explicitLaneId && laneEvidence.has(explicitLaneId) ? explicitLaneId : undefined) ??
      lanes.find((lane) => {
        const expected = laneEvidence.get(lane.id);
        return expected && provenance.some((id) => expected.has(id));
      })?.id;
    if (!matchedLane || !object.semantic) return object;
    if (object.semantic.sectionId === matchedLane) return object;
    return {
      ...object,
      semantic: { ...object.semantic, sectionId: matchedLane },
    } as CanvasObject;
  });
}

function validateNativeCompositionScene(
  objects: CanvasObject[],
  artifactId: string,
  rootId: string,
): NativeSceneValidationResult {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const object of objects) {
    if (seen.has(object.id)) issues.push(`duplicate object identity: ${object.id}`);
    seen.add(object.id);
  }
  const root = objects.find((object): object is CanvasBoxObject => isBoxObject(object) && object.id === rootId);
  if (!root) issues.push("missing presentation root");
  const idSet = new Set(objects.map((object) => object.id));
  for (const object of objects) {
    if (object.semantic?.artifactId !== artifactId) issues.push(`artifact ownership mismatch: ${object.id}`);
    if (object.semantic?.surfaceKind !== "presentation") issues.push(`surface ownership mismatch: ${object.id}`);
    if (object.semantic?.surfaceRootId !== rootId) issues.push(`surface root mismatch: ${object.id}`);
    const parentId = object.semantic?.parentId;
    if (parentId && !idSet.has(parentId)) issues.push(`orphaned child: ${object.id}`);
  }
  if (root) {
    const rootBounds = getObjectBounds(root);
    for (const object of objects) {
      if (object.id === root.id || isConnectorObject(object) || object.hidden) continue;
      const bounds = getObjectBounds(object);
      const tolerance = 3;
      if (
        bounds.x < rootBounds.x - tolerance ||
        bounds.y < rootBounds.y - tolerance ||
        bounds.x + bounds.w > rootBounds.x + rootBounds.w + tolerance ||
        bounds.y + bounds.h > rootBounds.y + rootBounds.h + tolerance
      ) {
        issues.push(`content escapes presentation surface: ${object.id}`);
      }
    }
    const topLevel = objects.filter(
      (object): object is CanvasBoxObject =>
        isBoxObject(object) &&
        !object.hidden &&
        object.semantic?.parentId === root.id &&
        object.semantic?.layoutRole === "container",
    );
    for (let first = 0; first < topLevel.length; first += 1) {
      for (let second = first + 1; second < topLevel.length; second += 1) {
        if (rectsOverlap(getObjectBounds(topLevel[first]), getObjectBounds(topLevel[second]), 1)) {
          issues.push(`overlapping top-level regions: ${topLevel[first].id} and ${topLevel[second].id}`);
        }
      }
    }
  }
  const flowLanes = objects.filter((object) => object.semantic?.role === "visual-flow-lane");
  for (const lane of flowLanes) {
    if (!isBoxObject(lane)) continue;
    const laneDescendants = collectSemanticDescendantIds(objects, [lane.id]);
    const expectedEvidence = new Set(lane.semantic?.provenanceIds ?? []);
    const screens = objects.filter(
      (object): object is CanvasBoxObject => {
        if (!isBoxObject(object) || object.semantic?.role !== "visual-flow-screen" || !object.imageUrl) return false;
        if (laneDescendants.has(object.id) || object.semantic?.sectionId === lane.id) return true;
        const provenance = object.semantic?.provenanceIds ?? [];
        return expectedEvidence.size > 0 && provenance.some((id) => expectedEvidence.has(id));
      },
    );
    if (expectedEvidence.size === 0) {
      issues.push(`reference flow has no evidence manifest: ${lane.id}`);
    } else if (screens.length === 0) {
      issues.push(`reference flow lost its rendered screens: ${lane.id}`);
    }
    const renderedEvidence = new Set(
      screens.flatMap((screen) => screen.semantic?.provenanceIds ?? []),
    );
    if (expectedEvidence.size > 0 && renderedEvidence.size > 0) {
      const missing = [...expectedEvidence].filter((id) => !renderedEvidence.has(id));
      if (missing.length === expectedEvidence.size) {
        issues.push(`reference flow evidence is disconnected from its lane: ${lane.id}`);
      }
    }
    for (const screen of screens) {
      const screenBounds = getObjectBounds(screen);
      const laneBounds = getObjectBounds(lane);
      if (screenBounds.x < laneBounds.x - 2 || screenBounds.x + screenBounds.w > laneBounds.x + laneBounds.w + 2) {
        issues.push(`reference screen escapes flow lane: ${screen.id}`);
      }
    }
  }
  return { ok: issues.length === 0, issues: Array.from(new Set(issues)).slice(0, 20) };
}

function getSemanticDescendantIds(objects: CanvasObject[], parentIds: string[]): string[] {
  const descendants = new Set<string>();
  const queue = [...parentIds];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const object of objects) {
      if (object.semantic?.parentId !== parentId || descendants.has(object.id)) continue;
      descendants.add(object.id);
      queue.push(object.id);
    }
  }
  return [...descendants];
}

function expandIdsWithSemanticDescendants(objects: CanvasObject[], ids: string[]): string[] {
  return Array.from(new Set([...ids, ...getSemanticDescendantIds(objects, ids)]));
}

/**
 * Resolves accidental overlap between top-level native composition regions
 * without flattening or repacking their internal semantic children. Side-by-side
 * regions stay untouched; only intersecting regions are shifted into the next
 * available vertical slot. The root expands when necessary.
 */
function resolveNativeCompositionCollisions(
  objects: CanvasObject[],
  rootId: string,
  gap = 18,
): CanvasObject[] {
  const root = objects.find((object): object is CanvasBoxObject => isBoxObject(object) && object.id === rootId);
  if (!root) return objects;
  let next = objects;
  const candidates = objects
    .filter((object): object is CanvasBoxObject =>
      isBoxObject(object) &&
      !object.hidden &&
      object.semantic?.parentId === rootId &&
      object.semantic?.layoutRole === "container" &&
      object.id !== rootId,
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: Rect[] = [];
  let maxBottom = root.y + root.h;

  for (const candidate of candidates) {
    let current = next.find((object): object is CanvasBoxObject => isBoxObject(object) && object.id === candidate.id) ?? candidate;
    let guard = 0;
    while (placed.some((rect) => rectsOverlap(getObjectBounds(current), rect, gap / 2)) && guard < candidates.length + 4) {
      const blockers = placed.filter((rect) => rectsOverlap(getObjectBounds(current), rect, gap / 2));
      const targetY = Math.max(...blockers.map((rect) => rect.y + rect.h)) + gap;
      const dy = targetY - current.y;
      const subtree = new Set([current.id, ...getSemanticDescendantIds(next, [current.id])]);
      next = next.map((object) => subtree.has(object.id) ? translateCanvasObject(object, 0, dy) : object);
      current = next.find((object): object is CanvasBoxObject => isBoxObject(object) && object.id === candidate.id) ?? current;
      guard += 1;
    }
    const bounds = getObjectBounds(current);
    placed.push(bounds);
    maxBottom = Math.max(maxBottom, bounds.y + bounds.h + 28);
  }

  if (maxBottom > root.y + root.h) {
    next = next.map((object) => object.id === rootId && isBoxObject(object)
      ? { ...object, h: maxBottom - root.y }
      : object);
  }
  return next;
}

function shouldMoveSemanticComponent(object: CanvasObject): boolean {
  return object.semantic?.layoutRole === "container" || object.semantic?.role === "visual-root" || object.semantic?.role === "visual-section" || object.semantic?.role === "visual-component" || object.semantic?.role === "visual-flow-lane";
}

function getDirectSemanticChildren(objects: CanvasObject[], parentId: string): CanvasBoxObject[] {
  return objects
    .filter(
      (object): object is CanvasBoxObject =>
        isBoxObject(object) &&
        !object.hidden &&
        object.semantic?.parentId === parentId &&
        object.semantic?.layoutItem?.absolute !== true,
    )
    .sort((a, b) => {
      const orderA = a.semantic?.layoutItem?.order ?? 0;
      const orderB = b.semantic?.layoutItem?.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
      return a.x - b.x;
    });
}

function reflowSemanticContainer(objects: CanvasObject[], containerId: string): CanvasObject[] {
  const container = objects.find(
    (object): object is CanvasBoxObject => isBoxObject(object) && object.id === containerId,
  );
  const layout = container?.semantic?.layout;
  if (!container || !layout || layout.kind === "freeform") return objects;

  const children = getDirectSemanticChildren(objects, containerId);
  if (children.length === 0) return objects;

  const innerX = container.x + layout.paddingLeft;
  const innerY = container.y + layout.paddingTop;
  const innerW = Math.max(1, container.w - layout.paddingLeft - layout.paddingRight);
  const innerH = Math.max(1, container.h - layout.paddingTop - layout.paddingBottom);
  const gap = Math.max(0, layout.gap);
  const nextById = new Map<string, CanvasBoxObject>();

  if (layout.kind === "horizontal") {
    const totalGap = gap * Math.max(0, children.length - 1);
    const totalGrow = children.reduce((sum, child) => sum + Math.max(0, child.semantic?.layoutItem?.grow ?? 0), 0);
    const fixed = children.reduce((sum, child) => {
      if ((child.semantic?.layoutItem?.grow ?? 0) > 0) return sum;
      return sum + Math.max(1, child.semantic?.layoutItem?.basis ?? child.w);
    }, 0);
    const free = Math.max(0, innerW - totalGap - fixed);
    let cursor = innerX;
    children.forEach((child) => {
      const grow = Math.max(0, child.semantic?.layoutItem?.grow ?? 0);
      const width = grow > 0 && totalGrow > 0
        ? Math.max(1, free * grow / totalGrow)
        : Math.max(1, child.semantic?.layoutItem?.basis ?? child.w);
      const align = child.semantic?.layoutItem?.alignSelf ?? layout.align ?? "stretch";
      const height = align === "stretch" ? innerH : Math.min(child.h, innerH);
      const y = align === "center"
        ? innerY + (innerH - height) / 2
        : align === "end"
          ? innerY + innerH - height
          : innerY;
      nextById.set(child.id, { ...child, x: cursor, y, w: width, h: height });
      cursor += width + gap;
    });
  } else if (layout.kind === "vertical") {
    const totalGap = gap * Math.max(0, children.length - 1);
    const totalGrow = children.reduce((sum, child) => sum + Math.max(0, child.semantic?.layoutItem?.grow ?? 0), 0);
    const fixed = children.reduce((sum, child) => {
      if ((child.semantic?.layoutItem?.grow ?? 0) > 0) return sum;
      return sum + Math.max(1, child.semantic?.layoutItem?.basis ?? child.h);
    }, 0);
    const free = Math.max(0, innerH - totalGap - fixed);
    let cursor = innerY;
    children.forEach((child) => {
      const grow = Math.max(0, child.semantic?.layoutItem?.grow ?? 0);
      const height = grow > 0 && totalGrow > 0
        ? Math.max(1, free * grow / totalGrow)
        : Math.max(1, child.semantic?.layoutItem?.basis ?? child.h);
      const align = child.semantic?.layoutItem?.alignSelf ?? layout.align ?? "stretch";
      const width = align === "stretch" ? innerW : Math.min(child.w, innerW);
      const x = align === "center"
        ? innerX + (innerW - width) / 2
        : align === "end"
          ? innerX + innerW - width
          : innerX;
      nextById.set(child.id, { ...child, x, y: cursor, w: width, h: height });
      cursor += height + gap;
    });
  } else {
    const columns = Math.max(1, Math.min(children.length, layout.columns ?? Math.ceil(Math.sqrt(children.length))));
    const rows = Math.max(1, Math.ceil(children.length / columns));
    const cellW = Math.max(1, (innerW - gap * Math.max(0, columns - 1)) / columns);
    const cellH = Math.max(1, (innerH - gap * Math.max(0, rows - 1)) / rows);
    children.forEach((child, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      nextById.set(child.id, {
        ...child,
        x: innerX + col * (cellW + gap),
        y: innerY + row * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    });
  }

  let next = objects.map((object) => nextById.get(object.id) ?? object);
  for (const child of children) {
    if (child.semantic?.layout) next = reflowSemanticContainer(next, child.id);
  }
  return resolveConnectorBindings(next);
}

function reflowSemanticTree(objects: CanvasObject[], rootIds?: string[]): CanvasObject[] {
  const containers = objects.filter(
    (object): object is CanvasBoxObject =>
      isBoxObject(object) &&
      Boolean(object.semantic?.layout) &&
      (!rootIds || rootIds.includes(object.id) || rootIds.includes(object.semantic?.parentId ?? "")),
  );
  return containers.reduce((current, container) => reflowSemanticContainer(current, container.id), objects);
}


function isArtifactWorkingRole(role?: CanvasSemanticRole) {
  return (
    role === "working-frame" ||
    role === "working-heading" ||
    role === "working-note" ||
    role === "working-evidence"
  );
}

function isArtifactPresentationRole(role?: CanvasSemanticRole) {
  return Boolean(role && (role.startsWith("artifact-") || role.startsWith("visual-")));
}

function isArtifactWorkingObject(object: CanvasObject): boolean {
  return isCanvasObjectOnSurface(object, "working");
}

function isArtifactPresentationObject(object: CanvasObject): boolean {
  return isCanvasObjectOnSurface(object, "presentation");
}

function getCanvasAIAssetScreenSize(screen: CanvasAIActionAssetScreen) {
  const isWeb =
    screen.platform === "web" ||
    /(^|\/)web(\/|$)/i.test(screen.sourceUrl ?? "") ||
    /desktop|browser|web/i.test(screen.name);
  return isWeb ? { w: 440, h: 278 } : { w: 260, h: 563 };
}

function compositionTypeLabel(value?: CanvasAIActionArguments["artifactType"]) {
  if (!value) return "visual solution";
  return value.replace(/-/g, " ");
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function describeCanvasObjectForUser(object: CanvasObject): string {
  if (object.type === "connector") return "the connector";

  const source = object.source;
  const role = object.semantic?.role;

  if (
    source?.kind === "northstar-screenshot" ||
    role === "flow-screen" ||
    role === "single-screen"
  ) {
    return source?.appName
      ? `the ${source.appName} screenshot`
      : "the screenshot";
  }

  if (role === "flow-app-icon") {
    return source?.appName
      ? `the ${source.appName} app icon`
      : "the app icon";
  }

  switch (object.type) {
    case "circle":
      return "the circle";
    case "ellipse":
      return "the ellipse";
    case "rect":
      return "the rectangle";
    case "diamond":
      return "the diamond";
    case "triangle":
      return "the triangle";
    case "pill":
      return "the pill";
    case "callout":
      return "the callout";
    case "divider":
      return "the divider";
    case "icon-chip":
      return "the icon chip";
    case "icon":
      return "the icon";
    case "badge":
      return "the badge";
    case "pin":
      return "the pin";
    case "freeform":
      return "the freeform shape";
    case "highlight-region":
      return "the highlight region";
    case "note":
      return "the note";
    case "text":
      return "the text";
    case "image":
      return "the image";
    case "card":
      return "the card";
    case "frame":
      return "the frame";
    case "table":
      return "the table";
    case "flow-header":
      return "the flow header";
    case "visual-board":
      return "the North Star visual board";
    default:
      return "the canvas item";
  }
}

function describeCanvasObjectsForUser(objects: CanvasObject[]): string {
  const unique = Array.from(
    new Map(objects.map((object) => [object.id, object])).values(),
  );

  if (unique.length === 0) return "the selected item";
  if (unique.length === 1) return describeCanvasObjectForUser(unique[0]);

  const labels = unique.map(describeCanvasObjectForUser);
  if (labels.every((label) => label.includes("screenshot"))) {
    return "the screenshots";
  }
  if (labels.every((label) => label === "the circle")) {
    return "the circles";
  }
  if (labels.every((label) => label === labels[0])) {
    const singular = labels[0].replace(/^the\s+/i, "");
    return `the ${singular.endsWith("s") ? singular : `${singular}s`}`;
  }

  return "the selected items";
}

function normalizeCanvasTargetLabel(
  value: string | undefined,
  objectCount: number,
): string {
  const trimmed = value?.trim().replace(/[.!?]+$/, "");
  if (trimmed) {
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount > 8 || trimmed.length > 72) {
      return objectCount === 1 ? "the selected item" : "the selected items";
    }
    const alreadyQualified = /^(?:the|a|an|this|that|these|those|all|both|each|every|any|my|your|our|its|his|her|selected|last|first|second|third|\d+)\b/i.test(
      trimmed,
    );
    return alreadyQualified ? trimmed : `the ${trimmed}`;
  }
  return objectCount === 1 ? "the selected item" : "the selected items";
}

function humanizeCanvasColor(value: string): string {
  const normalized = value.trim().toLowerCase();
  const names: Record<string, string> = {
    "#000": "black",
    "#000000": "black",
    "#09090b": "black",
    "#fff": "white",
    "#ffffff": "white",
    "#ef4444": "red",
    "#dc2626": "red",
    "#f97316": "orange",
    "#fb923c": "orange",
    "#facc15": "yellow",
    "#eab308": "yellow",
    "#22c55e": "green",
    "#16a34a": "green",
    "#06b6d4": "cyan",
    "#0ea5e9": "blue",
    "#3b82f6": "blue",
    "#2563eb": "blue",
    "#0066ff": "blue",
    "#0088ff": "blue",
    "#6366f1": "indigo",
    "#8b5cf6": "purple",
    "#a855f7": "purple",
    "#ec4899": "pink",
    "#f43f5e": "rose",
    "transparent": "transparent",
  };

  if (names[normalized]) return names[normalized];
  if (/^[a-z]+$/i.test(value.trim())) return value.trim().toLowerCase();
  return value.trim().toUpperCase();
}

function quoteCanvasText(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  const clipped = compact.length > 96 ? `${compact.slice(0, 93)}…` : compact;
  return `“${clipped}”`;
}

function buildSemanticCanvasActionCompletion(
  record: CanvasAIActionExecutionRecord,
): string {
  const args = record.arguments ?? {};
  const objectCount = Math.max(1, record.objectIds.length);
  const target =
    record.targetLabel ??
    normalizeCanvasTargetLabel(args.targetQuery, objectCount);

  switch (record.tool) {
    case "create_shape": {
      const shape = args.shape ?? "shape";
      const label = shape === "rect" ? "rectangle" : shape;
      return `I added a ${label} to the canvas.`;
    }
    case "create_visual_component":
      return `I created the editable ${args.componentPreset?.replace(/-/g, " ") ?? "visual component"}.`;
    case "create_text":
      return args.text?.trim()
        ? `I added ${quoteCanvasText(args.text)} to the canvas.`
        : "I added editable text to the canvas.";
    case "create_note":
      return args.text?.trim()
        ? `I added a note that says ${quoteCanvasText(args.text)}.`
        : "I added a note to the canvas.";
    case "create_connector": {
      const from =
        record.fromLabel ??
        normalizeCanvasTargetLabel(args.fromQuery, 1);
      const to =
        record.toLabel ??
        normalizeCanvasTargetLabel(args.toQuery, 1);
      if (
        record.fromLabel ||
        record.toLabel ||
        (args.fromQuery?.trim() && args.toQuery?.trim())
      ) {
        return `I connected ${from} and ${to}.`;
      }
      return "I connected the two selected items.";
    }
    case "insert_app_icon": {
      const appName = record.asset?.app?.name ?? args.appName;
      return appName
        ? `I added the ${appName} app icon to the canvas.`
        : "I added the app icon to the canvas.";
    }
    case "insert_screenshot": {
      const screenName = record.asset?.screenshot?.name;
      const appName = record.asset?.app?.name ?? record.asset?.screenshot?.appName;
      if (screenName && appName) {
        return `I added ${quoteCanvasText(screenName)} from ${appName} to the canvas.`;
      }
      if (screenName) return `I added ${quoteCanvasText(screenName)} to the canvas.`;
      return "I added the screenshot to the canvas.";
    }
    case "insert_flow": {
      const flowName = record.asset?.flow?.name ?? args.flowName;
      const appName = record.asset?.app?.name ?? args.appName;
      if (flowName && appName) {
        return `I added the ${flowName} flow from ${appName} to the canvas.`;
      }
      if (flowName) return `I added the ${flowName} flow to the canvas.`;
      return "I added the flow to the canvas.";
    }
    case "update_object_style": {
      const changes: string[] = [];
      if (args.fill !== undefined) {
        changes.push(`fill to ${humanizeCanvasColor(args.fill)}`);
      }
      if (args.stroke !== undefined) {
        changes.push(`outline to ${humanizeCanvasColor(args.stroke)}`);
      }
      if (args.textColor !== undefined) {
        changes.push(`text to ${humanizeCanvasColor(args.textColor)}`);
      }
      if (args.strokeWidth !== undefined) {
        changes.push(`outline width to ${args.strokeWidth}px`);
      }
      if (args.fontSize !== undefined) {
        changes.push(`font size to ${args.fontSize}px`);
      }
      if (args.fontWeight !== undefined) {
        changes.push(`font weight to ${args.fontWeight}`);
      }
      if (args.textAlign !== undefined) {
        changes.push(`text alignment to ${args.textAlign}`);
      }
      if (args.connectorKind !== undefined) {
        changes.push(`connector style to ${args.connectorKind}`);
      }
      if (args.connectorDash !== undefined) {
        changes.push(`line style to ${args.connectorDash}`);
      }
      if (args.connectorEnd !== undefined) {
        changes.push(`connector end to ${args.connectorEnd}`);
      }

      if (changes.length === 1 && args.fill !== undefined) {
        return `I changed ${target} to ${humanizeCanvasColor(args.fill)}.`;
      }
      if (changes.length === 1 && args.stroke !== undefined) {
        return `I changed ${target}'s outline to ${humanizeCanvasColor(args.stroke)}.`;
      }
      if (changes.length === 1 && args.textColor !== undefined) {
        return `I changed ${target}'s text to ${humanizeCanvasColor(args.textColor)}.`;
      }
      if (changes.length > 0) {
        return `I updated ${target}: ${changes.join(", ")}.`;
      }
      return `I updated ${target}'s appearance.`;
    }
    case "resize_objects": {
      if (typeof args.scale === "number" && Number.isFinite(args.scale)) {
        const percent = Math.round(Math.abs(args.scale - 1) * 100);
        if (args.scale > 1) return `I made ${target} ${percent}% larger.`;
        if (args.scale < 1) return `I made ${target} ${percent}% smaller.`;
      }
      if (args.width !== undefined && args.height !== undefined) {
        return `I resized ${target} to ${Math.round(args.width)} × ${Math.round(args.height)}.`;
      }
      if (args.width !== undefined) {
        return `I resized ${target} to ${Math.round(args.width)} pixels wide.`;
      }
      if (args.height !== undefined) {
        return `I resized ${target} to ${Math.round(args.height)} pixels tall.`;
      }
      return `I resized ${target}.`;
    }
    case "rotate_objects": {
      const angle = args.rotation ?? args.rotationDelta;
      return typeof angle === "number"
        ? `I rotated ${target} by ${Math.abs(Math.round(angle))} degrees.`
        : `I rotated ${target}.`;
    }
    case "update_text":
      return args.text !== undefined
        ? `I changed ${target}'s text to ${quoteCanvasText(args.text)}.`
        : `I updated the text in ${target}.`;
    case "duplicate_objects": {
      const count = Math.max(1, Math.round(args.copyCount ?? record.objectIds.length));
      return `I made ${count} ${count === 1 ? "copy" : "copies"} of ${target}.`;
    }
    case "delete_objects":
      return `I removed ${target} from the canvas.`;
    case "arrange_objects": {
      const layout = args.layout ?? "horizontal";
      const description =
        layout === "vertical"
          ? "a vertical stack"
          : layout === "grid"
            ? "a grid"
            : "a horizontal row";
      return `I arranged ${target} in ${description}.`;
    }
    case "create_working_surface":
      return "I created an inspectable working surface for the research, assumptions, and checkpoints behind the solution.";
    case "update_working_surface":
      return "I updated the research workspace with the latest evidence and decisions.";
    case "create_artifact_shell":
      return args.title?.trim()
        ? `I created the presentation structure for ${quoteCanvasText(args.title)}.`
        : "I created the presentation structure.";
    case "add_artifact_section":
      return args.title?.trim()
        ? `I added the grounded ${quoteCanvasText(args.title)} section.`
        : "I added a grounded artifact section.";
    case "add_artifact_summary":
      return "I added the supported main takeaway.";
    case "audit_artifact_semantics":
      return "I verified the artifact's evidence provenance and corrected any mismatch I could ground safely.";
    case "compose_artifact": {
      const title = args.title?.trim();
      const type = compositionTypeLabel(args.artifactType);
      return title
        ? `I built ${quoteCanvasText(title)} as a complete editable ${type}.`
        : `I built a complete editable ${type}.`;
    }
    case "compose_visual_board":
    case "compose_visual_scene":
      return args.title?.trim()
        ? `I built ${quoteCanvasText(args.title)} as a coherent editable visual scene.`
        : "I built the editable visual scene.";
    case "validate_visual_board":
      return "I verified the reference flows, comparison framework, evidence notes, and executive summary.";
    case "review_artifact_layout":
      return "I reviewed the live artifact and corrected its layout, proportions, and structure where needed.";
    case "refine_artifact_presentation":
      return "I refined the artifact's hierarchy and presentation so the result is easier to understand.";
    case "move_objects":
      return `I moved ${target}.`;
    case "align_objects":
      return args.alignment
        ? `I aligned ${target} to the ${args.alignment}.`
        : `I aligned ${target}.`;
    case "distribute_objects":
      return `I spaced ${target} evenly ${args.axis ?? "horizontal"}.`;
    case "select_objects":
      return `I selected ${target}.`;
    case "focus_objects":
      return `I centered ${target} in view.`;
    default:
      return ensureSentence(record.detail);
  }
}

function buildCanvasAIActionOutcomeMessage(
  records: CanvasAIActionExecutionRecord[],
  failureCount: number,
): string {
  const compositionRecord = records.find(
    (record) =>
      (record.tool === "create_artifact_shell" || record.tool === "compose_artifact" || record.tool === "compose_visual_board" || record.tool === "compose_visual_scene") &&
      record.ok,
  );
  const compositionTools = new Set<CanvasAIActionTool>([
    "create_working_surface",
    "update_working_surface",
    "create_artifact_shell",
    "add_artifact_section",
    "add_artifact_summary",
    "audit_artifact_semantics",
    "compose_artifact",
    "compose_visual_board",
    "compose_visual_scene",
    "validate_visual_board",
    "review_artifact_layout",
    "refine_artifact_presentation",
  ]);
  const compositionFailure = records.some(
    (record) =>
      !record.ok &&
      (record.tool === "compose_visual_board" ||
        record.tool === "compose_visual_scene" ||
        record.tool === "compose_artifact" ||
        record.tool === "validate_visual_board"),
  );
  const attemptedComposition = records.some(
    (record) =>
      compositionTools.has(record.tool) ||
      /composition|visual scene|visual board|artifact/i.test(record.label),
  );
  const preservedResearch = records.some(
    (record) =>
      record.ok &&
      (record.tool === "create_working_surface" || record.tool === "update_working_surface"),
  );
  if (!compositionRecord && attemptedComposition && (compositionFailure || failureCount > 0)) {
    const failed = records.find(
      (record) => !record.ok && /composition|visual scene|visual board|artifact/i.test(`${record.label} ${record.detail}`),
    );
    const prefix = preservedResearch
      ? "The research workspace was preserved, but the final editable composition was not created."
      : "The final editable composition was not created.";
    return failed?.detail?.trim() ? `${prefix} ${ensureSentence(failed.detail)}` : prefix;
  }
  if (compositionRecord && !compositionFailure && failureCount === 0) {
    const title = compositionRecord.arguments.title?.trim();
    const type = compositionTypeLabel(compositionRecord.arguments.artifactType);
    const workingVisible = compositionRecord.arguments.workingVisibility !== "hidden";
    const summaryRecord = records.find(
      (record) => record.tool === "add_artifact_summary" && record.ok,
    );
    const takeaway = compositionRecord.tool === "compose_visual_board" || compositionRecord.tool === "compose_visual_scene"
      ? compositionRecord.arguments.summary?.trim()
      : summaryRecord?.arguments.summary?.trim();
    const built = title
      ? `Yes — I built ${quoteCanvasText(title)} as an editable ${type}.`
      : `Yes — I built the complete editable ${type}.`;
    const answer = takeaway
      ? ` Main takeaway: ${ensureSentence(takeaway)}`
      : "";
    const working = compositionRecord.tool === "compose_visual_board" || compositionRecord.tool === "compose_visual_scene"
      ? " The ordered reference flows, evidence notes, hypotheses, and decisions remain visible inside the board."
      : workingVisible
        ? " I also kept the working surface available so you can inspect the evidence and decisions behind it."
        : "";
    return `${built}${answer}${working}`;
  }

  if (compositionFailure) {
    const failedComposition = records.find(
      (record) =>
        !record.ok &&
        (record.tool === "compose_visual_board" ||
          record.tool === "compose_visual_scene" ||
          record.tool === "compose_artifact" ||
          record.tool === "validate_visual_board"),
    );
    const hasPreservedResearch = records.some(
      (record) =>
        record.ok &&
        (record.tool === "create_working_surface" || record.tool === "update_working_surface"),
    );
    const prefix = hasPreservedResearch
      ? "The research workspace was preserved, but the final editable composition was not created."
      : "The final editable composition was not created.";
    const detail = failedComposition?.detail?.trim();
    return detail ? `${prefix} ${ensureSentence(detail)}` : prefix;
  }

  const meaningfulRecords = records.filter(
    (record) =>
      record.tool !== "focus_objects" &&
      record.tool !== "select_objects" &&
      !compositionTools.has(record.tool),
  );
  const displayRecords =
    meaningfulRecords.length > 0 ? meaningfulRecords : records;
  const uniqueSuccesses = new Map<string, CanvasAIActionExecutionRecord>();
  displayRecords.filter((record) => record.ok).forEach((record) => {
    const key = [record.tool, record.targetLabel ?? "", record.detail.trim()].join("::");
    if (!uniqueSuccesses.has(key)) uniqueSuccesses.set(key, record);
  });
  const successes = [...uniqueSuccesses.values()];
  const failures = displayRecords.filter((record) => !record.ok);
  const totalFailures = Math.max(failureCount, failures.length);

  if (successes.length === 0 && totalFailures > 0) {
    const firstFailure = failures[0]?.detail;
    return firstFailure
      ? `I couldn't complete that canvas change. ${ensureSentence(firstFailure)}`
      : "I couldn't complete that canvas change. The failed activity above shows the exact step that stopped.";
  }

  if (successes.length === 1 && totalFailures === 0) {
    return `Yes — ${buildSemanticCanvasActionCompletion(successes[0])}`;
  }

  if (successes.length > 0) {
    const completed = successes
      .map((record) => `- ${buildSemanticCanvasActionCompletion(record)}`)
      .join("\n");
    const failureNote =
      totalFailures > 0
        ? "\n\nSome requested canvas changes could not be completed. The failed activity above shows exactly where the run stopped."
        : "";
    return `Yes — I completed the canvas updates:\n\n${completed}${failureNote}`;
  }

  return "North Star did not receive a verifiable canvas action result for that request.";
}

function workspaceAppFromCanvasAIAsset(app: CanvasAIActionAssetApp): WorkspaceApp {
  return {
    id: app.id,
    name: app.name,
    tenantId: app.tenantId,
    domain: app.domain,
    logoUrl: app.iconUrl,
    description: app.description,
    category: app.category,
    rank: app.rank,
    revenue: app.revenue,
    employees: app.employees,
    totalScreens: app.totalScreens,
    flows: app.flows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      description: flow.description,
      screens: flow.screens.map((screen) => ({
        id: screen.id,
        name: screen.name,
        imageUrl: screen.imageUrl,
        sourceUrl: screen.sourceUrl,
      })),
    })),
  };
}

function getConnectorSidesBetweenBoxes(
  from: CanvasBoxObject,
  to: CanvasBoxObject
): { fromSide: ConnectorSide; toSide: ConnectorSide } {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  return dy >= 0
    ? { fromSide: "bottom", toSide: "top" }
    : { fromSide: "top", toSide: "bottom" };
}

type NorthStarThinkingDepth = "low" | "medium" | "high";

interface CanvasAICompositionCheckpoint {
  version: "northstar.composition-checkpoint.v1";
  runId?: string;
  artifactId: string;
  objective: string;
  phase: "research" | "review" | "blueprint" | "building" | "completed" | "failed";
  executionDepth: "quick" | "balanced" | "deep";
  thinkingDepth: NorthStarThinkingDepth;
  workingVisibility: "visible" | "compact" | "hidden";
  audience: "general" | "executive" | "product" | "design" | "research" | "operations" | "sales" | "marketing";
  artifactType: "comparison-board" | "journey-map" | "screenshot-analysis" | "strategy-board" | "research-map" | "roadmap" | "causal-map" | "storyboard" | "dashboard" | "operating-model" | "market-map" | "decision-tree" | "design-board" | "workflow" | "product-concept" | "freeform";
  requestedApps: string[];
  sessionType?: "onboarding" | "browsing";
  platform?: "mobile" | "web";
  candidateScreens: Array<Record<string, unknown>>;
  ledger: Record<string, unknown>;
  updatedAt: string;
}

interface CanvasAIResponsePayload {
  answer: string;
  references: CanvasAIReference[];
  suggestedActions: CanvasAISuggestedAction[];
  showSuggestedActions?: boolean;
  conversationSummary?: string;
  meta?: {
    model?: string;
    contextMode?: CanvasAIContextMode;
    runMode?: "direct" | "agent";
    completedToolCount?: number;
    intentKind?: string;
    requiresTools?: boolean;
    requiredDataTool?: boolean;
    requiredCanvasAction?: boolean;
    plannedStepCount?: number;
  };
}

interface CanvasAIChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
  assetKey?: string;
}

interface CanvasAIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: CanvasAIChatAttachment[];
  contextMode?: CanvasAIContextMode;
  references?: CanvasAIReference[];
  suggestedActions?: CanvasAISuggestedAction[];
  showSuggestedActions?: boolean;
  activity?: CanvasAIActivityItem[];
  planTitle?: string;
  runId?: string;
  runStatus?: CanvasAIRunStatus;
  streaming?: boolean;
  error?: boolean;
}

interface StoredCanvasConversation {
  version: "northstar.canvas-conversation.v1";
  summary: string;
  messages: CanvasAIChatMessage[];
  thinkingDepth?: NorthStarThinkingDepth;
  compositionCheckpoint?: CanvasAICompositionCheckpoint | null;
}

const PAN_SPEED = 1.85;
const ZOOM_INTENSITY = 0.0054;
const DEFAULT_CANVAS_ZOOM = 0.35;
const SNAP_THRESHOLD = 7;
const SNAP_RELEASE_MULTIPLIER = 1.9;
const OBJECT_CULLING_THRESHOLD = 140;
const OBJECT_CULLING_PADDING_SCREEN = 520;
const CONNECTOR_ATTACH_PADDING = 8;
const CANVAS_CONTEXT_TEXT_PREVIEW_LIMIT = 1800;
const NORTHSTAR_CANVAS_CLIPBOARD_PREFIX = "__NORTHSTAR_CANVAS_OBJECTS_V1__";
const MAX_CHAT_ATTACHMENTS = 4;
const MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface NorthStarCanvasClipboardPayload {
  version: "northstar.canvas-clipboard.v1";
  copiedAt: string;
  objects: CanvasObject[];
}

const COLOR_GRID = [
  "#111111",
  "#737373",
  "#EF4444",
  "#FB923C",
  "#FACC15",
  "#22C55E",
  "#2DD4BF",
  "#38BDF8",
  "#7C3AED",
  "#EC4899",
  "#D4D4D4",
  "#F5F5F5",
  "#FECACA",
  "#FED7AA",
  "#FEF3C7",
  "#DCFCE7",
  "#CCFBF1",
  "#DBEAFE",
  "#EDE9FE",
  "#FCE7F3",
];

function clampZoom(value: number) {
  return Math.min(2.5, Math.max(0.25, value));
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const CANVAS_ASSET_DB_NAME = "northstar-canvas-assets";
const CANVAS_ASSET_STORE_NAME = "image-assets";

function makeCanvasImageStorageKey(storageKey: string, objectId: string) {
  return `${storageKey}:image:${objectId}`;
}

function makeChatAttachmentStorageKey(sessionId: string, attachmentId: string) {
  return `northstar-chat:${sessionId}:attachment:${attachmentId}`;
}

function openCanvasAssetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(CANVAS_ASSET_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANVAS_ASSET_STORE_NAME)) {
        db.createObjectStore(CANVAS_ASSET_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open canvas asset database."));
  });
}

async function saveCanvasImageAsset(key: string, dataUrl: string) {
  const db = await openCanvasAssetDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(CANVAS_ASSET_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CANVAS_ASSET_STORE_NAME);

    store.put({ key, dataUrl, updatedAt: Date.now() });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save canvas image asset."));
  });

  db.close();
}

async function loadCanvasImageAsset(key: string) {
  const db = await openCanvasAssetDb();

  try {
    return await new Promise<string | undefined>((resolve, reject) => {
      const transaction = db.transaction(CANVAS_ASSET_STORE_NAME, "readonly");
      const store = transaction.objectStore(CANVAS_ASSET_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const value = request.result as { dataUrl?: unknown } | undefined;
        resolve(typeof value?.dataUrl === "string" ? value.dataUrl : undefined);
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to load canvas image asset."));
    });
  } finally {
    db.close();
  }
}

async function deleteCanvasImageAsset(key: string) {
  const db = await openCanvasAssetDb();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CANVAS_ASSET_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CANVAS_ASSET_STORE_NAME);
      store.delete(key);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete canvas image asset."));
    });
  } finally {
    db.close();
  }
}

function cloneCanvasObjects(objects: CanvasObject[]) {
  if (typeof structuredClone === "function") return structuredClone(objects);
  return JSON.parse(JSON.stringify(objects)) as CanvasObject[];
}

function canvasObjectsHistorySignature(objects: CanvasObject[]): string {
  return objects.map((object) => {
    if (isConnectorObject(object)) {
      return [
        object.id, object.type, object.x1, object.y1, object.x2, object.y2,
        object.controlX ?? "", object.controlY ?? "", object.style.stroke,
        object.style.strokeWidth, object.startBinding?.objectId ?? "", object.endBinding?.objectId ?? "",
      ].join(":");
    }
    return [
      object.id, object.type, object.x, object.y, object.w, object.h, object.rotation,
      object.text ?? "", object.imageUrl ?? "", object.style.fill, object.style.stroke,
      object.style.fontSize ?? "", object.style.fontWeight ?? "", object.hidden ? 1 : 0,
      object.locked ? 1 : 0, object.semantic?.parentId ?? "", object.semantic?.surfaceRootId ?? "",
      object.cells ? object.cells.flat().join("¦") : "",
    ].join(":");
  }).join("|");
}

function duplicateCanvasObjects(objects: CanvasObject[], offset = 32) {
  return duplicateCanvasObjectsWithOffset(objects, offset, offset);
}

function duplicateCanvasObjectsWithOffset(objects: CanvasObject[], offsetX: number, offsetY: number) {
  const idMap = new Map(objects.map((object) => [object.id, makeId()]));
  const artifactIdMap = new Map<string, string>();
  objects.forEach((object) => {
    const artifactId = object.semantic?.artifactId;
    if (artifactId && !artifactIdMap.has(artifactId)) artifactIdMap.set(artifactId, `${artifactId}-copy-${makeId()}`);
  });

  const remapBinding = (binding: ConnectorBinding | undefined) => {
    if (!binding) return undefined;
    const mappedId = idMap.get(binding.objectId);
    return mappedId ? { ...binding, objectId: mappedId } : undefined;
  };
  const remapSemantic = (semantic: CanvasObjectSemanticMeta | undefined) => semantic ? {
    ...semantic,
    artifactId: semantic.artifactId ? artifactIdMap.get(semantic.artifactId) ?? semantic.artifactId : undefined,
    parentId: semantic.parentId ? idMap.get(semantic.parentId) ?? semantic.parentId : undefined,
    componentId: semantic.componentId ? idMap.get(semantic.componentId) ?? semantic.componentId : undefined,
  } : undefined;

  return objects.map((object) => {
    const nextId = idMap.get(object.id) ?? makeId();

    if (isConnectorObject(object)) {
      return {
        ...object,
        id: nextId,
        semantic: remapSemantic(object.semantic),
        x1: object.x1 + offsetX,
        y1: object.y1 + offsetY,
        x2: object.x2 + offsetX,
        y2: object.y2 + offsetY,
        controlX: object.controlX === undefined ? undefined : object.controlX + offsetX,
        controlY: object.controlY === undefined ? undefined : object.controlY + offsetY,
        startBinding: remapBinding(object.startBinding),
        endBinding: remapBinding(object.endBinding),
      } satisfies CanvasConnectorObject;
    }

    return {
      ...object,
      id: nextId,
      semantic: remapSemantic(object.semantic),
      x: object.x + offsetX,
      y: object.y + offsetY,
    } satisfies CanvasBoxObject;
  });
}

function duplicateCanvasObjectsAtPoint(
  objects: CanvasObject[],
  point: { x: number; y: number } | null,
  fallbackOffset = 44
) {
  if (!point) return duplicateCanvasObjects(objects, fallbackOffset);

  const bounds = getBoundsForObjects(objects);
  if (!bounds) return duplicateCanvasObjects(objects, fallbackOffset);

  return duplicateCanvasObjectsWithOffset(
    objects,
    point.x - (bounds.x + bounds.w / 2),
    point.y - (bounds.y + bounds.h / 2)
  );
}

function getSelectionClipboardObjects(objects: CanvasObject[], selectedIds: string[]) {
  if (selectedIds.length === 0) return [];

  const selectedSet = new Set(selectedIds);
  const selectedBoxIds = new Set(
    objects
      .filter((object) => selectedSet.has(object.id) && isBoxObject(object))
      .map((object) => object.id)
  );

  const clipboardIds = new Set(selectedIds);

  for (const object of objects) {
    if (!isConnectorObject(object) || clipboardIds.has(object.id)) continue;

    const startObjectId = object.startBinding?.objectId;
    const endObjectId = object.endBinding?.objectId;

    // When two selected elements are connected, the connector is part of the
    // semantic selection even if the user did not explicitly click the line.
    // Copy/paste and duplicate should preserve that relationship instead of
    // pasting disconnected shapes that only look connected.
    if (
      startObjectId &&
      endObjectId &&
      selectedBoxIds.has(startObjectId) &&
      selectedBoxIds.has(endObjectId)
    ) {
      clipboardIds.add(object.id);
    }
  }

  return objects.filter((object) => clipboardIds.has(object.id));
}

function reorderCanvasObjectsByLayer(
  objects: CanvasObject[],
  selectedIds: string[],
  direction: LayerDirection
) {
  if (selectedIds.length === 0) return objects;

  const selectedSet = new Set(selectedIds);
  const selected = objects.filter((object) => selectedSet.has(object.id));
  const others = objects.filter((object) => !selectedSet.has(object.id));

  if (direction === "front") return [...others, ...selected];
  if (direction === "back") return [...selected, ...others];

  const next = [...objects];

  if (direction === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selectedSet.has(next[index].id) && !selectedSet.has(next[index + 1].id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }
  }

  if (direction === "backward") {
    for (let index = 1; index < next.length; index += 1) {
      if (selectedSet.has(next[index].id) && !selectedSet.has(next[index - 1].id)) {
        [next[index], next[index - 1]] = [next[index - 1], next[index]];
      }
    }
  }

  return next;
}

function pickString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return undefined;
}

function maybeImageUrl(value: string | undefined) {
  if (!value) return undefined;
  if (value.startsWith("data:image/")) return value;
  if (!/^https?:\/\//i.test(value)) return undefined;
  if (/\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i.test(value)) return value;
  if (/screenshot|image|thumbnail|logo|favicon|icon/i.test(value)) return value;
  return undefined;
}

function faviconUrlForDomain(domain: string | undefined) {
  if (!domain) return undefined;
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return cleaned ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleaned)}&sz=128` : undefined;
}

async function getNorthStarTenantId(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return "";

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("North Star canvas could not resolve the account tenant.", error);
    return "";
  }

  return pickString((profile ?? {}) as UnknownRecord, ["customer_id", "tenant_id", "tenantId"]) ?? "";
}

function normalizeWorkspaceName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeWorkspaceApp(row: UnknownRecord): WorkspaceApp {
  const id = String(row.id ?? row.target_app_id ?? row.app_id ?? makeId());
  const rawDomain = pickString(row, ["domain", "host", "website", "website_url", "app_url", "url"]);
  const domain = rawDomain?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const name =
    pickString(row, ["app_name", "name", "title", "display_name", "company_name", "brand_name"]) ??
    domain ??
    "Untitled app";
  const logoUrl =
    maybeImageUrl(pickString(row, ["icon_url", "logo_url", "logo", "icon", "app_icon_url", "favicon_url", "image_url", "thumbnail_url"])) ??
    faviconUrlForDomain(domain);
  const totalScreens = Number(row.total_screens ?? row.screen_count ?? row.screens ?? 0);

  return {
    id,
    name,
    tenantId: pickString(row, ["tenant_id", "tenantId", "company_id", "companyId"]),
    domain,
    logoUrl,
    description: pickString(row, ["description", "summary", "category"]),
    category: pickString(row, ["category", "app_type", "appType"]),
    rank: pickString(row, ["rank"]),
    revenue: pickString(row, ["revenue"]),
    employees: pickString(row, ["employees"]),
    totalScreens: Number.isFinite(totalScreens) ? totalScreens : 0,
    flows: [],
  };
}

function getWorkspaceAppDedupeKey(app: WorkspaceApp) {
  const tenantPart = app.tenantId ? `${app.tenantId.toLowerCase()}:` : "";
  if (app.domain) return `${tenantPart}domain:${app.domain.toLowerCase()}`;
  return `${tenantPart}name:${normalizeWorkspaceName(app.name)}`;
}

function normalizeFlowName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCaseToken(value: string | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function encodeStorageSegment(value: string) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function reviewsScreenshotBaseUrl(app: WorkspaceApp, platform: string | undefined, sessionType: string | undefined) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !app.tenantId || !app.name || !sessionType) return undefined;

  const platformPrefix = platform === "web" ? "web/" : "";
  return `${supabaseUrl}/storage/v1/object/public/reviews/${encodeStorageSegment(app.tenantId)}/${encodeStorageSegment(app.name)}/${platformPrefix}${encodeStorageSegment(sessionType)}/screenshots`;
}

function getNestedRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function getArrayValue(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is UnknownRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
}

function getFlowSourceScreens(sessionRow: UnknownRecord) {
  const steps = getArrayValue(sessionRow.steps_data);
  if (steps.length > 0) return steps;

  const flowsData = getNestedRecord(sessionRow.flows_data);
  const catalog = getArrayValue(flowsData?.screen_catalog);
  if (catalog.length > 0) return catalog;

  const screens = getArrayValue(flowsData?.screens);
  if (screens.length > 0) return screens;

  return [];
}

function getWorkspaceScreenImageUrl(rawScreen: UnknownRecord, app: WorkspaceApp, platform: string | undefined, sessionType: string | undefined) {
  const direct = maybeImageUrl(
    pickString(rawScreen, [
      "image_url",
      "imageUrl",
      "imagePath",
      "screenshot_url",
      "screenshotUrl",
      "screenshot_file",
      "screenshot",
      "path",
      "public_url",
      "publicUrl",
      "storage_url",
      "storageUrl",
    ])
  );

  if (direct?.startsWith("http")) return direct;

  const screenshotSource = pickString(rawScreen, ["imagePath", "screenshot_file", "screenshot", "path"]);
  const base = reviewsScreenshotBaseUrl(app, platform, sessionType);
  if (!screenshotSource || !base) return direct;

  const fileName = screenshotSource.split("/").pop();
  return fileName ? `${base}/${encodeURIComponent(fileName)}` : direct;
}

function getWorkspaceScreenName(rawScreen: UnknownRecord, index: number) {
  return (
    pickString(rawScreen, ["display_label", "screen_type", "screen_name", "step_name", "name", "title", "label", "page_title"]) ??
    `Screen ${index + 1}`
  );
}

function getWorkspaceScreenId(rawScreen: UnknownRecord, flowId: string, index: number) {
  return String(rawScreen.id ?? rawScreen.step ?? rawScreen.timeline_step ?? rawScreen.screen_index ?? `${flowId}:screen:${index}`);
}

function getWorkspaceFlowDescription(sessionRow: UnknownRecord) {
  const intelligence = getNestedRecord(sessionRow.session_intel);
  return (
    pickString(sessionRow, ["summary", "description"]) ??
    pickString(intelligence ?? {}, ["summary", "overview", "caption"])
  );
}

function getFileKey(value?: string | null) {
  if (!value || typeof value !== "string") return "";
  return value.split("/").pop()?.toLowerCase() || value.toLowerCase();
}

function getNumberArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function getStringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function buildWorkspaceCatalogIndex(catalog: UnknownRecord[]) {
  const byStep = new Map<number, UnknownRecord>();
  const byFile = new Map<string, UnknownRecord>();

  catalog.forEach((screen, index) => {
    const step = Number(screen.timeline_step ?? screen.step ?? screen.screen_index ?? index + 1);
    if (Number.isFinite(step)) byStep.set(step, screen);

    const file = getFileKey(pickString(screen, ["screenshot_file", "imagePath", "screenshot", "path"]));
    if (file) byFile.set(file, screen);
  });

  return { byStep, byFile };
}

function workspaceScreenFromRaw(
  rawScreen: UnknownRecord,
  app: WorkspaceApp,
  platform: string | undefined,
  sessionType: string | undefined,
  flowId: string,
  index: number
): WorkspaceAppScreen {
  const imageUrl = getWorkspaceScreenImageUrl(rawScreen, app, platform, sessionType);

  return {
    id: getWorkspaceScreenId(rawScreen, flowId, index),
    name: getWorkspaceScreenName(rawScreen, index),
    imageUrl,
    sourceUrl: pickString(rawScreen, ["page_url", "source_url", "url", "href"]),
  };
}

function resolveFlowNodeScreens(
  node: UnknownRecord,
  catalogIndex: ReturnType<typeof buildWorkspaceCatalogIndex>,
  app: WorkspaceApp,
  platform: string | undefined,
  sessionType: string | undefined,
  flowId: string
) {
  const resolved: WorkspaceAppScreen[] = [];
  const seen = new Set<string>();

  const addScreen = (screen: UnknownRecord | undefined, fallbackIndex: number) => {
    if (!screen) return;
    const nextScreen = workspaceScreenFromRaw(screen, app, platform, sessionType, flowId, fallbackIndex);
    const key = nextScreen.imageUrl || nextScreen.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    resolved.push(nextScreen);
  };

  getNumberArrayValue(node.screens).forEach((step, index) => addScreen(catalogIndex.byStep.get(step), index));

  getStringArrayValue(node.spine).forEach((file, index) => {
    const byFile = catalogIndex.byFile.get(getFileKey(file));
    if (byFile) addScreen(byFile, resolved.length + index);
  });

  getArrayValue(node.branches).forEach((branch, branchIndex) => {
    getStringArrayValue(branch.screenshots).forEach((file, index) => {
      const byFile = catalogIndex.byFile.get(getFileKey(file));
      if (byFile) addScreen(byFile, resolved.length + branchIndex + index);
    });
  });

  return resolved;
}

function collectTaxonomyWorkspaceFlows(
  nodes: UnknownRecord[],
  catalogIndex: ReturnType<typeof buildWorkspaceCatalogIndex>,
  app: WorkspaceApp,
  platform: string | undefined,
  sessionType: string | undefined,
  sessionId: string
) {
  const flows: WorkspaceAppFlow[] = [];

  const walk = (node: UnknownRecord, depth: number) => {
    const label = pickString(node, ["label", "name", "title", "id"]) ?? "Captured flow";
    const rawId = pickString(node, ["id"]) ?? `${label}:${depth}:${flows.length}`;
    const flowId = `${app.id}:${sessionId}:${rawId}`;
    const screens = resolveFlowNodeScreens(node, catalogIndex, app, platform, sessionType, flowId);
    const children = getArrayValue(node.children);

    if (screens.length > 0) {
      flows.push({
        id: flowId,
        name: label,
        description: pickString(node, ["description", "summary"]),
        screens,
      });
    }

    children.forEach((child) => walk(child, depth + 1));
  };

  nodes.forEach((node) => walk(node, 0));
  return flows;
}

function normalizeWorkspaceApps(appRows: UnknownRecord[], sessionRows: UnknownRecord[] = []) {
  const appsByKey = new Map<string, WorkspaceApp>();
  const appIdToKey = new Map<string, string>();
  const appNameToKey = new Map<string, string>();
  const flowsByAppKey = new Map<string, Map<string, WorkspaceAppFlow>>();
  const normalizedSessionRows: UnknownRecord[] = [...sessionRows];

  for (const row of appRows) {
    const app = normalizeWorkspaceApp(row);
    const key = getWorkspaceAppDedupeKey(app);
    const existing = appsByKey.get(key);

    if (existing) {
      appsByKey.set(key, {
        ...existing,
        id: existing.id || app.id,
        logoUrl: existing.logoUrl ?? app.logoUrl,
        domain: existing.domain ?? app.domain,
        description: existing.description ?? app.description,
        category: existing.category ?? app.category,
        rank: existing.rank ?? app.rank,
        revenue: existing.revenue ?? app.revenue,
        employees: existing.employees ?? app.employees,
        totalScreens: Math.max(existing.totalScreens ?? 0, app.totalScreens ?? 0),
      });
    } else {
      appsByKey.set(key, app);
      flowsByAppKey.set(key, new Map());
    }

    appIdToKey.set(app.id, key);
    appNameToKey.set(normalizeWorkspaceName(app.name), key);

    getArrayValue(row.app_sessions).forEach((sessionRow) => {
      normalizedSessionRows.push({
        ...sessionRow,
        target_app_id: app.id,
        app_name: app.name,
        tenant_id: app.tenantId,
      });
    });
  }

  for (const row of normalizedSessionRows) {
    const appId = String(row.target_app_id ?? row.app_id ?? row.appId ?? "");
    const appName = pickString(row, ["app_name", "name", "target_app_name", "appName"]);
    const appKey = (appId && appIdToKey.get(appId)) || (appName ? appNameToKey.get(normalizeWorkspaceName(appName)) : undefined);
    if (!appKey) continue;

    const app = appsByKey.get(appKey);
    const appFlows = flowsByAppKey.get(appKey);
    if (!app || !appFlows) continue;

    const platform = pickString(row, ["platform"]);
    const sessionType = pickString(row, ["session_type", "flow_type", "type"]);
    const sessionId = String(row.id ?? `${platform ?? "session"}:${sessionType ?? "captured"}`);
    const flowsData = getNestedRecord(row.flows_data);
    const taxonomy = getArrayValue(flowsData?.taxonomy);
    const catalog = getArrayValue(flowsData?.screen_catalog);
    const steps = getArrayValue(row.steps_data);

    if (taxonomy.length > 0) {
      const catalogIndex = buildWorkspaceCatalogIndex(catalog.length > 0 ? catalog : catalogFromSessionSteps(steps));
      collectTaxonomyWorkspaceFlows(taxonomy, catalogIndex, app, platform, sessionType, sessionId).forEach((flow) => {
        const existing = appFlows.get(flow.id);
        if (existing) {
          flow.screens.forEach((screen) => {
            if (!existing.screens.some((existingScreen) => existingScreen.id === screen.id || (screen.imageUrl && existingScreen.imageUrl === screen.imageUrl))) {
              existing.screens.push(screen);
            }
          });
        } else {
          appFlows.set(flow.id, flow);
        }
      });
    }

    const sessionLabel = [titleCaseToken(platform), titleCaseToken(sessionType || "captured flow")].filter(Boolean).join(" ") || "Captured flow";
    const sessionFlowId = `${app.id}:${sessionId}:${normalizeFlowName(sessionLabel)}`;
    const rawScreens = getFlowSourceScreens(row);

    if (rawScreens.length > 0 && !appFlows.has(sessionFlowId)) {
      appFlows.set(sessionFlowId, {
        id: sessionFlowId,
        name: sessionLabel,
        description: getWorkspaceFlowDescription(row),
        screens: [],
      });
    }

    const sessionFlow = appFlows.get(sessionFlowId);
    if (sessionFlow) {
      rawScreens.forEach((rawScreen, index) => {
        const imageUrl = getWorkspaceScreenImageUrl(rawScreen, app, platform, sessionType);
        const screenId = getWorkspaceScreenId(rawScreen, sessionFlowId, index);
        if (sessionFlow.screens.some((screen) => screen.id === screenId || (imageUrl && screen.imageUrl === imageUrl))) return;

        sessionFlow.screens.push({
          id: screenId,
          name: getWorkspaceScreenName(rawScreen, index),
          imageUrl,
          sourceUrl: pickString(rawScreen, ["page_url", "source_url", "url", "href"]),
          createdAt: pickString(row, ["created_at", "captured_at", "updated_at"]),
        });
      });
    }

    const totalScreens = Number(row.total_screens ?? sessionFlow?.screens.length ?? 0);
    app.totalScreens = Math.max(app.totalScreens ?? 0, Number.isFinite(totalScreens) ? totalScreens : sessionFlow?.screens.length ?? 0);
  }

  return Array.from(appsByKey.entries())
    .map(([key, app]) => ({
      ...app,
      flows: Array.from(flowsByAppKey.get(key)?.values() ?? [])
        .filter((flow) => flow.screens.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function catalogFromSessionSteps(steps: UnknownRecord[]) {
  return steps.map((step, index) => ({
    ...step,
    timeline_step: step.step ?? step.timeline_step ?? step.screen_index ?? index + 1,
    screenshot_file: step.imagePath ?? step.screenshot_file ?? step.screenshot ?? step.path,
    display_label: step.screen_type ?? step.display_label ?? step.name ?? `Screen ${index + 1}`,
  }));
}

function isTextEditableBox(type: CanvasBoxType) {
  return !["image", "icon", "table", "flow-header", "visual-board", "code-artifact", "divider", "pin", "highlight-region"].includes(type);
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;

  return (
    element?.tagName === "INPUT" ||
    element?.tagName === "TEXTAREA" ||
    Boolean(element?.isContentEditable)
  );
}

function getAutoTextBounds(text: string | undefined, style: CanvasObjectStyle) {
  const fontSize = style.fontSize || 16;
  const fontWeight = style.fontWeight || 500;
  const lineHeight = fontSize * 0.98;
  const lines = (text && text.length > 0 ? text : " ").split("\n");

  let measuredWidth = 0;

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (context) {
      context.font = `${fontWeight} ${fontSize}px Inter, Arial, sans-serif`;
      measuredWidth = Math.max(
        ...lines.map((line) => context.measureText(line.length ? line : " ").width)
      );
    }
  }

  if (!measuredWidth) {
    measuredWidth = Math.max(
      ...lines.map((line) => Math.max(1, line.length) * fontSize * 0.56)
    );
  }

  return {
    w: Math.max(32, Math.ceil(measuredWidth + 10)),
    h: Math.max(24, Math.ceil(lines.length * lineHeight + 10)),
  };
}

function getPastedTextBounds(text: string, style: CanvasObjectStyle) {
  const fontSize = style.fontSize || 16;
  const fontWeight = style.fontWeight || 500;
  const lineHeight = fontSize * 1.16;
  const lines = (text.length > 0 ? text : " ").split("\n");
  const isLongText = text.length > 180 || lines.length > 1;
  const maxReadableWidth = isLongText ? 760 : 560;
  const minReadableWidth = isLongText ? 280 : 64;

  let maxMeasuredLineWidth = 0;
  const measureLine = (line: string) => {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (context) {
        context.font = `${fontWeight} ${fontSize}px Inter, Arial, sans-serif`;
        return context.measureText(line.length ? line : " ").width;
      }
    }

    return Math.max(1, line.length) * fontSize * 0.56;
  };

  for (const line of lines) {
    maxMeasuredLineWidth = Math.max(maxMeasuredLineWidth, measureLine(line));
  }

  const width = clamp(maxMeasuredLineWidth + 14, minReadableWidth, maxReadableWidth);
  const availableTextWidth = Math.max(24, width - 10);
  const estimatedVisualLineCount = lines.reduce((count, line) => {
    const measured = measureLine(line);
    return count + Math.max(1, Math.ceil(measured / availableTextWidth));
  }, 0);

  return {
    w: Math.ceil(width),
    h: Math.max(28, Math.ceil(estimatedVisualLineCount * lineHeight + 12)),
  };
}

function getWrappedTextHeightForWidth(text: string, style: CanvasObjectStyle, width: number) {
  const fontSize = style.fontSize || 16;
  const fontWeight = style.fontWeight || 500;
  const lineHeight = fontSize * 1.16;
  const lines = (text.length > 0 ? text : " ").split("\n");
  const safeWidth = Math.max(32, width);
  const availableTextWidth = Math.max(24, safeWidth - 10);

  const measureLine = (line: string) => {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (context) {
        context.font = `${fontWeight} ${fontSize}px Inter, Arial, sans-serif`;
        return context.measureText(line.length ? line : " ").width;
      }
    }

    return Math.max(1, line.length) * fontSize * 0.56;
  };

  const estimatedVisualLineCount = lines.reduce((count, line) => {
    const measured = measureLine(line);
    return count + Math.max(1, Math.ceil(measured / availableTextWidth));
  }, 0);

  return Math.max(28, Math.ceil(estimatedVisualLineCount * lineHeight + 12));
}

function getTextBoundsAfterEdit(
  object: CanvasBoxObject,
  text: string,
  style: CanvasObjectStyle = object.style
) {
  const shouldKeepReadableBoxWidth =
    object.type === "text" &&
    (isPastedTextObject(object) || text.includes("\n") || text.length > 180);

  if (shouldKeepReadableBoxWidth) {
    const nextHeight = getWrappedTextHeightForWidth(text, style, object.w);

    return {
      w: Math.max(32, object.w),
      h: Math.max(object.h, nextHeight),
    };
  }

  return getAutoTextBounds(text, style);
}

function isPastedTextObject(object: CanvasBoxObject) {
  return object.type === "text" && object.source?.kind === "pasted-text";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlFromPlainText(value: string | undefined) {
  return escapeHtml(value ?? "").replace(/\n/g, "<br>");
}

function plainTextFromHtml(html: string) {
  if (typeof document === "undefined") {
    return html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "");
  }

  const element = document.createElement("div");
  element.innerHTML = html;
  return element.innerText.replace(/\u00a0/g, " ");
}

function sanitizeRichTextHtml(input: string) {
  if (typeof document === "undefined") return htmlFromPlainText(plainTextFromHtml(input));

  const template = document.createElement("template");
  template.innerHTML = input;
  template.content.querySelectorAll("script,style,iframe,object,embed,img,svg,canvas,video,audio").forEach((element) => element.remove());

  const allowed = new Set(["BR", "DIV", "P", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "FONT"]);

  const cleanNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    Array.from(element.childNodes).forEach(cleanNode);

    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    const color = element.getAttribute("color") ?? element.style.color;
    const fontWeight = element.style.fontWeight;
    const textDecoration = element.style.textDecoration;
    const fontStyle = element.style.fontStyle;

    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));

    const safeStyle: string[] = [];
    if (color && /^[#a-zA-Z0-9(),. %]+$/.test(color)) safeStyle.push(`color:${color}`);
    if (fontWeight && /^[a-zA-Z0-9]+$/.test(fontWeight)) safeStyle.push(`font-weight:${fontWeight}`);
    if (textDecoration && /^[a-zA-Z -]+$/.test(textDecoration)) safeStyle.push(`text-decoration:${textDecoration}`);
    if (fontStyle && /^[a-zA-Z]+$/.test(fontStyle)) safeStyle.push(`font-style:${fontStyle}`);
    if (safeStyle.length > 0) element.setAttribute("style", safeStyle.join(";"));
  };

  Array.from(template.content.childNodes).forEach(cleanNode);
  return template.innerHTML;
}

function getRichTextHtml(object: CanvasBoxObject) {
  return sanitizeRichTextHtml(object.textHtml ?? htmlFromPlainText(object.text));
}

function isPrimitiveShape(type: CanvasBoxType) {
  return ["rect", "ellipse", "circle", "diamond", "triangle", "pill", "callout", "icon-chip", "badge", "freeform"].includes(type);
}

function isTextSelectionInside(editor: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return Boolean(anchor && focus && editor.contains(anchor) && editor.contains(focus));
}

function placeCaretAtEnd(editor: HTMLElement) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeCaretAtClientPoint(editor: HTMLElement, clientX: number, clientY: number) {
  const doc = editor.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let range: Range | null = null;
  const position = doc.caretPositionFromPoint?.(clientX, clientY);

  if (position) {
    range = doc.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
  } else {
    range = doc.caretRangeFromPoint?.(clientX, clientY) ?? null;
  }

  if (!range || !editor.contains(range.startContainer)) {
    placeCaretAtEnd(editor);
    return;
  }

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function normalizeTextColor(value: string | undefined) {
  if (!value) return null;
  const clean = value.trim();
  if (!clean || clean === "inherit" || clean === "currentColor") return null;
  return clean;
}

function getTextColorSummary(object: CanvasBoxObject) {
  const colors: string[] = [];
  const add = (value: string | undefined | null) => {
    const color = normalizeTextColor(value ?? undefined);
    if (!color) return;
    if (!colors.some((existing) => existing.toLowerCase() === color.toLowerCase())) {
      colors.push(color);
    }
  };

  add(object.style.textColor);

  const html = object.textHtml ?? "";
  const styleColorPattern = /color\s*:\s*([^;"']+)/gi;
  const fontColorPattern = /<font[^>]+color=["']?([^"'\s>]+)/gi;

  let match = styleColorPattern.exec(html);
  while (match) {
    add(match[1]);
    match = styleColorPattern.exec(html);
  }

  match = fontColorPattern.exec(html);
  while (match) {
    add(match[1]);
    match = fontColorPattern.exec(html);
  }

  return colors.slice(0, 4);
}

function getTextColorSwatchBackground(object: CanvasBoxObject) {
  const colors = getTextColorSummary(object);
  if (colors.length <= 1) return colors[0] ?? object.style.textColor;
  if (colors.length === 2) return `linear-gradient(90deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)`;

  const step = 360 / colors.length;
  const stops = colors
    .map((color, index) => `${color} ${Math.round(index * step)}deg ${Math.round((index + 1) * step)}deg`)
    .join(", ");
  return `conic-gradient(${stops})`;
}

function readColorRgb(color: string | undefined | null) {
  if (!color) return null;
  const value = color.trim().toLowerCase();

  if (value === "black") return { r: 0, g: 0, b: 0 };
  if (value === "white") return { r: 255, g: 255, b: 255 };

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1]
      .split(",")
      .slice(0, 3)
      .map((part) => Number.parseFloat(part.trim()));

    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
  }

  return null;
}

function isCanvasDarkTextColor(color: string | undefined | null) {
  const rgb = readColorRgb(color);
  if (!rgb) return false;
  return Math.max(rgb.r, rgb.g, rgb.b) <= 82;
}

function isCanvasMutedTextColor(color: string | undefined | null) {
  const rgb = readColorRgb(color);
  if (!rgb) return false;
  const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
  return Math.max(rgb.r, rgb.g, rgb.b) <= 150 && spread <= 28;
}

function resolveThemeTextColor(color: string, isDarkMode: boolean) {
  if (!isDarkMode) return color;
  if (isCanvasDarkTextColor(color)) return "#F8FAFC";
  if (isCanvasMutedTextColor(color)) return "#C4C8D4";
  return color;
}

function resolveThemeRichTextHtml(object: CanvasBoxObject, isDarkMode: boolean) {
  const html = getRichTextHtml(object);
  if (!isDarkMode) return html;

  return html.replace(/(color\s*:\s*)([^;"']+)/gi, (_match, prefix: string, color: string) => {
    return `${prefix}${resolveThemeTextColor(color.trim(), true)}`;
  });
}

function isConnectorObject(
  object: CanvasObject
): object is CanvasConnectorObject {
  return object.type === "connector";
}

function isBoxObject(object: CanvasObject): object is CanvasBoxObject {
  return object.type !== "connector";
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);

  return { x, y, w, h };
}

function rectsIntersect(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

const DEFAULT_FREEFORM_POINTS: FreeformPoint[] = [
  { x: 0.16, y: 0.16 },
  { x: 0.44, y: 0.06 },
  { x: 0.75, y: 0.16 },
  { x: 0.94, y: 0.42 },
  { x: 0.84, y: 0.76 },
  { x: 0.57, y: 0.94 },
  { x: 0.26, y: 0.86 },
  { x: 0.06, y: 0.56 },
];

const NORTHSTAR_ICON_OPTIONS: Array<{ name: NorthstarIconName; label: string }> = [
  { name: "sparkles", label: "Sparkles" },
  { name: "check", label: "Check" },
  { name: "eye", label: "Eye" },
  { name: "home", label: "Home" },
  { name: "image", label: "Image" },
  { name: "link", label: "Link" },
  { name: "info", label: "Info" },
  { name: "layers", label: "Layers" },
  { name: "search", label: "Search" },
  { name: "pen", label: "Pen" },
  { name: "message", label: "Message" },
  { name: "table", label: "Table" },
  { name: "warning", label: "Warning" },
  { name: "wrench", label: "Wrench" },
  { name: "arrow", label: "Arrow" },
  { name: "plus", label: "Plus" },
  { name: "book", label: "Book" },
  { name: "chart", label: "Chart" },
  { name: "branch", label: "Branch" },
  { name: "list", label: "List" },
];

function cloneFreeformPoints(points?: FreeformPoint[]): FreeformPoint[] {
  return (points?.length ? points : DEFAULT_FREEFORM_POINTS).map((point) => ({ ...point }));
}

function buildSmoothClosedFreeformPath(points?: FreeformPoint[]): string {
  const normalized = cloneFreeformPoints(points);
  if (normalized.length < 3) return "";
  const scaled = normalized.map((point) => ({
    x: Math.max(-0.2, Math.min(1.2, point.x)) * 100,
    y: Math.max(-0.2, Math.min(1.2, point.y)) * 100,
  }));
  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const start = midpoint(scaled[scaled.length - 1], scaled[0]);
  let path = `M${start.x.toFixed(2)} ${start.y.toFixed(2)}`;
  for (let index = 0; index < scaled.length; index += 1) {
    const current = scaled[index];
    const next = scaled[(index + 1) % scaled.length];
    const nextMidpoint = midpoint(current, next);
    path += ` Q${current.x.toFixed(2)} ${current.y.toFixed(2)} ${nextMidpoint.x.toFixed(2)} ${nextMidpoint.y.toFixed(2)}`;
  }
  return `${path} Z`;
}

function NorthstarGlyph({ name, className = "h-5 w-5" }: { name?: NorthstarIconName; className?: string }) {
  const resolved = name ?? "sparkles";
  if (resolved === "check") return <Check className={className} />;
  if (resolved === "eye") return <Eye className={className} />;
  if (resolved === "home") return <Home className={className} />;
  if (resolved === "image") return <ImageIcon className={className} />;
  if (resolved === "link") return <Link2 className={className} />;
  if (resolved === "info") return <Info className={className} />;
  if (resolved === "layers") return <Layers className={className} />;
  if (resolved === "search") return <Search className={className} />;
  if (resolved === "pen") return <PenLine className={className} />;
  if (resolved === "message") return <MessageSquare className={className} />;
  if (resolved === "table") return <Table2 className={className} />;
  if (resolved === "warning") return <TriangleAlert className={className} />;
  if (resolved === "wrench") return <Wrench className={className} />;
  if (resolved === "arrow") return <ArrowRight className={className} />;
  if (resolved === "plus") return <Plus className={className} />;
  if (resolved === "book") return <BookOpen className={className} />;
  if (resolved === "chart") return <BarChart3 className={className} />;
  if (resolved === "branch") return <GitBranch className={className} />;
  if (resolved === "list") return <ListChecks className={className} />;
  return <Sparkles className={className} />;
}

function getBoxDefaults(type: BoxTool): Pick<CanvasBoxObject, "w" | "h" | "text"> {
  const defaults: Record<BoxTool, Pick<CanvasBoxObject, "w" | "h" | "text">> = {
    frame: { w: 640, h: 420, text: "Frame" },
    note: { w: 260, h: 180, text: "Add a note..." },
    card: { w: 340, h: 220, text: "Insight card" },
    text: { w: 300, h: 82, text: "Example" },
    image: { w: 340, h: 230, text: "Image placeholder" },
    rect: { w: 260, h: 160, text: "" },
    ellipse: { w: 220, h: 160, text: "" },
    circle: { w: 180, h: 180, text: "" },
    diamond: { w: 180, h: 180, text: "" },
    triangle: { w: 210, h: 180, text: "" },
    pill: { w: 260, h: 96, text: "" },
    callout: { w: 280, h: 160, text: "Add text" },
    table: { w: 480, h: 180, text: "" },
    divider: { w: 360, h: 10, text: "" },
    "icon-chip": { w: 180, h: 72, text: "Label" },
    icon: { w: 76, h: 76, text: "" },
    badge: { w: 132, h: 48, text: "New" },
    pin: { w: 84, h: 116, text: "" },
    freeform: { w: 240, h: 200, text: "" },
    "highlight-region": { w: 360, h: 240, text: "" },
  };

  return defaults[type];
}

function serializeCanvasClipboardObjects(objects: CanvasObject[]) {
  const payload: NorthStarCanvasClipboardPayload = {
    version: "northstar.canvas-clipboard.v1",
    copiedAt: new Date().toISOString(),
    objects: cloneCanvasObjects(objects),
  };

  return `${NORTHSTAR_CANVAS_CLIPBOARD_PREFIX}\n${JSON.stringify(payload)}`;
}

function parseCanvasClipboardObjects(text: string): CanvasObject[] | null {
  if (!text.startsWith(NORTHSTAR_CANVAS_CLIPBOARD_PREFIX)) return null;

  try {
    const raw = text.slice(NORTHSTAR_CANVAS_CLIPBOARD_PREFIX.length).trim();
    const parsed = JSON.parse(raw) as Partial<NorthStarCanvasClipboardPayload>;

    if (parsed.version !== "northstar.canvas-clipboard.v1" || !Array.isArray(parsed.objects)) {
      return null;
    }

    return cloneCanvasObjects(parsed.objects as CanvasObject[]);
  } catch (error) {
    console.warn("Unable to parse North Star canvas clipboard payload.", error);
    return null;
  }
}


function getDefaultStyle(type: BoxTool): CanvasObjectStyle {
  if (type === "divider") {
    return {
      fill: "#111827",
      stroke: "transparent",
      strokeWidth: 0,
      textColor: "#111827",
      fontSize: 12,
      fontWeight: 600,
      textAlign: "left",
      radius: 999,
      shadow: "none",
    };
  }

  if (type === "icon") {
    return {
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      textColor: "#6B5CFF",
      fontSize: 14,
      fontWeight: 750,
      textAlign: "center",
      radius: 18,
      shadow: "none",
    };
  }

  if (type === "icon-chip") {
    return {
      fill: "#FFFFFF",
      stroke: "rgba(107,92,255,0.24)",
      strokeWidth: 1.25,
      textColor: "#18181B",
      fontSize: 15,
      fontWeight: 750,
      textAlign: "center",
      radius: 16,
      shadow: "0 10px 28px rgba(35,30,78,0.08)",
    };
  }

  if (type === "badge") {
    return {
      fill: "#EAE6FF",
      stroke: "rgba(107,92,255,0.24)",
      strokeWidth: 1,
      textColor: "#5E50F5",
      fontSize: 13,
      fontWeight: 850,
      textAlign: "center",
      radius: 999,
      shadow: "0 7px 20px rgba(107,92,255,0.10)",
    };
  }

  if (type === "pin") {
    return {
      fill: "#6B5CFF",
      stroke: "#FFFFFF",
      strokeWidth: 2,
      textColor: "#FFFFFF",
      fontSize: 12,
      fontWeight: 800,
      textAlign: "center",
      shadow: "0 12px 28px rgba(107,92,255,0.24)",
    };
  }

  if (type === "freeform") {
    return {
      fill: "rgba(107,92,255,0.13)",
      stroke: "rgba(107,92,255,0.58)",
      strokeWidth: 1.5,
      textColor: "#312E81",
      fontSize: 14,
      fontWeight: 650,
      textAlign: "center",
      shadow: "0 18px 40px rgba(107,92,255,0.08)",
    };
  }

  if (type === "highlight-region") {
    return {
      fill: "rgba(107,92,255,0.055)",
      stroke: "rgba(107,92,255,0.42)",
      strokeWidth: 1.5,
      textColor: "#6B5CFF",
      fontSize: 12,
      fontWeight: 800,
      textAlign: "left",
      radius: 18,
      shadow: "none",
    };
  }

  if (type === "note") {
    return {
      fill: "#FFFBEA",
      stroke: "rgba(0,0,0,0.08)",
      strokeWidth: 1,
      textColor: "#18181B",
      fontSize: 14,
      fontWeight: 500,
      textAlign: "left",
    };
  }

  if (type === "frame") {
    return {
      fill: "rgba(255,255,255,0.10)",
      stroke: "rgba(107,92,255,0.24)",
      strokeWidth: 1.25,
      textColor: "#71717A",
      fontSize: 13,
      fontWeight: 600,
      textAlign: "left",
    };
  }

  if (type === "text") {
    return {
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      textColor: "#111111",
      fontSize: 74,
      fontWeight: 700,
      textAlign: "left",
    };
  }

  if (type === "image") {
    return {
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      textColor: "#18181B",
      fontSize: 13,
      fontWeight: 500,
      textAlign: "left",
    };
  }

  if (type === "table") {
    return {
      fill: "rgba(255,255,255,0.64)",
      stroke: "rgba(0,0,0,0.12)",
      strokeWidth: 1,
      textColor: "#18181B",
      fontSize: 13,
      fontWeight: 500,
      textAlign: "left",
    };
  }

  return {
    fill: "rgba(255,255,255,0.62)",
    stroke: "rgba(107,92,255,0.32)",
    strokeWidth: 1.5,
    textColor: "#18181B",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "left",
  };
}

function createBoxObject(
  type: BoxTool,
  rectOrCenter: Rect | { x: number; y: number }
): CanvasBoxObject {
  const defaults = getBoxDefaults(type);
  const isRect = "w" in rectOrCenter && "h" in rectOrCenter;

  const x = isRect ? rectOrCenter.x : rectOrCenter.x - defaults.w / 2;
  const y = isRect ? rectOrCenter.y : rectOrCenter.y - defaults.h / 2;
  const w = isRect ? Math.max(24, rectOrCenter.w) : defaults.w;
  const h = isRect ? Math.max(24, rectOrCenter.h) : defaults.h;

  const object: CanvasBoxObject = {
    id: makeId(),
    type,
    x,
    y,
    w,
    h,
    rotation: 0,
    text: defaults.text,
    style: getDefaultStyle(type),
  };

  if (type === "table") {
    object.rows = 2;
    object.cols = 3;
    object.cells = [
      ["Label", "Value", "Source"],
      ["", "", ""],
    ];
  }

  if (type === "divider") object.style.radius = 999;
  if (type === "badge") object.style.radius = 999;
  if (type === "icon") {
    object.iconName = "sparkles";
    object.source = { kind: "manual" };
    object.semantic = {
      role: "visual-component",
      label: "Icon",
      componentId: object.id,
      componentType: "icon-glyph",
      layoutRole: "item",
      editable: true,
      detachable: true,
    };
  }
  if (type === "icon-chip") object.style.radius = 16;
  if (type === "freeform") object.freeformPoints = cloneFreeformPoints();
  if (type === "highlight-region") object.style.radius = 18;

  return object;
}

function buildIconChipPrimitiveObjects(rectOrCenter: Rect | { x: number; y: number }): CanvasBoxObject[] {
  const defaults = getBoxDefaults("icon-chip");
  const isRect = "w" in rectOrCenter && "h" in rectOrCenter;
  const rootRect: Rect = isRect
    ? { x: rectOrCenter.x, y: rectOrCenter.y, w: Math.max(150, rectOrCenter.w), h: Math.max(64, rectOrCenter.h) }
    : { x: rectOrCenter.x - defaults.w / 2, y: rectOrCenter.y - defaults.h / 2, w: defaults.w, h: defaults.h };

  const root = createBoxObject("card", rootRect);
  root.text = "";
  root.textHtml = "";
  root.source = { kind: "manual" };
  root.style = { ...getDefaultStyle("icon-chip"), radius: Math.min(22, Math.max(14, rootRect.h * 0.24)) };
  root.semantic = {
    role: "visual-component",
    label: "Icon chip card",
    componentId: root.id,
    componentType: "icon-chip",
    layoutRole: "container",
    editable: true,
    detachable: true,
    layout: {
      kind: "freeform",
      gap: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      align: "center",
      overflow: "visible",
      resizeBehavior: "scale",
    },
  };

  const iconSize = Math.max(36, Math.min(rootRect.h - 18, 54));
  const icon = createBoxObject("card", {
    x: rootRect.x + 14,
    y: rootRect.y + (rootRect.h - iconSize) / 2,
    w: iconSize,
    h: iconSize,
  });
  icon.text = "";
  icon.textHtml = "";
  icon.iconName = "sparkles";
  icon.source = { kind: "manual" };
  icon.style = {
    ...getDefaultStyle("icon-chip"),
    fill: "#F1EEFF",
    stroke: "rgba(107,92,255,0.10)",
    strokeWidth: 1,
    textColor: "#6B5CFF",
    radius: Math.max(12, iconSize * 0.28),
    shadow: "none",
  };
  icon.semantic = {
    role: "visual-component",
    label: "Icon chip icon",
    parentId: root.id,
    componentId: root.id,
    componentType: "icon-glyph",
    layoutRole: "item",
    editable: true,
    detachable: true,
  };

  const label = createBoxObject("text", {
    x: icon.x + icon.w + 14,
    y: rootRect.y,
    w: Math.max(56, rootRect.x + rootRect.w - (icon.x + icon.w + 26)),
    h: rootRect.h,
  });
  label.text = "Label";
  label.textHtml = htmlFromPlainText("Label");
  label.source = { kind: "manual" };
  label.style = {
    ...getDefaultStyle("text"),
    textColor: "#18181B",
    fontSize: Math.max(16, Math.min(24, rootRect.h * 0.3)),
    fontWeight: 780,
    textAlign: "left",
  };
  label.semantic = {
    role: "visual-body",
    label: "Icon chip label",
    parentId: root.id,
    componentId: root.id,
    componentType: "icon-chip-label",
    layoutRole: "item",
    editable: true,
    detachable: true,
  };
  return [root, icon, label];
}

function buildPrimitiveObjects(type: BoxTool, rectOrCenter: Rect | { x: number; y: number }): CanvasBoxObject[] {
  if (type === "icon-chip") return buildIconChipPrimitiveObjects(rectOrCenter);
  return [createBoxObject(type, rectOrCenter)];
}

function getObjectBounds(object: CanvasObject): Rect {
  if (isConnectorObject(object)) return getConnectorBounds(object);
  return { x: object.x, y: object.y, w: object.w, h: object.h };
}

function getBoundsForObjects(objects: CanvasObject[]): Rect | null {
  if (objects.length === 0) return null;

  const bounds = objects.map(getObjectBounds);
  const minX = Math.min(...bounds.map((b) => b.x));
  const minY = Math.min(...bounds.map((b) => b.y));
  const maxX = Math.max(...bounds.map((b) => b.x + b.w));
  const maxY = Math.max(...bounds.map((b) => b.y + b.h));

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}


const NORTHSTAR_SURFACE_GAP = 280;
const NORTHSTAR_LAYOUT_GAP = 52;
const NORTHSTAR_LAYOUT_PADDING = 72;

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2,
  };
}

function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  const aa = margin > 0 ? expandRect(a, margin) : a;
  const bb = margin > 0 ? expandRect(b, margin) : b;
  return (
    aa.x < bb.x + bb.w &&
    aa.x + aa.w > bb.x &&
    aa.y < bb.y + bb.h &&
    aa.y + aa.h > bb.y
  );
}

function translateCanvasObject(object: CanvasObject, dx: number, dy: number): CanvasObject {
  if (isConnectorObject(object)) {
    return {
      ...object,
      x1: object.x1 + dx,
      y1: object.y1 + dy,
      x2: object.x2 + dx,
      y2: object.y2 + dy,
      controlX: typeof object.controlX === "number" ? object.controlX + dx : object.controlX,
      controlY: typeof object.controlY === "number" ? object.controlY + dy : object.controlY,
    };
  }
  return { ...object, x: object.x + dx, y: object.y + dy };
}

function findFreeRect(
  preferred: Rect,
  occupied: Rect[],
  options?: { margin?: number; step?: number; maxRings?: number },
): Rect {
  const margin = options?.margin ?? NORTHSTAR_SURFACE_GAP;
  const step = Math.max(160, options?.step ?? Math.min(preferred.w, preferred.h) * 0.32);
  const maxRings = options?.maxRings ?? 18;
  const isFree = (candidate: Rect) =>
    occupied.every((rect) => !rectsOverlap(candidate, rect, margin));

  if (isFree(preferred)) return preferred;

  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ];

  for (let ring = 1; ring <= maxRings; ring += 1) {
    for (const direction of directions) {
      const candidate = {
        ...preferred,
        x: preferred.x + direction.x * step * ring,
        y: preferred.y + direction.y * step * ring,
      };
      if (isFree(candidate)) return candidate;
    }
  }

  const rightEdge = occupied.length > 0
    ? Math.max(...occupied.map((rect) => rect.x + rect.w))
    : preferred.x;
  return { ...preferred, x: rightEdge + margin, y: preferred.y };
}

function getArtifactSurfaceBounds(
  objects: CanvasObject[],
  artifactId: string,
  kind: "working" | "presentation",
): Rect | null {
  return getBoundsForObjects(
    objects.filter(
      (object) =>
        object.semantic?.artifactId === artifactId &&
        !object.hidden &&
        isCanvasObjectOnSurface(object, kind),
    ),
  );
}

function moveArtifactSurface(
  objects: CanvasObject[],
  artifactId: string,
  kind: "working" | "presentation",
  dx: number,
  dy: number,
): CanvasObject[] {
  return objects.map((object) =>
    object.semantic?.artifactId === artifactId && isCanvasObjectOnSurface(object, kind)
      ? translateCanvasObject(object, dx, dy)
      : object,
  );
}

function separateArtifactSurfaces(
  objects: CanvasObject[],
  artifactId: string,
): { objects: CanvasObject[]; moved: boolean } {
  const workingBounds = getArtifactSurfaceBounds(objects, artifactId, "working");
  const presentationBounds = getArtifactSurfaceBounds(objects, artifactId, "presentation");
  if (!workingBounds || !presentationBounds) return { objects, moved: false };
  if (!rectsOverlap(workingBounds, presentationBounds, NORTHSTAR_SURFACE_GAP / 2)) {
    return { objects, moved: false };
  }

  const targetX = workingBounds.x + workingBounds.w + NORTHSTAR_SURFACE_GAP;
  const dx = targetX - presentationBounds.x;
  return {
    objects: moveArtifactSurface(objects, artifactId, "presentation", dx, 0),
    moved: true,
  };
}

function sectionGroupBounds(objects: CanvasObject[], artifactId: string, sectionId: string): Rect | null {
  return getBoundsForObjects(
    objects.filter(
      (object) =>
        object.semantic?.artifactId === artifactId &&
        object.semantic?.sectionId === sectionId &&
        !object.hidden,
    ),
  );
}

function translateSectionGroup(
  objects: CanvasObject[],
  artifactId: string,
  sectionId: string,
  dx: number,
  dy: number,
): CanvasObject[] {
  return objects.map((object) =>
    object.semantic?.artifactId === artifactId && object.semantic?.sectionId === sectionId
      ? translateCanvasObject(object, dx, dy)
      : object,
  );
}

function countMajorPresentationCollisions(objects: CanvasObject[], artifactId: string): number {
  const sectionCards = objects.filter(
    (object): object is CanvasBoxObject =>
      isBoxObject(object) &&
      object.semantic?.artifactId === artifactId &&
      object.semantic?.role === "artifact-section",
  );
  const uniqueSections = new Map<string, Rect>();
  for (const object of sectionCards) {
    const sectionId = object.semantic?.sectionId;
    if (!sectionId || uniqueSections.has(sectionId)) continue;
    const bounds = sectionGroupBounds(objects, artifactId, sectionId);
    if (bounds) uniqueSections.set(sectionId, bounds);
  }
  const entries = Array.from(uniqueSections.values());
  let collisions = 0;
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (rectsOverlap(entries[i], entries[j], 8)) collisions += 1;
    }
  }
  return collisions;
}

function getConnectionPoint(box: CanvasBoxObject, side: ConnectorSide) {
  if (side === "top") return { x: box.x + box.w / 2, y: box.y };
  if (side === "right") return { x: box.x + box.w, y: box.y + box.h / 2 };
  if (side === "bottom") return { x: box.x + box.w / 2, y: box.y + box.h };
  return { x: box.x, y: box.y + box.h / 2 };
}

function getBindingPoint(box: CanvasBoxObject, binding: ConnectorBinding) {
  return {
    x: box.x + box.w * binding.xRatio,
    y: box.y + box.h * binding.yRatio,
  };
}

function getBindingForPoint(box: CanvasBoxObject, point: { x: number; y: number }, side?: ConnectorSide): ConnectorBinding {
  return {
    objectId: box.id,
    side,
    xRatio: clamp01((point.x - box.x) / Math.max(1, box.w)),
    yRatio: clamp01((point.y - box.y) / Math.max(1, box.h)),
  };
}

function getBindingForSide(box: CanvasBoxObject, side: ConnectorSide): ConnectorBinding {
  const point = getConnectionPoint(box, side);
  return getBindingForPoint(box, point, side);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getNearestSide(box: CanvasBoxObject, point: { x: number; y: number }): ConnectorSide {
  const distances: Array<{ side: ConnectorSide; distance: number }> = [
    { side: "top", distance: Math.abs(point.y - box.y) },
    { side: "right", distance: Math.abs(point.x - (box.x + box.w)) },
    { side: "bottom", distance: Math.abs(point.y - (box.y + box.h)) },
    { side: "left", distance: Math.abs(point.x - box.x) },
  ];

  distances.sort((a, b) => a.distance - b.distance);
  return distances[0]?.side ?? "right";
}

function getBoxById(objects: CanvasObject[], id: string) {
  const object = objects.find((item) => item.id === id);
  return object && isBoxObject(object) ? object : null;
}

function resolveConnectorBindings(objects: CanvasObject[]) {
  // Connector resolution runs during every drag frame. Build the lookup once
  // instead of scanning the entire object array for every connector endpoint.
  const boxById = new Map<string, CanvasBoxObject>();

  for (const object of objects) {
    if (isBoxObject(object)) boxById.set(object.id, object);
  }

  return objects.map((object) => {
    if (!isConnectorObject(object)) return object;

    let next = object;

    if (object.startBinding) {
      const startBox = boxById.get(object.startBinding.objectId);
      if (startBox) {
        const point = getBindingPoint(startBox, object.startBinding);
        next = { ...next, x1: point.x, y1: point.y };
      }
    }

    if (object.endBinding) {
      const endBox = boxById.get(object.endBinding.objectId);
      if (endBox) {
        const point = getBindingPoint(endBox, object.endBinding);
        next = { ...next, x2: point.x, y2: point.y };
      }
    }

    return next;
  });
}


function contextBoundsFromRect(rect: Rect): CanvasContextBounds {
  return {
    x: roundContextNumber(rect.x),
    y: roundContextNumber(rect.y),
    width: roundContextNumber(rect.w),
    height: roundContextNumber(rect.h),
    centerX: roundContextNumber(rect.x + rect.w / 2),
    centerY: roundContextNumber(rect.y + rect.h / 2),
  };
}

function rectFromContextBounds(bounds: CanvasContextBounds): Rect {
  return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
}

function roundContextNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function getVisibleWorldBounds(viewport: Viewport): CanvasContextBounds {
  const width = typeof window !== "undefined" ? window.innerWidth : 1440;
  const height = typeof window !== "undefined" ? window.innerHeight : 900;

  return contextBoundsFromRect({
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    w: width / viewport.zoom,
    h: height / viewport.zoom,
  });
}

function getContextObjectType(object: CanvasObject): CanvasContextObject["type"] {
  if (isConnectorObject(object)) return "connector";
  if (object.source?.kind === "northstar-screenshot" || object.semantic?.role === "flow-screen" || object.semantic?.role === "single-screen") return "screenshot";
  if (object.type === "text") return "text";
  if (object.type === "note") return "note";
  if (object.type === "image") return "image";
  if (object.type === "table") return "table";
  if (object.type === "frame") return "frame";
  if (object.type === "card") return "card";
  if (object.type === "flow-header") return "flow-header";
  if (object.type === "visual-board") return "frame";
  if (object.type === "code-artifact") return "code-artifact";
  return "shape";
}

function getContextObjectContent(
  object: CanvasObject,
  options: { includeFullText?: boolean } = {}
): CanvasContextContent | undefined {
  if (isConnectorObject(object)) return undefined;

  const content: CanvasContextContent = {};
  const hasText = typeof object.text === "string" && object.text.length > 0;
  const richHtml = object.textHtml ? sanitizeRichTextHtml(object.textHtml) : undefined;

  if (hasText || richHtml) {
    const plainText = richHtml ? plainTextFromHtml(richHtml) : object.text ?? "";
    const lineCount = plainText.length > 0 ? plainText.split("\n").length : 0;
    const shouldTruncate = !options.includeFullText && plainText.length > CANVAS_CONTEXT_TEXT_PREVIEW_LIMIT;
    const plainTextPreview = shouldTruncate
      ? `${plainText.slice(0, CANVAS_CONTEXT_TEXT_PREVIEW_LIMIT).trimEnd()}…`
      : plainText;

    content.plainText = plainTextPreview;
    content.plainTextPreview = plainTextPreview;
    content.plainTextLength = plainText.length;
    content.lineCount = lineCount;
    content.isTruncated = shouldTruncate;

    if (richHtml && !shouldTruncate) {
      content.richText = {
        html: richHtml,
        plainText,
        segments: buildRichTextSegments(richHtml, object.style),
        isTruncated: false,
      };
    } else if (plainTextPreview) {
      content.richText = {
        html: htmlFromPlainText(plainTextPreview),
        plainText: plainTextPreview,
        segments: [
          {
            text: plainTextPreview,
            bold: object.style.fontWeight >= 700,
            color: object.style.textColor,
            fontSize: object.style.fontSize,
          },
        ],
        isTruncated: shouldTruncate,
      };
    }
  }

  if (object.type === "table") {
    content.table = {
      rows: object.rows ?? object.cells?.length ?? 0,
      cols: object.cols ?? object.cells?.[0]?.length ?? 0,
      cells: object.cells ?? [],
    };
  }

  if (object.type === "image") {
    content.image = {
      url: object.imageUrl?.startsWith("data:") ? "local-indexeddb-image-data" : object.imageUrl,
      storageKey: object.imageStorageKey,
      alt: object.text,
    };
  }

  return Object.keys(content).length > 0 ? content : undefined;
}

function buildRichTextSegments(html: string, fallbackStyle: CanvasObjectStyle): CanvasContextContentSegment[] {
  const plainText = plainTextFromHtml(html);
  if (!plainText) return [];

  if (typeof document === "undefined") {
    return [
      {
        text: plainText,
        bold: fallbackStyle.fontWeight >= 700,
        color: fallbackStyle.textColor,
        fontSize: fallbackStyle.fontSize,
      },
    ];
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = sanitizeRichTextHtml(html);
  const segments: CanvasContextContentSegment[] = [];

  const walk = (node: Node, inherited: CanvasContextContentSegment) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.length > 0) segments.push({ ...inherited, text });
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    const next: CanvasContextContentSegment = { ...inherited };
    const tag = node.tagName.toLowerCase();
    if (tag === "strong" || tag === "b") next.bold = true;
    if (tag === "em" || tag === "i") next.italic = true;

    const inlineColor = node.style.color;
    const inlineFontSize = node.style.fontSize;
    const inlineFontWeight = node.style.fontWeight;

    if (inlineColor) next.color = inlineColor;
    if (inlineFontSize) {
      const parsed = Number.parseFloat(inlineFontSize);
      if (Number.isFinite(parsed)) next.fontSize = parsed;
    }
    if (inlineFontWeight) {
      const parsed = Number.parseInt(inlineFontWeight, 10);
      if (Number.isFinite(parsed) && parsed >= 700) next.bold = true;
    }

    node.childNodes.forEach((child) => walk(child, next));
  };

  wrapper.childNodes.forEach((child) =>
    walk(child, {
      text: "",
      bold: fallbackStyle.fontWeight >= 700,
      color: fallbackStyle.textColor,
      fontSize: fallbackStyle.fontSize,
    })
  );

  return segments.length > 0
    ? segments
    : [
        {
          text: plainText,
          bold: fallbackStyle.fontWeight >= 700,
          color: fallbackStyle.textColor,
          fontSize: fallbackStyle.fontSize,
        },
      ];
}

function getContextObjectStyle(object: CanvasObject): CanvasContextObjectStyle {
  if (isConnectorObject(object)) {
    return {
      stroke: object.style.stroke,
      strokeWidth: object.style.strokeWidth,
      connectorKind: object.style.kind,
      connectorEnd: object.style.end,
      connectorDash: object.style.dash,
    };
  }

  return {
    fill: object.style.fill,
    stroke: object.style.stroke,
    strokeWidth: object.style.strokeWidth,
    textColor: object.style.textColor,
    fontSize: object.style.fontSize,
    fontWeight: object.style.fontWeight,
    textAlign: object.style.textAlign,
  };
}

function getContextObjectCapabilities(object: CanvasObject): CanvasContextObjectCapabilities {
  const locked = Boolean(object.locked);
  const isConnector = isConnectorObject(object);
  const isTextEditable = !isConnector && isTextEditableBox(object.type);

  return {
    canMove: !locked,
    canResize: !locked && !isConnector,
    canRotate: !locked && !isConnector,
    canDelete: !locked,
    canDuplicate: true,
    canEditText: !locked && isTextEditable,
    canChangeFill: !locked && !isConnector,
    canChangeStroke: !locked,
    canAttachConnector: !locked && !isConnector,
    canDetachConnector: !locked && isConnector,
  };
}

function getContextObjectInterpretation(object: CanvasObject): CanvasContextSemanticInterpretation {
  const semantic = object.semantic;
  const source = object.source;

  if (isConnectorObject(object)) {
    const connectedCount = [object.startBinding, object.endBinding].filter(Boolean).length;
    return {
      role: "connector",
      label: connectedCount > 0 ? `Connector with ${connectedCount} attached end${connectedCount === 1 ? "" : "s"}` : "Connector",
      description: "A connector line that can express a relationship or sequence between canvas elements.",
    };
  }

  if (semantic?.role === "flow-app-icon") {
    return { role: "flow-app-icon", label: source?.appName ?? semantic?.label, description: "App identity icon for an inserted North Star flow row." };
  }

  if (semantic?.role === "flow-app-name") {
    return { role: "flow-app-name", label: object.text ?? semantic?.label, description: "Editable app name label for an inserted flow row." };
  }

  if (semantic?.role === "flow-title") {
    return { role: "flow-title", label: object.text ?? semantic?.label, description: "Editable flow title label for an inserted flow row." };
  }

  if (semantic?.role === "flow-screen" || source?.kind === "northstar-screenshot") {
    return { role: "flow-screen", label: source?.screenLabel ?? semantic?.label, description: `Screenshot from ${source?.appName ?? "an app"}${source?.flowName ? ` — ${source.flowName}` : ""}.` };
  }

  if (semantic?.role === "single-screen") {
    return { role: "single-screen", label: source?.screenLabel ?? semantic?.label, description: "Single screenshot inserted from North Star app flows." };
  }

  if (isArtifactWorkingObject(object)) {
    return {
      role: "working-surface",
      label: semantic?.label ?? object.text?.slice(0, 100),
      description: "Inspectable North Star working material used to research, test, and refine a complex solution.",
    };
  }

  if (isArtifactPresentationObject(object)) {
    return {
      role: "artifact",
      label: semantic?.label ?? object.text?.slice(0, 100),
      description: "Part of a complete editable North Star solution artifact.",
    };
  }

  if (source?.kind === "pasted-text") {
    return { role: "pasted-content", label: semantic?.label ?? object.text?.slice(0, 80), description: "Text content pasted by the user into the canvas." };
  }

  if (object.type === "text" || object.type === "note" || object.type === "card") {
    return { role: "editable-text", label: object.text?.split("\n").find(Boolean)?.slice(0, 80), description: "Editable canvas text content." };
  }

  if (object.type === "image") {
    return { role: "image", label: object.text ?? semantic?.label, description: "Image object on the canvas." };
  }

  if (object.type === "table") {
    return { role: "table", label: semantic?.label ?? "Table", description: "Editable table object on the canvas." };
  }

  if (object.type === "frame") {
    return { role: "frame", label: semantic?.label ?? object.text ?? "Frame", description: "Frame object used to visually group canvas content." };
  }

  if (isBoxObject(object)) {
    return { role: "shape", label: object.text || semantic?.label || object.type, description: `Editable ${object.type} shape on the canvas.` };
  }

  return { role: "unknown" };
}

function buildConnectedToIndex(objects: CanvasObject[]) {
  const connectedToByObject = new Map<string, string[]>();

  for (const object of objects) {
    if (!isConnectorObject(object)) continue;

    const startId = object.startBinding?.objectId;
    const endId = object.endBinding?.objectId;

    if (startId) {
      connectedToByObject.set(startId, [...(connectedToByObject.get(startId) ?? []), object.id]);
    }

    if (endId) {
      connectedToByObject.set(endId, [...(connectedToByObject.get(endId) ?? []), object.id]);
    }
  }

  return connectedToByObject;
}

function normalizeObjectForContext(
  object: CanvasObject,
  zIndex: number,
  allObjects: CanvasObject[],
  options: { includeFullText?: boolean; connectedToByObject?: Map<string, string[]> } = {}
): CanvasContextObject {
  const bounds = contextBoundsFromRect(getObjectBounds(object));
  const source = object.source;
  const semantic = object.semantic;

  const connectedTo = isConnectorObject(object)
    ? ([object.startBinding?.objectId, object.endBinding?.objectId].filter(Boolean) as string[])
    : options.connectedToByObject?.get(object.id) ??
      allObjects
        .filter(
          (candidate) =>
            isConnectorObject(candidate) &&
            (candidate.startBinding?.objectId === object.id || candidate.endBinding?.objectId === object.id)
        )
        .map((candidate) => candidate.id);

  return {
    id: object.id,
    type: getContextObjectType(object),
    subtype: isConnectorObject(object) ? object.style.kind : object.type,
    bounds,
    rotation: isConnectorObject(object) ? 0 : roundContextNumber(object.rotation),
    zIndex,
    visible: !object.hidden,
    locked: Boolean(object.locked),
    content: getContextObjectContent(object, options),
    style: getContextObjectStyle(object),
    source,
    semantic,
    codeArtifact:
      object.type === "code-artifact" && object.codeArtifact
        ? {
            artifactId: object.codeArtifact.artifactId,
            revisionId: object.codeArtifact.revisionId,
            parentRevisionId: object.codeArtifact.parentRevisionId,
            title: object.codeArtifact.title,
            description: object.codeArtifact.description,
            visualStrategy: object.codeArtifact.visualStrategy,
            artifactType: object.codeArtifact.artifactType,
            audience: object.codeArtifact.audience,
            thinkingDepth: object.codeArtifact.thinkingDepth,
            activeStageIndex: object.codeArtifact.activeStageIndex,
            creativeDirection: object.codeArtifact.creativeDirection,
            creativeReviews: object.codeArtifact.creativeReviews,
            runtimeReview: object.codeArtifact.runtimeReview,
            document: options.includeFullText ? object.codeArtifact.document : undefined,
            sourceTsx: options.includeFullText ? object.codeArtifact.sourceTsx : undefined,
            dataBundle: options.includeFullText ? object.codeArtifact.dataBundle : undefined,
          }
        : undefined,
    interpretation: getContextObjectInterpretation(object),
    relationships: {
      groupId: semantic?.artifactId,
      artifactId: semantic?.artifactId,
      connectedTo,
    },
    capabilities: getContextObjectCapabilities(object),
  };
}

function buildContextRelationships(contextObjects: CanvasContextObject[], objects: CanvasObject[]): CanvasContextRelationships {
  const objectById = new Map(contextObjects.map((object) => [object.id, object]));
  const connectors = objects
    .filter(isConnectorObject)
    .map((connector) => ({
      connectorId: connector.id,
      fromObjectId: connector.startBinding?.objectId,
      toObjectId: connector.endBinding?.objectId,
      fromPoint: { x: roundContextNumber(connector.x1), y: roundContextNumber(connector.y1) },
      toPoint: { x: roundContextNumber(connector.x2), y: roundContextNumber(connector.y2) },
      fromAnchor: connector.startBinding
        ? {
            objectId: connector.startBinding.objectId,
            xRatio: roundContextNumber(connector.startBinding.xRatio),
            yRatio: roundContextNumber(connector.startBinding.yRatio),
            side: connector.startBinding.side,
          }
        : undefined,
      toAnchor: connector.endBinding
        ? {
            objectId: connector.endBinding.objectId,
            xRatio: roundContextNumber(connector.endBinding.xRatio),
            yRatio: roundContextNumber(connector.endBinding.yRatio),
            side: connector.endBinding.side,
          }
        : undefined,
      style: connector.style.kind,
    }));

  const overlaps: CanvasContextRelationships["overlaps"] = [];
  const proximityCandidates: CanvasContextRelationships["proximity"] = [];
  const candidates = contextObjects.filter((object) => object.type !== "connector");
  const spatialCellSize = 900;
  const cells = new Map<string, number[]>();
  const comparedPairs = new Set<string>();

  const cellKey = (x: number, y: number) => `${x}:${y}`;
  const cellRangeForRect = (rect: Rect, padding = 0) => ({
    minX: Math.floor((rect.x - padding) / spatialCellSize),
    maxX: Math.floor((rect.x + rect.w + padding) / spatialCellSize),
    minY: Math.floor((rect.y - padding) / spatialCellSize),
    maxY: Math.floor((rect.y + rect.h + padding) / spatialCellSize),
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index];
    const rectA = rectFromContextBounds(current.bounds);
    const queryRange = cellRangeForRect(rectA, spatialCellSize);
    const nearbyIndexes = new Set<number>();

    for (let cellX = queryRange.minX; cellX <= queryRange.maxX; cellX += 1) {
      for (let cellY = queryRange.minY; cellY <= queryRange.maxY; cellY += 1) {
        for (const candidateIndex of cells.get(cellKey(cellX, cellY)) ?? []) {
          nearbyIndexes.add(candidateIndex);
        }
      }
    }

    for (const candidateIndex of nearbyIndexes) {
      const other = candidates[candidateIndex];
      if (!other) continue;

      const pairKey = candidateIndex < index ? `${candidateIndex}:${index}` : `${index}:${candidateIndex}`;
      if (comparedPairs.has(pairKey)) continue;
      comparedPairs.add(pairKey);

      const rectB = rectFromContextBounds(other.bounds);
      const overlapW = Math.max(
        0,
        Math.min(rectA.x + rectA.w, rectB.x + rectB.w) - Math.max(rectA.x, rectB.x)
      );
      const overlapH = Math.max(
        0,
        Math.min(rectA.y + rectA.h, rectB.y + rectB.h) - Math.max(rectA.y, rectB.y)
      );
      const overlapArea = roundContextNumber(overlapW * overlapH);

      if (overlapArea > 0 && overlaps.length < 160) {
        overlaps.push({ objectA: other.id, objectB: current.id, overlapArea });
      }

      const distance = roundContextNumber(
        Math.hypot(current.bounds.centerX - other.bounds.centerX, current.bounds.centerY - other.bounds.centerY)
      );

      if (distance <= spatialCellSize) {
        proximityCandidates.push({ objectA: other.id, objectB: current.id, distance });
      }
    }

    const storageRange = cellRangeForRect(rectA);
    for (let cellX = storageRange.minX; cellX <= storageRange.maxX; cellX += 1) {
      for (let cellY = storageRange.minY; cellY <= storageRange.maxY; cellY += 1) {
        const key = cellKey(cellX, cellY);
        cells.set(key, [...(cells.get(key) ?? []), index]);
      }
    }
  }

  const proximity = proximityCandidates.sort((a, b) => a.distance - b.distance).slice(0, 120);
  const alignment = buildAlignmentRelationships(contextObjects);
  const nearestByObject = new Map<string, string[]>();
  const overlapsByObject = new Map<string, string[]>();

  for (const pair of proximity) {
    nearestByObject.set(pair.objectA, [...(nearestByObject.get(pair.objectA) ?? []), pair.objectB].slice(0, 6));
    nearestByObject.set(pair.objectB, [...(nearestByObject.get(pair.objectB) ?? []), pair.objectA].slice(0, 6));
  }

  for (const pair of overlaps) {
    overlapsByObject.set(pair.objectA, [...(overlapsByObject.get(pair.objectA) ?? []), pair.objectB]);
    overlapsByObject.set(pair.objectB, [...(overlapsByObject.get(pair.objectB) ?? []), pair.objectA]);
  }

  for (const object of contextObjects) {
    object.relationships = {
      ...object.relationships,
      nearestObjects: (nearestByObject.get(object.id) ?? []).filter((id) => objectById.has(id)),
      overlapsWith: overlapsByObject.get(object.id) ?? [],
    };
  }

  return { connectors, overlaps, proximity, alignment };
}

function buildAlignmentRelationships(contextObjects: CanvasContextObject[]) {
  const alignments: CanvasContextRelationships["alignment"] = [];
  const candidates = contextObjects.filter((object) => object.type !== "connector");
  const specs: Array<{
    key: "left" | "center" | "right" | "top" | "middle" | "bottom";
    axis: "x" | "y";
    value: (object: CanvasContextObject) => number;
  }> = [
    { key: "left", axis: "x", value: (object) => object.bounds.x },
    { key: "center", axis: "x", value: (object) => object.bounds.centerX },
    { key: "right", axis: "x", value: (object) => object.bounds.x + object.bounds.width },
    { key: "top", axis: "y", value: (object) => object.bounds.y },
    { key: "middle", axis: "y", value: (object) => object.bounds.centerY },
    { key: "bottom", axis: "y", value: (object) => object.bounds.y + object.bounds.height },
  ];

  specs.forEach((spec) => {
    const buckets = new Map<number, string[]>();
    candidates.forEach((object) => {
      const rounded = Math.round(spec.value(object) / 2) * 2;
      buckets.set(rounded, [...(buckets.get(rounded) ?? []), object.id]);
    });

    buckets.forEach((objectIds) => {
      if (objectIds.length >= 3) {
        alignments.push({ objectIds, axis: spec.axis, alignment: spec.key });
      }
    });
  });

  return alignments.slice(0, 40);
}

function buildFlowArtifactsFromContextObjects(contextObjects: CanvasContextObject[]) {
  const artifacts = new Map<string, CanvasContextObject[]>();

  contextObjects.forEach((object) => {
    const artifactId = object.semantic?.artifactId;
    if (!artifactId) return;
    artifacts.set(artifactId, [...(artifacts.get(artifactId) ?? []), object]);
  });

  const flows: CanvasContextFlowArtifact[] = [];

  artifacts.forEach((artifactObjects, artifactId) => {
    const isInsertedFlowArtifact = artifactObjects.some((object) =>
      object.semantic?.role === "flow-screen" ||
      object.semantic?.role === "flow-app-icon" ||
      object.semantic?.role === "flow-app-name" ||
      object.semantic?.role === "flow-title"
    );
    if (!isInsertedFlowArtifact) return;
    const screenshots = artifactObjects.filter((object) => object.semantic?.role === "flow-screen" || object.type === "screenshot");
    const appIcon = artifactObjects.find((object) => object.semantic?.role === "flow-app-icon");
    const appNameObject = artifactObjects.find((object) => object.semantic?.role === "flow-app-name");
    const flowNameObject = artifactObjects.find((object) => object.semantic?.role === "flow-title");
    const sourceObject = screenshots[0] ?? appNameObject ?? flowNameObject ?? appIcon ?? artifactObjects[0];
    const appName = sourceObject?.source?.appName ?? appNameObject?.content?.plainText ?? "Unknown app";
    const flowName = sourceObject?.source?.flowName ?? flowNameObject?.content?.plainText ?? "Untitled flow";
    const boundsRect = getBoundsForContextObjects(artifactObjects);

    if (!boundsRect) return;

    const sortedScreens = screenshots.slice().sort((a, b) => a.bounds.x - b.bounds.x);
    const spacings = sortedScreens.slice(1).map((screen, index) => roundContextNumber(screen.bounds.x - (sortedScreens[index].bounds.x + sortedScreens[index].bounds.width)));
    const avgSpacing = spacings.length > 0 ? roundContextNumber(spacings.reduce((sum, value) => sum + value, 0) / spacings.length) : 0;

    flows.push({
      id: artifactId,
      type: "inserted-flow-row",
      appName,
      appIconUrl: sourceObject?.source?.appIconUrl,
      flowName,
      flowType: sourceObject?.source?.flowType ?? "unknown",
      objectIds: artifactObjects.map((object) => object.id),
      labelObjectIds: {
        appName: appNameObject?.id,
        flowName: flowNameObject?.id,
      },
      appIconObjectId: appIcon?.id,
      screenshotObjectIds: sortedScreens.map((object) => object.id),
      bounds: contextBoundsFromRect(boundsRect),
      layout: {
        direction: "horizontal",
        screenshotCount: screenshots.length,
        screenshotSpacing: avgSpacing,
      },
    });
  });

  return flows;
}

function getBoundsForContextObjects(objects: CanvasContextObject[]): Rect | null {
  if (objects.length === 0) return null;
  const minX = Math.min(...objects.map((object) => object.bounds.x));
  const minY = Math.min(...objects.map((object) => object.bounds.y));
  const maxX = Math.max(...objects.map((object) => object.bounds.x + object.bounds.width));
  const maxY = Math.max(...objects.map((object) => object.bounds.y + object.bounds.height));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function buildCanvasSummary(contextObjects: CanvasContextObject[], selectedIds: string[], flows: CanvasContextFlowArtifact[]): CanvasContextSummary {
  const appsRepresented = Array.from(new Set(contextObjects.map((object) => object.source?.appName).filter(Boolean) as string[]));
  const flowsRepresented = Array.from(new Set(contextObjects.map((object) => object.source?.flowName).filter(Boolean) as string[]));
  const screenshotCount = contextObjects.filter((object) => object.type === "screenshot").length;
  const connectorCount = contextObjects.filter((object) => object.type === "connector").length;
  const textCount = contextObjects.filter((object) => object.type === "text" || object.type === "note" || object.type === "card").length;
  const imageCount = contextObjects.filter((object) => object.type === "image" || object.type === "screenshot").length;
  const shapeCount = contextObjects.filter((object) => object.type === "shape" || object.type === "frame" || object.type === "table").length;
  const generatedArtifactIds = Array.from(
    new Set(
      contextObjects
        .filter((object) => object.semantic?.surfaceKind === "presentation")
        .map((object) => object.semantic?.artifactId)
        .filter(Boolean) as string[],
    ),
  );
  const workingObjectCount = contextObjects.filter((object) => object.semantic?.surfaceKind === "working").length;
  const presentationObjectCount = contextObjects.filter((object) => object.semantic?.surfaceKind === "presentation").length;

  const flowSummaries = flows
    .slice(0, 5)
    .map((flow) => `${flow.appName} — ${flow.flowName} (${flow.layout.screenshotCount} screenshots)`)
    .join("; ");

  return {
    objectCount: contextObjects.length,
    selectedCount: selectedIds.length,
    textCount,
    imageCount,
    screenshotCount,
    shapeCount,
    connectorCount,
    flowArtifactCount: flows.length,
    generatedArtifactCount: generatedArtifactIds.length,
    workingObjectCount,
    presentationObjectCount,
    appsRepresented,
    flowsRepresented,
    humanReadableSummary:
      contextObjects.length === 0
        ? "Canvas is empty."
        : `Canvas contains ${contextObjects.length} objects, including ${screenshotCount} screenshots, ${textCount} text/note/card objects, ${shapeCount} shapes/tables/frames, and ${connectorCount} connectors. ${generatedArtifactIds.length > 0 ? `${generatedArtifactIds.length} North Star solution artifact${generatedArtifactIds.length === 1 ? "" : "s"} detected with ${presentationObjectCount} presentation objects and ${workingObjectCount} inspectable working objects.` : "No North Star solution artifacts detected yet."} ${flows.length > 0 ? `Inserted flows: ${flowSummaries}.` : "No inserted flow rows detected yet."}`,
  };
}

function buildCanvasContext({
  objects,
  selectedIds,
  viewport,
  title = "Untitled canvas",
}: {
  objects: CanvasObject[];
  selectedIds: string[];
  viewport: Viewport;
  title?: string;
}): CanvasContext {
  const resolvedObjects = resolveConnectorBindings(objects);
  const connectedToByObject = buildConnectedToIndex(resolvedObjects);
  const contextObjects = resolvedObjects.map((object, index) =>
    normalizeObjectForContext(object, index, resolvedObjects, {
      includeFullText: false,
      connectedToByObject,
    })
  );
  const relationships = buildContextRelationships(contextObjects, resolvedObjects);
  const flows = buildFlowArtifactsFromContextObjects(contextObjects);
  const selectedIdSet = new Set(selectedIds);
  const selectionObjects = contextObjects.filter((object) => selectedIdSet.has(object.id));
  const documentBoundsRect = getBoundsForObjects(resolvedObjects);
  const selectionBoundsRect = getBoundsForContextObjects(selectionObjects);
  const groups: CanvasContextGroup[] = flows.map((flow) => ({
    id: flow.id,
    type: "semantic-artifact",
    objectIds: flow.objectIds,
    bounds: flow.bounds,
    label: `${flow.appName} — ${flow.flowName}`,
  }));
  if (selectionObjects.length > 1 && selectionBoundsRect) {
    groups.push({
      id: "current-selection",
      type: "selection",
      objectIds: selectedIds,
      bounds: contextBoundsFromRect(selectionBoundsRect),
      label: "Current selection",
    });
  }

  return {
    version: "northstar.canvas-context.v1",
    canvas: {
      id: "local-canvas",
      title,
      updatedAt: new Date().toISOString(),
    },
    viewport: {
      x: roundContextNumber(viewport.x),
      y: roundContextNumber(viewport.y),
      zoom: roundContextNumber(viewport.zoom),
      visibleBounds: getVisibleWorldBounds(viewport),
    },
    documentBounds: documentBoundsRect ? contextBoundsFromRect(documentBoundsRect) : null,
    selection: {
      selectedIds,
      selectionBounds: selectionBoundsRect ? contextBoundsFromRect(selectionBoundsRect) : null,
    },
    objects: contextObjects,
    groups,
    flows,
    relationships,
    summary: buildCanvasSummary(contextObjects, selectedIds, flows),
  };
}

function buildSelectedCanvasContext(canvasContext: CanvasContext, sourceObjects: CanvasObject[] = []): SelectedCanvasContext {
  const selectedCanvasIdSet = new Set(canvasContext.selection.selectedIds);
  const selectedSourceObjects = sourceObjects.filter((object) => selectedCanvasIdSet.has(object.id));
  const connectedToByObject = buildConnectedToIndex(sourceObjects);
  const selectedObjects = selectedSourceObjects.length > 0
    ? selectedSourceObjects.map((object, index) =>
        normalizeObjectForContext(object, index, sourceObjects, {
          includeFullText: true,
          connectedToByObject,
        })
      )
    : canvasContext.objects.filter((object) => selectedCanvasIdSet.has(object.id));
  const selectedIdSet = new Set(selectedObjects.map((object) => object.id));
  const selectedGroups = canvasContext.groups.filter((group) => group.objectIds.some((id) => selectedIdSet.has(id)));
  const selectedFlowArtifacts = canvasContext.flows.filter((flow) => flow.objectIds.some((id) => selectedIdSet.has(id)));
  const connectedIds = new Set<string>();

  canvasContext.relationships.connectors.forEach((connector) => {
    if (connector.fromObjectId && selectedIdSet.has(connector.fromObjectId) && connector.toObjectId) connectedIds.add(connector.toObjectId);
    if (connector.toObjectId && selectedIdSet.has(connector.toObjectId) && connector.fromObjectId) connectedIds.add(connector.fromObjectId);
    if (selectedIdSet.has(connector.connectorId)) {
      if (connector.fromObjectId) connectedIds.add(connector.fromObjectId);
      if (connector.toObjectId) connectedIds.add(connector.toObjectId);
    }
  });

  const connectedObjects = canvasContext.objects.filter((object) => connectedIds.has(object.id));
  const nearbyIds = new Set<string>();
  canvasContext.relationships.proximity.forEach((pair) => {
    if (selectedIdSet.has(pair.objectA) && !selectedIdSet.has(pair.objectB)) nearbyIds.add(pair.objectB);
    if (selectedIdSet.has(pair.objectB) && !selectedIdSet.has(pair.objectA)) nearbyIds.add(pair.objectA);
  });
  const nearbyObjects = canvasContext.objects.filter((object) => nearbyIds.has(object.id)).slice(0, 24);
  const selectedTypes = Array.from(new Set(selectedObjects.map((object) => object.type)));
  const primaryApp = firstMostCommon(selectedObjects.map((object) => object.source?.appName).filter(Boolean) as string[]);
  const primaryFlow = firstMostCommon(selectedObjects.map((object) => object.source?.flowName).filter(Boolean) as string[]);
  const selectionKind = getSelectedContextKind(selectedObjects, selectedFlowArtifacts);

  const canAnalyzeAsFlow = selectedFlowArtifacts.length > 0 || selectedObjects.some((object) => object.source?.flowName);
  const canAnalyzeAsScreenshots = selectedObjects.some((object) => object.type === "screenshot");

  return {
    version: "northstar.selected-canvas-context.v1",
    selectedIds: canvasContext.selection.selectedIds,
    selectionBounds: canvasContext.selection.selectionBounds,
    selectedObjects,
    selectedGroups,
    selectedFlowArtifacts,
    connectedObjects,
    nearbyObjects,
    editableState: {
      canMove: selectedObjects.length > 0 && selectedObjects.every((object) => object.capabilities.canMove),
      canResize: selectedObjects.length > 0 && selectedObjects.every((object) => object.capabilities.canResize),
      canRotate: selectedObjects.length > 0 && selectedObjects.every((object) => object.capabilities.canRotate),
      canEditText: selectedObjects.some((object) => object.capabilities.canEditText),
      canStyle: selectedObjects.some((object) => object.capabilities.canChangeFill || object.capabilities.canChangeStroke),
      canConnect: selectedObjects.some((object) => object.capabilities.canAttachConnector),
      canGroup: selectedObjects.length > 1,
      canUngroup: selectedFlowArtifacts.length > 0,
      canAnalyzeAsFlow,
      canAnalyzeAsScreenshots,
    },
    suggestedInterpretation: {
      selectionKind,
      primaryApp,
      primaryFlow,
      humanReadableSummary: buildSelectedContextSummary(selectedObjects, selectedFlowArtifacts, primaryApp, primaryFlow),
    },
  };
}

function buildAreaCanvasContext(canvasContext: CanvasContext, area: Rect): CanvasAreaContext {
  const areaBounds = contextBoundsFromRect(area);
  const containedObjects: CanvasContextObject[] = [];
  const partiallyIntersectingObjects: CanvasContextObject[] = [];

  canvasContext.objects.forEach((object) => {
    const rect = rectFromContextBounds(object.bounds);
    if (!rectsIntersect(area, rect)) return;

    const fullyContained =
      rect.x >= area.x &&
      rect.y >= area.y &&
      rect.x + rect.w <= area.x + area.w &&
      rect.y + rect.h <= area.y + area.h;

    if (fullyContained) containedObjects.push(object);
    else partiallyIntersectingObjects.push(object);
  });

  const containedIds = new Set(containedObjects.map((object) => object.id));
  const flowArtifactsInside = canvasContext.flows.filter((flow) => flow.objectIds.some((id) => containedIds.has(id)));
  const nearbyObjects = canvasContext.objects
    .filter((object) => !containedIds.has(object.id))
    .map((object) => ({ object, distance: Math.hypot(object.bounds.centerX - areaBounds.centerX, object.bounds.centerY - areaBounds.centerY) }))
    .filter((item) => item.distance <= 700)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24)
    .map((item) => item.object);

  return {
    areaBounds,
    containedObjects,
    partiallyIntersectingObjects,
    flowArtifactsInside,
    nearbyObjects,
  };
}

function firstMostCommon(values: string[]) {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function getSelectedContextKind(selectedObjects: CanvasContextObject[], selectedFlowArtifacts: CanvasContextFlowArtifact[]): SelectedCanvasContext["suggestedInterpretation"]["selectionKind"] {
  if (selectedObjects.length === 0) return "empty";
  if (selectedFlowArtifacts.length > 0 && selectedFlowArtifacts.some((flow) => flow.objectIds.every((id) => selectedObjects.some((object) => object.id === id)))) return "flow-row";
  if (selectedObjects.length === 1) return "single-object";
  if (selectedObjects.every((object) => object.type === "screenshot")) return "screenshot-set";
  if (selectedObjects.every((object) => object.type === "text" || object.type === "note" || object.type === "card")) return "text-set";
  return selectedObjects.length > 1 ? "mixed-selection" : "single-object";
}

function buildSelectedContextSummary(
  selectedObjects: CanvasContextObject[],
  selectedFlowArtifacts: CanvasContextFlowArtifact[],
  primaryApp?: string,
  primaryFlow?: string
) {
  if (selectedObjects.length === 0) return "No objects selected.";
  if (selectedFlowArtifacts.length > 0) {
    const flow = selectedFlowArtifacts[0];
    return `Selection includes ${selectedObjects.length} objects from ${flow.appName} — ${flow.flowName}, including ${flow.layout.screenshotCount} screenshots arranged as a flow artifact.`;
  }

  const typeSummary = Array.from(new Set(selectedObjects.map((object) => object.type))).join(", ");
  const sourceSummary = primaryApp || primaryFlow ? ` Primary source: ${[primaryApp, primaryFlow].filter(Boolean).join(" — ")}.` : "";
  return `Selection contains ${selectedObjects.length} object${selectedObjects.length === 1 ? "" : "s"}: ${typeSummary}.${sourceSummary}`;
}

function detectWorkspaceFlowType(flow: WorkspaceAppFlow): CanvasFlowType {
  const text = `${flow.name} ${flow.description ?? ""}`.toLowerCase();
  if (/onboard|signup|sign up|first login|activation|registration|welcome|get started/.test(text)) return "onboarding";
  if (/browse|discover|search|marketplace|catalog|explore|listing|feed/.test(text)) return "browsing";
  return "unknown";
}

function makeFlowArtifactId(app: WorkspaceApp, flow: WorkspaceAppFlow) {
  return `flow:${normalizeWorkspaceName(app.name) || app.id}:${normalizeWorkspaceName(flow.name) || flow.id}:${makeId()}`;
}

function getAngleFromCenter(center: { x: number; y: number }, point: { x: number; y: number }) {
  return Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI);
}

function normalizeDegrees(value: number) {
  let next = value % 360;
  if (next < 0) next += 360;
  return next;
}

function getNearestConnectionPoint(
  point: { x: number; y: number },
  objects: CanvasObject[],
  ignoredId?: string
): SnappedConnectionPoint | null {
  const candidates: SnappedConnectionPoint[] = [];

  for (const object of objects) {
    if (!isBoxObject(object)) continue;
    if (object.id === ignoredId) continue;

    const left = object.x;
    const right = object.x + object.w;
    const top = object.y;
    const bottom = object.y + object.h;

    const clampedPoint = {
      x: clamp(point.x, left, right),
      y: clamp(point.y, top, bottom),
    };

    const dx = point.x - clampedPoint.x;
    const dy = point.y - clampedPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Attach anywhere on/inside the element, or just outside the boundary.
    // Pulling the handle away by more than CONNECTOR_ATTACH_PADDING detaches it.
    if (distance <= CONNECTOR_ATTACH_PADDING) {
      const side = getNearestSide(object, clampedPoint);
      candidates.push({
        ...clampedPoint,
        id: object.id,
        side,
        xRatio: clamp01((clampedPoint.x - object.x) / Math.max(1, object.w)),
        yRatio: clamp01((clampedPoint.y - object.y) / Math.max(1, object.h)),
        distance,
      });
    }
  }

  if (candidates.length === 0) return null;

  const nearest = candidates.slice(1).reduce<SnappedConnectionPoint>(
    (best, candidate) =>
      candidate.distance < best.distance ? candidate : best,
    candidates[0]!
  );

  return nearest;
}

function isNorthStarScreenshotObject(object: CanvasBoxObject) {
  return (
    object.type === "image" &&
    (object.source?.kind === "northstar-screenshot" ||
      object.semantic?.role === "flow-screen" ||
      object.semantic?.role === "single-screen")
  );
}

function getObjectAspectRatio(object: CanvasBoxObject) {
  const originalWidth = object.source?.originalWidth;
  const originalHeight = object.source?.originalHeight;

  if (
    typeof originalWidth === "number" &&
    Number.isFinite(originalWidth) &&
    originalWidth > 0 &&
    typeof originalHeight === "number" &&
    Number.isFinite(originalHeight) &&
    originalHeight > 0
  ) {
    return Math.max(0.01, originalWidth / originalHeight);
  }

  return Math.max(0.01, object.w / Math.max(1, object.h));
}

function resizeBox(
  object: CanvasBoxObject,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  lockAspect = false
): CanvasBoxObject {
  let { x, y, w, h } = object;
  const originalRight = object.x + object.w;
  const originalBottom = object.y + object.h;
  const originalCenterX = object.x + object.w / 2;
  const originalCenterY = object.y + object.h / 2;

  if (direction.includes("e")) w += dx;
  if (direction.includes("s")) h += dy;
  if (direction.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (direction.includes("n")) {
    y += dy;
    h -= dy;
  }

  const minW =
    object.type === "code-artifact"
      ? object.codeArtifact?.minimumWidth ?? 640
      : object.type === "text"
        ? 80
        : 32;
  const minH =
    object.type === "code-artifact"
      ? object.codeArtifact?.minimumHeight ?? 420
      : object.type === "text"
        ? 40
        : 32;

  if (lockAspect) {
    const aspect = getObjectAspectRatio(object);
    const changesWidth = direction.includes("e") || direction.includes("w");
    const changesHeight = direction.includes("n") || direction.includes("s");

    if (changesWidth && changesHeight) {
      const widthScale = Math.abs(w - object.w) / Math.max(1, object.w);
      const heightScale = Math.abs(h - object.h) / Math.max(1, object.h);

      if (widthScale >= heightScale) h = w / aspect;
      else w = h * aspect;
    } else if (changesWidth) {
      h = w / aspect;
    } else if (changesHeight) {
      w = h * aspect;
    }

    if (w < minW) {
      w = minW;
      h = w / aspect;
    }
    if (h < minH) {
      h = minH;
      w = h * aspect;
    }

    if (direction.includes("w")) x = originalRight - w;
    else if (direction.includes("e")) x = object.x;
    else x = originalCenterX - w / 2;

    if (direction.includes("n")) y = originalBottom - h;
    else if (direction.includes("s")) y = object.y;
    else y = originalCenterY - h / 2;

    // Side-handle resizing scales screenshots around the untouched axis center,
    // while corner handles keep the opposite corner anchored.
    if (changesWidth && !changesHeight) y = originalCenterY - h / 2;
    if (changesHeight && !changesWidth) x = originalCenterX - w / 2;

    return { ...object, x, y, w, h };
  }

  if (w < minW) {
    if (direction.includes("w")) x -= minW - w;
    w = minW;
  }

  if (h < minH) {
    if (direction.includes("n")) y -= minH - h;
    h = minH;
  }

  return { ...object, x, y, w, h };
}

function resolveAxisSnap(
  movingPoints: [number, number, number],
  staticPoints: number[],
  acquireThreshold: number,
  releaseThreshold: number,
  lock?: AxisSnapLock
): { diff: number; guide: number | null; lock?: AxisSnapLock } {
  if (lock) {
    const diff = lock.target - movingPoints[lock.movingPointIndex];

    if (Math.abs(diff) <= releaseThreshold) {
      return { diff, guide: lock.target, lock };
    }
  }

  let bestDistance = acquireThreshold + 1;
  let bestDiff = 0;
  let bestTarget: number | null = null;
  let bestMovingPointIndex: 0 | 1 | 2 = 0;

  for (let movingPointIndex = 0; movingPointIndex < movingPoints.length; movingPointIndex += 1) {
    const movingPoint = movingPoints[movingPointIndex];

    for (const staticPoint of staticPoints) {
      const diff = staticPoint - movingPoint;
      const distance = Math.abs(diff);

      if (distance <= acquireThreshold && distance < bestDistance) {
        bestDistance = distance;
        bestDiff = diff;
        bestTarget = staticPoint;
        bestMovingPointIndex = movingPointIndex as 0 | 1 | 2;
      }
    }
  }

  if (bestTarget === null) return { diff: 0, guide: null };

  return {
    diff: bestDiff,
    guide: bestTarget,
    lock: { target: bestTarget, movingPointIndex: bestMovingPointIndex },
  };
}

function calculateSnap(
  movingBounds: Rect,
  staticBounds: Rect[],
  threshold: number,
  currentLock: MoveSnapLock = {}
): { dx: number; dy: number; guides: AlignmentGuides; lock: MoveSnapLock } {
  const acquireThreshold = Math.max(2, threshold * 0.55);
  const releaseThreshold = acquireThreshold * SNAP_RELEASE_MULTIPLIER;
  const staticXPoints: number[] = [];
  const staticYPoints: number[] = [];

  for (const bounds of staticBounds) {
    staticXPoints.push(bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w);
    staticYPoints.push(bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h);
  }

  const xSnap = resolveAxisSnap(
    [movingBounds.x, movingBounds.x + movingBounds.w / 2, movingBounds.x + movingBounds.w],
    staticXPoints,
    acquireThreshold,
    releaseThreshold,
    currentLock.x
  );
  const ySnap = resolveAxisSnap(
    [movingBounds.y, movingBounds.y + movingBounds.h / 2, movingBounds.y + movingBounds.h],
    staticYPoints,
    acquireThreshold,
    releaseThreshold,
    currentLock.y
  );

  return {
    dx: xSnap.diff,
    dy: ySnap.diff,
    guides: {
      vertical: xSnap.guide === null ? [] : [xSnap.guide],
      horizontal: ySnap.guide === null ? [] : [ySnap.guide],
    },
    lock: { x: xSnap.lock, y: ySnap.lock },
  };
}

function resolveResizeAxisSnap({
  rawEdge,
  rawSize,
  staticEdges,
  staticSizes,
  acquireThreshold,
  releaseThreshold,
  lock,
}: {
  rawEdge: number;
  rawSize: number;
  staticEdges: number[];
  staticSizes: number[];
  acquireThreshold: number;
  releaseThreshold: number;
  lock?: ResizeAxisSnapLock;
}): { mode: ResizeSnapMode | null; diff: number; target: number | null; lock?: ResizeAxisSnapLock } {
  if (lock) {
    const currentValue = lock.mode === "edge" ? rawEdge : rawSize;
    const diff = lock.target - currentValue;

    if (Math.abs(diff) <= releaseThreshold) {
      return { mode: lock.mode, diff, target: lock.target, lock };
    }
  }

  let bestMode: ResizeSnapMode | null = null;
  let bestTarget: number | null = null;
  let bestDiff = 0;
  let bestDistance = acquireThreshold + 1;

  for (const edge of staticEdges) {
    const diff = edge - rawEdge;
    const distance = Math.abs(diff);

    if (distance <= acquireThreshold && distance < bestDistance) {
      bestMode = "edge";
      bestTarget = edge;
      bestDiff = diff;
      bestDistance = distance;
    }
  }

  for (const size of staticSizes) {
    const diff = size - rawSize;
    const distance = Math.abs(diff);

    if (distance <= acquireThreshold && distance < bestDistance) {
      bestMode = "size";
      bestTarget = size;
      bestDiff = diff;
      bestDistance = distance;
    }
  }

  if (bestMode === null || bestTarget === null) {
    return { mode: null, diff: 0, target: null };
  }

  return {
    mode: bestMode,
    diff: bestDiff,
    target: bestTarget,
    lock: { mode: bestMode, target: bestTarget },
  };
}

function snapResizeBox(
  object: CanvasBoxObject,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  staticBounds: Rect[],
  threshold: number,
  currentLock: ResizeSnapLock = {}
): { object: CanvasBoxObject; guides: AlignmentGuides; lock: ResizeSnapLock } {
  let next = resizeBox(object, direction, dx, dy);
  const guides: AlignmentGuides = { vertical: [], horizontal: [] };
  const acquireThreshold = Math.max(2, threshold * 0.55);
  const releaseThreshold = acquireThreshold * SNAP_RELEASE_MULTIPLIER;
  const staticXEdges: number[] = [];
  const staticYEdges: number[] = [];
  const staticWidths: number[] = [];
  const staticHeights: number[] = [];

  for (const bounds of staticBounds) {
    staticXEdges.push(bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w);
    staticYEdges.push(bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h);
    staticWidths.push(bounds.w);
    staticHeights.push(bounds.h);
  }

  let xLock: ResizeAxisSnapLock | undefined;
  let yLock: ResizeAxisSnapLock | undefined;

  const resizingFromLeft = direction.includes("w") && !direction.includes("e");
  const resizingFromRight = direction.includes("e") && !direction.includes("w");
  const resizingFromTop = direction.includes("n") && !direction.includes("s");
  const resizingFromBottom = direction.includes("s") && !direction.includes("n");

  if (resizingFromLeft || resizingFromRight) {
    const rawEdge = resizingFromLeft ? next.x : next.x + next.w;
    const snap = resolveResizeAxisSnap({
      rawEdge,
      rawSize: next.w,
      staticEdges: staticXEdges,
      staticSizes: staticWidths,
      acquireThreshold,
      releaseThreshold,
      lock: currentLock.x,
    });

    xLock = snap.lock;

    if (snap.mode === "edge") {
      if (resizingFromLeft) {
        const anchoredRight = object.x + object.w;
        next = { ...next, x: rawEdge + snap.diff, w: Math.max(32, anchoredRight - (rawEdge + snap.diff)) };
      } else {
        next = { ...next, w: Math.max(32, next.w + snap.diff) };
      }
      if (snap.target !== null) guides.vertical = [snap.target];
    } else if (snap.mode === "size" && snap.target !== null) {
      if (resizingFromLeft) {
        const anchoredRight = object.x + object.w;
        next = { ...next, x: anchoredRight - snap.target, w: snap.target };
      } else {
        next = { ...next, w: snap.target };
      }
      guides.vertical = [next.x, next.x + next.w];
    }
  }

  if (resizingFromTop || resizingFromBottom) {
    const rawEdge = resizingFromTop ? next.y : next.y + next.h;
    const snap = resolveResizeAxisSnap({
      rawEdge,
      rawSize: next.h,
      staticEdges: staticYEdges,
      staticSizes: staticHeights,
      acquireThreshold,
      releaseThreshold,
      lock: currentLock.y,
    });

    yLock = snap.lock;

    if (snap.mode === "edge") {
      if (resizingFromTop) {
        const anchoredBottom = object.y + object.h;
        next = { ...next, y: rawEdge + snap.diff, h: Math.max(32, anchoredBottom - (rawEdge + snap.diff)) };
      } else {
        next = { ...next, h: Math.max(32, next.h + snap.diff) };
      }
      if (snap.target !== null) guides.horizontal = [snap.target];
    } else if (snap.mode === "size" && snap.target !== null) {
      if (resizingFromTop) {
        const anchoredBottom = object.y + object.h;
        next = { ...next, y: anchoredBottom - snap.target, h: snap.target };
      } else {
        next = { ...next, h: snap.target };
      }
      guides.horizontal = [next.y, next.y + next.h];
    }
  }

  return {
    object: next,
    guides,
    lock: { x: xLock, y: yLock },
  };
}

export function NorthStarCanvasWorkspace({
  userEmail,
  initialWorkspaceApps = [],
}: {
  userEmail: string;
  initialWorkspaceApps?: WorkspaceApp[];
}) {
  const supabase = createClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasSessionIdRef = useRef(makeId());
  const chatSessionIdRef = useRef(makeId());
  const northstarTotalArchitectureEnabled =
    process.env.NEXT_PUBLIC_NORTHSTAR_TOTAL_ARCHITECTURE === "true";
  const northstarLedgerFoundationEnabled =
    process.env.NEXT_PUBLIC_NORTHSTAR_LEDGER_FOUNDATION === "true" &&
    !northstarTotalArchitectureEnabled;
  const northstarLedgerFoundationRef = useRef<NorthstarEphemeralLedger | null>(null);
  const northstarLedgerFoundationRunIdRef = useRef<string | null>(null);
  const northstarLedgerDisposalTimerRef = useRef<number | null>(null);
  const northstarProjectionFramesRef = useRef(new Map<string, HTMLIFrameElement>());
  const northstarProjectionTargetArtifactIdRef = useRef<string | null>(null);
  const [northstarProjectionTargetArtifactId, setNorthstarProjectionTargetArtifactId] = useState<string | null>(null);
  const northstarProjectionTargetFrameRef = useRef<HTMLIFrameElement | null>(null);
  const northstarBootstrapArtifactRef = useRef(false);
  const northstarVerifiedCommitSyncRef = useRef<(input: {
    task: NorthstarLedgerTask;
    commit: NorthstarLedgerCommit;
    ledger: NorthstarLedgerSnapshot;
  }) => void | Promise<void>>(() => undefined);
  const [northstarWorkspaceRuntime, setNorthstarWorkspaceRuntime] =
    useState<NorthstarWorkspaceRuntime | null>(null);

  const registerNorthstarProjectionFrame = useCallback<NorthstarArchitectureContextValue["registerProjectionFrame"]>(
    ({ artifactId, frame }) => {
      northstarProjectionFramesRef.current.set(artifactId, frame);
      if (
        northstarProjectionTargetArtifactIdRef.current === artifactId ||
        (!northstarProjectionTargetArtifactIdRef.current && !northstarProjectionTargetFrameRef.current)
      ) {
        northstarProjectionTargetArtifactIdRef.current = artifactId;
        northstarProjectionTargetFrameRef.current = frame;
      }
      return () => {
        const current = northstarProjectionFramesRef.current.get(artifactId);
        if (current !== frame) return;
        northstarProjectionFramesRef.current.delete(artifactId);
        if (northstarProjectionTargetFrameRef.current === frame) {
          northstarProjectionTargetFrameRef.current =
            northstarProjectionFramesRef.current.values().next().value ?? null;
          northstarProjectionTargetArtifactIdRef.current = [...northstarProjectionFramesRef.current.entries()]
            .find(([, candidate]) => candidate === northstarProjectionTargetFrameRef.current)?.[0] ?? null;
        }
      };
    },
    [],
  );

  const northstarArchitectureContext = useMemo<NorthstarArchitectureContextValue>(() => ({
    enabled: northstarTotalArchitectureEnabled,
    directArtifactId: northstarProjectionTargetArtifactId,
    registerProjectionFrame: registerNorthstarProjectionFrame,
  }), [northstarProjectionTargetArtifactId, northstarTotalArchitectureEnabled, registerNorthstarProjectionFrame]);

  useEffect(() => {
    if (!northstarTotalArchitectureEnabled) return;
    const projectionFrames = northstarProjectionFramesRef.current;
    const projectionSurface = createNorthstarWindowProjectionSurface({
      ownerWindow: window,
      getTargetWindow: () => northstarProjectionTargetFrameRef.current?.contentWindow ?? null,
      timeoutMs: 12_000,
    });
    const runtime = createNorthstarWorkspaceRuntime({
      projectionSurface,
      turnClient: createNorthstarTurnClient(),
      onVerifiedArtboardCommit: (commit) => northstarVerifiedCommitSyncRef.current(commit),
    });
    setNorthstarWorkspaceRuntime(runtime);
    return () => {
      setNorthstarWorkspaceRuntime(null);
      runtime.dispose();
      projectionSurface.dispose();
      projectionFrames.clear();
      northstarProjectionTargetFrameRef.current = null;
      northstarProjectionTargetArtifactIdRef.current = null;
      setNorthstarProjectionTargetArtifactId(null);
    };
  }, [northstarTotalArchitectureEnabled]);

  if (northstarLedgerFoundationEnabled && northstarLedgerFoundationRef.current === null) {
    const ledger = createNorthstarEphemeralLedger({
      objective: "Northstar canvas session",
      initialStateSnapshot: {
        phase: "ledger-foundation",
        canvasSessionId: canvasSessionIdRef.current,
      },
    });
    northstarLedgerFoundationRef.current = ledger;
    northstarLedgerFoundationRunIdRef.current = ledger.getSnapshot().run.id;
  }

  useEffect(() => {
    if (northstarLedgerDisposalTimerRef.current !== null) {
      window.clearTimeout(northstarLedgerDisposalTimerRef.current);
      northstarLedgerDisposalTimerRef.current = null;
    }

    return () => {
      const ledger = northstarLedgerFoundationRef.current;
      if (!ledger) return;
      northstarLedgerDisposalTimerRef.current = window.setTimeout(() => {
        if (northstarLedgerFoundationRef.current === ledger) {
          ledger.dispose();
          northstarLedgerFoundationRef.current = null;
          northstarLedgerFoundationRunIdRef.current = null;
        }
        northstarLedgerDisposalTimerRef.current = null;
      }, 0);
    };
  }, []);
  const storageKey = `northstar-canvas:v78:${userEmail}:${canvasSessionIdRef.current}`;
  const objectsRef = useRef<CanvasObject[]>([]);
  const historyPastRef = useRef<CanvasObject[][]>([]);
  const historyFutureRef = useRef<CanvasObject[][]>([]);
  const interactionHistoryCommittedRef = useRef(false);
  const suppressNextObjectClickRef = useRef(false);
  const clipboardObjectsRef = useRef<CanvasObject[]>([]);
  const lastCanvasClientPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: DEFAULT_CANVAS_ZOOM });
  const artifactAutoFollowSuspendedUntilRef = useRef(0);
  const artifactContentSizeSequenceRef = useRef<Map<string, number>>(new Map());
  const marqueeRef = useRef<Rect | null>(null);
  const moveSnapLockRef = useRef<MoveSnapLock>({});
  const resizeSnapLockRef = useRef<ResizeSnapLock>({});
  const pointerMoveFrameRef = useRef<number | null>(null);
  const pendingPointerMoveRef = useRef<PointerMoveFrame | null>(null);
  const aiRunHistoryCommittedRef = useRef<Set<string>>(new Set());
  const aiRunResultIdsRef = useRef<Map<string, Map<string, string[]>>>(new Map());
  const aiRunCreatedIdsRef = useRef<Map<string, string[]>>(new Map());
  const aiRunActionIndexRef = useRef<Map<string, number>>(new Map());

  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [placementTool, setPlacementTool] = useState<BoxTool | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [spacePressed, setSpacePressed] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("chat");
  const [chatExpanded, setChatExpanded] = useState(false);
  const [workspaceApps, setWorkspaceApps] = useState<WorkspaceApp[]>(initialWorkspaceApps);
  const [workspaceAppsLoading, setWorkspaceAppsLoading] = useState(initialWorkspaceApps.length === 0);
  const [workspaceAppsError, setWorkspaceAppsError] = useState<string | null>(null);
  const [selectedWorkspaceAppId, setSelectedWorkspaceAppId] = useState<string | null>(initialWorkspaceApps[0]?.id ?? null);
  const [colorPopover, setColorPopover] = useState<ColorPopoverMode>(null);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [activeConnectorKind, setActiveConnectorKind] = useState<ConnectorKind>("straight");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [aiHighlightedIds, setAiHighlightedIds] = useState<string[]>([]);

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: DEFAULT_CANVAS_ZOOM });
  const [objects, setObjectsState] = useState<CanvasObject[]>([]);
  const setObjects: Dispatch<SetStateAction<CanvasObject[]>> = useCallback((action) => {
    setObjectsState((current) => {
      const candidate = typeof action === "function"
        ? (action as (value: CanvasObject[]) => CanvasObject[])(current)
        : action;
      const normalized = normalizeCanvasScene(candidate);
      objectsRef.current = normalized;
      return normalized;
    });
  }, []);
  const syncVerifiedNorthstarCommit = useCallback((input: {
    task: NorthstarLedgerTask;
    commit: NorthstarLedgerCommit;
    ledger: NorthstarLedgerSnapshot;
  }) => {
    const artifactId = northstarProjectionTargetArtifactIdRef.current;
    if (!artifactId) {
      throw new Error("North Star verified an artboard commit without a bound canvas artifact.");
    }
    const projectionState = parseNorthstarProjectionState(input.commit.stateSnapshot);
    const serialized = serializeNorthstarProjectionState(projectionState);
    const timestamp = new Date().toISOString();
    const completedTaskCount = input.ledger.tasks.filter((task) => task.status === "completed").length;
    let synchronized = false;
    const nextObjects = normalizeCanvasScene(objectsRef.current.map((object) => {
      if (
        !isBoxObject(object)
        || object.type !== "code-artifact"
        || object.codeArtifact?.artifactId !== artifactId
      ) {
        return object;
      }
      synchronized = true;
      const currentArtifact = object.codeArtifact;
      const nextArtifact: CanvasCodeArtifactPayload = {
        ...currentArtifact,
        revisionId: input.commit.hash,
        parentRevisionId: undefined,
        document: {
          ...(currentArtifact.document ?? {
            schema: "northstar.web-artifact-document.v1" as const,
            javascript: "",
          }),
          html: serialized.html,
          css: serialized.css,
        },
        dataBundle: currentArtifact.dataBundle
          ? mergeNorthstarEvidenceIntoDataBundle(currentArtifact.dataBundle, input.ledger)
          : currentArtifact.dataBundle,
        mutationJournal: [],
        pendingAckToken: undefined,
        pendingProposal: undefined,
        headCommitHash: undefined,
        commitSequence: undefined,
        headCommit: undefined,
        repositoryStatus: undefined,
        surfaceSessionId: undefined,
        runtimeUrl: undefined,
        updatedAt: timestamp,
        buildState: {
          phase: "complete",
          completedSteps: completedTaskCount,
          totalSteps: Math.max(completedTaskCount, currentArtifact.buildState?.totalSteps ?? completedTaskCount),
          message: input.task.intent,
          isBuilding: false,
        },
        status: "ready",
        publicationState: "working",
      };
      return { ...object, codeArtifact: nextArtifact, text: nextArtifact.title };
    }));
    if (!synchronized) {
      throw new Error(`The projected canvas artifact ${artifactId} is no longer available.`);
    }
    // Update the normal canvas model synchronously before the runtime may ask
    // the model for another activity; React rendering follows from the same array.
    objectsRef.current = nextObjects;
    setObjectsState(nextObjects);
  }, []);

  useEffect(() => {
    northstarVerifiedCommitSyncRef.current = syncVerifiedNorthstarCommit;
  }, [syncVerifiedNorthstarCommit]);
  const [draftConnector, setDraftConnector] = useState<DraftConnector | null>(null);
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null);
  const [ghostPoint, setGhostPoint] = useState<{ x: number; y: number } | null>(null);
  const [shapePaletteDrag, setShapePaletteDrag] = useState<ShapePaletteDrag | null>(null);
  const [workspaceScreenDrag, setWorkspaceScreenDrag] = useState<WorkspaceScreenDrag | null>(null);
  const [chatCanvasAssetDrag, setChatCanvasAssetDrag] = useState<ChatCanvasAssetDrag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({ vertical: [], horizontal: [] });
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingCaretClientPoint, setEditingCaretClientPoint] = useState<{ x: number; y: number } | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const userInitial = userEmail.charAt(0).toUpperCase();
  const userName = userEmail.split("@")[0];

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedObjects = useMemo(
    () => objects.filter((object) => selectedIdSet.has(object.id)),
    [objects, selectedIdSet]
  );

  const aiHighlightedIdSet = useMemo(() => new Set(aiHighlightedIds), [aiHighlightedIds]);

  const aiHighlightedObjects = useMemo(
    () => objects.filter((object) => aiHighlightedIdSet.has(object.id)),
    [objects, aiHighlightedIdSet]
  );

  const selectedBounds = useMemo(
    () => getBoundsForObjects(selectedObjects),
    [selectedObjects]
  );

  // Canvas context is intentionally deferred. It stays current after interactions
  // settle without forcing the full AI context graph to rebuild on every drag frame.
  const deferredObjects = useDeferredValue(objects);
  const deferredSelectedIds = useDeferredValue(selectedIds);
  const deferredViewport = useDeferredValue(viewport);

  const canvasContext = useMemo(
    () => buildCanvasContext({
      objects: deferredObjects,
      selectedIds: deferredSelectedIds,
      viewport: deferredViewport,
      title: "Untitled canvas",
    }),
    [deferredObjects, deferredSelectedIds, deferredViewport]
  );

  const selectedCanvasContext = useMemo(
    () => buildSelectedCanvasContext(canvasContext, deferredObjects),
    [canvasContext, deferredObjects]
  );

  const renderObjects = useMemo(() => {
    const stableObjects = dedupeCanvasObjectsById(objects);
    if (stableObjects.length < OBJECT_CULLING_THRESHOLD) return stableObjects;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return stableObjects;

    const padding = OBJECT_CULLING_PADDING_SCREEN / viewport.zoom;
    const visibleBounds: Rect = {
      x: -viewport.x / viewport.zoom - padding,
      y: -viewport.y / viewport.zoom - padding,
      w: rect.width / viewport.zoom + padding * 2,
      h: rect.height / viewport.zoom + padding * 2,
    };

    return stableObjects.filter(
      (object) => selectedIdSet.has(object.id) || rectsIntersect(visibleBounds, getObjectBounds(object))
    );
  }, [objects, selectedIdSet, viewport.x, viewport.y, viewport.zoom]);

  const fitViewportToObjects = useCallback((targetObjects: CanvasObject[]) => {
    const bounds = getBoundsForObjects(targetObjects);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!bounds || !canvasRect || bounds.w <= 0 || bounds.h <= 0) return;

    const workspaceInset = workspaceOpen ? 520 : 0;
    const padding = 112;
    const availableWidth = Math.max(320, canvasRect.width - workspaceInset - padding * 2);
    const availableHeight = Math.max(240, canvasRect.height - padding * 2);
    const nextZoom = clampZoom(Math.min(availableWidth / bounds.w, availableHeight / bounds.h, 1.35));
    const visibleCenterX = workspaceInset + availableWidth / 2 + padding;
    const visibleCenterY = canvasRect.height / 2;

    setViewport({
      x: visibleCenterX - (bounds.x + bounds.w / 2) * nextZoom,
      y: visibleCenterY - (bounds.y + bounds.h / 2) * nextZoom,
      zoom: nextZoom,
    });
  }, [workspaceOpen]);

  const centerViewportOnObjects = useCallback((targetObjects: CanvasObject[]) => {
    const bounds = getBoundsForObjects(targetObjects);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!bounds || !canvasRect || bounds.w <= 0 || bounds.h <= 0) return;

    const workspaceInset = workspaceOpen ? 520 : 0;
    const visibleWidth = Math.max(1, canvasRect.width - workspaceInset);
    const visibleCenterX = workspaceInset + visibleWidth / 2;
    const visibleCenterY = canvasRect.height / 2;

    setViewport((current) => ({
      x: visibleCenterX - (bounds.x + bounds.w / 2) * current.zoom,
      y: visibleCenterY - (bounds.y + bounds.h / 2) * current.zoom,
      zoom: current.zoom,
    }));
  }, [workspaceOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaceApps = async () => {
      if (initialWorkspaceApps.length > 0) {
        setWorkspaceApps(initialWorkspaceApps);
        setSelectedWorkspaceAppId((current) => current ?? initialWorkspaceApps[0]?.id ?? null);
        setWorkspaceAppsLoading(false);
        setWorkspaceAppsError(null);
        return;
      }

      setWorkspaceAppsLoading(true);
      setWorkspaceAppsError(null);

      try {
        const tenantId = await getNorthStarTenantId(supabase);
        if (!tenantId) {
          setWorkspaceApps([]);
          setSelectedWorkspaceAppId(null);
          setWorkspaceAppsError("Could not resolve your North Star account workspace yet.");
          return;
        }

        const { data: appRows, error: appError } = await supabase
          .from("target_apps")
          .select(`
            tenant_id,
            app_name,
            category,
            icon_url,
            rank,
            revenue,
            employees,
            app_sessions (
              app_name,
              platform,
              session_type,
              ux_grade,
              total_screens,
              session_intel,
              steps_data,
              flows_data
            )
          `)
          .eq("tenant_id", tenantId)
          .order("app_name", { ascending: true });

        if (appError) throw appError;

        const nextApps = normalizeWorkspaceApps((appRows ?? []) as UnknownRecord[]);
        if (cancelled) return;

        setWorkspaceApps(nextApps);
        setSelectedWorkspaceAppId((current) => (current && nextApps.some((app) => app.id === current) ? current : nextApps[0]?.id ?? null));
      } catch (error) {
        if (!cancelled) {
          console.warn("North Star workspace apps could not be loaded.", error);
          setWorkspaceAppsError("Could not load apps yet.");
        }
      } finally {
        if (!cancelled) setWorkspaceAppsLoading(false);
      }
    };

    void loadWorkspaceApps();

    return () => {
      cancelled = true;
    };
    // Load once for this canvas session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    marqueeRef.current = marquee;
  }, [marquee]);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains("dark"));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  // Prototype sessions intentionally begin clean after a full page refresh.
  // The live React state still survives workspace tab changes and panel minimization.
  useEffect(() => {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("northstar-canvas:")) window.localStorage.removeItem(key);
      }

      for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith("northstar-chat:")) window.sessionStorage.removeItem(key);
      }
    } catch {
      // Storage cleanup is best effort and must never block the canvas.
    }
  }, []);

  const resetTransientEditingState = useCallback(() => {
    setEditingTextId(null);
    setEditingCaretClientPoint(null);
    setEditingCell(null);
    setColorPopover(null);
    setDraftConnector(null);
    setDraftBox(null);
    setGhostPoint(null);
    setMarquee(null);
    setAlignmentGuides({ vertical: [], horizontal: [] });
    setContextMenu(null);
    moveSnapLockRef.current = {};
    resizeSnapLockRef.current = {};
    pendingPointerMoveRef.current = null;
    if (pointerMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerMoveFrameRef.current);
      pointerMoveFrameRef.current = null;
    }
    setInteraction(null);
  }, []);

  const normalizeAIReferenceIds = useCallback((objectIds: string[]) => {
    const availableIds = new Set(objectsRef.current.map((object) => object.id));
    return Array.from(new Set(objectIds)).filter((id) => availableIds.has(id));
  }, []);

  const highlightAIReference = useCallback((objectIds: string[]) => {
    setAiHighlightedIds(normalizeAIReferenceIds(objectIds));
  }, [normalizeAIReferenceIds]);

  const clearAIReferenceHighlight = useCallback(() => {
    setAiHighlightedIds([]);
  }, []);

  const focusAIReference = useCallback((objectIds: string[]) => {
    const validIds = normalizeAIReferenceIds(objectIds);
    if (validIds.length === 0) return;
    const targetObjects = objectsRef.current.filter((object) => validIds.includes(object.id));
    resetTransientEditingState();
    setSelectedIds(validIds);
    setAiHighlightedIds(validIds);
    centerViewportOnObjects(targetObjects);
  }, [centerViewportOnObjects, normalizeAIReferenceIds, resetTransientEditingState]);

  const commitHistorySnapshot = useCallback((snapshot?: CanvasObject[]) => {
    const source = snapshot ?? objectsRef.current;
    if (source.length === 0 && historyPastRef.current.length === 0) return;

    const lastSnapshot = historyPastRef.current[historyPastRef.current.length - 1];
    if (lastSnapshot && canvasObjectsHistorySignature(lastSnapshot) === canvasObjectsHistorySignature(source)) return;

    const nextSnapshot = cloneCanvasObjects(source);
    const historyLimit = source.length > 320 ? 20 : 60;
    historyPastRef.current = [...historyPastRef.current, nextSnapshot].slice(-historyLimit);
    historyFutureRef.current = [];
  }, []);

  const commitInteractionHistory = useCallback(() => {
    if (interactionHistoryCommittedRef.current) return;
    commitHistorySnapshot();
    interactionHistoryCommittedRef.current = true;
  }, [commitHistorySnapshot]);

  const undoCanvasChange = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    historyFutureRef.current = [cloneCanvasObjects(objectsRef.current), ...historyFutureRef.current].slice(0, 60);
    const restored = resolveConnectorBindings(cloneCanvasObjects(previous));
    objectsRef.current = restored;
    setObjects(restored);
    setSelectedIds([]);
    resetTransientEditingState();
  }, [resetTransientEditingState]);

  const redoCanvasChange = useCallback(() => {
    const next = historyFutureRef.current.shift();
    if (!next) return;

    historyPastRef.current = [...historyPastRef.current, cloneCanvasObjects(objectsRef.current)].slice(-60);
    const restored = resolveConnectorBindings(cloneCanvasObjects(next));
    objectsRef.current = restored;
    setObjects(restored);
    setSelectedIds([]);
    resetTransientEditingState();
  }, [resetTransientEditingState]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    const currentViewport = viewportRef.current;

    return {
      x: (clientX - rect.left - currentViewport.x) / currentViewport.zoom,
      y: (clientY - rect.top - currentViewport.y) / currentViewport.zoom,
    };
  }, []);

  const copySelectedObjects = useCallback(() => {
    if (selectedIds.length === 0) return;

    const expandedIds = expandIdsWithSemanticDescendants(objectsRef.current, selectedIds);
    const copiedObjects = cloneCanvasObjects(getSelectionClipboardObjects(objectsRef.current, expandedIds));
    clipboardObjectsRef.current = copiedObjects;

    const serialized = serializeCanvasClipboardObjects(copiedObjects);
    void navigator.clipboard?.writeText?.(serialized).catch((error) => {
      // The in-memory clipboard still works when browser clipboard writes are blocked.
      console.warn("Could not write North Star canvas objects to system clipboard.", error);
    });
  }, [selectedIds]);

  const pasteSelectedObjects = useCallback(() => {
    if (clipboardObjectsRef.current.length === 0) return;

    const targetPoint = lastCanvasClientPointRef.current
      ? screenToWorld(lastCanvasClientPointRef.current.x, lastCanvasClientPointRef.current.y)
      : null;

    commitHistorySnapshot();
    const pasted = duplicateCanvasObjectsAtPoint(clipboardObjectsRef.current, targetPoint, 44);
    setObjects((prev) => resolveConnectorBindings([...prev, ...pasted]));
    setSelectedIds(pasted.map((object) => object.id));
    resetTransientEditingState();
  }, [commitHistorySnapshot, resetTransientEditingState, screenToWorld]);

  useEffect(() => {
    setColorPopover(null);
  }, [selectedIds.join("|")]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverscroll = html.style.overscrollBehavior;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousHtmlTouchAction = html.style.touchAction;
    const previousBodyTouchAction = body.style.touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    html.style.touchAction = "none";
    body.style.touchAction = "none";

    const preventGesture = (event: Event) => event.preventDefault();

    window.addEventListener("gesturestart", preventGesture, { passive: false } as AddEventListenerOptions);
    window.addEventListener("gesturechange", preventGesture, { passive: false } as AddEventListenerOptions);
    window.addEventListener("gestureend", preventGesture, { passive: false } as AddEventListenerOptions);

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      body.style.overscrollBehavior = previousBodyOverscroll;
      html.style.touchAction = previousHtmlTouchAction;
      body.style.touchAction = previousBodyTouchAction;

      window.removeEventListener("gesturestart", preventGesture);
      window.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("gestureend", preventGesture);
    };
  }, []);

  const gridStyle = useMemo(() => {
    const gridSize = 24 * viewport.zoom;

    return {
      backgroundImage:
        "radial-gradient(circle, rgba(91, 87, 255, 0.18) 1px, transparent 1px)",
      backgroundSize: `${gridSize}px ${gridSize}px`,
      backgroundPosition: `${viewport.x}px ${viewport.y}px`,
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  const patchObject = useCallback(
    (id: string, patch: Partial<CanvasBoxObject> | Partial<CanvasConnectorObject>) => {
      setObjects((prev) => {
        const next = resolveConnectorBindings(
          prev.map((obj) =>
            obj.id === id ? ({ ...obj, ...patch } as CanvasObject) : obj
          )
        );
        objectsRef.current = next;
        return next;
      });
    },
    []
  );

  const updateBoxText = useCallback(
    (object: CanvasBoxObject, text: string, textHtml?: string) => {
      const cleanHtml = textHtml === undefined ? object.textHtml : sanitizeRichTextHtml(textHtml);

      if (object.type !== "text") {
        patchObject(object.id, { text, textHtml: cleanHtml });
        return;
      }

      const nextBounds = getTextBoundsAfterEdit(object, text, object.style);

      patchObject(object.id, {
        text,
        textHtml: cleanHtml,
        w: nextBounds.w,
        h: nextBounds.h,
      });
    },
    [patchObject]
  );

  const patchSelectedStyles = useCallback(
    (patch: Partial<CanvasObjectStyle>) => {
      commitHistorySnapshot();
      setObjects((prev) =>
        prev.map((object) => {
          if (!selectedIds.includes(object.id)) return object;

          if (isConnectorObject(object)) {
            return {
              ...object,
              style: {
                ...object.style,
                stroke: patch.stroke ?? patch.fill ?? object.style.stroke,
                strokeWidth: patch.strokeWidth ?? object.style.strokeWidth,
              },
            };
          }

          return {
            ...object,
            style: { ...object.style, ...patch },
          };
        })
      );
    },
    [commitHistorySnapshot, selectedIds]
  );


  const applyTextColor = useCallback(
    (textColor: string) => {
      commitHistorySnapshot();
      if (editingTextId && typeof document !== "undefined") {
        const editor = document.querySelector(`[data-rich-text-editor-id="${editingTextId}"]`) as HTMLElement | null;

        if (editor && isTextSelectionInside(editor)) {
          document.execCommand("foreColor", false, textColor);
          const nextHtml = sanitizeRichTextHtml(editor.innerHTML);
          const nextText = plainTextFromHtml(nextHtml);

          setObjects((prev) =>
            prev.map((object) => {
              if (object.id !== editingTextId || !isBoxObject(object)) return object;

              if (object.type !== "text") {
                return { ...object, text: nextText, textHtml: nextHtml };
              }

              const nextBounds = getTextBoundsAfterEdit(object, nextText, object.style);
              return {
                ...object,
                text: nextText,
                textHtml: nextHtml,
                w: nextBounds.w,
                h: nextBounds.h,
              };
            })
          );

          return;
        }
      }

      patchSelectedStyles({ textColor });
    },
    [commitHistorySnapshot, editingTextId, patchSelectedStyles]
  );

  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;

    const expandedIds = expandIdsWithSemanticDescendants(objectsRef.current, selectedIds);
    const selected = getSelectionClipboardObjects(objectsRef.current, expandedIds);
    if (selected.length === 0) return;

    commitHistorySnapshot();
    const duplicated = duplicateCanvasObjects(selected, 32);

    setObjects((prev) => resolveConnectorBindings([...prev, ...duplicated]));
    setSelectedIds(duplicated.map((object) => object.id));
    resetTransientEditingState();
  }, [commitHistorySnapshot, resetTransientEditingState, selectedIds]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;

    const expandedIds = expandIdsWithSemanticDescendants(objectsRef.current, selectedIds);
    commitHistorySnapshot();
    setObjects((prev) => resolveConnectorBindings(prev.filter((object) => !expandedIds.includes(object.id))));
    setSelectedIds([]);
    setContextMenu(null);
  }, [commitHistorySnapshot, selectedIds]);

  const reorderSelectedLayer = useCallback(
    (direction: LayerDirection) => {
      if (selectedIds.length === 0) return;

      commitHistorySnapshot();
      setObjects((prev) => resolveConnectorBindings(reorderCanvasObjectsByLayer(prev, selectedIds, direction)));
      setContextMenu(null);
      setColorPopover(null);
    },
    [commitHistorySnapshot, selectedIds]
  );

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      const ids = expandIdsWithSemanticDescendants(objectsRef.current, selectedIdsRef.current);
      if (ids.length === 0) return;

      commitHistorySnapshot();
      setObjects((prev) =>
        resolveConnectorBindings(
          prev.map((object) => {
            if (!ids.includes(object.id)) return object;

            if (isConnectorObject(object)) {
              return {
                ...object,
                startBinding: undefined,
                endBinding: undefined,
                x1: object.x1 + dx,
                y1: object.y1 + dy,
                x2: object.x2 + dx,
                y2: object.y2 + dy,
                controlX: object.controlX === undefined ? undefined : object.controlX + dx,
                controlY: object.controlY === undefined ? undefined : object.controlY + dy,
              };
            }

            return { ...object, x: object.x + dx, y: object.y + dy };
          })
        )
      );
      setContextMenu(null);
      setColorPopover(null);
    },
    [commitHistorySnapshot]
  );

  const openObjectContextMenu = useCallback(
    (object: CanvasObject, event: ReactMouseEvent<Element>) => {
      event.preventDefault();
      event.stopPropagation();

      const currentSelectedIds = selectedIdsRef.current;
      const alreadySelected = currentSelectedIds.includes(object.id);
      const nextSelectedIds = alreadySelected ? currentSelectedIds : [object.id];

      setSelectedIds(nextSelectedIds);
      setContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        targetIds: nextSelectedIds,
      });
      setPlacementTool(null);
      setActiveTool("select");
      setEditingTextId(null);
      setEditingCaretClientPoint(null);
      setEditingCell(null);
      setColorPopover(null);
    },
    []
  );

  const addBoxObject = useCallback(
    (tool: BoxTool, clientX?: number, clientY?: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const worldPoint =
        clientX !== undefined && clientY !== undefined
          ? screenToWorld(clientX, clientY)
          : screenToWorld(
              (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
              (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
            );

      const newObject = createBoxObject(tool, worldPoint);

      commitHistorySnapshot();
      setObjects((prev) => [...prev, newObject]);
      setSelectedIds([newObject.id]);
      setActiveTool("select");
      setPlacementTool(null);
      setColorPopover(null);
    },
    [commitHistorySnapshot, screenToWorld]
  );

  const addImageFile = useCallback(
    async (file: File, clientPoint?: { x: number; y: number }, sourceKind: "uploaded-image" | "pasted-image" = "uploaded-image") => {
      if (!file.type.startsWith("image/")) return;

      const dataUrl = await readFileAsDataUrl(file);
      const rect = canvasRef.current?.getBoundingClientRect();
      const worldPoint = clientPoint
        ? screenToWorld(clientPoint.x, clientPoint.y)
        : screenToWorld(
            (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
            (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
          );

      const baseImageObject = createBoxObject("image", worldPoint);
      const imageStorageKey = makeCanvasImageStorageKey(storageKey, baseImageObject.id);

      try {
        await saveCanvasImageAsset(imageStorageKey, dataUrl);
      } catch (error) {
        console.warn("North Star canvas image could not be saved to IndexedDB.", error);
      }

      const imageObject: CanvasBoxObject = {
        ...baseImageObject,
        text: file.name || "Image",
        imageUrl: dataUrl,
        imageStorageKey,
        source: {
          kind: sourceKind,
          fileName: file.name || undefined,
        },
        semantic: {
          role: "user-content",
          label: file.name || "Image",
        },
      };

      commitHistorySnapshot();
      setObjects((prev) => [...prev, imageObject]);
      setSelectedIds([imageObject.id]);
      setActiveTool("select");
      setPlacementTool(null);
      setColorPopover(null);
    },
    [commitHistorySnapshot, screenToWorld, storageKey]
  );

  const addTextFromClipboard = useCallback(
    (rawText: string, clientPoint?: { x: number; y: number }) => {
      const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[\t ]+$/gm, "").trimEnd();
      if (!text.trim()) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      const fallbackClientPoint = lastCanvasClientPointRef.current;
      const worldPoint = clientPoint
        ? screenToWorld(clientPoint.x, clientPoint.y)
        : fallbackClientPoint
          ? screenToWorld(fallbackClientPoint.x, fallbackClientPoint.y)
          : screenToWorld(
              (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
              (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
            );

      const isLongText = text.length > 180 || text.includes("\n");
      const style: CanvasObjectStyle = {
        ...getDefaultStyle("text"),
        fill: "transparent",
        stroke: "transparent",
        strokeWidth: 0,
        textColor: "#18181B",
        fontSize: isLongText ? 18 : 28,
        fontWeight: isLongText ? 560 : 720,
        textAlign: "left",
      };
      const bounds = getPastedTextBounds(text, style);
      const textObject = createBoxObject("text", {
        x: worldPoint.x - bounds.w / 2,
        y: worldPoint.y - bounds.h / 2,
        w: bounds.w,
        h: bounds.h,
      });

      const firstLine = text.split("\n").find((line) => line.trim())?.trim() || "Pasted text";
      const pastedTextObject: CanvasBoxObject = {
        ...textObject,
        text,
        textHtml: htmlFromPlainText(text),
        style,
        source: {
          kind: "pasted-text",
        },
        semantic: {
          role: "user-content",
          label: firstLine.slice(0, 96),
        },
      };

      commitHistorySnapshot();
      setObjects((prev) => [...prev, pastedTextObject]);
      setSelectedIds([pastedTextObject.id]);
      setActiveTool("select");
      setPlacementTool(null);
      setColorPopover(null);
      setContextMenu(null);
      setEditingTextId(null);
      setEditingCaretClientPoint(null);
      setEditingCell(null);
    },
    [commitHistorySnapshot, screenToWorld]
  );

  const pasteExternalClipboardOrCanvasObjects = useCallback(async () => {
    if (editingTextId || editingCell || isTypingTarget(document.activeElement)) return;

    try {
      if (navigator.clipboard?.read) {
        const clipboardItems = await navigator.clipboard.read();

        for (const item of clipboardItems) {
          const imageType = item.types.find((type) => type.startsWith("image/"));
          if (!imageType) continue;

          const blob = await item.getType(imageType);
          const file = new File([blob], "Pasted image", { type: blob.type || imageType });
          await addImageFile(file, lastCanvasClientPointRef.current ?? undefined, "pasted-image");
          return;
        }
      }
    } catch {
      // Browser clipboard image reads are permission and browser dependent.
    }

    try {
      const text = await navigator.clipboard?.readText?.();
      if (text && text.trim()) {
        const internalObjects = parseCanvasClipboardObjects(text);

        if (internalObjects?.length) {
          clipboardObjectsRef.current = internalObjects;
          pasteSelectedObjects();
          return;
        }

        addTextFromClipboard(text, lastCanvasClientPointRef.current ?? undefined);
        return;
      }
    } catch {
      // Native paste event below still handles normal text paste when available.
    }

    pasteSelectedObjects();
  }, [addImageFile, addTextFromClipboard, editingCell, editingTextId, pasteSelectedObjects]);


  const insertWorkspaceAppIcon = useCallback(
    (
      app: WorkspaceApp,
      clientPoint?: { x: number; y: number },
      options?: CanvasInsertOptions
    ) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = options?.worldPoint ?? (clientPoint
        ? screenToWorld(clientPoint.x, clientPoint.y)
        : screenToWorld(
            (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
            (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
          ));
      const size = 180;
      const base = createBoxObject(app.logoUrl ? "image" : "card", {
        x: center.x - size / 2,
        y: center.y - size / 2,
        w: size,
        h: size,
      });
      const object: CanvasBoxObject = app.logoUrl
        ? {
            ...base,
            type: "image",
            text: "",
            imageUrl: app.logoUrl,
            source: {
              kind: "northstar-flow",
              appName: app.name,
              appIconUrl: app.logoUrl,
            },
            semantic: {
              role: "flow-app-icon",
              label: `${app.name} app icon`,
            },
            style: {
              ...base.style,
              fill: "transparent",
              stroke: "transparent",
              strokeWidth: 0,
            },
          }
        : {
            ...base,
            type: "card",
            text: app.name.slice(0, 1).toUpperCase(),
            textHtml: htmlFromPlainText(app.name.slice(0, 1).toUpperCase()),
            source: {
              kind: "northstar-flow",
              appName: app.name,
            },
            semantic: {
              role: "flow-app-icon",
              label: `${app.name} app icon`,
            },
            style: {
              ...base.style,
              fill: "rgba(17,17,17,0.92)",
              stroke: "rgba(255,255,255,0.5)",
              strokeWidth: 1,
              textColor: "#FFFFFF",
              fontSize: 68,
              fontWeight: 900,
              textAlign: "center",
            },
          };

      if (!options?.skipHistory) commitHistorySnapshot();
      setObjects((prev) => {
        const next = [...prev, object];
        objectsRef.current = next;
        return next;
      });
      if (options?.select !== false) setSelectedIds([object.id]);
      setActiveTool("select");
      setPlacementTool(null);
      setColorPopover(null);
      return [object.id];
    },
    [commitHistorySnapshot, screenToWorld]
  );

  const insertChatImage = useCallback(
    (name: string, imageUrl: string, clientPoint?: { x: number; y: number }) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = clientPoint
        ? screenToWorld(clientPoint.x, clientPoint.y)
        : screenToWorld(
            (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
            (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
          );
      const image = createBoxObject("image", {
        x: center.x - 210,
        y: center.y - 158,
        w: 420,
        h: 316,
      });
      const object: CanvasBoxObject = {
        ...image,
        text: "",
        imageUrl,
        source: {
          kind: "pasted-image",
          fileName: name,
        },
        semantic: {
          role: "user-content",
          label: name || "Chat image",
        },
        style: {
          ...image.style,
          fill: "#FFFFFF",
          stroke: "rgba(0,0,0,0.10)",
          strokeWidth: 0.6,
        },
      };

      commitHistorySnapshot();
      setObjects((prev) => [...prev, object]);
      setSelectedIds([object.id]);
      setActiveTool("select");
      setPlacementTool(null);
      setColorPopover(null);
    },
    [commitHistorySnapshot, screenToWorld]
  );

  const insertWorkspaceFlow = useCallback(
    (
      app: WorkspaceApp,
      flow: WorkspaceAppFlow,
      clientPoint?: { x: number; y: number },
      options?: CanvasInsertOptions
    ) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = options?.worldPoint ?? (clientPoint
        ? screenToWorld(clientPoint.x, clientPoint.y)
        : screenToWorld(
            (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
            (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
          ));
      const visibleScreens = flow.screens.filter((screen) => screen.imageUrl).slice(0, 14);
      const createdObjects: CanvasObject[] = [];
      const artifactId = makeFlowArtifactId(app, flow);
      const flowType = detectWorkspaceFlowType(flow);

      const gap = 34;
      const headerGap = 44;
      const iconSize = 150;
      const screenSizes = visibleScreens.map((screen) => {
        if (isWorkspaceScreenWeb(screen)) return { w: 460, h: 288 };
        return { w: 240, h: 520 };
      });
      const screenshotH = Math.max(520, ...screenSizes.map((size) => size.h));
      const rowH = Math.max(560, screenshotH);
      const appNameW = Math.max(260, Math.ceil(app.name.length * 32));
      const flowNameW = Math.max(620, Math.ceil(flow.name.length * 22));
      const textXOffset = iconSize + 48;
      const headerW = textXOffset + Math.max(appNameW, flowNameW) + 56;
      const screenshotsW =
        screenSizes.reduce((sum, size) => sum + size.w, 0) +
        Math.max(0, visibleScreens.length - 1) * gap;
      const totalW = headerW + (visibleScreens.length > 0 ? headerGap + screenshotsW : 380);
      const startX = center.x - totalW / 2;
      const startY = center.y - rowH / 2;
      const centerY = startY + rowH / 2;
      const textX = startX + textXOffset;

      if (app.logoUrl) {
        const appIcon = createBoxObject("image", {
          x: startX,
          y: centerY - iconSize / 2,
          w: iconSize,
          h: iconSize,
        });

        createdObjects.push({
          ...appIcon,
          text: `${app.name} icon`,
          imageUrl: app.logoUrl,
          source: {
            kind: "northstar-flow",
            appName: app.name,
            appIconUrl: app.logoUrl,
            flowName: flow.name,
            flowType,
          },
          semantic: {
            artifactId,
            role: "flow-app-icon",
            label: `${app.name} app icon`,
          },
          style: {
            ...appIcon.style,
            fill: "transparent",
            stroke: "transparent",
            strokeWidth: 0,
          },
        });
      } else {
        const fallbackIcon = createBoxObject("card", {
          x: startX,
          y: centerY - iconSize / 2,
          w: iconSize,
          h: iconSize,
        });

        createdObjects.push({
          ...fallbackIcon,
          text: app.name.charAt(0).toUpperCase(),
          textHtml: htmlFromPlainText(app.name.charAt(0).toUpperCase()),
          source: {
            kind: "northstar-flow",
            appName: app.name,
            appIconUrl: app.logoUrl,
            flowName: flow.name,
            flowType,
          },
          semantic: {
            artifactId,
            role: "flow-app-icon",
            label: `${app.name} app icon`,
          },
          style: {
            ...fallbackIcon.style,
            fill: "rgba(17,17,17,0.92)",
            stroke: "rgba(255,255,255,0.5)",
            strokeWidth: 1,
            textColor: "#FFFFFF",
            fontSize: 64,
            fontWeight: 900,
            textAlign: "center",
          },
        });
      }

      const appNameText = createBoxObject("text", {
        x: textX,
        y: centerY - 72,
        w: appNameW,
        h: 60,
      });

      createdObjects.push({
        ...appNameText,
        text: app.name,
        textHtml: htmlFromPlainText(app.name),
        source: {
          kind: "northstar-flow",
          appName: app.name,
          appIconUrl: app.logoUrl,
          flowName: flow.name,
          flowType,
        },
        semantic: {
          artifactId,
          role: "flow-app-name",
          label: app.name,
        },
        style: {
          ...appNameText.style,
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
          textColor: "#111827",
          fontSize: 46,
          fontWeight: 900,
          textAlign: "left",
        },
      });

      const flowNameText = createBoxObject("text", {
        x: textX,
        y: centerY - 12,
        w: flowNameW,
        h: 48,
      });

      createdObjects.push({
        ...flowNameText,
        text: flow.name,
        textHtml: htmlFromPlainText(flow.name),
        source: {
          kind: "northstar-flow",
          appName: app.name,
          appIconUrl: app.logoUrl,
          flowName: flow.name,
          flowType,
        },
        semantic: {
          artifactId,
          role: "flow-title",
          label: flow.name,
        },
        style: {
          ...flowNameText.style,
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
          textColor: "#111827",
          fontSize: 34,
          fontWeight: 850,
          textAlign: "left",
        },
      });

      if (visibleScreens.length > 0) {
        let cursorX = startX + headerW + headerGap;

        visibleScreens.forEach((screen, index) => {
          const size = screenSizes[index] ?? getWorkspaceFlowStoryboardScreenCanvasSize(screen);
          const image = createBoxObject("image", {
            x: cursorX,
            y: centerY - size.h / 2,
            w: size.w,
            h: size.h,
          });

          createdObjects.push({
            ...image,
            text: "",
            imageUrl: screen.imageUrl,
            source: {
              kind: "northstar-screenshot",
              appName: app.name,
              appIconUrl: app.logoUrl,
              flowName: flow.name,
              flowType,
              screenLabel: screen.name,
              screenshotUrl: screen.imageUrl,
              screenshotFile: screen.sourceUrl,
              stepIndex: index,
              originalWidth: size.w,
              originalHeight: size.h,
            },
            semantic: {
              artifactId,
              role: "flow-screen",
              label: screen.name,
            },
            style: {
              ...image.style,
              fill: "#FFFFFF",
              stroke: "rgba(129,138,152,0.52)",
              strokeWidth: 0.6,
            },
          });

          cursorX += size.w + gap;
        });
      } else {
        const note = createBoxObject("card", {
          x: startX + headerW + 54,
          y: centerY - 90,
        });
        createdObjects.push({
          ...note,
          w: 330,
          h: 180,
          text: "No captured screens found for this flow yet.",
          textHtml: htmlFromPlainText("No captured screens found for this flow yet."),
          source: {
            kind: "northstar-flow",
            appName: app.name,
            appIconUrl: app.logoUrl,
            flowName: flow.name,
            flowType,
          },
          semantic: {
            artifactId,
            role: "user-content",
            label: "Empty flow note",
          },
          style: {
            ...note.style,
            fill: "rgba(255,255,255,0.74)",
            stroke: "rgba(107,92,255,0.24)",
          },
        });
      }

      if (!options?.skipHistory) commitHistorySnapshot();
      setObjects((prev) => {
        const next = [...prev, ...createdObjects];
        objectsRef.current = next;
        return next;
      });
      if (options?.select !== false) {
        setSelectedIds(createdObjects.map((object) => object.id));
      }
      setActiveTool("select");
      setPlacementTool(null);
      setColorPopover(null);
      return createdObjects.map((object) => object.id);
    },
    [commitHistorySnapshot, screenToWorld]
  );


  const insertWorkspaceScreen = useCallback(
    (
      app: WorkspaceApp,
      flow: WorkspaceAppFlow,
      screen: WorkspaceAppScreen,
      clientPoint?: { x: number; y: number },
      options?: CanvasInsertOptions
    ) => {
      if (!screen.imageUrl) return [] as string[];

      const rect = canvasRef.current?.getBoundingClientRect();
      const center = options?.worldPoint ?? (clientPoint
        ? screenToWorld(clientPoint.x, clientPoint.y)
        : screenToWorld(
            (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
            (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
          ));
      const isWeb = isWorkspaceScreenWeb(screen);
      const imageW = isWeb ? 420 : 260;
      const imageH = isWeb ? 262 : 563;
      const image = createBoxObject("image", {
        x: center.x - imageW / 2,
        y: center.y - imageH / 2,
        w: imageW,
        h: imageH,
      });
      const imageObject: CanvasBoxObject = {
        ...image,
        text: screen.name,
        imageUrl: screen.imageUrl,
        style: { ...image.style, stroke: "rgba(0,0,0,0.10)", strokeWidth: 1 },
        source: {
          kind: "northstar-screenshot",
          appName: app.name,
          appIconUrl: app.logoUrl,
          flowName: flow.name,
          flowType: detectWorkspaceFlowType(flow),
          screenLabel: screen.name,
          screenshotUrl: screen.imageUrl,
          screenshotFile: screen.sourceUrl,
          stepIndex: flow.screens.findIndex((item) => item.id === screen.id),
          originalWidth: imageW,
          originalHeight: imageH,
        },
        semantic: {
          role: "single-screen",
          label: screen.name,
        },
      };

      if (!options?.skipHistory) commitHistorySnapshot();
      setObjects((prev) => {
        const next = [...prev, imageObject];
        objectsRef.current = next;
        return next;
      });
      if (options?.select !== false) setSelectedIds([imageObject.id]);
      setActiveTool("select");
      setPlacementTool(null);
      setColorPopover(null);
      return [imageObject.id];
    },
    [commitHistorySnapshot, screenToWorld]
  );


  const commitAIActionRunHistory = useCallback((runId: string) => {
    if (aiRunHistoryCommittedRef.current.has(runId)) return;

    const snapshot = cloneCanvasObjects(objectsRef.current);
    const lastSnapshot = historyPastRef.current[historyPastRef.current.length - 1];
    if (!lastSnapshot || JSON.stringify(lastSnapshot) !== JSON.stringify(snapshot)) {
      historyPastRef.current = [...historyPastRef.current, snapshot].slice(-60);
      historyFutureRef.current = [];
    }
    aiRunHistoryCommittedRef.current.add(runId);
  }, []);

  const finalizeCanvasAIActionRun = useCallback((runId: string) => {
    aiRunHistoryCommittedRef.current.delete(runId);
    aiRunResultIdsRef.current.delete(runId);
    aiRunCreatedIdsRef.current.delete(runId);
    aiRunActionIndexRef.current.delete(runId);
    setAiHighlightedIds([]);
  }, []);


  const isCapturedNorthStarScreenshot = (object: CanvasBoxObject) =>
    object.source?.kind === "northstar-screenshot" ||
    object.semantic?.role === "flow-screen" ||
    object.semantic?.role === "single-screen";

  const normalizedRotation = (value: number) => {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  };

  const executeCanvasAIAction = useCallback(
    async (
      runId: string,
      action: CanvasAIActionRequest
    ): Promise<CanvasAIActionExecutionResult> => {
      const args = action.arguments ?? {};
      const isMutating = !["select_objects", "focus_objects"].includes(action.tool);
      if (isMutating) commitAIActionRunHistory(runId);

      const runResults = aiRunResultIdsRef.current.get(runId) ?? new Map<string, string[]>();
      aiRunResultIdsRef.current.set(runId, runResults);
      const runCreated = aiRunCreatedIdsRef.current.get(runId) ?? [];
      aiRunCreatedIdsRef.current.set(runId, runCreated);
      const actionIndex = aiRunActionIndexRef.current.get(runId) ?? 0;
      aiRunActionIndexRef.current.set(runId, actionIndex + 1);

      const setSelection = (ids: string[]) => {
        const valid = Array.from(new Set(ids)).filter((id) =>
          objectsRef.current.some((object) => object.id === id)
        );
        selectedIdsRef.current = valid;
        setSelectedIds(valid);
        return valid;
      };

      const describeIds = (ids: string[]) =>
        describeCanvasObjectsForUser(
          objectsRef.current.filter((object) => ids.includes(object.id)),
        );

      const storeResult = (ids: string[]) => {
        const unique = Array.from(new Set(ids));
        if (args.resultKey) runResults.set(args.resultKey, unique);
        if (unique.length > 0) {
          const merged = Array.from(new Set([...runCreated, ...unique]));
          aiRunCreatedIdsRef.current.set(runId, merged);
          if (args.selectAfter !== false) setSelection(merged);
        }
        return unique;
      };

      const resolveIds = () => {
        const ids = new Set<string>();
        for (const id of args.objectIds ?? []) ids.add(id);
        for (const key of args.resultKeys ?? []) {
          for (const id of runResults.get(key) ?? []) ids.add(id);
        }
        if (args.fromResultKey) {
          for (const id of runResults.get(args.fromResultKey) ?? []) ids.add(id);
        }
        if (args.toResultKey) {
          for (const id of runResults.get(args.toResultKey) ?? []) ids.add(id);
        }
        if (ids.size === 0) {
          for (const id of selectedIdsRef.current) ids.add(id);
        }
        return Array.from(ids).filter((id) =>
          objectsRef.current.some((object) => object.id === id)
        );
      };

      const mutateObjects = (
        updater: (current: CanvasObject[]) => CanvasObject[]
      ) => {
        const next = normalizeCanvasScene(updater(objectsRef.current));
        objectsRef.current = next;
        setObjects(next);
        return next;
      };

      const canvasCenter = () => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const defaultCenter = screenToWorld(
          (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2,
          (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2
        );
        let center = defaultCenter;

        if (args.placement === "at-cursor" && lastCanvasClientPointRef.current) {
          center = screenToWorld(
            lastCanvasClientPointRef.current.x,
            lastCanvasClientPointRef.current.y
          );
        }

        const selectedObjects = objectsRef.current.filter((object) =>
          selectedIdsRef.current.includes(object.id)
        );
        const selectedBounds = getBoundsForObjects(selectedObjects);
        if (selectedBounds && args.placement === "right-of-selection") {
          center = {
            x: selectedBounds.x + selectedBounds.w + 260,
            y: selectedBounds.y + selectedBounds.h / 2,
          };
        }
        if (selectedBounds && args.placement === "below-selection") {
          center = {
            x: selectedBounds.x + selectedBounds.w / 2,
            y: selectedBounds.y + selectedBounds.h + 220,
          };
        }

        const createdOffset =
          action.tool === "create_shape" &&
          args.x === undefined &&
          args.offsetX === undefined
            ? runCreated.filter((id) => {
                const object = objectsRef.current.find((item) => item.id === id);
                return object && isBoxObject(object) && isPrimitiveShape(object.type);
              }).length * 300
            : 0;

        return {
          x:
            (typeof args.x === "number" ? args.x : center.x) +
            (args.offsetX ?? 0) +
            createdOffset,
          y:
            (typeof args.y === "number" ? args.y : center.y) +
            (args.offsetY ?? 0),
        };
      };

      try {
        if (action.tool === "create_shape") {
          const shape = args.shape ?? "rect";
          const defaults = getBoxDefaults(shape);
          let width = args.width ?? defaults.w;
          let height = args.height ?? defaults.h;
          if (shape === "circle") {
            const size = Math.max(width, height);
            width = size;
            height = size;
          }
          const center = canvasCenter();
          const object = createBoxObject(shape, {
            x: center.x - width / 2,
            y: center.y - height / 2,
            w: width,
            h: height,
          });
          const nextObject: CanvasBoxObject = {
            ...object,
            text: args.text ?? object.text,
            textHtml: args.text ? htmlFromPlainText(args.text) : object.textHtml,
            source: { kind: "generated" },
            semantic: {
              role: "user-content",
              label: args.text?.trim() || `${shape} created by North Star`,
            },
            style: {
              ...object.style,
              fill: args.fill ?? object.style.fill,
              stroke: args.stroke ?? object.style.stroke,
            },
          };
          mutateObjects((current) => [...current, nextObject]);
          const ids = storeResult([nextObject.id]);
          return {
            ok: true,
            detail: `Created ${shape === "rect" ? "a rectangle" : `a ${shape}`} on the canvas.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "create_visual_component") {
          const preset = args.componentPreset;
          if (!preset) throw new Error("North Star did not specify which visual component to create.");
          const center = {
            x: typeof args.x === "number" ? args.x : canvasCenter().x,
            y: typeof args.y === "number" ? args.y : canvasCenter().y,
          };
          const created = buildManualVisualComponentPreset(preset, center);
          mutateObjects((current) => resolveConnectorBindings([...current, ...created]));
          const root = created.find(
            (object) => isBoxObject(object) && object.semantic?.parentId === undefined,
          );
          const ids = storeResult(created.map((object) => object.id));
          setSelection(root ? [root.id] : ids.slice(0, 1));
          return {
            ok: true,
            detail: `Created an editable ${preset.replace(/-/g, " ")} from ${created.length} semantic canvas primitives.`,
            objectIds: ids,
            targetLabel: `the ${preset.replace(/-/g, " ")}`,
          };
        }

        if (action.tool === "create_text") {
          const text = args.text?.trim() || "New text";
          const fontSize = args.fontSize ?? 42;
          const width = args.width ?? clamp(Math.ceil(text.length * fontSize * 0.58), 260, 1200);
          const lineCount = Math.max(1, text.split("\n").length);
          const height = args.height ?? Math.max(fontSize * 1.5, lineCount * fontSize * 1.35 + 20);
          const center = canvasCenter();
          const object = createBoxObject("text", {
            x: center.x - width / 2,
            y: center.y - height / 2,
            w: width,
            h: height,
          });
          const nextObject: CanvasBoxObject = {
            ...object,
            text,
            textHtml: htmlFromPlainText(text),
            source: { kind: "generated" },
            semantic: { role: "user-content", label: text.slice(0, 120) },
            style: {
              ...object.style,
              fontSize,
              fontWeight: 700,
              textColor: args.textColor ?? object.style.textColor,
            },
          };
          mutateObjects((current) => [...current, nextObject]);
          const ids = storeResult([nextObject.id]);
          return {
            ok: true,
            detail: "Created editable text on the canvas.",
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "create_note") {
          const text = args.text?.trim() || "New note";
          const width = args.width ?? 380;
          const height = args.height ?? 240;
          const center = canvasCenter();
          const object = createBoxObject("note", {
            x: center.x - width / 2,
            y: center.y - height / 2,
            w: width,
            h: height,
          });
          const nextObject: CanvasBoxObject = {
            ...object,
            text,
            textHtml: htmlFromPlainText(text),
            source: { kind: "generated" },
            semantic: { role: "user-content", label: text.slice(0, 120) },
            style: {
              ...object.style,
              fill: args.fill ?? object.style.fill,
              textColor: args.textColor ?? object.style.textColor,
            },
          };
          mutateObjects((current) => [...current, nextObject]);
          const ids = storeResult([nextObject.id]);
          return {
            ok: true,
            detail: "Created an editable note on the canvas.",
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "create_connector") {
          const candidateIds = resolveIds();
          const fromIds = args.fromResultKey
            ? runResults.get(args.fromResultKey) ?? []
            : candidateIds.slice(0, 1);
          const toIds = args.toResultKey
            ? runResults.get(args.toResultKey) ?? []
            : candidateIds.slice(1, 2);
          const from = objectsRef.current.find(
            (object) => fromIds.includes(object.id) && isBoxObject(object)
          );
          const to = objectsRef.current.find(
            (object) =>
              toIds.includes(object.id) &&
              isBoxObject(object) &&
              object.id !== from?.id
          );
          if (!from || !to || !isBoxObject(from) || !isBoxObject(to)) {
            throw new Error("North Star needs two canvas elements to create that connection.");
          }

          const sides = getConnectorSidesBetweenBoxes(from, to);
          const startBinding = getBindingForSide(from, sides.fromSide);
          const endBinding = getBindingForSide(to, sides.toSide);
          const start = getBindingPoint(from, startBinding);
          const end = getBindingPoint(to, endBinding);
          const connector: CanvasConnectorObject = {
            id: makeId(),
            type: "connector",
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            controlOffset: 0,
            controlX: (start.x + end.x) / 2,
            controlY: (start.y + end.y) / 2,
            startBinding,
            endBinding,
            source: { kind: "generated" },
            semantic: {
              role: "user-content",
              label: "Connector created by North Star",
            },
            style: {
              stroke: args.stroke ?? "#747474",
              strokeWidth: 2.8,
              kind: args.connectorKind ?? "straight",
              end: args.connectorEnd ?? "arrow",
              dash: args.connectorDash ?? "solid",
            },
          };
          mutateObjects((current) => [...current, connector]);
          const ids = storeResult([connector.id]);
          return {
            ok: true,
            detail: `Connected ${describeIds([from.id])} and ${describeIds([to.id])}.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
            fromLabel: describeIds([from.id]),
            toLabel: describeIds([to.id]),
          };
        }

        if (action.tool === "insert_app_icon") {
          const assetApp = action.asset?.app;
          if (!assetApp) throw new Error("The requested app icon was not available.");
          const app = workspaceAppFromCanvasAIAsset(assetApp);
          const ids = insertWorkspaceAppIcon(app, undefined, {
            skipHistory: true,
            select: false,
            worldPoint: canvasCenter(),
          });
          const stored = storeResult(ids);
          if (stored.length === 0) {
            throw new Error(`The ${app.name} app icon could not be placed on the canvas.`);
          }
          return {
            ok: true,
            detail: `Inserted the ${app.name} app icon.`,
            objectIds: stored,
            targetLabel: describeIds(stored),
          };
        }

        if (action.tool === "insert_flow") {
          const assetApp = action.asset?.app;
          const assetFlow = action.asset?.flow;
          if (!assetApp || !assetFlow) throw new Error("The requested flow was not available.");
          const app = workspaceAppFromCanvasAIAsset(assetApp);
          const flow = app.flows.find((item) => item.id === assetFlow.id) ?? {
            id: assetFlow.id,
            name: assetFlow.name,
            description: assetFlow.description,
            screens: assetFlow.screens.map((screen) => ({
              id: screen.id,
              name: screen.name,
              imageUrl: screen.imageUrl,
              sourceUrl: screen.sourceUrl,
            })),
          };
          const ids = insertWorkspaceFlow(app, flow, undefined, {
            skipHistory: true,
            select: false,
            worldPoint: canvasCenter(),
          });
          const stored = storeResult(ids);
          if (stored.length === 0) {
            throw new Error(`${flow.name} could not be placed on the canvas.`);
          }
          return {
            ok: true,
            detail: `Inserted ${app.name} — ${flow.name} on the canvas.`,
            objectIds: stored,
            targetLabel: describeIds(stored),
          };
        }

        if (action.tool === "insert_screenshot") {
          const assetApp = action.asset?.app;
          const assetFlow = action.asset?.flow;
          const assetScreen = action.asset?.screenshot;
          if (!assetApp || !assetFlow || !assetScreen?.imageUrl) {
            throw new Error("The requested screenshot was not available.");
          }
          const app = workspaceAppFromCanvasAIAsset(assetApp);
          const flow = app.flows.find((item) => item.id === assetFlow.id) ?? {
            id: assetFlow.id,
            name: assetFlow.name,
            description: assetFlow.description,
            screens: [],
          };
          const screen: WorkspaceAppScreen = {
            id: assetScreen.id,
            name: assetScreen.name,
            imageUrl: assetScreen.imageUrl,
            sourceUrl: assetScreen.sourceUrl,
          };
          if (!flow.screens.some((item) => item.id === screen.id)) {
            flow.screens = [...flow.screens, screen];
          }
          const ids = insertWorkspaceScreen(app, flow, screen, undefined, {
            skipHistory: true,
            select: false,
            worldPoint: canvasCenter(),
          });
          const stored = storeResult(ids);
          if (stored.length === 0) {
            throw new Error(`${screen.name} could not be placed on the canvas.`);
          }
          return {
            ok: true,
            detail: `Inserted ${screen.name} on the canvas.`,
            objectIds: stored,
            targetLabel: describeIds(stored),
          };
        }


        if (action.tool === "update_object_style") {
          const ids = resolveIds();
          if (ids.length === 0) throw new Error("There are no matching objects to restyle.");
          const hasStyleChange = [
            args.fill,
            args.stroke,
            args.strokeWidth,
            args.textColor,
            args.fontSize,
            args.fontWeight,
            args.textAlign,
            args.connectorKind,
            args.connectorEnd,
            args.connectorDash,
          ].some((value) => value !== undefined);
          if (!hasStyleChange) throw new Error("North Star needs at least one style change to apply.");

          let updatedCount = 0;
          mutateObjects((current) =>
            current.map((object) => {
              if (!ids.includes(object.id)) return object;
              updatedCount += 1;
              if (isConnectorObject(object)) {
                return {
                  ...object,
                  style: {
                    ...object.style,
                    stroke: args.stroke ?? object.style.stroke,
                    strokeWidth: args.strokeWidth ?? object.style.strokeWidth,
                    kind: args.connectorKind ?? object.style.kind,
                    end: args.connectorEnd ?? object.style.end,
                    dash: args.connectorDash ?? object.style.dash,
                  },
                };
              }
              return {
                ...object,
                style: {
                  ...object.style,
                  fill: args.fill ?? object.style.fill,
                  stroke: args.stroke ?? object.style.stroke,
                  strokeWidth: args.strokeWidth ?? object.style.strokeWidth,
                  textColor: args.textColor ?? object.style.textColor,
                  fontSize: args.fontSize ?? object.style.fontSize,
                  fontWeight: args.fontWeight ?? object.style.fontWeight,
                  textAlign: args.textAlign ?? object.style.textAlign,
                },
              };
            })
          );
          if (updatedCount === 0) throw new Error("North Star could not restyle those canvas objects.");
          setSelection(ids);
          return {
            ok: true,
            detail: `Updated the appearance of ${describeIds(ids)}.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "resize_objects") {
          const ids = resolveIds();
          const boxes = objectsRef.current.filter(
            (object): object is CanvasBoxObject => ids.includes(object.id) && isBoxObject(object)
          );
          if (boxes.length === 0) throw new Error("There are no matching resizable objects.");
          if (
            args.width === undefined &&
            args.height === undefined &&
            args.scale === undefined
          ) {
            throw new Error("North Star needs a target size or scale for that resize.");
          }

          mutateObjects((current) =>
            current.map((object) => {
              if (!isBoxObject(object) || !ids.includes(object.id)) return object;
              const currentRatio = object.w / Math.max(1, object.h);
              const sourceRatio =
                object.source?.originalWidth && object.source?.originalHeight
                  ? object.source.originalWidth / Math.max(1, object.source.originalHeight)
                  : currentRatio;
              const preserve =
                args.preserveAspectRatio ?? isCapturedNorthStarScreenshot(object);

              let nextW = object.w;
              let nextH = object.h;
              if (typeof args.scale === "number") {
                nextW = object.w * args.scale;
                nextH = object.h * args.scale;
              } else if (
                typeof args.width === "number" &&
                typeof args.height === "number"
              ) {
                if (preserve) {
                  const fitScale = Math.min(
                    args.width / Math.max(1, object.w),
                    args.height / Math.max(1, object.h)
                  );
                  nextW = object.w * fitScale;
                  nextH = object.h * fitScale;
                } else {
                  nextW = args.width;
                  nextH = args.height;
                }
              } else if (typeof args.width === "number") {
                nextW = args.width;
                nextH = preserve ? args.width / Math.max(0.01, sourceRatio) : object.h;
              } else if (typeof args.height === "number") {
                nextH = args.height;
                nextW = preserve ? args.height * sourceRatio : object.w;
              }

              nextW = clamp(nextW, 24, 12_000);
              nextH = clamp(nextH, 24, 12_000);
              return {
                ...object,
                x: object.x + (object.w - nextW) / 2,
                y: object.y + (object.h - nextH) / 2,
                w: nextW,
                h: nextH,
              };
            })
          );
          setSelection(ids);
          return {
            ok: true,
            detail: `Resized ${describeIds(ids)}.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "rotate_objects") {
          const ids = resolveIds();
          const boxes = objectsRef.current.filter(
            (object): object is CanvasBoxObject => ids.includes(object.id) && isBoxObject(object)
          );
          if (boxes.length === 0) throw new Error("There are no matching rotatable objects.");
          if (args.rotation === undefined && args.rotationDelta === undefined) {
            throw new Error("North Star needs an angle for that rotation.");
          }
          mutateObjects((current) =>
            current.map((object) => {
              if (!isBoxObject(object) || !ids.includes(object.id)) return object;
              const nextRotation =
                typeof args.rotation === "number"
                  ? args.rotation
                  : object.rotation + (args.rotationDelta ?? 0);
              return { ...object, rotation: normalizedRotation(nextRotation) };
            })
          );
          setSelection(ids);
          return {
            ok: true,
            detail: `Rotated ${describeIds(ids)}.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "update_text") {
          const text = args.text ?? "";
          const ids = resolveIds();
          const editable = objectsRef.current.filter(
            (object): object is CanvasBoxObject =>
              ids.includes(object.id) &&
              isBoxObject(object) &&
              isTextEditableBox(object.type)
          );
          if (editable.length === 0) {
            throw new Error("North Star could not find editable text in those objects.");
          }
          mutateObjects((current) =>
            current.map((object) => {
              if (
                !isBoxObject(object) ||
                !ids.includes(object.id) ||
                !isTextEditableBox(object.type)
              ) {
                return object;
              }
              return {
                ...object,
                text,
                textHtml: htmlFromPlainText(text),
                semantic: {
                  ...object.semantic,
                  role: object.semantic?.role ?? "user-content",
                  label: text.slice(0, 120) || object.semantic?.label,
                },
              };
            })
          );
          setSelection(editable.map((object) => object.id));
          const editableIds = editable.map((object) => object.id);
          return {
            ok: true,
            detail: `Updated the text in ${describeIds(editableIds)}.`,
            objectIds: editableIds,
            targetLabel: describeIds(editableIds),
          };
        }

        if (action.tool === "duplicate_objects") {
          const ids = resolveIds();
          const sourceObjects = objectsRef.current.filter((object) => ids.includes(object.id));
          if (sourceObjects.length === 0) throw new Error("There are no matching objects to duplicate.");
          const copyCount = Math.max(1, Math.min(20, Math.round(args.copyCount ?? 1)));
          const baseOffsetX = args.offsetX ?? 48;
          const baseOffsetY = args.offsetY ?? 48;
          const created: CanvasObject[] = [];

          for (let copyIndex = 1; copyIndex <= copyCount; copyIndex += 1) {
            const idMap = new Map<string, string>();
            sourceObjects.forEach((object) => idMap.set(object.id, makeId()));
            for (const object of sourceObjects) {
              if (isConnectorObject(object)) {
                created.push({
                  ...object,
                  id: idMap.get(object.id)!,
                  x1: object.x1 + baseOffsetX * copyIndex,
                  y1: object.y1 + baseOffsetY * copyIndex,
                  x2: object.x2 + baseOffsetX * copyIndex,
                  y2: object.y2 + baseOffsetY * copyIndex,
                  controlX:
                    typeof object.controlX === "number"
                      ? object.controlX + baseOffsetX * copyIndex
                      : object.controlX,
                  controlY:
                    typeof object.controlY === "number"
                      ? object.controlY + baseOffsetY * copyIndex
                      : object.controlY,
                  startBinding: object.startBinding
                    ? {
                        ...object.startBinding,
                        objectId:
                          idMap.get(object.startBinding.objectId) ??
                          object.startBinding.objectId,
                      }
                    : undefined,
                  endBinding: object.endBinding
                    ? {
                        ...object.endBinding,
                        objectId:
                          idMap.get(object.endBinding.objectId) ??
                          object.endBinding.objectId,
                      }
                    : undefined,
                });
              } else {
                created.push({
                  ...object,
                  id: idMap.get(object.id)!,
                  x: object.x + baseOffsetX * copyIndex,
                  y: object.y + baseOffsetY * copyIndex,
                  style: { ...object.style },
                  source: object.source ? { ...object.source } : undefined,
                  semantic: object.semantic ? { ...object.semantic } : undefined,
                  cells: object.cells?.map((row) => [...row]),
                });
              }
            }
          }

          mutateObjects((current) => [...current, ...created]);
          const createdIds = storeResult(created.map((object) => object.id));
          return {
            ok: true,
            detail: `Created ${createdIds.length} ${createdIds.length === 1 ? "copy" : "copies"} of ${describeIds(ids)}.`,
            objectIds: createdIds,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "delete_objects") {
          const requestedIds = resolveIds();
          const requestedObjects = objectsRef.current.filter((object) =>
            requestedIds.includes(object.id)
          );
          const deletableObjects = requestedObjects.filter((object) => !object.locked);
          if (deletableObjects.length === 0) {
            throw new Error("There are no matching unlocked canvas elements to remove.");
          }

          const targetIds = deletableObjects.map((object) => object.id);
          const targetIdSet = new Set(targetIds);
          const attachedConnectorIds = objectsRef.current
            .filter(
              (object): object is CanvasConnectorObject =>
                isConnectorObject(object) &&
                (Boolean(object.startBinding?.objectId && targetIdSet.has(object.startBinding.objectId)) ||
                  Boolean(object.endBinding?.objectId && targetIdSet.has(object.endBinding.objectId)))
            )
            .map((object) => object.id);
          const deletedIds = Array.from(
            new Set([...targetIds, ...attachedConnectorIds])
          );
          const deletedIdSet = new Set(deletedIds);
          const targetLabel = describeCanvasObjectsForUser(deletableObjects);

          mutateObjects((current) =>
            current.filter((object) => !deletedIdSet.has(object.id))
          );
          if (objectsRef.current.some((object) => deletedIdSet.has(object.id))) {
            throw new Error("North Star could not verify that the requested canvas elements were removed.");
          }

          for (const [key, value] of runResults.entries()) {
            runResults.set(
              key,
              value.filter((id) => !deletedIdSet.has(id))
            );
          }
          aiRunCreatedIdsRef.current.set(
            runId,
            runCreated.filter((id) => !deletedIdSet.has(id))
          );
          setSelection([]);
          setContextMenu(null);

          const connectorDetail =
            attachedConnectorIds.length > 0
              ? ` and ${attachedConnectorIds.length} attached ${attachedConnectorIds.length === 1 ? "connector" : "connectors"}`
              : "";
          return {
            ok: true,
            detail: `Removed ${targetLabel}${connectorDetail} from the canvas.`,
            objectIds: deletedIds,
            targetLabel,
          };
        }

        if (action.tool === "arrange_objects") {
          const ids = resolveIds();
          const boxes = objectsRef.current.filter(
            (object): object is CanvasBoxObject => ids.includes(object.id) && isBoxObject(object)
          );
          if (boxes.length < 2) throw new Error("North Star needs at least two objects to arrange them.");
          const layout = args.layout ?? "horizontal";
          const gap = Math.max(0, args.gap ?? 72);
          const sorted = [...boxes].sort((a, b) => {
            if (Math.abs(a.y - b.y) > 8) return a.y - b.y;
            return a.x - b.x;
          });
          const bounds = getBoundsForObjects(sorted);
          if (!bounds) throw new Error("North Star could not measure those canvas objects.");
          const positions = new Map<string, { x: number; y: number }>();

          if (layout === "horizontal") {
            let cursor = bounds.x;
            sorted.forEach((object) => {
              positions.set(object.id, { x: cursor, y: bounds.y });
              cursor += object.w + gap;
            });
          } else if (layout === "vertical") {
            let cursor = bounds.y;
            sorted.forEach((object) => {
              positions.set(object.id, { x: bounds.x, y: cursor });
              cursor += object.h + gap;
            });
          } else {
            const columns = Math.max(
              1,
              Math.min(sorted.length, Math.round(args.columns ?? Math.ceil(Math.sqrt(sorted.length))))
            );
            const maxWidth = Math.max(...sorted.map((object) => object.w));
            const maxHeight = Math.max(...sorted.map((object) => object.h));
            sorted.forEach((object, index) => {
              const column = index % columns;
              const row = Math.floor(index / columns);
              positions.set(object.id, {
                x: bounds.x + column * (maxWidth + gap),
                y: bounds.y + row * (maxHeight + gap),
              });
            });
          }

          mutateObjects((current) =>
            current.map((object) => {
              if (!isBoxObject(object)) return object;
              const position = positions.get(object.id);
              return position ? { ...object, ...position } : object;
            })
          );
          setSelection(ids);
          return {
            ok: true,
            detail: `Arranged ${describeIds(ids)} in a ${layout === "vertical" ? "vertical stack" : layout === "grid" ? "grid" : "horizontal row"}.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }


        if (action.tool === "compose_visual_board" || action.tool === "compose_visual_scene") {
          const codeArtifactAction = safeParseJson<unknown>(args.compositionJson);
          if (isCanvasCodeArtifactActionEnvelope(codeArtifactAction)) {
            if (codeArtifactAction.command !== "create-or-update" || !codeArtifactAction.package) {
              throw new Error("North Star did not provide the generated artifact package for the first build stage.");
            }
            if (!isNorthstarGeneratedCodeArtifactPackage(codeArtifactAction.package)) {
              throw new Error("North Star generated an invalid code-artifact package.");
            }

            const artifactPackage = codeArtifactAction.package;
            const authoredArtifact = createCanvasCodeArtifactPayloadFromPackage(
              artifactPackage,
              codeArtifactAction.stageIndex,
            );
            const existing = objectsRef.current.find(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) &&
                object.type === "code-artifact" &&
                object.codeArtifact?.artifactId === authoredArtifact.artifactId,
            );
            const pendingMutation = authoredArtifact.mutationJournal?.at(-1);
            const pendingAckToken = authoredArtifact.pendingAckToken;
            const pendingProposal = existing?.codeArtifact && pendingMutation && pendingAckToken
              ? {
                  schema: "northstar.canvas-pending-proposal.v1" as const,
                  proposalId: pendingAckToken.split(":").at(-1) || pendingAckToken,
                  transactionId: pendingAckToken,
                  ackToken: pendingAckToken,
                  revisionId: authoredArtifact.revisionId,
                  parentRevisionId: authoredArtifact.parentRevisionId,
                  mutation: pendingMutation,
                  stageIndex: codeArtifactAction.stageIndex,
                  candidatePackage: artifactPackage,
                }
              : undefined;
            // A later LLM proposal is metadata beside HEAD, never a speculative
            // replacement for the canonical document, revision, or geometry.
            const artifact = pendingProposal && existing?.codeArtifact
              ? {
                  ...existing.codeArtifact,
                  pendingAckToken,
                  pendingProposal,
                  repositoryStatus: existing.codeArtifact.repositoryStatus ?? "clean",
                  buildState: authoredArtifact.buildState,
                  status: authoredArtifact.status,
                  updatedAt: authoredArtifact.updatedAt,
                }
              : authoredArtifact;
            const center = canvasCenter();
            const preferredRect: Rect = existing?.codeArtifact
              ? {
                  // Keep the permanent artboard's visible geometry unchanged while the next
                  // The same mounted artboard keeps its current Canvas geometry while the next
                  // semantic mutation is applied inside it. Runtime measurement then updates this
                  // same object's exact x/y/w/h without replacing the iframe or document.
                  x: existing.x,
                  y: existing.y,
                  w: existing.w,
                  h: existing.h,
                }
              : {
                  x: center.x - artifact.preferredWidth / 2 + (workspaceOpen ? 220 : 0),
                  y: center.y - artifact.preferredHeight / 2,
                  w: artifact.preferredWidth,
                  h: artifact.preferredHeight,
                };
            const occupied = objectsRef.current
              .filter(
                (object) =>
                  object.id !== existing?.id &&
                  object.semantic?.artifactId !== artifact.artifactId &&
                  !object.hidden &&
                  !isConnectorObject(object),
              )
              .map(getObjectBounds);
            const rect = existing
              ? preferredRect
              : findFreeRect(preferredRect, occupied, { margin: 140, step: 320, maxRings: 12 });
            const objectId = existing?.id ?? makeId();
            const nextObject: CanvasBoxObject = {
              ...(existing ?? createBoxObject("frame", rect)),
              id: objectId,
              type: "code-artifact",
              x: rect.x,
              y: rect.y,
              w: rect.w,
              h: rect.h,
              rotation: existing?.rotation ?? 0,
              text: artifact.title,
              codeArtifact: artifact,
              source: existing?.source ?? {
                kind: "northstar-code-artifact",
                originalWidth: artifact.preferredWidth,
                originalHeight: artifact.preferredHeight,
              },
              semantic: {
                ...(existing?.semantic ?? {}),
                artifactId: artifact.artifactId,
                role: "artifact-frame",
                label: artifact.title,
                componentId: artifact.artifactId,
                componentType: "code-artifact",
                layoutRole: "container",
                editable: true,
                detachable: true,
                surfaceKind: "presentation",
                surfaceRootId: artifact.artifactId,
                sceneRevision: artifact.revisionId,
              },
              style: {
                ...(existing?.style ?? getDefaultStyle("frame")),
                fill: "#FFFFFF",
                stroke: "rgba(107,92,255,0.26)",
                strokeWidth: 1.25,
                textColor: "#171820",
                fontSize: 14,
                fontWeight: 700,
                textAlign: "left",
                radius: 24,
                shadow: "0 30px 90px rgba(36,29,91,0.18)",
                opacity: 1,
              },
            };

            const geometryExpanded = !existing ||
              nextObject.w > existing.w + 2 ||
              nextObject.h > existing.h + 2 ||
              nextObject.x < existing.x - 2 ||
              nextObject.y < existing.y - 2;
            mutateObjects((current) => [
              ...current.filter(
                (object) =>
                  object.id !== objectId &&
                  !(
                    object.semantic?.artifactId === artifact.artifactId &&
                    object.semantic?.surfaceKind !== "working"
                  ),
              ),
              nextObject,
            ]);
            resetTransientEditingState();
            setSelection([objectId]);

            if (
              geometryExpanded &&
              artifact.buildState.isBuilding &&
              Date.now() >= artifactAutoFollowSuspendedUntilRef.current
            ) {
              window.requestAnimationFrame(() => {
                const canvasRect = canvasRef.current?.getBoundingClientRect();
                if (!canvasRect) return;
                const workspaceInset = workspaceOpen ? 520 : 0;
                const padding = 104;
                const availableWidth = Math.max(320, canvasRect.width - workspaceInset - padding * 2);
                const availableHeight = Math.max(240, canvasRect.height - padding * 2);
                setViewport((currentViewport) => {
                  const fitZoom = clampZoom(Math.min(
                    currentViewport.zoom,
                    availableWidth / Math.max(1, nextObject.w),
                    availableHeight / Math.max(1, nextObject.h),
                  ));
                  const visibleCenterX = workspaceInset + padding + availableWidth / 2;
                  const visibleCenterY = canvasRect.height / 2;
                  return {
                    x: visibleCenterX - (nextObject.x + nextObject.w / 2) * fitZoom,
                    y: visibleCenterY - (nextObject.y + nextObject.h / 2) * fitZoom,
                    zoom: fitZoom,
                  };
                });
              });
            }
            const ids = storeResult([objectId]);
            const stage = artifact.stagePlan?.[artifact.activeStageIndex ?? 0];
            return {
              ok: true,
              detail: `${existing ? "Updated" : "Created"} “${artifact.title}” as one live standard-web artifact and completed the ${stage?.label?.toLowerCase() ?? "foundation"} stage.`,
              objectIds: ids,
              targetLabel: artifact.title,
            };
          }

          const artifactId = args.artifactId?.trim() || `visual-scene-${makeId()}`;
          const blueprint = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          // v86: comparisons are no longer routed through the fixed dashboard renderer.
          // The model-authored blueprint and native component renderer determine the composition.
          const specializedComparison = false;
          const existingRoot = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.semantic?.artifactId === artifactId &&
              object.semantic?.role === "visual-root",
          );
          const boardW = specializedComparison
            ? 1600
            : clamp(blueprint?.layout.canvasWidth ?? 1500, 1080, 2200);
          const boardH = specializedComparison
            ? 1080
            : clamp(blueprint?.layout.canvasHeight ?? 1080, 760, 2400);
          const center = canvasCenter();
          const preferredRect: Rect = existingRoot
            ? { x: existingRoot.x, y: existingRoot.y, w: boardW, h: boardH }
            : {
                x: center.x - boardW / 2 + (workspaceOpen ? 220 : 0),
                y: center.y - boardH / 2,
                w: boardW,
                h: boardH,
              };
          const occupied = objectsRef.current
            .filter((object) => object.semantic?.artifactId !== artifactId && !object.hidden && !isConnectorObject(object))
            .map(getObjectBounds);
          const rect = existingRoot
            ? preferredRect
            : findFreeRect(preferredRect, occupied, { margin: 140, step: 320, maxRings: 12 });

          let created: CanvasObject[];
          let sceneTitle: string;
          let flowCount = 0;
          let orderedScreenCount = 0;
          if (specializedComparison) {
            const document = buildNorthStarVisualBoardDocument({ ...args, artifactId }, action.assetBundle);
            created = buildEditableVisualBoardObjects(document, rect, artifactId);
            sceneTitle = document.title;
            flowCount = document.flows.length;
            orderedScreenCount = document.flows.reduce((total, flow) => total + flow.screens.length, 0);
          } else {
            const scene = buildEditableAdaptiveSceneObjects({ ...args, artifactId }, action.assetBundle, rect, artifactId);
            created = scene.objects;
            sceneTitle = scene.title;
            flowCount = created.filter((object) => object.semantic?.role === "visual-flow-lane").length;
            orderedScreenCount = created.filter((object) => object.semantic?.role === "visual-flow-screen").length;
          }

          const presentationRootId = created.find(
            (object) => object.semantic?.role === "visual-root",
          )?.id ?? stableVisualBoardId([artifactId, "presentation-root"]);
          created = normalizeCanvasScene(
            stampSurfaceOwnership(
              repairReferenceFlowAssociations(created),
              artifactId,
              "presentation",
              presentationRootId,
            ),
          );
          const sceneValidation = validateNativeCompositionScene(created, artifactId, presentationRootId);
          if (!sceneValidation.ok) {
            throw new Error(
              `North Star rejected an invalid visual scene before it reached the canvas: ${sceneValidation.issues.join("; ")}`,
            );
          }
          mutateObjects((current) =>
            replaceArtifactSurface(current, artifactId, "presentation", presentationRootId, created),
          );
          resetTransientEditingState();
          const ids = storeResult(created.map((object) => object.id));
          return {
            ok: true,
            detail: flowCount > 0
              ? `Built ${sceneTitle} from ${created.length} editable canvas primitives, including ${flowCount} named reference ${flowCount === 1 ? "flow" : "flows"} and ${orderedScreenCount} ordered ${orderedScreenCount === 1 ? "screen" : "screens"}. Every visible component remains independently selectable and editable.`
              : `Built ${sceneTitle} from ${created.length} editable semantic canvas primitives. Every section, card, label, media item, and supporting element remains independently selectable and editable.`,
            objectIds: ids,
            targetLabel: sceneTitle,
          };
        }


        if (action.tool === "validate_visual_board") {
          const artifactId = args.artifactId?.trim();
          const codeArtifactObject = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.type === "code-artifact" &&
              (!artifactId || object.codeArtifact?.artifactId === artifactId),
          );
          if (codeArtifactObject?.codeArtifact) {
            const artifact = codeArtifactObject.codeArtifact;
            if (!isCanvasCodeArtifactPayload(artifact)) {
              throw new Error("The generated code artifact failed its payload validation gate.");
            }
            const hasWebDocument = Boolean(
              artifact.document &&
              artifact.document.schema === "northstar.web-artifact-document.v1" &&
              artifact.document.html.trim() &&
              artifact.document.css.trim(),
            );
            const hasLegacyRuntime = Boolean(artifact.compiledJs);
            if ((!hasWebDocument && !hasLegacyRuntime) || !artifact.dataBundle) {
              throw new Error("The generated artifact is missing a valid web document or grounded data.");
            }
            if ((artifact.stagePlan?.length ?? 0) < 4) {
              throw new Error("The generated code artifact is missing its meaningful build-stage plan.");
            }
            if (artifact.preferredWidth < 1080 || artifact.preferredHeight < 760) {
              throw new Error("The generated code artifact is too small for a legible bounded composition.");
            }
            if (!artifact.creativeDirection) {
              throw new Error("The generated code artifact is missing its selected creative direction.");
            }
            resetTransientEditingState();
            const ids = storeResult([codeArtifactObject.id]);
            return {
              ok: true,
              detail: `Verified “${artifact.creativeDirection.selectedConcept.name}” as one generated standard-web artifact with ${artifact.dataBundle.screenshots.length} grounded screenshots, ${artifact.dataBundle.flows.length} flows, ${artifact.creativeReviews?.length ?? 0} creative review ${artifact.creativeReviews?.length === 1 ? "pass" : "passes"}, a sandboxed HTML/CSS/SVG/JavaScript runtime, and ${artifact.stagePlan?.length ?? 0} meaningful build stages.`,
              objectIds: ids,
              targetLabel: artifact.title,
            };
          }
          const artifactObjects = objectsRef.current.filter(
            (object) => object.semantic?.artifactId === artifactId && isArtifactPresentationObject(object),
          );
          const root = artifactObjects.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) && object.semantic?.role === "visual-root",
          );
          if (!root) throw new Error("North Star could not find the editable visual composition to validate.");

          const duplicateIds = artifactObjects.filter(
            (object, index, items) => items.findIndex((candidate) => candidate.id === object.id) !== index,
          );
          if (duplicateIds.length > 0) throw new Error("The visual composition contains duplicate semantic identities.");

          const idSet = new Set(artifactObjects.map((object) => object.id));
          const orphanedChildren = artifactObjects.filter(
            (object) => object.semantic?.parentId && !idSet.has(object.semantic.parentId),
          );
          if (orphanedChildren.length > 0) throw new Error("The visual composition contains detached semantic children.");

          const sceneValidation = validateNativeCompositionScene(artifactObjects, artifactId ?? root.semantic?.artifactId ?? "", root.id);
          if (!sceneValidation.ok) {
            throw new Error(`The editable visual composition failed its structural gate: ${sceneValidation.issues.join("; ")}`);
          }

          const textCount = artifactObjects.filter(
            (object) => isBoxObject(object) && object.type === "text" && Boolean(object.text?.trim()),
          ).length;
          const screenCount = artifactObjects.filter(
            (object) => object.semantic?.role === "visual-flow-screen" && isBoxObject(object) && Boolean(object.imageUrl),
          ).length;
          const componentCount = artifactObjects.filter(
            (object) => object.semantic?.layoutRole === "container",
          ).length;
          const emptyContainers = artifactObjects.filter((object) => {
            if (object.semantic?.layoutRole !== "container" || object.id === root.id) return false;
            if (["app-identity", "flow-screen"].includes(object.semantic?.componentType ?? "")) return false;
            return !artifactObjects.some((candidate) => candidate.semantic?.parentId === object.id);
          });
          if (artifactObjects.length < 4 || textCount < 2 || componentCount < 1) {
            throw new Error("The editable visual composition is missing required visible content.");
          }
          if (emptyContainers.length > Math.max(2, Math.floor(componentCount * 0.18))) {
            throw new Error("The editable visual composition contains too many empty structural regions.");
          }

          const document = root.visualBoard;
          if (document) {
            const invalidFlow = document.flows.find(
              (flow) => !flow.appName || !flow.flowName || flow.screens.length < 3 || flow.screens.some((screen) => !screen.imageUrl),
            );
            if (document.flows.length < 2 || invalidFlow) {
              throw new Error("The comparison composition is missing a complete named reference flow with ordered evidence.");
            }
            const requestedSession = args.sessionType;
            if (requestedSession && document.flows.some((flow) => canonicalVisualSessionType(flow.sessionType) !== requestedSession)) {
              throw new Error(`The composition includes evidence outside the requested ${requestedSession} scope.`);
            }
          }

          resetTransientEditingState();
          const resultIds = storeResult(artifactObjects.map((object) => object.id));
          const label = root.semantic?.label || document?.title || args.title || "visual composition";
          return {
            ok: true,
            detail: `Verified ${artifactObjects.length} editable primitives, ${componentCount} semantic components, ${screenCount} grounded screenshots, stable parent-child structure, and populated visual content.`,
            objectIds: resultIds,
            targetLabel: label,
          };
        }


        if (action.tool === "create_working_surface") {
          const artifactId = args.artifactId?.trim() || `artifact-${makeId()}`;
          const blueprint = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          const notes = normalizeWorkingSurfaceNotes(
            safeParseJson<CanvasCompositionWorkingNote[]>(args.workingNotesJson) ??
              blueprint?.workingNotes ??
              [],
          );
          const visibility = args.workingVisibility ?? blueprint?.workingVisibility ?? "visible";
          const bundleFlows = selectCanonicalAssetFlows(action.assetBundle, {
            requestedSession: args.sessionType,
            requestedApps: args.appNames,
            explicitFlowNames: blueprint?.sections.map((section) => section.flowName).filter((value): value is string => Boolean(value)),
            maxFlowsPerApp: 1,
          });
          const bundleScreens = action.assetBundle?.screenshots ?? [];
          const existingFrame = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.semantic?.artifactId === artifactId &&
              object.semantic?.role === "working-frame",
          );
          const baseCenter = canvasCenter();
          const presentationBounds = getArtifactSurfaceBounds(objectsRef.current, artifactId, "presentation");
          const frameW = visibility === "compact" ? 1320 : 1580;
          const preferred: Rect = existingFrame
            ? { x: existingFrame.x, y: existingFrame.y, w: frameW, h: Math.max(760, existingFrame.h) }
            : presentationBounds
              ? { x: presentationBounds.x + presentationBounds.w + NORTHSTAR_SURFACE_GAP, y: presentationBounds.y, w: frameW, h: 900 }
              : { x: baseCenter.x - frameW / 2, y: baseCenter.y - 450, w: frameW, h: 900 };
          const occupied = objectsRef.current
            .filter(
              (object) =>
                object.semantic?.artifactId !== artifactId &&
                !object.hidden &&
                !isConnectorObject(object),
            )
            .map(getObjectBounds);
          const rect = existingFrame
            ? preferred
            : findFreeRect(preferred, occupied, {
                margin: NORTHSTAR_SURFACE_GAP,
                step: Math.max(460, frameW * 0.28),
              });
          const created = buildEditableResearchWorkspaceObjects({
            artifactId,
            title: args.title?.trim() || `${blueprint?.title || "North Star"} — working surface`,
            researchDigest: blueprint?.researchDigest,
            notes,
            apps: action.assetBundle?.apps ?? [],
            flows: bundleFlows,
            screenshots: bundleScreens,
            rect,
            visibility,
          });
          mutateObjects((current) =>
            replaceArtifactSurface(current, artifactId, "working", stableVisualBoardId([artifactId, "research-workspace"]), created),
          );
          resetTransientEditingState();
          setSelection([]);
          setAiHighlightedIds([]);
          const ids = storeResult(created.map((object) => object.id));
          return {
            ok: true,
            detail: `Created a structured research workspace with ${bundleFlows.length} named reference ${bundleFlows.length === 1 ? "flow" : "flows"}, ${bundleScreens.filter((screen) => Boolean(screen.imageUrl)).length} available screenshots, and ${notes.length} organized research ${notes.length === 1 ? "note" : "notes"}.`,
            objectIds: ids,
            targetLabel: "the North Star research workspace",
          };
        }

        if (action.tool === "update_working_surface") {
          const artifactId = args.artifactId?.trim();
          if (!artifactId) throw new Error("North Star could not identify the active research workspace.");
          const existingFrame = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.semantic?.artifactId === artifactId &&
              object.semantic?.role === "working-frame",
          );

          const parsedSingle = safeParseJson<CanvasCompositionWorkingNote>(args.workingNoteJson);
          const parsedMany = safeParseJson<CanvasCompositionWorkingNote[]>(args.workingNotesJson);
          const plan = safeParseJson<CanvasResearchWorkspacePlan>(args.workspacePlanJson);
          const existingNotes: CanvasCompositionWorkingNote[] = objectsRef.current
            .filter(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) &&
                object.semantic?.artifactId === artifactId &&
                object.semantic?.role === "working-note" &&
                object.semantic?.componentType?.startsWith("research-") === true &&
                Boolean(object.text?.trim()),
            )
            .flatMap((object) => {
              const raw = object.text?.trim() ?? "";
              const [first, ...rest] = raw.split("\n");
              const body = rest.join("\n").trim() || raw;
              if (!body) return [];
              const componentKind = object.semantic?.componentType?.replace(/^research-/, "") ?? "evidence";
              const kind = [
                "objective",
                "constraint",
                "evidence",
                "hypothesis",
                "decision",
                "question",
                "correction",
                "rejected",
                "check",
              ].includes(componentKind)
                ? (componentKind as CanvasCompositionWorkingNote["kind"])
                : "evidence";
              return [{ label: first?.trim() || object.semantic?.label || "Research note", text: body, kind }];
            });
          const planNotes: CanvasCompositionWorkingNote[] = (plan?.regions ?? []).flatMap((region) => {
            const labels = Array.isArray(region.noteLabels) ? region.noteLabels.filter(Boolean) : [];
            if (labels.length === 0) return [];
            return [{
              label: region.title || "Research region",
              text: labels.join(" · "),
              kind:
                region.purpose === "decisions"
                  ? "decision"
                  : region.purpose === "hypotheses"
                    ? "hypothesis"
                    : region.purpose === "questions"
                      ? "question"
                      : region.purpose === "objective"
                        ? "objective"
                        : "evidence",
              evidenceIds: Array.isArray(region.evidenceIds) ? region.evidenceIds : [],
            } satisfies CanvasCompositionWorkingNote];
          });
          const incoming = normalizeWorkingSurfaceNotes([
            ...(parsedMany ?? []),
            ...(parsedSingle ? [parsedSingle] : []),
            ...planNotes,
          ]);
          const deduped = new Map<string, CanvasCompositionWorkingNote>();
          [...existingNotes, ...incoming].forEach((note) => {
            const key = `${note.kind}:${note.label.trim().toLowerCase()}:${note.text.trim().toLowerCase()}`;
            if (!deduped.has(key)) deduped.set(key, note);
          });
          const notes = [...deduped.values()].slice(0, args.executionDepth === "deep" ? 24 : 16);
          const updateBlueprint = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          const bundleFlows = selectCanonicalAssetFlows(action.assetBundle, {
            requestedSession: args.sessionType,
            requestedApps: args.appNames,
            explicitFlowNames: updateBlueprint?.sections.map((section) => section.flowName).filter((value): value is string => Boolean(value)),
            maxFlowsPerApp: 1,
          });
          const bundleScreens = action.assetBundle?.screenshots ?? [];
          const presentationBounds = getArtifactSurfaceBounds(objectsRef.current, artifactId, "presentation");
          const fallbackWidth = args.workingVisibility === "compact" ? 1320 : 1580;
          const fallbackCenter = canvasCenter();
          const fallbackRect: Rect = presentationBounds
            ? {
                x: presentationBounds.x + presentationBounds.w + NORTHSTAR_SURFACE_GAP,
                y: presentationBounds.y,
                w: fallbackWidth,
                h: 900,
              }
            : {
                x: fallbackCenter.x - fallbackWidth / 2,
                y: fallbackCenter.y - 450,
                w: fallbackWidth,
                h: 900,
              };
          const created = buildEditableResearchWorkspaceObjects({
            artifactId,
            title: args.title?.trim() || existingFrame?.semantic?.label || "North Star research workspace",
            researchDigest: plan?.strategy,
            notes,
            apps: action.assetBundle?.apps ?? [],
            flows: bundleFlows,
            screenshots: bundleScreens,
            rect: existingFrame
              ? { x: existingFrame.x, y: existingFrame.y, w: existingFrame.w, h: existingFrame.h }
              : fallbackRect,
            visibility: args.workingVisibility ?? "visible",
          });
          mutateObjects((current) =>
            replaceArtifactSurface(current, artifactId, "working", stableVisualBoardId([artifactId, "research-workspace"]), created),
          );
          resetTransientEditingState();
          setSelection([]);
          setAiHighlightedIds([]);
          const ids = storeResult(created.map((object) => object.id));
          return {
            ok: true,
            detail: `${existingFrame ? "Updated" : "Recovered"} the research workspace with ${notes.length} deduplicated research notes and ${bundleFlows.length} grounded reference ${bundleFlows.length === 1 ? "flow" : "flows"}.`,
            objectIds: ids,
            targetLabel: "the North Star research workspace",
          };
        }

        if (action.tool === "create_artifact_shell") {
          const parsed = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          if (!parsed) throw new Error("North Star could not read the composition blueprint.");
          const artifactId =
            args.artifactId?.trim() || parsed.artifactId || `artifact-${makeId()}`;
          const title = args.title?.trim() || parsed.title?.trim() || "North Star solution";
          const subtitle = args.subtitle?.trim() || parsed.subtitle?.trim() || "";
          const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
          if (sections.length === 0) {
            throw new Error("North Star did not produce any usable artifact sections.");
          }

          const center = canvasCenter();
          const boardW = Math.max(1200, Math.min(5200, parsed.layout?.canvasWidth ?? 2400));
          const boardH = Math.max(900, Math.min(4200, parsed.layout?.canvasHeight ?? 1600));
          const workingBounds = getArtifactSurfaceBounds(
            objectsRef.current,
            artifactId,
            "working",
          );
          const preferredPresentationRect: Rect = workingBounds
            ? {
                x: workingBounds.x - boardW - NORTHSTAR_SURFACE_GAP,
                y: workingBounds.y,
                w: boardW,
                h: boardH,
              }
            : {
                x: center.x - boardW / 2,
                y: center.y - boardH / 2,
                w: boardW,
                h: boardH,
              };
          const occupied = objectsRef.current
            .filter(
              (object) =>
                object.semantic?.artifactId !== artifactId &&
                !isConnectorObject(object) &&
                !object.hidden,
            )
            .map(getObjectBounds);
          if (workingBounds) occupied.push(workingBounds);
          const presentationRect = findFreeRect(preferredPresentationRect, occupied, {
            margin: NORTHSTAR_SURFACE_GAP,
            step: Math.max(520, boardW * 0.28),
          });
          const startX = presentationRect.x;
          const startY = presentationRect.y;

          const frame = createBoxObject("frame", {
            x: startX,
            y: startY,
            w: boardW,
            h: boardH,
          });
          const titleObject = createBoxObject("text", {
            x: startX + 74,
            y: startY + 42,
            w: boardW - 148,
            h: 76,
          });
          const created: CanvasObject[] = [
            {
              ...frame,
              text: "",
              source: { kind: "generated" },
              semantic: { artifactId, role: "artifact-frame", label: title },
              style: {
                ...frame.style,
                fill: "rgba(255,255,255,0.66)",
                stroke: "rgba(148,163,184,0.34)",
                strokeWidth: 1.2,
              },
            },
            {
              ...titleObject,
              text: title,
              textHtml: htmlFromPlainText(title),
              source: { kind: "generated" },
              semantic: { artifactId, role: "artifact-title", label: title },
              style: {
                ...titleObject.style,
                fill: "transparent",
                stroke: "transparent",
                strokeWidth: 0,
                textColor: "#0F172A",
                fontSize: args.audience === "executive" ? 56 : 50,
                fontWeight: 900,
                textAlign: "left",
              },
            },
          ];
          if (subtitle) {
            const subtitleObject = createBoxObject("text", {
              x: startX + 76,
              y: startY + 116,
              w: boardW - 152,
              h: 56,
            });
            created.push({
              ...subtitleObject,
              text: subtitle,
              textHtml: htmlFromPlainText(subtitle),
              source: { kind: "generated" },
              semantic: { artifactId, role: "artifact-subtitle", label: subtitle },
              style: {
                ...subtitleObject.style,
                fill: "transparent",
                stroke: "transparent",
                strokeWidth: 0,
                textColor: "#475569",
                fontSize: 21,
                fontWeight: 520,
                textAlign: "left",
              },
            });
          }

          mutateObjects((current) => [...current, ...created]);
          const ids = storeResult(created.map((object) => object.id));
          return {
            ok: true,
            detail: `Created the adaptive presentation structure for “${title}”.`,
            objectIds: ids,
            targetLabel: `the ${title} artifact`,
          };
        }

        if (action.tool === "add_artifact_section") {
          const parsed = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          const section = safeParseJson<CanvasCompositionSection>(args.sectionJson);
          if (!parsed || !section) {
            throw new Error("North Star could not read the artifact section.");
          }
          const artifactId = args.artifactId?.trim() || parsed.artifactId;
          const frame = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.semantic?.artifactId === artifactId &&
              object.semantic?.role === "artifact-frame",
          );
          if (!frame) {
            throw new Error("North Star could not find the artifact structure for this section.");
          }

          const region =
            parsed.layout?.regions?.find((item) => item.sectionId === section.id) ??
            parsed.layout?.regions?.[Math.max(0, Math.round(args.sectionIndex ?? 0))];
          if (!region) {
            throw new Error(`North Star did not define a layout region for “${section.title}”.`);
          }
          const clampPct = (value: number, fallback: number) =>
            Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
          let cellW = Math.max(320, (clampPct(region.w, 42) / 100) * frame.w);
          let cellH = Math.max(300, (clampPct(region.h, 32) / 100) * frame.h);
          const innerLeft = frame.x + NORTHSTAR_LAYOUT_PADDING;
          const innerRight = frame.x + frame.w - NORTHSTAR_LAYOUT_PADDING;
          const contentTop = frame.y + 190;
          cellW = Math.min(cellW, Math.max(320, innerRight - innerLeft));
          let x = Math.max(
            innerLeft,
            Math.min(
              frame.x + (clampPct(region.x, 5) / 100) * frame.w,
              innerRight - cellW,
            ),
          );
          let y = Math.max(
            contentTop,
            frame.y + (clampPct(region.y, 18) / 100) * frame.h,
          );
          const siblingSectionIds: string[] = Array.from(
            new Set<string>(
              objectsRef.current
                .filter(
                  (object) =>
                    object.semantic?.artifactId === artifactId &&
                    object.semantic?.role === "artifact-section" &&
                    object.semantic?.sectionId &&
                    object.semantic.sectionId !== section.id,
                )
                .map((object) => object.semantic!.sectionId!),
            ),
          );
          const occupiedSectionBounds = siblingSectionIds
            .map((sectionId) => sectionGroupBounds(objectsRef.current, artifactId, sectionId))
            .filter((bounds): bounds is Rect => Boolean(bounds));
          const preferredSectionRect: Rect = { x, y, w: cellW, h: cellH };
          const freeSectionRect = findFreeRect(preferredSectionRect, occupiedSectionBounds, {
            margin: NORTHSTAR_LAYOUT_GAP,
            step: Math.max(260, Math.min(cellW, cellH) * 0.45),
            maxRings: 10,
          });
          const freeFitsHorizontally =
            freeSectionRect.x >= innerLeft &&
            freeSectionRect.x + freeSectionRect.w <= innerRight;
          if (freeFitsHorizontally) {
            x = freeSectionRect.x;
            y = Math.max(contentTop, freeSectionRect.y);
          } else {
            x = innerLeft;
            y = Math.max(
              contentTop,
              occupiedSectionBounds.length > 0
                ? Math.max(...occupiedSectionBounds.map((bounds) => bounds.y + bounds.h)) + NORTHSTAR_LAYOUT_GAP
                : contentTop,
            );
          }
          const created: CanvasObject[] = [];
          const normalizeName = (value?: string) =>
            (value ?? "")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, " ")
              .trim();
          const appKey = normalizeName(section.appName);
          const styleVariant = region.styleVariant ?? "soft";
          const sectionFill =
            styleVariant === "contrast"
              ? "rgba(241,245,249,0.96)"
              : styleVariant === "editorial"
                ? "rgba(255,255,255,0.94)"
                : styleVariant === "minimal"
                  ? "rgba(255,255,255,0.46)"
                  : styleVariant === "plain"
                    ? "rgba(255,255,255,0.78)"
                    : "rgba(248,250,252,0.84)";
          const sectionStroke =
            section.emphasis === "primary" || region.emphasis === "primary"
              ? "rgba(99,102,241,0.58)"
              : "rgba(148,163,184,0.28)";

          const sectionCard = createBoxObject("card", {
            x,
            y,
            w: cellW,
            h: cellH,
          });
          created.push({
            ...sectionCard,
            text: "",
            source: {
              kind: "generated",
              appName: section.appName,
              flowName: section.flowName,
            },
            semantic: {
              artifactId,
              sectionId: section.id,
              role: "artifact-section",
              label: section.title,
            },
            style: {
              ...sectionCard.style,
              fill: sectionFill,
              stroke: sectionStroke,
              strokeWidth:
                section.emphasis === "primary" || region.emphasis === "primary"
                  ? 1.6
                  : 1,
            },
          });

          const matchingApp = (action.assetBundle?.apps ?? []).find(
            (app) => normalizeName(app.name) === appKey,
          );
          let titleX = x + 34;
          if (matchingApp?.iconUrl) {
            const iconSize = Math.min(74, Math.max(48, cellH * 0.09));
            const icon = createBoxObject("image", {
              x: x + 34,
              y: y + 26,
              w: iconSize,
              h: iconSize,
            });
            created.push({
              ...icon,
              text: "",
              imageUrl: matchingApp.iconUrl,
              source: {
                kind: "northstar-flow",
                appName: matchingApp.name,
                appIconUrl: matchingApp.iconUrl,
              },
              semantic: {
                artifactId,
                sectionId: section.id,
                role: "artifact-evidence",
                label: `${matchingApp.name} app icon`,
              },
              style: {
                ...icon.style,
                fill: "transparent",
                stroke: "transparent",
                strokeWidth: 0,
              },
            });
            titleX = x + 34 + iconSize + 18;
          }

          const titleH = Math.min(84, Math.max(58, cellH * 0.1));
          const sectionTitle = createBoxObject("text", {
            x: titleX,
            y: y + 28,
            w: Math.max(180, x + cellW - 34 - titleX),
            h: titleH,
          });
          created.push({
            ...sectionTitle,
            text: section.title,
            textHtml: htmlFromPlainText(section.title),
            source: {
              kind: "generated",
              appName: section.appName,
              flowName: section.flowName,
            },
            semantic: {
              artifactId,
              sectionId: section.id,
              role: "artifact-section",
              label: section.title,
            },
            style: {
              ...sectionTitle.style,
              fill: "transparent",
              stroke: "transparent",
              strokeWidth: 0,
              textColor: "#111827",
              fontSize:
                section.emphasis === "primary" || region.emphasis === "primary"
                  ? 30
                  : 26,
              fontWeight: 820,
              textAlign: "left",
            },
          });

          const allEvidence = (action.assetBundle?.screenshots ?? []).filter(
            (screen) => Boolean(screen.imageUrl),
          );
          const exactEvidence = (section.evidenceIds ?? [])
            .map((id) => allEvidence.find((screen) => screen.id === id))
            .filter((screen): screen is CanvasAIActionAssetScreen => Boolean(screen));
          const scopedEvidence = exactEvidence.filter(
            (screen) => !appKey || normalizeName(screen.appName) === appKey,
          );
          if (section.appName && scopedEvidence.length !== exactEvidence.length) {
            throw new Error(
              `North Star rejected mismatched evidence in the ${section.appName} section.`,
            );
          }
          const maxEvidence = Math.max(
            1,
            Math.min(
              12,
              Math.round(args.maxVisibleEvidence ?? section.evidenceIds.length ?? 6),
            ),
          );
          const evidence = scopedEvidence.slice(0, maxEvidence);
          if (section.appName && evidence.length === 0) {
            throw new Error(
              `North Star could not find verified ${section.appName} evidence for “${section.title}”.`,
            );
          }

          const bodyReserved =
            section.body?.trim() || (section.criteria?.length ?? 0) > 0
              ? Math.max(132, Math.min(230, cellH * 0.25))
              : 34;
          const evidenceTop = y + 116;
          const evidenceBottom = y + cellH - bodyReserved - 28;
          const evidenceZoneH = Math.max(120, evidenceBottom - evidenceTop);
          const evidenceZoneW = Math.max(180, cellW - 68);
          const evidenceGap = Math.max(18, Math.min(40, parsed.layout?.gap ?? 28));
          const layout = region.evidenceLayout ?? "grid";
          const layoutColumns = Math.max(
            1,
            Math.min(
              evidence.length || 1,
              Math.round(
                region.columns ??
                  (layout === "row" || layout === "timeline"
                    ? evidence.length || 1
                    : Math.ceil(Math.sqrt(evidence.length || 1))),
              ),
            ),
          );
          const layoutRows =
            layout === "column"
              ? evidence.length || 1
              : Math.max(1, Math.ceil((evidence.length || 1) / layoutColumns));
          const slotW =
            layout === "column"
              ? evidenceZoneW
              : (evidenceZoneW - Math.max(0, layoutColumns - 1) * evidenceGap) /
                layoutColumns;
          const slotH =
            layout === "row" || layout === "timeline"
              ? evidenceZoneH
              : (evidenceZoneH - Math.max(0, layoutRows - 1) * evidenceGap) /
                layoutRows;
          const timelineImageIds: string[] = [];

          evidence.forEach((screen, evidenceIndex) => {
            if (!screen.imageUrl) return;
            const natural = getCanvasAIAssetScreenSize(screen);
            let col = evidenceIndex % layoutColumns;
            let row = Math.floor(evidenceIndex / layoutColumns);
            if (layout === "column") {
              col = 0;
              row = evidenceIndex;
            }
            let slotX = x + 34 + col * (slotW + evidenceGap);
            let slotY = evidenceTop + row * (slotH + evidenceGap);
            if (layout === "cluster") {
              const clusterCols = Math.max(2, layoutColumns);
              col = evidenceIndex % clusterCols;
              row = Math.floor(evidenceIndex / clusterCols);
              slotX =
                x +
                34 +
                col * Math.max(100, slotW * 0.78) +
                (row % 2) * Math.min(36, slotW * 0.08);
              slotY =
                evidenceTop +
                row * Math.max(120, slotH * 0.72) +
                (col % 2) * Math.min(30, slotH * 0.06);
            }
            const scale = Math.min(
              Math.max(0.08, (slotW - 10) / natural.w),
              Math.max(0.08, (slotH - 10) / natural.h),
            );
            const imageW = Math.max(72, natural.w * scale);
            const imageH = Math.max(92, natural.h * scale);
            const imageX = slotX + Math.max(0, (slotW - imageW) / 2);
            const imageY = slotY + Math.max(0, (slotH - imageH) / 2);
            const image = createBoxObject("image", {
              x: imageX,
              y: imageY,
              w: imageW,
              h: imageH,
            });
            created.push({
              ...image,
              text: screen.name,
              imageUrl: screen.imageUrl,
              source: {
                kind: "northstar-screenshot",
                appName: screen.appName,
                flowName: screen.flowName,
                flowType:
                  screen.sessionType === "onboarding"
                    ? "onboarding"
                    : screen.sessionType === "browsing"
                      ? "browsing"
                      : "unknown",
                screenLabel: screen.name,
                screenshotUrl: screen.imageUrl,
                screenshotFile: screen.sourceUrl,
                stepIndex: screen.index,
                originalWidth: natural.w,
                originalHeight: natural.h,
              },
              semantic: {
                artifactId,
                sectionId: section.id,
                role: "artifact-evidence",
                label: screen.name,
              },
              style: {
                ...image.style,
                fill: "#FFFFFF",
                stroke: "rgba(100,116,139,0.32)",
                strokeWidth: 0.8,
              },
            });
            timelineImageIds.push(image.id);
          });

          if (layout === "timeline" && timelineImageIds.length > 1) {
            for (let index = 0; index < timelineImageIds.length - 1; index += 1) {
              const from = created.find(
                (object): object is CanvasBoxObject =>
                  object.id === timelineImageIds[index] && isBoxObject(object),
              );
              const to = created.find(
                (object): object is CanvasBoxObject =>
                  object.id === timelineImageIds[index + 1] && isBoxObject(object),
              );
              if (!from || !to) continue;
              const connector: CanvasConnectorObject = {
                id: makeId(),
                type: "connector",
                x1: from.x + from.w,
                y1: from.y + from.h / 2,
                x2: to.x,
                y2: to.y + to.h / 2,
                controlOffset: 80,
                startBinding: {
                  objectId: from.id,
                  xRatio: 1,
                  yRatio: 0.5,
                  side: "right",
                },
                endBinding: {
                  objectId: to.id,
                  xRatio: 0,
                  yRatio: 0.5,
                  side: "left",
                },
                style: {
                  stroke: "#64748B",
                  strokeWidth: 2,
                  kind: "curved",
                  end: "arrow",
                  dash: "solid",
                },
                source: { kind: "generated" },
                semantic: {
                  artifactId,
                  sectionId: section.id,
                  role: "artifact-evidence",
                  label: `${section.title} sequence`,
                },
              };
              created.push(connector);
            }
          }

          const bodyText = [
            section.body?.trim(),
            section.criteria?.length
              ? section.criteria.map((criterion) => `• ${criterion}`).join("\n")
              : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          if (bodyText) {
            const bodyCard = createBoxObject("note", {
              x: x + 34,
              y: y + cellH - bodyReserved,
              w: cellW - 68,
              h: bodyReserved - 28,
            });
            created.push({
              ...bodyCard,
              text: bodyText,
              textHtml: htmlFromPlainText(bodyText),
              source: {
                kind: "generated",
                appName: section.appName,
                flowName: section.flowName,
              },
              semantic: {
                artifactId,
                sectionId: section.id,
                role:
                  section.kind === "summary"
                    ? "artifact-summary"
                    : "artifact-insight",
                label: section.title,
              },
              style: {
                ...bodyCard.style,
                fill:
                  section.kind === "recommendation"
                    ? "rgba(220,252,231,0.84)"
                    : styleVariant === "contrast"
                      ? "rgba(15,23,42,0.94)"
                      : "rgba(255,255,255,0.8)",
                stroke: "rgba(148,163,184,0.24)",
                strokeWidth: 1,
                textColor:
                  styleVariant === "contrast" ? "#FFFFFF" : "#334155",
                fontSize: args.audience === "executive" ? 17 : 16,
                fontWeight: 540,
                textAlign: "left",
              },
            });
          }

          const createdBounds = getBoundsForObjects(created);
          const requiredFrameBottom = createdBounds
            ? createdBounds.y + createdBounds.h + NORTHSTAR_LAYOUT_PADDING + 170
            : frame.y + frame.h;
          mutateObjects((current) => {
            let next = current.map((object) =>
              object.id === frame.id && isBoxObject(object)
                ? {
                    ...object,
                    h: Math.max(object.h, requiredFrameBottom - object.y),
                  }
                : object,
            );
            next = [...next, ...created];
            return separateArtifactSurfaces(next, artifactId).objects;
          });
          const ids = storeResult(created.map((object) => object.id));
          return {
            ok: true,
            detail: section.appName
              ? `Built the ${section.appName} section with ${evidence.length} verified ${evidence.length === 1 ? "screenshot" : "screenshots"} in a ${layout} layout.`
              : `Built “${section.title}” in a ${layout} layout.`,
            objectIds: ids,
            targetLabel: `the ${section.title} section`,
          };
        }

        if (action.tool === "add_artifact_summary") {
          const parsed = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          const artifactId = args.artifactId?.trim() || parsed?.artifactId;
          const summary = args.summary?.trim() || parsed?.summary?.trim() || "";
          if (!artifactId || !parsed || !summary) throw new Error("North Star could not read the artifact summary.");
          const frame = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) && object.semantic?.artifactId === artifactId && object.semantic?.role === "artifact-frame",
          );
          if (!frame) throw new Error("North Star could not find the artifact structure for the summary.");
          const padding = 76;
          const sectionObjects = objectsRef.current.filter(
            (object) =>
              object.semantic?.artifactId === artifactId &&
              object.semantic?.sectionId &&
              object.semantic.sectionId !== "artifact-summary" &&
              object.semantic?.role !== "artifact-frame" &&
              !object.hidden,
          );
          const sectionBounds = getBoundsForObjects(sectionObjects);
          const summaryY = Math.max(
            frame.y + 230,
            sectionBounds
              ? sectionBounds.y + sectionBounds.h + NORTHSTAR_LAYOUT_GAP
              : frame.y + frame.h - padding - 132,
          );
          const summaryCard = createBoxObject("card", {
            x: frame.x + padding,
            y: summaryY,
            w: frame.w - padding * 2,
            h: 132,
          });
          const created: CanvasBoxObject = {
            ...summaryCard,
            text: summary,
            textHtml: htmlFromPlainText(summary),
            source: { kind: "generated" },
            semantic: { artifactId, sectionId: "artifact-summary", role: "artifact-summary", label: "Main takeaway" },
            style: {
              ...summaryCard.style,
              fill: "rgba(15,23,42,0.94)",
              stroke: "rgba(255,255,255,0.16)",
              strokeWidth: 1,
              textColor: "#FFFFFF",
              fontSize: args.audience === "executive" ? 24 : 21,
              fontWeight: 680,
              textAlign: "left",
            },
          };
          mutateObjects((current) => {
            let next = current.map((object) =>
              object.id === frame.id && isBoxObject(object)
                ? {
                    ...object,
                    h: Math.max(
                      object.h,
                      summaryY + created.h + padding - object.y,
                    ),
                  }
                : object,
            );
            next = [...next, created];
            return separateArtifactSurfaces(next, artifactId).objects;
          });
          const ids = storeResult([created.id]);
          return {
            ok: true,
            detail: "Added the supported main takeaway.",
            objectIds: ids,
            targetLabel: "the main takeaway",
          };
        }

        if (action.tool === "audit_artifact_semantics") {
          const parsed = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          const artifactId = args.artifactId?.trim() || parsed?.artifactId;
          if (!artifactId || !parsed) throw new Error("North Star could not read the artifact verification plan.");
          const normalizeName = (value?: string) => (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          const allEvidence = (action.assetBundle?.screenshots ?? []).filter((screen) => Boolean(screen.imageUrl));
          const usedScreenIds = new Set<string>();
          let corrected = 0;
          const missing: string[] = [];
          let next = [...objectsRef.current];

          for (const section of parsed.sections ?? []) {
            if (!section.appName) continue;
            const appKey = normalizeName(section.appName);
            const sectionEvidence = next.filter(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) &&
                object.type === "image" &&
                object.semantic?.artifactId === artifactId &&
                object.semantic?.sectionId === section.id &&
                object.semantic?.role === "artifact-evidence" &&
                object.source?.kind === "northstar-screenshot",
            );
            if (sectionEvidence.length === 0) {
              missing.push(section.appName);
              continue;
            }
            for (const object of sectionEvidence) {
              const currentMatches = normalizeName(object.source?.appName) === appKey;
              if (currentMatches) {
                const current = allEvidence.find(
                  (screen) =>
                    screen.imageUrl === object.imageUrl ||
                    (screen.name === object.source?.screenLabel && normalizeName(screen.appName) === appKey),
                );
                if (current) usedScreenIds.add(current.id);
                continue;
              }
              const replacement = allEvidence.find(
                (screen) => normalizeName(screen.appName) === appKey && !usedScreenIds.has(screen.id),
              );
              if (!replacement?.imageUrl) {
                missing.push(section.appName);
                continue;
              }
              const natural = getCanvasAIAssetScreenSize(replacement);
              next = next.map((candidate) =>
                candidate.id === object.id && isBoxObject(candidate)
                  ? {
                      ...candidate,
                      text: replacement.name,
                      imageUrl: replacement.imageUrl,
                      h: candidate.w * (natural.h / natural.w),
                      source: {
                        kind: "northstar-screenshot",
                        appName: replacement.appName,
                        flowName: replacement.flowName,
                        flowType: replacement.sessionType === "onboarding" ? "onboarding" : replacement.sessionType === "browsing" ? "browsing" : "unknown",
                        screenLabel: replacement.name,
                        screenshotUrl: replacement.imageUrl,
                        screenshotFile: replacement.sourceUrl,
                        stepIndex: replacement.index,
                        originalWidth: natural.w,
                        originalHeight: natural.h,
                      },
                      semantic: { ...candidate.semantic, label: replacement.name, sectionId: section.id },
                    }
                  : candidate,
              );
              usedScreenIds.add(replacement.id);
              corrected += 1;
            }
          }

          if (missing.length > 0) {
            throw new Error(`North Star could not verify valid evidence for ${Array.from(new Set(missing)).join(", ")}.`);
          }
          objectsRef.current = normalizeCanvasScene(next);
          setObjects(objectsRef.current);
          const artifactIds = objectsRef.current
            .filter((object) => object.semantic?.artifactId === artifactId && isArtifactPresentationObject(object))
            .map((object) => object.id);
          const ids = storeResult(artifactIds);
          return {
            ok: true,
            detail:
              corrected > 0
                ? `Verified every section's evidence and corrected ${corrected} provenance ${corrected === 1 ? "mismatch" : "mismatches"}.`
                : "Verified that every visible screenshot belongs to the app and section it supports.",
            objectIds: ids,
            targetLabel: "the verified artifact",
          };
        }


        if (action.tool === "compose_artifact") {
          const parsed = safeParseJson<CanvasCompositionBlueprint>(args.compositionJson);
          if (!parsed) {
            throw new Error("North Star could not read the composition blueprint.");
          }
          const artifactId = args.artifactId?.trim() || parsed.artifactId || `artifact-${makeId()}`;
          const artifactType = args.artifactType ?? parsed.artifactType ?? "freeform";
          const title = args.title?.trim() || parsed.title?.trim() || "North Star solution";
          const subtitle = args.subtitle?.trim() || parsed.subtitle?.trim() || "";
          const summary = args.summary?.trim() || parsed.summary?.trim() || "";
          const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
          if (sections.length === 0) {
            throw new Error("North Star did not produce any usable artifact sections.");
          }

          const center = canvasCenter();
          const requestedColumns = Math.max(1, Math.min(4, Math.round(parsed.layout?.columns ?? 2)));
          const columns =
            artifactType === "comparison-board"
              ? Math.min(2, sections.length)
              : artifactType === "journey-map"
                ? Math.min(4, sections.length)
                : artifactType === "screenshot-analysis"
                  ? Math.min(3, sections.length)
                  : artifactType === "strategy-board"
                    ? Math.min(3, sections.length)
                    : Math.min(requestedColumns, sections.length);
          const gap = Math.max(32, Math.min(120, parsed.layout?.gap ?? 52));
          const cellW =
            artifactType === "journey-map"
              ? 470
              : artifactType === "comparison-board"
                ? 760
                : artifactType === "screenshot-analysis"
                  ? 620
                  : 660;
          const cellH =
            artifactType === "journey-map"
              ? 840
              : artifactType === "comparison-board"
                ? 900
                : artifactType === "screenshot-analysis"
                  ? 790
                  : 720;
          const rows = Math.ceil(sections.length / columns);
          const padding = 76;
          const headerH = subtitle ? 185 : 145;
          const summaryH = summary ? 190 : 0;
          const boardW = padding * 2 + columns * cellW + Math.max(0, columns - 1) * gap;
          const boardH = padding * 2 + headerH + rows * cellH + Math.max(0, rows - 1) * gap + summaryH;
          let startX = center.x - boardW / 2;
          let startY = center.y - boardH / 2;
          const existingUserBounds = getBoundsForObjects(
            objectsRef.current.filter(
              (object) =>
                object.semantic?.artifactId !== artifactId &&
                !isConnectorObject(object) &&
                !object.hidden,
            ),
          );
          if (existingUserBounds) {
            const overlapsExisting =
              startX < existingUserBounds.x + existingUserBounds.w + 180 &&
              startX + boardW > existingUserBounds.x - 180 &&
              startY < existingUserBounds.y + existingUserBounds.h + 180 &&
              startY + boardH > existingUserBounds.y - 180;
            if (overlapsExisting) {
              startX = existingUserBounds.x + existingUserBounds.w + 280;
              startY = existingUserBounds.y;
            }
          }
          const created: CanvasObject[] = [];
          const usedEvidence = new Set<string>();
          const selectedCanvasEvidence: CanvasAIActionAssetScreen[] = resolveIds()
            .map((id) => objectsRef.current.find((object) => object.id === id))
            .filter(
              (object): object is CanvasBoxObject =>
                Boolean(
                  object &&
                  isBoxObject(object) &&
                  object.type === "image" &&
                  object.imageUrl,
                ),
            )
            .map((object, index) => ({
              id: object.id,
              name:
                object.source?.screenLabel ??
                object.semantic?.label ??
                object.text ??
                `Selected image ${index + 1}`,
              imageUrl: object.imageUrl,
              sourceUrl: object.source?.screenshotFile,
              appName: object.source?.appName ?? "Canvas",
              flowName: object.source?.flowName ?? "Selected evidence",
              platform:
                object.source?.originalWidth && object.source?.originalHeight &&
                object.source.originalWidth > object.source.originalHeight
                  ? "web"
                  : "mobile",
              sessionType:
                object.source?.flowType === "onboarding" || object.source?.flowType === "browsing"
                  ? object.source.flowType
                  : undefined,
              index: object.source?.stepIndex ?? index,
            }));
          const allEvidence = [
            ...(action.assetBundle?.screenshots ?? []),
            ...selectedCanvasEvidence,
          ];
          const evidenceById = new Map(
            allEvidence.map((screen) => [screen.id, screen]),
          );
          const fallbackEvidence = [...allEvidence];
          const appByName = new Map(
            (action.assetBundle?.apps ?? []).map((app) => [app.name.toLowerCase(), app]),
          );

          const board = createBoxObject("frame", {
            x: startX,
            y: startY,
            w: boardW,
            h: boardH,
          });
          created.push({
            ...board,
            text: "",
            source: { kind: "generated" },
            semantic: {
              artifactId,
              role: "artifact-frame",
              label: title,
            },
            style: {
              ...board.style,
              fill: "rgba(255,255,255,0.64)",
              stroke: "rgba(148,163,184,0.34)",
              strokeWidth: 1.2,
            },
          });

          const titleObject = createBoxObject("text", {
            x: startX + padding,
            y: startY + 42,
            w: boardW - padding * 2,
            h: 72,
          });
          created.push({
            ...titleObject,
            text: title,
            textHtml: htmlFromPlainText(title),
            source: { kind: "generated" },
            semantic: { artifactId, role: "artifact-title", label: title },
            style: {
              ...titleObject.style,
              fill: "transparent",
              stroke: "transparent",
              strokeWidth: 0,
              textColor: "#0F172A",
              fontSize: args.audience === "executive" ? 54 : 50,
              fontWeight: 900,
              textAlign: "left",
            },
          });

          if (subtitle) {
            const subtitleObject = createBoxObject("text", {
              x: startX + padding,
              y: startY + 112,
              w: boardW - padding * 2,
              h: 56,
            });
            created.push({
              ...subtitleObject,
              text: subtitle,
              textHtml: htmlFromPlainText(subtitle),
              source: { kind: "generated" },
              semantic: { artifactId, role: "artifact-subtitle", label: subtitle },
              style: {
                ...subtitleObject.style,
                fill: "transparent",
                stroke: "transparent",
                strokeWidth: 0,
                textColor: "#475569",
                fontSize: 22,
                fontWeight: 520,
                textAlign: "left",
              },
            });
          }

          sections.forEach((section, sectionIndex) => {
            const col = sectionIndex % columns;
            const row = Math.floor(sectionIndex / columns);
            const x = startX + padding + col * (cellW + gap);
            const y = startY + padding + headerH + row * (cellH + gap);
            const sectionCard = createBoxObject("card", { x, y, w: cellW, h: cellH });
            created.push({
              ...sectionCard,
              text: "",
              source: {
                kind: "generated",
                appName: section.appName,
                flowName: section.flowName,
              },
              semantic: {
                artifactId,
                role: "artifact-section",
                label: section.title,
              },
              style: {
                ...sectionCard.style,
                fill:
                  section.emphasis === "primary"
                    ? "rgba(239,246,255,0.88)"
                    : "rgba(248,250,252,0.82)",
                stroke:
                  section.emphasis === "primary"
                    ? "rgba(37,99,235,0.34)"
                    : "rgba(148,163,184,0.25)",
                strokeWidth: section.emphasis === "primary" ? 1.4 : 1,
              },
            });

            let titleX = x + 36;
            const matchingApp = section.appName
              ? appByName.get(section.appName.toLowerCase())
              : undefined;
            if (matchingApp?.iconUrl) {
              const icon = createBoxObject("image", {
                x: x + 34,
                y: y + 28,
                w: 72,
                h: 72,
              });
              created.push({
                ...icon,
                text: "",
                imageUrl: matchingApp.iconUrl,
                source: {
                  kind: "northstar-flow",
                  appName: matchingApp.name,
                  appIconUrl: matchingApp.iconUrl,
                },
                semantic: {
                  artifactId,
                  role: "artifact-evidence",
                  label: `${matchingApp.name} app icon`,
                },
                style: { ...icon.style, fill: "transparent", stroke: "transparent", strokeWidth: 0 },
              });
              titleX = x + 126;
            }

            const sectionTitle = createBoxObject("text", {
              x: titleX,
              y: y + 30,
              w: x + cellW - 34 - titleX,
              h: 70,
            });
            created.push({
              ...sectionTitle,
              text: section.title,
              textHtml: htmlFromPlainText(section.title),
              source: {
                kind: "generated",
                appName: section.appName,
                flowName: section.flowName,
              },
              semantic: {
                artifactId,
                role: "artifact-section",
                label: section.title,
              },
              style: {
                ...sectionTitle.style,
                fill: "transparent",
                stroke: "transparent",
                strokeWidth: 0,
                textColor: "#111827",
                fontSize: 28,
                fontWeight: 820,
                textAlign: "left",
              },
            });

            const desiredIds = Array.isArray(section.evidenceIds) ? section.evidenceIds : [];
            const selectedScreens: CanvasAIActionAssetScreen[] = [];
            desiredIds.forEach((id) => {
              const screen = evidenceById.get(id);
              if (screen?.imageUrl && !usedEvidence.has(screen.id)) {
                selectedScreens.push(screen);
                usedEvidence.add(screen.id);
              }
            });
            while (
              selectedScreens.length < (artifactType === "journey-map" ? 1 : 2) &&
              fallbackEvidence.length > 0
            ) {
              const screen = fallbackEvidence.shift();
              if (screen?.imageUrl && !usedEvidence.has(screen.id)) {
                selectedScreens.push(screen);
                usedEvidence.add(screen.id);
              }
            }
            const maxEvidence = Math.max(1, Math.min(3, Math.round(args.maxVisibleEvidence ?? 6)));
            const evidence = selectedScreens.slice(0, Math.min(maxEvidence, artifactType === "journey-map" ? 1 : 2));
            const evidenceTop = y + 122;
            const availableEvidenceW = cellW - 72;
            const evidenceGap = 24;
            const evidenceSlotW = evidence.length > 1
              ? (availableEvidenceW - evidenceGap) / 2
              : availableEvidenceW;
            let maxEvidenceBottom = evidenceTop;

            evidence.forEach((screen, evidenceIndex) => {
              const natural = getCanvasAIAssetScreenSize(screen);
              const maxW = Math.min(evidenceSlotW, natural.w);
              const scale = maxW / natural.w;
              const imageW = natural.w * scale;
              const imageH = natural.h * scale;
              const imageX =
                x + 36 + evidenceIndex * (evidenceSlotW + evidenceGap) + (evidenceSlotW - imageW) / 2;
              const image = createBoxObject("image", {
                x: imageX,
                y: evidenceTop,
                w: imageW,
                h: imageH,
              });
              created.push({
                ...image,
                text: screen.name,
                imageUrl: screen.imageUrl,
                source: {
                  kind: "northstar-screenshot",
                  appName: screen.appName,
                  flowName: screen.flowName,
                  flowType:
                    screen.sessionType === "onboarding"
                      ? "onboarding"
                      : screen.sessionType === "browsing"
                        ? "browsing"
                        : "unknown",
                  screenLabel: screen.name,
                  screenshotUrl: screen.imageUrl,
                  screenshotFile: screen.sourceUrl,
                  stepIndex: screen.index,
                  originalWidth: natural.w,
                  originalHeight: natural.h,
                },
                semantic: {
                  artifactId,
                  role: "artifact-evidence",
                  label: screen.name,
                },
                style: {
                  ...image.style,
                  fill: "#FFFFFF",
                  stroke: "rgba(100,116,139,0.34)",
                  strokeWidth: 0.8,
                },
              });
              maxEvidenceBottom = Math.max(maxEvidenceBottom, evidenceTop + imageH);
            });

            const bodyTop = Math.max(evidenceTop + 40, maxEvidenceBottom + 30);
            const bodyHeight = Math.max(120, y + cellH - 34 - bodyTop);
            if (section.body?.trim()) {
              const bodyCard = createBoxObject("note", {
                x: x + 36,
                y: bodyTop,
                w: cellW - 72,
                h: bodyHeight,
              });
              created.push({
                ...bodyCard,
                text: section.body.trim(),
                textHtml: htmlFromPlainText(section.body.trim()),
                source: {
                  kind: "generated",
                  appName: section.appName,
                  flowName: section.flowName,
                },
                semantic: {
                  artifactId,
                  role:
                    section.kind === "recommendation"
                      ? "artifact-insight"
                      : section.kind === "summary"
                        ? "artifact-summary"
                        : "artifact-insight",
                  label: section.title,
                },
                style: {
                  ...bodyCard.style,
                  fill:
                    section.kind === "recommendation"
                      ? "rgba(220,252,231,0.82)"
                      : "rgba(255,255,255,0.78)",
                  stroke: "rgba(148,163,184,0.24)",
                  strokeWidth: 1,
                  textColor: "#334155",
                  fontSize: args.audience === "executive" ? 17 : 16,
                  fontWeight: 520,
                  textAlign: "left",
                },
              });
            }
          });

          if (summary) {
            const summaryY = startY + boardH - padding - 132;
            const summaryCard = createBoxObject("card", {
              x: startX + padding,
              y: summaryY,
              w: boardW - padding * 2,
              h: 132,
            });
            created.push({
              ...summaryCard,
              text: summary,
              textHtml: htmlFromPlainText(summary),
              source: { kind: "generated" },
              semantic: {
                artifactId,
                role: "artifact-summary",
                label: "Main takeaway",
              },
              style: {
                ...summaryCard.style,
                fill: "rgba(15,23,42,0.94)",
                stroke: "rgba(255,255,255,0.16)",
                strokeWidth: 1,
                textColor: "#FFFFFF",
                fontSize: args.audience === "executive" ? 24 : 21,
                fontWeight: 680,
                textAlign: "left",
              },
            });
          }

          mutateObjects((current) => [...current, ...created]);
          const ids = storeResult(created.map((object) => object.id));
          return {
            ok: true,
            detail: `Built ${title} as a ${compositionTypeLabel(artifactType)} with ${sections.length} ${sections.length === 1 ? "section" : "sections"}.`,
            objectIds: ids,
            targetLabel: `the ${title} artifact`,
          };
        }

        if (action.tool === "review_artifact_layout") {
          const artifactId = args.artifactId?.trim();
          const codeArtifactObject = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.type === "code-artifact" &&
              (!artifactId || object.codeArtifact?.artifactId === artifactId),
          );
          if (codeArtifactObject?.codeArtifact) {
            const artifact = codeArtifactObject.codeArtifact;
            const ratio = artifact.preferredWidth / Math.max(1, artifact.preferredHeight);
            const actualRatio = codeArtifactObject.w / Math.max(1, codeArtifactObject.h);
            if (Math.abs(ratio - actualRatio) > 0.025) {
              const nextHeight = codeArtifactObject.w / ratio;
              mutateObjects((current) =>
                current.map((object) =>
                  object.id === codeArtifactObject.id && isBoxObject(object)
                    ? { ...object, h: nextHeight }
                    : object,
                ),
              );
            }
            resetTransientEditingState();
            const ids = storeResult([codeArtifactObject.id]);
            const runtimeReview = artifact.runtimeReview;
            const runtimeIssueCount = runtimeReview
              ? runtimeReview.overflowElementCount +
                runtimeReview.clippedTextCount +
                runtimeReview.smallTextCount +
                runtimeReview.tinyInteractiveCount +
                runtimeReview.missingImageCount +
                (runtimeReview.documentScrollRisk ? 1 : 0)
              : 0;
            return {
              ok: true,
              detail: runtimeReview
                ? runtimeIssueCount > 0
                  ? `Reviewed the live generated artifact. Proportional Canvas behavior is stable, and the runtime audit recorded ${runtimeIssueCount} potential visual ${runtimeIssueCount === 1 ? "issue" : "issues"} for the next creative revision: ${runtimeReview.summary}`
                  : `Reviewed the live generated artifact and confirmed proportional Canvas behavior. ${runtimeReview.summary}`
                : "Reviewed the generated artifact and confirmed a bounded full-canvas composition, proportional scaling, grounded runtime data, and stable native Canvas interaction. The runtime audit will attach after the iframe completes its first layout pass.",
              objectIds: ids,
              targetLabel: artifact.title,
            };
          }
          const candidateIds = new Set(resolveIds());
          const artifactObjects = objectsRef.current.filter((object) =>
            artifactId
              ? object.semantic?.artifactId === artifactId && isArtifactPresentationObject(object)
              : candidateIds.has(object.id),
          );
          if (artifactObjects.length === 0) {
            throw new Error("North Star could not find the generated artifact to review.");
          }

          const resolvedArtifactId =
            artifactId ??
            artifactObjects.find((object) => object.semantic?.artifactId)?.semantic?.artifactId;
          if (!resolvedArtifactId) {
            throw new Error("North Star could not identify the artifact being reviewed.");
          }

          let ratioCorrections = 0;
          let textCorrections = 0;
          let spatialCorrections = 0;
          const artifactIds = new Set(artifactObjects.map((object) => object.id));
          let next = objectsRef.current.map((object) => {
            if (!artifactIds.has(object.id) || !isBoxObject(object)) return object;
            let updated = object;
            if (
              object.type === "image" &&
              object.source?.kind === "northstar-screenshot" &&
              object.semantic?.role !== "visual-flow-screen" &&
              object.source.originalWidth &&
              object.source.originalHeight
            ) {
              const ratio = object.source.originalHeight / object.source.originalWidth;
              const expectedH = object.w * ratio;
              if (Math.abs(expectedH - object.h) > 1) {
                updated = { ...updated, h: expectedH };
                ratioCorrections += 1;
              }
            }
            if (
              isTextEditableBox(object.type) &&
              !object.semantic?.role?.startsWith("visual-") &&
              typeof object.text === "string" &&
              object.text.trim()
            ) {
              const fontSize = object.style.fontSize || 16;
              const charsPerLine = Math.max(
                12,
                Math.floor(object.w / Math.max(7, fontSize * 0.55)),
              );
              const estimatedLines = Math.max(
                object.text.split("\n").length,
                Math.ceil(object.text.length / charsPerLine),
              );
              const minimumHeight = Math.max(
                48,
                estimatedLines * fontSize * 1.42 + 26,
              );
              if (minimumHeight > updated.h) {
                updated = { ...updated, h: minimumHeight };
                textCorrections += 1;
              }
            }
            return updated;
          });

          const frame = next.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.semantic?.artifactId === resolvedArtifactId &&
              isArtifactPresentationObject(object) &&
              (object.semantic?.role === "visual-root" || object.semantic?.role === "artifact-frame"),
          );
          if (!frame) {
            throw new Error("North Star could not find the presentation surface root.");
          }

          // Native semantic scenes own their internal layout. The legacy section packer
          // must never reposition their independently editable children.
          if (frame.semantic?.role === "visual-root") {
            next = reflowSemanticTree(next, [frame.id]);
            next = resolveNativeCompositionCollisions(next, frame.id, NORTHSTAR_LAYOUT_GAP);
            let presentationObjects = next.filter(
              (object) => object.semantic?.artifactId === resolvedArtifactId && isArtifactPresentationObject(object),
            );
            let rootChildren = presentationObjects.filter(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) && object.semantic?.parentId === frame.id && !object.hidden,
            );
            const childBounds = getBoundsForObjects(
              presentationObjects.filter((object) => object.id !== frame.id),
            );
            if (childBounds) {
              const requiredW = Math.max(frame.w, childBounds.x + childBounds.w - frame.x + NORTHSTAR_LAYOUT_PADDING);
              const requiredH = Math.max(frame.h, childBounds.y + childBounds.h - frame.y + NORTHSTAR_LAYOUT_PADDING);
              if (requiredW !== frame.w || requiredH !== frame.h) {
                next = next.map((object) =>
                  object.id === frame.id && isBoxObject(object)
                    ? { ...object, w: requiredW, h: requiredH }
                    : object,
                );
                spatialCorrections += 1;
              }
            }
            presentationObjects = next.filter(
              (object) => object.semantic?.artifactId === resolvedArtifactId && isArtifactPresentationObject(object),
            );
            rootChildren = presentationObjects.filter(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) && object.semantic?.parentId === frame.id && !object.hidden,
            );
            const unresolvedOverlap = rootChildren.some((candidate, first) =>
              rootChildren.some((other, second) => first < second && rectsOverlap(getObjectBounds(candidate), getObjectBounds(other), 2)),
            );
            if (unresolvedOverlap) {
              throw new Error("North Star could not resolve overlapping top-level presentation regions without damaging the composition.");
            }
            const separated = separateArtifactSurfaces(next, resolvedArtifactId);
            next = separated.objects;
            if (separated.moved) spatialCorrections += 1;
            const normalized = normalizeCanvasScene(next);
            objectsRef.current = normalized;
            setObjects(normalized);
            resetTransientEditingState();
            selectedIdsRef.current = [];
            setSelectedIds([]);
            setAiHighlightedIds([]);
            const ids = storeResult(
              normalized
                .filter((object) => object.semantic?.artifactId === resolvedArtifactId && isArtifactPresentationObject(object))
                .map((object) => object.id),
            );
            return {
              ok: true,
              detail: spatialCorrections > 0
                ? `Reviewed the editable composition and corrected ${spatialCorrections} surface or containment ${spatialCorrections === 1 ? "issue" : "issues"}.`
                : "Reviewed the editable composition and confirmed stable surface ownership, containment, and top-level spacing.",
              objectIds: ids,
              targetLabel: frame.semantic?.label || "the completed visual composition",
            };
          }

          const sectionIds: string[] = Array.from(
            new Set<string>(
              next
                .filter(
                  (object) =>
                    object.semantic?.artifactId === resolvedArtifactId &&
                    object.semantic?.sectionId &&
                    object.semantic.sectionId !== "artifact-summary" &&
                    object.semantic?.role === "artifact-section",
                )
                .map((object) => object.semantic!.sectionId!),
            ),
          );

          // First make each section card contain its own title, evidence and insight content.
          for (const sectionId of sectionIds) {
            const sectionObjects = next.filter(
              (object) =>
                object.semantic?.artifactId === resolvedArtifactId &&
                object.semantic?.sectionId === sectionId,
            );
            const sectionCard = sectionObjects
              .filter(
                (object): object is CanvasBoxObject =>
                  isBoxObject(object) &&
                  object.semantic?.role === "artifact-section" &&
                  object.type === "card",
              )
              .sort((a, b) => b.w * b.h - a.w * a.h)[0];
            const childBounds = getBoundsForObjects(
              sectionObjects.filter((object) => object.id !== sectionCard?.id),
            );
            if (!sectionCard || !childBounds) continue;
            const requiredRight = childBounds.x + childBounds.w + 30;
            const requiredBottom = childBounds.y + childBounds.h + 30;
            const nextW = Math.max(sectionCard.w, requiredRight - sectionCard.x);
            const nextH = Math.max(sectionCard.h, requiredBottom - sectionCard.y);
            if (nextW > sectionCard.w + 1 || nextH > sectionCard.h + 1) {
              next = next.map((object) =>
                object.id === sectionCard.id && isBoxObject(object)
                  ? { ...object, w: nextW, h: nextH }
                  : object,
              );
              spatialCorrections += 1;
            }
          }

          const sectionEntries = sectionIds
            .map((sectionId) => ({
              sectionId,
              bounds: sectionGroupBounds(next, resolvedArtifactId, sectionId),
            }))
            .filter(
              (entry): entry is { sectionId: string; bounds: Rect } =>
                Boolean(entry.bounds),
            )
            .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);

          const hasSectionCollision = sectionEntries.some((entry, index) =>
            sectionEntries
              .slice(index + 1)
              .some((other) => rectsOverlap(entry.bounds, other.bounds, 12)),
          );

          if (hasSectionCollision) {
            const innerLeft = frame.x + NORTHSTAR_LAYOUT_PADDING;
            const innerRight = frame.x + frame.w - NORTHSTAR_LAYOUT_PADDING;
            let cursorX = innerLeft;
            let cursorY = frame.y + 190;
            let rowHeight = 0;

            for (const entry of sectionEntries) {
              const availableWidth = Math.max(320, innerRight - innerLeft);
              const groupW = Math.min(entry.bounds.w, availableWidth);
              if (
                cursorX > innerLeft &&
                cursorX + groupW > innerRight
              ) {
                cursorX = innerLeft;
                cursorY += rowHeight + NORTHSTAR_LAYOUT_GAP;
                rowHeight = 0;
              }
              const dx = cursorX - entry.bounds.x;
              const dy = cursorY - entry.bounds.y;
              if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                next = translateSectionGroup(
                  next,
                  resolvedArtifactId,
                  entry.sectionId,
                  dx,
                  dy,
                );
                spatialCorrections += 1;
              }
              cursorX += groupW + NORTHSTAR_LAYOUT_GAP;
              rowHeight = Math.max(rowHeight, entry.bounds.h);
            }
          }

          const packedSectionBounds = getBoundsForObjects(
            next.filter(
              (object) =>
                object.semantic?.artifactId === resolvedArtifactId &&
                object.semantic?.sectionId &&
                object.semantic.sectionId !== "artifact-summary",
            ),
          );
          const mainSummaryObjects = next.filter(
            (object) =>
              object.semantic?.artifactId === resolvedArtifactId &&
              object.semantic?.sectionId === "artifact-summary",
          );
          const mainSummaryBounds = getBoundsForObjects(mainSummaryObjects);
          if (packedSectionBounds && mainSummaryBounds) {
            const targetSummaryY =
              packedSectionBounds.y + packedSectionBounds.h + NORTHSTAR_LAYOUT_GAP;
            const dy = targetSummaryY - mainSummaryBounds.y;
            if (Math.abs(dy) > 1) {
              next = translateSectionGroup(
                next,
                resolvedArtifactId,
                "artifact-summary",
                0,
                dy,
              );
              spatialCorrections += 1;
            }
          }

          const presentationChildren = next.filter(
            (object) =>
              object.semantic?.artifactId === resolvedArtifactId &&
              isArtifactPresentationObject(object) &&
              object.semantic?.role !== "artifact-frame",
          );
          const bounds = getBoundsForObjects(presentationChildren);
          if (bounds) {
            next = next.map((object) => {
              if (
                !isBoxObject(object) ||
                object.semantic?.artifactId !== resolvedArtifactId ||
                object.semantic?.role !== "artifact-frame"
              ) {
                return object;
              }
              return {
                ...object,
                x: bounds.x - NORTHSTAR_LAYOUT_PADDING,
                y: bounds.y - NORTHSTAR_LAYOUT_PADDING,
                w: bounds.w + NORTHSTAR_LAYOUT_PADDING * 2,
                h: bounds.h + NORTHSTAR_LAYOUT_PADDING * 2,
              };
            });
          }

          const separated = separateArtifactSurfaces(next, resolvedArtifactId);
          next = separated.objects;
          if (separated.moved) spatialCorrections += 1;

          const unresolvedCollisions = countMajorPresentationCollisions(
            next,
            resolvedArtifactId,
          );
          const workingBounds = getArtifactSurfaceBounds(
            next,
            resolvedArtifactId,
            "working",
          );
          const presentationBounds = getArtifactSurfaceBounds(
            next,
            resolvedArtifactId,
            "presentation",
          );
          const surfacesStillOverlap = Boolean(
            workingBounds &&
              presentationBounds &&
              rectsOverlap(
                workingBounds,
                presentationBounds,
                NORTHSTAR_SURFACE_GAP / 3,
              ),
          );

          if (unresolvedCollisions > 0 || surfacesStillOverlap) {
            throw new Error(
              "North Star could not produce a clean non-overlapping presentation layout.",
            );
          }

          objectsRef.current = normalizeCanvasScene(next);
          setObjects(objectsRef.current);
          resetTransientEditingState();
          selectedIdsRef.current = [];
          setSelectedIds([]);
          setAiHighlightedIds([]);

          const ids = storeResult(
            objectsRef.current
              .filter(
                (object) =>
                  object.semantic?.artifactId === resolvedArtifactId &&
                  isArtifactPresentationObject(object),
              )
              .map((object) => object.id),
          );
          const correctionCount =
            ratioCorrections + textCorrections + spatialCorrections;
          return {
            ok: true,
            detail:
              correctionCount > 0
                ? `Reviewed the live artifact and corrected ${correctionCount} presentation ${correctionCount === 1 ? "issue" : "issues"}, including collision and surface separation checks.`
                : "Reviewed the live artifact and confirmed its spacing, containment, screenshot proportions, and surface separation.",
            objectIds: ids,
            targetLabel: "the completed artifact",
          };
        }

        if (action.tool === "refine_artifact_presentation") {
          const artifactId = args.artifactId?.trim();
          const codeArtifactAction = safeParseJson<unknown>(args.compositionJson);
          const codeArtifactObject = objectsRef.current.find(
            (object): object is CanvasBoxObject =>
              isBoxObject(object) &&
              object.type === "code-artifact" &&
              (!artifactId || object.codeArtifact?.artifactId === artifactId),
          );
          if (codeArtifactObject?.codeArtifact && isCanvasCodeArtifactActionEnvelope(codeArtifactAction)) {
            const updatedArtifact = applyCanvasCodeArtifactStage(
              codeArtifactObject.codeArtifact,
              codeArtifactAction.stageIndex,
            );
            mutateObjects((current) =>
              current.map((object) =>
                object.id === codeArtifactObject.id && isBoxObject(object)
                  ? {
                      ...object,
                      text: updatedArtifact.title,
                      codeArtifact: updatedArtifact,
                      semantic: {
                        ...object.semantic,
                        sceneRevision: updatedArtifact.revisionId,
                        label: updatedArtifact.title,
                      },
                    }
                  : object,
              ),
            );
            resetTransientEditingState();
            setSelection([codeArtifactObject.id]);
            const ids = storeResult([codeArtifactObject.id]);
            const stage = updatedArtifact.stagePlan?.[updatedArtifact.activeStageIndex ?? 0];
            return {
              ok: true,
              detail: updatedArtifact.buildState.isBuilding
                ? `Updated the same generated artifact with the ${stage?.label?.toLowerCase() ?? "next"} stage.`
                : `Completed and refined “${updatedArtifact.title}” as one coherent generated artifact.`,
              objectIds: ids,
              targetLabel: updatedArtifact.title,
            };
          }
          const candidateIds = new Set(resolveIds());
          const targetObjects = objectsRef.current.filter((object) =>
            artifactId
              ? object.semantic?.artifactId === artifactId
              : candidateIds.has(object.id),
          );
          if (targetObjects.length === 0) {
            throw new Error("North Star could not find the artifact to refine.");
          }
          const targetIds = new Set(targetObjects.map((object) => object.id));
          const audience = args.audience ?? "general";
          const visibility = args.workingVisibility ?? "visible";
          let refinedCount = 0;
          let next = objectsRef.current.map((object) => {
            if (!targetIds.has(object.id) || !isBoxObject(object)) return object;
            const role = object.semantic?.role;
            let style = object.style;
            let changed = false;
            if (role === "artifact-title") {
              style = { ...style, fontSize: audience === "executive" ? 58 : 52, fontWeight: 900 };
              changed = true;
            } else if (role === "artifact-subtitle") {
              style = { ...style, fontSize: 22, textColor: "#475569", fontWeight: 520 };
              changed = true;
            } else if (role === "artifact-summary") {
              style = {
                ...style,
                fontSize: audience === "executive" ? 25 : 22,
                fontWeight: 700,
              };
              changed = true;
            } else if (role === "artifact-insight") {
              style = { ...style, fontSize: audience === "executive" ? 17 : 16, fontWeight: 540 };
              changed = true;
            } else if (role === "working-note" && visibility === "compact") {
              style = { ...style, fontSize: 14 };
              changed = true;
            }
            if (changed) refinedCount += 1;
            return changed ? { ...object, style } : object;
          });

          if (artifactId && visibility === "compact") {
            const working = next.filter(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) &&
                object.semantic?.artifactId === artifactId &&
                object.semantic?.role === "working-note",
            );
            const frame = next.find(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) &&
                object.semantic?.artifactId === artifactId &&
                object.semantic?.role === "working-frame",
            );
            if (frame && working.length > 0) {
              const gap = 18;
              const columns = 2;
              const cardW = Math.max(250, (frame.w - 100 - gap) / columns);
              next = next.map((object) => {
                if (!isBoxObject(object) || object.semantic?.artifactId !== artifactId) return object;
                if (object.semantic?.role === "working-note") {
                  const index = working.findIndex((item) => item.id === object.id);
                  const col = index % columns;
                  const row = Math.floor(index / columns);
                  return {
                    ...object,
                    x: frame.x + 40 + col * (cardW + gap),
                    y: frame.y + 120 + row * 150,
                    w: cardW,
                    h: 132,
                  };
                }
                return object;
              });
            }
          }

          if (artifactId) {
            const separated = separateArtifactSurfaces(next, artifactId);
            next = separated.objects;
            const unresolvedCollisions = countMajorPresentationCollisions(
              next,
              artifactId,
            );
            if (unresolvedCollisions > 0) {
              throw new Error(
                "North Star could not finish presentation refinement without overlapping sections.",
              );
            }
          }
          objectsRef.current = normalizeCanvasScene(next);
          setObjects(objectsRef.current);
          resetTransientEditingState();
          selectedIdsRef.current = [];
          setSelectedIds([]);
          setAiHighlightedIds([]);
          const ids = storeResult(
            objectsRef.current
              .filter((object) => artifactId ? object.semantic?.artifactId === artifactId && isArtifactPresentationObject(object) : targetIds.has(object.id))
              .map((object) => object.id),
          );
          return {
            ok: true,
            detail: `Refined the artifact's hierarchy and presentation for a ${audience} audience.`,
            objectIds: ids,
            targetLabel: "the completed artifact",
          };
        }

        if (action.tool === "move_objects") {
          const ids = resolveIds();
          if (ids.length === 0) throw new Error("There are no matching objects to move.");
          const dx = args.offsetX ?? 0;
          const dy = args.offsetY ?? 0;
          mutateObjects((current) =>
            current.map((object) => {
              if (!ids.includes(object.id)) return object;
              if (isConnectorObject(object)) {
                return {
                  ...object,
                  x1: object.x1 + dx,
                  y1: object.y1 + dy,
                  x2: object.x2 + dx,
                  y2: object.y2 + dy,
                  controlX:
                    typeof object.controlX === "number" ? object.controlX + dx : object.controlX,
                  controlY:
                    typeof object.controlY === "number" ? object.controlY + dy : object.controlY,
                };
              }
              return { ...object, x: object.x + dx, y: object.y + dy };
            })
          );
          setSelection(ids);
          return {
            ok: true,
            detail: `Moved ${describeIds(ids)}.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "align_objects") {
          const ids = resolveIds();
          const boxes = objectsRef.current.filter(
            (object): object is CanvasBoxObject => ids.includes(object.id) && isBoxObject(object)
          );
          if (boxes.length < 2) throw new Error("Select at least two objects to align them.");
          const bounds = getBoundsForObjects(boxes);
          if (!bounds) throw new Error("North Star could not measure those objects.");
          const alignment = args.alignment ?? "center";
          mutateObjects((current) =>
            current.map((object) => {
              if (!isBoxObject(object) || !ids.includes(object.id)) return object;
              if (alignment === "left") return { ...object, x: bounds.x };
              if (alignment === "center") return { ...object, x: bounds.x + bounds.w / 2 - object.w / 2 };
              if (alignment === "right") return { ...object, x: bounds.x + bounds.w - object.w };
              if (alignment === "top") return { ...object, y: bounds.y };
              if (alignment === "middle") return { ...object, y: bounds.y + bounds.h / 2 - object.h / 2 };
              return { ...object, y: bounds.y + bounds.h - object.h };
            })
          );
          setSelection(ids);
          return {
            ok: true,
            detail: `Aligned ${describeIds(ids)}.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "distribute_objects") {
          const ids = resolveIds();
          const boxes = objectsRef.current.filter(
            (object): object is CanvasBoxObject => ids.includes(object.id) && isBoxObject(object)
          );
          if (boxes.length < 3) throw new Error("Select at least three objects to distribute them.");
          const axis = args.axis ?? "horizontal";
          const sorted = [...boxes].sort((a, b) =>
            axis === "horizontal" ? a.x - b.x : a.y - b.y
          );
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          const totalSize = sorted.reduce(
            (sum, object) => sum + (axis === "horizontal" ? object.w : object.h),
            0
          );
          const extent =
            axis === "horizontal"
              ? last.x + last.w - first.x
              : last.y + last.h - first.y;
          const gap = (extent - totalSize) / Math.max(1, sorted.length - 1);
          const nextPositions = new Map<string, number>();
          let cursor = axis === "horizontal" ? first.x : first.y;
          sorted.forEach((object) => {
            nextPositions.set(object.id, cursor);
            cursor += (axis === "horizontal" ? object.w : object.h) + gap;
          });
          mutateObjects((current) =>
            current.map((object) => {
              if (!isBoxObject(object) || !nextPositions.has(object.id)) return object;
              return axis === "horizontal"
                ? { ...object, x: nextPositions.get(object.id)! }
                : { ...object, y: nextPositions.get(object.id)! };
            })
          );
          setSelection(ids);
          return {
            ok: true,
            detail: `Distributed ${describeIds(ids)} ${axis}ly.`,
            objectIds: ids,
            targetLabel: describeIds(ids),
          };
        }

        if (action.tool === "select_objects") {
          const ids = resolveIds();
          const selected = ids.length > 0 ? setSelection(ids) : setSelection(runCreated);
          if (selected.length === 0) throw new Error("North Star could not find those canvas objects.");
          return {
            ok: true,
            detail: `Selected ${describeIds(selected)}.`,
            objectIds: selected,
            targetLabel: describeIds(selected),
          };
        }

        if (action.tool === "focus_objects") {
          const ids = resolveIds();
          const targetIds =
            ids.length > 0
              ? ids
              : aiRunCreatedIdsRef.current.get(runId) ?? [];
          if (targetIds.length === 0) {
            throw new Error("North Star could not find anything to focus.");
          }
          if (args.selectAfter === false) {
            const targetObjects = objectsRef.current.filter((object) =>
              targetIds.includes(object.id),
            );
            resetTransientEditingState();
            selectedIdsRef.current = [];
            setSelectedIds([]);
            setAiHighlightedIds([]);
            if (targetObjects.some((object) =>
              isBoxObject(object) &&
              (object.type === "visual-board" || object.semantic?.role === "visual-root" || object.w >= 1200 || object.h >= 800)
            )) {
              fitViewportToObjects(targetObjects);
            } else {
              centerViewportOnObjects(targetObjects);
            }
          } else {
            focusAIReference(targetIds);
          }
          return {
            ok: true,
            detail: `Centered ${describeIds(targetIds)} in view.`,
            objectIds: targetIds,
            targetLabel: describeIds(targetIds),
          };
        }

        throw new Error("This canvas action is not supported yet.");
      } catch (error) {
        return {
          ok: false,
          detail:
            error instanceof Error
              ? error.message
              : "North Star could not apply this canvas action.",
          objectIds: [],
        };
      }
    },
    [
      centerViewportOnObjects,
      fitViewportToObjects,
      commitAIActionRunHistory,
      focusAIReference,
      insertWorkspaceAppIcon,
      insertWorkspaceFlow,
      insertWorkspaceScreen,
      resetTransientEditingState,
      screenToWorld,
    ]
  );

  const beginWorkspaceScreenDrag = useCallback(
    (app: WorkspaceApp, flow: WorkspaceAppFlow, screen: WorkspaceAppScreen, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !screen.imageUrl) return;

      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      let didDrag = false;

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
      };

      const getCanvasHit = (clientX: number, clientY: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { inside: false, point: null as { x: number; y: number } | null };

        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;

        return { inside, point: inside ? screenToWorld(clientX, clientY) : null };
      };

      const handlePointerMove = (nativeEvent: PointerEvent) => {
        const movedDistance = Math.hypot(
          nativeEvent.clientX - startClientX,
          nativeEvent.clientY - startClientY
        );

        if (!didDrag && movedDistance < 5) return;

        didDrag = true;
        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);

        setWorkspaceScreenDrag({
          screen,
          clientX: nativeEvent.clientX,
          clientY: nativeEvent.clientY,
          overCanvas: hit.inside,
        });
        setGhostPoint(hit.point);
        setDraftBox(null);
        setPlacementTool(null);
        setActiveTool("select");
        setSelectedIds([]);
        setColorPopover(null);
      };

      const handlePointerUp = (nativeEvent: PointerEvent) => {
        cleanup();

        if (!didDrag) {
          insertWorkspaceScreen(app, flow, screen);
          setWorkspaceScreenDrag(null);
          setGhostPoint(null);
          return;
        }

        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);
        if (hit.inside) {
          insertWorkspaceScreen(app, flow, screen, { x: nativeEvent.clientX, y: nativeEvent.clientY });
        }

        setWorkspaceScreenDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      const handlePointerCancel = () => {
        cleanup();
        setWorkspaceScreenDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
    },
    [insertWorkspaceScreen, screenToWorld]
  );

  const insertChatCanvasAsset = useCallback(
    (asset: ChatCanvasAsset, clientPoint?: { x: number; y: number }) => {
      if (asset.kind === "app") {
        insertWorkspaceAppIcon(asset.app, clientPoint);
        return;
      }
      if (asset.kind === "flow") {
        insertWorkspaceFlow(asset.app, asset.flow, clientPoint);
        return;
      }
      if (asset.kind === "screen") {
        insertWorkspaceScreen(asset.app, asset.flow, asset.screen, clientPoint);
        return;
      }
      insertChatImage(asset.name, asset.imageUrl, clientPoint);
    },
    [insertChatImage, insertWorkspaceAppIcon, insertWorkspaceFlow, insertWorkspaceScreen]
  );

  const beginChatCanvasAssetDrag = useCallback(
    (
      asset: ChatCanvasAsset,
      event: ReactPointerEvent<HTMLElement>,
      onActivate?: () => void
    ) => {
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      let didDrag = false;

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
      };

      const getCanvasHit = (clientX: number, clientY: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { inside: false, point: null as { x: number; y: number } | null };
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        return { inside, point: inside ? screenToWorld(clientX, clientY) : null };
      };

      const handlePointerMove = (nativeEvent: PointerEvent) => {
        const movedDistance = Math.hypot(
          nativeEvent.clientX - startClientX,
          nativeEvent.clientY - startClientY
        );
        if (!didDrag && movedDistance < 5) return;

        didDrag = true;
        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);
        setChatCanvasAssetDrag({
          asset,
          clientX: nativeEvent.clientX,
          clientY: nativeEvent.clientY,
          overCanvas: hit.inside,
        });
        setGhostPoint(hit.point);
        setDraftBox(null);
        setPlacementTool(null);
        setActiveTool("select");
        setSelectedIds([]);
        setColorPopover(null);
      };

      const handlePointerUp = (nativeEvent: PointerEvent) => {
        cleanup();

        if (!didDrag) {
          setChatCanvasAssetDrag(null);
          setGhostPoint(null);
          onActivate?.();
          return;
        }

        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);
        if (hit.inside) {
          insertChatCanvasAsset(asset, {
            x: nativeEvent.clientX,
            y: nativeEvent.clientY,
          });
        }

        setChatCanvasAssetDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      const handlePointerCancel = () => {
        cleanup();
        setChatCanvasAssetDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
    },
    [insertChatCanvasAsset, screenToWorld]
  );

  const handleImageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await addImageFile(file);
    event.target.value = "";
  };

  const openWorkspaceTab = (tab: WorkspaceTab) => {
    setWorkspaceOpen(true);
    setWorkspaceTab(tab);
    if (tab !== "chat") setChatExpanded(false);
  };

  const closeWorkspacePanel = () => {
    setWorkspaceOpen(false);
    setChatExpanded(false);
    setPlacementTool(null);
    if (activeTool === "connector") setActiveTool("select");
  };

  const choosePlacementTool = (tool: BoxTool) => {
    setPlacementTool(tool);
    setActiveTool("select");
    setSelectedIds([]);
    openWorkspaceTab("shapes");
    setEditingTextId(null);
    setEditingCaretClientPoint(null);
    setEditingCell(null);
    setColorPopover(null);
  };

  const insertCodeArtifactPayload = useCallback((artifact: CanvasCodeArtifactPayload) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const center = bounds
      ? screenToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : {
          x: -viewportRef.current.x / Math.max(viewportRef.current.zoom, 0.01),
          y: -viewportRef.current.y / Math.max(viewportRef.current.zoom, 0.01),
        };

    const object: CanvasBoxObject = {
      id: makeId(),
      type: "code-artifact",
      x: center.x - artifact.preferredWidth / 2,
      y: center.y - artifact.preferredHeight / 2,
      w: artifact.preferredWidth,
      h: artifact.preferredHeight,
      rotation: 0,
      text: artifact.title,
      codeArtifact: artifact,
      source: {
        kind: "northstar-code-artifact",
        originalWidth: artifact.preferredWidth,
        originalHeight: artifact.preferredHeight,
      },
      semantic: {
        artifactId: artifact.artifactId,
        role: "artifact-frame",
        label: artifact.title,
        componentId: artifact.artifactId,
        componentType: "code-artifact",
        layoutRole: "container",
        editable: true,
        detachable: true,
        surfaceKind: "presentation",
        surfaceRootId: artifact.artifactId,
      },
      style: {
        fill: "#FFFFFF",
        stroke: "rgba(107,92,255,0.26)",
        strokeWidth: 1.25,
        textColor: "#171820",
        fontSize: 14,
        fontWeight: 700,
        textAlign: "left",
        radius: 24,
        shadow: "0 30px 90px rgba(36,29,91,0.18)",
        opacity: 1,
      },
    };

    commitHistorySnapshot();
    setObjects((current) => [...current, object]);
    setSelectedIds([object.id]);
    setActiveTool("select");
    setPlacementTool(null);
    setEditingTextId(null);
    setEditingCaretClientPoint(null);
    setEditingCell(null);
    setColorPopover(null);
  }, [commitHistorySnapshot, screenToWorld]);

  const insertPrototypeCodeArtifact = useCallback(() => {
    insertCodeArtifactPayload(
      northstarTotalArchitectureEnabled
        ? createNorthstarDirectBootstrapArtifactPayload()
        : createPrototypeCodeArtifactPayload(),
    );
  }, [insertCodeArtifactPayload, northstarTotalArchitectureEnabled]);

  const ensureNorthstarProjectionTarget = useCallback((objective: string) => {
    const codeArtifacts = objectsRef.current.filter(
      (object): object is CanvasBoxObject =>
        isBoxObject(object) && object.type === "code-artifact" && Boolean(object.codeArtifact),
    );
    const selectedArtifact = codeArtifacts.find((object) => selectedIdsRef.current.includes(object.id));
    const targetObject = [
      selectedArtifact,
      ...codeArtifacts,
    ].find((object): object is CanvasBoxObject => Boolean(
      object?.codeArtifact && canPrepareNorthstarProductSurface(object.codeArtifact),
    ));

    if (targetObject?.codeArtifact) {
      const currentArtifact = targetObject.codeArtifact;
      const promotedArtifact = prepareNorthstarProductSurface(currentArtifact);
      if (!promotedArtifact) {
        throw new Error(`North Star could not prepare the selected artifact ${currentArtifact.artifactId}.`);
      }
      if (promotedArtifact !== currentArtifact) {
        const nextObjects = normalizeCanvasScene(objectsRef.current.map((object) => object.id === targetObject.id
          ? { ...targetObject, codeArtifact: promotedArtifact }
          : object));
        objectsRef.current = nextObjects;
        setObjectsState(nextObjects);
      }
      const artifactId = promotedArtifact.artifactId;
      northstarProjectionTargetArtifactIdRef.current = artifactId;
      setNorthstarProjectionTargetArtifactId(artifactId);
      northstarProjectionTargetFrameRef.current = promotedArtifact === currentArtifact
        ? northstarProjectionFramesRef.current.get(artifactId) ?? null
        : null;
      return artifactId;
    }

    const payload = createNorthstarDirectBootstrapArtifactPayload({ objective });
    northstarBootstrapArtifactRef.current = true;
    northstarProjectionTargetArtifactIdRef.current = payload.artifactId;
    setNorthstarProjectionTargetArtifactId(payload.artifactId);
    northstarProjectionTargetFrameRef.current = null;
    insertCodeArtifactPayload(payload);
    return payload.artifactId;
  }, [insertCodeArtifactPayload]);

  const insertVisualComponentPreset = useCallback(
    (preset: CanvasComponentPreset) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      const center = bounds
        ? screenToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
        : { x: -viewportRef.current.x / Math.max(viewportRef.current.zoom, 0.01), y: -viewportRef.current.y / Math.max(viewportRef.current.zoom, 0.01) };
      const created = buildManualVisualComponentPreset(preset, center);
      if (created.length === 0) return;
      commitHistorySnapshot();
      setObjects((current) => resolveConnectorBindings([...current, ...created]));
      const root = created.find(
        (object) => isBoxObject(object) && object.semantic?.parentId === undefined,
      );
      setSelectedIds(root ? [root.id] : [created[0].id]);
      setActiveTool("select");
      setPlacementTool(null);
      setEditingTextId(null);
      setEditingCaretClientPoint(null);
      setEditingCell(null);
      setColorPopover(null);
      openWorkspaceTab("shapes");
    },
    [commitHistorySnapshot, screenToWorld],
  );

  const beginShapePaletteDrag = useCallback(
    (tool: BoxTool, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      let didDrag = false;

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
      };

      const getCanvasHit = (clientX: number, clientY: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { inside: false, point: null as { x: number; y: number } | null };

        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;

        return { inside, point: inside ? screenToWorld(clientX, clientY) : null };
      };

      const handlePointerMove = (nativeEvent: PointerEvent) => {
        const movedDistance = Math.hypot(
          nativeEvent.clientX - startClientX,
          nativeEvent.clientY - startClientY
        );

        if (!didDrag && movedDistance < 5) return;

        didDrag = true;
        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);

        setShapePaletteDrag({
          kind: "shape",
          type: tool,
          clientX: nativeEvent.clientX,
          clientY: nativeEvent.clientY,
          overCanvas: hit.inside,
        });
        setGhostPoint(hit.point);
        setDraftBox(null);
        setPlacementTool(null);
        setActiveTool("select");
        setSelectedIds([]);
        setColorPopover(null);
      };

      const handlePointerUp = (nativeEvent: PointerEvent) => {
        cleanup();

        if (!didDrag) {
          setShapePaletteDrag(null);
          setGhostPoint(null);
          choosePlacementTool(tool);
          return;
        }

        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);

        if (hit.inside && hit.point) {
          const created = buildPrimitiveObjects(tool, hit.point);

          commitHistorySnapshot();
          setObjects((prev) => resolveConnectorBindings([...prev, ...created]));
          setSelectedIds([created[0].id]);
          setActiveTool("select");
          setPlacementTool(null);
          setColorPopover(null);
        }

        setShapePaletteDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      const handlePointerCancel = () => {
        cleanup();
        setShapePaletteDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
    },
    [choosePlacementTool, commitHistorySnapshot, screenToWorld]
  );

  const beginComponentPaletteDrag = useCallback(
    (preset: CanvasComponentPreset, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      let didDrag = false;

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
      };

      const getCanvasHit = (clientX: number, clientY: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { inside: false, point: null as { x: number; y: number } | null };

        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;

        return { inside, point: inside ? screenToWorld(clientX, clientY) : null };
      };

      const handlePointerMove = (nativeEvent: PointerEvent) => {
        const movedDistance = Math.hypot(
          nativeEvent.clientX - startClientX,
          nativeEvent.clientY - startClientY,
        );

        if (!didDrag && movedDistance < 5) return;

        didDrag = true;
        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);

        setShapePaletteDrag({
          kind: "component",
          preset,
          clientX: nativeEvent.clientX,
          clientY: nativeEvent.clientY,
          overCanvas: hit.inside,
        });
        setGhostPoint(hit.point);
        setDraftBox(null);
        setPlacementTool(null);
        setActiveTool("select");
        setSelectedIds([]);
        setColorPopover(null);
      };

      const handlePointerUp = (nativeEvent: PointerEvent) => {
        cleanup();

        if (!didDrag) {
          setShapePaletteDrag(null);
          setGhostPoint(null);
          insertVisualComponentPreset(preset);
          return;
        }

        const hit = getCanvasHit(nativeEvent.clientX, nativeEvent.clientY);

        if (hit.inside && hit.point) {
          const created = buildManualVisualComponentPreset(preset, hit.point);
          if (created.length > 0) {
            commitHistorySnapshot();
            setObjects((current) => resolveConnectorBindings([...current, ...created]));
            const root = created.find(
              (object) => isBoxObject(object) && object.semantic?.parentId === undefined,
            );
            setSelectedIds(root ? [root.id] : [created[0].id]);
            setActiveTool("select");
            setPlacementTool(null);
            setColorPopover(null);
          }
        }

        setShapePaletteDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      const handlePointerCancel = () => {
        cleanup();
        setShapePaletteDrag(null);
        setGhostPoint(null);
        setDraftBox(null);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
    },
    [commitHistorySnapshot, insertVisualComponentPreset, screenToWorld],
  );

  const chooseConnectorTool = (kind: ConnectorKind) => {
    setActiveConnectorKind(kind);
    setPlacementTool(null);
    setActiveTool("connector");
    setSelectedIds([]);
    openWorkspaceTab("shapes");
    setEditingTextId(null);
    setEditingCaretClientPoint(null);
    setEditingCell(null);
    setColorPopover(null);
  };

  const beginConnectorFromPoint = (
    startWorld: { x: number; y: number },
    sourceId?: string,
    sourceSide?: ConnectorSide
  ) => {
    setDraftConnector({ x1: startWorld.x, y1: startWorld.y, x2: startWorld.x, y2: startWorld.y, kind: activeConnectorKind });
    setInteraction({ kind: "draw-connector", startWorld, sourceId, sourceSide });
    setSelectedIds([]);
    setActiveTool("connector");
    setColorPopover(null);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    artifactAutoFollowSuspendedUntilRef.current = Date.now() + 4500;
    lastCanvasClientPointRef.current = { x: event.clientX, y: event.clientY };
    if (event.button === 2) return;

    interactionHistoryCommittedRef.current = false;
    moveSnapLockRef.current = {};
    resizeSnapLockRef.current = {};
    setContextMenu(null);
    const target = event.target as HTMLElement;

    if (target.closest("[data-canvas-object='true']")) return;
    if (target.closest("[data-canvas-ui='true']")) return;

    const world = screenToWorld(event.clientX, event.clientY);

    if (activeTool === "pan" || spacePressed || event.button === 1) {
      setInteraction({
        kind: "pan",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: viewport,
      });
      return;
    }

    if (placementTool) {
      setDraftBox({ type: placementTool, x: world.x, y: world.y, w: 1, h: 1 });
      setInteraction({
        kind: "place-box",
        tool: placementTool,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWorld: world,
      });
      return;
    }

    if (activeTool === "connector") {
      beginConnectorFromPoint(world);
      return;
    }

    setSelectedIds(event.shiftKey ? selectedIds : []);
    setEditingTextId(null);
    setEditingCaretClientPoint(null);
    setEditingCell(null);
    setColorPopover(null);

    setInteraction({ kind: "marquee", additive: event.shiftKey, startWorld: world });
    setMarquee({ x: world.x, y: world.y, w: 1, h: 1 });
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    lastCanvasClientPointRef.current = { x: event.clientX, y: event.clientY };
    if (!placementTool || interaction) return;
    setGhostPoint(screenToWorld(event.clientX, event.clientY));
  };

  const applyCanvasWheel = useCallback((input: {
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    metaKey: boolean;
  }) => {
    const element = canvasRef.current;
    if (!element) return;

    artifactAutoFollowSuspendedUntilRef.current = Date.now() + 4500;
    const rect = element.getBoundingClientRect();
    const isPinchZoom = input.ctrlKey || input.metaKey;

    if (isPinchZoom) {
      const mouseX = input.clientX - rect.left;
      const mouseY = input.clientY - rect.top;

      setViewport((prev) => {
        const zoomDelta = clamp(input.deltaY, -90, 90);
        const nextZoom = clampZoom(prev.zoom * Math.exp(-zoomDelta * ZOOM_INTENSITY));
        const worldX = (mouseX - prev.x) / prev.zoom;
        const worldY = (mouseY - prev.y) / prev.zoom;

        return {
          zoom: nextZoom,
          x: mouseX - worldX * nextZoom,
          y: mouseY - worldY * nextZoom,
        };
      });
      return;
    }

    setViewport((prev) => ({
      ...prev,
      x: prev.x - input.deltaX * PAN_SPEED,
      y: prev.y - input.deltaY * PAN_SPEED,
    }));
  }, []);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      applyCanvasWheel({
        clientX: event.clientX,
        clientY: event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
    };

    element.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleNativeWheel);
  }, [applyCanvasWheel]);

  useEffect(() => {
    if (!interaction) return;

    const processPointerMove = (event: PointerMoveFrame) => {
      const dxScreen = event.clientX - ("startClientX" in interaction ? interaction.startClientX : 0);
      const dyScreen = event.clientY - ("startClientY" in interaction ? interaction.startClientY : 0);

      if (interaction.kind === "pan") {
        setViewport({
          ...interaction.startViewport,
          x: interaction.startViewport.x + dxScreen,
          y: interaction.startViewport.y + dyScreen,
        });
      }


      if (interaction.kind === "place-box") {
        const endWorld = screenToWorld(event.clientX, event.clientY);
        setDraftBox({ type: interaction.tool, ...normalizeRect(interaction.startWorld, endWorld) });
      }

      if (interaction.kind === "marquee") {
        const endWorld = screenToWorld(event.clientX, event.clientY);
        setMarquee(normalizeRect(interaction.startWorld, endWorld));
      }

      if (interaction.kind === "move-selection") {
        const hasMovedSelection = Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3;

        if (hasMovedSelection) {
          suppressNextObjectClickRef.current = true;
        }

        if (Math.abs(dxScreen) > 1 || Math.abs(dyScreen) > 1) commitInteractionHistory();
        const baseDx = dxScreen / viewportRef.current.zoom;
        const baseDy = dyScreen / viewportRef.current.zoom;

        const startBounds = getBoundsForObjects(interaction.startObjects);
        const movingSingleCodeArtifact =
          interaction.startObjects.length === 1 &&
          interaction.startObjects.some(
            (object) => isBoxObject(object) && object.type === "code-artifact",
          );

        let dx = baseDx;
        let dy = baseDy;
        let guides: AlignmentGuides = { vertical: [], horizontal: [] };

        // A live artifact is a large composited surface. Skipping alignment-snap scans
        // while moving one artifact keeps pointer tracking immediate and GPU-friendly.
        if (startBounds && !movingSingleCodeArtifact) {
          const movingIdSetForSnap = new Set(interaction.ids);
          const staticBounds = objectsRef.current
            .filter(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) && !object.hidden && !movingIdSetForSnap.has(object.id)
            )
            .map(getObjectBounds);
          const movingBounds = {
            x: startBounds.x + baseDx,
            y: startBounds.y + baseDy,
            w: startBounds.w,
            h: startBounds.h,
          };

          const snap = calculateSnap(
            movingBounds,
            staticBounds,
            SNAP_THRESHOLD / viewportRef.current.zoom,
            moveSnapLockRef.current
          );
          moveSnapLockRef.current = snap.lock;
          dx = baseDx + snap.dx;
          dy = baseDy + snap.dy;
          guides = snap.guides;
        } else if (movingSingleCodeArtifact) {
          moveSnapLockRef.current = {};
        }

        setAlignmentGuides(guides);

        const movingIdSet = new Set(interaction.ids);
        const startObjectById = new Map<string, CanvasObject>(
          interaction.startObjects.map((item): [string, CanvasObject] => [item.id, item])
        );

        setObjects((prev) => {
          const next = resolveConnectorBindings(
            prev.map((object) => {
              if (!movingIdSet.has(object.id)) return object;
              const startObject = startObjectById.get(object.id);
              if (!startObject) return object;

              if (isConnectorObject(startObject)) {
                const startBindingMovesWithSelection =
                  !startObject.startBinding || interaction.ids.includes(startObject.startBinding.objectId);
                const endBindingMovesWithSelection =
                  !startObject.endBinding || interaction.ids.includes(startObject.endBinding.objectId);

                return {
                  ...startObject,
                  startBinding: startBindingMovesWithSelection ? startObject.startBinding : undefined,
                  endBinding: endBindingMovesWithSelection ? startObject.endBinding : undefined,
                  x1: startObject.x1 + dx,
                  y1: startObject.y1 + dy,
                  x2: startObject.x2 + dx,
                  y2: startObject.y2 + dy,
                  controlX: startObject.controlX === undefined ? undefined : startObject.controlX + dx,
                  controlY: startObject.controlY === undefined ? undefined : startObject.controlY + dy,
                };
              }

              return { ...startObject, x: startObject.x + dx, y: startObject.y + dy };
            })
          );
          objectsRef.current = next;
          return next;
        });
      }

      if (interaction.kind === "reshape-freeform") {
        if (Math.abs(dxScreen) > 1 || Math.abs(dyScreen) > 1) commitInteractionHistory();
        const zoom = Math.max(viewportRef.current.zoom, 0.01);
        const basePoints = cloneFreeformPoints(interaction.startObject.freeformPoints);
        const currentPoint = basePoints[interaction.pointIndex];
        if (currentPoint) {
          const nextPoints = basePoints.map((point, index) =>
            index === interaction.pointIndex
              ? {
                  x: Math.max(-0.12, Math.min(1.12, currentPoint.x + dxScreen / zoom / Math.max(1, interaction.startObject.w))),
                  y: Math.max(-0.12, Math.min(1.12, currentPoint.y + dyScreen / zoom / Math.max(1, interaction.startObject.h))),
                }
              : point,
          );
          patchObject(interaction.id, { freeformPoints: nextPoints });
        }
      }

      if (interaction.kind === "resize-box") {
        if (Math.abs(dxScreen) > 1 || Math.abs(dyScreen) > 1) commitInteractionHistory();

        const dx = dxScreen / viewportRef.current.zoom;
        const dy = dyScreen / viewportRef.current.zoom;
        const isCapturedScreenshot = isNorthStarScreenshotObject(interaction.startObject);
        const isCodeArtifact = interaction.startObject.type === "code-artifact";
        const shouldLockAspect = isCodeArtifact
          ? true
          : isCapturedScreenshot
            ? !event.shiftKey
            : event.shiftKey && interaction.direction.length === 2;
        let nextRoot: CanvasBoxObject;

        if (shouldLockAspect) {
          resizeSnapLockRef.current = {};
          setAlignmentGuides({ vertical: [], horizontal: [] });
          nextRoot = resizeBox(interaction.startObject, interaction.direction, dx, dy, true);
        } else {
          const childIds = new Set(interaction.startChildren.map((child) => child.id));
          const staticBounds = objectsRef.current
            .filter(
              (object): object is CanvasBoxObject =>
                isBoxObject(object) && !object.hidden && object.id !== interaction.id && !childIds.has(object.id)
            )
            .map(getObjectBounds);
          const snapped = snapResizeBox(
            interaction.startObject,
            interaction.direction,
            dx,
            dy,
            staticBounds,
            SNAP_THRESHOLD / viewportRef.current.zoom,
            resizeSnapLockRef.current
          );

          resizeSnapLockRef.current = snapped.lock;
          setAlignmentGuides(snapped.guides);
          nextRoot = snapped.object;
        }

        if (interaction.startChildren.length === 0) {
          patchObject(interaction.id, nextRoot);
        } else if (interaction.startObject.semantic?.layout?.resizeBehavior === "reflow") {
          setObjects((prev) => {
            const withRoot = prev.map((object) =>
              object.id === interaction.id && isBoxObject(object) ? nextRoot : object,
            );
            const next = reflowSemanticContainer(withRoot, interaction.id);
            objectsRef.current = next;
            return next;
          });
        } else {
          const scaleX = nextRoot.w / Math.max(1, interaction.startObject.w);
          const scaleY = nextRoot.h / Math.max(1, interaction.startObject.h);
          const childMap = new Map<string, CanvasObject>(
            interaction.startChildren.map((child): [string, CanvasObject] => [child.id, child]),
          );
          setObjects((prev) => {
            const next = resolveConnectorBindings(prev.map((object) => {
              if (object.id === interaction.id && isBoxObject(object)) return nextRoot;
              const startChild = childMap.get(object.id);
              if (!startChild) return object;
              if (isConnectorObject(startChild)) {
                return {
                  ...startChild,
                  x1: nextRoot.x + (startChild.x1 - interaction.startObject.x) * scaleX,
                  y1: nextRoot.y + (startChild.y1 - interaction.startObject.y) * scaleY,
                  x2: nextRoot.x + (startChild.x2 - interaction.startObject.x) * scaleX,
                  y2: nextRoot.y + (startChild.y2 - interaction.startObject.y) * scaleY,
                  controlX: startChild.controlX === undefined ? undefined : nextRoot.x + (startChild.controlX - interaction.startObject.x) * scaleX,
                  controlY: startChild.controlY === undefined ? undefined : nextRoot.y + (startChild.controlY - interaction.startObject.y) * scaleY,
                };
              }
              return {
                ...startChild,
                x: nextRoot.x + (startChild.x - interaction.startObject.x) * scaleX,
                y: nextRoot.y + (startChild.y - interaction.startObject.y) * scaleY,
                w: Math.max(4, startChild.w * scaleX),
                h: Math.max(4, startChild.h * scaleY),
                style: {
                  ...startChild.style,
                  fontSize: Math.max(4, startChild.style.fontSize * Math.min(scaleX, scaleY)),
                  strokeWidth: Math.max(0, startChild.style.strokeWidth * Math.min(scaleX, scaleY)),
                  radius: startChild.style.radius === undefined ? undefined : Math.max(0, startChild.style.radius * Math.min(scaleX, scaleY)),
                },
              };
            }));
            objectsRef.current = next;
            return next;
          });
        }
      }

      if (interaction.kind === "rotate-box") {
        commitInteractionHistory();
        const world = screenToWorld(event.clientX, event.clientY);
        const angle = getAngleFromCenter(interaction.center, world);
        const rawRotation = normalizeDegrees(interaction.startRotation + angle - interaction.startAngle);
        const nextRotation = event.shiftKey ? normalizeDegrees(Math.round(rawRotation / 15) * 15) : rawRotation;
        patchObject(interaction.id, { rotation: nextRotation });
      }

      if (interaction.kind === "adjust-connector-curve") {
        if (Math.abs(dxScreen) > 1 || Math.abs(dyScreen) > 1) commitInteractionHistory();
        const defaultControl = {
          x: (interaction.startConnector.x1 + interaction.startConnector.x2) / 2,
          y: (interaction.startConnector.y1 + interaction.startConnector.y2) / 2 + interaction.startConnector.controlOffset,
        };

        patchObject(interaction.id, {
          controlX: (interaction.startConnector.controlX ?? defaultControl.x) + dxScreen / viewportRef.current.zoom,
          controlY: (interaction.startConnector.controlY ?? defaultControl.y) + dyScreen / viewportRef.current.zoom,
        });
      }

      if (interaction.kind === "move-connector") {
        if (Math.abs(dxScreen) > 1 || Math.abs(dyScreen) > 1) commitInteractionHistory();
        const dx = dxScreen / viewportRef.current.zoom;
        const dy = dyScreen / viewportRef.current.zoom;

        patchObject(interaction.id, {
          startBinding: undefined,
          endBinding: undefined,
          x1: interaction.startConnector.x1 + dx,
          y1: interaction.startConnector.y1 + dy,
          x2: interaction.startConnector.x2 + dx,
          y2: interaction.startConnector.y2 + dy,
          controlX:
            interaction.startConnector.controlX === undefined
              ? undefined
              : interaction.startConnector.controlX + dx,
          controlY:
            interaction.startConnector.controlY === undefined
              ? undefined
              : interaction.startConnector.controlY + dy,
        });
      }

      if (interaction.kind === "move-connector-start") {
        if (Math.abs(dxScreen) > 1 || Math.abs(dyScreen) > 1) commitInteractionHistory();
        patchObject(interaction.id, {
          startBinding: undefined,
          x1: interaction.startConnector.x1 + dxScreen / viewportRef.current.zoom,
          y1: interaction.startConnector.y1 + dyScreen / viewportRef.current.zoom,
        });
      }

      if (interaction.kind === "move-connector-end") {
        if (Math.abs(dxScreen) > 1 || Math.abs(dyScreen) > 1) commitInteractionHistory();
        patchObject(interaction.id, {
          endBinding: undefined,
          x2: interaction.startConnector.x2 + dxScreen / viewportRef.current.zoom,
          y2: interaction.startConnector.y2 + dyScreen / viewportRef.current.zoom,
        });
      }

      if (interaction.kind === "draw-connector") {
        const endWorld = screenToWorld(event.clientX, event.clientY);
        const snap = getNearestConnectionPoint(endWorld, objectsRef.current, interaction.sourceId);

        setDraftConnector({
          x1: interaction.startWorld.x,
          y1: interaction.startWorld.y,
          x2: snap?.x ?? endWorld.x,
          y2: snap?.y ?? endWorld.y,
          kind: activeConnectorKind,
        });
      }
    };


    const handlePointerMove = (event: PointerEvent) => {
      pendingPointerMoveRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        shiftKey: event.shiftKey,
      };

      if (pointerMoveFrameRef.current !== null) return;

      pointerMoveFrameRef.current = window.requestAnimationFrame(() => {
        pointerMoveFrameRef.current = null;
        const latest = pendingPointerMoveRef.current;
        pendingPointerMoveRef.current = null;
        if (latest) processPointerMove(latest);
      });
    };

    const flushPendingPointerMove = () => {
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }

      const latest = pendingPointerMoveRef.current;
      pendingPointerMoveRef.current = null;
      if (latest) processPointerMove(latest);
    };

    const handlePointerUp = (event: PointerEvent) => {
      flushPendingPointerMove();
      if (interaction.kind === "place-box") {
        const endWorld = screenToWorld(event.clientX, event.clientY);
        const rect = normalizeRect(interaction.startWorld, endWorld);
        const shouldUseDefault = rect.w < 8 && rect.h < 8;
        const created = buildPrimitiveObjects(
          interaction.tool,
          shouldUseDefault ? interaction.startWorld : rect,
        );

        commitHistorySnapshot();
        setObjects((prev) => resolveConnectorBindings([...prev, ...created]));
        setSelectedIds([created[0].id]);
        setPlacementTool(null);
        setDraftBox(null);
        setGhostPoint(null);
        setActiveTool("select");
      }

      if (interaction.kind === "marquee") {
        const currentMarquee = marqueeRef.current;
        if (currentMarquee && (currentMarquee.w > 4 || currentMarquee.h > 4)) {
          const selected = objectsRef.current
            .filter((object) => rectsIntersect(currentMarquee, getObjectBounds(object)))
            .map((object) => object.id);

          setSelectedIds((prev) =>
            interaction.additive ? Array.from(new Set([...prev, ...selected])) : selected
          );
        } else if (!interaction.additive) {
          setSelectedIds([]);
        }
        setMarquee(null);
      }

      if (interaction.kind === "move-connector-start") {
        const startPoint = screenToWorld(event.clientX, event.clientY);
        const snap = getNearestConnectionPoint(startPoint, objectsRef.current, interaction.startConnector.endBinding?.objectId);
        const point = snap ?? startPoint;

        setObjects((prev) =>
          resolveConnectorBindings(
            prev.map((object) =>
              object.id === interaction.id && isConnectorObject(object)
                ? {
                    ...object,
                    x1: point.x,
                    y1: point.y,
                    startBinding: snap ? { objectId: snap.id, side: snap.side, xRatio: snap.xRatio, yRatio: snap.yRatio } : undefined,
                  }
                : object
            )
          )
        );
      }

      if (interaction.kind === "move-connector-end") {
        const endPoint = screenToWorld(event.clientX, event.clientY);
        const snap = getNearestConnectionPoint(endPoint, objectsRef.current, interaction.startConnector.startBinding?.objectId);
        const point = snap ?? endPoint;

        setObjects((prev) =>
          resolveConnectorBindings(
            prev.map((object) =>
              object.id === interaction.id && isConnectorObject(object)
                ? {
                    ...object,
                    x2: point.x,
                    y2: point.y,
                    endBinding: snap ? { objectId: snap.id, side: snap.side, xRatio: snap.xRatio, yRatio: snap.yRatio } : undefined,
                  }
                : object
            )
          )
        );
      }

      if (interaction.kind === "draw-connector") {
        const endWorld = screenToWorld(event.clientX, event.clientY);
        const snap = getNearestConnectionPoint(endWorld, objectsRef.current, interaction.sourceId);
        const endPoint = snap ?? endWorld;
        const dx = endPoint.x - interaction.startWorld.x;
        const dy = endPoint.y - interaction.startWorld.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const isClickPlacement = distance <= 20;
        const connectorEndPoint = isClickPlacement
          ? { x: interaction.startWorld.x + 260, y: interaction.startWorld.y }
          : endPoint;

        if (distance > 20 || isClickPlacement) {
          const connector: CanvasConnectorObject = {
            id: makeId(),
            type: "connector",
            x1: interaction.startWorld.x,
            y1: interaction.startWorld.y,
            x2: connectorEndPoint.x,
            y2: connectorEndPoint.y,
            controlOffset: 0,
            controlX: (interaction.startWorld.x + connectorEndPoint.x) / 2,
            controlY: (interaction.startWorld.y + connectorEndPoint.y) / 2,
            startBinding:
              interaction.sourceId && interaction.sourceSide
                ? (() => {
                    const sourceBox = getBoxById(objectsRef.current, interaction.sourceId);
                    return sourceBox ? getBindingForSide(sourceBox, interaction.sourceSide) : undefined;
                  })()
                : undefined,
            endBinding: !isClickPlacement && snap ? { objectId: snap.id, side: snap.side, xRatio: snap.xRatio, yRatio: snap.yRatio } : undefined,
            style: {
              stroke: "#747474",
              strokeWidth: 2.8,
              kind: activeConnectorKind,
              end: "arrow",
              dash: "solid",
            },
          };

          commitHistorySnapshot();
          setObjects((prev) => resolveConnectorBindings([...prev, connector]));
          setSelectedIds([connector.id]);
        }

        setDraftConnector(null);
        setActiveTool("select");
      }

      setAlignmentGuides({ vertical: [], horizontal: [] });
      moveSnapLockRef.current = {};
      resizeSnapLockRef.current = {};
      setInteraction(null);

      if (suppressNextObjectClickRef.current) {
        window.setTimeout(() => {
          suppressNextObjectClickRef.current = false;
        }, 0);
      }
    };

    const handlePointerCancel = () => {
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
      pendingPointerMoveRef.current = null;
      moveSnapLockRef.current = {};
      resizeSnapLockRef.current = {};
      setAlignmentGuides({ vertical: [], horizontal: [] });
      setInteraction(null);
      setDraftConnector(null);
      setDraftBox(null);
      setMarquee(null);
      interactionHistoryCommittedRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
      pendingPointerMoveRef.current = null;
    };
  }, [activeConnectorKind, commitHistorySnapshot, commitInteractionHistory, interaction, patchObject, screenToWorld]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);

      if (typing && event.key !== "Escape") return;

      const shortcutKey = event.key.toLowerCase();
      const commandOrControl = event.metaKey || event.ctrlKey;

      if (commandOrControl && shortcutKey === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvasChange();
        else undoCanvasChange();
        return;
      }

      if (commandOrControl && shortcutKey === "y") {
        event.preventDefault();
        redoCanvasChange();
        return;
      }

      if (commandOrControl && shortcutKey === "a") {
        event.preventDefault();
        setSelectedIds(objectsRef.current.map((object) => object.id));
        setActiveTool("select");
        setPlacementTool(null);
        setDraftConnector(null);
        setDraftBox(null);
        setGhostPoint(null);
        setMarquee(null);
        setColorPopover(null);
        return;
      }

      if (commandOrControl && shortcutKey === "c" && selectedIds.length > 0) {
        event.preventDefault();
        copySelectedObjects();
        return;
      }

      if (commandOrControl && shortcutKey === "v") {
        event.preventDefault();
        void pasteExternalClipboardOrCanvasObjects();
        return;
      }

      if (commandOrControl && (event.key === "0" || event.code === "Digit0" || event.code === "Numpad0")) {
        event.preventDefault();
        setViewport((prev) => ({ ...prev, zoom: DEFAULT_CANVAS_ZOOM }));
        return;
      }

      if (commandOrControl && (event.key === "=" || event.key === "+" || event.code === "Equal" || event.code === "NumpadAdd")) {
        event.preventDefault();
        setViewport((prev) => ({ ...prev, zoom: clampZoom(prev.zoom + 0.1) }));
        return;
      }

      if (commandOrControl && (event.key === "-" || event.code === "Minus" || event.code === "NumpadSubtract")) {
        event.preventDefault();
        setViewport((prev) => ({ ...prev, zoom: clampZoom(prev.zoom - 0.1) }));
        return;
      }

      if (!commandOrControl && event.shiftKey && event.code === "Digit1") {
        event.preventDefault();
        fitViewportToObjects(objectsRef.current);
        return;
      }

      if (!commandOrControl && event.shiftKey && event.code === "Digit2") {
        event.preventDefault();
        fitViewportToObjects(selectedIds.length > 0 ? objectsRef.current.filter((object) => selectedIds.includes(object.id)) : objectsRef.current);
        return;
      }

      if (!commandOrControl && !event.altKey && !event.shiftKey && event.key === "1") {
        event.preventDefault();
        setViewport((prev) => ({ ...prev, zoom: DEFAULT_CANVAS_ZOOM }));
        return;
      }

      if (commandOrControl && selectedIds.length > 0 && (event.key === "]" || event.code === "BracketRight")) {
        event.preventDefault();
        reorderSelectedLayer(event.shiftKey ? "front" : "forward");
        return;
      }

      if (commandOrControl && selectedIds.length > 0 && (event.key === "[" || event.code === "BracketLeft")) {
        event.preventDefault();
        reorderSelectedLayer(event.shiftKey ? "back" : "backward");
        return;
      }

      if (!commandOrControl && !event.altKey && !event.shiftKey) {
        const toolShortcuts: Partial<Record<string, BoxTool | "select" | "pan" | "connector">> = {
          v: "select",
          h: "pan",
          r: "rect",
          o: "ellipse",
          c: "circle",
          d: "diamond",
          t: "text",
          n: "note",
          f: "frame",
          l: "connector",
        };
        const shortcut = toolShortcuts[shortcutKey];

        if (shortcut) {
          event.preventDefault();
          setContextMenu(null);
          setColorPopover(null);
          setDraftConnector(null);
          setDraftBox(null);
          setGhostPoint(null);
          setMarquee(null);

          if (shortcut === "select" || shortcut === "pan") {
            setActiveTool(shortcut);
            setPlacementTool(null);
          } else if (shortcut === "connector") {
            setActiveTool("connector");
            setPlacementTool(null);
          } else {
            setActiveTool("select");
            setPlacementTool(shortcut);
            setWorkspaceOpen(true);
            setWorkspaceTab("shapes");
          }
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (editingTextId || editingCell) {
          setEditingTextId(null);
          setEditingCaretClientPoint(null);
          setEditingCell(null);
          setColorPopover(null);
          return;
        }

        const hasTransientMode =
          activeTool !== "select" ||
          placementTool !== null ||
          draftConnector !== null ||
          draftBox !== null ||
          ghostPoint !== null ||
          marquee !== null ||
          colorPopover !== null ||
          contextMenu !== null ||
          spacePressed;

        setActiveTool("select");
        setPlacementTool(null);
        setDraftConnector(null);
        setDraftBox(null);
        setGhostPoint(null);
        setMarquee(null);
        setColorPopover(null);
        setContextMenu(null);
        setSpacePressed(false);

        if (!hasTransientMode) setSelectedIds([]);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setSpacePressed(true);
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selectedIds.length > 0 && !editingTextId && !editingCell) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
        const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        nudgeSelected(dx, dy);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length > 0 && !editingTextId && !editingCell) {
        deleteSelected();
        return;
      }

      if (commandOrControl && shortcutKey === "d" && selectedIds.length > 0) {
        event.preventDefault();
        duplicateSelected();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.code === "Space") setSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeTool, colorPopover, contextMenu, copySelectedObjects, deleteSelected, draftBox, draftConnector, duplicateSelected, editingCell, editingTextId, fitViewportToObjects, ghostPoint, marquee, nudgeSelected, pasteExternalClipboardOrCanvasObjects, pasteSelectedObjects, placementTool, redoCanvasChange, reorderSelectedLayer, selectedIds, spacePressed, undoCanvasChange]);

  useEffect(() => {
    const handleWindowBlur = () => {
      setSpacePressed(false);
      setInteraction(null);
      setDraftConnector(null);
      setDraftBox(null);
      setMarquee(null);
      setAlignmentGuides({ vertical: [], horizontal: [] });
      interactionHistoryCommittedRef.current = false;
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("visibilitychange", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("visibilitychange", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (editingTextId || editingCell) return;

      if (isTypingTarget(document.activeElement)) return;

      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith("image/")
      );

      const file = imageItem?.getAsFile();
      if (file) {
        event.preventDefault();
        await addImageFile(file, lastCanvasClientPointRef.current ?? undefined, "pasted-image");
        return;
      }

      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (text.trim()) {
        const internalObjects = parseCanvasClipboardObjects(text);

        event.preventDefault();
        if (internalObjects?.length) {
          clipboardObjectsRef.current = internalObjects;
          pasteSelectedObjects();
          return;
        }

        addTextFromClipboard(text, lastCanvasClientPointRef.current ?? undefined);
        return;
      }

      if (clipboardObjectsRef.current.length > 0) {
        event.preventDefault();
        pasteSelectedObjects();
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addImageFile, addTextFromClipboard, editingCell, editingTextId, pasteSelectedObjects]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-canvas-context-menu='true']")) return;
      setContextMenu(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const beginObjectMoveAtPoint = (
    object: CanvasObject,
    input: {
      clientX: number;
      clientY: number;
      button?: number;
      shiftKey?: boolean;
    },
  ) => {
    if ((input.button ?? 0) !== 0) return;

    interactionHistoryCommittedRef.current = false;
    setContextMenu(null);
    setActiveTool("select");
    setPlacementTool(null);
    const currentSelectedIds = selectedIdsRef.current;
    const alreadySelected = currentSelectedIds.includes(object.id);
    const shiftKey = Boolean(input.shiftKey);
    const nextSelectedIds = shiftKey
      ? alreadySelected
        ? currentSelectedIds.filter((id) => id !== object.id)
        : Array.from(new Set([...currentSelectedIds, object.id]))
      : alreadySelected
        ? currentSelectedIds
        : [object.id];
    const movingIds = expandIdsWithSemanticDescendants(objectsRef.current, nextSelectedIds);

    setSelectedIds(nextSelectedIds);
    setEditingTextId(null);
    setEditingCaretClientPoint(null);
    setEditingCell(null);
    setColorPopover(null);

    const movingSet = new Set(movingIds);
    const startObjects = objectsRef.current.filter((item) => movingSet.has(item.id));

    setInteraction({
      kind: "move-selection",
      ids: movingIds,
      startClientX: input.clientX,
      startClientY: input.clientY,
      startObjects,
    });
  };

  const beginObjectMove = (object: CanvasObject, event: ReactPointerEvent<Element>) => {
    beginObjectMoveAtPoint(object, event);
  };

  const updateTableCell = (objectId: string, row: number, col: number, value: string) => {
    setObjects((prev) =>
      prev.map((object) => {
        if (!isBoxObject(object)) return object;
        if (object.id !== objectId || object.type !== "table") return object;

        const nextCells = object.cells?.map((r) => [...r]) ?? [];
        if (!nextCells[row]) return object;

        nextCells[row][col] = value;
        return { ...object, cells: nextCells };
      })
    );
  };

  const setSelectedIconName = (iconName: NorthstarIconName) => {
    if (selectedIds.length === 0) return;
    commitHistorySnapshot();
    setObjects((current) =>
      current.map((object) =>
        selectedIds.includes(object.id) && isBoxObject(object)
          ? { ...object, iconName }
          : object,
      ),
    );
  };

  const resetSelectedFreeform = () => {
    if (selectedIds.length === 0) return;
    commitHistorySnapshot();
    setObjects((current) =>
      current.map((object) =>
        selectedIds.includes(object.id) && isBoxObject(object) && object.type === "freeform"
          ? { ...object, freeformPoints: cloneFreeformPoints() }
          : object,
      ),
    );
  };

  const addPointToSelectedFreeform = () => {
    if (selectedIds.length === 0) return;
    commitHistorySnapshot();
    setObjects((current) =>
      current.map((object) => {
        if (!selectedIds.includes(object.id) || !isBoxObject(object) || object.type !== "freeform") return object;
        const points = cloneFreeformPoints(object.freeformPoints);
        if (points.length >= 16) return object;
        let longestIndex = 0;
        let longestDistance = -1;
        for (let index = 0; index < points.length; index += 1) {
          const currentPoint = points[index];
          const nextPoint = points[(index + 1) % points.length];
          const distance = Math.hypot(nextPoint.x - currentPoint.x, nextPoint.y - currentPoint.y);
          if (distance > longestDistance) {
            longestDistance = distance;
            longestIndex = index;
          }
        }
        const a = points[longestIndex];
        const b = points[(longestIndex + 1) % points.length];
        const next = [...points];
        next.splice(longestIndex + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        return { ...object, freeformPoints: next };
      }),
    );
  };

  const setSelectedStructureVariant = (rootId: string, variant: string) => {
    commitHistorySnapshot();
    setObjects((current) => {
      const rootObject = current.find((object): object is CanvasBoxObject => isBoxObject(object) && object.id === rootId);
      if (!rootObject) return current;
      const artifactId = rootObject.semantic?.artifactId;
      const type = rootObject.semantic?.componentType ?? "";
      return reflowSemanticTree(current.map((object) => {
        if (!isBoxObject(object) || object.semantic?.artifactId !== artifactId) return object;
        if (object.id === rootId) {
          const palette = variant.includes("Risk") || variant.includes("Pros") ? "#FFF7ED" : variant.includes("Research") || variant.includes("Evidence") ? "#EFF6FF" : variant.includes("Journey") || variant.includes("Storyboard") ? "#F4F1FF" : "#FFFFFF";
          return { ...object, semantic: { ...object.semantic, structureVariant: variant }, style: { ...object.style, fill: palette } };
        }
        if (object.semantic?.role === "visual-stage-badge") {
          const accent = variant.includes("Research") || variant.includes("Evidence") ? "#4F7DF3" : variant.includes("Risk") ? "#F36B2B" : "#6B5CFF";
          return { ...object, style: { ...object.style, textColor: object.style.fill === "#6B5CFF" ? "#FFFFFF" : accent } };
        }
        if (type === "timeline" && object.semantic?.componentType === "timeline-mode") return { ...object, text: variant.toUpperCase(), textHtml: undefined };
        return object;
      }), [rootId]);
    });
  };

  const cycleSelectedStructureDensity = (rootId: string) => {
    commitHistorySnapshot();
    setObjects((current) => {
      const rootObject = current.find((object): object is CanvasBoxObject => isBoxObject(object) && object.id === rootId);
      if (!rootObject) return current;
      const currentDensity = rootObject.semantic?.structureDensity ?? "balanced";
      const nextDensity = currentDensity === "compact" ? "balanced" : currentDensity === "balanced" ? "spacious" : "compact";
      const multiplier = nextDensity === "compact" ? 0.78 : nextDensity === "spacious" ? 1.18 : 1;
      const artifactId = rootObject.semantic?.artifactId;
      return reflowSemanticTree(current.map((object) => {
        if (!isBoxObject(object) || object.semantic?.artifactId !== artifactId) return object;
        const semantic = object.semantic ? { ...object.semantic } : undefined;
        if (object.id === rootId && semantic) semantic.structureDensity = nextDensity;
        if (semantic?.layout) semantic.layout = { ...semantic.layout, gap: Math.max(0, Math.round(semantic.layout.gap * multiplier)) };
        if (semantic?.layoutItem?.basis) semantic.layoutItem = { ...semantic.layoutItem, basis: Math.max(20, Math.round(semantic.layoutItem.basis * multiplier)) };
        return { ...object, semantic };
      }), [rootId]);
    });
  };

  const alignSelected = (mode: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (!selectedBounds || selectedObjects.length < 2) return;

    commitHistorySnapshot();
    setObjects((prev) =>
      resolveConnectorBindings(
        prev.map((object) => {
          if (!selectedIds.includes(object.id)) return object;
          if (isConnectorObject(object)) return object;

          if (mode === "left") return { ...object, x: selectedBounds.x };
          if (mode === "center") return { ...object, x: selectedBounds.x + selectedBounds.w / 2 - object.w / 2 };
          if (mode === "right") return { ...object, x: selectedBounds.x + selectedBounds.w - object.w };
          if (mode === "top") return { ...object, y: selectedBounds.y };
          if (mode === "middle") return { ...object, y: selectedBounds.y + selectedBounds.h / 2 - object.h / 2 };
          return { ...object, y: selectedBounds.y + selectedBounds.h - object.h };
        })
      )
    );
  };

  const setSelectedTextSize = (size: number) => {
    const nextSize = Math.max(8, Math.min(160, size));

    commitHistorySnapshot();
    setObjects((prev) =>
      prev.map((object) => {
        if (!selectedIds.includes(object.id) || !isBoxObject(object)) return object;

        const nextStyle = { ...object.style, fontSize: nextSize };

        if (object.type !== "text") {
          return { ...object, style: nextStyle };
        }

        const nextBounds = getTextBoundsAfterEdit(object, object.text ?? "", nextStyle);

        return {
          ...object,
          w: nextBounds.w,
          h: nextBounds.h,
          style: nextStyle,
        };
      })
    );
  };

  const updateTextSize = (delta: number) => {
    const primary = selectedObjects[0];
    if (!primary || !isBoxObject(primary)) return;
    setSelectedTextSize((primary.style.fontSize ?? 16) + delta);
  };

  const toggleBold = () => {
    const primary = selectedObjects[0];
    if (!primary || !isBoxObject(primary)) return;
    patchSelectedStyles({ fontWeight: primary.style.fontWeight >= 700 ? 500 : 700 });
  };

  const cycleTextAlign = () => {
    const primary = selectedObjects[0];
    if (!primary || !isBoxObject(primary)) return;
    const current = primary.style.textAlign;
    const next: TextAlign = current === "left" ? "center" : current === "center" ? "right" : "left";
    patchSelectedStyles({ textAlign: next });
  };

  const patchSelectedConnectors = (patch: Partial<CanvasConnectorStyle>) => {
    commitHistorySnapshot();
    setObjects((prev) =>
      prev.map((object) => {
        if (!selectedIds.includes(object.id) || !isConnectorObject(object)) return object;
        return { ...object, style: { ...object.style, ...patch } };
      })
    );
  };

  const updateConnectorWidth = (delta: number) => {
    const primary = selectedObjects[0];
    if (!primary || !isConnectorObject(primary)) return;
    patchSelectedConnectors({ strokeWidth: Math.max(1, Math.min(12, primary.style.strokeWidth + delta)) });
  };

  const cycleConnectorDash = () => {
    const primary = selectedObjects[0];
    if (!primary || !isConnectorObject(primary)) return;
    const next: ConnectorDash = primary.style.dash === "solid" ? "dashed" : primary.style.dash === "dashed" ? "dotted" : "solid";
    patchSelectedConnectors({ dash: next });
  };

  const toggleConnectorArrow = () => {
    const primary = selectedObjects[0];
    if (!primary || !isConnectorObject(primary)) return;
    patchSelectedConnectors({ end: primary.style.end === "arrow" ? "none" : "arrow" });
  };

  const detachSelectedConnectors = () => {
    commitHistorySnapshot();
    setObjects((prev) =>
      prev.map((object) =>
        selectedIds.includes(object.id) && isConnectorObject(object)
          ? { ...object, startBinding: undefined, endBinding: undefined }
          : object
      )
    );
  };

  return (
    <NorthstarArchitectureProvider value={northstarArchitectureContext}>
    <div
      data-northstar-ledger-foundation={northstarLedgerFoundationEnabled ? "enabled" : "disabled"}
      data-northstar-ledger-run-id={northstarLedgerFoundationRunIdRef.current ?? undefined}
      data-northstar-total-architecture={northstarTotalArchitectureEnabled ? "enabled" : "disabled"}
      data-northstar-writer={northstarProjectionTargetArtifactId ? "direct-projection" : "legacy-repository"}
      className="relative h-screen w-screen overflow-hidden bg-[#EEF0F8] text-zinc-950 dark:bg-[#050505] dark:text-white font-sans overscroll-none"
      onContextMenu={(event) => {
        event.preventDefault();
        const target = event.target as HTMLElement;
        if (target.closest("[data-canvas-object='true']") || target.closest("[data-canvas-ui='true']")) return;

        if (selectedIds.length > 0) {
          setContextMenu({ clientX: event.clientX, clientY: event.clientY, targetIds: selectedIds });
        }
      }}
    >
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div
          className="relative flex-shrink-0 opacity-30 dark:opacity-20 mix-blend-multiply blur-[48px]"
          style={{ width: "1450px", height: "1450px", transform: "rotate(310deg)" }}
        >
          <Image
            src="/topaz_enhance.png"
            alt="Ambient Background"
            fill
            className="object-cover -scale-x-100"
            priority
            quality={80}
          />
        </div>
      </div>

      <div
        ref={canvasRef}
        className={cn(
          "absolute inset-0 z-10 overflow-hidden overscroll-none touch-none select-none",
          activeTool === "pan" || spacePressed
            ? "cursor-grab active:cursor-grabbing"
            : activeTool === "connector" || placementTool
              ? "cursor-crosshair"
              : "cursor-default"
        )}
        style={gridStyle}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onDragOver={(event) => {
          const files = Array.from(event.dataTransfer.files) as File[];
          if (files.some((file) => file.type.startsWith("image/"))) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          const files = Array.from(event.dataTransfer.files) as File[];
          const file = files.find((item) => item.type.startsWith("image/"));
          if (!file) return;
          event.preventDefault();
          void addImageFile(file, { x: event.clientX, y: event.clientY });
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {renderObjects.map((object) =>
            isConnectorObject(object) ? (
              <ConnectorObjectView
                key={object.id}
                connector={object}
                selected={selectedIdSet.has(object.id)}
                onSelect={() => {
                  if (suppressNextObjectClickRef.current) return;
                  setSelectedIds([object.id]);
                }}
                onContextMenu={(event) => openObjectContextMenu(object, event)}
                onMoveStart={(event) => {
                  event.stopPropagation();
                  beginObjectMove(object, event);
                }}
                onStartHandleMove={(event) => {
                  event.stopPropagation();
                  interactionHistoryCommittedRef.current = false;
                  setSelectedIds([object.id]);
                  setInteraction({
                    kind: "move-connector-start",
                    id: object.id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startConnector: object,
                  });
                }}
                onEndHandleMove={(event) => {
                  event.stopPropagation();
                  interactionHistoryCommittedRef.current = false;
                  setSelectedIds([object.id]);
                  setInteraction({
                    kind: "move-connector-end",
                    id: object.id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startConnector: object,
                  });
                }}
                onCurveHandleMove={(event) => {
                  event.stopPropagation();
                  interactionHistoryCommittedRef.current = false;
                  setSelectedIds([object.id]);
                  setInteraction({
                    kind: "adjust-connector-curve",
                    id: object.id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startConnector: object,
                  });
                }}
              />
            ) : (
              <CanvasBoxObjectView
                key={object.id}
                object={object}
                selected={selectedIdSet.has(object.id)}
                selectedCount={selectedIds.length}
                viewportZoom={viewport.zoom}
                editingText={editingTextId === object.id}
                editingCaretClientPoint={editingTextId === object.id ? editingCaretClientPoint : null}
                editingCell={editingCell}
                isDarkMode={isDarkMode}
                onSelect={() => {
                  if (suppressNextObjectClickRef.current) return;
                  setSelectedIds([object.id]);
                }}
                onContextMenu={(event) => openObjectContextMenu(object, event)}
                onMoveStart={(event) => {
                  event.stopPropagation();
                  beginObjectMove(object, event);
                }}
                onArtifactRequestSelect={() => {
                  setSelectedIds([object.id]);
                }}
                onArtifactDragStart={(clientX, clientY) => {
                  beginObjectMoveAtPoint(object, { clientX, clientY });
                }}
                onArtifactContentSize={(size) => {
                  // Browser size messages are diagnostics only. Geometry is versioned with
                  // the immutable commit and may change only through onArtifactProjectCommit.
                  const sequenceKey = `${size.artifactId}:${size.revisionId}`;
                  const previousSequence = artifactContentSizeSequenceRef.current.get(sequenceKey) ?? -1;
                  const nextSequence = size.sequence ?? previousSequence + 1;
                  if (nextSequence >= previousSequence) {
                    artifactContentSizeSequenceRef.current.set(sequenceKey, nextSequence);
                  }
                }}
                onArtifactProjectCommit={(commit, surfaceSessionId) => {
                  const current = objectsRef.current;
                  let receipt: NorthstarProjectionReceipt | undefined;
                  let projected = false;
                  const next = current.map((candidate) => {
                    if (!isBoxObject(candidate) || candidate.id !== object.id || !candidate.codeArtifact) {
                      return candidate;
                    }
                    const result = projectNorthstarCommitIntoArtifact(
                      candidate.codeArtifact,
                      commit,
                      surfaceSessionId,
                    );
                    const previousIntrinsicWidth = Math.max(
                      1,
                      candidate.source?.originalWidth ?? candidate.codeArtifact.preferredWidth,
                    );
                    const previousIntrinsicHeight = Math.max(
                      1,
                      candidate.source?.originalHeight ?? candidate.codeArtifact.preferredHeight,
                    );
                    const displayScale = Math.max(
                      0.01,
                      Math.min(
                        candidate.w / previousIntrinsicWidth,
                        candidate.h / previousIntrinsicHeight,
                      ),
                    );
                    const previousBounds = candidate.codeArtifact.intrinsicBounds ?? {
                      minX: 0,
                      minY: 0,
                      maxX: previousIntrinsicWidth,
                      maxY: previousIntrinsicHeight,
                    };
                    const geometry = commit.tree.geometry;
                    const updated: CanvasBoxObject = {
                      ...candidate,
                      x: candidate.x + (geometry.contentBounds.minX - previousBounds.minX) * displayScale,
                      y: candidate.y + (geometry.contentBounds.minY - previousBounds.minY) * displayScale,
                      w: geometry.intrinsicWidth * displayScale,
                      h: geometry.intrinsicHeight * displayScale,
                      source: candidate.source
                        ? {
                            ...candidate.source,
                            originalWidth: geometry.intrinsicWidth,
                            originalHeight: geometry.intrinsicHeight,
                          }
                        : candidate.source,
                      codeArtifact: result.artifact,
                    };
                    receipt = result.receipt;
                    projected = true;
                    return updated;
                  });
                  if (!projected || !receipt) {
                    throw new Error(`Workspace could not project commit ${commit.commitHash}.`);
                  }
                  objectsRef.current = next;
                  setObjects(next);
                  return receipt;
                }}
                onArtifactProposalSettled={(ackToken, status) => {
                  const current = objectsRef.current;
                  let changed = false;
                  const next = current.map((candidate) => {
                    if (!isBoxObject(candidate) || candidate.id !== object.id || !candidate.codeArtifact) return candidate;
                    if (candidate.codeArtifact.pendingProposal?.ackToken !== ackToken && candidate.codeArtifact.pendingAckToken !== ackToken) {
                      return candidate;
                    }
                    changed = true;
                    const repositoryStatus: CanvasCodeArtifactPayload["repositoryStatus"] =
                      status === "rejected" || status === "recovered" ? "clean" : status;
                    return {
                      ...candidate,
                      codeArtifact: {
                        ...candidate.codeArtifact,
                        pendingAckToken: undefined,
                        pendingProposal: undefined,
                        repositoryStatus,
                        buildState: {
                          ...candidate.codeArtifact.buildState,
                          isBuilding: false,
                          message: status === "rejected"
                            ? "Candidate rejected; repository HEAD is unchanged"
                            : status === "recovered"
                              ? "Repository HEAD was restored; the proposal was not committed"
                              : "Artboard synchronization is required",
                        },
                      },
                    };
                  });
                  if (changed) {
                    objectsRef.current = next;
                    setObjects(next);
                  }
                }}
                onArtifactRuntimeReview={() => {
                  // Runtime review is committed atomically with the artboard tree. Never
                  // mutate canonical artifact state from out-of-band review telemetry.
                }}
                onArtifactWheel={applyCanvasWheel}
                onResizeStart={(direction, event) => {
                  event.stopPropagation();
                  interactionHistoryCommittedRef.current = false;
                  moveSnapLockRef.current = {};
                  resizeSnapLockRef.current = {};
                  setSelectedIds([object.id]);
                  setInteraction({
                    kind: "resize-box",
                    id: object.id,
                    direction,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startObject: object,
                    startChildren: shouldMoveSemanticComponent(object)
                      ? objectsRef.current.filter((candidate) => getSemanticDescendantIds(objectsRef.current, [object.id]).includes(candidate.id))
                      : [],
                  });
                }}
                onFreeformPointStart={(pointIndex, event) => {
                  event.stopPropagation();
                  interactionHistoryCommittedRef.current = false;
                  setSelectedIds([object.id]);
                  setInteraction({
                    kind: "reshape-freeform",
                    id: object.id,
                    pointIndex,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startObject: object,
                  });
                }}
                onRotateStart={(event) => {
                  event.stopPropagation();
                  interactionHistoryCommittedRef.current = false;
                  setSelectedIds([object.id]);
                  const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
                  const world = screenToWorld(event.clientX, event.clientY);
                  setInteraction({
                    kind: "rotate-box",
                    id: object.id,
                    center,
                    startAngle: getAngleFromCenter(center, world),
                    startRotation: object.rotation ?? 0,
                  });
                }}
                onTextChange={(text, textHtml) => updateBoxText(object, text, textHtml)}
                onDoubleClick={(event) => {
                  if (isTextEditableBox(object.type)) {
                    commitHistorySnapshot();
                    setSelectedIds([object.id]);
                    setEditingTextId(object.id);
                    setEditingCaretClientPoint({ x: event.clientX, y: event.clientY });
                    setEditingCell(null);
                  }
                }}
                onConnectorStart={(side, event) => {
                  event.stopPropagation();
                  beginConnectorFromPoint(getConnectionPoint(object, side), object.id, side);
                }}
                onCellDoubleClick={(row, col) => {
                  commitHistorySnapshot();
                  setSelectedIds([object.id]);
                  setEditingCell({ objectId: object.id, row, col });
                }}
                onCellChange={(row, col, value) => updateTableCell(object.id, row, col, value)}
              />
            )
          )}

          {aiHighlightedObjects.length > 0 && (
            <AIReferenceHighlights objects={aiHighlightedObjects} zoom={viewport.zoom} />
          )}

          {selectedBounds && selectedIds.length > 1 && <MultiSelectionBounds bounds={selectedBounds} />}

          {draftConnector && <DraftConnectorView connector={draftConnector} />}
          {draftBox && <DraftBoxView draft={draftBox} />}
          {!draftBox && placementTool && ghostPoint && <GhostBoxView type={placementTool} point={ghostPoint} />}
          {!draftBox && shapePaletteDrag?.overCanvas && ghostPoint && (
            shapePaletteDrag.kind === "shape" ? (
              <GhostBoxView type={shapePaletteDrag.type} point={ghostPoint} />
            ) : (
              <GhostComponentView preset={shapePaletteDrag.preset} point={ghostPoint} />
            )
          )}
          {workspaceScreenDrag?.overCanvas && ghostPoint && (
            <GhostWorkspaceScreenView screen={workspaceScreenDrag.screen} point={ghostPoint} />
          )}
          {chatCanvasAssetDrag?.overCanvas && ghostPoint && (
            <GhostChatCanvasAssetView asset={chatCanvasAssetDrag.asset} point={ghostPoint} />
          )}
          {marquee && <MarqueeView rect={marquee} />}
          <AlignmentGuidesView guides={alignmentGuides} />
        </div>
      </div>

      {selectedBounds && selectedIds.length > 0 && (
        <ContextStyleToolbar
          bounds={selectedBounds}
          viewport={viewport}
          selectedObjects={selectedObjects}
          colorPopover={colorPopover}
          setColorPopover={setColorPopover}
          onFill={(fill) => patchSelectedStyles({ fill })}
          onStroke={(stroke) => patchSelectedStyles({ stroke })}
          onTextColor={applyTextColor}
          onDuplicate={duplicateSelected}
          onFontSize={updateTextSize}
          onSetFontSize={setSelectedTextSize}
          onToggleBold={toggleBold}
          onTextAlign={cycleTextAlign}
          onConnectorKind={(kind) => patchSelectedConnectors({ kind })}
          onConnectorWidth={updateConnectorWidth}
          onConnectorDash={cycleConnectorDash}
          onConnectorArrow={toggleConnectorArrow}
          onConnectorDetach={detachSelectedConnectors}
          onIconName={setSelectedIconName}
          onResetFreeform={resetSelectedFreeform}
          onAddFreeformPoint={addPointToSelectedFreeform}
          onStructureVariant={setSelectedStructureVariant}
          onStructureDensity={cycleSelectedStructureDensity}
          onAlign={alignSelected}
          onLayer={reorderSelectedLayer}
        />
      )}

      {contextMenu && selectedIds.length > 0 && (
        <CanvasContextMenu
          clientX={contextMenu.clientX}
          clientY={contextMenu.clientY}
          selectedCount={selectedIds.length}
          onDuplicate={duplicateSelected}
          onDelete={deleteSelected}
          onLayer={reorderSelectedLayer}
          onClose={() => setContextMenu(null)}
        />
      )}

      <aside className="absolute left-5 top-[104px] bottom-[132px] z-40 w-[72px] rounded-[28px] border border-white/60 bg-white/32 backdrop-blur-2xl dark:border-white/10 dark:bg-black/20">
        <nav className="flex h-full flex-col items-center pt-5 gap-5">
          <RailItem href="/" icon={<Home className="h-5 w-5" />} label="Home" />
          <RailItem
            icon={<MessageSquare className="h-5 w-5" />}
            label="Chat"
            active={workspaceOpen && workspaceTab === "chat"}
            onClick={() => openWorkspaceTab("chat")}
          />
          <RailItem active icon={<LayoutGrid className="h-5 w-5" />} label="Canvas" />
          <RailItem icon={<ImageIcon className="h-5 w-5" />} label="References" />
          <RailItem icon={<BookOpen className="h-5 w-5" />} label="Library" />
        </nav>
      </aside>

      <div className="absolute left-[112px] top-8 z-50 flex items-center gap-8">
        <h1 className={`${unbounded.className} text-[30px] font-[600] tracking-[-0.04em] text-[#0A0A0A] dark:text-white`}>
          North Star
        </h1>

        <button className="h-[49px] rounded-[14px] border border-white/60 bg-white/50 px-6 text-[16px] font-[500] text-black shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-white">
          Untitled canvas
        </button>
      </div>

      <div className="absolute right-8 top-8 z-50">
        <ThemeToggle />
      </div>

      <div className="absolute bottom-9 left-8 z-50 flex items-center gap-3">
        <div className="flex h-[49px] w-[49px] items-center justify-center bg-[#D9D7D2] text-[17px] font-[700] text-black shadow-sm dark:bg-white/10 dark:text-white">
          {userInitial}
        </div>

        <div className="leading-tight">
          <div className="text-[16px] font-[700] text-black dark:text-white">{userName}</div>
          <div className="mt-1 flex items-center gap-2 text-[14px] text-zinc-500 dark:text-zinc-400">
            <span>{userEmail}</span>
            <span>•</span>
            <button onClick={handleLogout} className="hover:text-black dark:hover:text-white">
              Log out
            </button>
          </div>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageInputChange}
      />

      {workspaceOpen ? (
        <WorkspacePanel
          activeTab={workspaceTab}
          onTabChange={openWorkspaceTab}
          onClose={closeWorkspacePanel}
          expanded={workspaceTab === "chat" && chatExpanded}
        >
          {workspaceTab === "chat" && (
            <ChatWorkspacePanel
              sessionId={chatSessionIdRef.current}
              canvasContext={canvasContext}
              selectedCanvasContext={selectedCanvasContext}
              onReferenceHover={highlightAIReference}
              onReferenceLeave={clearAIReferenceHighlight}
              onReferenceFocus={focusAIReference}
              expanded={chatExpanded}
              onExpandedChange={setChatExpanded}
              workspaceApps={workspaceApps}
              onCanvasAssetPointerDown={beginChatCanvasAssetDrag}
              onInsertFlow={insertWorkspaceFlow}
              onExecuteCanvasAction={executeCanvasAIAction}
              onFinalizeCanvasActionRun={finalizeCanvasAIActionRun}
              northstarWorkspaceRuntime={northstarWorkspaceRuntime}
              northstarTotalArchitectureEnabled={northstarTotalArchitectureEnabled}
              ensureNorthstarProjectionTarget={ensureNorthstarProjectionTarget}
            />
          )}
          {workspaceTab === "shapes" && (
            <ShapePicker
              onChoose={choosePlacementTool}
              onInsertCodeArtifact={insertPrototypeCodeArtifact}
              onChooseComponent={insertVisualComponentPreset}
              onShapePointerDown={beginShapePaletteDrag}
              onComponentPointerDown={beginComponentPaletteDrag}
              onChooseConnector={chooseConnectorTool}
              activeTool={placementTool}
              activeConnectorKind={activeConnectorKind}
              activeMode={activeTool}
            />
          )}
          {workspaceTab === "apps" && (
            <AppsWorkspacePanel
              apps={workspaceApps}
              loading={workspaceAppsLoading}
              error={workspaceAppsError}
              selectedAppId={selectedWorkspaceAppId}
              onSelectApp={setSelectedWorkspaceAppId}
              onInsertFlow={insertWorkspaceFlow}
              onScreenPointerDown={beginWorkspaceScreenDrag}
            />
          )}
        </WorkspacePanel>
      ) : (
        <CollapsedWorkspaceLauncher activeTab={workspaceTab} onOpen={() => setWorkspaceOpen(true)} />
      )}

      {shapePaletteDrag && !shapePaletteDrag.overCanvas && (
        <PaletteDragPreview drag={shapePaletteDrag} />
      )}

      {workspaceScreenDrag && !workspaceScreenDrag.overCanvas && (
        <WorkspaceScreenDragPreview
          screen={workspaceScreenDrag.screen}
          clientX={workspaceScreenDrag.clientX}
          clientY={workspaceScreenDrag.clientY}
        />
      )}

      {chatCanvasAssetDrag && !chatCanvasAssetDrag.overCanvas && (
        <ChatCanvasAssetDragPreview
          asset={chatCanvasAssetDrag.asset}
          clientX={chatCanvasAssetDrag.clientX}
          clientY={chatCanvasAssetDrag.clientY}
        />
      )}

      <div
        data-canvas-ui="true"
        className="absolute bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-[22px] border border-white/70 bg-white/65 px-4 py-3 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-black/40"
      >
        <ToolButton
          active={activeTool === "select" && !placementTool}
          onClick={() => {
            setActiveTool("select");
            setPlacementTool(null);
          }}
          icon={<MousePointer2 className="h-5 w-5" />}
          label="Select"
        />
        <ToolButton
          active={activeTool === "pan"}
          onClick={() => {
            setActiveTool("pan");
            setPlacementTool(null);
          }}
          icon={<Hand className="h-5 w-5" />}
          label="Pan"
        />
        <Divider />
        <ToolButton
          active={(workspaceOpen && workspaceTab === "shapes") || !!placementTool || activeTool === "connector"}
          onClick={() => {
            openWorkspaceTab("shapes");
            setActiveTool("select");
          }}
          icon={<Square className="h-5 w-5" />}
          label="Shapes"
        />
        <ToolButton active={placementTool === "note"} onClick={() => choosePlacementTool("note")} icon={<StickyNote className="h-5 w-5" />} label="Note" />
        <ToolButton active={placementTool === "text"} onClick={() => choosePlacementTool("text")} icon={<Type className="h-5 w-5" />} label="Text" />
        <ToolButton active={placementTool === "table"} onClick={() => choosePlacementTool("table")} icon={<Table2 className="h-5 w-5" />} label="Table" />
        <ToolButton
          active={activeTool === "connector"}
          onClick={() => {
            setActiveConnectorKind("straight");
            setActiveTool("connector");
            setPlacementTool(null);
            openWorkspaceTab("shapes");
          }}
          icon={<ArrowRight className="h-5 w-5" />}
          label="Connector"
        />
        <ToolButton
          active={false}
          onClick={() => {
            setActiveTool("select");
            setPlacementTool(null);
            imageInputRef.current?.click();
          }}
          icon={<ImageIcon className="h-5 w-5" />}
          label="Image"
        />
        <Divider />
        <ToolButton onClick={() => addBoxObject("card")} icon={<Plus className="h-5 w-5" />} label="Card" />
      </div>

      <div
        data-canvas-ui="true"
        className="absolute bottom-8 right-8 z-50 flex items-center overflow-hidden rounded-[18px] border border-white/70 bg-white/65 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-black/40"
      >
        <button
          onClick={() => setViewport((prev) => ({ ...prev, zoom: clampZoom(prev.zoom - 0.1) }))}
          className="flex h-12 w-12 items-center justify-center text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <Minus className="h-4 w-4" />
        </button>

        <button
          onClick={() => setViewport((prev) => ({ ...prev, zoom: 1 }))}
          className="h-12 min-w-[86px] border-x border-zinc-200/70 px-4 text-[14px] font-[600] text-zinc-700 dark:border-white/10 dark:text-zinc-200"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>

        <button
          onClick={() => setViewport((prev) => ({ ...prev, zoom: clampZoom(prev.zoom + 0.1) }))}
          className="flex h-12 w-12 items-center justify-center text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
    </NorthstarArchitectureProvider>
  );
}

function WorkspacePanel({
  activeTab,
  onTabChange,
  onClose,
  expanded,
  children,
}: {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onClose: () => void;
  expanded: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      data-canvas-ui="true"
      className={cn(
        "absolute z-[70] flex flex-col overflow-hidden border border-white/75 bg-white/84 shadow-2xl shadow-black/10 backdrop-blur-2xl transition-[left,right,top,bottom,width,border-radius] duration-300 ease-out dark:border-white/10 dark:bg-black/74",
        expanded
          ? "bottom-6 left-[104px] right-6 top-6 w-auto rounded-[24px]"
          : "bottom-[104px] left-[104px] top-[92px] w-[392px] rounded-[30px]"
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-4 py-4 dark:border-white/10">
        <div className="flex items-center gap-6">
          <WorkspaceTabButton
            active={activeTab === "chat"}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            onClick={() => onTabChange("chat")}
          >
            Chat
          </WorkspaceTabButton>
          <WorkspaceTabButton
            active={activeTab === "shapes"}
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            onClick={() => onTabChange("shapes")}
          >
            Shapes
          </WorkspaceTabButton>
          <WorkspaceTabButton
            active={activeTab === "apps"}
            icon={<BookOpen className="h-3.5 w-3.5" />}
            onClick={() => onTabChange("apps")}
          >
            Apps
          </WorkspaceTabButton>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-zinc-500 transition hover:border-black/5 hover:bg-white/70 hover:text-zinc-950 hover:shadow-sm dark:text-zinc-400 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
          title="Minimize workspace"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}

function WorkspaceTabButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-9 items-center gap-2 px-0 text-[12px] font-[800] tracking-[-0.015em] transition-colors duration-200 focus:outline-none focus-visible:outline-none",
        active
          ? "text-zinc-950 dark:text-white"
          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center transition-colors",
          active
            ? "text-[#6B5CFF] dark:text-[#BDB6FF]"
            : "text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200"
        )}
      >
        {icon}
      </span>
      <span>{children}</span>
      <span
        className={cn(
          "absolute -bottom-[15px] left-0 h-[2px] w-full rounded-full bg-[#6B5CFF] transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0"
        )}
      />
    </button>
  );
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  const parts = text.split(pattern).filter((part) => part.length > 0);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="bg-black/5 px-1 py-0.5 font-mono text-[0.92em] dark:bg-white/10">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-[800]">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="font-[700] text-[#5E50F5] underline decoration-[#6B5CFF]/35 underline-offset-2 dark:text-[#BDB6FF]"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  const isSpecialLine = (line: string) =>
    /^```/.test(line) ||
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^---+$/.test(line);

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="my-3 overflow-x-auto border border-black/5 bg-black/[0.035] p-3 font-mono text-[11px] leading-[18px] text-zinc-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
          data-language={language || undefined}
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        <div
          key={`heading-${blocks.length}`}
          className={cn(
            "font-[850] tracking-[-0.025em] text-zinc-950 dark:text-white",
            level === 1 ? "mb-2 mt-4 text-[16px]" : level === 2 ? "mb-1.5 mt-3 text-[14px]" : "mb-1 mt-3 text-[12px]"
          )}
        >
          {renderInlineMarkdown(headingMatch[2], `heading-inline-${blocks.length}`)}
        </div>
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-2 space-y-1.5 pl-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex gap-2">
              <span className="mt-[8px] h-1 w-1 shrink-0 bg-[#6B5CFF]" />
              <span>{renderInlineMarkdown(item, `ul-${blocks.length}-${itemIndex}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="my-2 space-y-1.5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="grid grid-cols-[18px_1fr] gap-1.5">
              <span className="font-[800] text-[#6B5CFF] dark:text-[#BDB6FF]">{itemIndex + 1}.</span>
              <span>{renderInlineMarkdown(item, `ol-${blocks.length}-${itemIndex}`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="my-3 border-l-2 border-[#6B5CFF]/55 pl-3 text-zinc-600 dark:text-zinc-300"
        >
          {renderInlineMarkdown(quoteLines.join(" "), `quote-inline-${blocks.length}`)}
        </blockquote>
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<div key={`rule-${blocks.length}`} className="my-4 h-px bg-black/5 dark:bg-white/10" />);
      index += 1;
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isSpecialLine(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`} className="my-2 first:mt-0 last:mb-0">
        {renderInlineMarkdown(paragraphLines.join(" "), `paragraph-inline-${blocks.length}`)}
      </p>
    );
  }

  return <div className="min-w-0">{blocks}</div>;
}

function ActivityIconGlyph({
  icon,
  status,
}: {
  icon: CanvasAIActivityIcon;
  status: CanvasAIActivityStatus;
}) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-[#6B5CFF] dark:text-[#BDB6FF]" />;
  }
  if (status === "pending") {
    return <Minus className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />;
  }
  if (status === "cancelled") {
    return <X className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />;
  }
  if (status === "failed") {
    return <TriangleAlert className="h-4 w-4 text-red-500" />;
  }

  const className = cn(
    "h-4 w-4",
    status === "completed"
      ? "text-[#6B5CFF] dark:text-[#BDB6FF]"
      : "text-zinc-500 dark:text-zinc-400"
  );

  switch (icon) {
    case "context":
      return <Layers className={className} />;
    case "inspect":
      return <Eye className={className} />;
    case "search":
      return <Search className={className} />;
    case "reference":
      return <LocateFixed className={className} />;
    case "flow":
      return <GitBranch className={className} />;
    case "screenshot":
      return <ImageIcon className={className} />;
    case "app":
      return <BookOpen className={className} />;
    case "compare":
      return <LayoutGrid className={className} />;
    case "plan":
      return <ListChecks className={className} />;
    case "tool":
      return <Wrench className={className} />;
    case "verify":
    case "complete":
      return <CheckCircle2 className={className} />;
    case "write":
      return <PenLine className={className} />;
    case "move":
      return <Hand className={className} />;
    case "connect":
      return <Link2 className={className} />;
    case "select":
      return <MousePointer2 className={className} />;
    case "warning":
      return <TriangleAlert className={className} />;
    case "info":
      return <Info className={className} />;
    case "analyze":
    default:
      return <Sparkles className={className} />;
  }
}


function toolResultItemToWorkspaceApp(item: CanvasAIToolResultItem): WorkspaceApp {
  return {
    id: item.id,
    name: item.appName || item.title,
    logoUrl: item.imageUrl,
    description: item.subtitle,
    category: item.category,
    flows: [],
  };
}

interface ChatToolResultHandlers {
  workspaceApps: WorkspaceApp[];
  onOpenApp: (app: WorkspaceApp) => void;
  onOpenImage: (image: ChatImageLightboxState) => void;
  onCanvasAssetPointerDown: (
    asset: ChatCanvasAsset,
    event: ReactPointerEvent<HTMLElement>,
    onActivate?: () => void
  ) => void;
}

function normalizeToolLookup(value?: string) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveWorkspaceAppForToolItem(
  item: CanvasAIToolResultItem,
  apps: WorkspaceApp[]
): WorkspaceApp {
  const names = [item.appName, item.title]
    .map(normalizeToolLookup)
    .filter(Boolean);
  const exact = apps.find((app) => app.id === item.id);
  if (exact) return exact;
  const byName = apps.find((app) => names.includes(normalizeToolLookup(app.name)));
  return byName ?? toolResultItemToWorkspaceApp(item);
}

function resolveWorkspaceFlowForToolItem(
  item: CanvasAIToolResultItem,
  app: WorkspaceApp
): WorkspaceAppFlow {
  const flowName = item.flowName || item.title;
  const normalizedName = normalizeToolLookup(flowName);
  const exact = app.flows.find((flow) => flow.id === item.id);
  if (exact) return exact;
  const byName = app.flows.find(
    (flow) => normalizeToolLookup(flow.name) === normalizedName
  );
  if (byName) return byName;

  return {
    id: item.id,
    name: flowName,
    description: item.subtitle,
    screens: (item.thumbnails ?? []).map((thumbnail, index) => ({
      id: thumbnail.id,
      name: thumbnail.title || `Screen ${index + 1}`,
      imageUrl: thumbnail.imageUrl,
    })),
  };
}

function resolveWorkspaceScreenForToolItem(
  item: CanvasAIToolResultItem,
  app: WorkspaceApp,
  flow: WorkspaceAppFlow
): WorkspaceAppScreen {
  const normalizedTitle = normalizeToolLookup(item.title);
  return (
    flow.screens.find((screen) => screen.id === item.id) ??
    flow.screens.find((screen) => screen.imageUrl && screen.imageUrl === item.imageUrl) ??
    flow.screens.find((screen) => normalizeToolLookup(screen.name) === normalizedTitle) ?? {
      id: item.id,
      name: item.title,
      imageUrl: item.imageUrl,
    }
  );
}

function resolveWorkspaceScreenForThumbnail(
  thumbnail: NonNullable<CanvasAIToolResultItem["thumbnails"]>[number],
  flow: WorkspaceAppFlow
): WorkspaceAppScreen {
  const normalizedTitle = normalizeToolLookup(thumbnail.title);
  return (
    flow.screens.find((screen) => screen.id === thumbnail.id) ??
    flow.screens.find(
      (screen) => screen.imageUrl && screen.imageUrl === thumbnail.imageUrl
    ) ??
    flow.screens.find(
      (screen) => normalizeToolLookup(screen.name) === normalizedTitle
    ) ?? {
      id: thumbnail.id,
      name: thumbnail.title,
      imageUrl: thumbnail.imageUrl,
    }
  );
}

function useFluidHorizontalScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const frameRef = useRef<number | null>(null);

  const updateScrollEdges = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;

    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    setCanScrollLeft(element.scrollLeft > 2);
    setCanScrollRight(element.scrollLeft < maxScrollLeft - 2);
  }, []);

  const scheduleEdgeUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateScrollEdges();
    });
  }, [updateScrollEdges]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    updateScrollEdges();
    const handleScroll = () => scheduleEdgeUpdate();
    element.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleEdgeUpdate)
        : null;
    resizeObserver?.observe(element);

    return () => {
      element.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [scheduleEdgeUpdate, updateScrollEdges]);

  const scrollByDirection = useCallback((direction: -1 | 1) => {
    const element = containerRef.current;
    if (!element) return;
    const distance = Math.max(220, element.clientWidth * 0.72);
    element.scrollBy({ left: distance * direction, behavior: "smooth" });
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      scrollByDirection(event.key === "ArrowRight" ? 1 : -1);
    },
    [scrollByDirection]
  );

  return {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollPrevious: () => scrollByDirection(-1),
    scrollNext: () => scrollByDirection(1),
    railProps: {
      onKeyDown: handleKeyDown,
      tabIndex: 0,
      style: {
        touchAction: "pan-x pan-y" as const,
        overscrollBehaviorX: "contain" as const,
        WebkitOverflowScrolling: "touch" as const,
        scrollbarWidth: "none" as const,
      },
      "aria-roledescription": "carousel",
    },
  };
}

function FluidCarouselRail({
  children,
  ariaLabel,
  className,
  showControls = true,
}: {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  showControls?: boolean;
}) {
  const {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollPrevious,
    scrollNext,
    railProps,
  } = useFluidHorizontalScroll();

  return (
    <div className="group/fluid-carousel relative min-w-0">
      <div
        ref={containerRef}
        {...railProps}
        className={cn(
          "overflow-x-auto overscroll-x-contain outline-none [&::-webkit-scrollbar]:hidden",
          className
        )}
        aria-label={ariaLabel}
      >
        {children}
      </div>

      {showControls && canScrollLeft && (
        <button
          type="button"
          onClick={scrollPrevious}
          className="absolute left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center border border-black/5 bg-white/94 text-zinc-650 opacity-0 shadow-[0_8px_20px_rgba(15,23,42,0.10)] transition hover:bg-white group-hover/fluid-carousel:opacity-100 focus:opacity-100 dark:border-white/10 dark:bg-zinc-900/94 dark:text-zinc-200"
          style={{ borderRadius: 10 }}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {showControls && canScrollRight && (
        <button
          type="button"
          onClick={scrollNext}
          className="absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center border border-black/5 bg-white/94 text-zinc-650 opacity-0 shadow-[0_8px_20px_rgba(15,23,42,0.10)] transition hover:bg-white group-hover/fluid-carousel:opacity-100 focus:opacity-100 dark:border-white/10 dark:bg-zinc-900/94 dark:text-zinc-200"
          style={{ borderRadius: 10 }}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ChatAppToolResults({
  view,
  handlers,
}: {
  view: CanvasAIToolResultView;
  handlers: ChatToolResultHandlers;
}) {
  return (
    <div className="mt-2.5 max-w-[920px]">
      <FluidCarouselRail
        ariaLabel="Available apps. Scroll freely left or right to browse."
        className="flex items-stretch gap-3 pb-2 pr-6"
      >
        {view.items.map((item) => {
          const app = resolveWorkspaceAppForToolItem(
            item,
            handlers.workspaceApps
          );
          return (
            <button
              type="button"
              key={item.id}
              onPointerDown={(event) =>
                handlers.onCanvasAssetPointerDown(
                  { kind: "app", app },
                  event,
                  () => handlers.onOpenApp(app)
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handlers.onOpenApp(app);
                }
              }}
              className="relative h-[168px] w-[190px] shrink-0 cursor-grab overflow-hidden bg-transparent text-left shadow-[0_10px_28px_rgba(15,23,42,0.07)] active:cursor-grabbing"
              title={`Open ${app.name} flows or drag the app icon onto the canvas`}
            >
              <AppBlurBackdrop app={app} soft />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(145deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 52%, rgba(236,238,252,0.20) 100%)",
                }}
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,0.72),transparent_33%),radial-gradient(circle_at_84%_88%,rgba(0,0,0,0.07),transparent_58%)]" />

              <div className="relative flex h-full flex-col items-center justify-center px-3 py-3 text-center">
                <AppLogo app={app} size="card" />
                <p className="mt-2.5 max-w-full truncate text-[12px] font-[900] tracking-[-0.035em] text-zinc-950 dark:text-white">
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="mt-0.5 line-clamp-2 max-w-[92%] text-[9px] leading-[12px] text-zinc-600 dark:text-zinc-300">
                    {item.subtitle}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </FluidCarouselRail>
    </div>
  );
}

function isLikelyWideToolScreenshot(title: string, imageUrl?: string) {
  const haystack = `${title} ${imageUrl ?? ""}`.toLowerCase();
  return (
    haystack.includes("desktop") ||
    haystack.includes("browser") ||
    haystack.includes("web") ||
    haystack.includes("landscape")
  );
}

function ChatFlowScreenshotTile({
  screen,
  app,
  flow,
  handlers,
}: {
  screen: WorkspaceAppScreen;
  app: WorkspaceApp;
  flow: WorkspaceAppFlow;
  handlers: ChatToolResultHandlers;
}) {
  const isWide = isLikelyWideToolScreenshot(screen.name, screen.imageUrl);

  return (
    <button
      type="button"
      className="shrink-0 cursor-grab text-left active:cursor-grabbing"
      onPointerDown={(event) =>
        handlers.onCanvasAssetPointerDown(
          { kind: "screen", app, flow, screen },
          event,
          () =>
            screen.imageUrl &&
            handlers.onOpenImage({
              src: screen.imageUrl,
              alt: screen.name,
              subtitle: `${app.name} · ${flow.name}`,
            })
        )
      }
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && screen.imageUrl) {
          event.preventDefault();
          handlers.onOpenImage({
            src: screen.imageUrl,
            alt: screen.name,
            subtitle: `${app.name} · ${flow.name}`,
          });
        }
      }}
      title={`${screen.name} — click to inspect, drag to canvas`}
    >
      {screen.imageUrl ? (
        <img
          src={screen.imageUrl}
          alt={screen.name}
          loading="lazy"
          decoding="async"
          className={cn(
            "block w-auto max-w-none bg-white object-contain shadow-[0_7px_18px_rgba(15,23,42,0.10)] dark:bg-zinc-950",
            isWide ? "h-[196px]" : "h-[260px]"
          )}
          style={{ borderRadius: 3 }}
          draggable={false}
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center bg-zinc-100 dark:bg-zinc-900",
            isWide ? "h-[196px] w-[326px]" : "h-[260px] w-[148px]"
          )}
          style={{ borderRadius: 6 }}
        >
          <ImageIcon className="h-4 w-4 text-zinc-400" />
        </div>
      )}
    </button>
  );
}

function ChatFlowScreenshotCarousel({
  app,
  flow,
  handlers,
}: {
  app: WorkspaceApp;
  flow: WorkspaceAppFlow;
  handlers: ChatToolResultHandlers;
}) {
  return (
    <FluidCarouselRail
      ariaLabel={`${flow.name} screenshots. Scroll freely left or right to inspect every screen.`}
      className="flex items-end gap-2.5 py-2 pr-10"
    >
      {flow.screens
        .filter((screen) => screen.imageUrl)
        .map((screen) => (
          <ChatFlowScreenshotTile
            key={screen.id}
            screen={screen}
            app={app}
            flow={flow}
            handlers={handlers}
          />
        ))}
    </FluidCarouselRail>
  );
}

function ChatFlowToolResults({
  view,
  handlers,
}: {
  view: CanvasAIToolResultView;
  handlers: ChatToolResultHandlers;
}) {
  return (
    <div className="mt-2.5 max-w-[1180px]">
      <FluidCarouselRail
        ariaLabel="Captured flows. Scroll freely left or right to browse more flows."
        className="flex items-start gap-8 pb-3 pr-10 pt-7"
      >
        {view.items.map((item) => {
          const app = resolveWorkspaceAppForToolItem(
            { ...item, title: item.appName || item.title },
            handlers.workspaceApps
          );
          const flow = resolveWorkspaceFlowForToolItem(item, app);

          return (
            <section
              key={item.id}
              className="w-[620px] max-w-[82vw] shrink-0 min-w-0 border-b border-black/6 pb-3 dark:border-white/10"
            >
              <div className="flex items-center justify-between gap-4 px-1 pb-2.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing"
                  onPointerDown={(event) =>
                    handlers.onCanvasAssetPointerDown(
                      { kind: "flow", app, flow },
                      event
                    )
                  }
                  title={`Drag ${flow.name} onto the canvas`}
                >
                  <p className="truncate text-[13px] font-[900] leading-[16px] tracking-[-0.035em] text-zinc-950 dark:text-white">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[9.5px] leading-[13px] text-zinc-500 dark:text-zinc-400">
                    {[item.appName, item.category || item.sessionType, item.platform]
                      .filter(Boolean)
                      .join(" · ")}
                    {typeof item.screenCount === "number"
                      ? `${
                          item.appName ||
                          item.category ||
                          item.sessionType ||
                          item.platform
                            ? " · "
                            : ""
                        }${item.screenCount} ${
                          item.screenCount === 1 ? "screen" : "screens"
                        }`
                      : ""}
                  </p>
                </button>
                <button
                  type="button"
                  className="shrink-0 p-3"
                  onClick={() => handlers.onOpenApp(app)}
                  title={`Open ${app.name} flows`}
                >
                  <AppLogo app={app} size="sm" />
                </button>
              </div>

              {flow.screens.some((screen) => screen.imageUrl) ? (
                <ChatFlowScreenshotCarousel
                  app={app}
                  flow={flow}
                  handlers={handlers}
                />
              ) : (
                <div className="flex h-[176px] items-center justify-center text-[10px] text-zinc-400">
                  No screenshot previews available.
                </div>
              )}
            </section>
          );
        })}
      </FluidCarouselRail>
    </div>
  );
}

function ChatScreenshotToolResults({
  view,
  handlers,
}: {
  view: CanvasAIToolResultView;
  handlers: ChatToolResultHandlers;
}) {
  return (
    <div className="mt-2.5 max-w-[1080px]">
      <FluidCarouselRail
        ariaLabel="Screenshot results. Scroll freely left or right to browse."
        className="flex items-end gap-3 pb-2 pr-8"
      >
        {view.items.map((item) => {
          const app = resolveWorkspaceAppForToolItem(item, handlers.workspaceApps);
          const flow = resolveWorkspaceFlowForToolItem(
            { ...item, title: item.flowName || item.title },
            app
          );
          const screen = resolveWorkspaceScreenForToolItem(item, app, flow);
          const isWide = isLikelyWideToolScreenshot(item.title, item.imageUrl);
          return (
            <figure key={item.id} className="shrink-0">
              <button
                type="button"
                className="cursor-grab text-left active:cursor-grabbing"
                onPointerDown={(event) =>
                  handlers.onCanvasAssetPointerDown(
                    { kind: "screen", app, flow, screen },
                    event,
                    () =>
                      item.imageUrl &&
                      handlers.onOpenImage({
                        src: item.imageUrl,
                        alt: item.title,
                        subtitle: [item.appName, item.flowName]
                          .filter(Boolean)
                          .join(" · "),
                      })
                  )
                }
                title={`${item.title} — click to inspect, drag to canvas`}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "block w-auto max-w-none bg-white object-contain shadow-[0_7px_18px_rgba(15,23,42,0.10)] dark:bg-zinc-950",
                      isWide ? "h-[196px]" : "h-[260px]"
                    )}
                    style={{ borderRadius: 3 }}
                    draggable={false}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex items-center justify-center bg-zinc-100 dark:bg-zinc-900",
                      isWide ? "h-[196px] w-[326px]" : "h-[260px] w-[148px]"
                    )}
                    style={{ borderRadius: 6 }}
                  >
                    <ImageIcon className="h-4 w-4 text-zinc-400" />
                  </div>
                )}
              </button>
              <figcaption
                className={cn(
                  "mt-1.5 max-w-[220px] text-[9px] font-[720] leading-[12px] text-zinc-600 dark:text-zinc-300",
                  isWide ? "max-w-[300px]" : "max-w-[150px]"
                )}
              >
                <span className="line-clamp-2">{item.title}</span>
              </figcaption>
            </figure>
          );
        })}
      </FluidCarouselRail>
    </div>
  );
}

function ChatToolResultPreview({
  view,
  handlers,
}: {
  view: CanvasAIToolResultView;
  handlers: ChatToolResultHandlers;
}) {
  if (view.items.length === 0) {
    return (
      <div className="mt-2 border-l-2 border-black/10 pl-3 text-[10px] leading-[15px] text-zinc-500 dark:border-white/15 dark:text-zinc-400">
        {view.emptyMessage ?? "No matching results were found."}
      </div>
    );
  }

  if (view.kind === "apps" || view.kind === "app") {
    return <ChatAppToolResults view={view} handlers={handlers} />;
  }

  if (view.kind === "flows" || view.kind === "flow") {
    return <ChatFlowToolResults view={view} handlers={handlers} />;
  }

  if (view.kind === "screenshot") {
    const item = view.items[0];
    const app = resolveWorkspaceAppForToolItem(item, handlers.workspaceApps);
    const flow = resolveWorkspaceFlowForToolItem(
      { ...item, title: item.flowName || item.title },
      app
    );
    const screen = resolveWorkspaceScreenForToolItem(item, app, flow);
    return (
      <div className="mt-2.5">
        <button
          type="button"
          className="block w-full cursor-grab text-left active:cursor-grabbing"
          onPointerDown={(event) =>
            handlers.onCanvasAssetPointerDown(
              { kind: "screen", app, flow, screen },
              event,
              () =>
                item.imageUrl &&
                handlers.onOpenImage({
                  src: item.imageUrl,
                  alt: item.title,
                  subtitle: [item.appName, item.flowName]
                    .filter(Boolean)
                    .join(" · "),
                })
            )
          }
          title={`${item.title} — click to inspect, drag to canvas`}
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              loading="lazy"
              decoding="async"
              className="block max-h-[420px] w-full border border-[#818A98]/30 bg-white object-contain shadow-[0_10px_28px_rgba(15,23,42,0.12)] dark:bg-zinc-950"
              style={{ borderRadius: 8, borderWidth: 0.4 }}
              draggable={false}
            />
          ) : (
            <div className="flex h-32 items-center justify-center bg-zinc-100 dark:bg-zinc-900">
              <ImageIcon className="h-5 w-5 text-zinc-400" />
            </div>
          )}
        </button>
        <div className="mt-1.5 min-w-0">
          <p className="line-clamp-2 text-[10px] font-[760] leading-[13px] text-zinc-800 dark:text-zinc-200">
            {item.title}
          </p>
          {item.subtitle && (
            <p className="mt-0.5 line-clamp-2 text-[9px] leading-[12px] text-zinc-500 dark:text-zinc-400">
              {item.subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  return <ChatScreenshotToolResults view={view} handlers={handlers} />;
}

function ChatActivityGroup({
  items,
  title,
  runStatus,
  onReferenceHover,
  onReferenceLeave,
  onReferenceFocus,
  toolHandlers,
}: {
  items: CanvasAIActivityItem[];
  title?: string;
  runStatus?: CanvasAIRunStatus;
  onReferenceHover: (objectIds: string[]) => void;
  onReferenceLeave: () => void;
  onReferenceFocus: (objectIds: string[]) => void;
  toolHandlers: ChatToolResultHandlers;
}) {
  const [expanded, setExpanded] = useState(true);
  if (items.length === 0) return null;

  const completedCount = items.filter((item) => item.status === "completed").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const cancelledCount = items.filter((item) => item.status === "cancelled").length;
  const runningItem = items.find((item) => item.status === "running");

  const summary =
    runStatus === "running"
      ? runningItem?.label ?? `${completedCount} of ${items.length} completed`
      : runStatus === "blocked"
        ? "Run stopped at the last verified artboard"
        : failedCount > 0
        ? `${failedCount} ${failedCount === 1 ? "step failed" : "steps failed"}`
        : runStatus === "cancelled" || cancelledCount > 0
          ? "Run stopped"
          : `${completedCount || items.length} ${items.length === 1 ? "step completed" : "steps completed"}`;

  const displayItems = Array.from(
    new Map(items.map((item) => [`${item.id}::${item.tool ?? ""}::${item.label}`, item])).values(),
  );

  return (
    <div className="mb-3 border-y border-black/5 py-2 dark:border-white/10">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="grid w-full grid-cols-[18px_minmax(0,1fr)_18px] items-start gap-2.5 text-left"
      >
        <span className="mt-0.5 flex h-[18px] w-[18px] items-center justify-center">
          {runStatus === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6B5CFF] dark:text-[#BDB6FF]" />
          ) : runStatus === "blocked" || failedCount > 0 ? (
            <TriangleAlert className="h-3.5 w-3.5 text-red-500" />
          ) : runStatus === "cancelled" ? (
            <X className="h-3.5 w-3.5 text-zinc-400" />
          ) : (
            <ListChecks className="h-3.5 w-3.5 text-[#6B5CFF] dark:text-[#BDB6FF]" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block break-words text-[10px] font-[850] uppercase leading-[15px] tracking-[0.12em] text-zinc-600 dark:text-zinc-300">
            {title || "Plan"}
          </span>
          <span className="mt-0.5 block break-words text-[10px] font-[700] leading-[15px] text-zinc-400 dark:text-zinc-500">
            {summary}
          </span>
        </span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 text-zinc-400 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2.5">
          {displayItems.map((item) => {
            const objectIds = item.objectIds ?? [];
            const interactive = objectIds.length > 0;
            return (
              <div key={`${item.id}::${item.tool ?? ""}::${item.label}`} className={item.status === "pending" ? "opacity-55" : undefined}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => interactive && onReferenceFocus(objectIds)}
                  onMouseEnter={() => interactive && onReferenceHover(objectIds)}
                  onMouseLeave={interactive ? onReferenceLeave : undefined}
                  className={cn(
                    "grid w-full grid-cols-[18px_1fr] gap-2.5 text-left",
                    interactive ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <span className="mt-[1px] flex h-[18px] w-[18px] items-center justify-center">
                    <ActivityIconGlyph icon={item.icon} status={item.status} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block break-words text-[11px] leading-[16px] text-zinc-700 dark:text-zinc-200",
                        item.status === "running" || item.status === "completed" ? "font-[750]" : "font-[650]"
                      )}
                    >
                      {item.label}
                    </span>
                    {item.detail && (
                      <span className="mt-0.5 block break-words text-[10px] leading-[15px] text-zinc-500 dark:text-zinc-400">{item.detail}</span>
                    )}
                  </span>
                </button>
                {item.resultView && item.status !== "pending" && (
                  <div className="ml-[28px]">
                    <ChatToolResultPreview view={item.resultView} handlers={toolHandlers} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatAttachmentGallery({
  attachments,
  onOpenImage,
  onCanvasAssetPointerDown,
}: {
  attachments: CanvasAIChatAttachment[];
  onOpenImage: (image: ChatImageLightboxState) => void;
  onCanvasAssetPointerDown: (
    asset: ChatCanvasAsset,
    event: ReactPointerEvent<HTMLElement>,
    onActivate?: () => void
  ) => void;
}) {
  if (attachments.length === 0) return null;

  const renderAttachment = (
    attachment: CanvasAIChatAttachment,
    className: string
  ) => {
    if (!attachment.dataUrl) {
      return (
        <div className="flex min-h-[56px] items-center gap-2 border-y border-black/5 py-3 text-[11px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          <ImageIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{attachment.name}</span>
        </div>
      );
    }

    return (
      <button
        type="button"
        className="block w-full cursor-grab text-left active:cursor-grabbing"
        onPointerDown={(event) =>
          onCanvasAssetPointerDown(
            {
              kind: "image",
              name: attachment.name,
              imageUrl: attachment.dataUrl as string,
            },
            event,
            () =>
              onOpenImage({
                src: attachment.dataUrl as string,
                alt: attachment.name,
              })
          )
        }
        title={`${attachment.name} — click to inspect, drag to canvas`}
      >
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className={className}
          draggable={false}
        />
      </button>
    );
  };

  if (attachments.length === 1) {
    return renderAttachment(
      attachments[0],
      "block max-h-[360px] w-full rounded-[10px] object-contain"
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {attachments.slice(0, MAX_CHAT_ATTACHMENTS).map((attachment, index) => {
        const featureFirst = attachments.length === 3 && index === 0;
        return (
          <div
            key={attachment.id}
            className={cn("relative min-w-0 overflow-hidden", featureFirst && "col-span-2")}
          >
            {renderAttachment(
              attachment,
              cn(
                "block w-full rounded-[9px] object-cover",
                featureFirst ? "max-h-[280px]" : "aspect-[4/3] max-h-[190px]"
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChatImageLightbox({
  image,
  onClose,
}: {
  image: ChatImageLightboxState;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      data-canvas-ui="true"
      className="fixed inset-0 z-[9999] bg-black/92 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || "Image preview"}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-zoom-out"
        aria-label="Close image preview"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex min-h-[72px] items-center justify-between border-b border-white/10 bg-black/45 px-5 backdrop-blur-xl sm:px-7">
        <div className="min-w-0 pr-5">
          <p className="truncate text-[13px] font-[750] text-white">
            {image.alt || "Image preview"}
          </p>
          {image.subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-white/50">
              {image.subtitle}
            </p>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/12 bg-white/8 text-white transition hover:bg-white/14"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="absolute inset-0 z-10 overflow-auto px-5 pb-8 pt-[92px] sm:px-8"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-full min-w-full items-center justify-center">
          <img
            src={image.src}
            alt={image.alt}
            draggable={false}
            className="max-h-[calc(100vh-124px)] max-w-[calc(100vw-48px)] select-none object-contain shadow-[0_35px_160px_rgba(0,0,0,0.58)] sm:max-w-[calc(100vw-80px)]"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function ChatAppExplorer({
  app,
  onBack,
  handlers,
  onInsertFlow,
}: {
  app: WorkspaceApp;
  onBack: () => void;
  handlers: ChatToolResultHandlers;
  onInsertFlow: (app: WorkspaceApp, flow: WorkspaceAppFlow) => void;
}) {
  const [flowMode, setFlowMode] = useState<"onboarding" | "browsing">("onboarding");
  const buckets = useMemo(() => bucketWorkspaceFlows(app.flows), [app.flows]);
  const visibleFlows = flowMode === "onboarding" ? buckets.onboarding : buckets.browsing;

  return (
    <div className="min-h-full pb-5">
      <div className="relative overflow-hidden border border-white/55 bg-white/28 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
        <AppBlurBackdrop app={app} />
        <div className="absolute inset-0 bg-white/28 backdrop-blur-2xl dark:bg-black/20" />
        <div className="relative flex items-center justify-between gap-4 p-5">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={(event) =>
              handlers.onCanvasAssetPointerDown({ kind: "app", app }, event)
            }
            title={`Drag ${app.name} icon to the canvas`}
          >
            <AppLogo app={app} size="card" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-[900] tracking-[-0.035em] text-zinc-950 dark:text-white">
              {app.name}
            </p>
            {app.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-[16px] text-zinc-600 dark:text-zinc-300">
                {app.description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onBack}
            className="flex h-9 items-center gap-1.5 border border-white/55 bg-white/42 px-3 text-[11px] font-[800] text-zinc-700 backdrop-blur-xl transition hover:bg-white/70 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200 dark:hover:bg-black/35"
          >
            <ChevronLeft className="h-4 w-4" />
            Chat
          </button>
        </div>
      </div>

      <FlowModeTabs
        activeMode={flowMode}
        onboardingCount={buckets.onboarding.length}
        browsingCount={buckets.browsing.length}
        onChange={setFlowMode}
      />

      <div className="mt-4 space-y-5">
        {visibleFlows.length === 0 ? (
          <div className="border-y border-black/5 py-6 text-center text-[12px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            No {flowMode} flows are available for {app.name} yet.
          </div>
        ) : (
          visibleFlows.map((flow) => (
            <section
              key={flow.id}
              className="border-b border-black/6 pb-4 dark:border-white/10"
            >
              <div className="flex items-center justify-between gap-3 pb-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing"
                  onPointerDown={(event) =>
                    handlers.onCanvasAssetPointerDown(
                      { kind: "flow", app, flow },
                      event
                    )
                  }
                  title={`Drag ${flow.name} to the canvas`}
                >
                  <p className="truncate text-[13px] font-[900] tracking-[-0.03em] text-zinc-950 dark:text-white">
                    {flow.name}
                  </p>
                  <p className="mt-0.5 text-[10px] font-[700] text-zinc-500 dark:text-zinc-400">
                    {flow.screens.length} {flow.screens.length === 1 ? "screen" : "screens"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onInsertFlow(app, flow)}
                  className="border border-[#6B5CFF]/20 bg-[#6B5CFF]/10 px-3 py-2 text-[10px] font-[850] text-[#5B4BFF] transition hover:bg-[#6B5CFF]/15 dark:border-[#BDB6FF]/20 dark:bg-[#6B5CFF]/20 dark:text-[#D8D3FF]"
                >
                  Insert flow
                </button>
              </div>

              <FluidCarouselRail
                ariaLabel={`${flow.name} screenshots`}
                className="flex items-end gap-2.5 pb-2 pr-8"
              >
                {flow.screens
                  .filter((screen) => screen.imageUrl)
                  .map((screen) => (
                    <ChatFlowScreenshotTile
                      key={screen.id}
                      app={app}
                      flow={flow}
                      screen={screen}
                      handlers={handlers}
                    />
                  ))}
              </FluidCarouselRail>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

const EMPTY_NORTHSTAR_RUNTIME_SNAPSHOT: NorthstarWorkspaceRuntimeSnapshot = {
  status: "idle",
  ledger: null,
  lastStep: null,
};

function northstarRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function northstarToolResultView(value: unknown): CanvasAIToolResultView | undefined {
  const record = northstarRecord(value);
  if (!record || typeof record.kind !== "string" || typeof record.title !== "string" || !Array.isArray(record.items)) {
    return undefined;
  }
  if (!["apps", "app", "flows", "flow", "screenshots", "screenshot"].includes(record.kind)) {
    return undefined;
  }
  const items = record.items.flatMap((item): CanvasAIToolResultItem[] => {
    const candidate = northstarRecord(item);
    if (!candidate || typeof candidate.id !== "string" || typeof candidate.kind !== "string" || typeof candidate.title !== "string") {
      return [];
    }
    if (!["app", "flow", "screenshot"].includes(candidate.kind)) return [];

    const normalized: CanvasAIToolResultItem = {
      id: candidate.id,
      kind: candidate.kind as CanvasAIToolResultItem["kind"],
      title: candidate.title,
    };
    if (typeof candidate.subtitle === "string") normalized.subtitle = candidate.subtitle;
    if (typeof candidate.imageUrl === "string") normalized.imageUrl = candidate.imageUrl;
    if (typeof candidate.appName === "string") normalized.appName = candidate.appName;
    if (typeof candidate.flowName === "string") normalized.flowName = candidate.flowName;
    if (typeof candidate.category === "string") normalized.category = candidate.category;
    if (typeof candidate.platform === "string") normalized.platform = candidate.platform;
    if (typeof candidate.sessionType === "string") normalized.sessionType = candidate.sessionType;
    if (typeof candidate.screenCount === "number" && Number.isFinite(candidate.screenCount)) {
      normalized.screenCount = candidate.screenCount;
    }
    if (typeof candidate.screenshotIndex === "number" && Number.isFinite(candidate.screenshotIndex)) {
      normalized.screenshotIndex = candidate.screenshotIndex;
    }
    if (Array.isArray(candidate.thumbnails)) {
      normalized.thumbnails = candidate.thumbnails.flatMap((thumbnail) => {
        const thumbnailRecord = northstarRecord(thumbnail);
        if (!thumbnailRecord || typeof thumbnailRecord.id !== "string" || typeof thumbnailRecord.title !== "string") {
          return [];
        }
        return [{
          id: thumbnailRecord.id,
          title: thumbnailRecord.title,
          ...(typeof thumbnailRecord.imageUrl === "string" ? { imageUrl: thumbnailRecord.imageUrl } : {}),
        }];
      });
    }
    return [normalized];
  });
  return {
    kind: record.kind as CanvasAIToolResultView["kind"],
    title: record.title,
    items,
    emptyMessage: typeof record.emptyMessage === "string" ? record.emptyMessage : undefined,
  };
}

function northstarTaskStatus(task: NorthstarLedgerSnapshot["tasks"][number]): CanvasAIActivityStatus {
  if (task.status === "completed") return "completed";
  if (task.status === "cancelled" || task.status === "superseded") return "cancelled";
  if (task.status === "blocked" || task.status === "retryable-failure") return "failed";
  if (task.status === "created") return "pending";
  return "running";
}

function northstarTaskIcon(task: NorthstarLedgerSnapshot["tasks"][number]): CanvasAIActivityIcon {
  if (task.kind === "research") return "search";
  if (task.kind === "analysis") return "analyze";
  if (task.kind === "artboard-mutation") return "write";
  if (task.kind === "verification") return "verify";
  return "inspect";
}

function northstarEvidenceActivity(
  task: NorthstarLedgerSnapshot["tasks"][number],
  attempts: readonly NorthstarLedgerSnapshot["attempts"][number][],
): CanvasAIActivityItem[] {
  const attempt = [...attempts].reverse().find((candidate) => candidate.evidence !== undefined);
  const evidence = northstarRecord(attempt?.evidence);
  const toolCalls = Array.isArray(evidence?.toolCalls) ? evidence.toolCalls : [];
  const status = northstarTaskStatus(task);
  const activities = toolCalls.flatMap((rawCall, index) => {
    const call = northstarRecord(rawCall);
    const result = northstarRecord(call?.result);
    const resultView = northstarToolResultView(result?.resultView);
    if (!call || !result || typeof call.name !== "string") return [];
    const kind = resultView?.kind;
    const icon: CanvasAIActivityIcon = kind === "apps" || kind === "app"
      ? "app"
      : kind === "flows" || kind === "flow"
        ? "flow"
        : kind === "screenshots" || kind === "screenshot"
          ? "screenshot"
          : northstarTaskIcon(task);
    return [{
      id: `${task.id}:evidence:${index}`,
      kind: "tool" as const,
      status,
      icon,
      label: index === 0 ? task.intent : resultView?.title ?? call.name.replaceAll("_", " "),
      detail: typeof result.detail === "string" ? result.detail : task.expectedOutcome,
      tool: call.name,
      resultView,
      objectIds: [],
    }];
  });
  return activities;
}

function northstarRuntimeActivity(
  snapshot: NorthstarWorkspaceRuntimeSnapshot,
): CanvasAIActivityItem[] {
  const ledger = snapshot.ledger;
  if (!ledger) return [];
  return ledger.tasks.flatMap((task) => {
    const attempts = ledger.attempts.filter((attempt) => attempt.taskId === task.id);
    const evidence = northstarEvidenceActivity(task, attempts);
    if (evidence.length > 0) return evidence;
    const latestAttempt = attempts.at(-1);
    return [{
      id: task.id,
      kind: "tool" as const,
      status: northstarTaskStatus(task),
      icon: northstarTaskIcon(task),
      label: task.intent,
      detail: latestAttempt?.failure
        ? northstarUserFacingRunMessage(snapshot)
        : task.expectedOutcome,
      objectIds: [],
    }];
  });
}

function northstarSummaryText(value: NorthstarLedgerValue | undefined): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const answer = (value as Record<string, NorthstarLedgerValue>).answer;
    if (typeof answer === "string") return answer;
    const summary = (value as Record<string, NorthstarLedgerValue>).summary;
    if (typeof summary === "string") return summary;
  }
  return value === undefined
    ? "North Star completed the ledger-controlled run."
    : JSON.stringify(value, null, 2);
}


function ChatWorkspacePanel({
  sessionId,
  canvasContext,
  selectedCanvasContext,
  onReferenceHover,
  onReferenceLeave,
  onReferenceFocus,
  expanded,
  onExpandedChange,
  workspaceApps,
  onCanvasAssetPointerDown,
  onInsertFlow,
  onExecuteCanvasAction,
  onFinalizeCanvasActionRun,
  northstarWorkspaceRuntime,
  northstarTotalArchitectureEnabled,
  ensureNorthstarProjectionTarget,
}: {
  sessionId: string;
  canvasContext: CanvasContext;
  selectedCanvasContext: SelectedCanvasContext;
  onReferenceHover: (objectIds: string[]) => void;
  onReferenceLeave: () => void;
  onReferenceFocus: (objectIds: string[]) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  workspaceApps: WorkspaceApp[];
  onCanvasAssetPointerDown: (
    asset: ChatCanvasAsset,
    event: ReactPointerEvent<HTMLElement>,
    onActivate?: () => void
  ) => void;
  onInsertFlow: (
    app: WorkspaceApp,
    flow: WorkspaceAppFlow,
    clientPoint?: { x: number; y: number }
  ) => void;
  onExecuteCanvasAction: (
    runId: string,
    action: CanvasAIActionRequest
  ) => Promise<CanvasAIActionExecutionResult>;
  onFinalizeCanvasActionRun: (runId: string) => void;
  northstarWorkspaceRuntime: NorthstarWorkspaceRuntime | null;
  northstarTotalArchitectureEnabled: boolean;
  ensureNorthstarProjectionTarget: (objective: string) => string;
}) {
  const [messages, setMessages] = useState<CanvasAIChatMessage[]>([]);
  const [conversationSummary, setConversationSummary] = useState("");
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<CanvasAIChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [explorerAppId, setExplorerAppId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<ChatImageLightboxState | null>(null);
  const [contextMode, setContextMode] = useState<CanvasAIContextMode>(
    selectedCanvasContext.selectedIds.length > 0 ? "selection" : "canvas"
  );
  const [thinkingDepth, setThinkingDepth] = useState<NorthStarThinkingDepth>("medium");
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [compositionCheckpoint, setCompositionCheckpoint] =
    useState<CanvasAICompositionCheckpoint | null>(null);
  const [northstarRuntimeSnapshot, setNorthstarRuntimeSnapshot] =
    useState<NorthstarWorkspaceRuntimeSnapshot>(
      () => northstarWorkspaceRuntime?.getSnapshot() ?? EMPTY_NORTHSTAR_RUNTIME_SNAPSHOT,
    );
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const thinkingButtonRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const northstarRunBindingRef = useRef<NorthstarProductRunBinding | null>(null);
  const actionExecutionChainRef = useRef<Promise<void>>(Promise.resolve());
  const actionExecutionResultsRef = useRef<CanvasAIActionExecutionRecord[]>([]);
  const actionRequestCountRef = useRef(0);
  const actionFailureCountRef = useRef(0);
  const groundedDataResultCountRef = useRef(0);
  const failedActionStepIdsRef = useRef<Set<string>>(new Set());
  const deferredFinalPayloadRef = useRef<CanvasAIResponsePayload | null>(null);
  const compositionCheckpointRef = useRef<CanvasAICompositionCheckpoint | null>(null);
  const checkpointUpdatedThisRunRef = useRef(false);
  const hasSelection = selectedCanvasContext.selectedIds.length > 0;
  const explorerApp = useMemo(
    () => workspaceApps.find((app) => app.id === explorerAppId) ?? null,
    [explorerAppId, workspaceApps]
  );

  useEffect(() => {
    if (!northstarWorkspaceRuntime) {
      setNorthstarRuntimeSnapshot(EMPTY_NORTHSTAR_RUNTIME_SNAPSHOT);
      return;
    }
    const update = () => setNorthstarRuntimeSnapshot(northstarWorkspaceRuntime.getSnapshot());
    update();
    return northstarWorkspaceRuntime.subscribe(update);
  }, [northstarWorkspaceRuntime]);

  useEffect(() => {
    if (!northstarWorkspaceRuntime) return;
    const binding = resolveNorthstarProductRunBinding(
      northstarRunBindingRef.current,
      northstarRuntimeSnapshot,
    );
    if (!binding || !northstarRuntimeSnapshot.ledger) return;
    northstarRunBindingRef.current = binding;
    const ledger = northstarRuntimeSnapshot.ledger;
    const runStatus: CanvasAIRunStatus =
      northstarRuntimeSnapshot.status === "completed"
        ? "completed"
        : northstarRuntimeSnapshot.status === "cancelled"
          ? "cancelled"
          : northstarRuntimeSnapshot.status === "failed"
            ? "failed"
            : northstarRuntimeSnapshot.status === "blocked" || northstarRuntimeSnapshot.status === "awaiting-recovery"
              ? "blocked"
              : "running";
    setMessages((current) => current.map((message) => message.id === binding.assistantMessageId
      ? {
          ...message,
          runId: ledger.run.id,
          planTitle: "North Star is working",
          activity: northstarRuntimeActivity(northstarRuntimeSnapshot),
          runStatus,
        }
      : message));
  }, [northstarRuntimeSnapshot, northstarWorkspaceRuntime]);

  const openAppExplorer = useCallback((app: WorkspaceApp) => {
    setExplorerAppId(app.id);
    window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const toolHandlers = useMemo<ChatToolResultHandlers>(
    () => ({
      workspaceApps,
      onOpenApp: openAppExplorer,
      onOpenImage: setLightboxImage,
      onCanvasAssetPointerDown,
    }),
    [onCanvasAssetPointerDown, openAppExplorer, workspaceApps]
  );

  const focusReferenceFromChat = useCallback((objectIds: string[]) => {
    if (!expanded) {
      onReferenceFocus(objectIds);
      return;
    }

    onExpandedChange(false);
    window.setTimeout(() => onReferenceFocus(objectIds), 320);
  }, [expanded, onExpandedChange, onReferenceFocus]);

  useEffect(() => {
    setContextMode(hasSelection ? "selection" : "canvas");
  }, [hasSelection]);

  useEffect(() => {
    compositionCheckpointRef.current = compositionCheckpoint;
  }, [compositionCheckpoint]);

  useEffect(() => {
    const storageKey = `northstar-chat:v67:${sessionId}`;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredCanvasConversation>;
        if (parsed.version === "northstar.canvas-conversation.v1") {
          const restoredMessages = Array.isArray(parsed.messages)
            ? parsed.messages
                .filter(
                  (message): message is CanvasAIChatMessage =>
                    Boolean(
                      message &&
                        typeof message.id === "string" &&
                        (message.role === "user" || message.role === "assistant") &&
                        typeof message.content === "string"
                    )
                )
                .map((message) => ({
                  ...message,
                  createdAt:
                    typeof message.createdAt === "string"
                      ? message.createdAt
                      : new Date().toISOString(),
                  activity: Array.isArray(message.activity)
                    ? message.activity.map((item) => ({
                        ...item,
                        icon: item.icon || "analyze",
                        status:
                          item.status === "running" || item.status === "pending"
                            ? "cancelled"
                            : item.status,
                      }))
                    : [],
                  attachments: Array.isArray(message.attachments)
                    ? message.attachments
                        .filter((attachment) =>
                          Boolean(
                            attachment &&
                              typeof attachment.id === "string" &&
                              typeof attachment.name === "string" &&
                              typeof attachment.mimeType === "string"
                          )
                        )
                        .map((attachment) => ({
                          id: attachment.id,
                          name: attachment.name,
                          mimeType: attachment.mimeType,
                          dataUrl:
                            typeof attachment.dataUrl === "string"
                              ? attachment.dataUrl
                              : undefined,
                          assetKey:
                            typeof attachment.assetKey === "string"
                              ? attachment.assetKey
                              : undefined,
                        }))
                    : [],
                  showSuggestedActions: message.showSuggestedActions === true,
                  runStatus:
                    message.runStatus === "running" ? "cancelled" : message.runStatus,
                  streaming: false,
                }))
            : [];
          setMessages(restoredMessages);

          const storedAttachments = restoredMessages.flatMap((message) =>
            (message.attachments ?? [])
              .filter((attachment) => Boolean(attachment.assetKey) && !attachment.dataUrl)
              .map((attachment) => ({
                messageId: message.id,
                attachmentId: attachment.id,
                assetKey: attachment.assetKey as string,
              }))
          );

          if (storedAttachments.length > 0) {
            void Promise.all(
              storedAttachments.map(async (attachment) => ({
                ...attachment,
                dataUrl: await loadCanvasImageAsset(attachment.assetKey).catch(() => undefined),
              }))
            ).then((hydratedAttachments) => {
              const hydratedById = new Map(
                hydratedAttachments
                  .filter((attachment) => Boolean(attachment.dataUrl))
                  .map((attachment) => [attachment.attachmentId, attachment.dataUrl as string])
              );

              if (hydratedById.size === 0) return;
              setMessages((current) =>
                current.map((message) => ({
                  ...message,
                  attachments: message.attachments?.map((attachment) => ({
                    ...attachment,
                    dataUrl: hydratedById.get(attachment.id) ?? attachment.dataUrl,
                  })),
                }))
              );
            });
          }

          setConversationSummary(typeof parsed.summary === "string" ? parsed.summary : "");
          if (
            parsed.thinkingDepth === "low" ||
            parsed.thinkingDepth === "medium" ||
            parsed.thinkingDepth === "high"
          ) {
            setThinkingDepth(parsed.thinkingDepth);
          }
          const storedCheckpoint = parsed.compositionCheckpoint;
          if (
            storedCheckpoint &&
            storedCheckpoint.version === "northstar.composition-checkpoint.v1" &&
            typeof storedCheckpoint.artifactId === "string" &&
            typeof storedCheckpoint.objective === "string"
          ) {
            setCompositionCheckpoint(storedCheckpoint);
            compositionCheckpointRef.current = storedCheckpoint;
          }
        }
      }
    } catch (error) {
      console.warn("Could not restore the North Star conversation session.", error);
    } finally {
      setHistoryHydrated(true);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!historyHydrated) return;
    const saveTimer = window.setTimeout(() => {
      const storageKey = `northstar-chat:v67:${sessionId}`;
      const payload: StoredCanvasConversation = {
        version: "northstar.canvas-conversation.v1",
        summary: conversationSummary,
        thinkingDepth,
        compositionCheckpoint,
        messages: messages
          .map((message) => ({
            ...message,
            streaming: false,
            attachments: message.attachments?.map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              mimeType: attachment.mimeType,
              assetKey: attachment.assetKey,
            })),
          }))
          .slice(-200),
      };

      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (error) {
        console.warn("Could not save the North Star conversation session.", error);
      }
    }, 280);

    return () => window.clearTimeout(saveTimer);
  }, [compositionCheckpoint, conversationSummary, historyHydrated, messages, sessionId, thinkingDepth]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior: loading ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, loading]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const copyContext = async () => {
    const payload = contextMode === "selection" ? selectedCanvasContext : canvasContext;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch (error) {
      console.warn("Could not copy North Star canvas context.", error);
    }
  };

  const resizeComposer = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    const minimumHeight = expanded ? 40 : 58;
    node.style.height = "auto";
    node.style.height = `${Math.min(Math.max(node.scrollHeight, minimumHeight), 180)}px`;
  }, [expanded]);

  useEffect(() => {
    resizeComposer();
  }, [input, resizeComposer]);

  const addChatFiles = useCallback(async (files: File[]) => {
    const availableSlots = Math.max(0, MAX_CHAT_ATTACHMENTS - attachments.length);
    if (availableSlots === 0) {
      setAttachmentError(`You can attach up to ${MAX_CHAT_ATTACHMENTS} images.`);
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const accepted = imageFiles.slice(0, availableSlots);
    if (accepted.length === 0) {
      setAttachmentError("Choose an image file to attach.");
      return;
    }

    const oversized = accepted.find((file) => file.size > MAX_CHAT_ATTACHMENT_BYTES);
    if (oversized) {
      setAttachmentError(`${oversized.name} is larger than 5 MB.`);
      return;
    }

    try {
      const next = await Promise.all(
        accepted.map(async (file) => {
          const id = makeId();
          const dataUrl = await readFileAsDataUrl(file);
          const assetKey = makeChatAttachmentStorageKey(sessionId, id);

          try {
            await saveCanvasImageAsset(assetKey, dataUrl);
          } catch (error) {
            console.warn("Could not cache the chat image locally.", error);
          }

          return {
            id,
            name: file.name || "Attached image",
            mimeType: file.type || "image/png",
            dataUrl,
            assetKey,
          };
        })
      );
      setAttachments((current) => [...current, ...next].slice(0, MAX_CHAT_ATTACHMENTS));
      setAttachmentError(null);
    } catch (error) {
      console.warn("Could not read the attached image.", error);
      setAttachmentError("North Star could not read that image.");
    }
  }, [attachments.length, sessionId]);

  const handleChatFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []) as File[];
    if (files.length > 0) void addChatFiles(files);
    event.target.value = "";
  };

  const handleComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = (Array.from(event.clipboardData.files) as File[]).filter((file) =>
      file.type.startsWith("image/")
    );
    if (imageFiles.length === 0) return;
    event.preventDefault();
    void addChatFiles(imageFiles);
  };

  const removeChatAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed?.assetKey) {
        void deleteCanvasImageAsset(removed.assetKey).catch(() => undefined);
      }
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
    setAttachmentError(null);
  };

  const cancelRun = useCallback(() => {
    const assistantId = activeAssistantIdRef.current ?? northstarRunBindingRef.current?.assistantMessageId ?? null;
    const runId = activeRunIdRef.current;
    northstarWorkspaceRuntime?.cancelRun("Cancelled by the user.");
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeAssistantIdRef.current = null;
    activeRunIdRef.current = null;
    northstarRunBindingRef.current = null;
    if (runId) onFinalizeCanvasActionRun(runId);
    setLoading(false);

    if (!assistantId) return;
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== assistantId) return message;
        return {
          ...message,
          content: message.content || "North Star stopped this run.",
          activity: (message.activity ?? []).map((item) =>
            item.status === "pending" || item.status === "running"
              ? { ...item, status: "cancelled" as const }
              : item
          ),
          runStatus: "cancelled",
          streaming: false,
        };
      })
    );
  }, [northstarWorkspaceRuntime, onFinalizeCanvasActionRun]);

  const sendMessage = async (messageOverride?: string) => {
    const message = (messageOverride ?? input).trim();
    const outgoingAttachments = messageOverride ? [] : attachments;
    if ((!message && outgoingAttachments.length === 0) || loading) return;
    const modelMessage =
      message ||
      (outgoingAttachments.length === 1
        ? "Please review the attached image."
        : "Please review the attached images.");

    const activeMode: CanvasAIContextMode =
      contextMode === "selection" && hasSelection ? "selection" : "canvas";
    const userMessage: CanvasAIChatMessage = {
      id: makeId(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      contextMode: activeMode,
      attachments: outgoingAttachments,
    };
    const assistantMessageId = makeId();
    const assistantPlaceholder: CanvasAIChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      contextMode: activeMode,
      references: [],
      suggestedActions: [],
      showSuggestedActions: false,
      activity: [],
      runStatus: "running",
      streaming: true,
    };

    const productRoute = northstarTotalArchitectureEnabled
      ? routeNorthstarProductMessage({
          message: modelMessage,
          hasAttachments: outgoingAttachments.length > 0,
          contextMode: activeMode,
        })
      : "legacy-conversation";

    if (productRoute === "ledger-authoring") {
      const runtimeSnapshot = northstarWorkspaceRuntime?.getSnapshot();
      const unavailableMessage = !northstarWorkspaceRuntime
        ? "North Star is still preparing the authoring runtime. Your request was not started; try again when the working surface is ready."
        : runtimeSnapshot?.status === "initializing" || runtimeSnapshot?.status === "running"
          ? "North Star is already building another visual. Let that build finish or cancel it before starting a new one."
          : runtimeSnapshot?.status === "blocked" || runtimeSnapshot?.status === "awaiting-recovery"
            ? "The previous visual build is paused at its last verified state. Resolve or cancel that build before starting a new authoring request."
            : null;
      if (unavailableMessage) {
        setMessages((current) => [
          ...current,
          userMessage,
          {
            ...assistantPlaceholder,
            content: unavailableMessage,
            runStatus: "blocked",
            streaming: false,
            error: false,
          },
        ]);
        setInput("");
        setAttachments([]);
        setAttachmentError(null);
        return;
      }
    }

    const conversationHistory = messages
      .filter(
        (item) =>
          !item.streaming &&
          !item.error &&
          (item.content.trim() || (item.attachments?.length ?? 0) > 0)
      )
      .slice(-24)
      .map((item) => {
        const attachmentNames = (item.attachments ?? [])
          .map((attachment) => attachment.name)
          .filter(Boolean);
        const attachmentSummary =
          attachmentNames.length > 0
            ? `[Attached ${attachmentNames.length === 1 ? "image" : "images"}: ${attachmentNames.join(", ")}]`
            : "";
        return {
          role: item.role,
          content: [item.content, attachmentSummary].filter(Boolean).join("\n"),
        };
      });

    const historyToolContext: CanvasAIHistoryToolContextEntry[] = messages
      .filter((item) => item.role === "assistant" && !item.streaming && !item.error)
      .slice(-16)
      .flatMap((item) =>
        (item.activity ?? [])
          .filter(
            (activity) =>
              activity.status === "completed" &&
              Boolean(activity.tool) &&
              Boolean(activity.resultView)
          )
          .map((activity) => ({
            messageId: item.id,
            planTitle: item.planTitle,
            tool: activity.tool!,
            detail: activity.detail,
            resultView: activity.resultView
              ? {
                  ...activity.resultView,
                  items: activity.resultView.items.slice(0, 16).map((resultItem) => ({
                    ...resultItem,
                    thumbnails: resultItem.thumbnails?.slice(0, 16),
                  })),
                }
              : undefined,
          }))
      )
      .slice(-24);

    const requestAttachments = outgoingAttachments.flatMap((attachment) => {
      if (!attachment.dataUrl) return [];
      const match = attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return [];
      return [{
        name: attachment.name,
        mimeType: match[1] || attachment.mimeType,
        data: match[2],
      }];
    });

    const historyAttachments = messages
      .filter((item) => item.role === "user" && !item.streaming)
      .flatMap((item) => item.attachments ?? [])
      .filter((attachment) => Boolean(attachment.dataUrl))
      .slice(-MAX_CHAT_ATTACHMENTS)
      .flatMap((attachment) => {
        if (!attachment.dataUrl) return [];
        const match = attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return [];
        return [{
          name: attachment.name,
          mimeType: match[1] || attachment.mimeType,
          data: match[2],
        }];
      });

    setMessages((current) => [...current, userMessage, assistantPlaceholder]);
    setInput("");
    setAttachments([]);
    setAttachmentError(null);
    setLoading(true);
    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = expanded ? "40px" : "58px";
      }
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeAssistantIdRef.current = assistantMessageId;
    activeRunIdRef.current = null;
    actionExecutionChainRef.current = Promise.resolve();
    actionExecutionResultsRef.current = [];
    actionRequestCountRef.current = 0;
    actionFailureCountRef.current = 0;
    groundedDataResultCountRef.current = 0;
    failedActionStepIdsRef.current = new Set();
    deferredFinalPayloadRef.current = null;
    checkpointUpdatedThisRunRef.current = false;

    const updateAssistantMessage = (
      patch:
        | Partial<CanvasAIChatMessage>
        | ((message: CanvasAIChatMessage) => Partial<CanvasAIChatMessage>)
    ) => {
      setMessages((current) =>
        current.map((item) => {
          if (item.id !== assistantMessageId) return item;
          const nextPatch = typeof patch === "function" ? patch(item) : patch;
          return { ...item, ...nextPatch };
        })
      );
    };

    const updateStep = (
      stepId: string,
      patch: Partial<CanvasAIActivityItem>
    ) => {
      updateAssistantMessage((current) => ({
        activity: (current.activity ?? []).map((item) =>
          item.id === stepId ? { ...item, ...patch } : item
        ),
      }));
    };

    if (productRoute === "ledger-authoring") {
      try {
        if (!northstarWorkspaceRuntime) throw new Error("The authoring runtime is unavailable.");
        ensureNorthstarProjectionTarget(modelMessage);
        northstarRunBindingRef.current = {
          assistantMessageId,
          objective: modelMessage,
          runId: null,
        };
        const result = await northstarWorkspaceRuntime.startRun(modelMessage);
        if (result.ledger) northstarRunBindingRef.current.runId = result.ledger.run.id;
        activeRunIdRef.current = result.ledger?.run.id ?? null;
        const activity = northstarRuntimeActivity(northstarWorkspaceRuntime.getSnapshot());
        if (result.status === "completed") {
          const finalText = northstarSummaryText(result.finalSummary);
          updateAssistantMessage({
            content: finalText,
            activity,
            planTitle: "North Star built the visual",
            runId: result.ledger?.run.id,
            runStatus: "completed",
            streaming: false,
          });
          setConversationSummary(finalText);
        } else {
          const currentSnapshot = northstarWorkspaceRuntime.getSnapshot();
          updateAssistantMessage({
            content: northstarUserFacingRunMessage(currentSnapshot, result.error),
            activity,
            planTitle: "North Star paused the visual build",
            runId: result.ledger?.run.id,
            runStatus: result.status === "cancelled" ? "cancelled" : result.status === "failed" ? "failed" : "blocked",
            streaming: false,
            error: result.status !== "cancelled",
          });
        }
      } catch (error) {
        const currentSnapshot = northstarWorkspaceRuntime?.getSnapshot() ?? EMPTY_NORTHSTAR_RUNTIME_SNAPSHOT;
        updateAssistantMessage({
          content: northstarUserFacingRunMessage(
            currentSnapshot,
            error instanceof Error ? error.message : "North Star could not start the visual build.",
          ),
          runStatus: "failed",
          streaming: false,
          error: true,
        });
        if (!currentSnapshot.ledger) northstarRunBindingRef.current = null;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          activeAssistantIdRef.current = null;
        }
        setLoading(false);
      }
      return;
    }

    try {
      const response = await fetch("/api/canvas-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: modelMessage,
          attachments: requestAttachments,
          historyAttachments,
          contextMode: activeMode,
          canvasContext,
          selectedCanvasContext:
            activeMode === "selection" ? selectedCanvasContext : undefined,
          history: conversationHistory,
          historyToolContext,
          conversationSummary,
          thinkingDepth,
          compositionCheckpoint: compositionCheckpointRef.current,
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errorPayload?.error || "North Star could not complete that request."
        );
      }
      if (!response.body) {
        throw new Error("North Star returned a response without a readable stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFinal = false;
      let terminalBlockMessage: string | null = null;

      const handleStreamEvent = (eventName: string, data: unknown) => {
        if (!data || typeof data !== "object") return;
        const payload = data as Record<string, unknown>;

        if (eventName === "run.started") {
          const runId = typeof payload.runId === "string" ? payload.runId : undefined;
          activeRunIdRef.current = runId ?? null;
          updateAssistantMessage({
            runId,
            runStatus: "running",
          });
          return;
        }

        if (eventName === "run.checkpoint") {
          const checkpoint = payload.checkpoint;
          if (
            checkpoint &&
            typeof checkpoint === "object" &&
            (checkpoint as Record<string, unknown>).version ===
              "northstar.composition-checkpoint.v1" &&
            typeof (checkpoint as Record<string, unknown>).artifactId === "string" &&
            typeof (checkpoint as Record<string, unknown>).objective === "string"
          ) {
            const nextCheckpoint = checkpoint as unknown as CanvasAICompositionCheckpoint;
            compositionCheckpointRef.current = nextCheckpoint;
            setCompositionCheckpoint(nextCheckpoint);
            checkpointUpdatedThisRunRef.current = true;
          }
          return;
        }

        if (eventName === "plan.created") {
          const rawSteps = Array.isArray(payload.steps) ? payload.steps : [];
          const activity: CanvasAIActivityItem[] = rawSteps
            .filter((step): step is Record<string, unknown> => Boolean(step && typeof step === "object"))
            .map((step, index) => ({
              id:
                typeof step.id === "string" && step.id
                  ? step.id
                  : `step-${index + 1}`,
              kind: "tool",
              status: "pending",
              icon:
                typeof step.icon === "string"
                  ? (step.icon as CanvasAIActivityIcon)
                  : "inspect",
              label:
                typeof step.label === "string" && step.label
                  ? step.label
                  : "Inspecting the canvas",
              tool: typeof step.tool === "string" ? step.tool : undefined,
              objectIds: [],
            }));

          updateAssistantMessage({
            planTitle:
              typeof payload.title === "string" ? payload.title : "Reviewing the canvas",
            activity,
            runStatus: "running",
          });
          return;
        }

        if (eventName === "plan.extended") {
          const rawSteps = Array.isArray(payload.steps) ? payload.steps : [];
          const appended: CanvasAIActivityItem[] = rawSteps
            .filter((step): step is Record<string, unknown> => Boolean(step && typeof step === "object"))
            .map((step, index) => ({
              id:
                typeof step.id === "string" && step.id
                  ? step.id
                  : `extended-step-${index + 1}`,
              kind: "tool",
              status: "pending",
              icon:
                typeof step.icon === "string"
                  ? (step.icon as CanvasAIActivityIcon)
                  : "tool",
              label:
                typeof step.label === "string" && step.label
                  ? step.label
                  : "Continue building the solution",
              detail:
                index === 0 && typeof payload.visualStrategy === "string"
                  ? payload.visualStrategy
                  : undefined,
              tool: typeof step.tool === "string" ? step.tool : undefined,
              objectIds: [],
            }));
          updateAssistantMessage((current) => {
            const merged = [...(current.activity ?? [])];
            const indexById = new Map(merged.map((item, index) => [item.id, index]));
            for (const item of appended) {
              const existingIndex = indexById.get(item.id);
              if (existingIndex === undefined) {
                indexById.set(item.id, merged.length);
                merged.push(item);
                continue;
              }
              merged[existingIndex] = {
                ...merged[existingIndex],
                ...item,
                status: merged[existingIndex]?.status ?? item.status,
              };
            }
            return {
              planTitle:
                typeof payload.title === "string"
                  ? payload.title
                  : current.planTitle,
              activity: merged,
              runStatus: "running",
            };
          });
          return;
        }

        if (eventName === "step.started") {
          if (typeof payload.stepId === "string") {
            updateStep(payload.stepId, { status: "running" });
          }
          return;
        }

        if (eventName === "tool.started") {
          if (typeof payload.stepId === "string") {
            updateStep(payload.stepId, { status: "running" });
          }
          return;
        }

        if (eventName === "tool.completed") {
          if (payload.resultView && typeof payload.resultView === "object") {
            groundedDataResultCountRef.current += 1;
          }
          if (typeof payload.stepId === "string") {
            updateStep(payload.stepId, {
              detail: typeof payload.detail === "string" ? payload.detail : undefined,
              objectIds: Array.isArray(payload.objectIds)
                ? payload.objectIds.filter((id): id is string => typeof id === "string")
                : [],
              resultView:
                payload.resultView && typeof payload.resultView === "object"
                  ? (payload.resultView as CanvasAIToolResultView)
                  : undefined,
            });
          }
          return;
        }

        if (eventName === "step.completed") {
          if (typeof payload.stepId === "string") {
            updateStep(payload.stepId, {
              status: "completed",
              detail: typeof payload.detail === "string" ? payload.detail : undefined,
              objectIds: Array.isArray(payload.objectIds)
                ? payload.objectIds.filter((id): id is string => typeof id === "string")
                : undefined,
            });
          }
          return;
        }

        if (eventName === "tool.failed" || eventName === "step.failed") {
          if (typeof payload.stepId === "string") {
            updateStep(payload.stepId, {
              status: "failed",
              icon: "warning",
              detail:
                typeof payload.detail === "string"
                  ? payload.detail
                  : "This step could not be completed.",
            });

            if (
              eventName === "tool.failed" &&
              isCanvasAIActionTool(payload.tool) &&
              !failedActionStepIdsRef.current.has(payload.stepId)
            ) {
              failedActionStepIdsRef.current.add(payload.stepId);
              actionFailureCountRef.current += 1;
            }
          }
          return;
        }

        if (eventName === "canvas.action.requested") {
          const runId =
            typeof payload.runId === "string"
              ? payload.runId
              : activeRunIdRef.current;
          const rawAction = payload.action;
          if (!runId || !rawAction || typeof rawAction !== "object") return;
          const action = rawAction as CanvasAIActionRequest;
          if (!action.stepId || !isCanvasAIActionTool(action.tool)) return;

          actionRequestCountRef.current += 1;
          updateStep(action.stepId, { status: "running" });
          actionExecutionChainRef.current = actionExecutionChainRef.current.then(
            async () => {
              const criticalFailure = actionExecutionResultsRef.current.find(
                (record) => !record.ok && new Set<CanvasAIActionTool>([
                  "compose_visual_scene",
                  "compose_visual_board",
                  "compose_artifact",
                  "validate_visual_board",
                  "review_artifact_layout",
                  "refine_artifact_presentation",
                ]).has(record.tool),
              );
              const isDownstreamPresentationAction = new Set<CanvasAIActionTool>([
                "validate_visual_board",
                "review_artifact_layout",
                "refine_artifact_presentation",
                "focus_objects",
              ]).has(action.tool);
              const blockedByCriticalFailure = Boolean(criticalFailure && isDownstreamPresentationAction);
              const rawResult = blockedByCriticalFailure
                ? {
                    ok: false,
                    detail: `Not run because “${criticalFailure?.label ?? "the required composition step"}” did not complete successfully. The last valid canvas state was preserved.`,
                    objectIds: [],
                  }
                : await onExecuteCanvasAction(runId, action);
              const requiresObjects = true;
              const result: CanvasAIActionExecutionResult =
                rawResult.ok &&
                requiresObjects &&
                rawResult.objectIds.length === 0
                  ? {
                      ok: false,
                      detail:
                        "The canvas action returned no verifiable canvas objects.",
                      objectIds: [],
                    }
                  : rawResult;

              actionExecutionResultsRef.current.push({
                ...result,
                stepId: action.stepId,
                tool: action.tool,
                label: action.label,
                arguments: action.arguments ?? {},
                asset: action.asset,
              });

              if (result.ok) {
                updateStep(action.stepId, {
                  status: "completed",
                  detail: result.detail,
                  objectIds: result.objectIds,
                });
              } else {
                if (!blockedByCriticalFailure && !failedActionStepIdsRef.current.has(action.stepId)) {
                  failedActionStepIdsRef.current.add(action.stepId);
                  actionFailureCountRef.current += 1;
                }
                updateStep(action.stepId, {
                  status: blockedByCriticalFailure ? "cancelled" : "failed",
                  icon: "warning",
                  detail: result.detail,
                  objectIds: result.objectIds,
                });
              }
            },
          );
          return;
        }

        if (eventName === "assistant.delta" && typeof payload.text === "string") {
          updateAssistantMessage((current) => ({
            content: `${current.content}${payload.text}`,
          }));
          return;
        }

        if (eventName === "assistant.replace" && typeof payload.text === "string") {
          updateAssistantMessage({ content: payload.text });
          return;
        }

        if (eventName === "assistant.final") {
          receivedFinal = true;
          const finalPayload = payload as unknown as CanvasAIResponsePayload;
          const requiredCanvasAction = finalPayload.meta?.requiredCanvasAction === true;
          const requiredDataTool = finalPayload.meta?.requiredDataTool === true;

          if (requiredCanvasAction && actionRequestCountRef.current === 0) {
            throw new Error(
              "North Star understood this as a canvas action, but no canvas action was dispatched. Nothing was changed."
            );
          }
          if (requiredDataTool && groundedDataResultCountRef.current === 0) {
            throw new Error(
              "North Star understood this as a tenant-data request, but no grounded app, flow, screenshot, or icon result was returned."
            );
          }

          if (actionRequestCountRef.current > 0) {
            deferredFinalPayloadRef.current = finalPayload;
            return;
          }

          updateAssistantMessage({
            content:
              typeof finalPayload.answer === "string" ? finalPayload.answer : "",
            references: finalPayload.references ?? [],
            suggestedActions: finalPayload.suggestedActions ?? [],
            showSuggestedActions: finalPayload.showSuggestedActions === true,
            streaming: false,
          });
          if (typeof finalPayload.conversationSummary === "string") {
            setConversationSummary(finalPayload.conversationSummary);
          }
          return;
        }

        if (eventName === "run.completed") {
          if (actionRequestCountRef.current === 0) {
            updateAssistantMessage({
              runStatus: "completed",
              streaming: false,
            });
          }
          return;
        }

        if (eventName === "run.cancelled") {
          updateAssistantMessage((current) => ({
            content: current.content || "North Star stopped this run.",
            runStatus: "cancelled",
            streaming: false,
            activity: (current.activity ?? []).map((item) =>
              item.status === "pending" || item.status === "running"
                ? { ...item, status: "cancelled" as const }
                : item
            ),
          }));
          return;
        }

        if (eventName === "run.failed") {
          updateAssistantMessage({ runStatus: "failed" });
          return;
        }

        if (eventName === "run.blocked") {
          terminalBlockMessage = typeof payload.error === "string"
            ? payload.error
            : "North Star stopped at the last verified artboard because the next operation could not be committed safely.";
          receivedFinal = true;
          updateAssistantMessage((current) => ({
            content: terminalBlockMessage || current.content,
            references: [],
            suggestedActions: [],
            showSuggestedActions: false,
            runStatus: "blocked",
            streaming: false,
            error: true,
            activity: (current.activity ?? []).map((item) =>
              item.status === "pending" || item.status === "running"
                ? { ...item, status: "cancelled" as const }
                : item
            ),
          }));
          return;
        }

        if (eventName === "error") {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : "North Star could not complete that request."
          );
        }
      };

      const flushEvent = (rawEvent: string) => {
        const lines = rawEvent.split(/\r?\n/);
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) return;
        handleStreamEvent(
          eventName,
          normalizeNorthstarDisplayPayload(JSON.parse(dataLines.join("\n")) as unknown),
        );
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (rawEvent.trim()) flushEvent(rawEvent);
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }

      if (buffer.trim()) flushEvent(buffer);
      await actionExecutionChainRef.current;

      if (actionRequestCountRef.current > 0 && !controller.signal.aborted && !terminalBlockMessage) {
        const deferredConversationSummary = (
          deferredFinalPayloadRef.current as CanvasAIResponsePayload | null
        )?.conversationSummary;
        const recoverableTools = new Set<CanvasAIActionTool>([
          "focus_objects",
        ]);
        const hasCompletedScene = actionExecutionResultsRef.current.some(
          (record) =>
            record.ok &&
            (record.tool === "compose_visual_scene" ||
              record.tool === "compose_visual_board" ||
              record.tool === "compose_artifact"),
        );
        const hardFailureCount = actionExecutionResultsRef.current.filter(
          (record) => !record.ok && (!hasCompletedScene || !recoverableTools.has(record.tool)),
        ).length;
        const failed = hardFailureCount > 0;
        updateAssistantMessage({
          content: buildCanvasAIActionOutcomeMessage(
            actionExecutionResultsRef.current,
            hardFailureCount,
          ),
          references: [],
          suggestedActions: [],
          showSuggestedActions: false,
          runStatus: failed ? "failed" : "completed",
          streaming: false,
          error: failed,
        });
        if (typeof deferredConversationSummary === "string") {
          setConversationSummary(deferredConversationSummary);
        }
        if (!failed && checkpointUpdatedThisRunRef.current) {
          compositionCheckpointRef.current = null;
          setCompositionCheckpoint(null);
        }
      }

      if (!receivedFinal && !controller.signal.aborted) {
        throw new Error("North Star's streamed response ended before completion.");
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        updateAssistantMessage((current) => ({
          content: current.content || "North Star stopped this run.",
          runStatus: "cancelled",
          streaming: false,
          activity: (current.activity ?? []).map((item) =>
            item.status === "pending" || item.status === "running"
              ? { ...item, status: "cancelled" as const }
              : item
          ),
        }));
      } else {
        updateAssistantMessage((current) => ({
          content:
            error instanceof Error
              ? error.message
              : "North Star could not complete that request.",
          references: [],
          suggestedActions: [],
          showSuggestedActions: false,
          activity: (current.activity ?? []).map((item) =>
            item.status === "pending" || item.status === "running"
              ? { ...item, status: "failed" as const, icon: "warning" as const }
              : item
          ),
          runStatus: "failed",
          streaming: false,
          error: true,
        }));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        activeAssistantIdRef.current = null;
      }
      const finishedRunId = activeRunIdRef.current;
      if (finishedRunId) onFinalizeCanvasActionRun(finishedRunId);
      activeRunIdRef.current = null;
      setLoading(false);
    }
  };

  const resumeNorthstarRun = async () => {
    if (!northstarWorkspaceRuntime || loading) return;
    const assistantId = northstarRunBindingRef.current?.assistantMessageId;
    if (!assistantId) return;
    activeAssistantIdRef.current = assistantId;
    setLoading(true);
    setMessages((current) => current.map((message) => message.id === assistantId
      ? { ...message, streaming: true, error: false, runStatus: "running" }
      : message));
    try {
      const result = await northstarWorkspaceRuntime.resumeRun();
      const activity = northstarRuntimeActivity(northstarWorkspaceRuntime.getSnapshot());
      setMessages((current) => current.map((message) => message.id === assistantId
        ? {
            ...message,
            content: result.status === "completed"
              ? northstarSummaryText(result.finalSummary)
              : northstarUserFacingRunMessage(northstarWorkspaceRuntime.getSnapshot(), result.error),
            activity,
            planTitle: result.status === "completed" ? "North Star built the visual" : "North Star paused the visual build",
            runStatus: result.status === "completed" ? "completed" : result.status === "cancelled" ? "cancelled" : result.status === "failed" ? "failed" : "blocked",
            streaming: false,
            error: result.status !== "completed" && result.status !== "cancelled",
          }
        : message));
    } catch (error) {
      const snapshot = northstarWorkspaceRuntime.getSnapshot();
      setMessages((current) => current.map((message) => message.id === assistantId
        ? {
            ...message,
            content: northstarUserFacingRunMessage(
              snapshot,
              error instanceof Error ? error.message : "North Star could not resume this build.",
            ),
            runStatus: "failed",
            streaming: false,
            error: true,
          }
        : message));
    } finally {
      activeAssistantIdRef.current = null;
      setLoading(false);
    }
  };

  const starterPrompts = hasSelection
    ? [
        "Explain what these selected elements represent.",
        "How are these selected elements related?",
        "What looks incomplete or unclear here?",
      ]
    : [
        "Help me think through a product problem.",
        "Review what is currently on this canvas.",
        "What should we work on next?",
      ];

  const composerExpanded = attachments.length > 0 || input.includes("\n") || input.length > 56;
  const northstarDebugInspectorEnabled =
    process.env.NEXT_PUBLIC_NORTHSTAR_DEBUG_INSPECTOR === "true";
  const currentNorthstarRecoveryKind = northstarRecoveryKind(northstarRuntimeSnapshot);

  return (
    <div
      className={cn(
        "mx-auto flex h-full min-h-0 w-full flex-col pb-5 pt-4",
        expanded ? "max-w-[860px] px-8" : "max-w-none px-5"
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 pb-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-4 text-[10px] font-[850] uppercase tracking-[0.12em]">
          <button
            type="button"
            onClick={() => setContextMode("canvas")}
            className={cn(
              "border-b-2 pb-1 transition",
              contextMode === "canvas"
                ? "border-[#6B5CFF] text-zinc-950 dark:text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            )}
          >
            Canvas · {canvasContext.summary.objectCount}
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => hasSelection && setContextMode("selection")}
            className={cn(
              "border-b-2 pb-1 transition",
              contextMode === "selection" && hasSelection
                ? "border-[#6B5CFF] text-zinc-950 dark:text-white"
                : "border-transparent text-zinc-400",
              !hasSelection && "cursor-not-allowed opacity-35"
            )}
          >
            Selection · {selectedCanvasContext.selectedIds.length}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 text-zinc-500 dark:text-zinc-400">
          <button
            type="button"
            onClick={copyContext}
            className="p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
            title="Copy active AI context"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            className="p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
            title={expanded ? "Collapse chat" : "Expand chat"}
          >
            {expanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {explorerApp ? (
          <ChatAppExplorer
            app={explorerApp}
            onBack={() => setExplorerAppId(null)}
            handlers={toolHandlers}
            onInsertFlow={onInsertFlow}
          />
        ) : messages.length === 0 ? (
          <div className="flex min-h-full flex-col justify-center">
            <div className="mx-auto w-full max-w-[310px] text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center text-[#6B5CFF] dark:text-[#BDB6FF]">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="mt-2 text-[15px] font-[800] tracking-[-0.02em] text-zinc-950 dark:text-white">
                Hi, I&apos;m North Star.
              </p>
              <p className="mt-3 text-[13px] leading-[21px] text-zinc-500 dark:text-zinc-400">
                Bring a question, image, flow, or canvas selection and we can work through it together.
              </p>
            </div>

            <div className="mx-auto mt-7 w-full max-w-[330px] border-y border-black/5 dark:border-white/10">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="flex w-full items-center justify-between gap-4 border-b border-black/5 py-3 text-left text-[12px] font-[700] leading-[18px] text-zinc-700 transition last:border-b-0 hover:text-zinc-950 dark:border-white/10 dark:text-zinc-300 dark:hover:text-white"
                >
                  <span>{prompt}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "flex justify-end pl-8" : "pr-2"}
              >
                {message.role === "assistant" &&
                  message.activity &&
                  message.activity.length > 0 && (
                    <ChatActivityGroup
                      items={message.activity}
                      title={message.planTitle}
                      runStatus={message.runStatus}
                      onReferenceHover={onReferenceHover}
                      onReferenceLeave={onReferenceLeave}
                      onReferenceFocus={focusReferenceFromChat}
                      toolHandlers={toolHandlers}
                    />
                  )}

                <div
                  className={cn(
                    "text-[13px] leading-[21px]",
                    message.role === "user"
                      ? message.attachments?.length
                        ? "w-fit max-w-[94%] text-zinc-900 dark:text-white"
                        : "w-fit max-w-[94%] rounded-[22px] border border-white/80 bg-white/68 px-3.5 py-3 text-zinc-900 shadow-[0_10px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.075] dark:text-white"
                      : message.error
                        ? "border-l-2 border-red-400 pl-3 text-red-600 dark:text-red-300"
                        : "text-zinc-800 dark:text-zinc-100"
                  )}
                >
                  {message.role === "assistant" ? (
                    <>
                      <MarkdownMessage content={message.content} />
                      {message.streaming && message.content && (
                        <span className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse bg-[#6B5CFF] align-[-2px] dark:bg-[#BDB6FF]" />
                      )}
                    </>
                  ) : (
                    <>
                      {message.attachments && message.attachments.length > 0 && (
                        <ChatAttachmentGallery
                          attachments={message.attachments}
                          onOpenImage={setLightboxImage}
                          onCanvasAssetPointerDown={onCanvasAssetPointerDown}
                        />
                      )}
                      {message.content && (
                        <p
                          className={cn(
                            "whitespace-pre-wrap",
                            message.attachments?.length
                              ? "ml-auto mt-2 w-fit max-w-full rounded-[20px] border border-white/80 bg-white/68 px-3.5 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.075]"
                              : "px-0.5"
                          )}
                        >
                          {message.content}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {message.role === "assistant" &&
                  message.references &&
                  message.references.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.references.map((reference, referenceIndex) => (
                        <div
                          key={`${message.id}-reference-${referenceIndex}`}
                          className="flex items-center gap-2 border-l-2 border-[#6B5CFF]/50 bg-[#6B5CFF]/5 px-3 py-2 dark:bg-[#6B5CFF]/10"
                          onMouseEnter={() => onReferenceHover(reference.objectIds)}
                          onMouseLeave={onReferenceLeave}
                        >
                          <button
                            type="button"
                            onClick={() => focusReferenceFromChat(reference.objectIds)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-[11px] font-[800] text-zinc-900 dark:text-white">
                              {reference.label}
                            </span>
                            {reference.reason && (
                              <span className="mt-0.5 block line-clamp-2 text-[10px] leading-[15px] text-zinc-500 dark:text-zinc-400">
                                {reference.reason}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => focusReferenceFromChat(reference.objectIds)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center text-zinc-500 transition hover:text-[#6B5CFF] dark:text-zinc-400"
                            title="Show on canvas"
                          >
                            <LocateFixed className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                {message.role === "assistant" &&
                  message.showSuggestedActions &&
                  message.suggestedActions &&
                  message.suggestedActions.length > 0 && (
                    <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
                      <p className="text-[10px] font-[800] uppercase tracking-[0.14em] text-zinc-400">
                        Suggested next steps
                      </p>
                      <div className="mt-2 space-y-2">
                        {message.suggestedActions.map((action, actionIndex) => (
                          <div
                            key={`${message.id}-action-${actionIndex}`}
                            className="flex gap-2 text-[11px] leading-[17px] text-zinc-600 dark:text-zinc-300"
                          >
                            <span className="mt-[7px] h-1 w-1 shrink-0 bg-[#6B5CFF]" />
                            <span>{action.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            ))}

            {loading &&
              messages[messages.length - 1]?.streaming &&
              !messages[messages.length - 1]?.content &&
              !(messages[messages.length - 1]?.activity?.length) && (
                <div className="flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  North Star is preparing this run…
                </div>
              )}
          </div>
        )}

        {northstarWorkspaceRuntime && northstarRuntimeSnapshot.ledger && (
          <div className="mt-5 space-y-3">
            {northstarDebugInspectorEnabled && (
              <NorthstarLedgerInspector snapshot={northstarRuntimeSnapshot} />
            )}
            {(northstarRuntimeSnapshot.status === "awaiting-recovery" || northstarRuntimeSnapshot.status === "blocked") && (
              <div className="rounded-[18px] border border-black/[0.06] bg-white/55 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-[11px] leading-[17px] text-zinc-600 dark:text-zinc-300">
                  {northstarUserFacingRunMessage(northstarRuntimeSnapshot)}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  {currentNorthstarRecoveryKind !== "none" && (
                    <button
                      type="button"
                      onClick={() => void resumeNorthstarRun()}
                      disabled={loading}
                      className="rounded-full bg-[#6B5CFF] px-3 py-2 text-[10px] font-[850] text-white disabled:opacity-40"
                    >
                      {currentNorthstarRecoveryKind === "transport" ? "Resume exact request" : "Retry this task"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={cancelRun}
                    disabled={loading}
                    className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-[850] text-zinc-600 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300"
                  >
                    Cancel build
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-black/5 pt-3 dark:border-white/10">
        <input
          ref={chatFileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleChatFileSelect}
        />

        <div
          className={cn(
            "flex flex-col border border-white/75 bg-white/72 shadow-lg shadow-black/5 backdrop-blur-xl transition-colors duration-200 dark:border-white/10 dark:bg-white/8",
            expanded
              ? composerExpanded
                ? "rounded-[24px]"
                : "rounded-full"
              : "rounded-[20px]"
          )}
        >
          {attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-4 opacity-100 transition-opacity duration-150 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="group relative h-[68px] w-[68px] shrink-0 overflow-visible">
                  <div className="h-[68px] w-[68px] overflow-hidden rounded-[12px] border border-black/[0.055] bg-white/45 shadow-sm dark:border-white/10 dark:bg-white/[0.05]">
                    {attachment.dataUrl && (
                      <img
                        src={attachment.dataUrl}
                        alt={attachment.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeChatAttachment(attachment.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white opacity-0 shadow-md transition group-hover:opacity-100 dark:bg-zinc-700"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!loading) void sendMessage();
            }}
            className={cn(
              expanded
                ? "flex min-h-[60px] items-end gap-2 p-2"
                : "flex min-h-[118px] flex-col p-2"
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setAttachmentError(null);
              }}
              onPaste={handleComposerPaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!loading) void sendMessage();
                }
              }}
              rows={1}
              placeholder="Ask North Star anything…"
              className={cn(
                "max-h-[180px] resize-none overflow-y-auto bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400 [scrollbar-width:none] dark:text-white [&::-webkit-scrollbar]:hidden",
                expanded
                  ? "order-2 min-h-[40px] flex-1 py-2.5 text-[13px] leading-[20px]"
                  : "min-h-[58px] w-full px-2 py-2.5 text-[14px] leading-[21px]"
              )}
              style={{ height: expanded ? 40 : 58 }}
            />

            <div
              className={cn(
                expanded
                  ? "contents"
                  : "mt-1 flex w-full items-center gap-1 border-t border-black/[0.055] pt-1 dark:border-white/10"
              )}
            >
              <button
                type="button"
                onClick={() => chatFileInputRef.current?.click()}
                disabled={loading || attachments.length >= MAX_CHAT_ATTACHMENTS}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/60 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white",
                  expanded && "order-1 mb-[2px]"
                )}
                title="Attach images"
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>

              <div
                className={cn(
                  "relative shrink-0",
                  expanded && "order-3 mb-[2px]"
                )}
              >
                <button
                  ref={thinkingButtonRef}
                  type="button"
                  onClick={() => setThinkingMenuOpen((current) => !current)}
                  disabled={loading}
                  className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[12px] font-[700] text-zinc-500 transition hover:bg-white/60 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                  title="Choose North Star thinking depth"
                  aria-haspopup="menu"
                  aria-expanded={thinkingMenuOpen}
                >
                  <span className="capitalize">{thinkingDepth}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      thinkingMenuOpen && "rotate-180"
                    )}
                  />
                </button>

                {thinkingMenuOpen && !loading && thinkingButtonRef.current &&
                  createPortal(
                    (() => {
                      const anchor = thinkingButtonRef.current!.getBoundingClientRect();
                      const menuWidth = 220;
                      const menuHeight = 190;
                      const viewportPadding = 12;
                      const left = Math.min(
                        Math.max(viewportPadding, anchor.right - menuWidth),
                        window.innerWidth - menuWidth - viewportPadding
                      );
                      const top = Math.max(viewportPadding, anchor.top - menuHeight - 10);

                      return (
                        <div
                          role="menu"
                          className="fixed z-[1000] w-[220px] overflow-hidden rounded-[18px] border border-black/10 bg-white/95 p-2 shadow-[0_22px_65px_rgba(15,23,42,0.2)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/95"
                          style={{ left, top }}
                        >
                          <div className="px-3 pb-2 pt-1 text-[10px] font-[850] uppercase tracking-[0.12em] text-zinc-400">
                            Thinking depth
                          </div>
                          {([
                            ["low", "Fast, focused work"],
                            ["medium", "Balanced research and refinement"],
                            ["high", "Deep, recursive problem solving"],
                          ] as Array<[NorthStarThinkingDepth, string]>).map(([value, description]) => (
                            <button
                              key={value}
                              type="button"
                              role="menuitemradio"
                              aria-checked={thinkingDepth === value}
                              onClick={() => {
                                setThinkingDepth(value);
                                setThinkingMenuOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-start justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left transition",
                                thinkingDepth === value
                                  ? "bg-[#6B5CFF]/10 text-[#5F50F5] dark:bg-[#BDB6FF]/10 dark:text-[#BDB6FF]"
                                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10"
                              )}
                            >
                              <span>
                                <span className="block text-[13px] font-[760] capitalize">{value}</span>
                                <span className="mt-0.5 block text-[10px] font-[520] leading-[14px] text-zinc-400">
                                  {description}
                                </span>
                              </span>
                              {thinkingDepth === value && <Check className="mt-0.5 h-4 w-4" />}
                            </button>
                          ))}
                        </div>
                      );
                    })(),
                    document.body
                  )}
              </div>

              <button
                type={loading ? "button" : "submit"}
                onClick={loading ? cancelRun : undefined}
                disabled={!loading && !input.trim() && attachments.length === 0}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95",
                  expanded ? "order-4 mb-[2px]" : "ml-auto",
                  loading
                    ? "border border-[#6B5CFF]/30 bg-[#6B5CFF]/10 text-[#6B5CFF] hover:bg-[#6B5CFF]/15 dark:border-[#BDB6FF]/30 dark:bg-[#BDB6FF]/10 dark:text-[#BDB6FF]"
                    : "bg-[#6B5CFF] text-white shadow-lg shadow-[#6B5CFF]/20 hover:bg-[#5F50F5] disabled:cursor-not-allowed disabled:opacity-35"
                )}
                title={loading ? "Stop North Star" : "Send"}
              >
                {loading ? (
                  <Square className="h-3 w-3 fill-current" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
        </div>

        {attachmentError && (
          <p className="mt-2 px-2 text-[10px] font-[650] text-rose-500 dark:text-rose-300">
            {attachmentError}
          </p>
        )}
      </div>

      {lightboxImage && (
        <ChatImageLightbox
          image={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}
function AppsWorkspacePanel({
  apps,
  loading,
  error,
  selectedAppId,
  onSelectApp,
  onInsertFlow,
  onScreenPointerDown,
}: {
  apps: WorkspaceApp[];
  loading: boolean;
  error: string | null;
  selectedAppId: string | null;
  onSelectApp: (id: string) => void;
  onInsertFlow: (app: WorkspaceApp, flow: WorkspaceAppFlow) => void;
  onScreenPointerDown: (app: WorkspaceApp, flow: WorkspaceAppFlow, screen: WorkspaceAppScreen, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"apps" | "flows">("apps");
  const [flowMode, setFlowMode] = useState<"onboarding" | "browsing">("onboarding");
  const appsPerPage = 9;

  const filteredApps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return apps;

    return apps.filter((app) => {
      const haystack = [
        app.name,
        app.domain,
        app.description,
        app.category,
        ...app.flows.map((flow) => flow.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [apps, query]);

  const pageCount = Math.max(1, Math.ceil(filteredApps.length / appsPerPage));
  const safePage = Math.min(page, pageCount - 1);
  const pagedApps = filteredApps.slice(safePage * appsPerPage, safePage * appsPerPage + appsPerPage);
  const selectedApp = apps.find((app) => app.id === selectedAppId) ?? filteredApps[0] ?? apps[0] ?? null;
  const flows = selectedApp?.flows ?? [];
  const flowBuckets = useMemo(() => bucketWorkspaceFlows(flows), [flows]);
  const visibleFlows = flowMode === "onboarding" ? flowBuckets.onboarding : flowBuckets.browsing;

  useEffect(() => {
    setPage(0);
  }, [query, apps.length]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const openAppFlows = (app: WorkspaceApp) => {
    onSelectApp(app.id);
    setFlowMode("onboarding");
    setView("flows");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {view === "apps" && (
        <div className="shrink-0 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <p className="text-[15px] font-[850] tracking-[-0.025em] text-zinc-950 dark:text-white">Apps</p>
            <p className="mt-1 max-w-[280px] text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
              Choose a company app, then insert one of its flows.
            </p>
          </div>
        </div>
      )}

      {view === "apps" && (
        <div className="mx-5 mb-4 flex h-10 shrink-0 items-center gap-2 border-y border-black/5 text-zinc-400 dark:border-white/10">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps"
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-[600] text-zinc-700 outline-none placeholder:text-zinc-400 dark:text-zinc-200 dark:placeholder:text-zinc-500"
          />
        </div>
      )}

      {loading ? (
        <div className="px-5 text-[13px] text-zinc-500 dark:text-zinc-400">Loading company apps…</div>
      ) : error ? (
        <div className="mx-5 border border-red-200/70 bg-red-50/80 p-4 text-[12px] leading-5 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
          {error}
        </div>
      ) : apps.length === 0 ? (
        <div className="mx-5 border border-black/5 bg-white/46 p-4 text-[12px] leading-5 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          No apps found for this company workspace yet.
        </div>
      ) : view === "flows" && selectedApp ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-5 pt-0">
          <SelectedAppFlowHeader app={selectedApp} onBack={() => setView("apps")} />

          {flows.length === 0 ? (
            <div className="mx-5 mt-4 border border-black/5 bg-white/40 p-4 text-[12px] leading-5 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
              No captured flows are available for this app yet.
            </div>
          ) : (
            <div className="mt-3 flex min-h-0 flex-1 flex-col px-5">
              <FlowModeTabs
                activeMode={flowMode}
                onboardingCount={flowBuckets.onboarding.length}
                browsingCount={flowBuckets.browsing.length}
                onChange={setFlowMode}
              />

              {visibleFlows.length === 0 ? (
                <div className="mt-4 border border-black/5 bg-white/40 p-4 text-[12px] leading-5 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                  No {flowMode} flows found for this app yet.
                </div>
              ) : (
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="grid gap-3 pb-2">
                    {visibleFlows.map((flow) => (
                      <FlowGalleryCard
                        key={flow.id}
                        flow={flow}
                        onInsertFlow={() => onInsertFlow(selectedApp, flow)}
                        onScreenPointerDown={(screen, event) => onScreenPointerDown(selectedApp, flow, screen, event)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
          {filteredApps.length === 0 ? (
            <div className="border border-black/5 bg-white/40 p-4 text-[12px] leading-5 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
              No apps match that search.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                {pagedApps.map((app) => (
                  <CompanyStyleAppCard key={app.id} app={app} onClick={() => openAppFlows(app)} />
                ))}
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/10">
                <span className="text-[11px] font-[750] text-zinc-500 dark:text-zinc-400">
                  {filteredApps.length === 0 ? 0 : safePage * appsPerPage + 1}-{Math.min(filteredApps.length, (safePage + 1) * appsPerPage)} of {filteredApps.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={safePage === 0}
                    className="flex h-8 w-8 items-center justify-center border border-black/5 bg-white/50 text-zinc-600 shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:bg-white/8 dark:text-zinc-300 dark:hover:bg-white/12"
                    title="Previous apps"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="flex h-8 w-8 items-center justify-center border border-black/5 bg-white/50 text-zinc-600 shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:bg-white/8 dark:text-zinc-300 dark:hover:bg-white/12"
                    title="Next apps"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CompanyStyleAppCard({ app, onClick }: { app: WorkspaceApp; onClick: () => void }) {
  const flowCount = app.flows.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square w-full overflow-hidden border border-white/60 bg-white/30 text-center shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-white/90 hover:bg-white/42 hover:shadow-[0_16px_34px_rgba(15,23,42,0.13)] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      <AppBlurBackdrop app={app} soft />
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.14) 45%, rgba(236,238,252,0.32) 100%)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_20%,rgba(255,255,255,0.72),transparent_30%),radial-gradient(circle_at_80%_88%,rgba(0,0,0,0.08),transparent_55%)]" />

      <div className="relative flex h-full flex-col items-center justify-center px-2 py-2">
        <div className="flex h-[52px] shrink-0 items-center justify-center">
          <AppLogo app={app} size="card" />
        </div>
        <div className="mt-1.5 flex w-full shrink-0 flex-col items-center text-center">
          <p className="max-w-full truncate text-[10.5px] font-[900] leading-[12px] tracking-[-0.035em] text-zinc-950 dark:text-white">
            {app.name}
          </p>
          <p className="mt-0.5 text-[9px] font-[750] leading-[10px] tracking-[-0.01em] text-zinc-500 dark:text-zinc-400">
            {flowCount} {flowCount === 1 ? "flow" : "flows"}
          </p>
        </div>
      </div>
    </button>
  );
}

function SelectedAppFlowHeader({ app, onBack }: { app: WorkspaceApp; onBack: () => void }) {
  const screenCount = app.totalScreens ?? app.flows.reduce((total, flow) => total + flow.screens.length, 0);

  return (
    <div className="relative shrink-0 overflow-hidden border-b border-white/60 bg-white/30 shadow-[0_14px_32px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5">
      <AppBlurBackdrop app={app} />
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.64) 0%, rgba(255,255,255,0.30) 42%, rgba(236,238,252,0.32) 100%)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.82),transparent_34%),radial-gradient(circle_at_88%_76%,rgba(0,0,0,0.10),transparent_54%)]" />

      <div className="relative flex min-h-[112px] items-center gap-3 px-5 py-3 pr-[112px]">
        <AppLogo app={app} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-[950] tracking-[-0.04em] text-zinc-950 dark:text-white">{app.name}</p>
          <p className="mt-0.5 truncate text-[10.5px] font-[650] tracking-[-0.01em] text-zinc-600 dark:text-zinc-300">
            {app.description || app.category || app.domain || "Captured product experience"}
          </p>
          <p className="mt-1 text-[10.5px] font-[850] text-zinc-500 dark:text-zinc-400">
            {app.flows.length} {app.flows.length === 1 ? "flow" : "flows"} · {screenCount} screens
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="absolute right-5 top-1/2 flex h-10 -translate-y-1/2 items-center gap-1.5 border border-white/70 bg-white/56 px-3 text-[11px] font-[850] text-zinc-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:bg-white/86 hover:text-zinc-950 dark:border-white/10 dark:bg-black/28 dark:text-zinc-300 dark:hover:bg-black/38 dark:hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Apps
        </button>
      </div>
    </div>
  );
}

function AppBlurBackdrop({ app, soft = false }: { app: WorkspaceApp; soft?: boolean }) {
  if (!app.logoUrl) {
    return <div className="absolute inset-0" style={{ background: appLogoGradient(app) }} />;
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={app.logoUrl}
        alt=""
        className="absolute pointer-events-none"
        style={{
          top: "-40%",
          left: "-24%",
          width: "124%",
          height: "164%",
          objectFit: "cover",
          transform: "scale(1.2) rotate(-10deg)",
          filter: `blur(${soft ? 15 : 16}px) saturate(1.08)`,
          opacity: soft ? 0.72 : 0.8,
        }}
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={app.logoUrl}
        alt=""
        className="absolute pointer-events-none"
        style={{
          right: "-24%",
          bottom: "-40%",
          width: "124%",
          height: "164%",
          objectFit: "cover",
          transform: "scale(1.2) rotate(10deg)",
          filter: `blur(${soft ? 15 : 16}px) saturate(1.08)`,
          opacity: soft ? 0.72 : 0.8,
        }}
        draggable={false}
      />
    </div>
  );
}

function appLogoGradient(app: WorkspaceApp) {
  const palettes = [
    ["#FF4D2E", "#FF7B48", "#8A3F2E"],
    ["#6B5CFF", "#9B7CFF", "#35266F"],
    ["#38BDF8", "#7DD3FC", "#155E75"],
    ["#22C55E", "#86EFAC", "#14532D"],
    ["#F59E0B", "#FDE68A", "#92400E"],
    ["#EC4899", "#FDA4AF", "#831843"],
  ];
  const seed = app.name.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  const [start, middle, end] = palettes[seed % palettes.length];
  return `radial-gradient(circle at 30% 18%, rgba(255,255,255,0.92), transparent 23%), linear-gradient(145deg, ${start}, ${middle} 54%, ${end})`;
}

function AppLogo({ app, size = "sm" }: { app: WorkspaceApp; size?: "sm" | "card" | "md" | "lg" | "xl" }) {
  const dimensions = {
    sm: "h-10 w-10 text-[12px]",
    card: "h-[52px] w-[52px] text-[16px]",
    md: "h-[58px] w-[58px] text-[17px]",
    lg: "h-[68px] w-[68px] text-[20px]",
    xl: "h-[88px] w-[88px] text-[32px]",
  }[size];

  return (
    <div className={cn("relative shrink-0", dimensions)} style={{ borderRadius: "22.5%" }}>
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden font-bold text-white"
        style={{
          borderRadius: "22.5%",
          background: app.logoUrl ? "#ffffff" : appLogoGradient(app),
          boxShadow: "0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)",
        }}
      >
        {app.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.logoUrl}
            alt={app.name}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ borderRadius: "22.5%" }}
            draggable={false}
          />
        ) : (
          app.name.charAt(0).toUpperCase()
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: "22.5%",
            background: `
              radial-gradient(
                ellipse 100% 100% at 50% 50%,
                rgba(255,255,255,0.00) 52%,
                rgba(255,255,255,0.08) 72%,
                rgba(255,255,255,0.04) 88%,
                rgba(255,255,255,0.01) 100%
              )
            `,
            zIndex: 10,
          }}
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: "22.5%",
            background: `
              radial-gradient(
                ellipse 120% 120% at 10% 10%,
                rgba(255,255,255,0.04) 0%,
                rgba(255,255,255,0.02) 30%,
                rgba(255,255,255,0.00) 55%
              )
            `,
            zIndex: 10,
          }}
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: "22.5%",
            boxShadow: `
              inset 0 0 0 1.15px rgba(244,245,248,0.4),
              inset 0 0 0 1.60px rgba(244,245,248,0.38),
              inset 0 0 0 2.28px rgba(244,245,248,0.074),
              inset 0 0 0 2.98px rgba(244,245,248,0.021)
            `,
            WebkitMaskImage: `
              radial-gradient(circle at 14% 14%,
                rgba(0,0,0,0.70) 8%,
                rgba(0,0,0,0.62) 16%,
                rgba(0,0,0,0.59) 36%,
                rgba(0,0,0,0.30) 42%,
                rgba(0,0,0,0.15) 50%,
                rgba(0,0,0,0.05) 55%,
                rgba(0,0,0,0.00) 61%
              ),
              radial-gradient(circle at 86% 86%,
                rgba(0,0,0,0.42) 21%,
                rgba(0,0,0,0.35) 29%,
                rgba(0,0,0,0.31) 45%,
                rgba(0,0,0,0.21) 55%,
                rgba(0,0,0,0.13) 61%,
                rgba(0,0,0,0.02) 75%
              )
            `,
            filter: "blur(0.0px)",
            zIndex: 11,
          }}
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: "22.5%",
            boxShadow: `
              inset 0 0 1.2px rgba(244,245,248,0.060),
              inset 0 0 2.2px rgba(244,245,248,0.024)
            `,
            WebkitMaskImage: `
              radial-gradient(circle at 14% 14%,
                rgba(0,0,0,0.72) 0%,
                rgba(0,0,0,0.42) 28%,
                rgba(0,0,0,0.14) 42%,
                rgba(0,0,0,0.03) 52%,
                rgba(0,0,0,0.00) 58%
              ),
              radial-gradient(circle at 86% 86%,
                rgba(0,0,0,0.72) 0%,
                rgba(0,0,0,0.42) 28%,
                rgba(0,0,0,0.14) 42%,
                rgba(0,0,0,0.03) 52%,
                rgba(0,0,0,0.00) 58%
              )
            `,
            filter: "blur(0.68px)",
            zIndex: 12,
          }}
        />
      </div>
    </div>
  );
}

function bucketWorkspaceFlows(flows: WorkspaceAppFlow[]) {
  const onboardingTerms = [
    "onboard",
    "activation",
    "activate",
    "first login",
    "login",
    "sign up",
    "signup",
    "registration",
    "register",
    "account setup",
    "setup",
    "verification",
    "verify",
    "welcome",
    "auth",
  ];

  const onboarding: WorkspaceAppFlow[] = [];
  const browsing: WorkspaceAppFlow[] = [];

  flows.forEach((flow) => {
    const haystack = `${flow.name} ${flow.description ?? ""}`.toLowerCase();
    if (onboardingTerms.some((term) => haystack.includes(term))) {
      onboarding.push(flow);
    } else {
      browsing.push(flow);
    }
  });

  return { onboarding, browsing };
}

function FlowModeTabs({
  activeMode,
  onboardingCount,
  browsingCount,
  onChange,
}: {
  activeMode: "onboarding" | "browsing";
  onboardingCount: number;
  browsingCount: number;
  onChange: (mode: "onboarding" | "browsing") => void;
}) {
  const tabs: Array<{ id: "onboarding" | "browsing"; label: string; count: number }> = [
    { id: "onboarding", label: "Onboarding", count: onboardingCount },
    { id: "browsing", label: "Browsing", count: browsingCount },
  ];

  return (
    <div className="mt-3 flex shrink-0 items-end gap-5 border-b border-black/5 dark:border-white/10">
      {tabs.map((tab) => {
        const active = activeMode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative pb-2 text-[12px] font-[850] tracking-[-0.02em] transition",
              active ? "text-zinc-950 dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            )}
          >
            {tab.label}
            <span className="ml-1 text-[10px] font-[750] text-zinc-400 dark:text-zinc-500">{tab.count}</span>
            <span className={cn("absolute bottom-[-1px] left-0 h-[2px] w-full bg-[#6B5CFF] transition-opacity", active ? "opacity-100" : "opacity-0")} />
          </button>
        );
      })}
    </div>
  );
}

function isWorkspaceScreenWeb(screen: WorkspaceAppScreen) {
  const haystack = `${screen.imageUrl ?? ""} ${screen.sourceUrl ?? ""} ${screen.name}`.toLowerCase();
  return haystack.includes("/web/") || haystack.includes("desktop") || haystack.includes("browser") || haystack.includes("web");
}

function FlowGalleryCard({
  flow,
  onInsertFlow,
  onScreenPointerDown,
}: {
  flow: WorkspaceAppFlow;
  onInsertFlow: () => void;
  onScreenPointerDown: (screen: WorkspaceAppScreen, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const screens = flow.screens.filter((screen) => screen.imageUrl);
  const previewScreens = screens.slice(0, 24);

  const scrollBy = (amount: number) => {
    stripRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <section className="overflow-hidden border border-white/64 bg-white/52 shadow-[0_10px_28px_rgba(15,23,42,0.055)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-[900] leading-4 tracking-[-0.035em] text-zinc-950 dark:text-white">{flow.name}</p>
          <p className="mt-0.5 text-[10px] font-[700] text-zinc-500 dark:text-zinc-400">
            {flow.screens.length} {flow.screens.length === 1 ? "screen" : "screens"}
          </p>
        </div>

        <button
          type="button"
          onClick={onInsertFlow}
          className="shrink-0 border border-[#6B5CFF]/18 bg-[#6B5CFF]/10 px-2.5 py-1.5 text-[10px] font-[850] text-[#5B4BFF] transition hover:bg-[#6B5CFF]/15 dark:border-[#BDB6FF]/20 dark:bg-[#6B5CFF]/20 dark:text-[#D8D3FF]"
        >
          Insert flow
        </button>
      </div>

      <div className="relative border-t border-black/5 bg-white/34 py-2 dark:border-white/10 dark:bg-white/5">
        <button
          type="button"
          onClick={() => scrollBy(-280)}
          className="absolute left-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center border border-white/75 bg-white/88 text-zinc-500 shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:bg-white hover:text-zinc-900 dark:border-white/10 dark:bg-black/60 dark:text-zinc-300"
          aria-label="Previous screenshots"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          ref={stripRef}
          className="flex snap-x gap-1.5 overflow-x-auto px-3 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {previewScreens.map((screen, index) => (
            <ScreenPreviewTile
              key={`${screen.id}-${index}`}
              screen={screen}
              onPointerDown={(event) => onScreenPointerDown(screen, event)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollBy(280)}
          className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center border border-white/75 bg-white/88 text-zinc-500 shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:bg-white hover:text-zinc-900 dark:border-white/10 dark:bg-black/60 dark:text-zinc-300"
          aria-label="Next screenshots"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function ScreenPreviewTile({
  screen,
  onPointerDown,
}: {
  screen: WorkspaceAppScreen;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const isWeb = isWorkspaceScreenWeb(screen);

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className="group/screen relative shrink-0 snap-start cursor-grab text-left active:cursor-grabbing"
      title={`Drag or click to insert ${screen.name}`}
    >
      <div
        className={cn(
          "relative overflow-hidden border border-[#818A98]/45 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.14)] transition duration-200 group-hover/screen:-translate-y-0.5 group-hover/screen:shadow-[0_12px_28px_rgba(15,23,42,0.18)]",
          isWeb ? "h-[154px] w-[246px] rounded-[10px]" : "h-[304px] w-[142px] rounded-[10px]"
        )}
        style={{ borderWidth: 0.3 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screen.imageUrl}
          alt={screen.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/12 to-transparent" />
        <span className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center border border-white/70 bg-white/90 text-zinc-700 opacity-0 shadow-sm backdrop-blur-md transition group-hover/screen:opacity-100 dark:border-white/10 dark:bg-black/60 dark:text-white">
          <Plus className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}

function getWorkspaceScreenCanvasSize(screen: WorkspaceAppScreen) {
  const isWeb = isWorkspaceScreenWeb(screen);
  return isWeb ? { w: 420, h: 262 } : { w: 260, h: 563 };
}

function getWorkspaceFlowScreenCanvasSize(screen: WorkspaceAppScreen) {
  const isWeb = isWorkspaceScreenWeb(screen);
  return isWeb ? { w: 420, h: 262 } : { w: 214, h: 464 };
}

function getWorkspaceFlowStoryboardScreenCanvasSize(screen: WorkspaceAppScreen) {
  const isWeb = isWorkspaceScreenWeb(screen);
  return isWeb ? { w: 380, h: 238 } : { w: 210, h: 455 };
}

function GhostChatCanvasAssetView({
  asset,
  point,
}: {
  asset: ChatCanvasAsset;
  point: { x: number; y: number };
}) {
  if (asset.kind === "screen") {
    return <GhostWorkspaceScreenView screen={asset.screen} point={point} />;
  }

  if (asset.kind === "image") {
    return (
      <div
        className="pointer-events-none absolute opacity-55"
        style={{ left: point.x - 210, top: point.y - 158, width: 420, height: 316 }}
      >
        <img
          src={asset.imageUrl}
          alt=""
          className="h-full w-full border border-[#008CFF] bg-white object-contain shadow-[0_18px_44px_rgba(0,140,255,0.20)]"
          draggable={false}
        />
      </div>
    );
  }

  if (asset.kind === "app") {
    return (
      <div
        className="pointer-events-none absolute flex items-center justify-center opacity-60"
        style={{ left: point.x - 90, top: point.y - 90, width: 180, height: 180 }}
      >
        {asset.app.logoUrl ? (
          <img
            src={asset.app.logoUrl}
            alt=""
            className="max-h-full max-w-full object-contain drop-shadow-[0_18px_28px_rgba(15,23,42,0.24)]"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-[68px] font-[900] text-white">
            {asset.app.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute flex items-center gap-5 border border-[#008CFF] bg-white/72 px-6 py-5 opacity-65 shadow-[0_18px_44px_rgba(0,140,255,0.18)] backdrop-blur-xl dark:bg-zinc-950/72"
      style={{ left: point.x - 300, top: point.y - 90, width: 600, height: 180 }}
    >
      {asset.app.logoUrl ? (
        <img
          src={asset.app.logoUrl}
          alt=""
          className="h-[112px] w-[112px] shrink-0 object-contain"
          draggable={false}
        />
      ) : (
        <div className="flex h-[112px] w-[112px] shrink-0 items-center justify-center bg-zinc-900 text-[44px] font-[900] text-white">
          {asset.app.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-[26px] font-[900] text-zinc-950 dark:text-white">
          {asset.app.name}
        </p>
        <p className="mt-2 truncate text-[20px] font-[800] text-zinc-700 dark:text-zinc-200">
          {asset.flow.name}
        </p>
      </div>
    </div>
  );
}

function ChatCanvasAssetDragPreview({
  asset,
  clientX,
  clientY,
}: {
  asset: ChatCanvasAsset;
  clientX: number;
  clientY: number;
}) {
  return (
    <div
      data-canvas-ui="true"
      className="pointer-events-none fixed z-[999] -translate-x-1/2 -translate-y-1/2 opacity-92"
      style={{ left: clientX, top: clientY }}
    >
      {asset.kind === "screen" ? (
        <div
          className={cn(
            "overflow-hidden border border-white/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.22)]",
            isWorkspaceScreenWeb(asset.screen) ? "h-[104px] w-[164px]" : "h-[168px] w-[78px]"
          )}
        >
          <img
            src={asset.screen.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      ) : asset.kind === "image" ? (
        <div className="h-[132px] w-[176px] overflow-hidden border border-white/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.22)]">
          <img
            src={asset.imageUrl}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>
      ) : asset.kind === "app" ? (
        <div className="flex h-[100px] w-[100px] items-center justify-center bg-white/88 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:bg-zinc-900/88">
          {asset.app.logoUrl ? (
            <img
              src={asset.app.logoUrl}
              alt=""
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : (
            <span className="text-[40px] font-[900] text-zinc-950 dark:text-white">
              {asset.app.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
      ) : (
        <div className="flex w-[300px] items-center gap-3 bg-white/90 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:bg-zinc-900/90">
          {asset.app.logoUrl && (
            <img
              src={asset.app.logoUrl}
              alt=""
              className="h-12 w-12 shrink-0 object-contain"
              draggable={false}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-[12px] font-[900] text-zinc-950 dark:text-white">
              {asset.app.name}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-[700] text-zinc-600 dark:text-zinc-300">
              {asset.flow.name}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GhostWorkspaceScreenView({
  screen,
  point,
}: {
  screen: WorkspaceAppScreen;
  point: { x: number; y: number };
}) {
  const size = getWorkspaceScreenCanvasSize(screen);

  return (
    <div
      className="pointer-events-none absolute opacity-55"
      style={{
        left: point.x - size.w / 2,
        top: point.y - size.h / 2,
        width: size.w,
        height: size.h,
      }}
    >
      <div className="h-full w-full overflow-hidden border border-[#008CFF] bg-white shadow-[0_18px_44px_rgba(0,140,255,0.20)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={screen.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>
    </div>
  );
}

function WorkspaceScreenDragPreview({
  screen,
  clientX,
  clientY,
}: {
  screen: WorkspaceAppScreen;
  clientX: number;
  clientY: number;
}) {
  const isWeb = isWorkspaceScreenWeb(screen);

  return (
    <div
      data-canvas-ui="true"
      className="pointer-events-none fixed z-[999] -translate-x-1/2 -translate-y-1/2 opacity-90"
      style={{ left: clientX, top: clientY }}
    >
      <div
        className={cn(
          "overflow-hidden border border-white/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl",
          isWeb ? "h-[104px] w-[164px]" : "h-[168px] w-[78px]"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={screen.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>
    </div>
  );
}

function CollapsedWorkspaceLauncher({
  activeTab,
  onOpen,
}: {
  activeTab: WorkspaceTab;
  onOpen: () => void;
}) {
  return (
    <button
      data-canvas-ui="true"
      type="button"
      onClick={onOpen}
      className="absolute left-[104px] bottom-[112px] z-[70] flex h-12 items-center gap-3 rounded-[18px] border border-white/75 bg-white/74 px-4 text-[13px] font-[800] text-zinc-800 shadow-xl shadow-black/10 backdrop-blur-2xl transition hover:bg-white/92 dark:border-white/10 dark:bg-black/62 dark:text-zinc-100 dark:hover:bg-black/75"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6B5CFF]/12 text-[#6B5CFF] dark:bg-[#6B5CFF]/25 dark:text-[#BDB6FF]">
        {activeTab === "shapes" ? <LayoutGrid className="h-4 w-4" /> : activeTab === "apps" ? <BookOpen className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
      </span>
      {activeTab === "shapes" ? "Shapes" : activeTab === "apps" ? "Apps" : "Conversation"}
    </button>
  );
}

function CanvasBoxObjectViewImpl({
  object,
  selected,
  selectedCount,
  viewportZoom,
  editingText,
  editingCaretClientPoint,
  editingCell,
  isDarkMode,
  onSelect,
  onContextMenu,
  onMoveStart,
  onArtifactRequestSelect,
  onArtifactDragStart,
  onArtifactRuntimeReview,
  onArtifactContentSize,
  onArtifactProjectCommit,
  onArtifactProposalSettled,
  onArtifactWheel,
  onResizeStart,
  onFreeformPointStart,
  onRotateStart,
  onTextChange,
  onDoubleClick,
  onConnectorStart,
  onCellDoubleClick,
  onCellChange,
}: {
  object: CanvasBoxObject;
  selected: boolean;
  selectedCount: number;
  viewportZoom: number;
  editingText: boolean;
  editingCaretClientPoint: { x: number; y: number } | null;
  editingCell: EditingCell | null;
  isDarkMode: boolean;
  onSelect: () => void;
  onContextMenu: (event: ReactMouseEvent<Element>) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onArtifactRequestSelect: () => void;
  onArtifactDragStart: (clientX: number, clientY: number) => void;
  onArtifactRuntimeReview: (review: CanvasCodeArtifactRuntimeReview) => void;
  onArtifactContentSize: (size: CanvasCodeArtifactContentSize) => void;
  onArtifactProjectCommit: (
    commit: NorthstarArtboardCommit,
    surfaceSessionId: string,
  ) => NorthstarProjectionReceipt;
  onArtifactProposalSettled: (
    ackToken: string,
    status: "rejected" | "sync-required" | "blocked" | "recovered",
  ) => void;
  onArtifactWheel: (input: {
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    metaKey: boolean;
  }) => void;
  onResizeStart: (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => void;
  onFreeformPointStart: (pointIndex: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onRotateStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onTextChange: (text: string, textHtml?: string) => void;
  onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onConnectorStart: (side: ConnectorSide, event: ReactPointerEvent<HTMLDivElement>) => void;
  onCellDoubleClick: (row: number, col: number) => void;
  onCellChange: (row: number, col: number, value: string) => void;
}) {
  const canEditText =
    isTextEditableBox(object.type) &&
    object.semantic?.componentType !== "icon-glyph" &&
    object.semantic?.componentType !== "icon-chip";
  const editorRef = useRef<HTMLDivElement>(null);
  const centerShapeText = isPrimitiveShape(object.type);
  const isIconChipLabel = object.semantic?.componentType === "icon-chip-label";
  const isCenteredSemanticLabel =
    object.semantic?.role === "visual-stage-badge" ||
    object.semantic?.componentType === "structure-centered-label" ||
    object.semantic?.componentType === "structure-header-tag";
  const resolvedTextColor = resolveThemeTextColor(object.style.textColor, isDarkMode);
  const resolvedRichTextHtml = resolveThemeRichTextHtml(object, isDarkMode);
  const pastedText = isPastedTextObject(object);
  const structuredTextWrap =
    object.type === "text" &&
    [
      "artifact-subtitle",
      "artifact-insight",
      "artifact-summary",
      "working-note",
      "visual-body",
      "visual-callout",
      "visual-evidence-note",
      "visual-hypothesis",
      "visual-decision",
      "visual-recommendation",
      "visual-next-step",
      "visual-insight",
      "visual-source-caption",
      "visual-caption",
      "visual-chart-label",
      "visual-table-cell",
    ].includes(object.semantic?.role ?? "");

  useEffect(() => {
    if (!editingText || !editorRef.current) return;

    const editor = editorRef.current;
    editor.innerHTML = getRichTextHtml(object);
    editor.focus({ preventScroll: true });

    window.requestAnimationFrame(() => {
      if (!editorRef.current) return;

      if (editingCaretClientPoint) {
        placeCaretAtClientPoint(editorRef.current, editingCaretClientPoint.x, editingCaretClientPoint.y);
      } else {
        placeCaretAtEnd(editorRef.current);
      }
    });
  }, [editingText, editingCaretClientPoint, object.id]);

  const handleEditorInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = sanitizeRichTextHtml(editor.innerHTML);
    onTextChange(plainTextFromHtml(nextHtml), nextHtml);
  };

  return (
    <div
      data-canvas-object="true"
      className={cn("absolute", selected && "z-20", object.type === "text" ? "cursor-text" : "cursor-move")}
      style={{
        left: object.type === "code-artifact" ? 0 : object.x,
        top: object.type === "code-artifact" ? 0 : object.y,
        width: object.w,
        height: object.h,
        transform:
          object.type === "code-artifact"
            ? `translate3d(${object.x}px, ${object.y}px, 0) rotate(${object.rotation ?? 0}deg)`
            : `rotate(${object.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        willChange: object.type === "code-artifact" ? "transform" : undefined,
        contain: object.type === "code-artifact" ? "layout paint style" : undefined,
        isolation: object.type === "code-artifact" ? "isolate" : undefined,
      }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('[data-freeform-point-handle="true"]')) return;
        onMoveStart(event);
      }}
      onContextMenu={onContextMenu}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick(event);
      }}
    >
      <BoxVisual object={object}>
        {object.type === "visual-board" && object.visualBoard && (
          <NorthStarVisualBoard document={object.visualBoard} width={object.w} height={object.h} />
        )}

        {object.type === "code-artifact" && (
          <CodeArtifactHost
            artifact={object.codeArtifact}
            selected={selected}
            width={object.w}
            height={object.h}
            viewportZoom={viewportZoom}
            onRequestSelect={onArtifactRequestSelect}
            onCanvasDragStart={onArtifactDragStart}
            onRuntimeReview={onArtifactRuntimeReview}
            onContentSize={onArtifactContentSize}
            onProjectCommit={onArtifactProjectCommit}
            onProposalSettled={onArtifactProposalSettled}
            onCanvasWheel={onArtifactWheel}
          />
        )}

        {object.type === "image" && (
          object.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={object.imageUrl}
              alt={object.text || "Canvas image"}
              className={cn(
                "h-full w-full",
                isNorthStarScreenshotObject(object) ? "object-contain" : "object-cover"
              )}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-zinc-400">
              <ImageIcon className="h-8 w-8" />
              <span className="text-[13px] font-[700]">Drop image</span>
            </div>
          )
        )}

        {object.type === "flow-header" && <FlowHeaderCanvasObject object={object} />}

        {object.type === "frame" && !editingText && (
          <div className="px-4 py-3 text-[13px] font-[600] text-zinc-400">{object.text}</div>
        )}

        {object.type === "table" && (
          <TableObject object={object} editingCell={editingCell} onCellDoubleClick={onCellDoubleClick} onCellChange={onCellChange} />
        )}

        {canEditText &&
          (editingText ? (
            <div
              ref={editorRef}
              data-rich-text-editor-id={object.id}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onPaste={(event) => {
                event.preventDefault();
                const text = event.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
                window.requestAnimationFrame(handleEditorInput);
              }}
              className={cn(
                "h-full w-full cursor-text select-text overflow-hidden bg-transparent outline-none",
                object.type === "text"
                  ? isCenteredSemanticLabel
                    ? "flex items-center justify-center whitespace-nowrap p-0 tracking-[-0.015em] leading-none"
                    : pastedText || structuredTextWrap
                    ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-0 tracking-[-0.018em] leading-[1.16]"
                    : "whitespace-pre p-0 tracking-[-0.06em] leading-[0.98]"
                  : centerShapeText
                    ? "flex items-center justify-center whitespace-pre-wrap px-6 py-5 leading-[1.25]"
                    : "whitespace-pre-wrap p-5 leading-[22px]"
              )}
              style={{
                color: resolvedTextColor,
                fontSize: object.style.fontSize,
                fontWeight: object.style.fontWeight,
                textAlign: centerShapeText ? "center" : object.style.textAlign,
                lineHeight: object.type === "text"
                  ? isCenteredSemanticLabel || isIconChipLabel
                    ? "1"
                    : pastedText || structuredTextWrap
                      ? "1.16"
                      : "0.98"
                  : undefined,
                caretColor: resolvedTextColor,
                WebkitUserSelect: "text",
                userSelect: "text",
                minHeight: object.type === "text" ? undefined : "100%",
              }}
            />
          ) : (
            <div
              className={cn(
                "h-full w-full overflow-hidden",
                object.type === "text"
                  ? isCenteredSemanticLabel
                    ? "flex items-center justify-center whitespace-nowrap p-0 tracking-[-0.015em] leading-none"
                    : isIconChipLabel
                      ? "flex items-center whitespace-pre-wrap p-0 tracking-[-0.025em] leading-none"
                    : pastedText || structuredTextWrap
                      ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-0 tracking-[-0.018em] leading-[1.16]"
                      : "whitespace-pre p-0 tracking-[-0.06em] leading-[0.98]"
                  : centerShapeText
                    ? "flex items-center justify-center whitespace-pre-wrap px-6 py-5 leading-[1.25]"
                    : "whitespace-pre-wrap p-5 leading-[22px]"
              )}
              style={{
                color: resolvedTextColor,
                fontSize: object.style.fontSize,
                fontWeight: object.style.fontWeight,
                textAlign: centerShapeText ? "center" : object.style.textAlign,
                lineHeight: object.type === "text" ? (isCenteredSemanticLabel || isIconChipLabel ? "1" : pastedText || structuredTextWrap ? "1.16" : "0.98") : undefined,
              }}
              dangerouslySetInnerHTML={{ __html: resolvedRichTextHtml }}
            />
          ))}
      </BoxVisual>

      {selected && selectedCount === 1 && (
        <>
          <SelectionBounds selectedCount={selectedCount} onResizeStart={onResizeStart} onRotateStart={onRotateStart} />
          {object.type === "freeform" && (
            <FreeformReshapeHandles points={object.freeformPoints} onPointStart={onFreeformPointStart} />
          )}
          <ConnectionDots onConnectorStart={onConnectorStart} />
        </>
      )}
    </div>
  );
}

const CanvasBoxObjectView = memo(
  CanvasBoxObjectViewImpl,
  (previous, next) =>
    previous.object === next.object &&
    previous.selected === next.selected &&
    previous.selectedCount === next.selectedCount &&
    previous.viewportZoom === next.viewportZoom &&
    previous.editingText === next.editingText &&
    previous.isDarkMode === next.isDarkMode &&
    previous.editingCaretClientPoint?.x === next.editingCaretClientPoint?.x &&
    previous.editingCaretClientPoint?.y === next.editingCaretClientPoint?.y &&
    previous.editingCell?.objectId === next.editingCell?.objectId &&
    previous.editingCell?.row === next.editingCell?.row &&
    previous.editingCell?.col === next.editingCell?.col,
);

function NorthStarVisualCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[20px] border border-[#E8E7F1] bg-white shadow-[0_12px_36px_rgba(35,30,78,0.055)]", className)}>
      {children}
    </section>
  );
}

function NorthStarVisualBoard({
  document,
  width,
  height,
}: {
  document: NorthStarVisualBoardDocument;
  width: number;
  height: number;
}) {
  const baseWidth = 1600;
  const baseHeight = 1080;
  const scale = Math.min(width / baseWidth, height / baseHeight);
  const stageMeta: Record<NorthStarVisualStage, { label: string; color: string; tint: string }> = {
    awareness: { label: "Awareness", color: "#8B5CF6", tint: "#F3EEFF" },
    consideration: { label: "Consideration", color: "#4F7CFF", tint: "#EEF4FF" },
    action: { label: "Action", color: "#20A45B", tint: "#ECF9F1" },
    verification: { label: "Verification", color: "#FF6B2C", tint: "#FFF1E9" },
  };
  const accent = (value: string) => value === "orange" ? "#FF6B2C" : "#6B5CFF";
  const accentSoft = (value: string) => value === "orange" ? "#FFF0E8" : "#F1EEFF";

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent">
      <div
        className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-[30px] border border-[#E2E1EC] bg-[#F7F7FC] text-[#171820] shadow-[0_42px_110px_rgba(38,31,92,0.18)]"
        style={{ width: baseWidth, height: baseHeight, transform: `scale(${scale})` }}
      >
        <div className="grid h-full grid-cols-[1fr_340px] gap-5 p-5">
          <main className="flex min-w-0 flex-col gap-4 overflow-hidden">
            <NorthStarVisualCard className="shrink-0 overflow-hidden p-4">
              <div className="mb-3 flex items-start justify-between gap-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#EEEAFE] text-[#6758F5]"><BookOpen className="h-[19px] w-[19px]" /></div>
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-[900] leading-none tracking-[-0.025em]">REFERENCE FLOWS</h2>
                    <p className="mt-1.5 text-[10px] font-[650] text-[#747986]">Grounded journeys studied in their original sequence</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-1">
                  {(Object.keys(stageMeta) as NorthStarVisualStage[]).map((stage) => (
                    <span key={stage} className="flex items-center gap-1.5 text-[9px] font-[750] text-[#545966]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: stageMeta[stage].color }} />
                      {stageMeta[stage].label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {document.flows.map((flow) => (
                  <div key={flow.id} className="grid grid-cols-[172px_1fr] gap-4 rounded-[16px] border border-[#EAE9F2] bg-[#FCFCFE] p-3.5">
                    <div className="flex min-w-0 flex-col justify-center border-r border-[#E8E7F0] pr-4">
                      <div className="mb-2.5 flex items-center gap-3">
                        <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-black/5 bg-white shadow-[0_10px_24px_rgba(25,23,57,0.14)]">
                          {flow.appIconUrl ? <img src={flow.appIconUrl} alt={flow.appName} className="h-full w-full object-cover" draggable={false} /> : <span className="text-[22px] font-[900]">{flow.appName.charAt(0)}</span>}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-[20px] font-[900] tracking-[-0.035em]">{flow.appName}</h3>
                          <p className="mt-0.5 text-[9px] font-[750] uppercase tracking-[0.1em] text-[#8A8E99]">{flow.platform} · {flow.sessionType}</p>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-[11px] font-[800] leading-[14px] text-[#383C48]">{flow.flowName}</p>
                      <p className="mt-1.5 line-clamp-3 text-[9px] leading-[12px] text-[#6C7180]">{flow.summary}</p>
                      <span className="mt-2.5 w-fit rounded-full border border-[#E4E3EC] bg-white px-2.5 py-1 text-[9px] font-[800] text-[#555A67]">{flow.screens.length} screens</span>
                    </div>

                    <div className="flex min-w-0 items-start justify-between gap-1 overflow-hidden pt-1">
                      {flow.screens.map((screen, index) => (
                        <div key={screen.id} className="flex min-w-0 flex-1 items-start">
                          <div className="min-w-0 flex-1 text-center">
                            <div className="mx-auto mb-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-[900] text-white shadow-sm" style={{ background: stageMeta[screen.stage].color }}>{String(screen.number).padStart(2, "0")}</div>
                            <div className="mx-auto h-[148px] w-[70px] overflow-hidden rounded-[11px] border border-[#DEDEE8] bg-white shadow-[0_7px_18px_rgba(27,24,71,0.12)]">
                              <img src={screen.imageUrl} alt={screen.title} className="h-full w-full object-contain" draggable={false} />
                            </div>
                            <p className="mx-auto mt-1.5 line-clamp-2 h-[25px] max-w-[86px] text-[8px] font-[700] leading-[11px] text-[#474C58]">{screen.title}</p>
                          </div>
                          {index < flow.screens.length - 1 && <ArrowRight className="mt-[82px] h-3.5 w-3.5 shrink-0 text-[#8C909C]" />}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </NorthStarVisualCard>

            <div className="grid min-h-0 flex-1 grid-cols-[0.9fr_1.25fr_1fr] gap-4">
              <NorthStarVisualCard className="flex min-h-0 flex-col p-4">
                <div className="mb-3 flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#EEEAFE] text-[#6557F5]"><Sparkles className="h-4 w-4" /></div><div><h3 className="text-[13px] font-[900] tracking-[-0.015em]">KEY PATTERNS</h3><p className="text-[9px] text-[#7A7F8B]">What the flows reveal</p></div></div>
                <div className="space-y-2.5 overflow-hidden">
                  {document.keyPatterns.map((pattern) => (
                    <div key={pattern.appName} className="rounded-[14px] border p-3" style={{ borderColor: pattern.accent === "orange" ? "#FFD8C3" : "#DED7FF", background: pattern.accent === "orange" ? "#FFF5EE" : "#F5F2FF" }}>
                      <div className="mb-2 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: accent(pattern.accent) }} /><p className="text-[10px] font-[900]" style={{ color: accent(pattern.accent) }}>{pattern.appName}</p></div>
                      <ul className="space-y-1.5">{pattern.points.map((point, index) => <li key={`${pattern.appName}-${index}`} className="flex gap-2 text-[9px] leading-[13px] text-[#4A4F5B]"><span className="font-[900]" style={{ color: accent(pattern.accent) }}>•</span><span>{point}</span></li>)}</ul>
                    </div>
                  ))}
                </div>
              </NorthStarVisualCard>

              <NorthStarVisualCard className="flex min-h-0 flex-col p-4">
                <div className="mb-3 flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F0EDFF] text-[#6557F5]"><Table2 className="h-4 w-4" /></div><div><h3 className="text-[13px] font-[900] tracking-[-0.015em]">COMPARISON MATRIX</h3><p className="text-[9px] text-[#7A7F8B]">Equivalent dimensions across both journeys</p></div></div>
                <div className="min-h-0 flex-1 overflow-hidden rounded-[12px] border border-[#E5E4ED]">
                  <div className="grid grid-cols-[0.78fr_1fr_1fr] bg-[#F5F4FA] text-[8.5px] font-[900] text-[#3F4451]"><div className="p-2.5">Dimension</div>{document.flows.map((flow) => <div key={flow.id} className="border-l border-[#E4E3EC] p-2.5">{flow.appName}</div>)}</div>
                  {document.matrixRows.map((row, rowIndex) => <div key={row.dimension} className={cn("grid grid-cols-[0.78fr_1fr_1fr] text-[8px] leading-[11px]", rowIndex % 2 === 1 && "bg-[#FCFCFE]")}><div className="border-t border-[#EAE9F1] p-2.5 font-[850] text-[#505562]">{row.dimension}</div>{row.values.map((value, index) => <div key={`${row.dimension}-${index}`} className="border-l border-t border-[#EAE9F1] p-2.5 text-[#474C58]">{value}</div>)}</div>)}
                </div>
              </NorthStarVisualCard>

              <NorthStarVisualCard className="flex min-h-0 flex-col p-4">
                <div className="mb-3 flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F8ECFF] text-[#D247E7]"><GitBranch className="h-4 w-4" /></div><div><h3 className="text-[13px] font-[900] tracking-[-0.015em]">JOURNEY EMPHASIS</h3><p className="text-[9px] text-[#7A7F8B]">Observed screen-stage distribution</p></div></div>
                <div className="space-y-3">
                  {document.stageSeries.map((series) => (
                    <div key={series.appName} className="rounded-[13px] border border-[#ECEBF3] bg-[#FCFCFE] p-3">
                      <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-[900]">{series.appName}</p><span className="rounded-full px-2 py-0.5 text-[8px] font-[800]" style={{ background: accentSoft(series.accent), color: accent(series.accent) }}>Observed flow</span></div>
                      <div className="space-y-1.5">{(Object.keys(stageMeta) as NorthStarVisualStage[]).map((stage) => <div key={stage} className="grid grid-cols-[72px_1fr_28px] items-center gap-2"><span className="text-[8px] font-[700] text-[#626775]">{stageMeta[stage].label}</span><div className="h-2.5 overflow-hidden rounded-full bg-[#ECECF3]"><div className="h-full rounded-full" style={{ width: `${Math.max(4, series.values[stage])}%`, background: stageMeta[stage].color }} /></div><span className="text-right text-[8px] font-[850] text-[#505562]">{series.values[stage]}%</span></div>)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto rounded-[12px] border border-[#E7E3F8] bg-[#F8F6FF] p-3"><p className="text-[8px] font-[800] uppercase tracking-[0.08em] text-[#6B5CFF]">Interpretation</p><p className="mt-1 text-[9px] leading-[13px] text-[#4E5360]">The chart reflects the share of inspected screens assigned to each journey stage. It does not imply conversion rate.</p></div>
              </NorthStarVisualCard>
            </div>

            <div className="grid h-[205px] shrink-0 grid-cols-[1.45fr_1fr] gap-4">
              <NorthStarVisualCard className="overflow-hidden p-4">
                <div className="mb-3 flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#EEF4FF] text-[#4F7CFF]"><Eye className="h-4 w-4" /></div><div><h3 className="text-[13px] font-[900]">EVIDENCE NOTES</h3><p className="text-[9px] text-[#7A7F8B]">Specific screens supporting the analysis</p></div></div>
                <div className="grid grid-cols-4 gap-2.5">{document.evidenceNotes.slice(0, 4).map((note) => <div key={note.id} className="grid grid-cols-[42px_1fr] gap-2 rounded-[12px] border border-[#E9E8F0] bg-[#FCFCFE] p-2.5">{note.imageUrl ? <div className="h-[64px] w-[36px] overflow-hidden rounded-[7px] border border-[#E3E2EA] bg-white"><img src={note.imageUrl} alt={note.title} className="h-full w-full object-contain" draggable={false} /></div> : <Info className="h-4 w-4 text-[#6B5CFF]" />}<div className="min-w-0"><p className="truncate text-[8px] font-[900]" style={{ color: note.accent === "orange" ? "#E85B20" : note.accent === "green" ? "#1B9A55" : note.accent === "blue" ? "#3C72E8" : "#6557F5" }}>{note.label}</p><p className="mt-1 line-clamp-2 text-[8px] font-[800] leading-[10px] text-[#393E4A]">{note.title}</p><p className="mt-1 line-clamp-3 text-[7.5px] leading-[10px] text-[#6C7180]">{note.body}</p></div></div>)}</div>
              </NorthStarVisualCard>

              <NorthStarVisualCard className="overflow-hidden p-4">
                <div className="mb-3 flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F6EEFF] text-[#B34DDF]"><GitBranch className="h-4 w-4" /></div><div><h3 className="text-[13px] font-[900]">HYPOTHESES & DECISIONS</h3><p className="text-[9px] text-[#7A7F8B]">What was tested and retained</p></div></div>
                <div className="grid grid-cols-2 gap-2">{document.hypotheses.slice(0, 6).map((item) => <div key={`${item.label}-${item.text}`} className="rounded-[11px] border border-[#E8E7EF] bg-[#FCFCFE] p-2.5"><div className="mb-1 flex items-center gap-1.5"><span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[7px] font-[900]", item.status === "supported" ? "bg-[#E8F8EF] text-[#18864B]" : item.status === "decided" ? "bg-[#EEEAFE] text-[#6557F5]" : "bg-[#FFF3E9] text-[#E8682D]")}>{item.label}</span><span className="text-[7px] font-[800] uppercase tracking-[0.08em] text-[#8A8E99]">{item.status}</span></div><p className="line-clamp-3 text-[8px] leading-[11px] text-[#4A4F5B]">{item.text}</p></div>)}</div>
              </NorthStarVisualCard>
            </div>
          </main>

          <aside className="flex min-h-0 flex-col gap-4">
            <NorthStarVisualCard className="relative overflow-hidden p-5">
              <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] bg-gradient-to-bl from-[#ECE7FF] to-transparent opacity-80" />
              <div className="relative">
                <div className="mb-4 flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#EEEAFE] text-[#6557F5]"><Sparkles className="h-[18px] w-[18px]" /></div><div><p className="text-[9px] font-[850] uppercase tracking-[0.12em] text-[#6B5CFF]">Executive summary</p><p className="text-[9px] text-[#8A8E99]">Decision-ready synthesis</p></div></div>
                <h1 className="text-[22px] font-[900] leading-[25px] tracking-[-0.035em]">{document.title}</h1>
                <p className="mt-2 text-[10px] leading-[14px] text-[#626775]">{document.subtitle}</p>
                <div className="my-4 h-px bg-[#E8E7EF]" />
                <p className="text-[12px] font-[850] leading-[17px] text-[#262A35]">{document.executive.headline}</p>
              </div>
            </NorthStarVisualCard>

            <div className="grid grid-cols-1 gap-3">
              {document.executive.appSummaries.map((summary) => (
                <NorthStarVisualCard key={summary.appName} className="p-4">
                  <div className="mb-2.5 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-black/5 bg-white shadow-sm">{summary.iconUrl ? <img src={summary.iconUrl} alt={summary.appName} className="h-full w-full object-cover" draggable={false} /> : <span className="font-[900]">{summary.appName.charAt(0)}</span>}</div><p className="truncate text-[15px] font-[900] tracking-[-0.02em]">{summary.appName}</p></div><span className="shrink-0 rounded-full px-2.5 py-1 text-[8px] font-[850]" style={{ background: accentSoft(summary.accent), color: accent(summary.accent) }}>{summary.badge}</span></div>
                  <p className="text-[9px] leading-[13px] text-[#5B606D]">{summary.text}</p>
                </NorthStarVisualCard>
              ))}
            </div>

            <NorthStarVisualCard className="p-4"><div className="mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#6557F5]" /><h3 className="text-[12px] font-[900]">KEY TAKEAWAY</h3></div><p className="text-[10px] font-[800] leading-[15px] text-[#343945]">{document.executive.keyTakeaway}</p></NorthStarVisualCard>
            <NorthStarVisualCard className="p-4"><div className="mb-2 flex items-center gap-2"><Info className="h-4 w-4 text-[#4F7CFF]" /><h3 className="text-[12px] font-[900]">STRATEGIC IMPLICATION</h3></div><p className="text-[9px] leading-[14px] text-[#555B68]">{document.executive.strategicImplication}</p></NorthStarVisualCard>

            <NorthStarVisualCard className="min-h-0 flex-1 p-4">
              <div className="mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4 text-[#6557F5]" /><h3 className="text-[12px] font-[900]">RECOMMENDATIONS</h3></div>
              <div className="space-y-2.5">{document.executive.recommendations.slice(0, 4).map((item, index) => <div key={`${item}-${index}`} className="flex gap-2.5 rounded-[11px] border border-[#E9E8F0] bg-[#FCFCFE] p-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EEEAFE] text-[8px] font-[900] text-[#6557F5]">{index + 1}</span><p className="text-[8.5px] leading-[12px] text-[#4A4F5B]">{item}</p></div>)}</div>
            </NorthStarVisualCard>

            <div className="rounded-[20px] bg-gradient-to-br from-[#6B5CFF] to-[#5242E8] p-4 text-white shadow-[0_18px_36px_rgba(84,67,230,0.25)]">
              <div className="mb-2 flex items-center gap-2"><ArrowUp className="h-4 w-4" /><h3 className="text-[11px] font-[900]">NEXT STEPS</h3></div>
              <div className="space-y-2">{document.executive.nextSteps.slice(0, 3).map((item, index) => <div key={`${item}-${index}`} className="flex items-start gap-2 text-[8.5px] leading-[12px]"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/18 text-[8px] font-[900]">{index + 1}</span><span>{item}</span></div>)}</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function FlowHeaderCanvasObject({ object }: { object: CanvasBoxObject }) {
  const [appName = "App", flowName = "Flow"] = (object.text ?? "").split("\n");
  const logoUrl = object.imageUrl;

  return (
    <div className="relative flex h-full w-full items-center overflow-visible px-1">
      <div className="flex min-w-0 items-center gap-8">
        <div
          className="relative h-[78px] w-[78px] shrink-0 overflow-hidden"
          style={{
            borderRadius: "22.5%",
            boxShadow: "0 18px 36px rgba(15,23,42,0.24), 0 4px 10px rgba(15,23,42,0.18)",
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={appName}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ borderRadius: "22.5%" }}
              draggable={false}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-[30px] font-[900] text-white"
              style={{
                borderRadius: "22.5%",
                background: "linear-gradient(180deg, #374151 0%, #111827 100%)",
              }}
            >
              {appName.charAt(0)}
            </div>
          )}

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: "22.5%",
              background: `
                radial-gradient(ellipse 100% 100% at 50% 50%,
                  rgba(255,255,255,0.00) 52%,
                  rgba(255,255,255,0.08) 72%,
                  rgba(255,255,255,0.04) 88%,
                  rgba(255,255,255,0.01) 100%
                )
              `,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: "22.5%",
              boxShadow: `
                inset 0 0 0 1.15px rgba(244,245,248,0.42),
                inset 0 0 0 1.60px rgba(244,245,248,0.36),
                inset 0 0 0 2.28px rgba(244,245,248,0.09)
              `,
            }}
          />
        </div>

        <div className="min-w-0 overflow-visible">
          <h3 className="whitespace-nowrap text-[30px] font-[900] leading-none tracking-[-0.055em] text-[#111827] dark:text-white">
            {appName}
          </h3>
          <p className="mt-4 whitespace-nowrap text-[24px] font-[850] leading-none tracking-[-0.045em] text-[#111827] dark:text-zinc-100">
            {flowName}
          </p>
        </div>
      </div>
    </div>
  );
}
function BoxVisual({ object, children }: { object: CanvasBoxObject; children: ReactNode }) {
  const commonStyle = {
    background: object.style.fill,
    borderColor: object.style.stroke,
    borderWidth: object.style.strokeWidth,
    borderRadius: object.style.radius,
    boxShadow: object.style.shadow,
    opacity: object.style.opacity,
  };

  if (object.type === "flow-header") {
    return (
      <div className="h-full w-full overflow-visible border-0 bg-transparent shadow-none" style={{ background: "transparent" }}>
        {children}
      </div>
    );
  }

  if (object.type === "diamond") {
    return (
      <div className="relative h-full w-full">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points="50,2 98,50 50,98 2,50"
            fill={object.style.fill}
            stroke={object.style.stroke}
            strokeWidth={object.style.strokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    );
  }

  if (object.type === "triangle") {
    return (
      <div className="relative h-full w-full">
        <svg className="absolute inset-0 h-full w-full overflow-visible drop-shadow-sm" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points="50,3 97,97 3,97"
            fill={object.style.fill}
            stroke={object.style.stroke}
            strokeWidth={object.style.strokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    );
  }

  if (object.type === "callout") {
    return (
      <div className="relative h-full w-full">
        <svg className="absolute inset-0 h-full w-full overflow-visible drop-shadow-sm" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M10 4H90Q96 4 96 10V72Q96 80 88 80H34L23 94L21 80H10Q4 80 4 72V10Q4 4 10 4Z"
            fill={object.style.fill}
            stroke={object.style.stroke}
            strokeWidth={object.style.strokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        <div className="relative z-10 h-full w-full pb-7">{children}</div>
      </div>
    );
  }

  if (object.type === "divider") {
    return <div className="h-full w-full" style={{ background: object.style.fill, borderRadius: 999, opacity: object.style.opacity }} />;
  }

  if (object.type === "pin") {
    return (
      <div className="relative h-full w-full">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 5C26 5 9 23 9 46C9 76 50 132 50 132C50 132 91 76 91 46C91 23 74 5 50 5Z" fill={object.style.fill} stroke={object.style.stroke} strokeWidth={object.style.strokeWidth} vectorEffect="non-scaling-stroke" />
          <circle cx="50" cy="46" r="17" fill="#FFFFFF" opacity="0.92" />
          <circle cx="50" cy="46" r="8" fill={object.style.fill} />
        </svg>
      </div>
    );
  }

  if (object.type === "freeform") {
    return (
      <div className="relative h-full w-full">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path
            d={buildSmoothClosedFreeformPath(object.freeformPoints)}
            fill={object.style.fill}
            stroke={object.style.stroke}
            strokeWidth={object.style.strokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    );
  }

  if (object.type === "highlight-region") {
    return (
      <div
        className="relative h-full w-full border border-dashed"
        style={{ ...commonStyle, borderStyle: "dashed", borderRadius: object.style.radius ?? 18 }}
      >
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-[10px] border border-black/5 bg-white/85 px-2 py-1 text-[10px] font-[800] text-zinc-500 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-black/70 dark:text-zinc-300">
          <span>Highlight</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#6B5CFF]" />
        </div>
      </div>
    );
  }

  if (object.type === "icon" || object.semantic?.componentType === "icon-glyph") {
    return (
      <div
        className="flex h-full w-full items-center justify-center border"
        style={{ ...commonStyle, borderRadius: object.style.radius ?? 14, color: object.style.textColor }}
      >
        <NorthstarGlyph name={object.iconName} className={object.type === "icon" ? "h-[66%] w-[66%]" : "h-[48%] w-[48%]"} />
      </div>
    );
  }

  if (object.type === "icon-chip") {
    return (
      <div className="relative flex h-full w-full items-center border" style={commonStyle}>
        <span className="absolute left-4 flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#F1EEFF] text-[#6B5CFF]">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="h-full w-full pl-12">{children}</div>
      </div>
    );
  }

  if (object.type === "badge") {
    return <div className="h-full w-full border" style={{ ...commonStyle, borderRadius: 999 }}>{children}</div>;
  }

  if (object.type === "visual-board") {
    return (
      <div className="h-full w-full overflow-hidden rounded-[24px] bg-transparent shadow-[0_28px_90px_rgba(36,29,91,0.18)]">
        {children}
      </div>
    );
  }

  if (object.type === "code-artifact") {
    return (
      <div
        className="h-full w-full overflow-hidden bg-white"
        style={{
          ...commonStyle,
          borderStyle: "solid",
          borderRadius: object.style.radius ?? 24,
        }}
      >
        {children}
      </div>
    );
  }

  if (object.type === "image") {
    return (
      <div
        className="h-full w-full overflow-hidden border bg-white"
        style={{
          ...commonStyle,
          borderStyle: "solid",
          borderRadius: object.style.radius ?? 12,
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full w-full border backdrop-blur-xl",
        object.type === "ellipse" && "rounded-full",
        object.type === "circle" && "rounded-full",
        object.type === "pill" && "rounded-full",
        object.style.radius === undefined && object.type !== "ellipse" && object.type !== "circle" && object.type !== "pill" && "rounded-[18px]",
        object.type === "text" && "border-transparent bg-transparent shadow-none",
        object.type === "frame" && object.style.shadow === undefined && "border-dashed shadow-none",
        object.type !== "text" && object.type !== "frame" && object.style.shadow === undefined && "shadow-lg"
      )}
      style={commonStyle}
    >
      {children}
    </div>
  );
}

function FreeformReshapeHandles({
  points,
  onPointStart,
}: {
  points?: FreeformPoint[];
  onPointStart: (pointIndex: number, event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      {cloneFreeformPoints(points).map((point, index) => (
        <div
          key={`freeform-point-${index}`}
          data-canvas-ui="true"
          data-freeform-point-handle="true"
          title={`Drag sculpt point ${index + 1}`}
          className="group/freeform-point pointer-events-auto absolute z-[48] flex h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          onPointerDownCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            onPointStart(index, event);
          }}
        >
          <span className="pointer-events-none h-[15px] w-[15px] rounded-full border-[2.5px] border-white bg-[#6B5CFF] shadow-[0_4px_12px_rgba(70,58,185,0.32)] transition-transform group-hover/freeform-point:scale-125" />
        </div>
      ))}
    </>
  );
}

function SelectionBounds({
  selectedCount,
  onResizeStart,
  onRotateStart,
}: {
  selectedCount: number;
  onResizeStart: (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => void;
  onRotateStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const handles: Array<{ dir: ResizeDirection; className: string; cursor: string }> = [
    { dir: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-nwse-resize" },
    { dir: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-nesw-resize" },
    { dir: "sw", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-nesw-resize" },
    { dir: "se", className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursor: "cursor-nwse-resize" },
    { dir: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ns-resize" },
    { dir: "s", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "cursor-ns-resize" },
    { dir: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
    { dir: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  ];

  const rotateZones = [
    "left-[-30px] top-[-30px]",
    "right-[-30px] top-[-30px]",
    "bottom-[-30px] left-[-30px]",
    "bottom-[-30px] right-[-30px]",
  ];
  const rotateCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'%3E%3Cpath d='M21.2 8.8A8.7 8.7 0 0 0 6.3 12.4' stroke='%230088FF' stroke-width='2.5' stroke-linecap='round'/%3E%3Cpath d='M21.2 8.8H16.3M21.2 8.8V3.9' stroke='%230088FF' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6.8 19.2a8.7 8.7 0 0 0 14.9-3.6' stroke='%230088FF' stroke-width='2.5' stroke-linecap='round'/%3E%3Cpath d='M6.8 19.2h4.9M6.8 19.2v4.9' stroke='%230088FF' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 14 14, grab`;

  return (
    <div className="pointer-events-none absolute inset-0 border-2 border-[#0088FF]">
      {selectedCount === 1 &&
        rotateZones.map((className, index) => (
          <div
            key={`rotate-${index}`}
            title="Rotate"
            className={cn("group/rotate pointer-events-auto absolute h-9 w-9 rounded-full", className)}
            style={{ cursor: rotateCursor }}
            onPointerDown={onRotateStart}
          >
            <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-full bg-white/70 text-[#0088FF] opacity-0 shadow-sm ring-1 ring-[#0088FF]/15 backdrop-blur-md transition-opacity group-hover/rotate:opacity-100 dark:bg-black/60">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18.5 8.4A7.2 7.2 0 0 0 6 11.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M18.5 8.4H14.7M18.5 8.4V4.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 15.6A7.2 7.2 0 0 0 18 12.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M5.5 15.6H9.3M5.5 15.6V19.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        ))}
      {selectedCount === 1 && (
        <>
          <div
            className="pointer-events-auto absolute left-4 right-4 top-[-7px] h-[14px] cursor-ns-resize"
            title="Resize height"
            onPointerDown={(event) => onResizeStart("n", event)}
          />
          <div
            className="pointer-events-auto absolute bottom-[-7px] left-4 right-4 h-[14px] cursor-ns-resize"
            title="Resize height"
            onPointerDown={(event) => onResizeStart("s", event)}
          />
          <div
            className="pointer-events-auto absolute bottom-4 left-[-7px] top-4 w-[14px] cursor-ew-resize"
            title="Resize width"
            onPointerDown={(event) => onResizeStart("w", event)}
          />
          <div
            className="pointer-events-auto absolute bottom-4 right-[-7px] top-4 w-[14px] cursor-ew-resize"
            title="Resize width"
            onPointerDown={(event) => onResizeStart("e", event)}
          />
        </>
      )}
      {selectedCount === 1 &&
        handles.map((handle) => (
          <div
            key={handle.dir}
            className={cn(
              "pointer-events-auto absolute h-[13px] w-[13px] rounded-[4px] border-2 border-[#0088FF] bg-white shadow-sm",
              handle.className,
              handle.cursor
            )}
            onPointerDown={(event) => onResizeStart(handle.dir, event)}
          />
        ))}
    </div>
  );
}

function AIReferenceHighlights({
  objects,
  zoom,
}: {
  objects: CanvasObject[];
  zoom: number;
}) {
  const padding = 8 / Math.max(zoom, 0.01);
  const borderWidth = 2 / Math.max(zoom, 0.01);

  return (
    <>
      {objects.map((object) => {
        const bounds = getObjectBounds(object);
        return (
          <div
            key={`ai-reference-${object.id}`}
            className="pointer-events-none absolute z-[85]"
            style={{
              left: bounds.x - padding,
              top: bounds.y - padding,
              width: Math.max(1, bounds.w + padding * 2),
              height: Math.max(1, bounds.h + padding * 2),
              border: `${borderWidth}px solid rgba(107, 92, 255, 0.95)`,
              boxShadow: `0 0 ${18 / Math.max(zoom, 0.01)}px rgba(107, 92, 255, 0.34)`,
            }}
          />
        );
      })}
    </>
  );
}

function MultiSelectionBounds({ bounds }: { bounds: Rect }) {
  const handles = [
    "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
    "right-0 top-0 translate-x-1/2 -translate-y-1/2",
    "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
    "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
  ];

  return (
    <div
      className="pointer-events-none absolute z-30 border-2 border-[#0088FF]"
      style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
    >
      {handles.map((className, index) => (
        <div
          key={`multi-selection-${index}`}
          className={cn("absolute h-[13px] w-[13px] rounded-[4px] border-2 border-[#0088FF] bg-white shadow-sm", className)}
        />
      ))}
    </div>
  );
}

function ConnectionDots({
  onConnectorStart,
}: {
  onConnectorStart: (side: ConnectorSide, event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const dots: Array<{ side: ConnectorSide; className: string }> = [
    { side: "top", className: "left-1/2 top-[-26px] -translate-x-1/2" },
    { side: "right", className: "right-[-26px] top-1/2 -translate-y-1/2" },
    { side: "bottom", className: "bottom-[-26px] left-1/2 -translate-x-1/2" },
    { side: "left", className: "left-[-26px] top-1/2 -translate-y-1/2" },
  ];

  return (
    <>
      {dots.map((dot) => (
        <div
          key={dot.side}
          className={cn("absolute z-30 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm", dot.className)}
          onPointerDown={(event) => onConnectorStart(dot.side, event)}
        >
          <div className="h-3 w-3 rounded-full bg-[#6B5CFF]" />
        </div>
      ))}
    </>
  );
}

function TableObject({
  object,
  editingCell,
  onCellDoubleClick,
  onCellChange,
}: {
  object: CanvasBoxObject;
  editingCell: EditingCell | null;
  onCellDoubleClick: (row: number, col: number) => void;
  onCellChange: (row: number, col: number, value: string) => void;
}) {
  const rows = object.rows ?? 2;
  const cols = object.cols ?? 3;
  const cells = object.cells ?? [];

  return (
    <div
      className="grid h-full w-full overflow-hidden rounded-[18px]"
      style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((__, col) => {
          const isEditing = editingCell?.objectId === object.id && editingCell.row === row && editingCell.col === col;

          return (
            <div
              key={`${row}-${col}`}
              className="flex items-center border-b border-r border-black/10 px-3 text-[13px] text-zinc-700 dark:border-white/10 dark:text-zinc-200"
              onDoubleClick={(event) => {
                event.stopPropagation();
                onCellDoubleClick(row, col);
              }}
            >
              {isEditing ? (
                <input
                  autoFocus
                  value={cells[row]?.[col] ?? ""}
                  onChange={(event) => onCellChange(row, col, event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="h-full w-full bg-transparent outline-none"
                />
              ) : (
                <span className="truncate">{cells[row]?.[col]}</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function getConnectorPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind: ConnectorKind,
  controlOffset = 0,
  controlPoint?: { x: number; y: number }
) {
  if (kind === "curved") {
    const cx = controlPoint?.x ?? (x1 + x2) / 2;
    const cy = controlPoint?.y ?? (y1 + y2) / 2 + controlOffset;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  }

  if (kind === "elbow") {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} L ${midX} ${y1} Q ${midX} ${y1} ${midX} ${(y1 + y2) / 2} L ${midX} ${y2} L ${x2} ${y2}`;
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function getConnectorControlPoint(connector: CanvasConnectorObject, bounds: Rect) {
  const defaultX = (connector.x1 + connector.x2) / 2;
  const defaultY = (connector.y1 + connector.y2) / 2 + connector.controlOffset;

  return {
    x: (connector.controlX ?? defaultX) - bounds.x,
    y: (connector.controlY ?? defaultY) - bounds.y,
  };
}

function getDashArray(dash: ConnectorDash) {
  if (dash === "dashed") return "12 10";
  if (dash === "dotted") return "2 10";
  return undefined;
}

function ConnectorObjectViewImpl({
  connector,
  selected,
  onSelect,
  onContextMenu,
  onMoveStart,
  onStartHandleMove,
  onEndHandleMove,
  onCurveHandleMove,
}: {
  connector: CanvasConnectorObject;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (event: ReactMouseEvent<Element>) => void;
  onMoveStart: (event: CanvasPointerEvent) => void;
  onStartHandleMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onEndHandleMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCurveHandleMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const bounds = getConnectorBounds(connector);
  const markerId = `arrow-${connector.id}`;
  const x1 = connector.x1 - bounds.x;
  const y1 = connector.y1 - bounds.y;
  const x2 = connector.x2 - bounds.x;
  const y2 = connector.y2 - bounds.y;
  const controlPoint = getConnectorControlPoint(connector, bounds);
  const path = getConnectorPath(x1, y1, x2, y2, connector.style.kind, connector.controlOffset, connector.style.kind === "curved" ? controlPoint : undefined);
  const dashArray = getDashArray(connector.style.dash);

  return (
    <div
      data-canvas-object="true"
      className="absolute pointer-events-none"
      style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
    >
      <svg width={bounds.w} height={bounds.h} className="absolute inset-0 overflow-visible pointer-events-none">
        <defs>
          <marker id={markerId} markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 2 1.6 L 8.5 5 L 2 8.4" fill="none" stroke={connector.style.stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-auto cursor-move"
          pointerEvents="stroke"
          onPointerDown={onMoveStart}
          onContextMenu={onContextMenu}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        />
        <path
          d={path}
          fill="none"
          stroke={connector.style.stroke}
          strokeWidth={connector.style.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashArray}
          markerEnd={connector.style.end === "arrow" ? `url(#${markerId})` : undefined}
          pointerEvents="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {selected && (
        <>
          <div
            className={cn(
              "absolute pointer-events-auto h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow ring-2",
              connector.startBinding ? "bg-[#6B5CFF] ring-[#6B5CFF]/35" : "bg-white ring-[#0088FF]"
            )}
            style={{ left: x1, top: y1 }}
            onPointerDown={onStartHandleMove}
            title={connector.startBinding ? "Connected. Drag away to detach." : "Free end. Drag onto a shape to connect."}
          />
          <div
            className={cn(
              "absolute pointer-events-auto h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow ring-2",
              connector.endBinding ? "bg-[#6B5CFF] ring-[#6B5CFF]/35" : "bg-white ring-[#0088FF]"
            )}
            style={{ left: x2, top: y2 }}
            onPointerDown={onEndHandleMove}
            title={connector.endBinding ? "Connected. Drag away to detach." : "Free end. Drag onto a shape to connect."}
          />
          {connector.style.kind === "curved" && (
            <div
              className="absolute pointer-events-auto h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full bg-[#0088FF] shadow ring-2 ring-white"
              style={{ left: controlPoint.x, top: controlPoint.y }}
              onPointerDown={onCurveHandleMove}
              title="Adjust curve"
            />
          )}
        </>
      )}
    </div>
  );
}

const ConnectorObjectView = memo(
  ConnectorObjectViewImpl,
  (previous, next) => previous.connector === next.connector && previous.selected === next.selected,
);

function DraftConnectorView({ connector }: { connector: DraftConnector }) {
  const bounds = getConnectorBounds(connector);
  const x1 = connector.x1 - bounds.x;
  const y1 = connector.y1 - bounds.y;
  const x2 = connector.x2 - bounds.x;
  const y2 = connector.y2 - bounds.y;
  const path = getConnectorPath(x1, y1, x2, y2, connector.kind, 0);

  return (
    <div className="absolute pointer-events-none" style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}>
      <svg width={bounds.w} height={bounds.h} className="absolute inset-0 overflow-visible pointer-events-none">
        <path d={path} fill="none" stroke="#6B5CFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 6" />
      </svg>
    </div>
  );
}

function PaletteDragPreview({ drag }: { drag: ShapePaletteDrag }) {
  if (drag.kind === "component") {
    const defaults = getComponentPresetGhostDefaults(drag.preset);
    const maxSide = Math.max(defaults.w, defaults.h);
    const scale = Math.min(1, 138 / maxSide);
    const width = Math.max(120, defaults.w * scale);
    const height = Math.max(58, defaults.h * scale);

    return (
      <div
        data-canvas-ui="true"
        className="pointer-events-none fixed z-[90] rounded-[20px] bg-white/35 p-2 shadow-2xl backdrop-blur-xl dark:bg-black/25"
        style={{
          left: drag.clientX,
          top: drag.clientY,
          width: width + 16,
          height: height + 16,
          transform: "translate(-50%, -50%)",
        }}
      >
        <ComponentGhostSilhouette preset={drag.preset} rect={{ x: 8, y: 8, w: width, h: height }} />
      </div>
    );
  }

  const defaults = getBoxDefaults(drag.type);
  const maxSide = Math.max(defaults.w, defaults.h);
  const scale = Math.min(1, 96 / maxSide);
  const width = Math.max(34, defaults.w * scale);
  const height = Math.max(34, defaults.h * scale);

  return (
    <div
      data-canvas-ui="true"
      className="pointer-events-none fixed z-[90] rounded-[18px] bg-white/30 p-2 shadow-2xl backdrop-blur-xl dark:bg-black/20"
      style={{
        left: drag.clientX,
        top: drag.clientY,
        width: width + 16,
        height: height + 16,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="relative h-full w-full">
        <ShapeSilhouette type={drag.type} rect={{ x: 8, y: 8, w: width, h: height }} />
      </div>
    </div>
  );
}

function getComponentPresetGhostDefaults(preset: CanvasComponentPreset): { w: number; h: number } {
  if (preset === "stack") return { w: 360, h: 300 };
  if (preset === "rail") return { w: 280, h: 420 };
  if (preset === "lane") return { w: 620, h: 240 };
  if (preset === "grid-layout" || preset === "cluster") return { w: 520, h: 340 };
  if (preset === "spine") return { w: 520, h: 460 };
  if (preset === "drawer") return { w: 480, h: 460 };
  if (preset === "shelf") return { w: 620, h: 220 };
  if (preset === "compare-frame") return { w: 720, h: 420 };
  if (preset === "workspace-frame") return { w: 760, h: 440 };
  if (preset === "drop-zone") return { w: 300, h: 220 };
  if (preset === "stage-marker" || preset === "source-chip" || preset === "status-pill") return { w: 260, h: 84 };
  if (preset === "confidence-badge") return { w: 320, h: 200 };
  if (preset === "citation-chip") return { w: 280, h: 92 };
  if (preset === "screenshot-tile") return { w: 340, h: 250 };
  if (preset === "metric-tile") return { w: 300, h: 190 };
  if (preset === "quote-block") return { w: 400, h: 210 };
  if (preset === "reference-flow" || preset === "flow-lane") return { w: 620, h: 168 };
  if (preset === "evidence-strip") return { w: 420, h: 150 };
  if (preset === "comparison-matrix" || preset === "matrix" || preset === "source-ledger") return { w: 440, h: 260 };
  if (preset === "stage-map") return { w: 500, h: 150 };
  if (preset === "timeline") return { w: 760, h: 360 };
  if (preset === "tradeoff-panel" || preset === "scorecard" || preset === "chart") return { w: 360, h: 220 };
  if (preset === "research-region" || preset === "section") return { w: 520, h: 260 };
  if (preset === "product-concept") return { w: 520, h: 300 };
  if (preset === "executive-summary" || preset === "recommendation-block" || preset === "decision-card") return { w: 360, h: 200 };
  return { w: 320, h: 190 };
}

function GhostComponentView({ preset, point }: { preset: CanvasComponentPreset; point: { x: number; y: number } }) {
  const defaults = getComponentPresetGhostDefaults(preset);
  const rect = { x: point.x - defaults.w / 2, y: point.y - defaults.h / 2, w: defaults.w, h: defaults.h };

  return <ComponentGhostSilhouette preset={preset} rect={rect} />;
}

function ComponentGhostSilhouette({ preset, rect }: { preset: CanvasComponentPreset; rect: Rect }) {
  const stroke = "#6B5CFF";
  const softFill = "rgba(107, 92, 255, 0.07)";
  const softStroke = "rgba(107, 92, 255, 0.55)";

  return (
    <div
      className="pointer-events-none absolute overflow-hidden rounded-[18px] border-2 border-dashed border-[#6B5CFF]/70 bg-[#6B5CFF]/[0.06] shadow-[0_18px_60px_rgba(107,92,255,0.16)] backdrop-blur-[1px]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div className="absolute left-4 top-3 h-3 w-28 rounded-full bg-[#6B5CFF]/25" />
      <div className="absolute right-4 top-3 h-3 w-16 rounded-full bg-[#6B5CFF]/15" />

      {(preset === "reference-flow" || preset === "flow-lane" || preset === "evidence-strip") ? (
        <div className="absolute inset-x-4 bottom-4 top-9 flex items-center gap-3">
          {Array.from({ length: preset === "evidence-strip" ? 4 : 6 }).map((_, index) => (
            <div key={index} className="flex-1 rounded-[12px] border border-[#6B5CFF]/35 bg-white/60 shadow-sm">
              <div className="mx-auto mt-3 h-[54%] w-[44%] rounded-[8px] border border-[#6B5CFF]/25 bg-white/80" />
              <div className="mx-auto mt-2 h-1.5 w-[58%] rounded-full bg-[#6B5CFF]/20" />
            </div>
          ))}
        </div>
      ) : preset === "comparison-matrix" || preset === "matrix" || preset === "source-ledger" ? (
        <div className="absolute inset-x-5 bottom-5 top-11 overflow-hidden rounded-[12px] border border-[#6B5CFF]/30 bg-white/55">
          <div className="grid h-full grid-cols-3 grid-rows-5">
            {Array.from({ length: 15 }).map((_, index) => (
              <div key={index} className="border-b border-r border-[#6B5CFF]/18" />
            ))}
          </div>
        </div>
      ) : preset === "stage-map" || preset === "timeline" ? (
        <svg className="absolute inset-x-5 bottom-5 top-10 h-[calc(100%-60px)] w-[calc(100%-40px)] overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M30 55H470" stroke={stroke} strokeWidth="2.2" strokeDasharray="8 10" opacity="0.62" />
          {[0, 1, 2, 3, 4].map((index) => (
            <g key={index} transform={`translate(${50 + index * 100} 55)`}>
              <circle r="12" fill={softFill} stroke={softStroke} strokeWidth="2" />
              <rect x="-22" y="25" width="44" height="8" rx="4" fill="rgba(107,92,255,0.2)" />
            </g>
          ))}
        </svg>
      ) : (
        <div className="absolute inset-x-5 bottom-5 top-11 grid grid-cols-[0.8fr_1.2fr] gap-3">
          <div className="rounded-[14px] border border-[#6B5CFF]/26 bg-white/55" />
          <div className="space-y-3 rounded-[14px] border border-[#6B5CFF]/26 bg-white/42 p-4">
            <div className="h-3 w-[74%] rounded-full bg-[#6B5CFF]/22" />
            <div className="h-2 w-full rounded-full bg-[#6B5CFF]/14" />
            <div className="h-2 w-[82%] rounded-full bg-[#6B5CFF]/14" />
            <div className="mt-4 h-8 rounded-[10px] bg-[#6B5CFF]/12" />
          </div>
        </div>
      )}
    </div>
  );
}

function DraftBoxView({ draft }: { draft: DraftBox }) {
  return <ShapeSilhouette type={draft.type} rect={draft} />;
}

function GhostBoxView({ type, point }: { type: BoxTool; point: { x: number; y: number } }) {
  const defaults = getBoxDefaults(type);
  const rect = { x: point.x - defaults.w / 2, y: point.y - defaults.h / 2, w: defaults.w, h: defaults.h };

  return <ShapeSilhouette type={type} rect={rect} />;
}

function ShapeSilhouette({ type, rect }: { type: BoxTool; rect: Rect }) {
  const stroke = "#6B5CFF";
  const fill = "rgba(107, 92, 255, 0.08)";

  if (type === "divider") {
    return <div className="pointer-events-none absolute rounded-full bg-[#6B5CFF]/65" style={{ left: rect.x, top: rect.y, width: rect.w, height: Math.max(4, rect.h) }} />;
  }

  if (type === "pin") {
    return (
      <div className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <svg className="h-full w-full overflow-visible" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 5C26 5 9 23 9 46C9 76 50 132 50 132C50 132 91 76 91 46C91 23 74 5 50 5Z" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />
          <circle cx="50" cy="46" r="15" fill="rgba(255,255,255,.78)" stroke={stroke} strokeWidth="1.5" strokeDasharray="5 4" />
        </svg>
      </div>
    );
  }

  if (type === "freeform") {
    return (
      <div className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={buildSmoothClosedFreeformPath()} fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    );
  }

  if (type === "highlight-region") {
    return <div className="pointer-events-none absolute rounded-[18px] border-2 border-dashed border-[#6B5CFF]/70 bg-[#6B5CFF]/[0.045]" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />;
  }

  if (type === "icon-chip" || type === "badge") {
    return (
      <div
        className="pointer-events-none absolute border-2 border-dashed border-[#6B5CFF]/70 bg-white/65 shadow-sm backdrop-blur-sm"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: type === "badge" ? 999 : 16 }}
      />
    );
  }

  if (type === "diamond") {
    return (
      <div className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="50,2 98,50 50,98 2,50" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (type === "triangle") {
    return (
      <div className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="50,3 97,97 3,97" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (type === "callout") {
    return (
      <div className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M10 4H90Q96 4 96 10V72Q96 80 88 80H34L23 94L21 80H10Q4 80 4 72V10Q4 4 10 4Z" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (type === "table") {
    return (
      <div className="pointer-events-none absolute overflow-hidden rounded-[14px] border-2 border-dashed border-[#6B5CFF]/70 bg-[#6B5CFF]/[0.06]" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <div className="grid h-full w-full grid-cols-3 grid-rows-2">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="border-b border-r border-[#6B5CFF]/25" />)}
        </div>
      </div>
    );
  }

  const radius = type === "ellipse" || type === "circle" || type === "pill" ? 999 : type === "text" ? 10 : 18;

  return (
    <div
      className="pointer-events-none absolute border-2 border-dashed border-[#6B5CFF]/70 bg-[#6B5CFF]/[0.06] backdrop-blur-sm"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: radius }}
    />
  );
}

function MarqueeView({ rect }: { rect: Rect }) {
  return <div className="pointer-events-none absolute border border-[#6B5CFF] bg-[#6B5CFF]/10" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />;
}

function AlignmentGuidesView({ guides }: { guides: AlignmentGuides }) {
  return (
    <>
      {guides.vertical.map((x, index) => (
        <div key={`v-${x}-${index}`} className="pointer-events-none absolute top-[-100000px] h-[200000px] w-px bg-[#6B5CFF]" style={{ left: x }} />
      ))}
      {guides.horizontal.map((y, index) => (
        <div key={`h-${y}-${index}`} className="pointer-events-none absolute left-[-100000px] h-px w-[200000px] bg-[#6B5CFF]" style={{ top: y }} />
      ))}
    </>
  );
}

const SMART_STRUCTURE_TYPES = new Set([
  "rail", "lane", "section", "grid-layout", "matrix", "timeline", "spine",
  "cluster", "shelf", "drawer", "stack", "compare-frame", "workspace-frame",
]);

const SMART_STRUCTURE_VARIANTS: Record<string, string[]> = {
  rail: ["Index", "Journey", "Story"],
  lane: ["Reference", "Process", "Compact"],
  section: ["Editorial", "Board", "Minimal"],
  "grid-layout": ["Cards", "Cells", "Gallery"],
  matrix: ["Decision", "Risk", "Opportunity"],
  timeline: ["Roadmap", "Release", "Research"],
  spine: ["Narrative", "Research", "Decision"],
  cluster: ["Context", "Affinity", "Evidence"],
  shelf: ["Reference", "Media", "Evidence"],
  drawer: ["Context", "Sources", "Actions"],
  stack: ["Priority", "Steps", "Layers"],
  "compare-frame": ["Compare", "Before / After", "Pros / Cons"],
  "workspace-frame": ["Freeform", "Grid", "Storyboard"],
};

function ContextStyleToolbar({
  bounds,
  viewport,
  selectedObjects,
  colorPopover,
  setColorPopover,
  onFill,
  onStroke,
  onTextColor,
  onDuplicate,
  onFontSize,
  onSetFontSize,
  onToggleBold,
  onTextAlign,
  onConnectorKind,
  onConnectorWidth,
  onConnectorDash,
  onConnectorArrow,
  onConnectorDetach,
  onIconName,
  onResetFreeform,
  onAddFreeformPoint,
  onStructureVariant,
  onStructureDensity,
  onAlign,
  onLayer,
}: {
  bounds: Rect;
  viewport: Viewport;
  selectedObjects: CanvasObject[];
  colorPopover: ColorPopoverMode;
  setColorPopover: (mode: ColorPopoverMode) => void;
  onFill: (fill: string) => void;
  onStroke: (stroke: string) => void;
  onTextColor: (textColor: string) => void;
  onDuplicate: () => void;
  onFontSize: (delta: number) => void;
  onSetFontSize: (size: number) => void;
  onToggleBold: () => void;
  onTextAlign: () => void;
  onConnectorKind: (kind: ConnectorKind) => void;
  onConnectorWidth: (delta: number) => void;
  onConnectorDash: () => void;
  onConnectorArrow: () => void;
  onConnectorDetach: () => void;
  onIconName: (name: NorthstarIconName) => void;
  onResetFreeform: () => void;
  onAddFreeformPoint: () => void;
  onStructureVariant: (rootId: string, variant: string) => void;
  onStructureDensity: (rootId: string) => void;
  onAlign: (mode: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  onLayer: (direction: LayerDirection) => void;
}) {
  const selectedCount = selectedObjects.length;
  const primary = selectedObjects[0];
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  useEffect(() => {
    setIconPickerOpen(false);
  }, [primary?.id]);

  const screenLeft = bounds.x * viewport.zoom + viewport.x;
  const screenTop = bounds.y * viewport.zoom + viewport.y;
  const screenWidth = bounds.w * viewport.zoom;
  const screenHeight = bounds.h * viewport.zoom;
  const screenRight = screenLeft + screenWidth;
  const screenBottom = screenTop + screenHeight;
  const windowWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const windowHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const isVisible = screenRight > 0 && screenLeft < windowWidth && screenBottom > 0 && screenTop < windowHeight;

  if (!isVisible) return null;

  const toolbarHeight = 44;
  const toolbarGap = 20;
  const x = screenLeft + screenWidth / 2;
  const preferredTop = screenTop - toolbarHeight - toolbarGap;
  const belowTop = screenBottom + toolbarGap;
  const canShowAbove = preferredTop >= 14;
  const canShowBelow = belowTop + toolbarHeight <= windowHeight - 14;

  if (!canShowAbove && !canShowBelow) return null;

  const toolbarTop = canShowAbove ? preferredTop : belowTop;
  const popoverTop = Math.max(14, toolbarTop - 168);

  const isSingle = selectedCount === 1;
  const isText = isSingle && primary && isBoxObject(primary) && primary.type === "text";
  const isImage = isSingle && primary && isBoxObject(primary) && primary.type === "image";
  const isConnector = isSingle && primary && isConnectorObject(primary);
  const isIconGlyph =
    isSingle && primary && isBoxObject(primary) && primary.semantic?.componentType === "icon-glyph";
  const isFreeform = isSingle && primary && isBoxObject(primary) && primary.type === "freeform";
  const isSmartStructure =
    isSingle && primary && isBoxObject(primary) && SMART_STRUCTURE_TYPES.has(primary.semantic?.componentType ?? "");

  return (
    <>
      <div
        data-canvas-ui="true"
        className="absolute z-[60] flex h-[44px] -translate-x-1/2 items-center overflow-visible rounded-[14px] bg-[#1C1C1C] text-white shadow-xl"
        style={{ left: x, top: toolbarTop }}
      >
        {isSmartStructure && primary && isBoxObject(primary) ? (
          <SmartStructureSelectionToolbar
            object={primary}
            onDuplicate={onDuplicate}
            onVariant={(variant) => onStructureVariant(primary.id, variant)}
            onDensity={() => onStructureDensity(primary.id)}
          />
        ) : isIconGlyph && primary && isBoxObject(primary) ? (
          <IconGlyphSelectionToolbar
            object={primary}
            onDuplicate={onDuplicate}
            onTogglePicker={() => setIconPickerOpen((current) => !current)}
            onFillClick={() => setColorPopover(colorPopover === "fill" ? null : "fill")}
            onColorClick={() => setColorPopover(colorPopover === "text" ? null : "text")}
          />
        ) : isFreeform && primary && isBoxObject(primary) ? (
          <FreeformSelectionToolbar
            fill={primary.style.fill}
            stroke={primary.style.stroke}
            onDuplicate={onDuplicate}
            onFillClick={() => setColorPopover(colorPopover === "fill" ? null : "fill")}
            onStrokeClick={() => setColorPopover(colorPopover === "stroke" ? null : "stroke")}
            onReset={onResetFreeform}
            onAddPoint={onAddFreeformPoint}
          />
        ) : isImage ? (
          <ImageSelectionToolbar onDuplicate={onDuplicate} />
        ) : isText && isBoxObject(primary) ? (
          <TextSelectionToolbar
            object={primary}
            onDuplicate={onDuplicate}
            onColorClick={() => setColorPopover(colorPopover === "text" ? null : "text")}
            onFontSize={onFontSize}
            onSetFontSize={onSetFontSize}
            onToggleBold={onToggleBold}
            onTextAlign={onTextAlign}
          />
        ) : isConnector && primary && isConnectorObject(primary) ? (
          <ConnectorSelectionToolbar
            connector={primary}
            onDuplicate={onDuplicate}
            onColorClick={() => setColorPopover(colorPopover === "stroke" ? null : "stroke")}
            onKind={onConnectorKind}
            onWidth={onConnectorWidth}
            onDash={onConnectorDash}
            onArrow={onConnectorArrow}
            onDetach={onConnectorDetach}
          />
        ) : (
          <ShapeSelectionToolbar
            fill={primary && isBoxObject(primary) ? primary.style.fill : "#FFFFFF"}
            stroke={primary && isBoxObject(primary) ? primary.style.stroke : "#6B5CFF"}
            selectedCount={selectedCount}
            onDuplicate={onDuplicate}
            onFillClick={() => setColorPopover(colorPopover === "fill" ? null : "fill")}
            onStrokeClick={() => setColorPopover(colorPopover === "stroke" ? null : "stroke")}
            onAlign={onAlign}
          />
        )}
        <LayerToolbarSegment onLayer={onLayer} />
      </div>

      {iconPickerOpen && isIconGlyph && primary && isBoxObject(primary) && (
        <IconPickerPopover
          left={x}
          top={Math.max(14, popoverTop - 52)}
          selected={primary.iconName ?? "sparkles"}
          onChoose={(name) => {
            onIconName(name);
            setIconPickerOpen(false);
          }}
        />
      )}

      {colorPopover && (
        <ColorPopover
          mode={colorPopover}
          left={x}
          top={popoverTop}
          onChoose={(color) => {
            if (colorPopover === "fill") onFill(color);
            if (colorPopover === "stroke") onStroke(color);
            if (colorPopover === "text") onTextColor(color);
            setColorPopover(null);
          }}
          onClear={() => {
            if (colorPopover === "fill") onFill("transparent");
            if (colorPopover === "stroke") onStroke("transparent");
            if (colorPopover === "text") onTextColor("#111111");
            setColorPopover(null);
          }}
        />
      )}
    </>
  );
}

function SmartStructureSelectionToolbar({
  object,
  onDuplicate,
  onVariant,
  onDensity,
}: {
  object: CanvasBoxObject;
  onDuplicate: () => void;
  onVariant: (variant: string) => void;
  onDensity: () => void;
}) {
  const [open, setOpen] = useState(false);
  const componentType = object.semantic?.componentType ?? "structure";
  const variants = SMART_STRUCTURE_VARIANTS[componentType] ?? ["Default"];
  const current = object.semantic?.structureVariant ?? variants[0];
  const density = object.semantic?.structureDensity ?? "balanced";
  return (
    <>
      <div className="relative border-r border-white/10">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 items-center gap-2 px-3 text-[11px] font-[850] hover:bg-white/10" title="Structure variants">
          <LayoutGrid className="h-4 w-4" />
          <span>{current}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-65" />
        </button>
        {open && (
          <div className="absolute left-0 top-12 z-[95] min-w-[176px] rounded-[14px] border border-white/10 bg-[#1C1C1C] p-1.5 shadow-2xl">
            {variants.map((variant) => (
              <button key={variant} type="button" onClick={() => { onVariant(variant); setOpen(false); }} className={cn("flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[11px] font-[750] hover:bg-white/10", current === variant && "bg-white/10 text-[#BDB6FF]")}>
                {variant}
                {current === variant && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={onDensity} className="flex h-11 items-center gap-2 border-r border-white/10 px-3 text-[10px] font-[800] hover:bg-white/10" title="Cycle structure density">
        <ListChecks className="h-4 w-4" />
        {density}
      </button>
      <button type="button" onClick={onDuplicate} className="flex h-11 w-11 items-center justify-center border-r border-white/10 hover:bg-white/10" title="Duplicate structure">
        <Copy className="h-4 w-4" />
      </button>
    </>
  );
}

function IconGlyphSelectionToolbar({
  object,
  onDuplicate,
  onTogglePicker,
  onFillClick,
  onColorClick,
}: {
  object: CanvasBoxObject;
  onDuplicate: () => void;
  onTogglePicker: () => void;
  onFillClick: () => void;
  onColorClick: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onTogglePicker}
        className="flex h-11 items-center gap-2 border-r border-white/10 px-3 text-[11px] font-[800] text-white/90 hover:bg-white/10"
        title="Choose icon"
      >
        <NorthstarGlyph name={object.iconName} className="h-4 w-4" />
        <span>Icon</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-65" />
      </button>
      <button type="button" onClick={onFillClick} className="flex h-11 items-center gap-1.5 border-r border-white/10 px-2.5 hover:bg-white/10" title="Icon background">
        <span className="h-4 w-4 rounded-[5px] border border-white/40" style={{ background: object.style.fill }} />
        <span className="text-[10px] font-[800]">Fill</span>
      </button>
      <button type="button" onClick={onColorClick} className="flex h-11 items-center gap-1.5 border-r border-white/10 px-2.5 hover:bg-white/10" title="Icon color">
        <span className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-white/10" style={{ color: object.style.textColor }}><Sparkles className="h-3 w-3" /></span>
        <span className="text-[10px] font-[800]">Color</span>
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className="flex h-11 w-11 items-center justify-center border-r border-white/10 hover:bg-white/10"
        title="Duplicate icon"
      >
        <Copy className="h-4 w-4" />
      </button>
    </>
  );
}

function IconPickerPopover({
  left,
  top,
  selected,
  onChoose,
}: {
  left: number;
  top: number;
  selected: NorthstarIconName;
  onChoose: (name: NorthstarIconName) => void;
}) {
  return (
    <div
      data-canvas-ui="true"
      className="absolute z-[75] w-[292px] -translate-x-1/2 rounded-[18px] border border-black/10 bg-white/96 p-3 shadow-[0_22px_70px_rgba(21,18,50,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#181820]/96"
      style={{ left, top }}
    >
      <div className="mb-2 px-1">
        <p className="text-[11px] font-[900] text-zinc-900 dark:text-white">Choose icon</p>
        <p className="text-[9px] text-zinc-500 dark:text-zinc-400">The icon is an independent canvas element.</p>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {NORTHSTAR_ICON_OPTIONS.map((option) => (
          <button
            key={option.name}
            type="button"
            title={option.label}
            onClick={() => onChoose(option.name)}
            className={cn(
              "flex h-11 items-center justify-center rounded-[12px] border transition",
              selected === option.name
                ? "border-[#6B5CFF] bg-[#6B5CFF] text-white shadow-[0_8px_18px_rgba(107,92,255,0.28)]"
                : "border-black/5 bg-zinc-50 text-zinc-600 hover:border-[#6B5CFF]/30 hover:bg-[#F3F0FF] hover:text-[#6B5CFF] dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
            )}
          >
            <NorthstarGlyph name={option.name} className="h-4.5 w-4.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

function FreeformSelectionToolbar({
  fill,
  stroke,
  onDuplicate,
  onFillClick,
  onStrokeClick,
  onReset,
  onAddPoint,
}: {
  fill: string;
  stroke: string;
  onDuplicate: () => void;
  onFillClick: () => void;
  onStrokeClick: () => void;
  onReset: () => void;
  onAddPoint: () => void;
}) {
  return (
    <>
      <button type="button" onClick={onFillClick} className="flex h-11 items-center gap-2 border-r border-white/10 px-3 hover:bg-white/10" title="Freeform fill">
        <span className="h-4 w-4 rounded-[5px] border border-white/40" style={{ background: fill }} />
        <span className="text-[10px] font-[800]">Fill</span>
      </button>
      <button type="button" onClick={onStrokeClick} className="flex h-11 items-center gap-2 border-r border-white/10 px-3 hover:bg-white/10" title="Freeform stroke">
        <span className="h-4 w-4 rounded-full border-[3px]" style={{ borderColor: stroke }} />
        <span className="text-[10px] font-[800]">Stroke</span>
      </button>
      <button type="button" onClick={onAddPoint} className="flex h-11 items-center gap-1.5 border-r border-white/10 px-3 text-[10px] font-[800] hover:bg-white/10" title="Add another sculpt point">
        <Plus className="h-4 w-4" /> Point
      </button>
      <button type="button" onClick={onReset} className="flex h-11 items-center gap-1.5 border-r border-white/10 px-3 text-[10px] font-[800] hover:bg-white/10" title="Reset organic shape">
        <LocateFixed className="h-4 w-4" /> Reset
      </button>
      <button type="button" onClick={onDuplicate} className="flex h-11 w-11 items-center justify-center border-r border-white/10 hover:bg-white/10" title="Duplicate">
        <Copy className="h-4 w-4" />
      </button>
    </>
  );
}

function ShapeSelectionToolbar({
  fill,
  stroke,
  selectedCount,
  onDuplicate,
  onFillClick,
  onStrokeClick,
  onAlign,
}: {
  fill: string;
  stroke: string;
  selectedCount: number;
  onDuplicate: () => void;
  onFillClick: () => void;
  onStrokeClick: () => void;
  onAlign: (mode: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
}) {
  const [alignOpen, setAlignOpen] = useState(false);
  const alignOptions: Array<{ mode: "left" | "center" | "right" | "top" | "middle" | "bottom"; label: string }> = [
    { mode: "left", label: "Align left" },
    { mode: "center", label: "Align center" },
    { mode: "right", label: "Align right" },
    { mode: "top", label: "Align top" },
    { mode: "middle", label: "Align middle" },
    { mode: "bottom", label: "Align bottom" },
  ];

  return (
    <>
      <ToolbarSegment>
        <ToolbarIconButton title="Duplicate" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </ToolbarIconButton>
      </ToolbarSegment>

      <ToolbarSegment>
        <button title="Fill" onMouseDown={(event) => event.preventDefault()} onClick={onFillClick} className="flex h-8 items-center gap-2 rounded-[9px] px-2 hover:bg-white/10">
          <span className="h-5 w-5 rounded-full border border-white/20" style={{ background: fill }} />
          <ChevronDown className="h-3.5 w-3.5 text-white/80" />
        </button>
      </ToolbarSegment>

      <ToolbarSegment>
        <button title="Stroke" onMouseDown={(event) => event.preventDefault()} onClick={onStrokeClick} className="flex h-8 items-center gap-2 rounded-[9px] px-2 hover:bg-white/10">
          <span className="h-5 w-5 rounded-[6px] border-2 bg-transparent" style={{ borderColor: stroke }} />
          <ChevronDown className="h-3.5 w-3.5 text-white/80" />
        </button>
      </ToolbarSegment>

      {selectedCount > 1 && (
        <ToolbarSegment>
          <div className="relative">
            <button
              title="Align selected"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setAlignOpen((value) => !value)}
              className="flex h-8 items-center gap-2 rounded-[9px] px-2 text-[13px] font-[600] text-white/90 hover:bg-white/10"
            >
              <AlignMiniIcon />
              Align
              <ChevronDown className="h-3.5 w-3.5 text-white/70" />
            </button>

            {alignOpen && (
              <div className="absolute left-1/2 top-10 z-[90] w-[176px] -translate-x-1/2 overflow-hidden rounded-[14px] border border-white/10 bg-[#1C1C1C] p-1.5 shadow-2xl">
                {alignOptions.map((option) => (
                  <button
                    key={option.mode}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onAlign(option.mode);
                      setAlignOpen(false);
                    }}
                    className="flex h-8 w-full items-center gap-3 rounded-[10px] px-2.5 text-left text-[12px] font-[600] text-white/82 hover:bg-white/10"
                  >
                    <AlignOptionIcon mode={option.mode} />
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ToolbarSegment>
      )}
    </>
  );
}

function LayerToolbarSegment({ onLayer }: { onLayer: (direction: LayerDirection) => void }) {
  const [open, setOpen] = useState(false);
  const options: Array<{ direction: LayerDirection; label: string; shortcut: string }> = [
    { direction: "front", label: "Bring to front", shortcut: "⇧⌘]" },
    { direction: "forward", label: "Bring forward", shortcut: "⌘]" },
    { direction: "backward", label: "Send backward", shortcut: "⌘[" },
    { direction: "back", label: "Send to back", shortcut: "⇧⌘[" },
  ];

  return (
    <ToolbarSegment>
      <div className="relative">
        <button
          title="Layer order"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
          className="flex h-8 items-center gap-2 rounded-[9px] px-2 text-[13px] font-[600] text-white/90 hover:bg-white/10"
        >
          <LayerOrderIcon />
          Layer
          <ChevronDown className="h-3.5 w-3.5 text-white/70" />
        </button>

        {open && (
          <div
            data-canvas-ui="true"
            className="absolute left-1/2 top-10 z-[90] w-[196px] -translate-x-1/2 overflow-hidden rounded-[14px] border border-white/10 bg-[#1C1C1C] p-1.5 shadow-2xl"
          >
            {options.map((option) => (
              <button
                key={option.direction}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onLayer(option.direction);
                  setOpen(false);
                }}
                className="flex h-8 w-full items-center justify-between gap-3 rounded-[10px] px-2.5 text-left text-[12px] font-[600] text-white/82 hover:bg-white/10"
              >
                <span>{option.label}</span>
                <span className="text-[11px] text-white/42">{option.shortcut}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </ToolbarSegment>
  );
}

function CanvasContextMenu({
  clientX,
  clientY,
  selectedCount,
  onDuplicate,
  onDelete,
  onLayer,
  onClose,
}: {
  clientX: number;
  clientY: number;
  selectedCount: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (direction: LayerDirection) => void;
  onClose: () => void;
}) {
  const width = 236;
  const height = 286;
  const left = Math.min(Math.max(12, clientX), (typeof window === "undefined" ? 1440 : window.innerWidth) - width - 12);
  const top = Math.min(Math.max(12, clientY), (typeof window === "undefined" ? 900 : window.innerHeight) - height - 12);
  const layerOptions: Array<{ direction: LayerDirection; label: string; shortcut: string }> = [
    { direction: "front", label: "Bring to front", shortcut: "⇧⌘]" },
    { direction: "forward", label: "Bring forward", shortcut: "⌘]" },
    { direction: "backward", label: "Send backward", shortcut: "⌘[" },
    { direction: "back", label: "Send to back", shortcut: "⇧⌘[" },
  ];

  return (
    <div
      data-canvas-ui="true"
      data-canvas-context-menu="true"
      className="fixed z-[120] w-[236px] overflow-hidden rounded-[16px] border border-white/14 bg-[#1C1C1C]/96 p-1.5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b border-white/10 px-3 py-2 text-[12px] font-[700] text-white/48">
        {selectedCount === 1 ? "1 object selected" : `${selectedCount} objects selected`}
      </div>

      <ContextMenuButton
        label="Duplicate"
        shortcut="⌘D"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      />

      <div className="my-1 h-px bg-white/10" />

      {layerOptions.map((option) => (
        <ContextMenuButton
          key={option.direction}
          label={option.label}
          shortcut={option.shortcut}
          onClick={() => {
            onLayer(option.direction);
            onClose();
          }}
        />
      ))}

      <div className="my-1 h-px bg-white/10" />

      <ContextMenuButton
        label="Delete"
        shortcut="⌫"
        danger
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </div>
  );
}

function ContextMenuButton({
  label,
  shortcut,
  danger,
  onClick,
}: {
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center justify-between rounded-[10px] px-2.5 text-left text-[13px] font-[650] hover:bg-white/10",
        danger ? "text-red-300 hover:text-red-200" : "text-white/88"
      )}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] font-[600] text-white/38">{shortcut}</span>}
    </button>
  );
}

function LayerOrderIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 5.5L8 3.5L11.5 5.5L8 7.5L4.5 5.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4.5 8L8 10L11.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.78" />
      <path d="M4.5 10.5L8 12.5L11.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.48" />
    </svg>
  );
}

function TextSelectionToolbar({
  object,
  onDuplicate,
  onColorClick,
  onFontSize,
  onSetFontSize,
  onToggleBold,
  onTextAlign,
}: {
  object: CanvasBoxObject;
  onDuplicate: () => void;
  onColorClick: () => void;
  onFontSize: (delta: number) => void;
  onSetFontSize: (size: number) => void;
  onToggleBold: () => void;
  onTextAlign: () => void;
}) {
  const [sizeOpen, setSizeOpen] = useState(false);
  const swatchBackground = getTextColorSwatchBackground(object);
  const sizeOptions = [
    { label: "Small", value: 16 },
    { label: "Medium", value: 24 },
    { label: "Large", value: 40 },
    { label: "Extra large", value: 64 },
    { label: "Huge", value: 96 },
  ];

  return (
    <>
      <ToolbarSegment>
        <button title="Text color" onMouseDown={(event) => event.preventDefault()} onClick={onColorClick} className="flex h-8 items-center gap-2 rounded-[9px] px-2 hover:bg-white/10">
          <span className="h-5 w-5 rounded-full border border-white/20" style={{ background: swatchBackground }} />
          <ChevronDown className="h-3.5 w-3.5 text-white/80" />
        </button>
      </ToolbarSegment>

      <ToolbarSegment>
        <button onMouseDown={(event) => event.preventDefault()} className="flex h-8 items-center gap-2 rounded-[9px] px-2 text-[14px] hover:bg-white/10">
          Default
          <ChevronDown className="h-3.5 w-3.5 text-white/80" />
        </button>
      </ToolbarSegment>

      <ToolbarSegment>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => onFontSize(-4)} className="h-8 rounded-[9px] px-2 text-[15px] hover:bg-white/10">−</button>
        <div className="relative">
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setSizeOpen((value) => !value)}
            className="flex h-8 min-w-[72px] items-center justify-between rounded-[9px] bg-white/10 px-2 text-[13px] text-white hover:bg-white/20"
          >
            {Math.round(object.style.fontSize)}
            <ChevronDown className="ml-3 h-3.5 w-3.5 text-white/70" />
          </button>

          {sizeOpen && (
            <div
              data-canvas-ui="true"
              className="absolute left-1/2 top-[42px] z-[90] w-[230px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-white/10 bg-[#1C1C1C] p-2 text-white shadow-2xl"
            >
              {sizeOptions.map((option) => (
                <button
                  key={option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSetFontSize(option.value);
                    setSizeOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-left hover:bg-white/10"
                >
                  <span className="text-[16px]">{option.label}</span>
                  <span className="text-[14px] text-white/55">{option.value}</span>
                </button>
              ))}
              <div className="mt-1 border-t border-white/10 pt-2">
                <input
                  value={Math.round(object.style.fontSize)}
                  onChange={(event) => onSetFontSize(Number(event.target.value) || object.style.fontSize)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="h-9 w-full rounded-[10px] bg-white/10 px-3 text-[14px] outline-none"
                />
              </div>
            </div>
          )}
        </div>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => onFontSize(4)} className="h-8 rounded-[9px] px-2 text-[15px] hover:bg-white/10">+</button>
      </ToolbarSegment>

      <ToolbarSegment>
        <ToolbarIconButton title="Bold" onClick={onToggleBold} active={object.style.fontWeight >= 700}>
          <Bold className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton title="Align" onClick={onTextAlign}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton title="Duplicate" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </ToolbarIconButton>
      </ToolbarSegment>
    </>
  );
}

function ImageSelectionToolbar({ onDuplicate }: { onDuplicate: () => void }) {
  return (
    <>
      <ToolbarSegment>
        <ToolbarIconButton title="Image" onClick={() => undefined}>
          <ImageIcon className="h-4 w-4" />
        </ToolbarIconButton>
      </ToolbarSegment>
      <ToolbarSegment>
        <span className="px-2 text-[13px] text-white/80">Image</span>
      </ToolbarSegment>
      <ToolbarSegment>
        <ToolbarIconButton title="Duplicate" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </ToolbarIconButton>
      </ToolbarSegment>
    </>
  );
}

function ConnectorSelectionToolbar({
  connector,
  onDuplicate,
  onColorClick,
  onKind,
  onWidth,
  onDash,
  onArrow,
  onDetach,
}: {
  connector: CanvasConnectorObject;
  onDuplicate: () => void;
  onColorClick: () => void;
  onKind: (kind: ConnectorKind) => void;
  onWidth: (delta: number) => void;
  onDash: () => void;
  onArrow: () => void;
  onDetach: () => void;
}) {
  return (
    <>
      <ToolbarSegment>
        <ToolbarIconButton title="Duplicate" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </ToolbarIconButton>
      </ToolbarSegment>
      <ToolbarSegment>
        <button title="Line color" onClick={onColorClick} className="flex h-8 items-center gap-2 rounded-[9px] px-2 hover:bg-white/10">
          <span className="h-5 w-5 rounded-full border border-white/20" style={{ background: connector.style.stroke }} />
          <ChevronDown className="h-3.5 w-3.5 text-white/80" />
        </button>
      </ToolbarSegment>
      <ToolbarSegment>
        <button onClick={() => onWidth(-1)} className="h-8 rounded-[9px] px-2 text-[15px] hover:bg-white/10">−</button>
        <span className="min-w-[22px] text-center text-[13px] text-white/80">{Math.round(connector.style.strokeWidth)}</span>
        <button onClick={() => onWidth(1)} className="h-8 rounded-[9px] px-2 text-[15px] hover:bg-white/10">+</button>
      </ToolbarSegment>
      <ToolbarSegment>
        <ToolbarIconButton title="Straight" onClick={() => onKind("straight")} active={connector.style.kind === "straight"}>
          <CanvasStraightConnectorIcon />
        </ToolbarIconButton>
        <ToolbarIconButton title="Curved" onClick={() => onKind("curved")} active={connector.style.kind === "curved"}>
          <CanvasCurvedConnectorIcon />
        </ToolbarIconButton>
        <ToolbarIconButton title="Elbow" onClick={() => onKind("elbow")} active={connector.style.kind === "elbow"}>
          <CanvasElbowConnectorIcon />
        </ToolbarIconButton>
      </ToolbarSegment>
      <ToolbarSegment>
        <ToolbarIconButton title="Line dash" onClick={onDash} active={connector.style.dash !== "solid"}>
          <CanvasDashIcon dash={connector.style.dash} />
        </ToolbarIconButton>
        <ToolbarIconButton title="Arrow end" onClick={onArrow} active={connector.style.end === "arrow"}>
          <ArrowRight className="h-4 w-4" />
        </ToolbarIconButton>
      </ToolbarSegment>
      <ToolbarSegment>
        <ToolbarIconButton title="Detach connector ends" onClick={onDetach} active={Boolean(connector.startBinding || connector.endBinding)}>
          <X className="h-4 w-4" />
        </ToolbarIconButton>
      </ToolbarSegment>
    </>
  );
}

function ColorPopover({
  mode,
  left,
  top,
  onChoose,
  onClear,
}: {
  mode: Exclude<ColorPopoverMode, null>;
  left: number;
  top: number;
  onChoose: (color: string) => void;
  onClear: () => void;
}) {
  const title = mode === "fill" ? "Fill color" : mode === "stroke" ? "Stroke color" : "Text color";
  const clearLabel = mode === "fill" ? "Transparent" : mode === "stroke" ? "No stroke" : "Default";

  return (
    <div
      data-canvas-ui="true"
      className="absolute z-[80] w-[300px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-white/10 bg-[#1C1C1C] text-white shadow-2xl"
      style={{ left, top }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
        <div className="text-[13px] font-[700] tracking-[-0.01em]">{title}</div>
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="rounded-[8px] px-2.5 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
        >
          {clearLabel}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 px-3.5 py-3.5">
        {COLOR_GRID.map((color) => (
          <button
            key={color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(color)}
            className="h-[26px] w-[26px] rounded-full border border-white/15 shadow-sm ring-offset-2 ring-offset-[#1C1C1C] transition-transform hover:scale-110 hover:ring-2 hover:ring-white/50"
            style={{ background: color }}
            aria-label={`Choose ${color}`}
          />
        ))}
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose("#6B5CFF")}
          className="h-[26px] w-[26px] rounded-full border border-white/20 ring-offset-2 ring-offset-[#1C1C1C] transition-transform hover:scale-110 hover:ring-2 hover:ring-white/50"
          style={{
            background:
              "conic-gradient(from 180deg, #ef4444, #f59e0b, #22c55e, #38bdf8, #7c3aed, #ec4899, #ef4444)",
          }}
          aria-label="Choose custom accent"
        />
      </div>
    </div>
  );
}

function ToolbarSegment({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center gap-1.5 border-r border-white/10 px-3 last:border-r-0">{children}</div>;
}

function ToolbarIconButton({
  children,
  title,
  onClick,
  active,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn("flex h-8 w-8 items-center justify-center rounded-[9px] text-white hover:bg-white/10", active && "bg-white/10")}
    >
      {children}
    </button>
  );
}

function AlignMiniIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5H13M5 8H11M4 11.5H12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function AlignOptionIcon({ mode }: { mode: "left" | "center" | "right" | "top" | "middle" | "bottom" }) {
  const horizontal = mode === "left" || mode === "center" || mode === "right";

  if (horizontal) {
    const guideX = mode === "left" ? 3 : mode === "center" ? 8 : 13;
    const lineAnchors = mode === "left"
      ? [[3, 11], [3, 8], [3, 13]]
      : mode === "center"
        ? [[4, 12], [5, 11], [3, 13]]
        : [[5, 13], [8, 13], [3, 13]];

    return (
      <svg className="h-4 w-4 shrink-0 text-white/75" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={`M${guideX} 2.5V13.5`} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        {lineAnchors.map(([x1, x2], index) => (
          <path key={index} d={`M${x1} ${4.5 + index * 3.5}H${x2}`} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        ))}
      </svg>
    );
  }

  const guideY = mode === "top" ? 3 : mode === "middle" ? 8 : 13;
  const lineAnchors = mode === "top"
    ? [[3, 11], [3, 8], [3, 13]]
    : mode === "middle"
      ? [[4, 12], [5, 11], [3, 13]]
      : [[5, 13], [8, 13], [3, 13]];

  return (
    <svg className="h-4 w-4 shrink-0 text-white/75" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={`M2.5 ${guideY}H13.5`} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
      {lineAnchors.map(([y1, y2], index) => (
        <path key={index} d={`M${4.5 + index * 3.5} ${y1}V${y2}`} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      ))}
    </svg>
  );
}

type NorthstarLegoLibraryTab = "atlas" | "primitives" | "structure" | "micro" | "connectors";

type NorthstarLegoRepositoryItem =
  | {
      id: string;
      kind: "primitive";
      tool: BoxTool;
      label: string;
      description: string;
      keywords?: string[];
    }
  | {
      id: string;
      kind: "component";
      preset: CanvasComponentPreset;
      label: string;
      description: string;
      keywords?: string[];
    }
  | {
      id: string;
      kind: "connector";
      connectorKind: ConnectorKind;
      label: string;
      description: string;
      keywords?: string[];
    };

const NORTHSTAR_PRIMITIVE_REPOSITORY: NorthstarLegoRepositoryItem[] = [
  { id: "text-block", kind: "primitive", tool: "text", label: "Text block", description: "Heading, body, caption, or label." },
  { id: "note", kind: "primitive", tool: "note", label: "Note", description: "Fast editable thinking surface." },
  { id: "frame", kind: "primitive", tool: "frame", label: "Frame", description: "Container for a region or artifact." },
  { id: "image-frame", kind: "primitive", tool: "image", label: "Image frame", description: "Drop an image or screenshot." },
  { id: "divider", kind: "primitive", tool: "divider", label: "Divider", description: "Separate sections and reading zones." },
  { id: "icon-chip", kind: "primitive", tool: "icon-chip", label: "Icon chip", description: "Separate card, icon, and editable label with an icon library." },
  { id: "icon", kind: "primitive", tool: "icon", label: "Icon", description: "Standalone resizable icon with the full icon chooser and independent styling." },
  { id: "badge", kind: "primitive", tool: "badge", label: "Badge", description: "Compact metadata or state marker." },
  { id: "connector", kind: "connector", connectorKind: "straight", label: "Connector", description: "Connect two canvas objects." },
  { id: "arrow", kind: "connector", connectorKind: "straight", label: "Arrow", description: "Show direction or progression.", keywords: ["connector", "direction"] },
  { id: "pin", kind: "primitive", tool: "pin", label: "Pin", description: "Anchor an observation to a point." },
  { id: "table-cell", kind: "primitive", tool: "table", label: "Table", description: "Editable rows, columns, and cells." },
  { id: "freeform", kind: "primitive", tool: "freeform", label: "Freeform shape", description: "Sculptable organic vector with draggable outline points." },
  { id: "highlight", kind: "primitive", tool: "highlight-region", label: "Highlight region", description: "Emphasize an area without covering it." },
  { id: "rectangle", kind: "primitive", tool: "rect", label: "Rectangle", description: "Sharp structural shape." },
  { id: "circle", kind: "primitive", tool: "circle", label: "Circle", description: "Node, marker, or emphasis point." },
  { id: "ellipse", kind: "primitive", tool: "ellipse", label: "Ellipse", description: "Soft group or diagram shape." },
  { id: "diamond", kind: "primitive", tool: "diamond", label: "Diamond", description: "Decision or branch point." },
  { id: "triangle", kind: "primitive", tool: "triangle", label: "Triangle", description: "Direction, signal, or hierarchy." },
  { id: "pill", kind: "primitive", tool: "pill", label: "Pill", description: "Compact label or state." },
  { id: "callout", kind: "primitive", tool: "callout", label: "Callout", description: "Pointed explanation or annotation." },
];

const NORTHSTAR_STRUCTURE_REPOSITORY: NorthstarLegoRepositoryItem[] = [
  { id: "rail", kind: "component", preset: "rail", label: "Rail", description: "Persistent navigation, evidence index, or story sequence." },
  { id: "flow-lane", kind: "component", preset: "lane", label: "Flow lane", description: "Ordered horizontal structure for flows and references." },
  { id: "section", kind: "component", preset: "section", label: "Section", description: "Contextual container with header, content, and footer zones." },
  { id: "grid", kind: "component", preset: "grid-layout", label: "Grid system", description: "Two-dimensional composition with editable cells." },
  { id: "matrix", kind: "component", preset: "matrix", label: "Matrix / decision space", description: "Compare options across two dimensions." },
  { id: "timeline", kind: "component", preset: "timeline", label: "Timeline", description: "Continuous milestone and dependency structure." },
  { id: "cluster", kind: "component", preset: "cluster", label: "Cluster", description: "Loose contextual grouping with smart boundaries." },
  { id: "spine", kind: "component", preset: "spine", label: "Spine", description: "Narrative backbone with connected reasoning nodes." },
  { id: "shelf", kind: "component", preset: "shelf", label: "Shelf", description: "Horizontal collection tray for references and assets." },
  { id: "drawer", kind: "component", preset: "drawer", label: "Drawer", description: "Docked contextual workspace with compartments." },
  { id: "stack", kind: "component", preset: "stack", label: "Stack", description: "Vertical modular rhythm with explicit hierarchy." },
  { id: "compare-frame", kind: "component", preset: "compare-frame", label: "Compare frame", description: "Side-by-side panels for comparison and synthesis." },
  { id: "workspace-frame", kind: "component", preset: "workspace-frame", label: "Workspace frame", description: "Large composition frame for mixed blocks and evidence." },
];

const NORTHSTAR_MICRO_REPOSITORY: NorthstarLegoRepositoryItem[] = [
  { id: "stage-marker", kind: "component", preset: "stage-marker", label: "Stage marker", description: "Label a stage or milestone." },
  { id: "source-chip", kind: "component", preset: "source-chip", label: "Source chip", description: "Identify the origin of evidence." },
  { id: "confidence-badge", kind: "component", preset: "confidence-badge", label: "Confidence badge", description: "Express an editable confidence value." },
  { id: "citation-chip", kind: "component", preset: "citation-chip", label: "Citation chip", description: "Attach an inline citation." },
  { id: "screenshot-tile", kind: "component", preset: "screenshot-tile", label: "Screenshot tile", description: "Drop visual evidence into a safe frame." },
  { id: "metric-tile", kind: "component", preset: "metric-tile", label: "Metric tile", description: "Display one key metric and delta." },
  { id: "annotation", kind: "component", preset: "annotation-callout", label: "Annotation callout", description: "Call out a grounded observation." },
  { id: "quote", kind: "component", preset: "quote-block", label: "Quote block", description: "Highlight a verbatim quote." },
  { id: "status", kind: "component", preset: "status-pill", label: "Status pill", description: "Show state at a glance." },
];

const NORTHSTAR_CONNECTOR_REPOSITORY: NorthstarLegoRepositoryItem[] = [
  { id: "straight", kind: "connector", connectorKind: "straight", label: "Straight", description: "Direct connection between objects." },
  { id: "curved", kind: "connector", connectorKind: "curved", label: "Curved", description: "Soft relationship or conceptual link." },
  { id: "elbow", kind: "connector", connectorKind: "elbow", label: "Elbow", description: "Orthogonal structured connection." },
];

function ShapePicker({
  onChoose,
  onInsertCodeArtifact,
  onChooseComponent,
  onShapePointerDown,
  onComponentPointerDown,
  onChooseConnector,
  activeTool,
  activeConnectorKind,
  activeMode,
}: {
  onChoose: (tool: BoxTool) => void;
  onInsertCodeArtifact: () => void;
  onChooseComponent: (preset: CanvasComponentPreset) => void;
  onShapePointerDown?: (tool: BoxTool, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onComponentPointerDown?: (preset: CanvasComponentPreset, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onChooseConnector: (kind: ConnectorKind) => void;
  activeTool: BoxTool | null;
  activeConnectorKind: ConnectorKind;
  activeMode: Tool;
}) {
  const [activeLibraryTab, setActiveLibraryTab] = useState<NorthstarLegoLibraryTab>("atlas");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const tabs: Array<{ id: NorthstarLegoLibraryTab; label: string; count: number }> = [
    { id: "atlas", label: "Atlas", count: NORTHSTAR_PRIMITIVE_REPOSITORY.length + NORTHSTAR_STRUCTURE_REPOSITORY.length + NORTHSTAR_MICRO_REPOSITORY.length },
    { id: "primitives", label: "Primitives", count: NORTHSTAR_PRIMITIVE_REPOSITORY.length },
    { id: "structure", label: "Structure", count: NORTHSTAR_STRUCTURE_REPOSITORY.length },
    { id: "micro", label: "Micro", count: NORTHSTAR_MICRO_REPOSITORY.length },
    { id: "connectors", label: "Links", count: NORTHSTAR_CONNECTOR_REPOSITORY.length },
  ];

  const matchesQuery = useCallback((item: NorthstarLegoRepositoryItem) => {
    if (!normalizedQuery) return true;
    return [item.id, item.label, item.description, ...(item.keywords ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }, [normalizedQuery]);

  const invokeItem = useCallback((item: NorthstarLegoRepositoryItem) => {
    if (item.kind === "primitive") onChoose(item.tool);
    if (item.kind === "component") onChooseComponent(item.preset);
    if (item.kind === "connector") onChooseConnector(item.connectorKind);
  }, [onChoose, onChooseComponent, onChooseConnector]);

  const handleItemPointerDown = useCallback((item: NorthstarLegoRepositoryItem, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (item.kind === "primitive") onShapePointerDown?.(item.tool, event);
    if (item.kind === "component") onComponentPointerDown?.(item.preset, event);
  }, [onComponentPointerDown, onShapePointerDown]);

  return (
    <div data-canvas-ui="true" className="flex h-full min-h-0 flex-col overflow-hidden bg-white/20 dark:bg-black/5">
      <div className="shrink-0 border-b border-black/5 bg-white/64 px-5 pb-4 pt-4 backdrop-blur-2xl dark:border-white/10 dark:bg-black/20">
        <div className="flex h-11 items-center gap-2 rounded-[15px] border border-black/[0.035] bg-black/[0.035] px-3.5 text-zinc-400 shadow-inner shadow-white/40 dark:border-white/5 dark:bg-white/8">
          <Search className="h-[17px] w-[17px] shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search primitives, structure, micro-blocks..."
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-[600] text-zinc-700 outline-none placeholder:font-[500] placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="rounded-full p-1 text-zinc-400 hover:bg-black/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-white" title="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto rounded-[15px] bg-black/[0.035] p-1 [scrollbar-width:none] dark:bg-white/8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveLibraryTab(tab.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-[11px] px-3 text-[10px] font-[850] tracking-[-0.01em] transition-all",
                activeLibraryTab === tab.id
                  ? "bg-white text-[#5E50F5] shadow-[0_8px_24px_rgba(35,30,78,0.08)] dark:bg-white/12 dark:text-[#C8C1FF]"
                  : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
              )}
            >
              <span>{tab.label}</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[8px]", activeLibraryTab === tab.id ? "bg-[#EEEAFE] text-[#5E50F5] dark:bg-white/10 dark:text-[#D7D2FF]" : "bg-black/5 text-zinc-400 dark:bg-white/8")}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-4 [scrollbar-gutter:stable]">
        <section className="mb-4 rounded-[18px] border border-[#6B5CFF]/15 bg-[linear-gradient(145deg,rgba(107,92,255,0.10),rgba(255,255,255,0.72))] p-3.5 shadow-[0_14px_34px_rgba(47,39,112,0.08)] dark:border-[#8F82FF]/20 dark:bg-[linear-gradient(145deg,rgba(107,92,255,0.20),rgba(255,255,255,0.04))]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#6B5CFF] text-white shadow-[0_9px_22px_rgba(107,92,255,0.28)]">
              <Wrench className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-[900] tracking-[-0.025em] text-zinc-950 dark:text-white">Patch 1 runtime lab</p>
              <p className="mt-1 text-[9px] leading-[14px] text-zinc-500 dark:text-zinc-400">
                Insert one sandboxed standard-web artifact and test selection, movement, resizing, duplication, deletion, and undo.
              </p>
              <button
                type="button"
                onClick={onInsertCodeArtifact}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-[11px] bg-[#171820] px-3.5 text-[9px] font-[850] text-white shadow-sm transition hover:bg-[#292A35] dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Add code-artifact prototype
              </button>
            </div>
          </div>
        </section>

        {activeLibraryTab === "atlas" && (
          <NorthstarLegoAtlas
            query={normalizedQuery}
            matchesQuery={matchesQuery}
            onInvoke={invokeItem}
            onPointerDown={handleItemPointerDown}
            activeTool={activeTool}
            activeConnectorKind={activeMode === "connector" ? activeConnectorKind : null}
          />
        )}
        {activeLibraryTab === "primitives" && (
          <NorthstarLegoGrid
            eyebrow="01"
            title="Primitives"
            description="Building blocks for content and meaning."
            items={NORTHSTAR_PRIMITIVE_REPOSITORY.filter(matchesQuery)}
            onInvoke={invokeItem}
            onPointerDown={handleItemPointerDown}
            activeTool={activeTool}
            activeConnectorKind={activeMode === "connector" ? activeConnectorKind : null}
          />
        )}
        {activeLibraryTab === "structure" && (
          <NorthstarLegoGrid
            eyebrow="02"
            title="Structure"
            description="Containers and layouts for organizing ideas."
            items={NORTHSTAR_STRUCTURE_REPOSITORY.filter(matchesQuery)}
            onInvoke={invokeItem}
            onPointerDown={handleItemPointerDown}
            activeTool={activeTool}
            activeConnectorKind={activeMode === "connector" ? activeConnectorKind : null}
          />
        )}
        {activeLibraryTab === "micro" && (
          <NorthstarLegoGrid
            eyebrow="03"
            title="Micro-blocks"
            description="Reusable semantics, evidence, and state."
            items={NORTHSTAR_MICRO_REPOSITORY.filter(matchesQuery)}
            onInvoke={invokeItem}
            onPointerDown={handleItemPointerDown}
            activeTool={activeTool}
            activeConnectorKind={activeMode === "connector" ? activeConnectorKind : null}
          />
        )}
        {activeLibraryTab === "connectors" && (
          <NorthstarLegoGrid
            eyebrow="04"
            title="Connectors"
            description="Smart links, arrows, curves, and elbows."
            items={NORTHSTAR_CONNECTOR_REPOSITORY.filter(matchesQuery)}
            onInvoke={invokeItem}
            onPointerDown={handleItemPointerDown}
            activeTool={activeTool}
            activeConnectorKind={activeMode === "connector" ? activeConnectorKind : null}
          />
        )}
      </div>
    </div>
  );
}

function NorthstarLegoAtlas({
  query,
  matchesQuery,
  onInvoke,
  onPointerDown,
  activeTool,
  activeConnectorKind,
}: {
  query: string;
  matchesQuery: (item: NorthstarLegoRepositoryItem) => boolean;
  onInvoke: (item: NorthstarLegoRepositoryItem) => void;
  onPointerDown: (item: NorthstarLegoRepositoryItem, event: ReactPointerEvent<HTMLButtonElement>) => void;
  activeTool: BoxTool | null;
  activeConnectorKind: ConnectorKind | null;
}) {
  const sections = [
    { eyebrow: "01", title: "Primitives", description: "Content and meaning", items: NORTHSTAR_PRIMITIVE_REPOSITORY.filter(matchesQuery) },
    { eyebrow: "02", title: "Structure", description: "Containers and layouts", items: NORTHSTAR_STRUCTURE_REPOSITORY.filter(matchesQuery) },
    { eyebrow: "03", title: "Micro-blocks", description: "Semantics and evidence", items: NORTHSTAR_MICRO_REPOSITORY.filter(matchesQuery) },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) return <PaletteEmptyState query={query} />;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[22px] border border-[#6B5CFF]/18 bg-gradient-to-br from-white via-[#FBFAFF] to-[#F1F4FF] p-4 shadow-[0_18px_42px_rgba(54,43,126,0.08)] dark:border-[#BDB6FF]/15 dark:from-white/10 dark:via-[#6B5CFF]/10 dark:to-black/10">
        <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#6B5CFF]/10 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#6B5CFF]/14 bg-white text-[#6B5CFF] shadow-[0_10px_24px_rgba(107,92,255,0.10)] dark:bg-white/10 dark:text-[#C8C1FF]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-[950] tracking-[-0.03em] text-zinc-950 dark:text-white">Northstar component atlas</p>
              <span className="rounded-full bg-[#EEEAFE] px-2 py-1 text-[8px] font-[900] uppercase tracking-[0.1em] text-[#5E50F5] dark:bg-white/10 dark:text-[#D7D2FF]">Native</span>
            </div>
            <p className="mt-1 text-[10px] leading-[15px] text-zinc-500 dark:text-zinc-400">Preview small. Drop full-size, editable, structured canvas objects.</p>
          </div>
        </div>
      </div>

      {sections.map((section) => (
        <NorthstarAtlasRail
          key={section.title}
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.description}
          items={section.items}
          onInvoke={onInvoke}
          onPointerDown={onPointerDown}
          activeTool={activeTool}
          activeConnectorKind={activeConnectorKind}
        />
      ))}

      <NorthstarCompositionRulesStrip />
    </div>
  );
}

function NorthstarAtlasRail({
  eyebrow,
  title,
  description,
  items,
  onInvoke,
  onPointerDown,
  activeTool,
  activeConnectorKind,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: NorthstarLegoRepositoryItem[];
  onInvoke: (item: NorthstarLegoRepositoryItem) => void;
  onPointerDown: (item: NorthstarLegoRepositoryItem, event: ReactPointerEvent<HTMLButtonElement>) => void;
  activeTool: BoxTool | null;
  activeConnectorKind: ConnectorKind | null;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[9px] font-[950] tracking-[0.08em] text-[#6B5CFF]">{eyebrow}</span>
        <h3 className="text-[11px] font-[950] uppercase tracking-[0.08em] text-zinc-800 dark:text-zinc-100">{title}</h3>
        <p className="truncate text-[9px] text-zinc-400 dark:text-zinc-500">{description}</p>
      </div>
      <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {items.map((item) => (
          <NorthstarLegoTile
            key={item.id}
            item={item}
            compact
            active={item.kind === "primitive" ? activeTool === item.tool : item.kind === "connector" ? activeConnectorKind === item.connectorKind : false}
            onInvoke={onInvoke}
            onPointerDown={onPointerDown}
          />
        ))}
      </div>
    </section>
  );
}

function NorthstarLegoGrid({
  eyebrow,
  title,
  description,
  items,
  onInvoke,
  onPointerDown,
  activeTool,
  activeConnectorKind,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: NorthstarLegoRepositoryItem[];
  onInvoke: (item: NorthstarLegoRepositoryItem) => void;
  onPointerDown: (item: NorthstarLegoRepositoryItem, event: ReactPointerEvent<HTMLButtonElement>) => void;
  activeTool: BoxTool | null;
  activeConnectorKind: ConnectorKind | null;
}) {
  if (items.length === 0) return <PaletteEmptyState query="" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 border-b border-black/5 pb-3 dark:border-white/10">
        <span className="pt-0.5 text-[10px] font-[950] tracking-[0.08em] text-[#6B5CFF]">{eyebrow}</span>
        <div>
          <h3 className="text-[13px] font-[950] uppercase tracking-[0.06em] text-zinc-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-[10px] leading-[15px] text-zinc-400 dark:text-zinc-500">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <NorthstarLegoTile
            key={item.id}
            item={item}
            active={item.kind === "primitive" ? activeTool === item.tool : item.kind === "connector" ? activeConnectorKind === item.connectorKind : false}
            onInvoke={onInvoke}
            onPointerDown={onPointerDown}
          />
        ))}
      </div>
    </div>
  );
}

function NorthstarLegoTile({
  item,
  active,
  compact = false,
  onInvoke,
  onPointerDown,
}: {
  item: NorthstarLegoRepositoryItem;
  active: boolean;
  compact?: boolean;
  onInvoke: (item: NorthstarLegoRepositoryItem) => void;
  onPointerDown: (item: NorthstarLegoRepositoryItem, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const tag = item.kind === "primitive" ? "Primitive" : item.kind === "component" ? "Block" : "Link";
  return (
    <button
      type="button"
      onPointerDown={(event) => onPointerDown(item, event)}
      onClick={(event) => {
        if (item.kind !== "connector" && event.detail > 0) return;
        onInvoke(item);
      }}
      title={`${item.label} — click to insert, drag to place`}
      className={cn(
        "group relative overflow-hidden border bg-white/72 text-left transition-all hover:-translate-y-0.5 hover:border-[#6B5CFF]/35 hover:bg-white hover:shadow-[0_18px_38px_rgba(35,30,78,0.10)] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/9",
        compact ? "w-[118px] shrink-0 snap-start rounded-[15px]" : "min-h-[154px] rounded-[18px]",
        active ? "border-[#6B5CFF]/55 ring-2 ring-[#6B5CFF]/10" : "border-black/[0.055]",
      )}
    >
      <div className={cn("relative border-b border-black/5 bg-gradient-to-br from-white via-[#F9F8FF] to-[#F0F3FF] dark:border-white/10 dark:from-white/10 dark:via-[#6B5CFF]/8 dark:to-black/10", compact ? "h-[72px] p-2" : "h-[88px] p-2.5")}> 
        <NorthstarLegoPreview item={item} />
        <span className="absolute right-2 top-2 rounded-full bg-white/78 px-1.5 py-0.5 text-[7px] font-[900] uppercase tracking-[0.08em] text-[#6B5CFF] shadow-sm dark:bg-black/30 dark:text-[#C8C1FF]">{tag}</span>
      </div>
      <div className={cn(compact ? "p-2.5" : "p-3")}> 
        <p className={cn("font-[900] tracking-[-0.02em] text-zinc-950 dark:text-white", compact ? "text-[10px]" : "text-[11px]")}>{item.label}</p>
        {!compact && <p className="mt-1 line-clamp-2 text-[9px] leading-[13px] text-zinc-500 dark:text-zinc-400">{item.description}</p>}
      </div>
    </button>
  );
}

function NorthstarLegoPreview({ item }: { item: NorthstarLegoRepositoryItem }) {
  if (item.kind === "primitive") return <PrimitiveMiniPreview type={item.tool} />;
  if (item.kind === "component") return <ComponentPreviewSilhouette preset={item.preset} />;
  return (
    <div className="flex h-full w-full items-center justify-center text-[#5E50F5] dark:text-[#C8C1FF]">
      {item.connectorKind === "curved" ? <CanvasCurvedConnectorIcon /> : item.connectorKind === "elbow" ? <CanvasElbowConnectorIcon /> : <CanvasStraightConnectorIcon />}
    </div>
  );
}

function NorthstarCompositionRulesStrip() {
  const rules = [
    { id: "alignment", label: "Alignment" },
    { id: "nesting", label: "Nesting" },
    { id: "slots", label: "Slots" },
    { id: "resize", label: "Resize" },
    { id: "snapping", label: "Snapping" },
    { id: "anchors", label: "Anchors" },
  ];
  return (
    <section className="space-y-2.5 border-t border-black/5 pt-4 dark:border-white/10">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[9px] font-[950] tracking-[0.08em] text-[#6B5CFF]">04</span>
        <h3 className="text-[11px] font-[950] uppercase tracking-[0.08em] text-zinc-800 dark:text-zinc-100">Composition rules</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-[13px] border border-black/[0.055] bg-white/62 p-2 dark:border-white/10 dark:bg-white/5">
            <CompositionRulePreview type={rule.id} />
            <p className="mt-1.5 text-center text-[8px] font-[850] text-zinc-500 dark:text-zinc-400">{rule.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompositionRulePreview({ type }: { type: string }) {
  const accent = "#6B5CFF";
  const line = "#DCD8EA";
  if (type === "alignment") return <svg className="h-10 w-full" viewBox="0 0 92 44"><path d="M12 8V38" stroke={accent} strokeDasharray="3 3"/><rect x="18" y="10" width="28" height="8" rx="3" fill="#EEEAFE"/><rect x="18" y="24" width="54" height="8" rx="3" fill="#F4F2FA"/></svg>;
  if (type === "nesting") return <svg className="h-10 w-full" viewBox="0 0 92 44"><rect x="10" y="6" width="72" height="32" rx="7" fill="none" stroke={accent} strokeDasharray="4 3"/><rect x="20" y="13" width="52" height="8" rx="3" fill="#EEEAFE"/><rect x="27" y="25" width="38" height="7" rx="3" fill="#F4F2FA"/></svg>;
  if (type === "slots") return <svg className="h-10 w-full" viewBox="0 0 92 44"><rect x="8" y="6" width="76" height="12" rx="4" fill="none" stroke={accent} strokeDasharray="4 3"/><rect x="8" y="23" width="76" height="15" rx="4" fill="none" stroke={line} strokeDasharray="4 3"/></svg>;
  if (type === "resize") return <svg className="h-10 w-full" viewBox="0 0 92 44"><rect x="18" y="9" width="56" height="26" fill="none" stroke={accent}/>{[[18,9],[74,9],[18,35],[74,35]].map(([x,y],i)=><rect key={i} x={x-2} y={y-2} width="4" height="4" fill={accent}/>)}</svg>;
  if (type === "snapping") return <svg className="h-10 w-full" viewBox="0 0 92 44"><path d="M46 3V41M4 22H88" stroke="#52B788" strokeDasharray="3 3"/><rect x="18" y="10" width="22" height="20" rx="4" fill="#F5F2FF" stroke={line}/><rect x="52" y="15" width="22" height="18" rx="4" fill="#FFFFFF" stroke={line}/></svg>;
  return <svg className="h-10 w-full" viewBox="0 0 92 44"><rect x="8" y="12" width="28" height="20" rx="5" fill="#F5F2FF" stroke={line}/><rect x="56" y="12" width="28" height="20" rx="5" fill="#FFFFFF" stroke={line}/><path d="M36 22H56" stroke={accent} strokeWidth="2"/><circle cx="36" cy="22" r="3" fill="#fff" stroke={accent}/><circle cx="56" cy="22" r="3" fill="#fff" stroke={accent}/></svg>;
}

function PaletteEmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-black/10 bg-white/45 p-5 text-center dark:border-white/15 dark:bg-white/5">
      <Search className="mx-auto h-5 w-5 text-zinc-400" />
      <p className="mt-2 text-[12px] font-[800] text-zinc-700 dark:text-zinc-200">No matching canvas items</p>
      <p className="mt-1 text-[10px] leading-[15px] text-zinc-500 dark:text-zinc-400">{query ? `No results for “${query}”.` : "Try a different primitive, structure, micro-block, or connector."}</p>
    </div>
  );
}

function PrimitiveMiniPreview({ type }: { type: BoxTool }) {
  const accent = "#6B5CFF";
  const blue = "#4F7CFF";
  const green = "#20A45B";
  const orange = "#FF6B2C";
  const line = "rgba(35,30,78,0.17)";
  const muted = "#9BA0AD";

  return (
    <svg className="h-full w-full" viewBox="0 0 128 72" fill="none" aria-hidden="true">
      {type === "text" && <><text x="18" y="36" fontSize="26" fontWeight="800" fill="#15131C">Aa</text><text x="18" y="53" fontSize="8" fill={muted}>Heading · Body · Caption</text></>}
      {type === "note" && <><path d="M25 10H84L101 27V62H25V10Z" fill="#FFFBEA" stroke="rgba(150,130,90,.35)"/><path d="M84 10V27H101" stroke="rgba(150,130,90,.35)"/><path d="M38 28H76M38 38H84M38 48H66" stroke="#C9BE92" strokeLinecap="round"/></>}
      {type === "frame" && <><rect x="25" y="10" width="78" height="52" rx="4" fill="rgba(107,92,255,.035)" stroke={accent} strokeDasharray="5 4"/><rect x="25" y="10" width="28" height="11" rx="3" fill={accent}/><text x="31" y="18" fontSize="6" fontWeight="800" fill="white">FRAME</text></>}
      {type === "image" && <><rect x="27" y="9" width="74" height="54" rx="7" fill="#F4F7FC" stroke={line}/><circle cx="88" cy="20" r="5" fill="#DDE6F5"/><path d="M37 53L55 34L66 44L76 35L93 53H37Z" fill="#79A4F8"/></>}
      {type === "divider" && <><path d="M23 24H105" stroke="#111827" strokeWidth="2"/><path d="M23 44H105" stroke={accent} strokeDasharray="5 4"/></>}
      {type === "icon" && <>
        <rect x="41" y="13" width="46" height="46" rx="12" fill="#F7F5FF" stroke="rgba(107,92,255,.16)" strokeDasharray="4 3"/>
        <path d="M64 23L67.5 31.5L76 35L67.5 38.5L64 47L60.5 38.5L52 35L60.5 31.5L64 23Z" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
        <circle cx="41" cy="13" r="2.5" fill={accent}/><circle cx="87" cy="13" r="2.5" fill={accent}/><circle cx="41" cy="59" r="2.5" fill={accent}/><circle cx="87" cy="59" r="2.5" fill={accent}/>
      </>}
      {type === "icon-chip" && <>
        <rect x="20" y="13" width="88" height="46" rx="12" fill="white" stroke={line}/>
        <rect x="29" y="21" width="30" height="30" rx="9" fill="#F1EEFF" stroke="rgba(107,92,255,.15)"/>
        <path d="M44 27L47 33L54 34L49 39L50 46L44 43L38 46L39 39L34 34L41 33L44 27Z" stroke={accent}/>
        <rect x="67" y="27" width="30" height="7" rx="3.5" fill="#25222E" opacity=".82"/>
        <rect x="67" y="40" width="22" height="4" rx="2" fill="#B3B0BB"/>
        <circle cx="20" cy="13" r="2.5" fill={accent}/>
        <circle cx="59" cy="21" r="2.5" fill={blue}/>
        <circle cx="97" cy="27" r="2.5" fill={green}/>
      </>}
      {type === "badge" && <><rect x="29" y="16" width="40" height="18" rx="9" fill="#EAE6FF"/><text x="41" y="28" fontSize="8" fontWeight="800" fill={accent}>New</text><rect x="72" y="39" width="34" height="16" rx="8" fill="#E7F8ED"/><text x="81" y="50" fontSize="7" fontWeight="800" fill={green}>Beta</text></>}
      {type === "pin" && <><path d="M64 9C51 9 42 19 42 31C42 46 64 65 64 65C64 65 86 46 86 31C86 19 77 9 64 9Z" fill={accent}/><circle cx="64" cy="31" r="8" fill="white"/><circle cx="64" cy="31" r="3" fill={accent}/></>}
      {type === "table" && <><rect x="24" y="9" width="80" height="54" rx="4" fill="white" stroke={line}/><path d="M24 27H104M24 45H104M53 9V63M79 9V63" stroke={line}/><rect x="24" y="9" width="80" height="18" rx="4" fill="#F5F2FF"/></>}
      {type === "freeform" && <>
        <path d={buildSmoothClosedFreeformPath()} transform="translate(17 6) scale(.94 .60)" fill="#F0ECFF" stroke={accent} vectorEffect="non-scaling-stroke"/>
        {DEFAULT_FREEFORM_POINTS.map((point, index) => (
          <circle key={index} cx={17 + point.x * 94} cy={6 + point.y * 60} r="2.4" fill={accent} stroke="white" strokeWidth="1.2"/>
        ))}
      </>} 
      {type === "highlight-region" && <><rect x="22" y="13" width="84" height="48" rx="8" fill="rgba(107,92,255,.05)" stroke={accent} strokeDasharray="5 4"/><rect x="69" y="8" width="39" height="13" rx="6.5" fill="white" stroke={line}/><circle cx="78" cy="14.5" r="2" fill={accent}/><circle cx="88" cy="14.5" r="2" fill={blue}/><circle cx="98" cy="14.5" r="2" fill={orange}/></>}
      {type === "rect" && <rect x="29" y="16" width="70" height="42" rx="2" fill="#F5F2FF" stroke={accent}/>} 
      {type === "card" && <><rect x="25" y="13" width="78" height="48" rx="10" fill="white" stroke={line}/><rect x="35" y="24" width="38" height="6" rx="3" fill="#C9C2FF"/><rect x="35" y="39" width="56" height="4" rx="2" fill="#E7E5EF"/></>}
      {type === "circle" && <circle cx="64" cy="36" r="24" fill="#F0ECFF" stroke={accent}/>} 
      {type === "ellipse" && <ellipse cx="64" cy="36" rx="37" ry="23" fill="#F0ECFF" stroke={accent}/>} 
      {type === "diamond" && <path d="M64 8L101 36L64 64L27 36L64 8Z" fill="#F5F2FF" stroke={accent}/>} 
      {type === "triangle" && <path d="M64 9L101 62H27L64 9Z" fill="#F5F2FF" stroke={accent}/>} 
      {type === "pill" && <rect x="23" y="23" width="82" height="27" rx="13.5" fill="#F0ECFF" stroke={accent}/>} 
      {type === "callout" && <path d="M26 12H101Q106 12 106 17V47Q106 52 101 52H65L56 63L54 52H26Q21 52 21 47V17Q21 12 26 12Z" fill="#FFFBEA" stroke="#C8B36A"/>}
    </svg>
  );
}

function ComponentPreviewSilhouette({ preset }: { preset: CanvasComponentPreset }) {
  const accent = "#6B5CFF";
  const blue = "#4F7CFF";
  const green = "#20A45B";
  const orange = "#FF6B2C";
  const ink = "#181820";
  const line = "rgba(35,30,78,0.16)";

  if (preset === "stack") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="42" y="8" width="96" height="13" rx="5" fill="#EEEAFE" stroke={accent}/><rect x="48" y="27" width="84" height="12" rx="4" fill="white" stroke={line}/><rect x="54" y="45" width="72" height="11" rx="4" fill="white" stroke={line}/><rect x="61" y="61" width="58" height="3" rx="1.5" fill="#D9D5E6"/></svg>;
  if (preset === "rail") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="25" y="7" width="34" height="56" rx="9" fill="#F4F1FF" stroke={line}/>{[0,1,2,3].map((i)=><circle key={i} cx="42" cy={17+i*12} r="4" fill={i===1?accent:"#DCD7EC"}/>) }<rect x="69" y="12" width="82" height="46" rx="8" fill="white" stroke={line}/><rect x="79" y="22" width="42" height="5" rx="2.5" fill="#C9C2FF"/><rect x="79" y="35" width="60" height="4" rx="2" fill="#E6E3EF"/></svg>;
  if (preset === "lane") return <svg className="h-full w-full" viewBox="0 0 180 70"><path d="M23 30H157" stroke="#CCC7DB" strokeWidth="2"/>{[0,1,2,3,4].map((i)=><g key={i}><circle cx={29+i*31} cy="30" r="7" fill={i===2?accent:"white"} stroke={accent}/><rect x={18+i*31} y="43" width="22" height="17" rx="4" fill={i===2?"#EEEAFE":"white"} stroke={line}/></g>)}</svg>;
  if (preset === "grid-layout") return <svg className="h-full w-full" viewBox="0 0 180 70">{[0,1,2,3,4,5,6,7,8].map((i)=><rect key={i} x={35+(i%3)*38} y={7+Math.floor(i/3)*20} width="30" height="15" rx="3" fill="white" stroke={line}/>)}</svg>;
  if (preset === "cluster") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="27" y="8" width="126" height="54" rx="10" fill="rgba(107,92,255,.04)" stroke={accent} strokeDasharray="5 4"/><rect x="38" y="18" width="42" height="17" rx="5" fill="white" stroke={line}/><rect x="91" y="15" width="48" height="20" rx="3" fill="#F5F2FF" stroke={line}/><rect x="57" y="42" width="55" height="13" rx="6" fill="#ECF9F1" stroke={line}/></svg>;
  if (preset === "spine") return <svg className="h-full w-full" viewBox="0 0 180 70"><path d="M44 7V63" stroke="#CFC9E3" strokeWidth="2"/>{[0,1,2,3].map((i)=><g key={i}><circle cx="44" cy={14+i*15} r="4.5" fill={[accent,blue,green,orange][i]} stroke="white" strokeWidth="1.5"/><path d={`M49 ${14+i*15}H62`} stroke="#CFC9E3" strokeWidth="2"/><rect x="65" y={8+i*15} width={i===2?82:67} height="12" rx={i===2?6:2} fill={i===2?"#EEEAFE":"#F7F6FA"} stroke={i===2?accent:line}/></g>)}</svg>;
  if (preset === "shelf") return <svg className="h-full w-full" viewBox="0 0 180 70"><path d="M22 55H158" stroke="#CDD3E1" strokeWidth="5" strokeLinecap="round"/>{[0,1,2,3].map((i)=><rect key={i} x={31+i*31} y={18+(i%2)*5} width="23" height={35-(i%2)*5} rx={i===2?2:6} fill="white" stroke={line}/>)}</svg>;
  if (preset === "drawer") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="22" y="8" width="92" height="54" rx="8" fill="#FAFAFD" stroke={line}/><rect x="105" y="8" width="53" height="54" rx="8" fill="#F3F0FF" stroke={accent}/>{[0,1,2,3].map((i)=><rect key={i} x="114" y={15+i*11} width="35" height="7" rx="3.5" fill={i===0?"white":"#E5E0F5"} stroke={line}/>)}</svg>;
  if (preset === "compare-frame") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="18" y="10" width="144" height="50" rx="8" fill="white" stroke={line}/><path d="M90 10V60" stroke={accent} strokeWidth="2"/><rect x="29" y="20" width="45" height="5" rx="2.5" fill="#D4CFFF"/><rect x="105" y="20" width="45" height="5" rx="2.5" fill="#D4CFFF"/>{[0,1,2].map(i=><g key={i}><rect x="29" y={33+i*7} width={34-i*4} height="3" rx="1.5" fill="#E6E3EF"/><rect x="105" y={33+i*7} width={34-i*4} height="3" rx="1.5" fill="#E6E3EF"/></g>)}</svg>;
  if (preset === "workspace-frame") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="16" y="7" width="148" height="56" rx="8" fill="#FBFCFF" stroke={line}/><rect x="16" y="7" width="16" height="56" rx="8" fill="#F2EEFF"/><rect x="49" y="18" width="38" height="22" rx="5" fill="white" stroke={accent} strokeDasharray="4 3"/><rect x="101" y="14" width="46" height="17" rx="4" fill="#EEEAFE" stroke="#BEB4FF"/><rect x="78" y="44" width="42" height="13" rx="4" fill="#ECFBF1" stroke="#BFE8CC"/></svg>;
  if (preset === "stage-marker") return <svg className="h-full w-full" viewBox="0 0 180 70"><path d="M35 21H125L145 35L125 49H35L20 35L35 21Z" fill="#F0ECFF" stroke={accent}/><text x="69" y="39" fontSize="12" fontWeight="800" fill={accent}>Step 1</text></svg>;
  if (preset === "source-chip") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="43" y="22" width="94" height="28" rx="14" fill="#F3FFF7" stroke={green}/><circle cx="57" cy="36" r="4" fill={green}/><text x="69" y="40" fontSize="10" fontWeight="800" fill="#148546">Survey</text><circle cx="124" cy="36" r="5" fill="#DDF7E6"/></svg>;
  if (preset === "confidence-badge") return <svg className="h-full w-full" viewBox="0 0 180 70"><circle cx="57" cy="35" r="21" fill="#F4FFF7" stroke="#D9F0E1" strokeWidth="7"/><path d="M57 14A21 21 0 1 1 39 46" stroke={green} strokeWidth="7" strokeLinecap="round"/><text x="45" y="39" fontSize="10" fontWeight="900" fill="#148546">75%</text><rect x="91" y="24" width="47" height="7" rx="3.5" fill="#DFF3E6"/><rect x="91" y="37" width="34" height="7" rx="3.5" fill={green}/></svg>;
  if (preset === "citation-chip") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="43" y="20" width="94" height="31" rx="8" fill="white" stroke={line}/><text x="54" y="43" fontSize="24" fontWeight="900" fill={accent}>“</text><text x="76" y="40" fontSize="9" fontWeight="800" fill={ink}>Smith 2023</text></svg>;
  if (preset === "screenshot-tile") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="53" y="7" width="74" height="56" rx="7" fill="#101827" stroke="#28344A"/><circle cx="61" cy="14" r="2" fill="#FF6B6B"/><circle cx="68" cy="14" r="2" fill="#FFD166"/><circle cx="75" cy="14" r="2" fill="#06D6A0"/><rect x="63" y="26" width="54" height="4" rx="2" fill="#44516A"/><rect x="63" y="36" width="39" height="4" rx="2" fill="#303C52"/><rect x="63" y="46" width="47" height="4" rx="2" fill="#303C52"/></svg>;
  if (preset === "metric-tile" || preset === "metric-card") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="41" y="10" width="98" height="50" rx="10" fill="white" stroke={line}/><text x="53" y="26" fontSize="7" fontWeight="800" fill="#8B909E">ARR</text><text x="53" y="45" fontSize="19" fontWeight="900" fill={ink}>$12.4M</text><text x="103" y="53" fontSize="7" fontWeight="800" fill={green}>↑18%</text></svg>;
  if (preset === "quote-block") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="28" y="11" width="124" height="48" rx="4" fill="#F5F1FF" stroke="#CDC4FF"/><text x="39" y="34" fontSize="23" fontWeight="900" fill={accent}>“</text><rect x="60" y="23" width="73" height="5" rx="2.5" fill="#4C465A" opacity=".65"/><rect x="60" y="35" width="61" height="5" rx="2.5" fill="#4C465A" opacity=".45"/><rect x="103" y="48" width="30" height="4" rx="2" fill="#8E879B"/></svg>;
  if (preset === "status-pill") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="50" y="23" width="80" height="26" rx="13" fill="#F0FFF5" stroke={green}/><circle cx="64" cy="36" r="4" fill={green}/><text x="76" y="40" fontSize="10" fontWeight="800" fill="#148546">On track</text></svg>;
  if (preset === "matrix" || preset === "comparison-matrix" || preset === "source-ledger") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="23" y="10" width="134" height="50" rx="5" fill="white" stroke={line}/><rect x="23" y="10" width="134" height="15" rx="5" fill="#F3F0FF"/><path d="M23 25H157M23 42H157M67 10V60M112 10V60" stroke={line}/></svg>;
  if (preset === "timeline") return <svg className="h-full w-full" viewBox="0 0 180 70"><path d="M18 28H162" stroke="#CFCBE0" strokeWidth="2"/>{[0,1,2,3,4].map((i)=><g key={i}><circle cx={25+i*32} cy="28" r={i===2?6:4.5} fill={i===2?accent:"white"} stroke={i<=2?accent:"#BDB8CD"} strokeWidth={i===2?3:1.5}/><path d={`M${25+i*32} 34V44`} stroke="#D5D1E1"/><rect x={12+i*32} y="44" width="26" height={i===2?16:10} rx="3" fill={i===2?"#EEEAFE":"#F7F6FA"} stroke={i===2?accent:line}/></g>)}</svg>;
  if (preset === "stage-map") return <svg className="h-full w-full" viewBox="0 0 180 70"><path d="M24 36H156" stroke="#CFCBE0" strokeWidth="2"/>{[0,1,2,3,4].map((i)=><g key={i}><circle cx={32+i*29} cy="36" r="8" fill="white" stroke={[accent,blue,green,orange,accent][i]}/><text x={29+i*29} y="39" fontSize="6" fontWeight="800" fill={[accent,blue,green,orange,accent][i]}>{i+1}</text></g>)}</svg>;
  if (preset === "section") return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="21" y="8" width="138" height="54" rx="8" fill="white" stroke={line}/><rect x="32" y="17" width="55" height="6" rx="3" fill="#C7BFFF"/><rect x="32" y="31" width="116" height="21" rx="5" fill="#F6F5FA"/></svg>;
  if (preset === "annotation-callout") return <svg className="h-full w-full" viewBox="0 0 180 70"><path d="M32 12H146Q152 12 152 18V46Q152 52 146 52H83L71 64L68 52H32Q26 52 26 46V18Q26 12 32 12Z" fill="#FFFBEA" stroke="#C8B36A"/><rect x="44" y="24" width="67" height="5" rx="2.5" fill="#A59042" opacity=".55"/><rect x="44" y="36" width="87" height="4" rx="2" fill="#A59042" opacity=".28"/></svg>;

  return <svg className="h-full w-full" viewBox="0 0 180 70"><rect x="22" y="10" width="136" height="50" rx="10" fill="white" stroke={line}/><rect x="34" y="22" width="54" height="6" rx="3" fill="#C9C2FF"/><rect x="34" y="38" width="100" height="5" rx="2.5" fill="#E6E3EF"/></svg>;
}


function RailItem({
  icon,
  label,
  active,
  href,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <div
      className={cn(
        "flex h-[58px] w-[58px] flex-col items-center justify-center gap-1 rounded-[16px] text-[10px] transition-colors",
        active
          ? "bg-[#6B5CFF]/10 text-[#6B5CFF]"
          : "text-zinc-500 hover:bg-white/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : <button type="button" onClick={onClick}>{content}</button>;
}

function ToolButton({ icon, active, onClick, label }: { icon: ReactNode; active?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors",
        active ? "bg-[#6B5CFF]/10 text-[#6B5CFF]" : "text-zinc-600 hover:bg-white/70 dark:text-zinc-300 dark:hover:bg-white/10"
      )}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-7 w-px bg-zinc-200 dark:bg-white/10" />;
}

function CanvasRectangleIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="18" height="18" rx="3.5" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function CanvasCircleIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function CanvasEllipseIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse cx="16" cy="16" rx="11" ry="8" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function CanvasDiamondIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 4.8L27.2 16L16 27.2L4.8 16L16 4.8Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
    </svg>
  );
}

function CanvasTriangleIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 5.5L27 25.5H5L16 5.5Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
    </svg>
  );
}

function CanvasPillIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4.5" y="10" width="23" height="12" rx="6" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  );
}

function CanvasCalloutIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M7.5 7.5H24.5C26.2 7.5 27.5 8.8 27.5 10.5V20C27.5 21.7 26.2 23 24.5 23H18.5L15 27L11.5 23H7.5C5.8 23 4.5 21.7 4.5 20V10.5C4.5 8.8 5.8 7.5 7.5 7.5Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CanvasFrameIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 5V27M24 5V27M5 8H27M5 24H27" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function CanvasNoteIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 5.5H20.5L26.5 11.5V26.5H8V5.5Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M20.5 5.5V11.5H26.5" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
    </svg>
  );
}

function CanvasCardIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6.5" y="7" width="19" height="18" rx="3" stroke="currentColor" strokeWidth="2.1" />
      <path d="M10.5 13H21.5M10.5 18H18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CanvasTableIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5.5" y="6.5" width="21" height="19" rx="2.5" stroke="currentColor" strokeWidth="2.1" />
      <path d="M5.5 13H26.5M12.5 6.5V25.5M19.5 6.5V25.5" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  );
}

function CanvasStraightConnectorIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M7 24L25 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 8H25V13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CanvasCurvedConnectorIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M7 23C9 11 20 21 25 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M20 8H25V13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CanvasElbowConnectorIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 8V20C8 22.2 9.8 24 12 24H24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M20 20L24 24L20 28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CanvasDashIcon({ dash }: { dash: ConnectorDash }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M5 16H27"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={dash === "dotted" ? "1 6" : dash === "dashed" ? "6 5" : undefined}
      />
    </svg>
  );
}

function getConnectorBounds(connector: ConnectorBoundsInput) {
  const padding = 96;
  const minX = Math.min(connector.x1, connector.x2) - padding;
  const minY = Math.min(connector.y1, connector.y2) - padding;
  const maxX = Math.max(connector.x1, connector.x2) + padding;
  const maxY = Math.max(connector.y1, connector.y2) + padding;

  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}
