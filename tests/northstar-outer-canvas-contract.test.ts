import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const authorship = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-creative-authorship.ts"), "utf8");
const coordinator = fs.readFileSync(path.join(root, "lib/canvas-artifacts/content-size-coordinator.ts"), "utf8");
const capture = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-render-capture.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const mutations = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-artboard-mutations.ts"), "utf8");
const runtime = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");

test("Patch 2.1 preserves every screen and validates the real workspace fit", () => {
  assert.match(authorship, /Every grounded evidence screen is permanent/i);
  assert.match(authorship, /sourceEdit\.placements must include every existing grounded evidence node/i);
  assert.match(authorship, /data-ns-preserve-all-evidence/);
  assert.match(authorship, /viewingIntent/);
  assert.match(coordinator, /outer Canvas object size are deliberately separate/i);
  assert.match(capture, /stable premium Northstar workspace envelope/i);
  assert.match(capture, /ns-workspace-shell/);
  assert.match(route, /outer_canvas_presentation_measured/);
  assert.match(route, /Preserve every grounded screen\. Reduce geometry through hierarchy/i);
  assert.match(route, /compareNorthstarPresentationCandidates/);
  assert.match(mutations, /placements \?\? \[\]\)\.slice\(0, 240\)/);
  assert.match(runtime, /cropping or masking instead of preserving the complete screenshot surface/i);
});
