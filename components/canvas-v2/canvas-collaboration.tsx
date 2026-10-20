'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Link2, Loader2, UserPlus, X } from 'lucide-react';
import { CanvasCollaborationClient, collaboratorColor, type PeerPresence } from '@/lib/canvas-v2/sessions/collaboration-client';
import type { CanvasV2WorkspaceViewport } from '@/lib/canvas-v2/workspace-coordinate-space';
import type { CanvasV2InspectableElement } from '@/lib/canvas-v2/element-inspection';
import type { CanvasV2TransientGeometry } from './canvas-scene';
import {followViewport,interpolateFollowViewport,followWouldCycle,type FollowFrame} from '@/lib/canvas-v2/sessions/collaboration-follow';

function saveRecovery(client: CanvasCollaborationClient) {
  const recovery = client.getStatus().recovery; if (!recovery) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(recovery)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'northstar-my-recovered-edit.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CanvasCollaborationToolbar({ client, onEnable,following,onFollow }: { client: CanvasCollaborationClient; onEnable?: () => Promise<void>;following?:string;onFollow?:(clientId:string)=>void }) {
  const status = useSyncExternalStore(client.subscribe, client.getStatus, client.getStatus);
  const [peers, setPeers] = useState<PeerPresence[]>([]), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [links, setLinks] = useState<Array<{ id: string; role: string }>>([]);
  useEffect(() => {
    let signature = '';
    const refresh = () => {
      const next = client.getPeers().filter((peer, index, all) => all.findIndex(item => item.userId === peer.userId) === index);
      const key = next.map(peer => peer.userId + peer.clientId + peer.name).sort().join('|');
      if (signature !== key) { signature = key; setPeers(next); }
    };
    refresh(); return client.subscribePresence(refresh);
  }, [client]);
  const invite = async () => {
    setBusy(true); setError('');
    try {
      if (!client.enabled) { if (!onEnable) throw new Error('Save this canvas before inviting teammates.'); await onEnable(); }
      const invitation = await client.transport.invite(role);
      const url = new URL('/canvas/join',window.location.origin); url.hash = `invite=${invitation.token}`;
      await navigator.clipboard.writeText(url.toString());
      setLinks(current => [...current, { id: invitation.id, role }]); setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The invitation could not be created.'); }
    finally { setBusy(false); }
  };
  return <>
    <div aria-label="Canvas teammates" data-testid="canvas-collaborators" className="flex h-14 items-center gap-2 border-l border-[#e8e8ef] px-2 dark:border-white/[.08]">
      {!!peers.length && <div className="flex -space-x-1.5">{peers.slice(0, 3).map(peer => <button type="button" key={peer.userId} data-collaborator-user={peer.userId} aria-label={`Follow ${peer.name}`} aria-pressed={following===peer.clientId} title={following===peer.clientId?`Stop following ${peer.name}`:`Follow ${peer.name}'s view`} onClick={()=>onFollow?.(peer.clientId)} className="relative grid h-7 w-7 place-items-center rounded-full border-2 border-white text-[10px] font-semibold text-[#17131e] transition hover:z-10 hover:ring-2 hover:ring-violet-300 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 aria-pressed:ring-2 aria-pressed:ring-violet-300 dark:border-[#1d1c24]" style={{ background: collaboratorColor(peer.userId) }}>{peer.name.trim().slice(0, 1).toUpperCase()}</button>)}{peers.length > 3 && <button aria-label="Show all teammates" onClick={()=>setOpen(true)} className="grid h-7 w-7 place-items-center rounded-full bg-[#393242] text-[9px] text-white">+{peers.length - 3}</button>}</div>}
      <button type="button" aria-label="Share canvas" title={client.enabled ? `${peers.length + 1} people on this canvas · Share` : 'Invite teammates'} onClick={() => setOpen(true)} className="grid h-8 w-8 place-items-center rounded-lg text-[#8068b5] hover:bg-[#8b73f8]/10 dark:text-[#c4b4f7]"><UserPlus size={16} strokeWidth={1.7}/></button>
    </div>
    {typeof document !== 'undefined' && createPortal(<>
    {client.enabled && status.phase !== 'live' && <div role="status" data-testid="canvas-collaboration-status" className="fixed left-1/2 top-20 z-[1100] -translate-x-1/2 rounded-full border border-current/10 bg-white/95 px-3 py-1.5 text-[11px] text-[#81748e] shadow-sm dark:bg-[#211d29] dark:text-[#c4b4dd]">{status.phase === 'blocked' ? 'Access changed · unsent work kept on this device' : status.phase === 'reconnecting' ? 'Reconnecting · changes kept on this device' : 'Connecting teammates…'}</div>}
    {status.recovery && <div role="status" data-testid="canvas-collaboration-recovery" className="fixed left-1/2 top-24 z-[1100] flex max-w-[min(90vw,560px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[#a18adf]/30 bg-white px-4 py-3 text-[11px] text-[#514a60] shadow-lg dark:bg-[#231e2d] dark:text-[#e5dced]"><span>A teammate edited the same element. Your edit is kept here.</span><button className="shrink-0 font-medium text-[#9675e8]" onClick={() => saveRecovery(client)}>Save my version</button><button aria-label="Dismiss recovered edit" onClick={() => client.dismissRecovery()}><X size={13}/></button></div>}
    {!status.recovery && status.error && status.phase === 'live' && <div role="status" className="fixed left-1/2 top-20 z-[1100] max-w-[min(90vw,520px)] -translate-x-1/2 rounded-xl bg-[#231e2d] px-4 py-2 text-xs text-[#e5dced]">{status.error}</div>}
    </>, document.body)}
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[2100] bg-[#100b20]/35 backdrop-blur-sm"/><Dialog.Content aria-describedby="canvas-share-description" className="fixed left-1/2 top-1/2 z-[2101] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e2ddeb] bg-[#fcfbfe] p-6 text-[#514a60] shadow-2xl dark:border-white/[.09] dark:bg-[#211d28] dark:text-[#eee7f5]">
      <div className="flex items-center justify-between"><Dialog.Title className="text-sm font-medium">Share this canvas</Dialog.Title><Dialog.Close aria-label="Close sharing" className="rounded-lg p-1.5 text-[#968aa3] hover:bg-current/5"><X size={15}/></Dialog.Close></div>
      <p id="canvas-share-description" className="mt-2 text-xs leading-5 text-[#968aa3]">Work together in the same space. Each person keeps their own view.</p>
      {(!client.enabled || status.role === 'owner') && <div className="mt-6 space-y-3"><div role="group" aria-label="Invite access" className="flex rounded-lg bg-black/[.035] p-1 dark:bg-white/[.04]">{(['editor', 'viewer'] as const).map(value => <button key={value} aria-pressed={role === value} onClick={() => setRole(value)} className="h-8 flex-1 rounded-md text-xs text-[#968aa3] aria-pressed:bg-white aria-pressed:text-[#755cbb] aria-pressed:shadow-sm dark:aria-pressed:bg-white/[.08] dark:aria-pressed:text-[#d2c4fb]">{value === 'editor' ? 'Can edit' : 'Can view'}</button>)}</div><button disabled={busy} onClick={() => void invite()} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#8066df] text-xs font-medium text-white disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin"/> : copied ? <Check size={14}/> : <Link2 size={14}/>} {copied ? 'Invite link copied' : 'Copy invite link'}</button><p className="text-[10px] leading-4 text-[#968aa3]">Anyone with this link can join after signing in. Links expire after seven days.</p></div>}
      {!!status.members.length && <div className="mt-6 border-t border-current/10 pt-4"><p className="mb-3 text-[10px] uppercase tracking-[.1em] text-[#968aa3]">People with access</p><div className="max-h-48 space-y-3 overflow-auto">{status.members.map(member => <div key={member.userId} className="flex items-center gap-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] text-[#17131e]" style={{ background: collaboratorColor(member.userId) }}>{member.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-xs">{member.name}{member.userId === client.userId ? ' (you)' : ''}</span><span className="text-[10px] text-[#968aa3]">{member.userId === client.userId && status.role === 'owner' ? 'Owner' : member.role === 'viewer' ? 'Can view' : 'Can edit'}</span>{peers.some(peer=>peer.userId===member.userId)&&<button type="button" aria-label={`Follow ${member.name}`} className="text-[10px] text-[#9675e8]" onClick={()=>{const peer=peers.find(peer=>peer.userId===member.userId);if(peer){setOpen(false);onFollow?.(peer.clientId)}}}>Follow</button>}{status.role === 'owner' && member.userId !== client.userId && <button aria-label={`Remove ${member.name}`} className="p-1 text-[#968aa3] hover:text-red-400" onClick={() => void client.transport.removeMember(member.userId).then(() => client.refreshMembers(true)).catch(cause => setError(String(cause)))}><X size={12}/></button>}</div>)}</div>{status.role === 'owner' && <p className="mt-3 text-[10px] leading-4 text-[#968aa3]">Removing a teammate also invalidates outstanding invite links.</p>}</div>}
      {!!links.length && <div className="mt-4 space-y-2">{links.map(link => <div key={link.id} className="flex items-center justify-between text-[10px] text-[#968aa3]"><span>{link.role === 'editor' ? 'Editor' : 'Viewer'} invite link</span><button onClick={() => void client.transport.revokeInvite(link.id).then(() => setLinks(current => current.filter(item => item.id !== link.id))).catch(cause => setError(String(cause)))}>Revoke link</button></div>)}</div>}
      {error && <p role="alert" className="mt-4 text-xs leading-5 text-[#bc6f8a]">{error}</p>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}

/** Follow camera traffic stays imperative; only mode changes and bounded
 * visibility checkpoints reach React. Personal chat and selection stay local. */
export function CanvasCollaborationFollow({client,target,viewport,frame,refreshKey,workspace,onPreview,onSettle,onMode,onStop}:{
  client:CanvasCollaborationClient;target:string;viewport:RefObject<CanvasV2WorkspaceViewport>;frame:RefObject<FollowFrame>;refreshKey:string;
  workspace:RefObject<HTMLElement|null>;onPreview:(next:CanvasV2WorkspaceViewport)=>void;onSettle:(next:CanvasV2WorkspaceViewport)=>void;
  onMode:(mode:'design'|'preview')=>void;onStop:()=>void;
}) {
  const callbacks=useRef({onPreview,onSettle,onMode,onStop});callbacks.current={onPreview,onSettle,onMode,onStop};
  const resample=useRef<()=>void>(()=>{});
  const peer=client.getPeers().find(peer=>peer.clientId===target),color=collaboratorColor(peer?.userId??target);
  useEffect(()=>{
    let animation=0,disposed=false,initialized=false,lastFrame=0,lastCommit=0,lastMode='',signature='';
    let desired:PeerPresence['view'];
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Exit settles the latest imperative camera, not its mount-time position.
    const readCamera=()=>viewport.current;
    const paint=(now:number)=>{
      animation=0;if(disposed||!desired)return;
      const goal=followViewport(desired,frame.current),current=viewport.current;
      const settled=Math.abs(goal.x-current.x)<.1&&Math.abs(goal.y-current.y)<.1&&Math.abs(goal.scale-current.scale)<.000001;
      const next=!initialized||reduced||settled?goal:interpolateFollowViewport(current,goal,frame.current,1-Math.exp(-Math.min(64,Math.max(1,now-lastFrame))/55));
      const first=!initialized;initialized=true;lastFrame=now;callbacks.current.onPreview(next);
      if(first||settled||now-lastCommit>=160){lastCommit=now;callbacks.current.onSettle(next);}
      if(!settled&&!reduced&&!first)animation=requestAnimationFrame(paint);
    };
    const sample=()=>{
      if(disposed)return;
      const peers=client.getPeers(),next=peers.find(peer=>peer.clientId===target);
      if(!next||followWouldCycle(peers,client.clientId,target)){callbacks.current.onStop();return;}
      if(next.mode!==lastMode){lastMode=next.mode;callbacks.current.onMode(next.mode);}
      if(!next.view)return;
      const key=JSON.stringify([next.view,frame.current]);if(key===signature)return;
      signature=key;desired=next.view;
      if(!animation){lastFrame=performance.now()-16;animation=requestAnimationFrame(paint);}
    };
    if(!client.follow(target)){callbacks.current.onStop();return;}
    resample.current=sample;const unsubscribe=client.subscribePresence(sample);
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();callbacks.current.onStop();}};
    const navigate=(event:Event)=>{
      const element=event.target instanceof Element?event.target:undefined;
      if(!element||element.closest('[data-canvas-follow-control]'))return;
      if(workspace.current?.contains(element))callbacks.current.onStop();
    };
    document.addEventListener('keydown',keydown,true);document.addEventListener('wheel',navigate,{capture:true,passive:true});document.addEventListener('pointerdown',navigate,true);
    sample();
    return()=>{disposed=true;unsubscribe();cancelAnimationFrame(animation);resample.current=()=>{};document.removeEventListener('keydown',keydown,true);document.removeEventListener('wheel',navigate,true);document.removeEventListener('pointerdown',navigate,true);client.follow(undefined);callbacks.current.onSettle(readCamera());};
  },[client,target,viewport,frame,workspace]);
  useEffect(()=>resample.current(),[refreshKey]);
  return <>
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1090] rounded-[3px] border-2" style={{borderColor:color+'99'}}/>
    <div data-canvas-follow-control data-testid="canvas-follow-status" role="status" className="absolute left-1/2 top-[84px] z-[1100] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-white/95 py-1.5 pl-3 pr-1.5 text-[11px] shadow-sm dark:bg-[#211d29] dark:text-[#eee7f5]" style={{borderColor:color+'55'}}>
      <span className="h-1.5 w-1.5 rounded-full" style={{background:color}}/><span>Following {peer?.name??'teammate'}</span><button type="button" aria-label="Stop following" title="Stop following · Esc" onClick={onStop} className="ml-1 grid h-5 w-5 place-items-center rounded-full text-[#968aa3] hover:bg-current/10"><X size={12}/></button>
    </div>
  </>;
}

/** Imperative cursor/selection painting keeps awareness out of the workspace
 * React tree. Camera movement reprojects world coordinates without a network
 * packet and live dragging uses the existing native transient geometry path. */
export function CanvasCollaborationOverlay({ client, viewport, elements, onMotion }: { client: CanvasCollaborationClient; viewport: RefObject<CanvasV2WorkspaceViewport>; elements: RefObject<CanvasV2InspectableElement[]>; onMotion: (geometry?: Record<string, CanvasV2TransientGeometry>) => void }) {
  const host = useRef<HTMLDivElement>(null), motion = useRef(onMotion); motion.current = onMotion;
  useEffect(() => {
    const root = host.current; if (!root) return;
    const nodes = new Map<string, { cursor: HTMLDivElement; label: HTMLSpanElement; outlines: HTMLDivElement[]; x?: number; y?: number; lastMotion?: PeerPresence['motion']; motionAt: number }>();
    let frame = 0, previousMotion = '', dirty = true;
    const stop = client.subscribePresence(() => {dirty=true;if(!frame)frame=requestAnimationFrame(paint)});
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = () => {
      frame=0;
      const peers = client.getPeers(), live = new Set(peers.map(peer => peer.clientId)), camera = viewport.current;
      for (const [id, item] of nodes) if (!live.has(id)) { item.cursor.remove(); item.outlines.forEach(outline => outline.remove()); nodes.delete(id); }
      const geometry: Record<string, CanvasV2TransientGeometry> = {};
      for (const peer of peers) {
        let item = nodes.get(peer.clientId); const color = collaboratorColor(peer.userId);
        if (!item) {
          const cursor = document.createElement('div'); cursor.dataset.collaboratorCursor = peer.clientId; cursor.className = 'absolute left-0 top-0 will-change-transform';
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', '42'); svg.setAttribute('height', '44'); svg.setAttribute('viewBox', '0 0 42 44'); svg.style.cssText = `position:absolute;left:-10px;top:-9px;filter:drop-shadow(0 2px 4px ${color}66)`;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M10 9 32 19.8l-9.2 3.3-3.5 9.7L10 9Z'); path.setAttribute('fill', '#111016'); path.setAttribute('stroke', color); path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path);
          const label = document.createElement('span'); label.className = 'absolute left-4 top-6 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium text-[#151019] shadow-sm'; label.style.background = color; cursor.append(svg, label); root.append(cursor);
          item = { cursor, label, outlines: [], motionAt: 0 }; nodes.set(peer.clientId, item);
        }
        item.label.textContent = peer.name + (peer.activity === 'thinking' ? ' · Northstar is working' : '');
        item.cursor.style.display = peer.cursor ? '' : 'none';
        if (peer.cursor) {
          item.x = reduced || item.x === undefined ? peer.cursor.x : item.x + (peer.cursor.x - item.x) * .6;
          item.y = reduced || item.y === undefined ? peer.cursor.y : item.y + (peer.cursor.y - item.y) * .6;
          item.cursor.dataset.worldX = String(peer.cursor.x); item.cursor.dataset.worldY = String(peer.cursor.y);
          item.cursor.style.transform = `translate3d(${camera.x + item.x * camera.scale}px,${camera.y + item.y * camera.scale}px,0)`;
        }
        while (item.outlines.length > peer.selection.length) item.outlines.pop()!.remove();
        peer.selection.forEach((selected, index) => {
          let outline = item!.outlines[index];
          if (!outline) { outline = document.createElement('div'); outline.className = 'absolute rounded-[2px] border-[1.5px]'; root.append(outline); item!.outlines.push(outline); }
          const moving = peer.motion?.find(part => part.nodeId === selected.nodeId) ?? selected;
          const actual = elements.current.find(element => element.nodeId === selected.nodeId)?.bounds;
          const bounds = peer.motion?.length ? moving : actual ?? moving;
          outline.dataset.collaboratorSelection = selected.nodeId; outline.style.borderColor = color;
          outline.style.left=`${camera.x + bounds.x * camera.scale}px`;outline.style.top=`${camera.y + bounds.y * camera.scale}px`;outline.style.width=`${bounds.width * camera.scale}px`;outline.style.height=`${bounds.height * camera.scale}px`;
        });
        if (peer.motion?.length) { item.lastMotion = peer.motion; item.motionAt = Date.now(); }
        if (item.lastMotion && (peer.motion?.length || Date.now() - item.motionAt < 700)) for (const moving of item.lastMotion) {
          const actual = elements.current.find(element => element.nodeId === moving.nodeId)?.bounds;
          if (actual) geometry[moving.nodeId] = { kind: 'resize', deltaX: moving.x - actual.x, deltaY: moving.y - actual.y, width: moving.width, height: moving.height };
        }
      }
      const signature = JSON.stringify(geometry);
      if (signature !== previousMotion || dirty) { previousMotion = signature; motion.current(Object.keys(geometry).length ? geometry : undefined); dirty = false; }
      if(peers.length)frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { stop(); cancelAnimationFrame(frame); root.replaceChildren(); motion.current(undefined); };
  }, [client, elements, viewport]);
  return <div ref={host} data-testid="canvas-multiplayer-overlay" aria-hidden className="pointer-events-none absolute inset-0 z-[60] overflow-hidden"/>;
}
