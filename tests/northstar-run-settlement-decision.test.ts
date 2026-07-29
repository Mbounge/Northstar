import assert from "node:assert/strict";
import test from "node:test";
import { decideNorthstarRunSettlement } from "@/lib/canvas-ai/northstar-runtime-coordination";

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
});
