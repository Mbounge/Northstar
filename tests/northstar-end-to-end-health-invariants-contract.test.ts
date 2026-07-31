import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const host = fs.readFileSync(path.join(root, "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");
const runtime = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/canvas/north-star-canvas-workspace.tsx"), "utf8");

test("server acknowledgement deadline cannot expire before the browser audit window", () => {
  assert.equal(route.includes("const NORTHSTAR_BROWSER_ACK_TIMEOUT_MS = 32_000"), true);
  assert.equal(route.includes("const NORTHSTAR_ACK_RECONCILIATION_MS = 3_000"), true);
  assert.equal(runtime.includes("8_100"), true);
});

test("a timed-out proposal is cancelled and cannot later become committed", () => {
  assert.equal(host.includes("terminalProposalByAckTokenRef"), true);
  assert.equal(host.includes('type: "northstar.artifact.cancel-mutation"'), true);
  assert.equal(host.includes("Ignored a late"), true);
  assert.equal(runtime.includes("cancelledMutationIds"), true);
  assert.equal(runtime.includes("rollbackMutation"), true);
  assert.equal(runtime.includes('message.type === "northstar.artifact.cancel-mutation"'), true);
});

test("malformed lifecycle receipts are ignored until an exact envelope settles", () => {
  assert.equal(workspace.includes("let exactEvent: NorthstarArtifactLifecycleEvent | undefined"), true);
  assert.equal(workspace.includes('name: "settlement.identity_mismatch"'), true);
  assert.equal(workspace.includes("reportedMalformedEvents"), true);
});

test("speculative candidates never require a restore action to protect canonical lineage", () => {
  assert.equal(route.includes("retainCommittedLiveArtboard"), false);
  assert.equal(route.includes("composition.visual.stale_restore_suppressed"), false);
  assert.equal(workspace.includes("pendingArtifactCandidatesRef"), true);
  assert.equal(workspace.includes("isNorthstarSpeculativeBrowserCandidate"), true);
  assert.equal(workspace.includes("northstarTerminalEventSettlesCandidate"), true);
});

test("creative authorship does not invoke the model with a missing semantic evidence graph", () => {
  assert.equal(route.includes("CREATIVE_SURFACE_UNAVAILABLE"), true);
  assert.equal(route.includes('callbacks.trace?.("creative.context.invalid"'), true);
  assert.equal(route.includes("The run stopped before invoking the creative model"), true);
});

test("unchanged adaptive failures terminate instead of consuming an unbounded retry loop", () => {
  assert.equal(route.includes("maximumRepeatedFailureFingerprints"), true);
  assert.equal(route.includes('callbacks.trace?.("creative.session.preparation_stalled"'), true);
  assert.equal(route.includes("Northstar stopped retrying the unchanged committed scene"), true);
});
