import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';

/** Execute the production entry guards with injected account services only;
 * no real account, network, React DOM or test-only route is involved. */
function compile(relative: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(output, {exports, ...globals, require: (name: string) => {
    assert.ok(Object.hasOwn(dependencies,name),`Unexpected production dependency: ${name}`); return dependencies[name];
  }});
  return exports;
}
function guard(environment:Record<string,string|undefined>={}) {
  let authCalls=0;
  const entry=compile('../proxy.ts',{
    '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>{authCalls++;return {data:{user:null}};}}})},
    'next/server':{NextResponse},
    '@/e2e/canvas-v2-deterministic-evaluation':{canvasV2LocalCodexEvaluationAllowed:()=>false},
    '@/lib/canvas-v2/local-evaluation':{canvasV2LocalEvaluationEnabled:()=>false},
  },{process:{env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://accounts.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-only-public-key',...environment}}});
  return {run:entry.proxy as (request:NextRequest)=>Promise<NextResponse>,calls:()=>authCalls};
}
test('optimized performance fixtures require both explicit flags, loopback host and an exact disposable route',async()=>{
  const enabled={NORTHSTAR_E2E:'1',NORTHSTAR_LOCAL_PRODUCTION_PROBE:'1'};
  for(const route of ['/canvas-v2-e2e/stress','/canvas-v2-e2e/responsive-editing']){
    const allowed=guard(enabled);
    assert.equal((await allowed.run(new NextRequest('http://127.0.0.1:3201'+route,{headers:{host:'127.0.0.1:3201'}}))).status,200);
    assert.equal(allowed.calls(),0);
    for(const environment of [{},{NORTHSTAR_E2E:'1'},{NORTHSTAR_LOCAL_PRODUCTION_PROBE:'1'}]){
      assert.equal((await guard(environment).run(new NextRequest('http://127.0.0.1:3201'+route,{headers:{host:'127.0.0.1:3201'}}))).status,307);
    }
    assert.equal((await guard(enabled).run(new NextRequest('https://northstar.invalid'+route,{headers:{host:'northstar.invalid','x-forwarded-host':'localhost:3201'}}))).status,307);
  }
  const guarded=guard(enabled);
  for(const route of ['/canvas-v2-e2e/responsive-editing/private','/canvas-v2-e2e/stress-other','/canvas']){
    assert.equal((await guarded.run(new NextRequest('http://localhost:3201'+route,{headers:{host:'localhost:3201'}}))).status,307);
  }
  assert.equal((await guarded.run(new NextRequest('http://localhost:3201/api/canvas-v2/private',{headers:{host:'localhost:3201'}}))).status,401);
});

test('unauthenticated invitation landing reaches the fragment-preserving client before sign-in',async()=>{
  const g=guard(), response=await g.run(new NextRequest('https://northstar.invalid/canvas/join'));
  assert.equal(response.status,200,'the join page must mount to retain the fragment token before OAuth');
  assert.equal(response.headers.get('location'),null);
});
test('the public invitation landing does not open workspace, private API or sibling routes',async()=>{
  const g=guard();
  for(const route of ['/canvas?workspace=11111111-1111-4111-8111-111111111111','/canvas/join-other','/canvas/join/private']){
    const response=await g.run(new NextRequest(`https://northstar.invalid${route}`));
    assert.equal(response.status,307); assert.equal(new URL(response.headers.get('location')!).pathname,'/signin');
  }
  assert.equal((await g.run(new NextRequest('https://northstar.invalid/api/canvas-v2/private'))).status,401);
  assert.ok(g.calls()>0);
});

function invitation(user: boolean, rejected = false) {
  const token='a'.repeat(64), values=new Map<string,string>(), navigations:string[]=[], states:unknown[]=[];
  const sessionStorage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)};
  const entry=compile('../components/canvas-v2/canvas-invitation.tsx',{
    react:{useEffect:(effect:()=>void)=>effect(),useState:(initial:unknown)=>[initial,(value:unknown)=>states.push(value)]},
    'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},
    'next/link':{default:()=>null},
    '@/lib/supabase/client':{createClient:()=>({auth:{getUser:async()=>({data:{user:user?{id:'member'}:null}})},rpc:async(name:string,args:unknown)=>{
      assert.equal(name,'northstar_canvas_join');assert.deepEqual(JSON.parse(JSON.stringify(args)),{token});
      return rejected?{data:null,error:{message:'Invitation revoked'}}:{data:'11111111-1111-4111-8111-111111111111',error:null};
    }})},
  },{URLSearchParams,sessionStorage,window:{location:{hash:`#invite=${token}`,replace:(url:string)=>navigations.push(url)}}});
  return {entry,token,values,navigations,states};
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('join landing stores the fragment before unauthenticated OAuth and never sends it as a URL query',async()=>{
  const f=invitation(false); (f.entry.CanvasInvitation as ()=>unknown)(); await settle();
  assert.equal(f.values.get('northstar.pending-canvas-invitation'),f.token);
  assert.deepEqual(f.navigations,[]); assert.ok(f.states.includes('signin'));
});
test('authenticated join and retained invitation resume open the member workspace and clear only after success',async()=>{
  const f=invitation(true); (f.entry.CanvasInvitation as ()=>unknown)(); await settle();
  assert.deepEqual(f.navigations,['/canvas?workspace=11111111-1111-4111-8111-111111111111']); assert.equal(f.values.size,0);
  f.values.set('northstar.pending-canvas-invitation',f.token); (f.entry.PendingCanvasInvitation as ()=>unknown)(); await settle();
  assert.equal(f.navigations.length,2); assert.equal(f.values.size,0);
});
test('failed retained invitation stays private for retry and returns to the explicit join error flow',async()=>{
  const f=invitation(true,true); f.values.set('northstar.pending-canvas-invitation',f.token);
  (f.entry.PendingCanvasInvitation as ()=>unknown)(); await settle();
  assert.equal(f.values.get('northstar.pending-canvas-invitation'),f.token);
  assert.deepEqual(f.navigations,[`/canvas/join#invite=${f.token}`]);
});
