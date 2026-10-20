import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { encodeCanvasV2Screen, parseCanvasV2Screen, readCanvasV2Screens, SCREEN_ATTRIBUTE, canvasV2ScreenReviewAssets, canvasV2ScreenAssetToken, canvasV2ScreenBoundAssets, validateCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { arrangeCanvasV2Screens, reviseCanvasV2NativeScreen, canvasV2ScreenPatch, validateCanvasV2ScreenJavaScript } from '../lib/canvas-v2/interactive-screen-patch';
import { buildCanvasV2ScreenRuntime, fixedScreenMediaQuery } from '../lib/canvas-v2/interactive-screen-runtime';
import { canvasV2ScreenRuntimeIdentity, canvasV2ScreenRuntimeStateCompatible, clearCanvasV2ScreenRuntimeState, rememberCanvasV2ScreenRuntimeState, restoreCanvasV2ScreenRuntimeState } from '../lib/canvas-v2/screen-mock-state';
import { validateCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from '../lib/canvas-v2/artifact-safety';
import { applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange } from '../lib/canvas-v2/source-patch';
import { applyCanvasV2NativeSceneMutation, copyCanvasV2NativeSelection, pasteCanvasV2NativeClipboard, serializeCanvasV2NativeScene, patchCanvasV2NativeDocument, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import { compileCanvasV2SceneTransaction } from '../lib/canvas-v2/scene-transaction';
import { NORTHSTAR_THREE_HELPER_SOURCE } from '../lib/canvas-v2/screen-trusted-runtime';
import { runCanvasV2ScreenCommandWithControllerRetry } from '../lib/canvas-v2/screen-controller-retry';

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

test('a visual revision cannot silently remove the script that renders and connects an app', () => {
  const dynamic = { ...screen, html: '<main id="screen"></main>', javascript: 'document.querySelector("#screen").innerHTML="<button>Open task</button>";' };
  const document = applyCanvasV2SourcePatch({ previous: root, operations: canvasV2ScreenPatch(root, dynamic, [], { x: 100, y: 100 }).operations, evidence: [] });
  const nodeId = readCanvasV2Screens(document.html)[0].nodeId;
  const unchanged = document.html;
  for (const javascript of ['', '  \n']) {
    assert.throws(() => canvasV2ScreenPatch(document, { nodeId, css: 'main{padding:24px}', javascript }, [], { x: 0, y: 0 }), /remove the existing screen interactions.*Omit javascript.*unchanged/);
    assert.equal(document.html, unchanged);
  }
  const styleOnly = canvasV2ScreenPatch(document, { nodeId, css: 'main{padding:24px}' }, [], { x: 0, y: 0 });
  assert.ok('html' in styleOnly.operations[0]);
  assert.equal(readCanvasV2Screens(styleOnly.operations[0].html)[0].screen.javascript, dynamic.javascript);
  const replacement = canvasV2ScreenPatch(document, { nodeId, javascript: 'document.querySelector("#screen").textContent="Updated app";' }, [], { x: 0, y: 0 });
  assert.ok('html' in replacement.operations[0]);
  assert.match(readCanvasV2Screens(replacement.operations[0].html)[0].screen.javascript, /Updated app/);
  const staticScreen = canvasV2ScreenPatch(document, { nodeId, html: '<main>Approved static view</main>', javascript: '', clearJavaScript: true }, [], { x: 0, y: 0 });
  assert.ok('html' in staticScreen.operations[0]);
  assert.equal(readCanvasV2Screens(staticScreen.operations[0].html)[0].screen.javascript, '');
  assert.throws(() => canvasV2ScreenPatch(document, { nodeId, javascript: '', clearJavaScript: 'true' }, [], { x: 0, y: 0 }), /boolean/);
});

test('repeated full-style snapshots preserve late refinements without exponential source growth', () => {
  let doc = applyCanvasV2SourcePatch({ previous: root, operations: canvasV2ScreenPatch(root, screen, [], { x: 100, y: 100 }).operations, evidence: [] });
  const id = readCanvasV2Screens(doc.html)[0].nodeId;
  for (let i = 0; i < 20; i++) {
    const before = readCanvasV2Screens(doc.html)[0].screen;
    const fullStyle = before.css + `\n.screen-v${i}{padding:${i}px}`;
    doc = applyCanvasV2SourcePatch({ previous: doc, operations: canvasV2ScreenPatch(doc, { nodeId: id, css: fullStyle }, [], { x: 0, y: 0 }).operations, evidence: [] });
    const after = readCanvasV2Screens(doc.html)[0].screen;
    assert.equal(after.css, fullStyle);
    assert.equal(after.javascript, screen.javascript);
    assert.equal(after.html, screen.html);
  }
  assert.ok(readCanvasV2Screens(doc.html)[0].screen.css.length < 1000);
  assert.throws(() => validateCanvasV2Screen({ ...screen, css: 'x'.repeat(40001) }), /CSS exceeds 40000.*cssMode: replace/);
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

test('authored mobile runtime preserves hidden semantics and reports root versus nested horizontal overflow', () => {
  const runtime = buildCanvasV2ScreenRuntime({
    ...screen,
    html: '<main><section class="step" hidden><button>Inactive</button></section><div class="carousel"><div>Wide item</div></div></main>',
    css: '.step{display:flex}.carousel{overflow-x:auto;width:100%}.carousel>div{width:600px}',
  }, new Map(), 'semantics-test');
  assert.match(runtime, /data-northstar-screen-semantics/);
  assert.match(runtime, /\[hidden\]:not\(\[hidden="until-found"\]\)/);
  assert.match(runtime, /hiddenPainted/);
  assert.match(runtime, /bodyScrollWidth/);
  assert.match(runtime, /nested/);
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


test('read-only screen anchors place one or two new screens without changing protected source or geometry', () => {
  const empty: CanvasV2NativeSceneDocument = { schema: 'canvas-v2.native-scene.v1', revisionId: 'live', width: 12000, height: 8000, nodes: [], rootIds: [], css: '' };
  const scene = applyCanvasV2NativeSceneMutation(empty, { kind: 'batch', label: 'Screens', mutations: ['anchor','a','b'].map((nodeId, i) => ({ kind: 'create' as const, primitive: 'shape' as const, nodeId, x: i ? 4000 + i * 1000 : 100, y: 100, width: 390, height: 844 })) });
  for (const node of scene.nodes) { node.attributes[SCREEN_ATTRIBUTE] = encodeCanvasV2Screen({ ...screen, mockData: { selected: node.id } }); node.userEdited = false; node.lastAuthor = 'northstar'; }
  const anchor = scene.nodes[0]; anchor.userEdited = true; anchor.lastAuthor = 'user'; anchor.locked = true; anchor.editVersion = 276;
  const original = structuredClone(scene);
  const before = serializeCanvasV2NativeScene(scene);
  for (const ids of [['a'], ['a','b']]) {
    const next = arrangeCanvasV2Screens(scene, { nodeIds: ids, anchorNodeId: 'anchor' });
    assert.deepEqual(next.nodes[0], original.nodes[0]);
    assert.deepEqual(next.nodes[1].geometry, { ...scene.nodes[1].geometry, x: 586, y: 100 });
    if (ids.length === 2) assert.equal(next.nodes[2].geometry.x, 1072);
    else assert.deepEqual(next.nodes[2], original.nodes[2]);
    assert.deepEqual(next.nodes.map(node => node.attributes[SCREEN_ATTRIBUTE]), scene.nodes.map(node => node.attributes[SCREEN_ATTRIBUTE]));
    const after = serializeCanvasV2NativeScene(next);
    const oldRange = findCanvasV2SourceNodeRange(before.html, 'anchor')!;
    const newRange = findCanvasV2SourceNodeRange(after.html, 'anchor')!;
    assert.equal(after.html.slice(newRange.start, newRange.end), before.html.slice(oldRange.start, oldRange.end));
    assert.deepEqual(readCanvasV2Screens(after.html).map(item => item.screen), readCanvasV2Screens(before.html).map(item => item.screen));
  }
  const vertical = arrangeCanvasV2Screens(scene, { nodeIds: ['a','b'], anchorNodeId: 'anchor', direction: 'vertical' });
  assert.deepEqual(vertical.nodes.map(node => [node.geometry.x, node.geometry.y]), [[100,100],[100,1040],[100,1980]]);
  assert.deepEqual(scene, original);
  assert.throws(() => arrangeCanvasV2Screens(scene, { nodeIds: ['a'] }), /2–20/);
  assert.throws(() => arrangeCanvasV2Screens(scene, { nodeIds: ['anchor','a'], anchorNodeId: 'anchor' }, ['anchor']), /must not/);
  for (const anchorNodeId of [null, '', 4]) assert.throws(() => arrangeCanvasV2Screens(scene, { nodeIds: ['a'], anchorNodeId }), /anchorNodeId/);
  assert.throws(() => arrangeCanvasV2Screens(scene, { nodeIds: ['a'], anchorNodeId: 'deleted' }), /anchor.*deleted/);
  const hidden = structuredClone(scene); hidden.nodes[0].hidden = true;
  assert.throws(() => arrangeCanvasV2Screens(hidden, { nodeIds: ['a'], anchorNodeId: 'anchor' }), /unavailable/);
  const nonScreen = structuredClone(scene); delete nonScreen.nodes[0].attributes[SCREEN_ATTRIBUTE];
  assert.throws(() => arrangeCanvasV2Screens(nonScreen, { nodeIds: ['a'], anchorNodeId: 'anchor' }), /unavailable/);
  const grouped = structuredClone(scene); grouped.nodes[0].parentId = 'missing-group';
  assert.throws(() => arrangeCanvasV2Screens(grouped, { nodeIds: ['a'], anchorNodeId: 'anchor' }), /standalone/);
  const human = structuredClone(scene); human.nodes[1].userEdited = true;
  assert.throws(() => arrangeCanvasV2Screens(human, { nodeIds: ['a'], anchorNodeId: 'anchor' }), /human-owned/);
  assert.doesNotThrow(() => arrangeCanvasV2Screens(human, { nodeIds: ['a'], anchorNodeId: 'anchor' }, ['a']));
  human.nodes[1].locked = true;
  assert.throws(() => arrangeCanvasV2Screens(human, { nodeIds: ['a'], anchorNodeId: 'anchor' }, ['a']), /locked/);
  const blocked = applyCanvasV2NativeSceneMutation(scene, { kind: 'create', primitive: 'shape', nodeId: 'neighbor', x: 580, y: 100, width: 500, height: 500 });
  assert.throws(() => arrangeCanvasV2Screens(blocked, { nodeIds: ['a'], anchorNodeId: 'anchor' }), /cover/);
  const edge = structuredClone(scene); edge.nodes[0].geometry.x = 11500;
  assert.throws(() => arrangeCanvasV2Screens(edge, { nodeIds: ['a'], anchorNodeId: 'anchor' }), /bounds/);
});

test('screen arrangement preserves raw protected neighbor source instead of normalizing the whole board', () => {
  const empty: CanvasV2NativeSceneDocument = { schema: 'canvas-v2.native-scene.v1', revisionId: 'live', width: 12000, height: 8000, nodes: [], rootIds: [], css: '' };
  const scene = applyCanvasV2NativeSceneMutation(empty, { kind: 'batch', label: 'Existing board', mutations: ['anchor','new-ad','hidden-connector','locked-note','human-note'].map((nodeId, i) => ({ kind: 'create' as const, primitive: 'shape' as const, nodeId, x: 100 + i * 2000, y: i < 2 ? 100 : 3000, width: 390, height: 844 })) });
  for (const node of scene.nodes.slice(0, 2)) { node.attributes[SCREEN_ATTRIBUTE] = encodeCanvasV2Screen(screen); node.userEdited = false; node.lastAuthor = 'northstar'; delete node.attributes['data-canvas-v2-user-edited']; node.attributes['data-canvas-v2-origin'] = 'northstar'; node.attributes['data-canvas-v2-last-author'] = 'northstar'; }
  scene.nodes[0].locked = true;
  scene.nodes[2].hidden = true;
  scene.nodes[2].attributes.hidden = '';
  scene.nodes[3].locked = true;
  const serialized = serializeCanvasV2NativeScene(scene);
  const range = findCanvasV2SourceNodeRange(serialized.html, 'hidden-connector')!;
  // Historical source need not be byte-identical to today's serializer. In
  // particular, hidden SVG/viewBox/path and hand-written attributes must stay.
  const rawHidden = `<svg hidden="" data-canvas-v2-node-id="hidden-connector" data-canvas-v2-user-edited="visibility" viewBox="0 0 390 844" style="--canvas-v2-scene-x:4100px;--canvas-v2-scene-y:3000px"><path d="M0 0 L390 844" /></svg>`;
  const before = { ...serialized, html: serialized.html.slice(0, range.start) + rawHidden + serialized.html.slice(range.end) };
  const originalScene = structuredClone(scene);
  const next = arrangeCanvasV2Screens(scene, { nodeIds: ['new-ad'], anchorNodeId: 'anchor' });
  assert.strictEqual(next.nodes[0], scene.nodes[0], 'read-only anchor keeps immutable identity');
  for (const i of [2,3,4]) assert.strictEqual(next.nodes[i], scene.nodes[i], 'unrelated native node keeps immutable identity');
  const after = patchCanvasV2NativeDocument(before, scene, next)!;
  assert.ok(after);
  assert.equal(after.css, before.css);
  for (const id of ['anchor','hidden-connector','locked-note','human-note']) {
    const a = findCanvasV2SourceNodeRange(before.html, id)!;
    const b = findCanvasV2SourceNodeRange(after.html, id)!;
    assert.equal(after.html.slice(b.start, b.end), before.html.slice(a.start, a.end), id);
  }
  assert.deepEqual(readCanvasV2Screens(after.html), readCanvasV2Screens(before.html));
  assert.equal(next.nodes[1].geometry.x, 586);
  assert.deepEqual(scene, originalScene, 'arrangement does not mutate its input');
  const transaction = compileCanvasV2SceneTransaction({ origin: 'northstar', baseRevisionId: 'live', previous: before, next: after });
  assert.deepEqual(transaction.mutations.filter(mutation => mutation.kind !== 'preserve').map(mutation => mutation.nodeId), ['new-ad'], 'the real AI source transaction changes only the mover');
  assert.throws(() => compileCanvasV2SceneTransaction({ origin: 'northstar', baseRevisionId: 'live', previous: before, next: serializeCanvasV2NativeScene(next) }), /Hidden canvas object hidden-connector/);
  for (const protection of ['hidden', 'locked', 'userEdited'] as const) { const blocked = structuredClone(scene); blocked.nodes[1][protection] = true; assert.throws(() => arrangeCanvasV2Screens(blocked, { nodeIds: ['new-ad'], anchorNodeId: 'anchor' }), /unavailable|human-owned|locked/); }
  assert.equal(patchCanvasV2NativeDocument({ ...before, html: before.html.replace('data-canvas-v2-node-id=\"new-ad\"', 'data-canvas-v2-node-id=\"removed-ad\"') }, scene, next), undefined, 'missing mover source fails closed');
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


test('opaque encoded account references survive screen validation, identity binding and actual raster substitution', () => {
  const id = 'screen:tenant:graet:managing%20career%20tools:' + 'nested%3Aflow:'.repeat(30) + "athlete's(card)";
  assert.ok(id.length > 240);
  const input = { ...screen, html: `<img alt="Authentic captured mark" src="northstar-asset:${id}">`, css: `main{background-image:url("northstar-asset:${id}")}`, javascript: '', referenceAssetIds: [id] };
  const validated = validateCanvasV2Screen(input);
  assert.equal(validated.html, `<img alt="Authentic captured mark" src="northstar-asset:${canvasV2ScreenAssetToken(id)}">`);
  assert.deepEqual(validateCanvasV2Screen(validated), validated);
  assert.deepEqual(parseCanvasV2Screen(encodeCanvasV2Screen(validated)), validated);
  assert.deepEqual(canvasV2ScreenBoundAssets(validated), [id]);
  const raster = 'data:image/png;base64,iVBORw0KGgo=';
  const runtime = buildCanvasV2ScreenRuntime(validated, new Map([[id, raster]]), 'opaque-test');
  assert.ok(runtime.includes(`src="${raster}"`));
  assert.ok(runtime.includes(`url("${raster}")`));
  assert.throws(() => buildCanvasV2ScreenRuntime(validated, new Map(), 'opaque-test'), /retained pixels/);
  assert.throws(() => validateCanvasV2Screen({ ...input, referenceAssetIds: ['screen:tenant:graet'] }), /exact asset/);
  assert.throws(() => validateCanvasV2Screen({ ...input, html: '<img src="northstar-asset:photo-extra">', referenceAssetIds: ['photo'] }), /exact asset/);
});


test('screen commits reject JavaScript syntax faults without evaluating the script or hiding saved source', () => {
  const broken = "const expand=()=>{}document.querySelector('button')";
  assert.throws(() => validateCanvasV2ScreenJavaScript(broken), /JavaScript syntax error/);
  assert.throws(() => canvasV2ScreenPatch(root, { ...screen, javascript: broken }, [], { x: 100, y: 100 }), /JavaScript syntax error/);
  assert.doesNotThrow(() => parseCanvasV2Screen(encodeCanvasV2Screen({ ...screen, javascript: broken })));
  delete (globalThis as Record<string, unknown>).northstarSyntaxSideEffect;
  assert.doesNotThrow(() => validateCanvasV2ScreenJavaScript('globalThis.northstarSyntaxSideEffect=true;'));
  assert.equal((globalThis as Record<string, unknown>).northstarSyntaxSideEffect, undefined);
});

test('retained video binds inside the isolated screen without allowing network media or direct encoded payloads',async()=>{
  const {readFileSync}=await import('node:fs');
  const {readCanvasV2ScreenAssetPixels,isCanvasV2ScreenVideoBytes}=await import('../lib/canvas-v2/screen-asset-pixels');
  const bytes=readFileSync('app/canvas-v2-e2e/codex/media-assets/demo.mp4'),data='data:video/mp4;base64,'+bytes.toString('base64');
  assert.ok(isCanvasV2ScreenVideoBytes(data));
  assert.equal(await readCanvasV2ScreenAssetPixels('https://example.com/clip.mp4',new AbortController().signal,async()=>new Response(bytes,{headers:{'Content-Type':'video/mp4'}})),data);
  const video={...screen,html:'<video controls playsinline src="northstar-asset:clip"></video>',referenceAssetIds:['clip']};
  const asset={id:'clip',url:data,label:'Clip',mediaType:'video' as const,mimeType:'video/mp4'};
  const {validateCanvasV2ScreenAssets}=await import('../lib/canvas-v2/interactive-screen');validateCanvasV2ScreenAssets(video,[asset]);
  const runtime=buildCanvasV2ScreenRuntime(video,new Map([['clip',data]]),'video-token');
  assert.ok(runtime.includes('src="'+data+'"'));assert.ok(runtime.includes('media-src data:'));assert.ok(runtime.includes("connect-src 'none'"));
  assert.throws(()=>buildCanvasV2ScreenRuntime(video,new Map([['clip','data:video/mp4;base64,ZmFrZQ==']]),'bad'),/retained pixels/);
  assert.throws(()=>validateCanvasV2Screen({...video,html:'<video src="'+data+'"></video>'}),/handles/);
  await assert.rejects(readCanvasV2ScreenAssetPixels('https://example.com/large.mp4',new AbortController().signal,async()=>new Response(bytes,{headers:{'Content-Type':'video/mp4','Content-Length':'12000001'}})),/12 MB/);
});


test('timed or procedural product states default to live review instead of pausing only their CSS clock',async()=>{
 const {canvasV2ScreenMotionReviewMode}=await import('../lib/canvas-v2/interactive-screen-runtime');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:'button.onclick=()=>el.animate([],{duration:300})'}),'timeline');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:'setTimeout(()=>closeReader(),400)'}),'live');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:'requestAnimationFrame(draw)'}),'live');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:'setInterval(update,20)'}),'live');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:"northstarThree.createLoop(() => render())",trustedRuntimeLibraries:['three']},undefined),'live');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:"northstarThree.createLoop(() => render())",trustedRuntimeLibraries:['three']},'timeline'),'timeline');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:"northstarThree.createLoop(() => render())",trustedRuntimeLibraries:['three-webgpu']}),'live');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:''},'live'),'live');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:'setTimeout(close,400)'},'timeline'),'timeline');
});


test('video reference sampling plans bounded actual timestamps around transitions',async()=>{
 const {canvasV2VideoReferenceTimes}=await import('../lib/canvas-v2/screen-asset-pixels');
 assert.deepEqual(canvasV2VideoReferenceTimes(10),[0,2.45,4.9,7.3500000000000005,9.8]);
 assert.deepEqual(canvasV2VideoReferenceTimes(10,[1,1.1,1.3]),[1,1.1,1.3]);
 assert.equal(canvasV2VideoReferenceTimes(7200).at(-1),3600);
 for(const duration of [0,-1,Infinity,NaN])assert.throws(()=>canvasV2VideoReferenceTimes(duration));
 assert.deepEqual(canvasV2VideoReferenceTimes(10,[1]),[1]);
 for(const times of [[],[0,10],[2,1],[0,Infinity],[0,0],Array(9).fill(1)])assert.throws(()=>canvasV2VideoReferenceTimes(10,times));
});

test('mobile phone presentation survives saved source while desktop pages remain unframed',async()=>{
 const {canvasV2ScreenDevice}=await import('../lib/canvas-v2/screen-device');
 assert.equal(canvasV2ScreenDevice(screen),'ios');
 assert.equal(canvasV2ScreenDevice({...screen,width:1440,height:900}),'none');
 assert.equal(canvasV2ScreenDevice({...screen,device:'android'}),'android');
 const android=parseCanvasV2Screen(encodeCanvasV2Screen({...screen,device:'android'}));
 assert.equal(android.device,'android');assert.equal(android.html,screen.html);assert.equal(android.javascript,screen.javascript);
 assert.throws(()=>validateCanvasV2Screen({...screen,device:'unknown'}),/presentation/);
 const {canvasV2ScreenPreviewAsset}=await import('../lib/canvas-v2/interactive-screen');
 const preview={...screen,title:'GRAET',width:383,height:820,html:'<div></div>',css:'',javascript:'',simulation:{appName:'GRAET' as const,section:'home' as const}};
 const first=await canvasV2ScreenPreviewAsset('original',preview,'data:image/jpeg;base64,YQ==');
 const second=await canvasV2ScreenPreviewAsset('original',preview,'data:image/jpeg;base64,Yg==');
 assert.notEqual(first.id,second.id);assert.equal(first.source?.permission,'authorized');
 await assert.rejects(canvasV2ScreenPreviewAsset('screen',screen,'data:image/png;base64,YQ=='),/preview pixels/);
});

test('a new faithful copy requires observed identity lineage before authoring, while original creation stays available',()=>{
 const reference={id:'reference',url:'data:image/png;base64,a',label:'Product reference'};
 const faithful={...screen,referenceIntent:'faithful',referenceAssetIds:['reference']};
 assert.throws(()=>canvasV2ScreenPatch(root,faithful,[reference],{x:0,y:0}),/observed typography/);
 const identity={id:'observed',name:'Referenced product',platform:'mobile' as const,typography:'Observed font and weights',visualLanguage:'Observed palette',components:'Original visible content and icon conventions',motion:'Requested sheet transition',tokens:{},referenceAssetIds:['reference']};
 assert.doesNotThrow(()=>canvasV2ScreenPatch(root,{...faithful,productIdentityId:'observed'},[reference],{x:0,y:0},[identity]));
 assert.doesNotThrow(()=>canvasV2ScreenPatch(root,{...screen,referenceIntent:'original'},[],{x:0,y:0}));
});


test('faithful product appearance pins scheme queries independently of workspace or system preferences', () => {
  assert.equal(fixedScreenMediaQuery('screen and (prefers-color-scheme: dark) and (min-width: 300px)', 'light', null), 'screen and (max-width: 0px) and (min-width: 300px)');
  assert.equal(fixedScreenMediaQuery('not (prefers-color-scheme: light), (prefers-color-scheme: dark)', 'dark', null), 'not (max-width: 0px), (min-width: 0px)');
  assert.equal(fixedScreenMediaQuery('(PREFERS-COLOR-SCHEME: LIGHT) and (prefers-reduced-motion: reduce)', 'light', 'reduce'), '(min-width: 0px) and (min-width: 0px)');
  assert.equal(fixedScreenMediaQuery('(prefers-reduced-motion: no-preference)', 'dark', 'reduce'), '(max-width: 0px)');
  assert.equal(fixedScreenMediaQuery('(prefers-color-scheme: dark) and (prefers-reduced-motion: reduce)', null, null), '(prefers-color-scheme: dark) and (prefers-reduced-motion: reduce)');
  assert.equal(fixedScreenMediaQuery('(prefers-color-scheme: reduce)', 'light', null), '(prefers-color-scheme: reduce)', 'invalid feature values remain invalid');
  for (const appearance of ['light', 'dark'] as const) {
    const runtime = buildCanvasV2ScreenRuntime({...screen,referenceIntent:'faithful',referenceAppearance:appearance}, new Map(), 'theme-test');
    assert.ok(runtime.includes('const productAppearance='+JSON.stringify(appearance)));
  }
  const original = buildCanvasV2ScreenRuntime({...screen,referenceIntent:'original',referenceAppearance:'light'}, new Map(), 'theme-test');
  assert.ok(original.includes('const productAppearance="light"'), 'an original product keeps its declared appearance independently of canvas chrome');
  const derivative = buildCanvasV2ScreenRuntime({...screen,referenceIntent:'inspired',referenceAppearance:'dark'}, new Map(), 'theme-test');
  assert.ok(derivative.includes('const productAppearance="dark"'), 'a new layout in the same product must not follow the surrounding canvas theme');
  const blank = buildCanvasV2ScreenRuntime({...screen,referenceIntent:'original'}, new Map(), 'theme-test');
  assert.ok(blank.includes('const productAppearance="light"'), 'a blank product direction has a stable default, not an inherited canvas scheme');
});


test('component comparisons reject misleading out-of-image crops and mock data stays isolated in the saved runtime', async () => {
  const {screenComparisonRect}=await import('../lib/canvas-v2/screen-asset-pixels');
  assert.deepEqual(screenComparisonRect({x:.1,y:.2,width:.4,height:.5}),{x:.1,y:.2,width:.4,height:.5});
  for(const rect of [{x:-1,y:0,width:1,height:1},{x:.9,y:0,width:.2,height:1},{x:0,y:0,width:NaN,height:1}])assert.throws(()=>screenComparisonRect(rect),/normalized crop/);
  const source={...screen,mockData:{player:'Bond',goal:'Score 12 goals'}};
  const runtime=buildCanvasV2ScreenRuntime(source,new Map(),'data-test');
  assert.ok(runtime.includes('window.northstarProduct={data:{"player":"Bond","goal":"Score 12 goals"},rehydrated:false}'));
  assert.deepEqual(parseCanvasV2Screen(encodeCanvasV2Screen(source)).mockData,source.mockData);
  assert.throws(()=>validateCanvasV2Screen({...source,mockData:{goal:()=>1}}),/JSON/);
});


test('structural runtime continuity restores user data and matching fields without changing the saved initial dataset', () => {
  const source={...screen,mockData:{goal:'Starting goal'}};
  const state={data:{goal:'User goal',view:'editor'},fields:[{id:'goal',name:'',type:'text',value:'User draft',checked:false}],scroll:{x:0,y:120}};
  const runtime=buildCanvasV2ScreenRuntime(source,new Map(),'continuity',undefined,'',state);
  assert.ok(runtime.includes('window.northstarProduct={data:{"goal":"User goal","view":"editor"},rehydrated:true}'));
  assert.ok(runtime.includes('rehydrated:true'), 'authors receive an explicit remount signal for clocks and animation loops');
  assert.ok(runtime.includes('"value":"User draft"'));
  assert.deepEqual(source.mockData,{goal:'Starting goal'});
  const fresh=buildCanvasV2ScreenRuntime(source,new Map(),'fresh','reduce');
  assert.ok(fresh.includes('window.northstarProduct={data:{"goal":"Starting goal"},rehydrated:false}'));
  assert.ok(fresh.includes('rehydrated:false'));
  assert.ok(!fresh.includes('User draft'));
});


test('screen mock state survives a native scene reparent and rejects a changed product seed', () => {
  const identity = canvasV2ScreenRuntimeIdentity({ productIdentityId: 'stride', referenceNodeId: 'stride-screen', mockData: { distance: 4.36, completed: false } });
  const state = { data: { distance: 4.36, completed: false }, fields: [], scroll: { x: 0, y: 120 } };
  rememberCanvasV2ScreenRuntimeState('stride-screen', identity, state);
  const remounted = restoreCanvasV2ScreenRuntimeState('stride-screen', canvasV2ScreenRuntimeIdentity({ productIdentityId: 'stride', referenceNodeId: 'stride-screen', mockData: { completed: false, distance: 4.36 } }));
  assert.deepEqual(remounted, state, 'grouping or undo must not reset a live app when its source seed is unchanged');
  assert.equal(canvasV2ScreenRuntimeStateCompatible(identity, canvasV2ScreenRuntimeIdentity({ productIdentityId: 'stride', referenceNodeId: 'stride-screen', mockData: { distance: 0, completed: false } })), false);
  assert.equal(restoreCanvasV2ScreenRuntimeState('stride-screen', canvasV2ScreenRuntimeIdentity({ productIdentityId: 'stride', referenceNodeId: 'stride-screen', mockData: { distance: 0, completed: false } })), undefined);
  rememberCanvasV2ScreenRuntimeState('stride-screen', identity, state);
  clearCanvasV2ScreenRuntimeState('stride-screen');
  assert.equal(restoreCanvasV2ScreenRuntimeState('stride-screen', identity), undefined, 'reset removes the edited runtime snapshot so the authored mock seed can initialize the next mount');
});

test('new original and referenced screens cannot silently use an undefined review intent',()=>{
 const original = canvasV2ScreenPatch(root,screen,[],{x:0,y:0});
 const decode=(operations: typeof original.operations, evidence: Array<{id:string;url:string;label:string}>)=>readCanvasV2Screens(applyCanvasV2SourcePatch({previous:root,operations,evidence}).html)[0].screen;
 assert.equal(decode(original.operations,[]).referenceIntent,'original');
 const reference={id:'ref',url:'data:image/png;base64,AA==',label:'Observed app'};
 assert.throws(()=>canvasV2ScreenPatch(root,{...screen,referenceAssetIds:['ref']},[reference],{x:0,y:0}),/observed typography/);
 const profile={id:'app',name:'App',platform:'mobile' as const,visualLanguage:'Observed colours',typography:'Measured glyphs',components:'Observed native components',motion:'None observed',tokens:{},referenceAssetIds:['ref']};
 const faithful=canvasV2ScreenPatch(root,{...screen,referenceAssetIds:['ref'],productIdentityId:'app'},[reference],{x:0,y:0},[profile]);
 assert.equal(decode(faithful.operations,[reference]).referenceIntent,'faithful');
 const inspired=canvasV2ScreenPatch(root,{...screen,referenceIntent:'inspired',referenceAssetIds:['ref'],productIdentityId:'app'},[reference],{x:0,y:0},[profile]);
 assert.equal(decode(inspired.operations,[reference]).referenceIntent,'inspired','explicit reinterpretation remains available');
});

test('advertised Three constructor namespace and tracked renderer contract produce ready draws', async () => {
  const { NORTHSTAR_AGENT_TOOLS } = await import('../lib/canvas-v2/managed-agent/config');
  const tool = NORTHSTAR_AGENT_TOOLS.find(tool => 'name' in tool && tool.name === 'canvas_screen');
  assert.ok(tool && 'description' in tool);
  assert.match(tool.description, /const THREE = window\.northstarThreeCore/);
  assert.match(tool.description, /facade registers readiness and capture/);
  class Canvas { dataset: Record<string, string> = {}; }
  class Scene {}
  class Renderer { render() {} dispose() {} }
  const sandbox: Record<string, unknown> = {
    HTMLCanvasElement: Canvas,
    northstarThreeCore: { Scene, WebGLRenderer: Renderer }, northstarGLTFLoader: class {},
    addEventListener() {},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(NORTHSTAR_THREE_HELPER_SOURCE, sandbox);
  const result = vm.runInNewContext(`(() => {
    const THREE = window.northstarThreeCore;
    const renderer = northstarThree.createRenderer(new HTMLCanvasElement(), {antialias:true, alpha:true});
    renderer.render(new THREE.Scene(), {});
    return northstarThree.readiness();
  })()`, sandbox);
  assert.equal(result.ready, true);
  assert.equal(result.renderers[0].renders, 1);
  assert.equal(sandbox.THREE, undefined);
});

test('trusted Three runtime is explicit, pinned and keeps model handles opaque', () => {
  const model = { ...screen, trustedRuntimeLibraries: ['three' as const], html: '<canvas id="model"></canvas>', javascript: "const loader=northstarThree.createLoader();loader.parse(northstarAssets.arrayBuffer('northstar-asset:model'),'/',()=>{});", referenceAssetIds: ['model'] };
  assert.deepEqual(validateCanvasV2Screen(model).trustedRuntimeLibraries, ['three']);
  assert.throws(() => validateCanvasV2Screen({ ...model, trustedRuntimeLibraries: ['other' as never] }), /pinned Three/);
  const runtime = buildCanvasV2ScreenRuntime({ ...model, referenceAssetIds: [], javascript: '' }, new Map(), 'three-test');
  assert.match(runtime, /northstarThreeCore/);
  assert.match(runtime, /preserveDrawingBuffer: true/);
  assert.match(runtime, /northstarAssets/);
  assert.match(runtime, /webglDiagnostics/);
  assert.match(runtime, /nonBlack/);
  assert.match(runtime, /samplePoints/);
  assert.match(runtime, /checkpoint:\s*true/);
  for (const script of runtime.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new vm.Script(script[1]), 'embedded bootstrap and trusted helper must parse without module transpiler globals');
  }
  assert.match(runtime, /readPixels/);
  assert.match(runtime, /waitTrustedRuntime/);
  assert.match(runtime, /whenReady\(4000\)/);
  assert.match(runtime, /three:window\.northstarThree/);
  assert.match(runtime, /pagehide/);
  assert.match(runtime, /disposeAll/);
  assert.match(runtime, /connect-src 'none'/);
  assert.ok(!buildCanvasV2ScreenRuntime(screen, new Map(), 'plain').includes('northstarThreeCore'));
});

test('trusted Three loops are bounded and dispose idempotently on scene teardown', () => {
  const callbacks = new Map<number, (time:number)=>void>(); let nextId = 0; let cancelCount = 0; let pagehide: (()=>void)|undefined;
  class Canvas { dataset: Record<string,string> = {}; }
  class Renderer { disposed = false; constructor(public options: Record<string, unknown>) {} render() {} dispose() { this.disposed = true; } }
  class Loader {}
  const sandbox: Record<string, unknown> = {
    Canvas, HTMLCanvasElement: Canvas,
    northstarThreeCore: { WebGLRenderer: Renderer }, northstarGLTFLoader: Loader,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback:(time:number)=>void) => { const id=++nextId; callbacks.set(id,callback); return id; },
    cancelAnimationFrame: (id:number) => { cancelCount++; callbacks.delete(id); },
    addEventListener: (name:string, callback:()=>void) => { if(name==='pagehide')pagehide=callback; },
  };
  sandbox.window=sandbox;
  vm.runInNewContext(NORTHSTAR_THREE_HELPER_SOURCE, sandbox);
  const api = (sandbox as {northstarThree?:{createRenderer:(canvas:Canvas)=>Renderer;createLoop:(render:()=>void,options?:Record<string,unknown>)=>{start():void;dispose():void};disposeAll():void}}).northstarThree!;
  const renderer=api.createRenderer(new Canvas());
  const loop=api.createLoop(()=>{}, {respectReducedMotion:false}); loop.start(); loop.start();
  assert.equal(callbacks.size,1,'repeated start must not create duplicate RAFs');
  pagehide?.(); pagehide?.();
  assert.equal(callbacks.size,0,'teardown must cancel the pending RAF'); assert.equal(cancelCount,1); assert.equal(renderer.disposed,true);
  assert.doesNotThrow(()=>{loop.dispose();api.disposeAll()});
});

test('trusted Three loops follow dynamic motion preferences without losing playback intent or duplicating frames', () => {
  const callbacks = new Map<number, (time: number) => void>();
  const listeners = new Set<() => void>();
  let nextId = 0, paints = 0;
  const preference = { matches: false, addEventListener: (_name: string, callback: () => void) => listeners.add(callback), removeEventListener: (_name: string, callback: () => void) => listeners.delete(callback) };
  const sandbox: Record<string, unknown> = { northstarThreeCore: {}, northstarGLTFLoader: class {}, matchMedia: () => preference, performance,
    requestAnimationFrame: (callback: (time: number) => void) => { const id = ++nextId; callbacks.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => callbacks.delete(id), addEventListener: () => undefined };
  sandbox.window = sandbox;
  vm.runInNewContext(NORTHSTAR_THREE_HELPER_SOURCE, sandbox);
  const api = (sandbox as {northstarThree?: {createLoop: (render: () => void) => {start(): void; pause(): void; dispose(): void}}}).northstarThree!;
  const loop = api.createLoop(() => paints++);
  const change = (matches: boolean) => { preference.matches = matches; for (const listener of listeners) listener(); };
  loop.start(); assert.equal(callbacks.size, 1);
  change(true); assert.equal(callbacks.size, 0); assert.equal(paints, 1, 'reduce paints one stationary state');
  change(false); assert.equal(callbacks.size, 1, 'restoring normal motion resumes an active loop');
  loop.start(); assert.equal(callbacks.size, 1);
  loop.pause(); change(true); change(false); assert.equal(callbacks.size, 0, 'preference changes cannot unpause a user-paused loop');
  loop.start(); loop.dispose(); assert.equal(callbacks.size, 0); assert.equal(listeners.size, 0);
});

test('offscreen Three defers GPU draws while authored clocks continue and review paints current state', () => {
  const callbacks = new Map<number, (time: number) => void>();
  const draws: number[] = [];
  let nextId = 0, clock = 0;
  class Canvas { dataset: Record<string,string> = {}; }
  class Renderer {
    target: unknown = null;
    getRenderTarget() { return this.target; }
    render(scene: { time: number }) { draws.push(scene.time); }
    dispose() {}
  }
  const sandbox: Record<string, unknown> = {
    HTMLCanvasElement: Canvas, northstarThreeCore: { WebGLRenderer: Renderer }, northstarGLTFLoader: class {},
    requestAnimationFrame: (callback: (time: number) => void) => { callbacks.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id: number) => callbacks.delete(id), addEventListener: () => undefined,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(NORTHSTAR_THREE_HELPER_SOURCE, sandbox);
  const api = (sandbox as { northstarThree?: {
    createRenderer(canvas: Canvas): Renderer;
    createLoop(render: (time: number) => void, options: Record<string, unknown>): { start(): void };
    setViewportActive(active: boolean): void;
    beginReviewDraw(): () => void;
    readiness(): { renderers: Array<{ skippedDraws: number }>; reviewDraws: number };
  } }).northstarThree!;
  const scene = { time: 0 }, renderer = api.createRenderer(new Canvas());
  const loop = api.createLoop(time => { clock++; scene.time = time; renderer.render(scene); }, { respectReducedMotion: false });
  const tick = (time: number) => { const [id, callback] = [...callbacks][0]; callbacks.delete(id); callback(time); };
  loop.start(); tick(16);
  api.setViewportActive(false);
  for (let frame = 2; frame <= 61; frame++) tick(frame * 16);
  assert.equal(clock, 61, 'offscreen authored callbacks must advance every clock/mixer normally');
  assert.equal(callbacks.size, 1, 'visibility cannot pause or duplicate the authored loop');
  assert.deepEqual(draws, [16]); assert.equal(api.readiness().renderers[0].skippedDraws, 60);
  api.setViewportActive(true);
  assert.equal(draws.at(-1), 976, 'reentry immediately paints the latest mutable scene');
  tick(992); assert.equal(draws.at(-1), 992, 'visible GPU draws keep their full cadence');
  api.setViewportActive(false); tick(1008);
  const finishReview = api.beginReviewDraw();
  assert.equal(draws.at(-1), 1008, 'offscreen capture starts with a current draw');
  tick(1024); assert.equal(draws.at(-1), 1024, 'review keeps rendering while awaiting readiness/pixels');
  finishReview(); finishReview();
  const reviewedDraws = draws.length; tick(1040);
  assert.equal(draws.length, reviewedDraws); assert.equal(api.readiness().reviewDraws, 0);
  renderer.target = { texture: true }; renderer.render({ time: 1056 });
  assert.equal(draws.at(-1), 1056, 'internal render targets may feed app effects/readback and must keep drawing');
  const beforeInternalReview = draws.length, finishInternalReview = api.beginReviewDraw();
  assert.equal(draws.length, beforeInternalReview, 'review must not replay presentation args into an active internal target');
  finishInternalReview(); renderer.target = null;
  api.setViewportActive(true);
  assert.equal(draws.at(-1), 1040, 'internal draws cannot replace the cached presentation scene');
});

test('trusted Three readiness waits for delayed parses, rejects stale pre-load draws and reports callback failures', async () => {
  const run = async (mode: 'delayed' | 'error' | 'never' | 'preload-no-draw' | 'preload-draw' | 'async-error') => {
    class Canvas { dataset: Record<string,string> = {}; }
    class Renderer { constructor(public options: Record<string, unknown>) {} render() {} dispose() {} }
    class LoadingManager { onError?: (url: string) => void; }
    const renderTarget: {current?: Renderer} = {};
    class Loader {
      parse(_data: ArrayBuffer, _path: string, onLoad: (value: unknown) => unknown, onError: (error: Error) => void) {
        if (mode === 'delayed' || mode === 'preload-no-draw' || mode === 'preload-draw' || mode === 'async-error') {
          setTimeout(() => {
            const callback = onLoad({ scene: {} });
            if (mode === 'preload-draw') renderTarget.current?.render();
            void callback;
          }, 20);
        }
        else if (mode === 'error') setTimeout(() => onError(new Error('mock parse failed')), 10);
      }
    }
    const sandbox: Record<string, unknown> = {
      Canvas, HTMLCanvasElement: Canvas, setTimeout, clearTimeout, performance,
      northstarThreeCore: { WebGLRenderer: Renderer, LoadingManager }, northstarGLTFLoader: Loader,
      matchMedia: () => ({ matches: false }), requestAnimationFrame: (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 0),
      cancelAnimationFrame: (id: number) => clearTimeout(id), addEventListener: () => undefined,
    };
    sandbox.window = sandbox;
    vm.runInNewContext(NORTHSTAR_THREE_HELPER_SOURCE, sandbox);
    const api = (sandbox as {northstarThree?: {createRenderer: (canvas: Canvas) => Renderer; createLoader: (manager: LoadingManager) => Loader; createLoadingManager: () => LoadingManager; whenReady: (timeout: number) => Promise<{status: string; ready: boolean; pendingLoads: number; errors?: string[]}>}}).northstarThree!;
    const renderer = api.createRenderer(new Canvas()); renderTarget.current = renderer; renderer.render();
    const manager = api.createLoadingManager();
    const onLoad = mode === 'async-error' ? () => Promise.reject(new Error('mock async callback failed')) : mode === 'preload-draw' ? () => undefined : () => { if (mode !== 'preload-no-draw') renderTarget.current?.render(); };
    api.createLoader(manager).parse(new ArrayBuffer(0), '/', onLoad, () => undefined);
    return api.whenReady(mode === 'never' || mode === 'preload-no-draw' ? 50 : 200);
  };
  assert.deepEqual((await run('delayed')).status, 'ready');
  const errored = await run('error'); assert.equal(errored.status, 'error'); assert.equal(errored.ready, false);
  const timedOut = await run('never'); assert.equal(timedOut.status, 'timeout'); assert.equal(timedOut.pendingLoads, 1);
  const staleDraw = await run('preload-no-draw'); assert.equal(staleDraw.status, 'timeout'); assert.equal(staleDraw.ready, false); assert.equal(staleDraw.pendingLoads, 0);
  assert.deepEqual((await run('preload-draw')).status, 'ready');
  const asyncError = await run('async-error'); assert.equal(asyncError.status, 'error'); assert.equal(asyncError.ready, false); assert.match(asyncError.errors?.join(' ') ?? '', /mock async callback failed/);
});

test('inspection retries only a same-source controller turnover and never crosses revisions or caller aborts', async () => {
  type Controller = { encoded: string; run: () => Promise<string> };
  let current: Controller;
  const replacement: Controller = { encoded: 'same-source', run: async () => 'fresh result' };
  const first: Controller = { encoded: 'same-source', run: async () => { current = replacement; throw new DOMException('StrictMode cleanup', 'AbortError'); } };
  current = first;
  assert.equal(await runCanvasV2ScreenCommandWithControllerRetry(() => current as never, 'same-source', undefined, new AbortController().signal), 'fresh result');

  current = { encoded: 'old-source', run: async () => { current = { encoded: 'new-source', run: async () => 'wrong result' }; throw new DOMException('cleanup', 'AbortError'); } };
  await assert.rejects(runCanvasV2ScreenCommandWithControllerRetry(() => current as never, 'old-source', undefined, new AbortController().signal), /revised or deleted/);

  const caller = new AbortController();
  current = { encoded: 'same-source', run: async () => { caller.abort(new Error('caller stopped')); throw new DOMException('cleanup', 'AbortError'); } };
  await assert.rejects(runCanvasV2ScreenCommandWithControllerRetry(() => current as never, 'same-source', undefined, caller.signal), /caller stopped/);
  await assert.rejects(runCanvasV2ScreenCommandWithControllerRetry(() => undefined as never, 'missing', undefined, new AbortController().signal, { timeoutMs: 20 }), /not ready/);
});


test('explicit authored preview retains exact source lineage and rejects stale or unrelated reference evidence', async () => {
 const {canvasV2ScreenPreviewAsset,canvasV2ScreenReferencePreview}=await import('../lib/canvas-v2/interactive-screen');
 const authored={...screen,productIdentityId:'accepted-product'};
 const original={nodeId:'accepted-screen',screen:authored,encoded:encodeCanvasV2Screen(authored)};
 const pixels='data:image/jpeg;base64,YQ==';
 const preview=await canvasV2ScreenPreviewAsset(original.nodeId,authored,pixels,original.encoded);
 assert.equal(preview.url,pixels);assert.equal(preview.source?.sourceId,original.nodeId);
 assert.ok(preview.tags?.includes('preview-origin:authored'));
 assert.equal(await canvasV2ScreenReferencePreview(original,[preview],'accepted-product','faithful'),preview);
 assert.equal((await canvasV2ScreenPreviewAsset(original.nodeId,authored,pixels,original.encoded)).id,preview.id,'same source/pixels deduplicate');
 const changed={...authored,javascript:authored.javascript+';void 0'};
 const changedOriginal={...original,screen:changed,encoded:encodeCanvasV2Screen(changed)};
 const changedPreview=await canvasV2ScreenPreviewAsset(original.nodeId,changed,pixels,changedOriginal.encoded);
 assert.notEqual(changedPreview.id,preview.id,'even unchanged pixels cannot overwrite different source lineage');
 await assert.rejects(canvasV2ScreenReferencePreview(changedOriginal,[preview],'accepted-product','faithful'),/exact source/);
 await assert.rejects(canvasV2ScreenReferencePreview(undefined,[preview],'accepted-product','faithful'),/existing authored screen/);
 await assert.rejects(canvasV2ScreenReferencePreview({...original,nodeId:'another-screen'},[preview],'accepted-product','faithful'),/exact source/);
 for(const source of [{...preview.source!,permission:'unavailable' as const},{...preview.source!,providerId:'foreign'},{...preview.source!,sourceId:'another-screen'}]){
  await assert.rejects(canvasV2ScreenReferencePreview(original,[{...preview,source}],'accepted-product','faithful'),/exact source/);
 }
 await assert.rejects(canvasV2ScreenReferencePreview(original,[preview],'unrelated-product','faithful'),/same identity/);
 assert.equal(await canvasV2ScreenReferencePreview(original,[preview],'new-product','inspired'),preview,'explicit reinterpretation can reference another product without claiming faithful identity');
});

test('faithful authored component uses real preview plus explicit same identity evidence without copying or changing source app', async () => {
 const {canvasV2ScreenPreviewAsset,canvasV2ScreenReferencePreview}=await import('../lib/canvas-v2/interactive-screen');
 const {validateCanvasV2ProductIdentity}=await import('../lib/canvas-v2/product-identity');
 const identity={id:'accepted-product',name:'Accepted product',platform:'mobile' as const,typography:'Observed type',visualLanguage:'Accepted original palette',components:'Original interactive button',motion:'Original saved state',tokens:{},referenceAssetIds:[] as string[]};
 const authored={...screen,productIdentityId:identity.id,referenceIntent:'original' as const};
 const sourcePatch=canvasV2ScreenPatch(root,authored,[],{x:1100,y:1300},[identity]);
 const document=applyCanvasV2SourcePatch({previous:root,operations:sourcePatch.operations,evidence:[]});
 const original=readCanvasV2Screens(document.html)[0];
 const before=findCanvasV2SourceNodeRange(document.html,original.nodeId)!;
 const sourceBytes=document.html.slice(before.start,before.end);
 const preview=await canvasV2ScreenPreviewAsset(original.nodeId,original.screen,'data:image/jpeg;base64,YQ==',original.encoded);
 const retained=await canvasV2ScreenReferencePreview(original,[preview],identity.id,'faithful');
 const component={...screen,title:'Saved button component',device:'none',width:240,height:240,html:'<button id="save">Save</button>',css:'',referenceNodeId:original.nodeId,referenceIntent:'faithful',productIdentityId:identity.id,referenceAssetIds:[retained.id]};
 assert.throws(()=>canvasV2ScreenPatch(document,component,[preview],{x:1600,y:1300},[identity]),/identity evidence/,'real capture alone does not bypass primary-reference gate');
 const observed=validateCanvasV2ProductIdentity({...identity,referenceAssetIds:[preview.id],referenceRoles:[{assetId:preview.id,role:'identity',intent:'Current accepted authored source for exact component extraction'}]},[preview]);
 const componentPatch=canvasV2ScreenPatch(document,component,[preview],{x:1600,y:1300},[observed]);
 const next=applyCanvasV2SourcePatch({previous:document,operations:componentPatch.operations,evidence:[preview]});
 const unchanged=findCanvasV2SourceNodeRange(next.html,original.nodeId)!;
 assert.equal(next.html.slice(unchanged.start,unchanged.end),sourceBytes,'original source and native geometry remain byte-for-byte unchanged');
 const result=readCanvasV2Screens(next.html).find(item=>item.nodeId===componentPatch.nodeId)!.screen;
 assert.equal(result.referenceNodeId,original.nodeId);assert.equal(result.productIdentityId,identity.id);
 assert.equal(result.referenceIntent,'faithful');assert.equal(result.html,component.html);
 assert.equal(result.javascript,authored.javascript,'extracted live behavior remains authored JavaScript, not screenshot substitution');
 assert.equal(identity.referenceAssetIds.length,0,'retaining pixels never mutates the identity implicitly');
});

test('async GPU renderer reports actual fallback, enforces strict selection and waits for GPU submission', async () => {
  class Canvas { dataset: Record<string,string> = {}; }
  let fallback=false, submitted=0, disposed=0;
  class Renderer {
    backend={isWebGPUBackend:!fallback};
    constructor(public options:Record<string,unknown>){ if(options.forceWebGL)this.backend.isWebGPUBackend=false; }
    async init(){} render(){} dispose(){disposed++;} async waitForGPU(){submitted++;}
  }
  const make=()=>{
    const sandbox:Record<string,unknown>={HTMLCanvasElement:Canvas,northstarThreeCore:{},northstarGLTFLoader:class {},northstarThreeWebGPURenderer:Renderer,addEventListener:()=>{},setTimeout,clearTimeout,performance};sandbox.window=sandbox;
    vm.runInNewContext(NORTHSTAR_THREE_HELPER_SOURCE,sandbox);
    return sandbox.northstarThree as {createRendererAsync:(canvas:Canvas,options?:Record<string,unknown>)=>Promise<Renderer>;whenReady:(timeout:number)=>Promise<{ready:boolean;renderers:Array<{backend:string}>}>;readiness:()=>{status:string}};
  };
  const api=make(),canvas=new Canvas(),renderer=await api.createRendererAsync(canvas,{backend:'webgpu'});
  renderer.render();const ready=await api.whenReady(100);
  assert.equal(ready.ready,true);assert.equal(ready.renderers[0].backend,'webgpu');assert.equal(submitted,1);assert.equal(canvas.dataset.northstarRenderer,'webgpu');
  fallback=true;const auto=make(),autoCanvas=new Canvas(),autoRenderer=await auto.createRendererAsync(autoCanvas,{backend:'auto'});autoRenderer.render();
  assert.equal((await auto.whenReady(100)).renderers[0].backend,'webgl2');assert.equal(autoCanvas.dataset.northstarRenderer,'webgl2');
  const strict=make();await assert.rejects(strict.createRendererAsync(new Canvas(),{backend:'webgpu'}),/WebGPU is unavailable/);
  assert.equal(strict.readiness().status,'error');assert.equal(disposed,1);
  await assert.rejects(make().createRendererAsync(new Canvas(),{backend:'invented'}),/Choose auto/);
});
