import { isGraetPreviewSection, type GraetPreviewSection } from '../preview/graet-navigation';
import { simulatorForApp } from '../preview/simulator-registry';
import type { CanvasV2EvidenceAsset } from './types';

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

export interface CanvasV2InteractiveScreen {
  version: 1;
  productIdentityId?: string;
  simulation?: { appName: 'GRAET'; section: GraetPreviewSection };
  title: string;
  width: number;
  height: number;
  html: string;
  css: string;
  javascript: string;
  referenceAssetIds: string[];
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
  // Only the host constructs the document and its sandbox. Source assets remain
  // opaque handles, so saved objects never hide expiring blob/signed URLs.
  if (/<\s*(?:script|iframe|object|embed|base|link|meta|html|head|body)\b|\son[a-z]+\s*=|javascript\s*:/i.test(screen.html)) throw new Error('Use a body HTML fragment, CSS and event listeners in javascript. Embedded documents, scripts and event attributes are not supported.');
  if (/@import|<\/style/i.test(screen.css) || /blob:|data:(?:image\/(?:png|jpe?g|webp|gif)|video\/(?:mp4|webm));base64/i.test(screen.html + screen.css + screen.javascript)) throw new Error('Use registered northstar-asset handles for images; external stylesheets and temporary image URLs cannot be retained.');
  const refs = new Set(screen.referenceAssetIds);
  const html = normalizeScreenAssetTokens(screen.html, [...refs]), css = normalizeScreenAssetTokens(screen.css, [...refs]), javascript = normalizeScreenAssetTokens(screen.javascript, [...refs]);
  if (html.length > 64000 || css.length > 40000 || javascript.length > 40000) throw new Error('The normalized screen source exceeds its HTML/CSS/JavaScript size budget.');
  const tokens = new Set([...refs].map(canvasV2ScreenAssetToken));
  for (const match of (html + '\n' + css + '\n' + javascript).matchAll(SCREEN_ASSET_PATTERN)) {
    if (!tokens.has(match[1])) throw new Error('Declare and retain the exact asset handle before binding it in a screen.');
  }
  return { version: 1, ...(screen.productIdentityId ? { productIdentityId: screen.productIdentityId } : {}), title: screen.title.trim(), width: screen.width, height: screen.height, html, css, javascript, referenceAssetIds: [...refs], ...(screen.simulation ? { simulation: { appName: screen.simulation.appName, section: screen.simulation.section } } : {}) };
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
  for (const id of screen.referenceAssetIds) {
    const asset = evidence.find(asset => asset.id === id);
    if (!asset || asset.source?.permission === 'unavailable') throw new Error(`Read and retain asset ${id} before using it in a screen.`);
  }
}
