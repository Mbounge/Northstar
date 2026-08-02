import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_JSON_SCHEMA,
  buildNorthstarEmergentDesignIntelligenceSystemInstruction,
  northstarEmergentDiversityAnchor,
  sanitizeNorthstarEmergentDesignIntelligence,
  validateNorthstarFirstCreativeActAmbition,
} from "@/lib/canvas-ai/northstar-emergent-design-intelligence";

function designDraft() {
  return {
    viewerTransformation: "The viewer understands the trust-versus-velocity trade-off before reading detail.",
    editorialArgument: "Awin filters for high-intent trust while Whop removes friction to accelerate activation.",
    threeSecondRead: "Trust is earned slowly; velocity converts quickly.",
    governingVisualIdea: "Turn the two journeys into opposing forces that bend the evidence field around their different activation logics.",
    spatialLogic: "One decisive tension line carries the argument; evidence clusters attach to the moments that create or remove friction.",
    evidenceChoreography: [
      {
        evidenceId: "awin-1",
        roleInArgument: "turning point",
        visibleTreatment: "Enlarge the verification moment and connect it directly to the trust claim.",
        reason: "It makes Awin's qualification burden visible.",
      },
      {
        evidenceId: "whop-1",
        roleInArgument: "counterpoint",
        visibleTreatment: "Place the rapid account-creation moment across the tension line at matching visual force.",
        reason: "It makes Whop's speed advantage concrete.",
      },
    ],
    emotionalRegister: "Confident, editorial, slightly provocative, and calm enough for executive reading.",
    signatureMove: "A single continuous tension path changes thickness as the journeys exchange trust for speed.",
    existingStructureContinuity: "Preserve the editorial typography, restrained palette, controlled screenshot scale, Awin/Whop grouping, authoritative sequence order, and horizontal evidence choreography.",
    structuralChangeThreshold: "Use a regional change around the thesis and decisive proof. A whole-composition rewrite is unnecessary because the current lanes already express the comparison.",
    surfaceAndContainerStrategy: "Use the open surface, typography, rules, and evidence itself. Add a boundary only where it represents a real proof cluster.",
    antiGenericStrategy: "No dashboard, screenshot wall, scorecard, row of cards, or generic recommendation band.",
    continuityAndOriginality: "Use one continuous tension cue to clarify this exact trade-off while retaining the current Northstar artboard language and evidence lanes.",
    firstCreativeAct: "Add the tension cue and promote the two decisive proof points inside the existing composition.",
    mediumAndRepresentationStrategy: "Use a continuous SVG tension field with embedded evidence because the central relationship is spatial; do not add a chart unless grounded values make quantitative comparison clearer.",
    sceneExecutionPlan: "Preserve the current presentation shell, establish one tension path in the comparison region, anchor decisive evidence to exact points, and refine synthesis and decision endpoints.",
    precisionAndLegibilityStrategy: "Keep all labels readable at the full-board scale, bind callouts to exact semantic endpoints, and prevent connector or crop collisions.",
    visualizationIntegrityPlan: "Any quantitative encoding must use only grounded values with explicit labels and provenance; qualitative tension remains visually encoded without fabricated numbers.",
    publicationStandard: [
      "The governing idea is obvious without reading the thesis paragraph.",
      "Evidence is visibly unequal and connected to the argument.",
      "Repeated rectangular containers are not the primary design language.",
    ],
    premiumPlan: {
      noveltySignature: {
        informationTopology: "two evidence constellations joined by one tension path",
        dominantGeometry: "a continuous diagonal force line",
        readingPath: "thesis through opposed proof clusters into a grounded resolution",
        mediumCombination: "editorial typography, full evidence, and custom SVG",
        titleIntegration: "the headline begins the force line",
        evidenceTreatment: "turning points become anchors while complete proof remains inspectable",
        signatureBehavior: "the tension path changes weight where trust and speed exchange dominance",
      },
      narrativeBeats: [
        { id: "thesis", communicationRole: "thesis", purpose: "Frame the trade-off.", evidenceIds: [], visibleRealization: "A concise opening.", requiredAtPublication: true },
        { id: "proof", communicationRole: "evidence", purpose: "Show exact proof.", evidenceIds: ["awin-1", "whop-1"], visibleRealization: "Opposed grounded evidence anchors.", requiredAtPublication: true },
        { id: "resolution", communicationRole: "resolution", purpose: "Resolve the implication.", evidenceIds: [], visibleRealization: "A precise ending.", requiredAtPublication: true },
      ],
      analyticalIntents: [{
        id: "tension-analysis",
        question: "Where does each flow exchange speed for trust?",
        form: "Qualitative tension map",
        sourceEvidenceIds: ["awin-1", "whop-1"],
        groundedClaim: "The observed onboarding steps place verification and activation at different moments.",
        encoding: "qualitative",
        requiredAtPublication: true,
      }],
      publicationOutcomes: ["Understand the trade-off", "Inspect the exact proof", "Reach a grounded conclusion"],
    },
  };
}

test("emergent design intelligence contains no visual-family or template selector", () => {
  const schema = JSON.stringify(NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_JSON_SCHEMA);
  for (const forbidden of ["visualFamily", "archetype", "templateId", "layoutOption", "selectedConceptId"]) {
    assert.equal(schema.includes(forbidden), false, forbidden);
  }
});

test("design intelligence keeps only real grounded evidence identities", () => {
  const result = sanitizeNorthstarEmergentDesignIntelligence(designDraft(), {
    diversityAnchor: "anchor-1",
    groundedEvidenceIds: ["awin-1", "whop-1"],
  });
  assert.equal(result.evidenceChoreography.length, 2);
  assert.match(result.signatureMove, /tension path/i);
});

test("the novelty anchor changes with the exact revision without encoding a style", () => {
  const first = northstarEmergentDiversityAnchor({ runId: "run", objective: "compare", revisionId: "r1" });
  const second = northstarEmergentDiversityAnchor({ runId: "run", objective: "compare", revisionId: "r2" });
  assert.notEqual(first, second);
  assert.equal(first.length, 20);
});

test("the first creative act may be local when it meaningfully advances the current artboard", () => {
  const local = validateNorthstarFirstCreativeActAmbition({
    operationSummaries: [
      { op: "set-text", targetId: "title", introducedSemanticIds: [] },
      { op: "insert-html", targetId: "artboard", introducedSemanticIds: ["strategic-thesis"] },
    ],
    groundedEvidenceNodeIds: new Set(["evidence-awin-1"]),
    acceptedActCount: 0,
  });
  assert.deepEqual(local, []);

  const empty = validateNorthstarFirstCreativeActAmbition({
    operationSummaries: [],
    groundedEvidenceNodeIds: new Set(["evidence-awin-1"]),
    acceptedActCount: 0,
  });
  assert.ok(empty.some((issue) => /visible source change/i.test(issue)));
});

test("the design-intelligence instruction makes current-artboard continuity and the universal quality floor explicit", () => {
  const instruction = buildNorthstarEmergentDesignIntelligenceSystemInstruction();
  assert.match(instruction, /treat the exact current artboard as the primary design precedent/i);
  assert.match(instruction, /preserve intrinsic aspect ratio/i);
  assert.match(instruction, /local, regional, or whole-composition/i);
  assert.match(instruction, /Low, Medium, and High change deliberation depth per decision/i);
  assert.match(instruction, /Cards, panels, pills, borders, rounded boxes/i);
  assert.match(instruction, /No application-authored list of media, metaphors, structures, or styles exists/i);
  assert.doesNotMatch(instruction, /current layout as disposable source material/i);
  assert.doesNotMatch(instruction, /hard novelty pressure/i);
  assert.doesNotMatch(instruction, /editorial spread, cinematic storyboard/i);
});

test("compiler-owned settlement anchors do not consume a creative rejection", () => {
  const issues = validateNorthstarFirstCreativeActAmbition({
    operationSummaries: [
      { op: "set-html", targetId: "presentation", introducedSemanticIds: ["visual-world"] },
      { op: "move", targetId: "evidence-awin-1", parentId: "visual-world", introducedSemanticIds: [] },
      { op: "set-css-layer", introducedSemanticIds: [] },
      { op: "remove", targetId: "header", introducedSemanticIds: [] },
    ],
    groundedEvidenceNodeIds: new Set(["evidence-awin-1"]),
    acceptedActCount: 0,
  });
  assert.deepEqual(issues, []);
});
