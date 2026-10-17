import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SubagentLocalCreativeRuntime } from '../app/canvas-v2-e2e/codex-subagent/relay';
import { runCreativeJob } from '../lib/canvas-v2/creative/bridge';
import { listImageGenerationRequests, claimImageGeneration, submitImageGenerationArtifact, pngInfo } from '../scripts/northstar-imagegen-protocol.mjs';

// Protocol/packaging fixture only. This PNG is never claimed as a genuine
// generated product asset or quality evidence; actual author calls use imagegen.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE4sAAAAASUVORK5CYII=','base64');
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'northstar-imagegen-test-'));
  const runtime=new SubagentLocalCreativeRuntime(()=>{throw new Error('No model selection or paid API may run in the image relay');},'',{root,timeoutMs:5000,pollMs:5});
  const artifact=join(root,'actual-tool-payload-fixture.png');await writeFile(artifact,png);
  const pending=async()=>{const deadline=Date.now()+1000;while(Date.now()<deadline){const jobs=await listImageGenerationRequests(root);if(jobs.length)return jobs[0];await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('No image job request');};
  return {root,runtime,artifact,pending,close:async()=>{runtime.dispose();await new Promise(resolve=>setTimeout(resolve,20));await rm(root,{recursive:true,force:true});}};
}

test('normal creative request/poll delivers immutable author prompt and actual PNG through generated asset factory',async()=>{
  const t=await fixture();
  try{
    const args={prompt:'Original author food composition\nKeep the chosen colour and lighting.',label:'Food hero',size:'1536x1024',quality:'high',background:'opaque'};
    const action={call_id:'image-call',turn_id:'author-turn',name:'generate_image',arguments:args};
    const resultPromise=runCreativeJob(async body=>body.op==='creative'?Response.json(t.runtime.start('image-call','generate_image',args,{inputs:[]})):Response.json(t.runtime.job('image-call')),action,{inputs:[]},new AbortController().signal);
    const request=await t.pending();assert.deepEqual(request.arguments,args);assert.equal(request.toolArguments.prompt,args.prompt);
    assert.equal(request.toolArguments.transparent_background,false);assert.equal(request.toolArguments.referenced_image_paths,undefined);
    assert.equal((await claimImageGeneration(request.jobPath,request.requestHash)).status,'claimed');
    assert.equal((await claimImageGeneration(request.jobPath,request.requestHash)).status,'already-claimed');
    assert.equal((await submitImageGenerationArtifact(request.jobPath,request.requestHash,t.artifact)).status,'submitted');
    const result=await resultPromise;
    assert.equal(result.assets[0].authority,'inferred');assert.ok(result.assets[0].tags?.includes('generated'));
    assert.ok(result.assets[0].tags?.includes('transport:codex-built-in-imagegen'));assert.equal(result.artifacts[0].origin,'generated');
    assert.equal(result.artifacts[0].dataUrl,'data:image/png;base64,'+png.toString('base64'));assert.equal(result.assets[0].url,result.artifacts[0].dataUrl);
    assert.match(result.warnings![0],/not directly configurable/);assert.match(result.warnings![0],/1×1/);
    assert.equal((await submitImageGenerationArtifact(request.jobPath,request.requestHash,t.artifact)).status,'already-submitted');
    assert.deepEqual(await listImageGenerationRequests(t.root),[]);
    assert.equal(t.runtime.start('image-call','generate_image',args,{inputs:[]}).status,'completed');
    assert.throws(()=>t.runtime.start('image-call','generate_image',{...args,prompt:'Different prompt'},{inputs:[]}),/immutable/);
  }finally{await t.close();}
});

test('retained edit bytes are the only referenced files and source lineage survives result packaging',async()=>{
  const t=await fixture();
  try{
    const args={prompt:'Edit these exact retained pixels.',label:'Edited photo',inputAssetIds:['ns-asset-7'],background:'transparent'};
    const context={inputs:[{reference:'ns-asset-7',id:'retained-original',label:'Original',dataUrl:'data:image/png;base64,'+png.toString('base64')}]};
    t.runtime.start('edit-call','generate_image',args,context);const request=await t.pending();
    assert.equal(request.inputs.length,1);assert.equal(request.inputs[0].id,'retained-original');
    assert.deepEqual(await readFile(request.inputs[0].path),png);assert.deepEqual(request.toolArguments.referenced_image_paths,[request.inputs[0].path]);assert.equal(request.toolArguments.transparent_background,true);
    await claimImageGeneration(request.jobPath,request.requestHash);await submitImageGenerationArtifact(request.jobPath,request.requestHash,t.artifact);
    const deadline=Date.now()+1000;while(t.runtime.job('edit-call')?.status==='running'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
    const job=t.runtime.job('edit-call');assert.equal(job?.status,'completed');if(job?.status!=='completed')throw new Error('Image edit did not finish');
    assert.deepEqual(job.result.artifacts[0].inputAssetIds,['retained-original']);assert.ok(job.result.assets[0].tags?.includes('derived-from:retained-original'));
  }finally{await t.close();}
});

test('unclaimed, stale, corrupted or replacement artifacts are rejected',async()=>{
  const t=await fixture();
  try{
    t.runtime.start('guard-call','generate_image',{prompt:'Exact author request',label:'Guarded'},{inputs:[]});const request=await t.pending();
    await assert.rejects(submitImageGenerationArtifact(request.jobPath,request.requestHash,t.artifact),/Claim/);
    await assert.rejects(claimImageGeneration(request.jobPath,'stale-hash'),/stale/);
    await claimImageGeneration(request.jobPath,request.requestHash);
    const invalid=join(t.root,'invalid.png');await writeFile(invalid,png.subarray(0,32));
    await assert.rejects(submitImageGenerationArtifact(request.jobPath,request.requestHash,invalid),/PNG/);
    await submitImageGenerationArtifact(request.jobPath,request.requestHash,t.artifact);
    const replacement=Buffer.from(png);replacement[30]^=1;await writeFile(invalid,replacement);
    await assert.rejects(submitImageGenerationArtifact(request.jobPath,request.requestHash,invalid),/already exists/);
    assert.throws(()=>pngInfo(Buffer.from('Not image bytes')),/PNG/);
  }finally{await t.close();}
});

test('Stop invalidates pending image jobs and late results cannot become retained assets',async()=>{
  const t=await fixture();
  try{
    t.runtime.start('stop-call','generate_image',{prompt:'Pending image',label:'Stopped'},{inputs:[]});const request=await t.pending();await claimImageGeneration(request.jobPath,request.requestHash);
    t.runtime.cancel();await new Promise(resolve=>setTimeout(resolve,30));
    await assert.rejects(submitImageGenerationArtifact(request.jobPath,request.requestHash,t.artifact),/cancelled/);
    assert.equal(t.runtime.job('stop-call')?.status,'failed');assert.deepEqual(await listImageGenerationRequests(t.root),[]);
  }finally{await t.close();}
});

test('invalid image requests and unauthorized URLs/paths never produce executable relay jobs',async()=>{
  const t=await fixture();
  try{
    assert.throws(()=>t.runtime.start('shell','workspace_run',{command:'echo invalid'},{inputs:[]}),/disabled/);
    t.runtime.start('bad-input','generate_image',{prompt:'Edit',label:'No source',inputAssetIds:['unknown']},{inputs:[{reference:'unknown',id:'foreign',label:'Foreign',dataUrl:'https://example.com/private.png'}]});
    t.runtime.start('bad-prompt','generate_image',{prompt:'',label:'Empty'},{inputs:[]});await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(t.runtime.job('bad-input')?.status,'failed');assert.equal(t.runtime.job('bad-prompt')?.status,'failed');assert.deepEqual(await listImageGenerationRequests(t.root),[]);
  }finally{await t.close();}
});

test('a cached host refreshes its creative factory for a fresh session while its existing session remains unchanged',async()=>{
  const {SubagentCodexTransport,SUBAGENT_TEST_KEY,SUBAGENT_TEST_MODEL}=await import('../app/canvas-v2-e2e/codex-subagent/relay');
  const {CodexSessionHost}=await import('../lib/canvas-v2/codex-app-server/server');
  const {ManagedAgentClient}=await import('../lib/canvas-v2/managed-agent/client');
  const {object}=await import('../lib/canvas-v2/managed-agent/protocol');
  const root=await mkdtemp(join(tmpdir(),'northstar-imagegen-cached-host-'));
  const directories:string[]=[];
  class OldCreative extends SubagentLocalCreativeRuntime{
    override start(...args:Parameters<SubagentLocalCreativeRuntime['start']>){if(args[1]==='generate_image')throw new Error('generate_image disabled by cached old factory');return super.start(...args);}
  }
  const host=new CodexSessionHost(async()=>{const dir=await mkdtemp(join(root,'session-'));directories.push(dir);return new SubagentCodexTransport(dir,5);},async()=>{throw new Error('External requests forbidden');},{sessions:3,perOwner:1},undefined,3,(_key,model)=>new OldCreative(model));
  host.configure('Actual tool host',['generate_image'].map(name=>({type:'function' as const,name,description:'Image request',inputSchema:{type:'object'}})));
  const options=(owner:string)=>({owner,key:SUBAGENT_TEST_KEY,signal:new AbortController().signal});
  const makeClient=(owner:string)=>{
    const client: InstanceType<typeof ManagedAgentClient>=new ManagedAgentClient({endpoint:'/test',onView:()=>{},fetcher:async(_url,init)=>host.handle(object(JSON.parse(String(init?.body))),{...options(owner),signal:init?.signal??new AbortController().signal}),execute:(action,signal)=>runCreativeJob((body,s)=>client.request(body,s),action,{inputs:[]},signal)});
    return client;
  };
  const old=makeClient('old-owner'),fresh=makeClient('new-owner');
  const wait=async<T>(read:()=>Promise<T>,accept:(value:T)=>boolean)=>{const deadline=Date.now()+2500;while(Date.now()<deadline){try{const value=await read();if(accept(value))return value;}catch{}await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Fresh-session image tool did not reach expected state');};
  const inbox=(dir:string)=>readFile(join(dir,'inbox.json'),'utf8').then(JSON.parse);
  const authorRequest=async(dir:string)=>{const packet=await wait(()=>inbox(dir),value=>value.kind==='turn');await writeFile(packet.responsePath,JSON.stringify({exchangeId:packet.exchangeId,turnId:packet.turnId,action:{type:'tool',name:'generate_image',arguments:{prompt:'Exact fresh author prompt',label:'Fresh request'}}}));};
  try{
    await old.send('Old session',[],SUBAGENT_TEST_MODEL,'old');await wait(()=>inbox(directories[0]),packet=>packet.kind==='turn');
    // This is the same new-prototype call used by the versioned Next route.
    CodexSessionHost.prototype.configureCreativeFactory.call(host,(_key,model)=>new SubagentLocalCreativeRuntime(model,'',{root:join(root,'images'),timeoutMs:5000,pollMs:5}));
    await authorRequest(directories[0]);const failed=await wait(()=>inbox(directories[0]),packet=>packet.kind==='tool_result');
    assert.equal(failed.success,false);assert.match(JSON.stringify(failed.contentItems),/cached old factory/);
    await fresh.send('Fresh session',[],SUBAGENT_TEST_MODEL,'fresh');await authorRequest(directories[1]);
    const jobs=await wait(()=>listImageGenerationRequests(join(root,'images')),jobs=>jobs.length===1),request=jobs[0];assert.equal(request.arguments.prompt,'Exact fresh author prompt');
    await claimImageGeneration(request.jobPath,request.requestHash);const image=join(root,'fixture.png');await writeFile(image,png);await submitImageGenerationArtifact(request.jobPath,request.requestHash,image);
    const result=await wait(()=>inbox(directories[1]),packet=>packet.kind==='tool_result');assert.equal(result.success,true);assert.match(JSON.stringify(result.contentItems),/generated/);
  }finally{old.dispose();fresh.dispose();host.dispose();await new Promise(resolve=>setTimeout(resolve,30));await rm(root,{recursive:true,force:true});}
});
