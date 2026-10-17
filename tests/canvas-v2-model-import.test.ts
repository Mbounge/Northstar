import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCanvasModelImport, type CanvasModelImportFile } from '../lib/canvas-v2/model-import';
import { inspectCanvasV2ScreenModel, isCanvasV2ScreenModelBytes } from '../lib/canvas-v2/screen-asset-pixels';

const file = (name: string, value: unknown, relativePath?: string): CanvasModelImportFile => ({ name, bytes: value instanceof Uint8Array ? value : new TextEncoder().encode(JSON.stringify(value)), ...(relativePath ? { relativePath } : {}) });
const model = { asset: { version: '2.0', generator: 'Exporter fixture' }, buffers: [{ uri: 'mesh.bin', byteLength: 4 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }], meshes: [{ primitives: [] }], nodes: [{ mesh: 0 }] };
const mesh = file('mesh.bin', new Uint8Array([1, 2, 3, 4]));
const unpack = (url: string) => {
  const bytes = Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0)), view = new DataView(bytes.buffer), length = view.getUint32(12, true);
  return { json: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))), bin: bytes.subarray(28 + length) };
};

test('packs selected glTF geometry and textures into the retained GLB format, preserving material and animation data', async () => {
  const input = { ...model, buffers: [...model.buffers, { uri: 'animation.bin', byteLength: 4 }], bufferViews: [...model.bufferViews, { buffer: 1, byteOffset: 0, byteLength: 4 }], images: [{ uri: 'glaze.png' }], materials: [{ name: 'Glazed ceramic', pbrMetallicRoughness: { roughnessFactor: .22 } }], accessors: [{ min: [0], max: [2] }], animations: [{ name: 'Turn', samplers: [{ input: 0, output: 0 }] }] };
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const packed = prepareCanvasModelImport([file('vase.gltf', input), mesh, file('animation.bin', new Uint8Array([5, 6, 7, 8])), file('glaze.png', image)]);
  assert.equal(packed.name, 'vase.glb'); assert.equal(packed.inputFormat, 'gltf'); assert.equal(packed.resourceCount, 3);
  assert.equal(isCanvasV2ScreenModelBytes(packed.dataUrl), true);
  const { json, bin } = unpack(packed.dataUrl);
  assert.deepEqual(json.materials, input.materials); assert.deepEqual(json.animations, input.animations);
  assert.deepEqual(json.bufferViews.map((v: { buffer: number; byteOffset: number }) => [v.buffer, v.byteOffset]), [[0, 0], [0, 4], [0, 8]]);
  assert.deepEqual(json.images, [{ mimeType: 'image/png', bufferView: 2 }]);
  assert.deepEqual([...bin], [1, 2, 3, 4, 5, 6, 7, 8, ...image]);
  const metadata = await inspectCanvasV2ScreenModel(packed.dataUrl, new AbortController().signal);
  assert.equal(metadata.meshCount, 1); assert.deepEqual(metadata.animationClips, [{ name: 'Turn', durationMs: 2000 }]);
  assert.equal(prepareCanvasModelImport([file('vase.glb', Uint8Array.from(atob(packed.dataUrl.split(',')[1]), c => c.charCodeAt(0)))]).dataUrl, packed.dataUrl, 'GLB round trip preserves exact bytes');
});

test('embedded resources and explicit relative directories are packed without fetching URLs', () => {
  const embedded = { ...model, buffers: [{ uri: 'data:application/octet-stream;base64,AQIDBA==', byteLength: 4 }] };
  assert.equal(isCanvasV2ScreenModelBytes(prepareCanvasModelImport([file('embedded.gltf', embedded)]).dataUrl), true);
  const directory = { ...model, buffers: [{ uri: 'resources/mesh.bin', byteLength: 4 }] };
  const result = prepareCanvasModelImport([file('vase.gltf', directory, 'export/vase.gltf'), { ...mesh, relativePath: 'export/resources/mesh.bin' }]);
  assert.equal(result.resourceCount, 1);
});

test('missing resources, remote/traversing paths, collisions, corrupt ranges and codecs fail atomically', () => {
  assert.throws(() => prepareCanvasModelImport([file('vase.gltf', model)]), /Select the referenced local file/);
  for (const uri of ['https://example.test/mesh.bin', '//example.test/mesh.bin', '../mesh.bin', '%2e%2e/mesh.bin', 'x\\mesh.bin', 'mesh.bin?x=1']) {
    assert.throws(() => prepareCanvasModelImport([file('vase.gltf', { ...model, buffers: [{ uri, byteLength: 4 }] }), mesh]), /local files|relative paths/);
  }
  assert.throws(() => prepareCanvasModelImport([file('vase.gltf', model), mesh, mesh]), /duplicate paths/);
  assert.throws(() => prepareCanvasModelImport([file('vase.gltf', { ...model, bufferViews: [{ buffer: 0, byteLength: 8 }] }), mesh]), /exceeds/);
  assert.throws(() => prepareCanvasModelImport([file('vase.gltf', { ...model, extensionsRequired: ['KHR_draco_mesh_compression'] }), mesh]), /codec/);
  assert.throws(() => prepareCanvasModelImport([file('one.gltf', model), file('two.gltf', model), mesh]), /exactly one/);
  assert.throws(() => prepareCanvasModelImport([file('vase.gltf', model), file('mesh.bin', new Uint8Array(16_000_001))]), /16 MB/);
});
