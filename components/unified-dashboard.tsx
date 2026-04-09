// components/unified-dashboard.tsx

"use client";

import { useState } from "react";
import {
  Target,
  MousePointerClick,
  Layers,
  GitMerge,
  LayoutGrid,
  Palette,
  Store,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionViewer } from "@/components/session-viewer";
import { ExecutiveReport } from "@/components/executive-report";
import { FlowsViewer } from "@/components/flows-viewer";
import { BrandKitViewer } from "@/components/brand-kit-viewer";
import { AppStoreViewer } from "@/components/app-store-viewer";
import { cn } from "@/lib/utils";

export function UnifiedDashboard({ appData }: { appData: any }) {
  const [mode, setMode] = useState<"browsing" | "onboarding">(
    appData.browsing ? "browsing" : "onboarding",
  );

  const activeData = appData[mode];
  if (!activeData) return null;

  const hasBrandKit =
    !!appData.browsing?.sessionIntel?.brand_kit || !!appData.apkIntelligence;
  const brandKitData =
    appData.browsing?.sessionIntel?.brand_kit ||
    activeData.sessionIntel?.brand_kit ||
    {};
  const apkIntelligence = appData.apkIntelligence ?? null;

  const subTabs = [
    { value: "overview", icon: Target, label: "Overview" },
    { value: "viewer", icon: MousePointerClick, label: "Screen viewer" },
    { value: "mobbin", icon: Layers, label: "Flows" },
    ...(hasBrandKit
      ? [{ value: "brand_kit", icon: Palette, label: "Brand kit" }]
      : []),
    ...(appData.appStore
      ? [{ value: "app_store", icon: Store, label: "App store" }]
      : []),
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0a0a0a]">
      <Tabs
        defaultValue="overview"
        className="flex flex-col flex-1 overflow-hidden"
      >
        {/* Sub-toolbar: tabs left, mode toggle right */}
        <div className="px-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/40 shrink-0 flex items-center justify-between">
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            {subTabs.map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="
    relative rounded-none bg-transparent px-4 py-2.5
    text-[11px] font-medium
    text-zinc-400 dark:text-zinc-500
    hover:text-zinc-700 dark:hover:text-zinc-300
    data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white
    data-[state=active]:bg-transparent data-[state=active]:shadow-none
    border-0 after:absolute after:bottom-0 after:left-0 after:right-0
    after:h-[1.5px] after:bg-zinc-900 dark:after:bg-white
    after:scale-x-0 data-[state=active]:after:scale-x-100
    after:transition-transform after:duration-200 after:origin-center
    flex items-center gap-1.5 transition-colors duration-150
  "
              >
                <Icon className="w-3 h-3" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Mode toggle — segmented control */}
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-0.5 gap-0.5">
            <button
              disabled={!appData.onboarding}
              onClick={() => setMode("onboarding")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-medium transition-all",
                mode === "onboarding"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
                !appData.onboarding && "opacity-30 cursor-not-allowed",
              )}
            >
              <GitMerge className="w-3 h-3" />
              Onboarding
            </button>
            <button
              disabled={!appData.browsing}
              onClick={() => setMode("browsing")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-medium transition-all",
                mode === "browsing"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
                !appData.browsing && "opacity-30 cursor-not-allowed",
              )}
            >
              <LayoutGrid className="w-3 h-3" />
              App teardown
            </button>
          </div>
        </div>

        <TabsContent
          value="overview"
          className="flex-1 overflow-y-auto m-0 p-6"
        >
          <ExecutiveReport
            key={`exec-${mode}`}
            intel={activeData.sessionIntel}
            steps={activeData.steps}
            mode={mode}
          />
        </TabsContent>
        <TabsContent
          value="viewer"
          className="flex-1 overflow-hidden m-0 flex flex-col"
        >
          <SessionViewer key={`view-${mode}`} data={activeData} />
        </TabsContent>
        <TabsContent
          value="mobbin"
          className="flex-1 overflow-hidden m-0 flex flex-col"
        >
          {activeData.flowsData ? (
            <FlowsViewer
              flowsData={activeData.flowsData}
              appName={appData.appName}
              mode={mode}
            />
          ) : (
            <div className="p-6 text-zinc-400 text-[12px]">No flows data.</div>
          )}
        </TabsContent>
        {hasBrandKit && (
          <TabsContent value="brand_kit" className="flex-1 overflow-y-auto m-0">
            <BrandKitViewer
              brandKit={brandKitData}
              apkIntelligence={apkIntelligence}
            />
          </TabsContent>
        )}
        {appData.appStore && (
          <TabsContent
            value="app_store"
            className="flex-1 overflow-hidden m-0 flex flex-col"
          >
            <AppStoreViewer appStoreData={appData.appStore} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
