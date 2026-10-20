import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as transport from '../lib/canvas-v2/sessions/snapshot-transport';
import {encodeSnapshotText,unpackSnapshotText} from '../lib/canvas-v2/sessions/snapshot-codec';
import {snapshotBlobUrls} from '../lib/canvas-v2/sessions/snapshot-blob-urls';
import type {SnapshotTransportRequest} from '../lib/canvas-v2/sessions/snapshot-transport';

const large=(label:string)=>label+'\nquotes " / \\ null\0 compass🧭 '+label.repeat(40_000);
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
const workerSource=ts.transpileModule(fs.readFileSync(new URL('../lib/canvas-v2/sessions/snapshot-encode.worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

/** Exercise the actual host queue and actual worker handler. Each postMessage
 * really structured-clones its payload; control only delivery/failure timing. */
function bridge({hold=false,postFailure=false,resources=new Map<string,Blob>()}:{hold?:boolean;postFailure?:boolean;resources?:Map<string,Blob>}={}){
 const workers:Port[]=[];let throwPost=postFailure;
 class Reader{
  result:string|null=null;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  readAsDataURL(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.()},()=>this.onerror?.())}
 }
 class Port{
  onmessage:((event:MessageEvent)=>void)|null=null;onerror:((event:ErrorEvent)=>void)|null=null;
  sent:SnapshotTransportRequest[]=[];pending:SnapshotTransportRequest[]=[];terminated=false;
  self:{onmessage?: (event:{data:SnapshotTransportRequest})=>Promise<void>;postMessage:(value:unknown)=>void};
  constructor(){
   this.self={postMessage:value=>{const data=structuredClone(value);queueMicrotask(()=>{if(!this.terminated)this.onmessage?.({data} as MessageEvent)})}};
   vm.runInNewContext(workerSource,{exports:{},self:this.self,Blob,Error,Map,fetch:(url:string)=>resources.has(url)?Promise.resolve(new Response(resources.get(url)!)):fetch(url),FileReader:Reader,require:(id:string)=>{
    if(id==='./snapshot-codec')return{encodeSnapshotText};if(id==='./snapshot-blob-urls')return{snapshotBlobUrls};if(id==='./snapshot-transport')return transport;throw new Error('Unexpected worker import '+id);
   }});workers.push(this);
  }
  postMessage(request:SnapshotTransportRequest){
   if(throwPost){throwPost=false;throw new Error('Actual send failed');}
   if(this.terminated)throw new Error('Posted to a terminated worker');
   this.sent.push(structuredClone(request));const delivery=structuredClone(request);
   if(hold)this.pending.push(delivery);else void this.self.onmessage!({data:delivery});
  }
  terminate(){this.terminated=true}
  async deliver(){const data=this.pending.shift();assert.ok(data);await this.self.onmessage!({data});await turn()}
  crash(){this.onerror?.({} as ErrorEvent)}
 }
 const transfers:{startedAt:number;durationMs:number}[]=[];
 const encoder=transport.createSnapshotTransportEncoder({createWorker:()=>new Port() as unknown as Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'>,onTransfer:(startedAt,durationMs)=>transfers.push({startedAt,durationMs})});
 return{encoder,workers,transfers,createWorker:()=>new Port() as unknown as Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'>};
}
const output=async(blob:Blob)=>JSON.parse(await unpackSnapshotText(await blob.text()));
const expected=(value:unknown)=>JSON.parse(JSON.stringify(structuredClone(value)));

test('first request fully seeds exact strings; camera-only request sends fresh metadata without any retained large value',async()=>{
 const f=bridge(),source=large('source'),media='data:image/png;base64,'+'Ab+/='.repeat(10_000),value={revision:{id:'unchanged',document:{html:source,css:''}},memory:{sourcePages:[source],assets:[{url:media}]},draft:'Human words',viewport:{x:0,y:0,scale:.1}};
 assert.deepEqual(await output(await f.encoder.encode(value,1_000_000)),expected(value));
 const first=f.workers[0].sent[0];assert.equal(first.strings.length,2);assert.equal(first.references.length,3);assert.equal(first.references[0].id,first.references[1].id);assert.equal((first.metadata as typeof value).revision.document.html,null);
 value.viewport={x:-300,y:900,scale:.2};value.draft='Newest human words';
 assert.deepEqual(await output(await f.encoder.encode(value,1_000_000)),expected(value));assert.equal(f.workers.length,1);
 const next=f.workers[0].sent[1],message=JSON.stringify(next);assert.deepEqual(next.strings,[]);assert.ok(!message.includes(source));assert.ok(!message.includes(media));assert.ok(message.length<2_000,'The actual camera transport must exclude the big string bytes.');
 assert.equal((next.metadata as typeof value).draft,'Newest human words');assert.equal(f.transfers.length,2);assert.ok(f.transfers.every(x=>x.durationMs>=0));f.encoder.dispose();
});

test('same revision and mutable memory still save replacements, deletion, array order, fresh small strings and same-length large edits',async()=>{
 const f=bridge(),a=large('a'),b=large('b');
 const value={revision:{id:'same',document:{html:a}},memory:{assets:[{id:'asset',url:a},{id:'other',url:b}],accountPackets:[{id:'packet',body:{label:'old',payload:a}}],sourcePages:['first','second'],compositionSequence:1},optional:'delete me'};
 await f.encoder.encode(value,1_000_000);
 value.memory.assets[0].url=a.slice(0,-1)+'z';value.memory.assets.reverse();value.memory.assets.splice(1,1);value.memory.accountPackets[0].body={label:'new',payload:b};value.memory.sourcePages.reverse();value.memory.compositionSequence=2;delete(value as Partial<typeof value>).optional;
 assert.deepEqual(await output(await f.encoder.encode(value,1_000_000)),expected(value));
 assert.ok(f.workers[0].sent[1].references.every(x=>Array.isArray(x.path)));f.encoder.dispose();
});

test('same-length replacement strings are exact values rather than length/hash surrogates',async()=>{
 const f=bridge(),a='a'.repeat(32_768),b='a'.repeat(32_767)+'b';await f.encoder.encode({source:a},1_000_000);
 assert.deepEqual(await output(await f.encoder.encode({source:b},1_000_000)),{source:b});assert.deepEqual(f.workers[0].sent[1].strings.map(x=>x[1]),[b]);f.encoder.dispose();
});

test('each queued request captures all mutable metadata and large values when called, not when the prior encode completes',async()=>{
 const f=bridge({hold:true}),value={revision:{id:'same',source:large('a')},memory:{sequence:1,assets:[{id:'same',url:large('one')}]},viewport:{x:1}};
 const firstExpected=expected(value),one=f.encoder.encode(value,1_000_000);await turn();
 value.memory.sequence=2;value.memory.assets[0].url=large('two');value.viewport.x=2;const secondExpected=expected(value),two=f.encoder.encode(value,1_000_000);
 value.memory.assets.length=0;value.memory.sequence=99;value.revision.source='changed after enqueue';value.viewport.x=99;
 assert.equal(f.workers[0].sent.length,1,'Only one actual worker job can be in flight.');await f.workers[0].deliver();assert.deepEqual(await output(await one),firstExpected);
 assert.equal(f.workers[0].sent.length,2);await f.workers[0].deliver();assert.deepEqual(await output(await two),secondExpected);f.encoder.dispose();
});

test('latest-only dictionary trimming drops removed strings and fully resends them if later reintroduced',async()=>{
 const f=bridge(),a=large('a'),b=large('b');await f.encoder.encode({a,b},1_000_000);await f.encoder.encode({b},1_000_000);
 const retained=f.workers[0].sent[1];assert.equal(retained.retainIds.length,1);assert.deepEqual(retained.strings,[]);
 assert.deepEqual(await output(await f.encoder.encode({a,b},1_000_000)),{a,b});assert.deepEqual(f.workers[0].sent[2].strings.map(x=>x[1]),[a]);f.encoder.dispose();
});

test('JSON special values, shared objects, dates and valid own prototype-named keys retain the old structured-clone then JSON semantics',async()=>{
 const f=bridge(),shared={source:large('shared')},array:unknown[]=[undefined,NaN,Infinity,-Infinity,-0];array.length=7;
 const value={missing:undefined,nothing:null,array,first:shared,second:shared,date:new Date('2026-10-18T12:34:56Z'),map:new Map([['label','kept by clone, omitted by JSON']]),typed:new Uint8Array([0,127,255]),own:JSON.parse('{"__proto__":null,"constructor":null}')};
 value.own.__proto__=large('proto');value.own.constructor=large('constructor');
 assert.deepEqual(await output(await f.encoder.encode(value,2_000_000)),expected(value));assert.equal(({} as Record<string,unknown>).polluted,undefined);f.encoder.dispose();
});

test('named enumerable array properties do not invent JSON entries or invalid transport paths',async()=>{
 const f=bridge(),array=Object.assign(['real item'],{extra:large('ignored by JSON')});assert.deepEqual(await output(await f.encoder.encode({array},1_000_000)),expected({array}));f.encoder.dispose();
});

test('invalid cycles, BigInt and uncloneable values reject without poisoning the next queued save',async()=>{
 const f=bridge(),cycle:{self?:unknown}={};cycle.self=cycle;
 for(const bad of [cycle,{large:large('x'),value:BigInt(1)},{method:()=>1}])await assert.rejects(f.encoder.encode(bad,1_000_000));
 assert.deepEqual(await output(await f.encoder.encode({fresh:large('ok')},1_000_000)),{fresh:large('ok')});f.encoder.dispose();
});

test('malformed reference slots fail before any placeholder or retained dictionary mutation',()=>{
 const base=():SnapshotTransportRequest=>({protocol:transport.SNAPSHOT_TRANSPORT,requestId:1,maxBytes:1_000_000,metadata:{first:null,nested:{next:null}},strings:[[2,large('new')]],references:[{path:['first'],id:2}],retainIds:[2]});
 const malformed=[(r:SnapshotTransportRequest)=>r.references.push({path:['nested','missing'],id:2}),(r:SnapshotTransportRequest)=>r.references.push({path:['first'],id:2}),(r:SnapshotTransportRequest)=>r.references.push({path:['__proto__','polluted'],id:2}),(r:SnapshotTransportRequest)=>r.references[0].id=999,(r:SnapshotTransportRequest)=>r.retainIds.push(999),(r:SnapshotTransportRequest)=>r.strings.push([2,'conflicting']),(r:SnapshotTransportRequest)=>r.retainIds.push(2),(r:SnapshotTransportRequest)=>r.strings[0][0]=0,(r:SnapshotTransportRequest)=>r.references[0].path=[-1],(r:SnapshotTransportRequest)=>(r.metadata as Record<string,unknown>).first='not a null placeholder'];
 for(const change of malformed){const request=base(),dictionary=new Map([[1,'previously retained']]);change(request);const metadata=structuredClone(request.metadata);assert.throws(()=>transport.restoreSnapshotTransport(request,dictionary));assert.deepEqual(request.metadata,metadata);assert.deepEqual([...dictionary],[[1,'previously retained']]);}
 const array=base();array.metadata=[null];array.references=[{path:['0'],id:2}];assert.throws(()=>transport.restoreSnapshotTransport(array,new Map()));assert.equal(({} as Record<string,unknown>).polluted,undefined);
});

test('the32768 threshold and empty root path preserve exact root strings rather than a transport token',async()=>{
 const small='s'.repeat(32_767),big='b'.repeat(32_768),captured=transport.captureSnapshotTransport({small,big});assert.equal(captured.strings.length,1);assert.deepEqual(captured.strings[0].path,['big']);assert.equal((captured.metadata as {small:string}).small,small);
 const f=bridge();assert.equal(await output(await f.encoder.encode(big,1_000_000)),big);assert.deepEqual(f.workers[0].sent[0].references[0].path,[]);f.encoder.dispose();
});

test('a response for another request cannot resolve the current job or advance its retained table',async()=>{
 const f=bridge({hold:true}),value={source:large('pending')};let settled=false;const promise=f.encoder.encode(value,1_000_000).then(blob=>{settled=true;return blob});await turn();const port=f.workers[0];port.onmessage?.({data:{requestId:port.sent[0].requestId+100,blob:new Blob(['wrong'])}} as MessageEvent);await turn();assert.equal(settled,false);await port.deliver();assert.deepEqual(await output(await promise),value);f.encoder.dispose();
});

test('a queued size failure cannot lose the following job values while restarting and fully seeding',async()=>{
 const f=bridge({hold:true}),bad=f.encoder.encode({source:large('bad')},1),rejected=assert.rejects(bad,{stage:'size'});await turn();const value={source:large('queued'),memory:{sequence:2}},saved=expected(value),good=f.encoder.encode(value,1_000_000);value.source='changed after call';value.memory.sequence=99;
 await f.workers[0].deliver();await rejected;await turn();assert.equal(f.workers.length,2);assert.equal(f.workers[1].sent[0].strings.length,1);await f.workers[1].deliver();assert.deepEqual(await output(await good),saved);f.encoder.dispose();
});

test('worker decode rejects a malformed envelope then accepts a valid full seed without saving the envelope',async()=>{
 const f=bridge({hold:true}),promise=f.encoder.encode({source:large('x')},1_000_000);await turn();const port=f.workers[0];port.pending[0].references[0].id=999;const rejected=assert.rejects(promise,/reference|retained/);await port.deliver();await rejected;assert.equal(port.terminated,true);
 const next=f.encoder.encode({source:large('x'),draft:'new'},1_000_000);await turn();assert.equal(f.workers.length,2);assert.equal(f.workers[1].sent[0].strings.length,1);await f.workers[1].deliver();assert.deepEqual(await output(await next),{source:large('x'),draft:'new'});f.encoder.dispose();
});

test('active worker crash preserves queued call-time values and ignores a late response from the retired worker',async()=>{
 const f=bridge({hold:true}),one=f.encoder.encode({source:large('a')},1_000_000);await turn();const old=f.workers[0],late=old.onmessage,oneRejected=assert.rejects(one,/prepare/);
 const mutable={memory:{value:large('b'),sequence:2}},twoExpected=expected(mutable),two=f.encoder.encode(mutable,1_000_000);mutable.memory.value='later';mutable.memory.sequence=9;old.crash();await oneRejected;await turn();
 assert.equal(f.workers.length,2);assert.equal(f.workers[1].sent[0].strings.length,1,'Restart must fully seed the queued job, not use retired IDs.');late?.({data:{requestId:old.sent[0].requestId,blob:new Blob(['stale'])}} as MessageEvent);
 await f.workers[1].deliver();assert.deepEqual(await output(await two),twoExpected);f.encoder.dispose();
});

test('an idle worker crash invalidates the dictionary and the next save uses a fresh full seed',async()=>{
 const f=bridge(),value={source:large('same')};await f.encoder.encode(value,1_000_000);const old=f.workers[0];old.crash();
 assert.equal(old.terminated,true,'An idle failed worker must not remain the encoder port.');
 assert.deepEqual(await output(await f.encoder.encode(value,1_000_000)),value);assert.equal(f.workers.length,2);assert.equal(f.workers[1].sent[0].strings.length,1);f.encoder.dispose();
});

test('send failure and size rejection do not corrupt the next full seed or change caller byte limits',async()=>{
 const f=bridge({postFailure:true}),value={source:large('é')};await assert.rejects(f.encoder.encode(value,1_000_000),/send failed/);
 const bytes=Buffer.byteLength(JSON.stringify(value));await assert.rejects(f.encoder.encode(value,bytes-1),{stage:'size',bytes});
 const blob=await f.encoder.encode(value,bytes);assert.equal(blob.size,bytes);assert.deepEqual(await output(blob),value);assert.equal(f.workers.length,3);assert.ok(f.workers.every(port=>port.sent.length<=1));f.encoder.dispose();
});

test('actual worker materializes current blob URL bytes and preserves large exact source around them',async()=>{
 const url='blob:http://localhost:3000/12345678-abcd-1234-abcd-123456789012',f=bridge({resources:new Map([[url,new Blob([Uint8Array.from([0,1,2,253,254,255])],{type:'image/png'})]])});
 try{const value={source:large('surrounding')+url,memory:{assets:[{url}]}};const saved=await output(await f.encoder.encode(value,1_000_000));const data='data:image/png;base64,AAEC/f7/';assert.deepEqual(saved,{source:value.source.replaceAll(url,data),memory:{assets:[{url:data}]}});assert.ok(!JSON.stringify(saved).includes('blob:'));}finally{f.encoder.dispose()}
});

test('worker construction failure and invalid limits reject without preventing the next complete save',async()=>{
 const f=bridge();let attempts=0;const encoder=transport.createSnapshotTransportEncoder({createWorker:()=>{if(++attempts===1)throw new Error('Worker constructor failed');return f.createWorker()}});
 for(const limit of [0,-1,NaN,Infinity,1.5])await assert.rejects(encoder.encode({source:large('x')},limit),/limit/);assert.equal(attempts,0);
 await assert.rejects(encoder.encode({source:large('x')},1_000_000),/constructor/);assert.deepEqual(await output(await encoder.encode({source:large('x')},1_000_000)),{source:large('x')});encoder.dispose();f.encoder.dispose();
});

test('dictionary transport preserves existing compressed durable format and dispose rejects active plus queued jobs',async()=>{
 const f=bridge(),value={source:'exact saved words '.repeat(500_000)};const blob=await f.encoder.encode(value,500_000);assert.equal(JSON.parse(await blob.text()).schema,'northstar.snapshot.gzip.v1');assert.deepEqual(await output(blob),value);f.encoder.dispose();
 const held=bridge({hold:true}),one=held.encoder.encode({source:large('a')},1_000_000);await turn();const two=held.encoder.encode({source:large('b')},1_000_000),firstRejected=assert.rejects(one,/closed/),secondRejected=assert.rejects(two,/closed/);held.encoder.dispose();await Promise.all([firstRejected,secondRejected]);assert.equal(held.workers[0].terminated,true);assert.equal(held.workers[0].sent.length,1);
});
