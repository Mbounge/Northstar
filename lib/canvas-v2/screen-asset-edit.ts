import { canvasV2ScreenAssetToken, encodeCanvasV2Screen, validateCanvasV2ScreenAssets, type CanvasV2InteractiveScreen } from './interactive-screen';
import type { CanvasV2EvidenceAsset } from './types';
import type { CanvasV2NativeSceneDocument } from './native-scene';
import { canvasV2FeedbackFingerprint } from './screen-feedback';
import type { CanvasV2ChatImageAttachment } from './chat-attachments';
import { isCanvasV2ScreenModelBytes } from './screen-asset-pixels';

export const SCREEN_ASSET_DRAG_TYPE = 'application/x-northstar-screen-asset';
export const SCREEN_ASSET_DRAG_EVENT = 'northstar-screen-asset-drag';
export function setScreenAssetDrag(active:boolean){window.dispatchEvent(new CustomEvent(SCREEN_ASSET_DRAG_EVENT,{detail:active}));}
export const SCREEN_ASSET_DROP_EVENT = 'northstar-screen-asset-drop';
export interface ScreenAssetTarget { selector: string; property: 'src' | 'background-image'; label: string; fit?: string; rect: { x: number; y: number; width: number; height: number } }
export interface ScreenAssetDrop { nodeId: string; encoded: string; target: ScreenAssetTarget; file?: File; assetId?: string }
export interface ScreenAssetPatch { selector: string; property: 'src' | 'background-image'; value: string; styles?: Record<string,string> }

export function uploadedProjectImage(image: CanvasV2ChatImageAttachment): CanvasV2EvidenceAsset {
  return {id:image.id,url:image.dataUrl,label:image.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' '),mediaType:'image',mimeType:image.mimeType,authority:'supplied',source:{providerId:'user-canvas',providerLabel:'Canvas material',sourceId:image.id,sourceType:'uploaded',label:image.name,retrievedAt:image.createdAt,permission:'authorized'}};
}

export function uploadedProjectModel(model: { id: string; name: string; mimeType: string; dataUrl: string; createdAt: string }): CanvasV2EvidenceAsset {
  return { id: model.id, url: model.dataUrl, label: model.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), mediaType: 'model', mimeType: model.mimeType, authority: 'supplied', source: { providerId: 'user-canvas', providerLabel: 'Canvas material', sourceId: model.id, sourceType: 'uploaded', label: model.name, retrievedAt: model.createdAt, permission: 'authorized' } };
}

/** Project images include retained generated media and native user uploads.
 * Merely browsing or dragging an asset does not create a history revision. */
export function projectImageAssets(scene: CanvasV2NativeSceneDocument | undefined, evidence: readonly CanvasV2EvidenceAsset[]): CanvasV2EvidenceAsset[] {
  const images = evidence.filter(asset => asset.source?.permission !== 'unavailable' && (asset.mediaType === 'model' ? isCanvasV2ScreenModelBytes(asset.url) : (!asset.mediaType || asset.mediaType === 'image') && /^data:image\/(?:png|jpeg|webp);base64,/.test(asset.url)));
  const result = new Map(images.map(asset => [asset.id, asset]));
  const byUrl = new Set(images.map(asset => asset.url));
  for (const node of scene?.nodes ?? []) {
    const src = node.attributes.src;
    if (node.kind !== 'image' || !node.sourceNodeId || !src || byUrl.has(src) || !/^data:image\/(?:png|jpeg|webp);base64,/.test(src)) continue;
    const id = `canvas-asset:${node.sourceNodeId}:${canvasV2FeedbackFingerprint(src)}`, label = node.attributes.alt || 'Uploaded image';
    result.set(id, {id,url:src,label,mediaType:'image',authority:'supplied',source:{providerId:'user-canvas',providerLabel:'Canvas material',sourceId:node.sourceNodeId,sourceType:'uploaded',label,retrievedAt:'',permission:'authorized'}});
    byUrl.add(src);
  }
  return [...result.values()];
}

/** Also embedded in the isolated runtime. A gesture identifies an existing
 * image, never guesses an insertion point or replaces a screenshot-backed UI. */
export function screenAssetTargetAtPoint(doc: Document, x: number, y: number): ScreenAssetTarget | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const hit = doc.elementFromPoint(x, y);
  if (!hit) return;
  const selector = (el: Element) => {
    if (el.id && /^[A-Za-z_][\w-]*$/.test(el.id) && doc.querySelectorAll('#' + el.id).length === 1) return '#' + el.id;
    const path: string[] = [];
    for (let node: Element | null = el; node && node !== doc.body; node = node.parentElement) {
      if (!node.parentElement) return '';
      const peers = [...node.parentElement.children].filter(peer => peer.tagName === node!.tagName);
      path.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + (peers.indexOf(node) + 1) + ')');
    }
    return 'body > ' + path.join(' > ');
  };
  for (let el: Element | null = hit; el && el !== doc.body; el = el.parentElement) {
    if (el.hasAttribute('data-northstar-raster-interface') || el.hasAttribute('data-northstar-feedback-overlay')) return;
    const style = doc.defaultView!.getComputedStyle(el);
    const property = el.tagName === 'IMG' && !el.closest('picture') && !el.hasAttribute('srcset') ? 'src' : /^url\(["']?[^"')]+["']?\)$/.test(style.backgroundImage) ? 'background-image' : undefined;
    if (!property || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    return { selector: selector(el), property, label: el.getAttribute('alt') || el.getAttribute('aria-label') || 'Image', fit: style.objectFit, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  }
}

/** Human and agent edits share the same source, asset inventory and history. */
export function replaceScreenAsset(screen: CanvasV2InteractiveScreen, target: ScreenAssetTarget, asset: CanvasV2EvidenceAsset, evidence: readonly CanvasV2EvidenceAsset[], parser: DOMParser): string {
  if (screen.simulation) throw new Error('Create an editable version of this reference first.');
  if (!target || typeof target.selector !== 'string' || !target.selector || target.selector.length > 1600 || !['src', 'background-image'].includes(target.property)) throw new Error('Choose an image in this screen.');
  if (asset.mediaType && asset.mediaType !== 'image' || !/^data:image\/(?:png|jpeg|webp);base64,/.test(asset.url)) throw new Error('Choose a retained PNG, JPEG or WebP image.');
  const doc = parser.parseFromString(screen.html, 'text/html'), matches = doc.body.querySelectorAll(target.selector), el = matches[0];
  if(el?.closest('[data-northstar-locked="true"]')||el?.querySelector('[data-northstar-locked="true"]'))throw new Error('Unlock this layer before replacing its asset.');
  if (matches.length !== 1 || !(el instanceof HTMLElement) || el === doc.body || el.closest('[data-northstar-raster-interface]')) throw new Error('This image changed. Drop it onto the current image again.');
  const handle = 'northstar-asset:' + canvasV2ScreenAssetToken(asset.id);
  if (target.property === 'src') {
    if (el.tagName !== 'IMG' || el.closest('picture')) throw new Error('Choose an image in this screen.');
    el.setAttribute('src', handle);
    el.removeAttribute('srcset');
    // Keep a responsive image's existing slot when the replacement has a
    // different intrinsic ratio. Preserve deliberate contain/cover treatment.
    if (target.rect && Number.isFinite(target.rect.width) && Number.isFinite(target.rect.height) && target.rect.width > 0 && target.rect.height > 0) {
      el.style.aspectRatio = `${target.rect.width} / ${target.rect.height}`;
      el.style.objectFit = ['contain','cover','none','scale-down'].includes(target.fit ?? '') ? target.fit! : 'cover';
    }
  } else {
    el.style.setProperty('background-image', `url("${handle}")`);
  }
  const next = { ...screen, html: doc.body.innerHTML, referenceAssetIds: [...new Set([...screen.referenceAssetIds, asset.id])] };
  validateCanvasV2ScreenAssets(next, evidence);
  return encodeCanvasV2Screen(next);
}

/** Exact asset-only changes can patch the mounted DOM without restarting its
 * JavaScript, closures, form state, scroll position or event handlers. */
export function screenAssetLivePatches(before: CanvasV2InteractiveScreen, after: CanvasV2InteractiveScreen, parser: DOMParser): ScreenAssetPatch[] | undefined {
  if (before.simulation || after.simulation || before.html === after.html) return;
  const metadata = (screen: CanvasV2InteractiveScreen) => JSON.stringify({ ...screen, html: '', referenceAssetIds: [] });
  if (metadata(before) !== metadata(after)) return;
  const oldBody = parser.parseFromString(before.html, 'text/html').body, newBody = parser.parseFromString(after.html, 'text/html').body;
  const oldNodes = [...oldBody.querySelectorAll('*')], newNodes = [...newBody.querySelectorAll('*')], patches: ScreenAssetPatch[] = [];
  if (oldNodes.length !== newNodes.length || oldNodes.length > 5000) return;
  for (let i = 0; i < oldNodes.length; i++) {
    const a = oldNodes[i], b = newNodes[i];
    if (a.tagName !== b.tagName || a.namespaceURI !== b.namespaceURI) return;
    const path: string[] = [];
    for (let el: Element | null = b; el && el !== newBody; el = el.parentElement) {
      const peers = [...el.parentElement!.children].filter(peer => peer.tagName === el!.tagName);
      path.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + (peers.indexOf(el) + 1) + ')');
    }
    const selector = b.id && /^[A-Za-z_][\w-]*$/.test(b.id) && newBody.querySelectorAll('#' + b.id).length === 1 ? '#' + b.id : 'body > ' + path.join(' > ');
    if (a.tagName === 'IMG' && a.getAttribute('src') !== b.getAttribute('src')) {
      if (b.closest('picture') || !b.getAttribute('src')?.startsWith('northstar-asset:')) return;
      const styles:Record<string,string> = {};
      for (const key of ['aspect-ratio','object-fit']) if ((a as HTMLElement).style.getPropertyValue(key) !== (b as HTMLElement).style.getPropertyValue(key)) styles[key]=(b as HTMLElement).style.getPropertyValue(key);
      const otherStyles=(el:Element)=>[...(el as HTMLElement).style].filter(key=>!['aspect-ratio','object-fit'].includes(key)).sort().map(key=>[key,(el as HTMLElement).style.getPropertyValue(key),(el as HTMLElement).style.getPropertyPriority(key)]);
      if (JSON.stringify(otherStyles(a)) !== JSON.stringify(otherStyles(b))) return;
      patches.push({ selector, property: 'src', value: b.getAttribute('src')!, ...(Object.keys(styles).length?{styles}:{}) });
      if(a.hasAttribute('style'))b.setAttribute('style',a.getAttribute('style')!);else b.removeAttribute('style');
      b.setAttribute('src', a.getAttribute('src') ?? '');
      if (a.hasAttribute('srcset')) b.setAttribute('srcset', a.getAttribute('srcset')!);
    }
    if (a instanceof HTMLElement && b instanceof HTMLElement && a.style.backgroundImage !== b.style.backgroundImage) {
      if (b.style.backgroundImage && !/^url\(["']?northstar-asset:[\w%~.!*:-]+["']?\)$/.test(b.style.backgroundImage)) return;
      patches.push({ selector, property: 'background-image', value: b.style.backgroundImage });
      const otherStyles = (el: HTMLElement) => [...el.style].filter(key => key !== 'background-image').sort().map(key => [key,el.style.getPropertyValue(key),el.style.getPropertyPriority(key)]);
      if (JSON.stringify(otherStyles(a)) !== JSON.stringify(otherStyles(b))) return;
      if (a.hasAttribute('style')) b.setAttribute('style', a.getAttribute('style')!);
      else b.removeAttribute('style');
    }
  }
  if (!patches.length || patches.length > 24 || oldBody.innerHTML !== newBody.innerHTML) return;
  return patches;
}
