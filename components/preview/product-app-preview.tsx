"use client";

import { useEffect, useState } from "react";
import { simulatorForApp } from "@/lib/preview/simulator-registry";

export function ProductAppPreview({ appName, active }: { appName: string; active: boolean }) {
  const [opened, setOpened] = useState(active);
  const simulator = simulatorForApp(appName);

  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  return <section className="relative mx-auto mb-16 w-full max-w-[1450px] text-[#252438] dark:text-[#f3f1fb]">
    <h2 className="sr-only">{appName} interactive app preview</h2>
    {simulator ? <div className="relative">
      <div className="relative z-10 mx-auto max-w-[440px] px-8 pt-10 text-center min-[900px]:pointer-events-none min-[900px]:absolute min-[900px]:inset-y-0 min-[900px]:left-[clamp(32px,5vw,80px)] min-[900px]:mx-0 min-[900px]:flex min-[900px]:w-[min(25%,280px)] min-[900px]:flex-col min-[900px]:justify-center min-[900px]:p-0 min-[900px]:text-left">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[#755acb] dark:text-[#b7a2ff]">Interactive preview</p>
        <h3 className="m-0 text-[clamp(27px,2.6vw,38px)] font-semibold leading-[1.1] tracking-[-0.055em]">Take a closer look.</h3>
        <p className="mb-0 mt-4 text-sm leading-6 text-[#656477] dark:text-[#aaa9c0]">Tap through {appName} at your own pace and get a feel for the experience behind the screens.</p>
      </div>
      {opened && <iframe title={`${appName} interactive simulator`} src={simulator.embedPath} className="block h-[660px] w-full border-0 bg-transparent" />}
    </div> : <div className="flex min-h-64 flex-col justify-center px-7 py-14 sm:px-10">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8666df] dark:text-[#af9af5]">App preview</p>
      <h3 className="m-0 text-2xl font-semibold tracking-[-0.04em]">Interactive simulator in preparation</h3>
      <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-[#6b687b] dark:text-[#a7a4b8]">This app’s simulator will appear here after its page families pass visual and interaction review.</p>
    </div>}
  </section>;
}
