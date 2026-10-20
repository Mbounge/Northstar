import assert from 'node:assert/strict';
import test from 'node:test';
import { describeCaptureImageResource } from '../lib/canvas-v2/cooperative-capture';
import { cloneNode } from '../lib/canvas-v2/cooperative-clone-node';
import { registerCanvasV2ScreenCapture } from '../lib/canvas-v2/interactive-screen-capture';

test('capture failure diagnostics retain the original asset route without credentials or image bytes', () => {
  assert.equal(describeCaptureImageResource('/api/project-assets/photo?token=private#frame'), '/api/project-assets/photo');
  assert.equal(describeCaptureImageResource('https://images.example/a.jpg?secret=private#frame'), 'https://images.example/a.jpg');
  assert.equal(describeCaptureImageResource('data:text/html;base64,PRIVATE_PAGE_BYTES'), 'data:text/html');
  assert.equal(describeCaptureImageResource('data:image/png;base64,PRIVATE_IMAGE_BYTES'), 'data:image/png');
  assert.equal(describeCaptureImageResource(' DATA:image/png;base64,PRIVATE_IMAGE_BYTES '), 'DATA:image/png');
  assert.equal(describeCaptureImageResource('https://private:password@images.example/a.jpg?secret=private'), 'https://images.example/a.jpg');
  assert.equal(describeCaptureImageResource('blob:https://example.test/private-object-identity'), 'blob image');
  assert.equal(describeCaptureImageResource(''), 'empty image source');
  assert.equal(describeCaptureImageResource('  '), 'empty image source');
  assert.ok(describeCaptureImageResource('https://example.test/' + 'x'.repeat(1000)).length <= 240);
});


test('nested screen capture failure preserves the exact owning node and original resource diagnostic', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  class NativeElement {
    hasAttribute(name: string) { return name === 'data-canvas-v2-interactive-screen'; }
    getAttribute(name: string) { return name === 'data-canvas-v2-interactive-screen' ? 'screen-owner-42' : null; }
  }
  Object.defineProperty(globalThis, 'HTMLElement', { value: NativeElement, configurable: true });
  let observedOverview: boolean | undefined;
  const unregister = registerCanvasV2ScreenCapture('screen-owner-42', { encoded: 'exact-source', image: async (_signal, overview) => {
    observedOverview = overview;
    throw new Error('Private capture failed at embed: IMG (text/html; original /missing-image).');
  } });
  try {
    await assert.rejects(cloneNode(new NativeElement() as unknown as HTMLElement, {}, true, { lastYield: performance.now() + 60_000, yields: 0, overview: true }), /Screen screen-owner-42 capture failed: Private capture failed at embed: IMG .*original \/missing-image/);
    assert.equal(observedOverview, true, 'Resource diagnosis must preserve the bounded overview capture mode.');
  } finally {
    unregister();
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous); else Reflect.deleteProperty(globalThis, 'HTMLElement');
  }
});
