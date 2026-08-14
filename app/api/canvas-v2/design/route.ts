import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@/lib/supabase/server";
import { parseCanvasV2DesignDecision } from "@/lib/canvas-v2/model-response";
import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2ArtifactRevision,
  type CanvasV2ResearchDecision,
  type CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";
import { CANVAS_V2_MAX_CONTEXT_STEPS } from "@/lib/canvas-v2/design-loop";
import { loadAppDataCatalog, resolveAppDataTenantId } from "@/lib/app-data/canvas-v2-catalog";
import { NORTHSTAR_V2_ARTBOARD_GRAMMAR } from "@/lib/canvas-v2/northstar-artboard-grammar";
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
  validateCanvasV2QuantitativeClaimLabels,
  validateCanvasV2RequestedAnalysisEvidenceUsage,
  validateCanvasV2SelectedAnalysisEvidence,
} from "@/lib/canvas-v2/artifact-safety";
import { buildCanvasV2BoundedModelContext } from "@/lib/canvas-v2/model-context";
import {
  validateCanvasV2RenderedAnalysisEvidenceScale,
  validateCanvasV2RenderedComparisonCommunication,
  validateCanvasV2RenderedRelationshipGeometry,
} from "@/lib/canvas-v2/evidence-authorship";
import {
  CanvasV2ProviderError,
  canvasV2ProviderErrorResponse,
  fetchCanvasV2ProviderJsonWithModelChain,
  invalidCanvasV2ProviderResponse,
} from "@/lib/canvas-v2/provider-reliability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIMARY_MODEL = process.env.CANVAS_V2_MODEL || "gemini-3.1-flash-lite";
const FALLBACK_MODEL = process.env.CANVAS_V2_FALLBACK_MODEL || "gemini-3.5-flash-lite";
const TERTIARY_MODEL = process.env.CANVAS_V2_TERTIARY_MODEL || "gemini-3.7-flash";
const CREATIVE_FALLBACK_MODEL = process.env.CANVAS_V2_CREATIVE_FALLBACK_MODEL || "gemini-3.5-flash";
const CREATIVE_MODEL = process.env.CANVAS_V2_CREATIVE_MODEL || CREATIVE_FALLBACK_MODEL;
const CREATIVE_TERTIARY_MODEL = process.env.CANVAS_V2_CREATIVE_TERTIARY_MODEL || process.env.CANVAS_V2_TERTIARY_MODEL || TERTIARY_MODEL;
const FOUNDATION_MODEL = process.env.CANVAS_V2_FOUNDATION_MODEL || PRIMARY_MODEL;
const NORTHSTAR_DESIGN_REFERENCE_PATHS = [
  "public/northstar/design-references/strategic-storyline-atlas.png",
  "public/northstar/design-references/evidence-constellation.png",
];
const CREATIVE_DIRECTOR_SYSTEM = `You are North Star's visual director. Read the exact rendered overview, readable analytical-region captures, grounded evidence atlas, current creative direction, recent committed moves, and optional North Star taste reference. Return one concise JSON art-direction brief for the next visible source patch. Diagnose the most consequential visible weakness and prescribe one materially different, prompt-specific move that improves the communication.

A balanced two-column layout, three-column dashboard, repeated cards or panels, small conventional copy, and typography-only polish are scaffolding—not a resolved concept. Never keep prescribing the same container rearrangement under new wording. If recent turns already changed cards, columns, panels, grids, typography, or badges, the next brief must advance the visual argument through a genuinely different authored mode: evidence choreography, annotated sequence, causal path, relationship field, comparison axis, meaningful curve, stage compression, enlarged inspection, or another original device appropriate to the prompt. The point is not to include every device; it is to make one important insight unmistakably visible.

Select no more than four exact short evidence handles from canonicalEvidence whenever the move depends on screenshots or app identity. Those selections become an executable contract; the server resolves them to the full tenant evidence IDs. Name a focused set of one to three short kebab-case authoredVisualRoles for the visible structures that could carry this turn (for example thesis-anchor, evidence-callout, comparison-axis, stage-transition, causal-connector, or an original role you devise). Do not use card, panel, column, grid, or dashboard as a visual role. The source author must materially realize at least one central role as data-canvas-v2-visual-role rather than spending the patch on metadata.

Read render.spatial.analysisEvidenceGeometry as factual scale evidence. A screenshot that is several times taller than its canonical peer and dominates its authored region is not automatically a focal insight. If it lacks a visibly linked annotation or relationship, prescribe a correction before any additional container work. Use render.spatial.authoredRelationships and authoredAnnotations to distinguish claimed visual language from geometry that actually exists.

For a screenshot-led comparison, adjacent prose columns and small evidence thumbnails are not a resolved visual argument. Decide which prompt-specific visual form makes the central insight spatially inspectable: evidence choreography, juxtaposition, annotation, a connector, bracket, axis, sequence handoff, causal path, or a better device you invent. Relationship geometry is optional, never a box to tick. Do not prescribe it merely because none exists.

Treat connectors and other endpoint-dependent geometry as an integration layer, not an early scaffold. Stabilize the composition, evidence placement, hierarchy, scale, and visual style first. If material recomposition is still needed, prescribe that before new SVG geometry. Once relationships exist, any later brief that moves, replaces, or resizes their endpoint regions must explicitly rebuild or replace every affected relationship in the same visible turn; never preserve stale lines across a reflow.

Use real evidence and exact app identity; never invent product facts or quantitative claims. You do not write HTML or CSS. Recommend completion only when the whole-board overview has a dominant thesis, legible evidence-led story, purposeful visual relationships, coherent palette, inspectable evidence, and no material dead space or generic unfinished region. Your brief must be concrete enough for a separate source-authoring model to execute without guessing.`;
const CREATIVE_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    visualDiagnosis: { type: "string" },
    materialMove: { type: "string" },
    spatialDirection: { type: "string" },
    evidenceChoreography: { type: "string" },
    evidenceSelections: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          evidenceHandle: { type: "string" },
          roleInArgument: { type: "string" },
          intendedTreatment: { type: "string" },
        },
        required: ["evidenceHandle", "roleInArgument", "intendedTreatment"],
      },
    },
    authoredVisualRoles: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
    antiRepetition: { type: "string" },
    visualVocabulary: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
    paletteDirection: { type: "string" },
    whyThisTurn: { type: "string" },
    completionRecommendation: { type: "string", enum: ["continue", "complete"] },
    completionRationale: { type: "string" },
  },
  required: ["visualDiagnosis", "materialMove", "spatialDirection", "evidenceChoreography", "evidenceSelections", "authoredVisualRoles", "antiRepetition", "visualVocabulary", "paletteDirection", "whyThisTurn", "completionRecommendation", "completionRationale"],
} as const;
const SYSTEM = `You are North Star's sole research director, designer, and source author for Canvas V2.
Given the user's instruction, bounded source outline, rendered overview, labeled evidence atlases, and tenant-scoped catalog index, choose exactly one next action: research one complete flow, author one bounded source patch, or declare the visible revision complete.
Own composition, hierarchy, typography, spacing, placement, and editorial judgment. Make the requested change accurately and decisively. You may recompose the document when useful.
Maintain a compact creativeDirection on every decision. It is your evolving visual point of view, not a runtime-authored plan, fixed template, checklist, or aesthetic score. Establish a specific visual thesis on the first turn; after every exact render, preserve it, sharpen it, or deliberately change it when the visible result or evidence warrants a stronger direction. Keep the artifact internally coherent even when the form is surprising. visualThesis must name the actual idea the composition communicates; compositionStrategy must describe its distinctive visual metaphor or reading structure. A CSS mechanism such as grid, flex, columns, cards, or a dashboard is implementation, not a concept. unresolvedOpportunities is your honest, render-specific ledger of material visual opportunities you can still see—not stock aspirations. Any unresolved opportunity means the work is not complete. Convert the most important one into the next concrete edit, and add newly discovered opportunities after each render.
Maintain an explicit spatialStrategy on every decision. You alone choose its growth direction, layout system, primary anchor, hierarchy and scale, spacing rhythm, relationship logic, current adjustment, and any intentional overlaps. The supplied spatial observation is a factual map of rendered node bounds and computed layout—not an aesthetic verdict. Use it together with the screenshot and source to reason precisely about where elements actually landed.
Return a rendered reflection on every decision. Read the screenshot itself through concept, hierarchy, evidence, relationship, legibility, and distinctiveness. Describe concrete visible facts in each field; do not repeat generic praise. remainingOpportunity names the most consequential gap revealed by those reads. This reflection is your own design reasoning, not a runtime evaluator or score.
For an edit, label the purposeful move as framing, composition, relationship, analysis, or refinement. Choose the move because it materially advances the user's communication. Research, evidence insertion, and one summary block are not automatically a finished composition. Reconsider whether stronger framing, evidence organization, relationships or annotations, analytical development, or editorial refinement would genuinely improve the answer. Do not perform all of them mechanically and do not pad the run to consume turns.
Author one bounded, visually decisive move per turn so the user sees the artboard develop quickly. Prefer a focused patch over repeatedly rebuilding the whole authored composition. A useful move may introduce or reshape a connector, curve, distinction band, stage boundary, comparison axis, causal path, annotation, evidence enlargement, quantitative diagram, chart, or a visual device you invent for this prompt; these are vocabulary, never requirements. Choose the form because it makes one important idea easier to see. The captured artboard must communicate without hover: transitions, hover states, and invisible interaction do not count as visible progress. Repeated typography or spacing polish without advancing the insight is stagnation—either resolve a material opportunity through a different visual mode or honestly complete after inspecting the render.
Relationship geometry is integration work, not an early scaffold. First stabilize the composition's evidence placement, hierarchy, scale, and visual style. Introduce connectors, brackets, or endpoint-dependent SVG only when that structure is sufficiently settled and the relationship is the clearest way to communicate the insight. Never add relationship geometry merely to demonstrate capability. After any relationship exists, a later patch that moves, replaces, resizes, or recomposes either endpoint must update or replace all affected geometry in that same patch. Use the observed endpoint distances as factual repair evidence; detached or stale lines are unresolved work.
Let the communication problem determine the form. An editorial narrative, evidence field, journey, causal map, comparison matrix, storyboard, annotated sequence, spatial argument, data portrait, or an original hybrid may each be right; these are possibilities, never prescribed templates. Prefer a distinctive, legible concept over a generic dashboard or repeated card grid. A two-column comparison is merely scaffolding; by itself it is not an authored concept. The chosen form must visually express the insight through scale, sequence, relationships, contrast, or evidence choreography.
Translate the chosen form into disciplined source geometry. Establish clear alignment rails and a primary anchor; use content-driven grid or flex systems for structural regions; reserve absolute positioning for relationships, annotations, and deliberate layering. Decide whether the artboard should stay stable or grow horizontally, vertically, or in both axes. Do not expand it with arbitrary empty dimensions. Preserve natural image aspect ratios and keep text readable in artboard units because the observation screenshot may be downscaled.
Research is visible work, never private attachment context. The deterministic research director grounds explicitly required app journeys before invoking you. You may still return research later when another exact catalog flow would materially advance the answer. Never request a visibleFlowId twice. Research turns do not consume a creative-turn allowance: there is no fixed creative turn budget.
Evidence comes before claims about it. Do not author product claims, proxy diagrams, empty lanes, or placeholder flow visualizations before the required evidence is visible. A concise or executive presentation still requires adequate source coverage; brevity belongs in the synthesis, not in an arbitrarily shallow evidence choice. Never truncate a selected flow.
The research context contains requirements derived from the user's explicit product targets. Treat visible as grounded, pending as currently materializing, unavailable as a truthful account limitation, and unresolved as work that remains. Never omit or fabricate an unavailable product. Before completion, resolve every unresolved target and make every unavailable limitation explicit in a visible artifact element bearing data-canvas-v2-research-unavailable="the exact requestedName". This is a factual coverage marker, not a prescribed visual form; compose the limitation in the way that best serves the design.
After evidence is visible, author around it. A canonical flow lane is a permanent, complete source record: preserve its data-canvas-v2-canonical-flow container, lane node identity, original evidence image nodes, exact URLs, evidence IDs, DOM sequence, contiguous flow indices, journey-segment markers, and one uninterrupted left-to-right screenshot rail. The artboard grows horizontally to preserve that complete sequence; never wrap, crop, overlap, reorder, or compress its canonical screenshots. You may reposition or restyle the whole lane and place annotations or relationships around it, but its original canonical images must remain inside that same lane, naturally proportioned, readable, and inspectable.
The rest of the artboard is an open analytical working surface. You may copy a canonical screenshot into a comparison, enlarged inspection, causal argument, journey, or synthesis area without removing it from its flow. Every such copy must use a new unique data-canvas-v2-node-id, data-canvas-v2-evidence-role="analysis-copy", and data-canvas-v2-source-node-id pointing to the original canonical image node; keep its evidence ID and exact URL. Never reuse a canonical node ID for a copy. Begin near the canonical peer scale. When an enlargement becomes dominant, mark its purposeful treatment with data-canvas-v2-evidence-treatment and visibly connect it to an explanatory element carrying data-canvas-v2-annotation-for or to relationship geometry carrying data-canvas-v2-relationship-source and data-canvas-v2-relationship-target. Attributes are inspectable intent, not an invisible excuse: the rendered explanation and geometry must actually be visible. Add annotations, relationships, charts, matrices, hypotheses, and synthesis wherever they materially clarify the answer.
For an explicit screenshot-led comparison, representative copies cannot remain decorative thumbnails beside prose. Keep at least two exact screen copies visible in the analytical region and let their sequence, scale, juxtaposition, annotation, relationship, or another purposeful authored treatment make the contrast inspectable. Choose the form from the actual insight. Do not add generic arrows between unrelated containers, and do not force relationship geometry when evidence choreography communicates more clearly.
Connected app icons are first-class grounded identity assets, listed separately in canonicalEvidence.identityAssets rather than counted as screens. When a grounded app is named in an authored analytical composition, use its exact icon as an analysis copy at least once so the visual identity remains connected to evidence. Copy it with its short data-canvas-v2-copy-evidence-handle. Never invent a lettermark, initial tile, emoji, or generic proxy when that exact icon is available.
Ground every product-specific analytical claim in a visible screen, step, sequence, or pattern on the artboard. Name the observed detail that supports the claim, or label the statement clearly as a hypothesis. Avoid unsupported strategic adjectives, invented causality, and conclusions that the rendered evidence cannot substantiate.
Canonical screen counts are exact source facts. Never infer or round them. When naming a complete journey's count, copy canonicalEvidence.screenCount exactly.
Do not invent conversion rates, drop-off percentages, duration, revenue, or other quantitative precision from screenshots. If a hypothetical number materially helps explain a decision, label it visibly and locally as an illustrative hypothesis or estimate; otherwise use a qualitative comparison grounded in the observed sequence.
Treat useful research, discoveries, and analytical work already on the growing artboard as cumulative context. Preserve it by default and extend, reorganize, or refine it. Remove or consolidate authored analysis only deliberately when doing so makes the user's requested communication materially clearer; do not collapse the working surface merely to make a tidy summary.
Judge the exact current render against the original instruction and your current creative direction. Return complete only when the visible artifact communicates a resolved answer, not merely because source exists or evidence was retrieved, and all required available apps are grounded. If a named app has no usable flow, state that limitation truthfully; never fabricate symmetry, screenshots, or placeholders that impersonate evidence. There is no runtime turn quota, target turn count, or race: you own when the work is resolved. Four edits are not inherently enough; twelve are not inherently required. Continue for as many observed turns as the actual composition needs. Do not end a run while creativeDirection.unresolvedOpportunities contains any material opportunity or while the reflection identifies one.
Honor researchMode. For evidence mode, the evidence itself may be the deliverable once it is visibly grounded and well presented. For synthesis mode, comparison, analysis, explanation, insight, or strategy must be authored from the rendered evidence. After the final required flow becomes visible, author a specific creative arc in creativeDirection.nextMoves and progressively execute it against exact renders. On every subsequent turn, visibly execute the first previously declared move, then replan future work from the new render. Preserve still-material commitments, revise or replace plans that the observed result made obsolete, and add newly discovered opportunities. Do not claim to have completed a planned move without visibly authoring it. Keep only meaningful future moves; return an empty list on the edit you believe is the final resolution pass, then inspect that committed result once more before declaring complete. Pre-research framing does not count.
Treat creativeDirection.nextMoves as your immediate authored queue and unresolvedOpportunities as your broader visual review ledger. Keep only meaningful future work. The server protects continuity of work you declared, but it never chooses your move taxonomy, composes the board, or scores your aesthetics. An empty initial queue after a fixed minimum is not a completion shortcut: inspect the new render, discover additional work whenever it is materially present, and continue. A complete decision is coherent only after you have inspected the final committed render and both arrays are empty.
Before completing, reconcile your spatialStrategy with the actual screenshot and measurements. Correct accidental clipping, unintended intersections, weak alignment, awkward text wrapping, inconsistent scale, crowded regions, and purposeless dead space when they materially affect communication. Reported intersections are facts, not automatic errors; preserve and identify deliberate overlaps when they serve the composition.
Every model-authored top-level analytical composition must carry data-canvas-v2-design-region and a stable data-canvas-v2-node-id. The runtime returns readable detail captures for those regions on subsequent turns. Use them to judge typography, evidence-copy scale, annotations, and local relationships instead of relying only on the downscaled full-artboard overview.
The user is shown the whole working surface. Judge the board at both scales supplied: the complete-artboard overview must communicate its thesis, anchors, evidence groupings, and relationship marks at a glance; the readable design-region captures must hold up under inspection. Do not solve one scale by sacrificing the other. If the complete overview looks like a thin evidence ribbon with tiny conventional copy, the composition is not resolved.
The supplied North Star visual-language references are taste and craft calibration, never templates or factual evidence. Read their visual principles—dominant thesis, editorial scale, asymmetric hierarchy, evidence as argument, purposeful connectors, restrained violet signal, fine rules, direct-on-surface composition, and multiple coordinated modes of visual explanation—then create an original form suited to the user's evidence. Never copy their literal text, data, claims, or layout.
Keep the palette coherent with the whole artboard. North Star's default premium surface language is light, direct, restrained, and evidence-led. A dark field can be powerful when its contrast carries a specific conceptual role established elsewhere in the composition; a generic near-black footer or conclusion slab is not a shortcut to emphasis or premium craft. Inspect whether any dark mass belongs to the visual thesis, balances the surrounding evidence, and preserves the chosen signal colors. If not, integrate the conclusion through scale, rules, tint, whitespace, or another authored treatment.
When the user asks for representative screenshots in a synthesis, the analytical composition must visibly promote chosen canonical screens into inspectable analysis copies. A prose summary beside a miniature complete rail does not fulfill that request. Let those chosen screens carry the argument through enlargement, sequencing, comparison, annotations, connectors, or another purposeful visual treatment chosen by you.
Never describe an edit as including evidence inspection copies, annotations, relationships, a table, matrix, chart, or other visible structure unless the patch actually authors those elements. Summary and expectedVisualResult must state only what this single patch materially changes.
When a creativeCheckpointBrief is supplied, it is the strong visual director's executable decision for this observed render. Materialize every selected evidence handle with data-canvas-v2-copy-evidence-handle and at least one of its focused authored visual roles on a visible element with data-canvas-v2-visual-role. The server resolves that compact handle to the exact evidence ID, URL, and canonical source. Do not replace the prescribed evidence-led move with another dashboard, card, column, panel, grid, badge, or typography rearrangement. Preserve earlier representative screen and grounded identity copies when replacing a design region; a cumulative working surface may refine their treatment but must not silently discard them.
Inline SVG relationship geometry is supported when the chosen visual argument needs it. Give its wrapper and meaningful paths, lines, polylines, markers, and labels unique stable node IDs. Anchor authored relationships to exact source and target node IDs with data-canvas-v2-relationship-source and data-canvas-v2-relationship-target; anchor annotations with data-canvas-v2-annotation-for. Author geometry only after its endpoint composition is stable. If a later patch changes either endpoint's layout, rebuild or replace the affected paths in that same patch. Do not emit scripts, iframes, forms, event-handler attributes, external CSS imports, or JavaScript.
For an edit, return patch.operations, never a complete document. Use insert-before, insert-after, append-html, replace-node, remove-node, and upsert-css against stable node IDs in source.htmlOutline. Prefer one purposeful HTML insertion or replacement plus one named CSS layer. Canonical lane elements are immutable: insert analysis before or after their lane node IDs; do not append into, replace, or remove them. To copy grounded evidence into analysis—including a screenshot or connected app icon—emit an img with a new unique data-canvas-v2-node-id and data-canvas-v2-copy-evidence-handle="short grounded handle"; the server supplies the exact evidence ID, URL, and canonical provenance. Do not emit src for such a copy. The older data-canvas-v2-copy-evidence-id form remains accepted but the short handle is strongly preferred.
Give every meaningful layout region, text block, image, card, row, and independently editable element a unique, stable data-canvas-v2-node-id. Preserve existing node IDs for elements that survive an edit. Never reuse one node ID on multiple elements.
If run.correction is present, the preceding response failed deterministic source validation. Treat it only as validator feedback, repair that exact contract failure in a newly authored response, and continue the same creative move from the unchanged committed revision.
The runtime renders your source but never redesigns it. ${NORTHSTAR_V2_ARTBOARD_GRAMMAR}
Return JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["research", "edit", "complete"] },
    summary: { type: "string" },
    expectedVisualResult: { type: "string" },
    moveKind: { type: "string", enum: ["research", "framing", "composition", "relationship", "analysis", "refinement"] },
    creativeDirection: {
      type: "object",
      additionalProperties: false,
      properties: {
        designIntent: { type: "string" },
        visualThesis: { type: "string" },
        compositionStrategy: { type: "string" },
        visualLanguage: { type: "string" },
        evidenceStrategy: { type: "string" },
        currentFocus: { type: "string" },
        unresolvedOpportunities: { type: "array", items: { type: "string" }, maxItems: 8 },
        nextMoves: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["designIntent", "visualThesis", "compositionStrategy", "visualLanguage", "evidenceStrategy", "currentFocus", "unresolvedOpportunities", "nextMoves"],
    },
    spatialStrategy: {
      type: "object",
      additionalProperties: false,
      properties: {
        growthDirection: { type: "string", enum: ["stable", "horizontal", "vertical", "both"] },
        layoutSystem: { type: "string" },
        primaryAnchor: { type: "string" },
        hierarchyAndScale: { type: "string" },
        spacingRhythm: { type: "string" },
        relationshipLogic: { type: "string" },
        currentAdjustment: { type: "string" },
        intentionalOverlaps: { type: "array", items: { type: "string" }, maxItems: 12 },
      },
      required: ["growthDirection", "layoutSystem", "primaryAnchor", "hierarchyAndScale", "spacingRhythm", "relationshipLogic", "currentAdjustment", "intentionalOverlaps"],
    },
    reflection: {
      type: "object",
      additionalProperties: false,
      properties: {
        observedResult: { type: "string" },
        remainingOpportunity: { type: "string" },
        conceptRead: { type: "string" },
        hierarchyRead: { type: "string" },
        evidenceRead: { type: "string" },
        relationshipRead: { type: "string" },
        legibilityRead: { type: "string" },
        distinctivenessRead: { type: "string" },
        nextMoveReason: { type: "string" },
      },
      required: ["observedResult", "remainingOpportunity", "conceptRead", "hierarchyRead", "evidenceRead", "relationshipRead", "legibilityRead", "distinctivenessRead", "nextMoveReason"],
    },
    appId: { type: "string" },
    flowId: { type: "string" },
    patch: {
      type: "object",
      additionalProperties: false,
      properties: {
        operations: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["insert-before", "insert-after", "append-html", "replace-node", "remove-node", "upsert-css"] },
              targetNodeId: { type: "string" },
              html: { type: "string" },
              layerId: { type: "string" },
              css: { type: "string" },
            },
            required: ["op", "targetNodeId"],
          },
        },
      },
      required: ["operations"],
    },
  },
  required: ["decision", "summary", "creativeDirection", "spatialStrategy", "reflection"],
};

function responseSchemaForPolicy(policy: ReturnType<typeof canvasV2ResearchDecisionPolicy>, maxOperations: number, excludeCompletion = false): typeof RESPONSE_SCHEMA {
  const schema = structuredClone(RESPONSE_SCHEMA);
  schema.properties.decision.enum = policy.permittedDecisions.filter((decision) => !excludeCompletion || decision !== "complete");
  schema.properties.patch.properties.operations.maxItems = maxOperations;
  if (policy.requiresPlannedContinuation) {
    Object.assign(schema.properties.creativeDirection.properties.nextMoves, { minItems: 3 });
  }
  return schema;
}

function normalizedMove(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sharedMoveTerms(left: string, right: string): number {
  const ignored = new Set(["a", "an", "and", "the", "to", "of", "with", "for", "into", "from", "on", "in"]);
  const leftTerms = new Set(normalizedMove(left).split(" ").filter((term) => term.length > 2 && !ignored.has(term)));
  return normalizedMove(right).split(" ").filter((term) => leftTerms.has(term)).length;
}

function hasMaterialRemainingOpportunity(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return !/^(?:none|nothing|no\s+material(?:\s+visual)?\s+(?:opportunity|work)(?:\s+remains?)?)(?:\s*[.!:;—-]|\s*$)/i.test(normalized);
}

function validateCanvasV2CreativeArc(
  decision: ReturnType<typeof parseCanvasV2DesignDecision>,
  policy: ReturnType<typeof canvasV2ResearchDecisionPolicy>,
  allowCreativeRedirection = false,
): void {
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

function parseCreativeDirectorBrief(
  payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> },
  evidenceIdByHandle: ReadonlyMap<string, string> = new Map(),
) {
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!text) throw new Error("The visual director returned no brief.");
  const value = JSON.parse(text) as Record<string, unknown>;
  for (const field of ["visualDiagnosis", "materialMove", "spatialDirection", "evidenceChoreography", "antiRepetition", "paletteDirection", "whyThisTurn", "completionRationale"] as const) {
    if (typeof value[field] !== "string" || !value[field].trim()) throw new Error(`The visual director brief requires ${field}.`);
  }
  if (!Array.isArray(value.evidenceSelections) || value.evidenceSelections.length > 4) throw new Error("The visual director brief requires a focused evidence selection list of no more than four items.");
  const evidenceSelections = value.evidenceSelections.map((selection, index) => {
    if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new Error(`Visual director evidence selection ${index + 1} must be an object.`);
    const record = selection as Record<string, unknown>;
    const evidenceHandle = typeof record.evidenceHandle === "string" ? record.evidenceHandle.trim() : "";
    const evidenceId = evidenceIdByHandle.get(evidenceHandle);
    const roleInArgument = typeof record.roleInArgument === "string" ? record.roleInArgument.trim() : "";
    const intendedTreatment = typeof record.intendedTreatment === "string" ? record.intendedTreatment.trim() : "";
    if (!evidenceHandle || !roleInArgument || !intendedTreatment) throw new Error(`Visual director evidence selection ${index + 1} is incomplete.`);
    if (!evidenceId) throw new Error(`Visual director selected an evidence handle that is not grounded in the current artboard: ${evidenceHandle}.`);
    return { evidenceHandle, evidenceId, roleInArgument: roleInArgument.slice(0, 600), intendedTreatment: intendedTreatment.slice(0, 600) };
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
  if (value.completionRecommendation !== "continue" && value.completionRecommendation !== "complete") throw new Error("The visual director brief requires a completion recommendation.");
  return {
    visualDiagnosis: String(value.visualDiagnosis).slice(0, 1_200),
    materialMove: String(value.materialMove).slice(0, 1_200),
    spatialDirection: String(value.spatialDirection).slice(0, 1_200),
    evidenceChoreography: String(value.evidenceChoreography).slice(0, 1_200),
    evidenceSelections,
    authoredVisualRoles,
    antiRepetition: String(value.antiRepetition).slice(0, 1_000),
    visualVocabulary: value.visualVocabulary.slice(0, 6).map((item) => String(item).slice(0, 300)),
    paletteDirection: String(value.paletteDirection).slice(0, 800),
    whyThisTurn: String(value.whyThisTurn).slice(0, 1_000),
    completionRecommendation: value.completionRecommendation,
    completionRationale: String(value.completionRationale).slice(0, 1_200),
  };
}

function validateCanvasV2CreativeBriefExecution(
  decision: ReturnType<typeof parseCanvasV2DesignDecision>,
  brief: ReturnType<typeof parseCreativeDirectorBrief> | undefined,
): void {
  if (!brief || decision.decision !== "edit") return;
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
        researchTargets?: unknown;
        researchMode?: unknown;
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
          };
        })
      : [];

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
        correction: previousFailure(request),
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
    const decisionPolicy = canvasV2ResearchDecisionPolicy(research, researchMode, priorSteps, currentCreativeDirection);
    const requiredResearch = nextCanvasV2RequiredResearch(research);
    if (decisionPolicy.phase === "ground-required-evidence" && requiredResearch) {
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured.", code: "configuration", retryable: false }, { status: 500 });
    const image = parseDataUrl(body.observation.screenshotDataUrl);
    const context = { ...modelContext, researchMode, research, decisionPolicy };
    const synthesisTurn = researchMode === "synthesis" && decisionPolicy.phase !== "ground-required-evidence";
    const observedDesignTurns = priorSteps.filter((step) => step.kind === "design").length;
    const firstSynthesisTurn = Boolean(decisionPolicy.requiresPlannedContinuation);
    const creativeCheckpoint = synthesisTurn && observedDesignTurns > 0 && observedDesignTurns % 2 === 0;
    const completionQualityReview = synthesisTurn && decisionPolicy.permittedDecisions.includes("complete");
    const creativeDirectionTurn = creativeCheckpoint || completionQualityReview;
    const selectedRailDetails = progressiveRailDetails(body.observation.railDetails ?? [], firstSynthesisTurn, observedDesignTurns);
    const selectedDesignDetails = firstSynthesisTurn
      ? []
      : (body.observation.designDetails ?? []).slice(0, creativeDirectionTurn ? 2 : 1);
    const analysisEvidenceScaleFailures = validateCanvasV2RenderedAnalysisEvidenceScale(body.observation);
    const relationshipGeometryFailures = validateCanvasV2RenderedRelationshipGeometry(body.observation);
    const renderedIntegrityFailures = [...analysisEvidenceScaleFailures, ...relationshipGeometryFailures];
    const renderedIntegrityInstruction = renderedIntegrityFailures.length
      ? `Resolve this exact rendered-integrity problem before adding new visual structure: ${renderedIntegrityFailures.join(" ")} `
      : "";
    const railDetailParts = selectedRailDetails.flatMap((detail) => [
      { text: `Labeled canonical evidence atlas: ${detail.label} (zero-based indices ${detail.startIndex}–${detail.endIndex}).` },
      { inlineData: parseDataUrl(detail.screenshotDataUrl) },
    ]);
    const designDetailParts = selectedDesignDetails.flatMap((detail) => [
      { text: `Readable authored design-region capture: ${detail.label} [node ${detail.nodeId}; ${detail.width}×${detail.height} artboard units].` },
      { inlineData: parseDataUrl(detail.screenshotDataUrl) },
    ]);
    const designReferenceParts = synthesisTurn && creativeDirectionTurn
      ? await loadNorthstarDesignReferenceParts()
      : [];
    const creativeEvidenceIdByHandle = new Map(context.canonicalEvidence.flatMap((flow) => [
      ...flow.identityAssets.flatMap((asset) => asset.copyHandle ? [[asset.copyHandle, asset.evidenceId] as const] : []),
      ...flow.screens.flatMap((screen) => screen.copyHandle ? [[screen.copyHandle, screen.evidenceId] as const] : []),
    ]));
    const creativeEvidenceDirectory = context.canonicalEvidence.map((flow) => ({
      flowId: flow.flowId,
      laneNodeId: flow.laneNodeId,
      screenCount: flow.screenCount,
      identityAssets: flow.identityAssets.map(({ copyHandle, label, app, description }) => ({ evidenceHandle: copyHandle, label, app, description })),
      screens: flow.screens.map(({ index, copyHandle, label, app, flow: screenFlow, screen }) => ({ index, evidenceHandle: copyHandle, label, app, flow: screenFlow, screen })),
    }));
    const visualCadence = firstSynthesisTurn
      ? {
        phase: "quick-visible-foundation",
        instruction: `${renderedIntegrityInstruction}Commit a bounded visual foundation quickly. Establish the problem-specific thesis, primary spatial idea, exact grounded app identities, evidence placement, hierarchy, and visual style. Do not introduce SVG relationship geometry while the composition is still a scaffold. The inserted top-level section must carry both data-canvas-v2-design-region and a unique data-canvas-v2-node-id. Every patch operation, including upsert-css, must include targetNodeId; use artboard for CSS. Do not attempt to write the complete analysis in this first patch; declare the deeper visible moves that will follow after this render is observed.`,
        suppliedContext: "One balanced canonical atlas per visible lane is supplied. Other rail segments, readable authored-region captures, and visual-language calibration are progressively supplied on later observed turns.",
      }
      : creativeCheckpoint
        ? {
          phase: "creative-checkpoint",
          instruction: `${renderedIntegrityInstruction}This is a deeper observed creative checkpoint after several visible commits. Challenge whether the concept, evidence choreography, relationships, visual vocabulary, and palette are specific enough for this prompt. If relationship geometry already exists and this turn changes its endpoint composition, rebuild the affected geometry in the same patch. Make one bounded material edit that resolves the most consequential weakness you can actually see, or complete only if the rendered composition has no material unresolved opportunity.`,
          suppliedContext: "Two readable authored-region captures, one rotating evidence atlas, and one visual-language reference are supplied for a deeper divergence and integration read without resending the complete visual archive.",
        }
        : {
        phase: "progressive-visible-development",
        instruction: `${renderedIntegrityInstruction}Execute one material previously declared move as a quickly committed visible patch. Every patch operation, including upsert-css, must include targetNodeId; use artboard for CSS. Preserve existing grounded images by leaving them in place or by using a short data-canvas-v2-copy-evidence-handle for new copies—never reconstruct their src markup. If relationship geometry exists and this patch changes either endpoint's placement, size, or containing composition, update or replace that geometry in the same patch. Use the current readable design capture and rotating evidence atlas to deepen the composition without rebuilding already-resolved regions.`,
        suppliedContext: "Visual context is deliberately progressive so every provider call remains bounded and every successful turn becomes visible promptly.",
      };
    let creativeCheckpointBrief: ReturnType<typeof parseCreativeDirectorBrief> | undefined;
    let creativeBriefAttempts: CanvasV2ProviderError["providerAttempts"] = [];
    let creativeBriefFallbackUsed = false;
    if (creativeDirectionTurn) {
      const creativeBriefProvider = await fetchCanvasV2ProviderJsonWithModelChain<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>({
        models: [CREATIVE_MODEL, CREATIVE_TERTIARY_MODEL, FOUNDATION_MODEL],
        maxInvalidResponsesPerModel: 2,
        requestSignal: request.signal,
        validatePayload: (payload) => { parseCreativeDirectorBrief(payload, creativeEvidenceIdByHandle); },
        requestForModel: (model, correction) => ({
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            cache: "no-store",
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: CREATIVE_DIRECTOR_SYSTEM }] },
              contents: [{ role: "user", parts: [
                { text: JSON.stringify({
                  instruction,
                  creativeDirection: body.run?.creativeDirection,
                  spatialStrategy: body.run?.spatialStrategy,
                  priorSteps: priorSteps.slice(-6),
                  recentDesignMoves: priorSteps.filter((step) => step.kind === "design").slice(-6).map((step) => ({ moveKind: step.moveKind, summary: step.summary, expectedVisualResult: step.expectedVisualResult })),
                  canonicalEvidence: creativeEvidenceDirectory,
                  render: context.render,
                  visualCadence,
                }) },
                ...(correction ? [{ text: `Your prior brief was invalid: ${correction}\nReturn a corrected brief only.` }] : []),
                { text: "Current rendered artboard overview:" },
                { inlineData: image },
                ...railDetailParts,
                ...designDetailParts,
                ...designReferenceParts,
              ] }],
              generationConfig: { temperature: 0.72, maxOutputTokens: 1_800, responseMimeType: "application/json", responseJsonSchema: CREATIVE_BRIEF_SCHEMA },
            }),
          },
        }),
      });
      creativeCheckpointBrief = parseCreativeDirectorBrief(creativeBriefProvider.payload, creativeEvidenceIdByHandle);
      creativeBriefAttempts = creativeBriefProvider.attempts;
      creativeBriefFallbackUsed = creativeBriefProvider.fallbackUsed;
      if (process.env.NODE_ENV !== "production") console.info("[canvas-v2] visual director brief", {
        model: creativeBriefProvider.model,
        recommendation: creativeCheckpointBrief.completionRecommendation,
        materialMove: creativeCheckpointBrief.materialMove,
        evidenceIds: creativeCheckpointBrief.evidenceSelections.map((selection) => selection.evidenceId),
        visualRoles: creativeCheckpointBrief.authoredVisualRoles,
        attempts: creativeBriefProvider.attempts,
      });
    }
    const creativeRequiresContinuation = creativeCheckpointBrief?.completionRecommendation === "continue" && decisionPolicy.permittedDecisions.includes("complete");
    const permittedDecisions = decisionPolicy.permittedDecisions.filter((decision) => !creativeRequiresContinuation || decision !== "complete");
    const requestContext = {
      ...context,
      visualCadence,
      ...(creativeCheckpointBrief ? {
        creativeCheckpointBrief: {
          ...creativeCheckpointBrief,
          evidenceSelections: creativeCheckpointBrief.evidenceSelections.map(({ evidenceHandle, roleInArgument, intendedTreatment }) => ({ evidenceHandle, roleInArgument, intendedTreatment })),
        },
        creativeCheckpointInstruction: "Execute this visual-director brief as one bounded source patch. Treat it as art direction, not source or factual evidence. Preserve model-authored continuity where it remains material, and visibly realize the prescribed move rather than paraphrasing it. Every evidenceSelections item must exist in the resulting analytical region as an exact analysis copy authored with data-canvas-v2-copy-evidence-handle. At least one authoredVisualRoles item must exist on a visible authored element as data-canvas-v2-visual-role. Those attributes prove execution; they do not prescribe the visual form.",
      } : {}),
    };
    const provider = await fetchCanvasV2ProviderJsonWithModelChain<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>({
      models: synthesisTurn
        ? [FOUNDATION_MODEL, FALLBACK_MODEL, TERTIARY_MODEL]
        : [PRIMARY_MODEL, FALLBACK_MODEL, TERTIARY_MODEL],
      maxInvalidResponsesPerModel: 3,
      requestSignal: request.signal,
      validatePayload: (candidatePayload) => {
        const text = candidatePayload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
        if (!text) throw new Error("Canvas V2 model returned no decision.");
        const decision = parseCanvasV2DesignDecision(JSON.parse(text), body.revision!.evidence, body.revision!.document);
        if (!permittedDecisions.includes(decision.decision)) throw new Error(`Canvas V2 returned ${decision.decision} during ${decisionPolicy.phase}. ${decisionPolicy.reason}`);
        validateCanvasV2CreativeArc(decision, decisionPolicy, creativeDirectionTurn);
        validateCanvasV2CreativeBriefExecution(decision, creativeCheckpointBrief);
        if (decision.decision === "edit") {
          const factualFailures = [
            ...validateCanvasV2EvidenceContinuity(body.revision!.document, decision.document, body.revision!.evidence),
            ...validateCanvasV2AnalysisEvidenceContinuity(body.revision!.document, decision.document, body.revision!.evidence, instruction),
            ...validateCanvasV2ClaimedCanonicalFlowCounts(decision.document, body.revision!.evidence),
            ...validateCanvasV2QuantitativeClaimLabels(decision.document, body.revision!.evidence, instruction),
          ];
          if (factualFailures.length) throw new Error(factualFailures.join(" "));
        }
        if (decision.decision === "complete") {
          const completionFailures = [
            ...analysisEvidenceScaleFailures,
            ...relationshipGeometryFailures,
            ...validateCanvasV2RenderedComparisonCommunication(body.observation!, instruction),
            ...validateCanvasV2ClaimedCanonicalFlowCounts(body.revision!.document, body.revision!.evidence),
            ...validateCanvasV2GroundedAppIdentityUsage(body.revision!.document, body.revision!.evidence),
            ...validateCanvasV2RequestedAnalysisEvidenceUsage(body.revision!.document, body.revision!.evidence, instruction),
            ...validateCanvasV2QuantitativeClaimLabels(body.revision!.document, body.revision!.evidence, instruction),
          ];
          if (completionFailures.length) throw new Error(`The current authored composition is not ready to complete. ${completionFailures.join(" ")}`);
        }
      },
      requestForModel: (model, correction) => ({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        cache: "no-store",
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [
            { text: JSON.stringify(requestContext) },
            ...(correction ? [{ text: `STRUCTURAL REPAIR REQUIRED. Your preceding draft was not committed. The exact validator failure was:\n${correction}\nReturn a newly authored response for the same current revision. Correct that exact failure, preserve the intended creative move, and do not explain the repair.` }] : []),
            { text: "Current rendered artboard overview:" },
            { inlineData: image },
            ...railDetailParts,
            ...designDetailParts,
          ] }],
          generationConfig: { temperature: creativeDirectionTurn ? 0.68 : 0.62, maxOutputTokens: creativeDirectionTurn ? 7_000 : firstSynthesisTurn ? 4_200 : 5_500, responseMimeType: "application/json", responseJsonSchema: responseSchemaForPolicy(decisionPolicy, creativeDirectionTurn ? 5 : firstSynthesisTurn ? 3 : 4, creativeRequiresContinuation) },
        }),
        },
      }),
    });
    const providerAttempts = [...(creativeBriefAttempts ?? []), ...provider.attempts];
    const fallbackUsed = creativeBriefFallbackUsed || provider.fallbackUsed;
    const payload = provider.payload;
    try {
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      if (!text) throw new Error("Canvas V2 model returned no decision.");
      const decision = parseCanvasV2DesignDecision(JSON.parse(text), body.revision.evidence, body.revision.document);
      if (!permittedDecisions.includes(decision.decision)) {
        throw new Error(`Canvas V2 returned ${decision.decision} during ${decisionPolicy.phase}. ${decisionPolicy.reason}`);
      }
      validateCanvasV2CreativeArc(decision, decisionPolicy, creativeDirectionTurn);
      if (decision.decision === "research") {
        const unresolvedAppIds = new Set(research.requirements.filter((requirement) => requirement.state === "unresolved").map((requirement) => requirement.appId));
        if (unresolvedAppIds.size && !unresolvedAppIds.has(decision.appId)) {
          throw new Error("Canvas V2 must ground one of the unresolved explicitly requested apps before unrelated research.");
        }
        const result = resolveCanvasV2ResearchDecision(catalog, decision, research.visibleFlowIds, research);
        const app = result.apps[0];
        const flow = result.flows[0];
        const factualDecision = {
          ...decision,
          summary: `Retrieved the complete ${app.name} · ${flow.name} flow (${result.screens.length} screens) and placed it on the visible working surface.`,
          expectedVisualResult: `${app.name}'s icon and ${result.screens.length} ordered screenshots are visible as one canonical evidence lane.`,
        };
        return NextResponse.json({ decision: factualDecision, research: result, researchStatus: canvasV2ResearchStatusForDecision(research, decision), model: provider.model, fallbackUsed, providerAttempts });
      }
      if (decision.decision === "complete") {
        const factualFailures = [
          ...analysisEvidenceScaleFailures,
          ...relationshipGeometryFailures,
          ...validateCanvasV2RenderedComparisonCommunication(body.observation!, instruction),
          ...validateCanvasV2ClaimedCanonicalFlowCounts(body.revision.document, body.revision.evidence),
          ...validateCanvasV2GroundedAppIdentityUsage(body.revision.document, body.revision.evidence),
          ...validateCanvasV2RequestedAnalysisEvidenceUsage(body.revision.document, body.revision.evidence, instruction),
          ...validateCanvasV2QuantitativeClaimLabels(body.revision.document, body.revision.evidence, instruction),
        ];
        if (factualFailures.length) throw new Error(`The current authored composition contains factual claims that must be repaired before completion. ${factualFailures.join(" ")}`);
        const completion = resolveCanvasV2ResearchCompletion(research, decision.summary, body.revision.document.html);
        if (completion.unresolved.length) throw new Error(`The visible artboard is not ready to complete. Ground the available required app${completion.unresolved.length === 1 ? "" : "s"}: ${completion.unresolved.join(", ")}.`);
        if (completion.unacknowledgedUnavailable.length) throw new Error(`The visible artboard is not ready to complete. Make the unavailable research explicit on the artboard: ${completion.unacknowledgedUnavailable.join(", ")}.`);
        return NextResponse.json({ decision: { ...decision, summary: completion.summary }, evidence: body.revision.evidence, researchStatus: canvasV2ResearchStatusForDecision(research), model: provider.model, fallbackUsed, providerAttempts });
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
