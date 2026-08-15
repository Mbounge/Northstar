import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2CompositionState,
  type CanvasV2CreativeDirection,
  type CanvasV2DesignDecision,
  type CanvasV2EvidenceAsset,
  type CanvasV2RenderedReflection,
  type CanvasV2SpatialStrategy,
} from "@/lib/canvas-v2/types";
import { applyCanvasV2SourcePatch, parseCanvasV2SourcePatch, type CanvasV2EvidenceScaleIntent } from "@/lib/canvas-v2/source-patch";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";
import { reconcileCanvasV2CompositionState } from "@/lib/canvas-v2/composition-continuity";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim().slice(0, maxLength);
}

function creativeDirection(value: unknown): CanvasV2CreativeDirection {
  const input = record(value);
  if (!input) throw new Error("Creative direction is required.");
  const rawNextMoves = Array.isArray(input.nextMoves) ? input.nextMoves : [];
  let nextMoves = rawNextMoves.slice(0, 6).map((move, index) => requiredText(move, `Creative direction next move ${index + 1}`, 500));
  const rawUnresolvedOpportunities = Array.isArray(input.unresolvedOpportunities) ? input.unresolvedOpportunities : [];
  const unresolvedOpportunities = rawUnresolvedOpportunities.slice(0, 8).map((opportunity, index) => requiredText(opportunity, `Creative direction unresolved opportunity ${index + 1}`, 500));
  // An unresolved-opportunity list is itself model-authored continuation intent.
  // Preserve it as the queue when the provider omits the duplicate nextMoves
  // field instead of spending another provider round trip on clerical repair.
  if (unresolvedOpportunities.length && !nextMoves.length) nextMoves = unresolvedOpportunities.slice(0, 6);
  return {
    designIntent: requiredText(input.designIntent, "Creative direction design intent", 1_000),
    visualThesis: requiredText(input.visualThesis, "Creative direction visual thesis", 1_000),
    compositionStrategy: requiredText(input.compositionStrategy, "Creative direction composition strategy", 1_000),
    visualLanguage: requiredText(input.visualLanguage, "Creative direction visual language", 1_000),
    evidenceStrategy: requiredText(input.evidenceStrategy, "Creative direction evidence strategy", 1_000),
    currentFocus: requiredText(input.currentFocus, "Creative direction current focus", 800),
    unresolvedOpportunities,
    nextMoves,
  };
}

function renderedReflection(value: unknown): CanvasV2RenderedReflection {
  const input = record(value);
  if (!input) throw new Error("Rendered reflection is required.");
  const remainingOpportunity = typeof input.remainingOpportunity === "string" && input.remainingOpportunity.trim()
    ? input.remainingOpportunity
    : "none";
  return {
    observedResult: requiredText(input.observedResult, "Rendered reflection observed result", 1_200),
    remainingOpportunity: requiredText(remainingOpportunity, "Rendered reflection remaining opportunity", 1_200),
    conceptRead: requiredText(input.conceptRead, "Rendered reflection concept read", 1_200),
    hierarchyRead: requiredText(input.hierarchyRead, "Rendered reflection hierarchy read", 1_200),
    evidenceRead: requiredText(input.evidenceRead, "Rendered reflection evidence read", 1_200),
    relationshipRead: requiredText(input.relationshipRead, "Rendered reflection relationship read", 1_200),
    legibilityRead: requiredText(input.legibilityRead, "Rendered reflection legibility read", 1_200),
    distinctivenessRead: requiredText(input.distinctivenessRead, "Rendered reflection distinctiveness read", 1_200),
    nextMoveReason: requiredText(input.nextMoveReason, "Rendered reflection next move reason", 1_200),
  };
}

function spatialStrategy(value: unknown): CanvasV2SpatialStrategy {
  const input = record(value);
  if (!input) throw new Error("Spatial strategy is required.");
  const growthDirection = input.growthDirection;
  if (growthDirection !== "stable" && growthDirection !== "horizontal" && growthDirection !== "vertical" && growthDirection !== "both") {
    throw new Error("Spatial strategy requires a valid growth direction.");
  }
  const rawIntentionalOverlaps = Array.isArray(input.intentionalOverlaps) ? input.intentionalOverlaps : [];
  return {
    growthDirection,
    layoutSystem: requiredText(input.layoutSystem, "Spatial strategy layout system", 1_000),
    primaryAnchor: requiredText(input.primaryAnchor, "Spatial strategy primary anchor", 800),
    hierarchyAndScale: requiredText(input.hierarchyAndScale, "Spatial strategy hierarchy and scale", 1_000),
    spacingRhythm: requiredText(input.spacingRhythm, "Spatial strategy spacing rhythm", 800),
    relationshipLogic: requiredText(input.relationshipLogic, "Spatial strategy relationship logic", 1_000),
    currentAdjustment: requiredText(input.currentAdjustment, "Spatial strategy current adjustment", 1_000),
    intentionalOverlaps: rawIntentionalOverlaps.slice(0, 12).map((entry, index) => requiredText(entry, `Intentional overlap ${index + 1}`, 500)),
  };
}

function uniqueTextList(value: unknown, label: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.slice(0, maxItems).map((item, index) => requiredText(item, `${label} ${index + 1}`, maxLength))));
}

function opaqueIdentityList(value: unknown, label: string, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.slice(0, maxItems).map((item, index) => {
    if (typeof item !== "string" || !item.trim()) throw new Error(`${label} ${index + 1} is required.`);
    const identity = item.trim();
    if (identity.length > 8_192) throw new Error(`${label} ${index + 1} exceeds the supported opaque identity length.`);
    return identity;
  })));
}

function compositionState(value: unknown): CanvasV2CompositionState | undefined {
  const input = record(value);
  if (!input) return undefined;
  const rawRegions = Array.isArray(input.regions) ? input.regions : [];
  const regions = rawRegions.slice(0, 16).map((entry, index) => {
    const region = record(entry);
    if (!region) throw new Error(`Composition state region ${index + 1} is invalid.`);
    const maturity = region.maturity;
    if (maturity !== "foundation" && maturity !== "developing" && maturity !== "resolved") throw new Error(`Composition state region ${index + 1} requires a valid maturity.`);
    return {
      nodeId: requiredText(region.nodeId, `Composition state region ${index + 1} node`, 240),
      ...(typeof region.islandId === "string" && region.islandId.trim() ? { islandId: region.islandId.trim().slice(0, 240) } : {}),
      ...(["title", "orientation", "evidence-reading", "comparison", "analysis", "relationship", "implication", "synthesis", "whole-board"].includes(String(region.storyRole))
        ? { storyRole: region.storyRole as "title" | "orientation" | "evidence-reading" | "comparison" | "analysis" | "relationship" | "implication" | "synthesis" | "whole-board" }
        : {}),
      purpose: requiredText(region.purpose, `Composition state region ${index + 1} purpose`, 600),
      maturity: maturity as "foundation" | "developing" | "resolved",
      ...(typeof region.resolutionRationale === "string" && region.resolutionRationale.trim() ? { resolutionRationale: region.resolutionRationale.trim().slice(0, 1_000) } : {}),
      openRequirements: uniqueTextList(region.openRequirements, `Composition state region ${index + 1} open requirement`, 6, 600),
      // Tenant evidence identities encode branch-aware provenance and can be
      // substantially longer than ordinary model-authored text. They are
      // opaque compiler state: validate their envelope, but never truncate.
      requiredEvidenceIds: opaqueIdentityList(region.requiredEvidenceIds, `Composition state region ${index + 1} required evidence`, 24),
      ...(["attached", "evidence-relative-island", "interleaved", "recompose"].includes(String(region.placementMode))
        ? { placementMode: region.placementMode as "attached" | "evidence-relative-island" | "interleaved" | "recompose" }
        : {}),
      ...(["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"].includes(String(region.targetZoneId))
        ? { targetZoneId: region.targetZoneId as "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right" }
        : {}),
    };
  });
  const rawRetired = Array.isArray(input.retiredNodes) ? input.retiredNodes : [];
  const retiredNodes = rawRetired.slice(0, 12).map((entry, index) => {
    const retired = record(entry);
    if (!retired) throw new Error(`Composition state retired node ${index + 1} is invalid.`);
    const replacementNodeId = typeof retired.replacementNodeId === "string" && retired.replacementNodeId.trim()
      ? retired.replacementNodeId.trim().slice(0, 240)
      : undefined;
    return {
      nodeId: requiredText(retired.nodeId, `Composition state retired node ${index + 1}`, 240),
      reason: requiredText(retired.reason, `Composition state retired node ${index + 1} reason`, 600),
      ...(replacementNodeId ? { replacementNodeId } : {}),
    };
  });
  const nextTerritory = record(input.nextTerritory);
  if (!nextTerritory) throw new Error("Composition state next territory is required.");
  const relation = nextTerritory.relation;
  if (relation !== "within" && relation !== "above" && relation !== "below" && relation !== "left" && relation !== "right" && relation !== "span" && relation !== "interleave" && relation !== "offset" && relation !== "recompose" && relation !== "none") {
    throw new Error("Composition state next territory requires a valid relation.");
  }
  return {
    dominantAnchor: requiredText(input.dominantAnchor, "Composition state dominant anchor", 800),
    readingOrder: uniqueTextList(input.readingOrder, "Composition state reading order", 20, 240),
    regions,
    preservedNodeIds: uniqueTextList(input.preservedNodeIds, "Composition state preserved node", 32, 240),
    retiredNodes,
    preservedStrengths: uniqueTextList(input.preservedStrengths, "Composition state preserved strength", 8, 600),
    nextTerritory: {
      relation,
      anchorNodeId: requiredText(nextTerritory.anchorNodeId, "Composition state next territory anchor", 240),
      intendedFootprint: requiredText(nextTerritory.intendedFootprint, "Composition state next territory footprint", 800),
      rationale: requiredText(nextTerritory.rationale, "Composition state next territory rationale", 800),
    },
    regressionRisks: uniqueTextList(input.regressionRisks, "Composition state regression risk", 8, 600),
  };
}

export function parseCanvasV2DesignDecision(
  value: unknown,
  approvedEvidence: readonly CanvasV2EvidenceAsset[] = [],
  previousDocument?: CanvasV2ArtifactDocument,
  scaleIntentByEvidenceId: ReadonlyMap<string, CanvasV2EvidenceScaleIntent> = new Map(),
): CanvasV2DesignDecision {
  const input = record(value);
  if (!input) throw new Error("Canvas V2 model response must be an object.");
  const summary = requiredText(input.summary, "Decision summary", 1_200);
  const direction = creativeDirection(input.creativeDirection);
  const spatial = spatialStrategy(input.spatialStrategy);
  const reflection = renderedReflection(input.reflection);
  const composition = compositionState(input.compositionState);

  if (input.decision === "complete") {
    if (direction.unresolvedOpportunities.length) throw new Error("Completion requires no remaining model-authored visual opportunities.");
    if (direction.nextMoves.length) throw new Error("Completion requires no remaining model-authored creative moves.");
    const reconciledComposition = previousDocument ? reconcileCanvasV2CompositionState(composition, previousDocument) : composition;
    return { schema: CANVAS_V2_DECISION_SCHEMA, decision: "complete", creativeDirection: direction, spatialStrategy: spatial, ...(reconciledComposition ? { compositionState: reconciledComposition } : {}), reflection, summary };
  }
  if (input.decision === "research") {
    if (input.moveKind !== "research") throw new Error("A research decision requires the research move kind.");
    return {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "research",
      moveKind: "research",
      creativeDirection: direction,
      spatialStrategy: spatial,
      ...(composition ? { compositionState: composition } : {}),
      reflection,
      appId: requiredText(input.appId, "Research app id", 400),
      flowId: requiredText(input.flowId, "Research flow id", 600),
      summary,
      expectedVisualResult: requiredText(input.expectedVisualResult, "Expected visual result", 1_200),
    };
  }
  if (input.decision !== "edit") throw new Error("Canvas V2 model must return research, edit, or complete.");
  const moveKind = input.moveKind;
  if (moveKind !== "framing" && moveKind !== "composition" && moveKind !== "relationship" && moveKind !== "analysis" && moveKind !== "refinement") {
    throw new Error("An edit decision requires a valid creative move kind.");
  }

  if (!previousDocument) throw new Error("An edit decision requires the committed source to apply its patch.");
  const document = applyCanvasV2SourcePatch({
    previous: previousDocument,
    operations: parseCanvasV2SourcePatch(input.patch),
    evidence: approvedEvidence,
    scaleIntentByEvidenceId,
  });
  const reconciledComposition = reconcileCanvasV2CompositionState(composition, document);

  return {
    schema: CANVAS_V2_DECISION_SCHEMA,
    decision: "edit",
    moveKind,
    creativeDirection: direction,
    spatialStrategy: spatial,
    ...(reconciledComposition ? { compositionState: reconciledComposition } : {}),
    reflection,
    document,
    summary,
    expectedVisualResult: requiredText(input.expectedVisualResult, "Expected visual result", 1_200),
  };
}
