import { findCanvasV2SourceNodeRange } from "@/lib/canvas-v2/source-patch";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

interface CanvasV2NamedCoverageRequirement {
  id: string;
  instructionMatches: (instruction: string) => boolean;
  visibleGroups: readonly (readonly string[])[];
  visibleAnyGroups?: readonly (readonly string[])[];
  minimumOccurrences?: readonly { term: string; count: number }[];
  isSatisfied?: (context: { analyticalText: string; analyticalMarkup: string; allVisibleText: string }) => boolean;
  failure: string;
}

/**
 * Route deep screenshot comparisons through observed, progressive synthesis.
 * The caller supplies scale from the complete committed atlas so provider-side
 * context compaction can never make a substantial inquiry appear shallow.
 */
export function canvasV2EvidenceLedComparisonRequested(instruction: string): boolean {
  return /\b(?:compare|comparison|comparative|versus|vs\.?|contrast)\b/i.test(instruction)
    && /\b(?:representative|screenshot|screenshots|screen evidence|visual evidence|flow|flows)\b/i.test(instruction);
}

export function canvasV2RequiresProgressiveEvidenceSynthesis(input: {
  synthesisTurn: boolean;
  instruction: string;
  canonicalFlowCount: number;
  canonicalScreenCount: number;
}): boolean {
  return input.synthesisTurn
    && canvasV2EvidenceLedComparisonRequested(input.instruction)
    && input.canonicalFlowCount >= 2
    && input.canonicalScreenCount >= 20;
}

const NAMED_COVERAGE_REQUIREMENTS: readonly CanvasV2NamedCoverageRequirement[] = [
  {
    id: "observed-signals-and-assumptions",
    instructionMatches: (instruction) => /\bobserved\s+signals?\b/i.test(instruction) && /\bassumptions?\b/i.test(instruction),
    visibleGroups: [["observed", "signal"], ["assumption"]],
    failure: "The prompt explicitly asks to separate observed signals from assumptions, but both categories are not visibly materialized in the non-title analytical work.",
  },
  {
    id: "known-and-unknown",
    instructionMatches: (instruction) => /\bknown\b/i.test(instruction) && /\bunknowns?\b/i.test(instruction),
    visibleGroups: [["known"], ["unknown"]],
    failure: "The prompt explicitly distinguishes knowns from unknowns, but both categories are not visibly materialized in the non-title analytical work.",
  },
  {
    id: "strengths-and-weaknesses",
    instructionMatches: (instruction) => /\bstrengths?\b/i.test(instruction) && /\bweakness(?:es)?\b/i.test(instruction),
    visibleGroups: [["strength"], ["weakness"]],
    failure: "The prompt explicitly asks for strengths and weaknesses, but both sides are not visibly materialized in the non-title analytical work.",
  },
  {
    id: "risks-and-opportunities",
    instructionMatches: (instruction) => /\brisks?\b/i.test(instruction) && /\bopportunit(?:y|ies)\b/i.test(instruction),
    visibleGroups: [["risk"], ["opportunit"]],
    failure: "The prompt explicitly asks for risks and opportunities, but both sides are not visibly materialized in the non-title analytical work.",
  },
  {
    id: "next-later-not-yet",
    instructionMatches: (instruction) => /\bnext\b/i.test(instruction) && /\blater\b/i.test(instruction) && /\bnot[\s-]+yet\b/i.test(instruction),
    visibleGroups: [["next"], ["later"], ["not yet"]],
    failure: "The prompt explicitly asks for NEXT, LATER, and NOT YET decision horizons, but all three horizons are not visibly materialized in the non-title analytical work.",
  },
  {
    id: "three-positioning-territories",
    instructionMatches: (instruction) => /\bthree\b[^.]{0,80}\bpositioning\s+territor(?:y|ies)\b/i.test(instruction),
    visibleGroups: [],
    // Structural coverage is verified below from stable top-level island
    // identities. Natural labels such as "creative strategic direction" are
    // valid and must not keep a resolved board alive just to repeat the
    // planner's internal word "territory" in visible copy.
    failure: "The prompt explicitly asks for three positioning territories, but three independently discussable territories are not visibly materialized in the non-title work.",
  },
  {
    id: "pricing-package-learning",
    instructionMatches: (instruction) => /\bthree\b[^.]{0,100}\bpackage\s+directions?\b/i.test(instruction),
    visibleGroups: [["willingness", "pay"]],
    visibleAnyGroups: [["learn", "teach"]],
    minimumOccurrences: [{ term: "package", count: 3 }],
    failure: "The prompt explicitly asks for three package directions and what they teach, but the visible comparison does not materialize all three packages, willingness-to-pay uncertainty, and learning value.",
  },
  {
    id: "two-opportunity-directions",
    instructionMatches: (instruction) => /\btwo\b[^.]{0,80}\bopportunity\s+directions?\b/i.test(instruction),
    visibleGroups: [],
    minimumOccurrences: [{ term: "opportunit", count: 2 }],
    failure: "The prompt explicitly asks for two opportunity directions, but two distinct opportunities are not visibly materialized in the non-title work.",
  },
  {
    id: "founder-workshop-arc",
    instructionMatches: (instruction) => /\bfounder\s+workshop\b/i.test(instruction)
      && /\bdivergence\b/i.test(instruction)
      && /\bchallenge\b/i.test(instruction)
      && /\bcommitment\b/i.test(instruction),
    visibleGroups: [],
    isSatisfied: ({ analyticalText, analyticalMarkup }) => {
      // Agenda labels describe a workshop; they do not make it usable. Require
      // independently authored semantic primitives for each live phase, then
      // require the decision record to expose the fields a team must actually
      // leave with. This remains form-agnostic: the surfaces may be lanes,
      // fields, clusters, canvases, shapes, or another model-chosen device.
      const authoredSemantics = Array.from(analyticalMarkup.matchAll(
        /\bdata-canvas-v2-(?:node-id|visual-role)\s*=\s*["']([^"']+)["']/gi,
      )).map((match) => normalizeVisibleText(match[1])).join(" ");
      const hasDivergenceSurface = /\b(?:diverg(?:e|ence|ent|ing)?|explor(?:e|ation|atory)?|widen|ideat(?:e|ion)?|candidate|segment cluster|open field|possibility field|writing field)\b/.test(authoredSemantics);
      const hasChallengeSurface = /\b(?:challenge|test|dissent|risk|counterargument|assumption test|risk question|pressure test)\b/.test(authoredSemantics);
      const hasCommitmentSurface = /\b(?:commit(?:ment|ted|ting)?|converg(?:e|ence|ent|ing)?|vote|prioriti(?:ze|zation)?|score|choice field|selection field)\b/.test(authoredSemantics);
      const hasDecisionRecord = /\b(?:decision record|written decision|decision field|commitment record|chosen segment)\b/.test(authoredSemantics);
      const decisionFieldCount = [
        /\bchosen\s+segment\b/,
        /\brationale\b/,
        /\bowner\b/,
        /\b(?:next\s+action|next\s+experiment)\b/,
        /\b(?:revisit|review)\s+date\b/,
      ].filter((pattern) => pattern.test(analyticalText)).length;
      return hasDivergenceSurface
        && hasChallengeSurface
        && hasCommitmentSurface
        && hasDecisionRecord
        && decisionFieldCount >= 4;
    },
    failure: "The requested founder workshop is incomplete because divergence, challenge, commitment, and the written decision are not all visibly usable in the facilitation surface.",
  },
  {
    id: "experiment-learning-and-commitment",
    instructionMatches: (instruction) => /\bexperiment\s+portfolio\b/i.test(instruction)
      && /\breversible\s+tests?\b/i.test(instruction),
    visibleGroups: [["test"], ["commit"]],
    visibleAnyGroups: [["learn", "teach"]],
    failure: "The experiment portfolio does not yet visibly connect reversible tests to what they teach and the conditions for a larger commitment.",
  },
  {
    id: "outcome-roadmap-learning-gates",
    instructionMatches: (instruction) => /\boutcome\s+roadmap\b/i.test(instruction)
      && /\blearning\s+gates?\b/i.test(instruction),
    visibleGroups: [["outcome"], ["learn"], ["gate"]],
    failure: "The requested outcome roadmap is incomplete because outcomes and learning gates are not both visibly materialized beyond the title framing.",
  },
  {
    id: "operating-model-decision-flow",
    instructionMatches: (instruction) => /\boperating\s+model\b/i.test(instruction)
      && /\bsignals?\s+enter\b/i.test(instruction),
    visibleGroups: [["signal"], ["decision"], ["owner"], ["urgent"], ["roadmap"]],
    failure: "The operating model is incomplete because signal intake, decision-making, next-action ownership, and protection from urgent roadmap work are not all visibly materialized.",
  },
  {
    id: "campaign-deliverables",
    instructionMatches: (instruction) => /\bcampaign\s+concept\b/i.test(instruction)
      && /\bthree\s+creative\s+moments?\b/i.test(instruction),
    visibleGroups: [],
    isSatisfied: ({ analyticalText, allVisibleText }) => {
      // A campaign should not need diagnostic labels to prove it exists. The
      // title territory may itself be the opening hook; numbered beats can be
      // three creative moments; named touchpoints are channel adaptations; and
      // a closing invitation or next-step lockup is a valid CTA.
      const hasOpeningHook = allVisibleText.length > 0;
      const hasThreeMoments = analyticalText.split("moment").length - 1 >= 3
        || /\b0?1\b[\s\S]*\b0?2\b[\s\S]*\b0?3\b/.test(analyticalText);
      const namedChannels = ["social", "email", "landing", "outdoor", "in product", "web", "video"]
        .filter((channel) => analyticalText.includes(channel)).length;
      const hasChannelAdaptations = analyticalText.includes("channel") || namedChannels >= 2;
      const hasFinalCallToAction = ["call to action", "cta", "next step", "get started", "start ", "join ", "try ", "see what", "learn more"]
        .some((phrase) => analyticalText.includes(phrase));
      return hasOpeningHook && hasThreeMoments && hasChannelAdaptations && hasFinalCallToAction;
    },
    failure: "The campaign is incomplete because the opening hook, three creative moments, channel adaptations, and final call to action are not all visibly materialized.",
  },
  {
    id: "investor-update-facts",
    instructionMatches: (instruction) => /\binvestor\s+update\b/i.test(instruction)
      && /\bmonthly\s+recurring\s+revenue\b/i.test(instruction),
    visibleGroups: [["18"], ["churn"], ["customer", "expand"], ["activation"], ["roadmap"]],
    failure: "The investor update does not yet visibly preserve the supplied growth, churn, customer expansion, activation, and roadmap facts.",
  },
  {
    id: "service-recovery-blueprint-lanes",
    instructionMatches: (instruction) => /\bservice[\s-]+recovery\s+blueprint\b/i.test(instruction),
    visibleGroups: [["emotion"], ["product"], ["behind"], ["handoff"]],
    failure: "The service-recovery blueprint is incomplete because customer emotion, visible product moments, behind-the-scenes actions, and operational handoffs are not all visibly materialized.",
  },
];

function sourceAttribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function decodeSourceText(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function normalizeVisibleText(value: string): string {
  return decodeSourceText(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[‐‑‒–—−_-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const INDEPENDENT_TERRITORY_COUNTS = new Map([
  ["two", 2],
  ["second", 2],
  ["three", 3],
  ["third", 3],
  ["four", 4],
  ["fourth", 4],
  ["five", 5],
  ["fifth", 5],
  ["six", 6],
  ["sixth", 6],
  ["seven", 7],
  ["seventh", 7],
  ["eight", 8],
  ["eighth", 8],
]);

/**
 * Explicit separation is a structural requirement, not an aesthetic hint. The
 * user may ask for several independently editable outputs without using the
 * internal word "island"; paths, maps, chapters, and working surfaces all
 * count when the wording clearly makes them an additional territory.
 */
export function canvasV2RequiredIndependentTerritoryCount(instruction: string): number {
  const normalized = normalizeVisibleText(instruction);
  let required = 0;
  const counted = /\b(two|second|three|third|four|fourth|five|fifth|six|sixth|seven|seventh|eight|eighth|[2-8])\s+(?:(?:separate|distinct|independent|independently editable|genuinely|different|alternative|contrasting|divergent)\s+){0,4}(?:(?:positioning|strategic|creative|decision|implementation|execution|evidence|analytical|analysis|working)\s+){0,4}(?:islands?|territor(?:y|ies)|compositions?|chapters?|surfaces?|maps?|paths?|outputs?)\b/g;
  for (const match of normalized.matchAll(counted)) {
    required = Math.max(required, INDEPENDENT_TERRITORY_COUNTS.get(match[1]) ?? Number(match[1]));
  }
  // Routers may preserve the ordinal while adding natural descriptors such as
  // "fourth, materially contrarian positioning territory". The ordinal is an
  // unambiguous absolute count, so tolerate a short descriptive phrase before
  // the output noun instead of depending on a closed adjective vocabulary.
  const ordinalCounted = /\b(second|third|fourth|fifth|sixth|seventh|eighth)\b(?:\s+[\p{L}\p{N}]+){0,6}\s+(?:island|territor(?:y|ies)|composition|chapter|surface|map|path|output)\b/gu;
  for (const match of normalized.matchAll(ordinalCounted)) {
    required = Math.max(required, INDEPENDENT_TERRITORY_COUNTS.get(match[1]) ?? 0);
  }
  const explicitlyMultiple = /\b(?:multiple|several|more than one)\s+(?:(?:separate|distinct|independent|independently editable)\s+){0,3}(?:(?:positioning|strategic|creative|decision|implementation|execution|evidence|analytical|analysis|working)\s+){0,4}(?:islands?|territories|compositions?|chapters?|surfaces?|maps?|paths?|outputs?)\b/.test(normalized);
  const explicitlyAdditional = /\b(?:another|(?:and|plus|alongside|beside)\s+(?:(?:create|add|show|include|build|compose|place)\s+)?(?:an?\s+)?(?:separate|distinct|independently editable|separately editable))\s+(?:(?:independently|independent|editable|nearby|implementation|decision|evidence|analytical|analysis|execution|working)\s+){0,4}(?:island|territory|composition|chapter|surface|map|path|output)\b/.test(normalized);
  return Math.max(required, explicitlyMultiple || explicitlyAdditional ? 2 : 0);
}

/**
 * A visible move and a whole-board completion cannot be the same transaction.
 * When the director has authored an exact create/develop/repair/recompose
 * target but accidentally marks its recommendation complete, execute the
 * concrete move and judge completion from the next committed render.
 */
export function canvasV2EffectiveCompletionRecommendation(input: {
  recommendation: "continue" | "complete";
  targetAction: "create" | "develop" | "enrich" | "repair" | "recompose" | "complete";
}): "continue" | "complete" {
  return input.recommendation === "complete" && input.targetAction !== "complete"
    ? "continue"
    : input.recommendation;
}

export function canvasV2CompletionContradictsMaterialMove(input: {
  recommendation: "continue" | "complete";
  targetAction: "create" | "develop" | "enrich" | "repair" | "recompose" | "complete";
  materialMove: string;
}): boolean {
  return input.recommendation === "complete"
    && input.targetAction === "complete"
    && /^\s*(?:create|add|build|compose|insert|append|place|develop|enrich|repair|recompose|move|restyle|rewrite|replace|remove)\b/i.test(input.materialMove);
}

/**
 * A resolved board must not stay alive for optional publication furniture.
 * This is deliberately narrower than a general turn limit: prompt coverage,
 * lifecycle, discovery readiness, and rendered integrity still decide whether
 * the story is resolved. It only closes the two speculative moves observed in
 * production after that objective work was already complete.
 */
export function shouldCompleteCanvasV2ResolvedOptionalContinuation(input: {
  resolvedStory: boolean;
  explicitWholeBoardRecompositionRequested: boolean;
  renderedIntegrityFailureCount: number;
  promptCoverageFailureCount: number;
  hasRenderRepair: boolean;
  completionRecommendation: string;
  targetAction: "create" | "develop" | "enrich" | "repair" | "recompose" | "complete";
  targetStoryRole: string;
  instructionRequestsTitleAuthorship: boolean;
  explicitRelationshipGeometryRequested: boolean;
  prescribesOptionalRelationshipGeometry: boolean;
}): boolean {
  if (!input.resolvedStory
    || input.explicitWholeBoardRecompositionRequested
    || input.renderedIntegrityFailureCount > 0
    || input.promptCoverageFailureCount > 0
    || input.hasRenderRepair
    || input.completionRecommendation !== "continue") return false;
  if (input.targetAction === "recompose") return true;
  if (input.prescribesOptionalRelationshipGeometry && !input.explicitRelationshipGeometryRequested) return true;
  return input.targetAction === "create"
    && input.targetStoryRole === "title"
    && !input.instructionRequestsTitleAuthorship;
}

const SEMANTIC_JOB_STOP_WORDS = new Set([
  "a", "an", "and", "the", "to", "of", "for", "from", "in", "on", "with", "that", "this",
  "create", "build", "compose", "show", "make", "give", "complete", "bounded", "editable",
  "independent", "independently", "separate", "distinct", "current", "next", "later", "visible",
]);

function semanticJobTerms(value: string): string[] {
  return Array.from(new Set(normalizeVisibleText(value).split(" ")
    .filter((term) => term.length > 2 && !SEMANTIC_JOB_STOP_WORDS.has(term))));
}

function containsSemanticJob(value: string, job: string): boolean {
  const source = new Set(semanticJobTerms(value));
  const jobTerms = semanticJobTerms(job);
  return jobTerms.length >= 2 && jobTerms.every((term) => source.has(term));
}

/**
 * Discovery may plan the complete inquiry, but one source-author transaction
 * may materialize only one independently editable semantic job. This guard is
 * intentionally form-agnostic: the director names the current and deferred
 * jobs, while the compiler verifies that they remain genuinely distinct.
 */
export function validateCanvasV2AtomicTerritoryPlan(input: {
  requiredCount: number;
  observedCount: number;
  createsNonTitleTerritory: boolean;
  action: "create" | "develop" | "enrich" | "repair" | "recompose" | "complete";
  storyRole: string;
  currentSemanticJob: string;
  deferredSemanticJobs: readonly string[];
  materialMove: string;
  completionRationale: string;
  resolutionRationale: string;
  remainingOpportunities: readonly string[];
  nextMoves: readonly string[];
}): string[] {
  const projectedCount = input.observedCount + (input.createsNonTitleTerritory ? 1 : 0);
  if (input.requiredCount <= projectedCount) return [];
  const failures: string[] = [];
  const missingAfterThisTurn = input.requiredCount - projectedCount;
  if (input.action !== "create" || input.storyRole === "title") {
    failures.push(`This turn must create one non-title territory because ${missingAfterThisTurn} independently editable semantic job${missingAfterThisTurn === 1 ? " remains" : "s remain"} after it.`);
  }
  if (!semanticJobTerms(input.currentSemanticJob).length) {
    failures.push("The current source-author transaction must name one exact semantic job.");
  }
  if (input.deferredSemanticJobs.length < missingAfterThisTurn) {
    failures.push(`The plan must name at least ${missingAfterThisTurn} deferred semantic job${missingAfterThisTurn === 1 ? "" : "s"} that will receive later independently editable territory.`);
  }
  const planLanguage = [
    input.materialMove,
    input.completionRationale,
    input.resolutionRationale,
  ].join(" ");
  const claimsOneIslandCompletesTheArc = /\b(?:single|one)\b[^.]{0,90}\b(?:composition|island|territory|chapter|surface)\b[^.]{0,140}\b(?:fully|complete(?:ly)?|entire(?:ly)?|all)\b|\b(?:all|entire|complete|full|whole)\b[^.]{0,100}\b(?:request|prompt|system|deliverables?|requirements?)\b|\bsingle\b[^.]{0,100}\b(?:contain|cover|complete|communicate|provide|deliver|resolve)\b/i.test(planLanguage);
  if (claimsOneIslandCompletesTheArc) {
    failures.push("The current island claims to communicate the multi-territory arc instead of resolving one bounded semantic job.");
  }
  for (const deferredJob of input.deferredSemanticJobs) {
    if (containsSemanticJob(input.currentSemanticJob, deferredJob)) {
      failures.push(`The current semantic job already contains its deferred job: ${deferredJob}.`);
    }
    if (containsSemanticJob(input.materialMove, deferredJob)) {
      failures.push(`The material move precomposes the deferred semantic job "${deferredJob}" inside the current island.`);
    }
  }
  const queuedLanguage = [...input.remainingOpportunities, ...input.nextMoves].join(" ");
  if (input.deferredSemanticJobs.some((job) => !containsSemanticJob(queuedLanguage, job))) {
    failures.push("Every deferred semantic job must remain explicit in the board-level remaining-opportunity and next-move queues.");
  }
  return Array.from(new Set(failures));
}

/**
 * The director's deferred-job ledger is binding on the source author. A later
 * chapter may be named in planning metadata, but it cannot appear inside the
 * current island's visible source before its own observed turn.
 */
export function validateCanvasV2DeferredSemanticJobIsolation(input: {
  document: CanvasV2ArtifactDocument;
  islandId: string;
  deferredSemanticJobs: readonly string[];
}): string[] {
  const range = findCanvasV2SourceNodeRange(input.document.html, input.islandId);
  if (!range) return [];
  const visibleIslandText = normalizeVisibleText(input.document.html.slice(range.start, range.end));
  return input.deferredSemanticJobs
    .filter((job) => containsSemanticJob(visibleIslandText, job))
    .map((job) => `Target island ${input.islandId} visibly precomposes the deferred semantic job "${job}". Keep that job out of this transaction so it can receive its own independently editable territory after the current render is observed.`);
}

function nonTitleDesignIslandIds(document: CanvasV2ArtifactDocument): Set<string> {
  const ids = new Set<string>();
  const regionTags = /<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-design-region(?:\s*=\s*["'][^"']*["'])?[^>]*)>/gi;
  let opening: RegExpExecArray | null;
  while ((opening = regionTags.exec(document.html))) {
    const attributes = opening[2];
    if (sourceAttribute(attributes, "data-canvas-v2-story-role")?.toLowerCase() === "title") continue;
    const id = sourceAttribute(attributes, "data-canvas-v2-island-id")
      ?? sourceAttribute(attributes, "data-canvas-v2-node-id");
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Read only rendered analytical islands. A narrative title may frame what the
 * board will contain, but its roadmap copy cannot prove that the requested
 * analysis was actually authored.
 */
export function canvasV2NonTitleDesignText(document: CanvasV2ArtifactDocument): string {
  return normalizeVisibleText(canvasV2NonTitleDesignMarkup(document));
}

function canvasV2NonTitleDesignMarkup(document: CanvasV2ArtifactDocument): string {
  const regionTags = /<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-design-region(?:\s*=\s*["'][^"']*["'])?[^>]*)>/gi;
  const regionTexts: string[] = [];
  let opening: RegExpExecArray | null;
  while ((opening = regionTags.exec(document.html))) {
    const attributes = opening[2];
    if (sourceAttribute(attributes, "data-canvas-v2-story-role")?.toLowerCase() === "title") continue;
    const nodeId = sourceAttribute(attributes, "data-canvas-v2-node-id");
    if (!nodeId) continue;
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    if (!range) continue;
    regionTexts.push(document.html.slice(range.start, range.end));
  }
  return regionTexts.join(" ");
}

/**
 * Deterministic completion truth for explicit, high-confidence semantic asks.
 * This intentionally does not prescribe a layout or aesthetic. It only blocks
 * completion when the user named a category or horizon and the non-title
 * analytical composition never made that requested content visible.
 */
export function validateCanvasV2RequestedCompositionCoverage(
  document: CanvasV2ArtifactDocument,
  instruction: string,
): string[] {
  const normalizedInstruction = normalizeVisibleText(instruction);
  const analyticalMarkup = canvasV2NonTitleDesignMarkup(document);
  const analyticalText = normalizeVisibleText(analyticalMarkup);
  const allVisibleText = normalizeVisibleText(document.html);
  const failures = NAMED_COVERAGE_REQUIREMENTS
    .filter((requirement) => requirement.instructionMatches(normalizedInstruction))
    .filter((requirement) => (
      requirement.isSatisfied
        ? !requirement.isSatisfied({ analyticalText, analyticalMarkup, allVisibleText })
        : !requirement.visibleGroups.every((terms) => terms.every((term) => analyticalText.includes(term)))
      || !(requirement.visibleAnyGroups ?? []).every((terms) => terms.some((term) => analyticalText.includes(term)))
      || !(requirement.minimumOccurrences ?? []).every(({ term, count }) => analyticalText.split(term).length - 1 >= count)
    ))
    .map((requirement) => requirement.failure);

  if (/\bconverg(?:e|es|ed|ence|ent|ing)\b/i.test(normalizedInstruction) && !analyticalText.includes("converg")) {
    failures.push("The prompt explicitly asks to show convergence, but convergence is not visibly materialized in the non-title analytical work.");
  }

  const requiredTerritories = canvasV2RequiredIndependentTerritoryCount(instruction);
  const authoredTerritories = nonTitleDesignIslandIds(document).size;
  if (requiredTerritories > authoredTerritories) {
    failures.push(`The prompt explicitly requires at least ${requiredTerritories} independently editable non-title territories, but only ${authoredTerritories} programmatic island${authoredTerritories === 1 ? " is" : "s are"} visibly materialized. Preserve the resolved island${authoredTerritories === 1 ? "" : "s"} and create the next prompt-critical territory as a separate top-level island.`);
  }

  return failures;
}
