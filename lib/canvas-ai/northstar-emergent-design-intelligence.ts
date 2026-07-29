import { createHash } from "node:crypto";
import {
  NORTHSTAR_CONTINUOUS_DESIGN_PROTOCOL,
  NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL,
  NORTHSTAR_SURFACE_FIRST_EDITORIAL_PROTOCOL,
} from "@/lib/canvas-ai/northstar-design-intelligence";


export function buildNorthstarEmergentDesignBehaviorAddendum(): string {
  return `
NORTHSTAR EMERGENT VISUAL INTELLIGENCE

Reason from the exact viewer transformation, editorial argument, grounded evidence, and current pixels. No application-authored list of media, metaphors, structures, or styles exists. Do not classify the assignment or select a visual family. Invent the form from first principles.

The governing visual idea must be problem-specific and visibly consequential. It must change how scale, rhythm, placement, evidence, relationships, typography, and negative space communicate the answer. A renamed section, cleaner grid, stronger headline, or differently arranged containers is not divergence.

Choose the medium freely from first principles. Graphs, charts, plots, diagrams, maps, timelines, custom SVG, image crops, spatial narratives, editorial typography, illustrations, and hybrids are all available when they are the clearest expression of grounded truth. None is required, preferred, or mapped from prompt type. The same applies to cards: allowed when their boundary creates meaning, rejected when they are merely convenient furniture.

Design for execution, not just inspiration. Specify how the governing idea becomes one coherent scene, how exact evidence geometry is transformed, how labels and relationships remain readable at rendered scale, and how any quantitative encoding remains truthful and traceable. A signature move is not complete until its semantic primitives, placement lane, evidence endpoints, and normal-flow reflow strategy are executable in one mutation.

Treat destructive recomposition as a legitimate design capability. The inherited presentation can be dismantled, replaced, or radically reorganized when that creates a clearer and more memorable result. Preserve only the permanent root, grounded truth, evidence identity, provenance, safe execution, and browser-verified lineage.

Use the open artboard as material. Boundaries are semantic devices, not default furniture. Repeated cards, panels, pills, rounded rectangles, or framed modules require visible justification and may never substitute for a governing spatial idea.

Every thinking level shares the same publication bar: unique, eye-catching, immediately understandable, highly readable, evidence-grounded, and exceptionally resolved. Low reduces exploration and revision count only.

${NORTHSTAR_CONTINUOUS_DESIGN_PROTOCOL}

${NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL}

${NORTHSTAR_SURFACE_FIRST_EDITORIAL_PROTOCOL}
  `.trim();
}

export const NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_VERSION =
  "northstar.emergent-design-intelligence.v2" as const;

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
  existingStructureVerdict?: string;
  destructiveRecompositionIntent?: string;
  surfaceAndContainerStrategy?: string;
  antiGenericStrategy?: string;
  divergenceFromRecentWork?: string;
  firstCreativeAct?: string;
  mediumAndRepresentationStrategy?: string;
  sceneExecutionPlan?: string;
  precisionAndLegibilityStrategy?: string;
  visualizationIntegrityPlan?: string;
  publicationStandard?: string[];
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
  existingStructureVerdict: string;
  destructiveRecompositionIntent: string;
  surfaceAndContainerStrategy: string;
  antiGenericStrategy: string;
  divergenceFromRecentWork: string;
  firstCreativeAct: string;
  mediumAndRepresentationStrategy: string;
  sceneExecutionPlan: string;
  precisionAndLegibilityStrategy: string;
  visualizationIntegrityPlan: string;
  publicationStandard: string[];
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
    "existingStructureVerdict",
    "destructiveRecompositionIntent",
    "surfaceAndContainerStrategy",
    "antiGenericStrategy",
    "divergenceFromRecentWork",
    "firstCreativeAct",
    "mediumAndRepresentationStrategy",
    "sceneExecutionPlan",
    "precisionAndLegibilityStrategy",
    "visualizationIntegrityPlan",
    "publicationStandard",
  ],
  properties: {
    viewerTransformation: { type: "string", minLength: 1, maxLength: 1600 },
    editorialArgument: { type: "string", minLength: 1, maxLength: 1600 },
    threeSecondRead: { type: "string", minLength: 1, maxLength: 800 },
    governingVisualIdea: { type: "string", minLength: 1, maxLength: 1800 },
    spatialLogic: { type: "string", minLength: 1, maxLength: 1800 },
    evidenceChoreography: {
      type: "array",
      minItems: 1,
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
    existingStructureVerdict: { type: "string", minLength: 1, maxLength: 1600 },
    destructiveRecompositionIntent: { type: "string", minLength: 1, maxLength: 1800 },
    surfaceAndContainerStrategy: { type: "string", minLength: 1, maxLength: 1600 },
    antiGenericStrategy: { type: "string", minLength: 1, maxLength: 1600 },
    divergenceFromRecentWork: { type: "string", minLength: 1, maxLength: 1600 },
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
  const choreography = Array.isArray(value.evidenceChoreography)
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

  const result: NorthstarEmergentDesignIntelligence = {
    version: NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_VERSION,
    diversityAnchor: cleanText(input.diversityAnchor, 80),
    viewerTransformation: cleanText(value.viewerTransformation, 1600),
    editorialArgument: cleanText(value.editorialArgument, 1600),
    threeSecondRead: cleanText(value.threeSecondRead, 800),
    governingVisualIdea: cleanText(value.governingVisualIdea, 1800),
    spatialLogic: cleanText(value.spatialLogic, 1800),
    evidenceChoreography: choreography,
    emotionalRegister: cleanText(value.emotionalRegister, 900),
    signatureMove: cleanText(value.signatureMove, 1600),
    existingStructureVerdict: cleanText(value.existingStructureVerdict, 1600),
    destructiveRecompositionIntent: cleanText(value.destructiveRecompositionIntent, 1800),
    surfaceAndContainerStrategy: cleanText(value.surfaceAndContainerStrategy, 1600),
    antiGenericStrategy: cleanText(value.antiGenericStrategy, 1600),
    divergenceFromRecentWork: cleanText(value.divergenceFromRecentWork, 1600),
    firstCreativeAct: cleanText(value.firstCreativeAct, 1800),
    mediumAndRepresentationStrategy: cleanText(value.mediumAndRepresentationStrategy, 1800),
    sceneExecutionPlan: cleanText(value.sceneExecutionPlan, 2200),
    precisionAndLegibilityStrategy: cleanText(value.precisionAndLegibilityStrategy, 1800),
    visualizationIntegrityPlan: cleanText(value.visualizationIntegrityPlan, 1800),
    publicationStandard: cleanTextList(value.publicationStandard, 16, 600),
  };

  const requiredText: Array<[string, string]> = [
    ["viewerTransformation", result.viewerTransformation],
    ["editorialArgument", result.editorialArgument],
    ["threeSecondRead", result.threeSecondRead],
    ["governingVisualIdea", result.governingVisualIdea],
    ["spatialLogic", result.spatialLogic],
    ["emotionalRegister", result.emotionalRegister],
    ["signatureMove", result.signatureMove],
    ["existingStructureVerdict", result.existingStructureVerdict],
    ["destructiveRecompositionIntent", result.destructiveRecompositionIntent],
    ["surfaceAndContainerStrategy", result.surfaceAndContainerStrategy],
    ["antiGenericStrategy", result.antiGenericStrategy],
    ["divergenceFromRecentWork", result.divergenceFromRecentWork],
    ["firstCreativeAct", result.firstCreativeAct],
    ["mediumAndRepresentationStrategy", result.mediumAndRepresentationStrategy],
    ["sceneExecutionPlan", result.sceneExecutionPlan],
    ["precisionAndLegibilityStrategy", result.precisionAndLegibilityStrategy],
    ["visualizationIntegrityPlan", result.visualizationIntegrityPlan],
  ];
  const missing = requiredText.filter(([, text]) => !text).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`The emergent design intelligence is incomplete: ${missing.join(", ")}.`);
  }
  if (result.evidenceChoreography.length === 0 && input.groundedEvidenceIds.length > 0) {
    throw new Error("The emergent design intelligence did not choreograph any real grounded evidence.");
  }
  if (result.publicationStandard.length < 3) {
    throw new Error("The emergent design intelligence must define a meaningful publication standard.");
  }
  return result;
}

export function buildNorthstarEmergentDesignIntelligenceSystemInstruction(): string {
  return `
You are Northstar's principal visual thinker. Before any pixels are changed, originate one problem-specific design intelligence for the exact user request, grounded research, and current rendered artboard.

There is no catalog, family, archetype, preset, composition menu, template, or component recipe. Do not return alternatives for the application to choose from. Form one conviction from first principles and make it specific enough to drive executable visual work.

${buildNorthstarEmergentDesignBehaviorAddendum()}

NON-NEGOTIABLE CREATIVE CONTRACT
- Every Northstar artboard must have a unique, eye-catching, immediately understandable, highly readable, premium visual idea regardless of thinking level.
- Low, Medium, and High change exploration time and persistence only. They never lower the creative quality floor.
- Treat the current layout as disposable source material. Preserve truth, evidence identity, provenance, and the permanent root—not the inherited arrangement, module structure, card language, screenshot rows, title placement, or analytical furniture.
- The evidence reservoir is source material. Decide what leads, what becomes a turning point, what supports, what becomes provenance, and what should disappear from the primary narrative while remaining inspectable.
- Originate one useful signature move that makes the reasoning clearer and could not be swapped into an unrelated artifact.
- State what existing structure should survive, what should be destroyed, and why. Conservative editing is not automatically safer or better.
- Cards, panels, pills, borders, rounded boxes, and filled containers are not neutral. Use them only when the boundary itself explains grouping, proof, comparison, interaction, or meaning. Otherwise use the open surface.
- Do not describe a style adjective as the governing visual idea. The idea must have spatial and evidentiary consequences.
- Do not hide behind prose. The editorial argument must become perceptible through geometry, scale, sequence, rhythm, relationships, evidence treatment, and composition.
- The first creative act must materially recompose the presentation and evidence choreography rather than add another explanatory box to the inherited board.
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
      instruction: "Use this only as a novelty pressure so repeated runs do not collapse to the same composition. It does not encode a style, layout, medium, or metaphor.",
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
      "Explicitly decide what inherited structure should be destroyed instead of merely tidied.",
      "State how this governing idea and signature move materially diverge from recent Northstar work without choosing from a style list.",
      "Describe how the first creative act will transform both the presentation layer and the evidence choreography.",
      "Choose the visual medium from first principles; charts, graphs, diagrams, SVG, imagery, typography, editorial space, and hybrids are all available but none is preferred or required.",
      "Describe an executable whole-scene plan that makes the governing idea visible rather than merely naming it in prose.",
      "Describe how annotations, connectors, chart encodings, labels, crops, and evidence relationships will remain precise and legible at the rendered scale. Name whether each analytical primitive belongs in a caption lane, inter-row lane, margin lane, or browser-routed external relationship.",
      "For every proposed analytical primitive, name its exact semantic contract: charts and sparklines need grounded source node IDs plus encoding/provenance; annotations need exact anchor node IDs; relationships need exact source and target node IDs plus typed meaning and route metadata. Do not promise a primitive that cannot be authored in the same executable act.",
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

  const structural = input.operationSummaries.filter((operation) =>
    ["set-html", "insert-html", "move", "remove", "set-css-layer"].includes(operation.op)
  );
  const presentationRecomposed = structural.some((operation) =>
    operation.targetId === "presentation"
    || operation.parentId === "presentation"
    || operation.introducedSemanticIds?.includes("presentation")
  );
  const introducedSceneIds = new Set(structural.flatMap((operation) => operation.introducedSemanticIds ?? []));
  const evidenceChoreographed = input.operationSummaries.some((operation) => {
    const groundedTarget = Boolean(operation.targetId) && (
      input.groundedEvidenceNodeIds.has(operation.targetId!)
      || input.groundedFlowNodeIds?.has(operation.targetId!)
    );
    const groundedPlacementTarget = (operation.placementTargetIds ?? []).some((nodeId) =>
      input.groundedEvidenceNodeIds.has(nodeId) || input.groundedFlowNodeIds?.has(nodeId),
    );
    const placementIntoNewScene = groundedPlacementTarget && (operation.placementParentIds ?? []).some((parentId) =>
      introducedSceneIds.has(parentId) || parentId === "presentation",
    );
    const movesGroundedMaterialIntoNewScene = operation.op === "move"
      && groundedTarget
      && Boolean(operation.parentId)
      && (introducedSceneIds.has(operation.parentId!) || operation.parentId === "presentation");
    return groundedTarget
      || placementIntoNewScene
      || movesGroundedMaterialIntoNewScene
      || operation.targetId === "evidence"
      || operation.targetId === "evidence-reservoir"
      || operation.parentId === "presentation";
  });
  const touchedNodeIds = new Set(
    input.operationSummaries.flatMap((operation) => [
      operation.targetId,
      operation.parentId,
      ...(operation.introducedSemanticIds ?? []),
      ...(operation.placementTargetIds ?? []),
      ...(operation.placementParentIds ?? []),
    ].filter((value): value is string => Boolean(value))),
  );

  const issues: string[] = [];
  if (!presentationRecomposed && structural.length < 4) {
    issues.push("The first creative act must materially recompose the presentation, not merely edit copy or add one boxed analytical region.");
  }
  if (!evidenceChoreographed) {
    issues.push("The first creative act must visibly transform the choreography of real grounded evidence, not leave the screenshot inventory as the governing composition.");
  }
  // Permanent synthesis and decision anchors are compiler-owned structural
  // invariants. A strong evidence-recomposition act must not consume the
  // creative rejection budget because one empty anchor was omitted from the
  // model fragment; the mutation repair pass restores those anchors before
  // compilation and browser dispatch.
  if (touchedNodeIds.size < 4) {
    issues.push("The first creative act is too local to establish a unique governing visual idea.");
  }
  return issues;
}
