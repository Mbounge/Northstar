import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const workspace = fs.readFileSync(path.join(root, "components/canvas-v2/canvas-v2-workspace.tsx"), "utf8");
const hook = fs.readFileSync(path.join(root, "components/canvas-v2/use-canvas-v2-design-loop.ts"), "utf8");

test("the North Star shell delegates creative execution to the isolated V2 hook", () => {
  assert.match(workspace, /useCanvasV2DesignLoop\(designEndpoint\)/);
  assert.doesNotMatch(workspace, /fetch\("\/api\/canvas-v2\/design"/);
  assert.match(hook, /committed/);
  assert.match(hook, /candidate/);
  assert.match(hook, /receiveObservation/);
});

test("the integrated shell exposes chat, selection, pan, and zoom without legacy imports", () => {
  assert.match(workspace, /Canvas workspace/);
  assert.match(workspace, /CanvasV2ChatPanel/);
  assert.match(workspace, /setTool\("select"\)/);
  assert.match(workspace, /setTool\("pan"\)/);
  assert.match(workspace, /Zoom in/);
  assert.match(workspace, /Zoom out/);
  assert.doesNotMatch(workspace, /@\/components\/canvas\//);
  assert.doesNotMatch(workspace, /@\/lib\/canvas-ai\//);
});

test("collapsing the panel cannot discard conversation or in-flight routing state", () => {
  assert.match(workspace, /const chat = useCanvasV2Chat\(/);
  assert.match(workspace, /<CanvasV2ChatPanel chat=\{chat\}/);
  const panel = fs.readFileSync(path.join(root, "components/canvas-v2/canvas-v2-chat-panel.tsx"), "utf8");
  assert.doesNotMatch(panel, /const chat = useCanvasV2Chat\(/);
  assert.match(workspace, /chat\.routing \? "understanding request"/);
});

test("late duplicate render observations cannot replay a settled candidate transaction", () => {
  const discardInspectionScene = hook.match(/const discardInspectionScene = \(revisionId\?: string\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.doesNotMatch(discardInspectionScene, /settledCandidateRevisionIds\.current\.delete/);
  assert.match(hook, /if \(!settleCandidateRevision\(candidate\.id\)\) return/);
  assert.match(hook, /while \(settled\.size > 256\)/);
  assert.match(hook, /const publicCommitted = committedRef\.current/);
  assert.match(hook, /inspectionScenesRef\.current\.get\(observation\.revisionId\)/);
  assert.match(hook, /validateCanvasV2RenderedDesignRegionContentIntegrity\(factualObservation\)/);
  assert.match(hook, /if \(candidate\.parentId !== commitParent\.id\) return/);
  assert.doesNotMatch(hook, /askModel\(repairLoop, repairRevision, repairObservation, committed\)/);
});

test("Shapes and Apps integrations stay native to V2 rather than silently using V1", () => {
  assert.match(workspace, /CanvasV2ResearchPanel/);
  assert.match(workspace, /Object library categories/);
  assert.match(workspace, /CanvasV2PrimitiveThumbnail/);
  assert.match(workspace, /label: "Connectors"/);
  assert.doesNotMatch(workspace, /@\/lib\/canvas-ai\//);
});

test("the North Star menu owns an opt-in persisted canvas grid preference", () => {
  assert.match(workspace, /aria-label="Open North Star menu"/);
  assert.match(workspace, /data-testid="canvas-v2-northstar-menu"/);
  assert.match(workspace, /role="switch"/);
  assert.match(workspace, /aria-checked=\{showCanvasGrid\}/);
  assert.match(workspace, /CANVAS_V2_GRID_PREFERENCE_KEY/);
  assert.match(workspace, /northstar\.canvas-v2\.show-grid\.v1/);
  assert.match(workspace, /data-testid="canvas-v2-grid-overlay"/);
  assert.match(workspace, /showCanvasGrid &&/);
});

test("navigation controls stay compact and explain native trackpad gestures", () => {
  assert.match(workspace, /data-testid="canvas-v2-navigation-controls"/);
  assert.match(workspace, /aria-label="Canvas navigation"/);
  assert.match(workspace, /Pinch to zoom · Two-finger scroll to pan/);
  assert.match(workspace, /zoomAtCenter\(1 \/ 1\.2\)/);
  assert.match(workspace, /zoomAtCenter\(1\.2\)/);
  assert.doesNotMatch(workspace, /aria-label="Fit entire workspace"/);
  assert.match(workspace, /CANVAS_V2_SELECT_CURSOR/);
  assert.match(workspace, /CANVAS_V2_DRAWING_CURSOR/);
  assert.match(workspace, /data-canvas-v2-cursor=/);
});
