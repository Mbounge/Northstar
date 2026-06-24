// components/session-viewer.tsx
"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  BrainCircuit,
  BookOpen,
  Search,
  LayoutTemplate,
  SplitSquareHorizontal,
  MousePointerClick,
  Type,
  Maximize2,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PanoramicMockup } from "@/components/PanoramicMockup";
import { BrowserMockup } from "@/components/BrowserMockup";

function InnerTab({
  active,
  onClick,
  icon,
  label,
  activeColor = "text-[#0066FF] border-[#0066FF]",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-0 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap",
        active
          ? activeColor
          : "text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-white",
      )}
    >
      {icon} {label}
    </button>
  );
}

function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-[20px] p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

const MODAL_WINDOW_RADIUS = 2;

function SectionLabel({
  icon,
  children,
  color = "text-zinc-500 dark:text-zinc-400",
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <h3
      className={cn(
        "font-bold uppercase tracking-widest text-[11px] flex items-center gap-2 mb-3",
        color,
      )}
    >
      {icon}
      {children}
    </h3>
  );
}

export function SessionViewer({ data }: { data: any }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<
    "insights" | "elements" | "context"
  >("insights");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedPathway, setSelectedPathway] = useState<string>("All");

  // Custom states to handle the lazy loading of step-level JSONs on-demand
  const [activeStepData, setActiveStepData] = useState<any>(null);
  const [loadingStepData, setLoadingStepData] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const hasOpenedRef = useRef(false);
  const stepDataCacheRef = useRef<Record<string, any>>({});
  const stepDataPromiseRef = useRef<Record<string, Promise<any>>>({});

  const steps = data.steps || [];

  const getStepPathway = useCallback((step: any) => {
    const pathway = step?.enrichedData?.extraction_meta?.agent_pathway;

    return pathway && pathway !== "Common" ? pathway : "Main Flow";
  }, []);

  const getFilterPathway = useCallback((step: any) => {
    const pathway =
      step?.enrichedData?.extraction_meta?.agent_pathway || step?.enriched_file;

    return pathway && pathway !== "Common" ? pathway : "Main Flow";
  }, []);

  const uniquePathways = useMemo(() => {
    return Array.from(
      new Set(steps.map((s: any) => getStepPathway(s))),
    ) as string[];
  }, [getStepPathway, steps]);

  const visibleStepEntries = useMemo(() => {
    return steps
      .map((step: any, absoluteIdx: number) => ({ step, absoluteIdx }))
      .filter(({ step }: { step: any }) => {
        if (selectedPathway === "All") return true;
        if (selectedPathway === "Main Flow") {
          return getStepPathway(step) === "Main Flow";
        }

        return getFilterPathway(step) === selectedPathway;
      });
  }, [getFilterPathway, getStepPathway, selectedPathway, steps]);

  const activeVisibleIndex = Math.max(
    0,
    visibleStepEntries.findIndex(
      ({ absoluteIdx }: { absoluteIdx: number }) =>
        absoluteIdx === currentIndex,
    ),
  );

  const modalStepEntries = useMemo(() => {
    const start = Math.max(0, currentIndex - MODAL_WINDOW_RADIUS);
    const end = Math.min(steps.length, currentIndex + MODAL_WINDOW_RADIUS + 1);

    return steps.slice(start, end).map((step: any, localIdx: number) => ({
      step,
      absoluteIdx: start + localIdx,
    }));
  }, [currentIndex, steps]);

  const currentStep = steps[currentIndex];

  const buildEnrichedFileUrl = useCallback((step: any) => {
    if (!step?.imagePath) return null;

    const fileName =
      step.enriched_file ||
      `step_${String(step.step).padStart(3, "0")}_enriched.json`;

    return step.imagePath.replace(
      /\/screenshots\/[^\/]+$/,
      `/enriched/${fileName}`,
    );
  }, []);

  const loadStepDetails = useCallback(
    async (step: any) => {
      if (!step) return null;

      if (step.enrichedData) return step.enrichedData;

      const enrichedFileUrl = buildEnrichedFileUrl(step);
      if (!enrichedFileUrl) return null;

      if (enrichedFileUrl in stepDataCacheRef.current) {
        return stepDataCacheRef.current[enrichedFileUrl];
      }

      if (!stepDataPromiseRef.current[enrichedFileUrl]) {
        stepDataPromiseRef.current[enrichedFileUrl] = fetch(enrichedFileUrl)
          .then(async (res) => {
            if (!res.ok) return null;
            return await res.json();
          })
          .then((json) => {
            stepDataCacheRef.current[enrichedFileUrl] = json;
            return json;
          })
          .catch((e) => {
            console.error("Failed to lazy load step details:", e);
            stepDataCacheRef.current[enrichedFileUrl] = null;
            return null;
          });
      }

      return await stepDataPromiseRef.current[enrichedFileUrl];
    },
    [buildEnrichedFileUrl],
  );

  // ─── LAZY LOADING CONTROLLER ───
  useEffect(() => {
    let cancelled = false;

    const fetchStepDetails = async () => {
      if (!currentStep) return;

      const enrichedFileUrl = buildEnrichedFileUrl(currentStep);

      if (currentStep.enrichedData) {
        setActiveStepData(currentStep.enrichedData);
      } else if (
        enrichedFileUrl &&
        enrichedFileUrl in stepDataCacheRef.current
      ) {
        setActiveStepData(stepDataCacheRef.current[enrichedFileUrl]);
      } else {
        setLoadingStepData(true);
        const textData = await loadStepDetails(currentStep);

        if (!cancelled) {
          setActiveStepData(textData);
          setLoadingStepData(false);
        }
      }

      const nextStep = steps[currentIndex + 1];
      const prevStep = steps[currentIndex - 1];

      if (nextStep) void loadStepDetails(nextStep);
      if (prevStep) void loadStepDetails(prevStep);
    };

    fetchStepDetails();

    return () => {
      cancelled = true;
    };
  }, [buildEnrichedFileUrl, currentIndex, currentStep, loadStepDetails, steps]);

  // Bind extracted variables to the lazy-loaded state
  const metadata = activeStepData || {};
  const agentMeta = metadata.extraction_meta || {};
  const intel = metadata.screen_intelligence || {};
  const elements = metadata.elements || {};
  const copy = metadata.copy_analysis || {};

  const allFrictionEvents =
    data.sessionIntel?.friction_report?.friction_events || [];
  const actualStepNumber = agentMeta.timeline_step || currentStep?.step;
  const deterministicEventsThisScreen = allFrictionEvents.filter(
    (e: any) => e.screen_index === actualStepNumber,
  );
  const keyFindings: any[] = Array.isArray(intel.key_findings)
    ? intel.key_findings
    : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToIndex = useCallback(
    (idx: number, behavior: ScrollBehavior = "smooth") => {
      if (scrollRef.current) {
        isProgrammaticScroll.current = true;
        const child = scrollRef.current.querySelector(
          `[data-absolute-index="${idx}"]`,
        ) as HTMLElement | null;
        if (child) {
          scrollRef.current.scrollTo({
            left:
              child.offsetLeft -
              scrollRef.current.offsetWidth / 2 +
              child.offsetWidth / 2,
            behavior,
          });
        }

        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        scrollTimeout.current = setTimeout(
          () => {
            isProgrammaticScroll.current = false;
          },
          behavior === "instant" ? 50 : 800,
        );
      }
    },
    [],
  );

  const handleModalScroll = useCallback(() => {
    if (isProgrammaticScroll.current) return;
    if (!scrollRef.current) return;

    const container = scrollRef.current;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = 0,
      minDiff = Infinity;

    Array.from(container.children).forEach((child) => {
      const el = child as HTMLElement;
      const absoluteIdx = Number(el.dataset.absoluteIndex);
      const diff = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
      if (Number.isFinite(absoluteIdx) && diff < minDiff) {
        minDiff = diff;
        closestIdx = absoluteIdx;
      }
    });

    if (closestIdx !== currentIndex) {
      setCurrentIndex(closestIdx);
    }
  }, [currentIndex]);

  const scrollCarouselToIndex = useCallback((idx: number) => {
    if (carouselRef.current) {
      const child = carouselRef.current.querySelector(
        `[data-absolute-index="${idx}"]`,
      ) as HTMLElement | null;
      if (child) {
        carouselRef.current.scrollTo({
          left:
            child.offsetLeft -
            carouselRef.current.offsetWidth / 2 +
            child.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, []);

  useEffect(() => {
    scrollCarouselToIndex(currentIndex);
  }, [currentIndex, scrollCarouselToIndex]);
  useEffect(() => {
    setActiveTab("insights");
  }, [currentIndex]);

  useLayoutEffect(() => {
    if (isModalOpen && !hasOpenedRef.current) {
      hasOpenedRef.current = true;
      setTimeout(() => {
        scrollToIndex(currentIndex, "instant");
      }, 10);
    } else if (!isModalOpen) {
      hasOpenedRef.current = false;
    }
  }, [isModalOpen, currentIndex, scrollToIndex]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsModalOpen(false);
      if (e.key === "ArrowRight") {
        setCurrentIndex((p) => {
          const next = Math.min(p + 1, steps.length - 1);
          if (isModalOpen) scrollToIndex(next, "smooth");
          return next;
        });
      }
      if (e.key === "ArrowLeft") {
        setCurrentIndex((p) => {
          const next = Math.max(p - 1, 0);
          if (isModalOpen) scrollToIndex(next, "smooth");
          return next;
        });
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [steps.length, isModalOpen, scrollToIndex]);

  if (!currentStep) return null;

  const isCurrentPanoramic =
    currentStep.imagePath.includes("panoramic") ||
    currentStep.imagePath.includes("full_page");

  // Platform Detection
  const isWebRun = currentStep.imagePath.includes("/web/");

  // The main viewer must be anchored, not vertically centered.
  // These constants keep the screenshot frame at the exact same top position
  // when the right-side content changes or when different screenshots load.
  const mainDeviceWidth = isWebRun ? 800 : 270;
  const mainDeviceHeight = isWebRun ? 500 : 585;
  const mainDeviceTop = isWebRun ? 112 : 128;

  return (
    <>
      {/* ─── FULLSCREEN MODAL ─── */}
      {isModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col bg-zinc-100/95 dark:bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 z-50 p-3 bg-white/50 dark:bg-white/10 backdrop-blur-md rounded-full border border-white/50 dark:border-white/20 shadow-lg transition-transform hover:scale-110"
            >
              <X className="w-6 h-6 text-zinc-900 dark:text-white" />
            </button>

            <button
              onClick={() => {
                const p = Math.max(currentIndex - 1, 0);
                setCurrentIndex(p);
                scrollToIndex(p, "smooth");
              }}
              disabled={currentIndex === 0}
              className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 bg-white/80 dark:bg-black/60 backdrop-blur-md rounded-full border border-white/60 dark:border-white/20 shadow-xl z-20 disabled:opacity-30 transition-transform hover:scale-110"
            >
              <ChevronLeft className="w-8 h-8 text-zinc-900 dark:text-white" />
            </button>

            <div
              ref={scrollRef}
              onScroll={handleModalScroll}
              className="flex-1 w-full flex items-center gap-12 overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              // Ensures perfect centering of the carousel items regardless of web/mobile
              style={{ paddingLeft: "50vw", paddingRight: "50vw" }}
            >
              {modalStepEntries.map(
                ({ step, absoluteIdx }: { step: any; absoluteIdx: number }) => {
                  const isActive = absoluteIdx === currentIndex;
                  const isStepWebRun = step.imagePath.includes("/web/");
                  const isPanoramic =
                    step.imagePath.includes("panoramic") ||
                    step.imagePath.includes("full_page");
                  const hasNav =
                    step.imagePath.includes("withnav") ||
                    (!step.imagePath.includes("nonav") && isPanoramic);

                  return (
                    <div
                      key={absoluteIdx}
                      data-absolute-index={absoluteIdx}
                      onClick={() => {
                        setCurrentIndex(absoluteIdx);
                        scrollToIndex(absoluteIdx, "smooth");
                      }}
                      className={cn(
                        "snap-center shrink-0 cursor-pointer flex items-center justify-center transition-all duration-500 ease-out origin-center",
                        isActive
                          ? "scale-100 opacity-100"
                          : "scale-90 opacity-40 hover:opacity-70",
                      )}
                      // EXACT PIXEL DIMENSIONS computed via viewport height to guarantee zero layout shifting
                      style={{
                        height: "80vh",
                        width: isStepWebRun
                          ? "calc(80vh * 1.6)"
                          : "calc(80vh * (9/19.5))",
                        marginLeft: isStepWebRun
                          ? "calc(-40vh * 1.6)"
                          : "calc(-40vh * (9/19.5))", // offsets the 50vw padding for perfect centering
                        marginRight: "48px",
                      }}
                    >
                      {isStepWebRun ? (
                        <div
                          className={cn(
                            "w-full h-full shadow-2xl",
                            isActive && "ring-2 ring-white/20 rounded-[12px]",
                          )}
                        >
                          <BrowserMockup
                            imgUrl={step.imagePath}
                            alt={`Screen ${absoluteIdx + 1}`}
                          />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "relative w-full h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden",
                            isActive && "ring-2 ring-white/20",
                          )}
                          style={{
                            borderWidth: "0.3px",
                            borderColor: "#818A98",
                            borderStyle: "solid",
                            borderRadius: "0.8rem",
                          }}
                        >
                          {isPanoramic ? (
                            <PanoramicMockup
                              imgUrl={step.imagePath}
                              alt={`Screen ${absoluteIdx + 1}`}
                              hasBottomNav={hasNav}
                            />
                          ) : (
                            <Image
                              src={step.imagePath}
                              alt={`Screen ${absoluteIdx + 1}`}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>

            <button
              onClick={() => {
                const n = Math.min(currentIndex + 1, steps.length - 1);
                setCurrentIndex(n);
                scrollToIndex(n, "smooth");
              }}
              disabled={currentIndex === steps.length - 1}
              className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 bg-white/80 dark:bg-black/60 backdrop-blur-md rounded-full border border-white/60 dark:border-white/20 shadow-xl z-20 disabled:opacity-30 transition-transform hover:scale-110"
            >
              <ChevronRight className="w-8 h-8 text-zinc-900 dark:text-white" />
            </button>

            {/* Modal Bottom Header (Cleaned of all raw titles) */}
            <div className="h-[100px] shrink-0 flex items-center justify-center pb-6">
              <div className="bg-white/70 dark:bg-black/70 backdrop-blur-md border border-white/50 dark:border-white/10 text-zinc-700 dark:text-zinc-300 px-8 py-3 rounded-full font-mono text-[14px] shadow-xl flex items-center gap-4">
                <span className="whitespace-nowrap shrink-0 font-bold tracking-widest">
                  SCREEN {actualStepNumber} / {steps.length}
                </span>
                {agentMeta.agent_pathway &&
                  agentMeta.agent_pathway !== "Common" && (
                    <>
                      <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 shrink-0" />
                      <span className="whitespace-nowrap shrink-0 font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                        PATHWAY: {agentMeta.agent_pathway}
                      </span>
                    </>
                  )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ─── MAIN LAYOUT ─── */}
      <div className="flex flex-col flex-1 h-full min-h-0 bg-transparent overflow-hidden">
        <div className="flex flex-1 h-full min-h-0 overflow-hidden">
          {/* LEFT: Phone / Browser */}
          <div
            className={cn(
              "relative flex flex-col shrink-0 h-full min-h-0 border-r border-black/5 dark:border-white/10 overflow-hidden transition-all",
              isWebRun ? "basis-[55%]" : "basis-[45%]",
            )}
          >
            {/* Fixed header. It is absolutely positioned so it never participates in vertical layout reflow. */}
            <div className="absolute top-8 left-0 right-0 h-[36px] flex items-center justify-center gap-2 z-20 pointer-events-none">
              <Badge className="pointer-events-auto bg-white/60 dark:bg-white/10 backdrop-blur-md text-zinc-800 dark:text-zinc-200 border-white/80 dark:border-white/20 font-mono shadow-sm px-4 py-1.5 text-[13px]">
                SCREEN {actualStepNumber} / {steps.length}
              </Badge>

              {agentMeta.agent_pathway &&
                agentMeta.agent_pathway !== "Common" && (
                  <Badge className="pointer-events-auto bg-purple-50/80 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-500/30 uppercase tracking-widest text-[11px] px-3 py-1.5">
                    PATHWAY: {agentMeta.agent_pathway}
                  </Badge>
                )}
            </div>

            {/*
              Fixed screenshot stage.
              Do not use flex items-center vertically here: vertical centering is what makes the
              screenshot appear to jump when the available height is recalculated. The device is
              pinned to mainDeviceTop, so every mobile screen starts at the same Y position.
            */}
            <div
              className="absolute left-0 right-0 z-10"
              style={{ top: mainDeviceTop, height: mainDeviceHeight }}
            >
              <button
                onClick={() => setCurrentIndex((p) => Math.max(p - 1, 0))}
                disabled={currentIndex === 0}
                className="absolute left-6 z-20 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md text-zinc-900 dark:text-white rounded-full border border-white/50 dark:border-white/10 shadow-sm hover:scale-105 transition-all disabled:opacity-30"
                style={{
                  top: mainDeviceHeight / 2,
                  transform: "translateY(-50%)",
                }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* Strictly fixed device wrapper: same top, same width, same height for every screen. */}
              <div
                className="absolute left-1/2 top-0 shrink-0 shadow-2xl group cursor-pointer overflow-hidden transition-shadow duration-300"
                style={{
                  width: mainDeviceWidth,
                  height: mainDeviceHeight,
                  transform: "translateX(-50%)",
                  borderWidth: isWebRun ? "0" : "0.3px",
                  borderColor: "#818A98",
                  borderStyle: "solid",
                  borderRadius: isWebRun ? "12px" : "0.8rem",
                  backgroundColor: "var(--color-background)",
                }}
                onClick={() => setIsModalOpen(true)}
              >
                <div className="absolute inset-0 overflow-hidden">
                  {isWebRun ? (
                    <BrowserMockup
                      imgUrl={currentStep.imagePath}
                      alt={`Screen ${actualStepNumber}`}
                    />
                  ) : isCurrentPanoramic ? (
                    <PanoramicMockup
                      imgUrl={currentStep.imagePath}
                      alt={`Screen ${actualStepNumber}`}
                      hasBottomNav={
                        currentStep.imagePath.includes("withnav") ||
                        (!currentStep.imagePath.includes("nonav") &&
                          isCurrentPanoramic)
                      }
                    />
                  ) : (
                    <Image
                      src={currentStep.imagePath}
                      alt={`Screen ${actualStepNumber}`}
                      fill
                      className="object-cover object-top"
                      unoptimized
                    />
                  )}
                </div>

                <div className="absolute inset-0 z-40 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100">
                  <div className="bg-white/90 backdrop-blur-sm p-4 rounded-full shadow-xl scale-90 group-hover:scale-100 transition-all">
                    <Maximize2 className="w-6 h-6 text-black" />
                  </div>
                </div>
              </div>

              <button
                onClick={() =>
                  setCurrentIndex((p) => Math.min(p + 1, steps.length - 1))
                }
                disabled={currentIndex === steps.length - 1}
                className="absolute right-6 z-20 p-3 bg-white/50 dark:bg-black/50 backdrop-blur-md text-zinc-900 dark:text-white rounded-full border border-white/50 dark:border-white/10 shadow-sm hover:scale-105 transition-all disabled:opacity-30"
                style={{
                  top: mainDeviceHeight / 2,
                  transform: "translateY(-50%)",
                }}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* RIGHT: Intelligence */}
          <div className="relative flex flex-col flex-1 h-full min-h-0 overflow-hidden">
            {/* Absolute loading indicator overlay for fast, silent transitions */}
            {loadingStepData && (
              <div className="absolute top-4 right-8 z-[60] flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 border border-white/10 rounded-full shadow-lg">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-300">
                  Loading
                </span>
              </div>
            )}

            <div className="px-8 pt-6 border-b border-black/5 dark:border-white/10 shrink-0 flex items-center gap-8">
              <InnerTab
                active={activeTab === "insights"}
                onClick={() => setActiveTab("insights")}
                icon={<BrainCircuit className="w-4 h-4" />}
                label="Strategic Insights"
                activeColor="text-[#0066FF] border-[#0066FF]"
              />
              <InnerTab
                active={activeTab === "elements"}
                onClick={() => setActiveTab("elements")}
                icon={<LayoutTemplate className="w-4 h-4" />}
                label="UI Elements"
                activeColor="text-emerald-600 dark:text-emerald-400 border-emerald-600 dark:border-emerald-400"
              />
              <InnerTab
                active={activeTab === "context"}
                onClick={() => setActiveTab("context")}
                icon={<BookOpen className="w-4 h-4" />}
                label="Context & Logs"
                activeColor="text-purple-600 dark:text-purple-400 border-purple-600 dark:border-purple-400"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {/* INSIGHTS */}
              {activeTab === "insights" && (
                <div className="p-8 space-y-8 max-w-2xl mx-auto pb-12">
                  {intel.narrative && (
                    <GlassCard>
                      <div className="text-zinc-800 dark:text-zinc-200 text-[15px] leading-relaxed space-y-4">
                        {intel.narrative
                          .split("\n\n")
                          .map((p: string, i: number) => (
                            <p key={i}>{p}</p>
                          ))}
                      </div>
                    </GlassCard>
                  )}
                  {deterministicEventsThisScreen.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel
                        icon={
                          <SplitSquareHorizontal className="w-4 h-4 text-orange-500" />
                        }
                        color="text-orange-600 dark:text-orange-400"
                      >
                        UX & Friction Points
                      </SectionLabel>
                      {deterministicEventsThisScreen.map(
                        (ev: any, i: number) => (
                          <div
                            key={i}
                            className="bg-white/50 dark:bg-orange-500/10 backdrop-blur-md border border-orange-200/50 dark:border-orange-500/20 rounded-[16px] p-5 flex gap-4 shadow-sm"
                          >
                            <Badge
                              className={cn(
                                "shrink-0 shadow-none border-none",
                                ev.points >= 6
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                                  : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
                              )}
                            >
                              +{ev.points} pts
                            </Badge>
                            <div>
                              <p className="text-sm text-orange-900 dark:text-orange-200 font-bold capitalize mb-1.5">
                                {ev.label.replace(/_/g, " ")}
                              </p>
                              {ev.detail && (
                                <p className="text-[13px] text-zinc-700 dark:text-zinc-400 leading-relaxed">
                                  {ev.detail}
                                </p>
                              )}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                  {keyFindings.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel
                        icon={<Search className="w-4 h-4 text-blue-500" />}
                      >
                        Key Findings
                      </SectionLabel>
                      {keyFindings.map((finding: any, i: number) => (
                        <GlassCard
                          key={i}
                          className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-900/30"
                        >
                          <p className="text-blue-900 dark:text-blue-100 font-semibold mb-3 leading-relaxed text-[14px]">
                            {typeof finding === "string"
                              ? finding
                              : finding.finding}
                          </p>
                          {typeof finding === "object" &&
                            (finding.evidence ||
                              finding.competitive_relevance) && (
                              <div className="text-[13px] space-y-1.5 border-l-2 border-blue-300/60 dark:border-blue-700/50 pl-4">
                                {finding.evidence && (
                                  <p className="text-zinc-600 dark:text-zinc-400">
                                    <span className="text-zinc-800 dark:text-zinc-300 font-semibold">
                                      Evidence:{" "}
                                    </span>
                                    {finding.evidence}
                                  </p>
                                )}
                                {finding.competitive_relevance && (
                                  <p className="text-blue-700 dark:text-blue-400/80">
                                    <span className="font-semibold">
                                      Relevance:{" "}
                                    </span>
                                    {finding.competitive_relevance}
                                  </p>
                                )}
                              </div>
                            )}
                        </GlassCard>
                      ))}
                    </div>
                  )}
                  {!intel.narrative &&
                    deterministicEventsThisScreen.length === 0 &&
                    keyFindings.length === 0 && (
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm italic">
                        No insights available for this screen.
                      </p>
                    )}
                </div>
              )}

              {/* ELEMENTS */}
              {activeTab === "elements" && (
                <div className="p-8 space-y-8 max-w-2xl mx-auto pb-12">
                  {(copy.primary_headline || copy.primary_cta_text) && (
                    <div className="space-y-3">
                      <SectionLabel
                        icon={<Type className="w-4 h-4 text-orange-500" />}
                      >
                        Messaging
                      </SectionLabel>
                      <GlassCard className="space-y-4">
                        {copy.primary_headline && (
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1.5">
                              Headline
                            </span>
                            <p className="text-xl text-zinc-900 dark:text-white font-medium leading-tight">
                              "{copy.primary_headline}"
                            </p>
                          </div>
                        )}
                        {copy.primary_cta_text && (
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1.5">
                              Primary CTA
                            </span>
                            <span className="inline-flex items-center px-4 py-2 rounded-full bg-[#0066FF]/10 text-[#0066FF] dark:text-blue-400 text-sm font-bold border border-[#0066FF]/20">
                              {copy.primary_cta_text}
                            </span>
                          </div>
                        )}
                        {copy.supporting_copy && (
                          <div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1.5">
                              Supporting Copy
                            </span>
                            <p className="text-[14px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {copy.supporting_copy}
                            </p>
                          </div>
                        )}
                      </GlassCard>
                    </div>
                  )}
                  {elements.buttons && elements.buttons.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel
                        icon={
                          <MousePointerClick className="w-4 h-4 text-emerald-500" />
                        }
                        color="text-emerald-700 dark:text-emerald-400"
                      >
                        Interactive Elements
                      </SectionLabel>
                      <div className="flex flex-wrap gap-2">
                        {elements.buttons.map((btn: any, i: number) => {
                          const btnText =
                            typeof btn === "string"
                              ? btn
                              : btn?.text || btn?.label || "Unnamed";
                          return (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium bg-white/60 dark:bg-white/10 border border-white/80 dark:border-white/20 text-zinc-700 dark:text-zinc-300 backdrop-blur-md shadow-sm"
                            >
                              {btnText}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {elements.form_fields && elements.form_fields.length > 0 && (
                    <div className="space-y-3">
                      <SectionLabel
                        icon={
                          <LayoutTemplate className="w-4 h-4 text-indigo-500" />
                        }
                        color="text-indigo-700 dark:text-indigo-400"
                      >
                        Form Fields
                      </SectionLabel>
                      <div className="space-y-2">
                        {elements.form_fields.map((field: any, i: number) => {
                          const label =
                            typeof field === "string"
                              ? field
                              : field?.label || field?.name || `Field ${i + 1}`;
                          const type =
                            typeof field === "object" ? field?.type : null;
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-xl px-4 py-3"
                            >
                              <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                                {label}
                              </span>
                              {type && (
                                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                                  {type}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!copy.primary_headline &&
                    !copy.primary_cta_text &&
                    (!elements.buttons || elements.buttons.length === 0) &&
                    (!elements.form_fields ||
                      elements.form_fields.length === 0) && (
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm italic">
                        No element data extracted for this screen.
                      </p>
                    )}
                </div>
              )}

              {/* CONTEXT */}
              {activeTab === "context" && (
                <div className="p-8 space-y-6 max-w-2xl mx-auto pb-12">
                  <div className="grid grid-cols-2 gap-4">
                    <GlassCard>
                      <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                        Timeline Step
                      </span>
                      <span className="text-2xl font-bold text-[#0066FF] dark:text-blue-400">
                        {actualStepNumber}
                      </span>
                    </GlassCard>
                    <GlassCard>
                      <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                        Screen Type
                      </span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate block capitalize">
                        {metadata.classification?.screen_type ||
                          currentStep.screen_type ||
                          "Unknown"}
                      </span>
                    </GlassCard>
                    {agentMeta.processing_timestamp && (
                      <GlassCard className="col-span-2">
                        <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                          Processed
                        </span>
                        <span className="text-[13px] text-zinc-700 dark:text-zinc-300 font-mono">
                          {agentMeta.processing_timestamp}
                        </span>
                      </GlassCard>
                    )}
                  </div>
                  {currentStep.phase &&
                    currentStep.phase !== "null" &&
                    currentStep.phase !== "UNKNOWN" && (
                      <GlassCard>
                        <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                          Flow Phase
                        </span>
                        <span className="text-[14px] text-zinc-800 dark:text-zinc-200 font-medium capitalize">
                          {currentStep.phase.replace(/_/g, " ")}
                        </span>
                      </GlassCard>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM CAROUSEL */}
        <div className="shrink-0 bg-white/40 dark:bg-black/40 backdrop-blur-xl border-t border-white/60 dark:border-white/10 flex flex-col">
          {uniquePathways.length > 1 && (
            <div className="flex items-center gap-2 px-6 pt-3 pb-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mr-2">
                Pathways:
              </span>
              <button
                onClick={() => setSelectedPathway("All")}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-bold transition-all border",
                  selectedPathway === "All"
                    ? "bg-purple-500 text-white border-purple-400"
                    : "bg-white/50 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-white dark:hover:bg-white/10",
                )}
              >
                All Screens
              </button>
              {uniquePathways.map((pw) => (
                <button
                  key={pw}
                  onClick={() => {
                    setSelectedPathway(pw);
                    const firstIndex = steps.findIndex((s: any) => {
                      const p =
                        s.enrichedData?.extraction_meta?.agent_pathway ||
                        s.enriched_file;
                      return (p && p !== "Common" ? p : "Main Flow") === pw;
                    });
                    if (firstIndex !== -1) setCurrentIndex(firstIndex);
                  }}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-bold transition-all border",
                    selectedPathway === pw
                      ? "bg-purple-500 text-white border-purple-400"
                      : "bg-white/50 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-white dark:hover:bg-white/10",
                  )}
                >
                  {pw}
                </button>
              ))}
            </div>
          )}

          <div className="h-[100px] px-4 flex items-center">
            <div
              ref={carouselRef}
              className="flex items-center gap-3 h-full py-3 overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
              {visibleStepEntries.map(
                ({ step, absoluteIdx }: { step: any; absoluteIdx: number }) => {
                  const isStepWebRun = step.imagePath.includes("/web/");
                  return (
                    <div
                      key={absoluteIdx}
                      data-absolute-index={absoluteIdx}
                      onClick={() => setCurrentIndex(absoluteIdx)}
                      className={cn(
                        "relative h-full shrink-0 overflow-hidden cursor-pointer transition-all duration-300 ease-out",
                        absoluteIdx === currentIndex
                          ? "scale-100 opacity-100 shadow-xl ring-2 ring-[#0066FF]"
                          : "scale-95 opacity-40 hover:opacity-70 shadow-sm",
                      )}
                      style={{
                        aspectRatio: isStepWebRun ? "16/10" : "9/19.5",
                        borderRadius: "0.4rem",
                        borderWidth: "0.3px",
                        borderColor: "#818A98",
                        borderStyle: "solid",
                      }}
                    >
                      <Image
                        src={step.imagePath}
                        alt=""
                        fill
                        sizes="64px"
                        loading="lazy"
                        className={cn(
                          "bg-white dark:bg-zinc-900",
                          step.imagePath.includes("panoramic") ||
                            step.imagePath.includes("full_page")
                            ? "object-cover object-top"
                            : "object-cover",
                        )}
                        unoptimized
                      />
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
