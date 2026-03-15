//components/web-flow-viewer.tsx

"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Globe, ArrowDown } from "lucide-react";
import Image from "next/image";
import { WebManifest } from "@/lib/data";

interface WebFlowViewerProps {
  flows: WebManifest[];
  companyId: string;
  snapshotId: string; // <--- NEW PROP
}

export function WebFlowViewer({ flows, companyId, snapshotId }: WebFlowViewerProps) {
  
  // Dynamic Path Helper
  const getImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    const filename = rawPath.split('/').pop();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/product/web/screenshots/${filename}`;
  };

  if (!flows || flows.length === 0) {
    return <div className="p-10 text-zinc-500">No Web Data Available.</div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <ScrollArea className="h-full">
        <div className="p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
            {flows.map((flow, i) => (
              <Dialog key={i}>
                <DialogTrigger asChild>
                  <Card className="bg-zinc-900/30 border-zinc-800 hover:border-blue-500/50 transition-all cursor-pointer group overflow-hidden">
                    <div className="relative w-full h-48 bg-zinc-950 border-b border-zinc-800">
                      {flow.screenshots && flow.screenshots.length > 0 ? (
                        <Image 
                          src={getImagePath(flow.screenshots[0])}
                          alt={flow.flow_name}
                          fill
                          className="object-cover opacity-80 group-hover:opacity-100 transition-opacity object-top"
                          unoptimized
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-zinc-700">No Preview</div>
                      )}
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-2 py-1 rounded font-mono">
                        {flow.screenshots.length} STEPS
                      </div>
                    </div>
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="overflow-hidden pr-2">
                          <CardTitle className="text-sm font-medium text-zinc-200 group-hover:text-blue-400 transition-colors truncate">
                            {flow.flow_name.replace(/_/g, " ")}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1 truncate" title={flow.url}>
                            {flow.url}
                          </CardDescription>
                        </div>
                        <Globe className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 shrink-0" />
                      </div>
                    </CardHeader>
                  </Card>
                </DialogTrigger>

                <DialogContent className="max-w-[95vw] h-[90vh] bg-zinc-950 border-zinc-800 p-0 flex flex-col">
                  <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center shrink-0 pr-12">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 bg-blue-500/10 rounded-full shrink-0">
                        <Globe className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="overflow-hidden">
                        <DialogTitle className="text-white truncate">
                          {flow.flow_name.replace(/_/g, " ")}
                        </DialogTitle>
                        <p className="text-xs text-zinc-500 mt-0.5 font-mono truncate max-w-md">{flow.url}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 shrink-0 ml-4">
                      {flow.screenshots.length} Screens
                    </Badge>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-zinc-950/50 p-8">
                    <div className="flex flex-col items-center gap-12 max-w-[1600px] mx-auto w-full">
                      {flow.screenshots.map((shot, sIdx) => (
                        <div key={sIdx} className="flex flex-col w-full">
                          <div className="flex items-center gap-3 mb-3 ml-1">
                            <div className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full font-mono shadow-lg shadow-blue-900/20 border border-blue-500">
                              STEP {sIdx + 1}
                            </div>
                            <div className="h-px bg-zinc-800 flex-1" />
                          </div>
                          <div className="relative w-full border border-zinc-800 rounded-lg overflow-hidden shadow-2xl bg-black">
                            <div className="relative w-full h-auto">
                              <Image 
                                src={getImagePath(shot)} 
                                alt={`Step ${sIdx}`} 
                                width={1600}
                                height={900}
                                className="w-full h-auto object-contain"
                                unoptimized
                              />
                            </div>
                          </div>
                          {sIdx < flow.screenshots.length - 1 && (
                            <div className="flex justify-center pt-12">
                              <div className="p-3 bg-zinc-900 rounded-full border border-zinc-800 shadow-xl">
                                <ArrowDown className="w-6 h-6 text-zinc-500" />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="mt-8 mb-20 flex flex-col items-center text-zinc-600 gap-2">
                        <div className="w-2 h-2 bg-zinc-800 rounded-full" />
                        <span className="text-xs font-mono uppercase tracking-widest opacity-50">End of User Flow</span>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}