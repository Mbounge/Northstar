import { actualImageType } from '@/lib/canvas-v2/source-media.server';
import { creativeArtifact } from '@/lib/canvas-v2/creative/runtime.server';
import type { CreativeContext, CreativeResult } from '@/lib/canvas-v2/creative/types';
import { string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';
import { IMAGEGEN_RELAY_ROOT, createImageGenerationRequest, waitImageGenerationArtifact, setImageGenerationState } from '../../../scripts/northstar-imagegen-protocol.mjs';

export type SubagentImageOptions = { root: string; timeoutMs: number; pollMs: number };

/** Test transport for a real pending Northstar image call. The controlling
 * Codex executes the immutable request with its built-in image tool; normal
 * creative polling and generated-asset retention receive the actual pixels. */
export async function runSubagentImageGeneration(callId: string, args: JsonObject, context: CreativeContext, signal: AbortSignal, options: Partial<SubagentImageOptions> = {}): Promise<CreativeResult> {
  signal.throwIfAborted();
  const prompt=string(args.prompt),label=string(args.label);
  if(!prompt.trim()||prompt.length>32000||!label.trim()||label.length>160)throw new Error('Provide the author image prompt and label.');
  if(Object.keys(args).some(key=>!['prompt','label','inputAssetIds','size','quality','background'].includes(key)))throw new Error('Use only the registered image request parameters.');
  const choice=(key:string,values:string[],fallback:string)=>{const value=args[key]??fallback;if(typeof value!=='string'||!values.includes(value))throw new Error(`Invalid image ${key}.`);return value;};
  const size=choice('size',['1024x1024','1536x1024','1024x1536','auto'],'auto'),quality=choice('quality',['low','medium','high','auto'],'medium');
  choice('background',['opaque','transparent','auto'],'auto');
  const refs=args.inputAssetIds??[];
  if(!Array.isArray(refs)||refs.length>16||refs.some(ref=>typeof ref!=='string'))throw new Error('Use at most 16 retained input image handles.');
  const inputFiles=[];let total=0;
  for(const ref of refs){
    const input=context.inputs.find(input=>input.reference===ref),match=input&&/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(input.dataUrl);
    if(!input||!match||match[2].length>8_000_000)throw new Error('Image edits require explicitly authorized retained image bytes.');
    const bytes=Buffer.from(match[2],'base64'),mimeType=actualImageType(bytes);total+=bytes.length;
    if(!mimeType||!['image/png','image/jpeg','image/webp'].includes(mimeType)||mimeType!==`image/${match[1]}`||!bytes.length||total>6_000_000)throw new Error('Retained image edits exceed the 6 MB input limit or declared image format.');
    inputFiles.push({id:input.id,reference:input.reference,bytes,mimeType,hasAlpha:mimeType==='image/png'&&(bytes[25]===4||bytes[25]===6||bytes.includes(Buffer.from('tRNS')))});
  }
  signal.throwIfAborted();
  const request=await createImageGenerationRequest(options.root??IMAGEGEN_RELAY_ROOT,{callId,arguments:JSON.parse(JSON.stringify(args)),requestedOptions:{size,quality},timeoutMs:options.timeoutMs??600_000,note:'Exact author request. Built-in transport does not expose API size/quality controls; inspect actual dimensions and pixels.'},inputFiles);
  const abort=()=>{void setImageGenerationState(request,'cancelled','The author stopped or the image job was released.');};
  signal.addEventListener('abort',abort,{once:true});
  try{
    signal.throwIfAborted();
    const {bytes,metadata}=await waitImageGenerationArtifact(request,signal,options.timeoutMs??600_000,options.pollMs??100);
    if(actualImageType(bytes)!=='image/png')throw new Error('The built-in image tool did not return an actual PNG.');
    signal.throwIfAborted();
    const {artifact,asset}=creativeArtifact(bytes,`northstar-${request.nonce.slice(0,8)}.png`,label,'generated',inputFiles.map(input=>input.id));
    if(!asset)throw new Error('Image output could not be retained as a generated asset.');
    asset.tags=[...(asset.tags??[]),'transport:codex-built-in-imagegen',`generation-request:${request.requestHash}`];
    asset.description=`AI-generated image from the author’s image request via Codex built-in image generation. Actual dimensions ${metadata.width}×${metadata.height}. Not documentary evidence.`;
    await setImageGenerationState(request,'completed');
    signal.throwIfAborted();
    return {summary:inputFiles.length?'Created an edited image; the original is preserved.':'Created an original image.',artifacts:[artifact],assets:[asset],warnings:[`Generation used the Codex built-in tool transport. Requested API size ${size} and quality ${quality} are recorded but are not directly configurable through this transport; actual PNG dimensions are ${metadata.width}×${metadata.height}.`]};
  }catch(error){await setImageGenerationState(request,signal.aborted?'cancelled':'failed',error instanceof Error?error.message:'Image job failed.');throw error;}
  finally{signal.removeEventListener('abort',abort);}
}
