// components/unified-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionViewer } from "@/components/session-viewer";
import { ExecutiveReport } from "@/components/executive-report";
import { FlowsViewer } from "@/components/flows-viewer";
import { BrandKitViewer } from "@/components/brand-kit-viewer";
import { AppStoreViewer } from "@/components/app-store-viewer";
import { Smartphone, Globe } from "lucide-react";

type Platform = "mobile" | "web";
type Mode = "browsing" | "onboarding";

function makeSessionKey(platform: Platform, mode: Mode) {
  return `${platform}:${mode}`;
}

export function UnifiedDashboard({
  appData,
  header,
  tenantId,
}: {
  appData: any;
  header: React.ReactNode;
  tenantId: string;
}) {
  const hasMobile = !!appData.mobile;
  const hasWeb = !!appData.web;

  const defaultPlatform: Platform = hasMobile ? "mobile" : "web";

  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [mode, setMode] = useState<Mode>(
    appData[defaultPlatform]?.browsing ? "browsing" : "onboarding"
  );

  const [activeTab, setActiveTab] = useState("overview");

  const [sessionCache, setSessionCache] = useState<Record<string, any>>({});
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const [flowsLoading, setFlowsLoading] = useState(false);
  const [flowsError, setFlowsError] = useState<string | null>(null);

  const [appStoreData, setAppStoreData] = useState<any>(appData.appStore ?? null);
  const [appStoreLoading, setAppStoreLoading] = useState(false);
  const [appStoreError, setAppStoreError] = useState<string | null>(null);

  const [apkIntelligenceData, setApkIntelligenceData] = useState<any>(
    appData.apkIntelligence ?? null
  );
  const [apkLoading, setApkLoading] = useState(false);
  const [apkError, setApkError] = useState<string | null>(null);

  const viewerRequestStartedRef = useRef<Record<string, boolean>>({});
  const flowsRequestStartedRef = useRef<Record<string, boolean>>({});
  const appStoreRequestStartedRef = useRef(false);
  const apkRequestStartedRef = useRef(false);

  const activePlatformData = appData[platform];
  const initialActiveData = activePlatformData ? activePlatformData[mode] : null;
  const activeSessionKey = makeSessionKey(platform, mode);
  const loadedSessionData = sessionCache[activeSessionKey] || null;

  const activeData = useMemo(() => {
    if (!initialActiveData && !loadedSessionData) return null;

    return {
      ...(initialActiveData || {}),
      ...(loadedSessionData || {}),
      sessionIntel:
        loadedSessionData?.sessionIntel ||
        initialActiveData?.sessionIntel ||
        null,
      summary:
        loadedSessionData?.summary ||
        initialActiveData?.summary ||
        null,
      steps:
        loadedSessionData?.steps ||
        initialActiveData?.steps ||
        [],
      flowsData:
        loadedSessionData?.flowsData ||
        initialActiveData?.flowsData ||
        null,
    };
  }, [initialActiveData, loadedSessionData]);

  const encodedAppName = encodeURIComponent(appData.appName);

  useEffect(() => {
    if (activeTab !== "viewer") return;
    if (sessionCache[activeSessionKey]?.steps?.length > 0) return;
    if (viewerRequestStartedRef.current[activeSessionKey]) return;

    viewerRequestStartedRef.current[activeSessionKey] = true;
    setViewerLoading(true);
    setViewerError(null);

    async function loadViewerData() {
      try {
        const params = new URLSearchParams({
          platform,
          mode,
        });

        const res = await fetch(`/api/apps/${encodedAppName}/viewer?${params.toString()}`, {
          method: "GET",
          credentials: "same-origin",
        });

        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load viewer data");
        }

        setSessionCache(prev => ({
          ...prev,
          [activeSessionKey]: {
            ...(prev[activeSessionKey] || {}),
            ...(payload.data || {}),
          },
        }));
      } catch (error) {
        console.error("Failed to load viewer data:", error);
        setViewerError(
          error instanceof Error ? error.message : "Failed to load viewer data"
        );
        viewerRequestStartedRef.current[activeSessionKey] = false;
      } finally {
        setViewerLoading(false);
      }
    }

    loadViewerData();
  }, [activeTab, activeSessionKey, encodedAppName, mode, platform, sessionCache]);

  useEffect(() => {
    if (activeTab !== "mobbin") return;
    if (sessionCache[activeSessionKey]?.flowsData) return;
    if (flowsRequestStartedRef.current[activeSessionKey]) return;

    flowsRequestStartedRef.current[activeSessionKey] = true;
    setFlowsLoading(true);
    setFlowsError(null);

    async function loadFlowsData() {
      try {
        const params = new URLSearchParams({
          platform,
          mode,
        });

        const res = await fetch(`/api/apps/${encodedAppName}/flows?${params.toString()}`, {
          method: "GET",
          credentials: "same-origin",
        });

        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load flows data");
        }

        setSessionCache(prev => ({
          ...prev,
          [activeSessionKey]: {
            ...(prev[activeSessionKey] || {}),
            ...(payload.data || {}),
          },
        }));
      } catch (error) {
        console.error("Failed to load flows data:", error);
        setFlowsError(
          error instanceof Error ? error.message : "Failed to load flows data"
        );
        flowsRequestStartedRef.current[activeSessionKey] = false;
      } finally {
        setFlowsLoading(false);
      }
    }

    loadFlowsData();
  }, [activeTab, activeSessionKey, encodedAppName, mode, platform, sessionCache]);

  useEffect(() => {
    if (activeTab !== "app_store") return;
    if (appStoreData) return;
    if (appStoreRequestStartedRef.current) return;

    appStoreRequestStartedRef.current = true;
    setAppStoreLoading(true);
    setAppStoreError(null);

    async function loadAppStore() {
      try {
        const res = await fetch(`/api/apps/${encodedAppName}/app-store`, {
          method: "GET",
          credentials: "same-origin",
        });

        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load app store data");
        }

        setAppStoreData(payload.data ?? null);
      } catch (error) {
        console.error("Failed to load app store data:", error);
        setAppStoreError(
          error instanceof Error ? error.message : "Failed to load app store data"
        );
        appStoreRequestStartedRef.current = false;
      } finally {
        setAppStoreLoading(false);
      }
    }

    loadAppStore();
  }, [activeTab, appStoreData, encodedAppName]);

  useEffect(() => {
    if (activeTab !== "brand_kit") return;
    if (apkIntelligenceData) return;
    if (apkRequestStartedRef.current) return;

    apkRequestStartedRef.current = true;
    setApkLoading(true);
    setApkError(null);

    async function loadApkIntelligence() {
      try {
        const res = await fetch(`/api/apps/${encodedAppName}/apk-intelligence`, {
          method: "GET",
          credentials: "same-origin",
        });

        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load APK intelligence");
        }

        setApkIntelligenceData(payload.data ?? null);
      } catch (error) {
        console.error("Failed to load APK intelligence:", error);
        setApkError(
          error instanceof Error ? error.message : "Failed to load APK intelligence"
        );
        apkRequestStartedRef.current = false;
      } finally {
        setApkLoading(false);
      }
    }

    loadApkIntelligence();
  }, [activeTab, apkIntelligenceData, encodedAppName]);

  if (!activeData) {
    return (
      <div className="flex h-64 items-center justify-center pt-24 text-zinc-500 italic">
        No active data found for this layout.
      </div>
    );
  }

  const brandKitData =
    activePlatformData?.browsing?.sessionIntel?.brand_kit ||
    activeData.sessionIntel?.brand_kit ||
    {};

  const hasBrandKit =
    !!activePlatformData?.browsing?.sessionIntel?.brand_kit ||
    !!activeData.sessionIntel?.brand_kit ||
    !!appData.hasApkIntelligence ||
    !!apkIntelligenceData;

  const hasAppStore =
    !!appData.appStore ||
    !!appData.hasAppStore ||
    !!appStoreData;

  const subTabs = [
    { value: "overview", label: "Overview" },
    { value: "viewer", label: "Screen viewer" },
    { value: "mobbin", label: "Flows" },
    ...(hasBrandKit ? [{ value: "brand_kit", label: "Brand kit" }] : []),
    ...(hasAppStore ? [{ value: "app_store", label: "App store" }] : []),
  ];

  return (
    <div className="flex flex-col w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col w-full">
        <div className="w-full h-[200px] bg-white/20 dark:bg-white/5 flex flex-col justify-between shrink-0 mb-6 relative border border-white/20 dark:border-white/10 backdrop-blur-md">
          <div className="flex-1 w-full relative">{header}</div>

          <div className="relative flex items-end justify-center px-10 h-[64px] shrink-0 border-none">
            <TabsList className="!bg-transparent h-auto p-0 gap-12 !border-none !shadow-none flex items-center">
              {subTabs.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="relative !bg-transparent !shadow-none rounded-none px-0 pb-[8px] !border-none outline-none focus:outline-none focus-visible:ring-0 cursor-pointer text-[15px] font-[400] text-[#747474] dark:text-zinc-400 hover:text-[#000000] dark:hover:text-white data-[state=active]:text-[#000000] dark:data-[state=active]:text-white data-[state=active]:font-[600] after:absolute after:-bottom-[1px] after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:bg-transparent data-[state=active]:after:bg-[#000000] dark:data-[state=active]:after:bg-white transition-all"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-4">
              {hasMobile && hasWeb && (
                <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-full p-1 border border-black/10 dark:border-white/10 shrink-0">
                  <button
                    onClick={() => {
                      setPlatform("mobile");
                      const targetMode = appData.mobile.browsing ? "browsing" : "onboarding";
                      setMode(targetMode);
                    }}
                    className={`p-1.5 rounded-full transition-all cursor-pointer ${
                      platform === "mobile"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                    title="Mobile Layout View"
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setPlatform("web");
                      const targetMode = appData.web.browsing ? "browsing" : "onboarding";
                      setMode(targetMode);
                    }}
                    className={`p-1.5 rounded-full transition-all cursor-pointer ${
                      platform === "web"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                    title="Web Layout View"
                  >
                    <Globe className="w-4 h-4" />
                  </button>
                </div>
              )}

              {activePlatformData?.onboarding && activePlatformData?.browsing && (
                <button
                  onClick={() => setMode(mode === "browsing" ? "onboarding" : "browsing")}
                  className="h-9 px-5 flex items-center gap-2 rounded-full backdrop-blur-md bg-white/20 dark:bg-white/5 border border-white/60 dark:border-white/20 hover:bg-white/40 dark:hover:bg-white/10 transition-all duration-200 group cursor-pointer"
                >
                  <span className="text-zinc-700 dark:text-zinc-300 text-[12px] font-semibold tracking-wide">
                    {mode === "browsing" ? "View Onboarding" : "View Teardown"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <TabsContent value="overview" className="m-0 outline-none data-[state=inactive]:hidden pt-2">
          <div className="max-w-6xl mx-auto w-full pb-16">
            <ExecutiveReport
              key={`exec-${platform}-${mode}`}
              intel={activeData.sessionIntel}
              steps={activeData.steps || []}
              mode={mode}
            />
          </div>
        </TabsContent>

        <TabsContent value="viewer" className="flex flex-col h-[calc(100vh-320px)] min-h-[700px] m-0 outline-none data-[state=inactive]:hidden pb-2 pt-2">
          <div className="flex-1 relative z-50 bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden rounded-2xl">
            {viewerLoading ? (
              <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                Loading screen viewer...
              </div>
            ) : viewerError ? (
              <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                Unable to load screen viewer.
              </div>
            ) : activeData.steps && activeData.steps.length > 0 ? (
              <SessionViewer key={`view-${platform}-${mode}`} data={activeData} />
            ) : (
              <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                No screen viewer data available.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mobbin" className="flex flex-col m-0 outline-none data-[state=inactive]:hidden pb-2 pt-2">
          <div className="flex-1 bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-none">
            {flowsLoading ? (
              <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                Loading flows...
              </div>
            ) : flowsError ? (
              <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                Unable to load flows.
              </div>
            ) : activeData.flowsData ? (
              <FlowsViewer
                key={`flows-${platform}-${mode}`}
                flowsData={activeData.flowsData}
                appName={appData.appName}
                tenantId={tenantId}
                mode={mode}
                platform={platform}
              />
            ) : (
              <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                No flows data available.
              </div>
            )}
          </div>
        </TabsContent>

        {hasBrandKit && (
          <TabsContent value="brand_kit" className="m-0 outline-none data-[state=inactive]:hidden pt-2">
            <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-16 p-8 rounded-2xl">
              {apkLoading ? (
                <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                  Loading brand intelligence...
                </div>
              ) : apkError ? (
                <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                  Unable to load APK intelligence.
                </div>
              ) : (
                <BrandKitViewer
                  brandKit={brandKitData}
                  apkIntelligence={apkIntelligenceData || undefined}
                  appIconUrl={appData.iconUrl}
                  appName={appData.appName}
                  tenantId={tenantId}
                  platform={platform}
                  mode={mode}
                />
              )}
            </div>
          </TabsContent>
        )}

        {hasAppStore && (
          <TabsContent value="app_store" className="m-0 outline-none data-[state=inactive]:hidden pt-2">
            <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-16 rounded-2xl">
              {appStoreLoading ? (
                <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                  Loading app store data...
                </div>
              ) : appStoreError ? (
                <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                  Unable to load app store data.
                </div>
              ) : appStoreData ? (
                <AppStoreViewer appStoreData={appStoreData} />
              ) : (
                <div className="p-6 text-zinc-500 text-[14px] flex items-center justify-center h-full font-medium">
                  No app store data available.
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}