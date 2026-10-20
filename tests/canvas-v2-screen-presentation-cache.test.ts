import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createScreenPresentationCache, createScreenPresentationHandoff, screenPresentationCommandChangesState, screenPresentationSelector, type ScreenPresentation } from '../lib/canvas-v2/screen-presentation-cache';
import { screenCaptureImageDataUrls, bindScreenCaptureImages } from '../lib/canvas-v2/screen-capture-resources';
import { buildCanvasV2ScreenRuntime } from '../lib/canvas-v2/interactive-screen-runtime';

const png='data:image/png;base64,AAAA';
const image=(version:object={},width=2,height=2,url=png):ScreenPresentation=>({version,width,height,url});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};

test('continuity captures serialize and only visible entries prepare',async()=>{
 const cache=createScreenPresentationCache({quiet:async()=>{}}),a=deferred<ScreenPresentation>(),b=deferred<ScreenPresentation>(),calls:string[]=[],published:unknown[]=[];
 const first=cache.register('a',async()=>{calls.push('a');return a.promise;},value=>published.push(value));const second=cache.register('b',async()=>{calls.push('b');return b.promise;},value=>published.push(value));
 await flush();assert.deepEqual(calls,[]);first.visible(true);second.visible(true);await flush();assert.deepEqual(calls,['a']);a.resolve(image());await flush();assert.deepEqual(calls,['a','b']);b.resolve(image());await flush();assert.equal(published.filter(Boolean).length,2);first.dispose();second.dispose();
});

test('input interruption retries unchanged visible work only after another quiet boundary',async()=>{
 const boundaries:Array<{current:()=>boolean;gate:ReturnType<typeof deferred<void>>}>=[];let captures=0;
 const cache=createScreenPresentationCache({quiet:current=>{const gate=deferred<void>();boundaries.push({current,gate});return gate.promise;}});
 const lease=cache.register('a',async()=>{captures++;return image();},()=>{});lease.visible(true);assert.equal(boundaries.length,1);cache.interrupt();assert.equal(boundaries[0].current(),false);boundaries[0].gate.resolve();await flush();assert.equal(captures,0);assert.equal(boundaries.length,2);boundaries[1].gate.resolve();await flush();assert.equal(captures,1);lease.dispose();
});

test('invalidation rejects an in-flight old version and prepares a fresh replacement',async()=>{
 const old=deferred<ScreenPresentation>(),before={},after={},published:ScreenPresentation[]=[];let captures=0;const signals:AbortSignal[]=[];
 const cache=createScreenPresentationCache({quiet:async()=>{}}),lease=cache.register('same-source',async signal=>{signals.push(signal);return ++captures===1?old.promise:image(after);},value=>{if(value)published.push(value);});
 lease.visible(true);await flush();lease.invalidate();assert.equal(signals[0].aborted,true);old.resolve(image(before));await flush();assert.equal(captures,2);assert.equal(published.length,1);assert.equal(published[0].version,after);lease.dispose();
});

test('offscreen exit and rapid revisit cannot publish the interrupted capture',async()=>{
 const old=deferred<ScreenPresentation>(),fresh={},published:ScreenPresentation[]=[];let captures=0;
 const cache=createScreenPresentationCache({quiet:async()=>{}}),lease=cache.register('a',async()=>++captures===1?old.promise:image(fresh),value=>{if(value)published.push(value);});lease.visible(true);await flush();lease.visible(false);lease.visible(true);old.resolve(image());await flush();assert.equal(published.length,1);assert.equal(published[0].version,fresh);lease.dispose();
});

test('replacement registrations and old disposals cannot resurrect or delete a new owner',async()=>{
 const old=deferred<ScreenPresentation>(),oldValues:unknown[]=[],newValues:unknown[]=[],fresh={};
 const cache=createScreenPresentationCache({quiet:async()=>{}}),first=cache.register('same',async()=>old.promise,value=>oldValues.push(value));first.visible(true);await flush();const second=cache.register('same',async()=>image(fresh),value=>newValues.push(value));second.visible(true);first.dispose();old.resolve(image());await flush();assert.deepEqual(oldValues,[]);assert.equal((newValues[0]as ScreenPresentation).version,fresh);second.invalidate();await flush();assert.equal(newValues.filter(Boolean).length,2);second.dispose();
});

test('entry budget evicts least recently revisited pixels and releases published references',async()=>{
 let time=0;const values=new Map<string,Array<ScreenPresentation|undefined>>(),cache=createScreenPresentationCache({quiet:async()=>{},now:()=>++time,maxEntries:2});
 const make=(id:string)=>{values.set(id,[]);return cache.register(id,async()=>image({id}),value=>values.get(id)!.push(value));};const a=make('a'),b=make('b'),c=make('c');a.visible(true);await flush();b.visible(true);await flush();a.visible(true);c.visible(true);await flush();assert.equal(values.get('a')!.filter(Boolean).length,1);assert.equal(values.get('a')!.at(-1)?.version instanceof Object,true);assert.equal(values.get('b')!.at(-1),undefined);assert.ok(values.get('c')!.at(-1));a.dispose();b.dispose();c.dispose();
});

test('pixel and UTF16 URL budgets are independently enforced',async()=>{
 for(const limits of [{maxPixels:4,maxBytes:100000},{maxPixels:100,maxBytes:png.length*2}]){
  const values:Array<Array<ScreenPresentation|undefined>>=[[],[]],cache=createScreenPresentationCache({quiet:async()=>{},...limits}),leases=values.map((value,index)=>cache.register(String(index),async()=>image(),next=>value.push(next)));leases[0].visible(true);await flush();leases[1].visible(true);await flush();assert.equal(values[0].at(-1),undefined);assert.ok(values[1].at(-1));leases.forEach(lease=>lease.dispose());
 }
});

test('malformed, oversized and non-PNG captures never publish and failures do not block unrelated cards',async()=>{
 const invalid=[image({},0,2),image({},641,2),image({},1.5,2),image({},2,2,'data:image/jpeg;base64,AAAA'),image({},2,2,png+'!')];
 for(const bad of invalid){let published=0;const cache=createScreenPresentationCache({quiet:async()=>{}}),first=cache.register('bad',async()=>bad,value=>{if(value)published++;}),second=cache.register('good',async()=>image(),value=>{if(value)published++;});first.visible(true);second.visible(true);await flush();assert.equal(published,1);first.dispose();second.dispose();}
 let good=0;const cache=createScreenPresentationCache({quiet:async()=>{}}),broken=cache.register('broken',async()=>{throw Error('Optional capture failure');},()=>{}),working=cache.register('working',async()=>image(),value=>{if(value)good++;});broken.visible(true);working.visible(true);await flush();assert.equal(good,1);broken.dispose();working.dispose();
});

function find<T extends ts.Node>(tree:ts.SourceFile,predicate:(node:ts.Node)=>node is T):T {let found:T|undefined;const visit=(node:ts.Node)=>{if(!found&&predicate(node))found=node;if(!found)ts.forEachChild(node,visit);};visit(tree);assert.ok(found,'Actual production boundary must remain identifiable.');return found;}
function run(code:string,globals:Record<string,unknown>) {return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,globals);}
const source=fs.readFileSync(new URL('../components/canvas-v2/interactive-screen.tsx',import.meta.url),'utf8'),hostTree=ts.createSourceFile('host.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);

function handoffHarness(withProgress=true) {
 const progress:Array<{id:string;stage:string}>=[],frames=new Map<number,()=>void>(),tasks=new Map<number,()=>void>(),sent:string[]=[];let serial=0;
 const document=new Proxy({}, {get(){throw Error('A rendering handoff must not inspect or mutate the authored DOM.');}}),Observer=class {constructor(){throw Error('A child intersection observer must not block the rendering handoff.');}};
 const helperSource=fs.readFileSync(new URL('../lib/canvas-v2/screen-presentation-cache.ts',import.meta.url),'utf8'),helperTree=ts.createSourceFile('helper.ts',helperSource,ts.ScriptTarget.Latest,true),helper=find(helperTree,(node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='createScreenPresentationHandoff');
 const controls=run(`(${helper.getText(helperTree).replace(/^export /,'')})(onReady,onProgress)`,{onReady:(id:string)=>sent.push(id),onProgress:withProgress?(id:string,stage:string)=>progress.push({id,stage}):undefined,document,IntersectionObserver:Observer,requestAnimationFrame:(next:()=>void)=>{frames.set(++serial,next);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id),window:{setTimeout:(next:()=>void,delay:number)=>{assert.equal(delay,0,'Handoff cannot become a blind delay.');tasks.set(++serial,next);return serial;}},clearTimeout:(id:number)=>tasks.delete(id)})as ReturnType<typeof createScreenPresentationHandoff>;
 const frame=()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(job=>job());},task=()=>{const jobs=[...tasks.values()];tasks.clear();jobs.forEach(job=>job());};return {controls,frames,tasks,sent,progress,frame,task};
}

test('child handoff waits for two distinct rendering turns and a post-frame task',()=>{
 const h=handoffHarness();h.controls.request('first');assert.equal(h.frames.size,1);assert.deepEqual(h.sent,[]);h.frame();assert.deepEqual(h.sent,[]);assert.equal(h.frames.size,1);assert.equal(h.tasks.size,0);h.frame();assert.equal(h.tasks.size,1);assert.deepEqual(h.sent,[],'Two child RAFs alone must not release the cover.');h.task();assert.deepEqual(h.sent,['first']);h.frame();h.task();assert.deepEqual(h.sent,['first'],'Completed requests cannot acknowledge twice.');h.controls.dispose();
});

test('handoff works without authored DOM access or nested intersection observation',()=>{
 const h=handoffHarness();h.controls.request('zero-height-fixed-app');h.frame();h.frame();h.task();assert.deepEqual(h.sent,['zero-height-fixed-app']);h.controls.dispose();
});

test('handoff cancellation rejects already queued callbacks at each rendering stage',()=>{
 for(const stage of ['first-frame','second-frame','post-frame-task']){
  const h=handoffHarness();h.controls.request('old');if(stage!=='first-frame')h.frame();if(stage==='post-frame-task')h.frame();const queuedFrames=[...h.frames.values()],queuedTasks=[...h.tasks.values()];h.controls.dispose();assert.equal(h.frames.size,0);assert.equal(h.tasks.size,0);const before=structuredClone(h.progress);queuedFrames.forEach(job=>job());queuedTasks.forEach(job=>job());h.frame();h.frame();h.task();assert.deepEqual(h.sent,[],stage);assert.deepEqual(h.progress,before,stage+' emitted progress after disposal.');
 }
});

test('a reused request ID rejects stale RAF and task callbacks without disrupting the new lifecycle',()=>{
 for(const stage of ['first-frame','second-frame','post-frame-task']){
  const h=handoffHarness();h.controls.request('same');if(stage!=='first-frame')h.frame();if(stage==='post-frame-task')h.frame();const staleFrames=[...h.frames.values()],staleTasks=[...h.tasks.values()];h.controls.request('same');staleFrames.forEach(job=>job());staleTasks.forEach(job=>job());assert.equal(h.frames.size,1,stage+': stale callback changed the replacement rendering queue.');assert.equal(h.tasks.size,0);assert.deepEqual(h.sent,[]);h.frame();h.frame();h.task();assert.deepEqual(h.sent,['same'],stage);h.controls.dispose();
 }
});

test('invalid cancellation IDs and rapid superseding requests cannot expose an obsolete frame',()=>{
 const h=handoffHarness();for(const id of ['', 'x'.repeat(81)]){h.controls.request(id);assert.equal(h.frames.size,0);}assert.deepEqual(h.progress,[]);h.controls.request('old');h.frame();h.controls.request('fresh');h.frame();h.frame();assert.deepEqual(h.sent,[]);h.task();assert.deepEqual(h.sent,['fresh']);h.controls.request('cancelled');h.frame();h.frame();h.controls.request('');h.task();assert.deepEqual(h.sent,['fresh']);
});

test('optional diagnostics expose rendering stages only and do not add scheduling work',()=>{
 const h=handoffHarness();h.controls.request('current');assert.deepEqual(h.progress,[{id:'current',stage:'accepted'}]);h.frame();assert.equal(h.progress.at(-1)?.stage,'first-frame');h.frame();assert.equal(h.progress.at(-1)?.stage,'second-frame');assert.deepEqual(h.sent,[]);h.task();assert.equal(h.progress.at(-1)?.stage,'ready');assert.deepEqual(h.sent,['current']);assert.equal(h.progress.length,4);h.controls.dispose();
 const silent=handoffHarness(false);silent.controls.request('silent');silent.frame();silent.frame();silent.task();assert.deepEqual(silent.progress,[]);assert.deepEqual(silent.sent,['silent'],'Optional diagnostics cannot be required for readiness.');
});

test('queued callbacks cannot report progress against a replacement request with the same ID',()=>{
 for(const stage of ['first-frame','second-frame','post-frame-task']){
  const h=handoffHarness();h.controls.request('same');if(stage!=='first-frame')h.frame();if(stage==='post-frame-task')h.frame();const oldFrames=[...h.frames.values()],oldTasks=[...h.tasks.values()];h.controls.request('same');const before=structuredClone(h.progress);oldFrames.forEach(job=>job());oldTasks.forEach(job=>job());assert.deepEqual(h.progress,before,stage);h.controls.dispose();h.frame();h.task();assert.deepEqual(h.progress,before,'Disposed requests cannot publish diagnostics.');
 }
});

test('production runtime omits progress messaging while DEV callback exposes only bounded stage identity',()=>{
 const previous=process.env.NODE_ENV,screen={version:1 as const,title:'Privacy',width:390,height:844,html:'<main>Private source</main>',css:'',javascript:'',referenceAssetIds:[]};
 try{for(const environment of ['development','production']){Reflect.set(process.env,'NODE_ENV',environment);const html=buildCanvasV2ScreenRuntime(screen,new Map(),'private-token'),boot=[...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1],tree=ts.createSourceFile('runtime.js',boot,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),declaration=find(tree,(node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(tree)==='presentationHandoff');assert.ok(declaration.initializer&&ts.isCallExpression(declaration.initializer));const expression=declaration.initializer.arguments[1].getText(tree),sent:unknown[]=[];const callback=run(expression,{parent:{postMessage:(message:unknown,origin:string)=>{assert.equal(origin,'*');sent.push(message);}},protocol:'scoped',token:'private-token'})as((id:string,stage:string)=>void)|undefined;if(environment==='production'){assert.equal(callback,undefined);assert.equal(html.includes('presentationFrameProgress'),false,'Production generated HTML contains a progress telemetry channel.');}else{assert.ok(callback);callback!('request','second-frame');assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{protocol:'scoped',token:'private-token',presentationFrameProgress:{id:'request',stage:'second-frame'}}]);assert.equal(JSON.stringify(sent).includes('Private source'),false);}}}finally{if(previous===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Reflect.set(process.env,'NODE_ENV',previous);}
});

test('host progress accepts only authenticated current DEV stages and never echoes payload data',()=>{
 const receive=find(hostTree,(node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(hostTree)==='receive'&&!!node.initializer?.getText(hostTree).includes('presentationFrameProgress'));assert.ok(receive.initializer&&ts.isArrowFunction(receive.initializer)&&ts.isBlock(receive.initializer.body));const statement=receive.initializer.body.statements.find(node=>ts.isIfStatement(node)&&node.expression.getText(hostTree).includes('presentationFrameProgress'))!.getText(hostTree),frameWindow={},dataset:Record<string,string>={},context=vm.createContext({process:{env:{NODE_ENV:'development'}},frame:{current:{contentWindow:frameWindow}},host:{current:{dataset}},SCREEN_PROTOCOL:'scoped',token:'token',handoffId:'current'});const handler=vm.runInContext(`event=>{${statement}}`,context)as(event:unknown)=>void;const event=(stage:unknown='accepted')=>({source:frameWindow,data:{protocol:'scoped',token:'token',presentationFrameProgress:{id:'current',stage,ratio:.25,source:'Private authored HTML',pixels:'data:image/png;base64,SECRET'}}});
 for(const value of [{...event(),source:{}},{...event(),data:{...event().data,token:'wrong'}},{...event(),data:{...event().data,protocol:'wrong'}},{...event(),data:{...event().data,presentationFrameProgress:{id:'old',stage:'ready'}}},event('intersection'),event('not-allowed'),event({secret:'HTML'})])handler(value);assert.deepEqual(dataset,{});
 for(const stage of ['accepted','first-frame','second-frame','ready']){handler(event(stage));assert.equal(dataset.canvasV2PresentationProgress,stage);}assert.deepEqual(Object.keys(dataset),['canvasV2PresentationProgress']);assert.equal(JSON.stringify(dataset).includes('SECRET'),false);assert.equal(JSON.stringify(dataset).includes('.25'),false);
 context.handoffId='';handler(event('accepted'));assert.equal(dataset.canvasV2PresentationProgress,'ready');context.handoffId='current';context.process.env.NODE_ENV='production';handler(event('accepted'));assert.equal(dataset.canvasV2PresentationProgress,'ready','Production host must ignore even correctly authenticated progress.');
});

test('actual runtime authenticates presentation requests and routes pagehide to handoff disposal',async()=>{
 const screen={version:1 as const,title:'Actual',width:390,height:844,html:'<main>Retained</main>',css:'',javascript:'',referenceAssetIds:[]},html=buildCanvasV2ScreenRuntime(screen,new Map(),'token');const boot=[...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1],tree=ts.createSourceFile('boot.js',boot,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const callback=find(tree,(node):node is ts.ArrowFunction=>ts.isArrowFunction(node)&&ts.isCallExpression(node.parent)&&node.parent.expression.getText(tree)==='addEventListener'&&node.parent.arguments[0].getText(tree)==="'message'");assert.ok(ts.isBlock(callback.body));const branch=callback.body.statements.findIndex(node=>ts.isIfStatement(node)&&node.expression.getText(tree).includes('presentationFrameId'));assert.ok(branch>=0);
 const received:string[]=[],parent={},authored=Object.freeze({draft:'Exact unsent text',clock:9,width:960,height:520}),controls=run(`async e=>{${callback.body.statements.slice(0,branch+1).map(node=>node.getText(tree)).join('\n')}}`,{parent,protocol:'scoped',token:'token',presentationHandoff:{request:(id:string)=>received.push(id)},authored})as(event:unknown)=>Promise<void>;
 const event=(id:string)=>({source:parent,data:{protocol:'scoped',token:'token',presentationFrameId:id}});await controls({...event('a'),source:{}});await controls({source:parent,data:{...event('a').data,token:'wrong'}});assert.deepEqual(received,[]);await controls(event('a'));await controls(event(''));assert.deepEqual(received,['a','']);assert.deepEqual(authored,{draft:'Exact unsent text',clock:9,width:960,height:520});
 const cleanup=find(tree,(node):node is ts.ExpressionStatement=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)==='addEventListener'&&node.expression.arguments[0].getText(tree)==="'pagehide'");let disposed=0;run(cleanup.getText(tree),{addEventListener:(name:string,listener:()=>void,options:{once:boolean})=>{assert.equal(name,'pagehide');assert.equal(options.once,true);listener();},presentationHandoff:{dispose:()=>disposed++}});assert.equal(disposed,1);
});

test('actual host handoff dismisses only a current authenticated acknowledgement after two host frames',()=>{
 const receive=find(hostTree,(node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(hostTree)==='receive'&&!!node.initializer?.getText(hostTree).includes('presentationFrameReady'));
 assert.ok(receive.initializer&&ts.isArrowFunction(receive.initializer)&&ts.isBlock(receive.initializer.body));const statement=receive.initializer.body.statements.find(node=>ts.isIfStatement(node)&&node.expression.getText(hostTree).includes('presentationFrameReady'))!.getText(hostTree);
 const frames:Array<()=>void>=[],frameWindow={},aborter=new AbortController();let dismissed=0;
 const context=vm.createContext({frame:{current:{contentWindow:frameWindow}},SCREEN_PROTOCOL:'scoped',token:'token',handoffId:'current',inView:true,aborter,dismiss:()=>dismissed++,window:{requestAnimationFrame:(job:()=>void)=>frames.push(job)}});
 const handler=vm.runInContext(`event=>{${statement}}`,context)as(event:unknown)=>void;const data={protocol:'scoped',token:'token',presentationFrameReady:'current'};const complete=()=>{frames.shift()!();assert.equal(dismissed,0,'The first host RAF must not remove the image.');frames.shift()!();};
 for(const event of [{source:{},data},{source:frameWindow,data:{...data,token:'wrong'}},{source:frameWindow,data:{...data,presentationFrameReady:'old'}}])handler(event);assert.equal(frames.length,0);
 handler({source:frameWindow,data});context.handoffId='newer';complete();assert.equal(dismissed,0);context.handoffId='current';handler({source:frameWindow,data});context.inView=false;complete();assert.equal(dismissed,0);context.inView=true;handler({source:frameWindow,data});complete();assert.equal(dismissed,1);
 handler({source:frameWindow,data});aborter.abort();frames.shift()!();frames.shift()!();assert.equal(dismissed,1);
});

test('host dismissal cancels only pending child handoffs and releases timeout ownership for every exit',()=>{
 const declaration=find(hostTree,(node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(hostTree)==='dismiss'&&!!node.initializer?.getText(hostTree).includes('presentationFrameId'));
 for(const reason of ['timeout','focus','input','invalidated','mutation','offscreen','unmount','frame-ready']){
  const sent:unknown[]=[],cleared:number[]=[],returning:boolean[]=[],dataset:Record<string,string>={};
  const controls=run(`(()=>{let handoffId='pending',handoffTimer=73;const ${declaration.getText(hostTree)};return {dismiss,state:()=>({handoffId,handoffTimer})}})()`,{process:{env:{NODE_ENV:'development'}},host:{current:{dataset}},frame:{current:{contentWindow:{postMessage:(message:unknown,origin:string)=>{assert.equal(origin,'*');sent.push(message);}}}},SCREEN_PROTOCOL:'scoped',token:'token',window:{clearTimeout:(id:number)=>cleared.push(id)},setReturning:(value:boolean)=>returning.push(value)})as{dismiss:(reason:string)=>void;state:()=>{handoffId:string;handoffTimer?:number}};
  controls.dismiss(reason);assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{protocol:'scoped',token:'token',presentationFrameId:''}],reason);assert.deepEqual(cleared,[73]);assert.equal(controls.state().handoffId,'');assert.equal(controls.state().handoffTimer,undefined);assert.equal(dataset.canvasV2PresentationDismiss,reason);assert.deepEqual(returning,[false]);controls.dismiss(reason);assert.equal(sent.length,1,'An already settled handoff should not send extra cancellation traffic.');assert.deepEqual(cleared,[73]);
 }
});

test('actual clone entry rejects ephemeral presentation covers before any authored-node filter or capture work',async()=>{
 const text=fs.readFileSync(new URL('../lib/canvas-v2/cooperative-clone-node.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('clone.ts',text,ts.ScriptTarget.Latest,true),clone=find(tree,(node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='cloneNode');assert.ok(clone.body);const guard=clone.body.statements[0].getText(tree);
 const clonePrefix=run(`async(node,options)=>{${guard};throw Error('Poster reached authored capture work')}`,{})as(node:unknown,options:unknown)=>Promise<unknown>;
 assert.equal(await clonePrefix({nodeType:1,hasAttribute:(key:string)=>key==='data-canvas-v2-presentation-preview'},{filter:()=>{throw Error('Filter must not run');}}),null);
});

test('presentation command policy invalidates state changes while capture and targeting stay read-only',()=>{
 for(const action of ['click','fill','scroll','drag','restore-focus','motion-begin','motion-end','sample-motion','live-motion','test-sequence','patch-design','patch-element','patch-elements','patch-assets','patch-structure','patch-stylesheet'])assert.equal(screenPresentationCommandChangesState(action),true,action);
 for(const action of ['inspect','snapshot','presentation-snapshot','asset-target','feedback-target','edit-hover','edit-targets','edit-selection','edit-mode','feedback-mode'])assert.equal(screenPresentationCommandChangesState(action),false,action);
 for(const value of ['reveal','reveal-only'])assert.equal(screenPresentationCommandChangesState('edit-target',value),true);
 for(const value of ['select',undefined])assert.equal(screenPresentationCommandChangesState('edit-target',value),false);
 assert.equal(screenPresentationCommandChangesState('future-unknown-action'),true,'Unknown effects fail conservatively toward invalidation.');
});

test('presentation resource projection retains exact data URLs without decoding or permitting executable/remote bytes',()=>{
 const table={'northstar-capture-image:1':png,'northstar-capture-image:2':'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='};
 const values=screenCaptureImageDataUrls(table);assert.equal(values.get('northstar-capture-image:1'),png);assert.equal(values.get('northstar-capture-image:2'),table['northstar-capture-image:2']);assert.equal(bindScreenCaptureImages('<img src="northstar-capture-image:1">',values),`<img src="${png}">`);
 for(const bad of [null,[],{'invalid':png},{'northstar-capture-image:1':'https://example.invalid/photo.png'},{'northstar-capture-image:1':'data:text/html;base64,PHNjcmlwdD4='},{'northstar-capture-image:1':png+'!'},Object.fromEntries(Array.from({length:101},(_,index)=>[`northstar-capture-image:${index}`,png]))])assert.throws(()=>screenCaptureImageDataUrls(bad));
 assert.deepEqual([...screenCaptureImageDataUrls(undefined)],[]);assert.deepEqual(table,{'northstar-capture-image:1':png,'northstar-capture-image:2':'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='});
});

function preparedHarness({sandbox='allow-same-origin',csp="script-src 'none'",mainDocument=false,blobAvailable=true}:{sandbox?:string;csp?:string;mainDocument?:boolean;blobAvailable?:boolean}={}){
 const text=fs.readFileSync(new URL('../lib/canvas-v2/cooperative-capture.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('capture.ts',text,ts.ScriptTarget.Latest,true),production=find(tree,(node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='toPreparedCanvasPng');
 const calls:Array<{phase:string;args:unknown[]}>=[];let current=true;
 const canvas={width:0,height:0,getContext:()=>({drawImage:(...args:unknown[])=>calls.push({phase:'draw',args})}),toBlob:(done:(value:Blob|null)=>void,mime:string)=>{calls.push({phase:'blob',args:[mime]});queueMicrotask(()=>done(blobAvailable?new Blob(['exact PNG fixture'],{type:'image/png'}):null));}};
 const document={createElement:(name:string)=>{assert.equal(name,'canvas');return canvas;}},owner=mainDocument?document:{defaultView:{frameElement:{getAttribute:(name:string)=>name==='sandbox'?sandbox:undefined}},querySelector:(selector:string)=>{assert.equal(selector,'meta[http-equiv="Content-Security-Policy"]');return {getAttribute:()=>csp};}};
 const node=Object.freeze({ownerDocument:owner});
 const globals={document,performance,recordScreenPresentationTiming:()=>{},waitForCanvasInputQuiet:async(_quiet:number,isCurrent:()=>boolean)=>{if(!isCurrent())throw Error('Interrupted');},serializeSvgInChunks:async(...args:unknown[])=>{calls.push({phase:'serialize',args});return '<svg>bounded actual prepared DOM</svg>';},encodeSvgInChunks:async(...args:unknown[])=>{calls.push({phase:'encode',args});return 'data:image/svg+xml;base64,fixture';},createImage:async(source:string)=>{calls.push({phase:'decode',args:[source]});return {decoded:true};},FileReader:class {result:unknown;onload?:()=>void;onerror?:()=>void;readAsDataURL(){this.result=png;queueMicrotask(()=>this.onload?.());}}};
 const encode=run(`(${production.getText(tree).replace(/^export\s+/, '')})`,globals)as(node:unknown,width:number,height:number,current:()=>boolean)=>Promise<string>;
 return {calls,canvas,node,call:(width=960,height=540)=>encode(node,width,height,()=>current),interrupt:()=>{current=false;}};
}

test('prepared PNG path preserves original responsive viewport while downsampling final PNG and encodes asynchronously',async()=>{
 const h=preparedHarness();assert.equal(await h.call(),png);assert.equal(h.canvas.width,640);assert.equal(h.canvas.height,360);assert.deepEqual(h.calls.map(call=>call.phase),['serialize','encode','decode','draw','blob']);
 const args=h.calls[0].args;assert.equal(args[0],h.node);assert.deepEqual([args[1],args[2],args[5],args[6]],[960,540,960,540]);assert.equal(h.calls.at(-1)!.args[0],'image/png');
});

test('prepared PNG path rejects main or script-enabled documents and invalid viewports before serialization',async()=>{
 for(const config of [{mainDocument:true},{sandbox:'allow-same-origin allow-scripts'},{sandbox:''},{csp:"script-src 'unsafe-inline'"}]){const h=preparedHarness(config);await assert.rejects(h.call(),/script-disabled private capture document/);assert.equal(h.calls.length,0);}
 for(const [width,height] of [[0,540],[960,0],[2000,540],[960,1700],[NaN,540]]){const h=preparedHarness();await assert.rejects(h.call(width,height),/Invalid presentation viewport/);assert.equal(h.calls.length,0);}
});

test('prepared PNG path fails closed on interruption or encoder failure without mutating authored source',async()=>{
 const h=preparedHarness();h.interrupt();await assert.rejects(h.call(),/Interrupted/);assert.equal(h.calls.length,0);assert.equal(Object.isFrozen(h.node),true);
 const missing=preparedHarness({blobAvailable:false});await assert.rejects(missing.call(),/presentation changed/i);
});

function presentationSnapshotFunction(globals:Record<string,unknown>){
 const html=buildCanvasV2ScreenRuntime({version:1,title:'Native state',width:390,height:844,html:'<main>Retained native source</main>',css:'',javascript:'',referenceAssetIds:[]},new Map(),'token');const boot=[...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1],tree=ts.createSourceFile('boot.js',boot,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const declaration=find(tree,(node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(tree)==='presentationSnapshot');assert.ok(declaration.initializer);return run(`(${declaration.initializer.getText(tree)})`,globals)as()=>{html:string;css:string;width:number;height:number;rootAttributes:Array<[string,string]>};
}

test('light runtime snapshot serializes live selection attributes and current controls without static computed-style or review scans',()=>{
 class Element {attributes=new Map<string,string>();children:Element[]=[];scrollTop=0;scrollLeft=0;style:{margin?:string;setProperty:(name:string,value:string)=>void}={setProperty:()=>{}};textContent='';setAttribute(name:string,value:string){this.attributes.set(name,value);}removeAttribute(name:string){this.attributes.delete(name);}toggleAttribute(name:string,on:boolean){if(on)this.setAttribute(name,'');else this.removeAttribute(name);}prepend(child:Element){this.children.unshift(child);}}
 class Input extends Element {value='Current unsent draft';checked=true;}
 class Textarea extends Element {value='Current multiline draft';}
 class Option extends Element {selected=false;constructor(readonly label:string,selected=false){super();this.selected=selected;if(selected)this.setAttribute('selected','');}}
 class Select extends Element {options:Option[];multiple=false;selectedIndex=1;constructor(options:Option[]){super();this.options=options;}override prepend(child:Option){this.options.unshift(child);}}
 for(const selectedIndex of [1,-1]){
  const input=new Input(),textarea=new Textarea(),select=new Select([new Option('first'),new Option('second',selectedIndex===1)]);select.selectedIndex=selectedIndex;
  const inputCopy=new Input(),textCopy=new Textarea(),selectCopy=new Select([new Option('first',true),new Option('second')]);
  const live=[input,textarea,select],copies=[inputCopy,textCopy,selectCopy],clone=Object.assign(new Element(),{querySelectorAll:(selector:string)=>selector==='*'?copies:[]});
  Object.defineProperty(clone,'outerHTML',{get:()=>`<body><input value="${inputCopy.attributes.get('value')}" checked="${inputCopy.attributes.has('checked')}"><textarea>${textCopy.textContent}</textarea><select>${selectCopy.options.map(option=>`<option${option.attributes.has('selected')?' selected':''}${option.attributes.has('hidden')?' hidden':''}>${option.label??''}</option>`).join('')}</select></body>`});
  const body=Object.assign(new Element(),{querySelectorAll:()=>live,cloneNode:()=>clone});
  const snapshot=presentationSnapshotFunction({document:{body,documentElement:{cloneNode:()=>({attributes:[{name:'class',value:'night'},{name:'style',value:'--accent:cyan'},{name:'data-theme',value:'night'},{name:'onclick',value:'blocked()'}]})},getAnimations:()=>[],querySelectorAll:()=>[],styleSheets:[{cssRules:[{cssText:'body { color: rgb(1, 2, 3); }'}]}],createElement:(name:string)=>{assert.equal(name,'option');return new Option('');}},HTMLInputElement:Input,HTMLTextAreaElement:Textarea,HTMLSelectElement:Select,HTMLCanvasElement:class{},HTMLVideoElement:class{},HTMLImageElement:class{},getComputedStyle:()=>{throw Error('Static controls must not incur computed-style reads');},inspect:()=>{throw Error('Presentation must not run review diagnostics');},packCapture:(html:string,css:string)=>({html,css}),innerWidth:390,innerHeight:844,scrollX:5,scrollY:7})();
  assert.match(snapshot.html,/Current unsent draft/);assert.match(snapshot.html,/Current multiline draft/);assert.match(snapshot.css,/body \{ color/);assert.equal(snapshot.width,390);assert.equal(snapshot.height,844);assert.deepEqual(JSON.parse(JSON.stringify(snapshot.rootAttributes)),[['class','night'],['style','--accent:cyan'],['data-theme','night']]);
  const marked=selectCopy.options.filter(option=>option.attributes.has('selected'));assert.equal(marked.length,1);if(selectedIndex===1)assert.equal(marked[0].label,'second');else assert.equal(marked[0].attributes.has('hidden'),true);
  assert.equal(select.options[0].attributes.has('selected'),false);assert.equal(input.value,'Current unsent draft');assert.equal(body.attributes.size,0);
 }
});

test('light runtime node cap rejects before cloning or reviewing a large frame',()=>{
 let clones=0;const snapshot=presentationSnapshotFunction({document:{body:{querySelectorAll:()=>Array.from({length:1500},()=>({})),cloneNode:()=>{clones++;throw Error('Must stop before cloning');}}}});
 assert.throws(snapshot,/idle presentation budget/);assert.equal(clones,0);
});

test('interaction selector rewriting respects quotes, escapes, nested functions and state-name boundaries',()=>{
 const cases=[
  ['button:hover::before','button[data-northstar-presentation-hover]::before'],
  ['input:focus-visible,section:focus-within button:focus','input[data-northstar-presentation-focus-visible],section[data-northstar-presentation-focus-within] button[data-northstar-presentation-focus]'],
  ['[data-note=":hover"]:hover','[data-note=":hover"][data-northstar-presentation-hover]'],
  [String.raw`[data-note='a\':focus']:hover`,String.raw`[data-note='a\':focus'][data-northstar-presentation-hover]`],
  [String.raw`.literal\:hover:focus`,String.raw`.literal\:hover[data-northstar-presentation-focus]`],
  [':not(:hover):is(:focus,.other)',':not([data-northstar-presentation-hover]):is([data-northstar-presentation-focus],.other)'],
  [':hovering,:focus-custom,:focus-visible-extra',':hovering,:focus-custom,:focus-visible-extra'],
 ];for(const [before,after]of cases)assert.equal(screenPresentationSelector(before),after,before);
});

test('light animation freezing copies only animated properties and records inert interaction selectors',()=>{
 const childStyles=new Map<string,string>(),childAttributes=new Map<string,string>(),sourceChild={children:[],scrollTop:0,scrollLeft:0},copyChild={children:[],style:{setProperty:(name:string,value:string)=>childStyles.set(name,value)},setAttribute:(name:string,value:string)=>childAttributes.set(name,value)};
 const clone={querySelectorAll:(selector:string)=>selector==='*'?[copyChild]:[],style:{setProperty:()=>{},margin:'23px'},outerHTML:'<body><div>Actual frame</div></body>'},body={querySelectorAll:()=>[sourceChild],cloneNode:()=>clone},root={};let styleReads=0;
 const snapshot=presentationSnapshotFunction({document:{body,documentElement:{cloneNode:()=>({attributes:[]})},getAnimations:()=>[{effect:{target:sourceChild,getKeyframes:()=>[{offset:0,transform:'translateX(0px)',opacity:0},{offset:1,transform:'translateX(80px)',opacity:1,computedOffset:1,easing:'linear'}]}}],querySelectorAll:(selector:string)=>selector===':hover'?[sourceChild]:[],styleSheets:[{cssRules:[{selectorText:'div:hover',cssText:'div:hover { color: orange; }'},{selectorText:'.card',cssText:'.card { padding:4px; &:hover::before { opacity:.5; } }',style:{cssText:'padding:4px;'},cssRules:[{selectorText:'&:hover::before',cssText:'&:hover::before { opacity:.5; }'}]}]}]},presentationSelector:screenPresentationSelector,HTMLInputElement:class{},HTMLTextAreaElement:class{},HTMLSelectElement:class{},HTMLCanvasElement:class{},HTMLVideoElement:class{},HTMLImageElement:class{},getComputedStyle:(element:unknown,pseudo?:string)=>{assert.equal(element,sourceChild);styleReads++;return {content:pseudo?'none':undefined,getPropertyValue:(name:string)=>name==='transform'?'matrix(1,0,0,1,41,0)':name==='opacity'?'.5':'never copy unrelated layout'};},packCapture:(html:string,css:string)=>({html,css}),innerWidth:390,innerHeight:844,scrollX:0,scrollY:0,root})();
 assert.deepEqual([...childStyles],[['transform','matrix(1,0,0,1,41,0)'],['opacity','.5']]);assert.equal(styleReads,3);assert.equal(childAttributes.get('data-northstar-presentation-hover'),'');assert.match(snapshot.css,/div\[data-northstar-presentation-hover\]/);assert.match(snapshot.css,/animation:none!important/);assert.match(snapshot.css,/\.card\{padding:4px;&\[data-northstar-presentation-hover\]::before/);assert.equal(clone.style.margin,'23px');assert.deepEqual(sourceChild,{children:[],scrollTop:0,scrollLeft:0});
});

test('light snapshot freezes root animations and root/body interaction state while preserving authored body margin',()=>{
 const rootAttributes=new Map([['class','night'],['style','--accent:cyan']]),bodyAttributes=new Map<string,string>();
 const rootClone={setAttribute:(name:string,value:string)=>rootAttributes.set(name,value),style:{setProperty:(name:string,value:string)=>rootAttributes.set('style',rootAttributes.get('style')+';'+name+':'+value)},get attributes(){return [...rootAttributes].map(([name,value])=>({name,value}));}};
 const clone={querySelectorAll:()=>[],setAttribute:(name:string,value:string)=>bodyAttributes.set(name,value),style:{margin:'23px',setProperty:()=>{}},outerHTML:'<body style="margin:23px">Exact current layout</body>'};
 const body={querySelectorAll:()=>[],cloneNode:()=>clone,children:[],scrollTop:0,scrollLeft:0},root={cloneNode:()=>rootClone,children:[],scrollTop:0,scrollLeft:0};
 const snapshot=presentationSnapshotFunction({document:{body,documentElement:root,getAnimations:()=>[{effect:{target:root,getKeyframes:()=>[{opacity:0},{opacity:1}]}}],querySelectorAll:(selector:string)=>selector===':hover'?[root,body]:[],styleSheets:[]},HTMLInputElement:class{},HTMLTextAreaElement:class{},HTMLSelectElement:class{},HTMLCanvasElement:class{},HTMLVideoElement:class{},HTMLImageElement:class{},getComputedStyle:(element:unknown,pseudo?:string)=>{assert.equal(element,root);return {content:pseudo?'none':undefined,getPropertyValue:()=>'.4'};},packCapture:(html:string,css:string)=>({html,css}),innerWidth:390,innerHeight:844,scrollX:0,scrollY:0})();
 const attributes=new Map(snapshot.rootAttributes);assert.match(attributes.get('style')!,/opacity:\.4/);assert.equal(attributes.get('class'),'night');assert.equal(attributes.get('data-northstar-presentation-hover'),'');assert.equal(bodyAttributes.get('data-northstar-presentation-hover'),'');assert.equal(clone.style.margin,'23px');assert.match(snapshot.html,/margin:23px/);
});

test('light snapshot copies computed geometry only for replaced media, retaining untouched native image CSS',()=>{
 class Video {children:unknown[]=[];scrollTop=0;scrollLeft=0;}class Image {children:unknown[]=[];scrollTop=0;scrollLeft=0;}
 const video=new Video(),image=new Image(),styles=new Map<string,string>(),replacement={style:{setProperty:(name:string,value:string)=>styles.set(name,value)}},videoCopy={replaceWith:(value:unknown)=>assert.equal(value,replacement)},imageCopy={};
 const clone={querySelectorAll:(selector:string)=>selector==='*'?[videoCopy,imageCopy]:[],style:{setProperty:()=>{}},outerHTML:'<body>Actual current media</body>'},body={querySelectorAll:()=>[video,image],cloneNode:()=>clone};let reads=0;
 presentationSnapshotFunction({document:{body,documentElement:{cloneNode:()=>({attributes:[]})},getAnimations:()=>[],querySelectorAll:()=>[],styleSheets:[]},HTMLInputElement:class{},HTMLTextAreaElement:class{},HTMLSelectElement:class{},HTMLCanvasElement:class{},HTMLVideoElement:Video,HTMLImageElement:Image,canvasContributesPaint:()=>true,mediaCapture:(node:unknown,copy:unknown)=>({replacement:node===video?replacement:copy}),getComputedStyle:(node:unknown)=>{assert.equal(node,video,'Unchanged IMG must not receive a computed-style walk.');reads++;return {getPropertyValue:(name:string)=>name==='width'?'333px':name==='height'?'187px':'cover',*[Symbol.iterator](){yield 'width';yield 'height';yield 'object-fit';}};},packCapture:(html:string,css:string)=>({html,css}),innerWidth:390,innerHeight:844,scrollX:0,scrollY:0})();
 assert.equal(reads,1);assert.deepEqual([...styles],[['width','333px'],['height','187px'],['object-fit','cover']]);assert.deepEqual({...video},{children:[],scrollTop:0,scrollLeft:0});
});

test('cold reset aborts in-flight pixels, releases cached references and reseeds each currently visible owner once',async()=>{
 const old=deferred<ScreenPresentation>(),counts=new Map<string,number>(),values=new Map<string,Array<ScreenPresentation|undefined>>(),signals:AbortSignal[]=[];
 const cache=createScreenPresentationCache({quiet:async()=>{}}),make=(id:string)=>{values.set(id,[]);return cache.register(id,async signal=>{signals.push(signal);const count=(counts.get(id)??0)+1;counts.set(id,count);return id==='c'&&count===1?old.promise:image({id,count});},value=>values.get(id)!.push(value));};
 const a=make('a'),b=make('b'),c=make('c');a.visible(true);await flush();b.visible(true);await flush();b.visible(false);c.visible(true);await flush();cache.reset();cache.reset();assert.equal(signals.at(-1)?.aborted,true);assert.equal(values.get('a')!.at(-1),undefined);assert.equal(values.get('b')!.at(-1),undefined);old.resolve(image({id:'obsolete'}));await flush();
 assert.equal(counts.get('a'),2);assert.equal(counts.get('b'),1,'Offscreen entries cannot warm after reset.');assert.equal(counts.get('c'),2);assert.equal(values.get('c')!.filter(Boolean).length,1);assert.deepEqual(values.get('c')!.at(-1)!.version,{id:'c',count:2});b.visible(true);await flush();assert.equal(counts.get('b'),2);a.dispose();b.dispose();c.dispose();
});

test('actual device-frame pointer crossings preserve Pan continuity covers while focus dismisses them',()=>{
 const opening=find(hostTree,(node):node is ts.JsxOpeningElement=>ts.isJsxOpeningElement(node)&&node.attributes.properties.some(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(hostTree)==='data-northstar-device-frame'));
 const reasons:unknown[]=[],handlers=new Map<string,(event:unknown)=>void>();for(const attribute of opening.attributes.properties){if(!ts.isJsxAttribute(attribute)||!attribute.name.getText(hostTree).startsWith('on')||!attribute.initializer||!ts.isJsxExpression(attribute.initializer)||!attribute.initializer.expression)continue;handlers.set(attribute.name.getText(hostTree),run(`(${attribute.initializer.expression.getText(hostTree)})`,{editing:{mode:'design'},dismissPresentation:{current:(reason:unknown)=>reasons.push(reason)}})as(event:unknown)=>void);}
 const crossing={pointerType:'mouse',buttons:1};for(const name of ['onPointerOver','onPointerEnter','onPointerMove'])handlers.get(name)?.(crossing);assert.deepEqual([...reasons],[],'Crossing an app while dragging the Pan plane must not reveal an unpainted iframe.');assert.ok(handlers.has('onFocusCapture'));handlers.get('onFocusCapture')!({});assert.deepEqual([...reasons],['focus']);
 const focus=opening.attributes.properties.find(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(hostTree)==='onFocusCapture') as ts.JsxAttribute;
 const expression=(focus.initializer as ts.JsxExpression).expression!;
 const focused:string[]=[];
 (run(`(${expression.getText(hostTree)})`,{editing:{mode:'preview',previewFocus:(id:string)=>focused.push(id)},nodeId:'screen-a',dismissPresentation:{current:(reason:unknown)=>reasons.push(reason)}}) as(event:unknown)=>void)({});
 assert.deepEqual([...reasons],['focus','focus'],'Focusing Preview must expose its live interactive frame.');assert.deepEqual(focused,['screen-a'],'Preview focus must tell the workspace which screen the person is using.');
});
