import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const adapter = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-creative-model-adapter.ts"), "utf8");
const journal = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-creative-journal.ts"), "utf8");
const observation = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-visual-observation.ts"), "utf8");
const review = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-independent-creative-review.ts"), "utf8");

test("Phase 3 gives author and isolated reviewer the exact full artifact and detail views", () => {
  assert.equal(route.includes("captureCreativeObservation"), true);
  assert.equal(route.includes("planNorthstarVisualDetailViews"), true);
  assert.equal(route.includes("buildNorthstarVisualObservationParts"), true);
  assert.equal(route.includes("creativeModel.reviewCreativeArtifact"), true);
  assert.equal(adapter.includes("reviewCreativeArtifact"), true);
});

test("the creative journal detects drift without defining visual families", () => {
  assert.equal(route.includes("creativeJournal"), true);
  assert.equal(journal.includes("cosmeticDriftWarnings"), true);
  assert.equal(journal.includes("visualFamily"), false);
  assert.equal(journal.includes("archetype"), false);
});

test("independent review and observation remain open-ended and runtime-sized", () => {
  assert.equal(review.includes("Do not choose from visual families"), true);
  assert.equal(review.includes("Do not provide HTML, CSS, mutations, or artboard dimensions"), true);
  assert.equal(observation.includes("The runtime, not the model, owns artboard sizing"), true);
  assert.equal(route.includes("focusBounds: planned.bounds"), true);
});

test("major reconsideration is diagnosed from the actual change surface", () => {
  assert.equal(route.includes('"creative.revision.major"'), true);
  assert.equal(route.includes("changedAreaRatio"), true);
  assert.equal(route.includes("structuralOperationCount"), true);
});
