import type { PrivateWorkspaceEntry } from './private-workspace-sync';
import type { NorthstarSnapshot } from './types';

export type PrivateCanvasWorkspace = Omit<NorthstarSnapshot, 'revision' | 'schema'>;
/** Private chat, draft, settings and camera remain on this account's device. */
export function privateCanvasWorkspace(userId: string, sessionId: string) {
  const key = `${userId}:${sessionId}`;
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('northstar-private-workspaces', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('views');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const readRecord=async <T>(recordKey:string):Promise<T|undefined>=>{
    const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('views'),request=tx.objectStore('views').get(recordKey);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();});
  };
  const writeRecord=async(recordKey:string,value:unknown)=>{
    const db=await open();return new Promise<void>((resolve,reject)=>{const tx=db.transaction('views','readwrite');tx.objectStore('views').put(value,recordKey);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});
  };
  const historyCacheFor=(clientId:string)=>{
    const branchKey=`${key}:private-history:${clientId}`,cleanKey=`${key}:private-history`;
    return {
      read:async()=>{
        const [branch,clean]=await Promise.all([readRecord<PrivateWorkspaceEntry>(branchKey),readRecord<PrivateWorkspaceEntry>(cleanKey)]);
        if(branch?.dirty)return branch;
        if(clean&&!clean.dirty&&(!branch||clean.version>branch.version))return clean;
        return branch;
      },
      write:async(entry:PrivateWorkspaceEntry)=>{
        const db=await open();return new Promise<void>((resolve,reject)=>{
          const tx=db.transaction('views','readwrite'),store=tx.objectStore('views');
          store.put(entry,branchKey);
          // Only clean, monotonically newer receipts enter the account cache.
          // Another tab can never replace this tab's dirty recovery branch.
          if(!entry.dirty){const existing=store.get(cleanKey);existing.onsuccess=()=>{const clean=existing.result as PrivateWorkspaceEntry|undefined;if(!clean||clean.dirty||clean.version<=entry.version)store.put(entry,cleanKey);};}
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
        });
      },
    };
  };
  return {
    historyCacheFor,
    historyCache:{read:()=>readRecord<PrivateWorkspaceEntry>(`${key}:private-history`),write:(entry:PrivateWorkspaceEntry)=>writeRecord(`${key}:private-history`,entry)},
    writeCamera:(viewport:NorthstarSnapshot['viewport'])=>writeRecord(`${key}:camera`,viewport),
    readCamera:()=>readRecord<NorthstarSnapshot['viewport']>(`${key}:camera`),
    read: async () => {
      const db = await open();
      return new Promise<PrivateCanvasWorkspace | undefined>((resolve, reject) => {
        const transaction = db.transaction('views'), request = transaction.objectStore('views').get(key);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      });
    },
    write: async (snapshot: NorthstarSnapshot) => {
      const db = await open();
      const local:PrivateCanvasWorkspace={turns:snapshot.turns,draft:snapshot.draft,attachments:snapshot.attachments,model:snapshot.model,effort:snapshot.effort,viewport:snapshot.viewport,memory:snapshot.memory};
      // Common visible assets are reconstructed from shared evidence. Retain
      // account-only working context privately without duplicating those blobs.
      const value = { ...local, memory: local.memory ? { ...local.memory, assets: [] } : undefined };
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('views', 'readwrite'); transaction.objectStore('views').put(value, key);
        transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => { db.close(); reject(transaction.error); };
      });
    },
  };
}
