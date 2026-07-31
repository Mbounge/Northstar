import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNorthstarLifecycleFailure,
  decideNorthstarRunSettlement,
} from "@/lib/canvas-ai/northstar-lifecycle-authority";
import { NorthstarDeterministicDesignActError } from "@/lib/canvas-ai/northstar-run-health";

function healthyReceipt(revisionId = "revision-final"): Record<string, unknown> {
  return {
    expectedFinalRevisionId: revisionId,
    acknowledgedFinalRevisionId: revisionId,
    materializedFinalRevisionId: revisionId,
    receivedFinal: true,
    browserAcknowledged: true,
    outerCanvasMaterialized: true,
    persistenceHealthy: true,
    pipelineSettled: true,
    renderHealthy: true,
    noHardFailures: true,
    localOperationalHealthy: true,
  };
}

test("preserved operational revisions settle with notes when publication is deferred", () => {
  const result = decideNorthstarRunSettlement({
    expectedFinalRevisionId: "revision-final",
    serverState: {
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
    },
    clientReceipt: healthyReceipt(),
  });

  assert.equal(result.terminalState, "completed_with_notes");
  assert.equal(result.authorityReceipt.classification, "quality-advisory");
  assert.equal(result.authorityReceipt.operationalRevisionPreserved, true);
});

test("an exact healthy client receipt establishes preservation without a duplicate server verdict", () => {
  const result = decideNorthstarRunSettlement({
    expectedFinalRevisionId: "revision-final",
    serverState: {
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: false,
    },
    clientReceipt: healthyReceipt(),
  });

  assert.equal(result.terminalState, "completed_with_notes");
  assert.equal(result.authorityReceipt.operationalRevisionPreserved, true);
  assert.equal(result.authorityReceipt.revisionId, "revision-final");
});

test("incomplete settlement names the exact failed client predicates", () => {
  const receipt = healthyReceipt();
  receipt.materializedFinalRevisionId = "revision-stale";
  receipt.outerCanvasMaterialized = false;
  receipt.localOperationalHealthy = false;

  const result = decideNorthstarRunSettlement({
    expectedFinalRevisionId: "revision-final",
    serverState: {
      publicationRequired: true,
      publicationVerified: true,
      communicativelyReady: true,
      publicationClean: true,
      operationalRevisionPreserved: false,
    },
    clientReceipt: receipt,
  });

  assert.equal(result.terminalState, "incomplete");
  assert.match(result.detail, /outer-canvas materialized revision/);
  assert.match(result.detail, /outer-canvas materialization/);
  assert.match(result.detail, /local operational health/);
  assert.equal(result.authorityReceipt.classification, "unsafe");
  assert.deepEqual(result.authorityReceipt.failedPredicates, [
    "outer-canvas materialized revision",
    "outer-canvas materialization",
    "local operational health",
  ]);
});

test("missing settlement telemetry cannot turn a preserved browser revision into a failed run", () => {
  const result = decideNorthstarRunSettlement({
    expectedFinalRevisionId: "revision-final",
    serverState: {
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
      artifactId: "artifact-1",
      revisionId: "revision-final",
    },
    receiptFailure: "Realtime receipt timed out.",
  });

  assert.equal(result.terminalState, "completed_with_notes");
  assert.equal(result.authorityReceipt.classification, "transport-degraded");
  assert.equal(result.authorityReceipt.reasonCode, "SETTLEMENT_RECEIPT_MISSING_PRESERVED");
  assert.equal(result.authorityReceipt.clientReceiptPresent, false);
});

test("a recoverable design error is incomplete until a browser revision is actually preserved", () => {
  const error = new NorthstarDeterministicDesignActError({
    phase: "preflight",
    code: "NORTHSTAR_TEST_PREFLIGHT",
    message: "The speculative revision was unsafe.",
  });
  const unpreserved = classifyNorthstarLifecycleFailure({
    error,
    serverState: {
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: false,
      operationalRevisionPreserved: false,
    },
  });
  const preserved = classifyNorthstarLifecycleFailure({
    error,
    serverState: {
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
      artifactId: "artifact-1",
      revisionId: "revision-1",
    },
  });

  assert.equal(unpreserved.terminalState, "incomplete");
  assert.equal(unpreserved.reasonCode, "RECOVERABLE_DESIGN_WITHOUT_DELIVERABLE");
  assert.equal(preserved.terminalState, "completed_with_notes");
  assert.equal(preserved.reasonCode, "RECOVERABLE_DESIGN_PRESERVED");
});

test("a preserved scaffold is not a creative deliverable", () => {
  const result = decideNorthstarRunSettlement({
    expectedFinalRevisionId: "revision-scaffold",
    serverState: {
      creativeTransformationRequired: true,
      acceptedCreativeActCount: 0,
      materialCreativeRevisionPreserved: false,
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
      revisionId: "revision-scaffold",
    },
    clientReceipt: healthyReceipt("revision-scaffold"),
  });

  assert.equal(result.terminalState, "incomplete");
  assert.equal(result.authorityReceipt.reasonCode, "CREATIVE_TRANSFORMATION_REQUIRED");
});
