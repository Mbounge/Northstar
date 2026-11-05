import {notFound} from 'next/navigation';
import {CodexSubagentWorkspace} from '../../codex-subagent/workspace';
import {stfxSubagentOriginals,STFX_SUBAGENT_ROOT} from './fixture';
export const dynamic='force-dynamic';
export default function Page(){
 if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();
 return <CodexSubagentWorkspace seed={stfxSubagentOriginals()} seedRootId={STFX_SUBAGENT_ROOT} agentEndpoint="/canvas-v2-e2e/codex-subagent/agent/stfx"/>;
}
