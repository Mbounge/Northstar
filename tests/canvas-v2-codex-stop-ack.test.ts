import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexSessionHost } from '../lib/canvas-v2/codex-app-server/server';
import { fixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import { IDLE_SESSION_RELEASED, object, type JsonObject } from '../lib/canvas-v2/managed-agent/protocol';
import type { DiscoveryReviewer } from '../lib/canvas-v2/codex-app-server/discovery-review';

const deferred = () => { let resolve!: () => void, reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(predicate: () => boolean) { for (let i = 0; i < 100 && !predicate(); i++) await tick(); assert.ok(predicate(), 'fixture reached its dispatch barrier'); }
async function promptly<T>(work: Promise<T>) { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Stop waited for the deliberately withheld command acknowledgement')), 150); })]); } finally { clearTimeout(timer); } }
const feedback = JSON.stringify({ question: 'Review fixture', preserve: [], argumentChecks: [], sourceChecks: [], consistencyChecks: [], work: [{ id: 'gap', priority: 'central', gap: 'A demonstrated gap remains', draftBasis: { passage: 'Draft', existingQualification: 'None' }, whyItMatters: 'It changes the answer.', reasoningToDevelop: 'Develop the missing connection.', investigation: [], resolutionSignal: 'Explain the missing connection.' }], resolvedWork: [], completionAssessment: 'Further work remains.' });

async function setup(options: { delayedStart?: number; announce?: boolean; delayedSteer?: boolean; reviewer?: DiscoveryReviewer; interruptFailure?: boolean; delayedInterrupt?: boolean } = {}) {
  const peer = await fixtureCodex(), original = peer.request.bind(peer), ack = deferred(), interruptAck = deferred();
  let blocked = false;
  peer.request = async (method, raw) => {
    const params = object(raw);
    if (method === 'turn/start') {
      peer.calls.push({ method, params }); const id = peer.turn = `turn-${++peer.count}`;
      const delayed = options.delayedStart === peer.count;
      if (!delayed || options.announce !== false) peer.emit('turn/started', { turn: { id, status: 'inProgress' } });
      if (delayed) { blocked = true; await ack.promise; }
      return { turn: { id } };
    }
    if (method === 'turn/steer' && options.delayedSteer) { peer.calls.push({ method, params }); blocked = true; await ack.promise; return { turnId: params.expectedTurnId }; }
    if (method === 'turn/interrupt') { peer.calls.push({ method, params }); if (options.interruptFailure) throw new Error('interruption transport failed'); if (options.delayedInterrupt) await interruptAck.promise; peer.emit('turn/completed', { turn: { id: params.turnId, status: 'interrupted' } }); return {}; }
    return original(method, params);
  };
  const host = new CodexSessionHost(async () => peer, async () => new Response(), { sessions: 20, perOwner: 2 }, options.reviewer);
  const transport = { owner: 'alice', key: 'fixture-key', signal: new AbortController().signal };
  const response = await host.handle({ op: 'create', requestId: 'create', model: 'gpt-5.6-luna', effort: 'high', message: 'Explain fixture' }, transport);
  const reader = response.body!.getReader();
  const identity = JSON.parse(new TextDecoder().decode((await reader.read()).value).split('data: ')[1].trim());
  await until(() => peer.count === 1);
  const handle = (body: JsonObject) => host.handle({ token: identity.token, ...body }, transport);
  const snapshot = async () => (await handle({ op: 'snapshot' })).json();
  return { peer, ack, interruptAck, host, handle, snapshot, token: identity.token, blocked: () => blocked, transport, async close() { ack.resolve(); interruptAck.resolve(); await tick(); await reader.cancel(); host.dispose(); } };
}

for (const phase of ['initial start', 'review continuation', 'steer'] as const) test(`Stop interrupts a known native turn before the delayed ${phase} acknowledgement and isolates its late ACK/events`, async () => {
  const t = await setup(phase === 'initial start' ? { delayedStart: 1 } : phase === 'review continuation' ? { delayedStart: 2, reviewer: async () => feedback } : { delayedSteer: true });
  let oldSend: Promise<Response> | undefined;
  try {
    if (phase === 'review continuation') t.peer.finish('Draft');
    if (phase === 'steer') oldSend = t.handle({ op: 'send', requestId: 'steer', message: 'Change the explanation' });
    await until(t.blocked);
    const oldId = t.peer.turn;
    // This input was queued before Stop, so it must not execute after Stop.
    const queued = t.handle({ op: 'send', requestId: 'queued-old', message: 'Do not execute this cancelled input' });
    const cancelBody = { op: 'cancel', requestId: 'stop' };
    assert.deepEqual(await (await promptly(t.handle(cancelBody))).json(), { accepted: true });
    assert.equal((await t.snapshot()).turn.status, 'cancelled');
    assert.deepEqual(t.peer.calls.filter(call => call.method === 'turn/interrupt').map(call => call.params.turnId), [oldId]);
    assert.deepEqual(await (await t.handle(cancelBody)).json(), { accepted: true }, 'duplicate Stop is idempotent');
    await t.handle({ op: 'cancel', requestId: 'another-stop-before-old-ack' });
    assert.equal(t.peer.closed, false, 'an already cancelled command must not be mistaken for a fresh unknown start');
    await t.handle({ op: 'send', requestId: 'new-explicit-input', message: 'A new explicit follow-up' });
    const current = await t.snapshot(), newId = t.peer.turn;
    assert.notEqual(newId, oldId); assert.equal(current.turn.status, 'in_progress');
    t.ack.resolve(); if (oldSend) assert.deepEqual(await (await oldSend).json(), { accepted: false });
    assert.deepEqual(await (await queued).json(), { accepted: false });
    await tick();
    t.peer.emit('turn/started', { turn: { id: oldId, status: 'inProgress' } });
    t.peer.emit('turn/completed', { turn: { id: oldId, status: 'interrupted' } });
    t.peer.receive({ id: 'late-tool', method: 'item/tool/call', params: { threadId: 'thread-fixture', turnId: oldId, callId: 'late-tool', tool: 'canvas_edit', arguments: {} } });
    const after = await t.snapshot();
    assert.equal(after.turn.id, current.turn.id); assert.equal(after.turn.status, 'in_progress');
    assert.deepEqual(after.session.required_actions, []); assert.equal(t.peer.replies.at(-1)?.result.success, false);
    await t.handle({ op: 'cancel', requestId: 'stop-new' });
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/interrupt').at(-1)?.params.turnId, newId, 'old ACK cannot overwrite the new native identity');
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/start').length, phase === 'review continuation' ? 3 : 2, 'no automatic replay or cancelled queued input');
  } finally { await t.close(); }
});

test('Stop retires an unacknowledged start without an observed native identity and ignores its late events', async () => {
  const t = await setup({ delayedStart: 1, announce: false });
  try {
    await until(t.blocked);
    assert.deepEqual(await (await promptly(t.handle({ op: 'cancel', requestId: 'stop' }))).json(), { accepted: true });
    assert.equal(t.peer.closed, true);
    await assert.rejects(t.snapshot(), { message: IDLE_SESSION_RELEASED });
    await assert.rejects(t.host.handle({ op: 'snapshot', token: t.token }, { ...t.transport, owner: 'bob' }), /unavailable/);
    t.ack.resolve(); await tick();
    t.peer.receive({ method: 'turn/started', params: { threadId: 'thread-fixture', turn: { id: 'late-turn', status: 'inProgress' } } });
    await assert.rejects(t.snapshot(), { message: IDLE_SESSION_RELEASED });
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/start').length, 1);
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/interrupt').length, 0);
  } finally { await t.close(); }
});

test('a delayed old steer rejection cannot fail the explicit follow-up after Stop', async () => {
  const t = await setup({ delayedSteer: true });
  try {
    const old = t.handle({ op: 'send', requestId: 'old-steer', message: 'Old feedback' });
    await until(t.blocked);
    await promptly(t.handle({ op: 'cancel', requestId: 'stop' }));
    await t.handle({ op: 'send', requestId: 'new-input', message: 'New request' });
    const current = await t.snapshot();
    t.ack.reject(new Error('Old steer acknowledgement failed'));
    assert.deepEqual(await (await old).json(), { accepted: false });
    assert.equal((await t.snapshot()).turn.id, current.turn.id);
    assert.equal((await t.snapshot()).turn.status, 'in_progress'); assert.equal(t.peer.closed, false);
  } finally { await t.close(); }
});

test('an uncertain interrupt retires the child instead of replaying or leaving native work running', async () => {
  const t = await setup({ interruptFailure: true });
  try {
    assert.deepEqual(await (await t.handle({ op: 'cancel', requestId: 'stop' })).json(), { accepted: true });
    assert.equal(t.peer.closed, true); await assert.rejects(t.snapshot(), { message: IDLE_SESSION_RELEASED });
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/start').length, 1);
  } finally { await t.close(); }
});


test('concurrent Stops share the interrupt barrier and do not clear a subsequent native turn', async () => {
  const t = await setup({ delayedInterrupt: true });
  try {
    const first = t.handle({ op: 'cancel', requestId: 'stop-1' });
    const second = t.handle({ op: 'cancel', requestId: 'stop-2' });
    const followup = t.handle({ op: 'send', requestId: 'new-input', message: 'New explicit request' });
    await tick();
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/interrupt').length, 1);
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/start').length, 1, 'new input waits for interruption acknowledgement');
    t.interruptAck.resolve(); await Promise.all([first, second, followup]);
    assert.equal((await t.snapshot()).turn.status, 'in_progress');
    await t.handle({ op: 'cancel', requestId: 'stop-new' });
    assert.equal(t.peer.calls.filter(call => call.method === 'turn/interrupt').at(-1)?.params.turnId, 'turn-2');
  } finally { await t.close(); }
});
