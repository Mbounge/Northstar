import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { canvasV2CaptureGeometry, normalizeCanvasV2ArtboardGeometry } from "../lib/canvas-v2/artboard-geometry";

test("the North Star artboard has a generous minimum and grows in either axis", () => {
  assert.deepEqual(normalizeCanvasV2ArtboardGeometry({ width: 400, height: 300 }), { width: 1680, height: 945 });
  assert.deepEqual(normalizeCanvasV2ArtboardGeometry({ width: 4200.2, height: 1800.1 }), { width: 4201, height: 1801 });
});

test("large artboards remain complete in a bounded model observation", () => {
  const capture = canvasV2CaptureGeometry({ width: 8000, height: 2000 });
  assert.equal(capture.width, 2400);
  assert.equal(capture.height, 600);
});

test("the iframe exposes complete intrinsic bounds while the outer canvas owns navigation", () => {
  const runtime = readFileSync("lib/canvas-v2/runtime-document.ts", "utf8");
  const preview = readFileSync("components/canvas-v2/artboard-preview.tsx", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(runtime, /overflow:visible/);
  assert.match(runtime, /min-width:1680px/);
  assert.doesNotMatch(runtime, /overflow:\s*hidden/);
  assert.match(preview, /measureCanvasV2ArtboardGeometry/);
  assert.match(preview, /captureCanonicalRailDetails/);
  assert.match(preview, /CANVAS_V2_RAIL_DETAIL_CHUNK_SIZE = 24/);
  assert.match(preview, /grid-template-columns:repeat\(12,128px\)/);
  assert.match(preview, /railDetails/);
  assert.match(preview, /onGeometry/);
  assert.match(workspace, /fitArtboard/);
  assert.match(workspace, /Math\.max\(0\.08, value\)/);
  assert.match(workspace, /backgroundPosition/);
  assert.doesNotMatch(`${runtime}\n${preview}\n${workspace}`, /@\/lib\/canvas-ai\//);
});

test("V2 starts on the canonical clean surface without an inner starter card", () => {
  const loop = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  const grammar = readFileSync("lib/canvas-v2/northstar-artboard-grammar.ts", "utf8");
  assert.match(loop, /Empty North Star artboard/);
  assert.doesNotMatch(loop, /Your living analysis artboard/);
  assert.match(grammar, /Cards, panels, pills/);
  assert.match(grammar, /width:max-content/);
});
