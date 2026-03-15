//components/mobile-tabs-viewer.tsx


"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MousePointerClick, Maximize2, Layers } from "lucide-react";
import Image from "next/image";
import { MobileTab } from "@/lib/data";

interface MobileTabsViewerProps {
  tabs: MobileTab[];
  companyId: string;
  snapshotId: string;
}

export function MobileTabsViewer({ tabs, companyId, snapshotId }: MobileTabsViewerProps) {
  
  const getImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    const filename = rawPath.split('/').pop();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/product/mobile/screenshots/${filename}`;
  };

  if (!tabs || tabs.length === 0) {
    return <div className="p-10 text-zinc-500">No Mobile Data Available.</div>;
  }

  return (
    // CHANGED: Removed h-full and overflow-hidden
    <Tabs defaultValue={tabs[0].name} className="flex flex-col gap-6">
      
      {/* Tab Navigation */}
      <div className="border-b border-zinc-800">
        <TabsList className="bg-transparent h-auto p-0 gap-6 w-full justify-start overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger 
              key={tab.name} 
              value={tab.name}
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent 
          key={tab.name} 
          value={tab.name} 
          className="mt-0 data-[state=inactive]:hidden"
        >
          {/* CHANGED: Fixed Height to 850px to make cards taller */}
          <div className="grid grid-cols-12 gap-6 h-[850px]">
            
            {/* LEFT: Feed Structure */}
            <Card className="col-span-4 bg-zinc-900/30 border-zinc-800 flex flex-col overflow-hidden h-full">
              <CardHeader className="pb-3 border-b border-zinc-800/50 bg-zinc-900/50 shrink-0">
                <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-zinc-500" />
                  Feed Structure
                </CardTitle>
                <CardDescription className="text-xs">Full vertical scroll.</CardDescription>
              </CardHeader>
              <ScrollArea className="flex-1 p-4 h-full">
                <div className="flex flex-col items-center space-y-0">
                  {tab.survey_screenshots.map((src, idx) => (
                    <div key={idx} className="relative w-full max-w-[280px] border-x border-zinc-800 shadow-2xl">
                      <Image 
                        src={getImagePath(src)} 
                        alt={`Scroll ${idx}`} 
                        width={280} 
                        height={600} 
                        className="w-full h-auto object-cover"
                        unoptimized
                      />
                      <div className="absolute top-2 right-2 opacity-0 hover:opacity-100 transition-opacity bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
                        FRAME {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            {/* RIGHT: User Journey */}
            <Card className="col-span-8 bg-zinc-900/30 border-zinc-800 flex flex-col overflow-hidden h-full">
              <CardHeader className="pb-3 border-b border-zinc-800/50 bg-zinc-900/50 shrink-0">
                <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4 text-blue-400" />
                  User Journey Map
                </CardTitle>
                <CardDescription className="text-xs">
                  {tab.interactions?.length || 0} interaction points.
                </CardDescription>
              </CardHeader>
              
              <ScrollArea className="flex-1 p-6 h-full">
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
                  {tab.interactions?.map((interaction, i) => (
                    <Dialog key={i}>
                      <DialogTrigger asChild>
                        <div className="group relative bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden hover:border-blue-500/50 transition-all duration-300 cursor-pointer">
                          <div className="p-3 border-b border-zinc-800 bg-zinc-900/30 flex justify-between items-start">
                            <div className="overflow-hidden">
                              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 truncate">
                                {interaction.section}
                              </div>
                              <div className="text-xs font-medium text-blue-400 truncate w-full" title={interaction.clicked_text}>
                                "{interaction.clicked_text}"
                              </div>
                            </div>
                            <Maximize2 className="w-3 h-3 text-zinc-700 group-hover:text-blue-400 transition-colors shrink-0" />
                          </div>
                          <div className="relative aspect-[9/16] bg-zinc-900 w-full">
                            {interaction.screenshots && interaction.screenshots.length > 0 ? (
                              <Image 
                                src={getImagePath(interaction.screenshots[0])} 
                                alt="Result" 
                                fill 
                                className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                unoptimized
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-zinc-700 text-xs">No Capture</div>
                            )}
                          </div>
                        </div>
                      </DialogTrigger>
                      
                      <DialogContent className="max-w-[90vw] h-[85vh] bg-zinc-950 border-zinc-800 p-0 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
                          <DialogTitle className="text-white flex items-center gap-2 text-lg">
                            <span className="text-blue-400 font-mono">ACTION:</span> 
                            Clicked "{interaction.clicked_text}"
                          </DialogTitle>
                          <DialogDescription className="text-zinc-400 flex items-center gap-2 mt-1">
                            Section: <Badge variant="outline" className="text-zinc-300 border-zinc-700">{interaction.section}</Badge>
                          </DialogDescription>
                        </div>
                        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-zinc-950 p-8">
                          <div className="flex h-full gap-8 min-w-max items-center">
                            {interaction.screenshots && interaction.screenshots.map((shot, sIdx) => (
                              <div key={sIdx} className="relative h-full aspect-[9/19] shrink-0 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl group">
                                <Image 
                                  src={getImagePath(shot)} 
                                  alt={`Frame ${sIdx}`} 
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur text-white text-xs px-3 py-1 rounded-full border border-white/10 font-mono">
                                  FRAME {sIdx + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              </ScrollArea>
            </Card>

          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}