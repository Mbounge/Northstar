//components/providers/insight-provider.tsx

"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

// Types
export interface Insight {
  title: string;
  content: string;
  impact: string;
  pillar: string;
  images?: string[];
}

interface InsightContextType {
  insights: Insight[];
  isGenerating: boolean;
  // UPDATED: Now accepts snapshotId
  generateInsights: (companyId: string, snapshotId: string) => Promise<void>;
  hasGenerated: boolean;
}

const InsightContext = createContext<InsightContextType | undefined>(undefined);

export function InsightProvider({ children }: { children: ReactNode }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // UPDATED: generateInsights now takes snapshotId
  const generateInsights = async (companyId: string, snapshotId: string) => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // PASS snapshotId to the API
        body: JSON.stringify({ companyId, snapshotId })
      });
      const data = await res.json();
      setInsights(data.insights || []);
      setHasGenerated(true);
    } catch (e) {
      console.error("Failed to generate insights", e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <InsightContext.Provider value={{ insights, isGenerating, generateInsights, hasGenerated }}>
      {children}
    </InsightContext.Provider>
  );
}

export function useInsightContext() {
  const context = useContext(InsightContext);
  if (context === undefined) {
    throw new Error("useInsightContext must be used within an InsightProvider");
  }
  return context;
}