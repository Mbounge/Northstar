import type { CanvasV2EvidenceAsset } from './types';

/** Design decisions are scoped to the saved canvas, never a global brand preset. */
export interface CanvasV2ProductIdentity {
  id: string;
  name: string;
  platform: 'mobile' | 'web' | 'responsive';
  visualLanguage: string;
  typography: string;
  components: string;
  motion: string;
  tokens: Record<string, string>;
  referenceAssetIds: string[];
}

export function validateCanvasV2ProductIdentity(value: unknown, evidence?: readonly CanvasV2EvidenceAsset[]): CanvasV2ProductIdentity {
  const input = value as CanvasV2ProductIdentity;
  if (!input || typeof input.id !== 'string' || !/^[\w.-]{1,80}$/.test(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120
    || !['mobile', 'web', 'responsive'].includes(input.platform)) throw new Error('A product identity needs a stable ID, product name and platform.');
  for (const field of ['visualLanguage', 'typography', 'components', 'motion'] as const) {
    if (typeof input[field] !== 'string' || input[field].length > 2400) throw new Error('Keep product design decisions concise.');
  }
  if (!input.tokens || typeof input.tokens !== 'object' || Array.isArray(input.tokens) || Object.keys(input.tokens).length > 60
    || Object.entries(input.tokens).some(([key, value]) => !/^--[a-zA-Z][\w-]{0,60}$/.test(key) || typeof value !== 'string' || !value.trim() || value.length > 240 || /[{};<>]|url\s*\(|@import|expression\s*\(/i.test(value))) throw new Error('Use bounded CSS custom properties for product tokens.');
  if (!Array.isArray(input.referenceAssetIds) || input.referenceAssetIds.length > 100 || input.referenceAssetIds.some(id => typeof id !== 'string' || !/^[\w:.-]{1,240}$/.test(id))) throw new Error('Use retained reference asset IDs for the product identity.');
  if (evidence) for (const id of input.referenceAssetIds) {
    const asset = evidence.find(asset => asset.id === id);
    if (!asset || asset.source?.permission === 'unavailable' || asset.mediaType === 'video') throw new Error('Inspect and retain product references before saving their design identity.');
  }
  return { id: input.id, name: input.name.trim(), platform: input.platform, visualLanguage: input.visualLanguage, typography: input.typography, components: input.components, motion: input.motion, tokens: { ...input.tokens }, referenceAssetIds: [...new Set(input.referenceAssetIds)] };
}

export function canvasV2ProductTokenCss(identity: CanvasV2ProductIdentity): string {
  const tokens = validateCanvasV2ProductIdentity(identity).tokens;
  return Object.keys(tokens).length ? `:root{${Object.entries(tokens).map(([key, value]) => `${key}:${value}`).join(';')}}` : '';
}
