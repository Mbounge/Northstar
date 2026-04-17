// components/shell/app-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppSummary } from "@/lib/review-data";

export function AppSidebar({ apps }: { apps: AppSummary[] }) {
  const pathname = usePathname();
  const [isAppsVisible, setIsAppsVisible] = useState(true);

  return (
    <aside className="w-[96px] h-full flex flex-col items-center shrink-0">
      
      {/* ── MASKED SCROLL CONTAINER ── */}
      <div 
        className="flex-1 w-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0px, black 65px, black calc(100% - 66px), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 65px, black calc(100% - 66px), transparent 100%)"
        }}
      >
        <div className="flex flex-col items-center gap-3 pt-[65px] pb-[66px]">
          {isAppsVisible && apps.map((app) => {
            const decoded = decodeURIComponent(pathname);
            const isActive = decoded.startsWith(`/${app.appName}`);
            
            return (
              <Link
                key={app.appName}
                href={`/${app.appName}`}
                title={app.appName}
                className={cn(
                  // ── CHANGED: Reduced from w-[59px] h-[59px] to w-[48px] h-[48px] ──
                  "relative w-[48px] h-[48px] rounded-[10px] flex items-center justify-center transition-all overflow-hidden shrink-0",
                  isActive
                    ? "scale-105"
                    : "opacity-70 hover:opacity-100 hover:scale-105"
                )}
              >
                {/* Crisp Apple Edge + Active State border */}
                <div 
                  className={cn(
                    "absolute inset-0 rounded-[10px] pointer-events-none z-10 transition-shadow duration-200",
                    isActive 
                      ? "shadow-[inset_0_0_0_2.5px_#0088FF,inset_0_0_0_1px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.35)]" 
                      : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.35)]"
                  )} 
                />
                
                {app.iconUrl ? (
                  <img
                    src={app.iconUrl}
                    alt={app.appName}
                    className="w-full h-full object-cover rounded-[10px]"
                  />
                ) : (
                  <div className="w-full h-full rounded-[10px] bg-white/50 dark:bg-black/50 flex items-center justify-center text-[18px] font-bold text-zinc-700 dark:text-zinc-200">
                    {app.appName.charAt(0)}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── TOGGLE SWITCH ── */}
      <div className="w-full flex justify-center py-6 shrink-0 z-20">
        <button
          onClick={() => setIsAppsVisible(!isAppsVisible)}
          title={isAppsVisible ? "Hide apps" : "Show apps"}
          className={cn(
            "w-[60px] h-[32px] rounded-[100px] relative transition-colors duration-200 ease-in-out cursor-pointer shadow-sm border border-black/5 dark:border-white/5",
            isAppsVisible ? "bg-[#01E305]/[0.48]" : "bg-zinc-300 dark:bg-zinc-700"
          )}
        >
          <div
            className={cn(
              "absolute top-[2px] left-[2px] w-[28px] h-[28px] bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-in-out",
              isAppsVisible ? "translate-x-[28px]" : "translate-x-0"
            )}
          />
        </button>
      </div>

    </aside>
  );
}