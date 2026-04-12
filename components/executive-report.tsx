// components/executive-report.tsx

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Activity, Target, ShieldAlert, FileText,
  DollarSign, Layers, CheckCircle2, XCircle, BookOpen,
  GitMerge, Database, Lightbulb, ChevronRight,
  ImageIcon, SplitSquareHorizontal, Unlock, Lock, ChevronDown, ChevronUp, LayoutTemplate
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
    <button onClick={onClick} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 whitespace-nowrap", active ? "bg-white shadow-sm text-zinc-900 border-zinc-200 dark:bg-white/[0.07] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:border-white/10" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 dark:hover:text-zinc-300 dark:hover:bg-white/[0.03] border border-transparent")}>
      {icon} {label}
    </button>
  );
}

function SectionLabel({ icon, children, color = "text-zinc-500 dark:text-zinc-400" }: { icon?: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] mb-2", color)}>
      {icon} {children}
    </div>
  );
}

function StatBlock({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider block mb-0.5 truncate">{label}</span>
      <span className={cn("text-lg font-mono font-bold leading-tight", accent || "text-zinc-900 dark:text-zinc-200")}>{value}</span>
      {sub && <span className="text-[10px] text-zinc-500 dark:text-zinc-600 block">{sub}</span>}
    </div>
  );
}

export function ExecutiveReport({ intel, steps = [], mode }: { intel: any, steps?: any[], mode: "onboarding" | "browsing" }) {
  const [tab, setTab] = useState<"strategy" | "friction" | "patterns" | "glossary">("strategy");
  const [viewingScreens, setViewingScreens] = useState<number[] | null>(null);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setViewingScreens(null); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  if (!intel) return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm italic">No intelligence available for this mode.</div>;

  const isTeardown = mode === "browsing";

  // ============================================================================
  // UNIVERSAL DATA NORMALIZATION LAYER
  // ============================================================================

  const strategyObj = intel.onboarding_strategy || intel.teardown_strategy || intel.app_architecture || intel.strategy_and_architecture || {};
  const frictionObj = intel.friction_assessment || intel.ux_assessment || intel.ux_quality_assessment || {};
  const reportObj = intel.friction_report || intel.ux_report || intel.ux_quality_report || {};
  const funnelSum = intel.funnel_summary || intel.exploration_summary || {};
  const compProfile = intel.competitive_profile || {};
  const monetObj = intel.acquisition_monetization || intel.monetization_intelligence || {};

  const executive_summary = intel.executive_summary || "Summarizing app intelligence...";
  const primaryStrategy = strategyObj.strategy_type_primary || strategyObj.strategy_type || strategyObj.navigation_model || strategyObj.archetype || "Standard UI";
  const secondaryStrategy = strategyObj.strategy_type_secondary || strategyObj.depth_assessment || null;
  const strategyDesc = strategyObj.strategy_description || strategyObj.description || strategyObj.navigation_description || "General application layout and content discovery experience.";
  const keyInsight = strategyObj.key_strategic_insight || strategyObj.key_architectural_insight || null;

  const revenueModel = monetObj.revenue_model || compProfile.monetization_model || "Freemium";
  const aggressiveness = strategyObj.monetization_aggressiveness || monetObj.monetization_aggressiveness || "N/A";
  const priceTransp = monetObj.price_transparency || monetObj.pricing_transparency || "N/A";

  const preAuthData = strategyObj.data_collected_pre_auth || intel.feature_gating_map?.free_features || [];
  const postAuthData = strategyObj.data_collected_post_auth || intel.feature_gating_map?.gated_features || [];
  const preLabel = mode === "onboarding" ? "Pre-Auth / Core" : "Free Features";
  const postLabel = mode === "onboarding" ? "Post-Auth / Optional" : "Gated Features";

  const MAX_VISIBLE_BADGES = 6;
  const hasHiddenFeatures = preAuthData.length > MAX_VISIBLE_BADGES || postAuthData.length > MAX_VISIBLE_BADGES;

  let timelineItems = strategyObj.strategy_evolution || [];
  if (timelineItems.length === 0 && intel.feature_inventory?.core_features) {
    timelineItems = intel.feature_inventory.core_features.map((f: any) => ({
      phase_strategy: f.feature_name,
      rationale: f.description,
      screens: f.screens_observed || f.screens || []
    }));
  }

  const totalScore = frictionObj.total_friction_score || frictionObj.ux_score || frictionObj.total_ux_score || funnelSum.score || 0;
  const grade = frictionObj.friction_grade || frictionObj.ux_grade || "N/A";
  const screensAnalyzed = reportObj.actual_total_screens || funnelSum.total_screens || funnelSum.total_screenshots || steps.length || 0;
  const totalEvents = reportObj.total_events_detected || reportObj.total_issues_found || 0;

  const mechanicsBreakdown = reportObj.component_breakdown || frictionObj.pillar_scores || reportObj.pillar_scores || null;
  const mechanicDescriptions: Record<string, string> = {
    identity_and_verification: "Account creation, passwords, OTPs.",
    form_fields: "Data entry and required typing.",
    permissions: "System popups for location, camera, etc.",
    monetization_gates: "Paywalls and forced subscriptions.",
    interruptions: "Surveys, ratings, loading screens.",
    navigation: "Information architecture and routing.",
    monetization: "Pressure from paywalls and ads.",
    accessibility: "Content discoverability and empty states.",
    engagement: "Gamification, notifications, retention loops."
  };

  const extractScreens = (p: any) => {
    if (!p) return [];
    if (Array.isArray(p.screens) && p.screens.length > 0) return p.screens;
    if (Array.isArray(p.screen_indices) && p.screen_indices.length > 0) return p.screen_indices;
    if (Array.isArray(p.evidence) && p.evidence.length > 0) return p.evidence; 
    if (typeof p.screen_index === 'number') return [p.screen_index];
    if (typeof p.screen === 'number') return [p.screen];

    const textToSearch = [
      typeof p === 'string' ? p : "", p.description || "", p.detail || "",
      p.evidence || "", p.factor || "", p.label || ""
    ].join(" ");

    const match = textToSearch.match(/screen[s]?\s*[:(]?\s*([0-9,\s&and]+)[)]?/i);
    if (match) {
      const nums = match[1].match(/\d+/g);
      if (nums) return nums.map((n: string) => parseInt(n, 10));
    }
    return [];
  };

  const formatComponent = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  
  const parseUXList = (rawData: any, defaultFactor: string) => {
    if (!rawData) return [];
    if (Array.isArray(rawData)) {
      return rawData.map((p: any) => {
        if (typeof p === "string") return { factor: defaultFactor, description: p, screens: extractScreens(p) };
        return { 
          factor: p.factor || p.issue || p.label || p.name || defaultFactor, 
          description: p.description || p.detail || p.summary || "Observed in flow.", 
          screens: extractScreens(p) 
        };
      });
    }
    if (typeof rawData === "object" && rawData !== null) {
      return Object.entries(rawData).map(([k, v]: any) => ({
        factor: formatComponent(k),
        description: typeof v === "string" ? v : (v.description || v.detail || "Observed in flow."),
        screens: typeof v === "object" ? extractScreens(v) : extractScreens(k + " " + v)
      }));
    }
    return [];
  };

  const badFrictionRaw = frictionObj.unnecessary_friction || frictionObj.biggest_friction_points || frictionObj.biggest_ux_issues || reportObj.friction_events || [];
  const badFriction = parseUXList(badFrictionRaw, "UX Issue");

  const goodFrictionRaw = frictionObj.intentional_friction || frictionObj.seamless_moments || frictionObj.ux_strengths || reportObj.friction_breakdown_rich || [];
  const goodFriction = parseUXList(goodFrictionRaw, "Positive UX");

  const rawDarkPatternsDetailed = funnelSum.dark_patterns_detailed || intel.dark_pattern_audit?.patterns_found || intel.dark_pattern_audit?.findings || [];
  let darkPatternsArray: any[] = [];
  if (Array.isArray(rawDarkPatternsDetailed)) {
    darkPatternsArray = rawDarkPatternsDetailed.map(p => typeof p === "string" ? { pattern_type: p, description: "Observed.", severity: "medium", screens: extractScreens(p) } 
    : { 
        pattern_type: p.pattern_type || p.type || "Pattern", 
        description: p.description, 
        impact: p.user_impact,
        severity: p.severity || "medium", 
        screens: extractScreens(p) 
      });
  } else {
    darkPatternsArray = Object.entries(rawDarkPatternsDetailed).map(([k, v]: any) => ({ 
        pattern_type: formatComponent(k), 
        description: v.description, 
        impact: v.user_impact,
        severity: v.severity || "medium", 
        screens: extractScreens(v) 
    }));
  }

  const uxPatternsArray = (intel.pattern_library || []).map((p: any) => 
    typeof p === "string" ? { pattern_name: p, description: "Observed UX pattern.", screen_indices: extractScreens(p) } : { pattern_name: p.pattern_name || p.name || "Pattern", description: p.description || p.competitive_insight || "Observed.", insight: p.competitive_insight, screen_indices: extractScreens(p) }
  );

  const glossary = intel.glossary || {};
  const fmt = (s: string) => s?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "";

  const handleViewScreens = (input: any) => {
    if (!input) return;
    if (Array.isArray(input)) { setViewingScreens(input.map(Number)); return; }
    if (typeof input === 'string') {
      if (input.includes('-')) {
        const [start, end] = input.split('-').map(Number);
        setViewingScreens(Array.from({ length: end - start + 1 }, (_, i) => start + i));
      } else setViewingScreens([Number(input)]);
    }
    if (typeof input === 'number') setViewingScreens([input]);
  };

  return (
    <div className="max-w-[1400px] mx-auto font-[system-ui] text-zinc-900 dark:text-zinc-100 pb-12 relative flex flex-col gap-6 transition-colors duration-300">
      
      {/* DEVICE MOCKUP SCREEN MODAL */}
      {viewingScreens && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-white/80 dark:bg-black/90 backdrop-blur-md" onClick={() => setViewingScreens(null)} />
          <div className="relative z-10 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-[90vw] h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <h3 className="text-zinc-900 dark:text-zinc-200 font-bold flex items-center gap-2 text-lg"><ImageIcon className="w-5 h-5 text-blue-500 dark:text-blue-400" /> Referenced Screens</h3>
              <button onClick={() => setViewingScreens(null)} className="p-2.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-x-auto p-6 md:p-8 flex gap-12 items-center justify-start [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-zinc-50/50 dark:bg-transparent">
              {viewingScreens.map(s => {
                const stepData = steps.find(step => (step.step === s || step.enrichedData?.extraction_meta?.timeline_step === s));
                if (!stepData) return null;
                return (
                  <div key={s} className="h-full shrink-0 flex flex-col items-center justify-between pb-1">
                    <div 
                      className="relative h-[calc(100%-3rem)] aspect-[9/19.5] overflow-hidden bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.7)] shrink-0"
                      style={{ borderWidth: '0.3px', borderColor: '#818A98', borderStyle: 'solid', borderRadius: '1.8rem' }}
                    >
                      <Image src={stepData.imagePath} alt={`S ${s}`} fill className="object-cover" unoptimized />
                    </div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] px-4 py-1.5 rounded-full font-mono mt-4 shadow-sm shrink-0">SCREEN {s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <nav className="flex gap-1 overflow-x-auto pb-1 shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <Pill active={tab === "strategy"} onClick={() => setTab("strategy")} icon={<Target className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />} label="Strategy & Architecture" />
        <Pill active={tab === "friction"} onClick={() => setTab("friction")} icon={<Activity className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />} label={isTeardown ? "UX Quality Score" : "UX & Grade"} />
        <Pill active={tab === "patterns"} onClick={() => setTab("patterns")} icon={<Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />} label="UX & Dark Patterns" />
        <Pill active={tab === "glossary"} onClick={() => setTab("glossary")} icon={<BookOpen className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />} label="Glossary" />
      </nav>

      {/* EXECUTIVE SUMMARY */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-[#0c1425] dark:via-[#0f1a2e] dark:to-[#111827] border border-black/[0.06] dark:border-white/[0.04] shadow-lg dark:shadow-xl shrink-0 p-6 transition-colors duration-300">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />
          <div className="flex items-start gap-4 relative">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" /></div>
            <div className="min-w-0">
                <h1 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600/80 dark:text-blue-400/70 mb-1.5">Executive Summary</h1>
                <p className="text-[14px] leading-relaxed text-zinc-800 dark:text-blue-50/90 font-medium max-w-5xl">{executive_summary}</p>
            </div>
          </div>
      </section>

      {/* ============================================================== */}
      {/* 1. STRATEGY & ARCHITECTURE TAB                                 */}
      {/* ============================================================== */}
      {tab === "strategy" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            
            {/* Architecture Box */}
            <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-5 flex flex-col transition-colors duration-300">
              <SectionLabel icon={<Target className="w-3 h-3 text-violet-500 dark:text-violet-400" />}>Architecture</SectionLabel>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 text-[11px] py-0.5 px-2.5 capitalize">{fmt(primaryStrategy)}</Badge>
                {secondaryStrategy && secondaryStrategy !== "none" && secondaryStrategy !== "null" && (
                  <Badge className="bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700/50 capitalize">+ {fmt(secondaryStrategy)}</Badge>
                )}
              </div>
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{strategyDesc}</p>
              {keyInsight && (
                <div className="mt-auto pt-3 border-t border-black/[0.05] dark:border-white/[0.04]">
                  <SectionLabel icon={<Lightbulb className="w-3 h-3 text-amber-500 dark:text-amber-400" />} color="text-amber-600 dark:text-amber-500/70">Key Insight</SectionLabel>
                  <p className="text-[13px] text-amber-800 dark:text-amber-200/80 leading-relaxed">{keyInsight}</p>
                </div>
              )}
            </div>

            {/* Monetization Box */}
            <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-5 flex flex-col transition-colors duration-300">
              <SectionLabel icon={<DollarSign className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />} color="text-emerald-600 dark:text-emerald-500/70">Monetization</SectionLabel>
              <div className="space-y-3 text-[13px] mb-4">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Model</span>
                  <span className="text-zinc-900 dark:text-zinc-200 capitalize font-medium">{fmt(revenueModel)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Aggressiveness</span>
                    <Badge className={cn("capitalize", aggressiveness.includes("aggressive") ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25" : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700/50")}>
                      {fmt(aggressiveness)}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-500 text-[10px] uppercase font-bold block mb-0.5">Price Transparency</span>
                    <span className="text-zinc-700 dark:text-zinc-300 capitalize text-[13px]">{fmt(priceTransp)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Data / Features Box with Show More Toggle */}
            <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-5 flex flex-col transition-colors duration-300">
              <SectionLabel icon={<Database className="w-3 h-3 text-sky-500 dark:text-sky-400" />} color="text-sky-600 dark:text-sky-500/70">
                {isTeardown ? "Feature Access" : "Data Attributes"}
              </SectionLabel>
              
              {isTeardown ? (
                <div className="space-y-4 mt-2">
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1.5"><Lock className="w-3 h-3 text-rose-500 dark:text-rose-400"/> Gated Features</span>
                    <div className="flex flex-wrap gap-1.5">
                      {postAuthData.length > 0 ? (showAllFeatures ? postAuthData : postAuthData.slice(0, MAX_VISIBLE_BADGES)).map((f: string, i: number) => (
                        <Badge key={`g-${i}`} className="bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300 font-mono text-[10px]">{f}</Badge>
                      )) : <span className="text-zinc-500 dark:text-zinc-600 text-xs italic">None identified</span>}
                      {!showAllFeatures && postAuthData.length > MAX_VISIBLE_BADGES && (
                        <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 flex items-center px-1">+{postAuthData.length - MAX_VISIBLE_BADGES} more</span>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.04]">
                    <span className="text-zinc-500 dark:text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1.5"><Unlock className="w-3 h-3 text-emerald-500 dark:text-emerald-400"/> Free Features</span>
                    <div className="flex flex-wrap gap-1.5">
                      {preAuthData.length > 0 ? (showAllFeatures ? preAuthData : preAuthData.slice(0, MAX_VISIBLE_BADGES)).map((f: string, i: number) => (
                        <Badge key={`f-${i}`} className="bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 font-mono text-[10px]">{f}</Badge>
                      )) : <span className="text-zinc-500 dark:text-zinc-600 text-xs italic">None identified</span>}
                      {!showAllFeatures && preAuthData.length > MAX_VISIBLE_BADGES && (
                        <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 flex items-center px-1">+{preAuthData.length - MAX_VISIBLE_BADGES} more</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {preAuthData.length > 0 ? (showAllFeatures ? preAuthData : preAuthData.slice(0, MAX_VISIBLE_BADGES)).map((d: any, i: number) => (
                    <Badge key={i} className="bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 font-mono text-[10px]">{d}</Badge>
                  )) : <span className="text-zinc-500 dark:text-zinc-600 text-xs italic">No data attributes logged.</span>}
                  {!showAllFeatures && preAuthData.length > MAX_VISIBLE_BADGES && (
                    <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 flex items-center px-1">+{preAuthData.length - MAX_VISIBLE_BADGES} more</span>
                  )}
                </div>
              )}

              {hasHiddenFeatures && (
                <button 
                  onClick={() => setShowAllFeatures(!showAllFeatures)}
                  className="mt-4 pt-3 border-t border-black/[0.05] dark:border-white/[0.04] text-[11px] font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white uppercase tracking-wider flex items-center justify-center gap-1 transition-colors w-full"
                >
                  {showAllFeatures ? <><ChevronUp className="w-3.5 h-3.5" /> Show Less</> : <><ChevronDown className="w-3.5 h-3.5" /> Show All Features</>}
                </button>
              )}
            </div>
          </div>

          {/* Timeline / Core Features Scroller */}
          {timelineItems.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-5 transition-colors duration-300">
              <SectionLabel icon={<LayoutTemplate className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />} color="text-indigo-600 dark:text-indigo-400/70">{mode === "onboarding" ? "Strategy Evolution" : "Core Feature Inventory"}</SectionLabel>
              <div className="flex gap-3 overflow-x-auto pb-2 mt-3 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {timelineItems.map((phase: any, i: number) => (
                  <div key={i} className="flex items-stretch gap-2 snap-start">
                    <div className="min-w-[260px] max-w-[300px] rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-800/60 p-4 flex flex-col justify-between transition-colors duration-300">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 dark:bg-indigo-500/15 dark:border-indigo-500/30 dark:text-indigo-300 flex items-center justify-center text-[10px] font-mono font-bold">{i + 1}</span>
                          <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-[13px] capitalize">{fmt(phase.phase_strategy || "")}</span>
                        </div>
                        <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{phase.rationale}</p>
                      </div>
                      {phase.screens && phase.screens.length > 0 && (
                        <div className="pt-3 border-t border-black/[0.05] dark:border-white/[0.04]">
                          <button onClick={() => handleViewScreens(phase.screens)} className="inline-flex items-center rounded-md px-2 py-0.5 text-[9px] uppercase tracking-wider bg-white text-zinc-600 border border-zinc-200 hover:text-zinc-900 dark:bg-zinc-950 dark:text-zinc-400 dark:border-zinc-700 dark:hover:text-white dark:hover:border-blue-500 transition-colors cursor-pointer w-full justify-center shadow-sm dark:shadow-none">
                            <ImageIcon className="w-3 h-3 mr-1.5 text-blue-500 dark:text-blue-400" /> View Screens ({Array.isArray(phase.screens) ? phase.screens.join(", ") : phase.screens})
                          </button>
                        </div>
                      )}
                    </div>
                    {i < timelineItems.length - 1 && <div className="flex items-center shrink-0"><ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" /></div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. UX & FRICTION SCORE TAB                                     */}
      {/* ============================================================== */}
      {tab === "friction" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Top Metric Header */}
          <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-5 transition-colors duration-300">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div className="flex items-end gap-3">
                <span className={cn("text-6xl font-black leading-none tracking-tighter", grade === "F" || grade === "D/F" ? "text-rose-600 dark:text-rose-500" : grade === "A" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                  {grade}
                </span>
                <div className="mb-1">
                  <span className="text-zinc-500 dark:text-zinc-500 text-[10px] uppercase font-bold block">{isTeardown ? "UX Quality" : "UX Score"}</span>
                  <span className="text-zinc-900 dark:text-zinc-300 text-xl font-mono font-bold">{totalScore}<span className="text-zinc-400 dark:text-zinc-600">/100</span></span>
                </div>
              </div>
              <StatBlock label="Screens Analysed" value={screensAnalyzed} accent="text-blue-600 dark:text-blue-400" />
              <StatBlock label={isTeardown ? "UX Events Logged" : "Hurdles Found"} value={totalEvents} accent="text-zinc-700 dark:text-zinc-300" />
            </div>
          </div>

          {/* Mechanics Breakdown Grid */}
          {mechanicsBreakdown && Object.keys(mechanicsBreakdown).length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-5 transition-colors duration-300">
              <SectionLabel icon={<SplitSquareHorizontal className="w-3 h-3 text-orange-500 dark:text-orange-400" />} color="text-orange-600 dark:text-orange-400/70">Mechanics Breakdown</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
                {Object.entries(mechanicsBreakdown).filter(([k]) => k !== "repetition_bonus").map(([key, val]: any) => (
                  <div key={key} className={cn("p-3.5 rounded-xl border flex flex-col justify-start transition-colors duration-300", val > 0 ? "bg-orange-50 border-orange-200 dark:bg-orange-500/[0.04] dark:border-orange-500/15" : "bg-zinc-50 border-zinc-200 dark:bg-zinc-950/30 dark:border-zinc-800/40")}>
                    <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1 truncate" title={formatComponent(key)}>{formatComponent(key)}</span>
                    <span className={cn("text-2xl font-bold font-mono mb-2", val > 0 ? "text-orange-600 dark:text-orange-400" : "text-zinc-400 dark:text-zinc-700")}>{val > 0 ? `+${val}` : "0"}</span>
                    <span className="text-[10px] text-zinc-600 dark:text-zinc-500 leading-tight">{mechanicDescriptions[key] || "Friction points."}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Red/Green Issue Boxes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white dark:bg-rose-500/[0.02] border border-black/[0.05] dark:border-rose-500/10 shadow-sm dark:shadow-none p-5 transition-colors duration-300">
              <SectionLabel icon={<XCircle className="w-3 h-3 text-rose-500 dark:text-rose-400" />} color="text-rose-600 dark:text-rose-400/70">{mode === "onboarding" ? "Unnecessary Friction" : "Critical UX Blockers"}</SectionLabel>
              <div className="space-y-3 mt-3">
                {badFriction.length > 0
                  ? badFriction.map((point: any, i: number) => (
                    <div key={i} className="rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-950/40 dark:border-rose-500/10 p-4 flex flex-col justify-between transition-colors duration-300">
                      <div>
                        <h4 className="text-rose-700 dark:text-rose-200 font-semibold text-[13px] capitalize mb-2">{fmt(point.factor || "")}</h4>
                        <p className="text-zinc-600 dark:text-zinc-400 text-[12px] leading-relaxed mb-3">{point.description}</p>
                      </div>
                      {point.screens && point.screens.length > 0 && (
                        <div className="pt-3 border-t border-black/[0.05] dark:border-rose-900/30 flex justify-end">
                          <button onClick={() => handleViewScreens(point.screens)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white transition-all cursor-pointer font-mono shadow-sm dark:shadow-none"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-500 dark:text-blue-400" /> View Screens ({point.screens.join(", ")})</button>
                        </div>
                      )}
                    </div>
                  ))
                  : <p className="text-zinc-500 dark:text-zinc-600 italic text-sm">None identified.</p>
                }
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-emerald-500/[0.02] border border-black/[0.05] dark:border-emerald-500/10 shadow-sm dark:shadow-none p-5 transition-colors duration-300">
              <SectionLabel icon={<CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />} color="text-emerald-600 dark:text-emerald-400/70">{mode === "onboarding" ? "Intentional Friction" : "Seamless UX Moments"}</SectionLabel>
              <div className="space-y-3 mt-3">
                {goodFriction.length > 0
                  ? goodFriction.map((point: any, i: number) => (
                    <div key={i} className="rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-950/40 dark:border-emerald-500/10 p-4 flex flex-col justify-between transition-colors duration-300">
                      <div>
                        <h4 className="text-emerald-700 dark:text-emerald-200 font-semibold text-[13px] capitalize mb-2">{fmt(point.factor || "")}</h4>
                        <p className="text-zinc-600 dark:text-zinc-400 text-[12px] leading-relaxed mb-3">{point.description}</p>
                      </div>
                      {point.screens && point.screens.length > 0 && (
                        <div className="pt-3 border-t border-black/[0.05] dark:border-emerald-900/30 flex justify-end">
                          <button onClick={() => handleViewScreens(point.screens)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white transition-all cursor-pointer font-mono shadow-sm dark:shadow-none"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-500 dark:text-blue-400" /> View Screens ({point.screens.join(", ")})</button>
                        </div>
                      )}
                    </div>
                  ))
                  : <p className="text-zinc-500 dark:text-zinc-600 italic text-sm">None identified.</p>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. PATTERNS TAB                                                */}
      {/* ============================================================== */}
      {tab === "patterns" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
          
          <div className="space-y-4">
            <SectionLabel icon={<Layers className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />} color="text-indigo-600 dark:text-indigo-400/70">Notable UX Patterns</SectionLabel>
            {uxPatternsArray.length > 0 ? uxPatternsArray.map((pattern: any, i: number) => (
              <div key={i} className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-5 flex flex-col transition-colors duration-300">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-indigo-700 dark:text-indigo-300 font-semibold text-[13px] capitalize">{fmt(pattern.pattern_name)}</span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[12px] mb-4 leading-relaxed">{pattern.description}</p>
                  {pattern.insight && (
                    <div className="mb-4 bg-indigo-50/50 dark:bg-indigo-500/10 border-l-2 border-indigo-400 p-2.5 rounded-r-md">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-1">Strategic Insight</span>
                        <span className="text-[11.5px] text-indigo-900/80 dark:text-indigo-200/90 leading-snug block">{pattern.insight}</span>
                    </div>
                  )}
                </div>
                {pattern.screen_indices && pattern.screen_indices.length > 0 && (
                    <div className="pt-3 border-t border-black/[0.05] dark:border-indigo-500/10 flex justify-end">
                        <button onClick={() => handleViewScreens(pattern.screen_indices)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[9px] bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white transition-all cursor-pointer font-mono shadow-sm dark:shadow-none"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-500 dark:text-blue-400" /> Screens {pattern.screen_indices.join(", ")}</button>
                    </div>
                )}
              </div>
            )) : <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-8 text-center text-zinc-500 dark:text-zinc-600 text-sm italic transition-colors duration-300">No notable UX patterns extracted.</div>}
          </div>

          <div className="space-y-4">
            <SectionLabel icon={<ShieldAlert className="w-3 h-3 text-rose-500 dark:text-rose-400" />} color="text-rose-600 dark:text-rose-400/70">Dark Pattern Audit</SectionLabel>
            {darkPatternsArray.length > 0 ? darkPatternsArray.map((pattern: any, i: number) => (
                <div key={i} className="rounded-2xl bg-rose-50 dark:bg-rose-500/[0.03] border border-rose-100 dark:border-rose-500/15 p-5 flex flex-col transition-colors duration-300">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h4 className="text-rose-700 dark:text-rose-200 font-semibold text-[13px] capitalize">{fmt(pattern.pattern_type || "")}</h4>
                      {pattern.severity && (
                        <Badge className={cn("text-[9px] shrink-0 font-mono", pattern.severity === "aggressive" || pattern.severity === "high" ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/25" : "bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/5 dark:text-rose-400 dark:border-rose-500/15")}>
                          {pattern.severity}
                        </Badge>
                      )}
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-400 text-[12px] mb-4 leading-relaxed">{pattern.description}</p>
                    {pattern.impact && (
                      <div className="mb-4 bg-rose-50/50 dark:bg-rose-500/10 border-l-2 border-rose-400 p-2.5 rounded-r-md">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block mb-1">User Friction & Risk</span>
                          <span className="text-[11.5px] text-rose-900/80 dark:text-rose-200/90 leading-snug block">{pattern.impact}</span>
                      </div>
                    )}
                  </div>
                  {pattern.screens && pattern.screens.length > 0 && (
                    <div className="flex justify-end pt-3 border-t border-rose-200 dark:border-rose-500/10">
                      <button onClick={() => handleViewScreens(pattern.screens)} className="inline-flex items-center rounded-md px-2.5 py-1 text-[10px] bg-white border border-rose-200 text-rose-700 hover:text-rose-900 dark:bg-zinc-950 dark:border-rose-900/50 dark:text-zinc-300 dark:hover:text-white transition-all cursor-pointer font-mono shadow-sm dark:shadow-none"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-500 dark:text-blue-400" /> View Screens ({pattern.screens.join(", ")})</button>
                    </div>
                  )}
                </div>
            )) : <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-8 text-center transition-colors duration-300"><ShieldAlert className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" /><p className="text-zinc-500 dark:text-zinc-500 text-sm">No dark patterns found.</p></div>}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. GLOSSARY TAB                                                */}
      {/* ============================================================== */}
      {tab === "glossary" && (
        <div className="animate-in fade-in duration-300">
          {glossary && Object.keys(glossary).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(glossary).map(([term, data]: any, i: number) => {
                const definition = typeof data === "string" ? data : data.definition;
                const step = typeof data === "object" ? data.first_seen_step : null;
                return (
                  <div key={i} className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-4 flex flex-col justify-between group hover:border-black/[0.1] dark:hover:border-white/20 transition-all">
                    <div>
                      <div className="mb-3"><span className="text-emerald-700 dark:text-emerald-400 font-mono text-[12px] font-bold bg-emerald-50 border-emerald-200 dark:bg-emerald-500/8 px-2 py-0.5 rounded border dark:border-emerald-500/15">{term}</span></div>
                      <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{definition}</p>
                    </div>
                    {step && (
                      <div className="mt-auto border-t border-black/[0.05] dark:border-white/[0.04] pt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleViewScreens([step])} className="inline-flex items-center rounded-md px-2 py-1 text-[9px] bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-500 dark:hover:text-white transition-all cursor-pointer font-mono uppercase tracking-widest shadow-sm dark:shadow-none"><ImageIcon className="w-3 h-3 mr-1.5 text-blue-500 dark:text-blue-400" /> View Screen {step}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.06] shadow-sm dark:shadow-none p-12 text-center transition-colors duration-300">
              <BookOpen className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium mb-1">No Glossary Extracted</h3>
            </div>
          )}
        </div>
      )}
    </div>
  );
}