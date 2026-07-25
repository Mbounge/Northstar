import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
const workspace = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);

test("browser quality rejection poisons only the exact candidate, not the visual obligation", () => {
  assert.equal(route.includes("const rejectedLiveCandidateKeys = new Set<string>();"), true);
  assert.equal(route.includes("rejectedLiveCandidateKeys.add(candidateKey);"), true);
  assert.equal(route.includes("rejectedLiveCandidateKeys.has(candidateKey)"), true);
  assert.equal(route.includes('name: "composition.visual.candidate_rejected"'), true);
  assert.equal(route.includes('name: "composition.visual.candidate_already_rejected"'), true);
  assert.equal(route.includes("skippedLiveObligations"), false);
  assert.equal(route.includes("composition.visual.obligation_already_skipped"), false);
});

test("the exact rejected browser receipt remains available to geometry-aware design retries", () => {
  assert.equal(route.includes("let lastLiveRejectedMutationAck"), true);
  assert.equal(route.includes("getLastRejectedMutationAck?:"), true);
  assert.equal(route.includes("callbacks.getLastRejectedMutationAck?.()"), true);
  assert.equal(route.includes('rejectionFamily === "analysis-lane-overlap"'), true);
});

test("budget exhaustion emits an explicit incomplete terminal event", () => {
  assert.equal(route.includes('send("run.incomplete"'), true);
  assert.equal(workspace.includes('if (eventName === "run.incomplete")'), true);
  assert.equal(workspace.includes('name: "run.incomplete"'), true);
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

test("discarded or resumed recovery journals terminate the original run identity", () => {
  assert.equal(workspace.includes('recoveryDisposition: "discarded"'), true);
  assert.equal(workspace.includes('recoveryDisposition: "resumed"'), true);
});
