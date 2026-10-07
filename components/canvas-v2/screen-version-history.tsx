'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, History, X } from 'lucide-react';
import { CanvasV2InteractiveScreenObject } from './interactive-screen';
import { parseCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import type { CanvasV2ScreenVersion } from '@/lib/canvas-v2/screen-versions';

export function ScreenVersionHistory({ nodeId, current, versions, onClose, onRestore }: {
  nodeId: string; current: string; versions: readonly CanvasV2ScreenVersion[]; onClose: () => void; onRestore: (version: CanvasV2ScreenVersion) => Promise<void>;
}) {
  const entries = versions.filter(version => version.nodeId === nodeId);
  const currentVersionId = entries.findLast(version => version.encoded === current)?.id;
  const [chosen, setChosen] = useState(currentVersionId ?? entries.at(-1)?.id);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.focus(); return () => previous?.focus(); }, []);
  const selected = entries.find(version => version.id === chosen) ?? entries.at(-1);
  if (!selected) return null;
  const screen = parseCanvasV2Screen(selected.encoded);
  const number = entries.indexOf(selected)+1;
  return createPortal(<div data-canvas-v2-screen-control className="fixed inset-0 z-[100] flex items-center justify-center bg-[#25203d]/25 p-4 backdrop-blur-md dark:bg-[#080710]/55 sm:p-7" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation(); if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),iframe') ?? []); const first = controls[0], last = controls.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Screen version history" className="flex h-[min(880px,94vh)] w-full max-w-[1080px] flex-col overflow-hidden rounded-[28px] border border-[#dedce8] bg-[#faf9fc] text-[#292633] shadow-[0_32px_120px_rgba(47,36,78,.22)] outline-none dark:border-white/[.1] dark:bg-[#1c1b23] dark:text-[#f3f0f8] dark:shadow-[0_36px_140px_rgba(0,0,0,.5)]">
      <header className="flex shrink-0 items-center justify-between gap-5 border-b border-[#e9e6ef] px-7 py-5 dark:border-white/[.07] sm:px-8"><div className="min-w-0"><div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-[#766c86] dark:text-[#bcb1cd]"><History size={15}/>Version history</div><h2 className="truncate text-[23px] font-semibold leading-7 tracking-[-.5px]">{screen.title}</h2></div><button aria-label="Close version history" onClick={onClose} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#8e849c] transition hover:bg-black/5 hover:text-[#413949] dark:text-[#bbb2c8] dark:hover:bg-white/[.06] dark:hover:text-white"><X size={20}/></button></header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,310px)_1fr] max-sm:grid-cols-[160px_1fr]">
        <nav aria-label="Screen versions" className="overflow-y-auto border-r border-[#e9e6ef] px-3 py-5 dark:border-white/[.07] sm:px-5"><p className="mb-4 px-3 text-[12px] font-medium text-[#746584] dark:text-[#a99cb9]">{entries.length} saved version{entries.length === 1 ? '' : 's'}</p>{[...entries].reverse().map(version => <button key={version.id} onClick={() => { setChosen(version.id); setError(''); }} aria-pressed={selected.id === version.id} className={`relative mb-2 w-full rounded-[16px] border px-4 py-4 text-left transition ${selected.id === version.id ? 'border-[#d5c9f2] bg-[#f0eafa] dark:border-[#554566] dark:bg-[#2b2537]' : 'border-transparent hover:bg-[#f2eef7] dark:hover:bg-white/[.035]'}`}>
          <span className="flex flex-wrap items-center justify-between gap-2 text-[14px] font-semibold">Version {entries.indexOf(version)+1}{version.id === currentVersionId && <span className="flex items-center gap-1 text-[11px] font-medium text-[#8364b4] dark:text-[#cdb8ee]"><Check size={12}/>On canvas</span>}</span><span className="mt-2 block text-[15px] leading-[22px] text-[#51475f] dark:text-[#e0d7e9]">{version.label}</span><span className="mt-3 block text-[12px] leading-5 text-[#766782] dark:text-[#b0a2bf]">{version.author === 'you' ? 'You' : 'Northstar'}<span className="mx-1.5 opacity-60">·</span>{new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date(version.createdAt))}</span>
        </button>)}</nav>
        <div className="relative flex min-h-0 flex-col items-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#eeebf7_0%,#f5f3f8_75%)] px-6 pb-6 pt-4 dark:bg-[radial-gradient(ellipse_at_50%_30%,#27213c_0%,#17151e_80%)]"><div className="mb-4 flex w-full shrink-0 items-center justify-between text-[12px] text-[#78698a] dark:text-[#b3a1c6]"><span>Version {number}</span><span>{selected.id === currentVersionId ? 'Applied on canvas' : 'Preview only'}</span></div><div className="relative min-h-0 w-full flex-1"><div className="absolute inset-0 flex items-center justify-center"><div className="relative h-full max-w-full" style={{ aspectRatio: `${screen.width}/${screen.height}` }}><CanvasV2InteractiveScreenObject key={selected.id} nodeId={`version-preview-${nodeId}`} encoded={selected.encoded} showCaption={false}/></div></div></div></div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[#e9e6ef] px-7 py-4 dark:border-white/[.07] sm:px-8"><p role={error ? 'alert' : undefined} className={`max-w-[570px] text-[13px] leading-5 ${error ? 'text-red-600 dark:text-red-300' : 'text-[#786787] dark:text-[#b6a6c5]'}`}>{error || 'Explore an earlier version, or bring it back to your canvas.'}</p><button disabled={busy || selected.id === currentVersionId} onClick={async () => { setBusy(true); setError(''); try { await onRestore(selected); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'This version could not be used.'); } finally { setBusy(false); } }} className="shrink-0 rounded-[12px] bg-[#765ae8] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(114,83,221,.22)] transition hover:bg-[#674bd7] disabled:opacity-50">{busy ? 'Applying…' : selected.id === currentVersionId ? 'Applied on canvas' : 'Use this version'}</button></footer>
    </section>
  </div>, document.body);
}
