import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';
import { decodeSnapshot } from '@/lib/canvas-v2/sessions/snapshot';

export const MIXED_FIXTURE_MAX_BYTES = 128 * 1024 * 1024;
export type RetainedFixtureManifest = Record<string, { key: string; mimeType: string; bytes: number; sha256: string }>;

/** Explicit local fixture input only. Never bundle the accepted demo into production. */
export async function loadMixedCanvasFixture() {
  const path = process.env.NORTHSTAR_MIXED_FIXTURE_PATH;
  if (!path || !isAbsolute(path)) throw new Error('Set NORTHSTAR_MIXED_FIXTURE_PATH to an exported local snapshot copy.');
  const info = await stat(path);
  if (!info.isFile() || info.size > MIXED_FIXTURE_MAX_BYTES) throw new Error('Mixed fixture must be a bounded snapshot file below 128 MiB.');
  const original = await readFile(path, 'utf8');
  const snapshot = decodeSnapshot(JSON.parse(original));
  const manifest = JSON.parse(await readFile(join(dirname(path), 'retained-manifest.json'), 'utf8')) as RetainedFixtureManifest;
  const originalHtml = snapshot.revision.document.html;
  const remoteSources = [...new Set(originalHtml.match(/https:\/\/[^\s"<>]+/g) ?? [])];
  for (const url of remoteSources) {
    const retained = manifest[url];
    if (!retained || !/^[a-f0-9]{64}$/.test(retained.key) || !retained.mimeType.startsWith('image/')
      || !Number.isSafeInteger(retained.bytes) || retained.bytes < 1 || retained.bytes > 8 * 1024 * 1024) {
      throw new Error('A genuine reference screenshot is not retained locally. Prepare the exact-source manifest before profiling.');
    }
    // Only byte transport changes. Source/provider identity and screen order remain original.
    snapshot.revision.document.html = snapshot.revision.document.html.split(url).join(`/canvas-v2-e2e/stress/retained/${retained.key}`);
    for (const asset of [...snapshot.revision.evidence, ...(snapshot.memory?.assets ?? [])]) {
      if (asset.url === url) { asset.originalUrl ??= url; asset.url = `/canvas-v2-e2e/stress/retained/${retained.key}`; }
    }
  }
  // Same code sources, original geometry and retained model/food bytes. The export
  // is parsed into a new object and is never written back into its source session.
  return {
    snapshot,
    provenance: {
      kind: 'exact-demo-copy', snapshotSha256: createHash('sha256').update(original).digest('hex'),
      bytes: info.size, sourceHtmlSha256: createHash('sha256').update(originalHtml).digest('hex'),
      screenCount: (originalHtml.match(/data-canvas-v2-screen=/g) ?? []).length,
      locallyRetainedReferenceImages: remoteSources.length,
      sourceEdits: false, geometryEdits: false,
    },
  };
}
