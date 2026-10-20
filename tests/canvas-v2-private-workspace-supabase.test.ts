import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { PrivateCanvasHistory } from '../lib/canvas-v2/sessions/private-workspace';
import type { SupabasePrivateWorkspace } from '../lib/canvas-v2/sessions/private-workspace-supabase';

const sid='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const oldId='33333333-3333-4333-8333-333333333333',newId='44444444-4444-4444-8444-444444444444';
const path=(id:string)=>`${user}/${sid}/private/${id}.json`;
const history:PrivateCanvasHistory={turns:[],draft:'Private conversation',model:'gpt-5.6-sol',effort:'high'};
type Result={data:unknown;error:null|{message:string;statusCode?:string}};
function fixture(){
  const rpcCalls:Array<{name:string;args:unknown}>=[],uploads:Array<{path:string;blob:Blob;options:unknown}>=[],downloads:string[]=[],removed:string[][]=[];
  let encodeCalls=0,encodeFailures=0;
  const behavior={
    rpc:async(name:string,args:unknown):Promise<Result>=>{assert.ok(args);return {data:name.endsWith('_read')?{version:1,path:path(oldId)}:{ok:true,version:2,path:path(newId)},error:null};},
    download:async(objectPath:string):Promise<{data:Blob|null;error:null|{message:string}}>=>{assert.ok(objectPath);return {data:new Blob(['encoded private history']),error:null};},
    upload:async():Promise<{error:null|{message:string;statusCode?:string}}>=>({error:null}),
  };
  const db={rpc:async(name:string,args:unknown)=>{rpcCalls.push({name,args:JSON.parse(JSON.stringify(args))});return behavior.rpc(name,args);},storage:{from:(bucket:string)=>{
    assert.equal(bucket,'northstar-sessions');return {
      download:async(value:string)=>{downloads.push(value);return behavior.download(value);},
      upload:async(value:string,blob:Blob,options:unknown)=>{uploads.push({path:value,blob,options:JSON.parse(JSON.stringify(options))});return behavior.upload();},
      remove:async(values:string[])=>{removed.push([...values]);return {error:null};},
    };
  }}};
  const exports:{SupabasePrivateWorkspace?:new(sid:string,user:string,db:unknown)=>SupabasePrivateWorkspace}={};
  const source=readFileSync(new URL('../lib/canvas-v2/sessions/private-workspace-supabase.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='@/lib/supabase/client')return {createClient:()=>{throw new Error('A real account service must never be created in this test');}};
    if(name==='./private-workspace')return {encodePrivateCanvasHistory:async()=>{encodeCalls++;if(encodeFailures-->0)throw new Error('Temporary media encoding failure');return new Blob(['captured immutable private bytes']);},decodePrivateCanvasHistory:async()=>history};
    throw new Error(`Unexpected dependency: ${name}`);
  }});
  return {store:new exports.SupabasePrivateWorkspace!(sid,user,db),behavior,rpcCalls,uploads,downloads,removed,encodes:()=>encodeCalls,failEncode:()=>{encodeFailures++;}};
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('private cloud adapter reads exact personal RPC metadata and decodes only its account canvas object',async()=>{
  const f=fixture();assert.deepEqual(JSON.parse(JSON.stringify(await f.store.read())),{history,version:1,path:path(oldId)});
  assert.deepEqual(f.rpcCalls,[{name:'northstar_canvas_private_read',args:{sid}}]);assert.deepEqual(f.downloads,[path(oldId)]);
  f.behavior.rpc=async()=>({data:null,error:null});assert.equal(await f.store.read(),undefined);assert.equal(f.downloads.length,1);
});
test('private metadata auth errors and another account path cannot trigger a Storage download',async()=>{
  const f=fixture();f.behavior.rpc=async()=>({data:null,error:{message:'Canvas access denied'}});
  await assert.rejects(f.store.read(),/access denied/);
  f.behavior.rpc=async()=>({data:{version:1,path:`other/${sid}/private/${oldId}.json`},error:null});
  await assert.rejects(f.store.read(),/invalid storage path/);assert.equal(f.downloads.length,0);
});
test('private history read retries fresh metadata when a concurrent save removes the old object',async()=>{
  const f=fixture();let reads=0;
  f.behavior.rpc=async()=>({data:{version:reads++?2:1,path:reads===1?path(oldId):path(newId)},error:null});
  f.behavior.download=async(value)=>value===path(oldId)?{data:null,error:{message:'Object not found'}}:{data:new Blob(['new private history']),error:null};
  const result=await f.store.read();assert.ok(result);assert.equal(result.version,2);assert.equal(result.path,path(newId));
  assert.deepEqual(f.downloads,[path(oldId),path(newId)]);
});
test('lost private save response retries the same operation object and bytes through duplicate upload',async()=>{
  const f=fixture();let commits=0;
  f.behavior.rpc=async()=>++commits===1?{data:null,error:{message:'Response lost after commit'}}:{data:{ok:true,version:2,path:path(newId)},error:null};
  f.behavior.upload=async()=>({error:f.uploads.length===1?null:{message:'Object already exists',statusCode:'409'}});
  await assert.rejects(f.store.write(history,1,newId),/Response lost/);
  assert.equal((await f.store.write(history,1,newId)).ok,true);
  assert.equal(f.encodes(),1);assert.equal(f.uploads[0].blob,f.uploads[1].blob);
  for(const upload of f.uploads){assert.equal(upload.path,path(newId));assert.deepEqual(upload.options,{contentType:'application/json',upsert:false});}
  assert.deepEqual(f.rpcCalls,[{name:'northstar_canvas_private_save',args:{sid,expected_version:1,path:path(newId)}},{name:'northstar_canvas_private_save',args:{sid,expected_version:1,path:path(newId)}}]);
});
test('a stale personal CAS keeps both previous cloud history and the local prepared upload',async()=>{
  const f=fixture();await f.store.read();f.behavior.rpc=async()=>({data:{ok:false,version:2,path:path(oldId)},error:null});
  assert.equal((await f.store.write(history,1,newId)).ok,false);assert.equal(f.removed.length,0);
  assert.equal(f.uploads.length,1);assert.equal(f.uploads[0].path,path(newId));
});
test('old private blob is removed only after the new pointer is acknowledged',async()=>{
  const f=fixture();await f.store.read();let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  f.behavior.rpc=async()=>{await gate;return {data:{ok:true,version:2,path:path(newId)},error:null};};
  const saving=f.store.write(history,1,newId);await settle();assert.equal(f.removed.length,0);
  release();await saving;assert.deepEqual(f.removed,[[path(oldId)]]);
});
test('a transient private media encoding failure can retry the same durable operation identity',async()=>{
  const f=fixture();f.failEncode();await assert.rejects(f.store.write(history,1,newId),/Temporary media/);
  assert.equal((await f.store.write(history,1,newId)).ok,true,'retry must re-encode after a failed preparation');
  assert.equal(f.encodes(),2);assert.equal(f.uploads.length,1);
});
test('failed private upload cannot publish a metadata pointer or delete a previous history',async()=>{
  const f=fixture();f.behavior.upload=async()=>({error:{message:'Upload unavailable',statusCode:'503'}});
  await assert.rejects(f.store.write(history,1,newId),/Upload unavailable/);
  assert.equal(f.rpcCalls.length,0);assert.equal(f.removed.length,0);
});
