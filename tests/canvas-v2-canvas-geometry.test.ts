import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { canvasV2CaptureGeometry, growCanvasV2CanvasGeometry, normalizeCanvasV2CanvasGeometry } from "../lib/canvas-v2/canvas-geometry";

test("intrinsic content has a generous minimum and is bounded by the finite workspace", () => {
  assert.deepEqual(normalizeCanvasV2CanvasGeometry({ width: 400, height: 300 }), { width: 1680, height: 945 });
  assert.deepEqual(normalizeCanvasV2CanvasGeometry({ width: 4200.2, height: 1800.1 }), { width: 4201, height: 1801 });
  assert.deepEqual(normalizeCanvasV2CanvasGeometry({ width: 15_000, height: 15_000 }), { width: 12_000, height: 8_000 });
});

test("large canvass remain complete in a bounded model observation", () => {
  const capture = canvasV2CaptureGeometry({ width: 8000, height: 2000 });
  assert.equal(capture.width, 2400);
  assert.equal(capture.height, 600);
});

test("responsive remeasurement grows monotonically before observation", () => {
  assert.deepEqual(
    growCanvasV2CanvasGeometry({ width: 4200, height: 1600 }, { width: 6100, height: 1400 }),
    { width: 6100, height: 1600 },
  );
  assert.deepEqual(
    growCanvasV2CanvasGeometry({ width: 6100, height: 1600 }, { width: 5800, height: 1500 }),
    { width: 6100, height: 1600 },
  );
});

test("the compiler exposes the finite scene bounds while the outer canvas owns navigation", () => {
  const runtime = readFileSync("lib/canvas-v2/runtime-document.ts", "utf8");
  const preview = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(runtime, /overflow:visible/);
  assert.match(runtime, /width:\$\{CANVAS_V2_WORKSPACE\.width\}px/);
  assert.match(runtime, /height:\$\{CANVAS_V2_WORKSPACE\.height\}px/);
  assert.match(runtime, /background:transparent!important/);
  assert.match(runtime, /data-canvas-v2-node-id="canvas"/);
  assert.doesNotMatch(runtime, /overflow:\s*hidden/);
  assert.match(preview, /measureCanvasV2CanvasGeometry/);
  assert.match(preview, /captureCanonicalRailDetails/);
  assert.match(preview, /CANVAS_V2_RAIL_DETAIL_CHUNK_SIZE = 24/);
  assert.match(preview, /grid-template-columns:repeat\(12,128px\)/);
  assert.match(preview, /railDetails/);
  assert.match(preview, /onGeometry/);
  assert.match(workspace, /fitContent/);
  assert.match(workspace, /CANVAS_V2_WORKSPACE\.width/);
  assert.match(workspace, /data-canvas-v2-workspace-surface/);
  assert.match(workspace, /backgroundColor: theme === "dark" \? "#111117" : "#fefeff"/);
  assert.match(workspace, /onWorkspaceWheel=\{navigateWorkspaceWheel\}/);
  assert.match(preview, /frameDocument\.addEventListener\("wheel", wheel, \{ passive: false \}\)/);
  assert.match(preview, /applyCanvasV2ArtifactTheme/);
  assert.match(workspace, /theme=\{theme\}/);
  assert.match(workspace, /Switch to.*light.*dark.*mode/);
  assert.match(workspace, /backgroundPosition/);
  assert.match(preview, /className="block border-0 bg-transparent"/);
  assert.doesNotMatch(preview, /className="block border-0 bg-white"/);
  assert.doesNotMatch(workspace, /bg-\[#e9eaf2\]|shadow-\[0_28px_90px/);
  assert.doesNotMatch(`${runtime}\n${preview}\n${workspace}`, /@\/lib\/canvas-ai\//);
});

test("V2 starts on the canonical clean surface without an inner starter card", () => {
  const loop = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  const grammar = readFileSync("lib/canvas-v2/northstar-canvas-grammar.ts", "utf8");
  assert.match(loop, /North Star canvas metadata/);
  assert.match(loop, /data-canvas-v2-workspace-root/);
  assert.doesNotMatch(loop, /northstar-canvas/);
  assert.doesNotMatch(loop, /Your living analysis canvas/);
  assert.match(grammar, /Cards, panels, pills/);
  assert.match(grammar, /width:max-content/);
});
