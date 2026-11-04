'use client';
import type { AxeResults, Result } from 'axe-core';
import { bindScreenCaptureImages, screenCaptureImageDataUrls } from './screen-capture-resources';
import { ACCESSIBILITY_MANUAL_CHECKS, retainAccessibilityBaseline, type AccessibilityFinding, type ScreenAccessibilityReport } from './screen-accessibility';

export interface AccessibilitySnapshot { html: string; css: string; width: number; height: number; language?: string; direction?: string; title?: string; rootClass?:string;rootStyle?:string; captureImages?: unknown }
const AXE_VERSION='4.14.0',AXE_SHA256='20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878';
let axeSource:Promise<string>|undefined;
function loadAxeSource(){
  if(!axeSource)axeSource=fetch(`/northstar/vendor/axe-core-${AXE_VERSION}.min.js`,{credentials:'omit',signal:AbortSignal.timeout(15000)}).then(async response=>{if(!response.ok)throw Error('The pinned accessibility engine could not load.');const source=await response.text();if(await accessibilityDigest(source)!==AXE_SHA256)throw Error('Accessibility engine integrity check failed.');return source;}).catch(error=>{axeSource=undefined;throw error});
  return axeSource;
}
const history = new Map<string, ScreenAccessibilityReport[]>();
const previewEpochs=new Map<string,number>(),changedPreviews=new Set<string>();
export const ACCESSIBILITY_REPORT_EVENT = 'northstar-accessibility-report';
export const ACCESSIBILITY_STATE_EVENT = 'northstar-accessibility-preview-changed';
export function screenAccessibilityHistory(nodeId: string) { return history.get(nodeId) ?? []; }
export function screenAccessibilityEpoch(nodeId:string){return previewEpochs.get(nodeId)??0;}
export function screenAccessibilityStateChanged(nodeId:string){return changedPreviews.has(nodeId);}
export function invalidateScreenAccessibilityState(nodeId:string){
  previewEpochs.set(nodeId,screenAccessibilityEpoch(nodeId)+1);
  if(previewEpochs.size>100){const oldest=previewEpochs.keys().next().value!;previewEpochs.delete(oldest);changedPreviews.delete(oldest);}
  if(!history.has(nodeId)||changedPreviews.has(nodeId))return;
  changedPreviews.add(nodeId);window.dispatchEvent(new CustomEvent(ACCESSIBILITY_STATE_EVENT,{detail:{nodeId}}));
}
export async function accessibilityDigest(source: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function finding(result: Result): AccessibilityFinding {
  return { rule: result.id, impact: result.impact ?? 'review', description: result.description, help: result.help, helpUrl: result.helpUrl,
    criteria: result.tags.filter(tag => /^wcag\d{3,4}$/.test(tag)),
    nodeCount: result.nodes.length, nodes: result.nodes.slice(0, 12).map(node => ({ selectors: node.target.map(String), html: node.html.slice(0, 2400), explanation: node.failureSummary ?? 'Manual review required.', measurements: [...node.any, ...node.all, ...node.none].map(check => ({ id: check.id, message: check.message, data: check.data })) })) };
}
/** Drop active content before constructing the private opaque-origin audit frame.
 * Authored JS never executes here. CSP also forbids network, navigation and forms. */
export function sanitizeAccessibilitySnapshot(snapshot: AccessibilitySnapshot) {
  if(!Number.isInteger(snapshot.width)||snapshot.width<240||snapshot.width>1920||!Number.isInteger(snapshot.height)||snapshot.height<240||snapshot.height>1600)throw Error('Use a bounded authored viewport.');
  if (snapshot.html.length > 1_000_000 || snapshot.css.length > 1_000_000) throw Error('The accessibility snapshot exceeds the bounded audit size.');
  const replacements = screenCaptureImageDataUrls(snapshot.captureImages);
  const doc = new DOMParser().parseFromString(bindScreenCaptureImages(snapshot.html, replacements), 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,link,meta,base,[data-northstar-feedback-overlay]').forEach(node => node.remove());
  const safeResource = (value: string) => /^data:(image\/(png|jpeg|webp|gif)|font\/(ttf|otf|woff|woff2));base64,[A-Za-z0-9+/=]+$/.test(value);
  for (const element of doc.querySelectorAll('*')) for (const attribute of [...element.attributes]) {
    if (/^on/i.test(attribute.name) || ['srcdoc', 'srcset', 'autofocus', 'formaction', 'action'].includes(attribute.name)
      || ['src', 'poster'].includes(attribute.name) && !safeResource(attribute.value)
      || ['href', 'xlink:href'].includes(attribute.name) && !/^(#|https?:|mailto:|tel:)/i.test(attribute.value)) element.removeAttribute(attribute.name);
  }
  doc.querySelectorAll('input[type="password"],input[type="hidden"]').forEach(input=>input.removeAttribute('value'));
  const css = bindScreenCaptureImages(snapshot.css, replacements).replace(/<\/style/gi, '<\\/style');
  return { html: doc.body.outerHTML, css };
}
async function scan(snapshot: AccessibilitySnapshot, clean: {html: string; css: string}, width: number, signal: AbortSignal, axeSource: string) {
  signal.throwIfAborted();
  const frame = document.createElement('iframe'), token = crypto.randomUUID().replaceAll('-', '');
  frame.title = 'Private accessibility audit'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${snapshot.height}px;border:0;pointer-events:none;`;
  const language = (snapshot.language ?? '').replace(/[^a-zA-Z0-9-]/g, '');
  const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const title=escape(snapshot.title??'');
  const script = `${axeSource}\n(async()=>{try{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));const results=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations','incomplete','passes','inapplicable']});parent.postMessage({token:'${token}',results,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth)},'*')}catch(e){parent.postMessage({token:'${token}',error:String(e)},'*')}})();`;
  try {
    return await new Promise<{results: AxeResults; overflow: number}>((resolve, reject) => {
      const finish = (error?: unknown, result?: {results: AxeResults; overflow: number}) => { clearTimeout(timer); window.removeEventListener('message', listener); signal.removeEventListener('abort', abort); if(error)reject(error);else resolve(result!); };
      const listener = (event: MessageEvent) => { if (event.source === frame.contentWindow && event.data?.token === token) finish(event.data.error ? new Error(event.data.error) : undefined, event.data); };
      const abort = () => finish(new DOMException('Accessibility check cancelled.', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('Accessibility check timed out. No pass was recorded.')), 20000);
      window.addEventListener('message', listener); signal.addEventListener('abort', abort, {once: true});
      frame.srcdoc = `<!doctype html><html class="${escape(snapshot.rootClass??'')}" style="${escape(snapshot.rootStyle??'')}"${language ? ` lang="${language}"` : ''}${snapshot.direction === 'rtl' ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${token}'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${clean.css}</style></head>${clean.html}<script nonce="${token}">${script.replace(/<\/script/gi, '<\\/script')}</script></html>`;
      document.body.append(frame);
    });
  } finally { frame.remove(); }
}
export async function auditScreenAccessibility(snapshot: AccessibilitySnapshot, identity: {nodeId: string; encoded: string; sourceVersion: string; title: string}, signal: AbortSignal): Promise<ScreenAccessibilityReport> {
  const clean = sanitizeAccessibilitySnapshot(snapshot);
  const [sourceSha256, domSha256] = await Promise.all([accessibilityDigest(identity.encoded), accessibilityDigest(JSON.stringify({ ...clean, language: snapshot.language, direction: snapshot.direction, rootClass:snapshot.rootClass,rootStyle:snapshot.rootStyle,width: snapshot.width, height: snapshot.height }))]);
  const report: ScreenAccessibilityReport = { schemaVersion: 1, kind: 'northstar-rendered-accessibility', id: crypto.randomUUID(), nodeId: identity.nodeId, title: identity.title, sourceVersion: identity.sourceVersion, sourceSha256, domSha256, checkedAt: new Date().toISOString(), engine: {name: 'axe-core', version: AXE_VERSION}, target: 'WCAG 2.1 A/AA', scope: 'current rendered state; inert semantic snapshot', status: 'check-failed', viewport:{width:snapshot.width,height:snapshot.height}, scans: [], manualChecks: [...ACCESSIBILITY_MANUAL_CHECKS], visual:{...clean,width:snapshot.width,height:snapshot.height,language:snapshot.language,direction:snapshot.direction,rootClass:snapshot.rootClass,rootStyle:snapshot.rootStyle} };
  try {
    const source=await loadAxeSource();
    for (const width of [...new Set([snapshot.width, 320])]) {
      const {results, overflow} = await scan(snapshot, clean, width, signal, source);
      const contrastSamples=results.passes.filter(rule=>rule.id==='color-contrast').flatMap(rule=>rule.nodes).flatMap(node=>[...node.any,...node.all].flatMap(check=>{
        const data=check.data as Record<string,unknown>|undefined;
        return check.id==='color-contrast'&&data&&typeof data.contrastRatio==='number'?[{selectors:node.target.map(String),ratio:data.contrastRatio,foreground:String(data.fgColor??''),background:String(data.bgColor??''),expected:String(data.expectedContrastRatio??'')}]:[];
      })).slice(0,12);
      report.scans.push({ width, height: snapshot.height, violations: results.violations.map(finding), incomplete: results.incomplete.map(finding), passedRules: results.passes.length, passedRuleIds:results.passes.map(rule=>rule.id),contrastSamples, inapplicableRules: results.inapplicable.length, horizontalOverflow: overflow });
    }
    report.status = report.scans.some(scan => scan.violations.length || scan.horizontalOverflow > 1) ? 'issues-found' : 'no-automated-issues';
  } catch (error) { signal.throwIfAborted(); report.error = error instanceof Error ? error.message : 'Accessibility checking failed.'; }
  return report;
}
export function rememberAccessibilityReport(report: ScreenAccessibilityReport) {
  changedPreviews.delete(report.nodeId);
  const reports = retainAccessibilityBaseline(history.get(report.nodeId) ?? [],report);
  history.delete(report.nodeId); history.set(report.nodeId,reports);
  while (history.size > 12) history.delete(history.keys().next().value!);
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_REPORT_EVENT, {detail: report}));
}

export function setCurrentAccessibilityBaseline(nodeId:string){
  const current=history.get(nodeId)?.at(-1);if(!current)return;
  history.set(nodeId,[current]);
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_REPORT_EVENT,{detail:current}));
}
/** Re-sanitize saved evidence on display, even when restored from an imported
 * session. Read-only captures have no script, forms, network or live controls. */
export function accessibilityVisualDocument(capture:NonNullable<ScreenAccessibilityReport['visual']>){
  const clean=sanitizeAccessibilitySnapshot(capture);
  const doc=new DOMParser().parseFromString(clean.html,'text/html');
  doc.body.setAttribute('inert','');
  doc.querySelectorAll('a,area').forEach(el=>{el.removeAttribute('href');el.removeAttribute('target');});
  const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return `<!doctype html><html lang="${escape(capture.language??'')}" dir="${capture.direction==='rtl'?'rtl':'ltr'}" class="${escape(capture.rootClass??'')}" style="${escape(capture.rootStyle??'')}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${clean.css}</style></head>${doc.body.outerHTML}</html>`;
}
export function restoreAccessibilityReports(artifacts:readonly {id:string;dataUrl:string;origin:string}[]){
  for(const artifact of artifacts){
    if(!artifact.id.startsWith('accessibility:')||artifact.origin!=='computed'||artifact.dataUrl.length>5_500_000||!artifact.dataUrl.startsWith('data:application/json;base64,'))continue;
    try{
      const bytes=Uint8Array.from(atob(artifact.dataUrl.slice(29)),c=>c.charCodeAt(0));
      const report=JSON.parse(new TextDecoder().decode(bytes)) as ScreenAccessibilityReport;
      if(report.schemaVersion!==1||report.kind!=='northstar-rendered-accessibility'||typeof report.nodeId!=='string'||typeof report.id!=='string'||!Array.isArray(report.scans)||!Array.isArray(report.manualChecks)||!report.engine||!report.viewport)continue;
      // Ignore duplicate IDs already present in live history; a saved old
      // artifact must not replace a newly checked current state.
      if(!screenAccessibilityHistory(report.nodeId).some(item=>item.id===report.id)){rememberAccessibilityReport(report);invalidateScreenAccessibilityState(report.nodeId);}
    }catch{/* Malformed imported evidence is not accepted as proof. */}
  }
}
