import { readAccountAssetPixels } from './account-tools';

const VIDEO_DATA = /^data:video\/(?:mp4|webm);base64,[A-Za-z0-9+/=]+$/;
export function isCanvasV2ScreenVideoBytes(value: string) {
  if (!VIDEO_DATA.test(value) || value.length > 16_000_000) return false;
  try {
    const header=atob(value.slice(value.indexOf(',')+1,value.indexOf(',')+33));
    return value.startsWith('data:video/mp4;') ? header.slice(4,8)==='ftyp' : [0x1a,0x45,0xdf,0xa3].every((byte,i)=>header.charCodeAt(i)===byte);
  } catch { return false; }
}

/** Retain original GIF/video bytes for playback. Inspection stills must not
 * replace the product media. Only declared, bounded assets reach the sandbox. */
export async function readCanvasV2ScreenAssetPixels(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length<=6_000_000) return url;
  if(VIDEO_DATA.test(url)){if(!isCanvasV2ScreenVideoBytes(url))throw new Error('Use a readable MP4 or WebM up to 12 MB inside a screen.');return url;}
  const response=await fetcher(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)]),credentials:'omit'});
  if(!response.ok)throw new Error('The retained screen asset could not be loaded.');
  const mime=response.headers.get('content-type')?.split(';')[0].trim();
  const video=mime==='video/mp4'||mime==='video/webm',limit=video?12_000_000:4_500_000;
  const tooLarge=()=>new Error(video?'Use a video up to 12 MB inside a screen.':'Use a GIF up to 4.5 MB inside a screen.');
  if(mime!=='image/gif' && !video) {
    // Keep normal image decoding/resizing on the existing path; use this
    // response once rather than downloading the same account image twice.
    return readAccountAssetPixels(url,signal,async()=>response);
  }
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw tooLarge();}
  if(!response.body)throw new Error('The retained GIF has no content.');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw tooLarge();parts.push(value);}}catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  if(!video && !/^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0,6))))throw new Error('The retained asset is not a readable GIF.');
  const chunks:string[]=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  signal.throwIfAborted();const data=`data:${mime};base64,${btoa(chunks.join(''))}`;
  if(video && !isCanvasV2ScreenVideoBytes(data))throw new Error('The retained asset is not a readable MP4 or WebM.');return data;
}


/** A labeled initial frame is inspection evidence, never proof of playback or
 * animation quality. The source and its canvas player stay untouched. */
export async function readCanvasV2VideoPoster(url: string, signal: AbortSignal) {
  const source=await readCanvasV2ScreenAssetPixels(url,signal);
  if(!isCanvasV2ScreenVideoBytes(source))throw new Error('Choose a retained MP4 or WebM clip.');
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
  try {
    await new Promise<void>((resolve,reject)=>{
      const finish=(error?:unknown)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);video.onloadeddata=null;video.onerror=null;if(error)reject(error);else resolve();};
      const abort=()=>finish(signal.reason??new Error('Video inspection cancelled.'));
      const timer=setTimeout(()=>finish(new Error('The video frame could not be loaded.')),10000);
      video.onloadeddata=()=>finish();video.onerror=()=>finish(new Error('The video frame could not be loaded.'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}video.src=source;
    });
    signal.throwIfAborted();
    const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    if(!canvas.width||!canvas.height)throw new Error('The clip has no readable video frame.');
    canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);
    return {pixels:canvas.toDataURL('image/jpeg',0.92),width:video.videoWidth,height:video.videoHeight,duration:video.duration,time:video.currentTime};
  } finally {video.pause();video.removeAttribute('src');video.load();}
}
