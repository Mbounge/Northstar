export interface CanvasV2WasmModule { id: string; base64: string }

/** Retained compute kernels, not fetched executables or WASI programs. This
 * parser checks allocation declarations without instantiating author code.
 * The browser still performs full WebAssembly semantic validation on load. */
export function inspectCanvasV2WasmBytes(bytes: Uint8Array) {
  const fail=(message:string):never=>{throw new Error(`WebAssembly module: ${message}`);};
  if(bytes.length<8 || bytes.length>262144 || [0,97,115,109,1,0,0,0].some((byte,index)=>bytes[index]!==byte))fail('use a valid version 1 binary up to 256 KiB.');
  let offset=8, end=bytes.length;
  const byte=()=>{if(offset>=end)fail('truncated binary.');return bytes[offset++];};
  const u32=()=>{let value=0;for(let index=0;index<5;index++){const part=byte();if(index===4 && (part&240))fail('invalid integer.');value+=(part&127)*2**(index*7);if(!(part&128))return value;}return fail('invalid integer.');};
  const name=()=>{const size=u32();if(offset+size>end)fail('truncated import name.');offset+=size;};
  const limits=(maximum:number)=>{if(byte()!==1)fail('memory and tables require explicit maxima; shared memory, memory64 and custom pages are unsupported.');const initial=u32(),max=u32();if(initial>max||max>maximum)fail('allocation limit exceeded (32 MiB memory, 4096 table entries).');return max;};
  const seen=new Set<number>();let memoryPages=0, memories=0, tables=0;
  while(offset<bytes.length){
    end=bytes.length;const section=byte(),length=u32();end=offset+length;if(end>bytes.length)fail('truncated section.');
    if(section && seen.has(section))fail('duplicate section.');if(section)seen.add(section);
    if(section===2){const count=u32();if(count>256)fail('too many imports.');for(let i=0;i<count;i++){name();name();if(byte()!==0)fail('only function imports are supported; retain memory inside the module.');u32();}}
    else if(section===4){tables=u32();if(tables>1)fail('use at most one table.');for(let i=0;i<tables;i++){if(byte()!==0x70)fail('only function-reference tables are supported.');limits(4096);}}
    else if(section===5){memories=u32();if(memories>1)fail('use at most one memory.');for(let i=0;i<memories;i++)memoryPages+=limits(512);}
    else if(section===8)fail('call initialization explicitly after loading; start sections are unsupported.');
    else if(section>12)fail('unsupported section; use a standalone wasm32 compute kernel.');
    else {offset=end;continue;}
    if(offset!==end)fail('unexpected section content.');
  }
  return {byteSize:bytes.length,maxMemoryBytes:memoryPages*65536,memories,tables};
}

export function validateCanvasV2WasmModules(input: unknown): CanvasV2WasmModule[] | undefined {
  if(input===undefined)return;
  if(!Array.isArray(input)||input.length>2)throw new Error('Retain at most two local WebAssembly kernels.');
  const ids=new Set<string>();let total=0;
  return input.map(module=>{
    if(!module || typeof module!=='object' || Object.keys(module).some(key=>!['id','base64'].includes(key)) || typeof module.id!=='string'||!/^[a-zA-Z][\w-]{0,63}$/.test(module.id)||ids.has(module.id)||typeof module.base64!=='string'||module.base64.length>349528||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(module.base64))throw new Error('Use unique WebAssembly module IDs and canonical retained base64 bytes.');
    ids.add(module.id);
    const raw=atob(module.base64);if(btoa(raw)!==module.base64)throw new Error('Use canonical WebAssembly base64.');
    const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));total+=bytes.length;
    if(total>262144)throw new Error('Keep retained WebAssembly binaries within 256 KiB in total.');
    inspectCanvasV2WasmBytes(bytes);
    return {id:module.id,base64:module.base64};
  });
}

export function canvasV2WasmRuntimeSource(modules: CanvasV2WasmModule[]) {
  // tsx may decorate nested function names. Keep its identity helper local to
  // the serialized host code; production builds do not need that decoration.
  return `(()=>{const __name=value=>value;(${installCanvasV2WasmRuntime.toString()})(${JSON.stringify(modules)},${inspectCanvasV2WasmBytes.toString()});})();`;
}

/** Serialized into the opaque screen. No fetching, host APIs, workers or WASI.
 * Disposal releases host references; native Wasm has no force-free primitive.
 * Explicit exported calls run synchronously, just like authored JavaScript. */
export function installCanvasV2WasmRuntime(modules: CanvasV2WasmModule[], inspectBytes: typeof inspectCanvasV2WasmBytes) {
  const binaries=new Map(modules.map(module=>[module.id,module.base64]));
  const instances=new Map<string,{instance:WebAssembly.Instance;disposed:boolean;dispose:()=>void}>();
  const pending=new Set<string>(), failures=new Map<string,string>(), loops=new Set<{sync:()=>void;dispose:()=>void}>();
  let disposed=false,viewportActive=true;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const readiness=()=>({library:'wasm',ready:!disposed&&instances.size>0&&!pending.size&&!failures.size,status:disposed?'disposed':failures.size?'error':pending.size?'pending':instances.size?'ready':'unused',declaredModules:modules.length,pendingLoads:pending.size,activeInstances:instances.size,activeLoops:loops.size,viewportActive,errors:[...failures.values()].slice(-4)});
  const api={
    async instantiate(id:string,imports:WebAssembly.Imports={}) {
      if(disposed)throw new Error('WebAssembly runtime is disposed.');
      if(!binaries.has(id))throw new Error('Choose a declared retained WebAssembly module ID.');
      if(pending.has(id)||instances.has(id))throw new Error('Dispose the existing module instance before loading it again.');
      pending.add(id);failures.delete(id);
      try{
        if(typeof WebAssembly==='undefined')throw new Error('WebAssembly is unavailable in this browser.');
        const raw=atob(binaries.get(id)!),bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));inspectBytes(bytes);
        const result=await WebAssembly.instantiate(bytes,imports);
        if(disposed)throw new Error('WebAssembly loading was cancelled because this screen closed.');
        const record={instance:result.instance,disposed:false,dispose:()=>{if(record.disposed)return;record.disposed=true;instances.delete(id);}};
        instances.set(id,record);
        const exports:Record<string,unknown>={};
        for(const [key,value] of Object.entries(result.instance.exports))Object.defineProperty(exports,key,{enumerable:true,get:()=>{
          if(record.disposed||disposed)throw new Error('WebAssembly instance is disposed.');
          return typeof value==='function'? (...args:unknown[])=>{if(record.disposed||disposed)throw new Error('WebAssembly instance is disposed.');return value(...args);}:value;
        }});
        return Object.freeze({exports:Object.freeze(exports),dispose:record.dispose});
      }catch(error){if(!disposed)failures.set(id,String(error instanceof Error?error.message:error).slice(0,400));throw error;}
      finally{pending.delete(id);}
    },
    createLoop(render:(time:number)=>void){
      if(disposed||typeof render!=='function')throw new Error('Use a render callback in an active WebAssembly screen.');
      let running=false,closed=false,raf=0;
      const active=()=>running&&!closed&&!disposed&&viewportActive&&!document.hidden&&!preference.matches;
      const tick=(time:number)=>{raf=0;if(!active())return;try{render(time);}catch(error){running=false;throw error;}if(active())raf=requestAnimationFrame(tick);};
      const sync=()=>{if(raf)cancelAnimationFrame(raf);raf=0;if(active())raf=requestAnimationFrame(tick);};
      const entry={sync,dispose:()=>{if(closed)return;closed=true;sync();loops.delete(entry);}};
      loops.add(entry);
      const pause=()=>{running=false;sync();};
      return Object.freeze({start:()=>{if(closed||disposed)throw new Error('WebAssembly loop is disposed.');running=true;sync();},play:()=>{if(closed||disposed)throw new Error('WebAssembly loop is disposed.');running=true;sync();},pause,stop:pause,dispose:entry.dispose});
    },
    readiness,
    async whenReady(timeoutMs=4000){const start=performance.now();while(pending.size&&!disposed&&performance.now()-start<Math.max(0,Math.min(timeoutMs,4000)))await new Promise(resolve=>setTimeout(resolve,16));const state=readiness();return state.status==='pending'?{...state,status:'timeout'}:state;},
    setViewportActive(active:boolean){viewportActive=active===true;for(const loop of loops)loop.sync();},
    dispose(){if(disposed)return;disposed=true;for(const loop of [...loops])loop.dispose();for(const entry of [...instances.values()])entry.dispose();binaries.clear();failures.clear();document.removeEventListener('visibilitychange',syncLoops);preference.removeEventListener('change',syncLoops);window.removeEventListener('pagehide',api.dispose);}
  };
  const syncLoops=()=>{for(const loop of loops)loop.sync();};
  document.addEventListener('visibilitychange',syncLoops);preference.addEventListener('change',syncLoops);window.addEventListener('pagehide',api.dispose);
  Object.defineProperty(window,'northstarWasm',{value:Object.freeze(api),configurable:false,writable:false});
  return api;
}
