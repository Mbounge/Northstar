import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {SCREEN_ATTRIBUTE} from '../lib/canvas-v2/interactive-screen';
import {snapCanvasV2ObjectDelta,translateCanvasV2ObjectBounds,unionCanvasV2ObjectBounds} from '../lib/canvas-v2/object-interaction';
import {translateCanvasV2WorkspaceBounds} from '../lib/canvas-v2/workspace-coordinate-space';
const parse=(path:string)=>ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),workspace=parse('components/canvas-v2/canvas-v2-workspace.tsx'),native=parse('components/canvas-v2/native-canvas-scene.tsx');
function find<T extends ts.Node>(tree:ts.Node,predicate:(node:ts.Node)=>node is T):T{let found:T|undefined;const visit=(node:ts.Node)=>{if(!found&&predicate(node))found=node;if(!found)ts.forEachChild(node,visit)};visit(tree);assert.ok(found,'Actual callback missing');return found;}
const declaration=(tree:ts.SourceFile,name:string)=>find(tree,(node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(tree)===name);
const run=(code:string,context:vm.Context)=>vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
const app={nodeId:'app',kind:'object',locked:false,textEditable:false,bounds:{x:100,y:100,width:390,height:844}};
function nativeHarness(kind:'app'|'text'|'image'='app'){
 const textEditable=kind==='text';
 const forwarded:Array<{phase:string;buttons?:number;clientX?:number;clientY?:number}>=[],captures:number[]=[];const target={closest:()=>null},root={setPointerCapture:(id:number)=>captures.push(id),closest:()=>null};const activePointerRef:{current:unknown}={current:undefined};
 const context=vm.createContext({activePointerRef,inspectionEnabled:true,SCREEN_ATTRIBUTE,targetNode:()=>({node:{id:'app',attributes:kind==='app'?{[SCREEN_ATTRIBUTE]:'retained-app-source'}:{}},element:target}),inspectNativeNode:()=>({...app,kind:kind==='image'?'image':kind==='text'?'text':'object',textEditable}),onElementSelect:()=>{},onElementPointer:(event:{phase:string;buttons?:number})=>forwarded.push(event),onWorkspacePointer:()=>assert.fail('Known app is an element, not blank workspace'),publicSceneRef:{current:root},inspectHoverTarget:()=>{},byId:new Map()});
 for(const name of ['pointerDown','pointerMove','pointerUp'])run('const '+declaration(native,name).getText(native)+';',context);
 const event=(type:string,buttons:number,clientX=200,clientY=200)=>({type,target,currentTarget:root,pointerId:7,clientX,clientY,button:type==='pointerdown'?0:-1,buttons,preventDefault:()=>{},stopPropagation:()=>{}});
 const capture=find(native,(node):node is ts.JsxAttribute=>ts.isJsxAttribute(node)&&node.name.getText(native)==='onLostPointerCapture');assert.ok(capture.initializer&&ts.isJsxExpression(capture.initializer)&&capture.initializer.expression);const lost=run('('+capture.initializer.expression.getText(native)+')',context);
 return{up:()=>run('pointerUp',context)(event('pointerup',0,260,270)),cancel:()=>run('pointerUp',context)(event('pointercancel',0,900,900)),lost:()=>lost({...event('lostpointercapture',0,900,900),target:root}),down:()=>run('pointerDown',context)(event('pointerdown',1)),move:(buttons:number,x=200,y=200)=>run('pointerMove',context)(event('pointermove',buttons,x,y)),active:()=>activePointerRef.current,forwarded,captures};
}

test('native non-text app selection captures on the stable scene before focus removes the Design surface',()=>{const h=nativeHarness();h.down();assert.deepEqual(h.captures,[7]);assert.equal(h.forwarded[0].phase,'down');});
test('native text selection preserves its physical double-click sequence instead of immediate root capture',()=>{const h=nativeHarness('text');h.down();assert.deepEqual(h.captures,[]);assert.equal(h.forwarded[0].phase,'down');});
test('native image selection preserves its physical double-click target for Crop entry',()=>{const h=nativeHarness('image');h.down();assert.deepEqual(h.captures,[]);assert.equal(h.forwarded[0].phase,'down');});
test('a native buttonless move after iframe-swallowed release retires ownership and never starts or advances a drag',()=>{const h=nativeHarness();h.down();h.move(0,900,900);assert.equal(h.active(),undefined);assert.equal(h.forwarded.at(-1)?.clientX,200,'Missingrelease uses last held coordinate, neverhover900');assert.equal(h.forwarded.filter(event=>event.phase==='move').length,0);});

function workspaceHarness(){
 let advances=0,ends=0;const mutations:unknown[]=[];const events=new Map<string,(event:unknown)=>void>(),element={...app,bounds:{x:100,y:100,width:390,height:844}},directGestureRef:{current:unknown}={current:{kind:'move',pointerId:7,startX:100,startY:100,original:element.bounds,originals:[element],draftBounds:{...element.bounds,x:120},draftElementBounds:{app:{...element.bounds,x:120}},draftRotations:{},hasDragged:true}};
 const context=vm.createContext({directGestureRef,connectorGestureRef:{current:undefined},drawingGestureRef:{current:undefined},feedbackPickingRef:{current:false},spacePan:false,tool:'select',updateDirectGesture:()=>{advances++;return true},updateDirectGestureHandlerRef:{current:()=>{advances++;return true}},finishDrawingGestureHandlerRef:{current:()=>false},finishConnectorGestureHandlerRef:{current:()=>false},updateDrawingGestureHandlerRef:{current:()=>false},updateConnectorGestureHandlerRef:{current:()=>false},workspaceRef:{current:{focus:()=>{},contains:()=>false}},cancelDirectGesturePreview:()=>{},flushDirectGesturePreview:()=>{},restoreDirectGesturePreview:()=>{},finishDirectGestureChrome:()=>{},submitMutation:(mutation:unknown)=>{mutations.push(JSON.parse(JSON.stringify(mutation)));return true},endHumanEdit:()=>{ends++},releasePointerGestureHandlerRef:{current:()=>{}},placementRef:{current:undefined},lastCanvasPointerRef:{current:undefined},workspacePoint:(x:number,y:number)=>({x,y}),marqueeRef:{current:undefined},panRef:{current:undefined},window:{addEventListener:(name:string,handler:(event:unknown)=>void)=>events.set(name,handler),removeEventListener:()=>{}}});
 run('const '+declaration(workspace,'finishDirectGesture').getText(workspace)+';',context);context.finishDirectGestureHandlerRef={current:run('finishDirectGesture',context)};
 const release=find(workspace,(node):node is ts.BinaryExpression=>ts.isBinaryExpression(node)&&node.left.getText(workspace)==='releasePointerGestureHandlerRef.current');run(release.getText(workspace)+';',context);
 for(const name of ['forwardedElementPointer','pointerMove'])run('const '+declaration(workspace,name).getText(workspace)+';',context);
 const effect=find(workspace,(node):node is ts.CallExpression=>ts.isCallExpression(node)&&node.expression.getText(workspace)==='useEffect'&&!!node.arguments[0]?.getText(workspace).includes('const ownsDirect = directGestureRef.current?.pointerId'));run('('+effect.arguments[0].getText(workspace)+')()',context);
 const event=(buttons:number)=>({type:'pointermove',phase:'move',element,target:{},pointerId:7,clientX:900,clientY:900,button:-1,buttons,preventDefault:()=>{},stopPropagation:()=>{}});
 return{context,blur:()=>events.get('blur')!({}),mutations,forward:(buttons:number)=>run('forwardedElementPointer',context)(event(buttons)),native:(buttons:number)=>run('pointerMove',context)(event(buttons)),window:(buttons:number)=>events.get('pointermove')!(event(buttons)),advances:()=>advances,ends:()=>ends,active:()=>directGestureRef.current};
}
for(const channel of ['forward','native','window']as const)test(`actual Workspace ${channel} path retires stale ownership before any buttonless hover can move an object`,()=>{const h=workspaceHarness();h[channel](0);assert.equal(h.advances(),0,'Released pointer coordinates must never enter transform math');assert.equal(h.active(),undefined);assert.equal(h.ends(),1);assert.deepEqual(h.mutations,[{kind:'batch',label:'Moved 1 selected object.',mutations:[{kind:'move',nodeId:'app',deltaX:20,deltaY:0}]}],'Only last held geometry commits; hover coordinates never author');});
test('actual held-button forwarded motion still advances the active gesture',()=>{const h=workspaceHarness();h.forward(1);assert.equal(h.advances(),1);assert.ok(h.active());assert.equal(h.ends(),0);});

test('Native lost capture ends at last held app coordinates and clears active state',()=>{const h=nativeHarness();h.down();h.move(1,240,250);h.lost();assert.equal(h.active(),undefined);assert.equal(h.forwarded.at(-1)?.phase,'up');assert.equal(h.forwarded.at(-1)?.clientX,240);assert.equal(h.forwarded.at(-1)?.clientY,250);});
test('window blur cancels the active transform and cannot author or keep human ownership',()=>{const h=workspaceHarness();h.blur();assert.equal(h.active(),undefined);assert.equal(h.advances(),0);assert.equal(h.ends(),1);assert.deepEqual(h.mutations,[]);h.blur();assert.equal(h.ends(),1);});


test('ordinary Native pointer-up retains the actual final coordinate',()=>{const h=nativeHarness();h.down();h.move(1,240,250);h.up();assert.equal(h.forwarded.at(-1)?.clientX,260);assert.equal(h.forwarded.at(-1)?.clientY,270);});
test('Native cancellation reaches the actual Workspace drawing callback as cancellation',()=>{
 const h=nativeHarness();h.down();h.move(1,240,250);h.cancel();const finishes:unknown[][]=[];
 const context=vm.createContext({feedbackPickingRef:{current:false},spacePan:false,tool:'draw',startDrawingGestureHandlerRef:{current:()=>{}},updateDrawingGestureHandlerRef:{current:()=>{}},finishDrawingGestureHandlerRef:{current:(...args:unknown[])=>finishes.push(args)},finishConnectorGestureHandlerRef:{current:()=>{}},finishDirectGestureHandlerRef:{current:()=>{}},placementRef:{current:undefined},marqueeRef:{current:undefined},panRef:{current:undefined},releasePointerGestureHandlerRef:{current:()=>{}}});
 const release=find(workspace,(node):node is ts.BinaryExpression=>ts.isBinaryExpression(node)&&node.left.getText(workspace)==='releasePointerGestureHandlerRef.current');run(release.getText(workspace)+';',context);
 run('const '+declaration(workspace,'forwardedElementPointer').getText(workspace)+';',context);
 for(const event of h.forwarded)run('forwardedElementPointer',context)(event);
 assert.equal(finishes.length,1);assert.equal(finishes[0][3],true,'A browser-cancelled stroke must never be authored as ordinary Finish');
});


test('actual app-selection effect preserves held host ownership until real move commits, then opens internal design',()=>{
 const h=workspaceHarness(),context=h.context,opened:unknown[]=[];
 Object.assign(context,{canvasView:'design',collaborationReadOnly:false,selectedElements:[app],selectedElement:app,selectedScreenDescriptor:{simulation:false},setScreenEditNodeId:(id:unknown)=>opened.push(id),humanEditing:false,engine:{applyingManualEdit:false},collaboration:undefined,contextualToolbarRef:{current:undefined},sceneElementsRef:{current:[]},viewportRef:{current:{scale:1}},snapCanvasV2ObjectDelta,translateCanvasV2WorkspaceBounds,translateCanvasV2ObjectBounds,unionCanvasV2ObjectBounds,publishDirectGesturePreview:()=>{},beginHumanEdit:()=>{context.humanEditing=true},endHumanEdit:()=>{context.humanEditing=false}});
 for(const name of ['startDirectGesture','updateDirectGesture'])run('const '+declaration(workspace,name).getText(workspace)+';',context);
 const focus=find(workspace,(node):node is ts.CallExpression=>ts.isCallExpression(node)&&node.expression.getText(workspace)==='useEffect'&&!!node.arguments[0]?.getText(workspace).includes('selectedScreenDescriptor.simulation'));
 const focusEffect=run('('+focus.arguments[0].getText(workspace)+')',context);
 run('startDirectGesture',context)('move',7,200,200,[app]);focusEffect();assert.deepEqual(opened,[],'Selection must not switch ownership to internal studio while pointer remains held');
 h.forward(1);run('finishDirectGesture',context)(7);assert.equal(h.mutations.length,1);assert.deepEqual(h.mutations,[{kind:'batch',label:'Moved 1 selected object.',mutations:[{kind:'move',nodeId:'app',deltaX:700,deltaY:700}]}]);
 focusEffect();assert.deepEqual(opened,['app'],'Release opens the selected app after host edit ownership ends');
});

