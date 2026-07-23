import type { NorthstarWorkspaceRuntimeSnapshot } from "@/lib/canvas-architecture/northstar-workspace-runtime";
import type {
  NorthstarLedgerCommit,
  NorthstarLedgerFailure,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";

export const NORTHSTAR_RUN_DIAGNOSTICS_SCHEMA = "northstar.run-diagnostics.v1" as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ledgerValue(value: unknown): NorthstarLedgerValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(ledgerValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, ledgerValue(entry)]),
    );
  }
  return String(value);
}

function latestFailure(attempts: readonly NorthstarLedgerTaskAttempt[]): {
  attemptId: string;
  taskId: string;
  failure: NorthstarLedgerFailure;
} | null {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    const failure = attempt.failure
      ?? attempt.projectionFailures?.at(-1)
      ?? attempt.preparationFailures?.at(-1);
    if (failure) return { attemptId: attempt.id, taskId: attempt.taskId, failure };
  }
  return null;
}

function isVerifiedVisualCommit(commit: NorthstarLedgerCommit): boolean {
  return commit.taskKind === "artboard-mutation" && commit.projectionReceipt?.verified === true;
}

export interface NorthstarRunDiagnosticBundle {
  schema: typeof NORTHSTAR_RUN_DIAGNOSTICS_SCHEMA;
  exportedAt: string;
  runtime: NorthstarLedgerValue;
  summary: NorthstarLedgerValue;
  latestFailure: NorthstarLedgerValue;
  projectionFailures: NorthstarLedgerValue;
  ledger: NorthstarLedgerValue;
}

export function buildNorthstarRunDiagnosticBundle(
  snapshot: NorthstarWorkspaceRuntimeSnapshot,
  options: {
    exportedAt?: Date;
    browser?: NorthstarLedgerValue;
    featureFlags?: NorthstarLedgerValue;
  } = {},
): NorthstarRunDiagnosticBundle {
  const exportedAt = options.exportedAt ?? new Date();
  const ledger = snapshot.ledger;
  const visualCommits = ledger?.commits.filter(isVerifiedVisualCommit) ?? [];
  const taskCommits = ledger?.commits.filter((commit) => commit.kind === "task") ?? [];
  const failure = ledger ? latestFailure(ledger.attempts) : null;
  const projectionFailures = ledger?.attempts.flatMap((attempt) =>
    (attempt.projectionFailures ?? []).map((projectionFailure, index) => ({
      taskId: attempt.taskId,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      failureIndex: index,
      candidateCommitHash: attempt.candidateCommitHash ?? null,
      candidateStateHash: attempt.candidateStateHash ?? null,
      failure: projectionFailure,
    })),
  ) ?? [];

  return {
    schema: NORTHSTAR_RUN_DIAGNOSTICS_SCHEMA,
    exportedAt: exportedAt.toISOString(),
    runtime: ledgerValue({
      status: snapshot.status,
      error: snapshot.error ?? null,
      recovery: snapshot.recovery ?? null,
      projectionHost: snapshot.projectionHost ?? null,
      lastStep: snapshot.lastStep ?? null,
      finalSummary: snapshot.finalSummary ?? null,
      browser: options.browser ?? null,
      featureFlags: options.featureFlags ?? null,
    }),
    summary: ledgerValue({
      runId: ledger?.run.id ?? null,
      runStatus: ledger?.run.status ?? null,
      activeTaskId: ledger?.activeTask?.id ?? null,
      headCommitHash: ledger?.run.headCommitHash ?? null,
      headStateHash: ledger?.headCommit.stateHash ?? null,
      taskCount: ledger?.tasks.length ?? 0,
      completedTaskCount: ledger?.tasks.filter((task) => task.status === "completed").length ?? 0,
      attemptCount: ledger?.attempts.length ?? 0,
      ledgerTaskCommitCount: taskCommits.length,
      verifiedVisualCommitCount: visualCommits.length,
      verifiedVisualCommits: visualCommits.map((commit) => ({
        sequence: commit.sequence,
        hash: commit.hash,
        stateHash: commit.stateHash,
        taskId: commit.taskId,
        attemptId: commit.attemptId,
        surfaceSessionId: commit.projectionReceipt?.surfaceSessionId ?? null,
        projectedAt: commit.projectionReceipt?.projectedAt ?? null,
      })),
      eventCount: ledger?.events.length ?? 0,
    }),
    latestFailure: ledgerValue(failure),
    projectionFailures: ledgerValue(projectionFailures),
    ledger: ledgerValue(ledger),
  };
}

export function serializeNorthstarRunDiagnosticBundle(
  snapshot: NorthstarWorkspaceRuntimeSnapshot,
  options?: Parameters<typeof buildNorthstarRunDiagnosticBundle>[1],
): string {
  return JSON.stringify(buildNorthstarRunDiagnosticBundle(snapshot, options), null, 2);
}
