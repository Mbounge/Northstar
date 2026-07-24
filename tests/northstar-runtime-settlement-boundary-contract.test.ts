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
  assert.equal(source.includes('candidate.proposalId === proposalId'), true);
  assert.equal(source.includes('settlement.kind === "rejected"'), true);
  assert.equal(source.includes('reasonCode: "RUNTIME_REVISION_REJECTED"'), true);
  assert.equal(source.includes('reasonCode: "RUNTIME_SETTLEMENT_TIMEOUT"'), true);
});

test("does not report verified-state restoration as semantic success", () => {
  assert.equal(source.includes('action.stepId.startsWith("restore-verified-artboard-")'), true);
  assert.equal(source.includes('reasonCode: "VERIFIED_STATE_RESTORED"'), true);
  assert.equal(source.includes("The rejected semantic obligation remains unresolved."), true);
});
