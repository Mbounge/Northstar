import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeCanvasV2Screen, parseCanvasV2Screen, readCanvasV2Screens, SCREEN_ATTRIBUTE, canvasV2ScreenReviewAssets, validateCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { arrangeCanvasV2Screens, reviseCanvasV2NativeScreen, canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { buildCanvasV2ScreenRuntime } from '../lib/canvas-v2/interactive-screen-runtime';
import { validateCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from '../lib/canvas-v2/artifact-safety';
import { applyCanvasV2SourcePatch } from '../lib/canvas-v2/source-patch';
import { applyCanvasV2NativeSceneMutation, copyCanvasV2NativeSelection, pasteCanvasV2NativeClipboard, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';

const screen = { version: 1 as const, title: 'A player’s next team 🏒', width: 390, height: 844, html: '<main><h1>Your next team</h1><button id="save">Save</button></main>', css: 'h1{font-size:28px}', javascript: 'document.querySelector("#save").addEventListener("click",e=>e.target.textContent="Saved")', referenceAssetIds: [] };
const root = { html: '<main data-canvas-v2-node-id="canvas" data-canvas-v2-workspace-root="true"></main>', css: '' };

test('review follows retained crop lineage back to full references without cycles or unauthorized sources', () => {
  const original = { id: 'capture', label: 'Original product screen', url: 'data:image/png;base64,source' };
  const crop = { id: 'mark', label: 'Authentic mark', url: 'data:image/png;base64,crop', tags: ['derived-from:capture'] };
  const preparedScreen = { ...screen, referenceAssetIds: ['mark'] };
  assert.deepEqual(canvasV2ScreenReviewAssets(preparedScreen, [original, crop]).map(asset => asset.id), ['capture', 'mark']);
  assert.deepEqual(canvasV2ScreenReviewAssets({ ...preparedScreen, referenceAssetIds: ['mark', 'capture'] }, [original, crop]).map(asset => asset.id), ['capture', 'mark']);
  assert.equal(canvasV2ScreenReviewAssets(preparedScreen, [crop, { ...original, tags: ['derived-from:mark'] }]).length, 2);
  const unavailable = { ...original, source: { providerId: 'test', providerLabel: 'Test', sourceId: 'capture', sourceType: 'other' as const, label: 'Unavailable source', retrievedAt: '', permission: 'unavailable' as const } };
  assert.deepEqual(canvasV2ScreenReviewAssets(preparedScreen, [crop, unavailable]).map(asset => asset.id), ['mark']);
});

test('interactive source persists as one safe native object while arbitrary executable board markup stays prohibited', () => {
  assert.deepEqual(parseCanvasV2Screen(encodeCanvasV2Screen(screen)), screen);
  const patch = canvasV2ScreenPatch(root, screen, [], { x: 900, y: 1200 });
  const document = applyCanvasV2SourcePatch({ previous: root, operations: patch.operations, evidence: [] });
  assert.equal(readCanvasV2Screens(document.html)[0].nodeId, patch.nodeId);
  assert.deepEqual(validateCanvasV2ArtifactDocument(document), []);
  assert.ok(!document.html.includes('<script'));
  assert.ok(validateCanvasV2ArtifactDocument({ html: '<iframe srcdoc="evil"></iframe>', css: '' }).length);
  assert.ok(validateCanvasV2ArtifactDocument({ ...root, javascript: 'alert(1)' }).length);
});

test('targeted source updates retain user geometry, unchanged fields, references and other canvas objects', () => {
  const document = { ...root, html: `<main data-canvas-v2-node-id="canvas"><div data-canvas-v2-node-id="existing" ${SCREEN_ATTRIBUTE}="${encodeCanvasV2Screen(screen)}" style="left:932px;top:278px;width:520px;height:1125px"></div><p data-canvas-v2-node-id="human">Approved work</p></main>` };
  const patch = canvasV2ScreenPatch(document, { nodeId: 'existing', css: 'h1{font-size:30px}' }, [], { x: 0, y: 0 });
  const operation = patch.operations[0];
  assert.ok('html' in operation);
  assert.ok(operation.html.includes('left:932px;top:278px;width:520px;height:1125px'));
  const updated = readCanvasV2Screens(operation.html)[0].screen;
  assert.equal(updated.javascript, screen.javascript);
  assert.equal(updated.html, screen.html);
  assert.equal(updated.css, screen.css + '\nh1{font-size:30px}');
  const replaced = canvasV2ScreenPatch(document, { nodeId: 'existing', css: 'h1{font-size:30px}', cssMode: 'replace' }, [], { x: 0, y: 0 });
  assert.ok('html' in replaced.operations[0]);
  assert.equal(readCanvasV2Screens(replaced.operations[0].html)[0].screen.css, 'h1{font-size:30px}');
  assert.throws(() => canvasV2ScreenPatch(document, { nodeId: 'existing', cssMode: 'guess' }, [], { x: 0, y: 0 }), /cssMode/);
  assert.throws(() => canvasV2ScreenPatch(root, { nodeId: 'deleted', css: '' }, [], { x: 0, y: 0 }), /no longer exists/);
});

test('screen assets require authorized retained handles and remain with copy/paste', () => {
  const referenced = { ...screen, html: '<img src="northstar-asset:photo">', referenceAssetIds: ['photo'] };
  const html = `<div data-canvas-v2-node-id="screen" ${SCREEN_ATTRIBUTE}="${encodeCanvasV2Screen(referenced)}"></div>`;
  const asset = { id: 'photo', url: 'https://example.com/photo.png', label: 'Source photo' };
  assert.ok(validateCanvasV2EvidenceBindings({ html, css: '' }, []).length);
  assert.deepEqual(validateCanvasV2EvidenceBindings({ html, css: '' }, [asset]), []);
  assert.throws(() => validateCanvasV2Screen({ ...referenced, referenceAssetIds: [] }), /Declare/);
  assert.throws(() => validateCanvasV2Screen({ ...screen, html: '<img src="blob:https://temporary">' }), /temporary/);
  const empty: CanvasV2NativeSceneDocument = { schema: 'canvas-v2.native-scene.v1', revisionId: 'screen', width: 12000, height: 8000, nodes: [], rootIds: [], css: '' };
  const scene = applyCanvasV2NativeSceneMutation(empty, { kind: 'create', primitive: 'shape', nodeId: 'screen', x: 100, y: 100, width: 390, height: 844 });
  scene.nodes.find(node => node.sourceNodeId === 'screen')!.attributes[SCREEN_ATTRIBUTE] = encodeCanvasV2Screen(referenced);
  const clipboard = copyCanvasV2NativeSelection(scene, ['screen'], [asset])!;
  assert.deepEqual(clipboard.evidenceAssets, [asset]);
  assert.equal(readCanvasV2Screens(serializeCanvasV2NativeScene(pasteCanvasV2NativeClipboard(empty, clipboard, 'copy').scene).html).length, 1);
  const deleted = applyCanvasV2NativeSceneMutation(scene, { kind: 'delete', nodeId: 'screen' });
  assert.equal(deleted.nodes.length, 0);
  assert.equal(readCanvasV2Screens(serializeCanvasV2NativeScene(deleted).html).length, 0);
});

test('the host constructs the sandbox runtime with scoped bridge identity and bound image bytes', () => {
  const runtime = buildCanvasV2ScreenRuntime(screen, new Map(), 'known-token');
  assert.ok(runtime.includes("connect-src 'none'"));
  assert.ok(runtime.includes("script-src 'nonce-known-token'"));
  assert.ok(runtime.includes('e.source!==parent'));
  assert.ok(runtime.includes('e.data.token!==token'));
  assert.throws(() => validateCanvasV2Screen({ ...screen, html: '<button onclick="alert(1)">Save</button>' }), /event listeners/);
  assert.throws(() => validateCanvasV2Screen({ ...screen, html: '<iframe></iframe>' }), /Embedded/);
  assert.throws(() => validateCanvasV2Screen({ ...screen, css: '@import "https://external"' }), /external/);
});

test('registered simulations retain a fixed approved app runtime without accepting arbitrary URLs or model code', () => {
  const simulation = { ...screen, title: 'GRAET', width: 383, height: 820, html: '<div></div>', css: '', javascript: '', simulation: { appName: 'GRAET' as const, section: 'explore' as const } };
  assert.deepEqual(parseCanvasV2Screen(encodeCanvasV2Screen(simulation)), simulation);
  assert.throws(() => validateCanvasV2Screen({ ...simulation, javascript: 'parent.fetch("/api/private")' }), /approved runtime/);
  assert.throws(() => validateCanvasV2Screen({ ...simulation, simulation: { appName: 'https://arbitrary.test', section: 'explore' } }), /approved runtime/);
  const patch = canvasV2ScreenPatch(root, simulation, [], { x: 100, y: 100 });
  const document = applyCanvasV2SourcePatch({ previous: root, operations: patch.operations, evidence: [] });
  assert.throws(() => canvasV2ScreenPatch(document, { nodeId: patch.nodeId, html: '<b>new</b>' }, [], { x: 0, y: 0 }), /separate screen variant/);
  assert.throws(() => readCanvasV2Screens(document.html.replace('</div>', '<p data-canvas-v2-node-id="ghost">Invisible child</p></div>')), /invisible canvas children/);
});

test('screen comparison rearrangement preserves runtimes, size, first anchor and unrelated work', () => {
  const empty: CanvasV2NativeSceneDocument = { schema: 'canvas-v2.native-scene.v1', revisionId: 'live', width: 12000, height: 8000, nodes: [], rootIds: [], css: '' };
  const scene = applyCanvasV2NativeSceneMutation(empty, { kind: 'batch', label: 'Comparison set', mutations: ['a','b','c'].map((nodeId, i) => ({ kind: 'create' as const, primitive: 'shape' as const, nodeId, x: 100, y: 100 + i * 844, width: 390, height: 844 })) });
  for (const node of scene.nodes) { node.attributes[SCREEN_ATTRIBUTE] = encodeCanvasV2Screen(screen); node.userEdited = false; node.lastAuthor = 'northstar'; }
  const next = arrangeCanvasV2Screens(scene, { nodeIds: ['a','b','c'] });
  assert.deepEqual(next.nodes.map(node => [node.geometry.x,node.geometry.y]), [[100,100],[586,100],[1072,100]]);
  assert.deepEqual(scene.nodes.map(node => node.geometry.x), [100,100,100]);
  assert.ok(next.nodes.every(node => node.attributes[SCREEN_ATTRIBUTE] === encodeCanvasV2Screen(screen) && node.geometry.width === 390 && node.geometry.height === 844));
  const vertical = arrangeCanvasV2Screens(next, { nodeIds: ['a','b','c'], direction: 'vertical', gap: 120 });
  assert.deepEqual(vertical.nodes.map(node => node.geometry.y), [100,1064,2028]);
  const human = structuredClone(scene); human.nodes[1].userEdited = true;
  assert.throws(() => arrangeCanvasV2Screens(human, { nodeIds: ['a','b'] }), /human-owned/);
  assert.doesNotThrow(() => arrangeCanvasV2Screens(human, { nodeIds: ['a','b'] }, ['b']));
  assert.throws(() => arrangeCanvasV2Screens(scene, { nodeIds: ['a','deleted'] }), /deleted/);
  assert.throws(() => arrangeCanvasV2Screens(scene, { nodeIds: ['a','a'] }), /distinct/);
  const blocked = applyCanvasV2NativeSceneMutation(scene, { kind: 'create', primitive: 'shape', nodeId: 'human', x: 580, y: 100, width: 500, height: 500 });
  assert.throws(() => arrangeCanvasV2Screens(blocked, { nodeIds: ['a','b','c'] }), /cover/);
});


test('native screen source revision preserves geometry and every neighboring object', () => {
  const empty: CanvasV2NativeSceneDocument = { schema: 'canvas-v2.native-scene.v1', revisionId: 'live', width: 12000, height: 8000, nodes: [], rootIds: [], css: '' };
  const scene = applyCanvasV2NativeSceneMutation(empty, { kind: 'batch', label: 'Work', mutations: ['a','b'].map((nodeId, i) => ({ kind: 'create' as const, primitive: 'shape' as const, nodeId, x: 100 + i * 500, y: 100, width: 390, height: 844 })) });
  scene.nodes[0].attributes[SCREEN_ATTRIBUTE] = encodeCanvasV2Screen(screen);
  const changed = encodeCanvasV2Screen({ ...screen, html: '<h1>Refined</h1>' });
  const next = reviseCanvasV2NativeScreen(scene, 'a', changed);
  assert.deepEqual(next.nodes[0].geometry, scene.nodes[0].geometry);
  assert.deepEqual(next.nodes[1], scene.nodes[1]);
  assert.equal(scene.nodes[0].attributes[SCREEN_ATTRIBUTE], encodeCanvasV2Screen(screen));
  assert.equal(next.nodes[0].attributes[SCREEN_ATTRIBUTE], changed);
  assert.throws(() => reviseCanvasV2NativeScreen(scene, 'deleted', changed), /deleted/);
  scene.nodes[0].locked = true;
  assert.throws(() => reviseCanvasV2NativeScreen(scene, 'a', changed), /locked/);
});
