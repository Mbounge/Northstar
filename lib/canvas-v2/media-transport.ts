/** Lossless, request-local interning. Media stays in the document; this adds no storage. */
const SCHEMA = "canvas-v2.media-transport.v1";
const MAX_EXPANDED_LENGTH = 128 * 1024 * 1024;
export const CANVAS_V2_MAX_WIRE_BYTES = 64 * 1024 * 1024;
const MAX_MEDIA = 256;
const IMAGE = /data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+/g;

export function serializeCanvasV2Request(body: unknown): string {
  const json = JSON.stringify(body);
  if (json.length > MAX_EXPANDED_LENGTH) throw new Error("Canvas request exceeds the supported expanded media size.");
  const bounded = (value: string) => {
    if (new TextEncoder().encode(value).byteLength > CANVAS_V2_MAX_WIRE_BYTES) throw new Error("Canvas request exceeds the supported media transfer size.");
    return value;
  };
  if (json.length < 256 * 1024) return json;
  let suffix = 0;
  let prefix: string;
  do { prefix = `__canvas_media_${suffix++}_`; } while (json.includes(prefix));
  const media: string[] = [];
  const indexes = new Map<string, number>();
  const bodyJson = json.replace(IMAGE, value => {
    let index = indexes.get(value);
    if (index === undefined) {
      if (media.length >= MAX_MEDIA) return value;
      index = media.length;
      indexes.set(value, index);
      media.push(value);
    }
    return `${prefix}${index}__`;
  });
  if (!media.length) return bounded(json);
  const packed = JSON.stringify({ schema: SCHEMA, prefix, media, bodyJson });
  return bounded(packed.length < json.length ? packed : json);
}

export function decodeCanvasV2Request(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("schema" in value) || value.schema !== SCHEMA) return value;
  const envelope = value as Record<string, unknown>;
  const { prefix, media, bodyJson } = envelope;
  const invalid = () => new Error("Invalid canvas media transport");
  if (typeof prefix !== "string" || !/^__canvas_media_\d{1,8}_$/.test(prefix)
    || typeof bodyJson !== "string" || bodyJson.length > MAX_EXPANDED_LENGTH
    || !Array.isArray(media) || media.length > MAX_MEDIA
    || media.some(item => typeof item !== "string" || !/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(item))) throw invalid();
  const pattern = new RegExp(`${prefix}(\\d+)__`, "g");
  let expandedLength = bodyJson.length;
  // Bound expansion before allocating it, including repeated references to one large image.
  for (const match of bodyJson.matchAll(pattern)) {
    const item = media[Number(match[1])];
    if (typeof item !== "string" || String(Number(match[1])) !== match[1]) throw invalid();
    expandedLength += item.length - match[0].length;
    if (expandedLength > MAX_EXPANDED_LENGTH) throw invalid();
  }
  const expanded = bodyJson.replace(pattern, (_match, index: string) => media[Number(index)]);
  if (expanded.includes(prefix)) throw invalid();
  return JSON.parse(expanded);
}

export async function readCanvasV2Request(request: Pick<Request, "json">): Promise<unknown> {
  return decodeCanvasV2Request(await request.json());
}
