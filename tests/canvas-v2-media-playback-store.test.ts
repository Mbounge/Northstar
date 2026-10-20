import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvasV2MediaPlaybackStore, createCanvasV2WarmMediaRetention, releaseCanvasV2VideoSource, rememberCanvasV2MediaTime, restoreCanvasV2MediaTime, type CanvasV2RetainedMediaPlayback } from '../lib/canvas-v2/media-playback-store';

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

function retentionClock(maxOffscreen = 4) {
  let now = 0, id = 0;
  const tasks = new Map<number, { at: number; run: () => void }>();
  const callbacks: Array<() => void> = [];
  const timers = {
    set(run: () => void, delay: number) { const key = ++id; tasks.set(key, { at: now + delay, run }); callbacks.push(run); return key as unknown as ReturnType<typeof setTimeout>; },
    clear(timer: ReturnType<typeof setTimeout>) { tasks.delete(timer as unknown as number); },
  };
  const pool = createCanvasV2WarmMediaRetention({ maxOffscreen, ttlMs: 45_000, timers });
  return { pool, callbacks, tasks, advance(ms: number) {
    const end = now + ms;
    for (;;) {
      const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; tasks.delete(next[0]); next[1].run();
    }
    now = end;
  } };
}

test('a previously viewed decoder stays warm for 45 seconds and its revisit cancels the old expiry', () => {
  const { pool, advance, callbacks } = retentionClock(), owner = {};
  let releases = 0;
  pool.visible(owner, () => releases++); pool.offscreen(owner);
  advance(44_999); assert.equal(releases, 0);
  const oldExpiry = callbacks[0];
  pool.visible(owner, () => releases++);
  oldExpiry(); advance(60_000); assert.equal(releases, 0, 'Even an already queued stale expiry cannot evict a visible revisit.');
  pool.offscreen(owner); advance(45_000); assert.equal(releases, 1);
  advance(45_000); assert.equal(releases, 1, 'An evicted source is released once.');
});

test('the offscreen decoder budget evicts the least recently visited item while all visible media remain protected', () => {
  const { pool, advance } = retentionClock(2), owners = Array.from({ length: 8 }, () => ({})), releases: number[] = [];
  owners.forEach((owner, index) => pool.visible(owner, () => releases.push(index)));
  advance(60_000); assert.deepEqual([...releases], [], 'Visible media do not count toward the offscreen budget.');
  pool.offscreen(owners[0]); pool.offscreen(owners[1]);
  pool.visible(owners[0], () => releases.push(0)); pool.offscreen(owners[0]);
  pool.offscreen(owners[2]); assert.deepEqual([...releases], [1], 'Revisiting item 0 makes item 1 the oldest offscreen resource.');
  advance(45_000); assert.deepEqual([...releases], [1, 0, 2]);
});

test('repeated offscreen observations do not indefinitely renew decoder residency', () => {
  const { pool, advance } = retentionClock(), owner = {}; let releases = 0;
  pool.visible(owner, () => releases++); pool.offscreen(owner);
  for (let interval = 0; interval < 4; interval++) { advance(10_000); pool.offscreen(owner); }
  advance(5_000); assert.equal(releases, 1);
});

test('source replacement and unmount cancel old retention work without releasing the new decoder', () => {
  const { pool, advance, callbacks, tasks } = retentionClock(), owner = {}; const released: string[] = [];
  pool.visible(owner, () => released.push('old-source')); pool.offscreen(owner);
  const stale = callbacks[0]; pool.remove(owner);
  pool.visible(owner, () => released.push('new-source')); stale(); advance(60_000);
  assert.deepEqual([...released], []);
  pool.offscreen(owner); pool.remove(owner); advance(60_000); assert.deepEqual([...released], []);
  pool.visible({}, () => released.push('disposed')); pool.dispose(); assert.equal(tasks.size, 0);
});

test('eviction retains actual playback time and human pause preference until the source is deliberately reattached', () => {
  const { pool, advance } = retentionClock(), owner = {}, playback: CanvasV2RetainedMediaPlayback = { userPaused: true };
  let source: string | null = 'blob:exact-clip', loads = 0;
  const video = { readyState: 4, currentTime: 7.375, currentSrc: source, getAttribute: () => source, load() { loads++; this.readyState = 0; this.currentTime = 0; this.currentSrc = ''; } };
  pool.visible(owner, () => { source = null; releaseCanvasV2VideoSource(playback, video); }); pool.offscreen(owner);
  advance(45_000); assert.equal(loads, 1); assert.deepEqual(playback, { userPaused: true, currentTime: 7.375 });
  const resumed = { duration: 12, currentTime: 0 }; restoreCanvasV2MediaTime(playback, resumed); assert.equal(resumed.currentTime, 7.375);
});

test('a zero offscreen budget releases only departing media and invalid policies fail before registration', () => {
  const { pool } = retentionClock(0), owner = {}; let releases = 0;
  pool.visible(owner, () => releases++); assert.equal(releases, 0); pool.offscreen(owner); assert.equal(releases, 1);
  for (const options of [{ maxOffscreen: -1 }, { maxOffscreen: 1.5 }, { ttlMs: 0 }, { ttlMs: Infinity }]) assert.throws(() => createCanvasV2WarmMediaRetention(options), /bounded/);
});
