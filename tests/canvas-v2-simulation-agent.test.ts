import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { simulationFixture } from './simulation-agent-fixture';
import { loadEvidence, assertEvidenceUnchanged, sha, redact } from '../scripts/simulation-agent/evidence';
import { validatePlan, makeArtifact } from '../scripts/simulation-agent/artifact';
import { withRunLock, prepareSimulation, runSimulation, reviewBatchPassed } from '../scripts/simulation-agent/agent';
import { CheckpointModel, AwaitingAgent, submitReply } from '../scripts/simulation-agent/model';
import { REVIEW_SCHEMA } from '../scripts/simulation-agent/contracts';
import type { Verification } from '../scripts/simulation-agent/verify';

test('source adapters retain exact canonical pixels and reject traversal, source mutation and mixed viewports', async () => {
  const f = await simulationFixture();
  try {
    assert.equal(f.evidence.captures.length, 2);
    const input = await readFile(join(f.root, 'simulation_capture.json'), 'utf8');
    await writeFile(join(f.root, 'simulation_capture.json'), input.replace('screenshots/first.png', '../outside.png'));
    await assert.rejects(loadEvidence(f.root), /ENOENT|escapes/);
    await assert.rejects(assertEvidenceUnchanged(f.evidence), /manifest changed/);
    await writeFile(join(f.root, 'simulation_capture.json'), input);
    await writeFile(f.evidence.captures[0].file, 'changed');
    await assert.rejects(assertEvidenceUnchanged(f.evidence), /pixels or assets changed/);
    assert.doesNotMatch(redact({ password: 'secret-value', text: 'person@example.com code 123456' }), /secret-value|person@example|123456/);
  } finally { await f.close(); }
});

test('onboarding adapter excludes external inbox captures and keeps partial capture scope explicit', async () => {
  const f = await simulationFixture();
  try {
    await writeFile(join(f.root, 'onboarding_manifest.json'), JSON.stringify({ metadata: { app: 'Example', package: 'org.example' }, ordered_screenshots: [{ sequence: 1, filename: 'first.png' }, { sequence: 2, filename: 'second.png' }], timeline: [{ action: 'CLICK', screenshot: 'first.png', target: 'Start' }, { action: 'EMAIL_OPENED', screenshot: 'second.png', screen_desc: 'external inbox' }], result: { status: 'PARTIAL' } }));
    const evidence = await loadEvidence(f.root, { manifest: 'onboarding_manifest.json' });
    assert.equal(evidence.captures.length, 1); assert.equal(evidence.observations.length, 1);
    assert.match(evidence.limitations.join(' '), /external-app.*excluded/); assert.match(evidence.limitations.join(' '), /partial/);
  } finally { await f.close(); }
});

test('capture contract cannot omit a state, invent evidence or disguise a full screenshot as artwork', async () => {
  const f = await simulationFixture();
  try {
    validatePlan(f.plan, f.evidence);
    const omitted = structuredClone(f.plan); omitted.states.pop(); assert.throws(() => validatePlan(omitted, f.evidence), /Every scoped capture/);
    const invented = structuredClone(f.plan); invented.journeys[0].evidenceIds = ['invented']; assert.throws(() => validatePlan(invented, f.evidence), /actual captured/);
    const crop = structuredClone(f.plan); crop.crops.push({ id: 'screen', captureId: 'capture-1', x: 0, y: 0, width: 360, height: 640, purpose: 'shortcut' }); assert.throws(() => validatePlan(crop, f.evidence), /never a complete screen/);
    assert.throws(() => makeArtifact({ ...f.implementation, html: '<img src="https://remote.test/image">' }, f.plan, f.evidence, []), /retained asset/);
    assert.throws(() => makeArtifact({ ...f.implementation, assetIds: ['capture-1'] }, f.plan, f.evidence, []), /unknown retained asset/);
  } finally { await f.close(); }
});

test('separate reviewer must assess every current state; a clean visual opinion cannot override failed behavior', async () => {
  const f = await simulationFixture();
  const observed = { passed: true } as Verification;
  try {
    assert.equal(reviewBatchPassed(f.review, f.plan.states, observed), true);
    assert.equal(reviewBatchPassed(f.review, f.plan.states, { ...observed, passed: false }), false);
    assert.equal(reviewBatchPassed({ ...f.review, assessments: f.review.assessments.slice(1) }, f.plan.states, observed), false);
    const stale = structuredClone(f.review); stale.assessments[0].captureId = 'old'; assert.equal(reviewBatchPassed(stale, f.plan.states, observed), false);
    const unknown = structuredClone(f.review); unknown.assessments[0].typography = 'unverified'; assert.equal(reviewBatchPassed(unknown, f.plan.states, observed), false);
  } finally { await f.close(); }
});

test('exchange is resumable, rejects stale replies and cannot silently invoke a paid provider', async () => {
  const f = await simulationFixture();
  try {
    const request = { purpose: 'review', instructions: 'Independent fixture', context: { candidate: 'one' }, schema: REVIEW_SCHEMA, images: [{ label: 'Original', path: f.evidence.captures[0].file, sha256: f.evidence.captures[0].sha256 }] };
    const model = () => new CheckpointModel({ directory: join(f.root, 'jobs'), provider: 'exchange', model: 'fixture', maxCalls: 1, signal: new AbortController().signal, fetcher: async () => { throw new Error('No paid calls allowed'); } });
    let path = '';
    await assert.rejects(model().json(request), error => { assert.ok(error instanceof AwaitingAgent); path = error.request; return true; });
    await submitReply(path, f.review); assert.deepEqual(await model().json(request), f.review);
    await assert.rejects(submitReply(path, { ...f.review, summary: 'replacement' }), /already exists/);
    await assert.rejects(model().json({ ...request, context: { candidate: 'two' } }), /Durable model-call budget/);
    const response = join(path, '..', 'response.json'); const data = JSON.parse(await readFile(response, 'utf8')); data.digest = sha('different'); await writeFile(response, JSON.stringify(data));
    await assert.rejects(model().json(request), /Stale model response/);
  } finally { await f.close(); }
});

test('uncertain provider calls are never automatically repeated on resume', async () => {
  const f = await simulationFixture(); let calls = 0;
  try {
    const model = () => new CheckpointModel({ directory: join(f.root, 'jobs'), provider: 'openai', model: 'fixture', key: 'fake-test-key', maxCalls: 2, signal: new AbortController().signal, fetcher: async () => { calls++; throw new Error('deliberately interrupted fake network'); } });
    const request = { purpose: 'review', instructions: 'Fixture', context: {}, schema: REVIEW_SCHEMA, images: [] };
    await assert.rejects(model().json(request), /fake network/);
    await assert.rejects(model().json(request), /uncertain outcome/); assert.equal(calls, 1);
  } finally { await f.close(); }
});

test('run locking prevents concurrent writers and preparation never rewrites captures', async () => {
  const f = await simulationFixture();
  try {
    const output = join(f.root, 'simulation'), before = await readFile(f.evidence.source);
    await withRunLock(output, async () => { await assert.rejects(withRunLock(output, async () => undefined), /locked/); await prepareSimulation(f.root, output, { width: 360, height: 640 }); });
    assert.deepEqual(await readFile(f.evidence.source), before);
    await withRunLock(output, async () => undefined);
  } finally { await f.close(); }
});

test('bounded repair consumes real failed-check receipts and never releases an unverified candidate', async () => {
  const f = await simulationFixture();
  try {
    const output = join(f.root, 'simulation'); await mkdir(output); await prepareSimulation(f.root, output, { width: 360, height: 640 });
    const purposes: string[] = []; let verificationCalls = 0;
    const result = await runSimulation(output, { provider: 'exchange', model: 'fixture', maxCalls: 10, maxRounds: 2, signal: new AbortController().signal,
      modelDriver: { json: async request => { purposes.push(request.purpose); return request.purpose === 'plan' ? f.plan : request.purpose.startsWith('author') ? f.implementation : f.review; } },
      verify: async () => { verificationCalls++; return { passed: false, failures: ['Button does not navigate'], samples: [], states: [], journeys: [], blockedRequests: [], resetPassed: true, runtimeErrors: [] }; } });
    assert.equal(result.stage, 'needs_review'); assert.equal(verificationCalls, 2); assert.ok(purposes.includes('author-2'));
    await assert.rejects(readFile(join(output, 'release.json')), /ENOENT/);
  } finally { await f.close(); }
});

test('APK analyzer outputs are retained automatically and related onboarding/browsing evidence shares one immutable contract', async () => {
  const f=await simulationFixture();
  const {loadCombinedEvidence}=await import('../scripts/simulation-agent/evidence');
  try{
    await mkdir(join(f.root,'extracted_icons'));
    const icon=join(f.root,'extracted_icons/icon.png');
    // A different small image is authentic fixture artwork, not a whole screen.
    const sharp=(await import('sharp')).default;
    await writeFile(icon,await sharp({create:{width:24,height:24,channels:3,background:'#8060ff'}}).png().toBuffer());
    const context=join(f.root,'apk_intelligence.json');await writeFile(context,JSON.stringify({color_palette:['#8060ff']}));
    const evidence=await loadEvidence(f.root);
    assert.equal(evidence.assets.length,1);assert.equal(evidence.assets[0].origin,'extracted_icons/icon.png');
    await writeFile(context,JSON.stringify({color_palette:['#ff0000']}));
    await assert.rejects(assertEvidenceUnchanged(evidence),/pixels or assets changed/);
    const combined=await loadCombinedEvidence(f.root,[f.root]);
    assert.equal(combined.captures.length,2);assert.equal(combined.assets.length,1);assert.equal(combined.observations.length,4);
    await assertEvidenceUnchanged(combined);
    const modified={...combined,context:'tampered'};await assert.rejects(assertEvidenceUnchanged(modified),/Prepared evidence was modified/);
  }finally{await f.close();}
});

test('explicit provider adapter sends strict image-bound requests and caches a completed response without repeating it', async () => {
  const f=await simulationFixture();let calls=0;
  try{
    const request={purpose:'review',instructions:'Fixture review',context:{},schema:REVIEW_SCHEMA,images:[{label:'Fixture',path:f.evidence.captures[0].file,sha256:f.evidence.captures[0].sha256}]};
    const model=()=>new CheckpointModel({directory:join(f.root,'provider'),provider:'openai',model:'fixture-only',key:'fake-key',maxCalls:2,signal:new AbortController().signal,fetcher:async(url,options)=>{
      calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(options?.body));
      assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.input[0].content[2].type,'input_image');
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(f.review)}]}]}),{status:200});
    }});
    assert.deepEqual(await model().json(request),f.review);assert.deepEqual(await model().json(request),f.review);assert.equal(calls,1);
  }finally{await f.close();}
});

test('browsing, storyboard and iOS adapters preserve their capture contract and exclude external iOS bundles', async () => {
  const f=await simulationFixture();
  try{
    await writeFile(join(f.root,'session_manifest.json'),JSON.stringify({app:'Fixture',tabs:[{name:'Home',survey_screenshots:['screenshots/first.png'],interactions:[{action:'tap',target:'Continue',screenshot_files:['second.png']}]}]}));
    const browsing=await loadEvidence(f.root,{manifest:'session_manifest.json'});
    assert.equal(browsing.captures.length,2);assert.equal(browsing.observations.length,1);assert.equal(browsing.observations[0].captureId,'capture-2');
    await writeFile(join(f.root,'capture_storyboard.json'),JSON.stringify({app:'Fixture',lanes:[{title:'Onboarding',screens:['first.png','second.png']}],edges:[{from:'first.png',to:'second.png',label:'Continue',basis:'observed'}]}));
    const storyboard=await loadEvidence(f.root,{manifest:'capture_storyboard.json'});
    assert.equal(storyboard.captures.length,2);assert.match(storyboard.observations[0].detail,/Continue/);
    await writeFile(join(f.root,'ios_capture_state.json'),JSON.stringify({root_signature:'entry',screens:[{name:'first.png',signature:'entry',active_bundle:'org.fixture',labels:['Start']},{name:'second.png',signature:'mail',active_bundle:'com.apple.mail',labels:['Inbox']}],transitions:[{from:'entry',action:'tap',target:'Start'}]}));
    const ios=await loadEvidence(f.root,{manifest:'ios_capture_state.json'});
    assert.equal(ios.captures.length,1);assert.equal(ios.viewport.width,390);assert.match(ios.limitations.join(' '),/external-app captures excluded/);
  }finally{await f.close();}
});

test('different capture aspect ratios are rejected instead of stretching an app to fit', async () => {
  const f=await simulationFixture();
  try{
    const sharp=(await import('sharp')).default;
    await writeFile(f.evidence.captures[1].file,await sharp({create:{width:360,height:580,channels:3,background:'#fff'}}).png().toBuffer());
    await assert.rejects(loadEvidence(f.root),/Mixed viewport\/panorama/);
  }finally{await f.close();}
});
