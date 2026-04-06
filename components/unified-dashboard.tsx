// components/unified-dashboard.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Target, MousePointerClick, Layers, GitMerge, LayoutGrid, Moon, Sun, Palette, Store } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SessionViewer } from "@/components/session-viewer";
import { ExecutiveReport } from "@/components/executive-report";
import { FlowsViewer } from "@/components/flows-viewer";
import { BrandKitViewer } from "@/components/brand-kit-viewer";
import { AppStoreViewer } from "@/components/app-store-viewer";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function UnifiedDashboard({ appData }: { appData: any }) {
  const [mode, setMode] = useState<"browsing" | "onboarding">(
    appData.browsing ? "browsing" : "onboarding"
  );
  const { theme, toggleTheme } = useTheme();

  const activeData = appData[mode];

  if (!activeData) return null;

  const sessionIntel = activeData.sessionIntel || {};
  let displayGrade = "N/A";
  let gradeLabel = "UX Grade";

  if (mode === "onboarding") {
    displayGrade = sessionIntel.friction_assessment?.friction_grade || "N/A";
    gradeLabel = "Friction Grade";
  } else {
    displayGrade = sessionIntel.ux_quality_assessment?.ux_grade || sessionIntel.ux_quality_report?.ux_grade || "N/A";
    gradeLabel = "UX Quality";
  }

  const gradeColorClass = 
    displayGrade === 'F' || displayGrade === 'D/F' ? 'bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-transparent' :
    displayGrade === 'A' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-transparent' :
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-transparent';

  const hasBrandKit = !!appData.browsing?.sessionIntel?.brand_kit;
  const brandKitData = appData.browsing?.sessionIntel?.brand_kit || activeData.sessionIntel?.brand_kit;

  // --- EXTRACT FRAMEWORK & TECH STACK ---
  // The APK Analyzer puts this into the glossary. Let's parse it out for CI.
  const { framework, extractionMethods } = useMemo(() => {
    let fw = "Native iOS / Android";
    let methods = "Native XML Extraction";
    
    // Check both browsing and active data for the glossary
    const glossary = appData.browsing?.sessionIntel?.session_memory?.glossary || activeData.sessionIntel?.session_memory?.glossary || {};
    const appFramework = glossary["app_framework"];
    
    if (appFramework && appFramework.definition) {
      const def = appFramework.definition.toLowerCase();
      if (def.includes("react_native")) fw = "React Native";
      else if (def.includes("flutter")) fw = "Flutter";
      else if (def.includes("unity")) fw = "Unity";
      else if (def.includes("cordova")) fw = "Cordova";
      else if (def.includes("xamarin")) fw = "Xamarin";

      const viaMatch = appFramework.definition.match(/via:\s*(.+)$/i);
      if (viaMatch) {
        methods = viaMatch[1].replace(/_/g, ' ').replace(/\./g, '');
      }
    }
    return { framework: fw, extractionMethods: methods };
  }, [appData, activeData]);

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden transition-colors duration-300">
      
      {/* ── HEADER ── */}
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 flex items-center justify-between px-6 shrink-0 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <Link href="/review" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors bg-zinc-100 dark:bg-zinc-800 p-2 rounded-md">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-zinc-900 dark:text-white font-bold flex items-center gap-2 text-lg">
              {appData.appName}
            </h1>
            <p className="text-xs text-zinc-500 font-mono capitalize">{mode} Analysis</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* MODE SWITCHER */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-950 rounded-lg p-1 border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
            <button
              disabled={!appData.onboarding}
              onClick={() => setMode("onboarding")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all",
                mode === "onboarding" ? "bg-white text-blue-600 shadow-sm dark:bg-blue-500/20 dark:text-blue-400 dark:shadow-none" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
                !appData.onboarding && "opacity-30 cursor-not-allowed"
              )}
            >
              <GitMerge className="w-3.5 h-3.5" /> Onboarding
            </button>
            <button
              disabled={!appData.browsing}
              onClick={() => setMode("browsing")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all",
                mode === "browsing" ? "bg-white text-purple-600 shadow-sm dark:bg-purple-500/20 dark:text-purple-400 dark:shadow-none" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
                !appData.browsing && "opacity-30 cursor-not-allowed"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> App Teardown
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-800 transition-colors duration-300" />

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-mono transition-colors duration-300">
              {activeData.steps?.length || 0} Screens
            </Badge>
            <Badge className={cn("font-mono border transition-colors duration-300", gradeColorClass)}>
              {gradeLabel}: {displayGrade}
            </Badge>
            
            <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-800 mx-1 transition-colors duration-300" />
            
            {/* THEME TOGGLE */}
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── TABS ── */}
      <Tabs defaultValue="overview" className="flex flex-col flex-1 overflow-hidden">
        <div className="px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0 transition-colors duration-300 flex overflow-x-auto hide-scrollbar">
          <TabsList className="bg-transparent h-auto p-0 gap-8">
            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 dark:data-[state=active]:border-white rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
              <Target className="w-4 h-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="viewer" className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 dark:data-[state=active]:border-blue-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
              <MousePointerClick className="w-4 h-4" /> Screen Viewer
            </TabsTrigger>
            <TabsTrigger value="mobbin" className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 dark:data-[state=active]:border-emerald-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
              <Layers className="w-4 h-4" /> Flows
            </TabsTrigger>
            {hasBrandKit && (
              <TabsTrigger value="brand_kit" className="data-[state=active]:bg-transparent data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400 data-[state=active]:border-b-2 data-[state=active]:border-rose-600 dark:data-[state=active]:border-rose-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
                <Palette className="w-4 h-4" /> Brand Kit & UI
              </TabsTrigger>
            )}
            {appData.appStore && (
              <TabsTrigger value="app_store" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
                <Store className="w-4 h-4" /> App Store Intel
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-y-auto m-0 p-6 md:p-8">
          <ExecutiveReport key={`exec-${mode}`} intel={activeData.sessionIntel} steps={activeData.steps} mode={mode} />
        </TabsContent>
        
        <TabsContent value="viewer" className="flex-1 overflow-hidden m-0 flex flex-col">
          <SessionViewer key={`view-${mode}`} data={activeData} />
        </TabsContent>
        
        <TabsContent value="mobbin" className="flex-1 overflow-hidden m-0 flex flex-col">
          {activeData.flowsData ? (
             <FlowsViewer key={`flow-${mode}`} flowsData={activeData.flowsData} appName={appData.appName} mode={mode} />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500 bg-zinc-50 dark:bg-[#111]">
              <p>No flows data generated for this session.</p>
            </div>
          )}
        </TabsContent>

        {hasBrandKit && (
          <TabsContent value="brand_kit" className="flex-1 overflow-y-auto m-0">
            <BrandKitViewer brandKit={brandKitData} framework={framework} extractionMethods={extractionMethods} />
          </TabsContent>
        )}

        {appData.appStore && (
          <TabsContent value="app_store" className="flex-1 overflow-hidden m-0 flex flex-col">
            <AppStoreViewer appStoreData={appData.appStore} framework={framework} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}