// components/session-viewer.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ChevronLeft, ChevronRight, Activity, FileImage, 
  BrainCircuit, Search, BookOpen, AlertTriangle, Lightbulb,
  MousePointerClick, Target, Type, LayoutTemplate, BoxSelect, SplitSquareHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";

// Clean parsing for BOTH Onboarding AND MobileSpy filenames
function formatScreenshotTitle(filename: string, fallback: string) {
  if (!filename) return formatFallback(fallback);
  
  if (filename.startsWith("FINAL_")) {
    const clean = filename.replace("FINAL_", "").replace(/\.png$/i, '');
    const hashRemoved = clean.replace(/_[a-f0-9]{6}$/, '');
    return "Final Result: " + hashRemoved.replace(/_/g, ' ');
  }

  const clean = filename.replace(/\.png$/i, '');
  const parts = clean.split('_');
  
  const titleParts = parts.filter(p => {
    if (p === 'step') return false;
    if (/^\d+$/.test(p)) return false; 
    if (/^[A-Z]+$/.test(p) || /^[A-Z]+\/[A-Z]+$/.test(p)) return false; 
    if (/^[a-f0-9]{6}$/.test(p) && p === parts[parts.length -1]) return false; 
    return true;
  });
  
  if (titleParts.length === 0) return formatFallback(fallback);
  return titleParts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatFallback(fallback: string) {
  if (!fallback || fallback === "UNKNOWN") return "App Screenshot";
  return fallback.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function SessionViewer({ data }: { data: any }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const steps = data.steps;
  const currentStep = steps[currentIndex];
  
  const metadata = currentStep?.enrichedData || {};
  const agentMeta = metadata.extraction_meta || {};
  const intel = metadata.screen_intelligence || {};
  const strategy = metadata.strategic_interpretation || {};
  const elements = metadata.elements || {};
  const copy = metadata.copy_analysis || {};
  const flow = metadata.flow_position || {};

  const allFrictionEvents = data.sessionIntel?.friction_report?.friction_events ||[];
  // Use timeline_step if available (MobileSpy), else fallback to raw step (Onboarding)
  const actualStepNumber = currentStep?.enrichedData?.extraction_meta?.timeline_step || currentStep?.step;
  const deterministicEventsThisScreen = allFrictionEvents.filter((e: any) => e.screen_index === actualStepNumber);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setCurrentIndex((prev) => Math.min(prev + 1, steps.length - 1));
    else if (e.key === "ArrowLeft") setCurrentIndex((prev) => Math.max(prev - 1, 0));
  },[steps.length]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!currentStep) return null;

  const fileName = currentStep.imagePath.split('/').pop() || "";
  const displayTitle = formatScreenshotTitle(fileName, currentStep.screen_type);
  
  let displayPhase = currentStep.phase;
  if (!displayPhase || displayPhase === "null" || displayPhase === "UNKNOWN") {
    displayPhase = fileName.startsWith("FINAL_") ? "COMPLETED" : null;
  }

  const keyFindings = Array.isArray(intel.key_findings) ? intel.key_findings :[];
  const newTerms = intel.new_terms_to_remember ? Object.entries(intel.new_terms_to_remember) :[];
  const darkPatterns = Array.isArray(strategy.dark_patterns) ? strategy.dark_patterns.filter((dp: any) => dp.pattern_type !== "none") :[];

  return (
    <div className="flex flex-1 overflow-hidden flex-col">
      <div className="flex flex-1 overflow-hidden">
        
        <div className="w-[45%] bg-black border-r border-zinc-800 p-4 lg:p-6 flex flex-col relative">
          <div className="flex flex-col items-start w-full mb-5 shrink-0 gap-2.5 z-10">
            <div className="flex gap-2">
              <Badge variant="secondary" className="bg-zinc-800 text-white border-zinc-700 font-mono">
                SCREEN {actualStepNumber} / {steps.length}
              </Badge>
              {displayPhase && (
                <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/50 uppercase tracking-widest text-[10px]">
                  {displayPhase.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
            <h2 className="text-zinc-100 font-bold tracking-wide text-lg truncate drop-shadow-sm w-full" title={displayTitle}>
              {displayTitle}
            </h2>
          </div>

          <div className="relative w-full max-w-[400px] flex-1 mx-auto rounded-xl overflow-hidden border border-zinc-800 shadow-2xl bg-zinc-950">
            <Image src={currentStep.imagePath} alt={displayTitle} fill className="object-contain" unoptimized />
          </div>
          
          <button onClick={() => setCurrentIndex(p => Math.max(p - 1, 0))} className="absolute left-6 top-1/2 -translate-y-1/2 p-3 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-full transition border border-zinc-700/50 z-20" disabled={currentIndex === 0}><ChevronLeft className="w-6 h-6" /></button>
          <button onClick={() => setCurrentIndex(p => Math.min(p + 1, steps.length - 1))} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-full transition border border-zinc-700/50 z-20" disabled={currentIndex === steps.length - 1}><ChevronRight className="w-6 h-6" /></button>
        </div>

        <div className="w-[55%] bg-zinc-950 flex flex-col h-full">
          <Tabs defaultValue="insights" className="flex flex-col h-full">
            <div className="px-8 pt-6 border-b border-zinc-800 shrink-0">
              <TabsList className="bg-transparent h-auto p-0 gap-8 w-full justify-start">
                <TabsTrigger value="insights" className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"><BrainCircuit className="w-4 h-4" /> Strategic Insights</TabsTrigger>
                <TabsTrigger value="elements" className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"><LayoutTemplate className="w-4 h-4" /> UI Elements</TabsTrigger>
                <TabsTrigger value="context" className="data-[state=active]:bg-transparent data-[state=active]:text-purple-400 data-[state=active]:border-b-2 data-[state=active]:border-purple-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"><BookOpen className="w-4 h-4" /> Context & Logs</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <TabsContent value="insights" className="h-full mt-0 data-[state=inactive]:hidden">
                <ScrollArea className="h-full p-8">
                  <div className="max-w-2xl mx-auto space-y-10 pb-20">
                    
                    {intel.narrative && (
                      <div className="text-zinc-200 text-base leading-relaxed space-y-4 bg-zinc-900/40 p-5 rounded-xl border border-zinc-800">
                        {intel.narrative.split('\n\n').map((p: string, i: number) => <p key={i}>{p}</p>)}
                      </div>
                    )}

                    {deterministicEventsThisScreen.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-orange-500 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><SplitSquareHorizontal className="w-4 h-4" /> UX & Friction Points Detected</h3>
                        <div className="space-y-2">
                          {deterministicEventsThisScreen.map((ev: any, i: number) => (
                            <div key={i} className="bg-orange-950/10 border border-orange-900/50 rounded-lg p-3 flex gap-3 items-start">
                              <Badge variant="outline" className={`shrink-0 mt-0.5 font-bold ${ev.points >= 6 ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-orange-500/10 text-orange-400 border-orange-500/30'}`}>+{ev.points} pts</Badge>
                              <div>
                                <p className="text-sm text-orange-200 font-medium capitalize mb-0.5">{ev.label.replace(/_/g, ' ')}</p>
                                {ev.detail && <p className="text-xs text-orange-400/80 leading-relaxed">{ev.detail}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {keyFindings.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-zinc-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><Search className="w-4 h-4 text-blue-400" /> Key Findings</h3>
                        <div className="space-y-3">
                          {keyFindings.map((finding: any, i: number) => (
                            <Card key={i} className="bg-blue-950/10 border-blue-900/30 p-4">
                              <p className="text-blue-100 font-medium mb-2">{finding.finding}</p>
                              <div className="text-xs text-zinc-400 space-y-1.5 border-l-2 border-blue-800/50 pl-3">
                                {finding.evidence && <p><span className="text-zinc-500 font-medium">Evidence:</span> {finding.evidence}</p>}
                                {finding.competitive_relevance && <p><span className="text-blue-400/70 font-medium">Relevance:</span> {finding.competitive_relevance}</p>}
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="elements" className="h-full mt-0 data-[state=inactive]:hidden">
                <ScrollArea className="h-full p-8">
                  <div className="max-w-2xl mx-auto space-y-10 pb-20">
                    {(copy.primary_headline || copy.primary_cta_text) && (
                      <div className="space-y-4">
                        <h3 className="text-zinc-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><Type className="w-4 h-4 text-orange-400" /> Messaging</h3>
                        <Card className="bg-zinc-900/30 border-zinc-800 p-5 space-y-5">
                          {copy.primary_headline && (
                            <div>
                              <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Headline</span>
                              <p className="text-xl text-white font-medium leading-tight">"{copy.primary_headline}"</p>
                            </div>
                          )}
                        </Card>
                      </div>
                    )}
                    {elements.buttons && elements.buttons.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-zinc-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><MousePointerClick className="w-4 h-4 text-emerald-400" /> Interactive Elements</h3>
                        <div className="flex flex-wrap gap-2">
                          {elements.buttons.map((btn: any, i: number) => {
                            const btnText = typeof btn === 'string' ? btn : (btn?.text || btn?.label || "Unnamed");
                            return <span key={i} className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium border shadow-sm border-zinc-700 text-zinc-300 bg-zinc-900/50">{btnText}</span>;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="context" className="h-full mt-0 data-[state=inactive]:hidden">
                <ScrollArea className="h-full p-8">
                  <div className="max-w-2xl mx-auto space-y-10 pb-20">
                    <div className="grid grid-cols-2 gap-4">
                      <Card className="bg-zinc-900/30 border-zinc-800 p-4">
                        <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Timeline Step</span>
                        <span className="text-2xl font-bold text-blue-400">{actualStepNumber}</span>
                      </Card>
                      <Card className="bg-zinc-900/30 border-zinc-800 p-4">
                        <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Screen Type</span>
                        <span className="text-sm text-zinc-300 font-mono truncate block capitalize">{metadata.classification?.screen_type || 'Unknown'}</span>
                      </Card>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      <div className="h-32 border-t border-zinc-800 bg-zinc-950 p-4 flex items-center gap-4 overflow-x-auto shrink-0 hide-scrollbar">
        {steps.map((step: any, idx: number) => (
          <div key={idx} onClick={() => setCurrentIndex(idx)} className={`relative h-full aspect-[9/19] shrink-0 border-2 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ${idx === currentIndex ? "border-blue-500 scale-105 shadow-[0_0_15px_rgba(59,130,246,0.5)]" : "border-zinc-800 opacity-50 hover:opacity-100"}`}>
            <Image src={step.imagePath} alt={`Step ${idx}`} fill className="object-cover" unoptimized />
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[9px] text-white text-center py-1 font-mono">{idx + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}