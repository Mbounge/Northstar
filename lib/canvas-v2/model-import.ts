import { isCanvasV2ScreenModelBytes } from './screen-asset-pixels';

export const MAX_MODEL_IMPORT_BYTES = 16_000_000;
export interface CanvasModelImportFile { name: string; relativePath?: string; bytes: Uint8Array }
export interface CanvasModelImport { name: string; dataUrl: string; inputFormat: 'glb' | 'gltf'; resourceCount: number }
const fail = (message: string): never => { throw new Error(message); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail('The glTF contains an invalid object.');
const integer = (value: unknown, fallback?: number) => value === undefined && fallback !== undefined ? fallback : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fail('The glTF contains an invalid buffer range.');
const align = (length: number) => Math.ceil(length / 4) * 4;
const modelData = (bytes: Uint8Array) => {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return `data:model/gltf-binary;base64,${btoa(chunks.join(''))}`;
};

function localPath(raw: string): string {
  let path: string;
  try { path = decodeURIComponent(raw); } catch { return fail('A model resource has an invalid filename.'); }
  if (!path || /[\\\u0000-\u001f?#:]/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) return fail('Model resources must be selected local files with relative paths.');
  return path;
}

/** Pack explicitly selected local glTF resources into the existing retained GLB
 * boundary. No URL fetching, filesystem discovery or renderer network access. */
export function prepareCanvasModelImport(files: readonly CanvasModelImportFile[]): CanvasModelImport {
  if (!files.length || files.length > 128 || files.some(file => !file.bytes.length) || files.reduce((total, file) => total + file.bytes.length, 0) > MAX_MODEL_IMPORT_BYTES) return fail('Choose a model and its local resources, up to 16 MB in total.');
  const models = files.filter(file => /\.(glb|gltf)$/i.test(file.name));
  if (models.length !== 1) return fail('Choose exactly one .glb or .gltf model, together with its referenced resources.');
  const model = models[0];
  if (/\.glb$/i.test(model.name)) {
    if (files.length !== 1) return fail('A GLB already contains its resources. Select that file on its own.');
    const dataUrl = modelData(model.bytes);
    if (!isCanvasV2ScreenModelBytes(dataUrl)) return fail('Use a self-contained GLB with embedded buffers and images, without compressed codec dependencies.');
    return { name: model.name, dataUrl, inputFormat: 'glb', resourceCount: 0 };
  }
  let json: Record<string, unknown>;
  try { json = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(model.bytes))); } catch { return fail('The selected .gltf file is not valid glTF JSON.'); }
  if (record(json.asset).version !== '2.0') return fail('Use glTF 2.0.');
  const paths = new Map<string, CanvasModelImportFile>();
  for (const file of files) {
    const path = localPath(file.relativePath || file.name);
    if (paths.has(path)) return fail('Selected model resources have duplicate paths.');
    paths.set(path, file);
  }
  const modelPath = localPath(model.relativePath || model.name), base = modelPath.slice(0, modelPath.lastIndexOf('/') + 1), used = new Set<string>();
  const resource = (uri: unknown, image: boolean): { bytes: Uint8Array; mimeType?: string } => {
    if (typeof uri !== 'string') return fail('Every glTF buffer needs its selected resource.');
    const embedded = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(uri);
    if (embedded) {
      if (!(image ? /^image\/(png|jpeg|webp)$/.test(embedded[1]) : ['application/octet-stream','application/gltf-buffer'].includes(embedded[1]))) return fail('Unsupported embedded model resource.');
      try {
        const raw = atob(embedded[2]);
        if (raw.length > MAX_MODEL_IMPORT_BYTES) return fail('The embedded model resource is too large.');
        return { bytes: Uint8Array.from(raw, character => character.charCodeAt(0)), ...(image ? { mimeType: embedded[1] } : {}) };
      } catch { return fail('The glTF contains invalid embedded resource bytes.'); }
    }
    const path = base + localPath(uri), file = paths.get(path);
    if (!file) return fail(`Select the referenced local file “${uri.slice(0, 180)}” with the model. Nothing was imported.`);
    used.add(path);
    const mimeType = image ? /\.png$/i.test(file.name) ? 'image/png' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.webp$/i.test(file.name) ? 'image/webp' : fail('Model textures must be PNG, JPEG or WebP.') : undefined;
    return { bytes: file.bytes, ...(mimeType ? { mimeType } : {}) };
  };
  const parts: Array<{ offset: number; bytes: Uint8Array }> = [];
  let binaryLength = 0;
  const append = (bytes: Uint8Array) => {
    const offset = align(binaryLength);
    binaryLength = offset + bytes.length;
    if (binaryLength > MAX_MODEL_IMPORT_BYTES) return fail('The packed model exceeds 16 MB.');
    parts.push({ offset, bytes });
    return offset;
  };
  if (!Array.isArray(json.buffers) || !json.buffers.length || json.buffers.length > 128) return fail('The glTF needs bounded local geometry buffers.');
  const buffers = json.buffers.map(raw => {
    const buffer = record(raw), bytes = resource(buffer.uri, false).bytes, length = integer(buffer.byteLength);
    if (length > bytes.length) return fail('A selected buffer is shorter than its declared length.');
    return { offset: append(bytes.subarray(0, length)), length };
  });
  const views = (Array.isArray(json.bufferViews) ? json.bufferViews : []).map(raw => {
    const view = record(raw), buffer = buffers[integer(view.buffer)], start = integer(view.byteOffset, 0), length = integer(view.byteLength);
    if (!buffer || start + length > buffer.length) return fail('A glTF buffer view exceeds its selected resource.');
    return { ...view, buffer: 0, byteOffset: buffer.offset + start, byteLength: length };
  });
  if (json.images !== undefined && !Array.isArray(json.images)) return fail('The glTF contains invalid images.');
  if (Array.isArray(json.images)) json.images = json.images.map(raw => {
    const image = record(raw);
    if (image.uri === undefined) return image;
    if (image.bufferView !== undefined) return fail('A glTF image cannot name both a URI and a buffer view.');
    const loaded = resource(image.uri, true), bufferView = views.length;
    views.push({ buffer: 0, byteOffset: append(loaded.bytes), byteLength: loaded.bytes.length });
    const result: Record<string, unknown> = { ...image, mimeType: loaded.mimeType, bufferView }; delete result.uri;
    return result;
  });
  json.bufferViews = views;
  json.buffers = [{ byteLength: binaryLength }];
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json)), jsonLength = align(jsonBytes.length), binLength = align(binaryLength), total = 28 + jsonLength + binLength;
  if (total > MAX_MODEL_IMPORT_BYTES) return fail('The packed model exceeds 16 MB.');
  const bytes = new Uint8Array(total), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, total, true);
  header.setUint32(12, jsonLength, true); header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength); bytes.set(jsonBytes, 20);
  header.setUint32(20 + jsonLength, binLength, true); header.setUint32(24 + jsonLength, 0x004e4942, true);
  for (const part of parts) bytes.set(part.bytes, 28 + jsonLength + part.offset);
  const dataUrl = modelData(bytes);
  if (!isCanvasV2ScreenModelBytes(dataUrl)) return fail('The packed model contains unsupported resources or codec dependencies. Export embedded, uncompressed glTF 2.0 from your 3D tool.');
  return { name: model.name.replace(/\.gltf$/i, '.glb'), dataUrl, inputFormat: 'gltf', resourceCount: used.size };
}
