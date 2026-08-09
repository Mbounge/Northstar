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
      { evidenceId: "whop-start", nodeId: "whop-start", flowId: "whop-flow", index: 0, x: 100, y: 340, width: 80, height: 160, aspectRatio: 0.5, objectFit: "contain", objectPosition: "center", transform: "none" },
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

  const context = buildNorthstarCompactDesignTurnContext({
    turn: 5,
    instruction: "Add an explanation to the Awin screenshot where the user chooses their role.",
    artifact,
    acknowledgement,
  });
  const evidenceCandidates = context.focus.candidates.filter((candidate) => candidate.kind === "evidence");
  assert.equal(evidenceCandidates[0]?.id, "awin-role");
  assert.ok(context.relevantNodes.some((item) => item.nodeId === "hello-world"), "the last changed authored object must remain observable");
  assert.equal(context.observedSpatialFacts.source, "browser-measurement");
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

  const rightOfResearch = contextFor("Place a Hello World 2 card to the right of the research and vertically center-align it with the research.");
  assert.equal(rightOfResearch.observedSpatialFacts.focusEnvelope?.right, 300);
  assert.equal(rightOfResearch.observedSpatialFacts.focusEnvelope?.top, 100);
  assert.equal(rightOfResearch.observedSpatialFacts.focusEnvelope?.bottom, 500);

  const crossFlowRelationship = contextFor("Construct a visual relationship between the first Awin screenshot and the first Whop screenshot.");
  assert.deepEqual(
    crossFlowRelationship.focus.candidates
      .filter((candidate) => candidate.kind === "evidence" && candidate.score === 2)
      .map((candidate) => candidate.id)
      .sort(),
    ["awin-start", "whop-start"],
  );

  const between = contextFor("Create equal space between the first and second Awin screenshots and insert an annotation in that space.");
  assert.deepEqual(
    between.observedSpatialFacts.measuredGaps.map(({ beforeNodeId, afterNodeId, span }) => ({ beforeNodeId, afterNodeId, span })),
    [{ beforeNodeId: "awin-start", afterNodeId: "awin-role", span: 40 }],
  );

  const roleExplanation = contextFor("Add an explanation to the Awin screenshot where the user chooses their role.");
  assert.equal(roleExplanation.focus.candidates.find((candidate) => candidate.kind === "evidence")?.id, "awin-role");
});
