// lib/canvas-ai/northstar-tool-registry.ts
// Northstar v87.3 — unified semantic visual composition and scene-transaction registry

export const CANVAS_INSPECTION_TOOL_NAMES = [
  "inspect_canvas_overview",
  "inspect_selection",
  "inspect_flow_artifacts",
  "inspect_relationships",
  "inspect_spatial_layout",
  "inspect_text_content",
  "find_relevant_objects",
  "inspect_object_capabilities",
] as const;

export const NORTHSTAR_DATA_TOOL_NAMES = [
  "list_available_apps",
  "get_app_details",
  "list_app_flows",
  "search_app_flows",
  "get_flow_details",
  "get_flow_screenshots",
  "search_screenshots",
  "get_screenshot",
  "get_app_icon",
  "prepare_composition_evidence",
] as const;

export const CANVAS_ACTION_TOOL_NAMES = [
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
] as const;

export const NORTHSTAR_AGENT_TOOL_NAMES = [
  ...CANVAS_INSPECTION_TOOL_NAMES,
  ...NORTHSTAR_DATA_TOOL_NAMES,
  ...CANVAS_ACTION_TOOL_NAMES,
] as const;

export type CanvasInspectionToolName =
  (typeof CANVAS_INSPECTION_TOOL_NAMES)[number];
export type NorthStarDataToolName =
  (typeof NORTHSTAR_DATA_TOOL_NAMES)[number];
export type CanvasActionToolName =
  (typeof CANVAS_ACTION_TOOL_NAMES)[number];
export type NorthStarAgentToolName =
  (typeof NORTHSTAR_AGENT_TOOL_NAMES)[number];

export type NorthStarShapeKind =
  | "rect"
  | "ellipse"
  | "circle"
  | "diamond"
  | "triangle"
  | "pill"
  | "callout"
  | "card"
  | "frame";

export type NorthStarToolArguments = {
  appName?: string;
  appNames?: string[];
  flowName?: string;
  query?: string;
  screenshotId?: string;
  platform?: "mobile" | "web";
  sessionType?: "onboarding" | "browsing";
  limit?: number;
  maxApps?: number;
  maxFlowsPerApp?: number;
  maxScreensPerFlow?: number;
  selectionStrategy?: "representative" | "coverage" | "diverse";

  shape?: NorthStarShapeKind;
  componentPreset?: "section" | "flow-lane" | "reference-flow" | "insight-card" | "evidence-card" | "metric-card" | "decision-card" | "matrix" | "chart" | "timeline" | "research-region";
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
  textAlign?: "left" | "center" | "right";
  scale?: number;
  rotation?: number;
  rotationDelta?: number;
  preserveAspectRatio?: boolean;
  copyCount?: number;
  layout?: "horizontal" | "vertical" | "grid";
  gap?: number;
  columns?: number;
  connectorKind?: "straight" | "curved" | "elbow";
  connectorEnd?: "none" | "arrow";
  connectorDash?: "solid" | "dashed" | "dotted";
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
  canonicalFlowIds?: string[];
  resumePhase?: "research" | "review" | "blueprint" | "building" | "completed" | "failed";
  workingNotesJson?: string;
  workingNoteJson?: string;
  workspacePlanJson?: string;
  replaceExisting?: boolean;
  sectionJson?: string;
  sectionIndex?: number;
  totalSections?: number;
  maxVisibleEvidence?: number;
  visualBoardJson?: string;
};

export type NorthStarToolResultItem = {
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
};

export type NorthStarToolResultView = {
  kind: "apps" | "app" | "flows" | "flow" | "screenshots" | "screenshot";
  title: string;
  items: NorthStarToolResultItem[];
  emptyMessage?: string;
};

export type NorthStarToolRegistryEntry = {
  name: NorthStarAgentToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: "read-only" | "reversible-write";
  executionType: "local-context" | "server-data" | "client-canvas";
  requiresApproval: boolean;
  resultKind?: NorthStarToolResultView["kind"];
};

const querySchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    limit: { type: "number" },
  },
} as const;

const canvasActionBase = {
  riskLevel: "reversible-write" as const,
  executionType: "client-canvas" as const,
  requiresApproval: false,
};

export const NORTHSTAR_TOOL_REGISTRY: Record<
  NorthStarAgentToolName,
  NorthStarToolRegistryEntry
> = {
  inspect_canvas_overview: {
    name: "inspect_canvas_overview",
    description: "Inspect canvas counts, summary, viewport, and representative objects.",
    inputSchema: { type: "object", properties: {} },
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  inspect_selection: {
    name: "inspect_selection",
    description: "Inspect the current selection, nearby objects, and connected objects.",
    inputSchema: { type: "object", properties: {} },
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  inspect_flow_artifacts: {
    name: "inspect_flow_artifacts",
    description: "Inspect app-flow artifacts already present on the canvas.",
    inputSchema: { type: "object", properties: {} },
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  inspect_relationships: {
    name: "inspect_relationships",
    description: "Inspect connector bindings, overlaps, proximity, and alignment relationships.",
    inputSchema: { type: "object", properties: {} },
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  inspect_spatial_layout: {
    name: "inspect_spatial_layout",
    description: "Inspect exact positions, sizes, rotations, and ordering of canvas objects.",
    inputSchema: { type: "object", properties: {} },
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  inspect_text_content: {
    name: "inspect_text_content",
    description: "Read text, notes, cards, and text-bearing shapes on the canvas.",
    inputSchema: { type: "object", properties: {} },
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  find_relevant_objects: {
    name: "find_relevant_objects",
    description: "Find canvas objects that match a concise human semantic reference such as \"the circle\" or \"the Awin screenshot\".",
    inputSchema: querySchema,
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  inspect_object_capabilities: {
    name: "inspect_object_capabilities",
    description: "Inspect which operations are supported for relevant objects.",
    inputSchema: { type: "object", properties: {} },
    riskLevel: "read-only",
    executionType: "local-context",
    requiresApproval: false,
  },
  list_available_apps: {
    name: "list_available_apps",
    description: "List the apps available in the signed-in user's North Star account.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "apps",
  },
  get_app_details: {
    name: "get_app_details",
    description: "Retrieve one app's icon, category, metadata, flow count, and screen count.",
    inputSchema: {
      type: "object",
      properties: { appName: { type: "string" } },
      required: ["appName"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "app",
  },
  list_app_flows: {
    name: "list_app_flows",
    description: "List captured onboarding and browsing flows for a specific app.",
    inputSchema: {
      type: "object",
      properties: {
        appName: { type: "string" },
        sessionType: { type: "string", enum: ["onboarding", "browsing"] },
        platform: { type: "string", enum: ["mobile", "web"] },
        limit: { type: "number" },
      },
      required: ["appName"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "flows",
  },
  search_app_flows: {
    name: "search_app_flows",
    description: "Search flow names and descriptions across the user's available apps.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        appName: { type: "string" },
        sessionType: { type: "string", enum: ["onboarding", "browsing"] },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "flows",
  },
  get_flow_details: {
    name: "get_flow_details",
    description: "Retrieve one captured flow with its metadata and representative screenshots.",
    inputSchema: {
      type: "object",
      properties: { appName: { type: "string" }, flowName: { type: "string" } },
      required: ["appName", "flowName"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "flow",
  },
  get_flow_screenshots: {
    name: "get_flow_screenshots",
    description: "Retrieve the ordered screenshots belonging to a captured app flow.",
    inputSchema: {
      type: "object",
      properties: {
        appName: { type: "string" },
        flowName: { type: "string" },
        limit: { type: "number" },
      },
      required: ["appName", "flowName"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "screenshots",
  },
  search_screenshots: {
    name: "search_screenshots",
    description: "Search screenshot labels and flow metadata across available apps.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        appName: { type: "string" },
        flowName: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "screenshots",
  },
  get_screenshot: {
    name: "get_screenshot",
    description: "Retrieve one exact screenshot by its result identifier or a precise query.",
    inputSchema: {
      type: "object",
      properties: {
        screenshotId: { type: "string" },
        query: { type: "string" },
        appName: { type: "string" },
        flowName: { type: "string" },
      },
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "screenshot",
  },
  get_app_icon: {
    name: "get_app_icon",
    description: "Retrieve the icon for a specific app available in the account.",
    inputSchema: {
      type: "object",
      properties: { appName: { type: "string" } },
      required: ["appName"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "app",
  },

  prepare_composition_evidence: {
    name: "prepare_composition_evidence",
    description: "Curate a diverse, grounded set of apps, flows, and representative screenshots for a complex visual composition.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        appName: { type: "string" },
        appNames: { type: "array", items: { type: "string" } },
        sessionType: { type: "string", enum: ["onboarding", "browsing"] },
        platform: { type: "string", enum: ["mobile", "web"] },
        limit: { type: "number" },
        maxApps: { type: "number" },
        maxFlowsPerApp: { type: "number" },
        maxScreensPerFlow: { type: "number" },
        selectionStrategy: { type: "string", enum: ["representative", "coverage", "diverse"] },
      },
      required: ["query"],
    },
    riskLevel: "read-only",
    executionType: "server-data",
    requiresApproval: false,
    resultKind: "screenshots",
  },
  create_shape: {
    name: "create_shape",
    description: "Create one reversible shape on the canvas at a visible location.",
    inputSchema: {
      type: "object",
      properties: {
        shape: {
          type: "string",
          enum: ["rect", "ellipse", "circle", "diamond", "triangle", "pill", "callout", "card", "frame"],
        },
        text: { type: "string" },
        resultKey: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        offsetX: { type: "number" },
        offsetY: { type: "number" },
        fill: { type: "string" },
        stroke: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["shape"],
    },
    ...canvasActionBase,
  },
  create_visual_component: {
    name: "create_visual_component",
    description: "Create a polished semantic visual component from editable canvas primitives. Humans and North Star use the same native components: sections, direct screenshot reference flows, research regions, matrices, charts, timelines, insights, evidence, metrics, and decisions.",
    inputSchema: {
      type: "object",
      properties: {
        componentPreset: {
          type: "string",
          enum: ["section", "flow-lane", "reference-flow", "insight-card", "evidence-card", "metric-card", "decision-card", "matrix", "chart", "timeline", "research-region"],
        },
        x: { type: "number" },
        y: { type: "number" },
        resultKey: { type: "string" },
      },
      required: ["componentPreset"],
    },
    ...canvasActionBase,
  },
  create_text: {
    name: "create_text",
    description: "Create editable text on the canvas.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        resultKey: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        fontSize: { type: "number" },
        textColor: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["text"],
    },
    ...canvasActionBase,
  },
  create_note: {
    name: "create_note",
    description: "Create an editable note on the canvas.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        resultKey: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        fill: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["text"],
    },
    ...canvasActionBase,
  },
  create_connector: {
    name: "create_connector",
    description: "Connect two existing or newly-created canvas objects with a bound connector.",
    inputSchema: {
      type: "object",
      properties: {
        fromResultKey: { type: "string" },
        toResultKey: { type: "string" },
        objectIds: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        fromQuery: { type: "string" },
        toQuery: { type: "string" },
        connectorKind: { type: "string", enum: ["straight", "curved", "elbow"] },
        connectorEnd: { type: "string", enum: ["none", "arrow"] },
        connectorDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
        stroke: { type: "string" },
        resultKey: { type: "string" },
      },
    },
    ...canvasActionBase,
  },
  insert_app_icon: {
    name: "insert_app_icon",
    description: "Insert a tenant-scoped North Star app icon onto the canvas.",
    inputSchema: {
      type: "object",
      properties: {
        appName: { type: "string" },
        resultKey: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["appName"],
    },
    ...canvasActionBase,
  },
  insert_screenshot: {
    name: "insert_screenshot",
    description: "Insert one tenant-scoped captured screenshot onto the canvas.",
    inputSchema: {
      type: "object",
      properties: {
        screenshotId: { type: "string" },
        query: { type: "string" },
        appName: { type: "string" },
        flowName: { type: "string" },
        resultKey: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
    },
    ...canvasActionBase,
  },
  insert_flow: {
    name: "insert_flow",
    description: "Insert a complete tenant-scoped app flow as a horizontal storyboard on the canvas.",
    inputSchema: {
      type: "object",
      properties: {
        appName: { type: "string" },
        flowName: { type: "string" },
        resultKey: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["appName", "flowName"],
    },
    ...canvasActionBase,
  },
  move_objects: {
    name: "move_objects",
    description: "Move selected or referenced objects by a reversible offset.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        offsetX: { type: "number" },
        offsetY: { type: "number" },
      },
    },
    ...canvasActionBase,
  },
  update_object_style: {
    name: "update_object_style",
    description: "Update the visual style of existing canvas objects without replacing them.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        fill: { type: "string" },
        stroke: { type: "string" },
        strokeWidth: { type: "number" },
        textColor: { type: "string" },
        fontSize: { type: "number" },
        fontWeight: { type: "number" },
        textAlign: { type: "string", enum: ["left", "center", "right"] },
        connectorKind: { type: "string", enum: ["straight", "curved", "elbow"] },
        connectorEnd: { type: "string", enum: ["none", "arrow"] },
        connectorDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
      },
    },
    ...canvasActionBase,
  },
  resize_objects: {
    name: "resize_objects",
    description: "Resize existing canvas objects while preserving captured screenshot proportions by default.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        scale: { type: "number" },
        preserveAspectRatio: { type: "boolean" },
      },
    },
    ...canvasActionBase,
  },
  rotate_objects: {
    name: "rotate_objects",
    description: "Rotate existing canvas objects by an absolute angle or a relative delta.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        rotation: { type: "number" },
        rotationDelta: { type: "number" },
      },
    },
    ...canvasActionBase,
  },
  update_text: {
    name: "update_text",
    description: "Replace the editable text inside an existing text-bearing canvas object.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        text: { type: "string" },
      },
      required: ["text"],
    },
    ...canvasActionBase,
  },
  duplicate_objects: {
    name: "duplicate_objects",
    description: "Duplicate existing canvas objects with a small visible offset.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        copyCount: { type: "number" },
        offsetX: { type: "number" },
        offsetY: { type: "number" },
        resultKey: { type: "string" },
      },
    },
    ...canvasActionBase,
  },
  delete_objects: {
    name: "delete_objects",
    description: "Delete explicitly selected or semantically resolved canvas objects as one reversible action.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
      },
    },
    ...canvasActionBase,
  },
  arrange_objects: {
    name: "arrange_objects",
    description: "Arrange existing canvas objects into a horizontal row, vertical stack, or grid.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        layout: { type: "string", enum: ["horizontal", "vertical", "grid"] },
        gap: { type: "number" },
        columns: { type: "number" },
      },
      required: ["layout"],
    },
    ...canvasActionBase,
  },

  create_working_surface: {
    name: "create_working_surface",
    description: "Create an inspectable North Star working surface containing objectives, questions, hypotheses, corrections, rejected directions, decisions, and the real screenshots studied during research.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        title: { type: "string" },
        workingNotesJson: { type: "string" },
        compositionJson: { type: "string" },
        workspacePlanJson: { type: "string" },
        replaceExisting: { type: "boolean" },
        workingVisibility: { type: "string", enum: ["visible", "compact", "hidden"] },
        executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
        resultKey: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["title", "workingNotesJson", "compositionJson"],
    },
    ...canvasActionBase,
  },
  update_working_surface: {
    name: "update_working_surface",
    description: "Evolve an inspectable North Star working surface by adding grounded evidence or by reorganizing the existing research according to a model-authored workspace plan. The model chooses the spatial structure; the tool reliably reconciles objects without duplicating evidence.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        workingNoteJson: { type: "string" },
        compositionJson: { type: "string" },
        workspacePlanJson: { type: "string" },
        replaceExisting: { type: "boolean" },
        resultKeys: { type: "array", items: { type: "string" } },
        resultKey: { type: "string" },
      },
      required: ["artifactId", "workingNoteJson"],
    },
    ...canvasActionBase,
  },
  create_artifact_shell: {
    name: "create_artifact_shell",
    description: "Create only the adaptive artifact frame, title, subtitle, and model-defined canvas bounds so the solution can be built visibly in later steps.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        artifactType: { type: "string", enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        compositionJson: { type: "string" },
        resultKey: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["artifactId", "artifactType", "title", "compositionJson"],
    },
    ...canvasActionBase,
  },
  add_artifact_section: {
    name: "add_artifact_section",
    description: "Add one grounded section to an existing artifact shell using the model-defined region, evidence layout, visual emphasis, and only screenshots that belong to that section's app and flow scope.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        artifactType: { type: "string", enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
        compositionJson: { type: "string" },
        sectionJson: { type: "string" },
        sectionIndex: { type: "number" },
        totalSections: { type: "number" },
        maxVisibleEvidence: { type: "number" },
        resultKey: { type: "string" },
      },
      required: ["artifactId", "compositionJson", "sectionJson", "sectionIndex", "totalSections"],
    },
    ...canvasActionBase,
  },
  add_artifact_summary: {
    name: "add_artifact_summary",
    description: "Add the grounded main takeaway or conclusion after the evidence sections have been visibly constructed.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        summary: { type: "string" },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
        compositionJson: { type: "string" },
        resultKey: { type: "string" },
      },
      required: ["artifactId", "summary", "compositionJson"],
    },
    ...canvasActionBase,
  },
  audit_artifact_semantics: {
    name: "audit_artifact_semantics",
    description: "Inspect the live artifact's actual canvas objects, verify screenshot provenance against each section, repair mismatched evidence when grounded alternatives exist, and fail closed when a requested subject is unsupported.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        compositionJson: { type: "string" },
        resultKeys: { type: "array", items: { type: "string" } },
        resultKey: { type: "string" },
      },
      required: ["artifactId", "compositionJson"],
    },
    ...canvasActionBase,
  },
  compose_artifact: {
    name: "compose_artifact",
    description: "Build a complete editable visual artifact from a structured composition specification and grounded North Star evidence.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        artifactType: { type: "string", enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] },
        executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        summary: { type: "string" },
        compositionJson: { type: "string" },
        maxVisibleEvidence: { type: "number" },
        resultKey: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["artifactType", "title", "compositionJson"],
    },
    ...canvasActionBase,
  },
  compose_visual_board: {
    name: "compose_visual_board",
    description: "Create or replace a coherent North Star visual scene from grounded evidence and a model-authored communication blueprint. The result is built from real editable canvas primitives—cards, text, screenshots, tables, chart marks, badges, and connectors—not a flattened board. The model chooses the story and modules; the renderer guarantees North Star craft and stable structure.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        artifactType: { type: "string", enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] },
        executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        summary: { type: "string" },
        compositionJson: { type: "string" },
        sessionType: { type: "string", enum: ["onboarding", "browsing"] },
        appNames: { type: "array", items: { type: "string" } },
        resultKey: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["artifactId", "title", "compositionJson"],
    },
    ...canvasActionBase,
  },
  compose_visual_scene: {
    name: "compose_visual_scene",
    description: "Compile a model-authored communication blueprint and grounded evidence into a coherent semantic scene made entirely from editable North Star primitives. The model chooses the problem-specific story and modules; no executive-summary, comparison, or dashboard template is mandatory.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        artifactType: { type: "string", enum: ["comparison-board", "journey-map", "screenshot-analysis", "strategy-board", "research-map", "roadmap", "causal-map", "storyboard", "dashboard", "operating-model", "market-map", "decision-tree", "design-board", "workflow", "product-concept", "freeform"] },
        executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        summary: { type: "string" },
        compositionJson: { type: "string" },
        sessionType: { type: "string", enum: ["onboarding", "browsing"] },
        appNames: { type: "array", items: { type: "string" } },
        resultKey: { type: "string" },
        placement: { type: "string", enum: ["center", "right-of-selection", "below-selection", "at-cursor"] },
      },
      required: ["artifactId", "title", "compositionJson"],
    },
    ...canvasActionBase,
  },
  validate_visual_board: {
    name: "validate_visual_board",
    description: "Validate the completed editable visual scene. Fail closed when evidence identity, ordered source material, required narrative content, populated modules, or stable primitive identities are missing.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        resultKeys: { type: "array", items: { type: "string" } },
        resultKey: { type: "string" },
      },
      required: ["artifactId"],
    },
    ...canvasActionBase,
  },

  review_artifact_layout: {
    name: "review_artifact_layout",
    description: "Run the fail-closed scene preflight on a generated artifact, repair safe containment or spacing issues, and reject completion when any top-level overlap, escaped content, invalid ownership, or missing root remains.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        resultKeys: { type: "array", items: { type: "string" } },
        executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
        resultKey: { type: "string" },
      },
    },
    ...canvasActionBase,
  },
  refine_artifact_presentation: {
    name: "refine_artifact_presentation",
    description: "Simplify and polish a generated artifact by improving hierarchy, reducing density, resizing evidence, and making the main takeaway easier to digest.",
    inputSchema: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        resultKeys: { type: "array", items: { type: "string" } },
        executionDepth: { type: "string", enum: ["quick", "balanced", "deep"] },
        audience: { type: "string", enum: ["general", "executive", "product", "design", "research", "operations", "sales", "marketing"] },
        workingVisibility: { type: "string", enum: ["visible", "compact", "hidden"] },
        resultKey: { type: "string" },
      },
    },
    ...canvasActionBase,
  },
  align_objects: {
    name: "align_objects",
    description: "Align selected or referenced objects to a shared edge or center.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        alignment: { type: "string", enum: ["left", "center", "right", "top", "middle", "bottom"] },
      },
      required: ["alignment"],
    },
    ...canvasActionBase,
  },
  distribute_objects: {
    name: "distribute_objects",
    description: "Distribute three or more selected or referenced objects evenly.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
        axis: { type: "string", enum: ["horizontal", "vertical"] },
      },
      required: ["axis"],
    },
    ...canvasActionBase,
  },
  select_objects: {
    name: "select_objects",
    description: "Select referenced or newly-created canvas objects.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
      },
    },
    ...canvasActionBase,
  },
  focus_objects: {
    name: "focus_objects",
    description: "Center referenced or newly-created objects in the current viewport without changing zoom.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        resultKeys: { type: "array", items: { type: "string" } },
        targetQuery: { type: "string" },
      },
    },
    ...canvasActionBase,
  },
};

export function isCanvasActionTool(
  name: NorthStarAgentToolName,
): name is CanvasActionToolName {
  return (CANVAS_ACTION_TOOL_NAMES as readonly string[]).includes(name);
}

const TOOL_DECISION_GUIDANCE: Partial<
  Record<
    NorthStarAgentToolName,
    {
      useWhen: string;
      avoidWhen?: string;
      returns?: string;
      usuallyFollowedBy?: string;
    }
  >
> = {
  inspect_canvas_overview: {
    useWhen: "The user asks what is on the whole canvas, requests a canvas-wide diagnosis, or a later action needs a broad inventory.",
    avoidWhen: "The user is discussing an attachment, North Star account data, or general ideas without asking about the canvas.",
    returns: "Canvas summary, counts, viewport information, and representative objects.",
  },
  inspect_selection: {
    useWhen: "The current selection is the explicit subject, including requests such as 'what is selected?' or 'change these'.",
    avoidWhen: "Nothing is selected or the user asks about the entire canvas.",
    returns: "Selected objects plus connected and nearby context.",
  },
  inspect_flow_artifacts: {
    useWhen: "The user asks about app-flow storyboards that are already placed on the canvas.",
    avoidWhen: "The requested flow exists only in North Star data and has not been inserted.",
    returns: "Existing semantic flow artifacts and their screenshot rows.",
  },
  inspect_relationships: {
    useWhen: "The question concerns connectors, overlaps, proximity, attachment, or alignment between canvas objects.",
    returns: "Connector bindings and spatial relationships.",
  },
  inspect_spatial_layout: {
    useWhen: "Exact canvas positions, dimensions, rotation, ordering, spacing, or layout are needed.",
    returns: "Precise spatial data for visible canvas objects.",
  },
  inspect_text_content: {
    useWhen: "The user wants text, notes, labels, cards, or copy already present on the canvas read or summarized.",
    returns: "Text-bearing canvas content.",
  },
  find_relevant_objects: {
    useWhen: "The user refers semantically to existing canvas content, for example 'the circle', 'the signup screens', or 'the blue note'.",
    avoidWhen: "The target is a tenant app, captured flow, or screenshot that is not yet on the canvas. Never pass the full user command as query; use a concise noun phrase.",
    returns: "Existing canvas objects matching a concise semantic reference, with real object IDs for the next action.",
  },
  inspect_object_capabilities: {
    useWhen: "A requested edit depends on knowing whether selected or relevant objects support that operation.",
    returns: "Supported edit and interaction capabilities.",
  },

  list_available_apps: {
    useWhen: "The user asks which apps are available in the account or wants a broad app inventory.",
    avoidWhen: "A specific app is already named and the user wants details, flows, screens, or its icon.",
    returns: "Tenant-scoped app summaries.",
    usuallyFollowedBy: "get_app_details or list_app_flows after the user chooses an app.",
  },
  get_app_details: {
    useWhen: "One app is known and the user asks for its metadata, category, flow count, screen count, or a concise overview.",
    avoidWhen: "The user only wants the app icon or a list of flows.",
    returns: "One exact app with metadata and counts.",
  },
  list_app_flows: {
    useWhen: "The app is known and the user wants its flows, especially with structured filters such as onboarding, browsing, mobile, web, or a requested count.",
    avoidWhen: "The app is unknown or the request is a semantic search across several apps.",
    returns: "Flows belonging to one app, filtered by sessionType/platform and limited to the requested count.",
    usuallyFollowedBy: "get_flow_details, get_flow_screenshots, insert_flow, or a user choice.",
  },
  search_app_flows: {
    useWhen: "The user describes a flow semantically, is unsure of its exact name, or wants matches across apps.",
    avoidWhen: "A known app plus simple onboarding/browsing listing can be handled precisely by list_app_flows.",
    returns: "Ranked flow matches.",
    usuallyFollowedBy: "get_flow_details, get_flow_screenshots, or insert_flow.",
  },
  get_flow_details: {
    useWhen: "The app and flow are known and the user wants one flow's description, metadata, screen count, representative screens, or North Star has autonomously selected that flow and should make the choice visible in activity.",
    avoidWhen: "The user specifically needs the complete ordered screenshot sequence without a separate flow-review step.",
    returns: "One exact flow with representative screenshots and an explicit, grounded record of the chosen flow.",
  },
  get_flow_screenshots: {
    useWhen: "The app and flow are known and the user wants ordered screens, one or more screens from that flow, or a screenshot must be selected before insertion. Use it as a visible selection step when North Star chooses a screenshot autonomously.",
    avoidWhen: "The flow is unknown; search, list, or explicitly review the chosen flow first.",
    returns: "The ordered screenshots for one exact flow, including the grounded screenshot that may be inserted next.",
    usuallyFollowedBy: "insert_screenshot when explicit canvas placement is requested.",
  },
  search_screenshots: {
    useWhen: "The user describes a screen by visible copy, purpose, or semantic meaning and the exact screenshot is not known.",
    avoidWhen: "The exact flow is already known and the user simply asks for any screen or the first N ordered screens; use get_flow_screenshots.",
    returns: "Ranked screenshot matches across the allowed app/flow scope.",
    usuallyFollowedBy: "get_screenshot or insert_screenshot.",
  },
  get_screenshot: {
    useWhen: "A precise screenshot result identifier or an exact, narrow screen query is available.",
    avoidWhen: "The user wants a broad search or an entire flow sequence.",
    returns: "One exact screenshot asset.",
  },
  get_app_icon: {
    useWhen: "The user explicitly asks to view, retrieve, or insert a known app's icon.",
    avoidWhen: "The request is about general app metadata or flows.",
    returns: "One tenant-scoped app icon asset.",
    usuallyFollowedBy: "insert_app_icon when canvas placement is explicit.",
  },

  prepare_composition_evidence: {
    useWhen: "A prompt requires a curated, prompt-scoped evidence set across one or more apps before analysis or visual authorship. Set the requested breadth explicitly; do not assume one flow per app.",
    avoidWhen: "The user only wants to browse raw flow or screenshot results in Chat, or a single exact asset is already known.",
    returns: "A grounded bundle of the requested apps, one or many selected flows per app, representative previews, complete bounded candidate sequences, and exact selected identities.",
    usuallyFollowedBy: "an analysis round, another bounded research round when gaps remain, or progressive visual authorship when the evidence is sufficient.",
  },
  create_shape: {
    useWhen: "The intended outcome is a newly created shape on the canvas, regardless of whether the request is formal, indirect, abbreviated, or colloquial.",
    avoidWhen: "The user is only discussing or describing a shape.",
    returns: "One newly created reversible canvas object and its resultKey mapping.",
  },
  create_text: {
    useWhen: "The user explicitly asks to add editable standalone text to the canvas.",
    returns: "One newly created editable text object.",
  },
  create_note: {
    useWhen: "The user explicitly asks to capture content as a note, annotation, or sticky-style canvas item.",
    returns: "One newly created editable note.",
  },
  create_connector: {
    useWhen: "The user asks to connect two existing or newly created canvas objects. Resolve existing endpoints by semantic description before dispatch.",
    avoidWhen: "Fewer than two distinct endpoints can be resolved safely.",
    returns: "One connector with both endpoints bound to verified canvas objects.",
  },
  insert_app_icon: {
    useWhen: "The user explicitly asks to put an app icon onto the canvas.",
    avoidWhen: "The user only asks to see or discuss the icon in chat.",
    returns: "A canvas image object preserving the app source metadata.",
  },
  insert_screenshot: {
    useWhen: "The intended outcome is a captured tenant screenshot becoming a canvas object. Infer that outcome semantically rather than from a fixed verb list.",
    avoidWhen: "The user only asks to show screenshots in chat or inspect one in the full-screen viewer.",
    returns: "A canvas screenshot object preserving app, flow, and screen metadata.",
  },
  insert_flow: {
    useWhen: "The user explicitly asks to place a complete captured flow/storyboard onto the canvas.",
    avoidWhen: "The user asks to browse flows in chat or insert only one screen.",
    returns: "A semantic, editable flow artifact containing labels, icon, and ordered screenshots.",
  },
  move_objects: {
    useWhen: "The user explicitly asks to reposition selected, existing, or newly created objects.",
    returns: "The same objects at new positions.",
  },
  update_object_style: {
    useWhen: "The user asks to change fill, border, typography, or connector appearance on existing canvas objects.",
    avoidWhen: "The request is only asking what an object looks like; inspect instead.",
    returns: "The same resolved objects with updated style properties.",
  },
  resize_objects: {
    useWhen: "The user asks to make existing objects larger, smaller, equal-sized, or set exact dimensions.",
    returns: "The resized objects. Captured North Star screenshots preserve aspect ratio unless freeform resizing is explicit.",
  },
  rotate_objects: {
    useWhen: "The user asks to rotate one or more existing canvas objects.",
    returns: "The same objects with updated rotation.",
  },
  update_text: {
    useWhen: "The user asks to rename, rewrite, shorten, or replace text inside an existing editable object.",
    avoidWhen: "The target is an image, screenshot, table, or non-editable flow header.",
    returns: "The same text-bearing object with new editable content.",
  },
  duplicate_objects: {
    useWhen: "The user asks to copy or duplicate existing objects.",
    returns: "New reversible object copies with preserved source and semantic metadata.",
  },
  delete_objects: {
    useWhen: "The user explicitly asks to remove one or more selected or semantically identified canvas objects. Resolve the target first, then delete it as an undoable action.",
    avoidWhen: "The request is ambiguous, the target cannot be resolved, or it asks to clear a broad area/the whole canvas without a dedicated confirmation flow.",
    returns: "The verified IDs of the removed objects; connectors attached only to removed endpoints are cleaned up with them.",
  },
  arrange_objects: {
    useWhen: "The user asks to organize existing objects into a row, stack, or grid.",
    returns: "The resolved objects repositioned into the requested layout.",
  },
  create_working_surface: {
    useWhen: "A complex multi-step composition benefits from visible research, assumptions, evidence, checkpoints, or alternative ideas that the user can inspect.",
    avoidWhen: "The request is a simple atomic canvas edit or a short factual lookup.",
    returns: "An inspectable working surface placed in a reserved non-overlapping canvas region and linked to the run's artifactId.",
    usuallyFollowedBy: "create_artifact_shell after enough grounded evidence has been gathered.",
  },
  update_working_surface: {
    useWhen: "A long-running composition reaches a meaningful discovery or when the model decides the research workspace should be reorganized as its understanding changes.",
    returns: "An evolved, model-authored research surface whose regions remain spatially separated, readable, and distinct from the final presentation.",
  },
  create_artifact_shell: {
    useWhen: "A complex artifact should appear progressively rather than as one bulk canvas mutation.",
    returns: "The empty presentation frame, title, subtitle, and a reserved presentation region that cannot collide with the working surface or existing canvas work.",
    usuallyFollowedBy: "one add_artifact_section action per model-defined region.",
  },
  add_artifact_section: {
    useWhen: "One grounded section of an artifact is ready to be placed visibly. Use exact app-scoped evidence and never borrow another app's screenshot as fallback.",
    returns: "One complete editable artifact section placed in a safe non-overlapping region while preserving the model's intended hierarchy and evidence structure.",
    usuallyFollowedBy: "audit_artifact_semantics after all required sections are present.",
  },
  add_artifact_summary: {
    useWhen: "The evidence sections are present and a concise supported takeaway should be added.",
    returns: "The editable main takeaway block for the artifact.",
  },
  audit_artifact_semantics: {
    useWhen: "Before completion, especially for comparisons, verify the actual live canvas evidence belongs to the app, flow, or subject named by each section.",
    returns: "A provenance audit, any real repairs made on the canvas, and a failure when required evidence cannot be grounded.",
    usuallyFollowedBy: "review_artifact_layout only after semantic verification passes.",
  },
  compose_artifact: {
    useWhen: "The user asks North Star to solve a broader problem by building a comparison, journey, analysis board, strategy board, or other complete editable canvas deliverable.",
    avoidWhen: "A single atomic v79 action fully satisfies the request.",
    returns: "A complete editable artifact with semantic roles, grounded evidence, headings, insights, and a deliberate problem-specific layout.",
    usuallyFollowedBy: "review_artifact_layout and refine_artifact_presentation.",
  },
  review_artifact_layout: {
    useWhen: "A generated artifact must be checked against the committed live canvas for collisions, hidden content, surface overlap, aspect-ratio errors, missing sections, spacing, and structural completeness.",
    returns: "The same artifact after blocking presentation-quality corrections. The step fails instead of publishing when major collisions or working/presentation overlap remain.",
    usuallyFollowedBy: "refine_artifact_presentation and a final presentation-ready review.",
  },
  refine_artifact_presentation: {
    useWhen: "The artifact needs a final clarity pass: stronger hierarchy, lower information density, clearer evidence, and a more audience-appropriate presentation.",
    returns: "A simplified, polished artifact that still satisfies the non-overlap and surface-separation quality floor before completion.",
  },
  align_objects: {
    useWhen: "Two or more resolved objects should share a requested edge or center line.",
    returns: "The aligned objects.",
  },
  distribute_objects: {
    useWhen: "Three or more resolved objects should be spaced evenly on an axis.",
    returns: "The evenly distributed objects.",
  },
  select_objects: {
    useWhen: "Selection improves the immediate workflow after creation, lookup, or a direct selection request.",
    avoidWhen: "Selection would add no value; this step is optional.",
    returns: "An updated canvas selection.",
  },
  focus_objects: {
    useWhen: "The user needs newly inserted or resolved objects brought into view after an action.",
    avoidWhen: "The objects are already clearly visible; this step is optional.",
    returns: "The viewport centered on the resolved objects without changing their content.",
  },
};

const NORTHSTAR_DATA_MODEL_GUIDANCE = `
North Star data model and tool choreography:
- The tenant data hierarchy is App -> Flow -> ordered Screenshots. App icons belong to Apps.
- Data tools are read-only. Canvas action tools are reversible client-side writes.
- A tool result may be used as the asset source for a later insertion action.
- Distinguish read-only presentation from canvas mutation by intended outcome, not by a fixed vocabulary. Requests to browse or inspect data in Chat use read-only tools; requests whose desired result is a changed canvas use action tools.
- For a known app plus onboarding/browsing/platform filters, prefer list_app_flows over semantic search.
- For an exact known flow, prefer get_flow_screenshots over search_screenshots when the user wants any screen, the first screen, or an ordered subset.
- Use search_app_flows or search_screenshots when names are uncertain or the request is semantic.
- Keep structured arguments clean. Put app names in appName, flow names in flowName, onboarding/browsing in sessionType, mobile/web in platform, and requested quantity in limit. Do not copy the full conversational sentence into query when structured fields already express the request.
- Respect requested quantities. "Two flows" must normally set limit: 2, not return a broad list and summarize two afterward.
- When a known app is named, scope all flow and screenshot tools to that app so unrelated tenant apps never appear in the same result set.
- Interpret formal wording, slang, shorthand, indirect phrasing, and elliptical follow-ups through the same semantic intent model. Exact words are examples, never the interface contract.
- Prior structured result cards are authoritative conversational state. Pronouns and references such as "it", "that", "one of those", "them", "the flows", and "show me here" resolve to the most recent compatible app/flow/screenshot result set unless the user changes subject.
- A request to see apps, flows, or screenshots in Chat must execute the corresponding read-only data tool so the interface can render real result cards. Never replace tool-backed entities with fabricated or prose-only lists.
- The LLM planner determines semantic intent. Deterministic code validates tool availability, scope, limits, argument shape, and action safety; it must not become a synonym-based intent router.
- Never inspect the canvas simply because the user is in the canvas workspace.
- Never insert an asset merely because it was retrieved. Retrieval and canvas mutation are separate intents.
- Existing canvas objects are addressed semantically. Use concise noun phrases in targetQuery and fromQuery/toQuery, such as "the circle" or "the Awin screenshot". Never copy an entire edit command into an object-query field. Inspection tools resolve those descriptions to real object IDs before mutation.
- For any edit, connection, resize, rewrite, duplication, deletion, or arrangement of existing objects, inspect or find the targets first unless exact objectIds or same-run resultKeys are already available.
- When North Star is asked to choose an app, flow, or screenshot on the user's behalf, the activity timeline must expose the real grounded choice: retrieve or review the chosen flow, retrieve the chosen screenshot, then perform the canvas action. Do not skip directly from an app list to insertion.
- User-facing completion language should name the real semantic subject and applied change, such as "I changed the circle to yellow", while technical object counts remain confined to activity details.
- Canvas action success is not established by planning or dispatch. It is successful only after the client reports created/updated object IDs.
- Semantic intent classification and tool planning are separate stages. A tool-required intent may never silently collapse into ordinary conversation.
- Tenant-data claims require a successful tenant-data resultView in the same run. A model must never invent substitute app, flow, screenshot, or icon names.
- Canvas mutation claims require a dispatched action plus client-side verification. If no action event or no object IDs are returned, the truthful result is failure.
- Planner, tool, and action failures are user-visible execution failures—not invitations for the conversational model to improvise.
`.trim();

function formatToolForPrompt(name: NorthStarAgentToolName): string {
  const tool = NORTHSTAR_TOOL_REGISTRY[name];
  const guidance = TOOL_DECISION_GUIDANCE[name];
  const tags = [
    tool.executionType,
    tool.riskLevel,
    tool.resultKind ? `returns:${tool.resultKind}` : undefined,
  ].filter(Boolean).join(", ");

  const lines = [`- ${tool.name} [${tags}]: ${tool.description}`];
  if (guidance?.useWhen) lines.push(`  Use when: ${guidance.useWhen}`);
  if (guidance?.avoidWhen) lines.push(`  Avoid when: ${guidance.avoidWhen}`);
  if (guidance?.returns) lines.push(`  Output: ${guidance.returns}`);
  if (guidance?.usuallyFollowedBy) lines.push(`  Common next step: ${guidance.usuallyFollowedBy}`);
  return lines.join("\n");
}

export function getToolRegistryPromptSummary(): string {
  const groups: Array<{ title: string; names: readonly NorthStarAgentToolName[] }> = [
    { title: "Canvas inspection tools", names: CANVAS_INSPECTION_TOOL_NAMES },
    { title: "Tenant-scoped North Star data tools", names: NORTHSTAR_DATA_TOOL_NAMES },
    { title: "Reversible canvas action tools", names: CANVAS_ACTION_TOOL_NAMES },
  ];

  return [
    NORTHSTAR_DATA_MODEL_GUIDANCE,
    ...groups.flatMap((group) => [
      `\n${group.title}:`,
      ...group.names.map((name) => formatToolForPrompt(name)),
    ]),
  ].join("\n");
}


export function getNorthstarDataToolPromptSummary(): string {
  const researchRules = `Prompt-grounded Northstar research contract:
- The user's prompt owns the subject, scope, quantities, comparison set, evidence depth, and whether the answer should change the artboard. Never hard-code apps, flows, counts, or a one-flow-per-app policy.
- Research may require several bounded activities. Each activity should close one evidence gap and commit its grounded result before the next decision.
- Use list/search tools to discover identities. Use exact get_* tools only when every required exact argument is present. Never use placeholders such as \"the requested flow\".
- prepare_composition_evidence is a deterministic curator, not a fixed answer. Set maxApps, maxFlowsPerApp, maxScreensPerFlow, selectionStrategy, sessionType, platform, and limit from the prompt and current evidence needs.
- selectionStrategy representative favors concise decisive flows; coverage preserves broader requested breadth; diverse favors variation across flow names, platforms, and session types.
- Prior attempt evidence is authoritative. Exact identities live in attempts[].evidence.toolCalls[].result.data and selectedFlowIdentity. Use those exact values in later activities.
- Visual research is bounded per model turn, not per user objective. If the prompt needs more screenshots than one turn can inspect, preserve the full candidateScreenshotIds set, schedule additional analysis activities using exact get_screenshot calls, and track analyzedScreenshotIds plus remainingScreenshotIds. Never silently narrow the user's requested coverage to the attachment limit.
- An empty or failed exact lookup is a correctable research-plan error. Change strategy by listing/searching or broadening scope; do not repeat unchanged input.
- For a non-artboard question, finish with a grounded answer and never create visual work. For an artboard objective, continue research and analysis only until the requested artifact can be authored truthfully, then schedule progressive artboard-mutation activities and verification.`;

  return [
    researchRules,
    ...NORTHSTAR_DATA_TOOL_NAMES.map((name) => {
      const tool = NORTHSTAR_TOOL_REGISTRY[name];
      const guidance = TOOL_DECISION_GUIDANCE[name];
      return [
        `- ${name}: ${tool.description}`,
        `  inputSchema: ${JSON.stringify(tool.inputSchema)}`,
        guidance?.useWhen ? `  useWhen: ${guidance.useWhen}` : undefined,
        guidance?.avoidWhen ? `  avoidWhen: ${guidance.avoidWhen}` : undefined,
        guidance?.returns ? `  returns: ${guidance.returns}` : undefined,
      ].filter(Boolean).join("\n");
    }),
  ].join("\n");
}
