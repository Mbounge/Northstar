"use client";

import { useCallback, useEffect, useState } from "react";

import type { CanvasV2ResearchQuery, CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";

export function useCanvasV2Research(endpoint: string) {
  const [result, setResult] = useState<CanvasV2ResearchResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(async (query: CanvasV2ResearchQuery) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(query) });
      const payload = await response.json() as { result?: CanvasV2ResearchResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Research could not be loaded.");
      setResult(payload.result);
      return payload.result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Research could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => { void run({ operation: "list-apps", limit: 30 }); }, [run]);
  return { result, loading, error, run };
}
