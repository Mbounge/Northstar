import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { managedAgentConfiguration } from './config';
import { object, string, readAgentEvents } from './protocol';
import { parseCanvasV2ChatAttachments } from '../chat-attachments';
import { readNorthstarSource } from '../agent-source.server';

const API = 'https://api.openai.com/v1/agents/sessions';
export function signAgentSession(id: string, owner: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id, owner, expires: now + 30 * 86400_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verifyAgentSession(token: string, owner: string, secret: string, now = Date.now()) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw new Error('Invalid session.');
  const expected = createHmac('sha256', secret).update(payload).digest(); const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid session.');
  const data = object(JSON.parse(Buffer.from(payload, 'base64url').toString()));
  if (data.owner !== owner || Number(data.expires) <= now || !/^[\w-]+$/.test(string(data.id))) throw new Error('This session is unavailable.');
  return string(data.id);
}
export function managedInput(body: Record<string, unknown>) {
  const message = string(body.message).trim();
  if (!message || message.length > 80_000) throw new Error('Enter a message of up to 80,000 characters.');
  const attachments = parseCanvasV2ChatAttachments(body.attachments);
  return [{ role: 'user', content: [{ type: 'input_text', text: message }, ...attachments.map(a => a.kind === 'image'
    ? { type: 'input_image', image_url: a.dataUrl }
    : { type: 'input_text', text: `Attached document: ${a.name}\n${a.text}` })] }];
}
export async function handleManagedRequest(body: Record<string, unknown>, options: { owner: string; key: string; signal: AbortSignal; fetcher?: typeof fetch }) {
  const { owner, key, signal, fetcher = fetch } = options;
  const op = string(body.op);
  const requestId = string(body.requestId);
  const api = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetcher(`${API}${path}`, { method, signal, headers: {
      Authorization: `Bearer ${key}`, 'OpenAI-Beta': 'agents=v1', 'Content-Type': 'application/json',
      ...(method === 'POST' && requestId ? { 'Idempotency-Key': createHash('sha256').update(`${owner}:${op}:${requestId}`).digest('hex') } : {}),
    }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    if (!response.ok) {
      // Never echo provider bodies: they can include request contents and internal details.
      throw new Error(response.status === 401 || response.status === 403 ? 'Agents API access is unavailable. Check the server key’s agents and responses permissions.' : `The Agents API request failed (${response.status}). No replacement model was used.`);
    }
    return response;
  };
  if (op === 'create') {
    if (!requestId) throw new Error('A request identity is required.');
    // Conversation-only sessions require initial input. Stream creation so early
    // output and required actions cannot race a later event subscription.
    const upstream = await api('', 'POST', { ...managedAgentConfiguration(string(body.model)), input: managedInput(body), stream: true });
    if (!upstream.body) throw new Error('The provider did not return a creation stream.');
    let sessionId = '';
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': connected\n\n'));
        const emit = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        void readAgentEvents(upstream.body!, raw => {
          const event = object(raw);
          const id = string(object(event.session).id) || string(event.session_id) || string(object(event.turn).session_id);
          if (!sessionId && id) {
            sessionId = id;
            emit({ type: 'northstar.session', sessionId: id, token: signAgentSession(id, owner, key) });
          }
          emit(event);
        }, signal).then(() => controller.close()).catch(error => { try { controller.error(error); } catch { /* disconnected client */ } });
      },
    }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  }
  const id = verifyAgentSession(string(body.token), owner, key);
  const path = `/${encodeURIComponent(id)}`;
  if (op === 'stream') {
    const upstream = await api(`${path}/events`);
    return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  }
  if (op === 'snapshot') {
    const session = await (await api(path)).json();
    const turnId = string(body.turnId);
    const turn = turnId ? await (await api(`${path}/turns/${encodeURIComponent(turnId)}`)).json()
      : object(await (await api(`${path}/turns?order=desc&limit=1`)).json()).data;
    const currentTurn = Array.isArray(turn) ? turn[0] : turn;
    const items: unknown[] = []; let after = '';
    for (let page = 0; page < 20; page++) {
      const result = object(await (await api(`${path}/items?order=asc&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`)).json());
      const data = Array.isArray(result.data) ? result.data : []; items.push(...data);
      if (!result.has_more) return Response.json({ session, turn: currentTurn, items });
      after = string(result.last_id) || string(object(data.at(-1)).id);
      if (!after) break;
    }
    throw new Error('Saved history is too large to recover in one request.');
  }
  if (op === 'send' || op === 'cancel' || op === 'result') {
    if (!requestId) throw new Error('A request identity is required.');
    let event: Record<string, unknown>;
    if (op === 'send') event = { type: 'agent.session.input.message', input: managedInput(body) };
    else if (op === 'cancel') event = { type: 'agent.session.input.cancel' };
    else {
      const session = object(await (await api(path)).json());
      const actions = Array.isArray(session.required_actions) ? session.required_actions : [];
      if (!actions.some(a => { const v = object(a); return v.call_id === body.callId && v.turn_id === body.turnId; })) return Response.json({ accepted: false, reason: 'Tool result is no longer pending.' });
      const output = body.output;
      if (JSON.stringify(output ?? '').length > 10_000_000) throw new Error('Tool output exceeds the transport limit.');
      event = { type: 'agent.session.input.tool_result', turn_id: body.turnId, call_id: body.callId,
        ...(body.success === false ? { success: false, error: string(body.error).slice(0, 2000) } : { success: true, output: typeof output === 'string' || Array.isArray(output) ? output : JSON.stringify(output) }) };
    }
    await api(`${path}/events`, 'POST', { events: [event], idempotency_key: requestId });
    return Response.json({ accepted: true });
  }
  if (op === 'read') {
    // Execute only a pending provider-authored source tool; clients cannot use this endpoint as an arbitrary proxy.
    const session = object(await (await api(path)).json());
    const action = (Array.isArray(session.required_actions) ? session.required_actions : []).map(object).find(a => a.call_id === body.callId && a.turn_id === body.turnId);
    if (!action || !['read_source', 'inspect_image'].includes(string(action.name))) throw new Error('This source read is not pending.');
    return readNorthstarSource(action, signal);
  }
  throw new Error('Unknown agent operation.');
}
