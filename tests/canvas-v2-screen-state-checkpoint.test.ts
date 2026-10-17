import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { SCREEN_STATE_CHECKPOINT_SOURCE } from '../lib/canvas-v2/screen-state-checkpoint';

function harness() {
  let data = { count: 0 }, field = '', scroll = 0, snapshots = 0, nextTimer = 0;
  const timers = new Map<number, { run: () => void; delay: number }>();
  const messages: Array<Record<string, unknown>> = [];
  // Exercise the embedded function, not only its module implementation.
  const create = vm.runInNewContext(SCREEN_STATE_CHECKPOINT_SOURCE) as (options: {
    readData: () => unknown; readSnapshot: () => unknown; send: (message: Record<string, unknown>) => void;
    isHidden: () => boolean; schedule: (run: () => void, delay: number) => number; cancel: (timer: number) => void;
  }) => { checkpoint(): void; markDirty(): void; queueInput(type: string, sequence: number): void; dispose(): void };
  const checkpoint = create({
    readData: () => ({ ...data }),
    readSnapshot: () => { snapshots++; return { data: { ...data }, field, scroll }; },
    send: message => messages.push(message), isHidden: () => false,
    schedule: (run, delay) => { timers.set(++nextTimer, { run, delay }); return nextTimer; },
    cancel: timer => { timers.delete(timer); },
  });
  return { checkpoint, messages, timers, setData: (value: typeof data) => { data = value; }, setField: (value: string) => { field = value; }, setScroll: (value: number) => { scroll = value; }, snapshots: () => snapshots,
    flush: () => { for (const [id, entry] of [...timers]) { timers.delete(id); entry.run(); } } };
}

test('idle app retention compares bounded product data before walking DOM', () => {
  const app = harness();
  app.checkpoint.checkpoint();
  for (let second = 0; second < 60; second++) app.checkpoint.checkpoint();
  assert.equal(app.snapshots(), 1, 'sixty unchanged checkpoints must not rescan fields or all scroll containers');
  app.setData({ count: 5 });
  app.checkpoint.checkpoint();
  assert.equal(app.snapshots(), 2, 'authored clocks changing data still checkpoint at the normal cadence');
  assert.equal((app.messages.at(-1)?.retainedState as { data: { count: number } }).data.count, 5);
});

test('field and scroll changes checkpoint even when product JSON stays unchanged', () => {
  const app = harness();
  app.checkpoint.checkpoint();
  app.setField('Human draft'); app.setScroll(420);
  app.checkpoint.markDirty(); app.flush();
  assert.equal(app.snapshots(), 2);
  const state = app.messages.at(-1)?.retainedState as { field: string; scroll: number };
  assert.equal(state.field, 'Human draft'); assert.equal(state.scroll, 420);
  app.checkpoint.checkpoint();
  assert.equal(app.snapshots(), 2);
});

test('wheel bursts retain the newest state once while typing flushes promptly', () => {
  const app = harness();
  for (let event = 1; event <= 120; event++) {
    app.setScroll(event * 3);
    app.checkpoint.queueInput('wheel', event);
  }
  assert.equal(app.timers.size, 1); assert.equal([...app.timers.values()][0].delay, 80);
  assert.equal(app.messages.length, 1, 'the first lightweight notification must immediately protect human input');
  assert.equal(app.messages[0].retainedState, undefined);
  app.flush();
  assert.equal(app.snapshots(), 1); assert.equal(app.messages.at(-1)?.inputSequence, 120);
  assert.equal((app.messages.at(-1)?.retainedState as { scroll: number }).scroll, 360);
  app.checkpoint.queueInput('wheel', 121);
  app.setField('Typing during a scroll'); app.checkpoint.queueInput('input', 122);
  assert.equal(app.timers.size, 1); assert.equal([...app.timers.values()][0].delay, 0);
  app.flush();
  assert.equal(app.messages.at(-1)?.userInputType, 'input');
  assert.equal((app.messages.at(-1)?.retainedState as { field: string }).field, 'Typing during a scroll');
  app.checkpoint.markDirty(); app.checkpoint.dispose(); assert.equal(app.timers.size, 0);
});
