import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as coordinates from '../lib/canvas-v2/workspace-coordinate-space';
import type { CanvasV2InspectableElement } from '../lib/canvas-v2/element-inspection';

const text = readFileSync(new URL('../components/canvas-v2/canvas-v2-workspace.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('workspace.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map<string, ts.Expression>();
let pendingFitEffect: ts.Expression | undefined, frameEffect: ts.Expression | undefined;
let readFitRevision: ts.Expression | undefined;
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'readFitRevision') readFitRevision = node.initializer;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
    && ['fitContent', 'receiveScene', 'commitViewport', 'beginCameraPreview'].includes(node.name.text)) callbacks.set(node.name.text, node.initializer.arguments[0]);
  if (ts.isCallExpression(node) && node.arguments[0]) {
    if (node.expression.getText(tree) === 'useEffect' && node.arguments[0].getText(tree).includes('pendingFitRef.current&&sceneElements.length')) pendingFitEffect = node.arguments[0];
    if (node.expression.getText(tree) === 'useLayoutEffect' && node.arguments[0].getText(tree).includes('previousCameraFrame.current')) frameEffect = node.arguments[0];
  }
  ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(pendingFitEffect && frameEffect && readFitRevision);

/** Execute the real Workspace camera handlers. Only React scheduling and the
 * compiler's asynchronous scene delivery are supplied by this harness. */
function camera() {
  const commits: coordinates.CanvasV2WorkspaceViewport[] = [];
  const viewportRef = { current: coordinates.centeredCanvasV2WorkspaceViewport({ width: 1512, height: 790 }, 0.24) };
  const sceneElementsRef = { current: [] as CanvasV2InspectableElement[] };
  const pendingFitRef = { current: false }, cameraPreviewActiveRef = { current: false };
  let rendered = viewportRef.current;
  const context = vm.createContext({ ...coordinates, viewportRef, sceneElementsRef, pendingFitRef, cameraPreviewActiveRef,
    geometryRef: { current: { width: 8880, height: 8000 } },
    engine: { interactionReady: false, readCommittedRevision: () => ({ id: 'compiling-stress', document: { html: '<main>800 authored cards</main>', css: '' } }) },
    cameraSize: () => ({ width: 1512, height: 790 }),
    insets: { left: 740, right: 24, top: 72, bottom: 88 },
    contentInsets: (): coordinates.CanvasV2WorkspaceInsets => context.insets as coordinates.CanvasV2WorkspaceInsets,
    workspaceSize: { width: 1512, height: 790 }, workspaceSizeRef: { current: { width: 1512, height: 790 } },
    canvasView: 'preview', chatOpen: true, editChatOpen: false, visualFeedbackActive: false, followingClientRef: {}, previousCameraFrame: {},
    nativeViewportStore: { update: () => {} }, stopFollowingRef: { current: () => {} }, stopPendingViewportFrame: () => {},
    applyViewportVisual: (value: coordinates.CanvasV2WorkspaceViewport) => { commits.push(value); },
    setViewport: (update: coordinates.CanvasV2WorkspaceViewport | ((value: coordinates.CanvasV2WorkspaceViewport) => coordinates.CanvasV2WorkspaceViewport)) => { rendered = typeof update === 'function' ? update(rendered) : update; },
    interruptCanvasV2ScreenPresentation: () => {}, workspaceRef: { current: { dataset: {} } },
    sceneElements: [] as CanvasV2InspectableElement[],
    setSceneElements: (update: (before: CanvasV2InspectableElement[]) => CanvasV2InspectableElement[]) => { context.sceneElements = update(context.sceneElements as CanvasV2InspectableElement[]); }, sameInspectableElements: () => false,
  });
  const source = `const readFitRevision = (${readFitRevision!.getText(tree)});\n` + [...callbacks].map(([name, expression]) => `const ${name} = (${expression.getText(tree)});`).join('\n')
    + `\nglobalThis.actions = {fitContent, receiveScene, commitViewport, beginCameraPreview, flushPendingFit:(${pendingFitEffect!.getText(tree)}), frameChanged:(${frameEffect!.getText(tree)})};`;
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { commits, viewportRef, sceneElementsRef, pendingFitRef, cameraPreviewActiveRef, context,
    ...(context.actions as { fitContent(): void; receiveScene(elements: CanvasV2InspectableElement[]): void; flushPendingFit(): void; frameChanged(): void; commitViewport(value: coordinates.CanvasV2WorkspaceViewport): void; beginCameraPreview(): void }) };
}

const card = { nodeId: 'stress-card', kind: 'shape', bounds: { x: 64500, y: 65000, width: 270, height: 150 } } as CanvasV2InspectableElement;

test('Fit all while authored source is still compiling must not frame unrelated legacy world-zero bounds', () => {
  const h = camera(), before = { ...h.viewportRef.current };
  h.fitContent();
  assert.equal(h.commits.length, 0, 'queue framing until authored scene truth exists instead of fitting a different world origin');
  assert.deepEqual(h.viewportRef.current, before);
});

test('Fit all with a delivered native snapshot frames centered-world authored content', () => {
  const h = camera();
  const item = card;
  h.receiveScene([item]); h.fitContent();
  assert.equal(h.commits.length, 1);
  const visible = coordinates.canvasV2VisibleWorkspaceBounds(h.viewportRef.current, { width: 1512, height: 790 }, { left: 740, right: 24, top: 72, bottom: 88 });
  assert(item.bounds.x >= visible.x && item.bounds.x + item.bounds.width <= visible.x + visible.width);
  assert(item.bounds.y >= visible.y && item.bounds.y + item.bounds.height <= visible.y + visible.height);
});

test('an explicit early Fit all is fulfilled once when authored scene delivery becomes ready', () => {
  const h = camera(); h.fitContent(); assert.equal(h.pendingFitRef.current, true);
  h.flushPendingFit(); assert.equal(h.commits.length, 0);
  h.receiveScene([card]); h.flushPendingFit();
  assert.equal(h.commits.length, 1); assert.equal(h.pendingFitRef.current, false);
  h.receiveScene([{ ...card, bounds: { ...card.bounds, x: 68000 } }]); h.flushPendingFit();
  assert.equal(h.commits.length, 1, 'later source delivery must not reuse consumed camera intent');
});

for (const action of ['commit', 'gesture'] as const) test(`new manual ${action} cancels an unfulfilled Fit all before late scene delivery`, () => {
  const h = camera(); h.fitContent();
  if (action === 'commit') h.commitViewport({ x: -65000, y: -64000, scale: 1 }); else h.beginCameraPreview();
  const commits = h.commits.length, current = { ...h.viewportRef.current };
  assert.equal(h.pendingFitRef.current, false);
  h.receiveScene([card]); h.flushPendingFit();
  assert.equal(h.commits.length, commits); assert.deepEqual(h.viewportRef.current, current);
});

const center = (frame: { size: coordinates.CanvasV2WorkspaceSize; insets: coordinates.CanvasV2WorkspaceInsets }) => ({ x: (frame.insets.left + frame.size.width - frame.insets.right) / 2, y: (frame.insets.top + frame.size.height - frame.insets.bottom) / 2 });
const chatFrame = { size: { width: 1512, height: 790 }, insets: { left: 740, right: 24, top: 72, bottom: 88 } };
const closedFrame = { size: { width: 1512, height: 790 }, insets: { left: 32, right: 32, top: 72, bottom: 88 } };

test('layout reframing preserves the useful world center and scale through chat, Design rails and window resize', () => {
  const frames = [chatFrame, closedFrame, { size: { width: 1512, height: 790 }, insets: { left: 264, right: 312, top: 120, bottom: 96 } }, { size: { width: 1100, height: 760 }, insets: { left: 264, right: 312, top: 120, bottom: 96 } }, chatFrame];
  for (const scale of [0.04, 0.06, 1, 8]) {
    const first = center(frames[0]); let camera = { x: first.x - 65536 * scale, y: first.y - 65000 * scale, scale };
    const original = { ...camera }, untouched = JSON.stringify(frames);
    for (let index = 1; index < frames.length; index++) {
      camera = coordinates.reframeCanvasV2WorkspaceViewport(camera, frames[index - 1], frames[index]);
      const point = coordinates.canvasV2ScreenToWorkspace(center(frames[index]), camera);
      assert(Math.abs(point.x - 65536) < 1e-8); assert(Math.abs(point.y - 65000) < 1e-8); assert.equal(camera.scale, scale);
    }
    assert.deepEqual(camera, original); assert.equal(JSON.stringify(frames), untouched);
  }
});

test('actual Workspace panel transition followed by100% keeps the fitted content center in its useful frame', () => {
  const h = camera(); h.receiveScene([card]); h.fitContent(); h.frameChanged();
  const before = coordinates.canvasV2ScreenToWorkspace(center(chatFrame), h.viewportRef.current);
  h.context.chatOpen = false; h.context.insets = closedFrame.insets; h.frameChanged();
  const after = coordinates.canvasV2ScreenToWorkspace(center(closedFrame), h.viewportRef.current);
  assert(Math.abs(before.x - after.x) < 1e-8); assert(Math.abs(before.y - after.y) < 1e-8);
  const zoomed = coordinates.zoomCanvasV2WorkspaceAtPoint(h.viewportRef.current, 1, center(closedFrame), closedFrame.size);
  const at100 = coordinates.canvasV2ScreenToWorkspace(center(closedFrame), zoomed);
  assert(Math.abs(at100.x - before.x) < 1e-8); assert(Math.abs(at100.y - before.y) < 1e-8);
});

test('layout baseline updates without fighting a followed camera, active gesture or floating panel drag', () => {
  for (const skip of ['follow', 'gesture', 'floating'] as const) {
    const h = camera(); h.frameChanged(); const initial = { ...h.viewportRef.current };
    if (skip === 'follow') (h.context.followingClientRef as { current?: string }).current = 'peer';
    if (skip === 'gesture') h.cameraPreviewActiveRef.current = true;
    h.context.insets = { ...closedFrame.insets, left: 800 };
    if (skip !== 'floating') h.context.chatOpen = false;
    h.frameChanged(); assert.deepEqual(h.viewportRef.current, initial); assert.equal(h.commits.length, 0);
    assert.equal((h.context.previousCameraFrame as { current: { insets: coordinates.CanvasV2WorkspaceInsets } }).current.insets.left, 800, 'a skipped layout still becomes the next comparison baseline');
  }
});

test('first measured camera geometry does not reframe again when ResizeObserver state catches up', () => {
  const h = camera(), before = { ...h.viewportRef.current };
  h.context.workspaceSize = { width: 1440, height: 900 };
  // The earlier layout observer already wrote the real dimensions and centered
  // the opening camera, while React still exposes its previous size state.
  h.frameChanged();
  h.context.workspaceSize = { width: 1512, height: 790 }; h.frameChanged();
  assert.equal(h.commits.length, 0, 'the same measured frame is one baseline, not a second camera authority');
  assert.deepEqual(h.viewportRef.current, before);
});


test('feedback can temporarily hide chat without moving the marked artwork or replacing its camera baseline', () => {
  const h=camera();h.frameChanged();const before={...h.viewportRef.current};
  h.context.visualFeedbackActive=true;h.context.chatOpen=false;h.context.insets=closedFrame.insets;h.frameChanged();
  assert.deepEqual(h.viewportRef.current,before);assert.equal(h.commits.length,0);
  h.context.chatOpen=true;h.context.insets=chatFrame.insets;h.context.visualFeedbackActive=false;h.frameChanged();
  assert.deepEqual(h.viewportRef.current,before);assert.equal(h.commits.length,0);
});
