import assert from "node:assert/strict";
import test from "node:test";
import { isUuid } from "../lib/admin/uuid";

test("capture and tenant IDs accept the full five-part UUID", () => {
  assert.equal(isUuid("5bb37919-ddf0-4150-b8d9-b8c93cd1b7d5"), true);
  assert.equal(isUuid("5bb37919-ddf0-4150-b8c93cd1b7d5"), false);
  assert.equal(isUuid("5bb37919-ddf0-4150-b8d9-b8c93cd1b7dg"), false);
});
