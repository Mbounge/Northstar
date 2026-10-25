import {findCanvasV2SourceNodeRange} from './source-patch';
import {canvasV2FeedbackFingerprint} from './screen-feedback';
import type {CanvasV2ChatAttachment,CanvasV2ChatTextAttachment} from './chat-attachments';
import type {CanvasV2ScreenFeedbackEntry,CanvasV2ObjectFeedbackTarget} from './screen-feedback';
export const VISUAL_FEEDBACK_START='northstar-visual-feedback-start';
export const VISUAL_FEEDBACK_BATCH='northstar-visual-feedback-batch';
export const VISUAL_FEEDBACK_LIMIT=24;
export type FeedbackPoint={x:number;y:number};
export type FeedbackRect=FeedbackPoint&{width:number;height:number};
export type VisualFeedbackAnchor={nodeId:string;title:string;selector?:string;sourceFingerprint:string;cssFingerprint?:string;localRect?:FeedbackRect};
export type VisualFeedbackSummary={id:string;comment:string;label:string;worldRect:FeedbackRect;points:FeedbackPoint[];anchors:VisualFeedbackAnchor[]};
export type VisualFeedbackCollection={schema:'northstar.visual-feedback.v1';imageId:string;columns:number;items:VisualFeedbackSummary[]};
const point=(value:unknown):FeedbackPoint=>{const p=value as FeedbackPoint;if(!p||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=262144))throw Error('Mark an area inside the canvas.');return{x:p.x,y:p.y}};
export function feedbackBounds(points:readonly FeedbackPoint[],minimum=1):FeedbackRect{if(!points.length||points.length>256||!Number.isFinite(minimum)||minimum<=0||minimum>262144)throw Error('Mark a bounded area first.');const checked=points.map(point),x=Math.min(...checked.map(p=>p.x)),y=Math.min(...checked.map(p=>p.y));return{x,y,width:Math.max(minimum,Math.max(...checked.map(p=>p.x))-x),height:Math.max(minimum,Math.max(...checked.map(p=>p.y))-y)}}
/** A closed circle still draws a stroke even when its end returns to its start. */
export function feedbackGestureIsClick(points:readonly FeedbackPoint[],scale:number):boolean{if(!points.length||!Number.isFinite(scale)||scale<=0)return false;const first=points[0];return points.every(point=>Math.hypot(point.x-first.x,point.y-first.y)*scale<4)}
function rect(value:unknown):FeedbackRect{const r=value as FeedbackRect,p=point(r);if(![r.width,r.height].every(n=>Number.isFinite(n)&&n>0&&n<=262144))throw Error('Choose a measurable feedback area.');return{...p,width:r.width,height:r.height}}
export function parseVisualFeedbackCollection(value:unknown):VisualFeedbackCollection{
 const v=value as VisualFeedbackCollection;if(!v||v.schema!=='northstar.visual-feedback.v1'||typeof v.imageId!=='string'||!/^[\w:-]{1,120}$/.test(v.imageId)||!Number.isInteger(v.columns)||v.columns<1||v.columns>4||!Array.isArray(v.items)||!v.items.length||v.items.length>VISUAL_FEEDBACK_LIMIT)throw Error('Choose up to 24 commented areas.');
 const ids=new Set<string>();let characters=0;
 const items=v.items.map(item=>{if(!item||typeof item.id!=='string'||!/^[\w:-]{1,120}$/.test(item.id)||ids.has(item.id)||typeof item.comment!=='string'||!item.comment.trim()||item.comment.length>1500||typeof item.label!=='string'||item.label.length>180||!Array.isArray(item.points)||item.points.length>256||!Array.isArray(item.anchors)||item.anchors.length>24)throw Error('Each area needs its own comment and identity.');ids.add(item.id);characters+=item.comment.length;const anchors=item.anchors.map(anchor=>{if(!anchor||typeof anchor.nodeId!=='string'||!anchor.nodeId||anchor.nodeId.length>4096||typeof anchor.title!=='string'||anchor.title.length>180||typeof anchor.sourceFingerprint!=='string'||!/^[a-f0-9]{8}$/.test(anchor.sourceFingerprint)||anchor.cssFingerprint!==undefined&&(typeof anchor.cssFingerprint!=='string'||!/^[a-f0-9]{8}$/.test(anchor.cssFingerprint))||anchor.selector!==undefined&&(typeof anchor.selector!=='string'||!anchor.selector||anchor.selector.length>1600))throw Error('Read the original item before adding a comment.');return{nodeId:anchor.nodeId,title:anchor.title,sourceFingerprint:anchor.sourceFingerprint,...(anchor.cssFingerprint?{cssFingerprint:anchor.cssFingerprint}:{}),...(anchor.selector?{selector:anchor.selector}:{}),...(anchor.localRect?{localRect:rect(anchor.localRect)}:{})}});return{id:item.id,comment:item.comment.trim(),label:item.label,worldRect:rect(item.worldRect),points:item.points.map(point),anchors}});
 if(characters>20000)throw Error('These comments are too long to send together. Shorten a comment or split the feedback.');return{schema:v.schema,imageId:v.imageId,columns:v.columns,items};
}
export function visualFeedbackText(collection:VisualFeedbackCollection):string{
 const checked=parseVisualFeedbackCollection(collection);
 const text='Canvas feedback from the user. The attached numbered contact sheet shows the marked regions. Each comment belongs to its numbered region; marks are requests, not changes already applied. World coordinates refer to the canvas; localRect uses the owning screen or object coordinates. Read current source before editing and preserve unrelated human work.\n'+checked.items.map((item,index)=>JSON.stringify({number:index+1,comment:item.comment,label:item.label,worldRect:item.worldRect,stroke:item.points.filter((_,i)=>i%Math.max(1,Math.ceil(item.points.length/16))===0),anchors:item.anchors})).join('\n');
 if(text.length>30000)throw Error('There is too much feedback for one message. Split these comments into smaller batches.');return text;
}
export function visualFeedbackTextAttachment(collection:VisualFeedbackCollection,id:string):CanvasV2ChatTextAttachment{const feedback=parseVisualFeedbackCollection(collection),text=visualFeedbackText(feedback);return{kind:'text',id,name:'Canvas feedback · '+feedback.items.length+' areas',mimeType:'text/plain',text,charCount:text.length,createdAt:new Date().toISOString(),visualFeedback:feedback}}
export function stageVisualFeedbackBatch(input:{entries:CanvasV2ScreenFeedbackEntry[];objects:CanvasV2ObjectFeedbackTarget[];attachments:CanvasV2ChatAttachment[]}):Promise<void>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chat is not ready. Your canvas comments are still here.')),5000);window.dispatchEvent(new CustomEvent(VISUAL_FEEDBACK_BATCH,{detail:{...input,resolve:(result:{ok:boolean;error?:string})=>{clearTimeout(timer);if(result.ok)resolve();else reject(Error(result.error??'Your feedback could not be added.'))}}}))})}

/** Validate the visual snapshot independently of transient UI selection, including restored drafts. */
export function assertVisualFeedbackSourcesCurrent(attachments:readonly CanvasV2ChatAttachment[],source:{html:string;css:string}):void {
 const fingerprints=new Map<string,string|undefined>();let cssFingerprint:string|undefined;
 for(const attachment of attachments){if(attachment.kind!=='text'||!attachment.visualFeedback)continue;
  for(const note of attachment.visualFeedback.items)for(const anchor of note.anchors){
   if(!fingerprints.has(anchor.nodeId)){const range=findCanvasV2SourceNodeRange(source.html,anchor.nodeId);if(range&&findCanvasV2SourceNodeRange(source.html.slice(range.openEnd),anchor.nodeId))throw Error('A commented item has an ambiguous identity. Your feedback is still in chat; repair the duplicate item IDs before sending.');fingerprints.set(anchor.nodeId,range?canvasV2FeedbackFingerprint(source.html.slice(range.start,range.end)):undefined)}
   if(fingerprints.get(anchor.nodeId)!==anchor.sourceFingerprint||(anchor.cssFingerprint&&(cssFingerprint??=canvasV2FeedbackFingerprint(source.css))!==anchor.cssFingerprint))throw Error('A commented item changed. Your feedback is still in chat; mark its current version again before sending.');
  }
 }
}

/** Whole-object and element comments have distinct scopes, even on the same owner. */
export function visualFeedbackCovers(attachments:readonly CanvasV2ChatAttachment[],nodeId:string,selector?:string):boolean {
 return attachments.some(attachment=>attachment.kind==='text'&&attachment.visualFeedback?.items.some(note=>note.anchors.some(anchor=>anchor.nodeId===nodeId&&anchor.selector===selector)));
}

export type VisualFeedbackBubbleInput={id:string;region:FeedbackRect;owner:FeedbackRect;width:number;height:number;position?:FeedbackPoint};
/** A crowded view needs a scrollable column rather than buried comment text. */
export function visualFeedbackBubblesOverlap(items:readonly(FeedbackRect&{visible:boolean})[]):boolean {
 return items.some((a,index)=>a.visible&&items.slice(index+1).some(b=>b.visible&&Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)));
}
/** Place readable comments beside their owner; keep separate comments apart. */
export function layoutVisualFeedbackBubbles(items:readonly VisualFeedbackBubbleInput[],bounds:FeedbackRect){
 const placed:FeedbackRect[]=[];
 // Reserve manual placements before arranging automatic cards around them.
 const pinned=new Map(items.filter(item=>item.position).map(item=>[item.id,{x:Math.max(bounds.x,Math.min(bounds.x+Math.max(0,bounds.width-item.width),item.position!.x)),y:Math.max(bounds.y,Math.min(bounds.y+Math.max(0,bounds.height-item.height),item.position!.y)),width:Math.min(item.width,bounds.width),height:Math.min(item.height,bounds.height)}]));
 placed.push(...pinned.values());
 const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(Math.max(min,max),value));
 const overlap=(a:FeedbackRect,b:FeedbackRect)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
 return items.map(item=>{
  const visible=overlap(item.region,bounds)>0,width=Math.min(item.width,bounds.width),height=Math.min(item.height,bounds.height);
  const right=item.owner.x+item.owner.width+16,left=item.owner.x-width-16;
  const preferred=right+width<=bounds.x+bounds.width?right:left>=bounds.x?left:right;
  const xs=[clamp(preferred,bounds.x,bounds.x+bounds.width-width),clamp(preferred===right?left:right,bounds.x,bounds.x+bounds.width-width)];
  const ys=[item.region.y,...placed.flatMap(rect=>[rect.y+rect.height+10,rect.y-height-10]),bounds.y,bounds.y+bounds.height-height].map(y=>clamp(y,bounds.y,bounds.y+bounds.height-height));
  let best={x:xs[0],y:ys[0],width,height},score=Infinity;
  for(const x of xs)for(const y of ys){const rect={x,y,width,height},next=placed.reduce((sum,other)=>sum+overlap(rect,{x:other.x-5,y:other.y-5,width:other.width+10,height:other.height+10}),0)*100000+Math.abs(y-item.region.y)*2+Math.abs(x-preferred);if(next<score){score=next;best=rect}}
  best=pinned.get(item.id)??best;
  if(visible&&!pinned.has(item.id))placed.push(best);
  const onRight=best.x+width/2>=item.region.x+item.region.width/2;
  return{id:item.id,...best,visible,anchor:{x:onRight?item.region.x+item.region.width:item.region.x,y:item.region.y+Math.min(item.region.height/2,18)},entry:{x:onRight?best.x:best.x+width,y:best.y+Math.min(height/2,24)}};
 });
}
