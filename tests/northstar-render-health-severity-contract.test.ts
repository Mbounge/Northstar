import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const host = fs.readFileSync(path.join(process.cwd(), "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"), "utf8");

test("legacy creative audit warnings do not become fatal render failures", () => {
  assert.equal(host.includes("const operationallyHealthy = review.healthy ?? ("), true);
  assert.equal(host.includes('creativeIssueCount > 0 ? "warning" : "pass"'), true);
  assert.equal(host.includes('severity = operationallyHealthy'), true);
});

test("completion gates only on fatal operational render failures", () => {
  assert.equal(workspace.includes("fatalRenderHealthFailures.length === 0"), true);
  assert.equal(workspace.includes("renderHealthWarningCount: renderHealthWarnings.length"), true);
  assert.equal(workspace.includes("latestRenderHealthByRevision"), true);
});

test("identical render-health events are deduplicated", () => {
  assert.equal(host.includes("lastRenderHealthFingerprintRef"), true);
  assert.equal(host.includes("lastRenderHealthFingerprintRef.current !== fingerprint"), true);
});
