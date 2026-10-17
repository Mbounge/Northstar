import test from 'node:test';
import assert from 'node:assert/strict';
import { temporalProofResult } from '../lib/canvas-v2/screen-temporal-review';

const plan={temporalComponents:[{id:'timer',kind:'clock',valueSelector:'#elapsed',numericAttribute:'aria-valuenow',advanceSelector:'#play',pauseSelector:'#pause',resetSelector:'#reset'}]};
const journey=(sourceVersion:string, imageRole='journey:timer', steps:unknown[])=>({action:'journey',sourceVersion,imageRole,journey:{passed:true,steps}});
const numeric=(selector:string,delta:number)=>({action:'click',selector,passed:true,expectedNumericChange:{selector:'#elapsed',attribute:'aria-valuenow',min:-10,max:10},numericDelta:delta});

test('temporal review rejects a frozen playing value and missing numeric proof',()=>{
 const frozen=temporalProofResult(plan,[journey('v2','journey:timer',[numeric('#play',0)])],'v2',['journey:timer']);
 assert.equal(frozen.passed,false); assert.deepEqual(frozen.missing,['timer:advance','timer:pause','timer:reset']);
 const missing=temporalProofResult(plan,[journey('v2','journey:timer',[{action:'click',selector:'#play',passed:true}])],'v2',['journey:timer']);
 assert.equal(missing.passed,false);
});

test('temporal review accepts current cited advance, pause and reset deltas',()=>{
 const result=temporalProofResult(plan,[
   journey('v2','journey:advance',[numeric('#play',1.4)]),
   journey('v2','journey:pause',[numeric('#pause',0.01)]),
   journey('v2','journey:reset',[numeric('#reset',-12)]),
 ],'v2',['journey:advance','journey:pause','journey:reset']);
 assert.equal(result.passed,true); assert.equal(result.proofCount,3); assert.deepEqual(result.missing,[]);
});

test('temporal review rejects stale-source evidence and leaves plain static screens unaffected',()=>{
 const stale=temporalProofResult(plan,[journey('v1','journey:timer',[numeric('#play',1)])],'v2',['journey:timer']);
 assert.equal(stale.passed,false); assert.deepEqual(stale.missing,['timer:advance','timer:pause','timer:reset']);
 const staticScreen=temporalProofResult({},[], 'v2', []);
 assert.deepEqual(staticScreen,{required:false,passed:true,missing:[],proofCount:0});
});

test('an earlier pause cannot borrow a later frozen reset observation',()=>{
 const result=temporalProofResult(plan,[journey('v2','journey:timer',[
   {action:'click',selector:'#pause',passed:true},
   {action:'click',selector:'#reset',passed:true},
   {...numeric('#reset',0),action:'wait'},
 ])],'v2',['journey:timer']);
 assert.ok(result.missing.includes('timer:pause'));
});

test('an earlier play cannot borrow motion caused by another input',()=>{
 for(const action of ['click','fill','drag','scroll']){
  const result=temporalProofResult(plan,[journey('v2','journey:timer',[
    {action:'click',selector:'#play',passed:true},
    {action,selector:'#other',passed:true},
    {...numeric('#other',2),action:'wait'},
  ])],'v2',['journey:timer']);
  assert.ok(result.missing.includes('timer:advance'),action);
 }
});

test('a wait after Play can establish advance even when the immediate sample was unchanged',()=>{
 const result=temporalProofResult(plan,[journey('v2','journey:timer',[
   numeric('#play',0), {...numeric('#play',1.2),action:'wait'},
   numeric('#pause',0), numeric('#reset',-1.2),
 ])],'v2',['journey:timer']);
 assert.equal(result.passed,true);
});
