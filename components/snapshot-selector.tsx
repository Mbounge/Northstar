// components/snapshot-selector.tsx

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, History } from "lucide-react";

interface SnapshotSelectorProps {
  snapshots: string[];
  currentSnapshot: string;
}

export function SnapshotSelector({ snapshots, currentSnapshot }: SnapshotSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleValueChange = (value: string) => {
    // Create new params to preserve other potential filters
    const params = new URLSearchParams(searchParams.toString());
    
    if (value === snapshots[0]) {
      // If latest, remove param to keep URL clean
      params.delete("snapshot");
    } else {
      params.set("snapshot", value);
    }
    
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 bg-zinc-900/50 p-1 pl-3 rounded-lg border border-zinc-800">
      <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wider font-bold">
        <History className="w-3.5 h-3.5" />
        <span>Time Machine</span>
      </div>
      <Select value={currentSnapshot} onValueChange={handleValueChange}>
        <SelectTrigger className="h-8 border-0 bg-transparent focus:ring-0 w-[180px] text-zinc-200 font-mono text-xs">
          <SelectValue placeholder="Select Date" />
        </SelectTrigger>
        <SelectContent>
          {snapshots.map((snap, i) => (
            <SelectItem key={snap} value={snap} className="text-xs font-mono">
              {snap} {i === snapshots.length - 1 ? "(Latest)" : i === 0 ? "(Oldest)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}