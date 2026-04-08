"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ChevronLeft, ChevronRight, Activity, FileImage, 
  BrainCircuit, Search, BookOpen, AlertTriangle, Lightbulb,
  MousePointerClick, Target, Type, LayoutTemplate, BoxSelect, SplitSquareHorizontal,
  Maximize2, X
} from "lucide-react";
import { cn } from "@/lib/utils";

import { PanoramicMockup } from "@/components/PanoramicMockup"; // Adjust path if needed

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const steps = data.steps;
  const currentStep = steps[currentIndex];
  
  const metadata = currentStep?.enrichedData || {};
  const agentMeta = metadata.extraction_meta || {};
  const intel = metadata.screen_intelligence || {};
  const strategy = metadata.strategic_interpretation || {};
  const elements = metadata.elements || {};
  const copy = metadata.copy_analysis || {};
  const flow = metadata.flow_position || {};

  const allFrictionEvents = data.sessionIntel?.friction_report?.friction_events || [];
  const actualStepNumber = currentStep?.enrichedData?.extraction_meta?.timeline_step || currentStep?.step;
  const deterministicEventsThisScreen = allFrictionEvents.filter((e: any) => e.screen_index === actualStepNumber);

  // Smooth scroll to an item in the modal carousel
  const scrollToIndex = useCallback((idx: number) => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const child = container.children[idx] as HTMLElement;
      if (child) {
        const scrollLeft = child.offsetLeft - container.offsetWidth / 2 + child.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, []);

  // Handle native trackpad scrolling in modal
  const handleModalScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const center = container.scrollLeft + container.clientWidth / 2;
    
    let closestIdx = 0;
    let minDiff = Infinity;
    
    Array.from(container.children).forEach((child, idx) => {
      const childEl = child as HTMLElement;
      const childCenter = childEl.offsetLeft + childEl.offsetWidth / 2;
      const diff = Math.abs(childCenter - center);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    
    if (closestIdx !== currentIndex) {
      setCurrentIndex(closestIdx);
    }
  }, [currentIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setIsModalOpen(false);
    if (e.key === "ArrowRight") {
      setCurrentIndex((prev) => {
        const next = Math.min(prev + 1, steps.length - 1);
        if (isModalOpen) scrollToIndex(next);
        return next;
      });
    } else if (e.key === "ArrowLeft") {
      setCurrentIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        if (isModalOpen) scrollToIndex(next);
        return next;
      });
    }
  }, [steps.length, isModalOpen, scrollToIndex]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // When modal opens, snap to current index instantly
  useEffect(() => {
    if (isModalOpen && scrollRef.current) {
      const container = scrollRef.current;
      const child = container.children[currentIndex] as HTMLElement;
      if (child) {
        const scrollLeft = child.offsetLeft - container.offsetWidth / 2 + child.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "instant" });
      }
    }
  }, [isModalOpen, currentIndex]);

  if (!currentStep) return null;

  const fileName = currentStep.imagePath.split('/').pop() || "";
  const displayTitle = formatScreenshotTitle(fileName, currentStep.screen_type);
  const isCurrentPanoramic = currentStep.imagePath.includes('panoramic') || currentStep.imagePath.includes('full_page');
  
  let displayPhase = currentStep.phase;
  if (!displayPhase || displayPhase === "null" || displayPhase === "UNKNOWN") {
    displayPhase = fileName.startsWith("FINAL_") ? "COMPLETED" : null;
  }

  const keyFindings = Array.isArray(intel.key_findings) ? intel.key_findings : [];

  return (
    <div className="flex flex-1 overflow-hidden flex-col transition-colors duration-300 relative">
      
      {/* ─── FULLSCREEN ENLARGED CAROUSEL MODAL ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-zinc-50/95 dark:bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
          
          {/* Close Button */}
          <button 
            onClick={() => setIsModalOpen(false)} 
            className="absolute top-6 right-6 z-50 p-3 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-full transition-colors shadow-lg border border-zinc-200 dark:border-zinc-800"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Left Arrow */}
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              const prev = Math.max(currentIndex - 1, 0);
              setCurrentIndex(prev); 
              scrollToIndex(prev); 
            }} 
            className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 bg-white/90 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-full transition border border-zinc-200 dark:border-zinc-700/50 shadow-2xl z-20" 
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          {/* Horizontal Scroll Area */}
          <div 
            ref={scrollRef}
            onScroll={handleModalScroll}
            className="flex-1 w-full flex items-center gap-12 overflow-x-auto hide-scrollbar snap-x snap-mandatory"
            // The padding ensures the first and last items can be perfectly centered
            style={{ paddingLeft: 'calc(50vw - 18.5vh)', paddingRight: 'calc(50vw - 18.5vh)' }}
          >
            {steps.map((step: any, idx: number) => {
              const isActive = idx === currentIndex;
              const isPanoramic = step.imagePath.includes('panoramic') || step.imagePath.includes('full_page');
              // Read the tag we added in Python. Default to true for backward compatibility.
              const hasNav = step.imagePath.includes('withnav') || (!step.imagePath.includes('nonav') && isPanoramic);

              return (
                <div 
                  key={idx}
                  onClick={() => { setCurrentIndex(idx); scrollToIndex(idx); }}
                  className={cn(
                    "snap-center shrink-0 transition-all duration-300 ease-out cursor-pointer relative",
                    isActive ? "h-[80vh] opacity-100" : "h-[65vh] opacity-40 hover:opacity-70"
                  )}
                  style={{ aspectRatio: '9/19.5' }}
                >
                  <div 
                    // ALWAYS overflow-hidden so the border-radius stays perfectly rounded
                    className="relative w-full h-full bg-white dark:bg-zinc-900 shadow-2xl transition-all duration-300 overflow-hidden"
                    style={{ borderWidth: '0.3px', borderColor: '#818A98', borderStyle: 'solid', borderRadius: isActive ? '1.8rem' : '1.1rem' }}
                  >
                    {isPanoramic ? (
                      <PanoramicMockup imgUrl={step.imagePath} alt={`Step ${idx}`} hasBottomNav={hasNav} />
                    ) : (
                      <Image src={step.imagePath} alt={`Step ${idx}`} fill className="object-cover" unoptimized />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Arrow */}
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              const next = Math.min(currentIndex + 1, steps.length - 1);
              setCurrentIndex(next); 
              scrollToIndex(next); 
            }} 
            className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 bg-white/90 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-full transition border border-zinc-200 dark:border-zinc-700/50 shadow-2xl z-20" 
            disabled={currentIndex === steps.length - 1}
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Bottom Label Safe Area (prevents obscuring the screen) */}
          <div className="h-[100px] shrink-0 w-full flex items-center justify-center relative z-20 bg-gradient-to-t from-white dark:from-black to-transparent">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-6 py-3 rounded-full font-mono text-sm shadow-xl flex items-center gap-4 max-w-[90vw]">
              <span className="font-bold truncate max-w-[200px] sm:max-w-[400px]">{displayTitle}</span>
              <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 shrink-0" />
              <span className="whitespace-nowrap shrink-0">SCREEN {actualStepNumber} / {steps.length}</span>
            </div>
          </div>

        </div>
      )}


      {/* ─── NORMAL LAYOUT ─── */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        
        {/* LEFT PANE - DEVICE VIEWER */}
        <div className="w-full lg:w-[45%] bg-zinc-50 dark:bg-[#0a0a0a] border-r border-zinc-200 dark:border-zinc-800 p-6 flex flex-col relative transition-colors duration-300">
          
          {/* Header Info */}
          <div className="flex flex-col items-start w-full mb-4 shrink-0 gap-3 z-10">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-200 dark:border-zinc-700 font-mono shadow-sm dark:shadow-none">
                SCREEN {actualStepNumber} / {steps.length}
              </Badge>
              {displayPhase && (
                <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/50 uppercase tracking-widest text-[10px]">
                  {displayPhase.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
            <h2 className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide text-xl drop-shadow-sm w-full truncate" title={displayTitle}>
              {displayTitle}
            </h2>
          </div>

          {/* Device Mockup Container - Designed to fill maximum vertical space */}
          <div className="flex-1 w-full flex items-center justify-center relative min-h-0 py-2">
            
            <button onClick={() => setCurrentIndex(p => Math.max(p - 1, 0))} className="absolute left-0 z-20 p-3 bg-white/90 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-full transition border border-zinc-200 dark:border-zinc-700/50 shadow-md dark:shadow-none" disabled={currentIndex === 0}>
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            {/* EXACT FIGMA DEVICE SPECS (0.98rem fixed radius) */}
            <div 
              // ALWAYS overflow-hidden here. The PanoramicMockup handles scrolling internally.
              className="relative h-full aspect-[9/19.5] bg-white dark:bg-zinc-900 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] shrink-0 transition-all duration-300 cursor-pointer group overflow-hidden"
              style={{ borderWidth: '0.3px', borderColor: '#818A98', borderStyle: 'solid', borderRadius: '0.98rem' }}
              onClick={() => setIsModalOpen(true)}
            >
              {isCurrentPanoramic ? (
                <PanoramicMockup 
                  imgUrl={currentStep.imagePath} 
                  alt={displayTitle} 
                  hasBottomNav={currentStep.imagePath.includes('withnav') || (!currentStep.imagePath.includes('nonav') && isCurrentPanoramic)} 
                />
              ) : (
                <Image src={currentStep.imagePath} alt={displayTitle} fill className="object-cover" unoptimized />
              )}
              
              {/* Hover Overlay for Zoom Indication (Added z-40 so it sits ABOVE the sticky headers) */}
              <div className="absolute inset-0 z-40 bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-black/30 pointer-events-none transition-colors duration-200 flex items-center justify-center rounded-[0.98rem]">
                <div className="bg-white/95 dark:bg-black/80 backdrop-blur-sm p-4 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-xl transform scale-90 group-hover:scale-100">
                  <Maximize2 className="w-6 h-6 text-zinc-900 dark:text-white" />
                </div>
              </div>
            </div>
            
            <button onClick={() => setCurrentIndex(p => Math.min(p + 1, steps.length - 1))} className="absolute right-0 z-20 p-3 bg-white/90 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-full transition border border-zinc-200 dark:border-zinc-700/50 shadow-md dark:shadow-none" disabled={currentIndex === steps.length - 1}>
              <ChevronRight className="w-6 h-6" />
            </button>

          </div>
        </div>

        {/* RIGHT PANE - INTELLIGENCE TABS */}
        <div className="w-full lg:w-[55%] bg-white dark:bg-zinc-950 flex flex-col h-full transition-colors duration-300">
          <Tabs defaultValue="insights" className="flex flex-col h-full">
            <div className="px-8 pt-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0 transition-colors duration-300">
              <TabsList className="bg-transparent h-auto p-0 gap-8 w-full justify-start">
                <TabsTrigger value="insights" className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 dark:data-[state=active]:border-blue-400 rounded-none px-0 py-3 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"><BrainCircuit className="w-4 h-4" /> Strategic Insights</TabsTrigger>
                <TabsTrigger value="elements" className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 dark:data-[state=active]:border-emerald-400 rounded-none px-0 py-3 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"><LayoutTemplate className="w-4 h-4" /> UI Elements</TabsTrigger>
                <TabsTrigger value="context" className="data-[state=active]:bg-transparent data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 data-[state=active]:border-b-2 data-[state=active]:border-purple-600 dark:data-[state=active]:border-purple-400 rounded-none px-0 py-3 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"><BookOpen className="w-4 h-4" /> Context & Logs</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <TabsContent value="insights" className="h-full mt-0 data-[state=inactive]:hidden">
                <ScrollArea className="h-full p-8">
                  <div className="max-w-2xl mx-auto space-y-10 pb-20">
                    
                    {intel.narrative && (
                      <div className="text-zinc-800 dark:text-zinc-200 text-base leading-relaxed space-y-4 bg-zinc-50 dark:bg-zinc-900/40 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                        {intel.narrative.split('\n\n').map((p: string, i: number) => <p key={i}>{p}</p>)}
                      </div>
                    )}

                    {deterministicEventsThisScreen.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-orange-600 dark:text-orange-500 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><SplitSquareHorizontal className="w-4 h-4" /> UX & Friction Points Detected</h3>
                        <div className="space-y-2">
                          {deterministicEventsThisScreen.map((ev: any, i: number) => (
                            <div key={i} className="bg-orange-50 dark:bg-orange-950/10 border border-orange-200 dark:border-orange-900/50 rounded-xl p-4 flex gap-4 items-start transition-colors duration-300">
                              <Badge variant="outline" className={`shrink-0 mt-0.5 font-bold ${ev.points >= 6 ? 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30' : 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30'}`}>+{ev.points} pts</Badge>
                              <div>
                                <p className="text-sm text-orange-900 dark:text-orange-200 font-bold capitalize mb-1.5">{ev.label.replace(/_/g, ' ')}</p>
                                {ev.detail && <p className="text-[13px] text-orange-800/80 dark:text-orange-300/80 leading-relaxed">{ev.detail}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {keyFindings.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><Search className="w-4 h-4 text-blue-500 dark:text-blue-400" /> Key Findings</h3>
                        <div className="space-y-3">
                          {keyFindings.map((finding: any, i: number) => (
                            <Card key={i} className="bg-blue-50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30 p-5 transition-colors duration-300 shadow-sm dark:shadow-none">
                              <p className="text-blue-900 dark:text-blue-100 font-semibold mb-3 leading-relaxed">{finding.finding}</p>
                              <div className="text-[13px] text-zinc-600 dark:text-zinc-400 space-y-2 border-l-2 border-blue-300 dark:border-blue-800/50 pl-4 py-1">
                                {finding.evidence && <p><span className="text-zinc-800 dark:text-zinc-300 font-semibold">Evidence: </span> {finding.evidence}</p>}
                                {finding.competitive_relevance && <p><span className="text-blue-700 dark:text-blue-400/80 font-semibold">Relevance: </span> {finding.competitive_relevance}</p>}
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
                        <h3 className="text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><Type className="w-4 h-4 text-orange-500 dark:text-orange-400" /> Messaging</h3>
                        <Card className="bg-zinc-50 dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800 p-5 space-y-5 transition-colors duration-300 shadow-sm dark:shadow-none">
                          {copy.primary_headline && (
                            <div>
                              <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Headline</span>
                              <p className="text-xl text-zinc-900 dark:text-white font-medium leading-tight">"{copy.primary_headline}"</p>
                            </div>
                          )}
                        </Card>
                      </div>
                    )}
                    {elements.buttons && elements.buttons.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2"><MousePointerClick className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> Interactive Elements</h3>
                        <div className="flex flex-wrap gap-2">
                          {elements.buttons.map((btn: any, i: number) => {
                            const btnText = typeof btn === 'string' ? btn : (btn?.text || btn?.label || "Unnamed");
                            return <span key={i} className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium border shadow-sm border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/50">{btnText}</span>;
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
                      <Card className="bg-zinc-50 dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800 p-4 transition-colors duration-300 shadow-sm dark:shadow-none">
                        <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Timeline Step</span>
                        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{actualStepNumber}</span>
                      </Card>
                      <Card className="bg-zinc-50 dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800 p-4 transition-colors duration-300 shadow-sm dark:shadow-none">
                        <span className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Screen Type</span>
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate block capitalize">{metadata.classification?.screen_type || 'Unknown'}</span>
                      </Card>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* BOTTOM CAROUSEL */}
      <div className="h-[140px] border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0a0a0a] p-5 flex items-center gap-5 overflow-x-auto shrink-0 hide-scrollbar transition-colors duration-300">
        {steps.map((step: any, idx: number) => {
          // Keep thumbnails object-cover so the grid doesn't break, but align top for panoramas
          const isThumbPanoramic = step.imagePath.includes('panoramic') || step.imagePath.includes('full_page');
          
          return (
            <div key={idx} onClick={() => setCurrentIndex(idx)} 
                 className={cn(
                   "relative h-full aspect-[9/19.5] shrink-0 overflow-hidden cursor-pointer transition-all duration-200",
                   idx === currentIndex ? "scale-105 shadow-[0_0_15px_rgba(59,130,246,0.3)] dark:shadow-[0_0_15px_rgba(59,130,246,0.5)] z-10" : "opacity-60 hover:opacity-100 hover:scale-105 shadow-sm"
                 )}
                 style={{ 
                   borderWidth: idx === currentIndex ? '2px' : '0.3px', 
                   borderColor: idx === currentIndex ? '#3b82f6' : '#818A98',
                   borderStyle: 'solid',
                   borderRadius: '0.5rem' /* Small thumbnail radius */
                 }}>
              <Image 
                src={step.imagePath} 
                alt={`Step ${idx}`} 
                fill 
                className={cn("bg-white dark:bg-zinc-900", isThumbPanoramic ? "object-cover object-top" : "object-cover")} 
                unoptimized 
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white text-center py-1 font-mono backdrop-blur-sm">{idx + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}