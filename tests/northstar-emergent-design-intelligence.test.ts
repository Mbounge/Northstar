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
    existingStructureVerdict: "Destroy the equal-weight screenshot rows and the boxed thesis strip; preserve only grounded evidence and useful identity cues.",
    destructiveRecompositionIntent: "Rebuild the presentation around the tension path and move decisive evidence into it while leaving the remaining source material inspectable.",
    surfaceAndContainerStrategy: "Use the open surface, typography, rules, and evidence itself. Add a boundary only where it represents a real proof cluster.",
    antiGenericStrategy: "No dashboard, screenshot wall, scorecard, row of cards, or generic recommendation band.",
    divergenceFromRecentWork: "Use one continuous tension field rather than the repeated evidence rows and boxed thesis language visible in recent runs.",
    firstCreativeAct: "Replace the presentation layer, create the tension path, and move the two decisive evidence nodes into the new composition.",
    mediumAndRepresentationStrategy: "Use a continuous SVG tension field with embedded evidence because the central relationship is spatial; do not add a chart unless grounded values make quantitative comparison clearer.",
    sceneExecutionPlan: "Replace the presentation shell, establish one tension path, anchor decisive evidence to exact points, create synthesis and decision endpoints, and demote remaining sources into the reservoir.",
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

test("the first creative act must recompose presentation and evidence rather than add one card", () => {
  const weak = validateNorthstarFirstCreativeActAmbition({
    operationSummaries: [
      { op: "set-text", targetId: "title", introducedSemanticIds: [] },
      { op: "insert-html", targetId: "artboard", introducedSemanticIds: ["strategic-thesis"] },
    ],
    groundedEvidenceNodeIds: new Set(["evidence-awin-1"]),
    acceptedActCount: 0,
  });
  assert.ok(weak.some((issue) => /presentation/i.test(issue)));
  assert.ok(weak.some((issue) => /evidence/i.test(issue)));

  const strong = validateNorthstarFirstCreativeActAmbition({
    operationSummaries: [
      { op: "set-html", targetId: "presentation", introducedSemanticIds: ["synthesis", "decision", "tension-path"] },
      { op: "move", targetId: "evidence-awin-1", parentId: "tension-path", introducedSemanticIds: [] },
      { op: "set-css-layer", introducedSemanticIds: [] },
      { op: "set-attributes", targetId: "evidence-awin-1", introducedSemanticIds: [] },
    ],
    groundedEvidenceNodeIds: new Set(["evidence-awin-1"]),
    acceptedActCount: 0,
  });
  assert.deepEqual(strong, []);
});

test("the design-intelligence instruction makes destructive recomposition and the universal quality floor explicit", () => {
  const instruction = buildNorthstarEmergentDesignIntelligenceSystemInstruction();
  assert.match(instruction, /current layout as disposable source material/i);
  assert.match(instruction, /Low, Medium, and High change exploration time and persistence only/i);
  assert.match(instruction, /Cards, panels, pills, borders, rounded boxes/i);
  assert.match(instruction, /No application-authored list of media, metaphors, structures, or styles exists/i);
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
