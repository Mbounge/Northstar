import { readCanvasV2Screens } from './interactive-screen';
import type { CanvasV2ArtifactRevision } from './types';

export interface CanvasV2ScreenVersion {
  id: string; nodeId: string; title: string; encoded: string; createdAt: string; label: string; author: 'you' | 'northstar';
}
/** Source versions are durable; temporary preview input is intentionally separate. */
export function recordCanvasV2ScreenVersions(history: CanvasV2ScreenVersion[], revision: CanvasV2ArtifactRevision): CanvasV2ScreenVersion[] {
  const next = [...history];
  for (const item of readCanvasV2Screens(revision.document.html)) {
    if (next.findLast(version => version.nodeId === item.nodeId)?.encoded === item.encoded) continue;
    if (next.some(version => version.id === `${revision.id}:${item.nodeId}`)) continue;
    const existing = next.some(version => version.nodeId === item.nodeId);
    next.push({ id: `${revision.id}:${item.nodeId}`, nodeId: item.nodeId, title: item.screen.title, encoded: item.encoded,
      createdAt: revision.createdAt, label: existing ? revision.summary || 'Updated screen' : 'Starting version',
      author: (revision.updatedBy ?? revision.sceneTransaction?.origin) === 'user' ? 'you' : 'northstar' });
  }
  if (next.length === history.length) return history;
  const counts = new Map<string, number>(); let bytes = 0;
  return next.reverse().filter(version => {
    const count = counts.get(version.nodeId) || 0;
    if (count >= 20 || bytes + version.encoded.length > 4_000_000) return false;
    counts.set(version.nodeId, count + 1); bytes += version.encoded.length; return true;
  }).slice(0, 80).reverse();
}
