// components/unified-dashboard.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Target, MousePointerClick, Layers, GitMerge, LayoutGrid } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SessionViewer } from "@/components/session-viewer";
import { ExecutiveReport } from "@/components/executive-report";
import { FlowsViewer } from "@/components/flows-viewer";
import { cn } from "@/lib/utils";

export function UnifiedDashboard({ appData }: { appData: any }) {
  // Default to browsing if it exists, otherwise onboarding
  const[mode, setMode] = useState<"browsing" | "onboarding">(
    appData.browsing ? "browsing" : "onboarding"
  );

  const activeData = appData[mode];

  if (!activeData) return null;

  const frictionGrade = activeData.sessionIntel?.friction_report?.friction_grade || "N/A";
  const gradeLabel = mode === "onboarding" ? "Friction Grade" : "UX Grade";

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      
      {/* ── HEADER ── */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/review" className="text-zinc-400 hover:text-white transition-colors bg-zinc-800 p-2 rounded-md">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-white font-bold flex items-center gap-2 text-lg">
              {appData.appName}
            </h1>
            <p className="text-xs text-zinc-500 font-mono capitalize">{mode} Analysis</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* MODE SWITCHER */}
          <div className="flex items-center bg-zinc-950 rounded-lg p-1 border border-zinc-800">
            <button
              disabled={!appData.onboarding}
              onClick={() => setMode("onboarding")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all",
                mode === "onboarding" ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:text-zinc-300",
                !appData.onboarding && "opacity-30 cursor-not-allowed"
              )}
            >
              <GitMerge className="w-3.5 h-3.5" /> Onboarding Funnel
            </button>
            <button
              disabled={!appData.browsing}
              onClick={() => setMode("browsing")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all",
                mode === "browsing" ? "bg-purple-500/20 text-purple-400" : "text-zinc-500 hover:text-zinc-300",
                !appData.browsing && "opacity-30 cursor-not-allowed"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> App Teardown
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-zinc-900 border-zinc-700 text-zinc-300 font-mono">
              {activeData.steps.length} Screens
            </Badge>
            <Badge className={`font-mono ${frictionGrade === 'F' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {gradeLabel}: {frictionGrade}
            </Badge>
          </div>
        </div>
      </header>

      {/* ── TABS ── */}
      <Tabs defaultValue="overview" className="flex flex-col flex-1 overflow-hidden">
        <div className="px-6 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <TabsList className="bg-transparent h-auto p-0 gap-8">
            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-white rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
              <Target className="w-4 h-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="viewer" className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
              <MousePointerClick className="w-4 h-4" /> Screen Viewer
            </TabsTrigger>
            <TabsTrigger value="mobbin" className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold">
              <Layers className="w-4 h-4" /> Flows
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Note: We pass a key using the mode so React completely remounts the components when toggling! */}
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
            <div className="flex h-full items-center justify-center text-zinc-500 bg-[#111]">
              <p>No flows data generated for this session.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}