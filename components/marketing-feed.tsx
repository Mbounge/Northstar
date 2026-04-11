// components/marketing-feed.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { SocialPost } from "@/lib/data";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Twitter, Linkedin, Instagram, PlaySquare, ImageIcon, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketingFeedProps {
  posts: SocialPost[];
  companyId: string;
  snapshotId: string;
  tenantId: string;
}

const getPlatformIcon = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes("twitter") || p.includes("x")) return <Twitter className="w-4 h-4 text-zinc-500" />;
  if (p.includes("linkedin")) return <Linkedin className="w-4 h-4 text-zinc-500" />;
  if (p.includes("instagram")) return <Instagram className="w-4 h-4 text-zinc-500" />;
  if (p.includes("tiktok") || p.includes("youtube") || p.includes("video")) return <PlaySquare className="w-4 h-4 text-zinc-500" />;
  return <ImageIcon className="w-4 h-4 text-zinc-500" />;
};

export function MarketingFeed({ posts, companyId, snapshotId, tenantId }: MarketingFeedProps) {
  const [filter, setFilter] = useState<string | null>(null);

  const getImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    if (rawPath.startsWith('http')) return rawPath;
    const filename = rawPath.split('/').pop();
    // Ensure the tenantId is in the image URL path
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${tenantId}/${companyId}/snapshots/${snapshotId}/marketing/screenshots/${filename}`;
  };

  if (!posts || posts.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-600 dark:text-zinc-400 text-[14px] font-mono bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/50 dark:border-white/10 rounded-3xl shadow-xl">
        No marketing signals extracted for this snapshot.
      </div>
    );
  }

  const platforms = Array.from(new Set(posts.map(p => p.platform)));
  const filteredPosts = filter ? posts.filter(p => p.platform === filter) : posts;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 gap-4">
        <div className="text-[12px] font-bold tracking-[0.15em] uppercase text-zinc-600 dark:text-zinc-400 bg-white/40 dark:bg-black/30 backdrop-blur-md px-4 py-2 rounded-xl border border-white/50 dark:border-white/10 shadow-sm">
          Signals Captured <span className="font-mono text-zinc-900 dark:text-white ml-2">{posts.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "px-4 py-2 text-[11px] uppercase font-bold tracking-wider rounded-xl border transition-all shadow-sm backdrop-blur-md",
              filter === null 
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-md scale-105" 
                : "bg-white/50 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-white/20"
            )}
          >
            All
          </button>
          {platforms.map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={cn(
                "px-4 py-2 text-[11px] uppercase font-bold tracking-wider rounded-xl border transition-all shadow-sm backdrop-blur-md",
                filter === p 
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-md scale-105" 
                  : "bg-white/50 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-white/20"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Masonry Grid */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
        {filteredPosts.map((post, i) => {
          const hasImage = !!post.screenshot;
          const imagePath = hasImage ? getImagePath(post.screenshot) : null;
          let timeAgo = "Unknown";
          try { timeAgo = formatDistanceToNow(new Date(post.timestamp), { addSuffix: true }); } catch (e) {}

          return (
            <div key={i} className="break-inside-avoid bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 rounded-[24px] overflow-hidden flex flex-col group transition-all hover:shadow-2xl shadow-xl hover:-translate-y-1">
              
              {hasImage && imagePath && (
                <Dialog>
                  <DialogTrigger asChild>
                    <div className="relative w-full aspect-square bg-white/50 dark:bg-white/5 cursor-zoom-in border-b border-white/40 dark:border-white/10 overflow-hidden">
                      <Image 
                        src={imagePath} 
                        alt="Marketing Asset" 
                        fill 
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 backdrop-blur-md p-3.5 rounded-full shadow-2xl transform scale-90 group-hover:scale-100 transition-all duration-300">
                          <Maximize2 className="w-5 h-5 text-zinc-900" />
                        </div>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] h-[95vh] bg-black/90 backdrop-blur-3xl border-white/10 p-0 overflow-hidden flex flex-col rounded-3xl">
                    <img src={imagePath} alt="Full Asset" className="w-full h-full object-contain" />
                  </DialogContent>
                </Dialog>
              )}

              <div className="p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-md border border-white/80 dark:border-white/20 flex items-center justify-center shadow-sm">
                      {getPlatformIcon(post.platform)}
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">{post.platform}</span>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 bg-white/50 dark:bg-white/10 px-2.5 py-1 rounded-full border border-white/60 dark:border-white/20 shadow-sm">{timeAgo}</span>
                </div>
                
                <p className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {post.raw_text}
                </p>

                {post.meta && (Object.keys(post.meta).length > 0) && (
                  <div className="mt-2 pt-5 border-t border-black/5 dark:border-white/10 flex flex-wrap gap-2">
                    {post.meta.sentiment && (
                      <span className="px-3 py-1.5 bg-white/60 dark:bg-white/10 backdrop-blur-md border border-white/80 dark:border-white/20 rounded-lg text-[10px] font-bold font-mono text-zinc-600 dark:text-zinc-300 uppercase shadow-sm">
                        {post.meta.sentiment}
                      </span>
                    )}
                    {post.meta.category && (
                      <span className="px-3 py-1.5 bg-white/60 dark:bg-white/10 backdrop-blur-md border border-white/80 dark:border-white/20 rounded-lg text-[10px] font-bold font-mono text-zinc-600 dark:text-zinc-300 uppercase shadow-sm">
                        {post.meta.category}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}