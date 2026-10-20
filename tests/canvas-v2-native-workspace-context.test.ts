import assert from 'node:assert/strict';
import test from 'node:test';
import { readCanvasV2NativeWorkspaceContext } from '../lib/canvas-v2/native-workspace-context';
import { appendCanvasV2NativeScreen, canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { encodeCanvasV2Screen, readCanvasV2Screens } from '../lib/canvas-v2/interactive-screen';
import { serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import { applyCanvasV2SourcePatch } from '../lib/canvas-v2/source-patch';
import { compileCanvasV2NativeSceneTransaction, assertCanvasV2SceneTransaction } from '../lib/canvas-v2/scene-transaction';

const screen={version:1 as const,title:'Live piece',width:390,height:844,html:'<canvas></canvas>',css:'',javascript:'requestAnimationFrame(()=>{});',referenceAssetIds:[]};
const encoded=encodeCanvasV2Screen(screen);
function populated(){
  let scene:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'current',width:20000,height:20000,rootIds:[],nodes:[],css:''};
  for(let i=0;i<33;i++)scene=appendCanvasV2NativeScreen(scene,`piece-${i}`,encoded,{x:i*450,y:100});
  return scene;
}

test('a populated workspace exposes all live object geometry without DOM or renderer initialization',()=>{
  const scene=populated(),before=JSON.stringify(scene),context=readCanvasV2NativeWorkspaceContext(scene,'current')!;
  assert.equal(context.objects.length,33);assert.equal(context.placementBounds.length,33);
  assert.equal(context.objects[32].bounds.x,32*450);
  assert.match(context.inspection,/not|Inspect/);
  assert.equal('source' in context.objects[0],false);
  assert.equal(JSON.stringify(scene),before);
  assert.equal(readCanvasV2NativeWorkspaceContext(scene,'stale'),undefined);
  assert.equal(readCanvasV2NativeWorkspaceContext(undefined,'current'),undefined);
});

test('placement uses nested rotated world bounds and includes protected visible objects',()=>{
  const scene=populated();
  const parent=scene.nodes[0],child=scene.nodes[1];
  parent.kind='group';parent.geometry={x:100,y:200,width:100,height:100,rotation:90,zIndex:0};
  child.parentId=parent.id;child.geometry={x:10,y:20,width:20,height:10,rotation:0,zIndex:0};child.locked=true;child.canonicalEvidence=true;
  const context=readCanvasV2NativeWorkspaceContext(scene,'current')!,object=context.objects.find(n=>n.nodeId===child.id)!;
  for(const [key,value] of Object.entries({x:170,y:210,width:10,height:20}))assert.ok(Math.abs(object.bounds[key as keyof typeof object.bounds]-value)<1e-8);
  assert.equal(context.placementBounds.includes(object.bounds),true);
  parent.hidden=true;
  const hidden=readCanvasV2NativeWorkspaceContext(scene,'current')!;
  assert.equal(hidden.objects.find(n=>n.nodeId===child.id)?.hidden,true);
  assert.equal(hidden.placementBounds.length,31);
});

test('broken parent chains and cycles are not reported as usable geometry',()=>{
  const scene=populated();scene.nodes[0].parentId=scene.nodes[1].id;scene.nodes[1].parentId=scene.nodes[0].id;scene.nodes[2].parentId='missing';
  assert.equal(readCanvasV2NativeWorkspaceContext(scene,'current')?.objects.length,30);
});

test('relationship wires remain in the directory without reserving their empty rectangular span',()=>{
  const scene=populated();scene.nodes[0].attributes['data-canvas-v2-relationship-source']='piece-3';scene.nodes[1].attributes['data-canvas-v2-relationship-target']='piece-4';scene.nodes[2].attributes['data-canvas-v2-primitive']='connector';
  const context=readCanvasV2NativeWorkspaceContext(scene,'current')!;
  assert.equal(context.objects.length,33);assert.equal(context.placementBounds.length,30);
  assert.equal(context.objects.slice(0,3).every(node=>node.relationship),true);
});

test('native insertion preserves existing identities, geometry and sources through the normal transaction ledger',()=>{
  const scene=populated(),before=serializeCanvasV2NativeScene(scene),baseline=JSON.stringify(scene);
  const patch=canvasV2ScreenPatch(before,{...screen,title:'New artwork'},[],{x:120,y:2400});
  const document=applyCanvasV2SourcePatch({previous:before,operations:patch.operations,evidence:[]});
  const added=readCanvasV2Screens(document.html).find(s=>s.nodeId===patch.nodeId)!;
  const next=appendCanvasV2NativeScreen(scene,patch.nodeId,added.encoded,{x:120,y:2400});
  assert.equal(JSON.stringify(scene),baseline);
  scene.nodes.forEach((node,index)=>assert.strictEqual(next.nodes[index],node));
  assert.equal(next.nodes.length,34);
  assert.equal(readCanvasV2Screens(serializeCanvasV2NativeScene(next).html).length,34);
  const transaction=compileCanvasV2NativeSceneTransaction({origin:'northstar',baseRevisionId:scene.revisionId,previousScene:scene,nextScene:next,previous:before,next:document});
  assert.equal(transaction.origin,'northstar');
  assert.doesNotThrow(()=>assertCanvasV2SceneTransaction({transaction,baseRevisionId:scene.revisionId,previous:before,next:document}));
  assert.throws(()=>appendCanvasV2NativeScreen(scene,'piece-0',encoded,{x:0,y:0}),/exists/);
  assert.throws(()=>appendCanvasV2NativeScreen(scene,'outside',encoded,{x:19900,y:0}),/bounds/);
});

test('a native Northstar ledger still rejects unauthorized replacement of human work',()=>{
  const scene=populated(),manual=scene.nodes[0];manual.userEdited=true;manual.lastAuthor='user';manual.attributes['data-canvas-v2-origin']='user';manual.attributes['data-canvas-v2-user-edited']='true';
  const previous=serializeCanvasV2NativeScene(scene),nextScene=structuredClone(scene);
  nextScene.nodes[0].attributes['data-canvas-v2-screen']=encodeCanvasV2Screen({...screen,title:'Unrequested replacement'});
  const next=serializeCanvasV2NativeScene(nextScene);
  const transaction=compileCanvasV2NativeSceneTransaction({origin:'northstar',baseRevisionId:scene.revisionId,previousScene:scene,nextScene,previous,next});
  assert.throws(()=>assertCanvasV2SceneTransaction({transaction,baseRevisionId:scene.revisionId,previous,next}),/human|user|preserve|protected/i);
});


test('current object reads identify human edits without inventing visual approval',()=>{
  const scene=populated(),node=scene.nodes[0];
  node.userEdited=true;node.lastAuthor='user';node.editVersion=7;
  const context=readCanvasV2NativeWorkspaceContext(scene,'current')!;
  assert.equal(context.objects[0].userEdited,true);
  assert.equal(context.objects[0].lastAuthor,'user');
  assert.equal(context.objects[0].editVersion,7);
  assert.match(context.inspection,/Source and geometry only/);
});
