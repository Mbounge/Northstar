import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Patch 8B exposes a first-class multi-object interaction model", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const preview = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");
  assert.match(workspace, /selectedElements/);
  assert.match(workspace, /canvas-v2-marquee-selection/);
  assert.match(workspace, /screenStart/);
  assert.match(workspace, /screenCurrent/);
  assert.match(workspace, /fixed z-\[70\]/);
  assert.match(workspace, /snapCanvasV2ObjectDelta/);
  assert.match(workspace, /beginDirectGesture\("rotate"/);
  assert.match(workspace, /groupSelection/);
  assert.match(workspace, /internalClipboardRef/);
  assert.match(workspace, /onElementTextCommit/);
  assert.match(workspace, /transientGeometry/);
  assert.match(workspace, /width=\{CANVAS_V2_WORKSPACE\.width\}/);
  assert.match(workspace, /height=\{CANVAS_V2_WORKSPACE\.height\}/);
  assert.match(workspace, /captureEnabled=\{false\}/);
  assert.match(workspace, /canvas-v2-committed-observation-surface/);
  assert.doesNotMatch(workspace, /data-canvas-v2-canvas data-canvas-v2-workspace-content/);
  assert.match(preview, /selectedNodeIds/);
  assert.match(preview, /onSceneSnapshot/);
  assert.match(preview, /forwardingMoved/);
  assert.match(preview, /Math\.hypot/);
  assert.match(preview, /if \(captureEnabled && frameLoad > 0\) void capture\(\)/);
  assert.match(preview, /captureIsCurrent/);
});

test("multi-object gestures compile as one transactional source candidate", () => {
  const mutations = readFileSync("lib/canvas-v2/manual-mutations.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(mutations, /kind: "batch"/);
  assert.match(mutations, /reduce\(\(current, item\) => applyCanvasV2ManualMutation/);
  assert.match(mutations, /dataset\.canvasV2Group/);
  assert.match(mutations, /dataset\.canvasV2Rotation/);
  assert.match(workspace, /kind: "batch"/);
  assert.match(workspace, /applyManualDocument/);
});

test("human object structure is included in subsequent AI routing and design context", () => {
  const chat = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/route/route.ts", "utf8");
  const router = readFileSync("lib/canvas-v2/interaction-router.ts", "utf8");
  const context = readFileSync("lib/canvas-v2/model-context.ts", "utf8");
  assert.match(chat, /selections: input\.selections/);
  assert.match(route, /selections: body\.selections/);
  assert.match(router, /one coherent user selection/);
  assert.match(context, /data-canvas-v2-rotation/);
  assert.match(context, /data-canvas-v2-group/);
});

test("canonical evidence remains a normal directly editable canvas object", () => {
  const source = readFileSync("lib/canvas-v2/manual-mutations.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.doesNotMatch(source, /Grounded evidence is protected/);
  assert.doesNotMatch(workspace, /item\.canonicalEvidence \? undefined : \{ kind: "delete"/);
  assert.match(workspace, /aria-label="Canvas object menu"/);
  assert.match(workspace, /Deleted selected objects\./);
  assert.match(source, /canvasV2EvidenceCopyOf/);
  assert.match(source, /canvasV2EvidenceRole = "copy"/);
});

test("delete is a same-input visual transaction with commit rejection rollback", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const nativeScene = readFileSync("components/canvas-v2/native-canvas-scene.tsx", "utf8");
  const submitStart = workspace.indexOf("const submitMutation =");
  const submitEnd = workspace.indexOf("const drawingPoint =", submitStart);
  const transaction = workspace.slice(submitStart, submitEnd);

  assert.ok(transaction.indexOf("previewDeletion(deletedNodeIds)") < transaction.indexOf("applyCanvasV2NativeSceneMutation"));
  assert.match(transaction, /if \(deletedNodeIds\.length\) restoreDeletionPreview\(\);/);
  assert.match(transaction, /if \(deletedNodeIds\.length\) commitDeletionPreview\(\);/);
  assert.match(workspace, /contextualToolbarRef\.current,/);
  assert.match(workspace, /selectionOverlayRef\.current,/);
  assert.match(nativeScene, /previewNodeRemoval/);
  assert.match(nativeScene, /data-canvas-v2-removal-preview/);
  assert.match(nativeScene, /setProperty\("visibility", "hidden", "important"\)/);
});

test("the primary inspector stays focused while management actions remain available", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const inspectorStart = workspace.indexOf('aria-label="Element inspector"');
  const inspectorEnd = workspace.indexOf("{toolbarMenu === \"font\"", inspectorStart);
  assert.notEqual(inspectorStart, -1);
  assert.notEqual(inspectorEnd, -1);
  const primaryInspector = workspace.slice(inspectorStart, inspectorEnd);

  assert.match(primaryInspector, /aria-label="Change fill"/);
  assert.match(primaryInspector, /aria-label="Change line"/);
  assert.match(primaryInspector, /aria-label="Duplicate selected elements"/);
  assert.doesNotMatch(primaryInspector, /Toggle lock for selected elements/);
  assert.doesNotMatch(primaryInspector, /Delete selected elements/);
  assert.doesNotMatch(primaryInspector, /More object actions/);
  assert.doesNotMatch(primaryInspector, /Clear element selection/);

  assert.match(workspace, /aria-label="Canvas object menu"/);
  assert.match(workspace, /\? "Unlock" : "Lock"/);
  assert.match(workspace, />Delete<\/button>/);
  assert.match(workspace, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
  assert.match(workspace, /event\.key === "Escape"/);
});

test("journey divider rule and label are independent native objects", () => {
  const insertion = readFileSync("lib/canvas-v2/flow-insertion.ts", "utf8");
  assert.match(insertion, /markerRule\.dataset\.canvasV2NodeId/);
  assert.match(insertion, /markerLabel\.dataset\.canvasV2NodeId/);
  assert.match(insertion, /marker\.removeAttribute\("data-canvas-v2-node-id"\)/);
  assert.match(insertion, /marker\.append\(markerRule, markerLabel\)/);
});
