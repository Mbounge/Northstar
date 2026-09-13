import { createHash } from 'node:crypto';
import { object, string, type JsonObject } from './managed-agent/protocol';
import { readCanvasV2PublicMedia, canvasV2PageMediaCandidates, type CanvasV2MediaRead } from './source-media.server';

export async function readNorthstarSource(action: JsonObject, signal: AbortSignal, read: CanvasV2MediaRead = readCanvasV2PublicMedia) {
    const args = object(action.arguments); const media = await read(string(args.url), signal);
    if (action.name === 'inspect_image') {
      if (!/^image\/(png|jpeg|webp|gif)(;|$)/i.test(media.mimeType)) throw new Error('This URL did not return a supported image.');
      const mime = media.mimeType.split(';')[0]; const assetId = `source-${createHash('sha256').update(media.url).digest('hex').slice(0, 20)}`;
      return Response.json({ asset: { id: assetId, label: media.url, url: `data:${mime};base64,${media.bytes.toString('base64')}`, originalUrl: media.url, mimeType: mime, mediaType: mime === 'image/gif' ? 'gif' : 'image', authority: 'observed', source: { providerId: 'openai-web-search', providerLabel: 'Public web', sourceId: assetId, sourceType: 'web-image', label: media.url, sourceUrl: media.url, retrievedAt: new Date().toISOString(), permission: 'authorized' } } });
    }
    if (!/text\/html/i.test(media.mimeType)) throw new Error('This source is not an HTML page; use the web-search tool to inspect it.');
    const html = media.bytes.toString('utf8');
    const text = html.replace(/<(script|style|nav|head|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const offset = Math.max(0, Math.min(text.length, Math.floor(Number(args.offset) || 0)));
    const allCandidates = canvasV2PageMediaCandidates(html, media.url, string(args.focus));
    const mediaOffset = Math.max(0, Math.min(allCandidates.length, Math.floor(Number(args.mediaOffset) || 0)));
    const candidates = allCandidates.slice(mediaOffset, mediaOffset + 20);
    const assets = candidates.filter(candidate => candidate.type === 'video').map(candidate => {
      const id = `source-${createHash('sha256').update(candidate.url).digest('hex').slice(0, 20)}`;
      return { id, url: candidate.url, originalUrl: candidate.url, mediaType: 'video', label: candidate.label || 'Linked video', authority: 'observed',
        source: { providerId: 'openai-web-search', providerLabel: 'Public web', sourceId: id, sourceType: 'web-page', label: media.url, sourceUrl: media.url, retrievedAt: new Date().toISOString(), permission: 'authorized' },
        limitations: ['Linked playback; motion and audio have not been inspected.'] };
    });
    return Response.json({ assets, media: candidates, mediaOffset, totalMedia: allCandidates.length, nextMediaOffset: mediaOffset + 20 < allCandidates.length ? mediaOffset + 20 : null, url: media.url, text: text.slice(offset, offset + 12_000), offset, nextOffset: offset + 12_000 < text.length ? offset + 12_000 : null,
      retrievedAt: new Date().toISOString(), images: candidates.filter(candidate => candidate.type !== 'video'), scope: 'Literal HTML text, not a rendered page or verified assertion.' });
}
