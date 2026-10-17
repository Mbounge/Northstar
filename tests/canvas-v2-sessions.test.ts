import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotQueue, decodeSnapshot, encodeSnapshot } from '../lib/canvas-v2/sessions/snapshot';
import { createCanvasV2CommittedRevision } from '../lib/canvas-v2/revisions';
import { northstarModelCapabilities, northstarRunConfig } from '../lib/canvas-v2/model-catalog';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';
import { claimSessionWriter } from '../lib/canvas-v2/sessions/writer';
import { LiveSessionChannel } from '../lib/canvas-v2/sessions/live-channel';
import type { LiveSessionState } from '../lib/canvas-v2/sessions/types';
import { CANVAS_V2_NATIVE_SCENE_SCHEMA, applyCanvasV2NativeSceneMutation, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};

function serializedNativeMediaDocument(src: string) {
 const empty: CanvasV2NativeSceneDocument={schema:CANVAS_V2_NATIVE_SCENE_SCHEMA,revisionId:'native-media',width:1200,height:800,rootIds:[],nodes:[],css:''};
 const scene=applyCanvasV2NativeSceneMutation(empty,{kind:'batch',label:'Native media',mutations:[
   {kind:'create',primitive:'shape',nodeId:'clip',x:100,y:100,width:480,height:270},
   {kind:'attribute',nodeId:'clip',name:'data-canvas-v2-media',value:JSON.stringify({version:1,type:'video',src,evidenceId:'clip',description:'A short native clip'})},
 ]});
 return serializeCanvasV2NativeScene(scene);
}
function tinyModelDataUrl() {
 const jsonBytes=Buffer.from(JSON.stringify({asset:{version:'2.0'},buffers:[{byteLength:4}]}));const json=Buffer.alloc(Math.ceil(jsonBytes.length/4)*4,0x20);jsonBytes.copy(json);const bin=Buffer.from([0,1,2,3]);const total=12+8+json.length+8+bin.length;const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);const jsonHeader=Buffer.alloc(8);jsonHeader.writeUInt32LE(json.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4);const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);return `data:model/gltf-binary;base64,${Buffer.concat([header,jsonHeader,json,binHeader,bin]).toString('base64')}`;
}

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

test('a lone canvas does not clone its full revision on every edit, but a follower receives current state',async()=>{
 type Port=ConstructorParameters<typeof LiveSessionChannel>[0];
 const ports:Port[]=[];let messages=0;
 const port=():Port=>{const p:Port={onmessage:null,close:()=>{},postMessage:data=>{messages++;for(const other of ports)if(other!==p)queueMicrotask(()=>other.onmessage?.({data} as MessageEvent));}};ports.push(p);return p;};
 const state:LiveSessionState={title:'Dense canvas',busy:false,snapshot:{schema:1,revision:createCanvasV2CommittedRevision({id:'dense',document:{html:'<div data-canvas-v2-node-id="one">One</div>',css:''},evidence:[],createdAt:new Date().toISOString()}),turns:[],draft:'',model:'gpt-5.6-luna',effort:'high',viewport:{x:0,y:0,scale:1}}};
 const owner=new LiveSessionChannel(port(),{owns:()=>true,read:()=>state,receive:()=>assert.fail('owner cannot mirror itself'),execute:async()=>{}});
 owner.publish();owner.publish();assert.equal(messages,0);
 let received:LiveSessionState|undefined;
 const follower=new LiveSessionChannel(port(),{owns:()=>false,read:()=>undefined,receive:value=>{received=value;},execute:async()=>{}});
 follower.request();await new Promise(setImmediate);
 assert.equal(received?.snapshot.revision.id,'dense');
 const before=messages;state.busy=true;owner.publish();await new Promise(setImmediate);
 assert.ok(messages>before);assert.equal(received?.busy,true);
 owner.close();follower.close();
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
test('snapshot media materialization extracts only the blob URL from serialized native media JSON', async()=>{
 const snapshot:NorthstarSnapshot={schema:1,revision:createCanvasV2CommittedRevision({id:'native-media',document:serializedNativeMediaDocument('blob:http://localhost:3000/native-clip'),evidence:[],createdAt:'2026-09-15T12:00:00Z'}),turns:[],draft:'',model:'gpt-5.6-luna',effort:'high',viewport:{x:0,y:0,scale:1}};
 const originalFileReader=globalThis.FileReader, originalFetch=globalThis.fetch, fetched:string[]=[];
 class TestFileReader { result:string|ArrayBuffer|null=null; onload:((event:Event)=>void)|null=null; onerror:((event:Event)=>void)|null=null; readAsDataURL(blob:Blob){ void blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.(new Event('load'));}).catch(()=>this.onerror?.(new Event('error'))); } }
 globalThis.FileReader=TestFileReader as unknown as typeof FileReader;
 globalThis.fetch=async(url:RequestInfo|URL)=>{fetched.push(String(url));return new Response(new Uint8Array([7,8,9]),{status:200,headers:{'content-type':'video/mp4'}});};
 try {
   const encoded=await encodeSnapshot(snapshot), raw=await encoded.text();
   assert.deepEqual(fetched,['blob:http://localhost:3000/native-clip']);
   assert.doesNotMatch(raw,/blob:http:\/\/localhost:3000\/native-clip/);
   assert.match(raw,/data:video\/mp4;base64/);
 } finally { globalThis.fetch=originalFetch; globalThis.FileReader=originalFileReader; }
});
test('snapshot round trip retains validated GLB bytes as evidence', async()=>{
 const model={id:'model-1',url:tinyModelDataUrl(),label:'Model',mediaType:'model' as const,mimeType:'model/gltf-binary'};
 const snapshot:NorthstarSnapshot={schema:1,revision:createCanvasV2CommittedRevision({id:'model-saved',document:{html:'<div data-canvas-v2-node-id="model"></div>',css:''},evidence:[model],createdAt:'2026-09-15T12:00:00Z'}),turns:[],draft:'',model:'gpt-5.6-luna',effort:'high',viewport:{x:0,y:0,scale:1}};
 const restored=decodeSnapshot(JSON.parse(await(await encodeSnapshot(snapshot)).text()));
 assert.equal(restored.revision.evidence[0]?.url,model.url); assert.equal(restored.revision.evidence[0]?.mediaType,'model');
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
