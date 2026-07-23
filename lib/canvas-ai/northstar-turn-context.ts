import type {
  NorthstarLedgerLLMContext,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";
import {
  collectNorthstarKnownEvidenceIdentities,
  exactIdentityLedgerValues,
} from "@/lib/canvas-ai/northstar-evidence-identities";

const TARGET_CONTEXT_CHARACTERS = 900_000;
const KEEP_RECENT_ATTEMPTS = 18;
const KEEP_RECENT_COMMITS = 24;
const KEEP_RECENT_EVENTS = 96;

function serializedLength(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function compactAttemptEvidence(attempt: NorthstarLedgerTaskAttempt): NorthstarLedgerTaskAttempt {
  if (attempt.evidence === undefined || serializedLength(attempt.evidence) < 80_000) return attempt;
  const identities = exactIdentityLedgerValues(collectNorthstarKnownEvidenceIdentities(attempt.evidence));
  const evidenceRecord = attempt.evidence && typeof attempt.evidence === "object" && !Array.isArray(attempt.evidence)
    ? attempt.evidence as Record<string, NorthstarLedgerValue>
    : {};
  const evidenceAttachmentReport = evidenceRecord.evidenceAttachmentReport;
  const modelDiagnostic = evidenceRecord.modelDiagnostic;
  return {
    ...attempt,
    evidence: {
      compacted: true,
      exactIdentities: identities,
      ...(evidenceAttachmentReport !== undefined ? { evidenceAttachmentReport } : {}),
      ...(modelDiagnostic !== undefined ? { modelDiagnostic } : {}),
    },
  };
}

/**
 * Keeps the current HEAD intact while bounding historical transport payloads.
 * The ledger remains authoritative and unmodified; only the read-only model
 * view is compacted.
 */
export function compactNorthstarLedgerContextForTurn(
  context: NorthstarLedgerLLMContext,
  targetCharacters = TARGET_CONTEXT_CHARACTERS,
): NorthstarLedgerLLMContext {
  if (serializedLength(context) <= targetCharacters) return context;

  const recentAttempts = context.attempts.slice(-KEEP_RECENT_ATTEMPTS).map(compactAttemptEvidence);
  const importantAttemptIds = new Set(recentAttempts.map((attempt) => attempt.id));
  for (const schema of [
    "northstar.research-result.v1",
    "northstar.design-intelligence-result.v1",
    "northstar.verification-result.v1",
  ]) {
    const attempt = [...context.attempts].reverse().find((candidate) =>
      candidate.result && typeof candidate.result === "object" && !Array.isArray(candidate.result)
      && (candidate.result as Record<string, unknown>).schema === schema
    );
    if (attempt) importantAttemptIds.add(attempt.id);
  }
  const attempts = context.attempts
    .filter((attempt) => importantAttemptIds.has(attempt.id))
    .map(compactAttemptEvidence);
  const taskIds = new Set(attempts.map((attempt) => attempt.taskId));
  context.commits.slice(-KEEP_RECENT_COMMITS).forEach((commit) => {
    if (commit.taskId) taskIds.add(commit.taskId);
  });

  return {
    ...context,
    activeTask: context.activeTask
      ? {
          task: context.activeTask.task,
          attempts: context.activeTask.attempts.map(compactAttemptEvidence),
        }
      : null,
    tasks: context.tasks.filter((task) => taskIds.has(task.id) || task.status === "active").slice(-48),
    attempts,
    commits: context.commits.slice(-KEEP_RECENT_COMMITS),
    events: context.events.slice(-KEEP_RECENT_EVENTS),
  };
}
