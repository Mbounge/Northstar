// Northstar v0.5.3.1 — universal LLM-originated visual thesis and composition-genome contract.
// Principles and evaluation language only: no style, medium, topology, or template catalog.

import type {
  NorthstarCreativeDirection,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

export type NorthstarUserVisualDirection = {
  requestedMedium?: string;
  requestedMood?: string;
  requestedMetaphor?: string;
  requestedComposition?: string;
  requestedEmphasis: string[];
  forbiddenTreatments: string[];
  desiredComprehensionTime?: string;
  rawInstruction: string;
};

export type NorthstarDesignFingerprint = {
  dominantAxis: string;
  focalStructure: string;
  evidenceArrangement: string;
  relationshipPattern: string;
  densityProfile: string;
  typographyProfile: string;
  signatureMove: string;
};

function compact(value: unknown, max = 420): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function matchInstruction(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return compact(match[0], 220);
  }
  return undefined;
}

export function extractNorthstarUserVisualDirection(userRequest: string): NorthstarUserVisualDirection {
  const text = compact(userRequest, 8_000);
  const requestedEmphasis = Array.from(
    text.matchAll(/\b(?:emphasize|focus on|highlight|make .* dominant|center on)\b[^.!?\n]*/gi),
    (match) => compact(match[0], 220),
  ).slice(0, 8);
  const forbiddenTreatments = Array.from(
    text.matchAll(/\b(?:avoid|do not use|don't use|no |without )\b[^.!?\n]*/gi),
    (match) => compact(match[0], 220),
  ).slice(0, 8);
  return {
    requestedMedium: matchInstruction(text, [/\b(?:make|render|present|show|visualize)\b[^.!?\n]{0,80}\b(?:as|like)\b[^.!?\n]*/i]),
    requestedMood: matchInstruction(text, [/\b(?:feel|mood|tone)\b[^.!?\n]*/i, /\b(?:sparse|dramatic|playful|provocative|calm|elegant|bold|quiet)\b[^.!?\n]*/i]),
    requestedMetaphor: matchInstruction(text, [/\b(?:metaphor|as a|like a)\b[^.!?\n]*/i]),
    requestedComposition: matchInstruction(text, [/\b(?:asymmetry|asymmetric|symmetry|horizontal|vertical|radial|layered|spatial|composition)\b[^.!?\n]*/i]),
    requestedEmphasis,
    forbiddenTreatments,
    desiredComprehensionTime: matchInstruction(text, [/\b(?:in|within)\s+(?:one|two|three|four|five|ten|\d+)\s+seconds?\b/i, /\b(?:immediately|at a glance|instantly)\b/i]),
    rawInstruction: text,
  };
}

export function buildNorthstarDesignFingerprint(artifact?: NorthstarGeneratedCodeArtifactPackage): NorthstarDesignFingerprint {
  if (!artifact) return { dominantAxis:"unresolved", focalStructure:"unresolved", evidenceArrangement:"unresolved", relationshipPattern:"unresolved", densityProfile:"unresolved", typographyProfile:"unresolved", signatureMove:"unresolved" };
  const journal = artifact.mutationJournal ?? [];
  const operations = journal.flatMap((batch) => batch.operations);
  const css = operations.filter((operation) => operation.op === "set-css-layer").map((operation) => operation.css).join("\n");
  const inserted = operations.filter((operation) => operation.op === "insert-html").map((operation) => operation.html).join("\n");
  const labels = journal.map((batch) => `${batch.label} ${batch.visibleChange}`).join(" ");
  const horizontalSignals = (css.match(/grid-template-columns|display:\s*flex|flex-direction:\s*row/gi) ?? []).length;
  const verticalSignals = (css.match(/grid-template-rows|flex-direction:\s*column/gi) ?? []).length;
  const relationshipSignals = (inserted.match(/data-ns-relationship-id/gi) ?? []).length;
  const cardSignals = (inserted.match(/card|panel|tile/gi) ?? []).length;
  const imageSignals = (inserted.match(/<img\b/gi) ?? []).length;
  const largeTypeSignals = (css.match(/font-size:\s*(?:[4-9]\d|1\d\d)px/gi) ?? []).length;
  return {
    dominantAxis: horizontalSignals > verticalSignals * 1.25 ? "predominantly-horizontal" : verticalSignals > horizontalSignals * 1.25 ? "predominantly-vertical" : "mixed-or-spatial",
    focalStructure: largeTypeSignals > 1 ? "large-typographic-anchor" : cardSignals > 6 ? "distributed-panel-system" : "evidence-led",
    evidenceArrangement: imageSignals > 12 ? "dense-sequential-evidence" : imageSignals > 4 ? "curated-evidence-set" : "minimal-evidence",
    relationshipPattern: relationshipSignals > 5 ? "dense-semantic-network" : relationshipSignals > 0 ? "selective-semantic-links" : "implicit-proximity",
    densityProfile: artifact.preferredHeight > 2_000 || operations.length > 45 ? "dense" : operations.length > 20 ? "balanced" : "sparse",
    typographyProfile: largeTypeSignals > 1 ? "editorial-scale-contrast" : "restrained-hierarchy",
    signatureMove: compact(labels.slice(-900), 300) || "not-yet-established",
  };
}

export function buildDivergentVisualThesisSystemAddendum(input: { thinkingDepth: "low" | "medium" | "high"; userRequest: string; recentCreativeSignatures: string[] }): string {
  const direction = extractNorthstarUserVisualDirection(input.userRequest);
  const candidateCount = input.thinkingDepth === "low" ? 2 : input.thinkingDepth === "medium" ? 4 : 6;
  return `
NORTHSTAR v0.5.3.1 — THESIS-TO-PIXELS VISUAL CONTRACT

Originate ${candidateCount} genuinely different visual theses from the user's desired transformation and the grounded material. No style, medium, topology, or layout catalog exists.

For each thesis reason explicitly about:
- viewer transformation;
- editorial argument;
- problem-specific information topology;
- dominant, supporting, contextual, inspectable, and omitted evidence;
- one governing visual idea;
- spatial logic and narrative progression;
- focal moment and hierarchy;
- emotional register and audience fit;
- typography, color, density, and pacing intent;
- three-second read and one focal event;
- at least one structural consequence for hierarchy, geometry, evidence treatment, and pacing or relationships;
- evidence roles: hero, turning point, sequence, support, context, provenance, and intentional omission as appropriate;
- comparison basis and visible mismatches when the material contains unequal sequences, systems, cohorts, strategies, or timelines;
- one useful signature move plus the semantic nodes and structural behavior that would execute it;
- rhythm plan: baseline cadence, compression, expansion, interruption, and ending behavior;
- interaction purpose, only when it improves comprehension or actionability;
- visible synthesis and truthful resolution of the request;
- neutralization risks that could flatten the thesis into a conventional layout;
- risks to grounding, legibility, accessibility, and overstatement.

Candidates must differ in the reasoning above. Different colors, card order, column count, or labels are not divergence.

Do not derive creative form from artifactType, audience label, evidence type, number of apps, or keywords. Those inputs describe the assignment; they do not choose the design.

Reject concepts that could fit almost any request, imitate a reference, distribute evidence uniformly, rely on explanatory copy for their meaning, imply false synchronization, cannot identify a focal event, cannot trace the signature move to structural execution, or use spectacle without explanatory value.

Explicit user creative direction:
${JSON.stringify(direction)}

Recent fingerprints to avoid repeating:
${JSON.stringify(input.recentCreativeSignatures.slice(-12))}
`.trim();
}

export function buildThesisExecutionContext(input: { creativeDirection: NorthstarCreativeDirection; artifact?: NorthstarGeneratedCodeArtifactPackage; userRequest: string }): string {
  return `
SELECTED MODEL-ORIGINATED VISUAL THESIS
${JSON.stringify(input.creativeDirection)}

CURRENT COMPOSITION FINGERPRINT
${JSON.stringify(buildNorthstarDesignFingerprint(input.artifact))}

USER CREATIVE DIRECTION
${JSON.stringify(extractNorthstarUserVisualDirection(input.userRequest))}

THESIS-TO-PIXELS EXECUTION CONTRACT
- Advance one governing visual idea; do not accumulate unrelated devices.
- State the three-second read and establish one unmistakable focal event.
- Translate the thesis into visible consequences for hierarchy, geometry, evidence roles, and pacing or relationships.
- Treat evidence unequally and intentionally: hero and turning points dominate; supporting sequence preserves continuity; context and provenance recede or remain inspectable.
- When comparison is relevant, state the truthful comparison basis and make unequal duration, sequence length, stage structure, or uncertainty visible. Never use a shared ruler or equal columns merely for convenience.
- Make the signature move materially visible and traceable to specific semantic nodes and structural operations.
- Build a rhythm plan with deliberate compression, expansion, interruption, and ending behavior.
- Prefer transformation, subtraction, enlargement, compression, spatial tension, pacing, and relationship clarity over adding panels.
- Preserve the semantic intention of any unsupported relationship or annotation technique by re-expressing it through supported nodes, relationships, grouping, scale, spacing, or layout.
- Never drift into a generic dashboard because it is easier to implement.
- Keep claims, connectors, clusters, axes, and spatial implications grounded or explicitly labeled as inference.
- Mentally remove explanatory copy; core meaning must still be visible.
- Resolve the user's need through visible synthesis inside the composition, not only through a summary paragraph.
`.trim();
}

export function buildNorthstarCreativeReviewAddendum(): string {
  return `
Evaluate independently:
- viewer transformation;
- thesis clarity;
- problem specificity;
- governing-idea execution;
- evidence hierarchy and choreography;
- compositional confidence;
- emotional and audience fit;
- signature-move usefulness;
- immediate comprehension;
- Northstar taste and finish;
- quality of resolution;
- generic-layout risk;
- opportunities for subtraction;
- focal-event dominance;
- truthful comparison alignment;
- evidence-role geometry;
- visual meaning without explanatory copy;
- signature execution traceability;
- visible synthesis;
- required refinement level: polish, hierarchy, recomposition, or concept recovery.

A clean conventional composition may score well on craft while failing visual argument, problem specificity, signature execution, or memorability. Do not accept it merely because it is polished.

Originality is not decoration. A strong result discovers a memorable form that makes this exact request easier to understand, decide, remember, or imagine. Use critique to prescribe the next conceptual move without erasing a valid visible artifact.
`.trim();
}
