import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';
import { PrivateWorkspaceSync, type PrivateWorkspaceEntry, type PrivateWorkspaceSyncOptions } from '../lib/canvas-v2/sessions/private-workspace-sync';
import { privateCanvasHistory, type PrivateCanvasHistory } from '../lib/canvas-v2/sessions/private-workspace';
import type { PrivateCanvasWorkspace } from '../lib/canvas-v2/sessions/collaboration-local';
import { SoloSnapshotRecovery, sameSoloSnapshotContent, type SoloRecoveryEntry } from '../lib/canvas-v2/sessions/solo-recovery';
import { encodeSnapshot, decodeSnapshotBlob } from '../lib/canvas-v2/sessions/snapshot';

const revision = (id:string):CanvasV2ArtifactRevision=>({schema:CANVAS_V2_ARTIFACT_SCHEMA,id,state:'committed',createdAt:'2026-10-20T00:00:00Z',document:{html:'<p>Shared</p>',css:''},evidence:[]});
const snapshot = (value:CanvasV2ArtifactRevision):NorthstarSnapshot=>({schema:1,revision:value,turns:[],draft:'private draft',model:'gpt-5.6-sol',effort:'high',viewport:{x:12,y:34,scale:1}});
type Element = {type:unknown;props:Record<string,unknown>};
/** Run the real SessionWorkspace component, effects and callbacks. Substitute
 * only React scheduling and external services, so no browser/DB calls occur. */
function workspace(options:{ownerName?:string;metadataGate?:Promise<void>;denied?:boolean;shared?:boolean;user?:string;sessionOwner?:string;remoteHistory?:PrivateCanvasHistory;remoteFailure?:boolean;remoteGate?:Promise<void>;cachedEntry?:PrivateWorkspaceEntry;localHistory?:PrivateCanvasWorkspace;camera?:NorthstarSnapshot['viewport']}={}) {
  const slots:unknown[]=[];let cursor=0;const effects:Array<()=>unknown>=[],cleanups:Array<()=>unknown>=[];
  const same=(before:unknown[]|undefined,after:unknown[]|undefined)=>Boolean(before&&after&&before.length===after.length&&before.every((value,index)=>Object.is(value,after[index])));
  const react={
    useState:(initial:unknown)=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],(value:unknown)=>{slots[index]=typeof value==='function'?(value as (before:unknown)=>unknown)(slots[index]):value;}];},
    useRef:(initial:unknown)=>{const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},
    useCallback:(callback:unknown,deps:unknown[])=>{const index=cursor++,previous=slots[index] as {deps:unknown[];value:unknown}|undefined;if(!previous||!same(previous.deps,deps))slots[index]={deps,value:callback};return (slots[index] as {value:unknown}).value;},
    useEffect:(callback:()=>void,deps?:unknown[])=>{const index=cursor++,previous=slots[index] as {deps?:unknown[]}|undefined;if(!previous||!same(previous.deps,deps)){slots[index]={deps};effects.push(callback);}},
  };
  let shared=options.shared??false,leaseCalls=0,connectCalls=0,legacyReads=0,remoteReads=0,remoteFailure=options.remoteFailure??false,pending=0;
  const local=snapshot(revision('legacy')),accepted=revision('accepted'),recoveries:CanvasV2ArtifactRevision[]=[],privateWrites:PrivateCanvasHistory[]=[];
  let cached:PrivateWorkspaceEntry|undefined=options.cachedEntry?structuredClone(options.cachedEntry):undefined;
  let soloEntry:SoloRecoveryEntry|undefined;
  let cloud=options.remoteHistory?{history:options.remoteHistory,version:3,path:'owner/room/private/saved.json'}:undefined;
  const cloudWrites:Array<{history:PrivateCanvasHistory;version:number;operationId:string}>=[],cameraWrites:NorthstarSnapshot['viewport'][]=[];
  const identities:Array<{id:string;user:string}>=[],syncs:PrivateWorkspaceSync[]=[],cacheKeys:string[]=[];
  const reports:Record<string,unknown>[]=[];
  const parent={postMessage:(payload:Record<string,unknown>)=>reports.push(payload)};
  const events=new Map<string,Set<(value:unknown)=>void>>();
  const intervals:Array<{callback:()=>void;delay:number}>=[],timeouts:Array<()=>void>=[];
  const queues:Array<{dirty:boolean;flush:()=>Promise<void>}> = [];
  const channels:Array<{callbacks:{multiplayer?:()=>void};closed:boolean}> = [];
  const marker=()=>null;
  const startupReads:string[]=[],names:string[]=[];let authReads=0;
  class Client {
    constructor(options:{name:string}){names.push(options.name);}
    enabled=false;
    async connect(){connectCalls++;if(options.denied)throw new Error('Canvas access denied');this.enabled=shared;return shared;}
    getRevision(){return accepted;}
    getStatus(){return {pending};}
    retainLocalRevision(value:CanvasV2ArtifactRevision){recoveries.push(value);}
    close(){}
  }
  class Queue {
    dirty=false;
    constructor(){queues.push(this);}
    enqueue(){this.dirty=true;}
    async flush(){this.dirty=false;}
  }
  class Live {
    closed=false;
    constructor(_channel:unknown,readonly callbacks:{multiplayer?:()=>void}){channels.push(this);}
    close(){this.closed=true;}
    request(){}
    publish(){}
    upgrade(){}
  }
  class Personal extends PrivateWorkspaceSync {
    constructor(settings:PrivateWorkspaceSyncOptions){super({...settings,delayMs:1_000_000_000});syncs.push(this);}
  }
  class Remote {
    constructor(id:string,user:string){identities.push({id,user});}
    async read(){remoteReads++;await options.remoteGate;if(remoteFailure)throw new Error('Cloud unavailable');return cloud;}
    async write(history:PrivateCanvasHistory,version:number,operationId:string){
      cloudWrites.push({history,version,operationId});if(remoteFailure)throw new Error('Cloud unavailable');
      if(version!==(cloud?.version??0))return {ok:false,version:cloud?.version??0,path:cloud?.path??null};
      cloud={history:structuredClone(history),version:version+1,path:`owner/room/private/${operationId}.json`};return {ok:true,version:cloud.version,path:cloud.path};
    }
  }
  const dependencies:Record<string,unknown>={
    react,
    'react/jsx-runtime':{Fragment:'fragment',jsx:(type:unknown,props:Record<string,unknown>)=>({type,props}),jsxs:(type:unknown,props:Record<string,unknown>)=>({type,props})},
    './canvas-v2-workspace':{CanvasV2Workspace:marker},
    '@/lib/canvas-v2/sessions/snapshot':{SnapshotQueue:Queue,encodeSnapshot,decodeSnapshotBlob},
    '@/lib/canvas-v2/sessions/solo-recovery':{SoloSnapshotRecovery,sameSoloSnapshotContent,soloRecoveryCache:()=>({read:async()=>soloEntry,write:async(entry:SoloRecoveryEntry)=>{soloEntry=entry;},clear:async(expected?:readonly string[])=>{if(!expected||!soloEntry||expected.includes(soloEntry.id))soloEntry=undefined;}})},
    '@/lib/canvas-v2/sessions/store':{getSession:async()=>{startupReads.push('session');await options.metadataGate;return {id:'room',owner_id:options.sessionOwner??'owner',title:'Canvas',snapshot_path:'legacy.json',version:1};},leaseSession:async()=>{leaseCalls++;return true;},loadSnapshot:async()=>{legacyReads++;return local;},renameSession:async()=>{},saveSnapshot:async()=>{}},
    '@/lib/canvas-v2/sessions/writer':{claimSessionWriter:async()=> 'tab'},
    '@/lib/canvas-v2/sessions/collaboration-client':{CanvasCollaborationClient:Client},
    '@/lib/canvas-v2/sessions/collaboration-supabase':{SupabaseCanvasTransport:class {},canvasCollaborationJournal:()=>({})},
    '@/lib/canvas-v2/sessions/collaboration-local':{privateCanvasWorkspace:()=>({read:async()=>{startupReads.push('local');return options.localHistory;},write:async()=>{},readCamera:async()=>{startupReads.push('camera');return options.camera;},writeCamera:async(value:NorthstarSnapshot['viewport'])=>{cameraWrites.push(value);},historyCacheFor:(clientId:string)=>{cacheKeys.push(clientId);return {read:async()=>cached,write:async(entry:PrivateWorkspaceEntry)=>{cached=structuredClone(entry);privateWrites.push(cached.history);}};}})},
    '@/lib/canvas-v2/sessions/private-workspace-sync':{PrivateWorkspaceSync:Personal},
    '@/lib/canvas-v2/sessions/private-workspace':{privateCanvasHistory},
    '@/lib/canvas-v2/sessions/private-workspace-supabase':{SupabasePrivateWorkspace:Remote},
    '@/lib/canvas-v2/model-catalog':{CANVAS_V2_DEFAULT_MODEL:'gpt-6.1-sol'},
    '@/lib/canvas-v2/workspace-coordinate-space':{centeredCanvasV2WorkspaceViewport:()=>({x:0,y:0,scale:1})},
    '@/lib/supabase/client':{createClient:()=>({auth:{getUser:async()=>{authReads++;return {data:{user:{id:'owner',email:'owner@example.invalid'}}};}}})},
    '@/lib/canvas-v2/sessions/live-channel':{LiveSessionChannel:Live},
  };
  const exports:{SessionWorkspace?:(props:unknown)=>Element}={};
  const code=ts.transpileModule(readFileSync(new URL('../components/canvas-v2/session-workspace.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,URLSearchParams,sessionStorage:{},navigator:{locks:{}},BroadcastChannel:class {},window:{parent,location:{hash:'',origin:'https://northstar.invalid'},addEventListener:(type:string,callback:(value:unknown)=>void)=>{let handlers=events.get(type);if(!handlers){handlers=new Set();events.set(type,handlers);}handlers.add(callback);},removeEventListener:(type:string,callback:(value:unknown)=>void)=>events.get(type)?.delete(callback)},setInterval:(callback:()=>void,delay:number)=>{intervals.push({callback,delay});return intervals.length;},clearInterval:()=>{},setTimeout:(callback:()=>void)=>{timeouts.push(callback);return timeouts.length;},clearTimeout:()=>{},require:(name:string)=>{assert.ok(Object.hasOwn(dependencies,name),`Unexpected dependency: ${name}`);return dependencies[name];}});
  const render=()=>{cursor=0;const tree=exports.SessionWorkspace!({id:'room',owner:options.user??'owner',ownerName:options.ownerName,temporary:false});while(effects.length){const cleanup=effects.shift()!();if(typeof cleanup==='function')cleanups.push(cleanup as ()=>unknown);}return tree;};
  const find=(tree:Element):Element|undefined=>tree.type===marker?tree:(Array.isArray(tree.props.children)?tree.props.children:[tree.props.children]).filter(Boolean).map(value=>typeof value==='object'?find(value as Element):undefined).find(Boolean);
  const unmount=()=>{for(const cleanup of cleanups.splice(0).reverse())cleanup();};
  return {render,unmount,reports,parent,startupReads,names,authReads:()=>authReads,pending:(value:number)=>{pending=value;},dispose:()=>{unmount();for(const sync of syncs)void sync.close();},view:()=>find(render())!,recoveries,privateWrites,cloudWrites,cameraWrites,identities,cacheKeys,syncs,queues,channels,intervals,local,accepted,activate:()=>{shared=true;},leases:()=>leaseCalls,connects:()=>connectCalls,legacyReads:()=>legacyReads,remoteReads:()=>remoteReads,online:()=>{remoteFailure=false;},dispatch:(type:string,value:unknown={})=>{for(const handler of events.get(type)??[])handler(value);}};
}
const settle=async()=>{for(let index=0;index<6;index++)await new Promise<void>(resolve=>setImmediate(resolve));};

test('a durable upgrade check precedes legacy lease renewal and remounts the accepted shared revision',async(t)=>{
  const f=workspace();t.after(f.dispose);f.render();await settle();assert.equal(f.leases(),1);
  f.activate();f.intervals.find(interval=>interval.delay===15000)!.callback();await settle();
  assert.equal(f.leases(),1,'do not renew a legacy writer once the room exists');
  assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).revision.id,'accepted');
  assert.ok(f.channels[0].closed);assert.ok(f.connects()>=3);assert.equal(f.privateWrites[0].draft,'private draft');
});

for(const kind of ['css','javascript','evidence'] as const)test(`upgrade retains an unsent legacy ${kind} edit in recovery`,async(t)=>{
  const f=workspace();t.after(f.dispose);f.render();await settle();
  const edited=structuredClone(f.local);edited.revision.id='unsent';
  if(kind==='css')edited.revision.document.css='p{color:red}';
  if(kind==='javascript')edited.revision.document.javascript='window.saved=1';
  if(kind==='evidence')edited.revision.evidence=[{id:'asset',url:'https://assets.invalid/image.png'}] as CanvasV2ArtifactRevision['evidence'];
  (f.view().props.onSnapshot as (value:NorthstarSnapshot,running:boolean)=>void)(edited,false);assert.ok(f.queues[0].dirty);
  f.activate();f.channels[0].callbacks.multiplayer?.();await settle();
  assert.equal(f.recoveries.length,1,'all dirty shared fields need recovery, including edits without HTML changes');
  assert.equal(f.recoveries[0].id,'unsent');
  assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).revision.id,'accepted');
});

test('a chat-only legacy draft remains private without manufacturing shared-source recovery',async(t)=>{
  const f=workspace();t.after(f.dispose);f.render();await settle();const edited=structuredClone(f.local);edited.draft='new private chat';
  (f.view().props.onSnapshot as (value:NorthstarSnapshot,running:boolean)=>void)(edited,false);
  f.activate();f.channels[0].callbacks.multiplayer?.();await settle();
  assert.equal(f.recoveries.length,0);assert.equal(f.privateWrites[0].draft,'new private chat');
  assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).draft,'new private chat');
});

test('shared startup authorization failure stays visible and cannot fall back to legacy editing',async(t)=>{
  const f=workspace({denied:true});t.after(f.dispose);f.render();await settle();
  assert.equal(f.leases(),0);assert.equal(f.queues.length,0);
  assert.match(JSON.stringify(f.render()),/Canvas access denied/);
});

const cloudHistory=(message:string):PrivateCanvasHistory=>({turns:[{id:'turn',message,answer:'Private answer',createdAt:'2026-10-20T00:00:00Z',status:'responded'}],draft:'Cloud private draft',model:'gpt-5.6-sol',effort:'high'});
function findButton(tree:Element,label:string):Element|undefined{
  if(tree.type==='button'&&tree.props.children===label)return tree;
  const children=Array.isArray(tree.props.children)?tree.props.children:[tree.props.children];
  return children.filter(Boolean).map(child=>typeof child==='object'?findButton(child as Element,label):undefined).find(Boolean);
}

test('a fresh device restores this teammate cloud conversation before local fallback and keeps its own camera',async(t)=>{
  const remote=cloudHistory('Bob private conversation'),f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:remote,localHistory:{...snapshot(revision('stale-local')),draft:'Stale local draft'},camera:{x:555,y:123,scale:2}});
  t.after(f.dispose);f.render();await settle();const restored=f.view().props.initialSnapshot as NorthstarSnapshot;
  assert.equal(restored.turns[0].message,'Bob private conversation');assert.equal(restored.draft,'Cloud private draft');
  assert.equal(restored.revision.id,'accepted');assert.equal(restored.viewport.x,555);assert.equal(f.legacyReads(),0);
  assert.deepEqual(f.identities,[{id:'room',user:'bob'}]);assert.equal(f.cloudWrites.length,0);
  assert.deepEqual(f.cacheKeys,['tab'],'the private outbox must use the claimed collaborator tab identity');
});

test('a newly invited teammate never downloads the owner legacy conversation as fallback',async(t)=>{
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner'});t.after(f.dispose);f.render();await settle();
  const restored=f.view().props.initialSnapshot as NorthstarSnapshot;
  assert.equal(restored.turns.length,0);assert.equal(restored.draft,'');assert.equal(f.legacyReads(),0);assert.equal(restored.revision.id,'accepted');
});

test('the original owner alone migrates pre-sharing history into the personal cloud outbox',async(t)=>{
  const f=workspace({shared:true,user:'owner',sessionOwner:'owner'});t.after(f.dispose);f.render();await settle();
  assert.equal(f.legacyReads(),1);assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).draft,'private draft');
  await f.syncs[0].flush();assert.equal(f.cloudWrites.length,1);assert.equal(f.cloudWrites[0].history.draft,'private draft');
  assert.equal('revision' in f.cloudWrites[0].history,false);assert.equal('viewport' in f.cloudWrites[0].history,false);
});

test('shared workspace initial render waits for the private cloud read instead of flashing an empty conversation',async(t)=>{
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:cloudHistory('Restored before render'),remoteGate:gate});t.after(f.dispose);
  f.render();await settle();assert.equal(f.view(),undefined);assert.equal(f.cloudWrites.length,0);
  release();await settle();assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).turns[0].message,'Restored before render');
});

test('failed private read cannot overwrite newer cloud history, and Open saved chat recovers without replacing artwork or camera',async(t)=>{
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:cloudHistory('Existing cloud history'),remoteFailure:true,camera:{x:70,y:80,scale:1.5}});t.after(f.dispose);
  f.render();await settle();const initial=f.view().props.initialSnapshot as NorthstarSnapshot;
  (f.view().props.onSnapshot as (value:NorthstarSnapshot,running:boolean)=>void)({...initial,draft:'New local recovery draft'},false);
  await f.syncs[0].flush();assert.equal(f.cloudWrites.length,0);
  f.online();await f.syncs[0].flush();assert.equal(f.cloudWrites.length,0);assert.equal(f.syncs[0].getStatus().phase,'conflict');
  const saved=findButton(f.render(),'Open saved chat');assert.ok(saved);
  (saved.props.onClick as ()=>void)();await settle();const restored=f.view().props.initialSnapshot as NorthstarSnapshot;
  assert.equal(restored.turns[0].message,'Existing cloud history');assert.equal(restored.revision.id,'accepted');assert.equal(restored.viewport.x,70);
  assert.equal(f.cloudWrites.length,0);assert.equal(f.syncs[0].getStatus().dirty,false);
});

test('closing a workspace before the debounce expires flushes its latest private draft and beforeunload warns while dirty',async(t)=>{
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:cloudHistory('Saved')});t.after(f.dispose);f.render();await settle();
  const initial=f.view().props.initialSnapshot as NorthstarSnapshot;
  (f.view().props.onSnapshot as (value:NorthstarSnapshot,running:boolean)=>void)({...initial,draft:'Latest unmount draft'},false);await settle();
  assert.equal(f.cloudWrites.length,0);assert.equal(f.privateWrites.at(-1)?.draft,'Latest unmount draft');
  let warned=false;f.dispatch('beforeunload',{preventDefault:()=>{warned=true;},returnValue:undefined});assert.equal(warned,true);
  f.unmount();await settle();assert.equal(f.cloudWrites.length,1);assert.equal(f.cloudWrites[0].history.draft,'Latest unmount draft');assert.equal(f.syncs[0].dirty,false);
});

for(const event of ['online','pagehide'])test(`${event} flushes pending private history independently of the camera debounce`,async(t)=>{
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:cloudHistory('Saved')});t.after(f.dispose);f.render();await settle();
  const initial=f.view().props.initialSnapshot as NorthstarSnapshot;
  (f.view().props.onSnapshot as (value:NorthstarSnapshot,running:boolean)=>void)({...initial,draft:`Flush on ${event}`},false);
  f.dispatch(event);await settle();assert.equal(f.cloudWrites.length,1);assert.equal(f.cloudWrites[0].history.draft,`Flush on ${event}`);
});

test('camera-only snapshots cause no personal transcript cache or cloud upload work',async(t)=>{
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:cloudHistory('Saved')});t.after(f.dispose);f.render();await settle();
  const initial=f.view().props.initialSnapshot as NorthstarSnapshot,onSnapshot=f.view().props.onSnapshot as (value:NorthstarSnapshot,running:boolean)=>void;
  // Settle the first legitimate working-memory normalization before measuring
  // camera-only repeats through the real SessionWorkspace and sync controller.
  onSnapshot(initial,false);await f.syncs[0].flush();await settle();const writes=f.cloudWrites.length,caches=f.privateWrites.length;
  for(let index=0;index<20;index++)onSnapshot({...initial,viewport:{x:index,y:0,scale:1}},false);
  await settle();await f.syncs[0].flush();assert.equal(f.cloudWrites.length,writes);assert.equal(f.privateWrites.length,caches);
  f.dispatch('pagehide');await settle();assert.equal(f.cameraWrites.at(-1)?.x,19);
});

test('actual private Retry button reauthorizes a clean offline cache without uploading the unchanged conversation',async(t)=>{
  const history=cloudHistory('Clean cached history');
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:history,remoteFailure:true,cachedEntry:{history,version:3,dirty:false,operationId:'cached'}});t.after(f.dispose);
  f.render();await settle();assert.equal(f.syncs[0].getStatus().phase,'offline');assert.equal(f.syncs[0].dirty,false);
  const reads=f.remoteReads(),retry=findButton(f.render(),'Retry');assert.ok(retry);f.online();
  (retry.props.onClick as ()=>void)();await settle();
  assert.ok(f.remoteReads()>reads);assert.equal(f.syncs[0].getStatus().phase,'saved');assert.equal(f.cloudWrites.length,0);
  assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).turns[0].message,'Clean cached history');
});

test('actual private Retry preserves a stale clean cache as recovery until Open saved chat explicitly loads newer history',async(t)=>{
  const history=cloudHistory('Older cached history');
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:cloudHistory('Newer cloud history'),remoteFailure:true,cachedEntry:{history,version:2,dirty:false,operationId:'cached'},camera:{x:88,y:99,scale:2}});t.after(f.dispose);
  f.render();await settle();const retry=findButton(f.render(),'Retry');assert.ok(retry);f.online();
  (retry.props.onClick as ()=>void)();await settle();assert.equal(f.syncs[0].getStatus().phase,'conflict');
  assert.equal(f.cloudWrites.length,0);assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).turns[0].message,'Older cached history');
  const open=findButton(f.render(),'Open saved chat');assert.ok(open);(open.props.onClick as ()=>void)();await settle();
  const restored=f.view().props.initialSnapshot as NorthstarSnapshot;
  assert.equal(restored.turns[0].message,'Newer cloud history');assert.equal(restored.revision.id,'accepted');assert.equal(restored.viewport.x,88);assert.equal(f.cloudWrites.length,0);
});


test('shared camera snapshots emit no repeated parent status while genuine status, busy, title and menu changes survive',async(t)=>{
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',remoteHistory:cloudHistory('Saved')});t.after(f.dispose);f.render();await settle();
  const initial=f.view().props.initialSnapshot as NorthstarSnapshot,onSnapshot=f.view().props.onSnapshot as (value:NorthstarSnapshot,running:boolean)=>void;
  onSnapshot(initial,false);await f.syncs[0].flush();await settle();onSnapshot(initial,false);
  const count=f.reports.length;
  for(let i=0;i<40;i++)onSnapshot({...initial,viewport:{x:i*10,y:i,scale:1+i/100}},false);
  await settle();assert.equal(f.reports.length,count,'panning cannot post unchanged chrome status to the shell');
  onSnapshot(initial,true);assert.equal(f.reports.length,count+1);assert.equal(f.reports.at(-1)?.busy,true);
  onSnapshot(initial,true);assert.equal(f.reports.length,count+1);
  onSnapshot(initial,false);assert.equal(f.reports.length,count+2);assert.equal(f.reports.at(-1)?.busy,false);
  f.pending(1);onSnapshot(initial,false);assert.equal(f.reports.at(-1)?.saveStatus,'saving');const saving=f.reports.length;
  for(let i=0;i<20;i++)onSnapshot({...initial,viewport:{x:i,y:10,scale:1}},false);assert.equal(f.reports.length,saving);
  f.pending(0);onSnapshot(initial,false);assert.equal(f.reports.length,saving+1);assert.equal(f.reports.at(-1)?.saveStatus,'saved');
  f.dispatch('message',{origin:'https://northstar.invalid',source:f.parent,data:{type:'northstar-rename',frameId:'room',title:'New canvas title'}});f.render();onSnapshot(initial,false);
  assert.equal(f.reports.at(-1)?.title,'New canvas title');
  const menu=f.view().props.onSessionMenu as ()=>void,beforeMenu=f.reports.length;menu();menu();
  assert.equal(f.reports.length,beforeMenu+2,'identical menu actions are intentional toggles, not duplicate status');assert.equal(f.reports.at(-1)?.menu,true);
});


test('shared startup overlaps metadata and device reads and reuses the server authenticated display name',async t=>{
  let release!:()=>void;const metadataGate=new Promise<void>(resolve=>{release=resolve;});
  const f=workspace({shared:true,user:'bob',sessionOwner:'owner',ownerName:'  Bob  ',metadataGate});t.after(f.dispose);
  f.render();await settle();
  try{
    assert.deepEqual(f.startupReads,['session','local','camera']);
    assert.equal(f.authReads(),0,'a server authenticated name needs no repeated identity network call');
    assert.deepEqual(f.names,['Bob']);assert.equal(f.leases(),0);assert.equal(f.legacyReads(),0);
    assert.equal(f.view(),undefined,'the canvas must not accept input before room metadata and private history settle');
  }finally{release();}
  await settle();assert.equal((f.view().props.initialSnapshot as NorthstarSnapshot).revision.id,'accepted');
  assert.equal(f.legacyReads(),0,'teammates still cannot load the owner legacy snapshot');
});

test('a supplied display name cannot bypass a rejected shared room authorization',async t=>{
  const f=workspace({denied:true,ownerName:'Bob'});t.after(f.dispose);f.render();await settle();
  assert.equal(f.authReads(),0);assert.equal(f.leases(),0);assert.equal(f.legacyReads(),0);
  assert.equal(f.view(),undefined);assert.match(JSON.stringify(f.render()),/Canvas access denied/);
});
