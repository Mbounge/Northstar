import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_EMERGENT_CREATIVE_ACT_JSON_SCHEMA,
  inferNorthstarCreativeOperationKind,
  sanitizeNorthstarEmergentCreativeAct,
  type NorthstarEmergentCreativeActDraft,
} from "@/lib/canvas-ai/northstar-emergent-creative-authorship";

type CompleteCreativeActDraft = NorthstarEmergentCreativeActDraft & {
  sourceEdit: NonNullable<NorthstarEmergentCreativeActDraft["sourceEdit"]>;
  stage: NonNullable<NorthstarEmergentCreativeActDraft["stage"]>;
  exactActions: NonNullable<NorthstarEmergentCreativeActDraft["exactActions"]>;
};

function baseDraft(): CompleteCreativeActDraft {
  return {
    designIntelligence: {
      viewerTransformation: "The viewer understands the trust-versus-velocity trade-off immediately.",
      editorialArgument: "The evidence becomes one precise comparison rather than inventory.",
      threeSecondRead: "Trust and velocity produce visibly different onboarding shapes.",
      governingVisualIdea: "A tension path turns onboarding friction into the composition's spatial force.",
      spatialLogic: "Evidence attaches to decisive bends in one asymmetric reading path.",
      evidenceChoreography: [],
      emotionalRegister: "Calm, exact, premium, and editorial.",
      signatureMove: "One live tension path pulls decisive proof into focus.",
      existingStructureVerdict: "Replace the equal-weight evidence wall.",
      destructiveRecompositionIntent: "Rebuild the presentation while preserving every evidence identity.",
      surfaceAndContainerStrategy: "Use open space and only meaningful boundaries.",
      antiGenericStrategy: "Avoid dashboard modules and equal-weight cards.",
      divergenceFromRecentWork: "Use an asymmetric tension field rather than rows.",
      firstCreativeAct: "Create the tension field and move proof into it.",
      mediumAndRepresentationStrategy: "Use editorial HTML and SVG as one continuous scene.",
      sceneExecutionPlan: "Build thesis, evidence field, and resolution in one cumulative source.",
      precisionAndLegibilityStrategy: "Keep evidence complete and text readable at full-board scale.",
      visualizationIntegrityPlan: "Use only grounded facts and label interpretation.",
      publicationStandard: ["Clear hierarchy", "Grounded proof", "Resolved ending"],
      premiumPlan: {
        noveltySignature: {
          informationTopology: "asymmetric tension field",
          dominantGeometry: "one bending diagonal",
          readingPath: "thesis to proof bends to resolution",
          mediumCombination: "editorial HTML with custom SVG",
          titleIntegration: "title begins the tension path",
          evidenceTreatment: "proof anchored at consequential bends",
          signatureBehavior: "the path changes visual force as the argument resolves",
        },
        narrativeBeats: [
          { id: "thesis", communicationRole: "thesis", purpose: "Frame the trade-off.", evidenceIds: [], visibleRealization: "A decisive opening.", requiredAtPublication: true },
          { id: "proof", communicationRole: "evidence", purpose: "Make the proof inspectable.", evidenceIds: [], visibleRealization: "A focal evidence field.", requiredAtPublication: true },
          { id: "resolution", communicationRole: "resolution", purpose: "Resolve the comparison.", evidenceIds: [], visibleRealization: "A clear ending.", requiredAtPublication: true },
        ],
        analyticalIntents: [],
        publicationOutcomes: ["Understand the tension", "Inspect the proof", "Reach a grounded conclusion"],
      },
    },
    intention: "Turn the strongest proof into the visual center of gravity.",
    viewerUnderstanding: "Awin's trust burden and Whop's activation speed become immediately comparable.",
    whyThisMoveNow: "The current evidence is still presented at equal visual weight.",
    continueWorking: true,
    successCriteria: ["One proof is unmistakably focal while the full evidence remains inspectable."],
    sourceEdit: {
      targetId: "presentation",
      html: '<section data-ns-node-id="proof-stage"><div data-ns-node-id="evidence-slot"></div></section>',
      css: ".ns-proof{display:flex;gap:24px}",
      javascript: "",
      placements: [{ targetId: "evidence-awin-1", parentId: "evidence-slot" }],
      retireNodeIds: [],
    },
    stage: {
      title: "Create a decisive evidence hierarchy",
      description: "Recompose the existing evidence without replacing the living artboard.",
      visualStrategy: "Use scale, sequence, and open space to create a clear proof hierarchy.",
      visibleChange: "The strongest evidence becomes visually dominant and the remaining proof recedes.",
      transitionMs: 240,
    },
    exactActions: [
      {
        op: "set-attributes" as const,
        targetId: "evidence-awin-1",
        attributes: {
          "data-ns-evidence-id": "awin-1",
          "data-ns-evidence-role": "focal",
        },
      },
      {
        op: "set-styles" as const,
        targetId: "evidence-awin-1",
        styles: { "flex-basis": "260px" },
      },
    ],
    constructionPlan: {
      version: "northstar.live-visual-authorship.v2",
      mode: "compact",
      beats: [
        {
          id: "establish-proof",
          kind: "choreograph-evidence",
          label: "Establish the proof hierarchy",
          nodeIds: ["proof-stage", "evidence-awin-1"],
          durationMs: 240,
          staggerMs: 30,
          holdMs: 0,
          emphasis: "hero",
        },
        {
          id: "settle-proof",
          kind: "settle",
          label: "Settle the exact final source",
          nodeIds: ["proof-stage"],
          durationMs: 120,
          staggerMs: 0,
          holdMs: 0,
          emphasis: "quiet",
        },
      ],
      coverageNodeIds: ["proof-stage", "evidence-awin-1"],
      strictCoverage: false,
      totalDurationMs: 360,
      deadlineMs: 1200,
      showBeatLabels: false,
    },
  };
}

test("the model-facing schema contains no visual-family or artboard-sizing controls", () => {
  const schema = JSON.stringify(NORTHSTAR_EMERGENT_CREATIVE_ACT_JSON_SCHEMA);
  for (const forbidden of [
    "archetype",
    "visualFamily",
    "relationshipMode",
    "focalTreatment",
    "geometryIntent",
    "request-space",
    "preferredWidth",
    "preferredHeight",
    "runtimeBindings",
    "requiredPrimitives",
    "minimumInstances",
    "criticality",
  ]) {
    assert.equal(schema.includes(forbidden), false, forbidden);
  }
});

test("sanitization forces runtime-owned geometry and preserves concrete creative operations", () => {
  const act = sanitizeNorthstarEmergentCreativeAct(baseDraft());
  assert.equal(act.mutation.geometryIntent, "preserve");
  assert.equal(act.mutation.operations.length, 6);
  assert.equal(act.affectedNodeIds.includes("evidence-awin-1"), true);
  assert.deepEqual(act.evidenceRoles, [{
    evidenceId: "awin-1",
    role: "focal",
    reason: "The authored mutation explicitly assigns this evidence role on the existing grounded node.",
  }]);
});

test("request-space is rejected even if a provider bypasses schema enforcement", () => {
  const draft = baseDraft();
  (draft.exactActions as unknown[]).push({
    op: "request-space",
    left: 100,
    right: 100,
  });
  assert.throws(
    () => sanitizeNorthstarEmergentCreativeAct(draft),
    /may not request or control artboard dimensions/i,
  );
});

test("root dimension styles are rejected while evidence sizing remains allowed", () => {
  const rootStyle = baseDraft();
  rootStyle.exactActions = [{
    op: "set-styles",
    targetId: "artboard",
    styles: { width: "2400px" },
  }];
  assert.throws(
    () => sanitizeNorthstarEmergentCreativeAct(rootStyle),
    /may not set root artboard dimensions/i,
  );

  const rootCss = baseDraft();
  rootCss.sourceEdit.css = '.ns-artifact{min-width:2400px}.ns-proof{width:280px}';
  assert.throws(
    () => sanitizeNorthstarEmergentCreativeAct(rootCss),
    /runtime owns content-derived sizing/i,
  );

  const nested = sanitizeNorthstarEmergentCreativeAct(baseDraft());
  assert.equal(nested.mutation.operations.some((operation) =>
    operation.op === "set-styles" && operation.targetId === "evidence-awin-1"
  ), true);
});

test("internal operation classification is inferred from the process need, not chosen by the model", () => {
  assert.equal(inferNorthstarCreativeOperationKind("evidence-hierarchy"), "rank-evidence");
  assert.equal(inferNorthstarCreativeOperationKind("relationship-visible"), "connect-evidence-to-claim");
  assert.equal(inferNorthstarCreativeOperationKind("geometry"), "rebalance-composition");
});

test("the runtime inherits unmentioned protected evidence and the model still cannot hide or remove it", () => {
  const partial = baseDraft();
  const inherited = sanitizeNorthstarEmergentCreativeAct(partial, {
    protectedEvidenceNodeIds: ["evidence-awin-1", "evidence-whop-1"],
  });
  const inheritedRecomposition = inherited.mutation.operations.find((operation) =>
    operation.op === "recompose-region"
  );
  assert.equal(inheritedRecomposition?.op, "recompose-region");
  if (inheritedRecomposition?.op === "recompose-region") {
    assert.deepEqual(
      inheritedRecomposition.placements.find((placement) => placement.targetId === "evidence-whop-1"),
      {
        targetId: "evidence-whop-1",
        parentId: "presentation",
        beforeId: undefined,
        runtimeInherited: true,
        preserveGeometry: true,
      },
    );
  }

  const parentPreserved = sanitizeNorthstarEmergentCreativeAct(baseDraft(), {
    protectedEvidenceNodeIds: ["evidence-awin-1", "evidence-whop-1"],
    semanticSnapshot: [{
      nodeId: "evidence-whop-1",
      parentId: "evidence-slot",
      normalizedText: "Whop evidence",
      normalizedAttributes: { "data-ns-evidence-id": "whop-1" },
      normalizedClasses: [],
      normalizedStyles: {},
      subtreeFingerprint: "whop-1",
    }],
  });
  const parentPreservedRecomposition = parentPreserved.mutation.operations.find((operation) =>
    operation.op === "recompose-region"
  );
  assert.equal(parentPreservedRecomposition?.op, "recompose-region");
  if (parentPreservedRecomposition?.op === "recompose-region") {
    assert.deepEqual(
      parentPreservedRecomposition.placements.find((placement) => placement.targetId === "evidence-whop-1"),
      {
        targetId: "evidence-whop-1",
        parentId: "evidence-slot",
        beforeId: undefined,
        runtimeInherited: true,
        preserveGeometry: undefined,
      },
    );
  }

  const complete = baseDraft();
  complete.sourceEdit!.placements!.push({ targetId: "evidence-whop-1", parentId: "evidence-slot" });
  complete.viewingIntent = {
    mode: "single-frame",
    primaryNodeIds: ["proof-stage"],
    supportingNodeIds: ["evidence-awin-1", "evidence-whop-1"],
    intendedViewerOutcome: "See the argument first and inspect every screen without losing the workspace frame.",
    intendedReadingPath: ["proof-stage", "evidence-slot"],
    preserveAllEvidence: true,
  };
  const act = sanitizeNorthstarEmergentCreativeAct(complete, {
    protectedEvidenceNodeIds: ["evidence-awin-1", "evidence-whop-1"],
  });
  assert.equal(act.viewingIntent.preserveAllEvidence, true);
  assert.equal(act.viewingIntent.mode, "single-frame");
  const rootAttributes = act.mutation.operations.find((operation) =>
    operation.op === "set-attributes" && operation.targetId === "artboard"
  );
  assert.equal(rootAttributes?.op, "set-attributes");
  if (rootAttributes?.op === "set-attributes") {
    assert.equal(rootAttributes.attributes["data-ns-preserve-all-evidence"], "true");
    assert.equal(rootAttributes.attributes["data-ns-viewing-mode"], "single-frame");
  }

  const hidden = baseDraft();
  hidden.sourceEdit!.placements!.push({ targetId: "evidence-whop-1", parentId: "evidence-slot" });
  hidden.exactActions!.push({
    op: "set-styles",
    targetId: "evidence-whop-1",
    styles: { display: "none" },
  });
  assert.throws(
    () => sanitizeNorthstarEmergentCreativeAct(hidden, {
      protectedEvidenceNodeIds: ["evidence-awin-1", "evidence-whop-1"],
    }),
    /cannot be hidden/i,
  );
});

test("large evidence sets survive source sanitization without the legacy 32-screen truncation", () => {
  const draft = baseDraft();
  const evidenceIds = Array.from({ length: 40 }, (_, index) => `evidence-screen-${index + 1}`);
  draft.sourceEdit!.placements = evidenceIds.map((targetId) => ({ targetId, parentId: "evidence-slot" }));
  draft.viewingIntent = {
    mode: "single-frame",
    primaryNodeIds: ["proof-stage"],
    supportingNodeIds: evidenceIds,
    intendedViewerOutcome: "Read the argument first and retain every complete source screen for inspection.",
    intendedReadingPath: ["proof-stage", "evidence-slot"],
    preserveAllEvidence: true,
  };
  const act = sanitizeNorthstarEmergentCreativeAct(draft, { protectedEvidenceNodeIds: evidenceIds });
  const recomposition = act.mutation.operations.find((operation) => operation.op === "recompose-region");
  assert.equal(recomposition?.op, "recompose-region");
  if (recomposition?.op === "recompose-region") {
    assert.equal(recomposition.placements.length, evidenceIds.length);
  }
});
