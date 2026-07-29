import assert from "node:assert/strict";
import test from "node:test";
import {
  assessNorthstarOuterCanvasPresentation,
  compareNorthstarPresentationCandidates,
} from "@/lib/canvas-ai/northstar-outer-canvas-presentation";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

function artifact(): NorthstarGeneratedCodeArtifactPackage {
  return {
    schema: "northstar.generated-web-artifact.v0.3",
    artifactId: "artifact-1",
    revisionId: "revision-1",
    title: "Comparison",
    description: "Comparison",
    objective: "Compare",
    audience: "executive",
    artifactType: "comparison-board",
    visualStrategy: "Evidence-led",
    document: { schema: "northstar.web-artifact-document.v1", html: "", css: "", javascript: "", cssLayers: {} },
    preferredWidth: 2360,
    preferredHeight: 1296,
    minimumWidth: 1,
    minimumHeight: 1,
    stages: [],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Compare",
      audience: "executive",
      artifactType: "comparison-board",
      coverageSummary: "All screens preserved",
      apps: [],
      flows: [],
      screenshots: [],
      hypotheses: [],
      decisions: [],
      corrections: [],
      openQuestions: [],
      allowedAssetUrls: [],
    },
    thinkingDepth: "low",
    creativeReviews: [],
    diagnostics: [],
  };
}

function acknowledgement(width: number, height: number, overrides: Record<string, unknown> = {}): NorthstarArtifactMutationAcknowledgement {
  return {
    schema: "northstar.artboard-ack.v1",
    ackToken: "ack",
    artifactId: "artifact-1",
    surfaceId: "surface-1",
    revisionId: "revision-2",
    status: "applied",
    changedNodeIds: [],
    meaningfulChangedNodeIds: [],
    changeKinds: [],
    requiredAssetUrls: [],
    loadedAssetUrls: [],
    missingAssetUrls: [],
    acknowledgedAt: new Date(0).toISOString(),
    size: {
      artifactId: "artifact-1",
      revisionId: "revision-2",
      measuredAt: new Date(0).toISOString(),
      intrinsicWidth: width,
      intrinsicHeight: height,
      sourceOwnedSurface: true,
      viewingMode: "single-frame",
    },
    review: {
      revisionId: "revision-2",
      stageIndex: 1,
      evaluatedAt: new Date(0).toISOString(),
      rootWidth: width,
      rootHeight: height,
      elementCount: 20,
      stageRegionCount: 1,
      visibleStageRegionCount: 1,
      overflowElementCount: 0,
      clippedTextCount: 0,
      smallTextCount: 0,
      tinyInteractiveCount: 0,
      missingImageCount: 0,
      documentScrollRisk: false,
      summary: "healthy",
      geometryFacts: {
        sourceOwnedSurface: true,
        viewingMode: "single-frame",
        viewportWidth: width,
        viewportHeight: height,
        artboardBounds: { minX: 0, minY: 0, maxX: width, maxY: height },
        semanticContentBounds: { minX: 0, minY: 0, maxX: width, maxY: height },
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
        evidenceNodeCount: 20,
        visibleEvidenceNodeCount: 20,
        hiddenEvidenceNodeIds: [],
        primaryNodeIds: ["title", "synthesis"],
        supportingNodeIds: ["evidence"],
        minimumPrimaryTextPx: 32,
        minimumSupportingTextPx: 16,
        evidenceAreaRatio: 0.58,
        primaryAreaRatio: 0.25,
        integrityFailures: [],
        ...overrides,
      },
    },
  };
}

const intent = {
  mode: "single-frame" as const,
  primaryNodeIds: ["title", "synthesis"],
  supportingNodeIds: ["evidence"],
  intendedViewerOutcome: "See the recommendation and inspect every screen.",
  intendedReadingPath: ["title", "synthesis", "evidence"],
  preserveAllEvidence: true as const,
};

test("a compact evidence-preserving candidate fits the stable outer canvas", () => {
  const facts = assessNorthstarOuterCanvasPresentation({
    baseArtifact: artifact(),
    acknowledgement: acknowledgement(2400, 1407),
    viewingIntent: intent,
  });
  assert.equal(facts.blocksCommit, false);
  assert.ok(facts.fitScale > 0.4);
  assert.equal(facts.visibleEvidenceNodeCount, 20);
});

test("runaway tall source is rejected by its own single-frame viewing intent", () => {
  const facts = assessNorthstarOuterCanvasPresentation({
    baseArtifact: artifact(),
    acknowledgement: acknowledgement(2400, 3224),
    viewingIntent: intent,
  });
  assert.equal(facts.blocksCommit, true);
  assert.match(facts.blockingReasons.join(" "), /single-frame|expanded|primary authored text/i);
});

test("hiding one screen is always a blocking evidence-integrity failure", () => {
  const facts = assessNorthstarOuterCanvasPresentation({
    baseArtifact: artifact(),
    acknowledgement: acknowledgement(1800, 1000, {
      evidenceNodeCount: 20,
      visibleEvidenceNodeCount: 19,
      hiddenEvidenceNodeIds: ["screen-20"],
    }),
    viewingIntent: intent,
  });
  assert.equal(facts.blocksCommit, true);
  assert.match(facts.blockingReasons.join(" "), /every grounded screen/i);
});


test("cropped or partially clipped screenshots fail evidence preservation", () => {
  const facts = assessNorthstarOuterCanvasPresentation({
    baseArtifact: artifact(),
    acknowledgement: acknowledgement(1800, 1000, {
      partiallyClippedEvidenceNodeIds: ["screen-4"],
      croppedEvidenceNodeIds: ["screen-7"],
      minimumEvidenceVisibleRatio: 0.72,
    }),
    viewingIntent: intent,
  });
  assert.equal(facts.blocksCommit, true);
  assert.match(facts.blockingReasons.join(" "), /cannot be trimmed|cropping or masking/i);
});

test("a later refinement cannot replace a stronger state with a giant document", () => {
  const previous = assessNorthstarOuterCanvasPresentation({
    baseArtifact: artifact(),
    acknowledgement: acknowledgement(2360, 1296),
    viewingIntent: intent,
  });
  const next = assessNorthstarOuterCanvasPresentation({
    baseArtifact: artifact(),
    acknowledgement: acknowledgement(2400, 3224),
    viewingIntent: intent,
  });
  const comparison = compareNorthstarPresentationCandidates({ previous, next });
  assert.equal(comparison.retainPrevious, true);
  assert.match(comparison.reasons.join(" "), /workspace fit|document height|viewing intent/i);
});
