import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanvasCollaborationClient, parsePeerPresence,
  type CanvasMember, type CollaborationJournal, type CollaborationTransport, type PeerPresence,
} from '../lib/canvas-v2/sessions/collaboration-client';
import {
  applySharedChanges, conflictingSharedCells, revisionFromSharedCells, sharedCellsFromRevision,
  type AcceptedOperation, type SharedOperation,
} from '../lib/canvas-v2/sessions/collaboration-document';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';

const html = '<main data-canvas-v2-node-id="board"><p data-canvas-v2-node-id="a">First</p><p data-canvas-v2-node-id="b">Second</p></main>';
const revision = (id: string, source = html): CanvasV2ArtifactRevision => ({ schema: CANVAS_V2_ARTIFACT_SCHEMA, id, state: 'committed', createdAt: '2026-10-20T00:00:00Z', document: { html: source, css: '' }, evidence: [] });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function mockTimers(t: import('node:test').TestContext, apis: string[]) {
  const timers = t.mock.timers as unknown as { enable(options: { apis: string[] } | string[]): void; tick(ms: number): void; reset(): void };
  try { timers.enable({ apis }); } catch { timers.enable(apis); }
  return timers;
}

/** Exercise the actual controller and operation bytes. Only network delivery,
 * server rejection and ACK loss are controlled; no controller is reimplemented. */
function room() {
  const seed = revision('seed'); let cells = sharedCellsFromRevision(seed); const log: AcceptedOperation[] = [];
  const commits: SharedOperation[] = [], presence: PeerPresence[] = [], seeds: CanvasV2ArtifactRevision[] = [];
  const members: CanvasMember[] = [{ userId: 'alice', name: 'Alice', role: 'owner' }, { userId: 'bob', name: 'Bob', role: 'editor' }, { userId: 'viewer', name: 'Viewer', role: 'viewer' }];
  const signals = new Map<string, Parameters<CollaborationTransport['watch']>[1]>();
  const gates = new Map<string, ReturnType<typeof deferred>>(), entered = new Map<string, ReturnType<typeof deferred>>();
  const faults = { offline: false, denied: false, readError: '', loseNextAck: false, rejectNext: false, busyObjects: [] as string[] };
  const calls = { since: [] as number[], members: [] as number[] };
  const transport = (userId: string): CollaborationTransport => ({
    async read() { if (faults.offline) throw new Error('Offline'); return { version: log.length, cells: new Map(cells), seed, ownerId: 'alice', role: members.find(m => m.userId === userId)!.role, members: structuredClone(members) }; },
    async enable(next, nextSeed) { seeds.push(structuredClone(nextSeed)); cells = new Map(next); return { version: 0, cells: new Map(cells), seed: nextSeed, ownerId: userId, role: 'owner', members: structuredClone(members) }; },
    async commit(operation) {
      commits.push(structuredClone(operation)); entered.get(operation.clientId)?.resolve(); await gates.get(operation.clientId)?.promise;
      if (faults.offline) throw new Error('Offline');
      const prior = log.find(item => item.id === operation.id);
      if (prior) { assert.deepEqual(prior.changes, operation.changes, 'retry must retain the exact original operation'); return { ok: true, version: prior.version }; }
      const conflicts = await conflictingSharedCells(cells, operation.changes);
      if (conflicts.length || faults.rejectNext) { faults.rejectNext = false; return { ok: false, version: log.length, conflicts }; }
      cells = applySharedChanges(cells, operation.changes); log.push({ ...structuredClone(operation), version: log.length + 1, actorId: userId });
      if (faults.loseNextAck) { faults.loseNextAck = false; throw new Error('ACK was lost after acceptance'); }
      return { ok: true, version: log.length };
    },
    async since(version) { calls.since.push(Date.now()); if (faults.denied) throw new Error('Access denied'); if (faults.readError) throw new Error(faults.readError); if (faults.offline) throw new Error('Offline'); return structuredClone(log.filter(op => op.version > version).slice(0, 100)); },
    async claim() { return { busy: [...faults.busyObjects] }; }, async members() { calls.members.push(Date.now()); return structuredClone(members); },
    watch(clientId, receive) { signals.set(clientId, receive); return () => { signals.delete(clientId); }; },
    presence(value) { presence.push(structuredClone(value)); }, notify() {},
    async invite() { return { id: 'invite', token: 'token' }; }, async removeMember() {}, async revokeInvite() {},
  });
  const client = async (userId: string, options: { clientId?: string; journal?: CollaborationJournal; loadFailure?: boolean; journalFailure?: () => boolean } = {}) => {
    let current = seed, journal = options.journal;
    const value = new CanvasCollaborationClient({ clientId: options.clientId ?? userId + '-tab', userId, name: userId, transport: transport(userId), loadJournal: async () => { if (options.loadFailure) throw new Error('Local journal cannot be opened'); return journal; }, saveJournal: async next => { if (options.journalFailure?.()) throw new Error('Local journal write unavailable'); journal = structuredClone(next); } });
    value.subscribeRevision(next => { current = next; }); await value.connect(); await value.sync();
    return { value, revision: () => value.getRevision() ?? current, journal: () => journal };
  };
  const hold = (clientId: string) => { const gate = deferred(), start = deferred(); gates.set(clientId, gate); entered.set(clientId, start); return { entered: start.promise, release() { gates.delete(clientId); gate.resolve(); } }; };
  return { client, faults, hold, calls, commits, log, presence, seeds, members, signals, document: () => revisionFromSharedCells(cells, seed, 'server').document, html: () => revisionFromSharedCells(cells, seed, 'server').document.html };
}

test('two optimistic disjoint edits converge after delayed delivery without overwriting either object', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const hold = f.hold('alice-tab');
  await a.value.observe(revision('a-local', html.replace('First', 'Alice edit'))); await hold.entered;
  assert.equal(a.value.getStatus().pending, 1);
  await b.value.observe(revision('b-local', html.replace('Second', 'Bob edit'))); await b.value.sync();
  hold.release(); await a.value.sync(); await b.value.sync();
  const expected = html.replace('First', 'Alice edit').replace('Second', 'Bob edit');
  assert.equal(f.html(), expected); assert.equal(a.revision().document.html, expected); assert.equal(b.revision().document.html, expected);
  assert.equal(a.value.getStatus().pending, 0); assert.equal(b.value.getStatus().pending, 0); assert.equal(f.log.length, 2);
});

test('a local engine edit observed after a peer update retains intent from its original parent', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const originalParent = a.revision().id;
  // The engine made this edit before the peer arrived; React's observe effect
  // has not run yet. Its unchanged sibling bytes are not a request to revert Bob.
  const delayedLocal = { ...revision('delayed-engine-edit', html.replace('First', 'Alice local intent')), parentId: originalParent };
  await b.value.observe(revision('peer-before-observe', html.replace('Second', 'Bob arrived first'))); await b.value.sync(); await a.value.sync();
  assert.ok(a.revision().document.html.includes('Bob arrived first'));
  await a.value.observe(delayedLocal); await a.value.sync(); await b.value.sync();
  const expected = html.replace('First', 'Alice local intent').replace('Second', 'Bob arrived first');
  assert.equal(f.html(), expected); assert.equal(a.revision().document.html, expected); assert.equal(b.revision().document.html, expected);
  assert.deepEqual(f.log.at(-1)!.changes.map(change => change.key), ['node:a:body']);
});

test('same-object conflict preserves the accepted peer and recovers the complete human draft', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const hold = f.hold('alice-tab'); await a.value.observe(revision('draft', html.replace('First', 'Unsent Alice version')), 'Alice draft'); await hold.entered;
  await b.value.observe(revision('peer', html.replace('First', 'Accepted Bob version'))); await b.value.sync();
  hold.release(); await a.value.sync();
  assert.equal(f.html(), html.replace('First', 'Accepted Bob version')); assert.equal(a.revision().document.html, f.html());
  assert.equal(a.value.getStatus().recovery?.revision.document.html, html.replace('First', 'Unsent Alice version'));
  assert.equal(a.value.getStatus().recovery?.label, 'Alice draft'); assert.equal(a.value.getStatus().pending, 0);
});

test('lost ACK retries acknowledge the original accepted edit exactly once and retain own undo', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close()); f.faults.loseNextAck = true;
  await a.value.observe(revision('lost-ack', html.replace('First', 'Accepted once'))); await a.value.sync();
  assert.equal(a.value.getStatus().phase, 'reconnecting'); assert.equal(a.value.getStatus().pending, 1); assert.equal(f.log.length, 1);
  await a.value.sync(); assert.equal(a.value.getStatus().pending, 0); assert.equal(f.log.length, 1); assert.equal(a.value.canUndo(), true);
  assert.equal(a.value.getStatus().recovery, undefined); assert.equal(f.html(), html.replace('First', 'Accepted once'));
});

test('a reloaded device reconciles a journaled already-accepted edit without false conflict recovery', async t => {
  const f = room(), first = await f.client('alice'); f.faults.loseNextAck = true;
  await first.value.observe(revision('accepted-before-close', html.replace('First', 'Saved despite lost ACK'))); await first.value.sync();
  const journal = structuredClone(first.journal()); assert.equal(journal?.pending.length, 1); first.value.close();
  const reopened = await f.client('alice', { clientId: 'alice-tab', journal }); t.after(() => reopened.value.close());
  assert.equal(reopened.revision().document.html, f.html()); assert.equal(f.log.length, 1);
  assert.equal(reopened.value.getStatus().pending, 0); assert.equal(reopened.value.getStatus().recovery, undefined, 'already saved work is an acknowledgement, not a conflicting teammate edit');
});

test('a real startup conflict recovers the unsent journal branch rather than the room seed', async t => {
  const f = room(), first = await f.client('alice'), peer = await f.client('bob'); t.after(() => peer.value.close());
  f.faults.offline = true;
  const unsent = html.replace('First', 'My journaled unsent draft');
  await first.value.observe(revision('offline-draft', unsent), 'Draft before closing'); await first.value.sync();
  const journal = structuredClone(first.journal()); first.value.close(); f.faults.offline = false;
  await peer.value.observe(revision('accepted-peer', html.replace('First', 'Teammate accepted while offline'))); await peer.value.sync();
  const reopened = await f.client('alice', { clientId: 'alice-tab', journal }); t.after(() => reopened.value.close());
  assert.equal(reopened.revision().document.html, f.html()); assert.ok(f.html().includes('Teammate accepted while offline'));
  assert.equal(reopened.value.getStatus().recovery?.revision.document.html, unsent, 'recovery must contain the human branch that could not be applied');
  assert.equal(reopened.value.getStatus().recovery?.label, 'Draft before closing');
  assert.equal(reopened.value.getStatus().pending, 0); assert.equal(f.log.length, 1);
});

test('offline queue retains call-time bytes and sends both sequential edits after reconnection', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close()); f.faults.offline = true;
  const draft = revision('offline-one', html.replace('First', 'First offline edit'));
  const queued = a.value.observe(draft); draft.document.html = 'Changed by caller immediately after observe';
  await queued; await a.value.sync();
  await a.value.observe(revision('offline-two', html.replace('First', 'First offline edit').replace('Second', 'Second offline edit'))); await a.value.sync();
  assert.equal(a.value.getStatus().pending, 2); assert.equal(a.journal()?.pending.length, 2);
  f.faults.offline = false; await a.value.sync();
  assert.equal(f.html(), html.replace('First', 'First offline edit').replace('Second', 'Second offline edit')); assert.equal(f.log.length, 2); assert.equal(a.value.getStatus().pending, 0);
});

test('own undo and redo affect only this collaborators edit while preserving an unrelated peer change', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  await a.value.observe(revision('own', html.replace('First', 'My edit'))); await a.value.sync(); await b.value.sync();
  await b.value.observe(revision('peer', html.replace('First', 'My edit').replace('Second', 'Their edit'))); await b.value.sync(); await a.value.sync();
  assert.equal(await a.value.undo(), true); await a.value.sync();
  assert.equal(f.html(), html.replace('Second', 'Their edit'));
  assert.equal(await a.value.redo(), true); await a.value.sync();
  assert.equal(f.html(), html.replace('First', 'My edit').replace('Second', 'Their edit'));
});

test('undo refuses to overwrite a peers later edit to the same cell', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  await a.value.observe(revision('own', html.replace('First', 'Mine'))); await a.value.sync(); await b.value.sync();
  await b.value.observe(revision('peer', html.replace('First', 'Theirs later'))); await b.value.sync(); await a.value.sync();
  const count = f.log.length; assert.equal(await a.value.undo(), false); assert.equal(f.log.length, count); assert.equal(f.html(), html.replace('First', 'Theirs later'));
  assert.match(a.value.getStatus().error!, /overwrite|teammate/i);
});

for (const direction of ['undo', 'redo'] as const) {
  test(`a server-rejected ${direction} preserves history so the author can retry after the reservation clears`, async t => {
    const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
    await a.value.observe(revision('own-before-rejection', html.replace('First', 'My saved edit'))); await a.value.sync();
    if (direction === 'redo') { await a.value.undo(); await a.value.sync(); }
    const before = f.html();
    f.faults.rejectNext = true;
    assert.equal(await a.value[direction](), true); await a.value.sync();
    assert.equal(f.html(), before); assert.equal(a.revision().document.html, before);
    assert.equal(direction === 'undo' ? a.value.canUndo() : a.value.canRedo(), true, 'rejected history must remain available');
    assert.equal(direction === 'undo' ? a.value.canRedo() : a.value.canUndo(), false, 'a rejected edit must not create inverse history');
    assert.equal(await a.value[direction](), true); await a.value.sync();
    assert.equal(f.html(), direction === 'undo' ? html : html.replace('First', 'My saved edit'));
  });
}

test('rapid undo requests undo separate edits in order instead of submitting the same inverse twice', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  await a.value.observe(revision('rapid-first', html.replace('First', 'First edit'))); await a.value.sync();
  await a.value.observe(revision('rapid-second', html.replace('First', 'First edit').replace('Second', 'Second edit'))); await a.value.sync();
  assert.deepEqual(await Promise.all([a.value.undo(), a.value.undo()]), [true, true]); await a.value.sync();
  assert.equal(f.html(), html); assert.equal(a.value.getStatus().recovery, undefined);
  assert.equal(a.value.canUndo(), false);
  await a.value.redo(); await a.value.sync(); await a.value.redo(); await a.value.sync();
  assert.equal(f.html(), html.replace('First', 'First edit').replace('Second', 'Second edit'));
});

test('typing a new edit while undo is saving invalidates redo without losing author undo order', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  await a.value.observe(revision('original-before-undo', html.replace('First', 'Original edit'))); await a.value.sync();
  const hold = f.hold('alice-tab');
  await a.value.undo(); await hold.entered;
  await a.value.observe({ ...revision('new-during-undo', html.replace('Second', 'New direction')), parentId: a.revision().id });
  hold.release(); await a.value.sync();
  assert.equal(f.html(), html.replace('Second', 'New direction'));
  assert.equal(a.value.canRedo(), false, 'late undo acceptance must not revive discarded redo');
  await a.value.undo(); await a.value.sync();
  assert.equal(f.html(), html); assert.equal(a.value.canUndo(), false);
});

test('rapid redo requests restore separate accepted edits in order', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  await a.value.observe(revision('redo-first', html.replace('First', 'First edit'))); await a.value.sync();
  await a.value.observe(revision('redo-second', html.replace('First', 'First edit').replace('Second', 'Second edit'))); await a.value.sync();
  await a.value.undo(); await a.value.sync(); await a.value.undo(); await a.value.sync();
  assert.deepEqual(await Promise.all([a.value.redo(), a.value.redo()]), [true, true]); await a.value.sync();
  assert.equal(f.html(), html.replace('First', 'First edit').replace('Second', 'Second edit'));
  assert.equal(a.value.getStatus().recovery, undefined); assert.equal(a.value.canRedo(), false);
});

test('ten collaborators converge through repeated concurrent edits and author-only undo redo with delayed delivery', async t => {
  const f = room();
  for (let i = 2; i < 10; i++) f.members.push({ userId: `designer-${i}`, name: `Designer ${i}`, role: 'editor' });
  const a = await f.client('alice'), clients = [a];
  t.after(() => { for (const client of clients) client.value.close(); });
  const start = '<main data-canvas-v2-node-id="board">' + Array.from({ length: 10 }, (_, i) => `<p data-canvas-v2-node-id="design-${i}">Designer ${i} revision 0</p>`).join('') + '</main>';
  await a.value.enable(revision('ten-person-board', start));
  for (const id of ['bob', ...Array.from({ length: 8 }, (_, i) => `designer-${i + 2}`)]) clients.push(await f.client(id));
  for (let round = 1; round <= 8; round++) {
    const hold = f.hold(clients[round % 10].value.clientId);
    await Promise.all(clients.map((client, i) => {
      const before = client.revision();
      return client.value.observe({ ...revision(`concurrent-${round}-${i}`, before.document.html.replace(`Designer ${i} revision ${round - 1}`, `Designer ${i} revision ${round}`)), parentId: before.id });
    }));
    await hold.entered; hold.release();
    await Promise.all(clients.map(client => client.value.sync()));
    // Each author can have read before another's last commit. Catch every
    // client up to the accepted room before checking identical source bytes.
    await Promise.all(clients.map(client => client.value.sync()));
    for (const client of clients) {
      assert.equal(client.revision().document.html, f.html());
      assert.equal(client.value.getStatus().pending, 0); assert.equal(client.value.getStatus().recovery, undefined);
    }
    for (let i = 0; i < 10; i++) assert.ok(f.html().includes(`Designer ${i} revision ${round}`));
  }
  await Promise.all(clients.map(client => client.value.undo()));
  await Promise.all(clients.map(client => client.value.sync())); await Promise.all(clients.map(client => client.value.sync()));
  for (let i = 0; i < 10; i++) assert.ok(f.html().includes(`Designer ${i} revision 7`));
  await Promise.all(clients.map(client => client.value.redo()));
  await Promise.all(clients.map(client => client.value.sync())); await Promise.all(clients.map(client => client.value.sync()));
  for (const client of clients) { assert.equal(client.revision().document.html, f.html()); assert.equal(client.value.getStatus().recovery, undefined); }
  for (let i = 0; i < 10; i++) assert.ok(f.html().includes(`Designer ${i} revision 8`));
  assert.equal(f.log.length, 100);
});

for (const direction of ['undo', 'redo'] as const) {
  test(`a lost ${direction} acknowledgement moves history exactly once on reconnect`, async t => {
    const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
    await a.value.observe(revision('before-history-ack-loss', html.replace('First', 'My saved edit'))); await a.value.sync();
    if (direction === 'redo') { await a.value.undo(); await a.value.sync(); }
    f.faults.loseNextAck = true;
    await a.value[direction](); await a.value.sync();
    assert.equal(a.value.getStatus().phase, 'reconnecting'); assert.equal(a.value.getStatus().pending, 1);
    const acceptedCount = f.log.length;
    await a.value.sync(); assert.equal(f.log.length, acceptedCount); assert.equal(a.value.getStatus().pending, 0);
    assert.equal(direction === 'undo' ? a.value.canRedo() : a.value.canUndo(), true);
    await a.value[direction === 'undo' ? 'redo' : 'undo'](); await a.value.sync();
    assert.equal(f.html(), direction === 'undo' ? html.replace('First', 'My saved edit') : html);
  });
}

test('viewer changes do not enter the durable queue and local UI fields never enter operations', async t => {
  const f = room(), viewer = await f.client('viewer'), a = await f.client('alice'); t.after(() => { viewer.value.close(); a.value.close(); });
  await viewer.value.observe(revision('forbidden', html.replace('First', 'Viewer edit'))); await viewer.value.sync(); assert.equal(f.log.length, 0); assert.equal(viewer.value.getStatus().pending, 0);
  await a.value.observe({ ...revision('local-ui', html.replace('First', 'Allowed edit')), viewport: { x: 123, y: 456, scale: 2 }, draft: 'Private unsent message' } as CanvasV2ArtifactRevision); await a.value.sync();
  assert.equal(f.log.length, 1); const wire = JSON.stringify(f.commits);
  assert.ok(!wire.includes('viewport')); assert.ok(!wire.includes('Private unsent message')); assert.ok(f.log[0].changes.every(change => change.key.startsWith('node:')));
});

test('enabling an imported revision does not send unknown local camera, draft or account-memory fields in its seed', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const imported = { ...revision('imported-with-extra-fields'), draft: 'Private unsent seed draft', viewport: { x: 987654, y: 123456, scale: 3 }, accountMemory: { secret: 'Private account context' }, turns: [{ message: 'Private chat turn' }] };
  await a.value.enable(imported);
  const wire = JSON.stringify(f.seeds[0]);
  for (const privateValue of ['Private unsent seed draft', 'viewport', '987654', 'Private account context', 'Private chat turn']) assert.ok(!wire.includes(privateValue), privateValue + ' must remain on this device');
  assert.equal(f.seeds[0].id, imported.id); assert.equal(f.html(), html);
});

test('first shared enable installs one stable geometry guard before independent edits begin', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const initial = { ...revision('before-sharing'), document: { html, css: '/* authored CSS */\r\np{color:purple}', javascript: 'let nativeState=7;\r\n' } };
  await a.value.enable(initial); const first = f.document();
  assert.ok(first.css.startsWith(initial.document.css)); assert.equal((first.css.match(/\/\* canvas-v2-native-scene-geometry-v1 \*\//g) ?? []).length, 1);
  assert.equal(first.javascript, initial.document.javascript); assert.equal(first.html, initial.document.html);
  await a.value.enable(a.value.getRevision()!); assert.deepEqual(f.document(), first);
  await a.value.enable({ ...a.value.getRevision()!, document: { ...first, javascript: ' \r\n' } });
  assert.equal(f.document().javascript, undefined, 'empty script placeholders normalize before peers begin editing');
  assert.equal(f.document().css, first.css);
});

test('failure to load the local journal degrades to a live editable connection rather than blocking the room', async t => {
  const f = room(), a = await f.client('alice', { loadFailure: true }); t.after(() => a.value.close());
  assert.equal(a.value.getStatus().phase, 'live'); assert.equal(a.value.writable, true); assert.equal(a.value.getStatus().pending, 0);
  await a.value.observe(revision('still-editable', html.replace('First', 'Saved without local recovery'))); await a.value.sync();
  assert.equal(a.value.getStatus().pending, 0); assert.equal(f.html(), html.replace('First', 'Saved without local recovery'));
});

test('revoked access blocks the connection while retaining queued human work on this device', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close()); f.faults.offline = true;
  await a.value.observe(revision('not-yet-saved', html.replace('First', 'Keep this unsent work'))); await a.value.sync();
  f.faults.offline = false; f.faults.denied = true; await a.value.sync();
  assert.equal(a.value.getStatus().phase, 'blocked'); assert.equal(a.value.getStatus().pending, 1); assert.equal(a.value.writable, false);
  assert.equal(a.journal()?.pending.length, 1); assert.ok(JSON.stringify(a.journal()).includes('Keep this unsent work'));
  assert.equal(f.signals.has('alice-tab'), false); assert.equal(f.log.length, 0);
});

for (const expiry of ['JWT expired', ' JWT has expired at the gateway ']) {
test(`an expired JWT (${expiry.trim()}) retries after external auth refresh and saves queued work without a reload`, async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  f.faults.offline = true;
  await a.value.observe(revision('expiry-pending', html.replace('First', 'Unsent across token expiry'))); await a.value.sync();
  f.faults.offline = false; f.faults.readError = expiry; await a.value.sync();
  assert.equal(a.value.getStatus().phase, 'reconnecting', 'expiry must permit a later SDK-refreshed request rather than permanently block the controller');
  assert.equal(a.value.getStatus().pending, 1); assert.equal(a.journal()?.pending.length, 1); assert.equal(f.log.length, 0);
  f.faults.readError = ''; const requestsBeforeRefresh = f.calls.since.length; await a.value.sync();
  assert(f.calls.since.length > requestsBeforeRefresh, 'the healthy next tick must actually perform authoritative RPC reauthentication');
  assert.equal(a.value.getStatus().phase, 'live'); assert.equal(a.value.writable, true); assert.equal(a.value.getStatus().pending, 0);
  assert.equal(f.html(), html.replace('First', 'Unsent across token expiry')); assert.equal(f.log.length, 1);
});
}

for (const message of ['Access denied', 'Invalid JWT']) {
  test(`${message} remains blocked after the transport becomes healthy`, async t => {
    const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
    f.faults.offline = true;
    await a.value.observe(revision('hard-auth-pending', html.replace('First', 'Retained after authentication rejection'))); await a.value.sync();
    f.faults.offline = false; f.faults.readError = message; await a.value.sync();
    assert.equal(a.value.getStatus().phase, 'blocked'); assert.equal(a.value.writable, false); assert.equal(f.signals.has('alice-tab'), false);
    const deniedRequests = f.calls.since.length; f.faults.readError = ''; await a.value.sync();
    assert.equal(f.calls.since.length, deniedRequests); assert.equal(f.log.length, 0); assert.equal(a.value.getStatus().pending, 1);
    assert(JSON.stringify(a.journal()).includes('Retained after authentication rejection'));
  });
}

test('presence rejects malformed packets, orders sequences, expires locally and never writes document operations', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const packet: PeerPresence = { clientId: 'bob-tab', userId: 'bob', name: 'Untrusted display name', sequence: 5, cursor: { x: 20, y: 30 }, selection: [{ nodeId: 'a', x: 1, y: 2, width: 30, height: 40 }], mode: 'design', activity: 'editing', at: -999999 };
  const receive = f.signals.get('alice-tab')!; receive({ kind: 'presence', value: packet });
  assert.equal(a.value.getPeers()[0].name, 'Bob'); const at = a.value.getPeers()[0].at; assert.ok(at > 0);
  receive({ kind: 'presence', value: { ...packet, sequence: 4, cursor: { x: 999, y: 999 } } }); assert.deepEqual(a.value.getPeers()[0].cursor, { x: 20, y: 30 });
  a.value.expirePresence(at + 12000); assert.equal(a.value.getPeers().length, 1); a.value.expirePresence(at + 12001); assert.equal(a.value.getPeers().length, 0);
  for (const invalid of [{ ...packet, sequence: -1 }, { ...packet, cursor: { x: Infinity, y: 0 } }, { ...packet, selection: [{ ...packet.selection[0], width: -1 }] }, { ...packet, motion: new Array(25).fill(packet.selection[0]) }, { ...packet, mode: 'wrong' }]) assert.equal(parsePeerPresence(invalid), undefined);
  assert.equal(f.log.length, 0); await turn();
});

test('continuous pointer packets cannot postpone durable reauthentication after access is revoked', async t => {
  let now = 100_000; t.mock.method(Date, 'now', () => now);
  // This repository executes on Node20.9, whose timer API accepts an array;
  // current @types/node also supports newer Node20 options objects.
  const timers = mockTimers(t, ['setInterval']);
  // Node20.9 MockTimers incorrectly cancels the next future interval when
  // clearInterval(undefined) runs. Native timers correctly treat it as a no-op.
  const clear = globalThis.clearInterval;
  t.mock.method(globalThis, 'clearInterval', (id: Parameters<typeof clearInterval>[0]) => { if (id !== undefined) clear(id); });
  const intervalSpy = t.mock.method(globalThis, 'setInterval');
  const f = room(), a = await f.client('alice'); t.after(() => { a.value.close(); timers.reset(); });
  assert.equal(f.presence[0].at, now, 'the controller must use the test clock');
  assert.equal(intervalSpy.mock.callCount(), 1, 'the actual client must register its periodic callback');
  const lastDurableRead = f.calls.since.at(-1)!; f.faults.denied = true;
  for (let elapsed = 50; elapsed <= 5_000; elapsed += 50) {
    now += 50; a.value.pointer({ x: elapsed, y: 10 }); timers.tick(50); await turn();
  }
  assert.ok(f.presence.length >= 80, 'the pointer heartbeat must actually remain busy throughout the polling window');
  assert.ok(f.calls.since.some(at => at > lastDurableRead && at - lastDurableRead <= 5_000), 'durable polling must run despite the continuously renewed presence heartbeat: ' + JSON.stringify({ now, lastDurableRead, calls: f.calls, status: a.value.getStatus() }));
  assert.equal(a.value.getStatus().phase, 'blocked'); assert.equal(a.value.writable, false); assert.equal(f.log.length, 0);
});

test('member polling removes revoked presence before its TTL while unchanged directories reuse their array', async t => {
  let now = 100_000; t.mock.method(Date, 'now', () => now);
  const timers = mockTimers(t, ['setInterval']);
  const clear = globalThis.clearInterval;
  t.mock.method(globalThis, 'clearInterval', (id: Parameters<typeof clearInterval>[0]) => { if (id !== undefined) clear(id); });
  const f = room(), a = await f.client('alice'); t.after(() => { a.value.close(); timers.reset(); });
  const directory = a.value.getStatus().members; let statusSignals = 0; a.value.subscribe(() => statusSignals++);
  await a.value.refreshMembers(true);
  assert.strictEqual(a.value.getStatus().members, directory); assert.equal(statusSignals, 0, 'an equal directory must not notify the workspace status subscriber');
  f.signals.get('alice-tab')!({ kind: 'presence', value: { clientId: 'bob-tab', userId: 'bob', name: 'Bob', sequence: 1, cursor: null, selection: [], mode: 'preview', activity: 'viewing', at: now } });
  assert.equal(a.value.getPeers().length, 1); f.members.splice(f.members.findIndex(member => member.userId === 'bob'), 1);
  for (let elapsed = 50; elapsed <= 5_000; elapsed += 50) { now += 50; a.value.pointer({ x: elapsed, y: 10 }); timers.tick(50); await turn(); }
  assert.ok(f.calls.members.some(at => at > 100_000 && at <= 105_000), JSON.stringify(f.calls)); assert.equal(a.value.getPeers().length, 0, 'revocation, rather than the 12s presence TTL, must remove Bob');
  assert.ok(!a.value.getStatus().members.some(member => member.userId === 'bob')); assert.equal(f.log.length, 0);
});

test('the final throttled pointer packet arrives within40ms and queued packets never publish after close', async t => {
  let now = 100_000; t.mock.method(Date, 'now', () => now);
  const timers = mockTimers(t, ['setInterval', 'setTimeout']);
  const clearIntervalTimer = globalThis.clearInterval, clearTimeoutTimer = globalThis.clearTimeout;
  t.mock.method(globalThis, 'clearInterval', (id: Parameters<typeof clearInterval>[0]) => { if (id !== undefined) clearIntervalTimer(id); });
  t.mock.method(globalThis, 'clearTimeout', (id: Parameters<typeof clearTimeout>[0]) => { if (id !== undefined) clearTimeoutTimer(id); });
  const f = room(), a = await f.client('alice'); t.after(() => { a.value.close(); timers.reset(); });
  a.value.pointer({ x: 1, y: 2 }); now += 10; timers.tick(10); a.value.pointer({ x: 99, y: 22 });
  assert.deepEqual(f.presence.at(-1)!.cursor, { x: 1, y: 2 }, 'the second input is inside the40ms throttle window');
  now += 40; timers.tick(40); await turn();
  assert.deepEqual(f.presence.at(-1)!.cursor, { x: 99, y: 22 }, 'the last coordinate must publish without waiting for another input or4s heartbeat');
  assert.ok(f.presence.at(-1)!.at <= 100_050);
  now += 1; a.value.pointer({ x: 150, y: 200 }); const countBeforeClose = f.presence.length;
  a.value.close(); now += 100; timers.tick(100); await turn(); assert.equal(f.presence.length, countBeforeClose);
  assert.equal(f.log.length, 0);
});

test('an authoritative roster downgrade removes local authoring before another edit can queue', async t => {
  const f = room(), bob = await f.client('bob'); t.after(() => bob.value.close());
  assert.equal(bob.value.writable, true);
  f.members.find(member => member.userId === 'bob')!.role = 'viewer';
  await bob.value.refreshMembers(true);
  assert.equal(bob.value.getStatus().role, 'viewer', 'a removed editor readmitted with a viewer link must not retain its old editing UI');
  assert.equal(bob.value.writable, false);
  await bob.value.observe(revision('viewer-after-downgrade', html.replace('First', 'Must stay local'))); await bob.value.sync();
  assert.equal(f.commits.length, 0); assert.equal(bob.value.getStatus().pending, 0);
});

test('an authoritative viewer upgrade enables authoring while owner identity remains owner', async t => {
  const f = room(), viewer = await f.client('viewer'), owner = await f.client('alice'); t.after(() => { viewer.value.close(); owner.value.close(); });
  f.members.find(member => member.userId === 'viewer')!.role = 'editor';
  await viewer.value.refreshMembers(true);
  assert.equal(viewer.value.getStatus().role, 'editor'); assert.equal(viewer.value.writable, true);
  // SQL stores the original owner's member row as editor; ownership comes from
  // the room's owner identity and must not be downgraded by that member row.
  f.members.find(member => member.userId === 'alice')!.role = 'editor';
  await owner.value.refreshMembers(true); assert.equal(owner.value.getStatus().role, 'owner');
});

test('multiple conflicted offline operations retain the complete unsent human branch across reload', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  f.faults.offline = true;
  await a.value.observe(revision('offline-a', html.replace('First', 'Alice unsent A'))); await a.value.sync();
  const completeDraft = html.replace('First', 'Alice unsent A').replace('Second', 'Alice unsent B');
  await a.value.observe(revision('offline-ab', completeDraft)); await a.value.sync();
  const before = structuredClone(a.journal()); assert.equal(before?.pending.length, 2);
  f.faults.offline = false;
  await b.value.observe(revision('peer-ab', html.replace('First', 'Bob accepted A').replace('Second', 'Bob accepted B'))); await b.value.sync();
  await a.value.sync();
  assert.equal(a.revision().document.html, f.html(), 'the accepted peer version remains the shared document');
  assert.equal(a.value.getStatus().recovery?.revision.document.html, completeDraft, 'both conflicting human changes must survive, not only the last operation');
  assert.equal(a.journal()?.recovery?.revision.document.html, completeDraft, 'durable recovery must retain the whole unsent branch');
  const reopened = await f.client('alice', { clientId: 'alice-tab', journal: structuredClone(a.journal()) }); t.after(() => reopened.value.close());
  assert.equal(reopened.value.getStatus().recovery?.revision.document.html, completeDraft);
});

test('startup reconstructs every conflicted offline operation from its journal before discarding pending entries', async t => {
  const f = room(), old = await f.client('alice'), b = await f.client('bob'); t.after(() => { old.value.close(); b.value.close(); });
  f.faults.offline = true;
  await old.value.observe(revision('startup-offline-a', html.replace('First', 'Startup unsent A'))); await old.value.sync();
  const complete = html.replace('First', 'Startup unsent A').replace('Second', 'Startup unsent B');
  await old.value.observe(revision('startup-offline-ab', complete)); await old.value.sync();
  const journal = structuredClone(old.journal()); assert.equal(journal?.pending.length, 2); old.value.close(); f.faults.offline = false;
  await b.value.observe(revision('startup-peer-ab', html.replace('First', 'Accepted A').replace('Second', 'Accepted B'))); await b.value.sync();
  const reopened = await f.client('alice', { clientId: 'alice-tab', journal }); t.after(() => reopened.value.close());
  assert.equal(reopened.revision().document.html, f.html()); assert.equal(reopened.value.getStatus().pending, 0);
  assert.equal(reopened.value.getStatus().recovery?.revision.document.html, complete);
  assert.equal(reopened.journal()?.recovery?.revision.document.html, complete);
});

test('a conflicted field and safe pending sibling preserve the whole branch while only the safe sibling commits', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  f.faults.offline = true;
  await a.value.observe(revision('mixed-offline-a', html.replace('First', 'Conflicted Alice A'))); await a.value.sync();
  const complete = html.replace('First', 'Conflicted Alice A').replace('Second', 'Safe Alice B');
  await a.value.observe(revision('mixed-offline-ab', complete)); await a.value.sync(); f.faults.offline = false;
  await b.value.observe(revision('mixed-peer-a', html.replace('First', 'Accepted Bob A'))); await b.value.sync(); await a.value.sync();
  assert.equal(f.html(), html.replace('First', 'Accepted Bob A').replace('Second', 'Safe Alice B'));
  assert.equal(a.value.getStatus().recovery?.revision.document.html, complete);
  assert.equal(await a.value.undo(), true); await a.value.sync();
  assert.equal(f.html(), html.replace('First', 'Accepted Bob A'), 'own undo removes only the accepted safe edit and never the peer conflict winner');
});

test('later conflicts retain an earlier unsaved recovery rather than replacing the only copy', async t => {
  t.mock.method(Date, 'now', () => 100_000);
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  f.faults.offline = true; await a.value.observe(revision('first-recovery-a', html.replace('First', 'Earlier retained Alice A'))); await a.value.sync(); f.faults.offline = false;
  await b.value.observe(revision('first-winner-a', html.replace('First', 'Bob accepted A'))); await b.value.sync(); await a.value.sync();
  assert(JSON.stringify(a.value.getStatus().recovery).includes('Earlier retained Alice A'));
  f.faults.offline = true; await a.value.observe(revision('later-recovery-b', a.revision().document.html.replace('Second', 'Later retained Alice B'))); await a.value.sync(); f.faults.offline = false;
  await b.value.observe(revision('later-winner-b', f.html().replace('Second', 'Bob accepted B'))); await b.value.sync(); await a.value.sync();
  const exported = JSON.stringify(a.journal()?.recovery);
  assert(exported.includes('Earlier retained Alice A'), 'the old conflict must remain in the exported durable recovery');
  assert(exported.includes('Later retained Alice B'));
  assert.equal(a.revision().document.html, f.html());
});

test('a legacy revision-only recovery survives a new conflict without being applied to the shared document', async t => {
  const f = room(), b = await f.client('bob'); t.after(() => b.value.close());
  const legacy = revision('legacy-recovery', html.replace('First', 'Legacy recovered human text'));
  const a = await f.client('alice', { journal: { pending: [], recovery: { revision: legacy, label: 'Before sharing', at: 1 } } }); t.after(() => a.value.close());
  f.faults.offline = true; await a.value.observe(revision('newer-recovery', html.replace('Second', 'New conflicted human text'))); await a.value.sync(); f.faults.offline = false;
  await b.value.observe(revision('newer-accepted', html.replace('Second', 'Accepted teammate text'))); await b.value.sync(); await a.value.sync();
  const exported = JSON.stringify(a.journal()?.recovery);
  assert(exported.includes('Legacy recovered human text'), 'legacy recovery has no changes list, so its original branch must remain explicitly exportable');
  assert(exported.includes('New conflicted human text'));
  assert.equal(f.html(), html.replace('Second', 'Accepted teammate text'), 'retained recovery is never silently replayed over peer source');
});


test('same-millisecond explicit recoveries keep both branches in the durable journal', async t => {
  t.mock.method(Date, 'now', () => 100_000);
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  a.value.retainLocalRevision(revision('same-ms-one', html.replace('First', 'First same-ms branch')), 'First'); await turn();
  a.value.retainLocalRevision(revision('same-ms-two', html.replace('Second', 'Second same-ms branch')), 'Second'); await turn();
  const durable = JSON.stringify(a.journal()?.recovery);
  assert(durable.includes('First same-ms branch')); assert(durable.includes('Second same-ms branch'));
  assert.equal(a.journal()?.recovery?.revision.id, 'same-ms-two');
});

test('an offline journal write retries after local storage recovers without needing a new human edit', async t => {
  let failJournal = false;
  const f = room(), a = await f.client('alice', { journalFailure: () => failJournal }); t.after(() => a.value.close());
  f.faults.offline = true; failJournal = true;
  await a.value.observe(revision('journal-retry', html.replace('First', 'Unsent while local storage failed'))); await a.value.sync();
  assert.equal(a.value.getStatus().pending, 1); assert.equal(a.journal()?.pending.length, 0);
  failJournal = false; await a.value.sync();
  assert.equal(a.journal()?.pending.length, 1, 'a failed checkpoint is not a saved signature; Retry must persist unchanged pending bytes');
  assert(JSON.stringify(a.journal()).includes('Unsent while local storage failed'));
});


test('catching up across multiple log pages preserves a delayed local edit and its author-only undo', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const hold = f.hold('alice-tab'); await a.value.observe(revision('delayed-page-local', html.replace('First', 'Delayed Alice edit'))); await hold.entered;
  for (let index = 1; index <= 105; index++) {
    await b.value.observe(revision(`peer-page-${index}`, html.replace('Second', `Bob version ${index}`))); await b.value.sync();
  }
  hold.release(); await a.value.sync(); await b.value.sync();
  assert.equal(a.revision().document.html, html.replace('First', 'Delayed Alice edit').replace('Second', 'Bob version 105'));
  assert.equal(a.value.getStatus().pending, 0); assert.equal(a.value.getStatus().recovery, undefined);
  assert.equal(await a.value.undo(), true); await a.value.sync();
  assert.equal(f.html(), html.replace('Second', 'Bob version 105'));
});

test('server-side busy rejection preserves the full queued branch and permits an unrelated pending sibling', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const hold = f.hold('alice-tab'); await a.value.observe(revision('busy-a', html.replace('First', 'Blocked local A'))); await hold.entered;
  const whole = html.replace('First', 'Blocked local A').replace('Second', 'Unrelated local B');
  await a.value.observe(revision('busy-ab', whole));
  // Claims can reject a write even though none of its field hashes changed.
  f.faults.rejectNext = true; hold.release(); await a.value.sync();
  assert.equal(a.value.getStatus().recovery?.revision.document.html, whole);
  await a.value.sync(); assert.equal(f.html(), html.replace('Second', 'Unrelated local B'));
  assert.equal(a.value.getStatus().pending, 0);
});

test('claim responses expose busy object identities and release them without writing a document operation', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  f.faults.busyObjects = ['encoded%20object'];
  a.value.selection([{ nodeId: 'encoded object', x: 0, y: 0, width: 100, height: 50 }], 'design', 'editing'); await turn();
  assert.deepEqual(a.value.getStatus().busyObjects, ['encoded object']);
  f.faults.busyObjects = []; a.value.selection([], 'design', 'viewing'); await turn();
  assert.deepEqual(a.value.getStatus().busyObjects, []); assert.equal(f.commits.length, 0);
});

test('passive selection publishes inspection presence without acquiring or renewing an edit claim', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const requested: string[][] = [];
  t.mock.method(a.value.transport, 'claim', async (_clientId: string, ids: string[]) => { requested.push([...ids]); return { busy: [] }; });
  a.value.selection([{ nodeId: 'a', x: 0, y: 0, width: 100, height: 50 }], 'design', 'viewing'); await turn();
  assert.deepEqual(requested, [], 'inspection must not exclude a teammate from editing the same selected object');
  assert.equal(f.presence.at(-1)?.selection[0].nodeId, 'a'); assert.equal(f.presence.at(-1)?.activity, 'viewing');
  assert.equal(f.commits.length, 0);
});

test('finishing an active edit releases its lease while keeping the same selected object visible', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const requested: string[][] = [];
  t.mock.method(a.value.transport, 'claim', async (_clientId: string, ids: string[]) => { requested.push([...ids]); return { busy: ids.length ? ['a'] : [] }; });
  const selected = [{ nodeId: 'a', x: 0, y: 0, width: 100, height: 50 }];
  a.value.selection(selected, 'design', 'editing'); await turn();
  assert.deepEqual(requested, [['a']]); assert.deepEqual(a.value.getStatus().busyObjects, ['a']);
  a.value.selection(selected, 'design', 'viewing'); await turn();
  assert.deepEqual(requested, [['a'], []], 'Finish/cancel must hand off authority without requiring a deselect click');
  assert.deepEqual(a.value.getStatus().busyObjects, []); assert.equal(f.presence.at(-1)?.selection[0].nodeId, 'a');
});

test('a slow old claim response cannot replace the latest selected object busy result', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close()); const old = deferred();
  t.mock.method(a.value.transport, 'claim', async (_clientId: string, ids: string[]) => {
    if (ids[0] === 'a') { await old.promise; return { busy: ['a'] }; }
    return { busy: ids.length ? ['b'] : [] };
  });
  const select = (nodeId: string) => a.value.selection([{ nodeId, x: 0, y: 0, width: 100, height: 50 }], 'design', 'editing');
  select('a'); await turn(); select('b'); await turn(); old.resolve(); await turn(); await turn();
  assert.deepEqual(a.value.getStatus().busyObjects, ['b'], 'only the latest desired active edit may determine busy state');
});

test('a delayed old release cannot clear a newer active object busy result', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close()); const release = deferred();
  t.mock.method(a.value.transport, 'claim', async (_clientId: string, ids: string[]) => {
    if (!ids.length) { await release.promise; return { busy: [] }; }
    return { busy: ids[0] === 'b' ? ['b'] : [] };
  });
  const select = (nodeId: string) => a.value.selection([{ nodeId, x: 0, y: 0, width: 100, height: 50 }], 'design', 'editing');
  select('a'); await turn(); a.value.selection([], 'design', 'viewing'); await turn(); select('b'); await turn();
  release.resolve(); await turn(); await turn();
  assert.deepEqual(a.value.getStatus().busyObjects, ['b'], 'the empty result belongs to an old release, not the current B acquisition');
});

test('closing during claim acquisition orders final release after the in-flight request and ignores late status', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close()); const gate = deferred();
  let serverClaims: string[] = [], notifications = 0;
  t.mock.method(a.value.transport, 'claim', async (_clientId: string, ids: string[]) => {
    if (ids.length) await gate.promise;
    serverClaims = [...ids]; return { busy: ids.length ? ['a'] : [] };
  });
  a.value.selection([{ nodeId: 'a', x: 0, y: 0, width: 100, height: 50 }], 'design', 'editing'); await turn();
  const stop = a.value.subscribe(() => { notifications++; }); t.after(stop);
  a.value.close(); gate.resolve(); await turn(); await turn();
  assert.deepEqual(serverClaims, [], 'a request already in flight must not recreate an abandoned lease after final cleanup');
  assert.equal(notifications, 0, 'a closed controller must not publish a late claim status update');
  assert.equal(f.signals.has('alice-tab'), false);
});

test('a desired claim arriving between drain completion and cleanup is still sent', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close()); const requested: string[][] = [];
  let resolve!: (result: { busy: string[] }) => void;
  const receipt = new Promise<{ busy: string[] }>(done => { resolve = done; });
  t.mock.method(a.value.transport, 'claim', (_clientId: string, ids: string[]) => {
    requested.push([...ids]); return ids[0] === 'a' ? receipt : Promise.resolve({ busy: [] });
  });
  const select = (nodeId: string) => a.value.selection([{ nodeId, x: 0, y: 0, width: 100, height: 50 }], 'design', 'editing');
  select('a');
  // The await in drainClaims registered first. This callback runs after its
  // last version check returns, but before its finally clears claimPump.
  const handoff = receipt.then(() => select('b')); resolve({ busy: [] });
  await handoff; await turn(); await turn();
  assert.deepEqual(requested, [['a'], ['b']], 'a desired generation cannot be stranded until the next seven-second renewal');
});

test('replaying an already-accepted Finish revision is a no-op and preserves later peer edits and own undo', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const original = a.revision(); await a.value.observe(original);
  const finished = { ...revision('first-finish', html.replace('First', 'Already accepted human text')), parentId: original.id };
  await a.value.observe(finished); await a.value.sync(); await b.value.sync();
  await b.value.observe(revision('peer-after-finish', f.html().replace('Second', 'Later peer sibling'))); await b.value.sync(); await a.value.sync();
  await a.value.observe({ ...finished, id: 'redundant-finish-effect' }); await a.value.sync(); await b.value.sync();
  assert.equal(f.html(), html.replace('First', 'Already accepted human text').replace('Second', 'Later peer sibling'));
  assert.equal(a.value.getStatus().recovery, undefined, 'identical accepted after-values are not a competing teammate edit');
  assert.equal(f.log.filter(operation => operation.actorId === 'alice').length, 1, 'no-op replay must not create another durable operation');
  assert.equal(a.value.getStatus().pending, 0); assert.equal(await a.value.undo(), true); await a.value.sync();
  assert.equal(f.html(), html.replace('Second', 'Later peer sibling'), 'the original author undo still removes exactly one real edit');
});

test('an already-applied field does not discard a new sibling edit in the same stale-parent revision', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const original = a.revision(); await a.value.observe(original);
  const firstHtml = html.replace('First', 'Accepted A');
  await a.value.observe({ ...revision('accepted-first-field', firstHtml), parentId: original.id }); await a.value.sync();
  const secondHtml = firstHtml.replace('Second', 'New B alongside replayed A');
  await a.value.observe({ ...revision('mixed-noop-and-new-field', secondHtml), parentId: original.id }); await a.value.sync();
  assert.equal(f.html(), secondHtml); assert.equal(a.value.getStatus().recovery, undefined);
  assert.deepEqual(f.log.map(operation => operation.changes.map(change => change.key)), [['node:a:body'], ['node:b:body']], 'only already-applied after-values may be filtered, leaving novel field intent intact');
  assert.equal(await a.value.undo(), true); await a.value.sync(); assert.equal(f.html(), firstHtml);
  assert.equal(await a.value.undo(), true); await a.value.sync(); assert.equal(f.html(), html);
});

test('busy presence follows an actual editor activity transition while passive selections remain inspectable', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const selected = [{ nodeId: 'a', x: 0, y: 0, width: 100, height: 50 }];
  a.value.selection(selected, 'design', 'viewing'); await turn();
  const receive = f.signals.get('alice-tab')!;
  const peer: PeerPresence = { clientId: 'bob-tab', userId: 'bob', name: 'Bob', sequence: 1, cursor: null, selection: selected, mode: 'design', activity: 'viewing', at: Date.now() };
  receive({ kind: 'presence', value: peer }); assert.deepEqual(a.value.getStatus().busyObjects, []);
  receive({ kind: 'presence', value: { ...peer, sequence: 2, activity: 'editing' } }); assert.deepEqual(a.value.getStatus().busyObjects, ['a']);
  receive({ kind: 'presence', value: { ...peer, sequence: 3, activity: 'viewing' } }); assert.deepEqual(a.value.getStatus().busyObjects, []);
  receive({ kind: 'presence', value: { ...peer, sequence: 4, activity: 'editing' } });
  receive({ kind: 'leave', clientId: 'bob-tab' }); assert.deepEqual(a.value.getStatus().busyObjects, []);
});

test('a viewer cannot turn untrusted editing presence into an authoritative busy lock', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const selected = [{ nodeId: 'a', x: 0, y: 0, width: 100, height: 50 }];
  a.value.selection(selected, 'design', 'viewing'); await turn();
  f.signals.get('alice-tab')!({ kind: 'presence', value: { clientId: 'viewer-tab', userId: 'viewer', name: 'Viewer', sequence: 1, cursor: null, selection: selected, mode: 'design', activity: 'editing', at: Date.now() } });
  assert.equal(a.value.getPeers().length, 1, 'the viewer may still inspect and appear in presence');
  assert.deepEqual(a.value.getStatus().busyObjects, [], 'viewer awareness has no editing authority and cannot suppress an owner mutation');
});

test('Finish handoff before an in-flight save ACK preserves both intents through authoritative CAS', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const leases: string[][] = [];
  t.mock.method(a.value.transport, 'claim', async (_clientId: string, ids: string[]) => { leases.push([...ids]); return { busy: [] }; });
  const selected = [{ nodeId: 'a', x: 0, y: 0, width: 100, height: 50 }];
  a.value.selection(selected, 'design', 'editing'); await turn();
  const hold = f.hold('alice-tab');
  const aliceText = html.replace('First', 'Alice finished while upload pending');
  await a.value.observe(revision('finish-save-in-flight', aliceText)); await hold.entered;
  a.value.selection(selected, 'design', 'viewing'); await turn();
  assert.deepEqual(leases, [['a'], []], 'the selected object is available for explicit handoff before this delayed ACK');
  b.value.selection(selected, 'design', 'editing'); await turn();
  const bobText = html.replace('First', 'Bob accepted after handoff');
  await b.value.observe(revision('handoff-next-editor', bobText)); await b.value.sync();
  hold.release(); await a.value.sync(); await b.value.sync();
  assert.equal(f.html(), bobText); assert.equal(a.revision().document.html, bobText); assert.equal(b.revision().document.html, bobText);
  assert.equal(a.value.getStatus().recovery?.revision.document.html, aliceText, 'a handoff race may require explicit recovery, but cannot silently discard the finished draft');
  assert.equal(a.value.getStatus().pending, 0); assert.equal(f.log.filter(operation => operation.actorId === 'alice').length, 0);
  assert.equal(await b.value.undo(), true); await b.value.sync(); assert.equal(f.html(), html);
  assert.equal(a.value.getStatus().recovery?.revision.document.html, aliceText, 'the prior author recovery remains available independently of next-author undo');
});

test('an unobserved evicted parent fails closed and recovers the complete long native draft', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const oldEngineBase = a.revision();
  for (let index = 1; index <= 25; index++) {
    await b.value.observe(revision(`long-peer-${index}`, html.replace('Second', `Bob accepted update ${index}`))); await b.value.sync(); await a.value.sync();
  }
  assert(a.revision().document.html.includes('Bob accepted update 25'));
  const longHumanDraft = { ...revision('long-native-draft', oldEngineBase.document.html.replace('First', 'Alice final long edit')), parentId: oldEngineBase.id };
  await a.value.observe(longHumanDraft); await a.value.sync(); await b.value.sync();
  assert(f.html().includes('Bob accepted update 25'), 'an unknown/evicted parent must never be guessed from the latest peer document and reverse its untouched fields');
  const ownCommits = f.commits.filter(operation => operation.clientId === 'alice-tab');
  assert.equal(ownCommits.length, 0, 'an explicit unavailable parent cannot authorize any guessed diff');
  assert.equal(a.value.getStatus().recovery?.revision.document.html, longHumanDraft.document.html);
  assert.equal(a.journal()?.recovery?.revision.id, longHumanDraft.id, 'the whole draft must survive a reload through the journal');
  assert.equal(a.revision().document.html, f.html(), 'accepted peer source remains the displayed authority');
  assert.equal(a.value.getStatus().pending, 0);
});

test('an observed editing basis survives twenty-five peer revisions and commits only the owned object', async t => {
  const f = room(), a = await f.client('alice'), b = await f.client('bob'); t.after(() => { a.value.close(); b.value.close(); });
  const oldEngineBase = a.revision();
  // Workspace observes its committed engine revision before deferring incoming
  // source during a long native edit. This must pin its exact comparison basis.
  await a.value.observe(oldEngineBase);
  for (let index = 1; index <= 25; index++) {
    await b.value.observe(revision(`pinned-peer-${index}`, html.replace('Second', `Bob accepted update ${index}`))); await b.value.sync(); await a.value.sync();
  }
  await a.value.observe({ ...revision('pinned-human-draft', oldEngineBase.document.html.replace('First', 'Alice long edit')), parentId: oldEngineBase.id });
  await a.value.sync(); await b.value.sync();
  const expected = html.replace('First', 'Alice long edit').replace('Second', 'Bob accepted update 25');
  assert.equal(f.html(), expected); assert.equal(a.revision().document.html, expected); assert.equal(b.revision().document.html, expected);
  const ownAccepted = f.log.filter(operation => operation.actorId === 'alice');
  assert.equal(ownAccepted.length, 1); assert.deepEqual(ownAccepted[0].changes.map(change => change.key), ['node:a:body']);
  assert.equal(a.value.getStatus().recovery, undefined);
  assert.equal(await a.value.undo(), true); await a.value.sync();
  assert.equal(f.html(), html.replace('Second', 'Bob accepted update 25'), 'author undo must preserve all twenty-five peer edits');
});

test('rapid queued manual revisions resolve their real parent chain before either observe finishes', async t => {
  const f = room(), a = await f.client('alice'); t.after(() => a.value.close());
  const base = a.revision(); await a.value.observe(base);
  f.faults.offline = true;
  const first = { ...revision('rapid-parent-one', html.replace('First', 'First queued edit')), parentId: base.id };
  const second = { ...revision('rapid-parent-two', first.document.html.replace('Second', 'Second queued edit')), parentId: first.id };
  await Promise.all([a.value.observe(first), a.value.observe(second)]); await a.value.sync();
  assert.equal(a.value.getStatus().pending, 2); assert.equal(a.value.getStatus().recovery, undefined);
  assert.deepEqual(a.journal()?.pending.map(operation => operation.changes.map(change => change.key)), [['node:a:body'], ['node:b:body']]);
  f.faults.offline = false; await a.value.sync();
  assert.equal(f.html(), second.document.html); assert.equal(f.log.length, 2); assert.equal(a.value.getStatus().pending, 0);
  assert.equal(await a.value.undo(), true); await a.value.sync(); assert.equal(f.html(), first.document.html);
  assert.equal(await a.value.undo(), true); await a.value.sync(); assert.equal(f.html(), html);
});
