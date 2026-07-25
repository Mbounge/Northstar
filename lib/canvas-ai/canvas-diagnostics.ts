import { NORTHSTAR_HEALTH_POLICY } from "@/lib/canvas-ai/northstar-health-policy";

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
  const runCompleted = terminal?.name === "run.completed";
  const name = event.name.toLowerCase();
  const detail = (event.detail ?? "").toLowerCase();
  const renderSeverity = typeof event.data?.severity === "string"
    ? event.data.severity.toLowerCase()
    : undefined;

  if (event.name === "run.incomplete" || event.name === "run.failed") return "problem";
  if (event.name === "run.cancelled" || event.name === "run.completed") return "info";

  if (
    event.name === "render.health"
    && (renderSeverity === "warning" || /refinement warning/.test(detail))
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

export function clearCanvasDiagnostics() {
  events.length = 0;
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
      event.name === "run.completed" || event.name === "run.incomplete" || event.name === "run.failed" || event.name === "run.cancelled",
    );
    if (terminal?.name === "run.completed") completedRuns += 1;
    if (terminal?.name === "run.incomplete" || terminal?.name === "run.failed" || terminal?.name === "run.cancelled") incompleteRuns += 1;
    if (started && terminal) durations.push(Math.max(0, Date.parse(terminal.timestamp) - Date.parse(started.timestamp)));

    if (runEvents.some((event) => event.name === "action.outcome" && (event.data?.status === "failed" || event.data?.status === "timed_out"))) hardFailureRuns += 1;
    if (runEvents.some((event) => /revision\.timed_out|ack\.delivery_failed/.test(event.name))) acknowledgementFailureRuns += 1;
    if (runEvents.some((event) => event.name === "render.health" && event.data?.healthy === false)) renderFailureRuns += 1;
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
    schema: "northstar.canvas-diagnostics.v2",
    exportedAt: new Date().toISOString(),
    policy: {
      version: NORTHSTAR_HEALTH_POLICY.version,
      maxEvents: policy.maxEvents,
      maxDepth: policy.maxDepth,
      maxStringLength: policy.maxStringLength,
      maxArrayItems: policy.maxArrayItems,
      maxObjectKeys: policy.maxObjectKeys,
      payloadMode: "sanitized",
    },
    telemetry: getCanvasRunTelemetry(),
    events,
  }, null, 2);
}
