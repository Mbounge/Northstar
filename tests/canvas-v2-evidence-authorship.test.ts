import assert from "node:assert/strict";
import test from "node:test";

import { validateCanvasV2ArtifactDocument, validateCanvasV2EvidenceContinuity } from "../lib/canvas-v2/artifact-safety";
import {
  readCanvasV2CanonicalFlowManifests,
  resolveCanvasV2EvidenceRole,
  validateCanvasV2RenderedEvidenceIntegrity,
} from "../lib/canvas-v2/evidence-authorship";
import type { CanvasV2ArtifactDocument, CanvasV2RenderObservation } from "../lib/canvas-v2/types";

const evidence = [
  { id: "icon:awin", url: "https://evidence.test/awin/icon.png", label: "Awin icon" },
  { id: "screen:awin-1", url: "https://evidence.test/awin/1.png", label: "Awin screen 1" },
  { id: "screen:awin-2", url: "https://evidence.test/awin/2.png", label: "Awin screen 2" },
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

test("rendered canonical screens stay left-to-right and cannot visually overlap", () => {
  assert.deepEqual(validateCanvasV2RenderedEvidenceIntegrity(canonical, observation()), []);
  const reordered = observation();
  const first = reordered.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-1");
  const second = reordered.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-2");
  assert.ok(first && second);
  first.bounds.x = 420;
  second.bounds.x = 180;
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, reordered).join(" "), /left-to-right without screenshot overlap/);

  const overlapping = observation();
  const overlappingSecond = overlapping.spatial.evidence.find((item) => item.nodeId === "flow-awin-screen-2");
  assert.ok(overlappingSecond);
  overlappingSecond.bounds.x = 240;
  assert.match(validateCanvasV2RenderedEvidenceIntegrity(canonical, overlapping).join(" "), /left-to-right without screenshot overlap/);
});
