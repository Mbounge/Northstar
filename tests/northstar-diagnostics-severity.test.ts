import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCanvasDiagnosticEvent,
  summarizeCanvasDiagnosticSeverities,
  summarizeNorthstarRunOutcome,
  summarizeNorthstarRuntimeAuthorityDiagnostics,
  type CanvasDiagnosticEvent,
} from "@/lib/canvas-ai/canvas-diagnostics";

function event(input: Partial<CanvasDiagnosticEvent> & Pick<CanvasDiagnosticEvent, "name" | "phase">): CanvasDiagnosticEvent {
  return {
    id: input.id ?? `${input.name}-${Math.random()}`,
    timestamp: input.timestamp ?? new Date().toISOString(),
    runId: input.runId ?? "run-1",
    actionId: input.actionId,
    stepId: input.stepId,
    phase: input.phase,
    name: input.name,
    detail: input.detail,
    data: input.data,
  };
}

test("completed runs classify recovered candidates separately from unresolved problems", () => {
  const events = [
    event({ phase: "runtime", name: "revision.rejected", detail: "Candidate rejected" }),
    event({ phase: "action", name: "action.outcome", data: { status: "superseded" } }),
    event({ phase: "runtime", name: "render.health", detail: "Refinement warning", data: { severity: "warning", healthy: true } }),
    event({ phase: "run", name: "run.completed", data: { healthy: true } }),
  ];

  assert.equal(classifyCanvasDiagnosticEvent(events[0], events), "recovered");
  assert.equal(classifyCanvasDiagnosticEvent(events[1], events), "recovered");
  assert.equal(classifyCanvasDiagnosticEvent(events[2], events), "warning");
  assert.deepEqual(summarizeCanvasDiagnosticSeverities(events, events), {
    problem: 0,
    warning: 1,
    recovered: 2,
    info: 1,
  });
});

test("completed-with-notes and zero creative commits are not reported as healthy creative success", () => {
  const events = [
    event({ phase: "run", name: "run.started" }),
    event({ phase: "action", name: "creative.live_source.dispatched" }),
    event({ phase: "action", name: "creative.live_source.rejected" }),
    event({
      phase: "run",
      name: "lifecycle.authority.settled",
      data: { publicationVerified: false },
    }),
    event({ phase: "run", name: "run.completed_with_notes" }),
  ];
  assert.deepEqual(summarizeNorthstarRunOutcome(events), {
    operationalHealth: "degraded",
    creativeOutcome: "no-accepted-design",
    publicationReadiness: "not-ready",
    acceptedCreativeStages: 0,
    attemptedCreativeStages: 1,
  });
});

test("terminal hard failures remain unresolved problems", () => {
  const events = [
    event({ phase: "action", name: "action.outcome", data: { status: "failed" } }),
    event({ phase: "run", name: "run.incomplete", data: { healthy: false } }),
  ];
  assert.equal(classifyCanvasDiagnosticEvent(events[0], events), "problem");
  assert.equal(classifyCanvasDiagnosticEvent(events[1], events), "problem");
});


test("completed-with-notes runs recover rejected candidates and remain terminal", () => {
  const events = [
    event({ phase: "runtime", name: "revision.rejected", detail: "Candidate rejected" }),
    event({ phase: "run", name: "run.completed_with_notes" }),
  ];

  assert.equal(classifyCanvasDiagnosticEvent(events[0], events), "recovered");
  assert.equal(classifyCanvasDiagnosticEvent(events[1], events), "info");
});

test("runtime authority diagnostics prove rollback, evidence survival, and frame continuity", () => {
  const events = [
    event({
      phase: "runtime",
      name: "authority.surface_ready",
      data: {
        authorityState: "foundation-ready",
        acceptedRevisionId: "revision-1",
        browserRevisionId: "revision-1",
        frameInstanceId: "frame-1",
        surfaceMountCount: 1,
        snapshotSanitized: true,
        evidenceRegistry: {
          expectedEvidenceIds: ["screen-a", "screen-b"],
          presentEvidenceIds: ["screen-a", "screen-b"],
          visibleEvidenceIds: ["screen-a", "screen-b"],
          runtimeInheritedEvidenceIds: [],
          unplacedEvidenceIds: [],
          missingEvidenceIds: [],
        },
        evidenceCollisionPairs: [],
      },
    }),
    event({
      phase: "runtime",
      name: "revision.sent",
      data: {
        authorityState: "candidate-staged",
        acceptedRevisionId: "revision-1",
        candidateRevisionId: "revision-2-invalid",
        browserRevisionId: "revision-1",
        frameInstanceId: "frame-1",
        surfaceMountCount: 1,
      },
    }),
    event({
      phase: "runtime",
      name: "revision.rejected",
      data: {
        authorityState: "candidate-rejected",
        acceptedRevisionId: "revision-1",
        candidateRevisionId: "revision-2-invalid",
        browserRevisionId: "revision-1",
        frameInstanceId: "frame-1",
        surfaceMountCount: 1,
        rollbackDurationMs: 2.5,
        candidateDurationMs: 18,
        snapshotSanitized: true,
        evidenceRegistry: {
          expectedEvidenceIds: ["screen-a", "screen-b"],
          presentEvidenceIds: ["screen-a", "screen-b"],
          visibleEvidenceIds: ["screen-a", "screen-b"],
          runtimeInheritedEvidenceIds: [],
          unplacedEvidenceIds: [],
          missingEvidenceIds: [],
        },
        evidenceCollisionPairs: [],
      },
    }),
  ];

  assert.deepEqual(summarizeNorthstarRuntimeAuthorityDiagnostics(events), {
    state: "candidate-rejected",
    acceptedRevisionId: "revision-1",
    candidateRevisionId: "revision-2-invalid",
    browserRevisionId: "revision-1",
    stagedCount: 1,
    committedCount: 0,
    rejectedCount: 1,
    timedOutCount: 0,
    rollbackCount: 1,
    lastRollbackDurationMs: 2.5,
    lastCandidateDurationMs: 18,
    frameInstanceId: "frame-1",
    surfaceMountCount: 1,
    unexpectedRemountCount: 0,
    snapshotSanitized: true,
    evidence: {
      expected: 2,
      present: 2,
      visible: 2,
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
  });
});

test("diagnostics expose the lifecycle authority classification and failed predicates", () => {
  const summary = summarizeNorthstarRuntimeAuthorityDiagnostics([
    event({
      phase: "run",
      name: "lifecycle.authority.settled",
      data: {
        version: "northstar.lifecycle-authority.v1",
        terminalState: "completed_with_notes",
        classification: "transport-degraded",
        reasonCode: "SETTLEMENT_RECEIPT_MISSING_PRESERVED",
        artifactId: "artifact-1",
        revisionId: "revision-7",
        operationalRevisionPreserved: true,
        publicationVerified: false,
        clientReceiptPresent: false,
        failedPredicates: ["client settlement receipt"],
        knownLimitations: ["Publication metadata remained deferred."],
      },
    }),
  ]);

  assert.deepEqual(summary.lifecycle, {
    authorityReceiptCount: 1,
    acceptedCreativeActCount: 0,
    terminalState: "completed_with_notes",
    classification: "transport-degraded",
    reasonCode: "SETTLEMENT_RECEIPT_MISSING_PRESERVED",
    artifactId: "artifact-1",
    revisionId: "revision-7",
    operationalRevisionPreserved: true,
    publicationVerified: false,
    clientReceiptPresent: false,
    failedPredicates: ["client settlement receipt"],
    knownLimitations: ["Publication metadata remained deferred."],
  });
});

test("diagnostics expose direct-source latency and prove zero hidden executions", () => {
  const summary = summarizeNorthstarRuntimeAuthorityDiagnostics([
    event({
      phase: "run",
      name: "run.started",
      timestamp: "2026-07-29T10:00:00.000Z",
    }),
    event({
      phase: "action",
      name: "creative.source.normalization_retry",
      timestamp: "2026-07-29T10:00:01.000Z",
    }),
    event({
      phase: "action",
      name: "creative.live_source.candidate_ready",
      timestamp: "2026-07-29T10:00:02.000Z",
      data: { authoringLatencyMs: 900, hiddenRuntimeExecutions: 0 },
    }),
    event({
      phase: "action",
      name: "creative.live_source.dispatched",
      timestamp: "2026-07-29T10:00:02.010Z",
      data: {
        mountedBrowserExecutions: 1,
        hiddenRuntimeExecutions: 0,
        atomicValidationExecutions: 1,
        candidateVisibility: "shielded-until-settlement",
      },
    }),
    event({
      phase: "action",
      name: "creative.live_source.committed",
      timestamp: "2026-07-29T10:00:02.250Z",
      data: { hiddenRuntimeExecutions: 0 },
    }),
  ]);

  assert.deepEqual(summary.liveSource, {
    candidateReadyCount: 1,
    dispatchedCount: 1,
    committedCount: 1,
    rejectedCount: 0,
    normalizationRetryCount: 1,
    hiddenRuntimeExecutions: 0,
    mountedBrowserExecutions: 1,
    atomicValidationExecutions: 1,
    candidateVisibility: "shielded-until-settlement",
    lastAuthoringLatencyMs: 900,
    firstVisibleTransformationMs: 2_250,
  });
});

test("runtime authority diagnostics detect a component-level frame replacement", () => {
  const summary = summarizeNorthstarRuntimeAuthorityDiagnostics([
    event({
      phase: "runtime",
      name: "authority.surface_ready",
      data: {
        authorityState: "foundation-ready",
        acceptedRevisionId: "revision-1",
        browserRevisionId: "revision-1",
        frameInstanceId: "frame-1",
        surfaceMountCount: 1,
      },
    }),
    event({
      phase: "runtime",
      name: "authority.surface_ready",
      data: {
        authorityState: "foundation-ready",
        acceptedRevisionId: "revision-1",
        browserRevisionId: "revision-1",
        frameInstanceId: "frame-2",
        surfaceMountCount: 1,
      },
    }),
  ]);

  assert.equal(summary.unexpectedRemountCount, 1);
});
