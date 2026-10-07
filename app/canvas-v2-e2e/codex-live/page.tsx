import { notFound } from 'next/navigation';
import { CanvasV2Workspace } from '@/components/canvas-v2/canvas-v2-workspace';
export default async function CodexLivePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1' || process.env.NORTHSTAR_CODEX_LIVE_TEST !== '1') notFound();
  const accountEndpoint = (await searchParams).account === 'fixture' ? '/canvas-v2-e2e/codex/account' : '/api/canvas-v2/account';
  return <CanvasV2Workspace accountEndpoint={accountEndpoint} agentEndpoint="/canvas-v2-e2e/codex-live/agent" />;
}
