'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasV2Workspace } from './canvas-v2-workspace';
import { SnapshotQueue } from '@/lib/canvas-v2/sessions/snapshot';
import { getSession, leaseSession, loadSnapshot, renameSession, saveSnapshot } from '@/lib/canvas-v2/sessions/store';
import type { LiveSessionState, SessionCommand, NorthstarSession, NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';
import { claimSessionWriter } from '@/lib/canvas-v2/sessions/writer';
import { LiveSessionChannel } from '@/lib/canvas-v2/sessions/live-channel';

export function SessionWorkspace({id, temporary, owner, agentEndpoint}: {id:string; temporary:boolean; owner:string; agentEndpoint?:string}) {
  const [loaded,setLoaded] = useState<{snapshot?:NorthstarSnapshot} | null>(null);
  const [title,setTitle] = useState('Untitled canvas');
  const [error,setError] = useState('');
  const [replica,setReplica] = useState<LiveSessionState>();
  const [generation,setGeneration] = useState(0);
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
  const titleRef = useRef(title); titleRef.current = title;
  const report = useCallback((extra: Record<string,unknown> = {}) => {
    window.parent.postMessage({type:'northstar-session',frameId:id,id:record.current?.id || id,title:titleRef.current,
      temporary:!record.current,busy:busy.current,...extra},window.location.origin);
  },[id]);
  const attach = useCallback((session: NorthstarSession) => {
    record.current = session; setTitle(session.title); titleRef.current = session.title;
    queue.current = new SnapshotQueue(async snapshot => {
      if (blockedRef.current) throw new Error('This canvas is being edited in another tab.');
      record.current = await saveSnapshot(record.current!,writer.current,snapshot);
    }, (status, cause) => { setError(cause?.message || ''); report({saveStatus:status,error:cause?.message}); });
  },[report]);
  useEffect(() => {
    let disposed = false;
    if(!temporary)channel.current=new LiveSessionChannel(new BroadcastChannel(`northstar-live:${owner}:${id}`),{
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
        const editable = await leaseSession(id,writer.current);
        const session = await getSession(id);
        const snapshot = await loadSnapshot(session);
        if (!disposed) {
          blockedRef.current = !editable;
          latest.current=snapshot || null;
          if(!editable && snapshot){receivedRevisions.current.add(snapshot.revision.id);setReplica({snapshot,busy:snapshot.turns.some(t=>t.status==='running'),title:session.title});}
          attach(session);if(editable || snapshot)setLoaded({snapshot});report({saveStatus:editable?'saved':'viewing',mirrored:!editable});
          channel.current?.request();
        }
      } catch (e) {if (!disposed) setError((e as Error).message);}
    };
    void boot();
    const heartbeat = setInterval(() => {
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
    },15000);
    const checkpoint = setInterval(() => { if (!blockedRef.current) void queue.current?.flush(); },5000);
    const sync=setInterval(()=>channel.current?.request(),2000);
    // Do not release on pagehide: its delayed request can clear a refreshed
    // document's renewed lease. Refresh reuses the writer; closed leases expire.
    const unload = (event: BeforeUnloadEvent) => {if (!blockedRef.current && queue.current?.dirty) {event.preventDefault();event.returnValue = '';}};
    window.addEventListener('beforeunload',unload);
    return () => {disposed=true;clearInterval(heartbeat);clearInterval(checkpoint);clearInterval(sync);channel.current?.close();channel.current=null;window.removeEventListener('beforeunload',unload);};
  },[id,temporary,owner,attach,report]);
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
    latest.current=snapshot;busy.current=running;
    const firstPrompt=snapshot.turns[0]?.message?.trim();
    if (titleRef.current === 'Untitled canvas' && firstPrompt) {
      const next=firstPrompt.replace(/\s+/g,' ').slice(0,80);titleRef.current=next;setTitle(next);
      if(record.current) void renameSession(record.current.id,next).then(()=>{record.current!.title=next;report();}).catch(()=>{});
    }
    if(queue.current) {
      queue.current.enqueue(snapshot);clearTimeout(timer.current);
      timer.current=setTimeout(()=>void queue.current?.flush(),900);
    }
    report();
    if(!broadcastTimer.current)broadcastTimer.current=setTimeout(()=>{broadcastTimer.current=undefined;channel.current?.publish();},100);
  },[report,sendCommand]);
  if(!loaded) return <div role="status" className="flex min-h-screen items-center justify-center bg-[#11111b] text-white/60">{error || 'Opening canvas…'}{error && <button className="ml-3 underline" onClick={()=>report({menu:true})}>Sessions</button>}</div>;
  return <><CanvasV2Workspace key={generation} initialSnapshot={loaded.snapshot} onSnapshot={snapshotChanged} sessionTitle={title} onSessionMenu={()=>report({menu:true})} agentEndpoint={agentEndpoint}
    liveReplica={replica} sendSessionCommand={sendCommand} registerSessionController={execute=>{controller.current=execute;}}/>
    {error && <div role="alert" className="fixed bottom-36 right-5 z-[100] max-w-sm rounded-xl bg-[#302323] p-3 text-sm text-white">{error}{!replica && <button className="ml-3 underline" onClick={()=>void queue.current?.flush()}>Retry save</button>}</div>}</>;
}
