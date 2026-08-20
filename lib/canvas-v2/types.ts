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
  /** The atomic object delta that produced this revision, when applicable. */
  sceneTransaction?: import("@/lib/canvas-v2/scene-transaction").CanvasV2SceneTransaction;
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
  canvasWidthShare?: number;
  canvasHeightShare?: number;
  canvasAreaShare?: number;
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

/** Factual placement of one top-level model-authored analytical region. */
export interface CanvasV2DesignRegionObservation {
  nodeId: string;
  /** Compiler-owned stable identity for this independently editable island. */
  islandId?: string;
  /** Stable narrative function of this island in the whole-board story. */
  storyRole?: CanvasV2IslandStoryRole;
  label?: string;
  visualRole?: string;
  /** Model-declared whole-board placement, observed again after render. */
  placementMode?: "attached" | "evidence-relative-island" | "interleaved" | "recompose";
  /** Model-declared relationship to its narrative anchor, observed after render. */
  territoryRelation?: CanvasV2TerritoryRelation;
  targetZoneId?: CanvasV2SurfaceZoneId;
  textPreview?: string;
  bounds: CanvasV2ElementBounds;
  canvasWidthShare: number;
  canvasHeightShare: number;
  canvasAreaShare: number;
  centerXShare: number;
  centerYShare: number;
  edgeSpace: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  contentOverflowX: number;
  contentOverflowY: number;
  clipsOverflow: boolean;
  /** Model-declared sequence stages that claim direct screenshot grounding. */
  sourcedStageCount?: number;
  /** Sourced stage nodes that rendered without their exact analytical evidence copy. */
  emptySourcedStageNodeIds?: string[];
  /** Explicit model-authored intent for a region that deliberately enters canonical evidence territory. */
  evidenceInterleave?: string;
  /** Factual intersections with immutable canonical lane containers. */
  canonicalLaneOverlaps?: Array<{
    laneNodeId: string;
    intersection: CanvasV2ElementBounds;
    regionCoverage: number;
    laneCoverage: number;
  }>;
}

export type CanvasV2SurfaceZoneId =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type CanvasV2IslandAction = "create" | "develop" | "enrich" | "repair" | "recompose" | "complete";
export type CanvasV2IslandStoryRole = "title" | "orientation" | "evidence-reading" | "comparison" | "analysis" | "relationship" | "implication" | "synthesis" | "whole-board";

/**
 * Server-compiled transaction for one island turn. This is execution truth,
 * not a second creative brief: it lets a rejected candidate be rebuilt against
 * the same stable island, evidence assignment, and promised territory instead
 * of asking the next repair pass to rediscover an uncommitted identity.
 */
export interface CanvasV2IslandExecutionContract {
  target: {
    action: CanvasV2IslandAction;
    islandId: string;
    storyRole: CanvasV2IslandStoryRole;
    resultingMaturity: "developing" | "resolved" | "unchanged";
    resolutionRationale: string;
    openRequirements: string[];
  };
  territory: {
    relation: CanvasV2TerritoryRelation;
    anchorNodeId: string;
    intendedFootprint: string;
    rationale: string;
    placementMode: NonNullable<CanvasV2DesignRegionObservation["placementMode"]>;
    targetZoneId: CanvasV2SurfaceZoneId;
  };
  requiredEvidenceIds: string[];
  requiredEvidenceHandles: string[];
  requiredVisualRoles: string[];
  /**
   * Exact server-validated visual-director checkpoint for this transaction.
   * Hidden render repair reuses it instead of asking the visual director to
   * reinterpret an already-authored, still-uncommitted island.
   */
  directorCheckpointJson?: string;
}

/** Compact factual/model-memory record for one independently targetable island. */
export interface CanvasV2IslandRegistryEntry {
  islandId: string;
  nodeId: string;
  storyRole: CanvasV2IslandStoryRole;
  label?: string;
  purpose: string;
  maturity: "foundation" | "developing" | "resolved";
  /** Model-owned explanation of why this island is open or demonstrably complete. */
  resolutionRationale?: string;
  /** Prompt-critical information the visual director still expects this island to communicate. */
  openRequirements: string[];
  /** Evidence selected while developing this island and therefore required to remain inside it. */
  requiredEvidenceIds: string[];
  /** Required evidence that is no longer materially present inside the rendered island. */
  missingRequiredEvidenceIds: string[];
  placementMode?: CanvasV2DesignRegionObservation["placementMode"];
  targetZoneId?: CanvasV2SurfaceZoneId;
  visualRole?: string;
  bounds: CanvasV2ElementBounds;
  centerXShare: number;
  centerYShare: number;
  canvasAreaShare: number;
  evidenceIds: string[];
  annotationNodeIds: string[];
  relationshipNodeIds: string[];
  textPreview?: string;
}

/** A factual coarse cell in the complete canvas. It describes occupancy, never quality. */
export interface CanvasV2SurfaceZoneObservation {
  id: CanvasV2SurfaceZoneId;
  bounds: CanvasV2ElementBounds;
  designRegionNodeIds: string[];
  canonicalLaneNodeIds: string[];
  occupiedAreaShare: number;
  availableAreaShare: number;
}

/** Whole-board geometry supplied to the model so it can compose beyond one local crop. */
export interface CanvasV2AuthoredSurfaceObservation {
  canvasBounds: CanvasV2ElementBounds;
  authoredBounds?: CanvasV2ElementBounds;
  authoredAreaShare: number;
  readingOrder: string[];
  primaryRegionNodeId?: string;
  leftmostRegionNodeId?: string;
  rightmostRegionNodeId?: string;
  topmostRegionNodeId?: string;
  bottommostRegionNodeId?: string;
  canonicalLaneBounds?: CanvasV2ElementBounds;
  analysisEvidenceBounds?: CanvasV2ElementBounds;
  zones: CanvasV2SurfaceZoneObservation[];
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
  designRegions?: CanvasV2DesignRegionObservation[];
  authoredSurface?: CanvasV2AuthoredSurfaceObservation;
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
    centerXShare: number;
    centerYShare: number;
    canvasAreaShare: number;
    readingIndex: number;
    visualRole?: string;
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

export type CanvasV2TerritoryRelation =
  | "within"
  | "above"
  | "below"
  | "left"
  | "right"
  | "span"
  | "interleave"
  | "offset"
  | "recompose"
  | "none";

/**
 * Compact model-owned continuity memory. It records the composition the model
 * intends to preserve and develop; it is not a runtime-authored layout plan or
 * an aesthetic score.
 */
export interface CanvasV2CompositionState {
  dominantAnchor: string;
  readingOrder: string[];
  regions: Array<{
    nodeId: string;
    islandId?: string;
    storyRole?: CanvasV2IslandStoryRole;
    purpose: string;
    maturity: "foundation" | "developing" | "resolved";
    resolutionRationale?: string;
    openRequirements?: string[];
    requiredEvidenceIds?: string[];
    placementMode?: CanvasV2DesignRegionObservation["placementMode"];
    targetZoneId?: CanvasV2SurfaceZoneId;
  }>;
  preservedNodeIds: string[];
  retiredNodes: Array<{
    nodeId: string;
    reason: string;
    replacementNodeId?: string;
  }>;
  preservedStrengths: string[];
  nextTerritory: {
    relation: CanvasV2TerritoryRelation;
    anchorNodeId: string;
    intendedFootprint: string;
    rationale: string;
  };
  regressionRisks: string[];
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
    compositionState?: CanvasV2CompositionState;
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
  compositionState?: CanvasV2CompositionState;
  reflection: CanvasV2RenderedReflection;
  document: CanvasV2ArtifactDocument;
  summary: string;
  expectedVisualResult: string;
  /** Compiler-owned repair lineage for the exact island mutation. */
  islandExecution?: CanvasV2IslandExecutionContract;
  /** Compiler-authored object transaction consumed by the shared canvas authority. */
  sceneTransaction?: import("@/lib/canvas-v2/scene-transaction").CanvasV2SceneTransaction;
}

export interface CanvasV2CompleteDecision {
  schema: typeof CANVAS_V2_DECISION_SCHEMA;
  decision: "complete";
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  compositionState?: CanvasV2CompositionState;
  reflection: CanvasV2RenderedReflection;
  summary: string;
}

export interface CanvasV2ResearchDecision {
  schema: typeof CANVAS_V2_DECISION_SCHEMA;
  decision: "research";
  moveKind: "research";
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  compositionState?: CanvasV2CompositionState;
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
