// lib/canvas-ai/northstar-design-system.ts
// Northstar Canvas vNext — shared human/agent design tokens, component presets, and visual contracts.

export type NorthStarCanvasDensity = "compact" | "balanced" | "expanded";
export type NorthStarCanvasTone =
  | "neutral"
  | "violet"
  | "blue"
  | "green"
  | "orange"
  | "amber"
  | "rose"
  | "ink";
export type NorthStarRadiusMode = "none" | "sharp" | "subtle" | "soft" | "pill";
export type NorthStarLayoutMode = "freeform" | "stack" | "row" | "grid" | "lane" | "matrix" | "timeline";

export const NORTHSTAR_COMPONENT_PRESET_IDS = [
  "section",
  "flow-lane",
  "reference-flow",
  "evidence-strip",
  "evidence-card",
  "insight-card",
  "metric-card",
  "decision-card",
  "recommendation-block",
  "comparison-matrix",
  "matrix",
  "stage-map",
  "tradeoff-panel",
  "research-trail",
  "source-ledger",
  "hypothesis-panel",
  "executive-summary",
  "scorecard",
  "chart",
  "timeline",
  "research-region",
  "product-concept",
  "annotation-callout",
] as const;

export type NorthStarComponentPreset = (typeof NORTHSTAR_COMPONENT_PRESET_IDS)[number];

export type NorthStarCanvasPrimitiveKind =
  | "frame"
  | "card"
  | "text"
  | "image"
  | "table"
  | "connector"
  | "shape"
  | "badge"
  | "divider"
  | "icon"
  | "chart"
  | "group";

export interface NorthStarComponentContract {
  preset: NorthStarComponentPreset;
  label: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  layoutMode: NorthStarLayoutMode;
  defaultDensity: NorthStarCanvasDensity;
  tone: NorthStarCanvasTone;
  radiusMode: NorthStarRadiusMode;
  primitiveChildren: NorthStarCanvasPrimitiveKind[];
  supportsEvidence: boolean;
  supportsDataBinding: boolean;
  supportsResizeReflow: boolean;
  supportsHumanDrag: boolean;
  supportsAgentCreate: boolean;
  visualRules: string[];
}

export const NORTHSTAR_CANVAS_DESIGN_TOKENS = {
  color: {
    ink: "#10121D",
    inkSoft: "#303343",
    muted: "#717789",
    faint: "#9DA2B3",
    line: "#E5E4EF",
    lineStrong: "#D9D6EA",
    canvas: "#F7F7FD",
    surface: "#FFFFFF",
    surfaceSubtle: "#FBFAFF",
    surfaceLavender: "#F4F0FF",
    surfaceBlue: "#EEF4FF",
    surfaceGreen: "#ECFAF1",
    surfaceOrange: "#FFF2E9",
    surfaceAmber: "#FFF9E8",
    surfaceRose: "#FFF1F5",
    violet: "#6B5CFF",
    violetStrong: "#4D3CFA",
    blue: "#386DFF",
    green: "#20A45B",
    orange: "#FF6B2C",
    amber: "#F4B942",
    rose: "#F04472",
    white: "#FFFFFF",
  },
  radius: {
    none: 0,
    sharp: 2,
    subtle: 8,
    soft: 18,
    panel: 26,
    pill: 999,
  },
  shadow: {
    none: "none",
    hairline: "0 1px 0 rgba(16, 18, 29, 0.04)",
    soft: "0 16px 44px rgba(35, 30, 78, 0.08)",
    lifted: "0 28px 90px rgba(38, 31, 92, 0.16)",
  },
  type: {
    eyebrow: { fontSize: 10, lineHeight: 12, fontWeight: 850, letterSpacing: "0.12em" },
    caption: { fontSize: 11, lineHeight: 15, fontWeight: 650, letterSpacing: "-0.01em" },
    body: { fontSize: 13, lineHeight: 18, fontWeight: 560, letterSpacing: "-0.018em" },
    bodyStrong: { fontSize: 13, lineHeight: 18, fontWeight: 750, letterSpacing: "-0.02em" },
    title: { fontSize: 22, lineHeight: 26, fontWeight: 900, letterSpacing: "-0.04em" },
    headline: { fontSize: 34, lineHeight: 38, fontWeight: 900, letterSpacing: "-0.055em" },
    hero: { fontSize: 48, lineHeight: 52, fontWeight: 900, letterSpacing: "-0.065em" },
  },
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },
  stage: {
    awareness: "#6B5CFF",
    consideration: "#386DFF",
    action: "#20A45B",
    verification: "#FF6B2C",
    retention: "#8A63D2",
  },
} as const;

export const NORTHSTAR_CANVAS_GLOBAL_VISUAL_RULES = [
  "Build one coherent evidence-backed artifact unless the user explicitly asks for separate boards.",
  "The main takeaway must be readable in less than three seconds at the default zoom.",
  "Use progressive disclosure: executive answer first, evidence and reasoning close enough to inspect, never an unstructured scratchpad dump.",
  "Every created object must remain native, editable, movable, selectable, resizable, restylable, and deletable.",
  "Prefer semantic components over coordinate-dumped primitive piles; primitives are children of components, not the plan itself.",
  "Never flatten a finished artifact into one image. Use editable primitives and preserve evidence provenance.",
  "Do not give every element the same rounded card style. Choose radius, grid, editorial, diagram, or dense-table treatments according to the problem.",
  "No clipping, smudged images, orphan labels, unreadable text, accidental overlaps, broken containment, or off-canvas children may ship.",
  "Screenshots that support claims must be large enough to understand or moved to a clearly labeled evidence layer.",
  "A comparison must compare equivalent stages or explicitly label the asymmetry.",
] as const;

const commonRules = [
  "Use stable semantic roles so the user and North Star can edit the component later.",
  "Keep child primitives inside the component bounds unless intentionally detached.",
  "Use a readable minimum text size of 10px and increase section size instead of clipping copy.",
];

export const NORTHSTAR_COMPONENT_CONTRACTS: Record<NorthStarComponentPreset, NorthStarComponentContract> = {
  section: {
    preset: "section",
    label: "Section",
    description: "A general artifact region with heading, body, and child slots.",
    defaultWidth: 640,
    defaultHeight: 360,
    minWidth: 360,
    minHeight: 220,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "neutral",
    radiusMode: "soft",
    primitiveChildren: ["frame", "text", "group", "divider"],
    supportsEvidence: false,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use this only when a more specific component is not available."],
  },
  "flow-lane": {
    preset: "flow-lane",
    label: "Flow lane",
    description: "An ordered journey lane with app identity, screenshots, stage markers, and arrows.",
    defaultWidth: 1160,
    defaultHeight: 260,
    minWidth: 620,
    minHeight: 190,
    layoutMode: "lane",
    defaultDensity: "balanced",
    tone: "neutral",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "image", "badge", "connector", "icon"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [
      ...commonRules,
      "Preserve screenshot order and do not mix screenshots from another app.",
      "When too dense, show representative hero moments and attach the full sequence to the evidence layer.",
    ],
  },
  "reference-flow": {
    preset: "reference-flow",
    label: "Reference flow",
    description: "A canonical flow lane used as evidence for claims and comparisons.",
    defaultWidth: 1160,
    defaultHeight: 280,
    minWidth: 680,
    minHeight: 210,
    layoutMode: "lane",
    defaultDensity: "expanded",
    tone: "neutral",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "image", "badge", "connector", "icon"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [
      ...commonRules,
      "Use when the ordered flow itself is central to the reasoning.",
      "Keep sequence labels and stage markers aligned above the exact screenshots.",
    ],
  },
  "evidence-strip": {
    preset: "evidence-strip",
    label: "Evidence strip",
    description: "A curated strip of proof moments tied to a claim.",
    defaultWidth: 760,
    defaultHeight: 250,
    minWidth: 420,
    minHeight: 170,
    layoutMode: "row",
    defaultDensity: "balanced",
    tone: "green",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "image", "text", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Show only evidence that materially supports the adjacent claim."],
  },
  "evidence-card": {
    preset: "evidence-card",
    label: "Evidence card",
    description: "A single evidence item with source, image, and grounded observation.",
    defaultWidth: 330,
    defaultHeight: 310,
    minWidth: 240,
    minHeight: 220,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "green",
    radiusMode: "subtle",
    primitiveChildren: ["card", "image", "text", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Observation text must be grounded in the visible evidence or source metadata."],
  },
  "insight-card": {
    preset: "insight-card",
    label: "Insight card",
    description: "A distilled observation with implication and optional proof link.",
    defaultWidth: 380,
    defaultHeight: 220,
    minWidth: 260,
    minHeight: 150,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "violet",
    radiusMode: "soft",
    primitiveChildren: ["card", "text", "badge", "icon"],
    supportsEvidence: true,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "One card should make one point. Split unrelated ideas."],
  },
  "metric-card": {
    preset: "metric-card",
    label: "Metric card",
    description: "A metric, score, confidence, or count with context.",
    defaultWidth: 300,
    defaultHeight: 190,
    minWidth: 220,
    minHeight: 130,
    layoutMode: "stack",
    defaultDensity: "compact",
    tone: "blue",
    radiusMode: "soft",
    primitiveChildren: ["card", "text", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use only observed or supplied values; never invent metrics."],
  },
  "decision-card": {
    preset: "decision-card",
    label: "Decision card",
    description: "A decision, rationale, risk, and next step module.",
    defaultWidth: 390,
    defaultHeight: 250,
    minWidth: 280,
    minHeight: 170,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "violet",
    radiusMode: "soft",
    primitiveChildren: ["card", "text", "badge", "icon"],
    supportsEvidence: true,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Always separate the decision from the evidence and from the next action."],
  },
  "recommendation-block": {
    preset: "recommendation-block",
    label: "Recommendation",
    description: "A prominent recommendation with confidence and next actions.",
    defaultWidth: 460,
    defaultHeight: 280,
    minWidth: 320,
    minHeight: 200,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "violet",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "badge", "divider"],
    supportsEvidence: true,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "The recommendation must be visible without zooming into the evidence."],
  },
  "comparison-matrix": {
    preset: "comparison-matrix",
    label: "Comparison matrix",
    description: "A stage- or criteria-equivalent comparison table.",
    defaultWidth: 720,
    defaultHeight: 390,
    minWidth: 460,
    minHeight: 260,
    layoutMode: "matrix",
    defaultDensity: "balanced",
    tone: "neutral",
    radiusMode: "sharp",
    primitiveChildren: ["table", "text", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Every row must compare logically equivalent dimensions."],
  },
  matrix: {
    preset: "matrix",
    label: "Matrix",
    description: "A general editable matrix/table for reasoning.",
    defaultWidth: 680,
    defaultHeight: 360,
    minWidth: 420,
    minHeight: 240,
    layoutMode: "matrix",
    defaultDensity: "balanced",
    tone: "neutral",
    radiusMode: "sharp",
    primitiveChildren: ["table", "text", "badge"],
    supportsEvidence: false,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use sharp grid clarity when row-by-row comparison matters."],
  },
  "stage-map": {
    preset: "stage-map",
    label: "Stage map",
    description: "A visual progression across journey or strategy stages.",
    defaultWidth: 820,
    defaultHeight: 240,
    minWidth: 480,
    minHeight: 160,
    layoutMode: "timeline",
    defaultDensity: "balanced",
    tone: "blue",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "badge", "connector", "icon"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Keep stage order obvious and labels short."],
  },
  "tradeoff-panel": {
    preset: "tradeoff-panel",
    label: "Trade-off panel",
    description: "A trade-off, slider, or balance panel for decision analysis.",
    defaultWidth: 430,
    defaultHeight: 300,
    minWidth: 300,
    minHeight: 200,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "blue",
    radiusMode: "subtle",
    primitiveChildren: ["card", "text", "shape", "divider"],
    supportsEvidence: true,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use when two directions are both valid and the choice is contextual."],
  },
  "research-trail": {
    preset: "research-trail",
    label: "Research trail",
    description: "A designed trace of what was inspected, accepted, rejected, and decided.",
    defaultWidth: 420,
    defaultHeight: 420,
    minWidth: 300,
    minHeight: 260,
    layoutMode: "timeline",
    defaultDensity: "compact",
    tone: "violet",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "badge", "connector"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "This replaces messy scratchpads: show process as a designed evidence trail."],
  },
  "source-ledger": {
    preset: "source-ledger",
    label: "Source ledger",
    description: "A compact source table with relevance and summary.",
    defaultWidth: 760,
    defaultHeight: 260,
    minWidth: 460,
    minHeight: 170,
    layoutMode: "matrix",
    defaultDensity: "compact",
    tone: "neutral",
    radiusMode: "sharp",
    primitiveChildren: ["table", "text", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Keep source rows short and traceable."],
  },
  "hypothesis-panel": {
    preset: "hypothesis-panel",
    label: "Hypotheses",
    description: "Hypotheses tested with status and proof links.",
    defaultWidth: 520,
    defaultHeight: 280,
    minWidth: 340,
    minHeight: 190,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "amber",
    radiusMode: "subtle",
    primitiveChildren: ["card", "text", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Separate supported, open, rejected, and decided states."],
  },
  "executive-summary": {
    preset: "executive-summary",
    label: "Executive summary",
    description: "A leadership-ready synthesis block with clear conclusion.",
    defaultWidth: 520,
    defaultHeight: 330,
    minWidth: 360,
    minHeight: 220,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "violet",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "badge", "divider"],
    supportsEvidence: true,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use only when it helps the intended audience make a decision."],
  },
  scorecard: {
    preset: "scorecard",
    label: "Scorecard",
    description: "A compact scored assessment across dimensions.",
    defaultWidth: 460,
    defaultHeight: 300,
    minWidth: 300,
    minHeight: 200,
    layoutMode: "stack",
    defaultDensity: "compact",
    tone: "blue",
    radiusMode: "subtle",
    primitiveChildren: ["card", "text", "shape", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Scores must be qualitative or observed; do not invent precision."],
  },
  chart: {
    preset: "chart",
    label: "Chart",
    description: "A native editable chart or chart-like component.",
    defaultWidth: 520,
    defaultHeight: 340,
    minWidth: 340,
    minHeight: 220,
    layoutMode: "stack",
    defaultDensity: "balanced",
    tone: "blue",
    radiusMode: "subtle",
    primitiveChildren: ["chart", "text", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use charts only for observed/supplied values or clearly qualitative distributions."],
  },
  timeline: {
    preset: "timeline",
    label: "Timeline",
    description: "A sequence of events, stages, or next steps.",
    defaultWidth: 760,
    defaultHeight: 300,
    minWidth: 420,
    minHeight: 190,
    layoutMode: "timeline",
    defaultDensity: "balanced",
    tone: "blue",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "connector", "badge"],
    supportsEvidence: true,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Keep chronology or dependency order unambiguous."],
  },
  "research-region": {
    preset: "research-region",
    label: "Research region",
    description: "A designed evidence/reasoning area inside the unified artifact.",
    defaultWidth: 700,
    defaultHeight: 430,
    minWidth: 420,
    minHeight: 260,
    layoutMode: "grid",
    defaultDensity: "balanced",
    tone: "green",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "text", "card", "badge"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use this as a designed evidence layer, not an unstructured scratchpad."],
  },
  "product-concept": {
    preset: "product-concept",
    label: "Product concept",
    description: "A proposed product direction with evidence, principles, and screens.",
    defaultWidth: 900,
    defaultHeight: 560,
    minWidth: 520,
    minHeight: 340,
    layoutMode: "grid",
    defaultDensity: "expanded",
    tone: "violet",
    radiusMode: "subtle",
    primitiveChildren: ["frame", "image", "text", "badge", "connector"],
    supportsEvidence: true,
    supportsDataBinding: true,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Clearly separate reference evidence from proposed product direction."],
  },
  "annotation-callout": {
    preset: "annotation-callout",
    label: "Annotation",
    description: "A small note or callout attached to evidence or a decision point.",
    defaultWidth: 300,
    defaultHeight: 150,
    minWidth: 180,
    minHeight: 90,
    layoutMode: "stack",
    defaultDensity: "compact",
    tone: "amber",
    radiusMode: "sharp",
    primitiveChildren: ["card", "text", "connector", "icon"],
    supportsEvidence: true,
    supportsDataBinding: false,
    supportsResizeReflow: true,
    supportsHumanDrag: true,
    supportsAgentCreate: true,
    visualRules: [...commonRules, "Use callouts sparingly and keep them near the thing they explain."],
  },
};

export function getNorthStarComponentContract(
  preset: NorthStarComponentPreset,
): NorthStarComponentContract {
  return NORTHSTAR_COMPONENT_CONTRACTS[preset];
}

export function isNorthStarComponentPreset(value: string): value is NorthStarComponentPreset {
  return (NORTHSTAR_COMPONENT_PRESET_IDS as readonly string[]).includes(value);
}

export function getNorthStarRadius(mode: NorthStarRadiusMode): number {
  if (mode === "none") return NORTHSTAR_CANVAS_DESIGN_TOKENS.radius.none;
  if (mode === "sharp") return NORTHSTAR_CANVAS_DESIGN_TOKENS.radius.sharp;
  if (mode === "subtle") return NORTHSTAR_CANVAS_DESIGN_TOKENS.radius.subtle;
  if (mode === "soft") return NORTHSTAR_CANVAS_DESIGN_TOKENS.radius.soft;
  return NORTHSTAR_CANVAS_DESIGN_TOKENS.radius.pill;
}

export function getNorthStarToneSurface(tone: NorthStarCanvasTone): string {
  const { color } = NORTHSTAR_CANVAS_DESIGN_TOKENS;
  if (tone === "violet") return color.surfaceLavender;
  if (tone === "blue") return color.surfaceBlue;
  if (tone === "green") return color.surfaceGreen;
  if (tone === "orange") return color.surfaceOrange;
  if (tone === "amber") return color.surfaceAmber;
  if (tone === "rose") return color.surfaceRose;
  if (tone === "ink") return color.ink;
  return color.surface;
}

export function getNorthStarToneAccent(tone: NorthStarCanvasTone): string {
  const { color } = NORTHSTAR_CANVAS_DESIGN_TOKENS;
  if (tone === "violet") return color.violet;
  if (tone === "blue") return color.blue;
  if (tone === "green") return color.green;
  if (tone === "orange") return color.orange;
  if (tone === "amber") return color.amber;
  if (tone === "rose") return color.rose;
  if (tone === "ink") return color.ink;
  return color.inkSoft;
}
