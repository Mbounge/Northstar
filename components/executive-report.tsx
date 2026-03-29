// components/executive-report.tsx
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Activity, Target, ShieldAlert, FileText,
  DollarSign, Layers, CheckCircle2, XCircle, BookOpen,
  GitMerge, Database, Lightbulb, ChevronRight,
  ImageIcon, SplitSquareHorizontal
} from "lucide-react";

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border", className)}>
      {children}
    </span>
  );
}

function Pill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 whitespace-nowrap", active ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] border border-white/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] border border-transparent")}>
      {icon} {label}
    </button>
  );
}

function SectionLabel({ icon, children, color = "text-zinc-500" }: { icon?: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] mb-2", color)}>
      {icon} {children}
    </div>
  );
}

function StatBlock({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider block mb-0.5 truncate">{label}</span>
      <span className={cn("text-lg font-mono font-bold leading-tight", accent || "text-zinc-200")}>{value}</span>
      {sub && <span className="text-[10px] text-zinc-600 block">{sub}</span>}
    </div>
  );
}

export function ExecutiveReport({ intel, steps =[], mode }: { intel: any, steps?: any[], mode: "onboarding" | "browsing" }) {
  const[tab, setTab] = useState<"strategy" | "friction" | "patterns" | "glossary">("strategy");
  const[viewingScreens, setViewingScreens] = useState<number[] | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setViewingScreens(null); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  },[]);

  if (!intel) return <div className="flex items-center justify-center h-64 text-zinc-600 text-sm italic">No intelligence available for this mode.</div>;

  const {
    executive_summary, competitive_profile, onboarding_strategy,
    friction_assessment, acquisition_monetization, pattern_library,
    dark_pattern_audit, glossary, friction_report, funnel_summary
  } = intel;

  const formatComponent = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fmt = (s: string) => s?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "";
  
  const primaryStrategy = onboarding_strategy?.strategy_type_primary || onboarding_strategy?.strategy_type || "Unknown";
  const secondaryStrategy = onboarding_strategy?.strategy_type_secondary;

  const handleViewScreens = (input: string | number[]) => {
    if (Array.isArray(input)) { setViewingScreens(input.map(Number)); return; }
    if (typeof input === 'string') {
      if (input.includes('-')) {
        const[start, end] = input.split('-').map(Number);
        setViewingScreens(Array.from({ length: end - start + 1 }, (_, i) => start + i));
      } else setViewingScreens([Number(input)]);
    }
  };

  // ─── DATA NORMALIZATION (Fixes AI Hallucinations / Empty Boxes) ───
  
  // 1. Normalize Dark Patterns (Use the rich detailed object first)
  const rawDarkPatternsDetailed = funnel_summary?.dark_patterns_detailed || {};
  const auditPatterns = dark_pattern_audit?.patterns_found ||[];
  
  let darkPatternsArray = Object.entries(rawDarkPatternsDetailed).map(([key, val]: any) => ({
    pattern_type: key,
    description: val.description,
    severity: val.severity,
    screens: val.screen_indices
  }));

  // Fallback if detailed object is empty
  if (darkPatternsArray.length === 0 && auditPatterns.length > 0) {
    darkPatternsArray = auditPatterns.map((p: any) => 
      typeof p === "string" 
        ? { pattern_type: p, description: "Observed in the UI flow.", severity: "medium", screens:[] } 
        : { pattern_type: p.pattern_type, description: p.description, severity: p.severity, screens: p.screens }
    );
  }

  // 2. Normalize UX Patterns (With Smart Heuristic Rescue)
  const uxPatternsArray = (pattern_library ||[]).map((p: any) => {
    let name = typeof p === "string" ? p : (p.pattern_name || p.name || "UX Pattern");
    let desc = typeof p === "string" ? "Observed in the UI architecture." : (p.description || p.competitive_insight || "Observed in the UI architecture.");
    let screens = typeof p === "string" ?[] : (p.screen_indices || p.screens ||[]);

    // HEURISTIC RESCUE: If the AI only gave us strings (missing screens/descriptions), 
    // hunt through the raw step data to find the evidence and re-link the buttons!
    if (screens.length === 0 && steps && steps.length > 0) {
      const foundScreens = new Set<number>();
      let foundDesc = "";
      // Clean the name for better fuzzy matching
      const searchName = name.toLowerCase().replace(/\b(style|pattern|ui)\b/ig, '').trim();

      steps.forEach((stepData: any) => {
        const stepNum = stepData.step || stepData.enrichedData?.extraction_meta?.timeline_step;
        if (!stepNum) return;

        const strat = stepData.enrichedData?.strategic_interpretation || {};
        const decisions = strat.design_decisions ||[];
        let matched = false;

        // Search in design decisions
        decisions.forEach((dec: any) => {
          const decStr = typeof dec === 'string' ? dec : JSON.stringify(dec);
          if (searchName.length > 3 && decStr.toLowerCase().includes(searchName)) {
            matched = true;
            if (!foundDesc && typeof dec === 'object') {
              foundDesc = dec.description || dec.rationale || dec.intent || dec.observation || dec.design_choice || "";
            } else if (!foundDesc && typeof dec === 'string') {
              foundDesc = dec;
            }
          }
        });

        // Search in narrative
        const narrative = stepData.enrichedData?.screen_intelligence?.narrative || "";
        if (searchName.length > 3 && narrative.toLowerCase().includes(searchName)) {
          matched = true;
        }

        if (matched) foundScreens.add(stepNum);
      });

      if (foundScreens.size > 0) screens = Array.from(foundScreens).sort((a, b) => a - b);
      if (desc === "Observed in the UI architecture." && foundDesc) desc = foundDesc;
    }

    return { 
      pattern_name: name, 
      description: desc,
      screen_indices: screens
    };
  });

  // 3. Normalize Friction Points
  const badFriction = (friction_assessment?.unnecessary_friction || friction_assessment?.biggest_friction_points ||[]).map((p: any) => {
    if (typeof p === "string") return { factor: p, description: "Observed in the UI flow.", screens:[] };
    return p;
  });

  const goodFriction = (friction_assessment?.intentional_friction || Object.values(friction_report?.friction_breakdown_rich || {})).map((p: any, i: number) => {
    if (typeof p === "string") return { factor: p, description: "Observed in the UI flow.", screens:[] };
    if (!p.factor) p.factor = Object.keys(friction_report?.friction_breakdown_rich || {})[i] || "Unknown";
    return p;
  });

  const mechanicDescriptions: Record<string, string> = {
    identity_and_verification: "Account creation, passwords, and OTP codes.",
    form_fields: "Data entry, profiling, and required typing.",
    permissions: "System popups for location, camera, etc.",
    monetization_gates: "Paywalls and forced subscription trials.",
    interruptions: "Surveys, ratings, and loading screens.",
    flow_length: "Penalties for excessive screens before value.",
    flow_issues: "Errors or broken UI requiring recovery.",
    navigational_complexity: "Deep nesting, hidden tabs, dead ends.",
    monetization_aggressiveness: "Forced paywalls, hidden pricing, ads.",
    engagement_interruptions: "Rating prompts, notifications, spam.",
    ui_ux_issues: "Dark patterns, unclear elements, loading delays.",
  };

  return (
    <div className="max-w-[1400px] mx-auto font-[system-ui] text-zinc-100 pb-12 relative flex flex-col gap-6">
      
      {viewingScreens && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setViewingScreens(null)} />
          <div className="relative z-10 bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-[90vw] h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
              <div>
                <h3 className="text-zinc-200 font-bold flex items-center gap-2 text-lg">
                  <ImageIcon className="w-5 h-5 text-blue-400" /> Referenced Screens
                </h3>
              </div>
              <button onClick={() => setViewingScreens(null)} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 md:p-8 flex gap-8 items-center justify-start hide-scrollbar">
              {viewingScreens.map(s => {
                const stepData = steps[s - 1];
                if (!stepData) return null;
                return (
                  <div key={s} className="h-full shrink-0 flex flex-col items-center justify-between pb-1">
                    <div className="relative h-[calc(100%-3rem)] aspect-[9/19] rounded-xl overflow-hidden border border-zinc-800 bg-black shadow-2xl shrink-0">
                      <Image src={stepData.imagePath} alt={`Screen ${s}`} fill className="object-contain" unoptimized />
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] px-4 py-1.5 rounded-full font-mono shadow-sm shrink-0">SCREEN {s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto pb-1 shrink-0">
        <Pill active={tab === "strategy"} onClick={() => setTab("strategy")} icon={<Target className="w-3.5 h-3.5 text-violet-400" />} label="Strategy & Architecture" />
        <Pill active={tab === "friction"} onClick={() => setTab("friction")} icon={<Activity className="w-3.5 h-3.5 text-amber-400" />} label={mode === "onboarding" ? "UX & Friction Score" : "UX & Complexity Score"} />
        <Pill active={tab === "patterns"} onClick={() => setTab("patterns")} icon={<Layers className="w-3.5 h-3.5 text-indigo-400" />} label="UX & Dark Patterns" />
        <Pill active={tab === "glossary"} onClick={() => setTab("glossary")} icon={<BookOpen className="w-3.5 h-3.5 text-emerald-400" />} label="Glossary" />
      </nav>

      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0c1425] via-[#0f1a2e] to-[#111827] border border-white/[0.04] shadow-xl shrink-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />
        <div className="relative px-6 py-5 flex items-start gap-4">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/70 mb-1.5">Executive Summary</h1>
            <p className="text-[14px] leading-relaxed text-blue-50/90 font-medium max-w-5xl">
              {executive_summary || "No summary generated."}
            </p>
          </div>
        </div>
      </section>

      {tab === "strategy" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5 flex flex-col">
              <SectionLabel icon={<Target className="w-3 h-3 text-violet-400" />}>Architecture</SectionLabel>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30 text-[11px] py-0.5 px-2.5 capitalize">{fmt(primaryStrategy)}</Badge>
                {secondaryStrategy && secondaryStrategy !== "none" && secondaryStrategy !== "null" && (
                  <Badge className="bg-zinc-800/60 text-zinc-400 border-zinc-700/50 capitalize">+ {fmt(secondaryStrategy)}</Badge>
                )}
              </div>
              <p className="text-[13px] text-zinc-400 leading-relaxed mb-4">{onboarding_strategy?.strategy_description || "No detailed description."}</p>
              {onboarding_strategy?.key_strategic_insight && (
                <div className="mt-auto pt-3 border-t border-white/[0.04]">
                  <SectionLabel icon={<Lightbulb className="w-3 h-3 text-amber-400" />} color="text-amber-500/70">Key Insight</SectionLabel>
                  <p className="text-[13px] text-amber-200/80 leading-relaxed">{onboarding_strategy.key_strategic_insight}</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5 flex flex-col">
              <SectionLabel icon={<DollarSign className="w-3 h-3 text-emerald-400" />} color="text-emerald-500/70">Monetization</SectionLabel>
              <div className="space-y-3 text-[13px] mb-4">
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Model</span>
                  <span className="text-zinc-200 capitalize font-medium">{fmt(competitive_profile?.monetization_model || "N/A")}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Aggressiveness</span>
                    <Badge className={cn("capitalize", onboarding_strategy?.monetization_aggressiveness?.includes("aggressive") ? "bg-rose-500/10 text-rose-400 border-rose-500/25" : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50")}>
                      {fmt(onboarding_strategy?.monetization_aggressiveness || "N/A")}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Price Transparency</span>
                    <span className="text-zinc-300 capitalize text-[13px]">{fmt(acquisition_monetization?.price_transparency || "N/A")}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
              <SectionLabel icon={<Database className="w-3 h-3 text-sky-400" />} color="text-sky-500/70">Data Collection</SectionLabel>
              <div className="space-y-4">
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1.5">{mode === "onboarding" ? "Pre-Auth" : "Core Inputs"}</span>
                  <div className="flex flex-wrap gap-1">
                    {onboarding_strategy?.data_collected_pre_auth?.length > 0 ? onboarding_strategy.data_collected_pre_auth.map((d: string, i: number) => (<Badge key={i} className="bg-zinc-800/50 text-zinc-300 border-zinc-700/40 capitalize text-[10px]">{d}</Badge>)) : <span className="text-[11px] text-zinc-600 italic">None logged</span>}
                  </div>
                </div>
                <div className="pt-3 border-t border-white/[0.04]">
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1.5">{mode === "onboarding" ? "Post-Auth" : "Optional Data"}</span>
                  <div className="flex flex-wrap gap-1">
                    {onboarding_strategy?.data_collected_post_auth?.length > 0 ? onboarding_strategy.data_collected_post_auth.map((d: string, i: number) => (<Badge key={i} className="bg-zinc-800/50 text-zinc-300 border-zinc-700/40 capitalize text-[10px]">{d}</Badge>)) : <span className="text-[11px] text-zinc-600 italic">None logged</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {onboarding_strategy?.strategy_evolution?.length > 0 && (
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
              <SectionLabel icon={<GitMerge className="w-3 h-3 text-indigo-400" />} color="text-indigo-400/70">Strategy Evolution</SectionLabel>
              <div className="flex gap-3 overflow-x-auto pb-2 mt-3 snap-x">
                {onboarding_strategy.strategy_evolution.map((phase: any, i: number) => (
                  <div key={i} className="flex items-stretch gap-2 snap-start">
                    <div className="min-w-[260px] max-w-[300px] rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4 flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-[10px] font-mono font-bold text-indigo-300">{i + 1}</span>
                          <span className="font-semibold text-indigo-300 text-[13px] capitalize">{fmt(phase.phase_strategy || "")}</span>
                        </div>
                        {phase.screens && (
                          <button onClick={() => handleViewScreens(phase.screens)} className="inline-flex items-center rounded-md px-2 py-0.5 text-[9px] uppercase tracking-wider bg-zinc-950 text-zinc-400 border border-zinc-700 hover:text-white hover:border-blue-500 transition-colors cursor-pointer">
                            Screens {phase.screens}
                          </button>
                        )}
                      </div>
                      <p className="text-[12px] text-zinc-400 leading-relaxed">{phase.rationale}</p>
                    </div>
                    {i < onboarding_strategy.strategy_evolution.length - 1 && <div className="flex items-center shrink-0"><ChevronRight className="w-4 h-4 text-zinc-700" /></div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "friction" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div className="flex items-end gap-3">
                <span className={cn("text-6xl font-black leading-none tracking-tighter", friction_assessment?.friction_grade === "F" ? "text-rose-500" : friction_assessment?.friction_grade === "A" ? "text-emerald-400" : "text-amber-400")}>
                  {friction_assessment?.friction_grade || "?"}
                </span>
                <div className="mb-1">
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block">Score</span>
                  <span className="text-zinc-300 text-xl font-mono font-bold">{friction_assessment?.total_friction_score || 0}<span className="text-zinc-600">/100</span></span>
                </div>
              </div>
              <StatBlock label="Screens Analysed" value={friction_report?.actual_total_screens || 0} accent="text-blue-400" />
              <StatBlock label="Identified Hurdles" value={friction_report?.total_events_detected || 0} accent="text-zinc-300" />
            </div>
          </div>

          {friction_report?.component_breakdown && (
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
              <SectionLabel icon={<SplitSquareHorizontal className="w-3 h-3 text-orange-400" />} color="text-orange-400/70">Mechanics Breakdown</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
                {Object.entries(friction_report.component_breakdown).filter(([k]) => k !== "repetition_bonus").map(([key, val]: any) => (
                  <div key={key} className={cn("p-3.5 rounded-xl border flex flex-col justify-start", val > 0 ? "bg-orange-500/[0.04] border-orange-500/15" : "bg-zinc-950/30 border-zinc-800/40")}>
                    <span className="text-zinc-400 text-[10px] uppercase font-bold block mb-1 truncate" title={formatComponent(key)}>{formatComponent(key)}</span>
                    <span className={cn("text-2xl font-bold font-mono mb-2", val > 0 ? "text-orange-400" : "text-zinc-700")}>{val > 0 ? `+${val}` : "0"}</span>
                    <span className="text-[10px] text-zinc-500 leading-tight">{mechanicDescriptions[key] || "Friction points."}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-rose-500/[0.02] border border-rose-500/10 p-5">
              <SectionLabel icon={<XCircle className="w-3 h-3 text-rose-400" />} color="text-rose-400/70">{mode === "onboarding" ? "Unnecessary Friction" : "Critical UX Blockers"}</SectionLabel>
              <div className="space-y-3 mt-3">
                {badFriction.length > 0
                  ? badFriction.map((point: any, i: number) => (
                    <div key={i} className="rounded-xl bg-zinc-950/40 border border-rose-500/10 p-4">
                      <h4 className="text-rose-200 font-semibold text-[13px] capitalize mb-2">{fmt(point.factor || "")}</h4>
                      <p className="text-zinc-400 text-[12px] leading-relaxed mb-3">{point.description}</p>
                      {point.screens && point.screens.length > 0 && (
                        <div className="pt-3 border-t border-rose-900/30 flex justify-end">
                          <button onClick={() => handleViewScreens(point.screens)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer font-mono"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" /> View Screens ({point.screens.join(", ")})</button>
                        </div>
                      )}
                    </div>
                  ))
                  : <p className="text-zinc-600 italic text-sm">None identified.</p>
                }
              </div>
            </div>

            <div className="rounded-2xl bg-emerald-500/[0.02] border border-emerald-500/10 p-5">
              <SectionLabel icon={<CheckCircle2 className="w-3 h-3 text-emerald-400" />} color="text-emerald-400/70">{mode === "onboarding" ? "Intentional Friction" : "Observed Friction"}</SectionLabel>
              <div className="space-y-3 mt-3">
                {goodFriction.length > 0
                  ? goodFriction.map((point: any, i: number) => (
                    <div key={i} className="rounded-xl bg-zinc-950/40 border border-emerald-500/10 p-4">
                      <h4 className="text-emerald-200 font-semibold text-[13px] capitalize mb-2">{fmt(point.factor || "")}</h4>
                      <p className="text-zinc-400 text-[12px] leading-relaxed mb-3">{point.description}</p>
                      {point.screens && point.screens.length > 0 && (
                        <div className="pt-3 border-t border-emerald-900/30 flex justify-end">
                          <button onClick={() => handleViewScreens(point.screens)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer font-mono"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" /> View Screens ({point.screens.join(", ")})</button>
                        </div>
                      )}
                    </div>
                  ))
                  : <p className="text-zinc-600 italic text-sm">None identified.</p>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "patterns" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in duration-300">
          
          <div className="space-y-3">
            <SectionLabel icon={<Layers className="w-3 h-3 text-indigo-400" />} color="text-indigo-400/70">Notable UX Patterns</SectionLabel>
            {uxPatternsArray.length > 0 ? uxPatternsArray.map((pattern: any, i: number) => (
              <div key={i} className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-indigo-300 font-semibold text-[13px] capitalize">{fmt(pattern.pattern_name)}</span>
                  {pattern.screen_indices && pattern.screen_indices.length > 0 && (
                    <button onClick={() => handleViewScreens(pattern.screen_indices)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[9px] bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer font-mono"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" /> Screens {pattern.screen_indices.join(", ")}</button>
                  )}
                </div>
                <p className="text-zinc-400 text-[12px] mb-4 leading-relaxed">{pattern.description}</p>
              </div>
            )) : <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-8 text-center text-zinc-600 text-sm italic">No notable UX patterns extracted.</div>}
          </div>

          <div className="space-y-3">
            <SectionLabel icon={<ShieldAlert className="w-3 h-3 text-rose-400" />} color="text-rose-400/70">Dark Patterns Detected</SectionLabel>
            {darkPatternsArray.length > 0 ? darkPatternsArray.map((pattern: any, i: number) => (
                <div key={i} className="rounded-2xl bg-rose-500/[0.03] border border-rose-500/15 p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h4 className="text-rose-200 font-semibold text-[13px] capitalize">{fmt(pattern.pattern_type || "")}</h4>
                    {pattern.severity && (
                      <Badge className={cn(
                        "text-[9px] shrink-0",
                        pattern.severity === "aggressive" || pattern.severity === "high"
                          ? "bg-rose-500/15 text-rose-300 border-rose-500/25"
                          : "bg-rose-500/5 text-rose-400 border-rose-500/15"
                      )}>
                        {pattern.severity}
                      </Badge>
                    )}
                  </div>
                  {pattern.description && <p className="text-zinc-400 text-[12px] mb-4 leading-relaxed">{pattern.description}</p>}
                  {pattern.screens && pattern.screens.length > 0 && (
                    <div className="flex justify-end pt-3 border-t border-rose-500/10">
                      <button onClick={() => handleViewScreens(pattern.screens)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-zinc-950 border border-rose-900/50 text-zinc-300 hover:text-white transition-all cursor-pointer font-mono"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" /> View Screens ({pattern.screens.join(", ")})</button>
                    </div>
                  )}
                </div>
            )) : <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-8 text-center"><ShieldAlert className="w-6 h-6 text-zinc-700 mx-auto mb-2" /><p className="text-zinc-500 text-sm">No dark patterns detected.</p></div>}
          </div>
        </div>
      )}

      {tab === "glossary" && (
        <div className="animate-in fade-in duration-300">
          {glossary && Object.keys(glossary).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(glossary).map(([term, data]: any, i: number) => {
                const definition = typeof data === "string" ? data : data.definition;
                const step = typeof data === "object" ? data.first_seen_step : null;
                return (
                  <div key={i} className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-4 flex flex-col justify-between group">
                    <div>
                      <div className="mb-3"><span className="text-emerald-400 font-mono text-[12px] font-bold bg-emerald-500/8 px-2 py-0.5 rounded border border-emerald-500/15">{term}</span></div>
                      <p className="text-[12px] text-zinc-400 leading-relaxed mb-4">{definition}</p>
                    </div>
                    {step && (
                      <div className="mt-auto border-t border-white/[0.04] pt-3 flex justify-end">
                        <button onClick={() => handleViewScreens([step])} className="inline-flex items-center rounded-md px-2 py-1 text-[9px] bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-white transition-all cursor-pointer font-mono uppercase tracking-widest"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" /> View Screen {step}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-12 text-center">
              <BookOpen className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <h3 className="text-zinc-400 font-medium mb-1">No Glossary Extracted</h3>
            </div>
          )}
        </div>
      )}
    </div>
  );
}