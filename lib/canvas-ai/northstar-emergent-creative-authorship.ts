import {
  NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
  sanitizeNorthstarArtboardMutationDraft,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtboardMutationOperation,
  NorthstarConstructionPlan,
  NorthstarCreativeDirection,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarThinkingDepth,
  NorthstarArtifactViewingIntent,
  NorthstarCommittedSemanticNode,
} from "@/lib/canvas-artifacts/types";
import { buildNorthstarEmergentDesignBehaviorAddendum } from "@/lib/canvas-ai/northstar-emergent-design-intelligence";
import { normalizeNorthstarViewingIntent } from "@/lib/canvas-ai/northstar-outer-canvas-presentation";
import type {
  NorthstarEvidenceRole,
  NorthstarObligationKey,
  NorthstarVisualOperationKind,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";

export const NORTHSTAR_EMERGENT_CREATIVE_AUTHORSHIP_VERSION =
  "northstar.emergent-creative-authorship.v3.3" as const;

type ModelAuthoredOperation = Exclude<
  NorthstarArtboardMutationOperation,
  { op: "request-space" }
>;

export interface NorthstarCreativeSourceEditDraft {
  targetId?: string;
  html?: string;
  css?: string;
  javascript?: string;
  placements?: Array<{ targetId?: string; parentId?: string; beforeId?: string }>;
  retireNodeIds?: string[];
}

export interface NorthstarEmergentCreativeActDraft {
  intention?: string;
  viewerUnderstanding?: string;
  whyThisMoveNow?: string;
  continueWorking?: boolean;
  successCriteria?: string[];
  /** Model-owned declaration of how the complete preserved evidence should be experienced in the Northstar workspace. */
  viewingIntent?: Partial<NorthstarArtifactViewingIntent>;
  /** Direct cumulative HTML/CSS/SVG/JavaScript edit of the retained private presentation source. */
  sourceEdit?: NorthstarCreativeSourceEditDraft;
  /** Meaning and cinema metadata for this source revision, not an implementation-owned design program. */
  stage?: {
    title?: string;
    description?: string;
    visualStrategy?: string;
    visibleChange?: string;
    transitionMs?: number;
  };
  /** Optional exact DOM actions beyond the cumulative source replacement. */
  exactActions?: ModelAuthoredOperation[];
  constructionPlan?: NorthstarConstructionPlan;
}


export interface NorthstarEmergentCreativeCritiqueDraft {
  summary?: string;
  observedEffect?: string;
  whatImproved?: string[];
  whatStillWeak?: string[];
  /** Model-observed source concerns. Runtime blocking authority remains with structured browser facts. */
  implementationDefects?: string[];
  recommendedNextMove?: string;
  continueWorking?: boolean;
}

export interface NorthstarEmergentCreativeCritique {
  summary: string;
  observedEffect: string;
  whatImproved: string[];
  whatStillWeak: string[];
  implementationDefects: string[];
  recommendedNextMove: string;
  continueWorking: boolean;
}

export interface NorthstarEmergentCreativeAct {
  sourceFiles?: { targetId: string; html: string; css: string; javascript: string };
  intention: string;
  viewerUnderstanding: string;
  whyThisMoveNow: string;
  continueWorking: boolean;
  successCriteria: string[];
  viewingIntent: NorthstarArtifactViewingIntent;
  mutation: NorthstarArtboardMutationDraft;
  affectedNodeIds: string[];
  evidenceRoles: Array<{
    evidenceId: string;
    role: NorthstarEvidenceRole;
    reason: string;
  }>;
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
  (schema) => !schema.properties?.op?.enum?.some((op) => op === "request-space" || op === "set-runtime-module"),
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
    "viewingIntent",
    "sourceEdit",
    "stage",
    "exactActions",
    "constructionPlan",
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
    viewingIntent: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "primaryNodeIds", "supportingNodeIds", "intendedViewerOutcome", "intendedReadingPath", "preserveAllEvidence"],
      properties: {
        mode: { type: "string", enum: ["single-frame", "zoom-and-inspect", "scrolling-artboard"] },
        primaryNodeIds: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 120 } },
        supportingNodeIds: { type: "array", maxItems: 240, items: { type: "string", minLength: 1, maxLength: 120 } },
        intendedViewerOutcome: { type: "string", minLength: 1, maxLength: 1200 },
        intendedReadingPath: { type: "array", minItems: 1, maxItems: 24, items: { type: "string", minLength: 1, maxLength: 120 } },
        preserveAllEvidence: { type: "boolean", const: true },
      },
    },
    sourceEdit: {
      type: "object",
      additionalProperties: false,
      required: ["targetId", "html", "css", "javascript", "placements", "retireNodeIds"],
      properties: {
        targetId: { type: "string", minLength: 1, maxLength: 120 },
        html: { type: "string", minLength: 1, maxLength: 80000 },
        css: { type: "string", maxLength: 60000 },
        javascript: { type: "string", maxLength: 80000 },
        placements: {
          type: "array",
          maxItems: 240,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["targetId", "parentId"],
            properties: {
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              parentId: { type: "string", minLength: 1, maxLength: 120 },
              beforeId: { type: "string", minLength: 1, maxLength: 120 },
            },
          },
        },
        retireNodeIds: { type: "array", maxItems: 240, items: { type: "string", minLength: 1, maxLength: 120 } },
      },
    },
    stage: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "visualStrategy", "visibleChange", "transitionMs"],
      properties: {
        title: mutationSchema.properties.title,
        description: mutationSchema.properties.description,
        visualStrategy: mutationSchema.properties.visualStrategy,
        visibleChange: mutationSchema.properties.visibleChange,
        transitionMs: mutationSchema.properties.transitionMs,
      },
    },
    exactActions: {
      type: mutationSchema.properties.operations.type,
      minItems: 0,
      maxItems: mutationSchema.properties.operations.maxItems,
      items: { oneOf: modelOperationSchemas },
    },
    constructionPlan: (NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA.properties as Record<string, unknown>).constructionPlan,
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
    "implementationDefects",
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
    implementationDefects: {
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
    if (operation.op === "recompose-region") {
      for (const placement of operation.placements) {
        ids.add(placement.targetId);
        ids.add(placement.parentId);
        if (placement.beforeId) ids.add(placement.beforeId);
      }
      for (const retiredId of operation.retireNodeIds ?? []) ids.add(retiredId);
    }
    if (operation.op === "set-html" || operation.op === "insert-html" || operation.op === "recompose-region") {
      for (const match of operation.html.matchAll(/data-ns-node-id\s*=\s*["']([^"']+)["']/gi)) {
        ids.add(match[1]);
      }
    }
  }
  return Array.from(ids).slice(0, 180);
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
    if (operation.op !== "set-html" && operation.op !== "insert-html" && operation.op !== "recompose-region") continue;
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

function cleanSourceId(value: unknown): string {
  const id = typeof value === "string" ? value.trim().slice(0, 120) : "";
  return /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(id) ? id : "";
}

function assertProtectedEvidenceOperations(input: {
  operations: NorthstarArtboardMutationOperation[];
  protectedEvidenceNodeIds: string[];
}): void {
  const protectedIds = new Set(input.protectedEvidenceNodeIds);
  if (protectedIds.size === 0) return;
  for (const operation of input.operations) {
    if (operation.op === "remove" && protectedIds.has(operation.targetId)) {
      throw new Error(`Grounded evidence screen ${operation.targetId} cannot be removed.`);
    }
    if (operation.op === "set-styles" && protectedIds.has(operation.targetId)) {
      const styles = operation.styles ?? {};
      if (styles.display === "none" || styles.visibility === "hidden" || styles.opacity === "0") {
        throw new Error(`Grounded evidence screen ${operation.targetId} cannot be hidden.`);
      }
    }
    if (operation.op === "set-attributes" && protectedIds.has(operation.targetId)) {
      if (operation.attributes.hidden != null || operation.attributes["aria-hidden"] === "true") {
        throw new Error(`Grounded evidence screen ${operation.targetId} cannot be hidden.`);
      }
    }
    if (operation.op === "recompose-region") {
      const retired = new Set(operation.retireNodeIds ?? []);
      for (const nodeId of protectedIds) {
        if (retired.has(nodeId)) throw new Error(`Grounded evidence screen ${nodeId} cannot be retired.`);
      }
    }
  }
}

function operationsFromSourceEdit(
  sourceEdit: NorthstarCreativeSourceEditDraft | undefined,
  viewingIntent: NorthstarArtifactViewingIntent,
  protectedEvidenceNodeIds: string[],
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): NorthstarArtboardMutationOperation[] {
  if (!sourceEdit) return [];
  const targetId = cleanSourceId(sourceEdit.targetId) || "presentation";
  if (ROOT_NODE_IDS.has(targetId)) throw new Error("Direct source editing may replace the presentation layer, never the permanent artboard root.");
  const html = typeof sourceEdit.html === "string" ? sourceEdit.html.trim().slice(0, 80000) : "";
  if (!html) throw new Error("The direct source edit did not provide presentation HTML.");
  const explicitPlacements = Array.isArray(sourceEdit.placements)
    ? sourceEdit.placements.map((placement) => ({
        targetId: cleanSourceId(placement?.targetId),
        parentId: cleanSourceId(placement?.parentId),
        beforeId: cleanSourceId(placement?.beforeId) || undefined,
      })).filter((placement) => placement.targetId && placement.parentId)
    : [];
  const retireNodeIds = Array.isArray(sourceEdit.retireNodeIds)
    ? Array.from(new Set(sourceEdit.retireNodeIds.map(cleanSourceId).filter(Boolean))).slice(0, 240)
    : [];
  const protectedIds = Array.from(new Set(protectedEvidenceNodeIds.map(cleanSourceId).filter(Boolean)));
  if (protectedIds.length > 240) {
    throw new Error(`The runtime can preserve at most 240 grounded evidence nodes in one cumulative source replacement; received ${protectedIds.length}.`);
  }
  const protectedIdSet = new Set(protectedIds);
  const introducedIds = new Set(
    Array.from(html.matchAll(/data-ns-node-id\s*=\s*["']([^"']+)["']/gi))
      .map((match) => cleanSourceId(match[1]))
      .filter(Boolean),
  );
  const snapshotById = new Map((semanticSnapshot ?? []).map((node) => [node.nodeId, node]));
  const explicitPlacementByTarget = new Map<string, (typeof explicitPlacements)[number]>();
  for (const placement of explicitPlacements) {
    if (!explicitPlacementByTarget.has(placement.targetId)) explicitPlacementByTarget.set(placement.targetId, placement);
  }
  const deduplicatedExplicitPlacements = Array.from(explicitPlacementByTarget.values());
  const placedIds = new Set(deduplicatedExplicitPlacements.map((placement) => placement.targetId));
  const inheritedPlacements = protectedIds
    .filter((nodeId) => !placedIds.has(nodeId))
    .map((nodeId) => {
      const priorParentId = cleanSourceId(snapshotById.get(nodeId)?.parentId);
      const hasExactPlaceholder = introducedIds.has(nodeId);
      const priorParentSurvives = Boolean(
        priorParentId
        && (priorParentId === targetId || introducedIds.has(priorParentId)),
      );
      return {
        targetId: nodeId,
        parentId: hasExactPlaceholder
          ? targetId
          : priorParentSurvives
            ? priorParentId
            : targetId,
        runtimeInherited: true as const,
        preserveGeometry: !hasExactPlaceholder && !priorParentSurvives,
      };
    });
  const explicitProtectedPlacements = deduplicatedExplicitPlacements.filter((placement) => protectedIdSet.has(placement.targetId));
  const explicitNonProtectedPlacements = deduplicatedExplicitPlacements.filter((placement) => !protectedIdSet.has(placement.targetId));
  const placements = [
    ...explicitProtectedPlacements,
    ...inheritedPlacements,
    ...explicitNonProtectedPlacements,
  ].slice(0, 240);
  const operations: NorthstarArtboardMutationOperation[] = [{
    op: "set-attributes",
    targetId: "artboard",
    attributes: {
      "data-ns-creative-authority": "model-source",
      "data-ns-viewing-mode": viewingIntent.mode,
      "data-ns-primary-node-ids": viewingIntent.primaryNodeIds.join(" "),
      "data-ns-supporting-node-ids": viewingIntent.supportingNodeIds.join(" "),
      "data-ns-preserve-all-evidence": "true",
    },
  }, {
    op: "recompose-region",
    targetId,
    html,
    placements,
    retireNodeIds,
  }];
  const css = typeof sourceEdit.css === "string" ? sourceEdit.css.slice(0, 60000) : "";
  operations.push({
    op: "set-css-layer",
    layerId: "northstar-creative-source",
    css,
  });
  operations.push({
    op: "set-runtime-module",
    moduleId: "northstar-creative-source",
    javascript: typeof sourceEdit.javascript === "string" ? sourceEdit.javascript.slice(0, 80000) : "",
  });
  assertProtectedEvidenceOperations({ operations, protectedEvidenceNodeIds: protectedIds });
  return operations;
}

export function sanitizeNorthstarEmergentCreativeAct(
  draft: NorthstarEmergentCreativeActDraft,
  context?: {
    evidenceIdByNodeId?: ReadonlyMap<string, string> | Record<string, string>;
    protectedEvidenceNodeIds?: string[];
    semanticSnapshot?: NorthstarCommittedSemanticNode[];
  },
): NorthstarEmergentCreativeAct {
  if (!draft?.sourceEdit) throw new Error("The creative model did not return the required cumulative source revision.");
  const viewingIntent = normalizeNorthstarViewingIntent(draft.viewingIntent);
  const protectedEvidenceNodeIds = context?.protectedEvidenceNodeIds ?? [];
  const directSourceOperations = operationsFromSourceEdit(
    draft.sourceEdit,
    viewingIntent,
    protectedEvidenceNodeIds,
    context?.semanticSnapshot,
  );
  const rawOperations = [
    ...directSourceOperations,
    ...(Array.isArray(draft.exactActions)
      ? draft.exactActions as NorthstarArtboardMutationOperation[]
      : []),
  ];
  if (rawOperations.length === 0) {
    throw new Error("The creative model returned no executable source revision.");
  }
  assertProtectedEvidenceOperations({ operations: rawOperations, protectedEvidenceNodeIds });
  assertNoModelAuthoredArtboardSizing(rawOperations);
  const stage = draft.stage ?? {};

  const mutation = {
    ...sanitizeNorthstarArtboardMutationDraft({
      title: cleanText(stage.title, 180) || "Northstar creative source revision",
      description: cleanText(stage.description, 500) || "The same living artboard is being creatively revised from retained source.",
      visualStrategy: cleanText(stage.visualStrategy, 1600) || cleanText(draft.intention, 1600),
      visibleChange: cleanText(stage.visibleChange, 500) || "The living artboard materially changes.",
      geometryIntent: "preserve",
      transitionMs: Number(stage.transitionMs) || 280,
      operations: rawOperations,
      requiredPrimitives: [],
      constructionPlan: draft.constructionPlan,
    }),
    authoredIntention: [draft.intention, draft.viewerUnderstanding, stage.visibleChange]
      .map((value) => cleanText(value, 2000))
      .filter(Boolean)
      .join(" ")
      .slice(0, 6000),
  };
  assertNoModelAuthoredArtboardSizing(mutation.operations);

  const sourceFiles = draft.sourceEdit ? {
    targetId: cleanSourceId(draft.sourceEdit.targetId) || "presentation",
    html: typeof draft.sourceEdit.html === "string" ? draft.sourceEdit.html.trim().slice(0, 80000) : "",
    css: typeof draft.sourceEdit.css === "string" ? draft.sourceEdit.css.slice(0, 60000) : "",
    javascript: typeof draft.sourceEdit.javascript === "string" ? draft.sourceEdit.javascript.slice(0, 80000) : "",
  } : undefined;

  return {
    sourceFiles,
    intention: cleanText(draft.intention, 1800) || mutation.visualStrategy,
    viewerUnderstanding: cleanText(draft.viewerUnderstanding, 1200) || mutation.visibleChange,
    whyThisMoveNow: cleanText(draft.whyThisMoveNow, 1200) || "This is the most consequential next change supported by the current evidence and render.",
    continueWorking: draft.continueWorking !== false,
    successCriteria: cleanTextList(draft.successCriteria, 12, 500),
    viewingIntent,
    mutation,
    affectedNodeIds: collectAffectedNodeIds(mutation),
    evidenceRoles: collectEvidenceRoles(mutation, context),
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
    implementationDefects: cleanTextList(draft?.implementationDefects, 12, 500),
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
Put only source faults directly corroborated by the structured production-browser receipt in implementationDefects: browser-proven clipping, obscured or missing required evidence, broken/missing source content, invalid protected identity, unsafe overlap, or runtime/asset failure. Never classify incomplete cinema coverage, a simplified reveal, a changed intrinsic width, hypothetical smaller-display behavior, taste, hierarchy, originality, synthesis, or broader polish as implementationDefects; place those in whatStillWeak.
Judge the artifact against the user request, grounded evidence, the before render, the after render, sampled exact compositor cinema frames, the stable premium-workspace frame, and the model's declared intention.
Do not repeat the authored intention as if it were visual evidence. Claims such as "screens are smaller," "evidence is secondary," "layout is precise," "everything is collision-free," or "the work fits in one frame" must agree with the structured outer-canvas measurements and the actual workspace image. When intention and pixels disagree, describe the contradiction plainly.
Every grounded screenshot must remain present and fully inspectable. Cropping, masking, clipping, object-fit cover, collapsed containers, or a replacement that silently loses an evidence identity are implementation defects; proportional resizing, movement, annotation, and model-authored transformation are allowed.
Treat browser-proven accidental blank teardown, a half-materialized final state, clipped/obscured evidence, or host-background leakage inside the authored surface as implementation defects. Treat uncovered cinema nodes, generic, trivial, or semantically unmotivated choreography, and responsive opportunities without a measured failure as creative weaknesses in whatStillWeak rather than inventing a required beat grammar.
Do not propose artboard dimensions or infer failure merely because intrinsic dimensions changed. The runtime owns content-derived sizing and reports actual clipping or overflow separately.
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
    instruction: "Inspect the complete before/after result and any exact compositor cinema frames directly. Explain whether the act materially improved communication, whether the source-to-source transition remained visually continuous, and what, if anything, the creative agent should do next.",
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

${buildNorthstarEmergentDesignBehaviorAddendum()}

CREATIVE AUTHORITY
- Invent the right visual artifact from the user request, current evidence, research, and exact rendered artboard. Form the governing idea inline and author the actual retained presentation source; there is no later template-selection call.
- There are no visual families, templates, archetypes, component recipes, prescribed module orders, or card systems to choose from.
- Do not imitate a reference composition. Infer the shared level of taste, finish, clarity, restraint, evidence choreography, and originality, then create what this problem uniquely needs.
- The inherited layout is disposable presentation scaffolding. Preserve truth, evidence identities, provenance, the permanent artboard root, and runtime safety—not the current screenshot rows, title placement, card language, module boundaries, or analytical furniture.
- You may add, remove, rewrite, regroup, reorder, restyle, connect, annotate, simplify, or substantially recompose content inside the existing artboard. Use destructive reconstruction when it is the clearest route to the governing visual idea.
- The permanent presentation node is a deliberately replaceable creative layer. You may set-html on presentation, introduce a new composition shell, then move real grounded evidence nodes into it. When replacing presentation, recreate the semantic anchors data-ns-node-id="synthesis" and data-ns-node-id="decision" somewhere meaningful inside the new composition so later reasoning and publication can continue. The evidence reservoir is source material, not the final layout; it remains a quiet native inspectable source ledger. Move the representative evidence needed for this visible stage into the presentation and leave unplaced grounded evidence safely inspectable for later stages; do not force the entire evidence corpus into one monolithic first commit.
- Cards, panels, pills, borders, rounded boxes, and filled regions are never neutral defaults. Use a boundary only when the boundary itself clarifies grouping, proof, comparison, interaction, or meaning. Open surface, typography, evidence, lines, paths, scale, overlap, rhythm, and negative space are first-class design materials.
- Low, Medium, and High share the same publication-quality floor. Thinking depth changes persistence, not the ambition or intelligence of the visual solution.
- Work inside one bounded retained private source workspace. Edit HTML, CSS, SVG, semantic DOM movement, and safe JavaScript cumulatively until the smallest consequential stage is production-runtime safe. Commit that stage promptly; broader creative opportunities belong to the next visible stage so the user experiences the artboard evolving.

TRUTH AND EVIDENCE
- Every factual claim, metric, screenshot, quotation, and conclusion must remain grounded in the supplied research and evidence.
- Never invent evidence IDs, asset URLs, metrics, source claims, or unsupported certainty.
- Preserve protected screenshots and their provenance even when their presentation changes.
- Author relationships, annotations, diagrams, and analytical forms directly in HTML, CSS, SVG, or safe JavaScript. The runtime does not classify or grade them as primitives.
- Browser geometry helpers are optional callable capabilities exposed through Northstar.measure and Northstar.routeBetween. They return geometry or a structured runtime error; they never become compiler-owned visual obligations.
- Separate observed facts from interpretation. Do not claim conversion lift, retention impact, drop-off rates, optimization outcomes, or causal business effects unless those values or outcomes are present in grounded research. Qualitative encodings must be labeled as interpretive and tied to exact observed steps.

EXECUTION
- Use sourceEdit as the primary visual coding output. targetId is normally presentation; html is the complete cumulative inner HTML/SVG source for that creative surface; css is the complete cumulative creative CSS layer; javascript is the complete cumulative safe vanilla-JavaScript module. The runtime may translate these files into atomic transport operations, but the files—not a primitive template—are the authored source of truth.
- sourceEdit.javascript must be deterministic and synchronous, use only the supplied Northstar/data/creative/reviews arguments, may inspect geometry through Northstar.measure and Northstar.routeBetween, install interaction listeners through Northstar.query/queryAll, and return one cleanup function when it installs listeners. Do not use ambient browser globals, timers, asynchronous work, networking, navigation, storage, or cross-context messaging.
- Every grounded evidence screen is permanent for this run. You may move, resize proportionally, annotate, connect, sequence, or transform every screen, but you may not remove, retire, hide, replace, omit, crop, mask, or visually truncate any evidence identity. The complete screenshot surface must remain inspectable; do not fade evidence below a legible supporting level.
- sourceEdit.placements names only grounded evidence nodes you intentionally move. The runtime automatically preserves every unmentioned protected evidence node, reuses an exact semantic placeholder or surviving parent when available, and otherwise retains its prior artboard-relative geometry inside the replacement surface.
- Use exactActions only for additional exact DOM movement, attributes, or bindings that should accompany the source revision.
- New HTML elements must receive unique data-ns-node-id values.
- For a structural rebuild, author the complete replacement source yourself and list only the evidence moves that are part of your design. The runtime owns survival of all other protected nodes; it does not invent your shell, lane, frame, hierarchy, or layout.
- You may author safe HTML fragments, SVG, typography, CSS, visual relationships, evidence choreography, grounded charts, graphs, plots, diagrams, maps, timelines, image crops, masks, editorial compositions, and hybrids. No medium is preferred or required; choose the one that best communicates grounded truth.
- Execute the governing idea as a coherent whole scene. Do not translate an ambitious visual thesis into a few labels placed around the inherited grid.
- Keep factual relationships grounded in exact evidence identities. You decide whether they appear through source structure, typography, proximity, SVG, animation, or safe JavaScript.
- Use any authored spatial technique the composition needs inside the creative surface. Browser measurement may inform your source through Northstar.measure and Northstar.routeBetween, but it does not prescribe placement or visual form.
- Decide the scope and structure of each meaningful stage yourself. The runtime will not require lanes, synthesis regions, decision regions, or any predefined communication reflow.
- Quantitative graphics must use grounded values, honest units/scales, and traceable evidence. Qualitative graphics must be labeled as interpretation. You author the SVG, HTML, CSS, and interaction directly; no compiler generates or grades the visual form.
- The authored HTML, CSS, SVG, JavaScript, and evidence choreography are the sole visual authority. Deterministic code may validate safety, truth, identity, and execution, but it may not reinterpret the design through a primitive system.


- Return constructionPlan as 2–12 meaningful perceptual beats. The browser and cinema layer own timing normalization, exact geometry, cancellation, and final settlement; you own the dramatic sequence and the meaning of each reveal. Coverage is a presentation aid, not a reason to reject a correct final scene.
- Construction beats describe how the viewer should experience the source evolution, not a runtime-owned operation grammar. Group the authored changes into purposeful moments in the order your design requires.
- Use cinematic mode and as many distinct beats as the authored transformation needs. If one effect cannot be animated safely, the runtime may simplify only that effect and must still settle to the exact authored final state.
- Do not replace, remove, or move the permanent artboard root.
- Do not place script tags, inline event-handler attributes, iframes, external resources, forms, or CSS url() references in sourceEdit.html/css. Put safe interaction logic only in sourceEdit.javascript.

OUTER-CANVAS VIEWING INTENT
- Return viewingIntent for the exact Northstar workspace experience. Choose single-frame, zoom-and-inspect, or scrolling-artboard deliberately.
- preserveAllEvidence must always be true. primaryNodeIds and supportingNodeIds describe your hierarchy; they do not authorize dropping, cropping, masking, or truncating any screen.
- A single-frame revision must remain readable inside the stable existing outer Canvas object. A zoom-and-inspect revision must preserve a useful overview before detail inspection. A scrolling-artboard may extend vertically but must keep a stable readable width.
- The private review will show both the intrinsic source and a premium Northstar workspace-fit preview. Correct the source when the actual fit contradicts your declared viewing intent.

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
- A cleaner evidence grid, a thesis inside a rounded rectangle, or a new strip of cards is not a governing visual idea. Do not stop at organized inventory.
- Fidelity is mandatory: the spatial logic, signature move, medium strategy, scene execution plan, precision strategy, and evidence choreography you form must be visibly realized in the authored source.
- Prefer one decisive structural reconstruction over several timid additions when the current scene still contradicts the governing idea.
- The visual argument must survive when explanatory prose and container chrome are mentally removed.

Return only the required JSON object. The cumulative source revision must visibly execute the intention you describe.
`.trim();
}


function processNeedContract(obligation: NorthstarObligationKey): string[] {
  switch (obligation) {
    case "evidence-hierarchy":
      return [
        "Make the evidence hierarchy perceptible in the authored source while preserving every grounded identity and provenance record.",
        "Use semantic evidence-role metadata when useful for inspection, but choose the visual hierarchy yourself.",
      ];
    case "hypothesis-tested":
      return [
        "Make the current interpretation visibly respond to exact grounded proof rather than merely restating it.",
        "Choose the source-level visual form yourself; retain evidence identities wherever factual claims are expressed.",
      ];
    case "relationship-visible":
      return [
        "Make the relevant evidence-to-conclusion relationship understandable in the authored composition.",
        "Express it through any source-level medium you choose. Northstar.measure and Northstar.routeBetween are optional geometry helpers, not required contracts.",
      ];
    case "synthesis":
      return [
        "Resolve the research into a substantive evidence-grounded implication using whatever source structure best serves the design.",
        "Do not invent conversion, retention, drop-off, or causal outcomes that are absent from the evidence.",
      ];
    case "contextual-resolution":
      return [
        "Resolve the open question or decision context with a visible grounded conclusion in the authored source.",
        "Preserve traceability to exact proof without requiring a named conclusion region or visual grammar.",
      ];
    case "reasoning-placement":
      return [
        "Keep the current interpretation inspectable while it is still part of the model's chosen visual story.",
        "Choose its placement and form yourself while preserving browser operability and evidence readability.",
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
  designIntelligence: unknown;
  acceptedCreativeActCount: number;
  requiredFirstActFlowNodeIds?: string[];
  priorCritique?: { critique: string; requiredChanges: string[] };
  sourceWorkspace?: Record<string, unknown>;
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
    persistentSourceWorkspace: input.sourceWorkspace,
    emergentDesignIntelligence: input.designIntelligence,
    acceptedCreativeActCount: input.acceptedCreativeActCount,
    firstCreativeActExecutionContract: input.acceptedCreativeActCount === 0
      ? {
          groundedFlowNodeIds: input.requiredFirstActFlowNodeIds ?? [],
          instruction: "Every grounded screen in these flows must remain present and inspectable in every cumulative source revision. Recompose, move, proportionally resize, annotate, sequence, or transform them as the design requires, but list placements only for screens you intentionally move. The runtime automatically inherits all unmentioned protected screens and resolves aliases to canonical identities. Never crop, mask, truncate, or trim a screenshot surface.",
        }
      : undefined,
    permanentCreativeSurfaceContract: {
      presentationNodeId: "presentation",
      requiredPresentationAnchors: [],
      evidenceReservoirNodeId: "evidence-reservoir",
      instruction: "The presentation node may be destructively reconstructed, but every grounded screen is permanent. The evidence reservoir may be reorganized, moved, annotated, proportionally scaled, sequenced, or integrated into the presentation; no evidence node may be omitted, retired, hidden, replaced, cropped, masked, or visually truncated.",
    },
    previousRejectedOrWeakAttempt: input.priorCritique,
    instruction: [
      "Re-observe the whole artifact and edit the retained private HTML/CSS/SVG/DOM workspace toward the smallest consequential stage worth committing now.",
      "Do not choose from or infer an implementation-owned visual family, template, composition recipe, or obligation sequence.",
      "You may continue, redirect, simplify, or substantially recompose prior work when the exact render and evidence justify it.",
      input.acceptedCreativeActCount === 0
        ? "This is the first creative act: materially recompose the presentation and transform the choreography of the complete grounded evidence set. Do not merely add a thesis card, edit the title, or preserve the screenshot wall as the governing composition. Author the strongest HTML/CSS/SVG structure directly, preserve every screen, and use hierarchy, annotations, sequencing, interaction, or spatial transformation to prevent the evidence from becoming an equal-weight wall. Use Northstar.measure or Northstar.routeBetween from safe JavaScript only when browser geometry helps the design; the model remains responsible for how the result is expressed."
        : "Build directly on the latest browser-verified composition, but destroy or replace weak earlier work when the governing idea demands it.",
      "Use sourceEdit as the visual coding surface: target the replaceable presentation region and return its complete cumulative inner HTML/SVG, complete cumulative creative CSS layer, and complete cumulative safe JavaScript module. List placements only for grounded evidence nodes you intentionally move; the runtime automatically preserves unmentioned protected screens through exact placeholders, surviving parents, or geometry-preserving fallback placement. Use exactActions only for additional exact DOM actions. Browser geometry helpers are callable from sourceEdit.javascript and are not declarative design contracts. Runtime-owned measurement controls outer sizing and resolves evidence aliases before execution.",
      "Author charts, diagrams, matrices, timelines, annotations, connectors, evidence fields, and custom analytical forms directly in safe HTML/CSS/SVG/JavaScript when that best serves the idea. No runtime primitive catalogue, placement grammar, or minimum-instance contract may govern the composition.",
      "Return a purposeful constructionPlan for the cinema layer. Every materially changed region should have a stable semantic identity and the important visual evolution should unfold in perceptible beats, while incomplete animation coverage remains non-blocking and the browser always settles to the exact authored final state.",
      input.acceptedCreativeActCount > 0
        ? "When this stage could plausibly be the ending, resolve or remove working-only hypothesis chrome inside the authored scene itself. Publication will mark the exact accepted browser revision as verified; it will not run a separate cleanup mutation."
        : "The first stage may remain visibly exploratory while establishing a consequential evidence composition.",
      input.sourceWorkspace && Boolean((input.sourceWorkspace as { hasAppliedFallback?: unknown }).hasAppliedFallback)
        ? "Continue editing the retained cumulative source files instead of re-authoring from zero. Preserve every valid HTML, CSS, safe JavaScript interaction, SVG fragment, and grounded evidence move unless exact runtime feedback proves it wrong."
        : "No private source revision exists yet; author the first executable source stage now.",
      "A runtime-applied stage should be committed promptly. Leave broader hierarchy, synthesis, and polish opportunities for the next visible stage instead of hiding the entire creative evolution inside one long private call.",
      "Choose any source structure that best communicates the result. No named region, lane, matrix, synthesis block, decision block, or placement grammar is required by the runtime.",
      "Use only evidence-supported language. Qualitative comparisons may interpret observed steps, but must not masquerade as measured conversion, retention, or drop-off data.",
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
