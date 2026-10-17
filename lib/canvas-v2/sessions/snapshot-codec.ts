import { assertSnapshotSize, DEFAULT_SNAPSHOT_MAX_BYTES } from './snapshot-size';

const FORMAT = 'northstar.snapshot.gzip.v1';
const COMPRESS_FROM_BYTES = 8 * 1024 * 1024;
export const SNAPSHOT_MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MEDIA = /data:[A-Za-z0-9.+/-]+(?:;[A-Za-z0-9=.+-]+)*;base64,[A-Za-z0-9+/=]{1024,}/g;

function mediaMatches(text: string) {
  const matches = Array.from(text.matchAll(MEDIA), match => ({index:match.index,value:match[0]}));
  const encoded = /data%3A[A-Za-z0-9.%+-]+?%3Bbase64%2C/g;
  let head: RegExpExecArray | null;
  while ((head = encoded.exec(text))) {
    const start = encoded.lastIndex;
    let end = start;
    while (end < text.length) {
      const code = text.charCodeAt(end);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 61) { end++; continue; }
      if (text[end] === '%' && /^(?:2[BbFf]|3[Dd])$/.test(text.slice(end+1,end+3))) { end += 3; continue; }
      break;
    }
    if (end-start >= 1024) matches.push({index:head.index,value:text.slice(head.index,end)});
    encoded.lastIndex = Math.max(end,start);
  }
  return matches.sort((a,b)=>a.index-b.index);
}

function packMedia(text: string) {
  const counts = new Map<string, number>();
  const matches = mediaMatches(text);
  for (const match of matches) counts.set(match.value, (counts.get(match.value) ?? 0) + 1);
  let prefix = '__NORTHSTAR_SNAPSHOT_MEDIA__';
  while (text.includes(prefix)) prefix += '_';
  const resources = Array.from(counts).filter(([,count]) => count > 1).slice(0,4096).map(([value],i) => ({token:`${prefix}${i}__`,value}));
  const tokens = new Map(resources.map(resource => [resource.value, resource.token]));
  if (!resources.length) return {text,resources};
  const parts: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    parts.push(text.slice(cursor,match.index),tokens.get(match.value) ?? match.value);
    cursor = match.index+match.value.length;
  }
  parts.push(text.slice(cursor));
  return { text:parts.join(''), resources };
}

function restoreMedia(text: string, resources: unknown, expectedBytes: number): string {
  if (resources === undefined) return text;
  if (!Array.isArray(resources) || resources.length > 4096) throw new Error('Compressed canvas media dictionary is malformed.');
  const entries = new Map<string, {value:string; delta:number}>();
  for (const item of resources) {
    if (!item || typeof item.token !== 'string' || !/^__NORTHSTAR_SNAPSHOT_MEDIA_+\d+__$/.test(item.token)
      || item.token.length > 256 || typeof item.value !== 'string' || !/^data(?::|%3A)/.test(item.value) || entries.has(item.token)) throw new Error('Compressed canvas media dictionary is malformed.');
    entries.set(item.token,{value:item.value,delta:new Blob([item.value]).size-item.token.length});
  }
  if (!entries.size) return text;
  const pattern = new RegExp(Array.from(entries.keys()).join('|'),'g');
  let expanded = new Blob([text]).size;
  text.replace(pattern, token => { expanded += entries.get(token)!.delta; return token; });
  if (expanded !== expectedBytes || expanded > SNAPSHOT_MAX_EXPANDED_BYTES) throw new Error('Compressed canvas media size does not match its saved source.');
  return text.replace(pattern,token=>entries.get(token)!.value);
}

/** Keep the storage object valid JSON and retain byte-identical source/media.
 * Large boards repeat encoded screen runtimes and media in source and memory.
 * Native streaming gzip runs in the existing encoder worker, not the UI loop. */
export async function encodeSnapshotText(text: string, maxBytes: number): Promise<Blob> {
  const plain = new Blob([text], { type: 'application/json' });
  assertSnapshotSize(plain.size, SNAPSHOT_MAX_EXPANDED_BYTES);
  if (plain.size >= COMPRESS_FROM_BYTES && typeof CompressionStream !== 'undefined') {
    const interned = packMedia(text);
    const mediaPacking = interned.resources.length > 0;
    const source = new Blob([mediaPacking ? JSON.stringify(interned) : text]);
    const compressed = await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
    const packed = new Blob([JSON.stringify({ schema: FORMAT, encoding: 'gzip', expandedBytes: plain.size, packedBytes:source.size, mediaPacking, data: btoa(chunks.join('')) })], { type: 'application/json' });
    if (packed.size < plain.size) { assertSnapshotSize(packed.size, maxBytes); return packed; }
  }
  assertSnapshotSize(plain.size, maxBytes);
  return plain;
}

/** Legacy schema1 JSON still opens unchanged. Bound decompression before JSON
 * validation, so a corrupt/archive bomb cannot allocate an unbounded board. */
export async function unpackSnapshotText(raw: string, maxBytes = DEFAULT_SNAPSHOT_MAX_BYTES): Promise<string> {
  assertSnapshotSize(new Blob([raw]).size, maxBytes);
  const value = JSON.parse(raw);
  if (value?.schema !== FORMAT) return raw;
  if (value.encoding !== 'gzip' || !Number.isSafeInteger(value.expandedBytes) || value.expandedBytes < 1
    || value.expandedBytes > SNAPSHOT_MAX_EXPANDED_BYTES || typeof value.data !== 'string'
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw new Error('This compressed canvas snapshot is malformed.');
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed canvas snapshots.');
  const packedBytes = value.packedBytes ?? value.expandedBytes;
  if (!Number.isSafeInteger(packedBytes) || packedBytes < 1 || packedBytes > SNAPSHOT_MAX_EXPANDED_BYTES) throw new Error('This compressed canvas snapshot is malformed.');
  const encoded = atob(value.data);
  const bytes = Uint8Array.from(encoded, c => c.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > packedBytes || total > SNAPSHOT_MAX_EXPANDED_BYTES) throw new Error('Compressed canvas exceeds its declared size.');
      parts.push(chunk);
    }
    if (total !== packedBytes) throw new Error('Compressed canvas size does not match its saved source.');
    const inflated = await new Blob(parts.map(p => new Uint8Array(p))).text();
    const packed = value.mediaPacking === true ? JSON.parse(inflated) : undefined;
    if (packed && typeof packed.text !== 'string') throw new Error('Compressed canvas media dictionary is malformed.');
    const text = restoreMedia(packed ? packed.text : inflated,packed ? packed.resources : value.resources,value.expandedBytes);
    if (new Blob([text]).size !== value.expandedBytes) throw new Error('Compressed canvas size does not match its saved source.');
    return text;
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
}
