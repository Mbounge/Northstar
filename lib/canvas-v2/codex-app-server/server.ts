import { randomUUID, createHash } from 'node:crypto';
import { NORTHSTAR_AGENT_INSTRUCTIONS, NORTHSTAR_AGENT_TOOLS } from '../managed-agent/config';
import { object, string, type JsonObject } from '../managed-agent/protocol';
import { readNorthstarSource } from '../agent-source.server';
import { codexInput, validateCodexInput } from './input.server';
import { codexDisplayEvents } from './events';
import { spawnCodex, type CodexTransport } from './rpc.server';
import type { DynamicToolSpec } from './generated/v2/DynamicToolSpec';
import type { DynamicToolCallResponse } from './generated/v2/DynamicToolCallResponse';
import type { TurnSteerParams } from './generated/v2/TurnSteerParams';

type PendingTool = { rpcId: string | number; action: JsonObject };
type Session = {
  id: string; owner: string; token: string; rpc: CodexTransport; threadId: string;
  turn: JsonObject; events: JsonObject[]; items: Map<string, JsonObject>; pending: Map<string, PendingTool>;
  listeners: Set<(e: JsonObject) => void>; receipts: Map<string, { fingerprint: string; work: Promise<unknown> }>;
  commands: Promise<unknown>; lastUse: number; disconnectedAt?: number; closed: boolean;
};
const functions = NORTHSTAR_AGENT_TOOLS.filter(t => 'name' in t);
const tools = functions.map(t => ({ type: 'function', name: t.name, description: t.description, inputSchema: t.parameters })) as DynamicToolSpec[];
const encoder = new TextEncoder();

/** A single persistent Node worker owns its private child processes. No serverless deployment. */
export class CodexSessionHost {
  private configuration = { instructions: NORTHSTAR_AGENT_INSTRUCTIONS, tools };
  configure(instructions: string, dynamicTools: DynamicToolSpec[]) { this.configuration = { instructions, tools: dynamicTools }; }
  private sessions = new Map<string, Session>();
  private creations = new Map<string, { fingerprint: string; work: Promise<Session> }>();
  private starting = new Map<string, number>();
  private reaper: ReturnType<typeof setInterval>;
  constructor(private factory: () => Promise<CodexTransport>, private sourceReader: typeof readNorthstarSource = readNorthstarSource) {
    this.reaper = setInterval(() => {
      const now = Date.now();
      for (const s of this.sessions.values()) {
        if (now - s.lastUse > 30 * 60_000 || (s.disconnectedAt && now - s.disconnectedAt > 30_000 && s.turn.status === 'in_progress')) this.close(s);
      }
    }, 5000); this.reaper.unref();
  }
  dispose() { clearInterval(this.reaper); for (const s of this.sessions.values()) this.close(s); }
  private close(s: Session, message = 'The Codex connection expired. Start a new conversation.') {
    if (s.closed) return; s.closed = true;
    this.emit(s, { type: 'agent.session.turn.failed', error: { message } });
    s.rpc.close(); this.sessions.delete(s.token);
    for (const [key, value] of this.creations) void value.work.then(v => { if (v === s) this.creations.delete(key); }).catch(() => undefined);
  }
  private emit(s: Session, raw: JsonObject) {
    const e = { ...raw, session_id: s.id, event_id: randomUUID() };
    if (raw.type === 'agent.session.turn.created') { s.events = []; s.items.clear(); s.pending.clear(); s.turn = { id: object(raw.turn).id, status: 'in_progress' }; }
    if (raw.type === 'agent.session.turn.item.done') { const item = object(raw.item); s.items.set(string(item.id), { ...item, turn_id: raw.turn_id, status: 'completed' }); }
    if (raw.type === 'agent.session.turn.output_text.delta' || raw.type === 'agent.session.turn.output_text.done') {
      const id = string(raw.item_id), previous = s.items.get(id); const text = string(object((previous?.content as unknown[] | undefined)?.[0]).text);
      s.items.set(id, { id, turn_id: raw.turn_id, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: raw.type.endsWith('.delta') ? text + string(raw.delta) : raw.text }] });
    }
    const terminal: Record<string, string> = { 'agent.session.turn.completed': 'completed', 'agent.session.turn.cancelled': 'cancelled', 'agent.session.turn.failed': 'failed' };
    if (terminal[string(raw.type)]) { s.turn = { ...s.turn, status: terminal[string(raw.type)], error: raw.error || object(raw.turn).error }; s.pending.clear(); }
    s.events.push(e); if (s.events.length > 4000) s.events.splice(0, s.events.length - 4000);
    for (const listener of s.listeners) listener(e);
  }
  private async create(owner: string, key: string, body: JsonObject): Promise<Session> {
    validateCodexInput(body);
    // Each conversation owns a fixed configuration; new conversations use current code even after HMR.
    const configuration = this.configuration;
    const toolNames = new Set(configuration.tools.flatMap(tool => tool.type === 'function' ? [tool.name] : []));
    if (body.model !== 'gpt-5.6-luna') throw new Error('This preview supports GPT-5.6 Luna only. No model substitution was made.');
    if ([...this.sessions.values()].filter(s => s.owner === owner).length + (this.starting.get(owner) || 0) >= 2 || this.sessions.size + [...this.starting.values()].reduce((a, b) => a + b, 0) >= 20) throw new Error('Close an existing discovery conversation before starting another.');
    this.starting.set(owner, (this.starting.get(owner) || 0) + 1);
    let rpc: CodexTransport;
    try { rpc = await this.factory(); } finally { const left = (this.starting.get(owner) || 1) - 1; if (left) this.starting.set(owner, left); else this.starting.delete(owner); }
    const s: Session = { id: randomUUID(), owner, token: randomUUID(), rpc, threadId: '', turn: {}, events: [], items: new Map(), pending: new Map(), listeners: new Set(), receipts: new Map(), commands: Promise.resolve(), lastUse: Date.now(), disconnectedAt: Date.now(), closed: false };
    this.sessions.set(s.token, s);
    rpc.onClose(() => { if (!s.closed) { this.emit(s, { type: 'agent.session.turn.failed', error: { message: 'The Codex process stopped. Start a new conversation.' } }); this.close(s); } });
    rpc.onMessage(message => {
      const p = object(message.params);
      if (p.threadId && p.threadId !== s.threadId) return;
      if (message.method === 'item/tool/call' && message.id !== undefined) {
        if (!toolNames.has(string(p.tool))) { rpc.reply(message.id as string | number, { success: false, contentItems: [{ type: 'inputText', text: 'This tool is unavailable in Northstar.' }] }); return; }
        const action = { name: p.tool, arguments: p.arguments, call_id: p.callId, turn_id: p.turnId };
        s.pending.set(string(p.callId), { rpcId: message.id as string | number, action });
        this.emit(s, { type: 'agent.session.requires_action', session: { required_actions: [action] } }); return;
      }
      if (message.id !== undefined && message.method) { rpc.reject(message.id as string | number, 'This operation is not enabled in Northstar.'); return; }
      for (const e of codexDisplayEvents(message)) this.emit(s, e);
    });
    try {
      await rpc.request('initialize', { clientInfo: { name: 'northstar', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      rpc.notify('initialized', {});
      await rpc.request('account/login/start', { type: 'apiKey', apiKey: key });
      let cursor: unknown = null; let model: JsonObject | undefined;
      for (let page = 0; page < 10; page++) {
        const result = await rpc.request('model/list', { limit: 100, includeHidden: true, cursor });
        model = (Array.isArray(result.data) ? result.data : []).map(object).find(m => m.model === body.model);
        if (model || !result.nextCursor) break; cursor = result.nextCursor;
      }
      if (!model || !(Array.isArray(model.supportedReasoningEfforts) && model.supportedReasoningEfforts.some(e => object(e).reasoningEffort === 'high'))) throw new Error('The configured Codex account does not advertise Luna High. No model substitution was made.');
      if (Array.isArray(model.inputModalities) && !model.inputModalities.includes('image')) throw new Error('This Codex model does not support the required image input.');
      const thread = await rpc.request('thread/start', { model: body.model, allowProviderModelFallback: false, cwd: rpc.cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true, developerInstructions: configuration.instructions, dynamicTools: configuration.tools, config: { 'features.shell_tool': false, 'features.multi_agent': false, 'features.code_mode': false, web_search: 'live' } });
      s.threadId = string(object(thread.thread).id); if (!s.threadId) throw new Error('Codex did not create a thread.');
      return s;
    } catch (error) { this.close(s); throw error; }
  }
  private once(s: Session, body: JsonObject, execute: () => Promise<unknown>) {
    const id = `${body.op}:${string(body.requestId)}`;
    if (!body.requestId) throw new Error('A request identity is required.');
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const previous = s.receipts.get(id);
    if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('Request identity was reused with different input.'); return previous.work; }
    if (s.receipts.size >= 2000) throw new Error('This conversation has reached its operation limit. Start a new conversation.');
    const work = execute(); s.receipts.set(id, { fingerprint, work }); return work;
  }
  private input(s: Session, body: JsonObject) {
    const work = s.commands.then(async () => {
      if (s.closed) throw new Error('This Codex conversation is closed.');
      const input = await codexInput(body, s.rpc.cwd);
      if (s.turn.status === 'in_progress') {
        const params: TurnSteerParams = { threadId: s.threadId, expectedTurnId: string(s.turn.id), clientUserMessageId: string(body.requestId), input };
        // A rejected steer is returned, never blindly resubmitted as a new turn.
        await s.rpc.request('turn/steer', params);
      } else {
        const result = await s.rpc.request('turn/start', { threadId: s.threadId, input, model: 'gpt-5.6-luna', effort: 'high' });
        if (!s.turn.id || s.turn.id !== object(result.turn).id) this.emit(s, { type: 'agent.session.turn.created', turn: { id: object(result.turn).id } });
      }
      return { accepted: true };
    });
    const guarded = work.catch(error => { this.close(s, 'Codex could not accept the input reliably. The process was stopped; start a new conversation.'); throw error; });
    s.commands = guarded.catch(() => undefined); return guarded;
  }
  private stream(s: Session, identity: boolean, signal: AbortSignal) {
    let remove = () => {};
    return new Response(new ReadableStream<Uint8Array>({ start: controller => {
      s.disconnectedAt = undefined;
      const send = (e: JsonObject) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { remove(); } };
      const keepalive = setInterval(() => { try { controller.enqueue(encoder.encode(': connected\n\n')); } catch { remove(); } }, 15_000); keepalive.unref();
      remove = () => { clearInterval(keepalive); s.listeners.delete(send); if (!s.listeners.size) s.disconnectedAt = Date.now(); signal.removeEventListener('abort', abort); };
      const abort = () => { remove(); try { controller.close(); } catch { /* already disconnected */ } };
      signal.addEventListener('abort', abort, { once: true });
      if (identity) send({ type: 'northstar.session', sessionId: s.id, token: s.token });
      // Reconnect recovery obtains a snapshot; replaying old deltas would duplicate text.
      if (identity) for (const e of s.events) send(e);
      s.listeners.add(send); if (signal.aborted) abort();
    }, cancel: () => remove() }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  }
  async handle(body: JsonObject, options: { owner: string; key: string; signal: AbortSignal }): Promise<Response> {
    const { owner, key, signal } = options;
    if (body.op === 'create') {
      if (!body.requestId) throw new Error('A request identity is required.');
      const id = `${owner}:${string(body.requestId)}`, fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      let entry = this.creations.get(id);
      if (entry && entry.fingerprint !== fingerprint) throw new Error('Creation identity was reused with different input.');
      if (!entry && this.creations.size >= 2000) throw new Error('This server has reached its session startup limit. Restart the discovery worker.');
      if (!entry) { entry = { fingerprint, work: this.create(owner, key, body) }; this.creations.set(id, entry); }
      const s = await entry.work;
      if (signal.aborted) { this.close(s); throw new Error('Session startup was cancelled.'); }
      const response = this.stream(s, true, signal);
      void this.once(s, body, () => this.input(s, body)).catch(error => this.emit(s, { type: 'agent.session.turn.failed', error: { message: error instanceof Error ? error.message.replaceAll(key, '[redacted]') : 'Codex could not start the turn.' } }));
      return response;
    }
    const s = this.sessions.get(string(body.token));
    if (!s || s.owner !== owner || s.closed) throw new Error('This Codex session is unavailable. Start a new conversation.');
    s.lastUse = Date.now();
    if (body.op === 'close') { this.close(s, 'Conversation closed.'); return Response.json({ accepted: true }); }
    if (body.op === 'stream') return this.stream(s, false, signal);
    if (body.op === 'snapshot') return Response.json({ session: { required_actions: [...s.pending.values()].map(v => v.action) }, turn: s.turn, items: [...s.items.values()] });
    if (body.op === 'read') {
      const pending = s.pending.get(string(body.callId));
      if (!pending || pending.action.turn_id !== body.turnId || !['read_source', 'inspect_image'].includes(string(pending.action.name))) throw new Error('This source read is no longer pending.');
      return this.sourceReader(pending.action, signal);
    }
    if (body.op === 'send') return Response.json(await this.once(s, body, () => this.input(s, body)));
    if (body.op === 'cancel') return Response.json(await this.once(s, body, async () => {
      await s.commands;
      if (s.turn.status === 'in_progress') await s.rpc.request('turn/interrupt', { threadId: s.threadId, turnId: s.turn.id });
      return { accepted: true };
    }));
    if (body.op === 'result') return Response.json(await this.once(s, body, async () => {
      const pending = s.pending.get(string(body.callId));
      if (!pending || pending.action.turn_id !== body.turnId) return { accepted: false };
      const raw = body.success === false ? [{ type: 'input_text', text: string(body.error).slice(0, 2000) }] : Array.isArray(body.output) ? body.output : [{ type: 'input_text', text: typeof body.output === 'string' ? body.output : JSON.stringify(body.output) }];
      if (JSON.stringify(raw).length > 10_000_000) throw new Error('Tool output exceeds the transport limit.');
      const contentItems: DynamicToolCallResponse['contentItems'] = raw.map(v => { const part = object(v); return part.type === 'input_image' ? { type: 'inputImage', imageUrl: string(part.image_url) } : { type: 'inputText', text: string(part.text) }; });
      s.rpc.reply(pending.rpcId, { success: body.success !== false, contentItems } satisfies DynamicToolCallResponse); s.pending.delete(string(body.callId));
      return { accepted: true };
    }));
    throw new Error('Unknown Codex operation.');
  }
}
const globalHost = globalThis as typeof globalThis & { northstarCodexHost?: CodexSessionHost };
export function productionCodexHost() {
  if (globalHost.northstarCodexHost && typeof globalHost.northstarCodexHost.configure !== 'function') {
    globalHost.northstarCodexHost.dispose(); globalHost.northstarCodexHost = undefined;
  }
  const host = globalHost.northstarCodexHost ??= new CodexSessionHost(() => spawnCodex(process.env.NORTHSTAR_CODEX_BINARY || 'codex'));
  host.configure(NORTHSTAR_AGENT_INSTRUCTIONS, tools);
  return host;
}
