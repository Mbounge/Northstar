"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Compass, Home, MessageSquare, Search, Sparkles, UserRound } from "lucide-react";
import { simulatorForApp } from "@/lib/preview/simulator-registry";
import { GRAET_PREVIEW_NAVIGATE, GRAET_PREVIEW_SECTION, graetPreviewSections, isGraetPreviewSection, type GraetPreviewSection } from "@/lib/preview/graet-navigation";

const sectionIcons = { onboarding: Compass, home: Home, explore: Search, ai: Sparkles, chat: MessageSquare, profile: UserRound };

export function ProductAppPreview({ appName, active }: { appName: string; active: boolean }) {
  const [opened, setOpened] = useState(active);
  const [selectedSection, setSelectedSection] = useState<GraetPreviewSection>("onboarding");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const simulator = simulatorForApp(appName);

  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  useEffect(() => {
    if (simulator?.slug !== "graet") return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === GRAET_PREVIEW_SECTION && isGraetPreviewSection(event.data.section)) {
        setSelectedSection(event.data.section);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [simulator?.slug]);

  const navigatePreview = (section: GraetPreviewSection) => {
    setSelectedSection(section);
    iframeRef.current?.contentWindow?.postMessage({ type: GRAET_PREVIEW_NAVIGATE, section }, window.location.origin);
  };

  return <section className="relative mx-auto mb-16 w-full max-w-[1450px] text-[#252438] dark:text-[#f3f1fb]">
    <h2 className="sr-only">{appName} interactive app preview</h2>
    {simulator ? <div className="relative">
      <div className="relative z-10 mx-auto max-w-[440px] px-8 pt-10 text-center min-[900px]:pointer-events-none min-[900px]:absolute min-[900px]:inset-y-0 min-[900px]:left-[clamp(32px,5vw,80px)] min-[900px]:mx-0 min-[900px]:flex min-[900px]:w-[min(25%,280px)] min-[900px]:flex-col min-[900px]:justify-center min-[900px]:p-0 min-[900px]:text-left">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[#755acb] dark:text-[#b7a2ff]">Interactive preview</p>
        <h3 className="m-0 text-[clamp(27px,2.6vw,38px)] font-semibold leading-[1.1] tracking-[-0.055em]">Take a closer look.</h3>
        <p className="mb-0 mt-4 text-sm leading-6 text-[#656477] dark:text-[#aaa9c0]">Tap through {appName} at your own pace and get a feel for the experience behind the screens.</p>
      </div>
      {simulator.slug === "graet" && <nav aria-label="GRAET preview sections" className="relative z-10 mx-auto mt-7 w-[calc(100%-32px)] max-w-[480px] rounded-[24px] border border-[#b6a1f1]/25 bg-white/75 p-3 shadow-[0_16px_48px_#12123412] backdrop-blur-xl dark:border-white/10 dark:bg-[#181829]/80 dark:shadow-[0_16px_48px_#00000033] min-[1150px]:absolute min-[1150px]:right-[clamp(28px,5vw,80px)] min-[1150px]:top-1/2 min-[1150px]:m-0 min-[1150px]:w-[min(25%,270px)] min-[1150px]:-translate-y-1/2">
        <div className="px-3 pb-3 pt-2">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.22em] text-[#7659cb] dark:text-[#b8a2ff]">Navigate the preview</p>
          <p className="mb-0 mt-1 text-xs text-[#777489] dark:text-[#aaa8bb]">Jump to any part of GRAET</p>
        </div>
        <div className="grid grid-cols-2 gap-1 min-[1150px]:grid-cols-1">
          {graetPreviewSections.map(({ id, label }, index) => {
            const Icon = sectionIcons[id];
            const current = selectedSection === id;
            return <button key={id} type="button" aria-current={current ? "page" : undefined} onClick={() => navigatePreview(id)} className={`group flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9176e7] ${index === 1 ? "min-[1150px]:mt-3" : ""} ${current ? "bg-[#eee9ff] text-[#5637bb] dark:bg-[#8e6dff]/20 dark:text-[#d6c9ff]" : "text-[#555266] hover:bg-[#f2eff9] hover:text-[#5637bb] dark:text-[#c6c3d2] dark:hover:bg-white/10 dark:hover:text-white"}`}>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${current ? "bg-white/80 dark:bg-[#9477ee]/25" : "bg-[#f0edf7] dark:bg-white/5"}`}><Icon size={17} strokeWidth={1.9} /></span>
              <span className="min-w-0 flex-1">{label}</span>
              <ArrowRight size={14} className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${current ? "opacity-80" : "opacity-35"}`} />
            </button>;
          })}
        </div>
      </nav>}
      {opened && <iframe ref={iframeRef} title={`${appName} interactive simulator`} src={simulator.embedPath} className="block h-[660px] w-full border-0 bg-transparent" />}
    </div> : <div className="flex min-h-64 flex-col justify-center px-7 py-14 sm:px-10">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8666df] dark:text-[#af9af5]">App preview</p>
      <h3 className="m-0 text-2xl font-semibold tracking-[-0.04em]">Interactive simulator in preparation</h3>
      <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-[#6b687b] dark:text-[#a7a4b8]">This app’s simulator will appear here after its page families pass visual and interaction review.</p>
    </div>}
  </section>;
}
