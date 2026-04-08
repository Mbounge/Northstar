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
}

const getPlatformIcon = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes("twitter") || p.includes("x")) return <Twitter className="w-3.5 h-3.5 text-zinc-400" />;
  if (p.includes("linkedin")) return <Linkedin className="w-3.5 h-3.5 text-zinc-400" />;
  if (p.includes("instagram")) return <Instagram className="w-3.5 h-3.5 text-zinc-400" />;
  if (p.includes("tiktok") || p.includes("youtube") || p.includes("video")) return <PlaySquare className="w-3.5 h-3.5 text-zinc-400" />;
  return <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />;
};

export function MarketingFeed({ posts, companyId, snapshotId }: MarketingFeedProps) {
  const [filter, setFilter] = useState<string | null>(null);

  const getImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    if (rawPath.startsWith('http')) return rawPath;
    const filename = rawPath.split('/').pop();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/marketing/screenshots/${filename}`;
  };

  if (!posts || posts.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-400 text-[13px] font-mono border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
        No marketing signals extracted for this snapshot.
      </div>
    );
  }

  const platforms = Array.from(new Set(posts.map(p => p.platform)));
  const filteredPosts = filter ? posts.filter(p => p.platform === filter) : posts;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Filters */}
      <div className="flex items-center justify-between pb-2">
        <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500 dark:text-zinc-400">
          Signals Captured <span className="font-mono text-zinc-900 dark:text-white ml-2">{posts.length}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md border transition-all",
              filter === null 
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-sm" 
                : "bg-transparent text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
            )}
          >
            All
          </button>
          {platforms.map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={cn(
                "px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md border transition-all",
                filter === p 
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-sm" 
                  : "bg-transparent text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
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
            <div key={i} className="break-inside-avoid bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col group transition-all hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm">
              
              {hasImage && imagePath && (
                <Dialog>
                  <DialogTrigger asChild>
                    <div className="relative w-full aspect-square bg-zinc-50 dark:bg-zinc-900 cursor-zoom-in border-b border-zinc-200 dark:border-zinc-800">
                      <Image 
                        src={imagePath} 
                        alt="Marketing Asset" 
                        fill 
                        className="object-cover group-hover:opacity-90 transition-opacity"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/95 dark:bg-black/80 backdrop-blur-sm p-2.5 rounded-full shadow-xl transform scale-90 group-hover:scale-100 transition-all">
                          <Maximize2 className="w-4 h-4 text-zinc-900 dark:text-white" />
                        </div>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-[90vw] h-[90vh] bg-black border-zinc-800 p-0 overflow-hidden flex flex-col">
                    <img src={imagePath} alt="Full Asset" className="w-full h-full object-contain" />
                  </DialogContent>
                </Dialog>
              )}

              <div className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getPlatformIcon(post.platform)}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-300">{post.platform}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{timeAgo}</span>
                </div>
                
                <p className="text-[13px] text-zinc-700 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                  {post.raw_text}
                </p>

                {post.meta && (Object.keys(post.meta).length > 0) && (
                  <div className="mt-2 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap gap-2">
                    {post.meta.sentiment && (
                      <span className="px-2 py-1 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded text-[9px] font-mono text-zinc-500 uppercase">
                        {post.meta.sentiment}
                      </span>
                    )}
                    {post.meta.category && (
                      <span className="px-2 py-1 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded text-[9px] font-mono text-zinc-500 uppercase">
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