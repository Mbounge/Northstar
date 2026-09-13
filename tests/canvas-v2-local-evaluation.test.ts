import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canvasV2DeterministicEvaluationEnabled } from "../e2e/canvas-v2-deterministic-evaluation";

import {
  CANVAS_V2_LOCAL_EVALUATION_TENANT_ID,
  canvasV2LocalEvaluationEnabled,
  emptyCanvasV2LocalEvaluationCatalog,
} from "../lib/canvas-v2/local-evaluation";

test("local production evaluation is explicit and impossible in production", () => {
  assert.equal(canvasV2LocalEvaluationEnabled({ NODE_ENV: "development", CANVAS_V2_PRODUCTION_EVALUATION: "1" }), true);
  assert.equal(canvasV2LocalEvaluationEnabled({ NODE_ENV: "development" }), false);
  assert.equal(canvasV2LocalEvaluationEnabled({ NODE_ENV: "production", CANVAS_V2_PRODUCTION_EVALUATION: "1" }), false);
});

test("deterministic canvas evaluation requires both local flags and fails closed in production", () => {
  const flags = { NORTHSTAR_E2E: "1", CANVAS_V2_DETERMINISTIC_EVALUATION: "1" };
  assert.equal(canvasV2DeterministicEvaluationEnabled({ ...flags, NODE_ENV: "development" }), true);
  assert.equal(canvasV2DeterministicEvaluationEnabled({ ...flags, NODE_ENV: "production" }), false);
  assert.equal(canvasV2DeterministicEvaluationEnabled({ NODE_ENV: "development", NORTHSTAR_E2E: "1" }), false);
  assert.equal(canvasV2DeterministicEvaluationEnabled({ NODE_ENV: "development", CANVAS_V2_DETERMINISTIC_EVALUATION: "1" }), false);
});

test("unauthenticated evaluation receives no account evidence", () => {
  assert.deepEqual(emptyCanvasV2LocalEvaluationCatalog(), {
    tenantId: CANVAS_V2_LOCAL_EVALUATION_TENANT_ID,
    apps: [],
  });
});

test("the local evaluation gate covers the production canvas model boundary", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  const router = readFileSync("app/api/canvas-v2/route/route.ts", "utf8");
  const design = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const research = readFileSync("app/api/canvas-v2/research/route.ts", "utf8");
  assert.match(proxy, /canvasV2LocalEvaluationEnabled\(\)[\s\S]*startsWith\("\/api\/canvas-v2\/"\)/);
  assert.match(router, /!user && !canvasV2LocalEvaluationEnabled\(\)/);
  assert.match(design, /!user && !localEvaluation/);
  assert.match(research, /!user && !localEvaluation/);
});

test('the canonical Codex evaluation requires explicit local flags and a matching loopback browser origin', async () => {
  const { canvasV2LocalCodexEvaluationAllowed } = await import('../e2e/canvas-v2-deterministic-evaluation');
  const flags = { NODE_ENV:'development', NORTHSTAR_E2E:'1', NORTHSTAR_CODEX_LIVE_TEST:'1' };
  const request = (url='http://127.0.0.1:3122/api/canvas-v2/codex', origin='http://127.0.0.1:3122', host='127.0.0.1:3122') => new Request(url,{headers:{origin,host}});
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request(),flags),true);
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request(),{...flags,NODE_ENV:'production'}),false);
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request(),{...flags,NODE_ENV:undefined}),false);
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request(),{...flags,NORTHSTAR_CODEX_LIVE_TEST:undefined}),false);
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request(),{...flags,NORTHSTAR_E2E:undefined}),false);
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request(undefined,'http://foreign.example'),flags),false);
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request(undefined,'',''),flags),false);
  assert.equal(canvasV2LocalCodexEvaluationAllowed(request('https://northstar.example/api/canvas-v2/codex','https://northstar.example','northstar.example'),flags),false);
});

test('canonical discovery defaults to Codex and rollback choices are explicit', async () => {
  const { northstarDiscoveryEndpoint } = await import('../lib/canvas-v2/managed-agent/config');
  assert.equal(northstarDiscoveryEndpoint(),'/api/canvas-v2/codex');
  assert.equal(northstarDiscoveryEndpoint('codex'),'/api/canvas-v2/codex');
  assert.equal(northstarDiscoveryEndpoint('legacy'),undefined);
  assert.equal(northstarDiscoveryEndpoint('agents'),'/api/canvas-v2/agent');
  assert.throws(()=>northstarDiscoveryEndpoint('typo'),/Unknown/);
});
