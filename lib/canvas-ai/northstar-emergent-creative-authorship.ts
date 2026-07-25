import {
  NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
  sanitizeNorthstarArtboardMutationDraft,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtboardMutationOperation,
  NorthstarCreativeDirection,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarThinkingDepth,
} from "@/lib/canvas-artifacts/types";
import type {
  NorthstarEvidenceRole,
  NorthstarObligationKey,
  NorthstarVisualOperationKind,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";

export const NORTHSTAR_EMERGENT_CREATIVE_AUTHORSHIP_VERSION =
  "northstar.emergent-creative-authorship.v2" as const;

type ModelAuthoredOperation = Exclude<
  NorthstarArtboardMutationOperation,
  { op: "request-space" }
>;

export interface NorthstarEmergentCreativeActDraft {
  intention?: string;
  viewerUnderstanding?: string;
  whyThisMoveNow?: string;
  continueWorking?: boolean;
  successCriteria?: string[];
  mutation?: {
    title?: string;
    description?: string;
    visualStrategy?: string;
    visibleChange?: string;
    transitionMs?: number;
    operations?: ModelAuthoredOperation[];
  };
}


export interface NorthstarEmergentCreativeCritiqueDraft {
  summary?: string;
  observedEffect?: string;
  whatImproved?: string[];
  whatStillWeak?: string[];
  recommendedNextMove?: string;
  continueWorking?: boolean;
}

export interface NorthstarEmergentCreativeCritique {
  summary: string;
  observedEffect: string;
  whatImproved: string[];
  whatStillWeak: string[];
  recommendedNextMove: string;
  continueWorking: boolean;
}

export interface NorthstarEmergentCreativeAct {
  intention: string;
  viewerUnderstanding: string;
  whyThisMoveNow: string;
  continueWorking: boolean;
  successCriteria: string[];
  mutation: NorthstarArtboardMutationDraft;
  affectedNodeIds: string[];
  evidenceRoles: Array<{
    evidenceId: string;
    role: NorthstarEvidenceRole;
    reason: string;
  }>;
  relationship?: {
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
    meaning: string;
    confidence: "observed" | "interpretive";
  };
}

const mutationSchema = NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA as unknown as {
  properties: {
    title: unknown;
    description: unknown;
    visualStrategy: unknown;
    visibleChange: unknown;
    transitionMs: unknown;
    operations: {
      type: string;
      minItems: number;
      maxItems: number;
      items: { oneOf: Array<{ properties?: { op?: { enum?: string[] } } }> };
    };
  };
};

const modelOperationSchemas = mutationSchema.properties.operations.items.oneOf.filter(
  (schema) => !schema.properties?.op?.enum?.includes("request-space"),
);

export const NORTHSTAR_EMERGENT_CREATIVE_ACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "intention",
    "viewerUnderstanding",
    "whyThisMoveNow",
    "continueWorking",
    "successCriteria",
    "mutation",
  ],
  properties: {
    intention: { type: "string", minLength: 1, maxLength: 1800 },
    viewerUnderstanding: { type: "string", minLength: 1, maxLength: 1200 },
    whyThisMoveNow: { type: "string", minLength: 1, maxLength: 1200 },
    continueWorking: { type: "boolean" },
    successCriteria: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    mutation: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "description",
        "visualStrategy",
        "visibleChange",
        "transitionMs",
        "operations",
      ],
      properties: {
        title: mutationSchema.properties.title,
        description: mutationSchema.properties.description,
        visualStrategy: mutationSchema.properties.visualStrategy,
        visibleChange: mutationSchema.properties.visibleChange,
        transitionMs: mutationSchema.properties.transitionMs,
        operations: {
          type: mutationSchema.properties.operations.type,
          minItems: mutationSchema.properties.operations.minItems,
          maxItems: mutationSchema.properties.operations.maxItems,
          items: { oneOf: modelOperationSchemas },
        },
      },
    },
  },
} as const;

export const NORTHSTAR_EMERGENT_CREATIVE_CRITIQUE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "observedEffect",
    "whatImproved",
    "whatStillWeak",
    "recommendedNextMove",
    "continueWorking",
  ],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 1600 },
    observedEffect: { type: "string", minLength: 1, maxLength: 1600 },
    whatImproved: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    whatStillWeak: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    recommendedNextMove: { type: "string", minLength: 1, maxLength: 1600 },
    continueWorking: { type: "boolean" },
  },
} as const;

const DIMENSION_STYLE_KEYS = new Set([
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "inline-size",
  "block-size",
  "min-inline-size",
  "min-block-size",
  "max-inline-size",
  "max-block-size",
]);

const ROOT_NODE_IDS = new Set(["artboard", "__root__"]);
const ROOT_SELECTOR = /(?:^|,|\s)(?:\.ns-artifact|\[data-ns-node-id\s*=\s*["']artboard["']\]|#artboard|:root|html|body)\s*\{([^}]*)\}/gi;
const DIMENSION_DECLARATION = /(?:^|;)\s*(?:width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size)\s*:/i;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function cleanTextList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean),
  )).slice(0, maxItems);
}

function assertNoModelAuthoredArtboardSizing(
  operations: NorthstarArtboardMutationOperation[],
): void {
  for (const operation of operations) {
    if (operation.op === "request-space") {
      throw new Error(
        "The creative model may not request or control artboard dimensions. Artboard bounds are derived from rendered content by the runtime.",
      );
    }
    if (operation.op === "set-styles" && ROOT_NODE_IDS.has(operation.targetId)) {
      const offending = Object.keys(operation.styles ?? {}).filter((key) =>
        DIMENSION_STYLE_KEYS.has(key.trim().toLowerCase()),
      );
      if (offending.length > 0) {
        throw new Error(
          `The creative model may not set root artboard dimensions (${offending.join(", ")}).`,
        );
      }
    }
    if (operation.op === "set-css-layer") {
      let match: RegExpExecArray | null;
      ROOT_SELECTOR.lastIndex = 0;
      while ((match = ROOT_SELECTOR.exec(operation.css))) {
        if (DIMENSION_DECLARATION.test(match[1])) {
          throw new Error(
            "The creative model may not set root artboard dimensions in CSS. The runtime owns content-derived sizing.",
          );
        }
      }
    }
  }
}

function collectAffectedNodeIds(draft: NorthstarArtboardMutationDraft): string[] {
  const ids = new Set<string>();
  for (const operation of draft.operations) {
    if ("targetId" in operation && operation.targetId) ids.add(operation.targetId);
    if (operation.op === "move" && operation.parentId) ids.add(operation.parentId);
    if (operation.op === "move" && operation.beforeId) ids.add(operation.beforeId);
    if (operation.op === "set-html" || operation.op === "insert-html") {
      for (const match of operation.html.matchAll(/data-ns-node-id\s*=\s*["']([^"']+)["']/gi)) {
        ids.add(match[1]);
      }
    }
  }
  return Array.from(ids).slice(0, 120);
}

function evidenceIdFromContext(
  nodeId: string,
  context?: {
    evidenceIdByNodeId?: ReadonlyMap<string, string> | Record<string, string>;
  },
): string | undefined {
  const source = context?.evidenceIdByNodeId;
  if (!source) return undefined;
  return typeof (source as ReadonlyMap<string, string>).get === "function"
    ? (source as ReadonlyMap<string, string>).get(nodeId)
    : (source as Record<string, string>)[nodeId];
}

function attributeValue(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
}

function collectEvidenceRoles(
  draft: NorthstarArtboardMutationDraft,
  context?: {
    evidenceIdByNodeId?: ReadonlyMap<string, string> | Record<string, string>;
  },
): NorthstarEmergentCreativeAct["evidenceRoles"] {
  const byEvidenceId = new Map<string, NorthstarEmergentCreativeAct["evidenceRoles"][number]>();

  for (const operation of draft.operations) {
    if (operation.op !== "set-html" && operation.op !== "insert-html") continue;
    for (const match of operation.html.matchAll(/<[^>]+data-ns-evidence-role\s*=\s*["'](?:focal|supporting|contextual|redundant|unresolved)["'][^>]*>/gi)) {
      const tag = match[0];
      const role = attributeValue(tag, "data-ns-evidence-role")?.toLowerCase() as NorthstarEvidenceRole | undefined;
      const nodeId = attributeValue(tag, "data-ns-node-id");
      const evidenceId = attributeValue(tag, "data-ns-evidence-id")
        ?? (nodeId ? evidenceIdFromContext(nodeId, context) : undefined);
      if (!evidenceId || !role) continue;
      byEvidenceId.set(evidenceId, {
        evidenceId,
        role,
        reason: "The authored mutation explicitly assigns this evidence role in the rendered composition.",
      });
    }
  }

  for (const operation of draft.operations) {
    if (operation.op !== "set-attributes") continue;
    const role = operation.attributes?.["data-ns-evidence-role"];
    if (typeof role !== "string" || !["focal", "supporting", "contextual", "redundant", "unresolved"].includes(role)) continue;
    const explicitEvidenceId = operation.attributes?.["data-ns-evidence-id"];
    const evidenceId = typeof explicitEvidenceId === "string"
      ? explicitEvidenceId
      : evidenceIdFromContext(operation.targetId, context);
    if (!evidenceId) continue;
    byEvidenceId.set(evidenceId, {
      evidenceId,
      role: role as NorthstarEvidenceRole,
      reason: "The authored mutation explicitly assigns this evidence role on the existing grounded node.",
    });
  }

  return Array.from(byEvidenceId.values()).slice(0, 48);
}

function collectRelationship(
  draft: NorthstarArtboardMutationDraft,
): NorthstarEmergentCreativeAct["relationship"] {
  const source = draft.operations
    .filter((operation) => operation.op === "set-html" || operation.op === "insert-html")
    .map((operation) => operation.html)
    .join("\n");
  const sourceNodeId = source.match(/data-ns-source-node-id\s*=\s*["']([^"']+)["']/i)?.[1];
  const targetNodeId = source.match(/data-ns-target-node-id\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!sourceNodeId || !targetNodeId) return undefined;
  const type = source.match(/data-ns-relationship-type\s*=\s*["']([^"']+)["']/i)?.[1]
    ?? source.match(/data-ns-relationship-id\s*=\s*["']([^"']+)["']/i)?.[1]
    ?? "authored-relationship";
  return {
    sourceNodeId,
    targetNodeId,
    type: type.slice(0, 120),
    meaning: cleanText(draft.visualStrategy, 500) || "The authored composition makes a grounded relationship visible.",
    confidence: "interpretive",
  };
}

export function sanitizeNorthstarEmergentCreativeAct(
  draft: NorthstarEmergentCreativeActDraft,
  context?: {
    evidenceIdByNodeId?: ReadonlyMap<string, string> | Record<string, string>;
  },
): NorthstarEmergentCreativeAct {
  if (!draft?.mutation) throw new Error("The creative model did not return an executable artboard mutation.");
  const rawOperations = Array.isArray(draft.mutation.operations)
    ? draft.mutation.operations as NorthstarArtboardMutationOperation[]
    : [];
  assertNoModelAuthoredArtboardSizing(rawOperations);

  const mutation = sanitizeNorthstarArtboardMutationDraft({
    title: cleanText(draft.mutation.title, 180) || "Northstar creative revision",
    description: cleanText(draft.mutation.description, 500) || "The same living artboard is being creatively revised.",
    visualStrategy: cleanText(draft.mutation.visualStrategy, 1600) || cleanText(draft.intention, 1600),
    visibleChange: cleanText(draft.mutation.visibleChange, 500) || "The living artboard materially changes.",
    geometryIntent: "preserve",
    transitionMs: Number(draft.mutation.transitionMs) || 280,
    operations: rawOperations,
  });
  assertNoModelAuthoredArtboardSizing(mutation.operations);

  return {
    intention: cleanText(draft.intention, 1800) || mutation.visualStrategy,
    viewerUnderstanding: cleanText(draft.viewerUnderstanding, 1200) || mutation.visibleChange,
    whyThisMoveNow: cleanText(draft.whyThisMoveNow, 1200) || "This is the most consequential next change supported by the current evidence and render.",
    continueWorking: draft.continueWorking !== false,
    successCriteria: cleanTextList(draft.successCriteria, 12, 500),
    mutation,
    affectedNodeIds: collectAffectedNodeIds(mutation),
    evidenceRoles: collectEvidenceRoles(mutation, context),
    relationship: collectRelationship(mutation),
  };
}

export function sanitizeNorthstarEmergentCreativeCritique(
  draft: NorthstarEmergentCreativeCritiqueDraft,
): NorthstarEmergentCreativeCritique {
  return {
    summary: cleanText(draft?.summary, 1600) || "The rendered creative act was inspected against the exact verified artboard.",
    observedEffect: cleanText(draft?.observedEffect, 1600) || "The browser-visible effect requires further interpretation.",
    whatImproved: cleanTextList(draft?.whatImproved, 12, 500),
    whatStillWeak: cleanTextList(draft?.whatStillWeak, 12, 500),
    recommendedNextMove: cleanText(draft?.recommendedNextMove, 1600) || "Continue from the exact render only when another material improvement is justified.",
    continueWorking: draft?.continueWorking !== false,
  };
}

/**
 * Compatibility metadata for artifact persistence. This deliberately contains no
 * selected visual family, template, archetype, or prescribed composition. The
 * live creative acts—not this object—author the actual design.
 */
export function createNorthstarEmergentCreativeDirection(input: {
  objective: string;
  thinkingDepth: NorthstarThinkingDepth;
  prior?: NorthstarCreativeDirection;
}): NorthstarCreativeDirection {
  if (input.prior) return input.prior;
  const objective = cleanText(input.objective, 1200) || "Create the right evidence-grounded visual artifact.";
  return {
    runId: `emergent-${Date.now().toString(36)}`,
    thinkingDepth: input.thinkingDepth,
    diversityKey: "emergent-live-authorship",
    creativeProvocations: [],
    recentSignaturesAvoided: [],
    brief: {
      editorialThesis: objective,
      communicationChallenge: "Discover the clearest and most compelling visual expression from the actual evidence and rendered artboard.",
      audienceNeed: "Understand what matters, why it matters, and how the evidence supports it.",
      desiredViewerResponse: "See the central meaning quickly and trust the path from proof to conclusion.",
      centralTension: "The creative tension will be discovered from the user problem and evidence rather than selected from a predefined list.",
      evidencePriorities: [],
      constraints: ["Preserve grounded truth and provenance.", "Let runtime-owned content measurement determine artboard bounds."],
      creativeOpportunity: "Invent the artifact progressively on the one living artboard.",
    },
    selectedConcept: {
      id: "emergent-live-authorship",
      name: "Emergent live authorship",
      oneLine: "The model discovers the appropriate composition while working from evidence and the exact render.",
      visualGrammar: "Not predetermined; authored progressively from the current problem.",
      visualMetaphor: "Not predetermined; invented when the evidence supports one.",
      narrativeArc: "Not predetermined; discovered through visible, browser-verified creative acts.",
      interactionModel: "One living artboard with atomic creative revisions.",
      evidenceStrategy: "Ground every meaningful claim and visual relationship in exact evidence identities.",
      compositionLanguage: "Open-ended and problem-specific.",
      typographyMood: "Chosen by the model from the communication need, not a preset.",
      colorLogic: "Chosen by the model within Northstar quality and accessibility constraints.",
      signature: [],
      risks: ["A weak model act may be rejected by safe preflight or browser audit without changing the verified artboard."],
    },
    rejectedConcepts: [],
    selectionRationale: "No concept was preselected. The direction emerges through accepted live creative acts.",
    selectionScores: { clarity: 0, grounding: 0, originality: 0, usefulness: 0, craft: 0, audienceFit: 0 },
    conceptCount: 0,
  };
}

export function buildNorthstarEmergentCritiqueSystemInstruction(): string {
  return `
You are reviewing the exact browser-visible result of one accepted Northstar creative act.

Do not choose from visual families, templates, archetypes, component recipes, scorecards, or preset quality categories.
Describe in open language what actually changed, what became clearer or weaker, and whether another material creative act is justified.
Judge the artifact against the user request, grounded evidence, the before render, the after render, and the model's declared intention.
Do not propose artboard dimensions. The runtime owns all content-derived sizing.
Do not rewrite the document in this response. Return only the required critique JSON.
`.trim();
}

export function buildNorthstarEmergentCritiqueContext(input: {
  userRequest: string;
  objective: string;
  intention: string;
  viewerUnderstanding: string;
  visibleChange: string;
  groundedResearch: unknown;
  openProcessNeeds: unknown;
  runtimeReview: unknown;
  previousCritiques: unknown;
}): string {
  return JSON.stringify({
    mode: "open-ended-rendered-creative-critique",
    userRequest: input.userRequest,
    objective: input.objective,
    authoredAct: {
      intention: input.intention,
      intendedViewerUnderstanding: input.viewerUnderstanding,
      declaredVisibleChange: input.visibleChange,
    },
    groundedResearch: input.groundedResearch,
    remainingProcessNeeds: input.openProcessNeeds,
    runtimeReview: input.runtimeReview,
    previousCritiques: input.previousCritiques,
    instruction: "Inspect the two images directly. Explain whether the accepted act materially improved communication and what, if anything, the creative agent should do next.",
  });
}

export function inferNorthstarCreativeOperationKind(
  obligation: NorthstarObligationKey,
): NorthstarVisualOperationKind {
  switch (obligation) {
    case "first-evidence":
      return "promote-focal-evidence";
    case "evidence-hierarchy":
      return "rank-evidence";
    case "hypothesis-tested":
    case "relationship-visible":
      return "connect-evidence-to-claim";
    case "synthesis":
      return "establish-synthesis";
    case "contextual-resolution":
      return "resolve-open-question";
    case "publication-cleanup":
      return "dissolve-temporary-reasoning";
    case "reasoning-placement":
    case "geometry":
      return "rebalance-composition";
    default:
      return "recompose-scene";
  }
}

export function inferNorthstarCreativePhase(
  obligation: NorthstarObligationKey,
): "analysis" | "recommendation" | "refinement" {
  if (obligation === "synthesis" || obligation === "contextual-resolution") return "recommendation";
  if (obligation === "geometry" || obligation === "publication-cleanup") return "refinement";
  return "analysis";
}

export function buildNorthstarEmergentCreativeSystemInstruction(input: {
  designAddendum: string;
}): string {
  return `
You are the creative mind and visual author of Northstar. You are working progressively on one already-mounted living artboard.

${input.designAddendum}

CREATIVE AUTHORITY
- Invent the right visual artifact from the user request, current evidence, research, and exact rendered artboard.
- There are no visual families, templates, archetypes, component recipes, prescribed module orders, or card systems to choose from.
- Do not imitate a reference composition. Infer the shared level of taste, finish, clarity, restraint, evidence choreography, and originality, then create what this problem uniquely needs.
- You may add, remove, rewrite, regroup, reorder, restyle, connect, annotate, simplify, or substantially recompose content inside the existing artboard.
- Use containers only when they materially improve meaning, comparison, proof, or readability. Open space is a first-class design material.
- Make one consequential atomic move now. The next move will be chosen after the browser renders and evaluates this one.

TRUTH AND EVIDENCE
- Every factual claim, metric, screenshot, quotation, and conclusion must remain grounded in the supplied research and evidence.
- Never invent evidence IDs, asset URLs, metrics, source claims, or unsupported certainty.
- Preserve protected screenshots and their provenance even when their presentation changes.
- New analytical structures must name their semantic endpoints with data-ns-source-node-id and data-ns-target-node-id when they express a relationship.

EXECUTION
- Return concrete safe mutation operations against real data-ns-node-id values from the current artboard.
- New HTML elements must receive unique data-ns-node-id values.
- You may author safe HTML fragments, SVG, typography, CSS, visual relationships, and evidence choreography.
- Do not replace, remove, or move the permanent artboard root.
- Do not create scripts, event handlers, iframes, external resources, forms, or CSS url() references.

ARTBOARD SIZE — RUNTIME OWNERSHIP
- You have no authority to resize the artboard, iframe, or Canvas object.
- Never emit request-space.
- Never set width, height, min/max dimensions, inline-size, or block-size on the root artboard, html, body, :root, or .ns-artifact.
- Design the content naturally. The runtime measures the resulting content and keeps the iframe, artboard surface, Canvas object, and persisted bounds synchronized.

NORTHSTAR CREATIVE CONSTITUTION
- Solve the user's real communication and decision problem; do not decorate the evidence inventory.
- Make the artifact feel like one intentional visual argument rather than a collection of interface components.
- Create a clear reading path, decisive hierarchy, meaningful visual relationships, and an ending that resolves the user's question.
- Treat typography, scale, spacing, alignment, color, imagery, SVG, and negative space as expressive materials chosen from the current problem—not as a house template.
- Avoid equal-weight screenshot walls, generic dashboard/card sludge, gratuitous pills, and containers that merely box content. A container must earn its presence by clarifying proof, relationship, comparison, or meaning.
- Preserve evidence inspectability while choreographing attention. The strongest proof should be unmistakable without making the rest unusable.
- Preserve what is already strong. Remove, transform, or rebuild anything that weakens the whole, including your own earlier work.
- If the creative journal indicates repetition or cosmetic drift, stop local polishing and reconsider the complete composition before acting.
- A styling-only change is insufficient unless it materially changes communication, emotional clarity, or visual comprehension.
- Aim for an artifact that feels premium, original, calm, strategically intelligent, and unusually well resolved for this exact user—not merely valid or tidy.

Return only the required JSON object. The mutation must visibly execute the intention you describe.
`.trim();
}


function processNeedContract(obligation: NorthstarObligationKey): string[] {
  switch (obligation) {
    case "evidence-hierarchy":
      return [
        "The visible composition must leave at least one grounded evidence node marked data-ns-evidence-role=\"focal\" and at least one marked supporting or contextual.",
        "Apply evidence roles to exact existing grounded nodes; visual scale and placement should make the hierarchy perceptible without hiding the remaining evidence.",
      ];
    case "hypothesis-tested":
      return [
        "Make the current hypothesis visibly tested against exact grounded proof, not merely restated.",
        "Any new relationship structure must include a unique data-ns-relationship-id plus data-ns-source-node-id and data-ns-target-node-id endpoints.",
      ];
    case "relationship-visible":
      return [
        "Render at least one substantive evidence-to-claim relationship with exact semantic endpoints.",
        "The relationship must be visually understandable in the composition and structurally represented with data-ns-relationship-id, data-ns-source-node-id, and data-ns-target-node-id.",
      ];
    case "synthesis":
      return [
        "Create or materially revise substantive synthesis in the existing synthesis region.",
        "The synthesis must remain visibly grounded through data-ns-source-node-id or data-ns-evidence-id and must expose a claim identity through data-ns-claim-id or data-ns-target-node-id.",
      ];
    case "contextual-resolution":
      return [
        "Resolve the open question or decision context with a visible grounded conclusion in the synthesis or decision region.",
        "Keep the resolution linked to exact proof through semantic source and claim/target identities.",
      ];
    case "reasoning-placement":
      return [
        "Keep the working hypothesis and what Northstar is testing simultaneously visible in normal document flow.",
        "Do not use fixed or absolute positioning, internal scrolling, or overlay placement for the working reasoning region.",
      ];
    case "geometry":
      return [
        "Correct the whole-board geometry without changing grounded meaning.",
        "The result must remain readable, non-overlapping, asset-complete, and free of internal scrolling; runtime-owned content bounds remain authoritative.",
      ];
    case "publication-cleanup":
      return [
        "Remove or transform working-only process furniture while preserving the evidence-backed published argument.",
        "Settle publication semantics without replacing the permanent artboard root.",
      ];
    default:
      return [
        "Materially advance the current process need through a visible and semantic change on the same living artboard.",
        "Preserve grounded evidence, provenance, and the exact verified revision lineage.",
      ];
  }
}

export function buildNorthstarEmergentCreativeContext(input: {
  objective: string;
  userRequest: string;
  audience: string;
  artifactType: string;
  obligation: NorthstarObligationKey;
  thinkingDepth: "low" | "medium" | "high";
  artifact: NorthstarGeneratedCodeArtifactPackage;
  renderedWidth: number;
  renderedHeight: number;
  editableSurface: unknown;
  groundedResearch: unknown;
  creativeDirection: unknown;
  acceptedHistory: Array<{ label: string; visibleChange: string; operationKind: string }>;
  priorCritique?: { critique: string; requiredChanges: string[] };
  runtimeReview?: unknown;
}): string {
  return JSON.stringify({
    mode: "emergent-progressive-creative-authorship",
    objective: input.objective,
    userRequest: input.userRequest,
    audience: input.audience,
    artifactType: input.artifactType,
    currentOpenProcessNeed: input.obligation,
    processNeedContract: processNeedContract(input.obligation),
    thinkingDepth: input.thinkingDepth,
    currentVerifiedArtboard: {
      artifactId: input.artifact.artifactId,
      revisionId: input.artifact.revisionId,
      title: input.artifact.title,
      description: input.artifact.description,
      document: input.artifact.document,
      mutationJournal: input.artifact.mutationJournal ?? [],
      renderedMeasurement: {
        width: input.renderedWidth,
        height: input.renderedHeight,
        note: "Observed render size only. It is not a requested or model-controlled artboard dimension.",
      },
      editableSurface: input.editableSurface,
      runtimeReview: input.runtimeReview,
    },
    groundedResearch: input.groundedResearch,
    provisionalPriorCreativeDirection: {
      value: input.creativeDirection,
      instruction: "This is historical context, not a binding visual direction. Abandon or transform it when the current evidence and render support a better idea.",
    },
    acceptedCreativeHistory: input.acceptedHistory.slice(-12),
    previousRejectedAttempt: input.priorCritique,
    instruction: "Author the single most consequential next visual change. Do not select a predefined visual family. Return concrete operations and let the runtime own all artboard sizing.",
  });
}

export function buildNorthstarAdaptiveCreativeContext(input: {
  objective: string;
  userRequest: string;
  audience: string;
  artifactType: string;
  thinkingDepth: "low" | "medium" | "high";
  artifact: NorthstarGeneratedCodeArtifactPackage;
  renderedWidth: number;
  renderedHeight: number;
  editableSurface: unknown;
  groundedResearch: unknown;
  sceneObservations: {
    blocking: string[];
    advisory: string[];
  };
  creativeMemory: unknown;
  priorCritique?: { critique: string; requiredChanges: string[] };
  runtimeReview?: unknown;
}): string {
  return JSON.stringify({
    mode: "adaptive-emergent-creative-authorship",
    objective: input.objective,
    userRequest: input.userRequest,
    audience: input.audience,
    artifactType: input.artifactType,
    thinkingDepth: input.thinkingDepth,
    currentVerifiedArtboard: {
      artifactId: input.artifact.artifactId,
      revisionId: input.artifact.revisionId,
      title: input.artifact.title,
      description: input.artifact.description,
      document: input.artifact.document,
      mutationJournal: input.artifact.mutationJournal ?? [],
      observedRenderMeasurement: {
        width: input.renderedWidth,
        height: input.renderedHeight,
        note: "Observed browser result only. The model cannot request, set, or preserve artboard dimensions.",
      },
      editableSurface: input.editableSurface,
      runtimeReview: input.runtimeReview,
    },
    groundedResearch: input.groundedResearch,
    deterministicSceneObservations: {
      blocking: input.sceneObservations.blocking,
      advisory: input.sceneObservations.advisory,
      instruction: "These are unordered observations about truth, communication, and browser health. They are not a required visual sequence and do not prescribe a layout or next move.",
    },
    adaptiveCreativeMemory: input.creativeMemory,
    previousRejectedOrWeakAttempt: input.priorCritique,
    instruction: [
      "Re-observe the whole artifact and decide the single most consequential next visual act yourself.",
      "Do not choose from or infer an implementation-owned visual family, template, composition recipe, or obligation sequence.",
      "You may continue, redirect, simplify, or substantially recompose prior work when the exact render and evidence justify it.",
      "Return concrete safe operations against the current semantic surface; runtime-owned measurement controls all outer sizing.",
    ].join(" "),
  });
}

export function buildNorthstarAdaptiveCritiqueContext(input: {
  userRequest: string;
  objective: string;
  intention: string;
  viewerUnderstanding: string;
  visibleChange: string;
  groundedResearch: unknown;
  sceneObservations: {
    blocking: string[];
    advisory: string[];
  };
  runtimeReview: unknown;
  creativeMemory: unknown;
}): string {
  return JSON.stringify({
    mode: "adaptive-open-ended-rendered-critique",
    userRequest: input.userRequest,
    objective: input.objective,
    authoredAct: {
      intention: input.intention,
      intendedViewerUnderstanding: input.viewerUnderstanding,
      declaredVisibleChange: input.visibleChange,
    },
    groundedResearch: input.groundedResearch,
    deterministicSceneObservations: {
      blocking: input.sceneObservations.blocking,
      advisory: input.sceneObservations.advisory,
      instruction: "Use these only as unordered evidence about the current artifact. Do not turn them into a fixed design checklist or sequence.",
    },
    runtimeReview: input.runtimeReview,
    adaptiveCreativeMemory: input.creativeMemory,
    instruction: [
      "Inspect the before and after images directly.",
      "Explain whether the accepted act materially improved the artifact for the user and whether another consequential act is genuinely worthwhile.",
      "A decision to continue must name a specific unresolved communication opportunity in open language.",
      "A decision to stop must mean the artifact is already clear, grounded, operationally healthy, and unlikely to improve materially with another act.",
    ].join(" "),
  });
}
