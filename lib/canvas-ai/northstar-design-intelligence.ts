// Northstar Design Intelligence v0.4.8.3 — artist-like micro-adjustments on one living artboard, continuously conditioned by the eight gold-standard references
import { createHash, randomUUID } from "node:crypto";
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


export const NORTHSTAR_VISUAL_IDENTITY_VERSION = "northstar.visual-identity.v0.4.8" as const;

export const NORTHSTAR_VISUAL_IDENTITY = `
NORTHSTAR VISUAL IDENTITY — TASTE, NOT TEMPLATES

The eight labeled images are a few-shot education in Northstar taste and communication quality. They are never layouts to trace, component inventories, required sections, or module recipes.

Learn the constants shared across the references:
- authored editorial point of view: lead with the answer, tension, question, or decision—not the user's prompt
- immediate comprehension: the core meaning should become clear in roughly three seconds
- premium restraint: confident typography, exact spacing, subtle depth, clean alignment, calm color, and no decorative clutter
- evidence as communication material: screenshots, quotes, numbers, diagrams, flows, and provenance are choreographed into the argument
- purposeful hierarchy: scale, position, rhythm, contrast, whitespace, and motion explain what matters
- Northstar character: charcoal typography, restrained violet connective accents, soft white/lilac fields, lucid micro-labels, and polished editorial craft
- inspectable reasoning: the answer is clear while evidence, uncertainty, trade-offs, and next actions remain available inside the artifact
- adaptive composition: the artifact chooses and grows into the spatial system best suited to the problem

Do not learn accidental similarities as rules: fixed rails, matrices, screenshot cards, recommendation banners, card grids, or one standard dashboard skeleton.

A successful artifact feels unmistakably Northstar while being structurally original for the exact problem. Concept studies are private design reasoning; the single visible artboard evolves continuously and is never replaced by study markup.
`.trim();

export const NORTHSTAR_FLOW_REFERENCE_PROTOCOL = `
NORTHSTAR REFERENCE-FLOW PROTOCOL

When product flows are reference evidence:
- anchor every flow with the real app icon, app name, and exact flow name
- display the referenced screenshots as a clean horizontal sequence in authoritative order
- let the Canvas artifact widen when the sequence needs room; never wrap the journey into a generic grid merely to fit an initial frame
- show screenshots plainly at natural aspect ratio with minimal framing by default
- screenshot labels are optional; omit them when the sequence already tells the story
- never crop decisive screenshots, hide essential screens behind interaction, or force the sequence into an internal scroller
- use arrows, spacing, grouping, selective enlargement, or annotation only when they improve understanding

This is a semantic evidence behaviour, not a visual template.
`.trim();

export const NORTHSTAR_ORIGINALITY_PROTOCOL = `
NORTHSTAR DESIGN-BEHAVIOUR PROTOCOL

Before writing markup, choose the visual medium a world-class designer would use to communicate this exact answer. Derive:
1. viewer job — what the human must understand, decide, compare, imagine, or do
2. medium — editorial spread, cinematic storyboard, constellation, atlas, decision spine, blueprint, research wall, system map, product concept, simulation, memo, or a newly invented form
3. visual metaphor — the spatial idea that makes the problem understandable
4. evidence choreography — what leads, supports, stays quiet, and remains inspectable
5. spatial behaviour — linear, branching, radial, layered, chronological, geographic, comparative, freeform, or invented
6. design acts — the meaningful visual moves through which the artifact evolves live
7. interaction purpose — only when interaction clarifies, compares, focuses, reveals, connects, or simulates
8. identity expression — how Northstar taste appears without copying any reference

Concepts are materially different only when medium, visual metaphor, spatial system, hierarchy, evidence treatment, and narrative arc differ. Different names, colors, or card arrangements are not different concepts.

Automatic failures:
- imitation of any one reference image
- repeated screenshot rows + matrix + insight cards + recommendation as a universal formula
- generic dashboard or card grid chosen because no stronger visual idea exists
- a stated metaphor absent from the rendered pixels
- selecting a concept from prose without comparing rendered concept studies
`.trim();

export const NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL = `
NORTHSTAR PRESENTATION QUALITY PROTOCOL

Never publish a revision with clipped, ellipsized, overflowing, or unreadably small important text; decorative screenshot frames; essential internal scrolling; stale blank regions; unfinished placeholders; unsupported metrics; or generic template structure.

Text wraps or the composition expands. Screenshots remain readable. Artifact bounds follow the full composition. The initial viewport is never a constraint: the artboard grows to preserve readable evidence and to make room for each design act. Every published revision is coherent and intentional.
`.trim();

export const NORTHSTAR_DESIGN_BEHAVIOUR_ADDENDUM = [
  NORTHSTAR_VISUAL_IDENTITY,
  NORTHSTAR_FLOW_REFERENCE_PROTOCOL,
  NORTHSTAR_ORIGINALITY_PROTOCOL,
  NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL,
].join("\n\n");

export function buildNorthstarDesignBehaviorAddendum(): string {
  return NORTHSTAR_DESIGN_BEHAVIOUR_ADDENDUM;
}


export interface NorthstarCreativeBudget {
  conceptCount: number;
  designActCount: number;
  designActAttempts: number;
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


export interface NorthstarDynamicDesignMoveDraft {
  continueDesigning: boolean;
  label: string;
  phase: "analysis" | "recommendation" | "refinement";
  diagnosis: string;
  intent: string;
  observableOutcome: string;
  successCriteria: string[];
  stopReason: string;
}

export const NORTHSTAR_DYNAMIC_DESIGN_MOVE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    continueDesigning: { type: "boolean" },
    label: { type: "string", minLength: 1, maxLength: 120 },
    phase: { type: "string", enum: ["analysis", "recommendation", "refinement"] },
    diagnosis: { type: "string", minLength: 1, maxLength: 900 },
    intent: { type: "string", minLength: 1, maxLength: 900 },
    observableOutcome: { type: "string", minLength: 1, maxLength: 700 },
    successCriteria: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 360 } },
    stopReason: { type: "string", maxLength: 700 },
  },
  required: ["continueDesigning", "label", "phase", "diagnosis", "intent", "observableOutcome", "successCriteria", "stopReason"],
} as const;

export function buildNorthstarDynamicDesignMoveSystemInstruction(): string {
  return `
You are Northstar's autonomous creative director working on one continuously mounted living artboard.

Decide the single most valuable visual move now by inspecting the exact current render. There is no fixed checklist, stage sequence, or required label. Never reuse canned labels such as “tune evidence scale”, “organize the key relationship”, “expose the central tension”, or “form the visual argument”. Name the move specifically for what this artwork needs now.

Think like an exceptional editorial product designer:
- diagnose the largest unresolved visual weakness visible in the current pixels
- choose one concrete, cumulative move on existing semantic nodes
- make evidence hierarchy, rhythm, meaning, and beauty materially better
- preserve the same artboard, iframe, document, and useful existing work
- use the eight references as the gold-standard taste bar, never as templates
- prefer spatial composition, scale, grouping, pacing, contrast, selective evidence, and integrated synthesis over generic cards
- treat annotation as an explanatory instrument, never decoration: no free-floating dots, dotted lines, pulses, arrows, or connectors without a named meaning and anchored source and destination
- before drawing any relationship, state its exact source node, target node, semantic type, meaning, confidence, and expected viewer takeaway
- use the real app icon or grounded product identity as the actor in maps and diagrams when it improves recognition; avoid generic anonymous pills
- connector geometry must avoid important screenshot content and text, and labels must sit beside their actual anchor rather than float in empty space
- qualitative axes must be explicitly labeled interpretive and explained; never imply measured precision without grounded data
- periodically transform the composition around one primary relationship system instead of accumulating disconnected charts, cards, and annotations
- alternate additive moves with subtraction, compression, relocation, enlargement, merging, and removal; do not solve every insight by appending another section
- periodically challenge the entire composition and substantially rearrange existing nodes when the current visual form has reached a local minimum
- do not repeat the previous move, reinsert an existing node, or merely rewrite progress copy
- do not stop while the surface is still an evidence dump, visually generic, sparse, unreadable, repetitive, or below premium editorial craft
- before stopping, remove unexplained marks, redundant cards, repeated messages, weak decorations, and anything that does not improve comprehension within three seconds

Set continueDesigning=false only when the current exact surface is genuinely resolved at the reference-quality bar and no important visual improvement remains. Return only JSON.
`.trim();
}

export function sanitizeNorthstarDynamicDesignMove(
  value: NorthstarDynamicDesignMoveDraft,
  input: { moveIndex: number; minimumMoves: number; recentLabels: string[] },
): NorthstarDynamicDesignMoveDraft {
  const recent = new Set(input.recentLabels.map((label) => label.toLowerCase()));
  const label = cleanText(value?.label, 120) || `Refine the living composition ${input.moveIndex + 1}`;
  const continueDesigning = input.moveIndex < input.minimumMoves ? true : Boolean(value?.continueDesigning);
  if (continueDesigning && recent.has(label.toLowerCase())) {
    throw new Error("The dynamic design move repeats a recent artistic decision.");
  }
  return {
    continueDesigning,
    label,
    phase: ["analysis", "recommendation", "refinement"].includes(value?.phase) ? value.phase : "analysis",
    diagnosis: cleanText(value?.diagnosis, 900) || "The current artboard still has an unresolved visual hierarchy problem.",
    intent: cleanText(value?.intent, 900) || "Make one specific cumulative visual improvement on the existing artboard.",
    observableOutcome: cleanText(value?.observableOutcome, 700) || "The improvement is clearly visible in the exact live surface.",
    successCriteria: cleanStringArray(value?.successCriteria, 8, 360).slice(0, 8),
    stopReason: cleanText(value?.stopReason, 700),
  };
}

export function buildNorthstarDynamicDesignMoveModelInput(input: {
  objective: string;
  audience: string;
  artifactType: string;
  moveIndex: number;
  minimumMoves: number;
  maximumMoves: number;
  visibleMutationCount: number;
  currentTitle: string;
  currentDescription: string;
  currentGeometry: { width: number; height: number };
  recentSuccessfulMoves: Array<{ label: string; visibleChange: string }>;
  priorCritique?: { critique: string; requiredChanges: string[] };
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
  creativeDirection: NorthstarCreativeDirection;
  evidenceSummary: unknown;
}): unknown {
  return {
    mode: "autonomous-next-best-visual-move",
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    iteration: {
      index: input.moveIndex + 1,
      minimumMoves: input.minimumMoves,
      maximumMoves: input.maximumMoves,
      visibleMutationCount: input.visibleMutationCount,
    },
    currentSurface: {
      title: input.currentTitle,
      description: input.currentDescription,
      geometry: input.currentGeometry,
      runtimeReview: input.runtimeReview,
    },
    recentSuccessfulMoves: input.recentSuccessfulMoves.slice(-6),
    priorCritique: input.priorCritique,
    creativeDirection: input.creativeDirection,
    evidenceSummary: input.evidenceSummary,
    decisionContract: {
      noFixedChecklist: true,
      oneSpecificMoveOnly: true,
      mustBeVisiblyDifferentFromRecentMoves: true,
      mustTargetTheExactCurrentSurface: true,
      sameLivingArtboard: true,
      goldStandardReferencesAreTasteConditioning: true,
    },
  };
}

export interface NorthstarCreativeDiversityContext {
  runId: string;
  diversityKey: string;
  provocations: string[];
  recentSignatures: string[];
}

export interface NorthstarProgressiveDesignAct {
  id: string;
  label: string;
  phase: "analysis" | "recommendation" | "refinement";
  intent: string;
  successCriteria: string[];
  minimumChangeCharacters: number;
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
          medium: { type: "string", minLength: 1, maxLength: 160 },
          viewerJob: { type: "string", minLength: 1, maxLength: 400 },
          spatialBehavior: { type: "string", minLength: 1, maxLength: 500 },
          designActs: {
            type: "array",
            minItems: 2,
            maxItems: 7,
            items: { type: "string", minLength: 1, maxLength: 220 },
          },
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
          study: {
            type: "object",
            additionalProperties: false,
            properties: {
              document: {
                type: "object",
                additionalProperties: false,
                properties: {
                  schema: { type: "string", enum: ["northstar.web-artifact-document.v1"] },
                  html: { type: "string", minLength: 100, maxLength: 36000 },
                  css: { type: "string", minLength: 40, maxLength: 32000 },
                  javascript: { type: "string", maxLength: 12000 },
                },
                required: ["schema", "html", "css", "javascript"],
              },
              preferredWidth: { type: "integer", minimum: 960, maximum: 2600 },
              preferredHeight: { type: "integer", minimum: 600, maximum: 1800 },
              visualIntent: { type: "string", minLength: 1, maxLength: 500 },
              evidencePlan: { type: "string", minLength: 1, maxLength: 700 },
            },
            required: ["document", "preferredWidth", "preferredHeight", "visualIntent", "evidencePlan"],
          },
        },
        required: [
          "id",
          "name",
          "oneLine",
          "medium",
          "viewerJob",
          "spatialBehavior",
          "designActs",
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
          "study",
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
      conceptCount: 2,
      designActCount: 12,
      designActAttempts: 2,
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
      conceptCount: 6,
      designActCount: 20,
      designActAttempts: 3,
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
    conceptCount: 4,
    designActCount: 16,
    designActAttempts: 2,
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

export function buildNorthstarProgressiveDesignActs(input: {
  direction: NorthstarCreativeDirection;
  thinkingDepth: NorthstarThinkingDepth;
  hasReferenceFlows: boolean;
  screenshotCount: number;
  decisionCount: number;
}): NorthstarProgressiveDesignAct[] {
  const budget = creativeBudgetForThinkingDepth(input.thinkingDepth);
  const selected = input.direction.selectedConcept;

  const act = (
    id: string,
    label: string,
    phase: NorthstarProgressiveDesignAct["phase"],
    intent: string,
    successCriteria: string[],
  ): NorthstarProgressiveDesignAct => ({
    id,
    label,
    phase,
    intent,
    successCriteria: [
      "Make one focused, observable adjustment to the currently mounted artboard.",
      "The browser must acknowledge changed semantic nodes before this act is marked complete.",
      "Do not satisfy this act by changing only the progress label, deck copy, border, or global width.",
      "Preserve the same artboard, base document, evidence lineage, and strong existing work.",
      ...successCriteria,
    ],
    // Kept for compatibility with older callers. v0.4.8 validates semantic mutations,
    // not full-document character differences.
    minimumChangeCharacters: 1,
  });

  const foundation: NorthstarProgressiveDesignAct[] = [
    act(
      "sharpen-live-focus",
      "Sharpen the live visual focus",
      "analysis",
      `Make the current question and viewer job immediately legible through one restrained hierarchy adjustment. Keep the chosen medium “${selected.medium}” provisional; do not rebuild the surface.`,
      [
        "The opening focus becomes clearer in roughly three seconds.",
        "The change is visible without relying on progress commentary.",
      ],
    ),
    act(
      "curate-first-proof",
      input.hasReferenceFlows ? "Curate the first decisive flow evidence" : "Curate the first decisive proof",
      "analysis",
      input.hasReferenceFlows
        ? "Adjust the existing evidence region so the strongest app identity and first decisive screenshots lead. Preserve app icon, app name, exact flow name, authoritative order, and plain horizontal presentation."
        : "Promote the strongest grounded proof already available and quiet weaker supporting material without creating a card grid.",
      [
        "The leading evidence is visibly more prominent.",
        "No evidence is invented, cropped, hidden behind interaction, or moved out of traceable context.",
      ],
    ),
    act(
      "tune-evidence-scale",
      "Tune evidence scale and breathing room",
      "analysis",
      "Make screenshots and proof moments readable at natural scale. Adjust gaps, grouping, and the artboard's required space rather than compressing content into the current rectangle.",
      [
        "Important screenshots remain inspectable.",
        "Geometry follows the composition and no essential internal scrolling is introduced.",
      ],
    ),
    act(
      "organize-key-relationship",
      "Organize the key relationship",
      "analysis",
      `Use one spatial adjustment to reveal the relationship implied by ${selected.visualMetaphor || "the selected visual metaphor"}. Move, group, align, or separate existing elements; do not replace the document.`,
      [
        "The relationship between the leading pieces of evidence becomes visible in the pixels.",
        "The result remains structurally original rather than becoming a generic dashboard.",
      ],
    ),
    act(
      "expose-central-tension",
      "Expose the central tension",
      "analysis",
      `Introduce or sharpen one concise visual statement of the central tension: ${input.direction.brief.centralTension}. Let evidence support it rather than repeating the user prompt.`,
      [
        "The thesis becomes answer-led and evidence-backed.",
        "The tension belongs to the composition instead of appearing as an appended card.",
      ],
    ),
  ];

  const conceptMicroActs = (selected.designActs ?? [])
    .map((intent, index) => cleanText(intent).slice(0, 700))
    .filter(Boolean)
    .map((intent, index) => act(
      `concept-micro-${index + 1}`,
      `Develop ${selected.name}: move ${index + 1}`,
      index < 2 ? "analysis" : "recommendation",
      `Translate only this focused part of the selected behaviour into the existing artboard: ${intent}. Make it through semantic node mutations, not a replacement render.`,
      [
        `The selected medium “${selected.medium}” becomes more visible through an incremental change.`,
        "The adjustment can be understood by watching the artboard evolve.",
      ],
    ));

  const resolution: NorthstarProgressiveDesignAct[] = [
    act(
      "form-visual-argument",
      "Form the visual argument",
      "analysis",
      `Connect the current evidence, tension, and selected metaphor—${selected.visualMetaphor}—through one visible compositional move. Preserve all useful existing nodes and improve their relationship.`,
      [
        "The spatial system explains the problem instead of merely decorating it.",
        "The artboard no longer reads as an undifferentiated evidence dump.",
      ],
    ),
    act(
      "emphasize-decisive-proof",
      "Emphasize the decisive proof",
      "analysis",
      "Enlarge, isolate, annotate, or reposition only the proof moments that carry the argument. Reduce visual competition from repetitive evidence without deleting authoritative flow order.",
      [
        "The decisive proof is obvious at a glance.",
        "Supporting evidence remains available and honest.",
      ],
    ),
    act(
      "add-grounded-annotation",
      "Add one layer of grounded interpretation",
      "analysis",
      "Add concise, evidence-linked annotations or connective marks only where they help the viewer understand why a moment matters. Avoid labels that merely restate screenshots.",
      [
        "Interpretation is visibly attached to its evidence.",
        "The composition stays calm and uncluttered.",
      ],
    ),
    act(
      "develop-synthesis",
      "Develop the synthesis in place",
      "recommendation",
      "Reveal the emerging synthesis inside the existing visual grammar. Add or reshape the synthesis region without bolting on a generic summary panel.",
      [
        "The synthesis follows naturally from visible evidence.",
        "The artboard expands or recomposes at readable scale when the synthesis needs room.",
      ],
    ),
    act(
      "resolve-decision",
      input.decisionCount > 0 ? "Resolve the decision and implications" : "Resolve what the viewer should understand next",
      "recommendation",
      input.decisionCount > 0
        ? "Express the grounded decision, trade-offs, confidence, and next action in a form native to the current composition."
        : "Resolve the visual story into a concise implication and next understanding without inventing a recommendation.",
      [
        "The conclusion is useful, grounded, and visually integrated.",
        "No separate final page or final render is introduced.",
      ],
    ),
    act(
      "rebalance-live-geometry",
      "Rebalance the living artboard",
      "refinement",
      "Recompose spacing and region proportions around the content now present. Allow the same artboard to grow, contract, or shift origin after the mutation; never scale the design to fit an old viewport.",
      [
        "No content is clipped and no stale accidental empty region remains.",
        "The measured geometry matches the complete rendered composition.",
      ],
    ),
    act(
      "refine-hierarchy-rhythm",
      "Refine hierarchy, rhythm, and legibility",
      "refinement",
      "Make a focused pass on typography, alignment, spacing, evidence prominence, and density. Remove noise rather than introducing new modules.",
      [
        "Important text is complete and readable.",
        "The composition feels authored, calm, premium, and easy to consume.",
      ],
    ),
    act(
      "complete-editorial-craft",
      "Complete the editorial craft pass",
      "refinement",
      "Finish the same live surface against all eight Northstar reference images: sharpen typography, spacing, restraint, violet/lilac connective character, evidence clarity, and detail without copying a reference structure.",
      [
        "The result carries the gold-standard Northstar design language while remaining structurally original.",
        "The final state is simply the accumulated mature state of the starting artboard.",
      ],
    ),
  ];

  // Low receives the complete narrative spine. Medium and high add more observable
  // concept-specific moves between evidence organization and resolution.
  const requiredTailCount = resolution.length;
  const conceptCapacity = Math.max(0, budget.designActCount - foundation.length - requiredTailCount);
  const selectedConceptActs = conceptMicroActs.slice(0, conceptCapacity);
  const ordered = [...foundation, ...selectedConceptActs, ...resolution];

  // When the selected concept provides fewer moves than the budget, split refinement into
  // additional focused adjustments instead of inflating a single private authoring pass.
  const fillers: NorthstarProgressiveDesignAct[] = [
    act("tune-composition-density", "Tune composition density", "refinement", "Adjust only density and whitespace so the strongest regions breathe and supporting regions remain compact.", ["The density change is visibly meaningful and preserves readability."]),
    act("tune-type-contrast", "Tune typographic contrast", "refinement", "Adjust only typographic scale, weight, line length, and contrast to clarify reading order.", ["The reading order becomes unmistakable without decorative excess."]),
    act("tune-connective-language", "Tune the connective visual language", "refinement", "Adjust only lines, arrows, separators, accents, or spatial continuity that help the eye move through the argument.", ["Connective elements clarify relationships and remain restrained."]),
    act("remove-residual-noise", "Remove residual visual noise", "refinement", "Remove, quiet, or consolidate elements that no longer contribute to the final argument while keeping grounded evidence intact.", ["The artboard becomes simpler without losing meaning or provenance."]),
  ];

  const result = [...ordered];
  let fillerIndex = 0;
  while (result.length < budget.designActCount && fillerIndex < fillers.length) {
    result.splice(Math.max(foundation.length, result.length - 1), 0, fillers[fillerIndex]);
    fillerIndex += 1;
  }
  return result.slice(0, budget.designActCount);
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
- For every concept, first choose a medium and viewer job, then define a distinct composition genome through spatialBehavior, designActs, visualGrammar, visualMetaphor, narrativeArc, evidenceStrategy, compositionLanguage, interactionModel, and signature.
- Every concept must include a compact but real standard-web study document. The study is not the final artifact; it must visibly demonstrate the medium, hierarchy, spatial behaviour, evidence choreography, and Northstar identity so selection can compare actual pixels rather than prose.
- Concepts are materially different only when their spatial system, hierarchy, evidence choreography, and narrative logic differ. Different names, colors, or card arrangements are not different concepts.
- Use the eight attached references as a distributed identity lesson. No single reference is the target and none is a template.
- Avoid recent design signatures. Do not repeat a recent module order, screenshot treatment, or spatial skeleton.
- Choose the visual form from the problem: linear, branching, radial, layered, chronological, geographic, comparative, editorial, cinematic, workshop-like, document-like, product-like, or newly invented.
- If reference flows are part of the evidence, every concept must explain how app icon, app name, exact flow name, and clean horizontal ordered screenshots integrate into its unique composition. Labels below screenshots are optional.
- Study documents may use only facts, app identities, and asset URLs supplied in the input. They should use representative evidence rather than trying to fit the full final artifact.
- Facts and metrics must remain grounded. Imagination applies to communication, not evidence.
- Design one adaptive Canvas artifact with no essential internal scrolling. It may expand in any direction.
- Treat the current width and height only as the present bounds of the artboard, never as a viewport the design must fit inside. Preserve readable scale and grow the artifact whenever the composition needs room.
- Return only the required JSON.
`.trim();
}

export function buildCreativeSelectionSystemInstruction(): string {
  return `
You are Northstar's executive creative director. Select the concept with the strongest union of Northstar identity, problem-fit, clarity, grounded usefulness, and structural originality.

${NORTHSTAR_VISUAL_IDENTITY}

${NORTHSTAR_ORIGINALITY_PROTOCOL}

SELECTION STANDARD
- You receive private rendered concept-study images. Judge the pixels first and the prose second. Never recommend publishing a study document; select only the behaviour that should evolve the existing artboard.
- Judge whether the chosen medium, visual metaphor, spatial system, and design acts genuinely explain this problem.
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
- The BEFORE and AFTER images are the same mounted artboard around one mutation. Reject a claimed design act when the visible delta is absent, trivial, duplicated, or does not satisfy that act.
- Missing images, clipping, internal scrolling, or a browser runtime rejection force accepted=false and cap every craft-related score below 60.
- Do not award repeated scores or generic praise. Name the exact pixels that improved and the exact next movement required.
- Set accepted=true only when the live pixels achieve professional Northstar craft, solve the user request, express the selected concept, and avoid reference imitation.
- revisedDocument is retained only for schema compatibility. Return the current accumulated document unchanged; requiredChanges must describe the next granular mutation, never a replacement page.
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
      mustDefine: ["viewer job", "medium", "visual metaphor", "spatial behaviour", "design acts", "evidence choreography", "hierarchy", "interaction purpose", "identity expression", "rendered concept study"],
      mustDifferAcrossConcepts: ["medium", "spatialBehavior", "designActs", "visualGrammar", "visualMetaphor", "narrativeArc", "evidenceStrategy", "compositionLanguage", "signature"],
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
    candidateConcepts: input.exploration.concepts.map((concept, index) => ({
      imageIndex: index + 1,
      id: concept.id,
      name: concept.name,
      oneLine: concept.oneLine,
      medium: concept.medium,
      viewerJob: concept.viewerJob,
      spatialBehavior: concept.spatialBehavior,
      designActs: concept.designActs,
      visualGrammar: concept.visualGrammar,
      visualMetaphor: concept.visualMetaphor,
      narrativeArc: concept.narrativeArc,
      interactionModel: concept.interactionModel,
      evidenceStrategy: concept.evidenceStrategy,
      compositionLanguage: concept.compositionLanguage,
      typographyMood: concept.typographyMood,
      colorLogic: concept.colorLogic,
      signature: concept.signature,
      risks: concept.risks,
      studyIntent: concept.study?.visualIntent,
      studyEvidencePlan: concept.study?.evidencePlan,
      renderedStudyFingerprint: concept.renderedStudyFingerprint,
    })),
    recentDesignSignaturesToAvoid: input.recentSignatures,
    selectionTests: [
      "Does the rendered study solve the viewer's job through the right medium?",
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
  designAct?: NorthstarProgressiveDesignAct;
  previousRender?: { width: number; height: number; mimeType: string };
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
    previousRender: input.previousRender,
    currentDesignAct: input.designAct,
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
    medium: cleanText(value?.medium).slice(0, 160) || "problem-specific visual artifact",
    viewerJob: cleanText(value?.viewerJob).slice(0, 400) || "Understand the answer, inspect the proof, and know the next move.",
    spatialBehavior: cleanText(value?.spatialBehavior).slice(0, 500) || "Let the evidence determine an adaptive authored field.",
    designActs: (() => {
      const acts = cleanStringArray(value?.designActs, 7, 220);
      return acts.length >= 2 ? acts : ["Establish the authored point of view", "Choreograph the decisive evidence", "Resolve the implication"];
    })(),
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
    study: sanitizeConceptStudy(value?.study, index),
    renderedStudyFingerprint: cleanText(value?.renderedStudyFingerprint).slice(0, 80) || undefined,
  };
}


function sanitizeConceptStudy(value: NorthstarCreativeConcept["study"], index: number): NonNullable<NorthstarCreativeConcept["study"]> {
  const fallback = fallbackStudy(index);
  const document = value?.document;
  return {
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: cleanSource(document?.html).slice(0, 36000) || fallback.document.html,
      css: cleanSource(document?.css).slice(0, 32000) || fallback.document.css,
      javascript: cleanSource(document?.javascript).slice(0, 12000),
    },
    preferredWidth: clampInteger(value?.preferredWidth, 960, 2600, fallback.preferredWidth),
    preferredHeight: clampInteger(value?.preferredHeight, 600, 1800, fallback.preferredHeight),
    visualIntent: cleanText(value?.visualIntent).slice(0, 500) || fallback.visualIntent,
    evidencePlan: cleanText(value?.evidencePlan).slice(0, 700) || fallback.evidencePlan,
  };
}

function fallbackStudy(index: number): NonNullable<NorthstarCreativeConcept["study"]> {
  const variants = [
    { title: "Editorial argument", geometry: "grid-template-columns:1.35fr .65fr", accent: "#6b4dff" },
    { title: "Storyline observatory", geometry: "grid-template-columns:repeat(4,minmax(180px,1fr))", accent: "#4e78ff" },
    { title: "Evidence constellation", geometry: "grid-template-columns:repeat(3,1fr)", accent: "#7c5cff" },
    { title: "Decision landscape", geometry: "grid-template-columns:repeat(3,1fr)", accent: "#ff6a2a" },
  ];
  const variant = variants[index % variants.length];
  return {
    preferredWidth: 1280,
    preferredHeight: 760,
    visualIntent: `A compact rendered concept study for ${variant.title}.`,
    evidencePlan: "Use representative grounded evidence only to demonstrate hierarchy and spatial behaviour; the final artifact will carry the complete evidence contract.",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: `<main class="ns-artifact ns-concept-study" data-ns-design-kernel="v1"><header><p>Northstar concept study</p><h1 class="ns-thesis">${variant.title}</h1><p>Answer first. Evidence becomes the structure.</p></header><section class="study-field"><article><strong>Thesis</strong><span>The core implication is immediately visible.</span></article><article><strong>Evidence</strong><span>Proof is choreographed rather than dumped.</span></article><article><strong>Decision</strong><span>The visual medium resolves into a useful next move.</span></article></section></main>`,
      css: `.ns-concept-study{width:1280px;min-height:760px;padding:56px;background:linear-gradient(180deg,#fdfcff,#f5f3fb);color:#151620;font-family:Inter,system-ui,sans-serif}.ns-concept-study header{max-width:920px}.ns-concept-study header p{color:#6b4dff;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.ns-thesis{font-size:64px;line-height:.96;letter-spacing:-.055em;margin:12px 0}.study-field{display:grid;${variant.geometry};gap:24px;margin-top:56px}.study-field article{min-height:220px;padding:28px;border-top:3px solid ${variant.accent};background:rgba(255,255,255,.72)}.study-field strong{display:block;font-size:24px}.study-field span{display:block;margin-top:16px;color:#686b79;font-size:17px;line-height:1.5}`,
      javascript: "",
    },
  };
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback;
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

function cleanText(value: unknown, maxLength?: number): string {
  const cleaned = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return typeof maxLength === "number" && Number.isFinite(maxLength)
    ? cleaned.slice(0, Math.max(0, Math.floor(maxLength)))
    : cleaned;
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
