import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { simulationFixture } from './simulation-agent-fixture';
import { makeArtifact } from '../scripts/simulation-agent/artifact';
import { verifyArtifact } from '../scripts/simulation-agent/verify';

test('actual sandbox executes local stateful form, navigation, empty-value assertion and repeated factory reset', { timeout: 45000 }, async () => {
  const f = await simulationFixture();
  try {
    const artifact = makeArtifact(f.implementation, f.plan, f.evidence, []);
    const report = await verifyArtifact(artifact, f.evidence, [], join(f.root, 'valid'), new AbortController().signal);
    assert.deepEqual(report.failures, []); assert.equal(report.passed, true); assert.equal(report.resetPassed, true);
    assert.equal(report.states.length, 2); assert.equal(report.journeys[0].steps, 4);
    assert.equal(report.blockedRequests.length, 0); assert.equal(report.runtimeErrors.length, 0);
    // Pixel numbers remain diagnostics: the fixture PNGs are not realistic
    // app references and this test makes no visual fidelity approval.
  } finally { await f.close(); }
});

test('real no-op controls fail rather than passing from an authored success claim', { timeout: 45000 }, async () => {
  const f = await simulationFixture();
  try {
    const implementation = { ...f.implementation, javascript: f.implementation.javascript.replace("()=>nsPreview.show('done')", '()=>{}') };
    const report = await verifyArtifact(makeArtifact(implementation, f.plan, f.evidence, []), f.evidence, [], join(f.root, 'broken'), new AbortController().signal);
    assert.equal(report.passed, false); assert.equal(report.journeys[0].passed, false);
    assert.match(report.failures.join(' '), /interaction failed|no executed route/);
  } finally { await f.close(); }
});

test('end-to-end protocol packages only reviewed pixels and a verified receipt cannot be reused after tampering', { timeout: 45000 }, async () => {
  const f = await simulationFixture();
  const {prepareSimulation,runSimulation} = await import('../scripts/simulation-agent/agent');
  const {readFile,writeFile,readdir} = await import('node:fs/promises');
  const {submitReply}=await import('../scripts/simulation-agent/model');
  try {
    const directory=join(f.root,'pipeline');
    await prepareSimulation(f.root,directory,{width:360,height:640});
    const options={provider:'exchange' as const,model:'fixture-only',maxRounds:1,maxCalls:10,signal:new AbortController().signal};
    let result=await runSimulation(directory,options);
    for(let stage=0;stage<8 && result.stage==='awaiting_agent';stage++) {
      const path=String('request' in result && result.request),request=JSON.parse(await readFile(path,'utf8'));
      let reply;
      if(request.purpose==='plan') reply=f.plan;
      else if(request.purpose.startsWith('author')) reply=f.implementation;
      else {
        // Scripted reviewer tests transport/resume only, not real-app fidelity.
        const context=request.context as {samples:Array<{id:string;stateId:string;captureId:string}>};
        reply={summary:'Synthetic protocol fixture only',assessments:context.samples.map(sample=>({...f.review.assessments.find(a=>a.stateId===sample.stateId)!,sampleId:sample.id}))};
      }
      await submitReply(path,reply); result=await runSimulation(directory,options);
    }
    assert.equal((await readdir(join(directory,'jobs'))).length,5,'Resuming must reuse the same five jobs rather than silently spawning new reviews');
    assert.equal(result.stage,'verified');
    const report=JSON.parse(await readFile(join(directory,'attempt-1/verification.json'),'utf8'));
    assert.equal(report.samples.length,5); // fresh entry plus four actual actions
    const cached=await runSimulation(directory,{...options,modelDriver:{json:async()=>{throw Error('Cached release must not spend another call')}}});
    assert.equal(cached.stage,'verified'); assert.equal('cached' in cached && cached.cached,true);
    await writeFile(join(directory,'attempt-1/preview.html'),'tampered');
    await assert.rejects(runSimulation(directory,options),/release files changed/);
  } finally {await f.close();}
});

test('runtime exceptions cannot be hidden behind working navigation', { timeout: 45000 }, async () => {
  const f=await simulationFixture();
  try {
    const source={...f.implementation,javascript:f.implementation.javascript+'\nsetTimeout(()=>{throw Error("deliberate-runtime-failure")},0);'};
    const report=await verifyArtifact(makeArtifact(source,f.plan,f.evidence,[]),f.evidence,[],join(f.root,'runtime-error'),new AbortController().signal);
    assert.equal(report.passed,false);assert.match(report.runtimeErrors.join(' '),/deliberate-runtime-failure/);
  }finally{await f.close();}
});
