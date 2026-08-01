// Northstar thinking-mode policy v1 — deliberation depth, never an action quota.

export type NorthstarThinkingMode = "low" | "medium" | "high";

export interface NorthstarThinkingModePolicy {
  mode: NorthstarThinkingMode;
  deliberation: "fast" | "balanced" | "deep";
  providerThinkingLevel: "low" | "medium" | "high";
  description: string;
  /** Creative-session duration for this invocation. High has no creative ceiling. */
  maxCreativeDurationMs: number | null;
  /** Time reserved for one broad completion action plus browser settlement. */
  finalizationReserveMs: number;
  /** Optional server-rendered detail views; the canonical browser snapshot is always primary. */
  optionalDetailViewCount: number;
}

export const NORTHSTAR_THINKING_MODE_POLICIES: Record<
  NorthstarThinkingMode,
  NorthstarThinkingModePolicy
> = {
  low: {
    mode: "low",
    deliberation: "fast",
    providerThinkingLevel: "low",
    description: "Fast decisions with a reserved final completion pass.",
    maxCreativeDurationMs: 5 * 60_000,
    finalizationReserveMs: 110_000,
    optionalDetailViewCount: 0,
  },
  medium: {
    mode: "medium",
    deliberation: "balanced",
    providerThinkingLevel: "medium",
    description: "Balanced deliberation with a longer completion window.",
    maxCreativeDurationMs: 12 * 60_000,
    finalizationReserveMs: 140_000,
    optionalDetailViewCount: 1,
  },
  high: {
    mode: "high",
    deliberation: "deep",
    providerThinkingLevel: "high",
    description: "Deep deliberation that continues until Northstar declares completion.",
    maxCreativeDurationMs: null,
    finalizationReserveMs: 0,
    optionalDetailViewCount: 2,
  },
};

export function northstarThinkingModePolicy(
  mode: NorthstarThinkingMode,
): NorthstarThinkingModePolicy {
  return NORTHSTAR_THINKING_MODE_POLICIES[mode];
}
