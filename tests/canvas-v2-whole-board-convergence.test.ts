import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compileCanvasV2CompositionState, reconcileCanvasV2CompositionState, validateCanvasV2CompositionContinuity } from "../lib/canvas-v2/composition-continuity";
import type { CanvasV2CompositionState } from "../lib/canvas-v2/types";

const previous: CanvasV2CompositionState = {
  dominantAnchor: "thesis",
  readingOrder: ["thesis", "analysis"],
  regions: [
    { nodeId: "thesis", islandId: "thesis", purpose: "Frame the argument", maturity: "resolved", openRequirements: [] },
    { nodeId: "analysis", islandId: "analysis", purpose: "Develop the comparison", maturity: "developing", openRequirements: ["Add the final observed handoff"] },
  ],
  preservedNodeIds: ["thesis"],
  retiredNodes: [],
  preservedStrengths: ["The thesis is legible at whole-board scale."],
  nextTerritory: { relation: "below", anchorNodeId: "analysis", intendedFootprint: "A readable evidence-led synthesis band.", rationale: "The argument needs its proof beneath the framing." },
  regressionRisks: ["Do not collapse the thesis into the evidence rail."],
};

function state(overrides: Partial<CanvasV2CompositionState> = {}): CanvasV2CompositionState {
  return {
    ...previous,
    readingOrder: ["thesis", "analysis", "implication"],
    regions: [
      { nodeId: "thesis", islandId: "thesis", purpose: "Frame the argument", maturity: "resolved", openRequirements: [] },
      { nodeId: "analysis", islandId: "analysis", purpose: "Develop the comparison", maturity: "resolved", openRequirements: [] },
      { nodeId: "implication", islandId: "implication", purpose: "Close with the executive implication", maturity: "developing", openRequirements: ["State the executive implication"] },
    ],
    preservedNodeIds: ["thesis", "analysis"],
    retiredNodes: [],
    nextTerritory: { relation: "right", anchorNodeId: "implication", intendedFootprint: "A compact close beside the analysis.", rationale: "Complete the reading sequence without rebuilding resolved work." },
    ...overrides,
  };
}

const completeDocument = {
  html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="thesis" data-canvas-v2-design-region></section><section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region></section><section data-canvas-v2-node-id="implication" data-canvas-v2-design-region></section></main>',
  css: "",
};

test("resolved whole-board regions cannot silently disappear between visible turns", () => {
  const document = {
    html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region></section><section data-canvas-v2-node-id="implication" data-canvas-v2-design-region></section></main>',
    css: "",
  };
  const failures = validateCanvasV2CompositionContinuity({ previous, next: state({ preservedNodeIds: ["analysis"] }), document, decision: "edit" });
  assert.match(failures.join(" "), /thesis disappeared without an explicit/);
});

test("an intentional recomposition may retire a region only with a visible replacement", () => {
  const next = state({
    dominantAnchor: "analysis",
    regions: [
      { nodeId: "analysis", purpose: "Develop the comparison", maturity: "resolved" },
      { nodeId: "implication", purpose: "Absorb and improve the former thesis", maturity: "developing" },
    ],
    readingOrder: ["analysis", "implication"],
    preservedNodeIds: ["analysis"],
    retiredNodes: [{ nodeId: "thesis", reason: "The implication now carries the sharper framing.", replacementNodeId: "implication" }],
  });
  const replacementDocument = { ...completeDocument, html: completeDocument.html.replace('<section data-canvas-v2-node-id="thesis" data-canvas-v2-design-region></section>', "") };
  assert.deepEqual(validateCanvasV2CompositionContinuity({ previous, next, document: replacementDocument, decision: "edit" }), []);
});

test("completion requires an observed resolved ledger and no next territory", () => {
  const unfinished = validateCanvasV2CompositionContinuity({ previous, next: state(), document: completeDocument, decision: "complete" });
  assert.match(unfinished.join(" "), /nextTerritory\.relation to be none/);
  assert.match(unfinished.join(" "), /explicitly resolved/);

  const resolved = state({
    regions: state().regions.map((region) => ({ ...region, maturity: "resolved" as const, openRequirements: [] })),
    nextTerritory: { relation: "none", anchorNodeId: "thesis", intendedFootprint: "The complete authored surface.", rationale: "The whole-board and local reads are reconciled." },
  });
  assert.deepEqual(validateCanvasV2CompositionContinuity({ previous, next: resolved, document: completeDocument, decision: "complete" }), []);
});

test("clerical model-ledger hallucinations cannot discard a valid authored turn", () => {
  const reconciled = reconcileCanvasV2CompositionState(state({
    dominantAnchor: "invented-anchor",
    readingOrder: ["thesis", "invented-reading-node", "analysis"],
    regions: [
      { nodeId: "thesis", purpose: "Frame the argument", maturity: "resolved" },
      { nodeId: "invented-region", purpose: "A clerical hallucination", maturity: "developing" },
      { nodeId: "analysis", purpose: "Develop the comparison", maturity: "resolved" },
    ],
    preservedNodeIds: ["thesis", "rep-awin-row-DOES-NOT-EXIST"],
    nextTerritory: { relation: "below", anchorNodeId: "invented-anchor", intendedFootprint: "A compact close.", rationale: "Finish the argument." },
  }), completeDocument);
  assert.ok(reconciled);
  assert.equal(reconciled.dominantAnchor, "thesis");
  assert.deepEqual(reconciled.readingOrder, ["thesis", "analysis"]);
  assert.deepEqual(reconciled.regions.map((region) => region.nodeId), ["thesis", "analysis"]);
  assert.deepEqual(reconciled.preservedNodeIds, ["thesis"]);
  assert.equal(reconciled.nextTerritory.anchorNodeId, "thesis");
  assert.deepEqual(validateCanvasV2CompositionContinuity({ previous, next: reconciled, document: completeDocument, decision: "edit" }), []);
});

test("island lifecycle survives turns while canonical evidence is already resolved", () => {
  const document = {
    html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="canonical-awin" data-canvas-v2-canonical-flow="awin"></section><section data-canvas-v2-node-id="analysis" data-canvas-v2-island-id="analysis" data-canvas-v2-design-region><img data-canvas-v2-node-id="copy-one" data-canvas-v2-copy-evidence-id="screen-1"></section></main>',
    css: "",
  };
  const developing = compileCanvasV2CompositionState({
    document,
    materialMove: "Build the observed sequence",
    preservedStrengths: ["The rail is legible"],
    regressionRisks: ["Do not remove the witness"],
    targetIsland: { action: "create", islandId: "analysis", storyRole: "analysis", resultingMaturity: "developing", resolutionRationale: "The island still needs its conclusion.", openRequirements: ["Add the executive conclusion"] },
    requiredEvidenceIds: ["screen-1"],
    target: { relation: "below", anchorNodeId: "analysis", intendedFootprint: "Finish the island", rationale: "Complete its argument" },
  });
  assert.equal(developing.regions.find((region) => region.nodeId === "canonical-awin")?.maturity, "resolved");
  assert.deepEqual(developing.regions.find((region) => region.nodeId === "analysis")?.openRequirements, ["Add the executive conclusion"]);

  const resolved = compileCanvasV2CompositionState({
    previous: developing,
    document,
    materialMove: "Finish the observed sequence",
    preservedStrengths: ["The rail is legible"],
    regressionRisks: ["Do not remove the witness"],
    targetIsland: { action: "enrich", islandId: "analysis", storyRole: "analysis", resultingMaturity: "resolved", resolutionRationale: "The observed sequence and conclusion are complete.", openRequirements: [] },
    requiredEvidenceIds: [],
    target: { relation: "none", anchorNodeId: "analysis", intendedFootprint: "The completed island", rationale: "The island is resolved" },
  });
  const island = resolved.regions.find((region) => region.nodeId === "analysis");
  assert.equal(island?.maturity, "resolved");
  assert.deepEqual(island?.openRequirements, []);
  assert.deepEqual(island?.requiredEvidenceIds, ["screen-1"]);

  const recomposed = compileCanvasV2CompositionState({
    previous: resolved,
    document,
    materialMove: "Recompose the complete story without changing island lifecycle truth",
    preservedStrengths: ["The island is complete"],
    regressionRisks: ["Do not reopen or erase it"],
    targetIsland: { action: "recompose", islandId: "__whole-board__", storyRole: "whole-board", resultingMaturity: "unchanged", resolutionRationale: "Only whole-board geometry changes.", openRequirements: [] },
    requiredEvidenceIds: [],
    target: { relation: "recompose", anchorNodeId: "analysis", intendedFootprint: "A clearer board", rationale: "Improve reading order" },
  });
  assert.equal(recomposed.regions.find((region) => region.nodeId === "analysis")?.maturity, "resolved");
  assert.deepEqual(recomposed.regions.find((region) => region.nodeId === "analysis")?.requiredEvidenceIds, ["screen-1"]);
});

test("whole-board memory remains model authored and factual geometry remains score free", () => {
  const types = readFileSync("lib/canvas-v2/types.ts", "utf8");
  const observation = readFileSync("lib/canvas-v2/spatial-observation.ts", "utf8");
  const context = readFileSync("lib/canvas-v2/model-context.ts", "utf8");
  assert.match(types, /interface CanvasV2CompositionState/);
  assert.match(types, /CanvasV2SurfaceZoneObservation/);
  assert.match(observation, /observeAuthoredSurface/);
  assert.match(context, /authoredSurface/);
  assert.doesNotMatch(`${types}\n${observation}`, /aestheticScore|premiumScore|qualityThreshold/);
});
