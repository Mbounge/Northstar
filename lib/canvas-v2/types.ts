export const CANVAS_V2_ARTIFACT_SCHEMA = "canvas-v2.artifact.v1" as const;
export const CANVAS_V2_OBSERVATION_SCHEMA = "canvas-v2.observation.v1" as const;
export const CANVAS_V2_DECISION_SCHEMA = "canvas-v2.decision.v1" as const;

export interface CanvasV2ArtifactDocument {
  html: string;
  css: string;
  javascript?: string;
}

export interface CanvasV2EvidenceAsset {
  id: string;
  url: string;
  label: string;
  app?: string;
  flow?: string;
  screen?: string;
  description?: string;
}

export type CanvasV2RevisionState = "candidate" | "committed";

export interface CanvasV2ArtifactRevision {
  schema: typeof CANVAS_V2_ARTIFACT_SCHEMA;
  id: string;
  parentId?: string;
  state: CanvasV2RevisionState;
  document: CanvasV2ArtifactDocument;
  evidence: CanvasV2EvidenceAsset[];
  createdAt: string;
}

export interface CanvasV2RuntimeError {
  message: string;
  stack?: string;
}

export interface CanvasV2ElementBounds {
  nodeId?: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasV2SpatialNodeObservation {
  nodeId: string;
  parentNodeId?: string;
  tagName: string;
  textPreview?: string;
  bounds: CanvasV2ElementBounds;
  contentBox: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
  };
  layout: {
    display: string;
    position: string;
    zIndex: string;
    fontSize?: string;
    lineHeight?: string;
    letterSpacing?: string;
    textAlign?: string;
    whiteSpace?: string;
    gap?: string;
    gridTemplateColumns?: string;
    alignItems?: string;
    justifyContent?: string;
    overflowX: string;
    overflowY: string;
  };
}

export interface CanvasV2SpatialIntersection {
  firstNodeId: string;
  secondNodeId: string;
  intersection: CanvasV2ElementBounds;
  firstCoverage: number;
  secondCoverage: number;
}

export type CanvasV2EvidenceRole = "canonical" | "analysis-copy" | "reference";

/** Rendered facts for one grounded image. These protect evidence integrity, not aesthetics. */
export interface CanvasV2EvidenceRenderObservation {
  evidenceId: string;
  nodeId: string;
  role: CanvasV2EvidenceRole;
  sourceNodeId?: string;
  bounds: CanvasV2ElementBounds;
  naturalWidth: number;
  naturalHeight: number;
  objectFit: string;
  visible: boolean;
  clippingAncestorNodeIds: string[];
  croppingRisk: boolean;
  aspectRatioDistorted: boolean;
  /** Factual composition geometry for analysis copies. These are not aesthetic scores. */
  sourceIsCanonicalScreen?: boolean;
  canonicalPeerHeight?: number;
  scaleVsCanonicalHeight?: number;
  artboardWidthShare?: number;
  artboardHeightShare?: number;
  artboardAreaShare?: number;
  designRegionNodeId?: string;
  designRegionWidthShare?: number;
  designRegionHeightShare?: number;
  designRegionAreaShare?: number;
  visualRole?: string;
  treatment?: string;
  annotationNodeIds?: string[];
  relationshipNodeIds?: string[];
}

export interface CanvasV2AuthoredRelationshipObservation {
  nodeId: string;
  tagName: string;
  sourceNodeIds: string[];
  targetNodeIds: string[];
  bounds: CanvasV2ElementBounds;
  visualRole?: string;
  geometryStartPoint?: { x: number; y: number };
  geometryEndPoint?: { x: number; y: number };
  geometryOrientation?: "forward" | "reversed";
  sourceAnchorNodeId?: string;
  targetAnchorNodeId?: string;
  sourceAnchorDistance?: number;
  targetAnchorDistance?: number;
  sourceAnchorTolerance?: number;
  targetAnchorTolerance?: number;
  geometrySpan?: number;
  missingSourceNodeIds?: string[];
  missingTargetNodeIds?: string[];
}

export interface CanvasV2AuthoredAnnotationObservation {
  nodeId: string;
  targetNodeIds: string[];
  bounds: CanvasV2ElementBounds;
  textPreview?: string;
}

export interface CanvasV2SpatialObservation {
  measuredNodeCount: number;
  reportedNodeCount: number;
  nodes: CanvasV2SpatialNodeObservation[];
  notableIntersections: CanvasV2SpatialIntersection[];
  contentOverflowNodeIds: string[];
  evidence: CanvasV2EvidenceRenderObservation[];
  authoredRelationships?: CanvasV2AuthoredRelationshipObservation[];
  authoredAnnotations?: CanvasV2AuthoredAnnotationObservation[];
}

export interface CanvasV2RenderObservation {
  schema: typeof CANVAS_V2_OBSERVATION_SCHEMA;
  revisionId: string;
  screenshotDataUrl: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  contentBounds: CanvasV2ElementBounds;
  runtimeErrors: CanvasV2RuntimeError[];
  missingEvidenceIds: string[];
  overflow?: CanvasV2ElementBounds[];
  railDetails?: Array<{
    laneNodeId: string;
    label: string;
    startIndex: number;
    endIndex: number;
    screenshotDataUrl: string;
  }>;
  designDetails?: Array<{
    nodeId: string;
    label: string;
    width: number;
    height: number;
    screenshotDataUrl: string;
  }>;
  spatial: CanvasV2SpatialObservation;
  capturedAt: string;
}

export type CanvasV2CreativeMoveKind =
  | "research"
  | "framing"
  | "composition"
  | "relationship"
  | "analysis"
  | "refinement";

/**
 * The model's evolving visual point of view for one run. This is deliberately
 * descriptive rather than a runtime plan or an aesthetic score: the model may
 * revise it after every exact render.
 */
export interface CanvasV2CreativeDirection {
  designIntent: string;
  visualThesis: string;
  compositionStrategy: string;
  visualLanguage: string;
  evidenceStrategy: string;
  currentFocus: string;
  unresolvedOpportunities: string[];
  nextMoves: string[];
}

/** A concise model-authored reading of the visible render it just inspected. */
export interface CanvasV2RenderedReflection {
  observedResult: string;
  remainingOpportunity: string;
  conceptRead: string;
  hierarchyRead: string;
  evidenceRead: string;
  relationshipRead: string;
  legibilityRead: string;
  distinctivenessRead: string;
  nextMoveReason: string;
}

/** The model's explicit spatial intent. Measurements inform it; the runtime never authors it. */
export interface CanvasV2SpatialStrategy {
  growthDirection: "stable" | "horizontal" | "vertical" | "both";
  layoutSystem: string;
  primaryAnchor: string;
  hierarchyAndScale: string;
  spacingRhythm: string;
  relationshipLogic: string;
  currentAdjustment: string;
  intentionalOverlaps: string[];
}

export interface CanvasV2DesignTurnInput {
  instruction: string;
  revision: CanvasV2ArtifactRevision;
  observation: CanvasV2RenderObservation;
  previousStep?: {
    summary: string;
    observation: CanvasV2RenderObservation;
  };
  run?: {
    turn: number;
    creativeDirection?: CanvasV2CreativeDirection;
    spatialStrategy?: CanvasV2SpatialStrategy;
    priorSteps: Array<{
      revisionId: string;
      kind?: "research" | "design";
      moveKind?: CanvasV2CreativeMoveKind;
      summary: string;
      expectedVisualResult: string;
      reflection?: CanvasV2RenderedReflection;
    }>;
  };
}

export interface CanvasV2EditDecision {
  schema: typeof CANVAS_V2_DECISION_SCHEMA;
  decision: "edit";
  moveKind: Exclude<CanvasV2CreativeMoveKind, "research">;
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  reflection: CanvasV2RenderedReflection;
  document: CanvasV2ArtifactDocument;
  summary: string;
  expectedVisualResult: string;
}

export interface CanvasV2CompleteDecision {
  schema: typeof CANVAS_V2_DECISION_SCHEMA;
  decision: "complete";
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  reflection: CanvasV2RenderedReflection;
  summary: string;
}

export interface CanvasV2ResearchDecision {
  schema: typeof CANVAS_V2_DECISION_SCHEMA;
  decision: "research";
  moveKind: "research";
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  reflection: CanvasV2RenderedReflection;
  appId: string;
  flowId: string;
  summary: string;
  expectedVisualResult: string;
}

export type CanvasV2DesignDecision =
  | CanvasV2EditDecision
  | CanvasV2ResearchDecision
  | CanvasV2CompleteDecision;
