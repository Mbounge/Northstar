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

test("submits an end-to-end client health receipt before accepting the server-owned terminal verdict", () => {
  assert.equal(source.includes("buildClientSettlementReceipt"), true);
  assert.equal(source.includes("localOperationalHealthy"), true);
  assert.equal(source.includes('kind: "settlement-receipt"'), true);
  assert.equal(source.includes('"run.completed_with_notes"'), true);
});

test("records every action's structured terminal outcome", () => {
  assert.equal(source.includes('name: "action.outcome"'), true);
  assert.equal(source.includes("status: result.status"), true);
  assert.equal(source.includes("actionId: action.actionId"), true);
  assert.equal(source.includes("stepId: action.stepId"), true);
});
