import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  clearCanvasDiagnostics,
  exportCanvasDiagnostics,
  recordNorthstarCandidateSourceArchive,
  settleNorthstarCandidateSourceArchive,
} from "@/lib/canvas-ai/canvas-diagnostics";
import type {
  NorthstarArtboardMutationBatch,
  NorthstarWebArtifactDocument,
} from "@/lib/canvas-artifacts/types";

const root = process.cwd();
const runtime = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");
const coordinator = fs.readFileSync(path.join(root, "lib/canvas-artifacts/content-size-coordinator.ts"), "utf8");
const host = fs.readFileSync(path.join(root, "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");

test("canonical geometry is isolated from the live surface for the complete artboard lifetime", () => {
  assert.match(runtime, /const measureAuthoredContentInIsolation = async/);
  assert.match(runtime, /document\.createElement\("div"\)/);
  assert.doesNotMatch(runtime, /compilerFrame|contentDocument|contentWindow/);
  assert.match(runtime, /root\.cloneNode\(true\)/);
  assert.match(runtime, /const compileCanonicalGeometry = async/);
  assert.match(runtime, /measurementMode: "isolated-compiler"/);
  assert.match(runtime, /pendingAcknowledgement\.compiledSize = compiledSize/);
  assert.match(runtime, /const compileQueuedCanonicalGeometry = async/);
  assert.doesNotMatch(runtime, /reconcileAdaptiveSurface/);
  assert.doesNotMatch(runtime, /adaptiveSurfaceWidth/);
  assert.doesNotMatch(runtime, /adaptiveSurfaceHeight/);
  assert.match(coordinator, /measurementMode === "isolated-compiler"/);
});

test("Phase 3.4 validates candidates atomically and settles rollback authority before transport", () => {
  assert.match(runtime, /beginAtomicCandidateValidation/);
  assert.match(runtime, /endAtomicCandidateValidation/);
  assert.match(runtime, /data-ns-candidate-shield/);
  assert.match(runtime, /restoredSize/);
  assert.match(host, /Settlement is locally authoritative before any network delivery/);
  assert.match(host, /browserRevisionRef\.current = rollbackRevisionId/);
  assert.match(route, /candidateVisibility:\s*"shielded-until-settlement"/);
  assert.match(route, /designIntelligenceNeedsRevisit = true/);
});

test("diagnostic export preserves exact rejected browser-executable source", () => {
  clearCanvasDiagnostics();
  const baseDocument: NorthstarWebArtifactDocument = {
    schema: "northstar.web-artifact-document.v1",
    html: '<main data-ns-node-id="artboard"><section data-ns-node-id="presentation"></section></main>',
    css: "main{display:grid}",
    javascript: "",
  };
  const mutationBatch: NorthstarArtboardMutationBatch = {
    schema: "northstar.artboard-mutation.v1",
    mutationId: "mutation-candidate",
    sequence: 1,
    label: "Candidate",
    phase: "analysis",
    intent: "Create an exact candidate.",
    visibleChange: "A designed comparison appears.",
    geometryIntent: "recompose",
    transitionMs: 320,
    operations: [{
      op: "set-html",
      targetId: "presentation",
      html: '<section class="exact-source">Trust vs. velocity</section>',
    }, {
      op: "set-css-layer",
      layerId: "northstar-creative-source",
      css: ".exact-source{transform:translateX(42px)}",
    }],
    createdAt: "2026-07-29T00:00:00.000Z",
  };
  recordNorthstarCandidateSourceArchive({
    runId: "run-1",
    artifactId: "artifact-1",
    revisionId: "revision-candidate",
    baseRevisionId: "revision-base",
    mutationId: mutationBatch.mutationId,
    baseDocument,
    mutationBatch,
  });
  settleNorthstarCandidateSourceArchive({
    revisionId: "revision-candidate",
    status: "rejected",
    reason: "Browser geometry rejection.",
  });
  const exported = JSON.parse(exportCanvasDiagnostics());
  assert.equal(exported.schema, "northstar.canvas-diagnostics.v3");
  assert.equal(exported.candidateSourceArchives[0].status, "rejected");
  assert.equal(
    exported.candidateSourceArchives[0].mutationBatch.operations[0].html,
    '<section class="exact-source">Trust vs. velocity</section>',
  );
  assert.equal(
    exported.candidateSourceArchives[0].mutationBatch.operations[1].css,
    ".exact-source{transform:translateX(42px)}",
  );
  clearCanvasDiagnostics();
});
