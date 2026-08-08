import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildNorthstarSpatialFeasibilityContext,
  preflightNorthstarPredictableSpatialFeasibility,
  type NorthstarTurnWriteScope,
} from "../lib/canvas-ai/northstar-turn-write-scope";
import type { NorthstarArtifactMutationAcknowledgement, NorthstarCommittedSemanticNode } from "../lib/canvas-artifacts/types";

const node = (nodeId: string, parentId: string | undefined, left: number, top: number, width: number, height: number, text = ""):
NorthstarCommittedSemanticNode => ({
  nodeId,
  parentId,
  bounds: { left, top, width, height, right: left + width, bottom: top + height },
  normalizedText: text,
  normalizedAttributes: {},
  normalizedClasses: [],
  normalizedStyles: {},
  subtreeFingerprint: nodeId,
});

const nodes = [
  node("artboard", undefined, 0, 0, 800, 600),
  node("flow", "artboard", 50, 50, 500, 300),
  node("annotation", "flow", 80, 100, 100, 60, "Explanation"),
  node("screen", "flow", 220, 80, 100, 180, "Screenshot"),
  node("other-screen", "flow", 370, 80, 100, 180, "Screenshot two"),
];
const acknowledgement = {
  revisionId: "revision-1",
  snapshot: { semanticNodes: nodes },
} as NorthstarArtifactMutationAcknowledgement;
const scope: NorthstarTurnWriteScope = {
  baseRevisionId: "revision-1",
  writableExistingNodeIds: ["annotation"],
  introducedNodeIds: [],
  insertionContainerNodeIds: ["flow"],
  relationReferenceNodeIds: ["screen"],
  supportingMovementNodeIds: [],
  measuredContainerContracts: [],
  protectedNodeIds: ["artboard", "flow", "screen", "other-screen"],
};
const context = buildNorthstarSpatialFeasibilityContext({
  scope,
  acknowledgement,
  findings: [{ subjectNodeId: "annotation", relatedNodeIds: ["screen"], kind: "readable-occlusion" }],
});

test("shared feasibility context exposes measured subjects, targets, obstacles, containers, and clearance", () => {
  assert.deepEqual(context.subjects.map((item) => item.nodeId), ["annotation"]);
  assert.deepEqual(context.anchors.map((item) => item.nodeId), ["screen"]);
  assert.ok(context.obstacles.some((item) => item.nodeId === "screen"));
  assert.ok(!context.obstacles.some((item) => item.nodeId === "artboard"));
  assert.ok(!context.obstacles.some((item) => item.nodeId === "flow"));
  assert.deepEqual(context.containers.map((item) => item.nodeId), ["flow"]);
  assert.equal(context.availableClearanceBySubject.length, 1);
});

test("semantic obstacle pruning excludes target ancestry and relationship layers but keeps painted peers", () => {
  const nestedNodes = [
    node("artboard", undefined, 0, 0, 2000, 1200, "Inherited descendant text"),
    node("reservoir", "artboard", 100, 200, 1600, 600, "Evidence reservoir"),
    node("evidence", "reservoir", 120, 220, 1560, 560, "Evidence"),
    node("flow", "evidence", 140, 240, 1500, 500, "Awin flow"),
    node("sequence", "flow", 160, 260, 1400, 460, "Awin sequence"),
    {
      ...node("target", "sequence", 800, 300, 100, 180, "Role-selection screenshot"),
      normalizedAttributes: { "data-ns-evidence-id": "awin-role-selection" },
    },
    node("target-image", "target", 800, 300, 100, 180),
    node("peer-screen", "sequence", 920, 300, 100, 180, "Next screenshot"),
    {
      ...node("connector", "artboard", 150, 250, 1450, 500),
      normalizedAttributes: { "data-ns-authored-relationship": "true" },
    },
    node("explanation", "artboard", 700, 320, 90, 80, "Role Selection"),
  ];
  const nestedContext = buildNorthstarSpatialFeasibilityContext({
    scope: {
      ...scope,
      writableExistingNodeIds: ["explanation"],
      insertionContainerNodeIds: ["artboard"],
      relationReferenceNodeIds: ["target"],
      protectedNodeIds: nestedNodes.map((item) => item.nodeId).filter((nodeId) => nodeId !== "explanation"),
    },
    acknowledgement: {
      revisionId: "revision-2",
      snapshot: { semanticNodes: nestedNodes },
    } as NorthstarArtifactMutationAcknowledgement,
    findings: [{ subjectNodeId: "explanation", relatedNodeIds: ["target"], kind: "readable-occlusion" }],
  });
  assert.ok(nestedContext.obstacles.some((item) => item.nodeId === "target"));
  assert.ok(nestedContext.obstacles.some((item) => item.nodeId === "peer-screen"));
  for (const structuralId of ["artboard", "reservoir", "evidence", "flow", "sequence", "connector"]) {
    assert.ok(!nestedContext.obstacles.some((item) => item.nodeId === structuralId), `${structuralId} must not be a collision obstacle`);
  }
});

test("predictable collision is rejected before commit while a clear placement remains model-owned", () => {
  const colliding = preflightNorthstarPredictableSpatialFeasibility({
    context,
    mutation: {
      title: "Place explanation",
      description: "Measured placement",
      visualStrategy: "Adjacent note",
      visibleChange: "Moves the note",
      geometryIntent: "recompose",
      transitionMs: 120,
      operations: [{ op: "set-styles", targetId: "annotation", styles: { left: "180px", top: "30px" } }],
    },
  });
  assert.equal(colliding.feasible, false);
  assert.match(colliding.violations.join(" "), /protected obstacle screen/);
  const clear = preflightNorthstarPredictableSpatialFeasibility({
    context,
    mutation: {
      title: "Place explanation",
      description: "Measured placement",
      visualStrategy: "Adjacent note",
      visibleChange: "Moves the note",
      geometryIntent: "recompose",
      transitionMs: 120,
      operations: [{ op: "set-styles", targetId: "annotation", styles: { left: "10px", top: "220px" } }],
    },
  });
  assert.equal(clear.feasible, true);
});

test("relative-placement is resolved before commit and rejects a protected collision", () => {
  const result = preflightNorthstarPredictableSpatialFeasibility({
    context,
    mutation: {
      title: "Place explanation",
      description: "Relation-owned placement",
      visualStrategy: "Place beside the reference",
      visibleChange: "Moves the note",
      geometryIntent: "recompose",
      transitionMs: 120,
      operations: [{ op: "request-space", left: 0, top: 0, right: 0, bottom: 0 }],
      relations: [{
        id: "annotation-right-of-screen",
        subjectId: "annotation",
        kind: "relative-placement",
        references: [{ role: "reference", nodeId: "screen", geometry: "border-box" }],
        parameters: { side: "right", offsetX: 0, alignY: "top" },
        realizationPolicy: "live",
      }],
    },
  });
  assert.equal(result.feasible, false);
  assert.match(result.violations.join(" "), /protected obstacle other-screen/);
});

test("between-placement rejects a subject that cannot fit the measured gap", () => {
  const result = preflightNorthstarPredictableSpatialFeasibility({
    context,
    mutation: {
      title: "Place explanation",
      description: "Relation-owned placement",
      visualStrategy: "Place between references",
      visibleChange: "Moves the note",
      geometryIntent: "recompose",
      transitionMs: 120,
      operations: [{ op: "request-space", left: 0, top: 0, right: 0, bottom: 0 }],
      relations: [{
        id: "annotation-between-screens",
        subjectId: "annotation",
        kind: "between-placement",
        references: [
          { role: "before", nodeId: "screen", geometry: "border-box" },
          { role: "after", nodeId: "other-screen", geometry: "border-box" },
        ],
        parameters: { axis: "x", crossAlign: "center" },
        realizationPolicy: "live",
      }],
    },
  });
  assert.equal(result.feasible, false);
  assert.match(result.violations.join(" "), /50px available, 100px required/);
});

test("the universal repair route uses one feasibility packet without objective-specific branches", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
  assert.match(route, /SPATIAL FEASIBILITY CONTEXT/);
  assert.match(route, /preflightNorthstarPredictableSpatialFeasibility/);
  assert.match(route, /live-artboard-spatial-feasibility-skipped/);
  assert.doesNotMatch(route, /turn\s*===\s*[1-7][\s\S]{0,160}spatialFeasibilityContext/);
});
