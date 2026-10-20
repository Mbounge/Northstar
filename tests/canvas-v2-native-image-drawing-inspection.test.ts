import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { applyCanvasV2NativeSceneMutation, serializeCanvasV2NativeScene, canvasV2NativeSceneNodeSupportsTextEditing, canvasV2NativeSceneNodeIsWritable, type CanvasV2NativeSceneDocument, type CanvasV2NativeSceneNode } from '../lib/canvas-v2/native-scene';
import { canvasV2ObjectOrigin } from '../lib/canvas-v2/working-context';
import type { CanvasV2InspectableElement } from '../lib/canvas-v2/element-inspection';
import { FIXTURE_PHOTO_DATA_URL } from '../app/canvas-v2-e2e/direct-edit-contract/fixture-assets';
const empty:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'initial',width:131072,height:131072,rootIds:[],nodes:[],css:''};
const created=applyCanvasV2NativeSceneMutation(empty,{kind:'create',primitive:'image',nodeId:'photo',x:65000,y:64000,width:320,height:180,src:FIXTURE_PHOTO_DATA_URL});
created.nodes[0].evidence={id:'retained-photo',role:'analysis-copy',sourceNodeId:'canonical-source'};
// A pre-existing authored mask must survive changing the pixel fit.
const masked=structuredClone(created);masked.nodes[0].inlineStyle['clip-path']='ellipse(50% 50% at 50% 50%)';
const crop=applyCanvasV2NativeSceneMutation(masked,{kind:'image-crop',nodeId:'photo',x:75,y:20,zoom:2});
const pixels=(scene:CanvasV2NativeSceneDocument)=>scene.nodes.find(node=>node.attributes['data-canvas-v2-crop-source']==='true')!;

for(const fit of ['contain','fill'])test(`changing cropped pixels to ${fit} resets their transform, retains frame/source/mask and preserves the prior undo snapshot`,()=>{
 const snapshot=JSON.stringify(crop),serialized=serializeCanvasV2NativeScene(crop);
 const next=applyCanvasV2NativeSceneMutation(crop,{kind:'style',nodeId:'photo',property:'object-fit',value:fit}),frame=next.nodes.find(node=>node.id==='photo')!,image=pixels(next);
 assert.deepEqual(frame.geometry,crop.nodes[0].geometry);assert.equal(frame.inlineStyle['clip-path'],crop.nodes[0].inlineStyle['clip-path']);
 assert.deepEqual(Object.fromEntries(['width','height','left','top','object-fit','object-position'].map(key=>[key,image.inlineStyle[key]])),{width:'100%',height:'100%',left:'0%',top:'0%','object-fit':fit,'object-position':'50% 50%'});
 assert.equal(frame.inlineStyle['object-fit'],fit);assert.equal(frame.attributes['data-canvas-v2-crop-zoom'],'1');
 assert.equal(image.id,pixels(crop).id);assert.equal(image.attributes.src,FIXTURE_PHOTO_DATA_URL);assert.deepEqual(image.evidence,pixels(crop).evidence);
 assert.equal(JSON.stringify(crop),snapshot);assert.deepEqual(serializeCanvasV2NativeScene(crop),serialized,'Undo history must retain the original crop bytes');
 assert.equal(pixels(crop).inlineStyle.width,'200%');assert.equal(pixels(crop).inlineStyle.left,'-75%');assert.equal(pixels(crop).inlineStyle.top,'-20%');
 const recropped=applyCanvasV2NativeSceneMutation(next,{kind:'image-crop',nodeId:'photo',x:10,y:90,zoom:1.5});
 assert.equal(recropped.nodes.find(node=>node.id==='photo')?.inlineStyle['object-fit'],'cover');assert.equal(pixels(recropped).inlineStyle['object-fit'],'cover');
});

function inspector(){
 const file='components/canvas-v2/native-canvas-scene.tsx',tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=new Map<string,string>();
 const walk=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name&&['absoluteGeometry','inspectNativeNode'].includes(node.name.text))functions.set(node.name.text,node.getText(tree));ts.forEachChild(node,walk)};walk(tree);assert.equal(functions.size,2);
 const code=ts.transpileModule([...functions.values()].join('\n')+'\nglobalThis.inspect=inspectNativeNode;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const context=vm.createContext({canvasV2ObjectOrigin,canvasV2NativeSceneNodeSupportsTextEditing,canvasV2NativeSceneNodeIsWritable});vm.runInContext(code,context);
 return context.inspect as(node:CanvasV2NativeSceneNode,byId:Map<string,CanvasV2NativeSceneNode>,element?:unknown)=>CanvasV2InspectableElement;
}

test('native drawing inspector reports the real child stroke rather than transparent parent fill',()=>{
 const drawing=applyCanvasV2NativeSceneMutation(empty,{kind:'create',primitive:'drawing',nodeId:'drawing',x:100,y:200,width:160,height:72});
 const changed=applyCanvasV2NativeSceneMutation(drawing,{kind:'style',nodeId:'drawing',property:'background-color',value:'#cc3366'});
 const inspect=inspector(),map=new Map(changed.nodes.map(node=>[node.id,node]));
 const element={ownerDocument:{defaultView:{getComputedStyle:()=>({backgroundColor:'rgba(0, 0, 0, 0)'})}}};
 const result=inspect(changed.nodes[0],map,element);assert.equal(result.visualStyle?.backgroundColor,'#cc3366');assert.equal(result.kind,'drawing');
 assert.equal(changed.nodes[0].inlineStyle['background-color'],undefined);assert.equal(changed.nodes[1].attributes.stroke,'#cc3366');
});

test('token-based drawing stroke resolves from the child and image fit reads durable pixels intent over wrapper computed defaults',()=>{
 const drawing=applyCanvasV2NativeSceneMutation(empty,{kind:'create',primitive:'drawing',nodeId:'drawing',x:100,y:200});
 const inspect=inspector(),stroke={ownerDocument:{defaultView:{getComputedStyle:()=>({stroke:'rgb(139, 115, 248)'})}}};
 const element={querySelector:()=>stroke,ownerDocument:{defaultView:{getComputedStyle:()=>({backgroundColor:'transparent',objectFit:'fill'})}}};
 assert.equal(inspect(drawing.nodes[0],new Map(drawing.nodes.map(node=>[node.id,node])),element).visualStyle?.backgroundColor,'rgb(139, 115, 248)');
 const contained=applyCanvasV2NativeSceneMutation(crop,{kind:'style',nodeId:'photo',property:'object-fit',value:'contain'});
 assert.equal(inspect(contained.nodes[0],new Map(contained.nodes.map(node=>[node.id,node])),element).visualStyle?.objectFit,'contain');
});
