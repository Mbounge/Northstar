import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvasV2MediaPlaybackStore, releaseCanvasV2VideoSource, rememberCanvasV2MediaTime, restoreCanvasV2MediaTime, type CanvasV2RetainedMediaPlayback } from '../lib/canvas-v2/media-playback-store';

test('unselected reference media transitions never notify the selected control or a workspace observer', () => {
  const store = createCanvasV2MediaPlaybackStore();
  let selectedUpdates = 0;
  const unsubscribe = store.subscribe('selected-clip', () => selectedUpdates++);
  const event = (nodeId: string, playing: boolean) => ({ detail: { nodeId, playing } }) as unknown as Event;
  for (let clip = 0; clip < 1000; clip++) {
    store.receive(event(`reference-${clip}`, true));
    store.receive(event(`reference-${clip}`, false));
  }
  assert.equal(selectedUpdates, 0, 'two thousand visibility transitions cannot invalidate the selected control');
  store.receive(event('selected-clip', true)); store.receive(event('selected-clip', true));
  assert.equal(selectedUpdates, 1, 'unchanged playback notifications are ignored');
  assert.equal(store.playing('selected-clip'), true);
  unsubscribe(); store.receive(event('selected-clip', false)); assert.equal(selectedUpdates, 1);
});

test('video source eviction and remount retain exact time and human pause preference', () => {
  const playback: CanvasV2RetainedMediaPlayback = { userPaused: true };
  rememberCanvasV2MediaTime(playback, { readyState: 4, currentTime: 3.375 });
  rememberCanvasV2MediaTime(playback, { readyState: 0, currentTime: 0 });
  assert.equal(playback.currentTime, 3.375, 'emptying a decoder cannot overwrite retained time with zero');
  const reloaded = { duration: 8, currentTime: 0 };
  restoreCanvasV2MediaTime(playback, reloaded);
  assert.equal(reloaded.currentTime, 3.375); assert.equal(playback.userPaused, true);
  rememberCanvasV2MediaTime(playback, { readyState: 4, currentTime: 0.125 });
  restoreCanvasV2MediaTime(playback, reloaded); assert.equal(reloaded.currentTime, 0.125, 'an actual loop wrap is retained normally');
});

test('time restoration clamps revised duration and tolerates a temporarily unseekable decoder', () => {
  const video = { duration: 2, currentTime: 0 };
  restoreCanvasV2MediaTime({ currentTime: 9 }, video); assert.equal(video.currentTime, 1.99);
  const unseekable = { duration: 2, get currentTime() { return 0; }, set currentTime(_value: number) { throw new Error('not ready'); } };
  assert.doesNotThrow(() => restoreCanvasV2MediaTime({ currentTime: 1 }, unseekable));
});

test('a removed video src explicitly empties its loaded resource without losing playback metadata', () => {
  const playback: CanvasV2RetainedMediaPlayback = { userPaused: true };
  let loads = 0;
  const video = {
    readyState: 4, currentTime: 8.246, currentSrc: 'blob:previous-reference',
    getAttribute: () => null,
    load() {
      loads++; this.readyState = 0; this.currentTime = 0; this.currentSrc = '';
      rememberCanvasV2MediaTime(playback, this);
    },
  };
  assert.equal(releaseCanvasV2VideoSource(playback, video), true);
  assert.equal(loads, 1); assert.equal(video.readyState, 0); assert.equal(video.currentSrc, '');
  assert.equal(playback.currentTime, 8.246); assert.equal(playback.userPaused, true);
  assert.equal(releaseCanvasV2VideoSource(playback, video), false, 'already-empty lazy videos must not load again');
  assert.equal(loads, 1);
  const reloaded = { duration: 20, currentTime: 0 };
  restoreCanvasV2MediaTime(playback, reloaded); assert.equal(reloaded.currentTime, 8.246);
});

test('resource release cannot unload a visible source reattached before the effect runs', () => {
  let loads = 0;
  const video = { readyState: 4, currentTime: 2, currentSrc: 'blob:visible-reference', getAttribute: () => 'blob:visible-reference', load() { loads++; } };
  assert.equal(releaseCanvasV2VideoSource({}, video), false); assert.equal(loads, 0);
});
