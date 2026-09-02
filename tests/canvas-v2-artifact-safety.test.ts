import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_MAX_LOCAL_IMAGE_BYTES,
  validateCanvasV2ArtifactDocument,
  validateCanvasV2EvidenceBindings,
} from "../lib/canvas-v2/artifact-safety";

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
