import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {assertCanvasV2ArtifactDocument} from '../lib/canvas-v2/artifact-safety';
import {parseCanvasV2ChatAttachments,type CanvasV2ChatAttachment} from '../lib/canvas-v2/chat-attachments';
import {northstarRunConfig} from '../lib/canvas-v2/model-catalog';
import {createCanvasV2CommittedRevision} from '../lib/canvas-v2/revisions';
import {encodeSnapshot,decodeSnapshotBlob} from '../lib/canvas-v2/sessions/snapshot';
import {visualFeedbackTextAttachment,type VisualFeedbackCollection} from '../lib/canvas-v2/visual-feedback';
import {importSubagentSnapshot,importSubagentSnapshotBlob,writeSubagentSnapshot} from '../app/canvas-v2-e2e/codex-subagent/snapshot';
import type {NorthstarSnapshot} from '../lib/canvas-v2/sessions/types';

const input=():NorthstarSnapshot=>({schema:1,revision:createCanvasV2CommittedRevision({id:'same-source-revision',createdAt:'2026-10-18T00:00:00Z',document:{html:'<div data-canvas-v2-node-id="one">Human source</div>',css:'.one{color:red}'},evidence:[]}),turns:[],draft:'Human draft',attachments:[],model:'gpt-5.6-luna',effort:'high',viewport:{x:1,y:2,scale:.3},memory:{assets:[],accountPackets:[],accountFlows:[],sourcePages:['Original source'],sourceMedia:[],compositionHistory:[],compositionSequence:1}});
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));

/** Run the actual private decoder/factory declarations with only the existing
 * document validator dependency counted. Validation itself remains real. */
function validators(){
 const text=readFileSync(new URL('../lib/canvas-v2/sessions/snapshot.ts',import.meta.url),'utf8'),source=ts.createSourceFile('snapshot.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const names=['decodeSnapshotWithDocumentCheck','decodeSnapshot','createSnapshotPersistenceDecoder'];
 const code=names.map(name=>{const node=source.statements.find(value=>ts.isFunctionDeclaration(value)&&value.name?.text===name);assert.ok(node);return node.getText(source).replace(/^export /,'')}).join('\n');
 const compiled=ts.transpileModule(code+'\nexports.strict=decodeSnapshot;exports.create=createSnapshotPersistenceDecoder;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={} as {strict:typeof import('../lib/canvas-v2/sessions/snapshot').decodeSnapshot;create:typeof import('../lib/canvas-v2/sessions/snapshot').createSnapshotPersistenceDecoder};let calls=0;
 vm.runInNewContext(compiled,{exports,assertCanvasV2ArtifactDocument:(document:Parameters<typeof assertCanvasV2ArtifactDocument>[0])=>{calls++;return assertCanvasV2ArtifactDocument(document)},parseCanvasV2ChatAttachments,northstarRunConfig,Number,Array,Error});
 return{...exports,calls:()=>calls};
}

function feedback():CanvasV2ChatAttachment[]{
 const collection:VisualFeedbackCollection={schema:'northstar.visual-feedback.v1',imageId:'sheet',columns:1,items:[{id:'note',comment:'Keep these exact words.',label:'Area',worldRect:{x:1,y:2,width:3,height:4},points:[{x:1,y:2},{x:4,y:6}],anchors:[]}]};
 const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm3sAAAAASUVORK5CYII=';
 return[{kind:'image',id:'sheet',name:'Actual1pxsheet',mimeType:'image/png',dataUrl:'data:image/png;base64,'+data,width:1,height:1,byteSize:Buffer.from(data,'base64').length,createdAt:'2026-10-18T00:00:00Z'},visualFeedbackTextAttachment(collection,'comments')];
}

test('actual persistence decoder skips repeat source validation only for exact HTML/CSS/JavaScript while strict decoder always validates',()=>{
 const f=validators(),decode=f.create(),value=input();assert.deepEqual(json(decode(value)),json(value));assert.equal(f.calls(),1);
 value.viewport={x:900,y:-100,scale:.8};value.draft='Newest words';assert.deepEqual(json(decode(value)),json(value));assert.equal(f.calls(),1,'Camera and draft saves must not repeat the full source validator.');
 const cloned=structuredClone(value);decode(cloned);assert.equal(f.calls(),1,'Exact string equality may reuse validation across a new document object.');
 f.strict(value);f.strict(value);assert.equal(f.calls(),3,'Import/restore strict decoding cannot inherit the persistence cache.');
});

test('same revision and same document object still invalidate on source edits; invalid HTML/CSS/JavaScript never become cached successes',()=>{
 const f=validators(),decode=f.create(),value=input(),original=structuredClone(value);decode(value);
 value.revision.document.html+='<p data-canvas-v2-node-id="two">New human text</p>';decode(value);assert.equal(f.calls(),2);
 value.revision.document.css='.one{color:blue}';decode(value);assert.equal(f.calls(),3);
 for(const [key,bad]of [['html','<iframe src="https://example.com"></iframe>'],['css','@import url(https://example.com/x.css);'],['javascript','alert("forbidden")']]as const){const before=value.revision.document[key];value.revision.document[key]=bad;const count=f.calls();assert.throws(()=>decode(value));assert.throws(()=>decode(value));assert.equal(f.calls(),count+2,'A failed source check must not seed the cache.');if(before===undefined)delete value.revision.document.javascript;else value.revision.document[key]=before;decode(value);assert.equal(f.calls(),count+2,'Restoring the last successful exact source may reuse that check.');}
 assert.equal(original.revision.document.html,'<div data-canvas-v2-node-id="one">Human source</div>');
});

test('each persistence validator retains one successful source triple and no cache is shared between mounted instances',()=>{
 const f=validators(),decode=f.create(),a=input(),b=structuredClone(a);b.revision.document.css='.one{color:green}';decode(a);decode(b);decode(a);assert.equal(f.calls(),3,'Returning to an older source must not hit an unbounded history cache.');f.create()(a);assert.equal(f.calls(),4);
});

test('warm source validation never bypasses current snapshot model, viewport, draft, committed state or evidence shape',()=>{
 const f=validators(),decode=f.create(),value=input();decode(value);
 for(const bad of [{...value,model:'unknown-model'},{...value,viewport:{...value.viewport,scale:0}},{...value,draft:null},{...value,turns:null},{...value,revision:{...value.revision,state:'candidate'}},{...value,revision:{...value.revision,evidence:null}}])assert.throws(()=>decode(bad));
 assert.equal(f.calls(),1);assert.deepEqual(json(decode(value)),json(value));
});

test('current draft and historical feedback metadata are revalidated on every cache hit including in-place changes',()=>{
 const f=validators(),decode=f.create(),value=input();value.attachments=feedback();value.turns=[{id:'historical',message:'Review',answer:'Kept',createdAt:'2026-10-18T00:00:00Z',status:'responded',attachments:feedback()}];decode(value);assert.equal(f.calls(),1);
 const draftText=value.attachments[1];assert.equal(draftText.kind,'text');if(draftText.kind!=='text')return;
 const originalText=draftText.text;draftText.text='A different request';assert.throws(()=>decode(value),/comments|feedback|differ/i);draftText.text=originalText;
 const historicalText=value.turns[0].attachments![1];assert.equal(historicalText.kind,'text');if(historicalText.kind!=='text')return;
 const previous=historicalText.visualFeedback;historicalText.visualFeedback=true as unknown as VisualFeedbackCollection;assert.throws(()=>decode(value));historicalText.visualFeedback=previous;
 value.turns[0].attachments!.splice(0,1);assert.throws(()=>decode(value),/image|sheet|feedback/i);value.turns[0].attachments=feedback();assert.doesNotThrow(()=>decode(value));assert.equal(f.calls(),1,'Only source validation is reused; mutable attachment checks still run.');
});

test('cache hits preserve fresh same-ID mutable memory and save exact current contents rather than a cached snapshot',async()=>{
 const f=validators(),decode=f.create(),value=input();decode(value);
 value.memory!.assets=[{id:'same-asset',url:'https://example.com/new.png',label:'New retained item'}];value.memory!.sourcePages=['Third','Second','First'];value.memory!.compositionSequence=4;value.draft='Changed draft';value.turns=[{id:'new-turn',message:'Current human text',createdAt:'2026-10-18T00:00:00Z',status:'responded',answer:'Current reply'}];
 const restored=await decodeSnapshotBlob(await encodeSnapshot(decode(value)));assert.deepEqual(restored,JSON.parse(JSON.stringify(value)));assert.equal(f.calls(),1);
 value.memory!.assets.length=0;value.memory!.sourcePages.reverse();value.memory!.compositionSequence=5;assert.deepEqual(await decodeSnapshotBlob(await encodeSnapshot(decode(value))),JSON.parse(JSON.stringify(value)));assert.equal(f.calls(),1);
});

test('external portable imports, blob reload and legacy synchronous writes remain strict after persistence validation warmed',async()=>{
 const value=input(),decode=validators().create();decode(value);value.revision.document.html='<script>not allowed</script>';const raw=JSON.stringify(value);
 assert.throws(()=>importSubagentSnapshot(raw));await assert.rejects(importSubagentSnapshotBlob(new Blob([raw])));await assert.rejects(decodeSnapshotBlob(new Blob([raw])));
 const writes:string[]=[];assert.equal(writeSubagentSnapshot({getItem:()=>null,setItem:(_key,text)=>writes.push(text),removeItem:()=>undefined},value),false);assert.deepEqual(writes,[]);
});
