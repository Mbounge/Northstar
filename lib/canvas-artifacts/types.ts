//lib/canvas-artifacts/types.ts
// Northstar Canvas Artifact Contracts v0.5.2.3 — one authoritative live surface, browser acknowledgements, granular mutations, and measured geometry
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
  /** Standard scoped CSS. External imports are prohibited. */
  css: string;
  /** Optional vanilla JavaScript executed after the HTML is mounted. */
  javascript: string;
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

export type NorthstarArtboardMutationOperation =
  | { op: "set-text"; targetId: string; text: string }
  | { op: "set-html"; targetId: string; html: string }
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
  /** Asset URLs introduced by this batch. The live runtime registers these before DOM insertion. */
  requiredAssetUrls?: string[];
  /** A progress step cannot complete unless this many non-progress semantic nodes visibly change. */
  minimumMeaningfulChangedNodes?: number;
  /** Text-only changes are reserved for genuinely copy-led acts, never as a generic fallback. */
  allowTextOnly?: boolean;
  requiredChangeKinds?: NorthstarArtboardChangeKind[];
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

export interface CanvasCodeArtifactContentSize {
  artifactId: string;
  revisionId: string;
  measuredAt: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
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
  capturedAt: string;
  semanticNodes?: NorthstarCommittedSemanticNode[];
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
  snapshot?: NorthstarLiveSurfaceSnapshot;
  acknowledgedAt: string;
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
  documentScrollRisk: boolean;
  summary: string;
  mutationId?: string;
  hardFailureCount?: number;
  requiredAssetCount?: number;
  missingRequiredAssetCount?: number;
  meaningfulChangedNodeCount?: number;
  visualDeltaScore?: number;
  unusedSpaceRatio?: number;
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
    typeof candidate.stageIndex === "number"
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
