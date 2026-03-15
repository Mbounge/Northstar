//components/insight-feed.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Megaphone, Briefcase, Smartphone, Sparkles, Loader2, X, TrendingUp, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { useInsightContext } from "@/components/providers/insight-provider";

// ... helper functions getPillarConfig/getImpactColor remain unchanged ...
const getPillarConfig = (pillar: string) => {
  switch (pillar) {
    case "Marketing": return { icon: Megaphone, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" };
    case "Business": return { icon: Briefcase, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" };
    case "Product": return { icon: Smartphone, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" };
    default: return { icon: Sparkles, color: "text-zinc-400", bg: "bg-zinc-800", border: "border-zinc-700" };
  }
};

const getImpactColor = (impact: string) => {
  switch (impact) {
    case "High": return "bg-red-500/10 text-red-400 border-red-500/20";
    case "Medium": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    default: return "bg-zinc-800 text-zinc-400 border-zinc-700";
  }
};

// UPDATED: Now accepts snapshotId
export function InsightFeed({ companyId, snapshotId }: { companyId: string, snapshotId: string }) {
  const { insights, isGenerating, generateInsights, hasGenerated } = useInsightContext();
  const [galleryImages, setGalleryImages] = useState<string[] | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const openGallery = (images: string[], index: number) => {
    setGalleryImages(images);
    setGalleryIndex(index);
  };

  const nextImage = () => {
    if (galleryImages) setGalleryIndex((prev) => (prev + 1) % galleryImages.length);
  };
  
  const prevImage = () => {
    if (galleryImages) setGalleryIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  };

  return (
    <div className="flex flex-col h-full">
      
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <Zap className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Live Intelligence Stream</h3>
            <p className="text-xs text-zinc-400">Analysis for Snapshot: <span className="text-zinc-200 font-mono">{snapshotId}</span></p>
          </div>
        </div>
        
        {!isGenerating && !hasGenerated && (
          // UPDATED: Pass snapshotId
          <Button onClick={() => generateInsights(companyId, snapshotId)} className="bg-white text-black hover:bg-zinc-200 font-mono text-xs">
            <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
            SYNTHESIZE INTEL
          </Button>
        )}
        
        {hasGenerated && !isGenerating && (
           // UPDATED: Pass snapshotId
           <Button onClick={() => generateInsights(companyId, snapshotId)} variant="ghost" className="text-zinc-500 hover:text-white font-mono text-xs h-8">
             REFRESH
           </Button>
        )}
      </div>

      {/* FEED AREA */}
      <div className="flex-1 min-h-0 bg-zinc-900/0 rounded-xl overflow-hidden relative">
        
        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-zinc-950/80 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
            <p className="text-sm text-zinc-300 font-mono animate-pulse">Running Agents on Historical Data...</p>
          </div>
        )}

        {!isGenerating && insights.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 border border-zinc-800 border-dashed rounded-xl">
            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
              <TrendingUp className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm">Ready to analyze target data.</p>
          </div>
        )}

        <ScrollArea className="h-full">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-20">
            {insights.map((item, i) => {
              const config = getPillarConfig(item.pillar);
              const hasImages = item.images && item.images.length > 0;
              
              return (
                <div 
                  key={i} 
                  className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all group animate-in slide-in-from-bottom-4 fade-in duration-500 flex flex-col justify-between"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${config.bg} border ${config.border}`}>
                        <config.icon className={`w-3 h-3 ${config.color}`} />
                        <span className={`text-[10px] font-bold ${config.color} uppercase`}>{item.pillar}</span>
                      </div>
                      <Badge variant="outline" className={`ml-auto text-[9px] h-5 ${getImpactColor(item.impact)}`}>
                        {item.impact} Priority
                      </Badge>
                    </div>

                    <h4 className="text-base font-bold text-zinc-100 mb-2 leading-snug">{item.title}</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed">{item.content}</p>
                  </div>

                  {hasImages && (
                    <div className="mt-5 pt-4 border-t border-zinc-800/50">
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                         {item.images!.map((img, idx) => (
                           <div 
                             key={idx} 
                             className="relative h-20 w-32 shrink-0 rounded-md overflow-hidden border border-zinc-800 cursor-pointer hover:border-blue-500/50 hover:shadow-lg transition-all group/img"
                             onClick={() => openGallery(item.images!, idx)}
                           >
                              <Image 
                                src={img} 
                                alt="Evidence" 
                                fill 
                                className="object-cover opacity-70 group-hover/img:opacity-100 transition-opacity" 
                                unoptimized 
                              />
                           </div>
                         ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Evidence Gallery Modal (Unchanged from previous) */}
      <Dialog open={!!galleryImages} onOpenChange={(open) => !open && setGalleryImages(null)}>
        <DialogContent className="max-w-[95vw] h-[95vh] bg-black border-zinc-800 p-0 flex flex-col overflow-hidden shadow-2xl [&>button]:hidden">
          <DialogTitle className="sr-only">Evidence Gallery</DialogTitle>
          <DialogDescription className="sr-only">Visual evidence supporting the insight</DialogDescription>
          
          <div className="relative flex-1 bg-black flex items-center justify-center p-0">
            {galleryImages && (
              <>
                <div key={galleryIndex} className="w-full h-full">
                  <ZoomableImage 
                    src={galleryImages[galleryIndex]} 
                    alt={`Evidence ${galleryIndex}`}
                  />
                </div>
                
                {galleryImages.length > 1 && (
                  <>
                    <button onClick={(e) => {e.stopPropagation(); prevImage()}} className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-zinc-900/80 text-white hover:bg-zinc-700 transition-colors border border-zinc-700 shadow-xl z-50">
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button onClick={(e) => {e.stopPropagation(); nextImage()}} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-zinc-900/80 text-white hover:bg-zinc-700 transition-colors border border-zinc-700 shadow-xl z-50">
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </>
                )}
                
                <div className="absolute bottom-6 left-6 bg-black/80 px-4 py-1.5 rounded-full border border-zinc-800 text-xs text-zinc-300 font-mono backdrop-blur-md z-50">
                  {galleryIndex + 1} / {galleryImages.length}
                </div>
              </>
            )}
            
            <button 
              onClick={() => setGalleryImages(null)} 
              className="absolute top-6 right-6 p-2.5 rounded-full bg-black/60 text-white hover:bg-zinc-800 border border-zinc-700 transition-colors z-[100] shadow-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}