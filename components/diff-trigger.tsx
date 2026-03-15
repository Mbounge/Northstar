//components/diff-trigger.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GitCompare, Loader2, CheckCircle } from "lucide-react";

export function DiffTrigger({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleRunDiff = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed");
      
      console.log("Diff Report Generated:", data);
      setStatus('success');
      
      // Reset after 3 seconds
      setTimeout(() => setStatus('idle'), 3000);
      
    } catch (e) {
      console.error(e);
      alert("Failed to run Diff Engine. Check console.");
      setStatus('idle');
    }
  };

  return (
    <Button 
      onClick={handleRunDiff} 
      disabled={status === 'loading'}
      variant="outline"
      className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 font-mono text-xs h-9"
    >
      {status === 'loading' ? (
        <>
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-blue-500" />
          COMPARING SNAPSHOTS...
        </>
      ) : status === 'success' ? (
        <>
          <CheckCircle className="mr-2 h-3.5 w-3.5 text-emerald-500" />
          DIFF COMPLETE
        </>
      ) : (
        <>
          <GitCompare className="mr-2 h-3.5 w-3.5 text-blue-400" />
          RUN DIFF ENGINE
        </>
      )}
    </Button>
  );
}