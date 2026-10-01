import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { proxy } from "../proxy";

test("the exact bearer-authenticated marketing publisher bypasses browser sign-in", async () => {
  const response = await proxy(new NextRequest("https://www.usenorthstar.ai/api/internal/marketing-publish", {
    method: "POST",
    headers: { authorization: "Bearer invalid-test-token" },
  }));

  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("nearby internal API routes still require browser sign-in", async () => {
  const response = await proxy(new NextRequest("https://www.usenorthstar.ai/api/internal/marketing-publish/other", {
    method: "POST",
  }));

  assert.notEqual(response.headers.get("x-middleware-next"), "1");
});
