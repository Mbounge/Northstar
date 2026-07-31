//lib/canvas-artifacts/types.ts
// Northstar Canvas Artifact Contracts v0.7.0 — one authoritative typed DesignAct, deterministic primitive realization, and browser-owned live visual authorship
export const NORTHSTAR_CODE_ARTIFACT_SCHEMA = "northstar.code-artifact.v0.1" as const;
export const NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA =
  "northstar.generated-web-artifact.v0.3" as const;
export const NORTHSTAR_CODE_ARTIFACT_ACTION_SCHEMA =
  "northstar.code-artifact-action.v0.3" as const;
export const NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA =
  "northstar.web-artifact-document.v1" as const;
export const NORTHSTAR_ARTBOARD_MUTATION_SCHEMA =
  "northstar.artboard-mutation.v1" as const;

export type CanvasCodeArtifactStatus = "ready" | "loading" | "error";
export type CanvasCodeArtifactPublicationState = "working" | "verified";
export type NorthstarThinkingDepth = "low" | "medium" | "high";

export type CanvasCodeArtifactBuildPhase =
  | "foundation"
  | "evidence"
  | "analysis"
  | "recommendation"
  | "refinement"
  | "complete";

export interface CanvasCodeArtifactBuildState {
  phase: CanvasCodeArtifactBuildPhase;
  completedSteps: number;
  totalSteps: number;
  message: string;
  isBuilding: boolean;
}

export interface CanvasCodeArtifactStage {
  id: string;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  label: string;
  message: string;
}

export interface NorthstarWebArtifactDocument {
  schema: typeof NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA;
  /** Standard HTML placed inside the isolated artifact body. No script tags. */
  html: string;
  /** Standard scoped foundation CSS. External imports are prohibited. */
  css: string;
  /** Exact independently replaceable authored CSS layers keyed by runtime style ID. */
  cssLayers?: Record<string, string>;
  /** Foundation JavaScript owned by the artifact shell. */
  javascript: string;
  /** Complete cumulative safe interaction module owned by creative authorship. */
  creativeJavascript?: string;
}


export type NorthstarArtboardGeometryIntent =
  | "preserve"
  | "expand-horizontal"
  | "expand-vertical"
  | "expand-both"
  | "recompose"
  | "contract-after-refinement";

export type NorthstarArtboardChangeKind =
  | "content"
  | "structure"
  | "position"
  | "scale"
  | "style"
  | "geometry"
  | "assets";

export type NorthstarRequiredPrimitiveKind =
  | "frame"
  | "evidence-lane"
  | "chart"
  | "sparkline"
  | "axis"
  | "annotation"
  | "relationship"
  | "synthesis"
  | "decision";

export type NorthstarPrimitiveEncoding = "qualitative" | "quantitative";
export type NorthstarPrimitiveConfidence = "observed" | "interpretive";
export type NorthstarPrimitiveRoute = "straight" | "elbow" | "soft-curve";
export type NorthstarPrimitivePriority = "low" | "normal" | "high";

export interface NorthstarPrimitiveDataPoint {
  /** Exact grounded semantic source for this mark. */
  sourceNodeId: string;
  label: string;
  /** Quantitative values are accepted only when valuesGrounded is true. */
  value?: number;
  /** Qualitative ordinal intensity; rendered without pretending to be a measured metric. */
  qualitativeLevel?: "low" | "medium" | "high";
}

export interface NorthstarRequiredPrimitive {
  /**
   * Stable semantic identity and authoritative typed DesignAct specification.
   * The compiler deterministically realizes this specification into DOM operations;
   * it is not a second promise that the model must independently reproduce in HTML.
   */
  id: string;
  kind: NorthstarRequiredPrimitiveKind;
  minimumInstances: number;
  /** Essential bindings may block commit; optional bindings degrade independently. */
  criticality?: "essential" | "optional";
  /** Exact rendered primitive identities. Prefer this over legacy nodeIds. */
  instanceNodeIds?: string[];
  /** Legacy field retained for old model responses. The compiler normalizes it by primitive kind. */
  nodeIds?: string[];
  /** Existing evidence or semantic nodes contained by a frame/evidence lane. */
  memberNodeIds?: string[];
  /** Exact anchors for annotation specifications. */
  anchorNodeIds?: string[];
  sourceNodeIds?: string[];
  targetNodeIds?: string[];
  /** Optional semantic parent. The compiler falls back to the permanent presentation surface. */
  parentNodeId?: string;
  placement?: "frame" | "beneath-flow" | "between-sections" | "anchored-margin" | "routed-overlay" | "synthesis" | "decision";
  label?: string;
  text?: string;
  description?: string;
  encoding?: NorthstarPrimitiveEncoding;
  valuesGrounded?: boolean;
  unit?: string;
  dataPoints?: NorthstarPrimitiveDataPoint[];
  relationshipType?: string;
  route?: NorthstarPrimitiveRoute;
  confidence?: NorthstarPrimitiveConfidence;
  priority?: NorthstarPrimitivePriority;
}

export type NorthstarConstructionBeatKind =
  | "establish-frame"
  | "open-layout"
  | "choreograph-evidence"
  | "draw-analysis"
  | "anchor-annotations"
  | "route-relationships"
  | "reveal-synthesis"
  | "resolve-decision"
  | "settle";

export interface NorthstarConstructionBeat {
  id: string;
  kind: NorthstarConstructionBeatKind;
  label: string;
  nodeIds: string[];
  durationMs: number;
  staggerMs: number;
  holdMs: number;
  emphasis: "quiet" | "normal" | "hero";
}

export interface NorthstarConstructionPlan {
  version: "northstar.live-visual-authorship.v2";
  mode: "cinematic" | "compact";
  beats: NorthstarConstructionBeat[];
  /** Every meaningful semantic node introduced or materially changed by the transaction. */
  coverageNodeIds: string[];
  /** Browser choreography must stage every coverage node before acknowledgement. */
  strictCoverage: boolean;
  totalDurationMs: number;
  /** Hard browser deadline; choreography always settles to the safe final state by this time. */
  deadlineMs: number;
  showBeatLabels: boolean;
}

export type NorthstarArtboardMutationOperation =
  | { op: "set-text"; targetId: string; text: string }
  | { op: "set-html"; targetId: string; html: string }
  | {
      /**
       * Internal compiler primitive for an atomic region replacement that must preserve
       * existing semantic subtrees while rebuilding the surrounding presentation.
       * Model-authored JSON continues to use set-html + move + remove; the compiler
       * coalesces that sequence into this operation after observing the exact browser DOM.
       */
      op: "recompose-region";
      targetId: string;
      html: string;
      placements: Array<{
        targetId: string;
        parentId: string;
        beforeId?: string;
        /** Runtime-added preservation placement; never required from the creative model. */
        runtimeInherited?: boolean;
        /** Preserve the node at its prior artboard-relative geometry when no authored destination survives. */
        preserveGeometry?: boolean;
      }>;
      retireNodeIds?: string[];
    }
  | {
      op: "insert-html";
      targetId: string;
      position: "beforebegin" | "afterbegin" | "beforeend" | "afterend";
      html: string;
    }
  | { op: "remove"; targetId: string }
  | { op: "move"; targetId: string; parentId: string; beforeId?: string }
  | { op: "set-attributes"; targetId: string; attributes: Record<string, string | null> }
  | { op: "set-styles"; targetId: string; styles: Record<string, string | null> }
  | { op: "set-classes"; targetId: string; add?: string[]; remove?: string[] }
  | { op: "set-css-layer"; layerId: string; css: string }
  | { op: "set-runtime-module"; moduleId: string; javascript: string }
  | { op: "request-space"; left?: number; top?: number; right?: number; bottom?: number };


export interface NorthstarSpatialPoint {
  x: number;
  y: number;
}

export interface NorthstarSpatialRect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface NorthstarSpatialNode {
  nodeId: string;
  parentId?: string;
  rect: NorthstarSpatialRect;
  center: NorthstarSpatialPoint;
  ports: Record<"top" | "right" | "bottom" | "left" | "center", NorthstarSpatialPoint>;
  semanticRole?: string;
  evidenceId?: string;
  stage?: string;
}

export interface NorthstarSpatialAudit {
  snapshotRevisionId: string;
  layoutVersion: number;
  unresolvedAnchorIds: string[];
  overlappingAnnotationPairs: Array<[string, string]>;
  annotationTargetOverlapIds: string[];
  clippedAnnotationIds: string[];
  excessiveDistanceIds: string[];
  unresolvedRelationshipIds: string[];
  obstacleIntersectionIds: string[];
  falseIntersectionIds: string[];
  crossingCount: number;
  hardFailureCount: number;
  softIssueCount: number;
}

export interface NorthstarSpatialSnapshot {
  artifactId: string;
  revisionId: string;
  mutationId?: string;
  measuredAt: string;
  artboardBounds: NorthstarSpatialRect;
  nodes: NorthstarSpatialNode[];
  audit: NorthstarSpatialAudit;
  layoutVersion: number;
}

export interface NorthstarArtboardMutationBatch {
  schema: typeof NORTHSTAR_ARTBOARD_MUTATION_SCHEMA;
  mutationId: string;
  sequence: number;
  parentMutationId?: string;
  label: string;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  intent: string;
  visibleChange: string;
  geometryIntent: NorthstarArtboardGeometryIntent;
  transitionMs: number;
  operations: NorthstarArtboardMutationOperation[];
  /** Exact semantic deliverables promised by the authored DesignAct. */
  requiredPrimitives?: NorthstarRequiredPrimitive[];
  /** Browser-owned perceptual choreography over one atomic final transaction. */
  constructionPlan?: NorthstarConstructionPlan;
  /** Asset URLs introduced by this batch. The live runtime registers these before DOM insertion. */
  requiredAssetUrls?: string[];
  /** A progress step cannot complete unless this many non-progress semantic nodes visibly change. */
  minimumMeaningfulChangedNodes?: number;
  /** Text-only changes are reserved for genuinely copy-led acts, never as a generic fallback. */
  allowTextOnly?: boolean;
  requiredChangeKinds?: NorthstarArtboardChangeKind[];
  /** Minimum share of the artboard occupied by meaningfully changed semantic nodes. */
  minimumChangedAreaRatio?: number;
  /** Minimum number of semantic nodes whose browser geometry must move, resize, appear, or disappear. */
  minimumSpatiallyChangedNodes?: number;
  /** Optional stronger movement and resize requirements for compositional design stages. */
  minimumMovedNodes?: number;
  minimumResizedNodes?: number;
  /**
   * `linear-design` means the browser is an execution instrument, not a
   * creative approval authority. It may roll back only an unusable or
   * evidence-corrupting transaction; visual-quality findings remain
   * observations for the next model action.
   */
  executionPolicy?: "legacy-gated" | "linear-design";
  createdAt: string;
}

export interface CanvasCodeArtifactScreenshotData {
  id: string;
  appName: string;
  flowName?: string;
  title: string;
  imageUrl?: string;
  platform?: string;
  sessionType?: string;
  index?: number;
  journeyStage?: string;
  visibleCopy: string[];
  notablePatterns: string[];
  frictionSignals: string[];
  trustSignals: string[];
  opportunities: string[];
  relevance: number;
}

export interface CanvasCodeArtifactFlowData {
  id: string;
  appName: string;
  flowName: string;
  sessionType?: string;
  platform?: string;
  summary: string;
  journeyStages: string[];
  patterns: string[];
  frictionSignals: string[];
  trustSignals: string[];
  openQuestions: string[];
  screenshotIds: string[];
}

export interface CanvasCodeArtifactAppData {
  id: string;
  name: string;
  iconUrl?: string;
  summary: string;
  flowIds: string[];
  patterns: string[];
  strengths: string[];
  risks: string[];
  openQuestions: string[];
}

export interface CanvasCodeArtifactHypothesisData {
  id: string;
  statement: string;
  status: "active" | "supported" | "challenged" | "rejected";
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
}

export interface CanvasCodeArtifactDataBundle {
  version: "northstar.artifact-data.v0.2";
  objective: string;
  audience: string;
  artifactType: string;
  coverageSummary: string;
  apps: CanvasCodeArtifactAppData[];
  flows: CanvasCodeArtifactFlowData[];
  screenshots: CanvasCodeArtifactScreenshotData[];
  hypotheses: CanvasCodeArtifactHypothesisData[];
  decisions: string[];
  corrections: string[];
  openQuestions: string[];
  allowedAssetUrls: string[];
}

export interface NorthstarCreativeBrief {
  editorialThesis: string;
  communicationChallenge: string;
  audienceNeed: string;
  desiredViewerResponse: string;
  centralTension: string;
  evidencePriorities: string[];
  constraints: string[];
  creativeOpportunity: string;
}

export interface NorthstarCreativeScorecard {
  clarity: number;
  grounding: number;
  originality: number;
  usefulness: number;
  craft: number;
  audienceFit: number;
}

export interface NorthstarCreativeConceptStudy {
  document: NorthstarWebArtifactDocument;
  preferredWidth: number;
  preferredHeight: number;
  visualIntent: string;
  evidencePlan: string;
}

export interface NorthstarCreativeConcept {
  id: string;
  name: string;
  oneLine: string;
  medium?: string;
  viewerJob?: string;
  spatialBehavior?: string;
  designActs?: string[];
  visualGrammar: string;
  visualMetaphor: string;
  narrativeArc: string;
  interactionModel: string;
  evidenceStrategy: string;
  compositionLanguage: string;
  typographyMood: string;
  colorLogic: string;
  signature: string[];
  risks: string[];
  study?: NorthstarCreativeConceptStudy;
  renderedStudyFingerprint?: string;
}

export interface NorthstarRejectedCreativeConcept {
  id: string;
  name: string;
  reason: string;
}

export interface NorthstarCreativeDirection {
  runId: string;
  thinkingDepth: NorthstarThinkingDepth;
  diversityKey: string;
  creativeProvocations: string[];
  recentSignaturesAvoided: string[];
  brief: NorthstarCreativeBrief;
  selectedConcept: NorthstarCreativeConcept;
  rejectedConcepts: NorthstarRejectedCreativeConcept[];
  selectionRationale: string;
  selectionScores: NorthstarCreativeScorecard;
  conceptCount: number;
}

export interface NorthstarCreativeReview {
  pass: number;
  accepted: boolean;
  critique: string;
  strengths: string[];
  issues: string[];
  requiredChanges: string[];
  scores: NorthstarCreativeScorecard;
  sourceFingerprint: string;
}

export interface CanvasCodeArtifactIntrinsicBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type NorthstarArtifactViewingMode =
  | "single-frame"
  | "zoom-and-inspect"
  | "scrolling-artboard";

export interface NorthstarArtifactViewingIntent {
  mode: NorthstarArtifactViewingMode;
  primaryNodeIds: string[];
  supportingNodeIds: string[];
  intendedViewerOutcome: string;
  intendedReadingPath: string[];
  preserveAllEvidence: true;
}

export interface NorthstarOuterCanvasPresentationFacts {
  mode: NorthstarArtifactViewingMode;
  intrinsicWidth: number;
  intrinsicHeight: number;
  stableFrameWidth: number;
  stableFrameHeight: number;
  /** Exact intrinsic-source to stable outer-object scale. */
  sourceToOuterScale: number;
  /** Stable outer-object to real Northstar workspace scale. */
  outerToWorkspaceScale: number;
  /** Exact intrinsic-source to real Northstar workspace scale. */
  fitScale: number;
  widthFitScale: number;
  heightFitScale: number;
  minimumPrimaryTextPxAtFit: number;
  minimumSupportingTextPxAtFit: number;
  evidenceNodeCount: number;
  visibleEvidenceNodeCount: number;
  hiddenEvidenceNodeIds: string[];
  partiallyClippedEvidenceNodeIds: string[];
  croppedEvidenceNodeIds: string[];
  minimumEvidenceVisibleRatio: number;
  evidenceAreaRatio: number;
  primaryAreaRatio: number;
  widthGrowthRatio: number;
  heightGrowthRatio: number;
  areaGrowthRatio: number;
  blocksCommit: boolean;
  blockingReasons: string[];
  advisories: string[];
}

export interface CanvasCodeArtifactContentSize {
  artifactId: string;
  revisionId: string;
  measuredAt: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  /** Canonical web artboards use one isolated compiler for every revision; live-observer remains only for legacy payload compatibility. */
  measurementMode?: "live-observer" | "isolated-compiler";
  /** Stable identity for the single geometry transaction owned by one canonical revision. */
  geometryTransactionId?: string;
  /** Canonical compiler pass count. The unbounded first-principles compiler emits exactly one pass. */
  compilerPassCount?: number;
  /** Exact compiler implementation that produced this terminal geometry. */
  geometryCompilerVersion?: string;
  /** Raw model-authored content union, before the runtime surface is derived. */
  authoredContentBounds?: CanvasCodeArtifactIntrinsicBounds;
  /** True for the canonical artboard surface; historical minimum dimensions never constrain its outer Canvas geometry. */
  sourceOwnedSurface?: boolean;
  /** Model-owned viewing mode used by camera-follow and publication review; it does not override measured outer geometry. */
  viewingMode?: NorthstarArtifactViewingMode;
  /** Raw authored-space bounds before the runtime normalizes them into the iframe viewport. */
  contentBounds?: CanvasCodeArtifactIntrinsicBounds;
  sequence?: number;
  settled?: boolean;
  mutationId?: string;
  changedBounds?: CanvasCodeArtifactIntrinsicBounds;
  changedNodeIds?: string[];
  meaningfulChangedNodeIds?: string[];
}

export interface NorthstarCommittedSemanticNode {
  nodeId: string;
  parentId?: string;
  normalizedText: string;
  normalizedAttributes: Record<string, string>;
  normalizedClasses: string[];
  normalizedStyles: Record<string, string>;
  subtreeFingerprint: string;
}

export interface NorthstarLiveSurfaceSnapshot {
  html: string;
  css: string;
  /** Exact authored mutation CSS layers keyed by their runtime style element ID. */
  cssLayers?: Record<string, string>;
  /** Foundation script source retained by the artifact shell. */
  javascript?: string;
  /** Exact cumulative safe interaction module owned by creative authorship. */
  creativeJavascript?: string;
  capturedAt: string;
  semanticNodes?: NorthstarCommittedSemanticNode[];
}

/**
 * Browser-measured evidence ownership for one accepted or rejected candidate.
 *
 * Authored placement is a creative concern. Evidence survival is not: the
 * runtime keeps every expected evidence identity alive and reports any item
 * that is still using temporary inherited geometry as an explicit refinement
 * obligation. Runtime inheritance is never serialized into authored source.
 */
export interface NorthstarEvidenceRegistryReceipt {
  expectedEvidenceIds: string[];
  presentEvidenceIds: string[];
  visibleEvidenceIds: string[];
  runtimeInheritedEvidenceIds: string[];
  unplacedEvidenceIds: string[];
  missingEvidenceIds: string[];
}

export interface NorthstarArtifactMutationAcknowledgement {
  schema: "northstar.artboard-ack.v1";
  /** Stable identity for a speculative proposal. It never becomes lineage by itself. */
  proposalId?: string;
  /** Exact dispatch token echoed by the browser runtime. Never infer this from latest props. */
  ackToken: string;
  /** The browser revision that the proposal was based on. */
  baseRevisionId?: string;
  artifactId: string;
  surfaceId: string;
  revisionId: string;
  /** Exact mounted revision after the transaction terminally settled. */
  browserRevisionId?: string;
  mutationId?: string;
  status: "applied" | "rejected" | "ready";
  reason?: string;
  size?: CanvasCodeArtifactContentSize;
  review?: CanvasCodeArtifactRuntimeReview;
  changedNodeIds: string[];
  meaningfulChangedNodeIds: string[];
  changeKinds: NorthstarArtboardChangeKind[];
  requiredAssetUrls: string[];
  loadedAssetUrls: string[];
  missingAssetUrls: string[];
  evidenceRegistry?: NorthstarEvidenceRegistryReceipt;
  snapshot?: NorthstarLiveSurfaceSnapshot;
  /** Browser-measured time spent restoring the accepted DOM after rejecting this candidate. */
  rollbackDurationMs?: number;
  /** Wall-clock time from candidate staging to its terminal browser decision. */
  candidateDurationMs?: number;
  /** True only when the returned authored snapshot contains no runtime-owned placement state. */
  snapshotSanitized?: boolean;
  acknowledgedAt: string;
}

export interface CanvasCodeArtifactGeometryFacts {
  sourceOwnedSurface: boolean;
  viewingMode: NorthstarArtifactViewingMode;
  viewportWidth: number;
  viewportHeight: number;
  artboardBounds: CanvasCodeArtifactIntrinsicBounds;
  semanticContentBounds: CanvasCodeArtifactIntrinsicBounds;
  occupiedWidthRatio: number;
  occupiedHeightRatio: number;
  unusedSpaceRatio: number;
  rightGutterPx: number;
  bottomGutterPx: number;
  authoredSurfaceCoverageX: number;
  authoredSurfaceCoverageY: number;
  backgroundLeakRisk: boolean;
  outOfBoundsNodeIds: string[];
  clippedSemanticNodeIds: string[];
  evidenceNodeCount: number;
  visibleEvidenceNodeCount: number;
  hiddenEvidenceNodeIds: string[];
  partiallyClippedEvidenceNodeIds?: string[];
  croppedEvidenceNodeIds?: string[];
  minimumEvidenceVisibleRatio?: number;
  primaryNodeIds: string[];
  supportingNodeIds: string[];
  minimumPrimaryTextPx: number;
  minimumSupportingTextPx: number;
  evidenceAreaRatio: number;
  primaryAreaRatio: number;
  integrityFailures: string[];
}

export interface NorthstarPremiumDesignAudit {
  contractVersion?: string;
  designFingerprint?: string;
  ready: boolean;
  requiredNarrativeBeatCount: number;
  realizedNarrativeBeatCount: number;
  missingNarrativeBeatIds: string[];
  requiredCommunicationRoles: string[];
  realizedCommunicationRoles: string[];
  missingCommunicationRoles: string[];
  requiredAnalysisCount: number;
  realizedAnalysisCount: number;
  missingAnalysisIds: string[];
  ungroundedAnalysisIds: string[];
  focalNodeCount: number;
  minimumReadableTextPx: number;
  evidenceRoleDiversity: number;
  repeatedContainerRatio: number;
  renderedStructureFingerprint: string;
  repeatsRecentRenderedStructure: boolean;
  blockingReasons: string[];
  advisories: string[];
}

export interface CanvasCodeArtifactRuntimeReview {
  revisionId: string;
  stageIndex: number;
  evaluatedAt: string;
  rootWidth: number;
  rootHeight: number;
  elementCount: number;
  stageRegionCount: number;
  visibleStageRegionCount: number;
  overflowElementCount: number;
  clippedTextCount: number;
  smallTextCount: number;
  tinyInteractiveCount: number;
  missingImageCount: number;
  pendingImageCount?: number;
  failedAssetUrls?: string[];
  missingRequiredNodeIds?: string[];
  visible?: boolean;
  overflowX?: number;
  overflowY?: number;
  extremeGrowth?: boolean;
  healthy?: boolean;
  documentScrollRisk: boolean;
  summary: string;
  mutationId?: string;
  hardFailureCount?: number;
  requiredAssetCount?: number;
  missingRequiredAssetCount?: number;
  meaningfulChangedNodeCount?: number;
  visualDeltaScore?: number;
  /** Exact browser-measured geometry facts. These constrain execution integrity, never visual style. */
  geometryFacts?: CanvasCodeArtifactGeometryFacts;
  /** Non-blocking cinema or optional analytical-binding issues retained for the next model observation. */
  advisoryDeliveryIssues?: string[];
  changedAreaRatio?: number;
  spatiallyChangedNodeCount?: number;
  movedNodeCount?: number;
  resizedNodeCount?: number;
  addedNodeCount?: number;
  removedNodeCount?: number;
  unusedSpaceRatio?: number;
  /** Runtime-owned evidence survival and remaining authored-placement work. */
  evidenceRegistry?: NorthstarEvidenceRegistryReceipt;
  /** Browser-measured collisions between distinct protected evidence nodes. */
  evidenceCollisionPairs?: Array<[string, string]>;
  /** Browser-measured realization of the model-authored premium narrative contract. */
  premiumDesignAudit?: NorthstarPremiumDesignAudit;
}

export interface NorthstarCreativeLeaseClaim {
  leaseId: string;
  ownerRunId: string;
  surfaceId: string;
  baseRevisionId: string;
  expiresAt: number;
}

export interface NorthstarGeneratedCodeArtifactPackage {
  schema: typeof NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA;
  artifactId: string;
  revisionId: string;
  parentRevisionId?: string;
  title: string;
  description: string;
  objective: string;
  audience: string;
  artifactType: string;
  visualStrategy: string;
  document: NorthstarWebArtifactDocument;
  /** The document is mounted once. Every later visible change is appended here and replayed on that same surface. */
  mutationJournal?: NorthstarArtboardMutationBatch[];
  surfaceId?: string;
  /** Unique token for the browser acknowledgement required before the server may advance. */
  pendingAckToken?: string;
  /** Browser-authoritative scene lease. Competing canonical proposals are rejected client-side. */
  creativeLease?: NorthstarCreativeLeaseClaim;
  /** Legacy fields are retained only so artifacts created by v0.2/v0.3 can still be loaded. */
  sourceTsx?: string;
  compiledJs?: string;
  preferredWidth: number;
  preferredHeight: number;
  /** Stable authored coordinate system. Dynamic Canvas growth never rewrites these base dimensions. */
  layoutBaseWidth?: number;
  layoutBaseHeight?: number;
  intrinsicBounds?: CanvasCodeArtifactIntrinsicBounds;
  minimumWidth: number;
  minimumHeight: number;
  stages: CanvasCodeArtifactStage[];
  dataBundle: CanvasCodeArtifactDataBundle;
  thinkingDepth: NorthstarThinkingDepth;
  creativeDirection?: NorthstarCreativeDirection;
  creativeReviews: NorthstarCreativeReview[];
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
  diagnostics: string[];
  provisional?: boolean;
  publicationState?: CanvasCodeArtifactPublicationState;
}

export interface CanvasCodeArtifactActionEnvelope {
  schema: typeof NORTHSTAR_CODE_ARTIFACT_ACTION_SCHEMA;
  artifactId: string;
  command: "create-or-update" | "advance-stage";
  stageIndex: number;
  /** Fresh design-stage transport. Research/foundation actions omit this. */
  executionMode?: "linear-design";
  package?: NorthstarGeneratedCodeArtifactPackage;
}

export interface CanvasCodeArtifactPayload {
  schema: typeof NORTHSTAR_CODE_ARTIFACT_SCHEMA;
  artifactId: string;
  revisionId: string;
  parentRevisionId?: string;
  title: string;
  description?: string;
  runtimeUrl?: string;
  document?: NorthstarWebArtifactDocument;
  mutationJournal?: NorthstarArtboardMutationBatch[];
  surfaceId?: string;
  pendingAckToken?: string;
  creativeLease?: NorthstarCreativeLeaseClaim;
  sourceTsx?: string;
  compiledJs?: string;
  dataBundle?: CanvasCodeArtifactDataBundle;
  stagePlan?: CanvasCodeArtifactStage[];
  activeStageIndex?: number;
  visualStrategy?: string;
  artifactType?: string;
  audience?: string;
  thinkingDepth?: NorthstarThinkingDepth;
  creativeDirection?: NorthstarCreativeDirection;
  creativeReviews?: NorthstarCreativeReview[];
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
  status: CanvasCodeArtifactStatus;
  createdAt: string;
  updatedAt: string;
  preferredWidth: number;
  preferredHeight: number;
  /** Stable authored coordinate system. Dynamic Canvas growth never rewrites these base dimensions. */
  layoutBaseWidth?: number;
  layoutBaseHeight?: number;
  intrinsicBounds?: CanvasCodeArtifactIntrinsicBounds;
  minimumWidth: number;
  minimumHeight: number;
  buildState: CanvasCodeArtifactBuildState;
  diagnostics?: string[];
  provisional?: boolean;
  publicationState?: CanvasCodeArtifactPublicationState;
}

export interface CanvasCodeArtifactRevisionPatch {
  revisionId?: string;
  parentRevisionId?: string;
  runtimeUrl?: string;
  document?: NorthstarWebArtifactDocument;
  mutationJournal?: NorthstarArtboardMutationBatch[];
  surfaceId?: string;
  pendingAckToken?: string;
  creativeLease?: NorthstarCreativeLeaseClaim;
  sourceTsx?: string;
  compiledJs?: string;
  dataBundle?: CanvasCodeArtifactDataBundle;
  stagePlan?: CanvasCodeArtifactStage[];
  activeStageIndex?: number;
  visualStrategy?: string;
  artifactType?: string;
  audience?: string;
  thinkingDepth?: NorthstarThinkingDepth;
  creativeDirection?: NorthstarCreativeDirection;
  creativeReviews?: NorthstarCreativeReview[];
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
  title?: string;
  description?: string;
  status?: CanvasCodeArtifactStatus;
  preferredWidth?: number;
  preferredHeight?: number;
  layoutBaseWidth?: number;
  layoutBaseHeight?: number;
  intrinsicBounds?: CanvasCodeArtifactIntrinsicBounds;
  minimumWidth?: number;
  minimumHeight?: number;
  buildState?: Partial<CanvasCodeArtifactBuildState>;
  diagnostics?: string[];
  provisional?: boolean;
  publicationState?: CanvasCodeArtifactPublicationState;
}

export function applyCanvasCodeArtifactRevision(
  current: CanvasCodeArtifactPayload,
  patch: CanvasCodeArtifactRevisionPatch,
): CanvasCodeArtifactPayload {
  return {
    ...current,
    ...patch,
    revisionId: patch.revisionId ?? current.revisionId,
    buildState: {
      ...current.buildState,
      ...(patch.buildState ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function createCanvasCodeArtifactPayloadFromPackage(
  packageValue: NorthstarGeneratedCodeArtifactPackage,
  stageIndex = 0,
): CanvasCodeArtifactPayload {
  const now = new Date().toISOString();
  const safeStageIndex = Math.max(
    0,
    Math.min(packageValue.stages.length - 1, Math.round(stageIndex)),
  );
  const stage = packageValue.stages[safeStageIndex];
  const complete = !packageValue.provisional && safeStageIndex >= packageValue.stages.length - 1;

  return {
    schema: NORTHSTAR_CODE_ARTIFACT_SCHEMA,
    artifactId: packageValue.artifactId,
    revisionId: packageValue.revisionId,
    parentRevisionId: packageValue.parentRevisionId,
    title: packageValue.title,
    description: packageValue.description,
    document: packageValue.document,
    mutationJournal: packageValue.mutationJournal ?? [],
    surfaceId: packageValue.surfaceId ?? packageValue.artifactId,
    pendingAckToken: packageValue.pendingAckToken,
    creativeLease: packageValue.creativeLease,
    sourceTsx: packageValue.sourceTsx,
    compiledJs: packageValue.compiledJs,
    dataBundle: packageValue.dataBundle,
    stagePlan: packageValue.stages,
    activeStageIndex: safeStageIndex,
    visualStrategy: packageValue.visualStrategy,
    artifactType: packageValue.artifactType,
    audience: packageValue.audience,
    thinkingDepth: packageValue.thinkingDepth,
    creativeDirection: packageValue.creativeDirection,
    creativeReviews: packageValue.creativeReviews,
    runtimeReview: packageValue.runtimeReview,
    status: complete ? "ready" : "loading",
    createdAt: now,
    updatedAt: now,
    preferredWidth: packageValue.preferredWidth,
    preferredHeight: packageValue.preferredHeight,
    layoutBaseWidth: packageValue.layoutBaseWidth ?? packageValue.preferredWidth,
    layoutBaseHeight: packageValue.layoutBaseHeight ?? packageValue.preferredHeight,
    intrinsicBounds: packageValue.intrinsicBounds ?? {
      minX: 0,
      minY: 0,
      maxX: packageValue.preferredWidth,
      maxY: packageValue.preferredHeight,
    },
    minimumWidth: packageValue.minimumWidth,
    minimumHeight: packageValue.minimumHeight,
    diagnostics: packageValue.diagnostics,
    provisional: packageValue.provisional,
    publicationState: packageValue.publicationState ?? (complete ? "verified" : "working"),
    buildState: {
      phase: complete ? "complete" : stage?.phase ?? "foundation",
      completedSteps: safeStageIndex + 1,
      totalSteps: Math.max(1, packageValue.stages.length),
      message: complete ? "Artifact ready" : stage?.message ?? "Building artifact",
      isBuilding: !complete,
    },
  };
}

export function applyCanvasCodeArtifactStage(
  current: CanvasCodeArtifactPayload,
  stageIndex: number,
): CanvasCodeArtifactPayload {
  const stages = current.stagePlan ?? [];
  if (stages.length === 0) return current;
  const safeStageIndex = Math.max(0, Math.min(stages.length - 1, Math.round(stageIndex)));
  const stage = stages[safeStageIndex];
  const complete = !current.provisional && safeStageIndex >= stages.length - 1;

  return applyCanvasCodeArtifactRevision(current, {
    activeStageIndex: safeStageIndex,
    status: complete ? "ready" : "loading",
    publicationState: complete ? "verified" : "working",
    buildState: {
      phase: complete ? "complete" : stage.phase,
      completedSteps: safeStageIndex + 1,
      totalSteps: stages.length,
      message: complete ? "Artifact ready" : stage.message,
      isBuilding: !complete,
    },
  });
}

function isWebArtifactDocument(value: unknown): value is NorthstarWebArtifactDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NorthstarWebArtifactDocument>;
  return (
    candidate.schema === NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA &&
    typeof candidate.html === "string" &&
    typeof candidate.css === "string" &&
    typeof candidate.javascript === "string"
  );
}


function isArtboardMutationBatch(value: unknown): value is NorthstarArtboardMutationBatch {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NorthstarArtboardMutationBatch>;
  return (
    candidate.schema === NORTHSTAR_ARTBOARD_MUTATION_SCHEMA &&
    typeof candidate.mutationId === "string" &&
    typeof candidate.sequence === "number" &&
    typeof candidate.label === "string" &&
    typeof candidate.intent === "string" &&
    typeof candidate.visibleChange === "string" &&
    typeof candidate.transitionMs === "number" &&
    Array.isArray(candidate.operations)
  );
}

export function isNorthstarGeneratedCodeArtifactPackage(
  value: unknown,
): value is NorthstarGeneratedCodeArtifactPackage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NorthstarGeneratedCodeArtifactPackage>;
  return (
    candidate.schema === NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA &&
    typeof candidate.artifactId === "string" &&
    typeof candidate.revisionId === "string" &&
    typeof candidate.title === "string" &&
    isWebArtifactDocument(candidate.document) &&
    typeof candidate.preferredWidth === "number" &&
    typeof candidate.preferredHeight === "number" &&
    Array.isArray(candidate.stages) &&
    Boolean(candidate.dataBundle) &&
    (candidate.thinkingDepth === "low" ||
      candidate.thinkingDepth === "medium" ||
      candidate.thinkingDepth === "high") &&
    Array.isArray(candidate.creativeReviews) &&
    (candidate.mutationJournal === undefined ||
      (Array.isArray(candidate.mutationJournal) && candidate.mutationJournal.every(isArtboardMutationBatch)))
  );
}

export function isCanvasCodeArtifactActionEnvelope(
  value: unknown,
): value is CanvasCodeArtifactActionEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CanvasCodeArtifactActionEnvelope>;
  return (
    candidate.schema === NORTHSTAR_CODE_ARTIFACT_ACTION_SCHEMA &&
    typeof candidate.artifactId === "string" &&
    (candidate.command === "create-or-update" || candidate.command === "advance-stage") &&
    typeof candidate.stageIndex === "number" &&
    (candidate.executionMode === undefined || candidate.executionMode === "linear-design")
  );
}

export function isCanvasCodeArtifactPayload(
  value: unknown,
): value is CanvasCodeArtifactPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CanvasCodeArtifactPayload>;
  const buildState = candidate.buildState as Partial<CanvasCodeArtifactBuildState> | undefined;
  const hasRuntime =
    typeof candidate.runtimeUrl === "string" ||
    isWebArtifactDocument(candidate.document) ||
    (typeof candidate.compiledJs === "string" && Boolean(candidate.dataBundle));

  return (
    candidate.schema === NORTHSTAR_CODE_ARTIFACT_SCHEMA &&
    typeof candidate.artifactId === "string" &&
    typeof candidate.revisionId === "string" &&
    typeof candidate.title === "string" &&
    hasRuntime &&
    (candidate.status === "ready" ||
      candidate.status === "loading" ||
      candidate.status === "error") &&
    typeof candidate.preferredWidth === "number" &&
    typeof candidate.preferredHeight === "number" &&
    typeof candidate.minimumWidth === "number" &&
    typeof candidate.minimumHeight === "number" &&
    (candidate.mutationJournal === undefined ||
      (Array.isArray(candidate.mutationJournal) && candidate.mutationJournal.every(isArtboardMutationBatch))) &&
    Boolean(buildState) &&
    typeof buildState?.phase === "string" &&
    typeof buildState?.completedSteps === "number" &&
    typeof buildState?.totalSteps === "number" &&
    typeof buildState?.message === "string" &&
    typeof buildState?.isBuilding === "boolean"
  );
}
