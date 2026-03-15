//components/executive-report.tsx

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Activity, Target, ShieldAlert, FileText,
  DollarSign, Layers, CheckCircle2, XCircle, BookOpen,
  GitMerge, Database, TrendingUp, Lightbulb, ChevronRight,
  AlertTriangle, X, ImageIcon, SplitSquareHorizontal
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Tiny utility components                                           */
/* ------------------------------------------------------------------ */

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
      className
    )}>
      {children}
    </span>
  );
}

function Pill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 whitespace-nowrap",
        active
          ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] border border-white/10"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] border border-transparent"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionLabel({ icon, children, color = "text-zinc-500" }: { icon?: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] mb-2", color)}>
      {icon}
      {children}
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



/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ExecutiveReport({ intel, steps = [] }: { intel: any, steps?: any[] }) {
  const [tab, setTab] = useState<"strategy" | "friction" | "patterns" | "glossary">("strategy");
  const [viewingScreens, setViewingScreens] = useState<number[] | null>(null);


  // Close overlay on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setViewingScreens(null); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  },[]);

  if (!intel) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600 text-sm italic">
        No session intelligence available.
      </div>
    );
  }

  const {
    executive_summary,
    competitive_profile,
    onboarding_strategy,
    friction_assessment,
    acquisition_monetization,
    pattern_library,
    dark_pattern_audit,
    glossary,
    friction_report,
  } = intel;

  const formatComponent = (key: string) => {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const fmt = (s: string) => s?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "";
  const primaryStrategy = onboarding_strategy?.strategy_type_primary || onboarding_strategy?.strategy_type || "Unknown";
  const secondaryStrategy = onboarding_strategy?.strategy_type_secondary;

  // Helper to parse strings like "1-4" or arrays like [2, 4] into a clean array of numbers
  const handleViewScreens = (input: string | number[]) => {
    if (Array.isArray(input)) {
      setViewingScreens(input.map(Number));
      return;
    }
    if (typeof input === 'string') {
      if (input.includes('-')) {
        const[start, end] = input.split('-').map(Number);
        setViewingScreens(Array.from({ length: end - start + 1 }, (_, i) => start + i));
      } else {
        setViewingScreens([Number(input)]);
      }
    }
  };

  // Descriptions for the friction mechanics grid
  const mechanicDescriptions: Record<string, string> = {
    identity_and_verification: "Account creation, passwords, and OTP codes.",
    form_fields: "Data entry, profiling, and required typing.",
    permissions: "System popups for location, camera, etc.",
    monetization_gates: "Paywalls and forced subscription trials.",
    interruptions: "Surveys, ratings, and loading screens.",
    flow_length: "Penalties for excessive screens before value.",
    flow_issues: "Errors or broken UI requiring recovery.",
  };

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="max-w-[1400px] mx-auto font-[system-ui] text-zinc-100 pb-12 relative">

      {/* ============================================================ */}
      {/*  GALLERY OVERLAY MODAL                                        */}
      {/* ============================================================ */}
      {viewingScreens && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setViewingScreens(null)} />
          <div className="relative z-10 bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-[90vw] h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
              <div>
                <h3 className="text-zinc-200 font-bold flex items-center gap-2 text-lg">
                  <ImageIcon className="w-5 h-5 text-blue-400" />
                  Referenced Screens Gallery
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-1">Viewing {viewingScreens.length} selected screen(s)</p>
              </div>
              <button onClick={() => setViewingScreens(null)} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Horizontal Scroll Area */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 md:p-8 flex gap-8 items-center justify-start hide-scrollbar">
              {viewingScreens.map(s => {
                // UI steps are 1-based, array is 0-based
                const stepData = steps[s - 1];
                if (!stepData) return null;

                return (
                  <div key={s} className="h-full shrink-0 flex flex-col items-center justify-between pb-1">
                    {/* Explicitly calculate height so aspect-ratio computes width perfectly (prevents flex overlap) */}
                    <div className="relative h-[calc(100%-3rem)] aspect-[9/19] rounded-xl overflow-hidden border border-zinc-800 bg-black shadow-2xl shrink-0">
                      <Image 
                        src={stepData.imagePath} 
                        alt={`Screen ${s}`} 
                        fill 
                        className="object-contain" 
                        unoptimized 
                      />
                    </div>
                    
                    {/* The Label */}
                    <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] px-4 py-1.5 rounded-full font-mono shadow-sm shrink-0">
                      SCREEN {s}
                    </div>
                  </div>
                );
              })}
              
              {/* Fallback if invalid step referenced */}
              {viewingScreens.every(s => !steps[s - 1]) && (
                <div className="w-full text-center text-zinc-500 italic">No matching screenshots found for this reference.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  EXECUTIVE SUMMARY — hero banner, always visible              */}
      {/* ============================================================ */}
      <section className="relative mb-8 rounded-2xl overflow-hidden bg-gradient-to-br from-[#0c1425] via-[#0f1a2e] to-[#111827] border border-white/[0.04] shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />
        <div className="relative px-8 py-7 flex items-start gap-5">
          <div className="shrink-0 mt-1 w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/70 mb-2">Executive Summary</h1>
            <p className="text-[17px] leading- text-blue-50/90 font-medium max-w-4xl">
              {executive_summary || "No summary generated."}
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  NAV PILLS                                                    */}
      {/* ============================================================ */}
      <nav className="flex gap-1 mb-6 overflow-x-auto pb-1">
        <Pill active={tab === "strategy"} onClick={() => setTab("strategy")} icon={<Target className="w-3.5 h-3.5 text-violet-400" />} label="Strategy & Funnel" />
        <Pill active={tab === "friction"} onClick={() => setTab("friction")} icon={<Activity className="w-3.5 h-3.5 text-amber-400" />} label="Friction Analysis" />
        <Pill active={tab === "patterns"} onClick={() => setTab("patterns")} icon={<Layers className="w-3.5 h-3.5 text-indigo-400" />} label="UX & Dark Patterns" />
        <Pill active={tab === "glossary"} onClick={() => setTab("glossary")} icon={<BookOpen className="w-3.5 h-3.5 text-emerald-400" />} label="Glossary" />
      </nav>

      {/* ============================================================ */}
      {/*  TAB: STRATEGY & FUNNEL                                       */}
      {/* ============================================================ */}
      {tab === "strategy" && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* Top row — 3-col: Architecture | Monetization | Data */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Architecture */}
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5 flex flex-col">
              <SectionLabel icon={<Target className="w-3 h-3 text-violet-400" />}>Architecture</SectionLabel>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30 text-[11px] py-0.5 px-2.5 capitalize">
                  {fmt(primaryStrategy)}
                </Badge>
                {secondaryStrategy && secondaryStrategy !== "none" && secondaryStrategy !== "null" && (
                  <Badge className="bg-zinc-800/60 text-zinc-400 border-zinc-700/50 capitalize">
                    + {fmt(secondaryStrategy)}
                  </Badge>
                )}
              </div>
              {onboarding_strategy?.strategy_confidence && (
                <div className="flex items-center gap-2 text-[11px] mb-4">
                  <span className="text-zinc-500 font-mono">Confidence</span>
                  <span className={cn(
                    "uppercase font-bold tracking-wider text-[10px]",
                    onboarding_strategy.strategy_confidence === "high" ? "text-emerald-400" :
                    onboarding_strategy.strategy_confidence === "medium" ? "text-amber-400" : "text-rose-400"
                  )}>
                    {onboarding_strategy.strategy_confidence}
                  </span>
                </div>
              )}
              <p className="text-[13px] text-zinc-400 leading-relaxed mb-4">
                {onboarding_strategy?.strategy_description || "No detailed description."}
              </p>
              <div className="mt-auto pt-3 border-t border-white/[0.04]">
                <SectionLabel icon={<Lightbulb className="w-3 h-3 text-amber-400" />} color="text-amber-500/70">Key Insight</SectionLabel>
                <p className="text-[13px] text-amber-200/80 leading-relaxed">
                  {onboarding_strategy?.key_strategic_insight}
                </p>
              </div>
            </div>

            {/* Monetization */}
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5 flex flex-col">
              <SectionLabel icon={<DollarSign className="w-3 h-3 text-emerald-400" />} color="text-emerald-500/70">Monetization</SectionLabel>
              <div className="space-y-3 text-[13px] mb-4">
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Model</span>
                  <span className="text-zinc-200 capitalize font-medium">{fmt(competitive_profile?.monetization_model || "")}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Aggressiveness</span>
                    <Badge className={cn(
                      "capitalize",
                      onboarding_strategy?.monetization_aggressiveness?.includes("aggressive")
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50"
                    )}>
                      {fmt(onboarding_strategy?.monetization_aggressiveness || "N/A")}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Price Transparency</span>
                    <span className="text-zinc-300 capitalize text-[13px]">{fmt(acquisition_monetization?.price_transparency || "N/A")}</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto pt-3 border-t border-white/[0.04]">
                <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Timing & Approach</span>
                <p className="text-[13px] text-zinc-400 leading-relaxed">{onboarding_strategy?.monetization_timing}</p>
              </div>
            </div>

            {/* Data Collection */}
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
              <SectionLabel icon={<Database className="w-3 h-3 text-sky-400" />} color="text-sky-500/70">Data Collection</SectionLabel>
              <div className="space-y-4">
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1.5">Pre-Auth</span>
                  <div className="flex flex-wrap gap-1">
                    {onboarding_strategy?.data_collected_pre_auth?.length > 0
                      ? onboarding_strategy.data_collected_pre_auth.map((d: string, i: number) => (
                        <Badge key={i} className="bg-zinc-800/50 text-zinc-300 border-zinc-700/40 capitalize text-[10px]">{d}</Badge>
                      ))
                      : <span className="text-[11px] text-zinc-600 italic">None requested</span>
                    }
                  </div>
                </div>
                <div className="pt-3 border-t border-white/[0.04]">
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1.5">Post-Auth</span>
                  <div className="flex flex-wrap gap-1">
                    {onboarding_strategy?.data_collected_post_auth?.length > 0
                      ? onboarding_strategy.data_collected_post_auth.map((d: string, i: number) => (
                        <Badge key={i} className="bg-zinc-800/50 text-zinc-300 border-zinc-700/40 capitalize text-[10px]">{d}</Badge>
                      ))
                      : <span className="text-[11px] text-zinc-600 italic">None requested</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Strategy Evolution */}
          <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
            <SectionLabel icon={<GitMerge className="w-3 h-3 text-indigo-400" />} color="text-indigo-400/70">Strategy Evolution</SectionLabel>
            {onboarding_strategy?.strategy_evolution?.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 mt-3 snap-x">
                {onboarding_strategy.strategy_evolution.map((phase: any, i: number) => (
                  <div key={i} className="flex items-stretch gap-2 snap-start">
                    <div className="min-w-[260px] max-w-[300px] rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4 flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-[10px] font-mono font-bold text-indigo-300">
                            {i + 1}
                          </span>
                          <span className="font-semibold text-indigo-300 text-[13px] capitalize">{fmt(phase.phase_strategy || "")}</span>
                        </div>
                        {/* INTERACTIVE BADGE */}
                        {phase.screens && (
                          <button 
                            onClick={() => handleViewScreens(phase.screens)}
                            className="inline-flex items-center rounded-md px-2 py-0.5 text-[9px] uppercase tracking-wider bg-zinc-950 text-zinc-400 border border-zinc-700 hover:text-white hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            Screens {phase.screens}
                          </button>
                        )}
                      </div>
                      <p className="text-[12px] text-zinc-400 leading-relaxed">{phase.rationale}</p>
                    </div>
                    {i < onboarding_strategy.strategy_evolution.length - 1 && (
                      <div className="flex items-center shrink-0">
                        <ChevronRight className="w-4 h-4 text-zinc-700" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-600 text-sm italic py-4">No phase evolution data available.</p>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  TAB: FRICTION ANALYSIS                                       */}
      {/* ============================================================ */}
      {tab === "friction" && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* Score header */}
          <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div className="flex items-end gap-3">
                <span className={cn(
                  "text-6xl font-black leading-none tracking-tighter",
                  friction_assessment?.friction_grade === "F" ? "text-rose-500" :
                  friction_assessment?.friction_grade === "A" ? "text-emerald-400" : "text-amber-400"
                )}>
                  {friction_assessment?.friction_grade || "?"}
                </span>
                <div className="mb-1">
                  <span className="text-zinc-500 text-[10px] uppercase font-bold block">Score</span>
                  <span className="text-zinc-300 text-xl font-mono font-bold">{friction_assessment?.total_friction_score}<span className="text-zinc-600">/100</span></span>
                </div>
              </div>

              <StatBlock 
                label="Time to Value" 
                value={friction_report?.screens_before_value ?? "?"} 
                sub="Screens to core product" 
                accent="text-emerald-400" 
              />
              <StatBlock 
                label="Account Wall" 
                value={friction_report?.screens_before_account_creation ?? "?"} 
                sub="Screens before signup" 
                accent="text-blue-400" 
              />
              <StatBlock 
                label="Friction Events" 
                value={friction_report?.total_events_detected || 0} 
                sub="Identified hurdles"
                accent="text-zinc-300" 
              />

              <div className="min-w-0 flex-1 basis-48">
                <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider block mb-0.5">Category Norm</span>
                <p className="text-[13px] text-zinc-300 leading-snug">
                  {friction_assessment?.category_benchmark || "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Deterministic Mechanics Breakdown (RESTORED) */}
          {friction_report?.component_breakdown && (
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
              <SectionLabel icon={<SplitSquareHorizontal className="w-3 h-3 text-orange-400" />} color="text-orange-400/70">
                Mechanics Breakdown
              </SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mt-3">
                {Object.entries(friction_report.component_breakdown)
                  .filter(([k]) => k !== "repetition_bonus")
                  .map(([key, val]: any) => (
                    <div key={key} className={cn(
                      "p-3.5 rounded-xl border flex flex-col justify-start",
                      val > 0 ? "bg-orange-500/[0.04] border-orange-500/15" : "bg-zinc-950/30 border-zinc-800/40"
                    )}>
                      <span className="text-zinc-400 text-[10px] uppercase font-bold block mb-1 truncate" title={formatComponent(key)}>
                        {formatComponent(key)}
                      </span>
                      <span className={cn("text-2xl font-bold font-mono mb-2", val > 0 ? "text-orange-400" : "text-zinc-700")}>
                        {val > 0 ? `+${val}` : "0"}
                      </span>
                      <span className="text-[10px] text-zinc-500 leading-tight">
                        {mechanicDescriptions[key] || "Friction points."}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Unnecessary */}
            <div className="rounded-2xl bg-rose-500/[0.02] border border-rose-500/10 p-5">
              <SectionLabel icon={<XCircle className="w-3 h-3 text-rose-400" />} color="text-rose-400/70">Unnecessary Friction</SectionLabel>
              <div className="space-y-3 mt-3">
                {friction_assessment?.unnecessary_friction?.length > 0
                  ? friction_assessment.unnecessary_friction.map((point: any, i: number) => (
                    <div key={i} className="rounded-xl bg-zinc-950/40 border border-rose-500/10 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-rose-200 font-semibold text-[13px] capitalize">{fmt(point.factor || "")}</h4>
                      </div>
                      <p className="text-zinc-400 text-[12px] leading-relaxed mb-3">{point.description}</p>
                      
                      {/* INTERACTIVE BADGE */}
                      {point.screens && point.screens.length > 0 && (
                        <div className="pt-3 border-t border-rose-900/30 flex items-center justify-between">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Observed Locations:</span>
                          <button 
                            onClick={() => handleViewScreens(point.screens)}
                            className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white hover:border-blue-500 hover:bg-zinc-800 transition-all cursor-pointer font-mono shadow-sm"
                          >
                            <ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" />
                            View Screens ({point.screens.join(", ")})
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                  : <p className="text-zinc-600 italic text-sm">None identified.</p>
                }
              </div>
            </div>

            {/* Intentional */}
            <div className="rounded-2xl bg-emerald-500/[0.02] border border-emerald-500/10 p-5">
              <SectionLabel icon={<CheckCircle2 className="w-3 h-3 text-emerald-400" />} color="text-emerald-400/70">Intentional Friction</SectionLabel>
              <div className="space-y-3 mt-3">
                {friction_assessment?.intentional_friction?.length > 0
                  ? friction_assessment.intentional_friction.map((point: any, i: number) => (
                    <div key={i} className="rounded-xl bg-zinc-950/40 border border-emerald-500/10 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-emerald-200 font-semibold text-[13px] capitalize">{fmt(point.factor || "")}</h4>
                      </div>
                      <p className="text-zinc-400 text-[12px] leading-relaxed mb-3">{point.description}</p>
                      
                      {/* INTERACTIVE BADGE */}
                      {point.screens && point.screens.length > 0 && (
                        <div className="pt-3 border-t border-emerald-900/30 flex items-center justify-between">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Observed Locations:</span>
                          <button 
                            onClick={() => handleViewScreens(point.screens)}
                            className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white hover:border-blue-500 hover:bg-zinc-800 transition-all cursor-pointer font-mono shadow-sm"
                          >
                            <ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" />
                            View Screens ({point.screens.join(", ")})
                          </button>
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

      {/* ============================================================ */}
      {/*  TAB: UX & DARK PATTERNS                                      */}
      {/* ============================================================ */}
      {tab === "patterns" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in duration-300">

          {/* UX Patterns */}
          <div className="space-y-3">
            <SectionLabel icon={<Layers className="w-3 h-3 text-indigo-400" />} color="text-indigo-400/70">Notable UX Patterns</SectionLabel>
            {pattern_library?.length > 0 ? pattern_library.map((pattern: any, i: number) => (
              <div key={i} className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-indigo-300 font-semibold text-[13px]">{pattern.pattern_name}</span>
                  
                  {/* INTERACTIVE BADGE */}
                  {pattern.screen_indices && pattern.screen_indices.length > 0 && (
                    <button 
                      onClick={() => handleViewScreens(pattern.screen_indices)}
                      className="inline-flex items-center rounded-md px-2.5 py-1 text-[9px] bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white hover:border-blue-500 hover:bg-zinc-800 transition-all cursor-pointer font-mono shrink-0 shadow-sm"
                    >
                      <ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" />
                      Screens {pattern.screen_indices.join(", ")}
                    </button>
                  )}
                </div>
                <p className="text-zinc-400 text-[12px] mb-4 leading-relaxed">{pattern.description}</p>
                <div className="bg-indigo-500/[0.04] border border-indigo-500/10 rounded-lg p-3">
                  <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-indigo-400/60 flex items-center gap-1 mb-1.5">
                    <TrendingUp className="w-2.5 h-2.5" /> Competitor Insight
                  </span>
                  <p className="text-[12px] text-indigo-200/80 leading-relaxed">{pattern.competitive_insight || pattern.recommendation}</p>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-8 text-center text-zinc-600 text-sm italic">
                No notable UX patterns extracted.
              </div>
            )}
          </div>

          {/* Dark Patterns */}
          <div className="space-y-3">
            <SectionLabel icon={<ShieldAlert className="w-3 h-3 text-rose-400" />} color="text-rose-400/70">Dark Patterns Detected</SectionLabel>
            {dark_pattern_audit?.patterns_found?.length > 0 ? (
              dark_pattern_audit.patterns_found.map((pattern: any, i: number) => {
                const isString = typeof pattern === "string";
                const type = isString ? pattern : pattern.pattern_type;
                const desc = isString ? null : pattern.description;
                const severity = isString ? null : pattern.severity;
                const screens = isString ? null : pattern.screens;

                return (
                  <div key={i} className="rounded-2xl bg-rose-500/[0.03] border border-rose-500/15 p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h4 className="text-rose-200 font-semibold text-[13px] capitalize">{fmt(type || "")}</h4>
                      {severity && (
                        <Badge className={cn(
                          "text-[9px] shrink-0",
                          severity === "aggressive"
                            ? "bg-rose-500/15 text-rose-300 border-rose-500/25"
                            : "bg-rose-500/5 text-rose-400 border-rose-500/15"
                        )}>
                          {severity}
                        </Badge>
                      )}
                    </div>
                    {desc && <p className="text-zinc-400 text-[12px] mb-4 leading-relaxed">{desc}</p>}
                    
                    {/* INTERACTIVE BADGE */}
                    {screens && screens.length > 0 && (
                      <div className="flex items-center justify-between text-[10px] text-zinc-600 font-mono pt-3 border-t border-rose-500/10">
                        <span className="uppercase tracking-wider font-bold">Observed Evidence</span>
                        <button 
                          onClick={() => handleViewScreens(screens)}
                          className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-zinc-950 border border-rose-900/50 text-zinc-300 hover:text-white hover:border-blue-500 hover:bg-zinc-800 transition-all cursor-pointer font-mono shadow-sm"
                        >
                          <ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" />
                          View Screens ({screens.join(", ")})
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-8 text-center">
                <ShieldAlert className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">No dark patterns detected.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  TAB: GLOSSARY                                                */}
      {/* ============================================================ */}
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
                      <div className="mb-3">
                        <span className="text-emerald-400 font-mono text-[12px] font-bold bg-emerald-500/8 px-2 py-0.5 rounded border border-emerald-500/15">
                          {term}
                        </span>
                      </div>
                      <p className="text-[12px] text-zinc-400 leading-relaxed mb-4">{definition}</p>
                    </div>
                    
                    {/* INTERACTIVE BADGE */}
                    {step && (
                      <div className="mt-auto border-t border-white/[0.04] pt-3 flex justify-end">
                        <button 
                          onClick={() => handleViewScreens([step])}
                          className="inline-flex items-center rounded-md px-2 py-1 text-[9px] bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-white hover:border-blue-500 hover:bg-zinc-800 transition-all cursor-pointer font-mono uppercase tracking-widest shadow-sm"
                        >
                          <ImageIcon className="w-3 h-3 mr-1.5 text-blue-400" />
                          View Screen {step}
                        </button>
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
              <p className="text-zinc-600 text-sm">No app-specific terminology was identified in this flow.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}