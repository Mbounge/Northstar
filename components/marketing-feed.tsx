//components/marketing-feed.tsx

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Linkedin, Twitter, Instagram, ExternalLink, Calendar, FileText, AlignLeft, X, ArrowDownToLine } from "lucide-react";
import Image from "next/image";
import { SocialPost, RosterPerson } from "@/lib/data";

const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toISOString().split('T')[0];
  } catch (e) {
    return dateString;
  }
};

const getPlatformConfig = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes("linkedin")) return { icon: Linkedin, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", label: "LinkedIn" };
  if (p.includes("twitter") || p.includes("x")) return { icon: Twitter, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20", label: "X (Twitter)" };
  if (p.includes("instagram")) return { icon: Instagram, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20", label: "Instagram" };
  return { icon: Megaphone, color: "text-zinc-400", bg: "bg-zinc-800", border: "border-zinc-700", label: "Web" };
};

const getSentimentColor = (sentiment: string = "neutral") => {
  const s = sentiment.toLowerCase();
  if (s.includes("positive") || s.includes("hiring")) return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
  if (s.includes("negative") || s.includes("complaint")) return "text-red-400 border-red-500/20 bg-red-500/10";
  return "text-zinc-400 border-zinc-700 bg-zinc-800/50";
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
};

interface MarketingFeedProps {
  posts: SocialPost[];
  roster: RosterPerson[];
  companyId: string; // <--- NEW PROP
  snapshotId: string; // <--- ADD THIS
}

export function MarketingFeed({ posts, roster, companyId, snapshotId}: MarketingFeedProps) {
  const [platformFilter, setPlatformFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);

  // Dynamic Image Path Helper
  const getImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    const filename = rawPath.split('/').pop();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/marketing/screenshots/${filename}`;
  };

  const filteredPosts = posts.filter(post => {
    const matchesPlatform = platformFilter === "all" || post.platform.toLowerCase().includes(platformFilter);
    const matchesPerson = personFilter === "all" || post.entity === personFilter;
    return matchesPlatform && matchesPerson;
  });

  const uniqueEntities = Array.from(new Set(posts.map(p => p.entity))).sort();

  if (!posts || posts.length === 0) {
    return <div className="p-10 text-zinc-500">No Marketing Data Available.</div>;
  }

  // --- DETAIL VIEW (MODAL) ---
  if (selectedPost) {
    const platform = getPlatformConfig(selectedPost.platform);
    const author = roster.find(p => p.name === selectedPost.entity);
    
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setSelectedPost(null)}>
        
        {/* Modal Container */}
        <div className="w-[85vw] h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
          
          {/* ABSOLUTE CLOSE BUTTON */}
          <button
            onClick={() => setSelectedPost(null)}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-xl"
          >
            <X className="w-5 h-5" />
          </button>

          {/* LEFT: Screenshot */}
          <div className="w-1/2 h-full bg-black border-r border-zinc-800 flex items-center justify-center p-8 overflow-hidden">
            {selectedPost.screenshot ? (
              <img 
                src={getImagePath(selectedPost.screenshot)} 
                alt="Evidence" 
                className="max-w-full max-h-full object-contain shadow-2xl border border-zinc-700 rounded-lg"
              />
            ) : (
              <div className="text-zinc-600 text-xl">No Screenshot Available</div>
            )}
          </div>

          {/* RIGHT: Intelligence Panel */}
          <div className="w-1/2 h-full flex flex-col bg-zinc-950 min-h-0">
            
            {/* Header */}
            <div className="px-8 py-8 border-b border-zinc-800 shrink-0 bg-zinc-950 pr-20">
              <div className="flex flex-col gap-4">
                
                {/* Author & Platform Row */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 font-bold shrink-0">
                    {getInitials(selectedPost.entity)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-white leading-none mb-1">{selectedPost.entity}</span>
                    <div className="flex items-center gap-2">
                       <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${platform.bg} border ${platform.border}`}>
                        <platform.icon className={`w-3 h-3 ${platform.color}`} />
                        <span className={`text-[10px] font-bold ${platform.color}`}>{platform.label}</span>
                      </div>
                      <span className="text-zinc-600 text-xs">•</span>
                      <span className="text-zinc-400 text-xs">{author?.role || "Tracked Entity"}</span>
                    </div>
                  </div>
                </div>

                {/* Date & Sentiment Row */}
                <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                  <span>Captured: {formatDate(selectedPost.timestamp)}</span>
                  {selectedPost.meta?.sentiment && (
                    <Badge variant="outline" className={`ml-auto ${getSentimentColor(selectedPost.meta.sentiment)}`}>
                      {selectedPost.meta.sentiment}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable Content (Native Scroll) */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-8 pb-32"> 
                
                {/* Summary */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    AI Summary
                  </h4>
                  <div className="p-5 bg-zinc-900/50 rounded-lg border border-zinc-800">
                    <p className="text-sm text-zinc-200 leading-relaxed">
                      {selectedPost.meta?.summary || "No summary available."}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-zinc-800/50" />

                {/* Full Content */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <AlignLeft className="w-3.5 h-3.5" />
                    Full Content
                  </h4>
                  <div className="bg-zinc-900/30 rounded-lg border border-zinc-800 overflow-hidden">
                    <div className="p-5">
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                        {selectedPost.raw_text}
                      </p>
                    </div>
                    {/* End Marker */}
                    <div className="bg-zinc-900/80 border-t border-zinc-800 p-3 flex flex-col items-center gap-2">
                       <div className="flex items-center gap-3 w-full justify-center opacity-40">
                         <div className="h-px w-12 bg-zinc-500"></div>
                         <ArrowDownToLine className="w-3 h-3 text-zinc-500" />
                         <div className="h-px w-12 bg-zinc-500"></div>
                       </div>
                       <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
                         End of Capture
                       </span>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <div className="pt-2 flex justify-end">
                   <Button 
                    variant="outline" 
                    className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-500 transition-all w-full h-12" 
                    onClick={() => window.open(selectedPost.url, '_blank')}
                  >
                    View Original Post on {platform.label}
                    <ExternalLink className="ml-2 w-4 h-4" />
                  </Button>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // --- GRID VIEW (Main Page) ---
  return (
    <div className="flex flex-col h-full gap-6">
      
      {/* Controls */}
      <div className="flex items-center justify-between shrink-0 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800">
        <Tabs defaultValue="all" className="w-auto" onValueChange={setPlatformFilter}>
          <TabsList className="bg-transparent">
            <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">All Signals</TabsTrigger>
            <TabsTrigger value="linkedin" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-blue-400 text-zinc-400">LinkedIn</TabsTrigger>
            <TabsTrigger value="x" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-sky-400 text-zinc-400">X / Twitter</TabsTrigger>
            <TabsTrigger value="instagram" className="data-[state=active]:bg-zinc-800 data-[state-active]:text-pink-400 text-zinc-400">Instagram</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-4">
           <Select onValueChange={setPersonFilter} defaultValue="all">
            <SelectTrigger className="w-[200px] bg-zinc-950 border-zinc-800 text-zinc-400 h-8 text-xs">
              <SelectValue placeholder="Filter by VIP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All VIPs & Brands</SelectItem>
              {uniqueEntities.map((entity, i) => (
                <SelectItem key={i} value={entity}>
                  {entity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="border-zinc-700 text-zinc-500 font-mono">
            {filteredPosts.length} POSTS
          </Badge>
        </div>
      </div>

      {/* Masonry Feed Grid */}
      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
          {filteredPosts.map((post, i) => {
            const platform = getPlatformConfig(post.platform);
            
            return (
              <Card 
                key={i}
                className="bg-zinc-900/30 border-zinc-800 hover:border-zinc-600 transition-all cursor-pointer group flex flex-col overflow-hidden h-[420px] shadow-lg hover:shadow-xl hover:shadow-black/50"
                onClick={() => setSelectedPost(post)}
              >
                
                {/* Image Preview */}
                <div className="h-[200px] relative bg-black border-b border-zinc-800 shrink-0">
                  {post.screenshot ? (
                    <Image 
                      src={getImagePath(post.screenshot)} 
                      alt="Post Preview" 
                      fill 
                      className="object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                      unoptimized
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-700">No Image</div>
                  )}
                </div>

                {/* Content Preview */}
                <CardContent className="p-5 flex flex-col flex-1">
                  
                  {/* HEADER: Author + Platform Badge */}
                  <div className="flex items-center justify-between mb-3 w-full">
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-bold shrink-0 border border-zinc-700">
                        {getInitials(post.entity)}
                      </div>
                      <span className="text-xs font-bold text-zinc-200 truncate max-w-[120px]">
                        {post.entity}
                      </span>
                      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm ${platform.bg} ${platform.border} shrink-0`}>
                        <platform.icon className={`w-2.5 h-2.5 ${platform.color}`} />
                        <span className={`text-[9px] font-bold ${platform.color}`}>{platform.label}</span>
                      </div>
                    </div>

                    {post.meta?.sentiment && (
                      <Badge variant="outline" className={`text-[9px] h-5 px-1.5 shrink-0 ${getSentimentColor(post.meta.sentiment)}`}>
                        {post.meta.sentiment}
                      </Badge>
                    )}
                  </div>

                  {/* Date Row */}
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono mb-2">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.timestamp)}
                  </div>

                  {/* Text Body */}
                  <p className="text-sm text-zinc-300 line-clamp-3 leading-relaxed font-light">
                    {post.raw_text}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}