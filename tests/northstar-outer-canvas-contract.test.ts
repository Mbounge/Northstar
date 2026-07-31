import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const authorship = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-creative-authorship.ts"), "utf8");
const coordinator = fs.readFileSync(path.join(root, "lib/canvas-artifacts/content-size-coordinator.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const mutations = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-artboard-mutations.ts"), "utf8");
const runtime = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");

test("every screen survives under runtime-owned evidence preservation and real workspace fit validation", () => {
  assert.match(authorship, /Every grounded evidence screen is permanent/i);
  assert.match(authorship, /no evidence node may be omitted, retired, hidden, replaced, cropped, masked, or visually truncated/i);
  assert.match(authorship, /data-ns-preserve-all-evidence/);
  assert.match(authorship, /viewingIntent/);
  assert.match(coordinator, /terminal browser measurement now controls/i);
  assert.match(route, /assessNorthstarAdaptiveReadiness\(postAssessment\)/);
  assert.match(route, /creative\.live_source\.committed/);
  assert.match(route, /reviewNorthstarBrowserCommit/);
  assert.match(mutations, /placements \?\? \[\]\)\.slice\(0, 240\)/);
  assert.match(runtime, /cropping or masking instead of preserving the complete screenshot surface/i);
  assert.match(runtime, /captureEvidenceRegistryReceipt/);
  assert.match(runtime, /clearRuntimeInheritedPlacement/);
});
