import assert from 'node:assert/strict';
import test from 'node:test';
import { projectImageAssets, uploadedProjectImage, uploadedProjectModel } from '../lib/canvas-v2/screen-asset-edit';
import type { CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';

test('project imports retain readable labels, original pixels and upload ownership without placing a canvas object',()=>{
  const asset=uploadedProjectImage({kind:'image',id:'book',name:'linen-cover.png',mimeType:'image/png',dataUrl:'data:image/png;base64,YQ==',width:100,height:200,byteSize:1,createdAt:'2026-10-09T12:00:00Z'});
  assert.equal(asset.url,'data:image/png;base64,YQ==');assert.equal(asset.label,'linen cover');assert.equal(asset.source?.sourceType,'uploaded');assert.equal(asset.source?.permission,'authorized');
  assert.deepEqual(projectImageAssets(undefined,[asset]),[asset]);
});

test('a retained GLB upload stays an evidence handle rather than an image node',()=>{
  const model=uploadedProjectModel({id:'model-1',name:'athlete.glb',mimeType:'model/gltf-binary',dataUrl:testGlb({asset:{version:'2.0'},buffers:[{byteLength:4}]}),createdAt:'2026-10-12T12:00:00Z'});
  assert.equal(model.mediaType,'model'); assert.equal(model.url.startsWith('data:model/gltf-binary;'),true);
  assert.equal(projectImageAssets(undefined,[model]).length,1);
});

test('the image drawer excludes recorded motion, inaccessible evidence and unretained remote URLs',()=>{
  const image={id:'image',url:'data:image/png;base64,YQ==',label:'Image',mediaType:'image' as const};
  const unavailable={...image,id:'private',source:{providerId:'test',providerLabel:'Test',sourceId:'private',sourceType:'other' as const,label:'Private',retrievedAt:'',permission:'unavailable' as const}};
  assert.deepEqual(projectImageAssets(undefined,[image,{...image,id:'gif',mediaType:'gif'},unavailable,{...image,id:'remote',url:'https://example.com/image.png'}]),[image]);
});

test('a native upload has a stable reusable handle and is not duplicated when already retained',()=>{
  const scene={nodes:[{id:'node',sourceNodeId:'upload',kind:'image',attributes:{src:'data:image/png;base64,YQ==',alt:'Original cover'}}]} as unknown as CanvasV2NativeSceneDocument;
  const [asset]=projectImageAssets(scene,[]);
  assert.equal(asset.label,'Original cover');assert.equal(asset.id,projectImageAssets(scene,[])[0].id);
  assert.equal(projectImageAssets(scene,[asset]).length,1);
  scene.nodes[0].attributes.src='data:image/png;base64,Yg==';
  assert.notEqual(projectImageAssets(scene,[])[0].id,asset.id);
});

import { inspectCanvasV2ScreenModel, isCanvasV2ScreenModelBytes, readCanvasV2ScreenModelBytes } from '../lib/canvas-v2/screen-asset-pixels';
import { canvasV2NativeModelViewerScreen, MODEL_ATTRIBUTE, parseCanvasV2NativeModel } from '../lib/canvas-v2/model-object';
import { encodeCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { canvasV2NativeModelCaptureForClone, canvasV2NativeModelCaptureForNode, canvasV2ScreenCaptureForClone, pinCanvasV2ScreenCaptureLayout, registerCanvasV2ScreenCapture } from '../lib/canvas-v2/interactive-screen-capture';

test('overlapping screen captures keep skipped layout measurable and restore it after the last release', () => {
  let value = 'auto', priority = '';
  const host = { style: {
    getPropertyValue: () => value, getPropertyPriority: () => priority,
    setProperty: (_name: string, next: string, rank: string) => { value = next; priority = rank; },
  } } as unknown as HTMLElement;
  const releaseA = pinCanvasV2ScreenCaptureLayout(host);
  const releaseB = pinCanvasV2ScreenCaptureLayout(host);
  assert.equal(value,'visible'); assert.equal(priority,'important');
  releaseA(); releaseA();
  assert.equal(value,'visible');
  releaseB();
  assert.equal(value,'auto'); assert.equal(priority,'');
  const releaseC = pinCanvasV2ScreenCaptureLayout(host);
  value = 'hidden'; priority = '';
  releaseC();
  assert.equal(value,'hidden','a newer explicit visibility decision must survive cleanup');
});

function testGlb(json: Record<string, unknown>, bin = new Uint8Array([0, 1, 2, 3])) {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4); padded.set(jsonBytes); padded.fill(0x20, jsonBytes.length);
 const paddedBin = new Uint8Array(Math.ceil(bin.length / 4) * 4); paddedBin.set(bin);
 const total = 12 + 8 + padded.length + 8 + paddedBin.length;
  const bytes = new Uint8Array(total), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  let offset = 12; view.setUint32(offset, padded.length, true); view.setUint32(offset + 4, 0x4e4f534a, true); offset += 8; bytes.set(padded, offset); offset += padded.length;
  view.setUint32(offset, paddedBin.length, true); view.setUint32(offset + 4, 0x004e4942, true); offset += 8; bytes.set(paddedBin, offset);
  let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte);
  return `data:model/gltf-binary;base64,${btoa(raw)}`;
}

test('retained model reader accepts only one embedded GLB and rejects external or compressed dependencies', async () => {
  const valid = testGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] });
  assert.equal(isCanvasV2ScreenModelBytes(valid), true);
  assert.equal(await readCanvasV2ScreenModelBytes(valid, new AbortController().signal), valid);
  assert.equal(isCanvasV2ScreenModelBytes(testGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri: 'https://example.test/x.bin' }] })), false);
  assert.equal(isCanvasV2ScreenModelBytes(testGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], images: [{ uri: 'texture.png' }] })), false);
  assert.equal(isCanvasV2ScreenModelBytes(testGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], extensionsRequired: ['KHR_draco_mesh_compression'] })), false);
  assert.equal(isCanvasV2ScreenModelBytes(testGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 3 }] }, new Uint8Array([1, 2, 3]))), true, 'valid BIN chunk padding remains portable');
});

test('model inspection returns bounded metadata and never image pixels', async () => {
  const model = testGlb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], accessors: [{ min: [0], max: [2] }], meshes: [{}], materials: [{}], nodes: [{}], animations: [{ name: 'Run', samplers: [{ input: 0 }] }] });
  const metadata = await inspectCanvasV2ScreenModel(model, new AbortController().signal);
  assert.equal(metadata.mediaType, 'model'); assert.equal(metadata.mimeType, 'model/gltf-binary'); assert.equal(metadata.meshCount, 1); assert.equal(metadata.materialCount, 1); assert.equal(metadata.nodeCount, 1); assert.deepEqual(metadata.animationClips, [{ name: 'Run', durationMs: 2000 }]); assert.match(metadata.sha256, /^[a-f0-9]{64}$/); assert.ok(metadata.byteSize > 0);
});

test('native model viewer is a generic handle-bound screen rather than a product screen object', () => {
  const model = parseCanvasV2NativeModel(JSON.stringify({ version: 1, evidenceId: 'model-1', label: 'Athlete' }));
  const viewer = canvasV2NativeModelViewerScreen(model);
  assert.equal(MODEL_ATTRIBUTE, 'data-canvas-v2-model');
  assert.deepEqual(viewer.referenceAssetIds, ['model-1']);
  assert.deepEqual(viewer.trustedRuntimeLibraries, ['three']);
  assert.equal(viewer.referenceAppearance, 'dark');
  assert.match(viewer.html, /data-playing="false"/);
  assert.match(viewer.javascript, /dataset\.animationTime/);
  assert.match(viewer.javascript, /finished/);
  assert.match(viewer.javascript, /getBoundingSphere/);
  assert.match(viewer.javascript, /northstarProduct/);
  assert.match(viewer.javascript, /__northstarModelViewer/);
  assert.match(viewer.javascript, /selectedClipName/);
  assert.match(viewer.javascript, /savedState\.animationTime/);
  assert.match(viewer.javascript, /zoomRatio/);
  assert.match(viewer.javascript, /action\.paused=false;mixer\.update\(0\);action\.paused=Boolean\(atEnd\|\|!autoplay\)/, 'restored paused clips must sample their pose before pausing');
  assert.match(viewer.javascript, /atEnd=!loopToggle\.checked&&duration>0&&requestedPhase>=duration/);
  assert.match(viewer.javascript, /playing=Boolean\(autoplay&&action&&!finished\)/, 'a non-looping clip restored at its end must expose Replay');
  assert.match(viewer.javascript, /northstarAssets\.arrayBuffer/);
  assert.doesNotMatch(viewer.javascript + viewer.html, /data:model\/gltf-binary;base64/);
  assert.doesNotMatch(viewer.html, /data-canvas-v2-screen/);
});

test('whole-board model capture uses the mounted matching viewer and rejects stale or missing viewers', async () => {
  const model = parseCanvasV2NativeModel(JSON.stringify({ version: 1, evidenceId: 'model-1', label: 'Athlete' }));
  const modelRaw = JSON.stringify(model);
  const viewerEncoded = encodeCanvasV2Screen(canvasV2NativeModelViewerScreen(model));
  const node = {
    hidden: false,
    style: { display: '' },
    getAttribute(name: string) {
      if (name === MODEL_ATTRIBUTE) return modelRaw;
      if (name === 'data-canvas-v2-node-id') return 'model-node';
      return null;
    },
  } as unknown as HTMLElement;
  const dispose = registerCanvasV2ScreenCapture('model-node', {
    encoded: viewerEncoded,
    image: async signal => {
      signal.throwIfAborted();
      return 'data:image/png;base64,model-pixels';
    },
  });
  try {
    assert.equal(await canvasV2NativeModelCaptureForClone(node), 'data:image/png;base64,model-pixels');
    assert.equal(await canvasV2NativeModelCaptureForNode('model-node', modelRaw, new AbortController().signal), 'data:image/png;base64,model-pixels');

    const wrongViewer = encodeCanvasV2Screen(canvasV2NativeModelViewerScreen(
      parseCanvasV2NativeModel(JSON.stringify({ version: 1, evidenceId: 'other-model', label: 'Other' })),
    ));
    const replace = registerCanvasV2ScreenCapture('model-node', {
      encoded: wrongViewer,
      image: async () => 'data:image/png;base64,wrong-pixels',
    });
    try {
      await assert.rejects(canvasV2NativeModelCaptureForClone(node), /does not match retained model model-1/);
    } finally {
      replace();
    }
  } finally {
    dispose();
  }
  await assert.rejects(canvasV2NativeModelCaptureForClone(node), /not mounted/);
});


test('native screen copy and export keep full quality while whole-board clone explicitly requests overview', async () => {
  const modes: boolean[] = [];
  const node = { getAttribute: (name: string) => name === 'data-canvas-v2-node-id' ? 'capture-mode-screen' : name === 'data-canvas-v2-screen' ? 'current-source' : null } as unknown as HTMLElement;
  const dispose = registerCanvasV2ScreenCapture('capture-mode-screen', {
    encoded: 'current-source',
    image: async (signal, overview = false) => { signal.throwIfAborted(); modes.push(overview); return overview ? 'overview-pixels' : 'full-pixels'; },
  });
  try {
    assert.equal(await canvasV2ScreenCaptureForClone(node), 'full-pixels');
    assert.equal(await canvasV2ScreenCaptureForClone(node, true), 'overview-pixels');
    assert.equal(await canvasV2ScreenCaptureForClone(node, false), 'full-pixels');
    assert.deepEqual(modes, [false, true, false]);
    const stale = { getAttribute: (name: string) => name === 'data-canvas-v2-node-id' ? 'capture-mode-screen' : name === 'data-canvas-v2-screen' ? 'previous-source' : null } as unknown as HTMLElement;
    assert.equal(await canvasV2ScreenCaptureForClone(stale, true), undefined);
    assert.deepEqual(modes, [false, true, false], 'an overview hint must not bypass source identity');
  } finally { dispose(); }
  assert.equal(await canvasV2ScreenCaptureForClone(node, true), undefined);
});
