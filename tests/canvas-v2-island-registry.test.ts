import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasV2IslandRegistry,
  canvasV2AllocatedIslandId,
  canvasV2CommittedIslandIdsForSourceValidation,
  canvasV2IslandSourceExcerpt,
  reconcileCanvasV2OpenRequirements,
  reconcileCanvasV2EvidenceRelativeIslandOrder,
  validateCanvasV2IslandExecution,
} from "../lib/canvas-v2/island-registry";
import type { CanvasV2CompositionState, CanvasV2RenderObservation } from "../lib/canvas-v2/types";

const bounds = { x: 100, y: 200, width: 400, height: 300 };
const observation = {
  spatial: {
    designRegions: [{
      nodeId: "insight-island",
      islandId: "insight-island",
      label: "Friction analysis",
      visualRole: "sequence-analysis",
      placementMode: "evidence-relative-island",
      targetZoneId: "bottom-left",
      textPreview: "A focused sequence reading",
      bounds,
      canvasWidthShare: 0.2,
      canvasHeightShare: 0.3,
      canvasAreaShare: 0.06,
      centerXShare: 0.2,
      centerYShare: 0.7,
      edgeSpace: { left: 100, top: 200, right: 500, bottom: 400 },
      contentOverflowX: 0,
      contentOverflowY: 0,
      clipsOverflow: false,
    }],
    evidence: [{
      evidenceId: "screen-1",
      nodeId: "copy-1",
      role: "analysis-copy",
      designRegionNodeId: "insight-island",
      bounds,
      naturalWidth: 360,
      naturalHeight: 780,
      objectFit: "contain",
      visible: true,
      clippingAncestorNodeIds: [],
      croppingRisk: false,
      aspectRatioDistorted: false,
    }],
    authoredAnnotations: [{ nodeId: "note-1", targetNodeIds: ["copy-1"], bounds }],
    authoredRelationships: [{ nodeId: "link-1", tagName: "svg", sourceNodeIds: ["insight-island"], targetNodeIds: ["copy-1"], bounds }],
  },
} as unknown as CanvasV2RenderObservation;

const compositionState: CanvasV2CompositionState = {
  dominantAnchor: "insight-island",
  readingOrder: ["insight-island"],
  regions: [{ nodeId: "insight-island", islandId: "insight-island", purpose: "Explain the first-value handoff", maturity: "developing", placementMode: "evidence-relative-island", targetZoneId: "bottom-left" }],
  preservedNodeIds: [],
  retiredNodes: [],
  preservedStrengths: [],
  nextTerritory: { relation: "right", anchorNodeId: "insight-island", intendedFootprint: "A second analytical island", rationale: "Complete the comparison" },
  regressionRisks: [],
};

test("the rendered board compiles into a focused island registry", () => {
  const registry = buildCanvasV2IslandRegistry({ observation, compositionState });
  assert.equal(registry.length, 1);
  assert.deepEqual(registry[0], {
    islandId: "insight-island",
    nodeId: "insight-island",
    storyRole: "analysis",
    label: "Friction analysis",
    purpose: "Explain the first-value handoff",
    maturity: "developing",
    openRequirements: [],
    requiredEvidenceIds: [],
    missingRequiredEvidenceIds: [],
    placementMode: "evidence-relative-island",
    targetZoneId: "bottom-left",
    visualRole: "sequence-analysis",
    bounds,
    centerXShare: 0.2,
    centerYShare: 0.7,
    canvasAreaShare: 0.06,
    evidenceIds: ["screen-1"],
    annotationNodeIds: ["note-1"],
    relationshipNodeIds: ["link-1"],
    textPreview: "A focused sequence reading",
  });
});

test("island registry exposes unresolved requirements and missing assigned evidence", () => {
  const registry = buildCanvasV2IslandRegistry({
    observation,
    compositionState: {
      ...compositionState,
      regions: [{
        ...compositionState.regions[0],
        resolutionRationale: "The comparison still needs its closing witness.",
        openRequirements: ["Add the closing observed screen"],
        requiredEvidenceIds: ["screen-1", "screen-2"],
      }],
    },
  });
  assert.equal(registry[0].resolutionRationale, "The comparison still needs its closing witness.");
  assert.deepEqual(registry[0].openRequirements, ["Add the closing observed screen"]);
  assert.deepEqual(registry[0].requiredEvidenceIds, ["screen-1", "screen-2"]);
  assert.deepEqual(registry[0].missingRequiredEvidenceIds, ["screen-2"]);
});

test("semantic requirement paraphrases retain exact committed lifecycle wording", () => {
  const existing = [
    "Complete an explicit assumptions ledger with OBSERVED FACTS, ASSUMPTIONS, and OPEN QUESTIONS treatment.",
    "Complete the evidence-to-decision pathway showing what input would unlock each decision gate.",
    "Review and refine the NOW / NEXT / LATER actions and prerequisite gates after the dependency field is rendered.",
  ];
  assert.deepEqual(reconcileCanvasV2OpenRequirements(existing, [
    "Complete the assumptions ledger with OBSERVED FACTS, ASSUMPTIONS, and OPEN QUESTIONS treatment.",
    "Review and refine the NOW / NEXT / LATER actions and prerequisite gates after the ledger and evidence pathway are integrated.",
  ]), [existing[0], existing[2]]);
  assert.deepEqual(reconcileCanvasV2OpenRequirements(existing, [
    "Add decorative polish and a celebratory footer.",
  ]), ["Add decorative polish and a celebratory footer."]);
  const workshop = [
    "Complete the remaining Challenge, Commit, and Write the decision chapters elsewhere on the canvas.",
    "Add participant instructions, working agreements, timer cues, voting or prioritization affordances, and a parking lot across the finished workshop surface.",
  ];
  assert.deepEqual(reconcileCanvasV2OpenRequirements(workshop, [
    "Complete the Write the decision chapter with chosen segment, rationale, owner, next experiment, success signal, and review date.",
    "Add visible voting or prioritization affordances for the Commit phase.",
    "Add a parking lot for unresolved questions.",
  ]), workshop);
});

test("island allocation, focused source, and execution are deterministic", () => {
  assert.equal(canvasV2AllocatedIslandId("revision:ABC 123", 4), "island-revision-abc-123-4");
  const previous = { html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="insight-island" data-canvas-v2-island-id="insight-island" data-canvas-v2-story-role="analysis" data-canvas-v2-design-region><p>Focused source</p></section></main>', css: "" };
  const island = buildCanvasV2IslandRegistry({ observation, compositionState })[0];
  assert.match(canvasV2IslandSourceExcerpt(previous, island) ?? "", /Focused source/);
  const existing = new Set(["insight-island"]);
  const created = { ...previous, html: previous.html.replace("</main>", '<section data-canvas-v2-node-id="island-new-2" data-canvas-v2-island-id="island-new-2" data-canvas-v2-story-role="analysis" data-canvas-v2-design-region></section></main>') };
  assert.deepEqual(validateCanvasV2IslandExecution({ previous, next: created, target: { action: "create", islandId: "island-new-2", storyRole: "analysis", resultingMaturity: "developing", resolutionRationale: "The island has one remaining comparison stage.", openRequirements: ["Add the final stage"] }, existingIslandIds: existing }), []);
  const packedCreate = { ...created, html: created.html.replace("</main>", '<section data-canvas-v2-node-id="unallocated-island" data-canvas-v2-island-id="unallocated-island" data-canvas-v2-story-role="implication" data-canvas-v2-design-region></section></main>') };
  assert.match(validateCanvasV2IslandExecution({ previous, next: packedCreate, target: { action: "create", islandId: "island-new-2", storyRole: "analysis", resultingMaturity: "resolved", resolutionRationale: "The bounded analysis is complete.", openRequirements: [] }, existingIslandIds: existing }).join(" "), /only its allocated island/);
  const analyticalH1 = { ...previous, html: previous.html.replace("</main>", '<section data-canvas-v2-node-id="island-new-2" data-canvas-v2-island-id="island-new-2" data-canvas-v2-story-role="analysis" data-canvas-v2-design-region><h1>Publication thesis</h1></section></main>') };
  assert.match(validateCanvasV2IslandExecution({ previous, next: analyticalH1, target: { action: "create", islandId: "island-new-2", storyRole: "analysis", resultingMaturity: "resolved", resolutionRationale: "The analysis is complete.", openRequirements: [] }, existingIslandIds: existing }).join(" "), /separate title island/);
  assert.deepEqual(validateCanvasV2IslandExecution({ previous, next: previous, target: { action: "enrich", islandId: "insight-island", storyRole: "analysis", resultingMaturity: "resolved", resolutionRationale: "Every intended stage is present.", openRequirements: [] }, existingIslandIds: existing }), []);
  assert.match(validateCanvasV2IslandExecution({ previous, next: previous, target: { action: "develop", islandId: "missing", storyRole: "analysis", resultingMaturity: "developing", resolutionRationale: "The island still needs evidence.", openRequirements: ["Add evidence"] }, existingIslandIds: existing }).join(" "), /exact existing island identity/);
  assert.match(validateCanvasV2IslandExecution({ previous, next: created, target: { action: "create", islandId: "island-new-2", storyRole: "analysis", resultingMaturity: "developing", resolutionRationale: "The selected witness must be placed.", openRequirements: ["Place the witness"] }, existingIslandIds: existing, requiredEvidenceIds: ["screen-1"] }).join(" "), /materially contain every evidence selection/);
  const groundedCreated = { ...previous, html: previous.html.replace("</main>", '<section data-canvas-v2-node-id="island-new-2" data-canvas-v2-island-id="island-new-2" data-canvas-v2-story-role="analysis" data-canvas-v2-design-region><img data-canvas-v2-node-id="copy-1" data-canvas-v2-evidence-id="screen-1"></section></main>') };
  assert.deepEqual(validateCanvasV2IslandExecution({ previous, next: groundedCreated, target: { action: "create", islandId: "island-new-2", storyRole: "analysis", resultingMaturity: "developing", resolutionRationale: "The selected witness is now present.", openRequirements: ["Finish the interpretation"] }, existingIslandIds: existing, requiredEvidenceIds: ["screen-1"] }), []);
  const overlapExemption = { ...previous, html: previous.html.replace("</main>", '<section data-canvas-v2-node-id="island-new-2" data-canvas-v2-island-id="island-new-2" data-canvas-v2-story-role="analysis" data-canvas-v2-design-region data-canvas-v2-evidence-interleave="cover the rail"></section></main>') };
  assert.match(validateCanvasV2IslandExecution({ previous, next: overlapExemption, target: { action: "create", islandId: "island-new-2", storyRole: "analysis", resultingMaturity: "developing", resolutionRationale: "The island is still being composed.", openRequirements: ["Finish the reading"] }, placementMode: "evidence-relative-island", existingIslandIds: existing }).join(" "), /cannot declare data-canvas-v2-evidence-interleave/);
});

test("a hidden rejected create candidate never becomes committed island truth", () => {
  const committed = canvasV2CommittedIslandIdsForSourceValidation(
    new Set(["existing-island", "pending-title"]),
    {
      target: {
        action: "create",
        islandId: "pending-title",
        storyRole: "title",
        resultingMaturity: "resolved",
        resolutionRationale: "The title is complete.",
        openRequirements: [],
      },
      territory: {
        relation: "above",
        anchorNodeId: "canonical-evidence",
        intendedFootprint: "One full-width opening strip.",
        rationale: "Begin the story above the evidence.",
        placementMode: "evidence-relative-island",
        targetZoneId: "top-left",
      },
      requiredEvidenceIds: [],
      requiredEvidenceHandles: [],
      requiredVisualRoles: ["narrative-title"],
      directorCheckpointJson: JSON.stringify({ materialMove: "Create the narrative opening." }),
    },
  );
  assert.deepEqual(Array.from(committed), ["existing-island"]);
  assert.deepEqual(
    Array.from(canvasV2CommittedIslandIdsForSourceValidation(new Set(["existing-island"]))),
    ["existing-island"],
  );
});

test("the compiler places above and below islands on the promised side of canonical evidence", () => {
  const document = {
    html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="grounded-evidence" data-canvas-v2-evidence-region="canonical"><p>Evidence</p></section><section data-canvas-v2-node-id="title" data-canvas-v2-island-id="title" data-canvas-v2-design-region><h1>Title</h1></section><section data-canvas-v2-node-id="analysis" data-canvas-v2-island-id="analysis" data-canvas-v2-design-region><h2>Analysis</h2></section></main>',
    css: "",
  };
  const execution = {
    target: {
      action: "create" as const,
      islandId: "title",
      storyRole: "title" as const,
      resultingMaturity: "resolved" as const,
      resolutionRationale: "The title is complete.",
      openRequirements: [],
    },
    territory: {
      relation: "above" as const,
      anchorNodeId: "grounded-evidence",
      intendedFootprint: "Opening strip.",
      rationale: "Begin above evidence.",
      placementMode: "evidence-relative-island" as const,
      targetZoneId: "top-left" as const,
    },
    requiredEvidenceIds: [],
    requiredEvidenceHandles: [],
    requiredVisualRoles: ["narrative-title"],
  };
  const titleFirst = reconcileCanvasV2EvidenceRelativeIslandOrder({ document, execution });
  assert.ok(titleFirst.html.indexOf('data-canvas-v2-node-id="title"') < titleFirst.html.indexOf('data-canvas-v2-node-id="grounded-evidence"'));

  const analysisLast = reconcileCanvasV2EvidenceRelativeIslandOrder({
    document: titleFirst,
    execution: {
      ...execution,
      target: { ...execution.target, islandId: "analysis", storyRole: "analysis" },
      territory: { ...execution.territory, relation: "below", targetZoneId: "bottom-center" },
    },
  });
  assert.ok(analysisLast.html.indexOf('data-canvas-v2-node-id="analysis"') > analysisLast.html.indexOf('data-canvas-v2-node-id="grounded-evidence"'));
  assert.match(analysisLast.html, /<section[^>]*grounded-evidence[^>]*>[\s\S]*?<\/section><section[^>]*analysis/);
});
