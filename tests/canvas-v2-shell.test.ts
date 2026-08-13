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

test("Shapes and Apps integrations stay native to V2 rather than silently using V1", () => {
  assert.match(workspace, /CanvasV2ResearchPanel/);
  assert.match(workspace, /Create text, frames, shapes, and tables/);
  assert.doesNotMatch(workspace, /@\/lib\/canvas-ai\//);
});
