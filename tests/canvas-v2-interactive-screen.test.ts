import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeCanvasV2Screen, parseCanvasV2Screen, readCanvasV2Screens, SCREEN_ATTRIBUTE, canvasV2ScreenReviewAssets, canvasV2ScreenAssetToken, canvasV2ScreenBoundAssets, validateCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { arrangeCanvasV2Screens, reviseCanvasV2NativeScreen, canvasV2ScreenPatch, validateCanvasV2ScreenJavaScript } from '../lib/canvas-v2/interactive-screen-patch';
import { buildCanvasV2ScreenRuntime, fixedScreenMediaQuery } from '../lib/canvas-v2/interactive-screen-runtime';
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
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:''},'live'),'live');
 assert.equal(canvasV2ScreenMotionReviewMode({javascript:'setTimeout(close,400)'},'timeline'),'timeline');
});


test('video reference sampling plans bounded actual timestamps around transitions',async()=>{
 const {canvasV2VideoReferenceTimes}=await import('../lib/canvas-v2/screen-asset-pixels');
 assert.deepEqual(canvasV2VideoReferenceTimes(10),[0,2.45,4.9,7.3500000000000005,9.8]);
 assert.deepEqual(canvasV2VideoReferenceTimes(10,[1,1.1,1.3]),[1,1.1,1.3]);
 assert.equal(canvasV2VideoReferenceTimes(7200).at(-1),3600);
 for(const duration of [0,-1,Infinity,NaN])assert.throws(()=>canvasV2VideoReferenceTimes(duration));
 for(const times of [[1],[0,10],[2,1],[0,Infinity],[0,0],Array(9).fill(1)])assert.throws(()=>canvasV2VideoReferenceTimes(10,times));
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
 const first=canvasV2ScreenPreviewAsset('original',preview,'data:image/jpeg;base64,YQ==');
 const second=canvasV2ScreenPreviewAsset('original',preview,'data:image/jpeg;base64,Yg==');
 assert.notEqual(first.id,second.id);assert.equal(first.source?.permission,'authorized');
 assert.throws(()=>canvasV2ScreenPreviewAsset('screen',screen,'data:image/jpeg;base64,YQ=='),/preview pixels/);
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
  assert.ok(original.includes('const productAppearance=null'), 'an original or inspired product can deliberately own its theme behavior');
});
