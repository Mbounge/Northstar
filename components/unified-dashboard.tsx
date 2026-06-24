// components/unified-dashboard.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionViewer } from "@/components/session-viewer";
import { ExecutiveReport } from "@/components/executive-report";
import { FlowsViewer } from "@/components/flows-viewer";
import { BrandKitViewer } from "@/components/brand-kit-viewer";
import { AppStoreViewer } from "@/components/app-store-viewer";
import { Smartphone, Globe } from "lucide-react";

type Platform = "mobile" | "web";
type Mode = "browsing" | "onboarding";
type ProductTab = "overview" | "viewer" | "mobbin" | "brand_kit" | "app_store";

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
  const [, startTransition] = useTransition();

  const hasMobile = !!appData.mobile;
  const hasWeb = !!appData.web;

  const defaultPlatform: Platform = hasMobile ? "mobile" : "web";

  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [mode, setMode] = useState<Mode>(
    appData[defaultPlatform]?.browsing ? "browsing" : "onboarding"
  );

  const [activeTab, setActiveTab] = useState<ProductTab>("overview");
  const [readyTab, setReadyTab] = useState<ProductTab | null>("overview");

  const [sessionCache, setSessionCache] = useState<Record<string, any>>({});
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const [flowsLoading, setFlowsLoading] = useState(false);
  const [flowsError, setFlowsError] = useState<string | null>(null);

  const [appStoreData, setAppStoreData] = useState<any>(appData.appStore ?? null);
  const [appStoreLoaded, setAppStoreLoaded] = useState(!!appData.appStore);
  const [appStoreLoading, setAppStoreLoading] = useState(false);
  const [appStoreError, setAppStoreError] = useState<string | null>(null);

  const [apkIntelligenceData, setApkIntelligenceData] = useState<any>(
    appData.apkIntelligence ?? null
  );
  const [apkLoaded, setApkLoaded] = useState(!!appData.apkIntelligence);
  const [apkLoading, setApkLoading] = useState(false);
  const [apkError, setApkError] = useState<string | null>(null);

  const viewerPromisesRef = useRef<Record<string, Promise<any>>>({});
  const flowsPromisesRef = useRef<Record<string, Promise<any>>>({});
  const appStorePromiseRef = useRef<Promise<any> | null>(null);
  const apkPromiseRef = useRef<Promise<any> | null>(null);
  const prefetchTabDataRef = useRef<(tab: ProductTab) => void>(() => {});
  const warmedKeyRef = useRef<string | null>(null);
  const contentRafRef = useRef<number | null>(null);

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

  const mergeSessionCache = useCallback(
    (key: string, data: any, extra: Record<string, any>) => {
      startTransition(() => {
        setSessionCache((prev) => {
          const previousForKey = prev[key] || {};
          const nextForKey = {
            ...previousForKey,
            ...(data || {}),
            ...extra,
          };

          if (data && !("steps" in data) && previousForKey.steps) {
            nextForKey.steps = previousForKey.steps;
          }

          if (data && !("flowsData" in data) && previousForKey.flowsData) {
            nextForKey.flowsData = previousForKey.flowsData;
          }

          return {
            ...prev,
            [key]: nextForKey,
          };
        });
      });
    },
    [startTransition]
  );

  const loadViewerData = useCallback(
    async (options?: {
      targetPlatform?: Platform;
      targetMode?: Mode;
      visible?: boolean;
    }) => {
      const targetPlatform = options?.targetPlatform ?? platform;
      const targetMode = options?.targetMode ?? mode;
      const visible = options?.visible ?? false;
      const key = makeSessionKey(targetPlatform, targetMode);

      if (sessionCache[key]?.viewerLoaded || sessionCache[key]?.steps?.length > 0) {
        return sessionCache[key];
      }

      if (visible) {
        setViewerLoading(true);
        setViewerError(null);
      }

      if (!viewerPromisesRef.current[key]) {
        const params = new URLSearchParams({
          platform: targetPlatform,
          mode: targetMode,
        });

        viewerPromisesRef.current[key] = fetch(
          `/api/apps/${encodedAppName}/viewer?${params.toString()}`,
          {
            method: "GET",
            credentials: "same-origin",
          }
        )
          .then(async (res) => {
            const payload = await res.json();

            if (!res.ok) {
              throw new Error(payload?.error || "Failed to load viewer data");
            }

            mergeSessionCache(key, payload.data, { viewerLoaded: true });
            return payload.data;
          })
          .catch((error) => {
            delete viewerPromisesRef.current[key];
            throw error;
          });
      }

      try {
        return await viewerPromisesRef.current[key];
      } catch (error) {
        if (visible) {
          console.error("Failed to load viewer data:", error);
          setViewerError(
            error instanceof Error ? error.message : "Failed to load viewer data"
          );
        }

        return null;
      } finally {
        if (visible) {
          setViewerLoading(false);
        }
      }
    },
    [encodedAppName, mergeSessionCache, mode, platform, sessionCache]
  );

  const loadFlowsData = useCallback(
    async (options?: {
      targetPlatform?: Platform;
      targetMode?: Mode;
      visible?: boolean;
    }) => {
      const targetPlatform = options?.targetPlatform ?? platform;
      const targetMode = options?.targetMode ?? mode;
      const visible = options?.visible ?? false;
      const key = makeSessionKey(targetPlatform, targetMode);

      if (sessionCache[key]?.flowsLoaded || sessionCache[key]?.flowsData) {
        return sessionCache[key];
      }

      if (visible) {
        setFlowsLoading(true);
        setFlowsError(null);
      }

      if (!flowsPromisesRef.current[key]) {
        const params = new URLSearchParams({
          platform: targetPlatform,
          mode: targetMode,
        });

        flowsPromisesRef.current[key] = fetch(
          `/api/apps/${encodedAppName}/flows?${params.toString()}`,
          {
            method: "GET",
            credentials: "same-origin",
          }
        )
          .then(async (res) => {
            const payload = await res.json();

            if (!res.ok) {
              throw new Error(payload?.error || "Failed to load flows data");
            }

            mergeSessionCache(key, payload.data, { flowsLoaded: true });
            return payload.data;
          })
          .catch((error) => {
            delete flowsPromisesRef.current[key];
            throw error;
          });
      }

      try {
        return await flowsPromisesRef.current[key];
      } catch (error) {
        if (visible) {
          console.error("Failed to load flows data:", error);
          setFlowsError(
            error instanceof Error ? error.message : "Failed to load flows data"
          );
        }

        return null;
      } finally {
        if (visible) {
          setFlowsLoading(false);
        }
      }
    },
    [encodedAppName, mergeSessionCache, mode, platform, sessionCache]
  );

  const loadAppStore = useCallback(
    async (visible = false) => {
      if (appStoreLoaded) return appStoreData;

      if (visible) {
        setAppStoreLoading(true);
        setAppStoreError(null);
      }

      if (!appStorePromiseRef.current) {
        appStorePromiseRef.current = fetch(`/api/apps/${encodedAppName}/app-store`, {
          method: "GET",
          credentials: "same-origin",
        })
          .then(async (res) => {
            const payload = await res.json();

            if (!res.ok) {
              throw new Error(payload?.error || "Failed to load app store data");
            }

            startTransition(() => {
              setAppStoreData(payload.data ?? null);
              setAppStoreLoaded(true);
            });

            return payload.data ?? null;
          })
          .catch((error) => {
            appStorePromiseRef.current = null;
            throw error;
          });
      }

      try {
        return await appStorePromiseRef.current;
      } catch (error) {
        if (visible) {
          console.error("Failed to load app store data:", error);
          setAppStoreError(
            error instanceof Error ? error.message : "Failed to load app store data"
          );
        }

        return null;
      } finally {
        if (visible) {
          setAppStoreLoading(false);
        }
      }
    },
    [appStoreData, appStoreLoaded, encodedAppName, startTransition]
  );

  const loadApkIntelligence = useCallback(
    async (visible = false) => {
      if (apkLoaded) return apkIntelligenceData;

      if (visible) {
        setApkLoading(true);
        setApkError(null);
      }

      if (!apkPromiseRef.current) {
        apkPromiseRef.current = fetch(`/api/apps/${encodedAppName}/apk-intelligence`, {
          method: "GET",
          credentials: "same-origin",
        })
          .then(async (res) => {
            const payload = await res.json();

            if (!res.ok) {
              throw new Error(payload?.error || "Failed to load APK intelligence");
            }

            startTransition(() => {
              setApkIntelligenceData(payload.data ?? null);
              setApkLoaded(true);
            });

            return payload.data ?? null;
          })
          .catch((error) => {
            apkPromiseRef.current = null;
            throw error;
          });
      }

      try {
        return await apkPromiseRef.current;
      } catch (error) {
        if (visible) {
          console.error("Failed to load APK intelligence:", error);
          setApkError(
            error instanceof Error ? error.message : "Failed to load APK intelligence"
          );
        }

        return null;
      } finally {
        if (visible) {
          setApkLoading(false);
        }
      }
    },
    [apkIntelligenceData, apkLoaded, encodedAppName, startTransition]
  );

  const prefetchTabData = useCallback(
    (tab: ProductTab) => {
      if (tab === "viewer") {
        void loadViewerData({ visible: false });
      }

      if (tab === "mobbin") {
        void loadFlowsData({ visible: false });
      }

      if (tab === "brand_kit") {
        void loadApkIntelligence(false);
      }

      if (tab === "app_store") {
        void loadAppStore(false);
      }
    },
    [loadApkIntelligence, loadAppStore, loadFlowsData, loadViewerData]
  );

  useEffect(() => {
    prefetchTabDataRef.current = prefetchTabData;
  }, [prefetchTabData]);

  useEffect(() => {
    if (activeTab === "viewer") {
      void loadViewerData({ visible: true });
    }

    if (activeTab === "mobbin") {
      void loadFlowsData({ visible: true });
    }

    if (activeTab === "brand_kit") {
      void loadApkIntelligence(true);
    }

    if (activeTab === "app_store") {
      void loadAppStore(true);
    }
  }, [
    activeTab,
    loadApkIntelligence,
    loadAppStore,
    loadFlowsData,
    loadViewerData,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const warmKey = `${encodedAppName}:${activeSessionKey}`;
    if (warmedKeyRef.current === warmKey) return;

    warmedKeyRef.current = warmKey;

    const connection = (navigator as any).connection;
    if (connection?.saveData) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const idleIds: number[] = [];

    const scheduleWarmup = (delay: number, tab: ProductTab) => {
      const timer = setTimeout(() => {
        if ("requestIdleCallback" in window) {
          const idleId = (window as any).requestIdleCallback(
            () => prefetchTabDataRef.current(tab),
            { timeout: 2000 }
          );

          idleIds.push(idleId);
        } else {
          prefetchTabDataRef.current(tab);
        }
      }, delay);

      timers.push(timer);
    };

    scheduleWarmup(500, "viewer");
    scheduleWarmup(900, "brand_kit");
    scheduleWarmup(1200, "app_store");
    scheduleWarmup(1800, "mobbin");

    return () => {
      timers.forEach(clearTimeout);

      if ("cancelIdleCallback" in window) {
        idleIds.forEach((id) => (window as any).cancelIdleCallback(id));
      }
    };
  }, [activeSessionKey, encodedAppName]);

  useEffect(() => {
    return () => {
      if (contentRafRef.current !== null) {
        window.cancelAnimationFrame(contentRafRef.current);
      }
    };
  }, []);

  const handleSubTabChange = useCallback(
    (value: string) => {
      const nextTab = value as ProductTab;

      if (nextTab === activeTab) {
        prefetchTabData(nextTab);
        return;
      }

      setActiveTab(nextTab);
      setReadyTab(null);
      prefetchTabData(nextTab);

      if (contentRafRef.current !== null) {
        window.cancelAnimationFrame(contentRafRef.current);
      }

      contentRafRef.current = window.requestAnimationFrame(() => {
        startTransition(() => {
          setReadyTab(nextTab);
        });
      });
    },
    [activeTab, prefetchTabData, startTransition]
  );

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
    !!appStoreData ||
    appStoreLoaded;

  const subTabs: { value: ProductTab; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "viewer", label: "Screen viewer" },
    { value: "mobbin", label: "Flows" },
    ...(hasBrandKit ? [{ value: "brand_kit" as ProductTab, label: "Brand kit" }] : []),
    ...(hasAppStore ? [{ value: "app_store" as ProductTab, label: "App store" }] : []),
  ];

  const canRenderOverview = readyTab === "overview";
  const canRenderViewer = readyTab === "viewer";
  const canRenderFlows = readyTab === "mobbin";
  const canRenderBrandKit = readyTab === "brand_kit";
  const canRenderAppStore = readyTab === "app_store";

  return (
    <div className="flex flex-col w-full">
      <Tabs value={activeTab} onValueChange={handleSubTabChange} className="flex flex-col w-full">
        <div className="w-full h-[200px] bg-white/20 dark:bg-white/5 flex flex-col justify-between shrink-0 mb-6 relative border border-white/20 dark:border-white/10 backdrop-blur-md">
          <div className="flex-1 w-full relative">{header}</div>

          <div className="relative flex items-end justify-center px-10 h-[64px] shrink-0 border-none">
            <TabsList className="!bg-transparent h-auto p-0 gap-12 !border-none !shadow-none flex items-center">
              {subTabs.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  onPointerEnter={() => prefetchTabData(value)}
                  onFocus={() => prefetchTabData(value)}
                  onPointerDown={() => prefetchTabData(value)}
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
            {canRenderOverview ? (
              <ExecutiveReport
                key={`exec-${platform}-${mode}`}
                intel={activeData.sessionIntel}
                steps={activeData.steps || []}
                mode={mode}
              />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="viewer" className="flex flex-col h-[calc(100vh-320px)] min-h-[700px] m-0 outline-none data-[state=inactive]:hidden pb-2 pt-2">
          <div className="flex-1 relative z-50 bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden rounded-2xl">
            {viewerLoading || !canRenderViewer ? (
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
            {flowsLoading || !canRenderFlows ? (
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
              {apkLoading || !canRenderBrandKit ? (
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
              {appStoreLoading || !canRenderAppStore ? (
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