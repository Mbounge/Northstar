/** Serialize each image once. Computed styles repeat background-image bytes on
 * many properties/elements; duplication must not make faithful captures fail. */
export function packScreenCaptureImages(html: string, css: string) {
  const images: Record<string, string> = {}, handles = new Map<string, string>();
  const pack = (source: string) => source.replace(/data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+/g, bytes => {
    let handle = handles.get(bytes);
    if (!handle) { handle = `northstar-capture-image:${handles.size + 1}`; handles.set(bytes, handle); images[handle] = bytes; }
    return handle;
  });
  return { html: pack(html), css: pack(css), captureImages: images };
}

/** Private capture surface only: scoped blob URLs are revoked after rasterizing.
 * No generated script receives these host resources or same-origin access. */
export function unpackScreenCaptureImages(input: unknown, create: (blob: Blob) => string) {
  if (input === undefined) return { replacements: new Map<string, string>(), urls: [] as string[] };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid screen capture resources.');
  const entries = Object.entries(input);
  if (entries.length > 100 || entries.reduce((size, [, bytes]) => size + (typeof bytes === 'string' ? bytes.length : 8_000_001), 0) > 8_000_000) throw new Error('Screen capture resources exceed their size budget.');
  // Validate all entries before allocating any URLs.
  const resources = entries.map(([handle, bytes]) => {
    if (!/^northstar-capture-image:\d+$/.test(handle) || typeof bytes !== 'string' || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(bytes)) throw new Error('Invalid screen capture image.');
    const comma = bytes.indexOf(','), binary = atob(bytes.slice(comma + 1));
    return { handle, blob: new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: bytes.slice(5, comma).split(';')[0] }) };
  });
  const replacements = new Map(resources.map(({ handle, blob }) => [handle, create(blob)]));
  return { replacements, urls: [...replacements.values()] };
}

export function bindScreenCaptureImages(source: string, replacements: ReadonlyMap<string, string>) {
  return source.replace(/northstar-capture-image:\d+/g, handle => {
    const value = replacements.get(handle); if (!value) throw new Error('A screen capture image is missing.'); return value;
  });
}
