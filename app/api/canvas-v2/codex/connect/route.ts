import { createClient } from '@/lib/supabase/server';
import { northstarDiscoveryEndpoint } from '@/lib/canvas-v2/managed-agent/config';
import { workerConnection } from '@/lib/canvas-v2/worker/connect.server';
import { canvasV2LocalCodexEvaluationAllowed } from '@/e2e/canvas-v2-deterministic-evaluation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (northstarDiscoveryEndpoint(process.env.NORTHSTAR_DISCOVERY_RUNTIME) !== '/api/canvas-v2/codex') return Response.json({ error: 'Codex discovery is not enabled.' }, { status: 404 });
  return workerConnection(request, { env: process.env, authorize: async () => {
    // Keep the explicitly enabled, loopback-only evaluation path; never issue a remote grant for it.
    if (!process.env.NORTHSTAR_WORKER_URL && !process.env.VERCEL && canvasV2LocalCodexEvaluationAllowed(request)) return 'explicit-local-canonical-evaluation';
    const client = await createClient(); const { data: { user } } = await client.auth.getUser();
    return user?.id;
  } });
}
