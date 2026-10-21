import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

type Target = {selector:string;namespace:string;rect:{x:number;y:number}};
const target=(selector:string):Target=>({selector,namespace:'html',rect:{x:0,y:0}});
const source=readFileSync('components/canvas-v2/interactive-screen.tsx','utf8');
const file=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['cancelPendingTextEditor','closeTextEditor','writeParts','exitScreenEditing','openTextEditor'];
const initializers=new Map<string,string>();
function visit(node:ts.Node){
  if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(file))&&node.initializer)initializers.set(node.name.getText(file),node.initializer.getText(file));
  ts.forEachChild(node,visit);
}
visit(file);
function fixture(){
  const gates:Array<{signal:AbortSignal;resolve:(value:unknown)=>void;reject:(error:Error)=>void}>=[];
  const states:Array<{target:Target}|undefined>=[],errors:string[]=[];
  class Element {textContent:string;constructor(selector:string){this.textContent=selector}}
  const context={
    editing:{enter(){}},nodeId:'screen',selectionSequence:{current:0},previousSource:{current:'version'},
    selectedPartsRef:{current:[] as Target[]},partsRects:{current:[] as Target[]},partsSource:{current:'version'},
    textEditorRequest:{current:undefined as {aborter:AbortController;selector:string;version:string}|undefined},
    editingRef:{current:{nodeId:'screen',readOnly:false,exit(){context.editingRef.current.nodeId=''}}},
    parseCanvasV2Screen:()=>({html:'source'}),
    DOMParser:class{parseFromString(){return{body:{querySelectorAll:(selector:string)=>[new Element(selector)]}}}},
    setSelectedParts(){},setDirectMenu(){},screenTextCanEditDirectly:()=>true,screenAppearanceCanEditDirectly:()=>true,
    HTMLElement:Element,runtimeEvidence:{current:[]},AbortController,useCallback:<T,>(fn:T)=>fn,
    readCanvasV2EditorFonts:(_screen:unknown,_assets:unknown,signal:AbortSignal)=>new Promise((resolve,reject)=>gates.push({signal,resolve,reject})),
    setTextEditor:(state:{target:Target}|undefined)=>states.push(state),setDirectError:(error:string)=>errors.push(error),setElementSelection(){},screen:{title:'Screen'},
  };
  const body=names.map(name=>{assert.ok(initializers.has(name),`read actual ${name}`);return `var ${name}=${initializers.get(name)};`}).join('\n');
  const js=ts.transpileModule(body+'\n({openTextEditor,closeTextEditor,writeParts,exitScreenEditing})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const callbacks=vm.runInNewContext(js,context) as {openTextEditor:(target:Target)=>Promise<void>;closeTextEditor:()=>void;writeParts:(parts:Target[],source?:string)=>void;exitScreenEditing:()=>void};
  return{...callbacks,context,gates,states,errors};
}
const fonts={css:'',aliases:{},scope:'test'};

test('actual editor opener retains latest target when older retained-font read resolves last',async()=>{
  const f=fixture(),a=f.openTextEditor(target('#A')),b=f.openTextEditor(target('#B'));
  assert.equal(f.gates[0].signal.aborted,true);
  f.gates[1].resolve(fonts);await b;f.gates[0].resolve(fonts);await a;
  assert.deepEqual(f.states.map(x=>x?.target.selector),['#B']);
});
test('an old font rejection cannot show an error or clear the newer pending request',async()=>{
  const f=fixture(),a=f.openTextEditor(target('#A')),b=f.openTextEditor(target('#B'));
  const request=f.context.textEditorRequest.current;
  f.gates[0].reject(new Error('old failed'));await a;
  assert.equal(f.context.textEditorRequest.current,request);
  assert.deepEqual(f.errors.filter(Boolean),[]);
  f.gates[1].resolve(fonts);await b;assert.equal(f.states.at(-1)?.target.selector,'#B');
});
for(const action of ['source','selection','close','exit','readonly']as const){
  test(`pending retained-font load cannot reopen editor after ${action}`,async()=>{
    const f=fixture(),pending=f.openTextEditor(target('#A'));
    if(action==='source')f.context.previousSource.current='newversion';
    if(action==='selection')f.writeParts([target('#B')]);
    if(action==='close')f.closeTextEditor();
    if(action==='exit')f.exitScreenEditing();
    if(action==='readonly')f.context.editingRef.current.readOnly=true;
    if(['selection','close','exit'].includes(action))assert.equal(f.gates[0].signal.aborted,true);
    f.gates[0].resolve(fonts);await pending;
    assert.equal(f.states.some(Boolean),false);
  });
}
test('current retained-font failure still gives a useful error',async()=>{
  const f=fixture(),pending=f.openTextEditor(target('#A'));
  f.gates[0].reject(new Error('font unavailable'));await pending;
  assert.equal(f.errors.filter(Boolean).length,1);assert.match(f.errors.at(-1)!,/not ready to edit/);
});
