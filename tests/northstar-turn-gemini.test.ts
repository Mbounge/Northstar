import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarGeminiTurnModel } from "@/lib/canvas-ai/northstar-turn-gemini";
import { NorthstarTurnProviderError } from "@/lib/canvas-ai/northstar-turn-executor";

test("the Gemini adapter performs exactly one provider request", async () => {
  let calls = 0;
  const model = createNorthstarGeminiTurnModel({
    apiKey: "test-key",
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"decision":"ready-to-finalize","reason":"done"}' }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const result = await model.generateJSON({
    operation: "decide-next-activity",
    systemInstruction: "system",
    userPrompt: "user",
    responseSchema: { decision: "string" },
    maxOutputTokens: 100,
    temperature: 0,
    signal: new AbortController().signal,
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { decision: "ready-to-finalize", reason: "done" });
});

test("provider errors are classified without hidden retry", async () => {
  let calls = 0;
  const model = createNorthstarGeminiTurnModel({
    apiKey: "test-key",
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "rate limited", status: "RESOURCE_EXHAUSTED" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "retry-after": "2" },
      });
    },
  });
  await assert.rejects(
    model.generateJSON({
      operation: "execute-task-attempt",
      systemInstruction: "system",
      userPrompt: "user",
      responseSchema: {},
      maxOutputTokens: 100,
      temperature: 0,
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof NorthstarTurnProviderError && error.retryable && error.retryAfterMs === 2_000,
  );
  assert.equal(calls, 1);
});
