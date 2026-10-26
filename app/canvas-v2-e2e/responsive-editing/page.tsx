import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { CanvasV2Workspace } from '@/components/canvas-v2/canvas-v2-workspace';
import { encodeCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import { CANVAS_V2_ARTIFACT_SCHEMA } from '@/lib/canvas-v2/types';
import { normalizeCanvasV2NativeGeometryDocument } from '@/lib/canvas-v2/native-geometry-document';
import { CANVAS_V2_WORKSPACE } from '@/lib/canvas-v2/workspace-coordinate-space';
import type { NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';

/** A populated real workspace, without live accounts, models or campaign data. */
export const dynamic = 'force-dynamic';

export default async function ResponsiveEditingFixture() {
  if(process.env.NORTHSTAR_E2E!=='1')notFound();
  if(process.env.NODE_ENV==='production'){
    const host=(await headers()).get('host')??'';
    if(process.env.NORTHSTAR_LOCAL_PRODUCTION_PROBE!=='1'||!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(host))notFound();
  }
  const nodes=Array.from({length:52},(_,index)=>{
    const title=index?'Studio object '+index:'Campaign · responsive headline';
    const source=encodeCanvasV2Screen({version:1,device:'none',title,width:600,height:700,referenceAssetIds:[],
      html:'<main><div class="art"></div><h1><span class="first">YOUR BEST.</span><span class="second">IS YOURS.</span></h1><p>Make room for your next idea.</p><label>Private draft<input id="draft" value="Keep this draft"></label><button id="save">Save</button><output id="status">Saved 0</output></main>',
      css:'body{margin:0;color:white;background:#171522;font:16px Arial,sans-serif}main{position:relative;width:600px;min-height:700px;padding:32px}.art{height:230px;border-radius:12px;background:radial-gradient(ellipse at 30% 40%,#a997f2,transparent 65%),linear-gradient(45deg,#323050,#151320)}h1{margin:20px 0;width:500px;font-size:54px;line-height:1.05}h1 span{display:block;white-space:nowrap}.first{color:#fff}.second{font-size:68px}p{line-height:1.5}input,button{display:block;font:inherit;padding:10px;margin-top:8px}output{display:block;margin-top:12px}',
      javascript:'let saves=0;window.fixtureBoot=Math.random();document.querySelector("#save").onclick=()=>document.querySelector("#status").textContent="Saved "+(++saves);'});
    return `<div data-canvas-v2-node-id="studio-${index}" data-canvas-v2-screen="${source}" style="position:absolute;left:${index%8*680}px;top:${Math.floor(index/8)*780}px;width:600px;height:700px"></div>`;
  }).join('');
  const scale=.8;
  const snapshot:NorthstarSnapshot={schema:1,turns:[],draft:'',model:'gpt-5.6-sol',effort:'high',viewport:{x:420-CANVAS_V2_WORKSPACE.aiAuthoringOriginX*scale,y:110-CANVAS_V2_WORKSPACE.aiAuthoringOriginY*scale,scale},
    revision:{schema:CANVAS_V2_ARTIFACT_SCHEMA,id:'responsive-populated-seed',state:'committed',createdAt:'2026-10-25T00:00:00Z',evidence:[],document:normalizeCanvasV2NativeGeometryDocument({html:'<main data-canvas-v2-node-id="studio-root" style="position:relative;width:5500px;height:5500px">'+nodes+'</main>',css:'',javascript:''})}};
  return <CanvasV2Workspace sessionTitle="Disposable responsiveness check" initialSnapshot={snapshot} accountEndpoint="/canvas-v2-e2e/codex/account" agentEndpoint="/canvas-v2-e2e/codex/agent" designEndpoint="/canvas-v2-e2e/design" routerEndpoint="/canvas-v2-e2e/route" researchEndpoint="/canvas-v2-e2e/research"/>;
}
