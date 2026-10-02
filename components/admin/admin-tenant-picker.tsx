"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type Tenant = { id: string; name: string };

export function AdminTenantPicker({ tenants, selectedId, onSelect }: {
  tenants: Tenant[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const selected = tenants.find((tenant) => tenant.id === selectedId);
  const inline = tenants.length <= 4 ? tenants : [selected, ...tenants.filter((tenant) => tenant.id !== selectedId).slice(0, 2)].filter((tenant): tenant is Tenant => Boolean(tenant));
  const matches = tenants.filter((tenant) => tenant.name.toLowerCase().includes(query.trim().toLowerCase()));

  function choose(id: string) {
    onSelect(id);
    setQuery("");
    setExpanded(false);
  }

  return <div className="mb-6 border-b border-black/[.08] pb-4 dark:border-white/[.09]">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-2 text-[11px] font-bold uppercase tracking-[.15em] text-slate-500 dark:text-white/40">Organization</span>
      {inline.map((tenant) => <button key={tenant.id} type="button" onClick={() => choose(tenant.id)} aria-pressed={selectedId === tenant.id} className={`rounded-full px-4 py-2 text-[12px] font-semibold transition ${selectedId === tenant.id ? "bg-[#242038] text-white shadow-[0_8px_22px_rgba(36,32,56,.18)] dark:bg-white dark:text-[#242038]" : "bg-white/55 text-slate-600 hover:bg-white dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"}`}>{tenant.name}</button>)}
      {!tenants.length && <span className="text-[12px] text-slate-500">No organizations yet.</span>}
      <div className="relative ml-0 flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <div className="relative min-w-0 flex-1 sm:w-[190px] sm:flex-none"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/><input aria-label="Find a tenant" value={query} onFocus={() => setExpanded(true)} onChange={(event) => { setQuery(event.target.value); setExpanded(true); }} onKeyDown={(event) => { if (event.key === "Escape") setExpanded(false); if (event.key === "Enter" && matches.length === 1) choose(matches[0].id); }} placeholder="Find a tenant" className="w-full rounded-xl border border-black/[.08] bg-white/65 py-2.5 pl-9 pr-3 text-[12px] outline-none transition focus:border-violet-500 dark:border-white/10 dark:bg-white/5"/></div>
        <button type="button" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded} aria-controls="admin-tenant-list" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-black/[.08] bg-white/55 px-3 py-2.5 text-[12px] font-semibold transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">All tenants <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}/></button>
      </div>
    </div>
    {expanded && <div id="admin-tenant-list" className="mt-4 rounded-[18px] border border-black/[.08] bg-white/70 p-3 shadow-[0_16px_40px_rgba(24,20,56,.07)] backdrop-blur-xl dark:border-white/10 dark:bg-[#1a1a26]/95">
      <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500 dark:text-white/45">{query ? `${matches.length} matching tenants` : `All tenants · ${tenants.length}`}</div>
      <div className="grid max-h-[280px] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((tenant) => <button key={tenant.id} type="button" onClick={() => choose(tenant.id)} aria-pressed={selectedId === tenant.id} className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-[13px] font-semibold transition ${selectedId === tenant.id ? "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:text-violet-200" : "border-black/[.06] bg-white/45 hover:bg-white dark:border-white/[.07] dark:bg-white/[.035] dark:hover:bg-white/[.08]"}`}><span className="truncate">{tenant.name}</span>{selectedId === tenant.id && <Check className="h-4 w-4 shrink-0"/>}</button>)}
        {!matches.length && <div className="px-3 py-5 text-[12px] text-slate-500">No matching tenants.</div>}
      </div>
    </div>}
  </div>;
}
