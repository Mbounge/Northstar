import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@/lib/supabase/server";
import { parseCanvasV2DesignDecision } from "@/lib/canvas-v2/model-response";
import {
  applyCanvasV2SourcePatch,
  findCanvasV2SourceNodeRange,
  normalizeCanvasV2SourcePatchHeadingHierarchy,
  parseCanvasV2SourcePatch,
  type CanvasV2EvidenceScaleIntent,
} from "@/lib/canvas-v2/source-patch";
import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2ArtifactDocument,
  type CanvasV2ArtifactRevision,
  type CanvasV2CompositionState,
  type CanvasV2CreativeDirection,
  type CanvasV2DesignRegionObservation,
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
  canvasV2CompletionContradictsMaterialMove,
  canvasV2EvidenceLedComparisonRequested,
  canvasV2EffectiveCompletionRecommendation,
  canvasV2RequiresProgressiveEvidenceSynthesis,
  canvasV2RequiredIndependentTerritoryCount,
  shouldCompleteCanvasV2ResolvedOptionalContinuation,
  validateCanvasV2AtomicTerritoryPlan,
  validateCanvasV2DeferredSemanticJobIsolation,
  validateCanvasV2RequestedCompositionCoverage,
} from "@/lib/canvas-v2/composition-requirements";
import {
  CANVAS_V2_WHOLE_BOARD_ISLAND_ID,
  buildCanvasV2IslandRegistry,
  canvasV2AllocatedIslandId,
  canvasV2CommittedIslandIdsForSourceValidation,
  reconcileCanvasV2OpenRequirements,
  reconcileCanvasV2EvidenceRelativeIslandOrder,
  validateCanvasV2IslandExecution,
} from "@/lib/canvas-v2/island-registry";
import { CANVAS_V2_MAX_CONTEXT_STEPS } from "@/lib/canvas-v2/design-loop";
import { canvasV2AuthoritativeUserRequest } from "@/lib/canvas-v2/interaction-router";
import {
  loadAppDataCatalog,
  resolveAppDataTenantId,
  type AppDataCatalog,
} from "@/lib/app-data/canvas-v2-catalog";
import {
  createCanvasV2AccountEvidenceProvider,
  canvasV2EvidenceDomainsForInstruction,
  canvasV2ProductEvidenceRequestedForInstruction,
} from "@/lib/canvas-v2/account-evidence-provider";
import { runCanvasV2EvidenceBridge } from "@/lib/canvas-v2/evidence-bridge";
import { createCanvasV2OpenAIWebEvidenceProvider } from "@/lib/canvas-v2/external-evidence-provider";
import { mergeCanvasV2EvidencePackets } from "@/lib/canvas-v2/evidence-packets";
import { canvasV2EvidencePacketsNeedingMaterialization } from "@/lib/canvas-v2/evidence-packet-insertion";
import { syncCanvasV2DiscoveryGraph } from "@/lib/canvas-v2/discovery-graph";
import { buildCanvasV2DiscoveryModelReferenceCodec } from "@/lib/canvas-v2/discovery-model-references";
import { buildCanvasV2EvidenceCopyHandles } from "@/lib/canvas-v2/evidence-handles";
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
  compactCanvasV2WorkingContextForModel,
  parseCanvasV2WorkingContext,
  type CanvasV2WorkingContext,
} from "@/lib/canvas-v2/working-context";
import {
  canvasV2CanonicalEvidenceScale,
  validateCanvasV2RenderedAnalysisEvidenceScale,
  validateCanvasV2RenderedDesignRegionContentIntegrity,
  validateCanvasV2RenderedDesignRegionLegibility,
  validateCanvasV2RenderedDesignRegionTerritoryIntegrity,
  validateCanvasV2RenderedComparisonCommunication,
  validateCanvasV2RenderedIslandNarrativeIntegrity,
  validateCanvasV2RenderedRelationshipGeometry,
} from "@/lib/canvas-v2/evidence-authorship";
import {
  CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
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
  type CanvasV2ModelInputImage,
  type CanvasV2ModelInputPart,
} from "@/lib/canvas-v2/structured-provider";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import {
  canvasV2LocalIntegrityRepairTarget,
  compactCanvasV2NewIslandPlacement,
  type CanvasV2LocalIntegrityRepairTarget,
} from "@/lib/canvas-v2/narrative-placement";
import { compileCanvasV2SceneTransaction } from "@/lib/canvas-v2/scene-transaction";
import {
  canvasV2LocalEvaluationEnabled,
  emptyCanvasV2LocalEvaluationCatalog,
} from "@/lib/canvas-v2/local-evaluation";
import {
  CANVAS_V2_DISCOVERY_STATE_SCHEMA,
  applyCanvasV2EmergentDepthSignal,
  applyCanvasV2DiscoveryTransition,
  buildCanvasV2SensemakingPresentationBrief,
  compactCanvasV2DiscoveryStateForModel,
  completeCanvasV2DiscoveryState,
  createCanvasV2DiscoveryState,
  parseCanvasV2EmergentDepthSignal,
  reconcileCanvasV2PresentedValidations,
  synchronizeCanvasV2DiscoveryState,
  type CanvasV2DiscoveryMove,
  type CanvasV2DiscoverySourceCategory,
  type CanvasV2DiscoveryState,
  type CanvasV2DiscoveryStateTransition,
  type CanvasV2InquiryInterpretation,
} from "@/lib/canvas-v2/discovery-state";
import {
  assertCanvasV2AuthoredPatchLanguage,
  assertCanvasV2UserFacingLanguage,
  findCanvasV2InternalLanguageLeaks,
} from "@/lib/canvas-v2/presentation-language";
import {
  CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM,
  CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA,
  canvasV2DiscoveryMoveNeedsRetrieval,
  constrainCanvasV2DelegatedComparisonClarification,
  deterministicCanvasV2ProductResearchTransition,
  directCanvasV2CreationTransition,
  parseCanvasV2DiscoveryTransition,
} from "@/lib/canvas-v2/discovery-orchestrator";
import { constrainCanvasV2ExternalDiscoveryProgress } from "@/lib/canvas-v2/discovery-reliability";
import type { CanvasV2EvidenceDomain } from "@/lib/canvas-v2/evidence-bridge";
import {
  reconcileCanvasV2AuthoredStageEvidence,
  reconcileCanvasV2WitnessOwnership,
  validateCanvasV2AuthoredStageEvidenceContract,
  validateCanvasV2WitnessOwnershipContract,
} from "@/lib/canvas-v2/stage-evidence-contract";
import {
  canvasV2ChatAttachmentEvidence,
  canvasV2ChatAttachmentHandle,
  canvasV2ChatAttachmentModelParts,
  canvasV2ChatImageAttachments,
  canvasV2ChatTextAttachments,
  canvasV2UploadedEvidenceModelParts,
  parseCanvasV2ChatAttachments,
} from "@/lib/canvas-v2/chat-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NORTHSTAR_DESIGN_REFERENCE_PATHS = [
  "public/northstar/design-references/strategic-storyline-atlas.png",
  "public/northstar/design-references/evidence-constellation.png",
];
let northstarDesignReferencePartsPromise: Promise<Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>> | undefined;

function compactDiscoveryCollaboration(context: CanvasV2WorkingContext | undefined) {
  const compact = compactCanvasV2WorkingContextForModel(context, { includeFocusObjects: false });
  return compact ? {
    ...compact,
    contract: "This is a compact browser-state summary for choosing the next discovery move. Exact canvas source, evidence identity, provenance, and mutation authority remain server-owned and are supplied to the visual and source-authoring stages when required.",
  } : undefined;
}

function compactDiscoveryProductAvailability(
  catalog: AppDataCatalog,
  instruction: string,
  targetNames: readonly string[],
) {
  const relevance = `${instruction} ${targetNames.join(" ")}`.toLowerCase();
  return catalog.apps
    .map((app, index) => ({ app, index, relevant: relevance.includes(app.name.toLowerCase()) }))
    .sort((left, right) => Number(right.relevant) - Number(left.relevant) || left.index - right.index)
    .slice(0, 12)
    .map(({ app }) => ({
      name: app.name.slice(0, 160),
      totalScreens: app.totalScreens,
      category: app.category?.slice(0, 120),
      flows: app.flows.slice(0, 12).map((flow) => ({
        name: flow.name.slice(0, 240),
        platform: flow.platform?.slice(0, 80),
        sessionType: flow.sessionType?.slice(0, 80),
        scope: flow.scope,
        screenCount: flow.screens.length,
        completeJourney: Boolean(flow.completeJourney),
      })),
    }));
}
const CREATIVE_DIRECTOR_SYSTEM = `You are North Star's visual director. Read the exact rendered overview, readable analytical-region captures, grounded evidence atlas, current creative direction, recent committed moves, and optional North Star taste reference. Return one concise JSON art-direction brief for the next visible source patch. Diagnose the most consequential visible weakness and prescribe one materially different, prompt-specific move that improves the communication.

When collaboration.scope=selection, that explicit human targeting supersedes ordinary whole-board opportunity seeking. For selectionPolicy=modify, prescribe the smallest complete change to the exact collaboration.editableNodeIds and preserve every other object; never turn a heading rewrite or selected-object restyle into an island rebuild. For selectionPolicy=reference, treat every selected node as immutable evidence or an anchor and prescribe one new bounded result near it. Locked, hidden, protected, and unselected objects are never editable. The current viewport is factual working context, not permission to move the camera.

A balanced two-column layout, three-column dashboard, repeated cards or panels, small conventional copy, and typography-only polish are scaffolding—not a resolved concept. Never keep prescribing the same container rearrangement under new wording. If recent turns already changed cards, columns, panels, grids, typography, or badges, the next brief must advance the visual argument through a genuinely different authored mode: evidence choreography, annotated sequence, causal path, relationship field, comparison axis, meaningful curve, stage compression, enlarged inspection, or another original device appropriate to the prompt. The point is not to include every device; it is to make one important insight unmistakably visible.

Let the communication problem determine the form. Editorial narratives, evidence fields, journeys, causal maps, comparison matrices, storyboards, annotated sequences, spatial arguments, data portraits, and original hybrids are possibilities, never prescribed templates. The board may compose above, below, beside, diagonally around, across, or within grounded evidence; it is not a webpage that must stack sections from top to bottom.

Treat each island as one chapter in a spatial story, never as decoration placed merely to occupy a zone. The discovery move determines which chapter should be authored next; do not force every board to include framing when an evidence reading, comparison, decision object, or other prompt-critical chapter has greater information value. When a title-and-description island exists, it is the publication-level title for the user's entire prompt—not the heading of the first analytical island. Keep it singular, topmost, and first, and never place a later composition above it or before it on the opening row. The complete grounded-evidence atlas is itself a legitimate story chapter, so a later analysis, comparison, implication, or synthesis island may deliberately continue below the full atlas instead of clustering directly around the title. Every island needs a prompt-critical purpose, a deliberate relationship to the evidence or an established island, and a distinct readable territory. If the desired territory currently contains canonical evidence or another occupant, prescribe a collision-free recomposition that preserves every existing object and opens real space above, beside, or below the complete evidence chapter; never prescribe an absolute overlay into occupied coordinates. Finish any developing island—including its assigned screenshots, labels, explanation, hierarchy, and styling—before opening another chapter.

A later turn is not an improvement merely because it is different. Identify the strongest exact visible qualities of the current committed render—such as a legible stage axis, coherent evidence scale, effective asymmetry, complete labels, or a clear reading order—and preserve them as an explicit preservation contract. Name the concrete regression risk of the proposed move. If a mature region already communicates well, extend it or make a bounded correction instead of replacing it with a speculative structure that can collapse its geometry, erase information, or create inert territory. Treat all islands as one publication: inherit the strongest established font families, body-copy scale, heading ratios, palette, rule weights, and spacing cadence. A deliberate contrast may express meaning, but a later island may never look like compressed debug output or an unrelated miniature theme beside the narrative title.

Select the complete argument-appropriate set of exact short evidence handles from canonicalEvidence whenever the move depends on screenshots or app identity. There is no fixed authored screenshot quota: select however many distinct material witnesses the actual argument requires, never an arbitrary count, a symmetric count, or the whole atlas by default. One decisive screen may prove a focused point, while a journey, transition, comparison, or qualified assessment may need several distinct moments from one side and fewer from another. Every selected screen must carry a different decision-relevant part of the argument; the complete canonical rails remain visible as the source record. Those selections become an executable contract; the server resolves them to the full tenant evidence IDs. Assign every selection a short semantic witnessGroup in kebab-case naming the exact claim, stage, comparison cell, or conclusion it supports—for example entry-awin, verification-whop, or qualified-assessment. Never use generic groups such as evidence, screenshots, witnesses, inbox, or grounded-evidence-selection. A concluding or qualified assessment that says one product appears shorter, clearer, more efficient, or more demanding is evidence-bearing: give every distinct observed premise behind that assessment its material exact witness in the assessment's witness group rather than ending with prose plus one unrelated leftover image. Assign every selection an explicit scaleIntent: identity-mark for app icons, peer for screenshots that should stay roughly 0.75–1.6× their canonical peer height, or bounded-emphasis for a screenshot whose exact observed detail genuinely needs a larger but still integrated treatment no greater than 2.75× its canonical peer height. Never choose bounded-emphasis merely to fill a column, create symmetry, or make evidence feel important. When a stage map calls several blocks SOURCED or OBSERVED SCREEN, select one exact handle for every such block and use a distinct witnessGroup matching that exact stage so the visual sequence is self-explanatory; otherwise explicitly treat the unsupported blocks as interpretation and do not leave empty screenshot footprints. Name a focused set of one to three short kebab-case authoredVisualRoles for the visible structures that could carry this turn (for example thesis-anchor, evidence-callout, comparison-axis, stage-transition, causal-connector, or an original role you devise). Do not use card, panel, column, grid, or dashboard as a visual role. The source author must materially realize at least one central role as data-canvas-v2-visual-role rather than spending the patch on metadata.

When a named app is visibly discussed in authored analysis, use its exact grounded identity handle as an identity-mark analysis copy at least once. Never substitute a generic letter tile, emoji, invented logo, or arbitrary black badge for available tenant identity evidence.

Read render.spatial.analysisEvidenceGeometry as factual scale evidence. A copied full-screen source may enlarge enough for close reading, but it must remain proportionate to the surrounding argument. Never accept a screenshot several times taller than its canonical peer or a pair of giant page-dominating captures as a finished focal treatment, even when metadata declares an analytical role or an annotation exists. Prescribe a bounded peer-scale inspection, integrated evidence callout, or smaller evidence-linked detail before any additional container work. Use render.spatial.authoredRelationships and authoredAnnotations to distinguish claimed visual language from geometry that actually exists.

Read render.spatial.authoredSurface as factual whole-board placement. Its placementOccupants list is the complete top-level multiplayer occupancy map: it includes user-created or detached objects, grounded research, and existing Northstar regions with exact rendered bounds and ownership. Its design-region centers, shares, reading order, nine named zones, zone occupancy, and edge space reveal whether the authored analysis is habitually collapsed into one webpage-like stack while usable territory remains elsewhere. Before every move, inspect every placement occupant and choose genuinely open world-space inside workspace.aiAuthoringBounds. Never prescribe a region that overlaps, covers, moves, resizes, or restyles a user-owned object or an unchanged existing object; a user object is a collaborator's durable decision, not spare background. Record the exact intended move in targetTerritory, anchored to an existing stable node, and select an exact targetZoneId. Choose the next location deliberately—above, below, left, right, diagonally offset, interleaved, spanning, or recomposing—according to the argument, reading order, and factual free space. placementMode=evidence-relative-island means a self-contained authored territory placed around the evidence—not another vertical section; attached means a bounded extension of an established region; interleaved means a deliberate, explicitly marked relationship with the evidence rail; recompose means the existing authored regions are moved together as one whole-board change. Use islands when they make separate insights inspectable, but do not scatter arbitrary widgets or fill every zone. Negative space may remain, but it must feel intentional and counterbalanced; never prescribe empty width for its own sake. A completion recommendation uses relation none, placementMode=attached, and still names the dominant stable anchor and zone whose whole-board render was reviewed.

Explicit human spatial language is binding. When the person asks for a separate island, composition, chapter, surface, or territory "beside" or "next to" another, create it with relation=left or relation=right in genuinely open nearby space. If neither side is collision-free, prescribe the smallest whole-board recomposition that opens that relationship instead of silently turning the request into another vertical section.

The finite world is navigation capacity, not a target publication footprint. Unless the user explicitly asks for an expansive at-scale landscape, keep an ordinary single-prompt composition compact enough to remain comfortably legible at fit view—typically about 3,600–5,600 canvas pixels wide and 2,000–3,600px high. Never inflate a resolved composition to 7,000–9,000px merely because distant canvas territory exists or because the overview contains whitespace. Large-world prompts may deliberately exceed that range when distance itself carries meaning.

The islandRegistry is the authoritative programmatic map of independently editable authored compositions. Choose exactly one targetIsland action: create allocates the supplied new island ID; develop advances an existing island's core argument; enrich adds missing evidence or explanation to an existing island; repair corrects a concrete rendered or factual defect; recompose coordinates the whole board; complete closes the whole-board review. Never identify an island with prose. For develop, enrich, or repair, choose an exact existing island ID and preserve its stable identity. For create, choose only the server-allocated new island ID and a purposeful open zone. For recompose or complete, choose __whole-board__. The current turn receives a focused capture and source excerpt for its chosen existing island while retaining the whole-board overview, so an island can mature across turns without losing the surrounding composition.

Every create, develop, enrich, or repair decision must explicitly declare the target island's resultingMaturity, resolutionRationale, and openRequirements after this proposed visible turn. developing means this exact island still has one or more local prompt-critical requirements, which must be listed. resolved means the island is fully composed, its intended information and evidence are present, its hierarchy and styling are coherent, and openRequirements is empty. An openRequirement belongs to the current island only: never attach future chapters, neighboring working surfaces, later stages, or whole-board deliverables to this island's lifecycle. Put those wider-board needs in remainingOpportunities and nextMoves; the global prompt-coverage ledger decides which independent island comes next. A create turn must therefore finish the bounded island it creates atomically; use later enrich or repair turns only when a newly observed defect genuinely belongs inside that same island. Once an island declares local open requirements, they are a monotonic finishing contract: later turns may retain an exact requirement or remove it when satisfied, but may not replace it with a new polish goal and perpetually move the finish line. All evidence ever assigned to the island is likewise durable. When islandRegistry contains developing or evidence-incomplete work, continue one of those exact identities before creating another island; do not proliferate half-finished story fragments. A later turn may return to any resolved island for a bounded enrichment or repair, but consecutive refinements of the same resolved chapter are not progress: advance the wider story, recompose, or complete. Recompose never changes island maturity by implication. Complete is legal only when every island in islandRegistry is already resolved, has no open requirements, and retains all evidence previously assigned to it. Never use whole-board completion to fabricate resolved island state.

When discoveryMove.kind is design-validation, author one natural human-facing learning chapter rather than another analysis report. Make the unresolved question, practical method, a short sequence of actions, signals that would strengthen or change the current view, and the decision those findings unlock easy to use. Never imply that North Star performed the interview, experiment, measurement, or other consequential external action. When discoveryMove.kind is integrate-validation, show what the person learned, how it changed the current view, and the resulting decision or next question with the human-supplied record visibly respected. These are ordinary editorial chapters: never print validationBacklog, linkedUncertaintyIds, result effect enums, or other private field names.

One island owns one primary semantic job. State that exact job in currentSemanticJob. State every already-understood prompt-critical job that must receive a later independently editable territory in deferredSemanticJobs; keep those same deferred jobs explicit in remainingOpportunities and nextMoves. These are execution fields, not a prose summary: currentSemanticJob is the only job the next source patch may visibly materialize, and deferredSemanticJobs are prohibited from the current island. When the instruction explicitly requests separate, distinct, or independently editable compositions, territories, chapters, surfaces, maps, paths, or outputs, treat that wording as a structural contract across the same run. Resolve one bounded island per observed turn; do not compress another required territory into a nested section merely to claim the whole prompt is complete. Keep the later territory out of the current island, observe the committed result, and then create the next independently editable island. This is not an island quota: one coherent job should remain one composition, and cards or containers still have to earn their place.

Give every island one stable storyRole. Let the active discovery move determine the first and subsequent roles: a board that does not need a publication title may begin directly with an evidence reading, comparison, analysis, decision surface, relationship, implication, synthesis, or framing. A title-and-description island is optional; when the story genuinely needs a publication-level headline or governing thesis, make that the complete currentSemanticJob, select storyRole=title, and defer the analytical chapters. Never hide the board's h1/title treatment inside a comparison, analysis, or implementation island. Permit at most one title island, keep it focused on title, orientation, thesis, framing, and kicker work, and preserve it as the topmost first chapter for the rest of the run. Sequence every later chapter after the title and coherently around existing evidence while preserving its storyRole when returning to it. The grounded-evidence atlas counts as an intervening narrative chapter: an analytical island below the complete atlas follows the title correctly and does not owe the title a direct 192–480px gutter. Never create islands merely to occupy empty zones. Ordinary genuinely consecutive chapters must remain in close visual proximity to their narrative neighbor—normally about 192–480px apart—and the complete publication should wrap into a compact two-dimensional neighborhood. Do not make the user pan far right, down, or across empty territory to discover the next turn. A long serial exhibition is appropriate only when the user's prompt explicitly asks for an expansive or panoramic canvas.

For a screenshot-led comparison, adjacent prose columns and small evidence thumbnails are not a resolved visual argument. Decide which prompt-specific visual form makes the central insight spatially inspectable: evidence choreography, juxtaposition, annotation, a connector, bracket, axis, sequence handoff, causal path, or a better device you invent. Relationship geometry is optional, never a box to tick. Do not prescribe it merely because none exists.

Treat connectors and other endpoint-dependent geometry as an integration layer, not an early scaffold. Stabilize the composition, evidence placement, hierarchy, scale, and visual style first. If material recomposition is still needed, prescribe that before new SVG geometry. Once relationships exist, any later brief that moves, replaces, or resizes their endpoint regions must explicitly rebuild or replace every affected relationship in the same visible turn; never preserve stale lines across a reflow.

One visible design turn is one bounded material move, not a compressed project plan. Do not combine creation of a multi-object endpoint field, connector integration, transition-label authorship, confidence encoding, spatial reflow, and final polish in one source patch. For a relationship-led prompt, first establish the independently editable endpoint territories and their hierarchy; only a later observed turn may integrate connectors against that stable geometry. This staging preserves the model's authorship while keeping latency, repair scope, and visual risk proportional to one inspectable change.

Convergence is part of visual judgment. When recent committed summaries show that the same named axis, ruler, band, region, or evidence arrangement has already been rebuilt twice, another reimplementation is not a material move. Prefer completion when the factual and rendered-integrity checks are clear. Continue only when you can name a different prompt-critical insight or a genuinely different territory whose absence is visible in the supplied render; never keep a run alive for speculative polish. Repetition must earn its place: do not repeat an exact statistic, phrase, or status in a second analytical field unless the new encoding creates a materially different comparison or decision insight.

The supplied convergencePhase is deliberate orchestration, not a turn cap. During foundation and development, establish and deepen a coherent prompt-specific visual thesis. During integration, reconcile regions, evidence, hierarchy, and any relationship geometry into one board. During convergence, inspect the complete board for missing prompt-critical information, disconnected islands, evidence-free claims, repeated structures, overlaps, and weak reading order; finish developing islands before opening optional territory and prescribe only the highest-value correction. During final-review, recommend completion only when every island is already resolved and the whole board answers the prompt. Inspect the actual pixels, not merely the ledger: multi-line type must not paint through itself; labels, badges, and rotated annotations must not cross primary copy; comparison sides must remain clearly separated; and dominant content must counterbalance the surrounding negative space. Every explicit user-named category, horizon, comparison side, stage, relationship, and requested output must be visibly materialized in non-title analytical work before completion. A title, subtitle, orientation paragraph, or roadmap promise that says later chapters will provide something is not the requested analytical result. A final-review continuation must target one exact unresolved island or exact whole-board blocker, repair it, and leave the next render ready for completion.

Use real evidence and exact app identity; never invent product facts or quantitative claims. You do not write HTML or CSS. Recommend completion only when the whole-board overview has a dominant thesis, legible evidence-led story, purposeful spatial reading order, coherent palette, inspectable evidence, and no material dead space or generic unfinished region. Scale, proximity, sequence, alignment, and whitespace can carry that reading order; relationship geometry remains an optional model-chosen device, not a completion requirement. Your brief must be concrete enough for a separate source-authoring model to execute without guessing.

Keep completionRationale as a terse internal verification judgment. Separately write completionSummary as the final handoff to the person who asked for the work: two to four outcome-first sentences explaining what North Star created, the most useful idea or organizing insight in the composition, and how the user can continue editing or directing it. Speak like a thoughtful collaborator, not a validator. Never expose internal terms or identifiers such as islands, openRequirements, contentOverflowNodeIds, compiler, render-safe, lifecycle, revision IDs, repair counts, maturity states, provider attempts, or validation diagnostics. Do not claim evidence or factual findings that were not supplied.

The discoveryModelContext is deliberately delta-first. Full changed and mandatory records are supplied; unchanged stableReferences remain valid durable memory. If—and only if—one omitted or referenced record is materially necessary to make the next visual decision, return its exact ID in requestedDiscoveryNodeIds and keep the rest of the brief coherent. Otherwise return an empty list. Never request broad expansion, never guess omitted content, and never use expansion as a substitute for visual judgment.

${NORTHSTAR_V2_CANVAS_GRAMMAR}`;
const CREATIVE_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    visualDiagnosis: { type: "string" },
    materialMove: { type: "string" },
    currentSemanticJob: { type: "string" },
    deferredSemanticJobs: { type: "array", minItems: 0, maxItems: 6, items: { type: "string" } },
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
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          evidenceHandle: { type: "string" },
          witnessGroup: { type: "string" },
          roleInArgument: { type: "string" },
          intendedTreatment: { type: "string" },
          scaleIntent: { type: "string", enum: ["identity-mark", "peer", "bounded-emphasis"] },
        },
        required: ["evidenceHandle", "witnessGroup", "roleInArgument", "intendedTreatment", "scaleIntent"],
      },
    },
    requestedDiscoveryNodeIds: { type: "array", minItems: 0, maxItems: 12, items: { type: "string" } },
    authoredVisualRoles: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
    antiRepetition: { type: "string" },
    visualVocabulary: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
    paletteDirection: { type: "string" },
    whyThisTurn: { type: "string" },
    preservedStrengths: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
    regressionRisk: { type: "string" },
    completionRecommendation: { type: "string", enum: ["continue", "complete"] },
    completionRationale: { type: "string" },
    completionSummary: { type: "string" },
    visualThesis: { type: "string" },
    compositionStrategy: { type: "string" },
    hierarchyAndScale: { type: "string" },
    spacingRhythm: { type: "string" },
    relationshipLogic: { type: "string" },
    growthDirection: { type: "string", enum: ["stable", "horizontal", "vertical", "both"] },
    remainingOpportunities: { type: "array", minItems: 0, maxItems: 6, items: { type: "string" } },
    nextMoves: { type: "array", minItems: 0, maxItems: 5, items: { type: "string" } },
  },
  required: ["visualDiagnosis", "materialMove", "currentSemanticJob", "deferredSemanticJobs", "spatialDirection", "targetIsland", "targetTerritory", "evidenceChoreography", "evidenceSelections", "requestedDiscoveryNodeIds", "authoredVisualRoles", "antiRepetition", "visualVocabulary", "paletteDirection", "whyThisTurn", "preservedStrengths", "regressionRisk", "completionRecommendation", "completionRationale", "completionSummary", "visualThesis", "compositionStrategy", "hierarchyAndScale", "spacingRhythm", "relationshipLogic", "growthDirection", "remainingOpportunities", "nextMoves"],
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
        // This is an availability bound, not an authored composition quota.
        // Every grounded handle in this exact revision remains selectable.
        maxItems: evidenceHandles.length,
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

The collaboration contract is binding. When collaboration.scope=selection and selectionPolicy=modify, existing-node mutation operations may target only collaboration.editableNodeIds; preserve all unselected nodes byte-for-byte and keep CSS selectors scoped to those exact stable IDs. When selectionPolicy=reference, selected nodes are immutable: create the derived work in the director's new bounded island and never replace, remove, append into, restyle, move, resize, hide, unlock, or reparent a selected reference. Insert that new identified island immediately before or after an exact selected reference. Every CSS selector in a reference-scoped turn must include an exact data-canvas-v2-node-id attribute selector for one of the newly created nodes; global, root, element-only, and class-only rules are forbidden. Never mutate collaboration.protectedNodeIds. A small selected-object request is not authorization to rebuild its parent island or the surrounding board.

When a title island exists, it is the immutable publication-level opening for the user's whole prompt. Preserve it as the first source and spatial chapter; never insert or position a later island above it or before it on the opening row. The complete grounded-evidence atlas may follow that opening, and later analytical islands may continue below the atlas. Execute the compiler-owned target relation exactly, even when the director originally preferred another direction.

Every visible authored primitive—text block, shape, connector, divider, image, table, frame, or other independently painted leaf—must receive its own unique data-canvas-v2-node-id so the user can select and transform it independently. Layout-only wrappers may remain anonymous; never merge separate visible primitives into one object merely to simplify layout.

Return only decision, moveKind, summary, expectedVisualResult, emergentDepth, and patch. Do not return a creative direction, spatial strategy, composition ledger, reflection, research decision, completion decision, full document, or prose outside the JSON contract. The server owns those responsibilities.

Make one private adaptive-depth judgment after authoring the patch. Use emergentDepth.recommendation=stay-direct with evidenceNeed=irrelevant for straightforward work that can be completed responsibly from the supplied canvas and request. Use deepen only when this composition exposes one precise unanswered question whose answer could materially change the requested outcome; include that question, the smallest honest evidence need, and only relevant source categories. Optional specificity, decorative possibilities, and generic opportunities to do more are not reasons to deepen. During a hidden render repair always stay-direct. This judgment is runtime control and must never become visible canvas copy.

The supplied discoveryState, discoveryMove, userFacingSensemaking, completion fields, evidence classifications, retries, and execution contract are private reasoning context. Translate their domain meaning into natural editorial communication. Never display field names or phrases such as discovery state, discovery move, material unknown, expected information gain, source category, completion readiness, epistemic classification, provider attempt, repair pass, compiler, validator, or schema unless the person's own instruction explicitly asks to explain that technical concept.

For a human-guided learning chapter, write in the language of the user's problem: what we need to learn, questions worth asking, a lightweight way to test it, signals to watch, what would change the recommendation, and when to decide. Never display terms such as validation backlog, validation status, uncertainty ID, candidate ID, information gain, result effect, or human-input node. A returned human result should read as what was learned and what it changes—not as evidence ingestion or state transition.

Use only exact target node IDs from source.htmlOutline and executionContract.editableNodeIds. That editable-node directory is the authoritative target shortlist. If a semantic child you want is absent, append a new uniquely identified child inside an exact existing parent; never invent a target ID and assume it exists. Obey executionContract.targetIsland exactly. A create action must materialize one new top-level analytical territory whose data-canvas-v2-node-id is the supplied islandId and whose data-canvas-v2-story-role exactly matches storyRole. Develop, enrich, and repair must update that exact existing island without renaming, duplicating, or changing its story role. When the target is the board's single title island, use a real h1/h2 plus a descriptive paragraph and place its bounded outer region in verified free territory near the beginning of the reading order. Its exact width, wrapping, and origin must respond to workspace.recommendedOpenTerritories and render.spatial.authoredSurface.placementOccupants; never force a full-canvas strip through occupied space, overlap canonical evidence, or cover a collaborator-owned object. Fully execute the target island's intended visible state: if resultingMaturity is resolved, the island must visibly contain its complete intended message, every selected evidence item, all necessary labels and explanatory information, coherent hierarchy, and finished styling; if developing, execute this turn's material move while leaving the listed openRequirements honestly visible in lifecycle memory for a later turn. Explicit prompt coverage belongs in non-title analytical work: never treat a title, subtitle, orientation paragraph, or future-chapter promise as proof that a named category, horizon, comparison side, stage, relationship, or output exists. Do not abandon a developing island to open unrelated territory: finish its declared missing information, screenshots, hierarchy, or styling through its stable identity first. Recompose may coordinate several existing islands but must retain their stable identities and cannot silently resolve them. Each inserted or replaced top-level analytical territory requires a unique data-canvas-v2-node-id and data-canvas-v2-design-region; the compiler binds data-canvas-v2-island-id to the same stable ID. Materialize at least one supplied authoredVisualRole exactly as data-canvas-v2-visual-role. The compiler owns the target island's durable evidence ledger, exact provenance, stable identity, relation, placement mode, and target zone. Compose the already-bound evidence nodes from focusedIslandSource and preserve them in place. Never write evidence URLs or evidence handles. Preserve canonical evidence lanes and existing evidence copies.

Obey independentTerritoryContract when supplied. Author only visualDirectorBrief.currentSemanticJob. Treat every visualDirectorBrief.deferredSemanticJobs entry as excluded visible content for this patch: do not nest it, summarize it, promise it inside the current island, or precompose any of its steps. If requiredCount is greater than projectedCountAfterThisTurn, the deferred jobs will receive later observed source-author transactions. If this turn reaches requiredCount, author the exact missing independent job rather than a duplicate summary of an established island.

During executionContract.repairMode=repair-existing-uncommitted-candidate, the supplied source is the exact rejected candidate and already contains the create transaction's target island. Correct that same node and its CSS in place. Do not append a duplicate island, change its identity, revisit art direction, or treat its presence as committed lifecycle state. During executionContract.repairMode=retry-whole-board-from-committed-source, the rejected recompose contained no new story object, so the supplied source is deliberately reset to public committed truth. Execute one clean replacement recompose against the exact body-level island IDs; never copy or append rejected CSS.

For develop, enrich, and repair, the committed target island is durable compiler-owned state. Never remove or replace its top-level node, and never remove or replace a descendant containing grounded evidence. Append or insert the new chapter inside the exact island, or replace one exact evidence-free child. For these existing-island actions, the server preserves the prior evidence ledger and pre-binds every newly selected image in focusedIslandSource before this call. Compose those existing image nodes; never emit, invent, or repeat an evidence handle. For a create action only, paste each exact executionContract.requiredEvidenceTags entry once inside the new island. Every selected image carries a compiler-owned data-canvas-v2-witness-group. Create one exact identified semantic container for every visualDirectorBrief.evidenceSelections witnessGroup and mark it data-canvas-v2-evidence-group="that-group"; place the corresponding images inside the claim, stage, comparison cell, or conclusion they materially support. The compiler may move a bound image into its matching container, but it cannot invent the missing semantic structure. A generic evidence inbox, a detached thumbnail lane, or an isolated screenshot beneath conclusion prose is unfinished work and cannot commit.

Realize targetTerritory, including its relation, placementMode, and targetZoneId, in actual source geometry. The supplied workspace.aiAuthoringBounds and render.spatial.authoredSurface.placementOccupants are binding geometry: the resulting top-level territory must fit inside that honest world-space band and must not intersect any existing user, research, or unchanged Northstar occupant. Mark the responsible top-level design region with data-canvas-v2-territory-relation, data-canvas-v2-placement-mode, and data-canvas-v2-target-zone using those exact brief values. An evidence-relative island must occupy a distinct, purposeful two-dimensional territory around the evidence—not become another section in the same vertical stack. Author only the intrinsic composition: the source compiler owns its ${CANVAS_V2_WORKSPACE.documentMargin}px local safe perimeter and translates the accepted native object scene to the permanent world-space origin x=${CANVAS_V2_WORKSPACE.aiAuthoringOriginX}px, never a camera-only offset. The node canvas-root is an inert metadata template, not the parent of visible islands: it can receive a first body-level append but must never appear in CSS. Never style body, html, the finite workspace, workspace metadata, or a root canvas size/padding to simulate placement. Use intrinsic, content-driven grid/flex placement for region internals and exact body-level island selectors, normal-flow order, alignment, and margins for whole-composition territory; the compiler neutralizes absolute top-level island offsets because they create overlaps and edge escapes. Never create arbitrary empty canvas dimensions. Interleave only when explicitly requested and mark it with data-canvas-v2-evidence-interleave. Recompose all affected regions together when placementMode is recompose.

The world size does not set the authored composition scale. Unless the brief explicitly requests an expansive or panoramic canvas, keep the complete body-level publication within an approximately 3,600–5,600px by 2,000–3,600px intrinsic footprint and the meaningful visible content of every genuinely consecutive authored chapter within 960px of its preceding narrative neighbor. The complete grounded-evidence atlas is an intervening chapter, not empty margin: when it occupies the story between a title above and synthesis below, do not force those two authored islands to become directly adjacent or move the synthesis above the evidence. Prefer a compact two-dimensional editorial constellation, with ordinary direct gutters of roughly 192–480px, over one long chain of empty space. Fit every top-level island to its actual communication: never use oversized min-height, padding, empty grid tracks, or spacer margins to make technically adjacent roots render like separate pages. The user should understand a normal composition at a 15–25% working zoom without hunting for later turns. A recompose must change the measured relative positions of its AI-owned islands, not merely enlarge their widths or add margins while leaving every island on the same vertical rail.

Keep all narrative copy readable at normal whole-board distance. Headings must render at least 40 canvas pixels, paragraphs and list copy at least 28px, and short labels or metadata at least 24px. Those are floors, not a prescribed type scale. Carry the established editorial font pairing, hierarchy ratios, restrained accent logic, line weights, and spacing rhythm through every island. Multi-line type needs honest leading: never use compressed line-height, negative margins, transforms, or an overlapping badge to manufacture density. A rotated label is acceptable only in a genuinely empty corridor and must never cross a heading or reading unit. When developing an existing island, update its intrinsic grid or flex tracks as one bounded composition. Never turn its root into width:max-content and append fixed-width chapters with thousand-pixel spacer margins; that produces a hidden horizontal artboard and collapses earlier content into sliver columns. Give every prose block a useful reading measure and set flex-shrink:0 only where the complete parent width honestly contains all siblings. If the composition does not fit, simplify the structure, shorten nonessential copy, widen an honest region, or use available two-dimensional territory; never shrink useful copy into microtext.

If the target zone currently contains a canonical lane, first change normal-flow or grid geometry so the complete lane moves intact and the island receives genuinely empty territory. Never position an island over canonical screenshots and rely on z-index, transparency, metadata, or an overlap exemption. The rendered boundaries of independently authored islands must remain distinct from one another.

Preserve screenshot aspect ratios and the supplied scale intent. Do not author page-dominating screenshots. Ground every product-specific analytical claim in a visible screen from canonical evidence or an exact evidence copy; label interpretation and estimates honestly. Do not introduce endpoint-dependent SVG relationships until the brief asks for them. When existing relationship endpoints move, replace or update all affected geometry in the same patch. Relationship geometry must carry exact data-canvas-v2-relationship-source and data-canvas-v2-relationship-target anchors; annotations must carry data-canvas-v2-annotation-for. Do not emit scripts, iframes, forms, event handlers, external imports, or JavaScript.

Canonical flow screen totals and authored comparison stages are different facts. Never describe a selected subset, three-stage axis, or representative sequence as “N screens” for an app. Use “stages”, “phases”, “moments”, or “selected examples” for authored compression; reserve “N screens” only for the exact authoritative complete-flow totals supplied in authoritativeCanonicalFacts.
When the brief calls for a comparison or stage axis, the labels and their evidence must share one real layout structure. Put each screenshot witness inside the stage or comparison cell it supports; never author a full-width row of headings and then place every screenshot in an unrelated left-packed lane beneath it. Every comparison checkpoint or stage must declare evidence ownership on its exact identified container: data-canvas-v2-stage-evidence="sourced" for an observed stage, or data-canvas-v2-stage-evidence="interpretation" for reasoning. A sourced stage must also carry the matching data-canvas-v2-evidence-group from its selected witness. A sourced stage must contain at least one exact grounded analysis-copy screenshot inside that same container; screenshots elsewhere on the axis do not support it. An interpretation stage must visibly say Interpretation and must not claim observed interface behavior or reserve an empty screenshot footprint. When the director explicitly asks for an N-stage grounded screenshot comparison, all N stages are sourced; place any purely interpretive implication in its later implication chapter instead of using it as a screenshot-free stage.

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

const ADAPTIVE_SOURCE_AUTHOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...SOURCE_AUTHOR_SCHEMA.properties,
    emergentDepth: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommendation: { type: "string", enum: ["stay-direct", "deepen"] },
        rationale: { type: "string" },
        materialQuestion: { type: ["string", "null"] },
        evidenceNeed: { type: "string", enum: ["required", "useful", "optional", "irrelevant"] },
        sourceCategories: { type: "array", items: { type: "string", enum: ["product", "marketing", "business", "external", "canvas"] }, maxItems: 5 },
      },
      required: ["recommendation", "rationale", "materialQuestion", "evidenceNeed", "sourceCategories"],
    },
  },
  required: [...SOURCE_AUTHOR_SCHEMA.required, "emergentDepth"],
} as const;

const TARGETED_SELECTION_AUTHOR_SYSTEM = `You are North Star's precision selection editor. Apply the user's requested change to the exact stable objects in collaboration.editableNodeIds.
Return one small source patch. Existing-node mutation operations may target only those exact IDs. Preserve every unselected object byte-for-byte, including its content, geometry, styling, nesting, evidence, origin, edit history, visibility, lock state, and relationships. Never rebuild an island, add a replacement section, or change global CSS for a local selection edit. When changing text, replace only the exact selected text node and retain its stable data-canvas-v2-node-id. When changing appearance, prefer an inline style on the exact selected node; any CSS operation must use an exact stable-node attribute selector. Locked, hidden, and collaboration.protectedNodeIds are immutable. Do not emit scripts, event handlers, iframes, forms, external imports, or JavaScript. Return JSON only.`;

function selectionCreativeDirection(
  instruction: string,
  previous?: CanvasV2CreativeDirection,
): CanvasV2CreativeDirection {
  return {
    designIntent: instruction,
    visualThesis: previous?.visualThesis ?? "The person's selected objects change precisely while the surrounding authored board remains intact.",
    compositionStrategy: previous?.compositionStrategy ?? "Use the existing composition and apply only the explicitly requested selected-object revision.",
    visualLanguage: previous?.visualLanguage ?? "Inherit the selected objects' native visual language and existing board system.",
    evidenceStrategy: previous?.evidenceStrategy ?? "Preserve all evidence identity, pixels, provenance, and relationships unless an exact selected evidence object is explicitly editable.",
    currentFocus: "Complete the explicit selected-object request without collateral board changes.",
    unresolvedOpportunities: [],
    nextMoves: [],
  };
}

function selectionSpatialStrategy(
  context: CanvasV2WorkingContext,
  previous?: CanvasV2SpatialStrategy,
): CanvasV2SpatialStrategy {
  return {
    growthDirection: "stable",
    layoutSystem: previous?.layoutSystem ?? "Retain the current native object geometry and composition.",
    primaryAnchor: context.selectedNodeIds.join(", "),
    hierarchyAndScale: previous?.hierarchyAndScale ?? "Preserve the established hierarchy and scale unless the selected-object request explicitly changes them.",
    spacingRhythm: previous?.spacingRhythm ?? "Preserve all surrounding spacing.",
    relationshipLogic: previous?.relationshipLogic ?? "Preserve every existing relationship and endpoint.",
    currentAdjustment: "Only the exact editable selection may change.",
    intentionalOverlaps: previous?.intentionalOverlaps ?? [],
  };
}

function compileTargetedSelectionDecision(input: {
  payload: unknown;
  instruction: string;
  revision: CanvasV2ArtifactRevision;
  workingContext: CanvasV2WorkingContext;
  creativeDirection?: CanvasV2CreativeDirection;
  spatialStrategy?: CanvasV2SpatialStrategy;
  compositionState?: CanvasV2CompositionState;
}): CanvasV2EditDecision {
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new Error("The precision selection editor returned an invalid response.");
  const source = input.payload as Record<string, unknown>;
  if (source.decision !== "edit") throw new Error("The precision selection editor must return decision=edit.");
  const moveKind = ["framing", "composition", "relationship", "analysis", "refinement"].includes(String(source.moveKind))
    ? source.moveKind as CanvasV2EditDecision["moveKind"]
    : "refinement";
  const summary = requiredSourceAuthorText(source.summary, "a concise selected-object summary");
  const expectedVisualResult = requiredSourceAuthorText(source.expectedVisualResult, "a selected-object visual result");
  const document = applyCanvasV2SourcePatch({
    previous: input.revision.document,
    operations: parseCanvasV2SourcePatch(source.patch),
    evidence: input.revision.evidence,
    workingContext: input.workingContext,
  });
  const creativeDirection = selectionCreativeDirection(input.instruction, input.creativeDirection);
  const spatialStrategy = selectionSpatialStrategy(input.workingContext, input.spatialStrategy);
  return {
    schema: CANVAS_V2_DECISION_SCHEMA,
    decision: "edit",
    moveKind,
    creativeDirection,
    spatialStrategy,
    compositionState: input.compositionState,
    reflection: {
      observedResult: summary,
      remainingOpportunity: "none",
      conceptRead: "The explicit selected-object request is isolated from the surrounding composition.",
      hierarchyRead: "Unselected hierarchy remains unchanged.",
      evidenceRead: "Evidence and provenance outside the editable selection remain unchanged.",
      relationshipRead: "Existing object relationships remain unchanged.",
      legibilityRead: expectedVisualResult,
      distinctivenessRead: "The edit preserves the board's established visual language.",
      nextMoveReason: "Observe the exact candidate, then complete this bounded selection turn.",
    },
    document,
    summary,
    expectedVisualResult,
    sceneTransaction: compileCanvasV2SceneTransaction({
      origin: "northstar",
      baseRevisionId: input.revision.id,
      previous: input.revision.document,
      next: document,
      workingContext: input.workingContext,
    }),
  };
}
function normalizedMove(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canvasV2InstructionExplicitlyRequestsRelationshipGeometry(instruction: string): boolean {
  return /\b(?:connectors?|endpoint(?:-dependent)?|svg|arrows?|curves?|(?:explicit|native|causal|dependency)\s+relationships?|relationship\s+geometry|(?:causal|dependency)\s+(?:paths?|lines?))\b/i.test(instruction);
}

function canvasV2TextPrescribesRelationshipGeometry(value: string): boolean {
  return /\b(?:connectors?|endpoint(?:-dependent)?|svg|arrows?|curves?|(?:explicit|native|causal|dependency)\s+relationships?|relationship\s+geometry|(?:causal|dependency)\s+(?:paths?|lines?))\b/i.test(value);
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
  const resetWholeBoardRecompose = repair.islandExecution?.target.action === "recompose";
  const posture = resetWholeBoardRecompose
    ? "The rejected whole-board CSS has been discarded. Re-execute the preserved intention once from committed truth by styling exact visible island nodes; canvas-root is inert metadata and is forbidden as a CSS target."
    : repair.attempt === 1
      ? "Preserve the valid visual intention, but correct the exact rejected geometry or evidence treatment from the last uncommitted candidate."
    : repair.attempt === 2
      ? "The first render repair still failed. Rebuild the responsible region from the committed source with simpler intrinsic geometry; do not preserve the rejected CSS structure."
      : "Final render repair: discard the rejected candidate geometry and execute the smallest render-safe version of the same prompt-critical move inside the promised territory.";
  return `RENDER REPAIR PASS ${repair.attempt} OF ${repair.maxAttempts}. ${posture} Exact failures: ${repair.failures.join(" ")} ${repair.failedMove ? `Rejected move: ${repair.failedMove}` : ""} `;
}

function compactCanvasV2PrivateRecovery(value: unknown): {
  kind: "phase-contract" | "render-integrity" | "capture";
  fingerprint: string;
  occurrence: number;
  failures: string[];
  rejectedMove?: string;
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const kind = record.kind === "render-integrity" || record.kind === "capture" || record.kind === "phase-contract"
    ? record.kind
    : undefined;
  if (!kind || typeof record.fingerprint !== "string") return undefined;
  return {
    kind,
    fingerprint: record.fingerprint.slice(0, 160),
    occurrence: Math.max(1, Math.floor(Number(record.occurrence) || 1)),
    failures: (Array.isArray(record.failures) ? record.failures : [])
      .filter((failure): failure is string => typeof failure === "string")
      .slice(-8)
      .map((failure) => failure.slice(0, 800)),
    ...(typeof record.rejectedMove === "string" ? { rejectedMove: record.rejectedMove.slice(0, 1_200) } : {}),
  };
}

function canvasV2PrivateRecoveryInstruction(recovery: ReturnType<typeof compactCanvasV2PrivateRecovery>): string {
  if (!recovery) return "";
  return [
    "PRIVATE CONTRACT REPLAN: the preceding draft was never committed or shown.",
    "Work only from the supplied committed render and choose a genuinely executable bounded move that still advances the original prompt.",
    "Do not repeat the rejected structure, do not mention recovery or validation to the user, and do not weaken evidence, narrative, or completion standards.",
    `Failure fingerprint ${recovery.fingerprint}; diagnostic recurrence ${recovery.occurrence}; exact failures: ${recovery.failures.join(" ")}`,
    recovery.rejectedMove ? `Rejected private move: ${recovery.rejectedMove}` : "",
  ].filter(Boolean).join(" ") + " ";
}

function validateCanvasV2CreativeArc(
  decision: ReturnType<typeof parseCanvasV2DesignDecision>,
  policy: ReturnType<typeof canvasV2ResearchDecisionPolicy>,
  allowCreativeRedirection = false,
): void {
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
    summary: input.brief.completionSummary,
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
      observedResult: input.brief.completionSummary,
      remainingOpportunity: "none",
      conceptRead: input.brief.visualDiagnosis,
      hierarchyRead: input.brief.preservedStrengths.join(" "),
      evidenceRead: input.brief.evidenceChoreography,
      relationshipRead: input.brief.visualVocabulary.join(", "),
      legibilityRead: input.brief.preservedStrengths.join(" "),
      distinctivenessRead: input.brief.whyThisTurn,
      nextMoveReason: input.brief.completionSummary,
    },
  }, input.revision.evidence, input.revision.document);
}

async function loadNorthstarDesignReferenceParts(): Promise<CanvasV2ModelInputPart[]> {
  if (!northstarDesignReferencePartsPromise) {
    northstarDesignReferencePartsPromise = (async () => {
      const parts: CanvasV2ModelInputPart[] = [{
        text: "North Star visual-language references follow. Use them only to calibrate editorial craft and visual intelligence; do not copy their layout, prose, claims, or data.",
      }];
      for (const relativePath of NORTHSTAR_DESIGN_REFERENCE_PATHS.slice(0, 1)) {
        try {
          const data = await readFile(path.join(process.cwd(), relativePath));
          parts.push({ text: `Visual-language reference: ${path.basename(relativePath)}` }, { inlineData: {
            mimeType: "image/png",
            data: data.toString("base64"),
            detail: "low",
            purpose: "reference",
          } });
        } catch {
          // The production design loop remains usable when optional taste references are absent.
        }
      }
      return parts.length > 1 ? parts : [];
    })();
  }
  try {
    return await northstarDesignReferencePartsPromise;
  } catch (error) {
    // A transient local read cannot poison later model turns.
    northstarDesignReferencePartsPromise = undefined;
    throw error;
  }
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

function modelImage(
  value: string,
  detail: "low" | "high",
  purpose: CanvasV2ModelInputImage["purpose"],
): CanvasV2ModelInputImage {
  return { ...parseDataUrl(value), detail, purpose };
}

function requiredCreativeBriefText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`The visual director brief requires ${label}.`);
  return value.trim().slice(0, maxLength);
}

const COMPLETION_SUMMARY_INTERNAL_JARGON = /\b(?:render-safe|compiler-owned|lifecycle|maturity state|corrective attempts?|revision-[a-z0-9-]+|all islands? (?:is|are|remain|resolved)|unresolved islands?)\b/i;

function completionSummaryContainsInternalLanguage(value: string): boolean {
  return COMPLETION_SUMMARY_INTERNAL_JARGON.test(value) || findCanvasV2InternalLanguageLeaks(value).length > 0;
}

function userFacingCompletionSummary(value: Record<string, unknown>): string {
  const authored = typeof value.completionSummary === "string" ? value.completionSummary.trim().replace(/\s+/g, " ").slice(0, 1_200) : "";
  if (authored && !completionSummaryContainsInternalLanguage(authored)) return authored;

  const insight = [value.visualThesis, value.compositionStrategy, value.visualDiagnosis]
    .map((item) => typeof item === "string" ? item.trim().replace(/\s+/g, " ").slice(0, 420) : "")
    .find((item) => item && !completionSummaryContainsInternalLanguage(item));
  if (!insight) {
    return "North Star completed the requested composition and organized it into a clear visual story. The canvas remains fully editable, so you can refine any element or ask for a focused variation.";
  }
  const insightSentence = /[.!?]$/.test(insight) ? insight : `${insight}.`;
  return `North Star completed the composition around this idea: ${insightSentence} The canvas remains fully editable, so you can refine any element or ask for a focused variation.`;
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
  // Persisted repair checkpoints created before the atomic-job contract may
  // not carry these fields. Their already-validated material move remains the
  // current job; newly generated briefs are required by schema to be explicit.
  const currentSemanticJob = requiredCreativeBriefText(
    value.currentSemanticJob ?? value.materialMove,
    "one current semantic job",
    600,
  );
  const deferredSemanticJobs = Array.isArray(value.deferredSemanticJobs)
    ? value.deferredSemanticJobs.slice(0, 6).map((item, index) => requiredCreativeBriefText(item, `deferred semantic job ${index + 1}`, 600))
    : [];
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
  if (!Array.isArray(value.evidenceSelections)) throw new Error("The visual director brief requires an explicit evidence selection list.");
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
    // Persisted private repair checkpoints created before witness ownership
    // existed remain resumable. Newly generated briefs must supply the field
    // through the strict schema above; legacy checkpoints derive one stable
    // semantic destination from their already-authored argument role.
    const legacyWitnessGroup = roleInArgument.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    const proposedWitnessGroup = typeof record.witnessGroup === "string"
      ? record.witnessGroup.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96)
      : legacyWitnessGroup || `material-witness-${index + 1}`;
    const witnessGroup = /^(?:evidence|screens?|screenshots?|witnesses?|inbox|grounded-evidence-selection)$/.test(proposedWitnessGroup)
      && record.witnessGroup === undefined
      ? `material-witness-${index + 1}`
      : proposedWitnessGroup;
    const intendedTreatment = typeof record.intendedTreatment === "string" ? record.intendedTreatment.trim() : "";
    const scaleIntent = record.scaleIntent;
    if (!evidenceHandle || !witnessGroup || !roleInArgument || !intendedTreatment || (scaleIntent !== "identity-mark" && scaleIntent !== "peer" && scaleIntent !== "bounded-emphasis")) throw new Error(`Visual director evidence selection ${index + 1} is incomplete.`);
    if (/^(?:evidence|screens?|screenshots?|witnesses?|inbox|grounded-evidence-selection)$/.test(witnessGroup)) {
      throw new Error(`Visual director evidence selection ${index + 1} requires a semantic witnessGroup naming the exact claim, stage, comparison cell, or conclusion it supports.`);
    }
    if (!evidenceId) throw new Error(`Visual director selected an evidence handle that is not grounded in the current canvas: ${evidenceHandle}.`);
    return { evidenceHandle, evidenceId, witnessGroup, roleInArgument: roleInArgument.slice(0, 600), intendedTreatment: intendedTreatment.slice(0, 600), scaleIntent };
  });
  if (new Set(evidenceSelections.map((selection) => selection.evidenceId)).size !== evidenceSelections.length) {
    throw new Error("The visual director must select each exact evidence item once and assign it to one material witness group; do not duplicate the same screenshot into several decorative locations.");
  }
  if (value.requestedDiscoveryNodeIds !== undefined && (!Array.isArray(value.requestedDiscoveryNodeIds) || value.requestedDiscoveryNodeIds.length > 12)) {
    throw new Error("The visual director brief requires a focused discovery expansion list of no more than twelve exact node IDs.");
  }
  // Older persisted checkpoints predate on-demand discovery expansion. Treat
  // the missing field as an empty request while requiring all newly generated
  // briefs (via CREATIVE_BRIEF_SCHEMA) to state the decision explicitly.
  const requestedDiscoveryNodeIds = Array.from(new Set((Array.isArray(value.requestedDiscoveryNodeIds) ? value.requestedDiscoveryNodeIds : []).map((nodeId, index) => (
    requiredCreativeBriefText(nodeId, `requested discovery node ${index + 1}`, 240)
  ))));
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
  if (canvasV2CompletionContradictsMaterialMove({
    recommendation: value.completionRecommendation,
    targetAction: String(islandAction) as "create" | "develop" | "enrich" | "repair" | "recompose" | "complete",
    materialMove: String(value.materialMove),
  })) {
    throw new Error("A whole-board completion cannot prescribe an unexecuted visible mutation. Return recommendation=continue with the exact executable island action, or keep action=complete and describe verification only.");
  }
  const completionRecommendation = canvasV2EffectiveCompletionRecommendation({
    recommendation: value.completionRecommendation,
    targetAction: String(islandAction) as "create" | "develop" | "enrich" | "repair" | "recompose" | "complete",
  });
  const completionSummary = userFacingCompletionSummary({ ...value, completionRecommendation });
  if (completionRecommendation === "continue" && territoryRelation === "none") throw new Error("A continuing visual-director brief must name the exact territory for its next material move.");
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
  const normalizedRemainingOpportunities = completionRecommendation === "complete"
    ? []
    : remainingOpportunities.length
      ? remainingOpportunities
      : [String(value.whyThisTurn).slice(0, 600)];
  const normalizedNextMoves = completionRecommendation === "complete"
    ? []
    : nextMoves.length
      ? nextMoves
      : [String(value.materialMove).slice(0, 600)];
  return {
    visualDiagnosis: String(value.visualDiagnosis).slice(0, 1_200),
    materialMove: String(value.materialMove).slice(0, 1_200),
    currentSemanticJob,
    deferredSemanticJobs,
    spatialDirection: String(value.spatialDirection).slice(0, 1_200),
    targetIsland: {
      action: (completionRecommendation === "complete" ? "complete" : String(islandAction)) as "create" | "develop" | "enrich" | "repair" | "recompose" | "complete",
      islandId: completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete"
        ? CANVAS_V2_WHOLE_BOARD_ISLAND_ID
        : targetIslandId,
      storyRole: (completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete"
        ? "whole-board"
        : String(storyRole)) as "title" | "orientation" | "evidence-reading" | "comparison" | "analysis" | "relationship" | "implication" | "synthesis" | "whole-board",
      resultingMaturity: (completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete"
        ? "unchanged"
        : resultingMaturity) as "developing" | "resolved" | "unchanged",
      resolutionRationale,
      openRequirements: completionRecommendation === "complete" || islandAction === "recompose" || islandAction === "complete" ? [] : openRequirements,
    },
    targetTerritory: {
      relation: completionRecommendation === "complete" ? "none" : String(territoryRelation),
      anchorNodeId: requiredCreativeBriefText(targetTerritory.anchorNodeId, "target territory anchor", 240),
      intendedFootprint: requiredCreativeBriefText(targetTerritory.intendedFootprint, "target territory footprint", 800),
      rationale: requiredCreativeBriefText(targetTerritory.rationale, "target territory rationale", 800),
      placementMode: (completionRecommendation === "complete" ? "attached" : String(placementMode)) as "attached" | "evidence-relative-island" | "interleaved" | "recompose",
      targetZoneId: String(targetZoneId),
    },
    evidenceChoreography: String(value.evidenceChoreography).slice(0, 1_200),
    evidenceSelections,
    requestedDiscoveryNodeIds,
    authoredVisualRoles,
    antiRepetition: String(value.antiRepetition).slice(0, 1_000),
    visualVocabulary: value.visualVocabulary.slice(0, 6).map((item) => String(item).slice(0, 300)),
    paletteDirection: String(value.paletteDirection).slice(0, 800),
    whyThisTurn: String(value.whyThisTurn).slice(0, 1_000),
    preservedStrengths: value.preservedStrengths.slice(0, 4).map((item) => String(item).slice(0, 500)),
    regressionRisk: String(value.regressionRisk).slice(0, 1_000),
    completionRecommendation,
    completionRationale: String(value.completionRationale).slice(0, 1_200),
    completionSummary,
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
    designRegions?: readonly CanvasV2DesignRegionObservation[];
    promptCoverageFailures?: readonly string[];
    compactPlacementRequired?: boolean;
    localIntegrityRepairTarget?: CanvasV2LocalIntegrityRepairTarget;
    wholeBoardRecomposeRequested?: boolean;
    firstSynthesisTurn?: boolean;
  },
): ReturnType<typeof parseCreativeDirectorBrief> {
  if (input.repairExecution) {
    return {
      ...brief,
      targetIsland: { ...brief.targetIsland, ...input.repairExecution.target },
      targetTerritory: { ...brief.targetTerritory, ...input.repairExecution.territory },
    };
  }
  const unfinishedIsland = input.islandRegistry.find((island) => (
    island.maturity !== "resolved"
    || island.openRequirements.length > 0
    || island.missingRequiredEvidenceIds.length > 0
  ));
  if (brief.completionRecommendation === "complete" && unfinishedIsland) {
    const activeRequirement = unfinishedIsland.openRequirements[0]
      ?? (unfinishedIsland.missingRequiredEvidenceIds.length
        ? `Materialize the island's missing assigned evidence: ${unfinishedIsland.missingRequiredEvidenceIds.join(", ")}.`
        : "Finish the island's declared prompt-critical content and hierarchy.");
    const remainingRequirements = unfinishedIsland.openRequirements.slice(1);
    return {
      ...brief,
      visualDiagnosis: `The latest verified canvas still has one explicit unfinished chapter: ${activeRequirement}`,
      materialMove: `Continue the existing ${unfinishedIsland.storyRole} chapter in place and visibly satisfy this exact finishing obligation: ${activeRequirement}`,
      whyThisTurn: "The compiler-owned lifecycle ledger still contains a prompt-critical obligation, so the next visible turn must finish it before whole-board completion.",
      completionRecommendation: "continue",
      completionRationale: "Completion remains pending until this exact committed obligation is visibly satisfied.",
      targetIsland: {
        action: "develop",
        islandId: unfinishedIsland.islandId,
        storyRole: unfinishedIsland.storyRole,
        resultingMaturity: remainingRequirements.length || unfinishedIsland.missingRequiredEvidenceIds.length ? "developing" : "resolved",
        resolutionRationale: remainingRequirements.length
          ? "This turn closes the next declared obligation while preserving the remaining finishing contract."
          : "This turn closes the final declared prompt-critical obligation in the existing chapter.",
        openRequirements: remainingRequirements,
      },
      targetTerritory: {
        ...brief.targetTerritory,
        relation: "within",
        anchorNodeId: unfinishedIsland.nodeId,
        placementMode: "attached",
        targetZoneId: unfinishedIsland.targetZoneId ?? brief.targetTerritory.targetZoneId,
      },
      remainingOpportunities: remainingRequirements,
      nextMoves: remainingRequirements.slice(0, 3),
    };
  }
  if (brief.completionRecommendation === "complete"
    && input.promptCoverageFailures?.length) {
    const missingCoverage = input.promptCoverageFailures[0];
    const placement = input.compactPlacementRequired === false
      ? undefined
      : compactCanvasV2NewIslandPlacement(
          input.designRegions ?? [],
          brief.targetTerritory.intendedFootprint,
          brief.targetTerritory.relation as CanvasV2TerritoryRelation,
          brief.targetTerritory.anchorNodeId,
        );
    return {
      ...brief,
      visualDiagnosis: missingCoverage,
      materialMove: `Create exactly one nearby, independently editable chapter for this semantic job: ${brief.currentSemanticJob}. Keep these later jobs out of the current source patch: ${brief.deferredSemanticJobs.join("; ") || "none declared"}.`,
      whyThisTurn: "The visible board still lacks exact user-requested content, so completion is converted into one concrete authorship turn rather than a provider retry.",
      completionRecommendation: "continue",
      completionRationale: "Completion remains pending until the requested content is visibly complete and usable.",
      authoredVisualRoles: ["prompt-critical-content", ...brief.authoredVisualRoles].slice(0, 3),
      targetIsland: {
        action: "create",
        islandId: input.allocatedIslandId,
        storyRole: "analysis",
        resultingMaturity: "resolved",
        resolutionRationale: "This chapter materially supplies the exact requested content that was absent from the verified board.",
        openRequirements: [],
      },
      targetTerritory: {
        ...brief.targetTerritory,
        relation: placement?.relation ?? "below",
        anchorNodeId: placement?.anchorNodeId ?? input.designRegions?.at(-1)?.nodeId ?? brief.targetTerritory.anchorNodeId,
        intendedFootprint: "A bounded prompt-critical chapter placed in the closest collision-free territory inside the compact narrative neighborhood.",
        placementMode: "evidence-relative-island",
        targetZoneId: placement?.targetZoneId ?? "bottom-center",
      },
      remainingOpportunities: brief.deferredSemanticJobs,
      nextMoves: brief.deferredSemanticJobs.map((job) => `After observing this committed chapter, create a separate territory for ${job}.`).slice(0, 5),
    };
  }
  if (brief.completionRecommendation === "complete" && input.firstSynthesisTurn) {
    return {
      ...brief,
      visualDiagnosis: "The requested canvas is still empty, so the first prompt-critical composition must be made visible before completion can be judged.",
      materialMove: `Create and resolve one bounded opening chapter for this exact semantic job: ${brief.currentSemanticJob}.`,
      whyThisTurn: "A rendered composition must exist before the runtime can judge whether the requested visual answer is complete.",
      completionRecommendation: "continue",
      completionRationale: "Observe the first committed composition, then conclude if no prompt-critical or rendered-integrity gap remains.",
      authoredVisualRoles: ["foundational-argument", ...brief.authoredVisualRoles.filter((role) => !/(?:title|orientation|thesis|framing|kicker)/i.test(role))].slice(0, 3),
      targetIsland: {
        action: "create",
        islandId: input.allocatedIslandId,
        storyRole: "analysis",
        resultingMaturity: "resolved",
        resolutionRationale: "The first bounded chapter directly communicates the requested outcome and is ready for rendered verification.",
        openRequirements: [],
      },
      targetTerritory: {
        ...brief.targetTerritory,
        relation: "below",
        anchorNodeId: brief.targetTerritory.anchorNodeId,
        intendedFootprint: "One compact prompt-critical composition in the nearest collision-free opening territory.",
        placementMode: "evidence-relative-island",
        targetZoneId: "top-left",
      },
      remainingOpportunities: [],
      nextMoves: [],
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
    if (brief.targetIsland.action === "recompose" && input.localIntegrityRepairTarget && !input.wholeBoardRecomposeRequested) {
      const target = input.localIntegrityRepairTarget;
      return {
        ...brief,
        visualDiagnosis: `One exact island has a deterministic rendered-integrity defect: ${brief.visualDiagnosis}`,
        materialMove: `Repair only the existing ${target.storyRole} island in place. ${brief.materialMove}`,
        whyThisTurn: "A local rendered defect must remain a local transaction; the verified placement and every unaffected island stay unchanged.",
        targetIsland: {
          action: "repair",
          islandId: target.islandId,
          storyRole: target.storyRole,
          resultingMaturity: "resolved",
          resolutionRationale: "The exact failing island is repaired without reopening or repositioning the rest of the board.",
          openRequirements: [],
        },
        targetTerritory: {
          ...brief.targetTerritory,
          relation: "within",
          anchorNodeId: target.nodeId,
          placementMode: "attached",
          targetZoneId: target.targetZoneId ?? brief.targetTerritory.targetZoneId,
        },
      };
    }
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
    const compactPlacement = !createsTitle && input.compactPlacementRequired !== false
      ? compactCanvasV2NewIslandPlacement(
          input.designRegions ?? [],
          brief.targetTerritory.intendedFootprint,
          brief.targetTerritory.relation as CanvasV2TerritoryRelation,
          brief.targetTerritory.anchorNodeId,
        )
      : undefined;
    return {
      ...brief,
      targetIsland: {
        ...brief.targetIsland,
        islandId: input.allocatedIslandId,
        // Creation is one atomic island transaction. Future chapters belong
        // to the board-level coverage ledger, not to this island's lifecycle.
        // Otherwise Challenge, Compare, Commit, and Decision can accidentally
        // become obligations of one Diverge root and force giant territories.
        resultingMaturity: "resolved",
        openRequirements: [],
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
          ...(compactPlacement ? {
            relation: compactPlacement.relation,
            anchorNodeId: compactPlacement.anchorNodeId,
            targetZoneId: compactPlacement.targetZoneId,
          } : {}),
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
    targetIsland: {
      ...brief.targetIsland,
      storyRole: existing.storyRole,
      openRequirements: reconcileCanvasV2OpenRequirements(existing.openRequirements, brief.targetIsland.openRequirements),
    },
    targetTerritory: {
      ...brief.targetTerritory,
      ...(existing.placementMode ? { placementMode: existing.placementMode } : {}),
      ...(existing.targetZoneId ? { targetZoneId: existing.targetZoneId } : {}),
    },
  };
}

function normalizeCanvasV2ExplicitSpatialRequest(
  brief: ReturnType<typeof parseCreativeDirectorBrief>,
  instruction: string,
  input: {
    allocatedIslandId: string;
    designRegions: readonly CanvasV2DesignRegionObservation[];
  },
): ReturnType<typeof parseCreativeDirectorBrief> {
  const authoritativeUserRequest = canvasV2AuthoritativeUserRequest(instruction);
  const explicitlyRequestsNewChapter = /\b(?:add|append|create|build|compose|make|place)\b[^.!?\n]{0,120}\b(?:island|chapter|composition|section|conclusion)\b|\b(?:island|chapter|composition|section|conclusion)\b[^.!?\n]{0,120}\b(?:below|after|beneath|next)\b/i.test(authoritativeUserRequest);
  if (brief.completionRecommendation === "complete" && explicitlyRequestsNewChapter) {
    const anchor = input.designRegions.at(-1)?.nodeId ?? brief.targetTerritory.anchorNodeId;
    const conclusionRequested = /\b(?:conclusion|conclude|final (?:read|judgment|recommendation|answer))\b/i.test(authoritativeUserRequest);
    return {
      ...brief,
      visualDiagnosis: "The user explicitly requested one additional visible chapter, so the verified board cannot complete before that chapter is committed and observed.",
      materialMove: `Create one bounded ${conclusionRequested ? "conclusion" : "prompt-critical"} island that directly executes this request: ${authoritativeUserRequest}`,
      currentSemanticJob: authoritativeUserRequest,
      deferredSemanticJobs: [],
      evidenceChoreography: `${brief.evidenceChoreography} Keep the complete canonical evidence rails untouched and place exact representative visual witnesses inside this new analytical chapter whenever the request asks for grounded evidence.`,
      authoredVisualRoles: [conclusionRequested ? "bounded-conclusion" : "prompt-critical-content", ...brief.authoredVisualRoles].slice(0, 3),
      whyThisTurn: "An explicit canvas authorship request is execution authority; whole-board completion cannot substitute for the requested visible change.",
      completionRecommendation: "continue",
      completionRationale: "Completion remains pending until the requested new chapter has been rendered and verified.",
      targetIsland: {
        action: "create",
        islandId: input.allocatedIslandId,
        storyRole: conclusionRequested ? "implication" : "analysis",
        resultingMaturity: "resolved",
        resolutionRationale: "This single bounded island completes the explicitly requested semantic job without reopening established chapters.",
        openRequirements: [],
      },
      targetTerritory: {
        ...brief.targetTerritory,
        relation: "below",
        anchorNodeId: anchor,
        intendedFootprint: "One bounded independently editable chapter directly below the existing authored story, with compact readable spacing and no overlap with canonical evidence.",
        placementMode: "evidence-relative-island",
        targetZoneId: "bottom-center",
      },
      remainingOpportunities: [],
      nextMoves: [],
    };
  }
  if (brief.completionRecommendation !== "continue" || brief.targetIsland.action !== "create") return brief;
  const separateSurfaceBeside = /\b(?:islands?|compositions?|chapters?|surfaces?|territories?)\b[^.!?\n]{0,100}\b(?:beside|next to)\b|\b(?:beside|next to)\b[^.!?\n]{0,100}\b(?:islands?|compositions?|chapters?|surfaces?|territories?)\b/i.test(authoritativeUserRequest);
  if (separateSurfaceBeside && brief.targetTerritory.relation !== "left" && brief.targetTerritory.relation !== "right") {
    const row = brief.targetTerritory.targetZoneId.split("-")[0];
    const relation = brief.targetTerritory.targetZoneId.endsWith("left") ? "left" : "right";
    return {
      ...brief,
      spatialDirection: `${brief.spatialDirection} Place the same approved composition ${relation} of its anchor in the nearest collision-free open territory.`,
      targetTerritory: {
        ...brief.targetTerritory,
        relation,
        placementMode: "evidence-relative-island",
        targetZoneId: `${row}-${relation}` as ReturnType<typeof parseCreativeDirectorBrief>["targetTerritory"]["targetZoneId"],
        rationale: `${brief.targetTerritory.rationale} The runtime preserves the explicit beside relationship without changing the creative move.`,
      },
    };
  }
  return brief;
}

/**
 * A deep evidence inquiry should become visible as several observed acts of
 * judgment, not one monolithic source-author payload. The harness owns that
 * cadence while the model still owns the visual language of each bounded
 * island. This applies only after complexity has emerged from the grounded
 * evidence; ordinary prompts retain their direct one-composition path.
 */
function normalizeCanvasV2ProgressiveComplexSynthesis(
  brief: ReturnType<typeof parseCreativeDirectorBrief>,
  input: {
    enabled: boolean;
    firstSynthesisTurn: boolean;
    allocatedIslandId: string;
    repairExecution?: CanvasV2IslandExecutionContract;
  },
): ReturnType<typeof parseCreativeDirectorBrief> {
  if (!input.enabled || !input.firstSynthesisTurn || input.repairExecution) return brief;
  const deferredSemanticJobs = Array.from(new Set([
    "Compare the representative evidence across the decision-relevant stages",
    "State the evidence-grounded executive implication and its honest boundary",
    ...brief.deferredSemanticJobs,
  ])).slice(0, 6);
  return {
    ...brief,
    visualDiagnosis: "The grounded source record is substantial enough to warrant progressive sensemaking. Establish the governing read first; do not collapse framing, comparison, and implication into one source-author transaction.",
    materialMove: "Create one compact governing thesis and scope island above or immediately adjacent to the grounded evidence. State what is being compared, the high-level distinction now visible, and the selection boundary in natural executive language. Do not author the stage comparison, screenshot matrix, detailed findings, implication, recommendation, or conclusion in this island.",
    currentSemanticJob: "Establish the governing thesis and scope for the grounded comparison",
    deferredSemanticJobs,
    evidenceChoreography: "Keep the complete canonical evidence rails visible and untouched as the working record. This opening island may use the exact grounded identity marks, but screenshot witnesses belong to the later observed comparison chapter.",
    evidenceSelections: brief.evidenceSelections.filter((selection) => selection.evidenceId.startsWith("icon:")),
    authoredVisualRoles: ["thesis-anchor"],
    whyThisTurn: "A concise framing judgment gives the user an immediate visible foothold while preserving the deeper evidence comparison and implication as later observed moves.",
    regressionRisk: "Do not let the opening island become a miniature complete report or duplicate the canonical evidence rails.",
    completionRecommendation: "continue",
    completionRationale: "Observe the governing thesis on the canvas before choosing the exact comparison structure from the rendered result.",
    completionSummary: "The grounded inquiry now has a clear governing thesis and scope; comparison and implication remain intentionally uncomposed until later observed turns.",
    targetIsland: {
      action: "create",
      islandId: input.allocatedIslandId,
      storyRole: "title",
      resultingMaturity: "resolved",
      resolutionRationale: "This bounded opening chapter resolves only the governing thesis and scope; analytical comparison and implication remain separate board-level jobs.",
      openRequirements: [],
    },
    targetTerritory: {
      ...brief.targetTerritory,
      relation: "above",
      intendedFootprint: "One compact 3,600 × 1,000px editorial opening with a deliberate headline, concise scope, and generous canvas-backed breathing room.",
      placementMode: "evidence-relative-island",
      targetZoneId: "top-center",
    },
    remainingOpportunities: deferredSemanticJobs,
    nextMoves: deferredSemanticJobs.map((job) => `After observing the opening thesis, create a separate independently editable territory to ${job.toLowerCase()}.`).slice(0, 5),
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

function visibleCanvasV2SourceCopy(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canvasV2RenderRepairMustPreserveSemanticCopy(failures: readonly string[]): boolean {
  return failures.length > 0 && failures.every((failure) => (
    /canvas-scale legibility floor|overlapping readable text|clips|overflow|inside the rendered canvas/i.test(failure)
    && !/relationship|missing evidence|not visibly rendered/i.test(failure)
  ));
}

function canvasV2EvidenceTagForIsland(islandId: string, handle: string, witnessGroup?: string): string {
  const stableHandle = handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grounded";
  const groupAttribute = witnessGroup ? ` data-canvas-v2-witness-group="${witnessGroup}"` : "";
  return `<img data-canvas-v2-node-id="${islandId}-evidence-${stableHandle}" data-canvas-v2-copy-evidence-handle="${handle}"${groupAttribute}>`;
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

function canvasV2DocumentContainsAnalysisEvidence(
  document: CanvasV2ArtifactDocument,
  evidenceId: string,
): boolean {
  return Array.from(document.html.matchAll(/<img\b([^>]*)>/gi)).some((match) => {
    const attributes = match[1];
    const role = /\bdata-canvas-v2-evidence-role\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const id = /\bdata-canvas-v2-evidence-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    return role === "analysis-copy" && id === evidenceId;
  });
}

function canvasV2IslandEvidenceWitnessGroup(
  document: CanvasV2ArtifactDocument,
  islandId: string,
  evidenceId: string,
): string | undefined {
  const islandRange = findCanvasV2SourceNodeRange(document.html, islandId);
  if (!islandRange) return undefined;
  const islandSource = document.html.slice(islandRange.start, islandRange.end);
  const witness = Array.from(islandSource.matchAll(/<img\b([^>]*)>/gi)).flatMap((match) => {
    const attributes = match[1];
    const id = /\bdata-canvas-v2-evidence-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const role = /\bdata-canvas-v2-evidence-role\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const nodeId = /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (id !== evidenceId || role !== "analysis-copy" || !nodeId) return [];
    const directGroup = /\bdata-canvas-v2-witness-group\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    return range ? [{ directGroup, range }] : [];
  })[0];
  if (!witness) return undefined;
  if (witness.directGroup) return witness.directGroup;
  return Array.from(islandSource.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)).flatMap((match) => {
    const group = /\bdata-canvas-v2-evidence-group\s*=\s*["']([^"']+)["']/i.exec(match[2])?.[1];
    const nodeId = /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(match[2])?.[1];
    const range = group && nodeId ? findCanvasV2SourceNodeRange(document.html, nodeId) : undefined;
    return group && range && witness.range.start >= range.openEnd && witness.range.end <= range.closeStart
      ? [{ group, span: range.end - range.start }]
      : [];
  }).sort((left, right) => left.span - right.span)[0]?.group;
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
  witnessGroupByEvidenceId?: ReadonlyMap<string, string>;
}): CanvasV2ArtifactRevision {
  const tags = input.evidenceIds.flatMap((evidenceId) => {
    const handle = input.evidenceHandleById.get(evidenceId);
    return handle ? [canvasV2EvidenceTagForIsland(input.islandId, handle, input.witnessGroupByEvidenceId?.get(evidenceId))] : [];
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
      evidenceIdByHandle: new Map(Array.from(input.evidenceHandleById, ([evidenceId, handle]) => [handle, evidenceId] as const)),
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
  validationPlanId?: string,
): CanvasV2ArtifactDocument {
  const range = findCanvasV2SourceNodeRange(document.html, brief.targetIsland.islandId);
  if (!range) return document;
  const opening = document.html.slice(range.start, range.openEnd);
  const attributes = [
    ["data-canvas-v2-story-role", brief.targetIsland.storyRole],
    ["data-canvas-v2-territory-relation", brief.targetTerritory.relation],
    ["data-canvas-v2-territory-anchor", brief.targetTerritory.anchorNodeId],
    ["data-canvas-v2-placement-mode", brief.targetTerritory.placementMode],
    ["data-canvas-v2-target-zone", brief.targetTerritory.targetZoneId],
    ...(validationPlanId ? [["data-canvas-v2-validation-id", validationPlanId] as const] : []),
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
    const escapedValue = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    normalizedOpening = normalizedOpening.replace(new RegExp(`\\s*${name}\\s*=\\s*["'][^"']*["']`, "ig"), "");
    normalizedOpening = normalizedOpening.replace(/>$/, ` ${name}="${escapedValue}">`);
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
  workingContext?: ReturnType<typeof parseCanvasV2WorkingContext>;
  preserveExistingCssLayers?: boolean;
  validationPlanId?: string;
}): CanvasV2EditDecision {
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new Error("The source author response must be an object.");
  const source = input.payload as Record<string, unknown>;
  parseCanvasV2EmergentDepthSignal(source.emergentDepth);
  if (source.decision !== "edit") throw new Error("The bounded source author must return decision=edit; completion belongs to the visual director.");
  const moveKind = source.moveKind;
  if (!["framing", "composition", "relationship", "analysis", "refinement"].includes(String(moveKind))) throw new Error("The bounded source author requires a valid moveKind.");
  // The compiler, not provider prose, owns the first visible lifecycle label.
  // A newly created title is the frame even when the author calls its styling
  // pass a refinement.
  const compiledMoveKind = input.brief.targetIsland.storyRole === "title"
    && input.brief.targetIsland.action === "create"
    ? "framing"
    : moveKind;
  const summary = requiredSourceAuthorText(source.summary, "a concise summary");
  const expectedVisualResult = requiredSourceAuthorText(source.expectedVisualResult, "an expected visual result");
  assertCanvasV2UserFacingLanguage(summary, "The source-author summary", input.instruction);
  assertCanvasV2UserFacingLanguage(expectedVisualResult, "The expected visual result", input.instruction);
  const existingTargetRegion = input.currentCompositionState?.regions.find((region) => (
    region.islandId === input.brief.targetIsland.islandId || region.nodeId === input.brief.targetIsland.islandId
  ));
  const cumulativeRequiredEvidenceIds = Array.from(new Set([
    ...(existingTargetRegion?.requiredEvidenceIds ?? []),
    ...input.brief.evidenceSelections.map((selection) => selection.evidenceId),
  ]));
  const witnessGroupByEvidenceId = new Map(input.brief.evidenceSelections.map((selection) => (
    [selection.evidenceId, selection.witnessGroup] as const
  )));
  const operations = normalizeCanvasV2SourcePatchHeadingHierarchy(
    parseCanvasV2SourcePatch(source.patch),
    input.brief.targetIsland.storyRole,
  );
  assertCanvasV2AuthoredPatchLanguage(operations, input.instruction);
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
    evidenceIdByHandle: new Map(Array.from(input.evidenceHandleById, ([evidenceId, handle]) => [handle, evidenceId] as const)),
    workingContext: input.workingContext,
    mergeExistingCssLayers: input.preserveExistingCssLayers,
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
    witnessGroupByEvidenceId,
  });
  const witnessReconciledDocument = reconcileCanvasV2WitnessOwnership({
    document: enforceCanvasV2TargetIslandMetadata(reconciledRevision.document, input.brief, input.validationPlanId),
    targetIslandId: input.brief.targetIsland.islandId,
    evidenceAssignments: input.brief.evidenceSelections.map(({ evidenceId, witnessGroup }) => ({ evidenceId, witnessGroup })),
  });
  const stageReconciledDocument = reconcileCanvasV2AuthoredStageEvidence({
    document: witnessReconciledDocument,
    targetIslandId: input.brief.targetIsland.islandId,
    authoredVisualRoles: input.brief.authoredVisualRoles,
    selectedEvidenceIds: cumulativeRequiredEvidenceIds,
  });
  const resultingDocument = normalizeCanvasV2ClaimedCanonicalFlowCounts(reconcileCanvasV2EvidenceRelativeIslandOrder({
    document: stageReconciledDocument,
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
    moveKind: compiledMoveKind,
    summary,
    expectedVisualResult,
    patch: { operations },
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
  const deferredJobFailures = input.brief.targetIsland.action === "create"
    ? validateCanvasV2DeferredSemanticJobIsolation({
        document: decision.document,
        islandId: input.brief.targetIsland.islandId,
        deferredSemanticJobs: input.brief.deferredSemanticJobs,
      })
    : [];
  if (islandFailures.length || deferredJobFailures.length) {
    throw new Error([...islandFailures, ...deferredJobFailures].join(" "));
  }
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
      workingContext: input.workingContext,
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
  const witnessOwnershipFailures = validateCanvasV2WitnessOwnershipContract({
    document: decision.document,
    targetIslandId: brief.targetIsland.islandId,
    evidenceAssignments: brief.evidenceSelections.map(({ evidenceId, witnessGroup }) => ({ evidenceId, witnessGroup })),
  });
  if (witnessOwnershipFailures.length) throw new Error(witnessOwnershipFailures.join(" "));
  const stageEvidenceFailures = validateCanvasV2AuthoredStageEvidenceContract({
    document: decision.document,
    authoredVisualRoles: brief.authoredVisualRoles,
    stagePlan: `${brief.materialMove} ${brief.currentSemanticJob} ${brief.evidenceChoreography}`,
    selectedScreenshotEvidenceCount: brief.evidenceSelections.filter((selection) => selection.scaleIntent !== "identity-mark").length,
  });
  if (stageEvidenceFailures.length) throw new Error(stageEvidenceFailures.join(" "));
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
  if (
    decision.decision === "edit"
    && decision.document.html === currentDocument.html
    && decision.document.css === currentDocument.css
  ) {
    throw new Error("A visible design turn must materially change the compiled canvas document. Return completion when the verified composition is finished; an unchanged source patch cannot create another model turn.");
  }
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

function canvasV2DesignEvidencePolicy(input: {
  instruction: string;
  researchMode?: CanvasV2ResearchMode;
  workingContext?: ReturnType<typeof parseCanvasV2WorkingContext>;
}): "available" | "required" | "exclude" {
  if (input.researchMode) return "required";
  if (/\b(without|no)\s+(?:account\s+)?(?:evidence|research|data)\b/i.test(input.instruction)) return "exclude";
  const selectedIds = new Set(input.workingContext?.selectedNodeIds ?? []);
  if (input.workingContext?.objects.some((object) => selectedIds.has(object.nodeId) && object.evidenceId)) return "available";
  if (/\b(evidence|research|data|metric|marketing|business|source|screenshot|journey|flow)\b/i.test(input.instruction)) return "available";
  return "exclude";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const localEvaluation = canvasV2LocalEvaluationEnabled();
  if (!user && !localEvaluation) return NextResponse.json({ error: "You must be signed in to use Canvas V2.", code: "invalid-request", retryable: false }, { status: 401 });
  try {
    const body = await request.json() as {
      instruction?: unknown;
      revision?: CanvasV2ArtifactRevision;
      observation?: CanvasV2RenderObservation;
      run?: {
        turn?: unknown;
        currentRunStepCount?: unknown;
        priorSteps?: unknown;
        creativeDirection?: unknown;
        spatialStrategy?: unknown;
        compositionState?: unknown;
        researchTargets?: unknown;
        researchMode?: unknown;
        modelSelection?: unknown;
        renderRepair?: unknown;
        privateRecovery?: unknown;
        workingContext?: unknown;
        discoveryState?: unknown;
        providerUsage?: unknown;
        attachments?: unknown;
      };
    };
    const attachments = parseCanvasV2ChatAttachments(body.run?.attachments);
    const attachedImages = canvasV2ChatImageAttachments(attachments);
    const attachedTexts = canvasV2ChatTextAttachments(attachments);
    const attachmentEvidence = canvasV2ChatAttachmentEvidence(attachments);
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 8_000) {
      return NextResponse.json({ error: "A valid design instruction is required.", code: "invalid-request", retryable: false }, { status: 400 });
    }
    if (!body.revision || !body.observation || body.observation.revisionId !== body.revision.id) {
      return NextResponse.json({
        error: "The current canvas could not be read. Please refresh the workspace and try again.",
        code: "server-unavailable",
        retryable: true,
      }, { status: 409 });
    }
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
    const currentRunStepCount = Math.max(0, Math.min(priorSteps.length, Math.floor(Number(body.run?.currentRunStepCount) || 0)));
    const currentRunRawSteps = currentRunStepCount > 0 && Array.isArray(body.run?.priorSteps)
      ? body.run.priorSteps.slice(-CANVAS_V2_MAX_CONTEXT_STEPS).slice(-currentRunStepCount)
      : [];
    const currentRunAcceptedMoves = currentRunRawSteps.flatMap((step) => {
      if (typeof step !== "object" || step === null) return [];
      const discoveryMove = (step as Record<string, unknown>).discoveryMove;
      if (typeof discoveryMove !== "object" || discoveryMove === null) return [];
      const rawCategories = (discoveryMove as Record<string, unknown>).sourceCategories;
      if (!Array.isArray(rawCategories)) return [];
      const sourceCategories = rawCategories.filter((entry): entry is CanvasV2DiscoverySourceCategory =>
        entry === "product" || entry === "marketing" || entry === "business" || entry === "external" || entry === "canvas");
      const move = discoveryMove as Partial<CanvasV2DiscoveryMove>;
      return sourceCategories.length
        && typeof move.id === "string"
        && typeof move.kind === "string"
        && typeof move.question === "string"
        && Array.isArray(move.targetNames)
        ? [{ ...move, sourceCategories } as CanvasV2DiscoveryMove]
        : [];
    });
    const renderRepair = compactCanvasV2RenderRepair(body.run?.renderRepair);
    const privateRecovery = compactCanvasV2PrivateRecovery(body.run?.privateRecovery);
    const workingContext = parseCanvasV2WorkingContext(body.run?.workingContext);
    const researchMode: CanvasV2ResearchMode | undefined = body.run?.researchMode === "evidence" || body.run?.researchMode === "synthesis"
      ? body.run.researchMode
      : undefined;
    const evidencePolicy = canvasV2DesignEvidencePolicy({ instruction, researchMode, workingContext });
    const renderRepairInstruction = canvasV2RenderRepairInstruction(renderRepair);
    const privateRecoveryInstruction = canvasV2PrivateRecoveryInstruction(privateRecovery);

    const modelSelection = parseCanvasV2ModelSelection(body.run?.modelSelection);
    const modelChain = canvasV2DesignModelChain(modelSelection);
    const modelProvider = canvasV2ProviderForModel(modelSelection);
    if (modelProvider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured for GPT-5.6 Luna.", code: "configuration", retryable: false }, { status: 500 });
    }
    if (modelProvider === "google" && !process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured for the selected Gemini model.", code: "configuration", retryable: false }, { status: 500 });
    }
    const modelContextPhase = renderRepair
      ? "verification"
      : workingContext?.scope === "selection"
        ? "revision"
        : researchMode
          ? "sensemaking"
          : "composition";
    let researchTargets = Array.isArray(body.run?.researchTargets)
      ? body.run.researchTargets.filter((target): target is string => typeof target === "string").slice(0, 12)
      : [];
    // Product research requirements and a discovery move's operational
    // targets are different namespaces. Keep the former stable for the
    // completion gate; a compose move may legitimately target an authored
    // island ID, which must never become a fictitious missing app/flow.
    let evidenceBridgeTargetNames = researchTargets;
    const tenantId = user ? await resolveAppDataTenantId(supabase, user.id) : undefined;
    const catalog = user && tenantId
      ? await loadAppDataCatalog(supabase, tenantId)
      : emptyCanvasV2LocalEvaluationCatalog();
    const suppliedDiscoveryState = body.run?.discoveryState && typeof body.run.discoveryState === "object"
      && (body.run.discoveryState as { schema?: unknown }).schema === CANVAS_V2_DISCOVERY_STATE_SCHEMA
      ? body.run.discoveryState as CanvasV2DiscoveryState
      : body.revision.discoveryState;
    const fallbackInterpretation: CanvasV2InquiryInterpretation = {
      relationship: suppliedDiscoveryState ? "continue" : "new",
      objective: instruction,
      desiredOutcome: instruction,
      framing: suppliedDiscoveryState?.framing ?? instruction,
      inquiryKind: researchMode ? "evidence-synthesis" : "direct-creation",
      evidenceNeed: researchMode ? "required" : "irrelevant",
      sourceCategories: researchMode
        ? Array.from(new Set(["canvas" as const, ...canvasV2EvidenceDomainsForInstruction(instruction).flatMap((domain) => domain === "mixed" ? ["product" as const, "marketing" as const, "business" as const] : [domain])]))
        : ["canvas"],
      materialUnknowns: researchMode ? ["Which authorized evidence materially answers the requested outcome?"] : [],
      completionCriteria: ["The accepted canvas directly addresses the user's requested outcome."],
      rationale: researchMode ? "The requested outcome materially depends on authorized account evidence." : "The requested outcome can be created directly without account evidence.",
    };
    const initialDiscoveryState = reconcileCanvasV2PresentedValidations(suppliedDiscoveryState ?? createCanvasV2DiscoveryState({
      interpretation: fallbackInterpretation,
      revisionId: body.revision.id,
      now: new Date().toISOString(),
    }), body.revision.document);
    const suppliedEvidencePackets = mergeCanvasV2EvidencePackets(
      body.revision.evidencePackets,
      attachmentEvidence.packets,
    );
    const uploadedEvidenceAssets = suppliedEvidencePackets
      .filter((packet) => packet.source.sourceType === "uploaded")
      .flatMap((packet) => packet.assets);
    const uploadedImageEvidenceAssets = uploadedEvidenceAssets.filter((asset) => asset.kind === "image");
    const humanImagePixelsMaterial = attachedImages.length > 0
      || /\b(?:image|images|screenshot|screenshots|upload|uploaded|attached|attachment|visual evidence)\b/i.test(instruction);
    const preDiscoveryGraph = syncCanvasV2DiscoveryGraph({
      previous: body.revision.discoveryGraph,
      revisionId: body.revision.id,
      updatedAt: body.revision.createdAt,
      document: body.revision.document,
      evidencePackets: suppliedEvidencePackets,
      humanInputs: initialDiscoveryState.humanInputs,
      sceneTransaction: body.revision.sceneTransaction,
    });
    let discoveryState = synchronizeCanvasV2DiscoveryState({
      state: initialDiscoveryState,
      graph: preDiscoveryGraph,
      workingContext,
      now: new Date().toISOString(),
    })!;
    let discoveryTransition: CanvasV2DiscoveryStateTransition | undefined;
    let discoveryDirectorAttempts: CanvasV2ProviderError["providerAttempts"] = [];
    let discoveryDirectorFallbackUsed = false;
    const deterministicProductResearch = researchMode
      ? nextCanvasV2RequiredResearch(buildCanvasV2ResearchCatalogIndex(
          catalog,
          instruction,
          { ...body.revision, discoveryGraph: preDiscoveryGraph, discoveryState },
          researchTargets,
          undefined,
          { requireProductEvidence: canvasV2ProductEvidenceRequestedForInstruction(instruction) },
        ))
      : undefined;
    const discoveryDirectorRequired = !renderRepair
      && !(workingContext?.scope === "selection" && workingContext.selectionPolicy === "modify")
      && discoveryState.evidenceNeed !== "irrelevant"
      && !deterministicProductResearch;
    if (deterministicProductResearch) {
      discoveryTransition = deterministicCanvasV2ProductResearchTransition(discoveryState, deterministicProductResearch);
      discoveryState = applyCanvasV2DiscoveryTransition({ state: discoveryState, transition: discoveryTransition, graph: preDiscoveryGraph, now: new Date().toISOString() });
      researchTargets = [
        `${deterministicProductResearch.appName} — ${deterministicProductResearch.flowName}`,
        ...researchTargets,
      ];
      evidenceBridgeTargetNames = researchTargets;
    } else if (!renderRepair && !discoveryDirectorRequired) {
      discoveryTransition = directCanvasV2CreationTransition(discoveryState);
      discoveryState = applyCanvasV2DiscoveryTransition({ state: discoveryState, transition: discoveryTransition, graph: preDiscoveryGraph, now: new Date().toISOString() });
    } else if (discoveryDirectorRequired) {
      const discoveryRevision = { ...body.revision, evidencePackets: suppliedEvidencePackets, discoveryGraph: preDiscoveryGraph, discoveryState };
      const discoveryContext = buildCanvasV2BoundedModelContext(discoveryRevision, body.observation, workingContext, {
        instruction,
        phase: "sensemaking",
        evidencePolicy,
        contextProfile: "discovery-director:sensemaking:compact",
        characterBudget: 18_000,
      });
      const discoveryReferenceCodec = buildCanvasV2DiscoveryModelReferenceCodec(preDiscoveryGraph, {
        evidenceAliases: [
          ...buildCanvasV2EvidenceCopyHandles(body.revision.document).map(({ handle, evidenceId }) => ({ alias: handle, evidenceId })),
          ...uploadedImageEvidenceAssets.map((asset, index) => ({ alias: canvasV2ChatAttachmentHandle(asset.id, index), evidenceId: asset.id })),
        ],
        currentHumanInputId: discoveryState.humanInputs.at(-1)?.id,
      });
      const discoveryStateForModel = discoveryReferenceCodec.encode(compactCanvasV2DiscoveryStateForModel(discoveryState));
      const discoveryModelContextForModel = discoveryReferenceCodec.encode(discoveryContext.discoveryModelContext);
      const discoveryRequestContext = {
        instruction,
        discoveryState: discoveryStateForModel ? {
          ...discoveryStateForModel,
          contract: `${discoveryStateForModel.contract} Evidence lineage is represented by short ref-NNN handles in this request. Copy handles exactly; never reconstruct internal IDs.`,
        } : discoveryStateForModel,
        discoveryModelContext: {
          ...discoveryModelContextForModel,
          contract: `${discoveryModelContextForModel.contract} Every supplied node id is a short ref-NNN handle. Use only those exact handles in evidenceNodeIds.`,
        },
        collaboration: compactDiscoveryCollaboration(workingContext),
        humanSuppliedTextEvidence: attachedTexts.map((attachment) => ({
          name: attachment.name,
          authority: "human-supplied",
          exactText: attachment.text,
        })),
        availableInternalSources: {
          product: compactDiscoveryProductAvailability(catalog, instruction, researchTargets),
          marketing: user && tenantId ? "Authorized account snapshots may be queried; absence is unknown until bounded retrieval." : "Unavailable in this session.",
          business: user && tenantId ? "Authorized account snapshots may be queried; absence is unknown until bounded retrieval." : "Unavailable in this session.",
          external: modelProvider !== "openai"
            ? "Unavailable for the selected model. Do not choose external."
            : "OpenAI web search is available for a bounded external research request when a precise unresolved gap has material information value. Do not repeat an unchanged request; the runtime will redirect duplicate searches to synthesis.",
          canvas: "The committed canvas, selected neighborhood, prior evidence, and human edits are available through the bounded context.",
        },
        recentAcceptedMoves: priorSteps.slice(-8),
        contract: "Choose one smallest material next move. Do not prescribe visual styling; the visual director owns how an accepted understanding is communicated. Ask the human only when one material judgment blocks responsible progress.",
      };
      const discoveryProvider = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
        models: modelChain,
        maxInvalidResponsesPerModel: CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
        requestSignal: request.signal,
        attemptRole: "discovery-director",
        validatePayload: (payload, model) => {
          const response = extractCanvasV2StructuredText(payload, model);
          if (!response) throw new Error("North Star's discovery director returned no next move.");
          const transition = constrainCanvasV2DelegatedComparisonClarification({
            transition: discoveryReferenceCodec.decodeTransition(parseCanvasV2DiscoveryTransition(JSON.parse(response), discoveryState)),
            instruction,
          });
          applyCanvasV2DiscoveryTransition({ state: discoveryState, transition, graph: preDiscoveryGraph, now: new Date().toISOString() });
        },
        requestForModel: (model, correction) => {
          const providerRequest = buildCanvasV2StructuredProviderRequest({
            model,
            system: CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM,
            // The router already performed the one multimodal read and placed
            // its grounded meaning in the authoritative instruction. The
            // discovery director operates on compact lineage and inquiry
            // state, preventing a second paid image pass before composition.
            parts: [{ text: JSON.stringify(discoveryRequestContext) }],
            schemaName: "canvas_v2_discovery_transition",
            schema: CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA,
            // Real product taxonomy IDs can be hundreds of characters and
            // appear in several lineage-bearing fields. Preserve the strict
            // schema without truncating otherwise valid discovery JSON.
            maxOutputTokens: 10_000,
            maxInputImages: 0,
            maxTextCharacters: 160_000,
            reasoningEffort: "low",
            temperature: 0.2,
            correction,
          });
          return { url: providerRequest.url, init: providerRequest.init, audit: providerRequest.audit };
        },
      });
      const response = extractCanvasV2StructuredText(discoveryProvider.payload, discoveryProvider.model);
      if (!response) throw invalidCanvasV2ProviderResponse("North Star's discovery director returned no next move.", discoveryProvider.attempts);
      discoveryTransition = constrainCanvasV2ExternalDiscoveryProgress({
        transition: constrainCanvasV2DelegatedComparisonClarification({
          transition: discoveryReferenceCodec.decodeTransition(parseCanvasV2DiscoveryTransition(JSON.parse(response), discoveryState)),
          instruction,
        }),
        acceptedMoves: currentRunAcceptedMoves,
      });
      discoveryState = applyCanvasV2DiscoveryTransition({ state: discoveryState, transition: discoveryTransition, graph: preDiscoveryGraph, now: new Date().toISOString() });
      discoveryDirectorAttempts = discoveryProvider.attempts;
      discoveryDirectorFallbackUsed = discoveryProvider.fallbackUsed;
      if (discoveryTransition.clarification) {
        return NextResponse.json({
          discoveryState,
          discoveryProgress: discoveryTransition.progress,
          discoveryQuestion: discoveryTransition.clarification,
          model: discoveryProvider.model,
          fallbackUsed: discoveryProvider.fallbackUsed,
          providerAttempts: discoveryProvider.attempts,
        });
      }
      if (discoveryTransition.move.targetNames.length) evidenceBridgeTargetNames = discoveryTransition.move.targetNames;
    }
    // Account retrieval belongs to the discovery turn, not every visual
    // refinement inside that turn. Re-fetching the same snapshots before each
    // model edit added latency without adding evidence. A later user turn has
    // a fresh step ledger and can retrieve again to discover a newer snapshot.
    const plannedAccountDomains = (discoveryTransition?.move.sourceCategories ?? [])
      .filter((category) => category === "marketing" || category === "business") as CanvasV2EvidenceDomain[];
    // Once the discovery director has chosen the next source categories, that
    // choice is authoritative. Falling back to keyword inference for an
    // external-only move could silently launch an unrelated account snapshot
    // query (for example because the web question contains "market") and add
    // latency without information value.
    const accountEvidenceDomains = discoveryTransition
      ? Array.from(new Set(plannedAccountDomains))
      : canvasV2EvidenceDomainsForInstruction(instruction);
    const plannedAccountEvidenceMissing = plannedAccountDomains.some((domain) => !body.revision!.evidencePackets?.some((packet) => (
      domain === "marketing" ? packet.kind === "marketing-signal" : packet.kind === "business-record"
    )));
    const shouldRetrieveAccountEvidence = Boolean(
      researchMode
      && accountEvidenceDomains.some((domain) => domain === "marketing" || domain === "business" || domain === "mixed")
      && !priorSteps.some((step) => step.kind === "research")
      && (!discoveryTransition || canvasV2DiscoveryMoveNeedsRetrieval(discoveryTransition.move) || plannedAccountEvidenceMissing),
    );
    const externalResearchRequest = discoveryTransition?.move.sourceCategories.includes("external")
      ? discoveryTransition.move.externalResearchRequest
      : undefined;
    if (externalResearchRequest && modelProvider !== "openai") {
      return NextResponse.json({
        error: "External discovery is currently available only with GPT-5.6 Luna. The committed canvas was preserved.",
        code: "configuration",
        retryable: false,
      }, { status: 409 });
    }
    const accountEvidencePromise = user && tenantId && shouldRetrieveAccountEvidence
      ? runCanvasV2EvidenceBridge({
          providers: [createCanvasV2AccountEvidenceProvider({
            supabase,
            tenantId,
            catalog,
            // createClient() is request-scoped. Use the authorized backend
            // identity so the short snapshot cache survives across requests
            // without ever crossing tenant boundaries.
            snapshotCacheScope: `supabase:${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "default"}`,
          })],
          request: {
            instruction,
            targetNames: evidenceBridgeTargetNames,
            domains: accountEvidenceDomains,
            continuationKeys: body.revision.evidencePackets?.map((packet) => packet.continuationKey).filter((value): value is string => Boolean(value)),
            limit: 24,
          },
        })
      : Promise.resolve({ packets: [], sources: [], providers: [], issues: [], providerAttempts: [] });
    const externalEvidencePromise = externalResearchRequest
      ? runCanvasV2EvidenceBridge({
          providers: [createCanvasV2OpenAIWebEvidenceProvider({
            model: modelSelection,
            requestSignal: request.signal,
          })],
          request: {
            instruction,
            targetNames: evidenceBridgeTargetNames,
            domains: ["external"],
            continuationKeys: body.revision.evidencePackets?.map((packet) => packet.continuationKey).filter((value): value is string => Boolean(value)),
            limit: externalResearchRequest.maxSources,
            externalResearchRequest,
          },
        })
      : Promise.resolve({ packets: [], sources: [], providers: [], issues: [], providerAttempts: [] });
    const [accountEvidenceBridge, externalEvidenceBridge] = await Promise.all([accountEvidencePromise, externalEvidencePromise]);
    const retrievedEvidenceBridge = {
      packets: mergeCanvasV2EvidencePackets(accountEvidenceBridge.packets, externalEvidenceBridge.packets),
      sources: Array.from(new Map([...accountEvidenceBridge.sources, ...externalEvidenceBridge.sources]
        .map((source) => [`${source.providerId}:${source.sourceId}`, source] as const)).values()),
      providers: [...accountEvidenceBridge.providers, ...externalEvidenceBridge.providers],
      issues: [...accountEvidenceBridge.issues, ...externalEvidenceBridge.issues],
      providerAttempts: [...accountEvidenceBridge.providerAttempts, ...externalEvidenceBridge.providerAttempts],
    };
    // Retrieval happens once per user turn for latency, but the result is
    // revision-owned discovery memory. Every later synthesis pass must retain
    // the packets already committed with the canonical flow; otherwise the
    // model sees product screenshots while silently losing the marketing and
    // business records that gave those screens meaning.
    const retrievedAndPersistedEvidencePackets = mergeCanvasV2EvidencePackets(
      body.revision.evidencePackets,
      retrievedEvidenceBridge.packets,
    );
    const persistedEvidencePackets = mergeCanvasV2EvidencePackets(
      retrievedAndPersistedEvidencePackets,
      attachmentEvidence.packets,
    );
    const evidenceBridge = {
      ...retrievedEvidenceBridge,
      packets: persistedEvidencePackets,
      sources: Array.from(new Map([
        ...persistedEvidencePackets.map((packet) => packet.source),
        ...retrievedEvidenceBridge.sources,
      ].map((source) => [`${source.providerId}:${source.sourceId}`, source] as const)).values()),
    };
    // The model context must be assembled after authorized account retrieval.
    // Building it before this merge made freshly retrieved marketing/business
    // evidence invisible until a later request and encouraged redundant title
    // or boundary work instead of grounded sensemaking.
    const mergedDiscoveryGraph = syncCanvasV2DiscoveryGraph({
      previous: body.revision.discoveryGraph,
      revisionId: body.revision.id,
      updatedAt: body.revision.createdAt,
      document: body.revision.document,
      evidencePackets: persistedEvidencePackets,
      humanInputs: discoveryState.humanInputs,
      sceneTransaction: body.revision.sceneTransaction,
    });
    discoveryState = synchronizeCanvasV2DiscoveryState({
      state: discoveryState,
      graph: mergedDiscoveryGraph,
      workingContext,
      now: new Date().toISOString(),
    })!;
    const discoveryRevision: CanvasV2ArtifactRevision = {
      ...body.revision,
      evidence: Array.from(new Map([...body.revision.evidence, ...uploadedEvidenceAssets].map((asset) => [asset.id, asset] as const)).values()),
      evidencePackets: persistedEvidencePackets,
      discoveryGraph: mergedDiscoveryGraph,
      discoveryState,
    };
    const modelContext = {
      instruction,
      revisionId: body.revision.id,
      revisionState: body.revision.state,
      ...buildCanvasV2BoundedModelContext(discoveryRevision, body.observation, workingContext, {
        instruction,
        phase: modelContextPhase,
        evidencePolicy,
        contextProfile: `visual-director:${modelContextPhase}:balanced`,
      }),
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
    const research = buildCanvasV2ResearchCatalogIndex(catalog, instruction, discoveryRevision, researchTargets, evidenceBridge, {
      requireProductEvidence: discoveryTransition
        ? discoveryTransition.move.sourceCategories.includes("product")
        : canvasV2ProductEvidenceRequestedForInstruction(instruction),
    });
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
    let decisionPolicy = canvasV2ResearchDecisionPolicy(research, researchMode, priorSteps, currentCreativeDirection);
    const requiredResearch = nextCanvasV2RequiredResearch(research);
    if (decisionPolicy.phase === "ground-required-evidence" && !requiredResearch) {
      decisionPolicy = {
        phase: "open-design",
        permittedDecisions: ["edit", "complete"],
        reason: "The requested authorized evidence is unavailable. Create useful boundary and next-action work from the latest healthy canvas without fabricating a finding.",
      };
    }
    const groundingRequired = decisionPolicy.phase === "ground-required-evidence";
    if (groundingRequired && requiredResearch) {
      const decision = deterministicResearchDecision({ ...requiredResearch, hasVisibleResearch: research.visibleFlowIds.length > 0 });
      const result = resolveCanvasV2ResearchDecision(catalog, decision, research.visibleFlowIds, research);
      return NextResponse.json({
        decision,
        research: result,
        // A mixed discovery move may retrieve a product flow and external or
        // account evidence in parallel. The flow is the visible transaction
        // for this turn, but every other validated packet must travel with the
        // candidate revision so the next observed turn can materialize a
        // promoted witness instead of silently discarding research memory.
        retrievedEvidencePackets: persistedEvidencePackets,
        researchStatus: canvasV2ResearchStatusForDecision(research, decision),
        discoveryState,
        discoveryProgress: discoveryTransition?.progress,
        model: "northstar-deterministic-research-director",
        fallbackUsed: discoveryDirectorFallbackUsed,
        providerAttempts: [...discoveryDirectorAttempts, ...retrievedEvidenceBridge.providerAttempts],
      });
    }
    const snapshotEvidencePackets = canvasV2EvidencePacketsNeedingMaterialization(
      body.revision.document,
      persistedEvidencePackets,
    ).filter((packet) => packet.source.sourceType !== "uploaded" || packet.presentation?.state === "candidate" || packet.presentation?.state === "promoted");
    if (snapshotEvidencePackets.length) {
      // Snapshot providers are already authoritative research. Commit their
      // native source objects through render-before-commit before spending a
      // model call on interpretation. The next observed turn receives the
      // packets as revision-owned discovery memory and can synthesize from
      // what is genuinely visible rather than context-only evidence.
      return NextResponse.json({
        snapshotEvidencePackets,
        researchStatus: canvasV2ResearchStatusForDecision(research),
        retrievedEvidencePackets: persistedEvidencePackets,
        discoveryState,
        discoveryProgress: discoveryTransition?.progress,
        model: "northstar-account-evidence-materializer",
        fallbackUsed: discoveryDirectorFallbackUsed,
        providerAttempts: discoveryDirectorAttempts,
        evidenceIssues: retrievedEvidenceBridge.issues,
      });
    }
    const image = modelImage(body.observation.screenshotDataUrl, "low", "whole-board-overview");
    if (workingContext?.scope === "selection" && workingContext.selectionPolicy === "modify") {
      if (!workingContext.editableNodeIds.length) {
        return NextResponse.json({
          error: "The selected objects are locked, hidden, missing, or otherwise not editable. North Star preserved the committed canvas.",
          code: "invalid-request",
          retryable: false,
        }, { status: 409 });
      }
      const creativeDirection = selectionCreativeDirection(instruction, currentCreativeDirectionState);
      const spatialStrategy = selectionSpatialStrategy(workingContext, currentSpatialStrategy);
      if (!renderRepair && priorSteps.some((step) => step.kind === "design")) {
        const completedDiscoveryState = discoveryState.evidenceNeed !== "irrelevant" && discoveryState.completion.materialOpenRequirements.length
          ? discoveryState
          : completeCanvasV2DiscoveryState({
              state: discoveryState,
              summary: `Updated only the selected object${workingContext.editableNodeIds.length === 1 ? "" : "s"} and preserved the surrounding canvas.`,
              graphRevisionId: discoveryRevision.discoveryGraph?.revisionId,
              now: new Date().toISOString(),
            });
        return NextResponse.json({
          decision: {
            schema: CANVAS_V2_DECISION_SCHEMA,
            decision: "complete",
            creativeDirection,
            spatialStrategy,
            compositionState: currentCompositionState,
            reflection: {
              observedResult: "The requested selected-object revision is committed and visible.",
              remainingOpportunity: "none",
              conceptRead: "The edit remains bounded to the explicit selection.",
              hierarchyRead: "The surrounding board hierarchy is preserved.",
              evidenceRead: "Unselected evidence and provenance remain unchanged.",
              relationshipRead: "Existing relationships remain attached and unchanged.",
              legibilityRead: "The edited selection is visible in its existing composition.",
              distinctivenessRead: "The revision inherits the board's established visual language.",
              nextMoveReason: "The bounded selection request is complete after one verified candidate.",
            },
            summary: `Updated only the selected object${workingContext.editableNodeIds.length === 1 ? "" : "s"} and preserved the surrounding canvas.`,
          },
          evidence: body.revision.evidence,
          researchStatus: canvasV2ResearchStatusForDecision(research),
          discoveryState: completedDiscoveryState,
          discoveryProgress: { stage: "concluding", label: "Revision complete", detail: "The requested selected-object change is committed and the surrounding canvas remains intact." },
          model: "northstar-selection-commit-verifier",
          fallbackUsed: discoveryDirectorFallbackUsed,
          providerAttempts: discoveryDirectorAttempts,
        });
      }
      const selectedSource = workingContext.editableNodeIds.map((nodeId) => ({
        nodeId,
        source: compactCanvasV2IslandSourceForModel(body.revision!, nodeId),
      })).filter((item) => item.source);
      const selectionRequestContext = {
        instruction,
        revisionId: body.revision.id,
        collaboration: modelContext.collaboration,
        selectedSource,
        sourceOutline: modelContext.source.htmlOutline,
        render: modelContext.render,
        discoveryModelContext: modelContext.discoveryModelContext,
        discoveryContextReceipt: modelContext.discoveryContextReceipt,
        discoveryContract: modelContext.discoveryContract,
        renderRepair,
      };
      const compileSelectionPayload = (payload: unknown) => compileTargetedSelectionDecision({
        payload,
        instruction,
        revision: body.revision!,
        workingContext,
        creativeDirection: currentCreativeDirectionState,
        spatialStrategy: currentSpatialStrategy,
        compositionState: currentCompositionState,
      });
      const selectionProvider = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
        models: modelChain,
        requestSignal: request.signal,
        maxInvalidResponsesPerModel: CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
        attemptRole: "source-author",
        validatePayload: (candidatePayload, model) => {
          const text = extractCanvasV2StructuredText(candidatePayload, model);
          if (!text) throw new Error("North Star selection editor returned no decision.");
          const decision = compileSelectionPayload(JSON.parse(text));
          const failures = [
            ...validateCanvasV2EvidenceContinuity(body.revision!.document, decision.document, body.revision!.evidence),
            ...validateCanvasV2ClaimedCanonicalFlowCounts(decision.document, body.revision!.evidence),
          ];
          if (failures.length) throw new Error(failures.join(" "));
        },
        requestForModel: (model, correction) => {
          const providerRequest = buildCanvasV2StructuredProviderRequest({
            model,
            system: TARGETED_SELECTION_AUTHOR_SYSTEM,
            parts: [
              { text: JSON.stringify(selectionRequestContext) },
              ...(correction ? [] : [
                { text: "Current rendered canvas overview:" } as CanvasV2ModelInputPart,
                { inlineData: image } as CanvasV2ModelInputPart,
              ]),
            ],
            schemaName: "canvas_v2_targeted_selection_patch",
            schema: SOURCE_AUTHOR_SCHEMA,
            maxOutputTokens: 8_000,
            maxInputImages: 1,
            maxTextCharacters: 160_000,
            reasoningEffort: "low",
            temperature: 0.2,
            correction,
          });
          return { url: providerRequest.url, init: providerRequest.init, audit: providerRequest.audit };
        },
      });
      try {
        const text = extractCanvasV2StructuredText(selectionProvider.payload, selectionProvider.model);
        if (!text) throw new Error("North Star selection editor returned no decision.");
        const decision = compileSelectionPayload(JSON.parse(text));
        return NextResponse.json({
          decision,
          evidence: body.revision.evidence,
          researchStatus: canvasV2ResearchStatusForDecision(research),
          discoveryState,
          discoveryProgress: discoveryTransition?.progress,
          model: selectionProvider.model,
          fallbackUsed: discoveryDirectorFallbackUsed || selectionProvider.fallbackUsed,
          providerAttempts: [...(discoveryDirectorAttempts ?? []), ...selectionProvider.attempts],
        });
      } catch (error) {
        throw invalidCanvasV2ProviderResponse(error instanceof Error ? error.message : "North Star returned an invalid selected-object revision.", selectionProvider.attempts);
      }
    }
    if (workingContext?.scope === "selection"
      && workingContext.selectionPolicy === "reference"
      && !renderRepair
      && priorSteps.some((step) => step.kind === "design")) {
      const creativeDirection = selectionCreativeDirection(instruction, currentCreativeDirectionState);
      const spatialStrategy: CanvasV2SpatialStrategy = {
        ...(currentSpatialStrategy ?? selectionSpatialStrategy(workingContext)),
        growthDirection: "stable",
        primaryAnchor: workingContext.selectedNodeIds.join(", "),
        currentAdjustment: "The one derived result is committed beside the unchanged selected references.",
        intentionalOverlaps: currentSpatialStrategy?.intentionalOverlaps ?? [],
      };
      const completedDiscoveryState = discoveryState.evidenceNeed !== "irrelevant" && discoveryState.completion.materialOpenRequirements.length
        ? discoveryState
        : completeCanvasV2DiscoveryState({
            state: discoveryState,
            summary: "Created one derived result beside the selected references and preserved the existing canvas.",
            graphRevisionId: discoveryRevision.discoveryGraph?.revisionId,
            now: new Date().toISOString(),
          });
      return NextResponse.json({
        decision: {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "complete",
          creativeDirection: { ...creativeDirection, unresolvedOpportunities: [], nextMoves: [] },
          spatialStrategy,
          compositionState: currentCompositionState,
          reflection: {
            observedResult: "One bounded derived result is visible beside the selected reference objects.",
            remainingOpportunity: "none",
            conceptRead: "The new work responds to the selected references without rewriting them.",
            hierarchyRead: "The surrounding board hierarchy and selected anchors are preserved.",
            evidenceRead: "Selected evidence pixels, provenance, and identities remain unchanged.",
            relationshipRead: "Existing relationships remain attached and the derived result is a separate native object.",
            legibilityRead: "The requested comparison or alternative is visible near its reference.",
            distinctivenessRead: "The result inherits the board's visual language without global restyling.",
            nextMoveReason: "The bounded reference request is complete after one verified candidate.",
          },
          summary: "Created one derived result beside the selected references and preserved the existing canvas.",
        },
        evidence: body.revision.evidence,
        researchStatus: canvasV2ResearchStatusForDecision(research),
        discoveryState: completedDiscoveryState,
        discoveryProgress: { stage: "concluding", label: "Focused result complete", detail: "The selected references remain intact and the requested derived work is now visible beside them." },
        model: "northstar-reference-commit-verifier",
        fallbackUsed: discoveryDirectorFallbackUsed,
        providerAttempts: discoveryDirectorAttempts,
      });
    }
    let context = {
      ...modelContext,
      researchMode,
      research,
      decisionPolicy,
      discoveryMove: discoveryTransition?.move,
      discoveryProgress: discoveryTransition?.progress,
      userFacingSensemaking: buildCanvasV2SensemakingPresentationBrief(discoveryState),
    };
    // Ordinary transform requests are authored compositions too. Previously
    // only research-design turns entered the visual-director phase, leaving a
    // direct empty-canvas prompt to invoke the source author without the
    // execution brief its validator requires.
    // Once required evidence is visible, every design request is synthesis —
    // including evidence-mode prompts that asked to inspect their sources.
    // Keeping the original routing label here skipped the visual director and
    // sent the source author into validation without an execution brief.
    const synthesisTurn = decisionPolicy.phase !== "ground-required-evidence";
    const observedDesignTurns = priorSteps.filter((step) => step.kind === "design").length;
    const islandRegistry = buildCanvasV2IslandRegistry({ observation: body.observation, compositionState: currentCompositionState });
    const explicitRequiredIndependentTerritoryCount = canvasV2RequiredIndependentTerritoryCount(instruction);
    const authoredIndependentTerritoryCount = islandRegistry.filter((island) => island.storyRole !== "title").length;
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
    const lastTwoCommittedIslandExecutions = committedIslandExecutions.slice(-2);
    const repeatedResolvedIslandRefinement = lastTwoCommittedIslandExecutions.length === 2
      && lastTwoCommittedIslandExecutions.every((execution) => (
        execution.target.islandId === lastCommittedIslandId
        && execution.target.resultingMaturity === "resolved"
        && ["develop", "enrich", "repair"].includes(execution.target.action)
      ));
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
    // A resolved title remains visible context, but it is no longer a writable
    // target for unrelated analytical work. Removing it from the provider enum
    // prevents an expensive invalid response instead of rejecting it later.
    const targetableExistingIslandIds = new Set(islandRegistry.filter((island) => (
      island.storyRole !== "title"
      || island.maturity !== "resolved"
      || island.openRequirements.length > 0
      || island.missingRequiredEvidenceIds.length > 0
      || instructionRequestsTitleAuthorship
      || repairExecution?.target.islandId === island.islandId
    )).map((island) => island.islandId));
    const asksForEvidenceLedComparison = canvasV2EvidenceLedComparisonRequested(instruction);
    const explicitVisualEvidenceRequested = /\b(?:exact|actual|representative|source[- ]linked|grounded)\s+(?:app\s+)?(?:screenshot|screenshots|screen|screens|image|images|icon|icons|visual evidence)\b/i.test(instruction)
      || /\b(?:screenshot|screenshots|screen evidence|visual evidence)\b[^.]{0,80}\b(?:provenance|source|evidence|inspect|show|use)\b/i.test(instruction);
    // Complexity is a property of the authoritative board record, not of the
    // bounded model projection. A relevance working set may intentionally omit
    // stable screenshot metadata from this call; that must never collapse a
    // substantial two-source comparison back into a monolithic direct turn.
    const authoritativeCanonicalScale = canvasV2CanonicalEvidenceScale(body.revision.document);
    const complexEvidenceSynthesis = canvasV2RequiresProgressiveEvidenceSynthesis({
      synthesisTurn,
      instruction,
      canonicalFlowCount: authoritativeCanonicalScale.flowCount,
      canonicalScreenCount: authoritativeCanonicalScale.screenCount,
    });
    // Complexity is discovered from the evidence actually available, not only
    // from imperative wording in the prompt. A large multi-source comparison
    // needs at least a comparison chapter and a separately observed
    // implication/conclusion chapter; a shallow or direct request retains the
    // one-composition path.
    const requiredIndependentTerritoryCount = Math.max(
      explicitRequiredIndependentTerritoryCount,
      complexEvidenceSynthesis ? 2 : 0,
    );
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
    const promptCoverageFailures = synthesisTurn && workingContext?.scope !== "selection"
      ? validateCanvasV2RequestedCompositionCoverage(body.revision.document, instruction)
      : [];
    const explicitRelationshipGeometryRequested = canvasV2InstructionExplicitlyRequestsRelationshipGeometry(instruction);
    const explicitWholeBoardRecompositionRequested = /\b(?:recompose|recomposition|rearrange (?:the )?(?:whole )?(?:board|canvas)|relayout (?:the )?(?:whole )?(?:board|canvas)|change (?:the )?(?:overall )?layout)\b/i.test(instruction);
    const existingRelationshipCount = body.observation.spatial.authoredRelationships?.length ?? 0;
    const explicitRelationshipRefinementRequested = turn === 1
      && existingRelationshipCount > 0
      && explicitRelationshipGeometryRequested
      && /\b(?:refine|improve|smooth|polish|restyle|adjust|edit|change|premium|precise)\b/i.test(instruction);
    const acceptedWholeBoardRecompositions = priorSteps.filter((step) => step.islandExecution?.target.action === "recompose").length;
    const resolvedStory = islandRegistry.length > 0
      && unfinishedIslands.length === 0
      && promptCoverageFailures.length === 0
      && authoredIndependentTerritoryCount >= requiredIndependentTerritoryCount;
    const requiredDiscoveryMove = discoveryTransition?.move;
    // Discovery owns whether accepted human findings require a visible canvas
    // mutation. A visual-director preference to finish or add optional polish
    // cannot override that executable product requirement.
    const requiresVisibleDiscoveryComposition = requiredDiscoveryMove?.visibleAction === "compose"
      && currentRunStepCount === 0
      && (requiredDiscoveryMove.kind === "design-validation" || requiredDiscoveryMove.kind === "integrate-validation");
    // Island lifecycle is a stronger convergence signal than elapsed turns.
    // Once the title and analytical story are resolved, immediately ask for a
    // whole-board final review instead of spending arbitrary development turns
    // on typography-only or line-box polish.
    // A precise human follow-up against existing connectors is an authorized
    // local integration task, even when the broader board was already ready
    // to complete. Do not turn that instruction into a speculative whole-board
    // polish loop, but do not silently discard it as repeated local work.
    const convergencePhase = requiresVisibleDiscoveryComposition
      ? "integration"
      : explicitRelationshipRefinementRequested
      ? "integration"
      : resolvedStory ? "final-review" : canvasV2ConvergencePhase(observedDesignTurns);
    const lateStageConvergence = synthesisTurn && (convergencePhase === "convergence" || convergencePhase === "final-review");
    // Endpoint geometry is an integration layer. The title plus one observed
    // endpoint/content pass is enough to establish stable geometry for either
    // an explicitly requested relationship system or an optional, model-chosen
    // connector. Existing relationships and exact hidden render repairs remain
    // editable immediately.
    const relationshipGeometryAllowed = Boolean(renderRepair)
      || existingRelationshipCount > 0
      || observedDesignTurns >= 2;
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
    const designRegionLegibilityFailures = validateCanvasV2RenderedDesignRegionLegibility(body.observation);
    const designRegionTerritoryFailures = validateCanvasV2RenderedDesignRegionTerritoryIntegrity(body.observation);
    const relationshipGeometryFailures = validateCanvasV2RenderedRelationshipGeometry(body.observation);
    const islandNarrativeFailures = validateCanvasV2RenderedIslandNarrativeIntegrity(body.observation, instruction);
    const renderedIntegrityFailures = [...analysisEvidenceScaleFailures, ...designRegionContentFailures, ...designRegionLegibilityFailures, ...designRegionTerritoryFailures, ...islandNarrativeFailures, ...relationshipGeometryFailures];
    const localIntegrityRepairTarget = canvasV2LocalIntegrityRepairTarget(
      body.observation.spatial.designRegions ?? [],
      renderedIntegrityFailures,
    );
    const renderedIntegrityInstruction = [
      renderRepairInstruction,
      privateRecoveryInstruction,
      renderedIntegrityFailures.length
        ? `Resolve this exact rendered-integrity problem before adding new visual structure: ${renderedIntegrityFailures.join(" ")} `
        : "",
    ].join("");
    const convergenceInstruction = [
      repeatedLocalWork
        ? `REPETITION REDIRECTION: The last three visible commits repeated substantially the same local work (${recentThreeDesignSteps.map((step) => step.summary).join(" | ")}). Do not rename or repeat that repair under another move kind. `
        : "",
      repeatedResolvedIslandRefinement
        ? "The same resolved island has already received two consecutive bounded refinements. Its lifecycle contract is closed unless a deterministic render or prompt-coverage failure now names a different exact defect; do not reopen it for further subjective polish. "
        : "",
      lateStageConvergence
        ? `This is ${convergencePhase} after ${observedDesignTurns} committed design edits, not another exploration phase. Reconcile the prompt against the complete render. Complete when the board is resolved; otherwise close one exact user-facing gap and prepare the next observed render for completion. A new evidence-relative island is justified only when that named prompt-critical information is genuinely absent and cannot be communicated clearly inside established territory. `
        : "",
      unfinishedIslands.length
        ? `The island lifecycle ledger still contains unfinished authored work: ${unfinishedIslands.map((island) => `${island.islandId} [${island.maturity}; open=${island.openRequirements.join(" | ") || "none"}; missing-evidence=${island.missingRequiredEvidenceIds.join(",") || "none"}]`).join("; ")}. These identities remain open across turns and cannot be globally marked resolved. `
        : "",
      requiredIndependentTerritoryCount > authoredIndependentTerritoryCount
        ? `INDEPENDENT TERRITORY CONTRACT: ${complexEvidenceSynthesis && explicitRequiredIndependentTerritoryCount < 2
            ? `the discovery harness found a substantial multi-source comparison that needs progressive materialization across at least ${requiredIndependentTerritoryCount} independently editable non-title territories`
            : `the user explicitly requires at least ${requiredIndependentTerritoryCount} independently editable non-title territories`}, and the committed canvas currently contains ${authoredIndependentTerritoryCount}. ${complexEvidenceSynthesis && firstSynthesisTurn ? "Begin with one compact governing thesis/title island; it does not consume either analytical territory." : ""} Resolve exactly one bounded semantic job in this turn. Do not nest, summarize, or precompose another required territory inside the current island. Until the required count is reached, name the next distinct territory in remainingOpportunities and nextMoves and do not claim one island completes the whole prompt. `
        : "",
      promptCoverageFailures.length && !firstSynthesisTurn
        ? `EXPLICIT PROMPT COVERAGE IS STILL ABSENT: ${promptCoverageFailures.join(" ")} A title, subtitle, orientation paragraph, or future-chapter promise cannot satisfy this requirement. Materialize the missing content as inspectable non-title analytical work before recommending completion. `
        : "",
      explicitRelationshipGeometryRequested && !relationshipGeometryAllowed
        ? "RELATIONSHIP STAGING: the user requested a relationship-led result, but this observed turn is still establishing its endpoint field. Prescribe only the independently editable endpoint territories, their hierarchy, spacing, and visual language. Do not prescribe or author connectors, SVG/path geometry, transition labels attached to connectors, feedback paths, or confidence-by-stroke in the same move. Retain the relationship integration as one exact open requirement for the next observed turn; creating endpoints and integrating their connector system are two separate material moves. "
        : "",
      explicitRelationshipRefinementRequested
        ? "EXACT HUMAN RELATIONSHIP REFINEMENT: make one bounded edit to the existing relationship system and preserve every endpoint object, all copy, hierarchy, styling, and placement outside those relationships. Target the existing relationship island, keep it resolved with no new open requirements, and do not convert this request into a whole-board recompose or completion-only response. "
        : "",
      resolvedStory && !requiresVisibleDiscoveryComposition && acceptedWholeBoardRecompositions > 0
        ? "A whole-board recompose has already been accepted and re-observed in this run. Do not open another subjective polish pass. Recommend completion now unless the supplied factual render contains one exact deterministic integrity failure. "
        : "",
      resolvedStory && !requiresVisibleDiscoveryComposition && existingRelationshipCount === 0 && !explicitRelationshipGeometryRequested
        ? "The user did not request connector or endpoint-dependent relationship geometry. Its absence is not a defect and cannot keep this resolved board alive. Preserve the model's existing visual language and complete unless a different exact prompt-critical or deterministic render blocker is visible. "
        : "",
      resolvedStory && !requiresVisibleDiscoveryComposition && !explicitWholeBoardRecompositionRequested && renderedIntegrityFailures.length === 0
        ? "Every requested deliverable is present, every island is resolved, and the committed render has no deterministic integrity failure. Do not risk a speculative whole-board recompose merely to try an alternative reading path, denser footprint, or different arrangement; recommend completion from this verified canvas. "
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
    // Visual context follows the same progressive semantic job as the canvas.
    // The title needs board shape, the comparison needs one readable atlas per
    // side, and later implication/review turns need one authored-island crop.
    // Never send all of those pixels to every stage.
    const railDetailsForDirector = complexEvidenceSynthesis
      ? firstSynthesisTurn
        ? []
        : observedDesignTurns === 1
          ? firstRailDetailPerLane(body.observation.railDetails ?? []).slice(0, 2)
          : []
      : selectedRailDetails.slice(0, 1);
    const designDetailsForDirector = complexEvidenceSynthesis && (firstSynthesisTurn || observedDesignTurns === 1)
      ? []
      : selectedDesignDetails.slice(0, 1);
    const railDetailParts: CanvasV2ModelInputPart[] = railDetailsForDirector.flatMap((detail) => [
      { text: `Labeled canonical evidence atlas: ${detail.label} (zero-based indices ${detail.startIndex}–${detail.endIndex}).` },
      { inlineData: modelImage(detail.screenshotDataUrl, "high", "canonical-evidence-detail") },
    ]);
    const designDetailParts: CanvasV2ModelInputPart[] = designDetailsForDirector.flatMap((detail) => [
      { text: `Readable authored design-region capture: ${detail.label} [node ${detail.nodeId}; ${detail.width}×${detail.height} canvas units; center ${detail.centerXShare},${detail.centerYShare}; area share ${detail.canvasAreaShare}; reading position ${detail.readingIndex}${detail.visualRole ? `; visual role ${detail.visualRole}` : ""}].` },
      { inlineData: modelImage(detail.screenshotDataUrl, "high", "focused-island") },
    ]);
    const designReferenceParts = synthesisTurn && firstSynthesisTurn && railDetailsForDirector.length === 0
      ? await loadNorthstarDesignReferenceParts()
      : [];
    // The source document is authoritative for copy handles. Bounded model
    // context intentionally omits or compacts optional fields, so deriving
    // executable handles from that projection can leave a visually grounded
    // turn with evidenceIds: [] even though the canonical rail is present.
    const authoritativeEvidenceCopyHandles = [
      ...buildCanvasV2EvidenceCopyHandles(body.revision.document),
      ...uploadedImageEvidenceAssets.map((asset, index) => ({
        handle: canvasV2ChatAttachmentHandle(asset.id, index),
        evidenceId: asset.id,
        nodeId: `human-supplied-image-${index + 1}`,
        laneIndex: -1,
        flowIndex: undefined as number | undefined,
      })),
    ];
    const creativeEvidenceIdByHandle = new Map(authoritativeEvidenceCopyHandles.map(({ handle, evidenceId }) => [handle, evidenceId] as const));
    const creativeEvidenceHandleById = new Map(Array.from(creativeEvidenceIdByHandle, ([handle, evidenceId]) => [evidenceId, handle] as const));
    const creativeEvidenceDirectory = context.canonicalEvidence.map((flow) => ({
      flowId: flow.flowId,
      laneNodeId: flow.laneNodeId,
      screenCount: flow.screenCount,
      identityAssets: flow.identityAssets.map(({ evidenceId, label, app, description }) => ({ evidenceHandle: creativeEvidenceHandleById.get(evidenceId), label, app, description })),
      screens: flow.screens.map(({ index, evidenceId, label, app, flow: screenFlow, screen }) => ({ index, evidenceHandle: creativeEvidenceHandleById.get(evidenceId), label, app, flow: screenFlow, screen })),
    }));
    const suppliedImageEvidenceDirectory = uploadedImageEvidenceAssets.map((asset, index) => ({
      evidenceHandle: canvasV2ChatAttachmentHandle(asset.id, index),
      label: asset.label,
      description: asset.description,
      mimeType: asset.mimeType,
      authority: "human-supplied",
      limitation: asset.limitations?.[0],
    }));
    const humanSuppliedVisualParts = firstSynthesisTurn && humanImagePixelsMaterial
      ? (attachedImages.length
          ? canvasV2ChatAttachmentModelParts(attachedImages, "low")
          : canvasV2UploadedEvidenceModelParts(uploadedImageEvidenceAssets, "low"))
        .slice(0, 2)
      : [];
    // The overview and selected detail crops are transported as image inputs
    // below. The text envelope carries only factual geometry and integrity;
    // serializing render pixels or the complete per-node inventory a second
    // time wastes long-context cache writes and can turn a healthy later turn
    // into a predictable preflight failure. This projection is deliberately
    // stage-owned and quality preserving: the director keeps the full
    // composition image, exact selected evidence crops, all authored-region
    // geometry, collision truth, and canonical integrity.
    const visualDirectorRender = {
      viewport: context.render.viewport,
      contentBounds: context.render.contentBounds,
      runtimeErrors: context.render.runtimeErrors,
      missingEvidenceIds: context.render.missingEvidenceIds,
      overflow: context.render.overflow,
      spatial: {
        measuredNodeCount: context.render.spatial.measuredNodeCount,
        notableIntersections: context.render.spatial.notableIntersections.slice(0, 24),
        contentOverflowNodeIds: context.render.spatial.contentOverflowNodeIds.slice(0, 40),
        analysisEvidenceGeometry: context.render.spatial.analysisEvidenceGeometry,
        authoredRelationships: context.render.spatial.authoredRelationships,
        authoredAnnotations: context.render.spatial.authoredAnnotations,
        authoredSurface: context.render.spatial.authoredSurface,
        canonicalEvidenceIntegrity: context.render.spatial.canonicalEvidenceIntegrity,
      },
    };
    const requiredVisualEvidenceForBrief = (brief: ReturnType<typeof parseCreativeDirectorBrief>) => {
      const groundedAnalyticalChapter = context.canonicalEvidence.some((flow) => flow.screens.some((screen) => creativeEvidenceHandleById.has(screen.evidenceId)))
        && ["evidence-reading", "analysis", "comparison", "finding", "implication", "synthesis"].includes(brief.targetIsland.storyRole);
      // A canonical screenshot rail is not merely prose context. Any authored
      // chapter that interprets that rail must carry the exact visual witnesses
      // it discusses, even when the person did not literally say "show the
      // screenshots". The explicit phrase remains useful for other story roles,
      // but evidence-reading may never degrade into SCREEN 3 / SCREEN 5 labels
      // beside empty or text-only columns.
      if ((!explicitVisualEvidenceRequested && !groundedAnalyticalChapter)
        || brief.completionRecommendation === "complete"
        || brief.targetIsland.storyRole === "title"
        || !["create", "develop", "enrich", "repair"].includes(brief.targetIsland.action)) return;
      const semanticTerms = new Set(normalizedMove([
        instruction,
        brief.materialMove,
        brief.evidenceChoreography,
      ].join(" ")).split(" ").filter((term) => term.length > 3));
      // Identity is derived from the authoritative source manifest rather than
      // the compact model context. The latter may omit identityAssets even
      // while the exact icon is already present in the canonical rail, which
      // previously forced a second visible repair just to replace an AWIN text
      // tile with the real icon.
      const identitySelections = Array.from(new Map(authoritativeEvidenceCopyHandles
        .filter((binding) => binding.laneIndex >= 0 && binding.flowIndex === undefined)
        .flatMap((binding) => {
          const asset = body.revision!.evidence.find((candidate) => candidate.id === binding.evidenceId);
          return asset ? [[binding.evidenceId, { asset, evidenceHandle: binding.handle }] as const] : [];
        })).values())
        .map(({ asset, evidenceHandle }) => ({
          evidenceHandle,
          evidenceId: asset.id,
          witnessGroup: canvasV2IslandEvidenceWitnessGroup(
            body.revision!.document,
            brief.targetIsland.islandId,
            asset.id,
          ) ?? "source-identities",
          roleInArgument: `${asset.app ?? asset.label} grounded app identity`,
          intendedTreatment: "Use the exact grounded app icon as a compact identity mark beside the analytical source label; never substitute a text tile, letter mark, or invented logo.",
          scaleIntent: "identity-mark" as const,
        }));
      // The model owns the authored witness count. The compiler only guarantees
      // one grounded visual witness per canonical lane when an analytical move
      // omitted that lane entirely. A fallback is a minimum completeness guard,
      // never a maximum or a substitute for the director's material selection.
      const directorSelectedEvidenceIds = new Set(brief.evidenceSelections.map((selection) => selection.evidenceId));
      const fallbackScreenSelections = context.canonicalEvidence.flatMap((flow) => {
        // A fallback fills an omitted comparison side; it is not an automatic
        // extra witness. Adding one screen to every already-covered lane made
        // a four-checkpoint brief carry five images per app, and the source
        // author correctly left the unsolicited fifth image outside its
        // choreography where the compiler rendered it as an orphaned inbox.
        if (flow.screens.some((screen) => directorSelectedEvidenceIds.has(screen.evidenceId))) return [];
        const ranked = flow.screens
          .flatMap((screen) => {
            const evidenceHandle = creativeEvidenceHandleById.get(screen.evidenceId);
            return evidenceHandle ? [{ screen, evidenceHandle }] : [];
          })
          .map(({ screen, evidenceHandle }) => {
            const candidate = normalizedMove([screen.label, screen.flow, screen.screen].filter(Boolean).join(" "));
            const score = Array.from(semanticTerms).reduce((total, term) => total + (candidate.includes(term) ? 1 : 0), 0);
            return { screen, evidenceHandle, score };
          })
          .sort((left, right) => right.score - left.score
            || (left.screen.index ?? Number.MAX_SAFE_INTEGER) - (right.screen.index ?? Number.MAX_SAFE_INTEGER));
        return ranked.slice(0, 1);
      });
      const existingTargetEvidenceIds = new Set(authoritativeEvidenceCopyHandles
        .map((binding) => binding.evidenceId)
        .filter((evidenceId) => canvasV2IslandContainsEvidence(
          body.revision!.document,
          brief.targetIsland.islandId,
          evidenceId,
        )));
      // A repair is a bounded correction, not another research-selection turn.
      // Once an analytical island owns its screenshot witnesses, keep that
      // exact set. Re-ranking on every private or visible repair used to append
      // unrelated first/last screens, creating duplicate mini-flows and extra
      // completion turns.
      const existingScreenSelections = context.canonicalEvidence.flatMap((flow) => flow.screens)
        .filter((screen) => existingTargetEvidenceIds.has(screen.evidenceId))
        .flatMap((screen) => {
          const evidenceHandle = creativeEvidenceHandleById.get(screen.evidenceId);
          return evidenceHandle ? [{ screen, evidenceHandle }] : [];
        });
      const screenSelections = brief.targetIsland.action === "repair" && existingScreenSelections.length
        ? existingScreenSelections
        : fallbackScreenSelections;
      const compiledScreenSelections = screenSelections
        .map(({ screen, evidenceHandle }) => ({
          evidenceHandle,
          evidenceId: screen.evidenceId,
          witnessGroup: canvasV2IslandEvidenceWitnessGroup(
            body.revision!.document,
            brief.targetIsland.islandId,
            screen.evidenceId,
          ) ?? `primary-${brief.targetIsland.storyRole}`,
          roleInArgument: `${screen.app ?? "Grounded"} screen ${screen.index}: ${screen.label}`,
          intendedTreatment: "Show this exact canonical screenshot at inspectable peer scale inside the analytical argument, with its observed wording and exact provenance directly adjacent.",
          scaleIntent: "peer" as const,
        }));
      brief.evidenceSelections = Array.from(new Map([
        // Mandatory grounded identity and per-lane coverage supplement the
        // director's complete material selection. The director's assignment is
        // last so its precise semantic witness group wins on duplicate IDs.
        ...identitySelections,
        ...compiledScreenSelections,
        ...brief.evidenceSelections.filter((selection) => (
          brief.targetIsland.action !== "repair"
          || existingTargetEvidenceIds.has(selection.evidenceId)
          || identitySelections.some((identity) => identity.evidenceId === selection.evidenceId)
        )),
      ].map((selection) => [selection.evidenceId, selection] as const)).values());
      if (brief.evidenceSelections.length) {
        const stripContradictoryCopyLanguage = (value: string) => value
          .replace(/\b(?:rather than|instead of|without)\s+(?:reproducing|copying|duplicating|showing)\s+(?:the\s+)?screenshots?\b[,.]?/gi, "")
          .replace(/\b(?:use|show)\s+(?:only\s+)?screen(?:-index)?\s+references?\s+(?:rather than|instead of)\s+(?:the\s+)?(?:actual\s+|exact\s+)?screenshots?\b[,.]?/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        const executableEvidenceDirective = "Render every compiler-bound evidence selection as its exact app icon or screenshot inside the semantic data-canvas-v2-evidence-group named by its witnessGroup. A SCREEN N label, prose citation, generic inbox, or detached thumbnail lane is not a visual substitute. Preserve the canonical source rail exactly once; these bounded analytical copies are evidence witnesses, not a duplicate flow.";
        brief.materialMove = `${stripContradictoryCopyLanguage(brief.materialMove)} ${executableEvidenceDirective}`.trim();
        brief.evidenceChoreography = `${stripContradictoryCopyLanguage(brief.evidenceChoreography)} ${executableEvidenceDirective}`.trim();
      }
    };
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
      [...targetableExistingIslandIds, allocatedIslandId, CANVAS_V2_WHOLE_BOARD_ISLAND_ID],
    );
    const visualCadence = firstSynthesisTurn
      ? complexEvidenceSynthesis
        ? {
          phase: "quick-visible-foundation",
          instruction: `${renderedIntegrityInstruction}${convergenceInstruction}This is a substantial grounded comparison, so progressive materialization is binding. Author only a compact governing thesis and scope island in this first visible synthesis turn. Do not build the stage comparison, screenshot matrix, detailed findings, implication, recommendation, or conclusion yet. Keep those as explicit deferred semantic jobs for later independently editable territories after this render is observed. The opening should feel useful and finished at its own scale—not like loading furniture—and should trust the canvas surface rather than wrapping the thesis in a generic card.`,
          suppliedContext: "The complete balanced canonical atlas is supplied for scope and thesis judgment. Detailed screenshot choreography belongs to the next observed comparison turn.",
        }
        : {
        phase: "quick-visible-foundation",
        instruction: `${renderedIntegrityInstruction}${convergenceInstruction}Commit the first prompt-critical chapter quickly. Let discoveryMove determine whether that chapter is framing, evidence reading, comparison, analysis, a decision surface, or another model-authored form; never create a generic title merely because this is the first visible turn. Give the new island a bounded collision-free footprint selected from the observed placement occupants and recommended open territories. Make it complete enough to communicate one material idea, preserve the canvas surface as the default visual field, and do not introduce SVG relationship geometry while its endpoint composition is still a scaffold. Declare distinct deeper moves only when the inquiry actually warrants them.`,
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
    const closeOptionalResolvedContinuation = (brief: ReturnType<typeof parseCreativeDirectorBrief>) => {
      if (requiresVisibleDiscoveryComposition) return brief;
      if (shouldCompleteCanvasV2ResolvedOptionalContinuation({
        resolvedStory,
        explicitWholeBoardRecompositionRequested,
        renderedIntegrityFailureCount: renderedIntegrityFailures.length,
        promptCoverageFailureCount: promptCoverageFailures.length,
        hasRenderRepair: Boolean(renderRepair),
        completionRecommendation: brief.completionRecommendation,
        targetAction: brief.targetIsland.action,
        targetStoryRole: brief.targetIsland.storyRole,
        instructionRequestsTitleAuthorship,
        explicitRelationshipGeometryRequested,
        prescribesOptionalRelationshipGeometry: canvasV2TextPrescribesRelationshipGeometry([
          brief.materialMove,
          brief.relationshipLogic,
          brief.visualVocabulary,
          ...brief.authoredVisualRoles,
          ...brief.remainingOpportunities,
          ...brief.nextMoves,
        ].join(" ")),
      })) {
        brief.completionRecommendation = "complete";
        brief.completionRationale = "The verified committed canvas already contains every requested deliverable with resolved lifecycle and render integrity; optional publication framing is not a blocker, and an optional alternative layout is not a completion blocker.";
        brief.completionSummary = userFacingCompletionSummary({ ...brief, completionSummary: "" });
        brief.targetIsland = {
          action: "complete",
          islandId: CANVAS_V2_WHOLE_BOARD_ISLAND_ID,
          storyRole: "whole-board",
          resultingMaturity: "unchanged",
          resolutionRationale: brief.completionRationale,
          openRequirements: [],
        };
        brief.targetTerritory = {
          ...brief.targetTerritory,
          relation: "none",
          placementMode: "attached",
        };
        brief.remainingOpportunities = [];
        brief.nextMoves = [];
      }
      return brief;
    };
    const requireVisibleDiscoveryComposition = (brief: ReturnType<typeof parseCreativeDirectorBrief>) => {
      if (!requiresVisibleDiscoveryComposition || !requiredDiscoveryMove) return brief;
      const existingTarget = requiredDiscoveryMove.kind === "integrate-validation"
        ? islandRegistry.find((island) => island.storyRole !== "title") ?? islandRegistry[0]
        : undefined;
      const targetIslandId = existingTarget?.islandId ?? allocatedIslandId;
      const targetStoryRole = existingTarget?.storyRole ?? "analysis";
      brief.completionRecommendation = "continue";
      brief.completionRationale = "Commit and observe the human-facing validation chapter required by the accepted discovery move before completing the inquiry.";
      brief.completionSummary = "The validation decision will be complete after the required human-facing update is visibly committed and verified.";
      brief.currentSemanticJob = requiredDiscoveryMove.kind === "integrate-validation"
        ? "show the supplied findings, how they changed the view, and the resulting decision"
        : "show the bounded human validation and its decision gate";
      brief.deferredSemanticJobs = [];
      brief.materialMove = requiredDiscoveryMove.kind === "integrate-validation"
        ? "Update the existing validation chapter with the exact human-supplied findings, the strengthened or changed view, and the resulting decision gate outcome. This must be a visible canvas change, not a completion-only response."
        : "Create the bounded human validation chapter selected by discovery, including its practical method, signals, and decision gate.";
      brief.spatialDirection = existingTarget
        ? "Preserve the chapter footprint and hierarchy while replacing its pending state with the supplied findings and decision outcome."
        : "Place one collision-free validation chapter in the next narrative territory after the current understanding.";
      brief.targetIsland = {
        action: existingTarget ? "enrich" : "create",
        islandId: targetIslandId,
        storyRole: targetStoryRole,
        resultingMaturity: "resolved",
        resolutionRationale: "The chapter visibly communicates the human-owned validation result and its decision consequence.",
        openRequirements: [],
      };
      brief.targetTerritory = {
        ...brief.targetTerritory,
        relation: existingTarget ? "within" : brief.targetTerritory.relation,
        anchorNodeId: existingTarget?.nodeId ?? brief.targetTerritory.anchorNodeId,
        placementMode: existingTarget?.placementMode ?? brief.targetTerritory.placementMode,
        targetZoneId: existingTarget?.targetZoneId ?? brief.targetTerritory.targetZoneId,
        rationale: existingTarget
          ? "The returned findings belong inside the durable validation chapter they resolve."
          : brief.targetTerritory.rationale,
      };
      brief.authoredVisualRoles = requiredDiscoveryMove.kind === "integrate-validation"
        ? ["human-findings", "decision-outcome"]
        : ["human-validation-plan", "decision-gate"];
      brief.visualVocabulary = requiredDiscoveryMove.kind === "integrate-validation"
        ? ["human-supplied findings", "threshold outcome emphasis", "editorial decision state"]
        : ["human-owned validation", "observable signals", "decision gate"];
      brief.compositionStrategy = existingTarget
        ? "Enrich the existing validation chapter in place so the plan, returned findings, and decision form one continuous readable record."
        : "Author one bounded validation chapter that reads from question to method to observable signals to decision gate.";
      brief.relationshipLogic = "Keep the supplied findings, the existing threshold, and the selected outcome together inside the same durable chapter.";
      brief.remainingOpportunities = [];
      brief.nextMoves = [];
      return brief;
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
    let targetedDiscoveryExpansionApplied = false;
    // Render repair is still the same uncommitted design transaction. Reuse
    // its validated visual-director checkpoint and ask only the bounded source
    // author to correct rejected geometry. Re-running creative direction here
    // lets candidate state masquerade as committed lifecycle state and causes
    // duplicate-title / unfinished-island contradictions.
    if (creativeDirectionTurn && !creativeCheckpointBrief) {
      const creativeBriefProvider = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
        models: modelChain,
        maxInvalidResponsesPerModel: CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
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
          `Authoritative writable islands: existing=${Array.from(targetableExistingIslandIds).join(", ") || "none"}; allocated-new=${allocatedIslandId}; whole-board=${CANVAS_V2_WHOLE_BOARD_ISLAND_ID}. Resolved title islands omitted from this writable list are read-only framing unless the user explicitly requested title work. Authoritative target zones: top-left, top-center, top-right, middle-left, middle-center, middle-right, bottom-left, bottom-center, bottom-right. Zones already carrying authored design regions: ${occupiedDesignZoneIds.join(", ") || "none"}. Zones currently crossed by canonical evidence: ${canonicalZoneIds.join(", ") || "none"}; choosing one requires real normal-flow reflow so the island is above/below/beside the complete evidence, never over it. Grounded evidence handles: ${Array.from(creativeEvidenceIdByHandle.keys()).slice(0, 80).join(", ")}. Exact existing anchor node IDs: ${exactSourceTargetNodeIds.slice(0, 80).join(", ")}.`,
        ].join("\n\n"),
        validatePayload: (payload, model) => {
          const brief = requireVisibleDiscoveryComposition(normalizeCanvasV2ExplicitSpatialRequest(normalizeCanvasV2ProgressiveComplexSynthesis(closeOptionalResolvedContinuation(normalizeCreativeDirectorExecutionContract(
            parseCreativeDirectorBrief(extractCanvasV2StructuredText(payload, model), creativeEvidenceIdByHandle),
            {
              islandRegistry,
              allocatedIslandId,
              repairExecution,
              designRegions: body.observation?.spatial.designRegions ?? [],
              promptCoverageFailures,
              compactPlacementRequired: !/\b(?:expansive|panoramic|gallery[- ]scale|wall[- ]scale|large[- ]scale)\b|\bspread\b[^.]{0,48}\bacross\b[^.]{0,32}\bcanvas\b|\bwide\b[^.]{0,24}\bcanvas\b/i.test(instruction),
              localIntegrityRepairTarget,
              wholeBoardRecomposeRequested: explicitWholeBoardRecompositionRequested,
              firstSynthesisTurn,
            },
          )), {
            enabled: complexEvidenceSynthesis,
            firstSynthesisTurn,
            allocatedIslandId,
            repairExecution,
          }), instruction, {
            allocatedIslandId,
            designRegions: body.observation?.spatial.designRegions ?? [],
          }));
          if (brief.requestedDiscoveryNodeIds.length) {
            const availableDiscoveryNodeIds = new Set([
              ...context.discoveryModelContext.onDemand.availableNodeIds,
              ...context.discoveryModelContext.stableReferences.map((reference) => reference.id),
            ]);
            const invalidNodeIds = brief.requestedDiscoveryNodeIds.filter((nodeId) => !availableDiscoveryNodeIds.has(nodeId));
            if (invalidNodeIds.length) {
              // An otherwise coherent visual decision must not be regenerated
              // because the model echoed a graph identity that was not offered
              // in the bounded expansion index. Drop only those clerical IDs;
              // exact offered requests below retain their on-demand path.
              brief.requestedDiscoveryNodeIds = brief.requestedDiscoveryNodeIds.filter((nodeId) => availableDiscoveryNodeIds.has(nodeId));
            }
            if (brief.requestedDiscoveryNodeIds.length && targetedDiscoveryExpansionApplied) {
              throw new Error("The requested discovery detail is already supplied. Return requestedDiscoveryNodeIds=[] and make the visual decision from the expanded context.");
            }
            if (brief.requestedDiscoveryNodeIds.length) {
              const expanded = buildCanvasV2BoundedModelContext(discoveryRevision, body.observation!, workingContext, {
              instruction,
              phase: modelContextPhase,
              evidencePolicy,
              contextProfile: `visual-director:${modelContextPhase}:expanded`,
              previousDiscoveryWorkingSet: context.discoveryWorkingSet,
              requestedDiscoveryNodeIds: brief.requestedDiscoveryNodeIds,
              characterBudget: 8_000,
              });
              context = { ...context, ...expanded };
              targetedDiscoveryExpansionApplied = true;
              throw new Error(`Targeted discovery detail is now supplied for ${brief.requestedDiscoveryNodeIds.join(", ")}. Rebuild the brief from that evidence and return requestedDiscoveryNodeIds=[].`);
            }
          }
          const projectedIndependentTerritoryCount = authoredIndependentTerritoryCount
            + (brief.targetIsland.action === "create" && brief.targetIsland.storyRole !== "title" ? 1 : 0);
          if (!renderRepair
            && requiredIndependentTerritoryCount > projectedIndependentTerritoryCount
            && !(complexEvidenceSynthesis && firstSynthesisTurn && brief.targetIsland.storyRole === "title")) {
            // The model has already supplied the creative choice that matters:
            // one current job and the later jobs it understood. If its prose
            // still summarizes the whole arc, narrow those redundant planning
            // fields deterministically instead of paying for a second visual-
            // director call before the source author can execute the decision.
            if (brief.targetIsland.action === "create"
              && brief.targetIsland.storyRole !== "title"
              && brief.deferredSemanticJobs.length >= requiredIndependentTerritoryCount - projectedIndependentTerritoryCount) {
              brief.materialMove = `Create and resolve exactly one bounded ${brief.currentSemanticJob} chapter. Keep every deferred job outside this source patch.`;
              brief.targetIsland.resolutionRationale = `This turn resolves only the ${brief.currentSemanticJob} job; every deferred job remains outside the island until a later observed transaction.`;
              brief.completionRecommendation = "continue";
              brief.completionRationale = `Observe the committed ${brief.currentSemanticJob} chapter before authoring the next independently editable job.`;
              brief.remainingOpportunities = [...brief.deferredSemanticJobs];
              brief.nextMoves = brief.deferredSemanticJobs.map((job) => `After observing this chapter, create a separate independently editable territory for ${job}.`).slice(0, 5);
            }
            const atomicPlanFailures = validateCanvasV2AtomicTerritoryPlan({
              requiredCount: requiredIndependentTerritoryCount,
              observedCount: authoredIndependentTerritoryCount,
              createsNonTitleTerritory: brief.targetIsland.action === "create" && brief.targetIsland.storyRole !== "title",
              action: brief.targetIsland.action,
              storyRole: brief.targetIsland.storyRole,
              currentSemanticJob: brief.currentSemanticJob,
              deferredSemanticJobs: brief.deferredSemanticJobs,
              materialMove: brief.materialMove,
              completionRationale: brief.completionRationale,
              resolutionRationale: brief.targetIsland.resolutionRationale,
              remainingOpportunities: brief.remainingOpportunities,
              nextMoves: brief.nextMoves,
            });
            if (atomicPlanFailures.length) {
              throw new Error(`This discovery plan requires ${requiredIndependentTerritoryCount} independently editable non-title territories, but this brief would leave only ${projectedIndependentTerritoryCount}. ${atomicPlanFailures.join(" ")}`);
            }
          }
          if (explicitRelationshipRefinementRequested
            && ["develop", "enrich", "repair"].includes(brief.targetIsland.action)
            && brief.targetIsland.storyRole === "relationship") {
            brief.targetIsland.resultingMaturity = "resolved";
            brief.targetIsland.openRequirements = [];
          }
          requiredVisualEvidenceForBrief(brief);
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
            // Committed-turn counts are observability, never execution
            // authority. Earlier versions rejected an otherwise executable
            // brief after three edits unless it closed a lifecycle item. That
            // made long-form, high-quality composition brittle and converted
            // an evaluation signal into another provider call. The exact open
            // requirements still remain compiler-owned and completion stays
            // blocked until they are satisfied; no arbitrary count may reject
            // the next material move.
          }
          if (!explicitRelationshipGeometryRequested) {
            const optionalGeometryRequirements = brief.targetIsland.openRequirements.filter(canvasV2TextPrescribesRelationshipGeometry);
            if (optionalGeometryRequirements.length) {
              throw new Error(`Connector and endpoint-dependent relationship geometry were not explicitly requested. They may remain an optional visual choice, but cannot become an island finishing obligation: ${optionalGeometryRequirements.join(" | ")}. Keep only prompt-critical open requirements.`);
            }
          }
          if (explicitRelationshipGeometryRequested
            && !relationshipGeometryAllowed
            && !renderRepair
            && canvasV2TextPrescribesRelationshipGeometry([
            brief.materialMove,
            brief.visualVocabulary,
            ...brief.authoredVisualRoles,
          ].join(" "))) {
            throw new Error("The user explicitly requested a relationship-led composition, but its stable endpoint territories do not yet exist. This visible turn may create and style those independently editable endpoints, but it may not also integrate connectors, SVG/path geometry, transition labels, feedback paths, or confidence-by-stroke. Retain the user's requested relationship integration as one exact open requirement for the next observed turn.");
          }
          // Repetition and diminishing returns are visual-direction context,
          // not structural invalidity. A director may legitimately revisit a
          // resolved island when the newly observed render reveals a real
          // hierarchy or evidence problem. The convergence instruction carries
          // the full ledger; only provenance, lifecycle truth, and render
          // safety can reject the response.
          if (brief.targetIsland.storyRole === "title") {
            if (brief.targetTerritory.placementMode === "interleaved" || brief.targetTerritory.placementMode === "recompose") {
              throw new Error(`Title island ${brief.targetIsland.islandId} must remain a bounded framing chapter outside canonical evidence.`);
            }
            if (brief.evidenceSelections.some((selection) => selection.scaleIntent !== "identity-mark")) {
              throw new Error(`Title island ${brief.targetIsland.islandId} cannot absorb screenshot-led comparison or analysis. Put that evidence in a separate story island.`);
            }
            if (brief.authoredVisualRoles.some((role) => !/(?:title|orientation|thesis|framing|kicker)/i.test(role))) {
              throw new Error(`Title island ${brief.targetIsland.islandId} may only carry title, orientation, thesis, framing, or kicker visual roles; use another story role for comparison or analysis.`);
            }
            const titleNeedsLifecycleWork = existingTargetIsland && (existingTargetIsland.maturity !== "resolved"
              || existingTargetIsland.openRequirements.length > 0
              || existingTargetIsland.missingRequiredEvidenceIds.length > 0);
            if (existingTargetIsland && !titleNeedsLifecycleWork && !renderRepair && !instructionRequestsTitleAuthorship) {
              throw new Error(`Title island ${existingTargetIsland.islandId} is already resolved as framing. Create or continue a separate story island for this non-title move.`);
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
          if (explicitRelationshipRefinementRequested && brief.completionRecommendation === "complete") {
            throw new Error("The user explicitly requested one bounded refinement of the existing relationship system. Execute that local relationship-island edit while preserving the resolved board; do not replace the requested edit with a completion-only response.");
          }
          if (brief.completionRecommendation === "continue" && islandAction === "complete") {
            throw new Error("A continuing brief must create, develop, enrich, repair, or recompose an island; it cannot use the complete island action.");
          }
          if (brief.completionRecommendation === "complete" && unfinishedIslands.length) {
            throw new Error(`Whole-board completion is blocked by unfinished island lifecycle state. Target and finish these exact islands before another completion review: ${unfinishedIslands.map((island) => `${island.islandId}${island.openRequirements.length ? ` [${island.openRequirements.join("; ")}]` : ""}${island.missingRequiredEvidenceIds.length ? ` [missing evidence: ${island.missingRequiredEvidenceIds.join(", ")}]` : ""}`).join(", ")}.`);
          }
          if (brief.completionRecommendation === "complete" && titleIslands.length > 1) {
            throw new Error(`Whole-board completion permits at most one title-and-description island; observed ${titleIslands.length}.`);
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
          // Foundation breadth, repetition redirection, and final-review focus
          // are advisory design intelligence. They deliberately remain in the
          // phase prompt instead of triggering a second provider call after a
          // structurally valid first response.
          if (renderRepair && brief.completionRecommendation === "complete") {
            throw new Error(`The uncommitted candidate failed rendered-integrity validation on repair pass ${renderRepair.attempt} of ${renderRepair.maxAttempts}. Prescribe the exact bounded repair before completion.`);
          }
          if (
            resolvedStory
            && !requiresVisibleDiscoveryComposition
            && acceptedWholeBoardRecompositions > 0
            && renderedIntegrityFailures.length === 0
            && !renderRepair
            && brief.completionRecommendation === "continue"
          ) {
            throw new Error("The resolved board has already accepted and re-observed its whole-board recompose with no deterministic integrity blocker. Return completion for the verified revision instead of opening another speculative polish turn.");
          }
          if (
            resolvedStory
            && !requiresVisibleDiscoveryComposition
            && existingRelationshipCount === 0
            && !explicitRelationshipGeometryRequested
            && renderedIntegrityFailures.length === 0
            && !renderRepair
            && brief.completionRecommendation === "continue"
            && canvasV2TextPrescribesRelationshipGeometry([
              brief.materialMove,
              brief.relationshipLogic,
              brief.visualVocabulary,
              ...brief.authoredVisualRoles,
              ...brief.remainingOpportunities,
              ...brief.nextMoves,
            ].join(" "))
          ) {
            throw new Error("The requested board is already resolved and contains no deterministic integrity failure. Do not add optional connector or endpoint-dependent relationship geometry as a new finishing pass; recommend completion or identify a different exact prompt-critical visible blocker.");
          }
          if (
            resolvedStory
            && !requiresVisibleDiscoveryComposition
            && repeatedLocalWork
            && !explicitRelationshipRefinementRequested
            && renderedIntegrityFailures.length === 0
            && !renderRepair
            && brief.completionRecommendation === "continue"
          ) {
            throw new Error("The resolved board has repeated the same local authored move across consecutive observed turns with no deterministic integrity blocker. Recommend completion now instead of reopening that visual detail under new wording.");
          }
          if (
            resolvedStory
            && !requiresVisibleDiscoveryComposition
            && repeatedResolvedIslandRefinement
            && !explicitRelationshipRefinementRequested
            && renderedIntegrityFailures.length === 0
            && promptCoverageFailures.length === 0
            && !renderRepair
            && brief.completionRecommendation === "continue"
          ) {
            throw new Error("The same resolved island has already received two consecutive bounded refinements and no objective blocker remains. Recommend completion instead of continuing subjective local polish.");
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
                  humanSuppliedImageEvidence: suppliedImageEvidenceDirectory,
                  humanSuppliedTextEvidence: attachedTexts.map((attachment) => ({
                    name: attachment.name,
                    authority: "human-supplied",
                    exactText: attachment.text,
                  })),
                  islandRegistry,
                  independentTerritoryContract: {
                    requiredCount: requiredIndependentTerritoryCount,
                    observedCount: authoredIndependentTerritoryCount,
                    projectedCountAfterCreate: authoredIndependentTerritoryCount + 1,
                  },
                  islandDevelopmentLedger,
                  canonicalEvidenceZoneIds: canonicalZoneIds,
                  allocatedNewIslandId: allocatedIslandId,
                  wholeBoardIslandId: CANVAS_V2_WHOLE_BOARD_ISLAND_ID,
                  authoritativeCanonicalFacts: canonicalFactLedger,
                  discoveryModelContext: context.discoveryModelContext,
                  discoveryContextReceipt: context.discoveryContextReceipt,
                  discoveryContract: context.discoveryContract,
                  render: visualDirectorRender,
                  visualCadence,
                  convergencePhase,
                  lateStageConvergence,
                  relationshipGeometryAllowed,
                  explicitRelationshipGeometryRequested,
                  acceptedWholeBoardRecompositions,
                  renderRepair,
                  privateRecovery,
                  repairExecutionContract: repairExecution,
                  phaseAuthority: `The current ${convergencePhase} phase changes review emphasis, not completion eligibility. Completion remains model-decided after factual, lifecycle, evidence, geometry, and whole-board reconciliation.`,
                }) },
                { text: "Current rendered canvas overview:" },
                { inlineData: image },
                ...(correction ? [] : humanSuppliedVisualParts.length ? [
                  { text: "Human-supplied image evidence. Use the directory handles when—and only when—an exact supplied image materially strengthens this island. Never redraw, approximate, or automatically place every attachment." },
                  ...humanSuppliedVisualParts,
                ] : [
                  ...railDetailParts,
                  ...designDetailParts,
                  ...designReferenceParts,
                ]),
            ],
            maxInputImages: 3,
            // This is a hard provider-safety ceiling, not a target and never a
            // user-facing workflow gate. The stage-owned projections above
            // keep normal requests far below it while preserving enough
            // headroom for unusually rich multi-source client canvases.
            maxTextCharacters: 360_000,
          });
          return { url: providerRequest.url, init: providerRequest.init, audit: providerRequest.audit };
        },
      });
      creativeCheckpointBrief = requireVisibleDiscoveryComposition(normalizeCanvasV2ExplicitSpatialRequest(normalizeCanvasV2ProgressiveComplexSynthesis(closeOptionalResolvedContinuation(normalizeCreativeDirectorExecutionContract(
        parseCreativeDirectorBrief(
          extractCanvasV2StructuredText(creativeBriefProvider.payload, creativeBriefProvider.model),
          creativeEvidenceIdByHandle,
        ),
        {
          islandRegistry,
          allocatedIslandId,
          repairExecution,
          // Preserve the same compiler-owned execution contract that passed
          // validatePayload. Re-normalizing the accepted raw provider payload
          // without rendered regions used to restore the model's unsafe raw
          // relation and discard the compact placement selected during
          // validation, leaving hidden CSS repairs unable to move the island.
          designRegions: body.observation?.spatial.designRegions ?? [],
          promptCoverageFailures,
          compactPlacementRequired: !/\b(?:expansive|panoramic|gallery[- ]scale|wall[- ]scale|large[- ]scale)\b|\bspread\b[^.]{0,48}\bacross\b[^.]{0,32}\bcanvas\b|\bwide\b[^.]{0,24}\bcanvas\b/i.test(instruction),
          localIntegrityRepairTarget,
          wholeBoardRecomposeRequested: explicitWholeBoardRecompositionRequested,
          firstSynthesisTurn,
        },
      )), {
        enabled: complexEvidenceSynthesis,
        firstSynthesisTurn,
        allocatedIslandId,
        repairExecution,
      }), instruction, {
        allocatedIslandId,
        designRegions: body.observation?.spatial.designRegions ?? [],
      }));
      // validatePayload works on a parsed copy. Reapply deterministic compiler
      // enrichments to the accepted execution object instead of throwing those
      // selections away when the provider payload is parsed a second time.
      // Without this, the director could correctly describe an exact icon and
      // screenshot while the source-author contract still received zero handles.
      if (explicitRelationshipRefinementRequested
        && ["develop", "enrich", "repair"].includes(creativeCheckpointBrief.targetIsland.action)
        && creativeCheckpointBrief.targetIsland.storyRole === "relationship") {
        creativeCheckpointBrief.targetIsland.resultingMaturity = "resolved";
        creativeCheckpointBrief.targetIsland.openRequirements = [];
      }
      requiredVisualEvidenceForBrief(creativeCheckpointBrief);
      creativeBriefAttempts = creativeBriefProvider.attempts;
      creativeBriefFallbackUsed = creativeBriefProvider.fallbackUsed;
      creativeBriefModel = creativeBriefProvider.model;
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
        ...promptCoverageFailures,
        ...analysisEvidenceScaleFailures,
        ...designRegionContentFailures,
        ...designRegionLegibilityFailures,
        ...designRegionTerritoryFailures,
        ...islandNarrativeFailures,
        ...relationshipGeometryFailures,
        ...validateCanvasV2RenderedComparisonCommunication(body.observation, instruction, { finalWholeBoard: true }),
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
        const completedDiscoveryState = completeCanvasV2DiscoveryState({
          state: discoveryState,
          summary: completion.summary,
          graphRevisionId: discoveryRevision.discoveryGraph?.revisionId,
          now: new Date().toISOString(),
          runtimeVerified: true,
        });
        return NextResponse.json({
          decision: { ...proposedCompletion, summary: completion.summary },
          evidence: body.revision.evidence,
          researchStatus: canvasV2ResearchStatusForDecision(research),
          discoveryState: completedDiscoveryState,
          discoveryProgress: { stage: "concluding", label: "Understanding resolved", detail: completion.summary },
          model: creativeBriefModel,
          fallbackUsed: discoveryDirectorFallbackUsed || creativeBriefFallbackUsed,
          providerAttempts: [...(discoveryDirectorAttempts ?? []), ...(creativeBriefAttempts ?? [])],
        });
      }
      const missingIdentitySelections = context.canonicalEvidence.flatMap((flow) => flow.identityAssets)
        .flatMap((asset) => {
          const evidenceHandle = creativeEvidenceHandleById.get(asset.evidenceId);
          return evidenceHandle && !canvasV2DocumentContainsAnalysisEvidence(body.revision!.document, asset.evidenceId)
            ? [{ asset, evidenceHandle }]
            : [];
        })
        .map(({ asset, evidenceHandle }) => ({
          evidenceHandle,
          evidenceId: asset.evidenceId,
          witnessGroup: "source-identities",
          roleInArgument: `${asset.app} grounded app identity`,
          intendedTreatment: "Place the exact grounded icon beside the existing app label inside the established analytical composition.",
          scaleIntent: "identity-mark" as const,
        }));
      const checkpointScreenEvidenceIds = new Set(creativeCheckpointBrief.evidenceSelections
        .filter((selection) => selection.scaleIntent !== "identity-mark")
        .map((selection) => selection.evidenceId));
      const missingLaneSelections = context.canonicalEvidence.flatMap((flow) => {
        if (flow.screens.some((screen) => checkpointScreenEvidenceIds.has(screen.evidenceId))) return [];
        const screen = flow.screens[0];
        const evidenceHandle = screen ? creativeEvidenceHandleById.get(screen.evidenceId) : undefined;
        return screen && evidenceHandle ? [{
          evidenceHandle,
          evidenceId: screen.evidenceId,
          witnessGroup: "completion-evidence",
          roleInArgument: `${screen.app ?? "Grounded"} minimum grounded comparison witness`,
          intendedTreatment: "Place this exact canonical screen at inspectable peer scale inside the claim it supports; this minimum lane witness supplements, and never replaces, the visual director's complete material evidence set.",
          scaleIntent: "peer" as const,
        }] : [];
      });
      // Completion repair must retain the director's complete witness contract.
      // The previous replacement branch discarded it whenever one identity or
      // fallback screen was missing, which produced sparse closing chapters.
      const completionRepairEvidenceSelections = Array.from(new Map([
        ...creativeCheckpointBrief.evidenceSelections,
        ...missingIdentitySelections,
        ...missingLaneSelections,
      ].map((selection) => [selection.evidenceId, selection] as const)).values());
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
        evidenceSelections: completionRepairEvidenceSelections,
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
      { inlineData: modelImage(focusedIslandDetail.screenshotDataUrl, "high", "focused-island") },
    ] : [];
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
    const witnessGroupByEvidenceId = new Map(creativeCheckpointBrief?.evidenceSelections.map((selection) => (
      [selection.evidenceId, selection.witnessGroup] as const
    )) ?? []);
    const sourceAuthorRevision = creativeCheckpointBrief && focusedIsland
      ? bindCanvasV2SelectedEvidenceToExistingIsland({
          revision: discoveryRevision,
          islandId: creativeCheckpointBrief.targetIsland.islandId,
          evidenceIds: newlyRequiredEvidenceIds,
          evidenceHandleById: creativeEvidenceHandleById,
          scaleIntentByEvidenceId,
          witnessGroupByEvidenceId,
        })
      : discoveryRevision;
    const sourceAuthorExistingIslandIds = canvasV2CommittedIslandIdsForSourceValidation(
      existingIslandIds,
      renderRepair ? repairExecution : undefined,
    );
    const sourceAuthorModelContext = buildCanvasV2BoundedModelContext(sourceAuthorRevision, body.observation, workingContext, {
      instruction,
      phase: renderRepair ? "revision" : "composition",
      evidencePolicy,
      contextProfile: `source-author:${renderRepair ? "revision" : "composition"}:compact`,
    });
    const focusedIslandSource = compactCanvasV2IslandSourceForModel(sourceAuthorRevision, focusedIsland?.nodeId);
    const sourceAuthorEditableNodeIds = Array.from(
      (focusedIslandSource ?? sourceAuthorModelContext.source.htmlOutline).matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi),
      (match) => match[1],
    ).filter((nodeId, index, all) => all.indexOf(nodeId) === index).slice(0, 180);
    const sourceAuthorTargetIslandId = creativeCheckpointBrief?.targetIsland.islandId;
    const sourceAuthorEvidenceIds = new Set(durableRequiredEvidenceIds);
    const sourceAuthorRender = {
      viewport: sourceAuthorModelContext.render.viewport,
      contentBounds: sourceAuthorModelContext.render.contentBounds,
      runtimeErrors: sourceAuthorModelContext.render.runtimeErrors,
      missingEvidenceIds: sourceAuthorModelContext.render.missingEvidenceIds,
      overflow: sourceAuthorModelContext.render.overflow,
      spatial: {
        measuredNodeCount: sourceAuthorModelContext.render.spatial.measuredNodeCount,
        notableIntersections: sourceAuthorModelContext.render.spatial.notableIntersections.slice(0, 20),
        contentOverflowNodeIds: sourceAuthorModelContext.render.spatial.contentOverflowNodeIds.slice(0, 30),
        analysisEvidenceGeometry: sourceAuthorModelContext.render.spatial.analysisEvidenceGeometry.filter((item) => (
          item.designRegionNodeId === sourceAuthorTargetIslandId
          || sourceAuthorEvidenceIds.has(item.evidenceId)
        )),
        authoredRelationships: sourceAuthorModelContext.render.spatial.authoredRelationships.slice(0, 24),
        authoredAnnotations: sourceAuthorModelContext.render.spatial.authoredAnnotations.slice(0, 24),
        authoredSurface: sourceAuthorModelContext.render.spatial.authoredSurface,
        canonicalEvidenceIntegrity: sourceAuthorModelContext.render.spatial.canonicalEvidenceIntegrity,
      },
    };
    const sourceAuthorRenderRepair = renderRepair ? {
      attempt: renderRepair.attempt,
      maxAttempts: renderRepair.maxAttempts,
      failures: renderRepair.failures.slice(-8),
      ...(renderRepair.failedMove ? { failedMove: renderRepair.failedMove } : {}),
      ...(renderRepair.islandExecution ? { islandExecution: renderRepair.islandExecution } : {}),
      contract: "Repair the exact private candidate supplied as focusedIslandSource. The full rejected render remains browser-owned; these failures and the focused geometry are the complete corrective authority.",
    } : undefined;
    const compilerBoundEvidenceHandles = newlyRequiredEvidenceIds.flatMap((evidenceId) => {
      const handle = creativeEvidenceHandleById.get(evidenceId);
      return focusedIsland && handle ? [handle] : [];
    });
    const requiredEvidenceTags = focusedIsland ? [] : newlyRequiredEvidenceIds.flatMap((evidenceId) => {
      const handle = creativeEvidenceHandleById.get(evidenceId);
      return handle ? [canvasV2EvidenceTagForIsland(
        creativeCheckpointBrief!.targetIsland.islandId,
        handle,
        witnessGroupByEvidenceId.get(evidenceId),
      )] : [];
    });
    const requestContext = {
      instruction,
      revisionId: body.revision.id,
      collaboration: sourceAuthorModelContext.collaboration,
      source: focusedIslandSource ? {
        ...sourceAuthorModelContext.source,
        // focusedIslandSource below is the lossless editable excerpt. Do not
        // duplicate the complete 42K board outline in an existing-island turn;
        // stable registry, render geometry, and editable IDs retain context.
        htmlOutline: `<canvas-v2-focused-source island="${creativeCheckpointBrief?.targetIsland.islandId ?? "unknown"}" editable-node-count="${sourceAuthorEditableNodeIds.length}">Use focusedIslandSource for exact editable markup; every other board object is preserved server-side.</canvas-v2-focused-source>`,
      } : sourceAuthorModelContext.source,
      // The visual director has already converted discovery memory into the
      // exact accepted execution brief below. Replaying the graph, state, and
      // move to the source author is both wasteful and ambiguous: it invites
      // a second planning pass instead of faithful visual execution. Preserve
      // the natural-language meaning plus the complete grounded packets,
      // canonical facts, render geometry, source, and exact evidence handles.
      userFacingSensemaking: buildCanvasV2SensemakingPresentationBrief(discoveryState),
      groundedEvidencePackets: sourceAuthorModelContext.groundedEvidencePackets,
      humanSuppliedTextEvidence: attachedTexts.map((attachment) => ({
        name: attachment.name,
        authority: "human-supplied",
        exactText: attachment.text,
      })),
      render: sourceAuthorRender,
      authoritativeCanonicalFacts: canonicalFactLedger,
      authoritativeFactInstruction: "These app-to-flow screen counts are exact and app-specific. Never copy one app's count into another app's label, prose, annotation, summary, or completion response.",
      visualCadence,
      convergencePhase,
      renderRepair: sourceAuthorRenderRepair,
      privateRecovery,
      relationshipGeometryAllowed,
      islandRegistry,
      independentTerritoryContract: {
        requiredCount: requiredIndependentTerritoryCount,
        observedCount: authoredIndependentTerritoryCount,
        projectedCountAfterThisTurn: authoredIndependentTerritoryCount + (
          creativeCheckpointBrief?.targetIsland.action === "create"
          && creativeCheckpointBrief.targetIsland.storyRole !== "title"
            ? 1
            : 0
        ),
      },
      focusedIslandSource,
      ...(creativeCheckpointBrief ? {
        executionContract: {
          targetIsland: creativeCheckpointBrief.targetIsland,
          ...(renderRepair ? {
            repairMode: repairExecution?.target.action === "recompose"
              ? "retry-whole-board-from-committed-source"
              : "repair-existing-uncommitted-candidate",
          } : {}),
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
          evidenceSelections: creativeCheckpointBrief.evidenceSelections.map(({ evidenceHandle, witnessGroup, roleInArgument, intendedTreatment, scaleIntent }) => ({ evidenceHandle, witnessGroup, roleInArgument, intendedTreatment, scaleIntent })),
        },
      } : {}),
    };
    const provider = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
      models: modelChain,
      maxInvalidResponsesPerModel: CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
      requestSignal: request.signal,
      attemptRole: "source-author",
      repairContextForAttempt: ({ repairAttempt }) => renderRepair
        ? repairExecution?.target.action === "recompose"
          ? `This is hidden whole-board render repair pass ${renderRepair.attempt}, not a new design turn. The supplied source is public committed truth because rejected recompose CSS was discarded. Keep the preserved visual-director checkpoint unchanged, target the exact visible body-level island IDs, and author one clean finite recomposition. Never target canvas-root or reproduce a rejected CSS layer. Exact rendered failures: ${renderRepair.failures.join(" ")}`
          : `This is hidden render repair pass ${renderRepair.attempt}, not a new design turn. Keep the preserved visual-director checkpoint unchanged and correct the exact rejected candidate island ${creativeCheckpointBrief?.targetIsland.islandId} in place. The create transaction already exists in focusedIslandSource; never append a duplicate. Exact rendered failures: ${renderRepair.failures.join(" ")}`
        : repairAttempt === 1
          ? `Keep the visual-director move unchanged. Correct the rejected patch for island action ${creativeCheckpointBrief?.targetIsland.action} on exact island ${creativeCheckpointBrief?.targetIsland.islandId}. Compiler-bound evidence handles: ${compilerBoundEvidenceHandles.join(", ") || "none"}. Create-only required evidence tags: ${requiredEvidenceTags.join(" ") || "none"}. For an existing island, compose the bound nodes, append or replace one evidence-free child, and never replace its root.`
          : `Reconstruct the minimal six-field source response, including the private adaptive-depth judgment. Island action: ${creativeCheckpointBrief?.targetIsland.action}; exact island ID: ${creativeCheckpointBrief?.targetIsland.islandId}. Existing committed island IDs: ${Array.from(sourceAuthorExistingIslandIds).join(", ") || "none"}. The compiler owns relation, placement, zone, and stable identity. For an existing island, it also owns all selected evidence; never reproduce evidence tags or replace the island root. For create only, include these exact tags: ${requiredEvidenceTags.join(" ") || "none"}. Required visual roles: ${creativeCheckpointBrief?.authoredVisualRoles.join(", ") || "none"}.`,
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
          workingContext,
          validationPlanId: discoveryTransition?.move.kind === "design-validation"
            ? discoveryState.validationBacklog.at(-1)?.id
            : undefined,
          // Every design turn is a delta over committed visual truth. Models
          // occasionally reuse an existing layer ID for one small override;
          // replacing that whole layer silently strips the rest of the
          // established type system before render validation. Preserve the
          // complete prior layer and append the new rules on ordinary turns as
          // well as hidden repair passes.
          preserveExistingCssLayers: true,
        });
        validateCanvasV2CreativeArc(decision, decisionPolicy, creativeDirectionTurn);
        validateCanvasV2CreativeBriefExecution(decision, creativeCheckpointBrief);
        validateCanvasV2DecisionComposition(decision, currentCompositionState, body.revision!.document);
        if (
          renderRepair
          && canvasV2RenderRepairMustPreserveSemanticCopy(renderRepair.failures)
          && visibleCanvasV2SourceCopy(sourceAuthorRevision.document.html) !== visibleCanvasV2SourceCopy(decision.document.html)
        ) {
          throw new Error("This hidden render repair may correct styling and geometry only. Preserve the candidate's complete visible copy exactly; semantic coverage belongs to a later observed design turn.");
        }
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
          schema: ADAPTIVE_SOURCE_AUTHOR_SCHEMA,
          maxOutputTokens: 12_000,
          maxInputImages: 2,
          maxTextCharacters: 180_000,
          reasoningEffort: "low",
          temperature: 0.44,
          correction,
          parts: [
            { text: JSON.stringify(requestContext) },
            ...(correction ? [] : [
              { text: "Current rendered canvas overview:" } as CanvasV2ModelInputPart,
              { inlineData: image } as CanvasV2ModelInputPart,
              ...focusedIslandDetailParts,
            ]),
          ],
        });
        return { url: providerRequest.url, init: providerRequest.init, audit: providerRequest.audit };
      },
    });
    const providerAttempts = [...(discoveryDirectorAttempts ?? []), ...retrievedEvidenceBridge.providerAttempts, ...(creativeBriefAttempts ?? []), ...provider.attempts];
    const fallbackUsed = discoveryDirectorFallbackUsed || creativeBriefFallbackUsed || provider.fallbackUsed;
    const payload = provider.payload;
    try {
      const text = extractCanvasV2StructuredText(payload, provider.model);
      if (!text) throw new Error("Canvas V2 model returned no decision.");
      if (!creativeCheckpointBrief) throw new Error("The source author cannot run without an observed visual-director brief.");
      const sourcePayload = JSON.parse(text) as Record<string, unknown>;
      const decision = compileSourceAuthorDecision({
        payload: sourcePayload,
        brief: creativeCheckpointBrief,
        instruction,
        revision: sourceAuthorRevision,
        transactionBaseDocument: body.revision.document,
        currentCompositionState,
        scaleIntentByEvidenceId,
        evidenceHandleById: creativeEvidenceHandleById,
        existingIslandIds: sourceAuthorExistingIslandIds,
        workingContext,
        validationPlanId: discoveryTransition?.move.kind === "design-validation"
          ? discoveryState.validationBacklog.at(-1)?.id
          : undefined,
        preserveExistingCssLayers: true,
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
      const adaptiveDiscoveryState = renderRepair
        ? discoveryState
        : applyCanvasV2EmergentDepthSignal({
            state: discoveryState,
            signal: parseCanvasV2EmergentDepthSignal(sourcePayload.emergentDepth),
            now: new Date().toISOString(),
          });
      const visibleAttachmentAssets = uploadedEvidenceAssets.filter((asset) => (
        decision.document.html.includes(`data-canvas-v2-evidence-id="${asset.id}"`)
        || decision.document.html.includes(`data-canvas-v2-evidence-id='${asset.id}'`)
      ));
      return NextResponse.json({
        decision,
        evidence: Array.from(new Map([...body.revision.evidence, ...visibleAttachmentAssets].map((asset) => [asset.id, asset] as const)).values()),
        evidencePackets: persistedEvidencePackets,
        researchStatus: canvasV2ResearchStatusForDecision(research),
        discoveryState: adaptiveDiscoveryState,
        discoveryProgress: discoveryTransition?.progress,
        model: provider.model,
        fallbackUsed,
        providerAttempts,
      });
    } catch (error) {
      throw invalidCanvasV2ProviderResponse(error instanceof Error ? error.message : "Canvas V2 returned an invalid design decision.", provider.attempts);
    }
  } catch (error) {
    if (error instanceof CanvasV2ProviderError) {
      const failure = canvasV2ProviderErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("[canvas-v2] unexpected design route failure", error);
    }
    return NextResponse.json({
      error: "North Star’s design service could not complete this request. Your latest canvas is unchanged.",
      code: "server-unavailable",
      retryable: true,
    }, { status: 500 });
  }
}
