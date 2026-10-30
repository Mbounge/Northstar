"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, Compass, Heart, Home, Mail, MessageSquare, RotateCcw, Search, SlidersHorizontal, Sparkles, Timer, UserRound } from "lucide-react";
import { simulatorForApp } from "@/lib/preview/simulator-registry";
import { previewPresentationForApp } from "@/lib/preview/preview-presentation";
import { AppPhoneFrame } from "./app-phone-frame";

const sectionIcons = { compass: Compass, home: Home, search: Search, sparkles: Sparkles, chat: MessageSquare, profile: UserRound, mail: Mail, sliders: SlidersHorizontal, bell: Bell, timer: Timer, heart: Heart };

export function ProductAppPreview({ appName, active }: { appName: string; active: boolean }) {
  const presentation = previewPresentationForApp(appName);
  const [opened, setOpened] = useState(active);
  const [selectedSection, setSelectedSection] = useState(presentation?.initialSection ?? "onboarding");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const deviceHostRef = useRef<HTMLDivElement>(null);
  const [deviceScale, setDeviceScale] = useState(presentation?.rawViewport?.scale ?? 1);
  const [frameReady, setFrameReady] = useState(false);
  const [frameSlow, setFrameSlow] = useState(false);
  const [frameStarted, setFrameStarted] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const simulator = simulatorForApp(appName);

  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  useEffect(() => {
    const host = deviceHostRef.current, viewport = presentation?.rawViewport;
    if (!host || !viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setDeviceScale(Math.min(viewport.scale, Math.max(0, entry.contentRect.width - 6) / viewport.width));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [presentation, opened]);

  useEffect(() => {
    if (!presentation) return;
    setSelectedSection(presentation.initialSection);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === presentation.sectionMessage && presentation.sections.some(section => section.id === event.data.section)) {
        setSelectedSection(event.data.section);
        setFrameReady(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [presentation]);

  useEffect(() => {
    if (!active || !opened || !simulator) return;
    // Start the first iframe navigation after its force-mounted tab is visibly
    // laid out. Retain that frame and all app state on subsequent tab switches.
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setFrameStarted(true));
    });
    const timeout = window.setTimeout(() => setFrameSlow(true), 10000);
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); window.clearTimeout(timeout); };
  }, [active, opened, simulator, frameVersion]);

  const restartPreview = () => {
    setSelectedSection(presentation?.initialSection ?? "onboarding");
    setFrameReady(false); setFrameSlow(false); setFrameVersion(value => value + 1);
  };

  const onFrameLoad = () => {
    try {
      if (iframeRef.current?.contentDocument?.URL === "about:blank") return;
    } catch { /* The authenticated route may briefly be navigating. */ }
    // A loaded document can still be hydrating (or be an auth redirect). The
    // registered app confirms readiness through its actual section message.
    if (!presentation) setFrameReady(true);
  };
  const frameLoading = !frameReady && opened ? <div role="status" className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-xs text-[#847b98] dark:text-[#bcb0d1]">
    Loading {appName} preview…
    {frameSlow && <button type="button" className="pointer-events-auto rounded-full border border-current/25 px-4 py-2" onClick={restartPreview}>Retry preview</button>}
  </div> : null;

  const navigatePreview = (section: string) => {
    if (!presentation?.sections.some(item => item.id === section)) return;
    setSelectedSection(section);
    iframeRef.current?.contentWindow?.postMessage({ type: presentation.navigateMessage, section }, window.location.origin);
  };

  return <section data-app-preview-layout="" className="relative mx-auto mb-16 w-full max-w-[1450px] text-[#252438] dark:text-[#f3f1fb]">
    <h2 className="sr-only">{appName} interactive app preview</h2>
    {simulator ? <div className="relative">
      <div className="relative z-10 mx-auto max-w-[440px] px-8 pt-10 text-center min-[900px]:pointer-events-none min-[900px]:absolute min-[900px]:inset-y-0 min-[900px]:left-[clamp(32px,5vw,80px)] min-[900px]:mx-0 min-[900px]:flex min-[900px]:w-[min(25%,280px)] min-[900px]:flex-col min-[900px]:justify-center min-[900px]:p-0 min-[900px]:text-left">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[#755acb] dark:text-[#b7a2ff]">Interactive preview</p>
        <h3 className="m-0 text-[clamp(27px,2.6vw,38px)] font-semibold leading-[1.1] tracking-[-0.055em]">Take a closer look.</h3>
        <p className="mb-0 mt-4 text-sm leading-6 text-[#656477] dark:text-[#aaa9c0]">Tap through {appName} at your own pace and get a feel for the experience behind the screens.</p>
      </div>
      {presentation && <nav aria-label={`${appName} preview sections`} className="relative z-10 mx-auto mt-7 w-[calc(100%-32px)] max-w-[480px] rounded-[24px] border border-[#b6a1f1]/25 bg-white/75 p-3 shadow-[0_16px_48px_#12123412] backdrop-blur-xl dark:border-white/10 dark:bg-[#181829]/80 dark:shadow-[0_16px_48px_#00000033] min-[1150px]:absolute min-[1150px]:right-[clamp(28px,5vw,80px)] min-[1150px]:top-1/2 min-[1150px]:m-0 min-[1150px]:w-[min(25%,270px)] min-[1150px]:-translate-y-1/2">
        <div className="px-3 pb-3 pt-2">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.22em] text-[#7659cb] dark:text-[#b8a2ff]">Navigate the preview</p>
          <p className="mb-0 mt-1 text-xs text-[#777489] dark:text-[#aaa8bb]">{presentation.navigationHint}</p>
        </div>
        <div className="grid grid-cols-2 gap-1 min-[1150px]:grid-cols-1">
          {presentation.sections.map(({ id, label, icon }, index) => {
            const Icon = sectionIcons[icon];
            const current = selectedSection === id;
            return <button key={id} type="button" aria-current={current ? "page" : undefined} onClick={() => navigatePreview(id)} disabled={!frameReady} className={`group flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[13px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9176e7] ${index === 1 ? "min-[1150px]:mt-3" : ""} ${current ? "bg-[#eee9ff] text-[#5637bb] dark:bg-[#8e6dff]/20 dark:text-[#d6c9ff]" : "text-[#555266] hover:bg-[#f2eff9] hover:text-[#5637bb] dark:text-[#c6c3d2] dark:hover:bg-white/10 dark:hover:text-white"}`}>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${current ? "bg-white/80 dark:bg-[#9477ee]/25" : "bg-[#f0edf7] dark:bg-white/5"}`}><Icon size={17} strokeWidth={1.9} /></span>
              <span className="min-w-0 flex-1">{label}</span>
              <ArrowRight size={14} className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${current ? "opacity-80" : "opacity-35"}`} />
            </button>;
          })}
        </div>
        <div className="mx-3 mt-3 border-t border-[#8975ac]/15 pt-3 dark:border-white/10">
          <button type="button" aria-label={`Restart ${appName} preview`} onClick={restartPreview} disabled={!frameStarted} className="inline-flex min-h-8 items-center gap-2 rounded-lg text-[11px] font-semibold text-[#777489] transition-colors hover:text-[#5637bb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9176e7] disabled:opacity-40 dark:text-[#aaa8bb] dark:hover:text-white"><RotateCcw size={13} />Restart preview</button>
        </div>
        {presentation.scope && <p className="m-0 px-3 pb-2 pt-3 text-[10px] leading-4 text-[#777489] dark:text-[#aaa8bb]">{presentation.scope}</p>}
      </nav>}
      {frameLoading}
      {opened && (presentation?.rawViewport ? <div ref={deviceHostRef} data-app-preview-device="" className="flex h-[660px] items-center justify-center">
        <AppPhoneFrame variant="interactive" width={presentation.rawViewport.width * deviceScale + 6} height={presentation.rawViewport.height * deviceScale + 6}>
          {frameStarted && <iframe key={frameVersion} ref={iframeRef} onLoad={onFrameLoad} title={`${appName} interactive simulator`} src={simulator.embedPath} style={{ width: presentation.rawViewport.width, height: presentation.rawViewport.height, transform: `scale(${deviceScale})`, transformOrigin: "top left" }} className="block border-0 bg-transparent" />}
        </AppPhoneFrame>
      </div> : frameStarted ? <iframe key={frameVersion} ref={iframeRef} onLoad={onFrameLoad} title={`${appName} interactive simulator`} src={simulator.embedPath} className="block h-[660px] w-full border-0 bg-transparent" /> : <div aria-hidden="true" className="h-[660px]" />)}
    </div> : <div className="flex min-h-64 flex-col justify-center px-7 py-14 sm:px-10">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8666df] dark:text-[#af9af5]">App preview</p>
      <h3 className="m-0 text-2xl font-semibold tracking-[-0.04em]">Interactive simulator in preparation</h3>
      <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-[#6b687b] dark:text-[#a7a4b8]">This app’s simulator will appear here after its page families pass visual and interaction review.</p>
    </div>}
  </section>;
}
