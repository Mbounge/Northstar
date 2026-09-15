'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ChevronLeft, Clock3, LoaderCircle, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { archiveSession, createSession, listSessions, renameSession } from '@/lib/canvas-v2/sessions/store';
import type { NorthstarSession } from '@/lib/canvas-v2/sessions/types';
import { createClient } from '@/lib/supabase/client';
import { CANVAS_V2_GATEWAY_HANDOFF_KEY } from '@/lib/canvas-v2/gateway-handoff';

type OpenSession = {frameId:string; id:string; temporary:boolean; originalTemporary:boolean; title:string; busy?:boolean; mirrored?:boolean; saveStatus?:string; error?:string};
export function SessionShell({owner, initialId, temporary=false, testMode=false}: {owner:string;initialId?:string;temporary?:boolean;testMode?:boolean}) {
  const path = testMode ? '/canvas?sessionTest=1&' : '/canvas?';
  const [sessions,setSessions]=useState<NorthstarSession[]>([]);
  const [opened,setOpened]=useState<OpenSession[]>([]);
  const [active,setActive]=useState('');
  const [sidebar,setSidebar]=useState(false);
  const [archived,setArchived]=useState(false);
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  const [creating,setCreating]=useState(false);
  const [editing,setEditing]=useState('');
  const cancelledRename=useRef(false);
  const frames=useRef(new Map<string,HTMLIFrameElement>());
  const openedRef=useRef(opened);openedRef.current=opened;
  const activeRef=useRef(active);activeRef.current=active;
  const booted=useRef(false);
  const refresh = useCallback(async () => {const all=await listSessions();setSessions(all);return all;},[]);
  const select = useCallback((item:OpenSession) => {
    setOpened(prev=>prev.some(s=>s.frameId===item.frameId)?prev:[...prev,item]);setActive(item.frameId);setSidebar(false);
    history.replaceState(null,'',item.temporary?`${path}temporary=1`:`${path}s=${encodeURIComponent(item.id)}`);
  },[path]);
  const add = useCallback(async (isTemporary=false) => {
    if(creating)return;setCreating(true);setError('');
    try {
      if(isTemporary){const id=`tmp-${crypto.randomUUID()}`;select({id,frameId:id,title:'Untitled canvas',temporary:true,originalTemporary:true,saveStatus:'temporary'});}
      else {const s=await createSession(owner);setSessions(prev=>[s,...prev]);select({id:s.id,frameId:s.id,title:s.title,temporary:false,originalTemporary:false});}
    }catch(e){setError((e as Error).message);}finally{setCreating(false);}
  },[creating,owner,select]);
  useEffect(()=>{
    if(booted.current)return;booted.current=true;
    void (async()=>{
      try{
        const all=await refresh();
        const handoff=Boolean(sessionStorage.getItem(CANVAS_V2_GATEWAY_HANDOFF_KEY));
        if(temporary){await add(true);return;}
        const chosen=!handoff && (initialId?all.find(s=>s.id===initialId):all.find(s=>!s.archived));
        if(initialId && !chosen && !handoff){setError('This saved session is unavailable for your account.');setSidebar(true);return;}
        if(chosen)select({id:chosen.id,frameId:chosen.id,title:chosen.title,temporary:false,originalTemporary:false});
        else await add();
      }catch(e){setError((e as Error).message);setSidebar(true);if(temporary)await add(true);}
    })();
  },[add,initialId,refresh,select,temporary]);
  useEffect(()=>{
    const listen=(event:MessageEvent)=>{
      const data=event.data;
      if(event.origin!==window.location.origin || data?.type!=='northstar-session' || frames.current.get(data.frameId)?.contentWindow!==event.source)return;
      if(data.menu){setSidebar(v=>!v);void refresh().catch(()=>{});}
      setOpened(prev=>prev.map(s=>s.frameId===data.frameId?{...s,...data}:s));
      if(data.converted || data.saveStatus==='saved')void refresh().catch(()=>{});
      if(data.converted && activeRef.current===data.frameId)history.replaceState(null,'',`${path}s=${encodeURIComponent(data.id)}`);
    };
    window.addEventListener('message',listen);return()=>window.removeEventListener('message',listen);
  },[path,refresh]);
  useEffect(()=>{
    if(testMode)return;
    const {data:{subscription}}=createClient().auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT' || (session?.user && session.user.id!==owner)) {
        setOpened([]);setSessions([]);window.location.assign('/login');
      }
    });
    return()=>subscription.unsubscribe();
  },[owner,testMode]);
  const current=opened.find(s=>s.frameId===active);
  const send=(type:string,item=current,extra:Record<string,unknown>={})=>{if(item)frames.current.get(item.frameId)?.contentWindow?.postMessage({type,frameId:item.frameId,...extra},location.origin);};
  const openSaved=(s:NorthstarSession)=>select(opened.find(o=>o.id===s.id) || {id:s.id,frameId:s.id,title:s.title,temporary:false,originalTemporary:false});
  const close=(item:OpenSession)=>{
    const question=item.temporary
      ? 'Discard this temporary session? Its chat and canvas will be lost, and any running work will stop.'
      : !item.mirrored && item.busy
        ? 'Stop this run and close the view? The saved session will remain in History.'
        : !item.mirrored && (item.saveStatus==='saving' || item.saveStatus==='error')
          ? 'Your latest changes have not finished saving. Close the view anyway? Unsaved changes may be lost; the saved session will remain in History.'
          : undefined;
    if(question && !window.confirm(question))return;
    const rest=opened.filter(s=>s.frameId!==item.frameId);setOpened(rest);
    if(active===item.frameId){if(rest.length)select(rest[rest.length-1]);else{setActive('');setSidebar(true);history.replaceState(null,'',testMode ? '/canvas?sessionTest=1':'/canvas');}}
  };
  return <main className="fixed inset-0 overflow-hidden bg-[#10101a] text-[#ecebf1]">
    {opened.map(item=><iframe key={item.frameId} ref={node=>{if(node)frames.current.set(item.frameId,node);else frames.current.delete(item.frameId);}}
      title={`Canvas: ${item.title}`} src={`${path}workspace=${encodeURIComponent(item.frameId)}${item.originalTemporary?'&temporary=1':''}`}
      aria-hidden={active!==item.frameId} tabIndex={active===item.frameId?0:-1}
      inert={active!==item.frameId} className="absolute top-0 h-full w-full border-0" style={{left:0,zIndex:active===item.frameId?1:0,pointerEvents:active===item.frameId?'auto':'none'}}/>) }
    {!current && <div className="flex h-full flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_top_left,#282052,transparent_65%)]"><p role="status" className="text-sm text-white/50">{error ? 'Saved sessions are unavailable. You can retry or open a temporary canvas.' : sidebar && !creating ? 'Choose a session from History or start a new one.' : 'Opening your canvas…'}</p>{error && <button onClick={()=>void add(true)} className="rounded-xl border border-white/10 px-5 py-3">Open temporary canvas</button>}</div>}
    {current?.temporary && <span className="fixed right-4 top-20 z-30 text-xs text-white/40">Temporary</span>}
    {sidebar && <><button aria-label="Close sessions" className="fixed inset-0 z-40 bg-black/20" onClick={()=>setSidebar(false)}/>
      <aside aria-label="Canvas sessions" className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#191820] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-5"><span className="font-semibold">Sessions</span><button aria-label="Close sessions sidebar" onClick={()=>setSidebar(false)}><ChevronLeft size={18}/></button></div>
        <div className="space-y-1 px-3"><button disabled={creating} onClick={()=>void add()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/5"><Plus size={17}/>New session</button>
          <button disabled={creating} onClick={()=>void add(true)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/5"><Clock3 size={16}/>New temporary session</button>
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-3"><Search size={14}/><input aria-label="Find a session" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a session" className="w-full bg-transparent py-2 text-sm outline-none"/></label></div>
        {error&&<p role="alert" className="m-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}<button className="ml-2 underline" onClick={()=>void refresh().then(async all=>{setError('');if(!openedRef.current.length){const s=all.find(s=>s.id===initialId)||all.find(s=>!s.archived);if(s)openSaved(s);else await add();}}).catch(e=>setError(e.message))}>Retry</button></p>}
        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {opened.filter(s=>s.temporary).map(item=><div key={item.frameId} className={`group flex items-center rounded-xl ${active===item.frameId?'bg-white/10':''}`}><button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm" onClick={()=>select(item)}><span className="truncate">{item.title}</span><span className="text-xs text-white/40">Temporary</span>{item.busy&&<LoaderCircle role="status" aria-label="Running" size={14} className="ml-auto shrink-0 animate-spin text-white/55"/>}</button><button aria-label={`Close ${item.title}`} className="p-2" onClick={()=>close(item)}><X size={13}/></button></div>)}
          <p className="px-3 pb-1 pt-4 text-xs text-white/40">{archived?'Archived':'History'}</p>
          {sessions.filter(s=>s.archived===archived && s.title.toLowerCase().includes(query.toLowerCase())).map(s=>{
            const live=opened.find(o=>o.id===s.id);
            return <div key={s.id} className={`group flex items-center rounded-xl ${live?.frameId===active?'bg-white/10':'hover:bg-white/5'}`}>
              {editing===s.id?<input autoFocus aria-label="Session name" defaultValue={s.title} className="m-1 min-w-0 flex-1 rounded-lg bg-white/10 p-2 text-sm" onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){cancelledRename.current=true;setEditing('');}}} onBlur={async e=>{if(cancelledRename.current){cancelledRename.current=false;return;}const title=e.target.value.trim()||'Untitled canvas';setEditing('');try{await renameSession(s.id,title);send('northstar-rename',live,{title});await refresh();}catch(e){setError((e as Error).message);}}}/>:
                <button onClick={()=>openSaved(s)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm"><span className="truncate">{live?.title||s.title}</span>{live?.busy&&<LoaderCircle role="status" aria-label="Running" size={14} className="ml-auto shrink-0 animate-spin text-white/55"/>}</button>}
              <details className="relative"><summary aria-label={`Options for ${s.title}`} className="cursor-pointer list-none p-2 text-white/40"><MoreHorizontal size={15}/></summary><div className="absolute right-0 top-8 z-10 w-36 rounded-xl border border-white/10 bg-[#292730] p-1 text-xs shadow-xl">
                <button className="block w-full rounded-lg p-2 text-left hover:bg-white/5" onClick={()=>{cancelledRename.current=false;setEditing(s.id);}}>Rename</button>
                {live&&<button title="Keeps the saved session in History" className="block w-full rounded-lg p-2 text-left hover:bg-white/5" onClick={()=>close(live)}>{live.busy && !live.mirrored?'Stop and close view':'Close view'}</button>}
                <button className="block w-full rounded-lg p-2 text-left hover:bg-white/5" onClick={async()=>{try{await archiveSession(s.id,!s.archived);await refresh();}catch(e){setError((e as Error).message);}}}>{s.archived?'Restore':'Archive'}</button>
              </div></details>
            </div>;
          })}
        </div>
        <button onClick={()=>setArchived(v=>!v)} className="flex items-center gap-2 border-t border-white/5 px-5 py-4 text-xs text-white/50"><Archive size={14}/>{archived?'Back to saved sessions':'Archived sessions'}</button>
      </aside></>}
  </main>;
}
