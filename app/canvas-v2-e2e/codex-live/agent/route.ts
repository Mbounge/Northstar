import { productionCodexHost } from '@/lib/canvas-v2/codex-app-server/server';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reportedReviews = new Set<string>();
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1' || process.env.NORTHSTAR_CODEX_LIVE_TEST !== '1') return new Response(null, { status: 404 });
  const origin = request.headers.get('origin');
  let allowed = false;
  try {
    const url = new URL(origin || '');
    allowed = ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.origin === origin && url.host === request.headers.get('host');
  } catch { /* Invalid or absent browser origin. */ }
  if (!allowed) return new Response(null, { status: 403 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'The isolated live-test server needs its API key configured.' }, { status: 503 });
  try {
    const text = await request.text();
    if (text.length > 12_000_000) return Response.json({ error: 'Message is too large.' }, { status: 413 });
    const body = object(JSON.parse(text));
    if (body.op === 'result' && body.success === false) console.warn('[Northstar live tool failure]', String(body.error).replaceAll(key, '[redacted]').slice(0, 500));
    const host = productionCodexHost();
    const options = { owner: 'explicit-local-browser-evaluation', key, signal: request.signal };
    const response = await host.handle(body, options);
    // Explicit local evaluation only: capture assistant outputs, never credentials or session tokens.
    if (body.op === 'heartbeat' && process.env.NORTHSTAR_CODEX_REVIEW_DIAGNOSTICS === '1') {
      const snapshot = await (await host.handle({ op: 'snapshot', token: body.token }, options)).json();
      const review = object(snapshot.review);
      const id = `${body.token}:${object(snapshot.turn).id}:${review.status}`;
      if (review.feedback && !reportedReviews.has(id)) {
        if (reportedReviews.size >= 100) reportedReviews.clear();
        reportedReviews.add(id);
        console.info('[Northstar local review diagnostics]', JSON.stringify(review).replaceAll(key, '[redacted]'));
      }
    }
    return response;
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message.replaceAll(key, '[redacted]') : 'The Codex connection failed.' }, { status: 400 }); }
}
