// components/snapshot-selector.tsx

"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
    <Select value={currentSnapshot} onValueChange={handleChange}>
      <SelectTrigger
        className="
          h-7 w-auto min-w-[130px] max-w-[180px]
          border-zinc-200 dark:border-zinc-800
          bg-transparent text-zinc-600 dark:text-zinc-300
          font-mono text-[11px] shadow-none
          focus:ring-0 focus:ring-offset-0
          hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors
        "
      >
        <SelectValue placeholder="Select snapshot" />
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
        {reversed.map((snap, i) => (
          <SelectItem
            key={snap}
            value={snap}
            className="text-[11px] font-mono text-zinc-900 dark:text-zinc-100 focus:bg-zinc-100 dark:focus:bg-zinc-900"
          >
            {snap}
            {i === 0 && (
              <span className="ml-1.5 text-zinc-400 text-[9px]">(latest)</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}