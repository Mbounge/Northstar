import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@/lib/supabase/server";
import { parseCanvasV2DesignDecision } from "@/lib/canvas-v2/model-response";
import {
  applyCanvasV2SourcePatch,
  findCanvasV2SourceNodeRange,
  parseCanvasV2SourcePatch,
  type CanvasV2EvidenceScaleIntent,
} from "@/lib/canvas-v2/source-patch";
import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2ArtifactDocument,
  type CanvasV2ArtifactRevision,
  type CanvasV2CompositionState,
  type CanvasV2CreativeDirection,
  type CanvasV2EditDecision,
  type CanvasV2IslandExecutionContract,
  type CanvasV2ResearchDecision,
  type CanvasV2RenderObservation,
  type CanvasV2SpatialStrategy,
  type CanvasV2SurfaceZoneId,
  type CanvasV2TerritoryRelation,
} from "@/lib/canvas-v2/types";
import {
  compileCanvasV2CompositionState,
  validateCanvasV2CompositionContinuity,
} from "@/lib/canvas-v2/composition-continuity";
import {
  CANVAS_V2_WHOLE_BOARD_ISLAND_ID,
  buildCanvasV2IslandRegistry,
  canvasV2AllocatedIslandId,
  canvasV2CommittedIslandIdsForSourceValidation,
  reconcileCanvasV2EvidenceRelativeIslandOrder,
  validateCanvasV2IslandExecution,
} from "@/lib/canvas-v2/island-registry";
import { CANVAS_V2_MAX_CONTEXT_STEPS } from "@/lib/canvas-v2/design-loop";
import { loadAppDataCatalog, resolveAppDataTenantId } from "@/lib/app-data/canvas-v2-catalog";
import { NORTHSTAR_V2_CANVAS_GRAMMAR } from "@/lib/canvas-v2/northstar-canvas-grammar";
import {
  buildCanvasV2ResearchCatalogIndex,
  canvasV2ResearchDecisionPolicy,
  canvasV2ResearchStatusForDecision,
  nextCanvasV2RequiredResearch,
  resolveCanvasV2ResearchDecision,
  resolveCanvasV2ResearchCompletion,
} from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import {
  validateCanvasV2AnalysisEvidenceContinuity,
  validateCanvasV2ClaimedCanonicalFlowCounts,
  validateCanvasV2EvidenceContinuity,
  validateCanvasV2GroundedAppIdentityUsage,
  normalizeCanvasV2ClaimedCanonicalFlowCounts,
  validateCanvasV2QuantitativeClaimLabels,
  validateCanvasV2RequestedAnalysisEvidenceUsage,
  validateCanvasV2SelectedAnalysisEvidence,
} from "@/lib/canvas-v2/artifact-safety";
import { buildCanvasV2BoundedModelContext, compactCanvasV2IslandSourceForModel } from "@/lib/canvas-v2/model-context";
import {
  validateCanvasV2RenderedAnalysisEvidenceScale,
  validateCanvasV2RenderedDesignRegionContentIntegrity,
  validateCanvasV2RenderedDesignRegionTerritoryIntegrity,
  validateCanvasV2RenderedComparisonCommunication,
  validateCanvasV2RenderedIslandNarrativeIntegrity,
  validateCanvasV2RenderedRelationshipGeometry,
} from "@/lib/canvas-v2/evidence-authorship";
import {
  CanvasV2ProviderError,
  canvasV2ProviderErrorResponse,
  fetchCanvasV2ProviderJsonWithModelChain,
  invalidCanvasV2ProviderResponse,
} from "@/lib/canvas-v2/provider-reliability";
import {
  canvasV2DesignModelChain,
  canvasV2ProviderForModel,
  parseCanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";
import {
  buildCanvasV2StructuredProviderRequest,
  extractCanvasV2StructuredText,
} from "@/lib/canvas-v2/structured-provider";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import { compileCanvasV2SceneTransaction } from "@/lib/canvas-v2/scene-transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NORTHSTAR_DESIGN_REFERENCE_PATHS = [
  "public/northstar/design-references/strategic-storyline-atlas.png",
  "public/northstar/design-references/evidence-constellation.png",
];
const CREATIVE_DIRECTOR_SYSTEM = `You are North Star's visual director. Read the exact rendered overview, readable analytical-region captures, grounded evidence atlas, current creative direction, recent committed moves, and optional North Star taste reference. Return one concise JSON art-direction brief for the next visible source patch. Diagnose the most consequential visible weakness and prescribe one materially different, prompt-specific move that improves the communication.

A balanced two-column layout, three-column dashboard, repeated cards or panels, small conventional copy, and typography-only polish are scaffolding—not a resolved concept. Never keep prescribing the same container rearrangement under new wording. If recent turns already changed cards, columns, panels, grids, typography, or badges, the next brief must advance the visual argument through a genuinely different authored mode: evidence choreography, annotated sequence, causal path, relationship field, comparison axis, meaningful curve, stage compression, enlarged inspection, or another original device appropriate to the prompt. The point is not to include every device; it is to make one important insight unmistakably visible.

Let the communication problem determine the form. Editorial narratives, evidence fields, journeys, causal maps, comparison matrices, storyboards, annotated sequences, spatial arguments, data portraits, and original hybrids are possibilities, never prescribed templates. The board may compose above, below, beside, diagonally around, across, or within grounded evidence; it is not a webpage that must stack sections from top to bottom.

Treat each island as one chapter in a spatial story, never as decoration placed merely to occupy a zone. The permanent title-and-description island is chapter one: give it a deliberate bounded footprint in verified open territory above or beside the evidence, with generous separation and a clear reading origin. It may be wide when the actual occupancy map permits, but it must never claim the entire canvas by policy, overlap a collaborator's object, or rely on a camera offset to appear available. Every later island needs a prompt-critical purpose, a deliberate relationship to the evidence or an established island, and a distinct readable territory. If the desired territory currently contains canonical evidence or another occupant, prescribe a collision-free recomposition that preserves every existing object and opens real space above, beside, or below it; never prescribe an absolute overlay into occupied coordinates. Finish any developing island—including its assigned screenshots, labels, explanation, hierarchy, and styling—before opening another chapter.

A later turn is not an improvement merely because it is different. Identify the strongest exact visible qualities of the current committed render—such as a legible stage axis, coherent evidence scale, effective asymmetry, complete labels, or a clear reading order—and preserve them as an explicit preservation contract. Name the concrete regression risk of the proposed move. If a mature region already communicates well, extend it or make a bounded correction instead of replacing it with a speculative structure that can collapse its geometry, erase information, or create inert territory.

Select no more than eight exact short evidence handles from canonicalEvidence whenever the move depends on screenshots or app identity. Those selections become an executable contract; the server resolves them to the full tenant evidence IDs. Assign every selection an explicit scaleIntent: identity-mark for app icons, peer for screenshots that should stay roughly 0.75–1.6× their canonical peer height, or bounded-emphasis for a screenshot whose exact observed detail genuinely needs a larger but still integrated treatment no greater than 2.75× its canonical peer height. Never choose bounded-emphasis merely to fill a column, create symmetry, or make evidence feel important. When a stage map calls several blocks SOURCED or OBSERVED SCREEN, select one exact handle for every such block so the visual sequence is self-explanatory; otherwise explicitly treat the unsupported blocks as interpretation and do not leave empty screenshot footprints. Name a focused set of one to three short kebab-case authoredVisualRoles for the visible structures that could carry this turn (for example thesis-anchor, evidence-callout, comparison-axis, stage-transition, causal-connector, or an original role you devise). Do not use card, panel, column, grid, or dashboard as a visual role. The source author must materially realize at least one central role as data-canvas-v2-visual-role rather than spending the patch on metadata.

When a named app is visibly discussed in authored analysis, use its exact grounded identity handle as an identity-mark analysis copy at least once. Never substitute a generic letter tile, emoji, invented logo, or arbitrary black badge for available tenant identity evidence.

Read render.spatial.analysisEvidenceGeometry as factual scale evidence. A copied full-screen source may enlarge enough for close reading, but it must remain proportionate to the surrounding argument. Never accept a screenshot several times taller than its canonical peer or a pair of giant page-dominating captures as a finished focal treatment, even when metadata declares an analytical role or an annotation exists. Prescribe a bounded peer-scale inspection, integrated evidence callout, or smaller evidence-linked detail before any additional container work. Use render.spatial.authoredRelationships and authoredAnnotations to distinguish claimed visual language from geometry that actually exists.

Read render.spatial.authoredSurface as factual whole-board placement. Its placementOccupants list is the complete top-level multiplayer occupancy map: it includes user-created or detached objects, grounded research, and existing Northstar regions with exact rendered bounds and ownership. Its design-region centers, shares, reading order, nine named zones, zone occupancy, and edge space reveal whether the authored analysis is habitually collapsed into one webpage-like stack while usable territory remains elsewhere. Before every move, inspect every placement occupant and choose genuinely open world-space inside workspace.aiAuthoringBounds. Never prescribe a region that overlaps, covers, moves, resizes, or restyles a user-owned object or an unchanged existing object; a user object is a collaborator's durable decision, not spare background. Record the exact intended move in targetTerritory, anchored to an existing stable node, and select an exact targetZoneId. Choose the next location deliberately—above, below, left, right, diagonally offset, interleaved, spanning, or recomposing—according to the argument, reading order, and factual free space. placementMode=evidence-relative-island means a self-contained authored territory placed around the canonical evidence rather than appended to the same vertical stack; attached means a bounded extension of an established region; interleaved means a deliberate, explicitly marked relationship with the evidence rail; recompose means the existing authored regions are moved together as one whole-board change. Use islands when they make separate insights inspectable, but do not scatter arbitrary widgets or fill every zone. Negative space may remain, but it must feel intentional and counterbalanced; never prescribe empty width for its own sake. A completion recommendation uses relation none, placementMode=attached, and still names the dominant stable anchor and zone whose whole-board render was reviewed.

The islandRegistry is the authoritative programmatic map of independently editable authored compositions. Choose exactly one targetIsland action: create allocates the supplied new island ID; develop advances an existing island's core argument; enrich adds missing evidence or explanation to an existing island; repair corrects a concrete rendered or factual defect; recompose coordinates the whole board; complete closes the whole-board review. Never identify an island with prose. For develop, enrich, or repair, choose an exact existing island ID and preserve its stable identity. For create, choose only the server-allocated new island ID and a purposeful open zone. For recompose or complete, choose __whole-board__. The current turn receives a focused capture and source excerpt for its chosen existing island while retaining the whole-board overview, so an island can mature across turns without losing the surrounding composition.

Every create, develop, enrich, or repair decision must explicitly declare the target island's resultingMaturity, resolutionRationale, and openRequirements after this proposed visible turn. developing means the island still has one or more exact prompt-critical requirements, which must be listed. resolved means the island is fully composed, its intended information and evidence are present, its hierarchy and styling are coherent, and openRequirements is empty. Do not mark an island resolved merely because the patch executed. Once an island declares open requirements, they are a monotonic finishing contract: later turns may retain an exact requirement or remove it when satisfied, but may not replace it with a new polish goal and perpetually move the finish line. All evidence ever assigned to the island is likewise durable. When islandRegistry contains developing or evidence-incomplete work, continue one of those exact identities before creating another island; do not proliferate half-finished story fragments. A later turn may return to any resolved island for a bounded enrichment or repair, but consecutive refinements of the same resolved chapter are not progress: advance the wider story, recompose, or complete. Recompose never changes island maturity by implication. Complete is legal only when every island in islandRegistry is already resolved, has no open requirements, and retains all evidence previously assigned to it. Never use whole-board completion to fabricate resolved island state.

Give every island one stable storyRole. The first analytical island is always a narrative title territory: a strong prompt-specific title and descriptive orientation with a deliberate, legible footprint placed in collision-free territory near the beginning of the reading order. Preserve generous negative space between it, the evidence atlas, and every collaborator-owned object. That story beginning remains reserved for the title for the life of the board; later islands cannot reuse or cover it. It establishes what the board is about, why the evidence matters, and the visual thesis without becoming a generic dashboard header. Its exact width, wrapping, and origin must respond to the current placementOccupants map rather than forcing a full-width strip through occupied space. Later islands may orient, read evidence, compare, analyze, express a relationship, state an implication, or synthesize. Choose them because the story needs them, sequence them coherently around the evidence, and preserve the storyRole when returning to an existing island. Never create islands merely to occupy empty zones.

For a screenshot-led comparison, adjacent prose columns and small evidence thumbnails are not a resolved visual argument. Decide which prompt-specific visual form makes the central insight spatially inspectable: evidence choreography, juxtaposition, annotation, a connector, bracket, axis, sequence handoff, causal path, or a better device you invent. Relationship geometry is optional, never a box to tick. Do not prescribe it merely because none exists.

Treat connectors and other endpoint-dependent geometry as an integration layer, not an early scaffold. Stabilize the composition, evidence placement, hierarchy, scale, and visual style first. If material recomposition is still needed, prescribe that before new SVG geometry. Once relationships exist, any later brief that moves, replaces, or resizes their endpoint regions must explicitly rebuild or replace every affected relationship in the same visible turn; never preserve stale lines across a reflow.

Convergence is part of visual judgment. When recent committed summaries show that the same named axis, ruler, band, region, or evidence arrangement has already been rebuilt twice, another reimplementation is not a material move. Prefer completion when the factual and rendered-integrity checks are clear. Continue only when you can name a different prompt-critical insight or a genuinely different territory whose absence is visible in the supplied render; never keep a run alive for speculative polish.

The supplied convergencePhase is deliberate orchestration, not a turn cap. During foundation and development, establish and deepen a coherent prompt-specific visual thesis. During integration, reconcile regions, evidence, hierarchy, and any relationship geometry into one board. During convergence, inspect the complete board for missing prompt-critical information, disconnected islands, evidence-free claims, repeated structures, overlaps, and weak reading order; finish developing islands before opening optional territory and prescribe only the highest-value correction. During final-review, recommend completion only when every island is already resolved and the whole board answers the prompt. A final-review continuation must target one exact unresolved island or exact whole-board blocker, repair it, and leave the next render ready for completion.

Use real evidence and exact app identity; never invent product facts or quantitative claims. You do not write HTML or CSS. Recommend completion only when the whole-board overview has a dominant thesis, legible evidence-led story, purposeful visual relationships, coherent palette, inspectable evidence, and no material dead space or generic unfinished region. Your brief must be concrete enough for a separate source-authoring model to execute without guessing.

${NORTHSTAR_V2_CANVAS_GRAMMAR}`;
const CREATIVE_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    visualDiagnosis: { type: "string" },
    materialMove: { type: "string" },
    spatialDirection: { type: "string" },
    targetIsland: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["create", "develop", "enrich", "repair", "recompose", "complete"] },
        islandId: { type: "string" },
        storyRole: { type: "string", enum: ["title", "orientation", "evidence-reading", "comparison", "analysis", "relationship", "implication", "synthesis", "whole-board"] },
        resultingMaturity: { type: "string", enum: ["developing", "resolved", "unchanged"] },
        resolutionRationale: { type: "string" },
        openRequirements: { type: "array", minItems: 0, maxItems: 6, items: { type: "string" } },
      },
      required: ["action", "islandId", "storyRole", "resultingMaturity", "resolutionRationale", "openRequirements"],
    },
    targetTerritory: {
      type: "object",
      additionalProperties: false,
      properties: {
        relation: { type: "string", enum: ["within", "above", "below", "left", "right", "span", "interleave", "offset", "recompose", "none"] },
        anchorNodeId: { type: "string" },
        intendedFootprint: { type: "string" },
        rationale: { type: "string" },
        placementMode: { type: "string", enum: ["attached", "evidence-relative-island", "interleaved", "recompose"] },
        targetZoneId: { type: "string", enum: ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"] },
      },
      required: ["relation", "anchorNodeId", "intendedFootprint", "rationale", "placementMode", "targetZoneId"],
    },
    evidenceChoreography: { type: "string" },
    evidenceSelections: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          evidenceHandle: { type: "string" },
          roleInArgument: { type: "string" },
          intendedTreatment: { type: "string" },
          scaleIntent: { type: "string", enum: ["identity-mark", "peer", "bounded-emphasis"] },
        },
        required: ["evidenceHandle", "roleInArgument", "intendedTreatment", "scaleIntent"],
      },
    },
    authoredVisualRoles: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
    antiRepetition: { type: "string" },
    visualVocabulary: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
    paletteDirection: { type: "string" },
    whyThisTurn: { type: "string" },
    preservedStrengths: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
    regressionRisk: { type: "string" },
    completionRecommendation: { type: "string", enum: ["continue", "complete"] },
    completionRationale: { type: "string" },
    visualThesis: { type: "string" },
    compositionStrategy: { type: "string" },
    hierarchyAndScale: { type: "string" },
    spacingRhythm: { type: "string" },
    relationshipLogic: { type: "string" },
    growthDirection: { type: "string", enum: ["stable", "horizontal", "vertical", "both"] },
    remainingOpportunities: { type: "array", minItems: 0, maxItems: 6, items: { type: "string" } },
    nextMoves: { type: "array", minItems: 0, maxItems: 5, items: { type: "string" } },
  },
  required: ["visualDiagnosis", "materialMove", "spatialDirection", "targetIsland", "targetTerritory", "evidenceChoreography", "evidenceSelections", "authoredVisualRoles", "antiRepetition", "visualVocabulary", "paletteDirection", "whyThisTurn", "preservedStrengths", "regressionRisk", "completionRecommendation", "completionRationale", "visualThesis", "compositionStrategy", "hierarchyAndScale", "spacingRhythm", "relationshipLogic", "growthDirection", "remainingOpportunities", "nextMoves"],
} as const;

/**
 * Bind IDs to the current committed source before the provider is called.
 * Invalid handles and invented anchors therefore cannot satisfy structured
 * output, instead of consuming one of North Star's corrective passes later.
 */
function creativeBriefSchemaForRevision(evidenceHandles: readonly string[], anchorNodeIds: readonly string[], islandIds: readonly string[]) {
  return {
    ...CREATIVE_BRIEF_SCHEMA,
    properties: {
      ...CREATIVE_BRIEF_SCHEMA.properties,
      targetIsland: {
        ...CREATIVE_BRIEF_SCHEMA.properties.targetIsland,
        properties: {
          ...CREATIVE_BRIEF_SCHEMA.properties.targetIsland.properties,
          islandId: { type: "string", enum: islandIds },
        },
      },
      targetTerritory: {
        ...CREATIVE_BRIEF_SCHEMA.properties.targetTerritory,
        properties: {
          ...CREATIVE_BRIEF_SCHEMA.properties.targetTerritory.properties,
          anchorNodeId: { type: "string", enum: anchorNodeIds.length ? anchorNodeIds : ["canvas"] },
        },
      },
      evidenceSelections: {
        ...CREATIVE_BRIEF_SCHEMA.properties.evidenceSelections,
        items: {
          ...CREATIVE_BRIEF_SCHEMA.properties.evidenceSelections.items,
          properties: {
            ...CREATIVE_BRIEF_SCHEMA.properties.evidenceSelections.items.properties,
            evidenceHandle: { type: "string", enum: evidenceHandles },
          },
        },
      },
    },
  } as const;
}

/**
 * The source author executes one already-decided visual move. It does not
 * repeat the visual director's thesis, spatial plan, continuity ledger, or
 * whole-board review. Keeping this contract small is the primary structural
 * reliability and visible-latency boundary for Canvas V2.
 */
const SOURCE_AUTHOR_SYSTEM = `You are North Star's bounded source author. Execute the supplied visualDirectorBrief as one valid HTML/CSS source patch against the exact committed source outline.

Every visible authored primitive—text block, shape, connector, divider, image, table, frame, or other independently painted leaf—must receive its own unique data-canvas-v2-node-id so the user can select and transform it independently. Layout-only wrappers may remain anonymous; never merge separate visible primitives into one object merely to simplify layout.

Return only decision, moveKind, summary, expectedVisualResult, and patch. Do not return a creative direction, spatial strategy, composition ledger, reflection, research decision, completion decision, full document, or prose outside the JSON contract. The server owns those responsibilities.

Use only exact target node IDs from source.htmlOutline and executionContract.editableNodeIds. That editable-node directory is the authoritative target shortlist. If a semantic child you want is absent, append a new uniquely identified child inside an exact existing parent; never invent a target ID and assume it exists. Obey executionContract.targetIsland exactly. A create action must materialize one new top-level analytical territory whose data-canvas-v2-node-id is the supplied islandId and whose data-canvas-v2-story-role exactly matches storyRole. Develop, enrich, and repair must update that exact existing island without renaming, duplicating, or changing its story role. The narrative beginning of every authored board is permanently reserved for exactly one title island. Use a real h1/h2 plus a descriptive paragraph, establish the prompt-specific story, and place the title's bounded outer region in verified free territory near the beginning of the reading order. Its exact width, wrapping, and origin must respond to workspace.recommendedOpenTerritories and render.spatial.authoredSurface.placementOccupants; never force a full-canvas strip through occupied space, overlap canonical evidence, or cover a collaborator-owned object. Leave at least ${CANVAS_V2_WORKSPACE.documentMargin}px of deliberate margin before the grounded-evidence island; do not declare evidence interleave on it. No later non-title island may occupy or cover that narrative beginning. Fully execute the target island's intended visible state: if resultingMaturity is resolved, the island must visibly contain its complete intended message, every selected evidence item, all necessary labels and explanatory information, coherent hierarchy, and finished styling; if developing, execute this turn's material move while leaving the listed openRequirements honestly visible in lifecycle memory for a later turn. Do not abandon a developing island to open unrelated territory: finish its declared missing information, screenshots, hierarchy, or styling through its stable identity first. Recompose may coordinate several existing islands but must retain their stable identities and cannot silently resolve them. Each inserted or replaced top-level analytical territory requires a unique data-canvas-v2-node-id and data-canvas-v2-design-region; the compiler binds data-canvas-v2-island-id to the same stable ID. Materialize at least one supplied authoredVisualRole exactly as data-canvas-v2-visual-role. The compiler owns the target island's durable evidence ledger, exact provenance, stable identity, relation, placement mode, and target zone. Compose the already-bound evidence nodes from focusedIslandSource and preserve them in place. Never write evidence URLs or evidence handles. Preserve canonical evidence lanes and existing evidence copies.

During executionContract.repairMode=repair-existing-uncommitted-candidate, the supplied source is the exact rejected candidate and already contains the create transaction's target island. Correct that same node and its CSS in place. Do not append a duplicate island, change its identity, revisit art direction, or treat its presence as committed lifecycle state.

For develop, enrich, and repair, the committed target island is durable compiler-owned state. Never remove or replace its top-level node, and never remove or replace a descendant containing grounded evidence. Append or insert the new chapter inside the exact island, or replace one exact evidence-free child. For these existing-island actions, the server preserves the prior evidence ledger and pre-binds every newly selected image in focusedIslandSource before this call. Compose those existing image nodes; never emit, invent, or repeat an evidence handle. For a create action only, paste each exact executionContract.requiredEvidenceTags entry once inside the new island.

Realize targetTerritory, including its relation, placementMode, and targetZoneId, in actual source geometry. The supplied workspace.aiAuthoringBounds and render.spatial.authoredSurface.placementOccupants are binding geometry: the resulting top-level territory must fit inside that honest world-space band and must not intersect any existing user, research, or unchanged Northstar occupant. Mark the responsible top-level design region with data-canvas-v2-territory-relation, data-canvas-v2-placement-mode, and data-canvas-v2-target-zone using those exact brief values. An evidence-relative island must occupy a distinct, purposeful two-dimensional territory around the evidence—not become another section in the same vertical stack. Author only the intrinsic composition: the source compiler owns its ${CANVAS_V2_WORKSPACE.documentMargin}px local safe perimeter and translates the accepted native object scene to the permanent world-space origin x=${CANVAS_V2_WORKSPACE.aiAuthoringOriginX}px, never a camera-only offset. Never style body, html, the finite workspace, or a root canvas size/padding to simulate placement. Use intrinsic, content-driven grid/flex placement for region internals and deliberate parent grid areas, columns, normal-flow order, alignment, and margins for whole-composition territory; the compiler neutralizes absolute top-level island offsets because they create overlaps and edge escapes. Never create arbitrary empty canvas dimensions. Interleave only when explicitly requested and mark it with data-canvas-v2-evidence-interleave. Recompose all affected regions together when placementMode is recompose.

If the target zone currently contains a canonical lane, first change normal-flow or grid geometry so the complete lane moves intact and the island receives genuinely empty territory. Never position an island over canonical screenshots and rely on z-index, transparency, metadata, or an overlap exemption. The rendered boundaries of independently authored islands must remain distinct from one another.

Preserve screenshot aspect ratios and the supplied scale intent. Do not author page-dominating screenshots. Ground every product-specific analytical claim in a visible screen from canonical evidence or an exact evidence copy; label interpretation and estimates honestly. Do not introduce endpoint-dependent SVG relationships until the brief asks for them. When existing relationship endpoints move, replace or update all affected geometry in the same patch. Relationship geometry must carry exact data-canvas-v2-relationship-source and data-canvas-v2-relationship-target anchors; annotations must carry data-canvas-v2-annotation-for. Do not emit scripts, iframes, forms, event handlers, external imports, or JavaScript.

Canonical flow screen totals and authored comparison stages are different facts. Never describe a selected subset, three-stage axis, or representative sequence as “N screens” for an app. Use “stages”, “phases”, “moments”, or “selected examples” for authored compression; reserve “N screens” only for the exact authoritative complete-flow totals supplied in authoritativeCanonicalFacts.

Make the smallest source change that visibly executes the brief. A successful turn changes the rendered board; no-op CSS and metadata-only changes are invalid.

${NORTHSTAR_V2_CANVAS_GRAMMAR}`;

const SOURCE_AUTHOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["edit"] },
    moveKind: { type: "string", enum: ["framing", "composition", "relationship", "analysis", "refinement"] },
    summary: { type: "string" },
    expectedVisualResult: { type: "string" },
    patch: {
      type: "object",
      additionalProperties: false,
      properties: {
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  op: { type: "string", enum: ["insert-before", "insert-after", "append-html", "replace-node"] },
                  targetNodeId: { type: "string" },
                  html: { type: "string" },
                },
                required: ["op", "targetNodeId", "html"],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  op: { type: "string", enum: ["remove-node"] },
                  targetNodeId: { type: "string" },
                },
                required: ["op", "targetNodeId"],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  op: { type: "string", enum: ["upsert-css"] },
                  layerId: { type: "string" },
                  css: { type: "string" },
                },
                required: ["op", "layerId", "css"],
              },
            ],
          },
        },
      },
      required: ["operations"],
    },
  },
  required: ["decision", "moveKind", "summary", "expectedVisualResult", "patch"],
} as const;
function normalizedMove(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sharedMoveTerms(left: string, right: string): number {
  const ignored = new Set(["a", "an", "and", "the", "to", "of", "with", "for", "into", "from", "on", "in"]);
  const leftTerms = new Set(normalizedMove(left).split(" ").filter((term) => term.length > 2 && !ignored.has(term)));
  return normalizedMove(right).split(" ").filter((term) => leftTerms.has(term)).length;
}

// Repetition detection must compare the authored device, not the vocabulary
// every healthy North Star turn naturally shares. "Executive comparison",
// "evidence", "frame", and "preserve the rails" describe continuity; treating
// those words as an identical move can reject a genuinely new ledger, axis, or
// evidence choreography four times and pause an otherwise healthy run.
const REPETITION_GENERIC_MOVE_TERMS = new Set([
  "add", "analysis", "analytical", "canvas", "author", "authored", "balanced", "board", "build", "canonical", "comparison", "complete",
  "composition", "create", "current", "design", "develop", "evidence", "exact", "executive", "existing", "frame", "grounded", "identity",
  "insight", "integrate", "journey", "layout", "mark", "marks", "material", "mobile", "move", "onboarding", "placement", "preserve",
  "product", "rail", "rails", "recompose", "region", "screen", "screens", "selected", "source", "stage", "structure", "territory", "turn",
  "visual", "visible", "wide", "within",
]);

function distinctiveMoveTerms(value: string, subjectTerms: ReadonlySet<string> = new Set()): Set<string> {
  return new Set(normalizedMove(value).split(" ").filter((term) => term.length > 3 && !REPETITION_GENERIC_MOVE_TERMS.has(term) && !subjectTerms.has(term)));
}

function sharedDistinctiveMoveTerms(left: string, right: string, subjectTerms: ReadonlySet<string> = new Set()): number {
  const leftTerms = distinctiveMoveTerms(left, subjectTerms);
  return Array.from(distinctiveMoveTerms(right, subjectTerms)).filter((term) => leftTerms.has(term)).length;
}

function hasMaterialRemainingOpportunity(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return !/^(?:none|nothing|no\s+material(?:\s+visual)?\s+(?:opportunity|work)(?:\s+remains?)?)(?:\s*[.!:;—-]|\s*$)/i.test(normalized);
}

function compactCanvasV2IslandExecution(value: unknown): CanvasV2IslandExecutionContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rawExecution = value as Record<string, unknown>;
  const rawTarget = rawExecution.target && typeof rawExecution.target === "object" && !Array.isArray(rawExecution.target)
    ? rawExecution.target as Record<string, unknown>
    : undefined;
  const rawTerritory = rawExecution.territory && typeof rawExecution.territory === "object" && !Array.isArray(rawExecution.territory)
    ? rawExecution.territory as Record<string, unknown>
    : undefined;
  if (!rawTarget || !rawTerritory) return undefined;
  const exact = <T extends readonly string[]>(candidate: unknown, allowed: T): T[number] | undefined => (
    typeof candidate === "string" && allowed.includes(candidate as T[number]) ? candidate as T[number] : undefined
  );
  const stringList = (candidate: unknown, limit: number, maxLength: number): string[] => Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, limit).map((item) => item.trim().slice(0, maxLength))
    : [];
  const opaqueIdentityList = (candidate: unknown, limit: number): string[] => Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, limit).map((item) => {
        const identity = item.trim();
        if (identity.length > 8_192) throw new Error("Canvas V2 evidence identity exceeds the supported opaque identity length.");
        return identity;
      })
    : [];
  const action = exact(rawTarget.action, ["create", "develop", "enrich", "repair", "recompose", "complete"] as const);
  const storyRole = exact(rawTarget.storyRole, ["title", "orientation", "evidence-reading", "comparison", "analysis", "relationship", "implication", "synthesis", "whole-board"] as const);
  const resultingMaturity = exact(rawTarget.resultingMaturity, ["developing", "resolved", "unchanged"] as const);
  const relation = exact(rawTerritory.relation, ["within", "above", "below", "left", "right", "span", "interleave", "offset", "recompose", "none"] as const);
  const placementMode = exact(rawTerritory.placementMode, ["attached", "evidence-relative-island", "interleaved", "recompose"] as const);
  const targetZoneId = exact(rawTerritory.targetZoneId, ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"] as const);
  if (!action || !storyRole || !resultingMaturity || !relation || !placementMode || !targetZoneId
    || typeof rawTarget.islandId !== "string" || !rawTarget.islandId.trim()
    || typeof rawTarget.resolutionRationale !== "string"
    || typeof rawTerritory.anchorNodeId !== "string"
    || typeof rawTerritory.intendedFootprint !== "string"
    || typeof rawTerritory.rationale !== "string") return undefined;
  let directorCheckpointJson: string | undefined;
  if (typeof rawExecution.directorCheckpointJson === "string" && rawExecution.directorCheckpointJson.length <= 32_000) {
    try {
      const checkpoint = JSON.parse(rawExecution.directorCheckpointJson);
      if (checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint)) {
        directorCheckpointJson = rawExecution.directorCheckpointJson;
      }
    } catch {
      // Legacy or malformed checkpoints cannot become repair authority.
    }
  }
  return {
    target: {
      action,
      islandId: rawTarget.islandId.trim().slice(0, 240),
      storyRole,
      resultingMaturity,
      resolutionRationale: rawTarget.resolutionRationale.slice(0, 1_000),
      openRequirements: stringList(rawTarget.openRequirements, 6, 600),
    },
    territory: {
      relation,
      anchorNodeId: rawTerritory.anchorNodeId.slice(0, 240),
      intendedFootprint: rawTerritory.intendedFootprint.slice(0, 800),
      rationale: rawTerritory.rationale.slice(0, 800),
      placementMode,
      targetZoneId,
    },
    requiredEvidenceIds: opaqueIdentityList(rawExecution.requiredEvidenceIds, 64),
    requiredEvidenceHandles: stringList(rawExecution.requiredEvidenceHandles, 64, 300),
    requiredVisualRoles: stringList(rawExecution.requiredVisualRoles, 12, 240),
    ...(directorCheckpointJson ? { directorCheckpointJson } : {}),
  };
}

function compactCanvasV2RenderRepair(value: unknown): {
  attempt: number;
  maxAttempts: number;
  failures: string[];
  failedMove?: string;
  islandExecution?: CanvasV2IslandExecutionContract;
  rejectedCandidate?: Record<string, unknown>;
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const attempt = Math.max(1, Math.min(3, Number(record.attempt) || 1));
  const maxAttempts = Math.max(attempt, Math.min(3, Number(record.maxAttempts) || 3));
  const rejected = record.rejectedCandidate && typeof record.rejectedCandidate === "object" && !Array.isArray(record.rejectedCandidate)
    ? record.rejectedCandidate as Record<string, unknown>
    : undefined;
  const islandExecution = compactCanvasV2IslandExecution(record.islandExecution);
  const boundedRecords = (input: unknown, limit: number) => Array.isArray(input)
    ? input.slice(0, limit).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const boundedHtml = Array.isArray(rejected?.nodeHtmlExcerpts)
    ? rejected.nodeHtmlExcerpts.slice(0, 6).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      if (typeof entry.nodeId !== "string" || typeof entry.html !== "string") return [];
      return [{ nodeId: entry.nodeId.slice(0, 240), html: entry.html.slice(0, 1_600) }];
    })
    : [];
  return {
    attempt,
    maxAttempts,
    failures: (Array.isArray(record.failures) ? record.failures : []).filter((item): item is string => typeof item === "string").slice(-8).map((item) => item.slice(0, 800)),
    ...(typeof record.failedMove === "string" ? { failedMove: record.failedMove.slice(0, 1_200) } : {}),
    ...(islandExecution ? { islandExecution } : {}),
    ...(rejected ? {
      rejectedCandidate: {
        ...(rejected.canvasGeometry && typeof rejected.canvasGeometry === "object" && !Array.isArray(rejected.canvasGeometry)
          ? { canvasGeometry: rejected.canvasGeometry }
          : {}),
        evidenceGeometry: boundedRecords(rejected.evidenceGeometry, 12),
        designRegions: boundedRecords(rejected.designRegions, 12),
        relationshipGeometry: boundedRecords(rejected.relationshipGeometry, 12),
        nodeHtmlExcerpts: boundedHtml,
        ...(typeof rejected.cssTail === "string" ? { cssTail: rejected.cssTail.slice(-6_000) } : {}),
      },
    } : {}),
  };
}

function canvasV2RenderRepairInstruction(repair: ReturnType<typeof compactCanvasV2RenderRepair>): string {
  if (!repair) return "";
  const posture = repair.attempt === 1
    ? "Preserve the valid visual intention, but correct the exact rejected geometry or evidence treatment from the last uncommitted candidate."
    : repair.attempt === 2
      ? "The first render repair still failed. Rebuild the responsible region from the committed source with simpler intrinsic geometry; do not preserve the rejected CSS structure."
      : "Final render repair: discard the rejected candidate geometry and execute the smallest render-safe version of the same prompt-critical move inside the promised territory.";
  return `RENDER REPAIR PASS ${repair.attempt} OF ${repair.maxAttempts}. ${posture} Exact failures: ${repair.failures.join(" ")} ${repair.failedMove ? `Rejected move: ${repair.failedMove}` : ""} `;
}

function validateCanvasV2CreativeArc(
  decision: ReturnType<typeof parseCanvasV2DesignDecision>,
  policy: ReturnType<typeof canvasV2ResearchDecisionPolicy>,
  allowCreativeRedirection = false,
): void {
  if (decision.decision === "edit") {
    const declaredMove = `${decision.summary} ${decision.expectedVisualResult} ${decision.creativeDirection.currentFocus}`;
    if (/\b(?:no[ -]?op|continuity-only|continuity patch|remains unchanged|preserve(?:d)? (?:the )?(?:current|committed|existing) (?:canvas|composition|revision) exactly)\b/i.test(declaredMove)) {
      throw new Error("A visible design turn must make one material rendered change. Return decision=complete when the observed composition is finished; never spend a turn on no-op CSS, a continuity-only patch, or an unchanged revision.");
    }
  }
  if (decision.decision === "edit" && policy.requiresPlannedContinuation && decision.creativeDirection.nextMoves.length < 3) {
    throw new Error("The first grounded synthesis edit must establish a model-authored creative arc with at least three distinct meaningful moves for observed subsequent turns. The model chooses those moves; this is not a fixed template or turn ceiling.");
  }
  if (decision.decision === "edit" && policy.requiredNextMoves?.length) {
    const [requiredNextMove] = policy.requiredNextMoves;
    const evidence = `${decision.summary} ${decision.expectedVisualResult} ${decision.creativeDirection.currentFocus}`;
    if (sharedMoveTerms(requiredNextMove, evidence) < 1 && !allowCreativeRedirection) {
      throw new Error(`This turn must visibly execute the model's previously declared next move before advancing the creative arc: ${requiredNextMove}`);
    }
  }
  if (decision.decision === "edit" && decision.creativeDirection.unresolvedOpportunities.length && decision.creativeDirection.nextMoves.length === 0) {
    throw new Error("An unresolved visual opportunity requires at least one concrete future move. Continue the model-authored creative review instead of ending the queue.");
  }
  if (decision.decision === "edit" && !decision.document.html.includes("data-canvas-v2-design-region")) {
    throw new Error("A synthesis edit must identify its top-level authored analytical composition with data-canvas-v2-design-region so later turns receive a readable render of their own work.");
  }
  if (decision.decision === "complete" && (decision.creativeDirection.unresolvedOpportunities.length || hasMaterialRemainingOpportunity(decision.reflection.remainingOpportunity))) {
    const opportunity = decision.creativeDirection.unresolvedOpportunities[0] || decision.reflection.remainingOpportunity;
    throw new Error(`Completion is premature because your own final-render review still identifies material visual work: ${opportunity}. Return an edit that visibly resolves this opportunity, keep it in creativeDirection.unresolvedOpportunities until observed, and provide at least one concrete nextMove.`);
  }
}

function directorCompletionDecision(input: {
  brief: ReturnType<typeof parseCreativeDirectorBrief>;
  creativeDirection: CanvasV2CreativeDirection;
  spatialStrategy: CanvasV2SpatialStrategy;
  compositionState: CanvasV2CompositionState;
  revision: CanvasV2ArtifactRevision;
}) {
  const compositionState: CanvasV2CompositionState = {
    ...input.compositionState,
    retiredNodes: [],
    nextTerritory: {
      relation: "none",
      anchorNodeId: input.compositionState.dominantAnchor,
      intendedFootprint: "The reconciled whole-board composition remains in its verified footprint.",
      rationale: input.brief.completionRationale,
    },
  };
  return parseCanvasV2DesignDecision({
    decision: "complete",
    summary: input.brief.completionRationale,
    creativeDirection: {
      ...input.creativeDirection,
      currentFocus: input.brief.completionRationale,
      unresolvedOpportunities: [],
      nextMoves: [],
    },
    spatialStrategy: {
      ...input.spatialStrategy,
      currentAdjustment: input.brief.completionRationale,
    },
    compositionState,
    reflection: {
      observedResult: input.brief.completionRationale,
      remainingOpportunity: "none",
      conceptRead: input.brief.visualDiagnosis,
      hierarchyRead: input.brief.preservedStrengths.join(" "),
      evidenceRead: input.brief.evidenceChoreography,
      relationshipRead: input.brief.visualVocabulary.join(", "),
      legibilityRead: input.brief.preservedStrengths.join(" "),
      distinctivenessRead: input.brief.whyThisTurn,
      nextMoveReason: input.brief.completionRationale,
    },
  }, input.revision.evidence, input.revision.document);
}

async function loadNorthstarDesignReferenceParts(): Promise<Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{
    text: "North Star visual-language references follow. Use them only to calibrate editorial craft and visual intelligence; do not copy their layout, prose, claims, or data.",
  }];
  for (const relativePath of NORTHSTAR_DESIGN_REFERENCE_PATHS.slice(0, 1)) {
    try {
      const data = await readFile(path.join(process.cwd(), relativePath));
      parts.push({ text: `Visual-language reference: ${path.basename(relativePath)}` }, { inlineData: { mimeType: "image/png", data: data.toString("base64") } });
    } catch {
      // The production design loop remains usable when optional taste references are absent.
    }
  }
  return parts.length > 1 ? parts : [];
}

function firstRailDetailPerLane(details: NonNullable<CanvasV2RenderObservation["railDetails"]>) {
  const laneIds = new Set<string>();
  return details.filter((detail) => {
    if (laneIds.has(detail.laneNodeId)) return false;
    laneIds.add(detail.laneNodeId);
    return true;
  }).slice(0, 3);
}

function progressiveRailDetails(
  details: NonNullable<CanvasV2RenderObservation["railDetails"]>,
  firstSynthesisTurn: boolean,
  observedDesignTurns: number,
) {
  if (firstSynthesisTurn) return firstRailDetailPerLane(details);
  if (!details.length) return [];
  return [details[observedDesignTurns % details.length]];
}

function diverseDesignDetails(
  details: NonNullable<CanvasV2RenderObservation["designDetails"]>,
  observation: CanvasV2RenderObservation,
  composition: CanvasV2CompositionState | undefined,
  observedDesignTurns: number,
  maximum: number,
) {
  if (details.length <= maximum) return details;
  const byNodeId = new Map(details.map((detail) => [detail.nodeId, detail]));
  const surface = observation.spatial.authoredSurface;
  const selected: typeof details = [];
  const append = (detail: (typeof details)[number] | undefined) => {
    if (detail && !selected.some((candidate) => candidate.nodeId === detail.nodeId)) selected.push(detail);
  };
  for (const nodeId of [
    composition?.nextTerritory.anchorNodeId,
    surface?.primaryRegionNodeId,
    surface?.bottommostRegionNodeId,
    surface?.rightmostRegionNodeId,
    surface?.topmostRegionNodeId,
    surface?.leftmostRegionNodeId,
  ]) append(nodeId ? byNodeId.get(nodeId) : undefined);
  append([...details].sort((left, right) => right.canvasAreaShare - left.canvasAreaShare)[0]);
  append(details[observedDesignTurns % details.length]);
  for (const detail of details) append(detail);
  return selected.slice(0, maximum);
}

function previousFailure(request: NextRequest): string | undefined {
  const encoded = request.headers.get("x-canvas-v2-previous-failure");
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded).trim().slice(0, 1_200) || undefined;
  } catch {
    return undefined;
  }
}

function parseDataUrl(value: string): { mimeType: string; data: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Canvas V2 observation must contain a PNG, JPEG, or WebP data URL.");
  return { mimeType: match[1], data: match[2] };
}

function requiredCreativeBriefText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`The visual director brief requires ${label}.`);
  return value.trim().slice(0, maxLength);
}

function parseCreativeDirectorBrief(
  text: string,
  evidenceIdByHandle: ReadonlyMap<string, string> = new Map(),
) {
  if (!text) throw new Error("The visual director returned no brief.");
  const value = JSON.parse(text) as Record<string, unknown>;
  for (const field of ["visualDiagnosis", "materialMove", "spatialDirection", "evidenceChoreography", "antiRepetition", "paletteDirection", "whyThisTurn", "regressionRisk", "completionRationale"] as const) {
    if (typeof value[field] !== "string" || !value[field].trim()) throw new Error(`The visual director brief requires ${field}.`);
  }
  const targetIsland = value.targetIsland && typeof value.targetIsland === "object" && !Array.isArray(value.targetIsland)
    ? value.targetIsland as Record<string, unknown>
    : undefined;
  const islandAction = targetIsland?.action;
  if (!targetIsland || !["create", "develop", "enrich", "repair", "recompose", "complete"].includes(String(islandAction))) {
    throw new Error("The visual director brief requires a valid programmatic island action.");
  }
  const targetIslandId = requiredCreativeBriefText(targetIsland.islandId, "an exact target island identity", 240);
  const storyRole = targetIsland.storyRole;
  if (!["title", "orientation", "evidence-reading", "comparison", "analysis", "relationship", "implication", "synthesis", "whole-board"].includes(String(storyRole))) {
    throw new Error("The visual director brief requires an exact island story role.");
  }
  const resultingMaturity = targetIsland.resultingMaturity;
  if (resultingMaturity !== "developing" && resultingMaturity !== "resolved" && resultingMaturity !== "unchanged") {
    throw new Error("The visual director brief requires an exact resulting island maturity.");
  }
  const resolutionRationale = requiredCreativeBriefText(targetIsland.resolutionRationale, "an island resolution rationale", 1_000);
  const openRequirements = Array.isArray(targetIsland.openRequirements)
    ? targetIsland.openRequirements.slice(0, 6).map((item, index) => requiredCreativeBriefText(item, `island open requirement ${index + 1}`, 600))
    : [];
  if (["create", "develop", "enrich", "repair"].includes(String(islandAction))) {
    if (resultingMaturity === "unchanged") throw new Error(`${String(islandAction)} must explicitly leave its target island developing or resolved; unchanged is reserved for whole-board actions.`);
    if (resultingMaturity === "developing" && !openRequirements.length) throw new Error("A developing island must name at least one exact prompt-critical open requirement for a later turn.");
    if (resultingMaturity === "resolved" && openRequirements.length) throw new Error("A resolved island cannot retain open requirements.");
  }
  if (!Array.isArray(value.evidenceSelections) || value.evidenceSelections.length > 8) throw new Error("The visual director brief requires a focused evidence selection list of no more than eight items.");
  const targetTerritory = value.targetTerritory && typeof value.targetTerritory === "object" && !Array.isArray(value.targetTerritory)
    ? value.targetTerritory as Record<string, unknown>
    : undefined;
  const territoryRelation = targetTerritory?.relation;
  if (!targetTerritory || !["within", "above", "below", "left", "right", "span", "interleave", "offset", "recompose", "none"].includes(String(territoryRelation))) {
    throw new Error("The visual director brief requires a valid target territory relation.");
  }
  const placementMode = targetTerritory.placementMode;
  if (!['attached', 'evidence-relative-island', 'interleaved', 'recompose'].includes(String(placementMode))) {
    throw new Error("The visual director brief requires a valid two-dimensional placement mode.");
  }
  const targetZoneId = targetTerritory.targetZoneId;
  if (!["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"].includes(String(targetZoneId))) {
    throw new Error("The visual director brief requires an exact target zone from the observed whole-board map.");
  }
  const evidenceSelections = value.evidenceSelections.map((selection, index) => {
    if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new Error(`Visual director evidence selection ${index + 1} must be an object.`);
    const record = selection as Record<string, unknown>;
    const evidenceHandle = typeof record.evidenceHandle === "string" ? record.evidenceHandle.trim() : "";
    const evidenceId = evidenceIdByHandle.get(evidenceHandle);
    const roleInArgument = typeof record.roleInArgument === "string" ? record.roleInArgument.trim() : "";
    const intendedTreatment = typeof record.intendedTreatment === "string" ? record.intendedTreatment.trim() : "";
    const scaleIntent = record.scaleIntent;
    if (!evidenceHandle || !roleInArgument || !intendedTreatment || (scaleIntent !== "identity-mark" && scaleIntent !== "peer" && scaleIntent !== "bounded-emphasis")) throw new Error(`Visual director evidence selection ${index + 1} is incomplete.`);
    if (!evidenceId) throw new Error(`Visual director selected an evidence handle that is not grounded in the current canvas: ${evidenceHandle}.`);
    return { evidenceHandle, evidenceId, roleInArgument: roleInArgument.slice(0, 600), intendedTreatment: intendedTreatment.slice(0, 600), scaleIntent };
  });
  if (!Array.isArray(value.authoredVisualRoles) || !value.authoredVisualRoles.length || value.authoredVisualRoles.length > 3) {
    throw new Error("The visual director brief requires authored visual roles.");
  }
  const authoredVisualRoles = value.authoredVisualRoles.map((role, index) => {
    if (typeof role !== "string" || !role.trim()) throw new Error(`Authored visual role ${index + 1} is invalid.`);
    const normalized = role.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    if (!normalized || /^(?:card|cards|panel|panels|column|columns|grid|dashboard)$/.test(normalized)) {
      throw new Error(`Authored visual role ${index + 1} must describe communication, not a generic container.`);
    }
    return normalized;
  });
  if (!Array.isArray(value.visualVocabulary) || !value.visualVocabulary.length || value.visualVocabulary.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("The visual director brief requires concrete visual vocabulary.");
  }
  if (!Array.isArray(value.preservedStrengths) || !value.preservedStrengths.length || value.preservedStrengths.length > 4 || value.preservedStrengths.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("The visual director brief requires an explicit preservation contract for the current render's strongest qualities.");
  }
  if (value.completionRecommendation !== "continue" && value.completionRecommendation !== "complete") throw new Error("The visual director brief requires a completion recommendation.");
  if (value.completionRecommendation === "continue" && territoryRelation === "none") throw new Error("A continuing visual-director brief must name the exact territory for its next material move.");
  const growthDirection = value.growthDirection;
  if (!["stable", "horizontal", "vertical", "both"].includes(String(growthDirection))) throw new Error("The visual director brief requires a valid canvas growth direction.");
  const remainingOpportunities = Array.isArray(value.remainingOpportunities)
    ? value.remainingOpportunities.slice(0, 6).map((item, index) => requiredCreativeBriefText(item, `remaining opportunity ${index + 1}`, 600))
    : [];
  const nextMoves = Array.isArray(value.nextMoves)
    ? value.nextMoves.slice(0, 5).map((item, index) => requiredCreativeBriefText(item, `next move ${index + 1}`, 600))
    : [];
  // These queues are redundant planning fields, not creative validity. A
  // complete recommendation closes them by definition; a continuing brief can
  // derive its one minimum lifecycle entry from the already-required diagnosis
  // and material move. Normalize here before semantic policy checks so a valid
  // visual judgment never burns an additional provider call on clerical JSON.
  const normalizedRemainingOpportunities = value.completionRecommendation === "complete"
    ? []
    : remainingOpportunities.length
      ? remainingOpportunities
      : [String(value.whyThisTurn).slice(0, 600)];
  const normalizedNextMoves = value.completionRecommendation === "complete"
    ? []
    : nextMoves.length
      ? nextMoves
      : [String(value.materialMove).slice(0, 600)];
  return {
    visualDiagnosis: String(value.visualDiagnosis).slice(0, 1_200),
    materialMove: String(value.materialMove).slice(0, 1_200),
    spatialDirection: String(value.spatialDirection).slice(0, 1_200),
    targetIsland: {
      action: (value.completionRecommendation === "complete" ? "complete" : String(islandAction)) as "create" | "develop" | "enrich" | "repair" | "recompose" | "complete",
      islandId: value.completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete"
        ? CANVAS_V2_WHOLE_BOARD_ISLAND_ID
        : targetIslandId,
      storyRole: (value.completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete"
        ? "whole-board"
        : String(storyRole)) as "title" | "orientation" | "evidence-reading" | "comparison" | "analysis" | "relationship" | "implication" | "synthesis" | "whole-board",
      resultingMaturity: (value.completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete"
        ? "unchanged"
        : resultingMaturity) as "developing" | "resolved" | "unchanged",
      resolutionRationale,
      openRequirements: value.completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete" ? [] : openRequirements,
    },
    targetTerritory: {
      relation: value.completionRecommendation === "complete" ? "none" : String(territoryRelation),
      anchorNodeId: requiredCreativeBriefText(targetTerritory.anchorNodeId, "target territory anchor", 240),
      intendedFootprint: requiredCreativeBriefText(targetTerritory.intendedFootprint, "target territory footprint", 800),
      rationale: requiredCreativeBriefText(targetTerritory.rationale, "target territory rationale", 800),
      placementMode: (value.completionRecommendation === "complete" ? "attached" : String(placementMode)) as "attached" | "evidence-relative-island" | "interleaved" | "recompose",
      targetZoneId: String(targetZoneId),
    },
    evidenceChoreography: String(value.evidenceChoreography).slice(0, 1_200),
    evidenceSelections,
    authoredVisualRoles,
    antiRepetition: String(value.antiRepetition).slice(0, 1_000),
    visualVocabulary: value.visualVocabulary.slice(0, 6).map((item) => String(item).slice(0, 300)),
    paletteDirection: String(value.paletteDirection).slice(0, 800),
    whyThisTurn: String(value.whyThisTurn).slice(0, 1_000),
    preservedStrengths: value.preservedStrengths.slice(0, 4).map((item) => String(item).slice(0, 500)),
    regressionRisk: String(value.regressionRisk).slice(0, 1_000),
    completionRecommendation: value.completionRecommendation,
    completionRationale: String(value.completionRationale).slice(0, 1_200),
    visualThesis: requiredCreativeBriefText(value.visualThesis, "visual thesis", 1_000),
    compositionStrategy: requiredCreativeBriefText(value.compositionStrategy, "composition strategy", 1_000),
    hierarchyAndScale: requiredCreativeBriefText(value.hierarchyAndScale, "hierarchy and scale", 1_000),
    spacingRhythm: requiredCreativeBriefText(value.spacingRhythm, "spacing rhythm", 800),
    relationshipLogic: requiredCreativeBriefText(value.relationshipLogic, "relationship logic", 1_000),
    growthDirection: String(growthDirection) as "stable" | "horizontal" | "vertical" | "both",
    remainingOpportunities: normalizedRemainingOpportunities,
    nextMoves: normalizedNextMoves,
  };
}

/**
 * The visual director owns the visual move; the compiler owns transaction
 * identity and already-observed island placement. Normalize clerical fields
 * before policy validation so a strong brief never burns retries by reciting
 * stale island metadata.
 */
function normalizeCreativeDirectorExecutionContract(
  brief: ReturnType<typeof parseCreativeDirectorBrief>,
  input: {
    islandRegistry: ReturnType<typeof buildCanvasV2IslandRegistry>;
    allocatedIslandId: string;
    repairExecution?: CanvasV2IslandExecutionContract;
  },
): ReturnType<typeof parseCreativeDirectorBrief> {
  if (input.repairExecution) {
    return {
      ...brief,
      targetIsland: { ...brief.targetIsland, ...input.repairExecution.target },
      targetTerritory: { ...brief.targetTerritory, ...input.repairExecution.territory },
    };
  }
  if (brief.completionRecommendation === "complete") {
    return {
      ...brief,
      targetIsland: {
        ...brief.targetIsland,
        action: "complete",
        islandId: CANVAS_V2_WHOLE_BOARD_ISLAND_ID,
        storyRole: "whole-board",
        resultingMaturity: "unchanged",
        openRequirements: [],
      },
      targetTerritory: {
        ...brief.targetTerritory,
        relation: "none",
        placementMode: "attached",
      },
      remainingOpportunities: [],
      nextMoves: [],
    };
  }
  if (brief.targetIsland.action === "recompose" || brief.targetIsland.action === "complete") {
    return {
      ...brief,
      targetIsland: {
        ...brief.targetIsland,
        islandId: CANVAS_V2_WHOLE_BOARD_ISLAND_ID,
        storyRole: "whole-board",
        resultingMaturity: "unchanged",
        openRequirements: [],
      },
      ...(brief.targetIsland.action === "complete" ? {
        targetTerritory: { ...brief.targetTerritory, relation: "none", placementMode: "attached" },
      } : {}),
    };
  }
  if (brief.targetIsland.action === "create") {
    const createsTitle = brief.targetIsland.storyRole === "title";
    return {
      ...brief,
      targetIsland: {
        ...brief.targetIsland,
        islandId: input.allocatedIslandId,
        ...(createsTitle ? {
          resultingMaturity: "resolved",
          openRequirements: [],
        } : {}),
      },
      targetTerritory: {
        ...brief.targetTerritory,
        ...(createsTitle ? {
          relation: "above",
          placementMode: "evidence-relative-island",
          targetZoneId: "top-left",
        } : {
          // A create transaction always materializes a new bounded territory.
          // Preserve an explicit evidence interleave; every other raw mode
          // (including attached or recompose) becomes an evidence-relative
          // island before semantic validation. This is transaction typing,
          // not a change to the director's internal composition.
          placementMode: brief.targetTerritory.placementMode === "interleaved"
            ? "interleaved"
            : "evidence-relative-island",
        }),
      },
      ...(createsTitle && !brief.authoredVisualRoles.includes("narrative-title") ? {
        authoredVisualRoles: ["narrative-title", ...brief.authoredVisualRoles].slice(0, 3),
      } : {}),
    };
  }
  const existing = input.islandRegistry.find((island) => island.islandId === brief.targetIsland.islandId);
  if (!existing) return brief;
  const titleOnlyVisualRoles = brief.authoredVisualRoles.every((role) => /(?:title|orientation|thesis|framing|kicker)/i.test(role));
  if (existing.storyRole === "title" && existing.maturity === "resolved" && !titleOnlyVisualRoles) {
    const analyticalTarget = input.islandRegistry.find((island) => island.storyRole !== "title" && (
      island.maturity !== "resolved" || island.openRequirements.length > 0 || island.missingRequiredEvidenceIds.length > 0
    )) ?? input.islandRegistry.find((island) => island.storyRole !== "title");
    if (analyticalTarget) {
      const resolvedTarget = analyticalTarget.maturity === "resolved"
        && analyticalTarget.openRequirements.length === 0
        && analyticalTarget.missingRequiredEvidenceIds.length === 0;
      return {
        ...brief,
        targetIsland: {
          ...brief.targetIsland,
          action: resolvedTarget ? "enrich" : "develop",
          islandId: analyticalTarget.islandId,
          storyRole: analyticalTarget.storyRole,
          resultingMaturity: resolvedTarget ? "resolved" : "developing",
          openRequirements: resolvedTarget ? [] : analyticalTarget.openRequirements,
        },
        targetTerritory: {
          ...brief.targetTerritory,
          relation: "within",
          anchorNodeId: analyticalTarget.nodeId,
          placementMode: "attached",
          targetZoneId: analyticalTarget.targetZoneId ?? brief.targetTerritory.targetZoneId,
        },
      };
    }
  }
  return {
    ...brief,
    targetIsland: { ...brief.targetIsland, storyRole: existing.storyRole },
    targetTerritory: {
      ...brief.targetTerritory,
      ...(existing.placementMode ? { placementMode: existing.placementMode } : {}),
      ...(existing.targetZoneId ? { targetZoneId: existing.targetZoneId } : {}),
    },
  };
}

type CanvasV2ConvergencePhase = "foundation" | "development" | "integration" | "convergence" | "final-review";

/** Progressive judgment without a creative-turn ceiling. */
function canvasV2ConvergencePhase(observedDesignTurns: number): CanvasV2ConvergencePhase {
  if (observedDesignTurns === 0) return "foundation";
  if (observedDesignTurns < 10) return "development";
  if (observedDesignTurns < 15) return "integration";
  if (observedDesignTurns < 18) return "convergence";
  return "final-review";
}

function requiredSourceAuthorText(value: unknown, label: string, maxLength = 1_200): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`The source author requires ${label}.`);
  return value.trim().slice(0, maxLength);
}

function canvasV2EvidenceTagForIsland(islandId: string, handle: string): string {
  const stableHandle = handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grounded";
  return `<img data-canvas-v2-node-id="${islandId}-evidence-${stableHandle}" data-canvas-v2-copy-evidence-handle="${handle}">`;
}

function canvasV2IslandContainsEvidence(
  document: CanvasV2ArtifactDocument,
  islandId: string | undefined,
  evidenceId: string,
): boolean {
  if (!islandId) return false;
  const range = findCanvasV2SourceNodeRange(document.html, islandId);
  if (!range) return false;
  const source = document.html.slice(range.start, range.end);
  return source.includes(`data-canvas-v2-evidence-id="${evidenceId}"`)
    || source.includes(`data-canvas-v2-evidence-id='${evidenceId}'`)
    || source.includes(`data-canvas-v2-copy-evidence-id="${evidenceId}"`)
    || source.includes(`data-canvas-v2-copy-evidence-id='${evidenceId}'`);
}

/**
 * Evidence selected by the visual director is bound before source authorship.
 * The model sees real, compiler-approved image nodes and only has to compose
 * them. It is never responsible for reproducing a durable provenance ledger.
 */
function bindCanvasV2SelectedEvidenceToExistingIsland(input: {
  revision: CanvasV2ArtifactRevision;
  islandId: string;
  evidenceIds: readonly string[];
  evidenceHandleById: ReadonlyMap<string, string>;
  scaleIntentByEvidenceId: ReadonlyMap<string, CanvasV2EvidenceScaleIntent>;
}): CanvasV2ArtifactRevision {
  const tags = input.evidenceIds.flatMap((evidenceId) => {
    const handle = input.evidenceHandleById.get(evidenceId);
    return handle ? [canvasV2EvidenceTagForIsland(input.islandId, handle)] : [];
  });
  if (!tags.length || !findCanvasV2SourceNodeRange(input.revision.document.html, input.islandId)) return input.revision;
  const inboxId = `${input.islandId}-evidence-inbox`;
  const operations = findCanvasV2SourceNodeRange(input.revision.document.html, inboxId)
    ? [{ op: "append-html" as const, targetNodeId: inboxId, html: tags.join("") }]
    : [{
        op: "append-html" as const,
        targetNodeId: input.islandId,
        html: `<div data-canvas-v2-node-id="${inboxId}" data-canvas-v2-visual-role="grounded-evidence-selection" class="canvas-v2-evidence-inbox">${tags.join("")}</div>`,
      }];
  return {
    ...input.revision,
    document: applyCanvasV2SourcePatch({
      previous: input.revision.document,
      operations,
      evidence: input.revision.evidence,
      scaleIntentByEvidenceId: input.scaleIntentByEvidenceId,
    }),
  };
}

/**
 * Composition memory arrives from the client, but evidence provenance remains
 * server-owned. Drop legacy or malformed partial identities rather than
 * allowing a lossy historical ledger entry to poison every future island turn.
 */
function normalizeCanvasV2CompositionEvidenceLedger(
  state: CanvasV2CompositionState | undefined,
  evidence: readonly { id: string }[],
): CanvasV2CompositionState | undefined {
  if (!state) return undefined;
  const approved = new Set(evidence.map((asset) => asset.id));
  return {
    ...state,
    regions: state.regions.map((region) => ({
      ...region,
      requiredEvidenceIds: Array.from(new Set((region.requiredEvidenceIds ?? []).filter((evidenceId) => approved.has(evidenceId)))),
    })),
  };
}

/** Island transaction metadata is declarative compiler state, not clerical HTML. */
function enforceCanvasV2TargetIslandMetadata(
  document: CanvasV2ArtifactDocument,
  brief: ReturnType<typeof parseCreativeDirectorBrief>,
): CanvasV2ArtifactDocument {
  const range = findCanvasV2SourceNodeRange(document.html, brief.targetIsland.islandId);
  if (!range) return document;
  const opening = document.html.slice(range.start, range.openEnd);
  const attributes = [
    ["data-canvas-v2-story-role", brief.targetIsland.storyRole],
    ["data-canvas-v2-territory-relation", brief.targetTerritory.relation],
    ["data-canvas-v2-placement-mode", brief.targetTerritory.placementMode],
    ["data-canvas-v2-target-zone", brief.targetTerritory.targetZoneId],
  ] as const;
  const islandSource = document.html.slice(range.start, range.end);
  const materializesRequiredVisualRole = brief.authoredVisualRoles.some((role) => (
    new RegExp(`\\bdata-canvas-v2-visual-role\\s*=\\s*["']${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(islandSource)
  ));
  const compilerAttributes: ReadonlyArray<readonly [string, string]> = materializesRequiredVisualRole
    ? attributes
    : [...attributes, ["data-canvas-v2-visual-role", brief.authoredVisualRoles[0]] as const];
  let normalizedOpening = opening;
  for (const [name, value] of compilerAttributes) {
    normalizedOpening = normalizedOpening.replace(new RegExp(`\\s*${name}\\s*=\\s*["'][^"']*["']`, "ig"), "");
    normalizedOpening = normalizedOpening.replace(/>$/, ` ${name}="${value}">`);
  }
  return {
    ...document,
    html: `${document.html.slice(0, range.start)}${normalizedOpening}${document.html.slice(range.openEnd)}`,
  };
}

function compileSourceAuthorDecision(input: {
  payload: unknown;
  brief: ReturnType<typeof parseCreativeDirectorBrief>;
  instruction: string;
  revision: CanvasV2ArtifactRevision;
  transactionBaseDocument?: CanvasV2ArtifactDocument;
  currentCompositionState?: CanvasV2CompositionState;
  scaleIntentByEvidenceId: ReadonlyMap<string, CanvasV2EvidenceScaleIntent>;
  evidenceHandleById: ReadonlyMap<string, string>;
  existingIslandIds: ReadonlySet<string>;
}): CanvasV2EditDecision {
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new Error("The source author response must be an object.");
  const source = input.payload as Record<string, unknown>;
  if (source.decision !== "edit") throw new Error("The bounded source author must return decision=edit; completion belongs to the visual director.");
  const moveKind = source.moveKind;
  if (!["framing", "composition", "relationship", "analysis", "refinement"].includes(String(moveKind))) throw new Error("The bounded source author requires a valid moveKind.");
  const summary = requiredSourceAuthorText(source.summary, "a concise summary");
  const expectedVisualResult = requiredSourceAuthorText(source.expectedVisualResult, "an expected visual result");
  const existingTargetRegion = input.currentCompositionState?.regions.find((region) => (
    region.islandId === input.brief.targetIsland.islandId || region.nodeId === input.brief.targetIsland.islandId
  ));
  const cumulativeRequiredEvidenceIds = Array.from(new Set([
    ...(existingTargetRegion?.requiredEvidenceIds ?? []),
    ...input.brief.evidenceSelections.map((selection) => selection.evidenceId),
  ]));
  const operations = parseCanvasV2SourcePatch(source.patch);
  if (["develop", "enrich", "repair"].includes(input.brief.targetIsland.action)) {
    const targetId = input.brief.targetIsland.islandId;
    for (const operation of operations) {
      if (operation.op === "upsert-css" || operation.op === "insert-before" || operation.op === "insert-after" || operation.op === "append-html") continue;
      if (operation.targetNodeId === targetId) {
        throw new Error(`Existing island ${targetId} is durable. Develop it with append-html or a bounded child insertion; never ${operation.op} its top-level node.`);
      }
      const range = findCanvasV2SourceNodeRange(input.revision.document.html, operation.targetNodeId);
      const replacedSource = range ? input.revision.document.html.slice(range.start, range.end) : "";
      if (/\bdata-canvas-v2-evidence-role\s*=\s*["']analysis-copy["']/i.test(replacedSource)) {
        throw new Error(`Patch target ${operation.targetNodeId} contains grounded island evidence. Preserve that child and develop an evidence-free sibling instead of using ${operation.op}.`);
      }
    }
  }
  const patchedDocument = applyCanvasV2SourcePatch({
    previous: input.revision.document,
    operations,
    evidence: input.revision.evidence,
    scaleIntentByEvidenceId: input.scaleIntentByEvidenceId,
  });
  const missingAfterPatch = cumulativeRequiredEvidenceIds.filter((evidenceId) => (
    !canvasV2IslandContainsEvidence(patchedDocument, input.brief.targetIsland.islandId, evidenceId)
  ));
  const reconciledRevision = bindCanvasV2SelectedEvidenceToExistingIsland({
    revision: { ...input.revision, document: patchedDocument },
    islandId: input.brief.targetIsland.islandId,
    evidenceIds: missingAfterPatch,
    evidenceHandleById: input.evidenceHandleById,
    scaleIntentByEvidenceId: input.scaleIntentByEvidenceId,
  });
  const resultingDocument = normalizeCanvasV2ClaimedCanonicalFlowCounts(reconcileCanvasV2EvidenceRelativeIslandOrder({
    document: enforceCanvasV2TargetIslandMetadata(reconciledRevision.document, input.brief),
    execution: {
      target: input.brief.targetIsland,
      territory: {
        relation: input.brief.targetTerritory.relation as CanvasV2TerritoryRelation,
        anchorNodeId: input.brief.targetTerritory.anchorNodeId,
        intendedFootprint: input.brief.targetTerritory.intendedFootprint,
        rationale: input.brief.targetTerritory.rationale,
        placementMode: input.brief.targetTerritory.placementMode,
        targetZoneId: input.brief.targetTerritory.targetZoneId as CanvasV2SurfaceZoneId,
      },
      requiredEvidenceIds: cumulativeRequiredEvidenceIds,
      requiredEvidenceHandles: cumulativeRequiredEvidenceIds.flatMap((evidenceId) => {
        const handle = input.evidenceHandleById.get(evidenceId);
        return handle ? [handle] : [];
      }),
      requiredVisualRoles: input.brief.authoredVisualRoles,
    },
  }), input.revision.evidence);
  const compositionState = compileCanvasV2CompositionState({
    previous: input.currentCompositionState,
    document: resultingDocument,
    materialMove: input.brief.materialMove,
    preservedStrengths: input.brief.preservedStrengths,
    regressionRisks: [input.brief.regressionRisk],
    targetIsland: input.brief.targetIsland,
    requiredEvidenceIds: cumulativeRequiredEvidenceIds,
    target: {
      relation: input.brief.targetTerritory.relation as CanvasV2CompositionState["nextTerritory"]["relation"],
      anchorNodeId: input.brief.targetTerritory.anchorNodeId,
      intendedFootprint: `${input.brief.targetTerritory.intendedFootprint} Placement: ${input.brief.targetTerritory.placementMode} in ${input.brief.targetTerritory.targetZoneId}.`,
      rationale: input.brief.targetTerritory.rationale,
    },
  });
  const remainingOpportunity = input.brief.remainingOpportunities[0] ?? "none";
  const parsedDecision = parseCanvasV2DesignDecision({
    decision: "edit",
    moveKind,
    summary,
    expectedVisualResult,
    patch: source.patch,
    creativeDirection: {
      designIntent: input.instruction,
      visualThesis: input.brief.visualThesis,
      compositionStrategy: input.brief.compositionStrategy,
      visualLanguage: `${input.brief.visualVocabulary.join(", ")}. ${input.brief.paletteDirection}`,
      evidenceStrategy: input.brief.evidenceChoreography,
      currentFocus: input.brief.materialMove,
      unresolvedOpportunities: input.brief.remainingOpportunities,
      nextMoves: input.brief.nextMoves,
    },
    spatialStrategy: {
      growthDirection: input.brief.growthDirection,
      layoutSystem: `${input.brief.compositionStrategy} Placement mode: ${input.brief.targetTerritory.placementMode}; target zone: ${input.brief.targetTerritory.targetZoneId}.`,
      primaryAnchor: input.brief.targetTerritory.anchorNodeId,
      hierarchyAndScale: input.brief.hierarchyAndScale,
      spacingRhythm: input.brief.spacingRhythm,
      relationshipLogic: input.brief.relationshipLogic,
      currentAdjustment: input.brief.spatialDirection,
      intentionalOverlaps: [],
    },
    compositionState,
    reflection: {
      observedResult: input.brief.visualDiagnosis,
      remainingOpportunity,
      conceptRead: input.brief.visualThesis,
      hierarchyRead: input.brief.hierarchyAndScale,
      evidenceRead: input.brief.evidenceChoreography,
      relationshipRead: input.brief.relationshipLogic,
      legibilityRead: input.brief.preservedStrengths.join(" "),
      distinctivenessRead: input.brief.whyThisTurn,
      nextMoveReason: input.brief.completionRationale,
    },
  }, input.revision.evidence, input.revision.document, input.scaleIntentByEvidenceId);
  if (parsedDecision.decision !== "edit") throw new Error("The source author compiler requires an edit decision.");
  const decision = {
    ...parsedDecision,
    document: resultingDocument,
    // Both values are compiled from the post-patch document. Do not round-trip
    // them through model-response text limits intended for authored prose.
    compositionState,
  };
  const islandFailures = validateCanvasV2IslandExecution({
    previous: input.revision.document,
    next: decision.document,
    target: input.brief.targetIsland,
    placementMode: input.brief.targetTerritory.placementMode,
    territoryRelation: input.brief.targetTerritory.relation as CanvasV2TerritoryRelation,
    existingIslandIds: input.existingIslandIds,
    requiredEvidenceIds: cumulativeRequiredEvidenceIds,
  });
  if (islandFailures.length) throw new Error(islandFailures.join(" "));
  const islandExecution: CanvasV2IslandExecutionContract = {
      target: input.brief.targetIsland,
      territory: {
        relation: input.brief.targetTerritory.relation as CanvasV2TerritoryRelation,
        anchorNodeId: input.brief.targetTerritory.anchorNodeId,
        intendedFootprint: input.brief.targetTerritory.intendedFootprint,
        rationale: input.brief.targetTerritory.rationale,
        placementMode: input.brief.targetTerritory.placementMode,
        targetZoneId: input.brief.targetTerritory.targetZoneId as CanvasV2SurfaceZoneId,
      },
      requiredEvidenceIds: cumulativeRequiredEvidenceIds,
      requiredEvidenceHandles: cumulativeRequiredEvidenceIds.flatMap((evidenceId) => {
        const handle = input.evidenceHandleById.get(evidenceId);
        return handle ? [handle] : [];
      }),
      requiredVisualRoles: input.brief.authoredVisualRoles,
      directorCheckpointJson: JSON.stringify(input.brief),
  };
  return {
    ...decision,
    islandExecution,
    sceneTransaction: compileCanvasV2SceneTransaction({
      origin: "northstar",
      baseRevisionId: input.revision.id,
      previous: input.transactionBaseDocument ?? input.revision.document,
      next: decision.document,
      execution: islandExecution,
    }),
  };
}

function validateCanvasV2CreativeBriefExecution(
  decision: ReturnType<typeof parseCanvasV2DesignDecision>,
  brief: ReturnType<typeof parseCreativeDirectorBrief> | undefined,
): void {
  if (!brief) return;
  if (brief.completionRecommendation === "complete" && decision.decision !== "complete") {
    throw new Error("The observed whole-board visual director recommended completion. Return decision=complete for this exact verified revision; do not emit a no-op CSS patch, continuity edit, or speculative polish turn.");
  }
  if (decision.decision !== "edit") return;
  const moveEvidence = `${decision.summary} ${decision.expectedVisualResult} ${decision.creativeDirection.currentFocus}`;
  if (sharedMoveTerms(brief.materialMove, moveEvidence) < 2) {
    throw new Error(`The source patch did not execute the visual director's material move. Visibly author this brief rather than paraphrasing or substituting another container pass: ${brief.materialMove}`);
  }
  const selectedFailures = validateCanvasV2SelectedAnalysisEvidence(
    decision.document,
    brief.evidenceSelections.map((selection) => selection.evidenceId),
  );
  if (selectedFailures.length) throw new Error(selectedFailures.join(" "));
  const authoredRoles = new Set(Array.from(decision.document.html.matchAll(/\bdata-canvas-v2-visual-role\s*=\s*["']([^"']+)["']/gi), (match) => match[1].trim().toLowerCase()));
  if (!brief.authoredVisualRoles.some((role) => authoredRoles.has(role))) {
    throw new Error(`The patch described the visual-director move without materializing a communication structure. Add at least one visible element carrying data-canvas-v2-visual-role from this focused set: ${brief.authoredVisualRoles.join(", ")}.`);
  }
  const responsibleRegions = Array.from(decision.document.html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi), (match) => match[2])
    .filter((attributes) => /\bdata-canvas-v2-design-region(?:\s*=|\s|$)/i.test(attributes));
  const carriesTerritory = responsibleRegions.some((attributes) => {
    const placement = /\bdata-canvas-v2-placement-mode\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const zone = /\bdata-canvas-v2-target-zone\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    return placement === brief.targetTerritory.placementMode && zone === brief.targetTerritory.targetZoneId;
  });
  if (!carriesTerritory && brief.targetIsland.action !== "recompose" && brief.targetIsland.action !== "complete") {
    throw new Error(`The source patch must mark the responsible top-level design region with data-canvas-v2-placement-mode="${brief.targetTerritory.placementMode}" and data-canvas-v2-target-zone="${brief.targetTerritory.targetZoneId}" so its two-dimensional territory can be observed and repaired.`);
  }
}

function validateCanvasV2DecisionComposition(
  decision: ReturnType<typeof parseCanvasV2DesignDecision>,
  previous: CanvasV2CompositionState | undefined,
  currentDocument: CanvasV2ArtifactRevision["document"],
): void {
  if (decision.decision === "research") return;
  const failures = validateCanvasV2CompositionContinuity({
    previous,
    next: decision.compositionState,
    document: decision.decision === "edit" ? decision.document : currentDocument,
    decision: decision.decision,
  });
  if (failures.length) throw new Error(failures.join(" "));
}

function deterministicResearchDecision(input: {
  appId: string;
  appName: string;
  flowId: string;
  flowName: string;
  screenCount: number;
  hasVisibleResearch: boolean;
}): CanvasV2ResearchDecision {
  return {
    schema: CANVAS_V2_DECISION_SCHEMA,
    decision: "research",
    moveKind: "research",
    creativeDirection: {
      designIntent: "Ground the complete requested journeys before interpreting or designing around them.",
      visualThesis: "The source sequence remains visible so every later insight can be inspected against evidence.",
      compositionStrategy: "Establish complete horizontal evidence rails first, then develop the model-authored comparison around that working surface.",
      visualLanguage: "A quiet white research field with original screenshots, restrained product identity, and no screenshot cards.",
      evidenceStrategy: "Preserve one canonical shared-entry-to-branch journey or linear journey per requested app without truncation.",
      currentFocus: `Materialize ${input.appName} · ${input.flowName} as the next complete canonical rail.`,
      unresolvedOpportunities: [`${input.appName} still needs complete grounded evidence before the visual argument can be developed.`],
      nextMoves: input.hasVisibleResearch ? ["Ground the remaining requested journey", "Begin evidence-led synthesis"] : ["Ground the contrasting requested journey", "Begin evidence-led synthesis"],
    },
    spatialStrategy: {
      growthDirection: "horizontal",
      layoutSystem: "An intrinsic single-row evidence rail with a quiet 170px identity axis and naturally proportioned screenshots.",
      primaryAnchor: "The ordered source sequence is the anchor; later authored analysis remains spatially distinct from it.",
      hierarchyAndScale: "Peer screenshots retain one readable height while product identity and journey transitions remain secondary.",
      spacingRhythm: "Consistent 18px evidence intervals with a deliberate transition marker between shared entry and branch-specific screens.",
      relationshipLogic: "Sequence communicates progression; explicit segment markers communicate the handoff from common entry to the selected branch.",
      currentAdjustment: `Grow the working surface to fit all ${input.screenCount} ${input.appName} screens in one uninterrupted horizontal lane.`,
      intentionalOverlaps: [],
    },
    reflection: {
      observedResult: input.hasVisibleResearch ? "At least one requested canonical journey is already visible." : "The working surface does not yet contain the requested canonical journeys.",
      remainingOpportunity: `${input.appName} still needs complete, ordered evidence before synthesis can begin.`,
      conceptRead: "The visual argument is intentionally deferred until its source journeys are grounded.",
      hierarchyRead: "The current hierarchy is the canonical evidence sequence and its app identity.",
      evidenceRead: `${input.appName}'s complete ordered journey is not yet visible.`,
      relationshipRead: "Cross-flow relationships cannot be authored truthfully until the requested evidence is present.",
      legibilityRead: "Canonical screenshots will be inserted at their native peer scale in one uninterrupted rail.",
      distinctivenessRead: "This is a research acquisition turn, not the authored synthesis.",
      nextMoveReason: "Canonical retrieval is deterministic data work and should not consume a creative model decision.",
    },
    appId: input.appId,
    flowId: input.flowId,
    summary: `Retrieved the complete ${input.appName} · ${input.flowName} journey (${input.screenCount} screens) and placed it on the visible working surface.`,
    expectedVisualResult: `${input.appName}'s icon and all ${input.screenCount} ordered screenshots appear in one uninterrupted canonical evidence rail.`,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to use Canvas V2.", code: "invalid-request", retryable: false }, { status: 401 });
  try {
    const body = await request.json() as {
      instruction?: unknown;
      revision?: CanvasV2ArtifactRevision;
      observation?: CanvasV2RenderObservation;
      run?: {
        turn?: unknown;
        priorSteps?: unknown;
        creativeDirection?: unknown;
        spatialStrategy?: unknown;
        compositionState?: unknown;
        researchTargets?: unknown;
        researchMode?: unknown;
        modelSelection?: unknown;
        renderRepair?: unknown;
      };
    };
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 8_000) throw new Error("A valid design instruction is required.");
    if (!body.revision || !body.observation) throw new Error("The current revision and render observation are required.");
    if (body.observation.revisionId !== body.revision.id) throw new Error("The render observation does not belong to the supplied revision.");
    const turn = Math.max(1, Number(body.run?.turn) || 1);
    const priorSteps = Array.isArray(body.run?.priorSteps)
      ? body.run.priorSteps.slice(-CANVAS_V2_MAX_CONTEXT_STEPS).map((step) => {
          const value = typeof step === "object" && step !== null ? step as Record<string, unknown> : {};
          return {
            revisionId: typeof value.revisionId === "string" ? value.revisionId.slice(0, 160) : "unknown",
            kind: value.kind === "research" ? "research" as const : "design" as const,
            moveKind: typeof value.moveKind === "string" ? value.moveKind.slice(0, 40) : undefined,
            summary: typeof value.summary === "string" ? value.summary.slice(0, 1_200) : "",
            expectedVisualResult: typeof value.expectedVisualResult === "string" ? value.expectedVisualResult.slice(0, 1_200) : "",
            reflection: typeof value.reflection === "object" && value.reflection !== null ? value.reflection : undefined,
            islandExecution: compactCanvasV2IslandExecution(value.islandExecution),
            placementMode: typeof (value.spatialStrategy as Record<string, unknown> | undefined)?.layoutSystem === "string"
              ? /Placement mode:\s*(attached|evidence-relative-island|interleaved|recompose)/i.exec(String((value.spatialStrategy as Record<string, unknown>).layoutSystem))?.[1]
              : undefined,
          };
        })
      : [];
    const renderRepair = compactCanvasV2RenderRepair(body.run?.renderRepair);
    const renderRepairInstruction = canvasV2RenderRepairInstruction(renderRepair);
    if (process.env.NODE_ENV !== "production" && renderRepair) console.info("[canvas-v2] render repair", {
      attempt: renderRepair.attempt,
      target: renderRepair.islandExecution?.target,
      territory: renderRepair.islandExecution?.territory,
      failures: renderRepair.failures,
      rejectedCandidate: renderRepair.rejectedCandidate,
    });

    const modelContext = {
      instruction,
      revisionId: body.revision.id,
      revisionState: body.revision.state,
      ...buildCanvasV2BoundedModelContext(body.revision, body.observation),
      run: {
        turn,
        priorSteps,
        creativeDirection: body.run?.creativeDirection,
        spatialStrategy: body.run?.spatialStrategy,
        compositionState: body.run?.compositionState,
        correction: previousFailure(request),
        renderRepair,
      },
    };
    const tenantId = await resolveAppDataTenantId(supabase, user.id);
    const catalog = await loadAppDataCatalog(supabase, tenantId);
    const researchTargets = Array.isArray(body.run?.researchTargets)
      ? body.run.researchTargets.filter((target): target is string => typeof target === "string").slice(0, 12)
      : [];
    const researchMode: CanvasV2ResearchMode | undefined = body.run?.researchMode === "evidence" || body.run?.researchMode === "synthesis"
      ? body.run.researchMode
      : undefined;
    const research = buildCanvasV2ResearchCatalogIndex(catalog, instruction, body.revision, researchTargets);
    const currentCreativeDirection = body.run?.creativeDirection && typeof body.run.creativeDirection === "object"
      ? body.run.creativeDirection as { nextMoves?: readonly string[]; unresolvedOpportunities?: readonly string[] }
      : undefined;
    const currentCreativeDirectionState = body.run?.creativeDirection && typeof body.run.creativeDirection === "object"
      ? body.run.creativeDirection as CanvasV2CreativeDirection
      : undefined;
    const currentSpatialStrategy = body.run?.spatialStrategy && typeof body.run.spatialStrategy === "object"
      ? body.run.spatialStrategy as CanvasV2SpatialStrategy
      : undefined;
    const currentCompositionState = normalizeCanvasV2CompositionEvidenceLedger(
      body.run?.compositionState && typeof body.run.compositionState === "object"
        ? body.run.compositionState as CanvasV2CompositionState
        : undefined,
      body.revision.evidence,
    );
    const decisionPolicy = canvasV2ResearchDecisionPolicy(research, researchMode, priorSteps, currentCreativeDirection);
    const requiredResearch = nextCanvasV2RequiredResearch(research);
    const groundingRequired = decisionPolicy.phase === "ground-required-evidence";
    if (process.env.NODE_ENV !== "production") console.info("[canvas-v2] research phase", {
      mode: researchMode,
      phase: decisionPolicy.phase,
      requirements: research.requirements.map((requirement) => ({
        requestedName: requirement.requestedName,
        appId: requirement.appId,
        state: requirement.state,
        adequateFlowIds: requirement.adequateFlowIds,
      })),
      requiredResearch,
    });
    if (groundingRequired && requiredResearch) {
      const decision = deterministicResearchDecision({ ...requiredResearch, hasVisibleResearch: research.visibleFlowIds.length > 0 });
      const result = resolveCanvasV2ResearchDecision(catalog, decision, research.visibleFlowIds, research);
      return NextResponse.json({
        decision,
        research: result,
        researchStatus: canvasV2ResearchStatusForDecision(research, decision),
        model: "northstar-deterministic-research-director",
        fallbackUsed: false,
        providerAttempts: [],
      });
    }
    if (groundingRequired) {
      return NextResponse.json({
        error: "North Star cannot begin synthesis because required canonical evidence is unresolved and no complete adequate journey is available. The design model was not called.",
        code: "invalid-request",
        retryable: false,
        researchStatus: canvasV2ResearchStatusForDecision(research),
      }, { status: 409 });
    }
    const modelSelection = parseCanvasV2ModelSelection(body.run?.modelSelection);
    const modelChain = canvasV2DesignModelChain(modelSelection);
    const modelProvider = canvasV2ProviderForModel(modelSelection);
    if (modelProvider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured for GPT-5.6 Luna.", code: "configuration", retryable: false }, { status: 500 });
    }
    if (modelProvider === "google" && !process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured for the selected Gemini model.", code: "configuration", retryable: false }, { status: 500 });
    }
    const image = parseDataUrl(body.observation.screenshotDataUrl);
    const context = { ...modelContext, researchMode, research, decisionPolicy };
    const synthesisTurn = researchMode === "synthesis" && decisionPolicy.phase !== "ground-required-evidence";
    const observedDesignTurns = priorSteps.filter((step) => step.kind === "design").length;
    const islandRegistry = buildCanvasV2IslandRegistry({ observation: body.observation, compositionState: currentCompositionState });
    const unfinishedIslands = islandRegistry.filter((island) => island.maturity !== "resolved" || island.openRequirements.length > 0 || island.missingRequiredEvidenceIds.length > 0);
    const titleIslands = islandRegistry.filter((island) => island.storyRole === "title");
    const instructionRequestsTitleAuthorship = /\b(?:title|headline|heading|subtitle|subhead|description|framing|rename)\b/i.test(instruction);
    const existingIslandIds = new Set(islandRegistry.map((island) => island.islandId));
    const committedIslandExecutions = priorSteps.flatMap((step) => step.kind === "design" && step.islandExecution ? [step.islandExecution] : []);
    const islandCommitCountById = new Map<string, number>();
    for (const execution of committedIslandExecutions) {
      islandCommitCountById.set(execution.target.islandId, (islandCommitCountById.get(execution.target.islandId) ?? 0) + 1);
    }
    const recentCommittedIslandIds = committedIslandExecutions.slice(-6).map((execution) => execution.target.islandId);
    const lastCommittedIslandId = recentCommittedIslandIds.at(-1);
    let consecutiveLastIslandTurns = 0;
    for (let index = recentCommittedIslandIds.length - 1; index >= 0 && recentCommittedIslandIds[index] === lastCommittedIslandId; index -= 1) {
      consecutiveLastIslandTurns += 1;
    }
    const islandDevelopmentLedger = islandRegistry.map((island) => ({
      islandId: island.islandId,
      storyRole: island.storyRole,
      committedTurns: islandCommitCountById.get(island.islandId) ?? 0,
      consecutiveRecentTurns: island.islandId === lastCommittedIslandId ? consecutiveLastIslandTurns : 0,
      maturity: island.maturity,
      openRequirements: island.openRequirements,
      requiredEvidenceIds: island.requiredEvidenceIds,
      missingRequiredEvidenceIds: island.missingRequiredEvidenceIds,
      targetZoneId: island.targetZoneId,
    }));
    const repairExecution = renderRepair?.islandExecution;
    // A render rejection is still the same uncommitted island transaction.
    // Reuse its compiler-owned identity instead of allocating or discovering a
    // different island from the last committed observation.
    const allocatedIslandId = repairExecution?.target.action === "create"
      ? repairExecution.target.islandId
      : canvasV2AllocatedIslandId(body.revision.id, observedDesignTurns + 1);
    const asksForEvidenceLedComparison = /\b(?:compare|comparison|comparative|versus|vs\.?|contrast)\b/i.test(instruction)
      && /\b(?:representative|screenshot|screenshots|screen evidence|visual evidence|flow|flows)\b/i.test(instruction);
    const canonicalScreenCount = context.canonicalEvidence.reduce((sum, flow) => sum + flow.screenCount, 0);
    const complexEvidenceSynthesis = synthesisTurn
      && asksForEvidenceLedComparison
      && context.canonicalEvidence.length >= 2
      && canonicalScreenCount >= 20;
    // The rendered registry is the authority for whether analytical authorship
    // has started. Continuation policy can change after deterministic research,
    // but an empty island registry still means the first synthesis must allocate
    // a real two-dimensional island rather than pretending to recompose a board
    // that has no authored territory yet.
    const firstSynthesisTurn = synthesisTurn && islandRegistry.length === 0;
    const recentDesignSteps = priorSteps.filter((step) => step.kind === "design").slice(-4);
    const recentThreeDesignSteps = recentDesignSteps.slice(-3);
    // Product/app names and other explicitly requested subjects recur in every
    // valid move. They identify what the board is about, not which visual
    // device the model just authored.
    const repetitionSubjectTerms = new Set([
      ...research.apps.flatMap((app) => normalizedMove(app.name).split(" ")),
      ...research.requirements.flatMap((requirement) => normalizedMove(requirement.requestedName).split(" ")),
    ].filter((term) => term.length > 2));
    const repeatedPair = recentThreeDesignSteps.length >= 2
      && sharedDistinctiveMoveTerms(recentThreeDesignSteps.at(-1)!.summary, recentThreeDesignSteps.at(-2)!.summary, repetitionSubjectTerms) >= 2;
    const repeatedSequence = recentThreeDesignSteps.length === 3
      && sharedDistinctiveMoveTerms(recentThreeDesignSteps[2].summary, recentThreeDesignSteps[1].summary, repetitionSubjectTerms) >= 2
      && sharedDistinctiveMoveTerms(recentThreeDesignSteps[2].summary, recentThreeDesignSteps[0].summary, repetitionSubjectTerms) >= 2;
    const repeatedLocalWork = repeatedPair || repeatedSequence;
    const convergencePhase = canvasV2ConvergencePhase(observedDesignTurns);
    const lateStageConvergence = synthesisTurn && (convergencePhase === "convergence" || convergencePhase === "final-review");
    const existingRelationshipCount = body.observation.spatial.authoredRelationships?.length ?? 0;
    // Endpoint geometry is an integration layer. Give the board at least a
    // title plus two observed composition passes before opening new connector
    // work; existing relationships and exact hidden render repairs remain
    // editable immediately so later layout changes cannot strand them.
    const relationshipGeometryAllowed = Boolean(renderRepair)
      || existingRelationshipCount > 0
      || observedDesignTurns >= 3;
    const hasEvidenceRelativeIsland = (body.observation.spatial.designRegions ?? []).some((region) => region.placementMode === "evidence-relative-island");
    const occupiedDesignZoneIds = (body.observation.spatial.authoredSurface?.zones ?? [])
      .filter((zone) => zone.designRegionNodeIds.length > 0)
      .map((zone) => zone.id);
    const canonicalZoneIds = (body.observation.spatial.authoredSurface?.zones ?? [])
      .filter((zone) => zone.canonicalLaneNodeIds.length > 0)
      .map((zone) => zone.id);
    const repeatedAttachedDevelopment = complexEvidenceSynthesis
      && observedDesignTurns >= 2
      && !hasEvidenceRelativeIsland
      && recentDesignSteps.slice(-2).every((step) => step.placementMode === "attached");
    // Every visible synthesis turn starts with a compact whole-board judgment.
    // The source author then executes only that decision, which is both more
    // reliable and faster than asking one response to think, remember, review,
    // and rewrite source simultaneously.
    const creativeDirectionTurn = synthesisTurn;
    const selectedRailDetails = progressiveRailDetails(body.observation.railDetails ?? [], firstSynthesisTurn, observedDesignTurns);
    const selectedDesignDetails = firstSynthesisTurn
      ? []
      : diverseDesignDetails(
          body.observation.designDetails ?? [],
          body.observation,
          currentCompositionState,
          observedDesignTurns,
          convergencePhase === "final-review" ? 5 : convergencePhase === "convergence" || convergencePhase === "integration" ? 4 : 2,
        );
    const analysisEvidenceScaleFailures = validateCanvasV2RenderedAnalysisEvidenceScale(body.observation);
    const designRegionContentFailures = validateCanvasV2RenderedDesignRegionContentIntegrity(body.observation);
    const designRegionTerritoryFailures = validateCanvasV2RenderedDesignRegionTerritoryIntegrity(body.observation);
    const relationshipGeometryFailures = validateCanvasV2RenderedRelationshipGeometry(body.observation);
    const islandNarrativeFailures = validateCanvasV2RenderedIslandNarrativeIntegrity(body.observation);
    const renderedIntegrityFailures = [...analysisEvidenceScaleFailures, ...designRegionContentFailures, ...designRegionTerritoryFailures, ...islandNarrativeFailures, ...relationshipGeometryFailures];
    const renderedIntegrityInstruction = [
      renderRepairInstruction,
      renderedIntegrityFailures.length
        ? `Resolve this exact rendered-integrity problem before adding new visual structure: ${renderedIntegrityFailures.join(" ")} `
        : "",
    ].join("");
    const convergenceInstruction = [
      repeatedLocalWork
        ? `REPETITION REDIRECTION: The last three visible commits repeated substantially the same local work (${recentThreeDesignSteps.map((step) => step.summary).join(" | ")}). Do not rename or repeat that repair under another move kind. `
        : "",
      lateStageConvergence
        ? `This is ${convergencePhase} after ${observedDesignTurns} committed design edits, not another exploration phase. Reconcile the prompt against the complete render. Complete when the board is resolved; otherwise close one exact user-facing gap and prepare the next observed render for completion. A new evidence-relative island is justified only when that named prompt-critical information is genuinely absent and cannot be communicated clearly inside established territory. `
        : "",
      unfinishedIslands.length
        ? `The island lifecycle ledger still contains unfinished authored work: ${unfinishedIslands.map((island) => `${island.islandId} [${island.maturity}; open=${island.openRequirements.join(" | ") || "none"}; missing-evidence=${island.missingRequiredEvidenceIds.join(",") || "none"}]`).join("; ")}. These identities remain open across turns and cannot be globally marked resolved. `
        : "",
      islandDevelopmentLedger.length
        ? `Island turn ledger: ${islandDevelopmentLedger.map((island) => `${island.islandId} [role=${island.storyRole}; turns=${island.committedTurns}; consecutive=${island.consecutiveRecentTurns}; maturity=${island.maturity}; open=${island.openRequirements.join(" | ") || "none"}]`).join("; ")}. A developing island's declared obligations may only shrink as they are satisfied; do not replace them with newly invented polish goals. A resolved island may receive a bounded enrichment, but repeated consecutive polishing is not a coherent story. `
        : "",
      repeatedLocalWork || lateStageConvergence
        ? "Compiler-owned canonical rail furniture is not a creative opportunity. This turn is an immediate deep convergence checkpoint: reconcile the complete rendered board now, complete if the factual integrity checks are clear and every declared region is resolved, or make one materially different move that addresses a genuinely visible unresolved part of the user-facing argument. "
        : "",
      repeatedAttachedDevelopment
        ? "The last two committed synthesis edits remained attached to the same lower-board stack while the factual zone map still exposes wider two-dimensional territory. The next material move must either establish one purposeful evidence-relative island in an available zone or recompose the existing analysis into genuinely distinct territories; another attached section is not valid development. "
        : "",
    ].join("");
    const railDetailParts = selectedRailDetails.flatMap((detail) => [
      { text: `Labeled canonical evidence atlas: ${detail.label} (zero-based indices ${detail.startIndex}–${detail.endIndex}).` },
      { inlineData: parseDataUrl(detail.screenshotDataUrl) },
    ]);
    const designDetailParts = selectedDesignDetails.flatMap((detail) => [
      { text: `Readable authored design-region capture: ${detail.label} [node ${detail.nodeId}; ${detail.width}×${detail.height} canvas units; center ${detail.centerXShare},${detail.centerYShare}; area share ${detail.canvasAreaShare}; reading position ${detail.readingIndex}${detail.visualRole ? `; visual role ${detail.visualRole}` : ""}].` },
      { inlineData: parseDataUrl(detail.screenshotDataUrl) },
    ]);
    const designReferenceParts = synthesisTurn && (firstSynthesisTurn || observedDesignTurns === 10 || observedDesignTurns === 15 || observedDesignTurns === 18)
      ? await loadNorthstarDesignReferenceParts()
      : [];
    const creativeEvidenceIdByHandle = new Map(context.canonicalEvidence.flatMap((flow) => [
      ...flow.identityAssets.flatMap((asset) => asset.copyHandle ? [[asset.copyHandle, asset.evidenceId] as const] : []),
      ...flow.screens.flatMap((screen) => screen.copyHandle ? [[screen.copyHandle, screen.evidenceId] as const] : []),
    ]));
    const creativeEvidenceHandleById = new Map(Array.from(creativeEvidenceIdByHandle, ([handle, evidenceId]) => [evidenceId, handle] as const));
    const creativeEvidenceDirectory = context.canonicalEvidence.map((flow) => ({
      flowId: flow.flowId,
      laneNodeId: flow.laneNodeId,
      screenCount: flow.screenCount,
      identityAssets: flow.identityAssets.map(({ copyHandle, label, app, description }) => ({ evidenceHandle: copyHandle, label, app, description })),
      screens: flow.screens.map(({ index, copyHandle, label, app, flow: screenFlow, screen }) => ({ index, evidenceHandle: copyHandle, label, app, flow: screenFlow, screen })),
    }));
    const canonicalFactLedger = context.canonicalEvidence.map((flow) => ({
      app: flow.identityAssets.map((asset) => asset.app).find(Boolean)
        ?? flow.screens.map((screen) => screen.app).find(Boolean)
        ?? "Unknown app",
      flowId: flow.flowId,
      exactScreenCount: flow.screenCount,
      countRule: `Any complete-journey count for this flow must be exactly ${flow.screenCount}.`,
    }));
    const exactSourceTargetNodeIds = Array.from(
      body.revision.document.html.matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi),
      (match) => match[1],
    ).slice(0, 120);
    const creativeSchema = creativeBriefSchemaForRevision(
      Array.from(creativeEvidenceIdByHandle.keys()),
      exactSourceTargetNodeIds,
      [...existingIslandIds, allocatedIslandId, CANVAS_V2_WHOLE_BOARD_ISLAND_ID],
    );
    const visualCadence = firstSynthesisTurn
      ? {
        phase: "quick-visible-foundation",
        instruction: `${renderedIntegrityInstruction}${convergenceInstruction}Commit the narrative beginning quickly. Create exactly one resolved narrative-title island with a bounded collision-free footprint selected from the observed placement occupants and recommended open territories: a strong prompt-specific h1/h2, a useful descriptive paragraph, and a concise visual thesis. Place it near the beginning of the reading order without covering user objects or canonical evidence, and leave at least ${CANVAS_V2_WORKSPACE.documentMargin}px of deliberate negative space before the grounded-evidence island. Its width and wrapping must fit the real available territory; never simulate room with a camera offset or force a full-canvas strip. Give it storyRole=title and visual role narrative-title. Do not add comparison scaffolding or large evidence copies. Do not introduce SVG relationship geometry while the composition is still a scaffold. Declare at least three distinct deeper story moves for subsequent observed turns.`,
        suppliedContext: "One balanced canonical atlas per visible lane is supplied. Other rail segments, readable authored-region captures, and visual-language calibration are progressively supplied on later observed turns.",
      }
      : convergencePhase === "final-review"
        ? {
          phase: "final-review",
          instruction: `${renderedIntegrityInstruction}${convergenceInstruction}Perform a true final whole-board review. Reconcile the original prompt, evidence, thesis, all authored islands, reading order, hierarchy, relationships, labels, screenshot support, overlaps, legibility, negative space, and palette. Do not recommend completion while one exact visible blocker prevents a high-quality answer; otherwise recommend completion now. A continuation may repair only that blocker and must leave the next observed render ready to complete; it cannot open speculative work.`,
          suppliedContext: "The whole-board overview plus the most spatially diverse readable region captures are supplied for final reconciliation.",
        }
        : convergencePhase === "convergence"
          ? {
            phase: "convergence",
            instruction: `${renderedIntegrityInstruction}${convergenceInstruction}Converge the entire board rather than adding another local section. Find missing prompt-critical information, evidence-free claims, disconnected islands, stale relationships, collisions, weak reading order, or unfinished styling. Prescribe the single correction with the greatest whole-board impact, or recommend completion when none remains.`,
            suppliedContext: "The whole-board overview, diverse region captures, evidence atlas, and factual zone map are supplied for convergence.",
          }
          : convergencePhase === "integration"
            ? {
              phase: "integration",
              instruction: `${renderedIntegrityInstruction}${convergenceInstruction}Integrate the established regions into one coherent spatial argument. Reconcile hierarchy, evidence scale, spacing, reading order, and any relationship geometry. Use a recompose only when the whole board needs it; otherwise make one bounded move in the most valuable existing or evidence-relative territory.`,
              suppliedContext: "The whole-board overview and diverse local captures reveal how the authored territories work together.",
            }
            : {
              phase: "progressive-visible-development",
              instruction: `${renderedIntegrityInstruction}${convergenceInstruction}Deepen the prompt-specific visual thesis with one material visible move. Deliberately choose whether this belongs in an established region or a distinct evidence-relative island in an available zone. Preserve resolved strengths, exact evidence, and existing relationship geometry. Do not repeat the same container treatment under new wording.`,
              suppliedContext: "The whole-board overview is paired with bounded local captures and one rotating evidence atlas so each successful turn can remain prompt and visible quickly.",
            };
    const preservedRepairBrief = repairExecution?.directorCheckpointJson
      ? normalizeCreativeDirectorExecutionContract(
          parseCreativeDirectorBrief(repairExecution.directorCheckpointJson, creativeEvidenceIdByHandle),
          { islandRegistry, allocatedIslandId, repairExecution },
        )
      : undefined;
    let creativeCheckpointBrief: ReturnType<typeof parseCreativeDirectorBrief> | undefined = preservedRepairBrief;
    let creativeBriefAttempts: CanvasV2ProviderError["providerAttempts"] = [];
    let creativeBriefFallbackUsed = false;
    let creativeBriefModel: string = modelSelection;
    // Render repair is still the same uncommitted design transaction. Reuse
    // its validated visual-director checkpoint and ask only the bounded source
    // author to correct rejected geometry. Re-running creative direction here
    // lets candidate state masquerade as committed lifecycle state and causes
    // duplicate-title / unfinished-island contradictions.
    if (creativeDirectionTurn && !creativeCheckpointBrief) {
      const creativeBriefProvider = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
        models: modelChain,
        maxInvalidResponsesPerModel: 4,
        requestSignal: request.signal,
        attemptRole: "visual-director",
        repairContextForAttempt: ({ repairAttempt }) => [
          repairExecution
            ? `RENDER-REPAIR TRANSACTION AUTHORITY: keep action=${repairExecution.target.action}, islandId=${repairExecution.target.islandId}, storyRole=${repairExecution.target.storyRole}, placement=${repairExecution.territory.placementMode}, zone=${repairExecution.territory.targetZoneId}, required evidence handles=${repairExecution.requiredEvidenceHandles.join(", ") || "none"}. This island is absent from the committed registry only because its candidate failed rendered-integrity inspection; recreate or update that same transaction and do not target a different committed island.`
            : "",
          `PHASE AUTHORITY: this board is in ${convergencePhase}. The phase is context, never a minimum or maximum turn count. Completion is valid whenever the supplied whole-board render has no prompt-critical, island-lifecycle, evidence, or rendered-integrity blocker; otherwise close one exact blocker rather than adding speculative work.`,
          repairAttempt === 1
            ? "Repair the exact rejected field while preserving the valid visual diagnosis, evidence selections, and material intention. If the validator rejected the move or completion choice, replace it rather than preserving it."
            : repairAttempt === 2
              ? "Rebuild the complete brief from the authoritative phase, render, and exact handles. Discard the rejected move and any contradictory remaining-opportunity or completion fields."
              : "Final repair: return the smallest internally coherent brief permitted by the current phase. Use one exact valid anchor, one deliberate target zone, a valid completion/continuation contract, and only evidence handles required by that move.",
          `Authoritative islands: existing=${Array.from(existingIslandIds).join(", ") || "none"}; allocated-new=${allocatedIslandId}; whole-board=${CANVAS_V2_WHOLE_BOARD_ISLAND_ID}. Authoritative target zones: top-left, top-center, top-right, middle-left, middle-center, middle-right, bottom-left, bottom-center, bottom-right. Zones already carrying authored design regions: ${occupiedDesignZoneIds.join(", ") || "none"}. Zones currently crossed by canonical evidence: ${canonicalZoneIds.join(", ") || "none"}; choosing one requires real normal-flow reflow so the island is above/below/beside the complete evidence, never over it. Grounded evidence handles: ${Array.from(creativeEvidenceIdByHandle.keys()).slice(0, 80).join(", ")}. Exact existing anchor node IDs: ${exactSourceTargetNodeIds.slice(0, 80).join(", ")}.`,
        ].join("\n\n"),
        validatePayload: (payload, model) => {
          const brief = normalizeCreativeDirectorExecutionContract(
            parseCreativeDirectorBrief(extractCanvasV2StructuredText(payload, model), creativeEvidenceIdByHandle),
            { islandRegistry, allocatedIslandId, repairExecution },
          );
          if (repairExecution) {
            const expected = repairExecution.target;
            const actual = brief.targetIsland;
            if (actual.action !== expected.action || actual.islandId !== expected.islandId || actual.storyRole !== expected.storyRole) {
              throw new Error(`Render repair must preserve the exact failed island transaction: action=${expected.action}, islandId=${expected.islandId}, storyRole=${expected.storyRole}. Do not reinterpret it as a different create/develop/enrich/repair action.`);
            }
            if (brief.targetTerritory.placementMode !== repairExecution.territory.placementMode || brief.targetTerritory.targetZoneId !== repairExecution.territory.targetZoneId) {
              throw new Error(`Render repair must keep island ${expected.islandId} in its promised ${repairExecution.territory.placementMode} / ${repairExecution.territory.targetZoneId} territory and correct the geometry inside that transaction.`);
            }
            const actualHandles = new Set(brief.evidenceSelections.map((selection) => selection.evidenceHandle));
            const missingHandles = repairExecution.requiredEvidenceHandles.filter((handle) => !actualHandles.has(handle));
            if (missingHandles.length) throw new Error(`Render repair for island ${expected.islandId} must retain its assigned grounded evidence handles: ${missingHandles.join(", ")}.`);
          }
          const islandAction = brief.targetIsland.action;
          const targetsExistingIsland = islandAction === "develop" || islandAction === "enrich" || islandAction === "repair";
          const existingTargetIsland = targetsExistingIsland
            ? islandRegistry.find((island) => island.islandId === brief.targetIsland.islandId)
            : undefined;
          if (islandAction === "create") {
            if (brief.targetIsland.islandId !== allocatedIslandId) throw new Error(`Create must target the exact server-allocated island identity: ${allocatedIslandId}.`);
            if (brief.targetTerritory.placementMode !== "evidence-relative-island" && brief.targetTerritory.placementMode !== "interleaved") {
              throw new Error("A newly created island must occupy a purposeful evidence-relative or explicitly interleaved territory; attached is reserved for developing an existing island.");
            }
            if (brief.targetIsland.storyRole !== "title" && brief.targetTerritory.targetZoneId === "top-left") {
              throw new Error("The top-left story beginning is permanently reserved for the board's single title-and-description island. Place this non-title island in another purposeful zone.");
            }
            if (brief.targetIsland.storyRole === "title" && brief.targetTerritory.targetZoneId !== "top-left") {
              throw new Error("The board's title-and-description island must occupy the reserved top-left story beginning.");
            }
          } else if (targetsExistingIsland && !existingIslandIds.has(brief.targetIsland.islandId)) {
            throw new Error(`${islandAction} must target one exact existing island from the registry: ${Array.from(existingIslandIds).join(", ") || "none"}.`);
          } else if ((islandAction === "recompose" || islandAction === "complete") && brief.targetIsland.islandId !== CANVAS_V2_WHOLE_BOARD_ISLAND_ID) {
            throw new Error(`${islandAction} must target ${CANVAS_V2_WHOLE_BOARD_ISLAND_ID}.`);
          }
          if (targetsExistingIsland && existingTargetIsland && brief.targetIsland.storyRole !== existingTargetIsland.storyRole) {
            throw new Error(`${islandAction} must preserve target island ${existingTargetIsland.islandId}'s stable storyRole=${existingTargetIsland.storyRole}.`);
          }
          if (targetsExistingIsland && existingTargetIsland?.targetZoneId
            && brief.targetTerritory.targetZoneId !== existingTargetIsland.targetZoneId) {
            throw new Error(`${islandAction} must preserve island ${existingTargetIsland.islandId}'s existing narrative territory ${existingTargetIsland.targetZoneId}. Develop its composition in place; only an explicit whole-board recompose may relocate chapters.`);
          }
          if (targetsExistingIsland && existingTargetIsland && existingTargetIsland.maturity !== "resolved") {
            const allowedRequirements = new Map(existingTargetIsland.openRequirements.map((requirement) => [normalizedMove(requirement), requirement]));
            const inventedRequirements = brief.targetIsland.openRequirements.filter((requirement) => !allowedRequirements.has(normalizedMove(requirement)));
            if (inventedRequirements.length) {
              throw new Error(`Island ${existingTargetIsland.islandId} already has an authoritative finishing contract. Its remaining openRequirements may only retain or remove these exact obligations as they are satisfied: ${existingTargetIsland.openRequirements.join(" | ") || "none"}. Do not replace them with new polish goals: ${inventedRequirements.join(" | ")}.`);
            }
            const targetTurns = islandCommitCountById.get(existingTargetIsland.islandId) ?? 0;
            const reducedRequirements = brief.targetIsland.openRequirements.length < existingTargetIsland.openRequirements.length;
            const selectedEvidenceIds = new Set(brief.evidenceSelections.map((selection) => selection.evidenceId));
            const closesMissingEvidence = existingTargetIsland.missingRequiredEvidenceIds.some((evidenceId) => selectedEvidenceIds.has(evidenceId));
            if (brief.targetIsland.resultingMaturity === "developing"
              && targetTurns >= 3
              && !reducedRequirements
              && !closesMissingEvidence
              && !renderRepair) {
              throw new Error(`Island ${existingTargetIsland.islandId} has already received ${targetTurns} committed design turns without closing a declared obligation. This is a lifecycle convergence checkpoint, not a turn cap: visibly satisfy at least one exact open requirement now and remove it, or mark the fully composed island resolved with an empty openRequirements list.`);
            }
          }
          // Repetition and diminishing returns are visual-direction context,
          // not structural invalidity. A director may legitimately revisit a
          // resolved island when the newly observed render reveals a real
          // hierarchy or evidence problem. The convergence instruction carries
          // the full ledger; only provenance, lifecycle truth, and render
          // safety can reject the response.
          if (existingTargetIsland?.storyRole === "title") {
            if (brief.targetTerritory.targetZoneId !== "top-left" || brief.targetTerritory.placementMode === "interleaved" || brief.targetTerritory.placementMode === "recompose") {
              throw new Error(`Title island ${existingTargetIsland.islandId} must remain in its reserved top-left story beginning and outside the canonical evidence.`);
            }
            if (brief.evidenceSelections.some((selection) => selection.scaleIntent !== "identity-mark")) {
              throw new Error(`Title island ${existingTargetIsland.islandId} cannot absorb screenshot-led comparison or analysis. Put that evidence in a separate story island.`);
            }
            if (brief.authoredVisualRoles.some((role) => !/(?:title|orientation|thesis|framing|kicker)/i.test(role))) {
              throw new Error(`Title island ${existingTargetIsland.islandId} may only carry title, orientation, thesis, framing, or kicker visual roles; create a separate island for comparison or analysis.`);
            }
            const titleNeedsLifecycleWork = existingTargetIsland.maturity !== "resolved"
              || existingTargetIsland.openRequirements.length > 0
              || existingTargetIsland.missingRequiredEvidenceIds.length > 0;
            if (!titleNeedsLifecycleWork && !renderRepair && !instructionRequestsTitleAuthorship) {
              throw new Error(`Title island ${existingTargetIsland.islandId} is already resolved and permanently reserved as framing. Create or continue a separate story island for this non-title move.`);
            }
          }
          if ((islandAction === "recompose" || islandAction === "complete") && brief.targetIsland.storyRole !== "whole-board") {
            throw new Error(`${islandAction} must use storyRole=whole-board.`);
          }
          if (islandAction === "create" && brief.targetIsland.storyRole === "title" && titleIslands.length) {
            throw new Error(`The board already has its title island (${titleIslands[0].islandId}). Develop it by exact ID instead of creating a second beginning.`);
          }
          if (brief.completionRecommendation === "complete" && islandAction !== "complete") {
            throw new Error(`A completion recommendation must use targetIsland.action=complete and islandId=${CANVAS_V2_WHOLE_BOARD_ISLAND_ID}.`);
          }
          if (brief.completionRecommendation === "continue" && islandAction === "complete") {
            throw new Error("A continuing brief must create, develop, enrich, repair, or recompose an island; it cannot use the complete island action.");
          }
          if (brief.completionRecommendation === "complete" && unfinishedIslands.length) {
            throw new Error(`Whole-board completion is blocked by unfinished island lifecycle state. Target and finish these exact islands before another completion review: ${unfinishedIslands.map((island) => `${island.islandId}${island.openRequirements.length ? ` [${island.openRequirements.join("; ")}]` : ""}${island.missingRequiredEvidenceIds.length ? ` [missing evidence: ${island.missingRequiredEvidenceIds.join(", ")}]` : ""}`).join(", ")}.`);
          }
          if (brief.completionRecommendation === "complete" && titleIslands.length !== 1) {
            throw new Error(`Whole-board completion requires exactly one resolved title-and-description island above the evidence; observed ${titleIslands.length}.`);
          }
          if (brief.completionRecommendation === "complete" && titleIslands.some((island) => island.maturity !== "resolved" || island.openRequirements.length || island.missingRequiredEvidenceIds.length)) {
            throw new Error("Whole-board completion requires the title-and-description island itself to be fully resolved.");
          }
          if (unfinishedIslands.length && brief.completionRecommendation === "continue" && islandAction === "create") {
            throw new Error(`Do not open another island while authored work remains unfinished. Continue one exact island first: ${unfinishedIslands.map((island) => `${island.islandId}${island.openRequirements.length ? ` [${island.openRequirements.join("; ")}]` : ""}${island.missingRequiredEvidenceIds.length ? ` [missing evidence: ${island.missingRequiredEvidenceIds.join(", ")}]` : ""}`).join(", ")}.`);
          }
          if (lateStageConvergence && unfinishedIslands.length && brief.completionRecommendation === "continue") {
            const targetIsUnfinished = unfinishedIslands.some((island) => island.islandId === brief.targetIsland.islandId);
            if (!targetIsUnfinished || !["develop", "enrich", "repair"].includes(brief.targetIsland.action)) {
              throw new Error(`During ${convergencePhase}, finish one exact unresolved island before opening or recomposing more territory. Valid unfinished island IDs: ${unfinishedIslands.map((island) => island.islandId).join(", ")}.`);
            }
          }
          if (firstSynthesisTurn && islandAction !== "create") {
            throw new Error(`The first synthesis turn must create the first server-allocated analytical island: ${allocatedIslandId}.`);
          }
          if (firstSynthesisTurn && (
            brief.targetIsland.storyRole !== "title"
            || brief.targetIsland.resultingMaturity !== "resolved"
            || brief.targetIsland.openRequirements.length
            || brief.targetTerritory.relation !== "above"
            || brief.targetTerritory.placementMode !== "evidence-relative-island"
            || brief.targetTerritory.targetZoneId !== "top-left"
            || !brief.authoredVisualRoles.includes("narrative-title")
          )) {
            throw new Error("The first synthesis turn must completely compose the single narrative-title island above the canonical evidence in top-left territory: storyRole=title, resultingMaturity=resolved, no open requirements, relation=above, placementMode=evidence-relative-island, targetZoneId=top-left, authoredVisualRoles including narrative-title.");
          }
          // Foundation breadth, repetition redirection, and final-review focus
          // are advisory design intelligence. They deliberately remain in the
          // phase prompt instead of triggering a second provider call after a
          // structurally valid first response.
          if (renderRepair && brief.completionRecommendation === "complete") {
            throw new Error(`The uncommitted candidate failed rendered-integrity validation on repair pass ${renderRepair.attempt} of ${renderRepair.maxAttempts}. Prescribe the exact bounded repair before completion.`);
          }
          if (complexEvidenceSynthesis && brief.completionRecommendation === "complete" && !hasEvidenceRelativeIsland) {
            throw new Error("The complex comparison is still one attached analytical stack. Before completion, establish or recompose at least one purposeful evidence-relative island so the wider working surface carries a distinct inspectable argument rather than unused geometry.");
          }
          // Likewise, an attached continuation may be the correct response to
          // the latest render. The director sees the anti-stacking guidance and
          // zone map, while rendered non-overlap and evidence integrity remain
          // the objective commit boundary.
        },
        requestForModel: (model, correction) => {
          const providerRequest = buildCanvasV2StructuredProviderRequest({
            model,
            system: CREATIVE_DIRECTOR_SYSTEM,
            schemaName: "canvas_v2_visual_director_brief",
            schema: creativeSchema,
            // As with source authorship, Responses counts hidden reasoning in
            // this budget. The brief remains schema-bounded and concise; the
            // headroom prevents an otherwise valid director read ending in the
            // middle of its JSON object.
            maxOutputTokens: 8_000,
            // Preserve balanced visual judgment here. The director owns the
            // concept, evidence choreography, and whole-board decision.
            reasoningEffort: "medium",
            temperature: 0.72,
            correction,
            parts: [
                { text: JSON.stringify({
                  instruction,
                  creativeDirection: body.run?.creativeDirection,
                  spatialStrategy: body.run?.spatialStrategy,
                  compositionState: currentCompositionState,
                  priorSteps: priorSteps.slice(-6),
                  recentDesignMoves: priorSteps.filter((step) => step.kind === "design").slice(-6).map((step) => ({ moveKind: step.moveKind, summary: step.summary, expectedVisualResult: step.expectedVisualResult })),
                  canonicalEvidence: creativeEvidenceDirectory,
                  islandRegistry,
                  islandDevelopmentLedger,
                  canonicalEvidenceZoneIds: canonicalZoneIds,
                  allocatedNewIslandId: allocatedIslandId,
                  wholeBoardIslandId: CANVAS_V2_WHOLE_BOARD_ISLAND_ID,
                  authoritativeCanonicalFacts: canonicalFactLedger,
                  render: context.render,
                  visualCadence,
                  convergencePhase,
                  lateStageConvergence,
                  relationshipGeometryAllowed,
                  renderRepair,
                  repairExecutionContract: repairExecution,
                  phaseAuthority: `The current ${convergencePhase} phase changes review emphasis, not completion eligibility. Completion remains model-decided after factual, lifecycle, evidence, geometry, and whole-board reconciliation.`,
                }) },
                { text: "Current rendered canvas overview:" },
                { inlineData: image },
                ...railDetailParts,
                ...designDetailParts,
                ...designReferenceParts,
            ],
          });
          return { url: providerRequest.url, init: providerRequest.init };
        },
      });
      creativeCheckpointBrief = normalizeCreativeDirectorExecutionContract(
        parseCreativeDirectorBrief(
          extractCanvasV2StructuredText(creativeBriefProvider.payload, creativeBriefProvider.model),
          creativeEvidenceIdByHandle,
        ),
        { islandRegistry, allocatedIslandId, repairExecution },
      );
      creativeBriefAttempts = creativeBriefProvider.attempts;
      creativeBriefFallbackUsed = creativeBriefProvider.fallbackUsed;
      creativeBriefModel = creativeBriefProvider.model;
      if (process.env.NODE_ENV !== "production") console.info("[canvas-v2] visual director brief", {
        model: creativeBriefProvider.model,
        recommendation: creativeCheckpointBrief.completionRecommendation,
        targetIsland: creativeCheckpointBrief.targetIsland,
        territory: {
          placementMode: creativeCheckpointBrief.targetTerritory.placementMode,
          targetZoneId: creativeCheckpointBrief.targetTerritory.targetZoneId,
        },
        materialMove: creativeCheckpointBrief.materialMove,
        evidenceIds: creativeCheckpointBrief.evidenceSelections.map((selection) => selection.evidenceId),
        visualRoles: creativeCheckpointBrief.authoredVisualRoles,
        attempts: creativeBriefProvider.attempts,
      });
    }
    if (
      creativeCheckpointBrief?.completionRecommendation === "complete"
      && currentCreativeDirectionState
      && currentSpatialStrategy
      && currentCompositionState
    ) {
      const proposedCompletion = directorCompletionDecision({
        brief: creativeCheckpointBrief,
        creativeDirection: currentCreativeDirectionState,
        spatialStrategy: currentSpatialStrategy,
        compositionState: currentCompositionState,
        revision: body.revision,
      });
      const islandCompletionFailures = unfinishedIslands.map((island) => [
        `Island ${island.islandId} is not complete: maturity=${island.maturity}.`,
        island.openRequirements.length ? `Open requirements: ${island.openRequirements.join("; ")}.` : "",
        island.missingRequiredEvidenceIds.length ? `Assigned evidence missing from the island: ${island.missingRequiredEvidenceIds.join(", ")}.` : "",
      ].filter(Boolean).join(" "));
      const completionFailures = [
        ...islandCompletionFailures,
        ...analysisEvidenceScaleFailures,
        ...designRegionContentFailures,
        ...designRegionTerritoryFailures,
        ...islandNarrativeFailures,
        ...relationshipGeometryFailures,
        ...validateCanvasV2RenderedComparisonCommunication(body.observation, instruction),
        ...validateCanvasV2ClaimedCanonicalFlowCounts(body.revision.document, body.revision.evidence),
        ...validateCanvasV2GroundedAppIdentityUsage(body.revision.document, body.revision.evidence),
        ...validateCanvasV2RequestedAnalysisEvidenceUsage(body.revision.document, body.revision.evidence, instruction),
        ...validateCanvasV2QuantitativeClaimLabels(body.revision.document, body.revision.evidence, instruction),
      ];
      if (!completionFailures.length) {
        validateCanvasV2CreativeArc(proposedCompletion, decisionPolicy, true);
        validateCanvasV2CreativeBriefExecution(proposedCompletion, creativeCheckpointBrief);
        validateCanvasV2DecisionComposition(proposedCompletion, currentCompositionState, body.revision.document);
        const completion = resolveCanvasV2ResearchCompletion(research, proposedCompletion.summary, body.revision.document.html);
        if (completion.unresolved.length) throw new Error(`The visible canvas is not ready to complete. Ground the available required app${completion.unresolved.length === 1 ? "" : "s"}: ${completion.unresolved.join(", ")}.`);
        if (completion.unacknowledgedUnavailable.length) throw new Error(`The visible canvas is not ready to complete. Make the unavailable research explicit on the canvas: ${completion.unacknowledgedUnavailable.join(", ")}.`);
        return NextResponse.json({
          decision: { ...proposedCompletion, summary: completion.summary },
          evidence: body.revision.evidence,
          researchStatus: canvasV2ResearchStatusForDecision(research),
          model: creativeBriefModel,
          fallbackUsed: creativeBriefFallbackUsed,
          providerAttempts: creativeBriefAttempts,
        });
      }
      const missingIdentitySelections = context.canonicalEvidence.flatMap((flow) => flow.identityAssets)
        .filter((asset): asset is typeof asset & { copyHandle: string } => Boolean(asset.copyHandle) && !body.revision!.document.html.includes(`data-canvas-v2-copy-evidence-id="${asset.evidenceId}"`))
        .slice(0, 8)
        .map((asset) => ({
          evidenceHandle: asset.copyHandle,
          evidenceId: asset.evidenceId,
          roleInArgument: `${asset.app} grounded app identity`,
          intendedTreatment: "Place the exact grounded icon beside the existing app label inside the established analytical composition.",
          scaleIntent: "identity-mark" as const,
        }));
      const completionRepairEvidenceSelections = Array.from(new Map([
        ...missingIdentitySelections,
        ...context.canonicalEvidence.slice(0, 2).flatMap((flow) => {
          const representativeScreens = flow.screens.length <= 2
            ? flow.screens
            : [flow.screens[0], flow.screens[flow.screens.length - 1]];
          return representativeScreens
            .filter((screen): screen is typeof screen & { copyHandle: string } => Boolean(screen.copyHandle))
            .map((screen) => ({
              evidenceHandle: screen.copyHandle,
              evidenceId: screen.evidenceId,
              roleInArgument: `${screen.app ?? "Grounded"} representative onboarding evidence`,
              intendedTreatment: "Place this exact canonical screen at inspectable peer scale inside the analytical comparison and make its observed interface carry part of the argument.",
              scaleIntent: "peer" as const,
            }));
        }),
      ].map((selection) => [selection.evidenceId, selection] as const)).values()).slice(0, 8);
      const titleOnlyFailure = completionFailures.every((failure) => /\btitle\b/i.test(failure));
      const completionRepairIsland = unfinishedIslands.find((island) => island.storyRole !== "title")
        ?? unfinishedIslands[0]
        ?? islandRegistry.find((island) => island.storyRole !== "title" && island.nodeId === currentCompositionState.dominantAnchor)
        ?? islandRegistry.find((island) => island.storyRole !== "title" && ["comparison", "synthesis", "analysis", "evidence-reading", "implication"].includes(island.storyRole))
        ?? (titleOnlyFailure ? islandRegistry.find((island) => island.storyRole === "title") : undefined);
      // A premature whole-board completion after the title is a lifecycle
      // decision, not an endpoint failure. There is no existing analytical
      // island to repair yet, so compile the deterministic rejection into the
      // already allocated create transaction and let the source author execute
      // it in this same request. This keeps policy feedback inside the model
      // loop instead of surfacing a terminal error to the user.
      const createMissingAnalyticalIsland = !completionRepairIsland;
      const completionRepairIslandId = completionRepairIsland?.islandId ?? allocatedIslandId;
      const completionRepairStoryRole = completionRepairIsland?.storyRole ?? (asksForEvidenceLedComparison ? "comparison" : "analysis");
      const completionRepairAnchorNodeId = completionRepairIsland?.nodeId
        ?? context.canonicalEvidence[0]?.laneNodeId
        ?? titleIslands[0]?.nodeId
        ?? body.observation.spatial.nodes[0]?.nodeId;
      if (!completionRepairAnchorNodeId) throw new Error("Canvas V2 cannot allocate an analytical island without an observed canvas anchor.");
      creativeCheckpointBrief = {
        ...creativeCheckpointBrief,
        materialMove: `Repair the exact completion blockers inside the established composition: ${completionFailures.join(" ")}`,
        spatialDirection: createMissingAnalyticalIsland
          ? "Create one bounded analytical island in normal flow between the resolved narrative opening and the canonical evidence atlas; preserve both existing regions exactly."
          : "Make one bounded within-region repair; preserve the resolved composition, evidence scale, and canonical rails.",
        targetIsland: {
          action: createMissingAnalyticalIsland ? "create" : "repair",
          islandId: completionRepairIslandId,
          storyRole: completionRepairStoryRole,
          resultingMaturity: "developing",
          resolutionRationale: `This island remains open until the deterministic completion blockers are visibly repaired and observed: ${completionFailures.join(" ")}`,
          openRequirements: completionFailures.slice(0, 6).map((failure) => failure.slice(0, 600)),
        },
        targetTerritory: {
          relation: createMissingAnalyticalIsland ? "above" : "within",
          anchorNodeId: completionRepairAnchorNodeId,
          intendedFootprint: createMissingAnalyticalIsland
            ? "A distinct, inspectable comparison chapter that spans the analytical story width without overlapping the title or canonical evidence."
            : "Only the existing analytical region that contains the incomplete identity or evidence claim.",
          rationale: createMissingAnalyticalIsland
            ? "The title is resolved but the prompt-critical analytical story does not exist yet; create its first bounded evidence-led territory before completion can be reconsidered."
            : "Completion is blocked by deterministic factual or rendered-integrity checks, so the visible board must repair those exact omissions before another completion review.",
          placementMode: createMissingAnalyticalIsland ? "evidence-relative-island" : "attached",
          targetZoneId: createMissingAnalyticalIsland ? "top-center" : completionRepairIsland?.targetZoneId ?? "middle-center",
        },
        evidenceChoreography: "Use the exact grounded evidence required by the completion failure and leave every already-valid witness in place.",
        evidenceSelections: completionRepairEvidenceSelections.length ? completionRepairEvidenceSelections : creativeCheckpointBrief.evidenceSelections,
        authoredVisualRoles: createMissingAnalyticalIsland
          ? ["evidence-led-comparison", "representative-screen-contrast"]
          : ["completion-integrity-repair"],
        antiRepetition: "This is a validator-required completion repair, not another exploratory composition or continuity pass.",
        whyThisTurn: "The visual director considered the board complete, but deterministic completion checks found a concrete visible omission.",
        regressionRisk: "Do not recompose, resize screenshots, remove labels, or disturb either canonical rail while repairing the exact blocker.",
        completionRecommendation: "continue",
        completionRationale: `Completion remains blocked until this exact repair is observed: ${completionFailures.join(" ")}`,
        remainingOpportunities: [completionFailures.join(" ")],
        nextMoves: [`Repair the exact deterministic completion blocker without changing resolved territory: ${completionFailures.join(" ")}`],
      };
    }
    const scaleIntentByEvidenceId = new Map<string, CanvasV2EvidenceScaleIntent>(
      creativeCheckpointBrief?.evidenceSelections.map((selection) => [selection.evidenceId, selection.scaleIntent as CanvasV2EvidenceScaleIntent] as const) ?? [],
    );
    if (synthesisTurn && !creativeCheckpointBrief) throw new Error("Canvas V2 synthesis requires a visual-director brief before source authorship.");
    const focusedIsland = creativeCheckpointBrief
      ? islandRegistry.find((island) => island.islandId === creativeCheckpointBrief!.targetIsland.islandId)
      : undefined;
    const focusedIslandDetail = focusedIsland
      ? (body.observation.designDetails ?? []).find((detail) => detail.nodeId === focusedIsland.nodeId)
      : undefined;
    const focusedIslandDetailParts = focusedIslandDetail ? [
      { text: `Focused target-island capture: ${focusedIslandDetail.label} [island ${focusedIsland!.islandId}; node ${focusedIslandDetail.nodeId}; ${focusedIslandDetail.width}×${focusedIslandDetail.height} canvas units; center ${focusedIslandDetail.centerXShare},${focusedIslandDetail.centerYShare}; area share ${focusedIslandDetail.canvasAreaShare}; reading position ${focusedIslandDetail.readingIndex}${focusedIslandDetail.visualRole ? `; visual role ${focusedIslandDetail.visualRole}` : ""}]. This is the exact island selected by the programmatic execution contract.` },
      { inlineData: parseDataUrl(focusedIslandDetail.screenshotDataUrl) },
    ] : [];
    const supplementalDesignDetailParts = selectedDesignDetails
      .filter((detail) => detail.nodeId !== focusedIslandDetail?.nodeId)
      .slice(0, 3)
      .flatMap((detail) => [
        { text: `Surrounding authored-island capture: ${detail.label} [node ${detail.nodeId}; ${detail.width}×${detail.height} canvas units; center ${detail.centerXShare},${detail.centerYShare}; area share ${detail.canvasAreaShare}; reading position ${detail.readingIndex}${detail.visualRole ? `; visual role ${detail.visualRole}` : ""}].` },
        { inlineData: parseDataUrl(detail.screenshotDataUrl) },
      ]);
    const focusedCompositionRegion = creativeCheckpointBrief
      ? currentCompositionState?.regions.find((region) => (
        region.islandId === creativeCheckpointBrief!.targetIsland.islandId
        || region.nodeId === creativeCheckpointBrief!.targetIsland.islandId
      ))
      : undefined;
    const durableRequiredEvidenceIds = creativeCheckpointBrief
      ? Array.from(new Set([
        ...(focusedCompositionRegion?.requiredEvidenceIds ?? []),
        ...creativeCheckpointBrief.evidenceSelections.map((selection) => selection.evidenceId),
      ]))
      : [];
    const newlyRequiredEvidenceIds = durableRequiredEvidenceIds.filter((evidenceId) => (
      !canvasV2IslandContainsEvidence(body.revision!.document, focusedIsland?.nodeId, evidenceId)
    ));
    const sourceAuthorRevision = creativeCheckpointBrief && focusedIsland
      ? bindCanvasV2SelectedEvidenceToExistingIsland({
          revision: body.revision,
          islandId: creativeCheckpointBrief.targetIsland.islandId,
          evidenceIds: newlyRequiredEvidenceIds,
          evidenceHandleById: creativeEvidenceHandleById,
          scaleIntentByEvidenceId,
        })
      : body.revision;
    const sourceAuthorExistingIslandIds = canvasV2CommittedIslandIdsForSourceValidation(
      existingIslandIds,
      renderRepair ? repairExecution : undefined,
    );
    const sourceAuthorModelContext = buildCanvasV2BoundedModelContext(sourceAuthorRevision, body.observation);
    const focusedIslandSource = compactCanvasV2IslandSourceForModel(sourceAuthorRevision, focusedIsland?.nodeId);
    const sourceAuthorEditableNodeIds = Array.from(
      (focusedIslandSource ?? sourceAuthorModelContext.source.htmlOutline).matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi),
      (match) => match[1],
    ).filter((nodeId, index, all) => all.indexOf(nodeId) === index).slice(0, 180);
    const compilerBoundEvidenceHandles = newlyRequiredEvidenceIds.flatMap((evidenceId) => {
      const handle = creativeEvidenceHandleById.get(evidenceId);
      return focusedIsland && handle ? [handle] : [];
    });
    const requiredEvidenceTags = focusedIsland ? [] : newlyRequiredEvidenceIds.flatMap((evidenceId) => {
      const handle = creativeEvidenceHandleById.get(evidenceId);
      return handle ? [canvasV2EvidenceTagForIsland(creativeCheckpointBrief!.targetIsland.islandId, handle)] : [];
    });
    const requestContext = {
      instruction,
      revisionId: body.revision.id,
      source: sourceAuthorModelContext.source,
      render: context.render,
      authoritativeCanonicalFacts: canonicalFactLedger,
      authoritativeFactInstruction: "These app-to-flow screen counts are exact and app-specific. Never copy one app's count into another app's label, prose, annotation, summary, or completion response.",
      visualCadence,
      convergencePhase,
      renderRepair,
      relationshipGeometryAllowed,
      islandRegistry,
      focusedIslandSource,
      ...(creativeCheckpointBrief ? {
        executionContract: {
          targetIsland: creativeCheckpointBrief.targetIsland,
          ...(renderRepair ? { repairMode: "repair-existing-uncommitted-candidate" } : {}),
          durableEvidenceHandles: durableRequiredEvidenceIds.flatMap((evidenceId) => {
            const handle = creativeEvidenceHandleById.get(evidenceId);
            return handle ? [handle] : [];
          }),
          compilerBoundEvidenceHandles,
          requiredEvidenceTags,
          requiredVisualRoles: creativeCheckpointBrief.authoredVisualRoles,
          editableNodeIds: sourceAuthorEditableNodeIds,
          relation: creativeCheckpointBrief.targetTerritory.relation,
          placementMode: creativeCheckpointBrief.targetTerritory.placementMode,
          targetZoneId: creativeCheckpointBrief.targetTerritory.targetZoneId,
          anchorNodeId: creativeCheckpointBrief.targetTerritory.anchorNodeId,
          maxPatchOperations: 5,
        },
        visualDirectorBrief: {
          ...creativeCheckpointBrief,
          evidenceSelections: creativeCheckpointBrief.evidenceSelections.map(({ evidenceHandle, roleInArgument, intendedTreatment, scaleIntent }) => ({ evidenceHandle, roleInArgument, intendedTreatment, scaleIntent })),
        },
      } : {}),
    };
    const provider = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
      models: modelChain,
      maxInvalidResponsesPerModel: 4,
      requestSignal: request.signal,
      attemptRole: "source-author",
      repairContextForAttempt: ({ repairAttempt }) => renderRepair
        ? `This is hidden render repair pass ${renderRepair.attempt}, not a new design turn. Keep the preserved visual-director checkpoint unchanged and correct the exact rejected candidate island ${creativeCheckpointBrief?.targetIsland.islandId} in place. The create transaction already exists in focusedIslandSource; never append a duplicate. Exact rendered failures: ${renderRepair.failures.join(" ")}`
        : repairAttempt === 1
          ? `Keep the visual-director move unchanged. Correct the rejected patch for island action ${creativeCheckpointBrief?.targetIsland.action} on exact island ${creativeCheckpointBrief?.targetIsland.islandId}. Compiler-bound evidence handles: ${compilerBoundEvidenceHandles.join(", ") || "none"}. Create-only required evidence tags: ${requiredEvidenceTags.join(" ") || "none"}. For an existing island, compose the bound nodes, append or replace one evidence-free child, and never replace its root.`
          : `Reconstruct the minimal five-field source response. Island action: ${creativeCheckpointBrief?.targetIsland.action}; exact island ID: ${creativeCheckpointBrief?.targetIsland.islandId}. Existing committed island IDs: ${Array.from(sourceAuthorExistingIslandIds).join(", ") || "none"}. The compiler owns relation, placement, zone, and stable identity. For an existing island, it also owns all selected evidence; never reproduce evidence tags or replace the island root. For create only, include these exact tags: ${requiredEvidenceTags.join(" ") || "none"}. Required visual roles: ${creativeCheckpointBrief?.authoredVisualRoles.join(", ") || "none"}.`,
      validatePayload: (candidatePayload, model) => {
        const text = extractCanvasV2StructuredText(candidatePayload, model);
        if (!text) throw new Error("Canvas V2 model returned no decision.");
        if (!creativeCheckpointBrief) throw new Error("The source author cannot run without an observed visual-director brief.");
        const decision = compileSourceAuthorDecision({
          payload: JSON.parse(text),
          brief: creativeCheckpointBrief,
          instruction,
          revision: sourceAuthorRevision,
          transactionBaseDocument: body.revision!.document,
          currentCompositionState,
          scaleIntentByEvidenceId,
          evidenceHandleById: creativeEvidenceHandleById,
          existingIslandIds: sourceAuthorExistingIslandIds,
        });
        validateCanvasV2CreativeArc(decision, decisionPolicy, creativeDirectionTurn);
        validateCanvasV2CreativeBriefExecution(decision, creativeCheckpointBrief);
        validateCanvasV2DecisionComposition(decision, currentCompositionState, body.revision!.document);
        if (!relationshipGeometryAllowed) {
          const previousRelationshipCount = (body.revision!.document.html.match(/\bdata-canvas-v2-relationship-(?:source|target)\s*=/gi) ?? []).length;
          const nextRelationshipCount = (decision.document.html.match(/\bdata-canvas-v2-relationship-(?:source|target)\s*=/gi) ?? []).length;
          if (nextRelationshipCount > previousRelationshipCount) {
            throw new Error("This is still composition development. Do not introduce new endpoint-dependent relationship geometry until the current evidence island, hierarchy, scale, and styling have survived two post-title observed composition passes.");
          }
        }
        const factualFailures = [
          ...validateCanvasV2EvidenceContinuity(body.revision!.document, decision.document, body.revision!.evidence),
          ...validateCanvasV2AnalysisEvidenceContinuity(body.revision!.document, decision.document, body.revision!.evidence, instruction),
          ...validateCanvasV2ClaimedCanonicalFlowCounts(decision.document, body.revision!.evidence),
          ...validateCanvasV2QuantitativeClaimLabels(decision.document, body.revision!.evidence, instruction),
        ];
        if (factualFailures.length) throw new Error(factualFailures.join(" "));
      },
      requestForModel: (model, correction) => {
        const providerRequest = buildCanvasV2StructuredProviderRequest({
          model,
          system: SOURCE_AUTHOR_SYSTEM,
          schemaName: "canvas_v2_source_patch_decision",
          schema: SOURCE_AUTHOR_SCHEMA,
          maxOutputTokens: 12_000,
          reasoningEffort: "low",
          temperature: 0.44,
          correction,
          parts: [
            { text: JSON.stringify(requestContext) },
            { text: "Current rendered canvas overview:" },
            { inlineData: image },
            ...railDetailParts.slice(0, 2),
            ...focusedIslandDetailParts,
            ...supplementalDesignDetailParts,
          ],
        });
        return { url: providerRequest.url, init: providerRequest.init };
      },
    });
    const providerAttempts = [...(creativeBriefAttempts ?? []), ...provider.attempts];
    const fallbackUsed = creativeBriefFallbackUsed || provider.fallbackUsed;
    const payload = provider.payload;
    try {
      const text = extractCanvasV2StructuredText(payload, provider.model);
      if (!text) throw new Error("Canvas V2 model returned no decision.");
      if (!creativeCheckpointBrief) throw new Error("The source author cannot run without an observed visual-director brief.");
      const decision = compileSourceAuthorDecision({
        payload: JSON.parse(text),
        brief: creativeCheckpointBrief,
        instruction,
        revision: sourceAuthorRevision,
        transactionBaseDocument: body.revision.document,
        currentCompositionState,
        scaleIntentByEvidenceId,
        evidenceHandleById: creativeEvidenceHandleById,
        existingIslandIds: sourceAuthorExistingIslandIds,
      });
      validateCanvasV2CreativeArc(decision, decisionPolicy, creativeDirectionTurn);
      validateCanvasV2CreativeBriefExecution(decision, creativeCheckpointBrief);
      validateCanvasV2DecisionComposition(decision, currentCompositionState, body.revision.document);
      if (!relationshipGeometryAllowed) {
        const previousRelationshipCount = (body.revision.document.html.match(/\bdata-canvas-v2-relationship-(?:source|target)\s*=/gi) ?? []).length;
        const nextRelationshipCount = (decision.document.html.match(/\bdata-canvas-v2-relationship-(?:source|target)\s*=/gi) ?? []).length;
        if (nextRelationshipCount > previousRelationshipCount) {
          throw new Error("This is still composition development. Do not introduce new endpoint-dependent relationship geometry until the current evidence island, hierarchy, scale, and styling have survived two post-title observed composition passes.");
        }
      }
      const factualFailures = [
        ...validateCanvasV2EvidenceContinuity(body.revision.document, decision.document, body.revision.evidence),
        ...validateCanvasV2ClaimedCanonicalFlowCounts(decision.document, body.revision.evidence),
        ...validateCanvasV2QuantitativeClaimLabels(decision.document, body.revision.evidence, instruction),
      ];
      if (factualFailures.length) throw new Error(factualFailures.join(" "));
      return NextResponse.json({ decision, evidence: body.revision.evidence, researchStatus: canvasV2ResearchStatusForDecision(research), model: provider.model, fallbackUsed, providerAttempts });
    } catch (error) {
      throw invalidCanvasV2ProviderResponse(error instanceof Error ? error.message : "Canvas V2 returned an invalid design decision.", provider.attempts);
    }
  } catch (error) {
    if (error instanceof CanvasV2ProviderError) {
      const failure = canvasV2ProviderErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Canvas V2 request failed.", code: "invalid-request", retryable: false }, { status: 400 });
  }
}
