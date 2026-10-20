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
export function screenCaptureImageDataUrls(input: unknown): Map<string, string> {
  if (input === undefined) return new Map();
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid screen capture resources.');
  const entries = Object.entries(input);
  // This is the deduplicated source-image transfer, not the final review image
  // budget. Three ordinary retained 1536px PNGs can exceed 8 MB in base64.
  // Keep a finite aggregate limit without rejecting that common product case
  // or changing the original asset pixels to make a review succeed.
  const maxEncodedBytes = 16_000_000;
  if (entries.length > 100 || entries.reduce((size, [, bytes]) => size + (typeof bytes === 'string' ? bytes.length : maxEncodedBytes + 1), 0) > maxEncodedBytes) throw new Error('Screen capture resources exceed their size budget.');
  // Validate the complete table before exposing a single retained resource.
  return new Map(entries.map(([handle, bytes]) => {
    if (!/^northstar-capture-image:\d+$/.test(handle) || typeof bytes !== 'string' || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(bytes)) throw new Error('Invalid screen capture image.');
    return [handle, bytes];
  }));
}

export function unpackScreenCaptureImages(input: unknown, create: (blob: Blob) => string) {
  const resources = [...screenCaptureImageDataUrls(input)].map(([handle, bytes]) => {
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
