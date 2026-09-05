export const CANVAS_V2_ARTIFACT_SCHEMA = "canvas-v2.artifact.v1" as const;
export const CANVAS_V2_OBSERVATION_SCHEMA = "canvas-v2.observation.v1" as const;
export const CANVAS_V2_DECISION_SCHEMA = "canvas-v2.decision.v1" as const;

export interface CanvasV2ArtifactDocument {
  html: string;
  css: string;
  javascript?: string;
}

export const CANVAS_V2_EVIDENCE_PACKET_SCHEMA = "canvas-v2.evidence-packet.v1" as const;

export type CanvasV2EvidenceAuthority = "observed" | "supplied" | "calculated" | "inferred";
export type CanvasV2EvidenceKind =
  | "app-identity"
  | "screenshot"
  | "screenshot-sequence"
  | "marketing-signal"
  | "business-record"
  | "metric"
  | "time-series"
  | "document"
  | "statement"
  | "image";

export interface CanvasV2EvidenceTimeRange {
  start?: string;
  end?: string;
  label?: string;
  timezone?: string;
}

/**
 * Provider-owned provenance. The canvas may present this record, but neither
 * the renderer nor the model may rewrite it into a stronger claim.
 */
export interface CanvasV2EvidenceSource {
  providerId: string;
  providerLabel: string;
  sourceId: string;
  sourceType: "account-app" | "capture" | "marketing-feed" | "business-manifest" | "web-page" | "web-image" | "pdf" | "report" | "uploaded" | "fixture" | "other";
  label: string;
  tenantId?: string;
  workspaceId?: string;
  sourceUrl?: string;
  /** Tracking-free identity used for deduplication and durable citations. */
  canonicalUrl?: string;
  publisher?: string;
  author?: string;
  publishedAt?: string;
  eventAt?: string;
  sourceClass?: "primary" | "official" | "dataset" | "report" | "news" | "analysis" | "community" | "unknown";
  access?: "open" | "partial" | "paywalled" | "inaccessible" | "unknown";
  retrievedAt: string;
  capturedAt?: string;
  timeRange?: CanvasV2EvidenceTimeRange;
  query?: string;
  filters?: Record<string, string | number | boolean>;
  permission?: "authorized" | "limited" | "unavailable";
  freshness?: "live" | "current-snapshot" | "historical" | "unknown";
}

export interface CanvasV2EvidenceFact {
  id: string;
  label: string;
  value: string;
  authority: CanvasV2EvidenceAuthority;
  description?: string;
  sourceAssetIds?: string[];
}

export interface CanvasV2EvidenceMetric {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  format?: "number" | "currency" | "percent" | "duration" | "text";
  definition: string;
  authority: CanvasV2EvidenceAuthority;
  timeRange?: CanvasV2EvidenceTimeRange;
  filters?: Record<string, string | number | boolean>;
  sourceAssetIds?: string[];
}

export interface CanvasV2EvidenceAsset {
  id: string;
  url: string;
  label: string;
  app?: string;
  flow?: string;
  screen?: string;
  description?: string;
  kind?: CanvasV2EvidenceKind;
  authority?: CanvasV2EvidenceAuthority;
  packetId?: string;
  source?: CanvasV2EvidenceSource;
  capturedAt?: string;
  sequenceIndex?: number;
  mimeType?: string;
  tags?: string[];
  limitations?: string[];
}

/**
 * One inspectable unit returned by any authorized evidence provider. Packets
 * retain semantics and provenance separately from their visual rendering so
 * a later model turn can extend the evidence without flattening its lineage.
 */
export interface CanvasV2EvidencePacket {
  schema: typeof CANVAS_V2_EVIDENCE_PACKET_SCHEMA;
  id: string;
  kind: CanvasV2EvidenceKind;
  title: string;
  summary: string;
  authority: CanvasV2EvidenceAuthority;
  source: CanvasV2EvidenceSource;
  assets: CanvasV2EvidenceAsset[];
  facts: CanvasV2EvidenceFact[];
  metrics: CanvasV2EvidenceMetric[];
  limitations: string[];
  tags: string[];
  createdAt: string;
  appId?: string;
  appName?: string;
  continuationKey?: string;
  parentPacketIds?: string[];
  /**
   * Research memory and canvas presentation are deliberately separate. Most
   * external sources remain graph-only; only a bounded material witness earns
   * visible canvas space.
   */
  presentation?: {
    state: "graph-only" | "candidate" | "promoted";
    materiality: number;
    reason: string;
  };
}

export type CanvasV2RevisionState = "candidate" | "committed";

export interface CanvasV2ArtifactRevision {
  schema: typeof CANVAS_V2_ARTIFACT_SCHEMA;
  id: string;
  parentId?: string;
  state: CanvasV2RevisionState;
  document: CanvasV2ArtifactDocument;
  evidence: CanvasV2EvidenceAsset[];
  /** Durable provider packets that ground the visible evidence objects. */
  evidencePackets?: CanvasV2EvidencePacket[];
  /**
   * Revision-owned discovery memory. Keeping it beside the document makes
   * evidence lineage, contradictions, and human corrections travel through
   * the same atomic undo/redo history as the visible canvas.
   */
  discoveryGraph?: import("@/lib/canvas-v2/discovery-graph").CanvasV2DiscoveryGraph;
  /**
   * Inquiry-level understanding and next-move memory. This is deliberately
   * distinct from the evidence graph: the graph remembers source truth while
   * the discovery state remembers what North Star currently believes the
   * inquiry is trying to accomplish and how that understanding evolved.
   */
  discoveryState?: import("@/lib/canvas-v2/discovery-state").CanvasV2DiscoveryState;
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
  /** Number of distinct rendered text lines for a leaf text node. */
  textLineCount?: number;
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

export interface CanvasV2PlacementOccupantObservation {
  nodeId: string;
  parentNodeId?: string;
  kind: "frame" | "group" | "island" | "text" | "image" | "shape" | "table" | "evidence" | "object";
  owner: "user" | "northstar" | "research";
  userEdited: boolean;
  locked: boolean;
  canonicalEvidence: boolean;
  bounds: CanvasV2ElementBounds;
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
  geometryStartLocalPoint?: { x: number; y: number };
  geometryMidLocalPoint?: { x: number; y: number };
  geometryEndLocalPoint?: { x: number; y: number };
  /** Exact local-space endpoints that attach the authored path to the measured objects. */
  geometrySuggestedStartLocalPoint?: { x: number; y: number };
  geometrySuggestedEndLocalPoint?: { x: number; y: number };
  geometryOrientation?: "forward" | "reversed";
  sourceAnchorNodeId?: string;
  targetAnchorNodeId?: string;
  sourceAnchorDistance?: number;
  targetAnchorDistance?: number;
  sourceAnchorTolerance?: number;
  targetAnchorTolerance?: number;
  /** Distance an endpoint penetrates inside the referenced object's box. */
  sourceAnchorInteriorDepth?: number;
  targetAnchorInteriorDepth?: number;
  sourceAnchorBounds?: CanvasV2ElementBounds;
  targetAnchorBounds?: CanvasV2ElementBounds;
  sourceAnchorSuggestedPoint?: { x: number; y: number };
  targetAnchorSuggestedPoint?: { x: number; y: number };
  /** Shortest rendered-space movement that returns the target endpoint to its perimeter. */
  targetAnchorEscapeDelta?: { x: number; y: number };
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
  /** Union of rendered, meaningful leaf content inside the island. This excludes layout wrappers whose empty height can conceal a visual gulf between chapters. */
  contentBounds?: CanvasV2ElementBounds;
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
  /** Every top-level object intersecting this zone, including manual objects. */
  occupantNodeIds?: string[];
  /** Human-owned objects are immutable placement obstacles for Northstar. */
  userOwnedNodeIds?: string[];
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
  /** Complete top-level world-space occupancy used for multiplayer placement. */
  placementOccupants?: CanvasV2PlacementOccupantObservation[];
  zones: CanvasV2SurfaceZoneObservation[];
}

export interface CanvasV2SpatialObservation {
  measuredNodeCount: number;
  reportedNodeCount: number;
  nodes: CanvasV2SpatialNodeObservation[];
  notableIntersections: CanvasV2SpatialIntersection[];
  /** Rendered leaf-text collisions inside the same authored region. */
  textCollisions?: CanvasV2SpatialIntersection[];
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
