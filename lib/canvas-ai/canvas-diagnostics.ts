import { NORTHSTAR_HEALTH_POLICY } from "@/lib/canvas-ai/northstar-health-policy";
import type {
  NorthstarArtboardMutationBatch,
  NorthstarWebArtifactDocument,
} from "@/lib/canvas-artifacts/types";

export type CanvasDiagnosticEvent = {
  id: string;
  timestamp: string;
  runId?: string;
  actionId?: string;
  stepId?: string;
  phase: "run" | "action" | "mutation" | "selection" | "cleanup" | "runtime" | "persistence" | "error";
  name: string;
  detail?: string;
  data?: Record<string, unknown>;
};

type DiagnosticSanitizationStats = {
  redactedFieldCount: number;
  truncatedStringCount: number;
  truncatedCollectionCount: number;
  circularReferenceCount: number;
};

const policy = NORTHSTAR_HEALTH_POLICY.diagnostics;
const MAX_EVENTS = policy.maxEvents;
const events: CanvasDiagnosticEvent[] = [];
export type NorthstarCandidateSourceArchive = {
  runId?: string;
  artifactId: string;
  revisionId: string;
  baseRevisionId?: string;
  mutationId: string;
  capturedAt: string;
  status: "staged" | "committed" | "rejected" | "timed_out";
  reason?: string;
  baseDocument: NorthstarWebArtifactDocument;
  mutationBatch: NorthstarArtboardMutationBatch;
};
const candidateSourceArchives = new Map<string, NorthstarCandidateSourceArchive>();

export type NorthstarDesignTurnAuditArchive = {
  schema: string;
  runId: string;
  artifactId: string;
  turn: number;
  recordedAt: string;
  [key: string]: unknown;
};
const designTurnAuditArchives: NorthstarDesignTurnAuditArchive[] = [];
const listeners = new Set<() => void>();
const sensitiveKeyPattern = new RegExp(policy.sensitiveKeyPattern, "i");
const bulkyKeyPattern = new RegExp(policy.bulkyKeyPattern, "i");

function makeEventId() {
  return `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function stableStringHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function truncateDiagnosticString(value: string, stats: DiagnosticSanitizationStats, forceSummary = false) {
  if (!forceSummary && value.length <= policy.maxStringLength) return value;
  stats.truncatedStringCount += 1;
  const preview = value.slice(0, policy.previewLength);
  return {
    _diagnosticSummary: "string-truncated",
    length: value.length,
    hash: stableStringHash(value),
    preview,
  };
}

function sanitizeDiagnosticValue(
  value: unknown,
  stats: DiagnosticSanitizationStats,
  seen: WeakSet<object>,
  depth: number,
  key = "",
): unknown {
  if (sensitiveKeyPattern.test(key)) {
    stats.redactedFieldCount += 1;
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return truncateDiagnosticString(value, stats, bulkyKeyPattern.test(key));
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();

  if (depth >= policy.maxDepth) {
    stats.truncatedCollectionCount += 1;
    return "[maximum diagnostic depth reached]";
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      stats.circularReferenceCount += 1;
      return "[circular reference]";
    }
    seen.add(value);

    if (Array.isArray(value)) {
      const limited = value.slice(0, policy.maxArrayItems).map((item) =>
        sanitizeDiagnosticValue(item, stats, seen, depth + 1),
      );
      if (value.length > policy.maxArrayItems) {
        stats.truncatedCollectionCount += 1;
        limited.push({
          _diagnosticSummary: "array-truncated",
          omittedItemCount: value.length - policy.maxArrayItems,
        });
      }
      return limited;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, childValue]) => typeof childValue !== "undefined");
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of entries.slice(0, policy.maxObjectKeys)) {
      output[childKey] = sanitizeDiagnosticValue(childValue, stats, seen, depth + 1, childKey);
    }
    if (entries.length > policy.maxObjectKeys) {
      stats.truncatedCollectionCount += 1;
      output._diagnosticTruncation = {
        omittedKeyCount: entries.length - policy.maxObjectKeys,
      };
    }
    return output;
  }

  return String(value);
}

export function sanitizeCanvasDiagnosticEvent(
  event: Omit<CanvasDiagnosticEvent, "id" | "timestamp">,
): Omit<CanvasDiagnosticEvent, "id" | "timestamp"> & { sanitization?: DiagnosticSanitizationStats } {
  const stats: DiagnosticSanitizationStats = {
    redactedFieldCount: 0,
    truncatedStringCount: 0,
    truncatedCollectionCount: 0,
    circularReferenceCount: 0,
  };
  const sanitized = sanitizeDiagnosticValue(event, stats, new WeakSet<object>(), 0) as Omit<
    CanvasDiagnosticEvent,
    "id" | "timestamp"
  >;
  const changed = Object.values(stats).some((count) => count > 0);
  return changed ? { ...sanitized, sanitization: stats } : sanitized;
}

export function recordCanvasDiagnostic(event: Omit<CanvasDiagnosticEvent, "id" | "timestamp">) {
  const sanitized = sanitizeCanvasDiagnosticEvent(event);
  events.push({ ...sanitized, id: makeEventId(), timestamp: new Date().toISOString() });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  listeners.forEach((listener) => listener());
}

export function recordNorthstarCandidateSourceArchive(
  archive: Omit<NorthstarCandidateSourceArchive, "capturedAt" | "status">,
) {
  candidateSourceArchives.set(archive.revisionId, {
    ...structuredClone(archive),
    capturedAt: new Date().toISOString(),
    status: "staged",
  });
  while (candidateSourceArchives.size > 24) {
    const oldestRevisionId = candidateSourceArchives.keys().next().value;
    if (!oldestRevisionId) break;
    candidateSourceArchives.delete(oldestRevisionId);
  }
}

export function recordNorthstarDesignTurnAuditArchive(archive: NorthstarDesignTurnAuditArchive) {
  designTurnAuditArchives.push(structuredClone(archive));
  while (designTurnAuditArchives.length > 12) designTurnAuditArchives.shift();
  listeners.forEach((listener) => listener());
}

export function settleNorthstarCandidateSourceArchive(input: {
  revisionId: string;
  status: NorthstarCandidateSourceArchive["status"];
  reason?: string;
}) {
  const current = candidateSourceArchives.get(input.revisionId);
  if (!current) return;
  candidateSourceArchives.set(input.revisionId, {
    ...current,
    status: input.status,
    reason: input.reason,
  });
}

export function getCanvasDiagnostics() {
  return events.slice();
}

export type CanvasDiagnosticSeverity = "problem" | "warning" | "recovered" | "info";

function terminalEventForDiagnosticRun(
  event: CanvasDiagnosticEvent,
  sourceEvents: readonly CanvasDiagnosticEvent[],
): CanvasDiagnosticEvent | undefined {
  if (!event.runId) return undefined;
  return [...sourceEvents].reverse().find((candidate) =>
    candidate.runId === event.runId
    && (candidate.name === "run.completed"
      || candidate.name === "run.completed_with_notes"
      || candidate.name === "run.incomplete"
      || candidate.name === "run.failed"
      || candidate.name === "run.cancelled")
  );
}

export function classifyCanvasDiagnosticEvent(
  event: CanvasDiagnosticEvent,
  sourceEvents: readonly CanvasDiagnosticEvent[] = events,
): CanvasDiagnosticSeverity {
  const status = typeof event.data?.status === "string"
    ? event.data.status.toLowerCase()
    : "";
  const terminal = terminalEventForDiagnosticRun(event, sourceEvents);
  const runCompleted = terminal?.name === "run.completed" || terminal?.name === "run.completed_with_notes";
  const name = event.name.toLowerCase();
  const detail = (event.detail ?? "").toLowerCase();
  const renderSeverity = typeof event.data?.severity === "string"
    ? event.data.severity.toLowerCase()
    : undefined;

  if (event.name === "run.incomplete" || event.name === "run.failed") return "problem";
  if (
    event.name === "run.cancelled"
    || event.name === "run.completed"
    || event.name === "run.completed_with_notes"
  ) return "info";

  if (
    event.name === "render.health"
    && (renderSeverity === "warning" || /refinement warning/.test(detail))
  ) {
    return "warning";
  }
  if (
    event.name === "linear.design.observation_degraded"
    || event.name === "creative.observation.degraded"
    || event.name === "linear.design.detail_observation_skipped"
    || event.name === "creative.detail_observation.skipped"
  ) {
    return "warning";
  }

  const recoverableCandidateEvent =
    status === "rejected"
    || status === "superseded"
    || status === "skipped"
    || /(?:^|\.)(?:rejected|restored|not_committed|already_present|stale_restore_suppressed|candidate_rejected|continuation_abandoned)$/.test(name)
    || name.includes("preflight_rejected")
    || name.includes("dispatch_rejected");
  if (recoverableCandidateEvent) return runCompleted ? "recovered" : "warning";

  const explicitProblem =
    event.phase === "error"
    || event.data?.healthy === false
    || status === "failed"
    || status === "timed_out"
    || name === "revision.timed_out"
    || name === "ack.delivery_failed"
    || (event.phase === "persistence" && /failed|mismatch/.test(name));
  if (explicitProblem) return "problem";

  return "info";
}

export function summarizeCanvasDiagnosticSeverities(
  scopedEvents: readonly CanvasDiagnosticEvent[],
  sourceEvents: readonly CanvasDiagnosticEvent[] = scopedEvents,
): Record<CanvasDiagnosticSeverity, number> {
  const counts: Record<CanvasDiagnosticSeverity, number> = {
    problem: 0,
    warning: 0,
    recovered: 0,
    info: 0,
  };
  for (const event of scopedEvents) counts[classifyCanvasDiagnosticEvent(event, sourceEvents)] += 1;
  return counts;
}

export type NorthstarRuntimeAuthorityDiagnosticSummary = {
  state:
    | "idle"
    | "foundation-ready"
    | "candidate-staged"
    | "candidate-received"
    | "candidate-committed"
    | "candidate-rejected"
    | "candidate-timed-out";
  acceptedRevisionId?: string;
  candidateRevisionId?: string;
  browserRevisionId?: string;
  stagedCount: number;
  committedCount: number;
  rejectedCount: number;
  timedOutCount: number;
  rollbackCount: number;
  lastRollbackDurationMs?: number;
  lastCandidateDurationMs?: number;
  frameInstanceId?: string;
  surfaceMountCount: number;
  unexpectedRemountCount: number;
  snapshotSanitized?: boolean;
  evidence: {
    expected: number;
    present: number;
    visible: number;
    unplaced: number;
    missing: number;
    collisions: number;
  };
  liveSource: {
    candidateReadyCount: number;
    dispatchedCount: number;
    committedCount: number;
    rejectedCount: number;
    normalizationRetryCount: number;
    hiddenRuntimeExecutions: number;
    mountedBrowserExecutions: number;
    atomicValidationExecutions: number;
    candidateVisibility?: string;
    lastAuthoringLatencyMs?: number;
    firstVisibleTransformationMs?: number;
  };
  lifecycle: {
    authorityReceiptCount: number;
    terminalState?: string;
    classification?: string;
    reasonCode?: string;
    artifactId?: string;
    revisionId?: string;
    operationalRevisionPreserved?: boolean;
    creativeTransformationRequired?: boolean;
    acceptedCreativeActCount: number;
    materialCreativeRevisionId?: string;
    materialCreativeRevisionPreserved?: boolean;
    publicationVerified?: boolean;
    clientReceiptPresent?: boolean;
    failedPredicates: string[];
    knownLimitations: string[];
  };
};

function diagnosticString(data: Record<string, unknown> | undefined, key: string) {
  return typeof data?.[key] === "string" ? data[key] as string : undefined;
}

function diagnosticNumber(data: Record<string, unknown> | undefined, key: string) {
  return typeof data?.[key] === "number" && Number.isFinite(data[key])
    ? data[key] as number
    : undefined;
}

function diagnosticStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Reduces the typed browser lifecycle trace into the exact authority state shown
 * in diagnostics. This is deliberately pure so release tests can prove the
 * diagnostics view without relying on component source-string assertions.
 */
export function summarizeNorthstarRuntimeAuthorityDiagnostics(
  sourceEvents: readonly CanvasDiagnosticEvent[],
): NorthstarRuntimeAuthorityDiagnosticSummary {
  const observedFrameInstanceIds = new Set<string>();
  const runStartedAt = sourceEvents.find((event) => event.name === "run.started")?.timestamp
    ?? sourceEvents[0]?.timestamp;
  let firstLiveCommitAt: string | undefined;
  const summary: NorthstarRuntimeAuthorityDiagnosticSummary = {
    state: "idle",
    stagedCount: 0,
    committedCount: 0,
    rejectedCount: 0,
    timedOutCount: 0,
    rollbackCount: 0,
    surfaceMountCount: 0,
    unexpectedRemountCount: 0,
    evidence: {
      expected: 0,
      present: 0,
      visible: 0,
      unplaced: 0,
      missing: 0,
      collisions: 0,
    },
    liveSource: {
      candidateReadyCount: 0,
      dispatchedCount: 0,
      committedCount: 0,
      rejectedCount: 0,
      normalizationRetryCount: 0,
      hiddenRuntimeExecutions: 0,
      mountedBrowserExecutions: 0,
      atomicValidationExecutions: 0,
    },
    lifecycle: {
      authorityReceiptCount: 0,
      acceptedCreativeActCount: 0,
      failedPredicates: [],
      knownLimitations: [],
    },
  };

  for (const event of sourceEvents) {
    const data = event.data;
    const nestedAuthorityReceipt = data?.authorityReceipt;
    const lifecycleReceipt = event.name === "lifecycle.authority.settled"
      ? data
      : nestedAuthorityReceipt && typeof nestedAuthorityReceipt === "object" && !Array.isArray(nestedAuthorityReceipt)
        ? nestedAuthorityReceipt as Record<string, unknown>
        : undefined;
    if (lifecycleReceipt) {
      if (event.name === "lifecycle.authority.settled") {
        summary.lifecycle.authorityReceiptCount += 1;
      }
      summary.lifecycle.terminalState = diagnosticString(lifecycleReceipt, "terminalState")
        ?? summary.lifecycle.terminalState;
      summary.lifecycle.classification = diagnosticString(lifecycleReceipt, "classification")
        ?? summary.lifecycle.classification;
      summary.lifecycle.reasonCode = diagnosticString(lifecycleReceipt, "reasonCode")
        ?? summary.lifecycle.reasonCode;
      summary.lifecycle.artifactId = diagnosticString(lifecycleReceipt, "artifactId")
        ?? summary.lifecycle.artifactId;
      summary.lifecycle.revisionId = diagnosticString(lifecycleReceipt, "revisionId")
        ?? summary.lifecycle.revisionId;
      if (typeof lifecycleReceipt.operationalRevisionPreserved === "boolean") {
        summary.lifecycle.operationalRevisionPreserved = lifecycleReceipt.operationalRevisionPreserved;
      }
      if (typeof lifecycleReceipt.creativeTransformationRequired === "boolean") {
        summary.lifecycle.creativeTransformationRequired =
          lifecycleReceipt.creativeTransformationRequired;
      }
      summary.lifecycle.acceptedCreativeActCount =
        diagnosticNumber(lifecycleReceipt, "acceptedCreativeActCount")
        ?? summary.lifecycle.acceptedCreativeActCount;
      const materialCreativeRevisionId =
        diagnosticString(lifecycleReceipt, "materialCreativeRevisionId");
      if (materialCreativeRevisionId) {
        summary.lifecycle.materialCreativeRevisionId = materialCreativeRevisionId;
      }
      if (typeof lifecycleReceipt.materialCreativeRevisionPreserved === "boolean") {
        summary.lifecycle.materialCreativeRevisionPreserved =
          lifecycleReceipt.materialCreativeRevisionPreserved;
      }
      if (typeof lifecycleReceipt.publicationVerified === "boolean") {
        summary.lifecycle.publicationVerified = lifecycleReceipt.publicationVerified;
      }
      if (typeof lifecycleReceipt.clientReceiptPresent === "boolean") {
        summary.lifecycle.clientReceiptPresent = lifecycleReceipt.clientReceiptPresent;
      }
      summary.lifecycle.failedPredicates = diagnosticStringArray(lifecycleReceipt.failedPredicates);
      summary.lifecycle.knownLimitations = diagnosticStringArray(lifecycleReceipt.knownLimitations);
    }
    const state = diagnosticString(data, "authorityState");
    if (
      state === "foundation-ready"
      || state === "candidate-staged"
      || state === "candidate-received"
      || state === "candidate-committed"
      || state === "candidate-rejected"
      || state === "candidate-timed-out"
    ) {
      summary.state = state;
    }
    if (event.name === "revision.sent") summary.stagedCount += 1;
    if (event.name === "revision.acknowledged" && state === "candidate-committed") summary.committedCount += 1;
    if (event.name === "revision.rejected") summary.rejectedCount += 1;
    if (event.name === "revision.timed_out") summary.timedOutCount += 1;
    if (event.name === "creative.live_source.candidate_ready") {
      summary.liveSource.candidateReadyCount += 1;
      summary.liveSource.lastAuthoringLatencyMs = diagnosticNumber(data, "authoringLatencyMs")
        ?? summary.liveSource.lastAuthoringLatencyMs;
    }
    if (event.name === "creative.live_source.dispatched") {
      summary.liveSource.dispatchedCount += 1;
      summary.liveSource.mountedBrowserExecutions +=
        diagnosticNumber(data, "mountedBrowserExecutions") ?? 0;
      summary.liveSource.atomicValidationExecutions +=
        diagnosticNumber(data, "atomicValidationExecutions") ?? 0;
      summary.liveSource.candidateVisibility =
        diagnosticString(data, "candidateVisibility") ?? summary.liveSource.candidateVisibility;
    }
    if (event.name === "creative.live_source.committed") {
      summary.liveSource.committedCount += 1;
      firstLiveCommitAt ??= event.timestamp;
    }
    if (event.name === "linear.design.browser_applied") {
      summary.liveSource.dispatchedCount += 1;
      summary.liveSource.committedCount += 1;
      firstLiveCommitAt ??= event.timestamp;
    }
    if (event.name === "creative.live_source.rejected") {
      summary.liveSource.rejectedCount += 1;
    }
    if (event.name === "creative.source.normalization_retry") {
      summary.liveSource.normalizationRetryCount += 1;
    }
    summary.liveSource.hiddenRuntimeExecutions = Math.max(
      summary.liveSource.hiddenRuntimeExecutions,
      diagnosticNumber(data, "hiddenRuntimeExecutions") ?? 0,
    );

    summary.acceptedRevisionId = diagnosticString(data, "acceptedRevisionId")
      ?? summary.acceptedRevisionId;
    summary.candidateRevisionId = state === "foundation-ready" || state === "candidate-committed"
      ? undefined
      : diagnosticString(data, "candidateRevisionId") ?? summary.candidateRevisionId;
    summary.browserRevisionId = diagnosticString(data, "browserRevisionId")
      ?? summary.browserRevisionId;
    summary.frameInstanceId = diagnosticString(data, "frameInstanceId")
      ?? summary.frameInstanceId;
    const frameInstanceId = diagnosticString(data, "frameInstanceId");
    if (frameInstanceId) observedFrameInstanceIds.add(frameInstanceId);
    summary.surfaceMountCount = Math.max(
      summary.surfaceMountCount,
      diagnosticNumber(data, "surfaceMountCount") ?? 0,
    );

    const rollbackDurationMs = diagnosticNumber(data, "rollbackDurationMs");
    if (rollbackDurationMs !== undefined) {
      summary.rollbackCount += 1;
      summary.lastRollbackDurationMs = rollbackDurationMs;
    }
    summary.lastCandidateDurationMs = diagnosticNumber(data, "candidateDurationMs")
      ?? summary.lastCandidateDurationMs;
    if (typeof data?.snapshotSanitized === "boolean") {
      summary.snapshotSanitized = data.snapshotSanitized;
    }

    const registry = data?.evidenceRegistry;
    if (registry && typeof registry === "object" && !Array.isArray(registry)) {
      const evidence = registry as Record<string, unknown>;
      summary.evidence = {
        expected: diagnosticStringArray(evidence.expectedEvidenceIds).length,
        present: diagnosticStringArray(evidence.presentEvidenceIds).length,
        visible: diagnosticStringArray(evidence.visibleEvidenceIds).length,
        unplaced: diagnosticStringArray(evidence.unplacedEvidenceIds).length,
        missing: diagnosticStringArray(evidence.missingEvidenceIds).length,
        collisions: summary.evidence.collisions,
      };
    }
    if (Array.isArray(data?.evidenceCollisionPairs)) {
      summary.evidence.collisions = data.evidenceCollisionPairs.length;
    }
  }

  summary.unexpectedRemountCount = Math.max(
    0,
    summary.surfaceMountCount - 1,
    observedFrameInstanceIds.size - 1,
  );
  if (runStartedAt && firstLiveCommitAt) {
    const duration = Date.parse(firstLiveCommitAt) - Date.parse(runStartedAt);
    if (Number.isFinite(duration)) {
      summary.liveSource.firstVisibleTransformationMs = Math.max(0, duration);
    }
  }
  return summary;
}

export type NorthstarRunOutcomeSummary = {
  operationalHealth: "idle" | "running" | "healthy" | "degraded" | "failed" | "cancelled";
  creativeOutcome: "not-started" | "working" | "accepted-progress" | "no-accepted-design";
  publicationReadiness: "ready" | "not-ready" | "unknown";
  acceptedCreativeStages: number;
  attemptedCreativeStages: number;
};

export function summarizeNorthstarRunOutcome(
  sourceEvents: readonly CanvasDiagnosticEvent[],
): NorthstarRunOutcomeSummary {
  const terminal = [...sourceEvents].reverse().find((event) =>
    event.name === "run.completed"
    || event.name === "run.completed_with_notes"
    || event.name === "run.incomplete"
    || event.name === "run.failed"
    || event.name === "run.cancelled"
  );
  const authority = summarizeNorthstarRuntimeAuthorityDiagnostics(sourceEvents);
  const hasOperationalFailure = sourceEvents.some((event) =>
    event.name === "ack.delivery_failed"
    || event.name === "revision.timed_out"
    || (event.name === "render.health" && event.data?.healthy === false)
    || (event.phase === "persistence" && /failed|mismatch/.test(event.name))
  );
  const operationalHealth: NorthstarRunOutcomeSummary["operationalHealth"] =
    terminal?.name === "run.cancelled"
      ? "cancelled"
      : terminal?.name === "run.incomplete" || terminal?.name === "run.failed"
        ? "failed"
        : terminal?.name === "run.completed_with_notes" || hasOperationalFailure
          ? "degraded"
          : terminal?.name === "run.completed"
            ? "healthy"
            : sourceEvents.length
              ? "running"
              : "idle";
  const attemptedCreativeStages = authority.liveSource.dispatchedCount;
  const acceptedCreativeStages = Math.max(
    authority.liveSource.committedCount,
    authority.lifecycle.acceptedCreativeActCount,
  );
  const creativeOutcome: NorthstarRunOutcomeSummary["creativeOutcome"] =
    acceptedCreativeStages > 0
      ? "accepted-progress"
      : attemptedCreativeStages > 0
        ? "no-accepted-design"
        : terminal
          ? "not-started"
          : sourceEvents.length
            ? "working"
            : "not-started";
  const linearDesignCompleted = terminal?.name === "run.completed"
    && terminal.data?.designRuntime === "linear-living-artboard";
  return {
    operationalHealth,
    creativeOutcome,
    publicationReadiness: linearDesignCompleted || authority.lifecycle.publicationVerified === true
      ? "ready"
      : authority.lifecycle.publicationVerified === false
        ? "not-ready"
        : "unknown",
    acceptedCreativeStages,
    attemptedCreativeStages,
  };
}

export function clearCanvasDiagnostics() {
  events.length = 0;
  candidateSourceArchives.clear();
  designTurnAuditArchives.length = 0;
  listeners.forEach((listener) => listener());
}

export function subscribeCanvasDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}


export type CanvasRunTelemetry = {
  totalRuns: number;
  completedRuns: number;
  incompleteRuns: number;
  runningRuns: number;
  completionRate: number | null;
  durationMs: { p50: number | null; p95: number | null; max: number | null };
  hardFailureRuns: number;
  acknowledgementFailureRuns: number;
  renderFailureRuns: number;
  persistenceFailureRuns: number;
};

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function getCanvasRunTelemetry(sourceEvents: CanvasDiagnosticEvent[] = events): CanvasRunTelemetry {
  const runs = new Map<string, CanvasDiagnosticEvent[]>();
  for (const event of sourceEvents) {
    if (!event.runId) continue;
    const runEvents = runs.get(event.runId) ?? [];
    runEvents.push(event);
    runs.set(event.runId, runEvents);
  }

  let completedRuns = 0;
  let incompleteRuns = 0;
  let hardFailureRuns = 0;
  let acknowledgementFailureRuns = 0;
  let renderFailureRuns = 0;
  let persistenceFailureRuns = 0;
  const durations: number[] = [];

  for (const runEvents of runs.values()) {
    const started = runEvents.find((event) => event.name === "run.started") ?? runEvents[0];
    const terminal = [...runEvents].reverse().find((event) =>
      event.name === "run.completed"
      || event.name === "run.completed_with_notes"
      || event.name === "run.incomplete"
      || event.name === "run.failed"
      || event.name === "run.cancelled",
    );
    if (terminal?.name === "run.completed" || terminal?.name === "run.completed_with_notes") completedRuns += 1;
    if (terminal?.name === "run.incomplete" || terminal?.name === "run.failed" || terminal?.name === "run.cancelled") incompleteRuns += 1;
    if (started && terminal) durations.push(Math.max(0, Date.parse(terminal.timestamp) - Date.parse(started.timestamp)));

    if (runEvents.some((event) => event.name === "action.outcome" && (event.data?.status === "failed" || event.data?.status === "timed_out"))) hardFailureRuns += 1;
    if (runEvents.some((event) => /revision\.timed_out|ack\.delivery_failed/.test(event.name))) acknowledgementFailureRuns += 1;
    if (runEvents.some((event) =>
      (event.name === "render.health" && event.data?.healthy === false)
      || event.name === "linear.design.observation_degraded"
      || event.name === "creative.observation.degraded"
    )) renderFailureRuns += 1;
    if (runEvents.some((event) => event.phase === "persistence" && /failed|mismatch/.test(event.name))) persistenceFailureRuns += 1;
  }

  const totalRuns = runs.size;
  const terminalRuns = completedRuns + incompleteRuns;
  return {
    totalRuns,
    completedRuns,
    incompleteRuns,
    runningRuns: Math.max(0, totalRuns - terminalRuns),
    completionRate: terminalRuns === 0 ? null : completedRuns / terminalRuns,
    durationMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: durations.length ? Math.max(...durations) : null,
    },
    hardFailureRuns,
    acknowledgementFailureRuns,
    renderFailureRuns,
    persistenceFailureRuns,
  };
}

export function exportCanvasDiagnostics() {
  return JSON.stringify({
    schema: "northstar.canvas-diagnostics.v4",
    exportedAt: new Date().toISOString(),
    policy: {
      version: NORTHSTAR_HEALTH_POLICY.version,
      maxEvents: policy.maxEvents,
      maxDepth: policy.maxDepth,
      maxStringLength: policy.maxStringLength,
      maxArrayItems: policy.maxArrayItems,
      maxObjectKeys: policy.maxObjectKeys,
      payloadMode: "sanitized",
      candidateSourcePayloadMode: "exact-browser-executable-source",
      designTurnAuditPayloadMode: "exact-model-boundary-and-browser-source",
    },
    telemetry: getCanvasRunTelemetry(),
    events,
    candidateSourceArchives: Array.from(candidateSourceArchives.values()),
    designTurnAuditArchives,
  }, null, 2);
}
