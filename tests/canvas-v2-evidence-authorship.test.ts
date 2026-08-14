import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCanvasV2AnalysisEvidenceContinuity,
  validateCanvasV2ArtifactDocument,
  validateCanvasV2ClaimedCanonicalFlowCounts,
  validateCanvasV2EvidenceContinuity,
  validateCanvasV2GroundedAppIdentityUsage,
  validateCanvasV2QuantitativeClaimLabels,
  validateCanvasV2RequestedAnalysisEvidenceUsage,
  validateCanvasV2SelectedAnalysisEvidence,
} from "../lib/canvas-v2/artifact-safety";
import {
  readCanvasV2CanonicalFlowManifests,
  resolveCanvasV2EvidenceRole,
  validateCanvasV2RenderedAnalysisEvidenceScale,
  validateCanvasV2RenderedComparisonCommunication,
  validateCanvasV2RenderedEvidenceIntegrity,
  validateCanvasV2RenderedRelationshipGeometry,
} from "../lib/canvas-v2/evidence-authorship";
import { buildCanvasV2BoundedModelContext } from "../lib/canvas-v2/model-context";
import type { CanvasV2ArtifactDocument, CanvasV2RenderObservation } from "../lib/canvas-v2/types";

const evidence = [
  { id: "icon:awin", url: "https://evidence.test/awin/icon.png", label: "Awin icon", description: "App icon" },
  { id: "screen:awin-1", url: "https://evidence.test/awin/1.png", label: "Awin screen 1", app: "Awin" },
  { id: "screen:awin-2", url: "https://evidence.test/awin/2.png", label: "Awin screen 2", app: "Awin" },
];

function document(inner: string): CanvasV2ArtifactDocument {
  return {
    html: `<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-node-id="flow-awin" data-canvas-v2-canonical-flow="flow:awin">${inner}</article></main>`,
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
    html: '<main data-canvas-v2-node-id="artboard"><img data-canvas-v2-node-id="forged-source" data-canvas-v2-evidence-id="screen:awin-1" data-canvas-v2-evidence-role="canonical" src="https://evidence.test/awin/1.png"></main>',
    css: "",
  };
  const empty = { html: '<main data-canvas-v2-node-id="artboard"></main>', css: "" };
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

test("every canonical flow requires complete contiguous screen indices", () => {
  const invalid = { ...canonical, html: canonical.html.replace('data-canvas-v2-flow-index="1"', 'data-canvas-v2-flow-index="4"') };
  const empty = { html: '<main data-canvas-v2-node-id="artboard"></main>', css: "" };
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
  assert.match(validateCanvasV2ArtifactDocument({ html: '<main data-canvas-v2-node-id="artboard"><img src="x"></main>', css: "" }).join(" "), /Every image must have a unique stable node identity/);
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

test("dominant analysis screenshots must visibly earn their scale without imposing a fixed width", () => {
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
    artboardWidthShare: 0.5,
    artboardHeightShare: 0.7,
    artboardAreaShare: 0.35,
    designRegionNodeId: "analysis",
    designRegionWidthShare: 0.48,
    designRegionHeightShare: 0.82,
    designRegionAreaShare: 0.39,
    annotationNodeIds: [],
    relationshipNodeIds: [],
  });
  assert.match(validateCanvasV2RenderedAnalysisEvidenceScale(dominant).join(" "), /without a visibly linked annotation or relationship/);

  dominant.spatial.evidence[dominant.spatial.evidence.length - 1] = {
    ...dominant.spatial.evidence[dominant.spatial.evidence.length - 1],
    visualRole: "friction-inspection",
    treatment: "magnified-evidence",
    annotationNodeIds: ["awin-friction-note"],
  };
  assert.deepEqual(validateCanvasV2RenderedAnalysisEvidenceScale(dominant), []);

  const deliberatePeerScale = observation();
  deliberatePeerScale.spatial.evidence.push({
    ...dominant.spatial.evidence[dominant.spatial.evidence.length - 1],
    nodeId: "analysis-awin-peer",
    bounds: { x: 100, y: 100, width: 180, height: 360 },
    scaleVsCanonicalHeight: 1.5,
    designRegionHeightShare: 0.24,
    designRegionAreaShare: 0.08,
    artboardHeightShare: 0.18,
    visualRole: undefined,
    treatment: undefined,
    annotationNodeIds: [],
  });
  assert.deepEqual(validateCanvasV2RenderedAnalysisEvidenceScale(deliberatePeerScale), []);
});

test("a screenshot-led comparison keeps multiple inspectable screens without forcing relationship geometry", () => {
  const instruction = "Build a comparison and choose representative screenshots";
  const rendered = observation();
  assert.match(validateCanvasV2RenderedComparisonCommunication(rendered, instruction).join(" "), /at least two visible canonical screen copies/);

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
  }];
  assert.match(validateCanvasV2RenderedRelationshipGeometry(rendered).join(" "), /detached from source analysis-awin/);

  rendered.spatial.authoredRelationships[0] = {
    ...rendered.spatial.authoredRelationships[0],
    sourceAnchorDistance: 3,
  };
  assert.deepEqual(validateCanvasV2RenderedRelationshipGeometry(rendered), []);

  rendered.spatial.authoredRelationships[0] = {
    ...rendered.spatial.authoredRelationships[0],
    missingTargetNodeIds: ["analysis-whop"],
  };
  assert.match(validateCanvasV2RenderedRelationshipGeometry(rendered).join(" "), /references missing target nodes/);
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
    artboardHeightShare: 0.4,
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
  assert.match(validateCanvasV2ClaimedCanonicalFlowCounts({
    ...canonical,
    html: canonical.html.replace("</main>", '<p data-canvas-v2-node-id="count">Awin has a 2-step journey</p></main>'),
  }, grounded).join(" "), /do not relabel that screenshot count as journey steps/);
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
});
