export const NORTHSTAR_INDEPENDENT_CREATIVE_REVIEW_VERSION =
  "northstar.independent-creative-review.v1" as const;

export interface NorthstarIndependentCreativeReviewDraft {
  interpretation?: string;
  strongestAspect?: string;
  unresolvedProblems?: string[];
  evidenceCommunicationAssessment?: string;
  recommendedIntervention?: string;
  materialImprovementAvailable?: boolean;
  rationale?: string;
}

export interface NorthstarIndependentCreativeReview {
  interpretation: string;
  strongestAspect: string;
  unresolvedProblems: string[];
  evidenceCommunicationAssessment: string;
  recommendedIntervention: string;
  materialImprovementAvailable: boolean;
  rationale: string;
}

export const NORTHSTAR_INDEPENDENT_CREATIVE_REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "interpretation",
    "strongestAspect",
    "unresolvedProblems",
    "evidenceCommunicationAssessment",
    "recommendedIntervention",
    "materialImprovementAvailable",
    "rationale",
  ],
  properties: {
    interpretation: { type: "string", minLength: 1, maxLength: 1800 },
    strongestAspect: { type: "string", minLength: 1, maxLength: 1200 },
    unresolvedProblems: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 600 },
    },
    evidenceCommunicationAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    recommendedIntervention: { type: "string", minLength: 1, maxLength: 1800 },
    materialImprovementAvailable: { type: "boolean" },
    rationale: { type: "string", minLength: 1, maxLength: 1800 },
  },
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function cleanTextList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map((item) => cleanText(item, maxLength)).filter(Boolean),
  )).slice(0, maxItems);
}

export function sanitizeNorthstarIndependentCreativeReview(
  value: NorthstarIndependentCreativeReviewDraft,
): NorthstarIndependentCreativeReview {
  const interpretation = cleanText(value.interpretation, 1800);
  const strongestAspect = cleanText(value.strongestAspect, 1200);
  const evidenceCommunicationAssessment = cleanText(value.evidenceCommunicationAssessment, 1600);
  const recommendedIntervention = cleanText(value.recommendedIntervention, 1800);
  const rationale = cleanText(value.rationale, 1800);
  if (!interpretation || !strongestAspect || !evidenceCommunicationAssessment || !recommendedIntervention || !rationale) {
    throw new Error("The independent creative review is incomplete.");
  }
  return {
    interpretation,
    strongestAspect,
    unresolvedProblems: cleanTextList(value.unresolvedProblems, 12, 600),
    evidenceCommunicationAssessment,
    recommendedIntervention,
    materialImprovementAvailable: value.materialImprovementAvailable === true,
    rationale,
  };
}

export function buildNorthstarIndependentCreativeReviewSystemInstruction(): string {
  return `
You are Northstar's independent creative reviewer. You did not author the current visual revision and you have no obligation to defend it.

Review the exact rendered artifact as a strategic communication object for the user's real problem and grounded evidence.
Do not choose from visual families, templates, archetypes, component recipes, scorecards, or preset aesthetics.
Do not redesign the document in this response. Do not provide HTML, CSS, mutations, or artboard dimensions.
Judge whether the artifact is genuinely authored, evidence-led, coherent, premium, and useful rather than merely operationally valid.
Call out cosmetic activity, gratuitous containers, weak hierarchy, disconnected proof, accidental composition, or a missed opportunity in open language when you actually see it.
A recommendation to continue must identify a material improvement in understanding, not a preference for endless polish.
Return only the required JSON object.
  `.trim();
}

export function buildNorthstarIndependentCreativeReviewContext(input: {
  userRequest: string;
  objective: string;
  authoredIntention: string;
  authoredVisibleChange: string;
  groundedResearch: unknown;
  operationalObservations: unknown;
  creativeJournal: unknown;
}): string {
  return JSON.stringify({
    mode: "isolated-independent-creative-review",
    userRequest: input.userRequest,
    objective: input.objective,
    authoredAct: {
      intention: input.authoredIntention,
      declaredVisibleChange: input.authoredVisibleChange,
    },
    groundedResearch: input.groundedResearch,
    operationalObservations: input.operationalObservations,
    creativeJournal: input.creativeJournal,
    instruction: [
      "Inspect the full artifact and every supplied detail view directly.",
      "State what the artifact currently communicates, what is genuinely strong, and what still prevents it from being an exceptional solution for this user.",
      "Do not infer a required layout or visual family from the references; they are an unlabeled quality bar only.",
    ].join(" "),
  });
}
