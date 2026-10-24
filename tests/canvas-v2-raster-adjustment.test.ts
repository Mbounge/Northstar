import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRasterAdjustment, rasterAdjustmentMask, rasterMaskMatchesSource, recolorRasterPixels } from '../lib/canvas-v2/creative/raster-adjustment';

const sourceSize = { width: 16, height: 12 }, rect = { x: 2, y: 2, width: 12, height: 8 };
const box = (x: number, y: number, width: number, height: number) => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const args = () => ({ assetId: 'photo', label: 'Ivory panel', sourceSize, cropPixels: rect, polygons: [box(3, 3, 10, 6)], color: '#c5c1b8', featherPixels: 0 });
const inspected = { assetId: 'photo', sourceSize, rect };
function source() {
  const pixels = new Uint8ClampedArray(sourceSize.width * sourceSize.height * 4);
  for (let i = 0; i < pixels.length; i += 4) { const detail = (i / 4) % 13; pixels.set([80 + detail, 80 + detail, 80 + detail, i % 7 ? 255 : 127], i); }
  return pixels;
}
test('a local colour adjustment preserves original dimensions, every protected RGBA pixel and all alpha', () => {
  const config = parseRasterAdjustment(args(), inspected), mask = rasterAdjustmentMask(config), original = source(), saved = original.slice();
  const { pixels, verification } = recolorRasterPixels(original, mask, config);
  assert.deepEqual(original, saved, 'retained original is never mutated');
  assert.equal(pixels.length, original.length); assert.ok(verification.changedPixels > 0);
  assert.equal(verification.changedOutsideMask, 0); assert.equal(verification.alphaChangedPixels, 0);
  assert.equal(verification.semanticBoundaryVerified, false, 'containment must not masquerade as semantic correctness');
  for (let p = 0; p < mask.length; p++) {
    assert.equal(pixels[p * 4 + 3], original[p * 4 + 3]);
    if (!mask[p]) assert.deepEqual(pixels.slice(p * 4, p * 4 + 4), original.slice(p * 4, p * 4 + 4));
  }
});
test('protected seam polygons and disconnected protected details remain exact even with inward feathering', () => {
  const config = parseRasterAdjustment({ ...args(), featherPixels: 2, protectedPolygons: [box(4, 5, 7, 1), box(11, 3, 1, 2)] }, inspected), mask = rasterAdjustmentMask(config), original = source();
  const { pixels } = recolorRasterPixels(original, mask, config);
  for (let x = 4; x < 11; x++) { const at = (5 * 16 + x) * 4; assert.equal(mask[at / 4], 0); assert.deepEqual(pixels.slice(at, at + 4), original.slice(at, at + 4)); }
  assert.equal(mask[3 * 16 + 11], 0); assert.equal(mask[2 * 16 + 3], 0, 'feather never grows outward');
  assert.ok(mask.some(value => value > 0 && value < 255));
});
test('colour mapping keeps local luminance detail instead of painting a flat rectangle', () => {
  const config = parseRasterAdjustment(args(), inspected), mask = rasterAdjustmentMask(config), original = source();
  const { pixels, verification } = recolorRasterPixels(original, mask, config);
  assert.equal(verification.clippedPixels, 0);
  const a = (4 * 16 + 4) * 4, b = (4 * 16 + 5) * 4;
  assert.equal(pixels[b] - pixels[a], original[b] - original[a]);
  assert.equal(pixels[a] - pixels[a + 1], config.color[0] - config.color[1]);
});
test('reusable masks require exact source dimensions, opaque grayscale pixels and inspected coverage', () => {
  const config = parseRasterAdjustment({ ...args(), polygons: undefined, maskAssetId: 'mask' }, inspected), mask = new Uint8ClampedArray(16 * 12 * 4);
  for (let i = 3; i < mask.length; i += 4) mask[i] = 255;
  const at = (4 * 16 + 5) * 4; mask.set([128, 128, 128, 255], at);
  assert.equal(rasterAdjustmentMask(config, mask)[at / 4], 128);
  assert.throws(() => rasterAdjustmentMask(config, mask.slice(4)), /exactly/);
  mask[at + 1] = 3; assert.throws(() => rasterAdjustmentMask(config, mask), /grayscale/); mask[at + 1] = 128;
  mask[at + 3] = 100; assert.throws(() => rasterAdjustmentMask(config, mask), /grayscale/); mask[at + 3] = 255;
  mask.set([255, 255, 255, 255], 0); assert.throws(() => rasterAdjustmentMask(config, mask), /outside the inspected/);
});
test('stale sources, display-space polygons, malformed masks and unsupported operations fail before processing', () => {
  assert.throws(() => parseRasterAdjustment({ ...args(), assetId: 'other' }, inspected), /original/);
  assert.throws(() => parseRasterAdjustment({ ...args(), sourceSize: { width: 32, height: 24 } }, inspected), /dimensions differ/);
  assert.throws(() => parseRasterAdjustment({ ...args(), cropPixels: { ...rect, x: 1 } }, inspected), /differs/);
  for (const change of [{ color: 'ivory' }, { strength: NaN }, { strength: 0 }, { featherPixels: 9 }, { polygons: [box(0, 0, 4, 4)] }, { polygons: [box(3, 3, 0, 0)] }, { maskAssetId: 'mask' }, { polygons: [] }]) assert.throws(() => parseRasterAdjustment({ ...args(), ...change }, inspected));
});
test('repeated colour edits keep an already feathered retained mask pixel-identical by default', () => {
  const initial = parseRasterAdjustment({ ...args(), featherPixels: undefined, protectedPolygons: [box(4, 5, 7, 1)] }, inspected);
  assert.equal(initial.featherPixels, 1, 'new polygon selections still feather inward by default');
  const expected = rasterAdjustmentMask(initial), rgba = new Uint8ClampedArray(expected.length * 4);
  for (let p = 0; p < expected.length; p++) rgba.set([expected[p], expected[p], expected[p], 255], p * 4);
  const saved = rgba.slice(); let pixels = source();
  for (const color of ['#496497', '#e45d28', '#28855d']) {
    const config = parseRasterAdjustment({ ...args(), polygons: undefined, maskAssetId: 'retained-mask', featherPixels: undefined, color }, inspected);
    assert.equal(config.featherPixels, 0);
    const reused = rasterAdjustmentMask(config, rgba);
    assert.deepEqual(reused, expected); assert.equal(rasterMaskMatchesSource(reused, rgba), true);
    pixels = recolorRasterPixels(pixels, reused, config).pixels;
  }
  assert.deepEqual(rgba, saved, 'the retained mask is never mutated');
});
test('explicit mask refinements preserve lineage only when their actual pixels stay identical', () => {
  const initial = parseRasterAdjustment(args(), inspected), expected = rasterAdjustmentMask(initial), rgba = new Uint8ClampedArray(expected.length * 4);
  for (let p = 0; p < expected.length; p++) rgba.set([expected[p], expected[p], expected[p], 255], p * 4);
  const reuse = { ...args(), polygons: undefined, maskAssetId: 'retained-mask', featherPixels: undefined };
  const unchanged = rasterAdjustmentMask(parseRasterAdjustment({ ...reuse, protectedPolygons: [box(2, 2, 1, 1)] }, inspected), rgba);
  assert.equal(rasterMaskMatchesSource(unchanged, rgba), true, 'already protected pixels do not invent a new identity');
  const refined = rasterAdjustmentMask(parseRasterAdjustment({ ...reuse, protectedPolygons: [box(4, 4, 2, 1)] }, inspected), rgba);
  assert.equal(refined[4 * 16 + 4], 0); assert.equal(rasterMaskMatchesSource(refined, rgba), false);
  const feathered = rasterAdjustmentMask(parseRasterAdjustment({ ...reuse, featherPixels: 2 }, inspected), rgba);
  assert.equal(rasterMaskMatchesSource(feathered, rgba), false, 'explicit inward refinement must get a distinct retained mask');
  assert.equal(rasterMaskMatchesSource(expected, rgba.slice(4)), false);
  const nonGray = rgba.slice(); nonGray[(4 * 16 + 4) * 4 + 1] = 0; assert.equal(rasterMaskMatchesSource(expected, nonGray), false);
});
test('transparent selected pixels are preserved and all-transparent or no-change adjustments are not claimed as success', () => {
  const config = parseRasterAdjustment(args(), inspected), mask = rasterAdjustmentMask(config), original = source(), at = (4 * 16 + 5) * 4;
  original[at + 3] = 0; const { pixels } = recolorRasterPixels(original, mask, config); assert.deepEqual(pixels.slice(at, at + 4), original.slice(at, at + 4));
  original.fill(0); assert.throws(() => recolorRasterPixels(original, mask, config), /transparent/);
  for (let i = 0; i < original.length; i += 4) original.set([197, 193, 184, 255], i);
  assert.throws(() => recolorRasterPixels(original, mask, config), /no visible/);
});
