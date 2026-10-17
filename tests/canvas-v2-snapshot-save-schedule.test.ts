import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { SnapshotSaveSchedule } from '../lib/canvas-v2/sessions/snapshot-save-schedule';
function fixture(afterWrite?:()=>Promise<void>){
 let time=0,id=0,pending=0;const timers=new Map<number,{at:number;run:()=>void}>(),writes:number[]=[];
 const schedule=new SnapshotSaveSchedule(async()=>{writes.push(pending);await afterWrite?.()}, {set:((run:()=>void,ms:number)=>{timers.set(++id,{at:time+ms,run});return id}) as typeof setTimeout,clear:((id:number)=>timers.delete(id)) as unknown as typeof clearTimeout});
 return {schedule,writes,timers,request:(value:number)=>{pending=value;schedule.request()},advance:(ms:number)=>{const end=time+ms;while(true){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].run()}time=end;}};
}

test('default browser timers are invoked without rebinding their receiver to the scheduler timer object',()=>{
 const source=fs.readFileSync(new URL('../lib/canvas-v2/sessions/snapshot-save-schedule.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:{SnapshotSaveSchedule?:typeof SnapshotSaveSchedule}={};let setCalls=0,clearCalls=0;
 vm.runInNewContext(compiled,{exports,
  setTimeout:function(this:unknown){assert.equal(this,undefined);return ++setCalls},
  clearTimeout:function(this:unknown){assert.equal(this,undefined);clearCalls++},
 });
 const schedule=new exports.SnapshotSaveSchedule!(async()=>{});schedule.request();schedule.cancel();
 assert.equal(setCalls,2);assert.equal(clearCalls,2);
});

test('sixteen committed camera drags coalesce to one newest snapshot encode after quiet',()=>{
 const f=fixture();for(let drag=1;drag<=16;drag++){f.request(drag);f.advance(200)}
 assert.deepEqual(f.writes,[]);f.advance(700);assert.deepEqual(f.writes,[16]);
 assert.equal(f.timers.size,0);
});

test('continuous author/chat updates checkpoint within five seconds instead of indefinitely postponing save',()=>{
 const f=fixture();for(let tick=1;tick<=20;tick++){f.request(tick);f.advance(250)}
 assert.deepEqual(f.writes,[20]);for(let tick=21;tick<=40;tick++){f.request(tick);f.advance(250)}
 assert.deepEqual(f.writes,[20,40]);
});

test('explicit export/restore cancellation and unmount do not issue stale background saves',()=>{
 const f=fixture();f.request(1);f.schedule.cancel();f.advance(6000);assert.deepEqual(f.writes,[]);
 f.request(2);f.schedule.dispose();f.advance(6000);f.request(3);f.advance(6000);assert.deepEqual(f.writes,[]);assert.equal(f.timers.size,0);
});


test('the coalesced latest camera snapshot uses the existing encoder and retains all eight source geometries and original media strings',async()=>{
 const {encodeSnapshot,decodeSnapshot}=await import('../lib/canvas-v2/sessions/snapshot');
 const {createCanvasV2CommittedRevision}=await import('../lib/canvas-v2/revisions');
 const html=Array.from({length:8},(_,i)=>`<div data-canvas-v2-node-id="app-${i}" style="position:absolute;left:${i*500}px;top:100px;width:390px;height:844px">Source ${i}</div>`).join('');
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm3sAAAAASUVORK5CYII=';
 const snapshot={schema:1 as const,revision:createCanvasV2CommittedRevision({id:'eight',document:{html,css:''},evidence:[{id:'photo',url:png,label:'Original photo'}],createdAt:'2026-10-13T00:00:00Z'}),turns:[],draft:'Human draft',model:'gpt-5.6-luna' as const,effort:'high' as const,viewport:{x:0,y:0,scale:.48}};
 let latest=snapshot,encoding:Promise<Blob>|undefined;
 const f=fixture(async()=>{encoding=encodeSnapshot(latest);await encoding});
 for(let drag=1;drag<=16;drag++){latest={...snapshot,viewport:{x:drag*300,y:-drag*200,scale:.48}};f.request(drag);f.advance(200)}
 const currentEncoding=():Promise<Blob>|undefined=>encoding;
 assert.equal(currentEncoding(),undefined);f.advance(700);const encoded=currentEncoding();assert.ok(encoded);
 const restored=decodeSnapshot(JSON.parse(await(await encoded).text()));
 assert.deepEqual(restored.viewport,latest.viewport);assert.equal(restored.revision.document.html,html);
 assert.equal(restored.revision.evidence[0].url,png);assert.equal(restored.draft,'Human draft');
 assert.deepEqual(restored,JSON.parse(JSON.stringify(latest)));assert.deepEqual(f.writes,[16]);
});
