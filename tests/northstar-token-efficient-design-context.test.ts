import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildNorthstarCompactDesignTurnSystemInstruction,
  readNorthstarModelTokenUsage,
} from "../lib/canvas-ai/northstar-two-turn-design-reset";

test("provider token usage is retained exactly", () => {
  assert.deepEqual(readNorthstarModelTokenUsage({
    usageMetadata: {
      promptTokenCount: 120,
      cachedContentTokenCount: 40,
      candidatesTokenCount: 35,
      thoughtsTokenCount: 15,
      totalTokenCount: 170,
    },
  }), {
    promptTokenCount: 120,
    cachedContentTokenCount: 40,
    candidatesTokenCount: 35,
    thoughtsTokenCount: 15,
    totalTokenCount: 170,
  });
  assert.equal(readNorthstarModelTokenUsage({}), undefined);
});

test("the compact system instruction keeps the universal singular-turn contract", () => {
  const prompt = buildNorthstarCompactDesignTurnSystemInstruction();
  assert.match(prompt, /exactly one executable mutation operation/i);
  assert.match(prompt, /browser will render and measure the result before you choose another action/i);
  assert.match(prompt, /Preserve protected evidence identity, content, order, visibility, appearance, width, and height/i);
  assert.ok(prompt.length < 4_000, `compact prompt unexpectedly grew to ${prompt.length} characters`);
});

test("the active design loop sends one compact context and records paid usage", () => {
  const route = readFileSync(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("async function runSingularObservedDesignObjectiveQueue");
  const end = route.indexOf("async function runProductionDesignObjectiveQueue", start);
  assert.ok(start >= 0 && end > start);
  const loop = route.slice(start, end);
  assert.match(loop, /buildNorthstarCompactDesignTurnContext/);
  assert.match(loop, /parts: \[\{ text: JSON\.stringify\(modelInput\) \}\]/);
  assert.match(loop, /maxOutputTokens: 6_000/);
  assert.match(loop, /design\.model_usage/);
  assert.match(loop, /design\.model_usage_summary/);
  assert.doesNotMatch(loop, /buildNorthstarDesignResetModelInput\(\{/);
  assert.doesNotMatch(loop, /LAST DESIGN TURN OUTCOME/);
  assert.match(loop, /This objective receives no same-revision retry/);
});
