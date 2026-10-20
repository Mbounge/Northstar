import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';

async function harness() {
 let time=0;const handlers=new Map<string,Array<(event:Record<string,unknown>)=>void>>(),timers:Array<()=>void>=[];
 const document={hidden:false,addEventListener:(type:string,run:(event:Record<string,unknown>)=>void)=>{handlers.set(type,[...(handlers.get(type)??[]),run])}};
 const window={addEventListener:document.addEventListener,setTimeout:(run:()=>void)=>{timers.push(run);return timers.length}};
 const source=fs.readFileSync(new URL('../lib/canvas-v2/capture-input-scheduler.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:{waitForCanvasInputQuiet?:(quietMs?:number,isCurrent?:()=>boolean)=>Promise<void>;noteCanvasInputActivity?:(type:unknown,sequence?:unknown)=>boolean}={};
 vm.runInNewContext(compiled,{exports,document,window,performance:{now:()=>time}});
 const wait=exports.waitForCanvasInputQuiet!;await wait(0);
 return {document,wait,note:exports.noteCanvasInputActivity!,emit:(type:string,values:Record<string,unknown>={})=>{for(const run of handlers.get(type)??[])run({isTrusted:true,pointerId:1,pointerType:'mouse',buttons:1,...values})},advance:async(ms:number)=>{time+=ms;const pending=timers.splice(0);for(const run of pending)run();for(let tick=0;tick<3;tick++)await Promise.resolve()}};
}

for(const event of ['pointermove','pointerover','lostpointercapture'])test(`lost iframe pointer-up recovers only on native released mouse ${event}, with the normal quiet delay`,async()=>{
 const h=await harness();h.emit('pointerdown');let resolved=false;const waiting=h.wait().then(()=>{resolved=true});
 await h.advance(1000);assert.equal(resolved,false);
 h.emit(event,{buttons:0});await h.advance(219);assert.equal(resolved,false);
 await h.advance(33);await waiting;assert.equal(resolved,true);
});

test('real held mouse, touch and pen are not released by hover, capture loss or an untrusted synthetic release',async()=>{
 for(const pointerType of ['mouse','touch','pen']){
  const h=await harness();h.emit('pointerdown',{pointerType});let resolved=false;const waiting=h.wait().then(()=>{resolved=true});
  h.emit('pointermove',{pointerType,buttons:pointerType==='mouse'?1:0});h.emit('lostpointercapture',{pointerType,buttons:1});h.emit('pointermove',{buttons:0,isTrusted:false});h.emit('pointerup',{isTrusted:false});
  await h.advance(1000);assert.equal(resolved,false);
  h.emit('pointercancel',{pointerType});await h.advance(252);await waiting;assert.equal(resolved,true);
 }
});

test('untrusted isolated journeys cannot acquire a root human-input hold or extend the quiet interval',async()=>{
 const h=await harness();h.emit('pointerdown',{isTrusted:false});h.emit('pointermove',{isTrusted:false});h.emit('keydown',{isTrusted:false});h.emit('wheel',{isTrusted:false});
 await h.wait(220);
});

test('blur or hidden document clears a stale hold; visible visibility changes and unrelated pointer releases do not',async()=>{
 for(const type of ['blur','visibilitychange']){
  const h=await harness();h.emit('pointerdown');let resolved=false;const waiting=h.wait().then(()=>{resolved=true});
  h.emit('pointerup',{pointerId:2});h.emit('visibilitychange');await h.advance(1000);assert.equal(resolved,false);
  if(type==='visibilitychange')h.document.hidden=true;h.emit(type);await h.advance(252);await waiting;assert.equal(resolved,true);
 }
});

test('superseded observations still abort while a real drag remains held',async()=>{
 const h=await harness();h.emit('pointerdown');let current=true;const waiting=h.wait(220,()=>current);const rejected=assert.rejects(waiting,/superseded/);
 current=false;await h.advance(32);await rejected;
});

test('validated iframe input extends capture quiet time without acquiring an unreleasable remote pointer hold',async()=>{
 const h=await harness();assert.equal(h.note('pointerdown',1),true);let resolved=false;const waiting=h.wait().then(()=>{resolved=true});
 await h.advance(200);assert.equal(resolved,false);assert.equal(h.note('wheel',2),true);
 await h.advance(219);assert.equal(resolved,false);await h.advance(33);await waiting;assert.equal(resolved,true);
});

test('malformed frame input cannot delay capture; first-party trusted input may omit the native sequence',async()=>{
 const h=await harness();
 for(const [type,sequence] of [['mousemove',1],['wheel',0],['wheel',-1],['keydown',NaN],['input',1.5],['click','2'],['change',Number.MAX_SAFE_INTEGER+1],[null,1]] as const)assert.equal(h.note(type,sequence),false);
 await h.wait();assert.equal(h.note('input'),true);let resolved=false;const waiting=h.wait().then(()=>{resolved=true});await h.advance(219);assert.equal(resolved,false);await h.advance(33);await waiting;
});
