// components/unified-dashboard.tsx
"use client";

import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionViewer } from "@/components/session-viewer";
import { ExecutiveReport } from "@/components/executive-report";
import { FlowsViewer } from "@/components/flows-viewer";
import { BrandKitViewer } from "@/components/brand-kit-viewer";
import { AppStoreViewer } from "@/components/app-store-viewer";

export function UnifiedDashboard({ 
  appData, 
  header,
  tenantId,
}: { 
  appData: any; 
  header: React.ReactNode;
  tenantId: string;
}) {
  const [mode, setMode] = useState<"browsing" | "onboarding">(appData.browsing ? "browsing" : "onboarding");
  const activeData = appData[mode];
  if (!activeData) return null;

  const hasBrandKit = !!appData.browsing?.sessionIntel?.brand_kit || !!appData.apkIntelligence;
  const brandKitData = appData.browsing?.sessionIntel?.brand_kit || activeData.sessionIntel?.brand_kit || {};
  const apkIntelligence = appData.apkIntelligence ?? null;

  const subTabs = [
    { value: "overview", label: "Overview" },
    { value: "viewer", label: "Screen viewer" },
    { value: "mobbin", label: "Flows" },
    ...(hasBrandKit ? [{ value: "brand_kit", label: "Brand kit" }] : []),
    ...(appData.appStore ? [{ value: "app_store", label: "App store" }] : []),
  ];

  return (
    // No h-full, no overflow-hidden — sits in normal document flow
    <div className="flex flex-col">
      <Tabs defaultValue="overview" className="flex flex-col">

        {/* ── IDENTITY + NAV HEADER ── */}
        <div className="w-full h-[200px] bg-white/20 dark:bg-white/5 flex flex-col justify-between shrink-0 mb-8 relative border border-white/20 dark:border-white/10 backdrop-blur-md">
          
          <div className="flex-1 w-full relative">
            {header}
          </div>
          
          {/* Bottom Section: Subnav row */}
          <div className="relative flex items-end justify-center px-10 h-[64px] shrink-0 border-none">
            <TabsList className="!bg-transparent h-auto p-0 gap-12 !border-none !shadow-none flex items-center">
              {subTabs.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="
                    relative !bg-transparent !shadow-none rounded-none px-0 pb-[20px] !border-none
                    outline-none focus:outline-none focus-visible:ring-0 cursor-pointer
                    text-[15px] font-[400] text-[#747474] dark:text-zinc-400
                    hover:text-[#000000] dark:hover:text-white
                    data-[state=active]:text-[#000000] dark:data-[state=active]:text-white
                    data-[state=active]:font-[600]
                    after:absolute after:-bottom-[1px] after:left-0 after:right-0 
                    after:h-[2px] after:rounded-t-full after:bg-transparent
                    data-[state=active]:after:bg-[#000000] dark:data-[state=active]:after:bg-white
                    transition-all
                  "
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {appData.onboarding && appData.browsing && (
              <div className="absolute right-10 top-1/2 -translate-y-1/2">
                <button
                  onClick={() => setMode(mode === 'browsing' ? 'onboarding' : 'browsing')}
                  // Restored authentic frosted glass: bg-white/20, white/60 border, backdrop-blur
                  className="h-9 px-5 flex items-center gap-2 rounded-full backdrop-blur-md bg-white/20 dark:bg-white/5 border border-white/60 dark:border-white/20 hover:bg-white/40 dark:hover:bg-white/10 transition-all duration-200 group cursor-pointer"
                >
                  <span className="text-zinc-700 dark:text-zinc-300 text-[12px] font-semibold tracking-wide">
                    {mode === 'browsing' ? 'View Onboarding' : 'View Teardown'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── OVERVIEW — scrolls with page ── */}
        <TabsContent value="overview" className="m-0">
          <div className="max-w-6xl mx-auto w-full pb-16">
            <ExecutiveReport key={`exec-${mode}`} intel={activeData.sessionIntel} steps={activeData.steps} mode={mode} />
          </div>
        </TabsContent>

        {/* ── SCREEN VIEWER — fixed height, internal scroll ── */}
        <TabsContent value="viewer" className="m-0">
          <div className="relative bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
            <SessionViewer key={`view-${mode}`} data={activeData} />
          </div>
        </TabsContent>

        {/* ── FLOWS — fixed height, internal scroll ── */}
        <TabsContent value="mobbin" className="m-0">
          <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
            {activeData.flowsData ? (
              <FlowsViewer
                key={`flows-${mode}`}
                flowsData={activeData.flowsData}
                appName={appData.appName}
                tenantId={tenantId}
                mode={mode}
              />
            ) : (
              <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                No flows data available.
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── BRAND KIT — scrolls with page ── */}
        {hasBrandKit && (
          <TabsContent value="brand_kit" className="m-0">
            <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-16 p-8">
              <BrandKitViewer 
                brandKit={brandKitData} 
                apkIntelligence={apkIntelligence} 
                appIconUrl={appData.iconUrl} 
              />
            </div>
          </TabsContent>
        )}

        {/* ── APP STORE — scrolls with page ── */}
        {appData.appStore && (
          <TabsContent value="app_store" className="m-0">
            <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-16" style={{ minHeight: 600 }}>
              <AppStoreViewer appStoreData={appData.appStore} />
            </div>
          </TabsContent>
        )}

      </Tabs>
    </div>
  );
}