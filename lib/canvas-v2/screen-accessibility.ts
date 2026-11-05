import type { ScreenContentPreservation } from './screen-content-preservation';
/** Host-produced evidence, never a model's opinion about its own markup. */
export interface AccessibilityFinding {
  rule: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  criteria: string[];
  nodeCount?: number;
  nodes: Array<{ selectors: string[]; html: string; explanation: string; measurements: unknown[] }>;
}
export interface AccessibilityScan {
  width: number;
  height: number;
  violations: AccessibilityFinding[];
  incomplete: AccessibilityFinding[];
  passedRules: number;
  passedRuleIds?: string[];
  contrastSamples?: Array<{selectors:string[];ratio:number;foreground:string;background:string;expected:string}>;
  inapplicableRules: number;
  horizontalOverflow: number;
}
export interface AccessibilityVisualCapture {
  html:string; css:string; width:number; height:number;
  language?:string; direction?:string; rootClass?:string; rootStyle?:string; captureImages?:Record<string,string>;
}
export interface AccessibilityProbeCapture {
  id:string;scenario:'inventory'|'text-spacing'|'text-resize'|'orientation'|'reflow';
  sourceVersion:string;stateEpoch:number;checkedAt:string;
  width:number;height:number;image:string;views?:import('./accessibility-native').AccessibilityStaticProbeView[];observations:Record<string,unknown>;
}
export function retainedAccessibilityImage(image:unknown):image is string{
  return typeof image==='string'&&image.length<=8_000_000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image);
}
export interface ScreenAccessibilityReport {
  schemaVersion: 1;
  kind: 'northstar-rendered-accessibility';
  id: string;
  nodeId: string;
  title: string;
  sourceVersion: string;
  sourceSha256: string;
  domSha256: string;
  checkedAt: string;
  engine: { name: 'axe-core'; version: string };
  target: 'WCAG 2.1 A/AA'|'WCAG 2.2 A/AA';
  scope: 'current rendered state; inert semantic snapshot';
  status: 'issues-found' | 'no-automated-issues' | 'check-failed';
  viewport: {width:number;height:number};
  scans: AccessibilityScan[];
  manualChecks: string[];
  error?: string;
  visual?:AccessibilityVisualCapture;
  comparisonSourceNodeId?:string;
  nativeVerification?:import('./accessibility-native').AccessibilityNativeResult;
  probeCaptures?:AccessibilityProbeCapture[];
  contentPreservation?:ScreenContentPreservation & {baselineSourceVersion?:string};
}
export const ACCESSIBILITY_MANUAL_CHECKS = [
  'Keyboard: complete every task, check tab order, visible focus, dialogs, and absence of traps in the working preview.',
  'Screen reader: check reading order, announcements, names and state changes with assistive technology.',
  'Content: a person must assess alternative text, link purpose, instructions and preservation of the original teaching material.',
  'Media and zoom: verify captions/transcripts, 200% text resize, 400% zoom and all interactive/error states.',
  'Institutional review: confirm approved course structure and brand guidance. This automated check is not a compliance certificate.',
];

export function accessibilityIssueCount(report: ScreenAccessibilityReport) {
  return report.scans.reduce((count, scan) => count + scan.violations.reduce((n, issue) => n + (issue.nodeCount??issue.nodes.length), 0) + (scan.horizontalOverflow > 1 ? 1 : 0), 0);
}
/** Completion of automated remediation, never certification. Incomplete rules
 * remain in the evidence and must be disclosed for human review, not AI loops. */
export function accessibilityEvidenceAllowsCompletion(input: unknown, sourceVersion: string): boolean {
  const report = input as ScreenAccessibilityReport | undefined;
  return Boolean(report && report.schemaVersion === 1 && report.kind === 'northstar-rendered-accessibility'
    && ['WCAG 2.1 A/AA','WCAG 2.2 A/AA'].includes(report.target) && report.scope==='current rendered state; inert semantic snapshot' && typeof report.nodeId==='string' && Boolean(report.nodeId)
    && report.contentPreservation?.status!=='changed'
    && report.sourceVersion === sourceVersion && report.engine?.name === 'axe-core' && /^\d+\.\d+\.\d+$/.test(report.engine.version)
    && /^[a-f0-9]{64}$/.test(report.sourceSha256) && /^[a-f0-9]{64}$/.test(report.domSha256)
    && Number.isFinite(Date.parse(report.checkedAt)) && report.status === 'no-automated-issues' && !report.error
    && report.viewport?.width >= 240 && report.viewport.height >= 240
    && Array.isArray(report.scans) && report.scans.length === new Set([report.viewport.width,320]).size
    && [report.viewport.width,320].every(width=>report.scans.some(scan=>scan&&scan.width===width&&scan.height===report.viewport.height))
    && report.scans.every(scan => scan && Array.isArray(scan.violations) && scan.violations.length === 0
      && Array.isArray(scan.incomplete) && scan.passedRules > 0 && Number.isFinite(scan.horizontalOverflow) && scan.horizontalOverflow <= 1));
}
export function accessibilityComparison(before: ScreenAccessibilityReport, after: ScreenAccessibilityReport) {
  const keys = (report: ScreenAccessibilityReport) => new Set(report.scans.flatMap(scan => [...scan.violations.flatMap(issue => issue.nodes.map(node => `${scan.width}:${issue.rule}:${node.selectors.join(' > ')}`)),...(scan.horizontalOverflow>1?[`${scan.width}:horizontal-overflow:viewport`]:[])]));
  const previous = keys(before), current = keys(after);
  return { resolved: [...previous].filter(key => !current.has(key)), introduced: [...current].filter(key => !previous.has(key)), remaining: [...current].filter(key => previous.has(key)) };
}

/** Keep the original baseline and the two most recent checks, not just the last
 * three checks. Re-checking a repair must never silently replace its before. */
export function retainAccessibilityBaseline(reports:ScreenAccessibilityReport[],report:ScreenAccessibilityReport){
  const existing=reports.filter(item=>item.id!==report.id);
  if(!existing.length)return [report];
  if(reports[0]?.id===report.id)return [report,...existing].slice(0,3);
  return [existing[0],...existing.slice(1),report].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index).filter((_,index,all)=>index===0||index>=all.length-2);
}
/** Captured HTML/CSS stays with the human evidence. Never inflate model tool
 * responses by sending the full visual document back through the AI loop. */
export function accessibilityEvidenceForModel(report:ScreenAccessibilityReport|undefined){
  if(!report)return undefined;
  const {visual,nativeVerification,probeCaptures,...evidence}=report;
  return {...evidence,visualCaptureAvailable:!!visual,...(probeCaptures?{probeCaptures:probeCaptures.map(({image,views,...capture})=>({...capture,pixelsAvailable:!!image,...(views?{views:views.map(({image,...view})=>({...view,pixelsAvailable:!!image}))}:{})}))}:{}),...(nativeVerification?{nativeVerification:{...nativeVerification,captures:nativeVerification.captures.map(({label,tree})=>({label,tree,pixelsAvailable:true}))}}:{})};
}

/** Retain actual host probe pixels without silently evicting evidence that a
 * recorded decision may reference. A new audit can establish a fresh report. */
export function retainAccessibilityProbe(report:ScreenAccessibilityReport,capture:AccessibilityProbeCapture):ScreenAccessibilityReport{
  if(capture.sourceVersion!==report.sourceVersion||!capture.id||!['inventory','text-spacing','text-resize','orientation','reflow'].includes(capture.scenario)||!retainedAccessibilityImage(capture.image)||!Number.isFinite(Date.parse(capture.checkedAt))||!Number.isInteger(capture.stateEpoch)||capture.stateEpoch<0||!Number.isFinite(capture.width)||!Number.isFinite(capture.height)||capture.width<240||capture.width>1920||capture.height<240||capture.height>1600||!capture.observations||typeof capture.observations!=='object'||Array.isArray(capture.observations)||JSON.stringify(capture.observations).length>500_000)throw Error('The probe does not contain bounded current-source host evidence.');
  if(capture.views!==undefined&&(!Array.isArray(capture.views)||!capture.views.length||capture.views.length>6||capture.views.some(view=>!retainedAccessibilityImage(view.image)||typeof view.label!=='string'||view.label.length>100||!Number.isFinite(view.x)||!Number.isFinite(view.y)||view.x<0||view.y<0||view.width!==capture.width||view.height!==capture.height)))throw Error('The probe view sequence is invalid or exceeds its bound.');
  const captures=[...(report.probeCaptures??[]).filter(item=>item.id!==capture.id),structuredClone(capture)];
  if(captures.length>12||captures.reduce((bytes,item)=>bytes+[...new Set([item.image,...(item.views??[]).map(view=>view.image)])].reduce((n,image)=>n+image.length,0)+JSON.stringify(item.observations).length,0)>8_000_000)throw Error('This checked page has reached its retained probe budget. Start a fresh audit before further inspection; no new receipt was issued.');
  return {...report,probeCaptures:captures};
}

/** Inline retained fonts/media are resources, not markup complexity. Bound
 * both structural markup and the fully expanded document before allocating it. */
export function validateAccessibilityCaptureSize(html:string,css:string,images:ReadonlyMap<string,string>=new Map()){
  const resource=/data:(?:image\/(?:png|jpeg|webp|gif)|font\/(?:ttf|otf|woff|woff2));base64,[A-Za-z0-9+/=]+/g;
  const structural=(source:string)=>source.replace(resource,'retained-resource');
  if(structural(html).length>1_000_000||structural(css).length>1_000_000)throw Error('The accessibility snapshot exceeds the bounded markup size.');
  let expanded=html.length+css.length;
  for(const source of [html,css])for(const match of source.matchAll(/northstar-capture-image:\d+/g)){
    const bytes=images.get(match[0]);if(!bytes)throw Error('A screen capture image is missing.');
    expanded+=bytes.length-match[0].length;
    if(expanded>24_000_000)throw Error('Accessibility capture resources exceed their expanded size budget.');
  }
  if(expanded>24_000_000)throw Error('Accessibility capture resources exceed their expanded size budget.');
}

/** Keep findings downloadable while saving visual documents structurally in
 * session memory, where the snapshot codec can share repeated font/media bytes. */
export function accessibilityEvidenceArtifact(report:ScreenAccessibilityReport):import('./creative/types').NorthstarArtifact {
  const json=JSON.stringify(accessibilityEvidenceForModel(report)),bytes=new TextEncoder().encode(json);
  return {id:`accessibility:${report.nodeId}:${report.id}`,name:'accessibility-findings.json',label:`Accessibility findings · ${report.title}`,mimeType:'application/json',dataUrl:'data:application/json;base64,'+btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')),bytes:bytes.length,origin:'computed',createdAt:report.checkedAt,inputAssetIds:[]};
}
