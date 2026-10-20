'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasV2Workspace } from './canvas-v2-workspace';
import { SoloSnapshotRecovery, soloRecoveryCache, sameSoloSnapshotContent } from '@/lib/canvas-v2/sessions/solo-recovery';
import { encodeSnapshot, decodeSnapshotBlob } from '@/lib/canvas-v2/sessions/snapshot';
import { SnapshotQueue } from '@/lib/canvas-v2/sessions/snapshot';
import { getSession, leaseSession, loadSnapshot, renameSession, saveSnapshot } from '@/lib/canvas-v2/sessions/store';
import type { LiveSessionState, SessionCommand, NorthstarSession, NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';
import { claimSessionWriter } from '@/lib/canvas-v2/sessions/writer';
import { CanvasCollaborationClient } from '@/lib/canvas-v2/sessions/collaboration-client';
import { SupabaseCanvasTransport, canvasCollaborationJournal } from '@/lib/canvas-v2/sessions/collaboration-supabase';
import { privateCanvasWorkspace } from '@/lib/canvas-v2/sessions/collaboration-local';
import { PrivateWorkspaceSync, type PrivateWorkspaceStatus } from '@/lib/canvas-v2/sessions/private-workspace-sync';
import { privateCanvasHistory, type PrivateCanvasHistory } from '@/lib/canvas-v2/sessions/private-workspace';
import { SupabasePrivateWorkspace } from '@/lib/canvas-v2/sessions/private-workspace-supabase';
import { CANVAS_V2_DEFAULT_MODEL } from '@/lib/canvas-v2/model-catalog';
import { centeredCanvasV2WorkspaceViewport } from '@/lib/canvas-v2/workspace-coordinate-space';
import { createClient } from '@/lib/supabase/client';
import type { CanvasV2ArtifactRevision } from '@/lib/canvas-v2/types';
import { LiveSessionChannel } from '@/lib/canvas-v2/sessions/live-channel';

export function SessionWorkspace({id, temporary, owner, agentEndpoint}: {id:string; temporary:boolean; owner:string; agentEndpoint?:string}) {
  const [loaded,setLoaded] = useState<{snapshot?:NorthstarSnapshot} | null>(null);
  const [title,setTitle] = useState('Untitled canvas');
  const [error,setError] = useState('');
  const [replica,setReplica] = useState<LiveSessionState>();
  const [generation,setGeneration] = useState(0);
  const recovery=useRef<SoloSnapshotRecovery|undefined>(undefined);
  const [recovered,setRecovered]=useState<NorthstarSnapshot>();
  const recoveredRef=useRef<NorthstarSnapshot|undefined>(undefined);
  const [collaboration,setCollaboration]=useState<CanvasCollaborationClient>();
  const collaborationRef=useRef<CanvasCollaborationClient|undefined>(undefined);
  const localView=useRef(privateCanvasWorkspace(owner,id));
  const privateSave=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const personal=useRef<PrivateWorkspaceSync|undefined>(undefined);
  const privateOpening=useRef<Promise<PrivateCanvasHistory|undefined>|undefined>(undefined);
  const privateClientId=useRef('');
  const [privateStatus,setPrivateStatus]=useState<PrivateWorkspaceStatus>();
  const blockedRef = useRef(false);
  const writerClaim = useRef<Promise<string> | null>(null);
  const record = useRef<NorthstarSession | null>(null);
  const writer = useRef('');
  const queue = useRef<SnapshotQueue<NorthstarSnapshot> | null>(null);
  const latest = useRef<NorthstarSnapshot | null>(null);
  const busy = useRef(false);
  const channel = useRef<LiveSessionChannel | null>(null);
  const controller = useRef<((command:SessionCommand)=>Promise<void>) | null>(null);
  const receivedRevisions=useRef(new Set<string>());
  const sentRevision=useRef('');
  const lastReport=useRef('');
  const titleRef = useRef(title); titleRef.current = title;
  const report = useCallback((extra: Record<string,unknown> = {}) => {
    const payload={type:'northstar-session',frameId:id,id:record.current?.id || id,title:titleRef.current,
      temporary:!record.current,busy:busy.current,...extra};
    const signature=JSON.stringify(payload);
    // Camera checkpoints do not change session chrome. Keep repeated navigation
    // out of the parent React tree and its saved-session listing requests.
    if(!extra.menu&&!extra.converted&&signature===lastReport.current)return;
    lastReport.current=signature;
    window.parent.postMessage(payload,window.location.origin);
  },[id]);
  const openPrivate=useCallback((fallback?:PrivateCanvasHistory|(()=>Promise<PrivateCanvasHistory|undefined>))=>{
    if(privateOpening.current)return privateOpening.current;
    const sync=new PrivateWorkspaceSync({cache:localView.current.historyCacheFor(privateClientId.current),remote:new SupabasePrivateWorkspace(id,owner),
      onStatus:status=>{if(personal.current===sync){setPrivateStatus(status);report({privateSaveStatus:status.phase});}}});
    personal.current=sync;privateOpening.current=sync.open(fallback);return privateOpening.current;
  },[id,owner,report]);
  const attach = useCallback((session: NorthstarSession) => {
    record.current = session; setTitle(session.title); titleRef.current = session.title;
    queue.current = new SnapshotQueue(async snapshot => {
      if (blockedRef.current) throw new Error('This canvas is being edited in another tab.');
      const saved = await saveSnapshot(record.current!,writer.current,snapshot,await recovery.current?.blobFor(snapshot));
      record.current=saved;await recovery.current?.accepted(snapshot,saved);
    }, (status, cause) => { setError(cause?.message || ''); report({saveStatus:status,error:cause?.message}); });
  },[report]);
  useEffect(() => {
    let disposed = false, booted = false, discovering = false;
    const discoverShared = async () => {
      const client=collaborationRef.current;
      if(disposed||!booted||!client||client.enabled||discovering)return Boolean(client?.enabled);
      discovering=true;
      try{
        if(!await client.connect())return false;
        if(disposed){client.close();return true;}
        const previous=latest.current,revision=client.getRevision()!;
        if(previous){
          if(queue.current?.dirty&&(previous.revision.document.html!==revision.document.html||previous.revision.document.css!==revision.document.css||previous.revision.document.javascript!==revision.document.javascript||JSON.stringify(previous.revision.evidence)!==JSON.stringify(revision.evidence)))client.retainLocalRevision(previous.revision,'Local edit before this canvas became shared');
          void localView.current.writeCamera(previous.viewport).catch(()=>{});
        }
        clearTimeout(timer.current);queue.current=null;blockedRef.current=false;
        channel.current?.close();channel.current=null;setReplica(undefined);
        const history=await openPrivate(previous?privateCanvasHistory(previous):undefined);
        if(disposed)return true;
        const snapshot:NorthstarSnapshot={schema:1,turns:[],draft:'',model:CANVAS_V2_DEFAULT_MODEL,effort:'high',...history,revision,viewport:previous?.viewport??centeredCanvasV2WorkspaceViewport({width:1440,height:900})};
        latest.current=snapshot;setLoaded({snapshot});setGeneration(value=>value+1);setError('');report({saveStatus:'saved',multiplayer:true});return true;
      }finally{discovering=false;}
    };
    if(!temporary)channel.current=new LiveSessionChannel(new BroadcastChannel(`northstar-live:${owner}:${id}`),{
      multiplayer:()=>{void discoverShared().catch(()=>{});},
      owns:()=>Boolean(record.current) && !blockedRef.current,
      read:()=>latest.current?{snapshot:latest.current,busy:busy.current,title:titleRef.current}:undefined,
      receive:state=>{
        if(disposed)return;
        receivedRevisions.current.add(state.snapshot.revision.id);
        latest.current=state.snapshot;busy.current=state.busy;titleRef.current=state.title;
        setTitle(state.title);setReplica(state);setLoaded(current=>current || {snapshot:state.snapshot});report({busy:state.busy,mirrored:true});
      },
      execute:async command=>{
        if(command.kind==='title') {titleRef.current=command.title;setTitle(command.title);if(record.current)record.current.title=command.title;report();return;}
        if(!controller.current)throw new Error('The canvas is still opening. Please try again.');await controller.current(command);
      },
    });
    const boot = async () => {
      try {
        if (temporary) { if (!disposed) {setLoaded({});report({saveStatus:'temporary'});} return; }
        writerClaim.current ||= claimSessionWriter(`northstar-writer:${owner}:${id}`,sessionStorage,navigator.locks);
        writer.current = await writerClaim.current;
        if (disposed) return;
        const db=createClient(),transport=new SupabaseCanvasTransport(id,db);
        const invitation=new URLSearchParams(window.location.hash.slice(1)).get('invite');
        if(invitation){const joined=await transport.redeem(invitation);if(joined!==id)throw new Error('This invitation belongs to another canvas.');window.history.replaceState(null,'',window.location.pathname+window.location.search);}
        const {data:{user}}=await db.auth.getUser();
        const name=[user?.user_metadata?.full_name,user?.user_metadata?.name,user?.email?.split('@')[0]].find((value):value is string=>typeof value==='string'&&!!value.trim())?.trim().slice(0,48)||'Teammate';
        const clientId=await claimSessionWriter(`northstar-collaborator:${owner}:${id}`,sessionStorage,navigator.locks);
        if(disposed)return;privateClientId.current=clientId;
        const multiplayer=new CanvasCollaborationClient({clientId,userId:owner,name,transport,...canvasCollaborationJournal(`${owner}:${id}:${clientId}`)});
        const shared=await multiplayer.connect();
        if(disposed){multiplayer.close();return;}
        collaborationRef.current=multiplayer;setCollaboration(multiplayer);
        if(shared){
          channel.current?.close();channel.current=null;
          const session=await getSession(id),local=await localView.current.read().catch(()=>undefined);
          const viewport=await localView.current.readCamera().catch(()=>undefined)??local?.viewport;
          const history=await openPrivate(async()=>{
            if(local)return privateCanvasHistory(local);
            // Only the original owner may migrate their pre-sharing history.
            // Teammates never download that legacy private snapshot.
            if(session.owner_id===owner){const legacy=await loadSnapshot(session);if(legacy)return privateCanvasHistory(legacy);}
            return undefined;
          });
          if(disposed)return;
          const revision=multiplayer.getRevision()!;
          const snapshot:NorthstarSnapshot={schema:1,revision,turns:[],draft:'',model:CANVAS_V2_DEFAULT_MODEL,effort:'high',...history,
            viewport:viewport??centeredCanvasV2WorkspaceViewport({width:1440,height:900}),
            memory:{...history?.memory,assets:revision.evidence,sourceMedia:history?.memory?.sourceMedia??[],sourcePages:history?.memory?.sourcePages??[],accountPackets:history?.memory?.accountPackets??[],accountFlows:history?.memory?.accountFlows??[],compositionHistory:history?.memory?.compositionHistory??[],compositionSequence:history?.memory?.compositionSequence??0}};
          record.current=session;latest.current=snapshot;titleRef.current=session.title;setTitle(session.title);setLoaded({snapshot});report({saveStatus:'saved',multiplayer:true});return;
        }
        const editable = await leaseSession(id,writer.current);
        const session = await getSession(id);
        let snapshot = await loadSnapshot(session);
        const journal=new SoloSnapshotRecovery({cache:soloRecoveryCache(owner,id,writer.current),encode:encodeSnapshot,decode:decodeSnapshotBlob,onError:setError});
        let restored:Awaited<ReturnType<SoloSnapshotRecovery['open']>>;
        try{restored=await journal.open(session);}catch{setError('Local recovery storage is unavailable. Keep this canvas open until changes are saved.');}
        const camera=await localView.current.readCamera().catch(()=>undefined);
        if (!disposed) {
          recovery.current=journal;
          if(restored&&editable){
            if(restored.safe){snapshot=restored.snapshot;}
            else {recoveredRef.current=restored.snapshot;setRecovered(restored.snapshot);}
          }
          if(snapshot&&camera)snapshot={...snapshot,viewport:camera};
          blockedRef.current = !editable;
          latest.current=snapshot || null;
          if(!editable && snapshot){receivedRevisions.current.add(snapshot.revision.id);setReplica({snapshot,busy:snapshot.turns.some(t=>t.status==='running'),title:session.title});}
          attach(session);if(editable || snapshot)setLoaded({snapshot});report({saveStatus:editable?'saved':'viewing',mirrored:!editable});
          if(restored?.safe&&editable&&snapshot){journal.observe(snapshot);queue.current?.enqueue(snapshot);void queue.current?.flush();}
          channel.current?.request();booted=true;
          // The owner may have enabled sharing between our initial room read
          // and loading its legacy snapshot. Recheck before accepting edits.
          void discoverShared().catch(()=>{});
        }
      } catch (e) {if (!disposed) setError((e as Error).message);}
    };
    void boot();
    const heartbeat = setInterval(() => {
      void (async()=>{
      if(collaborationRef.current?.enabled||await discoverShared())return;
      const session = record.current;
      if (session) void leaseSession(session.id,writer.current).then(async ok => {
        if(disposed)return;
        if (ok && blockedRef.current) {
          // The previous document closed. Resume ownership from its latest
          // shared state and the current database version, without a gate screen.
          const current=await getSession(id);if(disposed)return;
          controller.current=null;attach(current);blockedRef.current=false;setReplica(undefined);
          setLoaded({snapshot:latest.current || await loadSnapshot(current)});setGeneration(v=>v+1);report({mirrored:false});
        } else if (!ok && !blockedRef.current) {
          controller.current=null;blockedRef.current=true;clearTimeout(timer.current);queue.current=null;
          setLoaded({snapshot:latest.current || undefined});
          if(latest.current)setReplica({snapshot:latest.current,busy:busy.current,title:titleRef.current});
          setGeneration(v=>v+1);setError('');channel.current?.request();
        }
      }).catch(() => { if (!disposed) report({saveStatus:'error',error:'Connection lost. Keep this tab open.'}); });
      })().catch(()=>{if(!disposed)report({saveStatus:'error',error:'Connection lost. Keep this tab open.'});});
    },15000);
    const checkpoint = setInterval(() => { if(collaborationRef.current?.enabled){void personal.current?.flush();return;}if(!blockedRef.current)void queue.current?.flush(); },5000);
    const sync=setInterval(()=>channel.current?.request(),2000);
    // Do not release on pagehide: its delayed request can clear a refreshed
    // document's renewed lease. Refresh reuses the writer; closed leases expire.
    const unload = (event: BeforeUnloadEvent) => {if ((!blockedRef.current && (queue.current?.dirty||recovery.current?.dirty))||personal.current?.dirty) {event.preventDefault();event.returnValue = '';}};
    window.addEventListener('beforeunload',unload);
    const reconnect=()=>{void personal.current?.flush();if(!blockedRef.current){void recovery.current?.flush();void queue.current?.flush();}};
    const hide=()=>{void personal.current?.flush();if(!blockedRef.current&&!collaborationRef.current?.enabled){void recovery.current?.flush();void queue.current?.flush();}if(latest.current)void localView.current.writeCamera(latest.current.viewport).catch(()=>{});};
    window.addEventListener('online',reconnect);window.addEventListener('pagehide',hide);
    return () => {disposed=true;if(!blockedRef.current&&!collaborationRef.current?.enabled){void recovery.current?.flush();void queue.current?.flush();}void personal.current?.close();personal.current=undefined;privateOpening.current=undefined;window.removeEventListener('online',reconnect);window.removeEventListener('pagehide',hide);collaborationRef.current?.close();collaborationRef.current=undefined;clearTimeout(privateSave.current);clearInterval(heartbeat);clearInterval(checkpoint);clearInterval(sync);channel.current?.close();channel.current=null;window.removeEventListener('beforeunload',unload);};
  },[id,temporary,owner,attach,report,openPrivate]);
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.frameId !== id) return;
      if (event.data.type === 'northstar-rename' && typeof event.data.title === 'string') {
        titleRef.current=event.data.title;setTitle(event.data.title);if(record.current)record.current.title=event.data.title;
        if(blockedRef.current)void channel.current?.command({kind:'title',title:event.data.title}).catch(e=>setError(e.message));
        else channel.current?.publish();
      }
      if (event.data.type === 'northstar-retry-save' && !blockedRef.current) void queue.current?.flush();
    };
    window.addEventListener('message',listen);return()=>window.removeEventListener('message',listen);
  },[id,owner,attach,report]);
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const broadcastTimer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(()=>()=>{clearTimeout(timer.current);clearTimeout(broadcastTimer.current);},[]);
  const sendCommand=useCallback(async(command:SessionCommand)=>{
    try {if(!channel.current)throw new Error('The session is reconnecting. Please try again.');await channel.current.command(command);setError('');}
    catch(e){setError((e as Error).message);throw e;}
  },[]);
  const snapshotChanged = useCallback((snapshot:NorthstarSnapshot,running:boolean) => {
    if(recoveredRef.current)return;
    if(collaborationRef.current?.enabled){
      latest.current=snapshot;busy.current=running;
      personal.current?.observe(privateCanvasHistory(snapshot));
      // A bounded camera checkpoint is separate from personal history. Panning
      // cannot postpone a chat save or trigger transcript/media re-encoding.
      if(!privateSave.current)privateSave.current=setTimeout(()=>{privateSave.current=undefined;const current=latest.current;if(current)void localView.current.writeCamera(current.viewport).catch(()=>{})},900);
      report({busy:running,multiplayer:true,saveStatus:collaborationRef.current.getStatus().pending?'saving':'saved'});return;
    }
    if (blockedRef.current) {
      if(!latest.current) return;
      // Mirrored revisions are presentation updates, never a new edit.
      if(!receivedRevisions.current.has(snapshot.revision.id) && sentRevision.current!==snapshot.revision.id) {
        sentRevision.current=snapshot.revision.id;
        void sendCommand({kind:'canvas',baseRevision:latest.current.revision.id,revision:snapshot.revision}).catch(()=>{
          setLoaded({snapshot:latest.current || undefined});setGeneration(v=>v+1);channel.current?.request();
        });
      }
      return;
    }
    const changed=!sameSoloSnapshotContent(latest.current,snapshot);
    latest.current=snapshot;busy.current=running;
    if(!privateSave.current)privateSave.current=setTimeout(()=>{privateSave.current=undefined;const current=latest.current;if(current)void localView.current.writeCamera(current.viewport).catch(()=>{})},900);
    const firstPrompt=snapshot.turns[0]?.message?.trim();
    if (titleRef.current === 'Untitled canvas' && firstPrompt) {
      const next=firstPrompt.replace(/\s+/g,' ').slice(0,80);titleRef.current=next;setTitle(next);
      if(record.current) void renameSession(record.current.id,next).then(()=>{record.current!.title=next;report();}).catch(()=>{});
    }
    if(queue.current&&changed) {
      recovery.current?.observe(snapshot);queue.current.enqueue(snapshot);clearTimeout(timer.current);
      timer.current=setTimeout(()=>void queue.current?.flush(),900);
    }
    report();
    if(!broadcastTimer.current)broadcastTimer.current=setTimeout(()=>{broadcastTimer.current=undefined;channel.current?.publish();},100);
  },[report,sendCommand]);
  const enableCollaboration=useCallback(async(revision:CanvasV2ArtifactRevision)=>{
    const client=collaborationRef.current;if(!client||temporary)throw new Error('Save this canvas before inviting teammates.');
    if(blockedRef.current)throw new Error('Open the canvas in its active editing tab before inviting teammates.');
    await queue.current?.flush();
    await client.enable(revision);
    blockedRef.current=false;channel.current?.upgrade();channel.current?.close();channel.current=null;setReplica(undefined);
    if(latest.current){await openPrivate(privateCanvasHistory(latest.current));personal.current?.observe(privateCanvasHistory(latest.current));void localView.current.writeCamera(latest.current.viewport).catch(()=>{});}
    setCollaboration(client);report({multiplayer:true,saveStatus:'saved'});
  },[report,temporary,openPrivate]);
  const openSessionMenu = useCallback(() => report({menu:true}), [report]);
  const registerController = useCallback((execute:(command:SessionCommand)=>Promise<void>) => { controller.current=execute; }, []);
  if(!loaded) return <div role="status" className="flex min-h-screen items-center justify-center bg-[#11111b] text-white/60">{error || 'Opening canvas…'}{error && <button className="ml-3 underline" onClick={()=>report({menu:true})}>Sessions</button>}</div>;
  return <><CanvasV2Workspace key={generation} initialSnapshot={loaded.snapshot} onSnapshot={snapshotChanged} sessionTitle={title} onSessionMenu={openSessionMenu} agentEndpoint={agentEndpoint}
    collaboration={collaboration} onEnableCollaboration={enableCollaboration} liveReplica={replica} sendSessionCommand={sendCommand} registerSessionController={registerController}/>
    {privateStatus?.error&&<div role="status" data-testid="canvas-private-history-status" className="fixed bottom-28 left-1/2 z-[1200] flex max-w-[min(90vw,560px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[#a994ff]/20 bg-[#211d28] px-4 py-2.5 text-[11px] leading-4 text-[#d4c9df]">
      <span>{privateStatus.error}</span>
      {privateStatus.phase==='conflict'?<><button className="shrink-0 text-[#bda6ff]" onClick={()=>{
        const history=personal.current?.getHistory();if(!history)return;const url=URL.createObjectURL(new Blob([JSON.stringify(history)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='northstar-my-conversation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }}>Save my copy</button><button disabled={busy.current} className="shrink-0 text-[#bda6ff] disabled:opacity-40" onClick={()=>{void personal.current?.useSavedHistory().then(history=>{const current=latest.current;if(!current)return;const next={...current,...history};latest.current=next;setLoaded({snapshot:next});setGeneration(value=>value+1);}).catch(cause=>setError(String(cause)))}}>Open saved chat</button></>:<button className="shrink-0 text-[#bda6ff]" onClick={()=>void personal.current?.flush()}>Retry</button>}
    </div>}
    {recovered&&<div role="dialog" aria-label="Recover unsaved canvas changes" aria-modal="true" className="fixed inset-0 z-[1300] grid place-items-center bg-black/40 backdrop-blur-sm"><div className="max-w-md rounded-2xl border border-[#a994ff]/20 bg-[#211d28] p-6 text-sm text-[#d4c9df]"><p>Unsaved changes were found on this device. The saved canvas has changed since then.</p><div className="mt-5 flex flex-wrap gap-4"><button className="text-[#bda6ff]" onClick={()=>{const snapshot=recovered;recoveredRef.current=undefined;setRecovered(undefined);recovery.current?.observe(snapshot);queue.current?.enqueue(snapshot);latest.current=snapshot;setLoaded({snapshot});setGeneration(value=>value+1);void queue.current?.flush();}}>Restore my changes</button><button className="text-[#bda6ff]" onClick={()=>{void recovery.current?.clear().then(()=>{recoveredRef.current=undefined;setRecovered(undefined);setGeneration(value=>value+1);}).catch(()=>setError('Keep this tab open; local recovery could not be updated.'));}}>Keep saved version</button><button className="text-[#bda6ff]" onClick={()=>{void recovery.current?.blobFor(recovered).then(blob=>{const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='northstar-recovered-canvas.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}}>Download my copy</button></div></div></div>}
    {error && <div role="alert" className="fixed bottom-36 right-5 z-[100] max-w-sm rounded-xl bg-[#302323] p-3 text-sm text-white">{error}{!replica && <button className="ml-3 underline" onClick={()=>void queue.current?.flush()}>Retry save</button>}</div>}</>;
}
