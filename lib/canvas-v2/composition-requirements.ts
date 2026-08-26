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
    minimumOccurrences: [{ term: "territor", count: 3 }],
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

  return failures;
}
