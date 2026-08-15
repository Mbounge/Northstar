import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_DEFAULT_MODEL,
  CANVAS_V2_MODEL_CATALOG,
  CANVAS_V2_SELECTABLE_MODELS,
  canvasV2DesignModelChain,
  canvasV2ProviderForModel,
  parseCanvasV2ModelSelection,
} from "../lib/canvas-v2/model-catalog";
import {
  buildCanvasV2StructuredProviderRequest,
  extractCanvasV2StructuredText,
} from "../lib/canvas-v2/structured-provider";

test("the active Canvas V2 cost policy executes Luna and never escalates to Terra or Sol", () => {
  assert.equal(CANVAS_V2_DEFAULT_MODEL, "gpt-5.6-luna");
  assert.deepEqual(canvasV2DesignModelChain(CANVAS_V2_DEFAULT_MODEL), ["gpt-5.6-luna"]);
  assert.equal(parseCanvasV2ModelSelection("gpt-5.6-terra"), "gpt-5.6-luna");
  assert.equal(parseCanvasV2ModelSelection("gpt-5.6-sol"), "gpt-5.6-luna");
  assert.throws(() => canvasV2ProviderForModel("gpt-5.6-terra"), /not executable/);
  assert.throws(() => canvasV2ProviderForModel("gpt-5.6-sol"), /not executable/);

  for (const id of ["gpt-5.6-terra", "gpt-5.6-sol"]) {
    const entry = CANVAS_V2_MODEL_CATALOG.find((candidate) => candidate.id === id);
    assert.equal(entry?.enabled, false);
    assert.equal(entry?.selectable, false);
  }
});

test("Gemini choices are explicit pinned selections rather than silent fallbacks", () => {
  const geminiModels = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
  ] as const;
  for (const model of geminiModels) {
    assert.equal(CANVAS_V2_SELECTABLE_MODELS.includes(model), true);
    assert.equal(parseCanvasV2ModelSelection(model), model);
    assert.equal(canvasV2ProviderForModel(model), "google");
    assert.deepEqual(canvasV2DesignModelChain(model), [model]);
    const entry = CANVAS_V2_MODEL_CATALOG.find((candidate) => candidate.id === model);
    assert.equal(entry?.enabled, true);
    assert.equal(entry?.selectable, true);
  }
});

test("the provider-neutral request maps Luna to a private strict Responses API call", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  try {
    const request = buildCanvasV2StructuredProviderRequest({
      model: "gpt-5.6-luna",
      system: "Author one visible move.",
      parts: [
        { text: "Current revision" },
        { inlineData: { mimeType: "image/png", data: "cG5n" } },
      ],
      correction: "patch[0].targetNodeId is missing",
      schemaName: "northstar turn",
      schema: {
        type: "object",
        properties: {
          decision: { type: "string" },
          patches: {
            type: "array",
            items: {
              type: "object",
              properties: { op: { type: "string" }, targetNodeId: { type: "string" } },
            },
          },
        },
      },
      maxOutputTokens: 1_200,
      reasoningEffort: "low",
    });

    assert.equal(request.provider, "openai");
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    const headers = request.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-openai-key");
    const body = JSON.parse(String(request.init.body)) as Record<string, any>;
    assert.equal(body.model, "gpt-5.6-luna");
    assert.equal(body.store, false);
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(body.text.format.schema.required, ["decision", "patches"]);
    assert.deepEqual(body.text.format.schema.properties.patches.items.required, ["op", "targetNodeId"]);
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.match(body.input[0].content[1].image_url, /^data:image\/png;base64,cG5n$/);
    assert.match(body.input[0].content[2].text, /targetNodeId is missing/);
    assert.match(body.input[0].content[2].text, /If it rejects the intended move, target territory, completion choice, or patch content, replace that rejected part rather than repeating it/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("structured text extraction reads Responses API output and refuses silent declines", () => {
  assert.equal(extractCanvasV2StructuredText({
    output: [{ content: [{ type: "output_text", text: "{\"decision\":\"continue\"}" }] }],
  }, "gpt-5.6-luna"), "{\"decision\":\"continue\"}");
  assert.throws(() => extractCanvasV2StructuredText({
    output: [{ content: [{ type: "refusal", refusal: "No." }] }],
  }, "gpt-5.6-luna"), /declined/);
});
