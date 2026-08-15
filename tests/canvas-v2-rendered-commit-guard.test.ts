import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a visually unsafe candidate is repaired from its exact hidden render before commit", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(hook, /MAX_RENDER_REPAIRS = 3/);
  assert.match(hook, /validateCanvasV2RenderedAnalysisEvidenceScale\(observation\)/);
  assert.match(hook, /validateCanvasV2RenderedDesignRegionContentIntegrity\(observation\)/);
  assert.match(hook, /validateCanvasV2RenderedDesignRegionTerritoryIntegrity\(observation\)/);
  assert.match(hook, /validateCanvasV2RenderedIslandNarrativeIntegrity\(observation\)/);
  const territoryCheck = hook.indexOf("validateCanvasV2RenderedDesignRegionTerritoryIntegrity(observation)");
  assert.match(hook, /validateCanvasV2RenderedRelationshipGeometry\(observation\)/);
  assert.match(hook, /setCandidate\(undefined\)/);
  assert.match(hook, /void askModel\(repairLoop, candidate, observation, committed\)/);
  assert.match(hook, /commitParent: CanvasV2ArtifactRevision = revision/);
  assert.match(hook, /parent: commitParent/);
  assert.match(hook, /rejectedCandidateContext\(candidate\.document, observation\)/);
  assert.match(hook, /islandExecution: pendingEdit\.islandExecution/);
  assert.match(hook, /cssTail: document\.css\.slice\(-18_000\)/);
  assert.match(hook, /scaleVsCanonicalHeight/);
  assert.match(hook, /const displayed = committed/);
  assert.match(hook, /inspectionCandidate: candidate/);
  assert.match(workspace, /canvas-v2-candidate-inspection-surface/);
  assert.match(workspace, /revision=\{engine\.inspectionCandidate\}/);
  assert.match(workspace, /left: -100_000/);

  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  assert.match(route, /compactCanvasV2RenderRepair/);
  assert.match(route, /RENDER REPAIR PASS/);
  assert.match(route, /rejectedCandidate/);
  assert.match(route, /renderRepairInstruction/);
  assert.match(route, /The uncommitted candidate failed rendered-integrity validation/);
  assert.match(route, /Render repair must preserve the exact failed island transaction/);
  assert.match(route, /repairExecutionContract/);

  const integrityCheck = hook.indexOf("const integrityFailures = [");
  const commit = hook.indexOf("const nextCommitted = commitCanvasV2Candidate", integrityCheck);
  assert.ok(integrityCheck >= 0 && commit > integrityCheck, "rendered integrity must be checked before candidate commit");
  assert.ok(territoryCheck >= integrityCheck && commit > territoryCheck, "canonical territory must be checked before candidate commit");
});
