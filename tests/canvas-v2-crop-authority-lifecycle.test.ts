import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { applyCanvasV2NativeSceneMutation, patchCanvasV2NativeDocument, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import { serializeCanvasV2NativeSceneChanges } from '../lib/canvas-v2/native-scene-source';
import { describeCanvasV2ManualMutation } from '../lib/canvas-v2/manual-mutations';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';
import { FIXTURE_PHOTO_DATA_URL } from '../app/canvas-v2-e2e/direct-edit-contract/fixture-assets';
import type { useCanvasV2DesignLoop } from '../components/canvas-v2/use-canvas-v2-design-loop';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
const tree=ts.createSourceFile('workspace.tsx',readFileSync(root+'components/canvas-v2/canvas-v2-workspace.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map<string,string>();let receive:ts.Expression|undefined,admission:ts.Expression|undefined;
const walk=(node:ts.Node)=>{
 if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['serializeManualNativeScene','submitMutation','finishCrop'].includes(node.name.text))declarations.set(node.name.text,node.getText(tree));
 if(ts.isFunctionDeclaration(node)&&node.name?.text==='imageCropMutation')declarations.set(node.name.text,node.getText(tree));
 if(ts.isBinaryExpression(node)&&node.left.getText(tree)==='receiveCollaborativeRevision.current')receive=node.right;
 if(!admission&&ts.isJsxSelfClosingElement(node)&&node.tagName.getText(tree)==='CanvasV2CanvasScene'){const prop=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='onNativeScene');if(prop&&ts.isJsxAttribute(prop)&&prop.initializer&&ts.isJsxExpression(prop.initializer))admission=prop.initializer.expression;}
 ts.forEachChild(node,walk);
};walk(tree);assert.equal(declarations.size,4);assert.ok(receive&&admission);
const empty:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'crop-base',width:131072,height:131072,rootIds:[],nodes:[],css:''};
const created=applyCanvasV2NativeSceneMutation(empty,{kind:'batch',label:'Image and peer copy',mutations:[{kind:'create',primitive:'image',nodeId:'photo',x:65000,y:64000,width:420,height:236,src:FIXTURE_PHOTO_DATA_URL},{kind:'create',primitive:'text',nodeId:'peer-copy',x:65500,y:64000,text:'Original peer copy'}]});
const scene=applyCanvasV2NativeSceneMutation(created,{kind:'image-crop',nodeId:'photo',x:50,y:50,zoom:1.05});
const initial:CanvasV2ArtifactRevision={schema:CANVAS_V2_ARTIFACT_SCHEMA,id:scene.revisionId,state:'committed',createdAt:'2026-10-20T00:00:00Z',document:serializeCanvasV2NativeScene(scene),evidence:[]};
const peerScene={...applyCanvasV2NativeSceneMutation(scene,{kind:'text',nodeId:'peer-copy',text:'Accepted teammate copy'}),revisionId:'peer-next'};
const peer:CanvasV2ArtifactRevision={...initial,id:peerScene.revisionId,parentId:initial.id,placementAuthority:'shared',document:serializeCanvasV2NativeScene(peerScene)};
function engine(){
 const slots:unknown[]=[];let cursor=0;
 const react={useState:(initial:unknown)=>{const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?(initial as()=>unknown)():initial;return[slots[index],(value:unknown)=>{slots[index]=typeof value==='function'?(value as(before:unknown)=>unknown)(slots[index]):value}]},useRef:(initial:unknown)=>{const index=cursor++;return slots[index]??=( {current:initial})},useCallback:(callback:unknown)=>{cursor++;return callback},useMemo:(create:()=>unknown)=>{const index=cursor++;if(!(index in slots))slots[index]=create();return slots[index]},useEffect:()=>{cursor++}};
 const file=root+'components/canvas-v2/use-canvas-v2-design-loop.ts',exports:Record<string,unknown>={};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,AbortController,Date,Map,Set,setTimeout,clearTimeout,fetch:()=>assert.fail('No model/network call'),require:(name:string)=>name==='react'?react:require(name.startsWith('@/')?root+name.slice(2):name.startsWith('.')?fileURLToPath(new URL(name,'file://'+file)):name)});
 const invokeHook=exports.useCanvasV2DesignLoop as typeof useCanvasV2DesignLoop;
 const render=()=>{cursor=0;return invokeHook('/no-model',initial)};
 const value=render();value.receiveNativeScene(structuredClone(scene));return{value:render(),render};
}
function workspace({native=true,tidy=false,gesture}:{native?:boolean;tidy?:boolean;gesture?:'connector'|'tidy'}={}){
 const h=engine(),errors:string[]=[],remoteRevisionRef:{current?:CanvasV2ArtifactRevision}={};let legacyCalls=0;
 if(!native)h.value.receiveSharedRevision(peer);
 const original={nodeId:'photo',original:{x:65000,y:64000,width:420,height:236},frame:{x:65000,y:64000,width:420,height:236},image:{x:64989.5,y:63994.1,width:441,height:247.8}};
 const draft=structuredClone(original);draft.image.width+=21;draft.image.height+=11.8;
 const context=vm.createContext({engine:h.render(),cropDraft:tidy||gesture?undefined:draft,tidyDraft:tidy?{active:true}:undefined,cropInitialRef:{current:original},cropGestureRef:{current:undefined},directGestureRef:{},drawingGestureRef:{},connectorGestureRef:{current:gesture==='connector'?{}:undefined},tidyGestureRef:{current:gesture==='tidy'?{}:undefined},sceneElementsRef:{current:[{nodeId:'photo'}]},editingNodeId:undefined,remoteRevisionRef,collaborationReadOnly:false,stopFollowingRef:{current:()=>{}},useCallback:(callback:unknown)=>callback,
  applyCanvasV2NativeSceneMutation,patchCanvasV2NativeDocument,serializeCanvasV2NativeSceneChanges,describeCanvasV2ManualMutation,
  applyCanvasV2ManualMutation:()=>{legacyCalls++;throw Error('Unexpected legacy mutation fallback')},
  setMutationError:(message?:string)=>{if(message)errors.push(message)},setCropDraft:(value:unknown)=>{context.cropDraft=value},selectedElements:[{nodeId:'photo'}],setSelectedElements:()=>{},synchronizeSelectionWithNativeScene:()=>[],setSelectionTarget:()=>{},
 });
 const code=[declarations.get('imageCropMutation'),...['serializeManualNativeScene','submitMutation','finishCrop'].map(name=>'const '+declarations.get(name)+';'),`globalThis.actions={submitMutation,receive:(${receive!.getText(tree)}),finishCrop,admission:()=>(${admission!.getText(tree)})};`].join('\n');
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const actions=context.actions as{submitMutation:(mutation:unknown)=>boolean;receive:(revision:CanvasV2ArtifactRevision)=>void;finishCrop:()=>void;admission:()=>unknown};
 return{...actions,h,context,remoteRevisionRef,errors,legacyCalls:()=>legacyCalls,draft:()=>context.cropDraft};
}

for(const tidy of [false,true])test(`${tidy?'tidy':'crop'} draft defers peer revision before it can erase native authority, without admitting preview geometry`,()=>{
 const h=workspace({tidy});assert.equal(h.admission(),undefined,'A preview must never become committed geometry');h.receive(peer);
 assert.equal(h.h.value.readCommittedRevision().id,initial.id);assert.equal(h.h.value.readNativeScene()?.revisionId,initial.id);assert.equal(h.remoteRevisionRef.current,peer);
});

test('actual crop Finish commits through native authority, closes the draft and permits a fresh shared-source compilation',()=>{
 const h=workspace();h.receive(peer);h.finishCrop();assert.equal(h.legacyCalls(),0);assert.equal(h.draft(),undefined);assert.deepEqual(h.errors,[]);
 const committed=h.h.value.readCommittedRevision(),native=h.h.value.readNativeScene()!;assert.notEqual(committed.id,initial.id);assert.equal(native.revisionId,committed.id);
 assert.ok(Math.abs(parseFloat(native.nodes.find(node=>node.sourceNodeId==='photo-crop-source')!.inlineStyle.width)-110)<1e-8);
 assert.equal(h.admission(),h.context.engine.receiveNativeScene);
 const mergedScene=applyCanvasV2NativeSceneMutation(native,{kind:'text',nodeId:'peer-copy',text:'Accepted teammate copy'}),merged={...committed,id:'shared-after-crop',parentId:committed.id,placementAuthority:'shared' as const,document:serializeCanvasV2NativeScene(mergedScene)};
 h.h.value.receiveSharedRevision(merged);assert.equal(h.h.value.readNativeScene(),undefined,'Different shared source needs matching native truth');
 h.h.value.receiveNativeScene({...mergedScene,revisionId:merged.id});assert.equal(h.h.value.readNativeScene()?.revisionId,merged.id);assert.ok(Math.abs(parseFloat(h.h.value.readNativeScene()!.nodes.find(node=>node.sourceNodeId==='photo-crop-source')!.inlineStyle.width)-110)<1e-8);
});

test('while native authority is unavailable Finish keeps the crop recoverable and never routes a native-only crop into legacy mutation handling',()=>{
 const h=workspace({native:false});h.finishCrop();assert.equal(h.legacyCalls(),0);assert.ok(h.draft());assert.equal(h.h.value.readCommittedRevision().id,peer.id);assert.ok(h.errors.length);assert.match(h.errors[0],/canvas.*updating/i);assert.doesNotMatch(h.errors[0],/ungroup|legacy|not defined/i);
});

test('a late compiler callback for the old shared revision cannot restore stale native authority',()=>{
 const h=engine();h.value.receiveSharedRevision(peer);assert.equal(h.value.readNativeScene(),undefined);h.value.receiveNativeScene(scene);assert.equal(h.value.readNativeScene(),undefined);
 h.value.receiveNativeScene(peerScene);assert.equal(h.value.readNativeScene()?.revisionId,peer.id);assert.equal(h.value.readNativeScene()?.nodes.find(node=>node.sourceNodeId==='peer-copy')?.directText,'Accepted teammate copy');
});

for(const gesture of ['connector','tidy']as const)test(`${gesture} gesture defers peer updates before its first preview draft exists`,()=>{
 const h=workspace({gesture});assert.equal(h.draft(),undefined);h.receive(peer);assert.equal(h.h.value.readCommittedRevision().id,initial.id);assert.equal(h.h.value.readNativeScene()?.revisionId,initial.id);assert.equal(h.remoteRevisionRef.current,peer);
});

test('a visible populated scene with temporarily missing native authority never uses stale legacy style source',()=>{
 const h=workspace({native:false});h.context.cropDraft=undefined;assert.equal(h.submitMutation({kind:'style',nodeId:'photo',property:'object-fit',value:'contain'}),false);assert.equal(h.legacyCalls(),0);assert.match(h.errors[0],/canvas.*updating/i);assert.equal(h.h.value.readCommittedRevision().id,peer.id);
});
