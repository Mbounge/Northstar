// components/shell/app-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSummary } from "@/lib/review-data";

export function AppSidebar({ apps }: { apps: AppSummary[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-[64px] h-full flex flex-col items-center py-6 gap-3 shrink-0">
      {/* App list */}
      <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col items-center gap-3 w-full">
        {apps.map((app) => {
          const decoded = decodeURIComponent(pathname);
          const isActive = decoded.startsWith(`/${app.appName}`);
          return (
            <Link
              key={app.appName}
              href={`/${app.appName}`}
              title={app.appName}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all overflow-hidden shadow-sm",
                isActive
                  ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent scale-105"
                  : "opacity-70 hover:opacity-100 hover:scale-105"
              )}
            >
              {app.iconUrl ? (
                <img
                  src={app.iconUrl}
                  alt={app.appName}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-full rounded-xl bg-white/50 dark:bg-black/50 backdrop-blur-md flex items-center justify-center text-[12px] font-bold text-zinc-700 dark:text-zinc-200">
                  {app.appName.charAt(0)}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Add */}
      <div className="pt-4 border-t border-white/20 dark:border-white/10 w-full flex justify-center">
        <button
          title="Add target"
          className="w-10 h-10 rounded-xl bg-white/40 dark:bg-black/40 backdrop-blur-md border border-white/50 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
}