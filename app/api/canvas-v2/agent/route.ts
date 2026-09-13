import { createClient } from '@/lib/supabase/server';
import { handleManagedRequest } from '@/lib/canvas-v2/managed-agent/server';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request: Request) {
  if (process.env.NORTHSTAR_DISCOVERY_RUNTIME !== 'agents') return Response.json({ error: 'Managed discovery is not enabled.' }, { status: 404 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in to continue.' }, { status: 401 });
  const owner = user.id;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'The server needs an OpenAI key with Agents API access.' }, { status: 503 });
  try {
    const text = await request.text();
    if (text.length > 12_000_000) return Response.json({ error: 'Message is too large.' }, { status: 413 });
    return await handleManagedRequest(object(JSON.parse(text)), { owner, key, signal: request.signal });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The agent connection failed.' }, { status: 400 });
  }
}
