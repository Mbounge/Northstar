import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_MAX_LOCAL_IMAGE_BYTES,
  validateCanvasV2ArtifactDocument,
  validateCanvasV2EvidenceBindings,
  validateCanvasV2QuantitativeClaimLabels,
} from "../lib/canvas-v2/artifact-safety";
import type { CanvasV2EvidencePacket } from "../lib/canvas-v2/types";

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

test("safe local image pixels use a dedicated payload budget instead of the structural HTML limit", () => {
  const payload = Buffer.alloc(220_000, 7).toString("base64");
  const html = `<main data-canvas-v2-node-id="canvas">${localImage(payload)}</main>`;
  assert.ok(html.length > 180_000);
  assert.deepEqual(validateCanvasV2ArtifactDocument({ html, css: "" }), []);
  assert.deepEqual(validateCanvasV2EvidenceBindings({ html, css: "" }, []), []);
});

test("ordinary oversized markup and oversized local pixel payloads remain rejected", () => {
  const markup = `<main data-canvas-v2-node-id="canvas">${"x".repeat(181_000)}</main>`;
  assert.match(validateCanvasV2ArtifactDocument({ html: markup, css: "" }).join(" "), /Artifact HTML is too large/);

  const payload = Buffer.alloc(CANVAS_V2_MAX_LOCAL_IMAGE_BYTES + 1, 3).toString("base64");
  const html = `<main data-canvas-v2-node-id="canvas">${localImage(payload)}</main>`;
  assert.match(validateCanvasV2ArtifactDocument({ html, css: "" }).join(" "), /local user image is too large/i);
});

test("only supported user-owned inline image data can bypass evidence binding", () => {
  const html = '<main data-canvas-v2-node-id="canvas"><img data-canvas-v2-node-id="fake" data-canvas-v2-local-image="true" data-canvas-v2-origin="model" src="data:image/png;base64,AA==" alt="Fake"></main>';
  assert.match(validateCanvasV2EvidenceBindings({ html, css: "" }, []).join(" "), /approved evidence id/);
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
