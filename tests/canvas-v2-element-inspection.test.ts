import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeCanvasV2NodeId, canvasV2ConnectorTargetAtPoint, type CanvasV2InspectableElement } from "../lib/canvas-v2/element-inspection";

test("stable canvas node identities reject empty values without rewriting valid ids", () => {
  assert.equal(normalizeCanvasV2NodeId("  analysis-card  "), "analysis-card");
  assert.equal(normalizeCanvasV2NodeId("   "), undefined);
  assert.equal(normalizeCanvasV2NodeId(undefined), undefined);
});

test("element inspection is read-only and remains isolated from the legacy canvas engine", () => {
  const inspection = readFileSync("lib/canvas-v2/element-inspection.ts", "utf8");
  const preview = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");
  assert.match(inspection, /closest\("\[data-canvas-v2-node-id\]"\)/);
  assert.match(inspection, /typeof \(target as Element\)\.closest !== "function"/);
  assert.doesNotMatch(inspection, /if \(!\(target instanceof Element\)\)/);
  assert.match(preview, /inspectionEnabled/);
  assert.doesNotMatch(`${inspection}\n${preview}`, /@\/lib\/canvas-ai/);
  assert.doesNotMatch(inspection, /style\.|setAttribute|innerHTML\s*=/);
});

test("selection geometry feeds the single manual candidate pipeline", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const preview = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");
  assert.match(workspace, /data-testid="canvas-v2-element-selection"/);
  assert.match(workspace, /applyManualDocument/);
  assert.match(workspace, /allowEvidenceRemoval: mutation\.kind === "delete"[\s\S]*mutation\.kind === "batch"[\s\S]*item\.kind === "delete"/);
  assert.match(workspace, /workspaceRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(workspace, /selectionIsText/);
  assert.match(workspace, /data-testid="canvas-v2-context-toolbar"/);
  assert.match(workspace, /onElementPointer=\{forwardedElementPointer\}/);
  assert.match(workspace, /onElementTextCommit=/);
  assert.match(workspace, /nativeSceneOverride=\{tidyPreviewScene \?\? cropPreviewScene \?\? engine\.nativeScene\}/);
  assert.match(workspace, /ref=\{canvasSceneRef\}/);
  assert.match(workspace, /canvasSceneRef\.current\?\.applyTransientGeometry/);
  assert.doesNotMatch(workspace, /transientGeometry=\{transientGeometry\}/);
  assert.match(preview, /forwardRef<CanvasV2CanvasSceneHandle/);
  assert.match(workspace, /layersOpen && <aside aria-label="Layers panel"/);
  assert.doesNotMatch(workspace, /max-h-\[calc\(100vh-190px\)\]/);
  assert.doesNotMatch(workspace, /Manual changes become candidate source revisions/);
  assert.match(workspace, /RESIZE_HANDLES/);
  assert.match(workspace, /application\/x-northstar-canvas-object/);
  assert.match(workspace, /onDrop=\{dropOnCanvas\}/);
  assert.match(workspace, /data-testid="canvas-v2-drop-silhouette"/);
  assert.match(workspace, /Object library categories/);
  assert.match(workspace, /data-testid="canvas-v2-object-menu"/);
  assert.match(workspace, /distributeObjectSelection/);
  assert.match(workspace, /chooseLocalImage/);
  assert.match(preview, /canvasV2NativeSelectionGuard/);
  assert.match(preview, /frameDocument\.getSelection\(\)\?\.removeAllRanges\(\)/);
  assert.match(preview, /item\.kind !== "root"/);
});


test("one continuous endpoint drag attaches inside, detaches immediately outside, and transfers to another object", () => {
  const target = (nodeId: string, x: number): CanvasV2InspectableElement => ({ nodeId, kind: "shape", tagName: "div", bounds: { x, y: 100, width: 100, height: 100 }, locked: false, hidden: false, textEditable: false });
  const a = target("a", 100), b = target("b", 300);
  const island = { ...target("layout", 0), kind: "island" as const, bounds: { x: 0, y: 0, width: 1000, height: 1000 } };
  const points = [{ x: 150, y: 150 }, { x: 199, y: 150 }, { x: 200.01, y: 150 }, { x: 299.99, y: 150 }, { x: 350, y: 150 }, { x: 401, y: 150 }, { x: 150, y: 150 }];
  assert.deepEqual(points.map(point => canvasV2ConnectorTargetAtPoint([island, a, b], point)?.nodeId), ["a", "a", undefined, undefined, "b", undefined, "a"]);
  assert.equal(canvasV2ConnectorTargetAtPoint([a, { ...b, bounds: a.bounds, zIndex: 2 }], { x: 150, y: 150 })?.nodeId, "b");
  assert.equal(canvasV2ConnectorTargetAtPoint([{ ...a, hidden: true }], { x: 150, y: 150 }), undefined);
  const rotated = { ...a, rotation: 45 };
  assert.equal(canvasV2ConnectorTargetAtPoint([rotated], { x: 150, y: 150 })?.nodeId, "a");
  assert.equal(canvasV2ConnectorTargetAtPoint([rotated], { x: 100, y: 100 }), undefined);
});
