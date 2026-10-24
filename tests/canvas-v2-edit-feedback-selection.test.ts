import assert from 'node:assert/strict';
import test from 'node:test';
import { CANVAS_V2_SCREEN_FEEDBACK_BATCH, mergeCanvasV2ScreenFeedbackBatch, requestCanvasV2ScreenFeedbackBatch, type CanvasV2ScreenFeedbackEntry } from '../lib/canvas-v2/screen-feedback';
import { updateScreenLayerSelection } from '../lib/canvas-v2/screen-vector-edit';
import { SelectedLayerFeedbackScenario } from '../app/canvas-v2-e2e/codex/selected-layer-feedback-scenario';
import type { FixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import type { JsonObject } from '../lib/canvas-v2/managed-agent/protocol';
import { screenCommandMayRunDuringHumanInput } from '../lib/canvas-v2/interactive-screen-runtime';

function entry(index:number,nodeId='screen-a',encoded='source-a'):CanvasV2ScreenFeedbackEntry {
  return {encoded,target:{nodeId,title:'Editable specimen',selector:'#part-'+index,tag:'p',label:'Part '+index,text:'Human text '+index,rect:{x:index*10,y:20,width:100,height:30},styles:{color:'rgb(10, 20, 30)'}}};
}

test('native selection inspection remains available during human input while synthetic app gestures remain blocked',()=>{
  for(const action of ['inspect','snapshot','edit-mode','edit-target','edit-targets','edit-selection','edit-hover','feedback-target'] as const)assert.equal(screenCommandMayRunDuringHumanInput(action),true,action);
  for(const action of ['click','fill','drag','scroll','test-sequence'] as const)assert.equal(screenCommandMayRunDuringHumanInput(action),false,action);
  for(const action of ['patch-element','patch-elements','patch-assets','patch-structure','patch-stylesheet'] as const)assert.equal(screenCommandMayRunDuringHumanInput(action),true,'Host source patch route: '+action);
});

test('feedback batches update duplicates, preserve different screen owners and never mutate earlier tags',()=>{
  const current=[entry(1),entry(2)],original=structuredClone(current),updated={...entry(2),target:{...entry(2).target,text:'Current human text',styles:{color:'#9966cc'}}};
  const merged=mergeCanvasV2ScreenFeedbackBatch(current,[updated,entry(3),entry(1,'screen-b','source-b')],1);
  assert.equal(merged.length,4);assert.equal(merged.find(item=>item.target.nodeId==='screen-a'&&item.target.selector==='#part-2')?.target.text,'Current human text');
  assert.equal(merged.filter(item=>item.target.selector==='#part-1').length,2,'Same selector in independent screens is not a duplicate.');
  assert.deepEqual(current,original);
});

test('combined feedback capacity is atomic and duplicate updates remain possible at the limit',()=>{
  const current=Array.from({length:23},(_,i)=>entry(i)),original=structuredClone(current);
  assert.equal(mergeCanvasV2ScreenFeedbackBatch(current,[entry(3)],1).length,23);
  assert.throws(()=>mergeCanvasV2ScreenFeedbackBatch(current,[entry(24)],1),/24/);
  assert.deepEqual(current,original,'Overflow must not append a partial selection.');
  assert.equal(mergeCanvasV2ScreenFeedbackBatch(current,[entry(24)],0).length,24);
  assert.throws(()=>mergeCanvasV2ScreenFeedbackBatch([],Array.from({length:25},(_,i)=>entry(i)),0),/24/);
});

test('one invalid member or mixed same-owner source versions rejects the whole incoming selection',()=>{
  const current=[entry(1)],original=structuredClone(current),invalid={...entry(3),target:{...entry(3).target,rect:{x:0,y:0,width:0,height:30}}};
  assert.throws(()=>mergeCanvasV2ScreenFeedbackBatch(current,[entry(2),invalid],0));assert.deepEqual(current,original);
  assert.throws(()=>mergeCanvasV2ScreenFeedbackBatch(current,[entry(2,'screen-a','v1'),entry(3,'screen-a','v2')],0),/versions/i);
  assert.deepEqual(current,original);
  for(const objectCount of [-1,NaN,1.5])assert.throws(()=>mergeCanvasV2ScreenFeedbackBatch(current,[entry(2)],objectCount));
});

test('a new insertion anchor is unique across existing and batched feedback',()=>{
  const first={...entry(1),target:{...entry(1).target,insertionSide:'before' as const}},second={...entry(2),target:{...entry(2).target,insertionSide:'after' as const}},third={...entry(3),target:{...entry(3).target,insertionSide:'before' as const}};
  const merged=mergeCanvasV2ScreenFeedbackBatch([first],[second,third],0);
  assert.deepEqual(merged.filter(item=>item.target.insertionSide).map(item=>item.target.selector),['#part-3']);
});

test('layer replace and toggle preserve explicit order and make the last added layer primary',()=>{
  const ordered=['#a','#b','#c','#d'],current=['#a','#b'];
  assert.deepEqual(updateScreenLayerSelection(current,'#c','replace',ordered),['#c']);
  assert.deepEqual(updateScreenLayerSelection(current,'#c','toggle',ordered),['#a','#b','#c']);
  assert.deepEqual(updateScreenLayerSelection(current,'#b','toggle',ordered),['#a']);
  assert.deepEqual(updateScreenLayerSelection(['#a'],'#a','toggle',ordered),[]);assert.deepEqual(current,['#a','#b']);
});

test('range selection uses actual layer order in either direction and keeps the clicked endpoint primary',()=>{
  const ordered=['#a','#b','#c','#d'];
  assert.deepEqual(updateScreenLayerSelection(['#a'],'#d','range',ordered,'#b'),['#b','#c','#d']);
  assert.deepEqual(updateScreenLayerSelection(['#d'],'#b','range',ordered,'#d'),['#c','#d','#b']);
  assert.deepEqual(updateScreenLayerSelection([],'#c','range',ordered),['#c']);
  assert.throws(()=>updateScreenLayerSelection(['#a'],'#missing','toggle',ordered),/current object/);
});

test('selection capacity fails without changing the current set and permits removing an item at capacity',()=>{
  const ordered=Array.from({length:25},(_,i)=>'#part-'+i),current=ordered.slice(0,24),original=[...current];
  assert.throws(()=>updateScreenLayerSelection(current,ordered[24],'toggle',ordered),/24/);assert.deepEqual(current,original);
  assert.equal(updateScreenLayerSelection(current,ordered[0],'toggle',ordered).length,23);
  assert.throws(()=>updateScreenLayerSelection([],ordered[24],'range',ordered,ordered[0]),/24/);
});

test('feedback request waits for host acknowledgement and propagates an atomic rejection',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'window'),events=new EventTarget(),entries=[entry(1),entry(2)];
  Object.defineProperty(globalThis,'window',{value:events,configurable:true});
  try{
    let acknowledge:((result:{ok:boolean;error?:string})=>void)|undefined,settled=false;
    const accept=(event:Event)=>{const detail=(event as CustomEvent).detail;assert.deepEqual(detail.entries,entries);acknowledge=detail.resolve;};
    events.addEventListener(CANVAS_V2_SCREEN_FEEDBACK_BATCH,accept);
    const pending=requestCanvasV2ScreenFeedbackBatch(entries).then(()=>{settled=true});await Promise.resolve();assert.equal(settled,false);
    acknowledge!({ok:true});await pending;assert.equal(settled,true);events.removeEventListener(CANVAS_V2_SCREEN_FEEDBACK_BATCH,accept);
    const reject=(event:Event)=>(event as CustomEvent).detail.resolve({ok:false,error:'One selected part changed. Nothing was added.'});
    events.addEventListener(CANVAS_V2_SCREEN_FEEDBACK_BATCH,reject);await assert.rejects(requestCanvasV2ScreenFeedbackBatch(entries),/Nothing was added/);events.removeEventListener(CANVAS_V2_SCREEN_FEEDBACK_BATCH,reject);
  }finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});

test('one fixture instruction reads all selected owners and sends exactly one production atomic edit without replacing copy',()=>{
  const calls:Array<{name:string;args:JsonObject}>=[],answers:string[]=[],peer={tool:(name:string,args:JsonObject)=>calls.push({name,args}),finish:(text:string)=>answers.push(text)} as unknown as FixtureCodex;
  const scenario=new SelectedLayerFeedbackScenario(peer),reply=(value:JsonObject)=>scenario.reply({success:true,contentItems:[{text:JSON.stringify(value)}]});
  scenario.start();reply({screenFeedbackTargets:[entry(1).target,{...entry(2,'screen-b').target,namespace:'svg',tag:'path'}]});
  assert.deepEqual(calls[1],{name:'canvas_read',args:{nodeId:'screen-a'}});reply({screens:[{nodeId:'screen-a'}]});
  assert.deepEqual(calls[2],{name:'canvas_read',args:{nodeId:'screen-b'}});reply({screens:[{nodeId:'screen-b'}]});
  const edit=calls[3];assert.equal(edit.name,'canvas_screen_element');assert.equal(calls.filter(call=>call.name==='canvas_screen_element').length,1);
  assert.deepEqual(edit.args.edits,[{nodeId:'screen-a',selector:'#part-1',styles:{color:'#7b43b5'}},{nodeId:'screen-b',selector:'#part-2',styles:{fill:'#7b43b5'}}]);
  reply({committed:true,sourceChangeReceipts:['screen-a','screen-b'].map(nodeId=>({nodeId,basis:'exact-saved-source-comparison',operation:'refine',beforeSourceVersion:'before',sourceVersion:'after',unchanged:{javascript:true,css:true,mockData:true,viewport:true}}))});assert.deepEqual(answers,['Refined all 2 selected layers in one canvas revision.']);
});
