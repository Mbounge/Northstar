import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const hostSource = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/artifacts/code-artifact-host.tsx"),
  "utf8",
);
const workspaceSource = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);

test("emits correlated browser revision lifecycle events", () => {
  for (const eventName of [
    "revision.sent",
    "revision.received",
    "revision.acknowledged",
    "revision.rejected",
    "revision.timed_out",
    "ack.delivery_failed",
  ]) {
    assert.equal(hostSource.includes(`\"${eventName}\"`), true);
  }
  assert.equal(hostSource.includes("ackToken: input.proposal.ackToken"), true);
  assert.equal(hostSource.includes("browserRevisionId: browserRevisionRef.current"), true);
});

test("terminates mutations that never reach browser acknowledgement", () => {
  assert.equal(hostSource.includes("proposal.dispatchAttempts >= NORTHSTAR_HEALTH_POLICY.acknowledgement.maxDispatchAttempts"), true);
  assert.equal(hostSource.includes("proposalAge > NORTHSTAR_HEALTH_POLICY.acknowledgement.terminalTimeoutMs"), true);
  assert.equal(hostSource.includes('name: "revision.timed_out"'), true);
});

test("gates run completion on acknowledgement health and revision parity", () => {
  assert.equal(workspaceSource.includes("unresolvedAcknowledgements.length === 0"), true);
  assert.equal(workspaceSource.includes("acknowledgementFailures.length === 0"), true);
  assert.equal(workspaceSource.includes("revisionParityFailures.length === 0"), true);
  assert.equal(workspaceSource.includes("pipelineSettled"), true);
  assert.equal(workspaceSource.includes("noHardFailures"), true);
});
