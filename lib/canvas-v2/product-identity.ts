import { isCanvasV2ScreenAssetId, validateCanvasV2Screen } from './interactive-screen';
import type { CanvasV2EvidenceAsset } from './types';

/** Design decisions are scoped to the saved canvas, never a global brand preset. */
export interface CanvasV2ProductIdentity {
  id: string;
  name: string;
  platform: 'mobile' | 'web' | 'responsive';
  device?: 'ios' | 'android';
  visualLanguage: string;
  typography: string;
  components: string;
  motion: string;
  tokens: Record<string, string>;
  referenceAssetIds: string[];
  referenceRoles?: Array<{ assetId: string; role: 'identity' | 'layout' | 'interaction' | 'motion' | 'asset'; intent: string }>;
  reusableComponents?: Array<{ id: string; name: string; html: string; css: string; referenceAssetIds: string[] }>;
  mockData?: Record<string, unknown>;
}

export function validateCanvasV2ProductIdentity(value: unknown, evidence?: readonly CanvasV2EvidenceAsset[]): CanvasV2ProductIdentity {
  const input = value as CanvasV2ProductIdentity;
  if (!input || typeof input.id !== 'string' || !/^[\w.-]{1,80}$/.test(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120
    || !['mobile', 'web', 'responsive'].includes(input.platform)) throw new Error('A product identity needs a stable ID, product name and platform.');
  for (const field of ['visualLanguage', 'typography', 'components', 'motion'] as const) {
    if (typeof input[field] !== 'string' || input[field].length > 2400) throw new Error('Keep product design decisions concise.');
  }
  if(input.device!==undefined&&(!['ios','android'].includes(input.device)||input.platform!=='mobile'))throw new Error('A mobile product identity can specify its iOS or Android presentation.');
  if (!input.tokens || typeof input.tokens !== 'object' || Array.isArray(input.tokens) || Object.keys(input.tokens).length > 60
    || Object.entries(input.tokens).some(([key, value]) => !/^--[a-zA-Z][\w-]{0,60}$/.test(key) || typeof value !== 'string' || !value.trim() || value.length > 240 || /[{};<>]|url\s*\(|@import|expression\s*\(/i.test(value))) throw new Error('Use bounded CSS custom properties for product tokens.');
  if (!Array.isArray(input.referenceAssetIds) || input.referenceAssetIds.length > 100 || input.referenceAssetIds.some(id => !isCanvasV2ScreenAssetId(id)) || input.referenceAssetIds.reduce((size,id) => size + (typeof id === 'string' ? id.length : 0),0) > 24000) throw new Error('Use retained reference asset IDs for the product identity.');
  if (evidence) for (const id of input.referenceAssetIds) {
    const asset = evidence.find(asset => asset.id === id);
    if (!asset || asset.source?.permission === 'unavailable' || asset.mediaType === 'video' && !input.referenceRoles?.some(ref=>ref.assetId===id&&ref.role==='motion')) throw new Error('Inspect and retain product references before saving their design identity.');
  }
  if (input.referenceRoles !== undefined && (!Array.isArray(input.referenceRoles) || input.referenceRoles.length > 40 || input.referenceRoles.some(ref => !ref || !input.referenceAssetIds.includes(ref.assetId) || !['identity','layout','interaction','motion','asset'].includes(ref.role) || typeof ref.intent !== 'string' || !ref.intent.trim() || ref.intent.length > 1000))) throw new Error('Explain the retained reference and its specific purpose in this product.');
  if (input.reusableComponents !== undefined) {
    if (!Array.isArray(input.reusableComponents) || input.reusableComponents.length > 12 || new Set(input.reusableComponents.map(item => item?.id)).size !== input.reusableComponents.length) throw new Error('Keep up to twelve distinct reusable product components.');
    for (const component of input.reusableComponents) {
      if (!component || !/^[\w.-]{1,80}$/.test(component.id) || typeof component.name !== 'string' || !component.name.trim() || component.name.length > 120 || typeof component.html !== 'string' || typeof component.css !== 'string' || !Array.isArray(component.referenceAssetIds) || component.html.length > 8000 || component.css.length > 6000 || component.referenceAssetIds.some(id => !input.referenceAssetIds.includes(id))) throw new Error('Keep reusable components bounded and retain their original assets.');
      validateCanvasV2Screen({version:1,title:component.name,width:390,height:844,html:component.html,css:component.css,javascript:'',referenceAssetIds:component.referenceAssetIds});
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
  if (JSON.stringify({referenceRoles:input.referenceRoles,reusableComponents:input.reusableComponents,mockData:input.mockData}).length > 48000) throw new Error('Keep the reusable product context within its size budget.');
  return { id: input.id, name: input.name.trim(), platform: input.platform, ...(input.device?{device:input.device}:{}), visualLanguage: input.visualLanguage, typography: input.typography, components: input.components, motion: input.motion, tokens: { ...input.tokens }, referenceAssetIds: [...new Set(input.referenceAssetIds)], ...(input.referenceRoles ? {referenceRoles:structuredClone(input.referenceRoles)} : {}), ...(input.reusableComponents ? {reusableComponents:structuredClone(input.reusableComponents)} : {}), ...(input.mockData ? {mockData:structuredClone(input.mockData)} : {}) };
}

export function canvasV2ProductTokenCss(identity: CanvasV2ProductIdentity): string {
  const tokens = validateCanvasV2ProductIdentity(identity).tokens;
  return Object.keys(tokens).length ? `:root{${Object.entries(tokens).map(([key, value]) => `${key}:${value}`).join(';')}}` : '';
}
