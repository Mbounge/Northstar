// components/BrowserMockup.tsx
"use client";

import React from "react";

interface BrowserMockupProps {
  imgUrl: string;
  alt: string;
}

export function BrowserMockup({ imgUrl, alt }: BrowserMockupProps) {
  // Extract a clean domain-like string from the file path for realism
  const urlSnippet = imgUrl.split('/screenshots/').pop()?.split('_')[0] || "dashboard";
  const fakeUrl = `https://monitored-target.com/${urlSnippet}`;

  return (
    <div className="w-full h-full bg-[#0a0a0c] flex flex-col overflow-hidden select-none border border-black/10 dark:border-white/10 shadow-2xl rounded-[12px]">
      {/* Browser Chrome Header */}
      <div className="h-9 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-3 shrink-0">
        <div className="flex gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 block" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 block" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 block" />
        </div>
        <div className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-md h-6 px-3 flex items-center text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate select-all">
          {fakeUrl}
        </div>
      </div>
      
      {/* Scrollable Document Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <img src={imgUrl} alt={alt} className="w-full h-auto object-cover object-top block" />
      </div>
    </div>
  );
}