import type { NorthstarSession, NorthstarSnapshot } from './types';

export function sameSoloSnapshotContent(before:NorthstarSnapshot|undefined|null,next:NorthstarSnapshot){
 return Boolean(before&&before.revision===next.revision&&before.turns===next.turns&&before.draft===next.draft&&before.attachments===next.attachments&&before.model===next.model&&before.effort===next.effort&&before.memory===next.memory);
}
export interface SoloRecoveryEntry { id:string; blob:Blob; basePaths:Array<string|null> }
export interface SoloRecoveryCache { claim?():Promise<void>; read():Promise<SoloRecoveryEntry|undefined>; write(entry:SoloRecoveryEntry):Promise<boolean|void>; clear(expectedIds?:readonly string[]):Promise<void> }
/** Account/tab-scoped portable recovery, separate from the authoritative cloud
 * snapshot. Only a recognized cloud path permits automatic replay. */
export class SoloSnapshotRecovery {
 private latest?:NorthstarSnapshot;
 private candidate?:SoloRecoveryEntry;
 private paths=new Set<string|null>();
 private generation=0;
 private ownedIds=new Set<string>();
 private task?:Promise<void>;
 private disk=Promise.resolve();
 private encoded=new WeakMap<NorthstarSnapshot,Promise<Blob>>();
 private pending=false;
 constructor(private options:{cache:SoloRecoveryCache;encode:(snapshot:NorthstarSnapshot)=>Promise<Blob>;decode:(blob:Blob)=>Promise<NorthstarSnapshot>;onError?:(message:string)=>void}){}
 get dirty(){return this.pending;}
 async open(session:NorthstarSession){
  this.paths.add(session.snapshot_path);
  await this.options.cache.claim?.();
  const entry=await this.options.cache.read();
  if(!entry)return undefined;
  this.candidate=entry;this.ownedIds.add(entry.id);
  const snapshot=await this.options.decode(entry.blob);
  return {snapshot,safe:entry.basePaths.includes(session.snapshot_path)};
 }
 observe(snapshot:NorthstarSnapshot){
  const before=this.latest;
  // Camera-only checkpoints must not serialize a board or personal history.
  if(sameSoloSnapshotContent(before,snapshot))return;
  this.latest=snapshot;
  this.generation++;this.pending=true;void this.flush();
 }
 blobFor(snapshot:NorthstarSnapshot){
  let result=this.encoded.get(snapshot);
  if(!result){result=this.options.encode(snapshot);this.encoded.set(snapshot,result);result.catch(()=>this.encoded.delete(snapshot));}
  return result;
 }
 private write(action:()=>Promise<void>){
  this.disk=this.disk.catch(()=>{}).then(action);return this.disk;
 }
 flush():Promise<void>{
  if(this.task)return this.task;
  if(!this.pending||!this.latest)return Promise.resolve();
  let failed=false;
  this.task=(async()=>{
   while(this.pending&&this.latest){
    const version=this.generation,snapshot=this.latest;
    try{
     const blob=await this.blobFor(snapshot);
     if(version!==this.generation)continue;
     const entry={id:crypto.randomUUID(),blob,basePaths:[...this.paths]};
     this.ownedIds.add(entry.id);
     let persisted:boolean|void;
     await this.write(async()=>{persisted=await this.options.cache.write(entry);});
     // A reopened workspace owns this journal now. An encoder finishing in
     // the retired producer must never overwrite its newer durable draft.
     if(persisted! === false){this.pending=false;return;}
     if(version===this.generation){this.candidate=entry;this.pending=false;}
    }catch{failed=true;this.options.onError?.('Your latest changes are still in memory. Keep this tab open until they finish saving.');return;}
   }
  })().finally(()=>{this.task=undefined;if(!failed&&this.pending&&this.latest)void this.flush();});
  return this.task;
 }
 async accepted(snapshot:NorthstarSnapshot,session:NorthstarSession){
  this.paths.add(session.snapshot_path);
  // A late acknowledgement can clear only its own draft, never a newer edit.
  if(sameSoloSnapshotContent(this.latest,snapshot)){
   this.generation++;this.pending=false;this.candidate=undefined;
   this.paths=new Set([session.snapshot_path]);
   try{await this.write(()=>this.options.cache.clear([...this.ownedIds]));}
   catch{this.options.onError?.('Your canvas is saved online. Local recovery cleanup will be retried when you save again.');}
  }else if(this.latest){
   this.generation++;this.pending=true;await this.flush();
  }
 }
 async clear(){this.generation++;this.pending=false;this.candidate=undefined;await this.write(()=>this.options.cache.clear());}
}

export function soloRecoveryCache(userId:string,sessionId:string,writer:string):SoloRecoveryCache{
 const key=`${userId}:${sessionId}:${writer}`;
 const ownerKey=`${key}:owner`,owner=crypto.randomUUID();
 let claimed=false;
 const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('northstar-solo-recovery',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 const transaction=async<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>=>{
  const db=await open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts',mode),request=action(tx.objectStore('drafts'));
   tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};
  });
 };
 // The owner check and mutation share one transaction. It also protects
 // separate cache instances during a same-tab workspace remount.
 const ownedMutation=async(action:(store:IDBObjectStore)=>void):Promise<boolean>=>{
  const db=await open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');
   let accepted=false;
   const read=store.get(ownerKey);read.onsuccess=()=>{
    if(!claimed||read.result===owner){accepted=true;action(store);}
   };
   tx.oncomplete=()=>{db.close();resolve(accepted);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};
  });
 };
 return {
  claim:async()=>{await transaction('readwrite',store=>store.put(owner,ownerKey));claimed=true;},
  read:()=>transaction('readonly',store=>store.get(key)),
  write:entry=>ownedMutation(store=>{store.put(entry,key);}),
  clear:async expectedIds=>{await ownedMutation(store=>{
   const read=store.get(key);read.onsuccess=()=>{const current=read.result as SoloRecoveryEntry|undefined;if(!expectedIds||!current||expectedIds.includes(current.id))store.delete(key);};
  });},
 };
}
