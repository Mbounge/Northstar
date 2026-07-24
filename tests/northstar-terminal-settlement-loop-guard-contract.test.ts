import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
const workspace = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);

test("disables an equivalent visual obligation after its first browser quality rejection", () => {
  assert.equal(route.includes("const skippedLiveObligations = new Set<string>();"), true);
  assert.equal(route.includes("skippedLiveObligations.add(obligationKey);"), true);
  assert.equal(route.includes("skippedLiveObligations.has(obligationKey)"), true);
  assert.equal(route.includes('name: "composition.visual.obligation_skipped"'), true);
  assert.equal(route.includes('name: "composition.visual.obligation_already_skipped"'), true);
});

test("manual stop settles diagnostics before active run identity is cleared", () => {
  const cancelStart = workspace.indexOf("const cancelRun = useCallback");
  const clearRun = workspace.indexOf("activeRunIdRef.current = null;", cancelStart);
  const cancelledEvent = workspace.indexOf('name: "run.cancelled"', cancelStart);
  assert.ok(cancelStart >= 0);
  assert.ok(cancelledEvent > cancelStart);
  assert.ok(clearRun > cancelledEvent);
  assert.equal(workspace.includes('name: "run.cancel_requested"'), true);
  assert.equal(workspace.includes("persistRunRecovery(null);"), true);
});

test("an aborted request is not persisted as an interrupted recoverable run", () => {
  assert.equal(workspace.includes("const wasCancelled = controller.signal.aborted"), true);
  assert.equal(workspace.includes("if (wasCancelled) {\n        persistRunRecovery(null);"), true);
});
