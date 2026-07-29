import assert from "node:assert/strict";
import test from "node:test";

import { assessNorthstarPrivateCandidateDelivery } from "../lib/canvas-ai/northstar-private-candidate-delivery-policy";
import type { NorthstarArtifactMutationAcknowledgement } from "../lib/canvas-artifacts/types";
import type { NorthstarEmergentCreativeCritique } from "../lib/canvas-ai/northstar-emergent-creative-authorship";

function acknowledgement(overrides: Partial<NorthstarArtifactMutationAcknowledgement> = {}): NorthstarArtifactMutationAcknowledgement {
  return {
    schema: "northstar.artboard-ack.v1",
    ackToken: "ack",
    artifactId: "artifact",
    surfaceId: "surface",
    revisionId: "revision-2",
    status: "applied",
    changedNodeIds: ["presentation"],
    meaningfulChangedNodeIds: ["presentation"],
    changeKinds: ["structure"],
    requiredAssetUrls: [],
    loadedAssetUrls: [],
    missingAssetUrls: [],
    acknowledgedAt: new Date(0).toISOString(),
    review: {
      revisionId: "revision-2",
      stageIndex: 2,
      evaluatedAt: new Date(0).toISOString(),
      rootWidth: 2400,
      rootHeight: 1407,
      elementCount: 20,
      stageRegionCount: 1,
      visibleStageRegionCount: 1,
      overflowElementCount: 0,
      clippedTextCount: 0,
      smallTextCount: 0,
      tinyInteractiveCount: 0,
      missingImageCount: 0,
      documentScrollRisk: false,
      summary: "Runtime audit passed.",
      hardFailureCount: 0,
      advisoryDeliveryIssues: [
        "The cinema layer simplified the reveal because several authored nodes were not individually staged.",
      ],
      geometryFacts: {
        sourceOwnedSurface: true,
        viewingMode: "single-frame",
        viewportWidth: 2400,
        viewportHeight: 1407,
        artboardBounds: { minX: 0, minY: 0, maxX: 2400, maxY: 1407 },
        semanticContentBounds: { minX: 0, minY: 0, maxX: 2400, maxY: 1407 },
        occupiedWidthRatio: 1,
        occupiedHeightRatio: 1,
        unusedSpaceRatio: 0,
        rightGutterPx: 0,
        bottomGutterPx: 0,
        authoredSurfaceCoverageX: 1,
        authoredSurfaceCoverageY: 1,
        backgroundLeakRisk: false,
        outOfBoundsNodeIds: [],
        clippedSemanticNodeIds: [],
        evidenceNodeCount: 0,
        visibleEvidenceNodeCount: 0,
        hiddenEvidenceNodeIds: [],
        partiallyClippedEvidenceNodeIds: [],
        croppedEvidenceNodeIds: [],
        minimumEvidenceVisibleRatio: 1,
        primaryNodeIds: ["presentation"],
        supportingNodeIds: [],
        minimumPrimaryTextPx: 16,
        minimumSupportingTextPx: 12,
        evidenceAreaRatio: 0,
        primaryAreaRatio: 1,
        integrityFailures: [],
      },
    },
    ...overrides,
  };
}

const critique: NorthstarEmergentCreativeCritique = {
  summary: "The source is usable.",
  observedEffect: "The comparison is visible.",
  whatImproved: ["The source became clearer."],
  whatStillWeak: [],
  implementationDefects: [
    "The cinema layer failed to stage several key nodes during the transition.",
    "The artboard is wider than the initial view and may scroll on smaller displays.",
  ],
  recommendedNextMove: "Refine the choreography and responsive presentation.",
  continueWorking: true,
};

test("cinema and hypothetical responsive concerns cannot invalidate an applied source", () => {
  const result = assessNorthstarPrivateCandidateDelivery({ acknowledgement: acknowledgement(), critique });
  assert.equal(result.canCommitSource, true);
  assert.deepEqual(result.blockingSourceDefects, []);
  assert.equal(result.deliveryAdvisories.length, 1);
  assert.equal(result.modelObservedConcerns.length, 2);
});

test("structured browser geometry integrity failures still block source commit", () => {
  const ack = acknowledgement();
  ack.review!.geometryFacts!.integrityFailures = ["Semantic content is clipped by its authored artboard."];
  const result = assessNorthstarPrivateCandidateDelivery({ acknowledgement: ack, critique });
  assert.equal(result.canCommitSource, false);
  assert.deepEqual(result.blockingSourceDefects, ["Semantic content is clipped by its authored artboard."]);
});

test("a rejected production-runtime receipt remains blocking", () => {
  const result = assessNorthstarPrivateCandidateDelivery({
    acknowledgement: acknowledgement({ status: "rejected", reason: "Protected evidence identity changed." }),
    critique,
  });
  assert.equal(result.canCommitSource, false);
  assert.deepEqual(result.blockingSourceDefects, ["Protected evidence identity changed."]);
});
