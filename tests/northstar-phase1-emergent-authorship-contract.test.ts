import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadNorthstarDesignReferenceParts } from "@/lib/canvas-ai/northstar-design-reference-pack";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const emergent = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-creative-authorship.ts"), "utf8");
const adapter = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-creative-model-adapter.ts"), "utf8");

test("Phase 1 does not preselect a visual concept before live authorship", () => {
  assert.equal(route.includes("NORTHSTAR_CREATIVE_EXPLORATION_JSON_SCHEMA"), false);
  assert.equal(route.includes("NORTHSTAR_CREATIVE_SELECTION_JSON_SCHEMA"), false);
  assert.equal(route.includes("buildCreativeExplorationModelInput"), false);
  assert.equal(route.includes("buildCreativeSelectionModelInput"), false);
  assert.equal(route.includes("creative.authorship.ready"), true);
  assert.equal(route.includes("no visual option was preselected"), true);
});

test("the same provider-neutral model boundary authors and critiques live acts", () => {
  assert.equal(adapter.includes("authorCreativeAct"), true);
  assert.equal(adapter.includes("critiqueRenderedAct"), true);
  assert.equal(route.includes("creativeModel.authorCreativeAct"), true);
  assert.equal(route.includes("creativeModel.critiqueRenderedAct"), true);
  assert.equal(route.includes("creative.act.critiqued"), true);
});

test("rendered critique is committed to adaptive memory before the next observation cycle", () => {
  assert.equal(route.includes("creativeModel.critiqueRenderedAct"), true);
  assert.equal(route.includes("adaptiveSession.recordCritique"), true);
  assert.equal(route.includes("preparedMovePromise"), false);
  assert.equal(route.includes("adaptiveSession.decideContinuation"), true);
});

test("unlabeled reference conditioning exposes images without named layout lessons", async () => {
  const parts = await loadNorthstarDesignReferenceParts({ mode: "unlabeled-taste" });
  const text = parts.flatMap((part) => "text" in part ? [part.text] : []).join("\n");
  assert.equal(text.includes("REFERENCE —"), false);
  assert.equal(text.includes("Problem solved:"), false);
  assert.equal(text.includes("Learn:"), false);
  assert.equal(text.includes("Do not classify the images"), true);
  assert.equal(parts.filter((part) => "inlineData" in part).length, 8);
});

test("creative authorship exposes tools, not visual families or artboard sizing", () => {
  assert.equal(emergent.includes("There are no visual families, templates, archetypes"), true);
  assert.equal(emergent.includes("Never emit request-space"), true);
  assert.equal(emergent.includes("createNorthstarEmergentCreativeDirection"), true);
  assert.equal(emergent.includes("No concept was preselected"), true);
});
