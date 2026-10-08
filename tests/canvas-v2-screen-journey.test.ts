import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScreenInteractionSequence } from '../lib/canvas-v2/screen-interaction-sequence';
import { advanceScreenJourneyMotion } from '../lib/canvas-v2/screen-motion-timeline';

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
 const steps=validateScreenInteractionSequence([{action:'click',selector:'#open'},{action:'click',selector:'#close',delayMs:20},{action:'fill',selector:'#goal',value:'Twelve goals'},{action:'wait',selector:'#goal',expectedValue:'Twelve goals',expectedText:'Your season',absentText:'Failed',delayMs:400}]);
 assert.equal(steps[0].delayMs,0);assert.equal(steps[1].delayMs,20);assert.equal(steps[3].expectedValue,'Twelve goals');
 assert.equal(steps[3].expectedText,'Your season');
 for(const invalid of [[],Array(21).fill({action:'wait'}),[{action:'click'}],[{action:'wait',delayMs:2501}],Array(3).fill({action:'wait',delayMs:2500}),[{action:'scroll',y:Infinity}],[{action:'wait',expectedValue:'Saved'}],[{action:'fill',selector:3}],[{action:'wait',expectedText:'a'.repeat(1001)}]])assert.throws(()=>validateScreenInteractionSequence(invalid));
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
