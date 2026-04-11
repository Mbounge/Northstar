// components/session-viewer.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, BrainCircuit, BookOpen, Search,
  LayoutTemplate, SplitSquareHorizontal, MousePointerClick,
  Type, Maximize2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PanoramicMockup } from "@/components/PanoramicMockup";

function formatScreenshotTitle(filename: string, fallback: string) {
  if (!filename) return formatFallback(fallback);
  if (filename.startsWith("FINAL_")) {
    const clean = filename.replace("FINAL_", "").replace(/\.png$/i, "");
    return "Final Result: " + clean.replace(/_[a-f0-9]{6}$/, "").replace(/_/g, " ");
  }
  const clean = filename.replace(/\.png$/i, "");
  const parts = clean.split("_");
  const titleParts = parts.filter((p) => {
    if (p === "step") return false;
    if (/^\d+$/.test(p)) return false;
    if (/^[A-Z]+$/.test(p) || /^[A-Z]+\/[A-Z]+$/.test(p)) return false;
    if (/^[a-f0-9]{6}$/.test(p) && p === parts[parts.length - 1]) return false;
    return true;
  });
  if (titleParts.length === 0) return formatFallback(fallback);
  return titleParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatFallback(fallback: string) {
  if (!fallback || fallback === "UNKNOWN") return "App Screenshot";
  return fallback.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function InnerTab({
  active, onClick, icon, label, activeColor = "text-[#0066FF] border-[#0066FF]",
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-0 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap",
        active
          ? activeColor
          : "text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-white"
      )}
    >
      {icon} {label}
    </button>
  );
}

// Glass card wrapper
function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-[20px] p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

function SectionLabel({ icon, children, color = "text-zinc-500 dark:text-zinc-400" }: { icon?: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <h3 className={cn("font-bold uppercase tracking-widest text-[11px] flex items-center gap-2 mb-3", color)}>
      {icon}{children}
    </h3>
  );
}

export function SessionViewer({ data }: { data: any }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"insights" | "elements" | "context">("insights");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const steps = data.steps;
  const currentStep = steps[currentIndex];

  // ── Same data paths as original ──
  const metadata = currentStep?.enrichedData || {};
  const agentMeta = metadata.extraction_meta || {};
  const intel = metadata.screen_intelligence || {};
  const elements = metadata.elements || {};
  const copy = metadata.copy_analysis || {};

  const allFrictionEvents = data.sessionIntel?.friction_report?.friction_events || [];
  const actualStepNumber = currentStep?.enrichedData?.extraction_meta?.timeline_step || currentStep?.step;
  const deterministicEventsThisScreen = allFrictionEvents.filter((e: any) => e.screen_index === actualStepNumber);
  const keyFindings: any[] = Array.isArray(intel.key_findings) ? intel.key_findings : [];

  // Modal scroll helpers
  const scrollToIndex = useCallback((idx: number) => {
    if (scrollRef.current) {
      const child = scrollRef.current.children[idx] as HTMLElement;
      if (child) {
        scrollRef.current.scrollTo({
          left: child.offsetLeft - scrollRef.current.offsetWidth / 2 + child.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, []);

  const handleModalScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = 0, minDiff = Infinity;
    Array.from(container.children).forEach((child, idx) => {
      const el = child as HTMLElement;
      const diff = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
      if (diff < minDiff) { minDiff = diff; closestIdx = idx; }
    });
    if (closestIdx !== currentIndex) setCurrentIndex(closestIdx);
  }, [currentIndex]);

  // Carousel thumb scroll
  const scrollCarouselToIndex = useCallback((idx: number) => {
    if (carouselRef.current) {
      const child = carouselRef.current.children[idx] as HTMLElement;
      if (child) {
        carouselRef.current.scrollTo({
          left: child.offsetLeft - carouselRef.current.offsetWidth / 2 + child.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, []);

  useEffect(() => { scrollCarouselToIndex(currentIndex); }, [currentIndex, scrollCarouselToIndex]);
  useEffect(() => { setActiveTab("insights"); }, [currentIndex]);

  useEffect(() => {
    if (isModalOpen && scrollRef.current) {
      const child = scrollRef.current.children[currentIndex] as HTMLElement;
      if (child) {
        scrollRef.current.scrollTo({
          left: child.offsetLeft - scrollRef.current.offsetWidth / 2 + child.offsetWidth / 2,
          behavior: "instant" as ScrollBehavior,
        });
      }
    }
  }, [isModalOpen, currentIndex]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsModalOpen(false);
      if (e.key === "ArrowRight") setCurrentIndex((p) => {
        const next = Math.min(p + 1, steps.length - 1);
        if (isModalOpen) scrollToIndex(next);
        return next;
      });
      if (e.key === "ArrowLeft") setCurrentIndex((p) => {
        const next = Math.max(p - 1, 0);
        if (isModalOpen) scrollToIndex(next);
        return next;
      });
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [steps.length, isModalOpen, scrollToIndex]);

  if (!currentStep) return null;

  const fileName = currentStep.imagePath.split("/").pop() || "";
  const displayTitle = formatScreenshotTitle(fileName, currentStep.screen_type);
  const isCurrentPanoramic = currentStep.imagePath.includes("panoramic") || currentStep.imagePath.includes("full_page");

  let displayPhase = currentStep.phase;
  if (!displayPhase || displayPhase === "null" || displayPhase === "UNKNOWN") {
    displayPhase = fileName.startsWith("FINAL_") ? "COMPLETED" : null;
  }

  return (
    <>
      {/* ─── FULLSCREEN MODAL ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-zinc-100/95 dark:bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
          <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 z-50 p-3 bg-white/50 dark:bg-white/10 backdrop-blur-md rounded-full border border-white/50 dark:border-white/20">
            <X className="w-6 h-6 text-zinc-900 dark:text-white" />
          </button>
          <button onClick={() => { const p = Math.max(currentIndex - 1, 0); setCurrentIndex(p); scrollToIndex(p); }} disabled={currentIndex === 0} className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 bg-white/80 dark:bg-black/60 backdrop-blur-md rounded-full border border-white/60 dark:border-white/20 shadow-xl z-20 disabled:opacity-30">
            <ChevronLeft className="w-8 h-8 text-zinc-900 dark:text-white" />
          </button>
          <div ref={scrollRef} onScroll={handleModalScroll} className="flex-1 w-full flex items-center gap-12 overflow-x-auto hide-scrollbar snap-x snap-mandatory" style={{ paddingLeft: "calc(50vw - 18.5vh)", paddingRight: "calc(50vw - 18.5vh)" }}>
            {steps.map((step: any, idx: number) => {
              const isActive = idx === currentIndex;
              const isPanoramic = step.imagePath.includes("panoramic") || step.imagePath.includes("full_page");
              const hasNav = step.imagePath.includes("withnav") || (!step.imagePath.includes("nonav") && isPanoramic);
              return (
                <div key={idx} onClick={() => { setCurrentIndex(idx); scrollToIndex(idx); }} className={cn("snap-center shrink-0 transition-all duration-300 cursor-pointer", isActive ? "h-[80vh] opacity-100" : "h-[65vh] opacity-40 hover:opacity-70")} style={{ aspectRatio: "9/19.5" }}>
                  <div className="relative w-full h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden" style={{ borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid", borderRadius: isActive ? "1.8rem" : "1.1rem" }}>
                    {isPanoramic ? <PanoramicMockup imgUrl={step.imagePath} alt="" hasBottomNav={hasNav} /> : <Image src={step.imagePath} alt="" fill className="object-cover" unoptimized />}
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={() => { const n = Math.min(currentIndex + 1, steps.length - 1); setCurrentIndex(n); scrollToIndex(n); }} disabled={currentIndex === steps.length - 1} className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 bg-white/80 dark:bg-black/60 backdrop-blur-md rounded-full border border-white/60 dark:border-white/20 shadow-xl z-20 disabled:opacity-30">
            <ChevronRight className="w-8 h-8 text-zinc-900 dark:text-white" />
          </button>
          <div className="h-[80px] shrink-0 flex items-center justify-center">
            <div className="bg-white/70 dark:bg-black/70 backdrop-blur-md border border-white/50 dark:border-white/10 text-zinc-700 dark:text-zinc-300 px-6 py-2.5 rounded-full font-mono text-sm shadow-xl flex items-center gap-4">
              <span className="font-bold truncate max-w-[300px]">{displayTitle}</span>
              <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 shrink-0" />
              <span className="whitespace-nowrap shrink-0">SCREEN {actualStepNumber} / {steps.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── MAIN LAYOUT ─── */}
      <div className="flex flex-col h-full bg-transparent">

        {/* TOP: phone + intelligence */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT: Phone */}
          <div className="w-[45%] flex flex-col p-6 border-r border-black/5 dark:border-white/10 min-h-0">
            <div className="shrink-0 mb-4 flex flex-wrap gap-2 items-start">
              <Badge className="bg-white/60 dark:bg-white/10 backdrop-blur-md text-zinc-800 dark:text-zinc-200 border-white/80 dark:border-white/20 font-mono shadow-sm">
                SCREEN {actualStepNumber} / {steps.length}
              </Badge>
              {displayPhase && (
                <Badge className="bg-blue-50/80 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/30 uppercase tracking-widest text-[10px]">
                  {displayPhase.replace(/_/g, " ")}
                </Badge>
              )}
              <h2 className="w-full text-zinc-900 dark:text-white font-bold tracking-tight text-xl truncate mt-1" title={displayTitle}>
                {displayTitle}
              </h2>
            </div>

            <div className="flex-1 flex items-center justify-center relative min-h-0">
              <button onClick={() => setCurrentIndex((p) => Math.max(p - 1, 0))} disabled={currentIndex === 0} className="absolute left-0 z-20 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md text-zinc-900 dark:text-white rounded-full border border-white/50 dark:border-white/10 shadow-sm hover:scale-105 transition-all disabled:opacity-30">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div className="relative h-full aspect-[9/19.5] bg-white dark:bg-zinc-900 shadow-2xl shrink-0 cursor-pointer group overflow-hidden" style={{ borderWidth: "0.3px", borderColor: "#818A98", borderStyle: "solid", borderRadius: "0.98rem" }} onClick={() => setIsModalOpen(true)}>
                {isCurrentPanoramic
                  ? <PanoramicMockup imgUrl={currentStep.imagePath} alt={displayTitle} hasBottomNav={currentStep.imagePath.includes("withnav") || (!currentStep.imagePath.includes("nonav") && isCurrentPanoramic)} />
                  : <Image src={currentStep.imagePath} alt={displayTitle} fill className="object-cover" unoptimized />
                }
                <div className="absolute inset-0 z-40 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100">
                  <div className="bg-white/90 backdrop-blur-sm p-4 rounded-full shadow-xl scale-90 group-hover:scale-100 transition-all">
                    <Maximize2 className="w-6 h-6 text-black" />
                  </div>
                </div>
              </div>
              <button onClick={() => setCurrentIndex((p) => Math.min(p + 1, steps.length - 1))} disabled={currentIndex === steps.length - 1} className="absolute right-0 z-20 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md text-zinc-900 dark:text-white rounded-full border border-white/50 dark:border-white/10 shadow-sm hover:scale-105 transition-all disabled:opacity-30">
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* RIGHT: Intelligence */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Tab bar */}
            <div className="px-8 pt-6 border-b border-black/5 dark:border-white/10 shrink-0 flex items-center gap-8">
              <InnerTab active={activeTab === "insights"} onClick={() => setActiveTab("insights")} icon={<BrainCircuit className="w-4 h-4" />} label="Strategic Insights" activeColor="text-[#0066FF] border-[#0066FF]" />
              <InnerTab active={activeTab === "elements"} onClick={() => setActiveTab("elements")} icon={<LayoutTemplate className="w-4 h-4" />} label="UI Elements" activeColor="text-emerald-600 dark:text-emerald-400 border-emerald-600 dark:border-emerald-400" />
              <InnerTab active={activeTab === "context"} onClick={() => setActiveTab("context")} icon={<BookOpen className="w-4 h-4" />} label="Context & Logs" activeColor="text-purple-600 dark:text-purple-400 border-purple-600 dark:border-purple-400" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto hide-scrollbar">

              {/* INSIGHTS */}
              {activeTab === "insights" && (
                <div className="p-8 space-y-8 max-w-2xl mx-auto pb-12">
                  {intel.narrative && (
                    <GlassCard>
                      <div className="text-zinc-800 dark:text-zinc-200 text-[15px] leading-relaxed space-y-4">
                        {intel.narrative.split("\n\n").map((p: string, i: number) => <p key={i}>{p}</p>)}
                      </div>
                    </GlassCard>
                  )}
                  {deterministicEventsThisScreen.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel icon={<SplitSquareHorizontal className="w-4 h-4 text-orange-500" />} color="text-orange-600 dark:text-orange-400">
                        UX & Friction Points
                      </SectionLabel>
                      {deterministicEventsThisScreen.map((ev: any, i: number) => (
                        <div key={i} className="bg-white/50 dark:bg-orange-500/10 backdrop-blur-md border border-orange-200/50 dark:border-orange-500/20 rounded-[16px] p-5 flex gap-4 shadow-sm">
                          <Badge className={cn("shrink-0 shadow-none border-none", ev.points >= 6 ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400" : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400")}>
                            +{ev.points} pts
                          </Badge>
                          <div>
                            <p className="text-sm text-orange-900 dark:text-orange-200 font-bold capitalize mb-1.5">{ev.label.replace(/_/g, " ")}</p>
                            {ev.detail && <p className="text-[13px] text-zinc-700 dark:text-zinc-400 leading-relaxed">{ev.detail}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {keyFindings.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel icon={<Search className="w-4 h-4 text-blue-500" />}>Key Findings</SectionLabel>
                      {keyFindings.map((finding: any, i: number) => (
                        <GlassCard key={i} className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-900/30">
                          <p className="text-blue-900 dark:text-blue-100 font-semibold mb-3 leading-relaxed text-[14px]">
                            {typeof finding === "string" ? finding : finding.finding}
                          </p>
                          {typeof finding === "object" && (finding.evidence || finding.competitive_relevance) && (
                            <div className="text-[13px] space-y-1.5 border-l-2 border-blue-300/60 dark:border-blue-700/50 pl-4">
                              {finding.evidence && (
                                <p className="text-zinc-600 dark:text-zinc-400">
                                  <span className="text-zinc-800 dark:text-zinc-300 font-semibold">Evidence: </span>{finding.evidence}
                                </p>
                              )}
                              {finding.competitive_relevance && (
                                <p className="text-blue-700 dark:text-blue-400/80">
                                  <span className="font-semibold">Relevance: </span>{finding.competitive_relevance}
                                </p>
                              )}
                            </div>
                          )}
                        </GlassCard>
                      ))}
                    </div>
                  )}
                  {!intel.narrative && deterministicEventsThisScreen.length === 0 && keyFindings.length === 0 && (
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm italic">No insights available for this screen.</p>
                  )}
                </div>
              )}

              {/* ELEMENTS — original data paths: copy.primary_headline, elements.buttons */}
              {activeTab === "elements" && (
                <div className="p-8 space-y-8 max-w-2xl mx-auto pb-12">
                  {(copy.primary_headline || copy.primary_cta_text) && (
                    <div className="space-y-3">
                      <SectionLabel icon={<Type className="w-4 h-4 text-orange-500" />}>Messaging</SectionLabel>
                      <GlassCard className="space-y-4">
                        {copy.primary_headline && (
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1.5">Headline</span>
                            <p className="text-xl text-zinc-900 dark:text-white font-medium leading-tight">"{copy.primary_headline}"</p>
                          </div>
                        )}
                        {copy.primary_cta_text && (
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1.5">Primary CTA</span>
                            <span className="inline-flex items-center px-4 py-2 rounded-full bg-[#0066FF]/10 text-[#0066FF] dark:text-blue-400 text-sm font-bold border border-[#0066FF]/20">
                              {copy.primary_cta_text}
                            </span>
                          </div>
                        )}
                        {copy.supporting_copy && (
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1.5">Supporting Copy</span>
                            <p className="text-[14px] text-zinc-700 dark:text-zinc-300 leading-relaxed">{copy.supporting_copy}</p>
                          </div>
                        )}
                      </GlassCard>
                    </div>
                  )}
                  {elements.buttons && elements.buttons.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel icon={<MousePointerClick className="w-4 h-4 text-emerald-500" />} color="text-emerald-700 dark:text-emerald-400">
                        Interactive Elements
                      </SectionLabel>
                      <div className="flex flex-wrap gap-2">
                        {elements.buttons.map((btn: any, i: number) => {
                          const btnText = typeof btn === "string" ? btn : (btn?.text || btn?.label || "Unnamed");
                          return (
                            <span key={i} className="inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium bg-white/60 dark:bg-white/10 border border-white/80 dark:border-white/20 text-zinc-700 dark:text-zinc-300 backdrop-blur-md shadow-sm">
                              {btnText}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {elements.form_fields && elements.form_fields.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel icon={<LayoutTemplate className="w-4 h-4 text-indigo-500" />} color="text-indigo-700 dark:text-indigo-400">
                        Form Fields
                      </SectionLabel>
                      <div className="space-y-2">
                        {elements.form_fields.map((field: any, i: number) => {
                          const label = typeof field === "string" ? field : (field?.label || field?.name || `Field ${i + 1}`);
                          const type = typeof field === "object" ? field?.type : null;
                          return (
                            <div key={i} className="flex items-center justify-between bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-xl px-4 py-3">
                              <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
                              {type && <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{type}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!copy.primary_headline && !copy.primary_cta_text && (!elements.buttons || elements.buttons.length === 0) && (!elements.form_fields || elements.form_fields.length === 0) && (
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm italic">No element data extracted for this screen.</p>
                  )}
                </div>
              )}

              {/* CONTEXT — original data paths: metadata.classification, agentMeta */}
              {activeTab === "context" && (
                <div className="p-8 space-y-6 max-w-2xl mx-auto pb-12">
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <GlassCard>
                      <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">Timeline Step</span>
                      <span className="text-2xl font-bold text-[#0066FF] dark:text-blue-400">{actualStepNumber}</span>
                    </GlassCard>
                    <GlassCard>
                      <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">Screen Type</span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate block capitalize">
                        {metadata.classification?.screen_type || currentStep.screen_type || "Unknown"}
                      </span>
                    </GlassCard>
                    {agentMeta.processing_timestamp && (
                      <GlassCard className="col-span-2">
                        <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">Processed</span>
                        <span className="text-[13px] text-zinc-700 dark:text-zinc-300 font-mono">{agentMeta.processing_timestamp}</span>
                      </GlassCard>
                    )}
                  </div>
                  {/* Phase */}
                  {currentStep.phase && currentStep.phase !== "null" && currentStep.phase !== "UNKNOWN" && (
                    <GlassCard>
                      <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">Flow Phase</span>
                      <span className="text-[14px] text-zinc-800 dark:text-zinc-200 font-medium capitalize">{currentStep.phase.replace(/_/g, " ")}</span>
                    </GlassCard>
                  )}
                  {/* Key findings in context too, same as original */}
                  {keyFindings.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel icon={<Search className="w-4 h-4 text-purple-500" />} color="text-purple-700 dark:text-purple-400">
                        Key Findings
                      </SectionLabel>
                      {keyFindings.map((finding: any, i: number) => (
                        <GlassCard key={i} className="bg-purple-50/40 dark:bg-purple-950/20 border-purple-200/50 dark:border-purple-900/30">
                          <p className="text-[14px] text-zinc-900 dark:text-zinc-100 font-semibold mb-2 leading-relaxed">
                            {typeof finding === "string" ? finding : finding.finding}
                          </p>
                          {typeof finding === "object" && finding.evidence && (
                            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-relaxed border-l-2 border-purple-300/60 dark:border-purple-700/50 pl-3">
                              {finding.evidence}
                            </p>
                          )}
                        </GlassCard>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* BOTTOM CAROUSEL */}
        <div className="h-[100px] shrink-0 bg-white/40 dark:bg-black/40 backdrop-blur-xl border-t border-white/60 dark:border-white/10 px-4 flex items-center">
          <div ref={carouselRef} className="flex items-center gap-3 h-full py-3 overflow-x-auto hide-scrollbar w-full">
            {steps.map((step: any, idx: number) => (
              <div
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "relative h-full aspect-[9/19.5] shrink-0 overflow-hidden cursor-pointer transition-all duration-200 rounded-lg",
                  idx === currentIndex ? "scale-105 shadow-xl ring-2 ring-[#0066FF]" : "opacity-50 hover:opacity-80 shadow-sm"
                )}
              >
                <Image src={step.imagePath} alt="" fill className={cn("bg-white dark:bg-zinc-900", step.imagePath.includes("panoramic") || step.imagePath.includes("full_page") ? "object-cover object-top" : "object-cover")} unoptimized />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white text-center py-0.5 font-mono">{idx + 1}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}