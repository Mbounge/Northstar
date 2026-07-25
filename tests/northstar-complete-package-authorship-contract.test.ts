import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const engine = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-presentation-engine.ts"), "utf8");
const host = fs.readFileSync(path.join(root, "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/canvas/north-star-canvas-workspace.tsx"), "utf8");
const runtimeDocument = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");

test("creative obligations use a typed presentation graph rather than model-authored executable source", () => {
  assert.equal(route.includes("NORTHSTAR_PRESENTATION_DECISION_JSON_SCHEMA"), true);
  assert.equal(route.includes("Never return HTML, CSS, DOM node IDs, selectors, coordinates, or mutation operations."), true);
  assert.equal(route.includes("compileNorthstarPresentationPass"), true);
  assert.equal(route.includes("buildNorthstarFallbackPresentationDecision"), true);
  assert.equal(route.includes("NORTHSTAR_AUTHORED_REVISION_JSON_SCHEMA"), false);
  assert.equal(route.includes("preflightNorthstarSourcePatch"), false);
  assert.equal(engine.includes("NorthstarEditableSurfaceDescriptor"), true);
  assert.equal(engine.includes("NorthstarPresentationDecisionDraft"), true);
});

test("the application owns concrete DOM mutations and evidence-preserving target selection", () => {
  assert.equal(engine.includes('op: "set-attributes"'), true);
  assert.equal(engine.includes('op: "insert-html"'), true);
  assert.equal(engine.includes('op: "set-css-layer"'), true);
  assert.equal(engine.includes("fallbackEvidenceRanking"), true);
  assert.equal(engine.includes("knownEvidenceIds"), true);
});

test("runtime settlement accepts a rejected candidate receipt with the verified base mounted after rollback", () => {
  assert.equal(host.includes("rejectedEnvelopeIsExact"), true);
  assert.equal(host.includes("inFlight?.baseRevisionId"), true);
  assert.equal(workspace.includes("event.name === \"revision.rejected\""), true);
  assert.equal(workspace.includes("event.browserRevisionId === identity.baseRevisionId"), true);
});

test("stale terminal browser reports cannot settle the current proposal", () => {
  assert.equal(host.includes("Ignored stale terminal browser report"), true);
  assert.equal(workspace.includes("settlement.identity_mismatch"), true);
});


test("CSS-driven evidence scaling is classified as a material scale change", () => {
  assert.equal(runtimeDocument.includes('operation.op === "set-css-layer" && /(?:width|height|flex-basis|font-size|transform|scale)'), true);
});
