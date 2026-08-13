"use client";

import { ArrowLeft, Images, Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";

import { useCanvasV2Research } from "@/components/canvas-v2/use-canvas-v2-research";
import type { AppDataApp, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";
import type { CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";

export function CanvasV2ResearchPanel({ endpoint, busy, onInsertFlow, onInsertScreen }: {
  endpoint: string;
  busy: boolean;
  onInsertFlow: (app: AppDataApp, flow: AppDataFlow, result: CanvasV2ResearchResult) => void;
  onInsertScreen: (result: CanvasV2ResearchResult, index: number) => void;
}) {
  const research = useCanvasV2Research(endpoint);
  const [selectedApp, setSelectedApp] = useState<AppDataApp>();
  const [query, setQuery] = useState("");
  const openApp = async (app: AppDataApp) => {
    setSelectedApp(app);
    await research.run({ operation: "list-flows", appName: app.name, limit: 30 });
  };
  const openFlow = (flow: AppDataFlow) => research.run({ operation: "flow-screens", appName: selectedApp?.name, flowName: flow.name, limit: 60 });
  const search = () => research.run({ operation: "search", query, limit: 30 });
  const showingScreens = research.result?.operation === "flow-screens" && research.result.flows[0];

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b border-[#ececf3] p-5">
      <div className="flex items-center gap-2 rounded-xl bg-[#f5f4fa] px-3 py-2.5">
        <Search className="h-4 w-4 text-[#9292a1]" />
        <input aria-label="Search research evidence" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="Search apps, flows, screens…" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {research.loading && <div className="flex items-center gap-2 py-8 text-sm text-[#747483]"><Loader2 className="h-4 w-4 animate-spin" />Loading grounded evidence…</div>}
      {research.error && <div className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{research.error}</div>}
      {!research.loading && !research.error && showingScreens && <>
        <button onClick={() => research.run({ operation: "list-flows", appName: selectedApp?.name, limit: 30 })} className="mb-4 flex items-center gap-1 text-xs font-bold text-[#6553e8]"><ArrowLeft className="h-3.5 w-3.5" />All {selectedApp?.name} flows</button>
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{showingScreens.name}</h2><p className="mt-1 text-xs text-[#858594]">{research.result?.screens.length} ordered screens · {showingScreens.platform ?? "captured"} {showingScreens.sessionType ?? "flow"}</p></div><button onClick={() => selectedApp && onInsertFlow(selectedApp, showingScreens, research.result!)} disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#6d59ed] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Insert flow</button></div>
        <div className="mt-5 grid grid-cols-2 gap-3">{research.result?.screens.map((screen, index) => <button key={screen.id} onClick={() => onInsertScreen(research.result!, index)} disabled={busy || !screen.imageUrl} className="group overflow-hidden rounded-xl border border-[#e6e6ee] bg-[#fafafe] text-left disabled:opacity-40"><div className="grid h-36 place-items-center overflow-hidden bg-white p-2">{screen.imageUrl ? <img src={screen.imageUrl} alt={screen.name} className="h-full w-full object-contain transition group-hover:scale-[1.03]" /> : <Images className="h-5 w-5 text-[#aaaab8]" />}</div><div className="border-t border-[#ececf3] p-2"><div className="truncate text-[11px] font-bold">{index + 1}. {screen.name}</div><div className="mt-0.5 text-[10px] text-[#9292a1]">Click to insert</div></div></button>)}</div>
      </>}
      {!research.loading && !research.error && research.result?.operation === "list-flows" && <>
        <button onClick={() => { setSelectedApp(undefined); void research.run({ operation: "list-apps", limit: 30 }); }} className="mb-4 flex items-center gap-1 text-xs font-bold text-[#6553e8]"><ArrowLeft className="h-3.5 w-3.5" />All apps</button>
        <h2 className="font-black">{selectedApp?.name}</h2><p className="mt-1 text-xs text-[#858594]">Choose an ordered captured flow</p>
        <div className="mt-4 space-y-2">{research.result.flows.map((flow) => <button key={flow.id} onClick={() => void openFlow(flow)} className="w-full rounded-xl border border-[#e6e6ee] p-3 text-left hover:border-[#aaa0f8] hover:bg-[#faf9ff]"><div className="text-xs font-bold">{flow.name}</div><div className="mt-1 text-[10px] text-[#8b8b99]">{flow.screens.length} screens · {[flow.platform, flow.sessionType].filter(Boolean).join(" ")}</div></button>)}</div>
        {!research.result.flows.length && <div className="py-8 text-sm text-[#858594]">No captured flows are available for this app.</div>}
      </>}
      {!research.loading && !research.error && (research.result?.operation === "list-apps" || research.result?.operation === "search") && <>
        <div className="mb-4"><h2 className="font-black">Research library</h2><p className="mt-1 text-xs text-[#858594]">Account apps and exact captured evidence</p></div>
        <div className="space-y-2">{research.result.apps.map((app) => <button key={app.id} onClick={() => void openApp(app)} className="flex w-full items-center gap-3 rounded-xl border border-[#e6e6ee] p-3 text-left hover:border-[#aaa0f8] hover:bg-[#faf9ff]">{app.iconUrl ? <img src={app.iconUrl} alt="" className="h-9 w-9 rounded-lg object-contain" /> : <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#eeeaff] text-xs font-black text-[#6553e8]">{app.name.slice(0, 1)}</div>}<div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{app.name}</div><div className="mt-1 text-[10px] text-[#8b8b99]">{app.flows.length} flows · {app.totalScreens} screens</div></div></button>)}</div>
        {!research.result.apps.length && <div className="py-8 text-sm text-[#858594]">No grounded evidence matched this search.</div>}
      </>}
    </div>
    <div className="border-t border-[#ececf3] px-5 py-3 text-[10px] leading-4 text-[#9696a4]">Inserted media keeps its exact account evidence identity, URL, app, flow, and order.</div>
  </div>;
}
