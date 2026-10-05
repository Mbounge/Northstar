"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Pause, Play, Sparkles } from "lucide-react";
import { ExecutiveReport } from "@/components/executive-report";

type VideoAsset = {
  role: string;
  kind: string;
  url?: string;
};

function firstThought(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean) return null;
  return clean.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? clean;
}

export function VideoOverview({
  appName, intel, media, steps, onOpenFlows, onOpenResearch,
}: {
  appName: string;
  intel: any;
  media: VideoAsset[];
  steps: any[];
  onOpenFlows: () => void;
  onOpenResearch: () => void;
}) {
  const reel = media.find((asset) => asset.role === "overview_reel" && asset.kind === "video" && asset.url);
  const journey = media.find((asset) => asset.role === "onboarding_journey" && asset.kind === "video" && asset.url);
  const splash = media.find((asset) => asset.role === "app_splash" && asset.kind === "video" && asset.url);
  const [segment, setSegment] = useState<"splash" | "journey">(splash && !reel ? "splash" : "journey");
  const [isPlaying, setIsPlaying] = useState(true);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readSectionRef = useRef<HTMLElement>(null);
  const summaryWasExpanded = useRef(false);
  const researchLoaded = useRef(false);
  const activeAsset = reel ?? (segment === "splash" ? splash : journey);
  const insight = firstThought(intel?.app_architecture?.key_architectural_insight)
    ?? firstThought(intel?.onboarding_strategy?.key_strategic_insight)
    ?? firstThought(intel?.executive_summary);
  const summary = typeof intel?.executive_summary === "string" ? intel.executive_summary.trim() : "";
  const summaryLead = summary.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") || insight;

  useEffect(() => {
    if (researchLoaded.current) return;
    researchLoaded.current = true;
    onOpenResearch();
  }, [onOpenResearch]);

  useEffect(() => {
    if (showFullSummary) {
      summaryWasExpanded.current = true;
      return;
    }
    if (!summaryWasExpanded.current) return;
    const frame = requestAnimationFrame(() => {
      readSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [showFullSummary]);

  if (!journey) return null;

  const handleEnded = () => {
    setSegment((current) => current === "splash" ? "journey" : "splash");
  };

  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) void videoRef.current.play();
    else videoRef.current.pause();
  };

  return (
    <div className="relative isolate w-full pb-20 text-[#211935] dark:text-[#f6f3ff]">
      <div aria-hidden="true" className="pointer-events-none absolute -z-10 -inset-x-8 top-0 h-[710px] bg-[radial-gradient(ellipse_at_76%_38%,rgba(129,111,207,0.18),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_76%_38%,rgba(98,70,179,0.24),transparent_52%)]" />
      <section className="grid min-h-[640px] items-center gap-12 border-b border-[#261c43]/10 pb-14 pt-8 dark:border-white/10 lg:grid-cols-[minmax(0,1fr)_minmax(350px,0.82fr)] lg:gap-20 lg:pt-12">
        <div className="max-w-[610px] lg:pl-2">
          <div className="mb-7 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#7054aa] dark:text-[#bda6ff]">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> App experience <span className="h-1 w-1 rounded-full bg-current opacity-50" /> Onboarding
          </div>
          <h1 className="max-w-[12ch] text-[clamp(2.8rem,5vw,5.2rem)] font-semibold leading-[1.04] tracking-[-0.065em]">{appName}, from the first tap.</h1>
          <p className="mt-7 max-w-[54ch] text-[16px] leading-[1.7] text-[#49425e] dark:text-[#c4bdd8] sm:text-[17px]">{insight || "Watch the captured onboarding experience, then explore the screens and research behind it."}</p>
          <button type="button" onClick={onOpenFlows} className="group mt-9 inline-flex min-h-11 items-center gap-3 rounded-full bg-[#5b3da5] px-6 text-[13px] font-semibold text-white transition-colors hover:bg-[#4b2f91] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#5b3da5] dark:bg-[#ad92f7] dark:text-[#160c31] dark:hover:bg-[#c2adff]">
            Explore the full flow <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
        <div className="flex items-center justify-center py-3">
          <div className="relative w-[230px] sm:w-[258px] xl:w-[280px]">
            <div aria-hidden="true" className="pointer-events-none absolute -inset-9 rounded-[5rem] bg-[radial-gradient(ellipse_at_center,rgba(139,112,229,0.15),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(135,95,234,0.28),transparent_70%)]" />
            <div className="group relative overflow-hidden rounded-[2.9rem] border-[7px] border-[#1b1a28] bg-[#11121d] ring-1 ring-[#5a526d]/45 dark:border-[#080812] dark:ring-white/25 dark:shadow-[0_28px_75px_rgba(34,18,80,0.28)]">
              <video key={activeAsset?.url} ref={videoRef} src={activeAsset?.url} aria-label={`${appName} onboarding film`} className="aspect-[9/20] w-full bg-black object-cover" autoPlay muted loop={Boolean(reel || !splash)} playsInline preload="auto" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={handleEnded} />
              <button type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause onboarding film" : "Play onboarding film"} className={`absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-md transition-opacity hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [@media(hover:none)]:opacity-100 ${isPlaying ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "opacity-100"}`}>
                {isPlaying ? <Pause aria-hidden="true" className="h-3.5 w-3.5 fill-current" /> : <Play aria-hidden="true" className="ml-0.5 h-3.5 w-3.5 fill-current" />}
              </button>
            </div>
          </div>
        </div>
      </section>
      <section ref={readSectionRef} className="grid scroll-mt-6 gap-8 border-b border-[#261c43]/10 py-16 dark:border-white/10 lg:grid-cols-[minmax(230px,0.36fr)_minmax(0,1fr)] lg:gap-16" aria-labelledby="overview-read-heading">
        <div>
          <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7054aa] dark:text-[#bda6ff]">The read</div>
          <h2 id="overview-read-heading" className="max-w-[13ch] text-[clamp(2rem,3vw,3.25rem)] font-semibold leading-[1.12] tracking-[-0.05em]">What the experience reveals.</h2>
        </div>
        <div className="lg:pt-8">
          <p className="max-w-[68ch] text-[17px] leading-[1.8] text-[#39314d] dark:text-[#d8d0e5]">{summaryLead}</p>
          {summary && summary !== summaryLead && <>
            {showFullSummary && <p className="mt-5 max-w-[75ch] whitespace-pre-line text-[14px] leading-[1.8] text-[#625a71] dark:text-[#aba3bd]">{summary.slice(summaryLead?.length ?? 0).trim()}</p>}
            <button type="button" onClick={() => setShowFullSummary((open) => !open)} className="mt-5 text-[13px] font-semibold text-[#694aa9] hover:underline focus-visible:underline dark:text-[#c4adff]">{showFullSummary ? "Show less" : "Read full summary"}</button>
          </>}
        </div>
      </section>
      <section className="pt-16" aria-labelledby="research-heading">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7054aa] dark:text-[#bda6ff]">Research & evidence</div>
            <h2 id="research-heading" className="text-[clamp(2rem,3vw,3.25rem)] font-semibold leading-tight tracking-[-0.05em]">Explore the analysis.</h2>
          </div>
          <button type="button" onClick={onOpenFlows} className="inline-flex items-center gap-2 pb-1 text-[13px] font-semibold text-[#694aa9] hover:underline focus-visible:underline dark:text-[#c4adff]">View all screens <ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
        </div>
        <ExecutiveReport intel={intel} mode="onboarding" steps={steps} presentation="editorial" />
      </section>
    </div>
  );
}
