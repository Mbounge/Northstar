import type { PrivateCanvasHistory } from './private-workspace';

export interface PrivateWorkspaceEntry {
  history:PrivateCanvasHistory;version:number;dirty:boolean;operationId:string;
  inFlight?:{history:PrivateCanvasHistory;version:number;operationId:string};
}
export interface CloudPrivateWorkspace {history:PrivateCanvasHistory;version:number;path:string}
export interface PrivateWorkspaceStatus {phase:'loading'|'saved'|'saving'|'offline'|'conflict';error?:string;dirty:boolean}
export interface PrivateWorkspaceSyncOptions {
  cache:{read:()=>Promise<PrivateWorkspaceEntry|undefined>;write:(entry:PrivateWorkspaceEntry)=>Promise<void>};
  remote:{read:()=>Promise<CloudPrivateWorkspace|undefined>;write:(history:PrivateCanvasHistory,expectedVersion:number,operationId:string)=>Promise<{ok:boolean;version:number;path:string|null}>};
  onStatus?:(status:PrivateWorkspaceStatus)=>void;delayMs?:number;
}

/** Personal history has its own serialized outbox. Camera traffic never resets
 * its checkpoint, and a stale device cannot overwrite another device's history.
 * Cache writes start immediately; closing a mounted workspace flushes the tail. */
export class PrivateWorkspaceSync {
  private entry?:PrivateWorkspaceEntry;
  private status:PrivateWorkspaceStatus={phase:'loading',dirty:false};
  private listeners=new Set<()=>void>();
  private timer?:ReturnType<typeof setTimeout>;
  private writing?:Promise<void>;
  private caching=Promise.resolve();
  private cacheFailed=false;
  private authorityKnown=false;
  private closed=false;
  constructor(private options:PrivateWorkspaceSyncOptions){}
  getStatus=()=>this.status;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  get dirty(){return Boolean(this.entry?.dirty||this.writing);}
  private update(phase:PrivateWorkspaceStatus['phase'],error?:string){
    const next={phase,error,dirty:this.dirty};
    if(next.phase===this.status.phase&&next.error===this.status.error&&next.dirty===this.status.dirty)return;
    this.status=next;this.options.onStatus?.(next);for(const listener of this.listeners)listener();
  }
  private checkpoint(){
    if(!this.entry)return this.caching;
    const entry={...this.entry,inFlight:this.entry.inFlight?{...this.entry.inFlight}:undefined};
    this.caching=this.caching.catch(()=>{}).then(async()=>{await this.options.cache.write(entry);this.cacheFailed=false;}).catch(()=>{
      this.cacheFailed=true;
      if(this.entry?.dirty)this.update('offline','Your private conversation is in memory. Keep this tab open until it finishes saving.');
    });return this.caching;
  }
  async open(fallback?:PrivateCanvasHistory|(()=>Promise<PrivateCanvasHistory|undefined>)){
    let cached:PrivateWorkspaceEntry|undefined;
    try{cached=await this.options.cache.read();}catch{/* Cloud can still restore the conversation. */}
    this.entry=cached;
    try{
      const cloud=await this.options.remote.read();this.authorityKnown=true;
      if(cached?.dirty){
        const accepted=cached.inFlight&&cloud?.path.endsWith(`/${cached.inFlight.operationId}.json`);
        if(accepted){const done=cached.inFlight!;this.entry={...cached,version:cloud!.version,dirty:cached.operationId!==done.operationId,inFlight:undefined};}
        else if((cloud?.version??0)!==(cached.inFlight?.version??cached.version)){
          this.update('conflict','Your conversation changed on another device. This device’s version is kept here.');return cached.history;
        }
      }else if(cloud){this.entry={history:cloud.history,version:cloud.version,dirty:false,operationId:crypto.randomUUID()};}
      if(!this.entry){
        const history=typeof fallback==='function'?await fallback():fallback;
        if(history)this.entry={history,version:0,dirty:true,operationId:crypto.randomUUID()};
      }
      await this.checkpoint();
      this.update(this.entry?.dirty?'saving':'saved');if(this.entry?.dirty)this.schedule();
      return this.entry?.history;
    }catch{
      if(!this.entry){const history=typeof fallback==='function'?await fallback():fallback;if(history)this.entry={history,version:0,dirty:true,operationId:crypto.randomUUID()};}
      this.update('offline','Private history could not sync. Your work stays on this device; retry when connected.');return this.entry?.history;
    }
  }
  observe(history:PrivateCanvasHistory){
    if(this.closed)return;
    // The workspace uses immutable chat turns and settings. Ignore repeated
    // camera snapshots without serializing transcript/media on the input path.
    const previous=this.entry?.history;
    if(previous&&previous.turns===history.turns&&previous.draft===history.draft&&previous.attachments===history.attachments&&previous.model===history.model&&previous.effort===history.effort&&previous.memory===history.memory)return;
    this.entry={history,version:this.entry?.version??0,dirty:true,operationId:crypto.randomUUID(),inFlight:this.entry?.inFlight};
    void this.checkpoint();
    if(this.status.phase!=='conflict')this.update(this.authorityKnown?'saving':'offline',this.authorityKnown?undefined:this.status.error);
    this.schedule();
  }
  private schedule(){if(this.timer||this.closed||this.status.phase==='conflict')return;this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},this.options.delayMs??900);}
  flush():Promise<void>{
    clearTimeout(this.timer);this.timer=undefined;
    if(this.writing)return this.writing;
    if(this.status.phase==='conflict')return this.caching;
    if(!this.entry?.dirty){
      if(this.authorityKnown)return this.caching;
      this.writing=(async()=>{
        try{
          const cloud=await this.options.remote.read();
          if((cloud?.version??0)!==(this.entry?.version??0)){
            this.update('conflict','Newer private history is available. Your current conversation stays here until you open the saved chat.');return;
          }
          this.authorityKnown=true;this.update('saved');
        }catch{this.update('offline','Private history could not sync. Your work stays on this device; retry when connected.');}
      })().finally(()=>{this.writing=undefined;});return this.writing;
    }
    let synchronized=false;
    this.writing=(async()=>{
      try{
        if(!this.authorityKnown){
          const cloud=await this.options.remote.read();
          const flight=this.entry!.inFlight;
          if(flight&&cloud?.path.endsWith(`/${flight.operationId}.json`)){
            this.entry={...this.entry!,version:cloud.version,dirty:this.entry!.operationId!==flight.operationId,inFlight:undefined};await this.checkpoint();
          }else if((cloud?.version??0)!==(flight?.version??this.entry!.version)){
            this.update('conflict','Your conversation changed on another device. This device’s version is kept here.');return;
          }
          this.authorityKnown=true;
        }
        this.update('saving');
        while(this.entry?.dirty){
          const current=this.entry;
          const operation=current.inFlight??{history:current.history,version:current.version,operationId:current.operationId};
          this.entry={...current,inFlight:operation};await this.checkpoint();
          const result=await this.options.remote.write(operation.history,operation.version,operation.operationId);
          if(!result.ok){this.update('conflict','Your conversation changed on another device. This device’s version is kept here.');return;}
          const latest=this.entry!;
          this.entry={...latest,version:result.version,inFlight:undefined,dirty:latest.operationId!==operation.operationId};
          await this.checkpoint();
        }
        synchronized=true;
      }catch{this.update('offline',this.cacheFailed?'Your private conversation is in memory. Keep this tab open until it finishes saving.':'Your private conversation is saved on this device. Cloud sync will retry when connected.');}
    })().finally(()=>{this.writing=undefined;if(synchronized||(this.status.phase!=='conflict'&&this.status.phase!=='offline'))this.update(this.entry?.dirty?'saving':'saved');});
    return this.writing;
  }
  async useSavedHistory(){
    const cloud=await this.options.remote.read();if(!cloud)throw new Error('Saved private history is not available yet. Your local version is still kept.');
    this.entry={history:cloud.history,version:cloud.version,dirty:false,operationId:crypto.randomUUID()};this.authorityKnown=true;
    await this.checkpoint();this.update('saved');return cloud.history;
  }
  getHistory(){return this.entry?.history;}
  close(){this.closed=true;clearTimeout(this.timer);this.timer=undefined;void this.checkpoint();return this.flush();}
}
