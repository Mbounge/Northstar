// app/api/canvas-ai/route.ts
// Northstar Canvas v0.4.8.2 — one browser-authoritative living artboard, acknowledged after every visible mutation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  NORTHSTAR_AGENT_TOOL_NAMES,
  NORTHSTAR_DATA_TOOL_NAMES,
  CANVAS_ACTION_TOOL_NAMES,
  getToolRegistryPromptSummary,
  isCanvasActionTool,
  type CanvasActionToolName,
  type NorthStarAgentToolName,
  type NorthStarDataToolName,
  type NorthStarToolArguments,
  type NorthStarToolResultView,
} from "@/lib/canvas-ai/northstar-tool-registry";
import {
  getNorthstarArtifactSourceDiagnostics,
  createNorthstarWorkingArtifactPackage,
  createNorthstarWorkingMutationPackage,
  prepareNorthstarConceptStudyDocument,
  prepareNorthstarArtboardRevisionForPublication,
} from "@/lib/canvas-ai/northstar-code-artifact";
import {
  NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
  appendNorthstarArtboardMutation,
  repairNorthstarArtboardMutationDraft,
  buildDeterministicNorthstarPublicationDraft,
  buildNorthstarArtboardMutationModelInput,
  buildNorthstarArtboardMutationSystemInstruction,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import {
  NORTHSTAR_CREATIVE_CRITIQUE_JSON_SCHEMA,
  NORTHSTAR_CREATIVE_EXPLORATION_JSON_SCHEMA,
  NORTHSTAR_CREATIVE_SELECTION_JSON_SCHEMA,
  buildCreativeCritiqueModelInput,
  buildCreativeCritiqueSystemInstruction,
  buildCreativeDirection,
  buildCreativeExplorationModelInput,
  buildCreativeExplorationSystemInstruction,
  buildCreativeSelectionModelInput,
  buildCreativeSelectionSystemInstruction,
  createCreativeDiversityContext,
  creativeBudgetForThinkingDepth,
  deterministicCreativeDirection,
  sanitizeCreativeCritique,
  sanitizeCreativeExploration,
  buildNorthstarDesignBehaviorAddendum,
  NORTHSTAR_DYNAMIC_DESIGN_MOVE_JSON_SCHEMA,
  buildNorthstarDynamicDesignMoveModelInput,
  buildNorthstarDynamicDesignMoveSystemInstruction,
  sanitizeNorthstarDynamicDesignMove,
  fingerprintSource,
  type NorthstarCreativeCritiqueDraft,
  type NorthstarCreativeExplorationDraft,
  type NorthstarCreativeSelectionDraft,
  type NorthstarDynamicDesignMoveDraft,
  type NorthstarProgressiveDesignAct,
} from "@/lib/canvas-ai/northstar-design-intelligence";
import {
  loadNorthstarDesignReferenceParts,
  NORTHSTAR_VISUAL_DNA,
} from "@/lib/canvas-ai/northstar-design-reference-pack";
import { captureNorthstarArtifactPng } from "@/lib/canvas-ai/northstar-render-capture";
import { getNorthstarArtifactAcknowledgement, waitForNorthstarArtifactAcknowledgement } from "@/lib/canvas-ai/northstar-artboard-ack";
import { NorthstarArtboardActor } from "@/lib/canvas-ai/northstar-artboard-actor";
import { compileNorthstarMutationDraft } from "@/lib/canvas-ai/northstar-mutation-compiler";
import {
  NORTHSTAR_CODE_ARTIFACT_ACTION_SCHEMA,
  NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
  type CanvasCodeArtifactDataBundle,
  type CanvasCodeArtifactIntrinsicBounds,
  type CanvasCodeArtifactRuntimeReview,
  type CanvasCodeArtifactStage,
  type NorthstarArtifactMutationAcknowledgement,
  type NorthstarArtboardMutationBatch,
  type NorthstarCreativeDirection,
  type NorthstarCreativeReview,
  type NorthstarGeneratedCodeArtifactPackage,
  type NorthstarWebArtifactDocument,
} from "@/lib/canvas-artifacts/types";
import {
  executeNorthStarDataTool,
  loadNorthStarDataCatalog,
  resolveNorthStarTenantId,
  type NorthStarDataCatalog,
  type NorthStarDataApp,
  type NorthStarDataFlow,
  type NorthStarDataScreen,
  selectNorthStarReferenceFlows,
} from "@/lib/canvas-ai/northstar-data-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_CONTEXT_CHARACTERS = 3_500_000;
const MAX_CONVERSATION_SUMMARY_LENGTH = 32_000;
const MAX_VISUALS = 4;
const MAX_VISUAL_BYTES = 5 * 1024 * 1024;
const MAX_AGENT_STEPS = 40;
const MAX_COMPOSITION_EVIDENCE = 160;
const COMPOSITION_VISUAL_BATCH_MAX = 15;
const COMPOSITION_VISUAL_BATCH_MIN = 10;
const MAX_COMPOSITION_CHECKPOINT_SCREENS = 180;
const MAX_COMPOSITION_RESEARCH_ROUNDS = 3;
const MAX_COMPOSITION_BLUEPRINT_REVISIONS = 3;

type ContextMode = "canvas" | "selection";
type AgentMode = "direct" | "agent";
type InteractionFocus = "conversation" | "attachment" | "canvas" | "selection" | "northstar-data" | "hybrid";
type ExecutionDepth = "quick" | "balanced" | "deep";
type ThinkingDepth = "low" | "medium" | "high";
type ArtifactType =
  | "comparison-board"
  | "journey-map"
  | "screenshot-analysis"
  | "strategy-board"
  | "research-map"
  | "roadmap"
  | "causal-map"
  | "storyboard"
  | "dashboard"
  | "operating-model"
  | "market-map"
  | "decision-tree"
  | "design-board"
  | "workflow"
  | "product-concept"
  | "freeform";
type WorkingVisibility = "visible" | "compact" | "hidden";
type ArtifactAudience =
  | "general"
  | "executive"
  | "product"
  | "design"
  | "research"
  | "operations"
  | "sales"
  | "marketing";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type HistoryToolContextEntry = {
  messageId: string;
  planTitle?: string;
  tool: string;
  detail?: string;
  resultView?: NorthStarToolResultView;
};

type CanvasAIRequestBody = {
  message?: unknown;
  contextMode?: unknown;
  canvasContext?: unknown;
  selectedCanvasContext?: unknown;
  history?: unknown;
  historyToolContext?: unknown;
  conversationSummary?: unknown;
  attachments?: unknown;
  historyAttachments?: unknown;
  thinkingDepth?: unknown;
  compositionCheckpoint?: unknown;
};

type GeminiPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    };

type CanvasAIReference = {
  objectIds: string[];
  label: string;
  reason?: string;
};

type CanvasAISuggestedAction = {
  type: string;
  targetObjectIds: string[];
  description: string;
};

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

type AgentToolName = NorthStarAgentToolName;

type PlannerStep = {
  id: string;
  label: string;
  tool: AgentToolName;
  icon: CanvasAIActivityIcon;
  arguments?: NorthStarToolArguments;
};

type PlannerResponse = {
  mode: AgentMode;
  focus: InteractionFocus;
  title: string;
  steps: PlannerStep[];
};

type SemanticIntentKind =
  | "conversation"
  | "attachment"
  | "canvas-inspection"
  | "selection-inspection"
  | "northstar-data"
  | "canvas-action"
  | "hybrid";

type SemanticDataEntity =
  | "none"
  | "apps"
  | "app"
  | "flows"
  | "flow"
  | "screenshots"
  | "screenshot"
  | "app-icon";

type SemanticCanvasOperation =
  | "none"
  | "inspect"
  | "create-shape"
  | "create-text"
  | "create-note"
  | "create-connector"
  | "insert-app-icon"
  | "insert-screenshot"
  | "insert-flow"
  | "move"
  | "update-style"
  | "resize"
  | "rotate"
  | "update-text"
  | "duplicate"
  | "delete"
  | "arrange"
  | "align"
  | "distribute"
  | "select"
  | "focus"
  | "compose";

type SemanticIntentDecision = {
  kind: SemanticIntentKind;
  target: "conversation" | "chat" | "canvas" | "selection" | "attachment";
  requiresTools: boolean;
  objective: string;
  confidence: number;
  resumeActiveRun?: boolean;
  data?: {
    entity: SemanticDataEntity;
    appName?: string;
    flowName?: string;
    screenshotId?: string;
    query?: string;
    platform?: "mobile" | "web";
    sessionType?: "onboarding" | "browsing";
    limit?: number;
  };
  canvas?: {
    operation: SemanticCanvasOperation;
    shape?: "rect" | "ellipse" | "circle" | "diamond" | "triangle" | "pill" | "callout" | "card" | "frame";
    text?: string;
    targetQuery?: string;
    fromQuery?: string;
    toQuery?: string;
    width?: number;
    height?: number;
    scale?: number;
    rotation?: number;
    rotationDelta?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    textColor?: string;
    fontSize?: number;
    fontWeight?: number;
    textAlign?: "left" | "center" | "right";
    preserveAspectRatio?: boolean;
    copyCount?: number;
    layout?: "horizontal" | "vertical" | "grid";
    gap?: number;
    columns?: number;
    alignment?: "left" | "center" | "right" | "top" | "middle" | "bottom";
    axis?: "horizontal" | "vertical";
    placement?: "center" | "right-of-selection" | "below-selection" | "at-cursor";
    artifactType?: ArtifactType;
    executionDepth?: ExecutionDepth;
    workingVisibility?: WorkingVisibility;
    audience?: ArtifactAudience;
  };
};

type CanvasActionRequest = {
  actionId: string;
  stepId: string;
  tool: CanvasActionToolName;
  label: string;
  arguments: NorthStarToolArguments;
  asset?: {
    app?: NorthStarDataApp;
    flow?: NorthStarDataFlow;
    screenshot?: NorthStarDataScreen;
  };
  assetBundle?: {
    apps: NorthStarDataApp[];
    flows: NorthStarDataFlow[];
    screenshots: NorthStarDataScreen[];
  };
};

type ToolResult = {
  stepId: string;
  tool: AgentToolName;
  label: string;
  detail: string;
  objectIds: string[];
  data: unknown;
  resultView?: NorthStarToolResultView;
  ok: boolean;
};

type CanvasAIModelResponse = {
  answer?: unknown;
  references?: unknown;
  suggestedActions?: unknown;
  showSuggestedActions?: unknown;
  conversationSummary?: unknown;
};

type CompositionWorkingNote = {
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

type CompositionEvidenceObservation = {
  screenshotId: string;
  appName: string;
  flowName?: string;
  screenName: string;
  journeyStage?: string;
  visibleCopy: string[];
  uiElements: string[];
  userGoal?: string;
  notablePatterns: string[];
  frictionSignals: string[];
  trustSignals: string[];
  opportunities: string[];
  relevance: number;
  selectionReason?: string;
};

type CompositionFlowSynthesis = {
  appName: string;
  flowName: string;
  sessionType?: string;
  platform?: string;
  screenshotIds: string[];
  summary: string;
  journeyStages: string[];
  patterns: string[];
  frictionSignals: string[];
  trustSignals: string[];
  openQuestions: string[];
  relevance: number;
};

type CompositionAppSynthesis = {
  appName: string;
  summary: string;
  flowNames: string[];
  screenshotIds: string[];
  patterns: string[];
  onboardingModel?: string;
  activationModel?: string;
  strengths: string[];
  risks: string[];
  openQuestions: string[];
};

type ResearchWorkspaceRegion = {
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

type ResearchWorkspacePlan = {
  strategy: string;
  canvasWidth: number;
  canvasHeight: number;
  regions: ResearchWorkspaceRegion[];
};

type CompositionResearchLedger = {
  objective: string;
  inspectedScreenshotIds: string[];
  batches: Array<{
    batchIndex: number;
    screenshotIds: string[];
    summary: string;
  }>;
  observations: CompositionEvidenceObservation[];
  flowSyntheses: CompositionFlowSynthesis[];
  appSyntheses: CompositionAppSynthesis[];
  hypotheses: Array<{
    id: string;
    statement: string;
    status: "active" | "supported" | "challenged" | "rejected";
    supportingEvidenceIds: string[];
    contradictingEvidenceIds: string[];
  }>;
  openQuestions: string[];
  decisions: string[];
  corrections: string[];
  researchRounds: number;
  coverageSummary: string;
  workspacePlan?: ResearchWorkspacePlan;
};

type CompositionCheckpointFlow = {
  appName: string;
  flowId: string;
  flowName: string;
  platform?: string;
  sessionType?: string;
  screenIds: string[];
};

type CompositionRunCheckpoint = {
  version: "northstar.composition-checkpoint.v1";
  runId?: string;
  artifactId: string;
  objective: string;
  phase: "research" | "review" | "blueprint" | "building" | "completed" | "failed";
  executionDepth: ExecutionDepth;
  thinkingDepth: ThinkingDepth;
  workingVisibility: WorkingVisibility;
  audience: ArtifactAudience;
  artifactType: ArtifactType;
  requestedApps: string[];
  sessionType?: "onboarding" | "browsing";
  platform?: "mobile" | "web";
  candidateScreens: GroundedCompositionScreen[];
  selectedFlows: CompositionCheckpointFlow[];
  ledger: CompositionResearchLedger;
  updatedAt: string;
};

type SelectedCodeArtifactContext = {
  artifactId: string;
  revisionId: string;
  parentRevisionId?: string;
  surfaceId?: string;
  title: string;
  description?: string;
  visualStrategy?: string;
  artifactType?: string;
  audience?: string;
  thinkingDepth?: ThinkingDepth;
  document?: NorthstarWebArtifactDocument;
  mutationJournal?: NorthstarArtboardMutationBatch[];
  sourceTsx?: string;
  dataBundle?: CanvasCodeArtifactDataBundle;
  stagePlan?: CanvasCodeArtifactStage[];
  preferredWidth?: number;
  preferredHeight?: number;
  layoutBaseWidth?: number;
  layoutBaseHeight?: number;
  intrinsicBounds?: CanvasCodeArtifactIntrinsicBounds;
  minimumWidth?: number;
  minimumHeight?: number;
  creativeDirection?: NorthstarCreativeDirection;
  creativeReviews?: NorthstarCreativeReview[];
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
  diagnostics?: string[];
  provisional?: boolean;
  publicationState?: "working" | "verified";
};

type CompositionLayoutRegion = {
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

type CompositionSection = {
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

type CompositionBlueprint = {
  artifactId: string;
  artifactType: ArtifactType;
  executionDepth: ExecutionDepth;
  workingVisibility: WorkingVisibility;
  audience: ArtifactAudience;
  title: string;
  subtitle: string;
  summary: string;
  visualStrategy: string;
  researchDigest: string;
  workingNotes: CompositionWorkingNote[];
  workingEvidenceIds: string[];
  workingSurfacePlan?: ResearchWorkspacePlan;
  sections: CompositionSection[];
  layout: {
    direction: "horizontal" | "vertical" | "grid" | "mixed";
    columns: number;
    gap: number;
    evidenceScale: "compact" | "balanced" | "large";
    canvasWidth: number;
    canvasHeight: number;
    regions: CompositionLayoutRegion[];
  };
};

const TOOL_NAMES: AgentToolName[] = [...NORTHSTAR_AGENT_TOOL_NAMES];

const ACTIVITY_ICONS: CanvasAIActivityIcon[] = [
  "context",
  "inspect",
  "analyze",
  "search",
  "reference",
  "flow",
  "screenshot",
  "app",
  "compare",
  "plan",
  "tool",
  "verify",
  "write",
  "move",
  "connect",
  "select",
  "warning",
  "info",
  "complete",
];

const SEMANTIC_INTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [
        "conversation",
        "attachment",
        "canvas-inspection",
        "selection-inspection",
        "northstar-data",
        "canvas-action",
        "hybrid",
      ],
    },
    target: {
      type: "string",
      enum: ["conversation", "chat", "canvas", "selection", "attachment"],
    },
    requiresTools: { type: "boolean" },
    objective: {
      type: "string",
      description: "A concise description of the outcome the user actually wants.",
    },
    confidence: { type: "number" },
    resumeActiveRun: { type: "boolean" },
    data: {
      type: "object",
      properties: {
        entity: {
          type: "string",
          enum: ["none", "apps", "app", "flows", "flow", "screenshots", "screenshot", "app-icon"],
        },
        appName: { type: "string" },
        flowName: { type: "string" },
        screenshotId: { type: "string" },
        query: { type: "string" },
        platform: { type: "string", enum: ["mobile", "web"] },
        sessionType: { type: "string", enum: ["onboarding", "browsing"] },
        limit: { type: "number" },
      },
      required: ["entity"],
    },
    canvas: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "none",
            "inspect",
            "create-shape",
            "create-text",
            "create-note",
            "create-connector",
            "insert-app-icon",
            "insert-screenshot",
            "insert-flow",
            "move",
            "update-style",
            "resize",
            "rotate",
            "update-text",
            "duplicate",
            "delete",
            "arrange",
            "align",
            "distribute",
            "select",
            "focus",
            "compose",
          ],
        },
        shape: {
          type: "string",
          enum: ["rect", "ellipse", "circle", "diamond", "triangle", "pill", "callout", "card", "frame"],
        },
        text: { type: "string" },
        targetQuery: { type: "string" },
        fromQuery: { type: "string" },
        toQuery: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        scale: { type: "number" },
        rotation: { type: "number" },
        rotationDelta: { type: "number" },
        fill: { type: "string" },
        stroke: { type: "string" },
        strokeWidth: { type: "number" },
        textColor: { type: "string" },
        fontSize: { type: "number" },
        fontWeight: { type: "number" },
        textAlign: { type: "string", enum: ["left", "center", "right"] },
        preserveAspectRatio: { type: "boolean" },
        copyCount: { type: "number" },
        layout: { type: "string", enum: ["horizontal", "vertical", "grid"] },
        gap: { type: "number" },
        columns: { type: "number" },
        alignment: { type: "string", enum: ["left", "center", "right", "top", "middle", "bottom"] },
        axis: { type: "string", enum: ["horizontal", "vertical"] },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
        artifactType: { type: "string", enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] },
        executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
        workingVisibility: { type: "string", enum: ["visible", "compact", "hidden"] },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
      },
      required: ["operation"],
    },
  },
  required: ["kind", "target", "requiresTools", "objective", "confidence"],
} as const;

const PLANNER_JSON_SCHEMA = {
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["direct", "agent"],
      description:
        "Use direct only when no tool is needed. Use agent whenever one or more canvas inspections, North Star data tools, or reversible canvas actions are required.",
    },
    focus: {
      type: "string",
      enum: ["conversation", "attachment", "canvas", "selection", "northstar-data", "hybrid"],
      description:
        "The primary subject of the request. Canvas context is ambient and must not become the subject unless the user asks about it or it is needed to answer accurately.",
    },
    title: {
      type: "string",
      description: "A short human-readable title for the run. Never include object IDs.",
    },
    steps: {
      type: "array",
      maxItems: MAX_AGENT_STEPS,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "A short stable step identifier such as step-1.",
          },
          label: {
            type: "string",
            description: "A concise visible activity label describing the actual inspection.",
          },
          tool: {
            type: "string",
            enum: TOOL_NAMES,
          },
          icon: {
            type: "string",
            enum: ACTIVITY_ICONS,
          },
          arguments: {
            type: "object",
            description: "Arguments for the selected tool. Include only fields the tool needs.",
            properties: {
              appName: { type: "string" },
              appNames: { type: "array", items: { type: "string" } },
              flowName: { type: "string" },
              query: { type: "string" },
              screenshotId: { type: "string" },
              platform: { type: "string", enum: ["mobile", "web"] },
              sessionType: { type: "string", enum: ["onboarding", "browsing"] },
              limit: { type: "number" },
              shape: {
                type: "string",
                enum: ["rect", "ellipse", "circle", "diamond", "triangle", "pill", "callout", "card", "frame"],
              },
              text: { type: "string" },
              targetQuery: { type: "string" },
              fromQuery: { type: "string" },
              toQuery: { type: "string" },
              resultKey: { type: "string" },
              fromResultKey: { type: "string" },
              toResultKey: { type: "string" },
              resultKeys: { type: "array", items: { type: "string" } },
              objectIds: { type: "array", items: { type: "string" } },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              offsetX: { type: "number" },
              offsetY: { type: "number" },
              fill: { type: "string" },
              stroke: { type: "string" },
              textColor: { type: "string" },
              fontSize: { type: "number" },
              fontWeight: { type: "number" },
              strokeWidth: { type: "number" },
              textAlign: { type: "string", enum: ["left", "center", "right"] },
              scale: { type: "number" },
              rotation: { type: "number" },
              rotationDelta: { type: "number" },
              preserveAspectRatio: { type: "boolean" },
              copyCount: { type: "number" },
              layout: { type: "string", enum: ["horizontal", "vertical", "grid"] },
              gap: { type: "number" },
              columns: { type: "number" },
              connectorKind: { type: "string", enum: ["straight", "curved", "elbow"] },
              connectorEnd: { type: "string", enum: ["none", "arrow"] },
              connectorDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
              alignment: { type: "string", enum: ["left", "center", "right", "top", "middle", "bottom"] },
              axis: { type: "string", enum: ["horizontal", "vertical"] },
              placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
              selectAfter: { type: "boolean" },
              artifactId: { type: "string" },
              artifactType: { type: "string", enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] },
              executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
              workingVisibility: { type: "string", enum: ["visible", "compact", "hidden"] },
              audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
              title: { type: "string" },
              subtitle: { type: "string" },
              summary: { type: "string" },
              compositionJson: { type: "string" },
              workingNotesJson: { type: "string" },
              workingNoteJson: { type: "string" },
              sectionJson: { type: "string" },
              sectionIndex: { type: "number" },
              totalSections: { type: "number" },
              maxVisibleEvidence: { type: "number" },
            },
          },
        },
        required: ["id", "label", "tool", "icon"],
      },
    },
  },
  required: ["mode", "focus", "title", "steps"],
} as const;

const COMPOSITION_BLUEPRINT_JSON_SCHEMA = {
  type: "object",
  properties: {
    artifactId: { type: "string" },
    artifactType: {
      type: "string",
      enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"],
    },
    executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
    workingVisibility: { type: "string", enum: ["visible", "compact", "hidden"] },
    audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
    title: { type: "string" },
    subtitle: { type: "string" },
    summary: { type: "string" },
    visualStrategy: { type: "string" },
    researchDigest: { type: "string" },
    workingNotes: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          text: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "objective",
              "constraint",
              "evidence",
              "hypothesis",
              "decision",
              "question",
              "correction",
              "rejected",
              "check",
            ],
          },
          evidenceIds: { type: "array", maxItems: 12, items: { type: "string" } },
        },
        required: ["label", "text", "kind"],
      },
    },
    workingEvidenceIds: {
      type: "array",
      maxItems: 24,
      items: { type: "string" },
    },
    sections: {
      type: "array",
      maxItems: 14,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          kind: { type: "string", enum: ["app-column", "stage", "evidence-group", "insight", "recommendation", "summary", "matrix", "chart", "timeline", "roadmap", "process", "decision", "hypothesis", "risk", "opportunity", "metric", "diagram", "reference-flow", "source-cluster", "callout", "table"] },
          appName: { type: "string" },
          flowName: { type: "string" },
          evidenceIds: { type: "array", maxItems: 12, items: { type: "string" } },
          criteria: { type: "array", maxItems: 8, items: { type: "string" } },
          emphasis: { type: "string", enum: ["normal", "primary", "supporting"] },
        },
        required: ["id", "title", "body", "kind", "evidenceIds", "emphasis"],
      },
    },
    layout: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["horizontal", "vertical", "grid", "mixed"] },
        columns: { type: "number" },
        gap: { type: "number" },
        evidenceScale: { type: "string", enum: ["compact", "balanced", "large"] },
        canvasWidth: { type: "number" },
        canvasHeight: { type: "number" },
        regions: {
          type: "array",
          maxItems: 14,
          items: {
            type: "object",
            properties: {
              sectionId: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
              evidenceLayout: {
                type: "string",
                enum: ["row", "column", "grid", "cluster", "timeline", "filmstrip"],
              },
              columns: { type: "number" },
              emphasis: { type: "string", enum: ["normal", "primary", "supporting"] },
              styleVariant: {
                type: "string",
                enum: ["plain", "soft", "contrast", "editorial", "minimal"],
              },
            },
            required: ["sectionId", "x", "y", "w", "h", "evidenceLayout"],
          },
        },
      },
      required: ["direction", "columns", "gap", "evidenceScale", "canvasWidth", "canvasHeight", "regions"],
    },
  },
  required: [
    "artifactId",
    "artifactType",
    "executionDepth",
    "workingVisibility",
    "audience",
    "title",
    "subtitle",
    "summary",
    "visualStrategy",
    "researchDigest",
    "workingNotes",
    "workingEvidenceIds",
    "sections",
    "layout",
  ],
} as const;

const SCREEN_BATCH_STUDY_JSON_SCHEMA = {
  type: "object",
  properties: {
    batchSummary: { type: "string" },
    observations: {
      type: "array",
      maxItems: COMPOSITION_VISUAL_BATCH_MAX,
      items: {
        type: "object",
        properties: {
          screenshotId: { type: "string" },
          appName: { type: "string" },
          flowName: { type: "string" },
          screenName: { type: "string" },
          journeyStage: { type: "string" },
          visibleCopy: { type: "array", maxItems: 12, items: { type: "string" } },
          uiElements: { type: "array", maxItems: 12, items: { type: "string" } },
          userGoal: { type: "string" },
          notablePatterns: { type: "array", maxItems: 10, items: { type: "string" } },
          frictionSignals: { type: "array", maxItems: 8, items: { type: "string" } },
          trustSignals: { type: "array", maxItems: 8, items: { type: "string" } },
          opportunities: { type: "array", maxItems: 8, items: { type: "string" } },
          relevance: { type: "number" },
          selectionReason: { type: "string" },
        },
        required: [
          "screenshotId",
          "appName",
          "screenName",
          "visibleCopy",
          "uiElements",
          "notablePatterns",
          "frictionSignals",
          "trustSignals",
          "opportunities",
          "relevance",
        ],
      },
    },
  },
  required: ["batchSummary", "observations"],
} as const;


const FLOW_SYNTHESIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    appName: { type: "string" },
    flowName: { type: "string" },
    sessionType: { type: "string" },
    platform: { type: "string" },
    screenshotIds: { type: "array", maxItems: 80, items: { type: "string" } },
    summary: { type: "string" },
    journeyStages: { type: "array", maxItems: 16, items: { type: "string" } },
    patterns: { type: "array", maxItems: 16, items: { type: "string" } },
    frictionSignals: { type: "array", maxItems: 12, items: { type: "string" } },
    trustSignals: { type: "array", maxItems: 12, items: { type: "string" } },
    openQuestions: { type: "array", maxItems: 10, items: { type: "string" } },
    relevance: { type: "number" },
  },
  required: ["appName", "flowName", "screenshotIds", "summary", "journeyStages", "patterns", "frictionSignals", "trustSignals", "openQuestions", "relevance"],
} as const;

const APP_SYNTHESIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    appName: { type: "string" },
    summary: { type: "string" },
    flowNames: { type: "array", maxItems: 24, items: { type: "string" } },
    screenshotIds: { type: "array", maxItems: 120, items: { type: "string" } },
    patterns: { type: "array", maxItems: 18, items: { type: "string" } },
    onboardingModel: { type: "string" },
    activationModel: { type: "string" },
    strengths: { type: "array", maxItems: 12, items: { type: "string" } },
    risks: { type: "array", maxItems: 12, items: { type: "string" } },
    openQuestions: { type: "array", maxItems: 12, items: { type: "string" } },
  },
  required: ["appName", "summary", "flowNames", "screenshotIds", "patterns", "strengths", "risks", "openQuestions"],
} as const;

const RESEARCH_WORKSPACE_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    strategy: { type: "string" },
    canvasWidth: { type: "number" },
    canvasHeight: { type: "number" },
    regions: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          purpose: { type: "string", enum: ["objective", "app", "flow", "hypotheses", "decisions", "questions", "archive", "synthesis", "custom"] },
          x: { type: "number" },
          y: { type: "number" },
          w: { type: "number" },
          h: { type: "number" },
          layout: { type: "string", enum: ["row", "column", "grid", "cluster", "timeline", "mixed"] },
          appName: { type: "string" },
          flowName: { type: "string" },
          evidenceIds: { type: "array", maxItems: 80, items: { type: "string" } },
          noteLabels: { type: "array", maxItems: 30, items: { type: "string" } },
          emphasis: { type: "string", enum: ["normal", "primary", "supporting"] },
        },
        required: ["id", "title", "purpose", "x", "y", "w", "h", "layout", "evidenceIds", "noteLabels"],
      },
    },
  },
  required: ["strategy", "canvasWidth", "canvasHeight", "regions"],
} as const;

const RESEARCH_REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    coverageSummary: { type: "string" },
    enoughEvidence: { type: "boolean" },
    missingQuestions: { type: "array", maxItems: 10, items: { type: "string" } },
    additionalQueries: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          appName: { type: "string" },
          query: { type: "string" },
          sessionType: { type: "string", enum: ["onboarding", "browsing"] },
          platform: { type: "string", enum: ["mobile", "web"] },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    hypotheses: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          statement: { type: "string" },
          status: { type: "string", enum: ["active", "supported", "challenged", "rejected"] },
          supportingEvidenceIds: { type: "array", maxItems: 16, items: { type: "string" } },
          contradictingEvidenceIds: { type: "array", maxItems: 16, items: { type: "string" } },
        },
        required: ["id", "statement", "status", "supportingEvidenceIds", "contradictingEvidenceIds"],
      },
    },
    decisions: { type: "array", maxItems: 12, items: { type: "string" } },
    corrections: { type: "array", maxItems: 12, items: { type: "string" } },
    workspacePlan: RESEARCH_WORKSPACE_PLAN_JSON_SCHEMA,
  },
  required: [
    "coverageSummary",
    "enoughEvidence",
    "missingQuestions",
    "additionalQueries",
    "hypotheses",
    "decisions",
    "corrections",
    "workspacePlan",
  ],
} as const;

const BLUEPRINT_CRITIQUE_JSON_SCHEMA = {
  type: "object",
  properties: {
    accepted: { type: "boolean" },
    critique: { type: "string" },
    requiredChanges: { type: "array", maxItems: 12, items: { type: "string" } },
    revisedBlueprint: COMPOSITION_BLUEPRINT_JSON_SCHEMA,
  },
  required: ["accepted", "critique", "requiredChanges", "revisedBlueprint"],
} as const;

const FINAL_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description:
        "A clear, highly readable Markdown answer grounded only in supplied canvas context, conversation memory, attached visuals, and completed tool results. Use short paragraphs. When naming three or more distinct screens, findings, options, steps, or observations, format them as a bulleted or numbered list instead of burying them in a sentence. Never include internal object IDs in this prose.",
    },
    references: {
      type: "array",
      description:
        "Exact canvas references supporting the answer. IDs belong only in this structured field.",
      items: {
        type: "object",
        properties: {
          objectIds: { type: "array", items: { type: "string" } },
          label: { type: "string" },
          reason: { type: "string" },
        },
        required: ["objectIds", "label"],
      },
    },
    suggestedActions: {
      type: "array",
      description:
        "Rare, high-value follow-up suggestions. Return an empty array for most turns.",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          targetObjectIds: { type: "array", items: { type: "string" } },
          description: { type: "string" },
        },
        required: ["type", "targetObjectIds", "description"],
      },
    },
    showSuggestedActions: {
      type: "boolean",
      description:
        "Default false. Set true only when suggestions materially help the current collaboration.",
    },
    conversationSummary: {
      type: "string",
      description:
        "Compact durable collaboration memory: goals, decisions, preferences, completed work, and unresolved topics. Never include raw object IDs.",
    },
  },
  required: [
    "answer",
    "references",
    "suggestedActions",
    "showSuggestedActions",
    "conversationSummary",
  ],
} as const;

const SEMANTIC_INTENT_SYSTEM_INSTRUCTION = `
You are North Star's semantic intent gate. Do not answer the user and do not write a plan. Decide what kind of grounded execution the request requires.

North Star operates in four contextual modes:
1. Conversation or attachment discussion that needs no registered tool.
2. Grounded tenant-data work using North Star app, flow, screenshot, and icon tools.
3. Verified canvas inspection or reversible primitive actions.
4. A live visual artifact only when a bounded visual or interactive solution materially improves the outcome.

Choose the least complex medium that fully solves the request. Greetings, casual conversation, clarifications, simple factual answers, concise summaries, and status questions must remain conversational. The availability of the Canvas or app data is never by itself a reason to create an artifact.

The canvas workspace is ambient context, but requests whose intended outcome is a changed canvas are canvas actions. Requests for real tenant apps, flows, screenshots, or icons are North Star data work. The user's tone, slang, shorthand, or indirect wording never changes those grounding requirements.

Use the full conversation, recentToolContext, attachment state, canvas summary, and selection state to resolve pronouns and elliptical follow-ups. Infer meaning rather than matching a fixed vocabulary.

Non-negotiable classifications:
- A request to create, insert, arrange, move, connect, align, resize, rotate, restyle, rewrite, duplicate, delete, select, or focus something on the canvas requires tools.
- A request for a primitive visual object such as a circle, note, text block, connector, or frame inside this workspace is a canvas action unless the user explicitly asks only for an explanation.
- A request to list, show, browse, inspect, search, or retrieve tenant apps, flows, screenshots, or icons requires North Star data tools so real result cards can render in Chat.
- A request that retrieves tenant data and then places it on the canvas is hybrid.
- A request to build a complete comparison, journey map, analysis board, strategy board, product concept, research wall, roadmap, systems map, presentation-ready visual, or other multi-part canvas solution is a compose action. The composer may supply a Low, Medium, or High thinking-depth preference; treat that preference as the execution budget. Only infer depth from wording when no explicit preference is supplied.
- When the selection contains a generated code artifact and the user asks to rethink, revise, restyle, simplify, intensify, make more provocative, change emphasis, explore a different direction, or otherwise creatively alter it, classify the request as a compose action targeted at the selection. This means revise the same artifact rather than editing primitive children or creating a second board.
- North Star is a general business problem-solving environment, not an executive-summary generator. The model chooses the most useful visual deliverable for the objective and audience. Executive summaries, matrices, charts, timelines, maps, storyboards, recommendations, and evidence lanes are optional vocabulary—not a mandatory template.
- Compose work creates or updates one live artifact immediately. Research and proof remain inspectable inside that artifact; do not create a separate working surface unless the user explicitly asks for a scratchpad.
- Existing objects may be described semantically (for example, "the circle", "the Awin screenshot", "these two", or "the last thing added"). Capture those references in targetQuery, or in fromQuery/toQuery for connector endpoints.
- targetQuery, fromQuery, and toQuery must be concise human noun phrases such as "the circle" or "the Awin screenshot". Never copy the full user command into a target field.
- If activeCompositionCheckpoint describes an unfinished run and the user asks to continue, resume, finish, or proceed with that work, set resumeActiveRun true and classify the outcome as compose. Preserve the checkpoint objective unless the user clearly redirects it.
- Direct conversation is preferred whenever visual composition would not materially improve comprehension, decision-making, collaboration, or editing. A message such as “hi” must never create a Canvas object.
- Never classify a tool-required request as conversation merely because the wording is casual, incomplete, or follows prior context.

The data hierarchy is App -> Flow -> ordered Screenshots. Populate structured fields whenever the user or recent context supplies them. Respect requested quantities through limit.

Return only the SemanticIntentDecision JSON object.
`.trim();

const PLANNER_SYSTEM_INSTRUCTION = `
You are the planning layer for North Star, a product-thinking agent working inside a canvas workspace and a tenant-scoped North Star product-data environment.

A semantic intent gate has already classified the requested outcome. The planner input includes intentDecision. You must honor it. When intentDecision.requiresTools is true, return mode "agent" with at least one registered tool step, and include every required tool family indicated by that decision. Never downgrade a tool-required request to direct conversation.

North Star is a general collaborator. The canvas is one source of context, not the default subject. Tenant apps, captured flows, ordered screenshots, and app icons are a separate product-data system that must be accessed through the registered data tools.

First classify the request focus:
- conversation: general discussion, explanation, ideation, or follow-up that requires no canvas or account-data tool.
- attachment: the user is primarily asking about images attached to this turn.
- canvas: the whole canvas is the primary subject.
- selection: selected canvas elements are the primary subject.
- northstar-data: the user asks about apps, captured flows, screenshots, app icons, onboarding, browsing, or account content available in North Star.
- hybrid: the request genuinely combines two or more of attachment, canvas, selection, and North Star account data.

The complete registry below is the source of truth for what each tool means, when it should be used, what it returns, and how tools compose:
${getToolRegistryPromptSummary()}

Planning rules:
1. Use mode "direct" only when no tool is needed. General conversation and direct analysis of a current attachment can remain direct.
2. Never answer questions about available tenant apps, flows, screenshots, or icons from memory. Use the relevant North Star data tool.
3. Treat the data hierarchy as App -> Flow -> ordered Screenshots. Preserve that scope in structured arguments.
4. Prefer the narrowest precise tool:
   - account app inventory -> list_available_apps
   - one known app's metadata -> get_app_details
   - flows for a known app, especially onboarding/browsing/mobile/web filters -> list_app_flows
   - semantically described or uncertain flow -> search_app_flows
   - one known flow's metadata -> get_flow_details
   - ordered screens from one known flow -> get_flow_screenshots
   - semantically described or uncertain screen -> search_screenshots
   - one exact screen -> get_screenshot
   - one known app icon -> get_app_icon
   - curated multi-app evidence for a complex composition -> prepare_composition_evidence
5. Use clean structured arguments instead of copying the whole user sentence into query. Put the app in appName, flow in flowName, onboarding/browsing in sessionType, mobile/web in platform, and the requested quantity in limit.
6. Respect explicit quantities. "Show two Awin onboarding flows" should normally use list_app_flows with appName "Awin", sessionType "onboarding", and limit 2.
7. Distinguish presentation from mutation by intended outcome, not vocabulary. A request to see, browse, inspect, or compare data in Chat is read-only. A request whose intended outcome is a changed canvas must use canvas action tools, regardless of whether the user speaks formally, casually, elliptically, or with slang.
8. Resolve pronouns and elliptical follow-ups semantically from recent conversation and recentToolContext. Phrases such as “those”, “them”, “the flows”, “one of those”, “that one”, or “show me in chat” refer to the most recent compatible app, flow, screenshot, or result set unless the user clearly changes subject.
9. Retrieval and insertion are separate operations. When the exact asset is not already known, retrieve it first and then call the matching insert action.
10. For “any screen from this flow”, prefer get_flow_screenshots with a small limit over broad screenshot search. For a screen described by copy or purpose, use search_screenshots.
11. A single useful tool call is a valid agent run. Do not invent extra steps merely to make the activity timeline look substantial.
12. Use multiple steps only when later steps depend on earlier results, such as resolving a flow, retrieving a screen, inserting it, and optionally focusing it.
13. Do not inspect the canvas merely because the workspace contains one. Inspect it only when the canvas or selection is actually relevant.
14. Attached images are first-class conversation input. Use focus "attachment" when they are the clear subject unless the user asks to compare them with canvas or account data.
15. Explicit, low-risk, reversible canvas requests may use canvas action tools. Create one visible step per meaningful action so the user can watch real work happen.
16. v80.1 supports explicit, undoable deletion of a selected or clearly resolved object. Broad deletion such as clearing the whole canvas remains unavailable without a dedicated confirmation flow. Other reversible edits include styling, resizing, rotating, rewriting text, duplicating, arranging, and connecting.
17. For prompts such as “add two circles and connect them”, create two create_shape steps with unique resultKey values, then create_connector using fromResultKey and toResultKey.
18. Use objectIds only for exact existing canvas objects supplied in context. Use resultKey/resultKeys for objects created earlier in the same run.
19. For existing-object actions, resolve the target before mutation. Use inspect_selection when the selected objects are the target; otherwise use find_relevant_objects with a concise target query or inspect_canvas_overview for an exact two-object canvas.
20. For connectors between existing objects, use fromQuery and toQuery when the endpoints are described separately. Do not dispatch create_connector until two distinct object targets can be resolved.
21. End with select_objects or focus_objects only when that improves the user's immediate experience. These steps are optional.
22. Visible labels describe factual operations, not hidden reasoning. Never reveal chain-of-thought, internal IDs, or implementation details.
23. Never assume a dispatched client action succeeded. The final answer may claim success only after the client reports real created or updated object IDs.
24. Keep plans concise, specific, and readable in the live activity timeline.
25. Infer intent from meaning and conversational context rather than matching a fixed vocabulary. Slang, shorthand, indirect phrasing, and follow-up references must receive the same semantic interpretation as formal wording.
26. A supported canvas mutation must never be downgraded to direct conversation. It must produce an agent plan containing the corresponding canvas action tool.
27. When the user asks for a simple shape, do not inspect an empty canvas first. Create the requested shape and optionally focus it.
28. When a known app is named, always scope flow and screenshot retrieval to that app. Never leak unrelated apps into the result set.
29. A requested count is an execution constraint, not a summarization preference. Retrieve only that many results whenever the selected tool supports limit.
30. recentToolContext contains the actual structured result cards shown in prior turns. Treat it as authoritative conversational state, not as decorative metadata.
31. When the user asks to see prior or related apps, flows, or screenshots in Chat, execute the appropriate read-only data tool so the UI can render real result cards. Never substitute prose-only names, invented examples, or remembered summaries for a tool-backed result view.
32. Follow-ups such as “show me two of Awin’s goods”, “show me the flows”, “let me see them here”, or “I need to see those in chat” must resolve against recentToolContext and retrieve the real scoped entities.
33. If the prior result set contains apps and the user asks for one app’s “flows”, “goods”, “things”, or equivalent contextual shorthand, interpret the requested entity from the active result hierarchy and use the narrowest matching data tool.
34. The planner is the semantic router. Deterministic code may validate tool names, scope, limits, arguments, and action safety, but must not replace semantic planning with a synonym list.
35. Composition requests are outcome-level tasks. After the contextual intent gate confirms that a visual artifact materially helps, create one bounded live artifact immediately, then update that same artifact as research, analysis, design, and refinement progress.
36. Do not force one visual template onto every problem. Comparisons, journeys, evidence clustering, strategy recommendations, and screenshot analysis require different composition structures.
37. Prefer progressive disclosure and curation. Gather broadly when needed, but keep the main artifact concise and easy to digest. Supporting evidence and intermediate decisions remain inspectable inside the same live artifact unless the user explicitly requests a separate scratchpad.
38. The composer supplies an explicit Low, Medium, or High thinking-depth budget. Low maps to quick execution, Medium to balanced, and High to deep. The model still decides what research and revisions are useful inside that budget.
39. Existing v79 atomic actions remain fully supported. Use compose only when the requested outcome genuinely requires a multi-part editable deliverable.
35. Object lookup arguments must be concise semantic references. Use targetQuery "the circle", not "Change the fill color of the selected circle to yellow".
36. When the user delegates an app, flow, or screenshot choice to North Star, narrate that choice through real data-tool steps. Do not jump from listing apps directly to insertion. Resolve the chosen flow, retrieve the chosen screenshot, then insert it.
37. Every visible activity step must correspond to a real inspection, data lookup, or canvas action. Labels should state the concrete entity being reviewed or selected whenever it is known.

Canonical examples:
- “What apps do we have?” -> list_available_apps.
- “Show me two onboarding flows from Awin.” -> list_app_flows(appName: "Awin", sessionType: "onboarding", limit: 2). No canvas action.
- “Yo, show me like two of them things in Awin.” after discussing apps or flows -> resolve the intended entity from recentToolContext, then list_app_flows(appName: "Awin", limit: 2). No cross-app results.
- “Pick any screen from one of those and put it on the canvas.” -> resolve the recent Awin onboarding flow, get_flow_screenshots(limit: 1), insert_screenshot, optionally focus_objects.
- “Slap any one of those Awin screenshots onto the canvas.” -> resolve the recent Awin flow, get_flow_screenshots(limit: 1), insert_screenshot, focus_objects.
- “Put a simple circle on the canvas.” -> create_shape(shape: "circle"), then optionally focus_objects. Never use direct mode.
- “Delete it.” after creating or selecting one object -> inspect_selection or find_relevant_objects(query: a concise target), then delete_objects. Never substitute select_objects for deletion.
- “Show me screenshots containing registration successful.” -> search_screenshots(query: "registration successful"). No canvas action unless placement is explicit.
- “Add that whole flow to the canvas.” -> resolve the most recently discussed flow, then insert_flow and optionally focus_objects.
- “Connect the screenshot and the circle.” -> find_relevant_objects(query: "screenshot"), find_relevant_objects(query: "circle"), create_connector(fromQuery: "screenshot", toQuery: "circle").
- “Make the Awin screenshot larger.” -> find_relevant_objects(query: "Awin screenshot"), resize_objects(targetQuery: "Awin screenshot", scale: 1.25).
- “Make the circle blue.” -> find_relevant_objects(query: "circle"), update_object_style(targetQuery: "circle", fill: the requested blue).
- “Delete it.” when one object is selected -> inspect_selection, delete_objects(targetQuery: "the selected object").
- “Arrange these screenshots in a row.” -> inspect_selection when selected, then arrange_objects(layout: "horizontal").
`.trim();

const SEMANTIC_REPLAN_SYSTEM_INSTRUCTION = `
Re-evaluate the initial planner decision using the full conversation and recentToolContext.

The first decision returned direct mode, but a direct answer may be wrong when the user is continuing from structured app, flow, screenshot, or canvas-action results. Determine the intended operation from meaning, reference, hierarchy, and conversational state—not from exact words.

Return a complete PlannerResponse. Keep direct mode only when no registered tool is genuinely needed. If the user wants real tenant data displayed in Chat, use a read-only North Star data tool so result cards render. If the intended outcome changes the canvas, use the corresponding reversible canvas action tool. Never invent entities from prose memory.
`.trim();

const SCREEN_BATCH_STUDY_SYSTEM_INSTRUCTION = `
You are North Star's multimodal evidence researcher. Study every supplied screenshot carefully and return a concise, auditable observation for each image.

The metadata immediately before each image identifies its screenshotId, appName, flowName, screenName, platform, session type, and index. Preserve those identities exactly. Do not infer that one app's screen belongs to another app.

For every screenshot:
- read visible copy and labels;
- identify the likely journey stage and user goal;
- identify important UI elements and interactions;
- note product, messaging, trust, friction, and opportunity signals;
- explain why the screen is or is not relevant to the stated objective;
- avoid repeating metadata as analysis;
- never invent content that is not visible or grounded in metadata.

This is an evidence ledger, not a final presentation. Return only the required JSON.
`.trim();

const FLOW_SYNTHESIS_SYSTEM_INSTRUCTION = `
You are North Star's flow-level research synthesizer. Consolidate verified screen observations from one exact app flow into a compact, grounded understanding.

Use only the supplied observations. Preserve the exact app and flow names and screenshot IDs. Explain the flow's progression, stages, repeated patterns, friction, trust, open questions, and relevance to the user's objective. Do not invent unseen screens or merge another app's evidence into this flow.
`.trim();

const APP_SYNTHESIS_SYSTEM_INSTRUCTION = `
You are North Star's app-level research synthesizer. Consolidate verified flow syntheses for one exact app into a compact view of how that app addresses the user's objective.

Use only the supplied flow syntheses. Preserve source screenshot IDs. Distinguish onboarding, activation, browsing, and discovery rather than treating them as interchangeable. Record strengths, risks, gaps, and open questions without inventing evidence.
`.trim();

const RESEARCH_REVIEW_SYSTEM_INSTRUCTION = `
You are North Star's recursive research critic. Review the accumulated screenshot observations against the user's objective.

Decide whether the current evidence is sufficient to support a high-quality solution. Look for:
- missing requested apps, flows, stages, personas, or platforms;
- comparisons that are not stage-equivalent;
- weak or duplicated evidence;
- unsupported assumptions;
- contradictions that require more inspection;
- important questions the current screenshots cannot answer.

When evidence is incomplete, request a small number of precise additional searches. Do not request more research merely to appear thorough. When evidence is sufficient, say so and consolidate supported, challenged, and rejected hypotheses.

Also design an organized working-surface plan from the actual research structure. The plan must keep evidence easy to follow as it grows, but must not use a fixed template. Choose regions, spatial relationships, evidence groupings, and layouts that fit this exact objective, apps, flows, questions, and discoveries. Keep ordered screens from the same flow together, separate onboarding from browsing unless the research explicitly justifies mixing them, and reserve space for hypotheses, corrections, decisions, and rejected evidence when useful.

Return only the required JSON.
`.trim();

const BLUEPRINT_CRITIQUE_SYSTEM_INSTRUCTION = `
You are North Star's artifact design critic. Evaluate the proposed blueprint against the user's objective and the complete research ledger.

North Star is a general business problem solver. Do not reward a blueprint for copying a fixed dashboard or executive-summary template when another visual form would communicate the problem better.

Reject the blueprint when:
- visible claims are not supported by inspected screenshots;
- a requested subject lacks evidence;
- comparison sections are not logically comparable;
- too much evidence is shown;
- the visual structure is generic when the problem calls for a more meaningful structure;
- the main takeaway is unclear;
- the unified artifact does not reveal meaningful proof of work through a designed research trail;
- the layout would be confusing, crowded, or repetitive.

When rejecting it, return a fully revised blueprint. Preserve grounded evidence IDs and never invent screenshots. Prefer a distinct problem-specific composition over a fixed template. Return only the required JSON.
`.trim();

const COMPOSITION_SYSTEM_INSTRUCTION = `
You are North Star's adaptive visual composer. Produce a structured blueprint for a complete editable canvas artifact using only the grounded evidence and research ledger supplied to you.

North Star solves many kinds of business problems. Do not force every objective into a comparison board, an executive-summary rail, or a standard dashboard. Treat section coordinates as semantic hints only: the client layout engine owns final geometry, containment, wrapping, and collision-free placement. Never require an executive summary, right rail, matrix, chart, or recommendation block unless it directly serves the user's objective. Choose the visual grammar that best helps the user understand and act: reference lanes, journey maps, timelines, systems diagrams, research walls, matrices, product concepts, strategy maps, storyboards, charts, annotated evidence, or a custom composition. On continuation, resume from the persisted evidence and phase; do not restart broad retrieval. The benchmark prompt is an acceptance test, not the definition of the product.

The blueprint is an evidence and editorial brief for a generated standard-web artifact. Do not prescribe a primitive tree or pixel-by-pixel object placement. Describe the content, evidence relationships, reading order, and decision story that the code artifact must communicate.

North Star is a first-principles problem solver. The research ledger records screenshots that were actually inspected visually, observations, hypotheses, open questions, corrections, and decisions. Use that proof of work. Do not compose from labels alone when inspected observations are available.

The final artifact must be easy to digest even when the research was extensive. Curate aggressively. Broader evidence, rejected paths, hypotheses, and sources must remain inspectable through a designed research trail inside the same artifact.

Rules:
1. Never invent apps, flows, screenshots, facts, or claims. Use only supplied grounded results, inspected observations, and canvas evidence.
2. Select evidence by exact screenshot IDs from the ledger. A screenshot can support a claim only when its observation materially supports it.
3. Keep the main presentation restrained: quick work usually shows 1-3 evidence items, balanced 3-7, deep up to 12 only when necessary.
4. Put objectives, unknowns, hypotheses, corrections, rejected directions, decisions, and verification notes into workingNotes as structured research input for the code artifact.
5. Put representative inspected screenshots into workingEvidenceIds so the generated artifact can expose a designed research trail.
6. Choose a visual structure from the actual problem and evidence. Do not default every comparison to two equal columns.
7. Define explicit normalized layout regions. x, y, w, and h are percentages of the artifact canvas from 0 to 100. Regions may be asymmetric, but intended section regions must not overlap or hide one another.
8. Reserve clear negative space between major sections and make the reading order obvious. The main takeaway must remain visible and must not sit beneath another region.
9. Use evidenceLayout to describe how each section's evidence should appear: row, column, grid, cluster, or timeline.
10. Include a concise visualStrategy describing why this presentation form fits the problem.
11. For comparisons, every app section must contain only that app's screenshots. Prefer stage-equivalent evidence. If symmetry is impossible, communicate the limitation rather than fabricating it.
12. Honor the authoritative session scope supplied by tenant metadata. Do not substitute browsing evidence for an onboarding request or onboarding evidence for a browsing request unless the research explicitly adds it as labeled supporting context.
13. Every final summary and section claim must be traceable to inspected evidence.
14. The live artifact is also the polished investigative environment. It should reveal evidence, questions, hypotheses, corrections, and decisions through progressive disclosure without becoming an unstructured note dump.
15. An executive summary is optional. Include decision-ready synthesis only when the objective, audience, or requested deliverable benefits from it. Do not add one merely because the task is complex.
16. Preserve the requested execution depth, working visibility, and audience.
17. Use a stable artifactId beginning with "artifact-".
18. Treat the solution and research trail as one unified code artifact. Do not plan a second floating working surface.
19. Record research changes only when new evidence, a changed hypothesis, a correction, or a decision materially changes the story. Never emit duplicate checkpoint writes.
20. Use section kind "reference-flow" when an ordered captured flow is central to the explanation. Give it appName, flowName, every ordered evidence ID that belongs to that flow, and evidenceLayout "filmstrip". The renderer will show complete screenshots directly, without generic screenshot cards or permanent captions.
21. Use "matrix" or "table" only when row-by-row comparison materially clarifies the decision. Encode each criteria row as pipe-delimited cells, for example "Dimension | App A | App B". Do not force a table into unrelated work.
22. Use "chart" only for observed or supplied values. For qualitative screenshot evidence, use observed stage distribution rather than invented conversion rates.
23. Research and final communication evolve inside one artifact. Distill the research as understanding improves; do not switch into a separate fixed dashboard template.
24. Avoid repeating the previous artifact's region skeleton unless the same structure is demonstrably best for this problem. Every major region must earn its place through the objective and evidence.
25. Prefer direct, full-frame screenshot filmstrips for ordered journeys. Do not request screenshot cards, duplicated captions, or decorative chrome around every image.
26. Return only the CompositionBlueprint JSON object.
`.trim();

const FINAL_SYSTEM_INSTRUCTION = `
You are North Star, an expert product, design, research, strategy, and problem-solving collaborator working inside a canvas workspace.

This version can perform explicit, reversible canvas actions through the structured action results supplied to you. You may also retrieve, inspect, analyze, explain, compare, diagnose, summarize, reference, and suggest next steps. Never claim an action succeeded unless its tool result is marked successful.

The request includes an interactionFocus selected by the planning layer:
- conversation: answer naturally from the dialogue and supplied knowledge.
- attachment: focus on the image or images attached to this turn.
- canvas: focus on the whole canvas.
- selection: focus on selected canvas elements.
- northstar-data: focus on tenant-scoped apps, captured flows, screenshots, or app icons returned by tools.
- hybrid: combine only the explicitly relevant sources.

Operating rules:
1. Follow the user's actual subject. The canvas is ambient context and should not be mentioned unless relevant.
2. Ground claims only in completed tool results, supplied canvas context, recent conversation, and attached visuals.
3. Never expose internal canvas IDs, tenant IDs, session IDs, storage paths, or database identifiers in prose.
4. Refer to canvas objects naturally and refer to account data by readable app, flow, and screen names.
5. Write restrained, readable Markdown. Use short paragraphs and lists where they improve scanning.
6. When naming three or more distinct screens, findings, options, steps, or observations, use bullets or numbers.
7. Tool result cards already show app icons, flows, screenshots, and live canvas actions in the activity timeline. Do not repeat every item mechanically; synthesize what matters.
8. If a requested app, flow, screenshot, icon, or canvas action was not found or could not be completed, say so clearly.
9. Return canvas references only when existing canvas objects materially support the answer. Account-data tool results do not require canvas references.
10. When successful canvas actions are present, briefly summarize what changed in natural language without exposing IDs.
11. Suggested actions are rare. Show them only when a non-obvious next move materially helps.
12. Update conversationSummary with durable goals, decisions, preferences, completed work, and unresolved topics.
13. When a current tool result includes a resultView, the real entities are already visible as interactive Chat cards. Acknowledge and synthesize them, but never replace them with fabricated prose-only lists.
14. Put answer first in the structured response so it can stream smoothly.
15. The activity timeline is shown separately. Do not narrate every tool call again unless the user asks.
16. If executionGrounding.requiredDataTool is true, tenant apps, flows, screenshots, or icons may be named only from successful completedToolResults. Never invent substitutes.
17. If executionGrounding.requiredCanvasAction is true, do not claim the canvas changed unless verified canvas-action results are supplied. Server dispatch alone is not success.
18. When a required operation failed or did not execute, state that plainly. Never promise that it is happening "right now" after the run has already ended.
`.trim();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseThinkingDepth(value: unknown): ThinkingDepth {
  return value === "low" || value === "high" ? value : "medium";
}

function extractCodeArtifactContexts(value: unknown): SelectedCodeArtifactContext[] {
  if (!isRecord(value) || !Array.isArray(value.objects)) return [];
  const contexts: SelectedCodeArtifactContext[] = [];
  for (const rawObject of value.objects) {
    if (!isRecord(rawObject) || !isRecord(rawObject.codeArtifact)) continue;
    const artifact = rawObject.codeArtifact;
    const artifactId = getString(artifact.artifactId)?.trim();
    const revisionId = getString(artifact.revisionId)?.trim();
    const title = getString(artifact.title)?.trim();
    const sourceTsx = getString(artifact.sourceTsx)?.trim();
    const document = isRecord(artifact.document) &&
      artifact.document.schema === "northstar.web-artifact-document.v1" &&
      typeof artifact.document.html === "string" &&
      typeof artifact.document.css === "string" &&
      typeof artifact.document.javascript === "string"
        ? (artifact.document as unknown as NorthstarWebArtifactDocument)
        : undefined;
    if (!artifactId || !revisionId || !title || (!document && !sourceTsx)) continue;
    const dataBundle = isRecord(artifact.dataBundle) && artifact.dataBundle.version === "northstar.artifact-data.v0.2"
      ? (artifact.dataBundle as unknown as CanvasCodeArtifactDataBundle)
      : undefined;
    const creativeDirection = isRecord(artifact.creativeDirection)
      ? (artifact.creativeDirection as unknown as NorthstarCreativeDirection)
      : undefined;
    const runtimeReview = isRecord(artifact.runtimeReview)
      ? (artifact.runtimeReview as unknown as CanvasCodeArtifactRuntimeReview)
      : undefined;
    const mutationJournal = Array.isArray(artifact.mutationJournal)
      ? (artifact.mutationJournal as unknown as NorthstarArtboardMutationBatch[])
      : undefined;
    const stagePlan = Array.isArray(artifact.stagePlan)
      ? (artifact.stagePlan as unknown as CanvasCodeArtifactStage[])
      : undefined;
    const creativeReviews = Array.isArray(artifact.creativeReviews)
      ? (artifact.creativeReviews as unknown as NorthstarCreativeReview[])
      : undefined;
    const finiteNumber = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;
    const intrinsicBounds = isRecord(artifact.intrinsicBounds) &&
      finiteNumber(artifact.intrinsicBounds.minX) !== undefined &&
      finiteNumber(artifact.intrinsicBounds.minY) !== undefined &&
      finiteNumber(artifact.intrinsicBounds.maxX) !== undefined &&
      finiteNumber(artifact.intrinsicBounds.maxY) !== undefined
        ? artifact.intrinsicBounds as unknown as CanvasCodeArtifactIntrinsicBounds
        : undefined;
    contexts.push({
      artifactId,
      revisionId,
      parentRevisionId: getString(artifact.parentRevisionId)?.trim(),
      surfaceId: getString(artifact.surfaceId)?.trim(),
      title,
      description: getString(artifact.description)?.trim(),
      visualStrategy: getString(artifact.visualStrategy)?.trim(),
      artifactType: getString(artifact.artifactType)?.trim(),
      audience: getString(artifact.audience)?.trim(),
      thinkingDepth:
        artifact.thinkingDepth === "low" || artifact.thinkingDepth === "high"
          ? artifact.thinkingDepth
          : artifact.thinkingDepth === "medium"
            ? "medium"
            : undefined,
      document,
      mutationJournal,
      sourceTsx,
      dataBundle,
      stagePlan,
      preferredWidth: finiteNumber(artifact.preferredWidth),
      preferredHeight: finiteNumber(artifact.preferredHeight),
      layoutBaseWidth: finiteNumber(artifact.layoutBaseWidth),
      layoutBaseHeight: finiteNumber(artifact.layoutBaseHeight),
      intrinsicBounds,
      minimumWidth: finiteNumber(artifact.minimumWidth),
      minimumHeight: finiteNumber(artifact.minimumHeight),
      creativeDirection,
      creativeReviews,
      runtimeReview,
      diagnostics: Array.isArray(artifact.diagnostics)
        ? artifact.diagnostics.filter((value): value is string => typeof value === "string").slice(-60)
        : undefined,
      provisional: typeof artifact.provisional === "boolean" ? artifact.provisional : undefined,
      publicationState: artifact.publicationState === "verified" ? "verified" : artifact.publicationState === "working" ? "working" : undefined,
    });
  }
  return contexts;
}


function generatedPackageFromSelectedArtifact(input: {
  selected?: SelectedCodeArtifactContext;
  objective: string;
  audience: string;
  artifactType: string;
  thinkingDepth: ThinkingDepth;
}): NorthstarGeneratedCodeArtifactPackage | undefined {
  const selected = input.selected;
  if (!selected?.document || !selected.dataBundle) return undefined;
  const width = Math.max(720, Math.round(selected.preferredWidth ?? selected.intrinsicBounds?.maxX ?? 1600));
  const height = Math.max(540, Math.round(selected.preferredHeight ?? selected.intrinsicBounds?.maxY ?? 900));
  const stages: CanvasCodeArtifactStage[] = selected.stagePlan?.length
    ? selected.stagePlan
    : [
        { id: "foundation", phase: "foundation", label: "Establish the live foundation", message: "The one artboard is taking shape." },
        { id: "evidence", phase: "evidence", label: "Develop the evidence", message: "Grounded evidence is entering the same surface." },
        { id: "analysis", phase: "analysis", label: "Develop the visual argument", message: "The composition is revealing the core relationship." },
        { id: "recommendation", phase: "recommendation", label: "Resolve the decision", message: "The implication is becoming actionable." },
        { id: "refinement", phase: "refinement", label: "Refine the communication", message: "The same artboard is being finished." },
      ];
  return {
    schema: NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
    artifactId: selected.artifactId,
    revisionId: selected.revisionId,
    parentRevisionId: selected.parentRevisionId,
    surfaceId: selected.surfaceId ?? selected.artifactId,
    title: selected.title,
    description: selected.description ?? "Northstar live artboard",
    objective: input.objective,
    audience: selected.audience ?? input.audience,
    artifactType: selected.artifactType ?? input.artifactType,
    visualStrategy: selected.visualStrategy ?? "Continuously refine the selected living artboard in place.",
    document: selected.document,
    mutationJournal: selected.mutationJournal ?? [],
    sourceTsx: selected.sourceTsx,
    preferredWidth: width,
    preferredHeight: height,
    layoutBaseWidth: selected.layoutBaseWidth ?? width,
    layoutBaseHeight: selected.layoutBaseHeight ?? height,
    intrinsicBounds: selected.intrinsicBounds ?? { minX: 0, minY: 0, maxX: width, maxY: height },
    minimumWidth: Math.max(540, Math.round(selected.minimumWidth ?? width / 2)),
    minimumHeight: Math.max(380, Math.round(selected.minimumHeight ?? height / 2)),
    stages,
    dataBundle: selected.dataBundle,
    thinkingDepth: selected.thinkingDepth ?? input.thinkingDepth,
    creativeDirection: selected.creativeDirection,
    creativeReviews: selected.creativeReviews ?? [],
    runtimeReview: selected.runtimeReview,
    diagnostics: selected.diagnostics ?? [],
    provisional: selected.provisional ?? selected.publicationState !== "verified",
    publicationState: selected.publicationState ?? "working",
  };
}

function collectRecentCreativeSignatures(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.objects)) return [];
  const signatures: string[] = [];
  for (const rawObject of value.objects) {
    if (!isRecord(rawObject) || !isRecord(rawObject.codeArtifact)) continue;
    const direction = rawObject.codeArtifact.creativeDirection;
    if (!isRecord(direction) || !isRecord(direction.selectedConcept) || !Array.isArray(direction.selectedConcept.signature)) continue;
    const title = getString(rawObject.codeArtifact.title)?.trim();
    const signature = direction.selectedConcept.signature
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 10)
      .join(" / ");
    if (signature) signatures.push(title ? `${title}: ${signature}` : signature);
  }
  return Array.from(new Set(signatures)).slice(0, 24);
}

function executionDepthForThinking(value: ThinkingDepth): ExecutionDepth {
  return value === "low" ? "quick" : value === "high" ? "deep" : "balanced";
}

function thinkingDepthForExecution(value: ExecutionDepth): ThinkingDepth {
  return value === "quick" ? "low" : value === "deep" ? "high" : "medium";
}

function sanitizeWorkspacePlan(value: unknown): ResearchWorkspacePlan | undefined {
  if (!isRecord(value) || !Array.isArray(value.regions)) return undefined;
  const purposes = new Set(["objective", "app", "flow", "hypotheses", "decisions", "questions", "archive", "synthesis", "custom"]);
  const layouts = new Set(["row", "column", "grid", "cluster", "timeline", "mixed"]);
  const clamp = (input: unknown, fallback: number) =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.max(0, Math.min(100, input))
      : fallback;
  const regions = value.regions
    .filter(isRecord)
    .slice(0, 30)
    .map((region, index): ResearchWorkspaceRegion => ({
      id: getString(region.id)?.trim().slice(0, 160) || `workspace-region-${index + 1}`,
      title: getString(region.title)?.trim().slice(0, 240) || `Research region ${index + 1}`,
      purpose: purposes.has(getString(region.purpose) ?? "")
        ? (getString(region.purpose) as ResearchWorkspaceRegion["purpose"])
        : "custom",
      x: clamp(region.x, 4),
      y: clamp(region.y, 8),
      w: Math.max(8, clamp(region.w, 42)),
      h: Math.max(8, clamp(region.h, 30)),
      layout: layouts.has(getString(region.layout) ?? "")
        ? (getString(region.layout) as ResearchWorkspaceRegion["layout"])
        : "grid",
      appName: getString(region.appName)?.trim().slice(0, 180),
      flowName: getString(region.flowName)?.trim().slice(0, 240),
      evidenceIds: Array.isArray(region.evidenceIds)
        ? Array.from(new Set(region.evidenceIds.filter((item): item is string => typeof item === "string"))).slice(0, 80)
        : [],
      noteLabels: Array.isArray(region.noteLabels)
        ? Array.from(new Set(region.noteLabels.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 180)))).slice(0, 30)
        : [],
      emphasis: region.emphasis === "primary" || region.emphasis === "supporting" ? region.emphasis : "normal",
    }));
  if (regions.length === 0) return undefined;
  return {
    strategy: getString(value.strategy)?.trim().slice(0, 1_200) || "Organize the research so evidence, hypotheses, and decisions remain easy to follow.",
    canvasWidth: typeof value.canvasWidth === "number" && Number.isFinite(value.canvasWidth)
      ? Math.max(1200, Math.min(7200, value.canvasWidth))
      : 3200,
    canvasHeight: typeof value.canvasHeight === "number" && Number.isFinite(value.canvasHeight)
      ? Math.max(900, Math.min(7200, value.canvasHeight))
      : 2200,
    regions,
  };
}

function sanitizeCompositionCheckpoint(value: unknown): CompositionRunCheckpoint | null {
  if (!isRecord(value) || value.version !== "northstar.composition-checkpoint.v1") return null;
  const rawLedger = isRecord(value.ledger) ? value.ledger : null;
  if (!rawLedger) return null;
  const objective = getString(value.objective)?.trim().slice(0, 1_200);
  const artifactId = getString(value.artifactId)?.trim().slice(0, 320);
  if (!objective || !artifactId) return null;
  const observations = Array.isArray(rawLedger.observations)
    ? rawLedger.observations.filter(isRecord).slice(0, MAX_COMPOSITION_CHECKPOINT_SCREENS).map((item) => ({
        screenshotId: getString(item.screenshotId)?.slice(0, 320) || "",
        appName: getString(item.appName)?.slice(0, 180) || "",
        flowName: getString(item.flowName)?.slice(0, 240),
        screenName: getString(item.screenName)?.slice(0, 320) || "Untitled screen",
        journeyStage: getString(item.journeyStage)?.slice(0, 240),
        visibleCopy: Array.isArray(item.visibleCopy) ? item.visibleCopy.filter((v): v is string => typeof v === "string").slice(0, 12) : [],
        uiElements: Array.isArray(item.uiElements) ? item.uiElements.filter((v): v is string => typeof v === "string").slice(0, 12) : [],
        userGoal: getString(item.userGoal)?.slice(0, 600),
        notablePatterns: Array.isArray(item.notablePatterns) ? item.notablePatterns.filter((v): v is string => typeof v === "string").slice(0, 10) : [],
        frictionSignals: Array.isArray(item.frictionSignals) ? item.frictionSignals.filter((v): v is string => typeof v === "string").slice(0, 8) : [],
        trustSignals: Array.isArray(item.trustSignals) ? item.trustSignals.filter((v): v is string => typeof v === "string").slice(0, 8) : [],
        opportunities: Array.isArray(item.opportunities) ? item.opportunities.filter((v): v is string => typeof v === "string").slice(0, 8) : [],
        relevance: typeof item.relevance === "number" && Number.isFinite(item.relevance) ? Math.max(0, Math.min(1, item.relevance)) : 0.5,
        selectionReason: getString(item.selectionReason)?.slice(0, 600),
      })).filter((item) => item.screenshotId && item.appName)
    : [];
  const candidateScreens = Array.isArray(value.candidateScreens)
    ? value.candidateScreens.filter(isRecord).slice(0, MAX_COMPOSITION_CHECKPOINT_SCREENS).map((screen, index) => ({
        id: getString(screen.id)?.slice(0, 320) || `checkpoint-screen-${index + 1}`,
        appName: getString(screen.appName)?.slice(0, 180) || "",
        flowName: getString(screen.flowName)?.slice(0, 240),
        title: getString(screen.title)?.slice(0, 320) || "Untitled screen",
        imageUrl: getString(screen.imageUrl)?.slice(0, 2_000),
        platform: getString(screen.platform)?.slice(0, 80),
        sessionType: getString(screen.sessionType)?.slice(0, 80),
        index: typeof screen.index === "number" && Number.isFinite(screen.index) ? screen.index : undefined,
      })).filter((screen) => screen.id && screen.appName)
    : [];
  const selectedFlows: CompositionCheckpointFlow[] = Array.isArray(value.selectedFlows)
    ? value.selectedFlows
        .filter(isRecord)
        .map((flow): CompositionCheckpointFlow | null => {
          const appName = getString(flow.appName)?.trim().slice(0, 180);
          const flowId = getString(flow.flowId)?.trim().slice(0, 320);
          const flowName = getString(flow.flowName)?.trim().slice(0, 240);
          if (!appName || !flowId || !flowName) return null;
          return {
            appName,
            flowId,
            flowName,
            platform: getString(flow.platform)?.trim().slice(0, 80),
            sessionType: getString(flow.sessionType)?.trim().slice(0, 80),
            screenIds: Array.isArray(flow.screenIds)
              ? Array.from(new Set(flow.screenIds.filter((item): item is string => typeof item === "string"))).slice(0, 40)
              : candidateScreens.filter((screen) => screen.appName === appName && screen.flowName === flowName).map((screen) => screen.id),
          };
        })
        .filter((flow): flow is CompositionCheckpointFlow => Boolean(flow))
    : [];
  const phases = new Set(["research", "review", "blueprint", "building", "completed", "failed"]);
  const executionDepth: ExecutionDepth = value.executionDepth === "quick" || value.executionDepth === "deep" ? value.executionDepth : "balanced";
  const thinkingDepth = parseThinkingDepth(value.thinkingDepth ?? thinkingDepthForExecution(executionDepth));
  const ledger: CompositionResearchLedger = {
    objective,
    inspectedScreenshotIds: Array.isArray(rawLedger.inspectedScreenshotIds)
      ? Array.from(new Set(rawLedger.inspectedScreenshotIds.filter((item): item is string => typeof item === "string"))).slice(0, MAX_COMPOSITION_CHECKPOINT_SCREENS)
      : observations.map((item) => item.screenshotId),
    batches: Array.isArray(rawLedger.batches)
      ? rawLedger.batches.filter(isRecord).slice(0, 80).map((batch, index) => ({
          batchIndex: typeof batch.batchIndex === "number" ? batch.batchIndex : index + 1,
          screenshotIds: Array.isArray(batch.screenshotIds) ? batch.screenshotIds.filter((item): item is string => typeof item === "string").slice(0, COMPOSITION_VISUAL_BATCH_MAX) : [],
          summary: getString(batch.summary)?.slice(0, 1_600) || "",
        }))
      : [],
    observations,
    flowSyntheses: Array.isArray(rawLedger.flowSyntheses) ? rawLedger.flowSyntheses.filter(isRecord).slice(0, 50) as unknown as CompositionFlowSynthesis[] : [],
    appSyntheses: Array.isArray(rawLedger.appSyntheses) ? rawLedger.appSyntheses.filter(isRecord).slice(0, 20) as unknown as CompositionAppSynthesis[] : [],
    hypotheses: Array.isArray(rawLedger.hypotheses) ? rawLedger.hypotheses.filter(isRecord).slice(0, 20) as unknown as CompositionResearchLedger["hypotheses"] : [],
    openQuestions: Array.isArray(rawLedger.openQuestions) ? rawLedger.openQuestions.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    decisions: Array.isArray(rawLedger.decisions) ? rawLedger.decisions.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    corrections: Array.isArray(rawLedger.corrections) ? rawLedger.corrections.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    researchRounds: typeof rawLedger.researchRounds === "number" && Number.isFinite(rawLedger.researchRounds) ? Math.max(0, Math.min(12, rawLedger.researchRounds)) : 0,
    coverageSummary: getString(rawLedger.coverageSummary)?.slice(0, 3_000) || "",
    workspacePlan: sanitizeWorkspacePlan(rawLedger.workspacePlan),
  };
  return {
    version: "northstar.composition-checkpoint.v1",
    runId: getString(value.runId)?.slice(0, 320),
    artifactId,
    objective,
    phase: phases.has(getString(value.phase) ?? "")
      ? (getString(value.phase) as CompositionRunCheckpoint["phase"])
      : "research",
    executionDepth,
    thinkingDepth,
    workingVisibility: value.workingVisibility === "compact" || value.workingVisibility === "hidden" ? value.workingVisibility : "visible",
    audience: value.audience === "executive" || value.audience === "product" || value.audience === "design" || value.audience === "research" ? value.audience : "general",
    artifactType: (["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] as ArtifactType[]).includes(value.artifactType as ArtifactType) ? value.artifactType as ArtifactType : "freeform",
    requestedApps: Array.isArray(value.requestedApps) ? Array.from(new Set(value.requestedApps.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 180)))).slice(0, 20) : [],
    sessionType: value.sessionType === "onboarding" || value.sessionType === "browsing" ? value.sessionType : undefined,
    platform: value.platform === "mobile" || value.platform === "web" ? value.platform : undefined,
    candidateScreens,
    selectedFlows,
    ledger,
    updatedAt: getString(value.updatedAt)?.slice(0, 80) || new Date().toISOString(),
  };
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: typeof item.content === "string" ? item.content.slice(0, 16_000) : "",
    }))
    .filter((item) => item.content.trim().length > 0)
    .slice(-24);
}

function parseHistoryToolContext(value: unknown): HistoryToolContextEntry[] {
  if (!Array.isArray(value)) return [];

  const allowedViewKinds = new Set([
    "apps",
    "app",
    "flows",
    "flow",
    "screenshots",
    "screenshot",
  ]);

  const entries: HistoryToolContextEntry[] = [];

  for (const rawEntry of value.filter(isRecord).slice(-32)) {
    const tool = getString(rawEntry.tool)?.slice(0, 120);
    if (!tool) continue;

    let resultView: NorthStarToolResultView | undefined;
    if (isRecord(rawEntry.resultView)) {
      const kind = getString(rawEntry.resultView.kind);
      const title = getString(rawEntry.resultView.title)?.slice(0, 240);
      const rawItems = Array.isArray(rawEntry.resultView.items)
        ? rawEntry.resultView.items.filter(isRecord).slice(0, 16)
        : [];

      if (kind && allowedViewKinds.has(kind) && title) {
        resultView = {
          kind: kind as NorthStarToolResultView["kind"],
          title,
          emptyMessage: getString(rawEntry.resultView.emptyMessage)?.slice(0, 320),
          items: rawItems.map((item, index) => ({
            id: getString(item.id)?.slice(0, 240) || `history-item-${index + 1}`,
            kind:
              item.kind === "app" || item.kind === "flow" || item.kind === "screenshot"
                ? item.kind
                : "flow",
            title: getString(item.title)?.slice(0, 320) || "Untitled result",
            subtitle: getString(item.subtitle)?.slice(0, 420),
            imageUrl: getString(item.imageUrl)?.slice(0, 2_000),
            appName: getString(item.appName)?.slice(0, 180),
            flowName: getString(item.flowName)?.slice(0, 240),
            category: getString(item.category)?.slice(0, 240),
            platform: getString(item.platform)?.slice(0, 80),
            sessionType: getString(item.sessionType)?.slice(0, 80),
            screenCount:
              typeof item.screenCount === "number" && Number.isFinite(item.screenCount)
                ? item.screenCount
                : undefined,
            screenshotIndex:
              typeof item.screenshotIndex === "number" && Number.isFinite(item.screenshotIndex)
                ? item.screenshotIndex
                : undefined,
            thumbnails: Array.isArray(item.thumbnails)
              ? item.thumbnails
                  .filter(isRecord)
                  .slice(0, 16)
                  .map((thumbnail, thumbnailIndex) => ({
                    id:
                      getString(thumbnail.id)?.slice(0, 240) ||
                      `history-thumbnail-${thumbnailIndex + 1}`,
                    title: getString(thumbnail.title)?.slice(0, 240) || "Screenshot",
                    imageUrl: getString(thumbnail.imageUrl)?.slice(0, 2_000),
                  }))
              : undefined,
          })),
        };
      }
    }

    entries.push({
      messageId: getString(rawEntry.messageId)?.slice(0, 160) || makeId("history-tool"),
      planTitle: getString(rawEntry.planTitle)?.slice(0, 240),
      tool,
      detail: getString(rawEntry.detail)?.slice(0, 640),
      resultView,
    });
  }

  return entries.slice(-24);
}

function findRecentToolContextAppName(
  entries: HistoryToolContextEntry[],
): string | undefined {
  for (const entry of entries.slice().reverse()) {
    const items = entry.resultView?.items ?? [];
    for (const item of items.slice().reverse()) {
      if (item.appName?.trim()) return item.appName.trim();
      if (item.kind === "app" && item.title.trim()) return item.title.trim();
    }
  }
  return undefined;
}

function findRecentToolContextFlow(
  entries: HistoryToolContextEntry[],
  preferredAppName?: string,
): { appName?: string; flowName: string } | undefined {
  const preferred = preferredAppName ? normalizeLookup(preferredAppName) : "";

  for (const entry of entries.slice().reverse()) {
    const items = entry.resultView?.items ?? [];
    const candidates = items
      .slice()
      .reverse()
      .filter((item) => item.kind === "flow" && item.title.trim())
      .sort((a, b) => {
        if (!preferred) return 0;
        const aMatches = normalizeLookup(a.appName ?? "") === preferred ? 1 : 0;
        const bMatches = normalizeLookup(b.appName ?? "") === preferred ? 1 : 0;
        return bMatches - aMatches;
      });

    const candidate = candidates[0];
    if (candidate) {
      return {
        appName: candidate.appName?.trim(),
        flowName: candidate.flowName?.trim() || candidate.title.trim(),
      };
    }
  }

  return undefined;
}

function findCatalogAppByName(
  catalog: NorthStarDataCatalog,
  appName?: string,
): NorthStarDataApp | undefined {
  if (!appName) return undefined;
  const normalized = normalizeLookup(appName);
  return catalog.apps.find((app) => normalizeLookup(app.name) === normalized);
}

function findCatalogFlowFromToolContext(
  catalog: NorthStarDataCatalog,
  entries: HistoryToolContextEntry[],
  preferredApp?: NorthStarDataApp,
): { app: NorthStarDataApp; flow: NorthStarDataFlow } | undefined {
  const recent = findRecentToolContextFlow(entries, preferredApp?.name);
  if (!recent) return undefined;

  const app =
    findCatalogAppByName(catalog, recent.appName) ??
    preferredApp ??
    catalog.apps.find((candidate) =>
      candidate.flows.some(
        (flow) => normalizeLookup(flow.name) === normalizeLookup(recent.flowName),
      ),
    );
  if (!app) return undefined;

  const flow = app.flows.find(
    (candidate) =>
      normalizeLookup(candidate.name) === normalizeLookup(recent.flowName),
  );
  return flow ? { app, flow } : undefined;
}

function getObjectIdsFromContext(context: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(context)) return ids;

  const collections = [
    context.objects,
    context.selectedObjects,
    context.connectedObjects,
    context.nearbyObjects,
  ];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const object of collection) {
      if (!isRecord(object)) continue;
      const id = getString(object.id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function scrubInternalIds(value: string, validObjectIds: Set<string>): string {
  let result = value;
  result = result.replace(
    /\s*\(?(?:object\s+)?id\s*[:#-]?\s*[0-9a-f]{8}-[0-9a-f-]{27,}\)?/gi,
    "",
  );

  for (const id of validObjectIds) {
    if (id) result = result.split(id).join("the referenced canvas element");
  }

  result = result.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    "the referenced canvas element",
  );
  return result.replace(/[ \t]{2,}/g, " ").trim();
}

function sanitizeReferences(value: unknown, validObjectIds: Set<string>): CanvasAIReference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const references: CanvasAIReference[] = [];

  for (const entry of value) {
    if (!isRecord(entry) || !Array.isArray(entry.objectIds)) continue;
    const objectIds = Array.from(
      new Set(
        entry.objectIds.filter(
          (id): id is string => typeof id === "string" && validObjectIds.has(id),
        ),
      ),
    );
    if (objectIds.length === 0) continue;
    const key = objectIds.slice().sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    references.push({
      objectIds,
      label: scrubInternalIds(
        getString(entry.label)?.slice(0, 160) || "Canvas reference",
        validObjectIds,
      ),
      reason: getString(entry.reason)
        ? scrubInternalIds(getString(entry.reason)!.slice(0, 360), validObjectIds)
        : undefined,
    });
    if (references.length >= 6) break;
  }
  return references;
}

function sanitizeSuggestedActions(
  value: unknown,
  validObjectIds: Set<string>,
): CanvasAISuggestedAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => ({
      type: getString(entry.type)?.slice(0, 80) || "review",
      targetObjectIds: Array.isArray(entry.targetObjectIds)
        ? Array.from(
            new Set(
              entry.targetObjectIds.filter(
                (id): id is string => typeof id === "string" && validObjectIds.has(id),
              ),
            ),
          )
        : [],
      description: scrubInternalIds(
        getString(entry.description)?.slice(0, 500) || "Review the relevant canvas elements.",
        validObjectIds,
      ),
    }))
    .slice(0, 5);
}

function parseJsonResponse<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(trimmed) as T;
}

function extractGeminiText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return "";
  const candidate = payload.candidates.find(isRecord);
  if (!candidate || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    return "";
  }
  return candidate.content.parts
    .filter(isRecord)
    .map((part) => getString(part.text) ?? "")
    .join("");
}

type GeminiFailureKind =
  | "authentication"
  | "permission"
  | "billing"
  | "rate-limit"
  | "quota"
  | "model-unavailable"
  | "network"
  | "invalid-request"
  | "invalid-response"
  | "unknown";

class GeminiCallError extends Error {
  readonly status: number;
  readonly kind: GeminiFailureKind;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly providerCode?: string;

  constructor(input: {
    message: string;
    status: number;
    kind: GeminiFailureKind;
    retryable: boolean;
    retryAfterSeconds?: number;
    providerCode?: string;
  }) {
    super(input.message);
    this.name = "GeminiCallError";
    this.status = input.status;
    this.kind = input.kind;
    this.retryable = input.retryable;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.providerCode = input.providerCode;
  }
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3_600, Math.ceil(seconds));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.min(3_600, Math.ceil((date - Date.now()) / 1_000)));
}

function classifyGeminiFailure(input: {
  status: number;
  message: string;
  providerCode?: string;
  retryAfterSeconds?: number;
}): GeminiCallError {
  const normalized = `${input.providerCode ?? ""} ${input.message}`.toLowerCase();
  let kind: GeminiFailureKind = "unknown";
  let retryable = input.status >= 500;

  if (
    normalized.includes("prepayment") ||
    normalized.includes("billing") ||
    normalized.includes("payment required") ||
    normalized.includes("credit") && normalized.includes("deplet")
  ) {
    kind = "billing";
    retryable = false;
  } else if (input.status === 401 || normalized.includes("api key not valid") || normalized.includes("unauthenticated")) {
    kind = "authentication";
    retryable = false;
  } else if (input.status === 403 || normalized.includes("permission denied") || normalized.includes("forbidden")) {
    kind = "permission";
    retryable = false;
  } else if (
    normalized.includes("model") &&
    (normalized.includes("not found") || normalized.includes("not available") || normalized.includes("unsupported"))
  ) {
    kind = "model-unavailable";
    retryable = false;
  } else if (
    input.status === 429 &&
    (normalized.includes("quota") || normalized.includes("resource_exhausted")) &&
    !normalized.includes("rate")
  ) {
    kind = "quota";
    retryable = Boolean(input.retryAfterSeconds);
  } else if (input.status === 429 || normalized.includes("rate limit") || normalized.includes("too many requests")) {
    kind = "rate-limit";
    retryable = true;
  } else if (
    input.status === 400 ||
    normalized.includes("invalid_argument") ||
    normalized.includes("invalid argument") ||
    normalized.includes("malformed request")
  ) {
    kind = "invalid-request";
    retryable = false;
  }

  return new GeminiCallError({
    message: input.message,
    status: input.status,
    kind,
    retryable,
    retryAfterSeconds: input.retryAfterSeconds,
    providerCode: input.providerCode,
  });
}

function isGeminiInfrastructureError(error: unknown): error is GeminiCallError {
  return error instanceof GeminiCallError && error.kind !== "invalid-response";
}

function throwIfGeminiInfrastructureError(error: unknown): void {
  if (isGeminiInfrastructureError(error)) throw error;
}

function summarizeGeminiFailure(error: GeminiCallError): string {
  const labels: Record<GeminiFailureKind, string> = {
    authentication: "API authentication",
    permission: "project or model permission",
    billing: "billing or prepayment",
    "rate-limit": "temporary rate limit",
    quota: "API quota",
    "model-unavailable": "model availability",
    network: "provider network",
    "invalid-request": "request-shape or structured-output schema",
    "invalid-response": "invalid model response",
    unknown: "provider request",
  };
  const nextStep: Record<GeminiFailureKind, string> = {
    authentication: "Verify that GEMINI_API_KEY is the intended active key, then restart the server.",
    permission: "Verify that the key's Google project can use this model and API.",
    billing: "Restore prepaid credit or billing capacity for the Google project attached to GEMINI_API_KEY.",
    "rate-limit": error.retryAfterSeconds
      ? `Retry after approximately ${error.retryAfterSeconds} seconds.`
      : "Wait briefly and retry, or review the project's request-rate limits.",
    quota: error.retryAfterSeconds
      ? `Quota may reset; retry after approximately ${error.retryAfterSeconds} seconds.`
      : "Review the project's quota and usage limits before retrying.",
    "model-unavailable": `Confirm that ${GEMINI_MODEL} is enabled and available to the active project.`,
    network: "Retry after connectivity to Google AI is restored.",
    "invalid-request": "Review the request shape or structured-output schema. Northstar already retried without provider-side schema before surfacing this error.",
    "invalid-response": "Northstar should retry the model output with a stricter repair instruction.",
    unknown: "Review the provider message and active Google project configuration.",
  };
  const providerMessage = error.message.replace(/\s+/g, " ").trim().slice(0, 700);
  return [
    `Northstar stopped because Google AI reported a ${labels[error.kind]} problem while using ${GEMINI_MODEL}.`,
    `HTTP status: ${error.status || "unknown"}.`,
    error.providerCode ? `Provider code: ${error.providerCode}.` : "",
    providerMessage ? `Provider message: ${providerMessage}` : "",
    `Next step: ${nextStep[error.kind]}`,
    "Any completed research and the latest valid live artifact remain preserved. No generic fallback was presented as finished work.",
  ].filter(Boolean).join("\n");
}

async function callGeminiJson<T>({
  apiKey,
  systemInstruction,
  contents,
  schema,
  signal,
  maxOutputTokens,
  temperature,
}: {
  apiKey: string;
  systemInstruction: string;
  contents: unknown[];
  schema: unknown;
  signal: AbortSignal;
  maxOutputTokens: number;
  temperature?: number;
}): Promise<T> {
  let lastError: unknown;
  const requestedTemperature =
    typeof temperature === "number" && Number.isFinite(temperature)
      ? Math.max(0, Math.min(1, temperature))
      : 0.15;
  const attempts: Array<{ useProviderSchema: boolean; temperature: number }> = [
    // Prefer provider-enforced JSON Schema when the selected model accepts it.
    { useProviderSchema: true, temperature: requestedTemperature },
    // A 400 INVALID_ARGUMENT can be specific to schema complexity or support.
    // Retry the same task without provider-side schema before treating it as infrastructure failure.
    { useProviderSchema: false, temperature: requestedTemperature },
    // Last repair pass: prompt-enforced JSON with lower variance.
    { useProviderSchema: false, temperature: Math.min(requestedTemperature, 0.18) },
  ];

  for (let attempt = 0; attempt < attempts.length; attempt += 1) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const configuration = attempts[attempt];
    try {
      const schemaPrompt = configuration.useProviderSchema
        ? ""
        : `\n\nThe provider-side schema constraint is unavailable for this retry. Return only one JSON value that conforms to this schema:\n${JSON.stringify(schema)}`;
      const generationConfig: Record<string, unknown> = {
        temperature: configuration.temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
      };
      if (configuration.useProviderSchema) generationConfig.responseJsonSchema = schema;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text:
                  `${systemInstruction}${schemaPrompt}` +
                  (attempt === 0
                    ? ""
                    : "\n\nReturn one valid JSON response only. Do not include markdown fences or commentary."),
              }],
            },
            contents,
            generationConfig,
          }),
          cache: "no-store",
          signal,
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        const providerError = payload && isRecord(payload.error) ? payload.error : undefined;
        const message = getString(providerError?.message) || "The model request could not be completed.";
        const providerCode = getString(providerError?.status) || getString(providerError?.code);
        throw classifyGeminiFailure({
          status: response.status,
          message,
          providerCode,
          retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
        });
      }

      const payload = (await response.json()) as unknown;
      const text = extractGeminiText(payload);
      if (!text.trim()) {
        throw new GeminiCallError({
          message: "The model returned an empty response.",
          status: 502,
          kind: "invalid-response",
          retryable: true,
        });
      }
      try {
        return parseJsonResponse<T>(text);
      } catch (error) {
        throw new GeminiCallError({
          message: error instanceof Error
            ? `The model returned invalid JSON: ${error.message}`
            : "The model returned invalid JSON.",
          status: 502,
          kind: "invalid-response",
          retryable: true,
        });
      }
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      const normalizedError = error instanceof GeminiCallError
        ? error
        : new GeminiCallError({
            message: error instanceof Error ? error.message : "The provider request failed.",
            status: 503,
            kind: "network",
            retryable: true,
          });
      lastError = normalizedError;

      // Provider-side structured-output schemas can be rejected with a generic
      // 400 INVALID_ARGUMENT even when the model, key, prompt, and data are valid.
      // This is a recoverable request-shape problem: immediately retry the same
      // task with the schema embedded in the prompt instead of stopping the run.
      const shouldRetryWithoutProviderSchema =
        configuration.useProviderSchema && normalizedError.kind === "invalid-request";
      if (shouldRetryWithoutProviderSchema) continue;

      if (!normalizedError.retryable) throw normalizedError;
      if (attempt < attempts.length - 1) {
        const providerDelay = normalizedError.retryAfterSeconds
          ? Math.min(8_000, normalizedError.retryAfterSeconds * 1_000)
          : 300 * (attempt + 1) ** 2;
        await new Promise((resolve) => setTimeout(resolve, providerDelay));
      }
    }
  }

  throw lastError instanceof GeminiCallError
    ? lastError
    : new GeminiCallError({
        message: "The model request could not be completed.",
        status: 502,
        kind: "unknown",
        retryable: false,
      });
}

function collectSelectedVisualCandidates(selectedContext: unknown) {
  if (!isRecord(selectedContext) || !Array.isArray(selectedContext.selectedObjects)) {
    return [] as Array<{ id: string; url: string; label: string }>;
  }

  const candidates: Array<{ id: string; url: string; label: string }> = [];
  for (const object of selectedContext.selectedObjects) {
    if (!isRecord(object)) continue;
    const id = getString(object.id);
    const type = getString(object.type);
    if (!id || (type !== "image" && type !== "screenshot")) continue;

    const source = isRecord(object.source) ? object.source : undefined;
    const content = isRecord(object.content) ? object.content : undefined;
    const image = content && isRecord(content.image) ? content.image : undefined;
    const interpretation = isRecord(object.interpretation) ? object.interpretation : undefined;
    const url = getString(source?.screenshotUrl) ?? getString(image?.url);
    if (!url || !/^https?:\/\//i.test(url)) continue;

    candidates.push({
      id,
      url,
      label:
        getString(interpretation?.label) ??
        getString(source?.screenLabel) ??
        "Selected canvas image",
    });
    if (candidates.length >= MAX_VISUALS) break;
  }
  return candidates;
}

function parseUserVisualParts(
  value: unknown,
  sourceLabel = "Image attached directly by the user",
): { parts: GeminiPart[]; count: number; names: string[] } {
  if (!Array.isArray(value)) return { parts: [], count: 0, names: [] };

  const parts: GeminiPart[] = [];
  const names: string[] = [];
  let count = 0;

  for (const rawAttachment of value.slice(0, MAX_VISUALS)) {
    if (!isRecord(rawAttachment)) continue;
    const mimeType = getString(rawAttachment.mimeType);
    const data = getString(rawAttachment.data);
    const name = getString(rawAttachment.name) || "User-attached image";
    if (!mimeType?.startsWith("image/") || !data) continue;
    if (data.length > Math.ceil((MAX_VISUAL_BYTES * 4) / 3) + 32) continue;

    let bytes: Buffer;
    try {
      bytes = Buffer.from(data, "base64");
    } catch {
      continue;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_VISUAL_BYTES) continue;

    parts.push(
      { text: `${sourceLabel}: ${name}` },
      { inlineData: { mimeType, data } },
    );
    names.push(name);
    count += 1;
  }

  return { parts, count, names };
}

async function fetchVisualPart(
  candidate: { id: string; url: string; label: string },
  outerSignal: AbortSignal,
): Promise<GeminiPart[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const abortFromOuter = () => controller.abort();
  outerSignal.addEventListener("abort", abortFromOuter, { once: true });

  try {
    const response = await fetch(candidate.url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return [];

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (!mimeType?.startsWith("image/")) return [];

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_VISUAL_BYTES) return [];

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_VISUAL_BYTES) return [];

    return [
      { text: `Attached visual for a selected canvas object: ${candidate.label}` },
      { inlineData: { mimeType, data: bytes.toString("base64") } },
    ];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
    outerSignal.removeEventListener("abort", abortFromOuter);
  }
}

function canvasHasArtifactRole(context: unknown, artifactId: string, role: string): boolean {
  if (!artifactId) return false;
  return collectObjects(context).some((object) => {
    const semantic = isRecord(object.semantic) ? object.semantic : undefined;
    return getString(semantic?.artifactId) === artifactId && getString(semantic?.role) === role;
  });
}

function collectObjects(context: unknown, key = "objects"): Record<string, unknown>[] {
  if (!isRecord(context) || !Array.isArray(context[key])) return [];
  return context[key].filter(isRecord);
}

function objectLabel(object: Record<string, unknown>): string {
  const interpretation = isRecord(object.interpretation) ? object.interpretation : undefined;
  const semantic = isRecord(object.semantic) ? object.semantic : undefined;
  const source = isRecord(object.source) ? object.source : undefined;
  return (
    getString(interpretation?.label) ??
    getString(semantic?.label) ??
    getString(source?.screenLabel) ??
    getString(source?.flowName) ??
    getString(object.subtype) ??
    getString(object.type) ??
    "canvas object"
  );
}

function canvasObjectReference(object: Record<string, unknown>): string {
  const compact = compactObject(object);
  const type = getString(compact.type);
  const subtype = getString(compact.subtype);
  const source: Record<string, unknown> = isRecord(compact.source)
    ? compact.source
    : {};
  const sourceKind = getString(source.kind);
  const appName = getString(source.appName);

  if (
    type === "screenshot" ||
    (type === "image" && sourceKind === "northstar-screenshot")
  ) {
    return appName ? `the ${appName} screenshot` : "the screenshot";
  }
  if (subtype === "circle" || type === "circle") return "the circle";
  if (subtype === "ellipse") return "the ellipse";
  if (subtype === "rect") return "the rectangle";
  if (subtype === "diamond") return "the diamond";
  if (subtype === "triangle") return "the triangle";
  if (type === "connector") return "the connector";
  if (type === "note") return "the note";
  if (type === "text") return "the text";
  if (type === "image") return "the image";
  if (type === "table") return "the table";
  if (type === "frame") return "the frame";
  if (type === "card") return "the card";
  return "the canvas item";
}

function canvasObjectById(
  canvasContext: unknown,
  objectId: string,
): Record<string, unknown> | undefined {
  return collectObjects(canvasContext).find(
    (object) => getString(object.id) === objectId,
  );
}

function canonicalCanvasTargetQuery({
  canvasContext,
  selectedCanvasContext,
  query,
  validObjectIds,
}: {
  canvasContext: unknown;
  selectedCanvasContext: unknown;
  query?: string;
  validObjectIds: Set<string>;
}): string | undefined {
  const matchedIds = semanticCanvasMatches(
    canvasContext,
    query,
    validObjectIds,
    4,
  );
  const selectedIds = selectedIdsFromContext(
    selectedCanvasContext,
    validObjectIds,
  );
  const candidateIds =
    matchedIds.length > 0
      ? matchedIds
      : selectedIds.length === 1
        ? selectedIds
        : [];

  if (candidateIds.length === 0) return query?.trim() || undefined;

  const references = candidateIds
    .map((id) => canvasObjectById(canvasContext, id))
    .filter((object): object is Record<string, unknown> => Boolean(object))
    .map(canvasObjectReference);

  if (references.length === 1) return references[0];
  if (references.length > 1 && references.every((value) => value === references[0])) {
    if (references[0] === "the circle") return "the circles";
    if (references[0].includes("screenshot")) return "the screenshots";
  }

  return query?.trim() || undefined;
}

function compactObject(object: Record<string, unknown>) {
  const content = isRecord(object.content) ? object.content : undefined;
  const source = isRecord(object.source) ? object.source : undefined;
  const relationships = isRecord(object.relationships) ? object.relationships : undefined;
  return {
    id: getString(object.id),
    type: getString(object.type),
    subtype: getString(object.subtype),
    label: objectLabel(object),
    bounds: object.bounds,
    rotation: object.rotation,
    zIndex: object.zIndex,
    textPreview:
      getString(content?.plainTextPreview) ??
      getString(content?.plainText)?.slice(0, 800),
    source: source
      ? {
          kind: source.kind,
          appName: source.appName,
          flowName: source.flowName,
          flowType: source.flowType,
          screenLabel: source.screenLabel,
          stepIndex: source.stepIndex,
        }
      : undefined,
    connectedTo: Array.isArray(relationships?.connectedTo)
      ? relationships?.connectedTo
      : undefined,
    capabilities: object.capabilities,
  };
}

function uniqueValidIds(values: unknown[], validObjectIds: Set<string>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string" && validObjectIds.has(value))),
  );
}

function stringifySearchable(value: unknown): string {
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return "";
  }
}

function executeReadOnlyTool({
  step,
  canvasContext,
  selectedCanvasContext,
  validObjectIds,
}: {
  step: PlannerStep;
  canvasContext: unknown;
  selectedCanvasContext: unknown;
  validObjectIds: Set<string>;
}): ToolResult {
  const allObjects = collectObjects(canvasContext);
  const selectedObjects = collectObjects(selectedCanvasContext, "selectedObjects");

  switch (step.tool) {
    case "inspect_canvas_overview": {
      const context = isRecord(canvasContext) ? canvasContext : {};
      const representative = allObjects.slice(0, 40).map(compactObject);
      const objectIds = uniqueValidIds(
        representative.map((object) => object.id),
        validObjectIds,
      );
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: `Reviewed ${allObjects.length} canvas ${allObjects.length === 1 ? "object" : "objects"}.`,
        objectIds,
        data: {
          summary: context.summary,
          viewport: context.viewport,
          documentBounds: context.documentBounds,
          representativeObjects: representative,
        },
        ok: true,
      };
    }

    case "inspect_selection": {
      const context = isRecord(selectedCanvasContext) ? selectedCanvasContext : {};
      const connected = collectObjects(selectedCanvasContext, "connectedObjects");
      const nearby = collectObjects(selectedCanvasContext, "nearbyObjects");
      const objectIds = uniqueValidIds(
        [...selectedObjects, ...connected, ...nearby].map((object) => object.id),
        validObjectIds,
      );
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail:
          selectedObjects.length > 0
            ? `Inspected ${selectedObjects.length} selected ${selectedObjects.length === 1 ? "object" : "objects"}.`
            : "There is no active canvas selection.",
        objectIds,
        data: {
          interpretation: context.suggestedInterpretation,
          selectionBounds: context.selectionBounds,
          editableState: context.editableState,
          selectedObjects: selectedObjects.map(compactObject),
          connectedObjects: connected.map(compactObject),
          nearbyObjects: nearby.map(compactObject),
        },
        ok: selectedObjects.length > 0,
      };
    }

    case "inspect_flow_artifacts": {
      const context = isRecord(canvasContext) ? canvasContext : {};
      const flows = Array.isArray(context.flows) ? context.flows.filter(isRecord) : [];
      const objectIds = uniqueValidIds(
        flows.flatMap((flow) =>
          Array.isArray(flow.objectIds)
            ? flow.objectIds
            : Array.isArray(flow.screenshotObjectIds)
              ? flow.screenshotObjectIds
              : [],
        ),
        validObjectIds,
      );
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: `Found ${flows.length} inserted flow ${flows.length === 1 ? "artifact" : "artifacts"}.`,
        objectIds,
        data: flows.slice(0, 30),
        ok: true,
      };
    }

    case "inspect_relationships": {
      const context = isRecord(canvasContext) ? canvasContext : {};
      const relationships = isRecord(context.relationships) ? context.relationships : {};
      const connectors = Array.isArray(relationships.connectors)
        ? relationships.connectors.filter(isRecord)
        : [];
      const objectIds = uniqueValidIds(
        connectors.flatMap((connector) => [
          connector.connectorId,
          connector.fromObjectId,
          connector.toObjectId,
        ]),
        validObjectIds,
      );
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: `Reviewed ${connectors.length} connector ${connectors.length === 1 ? "relationship" : "relationships"}.`,
        objectIds,
        data: {
          connectors,
          overlaps: relationships.overlaps,
          proximity: relationships.proximity,
          alignment: relationships.alignment,
        },
        ok: true,
      };
    }

    case "inspect_spatial_layout": {
      const candidates = selectedObjects.length > 0 ? selectedObjects : allObjects;
      const sorted = candidates
        .slice()
        .sort((a, b) => {
          const aBounds = isRecord(a.bounds) ? a.bounds : {};
          const bBounds = isRecord(b.bounds) ? b.bounds : {};
          const ay = typeof aBounds.y === "number" ? aBounds.y : 0;
          const by = typeof bBounds.y === "number" ? bBounds.y : 0;
          if (Math.abs(ay - by) > 8) return ay - by;
          const ax = typeof aBounds.x === "number" ? aBounds.x : 0;
          const bx = typeof bBounds.x === "number" ? bBounds.x : 0;
          return ax - bx;
        })
        .slice(0, 120)
        .map(compactObject);
      const objectIds = uniqueValidIds(sorted.map((object) => object.id), validObjectIds);
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: `Mapped the position and size of ${sorted.length} ${sorted.length === 1 ? "object" : "objects"}.`,
        objectIds,
        data: sorted,
        ok: true,
      };
    }

    case "inspect_text_content": {
      const candidates = (selectedObjects.length > 0 ? selectedObjects : allObjects).filter((object) => {
        const type = getString(object.type);
        return type === "text" || type === "note" || type === "card" || type === "shape";
      });
      const textObjects = candidates
        .map(compactObject)
        .filter((object) => typeof object.textPreview === "string" && object.textPreview.trim().length > 0)
        .slice(0, 80);
      const objectIds = uniqueValidIds(textObjects.map((object) => object.id), validObjectIds);
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: `Read ${textObjects.length} text-bearing ${textObjects.length === 1 ? "object" : "objects"}.`,
        objectIds,
        data: textObjects,
        ok: true,
      };
    }

    case "find_relevant_objects": {
      const query = (step.arguments?.query ?? "").trim();
      const matchedIds = semanticCanvasMatches(
        canvasContext,
        query,
        validObjectIds,
        step.arguments?.limit ?? 40,
      );
      const byId = new Map(allObjects.map((object) => [getString(object.id), object]));
      const ranked = matchedIds
        .map((id) => byId.get(id))
        .filter((object): object is Record<string, unknown> => Boolean(object))
        .map(compactObject);
      const objectIds = uniqueValidIds(ranked.map((object) => object.id), validObjectIds);
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: `Found ${ranked.length} relevant ${ranked.length === 1 ? "object" : "objects"}${query ? ` for “${query}”` : ""}.`,
        objectIds,
        data: { query, matches: ranked },
        ok: true,
      };
    }

    case "inspect_object_capabilities": {
      const candidates = selectedObjects.length > 0 ? selectedObjects : allObjects.slice(0, 80);
      const data = candidates.map((object) => ({
        id: getString(object.id),
        label: objectLabel(object),
        type: object.type,
        capabilities: object.capabilities,
      }));
      const objectIds = uniqueValidIds(data.map((object) => object.id), validObjectIds);
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: `Checked available operations for ${data.length} ${data.length === 1 ? "object" : "objects"}.`,
        objectIds,
        data,
        ok: true,
      };
    }

    default: {
      return {
        stepId: step.id,
        tool: step.tool,
        label: step.label,
        detail: "This inspection tool is not available.",
        objectIds: [],
        data: null,
        ok: false,
      };
    }
  }
}


function isNorthStarDataTool(tool: AgentToolName): tool is NorthStarDataToolName {
  return (NORTHSTAR_DATA_TOOL_NAMES as readonly string[]).includes(tool);
}

function normalizeLookup(value?: string): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalRequestedSessionType(value?: string): "onboarding" | "browsing" | undefined {
  const normalized = normalizeLookup(value);
  if (!normalized) return undefined;
  if (/onboard|activation|registration|sign up|signup|account creation|first login/.test(normalized)) return "onboarding";
  if (/brows|discover|explore|navigation|usage|session/.test(normalized)) return "browsing";
  return undefined;
}

function compositionEvidenceMatchesScope(
  value: { appName?: string; platform?: string; sessionType?: string },
  scope: { appNames?: string[]; platform?: "mobile" | "web"; sessionType?: "onboarding" | "browsing" },
): boolean {
  const requestedApps = (scope.appNames ?? []).map(normalizeLookup).filter(Boolean);
  if (requestedApps.length > 0 && !requestedApps.includes(normalizeLookup(value.appName))) return false;
  if (scope.platform && normalizeLookup(value.platform) !== scope.platform) return false;
  if (scope.sessionType && canonicalRequestedSessionType(value.sessionType) !== scope.sessionType) return false;
  return true;
}

function requestedAppNamesFromText(catalog: NorthStarDataCatalog, values: string[]): string[] {
  const haystack = normalizeLookup(values.filter(Boolean).join(" "));
  const matches = catalog.apps
    .filter((app) => {
      const name = normalizeLookup(app.name);
      return Boolean(name) && (` ${haystack} `).includes(` ${name} `);
    })
    .map((app) => app.name);
  return Array.from(new Set(matches));
}

function scoreLookupCandidate(query: string, values: Array<string | undefined>): number {
  const normalizedQuery = normalizeLookup(query);
  if (!normalizedQuery) return 0;
  let score = 0;
  for (const value of values) {
    const normalizedValue = normalizeLookup(value);
    if (!normalizedValue) continue;
    if (normalizedValue === normalizedQuery) score = Math.max(score, 1000);
    else if (normalizedValue.includes(normalizedQuery)) score = Math.max(score, 700 - Math.abs(normalizedValue.length - normalizedQuery.length));
    else if (normalizedQuery.includes(normalizedValue)) score = Math.max(score, 600 - Math.abs(normalizedValue.length - normalizedQuery.length));
    else {
      const queryTokens = new Set(normalizedQuery.split(/\s+/).filter(Boolean));
      const valueTokens = new Set(normalizedValue.split(/\s+/).filter(Boolean));
      const matches = Array.from(queryTokens).filter((token) => valueTokens.has(token)).length;
      score = Math.max(score, matches * 80);
    }
  }
  return score;
}

function findBestApp(catalog: NorthStarDataCatalog, query?: string): NorthStarDataApp | undefined {
  if (!query) return catalog.apps[0];
  return catalog.apps
    .map((app) => ({ app, score: scoreLookupCandidate(query, [app.name, app.domain, app.description, app.category]) }))
    .sort((a, b) => b.score - a.score)[0]?.score
    ? catalog.apps
        .map((app) => ({ app, score: scoreLookupCandidate(query, [app.name, app.domain, app.description, app.category]) }))
        .sort((a, b) => b.score - a.score)[0]?.app
    : undefined;
}

function findCatalogFlowByIdOrName(
  catalog: NorthStarDataCatalog,
  rawFlow: Record<string, unknown>,
  appHint?: string,
): { app: NorthStarDataApp; flow: NorthStarDataFlow } | undefined {
  const flowId = getString(rawFlow.id);
  const flowName = getString(rawFlow.name);
  const rawApp = isRecord(rawFlow.app) ? rawFlow.app : undefined;
  const appName =
    getString(rawFlow.appName) ??
    getString(rawApp?.name) ??
    appHint;

  const apps = appName
    ? [findBestApp(catalog, appName)].filter(
        (app): app is NorthStarDataApp => Boolean(app),
      )
    : catalog.apps;

  for (const app of apps) {
    const flow =
      app.flows.find((candidate) => candidate.id === flowId) ??
      app.flows.find(
        (candidate) =>
          Boolean(flowName) &&
          normalizeLookup(candidate.name) === normalizeLookup(flowName),
      );
    if (flow) return { app, flow };
  }

  return undefined;
}

function findBestFlow(
  catalog: NorthStarDataCatalog,
  args: NorthStarToolArguments,
  previousResults: ToolResult[],
): { app: NorthStarDataApp; flow: NorthStarDataFlow } | undefined {
  const flowQuery = args.flowName ?? args.query ?? "";
  const appQuery = args.appName ?? args.query ?? "";

  for (const result of previousResults.slice().reverse()) {
    const resultData = result.data;
    const candidates = Array.isArray(resultData)
      ? resultData.filter(isRecord)
      : isRecord(resultData)
        ? [resultData]
        : [];

    for (const candidate of candidates) {
      const directFlow = isRecord(candidate.flow)
        ? candidate.flow
        : Array.isArray(candidate.screens) && typeof candidate.name === "string"
          ? candidate
          : undefined;
      if (!directFlow) continue;

      const rawApp = isRecord(candidate.app) ? candidate.app : undefined;
      const match = findCatalogFlowByIdOrName(
        catalog,
        directFlow,
        getString(rawApp?.name) ?? appQuery,
      );
      if (match) return match;
    }
  }

  const candidates: Array<{
    app: NorthStarDataApp;
    flow: NorthStarDataFlow;
    score: number;
  }> = [];
  for (const app of catalog.apps) {
    const appScore = scoreLookupCandidate(appQuery, [
      app.name,
      app.domain,
      app.description,
      app.category,
    ]);
    for (const flow of app.flows) {
      const flowScore = scoreLookupCandidate(flowQuery, [
        flow.name,
        flow.description,
        flow.sessionType,
        flow.platform,
      ]);
      candidates.push({ app, flow, score: flowScore * 2 + appScore });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score
    ? { app: candidates[0].app, flow: candidates[0].flow }
    : undefined;
}

function findCatalogScreenshotById(
  catalog: NorthStarDataCatalog,
  screenshotId?: string,
): {
  app: NorthStarDataApp;
  flow: NorthStarDataFlow;
  screenshot: NorthStarDataScreen;
} | undefined {
  if (!screenshotId) return undefined;

  for (const app of catalog.apps) {
    for (const flow of app.flows) {
      const screenshot = flow.screens.find(
        (screen) => screen.id === screenshotId,
      );
      if (screenshot) return { app, flow, screenshot };
    }
  }

  return undefined;
}

function collectScreensFromToolResult(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];

  const candidates: Record<string, unknown>[] = [];
  if (isRecord(data.screenshot)) candidates.push(data.screenshot);
  if (Array.isArray(data.screens)) candidates.push(...data.screens.filter(isRecord));
  if (Array.isArray(data.screenshots)) {
    candidates.push(...data.screenshots.filter(isRecord));
  }

  const looksLikeScreen =
    typeof data.id === "string" &&
    (typeof data.appName === "string" || typeof data.flowName === "string");
  if (looksLikeScreen) candidates.push(data);

  return candidates;
}

function findBestScreenshot(
  catalog: NorthStarDataCatalog,
  args: NorthStarToolArguments,
  previousResults: ToolResult[],
): {
  app: NorthStarDataApp;
  flow: NorthStarDataFlow;
  screenshot: NorthStarDataScreen;
} | undefined {
  for (const result of previousResults.slice().reverse()) {
    for (const rawScreenshot of collectScreensFromToolResult(result.data)) {
      const direct = findCatalogScreenshotById(
        catalog,
        getString(rawScreenshot.id),
      );
      if (direct) return direct;

      const appName = getString(rawScreenshot.appName) ?? args.appName;
      const flowName = getString(rawScreenshot.flowName) ?? args.flowName;
      const app = appName ? findBestApp(catalog, appName) : undefined;
      const flow = app
        ? app.flows.find(
            (candidate) =>
              normalizeLookup(candidate.name) === normalizeLookup(flowName),
          )
        : undefined;
      const screenshotName = getString(rawScreenshot.name);
      const screenshot = flow?.screens.find(
        (candidate) =>
          normalizeLookup(candidate.name) === normalizeLookup(screenshotName),
      );
      if (app && flow && screenshot) return { app, flow, screenshot };
    }
  }

  const query =
    args.screenshotId ?? args.query ?? args.flowName ?? args.appName ?? "";
  const candidates: Array<{
    app: NorthStarDataApp;
    flow: NorthStarDataFlow;
    screenshot: NorthStarDataScreen;
    score: number;
  }> = [];

  for (const app of catalog.apps) {
    if (
      args.appName &&
      normalizeLookup(app.name) !== normalizeLookup(args.appName)
    ) {
      continue;
    }
    for (const flow of app.flows) {
      if (
        args.flowName &&
        normalizeLookup(flow.name) !== normalizeLookup(args.flowName)
      ) {
        continue;
      }
      if (args.sessionType && flow.sessionType !== args.sessionType) continue;
      if (args.platform && flow.platform !== args.platform) continue;

      for (const screenshot of flow.screens) {
        const score = scoreLookupCandidate(query, [
          screenshot.id,
          screenshot.name,
          flow.name,
          app.name,
          screenshot.sourceUrl,
        ]);
        candidates.push({ app, flow, screenshot, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  if (candidates[0]?.score) return candidates[0];

  // "Any screen" requests are intentionally allowed to resolve to the first
  // usable screen inside the already-resolved app/flow scope.
  if (args.flowName || args.appName || args.sessionType || args.platform) {
    return candidates.find((candidate) => Boolean(candidate.screenshot.imageUrl));
  }

  return undefined;
}


const EXISTING_OBJECT_ACTION_TOOLS = new Set<CanvasActionToolName>([
  "create_connector",
  "move_objects",
  "update_object_style",
  "resize_objects",
  "rotate_objects",
  "update_text",
  "duplicate_objects",
  "delete_objects",
  "arrange_objects",
  "align_objects",
  "distribute_objects",
  "select_objects",
  "focus_objects",
]);

function objectSemanticSearchText(object: Record<string, unknown>): string {
  const compact = compactObject(object);
  const type = getString(compact.type) ?? "";
  const subtype = getString(compact.subtype) ?? "";
  const source: Record<string, unknown> = isRecord(compact.source) ? compact.source : {};
  const additions: string[] = [];

  if (type === "screenshot" || type === "image" || source.kind === "northstar-screenshot") {
    additions.push("screenshot image screen captured app product ui visual");
  }
  if (subtype === "circle" || type === "circle") additions.push("circle round shape ellipse");
  if (subtype === "rect" || type === "shape") additions.push("shape rectangle box object");
  if (type === "connector") additions.push("connector connection line arrow link");
  if (type === "text") additions.push("text label heading title");
  if (type === "note") additions.push("note sticky annotation");

  return normalizeLookup(`${objectLabel(object)} ${stringifySearchable(compact)} ${additions.join(" ")}`);
}

function semanticCanvasMatches(
  canvasContext: unknown,
  query: string | undefined,
  validObjectIds: Set<string>,
  limit = 20,
): string[] {
  if (!query?.trim()) return [];
  const normalizedQuery = normalizeLookup(query);
  const terms = normalizedQuery.split(/\s+/).filter((term) => term.length > 1);
  const scored = collectObjects(canvasContext)
    .map((object) => {
      const id = getString(object.id);
      if (!id || !validObjectIds.has(id)) return null;
      const text = objectSemanticSearchText(object);
      let score = 0;
      if (text === normalizedQuery) score += 1000;
      if (text.includes(normalizedQuery)) score += 700;
      for (const term of terms) {
        if (text.includes(term)) score += term.length >= 5 ? 90 : 40;
      }
      const compact = compactObject(object);
      if (getString(compact.subtype) && normalizedQuery.includes(normalizeLookup(getString(compact.subtype)!))) score += 240;
      if (getString(compact.type) && normalizedQuery.includes(normalizeLookup(getString(compact.type)!))) score += 180;
      return { id, score };
    })
    .filter((entry): entry is { id: string; score: number } => Boolean(entry && entry.score > 0))
    .sort((a, b) => b.score - a.score);
  return Array.from(new Set(scored.map((entry) => entry.id))).slice(0, limit);
}

function selectedIdsFromContext(
  selectedCanvasContext: unknown,
  validObjectIds: Set<string>,
): string[] {
  if (!isRecord(selectedCanvasContext) || !Array.isArray(selectedCanvasContext.selectedIds)) return [];
  return uniqueValidIds(selectedCanvasContext.selectedIds, validObjectIds);
}

function previousInspectionIds(
  previousResults: ToolResult[],
  validObjectIds: Set<string>,
  query?: string,
): string[] {
  const normalizedQuery = normalizeLookup(query ?? "");
  const results = previousResults
    .filter((result) => result.ok && !isNorthStarDataTool(result.tool) && !isCanvasActionTool(result.tool))
    .slice()
    .reverse();

  if (normalizedQuery) {
    const exact = results.find((result) => {
      const dataQuery = isRecord(result.data) ? getString(result.data.query) : undefined;
      return dataQuery && normalizeLookup(dataQuery) === normalizedQuery;
    });
    if (exact) return uniqueValidIds(exact.objectIds, validObjectIds);
  }

  return uniqueValidIds(results.flatMap((result) => result.objectIds), validObjectIds);
}

function allCanvasBoxIds(
  canvasContext: unknown,
  validObjectIds: Set<string>,
): string[] {
  return collectObjects(canvasContext)
    .filter((object) => getString(object.type) !== "connector")
    .map((object) => getString(object.id))
    .filter((id): id is string => Boolean(id && validObjectIds.has(id)));
}

function resolveExistingCanvasActionArguments({
  tool,
  args,
  previousResults,
  canvasContext,
  selectedCanvasContext,
  validObjectIds,
}: {
  tool: CanvasActionToolName;
  args: NorthStarToolArguments;
  previousResults: ToolResult[];
  canvasContext: unknown;
  selectedCanvasContext: unknown;
  validObjectIds: Set<string>;
}): NorthStarToolArguments {
  if (!EXISTING_OBJECT_ACTION_TOOLS.has(tool)) return args;
  if ((args.resultKeys?.length ?? 0) > 0 || args.fromResultKey || args.toResultKey) {
    return args;
  }

  const explicit = uniqueValidIds(args.objectIds ?? [], validObjectIds);
  const selected = selectedIdsFromContext(selectedCanvasContext, validObjectIds);
  const allBoxes = allCanvasBoxIds(canvasContext, validObjectIds);

  if (tool === "create_connector") {
    if (explicit.length >= 2) return { ...args, objectIds: explicit.slice(0, 2) };

    const fromMatches = [
      ...semanticCanvasMatches(canvasContext, args.fromQuery, validObjectIds, 5),
      ...previousInspectionIds(previousResults, validObjectIds, args.fromQuery),
    ];
    const toMatches = [
      ...semanticCanvasMatches(canvasContext, args.toQuery, validObjectIds, 5),
      ...previousInspectionIds(previousResults, validObjectIds, args.toQuery),
    ];
    const fromId = Array.from(new Set(fromMatches))[0];
    const toId = Array.from(new Set(toMatches)).find((id) => id !== fromId);
    if (fromId && toId) return { ...args, objectIds: [fromId, toId] };

    const targetMatches = semanticCanvasMatches(canvasContext, args.targetQuery, validObjectIds, 10);
    const inspected = previousInspectionIds(previousResults, validObjectIds);
    const candidates = Array.from(new Set([
      ...targetMatches,
      ...selected,
      ...inspected,
      ...(allBoxes.length === 2 ? allBoxes : []),
    ])).filter((id) => allBoxes.includes(id));
    if (candidates.length >= 2) return { ...args, objectIds: candidates.slice(0, 2) };
    throw new Error("North Star could not resolve two distinct canvas elements for that connection.");
  }

  let resolved = explicit;
  if (resolved.length === 0 && args.targetQuery) {
    resolved = semanticCanvasMatches(canvasContext, args.targetQuery, validObjectIds, 40);
  }
  if (resolved.length === 0) resolved = selected;
  if (resolved.length === 0) resolved = previousInspectionIds(previousResults, validObjectIds);

  const multiObjectTools = new Set<CanvasActionToolName>([
    "align_objects",
    "distribute_objects",
    "arrange_objects",
  ]);
  if (resolved.length === 0 && multiObjectTools.has(tool)) resolved = allBoxes;
  if (resolved.length === 0 && allBoxes.length === 1) resolved = allBoxes;
  if (resolved.length === 0) {
    throw new Error("North Star could not identify the requested canvas object. Select it or describe it more specifically.");
  }
  return { ...args, objectIds: Array.from(new Set(resolved)) };
}

function repairExistingCanvasActionPlan(
  planner: PlannerResponse,
  intent: SemanticIntentDecision,
  canvasContext: unknown,
  selectedCanvasContext: unknown,
  validObjectIds: Set<string>,
): PlannerResponse {
  const existingActionIndexes = planner.steps
    .map((step, index) =>
      isCanvasActionTool(step.tool) &&
      EXISTING_OBJECT_ACTION_TOOLS.has(step.tool) &&
      !(
        step.arguments?.objectIds?.length ||
        step.arguments?.resultKeys?.length ||
        step.arguments?.fromResultKey ||
        step.arguments?.toResultKey
      )
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  if (existingActionIndexes.length === 0) return planner;

  const steps = [...planner.steps];
  let insertionOffset = 0;

  for (const originalIndex of existingActionIndexes) {
    const index = originalIndex + insertionOffset;
    const action = steps[index];
    const semanticCanvas = intent.canvas;
    const rawTargetQuery =
      action.arguments?.targetQuery ?? semanticCanvas?.targetQuery;
    const rawFromQuery =
      action.arguments?.fromQuery ?? semanticCanvas?.fromQuery;
    const rawToQuery =
      action.arguments?.toQuery ?? semanticCanvas?.toQuery;

    const args: NorthStarToolArguments = {
      ...(action.arguments ?? {}),
      targetQuery: canonicalCanvasTargetQuery({
        canvasContext,
        selectedCanvasContext,
        query: rawTargetQuery,
        validObjectIds,
      }),
      fromQuery: canonicalCanvasTargetQuery({
        canvasContext,
        selectedCanvasContext,
        query: rawFromQuery,
        validObjectIds,
      }),
      toQuery: canonicalCanvasTargetQuery({
        canvasContext,
        selectedCanvasContext,
        query: rawToQuery,
        validObjectIds,
      }),
      text: action.arguments?.text ?? semanticCanvas?.text,
      width: action.arguments?.width ?? semanticCanvas?.width,
      height: action.arguments?.height ?? semanticCanvas?.height,
      scale: action.arguments?.scale ?? semanticCanvas?.scale,
      rotation: action.arguments?.rotation ?? semanticCanvas?.rotation,
      rotationDelta:
        action.arguments?.rotationDelta ?? semanticCanvas?.rotationDelta,
      fill: action.arguments?.fill ?? semanticCanvas?.fill,
      stroke: action.arguments?.stroke ?? semanticCanvas?.stroke,
      strokeWidth:
        action.arguments?.strokeWidth ?? semanticCanvas?.strokeWidth,
      textColor: action.arguments?.textColor ?? semanticCanvas?.textColor,
      fontSize: action.arguments?.fontSize ?? semanticCanvas?.fontSize,
      fontWeight: action.arguments?.fontWeight ?? semanticCanvas?.fontWeight,
      textAlign: action.arguments?.textAlign ?? semanticCanvas?.textAlign,
      preserveAspectRatio:
        action.arguments?.preserveAspectRatio ??
        semanticCanvas?.preserveAspectRatio,
      copyCount: action.arguments?.copyCount ?? semanticCanvas?.copyCount,
      layout: action.arguments?.layout ?? semanticCanvas?.layout,
      gap: action.arguments?.gap ?? semanticCanvas?.gap,
      columns: action.arguments?.columns ?? semanticCanvas?.columns,
      alignment: action.arguments?.alignment ?? semanticCanvas?.alignment,
      axis: action.arguments?.axis ?? semanticCanvas?.axis,
    };

    steps[index] = { ...action, arguments: args };

    const inspectionIndexes = steps
      .slice(0, index)
      .map((step, stepIndex) =>
        [
          "inspect_canvas_overview",
          "inspect_selection",
          "find_relevant_objects",
        ].includes(step.tool)
          ? stepIndex
          : -1,
      )
      .filter((stepIndex) => stepIndex >= 0);

    if (inspectionIndexes.length > 0) {
      const findIndexes = inspectionIndexes.filter(
        (stepIndex) => steps[stepIndex].tool === "find_relevant_objects",
      );

      if (
        action.tool === "create_connector" &&
        args.fromQuery &&
        args.toQuery &&
        findIndexes.length >= 2
      ) {
        const fromIndex = findIndexes[findIndexes.length - 2];
        const toIndex = findIndexes[findIndexes.length - 1];
        steps[fromIndex] = {
          ...steps[fromIndex],
          label: `Find ${args.fromQuery}`,
          arguments: {
            ...steps[fromIndex].arguments,
            query: args.fromQuery,
            limit: 1,
          },
        };
        steps[toIndex] = {
          ...steps[toIndex],
          label: `Find ${args.toQuery}`,
          arguments: {
            ...steps[toIndex].arguments,
            query: args.toQuery,
            limit: 1,
          },
        };
      } else if (args.targetQuery && findIndexes.length > 0) {
        const targetIndex = findIndexes[findIndexes.length - 1];
        steps[targetIndex] = {
          ...steps[targetIndex],
          label: `Find ${args.targetQuery}`,
          arguments: {
            ...steps[targetIndex].arguments,
            query: args.targetQuery,
          },
        };
      }

      continue;
    }

    const targetQuery = args.targetQuery ?? intent.objective;
    const inspections: PlannerStep[] = [];

    if (action.tool === "create_connector" && args.fromQuery && args.toQuery) {
      inspections.push(
        makeIntentStep(
          `${action.id}-find-from`,
          `Find ${args.fromQuery}`,
          "find_relevant_objects",
          "search",
          { query: args.fromQuery, limit: 1 },
        ),
        makeIntentStep(
          `${action.id}-find-to`,
          `Find ${args.toQuery}`,
          "find_relevant_objects",
          "search",
          { query: args.toQuery, limit: 1 },
        ),
      );
    } else if (action.tool === "create_connector") {
      inspections.push(
        makeIntentStep(
          `${action.id}-inspect-canvas`,
          "Inspect the current canvas objects",
          "inspect_canvas_overview",
          "inspect",
        ),
      );
    } else if (targetQuery) {
      inspections.push(
        makeIntentStep(
          `${action.id}-find-targets`,
          `Find ${targetQuery}`,
          "find_relevant_objects",
          "search",
          { query: targetQuery, limit: 20 },
        ),
      );
    } else {
      inspections.push(
        makeIntentStep(
          `${action.id}-inspect-canvas`,
          "Inspect the current canvas objects",
          "inspect_canvas_overview",
          "inspect",
        ),
      );
    }

    steps.splice(index, 0, ...inspections);
    insertionOffset += inspections.length;
  }

  return {
    ...planner,
    mode: "agent",
    focus: "canvas",
    steps: steps.slice(0, MAX_AGENT_STEPS),
  };
}

function compactActionApp(
  app: NorthStarDataApp,
  flows: NorthStarDataFlow[] = [],
): NorthStarDataApp {
  return {
    id: app.id,
    name: app.name,
    tenantId: app.tenantId,
    domain: app.domain,
    iconUrl: app.iconUrl,
    description: app.description,
    category: app.category,
    rank: app.rank,
    revenue: app.revenue,
    employees: app.employees,
    totalScreens: app.totalScreens,
    flows,
  };
}

async function buildCanvasActionRequest({
  step,
  getDataCatalog,
  previousResults,
  canvasContext,
  selectedCanvasContext,
  validObjectIds,
}: {
  step: PlannerStep;
  getDataCatalog: () => Promise<NorthStarDataCatalog>;
  previousResults: ToolResult[];
  canvasContext: unknown;
  selectedCanvasContext: unknown;
  validObjectIds: Set<string>;
}): Promise<CanvasActionRequest> {
  const rawArgs = step.arguments ?? {};
  const args = resolveExistingCanvasActionArguments({
    tool: step.tool as CanvasActionToolName,
    args: rawArgs,
    previousResults,
    canvasContext,
    selectedCanvasContext,
    validObjectIds,
  });
  const request: CanvasActionRequest = {
    actionId: makeId("action"),
    stepId: step.id,
    tool: step.tool as CanvasActionToolName,
    label: step.label,
    arguments: args,
  };

  if (step.tool === "insert_app_icon") {
    const catalog = await getDataCatalog();
    const app = findBestApp(catalog, args.appName ?? args.query);
    if (!app) throw new Error("North Star could not find the requested app icon.");
    request.asset = { app: compactActionApp(app) };
    request.arguments = { ...args, appName: app.name };
  }

  if (step.tool === "insert_flow") {
    const catalog = await getDataCatalog();
    const match = findBestFlow(catalog, args, previousResults);
    if (!match) throw new Error("North Star could not find the requested flow.");
    request.asset = {
      app: compactActionApp(match.app, [match.flow]),
      flow: match.flow,
    };
    request.arguments = { ...args, appName: match.app.name, flowName: match.flow.name };
  }

  if (step.tool === "insert_screenshot") {
    const catalog = await getDataCatalog();
    const match = findBestScreenshot(catalog, args, previousResults);
    if (!match?.screenshot.imageUrl) {
      throw new Error("North Star could not find a usable screenshot for that request.");
    }
    const compactFlow: NorthStarDataFlow = {
      ...match.flow,
      screens: [match.screenshot],
    };
    request.asset = {
      app: compactActionApp(match.app, [compactFlow]),
      flow: compactFlow,
      screenshot: match.screenshot,
    };
    request.arguments = {
      ...args,
      appName: match.app.name,
      flowName: match.flow.name,
      screenshotId: match.screenshot.id,
    };
  }

  if (
    step.tool === "create_working_surface" ||
    step.tool === "update_working_surface" ||
    step.tool === "compose_artifact" ||
    step.tool === "compose_visual_board" ||
    step.tool === "compose_visual_scene" ||
    step.tool === "add_artifact_section" ||
    step.tool === "audit_artifact_semantics"
  ) {
    const catalog = await getDataCatalog();
    request.assetBundle = collectCompositionAssetBundle(
      catalog,
      request.arguments,
      previousResults,
    );
  }

  return request;
}

async function executeAgentTool({
  step,
  canvasContext,
  selectedCanvasContext,
  validObjectIds,
  getDataCatalog,
}: {
  step: PlannerStep;
  canvasContext: unknown;
  selectedCanvasContext: unknown;
  validObjectIds: Set<string>;
  getDataCatalog: () => Promise<NorthStarDataCatalog>;
}): Promise<ToolResult> {
  if (isNorthStarDataTool(step.tool)) {
    const result = await executeNorthStarDataTool({
      tool: step.tool,
      args: step.arguments ?? {},
      getCatalog: getDataCatalog,
    });
    return {
      stepId: step.id,
      tool: step.tool,
      label: step.label,
      detail: result.detail,
      objectIds: [],
      data: result.data,
      resultView: result.resultView,
      ok: result.ok,
    };
  }

  return executeReadOnlyTool({
    step,
    canvasContext,
    selectedCanvasContext,
    validObjectIds,
  });
}


function recentConversationEntries(
  message: string,
  history: HistoryMessage[],
): string[] {
  return [
    message,
    ...history
      .slice(-12)
      .reverse()
      .map((item) => item.content),
  ].filter(Boolean);
}

function inferSessionTypeFromConversation(
  message: string,
  history: HistoryMessage[],
): "onboarding" | "browsing" | undefined {
  for (const entry of recentConversationEntries(message, history)) {
    const normalized = entry.toLowerCase();
    const onboardingIndex = normalized.lastIndexOf("onboarding");
    const browsingIndex = normalized.lastIndexOf("browsing");
    if (onboardingIndex < 0 && browsingIndex < 0) continue;
    return onboardingIndex > browsingIndex ? "onboarding" : "browsing";
  }
  return undefined;
}

function inferSessionTypeFromMessage(
  message: string,
): "onboarding" | "browsing" | undefined {
  const normalized = message.toLowerCase();
  const onboardingIndex = normalized.lastIndexOf("onboarding");
  const browsingIndex = normalized.lastIndexOf("browsing");
  if (onboardingIndex < 0 && browsingIndex < 0) return undefined;
  return onboardingIndex > browsingIndex ? "onboarding" : "browsing";
}

function inferPlatformFromMessage(
  message: string,
): "mobile" | "web" | undefined {
  const normalized = message.toLowerCase();
  const mobileIndex = normalized.lastIndexOf("mobile");
  const webIndex = normalized.lastIndexOf("web");
  if (mobileIndex < 0 && webIndex < 0) return undefined;
  return mobileIndex > webIndex ? "mobile" : "web";
}

function findRecentlyMentionedApp(
  catalog: NorthStarDataCatalog,
  message: string,
  history: HistoryMessage[],
): NorthStarDataApp | undefined {
  for (const entry of recentConversationEntries(message, history)) {
    const normalizedEntry = normalizeLookup(entry);
    const matches = catalog.apps
      .map((app) => ({
        app,
        index: normalizedEntry.lastIndexOf(normalizeLookup(app.name)),
      }))
      .filter((candidate) => candidate.index >= 0)
      .sort((a, b) => b.index - a.index);
    if (matches[0]) return matches[0].app;
  }
  return undefined;
}

function findRecentlyMentionedFlow(
  catalog: NorthStarDataCatalog,
  app: NorthStarDataApp | undefined,
  sessionType: "onboarding" | "browsing" | undefined,
  message: string,
  history: HistoryMessage[],
): { app: NorthStarDataApp; flow: NorthStarDataFlow } | undefined {
  const candidateApps = app ? [app] : catalog.apps;

  for (const entry of recentConversationEntries(message, history)) {
    const normalizedEntry = normalizeLookup(entry);
    const matches = candidateApps
      .flatMap((candidateApp) =>
        candidateApp.flows.map((flow) => ({
          app: candidateApp,
          flow,
          index: normalizedEntry.lastIndexOf(normalizeLookup(flow.name)),
        })),
      )
      .filter((candidate) => candidate.index >= 0)
      .filter(
        (candidate) =>
          !sessionType || candidate.flow.sessionType === sessionType,
      )
      .sort((a, b) => b.index - a.index);
    if (matches[0]) return { app: matches[0].app, flow: matches[0].flow };
  }

  const fallbackFlow = candidateApps
    .flatMap((candidateApp) =>
      candidateApp.flows.map((flow) => ({ app: candidateApp, flow })),
    )
    .find(
      (candidate) =>
        (!sessionType || candidate.flow.sessionType === sessionType) &&
        candidate.flow.screens.some((screen) => Boolean(screen.imageUrl)),
    );

  return fallbackFlow;
}

function requestedCountFromPrompt(message: string): number | undefined {
  const numeric = message.match(/\b([1-9]|1[0-9]|20)\b/);
  if (numeric) return Number(numeric[1]);

  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  for (const [word, value] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(message)) return value;
  }
  return undefined;
}

function inferPlatformFromConversation(
  message: string,
  history: HistoryMessage[],
): "mobile" | "web" | undefined {
  for (const entry of recentConversationEntries(message, history)) {
    const normalized = entry.toLowerCase();
    const mobileIndex = normalized.lastIndexOf("mobile");
    const webIndex = normalized.lastIndexOf("web");
    if (mobileIndex < 0 && webIndex < 0) continue;
    return mobileIndex > webIndex ? "mobile" : "web";
  }
  return undefined;
}

function isCompositionContinuationMessage(message: string): boolean {
  const normalized = normalizeLookup(message);
  if (!normalized) return false;
  return /^(continue|resume|finish|proceed|carry on|keep going|go on|complete it|finish it|continue please|continue pls)(\b|$)/i.test(normalized);
}

function inferArtifactTypeFromRequest(message: string): ArtifactType {
  const normalized = normalizeLookup(message);
  if (/\b(compare|comparison|versus|vs)\b/.test(normalized)) return "comparison-board";
  if (/\bjourney\s*map\b/.test(normalized)) return "journey-map";
  if (/\broadmap\b/.test(normalized)) return "roadmap";
  if (/\b(root cause|causal|cause map)\b/.test(normalized)) return "causal-map";
  if (/\bstoryboard\b/.test(normalized)) return "storyboard";
  if (/\bdashboard\b/.test(normalized)) return "dashboard";
  if (/\boperating model\b/.test(normalized)) return "operating-model";
  if (/\bmarket (map|landscape)\b/.test(normalized)) return "market-map";
  if (/\bdecision tree\b/.test(normalized)) return "decision-tree";
  if (/\bworkflow|process map\b/.test(normalized)) return "workflow";
  if (/\bproduct concept\b/.test(normalized)) return "product-concept";
  if (/\bdesign (board|exploration|concept)\b/.test(normalized)) return "design-board";
  if (/\bresearch (wall|map|workspace)\b/.test(normalized)) return "research-map";
  if (/\bstrategy (board|map|plan)\b/.test(normalized)) return "strategy-board";
  return "freeform";
}

function inferAudienceFromRequest(message: string): ArtifactAudience {
  const normalized = normalizeLookup(message);
  if (/\bexecutive|leadership|board of directors|c suite\b/.test(normalized)) return "executive";
  if (/\bdesign|designer|ux|ui\b/.test(normalized)) return "design";
  if (/\bproduct|pm|product manager\b/.test(normalized)) return "product";
  if (/\bresearch|researcher|insight\b/.test(normalized)) return "research";
  if (/\boperations|operating|process\b/.test(normalized)) return "operations";
  if (/\bsales|revenue\b/.test(normalized)) return "sales";
  if (/\bmarketing|campaign|brand\b/.test(normalized)) return "marketing";
  return "general";
}

function isExplicitCompositionRequest(message: string): boolean {
  const normalized = normalizeLookup(message);
  if (!normalized) return false;
  const action = /\b(build|create|compose|design|make|generate|prepare|develop|map|visualize|analyse|analyze|compare)\b/.test(normalized);
  const deliverable = /\b(board|comparison|journey map|roadmap|strategy|analysis|research wall|research workspace|workflow|process map|dashboard|storyboard|operating model|market landscape|decision tree|product concept|visual composition|presentation|canvas solution)\b/.test(normalized);
  const evidenceDriven = /\b(flows?|screenshots?|evidence|working surface|workspace|canvas|inspect how|reference flows?)\b/.test(normalized);
  return action && (deliverable || evidenceDriven);
}

function inferDeterministicSemanticIntent({
  message,
  history,
  checkpoint,
  preferredExecutionDepth,
}: {
  message: string;
  history: HistoryMessage[];
  checkpoint?: CompositionRunCheckpoint | null;
  preferredExecutionDepth: ExecutionDepth;
}): SemanticIntentDecision | undefined {
  if (checkpoint && isCompositionContinuationMessage(message)) {
    return {
      kind: "canvas-action",
      target: "canvas",
      requiresTools: true,
      objective: checkpoint.objective,
      confidence: 1,
      resumeActiveRun: true,
      data: {
        entity: "none",
        sessionType: checkpoint.sessionType,
        platform: checkpoint.platform,
      },
      canvas: {
        operation: "compose",
        artifactType: checkpoint.artifactType,
        executionDepth: checkpoint.executionDepth,
        workingVisibility: checkpoint.workingVisibility,
        audience: checkpoint.audience,
      },
    };
  }

  if (!isExplicitCompositionRequest(message)) return undefined;
  const normalized = normalizeLookup(message);
  const workingVisibility: WorkingVisibility = /\b(hide|remove|clean up)\b.{0,24}\b(working surface|workspace|scratchpad|research)\b/.test(normalized)
    ? "hidden"
    : /\b(compact|minimize)\b.{0,24}\b(working surface|workspace|scratchpad|research)\b/.test(normalized)
      ? "compact"
      : "visible";

  return {
    kind: "canvas-action",
    target: "canvas",
    requiresTools: true,
    objective: message.trim().slice(0, 600),
    confidence: 0.995,
    resumeActiveRun: false,
    data: {
      entity: "none",
      sessionType: inferSessionTypeFromConversation(message, history),
      platform: inferPlatformFromConversation(message, history),
    },
    canvas: {
      operation: "compose",
      artifactType: inferArtifactTypeFromRequest(message),
      executionDepth: preferredExecutionDepth,
      workingVisibility,
      audience: inferAudienceFromRequest(message),
    },
  };
}

function hasCurrentSemanticFlowTerms(
  message: string,
  app: NorthStarDataApp,
): boolean {
  const generic = new Set([
    "show", "list", "find", "get", "give", "pull", "bring", "lemme", "let",
    "me", "some", "any", "one", "two", "three", "four", "five", "them",
    "those", "these", "things", "thangs", "like", "flows", "flow", "in", "from", "for",
    "the", "a", "an", "of", "app", "mobile", "web", "onboarding", "browsing",
    ...normalizeLookup(app.name).split(" "),
  ]);
  const messageTokens = normalizeLookup(message)
    .split(" ")
    .filter((token) => token.length >= 4 && !generic.has(token));
  if (messageTokens.length === 0) return false;

  const vocabulary = new Set(
    app.flows.flatMap((flow) =>
      normalizeLookup(`${flow.name} ${flow.description ?? ""}`)
        .split(" ")
        .filter((token) => token.length >= 4),
    ),
  );
  return messageTokens.some((token) => vocabulary.has(token));
}

async function repairNorthStarDataPlan({
  planner,
  message,
  history,
  historyToolContext,
  getDataCatalog,
}: {
  planner: PlannerResponse;
  message: string;
  history: HistoryMessage[];
  historyToolContext: HistoryToolContextEntry[];
  getDataCatalog: () => Promise<NorthStarDataCatalog>;
}): Promise<PlannerResponse> {
  const dataStepIndexes = planner.steps
    .map((step, index) => (isNorthStarDataTool(step.tool) ? index : -1))
    .filter((index) => index >= 0);
  if (dataStepIndexes.length === 0) return planner;

  const catalog = await getDataCatalog();
  const contextApp = findCatalogAppByName(
    catalog,
    findRecentToolContextAppName(historyToolContext),
  );
  const app = findRecentlyMentionedApp(catalog, message, history) ?? contextApp;
  const sessionType = inferSessionTypeFromMessage(message);
  const platform = inferPlatformFromMessage(message);
  const requestedLimit = requestedCountFromPrompt(message);
  const currentFlowMention = app
    ? app.flows.find((flow) =>
        normalizeLookup(message).includes(normalizeLookup(flow.name)),
      )
    : undefined;
  const contextFlow = findCatalogFlowFromToolContext(
    catalog,
    historyToolContext,
    app,
  );

  const steps = planner.steps.map((step) => ({
    ...step,
    arguments: step.arguments ? { ...step.arguments } : undefined,
  }));

  for (const index of dataStepIndexes) {
    const step = steps[index];
    const args = step.arguments ?? {};

    if (step.tool === "list_app_flows" || step.tool === "search_app_flows") {
      const shouldListPrecisely =
        Boolean(app) &&
        !currentFlowMention &&
        !hasCurrentSemanticFlowTerms(message, app!);

      steps[index] = {
        ...step,
        tool: shouldListPrecisely ? "list_app_flows" : step.tool,
        label: shouldListPrecisely && app
          ? `List the requested ${app.name} flows`
          : step.label,
        arguments: {
          ...args,
          appName: app?.name ?? args.appName,
          sessionType: sessionType ?? args.sessionType,
          platform: platform ?? args.platform,
          limit: requestedLimit ?? args.limit,
          query:
            shouldListPrecisely
              ? undefined
              : currentFlowMention?.name ?? args.query ?? message,
        },
      };
      continue;
    }

    if (
      step.tool === "get_app_details" ||
      step.tool === "get_app_icon"
    ) {
      steps[index] = {
        ...step,
        arguments: {
          ...args,
          appName: app?.name ?? args.appName,
        },
      };
      continue;
    }

    if (
      step.tool === "get_flow_details" ||
      step.tool === "get_flow_screenshots"
    ) {
      const recentFlow =
        findRecentlyMentionedFlow(
          catalog,
          app,
          sessionType,
          message,
          history,
        ) ?? contextFlow;
      steps[index] = {
        ...step,
        arguments: {
          ...args,
          appName: recentFlow?.app.name ?? app?.name ?? args.appName,
          flowName: currentFlowMention?.name ?? recentFlow?.flow.name ?? args.flowName,
          limit: requestedLimit ?? args.limit,
        },
      };
      continue;
    }

    if (
      step.tool === "search_screenshots" ||
      step.tool === "get_screenshot"
    ) {
      const recentFlow =
        findRecentlyMentionedFlow(
          catalog,
          app,
          sessionType,
          message,
          history,
        ) ?? contextFlow;
      steps[index] = {
        ...step,
        arguments: {
          ...args,
          appName: recentFlow?.app.name ?? app?.name ?? args.appName,
          flowName: recentFlow?.flow.name ?? args.flowName,
          limit: requestedLimit ?? args.limit,
          query: args.query ?? message,
        },
      };
    }
  }

  return {
    ...planner,
    focus:
      steps.some((step) => isCanvasActionTool(step.tool))
        ? "hybrid"
        : "northstar-data",
    steps,
  };
}

function chooseRepresentativeFlow(
  catalog: NorthStarDataCatalog,
  preferredApp: NorthStarDataApp | undefined,
  sessionType: "onboarding" | "browsing" | undefined,
  query: string,
): { app: NorthStarDataApp; flow: NorthStarDataFlow } | undefined {
  const apps = preferredApp ? [preferredApp] : catalog.apps;
  const candidates: Array<{
    app: NorthStarDataApp;
    flow: NorthStarDataFlow;
    score: number;
  }> = [];

  for (const app of apps) {
    for (const flow of app.flows) {
      const usableScreens = flow.screens.filter((screen) =>
        Boolean(screen.imageUrl),
      ).length;
      if (usableScreens === 0) continue;

      const semanticScore = scoreLookupCandidate(query, [
        app.name,
        app.category,
        flow.name,
        flow.description,
        flow.sessionType,
        flow.platform,
      ]);
      const sessionScore =
        sessionType && flow.sessionType === sessionType ? 240 : 0;
      const representativeSizeScore =
        usableScreens >= 3 && usableScreens <= 24
          ? 80
          : Math.min(usableScreens, 40);
      const descriptionScore = flow.description?.trim() ? 20 : 0;

      candidates.push({
        app,
        flow,
        score:
          semanticScore * 3 +
          sessionScore +
          representativeSizeScore +
          descriptionScore,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.flow.name.localeCompare(b.flow.name);
  });

  return candidates[0]
    ? { app: candidates[0].app, flow: candidates[0].flow }
    : undefined;
}

async function repairCanvasAssetActionPlan({
  planner,
  message,
  history,
  historyToolContext,
  getDataCatalog,
}: {
  planner: PlannerResponse;
  message: string;
  history: HistoryMessage[];
  historyToolContext: HistoryToolContextEntry[];
  getDataCatalog: () => Promise<NorthStarDataCatalog>;
}): Promise<PlannerResponse> {
  const actionTools = planner.steps.filter((step) =>
    isCanvasActionTool(step.tool),
  );
  if (actionTools.length === 0) return planner;

  const needsCatalog = actionTools.some((step) =>
    ["insert_app_icon", "insert_flow", "insert_screenshot"].includes(step.tool),
  );
  if (!needsCatalog) return planner;

  const catalog = await getDataCatalog();
  const sessionType = inferSessionTypeFromConversation(message, history);
  const contextApp = findCatalogAppByName(
    catalog,
    findRecentToolContextAppName(historyToolContext),
  );
  const mentionedApp =
    findRecentlyMentionedApp(catalog, message, history) ?? contextApp;
  const mentionedFlow =
    findRecentlyMentionedFlow(
      catalog,
      mentionedApp,
      sessionType,
      message,
      history,
    ) ??
    findCatalogFlowFromToolContext(catalog, historyToolContext, mentionedApp);
  const representativeFlow =
    mentionedFlow ??
    chooseRepresentativeFlow(catalog, mentionedApp, sessionType, message);
  const resolvedApp = representativeFlow?.app ?? mentionedApp;
  const delegatedFlowChoice = !mentionedFlow && Boolean(representativeFlow);

  let steps: PlannerStep[] = planner.steps.map((step) => ({
    ...step,
    arguments: step.arguments ? { ...step.arguments } : undefined,
  }));

  let screenshotActionIndex = steps.findIndex(
    (step) => step.tool === "insert_screenshot",
  );
  if (screenshotActionIndex >= 0) {
    const appName = representativeFlow?.app.name ?? resolvedApp?.name;
    const flowName = representativeFlow?.flow.name;
    steps[screenshotActionIndex] = {
      ...steps[screenshotActionIndex],
      arguments: {
        ...steps[screenshotActionIndex].arguments,
        appName:
          appName ?? steps[screenshotActionIndex].arguments?.appName,
        flowName:
          flowName ?? steps[screenshotActionIndex].arguments?.flowName,
        sessionType:
          sessionType ??
          steps[screenshotActionIndex].arguments?.sessionType,
        query:
          flowName ??
          steps[screenshotActionIndex].arguments?.query ??
          [appName, sessionType, message].filter(Boolean).join(" "),
      },
    };

    const existingLookupBeforeReview = steps.findIndex(
      (step, index) =>
        index < screenshotActionIndex &&
        ["search_screenshots", "get_screenshot", "get_flow_screenshots"].includes(
          step.tool,
        ),
    );
    const hasConcreteFlowStep = steps
      .slice(0, screenshotActionIndex)
      .some(
        (step) =>
          step.tool === "get_flow_details" &&
          normalizeLookup(step.arguments?.appName ?? "") ===
            normalizeLookup(appName ?? "") &&
          normalizeLookup(step.arguments?.flowName ?? "") ===
            normalizeLookup(flowName ?? ""),
      );

    if (
      delegatedFlowChoice &&
      appName &&
      flowName &&
      !hasConcreteFlowStep
    ) {
      const reviewInsertIndex =
        existingLookupBeforeReview >= 0
          ? existingLookupBeforeReview
          : screenshotActionIndex;
      steps.splice(
        reviewInsertIndex,
        0,
        makeIntentStep(
          `review-flow-${reviewInsertIndex}`,
          `Review ${flowName} from ${appName}`,
          "get_flow_details",
          "flow",
          { appName, flowName },
        ),
      );
      if (reviewInsertIndex <= screenshotActionIndex) {
        screenshotActionIndex += 1;
      }
    }

    const lookupIndex = steps.findIndex(
      (step, index) =>
        index < screenshotActionIndex &&
        ["search_screenshots", "get_screenshot", "get_flow_screenshots"].includes(
          step.tool,
        ),
    );

    if (lookupIndex >= 0 && appName && flowName) {
      steps[lookupIndex] = {
        ...steps[lookupIndex],
        label: `Choose a screenshot from ${flowName}`,
        tool: "get_flow_screenshots",
        icon: "screenshot",
        arguments: {
          appName,
          flowName,
          limit: requestedCountFromPrompt(message) ?? 1,
        },
      };
    } else if (lookupIndex >= 0) {
      steps[lookupIndex] = {
        ...steps[lookupIndex],
        arguments: {
          ...steps[lookupIndex].arguments,
          appName,
          flowName,
          sessionType,
          query: [appName, flowName, sessionType, message]
            .filter(Boolean)
            .join(" "),
          limit: requestedCountFromPrompt(message) ?? 1,
        },
      };
    } else if (appName && flowName) {
      steps.splice(
        screenshotActionIndex,
        0,
        makeIntentStep(
          `choose-screenshot-${screenshotActionIndex}`,
          `Choose a screenshot from ${flowName}`,
          "get_flow_screenshots",
          "screenshot",
          {
            appName,
            flowName,
            limit: requestedCountFromPrompt(message) ?? 1,
          },
        ),
      );
      screenshotActionIndex += 1;
    } else {
      steps.splice(
        screenshotActionIndex,
        0,
        makeIntentStep(
          `find-screenshot-${screenshotActionIndex}`,
          "Find a representative screenshot",
          "search_screenshots",
          "search",
          {
            query: message,
            appName,
            sessionType,
            limit: requestedCountFromPrompt(message) ?? 1,
          },
        ),
      );
      screenshotActionIndex += 1;
    }
  }

  const flowActionIndex = steps.findIndex((step) => step.tool === "insert_flow");
  if (flowActionIndex >= 0) {
    const appName = representativeFlow?.app.name ?? resolvedApp?.name;
    const flowName = representativeFlow?.flow.name;
    steps[flowActionIndex] = {
      ...steps[flowActionIndex],
      arguments: {
        ...steps[flowActionIndex].arguments,
        appName: appName ?? steps[flowActionIndex].arguments?.appName,
        flowName: flowName ?? steps[flowActionIndex].arguments?.flowName,
        sessionType:
          sessionType ?? steps[flowActionIndex].arguments?.sessionType,
        query:
          flowName ?? steps[flowActionIndex].arguments?.query ?? message,
      },
    };
  }

  const iconActionIndex = steps.findIndex(
    (step) => step.tool === "insert_app_icon",
  );
  if (iconActionIndex >= 0 && resolvedApp) {
    steps[iconActionIndex] = {
      ...steps[iconActionIndex],
      arguments: {
        ...steps[iconActionIndex].arguments,
        appName: resolvedApp.name,
      },
    };
  }

  return {
    ...planner,
    mode: "agent",
    focus: "hybrid",
    steps,
  };
}

function sanitizeFiniteNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function sanitizeStringArray(value: unknown, maxItems = 24, maxLength = 180): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim().slice(0, maxLength)),
    ),
  ).slice(0, maxItems);
  return items.length ? items : undefined;
}

function sanitizeToolArguments(
  args: Record<string, unknown>,
  validObjectIds: Set<string>,
): NorthStarToolArguments {
  const rawObjectIds = sanitizeStringArray(args.objectIds, 40, 120) ?? [];
  const objectIds = rawObjectIds.filter((id) => validObjectIds.has(id));
  const shapeValues = ["rect", "ellipse", "circle", "diamond", "triangle", "pill", "callout", "card", "frame"];
  const alignmentValues = ["left", "center", "right", "top", "middle", "bottom"];
  const placementValues = ["center", "right-of-selection", "below-selection", "at-cursor"];

  return {
    appName: getString(args.appName)?.slice(0, 180),
    appNames: sanitizeStringArray(args.appNames, 12, 180),
    flowName: getString(args.flowName)?.slice(0, 240),
    query: getString(args.query)
      ? scrubInternalIds(getString(args.query)!.slice(0, 500), validObjectIds)
      : undefined,
    screenshotId: getString(args.screenshotId)?.slice(0, 280),
    platform: args.platform === "mobile" || args.platform === "web" ? args.platform : undefined,
    sessionType:
      args.sessionType === "onboarding" || args.sessionType === "browsing"
        ? args.sessionType
        : undefined,
    limit:
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(40, Math.round(args.limit)))
        : undefined,
    shape:
      typeof args.shape === "string" && shapeValues.includes(args.shape)
        ? (args.shape as NorthStarToolArguments["shape"])
        : undefined,
    text: getString(args.text)?.slice(0, 16_000),
    targetQuery: getString(args.targetQuery)
      ? scrubInternalIds(getString(args.targetQuery)!.slice(0, 500), validObjectIds)
      : undefined,
    fromQuery: getString(args.fromQuery)
      ? scrubInternalIds(getString(args.fromQuery)!.slice(0, 500), validObjectIds)
      : undefined,
    toQuery: getString(args.toQuery)
      ? scrubInternalIds(getString(args.toQuery)!.slice(0, 500), validObjectIds)
      : undefined,
    resultKey: getString(args.resultKey)?.slice(0, 120),
    fromResultKey: getString(args.fromResultKey)?.slice(0, 120),
    toResultKey: getString(args.toResultKey)?.slice(0, 120),
    resultKeys: sanitizeStringArray(args.resultKeys, 40, 120),
    objectIds: objectIds.length ? objectIds : undefined,
    x: sanitizeFiniteNumber(args.x, -100_000, 100_000),
    y: sanitizeFiniteNumber(args.y, -100_000, 100_000),
    width: sanitizeFiniteNumber(args.width, 24, 12_000),
    height: sanitizeFiniteNumber(args.height, 24, 12_000),
    offsetX: sanitizeFiniteNumber(args.offsetX, -20_000, 20_000),
    offsetY: sanitizeFiniteNumber(args.offsetY, -20_000, 20_000),
    fill: getString(args.fill)?.slice(0, 120),
    stroke: getString(args.stroke)?.slice(0, 120),
    textColor: getString(args.textColor)?.slice(0, 120),
    fontSize: sanitizeFiniteNumber(args.fontSize, 8, 320),
    fontWeight: sanitizeFiniteNumber(args.fontWeight, 100, 900),
    strokeWidth: sanitizeFiniteNumber(args.strokeWidth, 0, 80),
    textAlign: args.textAlign === "left" || args.textAlign === "center" || args.textAlign === "right" ? args.textAlign : undefined,
    scale: sanitizeFiniteNumber(args.scale, 0.05, 20),
    rotation: sanitizeFiniteNumber(args.rotation, -3600, 3600),
    rotationDelta: sanitizeFiniteNumber(args.rotationDelta, -3600, 3600),
    preserveAspectRatio: typeof args.preserveAspectRatio === "boolean" ? args.preserveAspectRatio : undefined,
    copyCount: sanitizeFiniteNumber(args.copyCount, 1, 20),
    layout: args.layout === "horizontal" || args.layout === "vertical" || args.layout === "grid" ? args.layout : undefined,
    gap: sanitizeFiniteNumber(args.gap, 0, 4000),
    columns: sanitizeFiniteNumber(args.columns, 1, 20),
    connectorKind:
      args.connectorKind === "straight" || args.connectorKind === "curved" || args.connectorKind === "elbow"
        ? args.connectorKind
        : undefined,
    connectorEnd: args.connectorEnd === "none" || args.connectorEnd === "arrow" ? args.connectorEnd : undefined,
    connectorDash:
      args.connectorDash === "solid" || args.connectorDash === "dashed" || args.connectorDash === "dotted"
        ? args.connectorDash
        : undefined,
    alignment:
      typeof args.alignment === "string" && alignmentValues.includes(args.alignment)
        ? (args.alignment as NorthStarToolArguments["alignment"])
        : undefined,
    axis: args.axis === "horizontal" || args.axis === "vertical" ? args.axis : undefined,
    placement:
      typeof args.placement === "string" && placementValues.includes(args.placement)
        ? (args.placement as NorthStarToolArguments["placement"])
        : undefined,
    selectAfter: typeof args.selectAfter === "boolean" ? args.selectAfter : undefined,
    artifactId: getString(args.artifactId)?.slice(0, 180),
    artifactType:
      (["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] as ArtifactType[]).includes(args.artifactType as ArtifactType)
        ? args.artifactType as ArtifactType
        : undefined,
    executionDepth:
      args.executionDepth === "quick" || args.executionDepth === "balanced" || args.executionDepth === "deep"
        ? args.executionDepth
        : undefined,
    workingVisibility:
      args.workingVisibility === "visible" || args.workingVisibility === "compact" || args.workingVisibility === "hidden"
        ? args.workingVisibility
        : undefined,
    audience:
      (["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] as ArtifactAudience[]).includes(args.audience as ArtifactAudience)
        ? args.audience as ArtifactAudience
        : undefined,
    title: getString(args.title)?.slice(0, 300),
    subtitle: getString(args.subtitle)?.slice(0, 600),
    summary: getString(args.summary)?.slice(0, 2_000),
    compositionJson: getString(args.compositionJson)?.slice(0, 100_000),
    workingNotesJson: getString(args.workingNotesJson)?.slice(0, 50_000),
    workingNoteJson: getString(args.workingNoteJson)?.slice(0, 12_000),
    workspacePlanJson: getString(args.workspacePlanJson)?.slice(0, 120_000),
    replaceExisting: typeof args.replaceExisting === "boolean" ? args.replaceExisting : undefined,
    sectionJson: getString(args.sectionJson)?.slice(0, 40_000),
    sectionIndex: sanitizeFiniteNumber(args.sectionIndex, 0, 100),
    totalSections: sanitizeFiniteNumber(args.totalSections, 1, 100),
    maxVisibleEvidence: sanitizeFiniteNumber(args.maxVisibleEvidence, 1, MAX_COMPOSITION_EVIDENCE),
  };
}

function sanitizeSemanticIntentDecision(value: SemanticIntentDecision): SemanticIntentDecision {
  const kinds: SemanticIntentKind[] = [
    "conversation",
    "attachment",
    "canvas-inspection",
    "selection-inspection",
    "northstar-data",
    "canvas-action",
    "hybrid",
  ];
  const targets: SemanticIntentDecision["target"][] = [
    "conversation",
    "chat",
    "canvas",
    "selection",
    "attachment",
  ];
  const dataEntities: SemanticDataEntity[] = [
    "none",
    "apps",
    "app",
    "flows",
    "flow",
    "screenshots",
    "screenshot",
    "app-icon",
  ];
  const canvasOperations: SemanticCanvasOperation[] = [
    "none",
    "inspect",
    "create-shape",
    "create-text",
    "create-note",
    "create-connector",
    "insert-app-icon",
    "insert-screenshot",
    "insert-flow",
    "move",
    "update-style",
    "resize",
    "rotate",
    "update-text",
    "duplicate",
    "delete",
    "arrange",
    "align",
    "distribute",
    "select",
    "focus",
    "compose",
  ];
  const shapeValues = [
    "rect",
    "ellipse",
    "circle",
    "diamond",
    "triangle",
    "pill",
    "callout",
    "card",
    "frame",
  ] as const;
  const alignmentValues = ["left", "center", "right", "top", "middle", "bottom"] as const;
  const placementValues = ["center", "right-of-selection", "below-selection", "at-cursor"] as const;

  const kind = kinds.includes(value.kind) ? value.kind : "conversation";
  const target = targets.includes(value.target) ? value.target : "conversation";
  const rawData = isRecord(value.data) ? value.data : undefined;
  const rawCanvas = isRecord(value.canvas) ? value.canvas : undefined;
  const entity = rawData && dataEntities.includes(rawData.entity as SemanticDataEntity)
    ? (rawData.entity as SemanticDataEntity)
    : "none";
  const operation = rawCanvas && canvasOperations.includes(rawCanvas.operation as SemanticCanvasOperation)
    ? (rawCanvas.operation as SemanticCanvasOperation)
    : "none";

  const data = rawData
    ? {
        entity,
        appName: getString(rawData.appName)?.trim().slice(0, 180) || undefined,
        flowName: getString(rawData.flowName)?.trim().slice(0, 240) || undefined,
        screenshotId: getString(rawData.screenshotId)?.trim().slice(0, 320) || undefined,
        query: getString(rawData.query)?.trim().slice(0, 500) || undefined,
        platform: rawData.platform === "mobile" || rawData.platform === "web" ? rawData.platform : undefined,
        sessionType:
          rawData.sessionType === "onboarding" || rawData.sessionType === "browsing"
            ? rawData.sessionType
            : undefined,
        limit:
          typeof rawData.limit === "number" && Number.isFinite(rawData.limit)
            ? Math.max(1, Math.min(20, Math.round(rawData.limit)))
            : undefined,
      }
    : undefined;

  const canvas = rawCanvas
    ? {
        operation,
        shape:
          typeof rawCanvas.shape === "string" && shapeValues.includes(rawCanvas.shape as (typeof shapeValues)[number])
            ? (rawCanvas.shape as (typeof shapeValues)[number])
            : undefined,
        text: getString(rawCanvas.text)?.slice(0, 8_000),
        targetQuery: getString(rawCanvas.targetQuery)?.trim().slice(0, 500) || undefined,
        fromQuery: getString(rawCanvas.fromQuery)?.trim().slice(0, 500) || undefined,
        toQuery: getString(rawCanvas.toQuery)?.trim().slice(0, 500) || undefined,
        width: sanitizeFiniteNumber(rawCanvas.width, 24, 12_000),
        height: sanitizeFiniteNumber(rawCanvas.height, 24, 12_000),
        scale: sanitizeFiniteNumber(rawCanvas.scale, 0.05, 20),
        rotation: sanitizeFiniteNumber(rawCanvas.rotation, -3600, 3600),
        rotationDelta: sanitizeFiniteNumber(rawCanvas.rotationDelta, -3600, 3600),
        fill: getString(rawCanvas.fill)?.slice(0, 120),
        stroke: getString(rawCanvas.stroke)?.slice(0, 120),
        strokeWidth: sanitizeFiniteNumber(rawCanvas.strokeWidth, 0, 80),
        textColor: getString(rawCanvas.textColor)?.slice(0, 120),
        fontSize: sanitizeFiniteNumber(rawCanvas.fontSize, 8, 320),
        fontWeight: sanitizeFiniteNumber(rawCanvas.fontWeight, 100, 900),
        textAlign: rawCanvas.textAlign === "left" || rawCanvas.textAlign === "center" || rawCanvas.textAlign === "right" ? rawCanvas.textAlign : undefined,
        preserveAspectRatio: typeof rawCanvas.preserveAspectRatio === "boolean" ? rawCanvas.preserveAspectRatio : undefined,
        copyCount: sanitizeFiniteNumber(rawCanvas.copyCount, 1, 20),
        layout: rawCanvas.layout === "horizontal" || rawCanvas.layout === "vertical" || rawCanvas.layout === "grid" ? rawCanvas.layout : undefined,
        gap: sanitizeFiniteNumber(rawCanvas.gap, 0, 4000),
        columns: sanitizeFiniteNumber(rawCanvas.columns, 1, 20),
        alignment:
          typeof rawCanvas.alignment === "string" && alignmentValues.includes(rawCanvas.alignment as (typeof alignmentValues)[number])
            ? (rawCanvas.alignment as (typeof alignmentValues)[number])
            : undefined,
        axis:
          rawCanvas.axis === "horizontal" || rawCanvas.axis === "vertical"
            ? rawCanvas.axis
            : undefined,
        placement:
          typeof rawCanvas.placement === "string" && placementValues.includes(rawCanvas.placement as (typeof placementValues)[number])
            ? (rawCanvas.placement as (typeof placementValues)[number])
            : undefined,
        artifactType:
          (["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] as ArtifactType[]).includes(rawCanvas.artifactType as ArtifactType)
            ? rawCanvas.artifactType as ArtifactType
            : undefined,
        executionDepth:
          rawCanvas.executionDepth === "quick" || rawCanvas.executionDepth === "balanced" || rawCanvas.executionDepth === "deep"
            ? rawCanvas.executionDepth
            : undefined,
        workingVisibility:
          rawCanvas.workingVisibility === "visible" || rawCanvas.workingVisibility === "compact" || rawCanvas.workingVisibility === "hidden"
            ? rawCanvas.workingVisibility
            : undefined,
        audience:
          (["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] as ArtifactAudience[]).includes(rawCanvas.audience as ArtifactAudience)
            ? rawCanvas.audience as ArtifactAudience
            : undefined,
      }
    : undefined;

  const inferredRequiresTools =
    kind === "canvas-inspection" ||
    kind === "selection-inspection" ||
    kind === "northstar-data" ||
    kind === "canvas-action" ||
    kind === "hybrid" ||
    entity !== "none" ||
    operation !== "none";

  return {
    kind,
    target,
    requiresTools: value.requiresTools === true || inferredRequiresTools,
    objective:
      typeof value.objective === "string" && value.objective.trim()
        ? value.objective.trim().slice(0, 600)
        : "Respond to the user's current request.",
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? Math.max(0, Math.min(1, value.confidence))
        : 0.5,
    resumeActiveRun: value.resumeActiveRun === true,
    data,
    canvas,
  };
}

function intentNeedsDataTool(intent: SemanticIntentDecision): boolean {
  return intent.kind === "northstar-data" || intent.data?.entity !== undefined && intent.data.entity !== "none" || intent.kind === "hybrid" && Boolean(intent.data);
}

function intentNeedsCanvasAction(intent: SemanticIntentDecision): boolean {
  return intent.kind === "canvas-action" || intent.kind === "hybrid" && Boolean(intent.canvas && intent.canvas.operation !== "none" && intent.canvas.operation !== "inspect");
}

function makeIntentStep(
  id: string,
  label: string,
  tool: AgentToolName,
  icon: CanvasAIActivityIcon,
  argumentsValue?: NorthStarToolArguments,
): PlannerStep {
  return { id, label, tool, icon, arguments: argumentsValue };
}

function buildPlannerFromSemanticIntent(
  intent: SemanticIntentDecision,
): PlannerResponse | null {
  const data = intent.data;
  const canvas = intent.canvas;
  const steps: PlannerStep[] = [];
  const limit = data?.limit;

  if (intent.kind === "canvas-inspection") {
    steps.push(makeIntentStep("inspect-canvas", "Inspect the current canvas", "inspect_canvas_overview", "inspect"));
  }
  if (intent.kind === "selection-inspection") {
    steps.push(makeIntentStep("inspect-selection", "Inspect the current selection", "inspect_selection", "select"));
  }

  if (data && data.entity !== "none") {
    if (data.entity === "apps") {
      steps.push(makeIntentStep("list-apps", "List the apps in this North Star account", "list_available_apps", "app", { limit }));
    } else if (data.entity === "app") {
      if (data.appName) {
        steps.push(makeIntentStep("get-app", `Load ${data.appName} app details`, "get_app_details", "app", { appName: data.appName }));
      } else {
        steps.push(makeIntentStep("list-apps", "List the apps in this North Star account", "list_available_apps", "app", { limit }));
      }
    } else if (data.entity === "flows") {
      if (data.appName) {
        steps.push(makeIntentStep("list-flows", `List the requested ${data.appName} flows`, "list_app_flows", "flow", {
          appName: data.appName,
          sessionType: data.sessionType,
          platform: data.platform,
          limit,
        }));
      } else {
        steps.push(makeIntentStep("search-flows", "Find the requested app flows", "search_app_flows", "search", {
          query: data.query || intent.objective,
          sessionType: data.sessionType,
          limit,
        }));
      }
    } else if (data.entity === "flow") {
      if (data.appName && data.flowName) {
        steps.push(makeIntentStep("get-flow", `Load ${data.flowName}`, "get_flow_details", "flow", {
          appName: data.appName,
          flowName: data.flowName,
        }));
      } else {
        steps.push(makeIntentStep("search-flow", "Find the requested flow", "search_app_flows", "search", {
          query: data.query || data.flowName || intent.objective,
          appName: data.appName,
          sessionType: data.sessionType,
          limit: limit ?? 8,
        }));
      }
    } else if (data.entity === "screenshots") {
      if (data.appName && data.flowName) {
        steps.push(makeIntentStep("get-flow-screens", `Load screenshots from ${data.flowName}`, "get_flow_screenshots", "screenshot", {
          appName: data.appName,
          flowName: data.flowName,
          limit,
        }));
      } else {
        steps.push(makeIntentStep("search-screens", "Find the requested screenshots", "search_screenshots", "search", {
          query: data.query || intent.objective,
          appName: data.appName,
          flowName: data.flowName,
          limit,
        }));
      }
    } else if (data.entity === "screenshot") {
      if (data.screenshotId || data.query) {
        steps.push(makeIntentStep("get-screen", "Load the requested screenshot", "get_screenshot", "screenshot", {
          screenshotId: data.screenshotId,
          query: data.query,
          appName: data.appName,
          flowName: data.flowName,
        }));
      } else if (data.appName && data.flowName) {
        steps.push(makeIntentStep("get-flow-screen", `Load a screenshot from ${data.flowName}`, "get_flow_screenshots", "screenshot", {
          appName: data.appName,
          flowName: data.flowName,
          limit: limit ?? 1,
        }));
      } else {
        steps.push(makeIntentStep("search-screen", "Find a matching screenshot", "search_screenshots", "search", {
          query: intent.objective,
          appName: data.appName,
          limit: limit ?? 1,
        }));
      }
    } else if (data.entity === "app-icon" && data.appName) {
      steps.push(makeIntentStep("get-app-icon", `Load the ${data.appName} app icon`, "get_app_icon", "app", { appName: data.appName }));
    }
  }

  const ensureTargetInspection = (targetQuery?: string) => {
    if (steps.some((step) => [
      "inspect_canvas_overview",
      "inspect_selection",
      "find_relevant_objects",
    ].includes(step.tool))) return;
    if (targetQuery) {
      steps.push(makeIntentStep("find-targets", "Find the relevant canvas objects", "find_relevant_objects", "search", {
        query: targetQuery,
        limit: 20,
      }));
    } else {
      steps.push(makeIntentStep("inspect-canvas-targets", "Inspect the current canvas objects", "inspect_canvas_overview", "inspect"));
    }
  };

  if (canvas && canvas.operation !== "none" && canvas.operation !== "inspect") {
    if (canvas.operation === "compose") {
      if (!steps.some((step) => isNorthStarDataTool(step.tool))) {
        steps.push(makeIntentStep(
          "curate-composition-evidence",
          "Curate representative evidence for the solution",
          "prepare_composition_evidence",
          "search",
          {
            query: intent.objective,
            appName: data?.appName,
            sessionType: data?.sessionType,
            platform: data?.platform,
            limit:
              canvas.executionDepth === "deep"
                ? 120
                : canvas.executionDepth === "quick"
                  ? 12
                  : 48,
          },
        ));
      }
      if (!steps.some((step) => step.tool === "inspect_canvas_overview")) {
        steps.push(makeIntentStep(
          "inspect-composition-space",
          "Inspect the available canvas space",
          "inspect_canvas_overview",
          "inspect",
        ));
      }
    } else {
    const targetQuery = canvas.targetQuery || intent.objective;
    const baseArgs: NorthStarToolArguments = {
      appName: data?.appName,
      flowName: data?.flowName,
      screenshotId: data?.screenshotId,
      query: data?.query || intent.objective,
      targetQuery,
      placement: canvas.placement,
      selectAfter: true,
    };
    if (canvas.operation === "create-shape") {
      steps.push(makeIntentStep("create-shape", `Create a ${canvas.shape ?? "shape"} on the canvas`, "create_shape", "write", {
        shape: canvas.shape ?? "rect",
        text: canvas.text,
        placement: canvas.placement ?? "center",
        resultKey: "created-object",
        selectAfter: true,
      }));
      steps.push(makeIntentStep("focus-created", "Focus the completed canvas work", "focus_objects", "verify", {
        resultKeys: ["created-object"],
      }));
    } else if (canvas.operation === "create-text") {
      steps.push(makeIntentStep("create-text", "Create editable text on the canvas", "create_text", "write", {
        text: canvas.text || intent.objective,
        placement: canvas.placement ?? "center",
        resultKey: "created-object",
        selectAfter: true,
      }));
      steps.push(makeIntentStep("focus-created", "Focus the completed canvas work", "focus_objects", "verify", { resultKeys: ["created-object"] }));
    } else if (canvas.operation === "create-note") {
      steps.push(makeIntentStep("create-note", "Create an editable note on the canvas", "create_note", "write", {
        text: canvas.text || intent.objective,
        placement: canvas.placement ?? "center",
        resultKey: "created-object",
        selectAfter: true,
      }));
      steps.push(makeIntentStep("focus-created", "Focus the completed canvas work", "focus_objects", "verify", { resultKeys: ["created-object"] }));
    } else if (canvas.operation === "create-connector") {
      if (canvas.fromQuery) {
        steps.push(makeIntentStep("find-connector-from", `Find ${canvas.fromQuery}`, "find_relevant_objects", "search", { query: canvas.fromQuery, limit: 1 }));
      }
      if (canvas.toQuery) {
        steps.push(makeIntentStep("find-connector-to", `Find ${canvas.toQuery}`, "find_relevant_objects", "search", { query: canvas.toQuery, limit: 1 }));
      }
      if (!canvas.fromQuery || !canvas.toQuery) {
        if (canvas.targetQuery) {
          ensureTargetInspection(canvas.targetQuery);
        } else if (!steps.some((step) => step.tool === "inspect_canvas_overview")) {
          steps.push(makeIntentStep("inspect-connector-targets", "Inspect the current canvas objects", "inspect_canvas_overview", "inspect"));
        }
      }
      steps.push(makeIntentStep("create-connector", "Connect the relevant canvas objects", "create_connector", "connect", {
        targetQuery,
        fromQuery: canvas.fromQuery,
        toQuery: canvas.toQuery,
        resultKey: "created-connector",
      }));
    } else if (canvas.operation === "insert-app-icon") {
      steps.push(makeIntentStep("insert-app-icon", "Insert the app icon on the canvas", "insert_app_icon", "app", {
        ...baseArgs,
        resultKey: "inserted-asset",
      }));
      steps.push(makeIntentStep("focus-inserted", "Focus the inserted app icon", "focus_objects", "verify", { resultKeys: ["inserted-asset"] }));
    } else if (canvas.operation === "insert-screenshot") {
      if (!steps.some((step) => isNorthStarDataTool(step.tool))) {
        steps.push(makeIntentStep("load-screenshot", "Load the requested screenshot", data?.appName && data?.flowName ? "get_flow_screenshots" : "search_screenshots", "screenshot", data?.appName && data?.flowName ? {
          appName: data.appName,
          flowName: data.flowName,
          limit: data.limit ?? 1,
        } : {
          query: data?.query || intent.objective,
          appName: data?.appName,
          flowName: data?.flowName,
          limit: data?.limit ?? 1,
        }));
      }
      steps.push(makeIntentStep("insert-screenshot", "Insert the screenshot on the canvas", "insert_screenshot", "screenshot", {
        ...baseArgs,
        resultKey: "inserted-asset",
      }));
      steps.push(makeIntentStep("focus-inserted", "Focus the inserted screenshot", "focus_objects", "verify", { resultKeys: ["inserted-asset"] }));
    } else if (canvas.operation === "insert-flow") {
      steps.push(makeIntentStep("insert-flow", "Insert the flow on the canvas", "insert_flow", "flow", {
        ...baseArgs,
        resultKey: "inserted-flow",
      }));
      steps.push(makeIntentStep("focus-flow", "Focus the inserted flow", "focus_objects", "verify", { resultKeys: ["inserted-flow"] }));
    } else {
      ensureTargetInspection(targetQuery);
      if (canvas.operation === "move") {
        steps.push(makeIntentStep("move-objects", "Move the relevant canvas objects", "move_objects", "move", { targetQuery }));
      } else if (canvas.operation === "update-style") {
        steps.push(makeIntentStep("update-style", "Update the object appearance", "update_object_style", "write", {
          targetQuery,
          fill: canvas.fill,
          stroke: canvas.stroke,
          strokeWidth: canvas.strokeWidth,
          textColor: canvas.textColor,
          fontSize: canvas.fontSize,
          fontWeight: canvas.fontWeight,
          textAlign: canvas.textAlign,
        }));
      } else if (canvas.operation === "resize") {
        steps.push(makeIntentStep("resize-objects", "Resize the relevant canvas objects", "resize_objects", "move", {
          targetQuery,
          width: canvas.width,
          height: canvas.height,
          scale: canvas.scale,
          preserveAspectRatio: canvas.preserveAspectRatio,
        }));
      } else if (canvas.operation === "rotate") {
        steps.push(makeIntentStep("rotate-objects", "Rotate the relevant canvas objects", "rotate_objects", "move", {
          targetQuery,
          rotation: canvas.rotation,
          rotationDelta: canvas.rotationDelta,
        }));
      } else if (canvas.operation === "update-text") {
        steps.push(makeIntentStep("update-text", "Update the canvas text", "update_text", "write", {
          targetQuery,
          text: canvas.text || intent.objective,
        }));
      } else if (canvas.operation === "duplicate") {
        steps.push(makeIntentStep("duplicate-objects", "Duplicate the relevant canvas objects", "duplicate_objects", "write", {
          targetQuery,
          copyCount: canvas.copyCount,
          resultKey: "duplicated-objects",
        }));
      } else if (canvas.operation === "delete") {
        steps.push(makeIntentStep("delete-objects", "Remove the relevant canvas objects", "delete_objects", "write", {
          targetQuery,
        }));
      } else if (canvas.operation === "arrange") {
        steps.push(makeIntentStep("arrange-objects", "Arrange the relevant canvas objects", "arrange_objects", "move", {
          targetQuery,
          layout: canvas.layout ?? "horizontal",
          gap: canvas.gap,
          columns: canvas.columns,
        }));
      } else if (canvas.operation === "align") {
        steps.push(makeIntentStep("align-objects", "Align the relevant canvas objects", "align_objects", "move", { targetQuery, alignment: canvas.alignment ?? "center" }));
      } else if (canvas.operation === "distribute") {
        steps.push(makeIntentStep("distribute-objects", "Distribute the relevant canvas objects", "distribute_objects", "move", { targetQuery, axis: canvas.axis ?? "horizontal" }));
      } else if (canvas.operation === "select") {
        steps.push(makeIntentStep("select-objects", "Select the relevant canvas objects", "select_objects", "select", { targetQuery }));
      } else if (canvas.operation === "focus") {
        steps.push(makeIntentStep("focus-objects", "Focus the relevant canvas objects", "focus_objects", "verify", { targetQuery }));
      }
    }
    }
  }

  if (steps.length === 0) return null;
  const hasData = steps.some((step) => isNorthStarDataTool(step.tool));
  const hasAction = steps.some((step) => isCanvasActionTool(step.tool));
  const focus: InteractionFocus = hasData && hasAction
    ? "hybrid"
    : hasAction
      ? "canvas"
      : intent.kind === "selection-inspection"
        ? "selection"
        : intent.kind === "canvas-inspection"
          ? "canvas"
          : hasData
            ? "northstar-data"
            : intent.kind === "attachment"
              ? "attachment"
              : "conversation";

  return {
    mode: "agent",
    focus,
    title: intent.objective.slice(0, 180),
    steps: steps.slice(0, MAX_AGENT_STEPS),
  };
}

function expectedCanvasToolForIntent(
  intent: SemanticIntentDecision,
): CanvasActionToolName | undefined {
  const operation = intent.canvas?.operation;
  const map: Partial<Record<SemanticCanvasOperation, CanvasActionToolName>> = {
    "create-shape": "create_shape",
    "create-text": "create_text",
    "create-note": "create_note",
    "create-connector": "create_connector",
    "insert-app-icon": "insert_app_icon",
    "insert-screenshot": "insert_screenshot",
    "insert-flow": "insert_flow",
    move: "move_objects",
    "update-style": "update_object_style",
    resize: "resize_objects",
    rotate: "rotate_objects",
    "update-text": "update_text",
    duplicate: "duplicate_objects",
    delete: "delete_objects",
    arrange: "arrange_objects",
    align: "align_objects",
    distribute: "distribute_objects",
    select: "select_objects",
    focus: "focus_objects",
  };
  return operation ? map[operation] : undefined;
}

function enforceSemanticIntentPlan(
  planner: PlannerResponse,
  intent: SemanticIntentDecision,
): PlannerResponse {
  if (!intent.requiresTools) return planner;

  const hasDataTool = planner.steps.some((step) => isNorthStarDataTool(step.tool));
  const hasCanvasAction = planner.steps.some((step) => isCanvasActionTool(step.tool));
  const needsData = intentNeedsDataTool(intent);
  const needsAction = intentNeedsCanvasAction(intent);
  const expectedCanvasTool = expectedCanvasToolForIntent(intent);
  const hasExpectedCanvasTool =
    !expectedCanvasTool || planner.steps.some((step) => step.tool === expectedCanvasTool);
  const missingRequiredFamily =
    (needsData && !hasDataTool) ||
    (needsAction && (!hasCanvasAction || !hasExpectedCanvasTool));

  if (planner.mode === "agent" && planner.steps.length > 0 && !missingRequiredFamily) {
    return planner;
  }

  const fallback = buildPlannerFromSemanticIntent(intent);
  if (!fallback) {
    throw new Error("North Star understood that this request needs grounded execution, but could not build a safe tool plan. Nothing was changed.");
  }
  return fallback;
}

function sanitizePlanner(
  value: PlannerResponse,
  validObjectIds: Set<string>,
): PlannerResponse {
  const mode: AgentMode = value.mode === "agent" ? "agent" : "direct";
  const focus: InteractionFocus =
    value.focus === "attachment" ||
    value.focus === "canvas" ||
    value.focus === "selection" ||
    value.focus === "northstar-data" ||
    value.focus === "hybrid"
      ? value.focus
      : "conversation";
  const seenIds = new Set<string>();
  const steps = Array.isArray(value.steps)
    ? value.steps
        .filter((step): step is PlannerStep => Boolean(step && typeof step === "object"))
        .map((step, index) => {
          const rawId = typeof step.id === "string" && step.id.trim() ? step.id.trim() : `step-${index + 1}`;
          const id = seenIds.has(rawId) ? `${rawId}-${index + 1}` : rawId;
          seenIds.add(id);
          const tool = TOOL_NAMES.includes(step.tool) ? step.tool : "inspect_canvas_overview";
          const icon = ACTIVITY_ICONS.includes(step.icon) ? step.icon : "inspect";
          return {
            id: id.slice(0, 80),
            label: scrubInternalIds(
              typeof step.label === "string" && step.label.trim()
                ? step.label.slice(0, 180)
                : "Inspecting the canvas",
              validObjectIds,
            ),
            tool,
            icon,
            arguments: isRecord(step.arguments)
              ? sanitizeToolArguments(step.arguments, validObjectIds)
              : undefined,
          };
        })
        .slice(0, MAX_AGENT_STEPS)
    : [];

  const agentMode = mode === "agent" && steps.length >= 1;

  return {
    mode: agentMode ? "agent" : "direct",
    focus,
    title: scrubInternalIds(
      typeof value.title === "string" && value.title.trim()
        ? value.title.slice(0, 180)
        : agentMode
          ? "Reviewing the relevant workspace context"
          : focus === "attachment"
            ? "Reviewing the attached image"
            : focus === "conversation"
              ? "Continuing the conversation"
              : focus === "northstar-data"
                ? "Reviewing North Star account data"
                : "Answering from the workspace",
      validObjectIds,
    ),
    steps: agentMode ? steps : [],
  };
}

type DirectInspectionActivity = {
  id: string;
  label: string;
  icon: CanvasAIActivityIcon;
  tool: string;
  detail: string;
  objectIds: string[];
};

function contextObjectIds(
  context: unknown,
  validObjectIds: Set<string>,
  limit = 12,
): string[] {
  if (!isRecord(context) || !Array.isArray(context.objects)) return [];
  return uniqueValidIds(
    context.objects
      .filter((object): object is Record<string, unknown> => isRecord(object))
      .map((object) => object.id),
    validObjectIds,
  ).slice(0, limit);
}

function selectedContextIds(
  context: unknown,
  validObjectIds: Set<string>,
  limit = 24,
): string[] {
  if (!isRecord(context) || !Array.isArray(context.selectedIds)) return [];
  return uniqueValidIds(context.selectedIds, validObjectIds).slice(0, limit);
}

function contextObjectCount(context: unknown): number {
  if (!isRecord(context) || !Array.isArray(context.objects)) return 0;
  return context.objects.length;
}

function buildDirectInspectionActivity({
  planner,
  canvasContext,
  selectedCanvasContext,
  visualCount,
  validObjectIds,
}: {
  planner: PlannerResponse;
  canvasContext: unknown;
  selectedCanvasContext: unknown;
  visualCount: number;
  validObjectIds: Set<string>;
}): DirectInspectionActivity | null {
  if (planner.mode !== "direct" || planner.focus === "conversation") return null;

  const selectedIds = selectedContextIds(selectedCanvasContext, validObjectIds);
  const canvasIds = contextObjectIds(canvasContext, validObjectIds);
  const canvasCount = contextObjectCount(canvasContext);
  const title = planner.title.trim();

  if (planner.focus === "attachment" && visualCount > 0) {
    return {
      id: "direct-attachment-inspection",
      label:
        visualCount === 1
          ? "Review the attached image"
          : `Review ${visualCount} attached images`,
      icon: "screenshot",
      tool: "inspect_attached_visual",
      detail:
        visualCount === 1
          ? "Reviewed the attached image."
          : `Reviewed ${visualCount} attached images.`,
      objectIds: [],
    };
  }

  if (planner.focus === "selection") {
    const count = selectedIds.length;
    return {
      id: "direct-selection-inspection",
      label:
        title && title !== "Answering from the workspace"
          ? title
          : count === 1
            ? "Inspect the selected element"
            : `Inspect ${count} selected elements`,
      icon: "select",
      tool: "inspect_selection",
      detail:
        count === 1
          ? "Inspected 1 selected object."
          : `Inspected ${count} selected objects.`,
      objectIds: selectedIds,
    };
  }

  if (planner.focus === "canvas") {
    return {
      id: "direct-canvas-inspection",
      label:
        title && title !== "Answering from the workspace"
          ? title
          : "Check the current canvas",
      icon: "context",
      tool: "inspect_canvas_overview",
      detail:
        canvasCount === 1
          ? "Reviewed 1 canvas object."
          : `Reviewed ${canvasCount} canvas objects.`,
      objectIds: canvasIds,
    };
  }

  if (planner.focus === "hybrid") {
    const sources: string[] = [];
    if (visualCount > 0) {
      sources.push(visualCount === 1 ? "the attached image" : `${visualCount} attached images`);
    }
    if (selectedIds.length > 0) {
      sources.push(
        selectedIds.length === 1
          ? "1 selected object"
          : `${selectedIds.length} selected objects`,
      );
    } else if (canvasCount > 0) {
      sources.push(canvasCount === 1 ? "1 canvas object" : `${canvasCount} canvas objects`);
    }

    return {
      id: "direct-hybrid-inspection",
      label:
        title && title !== "Answering from the workspace"
          ? title
          : "Review the relevant workspace context",
      icon: "analyze",
      tool: "inspect_hybrid_context",
      detail:
        sources.length > 0
          ? `Reviewed ${sources.join(" and ")}.`
          : "Reviewed the relevant workspace context.",
      objectIds: selectedIds.length > 0 ? selectedIds : canvasIds,
    };
  }

  return null;
}


type PartialJsonString = { value: string; complete: boolean };

function extractPartialJsonStringField(source: string, fieldName: string): PartialJsonString | null {
  const key = `"${fieldName}"`;
  const keyIndex = source.indexOf(key);
  if (keyIndex < 0) return null;

  let index = keyIndex + key.length;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  if (source[index] !== ":") return null;
  index += 1;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  if (source[index] !== '"') return null;
  index += 1;

  let value = "";
  while (index < source.length) {
    const char = source[index];
    if (char === '"') return { value, complete: true };
    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }

    index += 1;
    if (index >= source.length) return { value, complete: false };
    const escaped = source[index];
    if (escaped === "u") {
      const hex = source.slice(index + 1, index + 5);
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) return { value, complete: false };
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }

    const escapeMap: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    value += escapeMap[escaped] ?? escaped;
    index += 1;
  }

  return { value, complete: false };
}



function isCompositionIntent(intent: SemanticIntentDecision): boolean {
  return intent.canvas?.operation === "compose";
}

function sanitizeCompositionBlueprint(
  value: CompositionBlueprint,
  intent: SemanticIntentDecision,
): CompositionBlueprint {
  const artifactTypes: ArtifactType[] = [
    "comparison-board",
    "journey-map",
    "screenshot-analysis",
    "strategy-board",
    "research-map",
    "roadmap",
    "causal-map",
    "storyboard",
    "dashboard",
    "operating-model",
    "market-map",
    "decision-tree",
    "design-board",
    "workflow",
    "product-concept",
    "freeform",
  ];
  const depths: ExecutionDepth[] = ["quick", "balanced", "deep"];
  const visibilities: WorkingVisibility[] = ["visible", "compact", "hidden"];
  const audiences: ArtifactAudience[] = ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"];
  const canvas = intent.canvas;
  const depth = depths.includes(value.executionDepth)
    ? value.executionDepth
    : canvas?.executionDepth ?? "balanced";
  const visibility = visibilities.includes(value.workingVisibility)
    ? value.workingVisibility
    : canvas?.workingVisibility ?? "visible";
  const audience = audiences.includes(value.audience)
    ? value.audience
    : canvas?.audience ?? "general";
  const artifactType = artifactTypes.includes(value.artifactType)
    ? value.artifactType
    : canvas?.artifactType ?? "freeform";
  const sectionKinds: CompositionSection["kind"][] = [
    "app-column",
    "stage",
    "evidence-group",
    "insight",
    "recommendation",
    "summary",
    "matrix",
    "chart",
    "timeline",
    "roadmap",
    "process",
    "decision",
    "hypothesis",
    "risk",
    "opportunity",
    "metric",
    "diagram",
    "reference-flow",
    "source-cluster",
    "callout",
    "table",
  ];
  const noteKinds: CompositionWorkingNote["kind"][] = [
    "objective",
    "constraint",
    "evidence",
    "hypothesis",
    "decision",
    "question",
    "correction",
    "rejected",
    "check",
  ];
  const evidenceLayouts: CompositionLayoutRegion["evidenceLayout"][] = [
    "row",
    "column",
    "grid",
    "cluster",
    "timeline",
    "filmstrip",
  ];
  const styleVariants: NonNullable<CompositionLayoutRegion["styleVariant"]>[] = [
    "plain",
    "soft",
    "contrast",
    "editorial",
    "minimal",
  ];

  const sections = Array.isArray(value.sections)
    ? value.sections
        .filter((section): section is CompositionSection => Boolean(section && typeof section === "object"))
        .map((section, index) => ({
          id: typeof section.id === "string" && section.id.trim() ? section.id.trim().slice(0, 120) : `section-${index + 1}`,
          title: typeof section.title === "string" ? section.title.trim().slice(0, 240) : `Section ${index + 1}`,
          body: typeof section.body === "string" ? section.body.trim().slice(0, 2_000) : "",
          kind: sectionKinds.includes(section.kind) ? section.kind : "insight",
          appName: typeof section.appName === "string" ? section.appName.trim().slice(0, 180) : undefined,
          flowName: typeof section.flowName === "string" ? section.flowName.trim().slice(0, 240) : undefined,
          evidenceIds: sanitizeStringArray(section.evidenceIds, 12, 320) ?? [],
          criteria: sanitizeStringArray(section.criteria, 8, 240) ?? [],
          emphasis:
            (section.emphasis === "primary" || section.emphasis === "supporting"
              ? section.emphasis
              : "normal") as CompositionSection["emphasis"],
        }))
        .slice(0, depth === "quick" ? 6 : depth === "deep" ? 14 : 10)
    : [];

  const workingNotes = Array.isArray(value.workingNotes)
    ? value.workingNotes
        .filter((note): note is CompositionWorkingNote => Boolean(note && typeof note === "object"))
        .map((note, index) => ({
          label: typeof note.label === "string" ? note.label.trim().slice(0, 160) : `Working note ${index + 1}`,
          text: typeof note.text === "string" ? note.text.trim().slice(0, 1_600) : "",
          kind: noteKinds.includes(note.kind) ? note.kind : "evidence",
          evidenceIds: sanitizeStringArray(note.evidenceIds, 12, 320) ?? [],
        }))
        .filter((note) => note.text)
        .slice(0, depth === "quick" ? 8 : depth === "deep" ? 24 : 16)
    : [];

  const rawLayout = value.layout && typeof value.layout === "object" ? value.layout : undefined;
  const direction =
    rawLayout?.direction === "horizontal" ||
    rawLayout?.direction === "vertical" ||
    rawLayout?.direction === "grid" ||
    rawLayout?.direction === "mixed"
      ? rawLayout.direction
      : "mixed";
  const canvasWidth =
    typeof rawLayout?.canvasWidth === "number" && Number.isFinite(rawLayout.canvasWidth)
      ? Math.max(1200, Math.min(5200, Math.round(rawLayout.canvasWidth)))
      : depth === "deep"
        ? 3000
        : 2400;
  const canvasHeight =
    typeof rawLayout?.canvasHeight === "number" && Number.isFinite(rawLayout.canvasHeight)
      ? Math.max(900, Math.min(4200, Math.round(rawLayout.canvasHeight)))
      : depth === "deep"
        ? 2100
        : 1600;

  const rawRegions = Array.isArray(rawLayout?.regions) ? rawLayout.regions : [];
  const normalizedRegions: CompositionLayoutRegion[] = rawRegions
    .filter((region): region is CompositionLayoutRegion => Boolean(region && typeof region === "object"))
    .map((region, index) => {
      const sectionId =
        typeof region.sectionId === "string" && region.sectionId.trim()
          ? region.sectionId.trim().slice(0, 120)
          : sections[index]?.id ?? `section-${index + 1}`;
      const clampPct = (input: unknown, fallback: number) =>
        typeof input === "number" && Number.isFinite(input)
          ? Math.max(0, Math.min(100, input))
          : fallback;
      const x = clampPct(region.x, 5);
      const y = clampPct(region.y, 12 + index * 18);
      const w = Math.max(8, Math.min(100 - x, clampPct(region.w, 42)));
      const h = Math.max(8, Math.min(100 - y, clampPct(region.h, 32)));
      return {
        sectionId,
        x,
        y,
        w,
        h,
        evidenceLayout: evidenceLayouts.includes(region.evidenceLayout)
          ? region.evidenceLayout
          : "grid",
        columns:
          typeof region.columns === "number" && Number.isFinite(region.columns)
            ? Math.max(1, Math.min(6, Math.round(region.columns)))
            : undefined,
        emphasis:
          region.emphasis === "primary" || region.emphasis === "supporting"
            ? region.emphasis
            : "normal",
        styleVariant: styleVariants.includes(region.styleVariant ?? "soft")
          ? (region.styleVariant ?? "soft")
          : "soft",
      } satisfies CompositionLayoutRegion;
    })
    .filter((region) => sections.some((section) => section.id === region.sectionId))
    .slice(0, sections.length);

  const regions =
    normalizedRegions.length === sections.length
      ? normalizedRegions
      : sections.map((section, index) => {
          const columns = Math.max(1, Math.ceil(Math.sqrt(sections.length)));
          const rows = Math.max(1, Math.ceil(sections.length / columns));
          const col = index % columns;
          const row = Math.floor(index / columns);
          const gap = 4;
          const width = (100 - gap * (columns + 1)) / columns;
          const height = (78 - gap * (rows + 1)) / rows;
          return {
            sectionId: section.id,
            x: gap + col * (width + gap),
            y: 14 + gap + row * (height + gap),
            w: width,
            h: height,
            evidenceLayout: artifactType === "journey-map" ? "timeline" : "grid",
            columns: section.evidenceIds.length > 2 ? 2 : section.evidenceIds.length,
            emphasis: section.emphasis,
            styleVariant: section.emphasis === "primary" ? "contrast" : "soft",
          } satisfies CompositionLayoutRegion;
        });

  return {
    artifactId:
      typeof value.artifactId === "string" && value.artifactId.trim().startsWith("artifact-")
        ? value.artifactId.trim().slice(0, 180)
        : makeId("artifact"),
    artifactType,
    executionDepth: depth,
    workingVisibility: visibility,
    audience,
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim().slice(0, 300)
        : intent.objective.slice(0, 300),
    subtitle: typeof value.subtitle === "string" ? value.subtitle.trim().slice(0, 600) : "",
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 2_000) : "",
    visualStrategy:
      typeof value.visualStrategy === "string" && value.visualStrategy.trim()
        ? value.visualStrategy.trim().slice(0, 1_200)
        : "Use a clear evidence-led composition with a visible takeaway and restrained supporting detail.",
    researchDigest:
      typeof value.researchDigest === "string" ? value.researchDigest.trim().slice(0, 4_000) : "",
    workingNotes,
    workingEvidenceIds: sanitizeStringArray(value.workingEvidenceIds, depth === "deep" ? 24 : 16, 320) ?? [],
    sections,
    layout: {
      direction,
      columns:
        typeof rawLayout?.columns === "number" && Number.isFinite(rawLayout.columns)
          ? Math.max(1, Math.min(6, Math.round(rawLayout.columns)))
          : 2,
      gap:
        typeof rawLayout?.gap === "number" && Number.isFinite(rawLayout.gap)
          ? Math.max(20, Math.min(180, Math.round(rawLayout.gap)))
          : 48,
      evidenceScale:
        rawLayout?.evidenceScale === "compact" || rawLayout?.evidenceScale === "large"
          ? rawLayout.evidenceScale
          : "balanced",
      canvasWidth,
      canvasHeight,
      regions,
    },
  };
}

type GroundedCompositionScreen = {
  id: string;
  appName: string;
  flowName?: string;
  title?: string;
  imageUrl?: string;
  platform?: string;
  sessionType?: string;
  index?: number;
};

function collectGroundedCompositionContext(toolResults: ToolResult[]): {
  screens: GroundedCompositionScreen[];
  requestedApps: string[];
} {
  const screens = new Map<string, GroundedCompositionScreen>();
  const requestedApps: string[] = [];

  const pushScreen = (value: unknown) => {
    if (!isRecord(value)) return;
    const id = getString(value.id)?.trim();
    const appName = getString(value.appName)?.trim();
    if (!id || !appName) return;
    screens.set(id, {
      id,
      appName,
      flowName: getString(value.flowName)?.trim(),
      title: getString(value.name)?.trim() ?? getString(value.title)?.trim(),
      imageUrl: getString(value.imageUrl)?.trim(),
      platform: getString(value.platform)?.trim(),
      sessionType: getString(value.sessionType)?.trim(),
      index: typeof value.index === "number" && Number.isFinite(value.index) ? value.index : undefined,
    });
  };

  for (const result of toolResults) {
    if (isRecord(result.data)) {
      if (Array.isArray(result.data.requestedApps)) {
        for (const app of result.data.requestedApps) {
          if (typeof app === "string" && app.trim() && !requestedApps.some((item) => normalizeLookup(item) === normalizeLookup(app))) {
            requestedApps.push(app.trim());
          }
        }
      }
      if (Array.isArray(result.data.screens)) result.data.screens.forEach(pushScreen);
      if (Array.isArray(result.data.candidateScreens)) {
        result.data.candidateScreens.forEach(pushScreen);
      }
      if (Array.isArray(result.data.evidenceGroups)) {
        for (const group of result.data.evidenceGroups) {
          if (!isRecord(group)) continue;
          if (Array.isArray(group.screens)) group.screens.forEach(pushScreen);
          if (Array.isArray(group.candidateScreens)) {
            group.candidateScreens.forEach(pushScreen);
          }
        }
      }
    }
    for (const item of result.resultView?.items ?? []) {
      if (item.kind !== "screenshot" || !item.appName) continue;
      screens.set(item.id, {
        id: item.id,
        appName: item.appName,
        flowName: item.flowName,
        title: item.title,
        imageUrl: item.imageUrl,
        platform: item.platform,
        sessionType: item.sessionType,
        index: item.screenshotIndex,
      });
    }
  }

  return { screens: Array.from(screens.values()), requestedApps };
}

function groundCompositionBlueprint(
  blueprint: CompositionBlueprint,
  toolResults: ToolResult[],
): CompositionBlueprint {
  const grounded = collectGroundedCompositionContext(toolResults);
  if (grounded.screens.length === 0) return blueprint;

  const byId = new Map(grounded.screens.map((screen) => [screen.id, screen]));
  const requestedApps =
    grounded.requestedApps.length > 0
      ? grounded.requestedApps
      : Array.from(new Set(grounded.screens.map((screen) => screen.appName)));
  const representedApps = new Set<string>();

  const sections = blueprint.sections.map((section) => {
    const appKey = normalizeLookup(section.appName ?? "");
    const flowKey = normalizeLookup(section.flowName ?? "");
    const valid: string[] = [];
    for (const id of section.evidenceIds) {
      const screen = byId.get(id);
      if (!screen) continue;
      if (appKey && normalizeLookup(screen.appName) !== appKey) continue;
      if (flowKey && normalizeLookup(screen.flowName ?? "") !== flowKey) continue;
      if (!valid.includes(id)) valid.push(id);
      representedApps.add(normalizeLookup(screen.appName));
    }
    return {
      ...section,
      evidenceIds: valid,
    };
  });

  if (
    blueprint.artifactType === "comparison-board" ||
    requestedApps.length > 1
  ) {
    const missingApps = requestedApps.filter(
      (appName) => !representedApps.has(normalizeLookup(appName)),
    );
    if (missingApps.length > 0) {
      throw new Error(
        `North Star could not ground the composition with visible evidence for ${missingApps.join(", ")}.`,
      );
    }
  }

  const regionIds = new Set(sections.map((section) => section.id));
  const regions = blueprint.layout.regions.filter((region) =>
    regionIds.has(region.sectionId),
  );

  return {
    ...blueprint,
    workingEvidenceIds: blueprint.workingEvidenceIds.filter((id) => byId.has(id)),
    workingNotes: blueprint.workingNotes.map((note) => ({
      ...note,
      evidenceIds: (note.evidenceIds ?? []).filter((id) => byId.has(id)),
    })),
    sections,
    layout: {
      ...blueprint.layout,
      regions:
        regions.length === sections.length
          ? regions
          : sections.map((section, index) => {
              const fallback = blueprint.layout.regions[index];
              return (
                fallback ?? {
                  sectionId: section.id,
                  x: 5 + (index % 2) * 47,
                  y: 18 + Math.floor(index / 2) * 36,
                  w: 43,
                  h: 32,
                  evidenceLayout: "grid" as const,
                  columns: 2,
                  emphasis: section.emphasis,
                  styleVariant: "soft" as const,
                }
              );
            }),
    },
  };
}

function collectCompositionEvidenceIds(toolResults: ToolResult[]): string[] {
  const ids: string[] = [];
  for (const result of toolResults) {
    const view = result.resultView;
    if (!view) continue;
    for (const item of view.items) {
      if (item.kind === "screenshot") ids.push(item.id);
      for (const thumbnail of item.thumbnails ?? []) ids.push(thumbnail.id);
    }
  }
  return Array.from(new Set(ids)).slice(0, MAX_COMPOSITION_EVIDENCE);
}

function collectCompositionAssetBundle(
  catalog: NorthStarDataCatalog,
  args: NorthStarToolArguments,
  previousResults: ToolResult[],
): CanvasActionRequest["assetBundle"] {
  const requestedIds = new Set<string>();
  const requestedApps = new Set<string>((args.appNames ?? []).map(normalizeLookup).filter(Boolean));
  if (args.appName) requestedApps.add(normalizeLookup(args.appName));
  const requestedFlows = new Set<string>();
  const canonicalFlowIds = new Set<string>((args.canonicalFlowIds ?? []).filter(Boolean));
  for (const result of previousResults) {
    if (!isRecord(result.data) || !Array.isArray(result.data.selectedFlowIdentity)) continue;
    for (const raw of result.data.selectedFlowIdentity) {
      if (!isRecord(raw)) continue;
      const flowId = getString(raw.flowId)?.trim();
      const flowName = getString(raw.flowName)?.trim();
      if (flowId) canonicalFlowIds.add(flowId);
      if (flowName) requestedFlows.add(normalizeLookup(flowName));
    }
  }
  const strictScope = {
    appNames: [...requestedApps],
    sessionType: args.sessionType,
    platform: args.platform,
  };

  try {
    const parsed = args.compositionJson ? JSON.parse(args.compositionJson) as unknown : null;
    if (isRecord(parsed)) {
      for (const id of sanitizeStringArray(parsed.workingEvidenceIds, MAX_COMPOSITION_EVIDENCE, 320) ?? []) {
        requestedIds.add(id);
      }
      if (Array.isArray(parsed.workingNotes)) {
        for (const rawNote of parsed.workingNotes) {
          if (!isRecord(rawNote)) continue;
          for (const id of sanitizeStringArray(rawNote.evidenceIds, 24, 320) ?? []) requestedIds.add(id);
        }
      }
      if (isRecord(parsed.workingSurfacePlan) && Array.isArray(parsed.workingSurfacePlan.regions)) {
        for (const rawRegion of parsed.workingSurfacePlan.regions) {
          if (!isRecord(rawRegion)) continue;
          const appName = getString(rawRegion.appName);
          const flowName = getString(rawRegion.flowName);
          if (appName) requestedApps.add(normalizeLookup(appName));
          if (flowName) requestedFlows.add(normalizeLookup(flowName));
          for (const id of sanitizeStringArray(rawRegion.evidenceIds, 100, 320) ?? []) requestedIds.add(id);
        }
      }
      if (Array.isArray(parsed.sections)) {
        for (const rawSection of parsed.sections) {
          if (!isRecord(rawSection)) continue;
          const appName = getString(rawSection.appName);
          const flowName = getString(rawSection.flowName);
          if (appName) requestedApps.add(normalizeLookup(appName));
          if (flowName) requestedFlows.add(normalizeLookup(flowName));
          for (const id of sanitizeStringArray(rawSection.evidenceIds, 40, 320) ?? []) requestedIds.add(id);
        }
      }
    }
  } catch {
    // Malformed optional composition JSON must never broaden evidence scope.
  }

  for (const id of collectCompositionEvidenceIds(previousResults)) requestedIds.add(id);
  strictScope.appNames = [...requestedApps];

  const exactFlows: NorthStarDataFlow[] = [];
  for (const app of catalog.apps) {
    for (const flow of app.flows) {
      if (!compositionEvidenceMatchesScope(
        { appName: app.name, platform: flow.platform, sessionType: flow.sessionType },
        strictScope,
      )) continue;
      if (canonicalFlowIds.size > 0 && !canonicalFlowIds.has(flow.id)) continue;
      if (canonicalFlowIds.size === 0 && requestedFlows.size > 0 && !requestedFlows.has(normalizeLookup(flow.name))) continue;

      const matchingScreens = flow.screens
        .filter((screen) => Boolean(screen.imageUrl))
        .filter((screen) => requestedIds.size === 0 || requestedIds.has(screen.id) || requestedIds.has(encodeURIComponent(screen.id)))
        .sort((a, b) => a.index - b.index);

      // If exact IDs were requested but none belong to this flow, do not silently
      // replace them with an unrelated flow. The strict reference-flow selection
      // below remains the only fallback and preserves the requested taxonomy.
      if (requestedIds.size > 0 && matchingScreens.length === 0) continue;
      const screens = (matchingScreens.length > 0 ? matchingScreens : flow.screens.filter((screen) => Boolean(screen.imageUrl)))
        .slice(0, args.executionDepth === "deep" ? 15 : args.executionDepth === "balanced" ? 12 : 10);
      if (screens.length > 0) exactFlows.push({ ...flow, appName: app.name, screens });
    }
  }

  const selectedReferenceFlows = selectNorthStarReferenceFlows(catalog, {
    appNames: [...requestedApps],
    sessionType: args.sessionType,
    platform: args.platform,
    maxApps: Math.max(1, Math.min(6, requestedApps.size || 2)),
    maxScreensPerFlow: args.executionDepth === "deep" ? 15 : args.executionDepth === "balanced" ? 12 : 10,
  });
  const canonicalReferenceFlows = canonicalFlowIds.size > 0
    ? selectedReferenceFlows.flows.filter((flow) => canonicalFlowIds.has(flow.id))
    : selectedReferenceFlows.flows;

  const mergedFlowMap = new Map<string, NorthStarDataFlow>();
  [...canonicalReferenceFlows, ...exactFlows].forEach((flow) => {
    if (!compositionEvidenceMatchesScope(
      { appName: flow.appName, platform: flow.platform, sessionType: flow.sessionType },
      strictScope,
    )) return;
    const key = `${normalizeLookup(flow.appName)}::${normalizeLookup(flow.name)}::${normalizeLookup(flow.platform)}::${canonicalRequestedSessionType(flow.sessionType) ?? normalizeLookup(flow.sessionType)}`;
    const existing = mergedFlowMap.get(key);
    const screenMap = new Map<string, NorthStarDataScreen>();
    for (const screen of [...(existing?.screens ?? []), ...flow.screens]) {
      if (!screen.imageUrl) continue;
      if (!compositionEvidenceMatchesScope(
        { appName: screen.appName || flow.appName, platform: screen.platform || flow.platform, sessionType: screen.sessionType || flow.sessionType },
        strictScope,
      )) continue;
      screenMap.set(screen.id, screen);
    }
    const screens = [...screenMap.values()].sort((a, b) => a.index - b.index);
    if (screens.length > 0) mergedFlowMap.set(key, { ...(existing ?? flow), ...flow, screens });
  });

  const flows = [...mergedFlowMap.values()];
  const appMap = new Map<string, NorthStarDataApp>();
  for (const app of catalog.apps) {
    const appFlows = flows.filter((flow) => normalizeLookup(flow.appName) === normalizeLookup(app.name));
    if (appFlows.length > 0) appMap.set(normalizeLookup(app.name), compactActionApp(app, appFlows));
  }
  const screenshots = Array.from(
    new Map(flows.flatMap((flow) => flow.screens).map((screen) => [screen.id, screen])).values(),
  ).slice(0, MAX_COMPOSITION_EVIDENCE);

  return { apps: [...appMap.values()], flows, screenshots };
}


type ScreenBatchStudyResponse = {
  batchSummary: string;
  observations: CompositionEvidenceObservation[];
  loadedScreenshotIds: string[];
  unresolvedScreenshotIds: string[];
  fallbackObservationCount: number;
};

type ResearchReviewResponse = {
  coverageSummary: string;
  enoughEvidence: boolean;
  missingQuestions: string[];
  additionalQueries: Array<{
    appName?: string;
    query: string;
    sessionType?: "onboarding" | "browsing";
    platform?: "mobile" | "web";
    limit?: number;
  }>;
  hypotheses: CompositionResearchLedger["hypotheses"];
  decisions: string[];
  corrections: string[];
  workspacePlan?: ResearchWorkspacePlan;
};

type BlueprintCritiqueResponse = {
  accepted: boolean;
  critique: string;
  requiredChanges: string[];
  revisedBlueprint: CompositionBlueprint;
};

type CompositionResearchCallbacks = {
  extendPlan: (steps: Array<{
    id: string;
    label: string;
    tool: string;
    icon: CanvasAIActivityIcon;
  }>, visualStrategy?: string) => void | Promise<void>;
  startStep: (step: { id: string; label: string; tool: string }) => void | Promise<void>;
  completeStep: (step: {
    id: string;
    tool: string;
    detail: string;
    resultView?: NorthStarToolResultView;
  }) => void | Promise<void>;
  failStep: (step: { id: string; tool: string; detail: string }) => void | Promise<void>;
  checkpoint?: (phase: CompositionRunCheckpoint["phase"], ledger: CompositionResearchLedger, toolResults: ToolResult[]) => void | Promise<void>;
  getVisibleArtifact: () => NorthstarGeneratedCodeArtifactPackage | undefined;
  publishArtifact: (packageValue: NorthstarGeneratedCodeArtifactPackage, stageIndex: number, label: string) => boolean | Promise<boolean>;
  getLastMutationAck?: () => NorthstarArtifactMutationAcknowledgement | undefined;
};

function captureDocumentFromLiveAcknowledgement(
  packageValue: NorthstarGeneratedCodeArtifactPackage,
  acknowledgement?: NorthstarArtifactMutationAcknowledgement,
): {
  document: NorthstarWebArtifactDocument;
  mutationJournal: NorthstarArtboardMutationBatch[];
  width: number;
  height: number;
} {
  if (
    acknowledgement?.snapshot &&
    acknowledgement.artifactId === packageValue.artifactId &&
    acknowledgement.revisionId === packageValue.revisionId
  ) {
    return {
      document: {
        schema: "northstar.web-artifact-document.v1",
        html: acknowledgement.snapshot.html,
        css: acknowledgement.snapshot.css,
        javascript: "",
      },
      mutationJournal: [],
      width: acknowledgement.size?.intrinsicWidth ?? packageValue.preferredWidth,
      height: acknowledgement.size?.intrinsicHeight ?? packageValue.preferredHeight,
    };
  }
  return {
    document: packageValue.document,
    mutationJournal: packageValue.mutationJournal ?? [],
    width: packageValue.preferredWidth,
    height: packageValue.preferredHeight,
  };
}

function liveAcknowledgementPassed(
  acknowledgement: NorthstarArtifactMutationAcknowledgement | undefined,
  expectedMutationId?: string,
): boolean {
  if (!acknowledgement) return false;
  if (expectedMutationId && acknowledgement.mutationId !== expectedMutationId) return false;
  if (expectedMutationId && acknowledgement.status !== "applied") return false;
  if (!expectedMutationId && acknowledgement.status !== "ready") return false;
  const review = acknowledgement.review;
  if (!review || !acknowledgement.size?.settled) return false;
  return (
    acknowledgement.missingAssetUrls.length === 0 &&
    review.missingImageCount === 0 &&
    review.overflowElementCount === 0 &&
    review.clippedTextCount === 0 &&
    !review.documentScrollRisk &&
    (expectedMutationId ? acknowledgement.meaningfulChangedNodeIds.length > 0 : true)
  );
}

function compositionResearchSettings(depth: ExecutionDepth) {
  if (depth === "quick") {
    return {
      maxScreens: 18,
      batchSize: 10,
      researchRounds: 0,
      blueprintRevisions: 0,
      visibleEvidence: 3,
    };
  }
  if (depth === "deep") {
    return {
      maxScreens: 150,
      batchSize: 15,
      researchRounds: MAX_COMPOSITION_RESEARCH_ROUNDS,
      blueprintRevisions: MAX_COMPOSITION_BLUEPRINT_REVISIONS,
      visibleEvidence: 12,
    };
  }
  return {
    maxScreens: 72,
    batchSize: 12,
    researchRounds: 2,
    blueprintRevisions: 2,
    visibleEvidence: 7,
  };
}

function compositionFlowIdentitiesFromToolResults(
  toolResults: ToolResult[],
  screens: GroundedCompositionScreen[],
): CompositionCheckpointFlow[] {
  const identities = new Map<string, CompositionCheckpointFlow>();
  for (const result of toolResults) {
    if (!isRecord(result.data) || !Array.isArray(result.data.selectedFlowIdentity)) continue;
    for (const raw of result.data.selectedFlowIdentity) {
      if (!isRecord(raw)) continue;
      const appName = getString(raw.appName)?.trim();
      const flowId = getString(raw.flowId)?.trim();
      const flowName = getString(raw.flowName)?.trim();
      if (!appName || !flowId || !flowName) continue;
      const key = `${normalizeLookup(appName)}::${flowId}`;
      identities.set(key, {
        appName,
        flowId,
        flowName,
        platform: getString(raw.platform)?.trim(),
        sessionType: getString(raw.sessionType)?.trim(),
        screenIds: screens
          .filter((screen) => normalizeLookup(screen.appName) === normalizeLookup(appName) && normalizeLookup(screen.flowName ?? "") === normalizeLookup(flowName))
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((screen) => screen.id),
      });
    }
  }
  if (identities.size === 0) {
    const grouped = new Map<string, GroundedCompositionScreen[]>();
    for (const screen of screens) {
      if (!screen.flowName) continue;
      const key = `${normalizeLookup(screen.appName)}::${normalizeLookup(screen.flowName)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), screen]);
    }
    for (const groupedScreens of grouped.values()) {
      const first = groupedScreens[0];
      if (!first?.flowName) continue;
      identities.set(`${normalizeLookup(first.appName)}::${normalizeLookup(first.flowName)}`, {
        appName: first.appName,
        flowId: first.flowName,
        flowName: first.flowName,
        platform: first.platform,
        sessionType: first.sessionType,
        screenIds: groupedScreens.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((screen) => screen.id),
      });
    }
  }
  return Array.from(identities.values());
}

function compositionScreensFromToolResults(toolResults: ToolResult[]): GroundedCompositionScreen[] {
  const byId = new Map<string, GroundedCompositionScreen>();
  const push = (raw: unknown) => {
    if (!isRecord(raw)) return;
    const id = getString(raw.id)?.trim();
    const appName = getString(raw.appName)?.trim();
    if (!id || !appName) return;
    byId.set(id, {
      id,
      appName,
      flowName: getString(raw.flowName)?.trim(),
      title: getString(raw.name)?.trim() ?? getString(raw.title)?.trim() ?? "Untitled screen",
      imageUrl: getString(raw.imageUrl)?.trim(),
      platform: getString(raw.platform)?.trim(),
      sessionType: getString(raw.sessionType)?.trim(),
      index: typeof raw.index === "number" && Number.isFinite(raw.index) ? raw.index : undefined,
    });
  };

  for (const result of toolResults) {
    if (isRecord(result.data)) {
      for (const key of ["candidateScreens", "screens"]) {
        if (Array.isArray(result.data[key])) result.data[key].forEach(push);
      }
      if (Array.isArray(result.data.evidenceGroups)) {
        for (const group of result.data.evidenceGroups) {
          if (!isRecord(group)) continue;
          if (Array.isArray(group.candidateScreens)) group.candidateScreens.forEach(push);
          if (Array.isArray(group.screens)) group.screens.forEach(push);
        }
      }
    }
    for (const item of result.resultView?.items ?? []) {
      if (item.kind !== "screenshot" || !item.appName) continue;
      push({
        id: item.id,
        appName: item.appName,
        flowName: item.flowName,
        name: item.title,
        imageUrl: item.imageUrl,
        platform: item.platform,
        sessionType: item.sessionType,
        index: item.screenshotIndex,
      });
    }
  }

  return Array.from(byId.values());
}

function buildCanvasCodeArtifactDataBundle({
  objective,
  audience,
  artifactType,
  ledger,
  toolResults,
  catalog,
}: {
  objective: string;
  audience: ArtifactAudience;
  artifactType: ArtifactType;
  ledger: CompositionResearchLedger;
  toolResults: ToolResult[];
  catalog: NorthStarDataCatalog;
}): CanvasCodeArtifactDataBundle {
  const groundedScreens = compositionScreensFromToolResults(toolResults);
  const screenById = new Map(groundedScreens.map((screen) => [screen.id, screen]));
  const observationById = new Map(
    ledger.observations.map((observation) => [observation.screenshotId, observation]),
  );
  const orderedIds = Array.from(
    new Set([
      ...ledger.flowSyntheses.flatMap((flow) => flow.screenshotIds),
      ...ledger.inspectedScreenshotIds,
      ...groundedScreens.map((screen) => screen.id),
    ]),
  );
  const selectedScreens = orderedIds
    .map((id) => screenById.get(id))
    .filter((screen): screen is GroundedCompositionScreen => Boolean(screen))
    .slice(0, 72);

  const screenshots = selectedScreens.map((screen) => {
    const observation = observationById.get(screen.id);
    return {
      id: screen.id,
      appName: screen.appName,
      flowName: screen.flowName,
      title: screen.title || observation?.screenName || "Untitled screen",
      imageUrl: screen.imageUrl,
      platform: screen.platform,
      sessionType: screen.sessionType,
      index: screen.index,
      journeyStage: observation?.journeyStage,
      visibleCopy: observation?.visibleCopy.slice(0, 6) ?? [],
      notablePatterns: observation?.notablePatterns.slice(0, 6) ?? [],
      frictionSignals: observation?.frictionSignals.slice(0, 5) ?? [],
      trustSignals: observation?.trustSignals.slice(0, 5) ?? [],
      opportunities: observation?.opportunities.slice(0, 5) ?? [],
      relevance: observation?.relevance ?? 0.5,
    };
  });
  const selectedIdSet = new Set(screenshots.map((screen) => screen.id));

  const flows = ledger.flowSyntheses.map((flow, index) => ({
    id: `flow-${normalizeLookup(`${flow.appName}-${flow.flowName}`) || index + 1}`,
    appName: flow.appName,
    flowName: flow.flowName,
    sessionType: flow.sessionType,
    platform: flow.platform,
    summary: flow.summary,
    journeyStages: flow.journeyStages.slice(0, 12),
    patterns: flow.patterns.slice(0, 10),
    frictionSignals: flow.frictionSignals.slice(0, 8),
    trustSignals: flow.trustSignals.slice(0, 8),
    openQuestions: flow.openQuestions.slice(0, 8),
    screenshotIds: flow.screenshotIds.filter((id) => selectedIdSet.has(id)),
  }));
  const flowIdByIdentity = new Map(
    flows.map((flow) => [
      `${normalizeLookup(flow.appName)}::${normalizeLookup(flow.flowName)}`,
      flow.id,
    ]),
  );

  const apps = ledger.appSyntheses.map((app, index) => {
    const catalogApp = catalog.apps.find(
      (candidate) => normalizeLookup(candidate.name) === normalizeLookup(app.appName),
    );
    return {
      id: catalogApp?.id || `app-${normalizeLookup(app.appName) || index + 1}`,
      name: app.appName,
      iconUrl: catalogApp?.iconUrl,
      summary: app.summary,
      flowIds: app.flowNames
        .map((flowName) =>
          flowIdByIdentity.get(
            `${normalizeLookup(app.appName)}::${normalizeLookup(flowName)}`,
          ),
        )
        .filter((value): value is string => Boolean(value)),
      patterns: app.patterns.slice(0, 10),
      strengths: app.strengths.slice(0, 8),
      risks: app.risks.slice(0, 8),
      openQuestions: app.openQuestions.slice(0, 8),
    };
  });

  const allowedAssetUrls = Array.from(
    new Set([
      ...screenshots
        .map((screen) => screen.imageUrl)
        .filter((value): value is string => Boolean(value)),
      ...apps
        .map((app) => app.iconUrl)
        .filter((value): value is string => Boolean(value)),
    ]),
  );

  return {
    version: "northstar.artifact-data.v0.2",
    objective,
    audience,
    artifactType,
    coverageSummary:
      ledger.coverageSummary ||
      `Northstar inspected ${screenshots.length} grounded screenshots across ${flows.length} flows.`,
    apps,
    flows,
    screenshots,
    hypotheses: ledger.hypotheses.map((hypothesis) => ({
      id: hypothesis.id,
      statement: hypothesis.statement,
      status: hypothesis.status,
      supportingEvidenceIds: hypothesis.supportingEvidenceIds.filter((id) =>
        selectedIdSet.has(id),
      ),
      contradictingEvidenceIds: hypothesis.contradictingEvidenceIds.filter((id) =>
        selectedIdSet.has(id),
      ),
    })),
    decisions: ledger.decisions.slice(0, 12),
    corrections: ledger.corrections.slice(0, 12),
    openQuestions: ledger.openQuestions.slice(0, 12),
    allowedAssetUrls,
  };
}


function buildProvisionalCanvasCodeArtifactDataBundle({
  objective,
  audience,
  artifactType,
  toolResults,
  catalog,
  coverageSummary,
  requestedApps: requestedAppsOverride = [],
}: {
  objective: string;
  audience: ArtifactAudience;
  artifactType: ArtifactType;
  toolResults: ToolResult[];
  catalog: NorthStarDataCatalog;
  coverageSummary?: string;
  requestedApps?: string[];
}): CanvasCodeArtifactDataBundle {
  const grounded = collectGroundedCompositionContext(toolResults);
  const screenshots = grounded.screens.slice(0, 48).map((screen) => ({
    id: screen.id,
    appName: screen.appName,
    flowName: screen.flowName,
    title: screen.title || "Evidence screen",
    imageUrl: screen.imageUrl,
    platform: screen.platform,
    sessionType: screen.sessionType,
    index: screen.index,
    visibleCopy: [],
    notablePatterns: [],
    frictionSignals: [],
    trustSignals: [],
    opportunities: [],
    relevance: 0.5,
  }));
  const byFlow = new Map<string, typeof screenshots>();
  for (const screen of screenshots) {
    const key = `${normalizeLookup(screen.appName)}::${normalizeLookup(screen.flowName || "flow")}`;
    const bucket = byFlow.get(key) ?? [];
    bucket.push(screen);
    byFlow.set(key, bucket);
  }
  const flows = Array.from(byFlow.values()).map((screensForFlow, index) => ({
    id: `flow-provisional-${index + 1}`,
    appName: screensForFlow[0]?.appName || "App",
    flowName: screensForFlow[0]?.flowName || "Selected flow",
    sessionType: screensForFlow[0]?.sessionType,
    platform: screensForFlow[0]?.platform,
    summary: "Northstar is inspecting this ordered flow.",
    journeyStages: [],
    patterns: [],
    frictionSignals: [],
    trustSignals: [],
    openQuestions: [],
    screenshotIds: screensForFlow.map((screen) => screen.id),
  }));
  const requestedNames = Array.from(new Set([
    ...requestedAppsOverride,
    ...grounded.requestedApps,
    ...screenshots.map((screen) => screen.appName),
  ])).filter(Boolean);
  const apps = requestedNames.map((name, index) => {
    const catalogApp = catalog.apps.find((candidate) => normalizeLookup(candidate.name) === normalizeLookup(name));
    return {
      id: catalogApp?.id || `app-provisional-${index + 1}`,
      name,
      iconUrl: catalogApp?.iconUrl,
      summary: "Northstar is acquiring product context, identity, flows, and evidence.",
      flowIds: flows.filter((flow) => normalizeLookup(flow.appName) === normalizeLookup(name)).map((flow) => flow.id),
      patterns: [],
      strengths: [],
      risks: [],
      openQuestions: [],
    };
  });
  const allowedAssetUrls = Array.from(new Set([
    ...screenshots.map((screen) => screen.imageUrl).filter((value): value is string => Boolean(value)),
    ...apps.map((app) => app.iconUrl).filter((value): value is string => Boolean(value)),
  ]));
  return {
    version: "northstar.artifact-data.v0.2",
    objective,
    audience,
    artifactType,
    coverageSummary: coverageSummary || `Northstar has identified ${apps.length} relevant apps and ${screenshots.length} candidate screenshots.`,
    apps,
    flows,
    screenshots,
    hypotheses: [],
    decisions: [],
    corrections: [],
    openQuestions: [],
    allowedAssetUrls,
  };
}


function buildResearchLedgerFromArtifactDataBundle(
  bundle: CanvasCodeArtifactDataBundle,
  objective: string,
): CompositionResearchLedger {
  const screenshotsByApp = new Map<string, string[]>();
  for (const screen of bundle.screenshots) {
    const existing = screenshotsByApp.get(normalizeLookup(screen.appName)) ?? [];
    if (!existing.includes(screen.id)) existing.push(screen.id);
    screenshotsByApp.set(normalizeLookup(screen.appName), existing);
  }

  return {
    objective,
    inspectedScreenshotIds: bundle.screenshots.map((screen) => screen.id),
    batches: bundle.screenshots.length
      ? [
          {
            batchIndex: 1,
            screenshotIds: bundle.screenshots.map((screen) => screen.id),
            summary: `Reused ${bundle.screenshots.length} grounded screenshots from the selected artifact revision.`,
          },
        ]
      : [],
    observations: bundle.screenshots.map((screen) => ({
      screenshotId: screen.id,
      appName: screen.appName,
      flowName: screen.flowName,
      screenName: screen.title,
      journeyStage: screen.journeyStage,
      visibleCopy: screen.visibleCopy.slice(0, 12),
      uiElements: [],
      notablePatterns: screen.notablePatterns.slice(0, 10),
      frictionSignals: screen.frictionSignals.slice(0, 10),
      trustSignals: screen.trustSignals.slice(0, 10),
      opportunities: screen.opportunities.slice(0, 10),
      relevance: screen.relevance,
      selectionReason: "Retained from the selected artifact's grounded evidence bundle.",
    })),
    flowSyntheses: bundle.flows.map((flow) => ({
      appName: flow.appName,
      flowName: flow.flowName,
      sessionType: flow.sessionType,
      platform: flow.platform,
      screenshotIds: flow.screenshotIds,
      summary: flow.summary,
      journeyStages: flow.journeyStages,
      patterns: flow.patterns,
      frictionSignals: flow.frictionSignals,
      trustSignals: flow.trustSignals,
      openQuestions: flow.openQuestions,
      relevance:
        flow.screenshotIds.length > 0
          ? flow.screenshotIds.reduce((sum, screenshotId) => {
              const screen = bundle.screenshots.find((candidate) => candidate.id === screenshotId);
              return sum + (screen?.relevance ?? 0.5);
            }, 0) / flow.screenshotIds.length
          : 0.5,
    })),
    appSyntheses: bundle.apps.map((app) => ({
      appName: app.name,
      summary: app.summary,
      flowNames: bundle.flows
        .filter((flow) => normalizeLookup(flow.appName) === normalizeLookup(app.name))
        .map((flow) => flow.flowName),
      screenshotIds: screenshotsByApp.get(normalizeLookup(app.name)) ?? [],
      patterns: app.patterns,
      strengths: app.strengths,
      risks: app.risks,
      openQuestions: app.openQuestions,
    })),
    hypotheses: bundle.hypotheses.map((hypothesis) => ({ ...hypothesis })),
    openQuestions: bundle.openQuestions.slice(0, 24),
    decisions: bundle.decisions.slice(0, 24),
    corrections: bundle.corrections.slice(0, 24),
    researchRounds: 0,
    coverageSummary:
      bundle.coverageSummary ||
      `Reused ${bundle.screenshots.length} grounded screenshots across ${bundle.flows.length} flows from the selected artifact.`,
  };
}

function buildArtifactEvidenceReuseToolResult(
  bundle: CanvasCodeArtifactDataBundle,
): ToolResult {
  return {
    stepId: "reuse-selected-artifact-evidence",
    tool: "prepare_composition_evidence",
    label: "Reuse the selected artifact's grounded evidence",
    detail: `Reused ${bundle.screenshots.length} grounded screenshots across ${bundle.flows.length} flows and ${bundle.apps.length} apps from the selected artifact.`,
    objectIds: [],
    data: {
      requestedApps: bundle.apps.map((app) => app.name),
      candidateScreens: bundle.screenshots.map((screen) => ({
        id: screen.id,
        appName: screen.appName,
        flowName: screen.flowName,
        name: screen.title,
        imageUrl: screen.imageUrl,
        platform: screen.platform,
        sessionType: screen.sessionType,
        index: screen.index,
      })),
    },
    ok: true,
  };
}

async function buildPolishedLiveArtifactPackage(input: {
  apiKey: string;
  artifactId: string;
  objective: string;
  audience: ArtifactAudience;
  artifactType: ArtifactType;
  thinkingDepth: ThinkingDepth;
  dataBundle: CanvasCodeArtifactDataBundle;
  phase: CanvasCodeArtifactStage["phase"];
  message: string;
  parentRevisionId?: string;
  previousPackage?: NorthstarGeneratedCodeArtifactPackage;
  signal: AbortSignal;
}): Promise<NorthstarGeneratedCodeArtifactPackage> {
  if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (input.previousPackage) {
    return createNorthstarWorkingMutationPackage({
      previousPackage: input.previousPackage,
      dataBundle: input.dataBundle,
      phase: input.phase,
      message: input.message,
      creativeDirection: input.previousPackage.creativeDirection,
    });
  }
  return createNorthstarWorkingArtifactPackage({
    artifactId: input.artifactId,
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    dataBundle: input.dataBundle,
    phase: input.phase,
    thinkingDepth: input.thinkingDepth,
    parentRevisionId: input.parentRevisionId,
    message: input.message,
  });
}

async function buildGeneratedCodeArtifactPackage({
  apiKey,
  artifactId,
  message,
  intent,
  conversationSummary,
  blueprint,
  ledger,
  dataBundle,
  thinkingDepth,
  previousArtifact,
  recentCreativeSignatures,
  callbacks,
  signal,
}: {
  apiKey: string;
  artifactId: string;
  message: string;
  intent: SemanticIntentDecision;
  conversationSummary: string;
  blueprint: CompositionBlueprint;
  ledger: CompositionResearchLedger;
  dataBundle: CanvasCodeArtifactDataBundle;
  thinkingDepth: ThinkingDepth;
  previousArtifact?: SelectedCodeArtifactContext;
  recentCreativeSignatures: string[];
  callbacks: CompositionResearchCallbacks;
  signal: AbortSignal;
}): Promise<NorthstarGeneratedCodeArtifactPackage> {
  const budget = creativeBudgetForThinkingDepth(thinkingDepth);
  const diversity = createCreativeDiversityContext(recentCreativeSignatures);
  const designReferenceParts = await loadNorthstarDesignReferenceParts();
  const directionSteps = [
    {
      id: "frame-creative-brief",
      label: "Choose the viewer job and visual medium",
      tool: "prepare_composition_evidence",
      icon: "analyze" as CanvasAIActivityIcon,
    },
    {
      id: "explore-creative-concepts",
      label: `Render ${budget.conceptCount} materially different private studies`,
      tool: "prepare_composition_evidence",
      icon: "plan" as CanvasAIActivityIcon,
    },
    {
      id: "select-creative-direction",
      label: "Select the strongest rendered design behaviour",
      tool: "prepare_composition_evidence",
      icon: "compare" as CanvasAIActivityIcon,
    },
  ];
  await callbacks.extendPlan(
    directionSteps,
    `${thinkingDepth[0].toUpperCase()}${thinkingDepth.slice(1)} thinking: choose a medium privately, then evolve the one visible artboard through repeated reference-conditioned design acts.`,
  );

  let creativeDirection: NorthstarCreativeDirection;
  let exploration: NorthstarCreativeExplorationDraft | null = null;
  let renderedConceptStudies: Array<{
    conceptId: string;
    conceptName: string;
    capture: Awaited<ReturnType<typeof captureNorthstarArtifactPng>>;
  }> = [];

  try {
    await callbacks.startStep(directionSteps[0]);
    const rawExploration = await callGeminiJson<NorthstarCreativeExplorationDraft>({
      apiKey,
      systemInstruction: buildCreativeExplorationSystemInstruction(),
      contents: [{
        role: "user",
        parts: [
          ...designReferenceParts,
          {
            text: JSON.stringify(buildCreativeExplorationModelInput({
              userRequest: message,
              objective: intent.objective || message,
              audience: blueprint.audience,
              artifactType: blueprint.artifactType,
              thinkingDepth,
              conceptCount: budget.conceptCount,
              evidenceBrief: {
                title: blueprint.title,
                subtitle: blueprint.subtitle,
                summary: blueprint.summary,
                visualStrategy: blueprint.visualStrategy,
                researchDigest: blueprint.researchDigest,
                sections: blueprint.sections.map((section) => ({
                  id: section.id,
                  kind: section.kind,
                  title: section.title,
                  body: section.body,
                  appName: section.appName,
                  flowName: section.flowName,
                  evidenceIds: section.evidenceIds,
                  emphasis: section.emphasis,
                })),
              },
              researchLedger: compactCompositionResearchContext(ledger, "standard"),
              diversity,
              previousDirection: previousArtifact?.creativeDirection,
              revisionInstruction: previousArtifact ? message : undefined,
            })),
          },
        ],
      }],
      schema: NORTHSTAR_CREATIVE_EXPLORATION_JSON_SCHEMA,
      signal,
      maxOutputTokens: 30_000,
      temperature: budget.explorationTemperature,
    });
    exploration = sanitizeCreativeExploration(rawExploration, budget.conceptCount, intent.objective || message);
    for (let studyIndex = 0; studyIndex < exploration.concepts.length; studyIndex += 1) {
      const concept = exploration.concepts[studyIndex];
      if (!concept.study) continue;
      try {
        const studyDocument = prepareNorthstarConceptStudyDocument(concept.study.document, {
          objective: intent.objective || message,
          artifactType: blueprint.artifactType,
          userRequest: message,
          dataBundle,
        });
        const capture = await captureNorthstarArtifactPng({
          document: studyDocument,
          dataBundle,
          width: concept.study.preferredWidth,
          height: concept.study.preferredHeight,
        });
        exploration.concepts[studyIndex] = {
          ...concept,
          study: { ...concept.study, document: studyDocument },
          renderedStudyFingerprint: fingerprintSource(`${studyDocument.html}\n${studyDocument.css}`),
        };
        renderedConceptStudies.push({ conceptId: concept.id, conceptName: concept.name, capture });
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        console.warn(`Northstar skipped an invalid private concept study for ${concept.name}.`, error);
      }
    }
    if (renderedConceptStudies.length < 2) {
      throw new Error("Northstar could not render at least two materially different private concept studies.");
    }
    await callbacks.completeStep({
      id: directionSteps[0].id,
      tool: directionSteps[0].tool,
      detail: `Framed the artifact around “${exploration.brief.editorialThesis}” and the central tension: ${exploration.brief.centralTension}`,
    });
    await callbacks.startStep(directionSteps[1]);
    await callbacks.completeStep({
      id: directionSteps[1].id,
      tool: directionSteps[1].tool,
      detail: `Privately rendered ${renderedConceptStudies.length} materially different visual behaviours for pixel comparison.`,
    });

    await callbacks.startStep(directionSteps[2]);
    const selection = await callGeminiJson<NorthstarCreativeSelectionDraft>({
      apiKey,
      systemInstruction: buildCreativeSelectionSystemInstruction(),
      contents: [{
        role: "user",
        parts: [
          ...designReferenceParts,
          ...renderedConceptStudies.flatMap((study, index) => [
            { text: `PRIVATE RENDERED STUDY ${index + 1}: ${study.conceptName} (${study.conceptId}). Select behaviour only; this study document can never replace the live artboard.` },
            { inlineData: { mimeType: study.capture.mimeType, data: study.capture.data } },
          ]),
          {
            text: JSON.stringify(buildCreativeSelectionModelInput({
              exploration,
              audience: blueprint.audience,
              objective: intent.objective || message,
              recentSignatures: diversity.recentSignatures,
            })),
          },
        ],
      }],
      schema: NORTHSTAR_CREATIVE_SELECTION_JSON_SCHEMA,
      signal,
      maxOutputTokens: 5_000,
      temperature: budget.selectionTemperature,
    });
    creativeDirection = buildCreativeDirection({ exploration, selection, thinkingDepth, diversity });
    await callbacks.completeStep({
      id: directionSteps[2].id,
      tool: directionSteps[2].tool,
      detail: `Selected “${creativeDirection.selectedConcept.name}”. ${creativeDirection.selectionRationale}`,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throwIfGeminiInfrastructureError(error);
    creativeDirection = deterministicCreativeDirection({
      objective: intent.objective || message,
      thinkingDepth,
      diversity,
    });
    await callbacks.completeStep({
      id: directionSteps[0].id,
      tool: directionSteps[0].tool,
      detail: `Northstar kept the run moving with a grounded visual direction: ${creativeDirection.selectedConcept.name}.`,
    });
    await callbacks.startStep(directionSteps[1]);
    await callbacks.completeStep({
      id: directionSteps[1].id,
      tool: directionSteps[1].tool,
      detail: "Private study rendering was unavailable; no study document was published to the Canvas.",
    });
    await callbacks.startStep(directionSteps[2]);
    await callbacks.completeStep({
      id: directionSteps[2].id,
      tool: directionSteps[2].tool,
      detail: `Selected “${creativeDirection.selectedConcept.name}” as the provisional design behaviour.`,
    });
  }

  let currentPackage = callbacks.getVisibleArtifact() ?? createNorthstarWorkingArtifactPackage({
    artifactId,
    objective: intent.objective || message,
    audience: blueprint.audience,
    artifactType: blueprint.artifactType,
    dataBundle,
    phase: "analysis",
    thinkingDepth,
    parentRevisionId: previousArtifact?.revisionId,
    creativeDirection,
    message: blueprint.summary || blueprint.subtitle || blueprint.title,
  });

  const designAddendum = `${buildNorthstarDesignBehaviorAddendum()}\n\n${NORTHSTAR_VISUAL_DNA}`;
  const evidenceSummary = {
    referencePackVersion: "northstar-eight-reference-pack.v0.4.8.5.1",
    identityRule: "All eight gold-standard references condition every autonomous move; none is a template.",
    screenshotCount: dataBundle.screenshots.length,
    flowCount: dataBundle.flows.length,
    appCount: dataBundle.apps.length,
    hypothesisCount: dataBundle.hypotheses.length,
    decisionCount: dataBundle.decisions.length,
    coverageSummary: dataBundle.coverageSummary,
  };
  const maximumMoves = thinkingDepth === "low"
    ? Math.min(8, budget.designActCount)
    : thinkingDepth === "medium"
      ? Math.min(12, budget.designActCount)
      : budget.designActCount;
  const minimumMoves = thinkingDepth === "low" ? 6 : thinkingDepth === "high" ? 12 : 9;
  let visibleMutationCount = 0;
  let latestReviewSummary = "The live artboard is beginning its autonomous design evolution.";
  let finalVerified = false;
  let priorCritique: { critique: string; requiredChanges: string[] } | undefined;
  let consecutiveRejectedMoves = 0;
  const successfulMoves: Array<{ label: string; visibleChange: string }> = [];

  for (let moveIndex = 0; moveIndex < maximumMoves; moveIndex += 1) {
    const visibleBefore = callbacks.getVisibleArtifact() ?? currentPackage;
    const beforeLiveAck = callbacks.getLastMutationAck?.();
    const beforeSurface = captureDocumentFromLiveAcknowledgement(visibleBefore, beforeLiveAck);
    const beforeCapture = await captureNorthstarArtifactPng({
      document: beforeSurface.document,
      mutationJournal: beforeSurface.mutationJournal,
      dataBundle: visibleBefore.dataBundle,
      creativeDirection,
      creativeReviews: visibleBefore.creativeReviews,
      width: beforeSurface.width,
      height: beforeSurface.height,
    });

    let move;
    try {
      const rawMove = await callGeminiJson<NorthstarDynamicDesignMoveDraft>({
        apiKey,
        systemInstruction: `${buildNorthstarDynamicDesignMoveSystemInstruction()}\n\n${designAddendum}`,
        contents: [{
          role: "user",
          parts: [
            ...designReferenceParts,
            { text: `CURRENT EXACT LIVING ARTBOARD. Inspect these pixels and autonomously decide the single most valuable next design move. Do not choose from a checklist. ${moveIndex >= Math.floor(maximumMoves * 0.55) ? "The composition is mature enough to challenge. Prefer transformation, subtraction, and recomposition. When using relationships, define exact source and target semantic nodes, a relationship type and meaning, and use grounded app icons or screenshot evidence as actors. Reject anonymous dots, arbitrary pills, unsupported axes, and approximate diagonal lines." : "Build momentum with a clear, immediately observable move."}` },
            { inlineData: { mimeType: beforeCapture.mimeType, data: beforeCapture.data } },
            {
              text: JSON.stringify(buildNorthstarDynamicDesignMoveModelInput({
                objective: intent.objective || message,
                audience: blueprint.audience,
                artifactType: blueprint.artifactType,
                moveIndex,
                minimumMoves,
                maximumMoves,
                visibleMutationCount,
                currentTitle: visibleBefore.title,
                currentDescription: visibleBefore.description,
                currentGeometry: { width: beforeCapture.width, height: beforeCapture.height },
                recentSuccessfulMoves: successfulMoves,
                priorCritique,
                runtimeReview: beforeLiveAck?.review,
                creativeDirection,
                evidenceSummary,
              })),
            },
          ],
        }],
        schema: NORTHSTAR_DYNAMIC_DESIGN_MOVE_JSON_SCHEMA,
        signal,
        maxOutputTokens: thinkingDepth === "low" ? 2_200 : 4_200,
        temperature: Math.min(0.98, budget.artifactTemperature + 0.14),
      });
      move = sanitizeNorthstarDynamicDesignMove(rawMove, {
        moveIndex,
        minimumMoves,
        recentLabels: successfulMoves.map((entry) => entry.label),
      });
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      console.warn("Northstar could not choose the next autonomous visual move; inspecting the same surface again.", error);
      consecutiveRejectedMoves += 1;
      if (consecutiveRejectedMoves >= 3) break;
      continue;
    }

    if (!move.continueDesigning && visibleMutationCount >= minimumMoves) {
      break;
    }

    const dynamicAct: NorthstarProgressiveDesignAct = {
      id: `autonomous-move-${moveIndex + 1}`,
      label: move.label,
      phase: move.phase,
      intent: `${move.diagnosis} ${move.intent} Observable outcome: ${move.observableOutcome}`,
      successCriteria: [
        "Make one focused, observable adjustment to the exact currently mounted artboard.",
        "Do not repeat a recent mutation or insert a semantic node that already exists.",
        "The browser must acknowledge a meaningful visible delta before the move is recorded.",
        "Preserve the same artboard, evidence lineage, and useful existing work.",
        ...move.successCriteria,
      ],
      minimumChangeCharacters: 1,
    };

    let candidate: NorthstarGeneratedCodeArtifactPackage | undefined;
    let published = false;

    const moveAttemptLimit = thinkingDepth === "low" ? 1 : Math.min(2, budget.designActAttempts);
    for (let attempt = 1; attempt <= moveAttemptLimit; attempt += 1) {
      try {
        // Every attempt is rooted in the exact browser-acknowledged package at the
        // instant the attempt begins. A rejected or timed-out candidate is never
        // allowed to become the parent of a retry.
        const attemptBase = callbacks.getVisibleArtifact() ?? currentPackage;
        const attemptBaseRevisionId = attemptBase.revisionId;
        const attemptBaseMutationId = attemptBase.mutationJournal?.at(-1)?.mutationId;

        const rawDraft = await callGeminiJson<NorthstarArtboardMutationDraft>({
          apiKey,
          systemInstruction: buildNorthstarArtboardMutationSystemInstruction(designAddendum),
          contents: [{
            role: "user",
            parts: [
              ...designReferenceParts,
              { text: `CURRENT EXACT LIVING ARTBOARD. Execute this autonomous artistic decision: “${move.label}”. The visible result must satisfy: ${move.observableOutcome}. Use only the allowed operation capability map in the JSON context. Never output set-html. Never replace a structural region. Relationship visuals must be typed semantic markup, not freehand CSS. Preserve accuracy, but do not default to a generic dashboard. Advance the chosen visual communication thesis through composition, scale, rhythm, spatial metaphor, evidence relationships, app identity, and editorial hierarchy. Follow the user's explicit visual instructions. Make one decisive visible change rather than adding decorative complexity.` },
              { inlineData: { mimeType: beforeCapture.mimeType, data: beforeCapture.data } },
              {
                text: JSON.stringify(buildNorthstarArtboardMutationModelInput({
                  objective: intent.objective || message,
                  audience: blueprint.audience,
                  artifactType: blueprint.artifactType,
                  userRequest: message,
                  designAct: dynamicAct,
                  previous: attemptBase,
                  currentRender: { width: beforeCapture.width, height: beforeCapture.height, mimeType: beforeCapture.mimeType },
                  groundedEvidence: {
                    evidenceSummary,
                    dataBundle,
                    researchLedger: compactCompositionResearchContext(ledger, "minimal"),
                  },
                  creativeDirection,
                  priorCritique,
                  attempt,
                  maxAttempts: moveAttemptLimit,
                })),
              },
            ],
          }],
          schema: NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
          signal,
          maxOutputTokens: thinkingDepth === "low" ? 3_200 : 7_200,
          temperature: attempt === 1 ? budget.artifactTemperature : Math.max(0.12, budget.artifactTemperature - 0.1),
        });

        const compiled = compileNorthstarMutationDraft({
          previous: attemptBase,
          draft: rawDraft,
        });
        if (compiled.repairs.length) {
          console.info("Northstar mutation compiler repaired a model draft before publication.", compiled.repairs);
        }
        if (compiled.draft.operations.length === 0) {
          priorCritique = {
            critique: "The mutation compiler found no safe visible operation in this proposal.",
            requiredChanges: ["Transform an existing semantic node or choose a different concrete visual move."],
          };
          continue;
        }

        candidate = appendNorthstarArtboardMutation({
          previous: attemptBase,
          draft: compiled.draft,
          label: move.label,
          phase: move.phase,
          intent: dynamicAct.intent,
          diagnostics: [`Northstar v0.4.9.1 autonomous move ${moveIndex + 1}: ${compiled.draft.visibleChange}`],
        });
        const dispatched = await callbacks.publishArtifact(
          candidate,
          move.phase === "analysis" ? 2 : move.phase === "recommendation" ? 3 : 4,
          move.label,
        );
        if (!dispatched) {
          const rejectedAck = callbacks.getLastMutationAck?.();
          // The proposal never becomes history. Re-read the actor snapshot and retry
          // from that exact committed package only.
          currentPackage = callbacks.getVisibleArtifact() ?? attemptBase;
          candidate = undefined;
          priorCritique = {
            critique: rejectedAck?.reason || rejectedAck?.review?.summary || "The exact live surface rejected this proposed move.",
            requiredChanges: [
              ...(rejectedAck?.missingAssetUrls.length ? ["Use only registered grounded assets and wait for them to load."] : []),
              ...(rejectedAck?.meaningfulChangedNodeIds.length === 0 ? ["Choose a different concrete spatial or hierarchical move; do not repeat copy or styling already present."] : []),
              ...(rejectedAck?.review?.documentScrollRisk ? ["Remove internal scrolling and let intrinsic geometry follow the composition."] : []),
              ...(rejectedAck?.review?.clippedTextCount ? ["Remove clipping and preserve complete readable text."] : []),
              ...(rejectedAck?.reason === "Mutation lineage is discontinuous." ? ["Rebase the next proposal on the exact last browser-acknowledged mutation; never reuse the rejected candidate lineage."] : []),
            ],
          };
          throw new Error(rejectedAck?.reason || "The browser did not acknowledge a meaningful visible mutation.");
        }
        currentPackage = callbacks.getVisibleArtifact() ?? attemptBase;
        visibleMutationCount += 1;
        published = true;
        consecutiveRejectedMoves = 0;
        successfulMoves.push({ label: move.label, visibleChange: rawDraft.visibleChange });
        break;
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        console.warn(`Northstar autonomous move attempt ${attempt} was rejected; replanning without adding a failed activity item.`, error);
      }
    }

    if (!published || !candidate) {
      consecutiveRejectedMoves += 1;
      if (consecutiveRejectedMoves >= 3) break;
      continue;
    }

    const step = {
      id: `live-autonomous-${visibleMutationCount}`,
      label: move.label,
      tool: "prepare_composition_evidence",
      icon: move.phase === "refinement" ? "analyze" as CanvasAIActivityIcon : "write" as CanvasAIActivityIcon,
    };
    await callbacks.extendPlan([step], "Northstar chose the next visual move from the exact current artboard.");
    await callbacks.startStep(step);

    try {
      const liveAck = callbacks.getLastMutationAck?.();
      const acknowledgedCandidate = callbacks.getVisibleArtifact() ?? candidate;
      const critiqueInterval = thinkingDepth === "low" ? 5 : thinkingDepth === "medium" ? 3 : 2;
      const shouldRunFullCritique = visibleMutationCount === 1
        || visibleMutationCount % critiqueInterval === 0
        || visibleMutationCount >= maximumMoves
        || move.phase === "recommendation";
      if (!shouldRunFullCritique) {
        latestReviewSummary = `${move.label}: browser-verified rapid design pulse; full multimodal critique deferred to the next composition checkpoint.`;
        currentPackage = {
          ...currentPackage,
          diagnostics: [...currentPackage.diagnostics, latestReviewSummary].slice(-60),
          provisional: true,
          publicationState: "working",
        };
        await callbacks.completeStep({
          id: step.id,
          tool: step.tool,
          detail: `Browser-verified “${move.label}” on the same living artboard. ${move.observableOutcome}`,
        });
        continue;
      }
      const afterSurface = captureDocumentFromLiveAcknowledgement(acknowledgedCandidate, liveAck);
      const afterCapture = await captureNorthstarArtifactPng({
        document: afterSurface.document,
        mutationJournal: afterSurface.mutationJournal,
        dataBundle: acknowledgedCandidate.dataBundle,
        creativeDirection,
        creativeReviews: acknowledgedCandidate.creativeReviews,
        width: afterSurface.width,
        height: afterSurface.height,
      });
      const rawCritique = await callGeminiJson<NorthstarCreativeCritiqueDraft>({
        apiKey,
        systemInstruction: buildCreativeCritiqueSystemInstruction(),
        contents: [{
          role: "user",
          parts: [
            ...designReferenceParts,
            { text: "BEFORE — the same living artboard immediately before the autonomous move." },
            { inlineData: { mimeType: beforeCapture.mimeType, data: beforeCapture.data } },
            { text: `AFTER — the exact same artboard after “${move.label}”. Judge the visible delta honestly against the eight gold-standard references and identify the single most important unresolved visual problem.` },
            { inlineData: { mimeType: afterCapture.mimeType, data: afterCapture.data } },
            {
              text: JSON.stringify(buildCreativeCritiqueModelInput({
                title: acknowledgedCandidate.title,
                description: acknowledgedCandidate.description,
                visualStrategy: acknowledgedCandidate.visualStrategy,
                document: afterSurface.document,
                direction: creativeDirection,
                evidenceSummary: { ...evidenceSummary, autonomousMove: move, mutationCount: acknowledgedCandidate.mutationJournal?.length ?? 0 },
                pass: visibleMutationCount,
                totalPasses: maximumMoves,
                priorReviews: currentPackage.creativeReviews,
                runtimeReview: liveAck?.review,
                previousRender: { width: beforeCapture.width, height: beforeCapture.height, mimeType: beforeCapture.mimeType },
                renderCapture: { width: afterCapture.width, height: afterCapture.height, mimeType: afterCapture.mimeType },
                designAct: dynamicAct,
              })),
            },
          ],
        }],
        schema: NORTHSTAR_CREATIVE_CRITIQUE_JSON_SCHEMA,
        signal,
        maxOutputTokens: thinkingDepth === "low" ? 3_600 : 7_000,
        temperature: budget.critiqueTemperature,
      });
      const critique = sanitizeCreativeCritique(rawCritique, visibleMutationCount, afterSurface.document);
      const scores = critique.review.scores;
      latestReviewSummary = `${move.label}: clarity ${scores.clarity}, grounding ${scores.grounding}, originality ${scores.originality}, usefulness ${scores.usefulness}, craft ${scores.craft}, audience fit ${scores.audienceFit}. ${critique.review.critique}`;
      priorCritique = { critique: critique.review.critique, requiredChanges: critique.review.requiredChanges };
      const professionalFloor = scores.clarity >= 86 && scores.grounding >= 88 && scores.originality >= 82 && scores.usefulness >= 84 && scores.craft >= 88 && scores.audienceFit >= 84;
      const latestMutationId = acknowledgedCandidate.mutationJournal?.at(-1)?.mutationId;
      finalVerified = visibleMutationCount >= minimumMoves && critique.review.accepted && professionalFloor && liveAcknowledgementPassed(liveAck, latestMutationId);
      currentPackage = {
        ...currentPackage,
        creativeReviews: [...currentPackage.creativeReviews, critique.review].slice(-24),
        diagnostics: [...currentPackage.diagnostics, `Exact autonomous-surface review after mutation ${visibleMutationCount}: ${latestReviewSummary}`].slice(-60),
        provisional: !finalVerified,
        publicationState: finalVerified ? "verified" : "working",
      };
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      latestReviewSummary = `The exact visible move “${move.label}” was committed; Northstar continued inspecting the same living surface.`;
    }

    await callbacks.completeStep({
      id: step.id,
      tool: step.tool,
      detail: `Browser-verified “${move.label}” on the same living artboard. ${move.observableOutcome}`,
    });

    if (finalVerified && visibleMutationCount >= minimumMoves) {
      // The next autonomous inspection may still continue when it sees an important unresolved issue.
      // This flag records that the current exact surface already clears the professional floor.
    }
  }

  // Deterministic publication resolution on the same mounted artboard.
  //
  // The design agent owns the visual thesis and composition. Northstar's
  // platform-owned working chrome is removed through a deterministic mutation,
  // so completion cannot fail because a final model call emitted an unsupported
  // operation or promised an unobservable geometry change.
  try {
    const publicationBase = callbacks.getVisibleArtifact() ?? currentPackage;
    const publicationDraft = buildDeterministicNorthstarPublicationDraft({
      previous: publicationBase,
      objective: intent.objective || message,
    });
    const publicationCandidate: NorthstarGeneratedCodeArtifactPackage = {
      ...appendNorthstarArtboardMutation({
        previous: publicationBase,
        draft: publicationDraft,
        label: "Publish the final presentation",
        phase: "refinement",
        intent: "Remove temporary Northstar working chrome and publish the exact same browser-acknowledged artboard.",
        diagnostics: [
          "Northstar v0.4.9.2 applied deterministic publication cleanup on the same living artboard.",
        ],
      }),
      provisional: false,
      publicationState: "verified",
    };

    const publicationApplied = await callbacks.publishArtifact(
      publicationCandidate,
      4,
      "Publish the final presentation",
    );

    if (publicationApplied) {
      const committedPublication = callbacks.getVisibleArtifact();
      const publicationAck = callbacks.getLastMutationAck?.();
      const publicationMutationId = publicationCandidate.mutationJournal?.at(-1)?.mutationId;
      finalVerified = Boolean(
        committedPublication
        && committedPublication.revisionId === publicationCandidate.revisionId
        && committedPublication.publicationState === "verified"
        && committedPublication.provisional === false
        && liveAcknowledgementPassed(publicationAck, publicationMutationId),
      );
      currentPackage = committedPublication ?? publicationCandidate;
      if (finalVerified) visibleMutationCount += 1;
    } else {
      currentPackage = callbacks.getVisibleArtifact() ?? currentPackage;
      finalVerified = false;
    }
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    console.warn(
      "Northstar preserved the last committed artboard because deterministic publication did not receive a browser commit.",
      error,
    );
    currentPackage = callbacks.getVisibleArtifact() ?? currentPackage;
    finalVerified = false;
  }

  return {
    ...currentPackage,
    creativeDirection,
    diagnostics: [
      ...currentPackage.diagnostics,
      `Northstar v0.4.9.2 accumulated ${visibleMutationCount} browser-acknowledged visible mutations on one continuously mounted artboard.`,
      latestReviewSummary,
    ].slice(-60),
    provisional: !finalVerified,
    publicationState: finalVerified ? "verified" : "working",
  };
}
function sanitizeObservation(
  value: CompositionEvidenceObservation,
  knownScreens: Map<string, GroundedCompositionScreen>,
): CompositionEvidenceObservation | null {
  const known = knownScreens.get(value.screenshotId);
  if (!known) return null;
  const strings = (input: unknown, max: number) =>
    Array.isArray(input)
      ? input
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim().slice(0, 400))
          .slice(0, max)
      : [];
  return {
    screenshotId: known.id,
    appName: known.appName,
    flowName: known.flowName,
    screenName: known.title ?? "Untitled screen",
    journeyStage: typeof value.journeyStage === "string" ? value.journeyStage.trim().slice(0, 240) : undefined,
    visibleCopy: strings(value.visibleCopy, 12),
    uiElements: strings(value.uiElements, 12),
    userGoal: typeof value.userGoal === "string" ? value.userGoal.trim().slice(0, 600) : undefined,
    notablePatterns: strings(value.notablePatterns, 10),
    frictionSignals: strings(value.frictionSignals, 8),
    trustSignals: strings(value.trustSignals, 8),
    opportunities: strings(value.opportunities, 8),
    relevance:
      typeof value.relevance === "number" && Number.isFinite(value.relevance)
        ? Math.max(0, Math.min(1, value.relevance))
        : 0.5,
    selectionReason:
      typeof value.selectionReason === "string"
        ? value.selectionReason.trim().slice(0, 600)
        : undefined,
  };
}


function inferGroundedJourneyStage(screen: GroundedCompositionScreen): string {
  const normalized = normalizeLookup(`${screen.title ?? ""} ${screen.flowName ?? ""}`);
  if (/verify|verification|code|email validation|confirm/.test(normalized)) return "verification";
  if (/sign in|log in|login|create account|account setup|name|username|profile/.test(normalized)) return "account setup";
  if (/get started|start now|join|connect|activate|continue/.test(normalized)) return "activation";
  if (/earn|brand|partner|benefit|value|grow|feature|platform|trust/.test(normalized)) return "consideration";
  return (screen.index ?? 0) <= 0 ? "awareness" : "journey progression";
}

function buildMetadataGroundedObservation(
  screen: GroundedCompositionScreen,
): CompositionEvidenceObservation {
  const screenName = screen.title?.trim() || "Untitled screen";
  const flowName = screen.flowName?.trim() || "the selected flow";
  const ordinal = typeof screen.index === "number" && Number.isFinite(screen.index)
    ? `Screen ${Math.max(1, Math.round(screen.index) + 1)}`
    : "An ordered screen";
  return {
    screenshotId: screen.id,
    appName: screen.appName,
    flowName: screen.flowName,
    screenName,
    journeyStage: inferGroundedJourneyStage(screen),
    visibleCopy: screenName !== "Untitled screen" ? [screenName] : [],
    uiElements: [],
    userGoal: `Progress through “${screenName}” in ${flowName}.`,
    notablePatterns: [
      `${ordinal} in the authoritative ${screen.appName} ${flowName} sequence.`,
    ],
    frictionSignals: [],
    trustSignals: [],
    opportunities: [],
    relevance: 0.72,
    selectionReason:
      `Included because it belongs to the authoritative ordered ${screen.appName} ${flowName} reference flow selected for this analysis.`,
  };
}

function ensureReferenceFlowGrounding({
  ledger,
  screens,
  selectedFlows,
}: {
  ledger: CompositionResearchLedger;
  screens: GroundedCompositionScreen[];
  selectedFlows: CompositionCheckpointFlow[];
}): { addedObservationCount: number; coveredFlowCount: number } {
  const screensById = new Map(screens.map((screen) => [screen.id, screen]));
  const existingObservationIds = new Set(ledger.observations.map((item) => item.screenshotId));
  const inspectedIds = new Set(ledger.inspectedScreenshotIds);
  let addedObservationCount = 0;
  let coveredFlowCount = 0;

  const effectiveFlows = selectedFlows.length > 0
    ? selectedFlows
    : Array.from(
        screens.reduce((groups, screen) => {
          if (!screen.flowName) return groups;
          const key = `${normalizeLookup(screen.appName)}::${normalizeLookup(screen.flowName)}`;
          const existing = groups.get(key) ?? {
            appName: screen.appName,
            flowId: screen.flowName,
            flowName: screen.flowName,
            platform: screen.platform,
            sessionType: screen.sessionType,
            screenIds: [],
          };
          if (!existing.screenIds.includes(screen.id)) existing.screenIds.push(screen.id);
          groups.set(key, existing);
          return groups;
        }, new Map<string, CompositionCheckpointFlow>()).values(),
      );

  for (const flow of effectiveFlows) {
    const orderedScreens = flow.screenIds
      .map((id) => screensById.get(id))
      .filter((screen): screen is GroundedCompositionScreen => Boolean(screen))
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const fallbackScreens = orderedScreens.length > 0
      ? orderedScreens
      : screens
          .filter(
            (screen) =>
              normalizeLookup(screen.appName) === normalizeLookup(flow.appName) &&
              normalizeLookup(screen.flowName ?? "") === normalizeLookup(flow.flowName),
          )
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (fallbackScreens.length === 0) continue;
    coveredFlowCount += 1;
    for (const screen of fallbackScreens) {
      inspectedIds.add(screen.id);
      if (existingObservationIds.has(screen.id)) continue;
      ledger.observations.push(buildMetadataGroundedObservation(screen));
      existingObservationIds.add(screen.id);
      addedObservationCount += 1;
    }
  }

  ledger.inspectedScreenshotIds = Array.from(inspectedIds);
  return { addedObservationCount, coveredFlowCount };
}

async function studyScreenshotBatchOnce({
  apiKey,
  objective,
  batch,
  signal,
}: {
  apiKey: string;
  objective: string;
  batch: GroundedCompositionScreen[];
  signal: AbortSignal;
}): Promise<{
  batchSummary: string;
  observations: CompositionEvidenceObservation[];
  loadedScreens: GroundedCompositionScreen[];
}> {
  const parts: GeminiPart[] = [
    {
      text: JSON.stringify({
        objective,
        instruction:
          "Each image follows its exact metadata. Return exactly one grounded observation for every successfully loaded image.",
      }),
    },
  ];
  const loadedScreens: GroundedCompositionScreen[] = [];

  for (const screen of batch) {
    if (!screen.imageUrl || !/^https?:\/\//i.test(screen.imageUrl)) continue;
    const visualParts = await fetchVisualPart(
      {
        id: screen.id,
        url: screen.imageUrl,
        label: `${screen.appName} — ${screen.flowName ?? "Unknown flow"} — ${screen.title ?? "Untitled screen"}`,
      },
      signal,
    );
    const inlinePart = visualParts.find(
      (part): part is Extract<GeminiPart, { inlineData: unknown }> => "inlineData" in part,
    );
    if (!inlinePart) continue;
    parts.push({
      text: JSON.stringify({
        screenshotId: screen.id,
        appName: screen.appName,
        flowName: screen.flowName,
        screenName: screen.title,
        platform: screen.platform,
        sessionType: screen.sessionType,
        index: screen.index,
      }),
    });
    parts.push(inlinePart);
    loadedScreens.push(screen);
  }

  if (loadedScreens.length === 0) {
    return {
      batchSummary: "No screenshot images in this batch were available for visual inspection.",
      observations: [],
      loadedScreens: [],
    };
  }

  const raw = await callGeminiJson<ScreenBatchStudyResponse>({
    apiKey,
    systemInstruction: SCREEN_BATCH_STUDY_SYSTEM_INSTRUCTION,
    contents: [{ role: "user", parts }],
    schema: SCREEN_BATCH_STUDY_JSON_SCHEMA,
    signal,
    maxOutputTokens: Math.max(6_000, loadedScreens.length * 850),
  });
  const known = new Map(loadedScreens.map((screen) => [screen.id, screen]));
  return {
    batchSummary:
      typeof raw.batchSummary === "string"
        ? raw.batchSummary.trim().slice(0, 1_600)
        : `Studied ${loadedScreens.length} screenshots.`,
    observations: Array.isArray(raw.observations)
      ? raw.observations
          .map((observation) => sanitizeObservation(observation, known))
          .filter((observation): observation is CompositionEvidenceObservation => Boolean(observation))
      : [],
    loadedScreens,
  };
}

async function studyScreenshotBatch({
  apiKey,
  objective,
  batch,
  signal,
}: {
  apiKey: string;
  objective: string;
  batch: GroundedCompositionScreen[];
  signal: AbortSignal;
}): Promise<ScreenBatchStudyResponse> {
  const observations = new Map<string, CompositionEvidenceObservation>();
  const loaded = new Map<string, GroundedCompositionScreen>();
  const summaries: string[] = [];
  let pending = [...batch];

  for (let attempt = 0; attempt < 3 && pending.length > 0; attempt += 1) {
    const chunkSize = attempt === 0 ? Math.max(1, pending.length) : attempt === 1 ? 5 : 2;
    const nextPending: GroundedCompositionScreen[] = [];
    for (let index = 0; index < pending.length; index += chunkSize) {
      const chunk = pending.slice(index, index + chunkSize);
      try {
        const result = await studyScreenshotBatchOnce({
          apiKey,
          objective,
          batch: chunk,
          signal,
        });
        result.loadedScreens.forEach((screen) => loaded.set(screen.id, screen));
        result.observations.forEach((observation) => observations.set(observation.screenshotId, observation));
        if (result.batchSummary) summaries.push(result.batchSummary);
        const observedIds = new Set(result.observations.map((item) => item.screenshotId));
        result.loadedScreens.forEach((screen) => {
          if (!observedIds.has(screen.id)) nextPending.push(screen);
        });
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        if (error instanceof GeminiCallError) throw error;
        nextPending.push(...chunk);
      }
    }
    pending = Array.from(new Map(nextPending.map((screen) => [screen.id, screen])).values())
      .filter((screen) => !observations.has(screen.id));
  }

  let fallbackObservationCount = 0;
  for (const screen of batch) {
    if (observations.has(screen.id)) continue;
    observations.set(screen.id, buildMetadataGroundedObservation(screen));
    fallbackObservationCount += 1;
  }

  const observedList = Array.from(observations.values());
  const unresolvedScreenshotIds = batch
    .filter((screen) => !observations.has(screen.id))
    .map((screen) => screen.id);
  const modelSummary = summaries.find((item) => item.trim());
  const visuallyGroundedCount = Math.max(0, observedList.length - fallbackObservationCount);
  const summary = fallbackObservationCount === 0
    ? modelSummary ?? `Completed ${observedList.length} grounded screenshot observations.`
    : visuallyGroundedCount > 0
      ? `Completed ${visuallyGroundedCount} visual observations and preserved ${fallbackObservationCount} additional ordered screens with provenance-grounded records.`
      : `Preserved ${fallbackObservationCount} ordered screenshots with provenance-grounded records so the selected reference flow remains complete.`;
  return {
    batchSummary: summary,
    observations: observedList,
    loadedScreenshotIds: Array.from(new Set([...loaded.keys(), ...batch.map((screen) => screen.id)])),
    unresolvedScreenshotIds,
    fallbackObservationCount,
  };
}

function compactObservationForSynthesis(observation: CompositionEvidenceObservation) {
  return {
    screenshotId: observation.screenshotId,
    appName: observation.appName,
    flowName: observation.flowName,
    screenName: observation.screenName,
    journeyStage: observation.journeyStage,
    visibleCopy: observation.visibleCopy.slice(0, 6),
    uiElements: observation.uiElements.slice(0, 6),
    userGoal: observation.userGoal,
    notablePatterns: observation.notablePatterns.slice(0, 6),
    frictionSignals: observation.frictionSignals.slice(0, 5),
    trustSignals: observation.trustSignals.slice(0, 5),
    opportunities: observation.opportunities.slice(0, 5),
    relevance: observation.relevance,
  };
}

async function synthesizeFlowResearch({
  apiKey,
  objective,
  observations,
  signal,
}: {
  apiKey: string;
  objective: string;
  observations: CompositionEvidenceObservation[];
  signal: AbortSignal;
}): Promise<CompositionFlowSynthesis> {
  const first = observations[0];
  if (!first?.flowName) {
    throw new Error("A flow synthesis requires grounded flow observations.");
  }
  const raw = await callGeminiJson<CompositionFlowSynthesis>({
    apiKey,
    systemInstruction: FLOW_SYNTHESIS_SYSTEM_INSTRUCTION,
    contents: [{
      role: "user",
      parts: [{
        text: JSON.stringify({
          objective,
          appName: first.appName,
          flowName: first.flowName,
          observations: observations.slice(0, 48).map(compactObservationForSynthesis),
        }),
      }],
    }],
    schema: FLOW_SYNTHESIS_JSON_SCHEMA,
    signal,
    maxOutputTokens: 3_500,
  });
  const knownIds = new Set(observations.map((item) => item.screenshotId));
  return {
    appName: first.appName,
    flowName: first.flowName,
    sessionType: raw.sessionType,
    platform: raw.platform,
    screenshotIds: Array.isArray(raw.screenshotIds)
      ? raw.screenshotIds.filter((id) => knownIds.has(id)).slice(0, 80)
      : observations.map((item) => item.screenshotId),
    summary: getString(raw.summary)?.trim().slice(0, 2_000) || `Studied ${observations.length} screens from ${first.flowName}.`,
    journeyStages: sanitizeStringArray(raw.journeyStages, 16, 300) ?? [],
    patterns: sanitizeStringArray(raw.patterns, 16, 500) ?? [],
    frictionSignals: sanitizeStringArray(raw.frictionSignals, 12, 500) ?? [],
    trustSignals: sanitizeStringArray(raw.trustSignals, 12, 500) ?? [],
    openQuestions: sanitizeStringArray(raw.openQuestions, 10, 500) ?? [],
    relevance: typeof raw.relevance === "number" && Number.isFinite(raw.relevance)
      ? Math.max(0, Math.min(1, raw.relevance))
      : Math.max(...observations.map((item) => item.relevance), 0.5),
  };
}

async function synthesizeAppResearch({
  apiKey,
  objective,
  appName,
  flows,
  signal,
}: {
  apiKey: string;
  objective: string;
  appName: string;
  flows: CompositionFlowSynthesis[];
  signal: AbortSignal;
}): Promise<CompositionAppSynthesis> {
  const raw = await callGeminiJson<CompositionAppSynthesis>({
    apiKey,
    systemInstruction: APP_SYNTHESIS_SYSTEM_INSTRUCTION,
    contents: [{
      role: "user",
      parts: [{ text: JSON.stringify({ objective, appName, flows }) }],
    }],
    schema: APP_SYNTHESIS_JSON_SCHEMA,
    signal,
    maxOutputTokens: 3_800,
  });
  const knownIds = new Set(flows.flatMap((flow) => flow.screenshotIds));
  return {
    appName,
    summary: getString(raw.summary)?.trim().slice(0, 2_400) || `Synthesized ${flows.length} relevant flows for ${appName}.`,
    flowNames: Array.from(new Set(flows.map((flow) => flow.flowName))),
    screenshotIds: Array.isArray(raw.screenshotIds)
      ? raw.screenshotIds.filter((id) => knownIds.has(id)).slice(0, 120)
      : Array.from(knownIds),
    patterns: sanitizeStringArray(raw.patterns, 18, 500) ?? [],
    onboardingModel: getString(raw.onboardingModel)?.trim().slice(0, 1_200),
    activationModel: getString(raw.activationModel)?.trim().slice(0, 1_200),
    strengths: sanitizeStringArray(raw.strengths, 12, 500) ?? [],
    risks: sanitizeStringArray(raw.risks, 12, 500) ?? [],
    openQuestions: sanitizeStringArray(raw.openQuestions, 12, 500) ?? [],
  };
}


function uniqueGroundedStrings(values: Array<string | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = normalizeLookup(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

function isOperationalGroundingText(value: string | undefined): boolean {
  const normalized = normalizeLookup(value ?? "");
  return (
    normalized.includes("retained from the authoritative ordered reference flow") ||
    normalized.includes("visual study response did not return") ||
    normalized.includes("provenance grounded fallback") ||
    normalized.includes("research chain remains complete")
  );
}

function cleanSynthesisNarrative(value: string | undefined, maxLength = 1_200): string {
  if (!value?.trim()) return "";
  const fragments = value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !isOperationalGroundingText(item));
  return uniqueGroundedStrings(fragments, 8).join(" ").slice(0, maxLength).trim();
}

function buildDeterministicFlowSynthesis(
  observations: CompositionEvidenceObservation[],
): CompositionFlowSynthesis {
  const first = observations[0];
  const ordered = [...observations].sort((a, b) => {
    const aIndex = Number.parseInt(a.notablePatterns.find((item) => /screen\s+\d+/i.test(item))?.match(/\d+/)?.[0] ?? "0", 10);
    const bIndex = Number.parseInt(b.notablePatterns.find((item) => /screen\s+\d+/i.test(item))?.match(/\d+/)?.[0] ?? "0", 10);
    return aIndex - bIndex;
  });
  const titles = uniqueGroundedStrings(ordered.map((item) => item.screenName), 8);
  const stages = uniqueGroundedStrings(ordered.map((item) => item.journeyStage), 12);
  const stageCounts = new Map<string, { label: string; count: number }>();
  for (const stage of ordered.map((item) => item.journeyStage).filter((item): item is string => Boolean(item?.trim()))) {
    const key = normalizeLookup(stage);
    const current = stageCounts.get(key);
    stageCounts.set(key, { label: current?.label ?? stage.trim(), count: (current?.count ?? 0) + 1 });
  }
  const dominantStage = Array.from(stageCounts.values()).sort((a, b) => b.count - a.count)[0];
  const groundedPatterns = uniqueGroundedStrings(
    ordered.flatMap((item) => item.notablePatterns).filter((item) => !/^screen\s+\d+\s+in\s+the\s+authoritative/i.test(item)),
    8,
  );
  const frictionSignals = uniqueGroundedStrings(ordered.flatMap((item) => item.frictionSignals), 12);
  const trustSignals = uniqueGroundedStrings(ordered.flatMap((item) => item.trustSignals), 12);

  const start = titles[0];
  const end = titles.length > 1 ? titles[titles.length - 1] : undefined;
  const middle = titles.slice(1, -1).slice(0, 3);
  const progressionParts: string[] = [];
  if (start) progressionParts.push(`It opens with “${start}”`);
  if (middle.length > 0) progressionParts.push(`moves through ${middle.map((item) => `“${item}”`).join(", ")}`);
  if (end) progressionParts.push(`and closes with “${end}”`);
  const progression = progressionParts.length > 0 ? `${progressionParts.join(", ")}.` : "";
  const stageSentence = stages.length > 0
    ? `The observed sequence spans ${stages.join(", ")}.`
    : "";
  const dominantStageSentence = dominantStage
    ? `${dominantStage.count} of ${ordered.length} screens are primarily associated with ${dominantStage.label}.`
    : "";
  const patternSentence = groundedPatterns.length > 0
    ? `Key observed patterns include ${groundedPatterns.slice(0, 3).join("; ")}.`
    : "";
  const summary = [
    `${first.appName}'s ${first.flowName ?? "selected flow"} is represented by ${ordered.length} ordered screens.`,
    progression,
    stageSentence,
    dominantStageSentence,
    patternSentence,
  ].filter(Boolean).join(" ").slice(0, 2_000);

  return {
    appName: first.appName,
    flowName: first.flowName ?? "Unknown flow",
    screenshotIds: ordered.map((item) => item.screenshotId),
    summary,
    journeyStages: stages,
    patterns: groundedPatterns.length > 0
      ? groundedPatterns
      : uniqueGroundedStrings(ordered.map((item) => item.userGoal), 8),
    frictionSignals,
    trustSignals,
    openQuestions: [],
    relevance: Math.max(...ordered.map((item) => item.relevance), 0.5),
  };
}

function buildDeterministicAppSynthesis(
  appName: string,
  flows: CompositionFlowSynthesis[],
): CompositionAppSynthesis {
  const cleanedFlowSummaries = uniqueGroundedStrings(
    flows.map((flow) => cleanSynthesisNarrative(flow.summary, 800)),
    4,
  );
  const stageLabels = uniqueGroundedStrings(flows.flatMap((flow) => flow.journeyStages), 10);
  const summaryParts = [
    `${appName} is represented by ${flows.length} grounded ${flows.length === 1 ? "flow" : "flows"} and ${new Set(flows.flatMap((flow) => flow.screenshotIds)).size} ordered screenshots.`,
    cleanedFlowSummaries[0],
    stageLabels.length > 0 ? `Observed journey stages include ${stageLabels.join(", ")}.` : "",
  ].filter(Boolean);
  return {
    appName,
    summary: summaryParts.join(" ").slice(0, 2_400),
    flowNames: Array.from(new Set(flows.map((flow) => flow.flowName))),
    screenshotIds: Array.from(new Set(flows.flatMap((flow) => flow.screenshotIds))),
    patterns: uniqueGroundedStrings(flows.flatMap((flow) => flow.patterns), 18),
    strengths: uniqueGroundedStrings(flows.flatMap((flow) => flow.trustSignals), 12),
    risks: uniqueGroundedStrings(flows.flatMap((flow) => flow.frictionSignals), 12),
    openQuestions: uniqueGroundedStrings(flows.flatMap((flow) => flow.openQuestions), 12),
  };
}

async function refreshResearchSyntheses({
  apiKey,
  objective,
  ledger,
  signal,
}: {
  apiKey: string;
  objective: string;
  ledger: CompositionResearchLedger;
  signal: AbortSignal;
}) {
  const flowGroups = new Map<string, CompositionEvidenceObservation[]>();
  for (const observation of ledger.observations) {
    if (!observation.flowName) continue;
    const key = `${observation.appName}::${observation.flowName}`;
    const group = flowGroups.get(key) ?? [];
    group.push(observation);
    flowGroups.set(key, group);
  }

  const flowSyntheses: CompositionFlowSynthesis[] = [];
  for (const observations of flowGroups.values()) {
    try {
      flowSyntheses.push(await synthesizeFlowResearch({ apiKey, objective, observations, signal }));
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (error instanceof GeminiCallError) throw error;
      flowSyntheses.push(buildDeterministicFlowSynthesis(observations));
    }
  }
  ledger.flowSyntheses = flowSyntheses;

  const appGroups = new Map<string, CompositionFlowSynthesis[]>();
  for (const flow of flowSyntheses) {
    const group = appGroups.get(flow.appName) ?? [];
    group.push(flow);
    appGroups.set(flow.appName, group);
  }
  const appSyntheses: CompositionAppSynthesis[] = [];
  for (const [appName, flows] of appGroups.entries()) {
    try {
      appSyntheses.push(await synthesizeAppResearch({ apiKey, objective, appName, flows, signal }));
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (error instanceof GeminiCallError) throw error;
      appSyntheses.push(buildDeterministicAppSynthesis(appName, flows));
    }
  }
  ledger.appSyntheses = appSyntheses;
}



function deterministicResearchCoverage(
  requestedApps: string[],
  ledger: CompositionResearchLedger,
): {
  sufficient: boolean;
  coveredApps: string[];
  missingApps: string[];
  coveredFlowCount: number;
  groundedScreenCount: number;
} {
  const requiredApps = Array.from(
    new Map(
      requestedApps
        .filter((app) => app.trim())
        .map((app) => [normalizeLookup(app), app.trim()]),
    ).values(),
  );
  const flowApps = new Set(
    ledger.flowSyntheses
      .filter((flow) => flow.screenshotIds.length > 0)
      .map((flow) => normalizeLookup(flow.appName)),
  );
  const synthesisApps = new Set(
    ledger.appSyntheses
      .filter((app) => app.screenshotIds.length > 0)
      .map((app) => normalizeLookup(app.appName)),
  );
  const coveredApps = requiredApps.filter((app) => {
    const key = normalizeLookup(app);
    return flowApps.has(key) && synthesisApps.has(key);
  });
  const missingApps = requiredApps.filter(
    (app) => !coveredApps.some((covered) => normalizeLookup(covered) === normalizeLookup(app)),
  );
  return {
    sufficient:
      requiredApps.length > 0 &&
      missingApps.length === 0 &&
      ledger.observations.length > 0 &&
      ledger.flowSyntheses.length >= requiredApps.length,
    coveredApps,
    missingApps,
    coveredFlowCount: ledger.flowSyntheses.length,
    groundedScreenCount: ledger.observations.length,
  };
}

function reconcileResearchReviewWithGroundedCoverage(
  review: ResearchReviewResponse,
  requestedApps: string[],
  ledger: CompositionResearchLedger,
): ResearchReviewResponse {
  const coverage = deterministicResearchCoverage(requestedApps, ledger);
  if (!coverage.sufficient) return review;
  const subject = coverage.coveredApps.join(" and ") || "the requested apps";
  return {
    ...review,
    enoughEvidence: true,
    coverageSummary:
      review.enoughEvidence && review.coverageSummary.trim()
        ? review.coverageSummary
        : `Research coverage is sufficient: ${coverage.groundedScreenCount} grounded screens across ${coverage.coveredFlowCount} authoritative flows cover ${subject}.`,
    additionalQueries: [],
  };
}

async function reviewCompositionResearch({
  apiKey,
  objective,
  depth,
  requestedApps,
  ledger,
  signal,
}: {
  apiKey: string;
  objective: string;
  depth: ExecutionDepth;
  requestedApps: string[];
  ledger: CompositionResearchLedger;
  signal: AbortSignal;
}): Promise<ResearchReviewResponse> {
  const compactPayload = {
    objective,
    executionDepth: depth,
    requestedApps,
    inspectedScreenshotCount: ledger.inspectedScreenshotIds.length,
    appSyntheses: ledger.appSyntheses,
    flowSyntheses: [...ledger.flowSyntheses]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 36),
    priorHypotheses: ledger.hypotheses.slice(0, 12),
    priorQuestions: ledger.openQuestions.slice(0, 12),
    priorCorrections: ledger.corrections.slice(0, 12),
    priorDecisions: ledger.decisions.slice(0, 12),
  };

  const sanitizeReview = (raw: ResearchReviewResponse): ResearchReviewResponse => ({
    coverageSummary: getString(raw.coverageSummary)?.trim().slice(0, 3_000) || "Research coverage was reviewed.",
    enoughEvidence: raw.enoughEvidence === true,
    missingQuestions: sanitizeStringArray(raw.missingQuestions, 10, 500) ?? [],
    additionalQueries: Array.isArray(raw.additionalQueries)
      ? raw.additionalQueries.filter(isRecord).slice(0, 4).map((query) => ({
          appName: getString(query.appName)?.trim().slice(0, 180),
          query: getString(query.query)?.trim().slice(0, 500) || "",
          sessionType: query.sessionType === "onboarding" || query.sessionType === "browsing" ? query.sessionType : undefined,
          platform: query.platform === "mobile" || query.platform === "web" ? query.platform : undefined,
          limit: typeof query.limit === "number" && Number.isFinite(query.limit) ? Math.max(1, Math.min(80, Math.round(query.limit))) : undefined,
        })).filter((query) => query.query)
      : [],
    hypotheses: Array.isArray(raw.hypotheses)
      ? raw.hypotheses.filter(isRecord).slice(0, 12).map((hypothesis, index) => ({
          id: getString(hypothesis.id)?.trim().slice(0, 180) || `hypothesis-${index + 1}`,
          statement: getString(hypothesis.statement)?.trim().slice(0, 1_000) || "Working hypothesis",
          status: hypothesis.status === "supported" || hypothesis.status === "challenged" || hypothesis.status === "rejected" ? hypothesis.status : "active",
          supportingEvidenceIds: Array.isArray(hypothesis.supportingEvidenceIds) ? hypothesis.supportingEvidenceIds.filter((item): item is string => typeof item === "string").slice(0, 16) : [],
          contradictingEvidenceIds: Array.isArray(hypothesis.contradictingEvidenceIds) ? hypothesis.contradictingEvidenceIds.filter((item): item is string => typeof item === "string").slice(0, 16) : [],
        }))
      : [],
    decisions: sanitizeStringArray(raw.decisions, 12, 700) ?? [],
    corrections: sanitizeStringArray(raw.corrections, 12, 700) ?? [],
    workspacePlan: sanitizeWorkspacePlan(raw.workspacePlan) ?? ledger.workspacePlan,
  });

  try {
    const raw = await callGeminiJson<ResearchReviewResponse>({
      apiKey,
      systemInstruction: RESEARCH_REVIEW_SYSTEM_INSTRUCTION,
      contents: [{ role: "user", parts: [{ text: JSON.stringify(compactPayload) }] }],
      schema: RESEARCH_REVIEW_JSON_SCHEMA,
      signal,
      maxOutputTokens: 7_000,
    });
    return reconcileResearchReviewWithGroundedCoverage(sanitizeReview(raw), requestedApps, ledger);
  } catch (firstError) {
    if (signal.aborted || (firstError instanceof DOMException && firstError.name === "AbortError")) throw firstError;
    throwIfGeminiInfrastructureError(firstError);
    const reducedPayload = {
      objective,
      executionDepth: depth,
      requestedApps,
      inspectedScreenshotCount: ledger.inspectedScreenshotIds.length,
      appSyntheses: ledger.appSyntheses.map((app) => ({
        appName: app.appName,
        summary: app.summary,
        flowNames: app.flowNames,
        patterns: app.patterns.slice(0, 10),
        strengths: app.strengths.slice(0, 8),
        risks: app.risks.slice(0, 8),
        openQuestions: app.openQuestions.slice(0, 8),
        screenshotIds: app.screenshotIds.slice(0, 40),
      })),
      priorHypotheses: ledger.hypotheses.slice(0, 8),
      priorQuestions: ledger.openQuestions.slice(0, 8),
    };
    try {
      const raw = await callGeminiJson<ResearchReviewResponse>({
        apiKey,
        systemInstruction: `${RESEARCH_REVIEW_SYSTEM_INSTRUCTION}\n\nWork from the compact app-level synthesis. Keep the review concise and schema-conforming.`,
        contents: [{ role: "user", parts: [{ text: JSON.stringify(reducedPayload) }] }],
        schema: RESEARCH_REVIEW_JSON_SCHEMA,
        signal,
        maxOutputTokens: 6_000,
      });
      return reconcileResearchReviewWithGroundedCoverage(sanitizeReview(raw), requestedApps, ledger);
    } catch (secondError) {
      if (signal.aborted || (secondError instanceof DOMException && secondError.name === "AbortError")) throw secondError;
      throw secondError;
    }
  }
}

async function runRecursiveCompositionResearch({
  apiKey,
  intent,
  message,
  initialToolResults,
  getDataCatalog,
  signal,
  callbacks,
  resumeCheckpoint,
}: {
  apiKey: string;
  intent: SemanticIntentDecision;
  message: string;
  initialToolResults: ToolResult[];
  getDataCatalog: () => Promise<NorthStarDataCatalog>;
  signal: AbortSignal;
  callbacks: CompositionResearchCallbacks;
  resumeCheckpoint?: CompositionRunCheckpoint | null;
}): Promise<{
  ledger: CompositionResearchLedger;
  toolResults: ToolResult[];
}> {
  const depth = intent.canvas?.executionDepth ?? resumeCheckpoint?.executionDepth ?? "balanced";
  const settings = compositionResearchSettings(depth);
  const toolResults = [...initialToolResults];
  const checkpointScreens = resumeCheckpoint?.candidateScreens ?? [];
  if (checkpointScreens.length > 0) {
    toolResults.push({
      stepId: "resumed-composition-evidence",
      tool: "prepare_composition_evidence",
      label: "Resume the grounded research set",
      detail: `Resumed ${checkpointScreens.length} grounded screenshot references from the active research session.`,
      objectIds: [],
      data: {
        candidateScreens: checkpointScreens,
        requestedApps: resumeCheckpoint?.requestedApps ?? [],
        selectedFlowIdentity: resumeCheckpoint?.selectedFlows ?? [],
        requestedSessionType: resumeCheckpoint?.sessionType,
        requestedPlatform: resumeCheckpoint?.platform,
      },
      ok: true,
    });
  }
  const groundedContext = collectGroundedCompositionContext(toolResults);
  const scopeCatalog = await getDataCatalog();
  const appNamesFromObjective = requestedAppNamesFromText(scopeCatalog, [intent.objective, message]);
  const requestedApps = resumeCheckpoint?.requestedApps?.length
    ? resumeCheckpoint.requestedApps
    : Array.from(new Set([
        ...(intent.data?.appName ? [intent.data.appName] : []),
        ...appNamesFromObjective,
        ...groundedContext.requestedApps,
      ]));
  const requestedSessionType = resumeCheckpoint?.sessionType ?? intent.data?.sessionType;
  const requestedPlatform = resumeCheckpoint?.platform ?? intent.data?.platform;
  const ledger: CompositionResearchLedger = resumeCheckpoint?.ledger
    ? {
        ...resumeCheckpoint.ledger,
        objective: resumeCheckpoint.objective || intent.objective || message,
        inspectedScreenshotIds: [...resumeCheckpoint.ledger.inspectedScreenshotIds],
        batches: [...resumeCheckpoint.ledger.batches],
        observations: [...resumeCheckpoint.ledger.observations],
        flowSyntheses: [...resumeCheckpoint.ledger.flowSyntheses],
        appSyntheses: [...resumeCheckpoint.ledger.appSyntheses],
        hypotheses: [...resumeCheckpoint.ledger.hypotheses],
        openQuestions: [...resumeCheckpoint.ledger.openQuestions],
        decisions: [...resumeCheckpoint.ledger.decisions],
        corrections: [...resumeCheckpoint.ledger.corrections],
      }
    : {
        objective: intent.objective || message,
        inspectedScreenshotIds: [],
        batches: [],
        observations: [],
        flowSyntheses: [],
        appSyntheses: [],
        hypotheses: [],
        openQuestions: [],
        decisions: [],
        corrections: [],
        researchRounds: 0,
        coverageSummary: "",
      };
  const screened = new Set<string>(ledger.inspectedScreenshotIds);
  const failedStudyAttempts = new Map<string, number>();

  const reconcileReferenceFlowGrounding = () => {
    const scopedScreens = compositionScreensFromToolResults(toolResults)
      .filter((screen) => compositionEvidenceMatchesScope(screen, {
        appNames: requestedApps,
        sessionType: requestedSessionType,
        platform: requestedPlatform,
      }));
    const selectedFlows = compositionFlowIdentitiesFromToolResults(toolResults, scopedScreens);
    const result = ensureReferenceFlowGrounding({
      ledger,
      screens: scopedScreens,
      selectedFlows,
    });
    ledger.inspectedScreenshotIds.forEach((id) => screened.add(id));
    return result;
  };

  const studyAvailableScreens = async (round: number) => {
    const candidates = compositionScreensFromToolResults(toolResults)
      .filter((screen) => compositionEvidenceMatchesScope(screen, {
        appNames: requestedApps,
        sessionType: requestedSessionType,
        platform: requestedPlatform,
      }))
      .filter((screen) => !screened.has(screen.id) && (failedStudyAttempts.get(screen.id) ?? 0) < 2 && Boolean(screen.imageUrl))
      .slice(0, Math.max(0, settings.maxScreens - screened.size));
    const batches: GroundedCompositionScreen[][] = [];
    const batchSize = Math.max(
      COMPOSITION_VISUAL_BATCH_MIN,
      Math.min(COMPOSITION_VISUAL_BATCH_MAX, settings.batchSize),
    );
    const groupedByApp = new Map<string, GroundedCompositionScreen[]>();
    candidates.forEach((screen) => {
      const group = groupedByApp.get(screen.appName) ?? [];
      group.push(screen);
      groupedByApp.set(screen.appName, group);
    });
    for (const appScreens of groupedByApp.values()) {
      const ordered = [...appScreens].sort((a, b) => {
        const flowComparison = (a.flowName ?? "").localeCompare(b.flowName ?? "");
        if (flowComparison !== 0) return flowComparison;
        return (a.index ?? 0) - (b.index ?? 0);
      });
      for (let index = 0; index < ordered.length; index += batchSize) {
        batches.push(ordered.slice(index, index + batchSize));
      }
    }
    if (batches.length === 0) return;

    const describeBatch = (batch: GroundedCompositionScreen[], batchIndex: number) => {
      const apps = Array.from(new Set(batch.map((screen) => screen.appName)));
      const flows = Array.from(new Set(batch.map((screen) => screen.flowName).filter((value): value is string => Boolean(value))));
      const subject = apps.length === 1
        ? flows.length === 1
          ? `${apps[0]} · ${flows[0]}`
          : `${apps[0]} evidence`
        : "cross-app evidence";
      return `Study ${subject} — batch ${batchIndex + 1} of ${batches.length}`;
    };

    await callbacks.extendPlan(
      batches.map((batch, batchIndex) => ({
        id: `study-evidence-r${round + 1}-b${batchIndex + 1}`,
        label: describeBatch(batch, batchIndex),
        tool: "prepare_composition_evidence",
        icon: "screenshot",
      })),
      `North Star will visually inspect ${candidates.length} relevant screenshots in ${batches.length} grounded research ${batches.length === 1 ? "batch" : "batches"}.`,
    );

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const stepId = `study-evidence-r${round + 1}-b${batchIndex + 1}`;
      const batchLabel = describeBatch(batch, batchIndex);
      await callbacks.startStep({
        id: stepId,
        label: batchLabel,
        tool: "prepare_composition_evidence",
      });
      try {
        const result = await studyScreenshotBatch({
          apiKey,
          objective: intent.objective || message,
          batch,
          signal,
        });
        const observationIds = result.observations.map((item) => item.screenshotId);
        observationIds.forEach((id) => screened.add(id));
        result.unresolvedScreenshotIds.forEach((id) => {
          failedStudyAttempts.set(id, (failedStudyAttempts.get(id) ?? 0) + 1);
        });
        ledger.inspectedScreenshotIds.push(
          ...observationIds.filter((id) => !ledger.inspectedScreenshotIds.includes(id)),
        );
        ledger.observations.push(
          ...result.observations.filter(
            (observation) =>
              !ledger.observations.some((item) => item.screenshotId === observation.screenshotId),
          ),
        );
        if (observationIds.length > 0) {
          ledger.batches.push({
            batchIndex: ledger.batches.length + 1,
            screenshotIds: observationIds,
            summary: result.batchSummary,
          });
        }
        const observedIdSet = new Set(observationIds);
        const observedScreens = batch.filter((screen) => observedIdSet.has(screen.id));
        const resultView: NorthStarToolResultView = {
          kind: "screenshots",
          title: batchLabel.replace(/^Study /, "Studied "),
          items: observedScreens.map((screen) => ({
            id: screen.id,
            kind: "screenshot" as const,
            title: screen.title ?? "Untitled screen",
            subtitle: `${screen.appName}${screen.flowName ? ` · ${screen.flowName}` : ""}`,
            imageUrl: screen.imageUrl,
            appName: screen.appName,
            flowName: screen.flowName,
            platform: screen.platform,
            sessionType: screen.sessionType,
            screenshotIndex: screen.index,
          })),
        };
        await callbacks.completeStep({
          id: stepId,
          tool: "prepare_composition_evidence",
          detail: `Completed ${result.observations.length} grounded screen records. ${result.batchSummary}`,
          resultView: observedScreens.length > 0 ? resultView : undefined,
        });
        toolResults.push({
          stepId,
          tool: "prepare_composition_evidence",
          label: batchLabel,
          detail: result.batchSummary,
          objectIds: [],
          data: {
            researchBatch: {
              observations: result.observations,
              screenshotIds: observationIds,
            },
          },
          resultView: observedScreens.length > 0 ? resultView : undefined,
          ok: result.observations.length > 0,
        });
        await callbacks.checkpoint?.("research", ledger, toolResults);
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        await callbacks.completeStep({
          id: stepId,
          tool: "prepare_composition_evidence",
          detail: "North Star retained the verified evidence already gathered and continued the research pass.",
        });
      }
    }
  };

  await studyAvailableScreens(0);
  reconcileReferenceFlowGrounding();

  for (let round = 0; round <= settings.researchRounds; round += 1) {
    const synthesisStepId = `synthesize-research-r${round + 1}`;
    await callbacks.extendPlan([{
      id: synthesisStepId,
      label: "Synthesize the studied flows and app-level patterns",
      tool: "prepare_composition_evidence",
      icon: "analyze",
    }]);
    await callbacks.startStep({
      id: synthesisStepId,
      label: "Synthesize the studied flows and app-level patterns",
      tool: "prepare_composition_evidence",
    });
    reconcileReferenceFlowGrounding();
    await refreshResearchSyntheses({
      apiKey,
      objective: intent.objective || message,
      ledger,
      signal,
    });
    await callbacks.completeStep({
      id: synthesisStepId,
      tool: "prepare_composition_evidence",
      detail: `Synthesized ${ledger.flowSyntheses.length} grounded flows into ${ledger.appSyntheses.length} app-level research views.`,
    });
    await callbacks.checkpoint?.("review", ledger, toolResults);

    const reviewStepId = `review-research-coverage-${round + 1}`;
    await callbacks.extendPlan([
      {
        id: reviewStepId,
        label:
          round === 0
            ? "Review research coverage and test the working hypotheses"
            : `Re-evaluate the evidence after research round ${round}`,
        tool: "prepare_composition_evidence",
        icon: "analyze",
      },
    ]);
    await callbacks.startStep({
      id: reviewStepId,
      label: "Review research coverage",
      tool: "prepare_composition_evidence",
    });

    const review = await reviewCompositionResearch({
      apiKey,
      objective: intent.objective || message,
      depth,
      requestedApps,
      ledger,
      signal,
    });
    ledger.coverageSummary = review.coverageSummary;
    ledger.openQuestions = review.missingQuestions;
    ledger.hypotheses = review.hypotheses;
    ledger.decisions = Array.from(new Set([...ledger.decisions, ...review.decisions]));
    ledger.corrections = Array.from(new Set([...ledger.corrections, ...review.corrections]));
    ledger.workspacePlan = review.workspacePlan;
    ledger.researchRounds = round;

    await callbacks.completeStep({
      id: reviewStepId,
      tool: "prepare_composition_evidence",
      detail: review.enoughEvidence
        ? `Research coverage is sufficient. ${review.coverageSummary}`
        : `Research still has gaps. ${review.coverageSummary}`,
    });
    await callbacks.checkpoint?.("review", ledger, toolResults);

    if (review.enoughEvidence || round >= settings.researchRounds) break;
    const queries = review.additionalQueries.slice(0, depth === "deep" ? 4 : 2);
    if (queries.length === 0) break;

    const querySteps = queries.map((query, index) => ({
      id: `additional-research-r${round + 1}-q${index + 1}`,
      label: query.appName
        ? `Research ${query.appName}: ${query.query}`
        : `Research the missing evidence: ${query.query}`,
      tool: "prepare_composition_evidence",
      icon: "search" as CanvasAIActivityIcon,
    }));
    await callbacks.extendPlan(querySteps);

    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index];
      const step = querySteps[index];
      await callbacks.startStep({ id: step.id, label: step.label, tool: step.tool });
      try {
        const result = await executeNorthStarDataTool({
          tool: "prepare_composition_evidence",
          args: {
            query: query.query,
            appName: query.appName,
            appNames: query.appName ? [query.appName] : requestedApps,
            sessionType: requestedSessionType ?? query.sessionType,
            platform: requestedPlatform ?? query.platform,
            limit: Math.min(
              settings.maxScreens,
              Math.max(8, query.limit ?? (depth === "deep" ? 24 : 12)),
            ),
          },
          getCatalog: getDataCatalog,
        });
        const toolResult: ToolResult = {
          stepId: step.id,
          tool: "prepare_composition_evidence",
          label: step.label,
          detail: result.detail,
          objectIds: [],
          data: result.data,
          resultView: result.resultView,
          ok: result.ok,
        };
        toolResults.push(toolResult);
        await callbacks.completeStep({
          id: step.id,
          tool: step.tool,
          detail: result.detail,
          resultView: result.resultView,
        });
      } catch (error) {
        await callbacks.failStep({
          id: step.id,
          tool: step.tool,
          detail:
            error instanceof Error
              ? error.message
              : "North Star could not complete this additional research pass.",
        });
      }
    }

    await studyAvailableScreens(round + 1);
  }

  toolResults.push({
    stepId: "composition-research-ledger",
    tool: "prepare_composition_evidence",
    label: "Build the inspectable research ledger",
    detail: `Studied ${ledger.inspectedScreenshotIds.length} screenshots across ${ledger.batches.length} visual batches and ${ledger.researchRounds + 1} research passes.`,
    objectIds: [],
    data: { researchLedger: ledger },
    ok: ledger.observations.length > 0,
  });

  return { ledger, toolResults };
}

async function critiqueCompositionBlueprint({
  apiKey,
  intent,
  blueprint,
  ledger,
  signal,
}: {
  apiKey: string;
  intent: SemanticIntentDecision;
  blueprint: CompositionBlueprint;
  ledger: CompositionResearchLedger;
  signal: AbortSignal;
}): Promise<BlueprintCritiqueResponse> {
  return callGeminiJson<BlueprintCritiqueResponse>({
    apiKey,
    systemInstruction: BLUEPRINT_CRITIQUE_SYSTEM_INSTRUCTION,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              objective: intent.objective,
              executionDepth: blueprint.executionDepth,
              audience: blueprint.audience,
              researchLedger: ledger,
              proposedBlueprint: blueprint,
            }),
          },
        ],
      },
    ],
    schema: BLUEPRINT_CRITIQUE_JSON_SCHEMA,
    signal,
    maxOutputTokens: 9_000,
  });
}


function enrichBlueprintWithResearchLedger(
  blueprint: CompositionBlueprint,
  ledger: CompositionResearchLedger,
): CompositionBlueprint {
  const proofNotes: CompositionWorkingNote[] = [
    {
      label: "Objective",
      text: ledger.objective,
      kind: "objective",
      evidenceIds: [],
    },
    {
      label: "Research coverage",
      text:
        ledger.coverageSummary ||
        `Inspected ${ledger.inspectedScreenshotIds.length} screenshots across ${ledger.batches.length} visual batches.`,
      kind: "check",
      evidenceIds: ledger.inspectedScreenshotIds.slice(0, 12),
    },
    ...ledger.hypotheses.slice(0, 8).map((hypothesis) => ({
      label:
        hypothesis.status === "rejected"
          ? "Rejected hypothesis"
          : hypothesis.status === "challenged"
            ? "Challenged hypothesis"
            : hypothesis.status === "supported"
              ? "Supported hypothesis"
              : "Working hypothesis",
      text: hypothesis.statement,
      kind:
        hypothesis.status === "rejected"
          ? ("rejected" as const)
          : hypothesis.status === "challenged"
            ? ("correction" as const)
            : ("hypothesis" as const),
      evidenceIds: Array.from(
        new Set([
          ...hypothesis.supportingEvidenceIds,
          ...hypothesis.contradictingEvidenceIds,
        ]),
      ).slice(0, 12),
    })),
    ...ledger.corrections.slice(0, 6).map((text) => ({
      label: "Course correction",
      text,
      kind: "correction" as const,
      evidenceIds: [],
    })),
    ...ledger.openQuestions.slice(0, 6).map((text) => ({
      label: "Open question",
      text,
      kind: "question" as const,
      evidenceIds: [],
    })),
    ...ledger.decisions.slice(0, 6).map((text) => ({
      label: "Decision",
      text,
      kind: "decision" as const,
      evidenceIds: [],
    })),
  ];

  const seen = new Set<string>();
  const notes = [...proofNotes, ...blueprint.workingNotes].filter((note) => {
    const key = `${note.kind}:${note.label}:${note.text}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const maxNotes =
    blueprint.executionDepth === "quick"
      ? 10
      : blueprint.executionDepth === "deep"
        ? 24
        : 18;
  const preferredEvidenceIds = ledger.observations
    .slice()
    .sort((a, b) => b.relevance - a.relevance)
    .map((observation) => observation.screenshotId);
  const workingEvidenceIds = Array.from(
    new Set([
      ...blueprint.workingEvidenceIds,
      ...preferredEvidenceIds,
      ...ledger.inspectedScreenshotIds,
    ]),
  ).slice(
    0,
    blueprint.executionDepth === "quick"
      ? 6
      : blueprint.executionDepth === "deep"
        ? 18
        : 12,
  );

  return {
    ...blueprint,
    researchDigest:
      blueprint.researchDigest ||
      `North Star visually inspected ${ledger.inspectedScreenshotIds.length} screenshots in ${ledger.batches.length} batches across ${ledger.researchRounds + 1} research passes.`,
    workingNotes: notes.slice(0, maxNotes),
    workingEvidenceIds,
  };
}



function compactCompositionResearchContext(
  ledger: CompositionResearchLedger,
  mode: "standard" | "minimal" = "standard",
) {
  const observationLimit = mode === "minimal" ? 12 : 28;
  const flowLimit = mode === "minimal" ? 4 : 8;
  const appLimit = mode === "minimal" ? 4 : 8;
  return {
    objective: ledger.objective,
    coverageSummary: ledger.coverageSummary,
    researchRounds: ledger.researchRounds,
    observations: ledger.observations
      .slice()
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, observationLimit)
      .map((observation) => ({
        screenshotId: observation.screenshotId,
        appName: observation.appName,
        flowName: observation.flowName,
        screenName: observation.screenName,
        journeyStage: observation.journeyStage,
        userGoal: observation.userGoal,
        visibleCopy: observation.visibleCopy.slice(0, mode === "minimal" ? 2 : 5),
        notablePatterns: observation.notablePatterns.slice(0, mode === "minimal" ? 2 : 5),
        frictionSignals: observation.frictionSignals.slice(0, mode === "minimal" ? 2 : 4),
        trustSignals: observation.trustSignals.slice(0, mode === "minimal" ? 2 : 4),
        opportunities: observation.opportunities.slice(0, mode === "minimal" ? 2 : 4),
        relevance: observation.relevance,
      })),
    flowSyntheses: ledger.flowSyntheses.slice(0, flowLimit).map((flow) => ({
      appName: flow.appName,
      flowName: flow.flowName,
      sessionType: flow.sessionType,
      platform: flow.platform,
      screenshotIds: flow.screenshotIds.slice(0, 24),
      summary: flow.summary,
      journeyStages: flow.journeyStages.slice(0, 10),
      patterns: flow.patterns.slice(0, 8),
      frictionSignals: flow.frictionSignals.slice(0, 6),
      trustSignals: flow.trustSignals.slice(0, 6),
      openQuestions: flow.openQuestions.slice(0, 4),
      relevance: flow.relevance,
    })),
    appSyntheses: ledger.appSyntheses.slice(0, appLimit).map((app) => ({
      appName: app.appName,
      summary: app.summary,
      flowNames: app.flowNames.slice(0, 8),
      screenshotIds: app.screenshotIds.slice(0, 24),
      patterns: app.patterns.slice(0, 8),
      onboardingModel: app.onboardingModel,
      activationModel: app.activationModel,
      strengths: app.strengths.slice(0, 6),
      risks: app.risks.slice(0, 6),
      openQuestions: app.openQuestions.slice(0, 4),
    })),
    hypotheses: ledger.hypotheses.slice(0, mode === "minimal" ? 4 : 8).map((hypothesis) => ({
      id: hypothesis.id,
      statement: hypothesis.statement,
      status: hypothesis.status,
      supportingEvidenceIds: hypothesis.supportingEvidenceIds.slice(0, 8),
      contradictingEvidenceIds: hypothesis.contradictingEvidenceIds.slice(0, 8),
    })),
    decisions: ledger.decisions.slice(0, mode === "minimal" ? 4 : 8),
    corrections: ledger.corrections.slice(0, mode === "minimal" ? 4 : 8),
    openQuestions: ledger.openQuestions.slice(0, mode === "minimal" ? 4 : 8),
    workspacePlan: mode === "minimal" || !ledger.workspacePlan
      ? undefined
      : {
          strategy: ledger.workspacePlan.strategy,
          canvasWidth: ledger.workspacePlan.canvasWidth,
          canvasHeight: ledger.workspacePlan.canvasHeight,
          regions: ledger.workspacePlan.regions.slice(0, 12).map((region) => ({
            id: region.id,
            title: region.title,
            purpose: region.purpose,
            layout: region.layout,
            appName: region.appName,
            flowName: region.flowName,
            evidenceIds: region.evidenceIds.slice(0, 12),
            noteLabels: region.noteLabels.slice(0, 8),
            emphasis: region.emphasis,
          })),
        },
  };
}

function compactCompositionToolContext(
  toolResults: ToolResult[],
  mode: "standard" | "minimal" = "standard",
) {
  const resultLimit = mode === "minimal" ? 8 : 18;
  const itemLimit = mode === "minimal" ? 8 : 20;
  return toolResults
    .filter((result) => result.ok)
    .slice(-resultLimit)
    .map((result) => ({
      stepId: result.stepId,
      tool: result.tool,
      label: result.label,
      detail: result.detail.slice(0, mode === "minimal" ? 500 : 1_200),
      items: (result.resultView?.items ?? []).slice(0, itemLimit).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        appName: item.appName,
        flowName: item.flowName,
        platform: item.platform,
        sessionType: item.sessionType,
        screenshotIndex: item.screenshotIndex,
        thumbnailIds: (item.thumbnails ?? []).slice(0, 16).map((thumbnail) => thumbnail.id),
      })),
    }));
}

function buildDeterministicCompositionBlueprintFallback({
  intent,
  message,
  researchLedger,
  toolResults,
}: {
  intent: SemanticIntentDecision;
  message: string;
  researchLedger: CompositionResearchLedger;
  toolResults: ToolResult[];
}): CompositionBlueprint {
  const grounded = collectGroundedCompositionContext(toolResults);
  const availableScreenIds = new Set(grounded.screens.map((screen) => screen.id));
  const requestedApps = Array.from(
    new Set(
      [
        ...grounded.requestedApps,
        ...researchLedger.appSyntheses.map((app) => app.appName),
        ...researchLedger.flowSyntheses.map((flow) => flow.appName),
      ].filter((value): value is string => Boolean(value && value.trim())),
    ),
  );

  const groupedScreens = new Map<
    string,
    {
      appName: string;
      flowName: string;
      screenshotIds: string[];
      platform?: string;
      sessionType?: string;
    }
  >();

  for (const screen of grounded.screens) {
    const flowName = screen.flowName?.trim() || `${screen.appName} reference flow`;
    const key = `${normalizeLookup(screen.appName)}::${normalizeLookup(flowName)}`;
    const existing = groupedScreens.get(key) ?? {
      appName: screen.appName,
      flowName,
      screenshotIds: [],
      platform: screen.platform,
      sessionType: screen.sessionType,
    };
    if (!existing.screenshotIds.includes(screen.id)) existing.screenshotIds.push(screen.id);
    groupedScreens.set(key, existing);
  }

  const canonicalFlows = researchLedger.flowSyntheses
    .map((flow) => ({
      appName: flow.appName,
      flowName: flow.flowName,
      screenshotIds: flow.screenshotIds.filter((id) => availableScreenIds.has(id)),
      summary: flow.summary,
      platform: flow.platform,
      sessionType: flow.sessionType,
      relevance: flow.relevance,
    }))
    .filter((flow) => flow.screenshotIds.length > 0)
    .sort((a, b) => b.relevance - a.relevance);

  const flowsByApp = new Map<string, typeof canonicalFlows[number]>();
  for (const flow of canonicalFlows) {
    const appKey = normalizeLookup(flow.appName);
    if (!flowsByApp.has(appKey)) flowsByApp.set(appKey, flow);
  }

  for (const appName of requestedApps) {
    const appKey = normalizeLookup(appName);
    if (flowsByApp.has(appKey)) continue;
    const grouped = Array.from(groupedScreens.values()).find(
      (flow) => normalizeLookup(flow.appName) === appKey && flow.screenshotIds.length > 0,
    );
    if (!grouped) continue;
    flowsByApp.set(appKey, {
      appName: grouped.appName,
      flowName: grouped.flowName,
      screenshotIds: grouped.screenshotIds,
      summary: `${grouped.appName} evidence is shown in its original ordered sequence.`,
      platform: grouped.platform,
      sessionType: grouped.sessionType,
      relevance: 1,
    });
  }

  const selectedFlows = requestedApps
    .map((appName) => flowsByApp.get(normalizeLookup(appName)))
    .filter((flow): flow is NonNullable<typeof flow> => Boolean(flow));

  if (selectedFlows.length === 0) {
    throw new Error(
      "North Star could not construct a grounded composition fallback because no authoritative flow screens were available.",
    );
  }

  const flowSections: CompositionSection[] = selectedFlows.map((flow, index) => ({
    id: `reference-flow-${index + 1}`,
    title: `${flow.appName} — ${flow.flowName}`,
    body: flow.summary,
    kind: "reference-flow",
    appName: flow.appName,
    flowName: flow.flowName,
    evidenceIds: flow.screenshotIds.slice(0, 24),
    criteria: [
      flow.sessionType ? `Mode: ${flow.sessionType}` : "",
      flow.platform ? `Platform: ${flow.platform}` : "",
    ].filter(Boolean),
    emphasis: "primary",
  }));

  const appSummaries = requestedApps
    .map((appName) =>
      researchLedger.appSyntheses.find(
        (app) => normalizeLookup(app.appName) === normalizeLookup(appName),
      ),
    )
    .filter((app): app is CompositionAppSynthesis => Boolean(app));

  const comparisonLines = appSummaries
    .map((app) => ({
      appName: app.appName,
      summary: cleanSynthesisNarrative(app.summary, 420),
    }))
    .filter((app) => app.summary.length > 0);
  const comparisonBody = comparisonLines.length > 0
    ? comparisonLines.map((app) => `${app.appName}: ${app.summary}`).join("\n\n")
    : selectedFlows
        .map((flow) => `${flow.appName}: ${cleanSynthesisNarrative(flow.summary, 420) || `${flow.appName} is represented by ${flow.screenshotIds.length} ordered screens from ${flow.flowName}.`}`)
        .join("\n\n");

  const comparisonSection: CompositionSection = {
    id: "comparison-synthesis",
    title: "Comparison synthesis",
    body: comparisonBody,
    kind: "insight",
    evidenceIds: selectedFlows.flatMap((flow) => flow.screenshotIds.slice(0, 3)),
    criteria: researchLedger.decisions.slice(0, 4),
    emphasis: "primary",
  };

  const sections = [...flowSections, comparisonSection];
  const flowHeight = selectedFlows.length === 1 ? 48 : 27;
  const regions: CompositionLayoutRegion[] = flowSections.map((section, index) => ({
    sectionId: section.id,
    x: 4,
    y: 12 + index * (flowHeight + 3),
    w: 92,
    h: flowHeight,
    evidenceLayout: "filmstrip",
    columns: Math.min(12, Math.max(1, section.evidenceIds.length)),
    emphasis: "primary",
    styleVariant: "minimal",
  }));
  regions.push({
    sectionId: comparisonSection.id,
    x: 4,
    y: Math.min(78, 12 + selectedFlows.length * (flowHeight + 3)),
    w: 92,
    h: selectedFlows.length === 1 ? 25 : 18,
    evidenceLayout: "row",
    columns: Math.min(3, Math.max(1, comparisonSection.evidenceIds.length)),
    emphasis: "primary",
    styleVariant: "editorial",
  });

  const titleApps = requestedApps.length > 0
    ? requestedApps.join(" vs. ")
    : selectedFlows.map((flow) => flow.appName).join(" vs. ");
  const evidenceIds = Array.from(
    new Set(selectedFlows.flatMap((flow) => flow.screenshotIds)),
  );

  const blueprint: CompositionBlueprint = {
    artifactId: makeId("artifact"),
    artifactType: intent.canvas?.artifactType ?? "comparison-board",
    executionDepth: intent.canvas?.executionDepth ?? "balanced",
    workingVisibility: intent.canvas?.workingVisibility ?? "visible",
    audience: intent.canvas?.audience ?? "general",
    title: titleApps ? `${titleApps} onboarding comparison` : intent.objective || message,
    subtitle: "Grounded comparison of the selected onboarding journeys",
    summary: comparisonBody,
    visualStrategy:
      "Use a coherent evidence-to-decision story with representative ordered flows, concise synthesis, and an inspectable research trail inside the same artifact.",
    researchDigest:
      researchLedger.coverageSummary ||
      `North Star grounded ${researchLedger.observations.length} screen observations across ${selectedFlows.length} authoritative flows.`,
    workingNotes: [
      {
        label: "Objective",
        text: researchLedger.objective || intent.objective || message,
        kind: "objective",
        evidenceIds: evidenceIds.slice(0, 6),
      },
      ...researchLedger.hypotheses.slice(0, 4).map((hypothesis) => ({
        label: "Hypothesis",
        text: hypothesis.statement,
        kind: "hypothesis" as const,
        evidenceIds: hypothesis.supportingEvidenceIds.filter((id) => availableScreenIds.has(id)).slice(0, 6),
      })),
      ...researchLedger.decisions.slice(0, 4).map((decision) => ({
        label: "Decision",
        text: decision,
        kind: "decision" as const,
        evidenceIds: [],
      })),
    ],
    workingEvidenceIds: evidenceIds.slice(0, 18),
    workingSurfacePlan: researchLedger.workspacePlan,
    sections,
    layout: {
      direction: "vertical",
      columns: 1,
      gap: 32,
      evidenceScale: "balanced",
      canvasWidth: 2600,
      canvasHeight: selectedFlows.length > 1 ? 1700 : 1400,
      regions,
    },
  };

  return groundCompositionBlueprint(
    sanitizeCompositionBlueprint(blueprint, intent),
    toolResults,
  );
}

async function buildCompositionBlueprint({
  apiKey,
  intent,
  message,
  conversationSummary,
  toolResults,
  researchLedger,
  canvasContext,
  selectedCanvasContext,
  historyToolContext,
  signal,
  callbacks,
}: {
  apiKey: string;
  intent: SemanticIntentDecision;
  message: string;
  conversationSummary: string;
  toolResults: ToolResult[];
  researchLedger: CompositionResearchLedger;
  canvasContext: unknown;
  selectedCanvasContext: unknown;
  historyToolContext: HistoryToolContextEntry[];
  signal: AbortSignal;
  callbacks: CompositionResearchCallbacks;
}): Promise<CompositionBlueprint> {
  const createBlueprint = async (
    revisionContext?: {
      priorBlueprint: CompositionBlueprint;
      critique: string;
      requiredChanges: string[];
    },
    contextMode: "standard" | "minimal" = "standard",
  ) => {
    const raw = await callGeminiJson<CompositionBlueprint>({
      apiKey,
      systemInstruction: `${COMPOSITION_SYSTEM_INSTRUCTION}\n\n${buildNorthstarDesignBehaviorAddendum()}`,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                userRequest: message,
                objective: intent.objective,
                requestedComposition: intent.canvas,
                conversationSummary: conversationSummary || undefined,
                researchLedger: compactCompositionResearchContext(researchLedger, contextMode),
                completedToolResults: compactCompositionToolContext(toolResults, contextMode),
                recentToolContext: historyToolContext,
                priorBlueprint: revisionContext?.priorBlueprint,
                designCritique: revisionContext?.critique,
                requiredChanges: revisionContext?.requiredChanges,
                canvasSummary: isRecord(canvasContext) && isRecord(canvasContext.summary)
                  ? canvasContext.summary
                  : undefined,
                selectedCanvasContext:
                  isRecord(selectedCanvasContext) && Array.isArray(selectedCanvasContext.selectedObjects)
                    ? {
                        selectedIds: selectedCanvasContext.selectedIds,
                        selectedObjects: selectedCanvasContext.selectedObjects,
                        suggestedInterpretation: selectedCanvasContext.suggestedInterpretation,
                      }
                    : undefined,
              }),
            },
          ],
        },
      ],
      schema: COMPOSITION_BLUEPRINT_JSON_SCHEMA,
      signal,
      maxOutputTokens: 10_000,
    });
    return groundCompositionBlueprint(
      sanitizeCompositionBlueprint(raw, intent),
      toolResults,
    );
  };

  let blueprint: CompositionBlueprint;
  try {
    blueprint = await createBlueprint(undefined, "standard");
  } catch (firstError) {
    if (signal.aborted || (firstError instanceof DOMException && firstError.name === "AbortError")) throw firstError;
    throwIfGeminiInfrastructureError(firstError);
    console.warn(
      "North Star retried blueprint generation with a smaller grounded context:",
      firstError,
    );
    try {
      blueprint = await createBlueprint(undefined, "minimal");
    } catch (secondError) {
      if (signal.aborted || (secondError instanceof DOMException && secondError.name === "AbortError")) throw secondError;
      throw secondError;
    }
  }
  const settings = compositionResearchSettings(blueprint.executionDepth);

  for (let revision = 0; revision < settings.blueprintRevisions; revision += 1) {
    const stepId = `critique-blueprint-${revision + 1}`;
    await callbacks.extendPlan([
      {
        id: stepId,
        label:
          revision === 0
            ? "Challenge the proposed visual solution"
            : `Re-evaluate the revised visual solution ${revision + 1}`,
        tool: "prepare_composition_evidence",
        icon: "compare",
      },
    ]);
    await callbacks.startStep({
      id: stepId,
      label: "Challenge the proposed visual solution",
      tool: "prepare_composition_evidence",
    });
    try {
      const critique = await critiqueCompositionBlueprint({
        apiKey,
        intent,
        blueprint,
        ledger: researchLedger,
        signal,
      });
      await callbacks.completeStep({
        id: stepId,
        tool: "prepare_composition_evidence",
        detail: critique.accepted
          ? `The proposed visual strategy passed the evidence and clarity critique. ${critique.critique}`
          : `The proposed visual strategy needed revision. ${critique.critique}`,
      });
      if (critique.accepted) break;
      researchLedger.corrections.push(
        ...critique.requiredChanges.filter(
          (change) => !researchLedger.corrections.includes(change),
        ),
      );
      blueprint = groundCompositionBlueprint(
        sanitizeCompositionBlueprint(critique.revisedBlueprint, intent),
        toolResults,
      );
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (error instanceof GeminiCallError) {
        await callbacks.failStep({
          id: stepId,
          tool: "prepare_composition_evidence",
          detail: summarizeGeminiFailure(error),
        });
        throw error;
      }
      await callbacks.completeStep({
        id: stepId,
        tool: "prepare_composition_evidence",
        detail: "The current grounded visual direction remained the strongest available option for this pass.",
      });
      break;
    }
  }

  return enrichBlueprintWithResearchLedger(blueprint, researchLedger);
}

function buildCompositionActionSteps(
  blueprint: CompositionBlueprint,
  codeArtifactPackage: NorthstarGeneratedCodeArtifactPackage,
  requestedSessionType?: "onboarding" | "browsing",
  requestedAppNamesOverride: string[] = [],
): PlannerStep[] {
  const requestedAppNames = Array.from(new Set([
    ...requestedAppNamesOverride,
    ...blueprint.sections.map((section) => section.appName?.trim()),
  ].filter((value): value is string => Boolean(value))));
  const scopeText = [blueprint.title, blueprint.subtitle, blueprint.summary, blueprint.researchDigest].join(" ").toLowerCase();
  const inferredSessionType: "onboarding" | "browsing" | undefined =
    requestedSessionType ?? (scopeText.includes("onboarding") ? "onboarding" : scopeText.includes("browsing") ? "browsing" : undefined);
  const shared = {
    artifactId: blueprint.artifactId,
    appNames: requestedAppNames,
    sessionType: inferredSessionType,
    artifactType: blueprint.artifactType,
    executionDepth: blueprint.executionDepth,
    workingVisibility: "hidden" as WorkingVisibility,
    audience: blueprint.audience,
    title: codeArtifactPackage.title,
    subtitle: blueprint.subtitle,
    summary: blueprint.summary,
  } satisfies NorthStarToolArguments;

  const isVerified = codeArtifactPackage.publicationState === "verified" && !codeArtifactPackage.provisional;
  const finalStageIndex = isVerified
    ? Math.max(0, codeArtifactPackage.stages.length - 1)
    : Math.max(0, Math.min(codeArtifactPackage.stages.length - 1, codeArtifactPackage.stages.findIndex((stage) => stage.phase === "analysis")));
  const resultKey = isVerified ? "verified-live-web-artifact" : "working-live-web-artifact";
  const finalEnvelope = {
    schema: NORTHSTAR_CODE_ARTIFACT_ACTION_SCHEMA,
    artifactId: codeArtifactPackage.artifactId,
    command: "create-or-update",
    stageIndex: finalStageIndex,
    package: codeArtifactPackage,
  } as const;

  return [
    {
      id: isVerified ? "publish-verified-live-web-artifact" : "publish-working-live-web-artifact",
      label: isVerified ? "Mark the living artboard complete" : "Preserve the same living artboard",
      tool: "compose_visual_scene",
      icon: "write",
      arguments: {
        ...shared,
        compositionJson: JSON.stringify(finalEnvelope),
        resultKey,
        placement: "center",
        selectAfter: false,
      },
    },
    {
      id: isVerified ? "present-live-web-artifact" : "focus-working-live-web-artifact",
      label: isVerified ? "Keep the completed living artboard in view" : "Keep the evolving artboard in view",
      tool: "focus_objects",
      icon: isVerified ? "complete" : "analyze",
      arguments: {
        ...shared,
        resultKeys: [resultKey],
        selectAfter: true,
      },
    },
  ];
}

function collectToolVisualCandidates(toolResults: ToolResult[]) {
  const candidates: Array<{ id: string; url: string; label: string }> = [];
  const seen = new Set<string>();

  for (const result of toolResults) {
    const view = result.resultView;
    if (!view) continue;
    for (const item of view.items) {
      if (item.kind === "screenshot" && item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) {
        if (!seen.has(item.imageUrl)) {
          seen.add(item.imageUrl);
          candidates.push({ id: item.id, url: item.imageUrl, label: `${item.appName ?? "App"} — ${item.title}` });
        }
      }
      for (const thumbnail of item.thumbnails ?? []) {
        if (!thumbnail.imageUrl || !/^https?:\/\//i.test(thumbnail.imageUrl) || seen.has(thumbnail.imageUrl)) continue;
        seen.add(thumbnail.imageUrl);
        candidates.push({ id: thumbnail.id, url: thumbnail.imageUrl, label: `${item.appName ?? "App"} — ${item.title} — ${thumbnail.title}` });
      }
    }
  }

  return candidates;
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function consumeGeminiSse(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    const payload = JSON.parse(raw) as unknown;
    const text = extractGeminiText(payload);
    if (text) onText(text);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      processLine(line);
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (buffer.trim()) processLine(buffer.trim());
}

async function yieldToStream(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 18);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    setTimeout(() => signal.removeEventListener("abort", abort), 20);
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to use North Star AI." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
  }

  let body: CanvasAIRequestBody;
  try {
    body = (await request.json()) as CanvasAIRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const contextMode: ContextMode = body.contextMode === "selection" ? "selection" : "canvas";
  const thinkingDepth = parseThinkingDepth(body.thinkingDepth);
  const preferredExecutionDepth = executionDepthForThinking(thinkingDepth);
  const compositionCheckpoint = sanitizeCompositionCheckpoint(body.compositionCheckpoint);
  const conversationSummary =
    typeof body.conversationSummary === "string"
      ? body.conversationSummary.slice(0, MAX_CONVERSATION_SUMMARY_LENGTH)
      : "";

  if (!message) return NextResponse.json({ error: "A message is required." }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "That message is too long." }, { status: 400 });
  }
  if (!isRecord(body.canvasContext)) {
    return NextResponse.json({ error: "Canvas context is required." }, { status: 400 });
  }

  const activeContext =
    contextMode === "selection" && isRecord(body.selectedCanvasContext)
      ? body.selectedCanvasContext
      : body.canvasContext;

  const history = parseHistory(body.history);
  const historyToolContext = parseHistoryToolContext(body.historyToolContext);
  const validObjectIds = getObjectIdsFromContext(body.canvasContext);
  for (const id of getObjectIdsFromContext(body.selectedCanvasContext)) validObjectIds.add(id);

  const userVisuals = parseUserVisualParts(
    body.attachments,
    "Image attached to the current user message",
  );
  const parsedHistoryVisuals = parseUserVisualParts(
    body.historyAttachments,
    "Image attached earlier in this conversation",
  );
  const retainedHistoryVisualCount = Math.min(
    parsedHistoryVisuals.count,
    Math.max(0, MAX_VISUALS - userVisuals.count),
  );
  const historyVisuals = {
    count: retainedHistoryVisualCount,
    parts: parsedHistoryVisuals.parts.slice(0, retainedHistoryVisualCount * 2),
    names: parsedHistoryVisuals.names.slice(0, retainedHistoryVisualCount),
  };

  let dataCatalogPromise: Promise<NorthStarDataCatalog> | null = null;
  const getDataCatalog = (): Promise<NorthStarDataCatalog> => {
    if (!dataCatalogPromise) {
      dataCatalogPromise = resolveNorthStarTenantId(supabase, user.id).then((tenantId) =>
        loadNorthStarDataCatalog(supabase, tenantId),
      );
    }
    return dataCatalogPromise!;
  };

  const runId = makeId("run");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let verifiedProgress = Boolean(compositionCheckpoint);
      const send = (event: string, data: unknown) => {
        if (closed || request.signal.aborted) return;
        if (
          event === "run.checkpoint" ||
          event === "canvas.action.requested" ||
          (event === "tool.completed" && (!isRecord(data) || data.ok !== false))
        ) {
          verifiedProgress = true;
        }
        try {
          controller.enqueue(encodeSseEvent(event, data));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may already have cancelled the stream.
        }
      };

      void (async () => {
        try {
          send("run.started", { runId, model: GEMINI_MODEL, contextMode });

          const plannerContext = {
            userRequest: message,
            contextMode,
            conversationSummary: conversationSummary || undefined,
            recentConversation: history.slice(-10),
            recentToolContext: historyToolContext,
            canvasSummary:
              isRecord(body.canvasContext) && isRecord(body.canvasContext.summary)
                ? body.canvasContext.summary
                : undefined,
            selectionInterpretation:
              contextMode === "selection" && isRecord(activeContext)
                ? activeContext.suggestedInterpretation
                : undefined,
            selectedCount:
              contextMode === "selection" && isRecord(activeContext) && Array.isArray(activeContext.selectedIds)
                ? activeContext.selectedIds.length
                : 0,
            attachedImageCount: userVisuals.count,
            attachmentNames: userVisuals.names,
            recentConversationImageCount: historyVisuals.count,
            recentConversationImageNames: historyVisuals.names,
            thinkingDepth,
            activeCompositionCheckpoint: compositionCheckpoint && compositionCheckpoint.phase !== "completed"
              ? {
                  objective: compositionCheckpoint.objective,
                  phase: compositionCheckpoint.phase,
                  executionDepth: compositionCheckpoint.executionDepth,
                  requestedApps: compositionCheckpoint.requestedApps,
                  inspectedScreenshotCount: compositionCheckpoint.ledger.inspectedScreenshotIds.length,
                  researchBatchCount: compositionCheckpoint.ledger.batches.length,
                  lastUpdatedAt: compositionCheckpoint.updatedAt,
                }
              : undefined,
          };

          const deterministicIntent = inferDeterministicSemanticIntent({
            message,
            history,
            checkpoint: compositionCheckpoint,
            preferredExecutionDepth,
          });
          let semanticIntentSource: "deterministic" | "model" | "fallback" = deterministicIntent
            ? "deterministic"
            : "model";
          let semanticIntent: SemanticIntentDecision;

          if (deterministicIntent) {
            semanticIntent = sanitizeSemanticIntentDecision(deterministicIntent);
          } else {
            try {
              semanticIntent = sanitizeSemanticIntentDecision(
                await callGeminiJson<SemanticIntentDecision>({
                  apiKey,
                  systemInstruction: SEMANTIC_INTENT_SYSTEM_INSTRUCTION,
                  contents: [{ role: "user", parts: [{ text: JSON.stringify(plannerContext) }] }],
                  schema: SEMANTIC_INTENT_JSON_SCHEMA,
                  signal: request.signal,
                  maxOutputTokens: 900,
                }),
              );
            } catch (firstIntentError) {
              if (request.signal.aborted) throw firstIntentError;
              throwIfGeminiInfrastructureError(firstIntentError);
              const safeFallbackIntent = inferDeterministicSemanticIntent({
                message,
                history,
                checkpoint: compositionCheckpoint,
                preferredExecutionDepth,
              });
              if (safeFallbackIntent) {
                console.warn("North Star semantic intent model failed; using deterministic grounded intent.", firstIntentError);
                semanticIntent = sanitizeSemanticIntentDecision(safeFallbackIntent);
                semanticIntentSource = "fallback";
              } else {
                try {
                  semanticIntent = sanitizeSemanticIntentDecision(
                    await callGeminiJson<SemanticIntentDecision>({
                      apiKey,
                      systemInstruction: `${SEMANTIC_INTENT_SYSTEM_INSTRUCTION}

The previous classification attempt failed. Return a valid schema-conforming decision. Fail closed toward grounded execution whenever tenant data or a canvas outcome may be required.`,
                      contents: [{ role: "user", parts: [{ text: JSON.stringify(plannerContext) }] }],
                      schema: SEMANTIC_INTENT_JSON_SCHEMA,
                      signal: request.signal,
                      maxOutputTokens: 900,
                    }),
                  );
                } catch (secondIntentError) {
                  if (request.signal.aborted) throw secondIntentError;
                  throwIfGeminiInfrastructureError(secondIntentError);
                  console.error("North Star semantic intent classification failed after retry.", {
                    firstIntentError,
                    secondIntentError,
                    requestPreview: message.slice(0, 240),
                  });
                  throw new Error("North Star could not start the requested work. Nothing was changed.");
                }
              }
            }
          }

          if (compositionCheckpoint && semanticIntent.resumeActiveRun) {
            semanticIntent = {
              ...semanticIntent,
              kind: "canvas-action",
              target: "canvas",
              requiresTools: true,
              objective: compositionCheckpoint.objective,
              data: {
                entity: "screenshots",
                appName: compositionCheckpoint.requestedApps.length === 1 ? compositionCheckpoint.requestedApps[0] : undefined,
                flowName: compositionCheckpoint.selectedFlows.length === 1 ? compositionCheckpoint.selectedFlows[0].flowName : undefined,
                query: [
                  ...compositionCheckpoint.requestedApps,
                  ...compositionCheckpoint.selectedFlows.map((flow) => flow.flowName),
                  compositionCheckpoint.sessionType,
                  compositionCheckpoint.platform,
                ].filter((value): value is string => Boolean(value)).join(" "),
                platform: compositionCheckpoint.platform,
                sessionType: compositionCheckpoint.sessionType,
                limit: compositionCheckpoint.candidateScreens.length || undefined,
              },
              canvas: {
                ...(semanticIntent.canvas ?? { operation: "compose" }),
                operation: "compose",
                artifactType: compositionCheckpoint.artifactType,
                executionDepth: preferredExecutionDepth,
                workingVisibility: compositionCheckpoint.workingVisibility,
                audience: compositionCheckpoint.audience,
              },
            };
          } else if (semanticIntent.canvas?.operation === "compose") {
            semanticIntent = {
              ...semanticIntent,
              canvas: {
                ...semanticIntent.canvas,
                executionDepth: preferredExecutionDepth,
              },
            };
          }

          // Preserve an explicit tenant-data scope as a hard execution invariant.
          // The model remains responsible for analysis and visual strategy, while
          // the harness prevents an onboarding request from silently drifting into
          // browsing evidence (or vice versa).
          const explicitSessionType = inferSessionTypeFromConversation(
            message,
            history,
          );
          if (
            semanticIntent.canvas?.operation === "compose" &&
            explicitSessionType
          ) {
            semanticIntent = {
              ...semanticIntent,
              data: {
                ...(semanticIntent.data ?? { entity: "screenshots" }),
                entity: semanticIntent.data?.entity ?? "screenshots",
                sessionType: explicitSessionType,
              },
            };
          }

          if (!semanticIntent.requiresTools) {
            try {
              const verifiedIntent = sanitizeSemanticIntentDecision(
                await callGeminiJson<SemanticIntentDecision>({
                  apiKey,
                  systemInstruction: `${SEMANTIC_INTENT_SYSTEM_INSTRUCTION}

Act as an adversarial grounding verifier. The initial decision said no tools were required. Re-check the full meaning and conversation trajectory. If the requested outcome depends on real tenant apps/flows/screenshots/icons, canvas inspection, selection inspection, or a changed canvas, correct the decision and require tools. Do not preserve direct mode merely for conversational phrasing.`,
                  contents: [
                    {
                      role: "user",
                      parts: [{ text: JSON.stringify({ ...plannerContext, initialIntent: semanticIntent }) }],
                    },
                  ],
                  schema: SEMANTIC_INTENT_JSON_SCHEMA,
                  signal: request.signal,
                  maxOutputTokens: 900,
                }),
              );
              if (verifiedIntent.requiresTools) semanticIntent = verifiedIntent;
            } catch (error) {
              if (request.signal.aborted) throw error;
              throwIfGeminiInfrastructureError(error);
              // The primary semantic decision remains authoritative when the
              // adversarial verifier is unavailable. Planner and client grounding
              // gates still prevent unsupported action or tenant-data claims.
            }
          }

          const plannerContextWithIntent = {
            ...plannerContext,
            intentDecision: semanticIntent,
          };

          let planner: PlannerResponse;
          const deterministicPlanner = semanticIntentSource !== "model"
            ? buildPlannerFromSemanticIntent(semanticIntent)
            : null;

          if (deterministicPlanner) {
            planner = deterministicPlanner;
          } else {
            try {
              planner = sanitizePlanner(
                await callGeminiJson<PlannerResponse>({
                  apiKey,
                  systemInstruction: PLANNER_SYSTEM_INSTRUCTION,
                  contents: [{ role: "user", parts: [{ text: JSON.stringify(plannerContextWithIntent) }] }],
                  schema: PLANNER_JSON_SCHEMA,
                  signal: request.signal,
                  maxOutputTokens: 1_400,
                }),
                validObjectIds,
              );
            } catch (error) {
              if (request.signal.aborted) throw error;
              throwIfGeminiInfrastructureError(error);
              if (semanticIntent.requiresTools) {
                const semanticFallback = buildPlannerFromSemanticIntent(semanticIntent);
                if (!semanticFallback) {
                  throw new Error("North Star understood that this request needs tools, but could not prepare a safe execution plan. Nothing was changed.");
                }
                planner = semanticFallback;
              } else {
                planner = {
                  mode: "direct",
                  focus: semanticIntent.kind === "attachment" ? "attachment" : "conversation",
                  title: semanticIntent.kind === "attachment"
                    ? "Reviewing the attached image"
                    : "Continuing the conversation",
                  steps: [],
                };
              }
            }
          }

          if (semanticIntent.requiresTools && (planner.mode !== "agent" || planner.steps.length === 0)) {
            try {
              planner = sanitizePlanner(
                await callGeminiJson<PlannerResponse>({
                  apiKey,
                  systemInstruction: `${PLANNER_SYSTEM_INSTRUCTION}

${SEMANTIC_REPLAN_SYSTEM_INSTRUCTION}

The semantic intent gate requires grounded tool execution. You must return an agent plan that satisfies intentDecision.`,
                  contents: [
                    {
                      role: "user",
                      parts: [{ text: JSON.stringify({ ...plannerContextWithIntent, initialPlanner: planner }) }],
                    },
                  ],
                  schema: PLANNER_JSON_SCHEMA,
                  signal: request.signal,
                  maxOutputTokens: 1_400,
                }),
                validObjectIds,
              );
            } catch (error) {
              if (request.signal.aborted) throw error;
              throwIfGeminiInfrastructureError(error);
            }
          }

          planner = enforceSemanticIntentPlan(planner, semanticIntent);

          const plannerHasCanvasAction = planner.steps.some((step) =>
            isCanvasActionTool(step.tool),
          );
          const plannerHasDataTool = planner.steps.some((step) =>
            isNorthStarDataTool(step.tool),
          );

          if (plannerHasDataTool && plannerHasCanvasAction) {
            planner = { ...planner, mode: "agent", focus: "hybrid" };
          } else if (plannerHasDataTool && planner.focus === "conversation") {
            planner = { ...planner, mode: "agent", focus: "northstar-data" };
          } else if (plannerHasCanvasAction && planner.focus === "conversation") {
            planner = { ...planner, mode: "agent", focus: "canvas" };
          }

          planner = await repairNorthStarDataPlan({
            planner,
            message,
            history,
            historyToolContext,
            getDataCatalog,
          });

          planner = await repairCanvasAssetActionPlan({
            planner,
            message,
            history,
            historyToolContext,
            getDataCatalog,
          });
          planner = repairExistingCanvasActionPlan(
            planner,
            semanticIntent,
            body.canvasContext,
            body.selectedCanvasContext,
            validObjectIds,
          );
          planner = enforceSemanticIntentPlan(planner, semanticIntent);

          const compositionRequested = isCompositionIntent(semanticIntent);
          if (compositionRequested) {
            const compositionSettings = compositionResearchSettings(
              semanticIntent.canvas?.executionDepth ?? preferredExecutionDepth,
            );
            const compositionEvidenceLimit = compositionSettings.maxScreens;
            const resumingComposition = Boolean(
              compositionCheckpoint && semanticIntent.resumeActiveRun,
            );
            const compositionCatalog = await getDataCatalog();
            const strictCompositionAppNames = resumingComposition && compositionCheckpoint?.requestedApps.length
              ? compositionCheckpoint.requestedApps
              : Array.from(new Set([
                  ...(semanticIntent.data?.appName ? [semanticIntent.data.appName] : []),
                  ...requestedAppNamesFromText(compositionCatalog, [
                    message,
                    semanticIntent.objective,
                    ...history.slice(-8).map((entry) => entry.content),
                  ]),
                ]));
            const strictCompositionSessionType =
              compositionCheckpoint?.sessionType ?? semanticIntent.data?.sessionType ?? inferSessionTypeFromConversation(message, history);
            const strictCompositionPlatform =
              compositionCheckpoint?.platform ?? semanticIntent.data?.platform ?? inferPlatformFromMessage(message);
            const researchSteps = (resumingComposition
              ? planner.steps.filter((step) => step.tool === "inspect_canvas_overview")
              : planner.steps.filter((step) => !isCanvasActionTool(step.tool)))
              .map((step) =>
                step.tool === "prepare_composition_evidence"
                  ? {
                      ...step,
                      arguments: {
                        ...(step.arguments ?? {}),
                        appName: step.arguments?.appName ?? semanticIntent.data?.appName,
                        appNames: strictCompositionAppNames.length > 0
                          ? strictCompositionAppNames
                          : step.arguments?.appNames,
                        sessionType: strictCompositionSessionType,
                        platform: strictCompositionPlatform,
                        limit: Math.max(
                          compositionEvidenceLimit,
                          typeof step.arguments?.limit === "number"
                            ? step.arguments.limit
                            : 0,
                        ),
                      },
                    }
                  : step,
              );
            const selectedCompositionIds =
              isRecord(body.selectedCanvasContext) &&
              Array.isArray(body.selectedCanvasContext.selectedIds)
                ? body.selectedCanvasContext.selectedIds.filter(
                    (id): id is string => typeof id === "string",
                  )
                : [];
            const needsTenantCompositionEvidence =
              intentNeedsDataTool(semanticIntent) || selectedCompositionIds.length === 0;
            if (
              !resumingComposition &&
              needsTenantCompositionEvidence &&
              !researchSteps.some((step) => step.tool === "prepare_composition_evidence")
            ) {
              researchSteps.unshift({
                id: "curate-composition-evidence",
                label: "Curate representative evidence for the solution",
                tool: "prepare_composition_evidence",
                icon: "search",
                arguments: {
                  query: semanticIntent.objective,
                  appName: semanticIntent.data?.appName,
                  appNames: strictCompositionAppNames,
                  sessionType: strictCompositionSessionType,
                  platform: strictCompositionPlatform,
                  limit: compositionEvidenceLimit,
                },
              });
            }
            if (!researchSteps.some((step) => step.tool === "inspect_canvas_overview")) {
              researchSteps.push({
                id: "inspect-composition-space",
                label: "Inspect the available canvas space",
                tool: "inspect_canvas_overview",
                icon: "inspect",
              });
            }
            planner = {
              ...planner,
              mode: "agent",
              focus: "hybrid",
              title: semanticIntent.objective.slice(0, 180),
              steps: researchSteps.slice(0, MAX_AGENT_STEPS),
            };
          }

          const preparedSelectedArtifact = compositionRequested
            ? extractCodeArtifactContexts(body.selectedCanvasContext)[0]
            : undefined;
          const preparedCompositionArtifactId = compositionRequested
            ? compositionCheckpoint?.artifactId ?? preparedSelectedArtifact?.artifactId ?? makeId("artifact")
            : undefined;
          let preparedInitialLivePackage: NorthstarGeneratedCodeArtifactPackage | undefined;

          const wholeCanvasContext = isRecord(body.canvasContext)
            ? body.canvasContext
            : {};
          const selectedContextRecord = isRecord(body.selectedCanvasContext)
            ? body.selectedCanvasContext
            : {};
          const canvasSummary = isRecord(wholeCanvasContext.summary)
            ? wholeCanvasContext.summary
            : undefined;
          const ambientCanvas = {
            summary: canvasSummary,
            viewport: isRecord(wholeCanvasContext.viewport)
              ? wholeCanvasContext.viewport
              : undefined,
            documentBounds: wholeCanvasContext.documentBounds,
            selectionCount: Array.isArray(selectedContextRecord.selectedIds)
              ? selectedContextRecord.selectedIds.length
              : 0,
          };

          const contextEnvelope =
            planner.focus === "canvas"
              ? {
                  interactionFocus: planner.focus,
                  contextMode,
                  conversationSummary: conversationSummary || undefined,
                  recentToolContext: historyToolContext,
                  wholeCanvasContext: body.canvasContext,
                }
              : planner.focus === "selection"
                ? {
                    interactionFocus: planner.focus,
                    contextMode,
                    conversationSummary: conversationSummary || undefined,
                    recentToolContext: historyToolContext,
                    selectedCanvasContext: activeContext,
                    ambientCanvas,
                  }
                : planner.focus === "northstar-data"
                  ? {
                      interactionFocus: planner.focus,
                      conversationSummary: conversationSummary || undefined,
                      recentToolContext: historyToolContext,
                    }
                : planner.focus === "hybrid"
                  ? {
                      interactionFocus: planner.focus,
                      contextMode,
                      conversationSummary: conversationSummary || undefined,
                      recentToolContext: historyToolContext,
                      wholeCanvasContext: body.canvasContext,
                      selectedCanvasContext:
                        contextMode === "selection" ? activeContext : undefined,
                    }
                  : {
                      interactionFocus: planner.focus,
                      conversationSummary: conversationSummary || undefined,
                      recentToolContext: historyToolContext,
                      ambientCanvas,
                    };

          const contextText = JSON.stringify(contextEnvelope);
          if (contextText.length > MAX_CONTEXT_CHARACTERS) {
            throw new Error(
              "The relevant workspace context is too large for this request. Select a smaller set of objects.",
            );
          }

          const toolResults: ToolResult[] = [];
          let requestedCanvasActionCount = 0;
          let compositionResearchLedger: CompositionResearchLedger | null = null;
          const directInspectionActivity = buildDirectInspectionActivity({
            planner,
            canvasContext: body.canvasContext,
            selectedCanvasContext: body.selectedCanvasContext,
            visualCount: userVisuals.count + historyVisuals.count,
            validObjectIds,
          });

          if (directInspectionActivity) {
            send("plan.created", {
              runId,
              title: planner.title,
              steps: [
                {
                  id: directInspectionActivity.id,
                  label: directInspectionActivity.label,
                  tool: directInspectionActivity.tool,
                  icon: directInspectionActivity.icon,
                  status: "pending",
                  objectIds: directInspectionActivity.objectIds,
                },
              ],
            });
            send("step.started", {
              runId,
              stepId: directInspectionActivity.id,
            });
            send("tool.started", {
              runId,
              stepId: directInspectionActivity.id,
              tool: directInspectionActivity.tool,
              label: directInspectionActivity.label,
            });
            await yieldToStream(request.signal);
          }

          if (planner.mode === "agent") {
            send("plan.created", {
              runId,
              title: planner.title,
              steps: planner.steps.map((step) => ({
                id: step.id,
                label: step.label,
                tool: step.tool,
                icon: step.icon,
                status: "pending",
                objectIds: [],
              })),
            });
            await yieldToStream(request.signal);

            if (compositionRequested && preparedCompositionArtifactId && !preparedSelectedArtifact) {
              const catalog = await getDataCatalog();
              const requestedApps = compositionCheckpoint?.requestedApps.length
                ? compositionCheckpoint.requestedApps
                : requestedAppNamesFromText(catalog, [
                    message,
                    semanticIntent.objective,
                    ...history.slice(-8).map((entry) => entry.content),
                  ]);
              const initialBundle = buildProvisionalCanvasCodeArtifactDataBundle({
                objective: semanticIntent.objective || message,
                audience: semanticIntent.canvas?.audience ?? "general",
                artifactType: semanticIntent.canvas?.artifactType ?? "freeform",
                toolResults: [],
                catalog,
                requestedApps,
                coverageSummary: "Northstar is acquiring the relevant app identity, product context, flows, and evidence.",
              });
              try {
                const initialPackage = await buildPolishedLiveArtifactPackage({
                  apiKey,
                  artifactId: preparedCompositionArtifactId,
                  objective: semanticIntent.objective || message,
                  audience: semanticIntent.canvas?.audience ?? "general",
                  artifactType: semanticIntent.canvas?.artifactType ?? "freeform",
                  thinkingDepth,
                  dataBundle: initialBundle,
                  phase: "foundation",
                  message: "Frame the problem with a polished editorial opening and the real app identities currently available.",
                  signal: request.signal,
                });
                const initialAckToken = `${initialPackage.artifactId}:${initialPackage.revisionId}:${crypto.randomUUID()}`;
                const dispatchedInitialPackage = { ...initialPackage, pendingAckToken: initialAckToken };
                preparedInitialLivePackage = dispatchedInitialPackage;
                const initialStep: PlannerStep = {
                  id: "open-live-artifact-immediately",
                  label: "Open the live Northstar artifact",
                  tool: "compose_visual_scene",
                  icon: "write",
                  arguments: {
                    artifactId: preparedCompositionArtifactId,
                    artifactType: semanticIntent.canvas?.artifactType ?? "freeform",
                    executionDepth: preferredExecutionDepth,
                    workingVisibility: "hidden",
                    audience: semanticIntent.canvas?.audience ?? "general",
                    title: dispatchedInitialPackage.title,
                    compositionJson: JSON.stringify({
                      schema: NORTHSTAR_CODE_ARTIFACT_ACTION_SCHEMA,
                      artifactId: preparedCompositionArtifactId,
                      command: "create-or-update",
                      stageIndex: 0,
                      package: dispatchedInitialPackage,
                    }),
                    resultKey: "live-generated-artifact",
                    placement: "center",
                    selectAfter: false,
                  },
                };
                const action = await buildCanvasActionRequest({
                  step: initialStep,
                  getDataCatalog,
                  previousResults: toolResults,
                  canvasContext: body.canvasContext,
                  selectedCanvasContext: body.selectedCanvasContext,
                  validObjectIds,
                });
                toolResults.push({
                  stepId: initialStep.id,
                  tool: initialStep.tool,
                  label: initialStep.label,
                  detail: "The live artifact foundation was dispatched before research began.",
                  objectIds: [],
                  data: { canvasAction: { status: "requested", tool: action.tool, arguments: action.arguments, artifactId: preparedCompositionArtifactId } },
                  ok: false,
                });
                requestedCanvasActionCount += 1;
                send("canvas.action.requested", { runId, action });
                const initialAck = await waitForNorthstarArtifactAcknowledgement({
                  ackToken: initialAckToken,
                  timeoutMs: 20_000,
                  signal: request.signal,
                });
                if (!liveAcknowledgementPassed(initialAck)) {
                  throw new Error(initialAck.reason || "The live artboard foundation did not pass its browser audit.");
                }
                preparedInitialLivePackage = {
                  ...dispatchedInitialPackage,
                  pendingAckToken: undefined,
                  preferredWidth: initialAck.size?.intrinsicWidth ?? dispatchedInitialPackage.preferredWidth,
                  preferredHeight: initialAck.size?.intrinsicHeight ?? dispatchedInitialPackage.preferredHeight,
                  intrinsicBounds: initialAck.size?.contentBounds ?? dispatchedInitialPackage.intrinsicBounds,
                  runtimeReview: initialAck.review,
                };
              } catch (initialArtifactError) {
                if (request.signal.aborted || (initialArtifactError instanceof DOMException && initialArtifactError.name === "AbortError")) {
                  throw initialArtifactError;
                }
                throwIfGeminiInfrastructureError(initialArtifactError);
                // A malformed optional live-state revision must never cancel the grounded run.
                // Research continues and the next checkpoint retries the same artifact with richer data.
                console.warn("Northstar deferred the initial live artifact and continued the run:", initialArtifactError);
              }
            }

            for (const step of planner.steps) {
              if (request.signal.aborted) throw new DOMException("Aborted", "AbortError");

              send("step.started", { runId, stepId: step.id });
              send("tool.started", {
                runId,
                stepId: step.id,
                tool: step.tool,
                label: step.label,
              });
              await yieldToStream(request.signal);

              try {
                if (isCanvasActionTool(step.tool)) {
                  const action = await buildCanvasActionRequest({
                    step,
                    getDataCatalog,
                    previousResults: toolResults,
                    canvasContext: body.canvasContext,
                    selectedCanvasContext: body.selectedCanvasContext,
                    validObjectIds,
                  });
                  const result: ToolResult = {
                    stepId: step.id,
                    tool: step.tool,
                    label: step.label,
                    detail:
                      "The canvas action was dispatched to the workspace and is awaiting client-side verification.",
                    objectIds: [],
                    data: {
                      canvasAction: {
                        status: "requested",
                        tool: action.tool,
                        arguments: action.arguments,
                        appName: action.asset?.app?.name,
                        flowName: action.asset?.flow?.name,
                        screenshotName: action.asset?.screenshot?.name,
                      },
                    },
                    ok: false,
                  };
                  toolResults.push(result);
                  requestedCanvasActionCount += 1;
                  send("canvas.action.requested", {
                    runId,
                    action,
                  });
                  // Client-side canvas execution is synchronous and undoable. Give the
                  // browser a moment to paint each action before dispatching the next.
                  await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(resolve, 220);
                    const abort = () => {
                      clearTimeout(timeout);
                      reject(new DOMException("Aborted", "AbortError"));
                    };
                    request.signal.addEventListener("abort", abort, { once: true });
                    setTimeout(() => request.signal.removeEventListener("abort", abort), 240);
                  });
                } else {
                  const result = await executeAgentTool({
                    step,
                    canvasContext: body.canvasContext,
                    selectedCanvasContext: body.selectedCanvasContext,
                    validObjectIds,
                    getDataCatalog,
                  });
                  toolResults.push(result);
                  send("tool.completed", {
                    runId,
                    stepId: step.id,
                    tool: step.tool,
                    detail: result.detail,
                    objectIds: result.objectIds,
                    resultView: result.resultView,
                    ok: result.ok,
                  });
                  send("step.completed", {
                    runId,
                    stepId: step.id,
                    detail: result.detail,
                    objectIds: result.objectIds,
                  });
                }
              } catch (error) {
                const detail = error instanceof Error ? error.message : "The inspection could not be completed.";
                toolResults.push({
                  stepId: step.id,
                  tool: step.tool,
                  label: step.label,
                  detail,
                  objectIds: [],
                  data: null,
                  ok: false,
                });
                send("tool.failed", { runId, stepId: step.id, tool: step.tool, detail });
                send("step.failed", { runId, stepId: step.id, detail });
              }
              await yieldToStream(request.signal);
            }
          }

          if (compositionRequested) {
            const compositionEvidenceResult = toolResults.find(
              (result) => result.tool === "prepare_composition_evidence",
            );
            const selectedCompositionIds =
              isRecord(body.selectedCanvasContext) && Array.isArray(body.selectedCanvasContext.selectedIds)
                ? body.selectedCanvasContext.selectedIds.filter((id): id is string => typeof id === "string")
                : [];
            const selectedCodeArtifact = extractCodeArtifactContexts(body.selectedCanvasContext)[0];
            const recentCreativeSignatures = collectRecentCreativeSignatures(body.canvasContext);
            const activeResumeCheckpoint =
              compositionCheckpoint && semanticIntent.resumeActiveRun
                ? compositionCheckpoint
                : null;
            if (
              selectedCompositionIds.length === 0 &&
              (!compositionEvidenceResult || !compositionEvidenceResult.ok) &&
              !activeResumeCheckpoint?.candidateScreens.length
            ) {
              const detail = compositionEvidenceResult?.detail || "North Star could not prepare a complete grounded evidence set for this composition.";
              throw new Error(`${detail} The artifact was not built because its evidence could not be verified.`);
            }

            const compositionArtifactId =
              preparedCompositionArtifactId ?? activeResumeCheckpoint?.artifactId ?? selectedCodeArtifact?.artifactId ?? makeId("artifact");
            const compositionDepth = preferredExecutionDepth;
            const compositionWorkingVisibility: WorkingVisibility = "hidden";
            const compositionAudience = activeResumeCheckpoint?.audience ?? semanticIntent.canvas?.audience ?? "general";
            const compositionArtifactType = activeResumeCheckpoint?.artifactType ?? semanticIntent.canvas?.artifactType ?? "freeform";
            const liveArtifactCatalog = await getDataCatalog();
            let liveWorkingSurfaceCreated = canvasHasArtifactRole(
              body.canvasContext,
              compositionArtifactId,
              "working-frame",
            );
            let lastWorkspacePlanSignature = "";
            const workingSurfaceUpdateSignatures = new Set<string>();
            const selectedLivePackage = generatedPackageFromSelectedArtifact({
              selected: selectedCodeArtifact,
              objective: semanticIntent.objective || message,
              audience: compositionAudience,
              artifactType: compositionArtifactType,
              thinkingDepth,
            });
            let lastLiveArtifactPackage = preparedInitialLivePackage ?? selectedLivePackage;
            let lastLiveArtifactRevisionId = lastLiveArtifactPackage?.revisionId;
            let lastLiveMutationAck: NorthstarArtifactMutationAcknowledgement | undefined;
            const liveArtboardActor = new NorthstarArtboardActor(lastLiveArtifactPackage);
            let liveArtifactDispatchQueue: Promise<boolean> = Promise.resolve(true);

            const dispatchLiveArtifactPackageInternal = async (
              packageValue: NorthstarGeneratedCodeArtifactPackage,
              stageIndex: number,
              label: string,
            ): Promise<boolean> => {
              const committed = liveArtboardActor.snapshot();
              let candidate: NorthstarGeneratedCodeArtifactPackage;
              try {
                candidate = prepareNorthstarArtboardRevisionForPublication({
                  previous: committed,
                  candidate: packageValue,
                });
              } catch (error) {
                console.warn("Northstar blocked a proposal that was not based on the committed artboard.", error);
                return false;
              }

              let proposal;
              try {
                proposal = liveArtboardActor.begin(candidate);
              } catch (error) {
                console.warn("Northstar actor refused the proposal.", error);
                return false;
              }

              const publishablePackage = proposal.candidate;
              const latestBatch = publishablePackage.mutationJournal?.at(-1);
              const step: PlannerStep = {
                id: `live-artifact-${proposal.proposalId}`,
                label,
                tool: "compose_visual_scene",
                icon: "write",
                arguments: {
                  artifactId: publishablePackage.artifactId,
                  artifactType: publishablePackage.artifactType as ArtifactType,
                  executionDepth: compositionDepth,
                  workingVisibility: "hidden",
                  audience: publishablePackage.audience as ArtifactAudience,
                  title: publishablePackage.title,
                  compositionJson: JSON.stringify({
                    schema: NORTHSTAR_CODE_ARTIFACT_ACTION_SCHEMA,
                    artifactId: publishablePackage.artifactId,
                    command: "create-or-update",
                    stageIndex,
                    package: publishablePackage,
                  }),
                  resultKey: "live-generated-artifact",
                  placement: "center",
                  selectAfter: false,
                },
              };

              try {
                const action = await buildCanvasActionRequest({
                  step,
                  getDataCatalog,
                  previousResults: toolResults,
                  canvasContext: body.canvasContext,
                  selectedCanvasContext: body.selectedCanvasContext,
                  validObjectIds,
                });
                requestedCanvasActionCount += 1;
                send("canvas.action.requested", { runId, action });

                let acknowledgement: NorthstarArtifactMutationAcknowledgement | undefined;
                try {
                  acknowledgement = await waitForNorthstarArtifactAcknowledgement({
                    ackToken: proposal.ackToken,
                    timeoutMs: 30_000,
                    signal: request.signal,
                  });
                } catch (error) {
                  if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
                  acknowledgement = getNorthstarArtifactAcknowledgement(proposal.ackToken);
                  if (!acknowledgement) {
                    liveArtboardActor.discard(proposal);
                    console.warn("Northstar discarded an unacknowledged proposal; committed state was unchanged.", error);
                    return false;
                  }
                }

                if (!liveArtboardActor.matches(proposal, acknowledgement)
                  || !liveAcknowledgementPassed(acknowledgement, latestBatch?.mutationId)) {
                  liveArtboardActor.discard(proposal);
                  lastLiveMutationAck = acknowledgement;
                  console.warn("Northstar discarded a rejected or mismatched proposal; committed state was unchanged.", {
                    proposalId: proposal.proposalId,
                    revisionId: publishablePackage.revisionId,
                    mutationId: latestBatch?.mutationId,
                    status: acknowledgement.status,
                    reason: acknowledgement.reason,
                  });
                  return false;
                }

                const committedPackage = liveArtboardActor.commit(proposal, acknowledgement);
                lastLiveArtifactPackage = committedPackage;
                lastLiveArtifactRevisionId = committedPackage.revisionId;
                lastLiveMutationAck = acknowledgement;

                toolResults.push({
                  stepId: step.id,
                  tool: step.tool,
                  label: step.label,
                  detail: "The browser committed the visible artboard proposal.",
                  objectIds: [],
                  data: {
                    canvasAction: {
                      status: "requested",
                      tool: action.tool,
                      arguments: action.arguments,
                      artifactId: committedPackage.artifactId,
                    },
                  },
                  ok: true,
                });
                return true;
              } catch (error) {
                liveArtboardActor.discard(proposal);
                if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
                console.warn("Northstar discarded a failed proposal and preserved the last committed artboard.", error);
                return false;
              }
            };

            const dispatchLiveArtifactPackage = (
              packageValue: NorthstarGeneratedCodeArtifactPackage,
              stageIndex: number,
              label: string,
            ): Promise<boolean> => {
              const run = liveArtifactDispatchQueue.then(
                () => dispatchLiveArtifactPackageInternal(packageValue, stageIndex, label),
                () => dispatchLiveArtifactPackageInternal(packageValue, stageIndex, label),
              );
              liveArtifactDispatchQueue = run.then(() => true, () => true);
              return run;
            };

            if (!selectedCodeArtifact && !preparedInitialLivePackage) {
              const initialLiveBundle = buildProvisionalCanvasCodeArtifactDataBundle({
                objective: semanticIntent.objective || message,
                audience: compositionAudience,
                artifactType: compositionArtifactType,
                toolResults,
                catalog: liveArtifactCatalog,
                coverageSummary: "Northstar is identifying the relevant apps, identity assets, flows, and evidence.",
              });
              const initialLivePackage = await buildPolishedLiveArtifactPackage({
                apiKey,
                artifactId: compositionArtifactId,
                objective: semanticIntent.objective || message,
                audience: compositionAudience,
                artifactType: compositionArtifactType,
                thinkingDepth,
                dataBundle: initialLiveBundle,
                phase: "foundation",
                message: "Create a polished opening state using the available app identity and product context.",
                parentRevisionId: lastLiveArtifactRevisionId,
                previousPackage: lastLiveArtifactPackage,
                signal: request.signal,
              });
              await dispatchLiveArtifactPackage(initialLivePackage, 0, "Open the live Northstar artifact");
            }

            const emitCompositionCheckpoint = (
              phase: CompositionRunCheckpoint["phase"],
              ledger: CompositionResearchLedger,
              currentToolResults: ToolResult[],
            ) => {
              try {
                const currentCandidateScreens = compositionScreensFromToolResults(currentToolResults);
                const candidateScreens = (currentCandidateScreens.length > 0
                  ? currentCandidateScreens
                  : activeResumeCheckpoint?.candidateScreens ?? [])
                  .slice(0, MAX_COMPOSITION_CHECKPOINT_SCREENS);
                const selectedFlows = compositionFlowIdentitiesFromToolResults(currentToolResults, candidateScreens);
                const checkpoint: CompositionRunCheckpoint = {
                  version: "northstar.composition-checkpoint.v1",
                  runId,
                  artifactId: compositionArtifactId,
                  objective: semanticIntent.objective || message,
                  phase,
                  executionDepth: compositionDepth,
                  thinkingDepth,
                  workingVisibility: compositionWorkingVisibility,
                  audience: compositionAudience,
                  artifactType: compositionArtifactType,
                  requestedApps:
                    activeResumeCheckpoint?.requestedApps?.length
                      ? activeResumeCheckpoint.requestedApps
                      : collectGroundedCompositionContext(currentToolResults).requestedApps,
                  sessionType: semanticIntent.data?.sessionType,
                  platform: semanticIntent.data?.platform,
                  candidateScreens,
                  selectedFlows: selectedFlows.length > 0 ? selectedFlows : activeResumeCheckpoint?.selectedFlows ?? [],
                  ledger,
                  updatedAt: new Date().toISOString(),
                };
                send("run.checkpoint", { runId, checkpoint });
              } catch (error) {
                if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
                  throw error;
                }
                console.warn("North Star skipped a non-critical checkpoint emission and continued:", error);
              }
            };

            const makeLiveWorkingCompositionJson = (
              evidenceIds: string[] = [],
              notes: CompositionWorkingNote[] = [],
              workspacePlan?: ResearchWorkspacePlan,
            ) =>
              JSON.stringify({
                artifactId: compositionArtifactId,
                artifactType: compositionArtifactType,
                executionDepth: compositionDepth,
                workingVisibility: compositionWorkingVisibility,
                audience: compositionAudience,
                title: `${semanticIntent.objective || message} — working surface`,
                subtitle: "North Star research, hypotheses, corrections, and evidence",
                summary: "",
                visualStrategy: "An evolving inspectable workbench used while North Star researches and solves the problem.",
                researchDigest: "Research is in progress. This surface will evolve as screenshots are studied and the plan changes.",
                workingNotes: notes,
                workingEvidenceIds: evidenceIds,
                workingSurfacePlan: workspacePlan,
                sections: [],
                layout: {
                  direction: "mixed",
                  columns: 1,
                  gap: 24,
                  evidenceScale: "balanced",
                  canvasWidth: 1520,
                  canvasHeight: 1200,
                  regions: [],
                },
              } satisfies CompositionBlueprint);

            const dispatchLiveWorkingSurfaceAction = async ({
              stepId,
              label,
              note,
              evidenceIds = [],
              create = false,
              workspacePlan,
              replaceExisting = false,
            }: {
              stepId: string;
              label: string;
              note: CompositionWorkingNote;
              evidenceIds?: string[];
              create?: boolean;
              workspacePlan?: ResearchWorkspacePlan;
              replaceExisting?: boolean;
            }): Promise<boolean> => {
              if (compositionWorkingVisibility === "hidden") return false;

              let updateSignature: string | null = null;
              let activityStarted = false;
              try {
                const normalizedEvidenceIds = Array.from(new Set(evidenceIds)).sort();
                const normalizedNote = {
                  kind: note.kind,
                  label: note.label.trim().toLowerCase().replace(/\s+/g, " "),
                  text: note.text.trim().toLowerCase().replace(/\s+/g, " "),
                  evidenceIds: Array.from(new Set(note.evidenceIds ?? normalizedEvidenceIds)).sort(),
                };
                updateSignature = JSON.stringify({
                  create,
                  note: normalizedNote,
                  evidenceIds: normalizedEvidenceIds,
                  workspacePlan,
                });
                if (!create && workingSurfaceUpdateSignatures.has(updateSignature)) return false;
                workingSurfaceUpdateSignatures.add(updateSignature);

                const actionStep: PlannerStep = {
                  id: stepId,
                  label,
                  tool: create ? "create_working_surface" : "update_working_surface",
                  icon: create ? "plan" : "write",
                  arguments: create
                    ? {
                        artifactId: compositionArtifactId,
                        artifactType: compositionArtifactType,
                        executionDepth: compositionDepth,
                        workingVisibility: compositionWorkingVisibility,
                        audience: compositionAudience,
                        title: `${semanticIntent.objective || message} — working surface`,
                        workingNotesJson: JSON.stringify([{ ...note, evidenceIds: normalizedEvidenceIds }]),
                        compositionJson: makeLiveWorkingCompositionJson(normalizedEvidenceIds, [note], workspacePlan),
                        workspacePlanJson: workspacePlan ? JSON.stringify(workspacePlan) : undefined,
                        replaceExisting,
                        resultKey: "working-surface",
                        placement: "right-of-selection",
                        selectAfter: false,
                      }
                    : {
                        artifactId: compositionArtifactId,
                        artifactType: compositionArtifactType,
                        executionDepth: compositionDepth,
                        workingVisibility: compositionWorkingVisibility,
                        audience: compositionAudience,
                        workingNoteJson: JSON.stringify({ ...note, evidenceIds: normalizedEvidenceIds }),
                        compositionJson: makeLiveWorkingCompositionJson(normalizedEvidenceIds, [note], workspacePlan),
                        workspacePlanJson: workspacePlan ? JSON.stringify(workspacePlan) : undefined,
                        replaceExisting,
                        resultKeys: ["working-surface"],
                        resultKey: stepId,
                        selectAfter: false,
                      },
                };

                send("plan.extended", {
                  runId,
                  title: planner.title,
                  visualStrategy: "North Star is externalizing its evolving research and decisions on the inspectable working surface.",
                  steps: [{
                    id: actionStep.id,
                    label: actionStep.label,
                    tool: actionStep.tool,
                    icon: actionStep.icon,
                    status: "pending",
                    objectIds: [],
                  }],
                });
                send("step.started", { runId, stepId: actionStep.id });
                send("tool.started", {
                  runId,
                  stepId: actionStep.id,
                  tool: actionStep.tool,
                  label: actionStep.label,
                });
                activityStarted = true;

                const action = await buildCanvasActionRequest({
                  step: actionStep,
                  getDataCatalog,
                  previousResults: toolResults,
                  canvasContext: body.canvasContext,
                  selectedCanvasContext: body.selectedCanvasContext,
                  validObjectIds,
                });
                toolResults.push({
                  stepId: actionStep.id,
                  tool: actionStep.tool,
                  label: actionStep.label,
                  detail: "The working-surface update was dispatched and is awaiting client-side verification.",
                  objectIds: [],
                  data: {
                    canvasAction: {
                      status: "requested",
                      tool: action.tool,
                      arguments: action.arguments,
                      artifactId: compositionArtifactId,
                    },
                  },
                  ok: false,
                });
                requestedCanvasActionCount += 1;
                send("canvas.action.requested", { runId, action });
                liveWorkingSurfaceCreated = true;
                await new Promise<void>((resolve, reject) => {
                  const timeout = setTimeout(resolve, create ? 900 : 560);
                  const abort = () => {
                    clearTimeout(timeout);
                    reject(new DOMException("Aborted", "AbortError"));
                  };
                  request.signal.addEventListener("abort", abort, { once: true });
                  setTimeout(
                    () => request.signal.removeEventListener("abort", abort),
                    create ? 960 : 620,
                  );
                });
                return true;
              } catch (error) {
                if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
                  throw error;
                }
                if (updateSignature) workingSurfaceUpdateSignatures.delete(updateSignature);
                console.warn("North Star deferred a non-critical working-surface update and continued:", error);
                if (activityStarted) {
                  const detail = create
                    ? "North Star kept the current canvas state and continued the core solution."
                    : "North Star kept the current working surface and continued the core solution.";
                  send("tool.completed", {
                    runId,
                    stepId,
                    tool: create ? "create_working_surface" : "update_working_surface",
                    detail,
                    objectIds: [],
                    ok: true,
                  });
                  send("step.completed", {
                    runId,
                    stepId,
                    detail,
                    objectIds: [],
                  });
                }
                return false;
              }
            };

            if (compositionWorkingVisibility !== "hidden" && !liveWorkingSurfaceCreated) {
              const initialScreens = compositionScreensFromToolResults(toolResults).slice(
                0,
                compositionDepth === "deep" ? 12 : compositionDepth === "quick" ? 4 : 8,
              );
              await dispatchLiveWorkingSurfaceAction({
                stepId: "create-live-working-surface",
                label: "Open North Star's inspectable working surface",
                create: true,
                evidenceIds: initialScreens.map((screen) => screen.id),
                note: {
                  label: "Objective",
                  text: semanticIntent.objective || message,
                  kind: "objective",
                  evidenceIds: initialScreens.map((screen) => screen.id),
                },
              });
            }

            const researchCallbacks: CompositionResearchCallbacks = {
              extendPlan(steps, visualStrategy) {
                send("plan.extended", {
                  runId,
                  title: planner.title,
                  visualStrategy,
                  steps: steps.map((step) => ({
                    ...step,
                    status: "pending",
                    objectIds: [],
                  })),
                });
              },
              startStep(step) {
                send("step.started", { runId, stepId: step.id });
                send("tool.started", {
                  runId,
                  stepId: step.id,
                  tool: step.tool,
                  label: step.label,
                });
              },
              async completeStep(step) {
                send("tool.completed", {
                  runId,
                  stepId: step.id,
                  tool: step.tool,
                  detail: step.detail,
                  objectIds: [],
                  resultView: step.resultView,
                  ok: true,
                });
                send("step.completed", {
                  runId,
                  stepId: step.id,
                  detail: step.detail,
                  objectIds: [],
                });

                if (!liveWorkingSurfaceCreated || compositionWorkingVisibility === "hidden") return;
                const evidenceIds = Array.from(
                  new Set(
                    (step.resultView?.items ?? []).flatMap((item) => [
                      item.kind === "screenshot" ? item.id : "",
                      ...(item.thumbnails ?? []).map((thumbnail) => thumbnail.id),
                    ]),
                  ),
                ).filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 15);
                const isStudy = step.id.startsWith("study-evidence");
                const isCoverage = step.id.startsWith("review-research-coverage");
                const isCritique = step.id.startsWith("critique-blueprint");
                const isAdditionalResearch = step.id.startsWith("additional-research");
                if (!isStudy && !isCoverage && !isCritique && !isAdditionalResearch) return;
                await dispatchLiveWorkingSurfaceAction({
                  stepId: `${step.id}-working-update`,
                  label: isStudy
                    ? "Record the studied screenshot batch"
                    : isCritique
                      ? "Record the visual-solution critique"
                      : isCoverage
                        ? "Record the research checkpoint"
                        : "Record the additional research",
                  evidenceIds,
                  note: {
                    label: isStudy
                      ? "Screenshot study"
                      : isCritique
                        ? "Presentation critique"
                        : isCoverage
                          ? "Research checkpoint"
                          : "Additional research",
                    text: step.detail,
                    kind: isCritique
                      ? "correction"
                      : isCoverage
                        ? "check"
                        : "evidence",
                    evidenceIds,
                  },
                });
              },
              async checkpoint(phase, ledger, currentToolResults) {
                try {
                  emitCompositionCheckpoint(phase, ledger, currentToolResults);
                  if (selectedCodeArtifact) return;
                  const provisional = buildProvisionalCanvasCodeArtifactDataBundle({
                    objective: semanticIntent.objective || message,
                    audience: compositionAudience,
                    artifactType: compositionArtifactType,
                    toolResults: currentToolResults,
                    catalog: liveArtifactCatalog,
                    coverageSummary: ledger.coverageSummary,
                  });
                  const grounded = ledger.observations.length > 0
                    ? buildCanvasCodeArtifactDataBundle({
                        objective: semanticIntent.objective || message,
                        audience: compositionAudience,
                        artifactType: compositionArtifactType,
                        ledger,
                        toolResults: currentToolResults,
                        catalog: liveArtifactCatalog,
                      })
                    : provisional;
                  const dataBundle: CanvasCodeArtifactDataBundle = {
                    ...grounded,
                    apps: grounded.apps.length ? grounded.apps : provisional.apps,
                    flows: grounded.flows.length ? grounded.flows : provisional.flows,
                    screenshots: grounded.screenshots.length ? grounded.screenshots : provisional.screenshots,
                    allowedAssetUrls: Array.from(new Set([...grounded.allowedAssetUrls, ...provisional.allowedAssetUrls])),
                  };
                  const stagePhase: CanvasCodeArtifactStage["phase"] =
                    phase === "research" ? "evidence" :
                    phase === "review" || phase === "blueprint" ? "analysis" :
                    phase === "building" ? "recommendation" : "refinement";
                  const stageIndex = Math.max(0, ["foundation", "evidence", "analysis", "recommendation", "refinement"].indexOf(stagePhase));
                  const livePackage = await buildPolishedLiveArtifactPackage({
                    apiKey,
                    artifactId: compositionArtifactId,
                    objective: semanticIntent.objective || message,
                    audience: compositionAudience,
                    artifactType: compositionArtifactType,
                    thinkingDepth,
                    dataBundle,
                    phase: stagePhase,
                    message: ledger.coverageSummary || `Evolve the composition through the ${stagePhase} stage using the newly grounded evidence.`,
                    parentRevisionId: lastLiveArtifactRevisionId,
                    previousPackage: lastLiveArtifactPackage,
                    signal: request.signal,
                  });
                  await dispatchLiveArtifactPackage(livePackage, stageIndex, `Update the live artifact with ${stagePhase}`);
                } catch (error) {
                  if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
                    throw error;
                  }
                  console.warn("Northstar skipped a non-critical live-artifact checkpoint and continued:", error);
                }
              },
              getVisibleArtifact() {
                return liveArtboardActor.snapshot();
              },
              getLastMutationAck() {
                return liveArtboardActor.lastAcknowledgement() ?? lastLiveMutationAck;
              },
              async publishArtifact(packageValue, stageIndex, label) {
                return dispatchLiveArtifactPackage(packageValue, stageIndex, label);
              },
              failStep(step) {
                send("tool.failed", {
                  runId,
                  stepId: step.id,
                  tool: step.tool,
                  detail: step.detail,
                });
                send("step.failed", {
                  runId,
                  stepId: step.id,
                  detail: step.detail,
                });
              },
            };

            const selectedArtifactDataBundle = selectedCodeArtifact?.dataBundle;
            const revisionRequestsFreshEvidence = Boolean(
              semanticIntent.data &&
              semanticIntent.data.entity !== "none" &&
              (
                semanticIntent.data.appName ||
                semanticIntent.data.flowName ||
                semanticIntent.data.screenshotId ||
                semanticIntent.data.query
              ),
            );
            const shouldReuseSelectedEvidence = Boolean(
              selectedArtifactDataBundle &&
              !activeResumeCheckpoint &&
              !revisionRequestsFreshEvidence,
            );
            const research = shouldReuseSelectedEvidence && selectedArtifactDataBundle
              ? await (async () => {
                  const reuseStep: PlannerStep = {
                    id: "reuse-selected-artifact-evidence",
                    label: "Reuse the selected artifact's grounded evidence",
                    tool: "prepare_composition_evidence",
                    icon: "inspect",
                    arguments: {},
                  };
                  await researchCallbacks.extendPlan(
                    [reuseStep],
                    "Revise the selected artifact without repeating research that is already grounded and attached to it.",
                  );
                  await researchCallbacks.startStep(reuseStep);
                  const revisedBundle: CanvasCodeArtifactDataBundle = {
                    ...selectedArtifactDataBundle,
                    objective: semanticIntent.objective || selectedArtifactDataBundle.objective,
                    audience: compositionAudience,
                    artifactType: compositionArtifactType,
                  };
                  const reuseResult = buildArtifactEvidenceReuseToolResult(revisedBundle);
                  await researchCallbacks.completeStep({
                    id: reuseStep.id,
                    tool: reuseStep.tool,
                    detail: reuseResult.detail,
                  });
                  return {
                    ledger: buildResearchLedgerFromArtifactDataBundle(
                      revisedBundle,
                      semanticIntent.objective || message,
                    ),
                    toolResults: [...toolResults, reuseResult],
                    reusedDataBundle: revisedBundle,
                  };
                })()
              : {
                  ...(await runRecursiveCompositionResearch({
                    apiKey,
                    intent: semanticIntent,
                    message,
                    initialToolResults: toolResults,
                    getDataCatalog,
                    signal: request.signal,
                    callbacks: researchCallbacks,
                    resumeCheckpoint: activeResumeCheckpoint,
                  })),
                  reusedDataBundle: undefined,
                };
            compositionResearchLedger = research.ledger;
            toolResults.splice(0, toolResults.length, ...research.toolResults);

            if (compositionResearchLedger.observations.length === 0) {
              throw new Error(
                "North Star could not visually inspect any grounded screenshots. The artifact was not built because its evidence had not been understood.",
              );
            }

            const proposedBlueprint = await buildCompositionBlueprint({
              apiKey,
              intent: semanticIntent,
              message,
              conversationSummary,
              toolResults,
              researchLedger: compositionResearchLedger,
              canvasContext: body.canvasContext,
              selectedCanvasContext: body.selectedCanvasContext,
              historyToolContext,
              signal: request.signal,
              callbacks: researchCallbacks,
            });
            const blueprint: CompositionBlueprint = {
              ...proposedBlueprint,
              artifactId: compositionArtifactId,
              workingSurfacePlan:
                proposedBlueprint.workingSurfacePlan ?? compositionResearchLedger.workspacePlan,
            };
            emitCompositionCheckpoint("blueprint", compositionResearchLedger, toolResults);
            const codeArtifactDataBundle = research.reusedDataBundle
              ? {
                  ...research.reusedDataBundle,
                  objective: semanticIntent.objective || research.reusedDataBundle.objective,
                  audience: blueprint.audience,
                  artifactType: blueprint.artifactType,
                }
              : buildCanvasCodeArtifactDataBundle({
                  objective: semanticIntent.objective || message,
                  audience: blueprint.audience,
                  artifactType: blueprint.artifactType,
                  ledger: compositionResearchLedger,
                  toolResults,
                  catalog: await getDataCatalog(),
                });
            const codeArtifactPackage = await buildGeneratedCodeArtifactPackage({
              apiKey,
              artifactId: compositionArtifactId,
              message,
              intent: semanticIntent,
              conversationSummary,
              blueprint,
              ledger: compositionResearchLedger,
              dataBundle: codeArtifactDataBundle,
              thinkingDepth,
              previousArtifact: selectedCodeArtifact,
              recentCreativeSignatures,
              callbacks: researchCallbacks,
              signal: request.signal,
            });
            const committedCodeArtifactPackage = liveArtboardActor.snapshot() ?? codeArtifactPackage;
            const finalCodeArtifactPackage: NorthstarGeneratedCodeArtifactPackage = liveArtboardActor.publicationIsComplete()
              ? committedCodeArtifactPackage
              : {
                  ...committedCodeArtifactPackage,
                  provisional: true,
                  publicationState: "working",
                  diagnostics: [
                    ...committedCodeArtifactPackage.diagnostics,
                    "Northstar did not claim completion because no verified final browser commit exists.",
                  ].slice(-60),
                };

            const compositionSteps = buildCompositionActionSteps(
              blueprint,
              finalCodeArtifactPackage,
              activeResumeCheckpoint?.sessionType ?? semanticIntent.data?.sessionType,
              Array.from(new Set([
                ...(activeResumeCheckpoint?.requestedApps ?? compositionCheckpoint?.requestedApps ?? []),
                ...compositionResearchLedger.appSyntheses.map((app) => app.appName),
                ...(semanticIntent.data?.appName ? [semanticIntent.data.appName] : []),
              ])),
            ).filter(
              (step) => !(liveWorkingSurfaceCreated && step.tool === "create_working_surface"),
            );
            send("plan.extended", {
              runId,
              title: planner.title,
              visualStrategy: codeArtifactPackage.visualStrategy,
              steps: compositionSteps.map((step) => ({
                id: step.id,
                label: step.label,
                tool: step.tool,
                icon: step.icon,
                status: "pending",
                objectIds: [],
              })),
            });
            await yieldToStream(request.signal);

            for (const step of compositionSteps) {
              if (request.signal.aborted) throw new DOMException("Aborted", "AbortError");
              send("step.started", { runId, stepId: step.id });
              send("tool.started", {
                runId,
                stepId: step.id,
                tool: step.tool,
                label: step.label,
              });
              await yieldToStream(request.signal);
              try {
                const action = await buildCanvasActionRequest({
                  step,
                  getDataCatalog,
                  previousResults: toolResults,
                  canvasContext: body.canvasContext,
                  selectedCanvasContext: body.selectedCanvasContext,
                  validObjectIds,
                });
                toolResults.push({
                  stepId: step.id,
                  tool: step.tool,
                  label: step.label,
                  detail: "The composition action was dispatched to the workspace and is awaiting client-side verification.",
                  objectIds: [],
                  data: {
                    canvasAction: {
                      status: "requested",
                      tool: action.tool,
                      arguments: action.arguments,
                      artifactId: blueprint.artifactId,
                    },
                  },
                  ok: false,
                });
                requestedCanvasActionCount += 1;
                send("canvas.action.requested", { runId, action });
                await new Promise<void>((resolve, reject) => {
                  const isGeneratedArtifactStage =
                    step.id.startsWith("build-code-artifact-") ||
                    step.id.startsWith("advance-code-artifact-");
                  const timeout = setTimeout(
                    resolve,
                    isGeneratedArtifactStage
                      ? 850
                      : step.tool === "add_artifact_section"
                        ? 900
                        : 620,
                  );
                  const abort = () => {
                    clearTimeout(timeout);
                    reject(new DOMException("Aborted", "AbortError"));
                  };
                  request.signal.addEventListener("abort", abort, { once: true });
                  setTimeout(
                    () => request.signal.removeEventListener("abort", abort),
                    isGeneratedArtifactStage
                      ? 910
                      : step.tool === "add_artifact_section"
                        ? 960
                        : 680,
                  );
                });
              } catch (error) {
                const detail = error instanceof Error ? error.message : "The composition step could not be completed.";
                toolResults.push({
                  stepId: step.id,
                  tool: step.tool,
                  label: step.label,
                  detail,
                  objectIds: [],
                  data: null,
                  ok: false,
                });
                send("tool.failed", { runId, stepId: step.id, tool: step.tool, detail });
                send("step.failed", { runId, stepId: step.id, detail });
              }
              await yieldToStream(request.signal);
            }
            emitCompositionCheckpoint("building", compositionResearchLedger, toolResults);
          }

          if (requestedCanvasActionCount > 0) {
            send("assistant.final", {
              runId,
              answer: "",
              references: [],
              suggestedActions: [],
              showSuggestedActions: false,
              conversationSummary: scrubInternalIds(
                conversationSummary,
                validObjectIds,
              ),
              meta: {
                model: GEMINI_MODEL,
                contextMode,
                interactionFocus: planner.focus,
                runMode: planner.mode,
                completedToolCount: toolResults.filter((result) => result.ok)
                  .length,
                requestedCanvasActionCount,
                attachedVisualCount: 0,
                recentHistoryCount: history.length,
                intentKind: semanticIntent.kind,
                requiresTools: semanticIntent.requiresTools,
                requiredDataTool: intentNeedsDataTool(semanticIntent),
                requiredCanvasAction: intentNeedsCanvasAction(semanticIntent),
                plannedStepCount: planner.steps.length,
                compositionRequested,
                inspectedScreenshotCount:
                  compositionResearchLedger?.inspectedScreenshotIds.length ?? 0,
                researchBatchCount:
                  compositionResearchLedger?.batches.length ?? 0,
                researchRoundCount:
                  compositionResearchLedger
                    ? compositionResearchLedger.researchRounds + 1
                    : 0,
              },
            });
            send("run.completed", {
              runId,
              mode: planner.mode,
              awaitingClientCanvasActions: true,
            });
            close();
            return;
          }

          const successfulDataToolCount = toolResults.filter(
            (result) => result.ok && isNorthStarDataTool(result.tool),
          ).length;
          if (intentNeedsDataTool(semanticIntent) && successfulDataToolCount === 0) {
            throw new Error("North Star could not retrieve the required tenant data. No app, flow, screenshot, or icon claims were generated.");
          }

          const remainingVisualSlots = Math.max(
            0,
            MAX_VISUALS - userVisuals.count - historyVisuals.count,
          );
          const dataVisualCandidates = collectToolVisualCandidates(toolResults);
          const selectedVisualCandidates =
            planner.focus === "selection" || planner.focus === "hybrid"
              ? collectSelectedVisualCandidates(body.selectedCanvasContext)
              : [];
          const visualCandidates = [
            ...dataVisualCandidates,
            ...selectedVisualCandidates,
          ].slice(0, remainingVisualSlots);

          const visualParts = (
            await Promise.all(
              visualCandidates.map((candidate) => fetchVisualPart(candidate, request.signal)),
            )
          ).flat();

          const allVisualParts = [
            ...userVisuals.parts,
            ...historyVisuals.parts,
            ...visualParts,
          ];

          const finalContext = {
            userRequest: message,
            interactionFocus: planner.focus,
            contextMode,
            conversationSummary: conversationSummary || undefined,
            relevantContext: contextEnvelope,
            attachedImages: {
              current: userVisuals.names,
              recentConversation: historyVisuals.names,
            },
            agentRun: {
              mode: planner.mode,
              title: planner.title,
              completedToolResults: toolResults,
            },
            executionGrounding: {
              intentKind: semanticIntent.kind,
              requiresTools: semanticIntent.requiresTools,
              requiredDataTool: intentNeedsDataTool(semanticIntent),
              requiredCanvasAction: intentNeedsCanvasAction(semanticIntent),
              successfulDataToolCount,
              plannedStepCount: planner.steps.length,
              compositionRequested,
            },
          };

          const contents = [
            ...history.map((item) => ({
              role: item.role === "assistant" ? "model" : "user",
              parts: [{ text: item.content }],
            })),
            {
              role: "user",
              parts: [
                { text: JSON.stringify(finalContext) },
                ...allVisualParts,
              ],
            },
          ];

          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
              },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: FINAL_SYSTEM_INSTRUCTION }] },
                contents,
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: thinkingDepth === "low" ? 2_200 : 4_200,
                  responseMimeType: "application/json",
                  responseJsonSchema: FINAL_RESPONSE_JSON_SCHEMA,
                },
              }),
              cache: "no-store",
              signal: request.signal,
            },
          );

          if (!geminiResponse.ok) {
            const payload = (await geminiResponse.json().catch(() => null)) as Record<string, unknown> | null;
            const providerError = payload && isRecord(payload.error) ? payload.error : undefined;
            throw classifyGeminiFailure({
              status: geminiResponse.status,
              message: getString(providerError?.message) || "Gemini could not complete the request.",
              providerCode: getString(providerError?.status) || getString(providerError?.code),
              retryAfterSeconds: parseRetryAfterSeconds(geminiResponse.headers.get("retry-after")),
            });
          }
          if (!geminiResponse.body) {
            throw new GeminiCallError({
              message: "Gemini returned an empty response stream.",
              status: 502,
              kind: "invalid-response",
              retryable: true,
            });
          }

          let rawModelText = "";
          let streamedAnswer = "";
          await consumeGeminiSse(geminiResponse.body, (text) => {
            rawModelText += text;
            const partialAnswer = extractPartialJsonStringField(rawModelText, "answer");
            if (!partialAnswer) return;

            const scrubbed = scrubInternalIds(partialAnswer.value, validObjectIds);
            const safeLength = partialAnswer.complete
              ? scrubbed.length
              : Math.max(0, scrubbed.length - 48);
            const safeAnswer = scrubbed.slice(0, safeLength);

            if (safeAnswer.startsWith(streamedAnswer)) {
              const delta = safeAnswer.slice(streamedAnswer.length);
              if (delta) send("assistant.delta", { runId, text: delta });
            } else {
              send("assistant.replace", { runId, text: safeAnswer });
            }
            streamedAnswer = safeAnswer;
          });

          if (!rawModelText.trim()) {
            throw new GeminiCallError({
              message: "Gemini returned an empty response.",
              status: 502,
              kind: "invalid-response",
              retryable: true,
            });
          }
          const parsed = parseJsonResponse<CanvasAIModelResponse>(rawModelText);
          const rawAnswer =
            typeof parsed.answer === "string" && parsed.answer.trim()
              ? parsed.answer.trim()
              : "I could not produce a grounded answer from the current canvas context.";
          const finalAnswer = scrubInternalIds(rawAnswer, validObjectIds);

          if (directInspectionActivity) {
            send("tool.completed", {
              runId,
              stepId: directInspectionActivity.id,
              tool: directInspectionActivity.tool,
              detail: directInspectionActivity.detail,
              objectIds: directInspectionActivity.objectIds,
              ok: true,
            });
            send("step.completed", {
              runId,
              stepId: directInspectionActivity.id,
              detail: directInspectionActivity.detail,
              objectIds: directInspectionActivity.objectIds,
            });
          }

          const showSuggestedActions = parsed.showSuggestedActions === true;
          const updatedConversationSummary =
            typeof parsed.conversationSummary === "string"
              ? scrubInternalIds(
                  parsed.conversationSummary.slice(0, MAX_CONVERSATION_SUMMARY_LENGTH),
                  validObjectIds,
                )
              : scrubInternalIds(conversationSummary, validObjectIds);

          send("assistant.final", {
            runId,
            answer: finalAnswer,
            references: sanitizeReferences(parsed.references, validObjectIds),
            suggestedActions: showSuggestedActions
              ? sanitizeSuggestedActions(parsed.suggestedActions, validObjectIds)
              : [],
            showSuggestedActions,
            conversationSummary: updatedConversationSummary,
            meta: {
              model: GEMINI_MODEL,
              contextMode,
              interactionFocus: planner.focus,
              runMode: planner.mode,
              completedToolCount: toolResults.filter((result) => result.ok).length,
              attachedVisualCount: allVisualParts.filter((part) => "inlineData" in part).length,
              recentHistoryCount: history.length,
              intentKind: semanticIntent.kind,
              requiresTools: semanticIntent.requiresTools,
              requiredDataTool: intentNeedsDataTool(semanticIntent),
              requiredCanvasAction: intentNeedsCanvasAction(semanticIntent),
              plannedStepCount: planner.steps.length,
            },
          });
          send("run.completed", { runId, mode: planner.mode });
          close();
        } catch (error) {
          if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
            send("run.cancelled", { runId });
            close();
            return;
          }
          console.error("North Star canvas run failed:", error);
          const safeMessage = error instanceof GeminiCallError
            ? summarizeGeminiFailure(error)
            : verifiedProgress
              ? `Northstar could not complete the full solution in this run. The verified research and latest valid live artifact remain available at the latest checkpoint. No generic fallback was presented as finished work.

${error instanceof Error ? error.message : "The run ended before the current agentic step completed."}`
              : `Northstar could not start the requested work. Nothing was changed.

${error instanceof Error ? error.message : "The run could not be completed."}`;
          send("run.failed", { runId, error: safeMessage });
          send("error", { runId, error: safeMessage });
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
