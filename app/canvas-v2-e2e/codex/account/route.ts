import { parseAccountQuery, readAccountTools } from '@/lib/canvas-v2/account-tools';
import { CANVAS_V2_E2E_APPS, CANVAS_V2_E2E_EVIDENCE_PACKETS } from '../../research-fixture';
import type { CanvasV2EvidenceProvider } from '@/lib/canvas-v2/evidence-bridge';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return new Response(null, { status: 404 });
  const provider: CanvasV2EvidenceProvider = {
    descriptor: { id: 'fixture-account', label: 'Fixture account', domains: ['marketing', 'business'], kinds: ['marketing-signal', 'business-record'] },
    async retrieve(query) {
      const packets = CANVAS_V2_E2E_EVIDENCE_PACKETS.initial.filter(p => query.domains.includes(p.kind === 'marketing-signal' ? 'marketing' : 'business'));
      return { provider: this.descriptor, packets, sources: packets.map(p => p.source), issues: [] };
    },
  };
  return Response.json({ result: await readAccountTools({ tenantId: 'fixture', apps: CANVAS_V2_E2E_APPS }, parseAccountQuery(await request.json()), provider) });
}
