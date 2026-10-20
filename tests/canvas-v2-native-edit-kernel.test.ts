import assert from 'node:assert/strict';
import test from 'node:test';
import { screenDesignTranslations, screenSharedProperties } from '../lib/canvas-v2/screen-design-edit';
import { canvasV2ScreenLiveEdit, type CanvasV2ScreenFeedbackTarget } from '../lib/canvas-v2/screen-feedback';
import type { CanvasV2InteractiveScreen } from '../lib/canvas-v2/interactive-screen';
import { encodeCanvasV2Screen, readCanvasV2Screens } from '../lib/canvas-v2/interactive-screen';
import { canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { validateScreenAppearanceStyles } from '../lib/canvas-v2/screen-direct-edit';

function target(selector:string,x:number,y:number,width:number,height:number,styles:Record<string,string>={}):CanvasV2ScreenFeedbackTarget {
  return {nodeId:'designer',title:'Native designer',selector,tag:'div',label:selector,text:'',rect:{x,y,width,height},styles};
}
const specimens=()=>[target('#a',10,5,20,10),target('#b',60,40,40,20),target('#c',160,100,30,30)];

test('bounded positive scale accepts native CSS leading decimals without admitting zero, excessive or executable values',()=>{
  for(const scale of ['.8','1.2 .8','0.8 1.2','100','.0001'])assert.doesNotThrow(()=>validateScreenAppearanceStyles({scale}),scale);
  for(const scale of ['0','.0','1.2 0','-0.8','100.01','Infinity','NaN','.8;opacity:0'])assert.throws(()=>validateScreenAppearanceStyles({scale}),scale);
});

test('a design-library-only revision and its inverse preserve the live runtime without parsing or replacing unchanged product HTML',()=>{
  const before:CanvasV2InteractiveScreen={version:1,title:'Metadata only',width:600,height:760,html:'<main><button id="save">Save</button></main>',css:'button{color:purple}',javascript:"document.querySelector('#save').addEventListener('click',()=>{});",referenceAssetIds:[],design:{version:1,styles:[],components:[]}},after={...before,design:{version:1 as const,styles:[{id:'editorial',name:'Editorial',styles:{color:'purple'}}],components:[]}};
  const parser={parseFromString:()=>{throw Error('Unchanged product markup should not be parsed or replaced.')}} as unknown as DOMParser;
  assert.equal(canvasV2ScreenLiveEdit(before,after,parser)?.presentationOnly,true);
  assert.equal(canvasV2ScreenLiveEdit(after,before,parser)?.presentationOnly,true);
  assert.equal(canvasV2ScreenLiveEdit(before,before,parser),undefined);
  assert.equal(canvasV2ScreenLiveEdit(before,{...after,javascript:after.javascript+';window.changed=true'},parser),undefined);
});

function ownedScreen(html:string):CanvasV2InteractiveScreen{return {version:1,title:'Human design library',width:600,height:760,html,css:'p{line-height:1.5}',javascript:'window.humanCounter=1;',referenceAssetIds:[],referenceIntent:'original',design:{version:1,styles:[{id:'human-style',name:'Human editorial style',styles:{color:'#654c78'}}],components:[{id:'human-card',name:'Human card',html:'<article><h2>Human component</h2></article>',variants:[{name:'Compact',html:'<article><h2>Compact human component</h2></article>'}]}]}};}
function documentWith(screen:CanvasV2InteractiveScreen){return {html:'<main data-canvas-v2-node-id="canvas"><div data-canvas-v2-node-id="screen-human" data-canvas-v2-screen="'+encodeCanvasV2Screen(screen)+'" style="position:absolute;left:40px;top:50px;width:600px;height:760px"></div></main>',css:''};}

test('an AI source refinement through the canonical screen patch retains the complete existing design library and authored runtime',()=>{
  const before=ownedScreen('<main><p id="human-title">Human copy</p></main>'),document=documentWith(before),snapshot=JSON.stringify(before),result=canvasV2ScreenPatch(document,{nodeId:'screen-human',html:before.html.replace('Human copy','A refined human copy')},[],{x:0,y:0});
  assert.equal(result.operations.length,1);const operation=result.operations[0];if(operation.op!=='replace-node')throw Error('Expected one canonical source replacement.');const after=readCanvasV2Screens(operation.html)[0].screen;
  assert.deepEqual(after.design,before.design);assert.equal(after.javascript,before.javascript);assert.equal(after.css,before.css);assert.equal(JSON.stringify(before),snapshot);
  assert.match(after.html,/A refined human copy/);
});

test('shared properties distinguish identical values from mixed or missing values without changing targets',()=>{
  const targets=[target('#a',0,0,10,10,{color:'red',opacity:'1',translate:'none'}),target('#b',20,0,10,10,{color:'blue',opacity:'1',fill:'none'})],before=structuredClone(targets);
  assert.deepEqual(screenSharedProperties(targets),{color:undefined,opacity:'1',translate:undefined,fill:undefined});
  const richText=[target('#rich',0,0,10,10,{color:'red','color-mixed':'true',opacity:'1'}),target('#plain',20,0,10,10,{color:'red',opacity:'1'})],richBefore=structuredClone(richText);
  assert.equal(screenSharedProperties(richText).color,undefined,'An internally mixed rich-text layer must not expose a uniform shared colour merely because its base colour matches another layer.');
  assert.equal(screenSharedProperties([...richText].reverse()).color,undefined,'Any mixed rich-text layer must retain Mixed regardless of selection order.');
  assert.equal(screenSharedProperties(richText).opacity,'1');assert.deepEqual(richText,richBefore);
  assert.deepEqual(screenSharedProperties([]),{});assert.deepEqual(targets,before);
});

test('bulk translation plans one independent change per layer and preserves selection order and source descriptors',()=>{
  const targets=specimens(),before=structuredClone(targets);
  assert.deepEqual(screenDesignTranslations(targets,{kind:'translate',x:24,y:-12}),targets.map(t=>({selector:t.selector,x:24,y:-12})));
  assert.deepEqual(targets,before);
});

test('alignment uses outer selection bounds for both axes and unequal native dimensions',()=>{
  const targets=specimens();
  for(const [axis,edge,expected]of [
    ['x','start',[0,-50,-150]],['x','center',[80,20,-75]],['x','end',[160,90,0]],
    ['y','start',[0,-35,-95]],['y','center',[57.5,17.5,-47.5]],['y','end',[115,70,0]],
  ] as const){
    const actual=screenDesignTranslations(targets,{kind:'align',axis,edge});
    assert.deepEqual(actual.map(t=>t[axis]),expected,axis+' '+edge);
    assert.deepEqual(actual.map(t=>t[axis==='x'?'y':'x']),[0,0,0]);
  }
});

test('distribution creates equal edge gaps while retaining the two outside edges and input selection order',()=>{
  const targets=specimens(),shuffled=[targets[2],targets[0],targets[1]],before=structuredClone(shuffled);
  assert.deepEqual(screenDesignTranslations(shuffled,{kind:'distribute',axis:'x'}),[{selector:'#c',x:0,y:0},{selector:'#a',x:0,y:0},{selector:'#b',x:15,y:0}]);
  assert.deepEqual(screenDesignTranslations(shuffled,{kind:'distribute',axis:'y'}).map(t=>t.y),[0,0,7.5]);
  assert.deepEqual(shuffled,before);
  assert.throws(()=>screenDesignTranslations(targets.slice(0,2),{kind:'distribute',axis:'x'}),/three/);
});

test('SVG world translation maps through the parent linear transform including rotation, skew and unequal scale',()=>{
  const t=target('#vector',0,0,20,20),world={x:24,y:-12};
  for(const matrix of [{a:2,b:0,c:0,d:4},{a:0,b:2,c:-3,d:0},{a:1.2,b:.3,c:-.4,d:.8}]){
    const moved=screenDesignTranslations([{...t,namespace:'svg',vectorMatrix:matrix}],{kind:'translate',...world})[0];
    assert.ok(Math.abs(matrix.a*moved.x+matrix.c*moved.y-world.x)<1e-9);
    assert.ok(Math.abs(matrix.b*moved.x+matrix.d*moved.y-world.y)<1e-9);
  }
});

test('SVG alignment maps each layer through its own parent basis rather than applying a shared local offset',()=>{
  const targets=specimens().slice(0,2).map((t,i)=>({...t,namespace:'svg' as const,vectorMatrix:i?{a:0,b:2,c:-2,d:0}:{a:2,b:0,c:0,d:2}}));
  const shifts=screenDesignTranslations(targets,{kind:'align',axis:'x',edge:'start'});
  assert.deepEqual(shifts,[{selector:'#a',x:0,y:0},{selector:'#b',x:0,y:25}]);
});

test('singular, nonfinite and excessive transforms reject before callers can commit a partial batch',()=>{
  const targets=specimens(),before=structuredClone(targets);
  for(const value of [NaN,Infinity,-Infinity,16385])assert.throws(()=>screenDesignTranslations(targets,{kind:'translate',x:value,y:0}),/finite/);
  assert.throws(()=>screenDesignTranslations([...targets,{...targets[0],selector:'#singular',vectorMatrix:{a:1,b:2,c:2,d:4}}],{kind:'translate',x:20,y:10}),/cannot be moved/);
  assert.throws(()=>screenDesignTranslations([{...targets[0],vectorMatrix:{a:.00001,b:0,c:0,d:1}}],{kind:'translate',x:20,y:0}),/finite/);
  assert.deepEqual(targets,before);
});

test('selection capacity and duplicates reject atomically while exactly 24 independent layers remain editable',()=>{
  const targets=Array.from({length:25},(_,i)=>target('#part-'+i,i*10,0,5,5)),before=structuredClone(targets);
  assert.equal(screenDesignTranslations(targets.slice(0,24),{kind:'translate',x:1,y:2}).length,24);
  for(const selection of [[],targets,[targets[0],targets[0]]])assert.throws(()=>screenDesignTranslations(selection,{kind:'translate',x:1,y:2}),/different layers/);
  assert.deepEqual(targets,before);
});
