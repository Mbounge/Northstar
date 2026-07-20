import assert from "node:assert/strict";
import test from "node:test";
import {
  materializeNorthstarBrowserCommit,
  sanitizeNorthstarLiveSnapshot,
  stripNorthstarRuntimeScaffolding,
} from "@/lib/canvas-ai/northstar-transaction-kernel";
import type { CanvasCodeArtifactPayload } from "@/lib/canvas-artifacts/types";

function artifact(): CanvasCodeArtifactPayload {
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "artifact-1",
    revisionId: "revision-2",
    parentRevisionId: "revision-1",
    title: "Test",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: '<main data-ns-node-id="artboard">old</main>',
      css: "main{display:block}",
      javascript: "",
    },
    mutationJournal: [{ mutationId: "mutation-2" }] as CanvasCodeArtifactPayload["mutationJournal"],
    pendingAckToken: "artifact-1:proposal-2",
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    preferredWidth: 2360,
    preferredHeight: 3800,
    intrinsicBounds: { minX: 0, minY: 0, maxX: 2360, maxY: 3800 },
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

test("runtime-owned spatial systems never survive a canonical snapshot", () => {
  const polluted = [
    '<main data-ns-node-id="artboard">',
    '<section data-ns-node-id="evidence">Evidence</section>',
    '<div data-ns-runtime-owned="true" data-ns-spatial-system="true"><svg><path /></svg></div>',
    '<article><div data-ns-spatial-system="true"><span>duplicate overlay</span></div>Authored</article>',
    "</main>",
  ].join("");
  const clean = stripNorthstarRuntimeScaffolding(polluted);
  assert.doesNotMatch(clean, /data-ns-(?:runtime-owned|spatial-system)/);
  assert.match(clean, /Evidence/);
  assert.match(clean, /Authored/);
});

test("legacy runtime overlay CSS is removed while authored CSS is retained", () => {
  const clean = sanitizeNorthstarLiveSnapshot({
    html: '<main data-ns-node-id="artboard">Authored</main>',
    css: 'main{display:grid}\n[data-ns-spatial-system]{position:absolute}\n.ns-spatial-path{fill:none}',
    capturedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(clean?.css, "main{display:grid}");
});

test("the exact clean terminal geometry replaces provisional requested height", () => {
  const committed = materializeNorthstarBrowserCommit(artifact(), {
    artifactId: "artifact-1",
    revisionId: "revision-2",
    mutationId: "mutation-2",
    size: {
      artifactId: "artifact-1",
      revisionId: "revision-2",
      mutationId: "mutation-2",
      measuredAt: "2026-01-01T00:00:01.000Z",
      intrinsicWidth: 2360,
      intrinsicHeight: 1380,
      contentBounds: { minX: 0, minY: 0, maxX: 2360, maxY: 1380 },
      settled: true,
      sequence: 9,
    },
    snapshot: {
      html: '<main data-ns-node-id="artboard"><section>Accepted</section><div data-ns-spatial-system="true">runtime</div></main>',
      css: "main{display:block}",
      capturedAt: "2026-01-01T00:00:01.000Z",
    },
  });
  assert.equal(committed.preferredHeight, 1380);
  assert.deepEqual(committed.intrinsicBounds, { minX: 0, minY: 0, maxX: 2360, maxY: 1380 });
  assert.equal(committed.pendingAckToken, undefined);
  assert.deepEqual(committed.mutationJournal, []);
  assert.doesNotMatch(committed.document?.html ?? "", /data-ns-spatial-system/);
  assert.match(committed.document?.html ?? "", /Accepted/);
});

test("a stale browser revision cannot overwrite the visible canonical object", () => {
  const current = artifact();
  const stale = materializeNorthstarBrowserCommit(current, {
    artifactId: "artifact-1",
    revisionId: "revision-1",
    size: {
      artifactId: "artifact-1",
      revisionId: "revision-1",
      measuredAt: "2026-01-01T00:00:01.000Z",
      intrinsicWidth: 1200,
      intrinsicHeight: 800,
    },
  });
  assert.equal(stale, current);
});