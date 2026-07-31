import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);

test("settles live artifact actions from the matching runtime lifecycle verdict", () => {
  assert.equal(source.includes("waitForCanvasActionLifecycleSettlement"), true);
  assert.equal(source.includes('candidate.proposalId === identity.proposalId'), true);
  assert.equal(source.includes('settlement.kind === "rejected"'), true);
  assert.equal(source.includes('reasonCode: "RUNTIME_REVISION_REJECTED"'), true);
  assert.equal(source.includes(': "RUNTIME_SETTLEMENT_TIMEOUT"'), true);
});

test("does not use restoration actions as candidate settlement", () => {
  assert.equal(source.includes('action.stepId.startsWith("restore-verified-artboard-")'), false);
  assert.equal(source.includes('reasonCode: "VERIFIED_STATE_RESTORED"'), false);
  assert.equal(source.includes("pendingArtifactCandidatesRef"), true);
});
