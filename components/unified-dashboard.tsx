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
        <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 shrink-0 mb-8">
          {header}
          <div className="relative flex items-center justify-center px-10 pb-6 pt-2">
            <TabsList className="!bg-transparent h-auto p-0 gap-12 !border-none !shadow-none flex items-center">
              {subTabs.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="
                    !bg-transparent !border-none !shadow-none px-0 py-2 rounded-none
                    text-[15px] font-medium text-zinc-500 dark:text-zinc-400
                    hover:text-zinc-900 dark:hover:text-zinc-200
                    data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white
                    data-[state=active]:!shadow-none transition-colors
                  "
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {appData.onboarding && appData.browsing && (
              <div className="absolute right-10">
                <button
                  onClick={() => setMode(mode === 'browsing' ? 'onboarding' : 'browsing')}
                  className="text-[12px] font-bold uppercase tracking-wider text-[#0066FF] dark:text-blue-500 bg-white/80 dark:bg-black/60 px-6 py-2.5 rounded-full hover:bg-white transition-all border border-white/60 dark:border-white/10"
                >
                  VIEW {mode === 'browsing' ? 'ONBOARDING' : 'TEARDOWN'}
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
              <BrandKitViewer brandKit={brandKitData} apkIntelligence={apkIntelligence} />
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