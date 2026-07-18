// lib/canvas-ai/northstar-rendered-visual-intelligence.ts
// Northstar Rendered Visual Intelligence v0.6.0 — continuous visual authorship from research to publication.

export type NorthstarVisibleCreativeStage = "research" | "sensemaking" | "thesis" | "development" | "publication";

export const NORTHSTAR_RENDERED_VISUAL_INTELLIGENCE_VERSION = "northstar.rendered-visual-intelligence.v0.6.0" as const;

export const NORTHSTAR_CONTINUOUS_VISUAL_AUTHORSHIP_PROTOCOL = `
NORTHSTAR v0.6.0 — CONTINUOUS VISUAL AUTHORSHIP

Northstar designs from the first visible research state to the final artifact. There is no disposable ugly phase and no fixed header shell.

For every visible state, reason about the WHOLE artboard:
- viewer need now — what the user should understand while watching this stage;
- current visual argument — what the board already says through pixels;
- hierarchy — what dominates, supports, recedes, remains inspectable, or disappears;
- semantic working roles — open question, provisional hypothesis, contradiction, evidence cluster, turning point, confidence signal, emerging claim, discarded direction, next investigation;
- composition evolution — what moves, groups, transforms, fades, enlarges, compresses, or resolves;
- title-region authorship — title, deck, kicker, status, and research summary may be repositioned, transformed, integrated, or removed when the governing visual idea demands it;
- emotional register — the board should feel intentional for the problem, not like generic scaffolding;
- signature behaviour in progress — the memorable move should emerge during the work, not appear only at publication;
- subtraction — process copy, redundant evidence, and generic containers must recede as the visual argument strengthens.

The model may use typography, sticky notes, annotations, diagrams, evidence piles, marginalia, stamps, tension fields, visual bookmarks, confidence markers, spatial trails, image treatments, or newly invented forms. These are not templates. Choose only forms whose semantic meaning is clear in context.

Every text block needs a declared communication role. Unassigned explanatory copy, especially stranded top-right research paragraphs, is forbidden.

Every visible mutation must leave a deliberately composed frame. Temporary does not mean unstyled. Provisional and resolved thinking must look visibly different.

The final artifact must emerge from the visible process: working objects transform, recede, merge, or become provenance. Do not reset into a generic publication template.
`.trim();

export const NORTHSTAR_RENDERED_PIXEL_SCORE_PROTOCOL = `
RENDERED-PIXEL QUALITY FLOOR

Judge actual pixels without being persuaded by concept names or prose. Use these minimums:
- information hierarchy: at least 7/10;
- concept-to-pixel fidelity: at least 7/10;
- analytical depth: at least 7/10;
- structural originality: at least 7/10;
- wow / memorability: at least 7/10;
- evidence legibility: at least 8/10;
- composition coherence: at least 8/10.

Map these judgments into the existing scorecard:
- clarity reflects information hierarchy and three-second read;
- grounding reflects evidence legibility and truthful claims;
- originality reflects structural originality and signature behaviour;
- usefulness reflects analytical depth and decision value;
- craft reflects composition coherence and finish;
- audienceFit reflects emotional register and viewer transformation.

A candidate cannot win because its rationale sounds ambitious. Blindly describe what the pixels communicate first. If the governing idea, focal event, evidence hierarchy, analytical consequence, or memorable move cannot be identified from the image, reject it.

A clean filmstrip, card grid, matrix, or dashboard is not automatically good. It must prove that its dominant geometry makes this exact problem easier to understand.
`.trim();

export function buildNorthstarWorkingCompositionStageContract(input: {
  stage: NorthstarVisibleCreativeStage;
  objective: string;
  moveLabel?: string;
}): string {
  const stageGuidance: Record<NorthstarVisibleCreativeStage, string> = {
    research: "Make evidence arrival legible and authored. Show uncertainty, questions, and provisional clusters through semantic visual roles; do not dump paragraphs.",
    sensemaking: "Visibly group, contrast, demote, and promote evidence as patterns emerge. The board should spatially think, not merely accumulate sections.",
    thesis: "Let the strongest claim restructure the composition. Re-author the title region and establish the signature behaviour in real geometry.",
    development: "Strengthen thesis-to-pixel fidelity, analytical causality, hierarchy, rhythm, and memorable structure. Prefer transformation and subtraction over more boxes.",
    publication: "Resolve the visual argument without resetting the design. Convert useful working traces into restrained provenance and remove only what no longer serves the viewer.",
  };
  return `
WHOLE-BOARD WORKING COMPOSITION CONTRACT
Stage: ${input.stage}
Objective: ${input.objective}
Current act: ${input.moveLabel ?? "advance the living visual argument"}

${stageGuidance[input.stage]}

Required outcome for this single visible state:
- the whole artboard feels intentionally designed now;
- title/header treatment belongs to the governing idea and is not a fixed shell;
- every visible text block has a semantic communication role;
- provisional, confirmed, and resolved content are visually distinguishable;
- at least one meaningful hierarchy change is visible;
- the central argument becomes clearer through geometry, scale, rhythm, evidence treatment, or relationships;
- no generic leftover process paragraph or default empty panel remains;
- the artboard remains fully inspectable, grounded, contained, and live-DOM sized;
- do not touch runtime, host, sizing, acknowledgement, or publication mechanics.
`.trim();
}

export function buildNorthstarBlindRenderedStudyInstruction(): string {
  return `
BLIND RENDERED-STUDY REVIEW
Before reading candidate prose, inspect each image and record internally:
1. what the image actually communicates in three seconds;
2. the dominant geometry and focal event;
3. which evidence is hero, turning point, support, context, or omitted;
4. the visible analytical relationship or consequence;
5. the memorable signature move;
6. whether the title/header is integrated into the design;
7. whether the composition could be reused unchanged for another request.

Reject any candidate that cannot independently clear the rendered-pixel quality floor. Never select a thesis whose promised structure is absent from the pixels.
`.trim();
}

export function buildNorthstarLiveImplementationFidelityInstruction(): string {
  return `
LIVE IMPLEMENTATION FIDELITY
The selected thesis is a contract, not inspiration. Every live mutation must preserve or strengthen:
- the three-second read;
- focal event;
- governing visual idea;
- evidence-role hierarchy;
- analytical consequence;
- signature behaviour;
- problem-specific dominant geometry;
- title-region integration;
- stage-appropriate working-surface beauty.

Do not simplify the selected concept into two screenshot rows plus explanatory copy. Do not claim a spine, dialectic, atlas, constellation, or other structure unless the pixels materially embody it. If implementation cannot express the concept safely, choose a simpler concept whose pixels can fully deliver the promise.
`.trim();
}
