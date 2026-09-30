"use client";

import { Check, ChevronDown, CircleDashed, Clock3, Compass, Layers3, Settings2, UserRound } from "lucide-react";

type OpenCheck = { path: string; reason: string; impact: "broad" | "local" | "unverified" };

export type CaptureProgress = {
  tabs: { name: string; state: ProgressState; screens: number; open_checks: OpenCheck[]; subviews: { name: string; state: ProgressState; screens: number }[] }[];
  areas: { name: string; state: ProgressState; screens: number }[];
  identified_tabs: number;
  visited_tabs: number;
  done_tabs: number;
  navigation_percent: number | null;
  current_path: string | null;
  current_phase: string | null;
  last_screen_at: number | null;
};

type ProgressState = "not_identified" | "not_reached" | "capturing" | "needs_followup" | "done";

const stateCopy: Record<ProgressState, string> = {
  not_identified: "Not identified yet",
  not_reached: "Not reached",
  capturing: "Capturing now",
  needs_followup: "Review needed",
  done: "Checked",
};

const stateTone: Record<ProgressState, string> = {
  not_identified: "text-[#77758a] dark:text-[#a7a4b8] bg-[#f2f1f6] dark:bg-white/[.06]",
  not_reached: "text-[#77758a] dark:text-[#a7a4b8] bg-[#f2f1f6] dark:bg-white/[.06]",
  capturing: "text-[#5c41b9] dark:text-[#d8c9ff] bg-[#eee8ff] dark:bg-[#403168]",
  needs_followup: "text-[#8b5814] dark:text-[#f4cc8c] bg-[#fff2dc] dark:bg-[#523c25]",
  done: "text-[#167354] dark:text-[#a9ead0] bg-[#e3f5eb] dark:bg-[#204939]",
};

function State({ value }: { value: ProgressState }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${stateTone[value]}`}>
    {value === "done" ? <Check className="h-3 w-3" /> : value === "capturing" ? <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> : null}
    {stateCopy[value]}
  </span>;
}

const impactCopy: Record<OpenCheck["impact"], string> = {
  broad: "Main-section impact",
  local: "One-page impact",
  unverified: "Impact not yet known",
};

const impactTone: Record<OpenCheck["impact"], string> = {
  broad: "bg-[#fff0d5] text-[#8b5318] dark:bg-[#523b23] dark:text-[#f5cc91]",
  local: "bg-[#e7f4f3] text-[#226d6b] dark:bg-[#1c4142] dark:text-[#9fdad5]",
  unverified: "bg-[#f0eff5] text-[#6d687c] dark:bg-white/[.08] dark:text-[#c0bacd]",
};

function OpenChecks({ checks, tabName }: { checks: OpenCheck[]; tabName: string }) {
  if (!checks.length) return null;
  const first = checks[0];
  return <details className="group ml-10 mt-3 rounded-[10px] border border-[#e8e3ef] bg-[#fcfbfe] dark:border-white/[.09] dark:bg-white/[.035]">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] text-[#5b566c] marker:hidden dark:text-[#d0c9dd] [&::-webkit-details-marker]:hidden">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e7ad5c]" />
      <span className="min-w-0 flex-1 truncate"><strong className="font-semibold">{checks.length} known open {checks.length === 1 ? "check" : "checks"}</strong> · {first.path === tabName ? tabName : first.path.split(" > ").slice(1).join(" › ")}: {first.reason}</span>
      <span className="shrink-0 font-semibold text-[#6d50c2] dark:text-[#c4aeff]"><span className="group-open:hidden">See details</span><span className="hidden group-open:inline">Hide details</span></span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8d7bbf] transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-[#ece8f1] px-3 pb-2 pt-1 dark:border-white/[.08]">
      <p className="my-2 text-[11px] leading-relaxed text-[#777083] dark:text-[#aaa3b8]">These are recorded capture checks; the final audit may add others. Impact describes the size of the affected navigation area, not the app’s business importance.</p>
      <ol className="m-0 list-none divide-y divide-[#ece8f1] p-0 dark:divide-white/[.08]">{checks.map((check, index) => <li key={`${check.path}-${check.reason}-${index}`} className="py-3 first:pt-1">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${impactTone[check.impact]}`}>{impactCopy[check.impact]}</span><span className="text-[12px] font-semibold text-[#373346] dark:text-[#f1edfa]">{check.path}</span></div>
        <p className="mb-0 mt-1.5 break-words text-[12px] leading-relaxed text-[#5d586b] dark:text-[#c5bed0]">{check.reason}</p>
      </li>)}</ol>
    </div>
  </details>;
}

function timeSince(timestamp: number | null) {
  if (!timestamp) return "No screen saved yet";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp * 1000) / 60000));
  if (minutes < 1) return "Screen saved just now";
  if (minutes < 60) return `Last screen saved ${minutes}m ago`;
  return `Last screen saved ${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export function CaptureProgressView({ progress }: { progress: CaptureProgress }) {
  const percent = progress.navigation_percent ?? 0;
  const total = progress.identified_tabs;
  return <section aria-label="Capture coverage map" className="overflow-hidden rounded-[20px] border border-[#dcd9e8] bg-white/90 shadow-[0_12px_36px_rgba(39,31,83,.06)] dark:border-white/[.1] dark:bg-[#1d1b28] dark:shadow-none">
    <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#7859cf] dark:text-[#bfaaff]"><Compass className="h-3.5 w-3.5" /> Capture map</div>
          <h4 className="m-0 mt-2 text-[21px] font-semibold tracking-[-.035em] text-[#252339] dark:text-[#f6f2ff]">Where the agent has been</h4>
          <p className="m-0 mt-1 text-[12px] leading-relaxed text-[#686579] dark:text-[#b7b1c8]">{total ? `${progress.visited_tabs} of ${total} main tabs reached` : "Waiting for the agent to identify main tabs"} · {progress.done_tabs} fully checked</p>
        </div>
        <div className="text-right"><div className="text-[32px] leading-none font-semibold tracking-[-.06em] tabular-nums text-[#3d2b82] dark:text-[#dfd0ff]">{total ? `${percent}%` : "—"}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#777389] dark:text-[#aca5bd]">Main tabs reached</div></div>
      </div>
      <div className="mt-5 flex gap-1.5" role="img" aria-label={`${progress.visited_tabs} of ${total} main tabs reached`}>
        {progress.tabs.map((tab) => <div key={tab.name} title={`${tab.name}: ${stateCopy[tab.state]}`} className={`h-2 flex-1 rounded-full ${tab.state === "done" ? "bg-[#36ae82]" : tab.state === "capturing" ? "bg-[#8c65ee]" : tab.state === "needs_followup" ? "bg-[#efba70]" : "bg-[#e7e5ee] dark:bg-white/[.12]"}`} />)}
        {!total && <div className="h-2 w-full rounded-full bg-[#e7e5ee] dark:bg-white/[.12]" />}
      </div>
      <p className="m-0 mt-2 text-[11px] text-[#807b8f] dark:text-[#a9a3b5]">This measures known navigation coverage. The final audit may still find gaps.</p>
    </div>

    <div className="border-t border-[#e8e6ee] dark:border-white/[.08]">
      <div className="flex items-center justify-between px-5 py-3 sm:px-6"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#777286] dark:text-[#aaa5b9]">Main navigation</span><span className="text-[11px] text-[#888395] dark:text-[#aaa5b9]">{total} identified</span></div>
      {progress.tabs.length ? progress.tabs.map((tab, index) => <div key={tab.name} className="border-t border-[#f0eef4] dark:border-white/[.06] px-5 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-[11px] font-semibold tabular-nums ${tab.state === "capturing" ? "bg-[#845de5] text-white" : "bg-[#f0eef5] text-[#77718d] dark:bg-white/[.08] dark:text-[#c1bbcf]"}`}>{String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-[120px] flex-1"><div className="text-[13px] font-semibold text-[#2b2939] dark:text-[#f4f1fa]">{tab.name}</div><div className="text-[11px] text-[#858093] dark:text-[#aaa4b9]">{tab.screens ? `${tab.screens} mapped screen${tab.screens === 1 ? "" : "s"}` : "No mapped screens yet"}{tab.subviews.length ? ` · ${tab.subviews.length} section${tab.subviews.length === 1 ? "" : "s"}` : ""}</div></div>
          <State value={tab.state} />
        </div>
        {tab.subviews.length > 0 && <div className="ml-10 mt-2.5 flex flex-wrap gap-1.5">{tab.subviews.map((view) => <span key={view.name} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#e7e4ee] bg-[#faf9fc] px-2 py-1 text-[10px] text-[#5b576a] dark:border-white/[.08] dark:bg-white/[.04] dark:text-[#cbc5d6]"><span className={`h-1.5 w-1.5 rounded-full ${view.state === "done" ? "bg-[#36ae82]" : view.state === "capturing" ? "bg-[#8c65ee]" : view.state === "needs_followup" ? "bg-[#efba70]" : "bg-[#c9c5d4]"}`} />{view.name.split(" > ").slice(-1)[0]}</span>)}</div>}
        <OpenChecks checks={tab.open_checks || []} tabName={tab.name} />
      </div>) : <div className="border-t border-[#f0eef4] px-6 py-6 text-[12px] text-[#817c90] dark:border-white/[.06] dark:text-[#aaa4b9]">The navigation map appears as soon as the agent identifies tabs.</div>}
    </div>

    <div className="border-t border-[#e8e6ee] bg-[#faf9fd] px-5 py-4 dark:border-white/[.08] dark:bg-white/[.025] sm:px-6">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#777286] dark:text-[#aaa5b9]"><Layers3 className="h-3.5 w-3.5" /> Account areas</div>
      <div className="grid gap-2 sm:grid-cols-2">{progress.areas.map((area) => <div key={area.name} className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e9e6ef] bg-white px-3 py-2.5 dark:border-white/[.08] dark:bg-white/[.04]"><div className="flex items-center gap-2"><span className="text-[#7667a3] dark:text-[#b7a6e5]">{area.name === "Profile" ? <UserRound className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}</span><span className="text-[12px] font-semibold text-[#302d41] dark:text-[#f0ecfa]">{area.name}</span></div><State value={area.state} /></div>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#777286] dark:text-[#b8b1c8]"><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{timeSince(progress.last_screen_at)}</span><span className="inline-flex min-w-0 items-center gap-1.5"><CircleDashed className="h-3.5 w-3.5" />Current: <strong className="max-w-[230px] truncate font-semibold text-[#514778] dark:text-[#ddd1fb]" title={progress.current_path || undefined}>{progress.current_path || "Waiting to start"}</strong></span></div>
    </div>
  </section>;
}
