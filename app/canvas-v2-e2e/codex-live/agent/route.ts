import { productionCodexHost } from '@/lib/canvas-v2/codex-app-server/server';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reportedReviews = new Set<string>();
const proofDirectory = join(tmpdir(), `northstar-live-render-proof-${process.pid}`);
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
    // Explicit localhost evaluation only: retain the actual app-generated
    // review renders as evidence, without recording keys or session tokens.
    if (body.op === 'result' && body.success !== false && process.env.NORTHSTAR_CODEX_REVIEW_DIAGNOSTICS === '1' && Array.isArray(body.output)) {
      let capture: Record<string, unknown> | undefined;
      for (const raw of body.output) {
        const part = object(raw);
        if (part.type === 'input_text') {
          capture = undefined;
          try { const metadata = object(JSON.parse(String(part.text))); if (typeof metadata.nodeId === 'string' && /^[\w.-]{1,240}$/.test(metadata.nodeId) && (metadata.viewport || metadata.defaultState)) capture = metadata; } catch { /* Other tool output is not a render. */ }
        } else if (part.type === 'input_image' && capture) {
          const image = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(part.image_url));
          if (image && image[2].length < 10_000_000) {
            await mkdir(proofDirectory, { recursive: true });
            const path = join(proofDirectory, `${capture.nodeId}.${capture.defaultState ? 'default' : 'live'}.${image[1] === 'jpeg' ? 'jpg' : 'png'}`);
            await writeFile(path, Buffer.from(image[2], 'base64'));
            console.info('[Northstar local render proof]', path);
          }
          capture = undefined;
        }
      }
    }
    if (body.op === 'result' && body.success === false) console.warn('[Northstar live tool failure]', String(body.error).replaceAll(key, '[redacted]').slice(0, 500));
    const host = productionCodexHost();
    const options = { owner: 'explicit-local-browser-evaluation', key, signal: request.signal };
    const response = await host.handle(body, options);
    // Explicit local evaluation only: capture assistant outputs, never credentials or session tokens.
    if (body.op === 'heartbeat' && process.env.NORTHSTAR_CODEX_REVIEW_DIAGNOSTICS === '1') {
      const snapshot = await (await host.handle({ op: 'snapshot', token: body.token }, options)).json();
      const review = object(snapshot.review);
      const id = `${body.token}:${object(snapshot.turn).id}:${review.status}`;
      if ((review.feedback || ['unavailable', 'budget_exhausted'].includes(String(review.status))) && !reportedReviews.has(id)) {
        if (reportedReviews.size >= 100) reportedReviews.clear();
        reportedReviews.add(id);
        console.info('[Northstar local review diagnostics]', JSON.stringify(review).replaceAll(key, '[redacted]'));
      }
    }
    return response;
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message.replaceAll(key, '[redacted]') : 'The Codex connection failed.' }, { status: 400 }); }
}
