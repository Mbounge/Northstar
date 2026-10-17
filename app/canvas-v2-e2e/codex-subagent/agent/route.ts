import { CodexSessionHost } from '@/lib/canvas-v2/codex-app-server/server';
import { codexDiscoveryReviewer } from '@/lib/canvas-v2/codex-app-server/discovery-review';
import { NORTHSTAR_AGENT_INSTRUCTIONS, NORTHSTAR_AGENT_TOOLS } from '@/lib/canvas-v2/managed-agent/config';
import { NORTHSTAR_CREATIVE_TOOLS } from '@/lib/canvas-v2/creative/tools';
import type { DynamicToolSpec } from '@/lib/canvas-v2/codex-app-server/generated/v2/DynamicToolSpec';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
import { readNorthstarSource } from '@/lib/canvas-v2/agent-source.server';
import { subagentCodex, SUBAGENT_TEST_KEY, SubagentLocalCreativeRuntime } from '../relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const state = globalThis as typeof globalThis & { northstarSubagentHost?: CodexSessionHost; northstarSubagentHostVersion?: number };
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return new Response(null, { status: 404 });
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || request.headers.get('origin') !== url.origin) return new Response(null, { status: 403 });
  const ownerSuffix = url.searchParams.get('owner') || '';
  if (ownerSuffix && !/^[A-Za-z0-9_-]{16,80}$/.test(ownerSuffix)) return Response.json({ error: 'Invalid local test owner.' }, { status: 400 });
  const owner = `local-subagent-evaluation${ownerSuffix ? `:${ownerSuffix}` : ''}`;
  try {
    const text = await request.text();
    if (text.length > 12_000_000) return Response.json({ error: 'Message is too large.' }, { status: 413 });
    // Versioned test-only host: no customer sessions use this transport.
    if (state.northstarSubagentHostVersion !== 10) { state.northstarSubagentHost?.dispose(); state.northstarSubagentHost = undefined; state.northstarSubagentHostVersion = 10; }
    const reviewer = codexDiscoveryReviewer(() => subagentCodex(), 300_000);
    const host = state.northstarSubagentHost ??= new CodexSessionHost(
      () => subagentCodex(),
      readNorthstarSource,
      { sessions: 4, perOwner: 1 },
      reviewer,
      3,
      (_key, model) => new SubagentLocalCreativeRuntime(model),
      300_000, // Manual subscription-agent dispatch; production stays at 45 seconds.
    );
    CodexSessionHost.prototype.configureReviewer.call(host, reviewer);
    CodexSessionHost.prototype.configureCreativeFactory.call(host, (_key, model) => new SubagentLocalCreativeRuntime(model));
    const tools = [...NORTHSTAR_AGENT_TOOLS.filter(t => 'name' in t), ...NORTHSTAR_CREATIVE_TOOLS].map(t => ({ type: 'function', name: t.name, description: t.description, inputSchema: t.parameters })) as DynamicToolSpec[];
    host.configure(NORTHSTAR_AGENT_INSTRUCTIONS, tools);
    return await host.handle(object(JSON.parse(text)), { owner, key: SUBAGENT_TEST_KEY, signal: request.signal });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Subagent test failed.' }, { status: 400 }); }
}
