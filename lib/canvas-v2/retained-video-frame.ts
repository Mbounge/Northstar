import type { CanvasV2EvidenceAsset } from './types';

export type RetainableVideoFrame = {
  pixels: string; requestedTime: number; time: number; duration: number;
  width: number; height: number; pixelWidth: number; pixelHeight: number;
};

/** A selection is explicit and bounded before decoding or retaining anything. */
export function videoFrameRetentionTime(args: { retainFrame?: unknown; sampleTimesSeconds?: unknown }): number | undefined {
  if (args.retainFrame === undefined || args.retainFrame === false) return undefined;
  if (args.retainFrame !== true) throw new Error('retainFrame must be a boolean.');
  const times = args.sampleTimesSeconds;
  if (!Array.isArray(times) || times.length !== 1 || typeof times[0] !== 'number' || !Number.isFinite(times[0]) || times[0] < 0 || times[0] > 3600) {
    throw new Error('retainFrame needs exactly one explicit finite sampleTimesSeconds timestamp between zero and one hour.');
  }
  return times[0];
}

/** Only the host's privately decoded image is passed here, never model bytes or
 * a newly supplied URL. The original video and its provenance remain intact. */
export async function retainedVideoFrameAsset(source: CanvasV2EvidenceAsset, frame: RetainableVideoFrame, signal: AbortSignal): Promise<CanvasV2EvidenceAsset> {
  signal.throwIfAborted();
  if (!source.id || source.source?.permission === 'unavailable' || (source.mediaType !== 'video' && !source.mimeType?.startsWith('video/'))) throw new Error('Retain a frame from an authorized current video asset.');
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.pixels) || frame.pixels.length > 6_000_000
    || ![frame.width, frame.height, frame.pixelWidth, frame.pixelHeight].every(value => Number.isInteger(value) && value > 0)
    || frame.pixelWidth > frame.width || frame.pixelHeight > frame.height || Math.max(frame.pixelWidth, frame.pixelHeight) > 960
    || ![frame.requestedTime, frame.time, frame.duration].every(Number.isFinite) || frame.duration <= 0
    || frame.requestedTime < 0 || frame.requestedTime >= frame.duration || frame.requestedTime > 3600 || frame.time < 0 || frame.time > frame.duration) throw new Error('Retain only a bounded actual decoded video frame with its pixel dimensions and timestamp.');
  const identity = JSON.stringify({ source: source.id, requestedTime: frame.requestedTime, time: frame.time, pixels: frame.pixels });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  signal.throwIfAborted();
  const id = `video-frame-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const capturedAt = new Date().toISOString();
  const label = `${source.label.slice(0, 120)} · frame ${frame.time.toFixed(3)}s`;
  return {
    id, url: frame.pixels, label, kind: 'image', mediaType: 'image', mimeType: 'image/jpeg', authority: source.authority,
    app: source.app, flow: source.flow, screen: source.screen, capturedAt,
    tags: ['video-reference-frame', `derived-from:${source.id}`],
    description: `Actual privately decoded frame of retained video ${source.id}, requested at ${frame.requestedTime}s and captured at ${frame.time}s. Image pixels: ${frame.pixelWidth}×${frame.pixelHeight}; recording dimensions: ${frame.width}×${frame.height}.`,
    limitations: [...(source.limitations ?? []), 'Still-frame pixels, downscaled to at most 960px and JPEG encoded. This does not establish motion or the recording’s implementation.'],
    ...(source.source ? { source: { ...source.source, filters: { ...(source.source.filters ?? {}), videoSourceAssetId: source.id, requestedTimeSeconds: frame.requestedTime, actualTimeSeconds: frame.time, imagePixelWidth: frame.pixelWidth, imagePixelHeight: frame.pixelHeight, videoWidth: frame.width, videoHeight: frame.height } } } : {}),
  };
}

/** Guard async decoding against removal, replacement or permission changes. */
export function assertVideoFrameSourceCurrent(source: CanvasV2EvidenceAsset, current: CanvasV2EvidenceAsset | undefined) {
  if (!current || current.id !== source.id || current.url !== source.url || current.originalUrl !== source.originalUrl || current.source?.permission === 'unavailable' || current.source?.permission !== source.source?.permission
    || current.source?.sourceId !== source.source?.sourceId || current.source?.providerId !== source.source?.providerId || current.authority !== source.authority
    || (current.mediaType !== 'video' && !current.mimeType?.startsWith('video/'))) throw new Error('The retained video source changed during frame inspection. Inspect the current source again.');
}
