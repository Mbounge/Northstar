"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { simulatorForApp } from "@/lib/preview/simulator-registry";

export function ProductAppPreview({ appName, active }: { appName: string; active: boolean }) {
  const [opened, setOpened] = useState(active);
  const simulator = simulatorForApp(appName);

  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  return <section className="relative mx-auto mb-16 w-full max-w-[1450px] text-[#252438] dark:text-[#f3f1fb]">
    <h2 className="sr-only">{appName} interactive app preview</h2>
    {simulator ? <>
      <div className="mb-3 flex justify-end px-3">
        <a href={simulator.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
          Open full preview <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
      {opened && <iframe title={`${appName} interactive simulator`} src={simulator.embedPath} className="block h-[900px] w-full border-0 bg-transparent" />}
    </> : <div className="flex min-h-64 flex-col justify-center px-7 py-14 sm:px-10">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8666df] dark:text-[#af9af5]">App preview</p>
      <h3 className="m-0 text-2xl font-semibold tracking-[-0.04em]">Interactive simulator in preparation</h3>
      <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-[#6b687b] dark:text-[#a7a4b8]">This app’s simulator will appear here after its page families pass visual and interaction review.</p>
    </div>}
  </section>;
}
