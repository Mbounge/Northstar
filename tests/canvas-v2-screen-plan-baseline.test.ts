import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCanvasV2ScreenPlanBaseline } from '../lib/canvas-v2/screen-plan-baseline';

test('planning retains a genuine successful baseline unchanged', async () => {
  const pixels = { image: 'actual-capture', state: { selected: 'cycle' } };
  const result = await captureCanvasV2ScreenPlanBaseline(async () => pixels, new AbortController().signal);
  assert.equal(result.baseline, pixels);
  assert.equal(result.unavailable, undefined);
});

test('a failed baseline permits repair planning with an explicit evidence gap and no substitute pixels', async () => {
  for (const failure of [new Error('A retained image failed to load.'), { type: 'error' }]) {
    const result = await captureCanvasV2ScreenPlanBaseline(async () => { throw failure; }, new AbortController().signal);
    assert.equal(result.baseline, undefined);
    assert.ok(result.unavailable);
  }
});

test('cancellation cannot become a repair plan, including cancellation during capture', async () => {
  const before = new AbortController(); before.abort(new Error('stopped before capture'));
  let called = false;
  await assert.rejects(captureCanvasV2ScreenPlanBaseline(async () => { called = true; return {}; }, before.signal), /stopped before/);
  assert.equal(called, false);
  for (const throws of [true, false]) {
    const during = new AbortController();
    await assert.rejects(captureCanvasV2ScreenPlanBaseline(async () => {
      during.abort(new Error('stopped during capture'));
      if (throws) throw new Error('render failed');
      return { image: 'late' };
    }, during.signal), /stopped during/);
  }
});
