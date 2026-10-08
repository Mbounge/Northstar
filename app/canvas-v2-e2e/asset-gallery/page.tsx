import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CanvasV2Workspace } from '@/components/canvas-v2/canvas-v2-workspace';
import { createCanvasV2CommittedRevision } from '@/lib/canvas-v2/revisions';
import type { NorthstarArtifact } from '@/lib/canvas-v2/creative/types';
import type { NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';

export default async function AssetGalleryFixture() {
  if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();
  const createdAt='2026-10-07T22:00:00Z';
  const labels=['folio-warm-linen-cover','folio-midnight-ink-cover','folio-expressive-colour-cover','folio-sculptural-book-cover'];
  const files=['linen','ink','colour','sculpture'];
  const artifacts:NorthstarArtifact[]=await Promise.all(labels.map(async(label,index)=>{
    const bytes=await readFile(process.env.NORTHSTAR_GALLERY_FIXTURE_DIR?join(process.env.NORTHSTAR_GALLERY_FIXTURE_DIR,`northstar-gallery-${files[index]}.png`):join(process.cwd(),'app/canvas-v2-e2e/codex/media-assets/reference.png'));
    return {id:`gallery-${index}`,label,name:label+'.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64'),bytes:bytes.length,createdAt,origin:'generated',inputAssetIds:[]};
  }));
  const snapshot:NorthstarSnapshot={schema:1,revision:createCanvasV2CommittedRevision({id:'gallery-revision',document:{html:'<main data-canvas-v2-node-id="canvas" style="position:relative;width:12000px;height:8000px"></main>',css:''},evidence:[],createdAt}),
    turns:[{id:'gallery-turn',message:'Create four cover directions for Folio.',answer:'Four cover directions, ready to explore.',status:'responded',createdAt,elapsedMs:60000,artifacts}],draft:'',model:'gpt-5.6-luna',effort:'high',viewport:{x:0,y:0,scale:0.3}};
  return <CanvasV2Workspace initialSnapshot={snapshot} agentEndpoint="/canvas-v2-e2e/codex/agent" accountEndpoint="/canvas-v2-e2e/codex/account" />;
}
