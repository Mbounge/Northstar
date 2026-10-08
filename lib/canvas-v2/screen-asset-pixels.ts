import { readAccountAssetPixels } from './account-tools';

export function isCanvasV2FontBytes(value:string){
  const match=/^data:font\/(ttf|otf|woff|woff2);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if(!match||value.length>2_800_000)return false;
  try{const header=atob(match[2].slice(0,48));if(header.length<12)return false;return match[1]==='ttf'?header.startsWith('\0\x01\0\0'):header.startsWith({otf:'OTTO',woff:'wOFF',woff2:'wOF2'}[match[1] as 'otf'|'woff'|'woff2']);}catch{return false;}
}

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
  if(url.startsWith('data:font/')){if(!isCanvasV2FontBytes(url))throw new Error('Use a retained bounded TTF, OTF, WOFF or WOFF2 font.');return url;}
  if(VIDEO_DATA.test(url)){if(!isCanvasV2ScreenVideoBytes(url))throw new Error('Use a readable MP4 or WebM up to 12 MB inside a screen.');return url;}
  const response=await fetcher(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)]),credentials:'omit'});
  if(!response.ok)throw new Error('The retained screen asset could not be loaded.');
  const mime=response.headers.get('content-type')?.split(';')[0].trim();
  const video=mime==='video/mp4'||mime==='video/webm',font=Boolean(mime&&/^font\/(ttf|otf|woff|woff2)$/.test(mime)),limit=video?12_000_000:font?2_000_000:4_500_000;
  const tooLarge=()=>new Error(video?'Use a video up to 12 MB inside a screen.':font?'Use a font up to 2 MB inside a screen.':'Use a GIF up to 4.5 MB inside a screen.');
  if(mime!=='image/gif' && !video && !font) {
    // Keep normal image decoding/resizing on the existing path; use this
    // response once rather than downloading the same account image twice.
    return readAccountAssetPixels(url,signal,async()=>response);
  }
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw tooLarge();}
  if(!response.body)throw new Error('The retained asset has no content.');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw tooLarge();parts.push(value);}}catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  if(!video && !font && !/^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0,6))))throw new Error('The retained asset is not a readable GIF.');
  const chunks:string[]=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  signal.throwIfAborted();const data=`data:${mime};base64,${btoa(chunks.join(''))}`;
  if(font && !isCanvasV2FontBytes(data))throw new Error('The retained font has unsupported bytes.');
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


/** Timestamped frames from the recording, not evidence of its original code.
 * A private decoder never seeks or pauses the user's canvas player. */
export function canvasV2VideoReferenceTimes(duration:number,requested?:number[]) {
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Choose a finite, readable video recording.');
  if(requested){
    if(!Array.isArray(requested)||requested.length<1||requested.length>8||requested.some((time,i)=>!Number.isFinite(time)||time<0||time>=duration||time>3600||(i>0&&time<=requested[i-1])))throw new Error('Choose 1–8 increasing timestamps within the recording, up to one hour.');
    return requested;
  }
  const end=Math.min(duration*.98,3600);
  return [0,end/4,end/2,end*3/4,end];
}
export async function readCanvasV2VideoReferenceFrames(url:string,signal:AbortSignal,requested?:number[]) {
  if(!/^data:video\/(?:mp4|webm);base64,[A-Za-z0-9+/=]+$/.test(url)){
    const parsed=new URL(url);
    if(!['http:','https:','blob:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Choose a retained direct video recording.');
  }else if(url.length>140_000_000)throw new Error('The retained video is too large to inspect.');
  const video=document.createElement('video');video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto';
  const wait=(event:'loadeddata'|'seeked',start:()=>void)=>new Promise<void>((resolve,reject)=>{
    const finish=(error?:unknown)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);video.removeEventListener(event,ready);video.removeEventListener('error',failed);if(error)reject(error);else resolve();};
    const ready=()=>finish(),failed=()=>finish(new Error('This source does not expose readable video frames. Use a direct clip or a canvas upload.')),abort=()=>finish(signal.reason??new Error('Video inspection cancelled.'));
    const timer=setTimeout(failed,10000);
    video.addEventListener(event,ready,{once:true});video.addEventListener('error',failed,{once:true});signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}start();
  });
  try{
    await wait('loadeddata',()=>{video.src=url;});
    const times=canvasV2VideoReferenceTimes(video.duration,requested);
    const canvas=document.createElement('canvas'),scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    if(!canvas.width||!canvas.height)throw new Error('The recording has no readable video frames.');
    const frames=[];
    for(const requestedTime of times){
      signal.throwIfAborted();
      if(Math.abs(video.currentTime-requestedTime)>.0001)await wait('seeked',()=>{video.currentTime=requestedTime;});
      try{canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);frames.push({pixels:canvas.toDataURL('image/jpeg',.9),requestedTime,time:video.currentTime,width:video.videoWidth,height:video.videoHeight,duration:video.duration});}
      catch{throw new Error('This source does not expose readable video frames. Use a direct clip or a canvas upload.');}
      if(frames.reduce((size,frame)=>size+frame.pixels.length,0)>6_000_000)throw new Error('Use fewer timestamps for this detailed recording.');
    }
    return frames;
  }finally{video.pause();video.removeAttribute('src');video.load();}
}


export function screenComparisonRect(value: unknown) {
  const rect = value as {x:number;y:number;width:number;height:number};
  if (!rect || ![rect.x,rect.y,rect.width,rect.height].every(v => typeof v === 'number' && Number.isFinite(v)) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1 || rect.y + rect.height > 1) throw new Error('Choose a normalized crop inside each image.');
  return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
}

/** Matching crops make small glyphs/surfaces legible. This returns observed
 * pixels and dimensions, never a heuristic approval or a modified reference. */
export async function compareScreenReferencePixels(referencePixels: string, screenPixels: string, referenceRect: unknown, screenRect: unknown, signal: AbortSignal) {
  const a = screenComparisonRect(referenceRect), b = screenComparisonRect(screenRect);
  const load = async (pixels:string) => {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(pixels) || pixels.length > 8_000_000) throw new Error('Compare retained still-image pixels.');
    const image = new Image(); image.src = pixels; await image.decode(); signal.throwIfAborted();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error('The comparison image exceeds its pixel budget.');
    return image;
  };
  const [reference,current] = await Promise.all([load(referencePixels),load(screenPixels)]);
  const source = {x:a.x*reference.naturalWidth,y:a.y*reference.naturalHeight,width:a.width*reference.naturalWidth,height:a.height*reference.naturalHeight};
  const target = {x:b.x*current.naturalWidth,y:b.y*current.naturalHeight,width:b.width*current.naturalWidth,height:b.height*current.naturalHeight};
  const panelWidth=480,panelHeight=480;
  const canvas=document.createElement('canvas');canvas.width=panelWidth*2+24;canvas.height=panelHeight+44;
  const context=canvas.getContext('2d');if(!context)throw new Error('The pixel comparison is unavailable.');
  context.fillStyle='#f0f0f4';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#191923';context.font='16px system-ui';context.fillText('Reference',12,26);context.fillText('Current screen',panelWidth+36,26);
  for(const [index,image,rect] of [[0,reference,source],[1,current,target]] as const){
    const scale=Math.min(panelWidth/rect.width,panelHeight/rect.height),width=rect.width*scale,height=rect.height*scale;
    context.drawImage(image,rect.x,rect.y,rect.width,rect.height,index*(panelWidth+24)+(panelWidth-width)/2,44+(panelHeight-height)/2,width,height);
  }
  signal.throwIfAborted();
  return {image:canvas.toDataURL('image/png'),referenceCropPixels:source,screenCropPixels:target,referenceAspectRatio:source.width/source.height,screenAspectRatio:target.width/target.height,note:'Actual paired crops, shown at the same maximum panel size without stretching their aspect ratios. Compare typography, icon geometry, spacing, palette and effects under the user brief. Different capture scale, antialiasing or intended changes need interpretation. These pixels do not establish animation timing, interaction quality or approval.'};
}
