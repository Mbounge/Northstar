"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppSummary } from "@/lib/review-data";

export function AppSidebar({ apps }: { apps: AppSummary[] }) {
  const pathname = usePathname();
  // State to control the visibility of the app list
  const [isAppsVisible, setIsAppsVisible] = useState(true);

  return (
    <aside className="w-[64px] h-full flex flex-col items-center py-4 gap-3 shrink-0">
      
      {/* App list */}
      <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col items-center gap-3 w-full px-2 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Conditionally render the apps based on the toggle state */}
        {isAppsVisible && apps.map((app) => {
          const decoded = decodeURIComponent(pathname);
          const isActive = decoded.startsWith(`/${app.appName}`);
          return (
            <Link
              key={app.appName}
              href={`/${app.appName}`}
              title={app.appName}
              className={cn(
                "w-10 h-10 rounded-[12px] flex items-center justify-center transition-all overflow-hidden shadow-sm shrink-0",
                isActive
                  ? "ring-[2.5px] ring-[#0088FF] scale-105"
                  : "opacity-70 hover:opacity-100 hover:scale-105"
              )}
            >
              {app.iconUrl ? (
                <img
                  src={app.iconUrl}
                  alt={app.appName}
                  className="w-full h-full object-cover rounded-[12px]"
                />
              ) : (
                <div className="w-full h-full rounded-[12px] bg-white/50 dark:bg-black/50 flex items-center justify-center text-[12px] font-bold text-zinc-700 dark:text-zinc-200">
                  {app.appName.charAt(0)}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── UPDATED: Toggle Switch (Replaced the + button) ── */}
      <div className="pt-2 w-full flex justify-center pb-2">
        <button
          onClick={() => setIsAppsVisible(!isAppsVisible)}
          title={isAppsVisible ? "Hide apps" : "Show apps"}
          // Outer pill background: Green when ON, gray when OFF
          className={cn(
            "w-[42px] h-[24px] rounded-full relative transition-colors duration-200 ease-in-out cursor-pointer shadow-sm border border-black/5 dark:border-white/5",
            isAppsVisible ? "bg-[#34C759]" : "bg-zinc-300 dark:bg-zinc-700"
          )}
        >
          {/* Inner white knob: Slides right when ON, left when OFF */}
          <div
            className={cn(
              "absolute top-[1.5px] left-[2px] w-[19px] h-[19px] bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-in-out",
              isAppsVisible ? "translate-x-[17px]" : "translate-x-0"
            )}
          />
        </button>
      </div>

    </aside>
  );
}