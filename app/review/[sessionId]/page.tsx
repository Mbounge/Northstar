//app/review/[sessionId]/page.tsx

import { getSessionDetails } from "@/lib/review-data";
import { SessionViewer } from "@/components/session-viewer";
import { ExecutiveReport } from "@/components/executive-report";
import Link from "next/link";
import { ArrowLeft, Target, MousePointerClick, Layers } from "lucide-react";
import { FlowsViewer } from "@/components/flows-viewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// Next.js 15 requires params to be a Promise
export default async function SessionReviewPage({ 
  params 
}: { 
  params: Promise<{ sessionId: string }> 
}) {
  // Await the params to avoid the Next.js 15 routing error
  const resolvedParams = await params;
  
  // Decode in case the folder name had spaces or special characters
  const sessionId = decodeURIComponent(resolvedParams.sessionId);
  
  const data = await getSessionDetails(sessionId);

  if (!data) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-zinc-950 text-white space-y-4">
        <h2 className="text-xl font-bold text-rose-400">Session Data Not Found</h2>
        <p className="text-zinc-500">Could not find folder: <span className="font-mono text-zinc-300">{sessionId}</span></p>
        <p className="text-sm text-zinc-600">Ensure this exact folder exists in <code className="bg-zinc-900 px-1 rounded">public/reviews/</code></p>
        <Link href="/review" className="mt-4 text-blue-400 hover:underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Review Center
        </Link>
      </div>
    );
  }

  // Safe variables for the header
  const frictionGrade = data.sessionIntel?.friction_report?.friction_grade || "N/A";
  const status = data.summary?.status || "REVIEW";

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      
      {/* Top Header - Always visible */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/review" className="text-zinc-400 hover:text-white transition-colors bg-zinc-800 p-2 rounded-md">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-white font-bold flex items-center gap-2 text-lg">
              {data.summary?.app || sessionId.split('_')[1] || sessionId}
            </h1>
            <p className="text-xs text-zinc-500 font-mono">{sessionId}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-zinc-900 border-zinc-700 text-zinc-300 font-mono">
            {data.steps.length} Screens Extracted
          </Badge>
          <Badge className={`font-mono ${frictionGrade === 'F' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            Grade: {frictionGrade}
          </Badge>
        </div>
      </header>

      {/* Page-Level Tabs */}
      <Tabs defaultValue="overview" className="flex flex-col flex-1 overflow-hidden">
        
        {/* Tab Navigation */}
        <div className="px-6 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <TabsList className="bg-transparent h-auto p-0 gap-8">
            <TabsTrigger 
              value="overview"
              className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-white rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"
            >
              <Target className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="viewer"
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"
            >
              <MousePointerClick className="w-4 h-4" />
              Agent Step Viewer
            </TabsTrigger>
            <TabsTrigger 
              value="mobbin"
              className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 rounded-none px-0 py-4 text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2 uppercase tracking-widest text-xs font-bold"
            >
              <Layers className="w-4 h-4" />
              Flows
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Overview (Scrollable) */}
        <TabsContent value="overview" className="flex-1 overflow-y-auto m-0 p-6 md:p-8">
          <ExecutiveReport intel={data.sessionIntel} steps={data.steps} />
        </TabsContent>

        {/* Tab 2: Flow Viewer (Locked height to allow internal split-screen layout to work) */}
        <TabsContent value="viewer" className="flex-1 overflow-hidden m-0 flex flex-col">
          <SessionViewer data={data} />
        </TabsContent>

        {/* Tab 3: Mobbin Flows Viewer */}
        <TabsContent value="mobbin" className="flex-1 overflow-hidden m-0 flex flex-col">
          <FlowsViewer flowsData={data.flowsData} sessionId={sessionId} />
        </TabsContent>

      </Tabs>

    </div>
  );
}