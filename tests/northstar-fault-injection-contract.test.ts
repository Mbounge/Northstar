import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);
const harness = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-ai/northstar-fault-injection.ts"),
  "utf8",
);

test("defines bounded, explicit fault-injection points", () => {
  assert.equal(harness.includes('"action.before_execute"'), true);
  assert.equal(harness.includes('"persistence.before_write"'), true);
  assert.equal(harness.includes('"runtime.lifecycle.before_record"'), true);
  assert.equal(harness.includes('Math.min(rule.delayMs ?? 0, 10_000)'), true);
});

test("supports deterministic one-shot and repeated faults", () => {
  assert.equal(harness.includes("remaining?: number"), true);
  assert.equal(harness.includes("rule.remaining = Math.max(0, rule.remaining - 1)"), true);
  assert.equal(harness.includes("installNorthstarFaults"), true);
  assert.equal(harness.includes("clearNorthstarFaults"), true);
});

test("wires faults into action, runtime, and persistence boundaries", () => {
  assert.equal(workspace.includes('applyNorthstarFault("action.before_execute")'), true);
  assert.equal(workspace.includes('consumeNorthstarFault("runtime.lifecycle.before_record")'), true);
  assert.equal(workspace.includes('applyNorthstarFault("persistence.before_write")'), true);
  assert.equal(workspace.includes('reasonCode: "INJECTED_ACTION_DROP"'), true);
});
