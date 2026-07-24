import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const policyPath = path.join(process.cwd(), "lib/canvas-ai/northstar-health-policy.ts");
const workspacePath = path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx");
const hostPath = path.join(process.cwd(), "components/canvas/artifacts/code-artifact-host.tsx");
const runtimePath = path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts");

const policy = fs.readFileSync(policyPath, "utf8");
const workspace = fs.readFileSync(workspacePath, "utf8");
const host = fs.readFileSync(hostPath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");

test("defines one versioned health policy", () => {
  assert.equal(policy.includes('schema: "northstar.health-policy.v1"'), true);
  for (const section of ["action", "acknowledgement", "render", "recovery"]) {
    assert.equal(policy.includes(`${section}: {`), true);
  }
});

test("uses policy thresholds at action, acknowledgement, render, and recovery boundaries", () => {
  assert.equal(workspace.includes("NORTHSTAR_HEALTH_POLICY.action.timeoutMs"), true);
  assert.equal(workspace.includes("NORTHSTAR_HEALTH_POLICY.recovery.maxJournalAgeMs"), true);
  assert.equal(host.includes("NORTHSTAR_HEALTH_POLICY.acknowledgement.terminalTimeoutMs"), true);
  assert.equal(runtime.includes("NORTHSTAR_HEALTH_POLICY.render.maxWidthGrowthRatio"), true);
  assert.equal(runtime.includes("NORTHSTAR_HEALTH_POLICY.render.requiredNodeIds"), true);
});
