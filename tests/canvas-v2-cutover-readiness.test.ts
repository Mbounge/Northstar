import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the Phase 7E.3 canonical cutover has one V2 owner and one redirect alias", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-canvas-v2-cutover-readiness.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  assert.match(result.stdout, /Canvas V2 canonical cutover verified/);
});
