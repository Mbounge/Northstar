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
    <aside className="w-[52px] border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#0a0a0a] flex flex-col items-center py-3 gap-1.5 shrink-0">
      {/* Logo */}
      <Link
        href="/"
        className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mb-3 hover:border-zinc-400 transition-colors shadow-sm"
        title="CompetitorOS"
      >
        <Command className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
      </Link>

      {/* App list */}
      {apps.map((app) => {
        const decoded = decodeURIComponent(pathname);
        const isActive = decoded.startsWith(`/${app.appName}`);
        return (
          <Link
            key={app.appName}
            href={`/${app.appName}`}
            title={app.appName}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all overflow-hidden",
              isActive
                ? "ring-1 ring-zinc-400 dark:ring-zinc-600 shadow-sm"
                : "opacity-60 hover:opacity-100"
            )}
          >
            {app.iconUrl ? (
              <img
                src={app.iconUrl}
                alt={app.appName}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                {app.appName.charAt(0)}
              </div>
            )}
          </Link>
        );
      })}

      {/* Add */}
      <button
        title="Add target"
        className="w-8 h-8 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all mt-auto"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </aside>
  );
}