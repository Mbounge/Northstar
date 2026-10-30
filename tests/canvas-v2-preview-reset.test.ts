import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PreviewChrome} from '../components/canvas-v2/preview-chrome';

const source=readFileSync(new URL('../components/canvas-v2/interactive-screen.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('host.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let reset:ts.Expression|undefined;
const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='resetPreview'&&node.initializer&&ts.isCallExpression(node.initializer))reset=node.initializer.arguments[0];ts.forEachChild(node,visit)};visit(tree);assert.ok(reset);

for(const appName of ['Medito','GRAET',undefined])test(`shared reset clears private state and opens a fresh ${appName??'authored preview'} without changing saved design`,()=>{
 const screen={simulation:appName?{appName,section:appName==='Medito'?'experience':'home'}:undefined};
 const before=JSON.stringify(screen),clears:string[]=[],calls:string[]=[],retainedState={current:{email:'prior@example.com',history:['support']}},runtimeSource={current:'older-source'},pendingLiveEdit={current:{stale:true}},simulationResetEntry:{current?:unknown}={},simulationRecovery={current:{encoded:'latest-design',attempted:true}},simulationActiveRef={current:false},runtimeGeneration={current:8},restarting={current:false};let reload=3;
 const context={screen,nodeId:'this-preview',encoded:'latest-design',restarting,retainedState,pendingLiveEdit,runtimeSource,runtimeGeneration,simulationResetEntry,simulationRecovery,simulationActiveRef,presentationLease:{current:{invalidate:()=>calls.push('invalidate')}},presentationRef:{current:{stale:true}},dismissPresentation:{current:()=>calls.push('dismiss')},clearCanvasV2ScreenRuntimeState:(id:string)=>clears.push(id),setPresentation:(value:unknown)=>assert.equal(value,undefined),setReturning:(value:boolean)=>assert.equal(value,false),closeTextEditor:()=>calls.push('close-editor'),setElementSelection:(value:unknown)=>assert.equal(value,undefined),setDirectMenu:(value:unknown)=>assert.equal(value,undefined),setDirectError:(value:string)=>assert.equal(value,''),setError:(value:string)=>assert.equal(value,''),setSimulationActive:(value:boolean)=>assert.equal(value,true),setReload:(next:(n:number)=>number)=>{reload=next(reload)}};
 const fn=vm.runInNewContext(ts.transpileModule(`(${reset!.getText(tree)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context) as()=>void;fn();
 assert.equal(retainedState.current,undefined);assert.equal(pendingLiveEdit.current,undefined);assert.deepEqual(clears,['this-preview']);assert.equal(runtimeSource.current,'latest-design');assert.equal(runtimeGeneration.current,9);assert.equal(reload,4);assert.equal(JSON.stringify(screen),before,'Reset is private runtime state, not a destructive source edit');assert.deepEqual(calls,['invalidate','dismiss','close-editor']);
 if(appName){assert.deepEqual(JSON.parse(JSON.stringify(simulationResetEntry.current)),{encoded:'latest-design',section:appName==='Medito'?'welcome':'onboarding'});assert.equal(simulationActiveRef.current,true);assert.equal(simulationRecovery.current.attempted,false);}else assert.equal(simulationResetEntry.current,undefined);
});

test('every shared preview header labels its type and exposes an accessible always-visible reset',()=>{
 for(const appName of ['Medito','GRAET',undefined]){
  const html=renderToStaticMarkup(createElement(PreviewChrome,{title:'Current design',appName,onReset:()=>{}}));
  assert.ok(html.includes(appName?'Simulated app':'Preview'));assert.ok(html.includes(`aria-label="Reset ${appName??'Current design'} ${appName?'simulated app':'preview'}"`));assert.ok(html.includes('>Reset</button>'));assert.ok(!html.includes('aria-hidden="true" class="absolute'));
  assert.ok(html.includes('title="Drag to move · double-click or right-click to edit design"'), 'the shared header retains its discoverable move/edit handle');
 }
});

test('first-party simulated forms can submit locally while authored previews keep their opaque sandbox',()=>{
 let sandbox:ts.Expression|undefined;
 const find=(node:ts.Node)=>{if(ts.isJsxAttribute(node)&&node.name.getText(tree)==='sandbox'&&node.initializer&&ts.isJsxExpression(node.initializer)&&node.initializer.expression?.getText(tree).startsWith('screen.simulation ?'))sandbox=node.initializer.expression;ts.forEachChild(node,find)};find(tree);assert.ok(sandbox);
 for(const simulated of [true,false]){
  const flags=vm.runInNewContext(sandbox!.getText(tree),{screen:{simulation:simulated?{}:undefined}}) as string;
  assert.ok(flags.includes('allow-forms'));assert.equal(flags.includes('allow-same-origin'),simulated);assert.ok(!flags.includes('allow-top-navigation'));assert.ok(!flags.includes('allow-popups'));
 }
});
