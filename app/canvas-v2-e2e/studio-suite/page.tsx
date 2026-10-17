import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CanvasV2EvidenceAsset, CanvasV2EvidenceSource } from '@/lib/canvas-v2/types';
import StudioSuite from './studio-suite';

const capturedAt = '2026-10-11T00:00:00.000Z';

function source(id: string, label: string): CanvasV2EvidenceSource {
  return {
    providerId: 'northstar-studio-suite',
    providerLabel: 'Northstar deterministic studio suite fixtures',
    sourceId: id,
    sourceType: 'fixture',
    label,
    retrievedAt: capturedAt,
    capturedAt,
    permission: 'authorized',
    freshness: 'current-snapshot',
  };
}

async function retainedAsset(id: string, label: string, filename: string, mimeType: string, mediaType: CanvasV2EvidenceAsset['mediaType']): Promise<CanvasV2EvidenceAsset> {
  const bytes = await readFile(join(process.cwd(), 'app/canvas-v2-e2e/codex/media-assets', filename));
  const dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;
  return {
    id,
    url: dataUrl,
    originalUrl: dataUrl,
    label,
    description: `Retained local fixture ${filename}; the authored screen references this only by northstar-asset handle.`,
    app: 'Northstar studio suite',
    flow: 'Deterministic media and motion checks',
    kind: 'image',
    authority: 'supplied',
    source: source(id, label),
    capturedAt,
    mimeType,
    mediaType,
    tags: ['e2e', 'deterministic', 'retained-fixture'],
    limitations: mediaType === 'gif' ? ['Loaded image evidence does not by itself prove animated playback.'] : [],
  };
}

export default async function StudioSuitePage() {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  const assets = await Promise.all([
    retainedAsset('studio-demo-video', 'Demo MP4 video', 'demo.mp4', 'video/mp4', 'video'),
    retainedAsset('studio-motion-gif', 'Motion GIF placeholder', 'motion.gif', 'image/gif', 'gif'),
    retainedAsset('studio-reference-image', 'Reference image', 'reference.png', 'image/png', 'image'),
  ]);
  return <StudioSuite assets={assets} />;
}
