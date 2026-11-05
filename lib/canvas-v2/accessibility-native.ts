import {validateCanvasV2Screen,type CanvasV2InteractiveScreen} from './interactive-screen';
import {screenCaptureImageDataUrls} from './screen-capture-resources';
import {validateAccessibilityCaptureSize} from './screen-accessibility';
export type AccessibilityNativeStep={action:'key'|'click'|'type'|'pointer-cancel'|'checkpoint'|'resize';key?:string;selector?:string;value?:string;label?:string;width?:number;height?:number;expectedText?:string;expectedFocus?:string;expectedHidden?:string};
export interface AccessibilityNativeRequest {nodeId:string;sourceVersion:string;sourceSha256:string;screen:CanvasV2InteractiveScreen;assets?:Record<string,string>;fontCss?:string;steps:AccessibilityNativeStep[];}
export interface AccessibilityNativeResult {kind:'northstar-native-accessibility';id:string;nodeId:string;sourceVersion:string;sourceSha256:string;checkedAt:string;browser:string;steps:unknown[];captures:Array<{label:string;image:string;tree:string}>;errors:string[];limits:string;}
export function validateAccessibilityNativeRequest(value:unknown):AccessibilityNativeRequest{
 const request=value as AccessibilityNativeRequest;
 if(!request||typeof request.nodeId!=='string'||request.nodeId.length>160||typeof request.sourceVersion!=='string'||request.sourceVersion.length>160||!/^[a-f0-9]{64}$/.test(request.sourceSha256)||!Array.isArray(request.steps)||!request.steps.length||request.steps.length>36||!request.screen||request.screen.simulation)throw Error('Supply an authored page identity and 1–36 native browser actions.');
 validateCanvasV2Screen(request.screen);
 if(request.assets&&(typeof request.assets!=='object'||Array.isArray(request.assets)||Object.entries(request.assets).some(([id,bytes])=>!request.screen.referenceAssetIds.includes(id)||typeof bytes!=='string'||!/^data:(?:image\/(?:png|jpeg|gif|webp)|font\/(?:ttf|otf|woff2?));base64,[A-Za-z0-9+/=]+$/.test(bytes))))throw Error('Native resources must be retained, declared image/font bytes.');
 if(request.fontCss!==undefined&&(typeof request.fontCss!=='string'||request.fontCss.length>4_000_000))throw Error('Native font resources exceed their bound.');
 if(JSON.stringify(request).length>9_000_000)throw Error('The native browser request exceeds its retained-resource budget.');
 for(const step of request.steps){
  if(!step||!['key','click','type','pointer-cancel','checkpoint','resize'].includes(step.action)||Object.keys(step).some(key=>!['action','key','selector','value','label','width','height','expectedText','expectedFocus','expectedHidden'].includes(key)))throw Error('Unsupported native browser step.');
  for(const key of ['key','selector','value','label','expectedText','expectedFocus','expectedHidden'] as const)if(step[key]!==undefined&&(typeof step[key]!=='string'||step[key]!.length>(key==='value'?2000:600)))throw Error('Native browser step text exceeds its bound.');
  if(step.action==='key'&&!/^(?:Tab|Shift\+Tab|Enter|Space|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/.test(step.key??''))throw Error('Use a supported native navigation key.');
  if(['click','type','pointer-cancel'].includes(step.action)&&!step.selector)throw Error('Choose an actual control selector.');
  if(step.action==='resize'&&(!Number.isInteger(step.width)||!Number.isInteger(step.height)||step.width!<240||step.width!>1600||step.height!<240||step.height!>1200))throw Error('Use a bounded browser viewport.');
 }
 if(request.steps.filter(step=>step.action==='checkpoint').length>6)throw Error('Use at most six named pixel checkpoints.');
 return structuredClone(request);
}

export type AccessibilityStaticProbeScenario='inventory'|'text-spacing'|'text-resize'|'orientation'|'reflow';
export interface AccessibilityStaticSnapshot {html:string;css:string;width:number;height:number;language?:string;direction?:string;title?:string;rootClass?:string;rootStyle?:string;captureImages?:Record<string,string>;}
export interface AccessibilityStaticProbeRequest extends Omit<AccessibilityNativeRequest,'steps'> {
 mode:'static-probe';steps:[];probe:{scenario:AccessibilityStaticProbeScenario;snapshot:AccessibilityStaticSnapshot;snapshotSha256:string;stateEpoch:number};
}
export interface AccessibilityStaticProbeView {label:string;x:number;y:number;width:number;height:number;image:string;}
export interface AccessibilityStaticProbeCoverage {
 viewport:{width:number;height:number};content:{width:number;height:number};
 capturedRanges:Array<{start:number;end:number}>;uncoveredRanges:Array<{start:number;end:number}>;
 horizontalOverflow:number;nestedScrollRegions:Array<{selector:string;scrollWidth:number;clientWidth:number;scrollHeight:number;clientHeight:number}>;
 nestedScrollRegionCount:number;completeRootVerticalCoverage:boolean;truncated:boolean;limits:string;
}
export interface AccessibilityStaticProbeResult {
 kind:'northstar-static-accessibility-probe';id:string;nodeId:string;sourceVersion:string;sourceSha256:string;snapshotSha256:string;stateEpoch:number;
 scenario:AccessibilityStaticProbeScenario;checkedAt:string;browser:string;width:number;height:number;
 observations:Record<string,unknown>;views:AccessibilityStaticProbeView[];coverage:AccessibilityStaticProbeCoverage;limits:string;
}
export function validateAccessibilityStaticProbeRequest(value:unknown):AccessibilityStaticProbeRequest{
 const request=value as AccessibilityStaticProbeRequest,p=request?.probe,s=p?.snapshot;
 if(!request||request.mode!=='static-probe'||!Array.isArray(request.steps)||request.steps.length||!p||!['inventory','text-spacing','text-resize','orientation','reflow'].includes(p.scenario)||!Number.isInteger(p.stateEpoch)||p.stateEpoch<0||!/^[a-f0-9]{64}$/.test(p.snapshotSha256))throw Error('Supply a bounded static-probe scenario and captured-state identity.');
 // Reuse the saved-source/resource validator without enabling native actions.
 validateAccessibilityNativeRequest({...request,steps:[{action:'checkpoint'}]});
 if(!s||typeof s.html!=='string'||typeof s.css!=='string'||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<240||s.width>1920||s.height<240||s.height>1600)throw Error('Use a bounded semantic snapshot viewport.');
 for(const key of ['language','direction','title','rootClass','rootStyle'] as const)if(s[key]!==undefined&&(typeof s[key]!=='string'||s[key]!.length>10000))throw Error('Static snapshot metadata exceeds its bound.');
 validateAccessibilityCaptureSize(s.html,s.css,screenCaptureImageDataUrls(s.captureImages));
 if(JSON.stringify(request).length>9_000_000)throw Error('The static probe exceeds its retained-resource budget.');
 return structuredClone(request);
}
/** Cover ordinary documents with overlap; tall documents keep both endpoints
 * and explicitly disclose the uncaptured intervals rather than enlarging vh. */
export function staticProbeScrollTargets(contentHeight:number,viewportHeight:number,maxViews=6){
 const end=Math.max(0,Math.ceil(contentHeight-viewportHeight)),stride=Math.max(1,Math.floor(viewportHeight*.8));
 const count=Math.min(maxViews,Math.ceil(end/stride)+1);
 return Array.from({length:count},(_,index)=>count===1?0:Math.round(end*index/(count-1)));
}
export function staticProbeCoverageRanges(contentHeight:number,views:Array<{y:number;height:number}>){
 const ranges=views.map(view=>({start:Math.max(0,view.y),end:Math.min(contentHeight,view.y+view.height)})).filter(range=>range.end>range.start).sort((a,b)=>a.start-b.start),capturedRanges:Array<{start:number;end:number}>=[];
 for(const range of ranges){const last=capturedRanges.at(-1);if(last&&range.start<=last.end+1)last.end=Math.max(last.end,range.end);else capturedRanges.push({...range});}
 let cursor=0;const uncoveredRanges:Array<{start:number;end:number}>=[];
 for(const range of capturedRanges){if(range.start>cursor+1)uncoveredRanges.push({start:cursor,end:range.start});cursor=Math.max(cursor,range.end);}
 if(cursor<contentHeight-1)uncoveredRanges.push({start:cursor,end:contentHeight});
 return {capturedRanges,uncoveredRanges};
}
