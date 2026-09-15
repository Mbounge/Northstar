import { sameNorthstarOrigin } from '@/lib/canvas-v2/request-origin';
import { northstarDiscoveryEndpoint } from '@/lib/canvas-v2/managed-agent/config';
import { canvasV2LocalCodexEvaluationAllowed } from '@/e2e/canvas-v2-deterministic-evaluation';
import { createClient } from '@/lib/supabase/server';
import { productionCodexHost } from '@/lib/canvas-v2/codex-app-server/server';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request: Request) {
  if (northstarDiscoveryEndpoint(process.env.NORTHSTAR_DISCOVERY_RUNTIME) !== '/api/canvas-v2/codex') return Response.json({ error: 'Codex discovery is not enabled.' }, { status: 404 });
  if (process.env.NORTHSTAR_WORKER_URL || process.env.VERCEL) return Response.json({ error: 'Connect through the authorized discovery worker.' }, { status: 503 });
  const localEvaluation = canvasV2LocalCodexEvaluationAllowed(request);
  if (!localEvaluation && request.headers.get('origin') && !sameNorthstarOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  let owner: string;
  if (localEvaluation) owner = 'explicit-local-canonical-evaluation';
  else {
    const client = await createClient(); const { data: { user } } = await client.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to continue.' }, { status: 401 });
    owner = user.id;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'Configure the server OpenAI API key before using Codex discovery.' }, { status: 503 });
  try {
    const text = await request.text(); if (text.length > 12_000_000) return Response.json({ error: 'Message is too large.' }, { status: 413 });
    return await productionCodexHost().handle(object(JSON.parse(text)), { owner, key, signal: request.signal });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message.replaceAll(key, '[redacted]') : 'The Codex connection failed.' }, { status: 400 }); }
}
