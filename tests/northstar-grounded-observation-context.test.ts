import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNorthstarArtboardSemanticGraph,
  buildNorthstarCompactDesignTurnContext,
} from "../lib/canvas-ai/northstar-two-turn-design-reset";
import { buildNorthstarObservedSpatialFacts } from "../lib/canvas-ai/northstar-turn-write-scope";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarCommittedSemanticNode,
  NorthstarGeneratedCodeArtifactPackage,
} from "../lib/canvas-artifacts/types";

function node(nodeId: string, parentId: string, left: number, top: number, width: number, height: number): NorthstarCommittedSemanticNode {
  return {
    nodeId,
    parentId,
    bounds: { left, top, width, height, right: left + width, bottom: top + height },
    normalizedText: "",
    normalizedAttributes: { "data-ns-evidence-id": nodeId },
    normalizedClasses: [],
    normalizedStyles: {},
    subtreeFingerprint: nodeId,
  };
}

const semanticNodes = [
  node("awin-start", "awin-flow", 100, 100, 80, 160),
  node("awin-role", "awin-flow", 220, 100, 80, 160),
  node("whop-start", "whop-flow", 100, 340, 80, 160),
  {
    ...node("hello-world", "artboard", 100, 540, 180, 80),
    normalizedAttributes: { "data-ns-node-id": "hello-world" },
  },
];

const acknowledgement = {
  schema: "northstar.artboard-ack.v1",
  ackToken: "ack",
  artifactId: "artifact",
  surfaceId: "surface",
  revisionId: "revision",
  browserRevisionId: "revision",
  status: "applied",
  size: { intrinsicWidth: 900, intrinsicHeight: 700, minimumWidth: 900, minimumHeight: 700 },
  changedNodeIds: ["hello-world"],
  meaningfulChangedNodeIds: ["hello-world"],
  changeKinds: [],
  requiredAssetUrls: [],
  loadedAssetUrls: [],
  missingAssetUrls: [],
  evidenceRegistry: {
    expectedEvidenceIds: ["screen-start", "screen-role", "whop-start"],
    presentEvidenceIds: ["screen-start", "screen-role", "whop-start"],
    visibleEvidenceIds: ["screen-start", "screen-role", "whop-start"],
    runtimeInheritedEvidenceIds: [],
    unplacedEvidenceIds: [],
    missingEvidenceIds: [],
    presentationManifest: [
      { evidenceId: "screen-start", nodeId: "awin-start", flowId: "awin-flow", index: 0, x: 100, y: 100, width: 80, height: 160, aspectRatio: 0.5, objectFit: "contain", objectPosition: "center", transform: "none" },
      { evidenceId: "screen-role", nodeId: "awin-role", flowId: "awin-flow", index: 1, x: 220, y: 100, width: 80, height: 160, aspectRatio: 0.5, objectFit: "contain", objectPosition: "center", transform: "none" },
      { evidenceId: "whop-start", nodeId: "whop-start", flowId: "whop-flow", index: 10, x: 100, y: 340, width: 80, height: 160, aspectRatio: 0.5, objectFit: "contain", objectPosition: "center", transform: "none" },
    ],
  },
  snapshot: { html: "", css: "", capturedAt: "now", semanticNodes },
  acknowledgedAt: "now",
} as unknown as NorthstarArtifactMutationAcknowledgement;

const artifact = {
  artifactId: "artifact",
  revisionId: "revision",
  document: { html: "", css: "", javascript: "" },
  dataBundle: {
    flows: [
      { id: "awin-flow", screenshotIds: ["screen-start", "screen-role"] },
      { id: "whop-flow", screenshotIds: ["whop-start"] },
    ],
    screenshots: [
      { id: "screen-start", appName: "Awin", flowName: "Onboarding", title: "Welcome", index: 0, journeyStage: "entry", visibleCopy: ["Create links quickly"] },
      { id: "screen-role", appName: "Awin", flowName: "Onboarding", title: "Choose your role", index: 1, journeyStage: "role selection", visibleCopy: ["What describes you?"] },
      { id: "whop-start", appName: "Whop", flowName: "Onboarding", title: "Start", index: 0, journeyStage: "entry", visibleCopy: ["Make money"] },
    ],
  },
} as unknown as NorthstarGeneratedCodeArtifactPackage;

test("semantic evidence identity survives the compact context", () => {
  const graph = buildNorthstarArtboardSemanticGraph({ artifact, acknowledgement });
  const role = graph.evidenceItems.find((item) => item.nodeId === "awin-role");
  assert.equal(role?.title, "Choose your role");
  assert.equal(role?.journeyStage, "role selection");
  assert.equal(graph.evidenceItems.find((item) => item.nodeId === "whop-start")?.index, 0, "ordinals must be flow-local even when the manifest index is global");

  const context = buildNorthstarCompactDesignTurnContext({
    turn: 5,
    instruction: "Add an explanation to the Awin screenshot where the user chooses their role.",
    artifact,
    acknowledgement,
  });
  const evidenceCandidates = context.focus.candidates.filter((candidate) => candidate.kind === "evidence");
  assert.equal(evidenceCandidates[0]?.id, "awin-role");
  assert.deepEqual(context.focus.authoritativeReferents.map((referent) => referent.id), ["awin-role"]);
  assert.ok(context.relevantNodes.some((item) => item.nodeId === "hello-world"), "the last changed authored object must remain observable");
  assert.equal(context.observedSpatialFacts.source, "browser-measurement");
});

test("compact context preserves identity for every evidence item but copy only for focused evidence", () => {
  const context = buildNorthstarCompactDesignTurnContext({
    turn: 2,
    instruction: "Explain the Awin role selection screen.",
    artifact,
    acknowledgement,
    objectiveProgress: {
      objectiveIndex: 1,
      designTurnIndex: 2,
      observedTurns: [{
        actionId: "insert-explanation",
        intent: "Insert one explanation card.",
        successSignal: "The card is visible.",
        baseRevisionId: "previous-revision",
        observedRevisionId: "revision",
        changedNodeIds: ["hello-world"],
        browserStatus: "applied",
        remainingFindings: [],
      }],
    },
  });

  assert.equal(context.evidenceIndex.length, 3);
  assert.ok(context.evidenceIndex.every((item) => !("visibleCopy" in item)));
  assert.equal(context.focusedEvidence[0]?.nodeId, "awin-role");
  assert.deepEqual(context.focusedEvidence[0]?.visibleCopy, ["What describes you?"]);
  assert.deepEqual(context.progress.observedTurnJournal, [{
    actionId: "insert-explanation",
    intent: "Insert one explanation card.",
    successSignal: "The card is visible.",
    baseRevisionId: "previous-revision",
    observedRevisionId: "revision",
    changedNodeIds: ["hello-world"],
    browserStatus: "applied",
    remainingFindings: [],
  }]);
});

test("browser facts expose fit, blockers, and the measured gap before reasoning", () => {
  const facts = buildNorthstarObservedSpatialFacts({
    acknowledgement,
    focusNodeIds: ["awin-start", "awin-role"],
    minimumClearance: 16,
  });
  assert.deepEqual(facts.focusEnvelope, { left: 100, top: 100, right: 300, bottom: 260, width: 200, height: 160 });
  assert.deepEqual(facts.measuredGaps, [{
    parentId: "awin-flow",
    axis: "x",
    beforeNodeId: "awin-start",
    afterNodeId: "awin-role",
    span: 40,
    crossAxisOverlap: 160,
  }]);
  const envelope = facts.availableClearance.find((item) => item.subjectNodeId === "focus-envelope");
  assert.equal(envelope?.bottom, 80);
  assert.equal(envelope?.blockers.bottom, "whop-start");
  assert.ok(facts.nearbyObstacles.some((item) => item.nodeId === "whop-start"));
});

test("the first five objectives receive the semantic and measured facts they need before action", () => {
  const contextFor = (instruction: string) => buildNorthstarCompactDesignTurnContext({
    turn: 1,
    instruction,
    artifact,
    acknowledgement,
  });

  const belowResearch = contextFor("Place a Hello World card below the research.");
  assert.deepEqual(belowResearch.observedSpatialFacts.focusEnvelope, {
    left: 100, top: 100, right: 300, bottom: 500, width: 200, height: 400,
  });
  assert.equal(
    belowResearch.observedSpatialFacts.availableClearance.find((item) => item.subjectNodeId === "focus-envelope")?.bottom,
    40,
  );
  assert.equal(belowResearch.observedSpatialFacts.placementFeasibility.requiredForCurrentObjective, true);
  assert.deepEqual(belowResearch.observedSpatialFacts.placementFeasibility.preferredSides, ["bottom"]);
  assert.deepEqual(
    belowResearch.observedSpatialFacts.placementFeasibility.candidateSlots[0]?.maximumOuterSize,
    { width: 200, height: 16 },
    "the existing card below the research must reduce the browser-proven envelope before reasoning",
  );

  const rightOfResearch = contextFor("Place a Hello World 2 card to the right of the research and vertically center-align it with the research.");
  assert.equal(rightOfResearch.observedSpatialFacts.focusEnvelope?.right, 300);
  assert.equal(rightOfResearch.observedSpatialFacts.focusEnvelope?.top, 100);
  assert.equal(rightOfResearch.observedSpatialFacts.focusEnvelope?.bottom, 500);
  assert.deepEqual(rightOfResearch.observedSpatialFacts.placementFeasibility.preferredSides, ["right"]);
  assert.deepEqual(
    rightOfResearch.observedSpatialFacts.placementFeasibility.candidateSlots[0]?.maximumOuterSize,
    { width: 576, height: 400 },
  );

  const crossFlowRelationship = contextFor("Construct a visual relationship between the first Awin screenshot and the first Whop screenshot.");
  assert.deepEqual(
    crossFlowRelationship.focus.authoritativeReferents
      .map((candidate) => candidate.id)
      .sort(),
    ["awin-start", "whop-start"],
  );
  assert.deepEqual(crossFlowRelationship.focus.referencePairs, [{
    purpose: "authored-relationship",
    firstNodeId: "awin-start",
    secondNodeId: "whop-start",
  }]);
  assert.equal(crossFlowRelationship.observedSpatialFacts.referencePairs[0]?.axis, "y");
  assert.equal(crossFlowRelationship.observedSpatialFacts.referencePairs[0]?.span, 80);
  assert.equal(crossFlowRelationship.observedSpatialFacts.placementFeasibility.requiredForCurrentObjective, false);
  assert.equal(crossFlowRelationship.observedSpatialFacts.placementFeasibility.conclusion, "not-required");
  assert.deepEqual(crossFlowRelationship.observedSpatialFacts.placementFeasibility.candidateSlots, []);

  const between = contextFor("Create equal space between the first and second Awin screenshots and insert an annotation in that space.");
  assert.deepEqual(
    between.observedSpatialFacts.measuredGaps.map(({ beforeNodeId, afterNodeId, span }) => ({ beforeNodeId, afterNodeId, span })),
    [{ beforeNodeId: "awin-start", afterNodeId: "awin-role", span: 40 }],
  );
  assert.deepEqual(between.focus.authoritativeReferents.map((referent) => referent.id), ["awin-start", "awin-role"]);
  assert.equal(between.observedSpatialFacts.referencePairs[0]?.purpose, "measured-gap");
  assert.deepEqual(
    between.observedSpatialFacts.placementFeasibility.candidateSlots.find((slot) => slot.kind === "reference-gap")?.maximumOuterSize,
    { width: 16, height: 136 },
    "reasoning must see that the current equal-space gap cannot fit a normal annotation footprint",
  );

  const roleExplanation = contextFor("Add an explanation to the Awin screenshot where the user chooses their role.");
  assert.deepEqual(roleExplanation.focus.authoritativeReferents.map((referent) => referent.id), ["awin-role"]);
  assert.equal(roleExplanation.observedSpatialFacts.placementFeasibility.requiredForCurrentObjective, true);
  assert.deepEqual(
    roleExplanation.observedSpatialFacts.placementFeasibility.candidateSlots.find((slot) => slot.compatibleSides.includes("bottom"))?.maximumOuterSize,
    { width: 68, height: 216 },
    "reasoning may use the measured empty area below the role screen without covering later evidence",
  );
  assert.deepEqual(
    roleExplanation.observedSpatialFacts.placementFeasibility.candidateSlots.find((slot) => slot.territoryId === "flow:awin-flow")?.maximumOuterSize,
    { width: 16, height: 136 },
    "the in-flow side slot must remain visibly too narrow for a normal explanation card",
  );

  const flowGroups = contextFor("Make the Awin and Whop onboarding flows easier to distinguish as separate groups.");
  assert.deepEqual(flowGroups.focus.authoritativeReferents.map((referent) => referent.id).sort(), ["flow:awin-flow", "flow:whop-flow"]);
  assert.equal(flowGroups.observedSpatialFacts.placementFeasibility.requiredForCurrentObjective, false);
  assert.equal(flowGroups.observedSpatialFacts.placementFeasibility.conclusion, "not-required");
  assert.deepEqual(flowGroups.observedSpatialFacts.placementFeasibility.candidateSlots, []);

  const analysisArea = contextFor("Create a new analysis area below the current onboarding flows and reuse the Awin screenshot where the user chooses their role there.");
  assert.deepEqual(
    analysisArea.focus.authoritativeReferents.map((referent) => referent.id).sort(),
    ["awin-role", "flow:awin-flow", "flow:whop-flow"],
  );
  assert.equal(analysisArea.observedSpatialFacts.placementFeasibility.requiredForCurrentObjective, true);
  assert.deepEqual(analysisArea.observedSpatialFacts.placementFeasibility.preferredSides, ["bottom"]);
});

test("browser feasibility treats an authored container as one obstacle instead of ignoring its footprint", () => {
  const authoredContainer = {
    ...node("existing-card", "artboard", 320, 100, 140, 160),
    normalizedAttributes: { "data-ns-node-id": "existing-card" },
  };
  const authoredChild = {
    ...node("existing-card-copy", "existing-card", 330, 110, 120, 140),
    normalizedAttributes: {},
  };
  const facts = buildNorthstarObservedSpatialFacts({
    acknowledgement: {
      ...acknowledgement,
      snapshot: {
        ...acknowledgement.snapshot!,
        semanticNodes: [...semanticNodes, authoredContainer, authoredChild],
      },
    } as unknown as NorthstarArtifactMutationAcknowledgement,
    focusNodeIds: ["awin-start", "awin-role", "whop-start"],
    placementRequired: true,
    placementTerritories: [{
      territoryId: "artboard",
      kind: "artboard",
      bounds: { left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700 },
    }],
    preferredSides: ["right"],
  });

  assert.equal(facts.placementFeasibility.candidateSlots.some((slot) => slot.compatibleSides.includes("right")), false);
  assert.ok(facts.nearbyObstacles.some((obstacle) => obstacle.nodeId === "existing-card"));
  assert.equal(facts.nearbyObstacles.some((obstacle) => obstacle.nodeId === "existing-card-copy"), false);
});

test("an occupied measured gap is never advertised as an empty placement slot", () => {
  const existingAnnotation = {
    ...node("existing-annotation", "artboard", 209, 110, 10, 80),
    normalizedAttributes: { "data-ns-node-id": "existing-annotation" },
  };
  const facts = buildNorthstarObservedSpatialFacts({
    acknowledgement: {
      ...acknowledgement,
      snapshot: {
        ...acknowledgement.snapshot!,
        semanticNodes: [...semanticNodes, existingAnnotation],
      },
    } as unknown as NorthstarArtifactMutationAcknowledgement,
    focusNodeIds: ["awin-start", "awin-role"],
    referencePairs: [{
      purpose: "measured-gap",
      firstNodeId: "awin-start",
      secondNodeId: "awin-role",
    }],
    placementRequired: true,
    placementTerritories: [{
      territoryId: "artboard",
      kind: "artboard",
      bounds: { left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700 },
    }],
  });

  assert.equal(facts.placementFeasibility.candidateSlots.some((slot) => slot.kind === "reference-gap"), false);
});

test("semantic focus carries live authored dependents into the same reasoning context", () => {
  const dependentNode = {
    ...node("role-explanation", "artboard", 320, 100, 140, 80),
    normalizedAttributes: {
      "data-ns-node-id": "role-explanation",
      "data-ns-role": "explanation",
      "data-ns-explains-node-id": "awin-role",
    },
    normalizedText: "Role selection explanation",
  };
  const context = buildNorthstarCompactDesignTurnContext({
    turn: 6,
    instruction: "Recompose the Awin role selection screen without losing its explanation.",
    artifact,
    acknowledgement: {
      ...acknowledgement,
      snapshot: { ...acknowledgement.snapshot!, semanticNodes: [...semanticNodes, dependentNode] },
      authoredDesignRelations: [{
        id: "role-explanation-placement",
        subjectId: "role-explanation",
        kind: "relative-placement",
        references: [{ role: "reference", nodeId: "awin-role" }],
        parameters: { side: "right", offsetX: 20 },
        realizationPolicy: "live",
      }],
    } as unknown as NorthstarArtifactMutationAcknowledgement,
  });

  assert.ok(context.priorAuthoredObjects.some((item) => item.nodeId === "role-explanation"));
  assert.deepEqual(context.relations.authored.map((relation) => relation.id), ["role-explanation-placement"]);
});
