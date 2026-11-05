import {validateCanvasV2Screen,type CanvasV2InteractiveScreen} from './interactive-screen';
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
