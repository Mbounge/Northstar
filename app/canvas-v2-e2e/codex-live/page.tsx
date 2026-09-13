import { notFound } from 'next/navigation';
import { CanvasV2Workspace } from '@/components/canvas-v2/canvas-v2-workspace';
export default function CodexLivePage() {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1' || process.env.NORTHSTAR_CODEX_LIVE_TEST !== '1') notFound();
  return <CanvasV2Workspace agentEndpoint="/canvas-v2-e2e/codex-live/agent" />;
}
