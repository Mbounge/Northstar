import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  clearCanvasDiagnostics,
  exportCanvasDiagnostics,
  recordNorthstarDesignTurnAuditArchive,
} from "../lib/canvas-ai/canvas-diagnostics";

test("diagnostic export deduplicates exact boundary payloads by SHA-256", () => {
  clearCanvasDiagnostics();
  const packageValue = { revisionId: "revision-1", document: { html: "<main>exact</main>" } };
  recordNorthstarDesignTurnAuditArchive({
    schema: "test.archive",
    runId: "run-1",
    artifactId: "artifact-1",
    turn: 1,
    recordedAt: new Date(0).toISOString(),
    sourceBefore: { package: packageValue },
    sourceAfter: { package: packageValue },
  });

  const exported = JSON.parse(exportCanvasDiagnostics());
  const sha256 = createHash("sha256").update(JSON.stringify(packageValue)).digest("hex");
  assert.equal(exported.schema, "northstar.canvas-diagnostics.v5");
  assert.equal(exported.designTurnAuditArchives[0].sourceBefore.package.sha256, sha256);
  assert.equal(exported.designTurnAuditArchives[0].sourceAfter.package.sha256, sha256);
  assert.deepEqual(exported.payloads[sha256].value, packageValue);
  assert.equal(Object.keys(exported.payloads).length, 1);
  clearCanvasDiagnostics();
});

test("provider wire payloads retain audit metadata without duplicating request bodies", () => {
  clearCanvasDiagnostics();
  recordNorthstarDesignTurnAuditArchive({
    schema: "test.archive",
    runId: "run-2",
    artifactId: "artifact-1",
    turn: 1,
    recordedAt: new Date(0).toISOString(),
    modelBoundary: {
      providerAttempts: [{
        requestUrl: "https://provider.invalid",
        requestBody: { full: "large repeated prompt" },
        requestBodyBytes: 32,
        requestBodySha256: "request-sha",
        providerPayload: { full: "duplicated provider envelope" },
        providerPayloadBytes: 44,
        providerPayloadSha256: "payload-sha",
        rawModelText: "duplicated raw response",
        rawModelTextBytes: 23,
        rawModelTextSha256: "response-sha",
        responseStatus: 429,
      }],
    },
  });

  const attempt = JSON.parse(exportCanvasDiagnostics()).designTurnAuditArchives[0].modelBoundary.providerAttempts[0];
  assert.equal(attempt.requestBody, undefined);
  assert.equal(attempt.providerPayload, undefined);
  assert.equal(attempt.rawModelText, undefined);
  assert.equal(attempt.requestBodySha256, "request-sha");
  assert.equal(attempt.providerPayloadSha256, "payload-sha");
  assert.equal(attempt.rawModelTextSha256, "response-sha");
  assert.equal(attempt.responseStatus, 429);
  clearCanvasDiagnostics();
});
