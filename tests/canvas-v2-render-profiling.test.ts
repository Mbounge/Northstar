import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const workspaceText=readFileSync(new URL('../components/canvas-v2/canvas-v2-workspace.tsx',import.meta.url),'utf8');
const workspace=ts.createSourceFile('workspace.tsx',workspaceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=['canvasV2RenderProfilingEnabled','emitCanvasV2RenderTiming'].map(name=>{
  const node=workspace.statements.find(value=>ts.isFunctionDeclaration(value)&&value.name?.text===name);assert.ok(node);return node.getText(workspace).replace(/^export /,'');
}).join('\n');
const helperCode=ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

test('actual render diagnostic emits only bounded timing fields on the opt-in development route',()=>{
  const events:CustomEvent[]=[];
  const env={env:{NODE_ENV:'development'}},window={location:{pathname:'/canvas-v2-e2e/codex-subagent',search:'?hardening=1'},dispatchEvent:(event:CustomEvent)=>{events.push(event)}};
  const {emit}=new Function('process','window','CustomEvent',`${helperCode};return {emit:emitCanvasV2RenderTiming};`)(env,window,CustomEvent);
  emit('ChatPanel','update',123.5,900);
  assert.equal(events.length,1);assert.equal(events[0].type,'northstar:e2e:react-render-timing');
  assert.deepEqual(events[0].detail,{id:'ChatPanel',phase:'update',actualDuration:123.5,commitTime:900});
  emit('WorkspaceBody','render-body',12,null);assert.equal(events.length,2);
  for(const row of [['Private source','update',1,2],['Workspace','bad',1,2],['Workspace','update',Infinity,2],['Workspace','update',-1,2],['Workspace','update',1,NaN]])emit(...row);
  assert.equal(events.length,2);
  env.env.NODE_ENV='production';emit('Workspace','update',2,4);assert.equal(events.length,2);
  env.env.NODE_ENV='development';window.location.search='';emit('Workspace','update',2,4);assert.equal(events.length,2);
  window.location.search='?hardening=1';window.location.pathname='/canvas';emit('Workspace','update',2,4);assert.equal(events.length,2);
});

test('actual public observer ignores inactive or stale render events, strips extra fields and caps the report at1000 samples',()=>{
  const text=readFileSync(new URL('../app/canvas-v2-e2e/hardening/performance-observer.tsx',import.meta.url),'utf8');
  const source=ts.createSourceFile('observer.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback:ts.Expression|undefined;
  const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='reactRender')callback=node.initializer;ts.forEachChild(node,visit)};visit(source);assert.ok(callback);
  const code=ts.transpileModule(`const receive=${callback.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const samples:Record<string,unknown>[]=[];
  const receive=new Function('running','start','reactRenders','performance',`${code};return receive;`)(true,100,samples,{now:()=>200}) as (event:{detail:unknown})=>void;
  const row={id:'NativeScene',phase:'update',actualDuration:15,commitTime:150,privatePayload:'must not be retained'};
  receive({detail:row});assert.deepEqual(samples,[{atMs:50,id:'NativeScene',phase:'update',actualDuration:15,commitTime:150}]);
  receive({detail:{...row,commitTime:99}});receive({detail:{...row,id:'unbounded-custom-id'}});assert.equal(samples.length,1);
  const inactive=new Function('running','start','reactRenders','performance',`${code};return receive;`)(false,100,samples,{now:()=>200});inactive({detail:row});assert.equal(samples.length,1);
  for(let i=0;i<1100;i++)receive({detail:row});assert.equal(samples.length,1000);
});

test('actual chat artifact projection preserves history props only when artifact objects and order remain exact',()=>{
 const text=readFileSync(new URL('../components/canvas-v2/canvas-v2-chat-panel.tsx',import.meta.url),'utf8'),source=ts.createSourceFile('chat.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let block:ts.Block|undefined;
 const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='nextArtifacts')block=node.parent.parent.parent as ts.Block;ts.forEachChild(node,visit);};visit(source);assert.ok(block);
 const start=block.statements.findIndex(statement=>statement.getText(source).startsWith('const nextArtifacts'));
 assert.ok(start>=0);const code=ts.transpileModule(block.statements.slice(start,start+4).map(statement=>statement.getText(source)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let ref:{current:unknown}|undefined;const render=(turns:unknown[])=>new Function('chat','useMemo','useRef',`${code};return turnArtifacts;`)({turns},(fn:()=>unknown)=>fn(),(value:unknown)=>ref??(ref={current:value}));
 const a={id:'a'},b={id:'b'},first=render([{answer:'original',artifacts:[a]}]);assert.equal(render([{answer:'streamed update',artifacts:[a]}]),first);assert.equal(render([{artifacts:[a]},{answer:'new unrelated turn'}]),first);
 const added=render([{artifacts:[a,b]}]);assert.notEqual(added,first);assert.deepEqual(added,[b,a]);const replaced=render([{artifacts:[a,{...b}]}]);assert.notEqual(replaced,added,'A new artifact object with the same ID must invalidate history references.');assert.notEqual(render([{artifacts:[b,a]}]),replaced,'Artifact ordering is visible.');assert.notEqual(render([]),first,'Artifact removal cannot reuse the populated list.');const empty=render([]);assert.equal(render([{answer:'another stream chunk'}]),empty);
});

test('cold preview control begins its bounded observation before resetting only the ephemeral preview pool',()=>{
 const text=readFileSync(new URL('../app/canvas-v2-e2e/hardening/performance-observer.tsx',import.meta.url),'utf8'),source=ts.createSourceFile('observer.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler:ts.Expression|undefined;
 const visit=(node:ts.Node)=>{if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='button'&&node.children.some(child=>ts.isJsxText(child)&&child.text.trim()==='Measure cold preview warming')){const attribute=node.openingElement.attributes.properties.find(value=>ts.isJsxAttribute(value)&&value.name.getText(source)==='onClick');if(attribute&&ts.isJsxAttribute(attribute)&&attribute.initializer&&ts.isJsxExpression(attribute.initializer))handler=attribute.initializer.expression;}ts.forEachChild(node,visit);};visit(source);assert.ok(handler);
 const code=ts.transpileModule(`const click=${handler.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,calls:unknown[]=[];let active=false;
 const click=new Function('begin','resetCanvasV2ScreenPresentationForHarness',`${code};return click;`)({current:(label:string,seconds:number)=>{calls.push(['begin',label,seconds]);active=true;}},()=>{assert.equal(active,true,'Reset would escape the measured window.');calls.push(['reset']);});
 click();assert.deepEqual(calls,[['begin','Cold preview warming',20],['reset']]);
});

test('actual presentation phase observer keeps only bounded phase identities and durations from the current measurement',()=>{
 const text=readFileSync(new URL('../app/canvas-v2-e2e/hardening/performance-observer.tsx',import.meta.url),'utf8'),source=ts.createSourceFile('observer.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration:ts.FunctionDeclaration|undefined;
 const visit=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='record')declaration=node;ts.forEachChild(node,visit);};visit(source);assert.ok(declaration);
 const code=ts.transpileModule(declaration.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,samples:Record<string,unknown>[]=[];
 const record=new Function('running','start','end','presentationPhases','tasks','frames','events','performance','publicFrameScripts',`${code};return record;`)(true,100,200,samples,[],[],[],{now:()=>200},()=>[]) as (entry:unknown)=>void;
 const row={entryType:'measure',name:'northstar:presentation:snapshot',startTime:120,duration:8,detail:{nodeId:'card-a',source:'must not be retained',pixels:'must not be retained'}};
 record(row);assert.deepEqual(samples,[{atMs:20,durationMs:8,stage:'snapshot',nodeId:'card-a'}]);
 for(const change of [{startTime:99},{startTime:201},{name:'unrelated:presentation:snapshot'},{name:'northstar:presentation:source-bytes'},{duration:-1},{detail:{nodeId:'x'.repeat(4097)}}])record({...row,...change});assert.equal(samples.length,1);
 for(let index=0;index<600;index++)record(row);assert.equal(samples.length,512);assert.ok(samples.every(sample=>Object.keys(sample).sort().join(',')==='atMs,durationMs,nodeId,stage'));
});
