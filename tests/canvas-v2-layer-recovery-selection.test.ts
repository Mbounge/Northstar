import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvasV2LayerRecoverySelection, eligibleCanvasSelection } from '../lib/canvas-v2/layer-recovery-selection';
import { applyCanvasV2NativeSceneMutation, CANVAS_V2_NATIVE_SCENE_SCHEMA, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import type { CanvasV2InspectableElement } from '../lib/canvas-v2/element-inspection';
import { CANVAS_V2_WORKSPACE } from '../lib/canvas-v2/workspace-coordinate-space';
import { buildCanvasV2WorkingContext } from '../lib/canvas-v2/working-context';
import { applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange } from '../lib/canvas-v2/source-patch';

function fixture() {
  const empty: CanvasV2NativeSceneDocument = { schema: CANVAS_V2_NATIVE_SCENE_SCHEMA, revisionId: 'current', width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height, css: '', rootIds: [], nodes: [] };
  const scene = applyCanvasV2NativeSceneMutation(empty, { kind: 'batch', label: 'Two human objects', mutations: [
    { kind: 'create', primitive: 'shape', nodeId: 'recovery-object', x: CANVAS_V2_WORKSPACE.width + 800, y: CANVAS_V2_WORKSPACE.height + 1200, width: 480, height: 360 },
    { kind: 'create', primitive: 'shape', nodeId: 'untagged-object', x: 65_000, y: 65_000, width: 200, height: 120 },
  ] });
  const element: CanvasV2InspectableElement = { nodeId: 'recovery-object', kind: 'shape', tagName: 'div', textEditable: false, locked: false, hidden: false, userEdited: true, bounds: { ...scene.nodes[0].geometry } };
  return { scene, element, recovery: createCanvasV2LayerRecoverySelection() };
}

test('only an explicit Layers request retains a known finite out-of-bounds object across refresh', () => {
  const { scene, element, recovery } = fixture(), original = structuredClone(scene);
  assert.deepEqual(eligibleCanvasSelection([element]), []);
  assert.deepEqual(recovery.refresh([element], scene), [], 'ordinary selection stays clipped');
  assert.equal(recovery.request(element, scene), true);
  assert.deepEqual(recovery.refresh([element], scene), [element]);
  assert.deepEqual(recovery.refresh([{ ...element, label: 'Refreshed' }], scene).map(item => item.nodeId), [element.nodeId]);
  assert.deepEqual(scene, original, 'selection never changes stored geometry or content');
  const unknown = { ...element, nodeId: 'unrequested-object' };
  assert.deepEqual(recovery.refresh([element, unknown], scene), [element]);
});

test('recovery selection grants only its exact human object through the existing source guard', () => {
  const { scene, element, recovery } = fixture();
  recovery.request(element, scene);
  const context = buildCanvasV2WorkingContext({ scene, selections: recovery.refresh([element], scene), visibleBounds: { x: 64_000, y: 64_000, width: 2000, height: 2000 }, viewport: { x: 0, y: 0, scale: 1 }, selectionPolicy: 'modify' });
  assert.deepEqual(context?.editableNodeIds, ['recovery-object']);
  assert.ok(context?.protectedNodeIds.includes('untagged-object'));
  const previous = serializeCanvasV2NativeScene(scene);
  const fragment = (nodeId: string) => { const range = findCanvasV2SourceNodeRange(previous.html, nodeId)!; return previous.html.slice(range.start, range.end).replace('<div ', '<div aria-label="Reviewed object" '); };
  const repaired = applyCanvasV2SourcePatch({ previous, operations: [{ op: 'replace-node', targetNodeId: element.nodeId, html: fragment(element.nodeId) }], evidence: [], workingContext: context });
  assert.match(repaired.html, /aria-label="Reviewed object"/);
  assert.throws(() => applyCanvasV2SourcePatch({ previous, operations: [{ op: 'replace-node', targetNodeId: 'untagged-object', html: fragment('untagged-object') }], evidence: [], workingContext: context }), /unselected node/);
  recovery.clear();
  const deselected = buildCanvasV2WorkingContext({ scene, selections: recovery.refresh([element], scene), visibleBounds: { x: 64_000, y: 64_000, width: 2000, height: 2000 }, viewport: { x: 0, y: 0, scale: 1 }, selectionPolicy: 'modify' });
  assert.throws(() => applyCanvasV2SourcePatch({ previous, operations: [{ op: 'replace-node', targetNodeId: element.nodeId, html: fragment(element.nodeId) }], evidence: [], workingContext: deselected }), /Human-authored node.*protected/);
});

test('unknown, hidden, locked, malformed and canonical recovery candidates are rejected', () => {
  for (const invalid of ['unknown', 'hidden', 'locked', 'zero', 'nan', 'native-nan', 'canonical'] as const) {
    const { scene, element, recovery } = fixture();
    if (invalid === 'unknown') element.nodeId = 'not-in-native-scene';
    if (invalid === 'hidden') scene.nodes[0].hidden = true;
    if (invalid === 'locked') scene.nodes[0].locked = true;
    if (invalid === 'zero') element.bounds.width = 0;
    if (invalid === 'nan') element.bounds.x = NaN;
    if (invalid === 'native-nan') scene.nodes[0].geometry.y = NaN;
    if (invalid === 'canonical') scene.nodes[0].canonicalEvidence = true;
    assert.equal(recovery.request(element, scene), false, invalid);
    assert.deepEqual(recovery.refresh([element], scene), [], invalid);
  }
});

test('deleted, newly hidden or newly locked recovered objects lose selection and authorization', () => {
  for (const change of ['deleted', 'hidden', 'locked'] as const) {
    const { scene, element, recovery } = fixture(); recovery.request(element, scene);
    if (change === 'deleted') scene.nodes = scene.nodes.slice(1);
    else scene.nodes[0][change] = true;
    assert.deepEqual(recovery.refresh([element], scene), [], change);
    assert.equal(recovery.active(), false);
  }
  const { scene, element, recovery } = fixture(); recovery.request(element, scene);
  assert.deepEqual(recovery.refresh([], scene), []); assert.equal(recovery.active(), false, 'human deselection revokes recovery intent');
  assert.deepEqual(recovery.refresh([element], scene), [], 'a later automatic refresh cannot reselect it');
});
