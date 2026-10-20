/** Browser-only actual compiler regression. Synthetic source, no application,
 * account, model, production board or remote resource calls. */
import { applyCanvasV2NativeSceneMutation, canvasV2NativeSceneAbsoluteBounds, compileCanvasV2NativeScene, serializeCanvasV2NativeScene, CANVAS_V2_NATIVE_SCENE_SCHEMA, type CanvasV2NativeSceneDocument } from '../../lib/canvas-v2/native-scene';
import { createCanvasV2CandidateRevision } from '../../lib/canvas-v2/revisions';
import { revisionFromSharedCells, sharedCellsFromRevision } from '../../lib/canvas-v2/sessions/collaboration-document';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision, type CanvasV2ArtifactDocument } from '../../lib/canvas-v2/types';
const width=12000,height=8000;
const empty:CanvasV2NativeSceneDocument={schema:CANVAS_V2_NATIVE_SCENE_SCHEMA,revisionId:'base',width,height,rootIds:[],nodes:[],css:''};
const base=applyCanvasV2NativeSceneMutation(empty,{kind:'create',primitive:'shape',nodeId:'existing',x:1800,y:1600,width:300,height:200});
const reference=applyCanvasV2NativeSceneMutation(base,{kind:'move',nodeId:'existing',deltaX:4200,deltaY:1400});
const version=(document:CanvasV2ArtifactDocument):CanvasV2ArtifactRevision=>({schema:CANVAS_V2_ARTIFACT_SCHEMA,id:'accepted',state:'committed',createdAt:'2026-10-20T00:00:00Z',document,evidence:[]});
const shared=(document:CanvasV2ArtifactDocument)=>revisionFromSharedCells(sharedCellsFromRevision(version(document)),version(document),'shared-accepted');
const results:Array<{name:string;passed:boolean;detail:unknown}>=[];
function check(name:string,run:()=>unknown){try{results.push({name,passed:true,detail:run()})}catch(error){results.push({name,passed:false,detail:String(error)})}}
function equal(actual:unknown,expected:unknown,label:string){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`${label}: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}`)}
function compile(revision:CanvasV2ArtifactRevision,placementReferenceScene:CanvasV2NativeSceneDocument,preferredPlacement:{x:number;y:number}){
 const frame=document.createElement('iframe');frame.style.cssText=`position:absolute;left:-30000px;top:0;width:${width}px;height:${height}px;border:0`;document.body.append(frame);
 try{const doc=frame.contentDocument!;doc.open();doc.write(`<!doctype html><html><head><style>html,body{margin:0;position:relative;width:${width}px;height:${height}px}*{box-sizing:border-box}${revision.document.css}</style></head><body>${revision.document.html}</body></html>`);doc.close();return compileCanvasV2NativeScene({document:doc,revision,width,height,placementReferenceScene,preferredPlacement});}finally{frame.remove()}
}
const rectangle=(scene:CanvasV2NativeSceneDocument,id:string)=>{const b=canvasV2NativeSceneAbsoluteBounds(scene,id);if(!b)throw Error('Missing '+id);return{x:b.x,y:b.y,width:b.width,height:b.height}};
const views=[{reference:base,camera:{x:100,y:150}},{reference,camera:{x:8500,y:6500}}];
check('new accepted shared root is identical across unrelated local scenes and camera anchors',()=>{
 const next=applyCanvasV2NativeSceneMutation(base,{kind:'create',primitive:'shape',nodeId:'new-root',x:3400,y:2300,width:420,height:260}),revision=shared(serializeCanvasV2NativeScene(next));
 const measured=views.map(view=>{const scene=compile(revision,view.reference,view.camera);equal(rectangle(scene,'existing'),{x:1800,y:1600,width:300,height:200},'Existing accepted geometry');equal(rectangle(scene,'new-root'),{x:3400,y:2300,width:420,height:260},'New accepted geometry');return rectangle(scene,'new-root')});return measured;
});
check('accepted moved existing root is not pinned to this device old reference geometry',()=>{
 const moved=applyCanvasV2NativeSceneMutation(base,{kind:'move',nodeId:'existing',deltaX:1800,deltaY:900}),revision=shared(serializeCanvasV2NativeScene(moved));
 return views.map(view=>{const result=rectangle(compile(revision,view.reference,view.camera),'existing');equal(result,{x:3600,y:2500,width:300,height:200},'Moved shared geometry');return result});
});
check('shared canvas flow root never acquires this device fresh viewport padding',()=>{
 const document={html:'<main data-canvas-v2-node-id="canvas" data-canvas-v2-workspace-root="true" style="position:relative;width:12000px;height:8000px"><section data-canvas-v2-node-id="flow-piece" data-canvas-v2-scene-layout="flow" style="width:300px;height:200px;background:purple;--canvas-v2-scene-x:2200px;--canvas-v2-scene-y:1900px;--canvas-v2-scene-width:300px;--canvas-v2-scene-height:200px"></section></main>',css:serializeCanvasV2NativeScene(empty).css};
 const revision=shared(document);return [{x:100,y:150},{x:8500,y:6500}].map(camera=>{const scene=compile(revision,empty,camera),root=scene.nodes.find(node=>node.sourceNodeId==='canvas')!;equal(root.inlineStyle['padding-left'],undefined,'Local viewport padding');equal(root.attributes['data-canvas-v2-viewport-placed'],undefined,'Local viewport authority');const result=rectangle(scene,'flow-piece');equal(result,{x:2200,y:1900,width:300,height:200},'Flow shared geometry');return result});
});
check('ordinary AI compilation still pins an existing root to committed local reference truth',()=>{
 const document=serializeCanvasV2NativeScene(base),revision=createCanvasV2CandidateRevision({id:'local-ai-candidate',parent:shared(document),document,createdAt:'2026-10-20T00:01:00Z'});return views.map(view=>{const result=rectangle(compile(revision,reference,view.camera),'existing');equal(result,{x:6000,y:3000,width:300,height:200},'Normal AI reference pin');return result});
});
const pre=document.createElement('pre');pre.id='shared-placement-results';pre.textContent=JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,results},null,2);document.body.append(pre);document.title=results.every(r=>r.passed)?'PASS shared placement':'FAIL shared placement';
