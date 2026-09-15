'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { codexWorkerFetch } from '@/lib/canvas-v2/worker/transport';
import { canvasV2ModelLabel, type CanvasV2ModelSelection, type NorthstarEffort, type NorthstarModelCapability } from '@/lib/canvas-v2/model-catalog';

export function ModelThinkingPicker({ model, effort, disabled, endpoint = '/api/canvas-v2/codex', onChange }: {
  model: CanvasV2ModelSelection; effort: NorthstarEffort; disabled: boolean; endpoint?: string;
  onChange(model: CanvasV2ModelSelection, effort: NorthstarEffort): void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<NorthstarModelCapability[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState({left:12,bottom:12,width:360,maxHeight:320});
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController();
    const fetcher = endpoint === '/api/canvas-v2/codex' ? codexWorkerFetch() : fetch;
    void fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'models' }), signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Models unavailable.'); if (!data.models?.length) throw new Error('No compatible models are available for this server.'); setModels(data.models); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    const outside = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') {setOpen(false);trigger.current?.focus();} };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);window.addEventListener('resize',close);
    return () => { controller.abort(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key);window.removeEventListener('resize',close); };
  }, [open, disabled, endpoint, retry]);
  const selected = models.find(m => m.id === model);
  const show = () => {
    const rect=trigger.current!.getBoundingClientRect();const width=Math.min(360,window.innerWidth-24);
    setPosition({left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),bottom:window.innerHeight-rect.top+8,width,maxHeight:Math.max(100,rect.top-20)});
    setError('');setOpen(v=>!v);
  };
  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-label={`Model and thinking: ${canvasV2ModelLabel(model)}, ${effort}`} aria-expanded={open && !disabled} aria-haspopup="dialog" onClick={show} className="group flex h-8 items-center gap-1.5 rounded-full bg-black/[.045] px-3 text-[12px] font-normal text-[#575361] transition-colors duration-150 hover:bg-black/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a397d0]/40 dark:bg-white/[.055] dark:text-[#c7c3cf] dark:hover:bg-white/[.09] disabled:opacity-50">
      <span>{canvasV2ModelLabel(model)}</span><span className="capitalize opacity-65">{effort==='xhigh'?'Extra high':effort}</span><ChevronDown size={12} className={`ml-0.5 opacity-50 transition-transform duration-150 ${open?'rotate-180':''}`}/>
    </button>
    {open && !disabled && createPortal(<div ref={menu} role="dialog" aria-label="Model and thinking" style={position} className="fixed z-[250] overflow-y-auto rounded-[15px] border border-black/[.08] bg-[#fafafa] p-[7px] text-[#35313e] shadow-[0_10px_35px_-12px_rgba(0,0,0,0.4)] dark:border-white/[.09] dark:bg-[#252525] dark:text-[#eeecf2]">
      {error && <p role="alert" className="px-3 py-2 text-xs">Could not load models. {error} <button className="underline" onClick={()=>{setError('');setRetry(v=>v+1);}}>Retry</button></p>}
      {!models.length && !error && <p role="status" className="px-3 py-4 text-xs opacity-60">Loading available models…</p>}
      <div className="flex">
        <div role="radiogroup" aria-label="Model" className="min-w-0 flex-1 border-r border-black/[.06] pr-[7px] dark:border-white/[.07]"><p className="px-3 pb-2 pt-2.5 text-[11px] font-normal opacity-40">Select model</p>
          {models.map(m => <button key={m.id} type="button" role="radio" aria-checked={model === m.id} onClick={() => onChange(m.id as CanvasV2ModelSelection, m.efforts.includes(effort) ? effort : m.efforts.includes('high') ? 'high' : m.efforts[0])} className="mb-0.5 flex h-[34px] w-full items-center justify-between gap-2 rounded-[7px] px-3 text-left text-[13px] font-normal transition-colors duration-100 hover:bg-black/[.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a397d0]/35 dark:hover:bg-white/[.045]">{m.label}{m.id === model && <Check size={14} strokeWidth={1.8} className="text-[#777] dark:text-[#c0c0c0]"/>}</button>)}
        </div>
        <div role="radiogroup" aria-label="Thinking" className="w-[114px] shrink-0 pl-[7px]"><p className="px-3 pb-2 pt-2.5 text-[11px] font-normal opacity-40">Thinking</p>{selected?.efforts.map(e => <button key={e} type="button" role="radio" aria-checked={effort === e} onClick={() => onChange(model, e)} className="mb-0.5 flex h-[30px] w-full items-center justify-between rounded-[7px] px-3 text-[12px] capitalize transition-colors duration-100 hover:bg-black/[.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a397d0]/35 dark:hover:bg-white/[.045]">{e === 'xhigh' ? 'Extra high' : e}{e === effort && <Check size={14} strokeWidth={1.8} className="text-[#777] dark:text-[#c0c0c0]"/>}</button>)}</div>
      </div>
    </div>,document.body)}
  </>;
}
