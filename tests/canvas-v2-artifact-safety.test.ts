import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_MAX_LOCAL_IMAGE_BYTES,
  validateCanvasV2ArtifactDocument,
  validateCanvasV2EvidenceBindings,
  validateCanvasV2EvidenceContinuity,
  validateCanvasV2QuantitativeClaimLabels,
} from "../lib/canvas-v2/artifact-safety";
import type { CanvasV2EvidenceAsset, CanvasV2EvidencePacket } from "../lib/canvas-v2/types";

function validModelUrl(): string {
  const jsonBytes = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }] }));
  const json = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4); json.set(jsonBytes); json.fill(0x20, jsonBytes.length);
  const bin = new Uint8Array([0, 1, 2, 3]);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const bytes = new Uint8Array(total), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  let offset = 12;
  view.setUint32(offset, json.length, true); view.setUint32(offset + 4, 0x4e4f534a, true); offset += 8; bytes.set(json, offset); offset += json.length;
  view.setUint32(offset, bin.length, true); view.setUint32(offset + 4, 0x004e4942, true); offset += 8; bytes.set(bin, offset);
  return `data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`;
}

test("retained researched figures survive composition validation without accepting invented or inferred precision", () => {
  const packet = { facts: [{ id: "fact", label: "Sample", value: "7 of 9", authority: "observed" }],
    metrics: [{ id: "metric", label: "Rate", value: 13, unit: "%", authority: "calculated", definition: "Sourced rate" }],
  } as CanvasV2EvidencePacket;
  const document = { html: "<p>Published rate: 13%. Sample: 7/9.</p>", css: "" };
  assert.deepEqual(validateCanvasV2QuantitativeClaimLabels(document, [], "Explain the findings", [packet]), []);
  assert.equal(validateCanvasV2QuantitativeClaimLabels(document, [], "Explain the findings").length, 2);
  assert.equal(validateCanvasV2QuantitativeClaimLabels({ ...document, html: "<p>Published rate: 14%.</p>" }, [], "Explain", [packet]).length, 1);
  const inferred = { ...packet, facts: [], metrics: packet.metrics.map(metric => ({ ...metric, authority: "inferred" as const })) };
  assert.equal(validateCanvasV2QuantitativeClaimLabels({ ...document, html: "<p>Measured rate: 13%.</p>" }, [], "Explain", [inferred]).length, 1);
});

function localImage(data: string): string {
  return `<img data-canvas-v2-node-id="local-image" data-canvas-v2-local-image="true" data-canvas-v2-origin="user" src="data:image/png;base64,${data}" alt="Local image">`;
}

test("safe local image pixels do not impose a structural HTML limit", () => {
  const payload = Buffer.alloc(220_000, 7).toString("base64");
  const html = `<main data-canvas-v2-node-id="canvas">${localImage(payload)}</main>`;
  assert.ok(html.length > 180_000);
  assert.deepEqual(validateCanvasV2ArtifactDocument({ html, css: "" }), []);
  assert.deepEqual(validateCanvasV2EvidenceBindings({ html, css: "" }, []), []);
});

test("accumulated markup and CSS can grow while individual image payloads stay bounded", () => {
  const markup = `<main data-canvas-v2-node-id="canvas">${"x".repeat(181_000)}</main>`;
  assert.deepEqual(validateCanvasV2ArtifactDocument({ html: markup, css: ".card{color:purple}".repeat(8_000) }), []);

  const payload = Buffer.alloc(CANVAS_V2_MAX_LOCAL_IMAGE_BYTES + 1, 3).toString("base64");
  const html = `<main data-canvas-v2-node-id="canvas">${localImage(payload)}</main>`;
  assert.match(validateCanvasV2ArtifactDocument({ html, css: "" }).join(" "), /local user image is too large/i);
});

test("only supported user-owned inline image data can bypass evidence binding", () => {
  const html = '<main data-canvas-v2-node-id="canvas"><img data-canvas-v2-node-id="fake" data-canvas-v2-local-image="true" data-canvas-v2-origin="model" src="data:image/png;base64,AA==" alt="Fake"></main>';
  assert.match(validateCanvasV2EvidenceBindings({ html, css: "" }, []).join(" "), /approved evidence id/);
});

test("native model references validate as retained GLB evidence without entering image paths", () => {
  const url = validModelUrl();
  const reference = JSON.stringify({ version: 1, evidenceId: "model-1", label: "Preview" });
  const document = { html: `<div data-canvas-v2-node-id="model" data-canvas-v2-model='${reference}'></div>`, css: "" };
  const asset = { id: "model-1", url, label: "Preview", mediaType: "model" as const };
  assert.deepEqual(validateCanvasV2ArtifactDocument(document), []);
  assert.deepEqual(validateCanvasV2EvidenceBindings(document, [asset]), []);
  assert.match(validateCanvasV2EvidenceBindings(document, []).join(" "), /native model evidence binding is not approved/i);
  assert.match(validateCanvasV2EvidenceBindings(document, [{ ...asset, mediaType: "image" }]).join(" "), /native model evidence binding is not approved/i);
  assert.match(validateCanvasV2EvidenceBindings(document, [{ ...asset, url: "data:model/gltf-binary;base64,YQ==" }]).join(" "), /native model evidence binding is not approved/i);
});

test("malformed or non-div native model markup is rejected before review", () => {
  const malformed = `<div data-canvas-v2-node-id="model" data-canvas-v2-model='{"version":1,"evidenceId":"m"}'></div>`;
  assert.match(validateCanvasV2ArtifactDocument({ html: malformed, css: "" }).join(" "), /invalid native model reference/i);
  const nonDiv = `<span data-canvas-v2-node-id="model" data-canvas-v2-model='{"version":1,"evidenceId":"m","label":"Preview"}'></span>`;
  assert.match(validateCanvasV2ArtifactDocument({ html: nonDiv, css: "" }).join(" "), /ordinary div/i);
});


test("AI placement of approved attachment pixels does not consume the HTML markup budget", () => {
  const src = `data:image/png;base64,${Buffer.alloc(220_000, 7).toString("base64")}`;
  const html = `<main data-canvas-v2-node-id="canvas"><img data-canvas-v2-node-id="supplied-post" data-canvas-v2-origin="model" data-canvas-v2-evidence-id="upload:post" src="${src}" alt="Original post"></main>`;
  const document = { html, css: "" };
  assert.deepEqual(validateCanvasV2ArtifactDocument(document), []);
  assert.deepEqual(validateCanvasV2EvidenceBindings(document, [{ id: "upload:post", url: src, label: "Original post", kind: "image" }]), []);
  assert.match(validateCanvasV2EvidenceBindings(document, []).join(" "), /not approved/);
  assert.match(validateCanvasV2EvidenceBindings(document, [{ id: "upload:post", url: "https://example.com/different.png", label: "Other", kind: "image" }]).join(" "), /not approved/);
});

test("bound evidence images still have a strict per-image pixel limit", () => {
  const src = `data:image/png;base64,${Buffer.alloc(CANVAS_V2_MAX_LOCAL_IMAGE_BYTES + 1, 7).toString("base64")}`;
  assert.match(validateCanvasV2ArtifactDocument({ html: `<img data-canvas-v2-node-id="image" data-canvas-v2-evidence-id="e" src="${src}">`, css: "" }).join(" "), /evidence image is too large/);
});


test("a researched composition image can be replaced without forcing a duplicate onto the canvas", () => {
  const asset = { id: "research-image", url: "https://example.com/source.png", label: "Research image", source: { sourceType: "web-image" } } as CanvasV2EvidenceAsset;
  const previous = { html: `<img data-canvas-v2-node-id="reference" data-canvas-v2-origin="northstar" data-canvas-v2-evidence-id="research-image" src="${asset.url}">`, css: "" };
  const next = { html: '<p data-canvas-v2-node-id="explanation">Revised explanation</p>', css: "" };
  assert.deepEqual(validateCanvasV2EvidenceContinuity(previous, next, [asset]), []);
  const edited = { ...previous, html: previous.html.replace('<img ', '<img data-canvas-v2-last-author="user" ') };
  assert.match(validateCanvasV2EvidenceContinuity(edited, next, [asset]).join(" "), /must remain visible/);
  const uploaded = { ...asset, source: undefined };
  assert.match(validateCanvasV2EvidenceContinuity(previous, next, [uploaded]).join(" "), /must remain visible/);
  const humanCopy = { ...previous, html: previous.html + previous.html.replace('node-id="reference"', 'node-id="human-copy"').replace('origin="northstar"', 'origin="user"') };
  assert.match(validateCanvasV2EvidenceContinuity(humanCopy, next, [asset]).join(" "), /must remain visible/);
});
