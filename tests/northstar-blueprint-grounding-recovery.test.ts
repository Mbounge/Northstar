import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("exhausted semantic blueprint retries recover from verified evidence before lifecycle settlement", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
  const start = route.indexOf("async function buildCompositionBlueprint");
  const end = route.indexOf("function buildCompositionActionSteps", start);
  const implementation = route.slice(start, end);

  assert.match(implementation, /catch \(secondError\)[\s\S]*throwIfGeminiInfrastructureError\(secondError\)/);
  assert.match(
    implementation,
    /catch \(secondError\)[\s\S]*blueprint = buildDeterministicCompositionBlueprintRecovery\(\{[\s\S]*intent,[\s\S]*message,[\s\S]*researchLedger,[\s\S]*toolResults/,
  );
});

test("deterministic recovery is grounded through the same evidence boundary", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
  const start = route.indexOf("function buildDeterministicCompositionBlueprintRecovery");
  const end = route.indexOf("async function buildCompositionBlueprint", start);
  const recovery = route.slice(start, end);

  assert.match(recovery, /const grounded = collectGroundedCompositionContext\(toolResults\)/);
  assert.match(recovery, /availableScreenIds\.has\(id\)/);
  assert.match(recovery, /return groundCompositionBlueprint\(/);
});
