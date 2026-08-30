import assert from "node:assert/strict";
import test from "node:test";

import { readCanvasV2ResearchResponse } from "../components/canvas-v2/use-canvas-v2-research";

test("Canvas V2 research returns a successful result", async () => {
  const response = new Response(JSON.stringify({
    result: { operation: "list-apps", apps: [], flows: [], screens: [], evidence: [], packets: [] },
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await readCanvasV2ResearchResponse(response);
  assert.equal(result.operation, "list-apps");
});

test("Canvas V2 research surfaces the server's account-service message", async () => {
  const response = new Response(JSON.stringify({ error: "Sign in to access Northstar account data." }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

  await assert.rejects(() => readCanvasV2ResearchResponse(response), /Sign in to access Northstar account data/);
});

test("Canvas V2 research never exposes an HTML-to-JSON parser error", async () => {
  const response = new Response("<!DOCTYPE html><title>Internal Server Error</title>", {
    status: 500,
    headers: { "content-type": "text/html" },
  });

  await assert.rejects(() => readCanvasV2ResearchResponse(response), /Northstar account evidence is temporarily unavailable/);
});
