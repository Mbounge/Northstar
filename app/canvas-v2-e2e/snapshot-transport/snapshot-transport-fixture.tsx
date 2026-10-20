'use client';
import {useState} from 'react';
import {createSnapshotTransportEncoder,type SnapshotTransportRequest} from '@/lib/canvas-v2/sessions/snapshot-transport';
import {encodeSnapshot,decodeSnapshotBlob} from '@/lib/canvas-v2/sessions/snapshot';
import {unpackSnapshotText} from '@/lib/canvas-v2/sessions/snapshot-codec';
import {createCanvasV2CommittedRevision} from '@/lib/canvas-v2/revisions';
import type {NorthstarSnapshot} from '@/lib/canvas-v2/sessions/types';

type Check={name:string;passed:boolean;error?:string};
const large='Exact retained test words " / \\ 🧭\n'.repeat(2_000);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm3sAAAAASUVORK5CYII=';
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message)};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const decoded=async(blob:Blob)=>JSON.parse(await unpackSnapshotText(await blob.text()));
function initial():NorthstarSnapshot{return{
 schema:1,revision:createCanvasV2CommittedRevision({id:'same-worker-fixture-revision',createdAt:'2026-10-18T00:00:00Z',document:{html:'<div data-canvas-v2-node-id="test-words">'+large+'</div>',css:''},evidence:[]}),
 turns:[],draft:'Human test draft',model:'gpt-5.6-luna',effort:'high',viewport:{x:10,y:20,scale:.3},
 memory:{assets:[],accountPackets:[],accountFlows:[],sourceMedia:[],sourcePages:[large],compositionHistory:[],compositionSequence:1},
}}

/** Isolated DEV harness: real production encoder/worker/portable decoder.
 * Observes only this fixture's public worker envelopes. No canvas persistence,
 * account/model call, private controller state or main-board storage access. */
export function SnapshotTransportFixture(){
 const[busy,setBusy]=useState(false),[report,setReport]=useState('');
 const run=async()=>{
  setBusy(true);setReport('');const results:Check[]=[],payloads:{requestId:number;strings:number;references:number;retained:number;chars:number}[]=[];let workers=0;
  const encoder=createSnapshotTransportEncoder({createWorker:()=>{
   workers++;const port=new Worker(new URL('../../../lib/canvas-v2/sessions/snapshot-encode.worker.ts',import.meta.url));
   return{postMessage:(request:SnapshotTransportRequest)=>{payloads.push({requestId:request.requestId,strings:request.strings.length,references:request.references.length,retained:request.retainIds.length,chars:JSON.stringify(request).length});port.postMessage(request)},terminate:()=>port.terminate(),get onmessage(){return port.onmessage},set onmessage(value){port.onmessage=value},get onerror(){return port.onerror},set onerror(value){port.onerror=value}};
  }});
  const check=async(name:string,action:()=>Promise<void>)=>{try{await action();results.push({name,passed:true})}catch(error){results.push({name,passed:false,error:error instanceof Error?error.message:String(error)})}};
  let latest=initial();
  try{
   await check('Production singleton encoder and portable decoder roundtrip complete current source and memory',async()=>{const blob=await encodeSnapshot(latest);assert(same(await decodeSnapshotBlob(blob),latest),'Production portable roundtrip changed source or metadata.')});
   await check('Actual native worker receives a full first seed and saves the snapshot rather than its envelope',async()=>{assert(same(await decoded(await encoder.encode(latest,2_000_000)),latest),'First seed output changed.');assert(workers===1&&payloads[0].strings===2&&payloads[0].references===2,'First actual worker did not receive exact full seed.')});
   await check('Camera-only request omits all retained big strings while saving newest camera and draft',async()=>{latest={...latest,draft:'Newest human test draft',viewport:{x:-123,y:456,scale:.8}};assert(same(await decoded(await encoder.encode(latest,2_000_000)),latest),'Camera-only save lost newest metadata.');assert(workers===1&&payloads[1].strings===0&&payloads[1].chars<payloads[0].chars/10,'Camera request still transported retained large string bytes.')});
   await check('Same revision mutable memory replacements, deletion and ordering survive',async()=>{latest.memory!.sourcePages=[large+'new','second'];latest.memory!.compositionSequence=2;latest.memory!.assets=[{id:'test',url:png,label:'Actual1pxPNG'}];const first=await decoded(await encoder.encode(latest,2_000_000));assert(same(first,latest),'Same-ID memory update was stale.');latest.memory!.assets=[];latest.memory!.sourcePages.reverse();assert(same(await decoded(await encoder.encode(latest,2_000_000)),latest),'Memory deletion or array order was lost.')});
   await check('Concurrent requests capture mutable call-time values and serialize on one actual worker',async()=>{const beforeWorkers=workers;latest.memory!.compositionSequence=3;const firstExpected=JSON.stringify(latest),one=encoder.encode(latest,2_000_000);latest.memory!.compositionSequence=4;latest.memory!.sourcePages=[large+'four'];const secondExpected=JSON.stringify(latest),two=encoder.encode(latest,2_000_000);latest.memory!.compositionSequence=99;latest.memory!.sourcePages=[];assert(JSON.stringify(await decoded(await one))===firstExpected,'First queued call-time capture changed.');assert(JSON.stringify(await decoded(await two))===secondExpected,'Second queued call-time capture changed.');assert(workers===beforeWorkers,'Successful consecutive jobs recreated the worker.')});
   await check('Caller size failure rejects and the next actual worker fully reseeds current values',async()=>{const beforeWorkers=workers;let rejected=false;try{await encoder.encode(latest,1)}catch(error){rejected=error instanceof Error&&/limit|bytes/.test(error.message)}assert(rejected,'Caller maxBytes was ignored.');assert(same(await decoded(await encoder.encode(latest,2_000_000)),latest),'Recovery saved stale metadata.');assert(workers===beforeWorkers+1&&payloads.at(-1)!.strings>0,'Worker recovery failed to fully reseed.')});
   await check('Actual browser Blob and FileReader bytes materialize then reload through production decoder',async()=>{const bytes=Uint8Array.from(atob(png.split(',')[1]),value=>value.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));try{const value=initial();value.memory!.assets=[{id:'actual-local',url,label:'Local PNG'}];const restored=await decodeSnapshotBlob(await encodeSnapshot(value));assert(restored.memory!.assets[0].url===png,'Actual blob bytes changed.');assert(restored.revision.document.html===value.revision.document.html&&restored.draft===value.draft,'Portable reload changed source or draft.')}finally{URL.revokeObjectURL(url)}});
  }finally{encoder.dispose();setReport(JSON.stringify({date:new Date().toISOString(),results,workers,payloads,sourceChars:large.length,scope:'Isolated DEV fixture with actual production encoder, actual native Worker and portable snapshot decoder. No model calls or main-board storage writes.'},null,2));setBusy(false)}
 };
 return <main className="min-h-screen bg-white p-8 text-black"><h1 className="text-xl font-bold">Actual worker snapshot contracts</h1><p className="my-3 max-w-3xl">This isolated fixture checks current metadata, exact large strings, real worker reuse, failure recovery and portable blob reload. It does not change a saved board or contact a model.</p><button type="button" disabled={busy} onClick={()=>void run()} className="rounded border px-4 py-2">{busy?'Running actual worker contracts…':'Run actual worker snapshot contracts'}</button>{report&&<><pre data-testid="snapshot-transport-results" className="mt-4 whitespace-pre-wrap">{report}</pre><label className="mt-4 block">Exact visible snapshot transport report<textarea readOnly aria-label="Exact visible snapshot transport report" value={report} rows={20} className="block w-full border font-mono text-xs"/></label></>}</main>;
}
