import test from 'node:test';
import assert from 'node:assert/strict';
import { readScreenNumericValue, requireLiveScreenInteraction, waitForScreenJourneyCondition, screenMotionTargetCropRect, screenNumericChangeResult, validateScreenInteractionSequence } from '../lib/canvas-v2/screen-interaction-sequence';
import { advanceScreenJourneyMotion } from '../lib/canvas-v2/screen-motion-timeline';
import { signalCanvasV2ScreenRuntimeReady } from '../lib/canvas-v2/interactive-screen-runtime';

test('verification cannot silently mutate the live preview',()=>{
 for(const action of ['click','fill','scroll','drag']) {
  for(const value of [undefined,false,'true'])assert.throws(()=>requireLiveScreenInteraction(action,value),/preserve the live preview/);
  assert.doesNotThrow(()=>requireLiveScreenInteraction(action,true));
 }
 for(const action of ['inspect','journey'])assert.doesNotThrow(()=>requireLiveScreenInteraction(action,undefined));
});

test('one journey can retain named intermediate states and check a disabled boundary without clicking it',()=>{
 const steps=validateScreenInteractionSequence([
  {action:'click',selector:'#reserve',expectedText:'Enter your name',capture:'validation'},
  {action:'wait',selector:'#plus',expectedDisabled:true,capture:'four-seat-boundary'},
  {action:'click',selector:'#reserve',expectedText:'Reserved',capture:'confirmation'},
  {action:'click',selector:'#edit'},
  {action:'wait',selector:'#name',expectedValue:'Casey',capture:'edit-return'},
 ]);
 assert.equal(steps[1].expectedDisabled,true);assert.equal(steps[2].capture,'confirmation');
 assert.throws(()=>validateScreenInteractionSequence([{action:'wait',expectedDisabled:true}]),/selector/);
 assert.throws(()=>validateScreenInteractionSequence([{action:'wait',capture:'same'},{action:'wait',capture:'same'}]),/unique/);
 assert.throws(()=>validateScreenInteractionSequence(Array.from({length:7},(_,i)=>({action:'wait',capture:String(i)}))),/six/);
});

test('runtime readiness waits for parser-completed authored initialization and announces once', async () => {
 const document=Object.assign(new EventTarget(),{readyState:'loading'}),order:string[]=[];
 signalCanvasV2ScreenRuntimeReady(document,()=>order.push('ready'));
 assert.equal(order.length,0,'a bridge installed before authored scripts must not publish readiness yet');
 order.push('authored scene initialized');
 document.dispatchEvent(new Event('DOMContentLoaded'));
 document.dispatchEvent(new Event('DOMContentLoaded'));
 assert.deepEqual(order,['authored scene initialized','ready']);
 const loaded=Object.assign(new EventTarget(),{readyState:'complete'}),loadedOrder:string[]=[];
 signalCanvasV2ScreenRuntimeReady(loaded,()=>loadedOrder.push('ready'));
 loadedOrder.push('bridge installed');
 assert.deepEqual(loadedOrder,['bridge installed']);
 await Promise.resolve();
 assert.deepEqual(loadedOrder,['bridge installed','ready']);
});

test('private journey waits compensate a stalled transition while preserving rapid reversals and authored pauses',()=>{
 const opening={currentTime:0,playbackRate:1,playState:'running'},paused={currentTime:20,playbackRate:1,playState:'paused'};
 const ledger=new Map<typeof opening,{elapsed:number;time:number;rate:number}>();
 advanceScreenJourneyMotion([opening,paused],0,ledger);
 advanceScreenJourneyMotion([opening,paused],280,ledger);
 assert.equal(opening.currentTime,280);assert.equal(paused.currentTime,20);
 const reversed={currentTime:180,playbackRate:-1,playState:'running'};
 advanceScreenJourneyMotion([reversed],280,ledger);
 advanceScreenJourneyMotion([reversed],300,ledger);
 assert.equal(reversed.currentTime,160);
 advanceScreenJourneyMotion([reversed],300,ledger);assert.equal(reversed.currentTime,160);
 opening.currentTime=400;advanceScreenJourneyMotion([opening],300,ledger);assert.equal(opening.currentTime,400);
});

test('journeys retain deliberate rapid actions and saved-value assertions within a finite execution budget',()=>{
 const steps=validateScreenInteractionSequence([{action:'click',selector:'#open'},{action:'click',selector:'#close',delayMs:20},{action:'fill',selector:'#goal',value:'Twelve goals'},{action:'wait',selector:'#goal',expectedValue:'Twelve goals',expectedText:'Your season',absentText:'Failed',expectedNumericChange:{selector:'#progress',attribute:'aria-valuenow',min:0,max:0},delayMs:400}]);
 assert.equal(steps[0].delayMs,0);assert.equal(steps[1].delayMs,20);assert.equal(steps[3].expectedValue,'Twelve goals');
 assert.equal(steps[3].expectedText,'Your season');
 assert.deepEqual(steps[3].expectedNumericChange,{selector:'#progress',attribute:'aria-valuenow',min:0,max:0});
 for(const invalid of [[],Array(21).fill({action:'wait'}),[{action:'click'}],[{action:'wait',delayMs:2501}],Array(3).fill({action:'wait',delayMs:2500}),[{action:'scroll',y:Infinity}],[{action:'wait',expectedValue:'Saved'}],[{action:'fill',selector:3}],[{action:'wait',expectedText:'a'.repeat(1001)}]])assert.throws(()=>validateScreenInteractionSequence(invalid));
 assert.throws(()=>validateScreenInteractionSequence([{action:'wait',expectedNumericChange:{selector:'#progress',attribute:'aria-valuenow',min:2,max:1}}]),/finite min\/max/);
});

test('numeric journey assertions distinguish advancing state, static playing labels and paused drift',()=>{
 assert.deepEqual(screenNumericChangeResult(84,85.25,1,2),{passed:true,delta:1.25});
 assert.deepEqual(screenNumericChangeResult(84,84,0.1,2),{passed:false,delta:0});
 const pausedDrift=screenNumericChangeResult(84,84.2,-0.01,0.01);
 assert.equal(pausedDrift.passed,false); assert.ok((pausedDrift.delta ?? 0) > 0.1);
 assert.deepEqual(screenNumericChangeResult(undefined,85,0,2),{passed:false});
 assert.deepEqual(screenNumericChangeResult(84,undefined,0,2),{passed:false});
 assert.equal(readScreenNumericValue(null,'aria-valuenow'),undefined);
 assert.equal(readScreenNumericValue({getAttribute:()=> 'not-a-number'} as unknown as Element,'aria-valuenow'),undefined);
});

test('held-subject crop uses one fixed screenshot region spanning target positions and viewport edges',()=>{
 assert.deepEqual(screenMotionTargetCropRect([{x:10,y:20,width:12,height:16},{x:25,y:18,width:12,height:20}],100,80),{x:6,y:14,width:35,height:28});
 assert.deepEqual(screenMotionTargetCropRect([{x:96,y:76,width:20,height:20}],100,80),{x:92,y:72,width:8,height:8});
 assert.equal(screenMotionTargetCropRect([{x:0,y:0,width:0,height:12}],100,80),undefined);
 assert.equal(screenMotionTargetCropRect([{x:Number.NaN,y:0,width:12,height:12}],100,80),undefined);
 assert.equal(screenMotionTargetCropRect([{x:120,y:120,width:12,height:12}],100,80),undefined);
});

test('both private motion preferences produce syntactically valid isolated runtime scripts',async()=>{
 const {buildCanvasV2ScreenRuntime}=await import('../lib/canvas-v2/interactive-screen-runtime');
 const screen={version:1 as const,title:'Journey',width:390,height:844,html:'<button id="open">Open</button>',css:'@media(prefers-reduced-motion:reduce){button{animation:none}}',javascript:'',referenceAssetIds:[]};
 for(const preference of ['reduce','no-preference'] as const){
  const runtime=buildCanvasV2ScreenRuntime(screen,new Map(),'journey',preference);
  const scripts=[...runtime.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,3);for(const script of scripts)assert.doesNotThrow(()=>new Function(script[1]));
 }
});


test('condition waiting returns immediately when ready and polls without replaying an action',async()=>{
 let now=0,reads=0;const advances:number[]=[];
 const clock=()=>now,sleep=async(ms:number)=>{now+=ms;};
 const ready=await waitForScreenJourneyCondition(()=>++reads,()=>true,1000,elapsed=>advances.push(elapsed),clock,sleep);
 assert.equal(ready.waitedMs,0);assert.equal(ready.attempts,1);assert.equal(now,0);
 const waiting=await waitForScreenJourneyCondition(()=>now,value=>value>=180,1000,elapsed=>advances.push(elapsed),clock,sleep);
 assert.equal(waiting.observation,200);assert.equal(waiting.waitedMs,200);assert.equal(waiting.attempts,6);
 assert.deepEqual(advances,[40,80,120,160,200]);
 const timeout=await waitForScreenJourneyCondition(()=>false,Boolean,95,()=>{},clock,sleep);
 assert.equal(timeout.observation,false);assert.equal(timeout.waitedMs,95);assert.equal(timeout.attempts,4);
 const immediate=await waitForScreenJourneyCondition(()=>false,Boolean,0,()=>{},clock,sleep);
 assert.equal(immediate.waitedMs,0);assert.equal(immediate.attempts,1);
 for(const timeoutMs of [-1,2501,0.5,NaN,'100'])assert.throws(()=>validateScreenInteractionSequence([{action:'wait',timeoutMs}]),/condition timeout/);
 assert.equal(validateScreenInteractionSequence([{action:'click',selector:'#close',timeoutMs:0}])[0].timeoutMs,0);
});
