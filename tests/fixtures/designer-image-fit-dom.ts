/** Actual compiler/rendered DOM crop-fit-save-restore regression. */
import { applyCanvasV2NativeSceneMutation, compileCanvasV2NativeScene, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../../lib/canvas-v2/native-scene';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactDocument, type CanvasV2ArtifactRevision } from '../../lib/canvas-v2/types';
import { FIXTURE_PHOTO_DATA_URL } from '../../app/canvas-v2-e2e/direct-edit-contract/fixture-assets';
const extent=131072,empty:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'base',width:extent,height:extent,rootIds:[],nodes:[],css:''};
const created=applyCanvasV2NativeSceneMutation(empty,{kind:'create',primitive:'image',nodeId:'photo',x:65000,y:64000,width:320,height:180,src:FIXTURE_PHOTO_DATA_URL});
// A pre-existing authored mask must survive changing the pixel fit.
const masked=structuredClone(created);masked.nodes[0].inlineStyle['clip-path']='ellipse(50% 50% at 50% 50%)';
const cropped=applyCanvasV2NativeSceneMutation(masked,{kind:'image-crop',nodeId:'photo',x:75,y:20,zoom:2}),history=serializeCanvasV2NativeScene(cropped);
const results:Array<{name:string;passed:boolean;detail:unknown}>=[];
function equal(actual:unknown,expected:unknown,label:string){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`${label}: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}`)}
async function compile(source:CanvasV2ArtifactDocument){
 const frame=document.createElement('iframe');frame.style.cssText='position:absolute;left:-30000px;top:0;width:1200px;height:900px;border:0';document.body.append(frame);
 try{const doc=frame.contentDocument!;doc.open();doc.write(`<!doctype html><html><head><style>html,body{margin:0;position:relative;width:${extent}px;height:${extent}px}*{box-sizing:border-box}${source.css}</style></head><body>${source.html}</body></html>`);doc.close();
  await Promise.all([...doc.images].map(async image=>{image.loading='eager';await image.decode()}));
  const image=doc.querySelector<HTMLImageElement>('[data-canvas-v2-crop-source="true"]')!,owner=image.parentElement!,box=owner.getBoundingClientRect(),pixels=image.getBoundingClientRect(),style=doc.defaultView!.getComputedStyle(image);
  const measured={width:pixels.width,height:pixels.height,left:pixels.left-box.left,top:pixels.top-box.top,objectFit:style.objectFit,objectPosition:style.objectPosition,mask:doc.defaultView!.getComputedStyle(owner).clipPath};
  const revision:CanvasV2ArtifactRevision={schema:CANVAS_V2_ARTIFACT_SCHEMA,id:'restored',state:'committed',createdAt:'2026-10-20T00:00:00Z',placementAuthority:'shared',document:source,evidence:[]};
  return{scene:compileCanvasV2NativeScene({document:doc,revision,width:extent,height:extent}),measured};
 }finally{frame.remove()}
}
for(const fit of ['contain','fill']){
 try{
  const before=await compile(history),changed=applyCanvasV2NativeSceneMutation(cropped,{kind:'style',nodeId:'photo',property:'object-fit',value:fit});
  const first=await compile(serializeCanvasV2NativeScene(changed)),restored=await compile(serializeCanvasV2NativeScene(first.scene)),undo=await compile(history);
  const expected={width:320,height:180,left:0,top:0,objectFit:fit,objectPosition:'50% 50%',mask:'ellipse(50% 50% at 50% 50%)'};
  equal(first.measured,expected,'Fit pixels');equal(restored.measured,expected,'Restored fit pixels');equal(undo.measured,before.measured,'Undo restored crop pixels');
  equal(before.measured.width,640,'Original crop zoom width');equal(before.measured.height,360,'Original crop zoom height');equal(before.measured.left,-240,'Original crop horizontal offset');equal(before.measured.top,-36,'Original crop vertical offset');
  for(const scene of [first.scene,restored.scene,undo.scene]){const owner=scene.nodes.find(node=>node.sourceNodeId==='photo')!;equal({x:owner.geometry.x,y:owner.geometry.y,width:owner.geometry.width,height:owner.geometry.height},{x:65000,y:64000,width:320,height:180},'Frame geometry');equal(scene.nodes.find(node=>node.attributes['data-canvas-v2-crop-source']==='true')?.attributes.src,FIXTURE_PHOTO_DATA_URL,'Retained pixel source')}
  results.push({name:`Crop to ${fit}, fresh save/recompile and undo preserve pixels/frame/source/mask`,passed:true,detail:{before:before.measured,after:first.measured,restored:restored.measured,undo:undo.measured}});
 }catch(error){results.push({name:`Crop to ${fit} fresh save/recompile and undo`,passed:false,detail:String(error)})}
}
const pre=document.createElement('pre');pre.id='designer-image-results';pre.textContent=JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,results},null,2);document.body.append(pre);document.title=results.every(r=>r.passed)?'PASS cropped image fits':'FAIL cropped image fits';
