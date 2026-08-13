import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canvasV2RouteMutatesArtboard,
  parseCanvasV2InteractionDecision,
} from "../lib/canvas-v2/interaction-router";

const selection = { nodeId: "finding-title", tagName: "h2", textPreview: "Finding", textEditable: true, locked: false, bounds: { x: 40, y: 60, width: 280, height: 44 } };

test("conversation and inspection resolve without canvas instructions", () => {
  const conversation = parseCanvasV2InteractionDecision({ route: "conversation", summary: "Answer here.", answer: "Hello." }, "Hello");
  const inspection = parseCanvasV2InteractionDecision({ route: "inspect", summary: "Read the board.", answer: "The board is empty." }, "What is visible?");
  assert.equal(conversation.answer, "Hello.");
  assert.equal(inspection.answer, "The board is empty.");
  assert.equal(canvasV2RouteMutatesArtboard(conversation.route), false);
  assert.equal(canvasV2RouteMutatesArtboard(inspection.route), false);
  assert.equal(conversation.canvasInstruction, undefined);
});

test("design and research routes carry a self-contained canvas instruction", () => {
  for (const route of ["transform", "research-design"] as const) {
    const decision = parseCanvasV2InteractionDecision({ route, summary: "Begin visible work.", canvasInstruction: "Compose the requested board." }, "Make a board");
    assert.equal(canvasV2RouteMutatesArtboard(decision.route), true);
    assert.equal(decision.canvasInstruction, "Compose the requested board.");
  }
  const research = parseCanvasV2InteractionDecision({
    route: "research-design",
    summary: "Ground both products.",
    canvasInstruction: "Compare Awin with Ghost.",
    researchTargets: ["Awin", "Ghost", "awin"],
    researchMode: "synthesis",
  }, "Compare Awin with Ghost");
  assert.deepEqual(research.researchTargets, ["Awin", "Ghost"]);
  assert.equal(research.researchMode, "synthesis");
});

test("selection transformation requires and preserves the exact stable target", () => {
  assert.throws(() => parseCanvasV2InteractionDecision({ route: "selection-transform", summary: "Edit it.", canvasInstruction: "Make it concise." }, "Make it concise"), /Select an artboard element/);
  const decision = parseCanvasV2InteractionDecision({ route: "selection-transform", summary: "Edit it.", canvasInstruction: "Make it concise." }, "Make it concise", selection);
  assert.match(decision.canvasInstruction || "", /finding-title/);
  assert.match(decision.canvasInstruction || "", /Transform only the selected stable canvas node/);
});

test("the chat controller delegates only mutating routes to the observed design loop", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/route/route.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(hook, /canvasV2RouteMutatesArtboard/);
  assert.match(hook, /if \(!canvasV2RouteMutatesArtboard\(decision\.route\)\)/);
  assert.match(hook, /input\.engine\.start\(decision\.canvasInstruction/);
  assert.match(route, /Route by semantic intent, not by word matching/);
  for (const interaction of ["conversation", "inspect", "transform", "research-design", "selection-transform"]) assert.match(route, new RegExp(interaction));
  assert.match(workspace, /routerEndpoint="\/api\/canvas-v2\/route"|routerEndpoint = "\/api\/canvas-v2\/route"/);
  assert.doesNotMatch(`${hook}\n${route}\n${workspace}`, /@\/lib\/canvas-ai\//);
});
