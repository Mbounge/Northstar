import { object, string } from '../managed-agent/protocol';
type Connection = { transport: 'local' } | { transport: 'worker'; endpoint: string; accessToken: string; expiresAt: number };

/** Refresh account authorization without reissuing a model turn or moving its session. */
export function codexWorkerFetch(fetcher: typeof fetch = fetch, now = Date.now): typeof fetch {
  let connection: Connection | undefined;
  let pending: Promise<Connection> | undefined;
  let sessionEndpoint: string | undefined;
  const connect = async (): Promise<Connection> => {
    if (connection && (connection.transport === 'local' || connection.expiresAt > now() + 30_000)) return connection;
    return pending ??= (async () => {
      const response = await fetcher('/api/canvas-v2/codex/connect', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const value = object(await response.json());
      if (!response.ok) throw new Error(string(value.error) || 'Could not authorize the discovery worker.');
      let next: Connection;
      if (value.transport === 'local') next = { transport: 'local' };
      else {
        const url = new URL(string(value.endpoint));
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (value.transport !== 'worker' || (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/v1/codex' || url.search || url.hash || !string(value.accessToken) || typeof value.expiresAt !== 'number' || value.expiresAt <= now()) throw new Error('Invalid discovery worker configuration.');
        next = { transport: 'worker', endpoint: url.href, accessToken: string(value.accessToken), expiresAt: value.expiresAt };
      }
      const endpoint = next.transport === 'local' ? '/api/canvas-v2/codex' : next.endpoint;
      if (sessionEndpoint && endpoint !== sessionEndpoint) throw new Error('The discovery worker changed. Start a new conversation to connect to it.');
      sessionEndpoint = endpoint; connection = next; return next;
    })().finally(() => { pending = undefined; });
  };
  return async (input, init) => {
    if (String(input) !== '/api/canvas-v2/codex') return fetcher(input, init);
    const send = async (target: Connection) => {
      init?.signal?.throwIfAborted();
      if (target.transport === 'local') return fetcher(input, init);
      const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${target.accessToken}`);
      return fetcher(target.endpoint, { ...init, headers, credentials: 'omit', redirect: 'error' });
    };
    let target = await connect();
    let response = await send(target);
    // A 401 is issued before dispatch. Network failures are never blindly retried here.
    if (response.status === 401 && target.transport === 'worker') {
      await response.body?.cancel(); connection = undefined; target = await connect(); response = await send(target);
    }
    return response;
  };
}
