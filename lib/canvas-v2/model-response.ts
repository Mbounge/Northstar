import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2CreativeDirection,
  type CanvasV2DesignDecision,
  type CanvasV2EvidenceAsset,
  type CanvasV2RenderedReflection,
  type CanvasV2SpatialStrategy,
} from "@/lib/canvas-v2/types";
import { applyCanvasV2SourcePatch, parseCanvasV2SourcePatch } from "@/lib/canvas-v2/source-patch";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

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

export function parseCanvasV2DesignDecision(
  value: unknown,
  approvedEvidence: readonly CanvasV2EvidenceAsset[] = [],
  previousDocument?: CanvasV2ArtifactDocument,
): CanvasV2DesignDecision {
  const input = record(value);
  if (!input) throw new Error("Canvas V2 model response must be an object.");
  const summary = requiredText(input.summary, "Decision summary", 1_200);
  const direction = creativeDirection(input.creativeDirection);
  const spatial = spatialStrategy(input.spatialStrategy);
  const reflection = renderedReflection(input.reflection);

  if (input.decision === "complete") {
    if (direction.unresolvedOpportunities.length) throw new Error("Completion requires no remaining model-authored visual opportunities.");
    if (direction.nextMoves.length) throw new Error("Completion requires no remaining model-authored creative moves.");
    return { schema: CANVAS_V2_DECISION_SCHEMA, decision: "complete", creativeDirection: direction, spatialStrategy: spatial, reflection, summary };
  }
  if (input.decision === "research") {
    if (input.moveKind !== "research") throw new Error("A research decision requires the research move kind.");
    return {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "research",
      moveKind: "research",
      creativeDirection: direction,
      spatialStrategy: spatial,
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
  });

  return {
    schema: CANVAS_V2_DECISION_SCHEMA,
    decision: "edit",
    moveKind,
    creativeDirection: direction,
    spatialStrategy: spatial,
    reflection,
    document,
    summary,
    expectedVisualResult: requiredText(input.expectedVisualResult, "Expected visual result", 1_200),
  };
}
