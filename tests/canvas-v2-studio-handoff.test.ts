import assert from 'node:assert/strict';
import test from 'node:test';
import { registerScreenDirectFlush, flushScreenDirectEdits } from '../lib/canvas-v2/screen-direct-edit';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('an owner skip excludes exactly its own Studio drain and preserves legacy and unrelated editors', async () => {
  const events = new EventTarget(), calls: string[] = [];
  const removers = [
    registerScreenDirectFlush(async () => { calls.push('legacy'); }, events),
    registerScreenDirectFlush(async () => { calls.push('studio'); }, events, 'studio-owner'),
    registerScreenDirectFlush(async () => { calls.push('other'); }, events, 'other-owner'),
  ];
  try {
    await flushScreenDirectEdits(events);
    assert.deepEqual(calls, ['legacy', 'studio', 'other'], 'Default handoff must drain unowned legacy editors too.');
    calls.length = 0;
    await flushScreenDirectEdits(events, 'studio-owner');
    assert.deepEqual(calls, ['legacy', 'other']);
    calls.length = 0;
    await flushScreenDirectEdits(events, 'unregistered-owner');
    assert.deepEqual(calls, ['legacy', 'studio', 'other'], 'An unknown skip cannot bypass unrelated human work.');
  } finally { removers.forEach(remove => remove()); }
});

test('a Studio dirty-draft drain can flush native editors then await its own source commit without recursive re-entry', async () => {
  const events = new EventTarget(), nativeSave = deferred(), studioSave = deferred(), sourceStarted = deferred();
  let studioDrains = 0, reads = 0, committed = false;
  const order: string[] = [];
  const removeNative = registerScreenDirectFlush(async () => { await nativeSave.promise; order.push('native saved'); }, events);
  const removeStudio = registerScreenDirectFlush(async () => {
    assert.equal(++studioDrains, 1, 'A Studio commit recursively re-entered its own draft drain.');
    // commitDesign drains every other editor before reading current source.
    await flushScreenDirectEdits(events, 'studio-owner');
    order.push('Studio source read'); sourceStarted.resolve();
    await studioSave.promise;
    committed = true; order.push('Studio committed focused draft');
  }, events, 'studio-owner');
  const handoff = flushScreenDirectEdits(events).then(() => { assert.equal(committed, true); reads++; order.push('AI reads committed source'); });
  // Attach a handler immediately so a failed recursive implementation cannot
  // create an unhandled rejection while the deferred source write is held.
  const handoffResult = handoff.then(() => undefined, error => error);
  try {
    await Promise.resolve(); await Promise.resolve();
    assert.equal(reads, 0); assert.equal(committed, false);
    nativeSave.resolve();
    const early = await Promise.race([sourceStarted.promise.then(() => 'source started'), handoffResult.then(error => { if (error) throw error; return 'handoff completed'; })]);
    assert.equal(early, 'source started', 'AI handoff bypassed the focused Studio draft.');
    assert.equal(reads, 0, 'Native fields saving does not mean the Studio source edit finished.');
    studioSave.resolve();
    const failure = await handoffResult;
    if (failure) throw failure;
    assert.equal(studioDrains, 1); assert.equal(reads, 1);
    assert.ok(order.indexOf('native saved') < order.indexOf('Studio source read'));
    assert.ok(order.indexOf('Studio committed focused draft') < order.indexOf('AI reads committed source'));
  } finally { nativeSave.resolve(); studioSave.resolve(); removeStudio(); removeNative(); await handoffResult; }
});

test('an unrelated save failure during a Studio-owned commit blocks source mutation and AI handoff', async () => {
  const events = new EventTarget(), nativeSave = deferred();
  let studioDrains = 0, sourceWrites = 0, agentReads = 0, nativeDrained = false;
  const removeNative = registerScreenDirectFlush(async () => { await nativeSave.promise; nativeDrained = true; }, events);
  const removeFailure = registerScreenDirectFlush(async () => { throw new Error('Native colour could not be saved.'); }, events, 'colour-owner');
  const removeStudio = registerScreenDirectFlush(async () => {
    assert.equal(++studioDrains, 1, 'Failed saves must not recursively re-enter the Studio drain.');
    await flushScreenDirectEdits(events, 'studio-owner');
    sourceWrites++;
  }, events, 'studio-owner');
  const handoff = flushScreenDirectEdits(events).then(() => { agentReads++; });
  const rejection = assert.rejects(handoff, /Native colour could not be saved/);
  try {
    await Promise.resolve(); await Promise.resolve();
    assert.equal(sourceWrites, 0); assert.equal(agentReads, 0);
    nativeSave.resolve(); await rejection;
    assert.equal(nativeDrained, true, 'A failed peer cannot abandon another pending native save.');
    assert.equal(sourceWrites, 0); assert.equal(agentReads, 0); assert.equal(studioDrains, 1);
  } finally { nativeSave.resolve(); removeStudio(); removeFailure(); removeNative(); await rejection; }
});

test('global handoff drains both retained and newly mounted Studio saves while their shared owner avoids cross-recursion', async () => {
  const events = new EventTarget(), oldSave = deferred(), newSave = deferred(), bothStarted = deferred();
  const calls = { old: 0, new: 0 }, committed: string[] = [];
  let started = 0, reads = 0, legacyDrains = 0;
  const studio = (name: 'old' | 'new', save: ReturnType<typeof deferred>) => registerScreenDirectFlush(async () => {
    assert.equal(++calls[name], 1, 'Studio family drains recursively invoked each other.');
    await flushScreenDirectEdits(events, 'studio-family');
    if (++started === 2) bothStarted.resolve();
    await save.promise; committed.push(name);
  }, events, 'studio-family');
  const removeOld = studio('old', oldSave), removeNew = studio('new', newSave);
  const removeLegacy = registerScreenDirectFlush(async () => { legacyDrains++; }, events);
  const handoff = flushScreenDirectEdits(events).then(() => { reads++; });
  const result = handoff.then(() => undefined, error => error);
  try {
    await Promise.race([bothStarted.promise, result.then(error => { if (error) throw error; throw new Error('Handoff completed before both Studio saves started.'); })]);
    assert.equal(reads, 0);
    oldSave.resolve(); await oldSave.promise; await Promise.resolve();
    assert.equal(reads, 0, 'Draining a retained editor must still wait for the newly mounted editor.');
    newSave.resolve(); const failure = await result; if (failure) throw failure;
    assert.deepEqual(committed.sort(), ['new', 'old']); assert.equal(reads, 1);
    assert.ok(legacyDrains > 0, 'Shared Studio ownership must not bypass legacy native fields.');
  } finally { oldSave.resolve(); newSave.resolve(); removeOld(); removeNew(); removeLegacy(); await result; }
});
