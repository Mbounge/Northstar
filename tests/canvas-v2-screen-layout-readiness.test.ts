import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { installScreenLayoutReadiness } from '../lib/canvas-v2/screen-layout-readiness';

const canvas = (width = 0, height = 0, clientWidth = 480, clientHeight = 260) => ({
  nodeType: 1, tagName: 'CANVAS', width, height, clientWidth, clientHeight, isConnected: true,
});

function runtime(canvases: ReturnType<typeof canvas>[], resize?: () => void) {
  let resized = 0, resizeObserver: () => void = () => {}, mutationObserver: (records: unknown[]) => void = () => {};
  let pagehide: () => void = () => {}, frame = 0;
  const frames = new Map<number, () => void>(), observed = new Set<unknown>();
  const root = { nodeType: 1, tagName: 'HTML', querySelectorAll: () => canvases };
  const scope = {
    document: { documentElement: root }, Event,
    window: {
      dispatchEvent() { resized++; resize?.(); },
      addEventListener(_type: string, callback: () => void) { pagehide = callback; },
    },
    requestAnimationFrame(callback: () => void) { frames.set(++frame, callback); return frame; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback: () => void) { resizeObserver = callback; }
      observe(value: unknown) { observed.add(value); }
      unobserve(value: unknown) { observed.delete(value); }
      disconnect() { observed.clear(); }
    },
    MutationObserver: class {
      constructor(callback: (records: unknown[]) => void) { mutationObserver = callback; }
      observe() {} disconnect() {}
    },
  };
  vm.runInNewContext(`(${installScreenLayoutReadiness.toString()})();`, scope);
  return {
    observed, frames, resized: () => resized, resizeObserver: () => resizeObserver(), pagehide: () => pagehide(),
    mutations: (addedNodes: unknown[], removedNodes: unknown[] = []) => mutationObserver([{ addedNodes, removedNodes }]),
    flush() { for (let n = 0; frames.size && n < 5; n++) { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(job => job()); } assert.equal(frames.size, 0, 'layout recovery must not poll'); },
  };
}

test('first positive layout repairs a zero bitmap through the authored resize handler', () => {
  const c = canvas(0, 0, 0, 0);
  const r = runtime([c], () => { c.width = c.clientWidth * 2; c.height = c.clientHeight * 2; });
  r.resizeObserver(); r.flush(); assert.equal(r.resized(), 0);
  c.clientWidth = 480; c.clientHeight = 260;
  r.resizeObserver(); r.flush();
  assert.equal(r.resized(), 1); assert.equal(c.width, 960); assert.equal(c.height, 520);
  assert.equal(r.observed.size, 0, 'ready canvases stop observing size');
});

test('valid authored resolution is retained without a synthetic resize', () => {
  const c = canvas(960, 520), r = runtime([c]);
  r.resizeObserver(); r.flush();
  assert.equal(r.resized(), 0); assert.equal(c.width, 960); assert.equal(r.observed.size, 0);
});

test('multiple invalid canvases coalesce into one event and unresolved authors do not loop', () => {
  const r = runtime([canvas(), canvas()]);
  r.resizeObserver(); r.resizeObserver(); assert.equal(r.frames.size, 1);
  r.flush(); r.resizeObserver(); r.flush();
  assert.equal(r.resized(), 1); assert.equal(r.frames.size, 0);
});

test('dynamic canvases are observed and removed elements are released', () => {
  const r = runtime([]), added = canvas();
  r.mutations([added]); assert.equal(r.observed.has(added), true);
  r.mutations([], [added]); assert.equal(r.observed.has(added), false);
  r.mutations([{ nodeType: 3 }]); assert.equal(r.observed.size, 0);
});

test('page disposal cancels queued layout work', () => {
  const r = runtime([canvas()]); r.resizeObserver(); r.pagehide(); r.flush();
  assert.equal(r.resized(), 0); assert.equal(r.observed.size, 0);
});
