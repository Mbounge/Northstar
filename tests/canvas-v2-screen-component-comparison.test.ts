import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasV2ComponentReferencePairs, canvasV2PlannedComponentComparisons } from '../lib/canvas-v2/screen-component-comparison';

const reference={captureViewport:{x:4,y:4,width:375,height:812},controls:[{selector:'[data-northstar-control="control-8"]',label:'Add season goal',tag:'button',bounds:{x:36,y:327,width:305,height:77}}]};
const request={reference,referenceViewport:{width:383,height:820},currentViewport:{width:375,height:812},currentTargets:[{selector:'[data-northstar-control="control-8"]',label:'Add season goal',rect:{x:36,y:527,width:305,height:77}}]};

test('the exact component is compared across different actual scroll offsets and reference bezels',()=>{
  const [pair]=canvasV2ComponentReferencePairs(request);
  assert.equal(pair.label,'Add season goal');
  assert.equal(pair.referenceRect.y,331/820);
  assert.equal(pair.screenRect.y,527/812);
  assert.equal(pair.referenceRect.x,40/383);
  assert.equal(pair.screenRect.x,36/375);
  assert.equal(pair.referenceRect.width,305/383);
});

test('ambiguous labels, clipped controls and unknown coordinates do not become misleading comparison crops',()=>{
  assert.deepEqual(canvasV2ComponentReferencePairs({...request,currentTargets:[...request.currentTargets,...request.currentTargets]}),[]);
  assert.deepEqual(canvasV2ComponentReferencePairs({...request,currentTargets:[{...request.currentTargets[0],rect:{x:36,y:780,width:305,height:77}}]}),[]);
  assert.deepEqual(canvasV2ComponentReferencePairs({...request,currentTargets:[{...request.currentTargets[0],rect:{x:36,y:527,width:NaN,height:77}}]}),[]);
  assert.deepEqual(canvasV2ComponentReferencePairs({...request,currentTargets:[{...request.currentTargets[0],rect:{x:36,y:527,height:77}}]}),[]);
  assert.deepEqual(canvasV2ComponentReferencePairs({...request,reference:{controls:reference.controls}}),[]);
});

test('a stable reference label can match a native id without inferring correspondence from nearby geometry',()=>{
  assert.equal(canvasV2ComponentReferencePairs({...request,currentTargets:[{...request.currentTargets[0],selector:'#goal'}]}).length,1);
  assert.deepEqual(canvasV2ComponentReferencePairs({...request,currentTargets:[{...request.currentTargets[0],selector:'#other',label:'Another card'}]}),[]);
});


test('larger product cards receive comparison space ahead of header hit targets',()=>{
 const headers=Array.from({length:5},(_,i)=>({selector:`#tab-${i}`,label:`Tab ${i}`,tag:'button',bounds:{x:0,y:0,width:110,height:40}}));
 const currentHeaders=headers.map(control=>({selector:control.selector,label:control.label,rect:control.bounds}));
 const pairs=canvasV2ComponentReferencePairs({...request,reference:{...reference,controls:[...headers,...reference.controls]},currentTargets:[...currentHeaders,...request.currentTargets]});
 assert.equal(pairs[0].label,'Add season goal');assert.equal(pairs.length,4);
});


const measuredPlan: import('../lib/canvas-v2/screen-construction-plan').ScreenConstructionPlan = { id:'p',intent:'create',viewport:{width:390,height:800},summary:'Profile control',preserve:[],components:[{
 id:'avatar',name:'Profile control',kind:'control',basis:'observed',selector:'#profile',shape:'circle',style:'white rim',content:'portrait and badge',behavior:'open profile',assetPolicy:'none',referenceAssetId:'screenshot',sourceSize:{width:800,height:1640},referenceViewportRect:{x:10,y:20,width:780,height:1600},referenceRect:{x:650,y:120,width:80,height:80},logicalBounds:{x:320,y:50,width:40,height:40}
}]};
const measuredRequest={plan:measuredPlan,currentViewport:measuredPlan.viewport,currentTargets:[{selector:'#profile',rect:{x:320,y:50,width:40,height:40}}]};

test('screenshot components pair original pixels with actual small native controls, excluding capture chrome once',()=>{
 const [reading]=canvasV2PlannedComponentComparisons(measuredRequest);
 assert.equal(reading.status,'paired');
 if(reading.status!=='paired')throw new Error('No pair');
 assert.deepEqual(reading.delta,{x:0,y:0,width:0,height:0});
 assert.deepEqual(reading.referenceRect,{x:650/800,y:120/1640,width:80/800,height:80/1640});
 assert.deepEqual(reading.screenRect,{x:320/390,y:50/800,width:40/390,height:40/800});
 const [oversized]=canvasV2PlannedComponentComparisons({...measuredRequest,currentTargets:[{selector:'#profile',rect:{x:318,y:48,width:50,height:50}}]});
 if(oversized.status!=='paired')throw new Error('Oversized target was not paired');
 assert.deepEqual(oversized.delta,{x:-2,y:-2,width:10,height:10});
});

test('missing, duplicate, clipped and malformed screenshot targets remain explicit evidence gaps',()=>{
 const cases=[{targets:[],status:'missing'},{targets:[...measuredRequest.currentTargets,...measuredRequest.currentTargets],status:'ambiguous'},
 {targets:[{selector:'#profile',rect:{x:380,y:50,width:40,height:40}}],status:'clipped'},
 {targets:[{selector:'#profile',rect:{x:320,y:50,width:NaN,height:40}}],status:'invalid-geometry'},
 {targets:[{selector:'#another',label:'Profile control',rect:{x:320,y:50,width:40,height:40}}],status:'missing'}];
 for(const c of cases)assert.equal(canvasV2PlannedComponentComparisons({...measuredRequest,currentTargets:c.targets})[0].status,c.status);
 assert.equal(canvasV2PlannedComponentComparisons({...measuredRequest,currentViewport:{width:396,height:800}})[0].status,'viewport-mismatch');
 assert.equal(canvasV2PlannedComponentComparisons({...measuredRequest,plan:{...measuredPlan,components:[{...measuredPlan.components[0],selector:undefined}]}})[0].status,'no-selector');
});
