import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  type NorthstarTurnRequest,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  NorthstarTurnValidationError,
  parseNorthstarActivityDraftModelOutput,
  parseNorthstarTurnRequest,
  parseNorthstarTurnResponse,
} from "@/lib/canvas-ai/northstar-turn-validation";
import { createNorthstarLedgerLLMContext } from "@/lib/canvas-ledger/northstar-ledger-context";
import {
  activeAttemptFixture,
  correctableFixture,
  decisionFixture,
} from "./northstar-turn-fixtures";

const requestId = "turnreq:protocol-test";

function expectValidationCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof NorthstarTurnValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("valid decision, execution, correction, and finalization requests parse", () => {
  const decision = decisionFixture();
  const decisionRequest = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "decide-next-activity",
    ledgerContext: decision.context,
  });
  assert.equal(decisionRequest.type, "decide-next-activity");

  const execution = activeAttemptFixture("research");
  const executionRequest = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "execute-task-attempt",
    ledgerContext: execution.context,
    task: execution.task,
    attempt: execution.attempt,
  });
  assert.equal(executionRequest.type, "execute-task-attempt");

  const correction = correctableFixture();
  const correctionRequest = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "correct-active-task",
    ledgerContext: correction.context,
    task: correction.task,
    latestAttempt: correction.attempt,
  });
  assert.equal(correctionRequest.type, "correct-active-task");

  const finalizationRequest = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "finalize-run",
    ledgerContext: decision.context,
  });
  assert.equal(finalizationRequest.type, "finalize-run");
});

test("unknown fields and model-generated system identity are rejected", () => {
  const fixture = decisionFixture();
  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "decide-next-activity",
    ledgerContext: fixture.context,
    taskId: "model-created-task",
  }), "UNKNOWN_FIELD");

  expectValidationCode(() => parseNorthstarActivityDraftModelOutput({
    decision: "activity",
    activity: {
      kind: "research",
      intent: "Research",
      expectedOutcome: "Evidence",
      executionInput: {},
      taskId: "model-created-task",
    },
  }), "UNKNOWN_FIELD");
});

test("execution request task and attempt must match the active ledger context", () => {
  const fixture = activeAttemptFixture("research");
  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "execute-task-attempt",
    ledgerContext: fixture.context,
    task: { ...fixture.task, id: "task-other" },
    attempt: fixture.attempt,
  }), "STALE_TASK");

  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "execute-task-attempt",
    ledgerContext: fixture.context,
    task: fixture.task,
    attempt: { ...fixture.attempt, id: "attempt-other" },
  }), "STALE_ATTEMPT");
});

test("finalization is rejected while an active task or obligation exists", () => {
  const fixture = activeAttemptFixture("analysis");
  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "finalize-run",
    ledgerContext: fixture.context,
  }), "FINALIZATION_BLOCKED");
});

test("invalid ledger values and oversized payloads are rejected", () => {
  const fixture = decisionFixture();
  const malformed = structuredClone(fixture.context) as unknown as {
    currentHead: { stateSnapshot: unknown };
  };
  malformed.currentHead.stateSnapshot = { x: Number.NaN };
  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "decide-next-activity",
    ledgerContext: malformed,
  }), "INVALID_LEDGER_VALUE");

  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "decide-next-activity",
    ledgerContext: fixture.context,
    padding: "x".repeat(2_500_001),
  }), "PAYLOAD_TOO_LARGE");
});

test("response identity and result kind are validated against the request", () => {
  const fixture = activeAttemptFixture("research");
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "execute-task-attempt",
    ledgerContext: fixture.context,
    task: fixture.task,
    attempt: fixture.attempt,
  }) as NorthstarTurnRequest;

  expectValidationCode(() => parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:stale-response",
    type: "attempt-result",
    taskId: fixture.task.id,
    attemptId: fixture.attempt.id,
    resultKind: "research-result",
    result: {},
  }, request), "STALE_RESPONSE");

  expectValidationCode(() => parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "attempt-result",
    taskId: fixture.task.id,
    attemptId: fixture.attempt.id,
    resultKind: "analysis-result",
    result: {},
  }, request), "RESULT_KIND_MISMATCH");
});


test("ledger context cannot hide unresolved work or contradict active attempt history", () => {
  const fixture = activeAttemptFixture("research");
  const hidden = structuredClone(fixture.context);
  hidden.activeTask = null;
  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "decide-next-activity",
    ledgerContext: hidden,
  }), "INVALID_ACTIVE_TASK");

  const contradictory = structuredClone(fixture.context);
  const activeTask = contradictory.activeTask;
  if (!activeTask) throw new Error("expected active task");
  activeTask.attempts = activeTask.attempts.map((attempt) => ({
    ...attempt,
    executionInput: { query: "contradictory" },
  }));
  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "execute-task-attempt",
    ledgerContext: contradictory,
    task: activeTask.task,
    attempt: activeTask.attempts[0],
  }), "INVALID_ACTIVE_TASK");
});

test("model activity and correction payloads cannot smuggle ledger-owned identity", () => {
  expectValidationCode(() => parseNorthstarActivityDraftModelOutput({
    decision: "activity",
    activity: {
      kind: "research",
      intent: "Research",
      expectedOutcome: "Evidence",
      executionInput: { nested: { taskId: "model-task" } },
    },
  }), "MODEL_SYSTEM_IDENTITY_FORBIDDEN");
});
test("artboard mutation drafts cannot claim repository or commit identity", () => {
  const fixture = activeAttemptFixture("artboard-mutation");
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "execute-task-attempt",
    ledgerContext: fixture.context,
    task: fixture.task,
    attempt: fixture.attempt,
  });

  const response = parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId,
    type: "attempt-result",
    taskId: fixture.task.id,
    attemptId: fixture.attempt.id,
    resultKind: "artboard-mutation-draft",
    result: {
      operations: [{ type: "set-text", target: "title", text: "Evidence" }],
    },
  }, request);
  assert.equal(response.type, "attempt-result");

  expectValidationCode(() => parseNorthstarActivityDraftModelOutput({
    decision: "activity",
    activity: {
      kind: "artboard-mutation",
      intent: "Add evidence",
      expectedOutcome: "Evidence draft",
      executionInput: {},
      commitHash: "model-commit",
    },
  }), "UNKNOWN_FIELD");
});

test("the browser response boundary rejects ledger-owned identity in every successful payload", () => {
  const execution = activeAttemptFixture("research");
  const executionRequest = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:response-identity-execution",
    type: "execute-task-attempt",
    ledgerContext: execution.context,
    task: execution.task,
    attempt: execution.attempt,
  });
  expectValidationCode(() => parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: executionRequest.requestId,
    type: "attempt-result",
    taskId: execution.task.id,
    attemptId: execution.attempt.id,
    resultKind: "research-result",
    result: { evidence: [], nested: { taskId: "model-task" } },
  }, executionRequest), "MODEL_SYSTEM_IDENTITY_FORBIDDEN");

  const correction = correctableFixture();
  const correctionRequest = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:response-identity-correction",
    type: "correct-active-task",
    ledgerContext: correction.context,
    task: correction.task,
    latestAttempt: correction.attempt,
  });
  expectValidationCode(() => parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: correctionRequest.requestId,
    type: "task-correction",
    taskId: correction.task.id,
    action: {
      action: "retry",
      executionInput: { query: "corrected", nested: { attemptId: "model-attempt" } },
    },
  }, correctionRequest), "MODEL_SYSTEM_IDENTITY_FORBIDDEN");

  const finalization = decisionFixture();
  const finalizationRequest = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:response-identity-finalization",
    type: "finalize-run",
    ledgerContext: finalization.context,
  });
  expectValidationCode(() => parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: finalizationRequest.requestId,
    type: "run-finalized",
    summary: { message: "done", nested: { commitHash: "model-head" } },
  }, finalizationRequest), "MODEL_SYSTEM_IDENTITY_FORBIDDEN");
});

test("an uncertain transport attempt is executable only with its original request ID", () => {
  const fixture = activeAttemptFixture("research");
  fixture.ledger.recordAttemptTransportUncertain(
    fixture.task.id,
    fixture.attempt.id,
    {
      requestId: "turnreq:transport-exact",
      code: "TURN_TRANSPORT_FAILED",
      detail: "response lost",
      retryable: true,
    },
  );
  const snapshot = fixture.ledger.getSnapshot();
  const task = snapshot.activeTask!;
  const attempt = snapshot.attempts.find((entry) => entry.id === fixture.attempt.id)!;
  const parsedContext = createNorthstarLedgerLLMContext(fixture.ledger.getSnapshot());

  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:transport-exact",
    type: "execute-task-attempt",
    ledgerContext: parsedContext,
    task,
    attempt,
  });
  assert.equal(request.type, "execute-task-attempt");

  expectValidationCode(() => parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:transport-different",
    type: "execute-task-attempt",
    ledgerContext: parsedContext,
    task,
    attempt,
  }), "ATTEMPT_NOT_EXECUTABLE");
});

test("attempt responses accept read-only evidence but reject model-only outcome fields", () => {
  const fixture = activeAttemptFixture("research");
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:evidence-response",
    type: "execute-task-attempt",
    ledgerContext: fixture.context,
    task: fixture.task,
    attempt: fixture.attempt,
  });

  const success = parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: request.requestId,
    type: "attempt-result",
    taskId: fixture.task.id,
    attemptId: fixture.attempt.id,
    resultKind: "research-result",
    result: { answer: "done" },
    evidence: { toolCalls: [{ name: "list_apps", result: { detail: "Apps found" } }] },
  }, request);
  assert.equal(success.type, "attempt-result");
  if (success.type === "attempt-result") assert.ok(success.evidence);

  const failure = parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: request.requestId,
    type: "attempt-failure",
    taskId: fixture.task.id,
    attemptId: fixture.attempt.id,
    failureKind: "correctable",
    code: "FLOW_REQUIRED",
    message: "Choose a flow",
    evidence: { toolCalls: [] },
  }, request);
  assert.equal(failure.type, "attempt-failure");

  expectValidationCode(() => parseNorthstarTurnResponse({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: request.requestId,
    type: "attempt-failure",
    taskId: fixture.task.id,
    attemptId: fixture.attempt.id,
    failureKind: "correctable",
    code: "FLOW_REQUIRED",
    message: "Choose a flow",
    outcome: "failure",
  }, request), "UNKNOWN_FIELD");
});
