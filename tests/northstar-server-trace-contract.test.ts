import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routePath = path.join(process.cwd(), "app/api/canvas-ai/route.ts");
const source = fs.readFileSync(routePath, "utf8");

test("correlates server work with a stable trace id", () => {
  assert.equal(source.includes('const traceId = makeId("trace")'), true);
  assert.equal(source.includes('send("server.trace"'), true);
  assert.equal(source.includes("durationMs:"), true);
  assert.equal(source.includes("elapsedMs:"), true);
});

test("traces intent, planning, and terminal request health", () => {
  assert.equal(source.includes('sendServerTrace("intent", "completed"'), true);
  assert.equal(source.includes('sendServerTrace("planning", "completed"'), true);
  assert.equal(source.includes('sendServerTrace("request", "completed"'), true);
  assert.equal(source.includes('sendServerTrace("request", "failed"'), true);
});
