import { readAccountAssetPixels } from './account-tools';

/** Retain GIF bytes for actual playback. The account inspection helper creates
 * a still for model inspection; that still must not replace the product asset. */
export async function readCanvasV2ScreenAssetPixels(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length<=6_000_000) return url;
  const response=await fetcher(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)]),credentials:'omit'});
  if(!response.ok)throw new Error('The retained screen asset could not be loaded.');
  const mime=response.headers.get('content-type')?.split(';')[0].trim();
  if(mime!=='image/gif') {
    // Keep normal image decoding/resizing on the existing path; use this
    // response once rather than downloading the same account image twice.
    return readAccountAssetPixels(url,signal,async()=>response);
  }
  if(Number(response.headers.get('content-length'))>4_500_000){await response.body?.cancel();throw new Error('Use a GIF up to 4.5 MB inside a screen.');}
  if(!response.body)throw new Error('The retained GIF has no content.');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4_500_000)throw new Error('Use a GIF up to 4.5 MB inside a screen.');parts.push(value);}}catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  if(!/^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0,6))))throw new Error('The retained asset is not a readable GIF.');
  const chunks:string[]=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  signal.throwIfAborted();return `data:image/gif;base64,${btoa(chunks.join(''))}`;
}
