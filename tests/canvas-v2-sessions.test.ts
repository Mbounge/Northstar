import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotQueue, decodeSnapshot, encodeSnapshot } from '../lib/canvas-v2/sessions/snapshot';
import { createCanvasV2CommittedRevision } from '../lib/canvas-v2/revisions';
import { northstarModelCapabilities, northstarRunConfig } from '../lib/canvas-v2/model-catalog';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';
import { claimSessionWriter } from '../lib/canvas-v2/sessions/writer';
import { LiveSessionChannel } from '../lib/canvas-v2/sessions/live-channel';
import type { LiveSessionState } from '../lib/canvas-v2/sessions/types';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};

test('refresh reuses its writer while a duplicated tab cannot impersonate the active writer',async()=>{
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 const held=new Set<string>();
 const locks={request:async(name:string,_options:unknown,callback:(lock:object|null)=>unknown)=>{
   const available=!held.has(name);if(available)held.add(name);
   await callback(available?{name}:null);
 }} as Pick<LockManager,'request'>;
 const original=await claimSessionWriter('session',storage,locks);
 const duplicated=await claimSessionWriter('session',storage,locks);
 assert.notEqual(duplicated,original);
 // Each real tab has its own sessionStorage copy. Restore the original copy
 // and release its document lock as the browser does when navigating.
 storage.setItem('session',original);held.delete(`northstar-writer:${original}`);
 const refreshed=await claimSessionWriter('session',storage,locks);
 assert.equal(refreshed,original);
});

test('live views receive progress and retries execute each user command once on the owner only',async()=>{
 type Port=ConstructorParameters<typeof LiveSessionChannel>[0];
 const ports:Port[]=[];
 const port=():Port=>{const p:Port={onmessage:null,close:()=>{},postMessage:data=>{for(const other of ports)if(other!==p)queueMicrotask(()=>other.onmessage?.({data} as MessageEvent));}};ports.push(p);return p;};
 let executions=0;let followerExecutions=0;let received:LiveSessionState|undefined;
 const turn=deferred();
 const state:LiveSessionState={title:'Live session',busy:true,snapshot:{schema:1,revision:createCanvasV2CommittedRevision({id:'live',document:{html:'<p data-canvas-v2-node-id="result">Live finding</p>',css:''},evidence:[],createdAt:new Date().toISOString()}),turns:[],draft:'',model:'gpt-5.6-luna',effort:'high',viewport:{x:0,y:0,scale:1}}};
 const owner=new LiveSessionChannel(port(),{owns:()=>true,read:()=>state,receive:()=>assert.fail('owner must not adopt follower state'),execute:async()=>{executions++;await turn.promise;}});
 const follower=new LiveSessionChannel(port(),{owns:()=>false,read:()=>undefined,receive:s=>{received=s;},execute:async()=>{followerExecutions++;}});
 follower.request();await new Promise(setImmediate);assert.equal(received?.busy,true);
 const command=follower.command({kind:'stop'});follower.request();follower.request();await new Promise(setImmediate);
 assert.equal(executions,1);assert.equal(followerExecutions,0);
 turn.resolve();await command;state.busy=false;owner.publish();await new Promise(setImmediate);
 assert.equal(received?.busy,false);owner.close();follower.close();
});

test('autosave serializes writes and retains the latest change arriving during an upload',async()=>{
 const first=deferred();const writes:number[]=[];const states:string[]=[];
 const queue=new SnapshotQueue<number>(async value=>{writes.push(value);if(value===1)await first.promise;},value=>states.push(value));
 queue.enqueue(1);const run=queue.flush();queue.enqueue(2);queue.enqueue(3);void queue.flush();
 assert.deepEqual(writes,[1]);assert.equal(queue.dirty,true);first.resolve();await run;
 assert.deepEqual(writes,[1,3]);assert.equal(queue.dirty,false);assert.equal(states.at(-1),'saved');
 const count=states.length;await queue.flush();assert.equal(states.length,count);
});
test('failed saves stay dirty and retry the newest snapshot without a false Saved state',async()=>{
 let fail=true;const writes:number[]=[];const states:string[]=[];
 const queue=new SnapshotQueue<number>(async value=>{writes.push(value);if(fail)throw new Error('offline');},s=>states.push(s));
 queue.enqueue(1);await queue.flush();assert.equal(queue.dirty,true);assert.equal(states.at(-1),'error');
 queue.enqueue(2);fail=false;await queue.flush();assert.deepEqual(writes,[1,2]);assert.equal(queue.dirty,false);
});
test('snapshot round trip retains native canvas CSS, media, conversation and model settings',async()=>{
 const snapshot:NorthstarSnapshot={schema:1,revision:createCanvasV2CommittedRevision({id:'saved',document:{html:'<section data-canvas-v2-node-id="finding">Editable finding</section>',css:'[data-canvas-v2-node-id="finding"]{color:red}'},evidence:[],createdAt:'2026-09-15T12:00:00Z'}),
 turns:[{id:'turn1',message:'Explain it',answer:'An explanation',status:'responded',createdAt:'2026-09-15T12:00:00Z'}],draft:'Follow-up',model:'gpt-6-astra',effort:'high',viewport:{x:120,y:-35,scale:.5}};
 assert.deepEqual(decodeSnapshot(JSON.parse(await(await encodeSnapshot(snapshot)).text())),JSON.parse(JSON.stringify(snapshot)));
 assert.throws(()=>decodeSnapshot({...snapshot,viewport:{x:0,y:0,scale:0}}),/incomplete/);
 assert.throws(()=>decodeSnapshot({...snapshot,revision:{...snapshot.revision,document:{html:'<script>alert(1)</script>',css:''}}}));
});
test('model capabilities expose only advertised image-capable models and supported thinking modes',()=>{
 const models=northstarModelCapabilities([
 {model:'gpt-5.6-luna',inputModalities:['text','image'],supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'low'}]},
 {model:'gpt-6-astra',inputModalities:['text','image'],supportedReasoningEfforts:[{reasoningEffort:'ultra'}]},
 {model:'gpt-5.6-sol',inputModalities:['text'],supportedReasoningEfforts:[{reasoningEffort:'high'}]},
 ]);
 assert.deepEqual(models.map(m=>[m.id,m.efforts]),[['gpt-6-astra',['ultra']],['gpt-5.6-luna',['low','high']]]);
 assert.deepEqual(northstarRunConfig('gpt-5.6-luna'),{model:'gpt-5.6-luna',effort:'high'});
 assert.throws(()=>northstarRunConfig('unknown','high'),/No substitution/);
 assert.throws(()=>northstarRunConfig('gpt-6-astra','invented'),/thinking/);
});

test('local origin reconstruction accepts only the exact loopback Host and port in development', async()=>{
 const {sameNorthstarOrigin}=await import('../lib/canvas-v2/request-origin');
 const request=(origin:string,host='127.0.0.1:3138')=>new Request('http://localhost:3138/api/test',{headers:{origin,host}});
 assert.equal(sameNorthstarOrigin(request('http://127.0.0.1:3138'),true),true);
 assert.equal(sameNorthstarOrigin(request('http://127.0.0.1:3138'),false),false);
 assert.equal(sameNorthstarOrigin(request('https://evil.example'),true),false);
 assert.equal(sameNorthstarOrigin(request('http://127.0.0.1:9999','127.0.0.1:9999'),true),false);
 assert.equal(sameNorthstarOrigin(request('http://localhost:3138'),false),true);
});

test('a queued action completes once when its follower becomes the owner',async()=>{
 let owns=false,executions=0;
 const port:ConstructorParameters<typeof LiveSessionChannel>[0]={onmessage:null,postMessage:()=>{},close:()=>{}};
 const channel=new LiveSessionChannel(port,{owns:()=>owns,read:()=>undefined,receive:()=>{},execute:async()=>{executions++;}});
 const action=channel.command({kind:'stop'});
 owns=true;channel.request();channel.request();await action;
 assert.equal(executions,1);
 await channel.command({kind:'stop'});
 assert.equal(executions,2);channel.close();
});
