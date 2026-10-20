import assert from 'node:assert/strict';
import test from 'node:test';
import {readCanvasV2NativeBoardObjectGraph} from '../lib/canvas-v2/board-object-graph';
import type {CanvasV2NativeSceneDocument,CanvasV2NativeSceneNode} from '../lib/canvas-v2/native-scene';

function node(id:string,parentId?:string):CanvasV2NativeSceneNode{return{id,sourceNodeId:id,parentId,childIds:[],order:0,tagName:'div',namespace:'html',layoutMode:'absolute',kind:parentId?'object':'root',selectable:true,hidden:false,locked:false,canonicalEvidence:false,userEdited:false,editVersion:0,geometry:{x:0,y:0,width:200,height:100,rotation:0,zIndex:0},attributes:{},inlineStyle:{},content:[]};}
const scene=(nodes:CanvasV2NativeSceneNode[]):CanvasV2NativeSceneDocument=>({schema:'canvas-v2.native-scene.v1',revisionId:'current',width:12000,height:8000,css:'',rootIds:['root'],nodes});

test('native Layers graph preserves source hierarchy through anonymous compiler wrappers',()=>{
 const root=node('root'),wrapper=node('anonymous','root'),group=node('group','anonymous'),inner=node('anonymous-inner','group'),text=node('text','anonymous-inner');delete wrapper.sourceNodeId;delete inner.sourceNodeId;group.kind='group';text.kind='text';text.tagName='p';
 const graph=readCanvasV2NativeBoardObjectGraph(scene([root,wrapper,group,inner,text]));assert.deepEqual(graph.map(item=>item.nodeId),['root','group','text']);
 assert.deepEqual(graph.map(item=>({id:item.nodeId,parent:item.parentNodeId,depth:item.depth,children:item.childNodeIds})),[{id:'root',parent:undefined,depth:0,children:['group']},{id:'group',parent:'root',depth:1,children:['text']},{id:'text',parent:'group',depth:2,children:[]}]);
});

test('native Layers reflects rename, hide, lock, rotation, provenance and edit changes from the current cloned revision',()=>{
 const root=node('root'),item=node('item','root');item.attributes={'aria-label':'Original'};const before=scene([root,item]);
 assert.equal(readCanvasV2NativeBoardObjectGraph(before)[1].label,'Original');
 const updated=structuredClone(before),changed=updated.nodes[1];changed.attributes={'aria-label':'Renamed','data-canvas-v2-origin':'user'};changed.hidden=true;changed.locked=true;changed.userEdited=true;changed.lastAuthor='user';changed.editVersion=8;changed.geometry.rotation=27;
 const result=readCanvasV2NativeBoardObjectGraph(updated)[1];assert.deepEqual({label:result.label,hidden:result.hidden,locked:result.locked,userEdited:result.userEdited,lastAuthor:result.lastAuthor,editVersion:result.editVersion,rotation:result.rotation,origin:result.origin},{label:'Renamed',hidden:true,locked:true,userEdited:true,lastAuthor:'user',editVersion:8,rotation:27,origin:'user'});
 assert.equal(readCanvasV2NativeBoardObjectGraph(before)[1].label,'Original','Reading a new graph must not mutate old history.');
});

test('native Layers infers evidence, creation and author provenance while explicit valid origins remain authoritative',()=>{
 const root=node('root');const items=['explicit','evidence','canonical','northstar','created','imported'].map(id=>node(id,'root'));
 items[0].attributes['data-canvas-v2-origin']='user';items[0].canonicalEvidence=true;items[1].evidence={id:'asset'};items[2].canonicalEvidence=true;items[3].lastAuthor='northstar';items[4].attributes['data-canvas-v2-user-edited']='create,move';items[5].attributes['data-canvas-v2-origin']='untrusted-value';
 assert.deepEqual(readCanvasV2NativeBoardObjectGraph(scene([root,...items])).slice(1).map(item=>item.origin),['user','research','research','northstar','user','imported']);
});

test('attribute-backed native source identities and compiler-materialized line kinds remain selectable graph truth',()=>{
 const root=node('root'),line=node('internal-line','root');delete line.sourceNodeId;line.attributes={'data-canvas-v2-node-id':'materialized-line','aria-label':'Divider'};line.kind='line';line.tagName='svg';
 const graph=readCanvasV2NativeBoardObjectGraph(scene([root,line]));assert.equal(graph[1].nodeId,'materialized-line');assert.equal(graph[1].kind,'line');assert.equal(graph[1].label,'Divider');assert.deepEqual(graph[0].childNodeIds,['materialized-line']);
});
