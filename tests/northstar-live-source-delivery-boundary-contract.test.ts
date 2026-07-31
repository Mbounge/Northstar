import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
const sourceAuthorship = fs.readFileSync(path.join(process.cwd(), "lib/canvas-ai/northstar-live-source-authorship.ts"), "utf8");

test("one safe source candidate has exactly one atomically shielded mounted-browser execution", () => {
  assert.match(route, /NorthstarLiveSourceAuthorship/);
  assert.match(route, /creative\.live_source\.candidate_ready/);
  assert.match(route, /creative\.live_source\.dispatched/);
  assert.match(route, /mountedBrowserExecutions:\s*1/);
  assert.match(route, /hiddenRuntimeExecutions:\s*0/);
  assert.match(route, /atomicValidationExecutions:\s*1/);
  assert.match(route, /candidateVisibility:\s*"shielded-until-settlement"/);
  assert.doesNotMatch(route, /captureNorthstarExactRuntimePreview/);
  assert.doesNotMatch(route, /previewArtifact/);
  assert.doesNotMatch(route, /bestImplementationCleanCandidate/);
  assert.match(sourceAuthorship, /mode:\s*"atomic-mounted-source"/);
});

test("the mounted browser receipt is the only source delivery authority", () => {
  assert.match(route, /reviewNorthstarBrowserCommit/);
  assert.match(route, /dispatchResult\.status !== "committed"/);
  assert.match(route, /callbacks\.getLastMutationAck/);
  assert.match(route, /creative\.live_source\.rejected/);
  assert.match(route, /creative\.live_source\.committed/);
  assert.doesNotMatch(route, /assessNorthstarPrivateCandidateDelivery/);
});
