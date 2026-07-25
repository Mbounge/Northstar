import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNorthstarCreativeRun } from "@/lib/canvas-ai/northstar-end-to-end-creative-evaluation";

test("the end-to-end creative evaluation verifies health without requiring a layout", () => {
  const result = evaluateNorthstarCreativeRun({
    groundedEvidenceCount: 20,
    finalEvidenceCount: 20,
    acceptedCreativeRevisionCount: 3,
    browserAcknowledgedRevisionCount: 3,
    staleCandidateCommitCount: 0,
    unsafeOperationCount: 0,
    modelAuthoredRootSizingCount: 0,
    iframeWidth: 2360,
    iframeHeight: 1800,
    canvasWidth: 2360,
    canvasHeight: 1800,
    terminalStatus: "completed",
    repeatedUnchangedFailureCount: 0,
  });
  assert.equal(result.healthy, true);
  assert.equal(result.findings.length, 0);
  assert.equal("visualFamily" in result, false);
});

test("the evaluation exposes sizing drift and model-owned root sizing", () => {
  const result = evaluateNorthstarCreativeRun({
    groundedEvidenceCount: 4,
    finalEvidenceCount: 4,
    acceptedCreativeRevisionCount: 1,
    browserAcknowledgedRevisionCount: 1,
    staleCandidateCommitCount: 0,
    unsafeOperationCount: 0,
    modelAuthoredRootSizingCount: 1,
    iframeWidth: 1400,
    iframeHeight: 900,
    canvasWidth: 1200,
    canvasHeight: 900,
    terminalStatus: "completed-with-known-limitations",
    repeatedUnchangedFailureCount: 0,
  });
  assert.equal(result.healthy, false);
  assert.ok(result.findings.some((finding) => /model attempted to control/i.test(finding)));
  assert.ok(result.findings.some((finding) => /out of sync/i.test(finding)));
});
