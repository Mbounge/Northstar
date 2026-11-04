import { assertSnapshotSize, DEFAULT_SNAPSHOT_MAX_BYTES } from './snapshot-size';

const FORMAT = 'northstar.snapshot.gzip.v1';
const COMPRESS_FROM_BYTES = 8 * 1024 * 1024;
export const SNAPSHOT_MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MEDIA = /data:[A-Za-z0-9.+/-]+(?:;[A-Za-z0-9=.+-]+)*;base64,[A-Za-z0-9+/=]{1024,}/g;

// Z85's JSON-safe alphabet avoids quotes/backslashes and carries four bytes
// in five characters. Large valid-JSON saves avoid base64's 33% overhead.
const BASE85='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
export function encodeSnapshotBase85(bytes:Uint8Array){
  const chunks:string[]=[];let chunk='';
  for(let i=0;i<bytes.length;i+=4){
    let value=bytes[i]*16777216+(bytes[i+1]??0)*65536+(bytes[i+2]??0)*256+(bytes[i+3]??0),word='';
    for(let digit=0;digit<5;digit++){word=BASE85[value%85]+word;value=Math.floor(value/85);}
    chunk+=word;if(chunk.length>=32760){chunks.push(chunk);chunk='';}
  }
  if(chunk)chunks.push(chunk);return chunks.join('');
}
export function decodeSnapshotBase85(data:string,size:number){
  if(!Number.isSafeInteger(size)||size<1||data.length!==Math.ceil(size/4)*5)throw Error('Compact canvas snapshot byte length is malformed.');
  const codes=new Int16Array(128).fill(-1);for(let i=0;i<BASE85.length;i++)codes[BASE85.charCodeAt(i)]=i;
  const bytes=new Uint8Array(size);
  for(let i=0,offset=0;i<data.length;i+=5,offset+=4){
    let value=0;for(let digit=0;digit<5;digit++){const code=data.charCodeAt(i+digit),part=code<128?codes[code]:-1;if(part<0)throw Error('Compact canvas snapshot encoding is malformed.');value=value*85+part;}
    if(value>0xffffffff)throw Error('Compact canvas snapshot encoding is malformed.');
    for(let digit=3;digit>=0;digit--){const byte=value%256;value=Math.floor(value/256);if(offset+digit<size)bytes[offset+digit]=byte;else if(byte!==0)throw Error('Compact canvas snapshot padding is malformed.');}
  }
  return bytes;
}

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
export async function encodeSnapshotText(text: string, maxBytes: number, {compactFromBytes=32*1024*1024}:{compactFromBytes?:number}={}): Promise<Blob> {
  const plain = new Blob([text], { type: 'application/json' });
  assertSnapshotSize(plain.size, SNAPSHOT_MAX_EXPANDED_BYTES);
  if (plain.size >= COMPRESS_FROM_BYTES && typeof CompressionStream !== 'undefined') {
    const interned = packMedia(text);
    const mediaPacking = interned.resources.length > 0;
    const source = new Blob([mediaPacking ? JSON.stringify(interned) : text]);
    const compressed = await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    const compact=bytes.length>=compactFromBytes;
    let data:string;
    if(compact)data=encodeSnapshotBase85(bytes);
    else{const chunks:string[]=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));data=btoa(chunks.join(''));}
    const packed = new Blob([JSON.stringify({ schema: FORMAT, encoding: compact?'gzip-base85':'gzip', ...(compact?{compressedBytes:bytes.length}:{}),expandedBytes: plain.size, packedBytes:source.size, mediaPacking, data })], { type: 'application/json' });
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
  if (!['gzip','gzip-base85'].includes(value.encoding) || !Number.isSafeInteger(value.expandedBytes) || value.expandedBytes < 1
    || value.expandedBytes > SNAPSHOT_MAX_EXPANDED_BYTES || typeof value.data !== 'string'
    || value.encoding==='gzip'&&!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw new Error('This compressed canvas snapshot is malformed.');
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed canvas snapshots.');
  const packedBytes = value.packedBytes ?? value.expandedBytes;
  if (!Number.isSafeInteger(packedBytes) || packedBytes < 1 || packedBytes > SNAPSHOT_MAX_EXPANDED_BYTES) throw new Error('This compressed canvas snapshot is malformed.');
  const bytes = value.encoding==='gzip-base85'?decodeSnapshotBase85(value.data,value.compressedBytes):Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));
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
