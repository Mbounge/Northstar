import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(
  process.cwd(),
  "components/canvas/north-star-canvas-workspace.tsx",
);
const source = fs.readFileSync(workspacePath, "utf8");

test("suppresses duplicate actions with a stable run and action idempotency key", () => {
  assert.equal(source.includes("const idempotencyKey = `${runId}:${action.actionId}`"), true);
  assert.equal(source.includes('reasonCode: "DUPLICATE_ACTION_SUPPRESSED"'), true);
  assert.equal(source.includes('name: "action.duplicate_suppressed"'), true);
});

test("rejects stale actions after their run is no longer active", () => {
  assert.equal(source.includes('reasonCode: "STALE_RUN_ACTION"'), true);
  assert.equal(source.includes("activeRunIdRef.current !== runId"), true);
});

test("uses bounded timeouts and only retries explicitly retry-safe failures", () => {
  assert.equal(source.includes("const CANVAS_ACTION_TIMEOUT_MS = NORTHSTAR_HEALTH_POLICY.action.timeoutMs"), true);
  assert.equal(source.includes("const CANVAS_ACTION_MAX_ATTEMPTS = NORTHSTAR_HEALTH_POLICY.action.maxAttempts"), true);
  assert.equal(source.includes("normalizedAttempt.retrySafe === true"), true);
  assert.equal(source.includes('reasonCode: timedOut ? "ACTION_EXECUTION_TIMEOUT"'), true);
  assert.equal(source.includes('name: "action.retry_scheduled"'), true);
});
