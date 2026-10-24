import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import type { CanvasV2NativeSceneDocument, CanvasV2NativeSceneNode } from "@/lib/canvas-v2/native-scene";
import { sameCanvasV2NativeRenderedSubtree } from "@/lib/canvas-v2/native-scene-subtree-equality";
import {canvasV2StableRuntimeRenderScene,canvasV2LayerWindow,createCanvasV2WarmViewport,sameNativeViewportPresence} from '../lib/canvas-v2/native-viewport-reuse';

function node(id: string, parentId?: string): CanvasV2NativeSceneNode {
  return {
    id, sourceNodeId: id, parentId, childIds: [], order: 0, tagName: parentId ? "img" : "main",
    namespace: "html", layoutMode: "absolute", kind: parentId ? "image" : "group",
    selectable: true, hidden: false, locked: false, canonicalEvidence: false,
    userEdited: false, lastAuthor: "northstar", editVersion: 0,
    geometry: { x: 0, y: 0, width: 300, height: 500, rotation: 0, zIndex: 0 },
    attributes: parentId ? { src: `https://example.test/${id}.png` } : {},
    inlineStyle: {}, content: [],
  };
}

test('detaching live screens from a plain canvas wrapper keeps their original render parent without changing scene truth',()=>{
 const parent=node('wrapper');parent.geometry.x=100;parent.geometry.y=200;
 const text=node('text',parent.id);parent.content=[{kind:'node',id:text.id}];parent.childIds=[text.id];
 const app=node('app');app.attributes={'data-canvas-v2-screen':'retained source'};app.detachedFromParentId=parent.id;app.detachedFromParentIndex=0;app.geometry.x=450;app.geometry.y=520;
 const scene:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'move',width:2000,height:2000,css:'',rootIds:[parent.id,app.id],nodes:[parent,text,app]};
 const before=structuredClone(scene),tree=canvasV2StableRuntimeRenderScene(scene),rendered=tree.nodes.find(n=>n.id===app.id)!;
 assert.deepEqual(scene,before);assert.deepEqual(tree.rootIds,[parent.id]);assert.equal(rendered.parentId,parent.id);
 assert.equal(rendered.geometry.x+parent.geometry.x,app.geometry.x);assert.equal(rendered.geometry.y+parent.geometry.y,app.geometry.y);
 assert.equal(rendered.attributes,app.attributes);assert.equal(rendered.inlineStyle,app.inlineStyle);
 assert.deepEqual(tree.nodes[0].content,[{kind:'node',id:app.id},{kind:'node',id:text.id}]);
 for(const styles of [{overflow:'hidden'},{transform:'scale(2)'},{opacity:'.5'}] as Array<Record<string,string>>){
  const unsafe={...scene,nodes:[{...parent,inlineStyle:styles},text,app]};assert.equal(canvasV2StableRuntimeRenderScene(unsafe),unsafe,'unsafe ancestry must retain its existing paint semantics');
 }
 const ordinary={...scene,nodes:[parent,text,{...app,attributes:{}}]};assert.equal(canvasV2StableRuntimeRenderScene(ordinary),ordinary);
});

test("a manual move refreshes only the changed native subtree", () => {
  const root = node("root");
  root.content = [{ kind: "node", id: "first" }, { kind: "node", id: "second" }];
  root.childIds = ["first", "second"];
  const first = node("first", root.id);
  const second = node("second", root.id);
  const before = new Map([root, first, second].map((item) => [item.id, item]));
  const nextRoot = { ...root, childIds: [...root.childIds], content: [...root.content] };
  const nextFirst = { ...first, geometry: { ...first.geometry, x: 80 } };
  const nextSecond = { ...second, geometry: { ...second.geometry }, attributes: { ...second.attributes } };
  const after = new Map([nextRoot, nextFirst, nextSecond].map((item) => [item.id, item]));

  assert.equal(sameCanvasV2NativeRenderedSubtree(root, nextRoot, before, after), false);
  assert.equal(sameCanvasV2NativeRenderedSubtree(first, nextFirst, before, after), false);
  assert.equal(sameCanvasV2NativeRenderedSubtree(second, nextSecond, before, after), true);
});

test("content, styling, and parent namespace remain visible to reconciliation", () => {
  const root = node("root");
  root.content = [{ kind: "node", id: "first" }];
  root.childIds = ["first"];
  const first = node("first", root.id);
  const before = new Map([root, first].map((item) => [item.id, item]));
  const changedStyle = { ...first, inlineStyle: { color: "red" } };
  const styled = new Map([root, changedStyle].map((item) => [item.id, item]));
  assert.equal(sameCanvasV2NativeRenderedSubtree(root, root, before, styled), false);

  const changedParent = { ...root, namespace: "svg" as const };
  const parentChanged = new Map([changedParent, first].map((item) => [item.id, item]));
  assert.equal(sameCanvasV2NativeRenderedSubtree(first, first, before, parentChanged), false);
});

test('camera commits reuse unchanged mounted tiles but refresh entering and leaving overscan',async()=>{
 const {sameNativeViewportPresence,outsideVisibleCanvas}=await import('../lib/canvas-v2/native-viewport-reuse');
 const root=node('root'),tile=node('tile','root'),map=new Map([root,tile].map(n=>[n.id,n]));
 root.childIds=[tile.id];root.content=[{kind:'node',id:tile.id}];
 const bounds={x:0,y:0,width:800,height:600},near={...bounds,x:100},far={...bounds,x:1500};
 assert.equal(sameNativeViewportPresence(tile,tile,map,map,bounds,near,false,false),true);
 assert.equal(sameNativeViewportPresence(tile,tile,map,map,bounds,far,false,false),false);
 assert.equal(sameNativeViewportPresence(tile,tile,map,map,far,bounds,false,false),false);
 assert.equal(sameNativeViewportPresence(root,root,map,map,bounds,near,false,false),false,'roots must propagate bounds to independently culled children');
 assert.equal(sameNativeViewportPresence(tile,tile,map,map,bounds,far,true,true),true,'selected work remains mounted');
 assert.equal(sameNativeViewportPresence(tile,tile,map,map,far,far,false,true),false,'selecting a culled object remounts it');
 for(const attribute of ['data-canvas-v2-screen','data-canvas-v2-model']){
  const live={...tile,attributes:{[attribute]:'retained-source'}};
  assert.equal(sameNativeViewportPresence(live,live,map,map,bounds,far,false,false),true,'live runtimes keep their mounted state');
 }
 const movedRoot={...root,geometry:{...root.geometry,x:2000}},moved=new Map([[root.id,movedRoot],[tile.id,tile]]);
 assert.equal(sameNativeViewportPresence(tile,tile,map,moved,bounds,bounds,false,false),false,'moving a root can change child presence even when the camera did not move');
 assert.equal(outsideVisibleCanvas({...tile,layoutMode:'flow'},root,far),false,'flow layout is never culled by this shortcut');
 const grandchild=node('grandchild','tile');
 assert.equal(outsideVisibleCanvas(grandchild,tile,far),false,'nested content stays owned by its independently positioned parent');
});

test('camera commits reuse root leaves without hiding authored updates or newly added children', async () => {
  const { sameNativeViewportPresence } = await import('../lib/canvas-v2/native-viewport-reuse');
  const bounds = { x: 0, y: 0, width: 800, height: 600 }, far = { ...bounds, x: 5000 };
  const preview = { ...node('preview'), attributes: { 'data-canvas-v2-screen': 'original-source' } };
  const before = new Map([[preview.id, preview]]);
  assert.equal(sameNativeViewportPresence(preview, preview, before, before, bounds, far, false, false), true);
  const updated = { ...preview, attributes: { 'data-canvas-v2-screen': 'updated-source' } };
  const after = new Map([[updated.id, updated]]);
  assert.equal(sameCanvasV2NativeRenderedSubtree(preview, updated, before, after), false, 'source edits must still render');
  const child = node('child', preview.id);
  for (const grouped of [
    { ...preview, childIds: [child.id] },
    { ...preview, content: [{ kind: 'node' as const, id: child.id }] },
  ]) {
    const groupedMap = new Map([[preview.id, grouped], [child.id, child]]);
    assert.equal(sameNativeViewportPresence(preview, grouped, before, groupedMap, bounds, far, false, false), false, 'groups must propagate changed bounds');
  }
});

function tiles(...items:CanvasV2NativeSceneNode[]){const root=node('root');root.childIds=items.map(item=>item.id);root.content=items.map(item=>({kind:'node',id:item.id}));return new Map([root,...items].map(item=>[item.id,item]));}
const away={x:1_000_000,y:1_000_000,width:800,height:600};
const viewAt=(x:number)=>({x,y:0,width:10,height:10});

test('prewarming uses a consistent physical margin at10%,100% and200% zoom',()=>{
 for(const scale of [0.1,1,2]){
  const bounds={x:0,y:0,width:800/scale,height:600/scale};
  for(const [distance,expected] of [[767,true],[769,false]] as const){const tile=node('tile','root');tile.geometry.x=bounds.width+distance/scale;const warm=createCanvasV2WarmViewport();assert.equal(warm.update(tiles(tile),bounds,scale,0).has('tile'),expected,`${distance}CSSpx at scale${scale}`);}
 }
});

test('warm revisit cache retains stable tiles and expires only after its maximum quiet age',()=>{
 const tile=node('tile','root'),map=tiles(tile),warm=createCanvasV2WarmViewport({prewarmPixels:0,maxAgeMs:60_000});
 assert.equal(warm.update(map,viewAt(0),1,0).has('tile'),true);assert.equal(warm.update(map,away,1,2000).has('tile'),true);
 assert.equal(warm.update(map,away,1,60_000).has('tile'),true);assert.equal(warm.update(map,away,1,60_001).has('tile'),false);
 warm.update(map,viewAt(0),1,70_000);assert.equal(warm.update(map,away,1,120_000).has('tile'),true);warm.clear();assert.equal(warm.update(map,away,1,120_001).has('tile'),false);
});

test('warm entry budget evicts least-recently visited tiles and a revisit refreshes recency',()=>{
 const items=['a','b','c'].map((id,index)=>{const item=node(id,'root');item.geometry.x=index*10_000;return item;}),map=tiles(...items),warm=createCanvasV2WarmViewport({prewarmPixels:0,maxEntries:2,maxPixels:1e12,maxNodes:100});
 items.forEach((item,index)=>warm.update(map,viewAt(item.geometry.x),1,index));
 assert.deepEqual([...warm.update(map,away,1,4)].sort(),['b','c']);warm.update(map,viewAt(10_000),1,5);warm.update(map,viewAt(0),1,6);assert.deepEqual([...warm.update(map,away,1,7)].sort(),['a','b']);
});

test('warm budgets charge complete subtree nodes and estimated decoded image pixels, while visible work stays mounted',()=>{
 const group={...node('group','root'),kind:'group' as const,childIds:['child'],content:[{kind:'node' as const,id:'child'}]},child=node('child','group');const map=tiles(group);map.set(child.id,child);
 for(const limits of [{maxNodes:1,maxPixels:1e12},{maxNodes:100,maxPixels:599_999}]){const warm=createCanvasV2WarmViewport({...limits,prewarmPixels:0});assert.equal(warm.update(map,viewAt(0),1,0).has('group'),true,'Visible content is independent of the offscreen budget.');assert.equal(warm.update(map,away,1,1).has('group'),false);}
 const exact=createCanvasV2WarmViewport({maxNodes:2,maxPixels:600_000,prewarmPixels:0});exact.update(map,viewAt(0),1,0);assert.equal(exact.update(map,away,1,1).has('group'),true);
});

test('live screen and model descendants protect their containing group outside all warm budgets',()=>{
 for(const attribute of ['data-canvas-v2-screen','data-canvas-v2-model']){const group={...node('group','root'),kind:'group' as const,childIds:['live'],content:[{kind:'node' as const,id:'live'}]},live={...node('live','group'),attributes:{[attribute]:'exact-source'}};const map=tiles(group);map.set(live.id,live);const warm=createCanvasV2WarmViewport({maxEntries:0,maxNodes:0,maxPixels:0,maxAgeMs:0});const protectedIds=warm.update(map,away,1,90_000);for(const id of ['root','group','live'])assert.equal(protectedIds.has(id),true,`${id} must not unmount the live${attribute} subtree.`);}
});

test('source-cloned scene revisions retain stable IDs without hiding changed attributes from reconciliation',()=>{
 const tile=node('tile','root'),before=tiles(tile),warm=createCanvasV2WarmViewport({prewarmPixels:0});warm.update(before,viewAt(0),1,0);
 const copied=new Map([...before].map(([id,item])=>[id,structuredClone(item)])),next=copied.get('tile')!;next.attributes.src='https://example.test/updated.png';next.inlineStyle.opacity='.75';
 assert.equal(warm.update(copied,away,1,10).has('tile'),true);assert.equal(sameCanvasV2NativeRenderedSubtree(tile,next,before,copied),false,'Warm mounting cannot freeze old attributes or style.');assert.equal(next.attributes.src,'https://example.test/updated.png');
});

test('warm costs refresh from new geometry and children and removed source nodes cannot linger',()=>{
 const tile=node('tile','root'),initial=tiles(tile),warm=createCanvasV2WarmViewport({prewarmPixels:0,maxPixels:1_000_000,maxNodes:2});warm.update(initial,viewAt(0),1,0);
 const enlarged=structuredClone(tile);enlarged.geometry.width=1000;assert.equal(warm.update(tiles(enlarged),away,1,1).has('tile'),false,'Old cheap geometry must not bypass the pixel budget.');
 warm.update(initial,viewAt(0),1,2);const expanded=structuredClone(tile);expanded.childIds=['one','two'];expanded.content=expanded.childIds.map(id=>({kind:'node',id}));const children=tiles(expanded);for(const id of expanded.childIds)children.set(id,node(id,'tile'));assert.equal(warm.update(children,away,1,3).has('tile'),false,'New descendants must be charged.');
 warm.update(initial,viewAt(0),1,4);assert.equal(warm.update(tiles(),away,1,5).has('tile'),false);assert.equal(warm.update(initial,away,1,6).has('tile'),false,'Reintroduced source IDs have no stale prior visit.');
});

test('actual NativeNode memo comparator reuses a root leaf across new warm sets without hiding changed source, geometry or child mounting',()=>{
 const text=readFileSync(new URL('../components/canvas-v2/native-canvas-scene.tsx',import.meta.url),'utf8'),source=ts.createSourceFile('scene.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression:ts.Expression|undefined;
 const visit=(item:ts.Node)=>{if(ts.isVariableDeclaration(item)&&item.name.getText(source)==='NativeNode'&&item.initializer&&ts.isCallExpression(item.initializer))expression=item.initializer.arguments[1];ts.forEachChild(item,visit);};visit(source);assert.ok(expression);
 const code=ts.transpileModule(`const compare=${expression.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 type Props={node:CanvasV2NativeSceneNode;byId:Map<string,CanvasV2NativeSceneNode>;visibleBounds:{x:number;y:number;width:number;height:number};protectedNodeIds:Set<string>};
 const compare=new Function('sameNativeViewportPresence','sameCanvasV2NativeRenderedSubtree',`${code};return compare;`)(sameNativeViewportPresence,sameCanvasV2NativeRenderedSubtree) as (before:Props,after:Props)=>boolean;
 const leaf=node('live');leaf.attributes={'data-canvas-v2-screen':'original-source'};const map=new Map([[leaf.id,leaf]]),bounds={x:0,y:0,width:800,height:600},before:Props={node:leaf,byId:map,visibleBounds:bounds,protectedNodeIds:new Set(['live'])};
 assert.equal(compare(before,{...before,visibleBounds:{...bounds,y:5000},protectedNodeIds:new Set(['live','other-warm-item'])}),true,'A new warm-set identity must not rerender the unchanged root leaf.');
 for(const changed of [{...leaf,attributes:{'data-canvas-v2-screen':'updated-source'}},{...leaf,geometry:{...leaf.geometry,x:50}},{...leaf,childIds:['new-child'],content:[{kind:'node' as const,id:'new-child'}]}])assert.equal(compare(before,{...before,node:changed,byId:new Map([[leaf.id,changed]]),protectedNodeIds:new Set(['live'])}),false,'Authored changes or new children must still reconcile.');
 const child=node('child','group'),group={...node('group'),childIds:[child.id],content:[{kind:'node' as const,id:child.id}]},groupMap=new Map([group,child].map(item=>[item.id,item])),container:Props={node:group,byId:groupMap,visibleBounds:bounds,protectedNodeIds:new Set(['group'])};
 assert.equal(compare(container,{...container,protectedNodeIds:new Set(['group','child'])}),false,'Native roots must propagate changed descendant mounting protection.');
});


test('Layers windows cover the visible rows with bounded overscan at top, middle and end',()=>{
 assert.deepEqual(canvasV2LayerWindow(176,0,350),{start:0,end:15,height:5632});
 const middle=canvasV2LayerWindow(176,3200,350);assert.equal(middle.start,96);assert.equal(middle.end,115);
 const end=canvasV2LayerWindow(176,999999,350);assert.equal(end.end,176);assert.ok(end.start<=165);assert.ok(end.end-end.start<=20);
 for(const scroll of [0,1,31,32,3199,3200,5282]){const w=canvasV2LayerWindow(176,scroll,350);assert.ok(w.start*32<=scroll);assert.ok(w.end*32>=Math.min(5632,scroll+350));assert.ok(w.end-w.start<=20);}
});
test('Layers window clamps stale scroll after shrink and handles empty, short and resized lists',()=>{
 assert.deepEqual(canvasV2LayerWindow(0,5000,350),{start:0,end:0,height:0});
 assert.deepEqual(canvasV2LayerWindow(3,5000,350),{start:0,end:3,height:96});
 assert.deepEqual(canvasV2LayerWindow(176,-100,350),canvasV2LayerWindow(176,0,350));
 assert.deepEqual(canvasV2LayerWindow(176,0,64),{start:0,end:6,height:5632});
 assert.deepEqual(canvasV2LayerWindow(10,200,100,20,1),{start:4,end:10,height:200});
});
