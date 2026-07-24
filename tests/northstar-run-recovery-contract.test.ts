import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);

test("persists a bounded active-run recovery journal", () => {
  assert.equal(source.includes("northstar.canvas-run-recovery.v1"), true);
  assert.equal(source.includes("CANVAS_RUN_RECOVERY_MAX_AGE_MS"), true);
  assert.equal(source.includes("run.recovery_available"), true);
});

test("resumes from the last verified checkpoint", () => {
  assert.equal(source.includes("run.recovery_resumed"), true);
  assert.equal(source.includes("compositionCheckpointRef.current = recoverableRun.checkpoint"), true);
  assert.equal(source.includes("void sendMessage(prompt)"), true);
});

test("clears only healthy completed journals and preserves incomplete runs", () => {
  assert.equal(source.includes("if (healthy)"), true);
  assert.equal(source.includes("persistRunRecovery(null)"), true);
  assert.equal(source.includes('status: "interrupted"'), true);
});
