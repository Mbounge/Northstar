//components/report-button.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download } from "lucide-react";

export function ReportButton({ companyId }: { companyId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      });

      if (!response.ok) throw new Error("Generation failed");

      // Convert response to Blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${companyId}_SITREP_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);

    } catch (e) {
      console.error(e);
      alert("Failed to generate report. Check console.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleGenerate} 
      disabled={isLoading}
      variant="outline"
      className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 font-mono text-xs h-9"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-blue-500" />
          ANALYZING DATA...
        </>
      ) : (
        <>
          <FileText className="mr-2 h-3.5 w-3.5 text-emerald-500" />
          GENERATE SITREP
        </>
      )}
    </Button>
  );
}