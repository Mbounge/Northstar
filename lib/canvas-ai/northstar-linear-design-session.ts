import {
  northstarThinkingModePolicy,
  type NorthstarThinkingModePolicy,
} from "@/lib/canvas-ai/northstar-thinking-mode-policy";
import { buildNorthstarCurrentDesignReading } from "@/lib/canvas-ai/northstar-design-intelligence";
import type { NorthstarWebArtifactDocument } from "@/lib/canvas-artifacts/types";

// Northstar linear design session v2 — model-owned completion with time-reserved finalization.

export const NORTHSTAR_LINEAR_DESIGN_SESSION_VERSION =
  "northstar.linear-design-session.v2" as const;

export type NorthstarLinearDesignActionStatus = "applied" | "authoring-failed" | "execution-failed";

export interface NorthstarLinearDesignActionMemory {
  index: number;
  baseRevisionId: string;
  revisionId?: string;
  intention: string;
  visibleChange: string;
  viewerUnderstanding: string;
  status: NorthstarLinearDesignActionStatus;
  observedEffect?: string;
  strengths: string[];
  weaknesses: string[];
  implementationDefects: string[];
  runtimeIssues: string[];
  recordedAt: string;
}

export interface NorthstarLinearDesignMemoryView {
  version: typeof NORTHSTAR_LINEAR_DESIGN_SESSION_VERSION;
  objective: string;
  currentDesignDirection?: string;
  appliedActionCount: number;
  authoringFailureCount: number;
  executionFailureCount: number;
  nextActionIndex: number;
  actions: NorthstarLinearDesignActionMemory[];
  currentStrengths: string[];
  currentWeaknesses: string[];
  unresolvedImplementationDefects: string[];
  lastRecommendedMove?: string;
}

export type NorthstarLinearDesignTimingPolicy = Pick<
  NorthstarThinkingModePolicy,
  "providerThinkingLevel" | "maxCreativeDurationMs" | "finalizationReserveMs"
>;

export function northstarLinearDesignTimingPolicy(
  thinkingDepth: "low" | "medium" | "high",
): NorthstarLinearDesignTimingPolicy {
  const policy = northstarThinkingModePolicy(thinkingDepth);
  return {
    providerThinkingLevel: policy.providerThinkingLevel,
    maxCreativeDurationMs: policy.maxCreativeDurationMs,
    finalizationReserveMs: policy.finalizationReserveMs,
  };
}

function unique(values: readonly string[], limit = 24): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

export class NorthstarLinearDesignSession {
  private readonly actionsValue: NorthstarLinearDesignActionMemory[] = [];
  private designDirectionValue?: string;
  private recommendedMoveValue?: string;

  readonly startedAt: number;
  readonly timingPolicy: NorthstarLinearDesignTimingPolicy;

  constructor(
    readonly objective: string,
    readonly thinkingDepth: "low" | "medium" | "high",
    startedAt = Date.now(),
  ) {
    this.startedAt = startedAt;
    this.timingPolicy = northstarLinearDesignTimingPolicy(thinkingDepth);
  }

  get maxDurationMs(): number | null {
    return this.timingPolicy.maxCreativeDurationMs;
  }

  get finalizationReserveMs(): number {
    return this.timingPolicy.finalizationReserveMs;
  }

  get finalizationTriggerAt(): number | null {
    if (this.maxDurationMs === null) return null;
    return this.startedAt + Math.max(0, this.maxDurationMs - this.finalizationReserveMs);
  }

  get activeDesignDeadlineAt(): number | null {
    return this.finalizationTriggerAt;
  }

  get creativeDeadlineAt(): number | null {
    return this.maxDurationMs === null ? null : this.startedAt + this.maxDurationMs;
  }

  shouldEnterFinalization(now = Date.now()): boolean {
    const triggerAt = this.finalizationTriggerAt;
    return triggerAt !== null && now >= triggerAt;
  }

  remainingActiveDesignMs(now = Date.now()): number | null {
    const deadlineAt = this.activeDesignDeadlineAt;
    return deadlineAt === null ? null : Math.max(0, deadlineAt - now);
  }

  remainingDurationMs(now = Date.now()): number | null {
    const deadlineAt = this.creativeDeadlineAt;
    return deadlineAt === null ? null : Math.max(0, deadlineAt - now);
  }

  get attemptedActionCount(): number {
    return this.actionsValue.length;
  }

  get appliedActionCount(): number {
    return this.actionsValue.filter((action) => action.status === "applied").length;
  }

  get authoringFailureCount(): number {
    return this.actionsValue.filter((action) => action.status === "authoring-failed").length;
  }

  get executionFailureCount(): number {
    return this.actionsValue.filter((action) => action.status === "execution-failed").length;
  }

  get nextActionIndex(): number {
    return this.actionsValue.length + 1;
  }

  setDesignDirection(direction: string | undefined): void {
    const clean = direction?.trim();
    if (clean) this.designDirectionValue = clean.slice(0, 2_000);
  }

  recordApplied(input: {
    baseRevisionId: string;
    revisionId: string;
    intention: string;
    visibleChange: string;
    viewerUnderstanding: string;
    observedEffect?: string;
    strengths?: string[];
    weaknesses?: string[];
    implementationDefects?: string[];
    runtimeIssues?: string[];
    recommendedNextMove?: string;
  }): NorthstarLinearDesignActionMemory {
    const action: NorthstarLinearDesignActionMemory = {
      index: this.nextActionIndex,
      baseRevisionId: input.baseRevisionId,
      revisionId: input.revisionId,
      intention: input.intention.trim().slice(0, 1_500),
      visibleChange: input.visibleChange.trim().slice(0, 1_500),
      viewerUnderstanding: input.viewerUnderstanding.trim().slice(0, 1_500),
      status: "applied",
      observedEffect: input.observedEffect?.trim().slice(0, 2_000),
      strengths: unique(input.strengths ?? []),
      weaknesses: unique(input.weaknesses ?? []),
      implementationDefects: unique(input.implementationDefects ?? []),
      runtimeIssues: unique(input.runtimeIssues ?? []),
      recordedAt: new Date().toISOString(),
    };
    this.actionsValue.push(action);
    const next = input.recommendedNextMove?.trim();
    this.recommendedMoveValue = next ? next.slice(0, 1_500) : undefined;
    return action;
  }

  recordAuthoringFailure(input: {
    baseRevisionId: string;
    intention: string;
    runtimeIssues: string[];
  }): NorthstarLinearDesignActionMemory {
    const action: NorthstarLinearDesignActionMemory = {
      index: this.nextActionIndex,
      baseRevisionId: input.baseRevisionId,
      intention: input.intention.trim().slice(0, 1_500) || "Repair an invalid authored design action",
      visibleChange: "No browser-visible change was committed.",
      viewerUnderstanding: "The exact current browser revision remains unchanged while Northstar repairs the authored action.",
      status: "authoring-failed",
      strengths: [],
      weaknesses: [],
      implementationDefects: [],
      runtimeIssues: unique(input.runtimeIssues),
      recordedAt: new Date().toISOString(),
    };
    this.actionsValue.push(action);
    this.recommendedMoveValue = "Repair the authored action against the unchanged current revision without controlling root artboard dimensions.";
    return action;
  }

  recordExecutionFailure(input: {
    baseRevisionId: string;
    attemptedRevisionId?: string;
    intention: string;
    visibleChange: string;
    viewerUnderstanding: string;
    runtimeIssues: string[];
  }): NorthstarLinearDesignActionMemory {
    const action: NorthstarLinearDesignActionMemory = {
      index: this.nextActionIndex,
      baseRevisionId: input.baseRevisionId,
      revisionId: input.attemptedRevisionId,
      intention: input.intention.trim().slice(0, 1_500),
      visibleChange: input.visibleChange.trim().slice(0, 1_500),
      viewerUnderstanding: input.viewerUnderstanding.trim().slice(0, 1_500),
      status: "execution-failed",
      strengths: [],
      weaknesses: [],
      implementationDefects: [],
      runtimeIssues: unique(input.runtimeIssues),
      recordedAt: new Date().toISOString(),
    };
    this.actionsValue.push(action);
    this.recommendedMoveValue = "Repair the exact failed action against the unchanged current revision, then continue the same design process.";
    return action;
  }

  modelView(): NorthstarLinearDesignMemoryView {
    const applied = this.actionsValue.filter((action) => action.status === "applied");
    const latest = applied.at(-1);
    return {
      version: NORTHSTAR_LINEAR_DESIGN_SESSION_VERSION,
      objective: this.objective,
      currentDesignDirection: this.designDirectionValue,
      appliedActionCount: applied.length,
      authoringFailureCount: this.authoringFailureCount,
      executionFailureCount: this.executionFailureCount,
      nextActionIndex: this.nextActionIndex,
      actions: this.actionsValue.slice(-16),
      currentStrengths: unique(latest?.strengths ?? []),
      currentWeaknesses: unique(latest?.weaknesses ?? []),
      unresolvedImplementationDefects: unique(latest?.implementationDefects ?? []),
      lastRecommendedMove: this.recommendedMoveValue,
    };
  }
}

export interface NorthstarLinearDesignArtifactContext {
  artifactId?: string;
  revisionId: string;
  title?: string;
  description?: string;
  document?: NorthstarWebArtifactDocument;
  mutationJournal?: unknown[];
}

export function buildNorthstarLinearDesignContext(input: {
  objective: string;
  userRequest: string;
  audience: string;
  artifactType: string;
  thinkingDepth: "low" | "medium" | "high";
  artifact: NorthstarLinearDesignArtifactContext;
  renderedWidth: number;
  renderedHeight: number;
  editableSurface: unknown;
  groundedResearch: unknown;
  runtimeReview?: unknown;
  memory: NorthstarLinearDesignMemoryView;
  evidenceAliases: unknown;
  priorCorrection?: { critique: string; requiredChanges: string[] };
  designIntelligence?: unknown;
  finalization?: {
    required: boolean;
    reason: "duration-window";
    remainingTimeMs: number;
  };
}): string {
  const thinkingPolicy = northstarThinkingModePolicy(input.thinkingDepth);
  return JSON.stringify({
    mode: "northstar-linear-living-artboard-design",
    objective: input.objective,
    userRequest: input.userRequest,
    audience: input.audience,
    artifactType: input.artifactType,
    thinkingDepth: input.thinkingDepth,
    currentLivingArtboard: {
      artifact: input.artifact,
      observedRenderMeasurement: {
        width: input.renderedWidth,
        height: input.renderedHeight,
        note: "Observation only. Any finite non-empty content-derived size is valid. Runtime measurement owns the iframe and outer Canvas geometry; never treat width or height magnitude alone as an execution fault.",
      },
      editableSurface: input.editableSurface,
      runtimeReview: input.runtimeReview,
    },
    currentDesignAuthorship: input.artifact.document
      ? buildNorthstarCurrentDesignReading({
          document: input.artifact.document,
          editableSurface: input.editableSurface,
        })
      : undefined,
    groundedResearch: input.groundedResearch,
    evidenceAliases: input.evidenceAliases,
    designMemory: input.memory,
    currentDesignIntelligence: input.designIntelligence,
    priorCorrection: input.priorCorrection,
    thinkingModeContract: {
      mode: input.thinkingDepth,
      deliberation: thinkingPolicy.deliberation,
      providerThinkingLevel: thinkingPolicy.providerThinkingLevel,
      actionLimit: null,
      maxCreativeDurationMs: thinkingPolicy.maxCreativeDurationMs,
      finalizationReserveMs: thinkingPolicy.finalizationReserveMs,
      completionAuthority: input.thinkingDepth === "high"
        ? "Northstar continues until it independently declares the objective complete or the user stops the run."
        : "Northstar may declare completion at any turn. Near the invocation boundary, one reserved broad final action completes the current objective.",
    },
    finalization: input.finalization,
    canonicalGeometryContract: {
      authority: "The runtime derives exact artboard bounds from authored content. The creative model never sets root width, height, min/max size, inline/block size, request-space, or a standard viewport.",
      interpretation: "A large finite artboard is not a runtime defect. Runtime measurement derives bounds from the authored source; this sequencing layer does not prescribe visual changes to child content.",
      forbiddenRecommendation: "Never recommend forcing, resetting, constraining, or standardizing root artboard dimensions.",
    },
    actionContract: {
      unitOfWork: "one precise cumulative design action against the exact current artboard",
      outcome: "The browser shows the action immediately. The next turn observes the exact result.",
      failure: "Only a mechanical execution or protected-evidence failure restores the unchanged current revision.",
      creativeAuthority: "There is no external creative acceptance or rejection. Visual weaknesses become the next design action.",
    },
    instruction: input.finalization?.required
      ? [
          "This is the final completion turn. Apply the single canonical source-authoring contract supplied separately to the exact current artboard.",
          "Do not set or recommend root artboard dimensions. Return designContinuity first, set continueWorking to false, and complete the user objective in this turn.",
        ].join(" ")
      : [
          "Apply the single canonical source-authoring contract supplied separately to the exact current artboard.",
          "This layer only sequences one cumulative action. Record continuity in designContinuity, do not set root artboard dimensions, and return the next action for the current turn.",
        ].join(" "),
  });
}

export function buildNorthstarLinearCritiqueContext(input: {
  objective: string;
  userRequest: string;
  intention: string;
  viewerUnderstanding: string;
  visibleChange: string;
  groundedResearch: unknown;
  runtimeReview?: unknown;
  memory: NorthstarLinearDesignMemoryView;
}): string {
  return JSON.stringify({
    mode: "northstar-linear-rendered-self-critique",
    objective: input.objective,
    userRequest: input.userRequest,
    action: {
      intention: input.intention,
      intendedViewerUnderstanding: input.viewerUnderstanding,
      declaredVisibleChange: input.visibleChange,
    },
    groundedResearch: input.groundedResearch,
    runtimeReview: input.runtimeReview,
    designMemory: input.memory,
    instruction: [
      "Inspect the before and after images as the designer of one continuously evolving artboard.",
      "State what actually changed, what improved, what remains weak, and any concrete implementation defect. Compare before and after for continuity of typography, palette, spacing, topology, screenshot grouping, sequence, aspect ratio, and relative scale.",
      "Continue only when you can name a specific consequential next action. Stop only when the user request and Northstar design principles are already satisfied.",
      "Do not reject or discard the current design. Weaknesses and defects are repaired by the next atomic action. Do not praise intended hierarchy or continuity when the rendered pixels contradict it.",
    ].join(" "),
  });
}


export function northstarLinearCritiqueSystemInstruction(): string {
  return `
You are Northstar, the same designer actively evolving one living artboard.

Inspect the exact before and after renders of the action you just applied. This is self-critique inside one continuous design process, not an approval review.
- State what actually changed, what became clearer, and what remains weak. Compare the before and after pixels for typography, palette, spacing rhythm, layout topology, screenshot grouping, sequence, aspect ratio, and relative scale.
- Put only browser-proven source or runtime faults in implementationDefects: missing or obscured grounded evidence, broken assets, invalid protected identity, unsafe overlap, clipping, or an execution fault.
- Put hierarchy, taste, synthesis, density, balance, storytelling, design-language drift, generic vertical reflow, accidental screenshot enlargement, and polish opportunities in whatStillWeak so they become the next design action.
- Never reject or discard the current artboard. The applied revision remains current; any weakness is repaired by the next atomic action.
- Continue only when you can name a specific consequential next action. Stop only when the user request and Northstar design principles are already satisfied by the pixels you can see.
- Do not invent geometry problems. Use the structured browser observation and the actual images. When fresh rendered pixels are unavailable, do not claim visual success from source intent alone; describe only source-grounded facts and request visual confirmation on the next available turn.
- Return only the required critique JSON.
`.trim();
}

export function northstarLinearCreativeSystemInstruction(baseInstruction: string): string {
  return baseInstruction
    .replaceAll("accepted live creative acts", "applied design actions")
    .replaceAll("accepted browser revision", "current browser revision")
    .replaceAll("accepted revision", "current revision")
    .replaceAll("accepted-revision shield", "ordered atomic action boundary")
    .replaceAll("accepted act", "applied action")
    .replaceAll("accept or restore", "apply or mechanically restore")
    .concat("\n\nLINEAR SESSION ORCHESTRATION\n- The supplied source-authoring instruction is the sole visual-design authority. This layer adds no visual, evidence, layout, or composition rules.\n- You are editing one current artboard; every mechanically executable action becomes the visible current revision immediately.\n- Work from the exact current source, screenshot, ordered history, current design direction, and currentDesignAuthorship facts.\n- Low, Medium, and High control deliberation depth per decision, never the number of actions you may take.\n- When finalization.required is true, complete the current objective in this action and set continueWorking to false.\n");
}
