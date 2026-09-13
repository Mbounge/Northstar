import assert from "node:assert/strict";
import test from "node:test";
import { canvasV2MeasuredConnectorDirectory } from "../lib/canvas-v2/model-context";
import { assertCanvasV2NativeRelationshipStaging, materializeCanvasV2ConnectorRequests } from "../lib/canvas-v2/source-patch";
import type { CanvasV2SpatialNodeObservation } from "../lib/canvas-v2/types";

function node(nodeId: string, parentNodeId: string | undefined, x: number, endpoint: boolean, extra = {}): CanvasV2SpatialNodeObservation {
  return { nodeId, parentNodeId, connectorEndpoint: endpoint, tagName: "div", bounds: { x, y: 400, width: 200, height: 120 }, contentBox: { clientWidth: 200, clientHeight: 120, scrollWidth: 200, scrollHeight: 120 }, layout: { display: "block", position: "absolute", zIndex: "auto", overflowX: "visible", overflowY: "visible" }, ...extra };
}

test("connector context exposes measured stage surfaces and labels, excluding their layout containers", () => {
  const nodes = [node("handoff", undefined, 1000, false), ...["draft", "review", "approved"].flatMap((stage, i) => [
    node(`stage-${stage}`, "handoff", 1100 + i * 400, false, { textPreview: stage }),
    node(`stage-${stage}-surface`, `stage-${stage}`, 1100 + i * 400, true, { surfaceOwnerNodeId: `stage-${stage}` }),
    node(`label-${stage}`, `stage-${stage}`, 1150 + i * 400, true, { textPreview: stage }),
  ])];
  const directory = canvasV2MeasuredConnectorDirectory(nodes, "handoff");
  assert.equal(directory.endpoints.length, 6);
  assert.equal(directory.endpoints.some((endpoint) => endpoint.nodeId === "stage-draft"), false);
  assert.deepEqual(directory.endpoints[0].localBounds, { x: 100, y: 0, width: 200, height: 120 });
  assert.equal(directory.endpoints[0].label, "draft");
  assert.equal(directory.endpoints[0].kind, "background-surface");
  const candidate = materializeCanvasV2ConnectorRequests('<div data-canvas-v2-node-id="draft-review" data-canvas-v2-connector-request="true" data-from="stage-draft-surface" data-to="stage-review-surface" data-x1="300" data-y1="60" data-x2="500" data-y2="60" data-variant="arrow"></div>');
  assert.doesNotThrow(() => assertCanvasV2NativeRelationshipStaging({ previousHtml: "", candidateHtml: candidate, observedNodeIds: nodes.map((item) => item.nodeId), eligibleEndpointNodeIds: directory.endpoints.map((item) => item.nodeId), relationshipGeometryAllowed: true, targetAction: "develop" }));
});

test("focused endpoint inventory is selected before truncation and handles cyclic or absent ancestry", () => {
  const nodes = [...Array.from({ length: 220 }, (_, i) => node(`other-${i}`, undefined, i, true)), node("target", undefined, 1000, false), node("wanted", "target", 1100, true), node("cycle-a", "cycle-b", 0, true), node("cycle-b", "cycle-a", 0, true)];
  assert.deepEqual(canvasV2MeasuredConnectorDirectory(nodes, "target").endpoints.map((item) => item.nodeId), ["wanted"]);
  assert.equal(canvasV2MeasuredConnectorDirectory(nodes, "missing").endpoints.length, 0);
});
