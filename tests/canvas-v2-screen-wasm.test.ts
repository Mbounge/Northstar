import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { canvasV2WasmRuntimeSource, inspectCanvasV2WasmBytes, installCanvasV2WasmRuntime, validateCanvasV2WasmModules } from '../lib/canvas-v2/screen-wasm';
import { encodeCanvasV2Screen, parseCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { buildCanvasV2ScreenRuntime, canvasV2ScreenMotionReviewMode, canvasV2ScreenNeedsViewportActivity } from '../lib/canvas-v2/interactive-screen-runtime';
import { canvasV2ScreenLiveEdit } from '../lib/canvas-v2/screen-feedback';
import { canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { applyCanvasV2SourcePatch } from '../lib/canvas-v2/source-patch';

const header=[0,97,115,109,1,0,0,0];
const bytes=Uint8Array.from([...header,1,7,1,96,2,127,127,1,127,3,2,1,0,5,4,1,1,1,2,7,16,2,3,97,100,100,0,0,6,109,101,109,111,114,121,2,0,10,9,1,7,0,32,0,32,1,106,11]);
const modules=[{id:'kernel',base64:Buffer.from(bytes).toString('base64')}];
const screen={version:1 as const,title:'Real compiled kernel',device:'none' as const,width:640,height:480,html:'<main><canvas></canvas></main>',css:'',javascript:'',referenceAssetIds:[],wasmModules:modules};

test('Wasm-only screens receive viewport activity and use real elapsed motion capture',()=>{
  assert.equal(canvasV2ScreenNeedsViewportActivity(screen),true);
  assert.equal(canvasV2ScreenMotionReviewMode({...screen,javascript:'northstarWasm.createLoop(draw).start()'}),'live');
  assert.equal(canvasV2ScreenNeedsViewportActivity({...screen,wasmModules:undefined}),false);
  assert.equal(canvasV2ScreenLiveEdit(screen,{...screen,css:'main{color:red}'},{} as DOMParser)?.stylesheet,'main{color:red}');
  assert.equal(canvasV2ScreenLiveEdit(screen,{...screen,wasmModules:[],css:'main{color:red}'},{} as DOMParser),undefined,'changed executable bindings must rebuild rather than advertising new bytes over an old instance');
});

test('retained modules survive screen roundtrip and targeted style revisions',()=>{
  assert.equal(WebAssembly.validate(bytes),true);
  const encoded=encodeCanvasV2Screen(screen);
  assert.deepEqual(parseCanvasV2Screen(encoded).wasmModules,modules);
  const previous={html:`<main data-canvas-v2-node-id="canvas"><div data-canvas-v2-node-id="kernel-screen" data-canvas-v2-screen="${encoded}"></div></main>`,css:''};
  const patch=canvasV2ScreenPatch(previous,{nodeId:'kernel-screen',css:'main{color:red}'},[],{x:0,y:0});
  const next=applyCanvasV2SourcePatch({previous,operations:patch.operations,evidence:[]});
  const saved=/data-canvas-v2-screen="([^"]+)"/.exec(next.html)![1];
  assert.deepEqual(parseCanvasV2Screen(saved).wasmModules,modules);
});

test('allocation policy rejects unbounded, shared, imported and oversized memory before instantiation',()=>{
  assert.equal(inspectCanvasV2WasmBytes(bytes).maxMemoryBytes,131072);
  for(const section of [
    [5,3,1,0,1], // no maximum
    [5,4,1,3,1,2], // shared
    [5,5,1,1,1,129,4], // 513 pages
    [5,4,1,1,2,1], // min exceeds max
    [5,7,2,1,1,2,1,1,2], // two memories
    [2,8,1,1,109,1,120,2,0,0], // imported memory
    [8,1,0], // implicit start
    [4,4,1,112,0,1], // unbounded table
    [5,4,1,1,1], // truncated
  ])assert.throws(()=>inspectCanvasV2WasmBytes(Uint8Array.from([...header,...section])));
  assert.throws(()=>validateCanvasV2WasmModules([...modules,...modules]));
  assert.throws(()=>validateCanvasV2WasmModules([{id:'bad',base64:'AAAA'}]));
  assert.throws(()=>validateCanvasV2WasmModules([{...modules[0],url:'https://example.test/kernel.wasm'}]));
});

test('only explicit Wasm screens get compilation permission; JavaScript eval and network remain blocked',()=>{
  const enabled=buildCanvasV2ScreenRuntime(screen,new Map(),'wasm-test');
  const ordinary=buildCanvasV2ScreenRuntime({...screen,wasmModules:undefined},new Map(),'ordinary-test');
  assert.match(enabled,/'wasm-unsafe-eval'/);
  assert.doesNotMatch(ordinary,/'wasm-unsafe-eval'/);
  assert.doesNotMatch(enabled,/'unsafe-eval'/);
  assert.match(enabled,/connect-src 'none'/);
  assert.match(enabled,/frame-src 'none'/);
  assert.match(enabled,/northstarWasm/);
  for(const script of enabled.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(script[1]));
});

function runtime(retained=modules){
  const document=Object.assign(new EventTarget(),{hidden:false});
  const preference=Object.assign(new EventTarget(),{matches:false});
  const window=new EventTarget();const frames=new Map<number,FrameRequestCallback>();let sequence=0;
  const context={window,document,matchMedia:()=>preference,WebAssembly,Uint8Array,atob,performance,setTimeout,requestAnimationFrame:(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  vm.runInNewContext(canvasV2WasmRuntimeSource(retained),context);
  const api=(window as unknown as {northstarWasm:ReturnType<typeof installCanvasV2WasmRuntime>}).northstarWasm;
  return {api,document,preference,frame(){for(const [id,callback] of [...frames]){frames.delete(id);callback(performance.now());}}};
}

test('real binary computes through exports, reports readiness, disposes and can reload',async()=>{
  const {api}=runtime();assert.equal(api.readiness().status,'unused');
  const loaded=await api.instantiate('kernel');
  assert.equal((loaded.exports.add as (a:number,b:number)=>number)(19,23),42);
  assert.equal((loaded.exports.memory as WebAssembly.Memory).buffer.byteLength,65536);
  assert.throws(()=>(loaded.exports.memory as WebAssembly.Memory).grow(2),RangeError);
  assert.equal((await api.whenReady()).ready,true);
  await assert.rejects(api.instantiate('kernel'),/Dispose/);
  const retained=loaded.exports.add as (a:number,b:number)=>number;
  loaded.dispose();assert.equal(api.readiness().activeInstances,0);assert.throws(()=>retained(1,2),/disposed/);
  await api.instantiate('kernel');api.dispose();assert.equal(api.readiness().status,'disposed');
  await assert.rejects(api.instantiate('kernel'),/disposed/);
});

test('managed kernel loops stop offscreen, in background, for reduced motion, and on disposal',async()=>{
  const {api,document,preference,frame}=runtime();await api.instantiate('kernel');let count=0;
  const loop=api.createLoop(()=>count++);loop.start();frame();assert.equal(count,1);
  api.setViewportActive(false);frame();assert.equal(count,1);
  api.setViewportActive(true);frame();assert.equal(count,2);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));frame();assert.equal(count,2);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));frame();assert.equal(count,3);
  preference.matches=true;preference.dispatchEvent(new Event('change'));frame();assert.equal(count,3);
  preference.matches=false;preference.dispatchEvent(new Event('change'));frame();assert.equal(count,4);
  loop.pause();frame();assert.equal(count,4);loop.play();frame();assert.equal(count,5);
  api.dispose();frame();assert.equal(count,5);assert.equal(api.readiness().activeLoops,0);assert.throws(()=>loop.start(),/disposed/);
});

test('closed screens cancel pending loads and surface actual instantiation failures',async()=>{
  const cancelled=runtime();const pending=cancelled.api.instantiate('kernel');cancelled.api.dispose();await assert.rejects(pending,/cancelled/);assert.equal(cancelled.api.readiness().activeInstances,0);
  const failed=runtime();await assert.rejects(failed.api.instantiate('missing'),/declared/);
  const invalid=bytes.slice();invalid[invalid.length-2]=255;
  const broken=runtime([{id:'broken',base64:Buffer.from(invalid).toString('base64')}]);
  await assert.rejects(broken.api.instantiate('broken'),WebAssembly.CompileError);
  assert.equal(broken.api.readiness().status,'error');assert.equal(broken.api.readiness().activeInstances,0);
});
