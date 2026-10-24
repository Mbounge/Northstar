import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {createCanvasV2NativeViewportStore,createCanvasV2WarmViewport,outsideVisibleCanvas} from '../lib/canvas-v2/native-viewport-reuse';
import {canvasV2VisibleWorkspaceBounds,CANVAS_V2_EMPTY_INSETS} from '../lib/canvas-v2/workspace-coordinate-space';
import {canvasV2NativeRenderStyle} from '../lib/canvas-v2/native-render-style';
import * as native from '../lib/canvas-v2/native-scene';
import {SCREEN_ATTRIBUTE} from '../lib/canvas-v2/interactive-screen';
import {MODEL_ATTRIBUTE} from '../lib/canvas-v2/model-object';
import {MEDIA_ATTRIBUTE} from '../lib/canvas-v2/canvas-media';

const bounds={x:60000,y:60000,width:1000,height:700};
test('native viewport checkpoints retain snapshot identity inside a physical guard and publish accumulated pan before settle',()=>{
 for(const scale of [.1,1,2]){
  const store=createCanvasV2NativeViewportStore();let calls=0;const unsubscribe=store.subscribe(()=>{calls++});const input={...bounds,width:1000/scale,height:700/scale};store.update(input,scale);const first=store.getSnapshot();assert.ok(first);input.x=-10;assert.equal(first.bounds.x,60000,'Caller bounds must be copied');
  for(let pixels=1;pixels<=256;pixels++)store.update({...first.bounds,x:60000+pixels/scale},scale);
  assert.equal(store.getSnapshot(),first);assert.equal(calls,1,'Camera frames within a warm guard must not churn subscribers');
  store.update({...first.bounds,x:60000+257/scale},scale);assert.notEqual(store.getSnapshot(),first);assert.equal(calls,2);unsubscribe();store.update({...bounds,x:90000},scale);assert.equal(calls,2);
 }
});
test('forced settle publishes exact camera once; zoom, resize and diagonal jumps update honest mounting bounds',()=>{
 const store=createCanvasV2NativeViewportStore();let calls=0;store.subscribe(()=>{calls++});store.update(bounds,1);const first=store.getSnapshot();store.update({...bounds,x:bounds.x+10},1);assert.equal(store.getSnapshot(),first);store.update({...bounds,x:bounds.x+10},1,true);assert.equal(store.getSnapshot()?.bounds.x,60010);assert.equal(calls,2);store.update({...bounds,x:bounds.x+10},1,true);assert.equal(calls,2,'Identical settle is a no-op');
 store.update({...bounds,width:2000,height:1400},.5);assert.equal(store.getSnapshot()?.scale,.5);store.update({...bounds,width:5000},.5);assert.equal(store.getSnapshot()?.bounds.width,5000);store.update({...bounds,x:100000,y:100000},1);assert.deepEqual(store.getSnapshot(),{bounds:{...bounds,x:100000,y:100000},scale:1});
});
test('invalid camera updates never poison a valid checkpoint',()=>{
 const store=createCanvasV2NativeViewportStore();store.update(bounds,1);const valid=store.getSnapshot();for(const [next,scale]of [[{...bounds,x:NaN},1],[{...bounds,width:0},1],[bounds,0],[bounds,Infinity],[{...bounds,height:-1},1]] as const)store.update(next,scale,true);assert.equal(store.getSnapshot(),valid);
});

const parse=(path:string)=>ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const workspace=parse('components/canvas-v2/canvas-v2-workspace.tsx'),scene=parse('components/canvas-v2/canvas-scene.tsx'),renderer=parse('components/canvas-v2/native-canvas-scene.tsx');
function find<T extends ts.Node>(tree:ts.Node,predicate:(node:ts.Node)=>node is T):T{let result:T|undefined;const visit=(node:ts.Node)=>{if(!result&&predicate(node))result=node;if(!result)ts.forEachChild(node,visit)};visit(tree);assert.ok(result,'Production callback missing');return result;}
const decl=(tree:ts.SourceFile,name:string)=>find(tree,(node):node is ts.VariableDeclaration=>ts.isVariableDeclaration(node)&&node.name.getText(tree)===name);
const run=(code:string,context:vm.Context)=>vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
function prop(tree:ts.SourceFile,name:string,attribute:string){const element=find(tree,(node):node is ts.JsxSelfClosingElement|ts.JsxOpeningElement=>(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(tree)===name);const item=element.attributes.properties.find(value=>ts.isJsxAttribute(value)&&value.name.getText(tree)===attribute);assert.ok(item&&ts.isJsxAttribute(item)&&item.initializer&&ts.isJsxExpression(item.initializer)&&item.initializer.expression);return item.initializer.expression.getText(tree);}
function makeNode(id:string,parentId?:string,x=0):native.CanvasV2NativeSceneNode{return{id,sourceNodeId:id,parentId,childIds:[],order:0,tagName:'div',namespace:'html',layoutMode:'absolute',kind:parentId?'shape':'group',selectable:true,hidden:false,locked:false,canonicalEvidence:false,userEdited:false,lastAuthor:'user',editVersion:0,geometry:{x,y:60000,width:200,height:100,rotation:0,zIndex:0},attributes:{},inlineStyle:{},content:[]};}

/** Actual Workspace preview and JSX prop handoffs feed the actual renderer
 * subscription/bounds selection and NativeNode function. DOM/React scheduling
 * are substituted; domain mounting and warm retention are production code. */
function cameraHarness(){
 const store=createCanvasV2NativeViewportStore(),frames:Array<()=>void>=[];let workspaceStateUpdates=0,nativeNotifications=0,subscribed=false;
 const current={x:-60000,y:-60000,scale:1};const context=vm.createContext({nativeViewportStore:store,canvasV2VisibleWorkspaceBounds,CANVAS_V2_EMPTY_INSETS,workspaceSizeRef:{current:{width:1000,height:700}},viewportRef:{current},pendingViewportRef:{current:undefined},viewportPreviewFrameRef:{current:undefined},stopFollowingRef:{current:()=>{}},useCallback:(value:unknown)=>value,requestAnimationFrame:(callback:()=>void)=>{frames.push(callback);return frames.length},setViewport:()=>{workspaceStateUpdates++},publishViewRef:{current:()=>{}},workspaceSurfaceRef:{current:{style:{transform:''}}},selectionSizeRef:{},measurementHostRef:{},gridOverlayRef:{},zoomPercentageRef:{},contextualToolbarRef:{},activeSelectionBoundsRef:{},atmosphereLayerRef:{},workspaceRef:{}});
 for(const name of ['applyViewportVisual','previewViewport'])run('const '+decl(workspace,name).getText(workspace)+';',context);
 const publicStore=run('('+prop(workspace,'CanvasV2CanvasScene','viewportStore')+')',context);context.props={viewportStore:publicStore};const forwarded=run('('+prop(scene,'CanvasV2NativeCanvasScene','viewportStore')+')',context);assert.equal(forwarded,store,'Every actual JSX handoff must preserve the same store');
 const root=makeNode('root');root.geometry.y=0;const items=Array.from({length:400},(_,i)=>makeNode('tile-'+i,root.id,60000+i*2000));root.childIds=items.map(item=>item.id);root.content=items.map(item=>({kind:'node',id:item.id}));const byId=new Map([root,...items].map(item=>[item.id,item]));
 Object.assign(context,{...native,viewportStore:forwarded,emptyViewportSubscribe:()=>()=>{},emptyViewportSnapshot:()=>undefined,useSyncExternalStore:(subscribe:typeof store.subscribe,getSnapshot:()=>unknown)=>{assert.equal(subscribe,store.subscribe);if(!subscribed){subscribed=true;subscribe(()=>{nativeNotifications++})}return getSnapshot()},fallbackVisibleBounds:bounds,fallbackViewportScale:1,useMemo:(value:()=>unknown)=>value(),selectionProtectedNodeIds:new Set(),warmViewport:{current:createCanvasV2WarmViewport()},byId});
 const decide=()=>run(`{const ${decl(renderer,'liveViewport').getText(renderer)};const ${decl(renderer,'visibleBounds').getText(renderer)};const ${decl(renderer,'viewportScale').getText(renderer)};const ${decl(renderer,'protectedNodeIds').getText(renderer)};const ${decl(renderer,'cullBounds').getText(renderer)};({bounds:cullBounds,scale:viewportScale,protectedNodeIds});}`,context) as {bounds:typeof bounds;scale:number;protectedNodeIds:Set<string>};
 Object.assign(context,{canvasV2NativeRenderStyle,exports:{},require:()=>({jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})}),SCREEN_ATTRIBUTE,MODEL_ATTRIBUTE,MEDIA_ATTRIBUTE,outsideVisibleCanvas,useRef:(value:unknown)=>({current:value}),createElement:(type:string,props:unknown,...children:unknown[])=>({type,props,children}),CANVAS_V2_NATIVE_STACK_BASE:1000,VOID_TAGS:new Set(['img']),optimizedCanvasEvidenceImage:()=>undefined});
 run('const '+decl(renderer,'NATIVE_CHILD_CHUNK_SIZE').getText(renderer)+';',context);
 for(const name of ['camelCaseStyle','reactAttributes'])run(find(renderer,(node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(renderer),context);
 const expression=decl(renderer,'NativeNode').initializer;assert.ok(expression&&ts.isCallExpression(expression));const invoke=run('('+expression.arguments[0].getText(renderer)+')',context) as (props:unknown)=>unknown;
 const render=(id:string)=>{const live=decide();return{node:invoke({node:byId.get(id),byId,visibleBounds:live.bounds,protectedNodeIds:live.protectedNodeIds}),live};};
 return{renderMoved:(id:string,x:number)=>{const live=decide(),source=byId.get(id)!;return invoke({node:{...source,geometry:{...source.geometry,x}},byId,visibleBounds:live.bounds,protectedNodeIds:live.protectedNodeIds}) as {props:{style:Record<string,string>}}},store,preview:(x:number,y=-60000,scale=1)=>{run(`previewViewport({x:${x},y:${y},scale:${scale}});`,context);while(frames.length)frames.shift()!()},render,notifications:()=>nativeNotifications,workspaceUpdates:()=>workspaceStateUpdates};
}

test('actual camera preview reaches native destination tiles before Workspace settle, with bounded scene-only checkpoints',()=>{
 const h=cameraHarness();h.preview(-60000);assert.ok(h.render('tile-0').node);assert.equal(h.render('tile-10').node,null);assert.equal(h.workspaceUpdates(),0);
 h.preview(-80000);const destination=h.render('tile-10');assert.ok(destination.node,'A live destination must mount while the camera is still moving');assert.equal(destination.live.bounds.x,80000);assert.equal(h.workspaceUpdates(),0,'Live culling must not require Workspace camera state each frame');
 const at=h.store.getSnapshot(),notifications=h.notifications();for(let step=1;step<=200;step++)h.preview(-80000-step);assert.equal(h.store.getSnapshot(),at,'200 small camera frames reuse a single checkpoint');assert.equal(h.notifications(),notifications,'Native subscription has no notifications within the guarded window');
 h.preview(-60000);assert.ok(h.render('tile-0').node,'Returning before settle must reveal the original retained tile immediately');assert.equal(h.workspaceUpdates(),0);
});

test('actual image protection follows warm group ownership without protecting every sibling through the scene root',()=>{
 const root=makeNode('root'),group=makeNode('warm-group',root.id),image={...makeNode('warm-image',group.id),kind:'image' as const,tagName:'img'},other={...makeNode('other-image',root.id),kind:'image' as const,tagName:'img'};const byId=new Map([root,group,image,other].map(node=>[node.id,node]));
 const context=vm.createContext({byId,protectedNodeIds:new Set(['root','warm-group']),useMemo:(callback:()=>unknown)=>callback()});const result=run(`{const ${decl(renderer,'protectedImageIds').getText(renderer)};[...protectedImageIds];}`,context);assert.deepEqual(JSON.parse(JSON.stringify(result)),['warm-image']);
});

test('actual ResizeObserver updates native mounting bounds without requiring another camera gesture',()=>{
 const store=createCanvasV2NativeViewportStore();store.update(bounds,1);let notify:()=>void=()=>assert.fail('ResizeObserver unavailable');const element={clientWidth:1000,clientHeight:700,getBoundingClientRect:()=>({left:0,top:0})};
 const context=vm.createContext({nativeViewportStore:store,canvasV2VisibleWorkspaceBounds,CANVAS_V2_EMPTY_INSETS,workspaceRef:{current:element},workspaceOriginRef:{current:{left:0,top:0}},workspaceSizeRef:{current:{width:1000,height:700}},viewportRef:{current:{x:-60000,y:-60000,scale:1}},initialCameraCenteredRef:{current:true},setWorkspaceSize:()=>{},setViewport:()=>assert.fail('Resizing a settled camera must not move it'),window:{addEventListener:()=>{},removeEventListener:()=>{}},ResizeObserver:class{constructor(callback:()=>void){notify=callback}observe(){}disconnect(){}}});
 const effect=find(workspace,(node):node is ts.CallExpression=>ts.isCallExpression(node)&&node.expression.getText(workspace)==='useLayoutEffect'&&!!node.arguments[0]?.getText(workspace).includes('const next = { width: workspace.clientWidth'));
 run('('+effect.arguments[0].getText(workspace)+')()',context);element.clientWidth=3000;element.clientHeight=1000;notify();assert.equal(store.getSnapshot()?.bounds.width,3000);assert.equal(store.getSnapshot()?.bounds.height,1000);assert.equal(store.getSnapshot()?.bounds.x,60000);
});

test('actual NativeNode keeps geometry CSS fresh while reusing normalized source styles',()=>{const h=cameraHarness();h.preview(-60000);const original=h.render('tile-0').node as {props:{style:Record<string,string>}};const moved=h.renderMoved('tile-0',60120);assert.equal(original.props.style['--canvas-v2-native-x'],'60000px');assert.equal(moved.props.style['--canvas-v2-native-x'],'60120px');assert.equal(moved.props.style['--canvas-v2-native-width'],'200px');});

function warmCardBoard(count:number,childrenPerCard:number,image=false){const root=makeNode('board');root.geometry.y=0;const map=new Map([[root.id,root]]);for(let index=0;index<count;index++){const card=makeNode('card-'+index,root.id,(index%20)*300);card.geometry.y=Math.floor(index/20)*185;card.geometry.width=image?300:270;card.geometry.height=image?500:150;if(image){card.kind='image';card.tagName='img';}root.childIds.push(card.id);root.content.push({kind:'node',id:card.id});map.set(card.id,card);for(let child=0;child<childrenPerCard;child++){const text=makeNode(card.id+'-text-'+child,card.id);text.layoutMode='flow';text.kind='text';card.childIds.push(text.id);card.content.push({kind:'node',id:text.id});map.set(text.id,text);}}return map;}

test('Fit-all to100% retains800 lightweight three-node cards without recreating previously visited DOM within the node budget',()=>{
 const map=warmCardBoard(800,2),warm=createCanvasV2WarmViewport();const fit={x:0,y:0,width:6400,height:8000};assert.equal(warm.update(map,fit,.08,0).size,800);const retained=warm.update(map,{x:100000,y:100000,width:1200,height:900},1,1000);assert.equal(retained.size,800,'A low entry cap must not evict cheap cards that fit the2400-node budget');
 assert.equal(warm.update(map,fit,.08,2000).size,800);assert.equal(warm.update(map,{x:100000,y:100000,width:1200,height:900},1,3000).size,800,'Repeated warm returns retain the same eligible source IDs');
});

test('raising the warm entry ceiling preserves complex subtree and decoded-image budgets',()=>{
 const away={x:100000,y:100000,width:1200,height:900},fit={x:0,y:0,width:6400,height:8000},complex=warmCardBoard(800,3),native=createCanvasV2WarmViewport();native.update(complex,fit,.08,0);assert.equal(native.update(complex,away,1,1000).size,600,'Four-node subtrees remain bounded by2400 total retained native nodes');
 const images=warmCardBoard(200,0,true),pixels=createCanvasV2WarmViewport();pixels.update(images,fit,.08,0);assert.equal(pixels.update(images,away,1,1000).size,26,'300×500 images at estimated2x remain bounded below16M decoded pixels');
});
