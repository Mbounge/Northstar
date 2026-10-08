import { canvasV2FeedbackFingerprint } from './screen-feedback';
import { canvasV2ScreenAssetToken } from './interactive-screen';
import type { CanvasV2EvidenceAsset } from './types';
import type { SimulationSource } from './simulation-source';

/** Retain original approved bytes, not expiring authenticated URLs. The model
 * receives source handles; only the host can import these fixed product assets. */
export async function retainSimulationSourceAssets(source: SimulationSource, appName: string, origin: string, assetRoot: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  let total = 0;
  const assets: CanvasV2EvidenceAsset[] = [];
  const replacements = new Map<string, string>();
  if (source.assetUrls.length > 30) throw new Error('The simulation view contains too many source assets.');
  for (const url of source.assetUrls) {
    signal.throwIfAborted();
    const parsed = new URL(url);
    if (parsed.origin !== origin || !parsed.pathname.startsWith(assetRoot) || parsed.search || parsed.hash || /%2f|%5c|\.\./i.test(parsed.pathname)
      || !/\.(?:png|jpe?g|webp|gif)$/i.test(parsed.pathname)) throw new Error('Use only approved simulation assets.');
    const response = await fetcher(url, { credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok || response.redirected || !response.body) throw new Error('An original simulation asset is unavailable.');
    const mime = response.headers.get('content-type')?.split(';')[0].trim();
    if (!mime || !/^image\/(png|jpeg|webp|gif)$/.test(mime)) throw new Error('The source asset is not an approved image.');
    const reader = response.body.getReader(), parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { value, done } = await reader.read(); if (done) break;
        size += value.length; total += value.length;
        if (size > 4_500_000 || total > 12_000_000) throw new Error('The simulation asset transfer exceeds its size budget.');
        parts.push(value);
      }
    } catch (error) { await reader.cancel(); throw error; } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    const chunks: string[] = [];
    for (let i = 0; i < size; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    const pixels = `data:${mime};base64,${btoa(chunks.join(''))}`;
    const id = `simulation-source:${appName}:${canvasV2FeedbackFingerprint(pixels)}`;
    const label = `${appName} · ${decodeURIComponent(parsed.pathname.split('/').at(-1)!).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')}`;
    replacements.set(url, `northstar-asset:${canvasV2ScreenAssetToken(id)}`);
    assets.push({ id, label, app: appName, url: pixels, mimeType: mime, mediaType: mime === 'image/gif' ? 'gif' : 'image', tags: ['simulation-source-asset'],
      source: { providerId: 'northstar-preview', providerLabel: 'Northstar app preview', sourceId: parsed.pathname, sourceType: 'capture', label, retrievedAt: new Date().toISOString(), permission: 'authorized', freshness: 'current-snapshot' } });
  }
  const bind = (value: string) => [...replacements].reduce((text, [url, token]) => text.replaceAll(url, token), value);
  return { source: { ...source, html: bind(source.html), css: bind(source.css), assetUrls: undefined, referenceAssetIds: [...new Set(assets.map(asset => asset.id))] }, assets };
}
