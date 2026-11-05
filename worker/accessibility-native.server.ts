import {firefox,type Browser,type Frame,type Page} from 'playwright-core';
import {createHash,randomUUID} from 'node:crypto';
import {buildCanvasV2ScreenRuntime} from '../lib/canvas-v2/interactive-screen-runtime';
import {encodeCanvasV2Screen} from '../lib/canvas-v2/interactive-screen';
import {validateAccessibilityNativeRequest,type AccessibilityNativeResult} from '../lib/canvas-v2/accessibility-native';

let occupied=false;
/** This is a product capability, not a paid author/reviewer call. Each job gets
 * a fresh sandboxed Firefox context, no user session/cookies and no network. */
export async function runAccessibilityNative(raw:unknown,signal:AbortSignal):Promise<AccessibilityNativeResult>{
 const input=validateAccessibilityNativeRequest(raw),encoded=encodeCanvasV2Screen(input.screen);
 if(createHash('sha256').update(encoded).digest('hex')!==input.sourceSha256)throw Error('The native review source hash does not match its actual retained page.');
 if(occupied)throw Error('A native accessibility review is already running. Try again when it finishes.');
 signal.throwIfAborted();occupied=true;let browser:Browser|undefined;
 const errors:string[]=[],steps:unknown[]=[],captures:AccessibilityNativeResult['captures']=[];
 const abort=()=>{void browser?.close().catch(()=>{})},deadline=setTimeout(abort,50000);signal.addEventListener('abort',abort,{once:true});
 try{
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG','FONTCONFIG_PATH','PLAYWRIGHT_BROWSERS_PATH'].flatMap(key=>process.env[key]?[[key,process.env[key]!]]:[]));
  browser=await firefox.launch({headless:true,timeout:20000,env,firefoxUserPrefs:{'media.peerconnection.enabled':false,'network.dns.disablePrefetch':true,'network.prefetch-next':false}});signal.throwIfAborted();
  const context=await browser.newContext({viewport:{width:input.screen.width,height:input.screen.height},serviceWorkers:'block',acceptDownloads:false,permissions:[],reducedMotion:'reduce'});
  await context.route('**/*',route=>route.abort());
  context.on('page',page=>{if(mainPage&&page!==mainPage)void page.close();});let mainPage:Page|undefined;
  const page=await context.newPage();mainPage=page;page.setDefaultTimeout(3500);
  page.on('pageerror',error=>errors.push(error.message.slice(0,500)));
  const token=randomUUID(),runtime=buildCanvasV2ScreenRuntime(input.screen,new Map(Object.entries(input.assets??{})),token,undefined,input.fontCss??'');
  // The exact production preview runtime remains opaque to its parent.
  await page.setContent('<!doctype html><html><body style="margin:0"><iframe title="Native course review" sandbox="allow-scripts allow-forms" style="width:100vw;height:100vh;border:0"></iframe></body></html>');
  await page.locator('iframe').evaluate((element,source)=>{(element as HTMLIFrameElement).srcdoc=source;},runtime);
  const frame=await waitForFrame(page,signal);
  await frame.locator('body').waitFor();await frame.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
  await frame.evaluate(()=>{const events:Array<{type:string;trusted:boolean;key?:string;target:string}>=[];(window as unknown as {__northstarNativeEvents:unknown}).__northstarNativeEvents=events;for(const type of ['keydown','keyup','pointerdown','pointerup','click','input','focusin'])document.addEventListener(type,event=>{events.push({type, trusted:event.isTrusted,key:'key' in event?String(event.key):undefined,target:(event.target as Element)?.id||(event.target as Element)?.tagName||''});if(events.length>240)events.shift();},true);});
  const capture=async(label:string)=>{const bytes=await page.screenshot({type:'jpeg',quality:75});if(captures.reduce((n,item)=>n+item.image.length,0)+bytes.length*1.34>6_000_000)throw Error('Native review pixels exceed the bounded evidence size.');captures.push({label,image:'data:image/jpeg;base64,'+bytes.toString('base64'),tree:(await frame.locator('body').ariaSnapshot()).slice(0,35000)});};
  const initialSettlement=await settleNativeGeometry(frame,80);if(!initialSettlement.settled)throw Error('The initial native page did not reach a stable observable layout.');
  await capture('Initial working page');
  for(const [index,step] of input.steps.entries()){
   signal.throwIfAborted();const before=await focusState(frame);let settlement:Awaited<ReturnType<typeof settleNativeGeometry>>|undefined;
   const expectations={text:step.expectedText,focus:step.expectedFocus,hidden:step.expectedHidden};
   try{
   if(step.action==='key')await page.keyboard.press(step.key!);
   if(step.action==='click')await frame.locator(step.selector!).click();
   if(step.action==='type'){await frame.locator(step.selector!).click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(step.value??'');}
   if(step.action==='pointer-cancel'){const control=frame.locator(step.selector!);await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();if(!box)throw Error('The pointer-cancel target is not visible.');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(2,2);await page.mouse.up();}
   if(step.action==='resize')await page.setViewportSize({width:step.width!,height:step.height!});
   settlement=await settleNativeGeometry(frame,step.action==='key'&&['PageUp','PageDown','Home','End'].includes(step.key??'')?120:48);
   if(!settlement.settled)throw Error('Native scroll or layout did not settle at step '+(index+1));
   if(step.expectedText){const matches=await frame.getByText(step.expectedText,{exact:false}).all();let visible=false;for(const match of matches.slice(0,100)){const observation=await match.evaluate(inspectNativeElementVisibility);if(observation.withinViewport&&observation.unobscured){visible=true;break;}}if(!visible)throw Error('Expected text is not visibly in the viewport at step '+(index+1));}
   if(step.expectedHidden&&await frame.locator(step.expectedHidden).isVisible())throw Error('Expected hidden component is visible at step '+(index+1));
   const after=await focusState(frame);
   if(step.expectedFocus){const target=frame.locator(step.expectedFocus);if(!await target.evaluate(element=>element===document.activeElement))throw Error('Expected focus missing at step '+(index+1));const observation=await target.evaluate(inspectNativeElementVisibility);if(!observation.withinViewport||!observation.unobscured)throw Error('Expected focus is outside the visible viewport or obscured at step '+(index+1));}
   const events=await frame.evaluate(()=>{const events=(window as unknown as {__northstarNativeEvents:unknown[]}).__northstarNativeEvents;return events.splice(0);});
   steps.push({step:index+1,action:step.action,key:step.key,label:step.label,selector:step.selector,before,after,events,settlement,expectations,expectationsSatisfied:true});
   if(step.action==='checkpoint')await capture(step.label??'Checkpoint '+(index+1));
   }catch(error){signal.throwIfAborted();const message=error instanceof Error?error.message:String(error);errors.push(message.slice(0,500));steps.push({step:index+1,action:step.action,key:step.key,label:step.label,selector:step.selector,before,after:await focusState(frame),settlement,expectations,expectationsSatisfied:false,error:message.slice(0,500)});break;}
  }
  await capture('Final working state');
  return {kind:'northstar-native-accessibility',id:randomUUID(),nodeId:input.nodeId,sourceVersion:input.sourceVersion,sourceSha256:input.sourceSha256,checkedAt:new Date().toISOString(),browser:'Firefox '+browser.version(),steps,captures,errors,limits:'Actual browser-native input and rendered pixels of the saved production runtime in a network-denied private context. Browser ARIA snapshots are not NVDA, JAWS or VoiceOver output. Only the supplied journey is covered; external resources/media and unvisited states remain unverified. No conformance certificate.'};
 }finally{clearTimeout(deadline);signal.removeEventListener('abort',abort);await browser?.close().catch(()=>{});occupied=false;}
}
async function waitForFrame(page:Page,signal:AbortSignal){for(let i=0;i<60;i++){signal.throwIfAborted();const frame=page.frames().find(frame=>frame.parentFrame()&&frame.url()==='about:srcdoc');if(frame)return frame;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('The isolated authored page did not load.');}
async function focusState(frame:Frame){return frame.evaluate(()=>{const e=document.activeElement as HTMLElement|null;if(!e)return null;const r=e.getBoundingClientRect(),style=getComputedStyle(e),pointX=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),pointY=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)),cover=document.elementFromPoint(pointX,pointY);return {tag:e.tagName,id:e.id,role:e.getAttribute('role'),text:(e.innerText||e.getAttribute('aria-label')||'').slice(0,220),rect:{x:r.x,y:r.y,width:r.width,height:r.height},withinViewport:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,centerCovered:!!cover&&cover!==e&&!e.contains(cover),outline:style.outline,boxShadow:style.boxShadow,activeDescendant:e.getAttribute('aria-activedescendant'),expanded:e.getAttribute('aria-expanded')};});}

/** Read only: actual viewport intersection and hit-testing after native input.
 * This rejects DOM-only visibility for offscreen/fully covered assertions;
 * checkpoint pixels still require independent visual interpretation. */
export function inspectNativeElementVisibility(element:Element){
 const doc=element.ownerDocument,win=doc.defaultView!;
 let rect=element.getBoundingClientRect();
 if((!rect.width||!rect.height)&&element.textContent){const range=doc.createRange();range.selectNodeContents(element);rect=range.getBoundingClientRect();}
 let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(win.innerWidth,rect.right),bottom=Math.min(win.innerHeight,rect.bottom),painted=rect.width>0&&rect.height>0;
 for(let current:Element|null=element;current;current=current.parentElement){
  const style=win.getComputedStyle(current);
  if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)painted=false;
  if(current!==element){const bounds=current.getBoundingClientRect();if(/^(auto|scroll|hidden|clip)$/.test(style.overflowX)){left=Math.max(left,bounds.left+current.clientLeft);right=Math.min(right,bounds.left+current.clientLeft+current.clientWidth);}if(/^(auto|scroll|hidden|clip)$/.test(style.overflowY)){top=Math.max(top,bounds.top+current.clientTop);bottom=Math.min(bottom,bounds.top+current.clientTop+current.clientHeight);}}
 }
 const withinViewport=painted&&right>left&&bottom>top;
 const points=withinViewport?[[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]].map(([x,y])=>[left+(right-left)*x,top+(bottom-top)*y]):[];
 const unobscured=points.some(([x,y])=>{const hit=doc.elementFromPoint(x,y);return !!hit&&(hit===element||element.contains(hit)||hit.contains(element));});
 return {withinViewport,unobscured,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},intersection:withinViewport?{left,top,right,bottom}:null};
}

/** Observe actual scroll and focus geometry until stable, rather than sampling
 * while browser-native smooth scrolling is still moving between steps. */
export async function observeNativeGeometrySettlement(options:{minMs:number;stableMs:number;maxMs:number}){
 const started=performance.now(),root=document.scrollingElement??document.documentElement;
 const scrollers=[...document.querySelectorAll('*')].filter(element=>element!==root&&(element.scrollHeight>element.clientHeight+1||element.scrollWidth>element.clientWidth+1)).slice(0,64);
 const sample=()=>{const active=document.activeElement as HTMLElement|null,r=active?.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY,contentWidth:root.scrollWidth,contentHeight:root.scrollHeight,maxX:Math.max(0,root.scrollWidth-innerWidth),maxY:Math.max(0,root.scrollHeight-innerHeight)},scrollers:scrollers.map(element=>({tag:element.tagName,id:element.id,x:element.scrollLeft,y:element.scrollTop,maxX:Math.max(0,element.scrollWidth-element.clientWidth),maxY:Math.max(0,element.scrollHeight-element.clientHeight)})),focus:active?{tag:active.tagName,id:active.id,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null}:null};};
 return await new Promise<{settled:boolean;durationMs:number;samples:number;observation:ReturnType<typeof sample>}>(resolve=>{
  let observed=sample(),signature=JSON.stringify(observed),stableSince=started,samples=1,frameId=0,finished=false;
  const finish=(settled:boolean)=>{if(finished)return;finished=true;clearTimeout(deadline);cancelAnimationFrame(frameId);resolve({settled,durationMs:Math.round(performance.now()-started),samples,observation:observed});};
  const tick=()=>{const now=performance.now();observed=sample();samples++;const next=JSON.stringify(observed);if(next!==signature){signature=next;stableSince=now;}if(now-started>=options.minMs&&now-stableSince>=options.stableMs)finish(true);else frameId=requestAnimationFrame(tick);};
  const deadline=setTimeout(()=>finish(false),options.maxMs);frameId=requestAnimationFrame(tick);
 });
}
async function settleNativeGeometry(frame:Frame,minMs:number){return await frame.evaluate(observeNativeGeometrySettlement,{minMs,stableMs:64,maxMs:1200});}
