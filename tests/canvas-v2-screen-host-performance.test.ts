import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { canvasV2ScreenNeedsViewportActivity } from '../lib/canvas-v2/interactive-screen-runtime';
import { screenMockDataEqual } from '../lib/canvas-v2/screen-mock-state';

// Execute the actual host boundaries with small hook/bridge substitutes. This
// checks guards and cache lifetime without mounting a second live workspace.
const source=fs.readFileSync(new URL('../components/canvas-v2/interactive-screen.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('interactive-screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find<T extends ts.Node>(predicate:(node:ts.Node)=>node is T):T {
 let found:T|undefined;const visit=(node:ts.Node)=>{if(!found&&predicate(node))found=node;if(!found)ts.forEachChild(node,visit);};visit(tree);assert.ok(found,'Production boundary must remain identifiable.');return found;
}
const declaration=(name:string)=>find((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(tree)===name);
function run(body:string,globals:Record<string,unknown>={}) {
 const compiled=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return vm.runInNewContext(compiled,globals);
}

test('actual retained-state initializer restores once per mount and never resurrects cleared or updated live state on rerender',()=>{
 const initialization=find((node):node is ts.IfStatement=>ts.isIfStatement(node)&&node.expression.getText(tree)==='!retainedStateRestored.current');
 const refs:Array<{current:unknown}>=[];let index=0,restores=0;const stored={data:{step:4}};
 const render=()=>{index=0;return run(`(()=>{const ${declaration('retainedState').getText(tree)};const ${declaration('retainedStateRestored').getText(tree)};${initialization.getText(tree)};return retainedState})()`,{useRef:(value:unknown)=>refs[index++]??(refs[index-1]={current:value}),nodeId:'same-key',screen:{productIdentityId:'app'},canvasV2ScreenRuntimeIdentity:(value:unknown)=>value,restoreCanvasV2ScreenRuntimeState:()=>{restores++;return structuredClone(stored);}}) as {current:unknown};};
 const first=render();assert.equal(restores,1);first.current={data:{step:9}};assert.equal(render(),first);assert.deepEqual(first.current,{data:{step:9}});assert.equal(restores,1);
 first.current=undefined;render();assert.equal(first.current,undefined,'Restart/identity clear must survive later renders.');assert.equal(restores,1);
 refs.length=0;const remounted=render();assert.equal(restores,2);assert.deepEqual(remounted.current,stored);assert.notEqual(remounted,first);
});

test('the existing runtime identity reset still clears changed product, reference or initial data while preserving equivalent seeds',()=>{
 const guard=find((node):node is ts.IfStatement=>ts.isIfStatement(node)&&node.expression.getText(tree).startsWith('before.productIdentityId!==screen.productIdentityId'));
 const before={productIdentityId:'same-app',referenceNodeId:'reference',mockData:{one:1,two:2}};
 for(const [screen,expected] of [[{...before,mockData:{two:2,one:1}},false],[{...before,productIdentityId:'other'},true],[{...before,referenceNodeId:'other'},true],[{...before,mockData:{one:2,two:2}},true]] as const){
  const retainedState={current:{data:{step:8}} as unknown};let clears=0;
  run(guard.getText(tree),{before,screen,screenMockDataEqual,retainedState,nodeId:'same-key',clearCanvasV2ScreenRuntimeState:(id:string)=>{assert.equal(id,'same-key');clears++;}});
  assert.equal(clears,expected?1:0);assert.equal(retainedState.current===undefined,expected);
 }
});

test('direct-options ownership uses one exact current descriptor or one fresh fallback parse, with a new parser for each message',()=>{
 const parsed=find((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(tree)==='parsed'&&node.initializer?.getText(tree)==='parsedScreenRef.current');const statements=(parsed.parent.parent.parent as ts.Block).statements;
 const start=statements.findIndex(statement=>statement.getText(tree).includes('const parsed=parsedScreenRef.current'));
 assert.ok(start>=0);const code=statements.slice(start,start+4).map(node=>node.getText(tree)).join('\n');
 const cached={html:'current'},fresh={html:'newer'};let parses=0;const observations:Array<{screen:unknown;parser:unknown}>=[];
 const check=(screen:unknown,_target:unknown,parser:unknown)=>{observations.push({screen,parser});return true;};
 const invoke=(encoded:string)=>run(code,{options:{encoded,appearance:{},text:{},section:{}},parsedScreenRef:{current:{encoded:'exact',screen:cached}},parseCanvasV2Screen:()=>{parses++;return fresh;},DOMParser:class {},screenAppearanceCanEditDirectly:check,screenTextCanEditDirectly:check,screenSectionNeedsAgent:check,screenSectionMoves:()=>({up:false,down:false}),moveScreenSection:()=>{throw Error('No moves');},raw:{}});
 invoke('exact');assert.equal(parses,0);assert.equal(observations.length,3);assert.ok(observations.every(item=>item.screen===cached&&item.parser===observations[0].parser));
 const oldParser=observations[0].parser;observations.length=0;invoke('newer');assert.equal(parses,1);assert.ok(observations.every(item=>item.screen===fresh&&item.parser===observations[0].parser));assert.notEqual(observations[0].parser,oldParser);
});

test('native capture-quiet bridge requires exact sending frame, protocol, token and native input sequence',()=>{
 const frameWindow={},activity:unknown[][]=[];const retained:unknown[]=[];
 const receiveDeclaration=find((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(tree)==='receive'&&!!node.initializer?.getText(tree).includes('event.source === frame.current?.contentWindow'));
 const receive=run(`(${receiveDeclaration.initializer!.getText(tree)})`,{process:{env:{NODE_ENV:'production'}},frame:{current:{contentWindow:frameWindow}},SCREEN_PROTOCOL:'scoped-protocol',token:'private-token',simulation:false,handoffId:'',inView:true,Array,Number,Date,controllers:new Map(),nodeId:'screen',directInputSequence:{current:0},editingRef:{current:{nodeId:'screen'}},lastHumanInput:{current:0},noteCanvasInputActivity:(...args:unknown[])=>{activity.push(args);return true;},retainRuntimeState:(state:unknown)=>retained.push(state),dismiss:()=>{},lease:{invalidate:()=>{}},presentationCache:{interrupt:()=>{}},setDirectMenu:()=>{},setDirectError:()=>{}}) as (event:unknown)=>void;
 const data={protocol:'scoped-protocol',token:'private-token',userInput:true,userInputType:'wheel',inputSequence:2};
 for(const event of [{source:{},data},{source:frameWindow,data:{...data,token:'wrong'}},{source:frameWindow,data:{...data,protocol:'wrong'}},{source:frameWindow,data:{...data,inputSequence:undefined}}])receive(event);
 assert.equal(activity.length,0);assert.equal(retained.length,0);
 receive({source:frameWindow,data});assert.deepEqual(activity,[['wheel',2]]);assert.equal(retained.length,1);
});

test('first-party simulation input only informs capture scheduling for trusted native events',()=>{
 const activity:unknown[]=[];const lastHumanInput={current:0};const input=run(`(${declaration('simulationInput').initializer!.getText(tree)})`,{lastHumanInput,Date,noteCanvasInputActivity:(type:unknown)=>activity.push(type)}) as (event:unknown)=>void;
 input({isTrusted:false,type:'wheel'});assert.deepEqual(activity,[]);assert.equal(lastHumanInput.current,0);
 input({isTrusted:true,type:'keydown'});assert.deepEqual(activity,['keydown']);assert.ok(lastHumanInput.current>0);
});

test('Layers uses compiled graph only for the matching current revision and preserves source fallback otherwise',()=>{
 const workspace=fs.readFileSync(new URL('../components/canvas-v2/canvas-v2-workspace.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('workspace.tsx',workspace,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression:ts.Expression|undefined;
 const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='sourceGraph')expression=node.initializer;ts.forEachChild(node,visit);};visit(ast);assert.ok(expression);
 const document={html:'exact current serialized source',css:''},current={revisionId:'new'},stale={revisionId:'old'},nativeResult=[{nodeId:'native'}],sourceResult=[{nodeId:'source'}];let nativeReads=0,sourceReads=0;
 const invoke=(nativeScene:unknown)=>run(expression!.getText(ast),{engine:{nativeScene,committed:{id:'new',document}},readCanvasV2NativeBoardObjectGraph:(scene:unknown)=>{nativeReads++;assert.equal(scene,current);return nativeResult;},readCanvasV2BoardObjectGraph:(source:unknown)=>{sourceReads++;assert.equal(source,document);return sourceResult;}});
 assert.equal(invoke(current),nativeResult);assert.equal(nativeReads,1);assert.equal(sourceReads,0,'Matching native truth must never parse the full source.');assert.equal(invoke(stale),sourceResult);assert.equal(invoke(undefined),sourceResult);assert.equal(nativeReads,1);assert.equal(sourceReads,2);
});


test('all live iframe parents retain materialized layout for ordinary HTML, simulation and trusted graphics',()=>{
 const opening=find((node):node is ts.JsxOpeningElement=>ts.isJsxOpeningElement(node)&&node.attributes.properties.some(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(tree)==='data-northstar-device-frame'));
 const style=opening.attributes.properties.find((attribute):attribute is ts.JsxAttribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(tree)==='style');
 assert.ok(style?.initializer&&ts.isJsxExpression(style.initializer)&&style.initializer.expression);
 const expression=style.initializer.expression.getText(tree);
 for(const screen of [{},{simulation:{appName:'fixture'}},{trustedRuntimeLibraries:['three' as const]},{trustedRuntimeLibraries:['three-webgpu' as const]},{wasmModules:[{id:'kernel',base64:'AGFzbQEAAAA='}]}]){
  const result=run(`(${expression})`,{screen,device:'none',deviceMetrics:{radius:12,bezel:8},scale:1});
  assert.equal(result.contentVisibility,'visible','A live iframe parent must not become layout-skipped on a warm return.');
 }
});

test('ordinary HTML remains outside the explicit trusted graphics activity scheduler',()=>{
 for(const screen of [{trustedRuntimeLibraries:['three' as const]},{trustedRuntimeLibraries:['three-webgpu' as const]},{wasmModules:[{id:'kernel',base64:'AGFzbQEAAAA='}]}])assert.equal(canvasV2ScreenNeedsViewportActivity(screen),true);
 for(const screen of [{},{trustedRuntimeLibraries:[],wasmModules:[]}])assert.equal(canvasV2ScreenNeedsViewportActivity(screen),false);
});

test('real host activity observer still sends scoped offscreen/return activity for layout-retained graphics only',()=>{
 const setup=find((node):node is ts.IfStatement=>ts.isIfStatement(node)&&node.expression.getText(tree)==='viewportObserver && activityHost'&&node.getText(tree).includes('viewportObserver.observe'));
 for(const runtimeScreen of [{trustedRuntimeLibraries:['three' as const]},{trustedRuntimeLibraries:['three-webgpu' as const]},{wasmModules:[{id:'kernel',base64:'AGFzbQEAAAA='}]},{}]){
  const messages:unknown[]=[],dataset:Record<string,string>={},root={},activityHost={dataset,closest:()=>root};let observed=0,callback:((entries:{isIntersecting:boolean}[])=>void)|undefined;
  class Observer{constructor(next:typeof callback,options:{root:unknown;rootMargin:string}){callback=next;assert.equal(options.root,root);assert.equal(options.rootMargin,'256px');}observe(host:unknown){assert.equal(host,activityHost);observed++;}}
  run(`let ready=true,viewportActive=true;const ${declaration('sendViewportActivity').getText(tree)};const ${declaration('viewportObserver').getText(tree)};${setup.getText(tree)}`,{activityHost,runtimeScreen,canvasV2ScreenNeedsViewportActivity,IntersectionObserver:Observer,frame:{current:{contentWindow:{postMessage:(value:unknown)=>messages.push(value)}}},SCREEN_PROTOCOL:'scoped',token:'private'});
  if(!canvasV2ScreenNeedsViewportActivity(runtimeScreen)){assert.equal(observed,0);assert.equal(callback,undefined);continue;}
  assert.equal(observed,1);callback!([{isIntersecting:false}]);callback!([{isIntersecting:false}]);assert.equal(dataset.canvasV2RuntimeViewportActive,'false');
  callback!([{isIntersecting:true}]);assert.equal(dataset.canvasV2RuntimeViewportActive,'true');
  assert.deepEqual(JSON.parse(JSON.stringify(messages)),[{protocol:'scoped',token:'private',viewportActive:false},{protocol:'scoped',token:'private',viewportActive:true}]);
 }
});

// Exercise the actual reference-capture closure, including the source/resource
// boundary after its asynchronous render. The app remains live throughout.
function referenceCaptureBoundary(globals:Record<string,unknown>) {
 const text=fs.readFileSync(new URL('../components/canvas-v2/use-northstar-managed-chat.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('chat.ts',text,ts.ScriptTarget.Latest,true);
 let expression:ts.Expression|undefined;const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='referenceCaptureWork')expression=node.initializer;ts.forEachChild(node,visit);};visit(ast);assert.ok(expression);
 return run(`(${expression.getText(ast)})`,globals) as ()=>Promise<unknown>;
}

test('parallel reference capture rejects changed live content, scroll attachment and saved source without replay',async()=>{
 const {encodeCanvasV2Screen,readCanvasV2Screens}=await import('../lib/canvas-v2/interactive-screen');
 const {requireScreenJourneySourceCurrent}=await import('../lib/canvas-v2/screen-journey-source');
 const original={version:1 as const,title:'Original',width:383,height:820,html:'<div></div>',css:'',javascript:'',referenceAssetIds:[],simulation:{appName:'GRAET' as const,section:'home' as const}};
 const encoded=encodeCanvasV2Screen(original),asset={id:'photo',url:'data:image/png;base64,original',label:'Original'};
 const html=(source=encoded)=>`<div data-canvas-v2-node-id="reference" data-canvas-v2-screen="${source}"></div><p>Unrelated human work</p>`;
 for(const change of ['none','html','css','controls','source','resource','deleted','abort'] as const){
  const signal=new AbortController(),state={html:'<p>Current view</p>',css:'p{color:blue}',controls:[{selector:'#goal',bounds:{y:50}}]};let reads=0,captures=0;
  const sourceChanged=change==='source'?encodeCanvasV2Screen({...original,simulation:{appName:'GRAET',section:'explore'}}):encoded;
  const latest={document:{html:change==='deleted'?'':html(sourceChanged)},evidence:change==='resource'?[{...asset,url:'data:image/png;base64,replaced'}]:[asset]};
  const capture=referenceCaptureBoundary({screen:{screen:{referenceNodeId:'reference'}},screenRevision:{document:{html:html()}},readCanvasV2Screens,signal:signal.signal,captureAssets:[asset],assets:{current:new Map()},engine:{readCommittedRevision:()=>latest},requireScreenJourneySourceCurrent,
   readCanvasV2SimulationSource:async()=>{reads++;return reads===1?state:{...state,...(change==='html'?{html:'<p>Another view</p>'}:change==='css'?{css:'p{color:red}'}:change==='controls'?{controls:[{selector:'#goal',bounds:{y:90}}]}:{})};},
   captureCanvasV2Screen:async()=>{captures++;if(change==='abort'){signal.abort(new Error('Stopped'));throw signal.signal.reason;}return {image:'actual reference pixels'};},
  });
  if(change==='abort')await assert.rejects(capture(),/Stopped/);
  else {const result=await capture();assert.equal(Boolean(result),change==='none'||change==='resource',change);assert.equal(reads,2);}
  assert.equal(captures,1,'Never replay the reference or a live user action.');
 }
});

test('simulation startup retries only an empty approved document and never reloads live content or auth redirects',()=>{
 for(const kind of ['blank','empty-approved','live','loading','auth','cross-origin','changed-src','inaccessible','ready','aborted'] as const){
  let reloads=0,timers=0;const doc={URL:kind==='blank'?'about:blank':kind==='cross-origin'?'https://other.example/preview':kind==='auth'?'https://northstar.example/login':'https://northstar.example/preview',readyState:kind==='loading'?'loading':'complete',body:{childElementCount:kind==='live'?1:0,textContent:''}};
  const element={get contentDocument(){if(kind==='inaccessible')throw Error('Cross origin');return doc;},getAttribute:()=>kind==='changed-src'?'/changed':'/preview',set src(value:string){assert.equal(value,'/preview');reloads++;}};
  const recover=run(`(${declaration('recoverEmptySimulation').initializer!.getText(tree)})`,{ready:kind==='ready',aborter:{signal:{aborted:kind==='aborted'}},frame:{current:element},expectedSimulationSource:'/preview',URL,window:{location:{origin:'https://northstar.example'},setTimeout:(_callback:unknown,ms:number)=>{assert.equal(ms,6000);timers++;return timers;}},simulationStartupTimer:undefined,failSimulationStartup:()=>{}}) as ()=>void;
  recover();assert.equal(reloads,kind==='blank'||kind==='empty-approved'?1:0,kind);assert.equal(timers,kind==='ready'||kind==='aborted'?0:1,kind);
 }
});

test('a registered capture waits for its late controller and never rasterizes first-party inspection as authored HTML',async()=>{
 const fn=find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='captureCanvasV2Screen');
 for(const late of [false,true]){
  let inspections=0,captures=0;const registry=new Map(),controller={encoded:'exact',capture:async()=>{captures++;return{image:'real registered pixels',state:{text:'Career'}};}};
  if(!late)registry.set('preview',controller);
  const capture=run(`(${fn.getText(tree).replace('export ','')})`,{controllers:registry,parseCanvasV2Screen:()=>({simulation:{appName:'GRAET'}}),inspectCanvasV2Screen:async()=>{inspections++;registry.set('preview',controller);return{text:'Career'};},rasterizeScreenSnapshot:()=>{throw Error('Registered data must never reach authored rasterization.');}}) as (nodeId:string,encoded:string,signal:AbortSignal)=>Promise<{image:string}>;
  assert.equal((await capture('preview','exact',new AbortController().signal)).image,'real registered pixels');assert.equal(inspections,late?1:0);assert.equal(captures,1);
 }
 const capture=run(`(${fn.getText(tree).replace('export ','')})`,{controllers:new Map([['preview',{encoded:'new version'}]]),parseCanvasV2Screen:()=>({simulation:{appName:'GRAET'}}),inspectCanvasV2Screen:async()=>({text:'Old inspection'}),rasterizeScreenSnapshot:()=>{throw Error('Unsafe fallback.');}}) as (nodeId:string,encoded:string,signal:AbortSignal)=>Promise<unknown>;
 await assert.rejects(capture('preview','exact',new AbortController().signal),/preview changed before capture/);
});
