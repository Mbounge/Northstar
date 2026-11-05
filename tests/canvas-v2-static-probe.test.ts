import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {staticProbeScrollTargets,staticProbeCoverageRanges,validateAccessibilityStaticProbeRequest} from '../lib/canvas-v2/accessibility-native';
import {stfxExampleScreen} from '../lib/canvas-v2/stfx-accessibility-examples';
import {encodeCanvasV2Screen} from '../lib/canvas-v2/interactive-screen';
import {runAccessibilityNative} from '../worker/accessibility-native.server';
const request=()=>{const screen=stfxExampleScreen('statistics',true),snapshot={html:'<body><main>Actual current state</main><footer>Lower content</footer></body>',css:'body{min-height:200vh}',width:880,height:820};return {mode:'static-probe',nodeId:'course',sourceVersion:'current',sourceSha256:createHash('sha256').update(encodeCanvasV2Screen(screen)).digest('hex'),screen,steps:[],probe:{scenario:'text-resize',stateEpoch:3,snapshot,snapshotSha256:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}};};
test('static probe targets preserve viewport height and cover ordinary pages through the actual bottom',()=>{
 for(const [content,height] of [[600,820],[1600,820],[4000,820]]){const targets=staticProbeScrollTargets(content,height),views=targets.map(y=>({y,height})),coverage=staticProbeCoverageRanges(Math.max(content,height),views);assert.equal(targets[0],0);assert.equal(targets.at(-1),Math.max(0,content-height));assert.ok(targets.length<=6);assert.equal(coverage.uncoveredRanges.length,0);}
});
test('bounded tall-page tiles disclose uncaptured ranges and actual offsets rather than inventing full coverage',()=>{
 const targets=staticProbeScrollTargets(18000,820);assert.equal(targets.length,6);assert.equal(targets[0],0);assert.equal(targets.at(-1),17180);
 const coverage=staticProbeCoverageRanges(18000,targets.map(y=>({y,height:820})));assert.equal(coverage.uncoveredRanges.length,5);assert.equal(coverage.capturedRanges.at(-1)?.end,18000);
 const snapped=staticProbeCoverageRanges(4000,[{y:0,height:820},{y:0,height:820},{y:3180,height:820}]);assert.deepEqual(snapped.uncoveredRanges,[{start:820,end:3180}]);
 const budget=staticProbeCoverageRanges(1600,[{y:0,height:820}]);assert.deepEqual(budget.uncoveredRanges,[{start:820,end:1600}]);
});
test('static snapshot requests retain saved-source and captured-state identity with bounded data-only resources',()=>{
 const actual=request(),valid=validateAccessibilityStaticProbeRequest(actual);assert.equal(valid.probe.snapshot.height,820);assert.equal(valid.steps.length,0);actual.probe.snapshot.html='changed';assert.notEqual(actual.probe.snapshot.html,valid.probe.snapshot.html);
 for(const patch of [{steps:[{action:'key',key:'End'}]},{probe:{...request().probe,stateEpoch:-1}},{probe:{...request().probe,scenario:'execute-script'}},{probe:{...request().probe,snapshotSha256:'trust me'}},{probe:{...request().probe,snapshot:{...request().probe.snapshot,height:99999}}},{probe:{...request().probe,snapshot:{...request().probe.snapshot,captureImages:{'northstar-capture-image:1':'https://private.invalid/image'}}}}])assert.throws(()=>validateAccessibilityStaticProbeRequest({...request(),...patch}));
});
test('worker rejects mismatched snapshot and saved-source bytes before launching a browser',async()=>{
 const stale=request();stale.probe.snapshot.html+='changed';await assert.rejects(runAccessibilityNative(stale,new AbortController().signal),/snapshot hash/);
 const source=request();source.sourceSha256='0'.repeat(64);await assert.rejects(runAccessibilityNative(source,new AbortController().signal),/source or semantic snapshot hash/);
});
