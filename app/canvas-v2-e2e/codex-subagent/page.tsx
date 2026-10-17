import { notFound } from 'next/navigation';
import { CodexSubagentWorkspace } from './workspace';
import { resolveSubagentAccountEndpoint } from './account-endpoint';

export default async function SubagentTestPage({ searchParams }: { searchParams: Promise<{ account?: string; presentation?: string; recording?: string }> }) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  const params = await searchParams;
  const accountEndpoint = resolveSubagentAccountEndpoint(params.account);
  const presentation = params.presentation === '1';
  return <>
    {!presentation && <div style={{ position: 'fixed', top: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, pointerEvents: 'none', fontSize: 11, padding: '4px 8px', background: '#222', color: '#fff', borderRadius: 8 }}>Codex subagent test · image generation via built-in relay · direct paid APIs disabled</div>}
    <CodexSubagentWorkspace accountEndpoint={accountEndpoint} presentation={presentation} recording={params.recording === '1'} />
  </>;
}
