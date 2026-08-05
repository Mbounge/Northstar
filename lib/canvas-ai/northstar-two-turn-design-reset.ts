// Northstar cumulative artboard benchmark — exact, fully audited model turns.
import { createHash } from "node:crypto";
import {
  NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
  appendNorthstarArtboardMutation,
  sanitizeNorthstarArtboardMutationDraft,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardMutationBatch,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarLiveSurfaceSnapshot,
} from "@/lib/canvas-artifacts/types";
import {
  buildNorthstarCumulativeIntentAudit,
  type NorthstarCumulativeIntentAudit,
} from "@/lib/canvas-ai/northstar-cumulative-intent-audit";

export const NORTHSTAR_TWO_TURN_DESIGN_RESET_VERSION =
  "northstar.artboard-benchmark.v1" as const;

export type NorthstarDesignResetTurn = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const NORTHSTAR_DESIGN_RESET_INSTRUCTION_BY_TURN = {
  1: "Place a Hello World card below the research.",
  2: "Place a Hello World 2 card to the right of the research and vertically center-align it with the research.",
  3: "Construct a visual relationship between the first Awin screenshot and the first Whop screenshot.",
  4: "Create equal space between the first and second Awin screenshots and insert an annotation in that space.",
  5: "Add an explanation to the Awin screenshot where the user chooses their role.",
  6: "Make the Awin and Whop onboarding flows easier to distinguish as separate groups.",
  7: "Create a new analysis area below the current onboarding flows and reuse the Awin screenshot where the user chooses their role there. Preserve the original evidence and make the reused view clearly part of the new analysis area.",
} as const satisfies Record<NorthstarDesignResetTurn, string>;


export type NorthstarSemanticRelation = "below" | "right-of" | "relationship-between" | "equal-space-with-annotation" | "explains" | "reuses" | "none";

export type NorthstarDesignResetGrounding = {
  conceptId: "research" | "evidence-relationship" | "evidence-gap-annotation" | "evidence-explanation" | "flow-structure" | "evidence-reuse";
  resolvedNodeId: string;
  requestedRelation: NorthstarSemanticRelation;
  placementSpace: "artboard-world";
  referenceContinuity: "pixel-stable";
  expansionDirection: "down" | "right" | "none";
  evidenceNodeIds: string[];
  expectedPreservedNodeIds: string[];
  interpretation: string;
};

export type NorthstarArtboardSemanticGraph = {
  schema: "northstar.artboard-semantic-graph.v1";
  revisionId: string;
  sourceSha256: string;
  concepts: Array<{
    conceptId: string;
    label: string;
    definition: string;
    canonicalNodeIds: string[];
    aliases: string[];
    exclusions: string[];
  }>;
  regions: Array<{
    regionId: string;
    conceptId: string;
    rootNodeId: string;
    memberNodeIds: string[];
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    anchors?: { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number };
    preservation: "permanent" | "editable" | "derived";
    continuity?: {
      source: "unchanged";
      bounds: "unchanged";
      internalLayout: "unchanged";
      visualAppearance: "unchanged";
    };
  }>;
  artboard: {
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    expansionModel: "infinite-world-space";
  };
  evidenceItems: Array<{
    nodeId: string;
    flowId: string;
    index: number;
    evidenceId?: string;
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    anchors?: { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number };
  }>;
  nodes: Array<{
    nodeId: string;
    parentId?: string;
    role: string;
    text: string;
    evidenceId?: string;
    bounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    anchors?: { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number };
  }>;
  relationships: Array<{ subjectId: string; predicate: string; objectId: string }>;
  vocabulary: {
    research: string;
    workingReasoning: string;
    below: string;
    rightOf: string;
    verticalCenterAlignment: string;
    authoritativeSpatialAnchors: string;
    relationshipBetween: string;
    worldSpaceObjectTopology: string;
    authoredNodeIdentity: string;
    authoredRelationshipProvenance: string;
    equalSpaceWithAnnotation: string;
    authoredAnnotationProvenance: string;
    reactiveSpatialDependencies: string;
  };
};

export type NorthstarDesignResetProviderAttemptAudit = {
  attempt: number;
  model: string;
  requestUrl: string;
  requestBody: unknown;
  requestBodyBytes: number;
  requestBodySha256: string;
  requestedAt: string;
  completedAt?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  providerPayload?: unknown;
  providerPayloadBytes?: number;
  providerPayloadSha256?: string;
  rawModelText?: string;
  rawModelTextBytes?: number;
  rawModelTextSha256?: string;
  parsedModelResponse?: unknown;
  error?: string;
};

export type NorthstarExactStringDiff = {
  unchangedPrefixLength: number;
  unchangedSuffixLength: number;
  removed: string;
  added: string;
};

export type NorthstarExactDocumentDiff = {
  html: NorthstarExactStringDiff;
  css: NorthstarExactStringDiff;
  javascript: NorthstarExactStringDiff;
  creativeJavascript: NorthstarExactStringDiff;
  cssLayers: {
    added: Record<string, string>;
    removed: Record<string, string>;
    changed: Record<string, { before: string; after: string; diff: NorthstarExactStringDiff }>;
  };
};

export type NorthstarDesignResetModelResponse = {
  turn: NorthstarDesignResetTurn;
  observedBaseRevisionId: string;
  understanding: string;
  grounding: NorthstarDesignResetGrounding;
  mutation: NorthstarArtboardMutationDraft;
};

export type NorthstarDesignResetTurnArchive = {
  schema: "northstar.design-reset-turn-archive.v5";
  resetVersion: typeof NORTHSTAR_TWO_TURN_DESIGN_RESET_VERSION;
  runId: string;
  artifactId: string;
  turn: NorthstarDesignResetTurn;
  requestedThinkingMode: "low" | "medium" | "high";
  effectiveDesignMode: "fixed-seven-turn";
  instruction: string;
  status: "model-failed" | "dispatch-failed" | "committed";
  recordedAt: string;
  sourceBefore: {
    revisionId: string;
    package: NorthstarGeneratedCodeArtifactPackage;
    snapshot: NorthstarLiveSurfaceSnapshot;
    acknowledgement: NorthstarArtifactMutationAcknowledgement;
    sourceSha256: string;
    semanticGraph: NorthstarArtboardSemanticGraph;
  };
  modelBoundary: {
    systemInstruction: string;
    contents: unknown[];
    responseSchema: unknown;
    providerAttempt: NorthstarDesignResetProviderAttemptAudit;
    providerAttempts?: NorthstarDesignResetProviderAttemptAudit[];
    rawParsedResponse?: unknown;
    acceptedResponse?: NorthstarDesignResetModelResponse;
    normalizationDiff?: NorthstarExactStringDiff;
  };
  modelAuthoredPatch?: NorthstarArtboardMutationDraft;
  appliedMutationBatch?: NorthstarArtboardMutationBatch;
  candidateBeforeBrowser?: NorthstarGeneratedCodeArtifactPackage;
  sourceAfter?: {
    revisionId: string;
    package: NorthstarGeneratedCodeArtifactPackage;
    snapshot: NorthstarLiveSurfaceSnapshot;
    acknowledgement: NorthstarArtifactMutationAcknowledgement;
    sourceSha256: string;
    semanticGraph: NorthstarArtboardSemanticGraph;
  };
  semanticGraphDiff?: {
    addedNodeIds: string[];
    removedNodeIds: string[];
    retainedNodeIds: string[];
    conceptChanges: string[];
  };
  exactSourceDiff?: NorthstarExactDocumentDiff;
  /** Audit-only cumulative dependency classification. Never enters the model boundary or execution path. */
  cumulativeIntentAudit?: NorthstarCumulativeIntentAudit;
  /** Audit construction failures are archived without affecting the committed design turn. */
  cumulativeIntentAuditFailure?: string;
  repairHistory?: unknown[];
  failure?: string;
};

export const NORTHSTAR_DESIGN_RESET_MODEL_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    turn: { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7] },
    observedBaseRevisionId: { type: "string", minLength: 1 },
    understanding: { type: "string", minLength: 1, maxLength: 1200 },
    grounding: {
      type: "object",
      additionalProperties: false,
      properties: {
        conceptId: { type: "string", enum: ["research", "evidence-relationship", "evidence-gap-annotation", "evidence-explanation", "flow-structure", "evidence-reuse"] },
        resolvedNodeId: { type: "string", minLength: 1, maxLength: 120 },
        requestedRelation: { type: "string", enum: ["below", "right-of", "relationship-between", "equal-space-with-annotation", "explains", "reuses", "none"] },
        placementSpace: { type: "string", enum: ["artboard-world"] },
        referenceContinuity: { type: "string", enum: ["pixel-stable"] },
        expansionDirection: { type: "string", enum: ["down", "right", "none"] },
        evidenceNodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
        expectedPreservedNodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
        interpretation: { type: "string", minLength: 1, maxLength: 1200 },
      },
      required: ["conceptId", "resolvedNodeId", "requestedRelation", "placementSpace", "referenceContinuity", "expansionDirection", "evidenceNodeIds", "expectedPreservedNodeIds", "interpretation"],
    },
    mutation: NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA,
  },
  required: ["turn", "observedBaseRevisionId", "understanding", "grounding", "mutation"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

export function northstarDesignResetSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceHash(snapshot: NorthstarLiveSurfaceSnapshot): string {
  return northstarDesignResetSha256(jsonText({
    html: snapshot.html,
    css: snapshot.css,
    cssLayers: snapshot.cssLayers ?? {},
    javascript: snapshot.javascript ?? "",
    creativeJavascript: snapshot.creativeJavascript ?? "",
  }));
}

export function northstarDesignResetSourceHash(snapshot: NorthstarLiveSurfaceSnapshot): string {
  return sourceHash(snapshot);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function rectFromUnknown(value: unknown): { left: number; top: number; right: number; bottom: number; width: number; height: number } | undefined {
  if (!isRecord(value)) return undefined;
  const left = finiteNumber(value.left) ?? finiteNumber(value.x);
  const top = finiteNumber(value.top) ?? finiteNumber(value.y);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (left === undefined || top === undefined || width === undefined || height === undefined) return undefined;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function anchorsFromBounds(bounds: { left: number; top: number; right: number; bottom: number } | undefined) {
  if (!bounds) return undefined;
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom,
    centerX: bounds.left + ((bounds.right - bounds.left) / 2),
    centerY: bounds.top + ((bounds.bottom - bounds.top) / 2),
  };
}


function nodesFromFlowRoot(flowId: string): string {
  return `flow-${flowId.replace(/--/g, "-").replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function buildNorthstarArtboardSemanticGraph(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
}): NorthstarArtboardSemanticGraph {
  const snapshot = input.acknowledgement.snapshot;
  if (!snapshot) throw new Error("Cannot build semantic graph without the exact browser snapshot.");
  const snapshotRecord = snapshot as unknown as Record<string, unknown>;
  const semanticNodesRaw = Array.isArray(snapshotRecord.semanticNodes) ? snapshotRecord.semanticNodes : [];
  const registry = isRecord(snapshotRecord.evidenceRegistry)
    ? snapshotRecord.evidenceRegistry
    : isRecord((input.acknowledgement as unknown as Record<string, unknown>).evidenceRegistry)
      ? (input.acknowledgement as unknown as Record<string, unknown>).evidenceRegistry as Record<string, unknown>
      : {};
  const manifest = Array.isArray(registry.presentationManifest) ? registry.presentationManifest : [];
  const evidenceItems = manifest.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.nodeId !== "string") return [];
    const bounds = rectFromUnknown(entry);
    return [{
      nodeId: entry.nodeId,
      flowId: typeof entry.flowId === "string" ? entry.flowId : "",
      index: finiteNumber(entry.index) ?? 0,
      evidenceId: typeof entry.evidenceId === "string" ? entry.evidenceId : undefined,
      bounds,
      anchors: anchorsFromBounds(bounds),
    }];
  });
  const evidenceNodeIds = manifest.map((entry) => isRecord(entry) ? String(entry.nodeId ?? "") : "").filter(Boolean);
  const flowGroups = [...new Set(evidenceItems.map((item) => item.flowId).filter(Boolean))].map((flowId) => {
    const members = evidenceItems.filter((item) => item.flowId === flowId).sort((a, b) => a.index - b.index);
    const measured = members.map((item) => item.bounds).filter((value): value is NonNullable<typeof value> => Boolean(value));
    const bounds = measured.length ? {
      left: Math.min(...measured.map((rect) => rect.left)),
      top: Math.min(...measured.map((rect) => rect.top)),
      right: Math.max(...measured.map((rect) => rect.right)),
      bottom: Math.max(...measured.map((rect) => rect.bottom)),
      width: 0,
      height: 0,
    } : undefined;
    if (bounds) {
      bounds.width = bounds.right - bounds.left;
      bounds.height = bounds.bottom - bounds.top;
    }
    const normalizedName = flowId.replace(/--/g, " ").replace(/[-_]+/g, " ").trim();
    const rootNodeId = nodesFromFlowRoot(flowId);
    return { flowId, normalizedName, rootNodeId, members, bounds, anchors: anchorsFromBounds(bounds) };
  });
  const evidenceBounds = manifest.map((entry) => rectFromUnknown(entry)).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const researchBounds = evidenceBounds.length ? {
    left: Math.min(...evidenceBounds.map((r) => r.left)),
    top: Math.min(...evidenceBounds.map((r) => r.top)),
    right: Math.max(...evidenceBounds.map((r) => r.right)),
    bottom: Math.max(...evidenceBounds.map((r) => r.bottom)),
    width: 0,
    height: 0,
  } : undefined;
  if (researchBounds) {
    researchBounds.width = researchBounds.right - researchBounds.left;
    researchBounds.height = researchBounds.bottom - researchBounds.top;
  }
  const nodes = semanticNodesRaw.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.nodeId !== "string") return [];
    const attrs = isRecord(raw.normalizedAttributes) ? raw.normalizedAttributes : {};
    const bounds = rectFromUnknown(raw.bounds ?? raw.rect ?? raw.layout);
    return [{
      nodeId: raw.nodeId,
      parentId: typeof raw.parentId === "string" ? raw.parentId : undefined,
      role: String(attrs["data-ns-semantic-role"] ?? attrs["data-ns-working-role"] ?? attrs["data-ns-stage"] ?? "content"),
      text: typeof raw.normalizedText === "string" ? raw.normalizedText : "",
      evidenceId: typeof attrs["data-ns-evidence-id"] === "string" ? attrs["data-ns-evidence-id"] : undefined,
      bounds,
      anchors: anchorsFromBounds(bounds),
    }];
  });
  const researchRootId = nodes.some((node) => node.nodeId === "evidence") ? "evidence" : "evidence";
  const size = input.acknowledgement.size;
  const artboardBounds = size ? {
    left: 0,
    top: 0,
    right: size.intrinsicWidth,
    bottom: size.intrinsicHeight,
    width: size.intrinsicWidth,
    height: size.intrinsicHeight,
  } : undefined;
  const authoredRelationships = semanticNodesRaw.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.nodeId !== "string") return [];
    const attrs = isRecord(raw.normalizedAttributes) ? raw.normalizedAttributes : {};
    const sourceId = typeof attrs["data-ns-source-node-id"] === "string" ? attrs["data-ns-source-node-id"] : undefined;
    const targetId = typeof attrs["data-ns-target-node-id"] === "string" ? attrs["data-ns-target-node-id"] : undefined;
    const isAuthoredRelationship = attrs["data-ns-authored-relationship"] === "true";
    if (!isAuthoredRelationship || !sourceId || !targetId) return [];
    return [{ subjectId: sourceId, predicate: "visually-related-to", objectId: targetId }];
  });
  const authoredGapAnnotations = semanticNodesRaw.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.nodeId !== "string") return [];
    const attrs = isRecord(raw.normalizedAttributes) ? raw.normalizedAttributes : {};
    const beforeId = typeof attrs["data-ns-between-before-node-id"] === "string" ? attrs["data-ns-between-before-node-id"] : undefined;
    const afterId = typeof attrs["data-ns-between-after-node-id"] === "string" ? attrs["data-ns-between-after-node-id"] : undefined;
    const isAuthoredAnnotation = attrs["data-ns-authored-annotation"] === "true";
    if (!isAuthoredAnnotation || !beforeId || !afterId) return [];
    return [
      { subjectId: raw.nodeId, predicate: "annotates-gap-after", objectId: beforeId },
      { subjectId: raw.nodeId, predicate: "annotates-gap-before", objectId: afterId },
    ];
  });
  const relationships = [
    ...evidenceNodeIds.map((nodeId) => ({ subjectId: researchRootId, predicate: "contains", objectId: nodeId })),
    ...authoredRelationships,
    ...authoredGapAnnotations,
  ];
  return {
    schema: "northstar.artboard-semantic-graph.v1",
    revisionId: input.artifact.revisionId,
    sourceSha256: sourceHash(snapshot),
    concepts: [
      {
        conceptId: "research",
        label: "Research",
        definition: "The complete canonical evidence area containing the ordered Awin and Whop flows. This is the referent for the words research, evidence, and research section in the two-turn benchmark.",
        canonicalNodeIds: [researchRootId],
        aliases: ["research", "evidence", "research section", "evidence reservoir", "grounded evidence"],
        exclusions: ["presentation", "reasoning-zone", "thought-primary", "thought-secondary", "synthesis", "decision"],
      },
      ...flowGroups.map((flow) => ({
        conceptId: `flow:${flow.flowId}`,
        label: flow.normalizedName,
        definition: `The ordered collective evidence region for ${flow.normalizedName}.`,
        canonicalNodeIds: [flow.rootNodeId],
        aliases: [flow.normalizedName, flow.flowId, ...flow.normalizedName.split(/\s+/).filter(Boolean)],
        exclusions: flowGroups.filter((other) => other.flowId !== flow.flowId).map((other) => other.rootNodeId),
      })),
      {
        conceptId: "working-reasoning",
        label: "Working reasoning",
        definition: "Temporary hypotheses and open questions. It is not the canonical research evidence.",
        canonicalNodeIds: ["reasoning-zone"],
        aliases: ["reasoning", "hypothesis", "open question"],
        exclusions: [researchRootId],
      },
    ],
    regions: [
      { regionId: "research", conceptId: "research", rootNodeId: researchRootId, memberNodeIds: evidenceNodeIds, bounds: researchBounds, anchors: anchorsFromBounds(researchBounds), preservation: "permanent", continuity: { source: "unchanged", bounds: "unchanged", internalLayout: "unchanged", visualAppearance: "unchanged" } },
      ...flowGroups.map((flow) => ({
        regionId: `flow:${flow.flowId}`,
        conceptId: `flow:${flow.flowId}`,
        rootNodeId: flow.rootNodeId,
        memberNodeIds: flow.members.map((item) => item.nodeId),
        bounds: flow.bounds,
        anchors: flow.anchors,
        preservation: "permanent" as const,
        continuity: { source: "unchanged" as const, bounds: "unchanged" as const, internalLayout: "unchanged" as const, visualAppearance: "unchanged" as const },
      })),
      { regionId: "working-reasoning", conceptId: "working-reasoning", rootNodeId: "reasoning-zone", memberNodeIds: [], preservation: "editable" },
    ],
    artboard: { bounds: artboardBounds, expansionModel: "infinite-world-space" },
    evidenceItems,
    nodes,
    relationships,
    vocabulary: {
      research: "Resolve to node evidence and all canonical evidence descendants, never reasoning-zone or presentation.",
      workingReasoning: "Resolve to reasoning-zone; it is distinct from research.",
      below: "In artboard world space, add new content outside the existing research footprint with its top edge beyond the research bottom edge. Expand the artboard downward. Do not move, resize, reflow, restyle, wrap, or otherwise transform research to make room.",
      rightOf: "In artboard world space, add new content outside the existing research footprint with its left edge beyond the research right edge. Expand the artboard to the right. Do not move, resize, reflow, restyle, wrap, or otherwise transform research to make room.",
      verticalCenterAlignment: "Vertically center-align means the rendered vertical center of the new node equals the authoritative anchors.centerY of the reference region. Do not recompute centerY from top, bottom, or height. Do not guess the new node height. Author a self-measuring CSS relationship that remains exact after layout, such as placing the node top at anchors.centerY and translating the node by -50% of its own rendered height, or another equivalently exact authored relationship.",
      authoritativeSpatialAnchors: "Each measured node and region exposes authoritative anchors: left, top, right, bottom, centerX, and centerY. Use these values directly for relational geometry. Do not recalculate them from rounded bounds.",
      relationshipBetween: "Construct a new authored visual relationship whose endpoints resolve to the authoritative anchors of the two named evidence items. Keep both source screenshots pixel-stable. The model chooses the connector form, path, label, styling, dimensions, and implementation.",
      worldSpaceObjectTopology: "Every independently positioned artboard-world object is authored as a direct child of the canonical artboard root node artboard. Reference regions such as evidence are anchors for geometry and meaning, not parents for external world-space objects.",
      authoredNodeIdentity: "Every authored visual object must have a unique data-ns-node-id attribute. The semantic graph, browser measurements, later design turns, diagnostics, and source diffs use data-ns-node-id as the stable object identity; an HTML id attribute alone is not sufficient.",
      authoredRelationshipProvenance: "A model-authored relationship object carries data-ns-authored-relationship=\"true\", data-ns-source-node-id, and data-ns-target-node-id on the authored relationship object itself. These attributes describe provenance only; they do not choose, route, style, validate, repair, or replace the model-authored visual treatment. Every independently addressable visual primitive inside the relationship also carries its own unique data-ns-node-id.",
      equalSpaceWithAnnotation: "Create a larger gap between the two named adjacent screenshots, place the new annotation inside that gap, and make the rendered horizontal distance from the first screenshot to the annotation equal to the rendered horizontal distance from the annotation to the second screenshot. The model chooses the gap size, annotation size, styling, and implementation. Preserve screenshot order, dimensions, content, and appearance. Move only the minimum necessary Awin sequence suffix; keep the Whop flow and unrelated artboard content unchanged. Expand the artboard to the right if the authored layout needs more room.",
      authoredAnnotationProvenance: "A model-authored gap annotation carries data-ns-authored-annotation=\"true\", data-ns-between-before-node-id, and data-ns-between-after-node-id on the annotation object itself. These attributes describe which adjacent evidence nodes bound the annotated gap; they do not choose placement, validate spacing, or repair the model-authored result.",
      reactiveSpatialDependencies: "Spatial intent persists across turns in mutation.relations, which is the canonical model-authored dependency graph. References declare exact semantic node identities, anchors, and geometry modes; parameters declare only the axes, alignments, and offsets chosen by the model. The browser realizes live relations from current rendered geometry without changing the canonical authored source and without inventing styling, spacing, routing, dimensions, or cross-axis alignment.",
    },
  };
}

function semanticGraphDiff(before: NorthstarArtboardSemanticGraph, after: NorthstarArtboardSemanticGraph) {
  const beforeIds = new Set(before.nodes.map((node) => node.nodeId));
  const afterIds = new Set(after.nodes.map((node) => node.nodeId));
  return {
    addedNodeIds: [...afterIds].filter((id) => !beforeIds.has(id)),
    removedNodeIds: [...beforeIds].filter((id) => !afterIds.has(id)),
    retainedNodeIds: [...afterIds].filter((id) => beforeIds.has(id)),
    conceptChanges: before.concepts.map((concept) => JSON.stringify(concept)).join("\
") === after.concepts.map((concept) => JSON.stringify(concept)).join("\
") ? [] : ["canonical-concept-definition-changed"],
  };
}

export function buildNorthstarDesignResetSystemInstruction(): string {
  return `You are editing the exact current source of one living Northstar artboard.

The user will give you one short design instruction, the complete current artboard source, and an authoritative semantic-spatial graph derived from that exact committed revision. The graph defines stable concepts, regions, membership, exclusions, and current measured bounds.

First resolve every noun, spatial relation, and alignment instruction through the semantic graph. Research always means the canonical evidence region rooted at node evidence; reasoning-zone and presentation are explicitly not research. The graph's bounds and anchors describe the current committed revision, but every persistent dependency must also be authored in mutation.relations so it survives later geometry changes.

Treat communication quality and evidence safety as part of every design decision, on every turn. Anything you add must be clear, readable, and understandable from the rendered artboard itself. When an addition refers to specific evidence, its content and visual treatment must make that reference understandable without relying on diagnostics. General comments, synthesis, or remarks may address the whole artifact without pointing to one exact node. Never place cards, annotations, labels, text, filled shapes, or decorative surfaces over protected evidence pixels. Do not crop, cover, dim, restyle, replace, or visually contaminate evidence. Create negative space, move only explicitly editable authored material, or expand the artboard when your design needs room.

Before returning a mutation, review the exact current source, browser acknowledgement, semantic graph, rendered bounds, evidence registry, and prior model-authored additions together. Check the whole candidate you intend to author: wording, visual attribution, hierarchy, clipping, overflow, contrast, evidence interference, relation continuity, preservation, and artboard containment. Correct every issue you can identify in the same complete response. The system is your rendering, measurement, memory, and recovery partner; it does not choose the design and it does not block a visual approach merely because it differs from a template.

Continuity is evaluated on every turn. Preserve evidence, semantic identity, meaning, target references, and provenance, but do not freeze prior authored coordinates when the current instruction changes their surrounding region or hierarchy. Prior authored additions attached to affected nodes or regions are available for model-authored recomposition. Reassess their placement, visual membership, hierarchy, and relationship treatment as part of the complete cumulative design whenever the new turn changes their context. Unrelated authored work remains stable.

A visual relationship does not require a runtime relation. Choose the best visual expression of the intent yourself: spatial arrangement, grouping, alignment, repeated emphasis, labels, brackets, connectors, insets, comparison regions, or any other authored form. mutation.relations is optional and exists only when you intentionally want geometry to remain reactive after later movement or restructuring. An unresolved optional relation is reported as a non-blocking continuity observation; it does not invalidate an otherwise safe model-authored visual result.

A relation is typed model-authored intent, separate from HTML and separate from browser-resolved geometry. The model chooses every subject, reference, anchor, geometry mode, controlled axis, alignment, offset, dimension, style, route, and amount of artboard growth. The browser only realizes the exact declared relation against current rendered geometry. It does not infer missing relationships, choose cross-axis alignment, invent spacing, route connectors, resize annotations, or repair a design. Use realizationPolicy "live" only for dependencies that must follow references on later turns. Use reference geometry "semantic-descendant-union" when a relation targets the complete research region rooted at evidence; use "border-box" for individual screenshots. Do not rely on optional data-ns-* markup attributes as the canonical dependency record.

For relative-placement, declare kind "relative-placement", the dependent subjectId, a reference with role "reference", and parameters containing the authored side, offsets, and any required alignment. For a card to the right of research and vertically centered, declare side "right" and alignY "center" against evidence with geometry "semantic-descendant-union". For a card below research, declare side "below" against the same complete research geometry and declare alignX only when you intend to control the horizontal axis. The browser measures the subject's actual rendered size, converts world geometry into its real containing-block coordinate space, preserves authored transforms, and re-resolves the live relation after later reference movement or resizing.

When your chosen design uses a reactive connector, author the complete SVG treatment yourself and declare kind "connector-attachment" with exactly one source reference, exactly one target reference, their anchors, and primitiveNodeId. The canonical roles are source and target; common semantic aliases such as from/to and start/end are normalized without changing your design. The runtime may update only the endpoint geometry of an authored SVG line, polyline, or supported open path; it does not choose the connector form, path, label, stroke, route, styling, or dimensions. The source screenshots remain pixel-stable. Put data-ns-authored-relationship="true", data-ns-source-node-id, and data-ns-target-node-id on the relationship object for observational provenance, and give each addressable primitive its own data-ns-node-id. If reactive attachment is unnecessary, omit connector-attachment and keep the relationship entirely visual.

For an annotation between adjacent screenshots, first author enough positive horizontal room by moving only the minimum necessary suffix and requesting any needed rightward artboard growth. Then declare kind "between-placement" with before and after references using geometry "border-box", parameters axis "x" and crossAlign "center", and realizationPolicy "live". The runtime centers the annotation's actual rendered border box between the two current screenshot edges and centers it on their row because that cross-axis intent was explicitly authored. It does not choose the gap size, annotation dimensions, content, styling, or suffix movement. Put data-ns-authored-annotation="true", data-ns-between-before-node-id, and data-ns-between-after-node-id on the annotation for provenance. The annotation must communicate an observation or explanation, not merely label the gap.

When you reuse evidence in a new analysis area, preserve the original evidence instance in place. Treat the reused view as a new authored presentation instance with its own unique data-ns-node-id, while keeping its provenance attached to the original evidence through exact evidence references and source-node provenance such as data-ns-source-node-id. Reused evidence is not a new source. Preserve source identity and make it understandable from the rendered artboard that the new view is a reuse, inset, copy, crop, or detail of existing evidence rather than newly introduced evidence.

Every independently positioned artboard-world object should be a direct child of the canonical artboard root node artboard unless the authored topology intentionally uses a nested positioned container; relation realization must remain correct in either topology. Every authored visual object must carry a unique data-ns-node-id. Use focused set-styles or set-attributes operations for existing nodes instead of replacing an entire evidence sequence.

Existing authored regions are stable reference content. A request to add something below or to the right of a region means external extension in artboard world space unless the user explicitly asks to modify that region. The referenced region must remain pixel-stable: its source, bounds, internal layout, order, scale, styling, and visual appearance do not change. Never create room by shrinking, moving, reflowing, wrapping, restyling, or recomposing the referenced region. Expand the artboard in the requested direction and place the new authored content outside the unchanged region footprint.

Declare that grounding in your response. Decide the complete authored solution yourself, including HTML, CSS, SVG, JavaScript, visual style, dimensions, spacing, layout method, placement, and amount of artboard expansion. Read the exact source and current measurements rather than relying on assumptions. Use request-space to author the required outer artboard growth. New content placed outside a pixel-stable reference region must be taken out of normal document flow with model-authored world-space positioning (for example position:absolute with explicit left/top coordinates chosen from the measured graph). A normal-flow sibling can reflow the reference and is therefore not a valid artboard-world extension. You may use insert-html with position afterend on an anchor node when that is the correct source relationship; do not append to a convenient ancestor when it cannot produce the requested world-space relationship.

Make only the requested design change. Do not perform unrelated redesign work. Return the exact source mutation you chose in the required JSON schema. Nothing will calculate placement, select styling, add markup, repair your design, or rewrite your mutation after you respond. If the browser reports a problem, you will receive the complete candidate, exact committed base, and all available measured issues so you can author a full corrected replacement. Return JSON only.`;
}


function instructionTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 2));
}

function focusScore(instruction: Set<string>, values: string[]): number {
  const candidate = instructionTokens(values.join(" "));
  let score = 0;
  for (const token of instruction) if (candidate.has(token)) score += 1;
  return score;
}

function regionPairGeometry(
  first: NorthstarArtboardSemanticGraph["regions"][number],
  second: NorthstarArtboardSemanticGraph["regions"][number],
) {
  const a = first.bounds;
  const b = second.bounds;
  if (!a || !b) return undefined;
  const horizontalGap = a.right <= b.left
    ? { left: a.right, right: b.left, top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) }
    : b.right <= a.left
      ? { left: b.right, right: a.left, top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) }
      : undefined;
  const verticalGap = a.bottom <= b.top
    ? { left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: a.bottom, bottom: b.top }
    : b.bottom <= a.top
      ? { left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: b.bottom, bottom: a.top }
      : undefined;
  const gap = horizontalGap ?? verticalGap;
  return {
    firstRegionId: first.regionId,
    secondRegionId: second.regionId,
    orientation: horizontalGap ? "horizontal" : verticalGap ? "vertical" : "overlapping",
    gap: gap ? { ...gap, width: Math.max(0, gap.right - gap.left), height: Math.max(0, gap.bottom - gap.top) } : undefined,
  };
}

function resolveNorthstarInstructionFocus(input: {
  instruction: string;
  graph: NorthstarArtboardSemanticGraph;
}) {
  const tokens = instructionTokens(input.instruction);
  const conceptCandidates = input.graph.concepts.map((concept) => ({
    kind: "concept" as const,
    id: concept.conceptId,
    label: concept.label,
    canonicalNodeIds: concept.canonicalNodeIds,
    score: focusScore(tokens, [concept.label, concept.definition, ...concept.aliases]),
  }));
  const regionCandidates = input.graph.regions.map((region) => {
    const concept = input.graph.concepts.find((item) => item.conceptId === region.conceptId);
    return {
      kind: "region" as const,
      id: region.regionId,
      label: concept?.label ?? region.regionId,
      rootNodeId: region.rootNodeId,
      memberNodeIds: region.memberNodeIds,
      bounds: region.bounds,
      anchors: region.anchors,
      score: focusScore(tokens, [region.regionId, concept?.label ?? "", ...(concept?.aliases ?? [])]),
    };
  });
  const evidenceCandidates = input.graph.evidenceItems.map((item) => {
    const nodes = input.graph.nodes.filter((node) => node.nodeId === item.nodeId || node.parentId === item.nodeId);
    return {
      kind: "evidence" as const,
      id: item.nodeId,
      flowId: item.flowId,
      index: item.index,
      evidenceId: item.evidenceId,
      bounds: item.bounds,
      anchors: item.anchors,
      semanticText: nodes.map((node) => node.text).filter(Boolean),
      score: focusScore(tokens, [item.flowId, String(item.index), ...nodes.map((node) => node.text)]),
    };
  });
  const candidates = [...conceptCandidates, ...regionCandidates, ...evidenceCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
  const focusedRegions = regionCandidates.filter((candidate) => candidate.score > 0).slice(0, 6);
  const regionPairs = focusedRegions.flatMap((first, index) => focusedRegions.slice(index + 1).flatMap((second) => {
    const firstRegion = input.graph.regions.find((region) => region.regionId === first.id);
    const secondRegion = input.graph.regions.find((region) => region.regionId === second.id);
    const geometry = firstRegion && secondRegion ? regionPairGeometry(firstRegion, secondRegion) : undefined;
    return geometry ? [geometry] : [];
  }));
  return { candidates, regionPairs };
}

function buildNorthstarContinuityContext(input: {
  graph: NorthstarArtboardSemanticGraph;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  focus: ReturnType<typeof resolveNorthstarInstructionFocus>;
}) {
  const snapshotNodes = input.acknowledgement.snapshot?.semanticNodes ?? [];
  const evidenceIds = new Set(input.graph.evidenceItems.map((item) => item.nodeId));
  const regionRootIds = new Set(input.graph.regions.map((region) => region.rootNodeId));
  const authoredRelations = input.acknowledgement.authoredDesignRelations ?? [];
  const targetIdsBySubject = new Map<string, Set<string>>();
  for (const relation of authoredRelations) {
    const targets = targetIdsBySubject.get(relation.subjectId) ?? new Set<string>();
    for (const reference of relation.references ?? []) targets.add(reference.nodeId);
    targetIdsBySubject.set(relation.subjectId, targets);
  }
  const additions = snapshotNodes.flatMap((node) => {
    if (evidenceIds.has(node.nodeId) || regionRootIds.has(node.nodeId)) return [];
    const attrs = node.normalizedAttributes ?? {};
    const identity = [node.nodeId, attrs["data-ns-role"] ?? "", ...(node.normalizedClasses ?? [])].join(" ").toLowerCase();
    const targetIds = new Set(targetIdsBySubject.get(node.nodeId) ?? []);
    for (const key of ["data-ns-explains-node-id", "data-ns-source-node-id", "data-ns-target-node-id", "data-ns-between-before-node-id", "data-ns-between-after-node-id"]) {
      const value = attrs[key];
      if (value) targetIds.add(value);
    }
    const authored = targetIds.size > 0 || /(?:annotation|callout|caption|explanation|comment|remark|note|card|connector|relationship|label)/.test(identity);
    if (!authored) return [];
    const targetRegionIds = input.graph.regions
      .filter((region) => [...targetIds].some((targetId) => region.rootNodeId === targetId || region.memberNodeIds.includes(targetId)))
      .map((region) => region.regionId);
    return [{
      nodeId: node.nodeId,
      parentId: node.parentId,
      text: node.normalizedText,
      bounds: node.bounds,
      targetNodeIds: [...targetIds],
      targetRegionIds,
      semanticIdentityProtected: true,
      meaningAndTargetProtected: true,
      visualFormAndPlacementRecomposable: true,
    }];
  });
  const focusedIds = new Set(input.focus.candidates.slice(0, 8).flatMap((candidate) => [candidate.id, ...(candidate.kind === "region" ? candidate.memberNodeIds : candidate.kind === "concept" ? candidate.canonicalNodeIds : [])]));
  const affectedAdditions = additions.filter((addition) =>
    addition.targetNodeIds.some((id) => focusedIds.has(id))
    || addition.targetRegionIds.some((id) => focusedIds.has(id))
    || (addition.parentId ? focusedIds.has(addition.parentId) : false)
  );
  return {
    policy: "preserve meaning and evidence; recompose affected authored work when needed for cumulative congruence",
    appliesToEveryTurn: true,
    priorAuthoredAdditions: additions,
    affectedAuthoredAdditions: affectedAdditions,
    protectedEvidenceNodeIds: [...evidenceIds],
    editableForRecompositionNodeIds: affectedAdditions.map((item) => item.nodeId),
    unrelatedAuthoredNodeIds: additions.filter((item) => !affectedAdditions.includes(item)).map((item) => item.nodeId),
    browserContinuityObservations: input.acknowledgement.review?.authoredContinuityObservations ?? [],
  };
}

export function buildNorthstarDesignResetModelInput(input: {
  turn: NorthstarDesignResetTurn;
  artifact: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
}): unknown {
  const snapshot = input.acknowledgement.snapshot;
  if (!snapshot) {
    throw new Error("The design reset requires the exact browser source snapshot before every model turn.");
  }
  const semanticGraph = buildNorthstarArtboardSemanticGraph(input);
  const instruction = NORTHSTAR_DESIGN_RESET_INSTRUCTION_BY_TURN[input.turn];
  const focus = resolveNorthstarInstructionFocus({ instruction, graph: semanticGraph });
  const continuityContext = buildNorthstarContinuityContext({ graph: semanticGraph, acknowledgement: input.acknowledgement, focus });
  const instructionResolution = {
    resolver: "northstar.semantic-focus.v1",
    instruction,
    focusCandidates: focus.candidates,
    selectedRegionPairs: focus.regionPairs,
    availableSpatialRelations: {
      relativePlacement: {
        kind: "relative-placement",
        purpose: "Keep an authored subject spatially dependent on one referenced node or semantic region.",
        referenceGeometry: ["border-box", "semantic-descendant-union"],
        authoredParameters: ["side", "offsetX", "offsetY", "alignX", "alignY"],
      },
      connectorAttachment: {
        kind: "connector-attachment",
        purpose: "Optionally keep endpoints of a model-authored SVG relationship attached to exact rendered anchors after later geometry changes.",
        authoredParameters: ["primitiveNodeId", "source anchor", "target anchor"],
      },
      betweenPlacement: {
        kind: "between-placement",
        purpose: "Keep a model-authored subject centered between two exact references when that dependency must remain live.",
        authoredParameters: ["axis", "crossAlign"],
      },
    },
    groundingInstruction: "Resolve the exact subject, objects, and collective regions named by the instruction from these candidates and the complete graph. The candidate ranking is semantic assistance, not a design decision. You may select a lower-ranked candidate when the source and browser state support it.",
    structuralInstruction: "For requests about groups, flows, sections, boundaries, or new analysis areas, reason from collective region membership and rendered bounds. The provided pair geometry is observational. Choose the visual treatment yourself and declare no runtime relation unless your authored result genuinely needs a persistent dependency.",
    preservationInstruction: "Preserve evidence source, dimensions, order, visibility, provenance, and unrelated prior work unless the instruction explicitly grants authority to change them. When reusing evidence, preserve the original instance and create a distinct authored presentation instance for the reused view. Create negative space or artboard growth instead of obscuring evidence.",
  };
  return {
    resetVersion: NORTHSTAR_TWO_TURN_DESIGN_RESET_VERSION,
    turn: input.turn,
    instruction: NORTHSTAR_DESIGN_RESET_INSTRUCTION_BY_TURN[input.turn],
    semanticContract: {
      authoritative: true,
      graph: semanticGraph,
      instructionResolution: {
        ...instructionResolution,
        note: "The full graph and browser state are available on every turn. Instruction focus ranks likely referents and measures their current geometry without selecting a design. You choose the exact grounding, authored objects, layout, styling, relationships, and any required artboard growth.",
      },
    },
    currentArtboard: {
      package: input.artifact,
      browserAcknowledgement: input.acknowledgement,
      browserMaterializedSource: snapshot,
      sourceSha256: sourceHash(snapshot),
    },
    designPartnerContext: {
      appliesToEveryTurn: true,
      objective: "Help the model produce a complete, clear, readable, correctly attributed, evidence-safe result in one authored turn while preserving design ownership.",
      protectedEvidenceNodeIds: semanticGraph.evidenceItems.map((item) => item.nodeId),
      currentEvidencePresentation: input.acknowledgement.evidenceRegistry?.presentationManifest ?? [],
      currentAuthoredInterferencePairs: input.acknowledgement.review?.authoredInterferencePairs ?? [],
      currentRuntimeReview: input.acknowledgement.review,
      currentResolvedRelations: input.acknowledgement.resolvedDesignRelations ?? [],
      currentAuthoredRelations: input.acknowledgement.authoredDesignRelations ?? [],
      currentSemanticNodes: snapshot.semanticNodes ?? [],
      continuityContext,
      authoringQuestions: [
        "Is every addition readable and fully rendered inside its own bounds?",
        "Can a viewer understand why each addition is present and what it refers to?",
        "Does any text, card, label, annotation, fill, or decoration obscure protected evidence?",
        "Does any connector, leader, bracket, line, or relationship mark cross text, cards, annotations, labels, or other readable authored content in a way that creates ambiguity?",
        "After this turn, do all earlier additions still read clearly together, or should you reroute, reposition, redesign, or create more space while preserving their meaning?",
        "Did this turn change the context of any prior authored addition, and if so did you recompose that affected addition while preserving its identity, meaning, target, and provenance?",
        "Did the mutation preserve evidence source, size, order, visibility, and unrelated prior work?",
        "Did the design create enough negative space or artboard growth instead of compressing or covering content?",
        "Will every authored live relation remain understandable and attached after browser realization?",
      ],
    },
  };
}

export function sanitizeNorthstarDesignResetModelResponse(input: {
  raw: unknown;
  turn: NorthstarDesignResetTurn;
  baseRevisionId: string;
}): NorthstarDesignResetModelResponse {
  // The reset intentionally performs no semantic, placement, preservation, or
  // implementation-style validation before execution. The model response is
  // normalized only enough to construct an executable mutation. The rendered
  // result and complete diagnostics are the experiment.
  const raw = isRecord(input.raw) ? input.raw : {};
  const groundingRaw = isRecord(raw.grounding) ? raw.grounding : {};
  const mutation = sanitizeNorthstarArtboardMutationDraft(
    (isRecord(raw.mutation) ? raw.mutation : { operations: [] }) as unknown as NorthstarArtboardMutationDraft,
  );
  return {
    turn: input.turn,
    observedBaseRevisionId: input.baseRevisionId,
    understanding: typeof raw.understanding === "string" ? raw.understanding.trim() : "",
    grounding: {
      conceptId: groundingRaw.conceptId === "evidence-relationship"
        ? "evidence-relationship"
        : groundingRaw.conceptId === "evidence-gap-annotation"
          ? "evidence-gap-annotation"
          : groundingRaw.conceptId === "evidence-explanation"
            ? "evidence-explanation"
            : groundingRaw.conceptId === "flow-structure"
              ? "flow-structure"
              : groundingRaw.conceptId === "evidence-reuse"
                ? "evidence-reuse"
                : "research",
      resolvedNodeId: typeof groundingRaw.resolvedNodeId === "string" ? groundingRaw.resolvedNodeId : "",
      requestedRelation: groundingRaw.requestedRelation === "below" || groundingRaw.requestedRelation === "right-of" || groundingRaw.requestedRelation === "relationship-between" || groundingRaw.requestedRelation === "equal-space-with-annotation" || groundingRaw.requestedRelation === "explains" || groundingRaw.requestedRelation === "reuses" || groundingRaw.requestedRelation === "none"
        ? groundingRaw.requestedRelation
        : "none",
      placementSpace: groundingRaw.placementSpace === "artboard-world" ? "artboard-world" : "artboard-world",
      referenceContinuity: groundingRaw.referenceContinuity === "pixel-stable" ? "pixel-stable" : "pixel-stable",
      expansionDirection: groundingRaw.expansionDirection === "down" || groundingRaw.expansionDirection === "right" || groundingRaw.expansionDirection === "none"
        ? groundingRaw.expansionDirection
        : "none",
      evidenceNodeIds: Array.isArray(groundingRaw.evidenceNodeIds)
        ? groundingRaw.evidenceNodeIds.filter((value): value is string => typeof value === "string")
        : [],
      expectedPreservedNodeIds: Array.isArray(groundingRaw.expectedPreservedNodeIds)
        ? groundingRaw.expectedPreservedNodeIds.filter((value): value is string => typeof value === "string")
        : [],
      interpretation: typeof groundingRaw.interpretation === "string" ? groundingRaw.interpretation.trim() : "",
    },
    mutation,
  };
}

export function northstarAuthoredRelationRealizationIssues(
  response: NorthstarDesignResetModelResponse,
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
): string[] {
  const authored = acknowledgement.authoredDesignRelations ?? [];
  const resolvedById = new Map(
    (acknowledgement.resolvedDesignRelations ?? []).map((relation) => [relation.relationId, relation]),
  );
  const issues: string[] = [];
  for (const declared of response.mutation.relations ?? []) {
    const browserAuthored = authored.find((relation) => relation.id === declared.id);
    if (!browserAuthored) {
      issues.push(`browser acknowledgement omitted authored relation ${declared.id}`);
      continue;
    }
    const realized = resolvedById.get(declared.id);
    if (!realized || realized.status !== "resolved") {
      issues.push(`browser acknowledgement did not resolve relation ${declared.id}${realized?.message ? `: ${realized.message}` : ""}`);
    }
  }
  for (const relation of authored.filter((candidate) => candidate.realizationPolicy === "live")) {
    const realized = resolvedById.get(relation.id);
    if (!realized || realized.status !== "resolved") {
      const issue = `cumulative live relation ${relation.id} is ${realized?.status ?? "missing"}${realized?.message ? `: ${realized.message}` : ""}`;
      if (!issues.includes(issue)) issues.push(issue);
    }
  }
  return issues;
}

export function createNorthstarDesignResetCandidate(input: {
  base: NorthstarGeneratedCodeArtifactPackage;
  response: NorthstarDesignResetModelResponse;
}): NorthstarGeneratedCodeArtifactPackage {
  return appendNorthstarArtboardMutation({
    previous: input.base,
    draft: input.response.mutation,
    label: input.response.understanding,
    phase: "refinement",
    intent: input.response.understanding,
    verified: false,
    diagnostics: [
      `${NORTHSTAR_TWO_TURN_DESIGN_RESET_VERSION} turn ${input.response.turn}.`,
      `Exact accepted model mutation: ${JSON.stringify(input.response.mutation)}`,
    ],
    allowTextOnly: true,
    executionPolicy: "linear-design",
    sequenceOverride: input.response.turn,
  });
}

function sameDocument(
  base: NorthstarGeneratedCodeArtifactPackage,
  candidate: NorthstarGeneratedCodeArtifactPackage,
): boolean {
  return base.document.html === candidate.document.html
    && base.document.css === candidate.document.css
    && base.document.javascript === candidate.document.javascript
    && base.document.creativeJavascript === candidate.document.creativeJavascript
    && JSON.stringify(base.document.cssLayers ?? {}) === JSON.stringify(candidate.document.cssLayers ?? {});
}

export function validateNorthstarDesignResetCandidate(input: {
  base: NorthstarGeneratedCodeArtifactPackage;
  candidate: NorthstarGeneratedCodeArtifactPackage;
  turn: NorthstarDesignResetTurn;
}): { ok: boolean; issues: string[]; batch?: NorthstarArtboardMutationBatch } {
  // No candidate-policy validation is performed in the reset. The exact model
  // mutation is sent onward unchanged so diagnostics can reveal its real effect.
  const batch = input.candidate.mutationJournal?.at(-1);
  return { ok: true, issues: [], batch };
}

export function exactStringDiff(before: string, after: string): NorthstarExactStringDiff {
  if (before === after) {
    return { unchangedPrefixLength: before.length, unchangedSuffixLength: 0, removed: "", added: "" };
  }
  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shortest && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix
    && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) suffix += 1;
  return {
    unchangedPrefixLength: prefix,
    unchangedSuffixLength: suffix,
    removed: before.slice(prefix, before.length - suffix),
    added: after.slice(prefix, after.length - suffix),
  };
}

export function exactDocumentDiff(
  before: NorthstarLiveSurfaceSnapshot,
  after: NorthstarLiveSurfaceSnapshot,
): NorthstarExactDocumentDiff {
  const beforeLayers = before.cssLayers ?? {};
  const afterLayers = after.cssLayers ?? {};
  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: Record<string, { before: string; after: string; diff: NorthstarExactStringDiff }> = {};
  for (const key of Object.keys(afterLayers)) {
    if (!(key in beforeLayers)) added[key] = afterLayers[key];
    else if (beforeLayers[key] !== afterLayers[key]) {
      changed[key] = {
        before: beforeLayers[key],
        after: afterLayers[key],
        diff: exactStringDiff(beforeLayers[key], afterLayers[key]),
      };
    }
  }
  for (const key of Object.keys(beforeLayers)) {
    if (!(key in afterLayers)) removed[key] = beforeLayers[key];
  }
  return {
    html: exactStringDiff(before.html, after.html),
    css: exactStringDiff(before.css, after.css),
    javascript: exactStringDiff(before.javascript ?? "", after.javascript ?? ""),
    creativeJavascript: exactStringDiff(before.creativeJavascript ?? "", after.creativeJavascript ?? ""),
    cssLayers: { added, removed, changed },
  };
}

export function buildNorthstarDesignResetTurnArchive(input: {
  runId: string;
  artifactId: string;
  turn: NorthstarDesignResetTurn;
  requestedThinkingMode: "low" | "medium" | "high";
  instruction: string;
  status: NorthstarDesignResetTurnArchive["status"];
  beforePackage: NorthstarGeneratedCodeArtifactPackage;
  beforeAcknowledgement: NorthstarArtifactMutationAcknowledgement;
  systemInstruction: string;
  contents: unknown[];
  responseSchema: unknown;
  providerAttempt: NorthstarDesignResetProviderAttemptAudit;
  providerAttempts?: NorthstarDesignResetProviderAttemptAudit[];
  rawParsedResponse?: unknown;
  acceptedResponse?: NorthstarDesignResetModelResponse;
  candidateBeforeBrowser?: NorthstarGeneratedCodeArtifactPackage;
  mutationBatch?: NorthstarArtboardMutationBatch;
  afterPackage?: NorthstarGeneratedCodeArtifactPackage;
  afterAcknowledgement?: NorthstarArtifactMutationAcknowledgement;
  previousCumulativeIntentAudit?: NorthstarCumulativeIntentAudit;
  repairHistory?: unknown[];
  failure?: string;
}): NorthstarDesignResetTurnArchive {
  const beforeSnapshot = input.beforeAcknowledgement.snapshot;
  if (!beforeSnapshot) throw new Error("Cannot archive a design reset turn without its exact source-before snapshot.");
  const afterSnapshot = input.afterAcknowledgement?.snapshot;
  const beforeSemanticGraph = buildNorthstarArtboardSemanticGraph({ artifact: input.beforePackage, acknowledgement: input.beforeAcknowledgement });
  const afterSemanticGraph = afterSnapshot && input.afterPackage && input.afterAcknowledgement
    ? buildNorthstarArtboardSemanticGraph({ artifact: input.afterPackage, acknowledgement: input.afterAcknowledgement })
    : undefined;
  const rawMutation = isRecord(input.rawParsedResponse) ? input.rawParsedResponse.mutation : undefined;
  const normalizedMutation = input.acceptedResponse?.mutation;
  let cumulativeIntentAudit: NorthstarCumulativeIntentAudit | undefined;
  let cumulativeIntentAuditFailure: string | undefined;
  if (input.mutationBatch && input.afterPackage && input.afterAcknowledgement && afterSemanticGraph) {
    try {
      cumulativeIntentAudit = buildNorthstarCumulativeIntentAudit({
        turn: input.turn,
        instruction: input.instruction,
        beforePackage: input.beforePackage,
        beforeAcknowledgement: input.beforeAcknowledgement,
        beforeGraph: beforeSemanticGraph,
        currentMutation: input.mutationBatch,
        afterPackage: input.afterPackage,
        afterAcknowledgement: input.afterAcknowledgement,
        afterGraph: afterSemanticGraph,
        previousAudit: input.previousCumulativeIntentAudit,
        acceptedGrounding: input.acceptedResponse?.grounding,
      });
    } catch (error) {
      cumulativeIntentAuditFailure = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    schema: "northstar.design-reset-turn-archive.v5",
    resetVersion: NORTHSTAR_TWO_TURN_DESIGN_RESET_VERSION,
    runId: input.runId,
    artifactId: input.artifactId,
    turn: input.turn,
    requestedThinkingMode: input.requestedThinkingMode,
    effectiveDesignMode: "fixed-seven-turn",
    instruction: input.instruction,
    status: input.status,
    recordedAt: new Date().toISOString(),
    sourceBefore: {
      revisionId: input.beforePackage.revisionId,
      package: input.beforePackage,
      snapshot: beforeSnapshot,
      acknowledgement: input.beforeAcknowledgement,
      sourceSha256: sourceHash(beforeSnapshot),
      semanticGraph: beforeSemanticGraph,
    },
    modelBoundary: {
      systemInstruction: input.systemInstruction,
      contents: input.contents,
      responseSchema: input.responseSchema,
      providerAttempt: input.providerAttempt,
      providerAttempts: input.providerAttempts?.length ? input.providerAttempts : [input.providerAttempt],
      rawParsedResponse: input.rawParsedResponse,
      acceptedResponse: input.acceptedResponse,
      normalizationDiff: rawMutation === undefined || normalizedMutation === undefined
        ? undefined
        : exactStringDiff(JSON.stringify(rawMutation), JSON.stringify(normalizedMutation)),
    },
    modelAuthoredPatch: input.acceptedResponse?.mutation,
    appliedMutationBatch: input.mutationBatch,
    candidateBeforeBrowser: input.candidateBeforeBrowser,
    sourceAfter: afterSnapshot && input.afterPackage && input.afterAcknowledgement
      ? {
          revisionId: input.afterPackage.revisionId,
          package: input.afterPackage,
          snapshot: afterSnapshot,
          acknowledgement: input.afterAcknowledgement,
          sourceSha256: sourceHash(afterSnapshot),
          semanticGraph: afterSemanticGraph!,
        }
      : undefined,
    semanticGraphDiff: afterSemanticGraph ? semanticGraphDiff(beforeSemanticGraph, afterSemanticGraph) : undefined,
    exactSourceDiff: afterSnapshot ? exactDocumentDiff(beforeSnapshot, afterSnapshot) : undefined,
    cumulativeIntentAudit,
    cumulativeIntentAuditFailure,
    repairHistory: input.repairHistory,
    failure: input.failure,
  };
}
