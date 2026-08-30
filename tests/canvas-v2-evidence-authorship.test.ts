import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCanvasV2AnalysisEvidenceContinuity,
  validateCanvasV2ArtifactDocument,
  validateCanvasV2ClaimedCanonicalFlowCounts,
  normalizeCanvasV2ClaimedCanonicalFlowCounts,
  validateCanvasV2EvidenceContinuity,
  validateCanvasV2GroundedAppIdentityUsage,
  validateCanvasV2QuantitativeClaimLabels,
  validateCanvasV2RequestedAnalysisEvidenceUsage,
  validateCanvasV2SelectedAnalysisEvidence,
} from "../lib/canvas-v2/artifact-safety";
import {
  canvasV2CanonicalEvidenceScale,
  readCanvasV2CanonicalFlowManifests,
  resolveCanvasV2EvidenceRole,
  validateCanvasV2RenderedAnalysisEvidenceScale,
  validateCanvasV2RenderedDesignRegionContentIntegrity,
  validateCanvasV2RenderedDesignRegionLegibility,
  repairCanvasV2RenderedDesignRegionTypeFloors,
  validateCanvasV2RenderedDesignRegionTerritoryIntegrity,
  validateCanvasV2RenderedComparisonCommunication,
  validateCanvasV2RenderedEvidenceIntegrity,
  validateCanvasV2RenderedIslandNarrativeIntegrity,
  validateCanvasV2RenderedRelationshipGeometry,
  invalidCanvasV2RenderedRelationshipNodeIds,
  collidingCanvasV2OptionalRelationshipLabelNodeIds,
} from "../lib/canvas-v2/evidence-authorship";
import { buildCanvasV2BoundedModelContext } from "../lib/canvas-v2/model-context";
import { canvasV2LocalIntegrityRepairTarget } from "../lib/canvas-v2/narrative-placement";
import type { CanvasV2ArtifactDocument, CanvasV2RenderObservation } from "../lib/canvas-v2/types";
import { CANVAS_V2_WORKSPACE } from "../lib/canvas-v2/workspace-coordinate-space";

const evidence = [
  { id: "icon:awin", url: "https://evidence.test/awin/icon.png", label: "Awin icon", description: "App icon" },
  { id: "screen:awin-1", url: "https://evidence.test/awin/1.png", label: "Awin screen 1", app: "Awin" },
  { id: "screen:awin-2", url: "https://evidence.test/awin/2.png", label: "Awin screen 2", app: "Awin" },
];

function document(inner: string): CanvasV2ArtifactDocument {
  return {
    html: `<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="flow-awin" data-canvas-v2-canonical-flow="flow:awin">${inner}</article></main>`,
    css: "",
  };
}

const canonical = document(`
  <img data-canvas-v2-node-id="flow-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/icon.png">
  <img data-canvas-v2-node-id="flow-awin-screen-1" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/awin/1.png">
  <img data-canvas-v2-node-id="flow-awin-screen-2" data-canvas-v2-evidence-id="screen:awin-2" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="1" src="https://evidence.test/awin/2.png">
`);

test("canonical flow manifests preserve the complete ordered source record", () => {
  assert.deepEqual(readCanvasV2CanonicalFlowManifests(canonical), [{
    flowId: "flow:awin",
    laneNodeId: "flow-awin",
    items: [
      { evidenceId: "icon:awin", nodeId: "flow-awin-icon", url: "https://evidence.test/awin/icon.png" },
      { evidenceId: "screen:awin-1", nodeId: "flow-awin-screen-1", url: "https://evidence.test/awin/1.png", flowIndex: 0 },
      { evidenceId: "screen:awin-2", nodeId: "flow-awin-screen-2", url: "https://evidence.test/awin/2.png", flowIndex: 1 },
    ],
  }]);
});

test("canonical evidence scale is derived from the complete committed atlas", () => {
  const screens = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => (
    `<img data-canvas-v2-node-id="${prefix}-${index}" data-canvas-v2-evidence-id="${prefix}:screen:${index}" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="${index}" src="https://evidence.test/${prefix}/${index}.png">`
  )).join("");
  const atlas = {
    html: `<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="awin" data-canvas-v2-canonical-flow="flow:awin">${screens("awin", 47)}</article><article data-canvas-v2-node-id="whop" data-canvas-v2-canonical-flow="flow:whop">${screens("whop", 17)}</article></main>`,
    css: "",
  };
  assert.deepEqual(canvasV2CanonicalEvidenceScale(atlas), { flowCount: 2, screenCount: 64 });
});

test("model context separates grounded identity assets from exact sequential screen counts", () => {
  const context = buildCanvasV2BoundedModelContext({
    schema: "canvas-v2.artifact.v1",
    id: "revision",
    state: "committed",
    document: canonical,
    evidence,
    createdAt: "2026-08-13T12:00:00.000Z",
  }, observation());
  assert.equal(context.canonicalEvidence[0]?.screenCount, 2);
  assert.deepEqual(context.canonicalEvidence[0]?.identityAssets, [{
    copyHandle: "lane-0-identity-0",
    evidenceId: "icon:awin",
    nodeId: "flow-awin-icon",
    label: "Awin icon",
    app: "Awin",
    description: "App icon",
  }]);
  assert.deepEqual(context.canonicalEvidence[0]?.screens.map((screen) => screen.index), [0, 1]);
  assert.deepEqual(context.canonicalEvidence[0]?.screens.map((screen) => screen.copyHandle), ["lane-0-screen-0", "lane-0-screen-1"]);
  assert.equal(context.render.spatial.canonicalEvidenceIntegrity[0]?.screenCount, 2);
  assert.match(context.source.htmlOutline, /IMMUTABLE CANONICAL LANE · 2 screens/);
  assert.match(context.source.htmlOutline, /GROUNDED IDENTITY ASSETS flow-awin-icon:lane-0-identity-0/);
  assert.doesNotMatch(context.source.htmlOutline, /IMMUTABLE CANONICAL LANE · 3 screens/);
});

test("model context carries exact browser-owned selection and viewport authority", () => {
  const context = buildCanvasV2BoundedModelContext({
    schema: "canvas-v2.artifact.v1",
    id: "revision",
    state: "committed",
    document: canonical,
    evidence,
    createdAt: "2026-08-13T12:00:00.000Z",
  }, observation(), {
    schema: "canvas-v2.working-context.v1",
    scope: "selection",
    selectionPolicy: "modify",
    selectedNodeIds: ["editorial-title"],
    selectedBounds: { x: 2_120, y: 1_440, width: 520, height: 88 },
    visibleBounds: { x: 1_900, y: 1_200, width: 1_680, height: 945 },
    viewportScale: 0.72,
    visibleNodeIds: ["editorial-title", "flow-awin"],
    nearbyNodeIds: ["editorial-title", "flow-awin"],
    editableNodeIds: ["editorial-title"],
    protectedNodeIds: ["flow-awin"],
    objects: [],
    relationships: [],
  });
  assert.deepEqual(context.collaboration?.selectedNodeIds, ["editorial-title"]);
  assert.deepEqual(context.collaboration?.editableNodeIds, ["editorial-title"]);
  assert.deepEqual(context.collaboration?.visibleBounds, { x: 1_900, y: 1_200, width: 1_680, height: 945 });
  assert.equal(context.collaboration?.viewportScale, 0.72);
  assert.deepEqual(context.workspace.aiAuthoringBounds, { x: 1_900, y: 1_200, width: 8_880, height: 8_000 });
  assert.match(context.collaboration?.contract ?? "", /only existing objects authorized for direct mutation/);
  assert.match(context.collaboration?.contract ?? "", /not permission to rebuild its island/);
});

test("compiler-owned canonical label furniture never becomes a model design opportunity", () => {
  const rendered = observation();
  rendered.overflow = [
    { nodeId: "flow-awin-segment-entry-label", x: 1, y: 1, width: 20, height: 20 },
    { nodeId: "authored-analysis", x: 2, y: 2, width: 40, height: 40 },
  ];
  rendered.spatial.contentOverflowNodeIds = ["flow-awin-segment-entry-label", "authored-analysis"];
  const context = buildCanvasV2BoundedModelContext({
    schema: "canvas-v2.artifact.v1",
    id: "revision",
    state: "committed",
    document: canonical,
    evidence,
    createdAt: "2026-08-13T12:00:00.000Z",
  }, rendered);
  assert.deepEqual(context.render.overflow?.map((item) => item.nodeId), ["authored-analysis"]);
  assert.deepEqual(context.render.spatial.contentOverflowNodeIds, ["authored-analysis"]);
});

test("role-less evidence in a legacy canonical lane upgrades without losing analytical provenance", () => {
  assert.equal(resolveCanvasV2EvidenceRole({ insideCanonicalFlow: true }), "canonical");
  assert.equal(resolveCanvasV2EvidenceRole({ insideCanonicalFlow: false }), "reference");
  assert.equal(resolveCanvasV2EvidenceRole({ declaredRole: "canonical", insideCanonicalFlow: false }), "reference");
  assert.equal(resolveCanvasV2EvidenceRole({ declaredRole: "analysis-copy", insideCanonicalFlow: true }), "analysis-copy");
  const legacy = { ...canonical, html: canonical.html.replaceAll(' data-canvas-v2-evidence-role="canonical"', "") };
  const upgraded = {
    ...canonical,
    html: `${canonical.html}<img data-canvas-v2-node-id="legacy-analysis-copy" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-screen-1" src="https://evidence.test/awin/1.png">`,
  };
  assert.deepEqual(validateCanvasV2EvidenceContinuity(legacy, upgraded, evidence), []);
});

test("a free-standing image cannot nominate itself as a canonical provenance source", () => {
  const forged = {
    html: '<main data-canvas-v2-node-id="canvas"><img data-canvas-v2-node-id="forged-source" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/1.png"></main>',
    css: "",
  };
  const empty = { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" };
  assert.match(validateCanvasV2EvidenceContinuity(empty, forged, [evidence[1]]).join(" "), /valid only for an original image inside its canonical flow/);
});

test("Northstar may add gaps and annotations without weakening the canonical flow", () => {
  const revised = document(`
    <img data-canvas-v2-node-id="flow-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/icon.png">
    <aside data-canvas-v2-node-id="friction-note">High-friction entry</aside>
    <img data-canvas-v2-node-id="flow-awin-screen-1" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/awin/1.png">
    <div data-canvas-v2-node-id="deliberate-gap"></div>
    <img data-canvas-v2-node-id="flow-awin-screen-2" data-canvas-v2-evidence-id="screen:awin-2" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="1" src="https://evidence.test/awin/2.png">
  `);
  assert.deepEqual(validateCanvasV2EvidenceContinuity(canonical, revised, evidence), []);
});

test("an analytical copy cannot substitute for a missing or reordered canonical screenshot", () => {
  const moved = document(`
    <img data-canvas-v2-node-id="flow-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/icon.png">
    <img data-canvas-v2-node-id="flow-awin-screen-2" data-canvas-v2-evidence-id="screen:awin-2" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="1" src="https://evidence.test/awin/2.png">
  `);
  moved.html += '<img data-canvas-v2-node-id="analysis-awin-1" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-screen-1" src="https://evidence.test/awin/1.png">';
  assert.match(validateCanvasV2EvidenceContinuity(canonical, moved, evidence).join(" "), /complete, ordered, and source-stable/);

  const reordered = document(`
    <img data-canvas-v2-node-id="flow-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/icon.png">
    <img data-canvas-v2-node-id="flow-awin-screen-2" data-canvas-v2-evidence-id="screen:awin-2" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="1" src="https://evidence.test/awin/2.png">
    <img data-canvas-v2-node-id="flow-awin-screen-1" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/awin/1.png">
  `);
  assert.match(validateCanvasV2EvidenceContinuity(canonical, reordered, evidence).join(" "), /complete, ordered|screen order/);
});

test("an explicit user delete may remove canonical screenshots without weakening model continuity", () => {
  const removedFirstScreen = document(`
    <img data-canvas-v2-node-id="flow-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/icon.png">
    <img data-canvas-v2-node-id="flow-awin-screen-2" data-canvas-v2-evidence-id="screen:awin-2" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="1" src="https://evidence.test/awin/2.png">
  `);
  assert.match(validateCanvasV2EvidenceContinuity(canonical, removedFirstScreen, evidence).join(" "), /must remain visible|complete, ordered/);
  assert.deepEqual(validateCanvasV2EvidenceContinuity(canonical, removedFirstScreen, evidence, { allowUserEvidenceRemoval: true }), []);

  const removedFlow = { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" };
  assert.deepEqual(validateCanvasV2EvidenceContinuity(canonical, removedFlow, evidence, { allowUserEvidenceRemoval: true }), []);

  const reorderedSubset = document(`
    <img data-canvas-v2-node-id="flow-awin-screen-2" data-canvas-v2-evidence-id="screen:awin-2" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="1" src="https://evidence.test/awin/2.png">
    <img data-canvas-v2-node-id="flow-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/icon.png">
  `);
  assert.match(validateCanvasV2EvidenceContinuity(canonical, reorderedSubset, evidence, { allowUserEvidenceRemoval: true }).join(" "), /ordered/);
});

test("every canonical flow requires complete contiguous screen indices", () => {
  const invalid = { ...canonical, html: canonical.html.replace('data-canvas-v2-flow-index="1"', 'data-canvas-v2-flow-index="4"') };
  const empty = { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" };
  assert.match(validateCanvasV2EvidenceContinuity(empty, invalid, evidence).join(" "), /indices must be complete and contiguous/);
});

test("analytical copies are freely composable but remain traceable to a canonical source", () => {
  const valid = { ...canonical, html: `${canonical.html}<section data-canvas-v2-node-id="analysis"><img data-canvas-v2-node-id="analysis-awin-role" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-screen-1" src="https://evidence.test/awin/1.png"></section>` };
  assert.deepEqual(validateCanvasV2EvidenceContinuity(canonical, valid, evidence), []);
  const untraceable = { ...valid, html: valid.html.replace(' data-canvas-v2-source-node-id="flow-awin-screen-1"', "") };
  assert.match(validateCanvasV2EvidenceContinuity(canonical, untraceable, evidence).join(" "), /must declare its canonical source node/);
});

test("the artifact rejects duplicate identities and unidentified images", () => {
  assert.match(validateCanvasV2ArtifactDocument({ html: '<main data-canvas-v2-node-id="same"><img data-canvas-v2-node-id="same" src="x"></main>', css: "" }).join(" "), /must be unique/);
  assert.match(validateCanvasV2ArtifactDocument({ html: '<main data-canvas-v2-node-id="canvas"><img src="x"></main>', css: "" }).join(" "), /Every image must have a unique stable node identity/);
});

function observation(overrides: Partial<CanvasV2RenderObservation["spatial"]["evidence"][number]> = {}): CanvasV2RenderObservation {
  const rendered = readCanvasV2CanonicalFlowManifests(canonical)[0].items.map((item) => ({
    evidenceId: item.evidenceId,
    nodeId: item.nodeId,
    role: "canonical" as const,
    bounds: { x: item.flowIndex === undefined ? 0 : 160 + item.flowIndex * 160, y: 120, width: 120, height: 240 },
    naturalWidth: 600,
    naturalHeight: 1200,
    objectFit: "contain",
    visible: true,
    clippingAncestorNodeIds: [],
    croppingRisk: false,
    aspectRatioDistorted: false,
    ...(item.nodeId === "flow-awin-screen-1" ? overrides : {}),
  }));
  return {
    schema: "canvas-v2.observation.v1",
    revisionId: "candidate",
    screenshotDataUrl: "data:image/png;base64,AA==",
    viewport: { width: 1680, height: 945, deviceScaleFactor: 1 },
    contentBounds: { x: 0, y: 0, width: 1680, height: 945 },
    runtimeErrors: [],
    missingEvidenceIds: [],
    spatial: { measuredNodeCount: 4, reportedNodeCount: 4, nodes: [], notableIntersections: [], contentOverflowNodeIds: [], evidence: rendered },
    capturedAt: "2026-08-12T12:00:00.000Z",
  };
}

test("rendered canonical evidence cannot silently commit cropped, clipped, distorted, or unloaded", () => {
  assert.deepEqual(validateCanvasV2RenderedEvidenceIntegrity(canonical, observation()), []);
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, observation({ croppingRisk: true })).join(" "), /cropping presentation/);
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, observation({ clippingAncestorNodeIds: ["flow-awin"] })).join(" "), /clipped by its layout/);
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, observation({ aspectRatioDistorted: true })).join(" "), /aspect ratio/);
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, observation({ naturalWidth: 0, visible: false })).join(" "), /not visibly rendered/);
});

test("rendered canonical screens stay on one horizontal rail and cannot visually overlap", () => {
  assert.deepEqual(validateCanvasV2RenderedEvidenceIntegrity(canonical, observation()), []);
  const reordered = observation();
  const first = reordered.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-1");
  const second = reordered.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-2");
  assert.ok(first && second);
  first.bounds.x = 420;
  second.bounds.x = 180;
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, reordered).join(" "), /one uninterrupted horizontal rail/);

  const overlapping = observation();
  const overlappingSecond = overlapping.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-2");
  assert.ok(overlappingSecond);
  overlappingSecond.bounds.x = 240;
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, overlapping).join(" "), /one uninterrupted horizontal rail/);

  const wrapped = observation();
  const wrappedSecond = wrapped.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-2");
  assert.ok(wrappedSecond);
  wrappedSecond.bounds = { ...wrappedSecond.bounds, x: 160, y: 390 };
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, wrapped).join(" "), /one uninterrupted horizontal rail/);
});

test("analysis screenshots may enlarge purposefully but can never become runaway full-screen slabs", () => {
  const dominant = observation();
  dominant.spatial.evidence.push({
    evidenceId: "screen:awin-1",
    nodeId: "analysis-awin-inspection",
    role: "analysis-copy",
    sourceNodeId: "flow-awin-screen-1",
    bounds: { x: 100, y: 100, width: 840, height: 1_680 },
    naturalWidth: 600,
    naturalHeight: 1_200,
    objectFit: "contain",
    visible: true,
    clippingAncestorNodeIds: [],
    croppingRisk: false,
    aspectRatioDistorted: false,
    sourceIsCanonicalScreen: true,
    canonicalPeerHeight: 240,
    scaleVsCanonicalHeight: 7,
    canvasWidthShare: 0.5,
    canvasHeightShare: 0.7,
    canvasAreaShare: 0.35,
    designRegionNodeId: "analysis",
    designRegionWidthShare: 0.48,
    designRegionHeightShare: 0.82,
    designRegionAreaShare: 0.39,
    annotationNodeIds: [],
    relationshipNodeIds: [],
  });
  assert.match(validateCanvasV2RenderedAnalysisEvidenceScale(dominant).join(" "), /may not dominate the composition/);

  dominant.spatial.evidence[dominant.spatial.evidence.length - 1] = {
    ...dominant.spatial.evidence[dominant.spatial.evidence.length - 1],
    visualRole: "friction-inspection",
    treatment: "magnified-evidence",
    annotationNodeIds: ["awin-friction-note"],
  };
  assert.match(
    validateCanvasV2RenderedAnalysisEvidenceScale(dominant).join(" "),
    /even when it has a declared analytical role or annotation/,
  );

  const boundedFocalInspection = observation();
  boundedFocalInspection.spatial.evidence.push({
    ...dominant.spatial.evidence[dominant.spatial.evidence.length - 1],
    nodeId: "analysis-awin-bounded-focal",
    bounds: { x: 100, y: 100, width: 288, height: 576 },
    scaleVsCanonicalHeight: 2.4,
    designRegionHeightShare: 0.54,
    designRegionAreaShare: 0.2,
    canvasHeightShare: 0.34,
  });
  assert.deepEqual(validateCanvasV2RenderedAnalysisEvidenceScale(boundedFocalInspection), []);

  boundedFocalInspection.spatial.evidence[boundedFocalInspection.spatial.evidence.length - 1] = {
    ...boundedFocalInspection.spatial.evidence[boundedFocalInspection.spatial.evidence.length - 1],
    visualRole: undefined,
    treatment: undefined,
    annotationNodeIds: [],
  };
  assert.match(
    validateCanvasV2RenderedAnalysisEvidenceScale(boundedFocalInspection).join(" "),
    /without a visibly linked annotation or relationship/,
  );

  const deliberatePeerScale = observation();
  deliberatePeerScale.spatial.evidence.push({
    ...dominant.spatial.evidence[dominant.spatial.evidence.length - 1],
    nodeId: "analysis-awin-peer",
    bounds: { x: 100, y: 100, width: 180, height: 360 },
    scaleVsCanonicalHeight: 1.5,
    designRegionHeightShare: 0.24,
    designRegionAreaShare: 0.08,
    canvasHeightShare: 0.18,
    visualRole: undefined,
    treatment: undefined,
    annotationNodeIds: [],
  });
  assert.deepEqual(validateCanvasV2RenderedAnalysisEvidenceScale(deliberatePeerScale), []);
});

test("authored design regions may grow but cannot clip information they introduce", () => {
  const rendered = observation();
  rendered.spatial.designRegions = [{
    nodeId: "analysis",
    bounds: { x: 20, y: 20, width: 900, height: 500 },
    canvasWidthShare: 0.54,
    canvasHeightShare: 0.53,
    canvasAreaShare: 0.29,
    centerXShare: 0.28,
    centerYShare: 0.29,
    edgeSpace: { left: 20, top: 20, right: 760, bottom: 425 },
    contentOverflowX: 240,
    contentOverflowY: 80,
    clipsOverflow: true,
  }];
  assert.match(validateCanvasV2RenderedDesignRegionContentIntegrity(rendered).join(" "), /Preserve every authored label/);
  rendered.spatial.designRegions[0] = { ...rendered.spatial.designRegions[0], clipsOverflow: false };
  assert.deepEqual(validateCanvasV2RenderedDesignRegionContentIntegrity(rendered), []);
  rendered.spatial.designRegions[0] = {
    ...rendered.spatial.designRegions[0],
    bounds: { ...rendered.spatial.designRegions[0].bounds, width: 8_880, height: 2_500 },
    contentOverflowX: 7_393,
  };
  assert.match(validateCanvasV2RenderedDesignRegionContentIntegrity(rendered).join(" "), /paints 7393 canvas units beyond its horizontal composition box.*hidden artboard.*runaway margins/);
});

test("authored island copy remains readable at whole-board canvas scale", () => {
  const rendered = observation();
  rendered.spatial.designRegions = [{
    nodeId: "analysis",
    bounds: { x: 192, y: 192, width: 2_400, height: 1_200 },
    canvasWidthShare: 0.2,
    canvasHeightShare: 0.15,
    canvasAreaShare: 0.03,
    centerXShare: 0.12,
    centerYShare: 0.1,
    edgeSpace: { left: 192, top: 192, right: 9_408, bottom: 6_608 },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  }];
  const spatialNode = (input: { nodeId: string; parentNodeId?: string; tagName: string; textPreview?: string; fontSize?: string; lineHeight?: string; textLineCount?: number }) => ({
    ...input,
    bounds: { x: 240, y: 240, width: 1_200, height: 120 },
    contentBox: { clientWidth: 1_200, clientHeight: 120, scrollWidth: 1_200, scrollHeight: 120 },
    layout: { display: "block", position: "static", zIndex: "auto", fontSize: input.fontSize, lineHeight: input.lineHeight, overflowX: "visible", overflowY: "visible" },
  });
  rendered.spatial.nodes = [
    spatialNode({ nodeId: "analysis", tagName: "section", textPreview: "Evidence ledger" }),
    spatialNode({ nodeId: "analysis-heading", parentNodeId: "analysis", tagName: "h2", textPreview: "What the evidence says", fontSize: "34px" }),
    spatialNode({ nodeId: "analysis-copy", parentNodeId: "analysis", tagName: "p", textPreview: "The narrow wedge still needs validation.", fontSize: "20px" }),
    spatialNode({ nodeId: "analysis-status", parentNodeId: "analysis", tagName: "small", textPreview: "Assumption", fontSize: "18px" }),
    spatialNode({ nodeId: "analysis-default-copy", parentNodeId: "analysis", tagName: "span", textPreview: "Awaiting evidence" }),
  ];
  assert.match(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /Sample only: analysis-heading=34px.*analysis-copy=20px.*analysis-status=18px.*analysis-default-copy=16px.*Repair all 4 undersized leaves in one scoped pass/);
  const typeFloorRepair = repairCanvasV2RenderedDesignRegionTypeFloors({ html: '<section data-canvas-v2-node-id="analysis"></section>', css: ".analysis { color: white; }" }, rendered);
  assert.match(typeFloorRepair.css, /canvas-v2-type-floor:analysis-heading:40[\s\S]*font-size: 40px !important/);
  assert.match(typeFloorRepair.css, /canvas-v2-type-floor:analysis-copy:28[\s\S]*font-size: 28px !important/);
  assert.match(typeFloorRepair.css, /canvas-v2-type-floor:analysis-status:24[\s\S]*font-size: 24px !important/);
  assert.equal(repairCanvasV2RenderedDesignRegionTypeFloors(typeFloorRepair, rendered), typeFloorRepair);
  rendered.spatial.nodes = rendered.spatial.nodes.map((node) => ({
    ...node,
    layout: {
      ...node.layout,
      fontSize: node.tagName === "h2" ? "48px" : node.tagName === "p" ? "32px" : node.tagName === "small" || node.tagName === "span" ? "24px" : node.layout.fontSize,
    },
  }));
  assert.deepEqual(validateCanvasV2RenderedDesignRegionLegibility(rendered), []);

  rendered.spatial.nodes = rendered.spatial.nodes.map((node) => node.nodeId === "analysis-heading" ? {
    ...node,
    layout: { ...node.layout, fontSize: "520px" },
  } : node);
  assert.match(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /analysis-heading=520px \(maximum 280px\).*navigation world is not permission to inflate typography/);

  rendered.spatial.nodes = rendered.spatial.nodes.map((node) => node.nodeId === "analysis-status" ? {
    ...node,
    textPreview: "OPEN QUESTION",
    textLineCount: 2,
  } : node);
  assert.match(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /analysis-status=\"OPEN QUESTION\" \(2 lines\).*one atomic reading unit.*white-space: nowrap/);

  rendered.spatial.nodes = rendered.spatial.nodes.map((node) => node.nodeId === "analysis-status" ? {
    ...node,
    textLineCount: 1,
  } : node);
  assert.doesNotMatch(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /short categorical label/);

  rendered.spatial.nodes = rendered.spatial.nodes.map((node) => node.nodeId === "analysis-heading" ? {
    ...node,
    textPreview: "ACTIVATION DECLINED",
    textLineCount: 2,
    layout: { ...node.layout, fontSize: "80px", lineHeight: "54px" },
  } : node);
  assert.match(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /visibly unsafe leading: analysis-heading=.*ACTIVATION DECLINED.*80px type on 54px leading/);

  rendered.spatial.nodes = rendered.spatial.nodes.map((node) => node.nodeId === "analysis-heading" ? {
    ...node,
    textLineCount: 2,
    layout: { ...node.layout, lineHeight: "72px" },
  } : node);
  assert.doesNotMatch(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /visibly unsafe leading/);

  rendered.spatial.nodes.push(spatialNode({
    nodeId: "diverge-prompt",
    parentNodeId: "analysis",
    tagName: "p",
    textPreview: "In silence first, name the people who might feel the sharpest problem and keep each possibility open.",
    fontSize: "34px",
    lineHeight: "46px",
    textLineCount: 18,
  }));
  assert.match(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /unreadable sliver columns: diverge-prompt=.*18 lines/);

  rendered.spatial.textCollisions = [{
    firstNodeId: "analysis-status",
    secondNodeId: "analysis-default-copy",
    intersection: { x: 400, y: 400, width: 18, height: 24 },
    firstCoverage: 0.12,
    secondCoverage: 0.1,
  }];
  assert.match(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /renders overlapping readable text.*OPEN QUESTION.*Awaiting evidence.*create a real gap/);

  rendered.spatial.designRegions.push({
    ...rendered.spatial.designRegions[0],
    nodeId: "comparison",
    bounds: { x: 2_800, y: 192, width: 2_400, height: 1_200 },
    centerXShare: 0.34,
    edgeSpace: { left: 2_800, top: 192, right: 6_800, bottom: 6_608 },
  });
  rendered.spatial.nodes.push(
    {
      ...spatialNode({ nodeId: "comparison", tagName: "section", textPreview: "Comparison field" }),
      bounds: { x: 2_800, y: 192, width: 2_400, height: 1_200 },
    },
    {
      ...spatialNode({ nodeId: "escaped-instruction", parentNodeId: "analysis", tagName: "p", textPreview: "Work silently first.", fontSize: "28px" }),
      bounds: { x: 2_500, y: 300, width: 520, height: 48 },
    },
    {
      ...spatialNode({ nodeId: "comparison-heading", parentNodeId: "comparison", tagName: "h2", textPreview: "Which segment earns our focus?", fontSize: "40px" }),
      bounds: { x: 2_900, y: 300, width: 720, height: 64 },
    },
  );
  rendered.spatial.textCollisions = [{
    firstNodeId: "escaped-instruction",
    secondNodeId: "comparison-heading",
    intersection: { x: 2_900, y: 300, width: 120, height: 48 },
    firstCoverage: 0.23,
    secondCoverage: 0.12,
  }];
  const crossIslandFailure = validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" ");
  assert.match(crossIslandFailure, /Authored design region analysis lets readable object escaped-instruction=.*escape its island.*comparison-heading=.*neighboring islands may never depend on overflow/);
  assert.doesNotMatch(crossIslandFailure, /Authored design region comparison lets/);

  rendered.spatial.nodes.push(spatialNode({ nodeId: "transition-label-notice", parentNodeId: "analysis", tagName: "text", textPreview: "NOTICE", fontSize: "24px" }));
  rendered.spatial.textCollisions = [{
    firstNodeId: "analysis-heading",
    secondNodeId: "transition-label-notice",
    intersection: { x: 420, y: 410, width: 60, height: 20 },
    firstCoverage: 0.08,
    secondCoverage: 0.5,
  }];
  assert.deepEqual(collidingCanvasV2OptionalRelationshipLabelNodeIds(rendered), ["transition-label-notice"]);
  assert.match(validateCanvasV2RenderedDesignRegionLegibility(rendered).join(" "), /transition-label-notice is optional relationship annotation.*remove that exact label entirely/);
});

test("a stage that claims direct sourcing cannot render as an empty evidence block", () => {
  const rendered = observation();
  rendered.spatial.designRegions = [{
    nodeId: "handoff-sequence",
    bounds: { x: 20, y: 20, width: 900, height: 500 },
    canvasWidthShare: 0.54,
    canvasHeightShare: 0.53,
    canvasAreaShare: 0.29,
    centerXShare: 0.28,
    centerYShare: 0.29,
    edgeSpace: { left: 20, top: 20, right: 760, bottom: 425 },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
    sourcedStageCount: 4,
    emptySourcedStageNodeIds: ["awin-profile-stage", "whop-identity-stage"],
  }];
  assert.match(validateCanvasV2RenderedDesignRegionContentIntegrity(rendered).join(" "), /no exact screenshot inside them/);
  rendered.spatial.designRegions[0] = { ...rendered.spatial.designRegions[0], emptySourcedStageNodeIds: [] };
  assert.deepEqual(validateCanvasV2RenderedDesignRegionContentIntegrity(rendered), []);
});

test("authored regions cannot drift into canonical lanes without an explicit evidence interleave", () => {
  const rendered = observation();
  rendered.spatial.designRegions = [{
    nodeId: "handoff-field",
    bounds: { x: 400, y: 80, width: 900, height: 500 },
    canvasWidthShare: 0.54,
    canvasHeightShare: 0.53,
    canvasAreaShare: 0.29,
    centerXShare: 0.5,
    centerYShare: 0.35,
    edgeSpace: { left: 400, top: 80, right: 380, bottom: 365 },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
    canonicalLaneOverlaps: [{
      laneNodeId: "flow-awin",
      intersection: { x: 500, y: 500, width: 700, height: 80 },
      regionCoverage: 0.124,
      laneCoverage: 0.03,
    }],
  }];
  assert.match(validateCanvasV2RenderedDesignRegionTerritoryIntegrity(rendered).join(" "), /without declaring an intentional evidence interleave/);
  rendered.spatial.designRegions[0] = { ...rendered.spatial.designRegions[0], evidenceInterleave: "annotated stage handoff" };
  assert.match(validateCanvasV2RenderedDesignRegionTerritoryIntegrity(rendered).join(" "), /physically covers canonical screenshot evidence/);
  rendered.spatial.designRegions[0] = {
    ...rendered.spatial.designRegions[0],
    bounds: { x: 500, y: 80, width: 900, height: 500 },
    evidenceInterleave: "annotated stage handoff in a deliberate gap after the captured screenshots",
  };
  assert.deepEqual(validateCanvasV2RenderedDesignRegionTerritoryIntegrity(rendered), []);
});

test("a planning zone never overrides evidence-relative rendered truth", () => {
  const rendered = observation();
  rendered.spatial.designRegions = [{
    nodeId: "friction-island",
    placementMode: "evidence-relative-island",
    targetZoneId: "top-right",
    bounds: { x: 600, y: 40, width: 420, height: 260 },
    canvasWidthShare: 0.25,
    canvasHeightShare: 0.28,
    canvasAreaShare: 0.07,
    centerXShare: 0.48,
    centerYShare: 0.18,
    edgeSpace: { left: 600, top: 40, right: 660, bottom: 645 },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  }];
  rendered.spatial.authoredSurface = {
    canvasBounds: rendered.contentBounds,
    authoredAreaShare: 0.07,
    readingOrder: ["friction-island"],
    zones: [{
      id: "top-right",
      bounds: { x: 1120, y: 0, width: 560, height: 315 },
      designRegionNodeIds: [],
      canonicalLaneNodeIds: [],
      occupiedAreaShare: 0.2,
      availableAreaShare: 0.8,
    }],
  };
  assert.deepEqual(validateCanvasV2RenderedDesignRegionTerritoryIntegrity(rendered), []);
  rendered.spatial.designRegions[0] = {
    ...rendered.spatial.designRegions[0],
    bounds: { x: 1210, y: 40, width: 360, height: 260 },
    centerXShare: 0.83,
    edgeSpace: { left: 1210, top: 40, right: 110, bottom: 645 },
  };
  assert.deepEqual(validateCanvasV2RenderedDesignRegionTerritoryIntegrity(rendered), []);
});

test("a screenshot-led comparison keeps multiple inspectable screens without forcing relationship geometry", () => {
  const instruction = "Build a comparison and choose representative screenshots";
  const rendered = observation();
  // An intermediate stage with no explicit story-role ownership must not be
  // mistaken for the final comparison. The whole-board completion gate below
  // still proves that the finished composition contains its witnesses.
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(rendered, instruction), []);
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(rendered, instruction, { storyRole: "title" }), []);
  assert.match(validateCanvasV2RenderedComparisonCommunication(rendered, instruction, { storyRole: "comparison" }).join(" "), /at least two visible canonical screen copies/);
  assert.match(validateCanvasV2RenderedComparisonCommunication(rendered, instruction, { finalWholeBoard: true }).join(" "), /at least two visible canonical screen copies/);

  const analysisScreen = (nodeId: string, sourceNodeId: string, annotationNodeIds: string[] = []) => ({
    ...rendered.spatial.evidence.find((item) => item.nodeId === sourceNodeId)!,
    nodeId,
    role: "analysis-copy" as const,
    sourceNodeId,
    sourceIsCanonicalScreen: true,
    canonicalPeerHeight: 240,
    scaleVsCanonicalHeight: 1,
    designRegionNodeId: "analysis",
    annotationNodeIds,
    relationshipNodeIds: [],
  });
  rendered.spatial.evidence.push(
    analysisScreen("analysis-awin-1", "flow-awin-screen-1"),
    analysisScreen("analysis-awin-2", "flow-awin-screen-2"),
  );
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(rendered, instruction), []);

  rendered.spatial.evidence[rendered.spatial.evidence.length - 1] = {
    ...rendered.spatial.evidence[rendered.spatial.evidence.length - 1],
    annotationNodeIds: ["analysis-awin-2-note"],
  };
  rendered.spatial.authoredAnnotations = [{
    nodeId: "analysis-awin-2-note",
    targetNodeIds: ["analysis-awin-2"],
    bounds: { x: 480, y: 500, width: 180, height: 60 },
    textPreview: "The verification handoff introduces the visible friction break.",
  }];
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(rendered, instruction), []);
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(observation(), "Show the complete onboarding evidence"), []);
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(
    observation(),
    "Compare a fast pilot with a polished launch and create a separate independently editable implementation path.",
  ), []);
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(
    observation(),
    "Build the comparison without screenshots or account research.",
  ), []);
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(
    observation(),
    "Use representative screenshots in the routing interpretation.\n\nAuthoritative user request (preserve exact product and journey scope): Compare a fast pilot with a polished launch.",
  ), []);
});

test("a declared comparison axis cannot collapse every screenshot into one leading lane", () => {
  const rendered = observation();
  rendered.spatial.designRegions = [{
    nodeId: "comparison",
    visualRole: "comparison-axis",
    bounds: { x: 100, y: 100, width: 2_400, height: 900 },
    canvasWidthShare: 0.8,
    canvasHeightShare: 0.5,
    canvasAreaShare: 0.4,
    centerXShare: 0.5,
    centerYShare: 0.3,
    edgeSpace: { left: 100, top: 100, right: 100, bottom: 500 },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  }];
  const canonicalScreen = rendered.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-1")!;
  const witnesses = Array.from({ length: 6 }, (_, index) => ({
    ...canonicalScreen,
    evidenceId: `screen:witness-${index}`,
    nodeId: `axis-witness-${index}`,
    role: "analysis-copy" as const,
    sourceNodeId: "flow-awin-screen-1",
    sourceIsCanonicalScreen: true,
    bounds: { x: 140 + index * 100, y: 360, width: 80, height: 160 },
    designRegionNodeId: "comparison",
    visualRole: "comparison-axis",
  }));
  rendered.spatial.evidence.push(...witnesses);
  assert.match(validateCanvasV2RenderedComparisonCommunication(rendered, "Compare the journeys with representative screenshots").join(" "), /collapse into only.*Bind each witness/);
  for (let index = 0; index < witnesses.length; index += 1) witnesses[index].bounds.x = 140 + index * 390;
  assert.deepEqual(validateCanvasV2RenderedComparisonCommunication(rendered, "Compare the journeys with representative screenshots"), []);
});

test("chosen relationship geometry must remain attached after later recomposition", () => {
  const rendered = observation();
  rendered.spatial.authoredRelationships = [{
    nodeId: "friction-bridge",
    tagName: "path",
    sourceNodeIds: ["analysis-awin"],
    targetNodeIds: ["analysis-whop"],
    bounds: { x: 100, y: 120, width: 500, height: 80 },
    sourceAnchorNodeId: "analysis-awin",
    targetAnchorNodeId: "analysis-whop",
    sourceAnchorDistance: 74,
    targetAnchorDistance: 4,
    sourceAnchorTolerance: 18,
    targetAnchorTolerance: 18,
    geometryStartPoint: { x: 90, y: 120 },
    geometryEndPoint: { x: 600, y: 160 },
    sourceAnchorSuggestedPoint: { x: 100, y: 120 },
  }];
  assert.match(validateCanvasV2RenderedRelationshipGeometry(rendered).join(" "), /detached from source analysis-awin.*attach it at approximately \(100\.0, 120\.0\)/);
  assert.deepEqual(invalidCanvasV2RenderedRelationshipNodeIds(rendered), ["friction-bridge"]);

  rendered.spatial.authoredRelationships[0] = {
    ...rendered.spatial.authoredRelationships[0],
    sourceAnchorDistance: 3,
  };
  assert.deepEqual(validateCanvasV2RenderedRelationshipGeometry(rendered), []);
  assert.deepEqual(invalidCanvasV2RenderedRelationshipNodeIds(rendered), []);

  rendered.spatial.authoredRelationships[0] = {
    ...rendered.spatial.authoredRelationships[0],
    targetAnchorInteriorDepth: 96,
  };
  assert.match(validateCanvasV2RenderedRelationshipGeometry(rendered).join(" "), /enters the readable interior of target analysis-whop/);
  assert.deepEqual(invalidCanvasV2RenderedRelationshipNodeIds(rendered), ["friction-bridge"]);

  rendered.spatial.authoredRelationships[0] = {
    ...rendered.spatial.authoredRelationships[0],
    targetAnchorInteriorDepth: 0,
    missingTargetNodeIds: ["analysis-whop"],
  };
  assert.match(validateCanvasV2RenderedRelationshipGeometry(rendered).join(" "), /references missing target nodes/);
  assert.deepEqual(invalidCanvasV2RenderedRelationshipNodeIds(rendered), ["friction-bridge"]);
});

test("bounded model context judges visual occupancy against the local authoring surface, not the navigation world", () => {
  const rendered = observation();
  rendered.contentBounds = { x: 0, y: 0, width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height };
  rendered.spatial.designRegions = [{
    nodeId: "analysis",
    islandId: "analysis",
    storyRole: "analysis",
    bounds: { x: CANVAS_V2_WORKSPACE.aiAuthoringOriginX, y: CANVAS_V2_WORKSPACE.aiAuthoringOriginY, width: 4_440, height: 4_000 },
    canvasWidthShare: 0.034,
    canvasHeightShare: 0.031,
    canvasAreaShare: 0.001,
    centerXShare: 0.5,
    centerYShare: 0.5,
    edgeSpace: { left: 0, top: 0, right: 0, bottom: 0 },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  }];
  rendered.spatial.authoredSurface = {
    canvasBounds: rendered.contentBounds,
    authoredAreaShare: 0.001,
    readingOrder: ["analysis"],
    zones: [],
  };
  const context = buildCanvasV2BoundedModelContext({
    schema: "canvas-v2.artifact.v1",
    id: "revision",
    state: "committed",
    document: canonical,
    evidence,
    createdAt: "2026-08-13T12:00:00.000Z",
  }, rendered);
  assert.equal(context.render.spatial.authoredSurface.authoredAreaShare, 0.25);
  assert.equal(context.render.spatial.authoredSurface.designRegions[0]?.canvasAreaShare, 0.25);
  assert.match(context.workspace.contract, /normalized to aiAuthoringBounds/);
});

test("islands preserve distinct readable territories and optional title integrity", () => {
  const rendered = observation();
  const region = (nodeId: string, storyRole: "title" | "comparison", x: number, y: number, width: number, height: number) => ({
    nodeId,
    islandId: nodeId,
    storyRole,
    placementMode: "evidence-relative-island" as const,
    targetZoneId: storyRole === "title" ? "top-left" as const : "middle-right" as const,
    bounds: { x, y, width, height },
    canvasWidthShare: width / 1680,
    canvasHeightShare: height / 945,
    canvasAreaShare: width * height / (1680 * 945),
    centerXShare: (x + width / 2) / 1680,
    centerYShare: (y + height / 2) / 945,
    edgeSpace: { left: x, top: y, right: 1680 - x - width, bottom: 945 - y - height },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  });
  rendered.spatial.designRegions = [
    region("title-island", "title", 192, 192, 1_296, 180),
    region("comparison-island", "comparison", 920, 420, 560, 320),
  ];
  rendered.spatial.authoredSurface = {
    canvasBounds: rendered.contentBounds,
    authoredAreaShare: 0.18,
    readingOrder: ["title-island", "comparison-island"],
    zones: [],
  };
  assert.deepEqual(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered), []);

  rendered.spatial.designRegions[0] = {
    ...rendered.spatial.designRegions[0],
    targetZoneId: undefined,
  };
  assert.deepEqual(
    validateCanvasV2RenderedIslandNarrativeIntegrity(rendered),
    [],
    "rendered title geometry remains authoritative when an optional planning zone is absent",
  );

  rendered.spatial.designRegions[1] = region("comparison-island", "comparison", 1_090, 420, 560, 320);
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /192px composition safe area/);

  rendered.spatial.designRegions[1] = region("comparison-island", "comparison", 360, 110, 560, 360);
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /materially overlap/);

  rendered.spatial.designRegions = [
    region("title-island", "title", 192, 192, 480, 180),
    region("comparison-island", "comparison", 920, 420, 560, 320),
  ];
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /too narrow to establish a readable narrative opening/);

  rendered.spatial.designRegions = [region("comparison-island", "comparison", 920, 360, 560, 360)];
  assert.deepEqual(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered), []);

  rendered.spatial.designRegions = [
    region("title-one", "title", 192, 192, 800, 180),
    region("title-two", "title", 1_280, 192, 800, 180),
  ];
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /at most one title-and-description island/);
});

test("native world-space titles remain readable and begin the authored story", () => {
  const rendered = observation();
  const worldWidth = CANVAS_V2_WORKSPACE.width;
  const worldHeight = CANVAS_V2_WORKSPACE.height;
  const originX = CANVAS_V2_WORKSPACE.aiAuthoringOriginX;
  const originY = CANVAS_V2_WORKSPACE.aiAuthoringOriginY;
  const region = (nodeId: string, storyRole: "title" | "comparison", x: number, y: number, width: number, height: number) => ({
    nodeId,
    islandId: nodeId,
    storyRole,
    placementMode: "evidence-relative-island" as const,
    bounds: { x, y, width, height },
    canvasWidthShare: width / worldWidth,
    canvasHeightShare: height / worldHeight,
    canvasAreaShare: width * height / (worldWidth * worldHeight),
    centerXShare: (x + width / 2) / worldWidth,
    centerYShare: (y + height / 2) / worldHeight,
    edgeSpace: { left: x, top: y, right: worldWidth - x - width, bottom: worldHeight - y - height },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  });
  rendered.contentBounds = { x: 0, y: 0, width: worldWidth, height: worldHeight };
  rendered.spatial.evidence = rendered.spatial.evidence.map((item, index) => ({
    ...item,
    bounds: { x: originX + 280 + index * 180, y: originY + 1_400, width: 120, height: 240 },
  }));
  rendered.spatial.designRegions = [
    region("title-island", "title", originX + 580, originY, 1_600, 360),
    region("comparison-island", "comparison", originX + 2_580, originY + 1_100, 1_500, 920),
  ];
  rendered.spatial.authoredSurface = {
    canvasBounds: rendered.contentBounds,
    authoredAreaShare: 0.02,
    readingOrder: ["title-island", "comparison-island"],
    canonicalLaneBounds: { x: originX + 280, y: originY + 1_400, width: 480, height: 240 },
    zones: [],
  };
  assert.deepEqual(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered), []);

  rendered.spatial.designRegions[1] = region(
    "comparison-island",
    "comparison",
    originX + 2_580,
    originY + 1_100,
    1_500,
    CANVAS_V2_WORKSPACE.aiAuthoringHeight + 20,
  );
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /exceeds the local 8880 × 8000 composition footprint/);
  rendered.spatial.designRegions[1] = region("comparison-island", "comparison", originX + 2_580, originY + 1_100, 1_500, 920);

  rendered.spatial.designRegions[0] = region("title-island", "title", 0, originY, 1_600, 360);
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /composition safe area/);

  rendered.spatial.designRegions[0] = region("title-island", "title", originX + 200, originY + 1_320, 1_600, 360);
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /overlaps grounded evidence/);

  rendered.spatial.designRegions = [
    region("title-island", "title", originX + 580, originY, 1_600, 360),
    region("comparison-island", "comparison", originX + 2_580, originY + 1_100, 1_500, 920),
  ];
  rendered.spatial.authoredSurface.readingOrder = ["comparison-island", "title-island"];
  const originFailures = validateCanvasV2RenderedIslandNarrativeIntegrity(rendered);
  assert.match(originFailures.join(" "), /must begin the authored reading order/);
  assert.equal(canvasV2LocalIntegrityRepairTarget(rendered.spatial.designRegions, originFailures), undefined);

  rendered.spatial.authoredSurface.readingOrder = ["title-island", "comparison-island"];
  rendered.spatial.designRegions[1] = region("comparison-island", "comparison", originX + 2_580, originY - 480, 1_500, 920);
  assert.match(validateCanvasV2RenderedIslandNarrativeIntegrity(rendered).join(" "), /must remain the first spatial chapter/);
});

test("ordinary authored chapters stay in one close narrative footprint", () => {
  const rendered = observation();
  const worldWidth = CANVAS_V2_WORKSPACE.width;
  const worldHeight = CANVAS_V2_WORKSPACE.height;
  const originX = CANVAS_V2_WORKSPACE.aiAuthoringOriginX;
  const originY = CANVAS_V2_WORKSPACE.aiAuthoringOriginY;
  const region = (nodeId: string, storyRole: "title" | "comparison", x: number, y: number, width: number, height: number) => ({
    nodeId,
    islandId: nodeId,
    storyRole,
    placementMode: "evidence-relative-island" as const,
    bounds: { x, y, width, height },
    canvasWidthShare: width / worldWidth,
    canvasHeightShare: height / worldHeight,
    canvasAreaShare: width * height / (worldWidth * worldHeight),
    centerXShare: (x + width / 2) / worldWidth,
    centerYShare: (y + height / 2) / worldHeight,
    edgeSpace: { left: x, top: y, right: worldWidth - x - width, bottom: worldHeight - y - height },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  });
  rendered.contentBounds = { x: 0, y: 0, width: worldWidth, height: worldHeight };
  rendered.spatial.designRegions = [
    region("title-island", "title", originX, originY, 1_600, 420),
    region("diverge-island", "comparison", originX, originY + 720, 2_200, 1_100),
    region("challenge-island", "comparison", originX + 7_200, originY + 720, 1_400, 1_100),
  ];
  rendered.spatial.authoredSurface = {
    canvasBounds: rendered.contentBounds,
    authoredAreaShare: 0.02,
    readingOrder: ["title-island", "diverge-island", "challenge-island"],
    zones: [],
  };

  rendered.spatial.designRegions = [
    region("title-island", "title", originX, originY, 1_600, 420),
    region("diverge-island", "comparison", originX, originY + 720, 2_200, 1_100),
    region("challenge-island", "comparison", originX, originY + 2_100, 2_200, 2_309),
  ];
  assert.doesNotMatch(
    validateCanvasV2RenderedIslandNarrativeIntegrity(rendered, "Design a 60-minute founder workshop.").join(" "),
    /compact narrative envelope/,
    "a close three-island narrative must not fail because fractional layout lands a few pixels beyond an old fixed-height cliff",
  );

  rendered.spatial.designRegions = [
    {
      ...region("title-island", "title", originX, originY, 2_200, 1_800),
      contentBounds: { x: originX, y: originY, width: 2_200, height: 520 },
    },
    {
      ...region("challenge-island", "comparison", originX, originY + 2_080, 2_200, 1_100),
      contentBounds: { x: originX, y: originY + 2_080, width: 2_200, height: 760 },
    },
  ];
  rendered.spatial.authoredSurface.readingOrder = ["title-island", "challenge-island"];
  assert.match(
    validateCanvasV2RenderedIslandNarrativeIntegrity(rendered, "Design a launch decision canvas.").join(" "),
    /meaningful content.*premium visible proximity/,
    "adjacent root boxes cannot conceal a page-sized visual gulf between their actual reading units",
  );

  rendered.spatial.authoredSurface.canonicalLaneBounds = {
    x: originX,
    y: originY + 720,
    width: 2_200,
    height: 900,
  };
  assert.doesNotMatch(
    validateCanvasV2RenderedIslandNarrativeIntegrity(rendered, "Compare the captured journeys.").join(" "),
    /meaningful content.*premium visible proximity/,
    "a canonical evidence chapter occupying the space between authored islands is story, not dead space",
  );
  rendered.spatial.designRegions[1] = {
    ...region("challenge-island", "comparison", originX, originY + 3_200, 2_200, 1_100),
    contentBounds: { x: originX, y: originY + 3_200, width: 2_200, height: 760 },
  };
  assert.doesNotMatch(
    validateCanvasV2RenderedIslandNarrativeIntegrity(rendered, "Compare the captured journeys.").join(" "),
    /meaningful content.*premium visible proximity/,
    "an analytical island below the complete evidence atlas follows the title through that intervening source chapter rather than owing the title a direct gutter",
  );
  rendered.spatial.designRegions[1] = {
    ...region("challenge-island", "comparison", originX + 4_600, originY + 1_940, 2_200, 1_100),
    territoryRelation: "below",
    placementMode: "evidence-relative-island",
    contentBounds: { x: originX + 4_600, y: originY + 1_940, width: 2_200, height: 760 },
  };
  assert.doesNotMatch(
    validateCanvasV2RenderedIslandNarrativeIntegrity(rendered, "Compare the captured journeys.").join(" "),
    /meaningful content.*premium visible proximity/,
    "an explicitly below-evidence chapter is adjacent to the atlas even when its two-dimensional placement is not directly aligned with the title",
  );
  delete rendered.spatial.authoredSurface.canonicalLaneBounds;

  rendered.spatial.designRegions = [
    region("title-island", "title", originX, originY, 1_600, 420),
    region("diverge-island", "comparison", originX, originY + 720, 2_200, 1_100),
    region("challenge-island", "comparison", originX + 7_200, originY + 720, 1_400, 1_100),
  ];

  const failures = validateCanvasV2RenderedIslandNarrativeIntegrity(rendered, "Design a 60-minute founder workshop.").join(" ");
  assert.match(failures, /visible proximity/);
  assert.deepEqual(
    validateCanvasV2RenderedIslandNarrativeIntegrity(rendered, "Create an expansive panoramic workshop wall across the canvas."),
    [],
    "an explicitly expansive user brief may deliberately use the wider world",
  );
});

test("bounded model context exposes factual analysis-copy geometry and authored relationships", () => {
  const rendered = observation();
  rendered.spatial.evidence.push({
    ...rendered.spatial.evidence[1],
    nodeId: "analysis-awin-inspection",
    role: "analysis-copy",
    sourceNodeId: "flow-awin-screen-1",
    sourceIsCanonicalScreen: true,
    canonicalPeerHeight: 240,
    scaleVsCanonicalHeight: 3.25,
    designRegionNodeId: "analysis",
    designRegionHeightShare: 0.6,
    designRegionAreaShare: 0.22,
    canvasHeightShare: 0.4,
    annotationNodeIds: ["analysis-note"],
    relationshipNodeIds: ["analysis-curve"],
  });
  rendered.spatial.authoredAnnotations = [{ nodeId: "analysis-note", targetNodeIds: ["analysis-awin-inspection"], bounds: { x: 20, y: 20, width: 120, height: 40 }, textPreview: "Friction" }];
  rendered.spatial.authoredRelationships = [{ nodeId: "analysis-curve", tagName: "path", sourceNodeIds: ["analysis-awin-inspection"], targetNodeIds: ["analysis-whop-inspection"], bounds: { x: 100, y: 120, width: 320, height: 80 }, visualRole: "friction-bridge", sourceAnchorDistance: 2, targetAnchorDistance: 4, sourceAnchorTolerance: 18, targetAnchorTolerance: 18 }];
  const context = buildCanvasV2BoundedModelContext({
    schema: "canvas-v2.artifact.v1",
    id: "revision",
    state: "committed",
    document: canonical,
    evidence,
    createdAt: "2026-08-13T12:00:00.000Z",
  }, rendered);
  assert.equal(context.render.spatial.analysisEvidenceGeometry[0]?.scaleVsCanonicalHeight, 3.25);
  assert.deepEqual(context.render.spatial.authoredSurface, {
    canvasBounds: rendered.contentBounds,
    authoredAreaShare: 0,
    readingOrder: [],
    zones: [],
    designRegions: [],
  });
  assert.equal(context.render.spatial.analysisEvidenceGeometry[0]?.annotationNodeIds?.[0], "analysis-note");
  assert.equal(context.render.spatial.authoredRelationships[0]?.visualRole, "friction-bridge");
  assert.equal(context.render.spatial.authoredRelationships[0]?.sourceAnchorDistance, 2);
});

test("authored complete-flow counts cannot drift from grounded evidence", () => {
  const grounded = [
    { id: "screen:awin-1", url: "https://evidence.test/awin/1.png", label: "Awin screen 1", app: "Awin" },
    { id: "screen:awin-2", url: "https://evidence.test/awin/2.png", label: "Awin screen 2", app: "Awin" },
  ];
  assert.deepEqual(validateCanvasV2ClaimedCanonicalFlowCounts({
    ...canonical,
    html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="count">Awin · 2 screens</p></main>'),
  }, grounded), []);
  assert.match(validateCanvasV2ClaimedCanonicalFlowCounts({
    ...canonical,
    html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="count">Awin · 3 screens</p></main>'),
  }, grounded).join(" "), /2 screens, not 3/);
  assert.match(validateCanvasV2ClaimedCanonicalFlowCounts({
    ...canonical,
    html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="count">Awin has a 3-screen journey</p></main>'),
  }, grounded).join(" "), /2 screens, not 3/);
  assert.match(validateCanvasV2ClaimedCanonicalFlowCounts({
    ...canonical,
    html: canonical.html.replace("</main>", '<section data-canvas-v2-node-id="count"><h2>Awin</h2><p>Designed for professional creators and publishers requiring deep brand affiliation, multi-platform authorization, banking verification, and rigorous compliance review.</p><strong>Length: 3 partner-focused screens</strong></section></main>'),
  }, grounded).join(" "), /2 screens, not 3/);
  assert.deepEqual(validateCanvasV2ClaimedCanonicalFlowCounts({
    ...canonical,
    html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="count">Awin has a 2-step journey</p></main>'),
  }, grounded), []);
});

test("the compiler corrects swapped canonical screen totals without rewriting other authored numbers", () => {
  const grounded = [
    { id: "screen:awin-1", url: "https://evidence.test/awin/1.png", label: "Awin screen 1", app: "Awin" },
    { id: "screen:awin-2", url: "https://evidence.test/awin/2.png", label: "Awin screen 2", app: "Awin" },
  ];
  const drifted = {
    ...canonical,
    html: canonical.html.replace("</main>", '<section data-canvas-v2-node-id="count"><h2>Awin</h2><p>Length: <strong>47 screens</strong>; interpretation: 3 strategic phases.</p></section></main>'),
  };
  const normalized = normalizeCanvasV2ClaimedCanonicalFlowCounts(drifted, grounded);
  assert.match(normalized.html, /<strong>2 screens<\/strong>/);
  assert.match(normalized.html, /3 strategic phases/);
  assert.deepEqual(validateCanvasV2ClaimedCanonicalFlowCounts(normalized, grounded), []);
});

test("authored app identity uses the exact grounded icon instead of a proxy mark", () => {
  const withoutIdentity = {
    ...canonical,
    html: canonical.html.replace("</main>", '<section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region><h2>Awin onboarding</h2><span data-canvas-v2-node-id="proxy">A</span></section></main>'),
  };
  assert.match(validateCanvasV2GroundedAppIdentityUsage(withoutIdentity, evidence).join(" "), /Copy icon:awin/);
  const groundedIdentity = {
    ...withoutIdentity,
    html: withoutIdentity.html.replace('<span data-canvas-v2-node-id="proxy">A</span>', '<img data-canvas-v2-node-id="analysis-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-icon" src="https://evidence.test/awin/icon.png">'),
  };
  assert.deepEqual(validateCanvasV2GroundedAppIdentityUsage(groundedIdentity, evidence), []);
});

test("an explicit screenshot request finishes with canonical screens promoted into analysis", () => {
  const withoutScreen = {
    ...canonical,
    html: canonical.html.replace("</main>", '<section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region><h2>Awin comparison</h2></section></main>'),
  };
  assert.match(validateCanvasV2RequestedAnalysisEvidenceUsage(withoutScreen, evidence, "Choose representative Awin screenshots").join(" "), /does not promote a canonical screen/);
  const withScreen = {
    ...withoutScreen,
    html: withoutScreen.html.replace("</section></main>", '<img data-canvas-v2-node-id="analysis-awin-screen" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-0" src="https://evidence.test/awin/1.png"></section></main>'),
  };
  assert.deepEqual(validateCanvasV2RequestedAnalysisEvidenceUsage(withScreen, evidence, "Choose representative Awin screenshots"), []);
});

test("later visual refinement cannot silently erase promoted evidence", () => {
  const withCopies = {
    ...canonical,
    html: canonical.html.replace("</main>", '<section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region><h2>Awin comparison</h2><img data-canvas-v2-node-id="analysis-awin-icon" data-canvas-v2-evidence-id="icon:awin" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-icon" src="https://evidence.test/awin/icon.png"><img data-canvas-v2-node-id="analysis-awin-screen" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-screen-1" src="https://evidence.test/awin/1.png"></section></main>'),
  };
  const erased = {
    ...canonical,
    html: canonical.html.replace("</main>", '<section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region><h2>Awin comparison</h2></section></main>'),
  };
  const failures = validateCanvasV2AnalysisEvidenceContinuity(withCopies, erased, evidence, "Choose representative Awin screenshots").join(" ");
  assert.match(failures, /removed Awin's grounded app identity/);
  assert.match(failures, /removed every representative Awin screen/);
  assert.deepEqual(validateCanvasV2AnalysisEvidenceContinuity(withCopies, withCopies, evidence, "Choose representative Awin screenshots"), []);
});

test("visual-director evidence selections must be materially authored", () => {
  assert.match(validateCanvasV2SelectedAnalysisEvidence(canonical, ["screen:awin-1"]).join(" "), /does not contain it as an analysis copy/);
  const withCopy = {
    ...canonical,
    html: canonical.html.replace("</main>", '<section data-canvas-v2-node-id="analysis"><img data-canvas-v2-node-id="analysis-awin-screen" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="flow-awin-screen-1" src="https://evidence.test/awin/1.png"></section></main>'),
  };
  assert.deepEqual(validateCanvasV2SelectedAnalysisEvidence(withCopy, ["screen:awin-1"]), []);
});

test("invented quantitative precision must remain visibly hypothetical", () => {
  const unsupported = { ...canonical, html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="metric">Identity verification drop-off: 18%</p></main>') };
  assert.match(validateCanvasV2QuantitativeClaimLabels(unsupported, evidence, "Compare onboarding" ).join(" "), /Unsupported quantitative precision 18%/);
  const labeled = { ...canonical, html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="metric">Illustrative hypothesis · Identity verification drop-off: 18%</p></main>') };
  assert.deepEqual(validateCanvasV2QuantitativeClaimLabels(labeled, evidence, "Compare onboarding"), []);
  const unsupportedFraction = { ...canonical, html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="axis">Awin friction allocation: 35/47</p></main>') };
  assert.match(validateCanvasV2QuantitativeClaimLabels(unsupportedFraction, evidence, "Compare onboarding").join(" "), /Unsupported quantitative precision 35\/47/);
  const labeledFraction = { ...canonical, html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="axis">Illustrative estimate · Awin friction allocation: 35 / 47</p></main>') };
  assert.deepEqual(validateCanvasV2QuantitativeClaimLabels(labeledFraction, evidence, "Compare onboarding"), []);
  const labeledSiblingFraction = { ...canonical, html: canonical.html.replace("</main>", `<section data-canvas-v2-node-id="rail"><p data-canvas-v2-node-id="qualifier">Illustrative position</p><p data-canvas-v2-node-id="witness">${"Observed witness context ".repeat(6)}3/47</p></section></main>`) };
  assert.deepEqual(validateCanvasV2QuantitativeClaimLabels(labeledSiblingFraction, evidence, "Compare onboarding"), []);
  const editorialCounter = { ...canonical, html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="counter">01/04 · observed stage</p></main>') };
  assert.deepEqual(validateCanvasV2QuantitativeClaimLabels(editorialCounter, evidence, "Compare onboarding"), []);

  const suppliedNaturalLanguage = { ...canonical, html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="pilot">Observed pilot activation: 5/6 versus 3/6.</p></main>') };
  assert.deepEqual(
    validateCanvasV2QuantitativeClaimLabels(suppliedNaturalLanguage, evidence, "The human supplied activation of 5 of 6 versus 3 of 6."),
    [],
    "natural-language counts and typeset fractions are the same supplied fact",
  );

  const decisionThreshold = { ...canonical, html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="gate">Decision gate · PASS if at least 3/3 teams accept the paid offer; FAIL at 2/3 or fewer.</p></main>') };
  assert.deepEqual(
    validateCanvasV2QuantitativeClaimLabels(decisionThreshold, evidence, "Design a clear pass/fail decision gate."),
    [],
    "a visibly proposed threshold is a decision rule, not a fabricated observation",
  );
});
