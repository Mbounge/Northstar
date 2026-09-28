"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Activity, ArrowRight, Check, ChevronDown, CircleAlert,
  Clock3, FileImage, MoreHorizontal, Pause, Play,
  Plus, Search, Settings2, ShieldCheck, Smartphone, Sparkles, X,
} from "lucide-react";

type RunStatus = "running" | "queued" | "paused" | "review" | "complete";
type CaptureFilter = "all" | "running" | "waiting" | "review" | "complete";
type DetailTab = "overview" | "screens" | "activity" | "setup";
type Organization = { id: string; name: string };
type CaptureRun = {
  id: string;
  app: string;
  packageName: string;
  organization: string;
  status: RunStatus;
  phase: string;
  progress: number;
  screens: number;
  flows: number;
  device: string;
  scope: string;
  accent: string;
  activity: string[];
};

const sampleRuns: CaptureRun[] = [
  {
    id: "sample-glassdoor", app: "Glassdoor", packageName: "com.glassdoor.app", organization: "Northstar preview",
    status: "running", phase: "Exploring main tabs", progress: 56, screens: 62, flows: 7,
    device: "Android · Pixel profile", scope: "Browsing", accent: "#08a882",
    activity: ["Captured the Jobs entry screen", "Mapped the Home and Companies tabs", "Started browsing capture"],
  },
  {
    id: "sample-tsenta", app: "Tsenta", packageName: "com.example.tsenta", organization: "Northstar preview",
    status: "paused", phase: "Auto Apply flow", progress: 38, screens: 31, flows: 4,
    device: "Android · Pixel profile", scope: "Browsing", accent: "#9381f5",
    activity: ["Saved a resume checkpoint", "Captured Auto Apply settings", "Started browsing capture"],
  },
  {
    id: "sample-jobget", app: "JobGet", packageName: "com.example.jobget", organization: "Northstar preview",
    status: "review", phase: "Review required", progress: 72, screens: 29, flows: 5,
    device: "Android · Pixel profile", scope: "Browsing", accent: "#e9a163",
    activity: ["Flagged a navigation step for review", "Captured job search", "Mapped the Jobs entry"],
  },
  {
    id: "sample-offertoday", app: "OfferToday", packageName: "com.example.offertoday", organization: "Northstar preview",
    status: "complete", phase: "Ready for publishing review", progress: 100, screens: 77, flows: 9,
    device: "Android · Pixel profile", scope: "Browsing", accent: "#8a9bf9",
    activity: ["Finished the capture audit", "Saved the final screen set", "Captured messaging flows"],
  },
  {
    id: "sample-graet", app: "Graet", packageName: "com.graet", organization: "Northstar preview",
    status: "queued", phase: "Waiting for compatible device", progress: 0, screens: 0, flows: 0,
    device: "Device not assigned", scope: "Browsing", accent: "#f48d6c",
    activity: ["Device compatibility check is pending", "Preview run created"],
  },
];

const statusLabels: Record<RunStatus, string> = {
  running: "Running", queued: "Queued", paused: "Paused", review: "Needs review", complete: "Complete",
};
const statusStyles: Record<RunStatus, string> = {
  running: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  queued: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  review: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
  complete: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 ring-zinc-500/20",
};
const stages = ["Device ready", "Map navigation", "Capture screens", "Explore flows", "Review evidence"];
const surface = "border border-black/10 dark:border-white/10 bg-white/65 dark:bg-[#17171e]/85 shadow-[0_12px_38px_rgba(27,26,56,0.045)] dark:shadow-[0_12px_38px_rgba(0,0,0,0.12)]";

function StatusPill({ status }: { status: RunStatus }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${statusStyles[status]}`}>
    {status === "running" ? <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> : null}
    {statusLabels[status]}
  </span>;
}

function AppMark({ run, size = "normal" }: { run: CaptureRun; size?: "normal" | "large" }) {
  return <span className={`shrink-0 rounded-[13px] text-white font-bold flex items-center justify-center shadow-sm ${size === "large" ? "h-12 w-12 text-[21px]" : "h-10 w-10 text-[17px]"}`} style={{ backgroundColor: run.accent }} aria-hidden="true">
    {run.app.slice(0, 1).toUpperCase()}
  </span>;
}

function DevicePreview({ run }: { run: CaptureRun }) {
  return <div className={`${surface} rounded-[22px] p-5 flex flex-col items-center`}>
    <div className="w-full flex items-center justify-between mb-5">
      <div><p className="m-0 text-[13px] font-semibold text-black/75 dark:text-white/80">Device view</p><p className="m-0 mt-0.5 text-[12px] text-black/40 dark:text-white/40">Illustrative frame</p></div>
      <Smartphone className="h-4 w-4 text-black/35 dark:text-white/40" />
    </div>
    <div className="relative w-[174px] h-[334px] rounded-[27px] border-[6px] border-[#20202a] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] overflow-hidden">
      <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 w-12 h-2.5 rounded-full bg-[#20202a]" />
      <div className="h-full px-3 pt-8 pb-4 flex flex-col" style={{ background: `linear-gradient(160deg, ${run.accent}1c 0%, #ffffff 42%)` }}>
        <div className="flex items-center gap-2 mb-4"><span className="h-5 w-5 rounded-[6px] flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: run.accent }}>{run.app[0]}</span><span className="text-[12px] font-bold text-[#242431] truncate">{run.app}</span><span className="ml-auto h-3 w-3 rounded-full border border-[#b4b3bf]" /></div>
        <div className="text-[13px] leading-[1.12] font-bold text-[#252530] mb-2">Explore what matters<br />to you</div>
        <div className="h-1.5 w-28 rounded-full bg-[#d7d7df] mb-4" />
        <div className="rounded-[10px] h-[82px] mb-3 p-2.5 flex flex-col justify-end" style={{ background: `linear-gradient(145deg, ${run.accent}, #272a45)` }}><div className="h-1.5 w-[75%] rounded-full bg-white/80 mb-1.5" /><div className="h-1.5 w-[50%] rounded-full bg-white/55" /></div>
        <div className="space-y-2.5"><div className="rounded-[7px] bg-[#f2f2f6] p-2"><div className="h-1.5 w-[82%] bg-[#b6b5c2] rounded-full mb-1.5" /><div className="h-1.5 w-[55%] bg-[#d3d2dc] rounded-full" /></div><div className="rounded-[7px] bg-[#f2f2f6] p-2"><div className="h-1.5 w-[70%] bg-[#b6b5c2] rounded-full mb-1.5" /><div className="h-1.5 w-[45%] bg-[#d3d2dc] rounded-full" /></div></div>
        <div className="mt-auto border-t border-[#e7e7ee] pt-2 flex justify-around"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: run.accent }} /><span className="h-2 w-2 rounded-full bg-[#c8c8d1]" /><span className="h-2 w-2 rounded-full bg-[#c8c8d1]" /><span className="h-2 w-2 rounded-full bg-[#c8c8d1]" /></div>
      </div>
    </div>
    <p className="mt-4 mb-0 text-center text-[12px] leading-relaxed text-black/45 dark:text-white/45 max-w-[230px]">The live device feed will appear here when a capture runner is connected.</p>
  </div>;
}

function ScreenTile({ run, index }: { run: CaptureRun; index: number }) {
  return <div className="min-w-0"><div className="aspect-[9/16] rounded-[12px] border border-black/10 dark:border-white/10 bg-white p-2 shadow-sm overflow-hidden">
    <div className="h-2 rounded-[4px] mb-2" style={{ backgroundColor: run.accent }} />
    <div className="h-[36%] rounded-[6px] mb-2" style={{ background: `linear-gradient(140deg, ${run.accent}b0, ${run.accent}20)` }} />
    <div className="h-1.5 w-[88%] rounded-full bg-zinc-300 mb-1.5" /><div className="h-1.5 w-[62%] rounded-full bg-zinc-200 mb-3" />
    <div className="h-[19%] rounded-[5px] bg-zinc-100" />
  </div><div className="mt-2 text-[12px] font-medium text-black/65 dark:text-white/65">Example screen {index + 1}</div><div className="text-[11px] text-black/40 dark:text-white/40">Illustrative</div></div>;
}

export function CaptureConsole({ organizations }: { organizations: Organization[] }) {
  const [runs, setRuns] = useState<CaptureRun[]>(sampleRuns);
  const [selectedId, setSelectedId] = useState(sampleRuns[0].id);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [filter, setFilter] = useState<CaptureFilter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newApp, setNewApp] = useState("");
  const [newPackage, setNewPackage] = useState("");
  const [newOrganization, setNewOrganization] = useState("");
  const [newScope, setNewScope] = useState("Browsing");
  const filtered = useMemo(() => runs.filter((run) =>
    (filter === "all" || run.status === filter || (filter === "waiting" && (run.status === "queued" || run.status === "paused"))) &&
    `${run.app} ${run.organization} ${run.phase}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [runs, filter, query]);
  const selected = filtered.find((run) => run.id === selectedId) ?? filtered[0] ?? runs.find((run) => run.id === selectedId) ?? runs[0];
  const counts = {
    running: runs.filter((run) => run.status === "running").length,
    waiting: runs.filter((run) => run.status === "queued" || run.status === "paused").length,
    review: runs.filter((run) => run.status === "review").length,
    screens: runs.reduce((total, run) => total + run.screens, 0),
  };

  const simulateStatus = (status: RunStatus) => {
    setRuns((current) => current.map((run) => run.id === selected.id ? {
      ...run, status, phase: status === "running" ? "Exploring main tabs" : status === "paused" ? "Paused at checkpoint" : run.phase,
      activity: [`Preview ${status} action · this browser only`, ...run.activity],
    } : run));
  };

  const createPreview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newApp.trim()) return;
    const run: CaptureRun = {
      id: `preview-${Date.now()}`, app: newApp.trim(), packageName: newPackage.trim() || "Not entered",
      organization: newOrganization || "Northstar preview", status: "queued", phase: "Waiting for runner",
      progress: 0, screens: 0, flows: 0, device: "Device not assigned", scope: newScope,
      accent: "#8a77f1", activity: ["Preview run created · this browser only"],
    };
    setRuns((current) => [run, ...current]);
    setSelectedId(run.id); setFilter("all"); setQuery(""); setDetailTab("overview"); setCreateOpen(false);
    setNewApp(""); setNewPackage(""); setNewOrganization("");
  };

  return <section className="animate-in fade-in duration-300 text-[#20202a] dark:text-[#f3f2f8]">
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div><div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.16em] font-semibold text-violet-600 dark:text-violet-300 mb-2"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Capture studio</div><h2 className="text-[27px] sm:text-[31px] font-semibold tracking-[-0.045em] leading-tight m-0">App capture, in one place.</h2><p className="mt-2 mb-0 text-[13px] leading-relaxed text-black/55 dark:text-white/55">Set up a run, follow its progress, inspect the screens, and assign the result to an organization.</p></div>
      <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-[12px] bg-[#24232d] dark:bg-white text-white dark:text-[#24232d] px-4 py-3 text-[13px] font-semibold hover:opacity-85 transition-opacity cursor-pointer"><Plus className="h-4 w-4" /> New capture preview</button>
    </div>

    <div className="flex items-start gap-3 rounded-[15px] border border-violet-300/55 dark:border-violet-400/20 bg-violet-100/60 dark:bg-violet-400/10 px-4 py-3 mb-6">
      <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-violet-600 dark:text-violet-300" />
      <div className="text-[13px] leading-relaxed text-violet-950/80 dark:text-violet-100/80"><strong className="font-semibold">Interface preview.</strong> These runs, screens, and activity events are illustrative. Controls change this browser view only; no capture agent, device, or saved account data is affected.</div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {[
        { label: "Running", value: counts.running, icon: Activity, sub: "Active capture previews" },
        { label: "Waiting", value: counts.waiting, icon: Clock3, sub: "Queued or paused" },
        { label: "Needs review", value: counts.review, icon: CircleAlert, sub: "Attention before publishing" },
        { label: "Screens saved", value: counts.screens, icon: FileImage, sub: "Illustrative total" },
      ].map((item) => <div key={item.label} className={`${surface} rounded-[17px] p-4`}><div className="flex items-center justify-between"><span className="text-[12px] font-medium text-black/50 dark:text-white/50">{item.label}</span><item.icon className="h-4 w-4 text-black/35 dark:text-white/35" /></div><div className="text-[28px] font-semibold tracking-[-0.05em] mt-2 leading-none">{item.value}</div><div className="text-[11px] text-black/40 dark:text-white/40 mt-2">{item.sub}</div></div>)}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-4 items-start">
      <aside className={`${surface} rounded-[20px] overflow-hidden`}>
        <div className="p-4 border-b border-black/10 dark:border-white/10"><div className="flex items-center justify-between mb-3"><h3 className="text-[13px] font-semibold m-0">Capture runs</h3><span className="text-[12px] text-black/40 dark:text-white/40">{filtered.length} shown</span></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/40 dark:text-white/40" /><input aria-label="Search capture runs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps or organizations" className="w-full box-border rounded-[10px] border border-black/10 dark:border-white/10 bg-black/[0.035] dark:bg-white/[0.05] py-2.5 pl-9 pr-3 text-[12px] text-black dark:text-white outline-none focus:ring-2 focus:ring-violet-400/35 placeholder:text-black/35 dark:placeholder:text-white/35" /></div><div className="grid grid-cols-5 gap-0.5 mt-3">{(["all", "running", "waiting", "review", "complete"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-0.5 py-1.5 text-[11px] font-medium cursor-pointer transition-colors ${filter === item ? "bg-[#292835] text-white dark:bg-white dark:text-[#292835]" : "text-black/50 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5"}`}>{item === "all" ? "All" : item === "running" ? "Live" : item === "waiting" ? "Waiting" : item === "review" ? "Review" : "Done"}</button>)}</div></div>
        <div className="p-2 max-h-[570px] overflow-y-auto">{filtered.length === 0 ? <div className="py-12 px-4 text-center text-[13px] text-black/50 dark:text-white/50">No runs match this search.</div> : filtered.map((run) => <button key={run.id} onClick={() => { setSelectedId(run.id); setDetailTab("overview"); }} className={`w-full text-left rounded-[14px] p-3 mb-1 transition-colors cursor-pointer border ${selected.id === run.id ? "bg-violet-500/[0.09] border-violet-400/35 dark:bg-violet-400/[0.11]" : "bg-transparent border-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}><div className="flex items-start gap-2.5"><AppMark run={run} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-1"><span className="text-[13px] font-semibold truncate">{run.app}</span><ArrowRight className={`h-3.5 w-3.5 shrink-0 ${selected.id === run.id ? "text-violet-600 dark:text-violet-300" : "text-black/25 dark:text-white/25"}`} /></div><div className="text-[11px] text-black/45 dark:text-white/45 truncate mt-0.5">{run.organization}</div></div></div><div className="flex items-center justify-between mt-3 gap-2"><StatusPill status={run.status} /><span className="text-[11px] text-black/45 dark:text-white/45 tabular-nums">{run.screens} screens</span></div><div className="h-1 rounded-full bg-black/[0.07] dark:bg-white/10 mt-3 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${run.progress}%`, backgroundColor: run.accent }} /></div></button>)}</div>
      </aside>

      <div className={`${surface} rounded-[20px] overflow-hidden min-w-0`}>
        <div className="p-4 sm:p-5 border-b border-black/10 dark:border-white/10 flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><AppMark run={selected} size="large" /><div><div className="flex items-center gap-2 flex-wrap"><h3 className="m-0 text-[19px] font-semibold tracking-[-0.03em]">{selected.app}</h3><StatusPill status={selected.status} /></div><p className="m-0 mt-1 text-[12px] text-black/45 dark:text-white/45">{selected.scope} capture <span className="mx-1">·</span> {selected.organization}</p></div></div><div className="flex items-center gap-2">{selected.status === "running" ? <button onClick={() => simulateStatus("paused")} className="inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-semibold border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"><Pause className="h-3.5 w-3.5" /> Preview pause</button> : selected.status !== "complete" ? <button onClick={() => simulateStatus("running")} className="inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-semibold border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"><Play className="h-3.5 w-3.5" /> Preview {selected.status === "queued" ? "start" : "resume"}</button> : null}<button type="button" title="More controls will appear when a runner is connected" aria-label="More controls unavailable in preview" disabled className="rounded-[9px] p-2 text-black/25 dark:text-white/25"><MoreHorizontal className="h-4 w-4" /></button></div></div>
        <div className="px-4 sm:px-5 flex gap-5 overflow-x-auto border-b border-black/10 dark:border-white/10">{(["overview", "screens", "activity", "setup"] as const).map((tab) => <button key={tab} onClick={() => setDetailTab(tab)} className={`h-11 shrink-0 capitalize text-[12px] font-semibold border-b-2 cursor-pointer bg-transparent ${detailTab === tab ? "border-violet-600 dark:border-violet-300 text-violet-700 dark:text-violet-200" : "border-transparent text-black/45 dark:text-white/45 hover:text-black dark:hover:text-white"}`}>{tab}</button>)}</div>
        <div className="p-4 sm:p-5 min-h-[445px]">
          {detailTab === "overview" && <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_245px] gap-4"><div className="space-y-4"><div className="rounded-[17px] border border-black/10 dark:border-white/10 p-4"><div className="flex items-center justify-between gap-3"><div><h4 className="m-0 text-[13px] font-semibold">Capture journey</h4><p className="m-0 mt-1 text-[12px] text-black/45 dark:text-white/45">A clear path from device setup to usable evidence.</p></div><span className="text-[13px] font-semibold tabular-nums">{selected.progress}%</span></div><div className="h-1.5 rounded-full bg-black/[0.07] dark:bg-white/10 mt-4 mb-4 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${selected.progress}%`, backgroundColor: selected.accent }} /></div><div className="space-y-0.5">{stages.map((stage, index) => { const complete = selected.progress >= (index + 1) * 20; const current = !complete && selected.progress >= index * 20; return <div key={stage} className="flex items-center gap-3 py-2.5"><span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${complete ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : current ? "bg-violet-500/15 text-violet-700 dark:text-violet-200" : "bg-black/[0.05] dark:bg-white/[0.06] text-black/35 dark:text-white/35"}`}>{complete ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><span className={`text-[12px] ${current ? "font-semibold" : "text-black/60 dark:text-white/60"}`}>{stage}</span>{current && <span className="ml-auto text-[11px] text-violet-700 dark:text-violet-300">Current</span>}</div>; })}</div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-[15px] border border-black/10 dark:border-white/10 p-4"><div className="text-[11px] text-black/45 dark:text-white/45">Screens</div><div className="text-[24px] font-semibold mt-1 tracking-[-0.04em]">{selected.screens}</div></div><div className="rounded-[15px] border border-black/10 dark:border-white/10 p-4"><div className="text-[11px] text-black/45 dark:text-white/45">Flows mapped</div><div className="text-[24px] font-semibold mt-1 tracking-[-0.04em]">{selected.flows}</div></div></div><div className="rounded-[15px] border border-black/10 dark:border-white/10 p-4 flex gap-3"><ShieldCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300 mt-0.5" /><div><div className="text-[12px] font-semibold">Evidence stays inspectable</div><p className="text-[12px] leading-relaxed text-black/50 dark:text-white/50 m-0 mt-1">When connected, original screens and ordered flows will remain available alongside the final review.</p></div></div></div><DevicePreview run={selected} /></div>}
          {detailTab === "screens" && <div><div className="flex items-center justify-between gap-2 mb-4"><div><h4 className="m-0 text-[13px] font-semibold">Captured screens</h4><p className="m-0 mt-1 text-[12px] text-black/45 dark:text-white/45">Ordered evidence, shown at full size when connected.</p></div><span className="text-[12px] text-black/45 dark:text-white/45 tabular-nums">{selected.screens} in sample run</span></div>{selected.screens ? <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">{Array.from({ length: Math.min(selected.screens, 10) }, (_, index) => <ScreenTile key={index} run={selected} index={index} />)}</div> : <div className="rounded-[16px] border border-dashed border-black/15 dark:border-white/15 py-16 flex flex-col items-center text-center"><FileImage className="h-6 w-6 text-black/30 dark:text-white/30" /><p className="text-[13px] font-semibold mt-3 mb-1">No screens yet</p><p className="text-[12px] text-black/45 dark:text-white/45 m-0">Screens appear here as the device captures them.</p></div>}<p className="text-[11px] text-black/40 dark:text-white/40 mt-5">The thumbnails above are UI placeholders, not screenshots of {selected.app}.</p></div>}
          {detailTab === "activity" && <div><div className="flex items-center justify-between mb-5"><div><h4 className="m-0 text-[13px] font-semibold">Run activity</h4><p className="m-0 mt-1 text-[12px] text-black/45 dark:text-white/45">Readable milestones first. Technical logs will be secondary.</p></div><Activity className="h-4 w-4 text-black/40 dark:text-white/40" /></div><div className="border-l border-black/10 dark:border-white/15 ml-2.5">{selected.activity.map((event, index) => <div key={`${event}-${index}`} className="relative pl-6 pb-6 last:pb-0"><span className={`absolute -left-[5px] top-0.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-[#17171e] ${index === 0 ? "bg-violet-500" : "bg-zinc-300 dark:bg-zinc-600"}`} /><div className="text-[12px] font-medium">{event}</div><div className="text-[11px] text-black/40 dark:text-white/40 mt-1">Sample event</div></div>)}</div><div className="rounded-[14px] bg-black/[0.035] dark:bg-white/[0.04] px-4 py-3 mt-7 flex items-start gap-2"><Settings2 className="h-4 w-4 text-black/40 dark:text-white/40 shrink-0" /><p className="text-[12px] text-black/50 dark:text-white/50 m-0">Detailed agent logs and recovery events will be available here after the capture service is connected.</p></div></div>}
          {detailTab === "setup" && <div><h4 className="m-0 text-[13px] font-semibold">Run setup</h4><p className="m-0 mt-1 mb-5 text-[12px] text-black/45 dark:text-white/45">A quick check of what this capture is configured to do.</p><div className="rounded-[16px] border border-black/10 dark:border-white/10 divide-y divide-black/10 dark:divide-white/10">{[["Application", selected.app], ["Package", selected.packageName], ["Capture scope", selected.scope], ["Organization", selected.organization], ["Device", selected.device], ["Runner", "Not connected in preview"]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 px-4 py-3.5 text-[12px]"><span className="text-black/45 dark:text-white/45">{label}</span><span className="font-medium text-right break-all">{value}</span></div>)}</div><div className="mt-4 rounded-[14px] border border-violet-300/40 dark:border-violet-400/20 bg-violet-500/[0.06] p-4"><div className="flex items-center gap-2 text-[12px] font-semibold"><ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-300" /> Organization-specific evidence</div><p className="m-0 mt-2 text-[12px] leading-relaxed text-black/55 dark:text-white/55">In the connected version, only approved admins can operate the run, and published screens are assigned to the selected organization.</p></div></div>}
        </div>
      </div>
    </div>

    {createOpen && <div className="fixed inset-0 z-[220] flex items-center justify-center p-4"><button className="absolute inset-0 bg-[#0c0b14]/65 backdrop-blur-[6px] cursor-default" aria-label="Close new capture preview" onClick={() => setCreateOpen(false)} /><div role="dialog" aria-modal="true" aria-labelledby="capture-modal-title" className="relative w-full max-w-[460px] rounded-[22px] bg-[#f8f8fc] dark:bg-[#1b1a22] border border-black/10 dark:border-white/15 shadow-2xl p-6 text-[#20202a] dark:text-[#f3f2f8]"><div className="flex justify-between items-start gap-4"><div><div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-violet-600 dark:text-violet-300">Capture setup</div><h3 id="capture-modal-title" className="m-0 mt-2 text-[23px] font-semibold tracking-[-0.04em]">New capture preview</h3><p className="mt-2 mb-0 text-[13px] leading-relaxed text-black/50 dark:text-white/50">See how a run would be configured. This creates a preview row only.</p></div><button onClick={() => setCreateOpen(false)} aria-label="Close" className="p-1.5 rounded-[8px] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"><X className="h-4 w-4" /></button></div><form onSubmit={createPreview} className="mt-6 space-y-4">{[["App name", newApp, setNewApp, "e.g. Graet"], ["Android package", newPackage, setNewPackage, "e.g. com.graet"]].map(([label, value, setter, placeholder]) => <label key={label as string} className="block"><span className="block text-[12px] font-semibold mb-1.5">{label as string}</span><input required={label === "App name"} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} placeholder={placeholder as string} className="w-full box-border rounded-[10px] border border-black/10 dark:border-white/15 bg-white dark:bg-white/[0.05] px-3.5 py-3 text-[13px] outline-none focus:ring-2 focus:ring-violet-400/40 placeholder:text-black/30 dark:placeholder:text-white/30" /></label>)}<div className="grid grid-cols-2 gap-3"><label className="block"><span className="block text-[12px] font-semibold mb-1.5">Organization</span><span className="relative block"><select value={newOrganization} onChange={(event) => setNewOrganization(event.target.value)} className="w-full appearance-none rounded-[10px] border border-black/10 dark:border-white/15 bg-white dark:bg-[#25242f] px-3 py-3 pr-7 text-[12px] outline-none focus:ring-2 focus:ring-violet-400/40"><option value="">Northstar preview</option>{organizations.map((organization) => <option key={organization.id} value={organization.name}>{organization.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" /></span></label><label className="block"><span className="block text-[12px] font-semibold mb-1.5">Scope</span><span className="relative block"><select value={newScope} onChange={(event) => setNewScope(event.target.value)} className="w-full appearance-none rounded-[10px] border border-black/10 dark:border-white/15 bg-white dark:bg-[#25242f] px-3 py-3 pr-7 text-[12px] outline-none focus:ring-2 focus:ring-violet-400/40"><option>Browsing</option><option>Onboarding</option><option>Both</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" /></span></label></div><div className="rounded-[11px] bg-violet-500/[0.07] border border-violet-400/20 px-3.5 py-3 text-[12px] leading-relaxed text-black/60 dark:text-white/60">Device compatibility and tenant permissions will be checked before a real run can begin.</div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-[10px] px-4 py-2.5 text-[12px] font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">Cancel</button><button type="submit" className="rounded-[10px] bg-[#24232d] dark:bg-white text-white dark:text-[#24232d] px-4 py-2.5 text-[12px] font-semibold hover:opacity-85 cursor-pointer">Create preview run</button></div></form></div></div>}
  </section>;
}
