import { notFound } from 'next/navigation';
import { CanvasV2Workspace } from '@/components/canvas-v2/canvas-v2-workspace';
export default async function CodexFixturePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  const accountEndpoint = (await searchParams).account === 'live' ? '/api/canvas-v2/account' : '/canvas-v2-e2e/codex/account';
  return <CanvasV2Workspace accountEndpoint={accountEndpoint} agentEndpoint="/canvas-v2-e2e/codex/agent" designEndpoint="/canvas-v2-e2e/design" routerEndpoint="/canvas-v2-e2e/route" researchEndpoint="/canvas-v2-e2e/research" />;
}
