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

test("the generated browser transaction bridge is syntactically valid", () => {
  const runtime = buildCanvasArtifactRuntimeDocument(pendingArtifact());
  assert.ok(runtime);
  const scripts = [...runtime.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    assert.doesNotThrow(() => new Function(script));
  }
});

test("model-source geometry is compiled outside the live surface without leaking the host background", () => {
  const artifact = pendingArtifact();
  artifact.document = {
    schema: "northstar.web-artifact-document.v1",
    html: '<main data-ns-node-id="artboard" data-ns-creative-authority="model-source"><section data-ns-node-id="presentation">Source-owned composition</section></main>',
    css: "main{display:grid}",
    javascript: "",
  };
  const runtime = buildCanvasArtifactRuntimeDocument(artifact);
  assert.ok(runtime);
  assert.match(runtime, /body\{position:relative;background:transparent/);
  assert.match(runtime, /html,body\{background:transparent!important\}/);
  assert.match(runtime, /const syncIntrinsicGeometryMode = \(\) =>/);
  assert.match(runtime, /const measureAuthoredContentInIsolation = async/);
  assert.match(runtime, /data-ns-geometry-compiler-host/);
  assert.match(runtime, /const applyCompiledCanonicalGeometry = \(size\) =>/);
  assert.doesNotMatch(runtime, /reconcileAdaptiveSurface/);
  assert.doesNotMatch(runtime, /northstar-source-owned-intrinsic-geometry/);
  assert.match(runtime, /const collectGeometryFacts = \(bounds\) =>/);
  assert.match(runtime, /backgroundLeakRisk/);
  assert.match(runtime, /sourceOwnedSurface: true/);
  assert.match(runtime, /geometryIntegrityReason/);
});

test("candidate source remains visually atomic until the mounted browser settles it", () => {
  const runtime = buildCanvasArtifactRuntimeDocument(pendingArtifact());
  assert.ok(runtime);
  assert.match(runtime, /const beginAtomicCandidateValidation = \(mutationId\) =>/);
  assert.match(runtime, /data-ns-candidate-shield/);
  assert.match(runtime, /root\.style\.setProperty\("opacity", "0", "important"\)/);
  assert.match(runtime, /endAtomicCandidateValidation\(acknowledgement\.mutationId\)/);
  assert.match(runtime, /restoredSize: captureSettledContentSize/);
});

test("source-to-source cinema keeps a retired subtree until its latest relevant descendant beat", () => {
  const runtime = buildCanvasArtifactRuntimeDocument(pendingArtifact());
  assert.ok(runtime);
  assert.match(runtime, /const retirementBeatForSubtree = \(rootNodeId\) =>/);
  assert.match(runtime, /candidateIndex > selectedIndex/);
  assert.match(runtime, /const beatId = retirementBeatForSubtree\(nodeId\)/);
});

test("model-source cinema preserves the authored dramatic sequence instead of inventing semantic beats", () => {
  const artifact = pendingArtifact();
  artifact.document = {
    schema: "northstar.web-artifact-document.v1",
    html: '<main data-ns-node-id="artboard" data-ns-creative-authority="model-source"><section data-ns-node-id="presentation">Source-owned composition</section></main>',
    css: "main{display:grid}",
    javascript: "",
  };
  const runtime = buildCanvasArtifactRuntimeDocument(artifact);
  assert.ok(runtime);
  assert.match(runtime, /const modelSourceAuthority = hasModelSourceAuthority\(\)/);
  assert.match(runtime, /The creative model owns the dramatic sequence/);
  assert.match(runtime, /must not infer/);
  assert.match(runtime, /strictCoverage: false/);
  assert.match(runtime, /Settling the exact authored source/);
});

test("geometry integrity targets readable leaves and evidence rather than grading every authored container", () => {
  const runtime = buildCanvasArtifactRuntimeDocument(pendingArtifact());
  assert.ok(runtime);
  assert.match(runtime, /const isReadableIntegrityTarget = \(element\) =>/);
  assert.match(runtime, /meaningfulElementSet\.has\(element\)/);
  assert.match(runtime, /ancestorClipped/);
  assert.doesNotMatch(runtime, /if \(clippedX \|\| clippedY\) clippedSemanticNodeIds/);
});
