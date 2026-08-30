import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canvasV2AuthoritativeCanvasInstruction,
  canvasV2AuthoritativeUserRequest,
  canvasV2ExplicitExternalResearchRequested,
  canvasV2ResearchTargetSupportedByUserMessage,
  canvasV2RouteMutatesCanvas,
  parseCanvasV2InteractionDecision,
} from "../lib/canvas-v2/interaction-router";

const inquiry = {
  relationship: "new",
  objective: "Resolve the requested question",
  desiredOutcome: "A grounded answer",
  framing: "What should the evidence change?",
  inquiryKind: "evidence-synthesis",
  evidenceNeed: "useful",
  sourceCategories: ["canvas"],
  materialUnknowns: ["The requested fact is not on the canvas."],
  completionCriteria: ["The material fact is grounded."],
  rationale: "Evidence can improve the answer.",
};

const selection = { nodeId: "finding-title", tagName: "h2", textPreview: "Finding", textEditable: true, locked: false, hidden: false, bounds: { x: 40, y: 60, width: 280, height: 44 } };

test("conversation and inspection resolve without canvas instructions", () => {
  const conversation = parseCanvasV2InteractionDecision({ route: "conversation", summary: "Answer here.", answer: "Hello." }, "Hello");
  const inspection = parseCanvasV2InteractionDecision({ route: "inspect", summary: "Read the board.", answer: "The board is empty." }, "What is visible?");
  assert.equal(conversation.answer, "Hello.");
  assert.equal(inspection.answer, "The board is empty.");
  assert.equal(canvasV2RouteMutatesCanvas(conversation.route), false);
  assert.equal(canvasV2RouteMutatesCanvas(inspection.route), false);
  assert.equal(conversation.canvasInstruction, undefined);
});

test("design and research routes carry a self-contained canvas instruction", () => {
  for (const route of ["transform", "research-design"] as const) {
    const decision = parseCanvasV2InteractionDecision({ route, summary: "Begin visible work.", canvasInstruction: "Compose the requested board." }, "Make a board");
    assert.equal(canvasV2RouteMutatesCanvas(decision.route), true);
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

test("routing paraphrases cannot erase the user's journey scope", () => {
  const instruction = canvasV2AuthoritativeCanvasInstruction(
    "Compare Awin and Whop onboarding",
    "Build a comparison of the two monetization journeys.",
  );
  assert.match(instruction, /two monetization journeys/);
  assert.match(instruction, /Authoritative user request/);
  assert.match(instruction, /Awin and Whop onboarding/);
  assert.equal(
    canvasV2AuthoritativeCanvasInstruction("Compare Awin onboarding", "Compare Awin onboarding with clear evidence."),
    "Compare Awin onboarding with clear evidence.",
  );
});

test("router prose cannot manufacture binding spatial authority", () => {
  const routed = canvasV2AuthoritativeCanvasInstruction(
    "Compare Awin and Whop onboarding and keep the working surface visible.",
    "Create a comparison island beside the grounded evidence.",
  );
  assert.equal(
    canvasV2AuthoritativeUserRequest(routed),
    "Compare Awin and Whop onboarding and keep the working surface visible.",
  );
  assert.doesNotMatch(canvasV2AuthoritativeUserRequest(routed), /\bbeside\b/i);
  assert.match(
    canvasV2AuthoritativeUserRequest("Place a separate composition beside the evidence."),
    /\bbeside\b/i,
  );
});

test("router research targets cannot invent a more specific product flow than the person named", () => {
  const message = "Build a balanced executive comparison of Awin and Whop onboarding.";
  assert.equal(canvasV2ResearchTargetSupportedByUserMessage("Awin", message), true);
  assert.equal(canvasV2ResearchTargetSupportedByUserMessage("Whop — User Onboarding", message), true);
  assert.equal(canvasV2ResearchTargetSupportedByUserMessage("Awin — Links", message), false);
  assert.equal(canvasV2ResearchTargetSupportedByUserMessage("Awin Creator & Influencer Onboarding", message), false);
  const decision = parseCanvasV2InteractionDecision({
    route: "research-design",
    summary: "Ground both products.",
    canvasInstruction: message,
    researchTargets: ["Awin — Links", "Awin", "Whop"],
    researchMode: "synthesis",
    inquiry,
  }, message);
  assert.deepEqual(decision.researchTargets, ["Awin", "Whop"]);
});

test("an explicit public-web request cannot be routed into research-design without external evidence", () => {
  const message = "Research the current official OpenAI web-search capability using official sources.";
  const decision = parseCanvasV2InteractionDecision({
    route: "research-design",
    summary: "Verify the capability.",
    canvasInstruction: message,
    researchTargets: [],
    researchMode: "synthesis",
    inquiry,
  }, message);
  assert.equal(canvasV2ExplicitExternalResearchRequested(message), true);
  assert.equal(decision.inquiry?.evidenceNeed, "required");
  assert.equal(decision.inquiry?.sourceCategories.includes("external"), true);
  assert.equal(canvasV2ExplicitExternalResearchRequested("Create a timeless market-entry decision canvas from the facts I supplied."), false);
});

test("selection transformation requires and preserves the exact stable target", () => {
  assert.throws(() => parseCanvasV2InteractionDecision({ route: "selection-transform", summary: "Edit it.", canvasInstruction: "Make it concise." }, "Make it concise"), /Select an canvas element/);
  const decision = parseCanvasV2InteractionDecision({ route: "selection-transform", summary: "Edit it.", canvasInstruction: "Make it concise." }, "Make it concise", selection);
  assert.equal(decision.selectionPolicy, "modify");
  assert.match(decision.canvasInstruction || "", /finding-title/);
  assert.match(decision.canvasInstruction || "", /Transform only the selected stable canvas node/);

  const reference = parseCanvasV2InteractionDecision({ route: "selection-transform", selectionPolicy: "reference", summary: "Compare it.", canvasInstruction: "Create a comparison." }, "Compare this", selection);
  assert.equal(reference.selectionPolicy, "reference");
  assert.match(reference.canvasInstruction || "", /immutable evidence|Preserve every selected object exactly/);
});

test("the chat controller delegates only mutating routes to the observed design loop", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/route/route.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(hook, /canvasV2RouteMutatesCanvas/);
  assert.match(hook, /if \(!canvasV2RouteMutatesCanvas\(decision\.route\)\)/);
  assert.match(hook, /canvasV2AuthoritativeCanvasInstruction/);
  assert.match(hook, /input\.engine\.start\(canvasInstruction/);
  assert.match(route, /Route by semantic intent, not by word matching/);
  assert.match(route, /Evidence is optional/);
  assert.match(route, /creative construction, planning, facilitation, organization, speculative exploration/);
  assert.match(route, /A prompt can produce a complete premium canvas without research/);
  assert.match(route, /journey\/session type/);
  assert.match(route, /discoveryModelContext: modelContext\.discoveryModelContext/);
  assert.doesNotMatch(route, /discoveryWorkingSet: modelContext\.discoveryWorkingSet/);
  assert.match(route, /evidenceSummary:/);
  for (const interaction of ["conversation", "inspect", "transform", "research-design", "selection-transform"]) assert.match(route, new RegExp(interaction));
  assert.match(workspace, /routerEndpoint="\/api\/canvas-v2\/route"|routerEndpoint = "\/api\/canvas-v2\/route"/);
  assert.doesNotMatch(`${hook}\n${route}\n${workspace}`, /@\/lib\/canvas-ai\//);
});
