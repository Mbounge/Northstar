import type { CanvasV2Activity } from '../tool-activity';

export type JsonObject = Record<string, unknown>;
export const object = (v: unknown): JsonObject => v && typeof v === 'object' && !Array.isArray(v) ? v as JsonObject : {};
export const string = (v: unknown) => typeof v === 'string' ? v : '';
export interface AgentText { id: string; text: string; phase?: string }
export interface AgentView {
  sessionId?: string; turnId?: string; status: 'idle' | 'running' | 'completed' | 'stopped' | 'failed';
  texts: AgentText[]; activity: CanvasV2Activity[]; seen: string[]; error?: string;
}
export const emptyAgentView = (): AgentView => ({ status: 'idle', texts: [], activity: [], seen: [] });

/** Events are receipts, not an invitation to run tools. Only required_actions schedules execution. */
export function reduceAgentEvent(previous: AgentView, raw: unknown): AgentView {
  const e = object(raw), type = string(e.type), eventId = string(e.event_id);
  if (previous.sessionId && e.session_id && previous.sessionId !== e.session_id) return previous;
  if (eventId && previous.seen.includes(eventId)) return previous;
  const turn = object(e.turn), item = object(e.item);
  if (turn.subagent_id || e.subagent_id) return previous;
  const turnId = string(e.turn_id) || string(turn.id);
  if (previous.turnId && turnId && previous.turnId !== turnId && type !== 'agent.session.turn.created') return previous;
  const state = { ...previous, texts: [...previous.texts], activity: [...previous.activity], seen: eventId ? [...previous.seen, eventId].slice(-4000) : previous.seen };
  state.sessionId ||= string(e.session_id) || string(object(e.session).id) || undefined;
  const activity = (id: string, value: Partial<CanvasV2Activity>) => {
    const before = state.activity.find(a => a.id === id);
    const next: CanvasV2Activity = { id, requestId: state.turnId || '', sequence: (before?.sequence ?? 0) + 1, at: new Date().toISOString(), kind: 'activity', label: 'Working', ...before, ...value };
    state.activity = before ? state.activity.map(a => a.id === id ? next : a) : [...state.activity, next];
  };
  const text = (id: string, value: string, delta: boolean, phase?: string) => {
    const before = state.texts.find(t => t.id === id);
    const next = { id, text: delta ? (before?.text ?? '') + value : value, phase: phase || before?.phase };
    state.texts = before ? state.texts.map(t => t.id === id ? next : t) : [...state.texts, next];
    activity(`message:${id}`, { kind: 'progress', label: '', detail: next.text });
  };
  if (type === 'agent.session.turn.created') { state.turnId = turnId; state.status = 'running'; }
  if (type === 'agent.session.turn.output_text.delta' || type === 'agent.session.turn.output_text.done') {
    text(`${string(e.item_id)}:${Number(e.content_index ?? 0)}`, string(type.endsWith('.delta') ? e.delta : e.text), type.endsWith('.delta'));
  }
  if (type === 'agent.session.turn.item.done' || type === 'agent.session.turn.item.added') {
    const id = string(item.id);
    if (item.type === 'message' && item.role === 'assistant' && Array.isArray(item.content)) {
      item.content.forEach((part, i) => { const p = object(part); if (p.type === 'output_text') text(`${id}:${i}`, string(p.text), false, string(item.phase)); });
    }
    if (item.type === 'web_search_call') {
      const action = object(item.action);
      const urls = [...(Array.isArray(action.sources) ? action.sources : []), ...(action.url ? [{ url: action.url }] : [])];
      const sources = urls.flatMap(v => { const s = object(v); try { const u = new URL(string(s.url)); return ['https:', 'http:'].includes(u.protocol) ? [{ href: u.href, label: string(s.title) || u.hostname }] : []; } catch { return []; } });
      activity(id, { tool: action.type === 'search' ? 'web-search' : 'web-page', label: action.type === 'search' ? 'Searched the web' : 'Read a source', detail: string(action.query) || (Array.isArray(action.queries) ? action.queries.join(' · ') : '') || string(action.url), status: type.endsWith('.done') ? 'completed' : 'started', sources });
    }
  }
  if (type === 'agent.session.turn.completed') state.status = 'completed';
  if (type === 'agent.session.turn.cancelled') state.status = 'stopped';
  if (['error', 'agent.session.failed', 'agent.session.turn.failed', 'agent.session.environment.failed'].includes(type)) {
    state.status = 'failed'; state.error = string(object(e.error).message) || string(object(turn.error).message) || 'The agent could not finish this turn.';
  }
  return state;
}

/** SSE framing supports split UTF-8, CRLF, multiline data and a final frame without a blank line. */
export async function readAgentEvents(body: ReadableStream<Uint8Array>, receive: (event: unknown) => void | Promise<void>, signal?: AbortSignal) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  const frame = async (value: string) => {
    const data = value.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (data && data !== '[DONE]') await receive(JSON.parse(data));
  };
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }); buffer = buffer.replace(/\r\n/g, '\n');
      if (buffer.length > 12_000_000) throw new Error('Agent event exceeded the transport limit.');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) { const next = buffer.slice(0, end); buffer = buffer.slice(end + 2); await frame(next); }
      if (done) { if (buffer.trim()) await frame(buffer); break; }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
