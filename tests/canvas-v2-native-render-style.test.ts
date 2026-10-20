import assert from 'node:assert/strict';
import test from 'node:test';
import {canvasV2NativeRenderStyle} from '../lib/canvas-v2/native-render-style';
import {applyCanvasV2NativeSceneMutation,type CanvasV2NativeSceneDocument,type CanvasV2NativeSceneNode} from '../lib/canvas-v2/native-scene';
import {SCREEN_ATTRIBUTE} from '../lib/canvas-v2/interactive-screen';
import {MODEL_ATTRIBUTE} from '../lib/canvas-v2/model-object';
import {MEDIA_ATTRIBUTE} from '../lib/canvas-v2/canvas-media';
function node(inlineStyle:Record<string,string>):CanvasV2NativeSceneNode{return{id:'text',sourceNodeId:'text',childIds:[],order:0,tagName:'div',namespace:'html',layoutMode:'absolute',kind:'text',selectable:true,hidden:false,locked:false,canonicalEvidence:false,userEdited:false,lastAuthor:'user',editVersion:0,geometry:{x:65000,y:64000,width:300,height:100,rotation:0,zIndex:0},attributes:{},inlineStyle,content:[]};}

test('warm returns and geometry-only clones reuse normalized CSS without reading immutable source properties again',()=>{
 let reads=0;const source=new Proxy({'font-size':'24px','font-family':'Inter','line-height':'1.3','--Brand-ink':'var(--ink)','background-color':'#123456'}, {ownKeys:target=>{reads++;return Reflect.ownKeys(target)}});Object.freeze(source);const original=node(source),first=canvasV2NativeRenderStyle(original),coldReads=reads;assert.ok(coldReads>0);
 for(let index=0;index<1000;index++)assert.equal(canvasV2NativeRenderStyle({...original,geometry:{...original.geometry,x:65000+index}}),first);
 assert.equal(reads,coldReads,'Warm returns must not normalize, enumerate or camelcase source CSS again');assert.equal(first.fontSize,'24px');assert.equal(first['--Brand-ink'],'var(--ink)');assert.equal(first.backgroundColor,'#123456');
});

test('normalization preserves authoritative font/background longhands and SVG/custom property semantics',()=>{
 const source=Object.freeze({font:'italic 20px serif','font-size':'24px','font-variant':'small-caps','font-variant-ligatures':'none',background:'red','background-color':'blue','background-position':'center','background-position-x':'20px','stroke-width':'3','stroke-linejoin':'round','fill-rule':'evenodd','clip-path':'url(#mask)','--Case-Sensitive':'12px'});const normalized=canvasV2NativeRenderStyle({...node(source),namespace:'svg',tagName:'path'});
 assert.equal(normalized.font,undefined);assert.equal(normalized.fontVariant,undefined);assert.equal(normalized.fontVariantLigatures,'none');assert.equal(normalized.fontSize,'24px');assert.equal(normalized.background,undefined);assert.equal(normalized.backgroundPosition,undefined);assert.equal(normalized.backgroundPositionX,'20px');assert.equal(normalized.strokeWidth,'3');assert.equal(normalized.strokeLinejoin,'round');assert.equal(normalized.fillRule,'evenodd');assert.equal(normalized.clipPath,'url(#mask)');assert.equal(normalized['--Case-Sensitive'],'12px');assert.equal(source.font,'italic 20px serif');
});

test('media, interactive screens and models use a separate transparent host style cache without poisoning ordinary objects',()=>{
 const source=Object.freeze({background:'red','background-color':'blue',border:'2px solid black','border-radius':'12px',padding:'4px','padding-left':'9px','box-shadow':'0 0 2px black',color:'white',transform:'rotate(3deg)',opacity:'.8','--accent':'purple'}),original=node(source),plain=canvasV2NativeRenderStyle(original);let previous:Record<string,string>|undefined;
 for(const attribute of [MEDIA_ATTRIBUTE,SCREEN_ATTRIBUTE,MODEL_ATTRIBUTE]){const live=canvasV2NativeRenderStyle({...original,attributes:{[attribute]:'retained-source'}});if(previous)assert.equal(live,previous,'All opaque live hosts share the same paint policy');previous=live;for(const property of ['background','backgroundColor','border','borderRadius','padding','paddingLeft','boxShadow'])assert.equal(live[property],undefined);assert.equal(live.color,'white');assert.equal(live.opacity,'.8');assert.equal(live.transform,'rotate(3deg)');assert.equal(live['--accent'],'purple');assert.notEqual(live,plain);}
 assert.equal(canvasV2NativeRenderStyle(original),plain);assert.equal(plain.backgroundColor,'blue');assert.equal(plain.borderRadius,'12px');assert.equal(source['padding-left'],'9px');
});

test('real native style mutations replace cache keys and Undo retains the original authored paint',()=>{
 const source=node(Object.freeze({'font-size':'28px',color:'#123456'}));const scene:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'before',width:131072,height:131072,rootIds:[source.id],nodes:[source],css:''};const before=canvasV2NativeRenderStyle(source);
 const changed=applyCanvasV2NativeSceneMutation(scene,{kind:'style',nodeId:'text',property:'color',value:'#abcdef'}),next=changed.nodes.find(item=>item.sourceNodeId==='text')!,after=canvasV2NativeRenderStyle(next);assert.notEqual(next.inlineStyle,source.inlineStyle);assert.notEqual(after,before);assert.equal(after.color,'#abcdef');assert.equal(before.color,'#123456');assert.equal(canvasV2NativeRenderStyle(source),before,'Returning to the exact Undo source recovers its original style');assert.equal(source.inlineStyle.color,'#123456');
});
