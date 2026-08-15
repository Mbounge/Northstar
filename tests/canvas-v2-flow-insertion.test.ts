import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canvasV2CompactJourneySegmentLabel, canvasV2StableNodeToken } from "../lib/canvas-v2/flow-insertion";

test("canonical evidence stays on one intrinsic horizontal rail", () => {
  const source = readFileSync("lib/canvas-v2/flow-insertion.ts", "utf8");
  assert.match(source, /dataset\.canvasV2EvidenceRegion = "canonical"/);
  assert.match(source, /canvas-v2-flow-sequence/);
  assert.match(source, /data-canvas-v2-node-id="artboard"/);
  assert.match(source, /height:235px/);
  assert.match(source, /flex-flow:row nowrap/);
  assert.match(source, /grid-template-columns:170px max-content/);
  assert.match(source, /width:max-content; min-width:0; max-width:none/);
  assert.match(source, /canvas-v2-flow-layout-v4/);
  assert.match(source, /canvas-v2-artboard--evidence-wide/);
  assert.match(source, /dataset\.canvasV2JourneySegment/);
  assert.doesNotMatch(source, /max-width:2380px|max-width:2600px|max-width:2680px/);
  assert.match(source, /object-fit:contain/);
  assert.match(source, /dataset\.canvasV2FlowIndex/);
  assert.match(source, /dataset\.canvasV2EvidenceRole = "canonical"/);
  assert.match(source, /validateCanvasV2EvidenceBindings/);
});

test("long branching taxonomy remains available without becoming a wall inside the evidence rail", () => {
  const label = "Creator & Influencer Onboarding → Creator Value Proposition → Social Media Authorization → Publisher Profile & Security → Account Activation & First Login";
  assert.equal(canvasV2CompactJourneySegmentLabel(label), "Creator & Influencer Onboarding → Account Activation & First Login");
  const source = readFileSync("lib/canvas-v2/flow-insertion.ts", "utf8");
  assert.match(source, /marker\.title = segment\.name/);
  assert.match(source, /-webkit-line-clamp:4/);
  const compiler = readFileSync("lib/canvas-v2/source-patch.ts", "utf8");
  assert.match(compiler, /\.canvas-v2-flow-segment\{[^}]*width:132px!important[^}]*overflow:hidden!important/);
  assert.match(compiler, /\.canvas-v2-flow-segment-label\{[^}]*max-width:100%!important[^}]*overflow-wrap:anywhere!important/);
});

test("Apps and References share the neutral research surface", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const panel = readFileSync("components/canvas-v2/canvas-v2-research-panel.tsx", "utf8");
  assert.match(workspace, /researchEndpoint/);
  assert.match(workspace, /insertCanvasV2CanonicalFlow/);
  assert.match(workspace, /label === "References" && setPanel\("apps"\)/);
  assert.match(panel, /operation: "flow-screens"/);
  assert.match(panel, /Insert flow/);
  assert.doesNotMatch(`${workspace}\n${panel}`, /@\/lib\/canvas-ai\//);
});

test("long sibling taxonomy identities remain distinct after compaction", () => {
  const sharedPrefix = "108d13ff-4919-40bc-a8a6-6ebe7081e9c0-awin-mobile-onboarding-journey";
  const entry = canvasV2StableNodeToken(`${sharedPrefix}-entry`);
  const branch = canvasV2StableNodeToken(`${sharedPrefix}-branch`);

  assert.notEqual(entry, branch);
  assert.ok(entry.length <= 56);
  assert.ok(branch.length <= 56);
  assert.equal(canvasV2StableNodeToken(`${sharedPrefix}-entry`), entry);
});
