import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasV2NativeSceneNode } from "@/lib/canvas-v2/native-scene";
import { sameCanvasV2NativeRenderedSubtree } from "@/lib/canvas-v2/native-scene-subtree-equality";

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
