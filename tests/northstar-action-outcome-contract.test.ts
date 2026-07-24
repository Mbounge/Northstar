import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(
  process.cwd(),
  "components/canvas/north-star-canvas-workspace.tsx",
);
const source = fs.readFileSync(workspacePath, "utf8");

test("defines explicit terminal action outcomes", () => {
  for (const status of [
    "succeeded",
    "skipped",
    "rejected",
    "superseded",
    "failed",
    "timed_out",
  ]) {
    assert.equal(source.includes(`| "${status}"`), true);
  }
});

test("does not classify skipped or rejected actions as hard failures", () => {
  assert.equal(
    source.includes('return status === "failed" || status === "timed_out";'),
    true,
  );
});

test("emits an end-to-end run health verdict after client actions settle", () => {
  assert.equal(
    source.includes('name: healthy ? "run.completed" : "run.incomplete"'),
    true,
  );
  assert.equal(source.includes("serverRunCompleted"), true);
  assert.equal(source.includes("terminalActionCount: outcomes.length"), true);
  assert.equal(source.includes("hardFailureCount: hardFailures.length"), true);
});

test("records every action's structured terminal outcome", () => {
  assert.equal(source.includes('name: "action.outcome"'), true);
  assert.equal(source.includes("status: outcome.status"), true);
  assert.equal(source.includes("actionId: outcome.actionId"), true);
  assert.equal(source.includes("stepId: outcome.stepId"), true);
});
