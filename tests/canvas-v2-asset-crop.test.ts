import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { assetPixelRect, normalizedAssetPixelRect, verifyAssetCropSelection } from '../lib/canvas-v2/asset-crop';
import { readAssetCropSource } from '../lib/canvas-v2/asset-crop-inspection';
import { preparedAssetJob } from '../lib/canvas-v2/creative/asset-preparation';

const size = { width: 128, height: 96 }, rect = { x: 11, y: 17, width: 32, height: 32 };
test('pixel crop selection rejects display-scaled dimensions, changed bounds and ambiguous coordinates', () => {
  const receipt = { sourceSize: size, rect };
  assert.deepEqual(verifyAssetCropSelection({ sourceSize: size, cropPixels: rect }, receipt), rect);
  assert.throws(() => verifyAssetCropSelection({ sourceSize: { width: 64, height: 48 }, cropPixels: rect }, receipt), /dimensions differ/);
  assert.throws(() => verifyAssetCropSelection({ sourceSize: size, cropPixels: { ...rect, x: 12 } }, receipt), /differs from the inspected/);
  assert.throws(() => verifyAssetCropSelection({ sourceSize: size, cropPixels: rect, crop: {} }, receipt), /never both/);
  assert.throws(() => verifyAssetCropSelection({ sourceSize: size }, receipt), /never both/);
  for (const bad of [{ ...rect, x: -.1 }, { ...rect, x: .5 }, { ...rect, x: 120 }, { ...rect, height: 1 }, { ...rect, width: NaN }]) assert.throws(() => assetPixelRect(bad, size));
});

test('normalized compatibility uses explicit source-pixel bounds without silently clamping', () => {
  assert.deepEqual(normalizedAssetPixelRect({ x: 11 / 128, y: 17 / 96, width: 32 / 128, height: 32 / 96 }, size), rect);
  assert.throws(() => normalizedAssetPixelRect({ x: .9, y: 0, width: .2, height: 1 }, size), /fully inside/);
  assert.throws(() => preparedAssetJob({ assetId: 'source', label: 'Portrait', sourceSize: size, cropPixels: { ...rect, height: 30 }, mask: 'circle' }, 'circle'), /square/);
});

test('original image reading preserves bytes and does not recompress a large screenshot overview', async () => {
  const bytes = new Uint8Array(5_100_000); bytes[0] = 137; bytes[bytes.length - 1] = 19;
  const pixels = await readAssetCropSource('https://example.com/original.png', new AbortController().signal, async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }));
  assert.deepEqual(Buffer.from(pixels.split(',')[1], 'base64'), Buffer.from(bytes));
  await assert.rejects(readAssetCropSource('https://example.com/too-large.png', new AbortController().signal, async () => new Response(new Uint8Array(6_000_001), { headers: { 'content-type': 'image/png' } })), /6 MB/);
});

const python = process.env.NORTHSTAR_CROP_TEST_PYTHON;
test('production extraction preserves selected pixels, masks true circles and refuses stale source dimensions', { skip: !python && 'Set NORTHSTAR_CROP_TEST_PYTHON to a Python with Pillow for the extraction integration check.' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'northstar-exact-crop-'));
  try {
    const args = { assetId: 'source', label: 'Measured subject', sourceSize: size, cropPixels: rect, maxEdge: 1024 };
    const materialize = async (job: ReturnType<typeof preparedAssetJob>) => {
      for (const file of job.operation.files) { const path = join(root, file.path); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, file.text); }
      execFileSync(python!, ['-c', `from PIL import Image\nim=Image.new('RGBA',(128,96))\nim.putdata([(x,y,(x+y)%256,255) for y in range(96) for x in range(128)])\nim.save(${JSON.stringify(join(root, job.operation.inputs[0].path))},format='PNG')`]);
      return join(root, job.operation.files[1].path);
    };
    const job = preparedAssetJob(args, 'exact'), script = await materialize(job);
    const receipt = JSON.parse(execFileSync(python!, [script], { cwd: root, encoding: 'utf8' }));
    assert.deepEqual(receipt.cropPixels, [11, 17, 43, 49]); assert.deepEqual(receipt.outputSize, [32, 32]);
    execFileSync(python!, ['-c', `from PIL import Image\na=Image.open(${JSON.stringify(join(root, job.operation.inputs[0].path))}).convert('RGBA').crop((11,17,43,49))\nb=Image.open(${JSON.stringify(join(root, job.operation.exports[0].path))})\nassert a.size==b.size and a.tobytes()==b.tobytes()`]);
    const circle = preparedAssetJob({ ...args, mask: 'circle' }, 'circle'), circleScript = await materialize(circle);
    execFileSync(python!, [circleScript], { cwd: root });
    execFileSync(python!, ['-c', `from PIL import Image\nim=Image.open(${JSON.stringify(join(root, circle.operation.exports[0].path))})\nassert im.size==(32,32) and im.getpixel((0,0))[3]==0\nassert im.getpixel((16,16))==(27,33,60,255)`]);
    const stale = preparedAssetJob({ ...args, sourceSize: { width: 256, height: 192 } }, 'stale'), staleScript = await materialize(stale);
    const refused = spawnSync(python!, [staleScript], { cwd: root, encoding: 'utf8' });
    assert.notEqual(refused.status, 0); assert.match(refused.stderr, /Original source dimensions changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
