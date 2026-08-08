import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const engine = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");
const fixture = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-artboard-benchmark-fixture.ts"), "utf8");

test("production execution consumes a generic objective queue", () => {
  assert.match(route, /async function runProductionDesignObjectiveQueue/);
  assert.match(route, /objectives: readonly string\[\]/);
  assert.match(route, /for \(const \[objectiveOffset, turnInstruction\] of objectives\.entries\(\)\)/);
  assert.match(route, /instruction: turnInstruction/);
  assert.match(route, /designRuntime: "production-objective-queue"/);
});

test("sequence indices are telemetry and never objective policy", () => {
  assert.match(engine, /export type NorthstarDesignResetTurn = number/);
  assert.match(engine, /turn: \{ type: "integer", minimum: 1 \}/);
  assert.doesNotMatch(engine, /NORTHSTAR_DESIGN_RESET_INSTRUCTION_BY_TURN/);
  assert.doesNotMatch(engine, /turn\s*(?:===|==|!==|!=)\s*[1-7]/);
  assert.doesNotMatch(route, /turn\s*(?:===|==|!==|!=)\s*[1-7]/);
  assert.doesNotMatch(route, /\[1, 2, 3, 4, 5, 6, 7\]/);
});

test("acceptance objectives are isolated from production engine policy", () => {
  assert.match(fixture, /Acceptance input only/);
  assert.match(fixture, /NORTHSTAR_ARTBOARD_BENCHMARK_OBJECTIVES/);
  assert.doesNotMatch(engine, /Hello World|user chooses their role|Awin and Whop onboarding flows/);
});
