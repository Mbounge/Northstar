import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(
  process.cwd(),
  "components/canvas/north-star-canvas-workspace.tsx",
);
const source = fs.readFileSync(workspacePath, "utf8");

test("separates operational health, creative outcome, and duration in the diagnostics panel", () => {
  assert.equal(source.includes("summarizeNorthstarRunOutcome(scoped)"), true);
  assert.equal(source.includes("Operational"), true);
  assert.equal(source.includes("Creative outcome"), true);
  assert.equal(source.includes("Publication"), true);
  assert.equal(source.includes("durationMs"), true);
  assert.equal(source.includes("Pending acks"), true);
  assert.equal(source.includes("First design"), true);
  assert.equal(source.includes("Normalize / private"), true);
});

test("supports run, phase, and problem-only diagnostic filtering", () => {
  assert.equal(source.includes("selectedRunId"), true);
  assert.equal(source.includes("phaseFilter"), true);
  assert.equal(source.includes("onlyProblems"), true);
  assert.equal(source.includes('classifyCanvasDiagnosticEvent(event, events) !== "problem"'), true);
  assert.equal(source.includes("summarizeNorthstarRuntimeAuthorityDiagnostics(scoped)"), true);
});

test("surfaces correlation identifiers in expanded event details", () => {
  assert.equal(source.includes("runId: event.runId"), true);
  assert.equal(source.includes("actionId: event.actionId"), true);
  assert.equal(source.includes("stepId: event.stepId"), true);
});
