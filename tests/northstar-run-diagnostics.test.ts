import assert from "node:assert/strict";
import test from "node:test";
import { buildNorthstarRunDiagnosticBundle } from "@/lib/canvas-architecture/northstar-run-diagnostics";
import type { NorthstarWorkspaceRuntimeSnapshot } from "@/lib/canvas-architecture/northstar-workspace-runtime";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { projectionFixtureState } from "@/tests/northstar-projection-fixtures";

function value(input: unknown): NorthstarLedgerValue {
  return input as NorthstarLedgerValue;
}

test("run diagnostics copy the complete ledger and distinguish visual commits", () => {
  const ledger = createNorthstarEphemeralLedger({
    objective: "Diagnose this visual run",
    initialStateSnapshot: value(projectionFixtureState()),
  });
  const research = ledger.createTask({
    kind: "research",
    intent: "Collect evidence",
    expectedOutcome: "Evidence committed",
    executionInput: {},
  });
  const attempt = ledger.startAttempt(research.id);
  ledger.commitTask({
    taskId: research.id,
    attemptId: attempt.id,
    result: { schema: "northstar.research-result.v1" },
    stateSnapshot: value(projectionFixtureState()),
  });

  const snapshot: NorthstarWorkspaceRuntimeSnapshot = {
    status: "blocked",
    ledger: ledger.getSnapshot(),
    lastStep: null,
    projectionHost: {
      status: "stable",
      surfaceSessionId: "surface-session-1",
      stateHash: ledger.getSnapshot().headCommit.stateHash,
      stableCaptureCount: 2,
    },
    error: "Projection blocked",
  };

  const diagnostics = buildNorthstarRunDiagnosticBundle(snapshot, {
    exportedAt: new Date("2026-07-22T21:00:00.000Z"),
  });
  assert.equal(diagnostics.schema, "northstar.run-diagnostics.v1");
  assert.equal(diagnostics.exportedAt, "2026-07-22T21:00:00.000Z");
  assert.equal(
    (diagnostics.summary as { verifiedVisualCommitCount?: unknown }).verifiedVisualCommitCount,
    0,
  );
  assert.deepEqual(
    (diagnostics.ledger as { events?: unknown[] }).events?.map((event) => (event as { type?: string }).type),
    ["run.created", "commit.created", "task.created", "attempt.started", "commit.created", "task.completed"],
  );
  ledger.dispose();
});
