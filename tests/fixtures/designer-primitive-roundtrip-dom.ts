/** Fresh-source native primitive classification, preserving actual renderer
 * families across save/recompile rather than relying on an in-memory graph. */
import { applyCanvasV2NativeSceneMutation, compileCanvasV2NativeScene, serializeCanvasV2NativeScene, canvasV2NativeSceneNodeSupportsTextEditing, canvasV2NativeTableRows, type CanvasV2NativeSceneDocument, type CanvasV2NativeSceneNode } from '../../lib/canvas-v2/native-scene';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision, type CanvasV2ArtifactDocument } from '../../lib/canvas-v2/types';
import { applyCanvasV2ManualMutation, type CanvasV2ManualPrimitive } from '../../lib/canvas-v2/manual-mutations';
import { buildCanvasV2RuntimeDocument } from '../../lib/canvas-v2/runtime-document';
import { FIXTURE_PHOTO_DATA_URL } from '../../app/canvas-v2-e2e/direct-edit-contract/fixture-assets';
declare const WORKSPACE_TABLE_ACTIONS:(engine:{nativeScene:CanvasV2NativeSceneDocument},selectedElement:{nodeId:string},rows:typeof canvasV2NativeTableRows,submit:(mutation:Parameters<typeof applyCanvasV2NativeSceneMutation>[1])=>void,clear:(selection:unknown[])=>void,target:(nodeId:string)=>void)=>{selectedTable:CanvasV2NativeSceneNode|undefined;editTable:(action:'add-row')=>void};
const extent=131072,empty:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'base',width:extent,height:extent,rootIds:[],nodes:[],css:''};
const families:CanvasV2ManualPrimitive[]=['text','shape','note','line','connector','drawing','frame','image','table'];
let authored=empty;
for(const [i,primitive]of families.entries())authored=applyCanvasV2NativeSceneMutation(authored,{kind:'create',primitive,nodeId:'kind-'+primitive,x:65000+i*500,y:64000,width:280,height:160,text:'Original human '+primitive,...(primitive==='image'?{src:FIXTURE_PHOTO_DATA_URL}:{})});
const source=serializeCanvasV2NativeScene(authored),results:Array<{name:string;passed:boolean;detail:unknown}>=[];
function assert(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
function equal(actual:unknown,expected:unknown,label:string){assert(JSON.stringify(actual)===JSON.stringify(expected),label+': actual '+JSON.stringify(actual)+' expected '+JSON.stringify(expected))}
async function compile(source:CanvasV2ArtifactDocument,id='fresh'){
 const frame=document.createElement('iframe');frame.style.cssText='position:absolute;left:-30000px;top:0;width:1200px;height:900px;border:0';document.body.append(frame);
 try{const revision:CanvasV2ArtifactRevision={schema:CANVAS_V2_ARTIFACT_SCHEMA,id,state:'committed',createdAt:'2026-10-20T00:00:00Z',placementAuthority:'shared',document:source,evidence:[]};const doc=frame.contentDocument!;doc.open();doc.write(buildCanvasV2RuntimeDocument(revision));doc.close();await Promise.all([...doc.images].map(async image=>{image.loading='eager';await image.decode()}));return compileCanvasV2NativeScene({document:doc,revision,width:extent,height:extent});
 }finally{frame.remove()}
}
const first=await compile(source),second=await compile(serializeCanvasV2NativeScene(first),'second'),third=await compile(serializeCanvasV2NativeScene(second),'third');
for(const family of families){try{
 const before=authored.nodes.find(node=>node.sourceNodeId==='kind-'+family)!;
 const rounds=[first,second,third].map(scene=>{const node=scene.nodes.find(node=>node.sourceNodeId===before.sourceNodeId);assert(node,'Missing '+family);equal(node.kind,before.kind,'Primitive family '+family);equal({x:node.geometry.x,y:node.geometry.y,width:node.geometry.width,height:node.geometry.height,rotation:node.geometry.rotation},{x:before.geometry.x,y:before.geometry.y,width:before.geometry.width,height:before.geometry.height,rotation:before.geometry.rotation},'Durable geometry '+family);if(family==='table'){const cells=canvasV2NativeTableRows(scene,node.sourceNodeId!).flat(),byId=new Map(scene.nodes.map(item=>[item.id,item]));assert(cells.length===4&&cells.every(cell=>cell.selectable&&canvasV2NativeSceneNodeSupportsTextEditing(cell,byId)),'Table lost selectable editable cells')}else assert(node.selectable,'Primitive root lost selection '+family);return{kind:node.kind,selectable:node.selectable,geometry:node.geometry}});
 results.push({name:family+' preserves family, selection and geometry through three fresh compiles',passed:true,detail:rounds});
 }catch(error){results.push({name:family+' fresh save/recompile',passed:false,detail:String(error)})}}
try{
 const table=third.nodes.find(node=>node.sourceNodeId==='kind-table')!,originalRows=canvasV2NativeTableRows(third,table.sourceNodeId!),cell=originalRows[0][0];let edited=third;const selections:unknown[][]=[];let target:string|undefined;
 const controls=WORKSPACE_TABLE_ACTIONS({nativeScene:third},{nodeId:cell.sourceNodeId!},canvasV2NativeTableRows,mutation=>{edited=applyCanvasV2NativeSceneMutation(edited,mutation)},selection=>selections.push(selection),nodeId=>{target=nodeId});
 equal(controls.selectedTable?.sourceNodeId,'kind-table','Cell resolves real Workspace table controls');controls.editTable('add-row');equal(canvasV2NativeTableRows(edited,'kind-table').length,3,'Real Add row callback');equal(selections,[[]],'Row callback clears prior cell selection');equal(target,'kind-table','Row callback targets table');
 edited=applyCanvasV2NativeSceneMutation(edited,{kind:'text',nodeId:cell.sourceNodeId!,text:'Human edited table cell'});const fresh=await compile(serializeCanvasV2NativeScene(edited),'table-action-restored');
 equal(canvasV2NativeTableRows(fresh,'kind-table').length,3,'Restored row operation');equal(fresh.nodes.find(node=>node.sourceNodeId===cell.sourceNodeId)?.directText,'Human edited table cell','Restored exact cell text');results.push({name:'selectable cell resolves actual Workspace table controls and Add row/cell text survives fresh source restore',passed:true,detail:{selectedCell:cell.sourceNodeId,rows:3}});
}catch(error){results.push({name:'actual table cell selection/control/save contract',passed:false,detail:String(error)})}
try{
 const old=await compile({html:`<img data-canvas-v2-node-id="legacy-image" src="${FIXTURE_PHOTO_DATA_URL}" style="position:absolute;left:300px;top:300px;width:320px;height:180px">`,css:''});equal(old.nodes.find(node=>node.sourceNodeId==='legacy-image')?.kind,'image','Legacy IMG family');
 const cropped=applyCanvasV2NativeSceneMutation(authored,{kind:'image-crop',nodeId:'kind-image',x:25,y:75,zoom:2}),document=serializeCanvasV2NativeScene(cropped),restored=await compile(document,'restored-crop');
 equal(restored.nodes.find(node=>node.sourceNodeId==='kind-image')?.kind,'image','Crop DIV family');equal(restored.nodes.find(node=>node.sourceNodeId==='kind-image')?.attributes['data-canvas-v2-crop-zoom'],'2','Crop intent');results.push({name:'legacy untyped IMG and prior cropped DIV retain image semantics',passed:true,detail:{legacy:'image',crop:'image'}});
}catch(error){results.push({name:'legacy/cropped image family',passed:false,detail:String(error)})}
try{
 let message='';try{applyCanvasV2ManualMutation({html:'<div data-canvas-v2-node-id="photo" data-canvas-v2-crop-frame="true"></div>',css:''},{kind:'image-crop',nodeId:'photo',x:50,y:50,zoom:1.1})}catch(error){message=String(error)}
 assert(/ready native canvas/i.test(message)&&!/ungroup/i.test(message),'Unsupported native crop was mislabeled '+message);
 let groupMessage='';try{applyCanvasV2ManualMutation({html:'<div data-canvas-v2-node-id="photo"></div>',css:''},{kind:'ungroup',nodeId:'photo'})}catch(error){groupMessage=String(error)}
 assert(/explicit North Star object group/.test(groupMessage),'Real ungroup lost its precise guard');results.push({name:'legacy crop fallback refuses native-only edit without entering the ungroup branch',passed:true,detail:{message,groupMessage}});
}catch(error){results.push({name:'legacy native-only fallback safety',passed:false,detail:String(error)})}
const pre=document.createElement('pre');pre.id='designer-primitive-results';pre.textContent=JSON.stringify({passed:results.filter(result=>result.passed).length,total:results.length,results},null,2);document.body.append(pre);document.title=results.every(result=>result.passed)?'PASS primitive roundtrips':'FAIL primitive roundtrips';
