import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCanvasDiagnosticEvent,
  summarizeCanvasDiagnosticSeverities,
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

test("terminal hard failures remain unresolved problems", () => {
  const events = [
    event({ phase: "action", name: "action.outcome", data: { status: "failed" } }),
    event({ phase: "run", name: "run.incomplete", data: { healthy: false } }),
  ];
  assert.equal(classifyCanvasDiagnosticEvent(events[0], events), "problem");
  assert.equal(classifyCanvasDiagnosticEvent(events[1], events), "problem");
});
