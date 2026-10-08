import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasV2ScreenPlacementContext } from '../lib/canvas-v2/screen-placement-context';
import { applyCanvasV2NativeSceneMutation, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import { canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange } from '../lib/canvas-v2/source-patch';
import { compileCanvasV2SceneTransaction } from '../lib/canvas-v2/scene-transaction';
import { encodeCanvasV2Screen, SCREEN_ATTRIBUTE } from '../lib/canvas-v2/interactive-screen';
import { screenMotionTimeline } from '../lib/canvas-v2/screen-motion-timeline';
import { readCanvasV2ScreenAssetPixels } from '../lib/canvas-v2/screen-asset-pixels';

const source={version:1 as const,title:'A product',width:390,height:844,html:'<main>Product</main>',css:'',javascript:'',referenceAssetIds:[]};
const empty:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'read-1',width:12000,height:8000,css:'',nodes:[],rootIds:[]};
const pixels='data:image/png;base64,aGVsbG8=';
function board(){const scene=applyCanvasV2NativeSceneMutation(empty,{kind:'batch',label:'Product and asset',mutations:[{kind:'create',primitive:'shape',nodeId:'product',x:1000,y:1000,width:780,height:1688},{kind:'create',primitive:'image',nodeId:'photo',x:1040,y:1080,width:200,height:120,src:pixels,alt:'Chosen hero'}]});scene.nodes[0].attributes[SCREEN_ATTRIBUTE]=encodeCanvasV2Screen(source);return scene;}

test('a placed image becomes a reusable handle and precise logical region without changing the board',()=>{
  const scene=board(),before=structuredClone(scene),result=canvasV2ScreenPlacementContext(scene,[],['photo']);
  assert.deepEqual(scene,before);
  assert.equal(result.retainedAssets.length,1);assert.equal(result.retainedAssets[0].url,pixels);
  const placement=result.context.placements[0];
  assert.deepEqual(placement.screenLocalBounds,{x:20,y:40,width:100,height:60});
  assert.equal(placement.assetHandle,`northstar-asset:${result.retainedAssets[0].id}`);
  assert.equal(placement.aboveScreen,true);assert.equal(placement.selected,true);assert.equal(placement.humanPlaced,true);
  assert.ok(!JSON.stringify(result.context).includes('base64'));
  assert.equal(canvasV2ScreenPlacementContext(scene,result.retainedAssets).retainedAssets.length,0);
});

test('reusing native pixels in a new screen leaves the original human image byte-for-byte unchanged',()=>{
  const scene=board(),document=serializeCanvasV2NativeScene(scene);
  const evidence=canvasV2ScreenPlacementContext(scene,[]).retainedAssets;
  const patch=canvasV2ScreenPatch(document,{...source,title:'Reused material',html:`<img src="northstar-asset:${evidence[0].id}" alt="Chosen material">`,referenceAssetIds:[evidence[0].id]},evidence,{x:3000,y:1000});
  const next=applyCanvasV2SourcePatch({previous:document,operations:patch.operations,evidence});
  const original=findCanvasV2SourceNodeRange(document.html,'photo')!,retained=findCanvasV2SourceNodeRange(next.html,'photo')!;
  assert.equal(next.html.slice(retained.start,retained.end),document.html.slice(original.start,original.end));
  assert.doesNotThrow(()=>compileCanvasV2SceneTransaction({origin:'northstar',baseRevisionId:scene.revisionId,previous:document,next}));
});

test('fresh moves, resizes, deletions and hidden ancestry change placement context without stale targets',()=>{
  const scene=board(),first=canvasV2ScreenPlacementContext(scene,[]).context.placements[0];
  scene.nodes[1].geometry.x+=60;scene.nodes[1].geometry.width=240;
  assert.deepEqual(canvasV2ScreenPlacementContext(scene,[]).context.placements[0].screenLocalBounds,{x:50,y:40,width:120,height:60});
  assert.deepEqual(first.screenLocalBounds,{x:20,y:40,width:100,height:60});
  scene.nodes[0].hidden=true;assert.equal(canvasV2ScreenPlacementContext(scene,[]).context.placements.length,0);
  scene.nodes[0].hidden=false;scene.nodes.pop();assert.equal(canvasV2ScreenPlacementContext(scene,[]).context.placements.length,0);
});

test('rotated grouped objects retain their position within a rotated resized screen',()=>{
  const scene=board(),screen=scene.nodes[0],asset=scene.nodes[1];
  // Parent rotation affects both objects equally; screen coordinates remain exact.
  const group=structuredClone(screen);group.id='group';group.sourceNodeId='group';group.attributes={};group.geometry={x:200,y:300,width:2000,height:2000,rotation:37,zIndex:0};group.childIds=[screen.id,asset.id];
  screen.parentId=asset.parentId=group.id;scene.nodes.unshift(group);scene.rootIds=[group.id];
  assert.deepEqual(canvasV2ScreenPlacementContext(scene,[]).context.placements[0].screenLocalBounds,{x:20,y:40,width:100,height:60});
  asset.geometry.rotation=90;
  assert.deepEqual(canvasV2ScreenPlacementContext(scene,[]).context.placements[0].screenLocalBounds,{x:40,y:20,width:60,height:100});
});

test('partial overlaps are bounded, multiple targets stay explicit, reference simulation stays protected',()=>{
  const scene=board();scene.nodes[1].geometry.x=980;
  const match=canvasV2ScreenPlacementContext(scene,[]).context.placements[0];
  assert.deepEqual(match.screenLocalBounds,{x:-10,y:40,width:100,height:60});
  assert.deepEqual(match.clippedBounds,{x:0,y:40,width:90,height:60});
  const second=structuredClone(scene.nodes[0]);second.id=second.sourceNodeId='another';second.geometry.x=950;second.attributes[SCREEN_ATTRIBUTE]=encodeCanvasV2Screen({...source,title:'GRAET',width:383,height:820,html:'<div></div>',simulation:{appName:'GRAET',section:'home'}});scene.nodes.push(second);scene.rootIds.push(second.id);
  const matches=canvasV2ScreenPlacementContext(scene,[]).context.placements;assert.equal(matches.length,2);assert.equal(matches.find(p=>p.screenNodeId==='another')!.protectedReference,true);
  assert.equal(canvasV2ScreenPlacementContext(scene,[],[],'product').context.placements.length,1);
  scene.nodes[1].geometry.x=5000;assert.equal(canvasV2ScreenPlacementContext(scene,[]).context.placements.length,0);
});

test('a rotated asset near a screen corner needs a real polygon overlap',()=>{
  const scene=board(),asset=scene.nodes[1];
  asset.geometry={...asset.geometry,x:880,y:955,width:160,height:10,rotation:-45};
  assert.equal(canvasV2ScreenPlacementContext(scene,[]).context.placements.length,0);
});

test('unavailable references cannot become reusable asset bindings',()=>{
  const scene=board();scene.nodes[1].evidence={id:'denied'};
  const result=canvasV2ScreenPlacementContext(scene,[{id:'denied',url:pixels,label:'Denied',source:{providerId:'x',providerLabel:'X',sourceId:'x',sourceType:'uploaded',label:'X',retrievedAt:'',permission:'unavailable'}}]);
  assert.equal(result.context.placements.length,0);assert.equal(result.retainedAssets.length,0);
});

test('a still upload matching a GIF thumbnail does not bind the animated source',()=>{
  const result=canvasV2ScreenPlacementContext(board(),[{id:'animated',url:pixels,originalUrl:'https://retained.test/motion.gif',mediaType:'gif',label:'Animated material'}]);
  assert.equal(result.retainedAssets.length,1);
  assert.notEqual(result.context.placements[0].assetId,'animated');
  assert.equal(result.context.placements[0].mediaType,'image');
});

test('shared motion sampling preserves the stagger instead of putting every effect halfway through',()=>{
  const timeline=screenMotionTimeline([{time:0,rate:1,duration:100,delay:0,endTime:100,iterations:1},{time:0,rate:1,duration:100,delay:200,endTime:300,iterations:1}]);
  assert.equal(timeline.duration,300);
  const elapsed=timeline.duration*.5;
  assert.deepEqual(timeline.entries.map(e=>(elapsed-e.origin)*e.rate),[150,150]);
  // The first has finished while the second is still waiting for its 200ms delay.
  assert.equal(timeline.truncated,false);
});

test('motion windows expose long/infinite sequences and preserve reverse/held timelines',()=>{
  const loop=screenMotionTimeline([{time:7800,rate:1,duration:1000,delay:0,endTime:Infinity,iterations:Infinity}]);
  assert.equal(loop.duration,1000);assert.equal(loop.continuous,true);assert.equal(loop.entries[0].origin,-7800);
  assert.equal(screenMotionTimeline([{time:0,rate:1,duration:60000,delay:0,endTime:60000,iterations:1}]).truncated,true);
  const reverse=screenMotionTimeline([{time:100,rate:-1,duration:100,delay:0,endTime:100,iterations:1}]);
  assert.ok(Math.abs((reverse.duration-reverse.entries[0].origin)*reverse.entries[0].rate)<.001);
  const held=screenMotionTimeline([{time:50,rate:0,duration:100,delay:0,endTime:100,iterations:1}]);
  assert.equal(held.entries[0].heldTime,50);assert.equal(held.duration,0);
});

test('screen GIF bytes retain animation instead of being converted to a still',async()=>{
  const bytes=Uint8Array.from(Buffer.from('GIF89aanimated-frames'));
  let requests=0;
  const signal=new AbortController().signal;
  const result=await readCanvasV2ScreenAssetPixels('https://retained.test/motion.gif',signal,async(_url,options)=>{requests++;assert.equal(options?.credentials,'omit');return new Response(bytes,{headers:{'content-type':'image/gif'}});});
  assert.equal(result,`data:image/gif;base64,${Buffer.from(bytes).toString('base64')}`);assert.equal(requests,1);
  assert.equal(await readCanvasV2ScreenAssetPixels(result,signal,async()=>{throw new Error('No fetch needed');}),result);
  await assert.rejects(()=>readCanvasV2ScreenAssetPixels('https://retained.test/bad.gif',signal,async()=>new Response('not a GIF',{headers:{'content-type':'image/gif'}})),/readable GIF/);
  await assert.rejects(()=>readCanvasV2ScreenAssetPixels('https://retained.test/large.gif',signal,async()=>new Response(bytes,{headers:{'content-type':'image/gif','content-length':'6000000'}})),/4.5 MB/);
});
