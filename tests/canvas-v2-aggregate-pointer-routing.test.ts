import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { canvasV2NativeSceneSelectionContainsTarget } from '../lib/canvas-v2/native-scene';

// Execute the actual pointer boundaries with a painted hit and small state
// substitutes. This catches event consumption before workspace pan can run.
const source = fs.readFileSync(new URL('../components/canvas-v2/canvas-v2-workspace.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function boundary(name: string, state: Record<string, unknown>) {
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(initializer, `Production ${name} must remain identifiable`);
  const compiled = ts.transpileModule(`(${initializer.getText(tree)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(compiled, state) as (event: Record<string, unknown>) => void;
}
const noop = () => undefined;
const object = (nodeId: string) => ({ nodeId, bounds: { x: 0, y: 0, width: 100, height: 100 } });
function fixture(tool: string, spacePan: boolean, hitId: string | null = 'one', grouped = false) {
  const one = object(grouped ? 'group' : 'one'), two = object('two'), child = object('child'), unrelated = object('three');
  const selected = [one, two];
  const moves: unknown[][] = [];
  let stopped = false, captures = 0, cameraStarts = 0;
  const nativeScene = { nodes: [
    { id: 'group', sourceNodeId: 'group', kind: 'group', attributes: {} },
    { id: 'child', sourceNodeId: 'child', kind: 'text', parentId: 'group', attributes: {} },
  ] };
  const state: Record<string, unknown> = {
    tool, spacePan, canvasView: 'design', feedbackPickingRef: { current: false }, collaborationReadOnly: false,
    sceneElementsRef: { current: [...selected, child, unrelated] }, selectedElements: selected,
    document: { elementsFromPoint: () => hitId ? [{ closest: () => ({ getAttribute: () => hitId }) }] : [] },
    selectionRequestEpochRef: { current: 0 }, engine: { readNativeScene: () => nativeScene }, canvasV2NativeSceneSelectionContainsTarget,
    setLayersOpen: noop, setSelectedElements: noop, setSelectionTarget: noop, setToolbarMenu: noop, setAltTextDraft: noop, setMutationError: noop,
    startDirectGesture: (...args: unknown[]) => { moves.push(args); }, workspaceRef: { current: { focus: noop } },
    beginDirectGesture: (...args: unknown[]) => { moves.push(args); },
    workspacePoint: (x: number, y: number) => ({ x, y }), lastCanvasPointerRef: { current: undefined },
    viewportRef: { current: { x: 0, y: 0 } }, panRef: { current: undefined },
    beginCameraPreview: () => { cameraStarts++; },
  };
  state.forwardedElementPointer = boundary('forwardedElementPointer', state);
  const aggregate = boundary('beginAggregateGesture', state), workspace = boundary('pointerDown', state);
  const event = {
    button: 0, pointerId: 7, clientX: 10, clientY: 20, preventDefault: noop,
    stopPropagation: () => { stopped = true; },
    currentTarget: { setPointerCapture: () => { captures++; } },
    target: { closest: () => undefined },
  };
  return { state, moves, selected, event, aggregate, workspace, get stopped() { return stopped; }, get captures() { return captures; }, get cameraStarts() { return cameraStarts; } };
}

for (const [tool, spacePan] of [['pan', false], ['select', true], ['pan', true]] as const) {
  for (const hit of ['one', null]) test(`multi-selection permits ${tool}/${spacePan ? 'Space' : 'no Space'} pan over ${hit ? 'an object' : 'its empty interior'}`, () => {
    const f = fixture(tool, spacePan, hit);
    f.aggregate(f.event);
    assert.equal(f.stopped, false);
    assert.equal(f.captures, 0, 'The overlay must not claim a pan pointer');
    assert.deepEqual(f.moves, []);
    f.workspace(f.event); // normal React bubbling after the overlay declines it
    assert.equal(f.cameraStarts, 1);
    assert.equal(f.captures, 1, 'The workspace owns the pan pointer');
    assert.equal((f.state.panRef as { current: { pointerId: number } }).current.pointerId, 7);
  });
}

test('a normal selected-object click retains the group for dragging and resolves to the clicked object only on release', () => {
  const f = fixture('select', false);
  f.aggregate(f.event);
  assert.equal(f.stopped, true); assert.equal(f.captures, 1); assert.equal(f.moves.length, 1);
  const args = f.moves[0];
  assert.equal(args[0], 'move');
  assert.deepEqual(args[4], f.selected, 'A drag retains both selected objects');
  assert.equal((args[6] as { nodeId: string }[]).length, 1);
  assert.equal((args[6] as { nodeId: string }[])[0].nodeId, 'one', 'A click selects only the actual painted hit');
});

test('an object between selected objects is selectable while a descendant of a selected group retains group ownership', () => {
  const unrelated = fixture('select', false, 'three'); unrelated.aggregate(unrelated.event);
  assert.equal((unrelated.moves[0][4] as { nodeId: string }[])[0].nodeId, 'three');
  const grouped = fixture('select', false, 'child', true); grouped.aggregate(grouped.event);
  assert.deepEqual(grouped.moves[0][4], grouped.selected);
  assert.deepEqual(grouped.moves[0][6], grouped.selected);
});
