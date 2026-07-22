import assert from "node:assert/strict";
import test from "node:test";
import { buildCanvasArtifactRuntimeDocument } from "@/lib/canvas-artifacts/runtime-document";
import type { CanvasCodeArtifactPayload } from "@/lib/canvas-artifacts/types";

function pendingArtifact(): CanvasCodeArtifactPayload {
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "artifact-runtime",
    surfaceId: "artifact-runtime",
    revisionId: "revision-candidate",
    parentRevisionId: "revision-committed",
    pendingAckToken: "artifact-runtime:proposal-1",
    title: "Runtime liveness test",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: '<main data-ns-node-id="artboard"><section data-ns-node-id="evidence"></section></main>',
      css: "main{display:block}",
      javascript: "",
    },
    mutationJournal: [{
      schema: "northstar.artboard-mutation.v1",
      mutationId: "mutation-pending",
      sequence: 1,
      label: "Pending evidence",
      phase: "evidence",
      intent: "Show evidence",
      visibleChange: "Evidence appears",
      geometryIntent: "preserve",
      transitionMs: 320,
      operations: [{
        op: "insert-html",
        targetId: "evidence",
        position: "beforeend",
        html: '<article data-ns-node-id="proof">Proof</article>',
      }],
      createdAt: "2026-07-20T00:00:00.000Z",
    }],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Test",
      audience: "Test",
      artifactType: "comparison",
      coverageSummary: "Test",
      apps: [],
      flows: [],
      screenshots: [],
      hypotheses: [],
      decisions: [],
      corrections: [],
      openQuestions: [],
      allowedAssetUrls: [],
    },
    status: "ready",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    preferredWidth: 1200,
    preferredHeight: 800,
    minimumWidth: 1200,
    minimumHeight: 800,
    buildState: {
      phase: "complete",
      completedSteps: 1,
      totalSteps: 1,
      message: "Ready",
      isBuilding: false,
    },
  };
}

test("a pending proposal mounts from its committed parent and is not replayed as committed state", () => {
  const runtime = buildCanvasArtifactRuntimeDocument(pendingArtifact());
  assert.ok(runtime);
  assert.match(runtime, /let currentRevisionId = "revision-committed";/);
  assert.match(runtime, /const INITIAL_JOURNAL = \[\];/);
  assert.doesNotMatch(runtime, /mutation-pending/);
});

test("the runtime schedules terminal audits at both stability and asset deadlines", () => {
  const runtime = buildCanvasArtifactRuntimeDocument(pendingArtifact());
  assert.ok(runtime);
  assert.match(runtime, /3_100, 8_100/);
});
test("the browser runtime stages candidates offscreen and exposes explicit Git-like projection commands", () => {
  const runtime = buildCanvasArtifactRuntimeDocument(pendingArtifact());
  assert.ok(runtime);
  assert.match(runtime, /data-ns-staging-host/);
  assert.match(runtime, /northstar\.artifact\.stage-proposal/);
  assert.match(runtime, /northstar\.artifact\.proposal-prepared/);
  assert.match(runtime, /northstar\.artifact\.activate-commit/);
  assert.match(runtime, /northstar\.artifact\.commit-projected/);
  assert.match(runtime, /northstar\.artifact\.checkout-commit/);
  assert.match(runtime, /opacity: "0"/);
  assert.doesNotMatch(runtime, /visibility: "hidden"/);
});