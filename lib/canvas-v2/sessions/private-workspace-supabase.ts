'use client';
import { createClient } from '@/lib/supabase/client';
import { encodePrivateCanvasHistory, decodePrivateCanvasHistory, type PrivateCanvasHistory } from './private-workspace';
import type { CloudPrivateWorkspace } from './private-workspace-sync';

type Database=ReturnType<typeof createClient>;
const bucket='northstar-sessions';
interface Metadata {version:number;path:string|null}
export class SupabasePrivateWorkspace {
  private previousPath?:string;
  private prepared=new Map<string,Promise<Blob>>();
  constructor(private sessionId:string,private userId:string,private db:Database=createClient()){}
  private async metadata():Promise<Metadata|undefined>{
    const {data,error}=await this.db.rpc('northstar_canvas_private_read',{sid:this.sessionId});
    if(error)throw new Error(error.message);
    if(data===null)return undefined;
    if(!data||!Number.isSafeInteger(data.version)||data.version<0||data.path!==null&&typeof data.path!=='string')throw new Error('Private history returned an invalid save receipt.');
    if(data.path&&!this.validPath(data.path))throw new Error('Private history returned an invalid storage path.');
    return data;
  }
  private validPath(path:string){return path.startsWith(`${this.userId}/${this.sessionId}/private/`)&&/\/private\/[\da-f-]{36}\.json$/.test(path);}
  async read():Promise<CloudPrivateWorkspace|undefined>{
    for(let attempt=0;attempt<3;attempt++){
      const meta=await this.metadata();if(!meta?.path)return undefined;
      const result=await this.db.storage.from(bucket).download(meta.path);
      if(result.error||!result.data){const fresh=await this.metadata();if(fresh?.path!==meta.path)continue;throw new Error(result.error?.message||'Your private conversation could not be opened.');}
      const history=await decodePrivateCanvasHistory(result.data);this.previousPath=meta.path;
      return {history,version:meta.version,path:meta.path};
    }
    throw new Error('Your conversation is still saving on another device. Try again shortly.');
  }
  async write(history:PrivateCanvasHistory,expectedVersion:number,operationId:string):Promise<{ok:boolean;version:number;path:string|null}>{
    if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(operationId))throw new Error('Invalid private history save identity.');
    const path=`${this.userId}/${this.sessionId}/private/${operationId}.json`;
    let preparing=this.prepared.get(operationId);
    if(!preparing){preparing=encodePrivateCanvasHistory(history);this.prepared.set(operationId,preparing);}
    let blob:Blob;try{blob=await preparing;}catch(error){if(this.prepared.get(operationId)===preparing)this.prepared.delete(operationId);throw error;}
    const upload=await this.db.storage.from(bucket).upload(path,blob,{contentType:'application/json',upsert:false});
    if(upload.error&&String((upload.error as {statusCode?:string|number}).statusCode)!=='409')throw new Error(upload.error.message);
    const {data,error}=await this.db.rpc('northstar_canvas_private_save',{sid:this.sessionId,expected_version:expectedVersion,path});
    if(error)throw new Error(error.message);
    if(!data||typeof data.ok!=='boolean'||!Number.isSafeInteger(data.version)||data.version<0||data.path!==null&&typeof data.path!=='string')throw new Error('Private history returned an invalid save receipt.');
    if(data.ok){
      const previous=this.previousPath;this.previousPath=path;this.prepared.delete(operationId);
      if(previous&&previous!==path)void this.db.storage.from(bucket).remove([previous]);
    }
    return data;
  }
}
