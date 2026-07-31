// Northstar linear design session v1 — one ordered history for one living artboard.

export const NORTHSTAR_LINEAR_DESIGN_SESSION_VERSION =
  "northstar.linear-design-session.v1" as const;

export type NorthstarLinearDesignActionStatus = "applied" | "execution-failed";

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
  executionFailureCount: number;
  nextActionIndex: number;
  actions: NorthstarLinearDesignActionMemory[];
  currentStrengths: string[];
  currentWeaknesses: string[];
  unresolvedImplementationDefects: string[];
  lastRecommendedMove?: string;
}

export function northstarLinearDesignActionBudget(
  thinkingDepth: "low" | "medium" | "high",
): number {
  if (thinkingDepth === "high") return 10;
  if (thinkingDepth === "medium") return 8;
  return 6;
}

function unique(values: readonly string[], limit = 24): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

export class NorthstarLinearDesignSession {
  private readonly actionsValue: NorthstarLinearDesignActionMemory[] = [];
  private designDirectionValue?: string;
  private recommendedMoveValue?: string;

  constructor(
    readonly objective: string,
    readonly thinkingDepth: "low" | "medium" | "high",
  ) {}

  get actionBudget(): number {
    return northstarLinearDesignActionBudget(this.thinkingDepth);
  }

  get attemptedActionCount(): number {
    return this.actionsValue.length;
  }

  get appliedActionCount(): number {
    return this.actionsValue.filter((action) => action.status === "applied").length;
  }

  get executionFailureCount(): number {
    return this.actionsValue.filter((action) => action.status === "execution-failed").length;
  }

  get nextActionIndex(): number {
    return this.actionsValue.length + 1;
  }

  hasBudget(): boolean {
    return this.attemptedActionCount < this.actionBudget;
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

export function buildNorthstarLinearDesignContext(input: {
  objective: string;
  userRequest: string;
  audience: string;
  artifactType: string;
  thinkingDepth: "low" | "medium" | "high";
  artifact: unknown;
  renderedWidth: number;
  renderedHeight: number;
  editableSurface: unknown;
  groundedResearch: unknown;
  runtimeReview?: unknown;
  memory: NorthstarLinearDesignMemoryView;
  evidenceAliases: unknown;
  priorCorrection?: { critique: string; requiredChanges: string[] };
  designIntelligence?: unknown;
}): string {
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
        note: "Observation only. Runtime content measurement owns the iframe and outer Canvas geometry.",
      },
      editableSurface: input.editableSurface,
      runtimeReview: input.runtimeReview,
    },
    groundedResearch: input.groundedResearch,
    evidenceAliases: input.evidenceAliases,
    designMemory: input.memory,
    currentDesignIntelligence: input.designIntelligence,
    priorCorrection: input.priorCorrection,
    actionContract: {
      unitOfWork: "one precise cumulative design action against the exact current artboard",
      outcome: "The browser shows the action immediately. The next turn observes the exact result.",
      failure: "Only a mechanical execution or protected-evidence failure restores the unchanged current revision.",
      creativeAuthority: "There is no external creative acceptance or rejection. Visual weaknesses become the next design action.",
    },
    instruction: [
      "Choose the single highest-value visual action now and author it as a cumulative source edit of the existing premium Northstar presentation.",
      "Preserve every strong part of the current artboard and every grounded evidence identity. Do not recreate the research foundation, evidence reservoir, tenant retrieval, or outer shell.",
      "You may change the current design direction when the exact render reveals a stronger solution; record that stronger direction in designIntelligence and execute it visibly.",
      "Use sourceEdit to update the presentation region and exactActions only for precise supplemental DOM changes. Never replace the permanent artboard root or remove grounded evidence.",
      "Do not wait for creative approval. The next model turn will see the rendered result and self-correct anything weak or incorrectly applied.",
      "Return one meaningful stage rather than hiding several stages in one response.",
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
      "State what actually changed, what improved, what remains weak, and any concrete implementation defect.",
      "Continue only when you can name a specific consequential next action. Stop only when the user request and Northstar design principles are already satisfied.",
      "Do not reject or discard the current design. Weaknesses and defects are repaired by the next atomic action.",
    ].join(" "),
  });
}


export function northstarLinearCritiqueSystemInstruction(): string {
  return `
You are Northstar, the same designer actively evolving one living artboard.

Inspect the exact before and after renders of the action you just applied. This is self-critique inside one continuous design process, not an approval review.
- State what actually changed, what became clearer, and what remains weak.
- Put only browser-proven source or runtime faults in implementationDefects: missing or obscured grounded evidence, broken assets, invalid protected identity, unsafe overlap, clipping, or an execution fault.
- Put hierarchy, taste, synthesis, density, balance, storytelling, and polish opportunities in whatStillWeak so they become the next design action.
- Never reject or discard the current artboard. The applied revision remains current; any weakness is repaired by the next atomic action.
- Continue only when you can name a specific consequential next action. Stop only when the user request and Northstar design principles are already satisfied by the pixels you can see.
- Do not invent geometry problems. Use the structured browser observation and the actual images.
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
    .concat("\n\nLINEAR LIVING-ARTBOARD AUTHORITY\n- You are not submitting a candidate for creative approval. You are editing one current artboard.\n- Every mechanically executable action becomes the visible current revision immediately.\n- Visual-quality findings are material for your next self-correction, never an external veto.\n- Work cumulatively from the exact current source, screenshot, ordered history, and current design direction.\n- Do not rebuild the research foundation, external-data retrieval, tenant grounding, evidence reservoir, or premium Northstar shell. Those already exist and are outside this design-stage action.\n");
}
