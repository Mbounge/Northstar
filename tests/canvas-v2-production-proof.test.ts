import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the Phase 7E.2 authenticated production proof is complete and secret-free", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-canvas-v2-production-proof.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  assert.match(result.stdout, /Canvas V2 authenticated production proof verified/);
});
