// Northstar Creative Design Intelligence v0.4.4 — eight-reference identity conditioning, composition genomes, anti-template selection, and rendered originality review
import { createHash, randomUUID } from "node:crypto";
import {
  NORTHSTAR_FLOW_REFERENCE_PROTOCOL,
  NORTHSTAR_ORIGINALITY_PROTOCOL,
  NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL,
  NORTHSTAR_VISUAL_IDENTITY,
} from "@/lib/canvas-ai/northstar-visual-identity";
import type {
  CanvasCodeArtifactRuntimeReview,
  NorthstarCreativeBrief,
  NorthstarCreativeConcept,
  NorthstarCreativeDirection,
  NorthstarCreativeReview,
  NorthstarCreativeScorecard,
  NorthstarRejectedCreativeConcept,
  NorthstarThinkingDepth,
  NorthstarWebArtifactDocument,
} from "@/lib/canvas-artifacts/types";

export interface NorthstarCreativeBudget {
  conceptCount: number;
  critiquePasses: number;
  maxCritiquePasses: number;
  authoringAttempts: number;
  critiqueSourceRepairAttempts: number;
  explorationTemperature: number;
  selectionTemperature: number;
  artifactTemperature: number;
  critiqueTemperature: number;
}

export interface NorthstarCreativeExplorationDraft {
  brief: NorthstarCreativeBrief;
  concepts: NorthstarCreativeConcept[];
}

export interface NorthstarCreativeSelectionDraft {
  selectedConceptId: string;
  selectionRationale: string;
  scores: NorthstarCreativeScorecard;
  rejectedConcepts: NorthstarRejectedCreativeConcept[];
}

export interface NorthstarCreativeCritiqueDraft {
  accepted: boolean;
  critique: string;
  strengths: string[];
  issues: string[];
  requiredChanges: string[];
  scores: NorthstarCreativeScorecard;
  revisedTitle: string;
  revisedDescription: string;
  revisedVisualStrategy: string;
  revisedDocument: NorthstarWebArtifactDocument;
}

export interface NorthstarCreativeDiversityContext {
  runId: string;
  diversityKey: string;
  provocations: string[];
  recentSignatures: string[];
}

const CREATIVE_PROVOCATIONS = [
  "editorial tension — lead with a sharp thesis and let evidence resolve the tension",
  "cinematic sequence — let time, transition, and pacing become the visual structure",
  "evidence constellation — arrange heterogeneous signals by relationship to one conclusion",
  "opportunity atlas — map future bets as territories with evidence and confidence",
  "decision spine — branch credible paths from a single consequential choice",
  "research pulse — synchronize moments, emotion, friction, quotes, and outcomes",
  "causal system — show how decisions create downstream confidence, friction, or momentum",
  "product transformation — turn observed evidence into a clearly labeled proposed experience",
  "operating model — connect actors, stages, constraints, decisions, and feedback loops",
  "visual argument — structure the artifact as claim, proof, counterpoint, and decision",
  "pattern field — organize recurring behaviors into a memorable spatial landscape",
  "qualitative simulator — let the viewer explore a trade-off without invented precision",
  "documentary flow — use plain ordered screenshots as the narrative spine",
  "strategic memo — combine editorial conviction with disciplined proof and action",
  "before/after transformation — make the proposed change visible as a designed transition",
  "invent a new grammar — derive a spatial metaphor from the exact problem rather than known artifact types",
] as const;

const DEFAULT_SCORECARD: NorthstarCreativeScorecard = {
  clarity: 70,
  grounding: 80,
  originality: 65,
  usefulness: 75,
  craft: 70,
  audienceFit: 75,
};

export const NORTHSTAR_CREATIVE_EXPLORATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    brief: {
      type: "object",
      additionalProperties: false,
      properties: {
        editorialThesis: { type: "string", minLength: 1, maxLength: 240 },
        communicationChallenge: { type: "string", minLength: 1, maxLength: 500 },
        audienceNeed: { type: "string", minLength: 1, maxLength: 400 },
        desiredViewerResponse: { type: "string", minLength: 1, maxLength: 400 },
        centralTension: { type: "string", minLength: 1, maxLength: 320 },
        evidencePriorities: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 240 },
        },
        constraints: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 240 },
        },
        creativeOpportunity: { type: "string", minLength: 1, maxLength: 500 },
      },
      required: [
        "editorialThesis",
        "communicationChallenge",
        "audienceNeed",
        "desiredViewerResponse",
        "centralTension",
        "evidencePriorities",
        "constraints",
        "creativeOpportunity",
      ],
    },
    concepts: {
      type: "array",
      minItems: 2,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 60 },
          name: { type: "string", minLength: 1, maxLength: 100 },
          oneLine: { type: "string", minLength: 1, maxLength: 300 },
          visualGrammar: { type: "string", minLength: 1, maxLength: 500 },
          visualMetaphor: { type: "string", minLength: 1, maxLength: 400 },
          narrativeArc: { type: "string", minLength: 1, maxLength: 600 },
          interactionModel: { type: "string", minLength: 1, maxLength: 500 },
          evidenceStrategy: { type: "string", minLength: 1, maxLength: 600 },
          compositionLanguage: { type: "string", minLength: 1, maxLength: 500 },
          typographyMood: { type: "string", minLength: 1, maxLength: 300 },
          colorLogic: { type: "string", minLength: 1, maxLength: 300 },
          signature: {
            type: "array",
            minItems: 3,
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 100 },
          },
          risks: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 220 },
          },
        },
        required: [
          "id",
          "name",
          "oneLine",
          "visualGrammar",
          "visualMetaphor",
          "narrativeArc",
          "interactionModel",
          "evidenceStrategy",
          "compositionLanguage",
          "typographyMood",
          "colorLogic",
          "signature",
          "risks",
        ],
      },
    },
  },
  required: ["brief", "concepts"],
} as const;

export const NORTHSTAR_CREATIVE_SELECTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    selectedConceptId: { type: "string", minLength: 1, maxLength: 60 },
    selectionRationale: { type: "string", minLength: 1, maxLength: 900 },
    scores: scorecardSchema(),
    rejectedConcepts: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 60 },
          name: { type: "string", minLength: 1, maxLength: 100 },
          reason: { type: "string", minLength: 1, maxLength: 400 },
        },
        required: ["id", "name", "reason"],
      },
    },
  },
  required: ["selectedConceptId", "selectionRationale", "scores", "rejectedConcepts"],
} as const;

export const NORTHSTAR_CREATIVE_CRITIQUE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    accepted: { type: "boolean" },
    critique: { type: "string", minLength: 1, maxLength: 1800 },
    strengths: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
    issues: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 350 },
    },
    requiredChanges: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 350 },
    },
    scores: scorecardSchema(),
    revisedTitle: { type: "string", minLength: 1, maxLength: 180 },
    revisedDescription: { type: "string", minLength: 1, maxLength: 500 },
    revisedVisualStrategy: { type: "string", minLength: 1, maxLength: 1600 },
    revisedDocument: {
      type: "object",
      additionalProperties: false,
      properties: {
        schema: { type: "string", enum: ["northstar.web-artifact-document.v1"] },
        html: { type: "string", minLength: 100, maxLength: 120000 },
        css: { type: "string", minLength: 40, maxLength: 100000 },
        javascript: { type: "string", maxLength: 80000 },
      },
      required: ["schema", "html", "css", "javascript"],
    },
  },
  required: [
    "accepted",
    "critique",
    "strengths",
    "issues",
    "requiredChanges",
    "scores",
    "revisedTitle",
    "revisedDescription",
    "revisedVisualStrategy",
    "revisedDocument",
  ],
} as const;

function scorecardSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      clarity: { type: "integer", minimum: 0, maximum: 100 },
      grounding: { type: "integer", minimum: 0, maximum: 100 },
      originality: { type: "integer", minimum: 0, maximum: 100 },
      usefulness: { type: "integer", minimum: 0, maximum: 100 },
      craft: { type: "integer", minimum: 0, maximum: 100 },
      audienceFit: { type: "integer", minimum: 0, maximum: 100 },
    },
    required: ["clarity", "grounding", "originality", "usefulness", "craft", "audienceFit"],
  } as const;
}

export function creativeBudgetForThinkingDepth(
  thinkingDepth: NorthstarThinkingDepth,
): NorthstarCreativeBudget {
  if (thinkingDepth === "low") {
    return {
      conceptCount: 3,
      critiquePasses: 2,
      maxCritiquePasses: 5,
      authoringAttempts: 6,
      critiqueSourceRepairAttempts: 5,
      explorationTemperature: 0.78,
      selectionTemperature: 0.18,
      artifactTemperature: 0.36,
      critiqueTemperature: 0.12,
    };
  }
  if (thinkingDepth === "high") {
    return {
      conceptCount: 8,
      critiquePasses: 4,
      maxCritiquePasses: 9,
      authoringAttempts: 9,
      critiqueSourceRepairAttempts: 7,
      explorationTemperature: 1.08,
      selectionTemperature: 0.34,
      artifactTemperature: 0.68,
      critiqueTemperature: 0.26,
    };
  }
  return {
    conceptCount: 5,
    critiquePasses: 3,
    maxCritiquePasses: 7,
    authoringAttempts: 8,
    critiqueSourceRepairAttempts: 6,
    explorationTemperature: 0.9,
    selectionTemperature: 0.28,
    artifactTemperature: 0.56,
    critiqueTemperature: 0.22,
  };
}

export function createCreativeDiversityContext(
  recentSignatures: string[] = [],
): NorthstarCreativeDiversityContext {
  const runId = randomUUID();
  const digest = createHash("sha256").update(runId).digest();
  const selected: string[] = [];
  for (let index = 0; selected.length < 4 && index < digest.length; index += 1) {
    const provocation = CREATIVE_PROVOCATIONS[digest[index] % CREATIVE_PROVOCATIONS.length];
    if (!selected.includes(provocation)) selected.push(provocation);
  }
  return {
    runId,
    diversityKey: digest.toString("hex").slice(0, 16),
    provocations: selected,
    recentSignatures: Array.from(new Set(recentSignatures.map(cleanText).filter(Boolean))).slice(0, 24),
  };
}

export function buildCreativeExplorationSystemInstruction(): string {
  return `
You are Northstar's creative design director. You are not selecting a template. You are inventing the communication system that makes this exact problem understandable, memorable, and useful.

${NORTHSTAR_VISUAL_IDENTITY}

${NORTHSTAR_FLOW_REFERENCE_PROTOCOL}

${NORTHSTAR_ORIGINALITY_PROTOCOL}

CREATIVE EXPLORATION STANDARD
- Begin with the viewer's job: what must the human understand, decide, compare, imagine, or do?
- Write an authored editorial thesis. Never reuse the user's instruction as the title or thesis.
- For every concept, define a distinct composition genome through visualGrammar, visualMetaphor, narrativeArc, evidenceStrategy, compositionLanguage, interactionModel, and signature.
- Concepts are materially different only when their spatial system, hierarchy, evidence choreography, and narrative logic differ. Different names, colors, or card arrangements are not different concepts.
- Use the eight attached references as a distributed identity lesson. No single reference is the target and none is a template.
- Avoid recent design signatures. Do not repeat a recent module order, screenshot treatment, or spatial skeleton.
- Choose the visual form from the problem: linear, branching, radial, layered, chronological, geographic, comparative, editorial, cinematic, workshop-like, document-like, product-like, or newly invented.
- If reference flows are part of the evidence, every concept must explain how app icon, app name, exact flow name, and clean horizontal ordered screenshots integrate into its unique composition. Labels below screenshots are optional.
- Facts and metrics must remain grounded. Imagination applies to communication, not evidence.
- Design one adaptive Canvas artifact with no essential internal scrolling. It may expand in any direction.
- Return only the required JSON.
`.trim();
}

export function buildCreativeSelectionSystemInstruction(): string {
  return `
You are Northstar's executive creative director. Select the concept with the strongest union of Northstar identity, problem-fit, clarity, grounded usefulness, and structural originality.

${NORTHSTAR_VISUAL_IDENTITY}

${NORTHSTAR_ORIGINALITY_PROTOCOL}

SELECTION STANDARD
- Judge whether the visual metaphor and spatial system genuinely explain this problem.
- Reject concepts that merely restage one of the eight reference images.
- Reject generic dashboards, card grids, repeated screenshot-row + matrix + recommendation formulas, and concepts whose stated metaphor is absent from the proposed composition.
- Prefer a memorable three-second takeaway with evidence depth that remains inspectable.
- When flows are references, require clean horizontal ordered screenshot storytelling anchored by app icon, app name, and exact flow name; captions remain optional.
- Check recentDesignSignaturesToAvoid and penalize structural repetition.
- Explain specifically why each rejected concept is weaker.
- Score the selected concept from 0 to 100 on every required dimension. Originality means structural originality inside Northstar taste, not visual novelty for its own sake.
- Return only the required JSON.
`.trim();
}

export function buildCreativeCritiqueSystemInstruction(): string {
  return `
You are Northstar's uncompromising visual design critic. You receive the actual rendered candidate plus all eight identity references. Judge the pixels, not the stated intention.

${NORTHSTAR_VISUAL_IDENTITY}

${NORTHSTAR_FLOW_REFERENCE_PROTOCOL}

${NORTHSTAR_ORIGINALITY_PROTOCOL}

${NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL}

CRITIQUE STANDARD
- The current render must feel unmistakably Northstar while remaining compositionally original for this assignment.
- Compare against the identity shared across all eight references. Do not reward similarity to a single reference.
- Verify the selected visual metaphor is materially visible in layout, hierarchy, evidence treatment, and rhythm.
- Detect template imitation, repeated module order, generic SaaS dashboards, excessive rounded-card fields, screenshot cards without purpose, tiny evidence, clipped or ellipsized copy, internal scrolling, accidental blank space, weak app identity, and decorative charts.
- For referenced flows, verify real app icon, app name, exact flow name, and clean horizontal ordered screenshots. Captions are optional and should be removed when they add noise.
- Verify every claim is grounded and no quantitative precision was invented.
- Treat runtime overflow, clipped text, small text, missing images, and scroll risk as concrete defects.
- Set accepted=true only when the pixels achieve professional Northstar craft, solve the user request, express the selected concept, and avoid reference imitation.
- If accepted=false, revisedDocument must materially implement the required changes now. Return a complete HTML/CSS/JavaScript document, not commentary or patches.
- Preserve standard web code. Never introduce React, JSX, TSX, imports, packages, or network access.
- Return only the required JSON.
`.trim();
}

export function buildCreativeExplorationModelInput(input: {
  userRequest: string;
  objective: string;
  audience: string;
  artifactType: string;
  thinkingDepth: NorthstarThinkingDepth;
  conceptCount: number;
  evidenceBrief: unknown;
  researchLedger: unknown;
  diversity: NorthstarCreativeDiversityContext;
  previousDirection?: NorthstarCreativeDirection;
  revisionInstruction?: string;
}): unknown {
  return {
    mode: input.previousDirection ? "revise-existing-artifact" : "create-new-artifact",
    userRequest: input.userRequest,
    revisionInstruction: input.revisionInstruction || undefined,
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    thinkingDepth: input.thinkingDepth,
    requiredConceptCount: input.conceptCount,
    creativeRun: {
      runId: input.diversity.runId,
      diversityKey: input.diversity.diversityKey,
      provocations: input.diversity.provocations,
      recentDesignSignaturesToAvoid: input.diversity.recentSignatures,
    },
    previousCreativeDirection: input.previousDirection || undefined,
    compositionGenomeRequirement: {
      mustDefine: ["viewer job", "visual metaphor", "spatial system", "evidence choreography", "hierarchy", "interaction purpose", "identity expression"],
      mustDifferAcrossConcepts: ["visualGrammar", "visualMetaphor", "narrativeArc", "evidenceStrategy", "compositionLanguage", "signature"],
      antiTemplateRule: "Do not inherit any reference image's module order or layout skeleton.",
    },
    referenceFlowRule: NORTHSTAR_FLOW_REFERENCE_PROTOCOL,
    evidenceBrief: input.evidenceBrief,
    researchLedger: input.researchLedger,
  };
}

export function buildCreativeSelectionModelInput(input: {
  exploration: NorthstarCreativeExplorationDraft;
  audience: string;
  objective: string;
  recentSignatures: string[];
}): unknown {
  return {
    objective: input.objective,
    audience: input.audience,
    creativeBrief: input.exploration.brief,
    candidateConcepts: input.exploration.concepts,
    recentDesignSignaturesToAvoid: input.recentSignatures,
    selectionTests: [
      "Does the concept solve the viewer's job?",
      "Is its spatial grammar materially different from the other candidates?",
      "Does it share Northstar taste without copying a reference layout?",
      "Can it integrate grounded evidence without collapsing into a generic dashboard?",
    ],
  };
}

export function buildCreativeCritiqueModelInput(input: {
  title: string;
  description: string;
  visualStrategy: string;
  document: NorthstarWebArtifactDocument;
  direction: NorthstarCreativeDirection;
  evidenceSummary: unknown;
  pass: number;
  totalPasses: number;
  priorReviews?: NorthstarCreativeReview[];
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
  renderCapture?: { width: number; height: number; mimeType: string };
}): unknown {
  return {
    pass: input.pass,
    totalPasses: input.totalPasses,
    title: input.title,
    description: input.description,
    visualStrategy: input.visualStrategy,
    selectedCreativeDirection: input.direction,
    evidenceSummary: input.evidenceSummary,
    priorReviews: input.priorReviews ?? [],
    runtimeReview: input.runtimeReview,
    renderCapture: input.renderCapture,
    instruction: "The attached artifact screenshot is the current rendered result. The other attached images form an eight-example Northstar identity set, not templates. Revise the complete web document so it shares their taste while remaining structurally original for this exact problem.",
    originalityChecks: [
      "No literal copy of any reference layout or module order",
      "Selected visual metaphor is visible in the pixels",
      "No generic dashboard fallback",
      "No clipped or ellipsized important text",
      "Referenced flows use app identity and clean horizontal ordered screenshots",
    ],
    document: input.document,
  };
}

export function sanitizeCreativeExploration(
  draft: NorthstarCreativeExplorationDraft,
  conceptCount: number,
  objective: string,
): NorthstarCreativeExplorationDraft {
  const brief: NorthstarCreativeBrief = {
    editorialThesis: cleanText(draft?.brief?.editorialThesis).slice(0, 240) || synthesizeThesis(objective),
    communicationChallenge:
      cleanText(draft?.brief?.communicationChallenge).slice(0, 500) ||
      "Make the answer immediately legible while keeping its evidence inspectable.",
    audienceNeed:
      cleanText(draft?.brief?.audienceNeed).slice(0, 400) ||
      "Understand the decision, evidence, and consequence without reading a report.",
    desiredViewerResponse:
      cleanText(draft?.brief?.desiredViewerResponse).slice(0, 400) ||
      "See the main implication quickly, trust the evidence, and know what to do next.",
    centralTension:
      cleanText(draft?.brief?.centralTension).slice(0, 320) ||
      "Clarity and simplicity must coexist with evidence depth.",
    evidencePriorities: cleanStringArray(draft?.brief?.evidencePriorities, 8, 240),
    constraints: cleanStringArray(draft?.brief?.constraints, 8, 240),
    creativeOpportunity:
      cleanText(draft?.brief?.creativeOpportunity).slice(0, 500) ||
      "Turn the strongest evidence relationship into the visual structure of the artifact.",
  };

  const rawConcepts = Array.isArray(draft?.concepts)
    ? draft.concepts
        .slice(0, Math.max(2, conceptCount * 2))
        .map((concept, index) => sanitizeConcept(concept, index))
    : [];
  const concepts: NorthstarCreativeConcept[] = [];
  const identities = new Set<string>();
  for (const concept of rawConcepts) {
    const identity = conceptIdentity(concept);
    if (identities.has(identity)) continue;
    identities.add(identity);
    concepts.push(concept);
    if (concepts.length >= conceptCount) break;
  }
  let fallbackIndex = 0;
  while (concepts.length < conceptCount) {
    const fallback = fallbackConcept(fallbackIndex);
    fallbackIndex += 1;
    const identity = conceptIdentity(fallback);
    if (identities.has(identity)) continue;
    identities.add(identity);
    concepts.push(fallback);
  }

  return { brief, concepts: concepts.slice(0, conceptCount) };
}

export function buildCreativeDirection(input: {
  exploration: NorthstarCreativeExplorationDraft;
  selection: NorthstarCreativeSelectionDraft;
  thinkingDepth: NorthstarThinkingDepth;
  diversity: NorthstarCreativeDiversityContext;
}): NorthstarCreativeDirection {
  const selected =
    input.exploration.concepts.find((concept) => concept.id === input.selection.selectedConceptId) ??
    input.exploration.concepts[0] ??
    fallbackConcept(0);
  const rejectedById = new Map(
    (Array.isArray(input.selection.rejectedConcepts) ? input.selection.rejectedConcepts : []).map((item) => [
      cleanText(item.id),
      item,
    ]),
  );
  const rejectedConcepts = input.exploration.concepts
    .filter((concept) => concept.id !== selected.id)
    .map((concept) => {
      const modelReason = rejectedById.get(concept.id);
      return {
        id: concept.id,
        name: concept.name,
        reason:
          cleanText(modelReason?.reason).slice(0, 400) ||
          "A useful direction, but less effective for the selected audience and evidence story.",
      };
    });

  return {
    runId: input.diversity.runId,
    thinkingDepth: input.thinkingDepth,
    diversityKey: input.diversity.diversityKey,
    creativeProvocations: input.diversity.provocations,
    recentSignaturesAvoided: input.diversity.recentSignatures,
    brief: input.exploration.brief,
    selectedConcept: selected,
    rejectedConcepts,
    selectionRationale:
      cleanText(input.selection.selectionRationale).slice(0, 900) ||
      "Selected for the strongest balance of clarity, evidence grounding, usefulness, and distinctive visual communication.",
    selectionScores: sanitizeScorecard(input.selection.scores),
    conceptCount: input.exploration.concepts.length,
  };
}

export function deterministicCreativeDirection(input: {
  objective: string;
  thinkingDepth: NorthstarThinkingDepth;
  diversity: NorthstarCreativeDiversityContext;
}): NorthstarCreativeDirection {
  const conceptCount = creativeBudgetForThinkingDepth(input.thinkingDepth).conceptCount;
  const exploration = sanitizeCreativeExploration(
    {
      brief: {
        editorialThesis: synthesizeThesis(input.objective),
        communicationChallenge: "Make a grounded decision understandable without flattening the research.",
        audienceNeed: "See the answer first and inspect the proof without leaving the artifact.",
        desiredViewerResponse: "Understand the trade-off, trust the selected evidence, and know the next action.",
        centralTension: "Immediate clarity versus complete evidence depth.",
        evidencePriorities: ["Representative proof moments", "Ordered flows", "Honest uncertainty"],
        constraints: ["One bounded artifact", "No invented metrics", "No expanded view"],
        creativeOpportunity: "Use the evidence relationship itself as the composition rather than a generic dashboard.",
      },
      concepts: Array.from({ length: conceptCount }, (_, index) => fallbackConcept(index)),
    },
    conceptCount,
    input.objective,
  );
  const selectedIndex = Number.parseInt(input.diversity.diversityKey.slice(0, 8), 16) % exploration.concepts.length;
  const selected = exploration.concepts[selectedIndex];
  return buildCreativeDirection({
    exploration,
    selection: {
      selectedConceptId: selected.id,
      selectionRationale: `Selected “${selected.name}” as the strongest deterministic direction for this creative run after model-led exploration was unavailable.`,
      scores: DEFAULT_SCORECARD,
      rejectedConcepts: exploration.concepts
        .filter((concept) => concept.id !== selected.id)
        .map((concept) => ({
          id: concept.id,
          name: concept.name,
          reason: "Retained as a credible alternative, but not selected for this controlled-diversity run.",
        })),
    },
    thinkingDepth: input.thinkingDepth,
    diversity: input.diversity,
  });
}

export function sanitizeCreativeCritique(
  draft: NorthstarCreativeCritiqueDraft,
  pass: number,
  document: NorthstarWebArtifactDocument,
): NorthstarCreativeCritiqueDraft & { review: NorthstarCreativeReview } {
  const revisedDocument: NorthstarWebArtifactDocument = {
    schema: "northstar.web-artifact-document.v1",
    html: cleanSource(draft?.revisedDocument?.html) || document.html,
    css: cleanSource(draft?.revisedDocument?.css) || document.css,
    javascript: cleanSource(draft?.revisedDocument?.javascript) || document.javascript,
  };
  const review: NorthstarCreativeReview = {
    pass,
    accepted: Boolean(draft?.accepted),
    critique: cleanText(draft?.critique).slice(0, 1800) || "Creative review completed.",
    strengths: cleanStringArray(draft?.strengths, 10, 300),
    issues: cleanStringArray(draft?.issues, 12, 350),
    requiredChanges: cleanStringArray(draft?.requiredChanges, 12, 350),
    scores: sanitizeScorecard(draft?.scores),
    sourceFingerprint: fingerprintSource(JSON.stringify(revisedDocument)),
  };
  return {
    accepted: review.accepted,
    critique: review.critique,
    strengths: review.strengths,
    issues: review.issues,
    requiredChanges: review.requiredChanges,
    scores: review.scores,
    revisedTitle: cleanText(draft?.revisedTitle).slice(0, 180),
    revisedDescription: cleanText(draft?.revisedDescription).slice(0, 500),
    revisedVisualStrategy: cleanText(draft?.revisedVisualStrategy).slice(0, 1600),
    revisedDocument,
    review,
  };
}

export function fingerprintSource(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 20);
}

function sanitizeConcept(value: NorthstarCreativeConcept, index: number): NorthstarCreativeConcept {
  return {
    id: normalizeId(value?.id, `concept-${index + 1}`),
    name: cleanText(value?.name).slice(0, 100) || `Concept ${index + 1}`,
    oneLine: cleanText(value?.oneLine).slice(0, 300) || "A grounded visual argument.",
    visualGrammar: cleanText(value?.visualGrammar).slice(0, 500) || "Editorial evidence composition",
    visualMetaphor: cleanText(value?.visualMetaphor).slice(0, 400) || "Evidence resolving a decision",
    narrativeArc: cleanText(value?.narrativeArc).slice(0, 600) || "Answer, proof, implication, action",
    interactionModel: cleanText(value?.interactionModel).slice(0, 500) || "Purposeful evidence highlighting",
    evidenceStrategy: cleanText(value?.evidenceStrategy).slice(0, 600) || "Curate decisive proof and retain traceability",
    compositionLanguage: cleanText(value?.compositionLanguage).slice(0, 500) || "Strong thesis with a spatial evidence spine",
    typographyMood: cleanText(value?.typographyMood).slice(0, 300) || "Confident editorial hierarchy",
    colorLogic: cleanText(value?.colorLogic).slice(0, 300) || "Restrained semantic accents",
    signature: (() => {
      const signature = cleanStringArray(value?.signature, 10, 100).slice(0, 10);
      return signature.length >= 3 ? signature : fallbackConcept(index).signature;
    })(),
    risks: (() => {
      const risks = cleanStringArray(value?.risks, 6, 220);
      return risks.length > 0 ? risks : fallbackConcept(index).risks;
    })(),
  };
}

function fallbackConcept(index: number): NorthstarCreativeConcept {
  const concepts: NorthstarCreativeConcept[] = [
    {
      id: "concept-editorial-argument",
      name: "Editorial Argument",
      oneLine: "Build a visual case in which the thesis, counterpoint, proof, and decision occupy deliberately unequal space.",
      visualGrammar: "Asymmetrical editorial spread with proof exhibits and a decisive closing move",
      visualMetaphor: "A case being argued and resolved",
      narrativeArc: "Provocation, strongest proof, tension, implication, decision",
      interactionModel: "Optional evidence focus reveals source detail without changing the main argument",
      evidenceStrategy: "Lead with the proof that changes the decision; keep secondary evidence in a restrained trace",
      compositionLanguage: "Large typographic field, asymmetric exhibits, controlled whitespace, strong ending",
      typographyMood: "Editorial, confident, contemporary",
      colorLogic: "Mostly monochrome with Northstar violet linking claims to proof",
      signature: ["editorial-spread", "asymmetric-proof", "decisive-ending"],
      risks: ["Requires disciplined copy editing and strong hierarchy"],
    },
    {
      id: "concept-storyline-observatory",
      name: "Storyline Observatory",
      oneLine: "Use a clean horizontal evidence sequence as a cinematic spine and place synthesis where divergence becomes visible.",
      visualGrammar: "Horizontal narrative observatory with plain screenshot sequences and selective evidence enlargement",
      visualMetaphor: "A journey observed across time",
      narrativeArc: "Identity, sequence, divergence, decisive moments, interpretation",
      interactionModel: "Optional focus on a screenshot reveals an annotation or source note",
      evidenceStrategy: "Anchor each reference flow with app icon, app name, exact flow name, and ordered horizontal screenshots; captions only when useful",
      compositionLanguage: "Wide sequence field, minimal framing, strong spatial pauses, compact synthesis",
      typographyMood: "Documentary and precise",
      colorLogic: "Neutral evidence field with restrained product accents and Northstar violet connectors",
      signature: ["horizontal-flow", "plain-screens", "divergence-moment"],
      risks: ["The artifact must widen rather than shrink screenshots into illegibility"],
    },
    {
      id: "concept-evidence-constellation",
      name: "Evidence Constellation",
      oneLine: "Place a central conclusion inside a spatial field of heterogeneous proof whose distance and weight communicate relevance.",
      visualGrammar: "Radial or orbital evidence relationships with a dominant conclusion",
      visualMetaphor: "Signals converging on a North Star",
      narrativeArc: "Question, evidence streams, convergence, conclusion, confidence",
      interactionModel: "Select a signal cluster to foreground its proof and provenance",
      evidenceStrategy: "Group evidence by causal or evidential relationship rather than source type alone",
      compositionLanguage: "Central answer, orbiting clusters, subtle connectors, calm open field",
      typographyMood: "Elegant, spatial, reflective",
      colorLogic: "Violet confidence field with limited semantic accents",
      signature: ["central-conclusion", "evidence-orbits", "spatial-confidence"],
      risks: ["Spatial relationships must communicate meaning rather than decoration"],
    },
    {
      id: "concept-narrative-pulse",
      name: "Narrative Pulse",
      oneLine: "Translate research into a sequence of human moments, emotions, friction, and outcomes.",
      visualGrammar: "Cinematic storyboard with vertically layered interpretation per moment",
      visualMetaphor: "A lived experience unfolding",
      narrativeArc: "Need, exploration, confidence, collaboration, action, impact",
      interactionModel: "Optional moment focus reveals deeper quotes or evidence",
      evidenceStrategy: "Use scenes, quotes, emotions, and product proof as synchronized narrative layers",
      compositionLanguage: "Rhythmic columns or scenes, strong transitions, quiet interpretation rails",
      typographyMood: "Human, editorial, research-led",
      colorLogic: "Soft emotional rhythm with restrained violet signal strength",
      signature: ["research-storyboard", "moment-columns", "emotion-signal"],
      risks: ["Avoid turning every journey into the same six-column storyboard"],
    },
    {
      id: "concept-opportunity-atlas",
      name: "Opportunity Atlas",
      oneLine: "Map strategic opportunities as differentiated territories connected to evidence, impact, and confidence.",
      visualGrammar: "Spatial portfolio map with opportunity zones and evidence callouts",
      visualMetaphor: "A landscape of future bets",
      narrativeArc: "Thesis, territories, evidence, prioritization, recommendation",
      interactionModel: "Optional territory focus reveals supporting signals and trade-offs",
      evidenceStrategy: "Attach proof to each opportunity and make ranking a secondary layer",
      compositionLanguage: "Open map, distinct zones, connective geometry, compact prioritization band",
      typographyMood: "Strategic, expansive, precise",
      colorLogic: "Northstar violet anchors the system; limited colors distinguish opportunity families",
      signature: ["portfolio-map", "opportunity-zones", "evidence-callouts"],
      risks: ["The map must remain immediately understandable"],
    },
    {
      id: "concept-decision-spine",
      name: "Decision Spine",
      oneLine: "Make the decision point the structural center and let credible paths branch from it with evidence, risk, and readiness.",
      visualGrammar: "Branching strategy routes from one central decision node",
      visualMetaphor: "A choice with consequences",
      narrativeArc: "Decision point, options, proof, trade-offs, recommendation, test",
      interactionModel: "Optional route comparison changes emphasis without inventing outcomes",
      evidenceStrategy: "Give each route equivalent proof depth while preserving asymmetry in strategic strength",
      compositionLanguage: "Central hub, clean branches, evidence snippets, weighted conclusion",
      typographyMood: "Executive, lucid, decisive",
      colorLogic: "One shared identity field with limited route colors",
      signature: ["decision-hub", "branching-routes", "weighted-conclusion"],
      risks: ["Do not force an arbitrary number of options"],
    },
    {
      id: "concept-product-transformation",
      name: "Product Transformation",
      oneLine: "Show how observed evidence becomes a proposed experience, principle by principle.",
      visualGrammar: "Reference evidence flowing through a reasoning bridge into a product concept",
      visualMetaphor: "Research transformed into product form",
      narrativeArc: "Signal, principle, proposed move, expected qualitative effect, test",
      interactionModel: "Toggle or focus links proposed elements back to source evidence",
      evidenceStrategy: "Clearly separate observed evidence from proposed design hypotheses",
      compositionLanguage: "Evidence field, narrow reasoning bridge, expressive concept stage",
      typographyMood: "Design-forward, optimistic, rigorous",
      colorLogic: "Neutral source material with a more expressive proposed direction",
      signature: ["evidence-to-concept", "reasoning-bridge", "proposed-experience"],
      risks: ["Proposals must not be presented as observed facts"],
    },
    {
      id: "concept-operating-system",
      name: "Operating System",
      oneLine: "Reveal actors, stages, decisions, constraints, and feedback loops as one navigable system.",
      visualGrammar: "Layered operating model with lanes, loops, and decision points",
      visualMetaphor: "A system that produces outcomes",
      narrativeArc: "Inputs, coordination, decisions, execution, feedback, improvement",
      interactionModel: "Focus a lane or loop to inspect responsibilities and evidence",
      evidenceStrategy: "Use proof at the points where the system succeeds or breaks",
      compositionLanguage: "Structured layers, meaningful connectors, selective callouts, clear system boundary",
      typographyMood: "Systems-oriented and calm",
      colorLogic: "Violet connective logic with sparse role or state accents",
      signature: ["operating-model", "feedback-loops", "decision-points"],
      risks: ["Complexity must be edited into a dominant path"],
    },
  ];
  const base = concepts[index % concepts.length];
  const cycle = Math.floor(index / concepts.length);
  return cycle === 0
    ? base
    : {
        ...base,
        id: `${base.id}-${cycle + 1}`,
        name: `${base.name} ${cycle + 1}`,
        signature: [...base.signature, `variation-${cycle + 1}`],
      };
}

function conceptIdentity(concept: NorthstarCreativeConcept): string {
  const signature = concept.signature.map((item) => cleanText(item).toLowerCase()).sort().join("|");
  return `${cleanText(concept.name).toLowerCase()}::${signature}`;
}

function sanitizeScorecard(value: Partial<NorthstarCreativeScorecard> | undefined): NorthstarCreativeScorecard {
  return {
    clarity: score(value?.clarity, DEFAULT_SCORECARD.clarity),
    grounding: score(value?.grounding, DEFAULT_SCORECARD.grounding),
    originality: score(value?.originality, DEFAULT_SCORECARD.originality),
    usefulness: score(value?.usefulness, DEFAULT_SCORECARD.usefulness),
    craft: score(value?.craft, DEFAULT_SCORECARD.craft),
    audienceFit: score(value?.audienceFit, DEFAULT_SCORECARD.audienceFit),
  };
}

function score(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => cleanText(item).slice(0, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function cleanSource(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value: unknown, fallback: string): string {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return normalized || fallback;
}

function synthesizeThesis(objective: string): string {
  const clean = cleanText(objective).replace(/^(build|create|make|design|show|compare)\s+/i, "");
  if (!clean) return "The evidence reveals a clearer decision.";
  return clean.length <= 140 ? clean : `${clean.slice(0, 137).trimEnd()}…`;
}
