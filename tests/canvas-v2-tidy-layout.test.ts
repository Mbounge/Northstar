import assert from "node:assert/strict";
import test from "node:test";
import { applyCanvasV2NativeSceneMutation, CANVAS_V2_NATIVE_SCENE_SCHEMA, type CanvasV2NativeSceneDocument } from "../lib/canvas-v2/native-scene";
import { canvasV2TidyItems, canvasV2TidyMutation } from "../lib/canvas-v2/tidy-layout";

function board() {
  let scene: CanvasV2NativeSceneDocument = { schema:CANVAS_V2_NATIVE_SCENE_SCHEMA, revisionId:"test",width:12000,height:8000,css:"",nodes:[],rootIds:[] };
  for (let i=0;i<3;i++) scene=applyCanvasV2NativeSceneMutation(scene,{kind:"create",primitive:"text",nodeId:`note-${i}`,x:200+i*20,y:200+i*70,width:160,height:40});
  const items=scene.nodes.filter(n=>n.sourceNodeId?.startsWith("note-")).map(n=>({nodeId:n.sourceNodeId!,bounds:n.geometry}));
  scene=applyCanvasV2NativeSceneMutation(scene,{kind:"group",section:true,groupNodeId:"section",items,bounds:{x:160,y:120,width:300,height:400}});
  return scene;
}

test("tidy excludes section headings and retains all selected content inside its section",()=>{
  const scene=board(), section=scene.nodes.find(n=>n.id==="section")!;
  const items=scene.nodes.filter(n=>n.parentId===section.id).map(n=>({nodeId:n.sourceNodeId!,bounds:{...n.geometry,x:n.geometry.x+160,y:n.geometry.y+120}}));
  const content=canvasV2TidyItems(items,scene);
  assert.equal(content.length,3);
  const mutation=canvasV2TidyMutation(content,scene,80,50);
  const next=applyCanvasV2NativeSceneMutation(scene,mutation), frame=next.nodes.find(n=>n.id==="section")!;
  assert.ok(frame.geometry.width>300);
  for (const item of content) {
    const node=next.nodes.find(n=>n.sourceNodeId===item.nodeId)!;
    assert.equal(node.parentId,"section");
    assert.ok(node.geometry.x+node.geometry.width<=frame.geometry.width);
    assert.ok(node.geometry.y+node.geometry.height<=frame.geometry.height);
  }
  assert.deepEqual(next.nodes.find(n=>n.id==="section-title")?.geometry,scene.nodes.find(n=>n.id==="section-title")?.geometry);
});

test("a selected container and its children never enter tidy as independent duplicate targets",()=>{
  const scene=board(), all=scene.nodes.map(n=>({nodeId:n.sourceNodeId!,bounds:n.geometry}));
  assert.deepEqual(canvasV2TidyItems(all,scene).map(item=>item.nodeId),["section"]);
});
