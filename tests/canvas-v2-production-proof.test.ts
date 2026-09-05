import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the historical Phase 7E.2 record is intact and explicitly cannot certify current source", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-canvas-v2-production-proof.mjs", "--historical"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  assert.match(result.stdout, /historical authenticated production proof verified/);
});

test("production certification fails closed for historical or deterministic-only receipts", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-canvas-v2-production-proof.mjs"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot certify this build|Live production certification remains unverified/);
});
