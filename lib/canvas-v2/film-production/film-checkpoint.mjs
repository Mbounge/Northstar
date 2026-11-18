import {mkdir,readFile,writeFile,rename,link,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {assert} from './studio-errors.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function canonical(value){
 if(Buffer.isBuffer(value))return {bytes:value.length,sha256:hash(value)};
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export const filmFingerprint=value=>hash(JSON.stringify(canonical(value)));
export async function publishFilmFile(directory,filename,bytes,sha256){
 assert(/^[a-f0-9]{64}\.(?:mp4|vtt|png|zip)$/.test(filename)&&filename.startsWith(sha256+'.')&&hash(bytes)===sha256,'The film asset does not match its publication hash.',409);
 await mkdir(directory,{recursive:true});
 const target=join(directory,filename),temp=target+'.'+randomUUID()+'.tmp';
 try{
  await writeFile(temp,bytes,{flag:'wx',mode:0o600});
  // link is an atomic no-clobber publication. A crash before this point leaves
  // no public file; after it, readers get the complete, immutable inode.
  try{await link(temp,target);}catch(error){if(error.code!=='EEXIST')throw error;assert(hash(await readFile(target))===sha256,'Stored explainer bytes changed.',409);}
 }finally{await rm(temp,{force:true});}
}
const filePath=(directory,name)=>{assert(typeof name==='string'&&/^[\w./-]+$/.test(name)&&!name.startsWith('/')&&!name.split('/').includes('..'),'Invalid saved film file.');return join(directory,name);};
async function verifiedStage(directory,stage){
 if(!stage)return false;
 try{for(const file of stage.files){const bytes=await readFile(filePath(directory,file.name));if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)return false;}return true;}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
}
export async function hasSavedFilmOutput(directory){
 let state;try{state=JSON.parse(await readFile(join(directory,'checkpoint.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return false;throw error;}
 if(state.version!==1)return false;
 for(const [key,stage] of Object.entries(state.stages))if((key==='result'||key.startsWith('encoded-video-'))&&await verifiedStage(directory,stage))return true;
 return false;
}

// This directory is owned by one durable tool receipt, never supplied by scene code.
// A stage is reusable only after its atomic receipt and all file hashes agree.
export async function openFilmCheckpoint(directory,input,{onProgress=async()=>{}}={}){
 await mkdir(directory,{recursive:true});
 const path=join(directory,'checkpoint.json'),identity=filmFingerprint(input);
 let state;
 try{state=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(state)assert(state.version===1&&state.identity===identity,'The saved film belongs to different render input.',409);
 else state={version:1,identity,stages:{}};
 const save=async()=>{const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});await rename(temp,path);};
 if(!state.updatedAt){state.updatedAt=new Date().toISOString();await save();}
 const has=key=>verifiedStage(directory,state.stages[key]);
 return {directory,identity,has,
  signature(key){return filmFingerprint(state.stages[key]?.files||[]);},
  async data(key){return await has(key)?structuredClone(state.stages[key].data):undefined;},
  async record(key,names,data={},progress){
   const files=[];
   for(const name of names){const bytes=await readFile(filePath(directory,name));assert(bytes.length>0,'A saved film stage cannot contain an empty file.');files.push({name,bytes:bytes.length,sha256:hash(bytes)});}
   state.stages[key]={files,data,completedAt:new Date().toISOString()};
   state.updatedAt=new Date().toISOString();await save();
   if(progress)await onProgress({...progress,checkpoint:key});
  }
 };
}
