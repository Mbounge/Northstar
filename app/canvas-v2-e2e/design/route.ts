import { NextRequest, NextResponse } from "next/server";

import { canvasV2ResearchResultForFlow } from "@/lib/canvas-v2/research-adapter";
import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2ArtifactRevision,
  type CanvasV2CompositionState,
  type CanvasV2CreativeDirection,
  type CanvasV2RenderedReflection,
  type CanvasV2RenderObservation,
  type CanvasV2SpatialStrategy,
} from "@/lib/canvas-v2/types";
import { CANVAS_V2_E2E_APPS, CANVAS_V2_E2E_EVIDENCE_PACKETS, CANVAS_V2_E2E_EXTERNAL_EVIDENCE_PACKETS } from "@/app/canvas-v2-e2e/research-fixture";
import {
  buildCanvasV2ResearchCatalogIndex,
  canvasV2ResearchStatusForDecision,
} from "@/lib/canvas-v2/research-director";
import { findCanvasV2SourceNodeRange } from "@/lib/canvas-v2/source-patch";
import { parseCanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";
import { buildCanvasV2DiscoveryContextRuntime } from "@/lib/canvas-v2/discovery-context-runtime";
import { syncCanvasV2DiscoveryGraph } from "@/lib/canvas-v2/discovery-graph";
import {
  applyCanvasV2EmergentDepthSignal,
  applyCanvasV2DiscoveryTransition,
  parseCanvasV2EmergentDepthSignal,
  type CanvasV2DiscoveryState,
  type CanvasV2DiscoveryStateTransition,
} from "@/lib/canvas-v2/discovery-state";

function appendCanvasObject(html: string, object: string): string {
  const mainClose = html.lastIndexOf("</main>");
  return mainClose >= 0
    ? `${html.slice(0, mainClose)}${object}${html.slice(mainClose)}`
    : `${html}${object}`;
}

function replaceCanvasObjectText(html: string, nodeId: string, text: string): string {
  const range = findCanvasV2SourceNodeRange(html, nodeId);
  if (!range || range.openEnd === range.closeStart) throw new Error(`Deterministic selection target does not exist or cannot contain text: ${nodeId}.`);
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `${html.slice(0, range.openEnd)}${escaped}${html.slice(range.closeStart)}`;
}

function markCanvasObject(html: string, nodeId: string, attribute: string): string {
  const range = findCanvasV2SourceNodeRange(html, nodeId);
  if (!range) throw new Error(`Deterministic selection target does not exist: ${nodeId}.`);
  const opening = html.slice(range.start, range.openEnd);
  if (opening.includes(attribute)) return html;
  return `${html.slice(0, range.openEnd - 1)} ${attribute}>${html.slice(range.openEnd)}`;
}

function insertBeforeGroundedEvidence(html: string, object: string): string {
  const groundedEvidence = /<section\b(?=[^>]*\bclass=["'][^"']*\bcanvas-v2-grounded-evidence\b[^"']*["'])[^>]*>/i.exec(html);
  if (!groundedEvidence || groundedEvidence.index === undefined) return appendCanvasObject(html, object);
  return `${html.slice(0, groundedEvidence.index)}${object}${html.slice(groundedEvidence.index)}`;
}

function withBaseCss(css: string): string {
  return css.includes(".e2e-editorial-header") ? css : `${css}\n${BASE_CSS}`;
}

function direction(currentFocus: string, nextMoves: string[]): CanvasV2CreativeDirection {
  return {
    designIntent: "Make the different onboarding philosophies immediately legible while keeping the complete research surface inspectable.",
    visualThesis: "Two paths, two operating beliefs: Awin establishes confidence through guided depth while Whop converts momentum through compression.",
    compositionStrategy: "Use an editorial opening, complete uninterrupted evidence rails, and a concluding analytical sequence connected by one continuous reading axis.",
    visualLanguage: "Warm white field, near-black editorial type, fine graphite rules, Awin violet and Whop vermilion used sparingly as semantic signals.",
    evidenceStrategy: "Keep both canonical flows complete and full-size, then build conclusions beside and below them without replacing evidence with decorative thumbnails.",
    currentFocus,
    unresolvedOpportunities: nextMoves,
    nextMoves,
  };
}

function snapshotDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Make authorized marketing and business intelligence feel as considered as the rest of the canvas without blurring its source boundaries.",
    visualThesis: "A source becomes decision material when its capture, signal, provenance, and limitation can be read together.",
    compositionStrategy: "Use one capture-led marketing story and one operating dossier, each with a distinct hierarchy and generous inspection scale.",
    visualLanguage: "Warm editorial surfaces, precise violet accents, spacious evidence fields, and quiet source metadata.",
    evidenceStrategy: "Preserve every authorized snapshot object, calculated definition, and limitation while introducing no product evidence or unsupported inference.",
    currentFocus: "Hold the verified snapshot-only evidence surface.",
    unresolvedOpportunities: [],
    nextMoves: [],
  };
}

function snapshotSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "stable",
    layoutSystem: "Two vertically sequenced source-native dossiers: business as an operating portrait and marketing as a capture-led editorial story.",
    primaryAnchor: "Each source title and provenance line anchors its own independently inspectable evidence surface.",
    hierarchyAndScale: "Large evidence titles, inspection-scale captures, prominent metrics, and restrained boundary copy.",
    spacingRhythm: "Generous separation between domains with a compact internal fact-and-metric cadence.",
    relationshipLogic: "Facts and metrics remain adjacent to the source capture that authorizes them; no causal connection is implied.",
    currentAdjustment: "Preserve the verified snapshot dossiers exactly as rendered.",
    intentionalOverlaps: [],
  };
}

function externalDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Make a current external signal useful without turning the working canvas into a search-results wall.",
    visualThesis: "Research earns visible space through materiality; corroboration can strengthen understanding without becoming more canvas furniture.",
    compositionStrategy: "Promote one primary witness as an open editorial evidence field and keep supporting sources in the discovery graph.",
    visualLanguage: "Transparent canvas field, one precise violet rule, editorial type, inspection-scale source imagery, and quiet provenance metadata.",
    evidenceStrategy: "Keep every consulted source traceable while showing only the witness that materially changes the answer.",
    currentFocus: "Hold the promoted external witness and its exact source boundary.",
    unresolvedOpportunities: [],
    nextMoves: [],
  };
}

function externalSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "stable",
    layoutSystem: "One full-width open editorial witness using a source frame and a finding frame rather than an enclosed card.",
    primaryAnchor: "The source-backed headline and original citation anchor the left; the returned visual and finding occupy the right.",
    hierarchyAndScale: "Large editorial title, inspection-scale source image, readable finding, prominent native metric, and restrained provenance.",
    spacingRhythm: "Generous outer canvas space with a compact internal 18/32/64px evidence cadence.",
    relationshipLogic: "The promoted source is visible; corroborating sources remain connected in discovery memory without duplicating the island.",
    currentAdjustment: "Preserve the single earned witness and its transparent canvas relationship.",
    intentionalOverlaps: [],
  };
}

function reflection(observedResult: string, remainingOpportunity: string, nextMoveReason: string): CanvasV2RenderedReflection {
  return {
    observedResult,
    remainingOpportunity,
    conceptRead: observedResult,
    hierarchyRead: observedResult,
    evidenceRead: observedResult,
    relationshipRead: remainingOpportunity,
    legibilityRead: observedResult,
    distinctivenessRead: remainingOpportunity,
    nextMoveReason,
  };
}

function spatial(currentAdjustment: string, growthDirection: CanvasV2SpatialStrategy["growthDirection"] = "vertical"): CanvasV2SpatialStrategy {
  return {
    growthDirection,
    layoutSystem: "A 1560px editorial rail: 170px identity axis, flexible evidence sequence, and three-column analytical resolution.",
    primaryAnchor: "The oversized editorial thesis anchors the top-left; every later section returns to its left edge and shared 1560px rule.",
    hierarchyAndScale: "58px thesis, 38px analytical conclusion, 17px deck, 13–18px supporting copy, and peer screenshots at one natural-aspect-ratio height.",
    spacingRhythm: "Use a 12/24/36/54/72px rhythm, with the largest transitions between framing, evidence, and analysis.",
    relationshipLogic: "Shared horizontal rails connect the comparison; violet and vermilion rules identify the two paths without enclosing them.",
    currentAdjustment,
    intentionalOverlaps: [],
  };
}

function mapDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Explain how raw signal becomes an executive decision through one immediately readable spatial relationship.",
    visualThesis: "Conviction is not a leap; it is a visible chain of transformations.",
    compositionStrategy: "Use one continuous horizontal argument with a deliberately overlapping evidence lens at its center.",
    visualLanguage: "Warm white, large near-black editorial type, hairline graphite structure, and one translucent violet focal gesture.",
    evidenceStrategy: "This conceptual prompt needs no app research; the relationship itself is the primary evidence structure.",
    currentFocus: "Resolve the causal chain with exact alignment and one intentional focal overlap.",
    unresolvedOpportunities: [],
    nextMoves: [],
  };
}

function mapSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "stable",
    layoutSystem: "A 1440px horizontal causal rail with four unequal editorial stages aligned to one baseline.",
    primaryAnchor: "The title anchors the upper-left while the oversized interpretation stage becomes the central focal point.",
    hierarchyAndScale: "64px thesis, 30px focal stage, 20px peer stages, and 13–16px explanatory copy.",
    spacingRhythm: "Use 18px internal intervals and 72–108px transitions along the causal rail.",
    relationshipLogic: "A continuous graphite rule establishes sequence; one translucent violet lens overlaps interpretation to show synthesis rather than a separate step.",
    currentAdjustment: "Place every stage on one precise baseline and preserve generous negative space around the central overlap.",
    intentionalOverlaps: ["The violet evidence lens intentionally overlaps the interpretation stage while remaining behind its text."],
  };
}

function genericCompositionState(): CanvasV2CompositionState {
  return {
    dominantAnchor: "generic-transform",
    readingOrder: ["generic-transform"],
    regions: [{
      nodeId: "generic-transform",
      islandId: "generic-transform",
      storyRole: "analysis",
      purpose: "Make the supplied idea legible as a focused visual answer.",
      maturity: "resolved",
      resolutionRationale: "The bounded evidence-free composition is complete.",
      openRequirements: [],
      requiredEvidenceIds: [],
    }],
    preservedNodeIds: ["generic-transform"],
    retiredNodes: [],
    preservedStrengths: ["Direct-on-surface editorial hierarchy"],
    nextTerritory: { relation: "right", anchorNodeId: "generic-transform", intendedFootprint: "nearby", rationale: "A later user turn may extend the resolved composition without rewriting it." },
    regressionRisks: ["Preserve the resolved first island when a later turn requests a separate territory."],
  };
}

function multiIslandCompositionState(includeImplementation: boolean): CanvasV2CompositionState {
  const comparison = {
    nodeId: "single-run-comparison",
    islandId: "single-run-comparison",
    storyRole: "comparison" as const,
    purpose: "Make the governing uncertainty and launch trade-off legible.",
    maturity: "resolved" as const,
    resolutionRationale: "The decision comparison is complete as one bounded semantic job.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  const implementation = {
    nodeId: "single-run-implementation",
    islandId: "single-run-implementation",
    storyRole: "implication" as const,
    purpose: "Turn the chosen direction into an independently editable operating path.",
    maturity: "resolved" as const,
    resolutionRationale: "Scope, learn, decide, and exit are complete as a separate execution territory.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  return {
    dominantAnchor: "single-run-comparison",
    readingOrder: includeImplementation ? [comparison.nodeId, implementation.nodeId] : [comparison.nodeId],
    regions: includeImplementation ? [comparison, implementation] : [comparison],
    preservedNodeIds: includeImplementation ? [comparison.nodeId, implementation.nodeId] : [comparison.nodeId],
    retiredNodes: [],
    preservedStrengths: ["Separate semantic jobs remain independently editable"],
    nextTerritory: includeImplementation
      ? { relation: "none", anchorNodeId: implementation.nodeId, intendedFootprint: "complete", rationale: "Both explicitly separate territories are resolved." }
      : { relation: "right", anchorNodeId: comparison.nodeId, intendedFootprint: "nearby", rationale: "Create the separate implementation territory on the next observed turn." },
    regressionRisks: ["Do not pack the implementation path back inside the comparison island."],
  };
}

function sensemakingCompositionState(includeDecision: boolean): CanvasV2CompositionState {
  const evidenceReading = {
    nodeId: "sensemaking-evidence-reading",
    islandId: "sensemaking-evidence-reading",
    storyRole: "evidence-reading" as const,
    purpose: "Make the relationship between the retained business and marketing signals inspectable.",
    maturity: "resolved" as const,
    resolutionRationale: "The agreement, tension, and evidence boundary are explicit.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  const decision = {
    nodeId: "sensemaking-decision",
    islandId: "sensemaking-decision",
    storyRole: "implication" as const,
    purpose: "Turn the evidence relationship into a bounded next move.",
    maturity: "resolved" as const,
    resolutionRationale: "The recommendation and the signal that would change it are explicit.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  return {
    dominantAnchor: evidenceReading.nodeId,
    readingOrder: includeDecision ? [evidenceReading.nodeId, decision.nodeId] : [evidenceReading.nodeId],
    regions: includeDecision ? [evidenceReading, decision] : [evidenceReading],
    preservedNodeIds: includeDecision ? [evidenceReading.nodeId, decision.nodeId] : [evidenceReading.nodeId],
    retiredNodes: [],
    preservedStrengths: ["The source relationship is readable without repeating the complete evidence packets"],
    nextTerritory: includeDecision
      ? { relation: "none", anchorNodeId: decision.nodeId, intendedFootprint: "complete", rationale: "The evidence reading and its decision implication are both resolved." }
      : { relation: "right", anchorNodeId: evidenceReading.nodeId, intendedFootprint: "one nearby decision territory", rationale: "Translate the evidence relationship into the next responsible move." },
    regressionRisks: ["Do not flatten conflicting signals into false certainty or repeat the source packets as decorative cards."],
  };
}

function validationCompositionState(includeResult: boolean): CanvasV2CompositionState {
  const plan = {
    nodeId: "validation-learning-plan",
    islandId: "validation-learning-plan",
    storyRole: "analysis" as const,
    purpose: "Turn the unresolved onboarding interpretation into one practical human learning action.",
    maturity: "resolved" as const,
    resolutionRationale: "The questions, signals, and decision rule are complete and ready for a person to use.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  const result = {
    nodeId: "validation-learned-result",
    islandId: "validation-learned-result",
    storyRole: "implication" as const,
    purpose: "Show what the supplied conversations changed in the recommendation.",
    maturity: "resolved" as const,
    resolutionRationale: "The supplied finding, its boundary, and the resulting decision are explicit.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  return {
    dominantAnchor: plan.nodeId,
    readingOrder: includeResult ? [plan.nodeId, result.nodeId] : [plan.nodeId],
    regions: includeResult ? [plan, result] : [plan],
    preservedNodeIds: includeResult ? [plan.nodeId, result.nodeId] : [plan.nodeId],
    retiredNodes: [],
    preservedStrengths: ["One focused learning action connects directly to one decision"],
    nextTerritory: includeResult
      ? { relation: "none", anchorNodeId: result.nodeId, intendedFootprint: "complete", rationale: "The learning loop is resolved in this inquiry." }
      : { relation: "below", anchorNodeId: plan.nodeId, intendedFootprint: "nearby", rationale: "A returned finding should become a later chapter below the plan." },
    regressionRisks: ["Keep the person's supplied finding distinct from North Star's interpretation."],
  };
}

function emergentCompositionState(includeDeeperReading: boolean): CanvasV2CompositionState {
  const first = {
    nodeId: "emergent-first-reading",
    islandId: "emergent-first-reading",
    storyRole: "analysis" as const,
    purpose: "Give the apparently simple launch request its first useful visual form.",
    maturity: "resolved" as const,
    resolutionRationale: "The supplied speed-versus-polish trade-off is visibly legible.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  const deeper = {
    nodeId: "emergent-deeper-reading",
    islandId: "emergent-deeper-reading",
    storyRole: "implication" as const,
    purpose: "Resolve the consequential condition exposed by the first composition.",
    maturity: "resolved" as const,
    resolutionRationale: "The reversibility condition and responsible next move are explicit.",
    openRequirements: [],
    requiredEvidenceIds: [],
  };
  return {
    dominantAnchor: first.nodeId,
    readingOrder: includeDeeperReading ? [first.nodeId, deeper.nodeId] : [first.nodeId],
    regions: includeDeeperReading ? [first, deeper] : [first],
    preservedNodeIds: includeDeeperReading ? [first.nodeId, deeper.nodeId] : [first.nodeId],
    retiredNodes: [],
    preservedStrengths: ["The initial visual answer remains intact while the deeper condition gains its own territory"],
    nextTerritory: includeDeeperReading
      ? { relation: "none", anchorNodeId: deeper.nodeId, intendedFootprint: "complete", rationale: "The exposed condition has been resolved into a useful next move." }
      : { relation: "right", anchorNodeId: first.nodeId, intendedFootprint: "one nearby implication", rationale: "The first composition exposed a condition that can materially change the launch choice." },
    regressionRisks: ["Do not rebuild or retract the first island when the deeper question is addressed."],
  };
}

function marketDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Turn an ambiguous market-entry question into a decision landscape that distinguishes facts, assumptions, and strategic choices.",
    visualThesis: "A credible wedge appears where urgent workflow pain, reachable distribution, and a defensible learning loop intersect.",
    compositionStrategy: "Use an asymmetric editorial field: observable signals on the left, a large wedge argument in the center, and sequenced decision horizons below.",
    visualLanguage: "Warm white, near-black type, fine graphite rules, signal blue, assumption amber, and one decisive North Star violet axis.",
    evidenceStrategy: "Keep observable signals and unverified assumptions visibly distinct; this conceptual prompt must not impersonate account research.",
    currentFocus: "Resolve the market-entry decision into a legible spatial argument with explicit uncertainty.",
    unresolvedOpportunities: [],
    nextMoves: [],
  };
}

function marketSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "both",
    layoutSystem: "A 1960px asymmetric editorial field with a 430px signal rail, an 880px wedge argument, and three decision horizons on a shared lower baseline.",
    primaryAnchor: "The oversized entry-wedge statement anchors the center while the evidence taxonomy creates a disciplined left edge.",
    hierarchyAndScale: "68px thesis, 42px wedge, 24px horizon labels, and readable 14–18px supporting copy.",
    spacingRhythm: "Use an 18/30/48/78px rhythm, with deliberate open space around the wedge intersection.",
    relationshipLogic: "Three fine lines converge from pain, reach, and learning into the entry wedge; a lower temporal rail carries now, next, and later decisions.",
    currentAdjustment: "Preserve the asymmetric center of gravity and keep uncertainty labels adjacent to the claims they qualify.",
    intentionalOverlaps: ["The translucent violet wedge sits behind the three converging criteria while all labels remain unobstructed."],
  };
}

function largeDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Prove that the living canvas can expand in both dimensions while preserving a coherent discovery narrative.",
    visualThesis: "Distance can communicate decision scale when every remote region remains connected to one governing question.",
    compositionStrategy: "Place evidence, opportunity, experiment, and decision regions across a large coordinate field connected by one diagonal reading path.",
    visualLanguage: "Warm white, oversized black editorial anchors, fine violet coordinates, and sparse blue and orange semantic signals.",
    evidenceStrategy: "This is a geometric behavior proof with clearly labeled conceptual material, not fabricated product evidence.",
    currentFocus: "Keep distant regions purposeful and connected while making the full two-dimensional extent measurable.",
    unresolvedOpportunities: [],
    nextMoves: [],
  };
}

function largeSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "both",
    layoutSystem: "A 3600×2400 coordinate field with four editorial regions distributed across two axes and connected by a diagonal argument.",
    primaryAnchor: "The governing question at the northwest origin anchors a path that resolves at the southeast decision region.",
    hierarchyAndScale: "72px origin thesis, 44px regional titles, 22px wayfinding labels, and 16px supporting copy.",
    spacingRhythm: "Use large 240–520px transitions between regions and compact 18–36px internal intervals.",
    relationshipLogic: "A single diagonal line and numbered coordinates make the distant regions part of one continuous reading sequence.",
    currentAdjustment: "Fit the complete expanded surface after render without collapsing its intentional spatial distance.",
    intentionalOverlaps: [],
  };
}

const BASE_CSS = `
.northstar-canvas{--ns-ink:#171721;--ns-muted:#666678;--ns-rule:rgba(42,39,66,.13);--ns-violet:#684dff;--ns-orange:#f04b23;box-sizing:border-box;width:2060px;min-width:2060px;min-height:945px;padding:58px 64px 76px;background:#fefdfb;color:var(--ns-ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
.e2e-editorial-header{display:grid;grid-template-columns:minmax(520px,760px) 320px 320px;gap:72px;align-items:start;width:1560px;padding-bottom:34px;border-bottom:1px solid var(--ns-rule)}
.e2e-eyebrow,.e2e-note-label,.e2e-section-label{margin:0;color:var(--ns-violet);font-size:10px;font-weight:850;letter-spacing:.17em;text-transform:uppercase}
.e2e-editorial-header h1{max-width:720px;margin:13px 0 15px;font-size:58px;line-height:.94;letter-spacing:-.058em}
.e2e-deck{max-width:710px;margin:0;color:#4f4f60;font-size:17px;line-height:1.55}
.e2e-note{min-height:96px;padding-left:15px;border-left:2px solid #a89aff}
.e2e-note:last-child{border-left-color:#ffc0ad}
.e2e-note p:last-child{margin:9px 0 0;color:#33333f;font-size:13px;font-weight:650;line-height:1.45}
.e2e-reading-axis{display:grid;grid-template-columns:170px repeat(3,1fr);gap:24px;width:1560px;padding:27px 0 12px}
.e2e-axis-intro{color:#858393;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.e2e-axis-point{padding-top:10px;border-top:1px solid var(--ns-rule);color:#545363;font-size:13px;line-height:1.45}
.e2e-axis-point strong{display:block;margin-bottom:4px;color:#1e1e28;font-size:14px}
.e2e-analysis{display:grid;grid-template-columns:300px 1fr 1fr;column-gap:54px;width:1560px;margin-top:36px;padding-top:31px;border-top:1px solid var(--ns-rule)}
.e2e-analysis-heading h2{margin:11px 0 0;font-size:38px;line-height:1;letter-spacing:-.045em}
.e2e-analysis-column{position:relative;padding-left:20px;border-left:2px solid var(--ns-violet)}
.e2e-analysis-column--whop{border-left-color:var(--ns-orange)}
.e2e-analysis-column h3{margin:0 0 10px;font-size:18px;letter-spacing:-.025em}
.e2e-analysis-column p{max-width:430px;margin:0;color:#555563;font-size:14px;line-height:1.55}
.e2e-analysis-column small{display:block;margin-top:16px;color:#868493;font-size:10px;font-weight:780;letter-spacing:.1em;text-transform:uppercase}
.e2e-conclusion{display:grid;grid-template-columns:300px 1fr;gap:54px;width:1560px;margin-top:42px;padding:33px 0 9px;border-top:1px solid var(--ns-rule)}
.e2e-conclusion blockquote{max-width:920px;margin:0;font-size:32px;font-weight:780;line-height:1.16;letter-spacing:-.035em}
.e2e-conclusion em{color:var(--ns-violet);font-style:normal}
.e2e-refined .canvas-v2-grounded-title{margin-top:26px}
.e2e-refined .canvas-v2-flow-lane{position:relative;padding:24px 0;border-top:1px solid rgba(42,39,66,.08)}
.e2e-refined .canvas-v2-flow-lane:first-of-type{border-top:0}
.e2e-refined .canvas-v2-flow-lane:first-of-type .canvas-v2-flow-app{color:#5135d9}
.e2e-refined .canvas-v2-flow-lane:last-of-type .canvas-v2-flow-app{color:#d83f1d}
.e2e-refined .canvas-v2-flow-screen{filter:drop-shadow(0 13px 22px rgba(31,25,62,.11))}
`;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { revision?: CanvasV2ArtifactRevision; observation?: CanvasV2RenderObservation; instruction?: string; run?: { researchTargets?: string[]; workingContext?: unknown; discoveryState?: CanvasV2DiscoveryState; compositionState?: CanvasV2CompositionState } };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new NextResponse(null, { status: 499 });
  }
  const revision = body.revision;
  if (!revision) return NextResponse.json({ error: "Missing revision" }, { status: 400 });
  if (!body.observation?.spatial || body.observation.spatial.reportedNodeCount !== body.observation.spatial.nodes.length) {
    return NextResponse.json({ error: "Missing exact spatial observation" }, { status: 400 });
  }
  const intermediateResearchCommit = revision.id.startsWith("research-fast-revision-");
  if (
    revision.document.html.includes("data-canvas-v2-canonical-flow")
    && !intermediateResearchCommit
    && !(body.observation.railDetails?.length)
  ) {
    return NextResponse.json({ error: "Missing legible canonical rail detail observations" }, { status: 400 });
  }
  const attempt = Number(request.headers.get("x-canvas-v2-attempt")) || 1;
  const workingContext = parseCanvasV2WorkingContext(body.run?.workingContext);
  const discoveryContextRuntime = buildCanvasV2DiscoveryContextRuntime({
    revision,
    workingContext,
    operation: {
      instruction: body.instruction ?? "",
      phase: workingContext?.scope === "selection" ? "revision" : "composition",
      evidencePolicy: body.run?.researchTargets?.length ? "required" : "available",
      contextProfile: "e2e-design:balanced",
    },
  });
  void discoveryContextRuntime;

  const validationState = body.run?.discoveryState ?? revision.discoveryState;
  const validationId = validationState ? `${validationState.id}:validation:first-commitment` : "";
  const patch96Validation = body.instruction === "Exercise Patch 9.6 human-guided validation"
    || Boolean(validationState?.validationBacklog.some((item) => item.id === validationId));
  if (patch96Validation) {
    const state = validationState;
    if (!state) return NextResponse.json({ error: "Missing validation inquiry state", code: "invalid-request", retryable: false }, { status: 409 });
    const now = new Date().toISOString();
    const graph = syncCanvasV2DiscoveryGraph({
      previous: revision.discoveryGraph,
      revisionId: revision.id,
      updatedAt: now,
      document: revision.document,
      evidencePackets: revision.evidencePackets,
      humanInputs: state.humanInputs,
      sceneTransaction: revision.sceneTransaction,
    });
    const planVisible = revision.document.html.includes('data-e2e-validation-plan="true"');
    const resultVisible = revision.document.html.includes('data-e2e-validation-result="true"');
    const validation = state.validationBacklog.find((item) => item.id === validationId);
    const suppliedResult = [...state.humanInputs].reverse().find((item) => item.kind === "validation-result");

    if (!validation) {
      const uncertaintyId = state.sensemaking?.uncertainties[0]?.id;
      if (!uncertaintyId) return NextResponse.json({ error: "Missing material uncertainty", code: "invalid-request", retryable: false }, { status: 409 });
      const transition: CanvasV2DiscoveryStateTransition = {
        move: {
          id: `${state.id}:move:design-first-commitment-check`,
          kind: "design-validation",
          label: "Shape one focused customer check",
          question: "Does the early account request earn trust or feel premature?",
          rationale: "A handful of immediate reactions will distinguish the two live explanations more efficiently than more interface screenshots.",
          expectedInformationGain: "The words people use at the moment of commitment will show whether value is clear enough to justify the request.",
          sourceCategories: ["canvas"],
          targetNames: [],
          evidenceNodeIds: [],
          cost: "low",
          latency: "short",
          status: "active",
          visibleAction: "compose",
          continueWhen: "The person returns with findings or chooses to defer the check.",
          stopWhen: "The findings change or responsibly preserve the onboarding recommendation.",
        },
        latestUnderstanding: "The onboarding direction turns on whether people understand the value before being asked to create an account.",
        addQuestions: [],
        resolveQuestionIds: [],
        statements: [],
        supersedeStatementIds: [],
        contradictions: [],
        candidates: [],
        validationPlans: [{
          id: validationId,
          kind: "interview",
          title: "Learn what the first commitment communicates",
          question: "Does the account request create confidence or feel premature before its value is clear?",
          whyNow: "This is the one interpretation that could reverse the current onboarding recommendation.",
          method: "Speak with five first-time users immediately after they reach the account request, before explaining the design intent.",
          steps: [
            "What did you expect to happen next?",
            "What made this request feel reasonable—or too early?",
            "What would you need to understand before continuing?",
          ],
          strengthensWhen: "People explain the benefit of the account request in their own words and describe it as reassuring.",
          weakensWhen: "People continue but cannot explain why the account is needed yet.",
          overturnsWhen: "Several people call the request premature or say they would leave at this point.",
          decisionGate: "Keep the early request only if people can explain its value without prompting; otherwise explain value first.",
          linkedUncertaintyIds: [uncertaintyId],
          linkedCandidateIds: [],
          evidenceNodeIds: [],
          priority: "high",
          status: "proposed",
        }],
        validationUpdates: [],
        humanConclusions: [],
        progress: { stage: "composing", label: "Turning the open question into a useful check", detail: "North Star found one small conversation that can meaningfully change the onboarding decision." },
        completion: {
          ...state.completion,
          satisfiedCriteria: [state.completion.criteria[0]!].filter(Boolean),
          materialOpenRequirements: ["Learn how first-time users interpret the unexplained account request."],
          readiness: "not-ready",
          rationale: "The focused human check is ready; the result has not yet been supplied.",
        },
      };
      const discoveryState = applyCanvasV2DiscoveryTransition({ state, transition, graph, now });
      return NextResponse.json({
        decision: {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "edit",
          moveKind: "analysis",
          creativeDirection: direction("Turn the live onboarding hypothesis into one practical, human-owned learning chapter.", ["Return with the conversations and update the recommendation"]),
          spatialStrategy: spatial("Place one open editorial learning chapter on the canvas with a clear question, three prompts, observable signals, and one decision rule.", "vertical"),
          compositionState: validationCompositionState(false),
          reflection: reflection("The current hypothesis is visible but not yet testable.", "One small customer conversation can distinguish confidence from premature commitment.", "Compose the practical check without claiming it has already been run."),
          summary: "Turned the onboarding uncertainty into one focused set of customer conversations and a clear decision rule.",
          expectedVisualResult: "A natural learning chapter shows what to ask, what to listen for, and how the answer changes the onboarding direction.",
          document: {
            html: appendCanvasObject(revision.document.html, '<section data-e2e-validation-plan="true" data-canvas-v2-node-id="validation-learning-plan" data-canvas-v2-design-region data-canvas-v2-story-role="analysis"><p data-canvas-v2-node-id="validation-plan-kicker">The next question</p><h1 data-canvas-v2-node-id="validation-plan-title">Learn whether the first commitment earns trust.</h1><p data-canvas-v2-node-id="validation-plan-deck">Talk with five first-time users at the account request—before explaining the design—and listen for whether its value is already clear.</p><div class="e2e-validation-questions"><article><span>01</span><p>What did you expect to happen next?</p></article><article><span>02</span><p>What made this request feel reasonable—or too early?</p></article><article><span>03</span><p>What would you need to understand before continuing?</p></article></div><div class="e2e-validation-signals"><div><b>Confidence grows</b><p>People explain the benefit in their own words.</p></div><div><b>The case weakens</b><p>People continue but cannot explain why an account is needed yet.</p></div><div><b>Change direction</b><p>Several people call the request premature or say they would leave.</p></div></div><p data-canvas-v2-node-id="validation-plan-gate" class="e2e-validation-gate"><b>Decision rule</b>Keep the early request only if people can explain its value without prompting. Otherwise, explain the value first.</p></section>'),
            css: `${revision.document.css}\n[data-e2e-validation-plan]{box-sizing:border-box;width:1540px;min-height:860px;padding:78px 88px 72px;border-top:3px solid #765cff;background:transparent;color:var(--northstar-ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-validation-plan]>p:first-child{margin:0;color:#765cff;font-size:20px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}[data-e2e-validation-plan] h1{max-width:1120px;margin:24px 0 20px;font:700 64px/1 Georgia,serif;letter-spacing:-.045em}[data-canvas-v2-node-id="validation-plan-deck"]{max-width:980px;margin:0;color:var(--northstar-muted);font-size:25px;line-height:1.5}.e2e-validation-questions{display:grid;grid-template-columns:repeat(3,1fr);gap:34px;margin-top:58px}.e2e-validation-questions article{padding-top:20px;border-top:1px solid var(--northstar-line)}.e2e-validation-questions span{color:#765cff;font-size:18px;font-weight:850}.e2e-validation-questions p{margin:14px 0 0;font:650 27px/1.35 Georgia,serif}.e2e-validation-signals{display:grid;grid-template-columns:repeat(3,1fr);gap:34px;margin-top:50px}.e2e-validation-signals>div{padding-left:18px;border-left:2px solid #765cff}.e2e-validation-signals>div:nth-child(2){border-color:#d89a45}.e2e-validation-signals>div:nth-child(3){border-color:#e56f54}.e2e-validation-signals b{font-size:19px}.e2e-validation-signals p{margin:10px 0 0;color:var(--northstar-muted);font-size:19px;line-height:1.45}.e2e-validation-gate{max-width:1180px;margin:52px 0 0;padding-top:23px;border-top:1px solid var(--northstar-line);font-size:24px;line-height:1.45}.e2e-validation-gate b{margin-right:18px;color:#765cff;font-size:17px;letter-spacing:.12em;text-transform:uppercase}`,
          },
        },
        evidence: revision.evidence,
        discoveryState,
        discoveryProgress: transition.progress,
      });
    }

    if (suppliedResult && !validation.result) {
      const humanNode = graph.nodes.find((node) => node.kind === "human-input" && node.sourceId === suppliedResult.id);
      if (!humanNode) return NextResponse.json({ error: "Missing exact supplied result provenance", code: "invalid-request", retryable: false }, { status: 409 });
      const priorUncertainty = state.sensemaking?.uncertainties[0];
      if (!priorUncertainty) return NextResponse.json({ error: "Missing validation uncertainty", code: "invalid-request", retryable: false }, { status: 409 });
      const transition: CanvasV2DiscoveryStateTransition = {
        move: {
          id: `${state.id}:move:integrate-first-commitment-result`,
          kind: "integrate-validation",
          label: "Update the onboarding recommendation",
          question: validation.question,
          rationale: "The person supplied the requested customer conversations, so the current view can now change from those exact findings.",
          expectedInformationGain: "The supplied language distinguishes confidence from premature commitment.",
          sourceCategories: ["canvas"],
          targetNames: [],
          evidenceNodeIds: [humanNode.id],
          cost: "low",
          latency: "instant",
          status: "completed",
          visibleAction: "compose",
          continueWhen: "A later result materially conflicts with this bounded finding.",
          stopWhen: "The recommendation reflects the supplied conversations and their small-sample boundary.",
          result: "Explain the value before asking for commitment.",
        },
        latestUnderstanding: "The early account request is more likely to feel premature when its value has not yet been explained.",
        addQuestions: [],
        resolveQuestionIds: state.questions.map((question) => question.id),
        statements: [{
          id: `${state.id}:statement:conversation-reading`,
          kind: "interpretation",
          statement: "The supplied conversations weaken the idea that the unexplained account request creates confidence.",
          evidenceNodeIds: [humanNode.id],
          confidence: "medium",
        }],
        supersedeStatementIds: [],
        contradictions: [],
        candidates: [],
        validationPlans: [],
        validationUpdates: [{
          id: validation.id,
          status: "completed",
          result: {
            summary: suppliedResult.summary,
            effect: "weakened",
            evidenceNodeIds: [humanNode.id],
            humanInputId: suppliedResult.id,
          },
        }],
        humanConclusions: [],
        sensemaking: {
          mode: "converging",
          synthesis: "The conversations favor explaining value before requesting an account.",
          operators: [{ id: `${state.id}:operator:conversation-pattern`, kind: "qualitative-pattern", purpose: "Read the supplied first-use reactions for the meaning of the commitment request.", evidenceNodeIds: [humanNode.id] }],
          triangulations: [],
          uncertainties: [{
            ...priorUncertainty,
            status: "narrowed",
            currentBoundary: "The small supplied sample favors premature commitment, but it is not a population estimate.",
            evidenceNodeIds: [humanNode.id],
          }],
          materialEvidenceNodeIds: [humanNode.id],
          backgroundEvidenceNodeIds: [],
          understandingDelta: {
            id: `${state.id}:delta:conversation-result`,
            before: "The early request could either reassure people or feel premature.",
            after: "The early request is more likely to feel premature when its value is unexplained.",
            changedBecause: suppliedResult.summary,
            evidenceNodeIds: [humanNode.id],
          },
        },
        progress: { stage: "composing", label: "Turning the conversations into a decision", detail: "The finding now points to a clearer order for value and commitment." },
        completion: {
          ...state.completion,
          satisfiedCriteria: [...state.completion.criteria],
          materialOpenRequirements: [],
          readiness: "ready",
          rationale: "The supplied conversations support a bounded recommendation and preserve the small-sample limitation.",
        },
      };
      const discoveryState = applyCanvasV2DiscoveryTransition({ state, transition, graph, now });
      return NextResponse.json({
        decision: {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "edit",
          moveKind: "analysis",
          creativeDirection: direction("Respect the person's supplied conversations and show exactly what they changed in the onboarding call.", []),
          spatialStrategy: spatial("Place the finding and revised decision in a distinct chapter below the preserved learning plan.", "vertical"),
          compositionState: validationCompositionState(true),
          reflection: reflection("The person returned with the requested conversations.", "The canvas still shows only the plan, not what the findings changed.", "Add one later chapter that separates the supplied result, North Star's reading, and the bounded decision."),
          summary: "Used the supplied conversations to revise the onboarding recommendation while preserving the small-sample boundary.",
          expectedVisualResult: "A later chapter shows what people said, what that changed, and the resulting onboarding decision.",
          document: {
            html: appendCanvasObject(revision.document.html, '<section data-e2e-validation-result="true" data-canvas-v2-node-id="validation-learned-result" data-canvas-v2-design-region data-canvas-v2-story-role="implication"><p data-canvas-v2-node-id="validation-result-kicker">What the conversations changed</p><h2 data-canvas-v2-node-id="validation-result-title">Explain the value before asking for commitment.</h2><blockquote data-canvas-v2-node-id="validation-result-witness">Four of five people said the account request felt premature because its value was not explained.</blockquote><div class="e2e-validation-result-grid"><div><b>What this suggests</b><p>The request is more likely to create friction than confidence when its purpose is still unclear.</p></div><div><b>What it does not prove</b><p>Five conversations are directional evidence, not a population estimate.</p></div><div><b>The decision now</b><p>Lead with the benefit. Ask for the account only after people can explain why it helps.</p></div></div></section>'),
            css: `${revision.document.css}\n[data-e2e-validation-result]{box-sizing:border-box;width:1360px;min-height:650px;margin:110px 0 0 180px;padding:72px 82px;border-left:4px solid #ed7654;background:transparent;color:var(--northstar-ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-validation-result]>p:first-child{margin:0;color:#ed7654;font-size:19px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}[data-e2e-validation-result] h2{max-width:1020px;margin:26px 0 30px;font:700 56px/1.02 Georgia,serif;letter-spacing:-.043em}[data-e2e-validation-result] blockquote{max-width:1050px;margin:0;padding:20px 0 20px 24px;border-left:2px solid #ed7654;color:var(--northstar-muted);font:500 25px/1.5 Georgia,serif}.e2e-validation-result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:34px;margin-top:50px;padding-top:25px;border-top:1px solid var(--northstar-line)}.e2e-validation-result-grid b{font-size:18px}.e2e-validation-result-grid p{margin:10px 0 0;color:var(--northstar-muted);font-size:19px;line-height:1.48}`,
          },
        },
        evidence: revision.evidence,
        discoveryState,
        discoveryProgress: transition.progress,
      });
    }

    if (!suppliedResult && planVisible) {
      const transition: CanvasV2DiscoveryStateTransition = {
        move: {
          id: `${state.id}:move:ask-for-first-commitment-result`,
          kind: "ask-human",
          label: "Invite the next piece of learning",
          question: "What did people say at the account request?",
          rationale: "The proposed conversations now need the person's choice or findings before the recommendation can responsibly change.",
          expectedInformationGain: "A result, deferral, or rejection determines whether this line should continue.",
          sourceCategories: ["canvas"],
          targetNames: [],
          evidenceNodeIds: [],
          cost: "low",
          latency: "instant",
          status: "active",
          visibleAction: "none",
          continueWhen: "The person supplies findings or explicitly accepts, defers, or rejects the check.",
          stopWhen: "The person's choice is preserved.",
        },
        latestUnderstanding: state.latestUnderstanding,
        addQuestions: [],
        resolveQuestionIds: [],
        statements: [],
        supersedeStatementIds: [],
        contradictions: [],
        candidates: [],
        validationPlans: [],
        validationUpdates: [],
        humanConclusions: [],
        progress: { stage: "waiting", label: "The next learning comes from people", detail: "The focused check is ready whenever you want to run it, change it, or set it aside." },
        completion: { ...state.completion, readiness: "not-ready", rationale: "The practical check is visible; the human-owned result is still open." },
        clarification: { question: "Would you like to run this check, defer it, or use a different one? If you already ran it, tell me what people said.", whyItMatters: "Their language determines whether the account request earns trust or arrives before its value is clear." },
      };
      const discoveryState = applyCanvasV2DiscoveryTransition({ state, transition, graph, now });
      return NextResponse.json({ discoveryState, discoveryProgress: transition.progress, discoveryQuestion: transition.clarification, model: "northstar-e2e-validation-director", fallbackUsed: false, providerAttempts: [] });
    }

    if (resultVisible && validation.result) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Keep the learning plan, supplied finding, and revised onboarding call legible as one continuous story.", []),
        spatialStrategy: spatial("Preserve the plan first and the result below it as two independently editable chapters.", "stable"),
        compositionState: validationCompositionState(true),
        reflection: reflection("The canvas shows the practical check, the person's result, the honest boundary, and the revised decision.", "No material learning requirement remains open in this inquiry.", "Complete without inventing further validation work."),
        summary: "The canvas now connects one focused customer check to the finding it produced and the onboarding decision it changed. The supplied conversations remain distinct from the interpretation, and the small-sample boundary stays visible.",
      },
      evidence: revision.evidence,
      discoveryState: state,
      discoveryProgress: { stage: "concluding", label: "The learning changed the decision", detail: "The check, the finding, and the revised onboarding direction now read as one complete story." },
    });
  }

  if (body.instruction === "Exercise adaptive human judgment before composing") {
    const state = body.run?.discoveryState ?? revision.discoveryState;
    if (!state) return NextResponse.json({ error: "Missing inquiry state", code: "invalid-request", retryable: false }, { status: 409 });
    const transition: CanvasV2DiscoveryStateTransition = {
      move: {
        id: `${state.id}:move:human-judgment`,
        kind: "ask-human",
        label: "Clarify the decision",
        question: "Which outcome should govern the launch decision?",
        rationale: "The canvas would recommend a different path depending on whether near-term adoption or durable retention is the priority.",
        expectedInformationGain: "The answer determines which trade-off the visual decision surface should optimize.",
        sourceCategories: ["canvas"],
        targetNames: [],
        evidenceNodeIds: [],
        cost: "low",
        latency: "instant",
        status: "active",
        visibleAction: "none",
        continueWhen: "The person names the governing launch outcome.",
        stopWhen: "The governing outcome is explicit enough to compose the decision surface.",
      },
      latestUnderstanding: "The launch decision has two materially different success definitions, so one human judgment is necessary before composition.",
      addQuestions: [{ id: `${state.id}:question:launch-outcome`, question: "Which outcome should govern the launch decision?", whyItMatters: "Adoption and retention lead to different recommendations.", priority: "high" }],
      resolveQuestionIds: [],
      statements: [],
      supersedeStatementIds: [],
      contradictions: [],
      candidates: [],
      progress: { stage: "waiting", label: "One decision will shape the answer", detail: "North Star found a choice that would materially change the recommendation." },
      completion: { ...state.completion, readiness: "not-ready", materialOpenRequirements: ["Choose whether adoption or retention governs the launch decision."], rationale: "One material human choice blocks responsible composition." },
      clarification: { question: "Should this launch decision optimize for faster adoption or stronger long-term retention?", whyItMatters: "That choice changes which evidence and trade-offs deserve visual priority." },
    };
    const discoveryState = applyCanvasV2DiscoveryTransition({ state, transition, graph: revision.discoveryGraph, now: new Date().toISOString() });
    return NextResponse.json({ discoveryState, discoveryProgress: transition.progress, discoveryQuestion: transition.clarification, model: "northstar-e2e-discovery-director", fallbackUsed: false, providerAttempts: [] });
  }

  if (body.instruction === "Research the current market signal and show only the one external source that earns canvas space.") {
    const promotedPacket = CANVAS_V2_E2E_EXTERNAL_EVIDENCE_PACKETS.find((packet) => packet.presentation?.state === "promoted")!;
    const promotedVisible = revision.document.html.includes(`data-canvas-v2-evidence-packet-id="${promotedPacket.id}"`);
    if (!promotedVisible) return NextResponse.json({
      snapshotEvidencePackets: [promotedPacket],
      retrievedEvidencePackets: CANVAS_V2_E2E_EXTERNAL_EVIDENCE_PACKETS,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: {
        stage: "investigating",
        label: "Checking the world beyond the board",
        detail: "North Star found one material primary witness and retained one corroborating source in discovery memory.",
      },
      researchStatus: [],
      model: "northstar-e2e-openai-web-search",
      fallbackUsed: false,
      providerAttempts: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: externalDirection(),
        spatialStrategy: externalSpatial(),
        reflection: reflection("The material primary web witness is visible with its citation, date, source-native finding, metric, image, and limitation intact.", "The corroborating source already supports the discovery graph and would repeat the same semantic job on the canvas.", "Complete after observing that one external witness earned canvas space and the supporting source remained in research memory."),
        summary: "North Star researched the current signal, kept both traceable sources in discovery memory, and promoted only the material primary witness to the canvas.",
      },
      evidence: revision.evidence,
      evidencePackets: revision.evidencePackets,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "concluding", label: "External discovery resolved", detail: "The material source is visible; supporting research remains available without overloading the canvas." },
      researchStatus: [],
      model: "northstar-e2e-openai-web-search",
      fallbackUsed: false,
      providerAttempts: [],
    });
  }

  if (body.instruction === "Exercise Patch 9.5 multi-source sensemaking") {
    const packetsVisible = CANVAS_V2_E2E_EVIDENCE_PACKETS.initial.every((packet) => revision.document.html.includes(`data-canvas-v2-evidence-packet-id="${packet.id}"`));
    if (!packetsVisible) return NextResponse.json({
      snapshotEvidencePackets: CANVAS_V2_E2E_EVIDENCE_PACKETS.initial,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "investigating", label: "Reading the signals together", detail: "The relevant business and marketing snapshots are now available for comparison." },
      researchStatus: [],
      model: "northstar-e2e-account-evidence-materializer",
      fallbackUsed: false,
      providerAttempts: [],
    });
    const evidenceReadingVisible = revision.document.html.includes("data-e2e-sensemaking-reading");
    const decisionVisible = revision.document.html.includes("data-e2e-sensemaking-decision");
    if (!evidenceReadingVisible) {
      const state = body.run?.discoveryState ?? revision.discoveryState;
      if (!state) return NextResponse.json({ error: "Missing inquiry state", code: "invalid-request", retryable: false }, { status: 409 });
      const evidenceByPacket = new Map<string, string>();
      for (const node of revision.discoveryGraph?.nodes ?? []) {
        if (node.status !== "active" || (node.kind !== "fact" && node.kind !== "metric") || !node.packetId) continue;
        if (!evidenceByPacket.has(node.packetId)) evidenceByPacket.set(node.packetId, node.id);
      }
      const evidenceNodeIds = Array.from(evidenceByPacket.values()).slice(0, 3);
      const transition: CanvasV2DiscoveryStateTransition = {
        move: {
          id: `${state.id}:move:signal-comparison`,
          kind: "compare",
          label: "Compare message with operating proof",
          question: "Does the customer promise align with the operating evidence behind it?",
          rationale: "The relationship changes whether the next move should amplify the message or strengthen its proof.",
          expectedInformationGain: "Separate an attractive promise from the evidence that can responsibly support it.",
          sourceCategories: ["marketing", "business"],
          targetNames: ["Awin"],
          evidenceNodeIds,
          cost: "low",
          latency: "short",
          status: "completed",
          visibleAction: "compose",
          continueWhen: "The relationship points to a specific action that is not yet visible.",
          stopWhen: "The evidence relationship, boundary, and responsible next move are clear.",
        },
        latestUnderstanding: "Awin's confidence-led message and publisher-success role point in the same direction, but the snapshots do not yet show that the message itself produces durable growth.",
        addQuestions: [],
        resolveQuestionIds: state.questions.map((question) => question.id),
        statements: [],
        supersedeStatementIds: [],
        contradictions: [],
        candidates: [{ id: `${state.id}:candidate:proof`, kind: "opportunity", label: "Strengthen the proof behind the promise", rationale: "The message is coherent with the operating focus, while impact remains unproven.", evidenceNodeIds }],
        sensemaking: {
          mode: "converging",
          synthesis: "The promise and operating focus reinforce one another, but the available snapshots support coherence—not impact.",
          operators: [{ id: `${state.id}:operator:positioning`, kind: "positioning-message", purpose: "Compare the public promise with the operating evidence that could support it.", evidenceNodeIds }],
          triangulations: [{
            id: `${state.id}:triangulation:promise-proof`,
            question: "Does the promise align with the organization's visible operating focus?",
            relationship: "convergent",
            synthesis: "The confidence-led campaign message aligns with a publisher-success operating role.",
            evidenceNodeIds: evidenceNodeIds.slice(0, 2),
            confidence: "medium",
            limitations: ["The snapshots show alignment, not whether the message creates the observed response."],
          }],
          uncertainties: [{
            id: `${state.id}:uncertainty:impact`,
            label: "Whether the promise produces durable publisher growth",
            status: "narrowed",
            decisionImpact: "high",
            currentBoundary: "The available snapshots establish message-to-operation alignment but not durable customer impact.",
            whatWouldChangeIt: "A cohort-aligned outcome view connecting message exposure with retained publisher activity.",
            evidenceNodeIds,
          }],
          materialEvidenceNodeIds: evidenceNodeIds,
          backgroundEvidenceNodeIds: [],
          understandingDelta: {
            id: `${state.id}:delta:coherence-not-impact`,
            before: "The engagement signal appeared to validate the campaign promise.",
            after: "The evidence supports a coherent promise, while durable impact remains unproven.",
            changedBecause: "The operating snapshot corroborates the focus but cannot connect the campaign to an outcome.",
            evidenceNodeIds,
          },
        },
        progress: { stage: "comparing", label: "Separating promise from proof", detail: "The signals reinforce the same direction, but they support a narrower conclusion than the engagement number alone suggests." },
        completion: { ...state.completion, satisfiedCriteria: [], materialOpenRequirements: [], readiness: "ready", rationale: "The evidence relationship and its boundary are explicit; the decision implication remains to be composed." },
      };
      const discoveryState = applyCanvasV2DiscoveryTransition({ state, transition, graph: revision.discoveryGraph, now: new Date().toISOString() });
      return NextResponse.json({
        decision: {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "edit",
          moveKind: "analysis",
          creativeDirection: direction("Separate a coherent market promise from the proof required to trust its impact.", ["Turn the narrower reading into a bounded decision"]),
          spatialStrategy: spatial("Place one direct-on-surface evidence reading beside the retained source packets.", "both"),
          compositionState: sensemakingCompositionState(false),
          reflection: reflection("The source packets are visible but their relationship is not yet explained.", "The responsible decision still needs a separate territory.", "Compose the agreement and boundary first, then observe it before recommending action."),
          summary: "Separated the promise the snapshots support from the impact they cannot yet prove.",
          expectedVisualResult: "A natural evidence reading shows where the signals agree and where the conclusion must stop.",
          document: {
            html: insertBeforeGroundedEvidence(revision.document.html, '<section data-e2e-sensemaking-reading="true" data-canvas-v2-node-id="sensemaking-evidence-reading" data-canvas-v2-design-region data-canvas-v2-story-role="evidence-reading" data-canvas-v2-visual-role="signal-relationship"><p data-canvas-v2-node-id="sensemaking-reading-kicker">What the signals actually say</p><h1 data-canvas-v2-node-id="sensemaking-reading-title">The promise is coherent.<br/>Its impact is not yet proven.</h1><div data-canvas-v2-node-id="sensemaking-reading-axis" class="sensemaking-reading-axis"><article data-canvas-v2-node-id="sensemaking-message"><span>Marketing signal</span><strong>“Grow partnerships with confidence”</strong><p>The campaign makes a clear promise and the captured response shows initial attention.</p></article><p data-canvas-v2-node-id="sensemaking-relationship" class="sensemaking-relationship">aligns with</p><article data-canvas-v2-node-id="sensemaking-operation"><span>Operating signal</span><strong>Publisher success has visible ownership.</strong><p>The business snapshot shows an operating role consistent with the promise.</p></article></div><p data-canvas-v2-node-id="sensemaking-boundary" class="sensemaking-boundary"><b>What this does not prove</b>The snapshots do not connect campaign exposure to retained publisher growth.</p></section>'),
            css: `${revision.document.css}\n[data-e2e-sensemaking-reading]{box-sizing:border-box;width:1720px;min-height:760px;padding:86px 94px 78px;border-top:3px solid #f17c39;background:transparent;color:#f5f2ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-sensemaking-reading]>p:first-child{margin:0;color:#f17c39;font-size:26px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}[data-e2e-sensemaking-reading] h1{max-width:1200px;margin:34px 0 70px;font:700 68px/.98 Georgia,serif;letter-spacing:-.05em}.sensemaking-reading-axis{display:grid;grid-template-columns:1fr 180px 1fr;gap:48px;align-items:center}.sensemaking-reading-axis article{padding-top:26px;border-top:1px solid rgba(245,242,255,.28)}.sensemaking-reading-axis span{color:#b7adc8;font-size:24px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.sensemaking-reading-axis strong{display:block;margin:22px 0 16px;font-size:34px;line-height:1.2}.sensemaking-reading-axis p{margin:0;color:#c9c3d3;font-size:27px;line-height:1.45}.sensemaking-relationship{margin:0;color:#f17c39;font-size:24px;text-align:center;text-transform:uppercase;letter-spacing:.12em}.sensemaking-boundary{max-width:1180px;margin:68px 0 0;padding:25px 0 0;border-top:1px solid rgba(241,124,57,.55);color:#c9c3d3;font-size:27px;line-height:1.45}.sensemaking-boundary b{display:block;margin-bottom:9px;color:#f17c39;font-size:23px;text-transform:uppercase;letter-spacing:.1em}`,
          },
        },
        evidence: revision.evidence,
        evidencePackets: revision.evidencePackets,
        discoveryState,
        discoveryProgress: transition.progress,
        researchStatus: [],
      });
    }
    if (!decisionVisible) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: direction("Turn the evidence boundary into a useful, reversible commercial move.", []),
        spatialStrategy: spatial("Place a distinct decision territory beside the evidence reading without repeating the source packets.", "horizontal"),
        compositionState: sensemakingCompositionState(true),
        reflection: reflection("The promise-to-proof relationship is visible and honestly bounded.", "Its responsible commercial implication is not yet visible.", "Add one separate action territory that states what to do now and what would change the call."),
        summary: "Turned the narrower evidence reading into a reversible next move.",
        expectedVisualResult: "A separate decision territory recommends testing the promise while naming the retained-growth signal that would earn expansion.",
        document: {
          html: appendCanvasObject(revision.document.html, '<section data-e2e-sensemaking-decision="true" data-canvas-v2-node-id="sensemaking-decision" data-canvas-v2-design-region data-canvas-v2-story-role="implication" data-canvas-v2-visual-role="decision-boundary"><p data-canvas-v2-node-id="sensemaking-decision-kicker">The decision</p><h2 data-canvas-v2-node-id="sensemaking-decision-title">Test the promise.<br/>Do not scale the claim yet.</h2><p data-canvas-v2-node-id="sensemaking-decision-copy">Use the coherent message in a bounded publisher campaign, then expand only if exposed cohorts retain meaningful activity.</p><div data-canvas-v2-node-id="sensemaking-decision-gate"><span>What would change the call</span><strong>Message exposure followed by retained publisher growth.</strong></div></section>'),
          css: `${revision.document.css}\n[data-e2e-sensemaking-decision]{box-sizing:border-box;width:1120px;min-height:620px;margin:120px 0 0 1840px;padding:78px 86px;border-left:4px solid #684dff;background:transparent;color:#f5f2ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-sensemaking-decision]>p:first-child{margin:0;color:#aa9cff;font-size:25px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}[data-e2e-sensemaking-decision] h2{max-width:860px;margin:38px 0 34px;font:700 60px/1 Georgia,serif;letter-spacing:-.045em}[data-e2e-sensemaking-decision]>p:nth-of-type(2){max-width:820px;margin:0;color:#c9c3d3;font-size:28px;line-height:1.5}[data-canvas-v2-node-id="sensemaking-decision-gate"]{margin-top:58px;padding-top:25px;border-top:1px solid rgba(170,156,255,.48)}[data-canvas-v2-node-id="sensemaking-decision-gate"] span{display:block;margin-bottom:12px;color:#aa9cff;font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}[data-canvas-v2-node-id="sensemaking-decision-gate"] strong{font-size:28px;line-height:1.4}`,
        },
      },
      evidence: revision.evidence,
      evidencePackets: revision.evidencePackets,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "composing", label: "Turning the evidence into a decision", detail: "The narrower reading now points to a reversible test and a clear signal for expanding it." },
      researchStatus: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Keep the source relationship and its bounded decision legible as one publication.", []),
        spatialStrategy: spatial("Preserve both resolved analytical territories and the source evidence beneath them.", "stable"),
        compositionState: sensemakingCompositionState(true),
        reflection: reflection("The source relationship and decision are visible as two independently editable territories.", "No material request remains unresolved.", "Complete with the evidence boundary and expansion signal intact."),
        summary: "The canvas now shows what the business and marketing signals support, what they do not prove, and the reversible next move that follows.",
      },
      evidence: revision.evidence,
      evidencePackets: revision.evidencePackets,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "concluding", label: "The decision is clear", detail: "The useful signal, its boundary, and the next move are all visible without repeating the source record." },
      researchStatus: [],
    });
  }

  if (body.instruction === "Exercise emergent depth from a simple canvas request") {
    const firstVisible = revision.document.html.includes("data-e2e-emergent-first");
    const deeperVisible = revision.document.html.includes("data-e2e-emergent-deeper");
    if (!firstVisible) {
      const state = body.run?.discoveryState ?? revision.discoveryState;
      if (!state) return NextResponse.json({ error: "Missing inquiry state", code: "invalid-request", retryable: false }, { status: 409 });
      const discoveryState = applyCanvasV2EmergentDepthSignal({
        state,
        signal: parseCanvasV2EmergentDepthSignal({
          recommendation: "deepen",
          rationale: "The recommendation changes if a failed launch is difficult to reverse.",
          materialQuestion: "How reversible is the launch if the first signal is wrong?",
          evidenceNeed: "useful",
          sourceCategories: ["canvas"],
        }),
        now: new Date().toISOString(),
      });
      return NextResponse.json({
        decision: {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "edit",
          moveKind: "composition",
          creativeDirection: direction("Make the supplied launch trade-off immediately legible before deciding whether it is sufficient.", ["Resolve the reversibility condition exposed by the comparison"]),
          spatialStrategy: spatial("Place one compact direct answer on the open canvas.", "stable"),
          compositionState: emergentCompositionState(false),
          reflection: reflection("The request appears to be a simple speed-versus-polish choice.", "The rendered comparison exposes reversibility as a consequential missing condition.", "Commit the useful first answer, then investigate that condition without retracting it."),
          summary: "Created the first launch trade-off and found one condition that could change the call.",
          expectedVisualResult: "A compact speed-versus-polish comparison appears as the first stable island.",
          document: {
            html: '<main class="emergent-depth-canvas" data-canvas-v2-node-id="emergent-depth-canvas"><section data-e2e-emergent-first="true" data-canvas-v2-node-id="emergent-first-reading" data-canvas-v2-design-region data-canvas-v2-story-role="analysis" data-canvas-v2-visual-role="launch-tradeoff"><p data-canvas-v2-node-id="emergent-first-kicker">The first read</p><h1 data-canvas-v2-node-id="emergent-first-title">Move fast when learning<br/>is worth more than polish.</h1><div data-canvas-v2-node-id="emergent-first-axis"><span>Learning speed</span><i>↔</i><span>Finish confidence</span></div><p data-canvas-v2-node-id="emergent-first-copy">A pilot wins when the first move is small enough to teach without creating a commitment the team cannot unwind.</p></section></main>',
            css: '.emergent-depth-canvas{box-sizing:border-box;display:grid;grid-template-columns:1500px 1120px;gap:220px;width:3080px;min-height:980px;padding:120px;background:transparent;color:#f5f2ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-emergent-first]{box-sizing:border-box;min-height:690px;padding:84px 92px;border-top:3px solid #f17c39;background:transparent}[data-e2e-emergent-first]>p:first-child{margin:0;color:#f17c39;font-size:26px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}[data-e2e-emergent-first] h1{max-width:1180px;margin:42px 0 68px;font:700 70px/.98 Georgia,serif;letter-spacing:-.05em}[data-canvas-v2-node-id="emergent-first-axis"]{display:grid;grid-template-columns:1fr 100px 1fr;align-items:center;padding:26px 0;border-top:1px solid rgba(245,242,255,.28);border-bottom:1px solid rgba(245,242,255,.28);font-size:26px;font-weight:780;text-transform:uppercase;letter-spacing:.08em}[data-canvas-v2-node-id="emergent-first-axis"] span:last-child{text-align:right}[data-canvas-v2-node-id="emergent-first-axis"] i{color:#f17c39;font-style:normal;text-align:center}[data-canvas-v2-node-id="emergent-first-copy"]{max-width:980px;margin:54px 0 0;color:#c9c3d3;font-size:29px;line-height:1.5}',
          },
        },
        evidence: revision.evidence,
        discoveryState,
        discoveryProgress: { stage: "understanding", label: "A condition changes the choice", detail: "The first comparison is useful, and it reveals that reversibility determines how much polish is responsible." },
      });
    }
    if (!deeperVisible) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: direction("Resolve the newly important reversibility condition without disturbing the first comparison.", []),
        spatialStrategy: spatial("Add one distinct implication beside the preserved first island.", "horizontal"),
        compositionState: emergentCompositionState(true),
        reflection: reflection("The first island is committed and the reversibility condition is now explicit.", "The condition has not yet been turned into an operational decision.", "Add a separate decision gate beside the preserved comparison."),
        summary: "Resolved the newly important condition into a clear launch gate.",
        expectedVisualResult: "A second island explains when a pilot is responsible and when polish must come first.",
        document: {
          html: appendCanvasObject(revision.document.html, '<section data-e2e-emergent-deeper="true" data-canvas-v2-node-id="emergent-deeper-reading" data-canvas-v2-design-region data-canvas-v2-story-role="implication" data-canvas-v2-visual-role="reversibility-gate"><p data-canvas-v2-node-id="emergent-deeper-kicker">The condition that changes the call</p><h2 data-canvas-v2-node-id="emergent-deeper-title">Reversibility sets the quality bar.</h2><p data-canvas-v2-node-id="emergent-deeper-copy">Choose the pilot only when a weak signal can be contained, corrected, and learned from. If failure would damage trust or create an irreversible commitment, earn confidence before launch.</p><div data-canvas-v2-node-id="emergent-deeper-gate"><span>Default</span><strong>Pilot when the move is reversible.</strong></div></section>'),
          css: `${revision.document.css}\n[data-e2e-emergent-deeper]{box-sizing:border-box;min-height:620px;margin-top:70px;padding:78px 82px;border-left:4px solid #684dff;background:transparent;color:#f5f2ff}[data-e2e-emergent-deeper]>p:first-child{margin:0;color:#aa9cff;font-size:24px;font-weight:850;letter-spacing:.11em;text-transform:uppercase}[data-e2e-emergent-deeper] h2{max-width:820px;margin:38px 0 32px;font:700 58px/1 Georgia,serif;letter-spacing:-.045em}[data-e2e-emergent-deeper]>p:nth-of-type(2){margin:0;color:#c9c3d3;font-size:28px;line-height:1.5}[data-canvas-v2-node-id="emergent-deeper-gate"]{margin-top:54px;padding-top:24px;border-top:1px solid rgba(170,156,255,.46)}[data-canvas-v2-node-id="emergent-deeper-gate"] span{display:block;margin-bottom:12px;color:#aa9cff;font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}[data-canvas-v2-node-id="emergent-deeper-gate"] strong{font-size:30px}`,
        },
      },
      evidence: revision.evidence,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "composing", label: "Turning the condition into a launch gate", detail: "The first answer remains intact while the newly important condition becomes a clear decision." },
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Preserve the initial answer and the deeper launch condition as one coherent decision story.", []),
        spatialStrategy: spatial("Keep both resolved territories together in the compact two-dimensional composition.", "stable"),
        compositionState: emergentCompositionState(true),
        reflection: reflection("The direct answer and the consequential condition are both visible.", "No material requirement remains unresolved.", "Complete after both progressive islands survive observation."),
        summary: "The canvas began with a direct answer, deepened when reversibility became consequential, and finished with a clear launch gate.",
      },
      evidence: revision.evidence,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "concluding", label: "The launch choice is resolved", detail: "The quick comparison and the condition that changes it are both visible and editable." },
    });
  }

  if (body.instruction === "Exercise mixed Awin product and external discovery") {
    const awin = CANVAS_V2_E2E_APPS.find((app) => app.name === "Awin")!;
    const flow = awin.flows[0]!;
    const promotedPacket = CANVAS_V2_E2E_EXTERNAL_EVIDENCE_PACKETS.find((packet) => packet.presentation?.state === "promoted")!;
    const flowVisible = revision.document.html.includes(`data-canvas-v2-canonical-flow="${flow.id}"`);
    const externalVisible = revision.document.html.includes(`data-canvas-v2-evidence-packet-id="${promotedPacket.id}"`);
    if (!flowVisible) {
      const researchDecision = {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "research" as const,
        moveKind: "research" as const,
        creativeDirection: direction("Ground the product journey first while retaining the parallel external research memory.", ["Materialize the one promoted external witness"]),
        spatialStrategy: spatial("Place the complete product sequence before the independently earned external witness.", "horizontal"),
        reflection: reflection("Neither the requested product flow nor the external witness is visible yet.", "Both sources were retrieved, but each requires its own observed transaction.", "Commit the complete product flow while carrying all external packets into revision memory."),
        appId: awin.id,
        flowId: flow.id,
        summary: "Retrieved the Awin product flow while retaining the parallel external research set.",
        expectedVisualResult: "The complete Awin flow appears first; the external witness remains queued in discovery memory.",
      };
      const catalog = { tenantId: "e2e", apps: CANVAS_V2_E2E_APPS };
      const researchIndex = buildCanvasV2ResearchCatalogIndex(catalog, body.instruction, revision, body.run?.researchTargets);
      return NextResponse.json({
        decision: researchDecision,
        research: canvasV2ResearchResultForFlow(awin, flow),
        retrievedEvidencePackets: CANVAS_V2_E2E_EXTERNAL_EVIDENCE_PACKETS,
        researchStatus: canvasV2ResearchStatusForDecision(researchIndex, researchDecision),
      });
    }
    if (!externalVisible) return NextResponse.json({
      snapshotEvidencePackets: [promotedPacket],
      retrievedEvidencePackets: CANVAS_V2_E2E_EXTERNAL_EVIDENCE_PACKETS,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "investigating", label: "Connecting the outside signal", detail: "The product journey is committed; one material external witness now earns a separate canvas territory." },
      researchStatus: [],
      model: "northstar-e2e-openai-web-search",
      fallbackUsed: false,
      providerAttempts: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: externalDirection(),
        spatialStrategy: externalSpatial(),
        reflection: reflection("The complete product flow and one material external witness are both visible as separate source-native territories.", "The corroborating web source remains in discovery memory and needs no duplicate island.", "Complete after both retrieved source types have survived distinct render-before-commit transactions."),
        summary: "North Star preserved the mixed discovery result: a complete product journey, one earned external witness, and one supporting web source in research memory.",
      },
      evidence: revision.evidence,
      evidencePackets: revision.evidencePackets,
      discoveryState: body.run?.discoveryState ?? revision.discoveryState,
      discoveryProgress: { stage: "concluding", label: "Mixed discovery resolved", detail: "Product truth and the material outside signal are visible without duplicating supporting research." },
      researchStatus: [],
      model: "northstar-e2e-openai-web-search",
      fallbackUsed: false,
      providerAttempts: [],
    });
  }

  if (body.instruction === "Show snapshot-only Awin intelligence with marketing and business evidence.") {
    const packetsVisible = CANVAS_V2_E2E_EVIDENCE_PACKETS.initial.every((packet) => revision.document.html.includes(`data-canvas-v2-evidence-packet-id="${packet.id}"`));
    if (!packetsVisible) {
      return NextResponse.json({
        snapshotEvidencePackets: CANVAS_V2_E2E_EVIDENCE_PACKETS.initial,
        researchStatus: [],
        model: "northstar-e2e-account-evidence-materializer",
        fallbackUsed: false,
        providerAttempts: [],
      });
    }
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: snapshotDirection(),
        spatialStrategy: snapshotSpatial(),
        reflection: reflection("The authorized marketing and business snapshots are visible, legible, and independently inspectable.", "No snapshot-only fixture requirement remains open.", "Complete after observing the committed evidence transaction."),
        summary: "North Star placed the authorized Awin marketing and business snapshots directly on the canvas without adding an unrelated product flow. Their captures, facts, metrics, provenance, and limitations remain independently inspectable.",
      },
      evidence: revision.evidence,
      researchStatus: [],
      model: "northstar-e2e-snapshot-verifier",
      fallbackUsed: false,
      providerAttempts: [],
    });
  }

  if (body.instruction?.includes("Continue the workshop from my written priority")) {
    const targetNodeId = workingContext?.editableNodeIds.includes("priority-answer-field") ? "priority-answer-field" : undefined;
    const targetRange = targetNodeId ? findCanvasV2SourceNodeRange(revision.document.html, targetNodeId) : undefined;
    const humanText = targetRange ? revision.document.html.slice(targetRange.openEnd, targetRange.closeStart).replace(/<[^>]+>/g, "").trim() : "";
    if (!targetNodeId || !targetRange || !humanText || !/data-canvas-v2-last-author=["']user["']/.test(revision.document.html.slice(targetRange.start, targetRange.openEnd))) {
      return NextResponse.json({ error: "The continuation requires the exact human-written priority field.", code: "invalid-request", retryable: false }, { status: 409 });
    }
    if (revision.document.html.includes("data-e2e-writable-continuation")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Continue the workshop from the selected human priority without rewriting it.", []),
        spatialStrategy: spatial("Preserve the human field and place one supporting Northstar response beside the established workshop.", "stable"),
        reflection: reflection("The human priority remains intact and the new response turns it into a concrete next move.", "No collaboration requirement remains open.", "Complete after observing preserved mixed authorship."),
        summary: `Kept your priority—“${humanText}”—intact and added a focused next step for turning it into a testable customer conversation.`,
      },
      evidence: revision.evidence,
    });
    const continuation = `<aside data-e2e-writable-continuation="true" data-canvas-v2-node-id="priority-continuation" data-canvas-v2-design-region data-canvas-v2-story-role="implication" data-canvas-v2-territory-relation="right" data-canvas-v2-placement-mode="attached" data-canvas-v2-territory-anchor="writable-workshop" data-canvas-v2-target-zone="middle-right"><p data-canvas-v2-node-id="continuation-kicker">Northstar continuation</p><h2 data-canvas-v2-node-id="continuation-title">Make the pain observable before making the solution persuasive.</h2><p data-canvas-v2-node-id="continuation-copy">Use the next conversation to capture the trigger, present workaround, and cost of doing nothing. Keep the answer field as the human-owned decision anchor.</p></aside>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: direction("Continue the workshop from the selected human priority without rewriting it.", []),
        spatialStrategy: spatial("Preserve the human field and place one supporting Northstar response beside the established workshop.", "horizontal"),
        reflection: reflection("The selected field contains a durable human priority.", "The board needs a bounded next step that responds to that priority.", "Add one adjacent implication while preserving the selected object byte-for-byte."),
        summary: "Added a focused Northstar continuation beside the preserved human priority.",
        expectedVisualResult: "The original workshop and human-written field remain unchanged beside one concise next-step island.",
        document: {
          html: appendCanvasObject(revision.document.html, continuation),
          css: `${revision.document.css}\n[data-e2e-writable-continuation]{box-sizing:border-box;width:720px;min-height:360px;padding:52px 58px;border-left:3px solid #d85d3f;background:var(--northstar-surface);color:var(--northstar-ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-writable-continuation] p{margin:0;font-size:28px;line-height:1.45}[data-e2e-writable-continuation] p:first-child{color:#d85d3f;font-size:28px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}[data-e2e-writable-continuation] h2{margin:28px 0 24px;font:700 48px/1.02 Georgia,serif;letter-spacing:-.04em}`,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction?.includes("Exercise writable surface closure")
    || /60-minute founder workshop/i.test(body.instruction ?? "")) {
    if (revision.document.html.includes("data-e2e-writable-surface")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Create a workshop surface whose visible writing areas are genuine native objects.", []),
        spatialStrategy: spatial("Preserve the compact workshop field and every independently editable object.", "stable"),
        reflection: reflection("The writing surfaces are visible, selectable, and declared as native writable objects.", "No interaction affordance remains unresolved.", "Complete after observing the editable workshop field."),
        summary: "Created a focused workshop with three real writing areas for priorities, evidence, and the next decision.",
      },
      evidence: revision.evidence,
    });
    const workshop = `<section data-e2e-writable-surface="true" data-canvas-v2-node-id="writable-workshop" data-canvas-v2-design-region data-canvas-v2-story-role="title" aria-label="Writable workshop"><p data-canvas-v2-node-id="writable-kicker">Working session · human input</p><h1 data-canvas-v2-node-id="writable-title">Turn the open question into a shared decision.</h1><p data-canvas-v2-node-id="writable-intro">Each quiet block below is a real canvas object. Select it, double-click, and write directly into the composition.</p><article class="e2e-layout-surface" data-canvas-v2-node-id="editable-layout-surface"><p class="e2e-editable-copy">Double-click any word in this sentence and the caret belongs exactly there.</p><div class="e2e-layout-rail"><div data-canvas-v2-node-id="editable-mixed-label">01 / EVIDENCE <b>5/6</b><span data-canvas-v2-node-id="editable-mixed-state">OBSERVED</span></div><span>Name the evidence</span><span>Record the decision</span></div></article><div class="e2e-writable-grid"><div><p data-canvas-v2-node-id="priority-label">Priority to test</p><div class="e2e-writing-field" data-canvas-v2-node-id="priority-answer-field" data-canvas-v2-writable="true" aria-label="Priority answer field"></div></div><div><p data-canvas-v2-node-id="evidence-label">Evidence we need</p><div class="e2e-writing-field" data-canvas-v2-node-id="evidence-notes-field" data-canvas-v2-writable="true" aria-label="Evidence notes field"></div></div><div><p data-canvas-v2-node-id="decision-label">Next decision</p><div class="e2e-writing-field" data-canvas-v2-node-id="decision-record-field" data-canvas-v2-writable="true" aria-label="Decision record field"></div></div></div><p data-canvas-v2-node-id="writable-footer">The structure stays Northstar-authored; what you write becomes durable human truth.</p></section>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: direction("Create a workshop surface whose visible writing areas are genuine native objects.", []),
        spatialStrategy: spatial("Place one compact three-part working field near the active viewport.", "horizontal"),
        reflection: reflection("The canvas does not yet contain a human-input workshop.", "The user needs visible writing areas that behave like real objects.", "Author the complete workshop with explicit native writable semantics."),
        summary: "Created a focused workshop with directly editable writing areas.",
        expectedVisualResult: "A polished workshop appears with three independently selectable blank writing fields.",
        document: {
          html: appendCanvasObject(revision.document.html, workshop),
          css: `${revision.document.css}\n[data-e2e-writable-surface]{box-sizing:border-box;width:1420px;min-height:850px;padding:64px 72px;border-top:3px solid #6b4dff;background:var(--northstar-surface);color:var(--northstar-ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-writable-surface]>p{margin:0}[data-e2e-writable-surface]>p:first-child{color:#6b4dff;font-size:28px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}[data-e2e-writable-surface] h1{max-width:960px;margin:22px 0 24px;font:700 64px/.98 Georgia,serif;letter-spacing:-.045em}[data-e2e-writable-surface]>p:nth-of-type(2){max-width:900px;color:var(--northstar-muted);font-size:28px;line-height:1.45}.e2e-layout-surface{box-sizing:border-box;display:grid;grid-template-rows:auto 1fr;row-gap:24px;width:100%;min-height:180px;margin-top:42px;padding:28px 32px;border-left:3px solid #6b4dff;background:rgba(107,77,255,.045);font-size:24px}.e2e-layout-surface .e2e-editable-copy{margin:0;color:var(--northstar-ink);font:650 30px/1.25 Georgia,serif}.e2e-layout-surface .e2e-layout-rail{display:grid;grid-template-columns:repeat(3,1fr);column-gap:28px;margin-top:12px}.e2e-layout-surface .e2e-layout-rail span,.e2e-layout-surface .e2e-layout-rail div{color:var(--northstar-muted);font-size:24px;line-height:1.3}.e2e-layout-surface .e2e-layout-rail b{color:var(--northstar-ink);font-weight:800}.e2e-writable-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:56px}.e2e-writable-grid>div>p{margin:0 0 14px;color:#6b4dff;font-size:28px;font-weight:820;letter-spacing:.08em;text-transform:uppercase}.e2e-writing-field{box-sizing:border-box;width:100%;height:170px;padding:22px 24px;border:1px solid var(--northstar-line);border-radius:10px;background:var(--northstar-surface-subtle);color:var(--northstar-ink);font-size:28px;line-height:1.42;text-align:left}.e2e-writing-field:focus{border-color:#6b4dff;box-shadow:0 0 0 3px rgba(107,77,255,.12)}[data-e2e-writable-surface]>p:last-child{margin-top:36px;color:var(--northstar-muted);font-size:28px;font-style:italic}`,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction?.includes("Exercise collaboration continuation closure")) {
    const targetNodeId = workingContext?.editableNodeIds.length === 1 ? workingContext.editableNodeIds[0] : undefined;
    if (workingContext?.scope !== "selection" || workingContext.selectionPolicy !== "modify" || !targetNodeId) {
      return NextResponse.json({ error: "Missing exact editable collaboration target", code: "invalid-request", retryable: false }, { status: 409 });
    }
    const targetRange = findCanvasV2SourceNodeRange(revision.document.html, targetNodeId);
    if (!targetRange) return NextResponse.json({ error: "Collaboration target no longer exists", code: "invalid-request", retryable: false }, { status: 409 });
    const selectedText = revision.document.html.slice(targetRange.openEnd, targetRange.closeStart).replace(/<[^>]+>/g, "").trim();

    if (revision.document.html.includes('data-e2e-collaboration-final="true"')) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Continue from the exact human-modified selection without rebuilding the board.", []),
        spatialStrategy: spatial("Preserve geometry, identity, camera ownership, and every unselected object.", "stable"),
        reflection: reflection("The stable selected object now contains the continuation written from the human revision.", "No collaboration repair remains.", "Complete after observing the verified mixed-authorship result."),
        summary: "Northstar continued from the exact human-modified canvas and preserved its authorship history.",
      },
      evidence: revision.evidence,
    });

    if (!revision.document.html.includes('data-e2e-collaboration-partial="true"')) {
      const marked = markCanvasObject(revision.document.html, targetNodeId, 'data-e2e-collaboration-partial="true"');
      return NextResponse.json({
        decision: {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "edit",
          moveKind: "refinement",
          creativeDirection: direction("Begin one bounded selected-text collaboration turn, then pause safely.", ["Continue from any human revision made during the pause"]),
          spatialStrategy: spatial("Keep the selected object's stable identity and geometry unchanged.", "stable"),
          reflection: reflection("The selected human object is the only authorized target.", "The turn must pause after one verified partial edit.", "Write the partial text without touching the rest of the board."),
          summary: "Created a verified partial draft on the selected human object.",
          expectedVisualResult: "Only the selected text reads “Northstar partial draft.” and its stable object identity remains unchanged.",
          document: {
            html: replaceCanvasObjectText(marked, targetNodeId, "Northstar partial draft."),
            css: revision.document.css,
          },
        },
        evidence: revision.evidence,
      });
    }

    if (selectedText === "Northstar partial draft.") return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Complete the bounded selected-text draft and leave it ready for human revision.", []),
        spatialStrategy: spatial("Preserve the selected object's stable identity, geometry, and surrounding canvas.", "stable"),
        reflection: reflection("The selected human object now contains the requested partial draft.", "The object is ready for a human revision in the normal conversation flow.", "Complete without exposing a synthetic provider failure."),
        summary: "Created a bounded draft on the selected object and left the rest of the canvas unchanged.",
      },
      evidence: revision.evidence,
    });

    const targetContext = workingContext.objects.find((object) => object.nodeId === targetNodeId);
    if (selectedText !== "Human continuation edit."
      || targetContext?.textPreview !== "Human continuation edit."
      || targetContext.lastAuthor !== "user"
      || targetContext.editVersion < 3) {
      return NextResponse.json({ error: "Continuation did not receive the latest human-authored scene context", code: "invalid-request", retryable: false }, { status: 409 });
    }
    const marked = markCanvasObject(revision.document.html, targetNodeId, 'data-e2e-collaboration-final="true"');
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "refinement",
        creativeDirection: direction("Continue from the exact human-modified selection without rebuilding the board.", []),
        spatialStrategy: spatial("Keep the selected object's stable identity and geometry unchanged.", "stable"),
        reflection: reflection("The continuation context contains the user's latest text, authorship, and edit version.", "One bounded continuation remains.", "Revise only that exact human-modified object."),
        summary: "Continued from the latest human revision on the selected object.",
        expectedVisualResult: "The same selected object reads “Northstar continued from the human revision.” and every surrounding object remains unchanged.",
        document: {
          html: replaceCanvasObjectText(marked, targetNodeId, "Northstar continued from the human revision."),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction?.includes("Rewrite this selected heading to Evidence-led decision.")) {
    const targetNodeId = workingContext?.editableNodeIds.length === 1 ? workingContext.editableNodeIds[0] : undefined;
    if (workingContext?.scope !== "selection" || workingContext.selectionPolicy !== "modify" || !targetNodeId) {
      return NextResponse.json({ error: "Missing exact editable selection context", code: "invalid-request", retryable: false }, { status: 409 });
    }
    const targetRange = findCanvasV2SourceNodeRange(revision.document.html, targetNodeId);
    if (!targetRange) return NextResponse.json({ error: "Selected target no longer exists", code: "invalid-request", retryable: false }, { status: 409 });
    const selectedText = revision.document.html.slice(targetRange.openEnd, targetRange.closeStart).replace(/<[^>]+>/g, "").trim();
    if (selectedText !== "Evidence-led decision.") {
      return NextResponse.json({
        decision: {
          schema: CANVAS_V2_DECISION_SCHEMA,
          decision: "edit",
          moveKind: "refinement",
          creativeDirection: direction("Apply the requested selected-heading rewrite without touching the surrounding composition.", []),
          spatialStrategy: spatial("Preserve all native geometry and change only the selected heading's text.", "stable"),
          reflection: reflection("The selected heading is the only authorized target.", "The requested wording must be committed and observed.", "Make one exact stable-node text replacement."),
          summary: "Rewrote only the selected heading.",
          expectedVisualResult: "The selected heading reads “Evidence-led decision.” while every unselected object remains unchanged.",
          document: {
            html: replaceCanvasObjectText(revision.document.html, targetNodeId, "Evidence-led decision."),
            css: revision.document.css,
          },
        },
        evidence: revision.evidence,
      });
    }
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Hold the exact selected-heading revision and preserve the rest of the board.", []),
        spatialStrategy: spatial("Preserve the verified selected-object result and all surrounding geometry.", "stable"),
        reflection: reflection("The exact selected heading now carries the requested wording.", "No further selected-object work remains.", "Complete after observing the bounded revision."),
        summary: "The selected heading was updated without rebuilding or changing the surrounding canvas.",
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction?.includes("Prove Patch 9.1 with Awin") || body.instruction?.includes("Continue Patch 9.1 Awin research")) {
    const continuation = body.instruction.includes("Continue Patch 9.1 Awin research");
    const awin = CANVAS_V2_E2E_APPS.find((app) => app.name === "Awin")!;
    const flow = continuation
      ? awin.flows.find((candidate) => candidate.id === "flow:awin:marketing-continuation")!
      : awin.flows[0]!;
    const flowIsVisible = revision.document.html.includes(`data-canvas-v2-canonical-flow="${flow.id}"`);
    if (!flowIsVisible) {
      const packets = continuation ? CANVAS_V2_E2E_EVIDENCE_PACKETS.continuation : CANVAS_V2_E2E_EVIDENCE_PACKETS.initial;
      const researchDecision = {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "research" as const,
        moveKind: "research" as const,
        creativeDirection: direction(
          continuation ? "Extend the existing Awin evidence thread without rewriting its human-modified objects." : "Ground the Awin discovery in product, marketing, and business account evidence.",
          [],
        ),
        spatialStrategy: spatial(
          continuation ? "Append the later packet to the existing evidence island and keep every earlier native object stable." : "Place the complete screenshot sequence beside compact inspectable marketing and business evidence islands.",
          continuation ? "stable" : "horizontal",
        ),
        reflection: reflection(
          continuation ? "The first Awin packet and any human edits remain committed." : "The surface has no connected Awin evidence yet.",
          continuation ? "The later authorized audience snapshot has not been added." : "Product captures, marketing signals, and business context are all material to this proof.",
          continuation ? "Append the later packet into the same lineage thread." : "Retrieve one mixed, source-inspectable evidence transaction.",
        ),
        appId: awin.id,
        flowId: flow.id,
        summary: continuation ? "Extended the Awin evidence thread with a later authorized audience snapshot." : "Retrieved Awin product screenshots, marketing signals, and connected business context.",
        expectedVisualResult: continuation ? "The earlier evidence island remains unchanged while its later source objects append natively." : "A complete Awin flow and two compact grounded evidence islands appear as independently selectable native objects.",
      };
      const catalog = { tenantId: "e2e", apps: CANVAS_V2_E2E_APPS };
      const researchIndex = buildCanvasV2ResearchCatalogIndex(catalog, body.instruction, revision, body.run?.researchTargets);
      return NextResponse.json({
        decision: researchDecision,
        research: canvasV2ResearchResultForFlow(awin, flow, packets),
        researchStatus: canvasV2ResearchStatusForDecision(researchIndex, researchDecision),
      });
    }
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction(continuation ? "Preserve the extended evidence thread and the exact human-modified object." : "Hold the mixed grounded Awin discovery surface.", []),
        spatialStrategy: spatial(continuation ? "Preserve the progressively extended source island and its nearby product evidence." : "Preserve the complete mixed evidence composition.", "stable"),
        reflection: reflection(continuation ? "The second source packet is visible in the original evidence thread." : "Product, marketing, and business evidence are visible with their boundaries.", "No 9.1 fixture requirement remains open.", "Complete from the verified canvas."),
        summary: continuation
          ? "North Star extended the same Awin evidence thread with a later audience snapshot while preserving the earlier canvas and human edits. The new source remains independently inspectable."
          : "North Star grounded the canvas in Awin’s complete product journey, connected marketing message, measured fixture signal, and business context. Each source remains inspectable, and the evidence boundaries make clear what the data does—and does not—prove.",
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction === "Audit partial research for Awin and Ghost" || body.instruction === "Interrupt Awin and Ghost research") {
    if (body.instruction === "Interrupt Awin and Ghost research") await new Promise((resolve) => setTimeout(resolve, 700));
    const catalog = { tenantId: "e2e", apps: CANVAS_V2_E2E_APPS };
    const researchIndex = buildCanvasV2ResearchCatalogIndex(catalog, body.instruction, revision, body.run?.researchTargets);
    const awin = CANVAS_V2_E2E_APPS.find((app) => app.name === "Awin")!;
    const flow = awin.flows[0]!;
    if (!researchIndex.visibleFlowIds.includes(flow.id)) {
      const researchDecision = {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "research" as const,
        moveKind: "research" as const,
        creativeDirection: direction("Ground the available Awin evidence and preserve Ghost as an explicit account limitation.", ["State the unavailable evidence limitation"]),
        spatialStrategy: spatial("Extend the canonical evidence rail for the one available requested product.", "horizontal"),
        reflection: reflection("Neither requested product is grounded yet.", "Awin has a usable flow while Ghost is unavailable in this account.", "Materialize the available Awin flow before resolving the limitation."),
        appId: awin.id,
        flowId: flow.id,
        summary: `Retrieved the complete ${awin.name} onboarding flow and placed it on the visible working surface.`,
        expectedVisualResult: "Awin's complete ordered screenshots are visible while Ghost remains truthfully unavailable.",
      };
      return NextResponse.json({
        decision: researchDecision,
        research: canvasV2ResearchResultForFlow(awin, flow),
        researchStatus: canvasV2ResearchStatusForDecision(researchIndex, researchDecision),
      });
    }
    if (!revision.document.html.includes("data-e2e-research-limitation")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: direction("Present available evidence without fabricating symmetry for an unavailable product.", ["Complete with the limitation preserved"]),
        spatialStrategy: spatial("Place one direct-on-surface limitation note beneath the available canonical evidence.", "vertical"),
        reflection: reflection("Awin is visibly grounded and Ghost is unavailable.", "The unavailable state must become explicit on the canvas.", "Add one factual limitation note without creating a placeholder flow."),
        summary: "Made the unavailable Ghost evidence explicit without fabricating a comparison lane.",
        expectedVisualResult: "A factual Ghost evidence limitation appears beneath the complete Awin flow.",
        document: {
          html: appendCanvasObject(revision.document.html, '<p data-e2e-research-limitation="true" data-canvas-v2-research-unavailable="Ghost" data-canvas-v2-node-id="ghost-research-limitation">Ghost evidence unavailable in this account.</p>'),
          css: `${revision.document.css}\n[data-e2e-research-limitation]{margin:40px 0 0;padding-top:20px;border-top:1px solid rgba(35,31,55,.16);color:#756f67;font:600 14px/1.5 Inter,sans-serif}`,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Present available evidence without fabricating symmetry for an unavailable product.", []),
        spatialStrategy: spatial("Preserve the complete Awin evidence rail and its open limitation context.", "stable"),
        reflection: reflection("Awin is visibly grounded and Ghost is explicitly unavailable.", "No unresolved research remains.", "Complete with a truthful partial-research summary."),
        summary: "Awin is grounded with its complete flow. Evidence unavailable in this account: Ghost.",
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (body.instruction === "Fail design without mutation" || (body.instruction === "Retry design once" && attempt === 1)) {
    return NextResponse.json({ error: "The deterministic design provider is temporarily unavailable.", code: "provider-unavailable", retryable: true }, { status: 503 });
  }

  if (body.instruction === "Retry design once") {
    if (revision.document.html.includes("data-e2e-retry-revision")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Prove that a recovered logical request commits exactly one revision.", []),
        spatialStrategy: spatial("Preserve the single recovered marker on the committed surface.", "stable"),
        reflection: reflection("One recovered revision is committed and visible.", "No duplicate candidate or additional edit remains.", "Complete after observing the one accepted retry result."),
        summary: "The provider recovered and exactly one verified revision was committed.",
      },
      evidence: revision.evidence,
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "refinement",
        creativeDirection: direction("Prove that a recovered logical request commits exactly one revision.", ["Observe the recovered revision before completion"]),
        spatialStrategy: spatial("Place one compact recovery marker without changing the wider canvas.", "stable"),
        reflection: reflection("The committed canvas is intact after the transient failure.", "One recovered revision must be rendered and observed.", "Author exactly one marker from the accepted response."),
        summary: "Committed the one recovered provider revision.",
        expectedVisualResult: "Exactly one recovered revision marker is visible.",
        document: {
          html: appendCanvasObject(revision.document.html, '<p data-e2e-retry-revision="true" data-canvas-v2-node-id="retry-revision">Recovered provider revision</p>'),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction === "Keep designing until I stop") {
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (revision.document.html.includes('data-canvas-v2-node-id="late-lifecycle-revision"')) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Prove that stopped design work cannot publish a late revision.", []),
        spatialStrategy: spatial("Keep the one accepted lifecycle marker stable.", "stable"),
        reflection: reflection("The delayed lifecycle marker is already committed.", "No duplicate lifecycle edit is permitted.", "Complete from the observed revision."),
        summary: "The delayed lifecycle revision was observed exactly once.",
      },
      evidence: revision.evidence,
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: direction("Prove that stopped design work cannot publish a late revision.", []),
        spatialStrategy: spatial("Keep the clean canvas stable while the lifecycle test owns the timing.", "stable"),
        reflection: reflection("The committed canvas remains unchanged.", "A delayed candidate would demonstrate stale publication if accepted.", "Prepare one delayed revision for the stop boundary."),
        summary: "Prepared a delayed lifecycle revision.",
        expectedVisualResult: "The delayed revision is visible only if the active run still owns it.",
        document: {
          html: appendCanvasObject(revision.document.html, '<p data-canvas-v2-node-id="late-lifecycle-revision">Late lifecycle revision</p>'),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction === "Exercise lifecycle edit limit") {
    const completedSteps = Array.from(revision.document.html.matchAll(/data-e2e-lifecycle-step=/g)).length;
    if (completedSteps >= 8) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Resolve the bounded lifecycle proof without inventing another edit.", []),
        spatialStrategy: spatial("Preserve the eight verified lifecycle marks on the committed surface.", "stable"),
        reflection: reflection("Eight committed and observed revisions are visible.", "No further visual work is required for this lifecycle proof.", "Declare completion only now, after continuation returned the verified canvas."),
        summary: "The continued run reviewed the preserved canvas and declared the lifecycle proof complete.",
      },
      evidence: revision.evidence,
    });
    const nextStep = completedSteps + 1;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "refinement",
        creativeDirection: direction("Make every committed lifecycle revision visible and countable.", ["Continue until the safe boundary"]),
        spatialStrategy: spatial(`Place verified lifecycle revision ${nextStep} on the existing reading rail.`, "stable"),
        reflection: reflection(`${completedSteps} lifecycle revisions are currently committed.`, "The safe boundary has not yet been reached.", `Commit and observe lifecycle revision ${nextStep}.`),
        summary: `Committed lifecycle revision ${nextStep}.`,
        expectedVisualResult: `Eight compact lifecycle marks are eventually visible on the clean canvas.`,
        document: {
          html: appendCanvasObject(revision.document.html, `<span data-e2e-lifecycle-step="${nextStep}" data-canvas-v2-node-id="lifecycle-step-${nextStep}">${nextStep}</span>`),
          css: `${revision.document.css}\n[data-e2e-lifecycle-step]{display:inline-grid;place-items:center;width:42px;height:42px;margin:8px;border:1px solid #d8d2ff;border-radius:50%;color:#5f4ce0;font:700 14px/1 Inter,sans-serif}`,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction?.toLowerCase().includes("spatial relationship map")) {
    if (revision.document.html.includes("data-e2e-spatial-map")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The four-stage causal rail is balanced, the reading order is immediate, and the single overlap clearly marks interpretation as the synthesis point.", "No spatial correction remains for the requested relationship map.", "Completion preserves the resolved geometry instead of adding unnecessary structure."),
        summary: "The visible relationship map now presents a precise editorial path from signal to decision.",
      },
      evidence: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "relationship",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The current surface has no authored relationship structure.", "The requested causal stages need a precise shared axis and focal synthesis point.", "A single direct-on-surface rail communicates sequence more clearly than separate containers."),
        summary: "Composed a precise causal relationship from signal through evidence and interpretation to decision.",
        expectedVisualResult: "Four editorial stages align on one continuous rail, with one intentional violet overlap emphasizing interpretation.",
        document: {
          html: `<main class="northstar-canvas e2e-spatial-map" data-e2e-spatial-map="true" data-canvas-v2-node-id="canvas" aria-label="Editorial relationship map"><section class="map-composition" data-canvas-v2-node-id="map-composition" data-canvas-v2-design-region data-canvas-v2-story-role="title" data-canvas-v2-visual-role="causal-relationship-map"><header data-canvas-v2-node-id="map-header"><p data-canvas-v2-node-id="map-kicker">North Star reasoning model</p><h1 data-canvas-v2-node-id="map-title">From signal to conviction.</h1><p data-canvas-v2-node-id="map-deck">A decision becomes trustworthy when every transformation remains visible.</p></header><section data-canvas-v2-node-id="causal-rail" data-canvas-v2-relationship-source="stage-signal" data-canvas-v2-relationship-target="stage-decision" class="map-rail"><article data-canvas-v2-node-id="stage-signal" class="map-stage"><span data-canvas-v2-node-id="signal-index">01</span><h2 data-canvas-v2-node-id="signal-title">Signal</h2><p data-canvas-v2-node-id="signal-copy">Something changed.</p></article><article data-canvas-v2-node-id="stage-evidence" class="map-stage"><span data-canvas-v2-node-id="evidence-index">02</span><h2 data-canvas-v2-node-id="evidence-title">Evidence</h2><p data-canvas-v2-node-id="evidence-copy">The change becomes observable.</p></article><article data-canvas-v2-node-id="stage-interpretation" class="map-stage map-stage--focus"><div data-canvas-v2-node-id="evidence-lens" class="map-lens" aria-label="Intentional evidence and interpretation overlap"></div><span data-canvas-v2-node-id="interpretation-index">03</span><h2 data-canvas-v2-node-id="interpretation-title">Interpretation</h2><p data-canvas-v2-node-id="interpretation-copy">Evidence acquires meaning in context.</p></article><article data-canvas-v2-node-id="stage-decision" class="map-stage"><span data-canvas-v2-node-id="decision-index">04</span><h2 data-canvas-v2-node-id="decision-title">Decision</h2><p data-canvas-v2-node-id="decision-copy">Conviction becomes action.</p></article></section><footer data-canvas-v2-node-id="map-footer"><p data-canvas-v2-node-id="map-implication">The quality of the decision is limited by the least visible transformation.</p></footer></section></main>`,
          css: `.northstar-canvas{--ink:#18171f;--muted:#706e7c;--line:rgba(35,31,55,.20);--violet:#6b4dff;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}.map-composition{box-sizing:border-box;width:1800px;min-width:1800px;min-height:1120px;padding:74px 92px 72px;background:var(--northstar-surface)}.e2e-spatial-map header{display:grid;grid-template-columns:1fr 560px;column-gap:100px;width:1616px}.e2e-spatial-map header>p:first-child{grid-column:1/-1;margin:0 0 18px;color:var(--violet);font-size:28px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}.e2e-spatial-map h1{margin:0;font-size:68px;line-height:.94;letter-spacing:-.06em}.e2e-spatial-map header>p:last-child{align-self:end;margin:0;color:var(--muted);font-size:28px;line-height:1.4}.map-rail{position:relative;display:grid;grid-template-columns:300px 330px 480px 330px;gap:56px;align-items:center;width:1616px;margin-top:120px}.map-rail::before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:var(--line)}.map-stage{position:relative;z-index:1;min-height:250px;padding:36px 18px 28px 0;background:var(--northstar-surface)}.map-stage span{color:#8d899a;font-size:24px;font-weight:800;letter-spacing:.12em;white-space:nowrap}.map-stage h2{margin:30px 0 14px;font-size:40px;letter-spacing:-.035em}.map-stage p{max-width:320px;margin:0;color:var(--muted);font-size:28px;line-height:1.35}.map-stage--focus{padding-left:84px;background:transparent}.map-stage--focus h2{position:relative;margin-top:23px;font-size:44px}.map-stage--focus span,.map-stage--focus p{position:relative}.map-lens{position:absolute;z-index:-1;left:12px;top:-46px;width:340px;height:340px;border:2px solid rgba(107,77,255,.28);border-radius:50%;background:rgba(107,77,255,.09)}.e2e-spatial-map footer{width:1616px;margin-top:112px;padding-top:28px;border-top:2px solid var(--line)}.e2e-spatial-map footer p{max-width:980px;margin:0;font-size:28px;font-weight:720;line-height:1.3;letter-spacing:-.025em}`,
        },
      },
      evidence: [],
    });
  }

  if (body.instruction?.toLowerCase().includes("market-entry decision landscape")) {
    if (revision.document.html.includes("data-e2e-market-landscape")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: marketDirection(),
        spatialStrategy: marketSpatial(),
        reflection: reflection("The market question is now a legible, non-dashboard spatial argument: facts and assumptions remain distinct, three criteria converge on one wedge, and the temporal decisions resolve below.", "No material communication gap remains for this conceptual decision landscape.", "Complete without adding decorative structure or fabricated evidence."),
        summary: "The market-entry landscape now separates evidence from assumptions and resolves the wedge across immediate, next, and later decisions.",
      },
      evidence: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: marketDirection(),
        spatialStrategy: marketSpatial(),
        reflection: reflection("The current surface has no authored decision model.", "The startup needs a way to see which claims are observed, which are assumed, and where a credible entry wedge exists.", "Compose one direct-on-surface decision landscape rather than a generic collection of cards."),
        summary: "Composed a market-entry decision landscape that makes evidence, assumptions, convergence, and timing immediately inspectable.",
        expectedVisualResult: "A premium asymmetric decision field distinguishes observed signals from assumptions and connects three wedge criteria to sequenced decisions.",
        document: {
          html: `<main class="northstar-canvas market-landscape" data-e2e-market-landscape="true" data-canvas-v2-node-id="canvas" aria-label="Market entry decision landscape"><section class="northstar-canvas market-composition" data-canvas-v2-node-id="market-composition" data-canvas-v2-design-region data-canvas-v2-story-role="title" data-canvas-v2-visual-role="market-entry-landscape"><header data-canvas-v2-node-id="market-header"><p data-canvas-v2-node-id="market-kicker">North Star · market entry</p><h1 data-canvas-v2-node-id="market-title">Find the wedge<br/>that teaches fastest.</h1><p data-canvas-v2-node-id="market-deck">A decision landscape for entering a vertical SaaS market without confusing confidence with evidence.</p></header><aside data-canvas-v2-node-id="signal-rail" class="signal-rail"><p data-canvas-v2-node-id="signal-label">Observed signals</p><ol data-canvas-v2-node-id="signal-list"><li data-canvas-v2-node-id="signal-one"><strong>Workflow pain</strong><span>Repeated manual reconciliation</span></li><li data-canvas-v2-node-id="signal-two"><strong>Reachable buyer</strong><span>A concentrated operator community</span></li><li data-canvas-v2-node-id="signal-three"><strong>Learning velocity</strong><span>Usage reveals value inside one week</span></li></ol><div data-canvas-v2-node-id="assumption-note" class="assumption-note"><b>Assumption · unverified</b><span>The end user can influence budget.</span></div></aside><section data-canvas-v2-node-id="wedge-field" class="wedge-field"><div data-canvas-v2-node-id="wedge-shape" class="wedge-shape"></div><p data-canvas-v2-node-id="criterion-pain" class="criterion criterion--pain">Urgent enough<br/>to change</p><p data-canvas-v2-node-id="criterion-reach" class="criterion criterion--reach">Narrow enough<br/>to reach</p><p data-canvas-v2-node-id="criterion-learn" class="criterion criterion--learn">Fast enough<br/>to learn</p><div data-canvas-v2-node-id="entry-wedge" class="entry-wedge"><span>The entry wedge</span><h2>Own reconciliation<br/>before owning workflow.</h2><p>Start where pain is frequent, the buyer is reachable, and each use produces proprietary learning.</p></div></section><section data-canvas-v2-node-id="decision-horizons" class="decision-horizons"><p data-canvas-v2-node-id="horizons-label">Decision horizons</p><article data-canvas-v2-node-id="horizon-now"><span>Now · 0–30 days</span><h3>Prove pain frequency.</h3><p>Observe ten real reconciliations and measure the cost of delay.</p></article><article data-canvas-v2-node-id="horizon-next"><span>Next · 30–90 days</span><h3>Prove repeatable reach.</h3><p>Test whether one channel can create five qualified learning loops.</p></article><article data-canvas-v2-node-id="horizon-later"><span>Later · after signal</span><h3>Expand from evidence.</h3><p>Broaden the workflow only after retention identifies the durable job.</p></article></section><footer data-canvas-v2-node-id="market-footer">Evidence narrows the choice. The choice creates the next evidence.</footer></section></main>`,
          css: `.northstar-canvas{--ink:#17171f;--muted:#6d6b78;--rule:rgba(34,31,53,.16);--violet:#684dff;--blue:#2f6fff;--amber:#c47a20;position:relative;box-sizing:border-box;width:2140px;min-width:2140px;min-height:1420px;padding:64px 80px 72px;background:#fefdfb;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}.market-landscape header{width:1080px}.market-landscape header>p:first-child{margin:0 0 16px;color:var(--violet);font-size:28px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}.market-landscape h1{margin:0;font-size:72px;line-height:.91;letter-spacing:-.062em}.market-landscape header>p:last-child{max-width:880px;margin:20px 0 0;color:var(--muted);font-size:28px;line-height:1.35}.signal-rail{position:absolute;left:80px;top:420px;width:470px;border-top:2px solid var(--rule);padding-top:16px}.signal-rail>p{margin:0 0 14px;color:var(--blue);font-size:28px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}.signal-rail ol{list-style:none;margin:0;padding:0}.signal-rail li{display:grid;grid-template-columns:48px 1fr;padding:12px 0;border-top:1px solid rgba(34,31,53,.09);counter-increment:signal;font-size:28px}.signal-rail li::before{content:"0" counter(signal);color:#8f8b99;font-size:24px}.signal-rail strong,.signal-rail span{display:block}.signal-rail strong{font-size:24px}.signal-rail span{grid-column:2;margin-top:3px;color:var(--muted);font-size:24px;line-height:1.25}.assumption-note{margin-top:18px;padding-left:16px;border-left:3px solid #e1a24f;font-size:24px}.assumption-note b,.assumption-note span{display:block}.assumption-note b{color:var(--amber);font-size:24px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.assumption-note span{margin-top:6px;color:#55525f;font-size:24px;line-height:1.25}.wedge-field{position:absolute;left:620px;top:280px;width:1440px;height:620px;font-size:24px}.wedge-shape{position:absolute;left:390px;top:100px;width:500px;height:390px;background:rgba(104,77,255,.08);clip-path:polygon(0 0,100% 50%,0 100%)}.criterion{position:absolute;margin:0;color:#5b5868;font-size:28px;font-weight:720;line-height:1.2}.criterion::after{content:"";position:absolute;height:2px;background:var(--rule);transform-origin:left}.criterion--pain{left:0;top:80px}.criterion--pain::after{left:220px;top:36px;width:300px;transform:rotate(18deg)}.criterion--reach{left:0;top:280px}.criterion--reach::after{left:220px;top:30px;width:310px}.criterion--learn{left:0;top:490px}.criterion--learn::after{left:220px;top:5px;width:300px;transform:rotate(-18deg)}.entry-wedge{position:absolute;left:600px;top:165px;width:740px;font-size:24px}.entry-wedge span{color:var(--violet);font-size:24px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}.entry-wedge h2{margin:14px 0 16px;font-size:44px;line-height:.98;letter-spacing:-.05em}.entry-wedge p{max-width:700px;margin:0;color:var(--muted);font-size:28px;line-height:1.35}.decision-horizons{position:absolute;left:620px;top:960px;display:grid;grid-template-columns:210px repeat(3,365px);gap:24px;width:1440px;padding-top:18px;border-top:2px solid var(--rule);font-size:24px}.decision-horizons>p{margin:0;color:#817d8e;font-size:28px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.decision-horizons article{padding-left:14px;border-left:2px solid var(--rule);font-size:24px}.decision-horizons span{color:var(--violet);font-size:24px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}.decision-horizons h3{margin:10px 0 7px;font-size:40px;line-height:1;letter-spacing:-.035em}.decision-horizons article p{max-width:340px;margin:0;color:var(--muted);font-size:28px;line-height:1.25}.market-landscape footer{position:absolute;left:80px;bottom:72px;width:470px;padding-top:16px;border-top:2px solid var(--rule);font-size:24px;font-weight:720;line-height:1.25;letter-spacing:-.025em}`,
        },
      },
      evidence: [],
    });
  }

  if (body.instruction?.toLowerCase().includes("large two-dimensional discovery landscape")) {
    if (revision.document.html.includes("data-e2e-large-canvas")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: largeDirection(),
        spatialStrategy: largeSpatial(),
        reflection: reflection("The full 3600 by 2400 surface is rendered as one connected discovery argument with meaningful content at every extreme.", "No clipping or disconnected region remains.", "Complete after the runtime has observed the expanded geometry."),
        summary: "The expanded discovery landscape remains coherent and fully inspectable across both spatial axes.",
      },
      evidence: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: largeDirection(),
        spatialStrategy: largeSpatial(),
        reflection: reflection("The current surface is still at its minimum geometry.", "The real-use proof needs purposeful content at distant bounds in both dimensions.", "Author one connected coordinate field so runtime growth, capture, fitting, and inspection are exercised together."),
        summary: "Expanded the living canvas into a connected two-dimensional discovery landscape.",
        expectedVisualResult: "Four distant editorial regions remain visible on a 3600 by 2400 warm-white surface joined by a continuous diagonal argument.",
        document: {
          html: `<main class="northstar-canvas large-landscape" data-e2e-large-canvas="true" data-canvas-v2-node-id="canvas" aria-label="Large two-dimensional discovery landscape"><svg data-canvas-v2-node-id="landscape-path" class="landscape-path" viewBox="0 0 3300 2060" aria-label="Discovery path" data-canvas-v2-relationship-source="large-origin" data-canvas-v2-relationship-target="large-decision" data-canvas-v2-visual-role="discovery-path"><path d="M240 270 C850 300 760 900 1500 940 S2380 1180 3060 1810"/><circle cx="240" cy="270" r="8"/><circle cx="1500" cy="940" r="8"/><circle cx="3060" cy="1810" r="8"/></svg><header data-canvas-v2-node-id="large-origin" data-canvas-v2-design-region data-canvas-v2-island-id="large-origin" data-canvas-v2-story-role="title" class="large-region origin"><span>01 · governing question</span><h1>Where does uncertainty<br/>become useful?</h1><p>Follow the discovery path from raw evidence to a decision worth making.</p></header><section data-canvas-v2-node-id="large-evidence" data-canvas-v2-design-region data-canvas-v2-island-id="large-evidence" data-canvas-v2-story-role="evidence-reading" class="large-region evidence"><span>02 · evidence field</span><h2>What changed?</h2><p>Separate the observed behavior from the story the team tells about it.</p></section><section data-canvas-v2-node-id="large-opportunity" data-canvas-v2-design-region data-canvas-v2-island-id="large-opportunity" data-canvas-v2-story-role="analysis" class="large-region opportunity"><span>03 · opportunity</span><h2>What becomes possible?</h2><p>Find the smallest intervention that changes the trajectory and increases learning.</p></section><section data-canvas-v2-node-id="large-decision" data-canvas-v2-design-region data-canvas-v2-island-id="large-decision" data-canvas-v2-story-role="implication" class="large-region decision"><span>04 · decision</span><h2>Act where the next signal<br/>arrives fastest.</h2><p>A useful decision creates evidence, not merely alignment.</p></section><p data-canvas-v2-node-id="large-coordinate-x" class="coordinate coordinate-x">breadth of market understanding →</p><p data-canvas-v2-node-id="large-coordinate-y" class="coordinate coordinate-y">depth of validated learning →</p></main>`,
          css: `.northstar-canvas{position:relative;box-sizing:border-box;width:3600px;min-width:3600px;height:2400px;min-height:2400px;background:#fefdfb;color:#18171f;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.large-landscape{overflow:visible}.landscape-path{position:absolute;left:150px;top:150px;width:3300px;height:2060px;overflow:visible}.landscape-path path{fill:none;stroke:rgba(104,77,255,.30);stroke-width:2;stroke-dasharray:8 13}.landscape-path circle{fill:#684dff}.large-region{position:absolute;width:660px;font-size:24px}.large-region span{color:#684dff;font-size:24px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}.large-region h1,.large-region h2{margin:20px 0 22px;letter-spacing:-.058em}.large-region h1{font-size:72px;line-height:.93}.large-region h2{font-size:46px;line-height:.98}.large-region p{max-width:600px;margin:0;color:#676471;font-size:28px;line-height:1.4}.origin{left:0;top:0;width:820px}.evidence{left:1000px;top:720px}.opportunity{left:2020px;top:1050px}.decision{left:2740px;top:1740px}.coordinate{position:absolute;margin:0;color:#8d8798;font-size:28px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;white-space:nowrap}.coordinate-x{left:210px;top:2200px}.coordinate-y{left:74px;top:2000px;transform:rotate(-90deg);transform-origin:left top}`,
        },
      },
      evidence: [],
    });
  }

  if (body.instruction?.includes("Selected node:") && !revision.document.html.includes("data-e2e-selection-edited")) return NextResponse.json({
    decision: {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "edit",
      moveKind: "refinement",
      creativeDirection: direction("Give the selected conclusion a precise violet emphasis without disturbing the composition.", []),
      spatialStrategy: spatial("Keep every bound stable and change only the selected title's semantic emphasis.", "stable"),
      reflection: reflection("The resolved comparison is visible and the selected conclusion is structurally isolated.", "Only the requested local emphasis remains.", "A restrained selection refinement preserves the wider visual thesis."),
      summary: "Refined the selected synthesis title while preserving the surrounding composition.",
      expectedVisualResult: "The selected title carries the requested violet emphasis and all research remains unchanged.",
      document: {
        html: revision.document.html.replace('data-canvas-v2-node-id="synthesis-title"', 'data-canvas-v2-node-id="synthesis-title" data-e2e-selection-edited="true"'),
        css: `${revision.document.css}\n[data-e2e-selection-edited]{color:#6953ea}`,
      },
    },
    evidence: revision.evidence,
  });

  if (body.instruction?.includes("Selected node:") && revision.document.html.includes("data-e2e-selection-edited")) return NextResponse.json({
    decision: {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "complete",
      creativeDirection: direction("Give the selected conclusion a precise violet emphasis without disturbing the composition.", []),
      spatialStrategy: spatial("Preserve the selected refinement and the complete surrounding evidence field.", "stable"),
      reflection: reflection("The selected synthesis title now carries the requested emphasis and the surrounding composition is unchanged.", "No selection-specific adjustment remains.", "Complete after observing the isolated transformation."),
      summary: "The selected synthesis title was refined without changing either canonical evidence flow.",
    },
    evidence: revision.evidence,
  });

  if (body.instruction?.toLowerCase().includes("render-safe title composition")) {
    if (revision.state === "committed" && revision.document.html.includes("data-e2e-safe-title")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Prove that title authorship begins safely and remains visible as native canvas objects.", []),
        spatialStrategy: spatial("Preserve the compiler-placed title territory inside the finite canvas.", "stable"),
        reflection: reflection("The title composition is visible, inset, and committed.", "No render-safety repair remains.", "Complete after observing the accepted native scene."),
        summary: "The title composition committed inside the compiler-owned safe area and is visible beside the open chat panel.",
      },
      evidence: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "framing",
        creativeDirection: direction("Prove that title authorship begins safely and remains visible as native canvas objects.", []),
        spatialStrategy: spatial("Author one intrinsic title territory and let the compiler own board placement.", "vertical"),
        reflection: reflection("The surface is empty.", "A visible title composition is required.", "Create the title without hard-coding canvas coordinates."),
        summary: "Composed a render-safe title territory.",
        expectedVisualResult: "A title and description appear visibly inset from the finite canvas edges.",
        document: {
          html: '<section data-e2e-safe-title="true" data-canvas-v2-node-id="safe-title-region" data-canvas-v2-design-region data-canvas-v2-story-role="title" aria-label="Render-safe title composition"><p data-canvas-v2-node-id="safe-title-kicker">North Star composition</p><h1 data-canvas-v2-node-id="safe-title-heading">A clear beginning.</h1><p data-canvas-v2-node-id="safe-title-description">The compiler owns placement; the model owns the composition.</p></section>',
          // Deliberately adversarial source rules reproduce the former top=0
          // failure. Runtime compiler guards must win without a repair turn.
          css: 'html,body{padding:0!important}.northstar-title{position:absolute;left:0;top:0}.northstar-title{}[data-e2e-safe-title]{position:absolute;left:0;top:0;width:920px;padding:54px 64px;border-top:3px solid #6b4dff;background:#fefdfb;color:#171721;font:400 28px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-safe-title] p{max-width:620px;margin:0;color:#676471;font-size:28px;line-height:1.55}[data-e2e-safe-title] p:first-child{margin-bottom:18px;color:#6b4dff;font-size:28px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}[data-e2e-safe-title] h1{margin:0 0 24px;font-size:68px;line-height:.94;letter-spacing:-.058em}',
        },
      },
      evidence: [],
    });
  }

  if (body.instruction?.toLowerCase().includes("fourth positioning territory")) {
    if (revision.document.html.includes("data-e2e-positioning-counter-territory")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The original positioning composition remains intact and a distinct counter-position is visible beside it.", "No requested alternative remains unresolved.", "Complete after observing preservation and the new nearby territory."),
        summary: "The preserved positioning composition now has a visually distinct counter-territory to its right.",
      },
      evidence: revision.evidence,
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The original conceptual composition is complete and must remain stable.", "The requested counter-position is not yet visible.", "Add one independently editable adjacent territory without rebuilding prior work."),
        summary: "Added a preserved counter-position beside the original composition.",
        expectedVisualResult: "The original composition remains unchanged while a contrasting fourth positioning territory appears to its right.",
        document: {
          html: appendCanvasObject(revision.document.html, '<section data-e2e-positioning-counter-territory="true" data-canvas-v2-node-id="positioning-counter-territory" data-canvas-v2-design-region data-canvas-v2-story-role="synthesis" data-canvas-v2-visual-role="counter-position"><p data-canvas-v2-node-id="counter-position-label">Counter-position · deliberate friction</p><h2 data-canvas-v2-node-id="counter-position-title">Support that asks you to slow down.</h2><p data-canvas-v2-node-id="counter-position-copy">Challenge the shared promise of effortless speed: make thoughtful escalation and visible human judgment the product advantage.</p></section>'),
          css: `${revision.document.css}\n[data-e2e-positioning-counter-territory]{box-sizing:border-box;width:940px;min-height:520px;margin:140px 0 0 1860px;padding:62px 72px;border-left:4px solid #684dff;background:var(--northstar-surface);color:var(--northstar-ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-positioning-counter-territory] p:first-child{margin:0;color:#684dff;font-size:28px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}[data-e2e-positioning-counter-territory] h2{max-width:760px;margin:52px 0 34px;font:750 64px/.98 Georgia,serif;letter-spacing:-.045em}[data-e2e-positioning-counter-territory] p:last-child{max-width:720px;margin:0;color:var(--northstar-muted);font-size:28px;line-height:1.45}`,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction === "Exercise one-prompt multi-island discovery") {
    const comparisonVisible = revision.document.html.includes("data-e2e-single-run-comparison");
    const implementationVisible = revision.document.html.includes("data-e2e-single-run-implementation");
    if (comparisonVisible && implementationVisible) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        compositionState: multiIslandCompositionState(true),
        reflection: reflection("The comparison and implementation path are both visible as separate native territories.", "No explicitly separate semantic job remains absent.", "Complete after observing both committed islands in the same run."),
        summary: "North Star completed the decision comparison and its operating path as two independently editable canvas territories in one discovery run.",
      },
      evidence: revision.evidence,
    });
    if (comparisonVisible) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        compositionState: multiIslandCompositionState(true),
        reflection: reflection("The launch comparison is committed and resolved as the first bounded island.", "The explicitly separate implementation path is still absent.", "Create the second territory without changing the comparison."),
        summary: "Added the separate implementation path while preserving the resolved decision comparison.",
        expectedVisualResult: "A second independently editable Scope–Learn–Decide–Exit territory appears beside the unchanged comparison.",
        document: {
          html: appendCanvasObject(revision.document.html, '<section data-e2e-single-run-implementation="true" data-canvas-v2-node-id="single-run-implementation" data-canvas-v2-design-region data-canvas-v2-story-role="implication" data-canvas-v2-visual-role="implementation-path"><p data-canvas-v2-node-id="single-run-implementation-kicker">Independent territory · operating path</p><h2 data-canvas-v2-node-id="single-run-implementation-title">Move through learning, not ceremony.</h2><ol data-canvas-v2-node-id="single-run-implementation-steps"><li data-canvas-v2-node-id="single-run-scope"><strong>Scope</strong><span>Bound the smallest credible pilot.</span></li><li data-canvas-v2-node-id="single-run-learn"><strong>Learn</strong><span>Watch the governing signal.</span></li><li data-canvas-v2-node-id="single-run-decide"><strong>Decide</strong><span>Proceed only when the signal earns it.</span></li><li data-canvas-v2-node-id="single-run-exit"><strong>Exit</strong><span>Pause when learning no longer justifies exposure.</span></li></ol></section>'),
          css: `${revision.document.css}\n[data-e2e-single-run-implementation]{box-sizing:border-box;min-height:660px;padding:88px 96px;border-top:3px solid #684dff;background:transparent;color:#f5f2ff}[data-e2e-single-run-implementation]>p{margin:0;color:#aa9cff;font-size:28px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}[data-e2e-single-run-implementation] h2{max-width:760px;margin:36px 0 64px;font:700 58px/1 Georgia,serif;letter-spacing:-.045em}[data-e2e-single-run-implementation] ol{display:grid;grid-template-columns:repeat(4,1fr);gap:32px;margin:0;padding:0;list-style:none}[data-e2e-single-run-implementation] li{display:grid;gap:16px;padding-top:24px;border-top:1px solid rgba(170,156,255,.45);font-size:28px;line-height:1.4}[data-e2e-single-run-implementation] strong{font-size:28px;text-transform:uppercase;letter-spacing:.08em}[data-e2e-single-run-implementation] span{font-size:28px;line-height:1.4;color:#c9c3d3}`,
        },
      },
      evidence: revision.evidence,
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        compositionState: multiIslandCompositionState(false),
        reflection: reflection("The empty canvas has not made the launch choice legible.", "A separate implementation territory will still be required after this bounded comparison is observed.", "Resolve only the governing uncertainty and launch contrast first."),
        summary: "Created the governing launch comparison as the first resolved territory.",
        expectedVisualResult: "One independently editable comparison island appears; the implementation path remains absent until the next observed turn.",
        document: {
          html: '<main class="single-run-discovery" data-canvas-v2-node-id="single-run-canvas" aria-label="Single-run discovery system"><section data-e2e-single-run-comparison="true" data-canvas-v2-node-id="single-run-comparison" data-canvas-v2-design-region data-canvas-v2-story-role="comparison" data-canvas-v2-visual-role="comparison-axis"><p data-canvas-v2-node-id="single-run-comparison-kicker">Governing uncertainty</p><h1 data-canvas-v2-node-id="single-run-comparison-title">Will speed reveal learning before polish becomes a liability?</h1><div data-canvas-v2-node-id="single-run-comparison-axis"><article data-canvas-v2-node-id="single-run-pilot"><h2 data-canvas-v2-node-id="single-run-pilot-title">Fast pilot</h2><p data-canvas-v2-node-id="single-run-pilot-copy">Choose when reversibility and learning value dominate.</p></article><article data-canvas-v2-node-id="single-run-launch"><h2 data-canvas-v2-node-id="single-run-launch-title">Polished launch</h2><p data-canvas-v2-node-id="single-run-launch-copy">Choose when reliability and reputational stakes dominate.</p></article></div><p data-canvas-v2-node-id="single-run-recommendation"><strong>Recommendation</strong> Default to the smallest credible pilot.</p></section></main>',
          css: '.single-run-discovery{box-sizing:border-box;display:grid;grid-template-columns:1fr 1fr;gap:240px;width:3200px;min-height:980px;padding:120px;background:transparent;color:#f5f2ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-single-run-comparison]{box-sizing:border-box;min-height:660px;padding:88px 96px;border-top:3px solid #f17c39;background:transparent}[data-e2e-single-run-comparison]>p:first-child{margin:0;color:#f17c39;font-size:28px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}[data-e2e-single-run-comparison] h1{max-width:1120px;margin:36px 0 64px;font:700 64px/.98 Georgia,serif;letter-spacing:-.045em}[data-canvas-v2-node-id="single-run-comparison-axis"]{display:grid;grid-template-columns:1fr 1fr;gap:56px}[data-canvas-v2-node-id="single-run-comparison-axis"] article{padding-top:24px;border-top:1px solid rgba(245,242,255,.28)}[data-canvas-v2-node-id="single-run-comparison-axis"] h2{margin:0 0 18px;font-size:40px}[data-canvas-v2-node-id="single-run-comparison-axis"] p{margin:0;color:#c9c3d3;font-size:28px;line-height:1.45}[data-canvas-v2-node-id="single-run-recommendation"]{margin:64px 0 0;padding-left:28px;border-left:4px solid #f17c39;font-size:30px;line-height:1.45}[data-canvas-v2-node-id="single-run-recommendation"] strong{display:block;margin-bottom:10px;color:#f17c39;font-size:24px;letter-spacing:.1em;text-transform:uppercase}',
        },
      },
      evidence: revision.evidence,
    });
  }

  if (!(body.run?.researchTargets?.length)) {
    if (revision.document.html.includes("data-e2e-generic-transform")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        compositionState: genericCompositionState(),
        reflection: reflection("The requested idea is now expressed as a concise visual thesis without unrelated product research.", "No further visual structure is required for this bounded request.", "Complete after observing the authored transform."),
        summary: "The requested visual idea is complete and the canvas contains no unrelated app evidence.",
      },
      evidence: revision.evidence,
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "framing",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        compositionState: genericCompositionState(),
        reflection: reflection("The current surface has no answer to the user's conceptual request.", "A clear visual thesis is needed without introducing irrelevant app flows.", "Author a restrained editorial transform directly on the surface."),
        summary: "Created a focused editorial visual answer without invoking account research.",
        expectedVisualResult: "A direct-on-surface visual thesis appears with no unrelated product evidence.",
        document: {
          html: `<main class="northstar-canvas generic-transform" data-canvas-v2-node-id="canvas" aria-label="Conceptual visual answer"><section data-e2e-generic-transform="true" data-canvas-v2-node-id="generic-transform" data-canvas-v2-design-region data-canvas-v2-story-role="analysis"><p data-canvas-v2-node-id="generic-kicker">North Star · visual reasoning</p><h1 data-canvas-v2-node-id="generic-title">Make the decision<br/>legible.</h1><p data-canvas-v2-node-id="generic-copy">The canvas changed because the request called for a visual answer. No account research was required or fabricated.</p></section></main>`,
          css: `.northstar-canvas{box-sizing:border-box;width:1680px;min-width:1680px;min-height:945px;background:transparent;color:#18171f;font-family:Inter,ui-sans-serif,system-ui,sans-serif}[data-e2e-generic-transform]{box-sizing:border-box;width:1420px;min-height:705px;padding:120px 130px}[data-e2e-generic-transform]>p:first-child{margin:0;color:#684dff;font-size:28px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap}[data-e2e-generic-transform] h1{margin:28px 0 30px;font-size:78px;line-height:.9;letter-spacing:-.065em}[data-e2e-generic-transform]>p:last-child{max-width:820px;margin:0;padding-top:22px;border-top:1px solid rgba(35,31,55,.16);color:#676471;font-size:28px;line-height:1.6}`,
        },
      },
      evidence: revision.evidence,
    });
  }

  const catalog = { tenantId: "e2e", apps: CANVAS_V2_E2E_APPS };
  const researchIndex = buildCanvasV2ResearchCatalogIndex(catalog, body.instruction ?? "", revision, body.run?.researchTargets);
  const requestedNames = new Set((body.run?.researchTargets ?? []).map((name) => name.toLowerCase()));
  const nextApp = CANVAS_V2_E2E_APPS.find((app) => requestedNames.has(app.name.toLowerCase()) && !revision.document.html.includes(`data-canvas-v2-canonical-flow="${app.flows[0]?.id}"`));
  if (nextApp?.flows[0]) {
    const isFirst = revision.evidence.length === 0;
    const researchDecision = {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "research",
        moveKind: "research",
        creativeDirection: direction(
          `Ground the complete ${nextApp.name} sequence before deciding how the comparison should resolve spatially.`,
          isFirst ? ["Retrieve the contrasting flow", "Establish the editorial frame"] : ["Establish the editorial frame", "Organize the evidence field"],
        ),
        spatialStrategy: spatial(`Let the canonical ${nextApp.name} sequence extend the evidence field horizontally while preserving the 170px identity rail.`, "horizontal"),
        reflection: reflection(
          isFirst ? "The canvas is an open working surface with no grounded comparison evidence yet." : "One complete onboarding flow is visible, preserving its sequence and product identity.",
          `The complete ${nextApp.name} flow is still needed for a truthful comparison.`,
          "Visible research is the next meaningful move because the visual argument must begin from complete source material.",
        ),
        appId: nextApp.id,
        flowId: nextApp.flows[0].id,
        summary: `Retrieved the complete ${nextApp.name} onboarding flow and placed it on the visible working surface.`,
        expectedVisualResult: `${nextApp.name}'s icon and complete ordered screenshots appear as a premium canonical lane.`,
      } as const;
    return NextResponse.json({
      decision: researchDecision,
      research: canvasV2ResearchResultForFlow(nextApp, nextApp.flows[0]),
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex, researchDecision),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"framing\"")) {
    const header = `<header class="e2e-editorial-header" data-e2e-stage="framing" data-canvas-v2-node-id="editorial-header"><div data-canvas-v2-node-id="editorial-title-group"><p class="e2e-eyebrow" data-canvas-v2-node-id="editorial-eyebrow">Executive onboarding study</p><h1 data-canvas-v2-node-id="editorial-title">Confidence, built at two speeds.</h1><p class="e2e-deck" data-canvas-v2-node-id="editorial-deck">Awin makes qualification explicit before momentum. Whop protects momentum and lets identity emerge through action.</p></div><div class="e2e-note" data-canvas-v2-node-id="working-hypothesis"><p class="e2e-note-label" data-canvas-v2-node-id="hypothesis-label">Working hypothesis</p><p data-canvas-v2-node-id="hypothesis-copy">Trust is staged in Awin; velocity is staged in Whop.</p></div><div class="e2e-note" data-canvas-v2-node-id="research-question"><p class="e2e-note-label" data-canvas-v2-node-id="question-label">What the evidence tests</p><p data-canvas-v2-node-id="question-copy">Where does each product ask the user to commit?</p></div></header>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "framing",
        creativeDirection: direction("Give the grounded comparison a concise editorial premise and an explicit question.", ["Build a reading axis through both flows", "Develop the executive analysis"]),
        spatialStrategy: spatial("Establish the 1560px alignment rail and distribute the headline plus two research notes across a controlled three-column opening.", "vertical"),
        reflection: reflection("Both complete flows now read as an inspectable evidence field, but their strategic difference is not yet framed.", "The viewer needs a thesis and a question before reading the sequences.", "An editorial frame creates meaning without enclosing or reducing the evidence."),
        summary: "Established a clear editorial premise above the complete evidence surface.",
        expectedVisualResult: "A strong headline, working hypothesis, and evidence question lead directly into both intact onboarding flows.",
        document: {
          html: insertBeforeGroundedEvidence(revision.document.html, header),
          css: withBaseCss(revision.document.css),
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"composition\"")) {
    const axis = `<section class="e2e-reading-axis" data-e2e-stage="composition" data-canvas-v2-node-id="reading-axis"><div class="e2e-axis-intro" data-canvas-v2-node-id="axis-intro">Read the flows through</div><div class="e2e-axis-point" data-canvas-v2-node-id="axis-entry"><strong>Entry promise</strong>What value is offered before effort?</div><div class="e2e-axis-point" data-canvas-v2-node-id="axis-commitment"><strong>Commitment point</strong>When does identity become required?</div><div class="e2e-axis-point" data-canvas-v2-node-id="axis-reward"><strong>First reward</strong>How quickly does progress feel tangible?</div></section>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: direction("Turn the two raw sequences into one legible comparative reading field without hiding their completeness.", ["Translate the evidence into an executive finding", "Refine hierarchy and rhythm"]),
        spatialStrategy: spatial("Align three comparison questions to the evidence sequence while preserving the fixed identity rail and peer screenshot scale.", "vertical"),
        reflection: reflection("The opening now supplies a distinctive thesis, but the eye still reads the flows as two independent rows.", "A shared reading axis can make the comparison scannable without adding containers.", "Three simple questions create a compositional bridge between the editorial premise and the evidence."),
        summary: "Introduced a shared reading axis that organizes both complete flows as one comparison.",
        expectedVisualResult: "Three crisp comparison lenses sit directly above the evidence lanes and create a strong left-to-right reading rhythm.",
        document: {
          html: insertBeforeGroundedEvidence(revision.document.html, axis),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"analysis\"")) {
    const analysis = `<section class="e2e-analysis" data-e2e-stage="analysis" data-canvas-v2-node-id="executive-analysis"><div class="e2e-analysis-heading" data-canvas-v2-node-id="analysis-heading"><p class="e2e-section-label" data-canvas-v2-node-id="analysis-label">What the sequences reveal</p><h2 data-canvas-v2-node-id="synthesis-title">Friction is doing different jobs.</h2></div><article class="e2e-analysis-column" data-canvas-v2-node-id="awin-analysis"><h3 data-canvas-v2-node-id="awin-analysis-title">Awin · confidence before velocity</h3><p data-canvas-v2-node-id="awin-analysis-copy">More guided context creates confidence for a higher-consideration partner relationship. The cost is a later feeling of forward motion.</p><small data-canvas-v2-node-id="awin-analysis-signal">Signal · qualification is part of the promise</small></article><article class="e2e-analysis-column e2e-analysis-column--whop" data-canvas-v2-node-id="whop-analysis"><h3 data-canvas-v2-node-id="whop-analysis-title">Whop · velocity before certainty</h3><p data-canvas-v2-node-id="whop-analysis-copy">A compressed identity path protects the creator's momentum. Confidence is deferred until the product can prove value through action.</p><small data-canvas-v2-node-id="whop-analysis-signal">Signal · progress is part of the promise</small></article></section>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: direction("Resolve the comparison into one grounded executive distinction while keeping the evidence immediately available above it.", ["Refine the complete visual system and conclusion"]),
        spatialStrategy: spatial("Extend the composition downward into a 300px conclusion anchor plus two equal analytical columns on the same outer rail.", "vertical"),
        reflection: reflection("The evidence now shares a strong comparative axis and the two product philosophies are easy to inspect.", "The board still needs an explicit conclusion that translates sequence into strategic meaning.", "A direct-on-surface analysis completes the argument without covering the research in summary cards."),
        summary: "Developed the evidence into a balanced executive analysis of confidence and velocity.",
        expectedVisualResult: "A disciplined analysis section beneath the flows explains the distinct role friction plays in each onboarding strategy.",
        document: {
          html: appendCanvasObject(revision.document.html, analysis),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"refinement\"")) {
    const conclusion = `<footer class="e2e-conclusion" data-e2e-stage="refinement" data-canvas-v2-node-id="executive-conclusion"><p class="e2e-section-label" data-canvas-v2-node-id="conclusion-label">Executive implication</p><blockquote data-canvas-v2-node-id="conclusion-copy">The better pattern is not fewer steps. It is making every step <em>earn the user's next commitment.</em></blockquote></footer>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "refinement",
        creativeDirection: direction("Unify the full board into one polished editorial argument with a memorable final implication.", []),
        spatialStrategy: spatial("Reconcile section rules, screenshot shadows, semantic colors, and vertical intervals without changing the established geometry.", "stable"),
        reflection: reflection("The board is analytically complete and grounded, with a clear frame, shared reading axis, and balanced interpretation.", "The final pass should tighten visual rhythm and leave the viewer with one memorable implication.", "A restrained refinement can unify color, rules, shadows, spacing, and the concluding statement without changing the evidence."),
        summary: "Refined typography, semantic accents, spacing, and the final executive implication into one coherent North Star composition.",
        expectedVisualResult: "The full canvas reads as a premium editorial analysis from thesis to evidence to conclusion, with no card-grid treatment.",
        document: {
          html: appendCanvasObject(revision.document.html.replace('class="northstar-canvas"', 'class="northstar-canvas e2e-refined"'), conclusion),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  return NextResponse.json({
    decision: {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "complete",
      creativeDirection: direction("Hold the resolved editorial comparison as the final visible artifact.", []),
      spatialStrategy: spatial("Preserve the resolved alignment system and complete evidence field; no spatial adjustment remains.", "stable"),
      reflection: reflection("The visible canvas now moves coherently from premise, through complete source flows, to grounded analysis and a concise executive implication.", "No material communication gap remains for the requested balanced comparison.", "Completion is appropriate because further elements would dilute the hierarchy rather than clarify the answer."),
      summary: "The visible canvas preserves both complete onboarding flows and resolves them into a distinctive, grounded executive comparison.",
    },
    evidence: revision.evidence,
    researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
  });
}
