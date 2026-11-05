import examples from '@/lib/canvas-v2/stfx-accessibility-examples.json';
import {encodeCanvasV2Screen,type CanvasV2InteractiveScreen,readCanvasV2Screens} from '@/lib/canvas-v2/interactive-screen';
import {normalizeCanvasV2NativeGeometryDocument} from '@/lib/canvas-v2/native-geometry-document';
import {CANVAS_V2_ARTIFACT_SCHEMA} from '@/lib/canvas-v2/types';
import {CANVAS_V2_WORKSPACE,fitCanvasV2WorkspaceBounds} from '@/lib/canvas-v2/workspace-coordinate-space';
import type {NorthstarSnapshot} from '@/lib/canvas-v2/sessions/types';
export const STFX_SUBAGENT_ROOT='stfx-subagent-originals';
const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
/** Both columns begin with exactly the retained original source. The author
 * stand-in can change only the working copies through ordinary harness tools. */
export function stfxSubagentOriginals():NorthstarSnapshot{
 const label=(id:string,x:number,y:number,width:number,size:number,text:string)=>`<div data-canvas-v2-node-id="${id}" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${id.endsWith('-label')?30:size>=32?80:72}px;font:${size}px/1.4 Arial,sans-serif;color:var(--canvas-v2-ink,#f3f0ff)">${escape(text)}</div>`;
 let html=label('stfx-subagent-title',0,0,1900,48,'StFX / From original course pages to clearer learning')+label('stfx-subagent-scope',0,100,1850,21,'Five historical public excerpts. Left: retained original. Right: untouched working copy for the Northstar harness to repair and verify. No repairs are seeded.');
 for(const [index,example] of examples.entries()){
  const y=240+index*1200;
  html+=label(`stfx-case-${index}`,0,y,1850,32,`${index+1}. ${example.focus}`)+label(`stfx-provenance-${index}`,0,y+80,1850,17,`${example.note} Source: ${example.url}`);
  const source:CanvasV2InteractiveScreen={version:1,title:example.title,device:'none',width:880,height:820,referenceAssetIds:[],html:example.beforeHtml,css:example.beforeCss,javascript:''};
  for(const [role,x] of [['original',0],['working',980]] as const){
   html+=label(`stfx-${example.id}-${role}-label`,x,y+155,880,18,role==='original'?'BEFORE / Retained original':'AFTER / Awaiting harness repair');
   html+=`<div data-canvas-v2-node-id="stfx-${example.id}-${role}" ${role==='original'?'data-canvas-v2-locked="true"':''} data-canvas-v2-screen="${encodeCanvasV2Screen({...source,title:source.title+(role==='original'?' · Original':' · Working copy')})}" style="position:absolute;left:${x}px;top:${y+275}px;width:880px;height:820px"></div>`;
  }
 }
 const revision={schema:CANVAS_V2_ARTIFACT_SCHEMA,id:'stfx-subagent-originals-v1',state:'committed' as const,createdAt:new Date().toISOString(),evidence:[],document:normalizeCanvasV2NativeGeometryDocument({html:`<main data-canvas-v2-node-id="${STFX_SUBAGENT_ROOT}" style="position:relative;width:1900px;height:6500px">${html}</main>`,css:'',javascript:''})};
 const snapshot:NorthstarSnapshot={schema:1,revision,turns:[],draft:'',model:'gpt-5.6-luna',effort:'high',viewport:fitCanvasV2WorkspaceBounds({x:CANVAS_V2_WORKSPACE.aiAuthoringOriginX,y:CANVAS_V2_WORKSPACE.aiAuthoringOriginY,width:1900,height:1400},{width:1440,height:900},{left:350,top:100,right:24,bottom:90},32)};
 if(readCanvasV2Screens(snapshot.revision.document.html).length!==10)throw Error('StFX original fixture must contain five independent pairs.');
 return snapshot;
}
