import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
