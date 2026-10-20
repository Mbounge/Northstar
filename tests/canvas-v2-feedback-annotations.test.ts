import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackBounds,feedbackGestureIsClick,layoutVisualFeedbackBubbles,visualFeedbackBubblesOverlap,parseVisualFeedbackCollection,visualFeedbackText,visualFeedbackTextAttachment,stageVisualFeedbackBatch,assertVisualFeedbackSourcesCurrent,visualFeedbackCovers,VISUAL_FEEDBACK_BATCH,type VisualFeedbackCollection,type VisualFeedbackSummary,type VisualFeedbackBubbleInput,type FeedbackRect} from '../lib/canvas-v2/visual-feedback';
import {parseCanvasV2ChatAttachments,canvasV2ChatAttachmentModelParts,type CanvasV2ChatImageAttachment,type CanvasV2ChatAttachment} from '../lib/canvas-v2/chat-attachments';
import {encodeSnapshot,decodeSnapshot,decodeSnapshotBlob} from '../lib/canvas-v2/sessions/snapshot';
import {createCanvasV2CommittedRevision} from '../lib/canvas-v2/revisions';
import type {NorthstarSnapshot} from '../lib/canvas-v2/sessions/types';
import {canvasV2FeedbackFingerprint} from '../lib/canvas-v2/screen-feedback';

function item(id='note-1'):VisualFeedbackSummary{return{id,comment:'Make only this spacing looser.\nKeep the caption.',label:'Human heading',worldRect:{x:65550,y:65800,width:100,height:60},points:[{x:65550,y:65800},{x:65650,y:65800},{x:65630,y:65860}],anchors:[{nodeId:'screen-a',title:'Main board app',selector:'#headline',sourceFingerprint:'12abcdef',localRect:{x:10,y:20,width:100,height:60}}]}}
function collection(items=[item()]):VisualFeedbackCollection{return{schema:'northstar.visual-feedback.v1',imageId:'contact-sheet-1',columns:2,items}}
function image(id='contact-sheet-1'):CanvasV2ChatImageAttachment{const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlS5wsAAAAASUVORK5CYII=';return{kind:'image',id,name:'Numbered canvas areas',mimeType:'image/png',dataUrl:'data:image/png;base64,'+data,width:1,height:1,byteSize:Buffer.from(data,'base64').length,createdAt:'2026-10-18T12:00:00.000Z'}}

test('ephemeral region bounds use actual world extrema and leave the sampled stroke unchanged',()=>{
  const points=[{x:65560,y:65840},{x:65520,y:65890},{x:65570,y:65810}],before=structuredClone(points);assert.deepEqual(feedbackBounds(points),{x:65520,y:65810,width:50,height:80});assert.deepEqual(points,before);assert.deepEqual(feedbackBounds([{x:3,y:4}],2),{x:3,y:4,width:2,height:2});
  for(const minimum of [0,-1,Infinity,NaN,262145])assert.throws(()=>feedbackBounds(points,minimum));
  for(const bad of [[],Array.from({length:257},()=>({x:0,y:0})),[{x:NaN,y:0}],[{x:0,y:Infinity}],[{x:262145,y:0}]])assert.throws(()=>feedbackBounds(bad));
});

test('distinct comments on the same exact element retain their identities, ordering and literal user text',()=>{
  const first=item('note-z'),second={...item('note-a'),comment:'Keep the photo; change only this underline. <script>literal</script> "quoted" 🙂'},input=collection([first,second]),before=structuredClone(input),checked=parseVisualFeedbackCollection(input);
  assert.equal(checked.items.length,2);assert.deepEqual(checked.items.map(value=>value.id),['note-z','note-a']);assert.equal(checked.items[0].anchors[0].selector,checked.items[1].anchors[0].selector);assert.equal(checked.items[1].comment,second.comment);assert.deepEqual(input,before);
  checked.items[0].points[0].x=4;checked.items[0].anchors[0].localRect!.width=2;assert.deepEqual(input,before,'Validated draft data must not share mutable geometry with the canvas editor.');
});

test('freehand empty-space comments require no fake scene node and preserve the selected world area',()=>{
  const region={...item(),label:'Canvas region',anchors:[]},checked=parseVisualFeedbackCollection(collection([region]));assert.deepEqual(checked.items[0].anchors,[]);assert.deepEqual(checked.items[0].worldRect,region.worldRect);
});

test('the collection validates all identities, coordinate bounds and owner fingerprints before returning any notes',()=>{
  const valid=collection(),original=structuredClone(valid);
  const invalid:unknown[]=[null,{...valid,schema:'wrong'},{...valid,imageId:'../image'},{...valid,columns:0},{...valid,columns:5},{...valid,columns:1.5},{...valid,items:[]},{...valid,items:[item(),item()]},{...valid,items:Array.from({length:25},(_,index)=>item('note-'+index))}];
  for(const delta of [{id:''},{comment:'  \n'},{comment:'x'.repeat(1501)},{label:'x'.repeat(181)},{worldRect:{x:0,y:0,width:0,height:1}},{worldRect:{x:0,y:0,width:1,height:Infinity}},{points:[{x:0,y:NaN}]},{points:Array.from({length:257},()=>({x:0,y:0}))},{anchors:Array.from({length:25},()=>item().anchors[0])},{anchors:[{...item().anchors[0],sourceFingerprint:'not-a-hash'}]},{anchors:[{...item().anchors[0],selector:'x'.repeat(1601)}]},{anchors:[{...item().anchors[0],localRect:{x:0,y:0,width:-1,height:3}}]}])invalid.push({...valid,items:[item(),{...item('bad-2'),...delta}]});
  for(const value of invalid)assert.throws(()=>parseVisualFeedbackCollection(value));assert.deepEqual(valid,original);
});

test('24 areas and 20000 literal comment characters are bounded separately from the final model payload',()=>{
  const areas=Array.from({length:24},(_,index)=>({...item('note-'+index),anchors:[],comment:'x'}));assert.equal(parseVisualFeedbackCollection(collection(areas)).items.length,24);
  const boundary=Array.from({length:14},(_,index)=>({...item('note-'+index),anchors:[],comment:'x'.repeat(index===13?500:1500)}));assert.equal(parseVisualFeedbackCollection(collection(boundary)).items.reduce((total,value)=>total+value.comment.length,0),20000);
  boundary[13].comment+='x';assert.throws(()=>parseVisualFeedbackCollection(collection(boundary)),/too long/);
  const large={...item(),anchors:Array.from({length:24},(_,index)=>({...item().anchors[0],nodeId:'object-'+index+'-'.repeat(1300)}))};assert.doesNotThrow(()=>parseVisualFeedbackCollection(collection([large])));assert.throws(()=>visualFeedbackText(collection([large])),/too much feedback|smaller batches/);
});

test('numbered model context keeps each comment bound to its own local geometry and caps only the text stroke projection',()=>{
  const first={...item(),points:Array.from({length:256},(_,index)=>({x:65550+index,y:65800+index/2}))},second={...item('note-2'),comment:'Make the second region quieter.',worldRect:{x:70100,y:70100,width:30,height:40}},source=collection([first,second]),text=visualFeedbackText(source),rows=text.split('\n').slice(1).map(line=>JSON.parse(line));
  assert.deepEqual(rows.map(row=>row.number),[1,2]);assert.equal(rows[0].comment,first.comment);assert.deepEqual(rows[1].worldRect,second.worldRect);assert.deepEqual(rows[0].anchors[0].localRect,first.anchors[0].localRect);assert.ok(rows[0].stroke.length<=16);assert.equal(source.items[0].points.length,256);assert.match(text,/marks are requests, not changes already applied/);
});

test('visual metadata and its contact sheet survive attachment parsing, snapshot encoding and model transport',async()=>{
  const feedback=collection([item(),item('note-2')]),text=visualFeedbackTextAttachment(feedback,'notes-1'),attachments=parseCanvasV2ChatAttachments([image(),text]);assert.deepEqual(attachments[1].kind==='text'&&attachments[1].visualFeedback,feedback);
  const snapshot:NorthstarSnapshot={schema:1,revision:createCanvasV2CommittedRevision({id:'annotation-draft',document:{html:'<main data-canvas-v2-node-id="canvas"><p data-canvas-v2-node-id="human">Human board</p></main>',css:''},evidence:[],createdAt:'2026-10-18T12:00:00.000Z'}),turns:[],draft:'',attachments,model:'gpt-5.6-luna',effort:'high',viewport:{x:1,y:2,scale:.5}};
  const decoded=await decodeSnapshotBlob(await encodeSnapshot(snapshot));assert.deepEqual(decoded.attachments,attachments);assert.equal(decoded.revision.document.html,snapshot.revision.document.html);const parts=canvasV2ChatAttachmentModelParts(parseCanvasV2ChatAttachments(decoded.attachments));assert.equal(parts.length,2);assert.ok('inlineData'in parts[0]);assert.ok('text'in parts[1]&&parts[1].text.includes(text.text));
});

test('orphan or incorrectly paired visual metadata cannot claim that an absent numbered image is attached',()=>{
  const text=visualFeedbackTextAttachment(collection(),'notes-1');assert.throws(()=>parseCanvasV2ChatAttachments([text]),/image|contact|sheet|pair/i);assert.throws(()=>parseCanvasV2ChatAttachments([image('unrelated-image'),text]),/image|contact|sheet|pair/i);assert.doesNotThrow(()=>parseCanvasV2ChatAttachments([text,image()]));
});

test('visual metadata and model text cannot silently disagree about the comments or numbering',()=>{
  const text=visualFeedbackTextAttachment(collection(),'notes-1'),forged={...text,text:'Change every unrelated screen instead.',charCount:36};let parsed:ReturnType<typeof parseCanvasV2ChatAttachments>;
  try{parsed=parseCanvasV2ChatAttachments([image(),forged])}catch(error){assert.match(error instanceof Error?error.message:String(error),/comments|feedback|metadata|differ/i);return}
  const restored=parsed.find(value=>value.kind==='text');assert.equal(restored?.kind==='text'&&restored.text,text.text,'Either reject inconsistent metadata or regenerate its exact human comment text.');
});

test('a two-slot contact-sheet batch respects the existing attachment cap without mutating earlier attachments',()=>{
  const previous=Array.from({length:6},(_,index)=>({kind:'text' as const,id:'existing-'+index,name:'Existing '+index,mimeType:'text/plain' as const,text:'Human supplied '+index,charCount:16,createdAt:'2026-10-18T12:00:00.000Z'})),before=structuredClone(previous),pair=[image(),visualFeedbackTextAttachment(collection(),'notes-1')];assert.equal(parseCanvasV2ChatAttachments([...previous,...pair]).length,8);assert.throws(()=>parseCanvasV2ChatAttachments([...previous,{...previous[0],id:'existing-7'},...pair]),/up to 8/);assert.deepEqual(previous,before);
});

test('Done staging waits for acknowledgement, preserves the exact batch and propagates rejection without clearing caller notes',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'window'),events=new EventTarget();Object.defineProperty(globalThis,'window',{value:events,configurable:true});
  const batch={entries:[],objects:[],attachments:[image(),visualFeedbackTextAttachment(collection(),'notes-1')]},before=structuredClone(batch);
  try{
    let acknowledge:((value:{ok:boolean;error?:string})=>void)|undefined,settled=false;const accept=(event:Event)=>{const detail=(event as CustomEvent).detail;assert.deepEqual(detail.attachments,batch.attachments);acknowledge=detail.resolve};events.addEventListener(VISUAL_FEEDBACK_BATCH,accept);
    const waiting=stageVisualFeedbackBatch(batch).then(()=>{settled=true});await Promise.resolve();assert.equal(settled,false);acknowledge!({ok:true});await waiting;assert.equal(settled,true);events.removeEventListener(VISUAL_FEEDBACK_BATCH,accept);
    const decline=(event:Event)=>(event as CustomEvent).detail.resolve({ok:false,error:'A source owner changed; all canvas comments remain.'});events.addEventListener(VISUAL_FEEDBACK_BATCH,decline);await assert.rejects(stageVisualFeedbackBatch(batch),/all canvas comments remain/);events.removeEventListener(VISUAL_FEEDBACK_BATCH,decline);assert.deepEqual(batch,before);
  }finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window')}
});

const currentOwner='<section data-canvas-v2-node-id="screen-a"><p>Human title</p></section>';
function currentAnnotations(cssFingerprint?:string){const note=item();note.anchors[0]={...note.anchors[0],sourceFingerprint:canvasV2FeedbackFingerprint(currentOwner),...(cssFingerprint?{cssFingerprint}:{})};return[image(),visualFeedbackTextAttachment(collection([note,{...note,id:'second-comment',comment:'Keep its original drawing.'}]),'current-notes')]}

test('Send validates persisted comment owners without relying on transient selection and permits unrelated board edits',()=>{
  const attachments=currentAnnotations(),before=structuredClone(attachments);assert.doesNotThrow(()=>assertVisualFeedbackSourcesCurrent(attachments,{html:'<main>'+currentOwner+'</main>',css:''}));assert.doesNotThrow(()=>assertVisualFeedbackSourcesCurrent(attachments,{html:'<main><aside data-canvas-v2-node-id="other">Changed unrelated object</aside>'+currentOwner+'</main>',css:'.unrelated{color:blue}'}));assert.deepEqual(attachments,before);assert.equal(attachments[1].kind==='text'&&attachments[1].visualFeedback?.items.length,2);
});

test('source deletion, same-ID replacement and styling changes block stale comments without consuming their attachments',()=>{
  const attachments=currentAnnotations(),before=structuredClone(attachments);
  for(const html of ['',currentOwner.replace('Human title','Replacement owner'),currentOwner.replace('<section ','<section style="opacity:.5" '),currentOwner.replace(/section/g,'article')])assert.throws(()=>assertVisualFeedbackSourcesCurrent(attachments,{html,css:''}),/changed|current version/i);
  assert.deepEqual(attachments,before);
});

test('native CSS fingerprints invalidate changed canvas styling and survive attachment parsing exactly',()=>{
  const css='.native{color:#112233}',attachments=currentAnnotations(canvasV2FeedbackFingerprint(css)),parsed=parseCanvasV2ChatAttachments(attachments);assert.doesNotThrow(()=>assertVisualFeedbackSourcesCurrent(parsed,{html:currentOwner,css}));assert.throws(()=>assertVisualFeedbackSourcesCurrent(parsed,{html:currentOwner,css:css+'\n.native{opacity:.4}'}),/changed/);assert.equal(parsed[1].kind==='text'&&parsed[1].visualFeedback?.items[0].anchors[0].cssFingerprint,canvasV2FeedbackFingerprint(css));
  const invalid=collection();invalid.items[0].anchors[0].cssFingerprint='wrong';assert.throws(()=>parseVisualFeedbackCollection(invalid));
});

test('restored attachment metadata independently rejects an obsolete owner even when no feedback scope survived reload',()=>{
  const restored=parseCanvasV2ChatAttachments(JSON.parse(JSON.stringify(currentAnnotations())));assert.doesNotThrow(()=>assertVisualFeedbackSourcesCurrent(restored,{html:currentOwner,css:''}));assert.throws(()=>assertVisualFeedbackSourcesCurrent(restored,{html:currentOwner.replace('Human title','Edited after Done'),css:''}),/still in chat|current version/);assert.equal(restored.length,2);
});

test('empty-space regional comments do not acquire synthetic source ownership during Send validation',()=>{
  const note={...item(),anchors:[]},attachments=[image(),visualFeedbackTextAttachment(collection([note]),'free-region-notes')];assert.doesNotThrow(()=>assertVisualFeedbackSourcesCurrent(attachments,{html:'<main>Entirely different board</main>',css:'body{background:white}'}));
});

test('a duplicate native owner ID cannot make an unchanged first occurrence authorize an ambiguous comment',()=>{
  assert.throws(()=>assertVisualFeedbackSourcesCurrent(currentAnnotations(),{html:currentOwner+currentOwner,css:''}),/changed|identity|duplicate|current version/i);
});

test('a generated runtime selector stays usable when its complete canonical owner is unchanged',()=>{
  const note=item();note.anchors[0]={...note.anchors[0],selector:'#runtime-only-faceplate',sourceFingerprint:canvasV2FeedbackFingerprint(currentOwner)};const attachments=[image(),visualFeedbackTextAttachment(collection([note]),'dynamic-notes')];assert.ok(!currentOwner.includes('runtime-only-faceplate'));assert.doesNotThrow(()=>assertVisualFeedbackSourcesCurrent(attachments,{html:currentOwner,css:''}));assert.throws(()=>assertVisualFeedbackSourcesCurrent(attachments,{html:currentOwner.replace('Human title','New implementation'),css:''}),/changed/);
});

test('a closed freehand loop is a region even when pointer release returns to the exact starting point',()=>{
  const circle=Array.from({length:17},(_,index)=>({x:65550+80*Math.cos(index/16*Math.PI*2),y:65800+80*Math.sin(index/16*Math.PI*2)}));circle[circle.length-1]={...circle[0]};assert.equal(feedbackGestureIsClick(circle,1),false);assert.equal(feedbackGestureIsClick(circle,.04),false);assert.equal(feedbackGestureIsClick([{x:0,y:0},{x:40,y:30},{x:0,y:0}],1),false);
});

test('zero-length and jitter clicks use screen-space tolerance at every zoom without accepting invalid geometry',()=>{
  const origin={x:65550,y:65800};assert.equal(feedbackGestureIsClick([origin],1),true);assert.equal(feedbackGestureIsClick([origin,{...origin},origin],8),true);assert.equal(feedbackGestureIsClick([origin,{x:origin.x+.49,y:origin.y}],8),true);assert.equal(feedbackGestureIsClick([origin,{x:origin.x+.5,y:origin.y}],8),false);assert.equal(feedbackGestureIsClick([origin,{x:origin.x+90,y:origin.y}],.04),true);assert.equal(feedbackGestureIsClick([origin,{x:origin.x+100,y:origin.y}],.04),false);assert.equal(feedbackGestureIsClick([],1),false);for(const scale of [0,-1,NaN,Infinity])assert.equal(feedbackGestureIsClick([origin],scale),false);assert.equal(feedbackGestureIsClick([origin,{x:NaN,y:0}],1),false);
});

test('removing one feedback batch retains only exactly matching object or child scopes from another batch',()=>{
  const child=currentAnnotations(),whole=item();delete whole.anchors[0].selector;const object=[image(),visualFeedbackTextAttachment(collection([whole]),'object-notes')];assert.equal(visualFeedbackCovers(child,'screen-a','#headline'),true);assert.equal(visualFeedbackCovers(child,'screen-a'),false,'A child comment does not retain whole-object permission.');assert.equal(visualFeedbackCovers(object,'screen-a'),true);assert.equal(visualFeedbackCovers(object,'screen-a','#headline'),false,'Whole-object feedback is independent of a selected child scope.');assert.equal(visualFeedbackCovers(child,'screen-a','#different-child'),false);assert.equal(visualFeedbackCovers(child,'another-screen','#headline'),false);assert.equal(visualFeedbackCovers([image()],'screen-a'),false);
});

function savedAnnotations(attachments:CanvasV2ChatAttachment[]=currentAnnotations(),history:CanvasV2ChatAttachment[]=[]):NorthstarSnapshot{return{schema:1,revision:createCanvasV2CommittedRevision({id:'restored-comments',document:{html:'<main data-canvas-v2-node-id="canvas">'+currentOwner+'</main>',css:'.native{color:#112233}'},evidence:[],createdAt:'2026-10-18T12:00:00.000Z'}),turns:history.length?[{id:'historical-comments',message:'Review this region.',answer:'Preserved.',status:'responded',createdAt:'2026-10-18T12:00:00.000Z',attachments:history}]:[],draft:'Keep this human draft.',attachments,model:'gpt-5.6-luna',effort:'high',viewport:{x:1,y:2,scale:.5}}}
const clearImportError=(error:unknown)=>error instanceof Error&&!(error instanceof TypeError)&&/feedback|comment|area|image|snapshot|saved|text/i.test(error.message);

test('saved drafts reject malformed visual metadata and orphan sheets before the cards can render',()=>{
  const text=visualFeedbackTextAttachment(collection(),'notes-1');for(const attachments of [[{...text,visualFeedback:true}], [{...text,visualFeedback:{schema:'northstar.visual-feedback.v1',imageId:'contact-sheet-1',columns:1}}], [text], [image(),{...text,text:'Contradictory comment'}]]){const snapshot={...savedAnnotations(),attachments},before=structuredClone(snapshot);assert.throws(()=>decodeSnapshot(snapshot),clearImportError);assert.deepEqual(snapshot,before,'A rejected import must not rewrite the source or partial attachments.');}
});

test('historical turn metadata and missing paired sheets are rejected as clear import errors',()=>{
  const text=visualFeedbackTextAttachment(collection(),'notes-1');for(const attachments of [[{...text,visualFeedback:true}],[text],[image(),{...text,text:'A different historical comment'}]]){const snapshot=savedAnnotations([]);snapshot.turns=[{...savedAnnotations([],currentAnnotations()).turns[0],attachments:attachments as CanvasV2ChatAttachment[]}];const before=structuredClone(snapshot);assert.throws(()=>decodeSnapshot(snapshot),clearImportError);assert.deepEqual(snapshot,before);}
});

test('valid visual drafts and historical pairs survive saved-canvas roundtrip without an old history aggregate cap',async()=>{
  const ordinary=Array.from({length:10},(_,index)=>({kind:'text' as const,id:'old-'+index,name:'Old supplied text '+index,mimeType:'text/plain' as const,text:'Historical source '+index,charCount:('Historical source '+index).length,createdAt:'2026-10-18T12:00:00.000Z'})),snapshot=savedAnnotations(currentAnnotations(),[...ordinary,...currentAnnotations()]),before=structuredClone(snapshot);const decoded=await decodeSnapshotBlob(await encodeSnapshot(snapshot));assert.equal(decoded.turns[0].attachments?.length,12);assert.deepEqual(decoded.attachments,snapshot.attachments);assert.deepEqual(decoded.turns[0].attachments,snapshot.turns[0].attachments);assert.equal(decoded.draft,snapshot.draft);assert.deepEqual(decoded.revision.document,snapshot.revision.document);assert.deepEqual(snapshot,before);
});

test('old saved canvases without visual metadata keep their ordinary historical attachments and source',async()=>{
  const ordinary=Array.from({length:10},(_,index)=>({kind:'text' as const,id:'ordinary-'+index,name:'Earlier input '+index,mimeType:'text/plain' as const,text:'Earlier text '+index,charCount:('Earlier text '+index).length,createdAt:'2026-10-18T12:00:00.000Z'})),snapshot=savedAnnotations([],ordinary);delete snapshot.attachments;const restored=await decodeSnapshotBlob(await encodeSnapshot(snapshot));assert.deepEqual(restored,JSON.parse(JSON.stringify(snapshot)));
});

const bubble=(id:string,region:FeedbackRect={x:420,y:250,width:40,height:40}):VisualFeedbackBubbleInput=>({id,region,owner:{x:300,y:150,width:400,height:500},width:224,height:120});
const areaOverlap=(a:FeedbackRect,b:FeedbackRect)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);

test('three readable comments on the same exact glyph keep separate cards and exact-region leaders',()=>{
  const input=[bubble('one'),bubble('two'),bubble('three')],before=structuredClone(input),bounds={x:16,y:80,width:1200,height:800},placed=layoutVisualFeedbackBubbles(input,bounds);assert.deepEqual(placed.map(value=>value.id),['one','two','three']);assert.ok(placed.every(value=>value.visible));
  for(const [index,item] of placed.entries()){assert.ok(item.x>=bounds.x&&item.y>=bounds.y&&item.x+item.width<=bounds.x+bounds.width&&item.y+item.height<=bounds.y+bounds.height);assert.ok(item.x>=input[index].owner.x+input[index].owner.width||item.x+item.width<=input[index].owner.x,'Readable text belongs beside the product when there is room.');assert.ok(item.anchor.x>=input[index].region.x&&item.anchor.x<=input[index].region.x+input[index].region.width&&item.anchor.y>=input[index].region.y&&item.anchor.y<=input[index].region.y+input[index].region.height);for(const other of placed.slice(index+1))assert.equal(areaOverlap(item,other),false,'Same-anchor comments cannot cover one another.');}
  assert.deepEqual(input,before,'Callout placement may not rewrite saved world geometry.');assert.deepEqual(layoutVisualFeedbackBubbles(input,bounds),placed,'A stationary camera must not jitter between placements.');
});

test('comment placement prefers available sides and clamps differently sized cards inside the rail-safe viewport',()=>{
  const bounds={x:256,y:104,width:740,height:540},input=[{...bubble('right-edge'),owner:{x:750,y:180,width:240,height:300},region:{x:850,y:200,width:30,height:40}},{...bubble('tall'),height:200,region:{x:850,y:500,width:30,height:40}}],placed=layoutVisualFeedbackBubbles(input,bounds);assert.ok(placed[0].x+placed[0].width<=750,'A product on the right edge should put its comment on the left.');for(const item of placed)assert.ok(item.x>=bounds.x&&item.y>=bounds.y&&item.x+item.width<=bounds.x+bounds.width&&item.y+item.height<=bounds.y+bounds.height);assert.equal(areaOverlap(placed[0],placed[1]),false);
  const small=layoutVisualFeedbackBubbles([{...bubble('small'),width:280,height:200}],{x:8,y:8,width:180,height:160})[0];assert.equal(small.width,180);assert.equal(small.height,160);assert.ok(small.x>=8&&small.x+small.width<=188&&small.y>=8&&small.y+small.height<=168);
});

test('panning and zooming move leaders with current region geometry while offscreen comments reserve no visible space',()=>{
  const bounds={x:0,y:0,width:2000,height:1200},original=bubble('anchored'),first=layoutVisualFeedbackBubbles([original],bounds)[0],shift={x:100,y:-80},moved={...original,region:{...original.region,x:original.region.x+shift.x,y:original.region.y+shift.y},owner:{...original.owner,x:original.owner.x+shift.x,y:original.owner.y+shift.y}},after=layoutVisualFeedbackBubbles([moved],bounds)[0];assert.equal(after.anchor.x-first.anchor.x,shift.x);assert.equal(after.anchor.y-first.anchor.y,shift.y);
  const zoomed={...original,region:{x:840,y:500,width:80,height:80},owner:{x:600,y:300,width:800,height:1000}},zoom=layoutVisualFeedbackBubbles([zoomed],{x:0,y:0,width:2400,height:1600})[0];assert.ok(zoom.anchor.x>=840&&zoom.anchor.x<=920&&zoom.anchor.y>=500&&zoom.anchor.y<=580);
  const hidden={...bubble('offscreen'),region:{x:-1000,y:-1000,width:40,height:40}},both=layoutVisualFeedbackBubbles([hidden,original],bounds);assert.equal(both[0].visible,false);assert.deepEqual(both[1],first);
});

test('crowded comment detection treats touching edges as readable and requires positive visible overlap',()=>{
  const first={x:10,y:20,width:100,height:80,visible:true};
  assert.equal(visualFeedbackBubblesOverlap([]),false);
  assert.equal(visualFeedbackBubblesOverlap([first]),false);
  assert.equal(visualFeedbackBubblesOverlap([first,{...first,x:110}]),false);
  assert.equal(visualFeedbackBubblesOverlap([first,{...first,y:100}]),false);
  assert.equal(visualFeedbackBubblesOverlap([first,{...first,x:109.5}]),true);
  assert.equal(visualFeedbackBubblesOverlap([first,{...first,x:110,y:100}]),false);
});

test('hidden offscreen comments do not force a scroll column or mutate saved layout geometry',()=>{
  const input=[{x:10,y:20,width:100,height:80,visible:false},{x:10,y:20,width:100,height:80,visible:true}],before=structuredClone(input);
  assert.equal(visualFeedbackBubblesOverlap(input),false);
  assert.equal(visualFeedbackBubblesOverlap([...input,{...input[1],x:60}]),true);
  assert.deepEqual(input,before);
});

test('five comments in a narrow real aperture request a column while the same notes fit separately in a spacious viewport',()=>{
  const input=Array.from({length:5},(_,index)=>({...bubble('narrow-'+index,{x:300,y:250,width:30,height:30}),height:140})),before=structuredClone(input);
  const narrow=layoutVisualFeedbackBubbles(input,{x:208,y:104,width:280,height:404});
  assert.equal(visualFeedbackBubblesOverlap(narrow),true,'A bounded but overlapping layout must not bury readable comments.');
  assert.equal(visualFeedbackBubblesOverlap(layoutVisualFeedbackBubbles(input,{x:16,y:104,width:1400,height:1000})),false);
  assert.deepEqual(layoutVisualFeedbackBubbles(input,{x:208,y:104,width:280,height:404}),narrow,'Unchanged inputs must not toggle crowded mode.');
  assert.deepEqual(input,before);
});
