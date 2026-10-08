import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasV2ComponentReferencePairs } from '../lib/canvas-v2/screen-component-comparison';

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
