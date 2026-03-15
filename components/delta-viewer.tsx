//components/delta-viewer.tsx

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import Image from "next/image";
import { DeltaReport } from "@/lib/data";
import { cn } from "@/lib/utils";

export function DeltaViewer({ report }: { report: DeltaReport }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!report || report.changes.length === 0) return null;

  const highImpactCount = report.changes.filter(c => c.severity === 'HIGH').length;

  return (
    <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-500">
      
      {/* 1. THE TRIGGER BANNER (Compact & Actionable) */}
      <div 
        className={cn(
          "flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer",
          isOpen 
            ? "bg-zinc-900 border-zinc-800 rounded-b-none border-b-0" 
            : "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className={cn("p-2 rounded-full", isOpen ? "bg-zinc-800 text-zinc-400" : "bg-amber-500/20 text-amber-500")}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className={cn("font-bold text-sm", isOpen ? "text-zinc-300" : "text-amber-400")}>
              Structural Intelligence Report
            </h3>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              {report.changes.length} Changes Detected vs {report.compared_against}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {highImpactCount > 0 && (
            <Badge variant="destructive" className="font-mono text-[10px]">
              {highImpactCount} HIGH PRIORITY
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-zinc-400 hover:text-white">
            {isOpen ? (
              <span className="flex items-center gap-2">Collapse <ChevronUp className="w-4 h-4" /></span>
            ) : (
              <span className="flex items-center gap-2">View Report <ChevronDown className="w-4 h-4" /></span>
            )}
          </Button>
        </div>
      </div>

      {/* 2. THE EXPANDED CONTENT */}
      {isOpen && (
        <div className="bg-zinc-900/30 border border-zinc-800 border-t-0 rounded-b-lg p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {report.changes.map((change, i) => (
              <Card key={i} className="bg-zinc-950 border-zinc-800 overflow-hidden shadow-sm">
                
                {/* A. Description Header */}
                <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-col gap-3">
                   <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                         <div className="flex items-center gap-2">
                            <Badge className={
                              change.severity === 'HIGH' ? "bg-red-500/10 text-red-400 border-red-500/20" : 
                              change.severity === 'MEDIUM' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                              "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            }>
                              {change.severity}
                            </Badge>
                            <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">{change.pillar} • {change.section}</span>
                         </div>
                         <h4 className="text-sm font-medium text-zinc-200 leading-relaxed max-w-3xl">
                           {change.description}
                         </h4>
                      </div>
                   </div>
                </div>
                
                {/* B. Side-by-Side Images (Fixed Height) */}
                <CardContent className="p-0 bg-zinc-950">
                  <div className="grid grid-cols-2 divide-x divide-zinc-800">
                    
                    {/* OLD */}
                    <div className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                        <span>Previous ({report.compared_against})</span>
                      </div>
                      <ComparisonImage src={change.image_old} label="Old Version" />
                    </div>

                    {/* NEW */}
                    <div className="p-4 flex flex-col gap-2 bg-emerald-500/5">
                      <div className="flex items-center justify-between text-[10px] text-emerald-500 uppercase tracking-wider font-bold">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Current (Live)</span>
                      </div>
                      <ComparisonImage src={change.image_new} label="New Version" highlight />
                    </div>

                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="flex justify-center pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white text-xs">
              Close Report
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper for Zoomable Images
function ComparisonImage({ src, label, highlight }: { src?: string, label: string, highlight?: boolean }) {
  if (!src) return <div className="h-[350px] flex items-center justify-center text-zinc-700 text-xs border border-zinc-800 border-dashed rounded-md bg-zinc-900/50">Missing Image</div>;

  // Transform local path to Supabase URL if needed
  const formattedSrc = src.startsWith('/data') 
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public${src}`
    : src;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className={cn(
          "relative h-[350px] w-full rounded-md overflow-hidden cursor-zoom-in group border transition-all bg-black",
          highlight ? "border-emerald-500/20 hover:border-emerald-500/40" : "border-zinc-800 hover:border-zinc-600"
        )}>
          <Image 
            src={formattedSrc} 
            alt={label} 
            fill 
            className="object-contain p-2"
            unoptimized
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="bg-black/80 backdrop-blur-sm text-white text-[10px] px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10 shadow-xl transform scale-95 group-hover:scale-100 transition-transform">
              <Maximize2 className="w-3 h-3" /> Expand View
            </div>
          </div>
        </div>
      </DialogTrigger>
      
      {/* Full Screen Modal */}
      <DialogContent className="max-w-[95vw] h-[95vh] p-0 bg-black/90 border-zinc-800 flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">Full screen view</DialogDescription>
        <div className="relative w-full h-full p-4">
           <img 
             src={formattedSrc} 
             alt={label} 
             className="w-full h-full object-contain" 
           />
        </div>
      </DialogContent>
    </Dialog>
  );
}