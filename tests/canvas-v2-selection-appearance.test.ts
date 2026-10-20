import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { canvasV2SelectionAppearance, type CanvasV2InspectableElement } from '../lib/canvas-v2/element-inspection';
import { canvasV2OpaquePaintColor } from '../lib/canvas-v2/paint-style';
import { applyCanvasV2NativeSceneMutation, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import type { CanvasV2ManualMutation } from '../lib/canvas-v2/manual-mutations';
const style={color:'#123456',textColors:['#123456'],backgroundColor:'#cccccc',borderColor:'#111111',borderStyle:'solid',borderWidth:'1px',borderRadius:'0px',fontFamily:'Inter',fontSize:'28px',lineHeight:'36px',fontWeight:'400',fontStyle:'normal',textAlign:'left',textDecoration:'none',opacity:'1',objectFit:'fill'};
function element(id:string,kind:CanvasV2InspectableElement['kind']='text',patch:Partial<CanvasV2InspectableElement>={}):CanvasV2InspectableElement{return{nodeId:id,kind,tagName:'div',textPreview:'Human copy',textEditable:kind==='text'||kind==='shape'||kind==='note',locked:false,hidden:false,bounds:{x:100,y:100,width:180,height:100},visualStyle:structuredClone(style),...patch};}

test('common controls apply to complete compatible selections and exclude unsafe mixed object families',()=>{
 for(const [selected,expected]of [
  [[],[false,false,false]],[[element('a'),element('b')],[true,false,false]],
  [[element('empty-a','text',{textPreview:undefined}),element('empty-b','text',{textPreview:undefined})],[true,false,false]],
  [[element('a'),element('not-editable','text',{textEditable:false})],[false,false,false]],
  [[element('a','shape'),element('b','note')],[false,false,true]],
  [[element('a','line'),element('b','drawing')],[false,true,false]],
  [[element('a','connector')],[false,true,false]],
  [[element('a','connector'),element('b','line')],[false,false,false]],
  [[element('a'),element('b','shape')],[false,false,false]],
  [[element('a','image'),element('b','shape')],[false,false,false]],
  [[element('a','frame'),element('b','shape')],[false,false,false]],
 ] as Array<[CanvasV2InspectableElement[],boolean[]]>){const value=canvasV2SelectionAppearance(selected);assert.deepEqual([value.isText,value.hasStroke,value.canFill],expected);}
});

test('mixed appearance preserves honest summaries and all text colors without mutating selected descriptors',()=>{
 const a=element('a'),b=element('b');
 b.visualStyle={...style,color:'#654321',textColors:['#654321','#ff0000'],fontFamily:'Georgia',fontSize:'48px',fontWeight:'700',fontStyle:'italic',borderWidth:'7px'};
 const before=structuredClone([a,b]),value=canvasV2SelectionAppearance([a,b]);
 for(const key of ['color','fontFamily','fontSize','fontWeight','fontStyle','borderWidth']as const)assert.equal(value.visualStyle?.[key],'mixed',key);
 assert.equal(value.visualStyle?.textAlign,'left');assert.deepEqual(value.visualStyle?.textColors,['#123456','#654321','#ff0000']);assert.deepEqual([a,b],before);
});

const file='components/canvas-v2/canvas-v2-workspace.tsx',tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function callbacks(selectedElements:CanvasV2InspectableElement[]){
 const names=['batchForSelection','styleSelection','applyLineStyle','applyLineColor'],declarations=new Map<string,string>();let bold:ts.JsxAttribute|undefined;
 const walk=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&names.includes(node.name.text))declarations.set(node.name.text,node.getText(tree));if(ts.isJsxOpeningElement(node)&&node.tagName.getText(tree)==='button'&&node.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(tree)==='aria-label'&&attr.initializer&&ts.isStringLiteral(attr.initializer)&&attr.initializer.text==='Toggle bold'))bold=node.attributes.properties.find(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(tree)==='onClick')as ts.JsxAttribute;ts.forEachChild(node,walk)};walk(tree);assert.equal(declarations.size,names.length);assert.ok(bold?.initializer&&ts.isJsxExpression(bold.initializer)&&bold.initializer.expression);
 const mutations:CanvasV2ManualMutation[]=[];let scene:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'base',width:12000,height:8000,rootIds:[],nodes:[],css:''};
 for(const item of selectedElements.filter(item=>item.nodeId!=='canvas')){scene=applyCanvasV2NativeSceneMutation(scene,{kind:'create',primitive:item.kind==='text'?'text':'shape',nodeId:item.nodeId,x:100,y:100,text:'Human copy'});const node=scene.nodes.find(node=>node.id===item.nodeId)!;Object.assign(node.inlineStyle,{'border-width':item.visualStyle?.borderWidth,'border-style':item.visualStyle?.borderStyle});node.locked=item.locked;}
 const context=vm.createContext({selectedElements,selectedVisualStyle:canvasV2SelectionAppearance(selectedElements).visualStyle,canvasV2OpaquePaintColor,lineColorDraft:'#111111',setLineColorDraft:()=>{},setToolbarMenu:()=>{},submitMutation:(value:CanvasV2ManualMutation)=>{const mutation=JSON.parse(JSON.stringify(value))as CanvasV2ManualMutation;mutations.push(mutation);scene=applyCanvasV2NativeSceneMutation(scene,mutation);}});
 const code=names.map(name=>'const '+declarations.get(name)+';').join('\n')+`\nglobalThis.actions={styleSelection,applyLineStyle,applyLineColor,bold:${bold.initializer.expression.getText(tree)}};`;
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return{mutations,scene:()=>scene,...context.actions as{styleSelection:(property:string,value:string)=>void;applyLineStyle:(style:string)=>void;applyLineColor:(color:string)=>void;bold:()=>void}};
}

test('actual mixed Bold click authors one atomic batch for all unlocked text objects',()=>{
 const a=element('a'),b=element('b'),locked=element('locked','text',{locked:true});b.visualStyle={...style,fontWeight:'700'};
 const h=callbacks([a,b,locked,element('canvas')]);h.bold();assert.equal(h.mutations.length,1);
 assert.deepEqual(h.scene().nodes.filter(node=>['a','b'].includes(node.id)).map(node=>node.inlineStyle['font-weight']),['700','700']);assert.equal(h.scene().nodes.find(node=>node.id==='locked')?.inlineStyle['font-weight'],undefined);
 const mutation=h.mutations[0];assert.equal(mutation.kind,'batch');if(mutation.kind==='batch')assert.deepEqual(mutation.mutations.map(item=>item.kind==='style'?[item.nodeId,item.property,item.value]:null),[['a','font-weight','700'],['b','font-weight','700']]);
});

test('actual shared line-style callback retains each positive width and supplies a width only for borderless unlocked objects',()=>{
 const a=element('a','shape'),b=element('b','shape'),c=element('c','shape'),locked=element('locked','shape',{locked:true});
 b.visualStyle={...style,borderWidth:'7px'};c.visualStyle={...style,borderWidth:'0px',borderStyle:'none'};
 const h=callbacks([a,b,c,locked,element('canvas')]);h.applyLineStyle('dashed');
 assert.deepEqual(h.scene().nodes.filter(node=>node.id!=='locked').map(node=>[node.id,node.inlineStyle['border-width'],node.inlineStyle['border-style']]),[['a','1px','dashed'],['b','7px','dashed'],['c','2px','dashed']]);
 assert.equal(h.scene().nodes.find(node=>node.id==='locked')?.inlineStyle['border-style'],'solid');
});

test('actual shared line-color callback keeps independent thickness and line pattern while making only absent lines visible',()=>{
 const a=element('a','shape'),b=element('b','shape'),c=element('c','note');b.visualStyle={...style,borderWidth:'7px',borderStyle:'dashed'};c.visualStyle={...style,borderWidth:'0px',borderStyle:'none'};
 const h=callbacks([a,b,c]);h.applyLineColor('#cc3366');
 assert.deepEqual(h.scene().nodes.map(node=>[node.id,node.inlineStyle['border-color'],node.inlineStyle['border-width'],node.inlineStyle['border-style']]),[['a','#cc3366','1px','solid'],['b','#cc3366','7px','dashed'],['c','#cc3366','2px','solid']]);
});
