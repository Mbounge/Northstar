"use client";

import { useCallback, useEffect, useState } from "react";

import type { CanvasV2ResearchQuery, CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";

type CanvasV2ResearchPayload = { result?: CanvasV2ResearchResult; error?: string };

export async function readCanvasV2ResearchResponse(response: Response): Promise<CanvasV2ResearchResult> {
  const body = await response.text();
  let payload: CanvasV2ResearchPayload | undefined;
  try {
    payload = body ? JSON.parse(body) as CanvasV2ResearchPayload : undefined;
  } catch {
    const redirectedToLogin = response.redirected || /\/login(?:[/?#]|$)/.test(response.url);
    throw new Error(redirectedToLogin
      ? "Sign in to access Northstar account evidence."
      : "Northstar account evidence is temporarily unavailable.");
  }
  if (!response.ok || !payload?.result) {
    throw new Error(payload?.error ?? "Northstar account evidence could not be loaded.");
  }
  return payload.result;
}

export function useCanvasV2Research(endpoint: string) {
  const [result, setResult] = useState<CanvasV2ResearchResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(async (query: CanvasV2ResearchQuery) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(query) });
      const nextResult = await readCanvasV2ResearchResponse(response);
      setResult(nextResult);
      return nextResult;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Research could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => { void run({ operation: "list-apps", limit: 30 }); }, [run]);
  return { result, loading, error, run };
}
