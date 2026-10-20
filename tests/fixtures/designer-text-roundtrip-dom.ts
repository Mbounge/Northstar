/** Actual Chromium compiler regression for the range-formatting ownership bug.
 * Synthetic copy preserves the browser-reproduced primitive/marked-span shape.
 * No accounts, remote resources, model calls or application state. */
import { applyCanvasV2NativeSceneMutation, canvasV2NativeSceneNodeSupportsTextEditing, compileCanvasV2NativeScene, serializeCanvasV2NativeScene, CANVAS_V2_NATIVE_SCENE_SCHEMA, type CanvasV2NativeSceneDocument } from '../../lib/canvas-v2/native-scene';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactDocument, type CanvasV2ArtifactRevision } from '../../lib/canvas-v2/types';
const extent=131072;
const empty:CanvasV2NativeSceneDocument={schema:CANVAS_V2_NATIVE_SCENE_SCHEMA,revisionId:'base',width:extent,height:extent,rootIds:[],nodes:[],css:''};
const base=applyCanvasV2NativeSceneMutation(empty,{kind:'create',primitive:'text',nodeId:'manual-text',x:65280,y:65431.67,width:450,height:99,text:'First phrase and second phrase.',textMode:'area'});
const guard=serializeCanvasV2NativeScene(base).css;
const results:Array<{name:string;passed:boolean;detail:unknown}>=[];
function check(name:string,run:()=>unknown){try{results.push({name,passed:true,detail:run()})}catch(error){results.push({name,passed:false,detail:String(error)})}}
function assert(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
function compile(source:CanvasV2ArtifactDocument,id='compiled'){
 const frame=document.createElement('iframe');frame.style.cssText='position:absolute;left:-30000px;top:0;width:1200px;height:900px;border:0';document.body.append(frame);
 try{const doc=frame.contentDocument!;doc.open();doc.write(`<!doctype html><html><head><style>html,body{margin:0;position:relative;width:${extent}px;height:${extent}px}*{box-sizing:border-box}${source.css}</style></head><body>${source.html}</body></html>`);doc.close();const revision:CanvasV2ArtifactRevision={schema:CANVAS_V2_ARTIFACT_SCHEMA,id,state:'committed',createdAt:'2026-10-20T00:00:00Z',placementAuthority:'shared',document:source,evidence:[]};return compileCanvasV2NativeScene({document:doc,revision,width:extent,height:extent});}finally{frame.remove()}
}
const ownership=(scene:CanvasV2NativeSceneDocument,id='manual-text',legacy=false)=>{
 const owner=scene.nodes.find(node=>node.sourceNodeId===id);assert(owner,'Missing original text owner');
 const map=new Map(scene.nodes.map(node=>[node.id,node]));
 assert(owner.selectable,'Original text owner lost selection');assert(canvasV2NativeSceneNodeSupportsTextEditing(owner,map),'Original text owner lost native text editing');
 const descendants=scene.nodes.filter(node=>node.parentId===owner.id);assert(descendants.every(node=>!node.selectable),'Inline formatting became an independent canvas object');
 assert(!scene.nodes.some(node=>node.attributes['data-canvas-v2-direct-text-fragment']==='true'&&(!legacy||node.attributes['data-canvas-v2-rich-text']!=='true')),'Compiler split text into an orphan fragment');
 assert(owner.geometry.x===65280&&Math.abs(owner.geometry.y-65431.67)<.01,'Text world position changed');
 return {owner:owner.sourceNodeId,selectable:owner.selectable,textEditable:true,children:descendants.map(node=>({id:node.sourceNodeId,selectable:node.selectable,fontSize:node.inlineStyle['font-size']})),geometry:owner.geometry};
};
check('range-formatted native text compiles and recompiles as one editable owner',()=>{
 const formatted=applyCanvasV2NativeSceneMutation(base,{kind:'text',nodeId:'manual-text',text:'First phrase and second phrase.',layout:{width:450,height:99},nativeContent:[
  {sceneNodeId:'rich-first',tagName:'span',style:{'font-size':'48px'},content:[{kind:'text',value:'First phrase'}]},
  {sceneNodeId:'manual-text',content:[{kind:'node',id:'rich-first'},{kind:'text',value:' and second phrase.'}],style:{}},
 ]});
 const source=serializeCanvasV2NativeScene(formatted);let scene=compile(source);const passes=[ownership(scene)];
 for(let i=0;i<2;i++){scene=compile(serializeCanvasV2NativeScene(scene),'roundtrip-'+i);passes.push(ownership(scene));}
 assert(scene.nodes.find(node=>node.sourceNodeId==='rich-first')?.inlineStyle['font-size']==='48px','Selected range size changed');
 return passes;
});
check('browser-reproduced div text primitive with marked span and raw tail remains one owner',()=>{
 const source={html:'<div data-canvas-v2-node-id="manual-text" data-canvas-v2-origin="user" data-canvas-v2-primitive="text" data-canvas-v2-text-mode="area" data-canvas-v2-scene-layout="absolute" style="font:600 28px/1.3 Inter,system-ui,sans-serif;--canvas-v2-scene-x:65280px;--canvas-v2-scene-y:65431.67px;--canvas-v2-scene-width:450px;--canvas-v2-scene-height:99px"><span data-canvas-v2-node-id="rich-first" data-canvas-v2-rich-text="true" style="font-size:48px">First phrase</span> and second phrase.</div>',css:guard};
 return ownership(compile(source));
});
check('nested range formatting and anonymous emphasis remain owned without promotion',()=>{
 const source={html:'<div data-canvas-v2-node-id="manual-text" data-canvas-v2-primitive="text" data-canvas-v2-scene-layout="absolute" style="--canvas-v2-scene-x:65280px;--canvas-v2-scene-y:65431.67px;--canvas-v2-scene-width:450px;--canvas-v2-scene-height:99px"><span data-canvas-v2-node-id="rich-first" data-canvas-v2-rich-text="true" style="font-size:48px"><b>First phrase</b></span><em> and second</em> phrase.</div>',css:guard};
 return ownership(compile(source));
});
check('independent authored descendants retain separate objects and orphan text remains addressable',()=>{
 const source={html:'<div data-canvas-v2-node-id="structural" style="position:absolute;left:300px;top:300px;width:450px;height:150px"><span data-canvas-v2-node-id="independent">Independent headline</span> Separate tail.</div>',css:''};
 const scene=compile(source),map=new Map(scene.nodes.map(node=>[node.id,node]));
 const parent=scene.nodes.find(node=>node.sourceNodeId==='structural')!,child=scene.nodes.find(node=>node.sourceNodeId==='independent')!;
 assert(!canvasV2NativeSceneNodeSupportsTextEditing(parent,map),'Independent object was absorbed by its parent');assert(child.selectable,'Independent text lost selection');
 assert(scene.nodes.some(node=>node.attributes['data-canvas-v2-direct-text-fragment']==='true'&&node.selectable),'Unowned tail lost its selectable object');
 return {parentSelectable:parent.selectable,childSelectable:child.selectable};
});
check('legacy compiler-created tail fragment rejoins the original formatted text owner through fresh save roundtrip',()=>{
 const source={html:'<div data-canvas-v2-node-id="manual-text" data-canvas-v2-primitive="text" data-canvas-v2-scene-layout="absolute" style="font:600 28px/1.3 Inter,system-ui,sans-serif;--canvas-v2-scene-x:65280px;--canvas-v2-scene-y:65431.67px;--canvas-v2-scene-width:450px;--canvas-v2-scene-height:99px"><span data-canvas-v2-node-id="rich-first" data-canvas-v2-rich-text="true" style="font-size:48px">First phrase</span><span data-canvas-v2-node-id="manual-text-text-1" data-canvas-v2-direct-text-fragment="true" style="font:inherit;color:inherit"> and second phrase.</span></div>',css:guard};
 const scene=compile(source),first=ownership(scene,'manual-text',true);const tail=scene.nodes.find(node=>node.sourceNodeId==='manual-text-text-1')!;
 assert(tail.attributes['data-canvas-v2-rich-text']==='true'&&!tail.selectable,'Legacy tail did not rejoin formatting ownership');
 const fresh=compile(serializeCanvasV2NativeScene(scene),'legacy-restored');return [first,ownership(fresh,'manual-text',true)];
});
check('legacy tail beside a true independent child stays independent even when another rich run exists',()=>{
 const source={html:'<div data-canvas-v2-node-id="structural" style="position:absolute;left:300px;top:300px;width:450px;height:150px"><span data-canvas-v2-node-id="rich-first" data-canvas-v2-rich-text="true">Styled phrase</span><span data-canvas-v2-node-id="independent">Independent headline</span><span data-canvas-v2-node-id="tail-fragment" data-canvas-v2-direct-text-fragment="true"> Separate tail.</span></div>',css:''};
 const scene=compile(source),map=new Map(scene.nodes.map(node=>[node.id,node])),parent=scene.nodes.find(node=>node.sourceNodeId==='structural')!,tail=scene.nodes.find(node=>node.sourceNodeId==='tail-fragment')!;
 assert(!canvasV2NativeSceneNodeSupportsTextEditing(parent,map),'True independent child was absorbed');assert(tail.selectable&&tail.attributes['data-canvas-v2-rich-text']!=='true','Legacy tail was incorrectly merged across an independent child');
 return {parentSelectable:parent.selectable,tailSelectable:tail.selectable};
});
const pre=document.createElement('pre');pre.id='designer-text-results';pre.textContent=JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,results},null,2);document.body.append(pre);document.title=results.every(r=>r.passed)?'PASS designer text ownership':'FAIL designer text ownership';
