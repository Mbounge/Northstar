import { canvasV2ProductDesignContext, canvasV2ProductTokenCss, type CanvasV2ProductIdentity } from './product-identity';
import { parse } from 'next/dist/compiled/acorn';
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from './types';
import { findCanvasV2SourceNodeRange, type CanvasV2SourcePatchOperation } from './source-patch';
import { canvasV2NativeSceneAbsoluteBounds, type CanvasV2NativeSceneDocument } from './native-scene';
import { SCREEN_ATTRIBUTE, readCanvasV2Screens, parseCanvasV2Screen, validateCanvasV2Screen, validateCanvasV2ScreenAssets, encodeCanvasV2Screen } from './interactive-screen';

/** Parse without executing model code. Keep saved broken screens readable so
 * review can diagnose and repair them, but reject new syntax faults at commit. */
export function validateCanvasV2ScreenJavaScript(source: string) {
  if (!source.trim()) return;
  try { parse(source, { ecmaVersion: 'latest', sourceType: 'script' }); }
  catch (error) { throw new Error(`Screen JavaScript syntax error: ${error instanceof Error ? error.message : 'Invalid browser script'}. Repair the script before committing; existing canvas work is unchanged.`); }
}

/** A targeted revision changes source only: the user's position/size stay intact. */
export function canvasV2ScreenPatch(document: CanvasV2ArtifactDocument, input: Record<string, unknown>, evidence: readonly CanvasV2EvidenceAsset[], placement: { x: number; y: number }, identities: readonly CanvasV2ProductIdentity[] = []): { nodeId: string; operations: CanvasV2SourcePatchOperation[] } {
  const nodeId = typeof input.nodeId === 'string' && input.nodeId ? input.nodeId : `screen-${crypto.randomUUID()}`;
  const currentScreens = readCanvasV2Screens(document.html);
  const previous = currentScreens.find(item => item.nodeId === nodeId);
  const base = typeof input.baseNodeId === 'string' ? currentScreens.find(item => item.nodeId === input.baseNodeId) : undefined;
  if (input.nodeId && !previous) throw new Error('That interactive screen no longer exists. Read the current canvas before revising it.');
  if (previous?.screen.simulation) throw new Error('This is a registered reference simulation. Create a separate screen variant to iterate on its design.');
  if (input.clearJavaScript !== undefined && typeof input.clearJavaScript !== 'boolean') throw new Error('clearJavaScript must be a boolean.');
  if (previous?.screen.javascript.trim() && typeof input.javascript === 'string' && !input.javascript.trim() && input.clearJavaScript !== true) {
    throw new Error('This revision would remove the existing screen interactions. Omit javascript to retain the current script, or supply the complete replacement script. Only for an intentional conversion to a static screen, supply javascript: "" and clearJavaScript: true. Existing canvas work is unchanged.');
  }
  if (input.cssMode !== undefined && !['merge', 'replace'].includes(String(input.cssMode))) throw new Error('Choose merge or replace for cssMode.');
  const identityId = input.productIdentityId ?? previous?.screen.productIdentityId;
  const identity = identityId ? identities.find(item => item.id === identityId) : undefined;
  if (identityId && !identity && (!previous || input.productIdentityId !== undefined)) throw new Error('Read or save this product identity before using it.');
  if (input.reusableComponentId !== undefined) {
    if (previous || input.baseNodeId || input.simulation || ['html','css','javascript','trustedRuntimeLibraries','wasmModules','clearJavaScript','cssMode'].some(key => input[key] !== undefined)) throw new Error('Instantiate a saved component without source overrides. Revise the new instance separately after reviewing it.');
    const component = identity?.reusableComponents?.find(item => item.id === input.reusableComponentId);
    if (!component) throw new Error('Read the product identity and choose an existing reusableComponentId.');
    input = { ...input, device: input.device ?? 'none', title: input.title ?? component.name, html: component.html, css: component.css, javascript: component.javascript ?? '', trustedRuntimeLibraries: component.trustedRuntimeLibraries, wasmModules: component.wasmModules,
      referenceAssetIds: [...new Set([...component.referenceAssetIds, ...(Array.isArray(input.referenceAssetIds) ? input.referenceAssetIds as string[] : [])])] };
  }
  const references = Array.isArray(input.referenceAssetIds) ? input.referenceAssetIds : [];
  // Keep the whole inspiration library in canvas context, but bind only the
  // target identity and the styles this screen is actually asked to borrow.
  const identityReferences = identity ? identity.referenceRoles?.length
    ? [...canvasV2ProductDesignContext(identity).primaryReferenceAssetIds, ...(identity.styleTransfer?.referenceAssetIds ?? [])]
    : identity.referenceAssetIds : [];
  const referenceIntent = input.referenceIntent ?? previous?.screen.referenceIntent ?? (previous ? undefined : identity?.styleTransfer ? 'inspired' : references.length || identity?.referenceAssetIds.length ? 'faithful' : 'original');
  const usesAppReference = references.some(id => evidence.some(asset => asset.id === id && asset.source?.sourceType === 'capture' && ['northstar-account-apps', 'northstar-preview'].includes(asset.source.providerId)));
  if (!previous && !input.simulation && (usesAppReference || ['faithful', 'inspired'].includes(String(referenceIntent))) && !identity) throw new Error('Save the primary product’s observed typography, palette, icons and component design language with canvas_product_identity and use its productIdentityId before creating this referenced page. A new layout or borrowed interaction still needs the target product’s typography, icons, palette and component conventions. For a new product, record the user’s intended identity instead.');
  if (!previous && referenceIntent === 'faithful' && (!identity || !canvasV2ProductDesignContext(identity).primaryReferenceAssetIds.some(id => references.includes(id) || input.referenceAssetIds === undefined && identity.referenceAssetIds.includes(id)))) throw new Error('Retain the actual target-product reference as identity evidence before creating its faithful copy. A borrowed layout, interaction or asset is not the primary product’s design language.');
  // A full snapshot containing the retained prefix already preserves its
  // cascade. Append genuine deltas, without doubling complete snapshots.
  const css = previous && typeof input.css === 'string' && input.cssMode !== 'replace'
    ? (input.css.startsWith(previous.screen.css) ? input.css : `${previous.screen.css}\n${input.css}`) : input.css ?? previous?.screen.css ?? '';
  // A same-product baseline already contains its retained token declarations.
  // Re-injecting them changes the copy and can reject a valid near-limit source.
  const inheritedTokens = base && !base.screen.simulation && identity?.id === base.screen.productIdentityId && css === base.screen.css;
  const screen = validateCanvasV2Screen({ version: 1, design: previous?.screen.design??base?.screen.design, device: input.device ?? previous?.screen.device ?? identity?.device, referenceNodeId:input.referenceNodeId??previous?.screen.referenceNodeId,referenceIntent,referenceAppearance:input.referenceAppearance??previous?.screen.referenceAppearance??identity?.appearance, productIdentityId: identityId, mockData:input.mockData ?? previous?.screen.mockData ?? identity?.mockData, simulation: input.simulation, title: input.title ?? previous?.screen.title,
    width: input.width ?? previous?.screen.width ?? 390, height: input.height ?? previous?.screen.height ?? 844,
    html: input.html ?? previous?.screen.html, css: !previous && identity && !inheritedTokens ? canvasV2ProductTokenCss(identity) + '\n' + css : css, javascript: input.javascript ?? previous?.screen.javascript ?? '',
    referenceAssetIds: [...new Set([...(input.referenceAssetIds ?? previous?.screen.referenceAssetIds ?? []) as string[], ...(!previous ? identityReferences : [])])], trustedRuntimeLibraries: input.trustedRuntimeLibraries ?? previous?.screen.trustedRuntimeLibraries, wasmModules: input.wasmModules ?? previous?.screen.wasmModules ?? base?.screen.wasmModules });
  if(previous&&typeof DOMParser!=='undefined'){
    const parser=new DOMParser(),before=parser.parseFromString(previous.screen.html,'text/html'),after=parser.parseFromString(screen.html,'text/html');
    const locked=[...before.body.querySelectorAll('[data-northstar-locked="true"]')];
    if(locked.length&&(screen.css!==previous.screen.css||screen.javascript!==previous.screen.javascript))throw new Error('Unlock native layers before changing the screen stylesheet or app behavior.');
    for(const layer of locked){if(!layer.id)throw new Error('Unlock this layer before revising its screen.');const matches=after.body.querySelectorAll('#'+CSS.escape(layer.id)),next=matches[0];if(matches.length!==1||next.outerHTML!==layer.outerHTML)throw new Error('A native layer is locked. Unlock it before asking Northstar to change it.');let a=layer.parentElement,b=next.parentElement;while(a&&a!==before.body){if(!b||a.localName!==b.localName||JSON.stringify([...a.attributes].map(v=>[v.name,v.value]))!==JSON.stringify([...b.attributes].map(v=>[v.name,v.value])))throw new Error('Unlock native layers before changing their layout owner.');a=a.parentElement;b=b.parentElement;}}
  }
  validateCanvasV2ScreenAssets(screen, evidence);
  validateCanvasV2ScreenJavaScript(screen.javascript);
  const encoded = encodeCanvasV2Screen(screen);
  if (previous) {
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    if (!range) throw new Error('The screen was deleted.');
    const html = document.html.slice(range.start, range.end).replace(/\bdata-canvas-v2-screen\s*=\s*(["'])([^"']*)\1/, `${SCREEN_ATTRIBUTE}="${encoded}"`);
    return { nodeId, operations: [{ op: 'replace-node', targetNodeId: nodeId, html }] };
  }
  const root = /<[^>]+\bdata-canvas-v2-(?:workspace|permanent)-root\s*=\s*["']true["'][^>]*>/i.exec(document.html)?.[0]
    ?? /<[^>]+\bdata-canvas-v2-node-id\s*=\s*["'](?:canvas|canvas-root)["'][^>]*>/i.exec(document.html)?.[0];
  const targetNodeId = root && /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  if (!targetNodeId) throw new Error('Read the canvas to find its workspace root before creating a screen.');
  if (input.placement !== undefined && !['right', 'below'].includes(String(input.placement))) throw new Error('Choose right or below for placement.');
  const relation = input.placement ? ` data-canvas-v2-territory-relation="${input.placement}"` : '';
  const x = Math.max(0, Math.round(placement.x)), y = Math.max(0, Math.round(placement.y));
  return { nodeId, operations: [{ op: 'append-html', targetNodeId,
    html: `<div data-canvas-v2-node-id="${nodeId}" ${SCREEN_ATTRIBUTE}="${encoded}"${relation} style="position:absolute;left:${x}px;top:${y}px;width:${screen.width}px;height:${screen.height}px;overflow:visible"></div>` }] };
}

/** Screen internals do not change native geometry. Avoid recompiling a second
 * runtime during source edits: it cannot represent the user's live mock state. */
export function reviseCanvasV2NativeScreen(scene: CanvasV2NativeSceneDocument, nodeId: string, encoded: string): CanvasV2NativeSceneDocument {
  parseCanvasV2Screen(encoded);
  const next = structuredClone(scene);
  const node = next.nodes.find(node => (node.sourceNodeId ?? node.id) === nodeId);
  if (!node || !node.attributes[SCREEN_ATTRIBUTE] || node.hidden || node.locked) throw new Error('The screen was deleted, hidden or locked. Read the current canvas.');
  node.attributes[SCREEN_ATTRIBUTE] = encoded;
  node.editVersion += 1;
  node.lastAuthor = 'northstar';
  return next;
}

/** Interactive frames already own their viewport, so inserting one must not
 * recompile or restart every existing app just to measure the new frame. */
export function appendCanvasV2NativeScreen(scene: CanvasV2NativeSceneDocument, nodeId: string, encoded: string, placement: {x:number;y:number}, relation?: 'right'|'below'): CanvasV2NativeSceneDocument {
  const screen = parseCanvasV2Screen(encoded), x = Math.max(0,Math.round(placement.x)), y = Math.max(0,Math.round(placement.y));
  if (!nodeId || scene.nodes.some(node=>node.id===nodeId||node.sourceNodeId===nodeId)) throw new Error('The new screen ID already exists. Read the current canvas.');
  if (![x,y].every(Number.isFinite) || x+screen.width>scene.width || y+screen.height>scene.height) throw new Error('The new screen exceeds the canvas bounds.');
  const next = {...scene,nodes:[...scene.nodes],rootIds:[...scene.rootIds]};
  next.nodes.push({id:nodeId,sourceNodeId:nodeId,childIds:[],order:next.nodes.length,tagName:'div',namespace:'html',layoutMode:'absolute',kind:'object',selectable:true,hidden:false,locked:false,canonicalEvidence:false,userEdited:false,lastAuthor:'northstar',editVersion:1,
    geometry:{x,y,width:screen.width,height:screen.height,rotation:0,zIndex:0},
    attributes:{'data-canvas-v2-node-id':nodeId,[SCREEN_ATTRIBUTE]:encoded,'data-canvas-v2-origin':'northstar','data-canvas-v2-last-author':'northstar','data-canvas-v2-edit-version':'1',...(relation?{'data-canvas-v2-territory-relation':relation}:{})},
    inlineStyle:{position:'absolute',left:`${x}px`,top:`${y}px`,width:`${screen.width}px`,height:`${screen.height}px`,overflow:'visible'},content:[]});
  next.rootIds.push(nodeId);
  return next;
}

/** Rearrangement changes only native geometry, so mounted runtimes keep their state. */
export function arrangeCanvasV2Screens(scene: CanvasV2NativeSceneDocument, input: Record<string, unknown>, authorizedHumanIds: readonly string[] = []): CanvasV2NativeSceneDocument {
  const ids = input.nodeIds;
  const anchorId = input.anchorNodeId;
  if (anchorId !== undefined && (typeof anchorId !== 'string' || !anchorId.trim())) throw new Error('Choose a current standalone screen ID for anchorNodeId.');
  if (!Array.isArray(ids) || ids.length < (anchorId === undefined ? 2 : 1) || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw new Error(anchorId === undefined ? 'Choose 2–20 distinct current screen IDs in reading order.' : 'Choose 1–20 distinct current mover screen IDs in reading order.');
  if (ids.includes(anchorId)) throw new Error('The read-only anchor must not be included in nodeIds.');
  const direction = input.direction ?? 'horizontal', gap = input.gap ?? 96;
  if (!['horizontal', 'vertical'].includes(String(direction)) || typeof gap !== 'number' || !Number.isInteger(gap) || gap < 64 || gap > 320) throw new Error('Choose horizontal or vertical with a gap from 64 to 320.');
  // Only movers get new node values. Source-preserving native serialization
  // relies on immutable identity to leave unrelated legacy/protected tags exact.
  const moverIds = new Set(ids);
  const next = { ...scene, nodes: scene.nodes.map(node => moverIds.has(node.sourceNodeId ?? node.id)
    ? { ...node, geometry: { ...node.geometry } } : node) };
  const anchor = anchorId === undefined ? undefined : next.nodes.find(node => (node.sourceNodeId ?? node.id) === anchorId);
  if (anchorId !== undefined && (!anchor || !anchor.attributes[SCREEN_ATTRIBUTE] || anchor.hidden)) throw new Error('The anchor screen was deleted or is unavailable. Read the canvas again.');
  if (anchor?.parentId && next.nodes.find(parent => parent.id === anchor.parentId)?.kind !== 'root') throw new Error('Choose a standalone anchor screen without changing its composition group.');
  const selected = ids.map(id => {
    const node = next.nodes.find(node => (node.sourceNodeId ?? node.id) === id);
    if (!node || !node.attributes[SCREEN_ATTRIBUTE] || node.hidden) throw new Error('A screen was deleted or is unavailable. Read the canvas again.');
    if (node.locked || ((node.userEdited || node.lastAuthor === 'user') && !authorizedHumanIds.includes(id))) throw new Error('Preserve human-owned and locked screens. Select the intended screens and authorize their rearrangement.');
    if (node.parentId && next.nodes.find(parent => parent.id === node.parentId)?.kind !== 'root') throw new Error('Arrange standalone screens without changing their composition group.');
    return node;
  });
  const first = canvasV2NativeSceneAbsoluteBounds(next, anchorId === undefined ? ids[0] : anchorId as string);
  if (!first || ![first.x, first.y, first.width, first.height].every(Number.isFinite) || first.width <= 0 || first.height <= 0) throw new Error('The anchor screen has unavailable geometry. Read the canvas again.');
  let x = first.x, y = first.y;
  if (anchor) { if (direction === 'horizontal') x += first.width + gap; else y += first.height + gap; }
  const selectedIds = new Set(selected.map(node => node.id));
  for (const node of selected) {
    const current = canvasV2NativeSceneAbsoluteBounds(next, node.sourceNodeId ?? node.id)!;
    if (!current || ![current.x, current.y, current.width, current.height].every(Number.isFinite) || current.width <= 0 || current.height <= 0) throw new Error('A screen has unavailable geometry. Read the canvas again.');
    const target = { x, y, width: current.width, height: current.height };
    if (x < 0 || y < 36 || x + target.width > next.width || y + target.height > next.height) throw new Error('The arranged screens exceed the canvas bounds.');
    const collision = next.nodes.some(other => {
      if (selectedIds.has(other.id) || other.hidden || !other.selectable || other.kind === 'root') return false;
      const bounds = canvasV2NativeSceneAbsoluteBounds(next, other.sourceNodeId ?? other.id);
      return bounds && x < bounds.x + bounds.width + 32 && x + target.width + 32 > bounds.x && y - 36 < bounds.y + bounds.height + 32 && y + target.height + 32 > bounds.y;
    });
    if (collision) throw new Error('This arrangement would cover existing canvas work. Choose a clear area first.');
    node.layoutMode = 'absolute';
    node.geometry.x += x - current.x; node.geometry.y += y - current.y;
    node.editVersion += 1; node.lastAuthor = 'northstar';
    if (direction === 'horizontal') x += target.width + gap; else y += target.height + gap;
  }
  return next;
}
