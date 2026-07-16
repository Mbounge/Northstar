// components/canvas/north-star-component-palette.tsx
// Northstar Canvas vNext — shared human/agent component palette surface.

"use client";

import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  GitBranch,
  Lightbulb,
  ListChecks,
  Map,
  MessageSquareQuote,
  Milestone,
  Rows3,
  Search,
  Sparkles,
  Table2,
  Target,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NORTHSTAR_COMPONENT_CONTRACTS,
  NORTHSTAR_COMPONENT_PRESET_IDS,
  type NorthStarComponentPreset,
} from "@/lib/canvas-ai/northstar-design-system";

const ICONS: Record<NorthStarComponentPreset, ReactNode> = {
  section: <Rows3 className="h-5 w-5" />,
  "flow-lane": <Workflow className="h-5 w-5" />,
  "reference-flow": <GitBranch className="h-5 w-5" />,
  "evidence-strip": <BookOpen className="h-5 w-5" />,
  "evidence-card": <Search className="h-5 w-5" />,
  "insight-card": <Sparkles className="h-5 w-5" />,
  "metric-card": <Target className="h-5 w-5" />,
  "decision-card": <CheckCircle2 className="h-5 w-5" />,
  "recommendation-block": <Lightbulb className="h-5 w-5" />,
  "comparison-matrix": <Table2 className="h-5 w-5" />,
  matrix: <Table2 className="h-5 w-5" />,
  "stage-map": <Milestone className="h-5 w-5" />,
  "tradeoff-panel": <Rows3 className="h-5 w-5" />,
  "research-trail": <ListChecks className="h-5 w-5" />,
  "source-ledger": <BookOpen className="h-5 w-5" />,
  "hypothesis-panel": <MessageSquareQuote className="h-5 w-5" />,
  "executive-summary": <Sparkles className="h-5 w-5" />,
  scorecard: <Target className="h-5 w-5" />,
  chart: <BarChart3 className="h-5 w-5" />,
  timeline: <Milestone className="h-5 w-5" />,
  "research-region": <Search className="h-5 w-5" />,
  "product-concept": <Map className="h-5 w-5" />,
  "annotation-callout": <MessageSquareQuote className="h-5 w-5" />,
};

const GROUPS: Array<{ title: string; description: string; presets: NorthStarComponentPreset[] }> = [
  {
    title: "Evidence",
    description: "Ground claims in flows, screenshots, and sources.",
    presets: ["reference-flow", "flow-lane", "evidence-strip", "evidence-card", "source-ledger"],
  },
  {
    title: "Synthesis",
    description: "Turn evidence into clear recommendations.",
    presets: ["executive-summary", "insight-card", "decision-card", "recommendation-block", "hypothesis-panel"],
  },
  {
    title: "Compare",
    description: "Structure trade-offs and stage-equivalent analysis.",
    presets: ["comparison-matrix", "matrix", "stage-map", "tradeoff-panel", "scorecard", "chart"],
  },
  {
    title: "Build",
    description: "Create richer artifacts and designed reasoning areas.",
    presets: ["section", "research-region", "research-trail", "timeline", "product-concept", "annotation-callout"],
  },
];

export function NorthStarComponentPalette({
  onChoose,
  className,
  compact = false,
}: {
  onChoose: (preset: NorthStarComponentPreset) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("min-h-0 overflow-y-auto px-4 pb-5 pt-4", className)} data-canvas-ui="true">
      <div className="mb-4 rounded-[16px] border border-[#6B5CFF]/15 bg-[#6B5CFF]/8 p-4 dark:border-[#BDB6FF]/15 dark:bg-[#6B5CFF]/12">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/70 text-[#6B5CFF] shadow-sm dark:bg-white/10 dark:text-[#C8C1FF]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-[900] tracking-[-0.02em] text-zinc-950 dark:text-white">Northstar components</p>
            <p className="mt-0.5 text-[10px] leading-[14px] text-zinc-500 dark:text-zinc-400">
              Same editable system for humans and the agent.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-[850] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">{group.title}</p>
                {!compact && <p className="mt-0.5 text-[10px] leading-[14px] text-zinc-400 dark:text-zinc-500">{group.description}</p>}
              </div>
              <span className="rounded-full bg-[#6B5CFF]/10 px-2 py-0.5 text-[9px] font-[800] text-[#6B5CFF] dark:bg-[#6B5CFF]/20 dark:text-[#C8C1FF]">
                Editable
              </span>
            </div>
            <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2")}>
              {group.presets.map((preset) => {
                const contract = NORTHSTAR_COMPONENT_CONTRACTS[preset];
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChoose(preset)}
                    title={`${contract.label}: ${contract.description}`}
                    className="group flex min-h-[82px] flex-col items-start justify-between rounded-[16px] border border-black/5 bg-white/60 p-3 text-left text-zinc-650 shadow-[0_1px_0_rgba(16,18,29,0.03)] transition-all hover:-translate-y-0.5 hover:border-[#6B5CFF]/24 hover:bg-white hover:shadow-[0_16px_36px_rgba(35,30,78,0.08)] dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/8"
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#6B5CFF]/10 text-[#6B5CFF] transition-colors group-hover:bg-[#6B5CFF] group-hover:text-white dark:bg-[#6B5CFF]/18 dark:text-[#C8C1FF]">
                        {ICONS[preset]}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[8px] font-[800] uppercase tracking-[0.08em] text-zinc-500 dark:bg-white/8 dark:text-zinc-400">
                        {contract.defaultDensity}
                      </span>
                    </div>
                    <div className="mt-2 min-w-0">
                      <p className="truncate text-[12px] font-[850] tracking-[-0.025em] text-zinc-950 dark:text-white">{contract.label}</p>
                      {!compact && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-[13px] text-zinc-500 dark:text-zinc-400">
                          {contract.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 rounded-[16px] border border-dashed border-[#6B5CFF]/25 bg-white/40 p-3 text-[10px] leading-[15px] text-zinc-500 dark:border-[#BDB6FF]/20 dark:bg-white/5 dark:text-zinc-400">
        {NORTHSTAR_COMPONENT_PRESET_IDS.length} shared component presets. Every created component should remain decomposable into movable, editable canvas primitives.
      </div>
    </div>
  );
}
