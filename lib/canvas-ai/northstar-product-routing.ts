import type { NorthstarWorkspaceRuntimeSnapshot } from "@/lib/canvas-architecture/northstar-workspace-runtime";
import type { NorthstarLedgerFailure, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

export type NorthstarProductMessageRoute = "legacy-conversation" | "ledger-authoring";

export interface RouteNorthstarProductMessageInput {
  message: string;
  hasAttachments: boolean;
  contextMode: "canvas" | "selection";
}

export interface NorthstarProductRunBinding {
  assistantMessageId: string;
  objective: string;
  runId: string | null;
}

const CASUAL_ONLY = /^(?:hi|hello|hey|hiya|yo|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|cheers|how\s+are\s+you|what\s+can\s+you\s+do|help)\s*[!.?]*$/i;
const AUTHORING_VERB = /\b(?:build|create|design|compose|make|draft|generate|lay\s*out|layout|arrange|author|produce|turn\s+this\s+into|visualize|visualise|map|diagram|storyboard|redesign|rework|revise|refine|reorganize|reorganise)\b/i;
const ARTIFACT_NOUN = /\b(?:canvas|artboard|board|visual|comparison|diagram|map|presentation|slide|storyboard|journey|flow|layout|poster|dashboard|wireframe|working\s+surface|executive\s+summary|screenshots?)\b/i;
const MUTATION_REQUEST = /\b(?:add|insert|remove|delete|move|resize|restyle|change|update|edit)\b/i;

/**
 * Phase 4R is deliberately conservative. Ambiguous text stays on the proven
 * conversational path. The ledger-owned authoring runtime is selected only for
 * a clear, text-only, whole-canvas build objective.
 */
export function routeNorthstarProductMessage(
  input: RouteNorthstarProductMessageInput,
): NorthstarProductMessageRoute {
  const message = input.message.trim();
  if (!message || input.hasAttachments || input.contextMode === "selection") {
    return "legacy-conversation";
  }
  if (CASUAL_ONLY.test(message)) return "legacy-conversation";
  if (AUTHORING_VERB.test(message) && (ARTIFACT_NOUN.test(message) || message.split(/\s+/).length >= 5)) {
    return "ledger-authoring";
  }
  if (MUTATION_REQUEST.test(message) && ARTIFACT_NOUN.test(message)) {
    return "ledger-authoring";
  }
  return "legacy-conversation";
}

/**
 * A runtime snapshot may update only the assistant message that owns its run.
 * A ledger from an older objective must never be attached to a newer chat turn.
 */
export function resolveNorthstarProductRunBinding(
  binding: NorthstarProductRunBinding | null,
  snapshot: NorthstarWorkspaceRuntimeSnapshot,
): NorthstarProductRunBinding | null {
  const ledger = snapshot.ledger;
  if (!binding || !ledger) return null;
  if (binding.runId !== null) {
    return binding.runId === ledger.run.id ? binding : null;
  }
  if (binding.objective !== ledger.run.objective) return null;
  return { ...binding, runId: ledger.run.id };
}

export function latestNorthstarFailure(
  snapshot: NorthstarWorkspaceRuntimeSnapshot,
): NorthstarLedgerFailure | undefined {
  if (
    snapshot.lastStep?.type === "task-blocked" ||
    snapshot.lastStep?.type === "control-blocked"
  ) {
    return snapshot.lastStep.failure;
  }
  const attempts = snapshot.ledger?.attempts ?? [];
  return [...attempts]
    .reverse()
    .find((attempt) => attempt.failure)?.failure;
}

function northstarFailureTarget(failure: NorthstarLedgerFailure): string | null {
  const context = failure.correctionContext;
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const record = context as Record<string, NorthstarLedgerValue>;
  const toolName = typeof record.toolName === "string" ? record.toolName : null;
  const argumentsValue = record.arguments;
  if (!toolName) return null;
  const argumentsText = argumentsValue === undefined ? "" : ` with ${JSON.stringify(argumentsValue)}`;
  return `${toolName}${argumentsText}`;
}


function northstarSafeFailureDetail(failure: NorthstarLedgerFailure): string {
  if (failure.code === "MODEL_OUTPUT_INVALID" || /\$\.[A-Za-z0-9_.\[\]]+/.test(failure.detail)) {
    const context = failure.correctionContext;
    const validationCode = context && typeof context === "object" && !Array.isArray(context)
      && typeof (context as Record<string, NorthstarLedgerValue>).validationCode === "string"
      ? (context as Record<string, NorthstarLedgerValue>).validationCode as string
      : null;
    return validationCode
      ? `The structured model result failed ${validationCode}. The successful tenant evidence remains retained for result-only recovery.`
      : "The structured model result was invalid. Successful tenant evidence remains retained for result-only recovery.";
  }
  return failure.detail;
}

export function northstarUserFacingRunMessage(
  snapshot: NorthstarWorkspaceRuntimeSnapshot,
  fallback?: string,
): string {
  if (snapshot.status === "awaiting-recovery") {
    return "North Star lost confirmation for the latest request. Your last verified artboard is safe, and the exact same task can be resumed without duplicating work.";
  }
  if (snapshot.status === "cancelled") {
    return "The build was cancelled. The last verified artboard was preserved.";
  }
  const failure = latestNorthstarFailure(snapshot);
  if (failure?.phase === "projection") {
    return "North Star could not verify the latest visual change, so it restored the last verified artboard. No unverified change was kept.";
  }
  if (failure?.kind === "correctable") {
    const target = northstarFailureTarget(failure);
    return `North Star paused on ${target ?? "the latest bounded task"}. ${failure.code}: ${northstarSafeFailureDetail(failure)} The last verified artboard is unchanged, and this task can be corrected without restarting the build.`;
  }
  if (failure?.kind === "transient") {
    return `North Star hit a temporary problem (${failure.code}): ${northstarSafeFailureDetail(failure)} The verified work completed so far is still safe.`;
  }
  if (failure) {
    return `North Star stopped at the last verified artboard. ${failure.code}: ${northstarSafeFailureDetail(failure)}`;
  }
  if (snapshot.status === "blocked" || snapshot.status === "failed") {
    return "North Star stopped because of an internal authoring error. No unverified visual changes were kept. Cancel this build before starting another authoring request.";
  }
  return fallback ?? "North Star stopped at the last verified artboard.";
}

export type NorthstarRecoveryKind = "transport" | "task" | "none";

export function northstarRecoveryKind(
  snapshot: NorthstarWorkspaceRuntimeSnapshot,
): NorthstarRecoveryKind {
  if (snapshot.status === "awaiting-recovery") return "transport";
  if (snapshot.status !== "blocked") return "none";
  const failure = latestNorthstarFailure(snapshot);
  return failure && failure.kind !== "terminal" ? "task" : "none";
}
