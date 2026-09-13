import { issueWorkerGrant, workerOrigin } from './auth.server';

/** A small authenticated control request; prompts and image bytes never pass through it. */
export async function workerConnection(request: Request, options: {
  env: NodeJS.ProcessEnv; authorize: () => Promise<string | undefined>;
}): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Origin' } });
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) return json({ error: 'Invalid origin.' }, 403);
  const owner = await options.authorize();
  if (!owner) return json({ error: 'Sign in to continue.' }, 401);
  const env = options.env;
  if (!env.NORTHSTAR_WORKER_URL) return env.VERCEL
    ? json({ error: 'The discovery worker is not configured for this deployment.' }, 503)
    : json({ transport: 'local' });
  try {
    const development = env.NODE_ENV !== 'production';
    const audience = workerOrigin(env.NORTHSTAR_WORKER_URL, development);
    workerOrigin(origin, development);
    return json({ transport: 'worker', endpoint: `${audience}/v1/codex`, ...issueWorkerGrant(owner, origin, audience, env.NORTHSTAR_WORKER_SECRET || '') });
  } catch { return json({ error: 'The discovery worker connection is not configured correctly.' }, 503); }
}
