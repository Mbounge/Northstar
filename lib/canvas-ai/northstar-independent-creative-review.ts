export const NORTHSTAR_INDEPENDENT_CREATIVE_REVIEW_VERSION =
  "northstar.independent-creative-review.v2" as const;

export interface NorthstarIndependentQualityScores {
  informationHierarchy: number;
  evidenceLegibility: number;
  analyticalDepth: number;
  structuralOriginality: number;
  compositionCoherence: number;
  craftPrecision: number;
  decisionUsefulness: number;
}

export interface NorthstarIndependentCreativeReviewDraft {
  interpretation?: string;
  strongestAspect?: string;
  unresolvedProblems?: string[];
  evidenceCommunicationAssessment?: string;
  recommendedIntervention?: string;
  materialImprovementAvailable?: boolean;
  publicationReady?: boolean;
  governingVisualIdeaAssessment?: string;
  evidenceTransformationAssessment?: string;
  containerAndSurfaceAssessment?: string;
  originalityAssessment?: string;
  mediumFitnessAssessment?: string;
  precisionAndLegibilityAssessment?: string;
  governingIdeaFidelityAssessment?: string;
  memorableAuthorshipAssessment?: string;
  universalQualityBarMet?: boolean;
  qualityScores?: Partial<NorthstarIndependentQualityScores>;
  structuralBlockers?: string[];
  rationale?: string;
}

export interface NorthstarIndependentCreativeReview {
  interpretation: string;
  strongestAspect: string;
  unresolvedProblems: string[];
  evidenceCommunicationAssessment: string;
  recommendedIntervention: string;
  materialImprovementAvailable: boolean;
  publicationReady: boolean;
  governingVisualIdeaAssessment: string;
  evidenceTransformationAssessment: string;
  containerAndSurfaceAssessment: string;
  originalityAssessment: string;
  mediumFitnessAssessment?: string;
  precisionAndLegibilityAssessment?: string;
  governingIdeaFidelityAssessment?: string;
  memorableAuthorshipAssessment?: string;
  universalQualityBarMet?: boolean;
  qualityScores?: NorthstarIndependentQualityScores;
  minimumQualityScore?: number;
  structuralBlockers: string[];
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
    "publicationReady",
    "governingVisualIdeaAssessment",
    "evidenceTransformationAssessment",
    "containerAndSurfaceAssessment",
    "originalityAssessment",
    "mediumFitnessAssessment",
    "precisionAndLegibilityAssessment",
    "governingIdeaFidelityAssessment",
    "memorableAuthorshipAssessment",
    "universalQualityBarMet",
    "qualityScores",
    "structuralBlockers",
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
    publicationReady: { type: "boolean" },
    governingVisualIdeaAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    evidenceTransformationAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    containerAndSurfaceAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    originalityAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    mediumFitnessAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    precisionAndLegibilityAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    governingIdeaFidelityAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    memorableAuthorshipAssessment: { type: "string", minLength: 1, maxLength: 1600 },
    universalQualityBarMet: { type: "boolean" },
    qualityScores: {
      type: "object",
      additionalProperties: false,
      required: [
        "informationHierarchy",
        "evidenceLegibility",
        "analyticalDepth",
        "structuralOriginality",
        "compositionCoherence",
        "craftPrecision",
        "decisionUsefulness",
      ],
      properties: {
        informationHierarchy: { type: "number", minimum: 0, maximum: 100 },
        evidenceLegibility: { type: "number", minimum: 0, maximum: 100 },
        analyticalDepth: { type: "number", minimum: 0, maximum: 100 },
        structuralOriginality: { type: "number", minimum: 0, maximum: 100 },
        compositionCoherence: { type: "number", minimum: 0, maximum: 100 },
        craftPrecision: { type: "number", minimum: 0, maximum: 100 },
        decisionUsefulness: { type: "number", minimum: 0, maximum: 100 },
      },
    },
    structuralBlockers: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 700 },
    },
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

function qualityScore(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

export function sanitizeNorthstarIndependentCreativeReview(
  value: NorthstarIndependentCreativeReviewDraft,
): NorthstarIndependentCreativeReview {
  const interpretation = cleanText(value.interpretation, 1800);
  const strongestAspect = cleanText(value.strongestAspect, 1200);
  const evidenceCommunicationAssessment = cleanText(value.evidenceCommunicationAssessment, 1600);
  const recommendedIntervention = cleanText(value.recommendedIntervention, 1800);
  const governingVisualIdeaAssessment = cleanText(value.governingVisualIdeaAssessment, 1600);
  const evidenceTransformationAssessment = cleanText(value.evidenceTransformationAssessment, 1600);
  const containerAndSurfaceAssessment = cleanText(value.containerAndSurfaceAssessment, 1600);
  const originalityAssessment = cleanText(value.originalityAssessment, 1600);
  const mediumFitnessAssessment = cleanText(value.mediumFitnessAssessment, 1600);
  const precisionAndLegibilityAssessment = cleanText(value.precisionAndLegibilityAssessment, 1600);
  const governingIdeaFidelityAssessment = cleanText(value.governingIdeaFidelityAssessment, 1600);
  const memorableAuthorshipAssessment = cleanText(value.memorableAuthorshipAssessment, 1600);
  const rationale = cleanText(value.rationale, 1800);
  if (!interpretation || !strongestAspect || !evidenceCommunicationAssessment || !recommendedIntervention || !governingVisualIdeaAssessment || !evidenceTransformationAssessment || !containerAndSurfaceAssessment || !originalityAssessment || !mediumFitnessAssessment || !precisionAndLegibilityAssessment || !governingIdeaFidelityAssessment || !memorableAuthorshipAssessment || !rationale) {
    throw new Error("The independent creative review is incomplete.");
  }
  const qualityScores: NorthstarIndependentQualityScores = {
    informationHierarchy: qualityScore(value.qualityScores?.informationHierarchy),
    evidenceLegibility: qualityScore(value.qualityScores?.evidenceLegibility),
    analyticalDepth: qualityScore(value.qualityScores?.analyticalDepth),
    structuralOriginality: qualityScore(value.qualityScores?.structuralOriginality),
    compositionCoherence: qualityScore(value.qualityScores?.compositionCoherence),
    craftPrecision: qualityScore(value.qualityScores?.craftPrecision),
    decisionUsefulness: qualityScore(value.qualityScores?.decisionUsefulness),
  };
  const minimumQualityScore = Math.min(...Object.values(qualityScores));
  const structuralBlockers = cleanTextList(value.structuralBlockers, 12, 700);
  const scoreFloorMet = qualityScores.informationHierarchy >= 78
    && qualityScores.evidenceLegibility >= 82
    && qualityScores.analyticalDepth >= 75
    && qualityScores.structuralOriginality >= 75
    && qualityScores.compositionCoherence >= 82
    && qualityScores.craftPrecision >= 80
    && qualityScores.decisionUsefulness >= 75;
  const universalQualityBarMet = value.universalQualityBarMet === true
    && scoreFloorMet
    && structuralBlockers.length === 0;
  return {
    interpretation,
    strongestAspect,
    unresolvedProblems: cleanTextList(value.unresolvedProblems, 12, 600),
    evidenceCommunicationAssessment,
    recommendedIntervention,
    materialImprovementAvailable: value.materialImprovementAvailable === true,
    publicationReady: value.publicationReady === true && universalQualityBarMet,
    governingVisualIdeaAssessment,
    evidenceTransformationAssessment,
    containerAndSurfaceAssessment,
    originalityAssessment,
    mediumFitnessAssessment,
    precisionAndLegibilityAssessment,
    governingIdeaFidelityAssessment,
    memorableAuthorshipAssessment,
    universalQualityBarMet,
    qualityScores,
    minimumQualityScore,
    structuralBlockers,
    rationale,
  };
}

export function buildNorthstarIndependentCreativeReviewSystemInstruction(): string {
  return `
You are Northstar's independent creative reviewer. You did not author the current visual revision and you have no obligation to defend it.

Review the exact rendered artifact as a strategic communication object for the user's real problem and grounded evidence.
Do not choose from visual families, templates, archetypes, component recipes, scorecards, or preset aesthetics.
Do not redesign the document in this response. Do not provide HTML, CSS, mutations, or artboard dimensions.
Judge whether the artifact is genuinely authored, evidence-led, coherent, premium, unique, and useful rather than merely operationally valid.
The same publication-quality floor applies to Low, Medium, and High. Thinking depth changes persistence, never permission to publish generic design.
Call out cosmetic activity, gratuitous containers, weak hierarchy, disconnected proof, accidental composition, or a missed opportunity in open language when you actually see it.
Mentally remove card chrome, rounded boxes, labels, and explanatory paragraphs. Decide whether a governing visual idea still remains in geometry, scale, rhythm, evidence treatment, and relationships.
A screenshot wall with a title, a thesis inside a box, a row of modules, or a cleaner dashboard is not publication-ready unless the composition transforms the evidence into an unmistakable visual argument.
Cards and containers are allowed only when their boundaries create meaning. If the artifact depends on repeated rectangles because no stronger spatial idea exists, mark publicationReady=false and name that as a structural blocker.
Treat every visual medium neutrally. Charts, graphs, plots, diagrams, maps, SVG, image-led scenes, editorial compositions, cards, and hybrids are all valid only when they are the best truthful expression for this problem. Never require or forbid one because of prompt type.
Audit execution fidelity: the rendered scene must visibly realize the authored governing idea, not merely mention it in prose. Audit precision at actual rendered scale: labels, annotations, connectors, chart encodings, crops, and evidence relationships must be legible, exact, and collision-free.
Never recommend invented metrics, conversion rates, retention effects, drop-off values, or causal business outcomes when the grounded research does not contain them. Recommend qualitative encodings, observed-step annotations, or explicitly labeled hypotheses instead.
Set universalQualityBarMet=true only when the artifact is distinctive, memorable, premium, immediately understandable, evidence-grounded, and specifically authored for this problem. Set publicationReady=true only when universalQualityBarMet is true, the governing idea is visible, the chosen medium is fit, evidence is transformed, precision is strong, and no structural blocker remains.
Score qualityScores from the rendered pixels, not from the author's claims. Use 0–100 independently for information hierarchy, evidence legibility, analytical depth, structural originality, composition coherence, craft precision, and decision usefulness. These scores are not a style rubric: they are the universal publication floor, identical at every thinking level. Be exacting; 80 means genuinely publication-grade, not merely acceptable.
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
  designIntelligence?: unknown;
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
    emergentDesignIntelligence: input.designIntelligence,
    instruction: [
      "Inspect the full artifact and every supplied detail view directly.",
      "State what the artifact currently communicates, what is genuinely strong, and what still prevents it from being an exceptional solution for this user.",
      "Audit whether the artifact has a visible governing idea, whether evidence was transformed rather than dumped, whether containers genuinely earn their boundaries, whether the chosen medium is the best truthful medium, whether the governing idea survived execution, and whether labels, annotations, connectors, charts, crops, and relationships are precise and legible at rendered scale.",
      "Use structuralBlockers for failures that must prevent publication at every thinking level; use materialImprovementAvailable for worthwhile but non-blocking improvements.",
      "Keep every recommended intervention evidence-grounded. Do not ask the author to populate charts with conversion, retention, drop-off, or other quantitative outcomes unless those values are present in groundedResearch.",
      "Do not infer a required layout or visual family from the references; they are an unlabeled quality bar only.",
    ].join(" "),
  });
}
