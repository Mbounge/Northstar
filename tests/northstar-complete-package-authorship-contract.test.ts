import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const emergent = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-creative-authorship.ts"), "utf8");
const adapter = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-creative-model-adapter.ts"), "utf8");
const host = fs.readFileSync(path.join(root, "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/canvas/north-star-canvas-workspace.tsx"), "utf8");
const runtimeDocument = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");

test("creative obligations use emergent model-authored executable mutations", () => {
  assert.equal(route.includes("createNorthstarGeminiCreativeAdapter"), true);
  assert.equal(route.includes("sanitizeNorthstarEmergentCreativeAct"), true);
  assert.equal(route.includes("compileNorthstarMutationDraft"), true);
  assert.equal(route.includes("NORTHSTAR_PRESENTATION_DECISION_JSON_SCHEMA"), false);
  assert.equal(route.includes("compileNorthstarPresentationPass"), false);
  assert.equal(route.includes("buildNorthstarFallbackPresentationDecision"), false);
  assert.equal(emergent.includes("There are no visual families, templates, archetypes"), true);
});

test("the creative provider boundary is model-neutral", () => {
  assert.equal(adapter.includes("interface NorthstarCreativeModelAdapter"), true);
  assert.equal(adapter.includes("providerId"), true);
  assert.equal(adapter.includes("modelId"), true);
  assert.equal(route.includes("creativeModel.authorCreativeAct"), true);
});

test("the model cannot control artboard dimensions", () => {
  assert.equal(emergent.includes("Never emit request-space"), true);
  assert.equal(emergent.includes('geometryIntent: "preserve"'), true);
  assert.equal(emergent.includes("assertNoModelAuthoredArtboardSizing"), true);
  assert.equal(emergent.includes("The runtime owns content-derived sizing"), true);
});

test("runtime settlement accepts a rejected candidate receipt with the verified base mounted after rollback", () => {
  assert.equal(host.includes("rejectedEnvelopeIsExact"), true);
  assert.equal(host.includes("inFlight?.baseRevisionId"), true);
  assert.equal(workspace.includes("event.name === \"revision.rejected\""), true);
  assert.equal(workspace.includes("candidate.browserRevisionId === identity.baseRevisionId"), true);
});

test("stale terminal browser reports cannot settle the current proposal", () => {
  assert.equal(host.includes("Ignored stale terminal browser report"), true);
  assert.equal(workspace.includes("settlement.identity_mismatch"), true);
});

test("CSS-driven evidence scaling is classified as a material scale change", () => {
  assert.equal(runtimeDocument.includes('operation.op === "set-css-layer" && /(?:width|height|flex-basis|font-size|transform|scale)'), true);
});
