import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

interface VNode {type:unknown;key?:string|null;props:Record<string,unknown>}
type StateSlot={value:unknown;deps?:unknown[]};
/** Run the real inspector and its keyed child reconciliation. Only React's hook
 * scheduler and host DOM are substituted, including effect dependency checks. */
function inspectorHarness(){
 const instances=new Map<string,StateSlot[]>();let slots:StateSlot[]=[],index=0,pending:Array<()=>void>=[];
 const hooks={
  useState:(initial:unknown)=>{const owner=slots,slot=index++;if(!owner[slot])owner[slot]={value:typeof initial==='function'?(initial as ()=>unknown)():initial};return[owner[slot].value,(next:unknown)=>{owner[slot].value=typeof next==='function'?(next as (value:unknown)=>unknown)(owner[slot].value):next}];},
  useRef:(initial:unknown)=>{const slot=index++;if(!slots[slot])slots[slot]={value:{current:initial}};return slots[slot].value;},
  useEffect:(effect:()=>void,deps:unknown[])=>{const owner=slots,slot=index++,prior=owner[slot]?.deps;if(!prior||deps.some((value,i)=>!Object.is(value,prior[i]))){owner[slot]={value:undefined,deps};pending.push(effect);}},
 };
 const jsx=(type:unknown,props:Record<string,unknown>,key?:string)=>({type,props,key});const exports:Record<string,unknown>={};
 const code=ts.transpileModule(readFileSync('components/canvas-v2/board-design-inspector.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{exports,require:(name:string)=>name==='react'?hooks:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:{}});
 const mutations:unknown[]=[];let selected=[element('a')];
 function walk(value:unknown,path='root'):VNode[]{
  if(Array.isArray(value))return value.flatMap((child,i)=>walk(child,path+'/'+i));if(!value||typeof value!=='object'||!('props'in value))return[];const node=value as VNode;
  if(typeof node.type==='function'){const id=path+':'+(node.key??'unkeyed');slots=instances.get(id)??[];instances.set(id,slots);index=0;return walk(node.type(node.props),id);}
  return[node,...walk(node.props.children,path+':'+(node.key??'unkeyed')+'/'+String(node.type))];
 }
 const invoke=exports.BoardDesignInspector as (props:unknown)=>VNode;
 const render=()=>{let tree:VNode[]=[];for(let pass=0;pass<2;pass++){pending=[];tree=walk(invoke({selected,onMutation:(mutation:unknown)=>mutations.push(mutation),onOpen:()=>{}}));const effects=pending;for(const effect of effects)effect();if(!effects.length)break;}return tree.find(node=>node.type==='input'&&node.props['aria-label']==='Object X')!;};
 return{render,mutations,select:(id:string,x=100)=>{selected=[element(id,x)];}};
}
function element(nodeId:string,x=100){return{nodeId,kind:'shape',locked:false,bounds:{x,y:200,width:300,height:150}};}

test('inspector selection rerender before blur never transfers an uncommitted draft to another same-position object',()=>{
 const h=inspectorHarness();let input=h.render();(input.props.onChange as (event:unknown)=>void)({target:{value:'345'}});input=h.render();assert.equal(input.props.value,'345');
 h.select('b');input=h.render();assert.equal(input.props.value,'100','A new selection must show its own property, not the previous object draft');(input.props.onBlur as ()=>void)();assert.deepEqual(h.mutations,[],'Blur after changing selection must not move the new object');
});

test('inspector Escape restores the current object value and does not author on blur; Enter commits one precise move',()=>{
 const h=inspectorHarness();let input=h.render();(input.props.onChange as (event:unknown)=>void)({target:{value:'345'}});input=h.render();
 (input.props.onKeyDown as (event:unknown)=>void)({key:'Escape',currentTarget:{blur:()=>{(input.props.onBlur as ()=>void)();}}});input=h.render();assert.equal(input.props.value,'100');assert.deepEqual(h.mutations,[]);
 (input.props.onChange as (event:unknown)=>void)({target:{value:'125.5'}});input=h.render();(input.props.onKeyDown as (event:unknown)=>void)({key:'Enter',currentTarget:{blur:()=>{(input.props.onBlur as ()=>void)();}}});assert.deepEqual(JSON.parse(JSON.stringify(h.mutations)),[{kind:'move',nodeId:'a',deltaX:25.5,deltaY:0}]);
});

const workspaceSource=readFileSync('components/canvas-v2/canvas-v2-workspace.tsx','utf8');
const workspaceTree=ts.createSourceFile('workspace.tsx',workspaceSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function findNode<T extends ts.Node>(predicate:(node:ts.Node)=>node is T):T{
 let found:T|undefined;const visit=(node:ts.Node)=>{if(!found&&predicate(node))found=node;if(!found)ts.forEachChild(node,visit)};visit(workspaceTree);assert.ok(found,'Actual production callback missing');return found;
}
function transitionHarness(){
 let mode='design',tool='select';const gates:Array<()=>void>=[];const errors:string[]=[];
 const context=vm.createContext({canvasView:'design',viewIntentRef:{current:0},stopFollowingRef:{current:()=>{}},useCallback:(callback:unknown)=>callback,flushScreenDirectEdits:()=>new Promise<void>(resolve=>gates.push(resolve)),setCanvasV2FeedbackPicking:()=>{},setToolbarMenu:()=>{},setObjectMenu:()=>{},setLayersOpen:()=>{},setEditingNodeId:()=>{},updateTool:(next:string)=>{tool=next},previewSelection:{current:{ids:[]}},selectedElements:[],screenEditNodeId:undefined,setScreenEditNodeId:()=>{},setSelectedElements:()=>{},setSelectionTarget:()=>{},setHoveredElement:()=>{},updateCanvasView:(next:string)=>{mode=next;context.canvasView=next},setMutationError:(error:string)=>errors.push(error),selectElement:()=>{},sceneElementsRef:{current:[]},engine:{readNativeScene:()=>undefined}});
 const run=(source:string)=>vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 for(const name of ['setTool','setCanvasView']){const node=findNode((item):item is ts.VariableDeclaration=>ts.isVariableDeclaration(item)&&item.name.getText(workspaceTree)===name);run('const '+node.getText(workspaceTree)+';');}
 const declaration=findNode((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(workspaceTree)==='changeCanvasView');run('const '+declaration.getText(workspaceTree)+';');
 const draw=findNode((node):node is ts.JsxOpeningElement=>ts.isJsxOpeningElement(node)&&node.tagName.getText(workspaceTree)==='button'&&node.attributes.properties.some(item=>ts.isJsxAttribute(item)&&item.name.getText(workspaceTree)==='title'&&item.initializer?.getText(workspaceTree)==='"Draw freehand"'));
 const click=draw.attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(workspaceTree)==='onClick') as ts.JsxAttribute;assert.ok(click.initializer&&ts.isJsxExpression(click.initializer)&&click.initializer.expression);
 return{switchMode:(next:string)=>run(`changeCanvasView('${next}')`)as Promise<void>,draw:()=>run('('+click.initializer!.getText(workspaceTree).slice(1,-1)+')()'),release:()=>{assert.ok(gates.length);gates.shift()!()},state:()=>({mode,tool}),errors};
}

test('a new Draw intent wins over an older mode switch waiting for screen edits to flush',async()=>{
 const h=transitionHarness(),pending=h.switchMode('preview');h.draw();assert.deepEqual(h.state(),{mode:'design',tool:'draw'});h.release();await pending;
 assert.deepEqual(h.state(),{mode:'design',tool:'draw'},'Late save completion must not switch to Preview and replace a newer drawing tool intent');assert.deepEqual(h.errors,[]);
});

test('an ordinary mode switch waits for screen edits before clearing selection and entering Preview',async()=>{
 const h=transitionHarness(),pending=h.switchMode('preview');assert.deepEqual(h.state(),{mode:'design',tool:'select'});h.release();await pending;assert.deepEqual(h.state(),{mode:'preview',tool:'select'});
});

function pointerTerminationHarness(kind:'direct'|'connector'|'drawing'='direct'){
 const mutations:unknown[]=[],events=new Map<string,(event:unknown)=>void>();let restores=0,ends=0;
 const original={nodeId:'a',kind:'shape',locked:false,bounds:{x:100,y:200,width:300,height:150}},draft={...original.bounds,x:120};
 const directGestureRef={current:{kind:'move',pointerId:7,original:original.bounds,originals:[original],draftBounds:draft,draftElementBounds:{a:draft},draftRotations:{},hasDragged:true}as unknown};
 if(kind!=='direct')directGestureRef.current=undefined;
 const drawingGestureRef={current:kind==='drawing'?{pointerId:7,points:[{x:100,y:200},{x:120,y:200}]}:undefined},connectorGestureRef={current:kind==='connector'?{pointerId:7,kind:'curve',control:{x:100,y:200},draftPoint:{x:120,y:200}}:undefined};
 const context=vm.createContext({directGestureRef,drawingGestureRef,connectorGestureRef,drawingPreviewRef:{current:{style:{visibility:'visible'},removeAttribute:()=>{if(kind==='drawing')restores++}}},resetConnectorGesturePreview:()=>{restores++},flushDirectGesturePreview:()=>{},restoreDirectGesturePreview:()=>{restores++},finishDirectGestureChrome:()=>{},submitMutation:(mutation:unknown)=>{mutations.push(mutation);return true},engine:{endHumanEdit:()=>{ends++}},setHumanEditing:()=>{},cancelDirectGesturePreview:()=>{},workspaceRef:{current:{focus:()=>{}}},updateDirectGestureHandlerRef:{current:()=>{}},updateConnectorGestureHandlerRef:{current:()=>{}},updateDrawingGestureHandlerRef:{current:()=>{}},finishDrawingGestureHandlerRef:{current:()=>{}},finishConnectorGestureHandlerRef:{current:()=>{}},canvasView:'design',visualFeedbackActive:false,setCropDraft:()=>{},setConnectorLabelDraft:()=>{},setZoomMenuOpen:()=>{},tidyGestureRef:{current:undefined},setTidyDraft:()=>{},setTool:()=>{},placementRef:{current:undefined},setPlacement:()=>{},selectElement:()=>{},window:{addEventListener:(name:string,callback:(event:unknown)=>void)=>events.set(name,callback),removeEventListener:(name:string)=>events.delete(name)}});
 const run=(source:string)=>vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const end=findNode((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(workspaceTree)==='endHumanEdit');run('const '+end.getText(workspaceTree)+';');
 const finish=findNode((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(workspaceTree)==='finishDirectGesture');run('const '+finish.getText(workspaceTree)+';');context.finishDirectGestureHandlerRef={current:run('finishDirectGesture')};
 for(const name of ['cancelDrawingGesture','finishDrawingGesture','finishConnectorGesture']){const node=findNode((item):item is ts.VariableDeclaration=>ts.isVariableDeclaration(item)&&item.name.getText(workspaceTree)===name);run('const '+node.getText(workspaceTree)+';');}
 context.finishDrawingGestureHandlerRef={current:run('finishDrawingGesture')};context.finishConnectorGestureHandlerRef={current:run('finishConnectorGesture')};
 const effect=findNode((node):node is ts.CallExpression=>ts.isCallExpression(node)&&node.expression.getText(workspaceTree)==='useEffect'&&!!node.arguments[0]?.getText(workspaceTree).includes('const ownsDirect = directGestureRef.current?.pointerId'));
 run('('+effect.arguments[0].getText(workspaceTree)+')()');
 const keydown=findNode((node):node is ts.BinaryExpression=>ts.isBinaryExpression(node)&&node.left.getText(workspaceTree)==='workspaceKeydownHandlerRef.current');const keyboard=run('('+keydown.right.getText(workspaceTree)+')') as (event:unknown)=>void;
 return{escape:()=>keyboard({target:{closest:()=>null},key:'Escape',code:'Escape',preventDefault:()=>{},stopPropagation:()=>{}}),dispatch:(type:string)=>{assert.ok(events.has(type));events.get(type)!({type,pointerId:7,clientX:120,clientY:200,preventDefault:()=>{}})},mutations,restores:()=>restores,ends:()=>ends,active:()=>directGestureRef.current??connectorGestureRef.current??drawingGestureRef.current};
}

test('cancelled pointer transform restores preview and releases human edit without creating a history transaction',()=>{
 const h=pointerTerminationHarness();h.dispatch('pointercancel');assert.equal(h.mutations.length,0,'A cancelled pointer gesture must not commit the last transient transform');assert.equal(h.restores(),1);assert.equal(h.ends(),1);assert.equal(h.active(),undefined);
});

test('completed pointer transform commits once and releases human editing',()=>{
 const h=pointerTerminationHarness();h.dispatch('pointerup');assert.equal(h.mutations.length,1);assert.equal(h.restores(),0);assert.equal(h.ends(),1);assert.equal(h.active(),undefined);
 assert.deepEqual(JSON.parse(JSON.stringify(h.mutations)),[{kind:'batch',label:'Moved 1 selected object.',mutations:[{kind:'move',nodeId:'a',deltaX:20,deltaY:0}]}]);
});

 test('Escape cancels a live direct transform before pointer release without committing hidden movement',()=>{const h=pointerTerminationHarness();h.escape();assert.equal(h.active(),undefined,'Escape must retire the live direct gesture');assert.equal(h.restores(),1);assert.equal(h.ends(),1);h.dispatch('pointerup');assert.equal(h.mutations.length,0);assert.equal(h.ends(),1);});

 test('Workspace presence changes editing activity with live drafts and human edit lifecycle, independently of passive selection',()=>{
 const calls:Array<{activity:string;ids:string[]}>=[];let previous:unknown[]|undefined;
 const context=vm.createContext({canvasView:'design',humanEditing:false,editingNodeId:undefined,cropDraft:undefined,tidyDraft:undefined,connectorLabelDraft:undefined,engine:{running:false},selectedElements:[element('a')],collaborationStatus:{phase:'connected'},collaboration:{enabled:true,selection:(selection:Array<{nodeId:string}>,_mode:string,activity:string)=>calls.push({activity,ids:selection.map(item=>item.nodeId)})},useEffect:(callback:()=>void,deps:unknown[])=>{if(!previous||deps.some((item,i)=>!Object.is(item,previous![i]))){previous=deps;callback();}}});
 const value=findNode((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(workspaceTree)==='collaborativeHumanEditing');
 const effect=findNode((node):node is ts.CallExpression=>ts.isCallExpression(node)&&node.expression.getText(workspaceTree)==='useEffect'&&!!node.arguments[0]?.getText(workspaceTree).includes('collaboration.selection('));
 const render=()=>vm.runInContext(ts.transpileModule(`{const ${value.getText(workspaceTree)};${effect.getText(workspaceTree)};}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 render();assert.deepEqual(calls.map(call=>call.activity),['viewing']);
 for(const field of ['humanEditing','editingNodeId','cropDraft','tidyDraft','connectorLabelDraft']){context[field]=field==='humanEditing'?true:field==='editingNodeId'?'a':{nodeId:'a'};render();assert.equal(calls.at(-1)?.activity,'editing',field+' starts actual editing');context[field]=field==='humanEditing'?false:undefined;render();assert.equal(calls.at(-1)?.activity,'viewing',field+' releases editing after Finish/cancel');}
 assert.ok(calls.every(call=>call.ids.join(',')==='a'),'Editing never widens selection scope');
 context.cropDraft={nodeId:'a',zoom:1};render();const activePackets=calls.length;context.cropDraft={nodeId:'a',zoom:1.1};render();assert.equal(calls.length,activePackets,'A crop preview frame with unchanged activity must not publish presence again');context.cropDraft=undefined;render();
 context.canvasView='preview';context.humanEditing=true;render();assert.equal(calls.at(-1)?.activity,'viewing','Preview never claims native editing');
 });

for(const kind of ['connector','drawing'] as const)test(`${kind} pointercancel retires transient geometry without authoring`,()=>{const h=pointerTerminationHarness(kind);h.dispatch('pointercancel');assert.equal(h.mutations.length,0);assert.equal(h.active(),undefined);assert.equal(h.restores(),1);assert.equal(h.ends(),kind==='connector'?1:0);});
test('Escape cancels a live connector before pointer release and releases its human ownership once',()=>{const h=pointerTerminationHarness('connector');h.escape();assert.equal(h.active(),undefined);assert.equal(h.restores(),1);assert.equal(h.ends(),1);h.dispatch('pointerup');assert.equal(h.mutations.length,0);assert.equal(h.ends(),1);});

test('Preview pointer selection never starts a design gesture or changes the view',()=>{
 const declaration=findNode((node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(workspaceTree)==='forwardedElementPointer');assert.ok(declaration.initializer);
 const code=ts.transpileModule('('+declaration.initializer.getText(workspaceTree)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 for(const blocked of [false,true]){
  const selections:unknown[]=[],element={nodeId:'poster'};let focus=0;
  const callback=vm.runInNewContext(code,{canvasView:'preview',tool:'select',spacePan:false,collaborationReadOnly:blocked,selectionRequestEpochRef:{current:0},selectCanvasElement:(...args:unknown[])=>selections.push(args),workspaceRef:{current:{focus:()=>{focus++;}}},setCanvasView:()=>{throw Error('Preview selection must retain Preview.');},startDirectGesture:()=>{throw Error('Preview must not move or edit objects.');}}) as (event:unknown)=>void;
  for(const phase of ['down','move','up'])callback({phase,pointerId:1,button:0,buttons:phase==='up'?0:1,element,shiftKey:true});
  assert.equal(selections.length,blocked?0:1);assert.equal(focus,blocked?0:1);
  if(!blocked)assert.deepEqual(JSON.parse(JSON.stringify(selections[0])),[element,{additive:true,range:false,directEdit:false}]);
 }
});
