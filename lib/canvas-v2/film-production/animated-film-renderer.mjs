import {readFile,writeFile,mkdtemp,mkdir,rm,stat,rename,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {filmFingerprint,openFilmCheckpoint} from './film-checkpoint.mjs';
import {StudioError,assert} from './studio-errors.mjs';
import {animatedExplainerInput,runMediaCommand} from './film-narration.mjs';

const maxSourceArtifactBytes=8_000_000;

async function fitFilmVideo(ffmpeg,duration,options,maxVideoBytes,silent){
 const size=await stat(join(options.cwd,'lesson.mp4'));
 if(size.size<=maxVideoBytes)return;
 // Keep the original frames, dimensions, timing and AAC narration. Re-encode
 // the picture only when the first quality-based encode exceeds the limit.
 const videoRate=Math.floor((maxVideoBytes-300_000)*8/duration)-(silent?0:110_000);
 const encoding=['-c:v','libx264','-threads','2','-preset','fast','-b:v',String(videoRate),
  '-pix_fmt','yuv420p','-passlogfile','publication'];
 const input=['-nostdin','-v','error','-y','-i','lesson.mp4','-map','0:v:0',...encoding];
 await runMediaCommand(ffmpeg,[...input,'-pass','1','-an','-f','null','-'],options);
 await runMediaCommand(ffmpeg,[...input,'-pass','2','-map','0:a:0','-c:a','copy',
  '-movflags','+faststart','publication.mp4'],options);
 assert((await stat(join(options.cwd,'publication.mp4'))).size<=maxVideoBytes,
  'The encoded video exceeds the publication limit.');
 await rename(join(options.cwd,'publication.mp4'),join(options.cwd,'lesson.mp4'));
}

const filmImageReceipt={type:'object',additionalProperties:false,required:['requestId','index'],properties:{
 requestId:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,100}$'},index:{type:'integer',minimum:0,maximum:3}
}};
const validImageReceipt=receipt=>receipt&&Object.keys(receipt).length===2&&
 typeof receipt.requestId==='string'&&/^[\w-]{1,100}$/.test(receipt.requestId)&&
 Number.isInteger(receipt.index)&&receipt.index>=0&&receipt.index<=3;

const sceneInput={type:'object',additionalProperties:false,required:['html','css','javascript'],properties:{
 html:{type:'string',minLength:1,maxLength:600000},css:{type:'string',maxLength:80000},
 javascript:{type:'string',minLength:1,maxLength:80000},
 engine:{type:'string',enum:['browser','three'],description:'Use three for spatial subjects that benefit from an actual camera, lighting and depth. window.THREE is provided offline.'},
 model:{description:'Optional exact Blender GLB for a Three.js film. Choose an author receipt or a model already attached to a block in this book. Await window.UKIOGLTF.parse() before drawing.',anyOf:[
  ...['requestId','blockId'].map(key=>({type:'object',additionalProperties:false,required:[key,'sha256'],
    properties:{[key]:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,100}$'},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}}}))
 ]},
 artwork:{...filmImageReceipt,description:'Optional image from this turn or the draft being refined, by its generate_image receipt. Use src="ukio-film-artwork" in the HTML.'},
 artworks:{type:'array',minItems:1,maxItems:4,items:filmImageReceipt,description:'Bind original artwork receipts in shot order. Reference each in the markup as src="ukio-film-artwork-1", src="ukio-film-artwork-2", and so on. Use the same layer across shots where continuity helps.'}
}};
export const filmRenderInput={type:'object',additionalProperties:false,required:['lesson','scene'],properties:{
 workprint:{type:'boolean',description:'Render a playable production draft for review only. It cannot be placed in a book.'},
 lesson:animatedExplainerInput,scene:{anyOf:[sceneInput,{type:'object',additionalProperties:false,required:['workbench'],properties:{workbench:{type:'boolean',const:true}}}]}
}};
export function validateFilmScene(scene){
 assert(scene&&Object.keys(scene).every(key=>Object.hasOwn(sceneInput.properties,key)),'Supply an editable browser film scene.');
 assert(!Object.hasOwn(scene,'engine')||['browser','three'].includes(scene.engine),'Choose the browser or bundled Three.js film engine.');
 if(Object.hasOwn(scene,'model')){
  const m=scene.model;
  assert(scene.engine==='three'&&m&&Object.keys(m).length===2&&(typeof m.requestId==='string'&&/^[\w-]{1,100}$/.test(m.requestId) || typeof m.blockId==='string'&&/^[\w-]{1,100}$/.test(m.blockId))&&typeof m.sha256==='string'&&/^[a-f0-9]{64}$/.test(m.sha256),'Use an exact Blender GLB receipt with the Three.js film engine.');
 }
 if(Object.hasOwn(scene,'artwork')){
  assert(validImageReceipt(scene.artwork),'Use an exact generated artwork receipt.');
  assert(typeof scene.html==='string'&&scene.html.includes('src="ukio-film-artwork"'),'Place the generated artwork with src="ukio-film-artwork" in the film markup.');
 }
 if(Object.hasOwn(scene,'artworks')){
  assert(!scene.artwork&&Array.isArray(scene.artworks)&&scene.artworks.length>=1&&scene.artworks.length<=4&&
   scene.artworks.every(validImageReceipt),'Use up to four exact generated artwork receipts.');
  const slots=typeof scene.html==='string'?[...scene.html.matchAll(/src="ukio-film-artwork-(\d+)"/g)].map(match=>match[1]):[];
  assert(new Set(slots).size===scene.artworks.length&&slots.every(slot=>/^[1-4]$/.test(slot)&&Number(slot)<=scene.artworks.length),
   'Use each numbered film artwork slot in the markup.');
 }
 for(const [key,limits] of Object.entries(sceneInput.properties).filter(([key])=>!['artwork','artworks','engine','model'].includes(key)))
  assert(typeof scene[key]==='string'&&scene[key].length>=(limits.minLength||0)&&scene[key].length<=limits.maxLength,'Film scene '+key+' is missing or exceeds its size limit.');
 assert(!/<\s*\/?\s*(?:script|iframe|object|embed|form|base|link|meta|style)\b|\son\w+\s*=/i.test(scene.html)&&
  !/<\/(?:script|style)/i.test(scene.css+scene.javascript),'Keep film markup, styles and render code in their respective fields.');
 return structuredClone(scene);
}
export function createAnimatedFilmRenderer({browser,prepareNarration,ffmpeg,maxVideoBytes=8_000_000,maxDuration=240}){
 return async function render({lesson,scene},{signal,recoveryDirectory,publicationOnly=false,onProgress=async()=>{}}={}){
  const silent=lesson.audio==='silent';
  const cwd=recoveryDirectory||await mkdtemp(join(tmpdir(),'ukio-film-'));
  const checkpoint=recoveryDirectory?await openFilmCheckpoint(cwd,{rendererVersion:2,lesson,scene,maxVideoBytes,maxDuration},{onProgress}):null;
  const resultFiles=[['lesson.mp4','video/mp4'],...(silent?[]:[['captions.vtt','text/vtt']]),['poster.png','image/png'],['source.zip','application/zip']];
  const saved=await checkpoint?.data('result');
  if(saved)return {...saved,artifacts:await Promise.all(resultFiles.map(async([name,mimeType])=>[name,mimeType,await readFile(join(cwd,name))]))};
  const timeout=AbortSignal.timeout(540000);
  const deadline=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
   const fps=24;
   let narration=await checkpoint?.data('narration');
   if(silent){
    let offset=0;
    const beats=lesson.beats.map(beat=>{
     const start=offset/fps;
     offset+=Math.round(beat.seconds*fps);
     return {start,speechEnd:offset/fps,end:offset/fps};
    });
    narration={beats,duration:offset/fps,files:[],voice:null};
   }else{
    assert(!publicationOnly||narration,'Saved narration metadata is unavailable. Publication recovery will not regenerate it.',409);
    if(!narration){
     narration=await prepareNarration(lesson,{cwd,signal:deadline,checkpoint});
     await checkpoint?.record('narration',narration.files,narration,{stage:'narration-ready',completedBeats:lesson.beats.length,totalBeats:lesson.beats.length});
    }
   }
   const frames=Math.ceil(narration.duration*fps),duration=Number((frames/fps).toFixed(6));
   assert(duration<=maxDuration,`The finished film exceeds ${maxDuration} seconds. Shorten the narration or viewing holds.`);
   const spatial=scene.engine==='three';
   const timeline=narration.beats.map((beat,i)=>i===narration.beats.length-1?{...beat,end:duration}:beat);
   const opts={cwd,signal:deadline};
   const env={PATH:process.env.PATH,TMPDIR:cwd};
   const audioKey=checkpoint?.signature('narration')||filmFingerprint(narration);
   const timelineKey=filmFingerprint({timeline,audioKey}).slice(0,16),chunks=[];
   const paddedAudio=timeline.map(({speechEnd,end},i)=>`[${i}:a]aresample=48000,apad=pad_dur=${Math.max(0,end-speechEnd).toFixed(6)}[a${i}]`);
   const concatAudio=timeline.map((_,i)=>`[a${i}]`).join('')+`concat=n=${timeline.length}:v=0:a=1[out]`;
   if(!silent&&!await checkpoint?.has('mixed-audio-'+audioKey)){
    await runMediaCommand(ffmpeg,['-nostdin','-v','error','-y',...narration.files.flatMap(file=>['-i',file]),
     '-filter_complex',[...paddedAudio,concatAudio].join(';'),'-map','[out]','narration.wav'],{...opts,env});
    await checkpoint?.record('mixed-audio-'+audioKey,['narration.wav']);
   }
   const encoded=await checkpoint?.has('encoded-video-'+timelineKey);
   assert(!publicationOnly||encoded,'The saved encoded video is unavailable. Publication recovery will not render it again.',409);
   // Independently encoded ten-second ranges share the original global frame clock.
   // A killed encoder loses at most its current range, never earlier completed ranges.
   for(let from=0,index=0;from<frames;from+=240,index++){
    const to=Math.min(frames,from+240),name=`frames-${timelineKey}-${index}.mp4`,key=`frames-${timelineKey}-${index}`;
    chunks.push(name);
    if(encoded||await checkpoint?.has(key))continue;
    const temporary=name+'.partial.mp4';
    await browser.renderFilm(scene,{fps,frames,frameStart:from,frameEnd:to,beats:timeline,signal:deadline,writeFrames:async produce=>{
     const child=spawn(ffmpeg,['-nostdin','-v','error','-y','-threads','1','-f','image2pipe','-framerate',String(fps),
      '-vcodec','mjpeg','-i','pipe:0','-frames:v',String(to-from),'-an','-c:v','libx264','-threads','2',
      '-preset','fast','-crf',spatial?'18':'19','-maxrate',spatial?'2000k':'1000k','-bufsize',spatial?'2400k':'1500k',
      '-pix_fmt','yuv420p','-movflags','+faststart',temporary],{cwd,env,signal:deadline,stdio:['pipe','ignore','pipe']});
     let diagnostics='';
     child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(-1800);});
     child.stdin.on('error',()=>{});
     const settled=new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('close',code=>code===0?resolve():reject(new StudioError(diagnostics.trim()||'Video encoding ended before completion.')));
     });
     settled.catch(()=>{});
     try{
      await produce(bytes=>new Promise((resolve,reject)=>child.stdin.write(bytes,error=>error?reject(error):resolve())));
      child.stdin.end();await settled;
     }catch(error){child.kill();await settled.catch(()=>{});throw error;}
    }});
    await rename(join(cwd,temporary),join(cwd,name));
    await checkpoint?.record(key,[name],{from,to,fps},{stage:'frames',completedFrames:to,totalFrames:frames});
   }
   if(!await checkpoint?.has('encoded-video-'+timelineKey)){
    await writeFile(join(cwd,'segments.txt'),chunks.map(name=>`file '${name}'`).join('\n')+'\n');
    await runMediaCommand(ffmpeg,['-nostdin','-v','error','-y','-f','concat','-safe','1','-i','segments.txt',...(silent?[]:['-i','narration.wav']),
     '-map','0:v:0','-t',String(duration),'-c:v','copy',...(silent?[]:['-map','1:a:0','-c:a','aac','-b:a','96k',
     '-af','loudnorm=I=-16:TP=-1.8:LRA=10']),'-movflags','+faststart','assembled.mp4'],{...opts,env});
    await copyFile(join(cwd,'assembled.mp4'),join(cwd,'lesson.mp4'));
    await fitFilmVideo(ffmpeg,duration,{...opts,env},maxVideoBytes,silent);
    await checkpoint?.record('encoded-video-'+timelineKey,['lesson.mp4'],{}, {stage:'encoded',completedFrames:frames,totalFrames:frames});
   }
   // Publish the actual opening frame, so the poster cannot diverge from the
   // video because of an independent browser screenshot or stale tiles.
   if(!await checkpoint?.has('poster-'+timelineKey)){
    await runMediaCommand(ffmpeg,['-nostdin','-v','error','-y','-i','lesson.mp4','-frames:v','1','poster.png'],{...opts,env});
    await checkpoint?.record('poster-'+timelineKey,['poster.png']);
   }
   const poster=await readFile(join(cwd,'poster.png'));
   const pad=(n,width=2)=>String(n).padStart(width,'0');
   const stamp=value=>{
    const ms=Math.round(value*1000);
    return [pad(Math.floor(ms/3600000)),pad(Math.floor(ms/60000)%60),pad(Math.floor(ms/1000)%60)].join(':')+'.'+pad(ms%1000,3);
   };
   const captions=silent?undefined:Buffer.from('WEBVTT\n\n'+timeline.flatMap((beat,i)=>{
    const copy=lesson.beats[i].narration.trim();
    const words=copy.split(/\s+/);
    const seconds=beat.speechEnd-beat.start;
    const count=Math.min(Math.ceil(copy.length/82),Math.max(1,Math.floor(seconds/1.6)));
    const chunks=[];
    let offset=0;
    for(let remaining=count;remaining>1;remaining--){
     const ideal=(words.length-offset)/remaining;
     const first=offset+Math.max(2,Math.floor(ideal*.6));
     const last=Math.min(words.length-(remaining-1)*2,offset+Math.ceil(ideal*1.4));
     let boundary=0,best=Infinity;
     for(let i=first;i<=last;i++){
      const previous=words[i-1],next=words[i];
      if(/^(?:versus|vs\.?)$/i.test(previous)||/^(?:versus|vs\.?)$/i.test(next))continue;
      const score=Math.abs(i-offset-ideal)-(/[.!?]$/.test(previous)?3:/[,;:]$/.test(previous)?1:0);
      if(score<best){boundary=i;best=score;}
     }
     if(!boundary)break;
     chunks.push(words.slice(offset,boundary));
     offset=boundary;
    }
    chunks.push(words.slice(offset));
    let start=beat.start;
    return chunks.map((chunk,j)=>{
     const end=j===chunks.length-1?beat.speechEnd:start+seconds*chunk.length/words.length;
     const {speaker}=lesson.beats[i];
     const line=(j===0&&speaker?speaker+': ':'')+chunk.join(' ');
     const value=stamp(start)+' --> '+stamp(end)+'\n'+line.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
     start=end;
     return value;
    });
   }).join('\n\n')+'\n');
   if(captions)await writeFile(join(cwd,'captions.vtt'),captions);
   const archive=join(cwd,'source');
   await rm(archive,{recursive:true,force:true});
   await rm(join(cwd,'source.zip'),{force:true});
   await mkdir(archive,{recursive:true});
   await Promise.all(Object.entries({
    ...(spatial?{'three-r179.js':await browser.filmThreeSource(),'THREE-LICENSE.txt':await browser.filmThreeLicense()}:{}),
    ...(scene.modelBytes?{'model.glb':scene.modelBytes}:{}),
    ...(scene.modelSource?{'blender-scene.json':scene.modelSource}:{}),
    ...scene.artworkFiles,
    ...(scene.workbench?{'workbench.json':scene.workbench}:{}),
    'scene.html':scene.archiveHtml??scene.html,'scene.css':scene.css,'scene.js':scene.javascript,
    'lesson.json':JSON.stringify(lesson,null,2),'timeline.json':JSON.stringify({fps,duration,engine:scene.engine||'browser',beats:timeline},null,2),
    ...(captions?{'captions.vtt':captions,'narration.wav':await readFile(join(cwd,'narration.wav'))}:{})
   }).map(([name,bytes])=>writeFile(join(archive,name),bytes)));
   await runMediaCommand('zip',['-q','-r','source.zip','source'],{...opts,env});
   if(!silent&&(await stat(join(cwd,'source.zip'))).size>maxSourceArtifactBytes){
    // Use lossless audio compression before giving up space needed by the
    // editable model and artwork. Keep small archives in their usual format.
    await runMediaCommand(ffmpeg,['-nostdin','-v','error','-y','-i','narration.wav',
     '-c:a','flac','source/narration.flac'],{...opts,env});
    await rm(join(archive,'narration.wav'));
    await rm(join(cwd,'source.zip'));
    await runMediaCommand('zip',['-q','-r','source.zip','source'],{...opts,env});
   }
   assert((await stat(join(cwd,'source.zip'))).size<=maxSourceArtifactBytes,
    'The editable archive exceeds 8 MB. Reduce the size of source assets.');
   const output={duration,beats:timeline,narration:narration.voice,...(silent?{silent:true}:{}),renderer:spatial?'UKIO Three.js r179 and FFmpeg':'UKIO browser scene and FFmpeg'};
   await checkpoint?.record('result',resultFiles.map(([name])=>name),output,{stage:'ready',completedFrames:frames,totalFrames:frames});
   return {...output,
    artifacts:await Promise.all(resultFiles.map(async([name,mimeType])=>[name,mimeType,await readFile(join(cwd,name))]))};
  }catch(error){
   if(!signal?.aborted&&timeout.aborted)throw new StudioError('Video rendering timed out. Completed narration and frames are saved for the same request.',504);
   throw error;
  }finally{if(!recoveryDirectory)await rm(cwd,{recursive:true,force:true});}
 };
}
