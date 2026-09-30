import type { AppDataApp, AppDataFlow } from '@/lib/app-data/canvas-v2-catalog';
import type { CanvasV2EvidenceAsset } from './types';

export type CanvasV2ChatEvidenceReference =
  | { kind: 'asset'; handle: string; id: string; label: string; url: string; app?: string; flow?: string }
  | { kind: 'flow'; handle: string; id: string; label: string; appId: string; appName: string; screenCount: number };

const HANDLE = /ns-(asset|flow)-(\d+)(?:[–—-](\d+))?/g;

/** A model may cite adjacent screenshots as ns-asset-12–13. Treat both as evidence. */
export function chatEvidenceHandles(answer: string): string[] {
  const handles: string[] = [];
  for (const match of answer.matchAll(HANDLE)) {
    const first = Number(match[2]);
    const last = match[3] === undefined ? first : Number(match[3]);
    const end = last >= first && last - first <= 12 ? last : first;
    for (let number = first; number <= end; number++) handles.push('ns-' + match[1] + '-' + number);
  }
  return [...new Set(handles)];
}

/** Freeze only cited, authorized evidence onto the turn so saved chat still renders after reload. */
export function citedChatEvidence(input: {
  answer: string;
  resolve: (handle: string) => string | undefined;
  assets: ReadonlyMap<string, CanvasV2EvidenceAsset>;
  flows: ReadonlyMap<string, { app: AppDataApp; flow: AppDataFlow }>;
}): Record<string, CanvasV2ChatEvidenceReference> {
  const references: Record<string, CanvasV2ChatEvidenceReference> = {};
  for (const handle of chatEvidenceHandles(input.answer)) {
    const id = input.resolve(handle);
    if (!id) continue;
    if (handle.startsWith('ns-asset-')) {
      const asset = input.assets.get(id);
      if (!asset || asset.source?.permission === 'unavailable' || asset.mediaType === 'video' || !/^(https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/.test(asset.url)) continue;
      references[handle] = { kind: 'asset', handle, id, label: asset.label, url: asset.url, app: asset.app, flow: asset.flow };
    } else {
      const found = input.flows.get(id);
      if (!found) continue;
      references[handle] = { kind: 'flow', handle, id, label: found.flow.name, appId: found.app.id, appName: found.app.name, screenCount: found.flow.screens.length || found.flow.sourceScreenCount || 0 };
    }
  }
  return references;
}
