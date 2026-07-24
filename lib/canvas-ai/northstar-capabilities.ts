import type { NorthStarToolArguments } from "@/lib/canvas-ai/northstar-tool-registry";

export const NORTHSTAR_CANVAS_CAPABILITIES = {
  canonicalSurfaceMode: "single-artboard",
  supportsWorkingSurface: false,
  supportsInlineReasoning: true,
  diagnosticsVisibility: "developer-only",
  artifactMutationProtocol: "v1",
} as const;

export const RETIRED_CANVAS_TOOL_NAMES = new Set([
  "create_working_surface",
  "update_working_surface",
]);

export type CapabilityPlanStep = {
  id: string;
  tool: string;
  arguments?: NorthStarToolArguments;
};

export type CapabilityViolation = {
  stepId: string;
  code:
    | "RETIRED_TOOL"
    | "PARALLEL_SURFACE_RESULT"
    | "VISIBLE_WORKING_SURFACE"
    | "LEGACY_WORKING_PAYLOAD";
  detail: string;
};

function referencesWorkingSurfaceResult(args: NorthStarToolArguments): boolean {
  return args.resultKey === "working-surface" ||
    args.resultKeys?.includes("working-surface") === true ||
    args.fromResultKey === "working-surface" ||
    args.toResultKey === "working-surface";
}

export function validateNorthstarCapabilityPlan(
  steps: readonly CapabilityPlanStep[],
): CapabilityViolation[] {
  const violations: CapabilityViolation[] = [];

  for (const step of steps) {
    const args = step.arguments;
    if (RETIRED_CANVAS_TOOL_NAMES.has(step.tool)) {
      violations.push({
        stepId: step.id,
        code: "RETIRED_TOOL",
        detail: `${step.tool} is retired by the single-artboard capability contract.`,
      });
    }
    if (!args) continue;
    if (referencesWorkingSurfaceResult(args)) {
      violations.push({
        stepId: step.id,
        code: "PARALLEL_SURFACE_RESULT",
        detail: "working-surface result dependencies are not supported.",
      });
    }
    if (args.workingVisibility === "visible" || args.workingVisibility === "compact") {
      violations.push({
        stepId: step.id,
        code: "VISIBLE_WORKING_SURFACE",
        detail: "Composition work must remain inside the canonical artboard.",
      });
    }
    if (args.workingNotesJson || args.workingNoteJson || args.workspacePlanJson) {
      violations.push({
        stepId: step.id,
        code: "LEGACY_WORKING_PAYLOAD",
        detail: "Legacy working-surface payload fields are not supported.",
      });
    }
  }

  return violations;
}

export function normalizeNorthstarCapabilityStep<T extends CapabilityPlanStep>(
  step: T,
): T | null {
  if (RETIRED_CANVAS_TOOL_NAMES.has(step.tool)) return null;
  if (!step.arguments) return step;

  const {
    workingNotesJson: _workingNotesJson,
    workingNoteJson: _workingNoteJson,
    workspacePlanJson: _workspacePlanJson,
    ...argumentsWithoutLegacyPayload
  } = step.arguments;

  const resultKeys = argumentsWithoutLegacyPayload.resultKeys?.filter(
    (key) => key !== "working-surface",
  );
  const normalizedArguments: NorthStarToolArguments = {
    ...argumentsWithoutLegacyPayload,
    workingVisibility: argumentsWithoutLegacyPayload.workingVisibility
      ? "hidden"
      : undefined,
    resultKey: argumentsWithoutLegacyPayload.resultKey === "working-surface"
      ? undefined
      : argumentsWithoutLegacyPayload.resultKey,
    resultKeys,
    fromResultKey: argumentsWithoutLegacyPayload.fromResultKey === "working-surface"
      ? undefined
      : argumentsWithoutLegacyPayload.fromResultKey,
    toResultKey: argumentsWithoutLegacyPayload.toResultKey === "working-surface"
      ? undefined
      : argumentsWithoutLegacyPayload.toResultKey,
  };

  return { ...step, arguments: normalizedArguments };
}
