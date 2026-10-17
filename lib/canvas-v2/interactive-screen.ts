import { isGraetPreviewSection, type GraetPreviewSection } from '../preview/graet-navigation';
import { simulatorForApp } from '../preview/simulator-registry';
import type { CanvasV2EvidenceAsset } from './types';
import type { CanvasV2TrustedRuntimeLibrary } from './screen-trusted-runtime';
import { validateCanvasV2WasmModules, type CanvasV2WasmModule } from './screen-wasm';

export const SCREEN_ATTRIBUTE = 'data-canvas-v2-screen';
export const SCREEN_ASSET_PATTERN = /northstar-asset:([\w%~.!*:-]+)/g;
export const isCanvasV2ScreenAssetId = (id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()) && id.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(id);
export function canvasV2ScreenAssetToken(id: string) { return encodeURIComponent(id).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
function normalizeScreenAssetTokens(source: string, ids: readonly string[]) {
  for (const id of [...ids].sort((a,b) => b.length-a.length)) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    source = source.replace(new RegExp('northstar-asset:' + escaped + '(?![\\w%~.!*:-])', 'g'), 'northstar-asset:' + canvasV2ScreenAssetToken(id));
  }
  return source;
}
export function canvasV2ScreenBoundAssets(screen: CanvasV2InteractiveScreen) {
  const tokens = new Map((screen.referenceAssetIds ?? []).flatMap(id => [[id,id], [canvasV2ScreenAssetToken(id),id]] as Array<[string,string]>));
  return [...new Set([...(screen.html+'\n'+screen.css+'\n'+screen.javascript).matchAll(SCREEN_ASSET_PATTERN)].flatMap(match => tokens.has(match[1]) ? [tokens.get(match[1])!] : []))];
}

/** Exact saved source and actual pixels travel together as immutable reference evidence. */
async function previewDigest(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function canvasV2ScreenPreviewAsset(nodeId: string, screen: CanvasV2InteractiveScreen, pixels: string, encoded = encodeCanvasV2Screen(screen)): Promise<CanvasV2EvidenceAsset> {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(pixels) || pixels.length > 8_000_000) throw new Error('Retain the current preview pixels as bounded JPEG reference material.');
  const [sourceVersion, pixelVersion] = await Promise.all([previewDigest(encoded), previewDigest(pixels)]);
  const capturedAt = new Date().toISOString(), label = screen.simulation?.appName ?? screen.title;
  return { id:`preview:${nodeId}:${sourceVersion}:${pixelVersion}`,url:pixels,label:`${label} · current preview`,...(screen.simulation ? {app:screen.simulation.appName} : {}),mediaType:'image',mimeType:'image/jpeg',capturedAt,tags:['native-preview-reference',`preview-node:${nodeId}`,`preview-source-sha256:${sourceVersion}`,`preview-origin:${screen.simulation ? 'simulation' : 'authored'}`],
    description:'Actual rendered pixels of the retained screen source. Inspect and extract visible reference details; this still is not an interactive replacement or temporal evidence.',
    source:{providerId:'northstar-preview',providerLabel:'Northstar screen preview',sourceId:nodeId,sourceType:'capture',label:`${label} preview snapshot`,retrievedAt:capturedAt,capturedAt,permission:'authorized',freshness:'current-snapshot'} };
}

/** A source reference needs genuine pixels from this exact current saved source. */
export async function canvasV2ScreenReferencePreview(original: {nodeId: string; encoded: string; screen: CanvasV2InteractiveScreen} | undefined, evidence: readonly CanvasV2EvidenceAsset[], identityId: unknown, intent: unknown): Promise<CanvasV2EvidenceAsset> {
  if (!original) throw new Error('Choose an existing authored screen or registered app preview as referenceNodeId. Read the current canvas again.');
  if (intent === 'faithful' && !original.screen.simulation && original.screen.productIdentityId && identityId !== original.screen.productIdentityId) throw new Error('A faithful extraction must retain the source screen’s productIdentityId. Add its genuine preview to that same identity with canvas_product_identity; keep the original screen intact.');
  const sourceTag = `preview-source-sha256:${await previewDigest(original.encoded)}`;
  const preview = evidence.filter(asset => asset.source?.providerId === 'northstar-preview' && asset.source.sourceType === 'capture' && asset.source.sourceId === original.nodeId && asset.source.permission === 'authorized' && asset.mediaType === 'image' && asset.mimeType === 'image/jpeg' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.url) && asset.url.length <= 8_000_000 && asset.tags?.includes('native-preview-reference') && asset.tags.includes(`preview-node:${original.nodeId}`) && asset.tags.includes(sourceTag)).sort((a,b)=>(b.capturedAt || '').localeCompare(a.capturedAt || ''))[0];
  if (!preview) throw new Error('Run canvas_review on the current referenceNodeId first. Its actual pixels must be retained for this exact source; older or unrelated captures cannot authorize a faithful extraction. Inspect the returned captureReferenceAssetId and retain it as identity evidence with canvas_product_identity before creating a faithful component.');
  return preview;
}

export interface CanvasV2InteractiveScreen {
  version: 1;
  device?: 'ios' | 'android' | 'none';
  referenceNodeId?: string;
  referenceIntent?: 'faithful' | 'inspired' | 'original';
  referenceAppearance?: 'light' | 'dark' | 'mixed';
  productIdentityId?: string;
  mockData?: Record<string, unknown>;
  simulation?: { appName: 'GRAET'; section: GraetPreviewSection };
  title: string;
  width: number;
  height: number;
  html: string;
  css: string;
  javascript: string;
  referenceAssetIds: string[];
  /** Explicit host-injected local runtimes. Absent means the default sandbox. */
  trustedRuntimeLibraries?: CanvasV2TrustedRuntimeLibrary[];
  /** Explicit retained wasm32 compute binaries. Never fetched in the sandbox. */
  wasmModules?: CanvasV2WasmModule[];
}

/** Cropped/generated assets retain their original references for product review. */
export function canvasV2ScreenReviewAssets(screen: CanvasV2InteractiveScreen, evidence: readonly CanvasV2EvidenceAsset[]): CanvasV2EvidenceAsset[] {
  const assets = new Map(evidence.map(asset => [asset.id, asset]));
  const visited = new Set<string>(), result: CanvasV2EvidenceAsset[] = [];
  const visit = (id: string, depth: number) => {
    if (visited.has(id) || visited.size >= 128 || depth > 8) return;
    visited.add(id);
    const asset = assets.get(id);
    if (!asset || asset.source?.permission === 'unavailable') return;
    for (const tag of asset.tags ?? []) if (tag.startsWith('derived-from:')) visit(tag.slice('derived-from:'.length), depth + 1);
    result.push(asset);
  };
  for (const id of screen.referenceAssetIds) visit(id, 0);
  return result;
}

/** Source travels with the native object, not a separate mutable runtime record. */
export function encodeCanvasV2Screen(screen: CanvasV2InteractiveScreen): string {
  const bytes = new TextEncoder().encode(JSON.stringify(validateCanvasV2Screen(screen)));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}
export function parseCanvasV2Screen(raw: string): CanvasV2InteractiveScreen {
  if (raw.length > 1_000_000 || !/^[A-Za-z0-9+/=]+$/.test(raw)) throw new Error('Invalid interactive screen source.');
  return validateCanvasV2Screen(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(raw), c => c.charCodeAt(0)))));
}
export function validateCanvasV2Screen(input: unknown): CanvasV2InteractiveScreen {
  const screen = input as CanvasV2InteractiveScreen;
  const wasmModules=validateCanvasV2WasmModules(screen?.wasmModules);
  if(screen?.simulation && wasmModules?.length)throw new Error('Registered simulations cannot load authored WebAssembly.');
  if (typeof screen?.css === 'string' && screen.css.length > 40_000) throw new Error('Screen CSS exceeds 40000 characters. For a full stylesheet use cssMode: replace; for a merge send only added rules. Keep the retained design refinements when consolidating source.');
  if (!screen || screen.version !== 1 || typeof screen.title !== 'string' || !screen.title.trim() || screen.title.length > 180
    || !Number.isInteger(screen.width) || screen.width < 240 || screen.width > 1920
    || !Number.isInteger(screen.height) || screen.height < 240 || screen.height > 1600
    || typeof screen.html !== 'string' || !screen.html.trim() || screen.html.length > 64_000
    || typeof screen.css !== 'string' || screen.css.length > 40_000
    || typeof screen.javascript !== 'string' || screen.javascript.length > 40_000
    || !Array.isArray(screen.referenceAssetIds) || screen.referenceAssetIds.length > 100
    || screen.referenceAssetIds.some(id => !isCanvasV2ScreenAssetId(id)) || screen.referenceAssetIds.reduce((size,id) => size + (typeof id === 'string' ? id.length : 0), 0) > 24000) throw new Error('Invalid interactive screen. Use finite viewport dimensions and bounded HTML/CSS/JavaScript.');
  if (screen.simulation && (screen.simulation.appName !== 'GRAET' || !simulatorForApp(screen.simulation.appName) || !isGraetPreviewSection(screen.simulation.section) || screen.html !== '<div></div>' || screen.css || screen.javascript || screen.referenceAssetIds.length || screen.width !== 383 || screen.height !== 820)) throw new Error('Registered simulations use their approved runtime and fixed logical viewport; do not supply executable source or URLs.');
  if (screen.productIdentityId !== undefined && (typeof screen.productIdentityId !== 'string' || !/^[\w.-]{1,80}$/.test(screen.productIdentityId) || screen.simulation)) throw new Error('Use an existing product identity for authored screens.');
  if (screen.device !== undefined && (!['ios','android','none'].includes(screen.device) || screen.simulation && screen.device !== 'ios')) throw new Error('Choose an iOS, Android or unframed web presentation.');
  if(screen.referenceNodeId!==undefined&&(typeof screen.referenceNodeId!=='string'||!/^[\w.:-]{1,240}$/.test(screen.referenceNodeId)||screen.simulation))throw new Error('Choose a current preview reference for an authored screen.');
  if(screen.referenceIntent!==undefined&&!['faithful','inspired','original'].includes(screen.referenceIntent))throw new Error('Choose faithful, inspired or original reference intent.');
  if (screen.trustedRuntimeLibraries !== undefined && (!Array.isArray(screen.trustedRuntimeLibraries) || screen.trustedRuntimeLibraries.length > 1 || new Set(screen.trustedRuntimeLibraries).size !== screen.trustedRuntimeLibraries.length || screen.trustedRuntimeLibraries.some(library => library !== 'three' && library !== 'three-webgpu') || screen.simulation)) throw new Error('Use only the pinned Three runtime for an explicitly 3D authored screen.');
  if(screen.referenceAppearance!==undefined&&!['light','dark','mixed'].includes(screen.referenceAppearance))throw new Error('Retain the measured reference appearance.');
  if(screen.mockData!==undefined){
    const encoded=JSON.stringify(screen.mockData);
    if(!screen.mockData||typeof screen.mockData!=='object'||Array.isArray(screen.mockData)||!encoded||encoded.length>16000)throw new Error('Use a bounded product mock-data object.');
    const visit=(value:unknown,depth:number):void=>{if(depth>12)throw new Error('Keep mock data within the product depth budget.');if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;if(!value||typeof value!=='object'||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('Use plain JSON mock data.');for(const [key,child] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Use ordinary mock-data keys.');visit(child,depth+1)}};
    visit(screen.mockData,0);
  }
  // Only the host constructs the document and its sandbox. Source assets remain
  // opaque handles, so saved objects never hide expiring blob/signed URLs.
  if (/<\s*(?:script|iframe|object|embed|base|link|meta|html|head|body)\b|\son[a-z]+\s*=|javascript\s*:/i.test(screen.html)) throw new Error('Use a body HTML fragment, CSS and event listeners in javascript. Embedded documents, scripts and event attributes are not supported.');
  if (/@import|<\/style/i.test(screen.css) || /blob:|data:(?:image\/(?:png|jpe?g|webp|gif)|video\/(?:mp4|webm)|font\/(?:ttf|otf|woff|woff2)|model\/gltf-binary);base64/i.test(screen.html + screen.css + screen.javascript)) throw new Error('Use registered northstar-asset handles for images; external stylesheets and temporary image URLs cannot be retained.');
  const refs = new Set(screen.referenceAssetIds);
  const html = normalizeScreenAssetTokens(screen.html, [...refs]), css = normalizeScreenAssetTokens(screen.css, [...refs]), javascript = normalizeScreenAssetTokens(screen.javascript, [...refs]);
  if (html.length > 64000 || css.length > 40000 || javascript.length > 40000) throw new Error('The normalized screen source exceeds its HTML/CSS/JavaScript size budget.');
  const tokens = new Set([...refs].map(canvasV2ScreenAssetToken));
  for (const match of (html + '\n' + css + '\n' + javascript).matchAll(SCREEN_ASSET_PATTERN)) {
    if (!tokens.has(match[1])) throw new Error('Declare and retain the exact asset handle before binding it in a screen.');
  }
  return { version: 1, ...(screen.device ? {device:screen.device} : {}), ...(screen.referenceNodeId?{referenceNodeId:screen.referenceNodeId}:{}),...(screen.referenceIntent?{referenceIntent:screen.referenceIntent}:{}),...(screen.referenceAppearance?{referenceAppearance:screen.referenceAppearance}:{}), ...(screen.productIdentityId ? { productIdentityId: screen.productIdentityId } : {}), ...(screen.mockData ? {mockData:structuredClone(screen.mockData)} : {}), title: screen.title.trim(), width: screen.width, height: screen.height, html, css, javascript, referenceAssetIds: [...refs], ...(screen.trustedRuntimeLibraries?.length ? { trustedRuntimeLibraries: [...screen.trustedRuntimeLibraries] } : {}), ...(wasmModules?.length ? {wasmModules} : {}), ...(screen.simulation ? { simulation: { appName: screen.simulation.appName, section: screen.simulation.section } } : {}) };
}
export function readCanvasV2Screens(html: string): Array<{ nodeId: string; encoded: string; screen: CanvasV2InteractiveScreen }> {
  return [...html.matchAll(/<[^>]+\bdata-canvas-v2-screen\s*=\s*(["'])([^"']*)\1[^>]*>/gi)].map(match => {
    const nodeId = /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(match[0])?.[1];
    if (!/^<div\b/i.test(match[0]) || !nodeId) throw new Error('Interactive screens must be ordinary div objects with a stable node identity.');
    if (!/^\s*<\/div\s*>/i.test(html.slice(match.index! + match[0].length))) throw new Error('A screen is one native object; place its entire interface inside the screen source, never as invisible canvas children.');
    return { nodeId, encoded: match[2], screen: parseCanvasV2Screen(match[2]) };
  });
}
export function validateCanvasV2ScreenAssets(screen: CanvasV2InteractiveScreen, evidence: readonly CanvasV2EvidenceAsset[]) {
  const bound = new Set(canvasV2ScreenBoundAssets(screen));
  for (const id of screen.referenceAssetIds) {
    const asset = evidence.find(asset => asset.id === id);
    if (!asset || asset.source?.permission === 'unavailable') throw new Error(`Read and retain asset ${id} before using it in a screen.`);
    if (bound.has(id) && asset.mediaType === 'model' && !screen.trustedRuntimeLibraries?.some(library => library === 'three' || library === 'three-webgpu')) throw new Error('A retained GLB model requires a pinned three or three-webgpu runtime and the handle-only northstarAssets API.');
  }
}
