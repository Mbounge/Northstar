import { readFile, writeFile, mkdir, mkdtemp, readdir, rename, link, rm, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';

export const IMAGEGEN_RELAY_ROOT = join(tmpdir(), 'northstar-imagegen-relay');
export const IMAGEGEN_PROTOCOL = 'northstar.subscription-imagegen.v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => JSON.stringify(value);
const atomic = async (path, value) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, encode(value), { mode: 0o600 });
  await rename(temporary, path);
};
const read = async path => JSON.parse(await readFile(path, 'utf8'));

export function pngInfo(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.length > 16_000_000 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Return the actual bounded PNG artifact from image_gen.imagegen.');
  let offset=8, width=0, height=0, data=false, end=false;
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset), type=bytes.subarray(offset+4,offset+8).toString('ascii');
    if(offset+12+length>bytes.length)throw new Error('The PNG artifact is truncated.');
    if(offset===8){if(type!=='IHDR'||length!==13)throw new Error('Invalid PNG image header.');width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);}
    if(type==='IDAT')data=true;
    offset+=length+12;
    if(type==='IEND'){if(length!==0||offset!==bytes.length)throw new Error('Invalid PNG ending.');end=true;break;}
  }
  if(!data||!end||width<1||height<1||width>8192||height>8192||width*height>16_000_000)throw new Error('Return a complete PNG with bounded actual dimensions.');
  return { width,height,bytes:bytes.length,sha256:hash(bytes) };
}

export async function createImageGenerationRequest(root, payload, inputFiles = []) {
  await mkdir(root,{recursive:true,mode:0o700});
  const jobPath=await mkdtemp(join(root,'image-job-'));
  const inputs=[];
  try{
    for(const [index,file] of inputFiles.entries()){
      const extension={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'}[file.mimeType];
      if(!extension)throw new Error('Only approved retained image input bytes can be relayed.');
      const path=join(jobPath,`input-${index}.${extension}`);await writeFile(path,file.bytes,{mode:0o600,flag:'wx'});
      inputs.push({id:file.id,reference:file.reference,path,mimeType:file.mimeType,sha256:hash(file.bytes),bytes:file.bytes.length,hasAlpha:Boolean(file.hasAlpha)});
    }
    const background=payload.arguments.background??'auto';
    const toolArguments={prompt:payload.arguments.prompt,...(background==='auto'?(inputs.some(input=>input.hasAlpha)?{transparent_background:true}:{}):{transparent_background:background==='transparent'}),...(inputs.length?{referenced_image_paths:inputs.map(input=>input.path)}:{})};
    const request={protocol:IMAGEGEN_PROTOCOL,jobPath,nonce:randomUUID(),createdAt:new Date().toISOString(),...payload,inputs,tool:'image_gen.imagegen',toolArguments};
    request.requestHash=hash(encode(request));
    await writeFile(join(jobPath,'request.json'),encode(request),{mode:0o600,flag:'wx'});
    await atomic(join(jobPath,'status.json'),{state:'pending',requestHash:request.requestHash,nonce:request.nonce});
    return request;
  }catch(error){await rm(jobPath,{recursive:true,force:true});throw error;}
}

export async function readImageGenerationRequest(jobPath, expectedHash) {
  const path=resolve(jobPath), request=await read(join(path,'request.json'));
  const {requestHash,...contents}=request;
  if(request.protocol!==IMAGEGEN_PROTOCOL||request.jobPath!==path||requestHash!==hash(encode(contents))||expectedHash!==undefined&&requestHash!==expectedHash)throw new Error('Image request is stale, changed or belongs to another job.');
  const status=await read(join(path,'status.json'));
  if(status.requestHash!==requestHash||status.nonce!==request.nonce)throw new Error('Image job identity changed.');
  return {request,status};
}

export async function claimImageGeneration(jobPath, expectedHash) {
  const {request,status}=await readImageGenerationRequest(jobPath,expectedHash);
  if(!['pending'].includes(status.state))throw new Error(`Image job is ${status.state}; do not generate another image.`);
  for(const input of request.inputs){if(input.path!==join(request.jobPath,`input-${request.inputs.indexOf(input)}.${{'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'}[input.mimeType]}`)||hash(await readFile(input.path))!==input.sha256)throw new Error('Approved input image bytes changed before generation.');}
  const claimPath=join(request.jobPath,'claim.json'),temporary=`${claimPath}.${randomUUID()}.tmp`;
  await writeFile(temporary,encode({requestHash:request.requestHash,nonce:request.nonce,executor:'codex-built-in-imagegen',claimedAt:new Date().toISOString()}),{mode:0o600});
  try{try{await link(temporary,claimPath);}catch(error){if(error.code!=='EEXIST')throw error;return {status:'already-claimed',request,note:'Do not repeat generation. Recover the existing tool result.'};}}
  finally{await rm(temporary,{force:true});}
  return {status:'claimed',request};
}

export async function setImageGenerationState(request, state, detail) {
  await atomic(join(request.jobPath,'status.json'),{state,requestHash:request.requestHash,nonce:request.nonce,...(detail?{detail:String(detail).slice(0,800)}:{})});
}

export async function submitImageGenerationArtifact(jobPath, expectedHash, artifactPath) {
  const {request,status}=await readImageGenerationRequest(jobPath,expectedHash);
  if(!['pending','completed'].includes(status.state))throw new Error(`Image job is ${status.state}; late results are rejected.`);
  const claim=await read(join(request.jobPath,'claim.json')).catch(()=>null);
  if(!claim||claim.requestHash!==request.requestHash||claim.nonce!==request.nonce)throw new Error('Claim this exact job before invoking the built-in image tool.');
  const info=await stat(artifactPath);
  if(!info.isFile()||info.size>16_000_000)throw new Error('Return a bounded actual PNG file from the built-in tool.');
  const bytes=await readFile(artifactPath), metadata=pngInfo(bytes);
  const response={protocol:IMAGEGEN_PROTOCOL,requestHash:request.requestHash,nonce:request.nonce,callId:request.callId,tool:'image_gen.imagegen',executor:'codex-built-in-imagegen',artifact:'result.png',...metadata};
  const responsePath=join(request.jobPath,'response.json');
  const existing=await read(responsePath).catch(()=>null);
  if(existing){if(encode(existing)!==encode(response))throw new Error('An image result already exists. Different or curated replacements are rejected.');return {status:'already-submitted',...response};}
  if(status.state!=='pending')throw new Error('The completed job has no replaceable result.');
  const artifact=join(request.jobPath,'result.png');
  await writeFile(artifact,bytes,{mode:0o600,flag:'wx'});
  try{
    const current=await readImageGenerationRequest(jobPath,expectedHash);
    if(current.status.state!=='pending')throw new Error('The job stopped before its result could be submitted.');
    const temporary=`${responsePath}.${randomUUID()}.tmp`;await writeFile(temporary,encode(response),{mode:0o600});
    try{await link(temporary,responsePath);}finally{await rm(temporary,{force:true});}
    return {status:'submitted',...response};
  }catch(error){await rm(artifact,{force:true});throw error;}
}

export async function listImageGenerationRequests(root = IMAGEGEN_RELAY_ROOT) {
  const path=resolve(root);let names;
  try{names=await readdir(path);}catch(error){if(root===IMAGEGEN_RELAY_ROOT&&error.code==='ENOENT')return [];throw error;}
  const paths=names.includes('request.json')?[path]:names.filter(name=>name.startsWith('image-job-')).map(name=>join(path,name));
  const jobs=[];
  for(const jobPath of paths){try{const {request,status}=await readImageGenerationRequest(jobPath);if(status.state==='pending')jobs.push({...request,job:basename(jobPath),claimed:Boolean(await stat(join(jobPath,'claim.json')).catch(()=>null)),submitted:Boolean(await stat(join(jobPath,'response.json')).catch(()=>null))});}catch{/* Incomplete or stopped jobs are not executable. */}}
  return jobs;
}

export async function waitImageGenerationArtifact(request, signal, timeoutMs=600_000, pollMs=100) {
  const started=Date.now();
  try{
    while(Date.now()-started<timeoutMs){
      signal.throwIfAborted();const {status}=await readImageGenerationRequest(request.jobPath,request.requestHash);
      if(status.state!=='pending')throw new Error(`Image job is ${status.state}.`);
      const response=await read(join(request.jobPath,'response.json')).catch(()=>null);
      if(response){
        if(response.protocol!==IMAGEGEN_PROTOCOL||response.nonce!==request.nonce||response.requestHash!==request.requestHash||response.callId!==request.callId||response.tool!=='image_gen.imagegen'||response.executor!=='codex-built-in-imagegen'||response.artifact!=='result.png')throw new Error('Image result provenance or request identity does not match.');
        for(const input of request.inputs)if(hash(await readFile(input.path))!==input.sha256)throw new Error('Approved input image bytes changed during generation.');
        const bytes=await readFile(join(request.jobPath,'result.png')),metadata=pngInfo(bytes);
        if(metadata.sha256!==response.sha256||metadata.width!==response.width||metadata.height!==response.height||metadata.bytes!==response.bytes)throw new Error('Image result bytes changed after submission.');
        signal.throwIfAborted();return {bytes,metadata,response};
      }
      await new Promise(resolve=>setTimeout(resolve,pollMs));
    }
    throw new Error('The built-in image generation job timed out; generation was not confirmed.');
  }catch(error){await setImageGenerationState(request,signal.aborted?'cancelled':'failed',error.message);throw error;}
}
