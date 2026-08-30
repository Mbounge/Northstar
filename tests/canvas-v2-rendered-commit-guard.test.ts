import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a visually unsafe candidate receives compiler repair before one bounded emergency correction", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(hook, /MAX_EMERGENCY_RENDER_CORRECTIONS = 1/);
  assert.match(hook, /validateCanvasV2RenderedAnalysisEvidenceScale\(factualObservation\)/);
  assert.match(hook, /validateCanvasV2RenderedDesignRegionContentIntegrity\(factualObservation\)/);
  assert.match(hook, /validateCanvasV2RenderedDesignRegionLegibility\(factualObservation\)/);
  assert.match(hook, /validateCanvasV2RenderedDesignRegionTerritoryIntegrity\(factualObservation\)/);
  assert.match(hook, /validateCanvasV2RenderedIslandNarrativeIntegrity\(factualObservation\)/);
  assert.match(hook, /validateCanvasV2RenderedRelationshipGeometry\(factualObservation\)/);
  assert.match(hook, /invalidCanvasV2RenderedRelationshipNodeIds\(factualObservation\)/);
  assert.match(hook, /retireCanvasV2BrokenAuthoredRelationships\(candidate\.document, invalidRelationshipNodeIds\)/);
  assert.match(hook, /id\("relationship-recovery-revision"\)/);
  assert.match(hook, /publishLoop\(\{ \.\.\.activeLoop, status: "rendering" \}\)/);
  assert.match(hook, /setCandidate\(undefined\)/);
  assert.match(hook, /const wholeBoard = execution\.target\.action === "recompose"/);
  assert.match(hook, /const exactPlacementRepair = execution\.target\.action === "repair"/);
  assert.match(hook, /\["above", "below", "left", "right"\]\.includes\(execution\.territory\.relation\)/);
  assert.match(hook, /node\.sourceNodeId !== exactPlacementRepair/);
  assert.match(hook, /enqueueModelRequest\(repairLoop, repairRevision, repairObservation, publicCommitted\)/);
  assert.match(hook, /hasDeterministicTypeFloorFailures/);
  assert.match(hook, /repairCanvasV2RenderedDesignRegionTypeFloors\(candidate\.document, factualObservation\)/);
  assert.match(hook, /commitParent: CanvasV2ArtifactRevision = revision/);
  assert.match(hook, /revision\.id !== commitParent\.id \|\| revision\.id !== committedRef\.current\.id/);
  assert.match(hook, /cannot complete from an uncommitted render candidate/);
  assert.match(hook, /parent: commitParent/);
  assert.doesNotMatch(hook, /PRIVATE_DRAFT_PAUSE_MESSAGE/);
  assert.match(hook, /recoverCanvasV2LoopFromCommittedTruth/);
  assert.match(hook, /rejectedCandidateContext\(candidate\.document, factualObservation\)/);
  assert.match(hook, /const displayed = committed/);
  assert.match(hook, /inspectionCandidate: candidate/);
  assert.match(workspace, /canvas-v2-candidate-inspection-surface/);
  assert.match(workspace, /revision=\{engine\.inspectionCandidate\}/);
  assert.match(workspace, /relocatablePlacementNodeIds=\{engine\.inspectionRelocatableNodeIds\}/);
  assert.match(workspace, /left: -100_000/);

  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  assert.match(route, /CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS/);
  assert.doesNotMatch(route, /maxInvalidResponsesPerModel:\s*[3-9]/);
  assert.doesNotMatch(route, /explicitPromptCoverageFailures: promptCoverageFailures/);

  const nativeScene = readFileSync("lib/canvas-v2/native-scene.ts", "utf8");
  assert.match(nativeScene, /relocatablePlacementNodeIds/);
  assert.match(nativeScene, /removeAttribute\("data-canvas-v2-scene-layout"\)/);
  assert.match(nativeScene, /if \(relocatablePlacementNodeIds\.has\(node\.sourceNodeId\)\) continue/);

  const integrityCheck = hook.indexOf("const otherNonRelationshipIntegrityFailures = [");
  const territoryCheck = hook.indexOf("validateCanvasV2RenderedDesignRegionTerritoryIntegrity(factualObservation)", integrityCheck);
  const commit = hook.indexOf("const nextCommitted = commitCanvasV2Candidate", integrityCheck);
  assert.ok(integrityCheck >= 0 && commit > integrityCheck, "rendered integrity must be checked before candidate commit");
  assert.ok(territoryCheck >= integrityCheck && commit > territoryCheck, "canonical territory must be checked before candidate commit");
});

test("private failures replan from committed truth without a visible checkpoint or count-based product gate", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  assert.doesNotMatch(hook, /MAX_STALLED_ORCHESTRATION_REQUESTS|orchestrationRequestCounts|PROTECTED_WORK_BUDGET_MESSAGE|canvasV2ProviderRunBudgetStatus|budgetPause/);
  assert.doesNotMatch(route, /canvasV2ProviderRunBudgetStatus|budgetPause|safe checkpoint after repeated internal attempts/);
  assert.match(hook, /recoverCanvasV2LoopFromCommittedTruth/);
  assert.match(hook, /enqueueModelRequest\(recoveryLoop/);
  assert.doesNotMatch(hook, /publishLoop\(failCanvasV2Loop\(loop, message\)\)/);
  assert.doesNotMatch(hook, /pauseCanvasV2Loop|PRIVATE_DRAFT_PAUSE_MESSAGE/);
});

test("every production model phase allows only one emergency correction", () => {
  const reliability = readFileSync("lib/canvas-v2/provider-reliability.ts", "utf8");
  assert.match(reliability, /CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS = 2/);
  for (const file of [
    "app/api/canvas-v2/route/route.ts",
    "app/api/canvas-v2/design/route.ts",
    "lib/canvas-v2/external-evidence-provider.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /maxInvalidResponsesPerModel: CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS/);
    assert.doesNotMatch(source, /maxInvalidResponsesPerModel:\s*[3-9]/);
  }
});
