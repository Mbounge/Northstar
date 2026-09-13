import { object, string, type JsonObject } from '../managed-agent/protocol';

/** Adapt the real App Server wire protocol to Northstar's existing display events. */
export function codexDisplayEvents(message: JsonObject): JsonObject[] {
  const p = object(message.params), turn = object(p.turn), item = object(p.item);
  const method = string(message.method), turnId = string(p.turnId) || string(turn.id);
  const event = (type: string, fields = {}) => ({ type: `agent.session.${type}`, turn_id: turnId, ...fields });
  if (method === 'turn/started') return [event('turn.created', { turn: { id: turnId } })];
  if (method === 'turn/completed') return [event(turn.status === 'completed' ? 'turn.completed' : turn.status === 'interrupted' ? 'turn.cancelled' : 'turn.failed', { turn: { id: turnId, error: turn.error } })];
  if (method === 'item/agentMessage/delta') return [event('turn.output_text.delta', { item_id: p.itemId, delta: p.delta })];
  if (method === 'item/completed' || method === 'item/started') {
    const kind = method === 'item/completed' ? 'done' : 'added';
    if (item.type === 'agentMessage' && kind === 'done') return [event('turn.item.done', { item: { id: item.id, type: 'message', role: 'assistant', phase: item.phase, content: [{ type: 'output_text', text: item.text }] } })];
    if (item.type === 'webSearch') {
      const action = object(item.action); const actionType = string(action.type);
      const sources = (Array.isArray(item.results) ? item.results : []).map(object).filter(s => typeof s.url === 'string').map(s => ({ url: s.url, title: s.title }));
      return [event(`turn.item.${kind}`, { item: { id: item.id, type: 'web_search_call', action: { ...action, type: actionType === 'openPage' ? 'open_page' : actionType || 'search', query: action.query || item.query, sources: [...(Array.isArray(action.sources) ? action.sources : []), ...sources] } } })];
    }
  }
  if (method === 'error' && !p.willRetry) return [event('turn.failed', { error: p.error })];
  return [];
}
