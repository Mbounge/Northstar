import { object, string } from '@/lib/canvas-v2/managed-agent/protocol';
export const dynamic = 'force-dynamic';
type Fixture = { stream?: ReadableStreamDefaultController<Uint8Array>; turn: string; messages: string[]; stage?: string; completed?: boolean; items: unknown[] };
const globalStore = globalThis as typeof globalThis & { northstarManagedFixtures?: Map<string, Fixture> };
const sessions = globalStore.northstarManagedFixtures ??= new Map<string, Fixture>();
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return new Response(null, { status: 404 });
  const body = object(await request.json()); let id = string(body.token);
  const creating = body.op === 'create';
  if (creating) {
    if (!string(body.message).trim()) return Response.json({ error: 'conversation-only sessions currently require initial input' }, { status: 400 });
    id = crypto.randomUUID(); sessions.set(id, { turn: '', messages: [], items: [] });
  }
  const state = sessions.get(id); if (!state) return Response.json({ error: 'Unknown fixture session' }, { status: 404 });
  const emit = (type: string, fields = {}) => { try { state.stream?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: `agent.session.${type}`, session_id: id, event_id: crypto.randomUUID(), ...fields })}\n\n`)); } catch { /* Fixture stream may have been cancelled. */ } };
  const finish = (text: string) => {
    const item = { id: `answer-${state.turn}`, turn_id: state.turn, type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text }] };
    state.items.push(item); emit('turn.item.done', { turn_id: state.turn, item }); state.completed = true;
    emit('turn.completed', { turn: { id: state.turn, subagent_id: null } });
  };
  const call = (name: string, args: unknown) => { emit('requires_action', { session: { required_actions: [{ type: 'function_call', turn_id: state.turn, call_id: `${state.turn}:${name}`, name, arguments: args }] } }); };
  if (body.op === 'stream') return new Response(new ReadableStream<Uint8Array>({ start(c) { state.stream = c; c.enqueue(new TextEncoder().encode(': connected\n\n')); }, cancel() { state.stream = undefined; } }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
  const submit = () => {
    const message = string(body.message); state.messages.push(message);
    if (state.turn && !state.completed) { finish(`**Updated with your feedback:** ${message}\n\nThe original question remains in this session.`); return; }
    state.turn = crypto.randomUUID(); state.completed = false;
    emit('turn.created', { turn: { id: state.turn, subagent_id: null } });
    emit('turn.output_text.done', { turn_id: state.turn, item_id: `progress-${state.turn}`, text: 'I found a useful distinction. I’m checking what changes the conclusion.' });
    emit('turn.item.done', { turn_id: state.turn, item: { id: `web-${state.turn}`, type: 'web_search_call', action: { type: 'search', query: 'Compare the available evidence', sources: [{ url: 'https://example.com/evidence', title: 'Example evidence' }] } } });
    if (/canvas/i.test(message)) { state.stage = 'read'; call('canvas_read', {}); }
    else if (!/hold/i.test(message)) setTimeout(() => finish(`**A clear finding.**\n\n| Evidence | Meaning |\n| --- | --- |\n| Observed result | A useful distinction |\n\nThis session has received ${state.messages.length} messages. [Inspect the source](https://example.com/evidence).`), 300);
  };
  if (creating) return new Response(new ReadableStream<Uint8Array>({ start(c) {
    state.stream = c;
    c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'northstar.session', sessionId: id, token: id })}\n\n`));
    submit();
  }, cancel() { state.stream = undefined; } }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
  if (body.op === 'send') { submit(); return Response.json({ accepted: true }); }
  if (body.op === 'result') {
    if (body.success === false) { finish(`Tool failure: ${string(body.error)}`); return Response.json({ accepted: true }); }
    if (state.stage === 'read') {
      const output = typeof body.output === 'string' ? object(JSON.parse(body.output)) : object(body.output);
      const html = string(object(output.document).html); const target = /data-canvas-v2-node-id="([^"]+)"/.exec(html)?.[1];
      state.stage = 'edit';
      call('canvas_edit', { baseRevisionId: output.baseRevisionId, summary: 'Created a native comparison', patch: JSON.stringify({ operations: [{ op: 'append-html', targetNodeId: target, html: '<section data-canvas-v2-node-id="managed-comparison" style="width:720px;padding:32px;color:#171721;background:#ffffff"><h2 data-canvas-v2-node-id="managed-title">A useful comparison</h2><p data-canvas-v2-node-id="managed-finding">The evidence changes the explanation.</p></section>' }] }) });
    } else { state.stage = undefined; finish('Created the comparison on the canvas. Each part is editable.'); }
    return Response.json({ accepted: true });
  }
  if (body.op === 'cancel') { state.completed = true; emit('turn.cancelled', { turn: { id: state.turn, subagent_id: null } }); return Response.json({ accepted: true }); }
  if (body.op === 'snapshot') return Response.json({ session: { status: state.completed ? 'idle' : 'running' }, items: state.items });
  return Response.json({ error: 'Unsupported fixture operation.' }, { status: 400 });
}
