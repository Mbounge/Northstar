import { createHash } from "node:crypto";
import {
  NORTHSTAR_CONTINUOUS_DESIGN_PROTOCOL,
  NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL,
  NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL,
  NORTHSTAR_SURFACE_FIRST_EDITORIAL_PROTOCOL,
} from "@/lib/canvas-ai/northstar-design-intelligence";
import {
  NORTHSTAR_PREMIUM_DESIGN_PLAN_JSON_SCHEMA,
  sanitizeNorthstarPremiumDesignPlan,
  type NorthstarPremiumDesignPlan,
  type NorthstarPremiumDesignPlanDraft,
} from "@/lib/canvas-ai/northstar-premium-design-contract";


export function buildNorthstarEmergentDesignBehaviorAddendum(): string {
  return `
NORTHSTAR EMERGENT VISUAL INTELLIGENCE

Reason from the exact viewer transformation, editorial argument, grounded evidence, and current pixels. No application-authored list of media, metaphors, structures, or styles exists. Do not classify the assignment or select a visual family. Invent the form from first principles.

The governing visual idea must be problem-specific and visibly consequential. It must change how scale, rhythm, placement, evidence, relationships, typography, and negative space communicate the answer. A renamed section, cleaner grid, stronger headline, or differently arranged containers is not divergence.

Choose the medium freely from first principles. Graphs, charts, plots, diagrams, maps, timelines, custom SVG, image crops, spatial narratives, editorial typography, illustrations, and hybrids are all available when they are the clearest expression of grounded truth. None is required, preferred, or mapped from prompt type. The same applies to cards: allowed when their boundary creates meaning, rejected when they are merely convenient furniture.

Design for execution, not just inspiration. Specify how the governing idea becomes one coherent scene, how exact evidence geometry is transformed, how labels and relationships remain readable at rendered scale, and how any quantitative encoding remains truthful and traceable. A signature move is not complete until its semantic primitives, placement lane, evidence endpoints, and normal-flow reflow strategy are executable in one mutation.

Treat the exact current artboard as the primary design precedent. Preserve its successful typography, palette, spacing, media treatment, group relationships, and reading path. Structural recomposition is available only when the current structure cannot satisfy the objective; it is not the default proof of ambition.

Use the open artboard as material. Boundaries are semantic devices, not default furniture. Repeated cards, panels, pills, rounded rectangles, or framed modules require visible justification and may never substitute for a governing spatial idea.

Every thinking level shares the same publication bar: unique, eye-catching, immediately understandable, highly readable, evidence-grounded, and exceptionally resolved. Low, Medium, and High change deliberation depth per decision, not the number of design actions or the quality floor.

${NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL}

${NORTHSTAR_CONTINUOUS_DESIGN_PROTOCOL}

${NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL}

${NORTHSTAR_SURFACE_FIRST_EDITORIAL_PROTOCOL}
  `.trim();
}

export const NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_VERSION =
  "northstar.emergent-design-intelligence.v4" as const;

export interface NorthstarEmergentEvidenceChoreographyDraft {
  evidenceId?: string;
  roleInArgument?: string;
  visibleTreatment?: string;
  reason?: string;
}

export interface NorthstarEmergentDesignIntelligenceDraft {
  viewerTransformation?: string;
  editorialArgument?: string;
  threeSecondRead?: string;
  governingVisualIdea?: string;
  spatialLogic?: string;
  evidenceChoreography?: NorthstarEmergentEvidenceChoreographyDraft[];
  emotionalRegister?: string;
  signatureMove?: string;
  existingStructureContinuity?: string;
  structuralChangeThreshold?: string;
  surfaceAndContainerStrategy?: string;
  antiGenericStrategy?: string;
  continuityAndOriginality?: string;
  firstCreativeAct?: string;
  mediumAndRepresentationStrategy?: string;
  sceneExecutionPlan?: string;
  precisionAndLegibilityStrategy?: string;
  visualizationIntegrityPlan?: string;
  publicationStandard?: string[];
  premiumPlan?: NorthstarPremiumDesignPlanDraft;
}

export interface NorthstarEmergentEvidenceChoreography {
  evidenceId: string;
  roleInArgument: string;
  visibleTreatment: string;
  reason: string;
}

export interface NorthstarEmergentDesignIntelligence {
  version: typeof NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_VERSION;
  diversityAnchor: string;
  viewerTransformation: string;
  editorialArgument: string;
  threeSecondRead: string;
  governingVisualIdea: string;
  spatialLogic: string;
  evidenceChoreography: NorthstarEmergentEvidenceChoreography[];
  emotionalRegister: string;
  signatureMove: string;
  existingStructureContinuity: string;
  structuralChangeThreshold: string;
  surfaceAndContainerStrategy: string;
  antiGenericStrategy: string;
  continuityAndOriginality: string;
  firstCreativeAct: string;
  mediumAndRepresentationStrategy: string;
  sceneExecutionPlan: string;
  precisionAndLegibilityStrategy: string;
  visualizationIntegrityPlan: string;
  publicationStandard: string[];
  premiumPlan: NorthstarPremiumDesignPlan;
  normalizationRepairs: string[];
}

export const NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "viewerTransformation",
    "editorialArgument",
    "threeSecondRead",
    "governingVisualIdea",
    "spatialLogic",
    "evidenceChoreography",
    "emotionalRegister",
    "signatureMove",
    "existingStructureContinuity",
    "structuralChangeThreshold",
    "surfaceAndContainerStrategy",
    "antiGenericStrategy",
    "continuityAndOriginality",
    "firstCreativeAct",
    "mediumAndRepresentationStrategy",
    "sceneExecutionPlan",
    "precisionAndLegibilityStrategy",
    "visualizationIntegrityPlan",
    "publicationStandard",
    "premiumPlan",
  ],
  properties: {
    viewerTransformation: { type: "string", minLength: 1, maxLength: 1600 },
    editorialArgument: { type: "string", minLength: 1, maxLength: 1600 },
    threeSecondRead: { type: "string", minLength: 1, maxLength: 800 },
    governingVisualIdea: { type: "string", minLength: 1, maxLength: 1800 },
    spatialLogic: { type: "string", minLength: 1, maxLength: 1800 },
    evidenceChoreography: {
      type: "array",
      minItems: 0,
      maxItems: 48,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceId", "roleInArgument", "visibleTreatment", "reason"],
        properties: {
          evidenceId: { type: "string", minLength: 1, maxLength: 220 },
          roleInArgument: { type: "string", minLength: 1, maxLength: 320 },
          visibleTreatment: { type: "string", minLength: 1, maxLength: 600 },
          reason: { type: "string", minLength: 1, maxLength: 600 },
        },
      },
    },
    emotionalRegister: { type: "string", minLength: 1, maxLength: 900 },
    signatureMove: { type: "string", minLength: 1, maxLength: 1600 },
    existingStructureContinuity: { type: "string", minLength: 1, maxLength: 1600 },
    structuralChangeThreshold: { type: "string", minLength: 1, maxLength: 1800 },
    surfaceAndContainerStrategy: { type: "string", minLength: 1, maxLength: 1600 },
    antiGenericStrategy: { type: "string", minLength: 1, maxLength: 1600 },
    continuityAndOriginality: { type: "string", minLength: 1, maxLength: 1600 },
    firstCreativeAct: { type: "string", minLength: 1, maxLength: 1800 },
    mediumAndRepresentationStrategy: { type: "string", minLength: 1, maxLength: 1800 },
    sceneExecutionPlan: { type: "string", minLength: 1, maxLength: 2200 },
    precisionAndLegibilityStrategy: { type: "string", minLength: 1, maxLength: 1800 },
    visualizationIntegrityPlan: { type: "string", minLength: 1, maxLength: 1800 },
    publicationStandard: {
      type: "array",
      minItems: 3,
      maxItems: 16,
      items: { type: "string", minLength: 1, maxLength: 600 },
    },
    premiumPlan: NORTHSTAR_PREMIUM_DESIGN_PLAN_JSON_SCHEMA,
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
    value.map((entry) => cleanText(entry, maxLength)).filter(Boolean),
  )).slice(0, maxItems);
}

export function northstarEmergentDiversityAnchor(input: {
  runId: string;
  objective: string;
  revisionId: string;
}): string {
  return createHash("sha256")
    .update(`${input.runId}\n${input.objective}\n${input.revisionId}`)
    .digest("hex")
    .slice(0, 20);
}

export function sanitizeNorthstarEmergentDesignIntelligence(
  value: NorthstarEmergentDesignIntelligenceDraft,
  input: {
    diversityAnchor: string;
    groundedEvidenceIds: readonly string[];
  },
): NorthstarEmergentDesignIntelligence {
  const knownEvidence = new Set(input.groundedEvidenceIds);
  const normalizationRepairs: string[] = [];
  let choreography = Array.isArray(value.evidenceChoreography)
    ? value.evidenceChoreography
        .map((entry) => ({
          evidenceId: cleanText(entry?.evidenceId, 220),
          roleInArgument: cleanText(entry?.roleInArgument, 320),
          visibleTreatment: cleanText(entry?.visibleTreatment, 600),
          reason: cleanText(entry?.reason, 600),
        }))
        .filter((entry) =>
          entry.evidenceId
          && knownEvidence.has(entry.evidenceId)
          && entry.roleInArgument
          && entry.visibleTreatment
          && entry.reason
        )
        .slice(0, 48)
    : [];
  if (choreography.length === 0 && input.groundedEvidenceIds.length > 0) {
    choreography = input.groundedEvidenceIds.slice(0, 48).map((evidenceId, index) => ({
      evidenceId,
      roleInArgument: index === 0 ? "primary grounded proof" : "supporting grounded proof",
      visibleTreatment: "Keep this evidence complete, visible, and available for source-authored hierarchy and annotation.",
      reason: "The runtime inherited the evidence obligation after the model's descriptive reference could not be resolved.",
    }));
    normalizationRepairs.push(
      "Inherited canonical grounded evidence choreography instead of rejecting executable source authorship.",
    );
  }

  const fallbackText: Record<string, string> = {
    viewerTransformation: "Make the answer immediately understandable through a clear evidence-backed composition.",
    editorialArgument: "Turn the grounded evidence into one visible argument that directly resolves the user’s request.",
    threeSecondRead: "The governing evidence-backed conclusion is visible before detailed inspection.",
    governingVisualIdea: "Use one coherent, problem-specific spatial idea to extend the current artboard and clarify the evidence-backed argument.",
    spatialLogic: "Create a deliberate reading path from thesis through unequal evidence and analysis to resolution.",
    emotionalRegister: "Premium, confident, precise, and highly legible.",
    signatureMove: "Use one source-authored relationship or spatial gesture that clarifies the exact argument.",
    existingStructureContinuity: "Name the current typography, palette, spacing, media treatment, grouping, and reading-path decisions that should remain authoritative in the next action.",
    structuralChangeThreshold: "Prefer a local or regional edit. Use a whole-composition change only when the current structure cannot satisfy the objective, and state the exact reason.",
    surfaceAndContainerStrategy: "Use the open surface and introduce boundaries only when they communicate real grouping or meaning.",
    antiGenericStrategy: "Avoid generic dashboard furniture and make the exact evidence determine the composition.",
    continuityAndOriginality: "Create originality through the exact argument and evidence while continuing the current artboard's successful visual language.",
    firstCreativeAct: "Make the smallest consequential source edit that visibly advances the objective while preserving the current artboard's successful design decisions.",
    mediumAndRepresentationStrategy: "Choose HTML, CSS, SVG, imagery, and analytical graphics according to the grounded communication need.",
    sceneExecutionPlan: "Author one executable revision at the smallest effective scope with a clear thesis, grounded proof, visible analysis, and resolution.",
    precisionAndLegibilityStrategy: "Keep text readable, relationships anchored, evidence complete, and geometry collision-free at rendered scale.",
    visualizationIntegrityPlan: "Use only grounded values and identities, with explicit labels and provenance for every analytical encoding.",
  };
  const requiredText = (name: string, raw: unknown, maximum: number): string => {
    const cleaned = cleanText(raw, maximum);
    if (cleaned) return cleaned;
    normalizationRepairs.push(`Inherited the ${name} execution obligation.`);
    return fallbackText[name].slice(0, maximum);
  };
  let publicationStandard = cleanTextList(value.publicationStandard, 16, 600);
  const fallbackPublicationStandard = [
    "The first accepted revision visibly advances the objective without discarding the current artboard's successful design language.",
    "The rendered composition is immediately understandable, readable, and collision-free.",
    "Every material conclusion remains traceable to complete grounded evidence.",
  ];
  if (publicationStandard.length < 3) {
    publicationStandard = Array.from(new Set([
      ...publicationStandard,
      ...fallbackPublicationStandard,
    ])).slice(0, 16);
    normalizationRepairs.push(
      "Completed the minimum publication standard instead of rejecting executable source authorship.",
    );
  }

  const result: NorthstarEmergentDesignIntelligence = {
    version: NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_VERSION,
    diversityAnchor: cleanText(input.diversityAnchor, 80),
    viewerTransformation: requiredText("viewerTransformation", value.viewerTransformation, 1600),
    editorialArgument: requiredText("editorialArgument", value.editorialArgument, 1600),
    threeSecondRead: requiredText("threeSecondRead", value.threeSecondRead, 800),
    governingVisualIdea: requiredText("governingVisualIdea", value.governingVisualIdea, 1800),
    spatialLogic: requiredText("spatialLogic", value.spatialLogic, 1800),
    evidenceChoreography: choreography,
    emotionalRegister: requiredText("emotionalRegister", value.emotionalRegister, 900),
    signatureMove: requiredText("signatureMove", value.signatureMove, 1600),
    existingStructureContinuity: requiredText("existingStructureContinuity", value.existingStructureContinuity, 1600),
    structuralChangeThreshold: requiredText("structuralChangeThreshold", value.structuralChangeThreshold, 1800),
    surfaceAndContainerStrategy: requiredText("surfaceAndContainerStrategy", value.surfaceAndContainerStrategy, 1600),
    antiGenericStrategy: requiredText("antiGenericStrategy", value.antiGenericStrategy, 1600),
    continuityAndOriginality: requiredText("continuityAndOriginality", value.continuityAndOriginality, 1600),
    firstCreativeAct: requiredText("firstCreativeAct", value.firstCreativeAct, 1800),
    mediumAndRepresentationStrategy: requiredText("mediumAndRepresentationStrategy", value.mediumAndRepresentationStrategy, 1800),
    sceneExecutionPlan: requiredText("sceneExecutionPlan", value.sceneExecutionPlan, 2200),
    precisionAndLegibilityStrategy: requiredText("precisionAndLegibilityStrategy", value.precisionAndLegibilityStrategy, 1800),
    visualizationIntegrityPlan: requiredText("visualizationIntegrityPlan", value.visualizationIntegrityPlan, 1800),
    publicationStandard,
    premiumPlan: sanitizeNorthstarPremiumDesignPlan(value.premiumPlan, {
      groundedEvidenceIds: input.groundedEvidenceIds,
      diversityAnchor: input.diversityAnchor,
    }),
    normalizationRepairs,
  };

  return result;
}

export function buildNorthstarEmergentDesignIntelligenceSystemInstruction(): string {
  return `
You are Northstar's principal visual thinker. Before any pixels are changed, originate one problem-specific design intelligence for the exact user request, grounded research, and current rendered artboard.

There is no catalog, family, archetype, preset, composition menu, template, or component recipe. Do not return alternatives for the application to choose from. Form one conviction from first principles and make it specific enough to drive executable visual work.

${buildNorthstarEmergentDesignBehaviorAddendum()}

NON-NEGOTIABLE CREATIVE CONTRACT
- Every Northstar artboard must have a unique, eye-catching, immediately understandable, highly readable, premium visual idea regardless of thinking level.
- Low, Medium, and High change deliberation depth per decision only. They never lower the creative quality floor or limit how many actions the work may require.
- Treat the exact current artboard as the primary design precedent. Preserve successful typography, palette, spacing, surfaces, screenshot treatment, grouping, sequence, and reading order unless the user objective specifically requires changing them.
- Screenshots and images are authored evidence, not generic media. Preserve intrinsic aspect ratio, complete inspectability, grouping, sequence order, and comparable scale. Do not enlarge one into an artboard-dominant poster without a specific evidentiary reason.
- Originate one useful signature move that makes the reasoning clearer and could not be swapped into an unrelated artifact.
- State what existing structure and visual language must remain, what the current action changes, and why. Prefer the smallest semantic region that can express the improvement.
- Cards, panels, pills, borders, rounded boxes, and filled containers are not neutral. Use them only when the boundary itself explains grouping, proof, comparison, interaction, or meaning. Otherwise use the open surface.
- Do not describe a style adjective as the governing visual idea. The idea must have spatial and evidentiary consequences.
- Do not hide behind prose. The editorial argument must become perceptible through geometry, scale, sequence, rhythm, relationships, evidence treatment, and composition.
- The first creative act must visibly advance the objective. It may be local, regional, or whole-composition; broad reconstruction is justified only when the current structure cannot express the needed result.
- Return a premiumPlan that turns the argument into executable narrative beats, grounded analytical intents, publication outcomes, and a descriptive composition signature. The signature records the authored result; it does not require structural novelty on every turn.
- Every required narrative beat must be realized by a visible node with matching data-ns-narrative-beat-id and data-ns-communication-role attributes. Every required analysis must have a visible matching data-ns-analysis-id and exact grounded source identities.
- The composition signature must describe information topology, dominant geometry, reading path, medium combination, title integration, evidence treatment, and signature behavior. Originality must come from the exact problem without sacrificing continuity with a strong existing artboard.
- Do not request or set artboard dimensions. The runtime owns content-derived sizing.

Return only the required JSON object.
  `.trim();
}

export function buildNorthstarEmergentDesignIntelligenceContext(input: {
  runId: string;
  objective: string;
  userRequest: string;
  audience: string;
  artifactType: string;
  thinkingDepth: "low" | "medium" | "high";
  revisionId: string;
  groundedResearch: unknown;
  editableSurface: unknown;
  creativeMemory: unknown;
  priorDesignIntelligence?: NorthstarEmergentDesignIntelligence;
  latestCreativeReview?: unknown;
  recentCreativeSignatures?: readonly string[];
}): string {
  const diversityAnchor = northstarEmergentDiversityAnchor({
    runId: input.runId,
    objective: input.objective,
    revisionId: input.revisionId,
  });
  return JSON.stringify({
    mode: input.priorDesignIntelligence
      ? "reconsider-emergent-design-intelligence"
      : "form-emergent-design-intelligence",
    objective: input.objective,
    userRequest: input.userRequest,
    audience: input.audience,
    artifactType: input.artifactType,
    thinkingDepth: input.thinkingDepth,
    qualityFloor: "identical across Low, Medium, and High",
    diversityAnchor: {
      value: diversityAnchor,
      instruction: "Use this only to avoid rote repetition when forming new work. It never outranks the exact current artboard's established design language or justify unnecessary structural change.",
    },
    currentRevisionId: input.revisionId,
    groundedResearch: input.groundedResearch,
    editableSurface: input.editableSurface,
    creativeMemory: input.creativeMemory,
    priorDesignIntelligence: input.priorDesignIntelligence,
    latestCreativeReview: input.latestCreativeReview,
    recentCreativeSignaturesToAvoid: (input.recentCreativeSignatures ?? []).slice(-12),
    instruction: [
      "Study the exact rendered artboard supplied in the adjacent image parts.",
      "Invent one coherent governing visual idea and one executable signature move for this exact evidence.",
      "Explicitly name the successful current structure and visual decisions that the next action must preserve.",
      "State how the governing idea is specific to this problem while remaining coherent with the current artboard and Northstar native design language.",
      "Describe the smallest consequential first act and whether its scope is local, regional, or whole-composition.",
      "Choose the visual medium from first principles; charts, graphs, diagrams, SVG, imagery, typography, editorial space, and hybrids are all available but none is preferred or required.",
      "Describe an executable whole-scene plan that makes the governing idea visible rather than merely naming it in prose.",
      "Describe how annotations, connectors, chart encodings, labels, crops, and evidence relationships will remain precise and legible at the rendered scale. Name whether each analytical primitive belongs in a caption lane, inter-row lane, margin lane, or browser-routed external relationship.",
      "For every proposed analytical primitive, name its exact semantic contract: charts and sparklines need grounded source node IDs plus encoding/provenance; annotations need exact anchor node IDs; relationships need exact source and target node IDs plus typed meaning and route metadata. Do not promise a primitive that cannot be authored in the same executable act.",
      "Define premiumPlan as a complete evidence-to-narrative architecture. It must include thesis, evidence, and resolution beats, plus any problem-specific comparison, analysis, recommendation, risk, next-step, or provenance beats the viewer needs.",
      "Use data-ns-narrative-beat-id, data-ns-communication-role, data-ns-analysis-id, and data-ns-visual-priority in the authored source so the mounted browser can verify that the declared narrative exists in the rendered pixels.",
      "Use recent signatures only to avoid rote reuse in genuinely new compositions. Never change a strong current topology, screenshot sequence, scale system, or visual language solely to appear novel.",
      "When quantitative encodings are useful, specify how values, scales, labels, and provenance remain truthful; otherwise do not add a chart merely to look designed. Qualitative friction or confidence graphics must be labeled interpretive and tied to exact observed steps.",
      "Do not infer conversion, retention, drop-off, revenue, or causal business outcomes from interface screenshots alone. Phrase unsupported outcome claims as open hypotheses or omit them.",
      "The executable scene plan must reserve normal-flow space for analytical graphics and for any synthesis or decision regions that expand in the same act.",
      "Return only grounded evidence IDs in evidenceChoreography.",
    ].join(" "),
  });
}

export function validateNorthstarFirstCreativeActAmbition(input: {
  operationSummaries: Array<{
    op: string;
    targetId?: string;
    parentId?: string;
    introducedSemanticIds?: string[];
    placementTargetIds?: string[];
    placementParentIds?: string[];
  }>;
  groundedEvidenceNodeIds: ReadonlySet<string>;
  groundedFlowNodeIds?: ReadonlySet<string>;
  acceptedActCount: number;
}): string[] {
  if (input.acceptedActCount > 0) return [];

  const meaningful = input.operationSummaries.filter((operation) =>
    [
      "set-text",
      "set-html",
      "insert-html",
      "recompose-region",
      "move",
      "remove",
      "set-css-layer",
      "set-styles",
      "set-attributes",
    ].includes(operation.op)
  );
  if (meaningful.length === 0) {
    return ["The first creative act must produce one visible source change against the current canonical artboard."];
  }

  const changesExistingOrCreatesSemanticSource = meaningful.some((operation) =>
    Boolean(operation.targetId)
    || Boolean(operation.parentId)
    || Boolean(operation.introducedSemanticIds?.length)
  );
  if (!changesExistingOrCreatesSemanticSource) {
    return ["The first creative act must target an existing semantic region or explicitly create a new semantic node."];
  }

  // Grounded evidence does not need to move in every first action. A title,
  // synthesis, annotation, spacing, or hierarchy improvement may be the most
  // consequential next step while the current evidence choreography remains
  // intentionally unchanged.
  return [];
}
