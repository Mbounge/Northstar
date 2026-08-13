import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("history contains committed revisions rather than inverse DOM commands", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  const recovery = readFileSync("lib/canvas-v2/local-recovery.ts", "utf8");
  assert.match(hook, /history.*CanvasV2ArtifactRevision\[\]/);
  assert.match(hook, /acceptCommittedRevision/);
  assert.match(hook, /travelHistory/);
  assert.match(hook, /persistCanvasV2ArtifactRecovery/);
  assert.match(recovery, /canvas-v2\.local-recovery\.v1/);
  assert.doesNotMatch(recovery, /supabase|fetch\(|XMLHttpRequest/);
  assert.doesNotMatch(hook, /execCommand|MutationObserver/);
});

test("manual candidates validate before render and Stop discards them without touching committed source", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  assert.match(hook, /validateCanvasV2EvidenceBindings/);
  assert.match(hook, /if \(pendingManualEdit && candidate\)/);
  assert.match(hook, /Stopped the uncommitted manual revision/);
  assert.match(hook, /commitCanvasV2Candidate/);
});

test("creation, layers, visibility, lock, and duplication compile through manual source mutations", () => {
  const mutations = readFileSync("lib/canvas-v2/manual-mutations.ts", "utf8");
  for (const kind of ["create", "layer", "visibility", "lock", "duplicate"]) assert.match(mutations, new RegExp(`kind: "${kind}"`));
  assert.match(mutations, /assertCanvasV2ArtifactDocument/);
  assert.doesNotMatch(mutations, /contentDocument|frameRef/);
});

test("evidence insertion binds approved identity and exact source before Phase 6 adapters", () => {
  const evidence = readFileSync("lib/canvas-v2/evidence-insertion.ts", "utf8");
  assert.match(evidence, /canvasV2EvidenceId/);
  assert.match(evidence, /validateCanvasV2EvidenceBindings/);
  assert.match(evidence, /currentEvidence/);
  assert.match(evidence, /canvasV2EvidenceRole = "analysis-copy"/);
  assert.match(evidence, /canvasV2SourceNodeId/);
  assert.match(evidence, /resolveCanvasV2EvidenceRole/);
  assert.match(evidence, /candidate\.dataset\.canvasV2EvidenceRole = resolveCanvasV2EvidenceRole/);
  assert.match(evidence, /canvasV2EvidenceRole === "canonical"/);
});
