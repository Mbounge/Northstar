import assert from "node:assert/strict";
import test from "node:test";
import { MEDIA_ATTRIBUTE, parseCanvasV2PlayableMedia, canvasV2MediaDisplaySize } from "../lib/canvas-v2/canvas-media";
import { applyCanvasV2NativeSceneMutation, copyCanvasV2NativeSelection, pasteCanvasV2NativeClipboard, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from "../lib/canvas-v2/native-scene";
import { validateCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "../lib/canvas-v2/artifact-safety";

test("playable media remains a native object, requires exact provenance and survives copy/paste", () => {
  const empty: CanvasV2NativeSceneDocument = { schema:"canvas-v2.native-scene.v1",revisionId:"media",width:12000,height:8000,nodes:[],rootIds:[],css:"" };
  const media = { version:1,type:"video",src:"https://example.com/movie.mp4",evidenceId:"movie",description:"A human-described onboarding clip" };
  const source = applyCanvasV2NativeSceneMutation(empty, { kind:"batch",label:"Media",mutations:[{kind:"create",primitive:"shape",nodeId:"clip",x:100,y:100,width:480,height:300},{kind:"attribute",nodeId:"clip",name:MEDIA_ATTRIBUTE,value:JSON.stringify(media)}] });
  const document = serializeCanvasV2NativeScene(source);
  const asset = { id:"movie",url:media.src,label:media.description,mimeType:"video/mp4" };
  assert.deepEqual(validateCanvasV2ArtifactDocument(document), []);
  assert.ok(!document.html.includes("<video"));
  assert.ok(document.html.includes("has not watched"));
  assert.ok(validateCanvasV2EvidenceBindings(document, []).length);
  assert.deepEqual(validateCanvasV2EvidenceBindings(document, [asset]), []);
  const clipboard = copyCanvasV2NativeSelection(source, ["clip"], [asset])!;
  assert.deepEqual(clipboard.evidenceAssets, [asset]);
  assert.deepEqual(validateCanvasV2EvidenceBindings(serializeCanvasV2NativeScene(pasteCanvasV2NativeClipboard(source, clipboard, "copy").scene), [asset]), []);
});


test("playable media requires a stable independently editable div", () => {
  const value = JSON.stringify({version:1,type:"video",src:"https://example.com/clip.mp4",evidenceId:"clip",description:"Clip"});
  assert.ok(validateCanvasV2ArtifactDocument({html:`<div data-canvas-v2-media='${value}'></div>`,css:""}).some(f=>f.includes("stable node identity")));
  assert.ok(validateCanvasV2ArtifactDocument({html:`<span data-canvas-v2-node-id="clip" data-canvas-v2-media='${value}'></span>`,css:""}).some(f=>f.includes("ordinary div")));
});


test("media dimensions preserve landscape, portrait and small source frames without letterboxing", () => {
  assert.deepEqual(canvasV2MediaDisplaySize(1920,1080), {width:480,height:270});
  assert.deepEqual(canvasV2MediaDisplaySize(1080,1920), {width:202.5,height:360});
  assert.deepEqual(canvasV2MediaDisplaySize(320,180), {width:320,height:180});
  assert.throws(()=>canvasV2MediaDisplaySize(0,1080));
  assert.throws(()=>canvasV2MediaDisplaySize(Infinity,1080));
});


test("executable media URLs and model-authored players remain rejected", () => {
  assert.throws(() => parseCanvasV2PlayableMedia(JSON.stringify({ version:1,type:"video",src:"javascript:alert(1)",evidenceId:"x",description:"Video" })), /direct hosted/);
  assert.ok(validateCanvasV2ArtifactDocument({ html: '<video src="https://example.com/movie.mp4"></video>', css: "", javascript: "" }).length);
});
