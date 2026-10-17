import { isCanvasV2ScreenAssetId, validateCanvasV2Screen, type CanvasV2InteractiveScreen } from './interactive-screen';
import type { CanvasV2EvidenceAsset } from './types';
import type { ScreenConstructionPlan } from './screen-construction-plan';

export const CANVAS_V2_STYLE_TRANSFER_DIMENSIONS = ['typography', 'palette', 'icons', 'layout', 'content', 'shapes', 'surfaceEffects', 'motion', 'interactions'] as const;
export type CanvasV2StyleTransferDimension = typeof CANVAS_V2_STYLE_TRANSFER_DIMENSIONS[number];
export interface CanvasV2StyleTransfer {
  referenceAssetIds: string[];
  borrow: CanvasV2StyleTransferDimension[];
  preserve: CanvasV2StyleTransferDimension[];
  brief: string;
}

/** Design decisions are scoped to the saved canvas, never a global brand preset. */
export interface CanvasV2ProductIdentity {
  id: string;
  name: string;
  platform: 'mobile' | 'web' | 'responsive';
  device?: 'ios' | 'android';
  appearance?: 'light' | 'dark' | 'mixed';
  visualLanguage: string;
  typography: string;
  components: string;
  motion: string;
  tokens: Record<string, string>;
  referenceAssetIds: string[];
  referenceRoles?: Array<{ assetId: string; role: 'identity' | 'layout' | 'interaction' | 'motion' | 'asset' | 'style'; intent: string }>;
  styleTransfer?: CanvasV2StyleTransfer;
  reusableComponents?: Array<{ id: string; name: string; html: string; css: string; javascript?: string; trustedRuntimeLibraries?: CanvasV2InteractiveScreen['trustedRuntimeLibraries']; wasmModules?: CanvasV2InteractiveScreen['wasmModules']; referenceAssetIds: string[] }>;
  mockData?: Record<string, unknown>;
}

/** A local component repair can narrow its references. A planned art-direction
 * change must retain the product's broader visual benchmarks as well: its
 * bound photo/logo/font are materials, not the complete design specification. */
export function canvasV2RefinementReviewReferences(
  plan: Pick<ScreenConstructionPlan, 'intent' | 'components' | 'designDirection'> | undefined,
  identity: CanvasV2ProductIdentity | undefined,
  boundAssetIds: readonly string[],
): Set<string> | undefined {
  if (plan?.intent !== 'refine') return undefined;
  return new Set([
    ...plan.components.flatMap(component => component.referenceAssetId ? [component.referenceAssetId] : []),
    ...boundAssetIds,
    ...(plan.designDirection ? identity?.referenceAssetIds ?? [] : []),
  ]);
}

export function validateCanvasV2ProductIdentity(value: unknown, evidence?: readonly CanvasV2EvidenceAsset[]): CanvasV2ProductIdentity {
  const input = value as CanvasV2ProductIdentity;
  if (!input || typeof input.id !== 'string' || !/^[\w.-]{1,80}$/.test(input.id)) throw new Error('A product identity id must use 1–80 letters, digits, underscores, dots or hyphens; no colons or spaces.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new Error('A product identity needs a nonempty name of up to 120 characters.');
  if (!['mobile', 'web', 'responsive'].includes(input.platform)) throw new Error('Product identity platform must be mobile, web or responsive; use device for ios/android.');
  for (const field of ['visualLanguage', 'typography', 'components', 'motion'] as const) {
    if (typeof input[field] !== 'string' || input[field].length > 2400) throw new Error('Keep product design decisions concise.');
  }
  if (input.appearance !== undefined && !['light', 'dark', 'mixed'].includes(input.appearance)) throw new Error('Use the product’s observed light, dark or mixed appearance.');
  if(input.device!==undefined&&(!['ios','android'].includes(input.device)||input.platform!=='mobile'))throw new Error('A mobile product identity can specify its iOS or Android presentation.');
  if (!input.tokens || typeof input.tokens !== 'object' || Array.isArray(input.tokens) || Object.keys(input.tokens).length > 60
    || Object.entries(input.tokens).some(([key, value]) => !/^--[a-zA-Z][\w-]{0,60}$/.test(key) || typeof value !== 'string' || !value.trim() || value.length > 240 || /[{};<>]|url\s*\(|@import|expression\s*\(/i.test(value))) throw new Error('Product tokens must be at most 60 CSS custom properties such as --surface or --accent; each plain CSS value must be nonempty, up to 240 characters, without URLs or declarations.');
  if (!Array.isArray(input.referenceAssetIds) || input.referenceAssetIds.length > 100 || input.referenceAssetIds.some(id => !isCanvasV2ScreenAssetId(id)) || input.referenceAssetIds.reduce((size,id) => size + (typeof id === 'string' ? id.length : 0),0) > 24000) throw new Error('Use retained reference asset IDs for the product identity.');
  if (evidence) for (const id of input.referenceAssetIds) {
    const asset = evidence.find(asset => asset.id === id);
    if (!asset || asset.source?.permission === 'unavailable' || asset.mediaType === 'video' && !input.referenceRoles?.some(ref=>ref.assetId===id&&ref.role==='motion')) throw new Error('Inspect and retain product references before saving their design identity.');
  }
  if (input.referenceRoles !== undefined && (!Array.isArray(input.referenceRoles) || input.referenceRoles.length > 40 || input.referenceRoles.some(ref => !ref || !input.referenceAssetIds.includes(ref.assetId) || !['identity','layout','interaction','motion','asset','style'].includes(ref.role) || typeof ref.intent !== 'string' || !ref.intent.trim() || ref.intent.length > 1000))) throw new Error('Explain the retained reference and its specific purpose in this product.');
  if (input.styleTransfer !== undefined) {
    const transfer = input.styleTransfer;
    const dimensions = new Set(CANVAS_V2_STYLE_TRANSFER_DIMENSIONS);
    const validDimensions = (value: unknown, allowEmpty = false): value is CanvasV2StyleTransferDimension[] => Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= CANVAS_V2_STYLE_TRANSFER_DIMENSIONS.length && new Set(value).size === value.length && value.every(item => typeof item === 'string' && dimensions.has(item as CanvasV2StyleTransferDimension));
    if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer) || !Array.isArray(transfer.referenceAssetIds) || transfer.referenceAssetIds.length === 0 || transfer.referenceAssetIds.length > 40 || transfer.referenceAssetIds.some(id => !input.referenceAssetIds.includes(id)) || new Set(transfer.referenceAssetIds).size !== transfer.referenceAssetIds.length || !validDimensions(transfer.borrow) || !validDimensions(transfer.preserve, true) || transfer.borrow.some(dimension => transfer.preserve.includes(dimension)) || typeof transfer.brief !== 'string' || !transfer.brief.trim() || transfer.brief.length > 1600) throw new Error('A style-transfer contract needs retained style references, nonempty borrowed dimensions and unique borrow/preserve dimensions with no overlap, and a concise brief.');
    if (!input.referenceRoles || transfer.referenceAssetIds.some(id => !input.referenceRoles!.some(ref => ref.assetId === id && ref.role === 'style'))) throw new Error('Style-transfer references must be retained with the style reference role.');
  }
  if (input.reusableComponents !== undefined) {
    if (!Array.isArray(input.reusableComponents) || input.reusableComponents.length > 12 || new Set(input.reusableComponents.map(item => item?.id)).size !== input.reusableComponents.length) throw new Error('Keep up to twelve distinct reusable product components.');
    for (const component of input.reusableComponents) {
      if (!component || !/^[\w.-]{1,80}$/.test(component.id) || typeof component.name !== 'string' || !component.name.trim() || component.name.length > 120 || typeof component.html !== 'string' || typeof component.css !== 'string' || !Array.isArray(component.referenceAssetIds) || component.html.length > 8000 || component.css.length > 6000 || component.referenceAssetIds.some(id => !input.referenceAssetIds.includes(id))) throw new Error('Keep reusable components bounded and retain their original assets.');
      if (component.javascript !== undefined && (typeof component.javascript !== 'string' || component.javascript.length > 12000)) throw new Error('Keep reusable component JavaScript within 12000 characters.');
      validateCanvasV2Screen({version:1,title:component.name,width:390,height:844,html:component.html,css:component.css,javascript:component.javascript ?? '',trustedRuntimeLibraries:component.trustedRuntimeLibraries,wasmModules:component.wasmModules,referenceAssetIds:component.referenceAssetIds});
    }
  }
  if (input.mockData !== undefined) {
    if (!input.mockData || typeof input.mockData !== 'object' || Array.isArray(input.mockData)) throw new Error('Use a product mock-data object.');
    const check = (value: unknown, depth: number): void => {
      if (depth > 12) throw new Error('Keep mock data shallow enough to inspect.');
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
      if (typeof value !== 'object' || !value || ![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value))) throw new Error('Use plain JSON mock data.');
      for (const [key, child] of Object.entries(value)) { if (['__proto__','constructor','prototype'].includes(key)) throw new Error('Use ordinary mock-data keys.'); check(child, depth + 1); }
    };
    check(input.mockData, 0);
    if(JSON.stringify(input.mockData).length>16000)throw new Error('Keep initial mock data within the screen dataset budget.');
  }
  if (JSON.stringify({referenceRoles:input.referenceRoles,styleTransfer:input.styleTransfer,reusableComponents:input.reusableComponents,mockData:input.mockData}).length > 48000) throw new Error('Keep the reusable product context within its size budget.');
  return { id: input.id, name: input.name.trim(), platform: input.platform, ...(input.device?{device:input.device}:{}), ...(input.appearance ? {appearance:input.appearance} : {}), visualLanguage: input.visualLanguage, typography: input.typography, components: input.components, motion: input.motion, tokens: { ...input.tokens }, referenceAssetIds: [...new Set(input.referenceAssetIds)], ...(input.referenceRoles ? {referenceRoles:structuredClone(input.referenceRoles)} : {}), ...(input.styleTransfer ? {styleTransfer:structuredClone(input.styleTransfer)} : {}), ...(input.reusableComponents ? {reusableComponents:structuredClone(input.reusableComponents)} : {}), ...(input.mockData ? {mockData:structuredClone(input.mockData)} : {}) };
}

export function canvasV2ProductTokenCss(identity: CanvasV2ProductIdentity): string {
  const tokens = validateCanvasV2ProductIdentity(identity).tokens;
  return Object.keys(tokens).length ? `:root{${Object.entries(tokens).map(([key, value]) => `${key}:${value}`).join(';')}}` : '';
}

/** Reference purposes are design authority, not just an asset inventory. Once
 * roles are explicit, an unclassified asset must not become brand evidence. */
export function canvasV2ProductDesignContext(identity: CanvasV2ProductIdentity) {
  const roles = identity.referenceRoles ?? [];
  const primaryReferenceAssetIds = roles.length
    ? [...new Set(roles.filter(ref => ref.role === 'identity').map(ref => ref.assetId))]
    : [...identity.referenceAssetIds];
  const styleTransfer = identity.styleTransfer ? structuredClone(identity.styleTransfer) : undefined;
  const guidance = styleTransfer
    ? `The primary product owns every dimension listed in styleTransfer.preserve (${styleTransfer.preserve.join(', ') || 'none explicitly retained'}). Unlisted dimensions remain governed by the target identity. Only the retained style references [${styleTransfer.referenceAssetIds.join(', ')}] may influence the explicitly borrowed dimensions (${styleTransfer.borrow.join(', ')}), under this brief: ${styleTransfer.brief} . All visual dimensions still require pixel evaluation and a pass against this contract; references never infer permission for unlisted changes.`
    : 'The primary product owns typography, palette, icon geometry and component treatment. Other references contribute only their stated purposes. The latest user brief determines requested structural or stylistic changes; a new layout alone does not authorize changing product identity. These observations require comparison with actual pixels, not approval from declarations.';
  return {
    identityId: identity.id, productName: identity.name, platform: identity.platform, appearance: identity.appearance,
    visualLanguage: identity.visualLanguage, typography: identity.typography,
    components: identity.components, motion: identity.motion, tokens: { ...identity.tokens },
    primaryReferenceAssetIds,
    referenceRoles: roles.map(ref => ({ ...ref })),
    ...(styleTransfer ? { styleTransfer } : {}),
    guidance,
  };
}
