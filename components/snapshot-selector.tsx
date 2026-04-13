"use client";

import { useRouter, usePathname } from "next/navigation";
import { History, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SnapshotSelector({
  snapshots,
  currentSnapshot,
}: {
  snapshots: string[];
  currentSnapshot: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (!snapshots || snapshots.length === 0) return null;

  const reversed = [...snapshots].reverse();
  const latest = reversed[0];

  const handleChange = (value: string) => {
    if (value === latest) router.push(pathname);
    else router.push(`${pathname}?snapshot=${value}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="
            h-9 px-3 flex items-center gap-2 rounded-full
            bg-white/40 dark:bg-white/5 backdrop-blur-md
            border border-white/60 dark:border-white/10
            text-zinc-700 dark:text-zinc-300
            hover:bg-white/60 dark:hover:bg-white/10
            transition-all shadow-none focus:outline-none
            text-[12px] font-mono font-semibold cursor-pointer
          "
          aria-label="Select Snapshot"
        >
          <History className="w-3.5 h-3.5 shrink-0" />
          <span>{currentSnapshot}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-white/50 dark:border-white/10 rounded-xl shadow-lg mt-2 p-1 min-w-[160px]"
      >
        {reversed.map((snap, i) => (
          <DropdownMenuItem
            key={snap}
            onClick={() => handleChange(snap)}
            className={`
              text-[12px] font-mono font-bold rounded-lg cursor-pointer px-3 py-2 flex items-center justify-between
              ${snap === currentSnapshot
                ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10"
                : "text-zinc-900 dark:text-zinc-100"
              }
              focus:bg-white/60 dark:focus:bg-white/10
            `}
          >
            {snap}
            {i === 0 && (
              <span className="ml-2 text-zinc-400 text-[9px] uppercase tracking-wider">latest</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}