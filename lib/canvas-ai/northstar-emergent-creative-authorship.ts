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
import { buildNorthstarCurrentDesignReading } from "@/lib/canvas-ai/northstar-design-intelligence";
import {
  buildNorthstarEmergentDesignBehaviorAddendum,
  NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_JSON_SCHEMA,
  sanitizeNorthstarEmergentDesignIntelligence,
  type NorthstarEmergentDesignIntelligence,
  type NorthstarEmergentDesignIntelligenceDraft,
} from "@/lib/canvas-ai/northstar-emergent-design-intelligence";
import {
  assessNorthstarStructuralNovelty,
  northstarPremiumContractAttributes,
  type NorthstarNoveltyReceipt,
} from "@/lib/canvas-ai/northstar-premium-design-contract";
import { normalizeNorthstarViewingIntent } from "@/lib/canvas-ai/northstar-viewing-intent";
import type {
  NorthstarEvidenceRole,
  NorthstarObligationKey,
  NorthstarVisualOperationKind,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";

export const NORTHSTAR_EMERGENT_CREATIVE_AUTHORSHIP_VERSION =
  "northstar.emergent-creative-authorship.v3.7" as const;

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

export type NorthstarCreativeChangeScope = "local" | "regional" | "whole-composition";

export interface NorthstarCreativeDesignContinuityDraft {
  preserve?: string[];
  change?: string[];
  scope?: NorthstarCreativeChangeScope;
  targetNodeIds?: string[];
  topologyChange?: boolean;
  topologyChangeReason?: string;
}

export interface NorthstarCreativeDesignContinuity {
  preserve: string[];
  change: string[];
  scope: NorthstarCreativeChangeScope;
  targetNodeIds: string[];
  topologyChange: boolean;
  topologyChangeReason: string;
}

export interface NorthstarEmergentCreativeActDraft {
  /** The problem-specific design contract authored in the same model response as its executable source. */
  designIntelligence?: NorthstarEmergentDesignIntelligenceDraft;
  /** Explicit continuity reasoning performed before source authorship in this same response. */
  designContinuity?: NorthstarCreativeDesignContinuityDraft;
  intention?: string;
  viewerUnderstanding?: string;
  whyThisMoveNow?: string;
  continueWorking?: boolean;
  successCriteria?: string[];
  /** Model-owned declaration of how the complete preserved evidence should be experienced in the Northstar workspace. */
  viewingIntent?: Partial<NorthstarArtifactViewingIntent>;
  /** Direct cumulative HTML/CSS/SVG/JavaScript edit of the browser-committed presentation source. */
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
  designIntelligence: NorthstarEmergentDesignIntelligence;
  designContinuity: NorthstarCreativeDesignContinuity;
  noveltyReceipt: NorthstarNoveltyReceipt;
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
  /** Deterministic policy repairs applied before the mutation reaches the browser. */
  sanitizationRepairs: string[];
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
    "designIntelligence",
    "designContinuity",
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
    designIntelligence: NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_JSON_SCHEMA,
    designContinuity: {
      type: "object",
      additionalProperties: false,
      required: ["preserve", "change", "scope", "targetNodeIds", "topologyChange", "topologyChangeReason"],
      properties: {
        preserve: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: { type: "string", minLength: 1, maxLength: 360 },
        },
        change: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: { type: "string", minLength: 1, maxLength: 360 },
        },
        scope: { type: "string", enum: ["local", "regional", "whole-composition"] },
        targetNodeIds: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: { type: "string", minLength: 1, maxLength: 120 },
        },
        topologyChange: { type: "boolean" },
        topologyChangeReason: { type: "string", maxLength: 900 },
      },
    },
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
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;
const DIMENSION_DECLARATION = /(^|;)\s*(width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size)\s*:[^;}]*(?=;|$)/gi;

function isPermanentArtboardSelector(selector: string): boolean {
  const value = selector.trim();
  if (!value || /[>+~\s]/.test(value)) return false;
  return /^(?:\.ns-artifact|\[data-ns-node-id\s*=\s*["']artboard["']\]|#artboard|:root|html|body)(?:$|[.#:]|\[)/i.test(value);
}

function stripRootDimensionDeclarations(css: string): { css: string; removedProperties: string[] } {
  const removedProperties: string[] = [];
  const repairedCss = css.replace(CSS_RULE, (rule, selectorText: string, declarations: string) => {
    const selectors = selectorText.split(",").map((selector) => selector.trim()).filter(Boolean);
    const rootSelectors = selectors.filter(isPermanentArtboardSelector);
    if (rootSelectors.length === 0) return rule;
    const nonRootSelectors = selectors.filter((selector) => !isPermanentArtboardSelector(selector));
    const repairedDeclarations = declarations
      .replace(
        DIMENSION_DECLARATION,
        (declaration, prefix: string, property: string) => {
          removedProperties.push(property.toLowerCase());
          return "";
        },
      )
      .replace(/^\s*;+/, "")
      .replace(/;{2,}/g, ";")
      .trim();
    const repairedRules: string[] = [];
    if (repairedDeclarations) repairedRules.push(`${rootSelectors.join(",")}{${repairedDeclarations}}`);
    if (nonRootSelectors.length > 0) repairedRules.push(`${nonRootSelectors.join(",")}{${declarations}}`);
    return repairedRules.join("");
  });
  return {
    css: repairedCss,
    removedProperties: Array.from(new Set(removedProperties)),
  };
}

function repairModelAuthoredArtboardSizing(
  operations: NorthstarArtboardMutationOperation[],
): { operations: NorthstarArtboardMutationOperation[]; repairs: string[] } {
  const repairs: string[] = [];
  const repaired = operations.flatMap<NorthstarArtboardMutationOperation>((operation) => {
    if (operation.op === "request-space") {
      repairs.push("Ignored a model-authored request-space operation; canonical geometry remains content-derived.");
      return [];
    }
    if (operation.op === "set-styles" && ROOT_NODE_IDS.has(operation.targetId)) {
      const styles = Object.fromEntries(
        Object.entries(operation.styles ?? {}).filter(([key]) => !DIMENSION_STYLE_KEYS.has(key.trim().toLowerCase())),
      );
      const removed = Object.keys(operation.styles ?? {}).filter((key) =>
        DIMENSION_STYLE_KEYS.has(key.trim().toLowerCase()),
      );
      if (removed.length > 0) {
        repairs.push(`Removed runtime-owned root sizing styles: ${removed.join(", ")}.`);
      }
      return Object.keys(styles).length > 0 ? [{ ...operation, styles }] : [];
    }
    if (operation.op === "set-css-layer") {
      const result = stripRootDimensionDeclarations(operation.css);
      if (result.removedProperties.length > 0) {
        repairs.push(`Removed runtime-owned root sizing declarations from CSS: ${result.removedProperties.join(", ")}.`);
      }
      return [{ ...operation, css: result.css }];
    }
    return [operation];
  });
  return { operations: repaired, repairs: Array.from(new Set(repairs)).slice(0, 12) };
}

function assertNoModelAuthoredArtboardSizing(operations: NorthstarArtboardMutationOperation[]): void {
  for (const operation of operations) {
    if (operation.op === "request-space") {
      throw new Error("Internal invariant: request-space survived creative-source sanitization.");
    }
    if (operation.op === "set-styles" && ROOT_NODE_IDS.has(operation.targetId)) {
      const offending = Object.keys(operation.styles ?? {}).filter((key) =>
        DIMENSION_STYLE_KEYS.has(key.trim().toLowerCase()),
      );
      if (offending.length > 0) {
        throw new Error(`Internal invariant: root sizing styles survived sanitization (${offending.join(", ")}).`);
      }
    }
    if (operation.op === "set-css-layer") {
      const verification = stripRootDimensionDeclarations(operation.css);
      if (verification.removedProperties.length > 0) {
        throw new Error("Internal invariant: root sizing declarations survived CSS sanitization.");
      }
    }
  }
}

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

function sanitizeNorthstarCreativeDesignContinuity(
  value: NorthstarCreativeDesignContinuityDraft | undefined,
  draft: NorthstarEmergentCreativeActDraft,
): NorthstarCreativeDesignContinuity {
  const scope: NorthstarCreativeChangeScope = value?.scope === "whole-composition"
    ? "whole-composition"
    : value?.scope === "regional"
      ? "regional"
      : "local";
  const targetNodeIds = cleanTextList(value?.targetNodeIds, 24, 120);
  const preserve = cleanTextList(value?.preserve, 16, 360);
  const change = cleanTextList(value?.change, 12, 360);
  const sourceTarget = cleanSourceId(draft.sourceEdit?.targetId) || "presentation";
  const topologyChange = Boolean(value?.topologyChange || scope === "whole-composition");

  return {
    preserve: preserve.length
      ? preserve
      : [
          "The current artboard's successful typography, palette, spacing rhythm, surfaces, reading order, and media treatment.",
          "Grounded evidence identity, grouping, sequence order, aspect ratio, and approximate relative screenshot scale.",
        ],
    change: change.length
      ? change
      : [cleanText(draft.intention, 360) || "Advance the objective with one consequential source edit."],
    scope,
    targetNodeIds: targetNodeIds.length ? targetNodeIds : [sourceTarget],
    topologyChange,
    topologyChangeReason: topologyChange
      ? cleanText(value?.topologyChangeReason, 900)
        || "The current structure cannot express the required viewer outcome without a broader composition change."
      : "",
  };
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
  artboardAttributes: Record<string, string>,
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
      ...artboardAttributes,
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
    diversityAnchor?: string;
    groundedEvidenceIds?: string[];
    recentCreativeSignatures?: readonly string[];
    requireStructuralNovelty?: boolean;
  },
): NorthstarEmergentCreativeAct {
  if (!draft?.sourceEdit) throw new Error("The creative model did not return the required cumulative source revision.");
  if (!draft?.designIntelligence) {
    throw new Error("The creative model did not return the required design intelligence with its source revision.");
  }
  const designIntelligence = sanitizeNorthstarEmergentDesignIntelligence(
    draft.designIntelligence,
    {
      diversityAnchor: cleanText(context?.diversityAnchor, 80),
      groundedEvidenceIds: context?.groundedEvidenceIds ?? [],
    },
  );
  const designContinuity = sanitizeNorthstarCreativeDesignContinuity(
    draft.designContinuity,
    draft,
  );
  const noveltyReceipt = assessNorthstarStructuralNovelty({
    signature: designIntelligence.premiumPlan.noveltySignature,
    recentSignatures: context?.recentCreativeSignatures ?? [],
  });
  // Novelty is a rendered-quality obligation, not an executable-source parser.
  // Keep the receipt for browser review and subsequent refinement, but never
  // suppress a safe cumulative source revision before the user can see it.
  const viewingIntent = normalizeNorthstarViewingIntent(draft.viewingIntent);
  const protectedEvidenceNodeIds = context?.protectedEvidenceNodeIds ?? [];
  const directSourceOperations = operationsFromSourceEdit(
    draft.sourceEdit,
    viewingIntent,
    protectedEvidenceNodeIds,
    northstarPremiumContractAttributes(
      designIntelligence.premiumPlan,
      context?.recentCreativeSignatures ?? [],
    ),
    context?.semanticSnapshot,
  );
  const authoredOperations = [
    ...directSourceOperations,
    ...(Array.isArray(draft.exactActions)
      ? draft.exactActions as NorthstarArtboardMutationOperation[]
      : []),
  ];
  const sizingRepair = repairModelAuthoredArtboardSizing(authoredOperations);
  const rawOperations = sizingRepair.operations;
  if (rawOperations.length === 0) {
    throw new Error("The creative model returned no executable source revision after runtime-owned geometry controls were removed.");
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

  const repairedSourceCss = rawOperations.find((operation) =>
    operation.op === "set-css-layer" && operation.layerId === "northstar-creative-source"
  );
  const sourceFiles = draft.sourceEdit ? {
    targetId: cleanSourceId(draft.sourceEdit.targetId) || "presentation",
    html: typeof draft.sourceEdit.html === "string" ? draft.sourceEdit.html.trim().slice(0, 80000) : "",
    css: repairedSourceCss?.op === "set-css-layer" ? repairedSourceCss.css : "",
    javascript: typeof draft.sourceEdit.javascript === "string" ? draft.sourceEdit.javascript.slice(0, 80000) : "",
  } : undefined;

  return {
    designIntelligence,
    designContinuity,
    noveltyReceipt,
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
    sanitizationRepairs: sizingRepair.repairs,
  };
}

function isRootGeometryMagnitudeClaim(value: string): boolean {
  if (!/(?:artboard|canvas|viewport)/i.test(value)) return false;
  if (!/(?:width|height|dimensions?|bounds?|footprint|size|px)/i.test(value)) return false;
  if (/(?:overflow|clipp|overlap|nan|infinite|empty|missing|required node|asset)/i.test(value)) return false;
  return /(?:execution fault|unusable|too (?:large|tall|wide)|standard|force|reset|set|constrain|\d{3,6}\s*(?:px|[x×]))/i.test(value);
}

function isForbiddenRootSizingRecommendation(value: string): boolean {
  return /(?:force|reset|set|constrain|standard(?:ize)?)\b[^.]{0,120}(?:artboard|canvas|viewport)?[^.]{0,80}(?:width|height|dimensions?|\d{3,6}\s*(?:px|[x×]))/i.test(value)
    || /(?:artboard|canvas|viewport)[^.]{0,100}\d{3,6}\s*[x×]\s*\d{3,6}/i.test(value);
}

export function sanitizeNorthstarEmergentCreativeCritique(
  draft: NorthstarEmergentCreativeCritiqueDraft,
): NorthstarEmergentCreativeCritique {
  const rawWeaknesses = cleanTextList(draft?.whatStillWeak, 12, 500);
  const rawDefects = cleanTextList(draft?.implementationDefects, 12, 500);
  const geometryMagnitudeConcerns = rawDefects.filter(isRootGeometryMagnitudeClaim);
  const recommendedNextMove = cleanText(draft?.recommendedNextMove, 1600);
  return {
    summary: cleanText(draft?.summary, 1600) || "The rendered creative act was inspected against the exact verified artboard.",
    observedEffect: cleanText(draft?.observedEffect, 1600) || "The browser-visible effect requires further interpretation.",
    whatImproved: cleanTextList(draft?.whatImproved, 12, 500),
    whatStillWeak: Array.from(new Set([
      ...rawWeaknesses,
      ...geometryMagnitudeConcerns.map((item) =>
        `Composition scale or density concern: ${item} Resolve it by curating, relocating, or restructuring authored content; never by setting root artboard dimensions.`
      ),
    ])).slice(0, 12),
    implementationDefects: rawDefects.filter((item) => !isRootGeometryMagnitudeClaim(item)),
    recommendedNextMove: isForbiddenRootSizingRecommendation(recommendedNextMove)
      ? "Curate and restructure the authored content to improve hierarchy and density. Keep the permanent artboard root dimension-free and let canonical runtime measurement derive the resulting bounds."
      : recommendedNextMove || "Continue from the exact render only when another material improvement is justified.",
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
Compare the before and after result for design continuity: typography, palette, spacing rhythm, surfaces, major region relationships, reading order, screenshot grouping, authoritative sequence order, intrinsic aspect ratio, and relative display scale. Generic vertical reflow, accidental full-width media, or one mobile screenshot becoming the dominant artboard surface are creative regressions unless the authored act explicitly and successfully justified them.
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
    instruction: "Inspect the complete before/after result and any exact compositor cinema frames directly. Explain whether the act materially improved communication and preserved or intentionally evolved the current typography, palette, spacing, topology, screenshot grouping, sequence, aspect ratio, and relative scale. Do not credit intended hierarchy when the pixels contradict it. When fresh pixels are unavailable, state that limitation and make only source-grounded claims.",
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
- Invent the right visual artifact from the user request, current evidence, research, and exact rendered artboard. Return designIntelligence and the source that visibly executes it in this same response; there is no later template-selection or design-planning call.
- There are no visual families, templates, archetypes, component recipes, prescribed module orders, or card systems to choose from.
- Do not imitate a reference composition. Infer the shared level of taste, finish, clarity, restraint, evidence choreography, and originality, then create what this problem uniquely needs.
- The exact current artboard is the primary design precedent. Preserve its successful typography, palette, spacing, surfaces, screenshot scale, grouping, sequence, layout topology, and reading order unless this action has a specific reason to change one of them.
- You may add, rewrite, restyle, connect, annotate, simplify, move, or recompose content inside the existing artboard. Prefer a local edit, then a regional edit. Use a whole-composition rewrite only when the current structure cannot satisfy the user objective and explain that necessity in designContinuity.
- The presentation node is available for a genuinely necessary whole-composition change, but it is not the default target. Target the smallest existing semantic region that can express the next improvement. When a whole presentation rewrite is necessary, preserve or deliberately recreate the semantic anchors data-ns-node-id="synthesis" and data-ns-node-id="decision", and preserve the current artboard's successful design language unless the user explicitly requested a different one.
- Cards, panels, pills, borders, rounded boxes, and filled regions are never neutral defaults. Use a boundary only when the boundary itself clarifies grouping, proof, comparison, interaction, or meaning. Open surface, typography, evidence, lines, paths, scale, overlap, rhythm, and negative space are first-class design materials.
- Low, Medium, and High share the same publication-quality floor. Thinking depth changes deliberation depth per decision, not the ambition, design language, or number of actions available.
- Work directly from the exact browser-committed source. Edit HTML, CSS, SVG, semantic DOM movement, and safe JavaScript cumulatively. Return the smallest consequential stage promptly: deterministic code normalizes and preflights it, then the mounted browser performs its only runtime execution and either commits atomically or restores the accepted revision. Broader creative opportunities belong to the next visible stage so the user experiences the artboard evolving.

DESIGN CONTINUITY DECLARATION
- Return designContinuity before sourceEdit in the same JSON response.
- preserve must name concrete current decisions that remain authoritative: typography, palette, spacing rhythm, surfaces, major region relationships, reading order, screenshot scale, grouping, and sequence as applicable.
- change must name only what this action visibly changes.
- scope is local, regional, or whole-composition. Use local by default.
- targetNodeIds must use exact IDs supplied in the editable surface, unless the same sourceEdit explicitly creates a new semantic node.
- topologyChange is false unless the action intentionally changes the major reading path or group orientation. When true, topologyChangeReason must explain why the current topology cannot satisfy the objective.
- Do not claim preservation and then replace the full presentation, discard the current CSS language, enlarge screenshots indiscriminately, or turn horizontal evidence sequences into generic vertical flow.

TRUTH AND EVIDENCE
- Every factual claim, metric, screenshot, quotation, and conclusion must remain grounded in the supplied research and evidence.
- Never invent evidence IDs, asset URLs, metrics, source claims, or unsupported certainty.
- Preserve protected screenshots, provenance, aspect ratio, grouping, sequence order, and approximate relative display scale even when their presentation changes.
- Author relationships, annotations, diagrams, and analytical forms directly in HTML, CSS, SVG, or safe JavaScript. The runtime does not classify or grade them as primitives.
- Browser geometry helpers are optional callable capabilities exposed through Northstar.measure and Northstar.routeBetween. They return geometry or a structured runtime error; they never become compiler-owned visual obligations.
- Separate observed facts from interpretation. Do not claim conversion lift, retention impact, drop-off rates, optimization outcomes, or causal business effects unless those values or outcomes are present in grounded research. Qualitative encodings must be labeled as interpretive and tied to exact observed steps.

EXECUTION
- Use sourceEdit as the primary visual coding output. targetId should be the smallest supplied semantic region that can express the action; use presentation only for a justified whole-composition change. html is the complete cumulative inner HTML/SVG source for that target; css is the complete cumulative creative CSS layer; javascript is the complete cumulative safe vanilla-JavaScript module. The runtime may translate these files into atomic transport operations, but the files—not a primitive template—are the authored source of truth.
- sourceEdit.javascript must be deterministic and synchronous, use only the supplied Northstar/data/creative/reviews arguments, may inspect geometry through Northstar.measure and Northstar.routeBetween, install interaction listeners through Northstar.query/queryAll, and return one cleanup function when it installs listeners. Do not use ambient browser globals, timers, asynchronous work, networking, navigation, storage, or cross-context messaging.
- The complete ordered evidence flow is the canonical research record for this run, not a pool of representative screenshots to prune. The runtime review's evidenceRegistry.presentationManifest identifies each screen's node, flow, order, current geometry, aspect ratio, crop, and transform. Keep every original screen in its flow, complete and inspectable, with its existing premium treatment. Design may annotate, connect, regroup, frame, or add new analytical regions to this evidence, but it must not replace the canonical field with a shorter selected subset.
- Creative emphasis is additive. You may copy a grounded screen into a separate analytical, comparative, or annotated region when that makes a specific insight clearer, but mark the new node with data-ns-derived-from-evidence containing the source evidence ID. A derived copy is a citation or detail view: it never replaces, hides, demotes, or stands in for the original screen in the canonical flow. On the first design act, retain the canonical research section while freely making visibly meaningful annotations, connectors, labels, spacers, paths, relationships, or new analytical regions around, between, or after its screens. A new synthesis may be placed below the research section when useful, but that is one compositional option, not a requirement. Do not target or replace the artboard root, presentation, evidence reservoir, working flow, or a flow sequence merely to make a comparison. Let the artboard grow when the composition needs additional space instead of clearing research to make room. Use sourceEdit.placements when deliberately moving original screens as a group. Preserve each original screen's intrinsic aspect ratio, complete image surface, app/flow identity, and premium card treatment while doing so.
- sourceEdit.placements names only grounded evidence nodes you intentionally move. The runtime automatically preserves every unmentioned protected evidence node, reuses an exact semantic placeholder or surviving parent when available, and otherwise retains its prior artboard-relative geometry inside the replacement surface.
- Use exactActions only for additional exact DOM movement, attributes, or bindings that should accompany the source revision.
- New HTML elements must receive unique data-ns-node-id values.
- For a necessary structural rebuild, author the complete replacement source yourself and list only the evidence moves that are part of your design. A structural rebuild is exceptional: designContinuity must name what remains authoritative, what changes, and why the current topology cannot satisfy the objective.
- You may author safe HTML fragments, SVG, typography, CSS, visual relationships, evidence choreography, grounded charts, graphs, plots, diagrams, maps, timelines, editorial compositions, and hybrids. Crop or mask ordinary photos and illustrations only when explicitly intentional; never crop or mask grounded product screenshots. No medium is preferred or required; choose the one that best communicates grounded truth.
- Execute the governing idea coherently at the scope this action actually requires. A local or regional improvement is valid when it materially advances the objective and preserves a strong existing scene.
- Keep factual relationships grounded in exact evidence identities. You decide whether they appear through source structure, typography, proximity, SVG, animation, or safe JavaScript.
- Use any authored spatial technique the composition needs inside the creative surface. Browser measurement may inform your source through Northstar.measure and Northstar.routeBetween, but it does not prescribe placement or visual form.
- Decide the scope and structure of each meaningful stage yourself. The runtime will not require lanes, synthesis regions, decision regions, or any predefined communication reflow.
- Quantitative graphics must use grounded values, honest units/scales, and traceable evidence. Qualitative graphics must be labeled as interpretation. You author the SVG, HTML, CSS, and interaction directly; no compiler generates or grades the visual form.
- The authored HTML, CSS, SVG, JavaScript, and evidence choreography are the sole visual authority. Deterministic code may validate safety, truth, identity, and execution, but it may not reinterpret the design through a primitive system.
- Give every required premium narrative beat one visible node whose data-ns-narrative-beat-id and data-ns-communication-role exactly match designIntelligence.premiumPlan. Give every required analytical intent one visible node whose data-ns-analysis-id matches and whose data-ns-source-ids lists the exact grounded evidence IDs. Mark at least one unmistakable focal node data-ns-visual-priority="hero" or "primary".
- Originality is problem-specific, not a requirement to replace a strong current structure. The composition signature records information topology, dominant geometry, reading path, medium combination, title integration, evidence treatment, and signature behavior; it never authorizes continuity-breaking novelty for its own sake.
- The premium contract is semantic, not a layout template. Invent the spatial form for this exact argument, while making every declared beat and analytical intent browser-verifiable.


- Return constructionPlan as 2–12 meaningful perceptual beats. The browser and cinema layer own timing normalization, exact geometry, cancellation, and final settlement; you own the dramatic sequence and the meaning of each reveal. Coverage is a presentation aid, not a reason to reject a correct final scene.
- Construction beats describe how the viewer should experience the source evolution, not a runtime-owned operation grammar. Group the authored changes into purposeful moments in the order your design requires.
- Use cinematic mode and as many distinct beats as the authored transformation needs. If one effect cannot be animated safely, the runtime may simplify only that effect and must still settle to the exact authored final state.
- Do not replace, remove, or move the permanent artboard root.
- Do not place script tags, inline event-handler attributes, iframes, external resources, forms, or CSS url() references in sourceEdit.html/css. Put safe interaction logic only in sourceEdit.javascript.

OUTER-CANVAS VIEWING INTENT
- Return viewingIntent for the exact Northstar workspace experience. Choose single-frame, zoom-and-inspect, or scrolling-artboard deliberately.
- preserveAllEvidence must always be true. primaryNodeIds and supportingNodeIds describe your hierarchy; they do not authorize dropping, cropping, masking, or truncating any screen.
- A single-frame revision must remain readable inside the stable existing outer Canvas object. A zoom-and-inspect revision must preserve a useful overview before detail inspection. A scrolling-artboard may extend vertically but must keep a stable readable width.
- The same mounted browser will validate intrinsic geometry and workspace fit behind an atomic accepted-revision shield. Correct the source when that measured fit contradicts your declared viewing intent; no separate private workspace exists.

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
- Prefer the smallest consequential source change that visibly advances the governing idea. Escalate from local to regional to whole-composition only when the current structure genuinely prevents the required result.
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
    currentDesignAuthorship: buildNorthstarCurrentDesignReading({
      document: input.artifact.document,
      editableSurface: input.editableSurface,
    }),
    groundedResearch: input.groundedResearch,
    provisionalPriorCreativeDirection: {
      value: input.creativeDirection,
      instruction: "This is secondary historical context. The exact current artboard is the primary design precedent; preserve its successful design language unless the current evidence clearly requires a change.",
    },
    acceptedCreativeHistory: input.acceptedHistory.slice(-12),
    previousRejectedAttempt: input.priorCritique,
    instruction: "Author the single most consequential next visual change against the exact current design language. Prefer the smallest existing semantic target that can express it. Return designContinuity and concrete source operations; let the runtime own all artboard sizing.",
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
  sourceAuthorship?: Record<string, unknown>;
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
    currentDesignAuthorship: buildNorthstarCurrentDesignReading({
      document: input.artifact.document,
      editableSurface: input.editableSurface,
    }),
    groundedResearch: input.groundedResearch,
    deterministicSceneObservations: {
      blocking: input.sceneObservations.blocking,
      advisory: input.sceneObservations.advisory,
      instruction: "These are unordered observations about truth, communication, and browser health. They are not a required visual sequence and do not prescribe a layout or next move.",
    },
    adaptiveCreativeMemory: input.creativeMemory,
    liveSourceAuthorship: input.sourceAuthorship,
    emergentDesignIntelligence: input.designIntelligence,
    acceptedCreativeActCount: input.acceptedCreativeActCount,
    firstCreativeActExecutionContract: input.acceptedCreativeActCount === 0
      ? {
          groundedFlowNodeIds: input.requiredFirstActFlowNodeIds ?? [],
          instruction: "Every grounded screen in these flows must remain present and inspectable in every cumulative source revision. At the research-to-design handoff, preserve its current rendered size, crop, spacing, card treatment, flow grouping, and authoritative sequence order. Keep the complete research/evidence board in the composition while freely making visibly meaningful annotations, connectors, labels, spacers, paths, relationships, regroupings, or new analytical regions around, between, or after its screens. A new synthesis may be placed below the research section when useful, but that is one compositional option, not a requirement. Do not target or replace the artboard root, presentation, evidence reservoir, a flow, or its sequence merely to make the comparison. Let the artboard grow when needed instead of clearing research to make room. Change a screen's presentation only when the user explicitly calls for that exact change. Never crop, mask, overlap, use as a background, switch to object-fit cover, truncate, resize, normalize, or turn a mobile screenshot into an artboard-dominant poster.",
        }
      : undefined,
    permanentCreativeSurfaceContract: {
      presentationNodeId: "presentation",
      requiredPresentationAnchors: [],
      evidenceReservoirNodeId: "evidence-reservoir",
      instruction: "The presentation node is available only for a justified whole-composition change. Prefer the smallest existing semantic region. Preserve every grounded screen, current grouping, sequence, aspect ratio, and relative scale unless designContinuity explicitly names a deliberate evidentiary change.",
    },
    previousRejectedOrWeakAttempt: input.priorCritique,
    instruction: [
      "Re-observe the whole artifact and edit the exact browser-committed HTML/CSS/SVG/DOM source toward the smallest consequential stage worth committing now.",
      "Do not choose from or infer an implementation-owned visual family, template, composition recipe, or obligation sequence.",
      "You may continue, redirect, simplify, or recompose prior work when the exact render and evidence justify it, but continuity with a strong current artboard is the default.",
      input.acceptedCreativeActCount === 0
        ? "This is the first creative act. Study the exact current artboard and make the smallest consequential source edit that advances the objective. Preserve its successful typography, palette, spacing, surfaces, screenshot scale, grouping, and sequence. A local or regional edit is valid; use a whole-composition rewrite only when the current topology cannot express the required result."
        : "Build directly on the latest browser-verified composition. Preserve every successful design decision and repair weak earlier work at the smallest effective scope.",
      "Use sourceEdit as the visual coding surface: target the smallest existing semantic region that can express this action and return that target's complete cumulative inner HTML/SVG plus the cumulative creative CSS and safe JavaScript needed for the current revision. Use presentation only when designContinuity.scope is whole-composition and topologyChangeReason explains why. List placements only for grounded evidence nodes you intentionally move; the runtime preserves unmentioned protected screens. Use exactActions only for precise supplemental DOM actions. Runtime-owned measurement controls outer sizing and resolves evidence aliases before execution.",
      "Author charts, diagrams, matrices, timelines, annotations, connectors, evidence fields, and custom analytical forms directly in safe HTML/CSS/SVG/JavaScript when that best serves the idea. No runtime primitive catalogue, placement grammar, or minimum-instance contract may govern the composition.",
      "Return a compact constructionPlan that names the materially changed semantic regions and settles to the exact authored final state. Do not use presentation metadata to justify broad source replacement.",
      input.acceptedCreativeActCount > 0
        ? "When this stage could plausibly be the ending, resolve or remove working-only hypothesis chrome inside the authored scene itself. Publication will mark the exact accepted browser revision as verified; it will not run a separate cleanup mutation."
        : "The first stage may remain visibly exploratory while establishing a consequential evidence composition.",
      input.sourceAuthorship
        ? "Continue from the supplied canonical source files instead of reconstructing from memory. Preserve every valid HTML, CSS, safe JavaScript interaction, SVG fragment, and grounded evidence move unless exact browser feedback proves it wrong."
        : "Author the first executable source stage from the current browser-committed document now.",
      "A statically safe stage is dispatched immediately to the mounted browser. Leave broader hierarchy, synthesis, and polish opportunities for the next visible stage instead of hiding the creative evolution inside one long call.",
      "Choose source structure that best communicates the result while preserving current successful regions and using exact supplied node IDs. A new region must be explicitly created before it is referenced.",
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
      "Explain whether the applied act materially improved the artifact for the user and preserved or intentionally evolved the current typography, palette, spacing, topology, screenshot grouping, sequence, aspect ratio, and relative scale.",
      "Do not praise intended hierarchy, balance, or screenshot treatment when the rendered pixels contradict it. Generic vertical reflow, accidental full-width media, and giant mobile screenshots are design weaknesses unless explicitly and successfully justified.",
      "A decision to continue must name a specific unresolved communication opportunity in open language.",
      "A decision to stop must mean the artifact is already clear, grounded, operationally healthy, and unlikely to improve materially with another act.",
      "When fresh before/after pixels are unavailable, state that limitation and do not claim visual success from source intent alone.",
    ].join(" "),
  });
}
