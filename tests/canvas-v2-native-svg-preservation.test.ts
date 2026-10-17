import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CanvasV2NativeCanvasScene} from '../components/canvas-v2/native-canvas-scene';
import {canvasV2NativeElementTagName,canvasV2NativeSceneNodeHasRenderableNamespace,pruneCanvasV2EmptyGeneratedWrappers,serializeCanvasV2NativeScene,type CanvasV2NativeSceneDocument,type CanvasV2NativeSceneNode} from '../lib/canvas-v2/native-scene';
import {createCanvasV2CommittedRevision} from '../lib/canvas-v2/revisions';
const svgNS='http://www.w3.org/2000/svg';
function node(id:string,tagName:string,namespace:'html'|'svg',parentId?:string,attributes:Record<string,string>={}):CanvasV2NativeSceneNode{return {id,sourceNodeId:id,tagName,namespace,kind:'object',layoutMode:'flow',parentId,order:0,childIds:[],content:[],attributes,inlineStyle:{},geometry:{x:0,y:0,width:100,height:100,rotation:0,zIndex:0},hidden:false,locked:false,selectable:false,canonicalEvidence:false,userEdited:false,editVersion:0}}
function vectorScene(){
 const nodes=[node('wrapper','div','html',undefined,{'data-canvas-v2-origin':'northstar'}),node('vector','svg','svg','wrapper',{viewBox:'0 0 100 100'}),node('definitions','defs','svg','vector'),node('gradient',canvasV2NativeElementTagName({namespaceURI:svgNS,localName:'linearGradient',tagName:'linearGradient'}),'svg','definitions',{id:'retained-gradient'}),node('stop','stop','svg','gradient',{offset:'0','stop-color':'#ff9944'}),node('clip',canvasV2NativeElementTagName({namespaceURI:svgNS,localName:'clipPath',tagName:'clipPath'}),'svg','definitions',{id:'retained-clip'}),node('cliprect','rect','svg','clip',{width:'100',height:'100'}),node('paint','rect','svg','vector',{width:'100',height:'100',fill:'url(#retained-gradient)','clip-path':'url(#retained-clip)'})];
 for(const n of nodes)if(n.parentId){const parent=nodes.find(p=>p.id===n.parentId)!;parent.childIds.push(n.id);parent.content.push({kind:'node',id:n.id})}
 return {schema:'canvas-v2.native-scene.v1' as const,revisionId:'vectors',width:1200,height:800,rootIds:['wrapper'],css:'',nodes};
}

test('browser SVG local names retain gradients/clips/foreignObject while ordinary HTML stays normalized',()=>{
 for(const localName of ['svg','linearGradient','radialGradient','clipPath','textPath','foreignObject','feGaussianBlur'])assert.equal(canvasV2NativeElementTagName({namespaceURI:svgNS,localName,tagName:localName}),localName);
 assert.equal(canvasV2NativeElementTagName({namespaceURI:'http://www.w3.org/1999/xhtml',localName:'article',tagName:'ARTICLE'}),'article');
 assert.equal(canvasV2NativeSceneNodeHasRenderableNamespace({namespace:'html',tagName:'lineargradient'}),false);
 assert.equal(canvasV2NativeSceneNodeHasRenderableNamespace({namespace:'svg',tagName:'linearGradient'},{namespace:'svg',tagName:'defs'}),true);
});

test('generated wrapper pruning preserves legacy vector-only payload and its complete definition subtree, while empty wrappers still retire',()=>{
 const scene=vectorScene(),original=structuredClone(scene);
 assert.deepEqual(pruneCanvasV2EmptyGeneratedWrappers(scene),[]);assert.deepEqual(scene,original);
 const empty=node('empty','div','html',undefined,{'data-canvas-v2-origin':'northstar'});scene.nodes.push(empty);scene.rootIds.push('empty');
 assert.deepEqual(pruneCanvasV2EmptyGeneratedWrappers(scene),['empty']);assert.deepEqual(scene.nodes,original.nodes);
 const html=serializeCanvasV2NativeScene(scene).html;assert.match(html,/<linearGradient\b/);assert.match(html,/<clipPath\b/);assert.match(html,/fill="url\(#retained-gradient\)"/);
});

test('actual public native React scene retains vector definitions and referenced fills rather than an empty specimen wrapper',()=>{
 const scene:CanvasV2NativeSceneDocument=vectorScene();pruneCanvasV2EmptyGeneratedWrappers(scene);
 const revision=createCanvasV2CommittedRevision({id:scene.revisionId,document:{html:'<div data-canvas-v2-node-id="wrapper"></div>',css:''},evidence:[],createdAt:'2026-10-13T00:00:00Z'});
 const html=renderToStaticMarkup(createElement(CanvasV2NativeCanvasScene,{revision,theme:'light',width:1200,height:800,framePointerEvents:'auto',inspectionEnabled:false,sceneOverride:scene}));
 assert.match(html,/<svg\b/);assert.match(html,/<linearGradient\b/);assert.match(html,/<clipPath\b/);assert.match(html,/fill="url\(#retained-gradient\)"/);assert.match(html,/clip-path="url\(#retained-clip\)"/);
});
