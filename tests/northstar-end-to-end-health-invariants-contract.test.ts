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

test("stale restore actions cannot overwrite a newer acknowledged revision", () => {
  assert.equal(route.includes("composition.visual.stale_restore_suppressed"), true);
  assert.equal(workspace.includes('reasonCode: "STALE_RESTORE_SUPPRESSED"'), true);
  assert.equal(workspace.includes("latestAcknowledgedRevisionForRun"), true);
});

test("design does not invoke the model with a missing semantic evidence graph", () => {
  assert.equal(route.includes("PRESENTATION_GRAPH_UNAVAILABLE"), true);
  assert.equal(route.includes('callbacks.trace?.("design.context.invalid"'), true);
  assert.equal(route.includes("The run stopped before invoking the design model"), true);
});

test("unchanged preparation failures terminate instead of consuming an unbounded retry loop", () => {
  assert.equal(route.includes("preparationFailuresByContext"), true);
  assert.equal(route.includes("maximumPreparationFailuresPerContext = 2"), true);
  assert.equal(route.includes('callbacks.trace?.("design.preparation.stalled"'), true);
  assert.equal(route.includes("Northstar stopped retrying"), true);
});
