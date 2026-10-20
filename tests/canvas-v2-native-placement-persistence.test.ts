import assert from 'node:assert/strict';
import test from 'node:test';
import { commitCanvasV2Candidate, createCanvasV2CandidateRevision, createCanvasV2CommittedRevision } from '../lib/canvas-v2/revisions';
import { applyCanvasV2NativeSceneMutation, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import { compileCanvasV2SceneTransaction } from '../lib/canvas-v2/scene-transaction';
import { findCanvasV2SourceNodeRange } from '../lib/canvas-v2/source-patch';

const root='<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true"></template>';
const protectedSource='<svg hidden="" data-canvas-v2-node-id="hidden" viewBox="0 0 1 1"><path d="M0 0L1 1" /></svg><div data-canvas-v2-node-id="locked" data-canvas-v2-locked="true">Locked</div><div data-canvas-v2-node-id="human" data-canvas-v2-user-edited="create" data-canvas-v2-origin="user">Human</div>';
const targetSource='<section data-canvas-v2-node-id="brief" data-canvas-v2-island-id="brief" data-canvas-v2-design-region="true" data-canvas-v2-origin="northstar" data-canvas-v2-last-author="northstar" style="position:absolute;left:10px;top:20px;width:400px;height:200px;color:#123456!important"><p data-canvas-v2-node-id="copy">Keep the exact creative</p></section>';
function scene():CanvasV2NativeSceneDocument {
  const empty:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'candidate',width:12000,height:8000,css:'',nodes:[],rootIds:[]};
  const next=applyCanvasV2NativeSceneMutation(empty,{kind:'create',primitive:'shape',nodeId:'brief',x:6000,y:3500,width:400,height:180});
  next.nodes[0].userEdited=false;next.nodes[0].lastAuthor='northstar';next.nodes[0].attributes['data-canvas-v2-origin']='northstar';
  return next;
}
function sourceSlice(html:string,id:string){const r=findCanvasV2SourceNodeRange(html,id)!;return html.slice(r.start,r.end);}
function opening(html:string,id:string){const r=findCanvasV2SourceNodeRange(html,id)!;return html.slice(r.start,r.openEnd);}
function revisions(options:{existing?:boolean;serialized?:boolean;guard?:boolean;focus?:string}={}) {
  const native=scene(),guard=serializeCanvasV2NativeScene(native).css;
  const target=options.serialized?sourceSlice(serializeCanvasV2NativeScene(native).html,'brief'):targetSource;
  const previous=createCanvasV2CommittedRevision({id:'parent',document:{html:root+protectedSource+(options.existing?target:''),css:options.guard?guard:'.unchanged{color:red}'},evidence:[],createdAt:'2026-10-19T12:00:00Z'});
  const document={...previous.document,html:previous.document.html+(options.existing?'':target)};
  const transaction=compileCanvasV2SceneTransaction({origin:'northstar',baseRevisionId:previous.id,previous:previous.document,next:document,focusIslandId:options.focus});
  const candidate=createCanvasV2CandidateRevision({id:'candidate',parent:previous,document,createdAt:'2026-10-19T12:01:00Z',sceneTransaction:transaction});
  return {previous,candidate,native};
}

test('accepted placement is durable source metadata for raw and guarded documents without changing creative or peers',()=>{
  for(const guard of [false,true]){
    const {previous,candidate,native}=revisions({guard});
    const committed=commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native,previous});
    const tag=opening(committed.document.html,'brief');
    assert.match(tag,/--canvas-v2-scene-x:6000px/);assert.match(tag,/--canvas-v2-scene-y:3500px/);assert.match(tag,/--canvas-v2-scene-height:180px/);assert.match(tag,/data-canvas-v2-scene-layout="absolute"/);
    assert.match(tag,/left:10px;top:20px/,'authored CSS is not rewritten as a layout shortcut');
    assert.match(tag,/color:#123456!important/,'non-geometry priority survives');
    for(const id of ['hidden','locked','human'])assert.equal(sourceSlice(committed.document.html,id),sourceSlice(previous.document.html,id));
    assert.equal(sourceSlice(committed.document.html,'copy'),sourceSlice(candidate.document.html,'copy'));
    assert.equal(committed.document.css,candidate.document.css);
    assert.equal(candidate.document.html,root+protectedSource+targetSource,'input candidate remains immutable');
    assert.doesNotThrow(()=>compileCanvasV2SceneTransaction({origin:'northstar',baseRevisionId:previous.id,previous:previous.document,next:committed.document}));
  }
});

test('already serialized direct native geometry remains byte-exact at commit',()=>{
  const {previous,candidate,native}=revisions({serialized:true,guard:true});
  const committed=commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native,previous});
  assert.deepEqual(committed.document,candidate.document);
  assert.deepEqual(committed.sceneTransaction,candidate.sceneTransaction);
});

test('an exact scoped repair persists accepted geometry even with identical authored source',()=>{
  const {previous,candidate,native}=revisions({existing:true,focus:'brief'});
  assert.equal(candidate.sceneTransaction?.mutations.find(m=>m.nodeId==='brief')?.kind,'preserve');
  const committed=commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native,previous});
  assert.match(opening(committed.document.html,'brief'),/--canvas-v2-scene-y:3500px/);
  assert.equal(committed.sceneTransaction?.mutations.find(m=>m.nodeId==='brief')?.kind,'update');
});

test('unchanged unscoped roots are not normalized from a supplied scene',()=>{
  const {previous,candidate,native}=revisions({existing:true});
  const committed=commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native,previous});
  assert.deepEqual(committed.document,candidate.document);
});

test('an explicit whole-board transaction persists eligible AI roots without touching protected participants',()=>{
  const {previous,candidate,native}=revisions({existing:true,focus:'__whole-board__'});
  const execution: import('../lib/canvas-v2/types').CanvasV2IslandExecutionContract={target:{action:'recompose',islandId:'__whole-board__',storyRole:'whole-board',resultingMaturity:'developing',resolutionRationale:'',openRequirements:[]},territory:{relation:'recompose',anchorNodeId:'',intendedFootprint:'Whole board',rationale:'Requested recompose',placementMode:'recompose',targetZoneId:'middle-center'},requiredEvidenceIds:[],requiredEvidenceHandles:[],requiredVisualRoles:[]};
  const committed=commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native,previous,execution});
  assert.match(opening(committed.document.html,'brief'),/--canvas-v2-scene-y:3500px/);
  for(const id of ['hidden','locked','human'])assert.equal(sourceSlice(committed.document.html,id),sourceSlice(previous.document.html,id));
});

test('accepted placement rejects another revision, stale parent, or absent transaction',()=>{
  const {previous,candidate,native}=revisions();
  assert.throws(()=>commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:{...native,revisionId:'stale'},previous}),/another candidate/);
  assert.throws(()=>commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native}),/current committed parent/);
  assert.throws(()=>commitCanvasV2Candidate({candidate:{...candidate,sceneTransaction:undefined},expectedParentId:previous.id,acceptedNativeScene:native,previous}),/validated scene transaction/);
});

test('quoted CSS content cannot masquerade as geometry',()=>{
  const {previous,candidate,native}=revisions();
  const document={...candidate.document,html:candidate.document.html.replace('color:#123456!important','color:#123456!important;content:&quot;keep;--canvas-v2-scene-x:0px&quot;')};
  const transaction=compileCanvasV2SceneTransaction({origin:'northstar',baseRevisionId:previous.id,previous:previous.document,next:document});
  const changed={...candidate,document,sceneTransaction:transaction};
  const committed=commitCanvasV2Candidate({candidate:changed,expectedParentId:previous.id,acceptedNativeScene:native,previous});
  assert.match(opening(committed.document.html,'brief'),/content:&quot;keep;--canvas-v2-scene-x:0px&quot;/);
  assert.match(opening(committed.document.html,'brief'),/--canvas-v2-scene-x:6000px/);
});


test('a whole-board focus string without a validated recompose execution grants no broader root permission',()=>{
  const {previous,candidate,native}=revisions({existing:true,focus:'__whole-board__'});
  const committed=commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native,previous});
  assert.deepEqual(committed.document,candidate.document);
});

test('a human child text edit never installs compiled geometry on its unchanged island parent',()=>{
  const {previous,native}=revisions({existing:true,focus:'brief'});
  const document={...previous.document,html:previous.document.html.replace('Keep the exact creative','A human changed only this child')};
  const transaction=compileCanvasV2SceneTransaction({origin:'user',baseRevisionId:previous.id,previous:previous.document,next:document,focusIslandId:'brief'});
  // The generic first-edit ledger fingerprints whole subtrees, so its parent
  // entry is update even though the parent's own authored opening is identical.
  assert.equal(transaction.mutations.find(item=>item.nodeId==='brief')?.kind,'update');
  assert.equal(transaction.mutations.find(item=>item.nodeId==='copy')?.kind,'update');
  const candidate=createCanvasV2CandidateRevision({id:'candidate',parent:previous,document,createdAt:'2026-10-20T12:00:00Z',sceneTransaction:transaction});
  const committed=commitCanvasV2Candidate({candidate,expectedParentId:previous.id,acceptedNativeScene:native,previous});
  assert.equal(opening(committed.document.html,'brief'),opening(previous.document.html,'brief'));
  assert.equal(committed.document.html,document.html);assert.equal(committed.document.css,document.css);
  for(const id of ['hidden','locked','human'])assert.equal(sourceSlice(committed.document.html,id),sourceSlice(previous.document.html,id));
});
