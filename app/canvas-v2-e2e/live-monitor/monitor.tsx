'use client';
import { useEffect, useState } from 'react';
import { CanvasV2MarkdownMessage } from '@/components/canvas-v2/canvas-v2-markdown-message';
import type { AgentView } from '@/lib/canvas-v2/managed-agent/protocol';
export default function Monitor() {
  const [data,setData] = useState<{view:AgentView;prompt:string;startedAt:string}|null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{let active=true;const update=async()=>{try{const r=await fetch('/canvas-v2-e2e/live-monitor/snapshot',{cache:'no-store'});if(!r.ok)throw new Error('Live view unavailable');const d=await r.json();if(active){setData(d);setError('');}}catch(e){if(active)setError((e as Error).message);}};void update();const t=setInterval(update,1000);return()=>{active=false;clearInterval(t);};},[]);
  const v=data?.view;
  return <main className="dark min-h-screen bg-[#17161d] text-[#eeebf3] p-8"><div className="mx-auto max-w-[920px]">
    <header className="mb-8 flex items-center justify-between border-b border-white/15 pb-4"><strong>Northstar · live IKEA test</strong><span className="text-sm text-[#b9b0d5]">Luna High · {v?.status ?? 'Connecting'}</span></header>
    <p className="mb-7 text-sm text-[#a99ebd]">Live view of the same running test · updates every second · no second model run</p>
    {error && <p role="alert">{error}</p>}
    {data && <div className="mb-8 rounded-2xl bg-white/5 p-5"><CanvasV2MarkdownMessage content={data.prompt}/></div>}
    <section aria-label="Live research activity" className="space-y-5">
    {v?.activity.filter(a=>!v.texts.some(t=>t.phase==='final_answer' && t.text===(a.detail||a.label))).map(a=>a.kind==='progress'?<div key={a.id} className="text-base leading-7"><CanvasV2MarkdownMessage content={a.detail||a.label}/></div>:<details key={a.id} className="text-sm text-[#b2aabd]"><summary className="cursor-pointer">{a.tool==='web-search'?'🌐 ':''}{a.label}</summary><p className="mt-2 pl-5">{a.detail}</p>{a.sources?.map(s=><a key={s.href} href={s.href} target="_blank" rel="noreferrer" className="block pl-5 text-[#b9aaff]">{s.label}</a>)}</details>)}
    </section>
    {v?.status==='running' && <p className="mt-6 animate-pulse text-[#b6a7f2]" role="status">Working…</p>}
    {v?.error && <p className="mt-6 text-red-300">{v.error}</p>}
    {v?.texts.filter(t=>t.phase==='final_answer').map(t=><article key={t.id} className="mt-8 border-t border-white/15 pt-7 text-base leading-7"><CanvasV2MarkdownMessage content={t.text}/></article>)}
  </div></main>;
}
