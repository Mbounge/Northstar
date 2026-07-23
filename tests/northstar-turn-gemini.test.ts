import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarGeminiTurnModel } from "@/lib/canvas-ai/northstar-turn-gemini";
import { readNorthstarTurnModelEvidenceMetadata } from "@/lib/canvas-ai/northstar-turn-protocol";
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

test("the Gemini adapter sends bounded screenshot evidence as labeled inline image parts", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const model = createNorthstarGeminiTurnModel({
    apiKey: "test-key",
    fetchImpl: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === "https://assets.example/atlas/welcome.png") {
        return new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Length": "3",
          },
        });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"outcome":"success","result":{"finding":"grounded"}}' }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const result = await model.generateJSON({
    operation: "execute-task-attempt",
    systemInstruction: "system",
    userPrompt: "study the attached evidence",
    responseSchema: { outcome: "string" },
    maxOutputTokens: 100,
    temperature: 0,
    evidenceAssets: [{
      id: "atlas-screen-1",
      title: "Welcome",
      imageUrl: "https://assets.example/atlas/welcome.png",
      appName: "Atlas",
      flowName: "Activation",
      screenshotIndex: 0,
    }],
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, { outcome: "success", result: { finding: "grounded" } });
  assert.equal(requests.length, 2);
  const providerRequest = requests.find((request) => request.url.includes("generativelanguage.googleapis.com"));
  if (!providerRequest) throw new Error("Expected a Gemini provider request.");
  const body = JSON.parse(String(providerRequest.init?.body)) as {
    contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
  };
  const parts = body.contents[0].parts;
  assert.ok(parts.some((part) => part.text?.includes("atlas-screen-1")));
  assert.ok(parts.some((part) => part.inlineData?.mimeType === "image/png" && part.inlineData.data === "AQID"));
});

test("the Gemini adapter continues with an explicit unavailable-evidence report when every screenshot fails to load", async () => {
  let providerCalls = 0;
  let providerBody = "";
  const model = createNorthstarGeminiTurnModel({
    apiKey: "test-key",
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) {
        providerCalls += 1;
        providerBody = String(init?.body);
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"outcome":"success","result":{}}' }] } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("missing", { status: 404, headers: { "Content-Type": "text/plain" } });
    },
  });

  const result = await model.generateJSON({
    operation: "execute-task-attempt",
    systemInstruction: "system",
    userPrompt: "inspect screenshots",
    responseSchema: {
      type: "object",
      properties: { outcome: { type: "string" } },
      required: ["outcome"],
    },
    maxOutputTokens: 100,
    temperature: 0,
    evidenceAssets: [{
      id: "missing-screen",
      title: "Missing",
      imageUrl: "https://assets.example/missing.png",
    }],
    signal: new AbortController().signal,
  });

  assert.equal(providerCalls, 1);
  assert.match(providerBody, /loaded 0 of 1/);
  assert.match(providerBody, /missing-screen \(http-404\)/);
  const body = JSON.parse(providerBody) as {
    generationConfig?: { responseJsonSchema?: unknown; responseMimeType?: string };
  };
  assert.deepEqual(body.generationConfig?.responseJsonSchema, {
    type: "object",
    properties: { outcome: { type: "string" } },
    required: ["outcome"],
  });
  assert.equal(body.generationConfig?.responseMimeType, "application/json");
  assert.deepEqual(readNorthstarTurnModelEvidenceMetadata(result), {
    attachedEvidenceAssetIds: [],
    evidenceAttachmentReport: {
      requestedAssetIds: ["missing-screen"],
      loadedAssetIds: [],
      unavailableAssets: [{ id: "missing-screen", reason: "http-404" }],
    },
  });
});

test("partial screenshot delivery is disclosed to the model instead of being silently skipped", async () => {
  let providerBody: string | undefined;
  const model = createNorthstarGeminiTurnModel({
    apiKey: "test-key",
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/available.png")) {
        return new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/png", "Content-Length": "3" },
        });
      }
      if (url.endsWith("/missing.png")) {
        return new Response("missing", { status: 404, headers: { "Content-Type": "text/plain" } });
      }
      providerBody = String(init?.body);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"outcome":"success","result":{}}' }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const result = await model.generateJSON({
    operation: "execute-task-attempt",
    systemInstruction: "system",
    userPrompt: "inspect screenshots",
    responseSchema: {},
    maxOutputTokens: 100,
    temperature: 0,
    evidenceAssets: [
      { id: "available", title: "Available", imageUrl: "https://assets.example/available.png" },
      { id: "missing", title: "Missing", imageUrl: "https://assets.example/missing.png" },
    ],
    signal: new AbortController().signal,
  });

  assert.ok(providerBody);
  assert.match(providerBody, /loaded 1 of 2/);
  assert.match(providerBody, /missing \(http-404\)/);
  assert.match(providerBody, /Do not claim visual observations for unavailable IDs/);
  assert.deepEqual(readNorthstarTurnModelEvidenceMetadata(result), {
    attachedEvidenceAssetIds: ["available"],
    evidenceAttachmentReport: {
      requestedAssetIds: ["available", "missing"],
      loadedAssetIds: ["available"],
      unavailableAssets: [{ id: "missing", reason: "http-404" }],
    },
  });
});
