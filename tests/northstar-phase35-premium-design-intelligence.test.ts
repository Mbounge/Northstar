import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assessNorthstarStructuralNovelty,
  northstarPremiumContractAttributes,
  northstarPremiumSignatureModelView,
  sanitizeNorthstarPremiumDesignPlan,
} from "@/lib/canvas-ai/northstar-premium-design-contract";
import {
  sanitizeNorthstarIndependentCreativeReview,
} from "@/lib/canvas-ai/northstar-independent-creative-review";

function plan() {
  return {
    noveltySignature: {
      informationTopology: "an asymmetric evidence constellation with a decisive conclusion orbit",
      dominantGeometry: "one diagonal arc crossing two anchored proof fields",
      readingPath: "provocation to opposed proof to tension map to recommendation",
      mediumCombination: "editorial typography, complete screenshots, and a custom qualitative SVG field",
      titleIntegration: "the title launches the diagonal arc instead of occupying a header box",
      evidenceTreatment: "decisive screens become anchors and supporting screens form an inspectable ledger",
      signatureBehavior: "the arc changes weight and color where the evidence changes the conclusion",
    },
    narrativeBeats: [
      { id: "opening-thesis", communicationRole: "thesis", purpose: "Frame the central tension.", evidenceIds: [], visibleRealization: "A decisive typographic opening.", requiredAtPublication: true },
      { id: "grounded-proof", communicationRole: "evidence", purpose: "Make the source proof inspectable.", evidenceIds: ["awin-1", "whop-1"], visibleRealization: "Two unequal evidence anchors.", requiredAtPublication: true },
      { id: "decision-ending", communicationRole: "resolution", purpose: "Resolve the user question.", evidenceIds: [], visibleRealization: "A grounded recommendation integrated with the arc.", requiredAtPublication: true },
    ],
    analyticalIntents: [{
      id: "friction-tension",
      question: "Where does each flow invest friction?",
      form: "Qualitative evidence-linked tension map",
      sourceEvidenceIds: ["awin-1", "whop-1"],
      groundedClaim: "The observed sequences place verification and immediate value at different moments.",
      encoding: "qualitative",
      requiredAtPublication: true,
    }],
    publicationOutcomes: [
      "The governing tension is clear in three seconds.",
      "Every conclusion remains traceable to exact evidence.",
      "The ending helps the viewer make a decision.",
    ],
  };
}

test("Phase 3.5 turns a one-off visual idea into a browser-verifiable premium contract", () => {
  const result = sanitizeNorthstarPremiumDesignPlan(plan(), {
    groundedEvidenceIds: ["awin-1", "whop-1"],
  });
  assert.deepEqual(result.requiredCommunicationRoles, ["thesis", "evidence", "resolution"]);
  assert.deepEqual(result.requiredBeatIds, ["opening-thesis", "grounded-proof", "decision-ending"]);
  assert.deepEqual(result.analyticalIntents[0]?.sourceEvidenceIds, ["awin-1", "whop-1"]);
  const attributes = northstarPremiumContractAttributes(result, ["rendered=8a12bc34"]);
  assert.equal(attributes["data-ns-design-fingerprint"], result.noveltySignature.fingerprint);
  assert.match(attributes["data-ns-required-narrative-beats"], /grounded-proof/);
  assert.equal(attributes["data-ns-required-analysis-ids"], "friction-tension");
  assert.equal(attributes["data-ns-recent-rendered-structure-fingerprints"], "8a12bc34");
});

test("the same structural signature cannot pass as novelty while a genuinely different form can", () => {
  const first = sanitizeNorthstarPremiumDesignPlan(plan(), {
    groundedEvidenceIds: ["awin-1", "whop-1"],
  });
  const recent = northstarPremiumSignatureModelView(first.noveltySignature);
  const repeated = assessNorthstarStructuralNovelty({
    signature: first.noveltySignature,
    recentSignatures: [recent.join(" / ")],
  });
  assert.equal(repeated.materiallyDistinct, false);
  assert.match(repeated.reason, /already exists/i);

  const second = sanitizeNorthstarPremiumDesignPlan({
    ...plan(),
    noveltySignature: {
      informationTopology: "a radial decision atlas with four independently scaled opportunity territories",
      dominantGeometry: "concentric orbital fields around one evidence-backed decision core",
      readingPath: "center decision to evidence territories to outer risks and next moves",
      mediumCombination: "spatial atlas, annotated evidence crops, microcharts, and an integrated decision ledger",
      titleIntegration: "the title occupies the atlas margin as a navigational legend",
      evidenceTreatment: "screens become local proof landmarks inside distinct territories",
      signatureBehavior: "territory density and orbit distance express confidence and consequence",
    },
  }, {
    groundedEvidenceIds: ["awin-1", "whop-1"],
  });
  assert.equal(assessNorthstarStructuralNovelty({
    signature: second.noveltySignature,
    recentSignatures: [recent.join(" / ")],
  }).materiallyDistinct, true);
});

test("independent publication cannot pass below the universal premium score floor", () => {
  const common = {
    interpretation: "A coherent evidence-led comparison.",
    strongestAspect: "The proof is easy to locate.",
    unresolvedProblems: [],
    evidenceCommunicationAssessment: "Evidence is visible and grounded.",
    recommendedIntervention: "Settle only after the analytical ending is precise.",
    materialImprovementAvailable: false,
    publicationReady: true,
    governingVisualIdeaAssessment: "The governing visual idea is visible.",
    evidenceTransformationAssessment: "Evidence has been transformed into an argument.",
    containerAndSurfaceAssessment: "Boundaries carry meaning.",
    originalityAssessment: "The structure is problem-specific.",
    mediumFitnessAssessment: "The medium fits the evidence.",
    precisionAndLegibilityAssessment: "The full scene is readable.",
    governingIdeaFidelityAssessment: "Source and pixels agree.",
    memorableAuthorshipAssessment: "The composition has a distinct signature.",
    universalQualityBarMet: true,
    structuralBlockers: [],
    rationale: "The artifact is ready only if every universal floor is met.",
  };
  const weak = sanitizeNorthstarIndependentCreativeReview({
    ...common,
    qualityScores: {
      informationHierarchy: 90,
      evidenceLegibility: 90,
      analyticalDepth: 70,
      structuralOriginality: 90,
      compositionCoherence: 90,
      craftPrecision: 90,
      decisionUsefulness: 90,
    },
  });
  assert.equal(weak.universalQualityBarMet, false);
  assert.equal(weak.publicationReady, false);

  const strong = sanitizeNorthstarIndependentCreativeReview({
    ...common,
    qualityScores: {
      informationHierarchy: 88,
      evidenceLegibility: 90,
      analyticalDepth: 84,
      structuralOriginality: 86,
      compositionCoherence: 89,
      craftPrecision: 88,
      decisionUsefulness: 85,
    },
  });
  assert.equal(strong.universalQualityBarMet, true);
  assert.equal(strong.publicationReady, true);
});

test("the production browser runtime measures the declared premium narrative instead of trusting prose", () => {
  const runtime = fs.readFileSync(
    path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"),
    "utf8",
  );
  assert.match(runtime, /collectPremiumDesignAudit/);
  assert.match(runtime, /data-ns-required-narrative-beats/);
  assert.match(runtime, /data-ns-required-communication-roles/);
  assert.match(runtime, /data-ns-required-analysis-ids/);
  assert.match(runtime, /ungroundedAnalysisIds/);
  assert.match(runtime, /minimumReadableTextPx/);
  assert.match(runtime, /repeatsRecentRenderedStructure/);
  const diagnostics = fs.readFileSync(
    path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
    "utf8",
  );
  assert.match(diagnostics, /northstar-premium-design-summary/);
  assert.match(diagnostics, /Narrative \/ analysis/);
  assert.match(diagnostics, /Quality floor/);
});
