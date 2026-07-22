import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  NorthstarTurnToolError,
  type NorthstarExecuteTaskAttemptRequest,
  type NorthstarTurnModelAdapter,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  executeNorthstarTurn,
  NorthstarTurnProviderError,
} from "@/lib/canvas-ai/northstar-turn-executor";
import { parseNorthstarTurnRequest, parseNorthstarTurnResponse } from "@/lib/canvas-ai/northstar-turn-validation";
import { activeAttemptFixture, decisionFixture } from "./northstar-turn-fixtures";

function requestForDecision() {
  const fixture = decisionFixture();
  return parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:executor-decision",
    type: "decide-next-activity",
    ledgerContext: fixture.context,
  });
}

function requestForAttempt(kind: "research" | "artboard-mutation" = "research"): NorthstarExecuteTaskAttemptRequest {
  const fixture = activeAttemptFixture(kind);
  return parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: `turnreq:executor-${kind}`,
    type: "execute-task-attempt",
    ledgerContext: fixture.context,
    task: fixture.task,
    attempt: fixture.attempt,
  }) as NorthstarExecuteTaskAttemptRequest;
}

test("one turn invokes the model exactly once and does not autonomously continue", async () => {
  let calls = 0;
  const model: NorthstarTurnModelAdapter = {
    async generateJSON() {
      calls += 1;
      return {
        decision: "activity",
        activity: {
          kind: "research",
          intent: "Inspect onboarding evidence",
          expectedOutcome: "Evidence is available",
          executionInput: { query: "Awin" },
        },
      };
    },
  };
  const response = await executeNorthstarTurn({ request: requestForDecision(), model });
  assert.equal(calls, 1);
  assert.equal(response.type, "activity-draft");
});

test("task-scoped tools run once for the exact task and are included before one model call", async () => {
  const request = requestForAttempt("research");
  assert.equal(request.type, "execute-task-attempt");
  let toolCalls = 0;
  let modelCalls = 0;
  let prompt = "";
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute({ request: toolRequest }) {
        toolCalls += 1;
        assert.equal(toolRequest.task.id, request.task.id);
        assert.equal(toolRequest.attempt.id, request.attempt.id);
        return { evidenceIds: ["e-1"] };
      },
    },
    model: {
      async generateJSON(input) {
        modelCalls += 1;
        prompt = input.userPrompt;
        return { outcome: "success", result: { evidenceIds: ["e-1"] } };
      },
    },
  });
  assert.equal(toolCalls, 1);
  assert.equal(modelCalls, 1);
  assert.match(prompt, /evidenceIds/);
  assert.equal(response.type, "attempt-result");
  if (response.type === "attempt-result") {
    assert.deepEqual(response.evidence, { evidenceIds: ["e-1"] });
  }
});

test("a valid model failure is wrapped with only wire-protocol fields", async () => {
  const request = requestForAttempt("research");
  assert.equal(request.type, "execute-task-attempt");
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: { async execute() { return { toolCalls: [{ name: "list_flows", result: { detail: "Found flows" } }] }; } },
    model: {
      async generateJSON() {
        return {
          outcome: "failure",
          failureKind: "correctable",
          code: "MORE_CONTEXT_NEEDED",
          message: "Choose a representative flow.",
          correctionContext: { missing: "flow" },
        };
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  assert.equal("outcome" in response, false);
  const parsed = parseNorthstarTurnResponse(response, request);
  assert.equal(parsed.type, "attempt-failure");
  if (parsed.type === "attempt-failure") {
    assert.equal(parsed.failureKind, "correctable");
    assert.deepEqual(parsed.evidence, { toolCalls: [{ name: "list_flows", result: { detail: "Found flows" } }] });
  }
});

test("invalid tool instructions are correctable and do not reach the model", async () => {
  const request = requestForAttempt("research");
  let modelCalls = 0;
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute() {
        throw new NorthstarTurnToolError({
          failureKind: "correctable",
          code: "TOOL_NOT_ALLOWED",
          message: "create_text is not a read-only tool",
          correctionContext: { requestedName: "create_text" },
        });
      },
    },
    model: {
      async generateJSON() {
        modelCalls += 1;
        return { outcome: "success", result: {} };
      },
    },
  });
  assert.equal(modelCalls, 0);
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.failureKind, "correctable");
    assert.equal(response.code, "TOOL_NOT_ALLOWED");
    assert.deepEqual(response.correctionContext, { requestedName: "create_text" });
  }
});

test("tool infrastructure failures retain their transient classification", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute() {
        throw new NorthstarTurnToolError({
          failureKind: "transient",
          code: "TOOL_EXECUTION_FAILED",
          message: "catalog temporarily unavailable",
        });
      },
    },
    model: { async generateJSON() { return { outcome: "success", result: {} }; } },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.failureKind, "transient");
    assert.equal(response.code, "TOOL_EXECUTION_FAILED");
  }
});

test("malformed attempt output becomes a correctable failure tied to the same identity", async () => {
  const request = requestForAttempt("research");
  assert.equal(request.type, "execute-task-attempt");
  const response = await executeNorthstarTurn({
    request,
    model: { async generateJSON() { return { result: { evidence: [] } }; } },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.taskId, request.task.id);
    assert.equal(response.attemptId, request.attempt.id);
    assert.equal(response.failureKind, "correctable");
    assert.equal(response.code, "MODEL_OUTPUT_INVALID");
  }
});

test("provider failures are typed and are not retried inside the executor", async () => {
  const request = requestForAttempt("research");
  let calls = 0;
  const response = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        calls += 1;
        throw new NorthstarTurnProviderError({
          code: "RATE_LIMIT",
          message: "Try later",
          retryable: true,
          retryAfterMs: 500,
        });
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.failureKind, "transient");
    assert.equal(response.retryAfterMs, 500);
  }
});

test("timeouts are bounded and reported without a hidden model retry", async () => {
  const request = requestForAttempt("research");
  let calls = 0;
  const response = await executeNorthstarTurn({
    request,
    timeoutMs: 10,
    model: {
      async generateJSON({ signal }) {
        calls += 1;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 1_000);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
          }, { once: true });
        });
        return { outcome: "success", result: {} };
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") assert.equal(response.code, "TURN_TIMEOUT");
});

test("caller cancellation remains cancellation rather than a fabricated task failure", async () => {
  const request = requestForAttempt("research");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    executeNorthstarTurn({
      request,
      signal: controller.signal,
      model: { async generateJSON() { return { outcome: "success", result: {} }; } },
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
});

test("artboard work returns a mutation draft and never claims projection or commit", async () => {
  const request = requestForAttempt("artboard-mutation");
  const response = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return {
          outcome: "success",
          result: {
            operations: [{ type: "set-text", target: "headline", text: "Trust vs speed" }],
          },
        };
      },
    },
  });
  assert.equal(response.type, "attempt-result");
  if (response.type === "attempt-result") {
    assert.equal(response.resultKind, "artboard-mutation-draft");
    assert.equal("commitHash" in (response.result as Record<string, unknown>), false);
  }
});


test("model results cannot smuggle ledger-owned identity through non-artboard tasks", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return { outcome: "success", result: { taskId: "model-owned-task", evidence: [] } };
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.failureKind, "correctable");
    assert.equal(response.code, "MODEL_OUTPUT_INVALID");
  }
});

test("finalization summaries cannot invent ledger-owned identity", async () => {
  const fixture = decisionFixture();
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:executor-finalize",
    type: "finalize-run",
    ledgerContext: fixture.context,
  });
  const response = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return { summary: { commitHash: "model-claimed-head", message: "done" } };
      },
    },
  });
  assert.equal(response.type, "turn-error");
  if (response.type === "turn-error") assert.equal(response.code, "MODEL_OUTPUT_INVALID");
});

test("decision planning receives exact data-tool schemas and prompt-owned research rules", async () => {
  let systemInstruction = "";
  const response = await executeNorthstarTurn({
    request: requestForDecision(),
    model: {
      async generateJSON(input) {
        systemInstruction = input.systemInstruction;
        return { decision: "ready-to-finalize", reason: "No more work" };
      },
    },
  });
  assert.equal(response.type, "run-ready-to-finalize");
  assert.match(systemInstruction, /Never hard-code apps, flows, counts/);
  assert.match(systemInstruction, /maxFlowsPerApp/);
  assert.match(systemInstruction, /get_flow_details[\s\S]*required[\s\S]*flowName/);
  assert.match(systemInstruction, /candidateScreenshotIds/);
  assert.match(systemInstruction, /additional analysis activities/);
  assert.match(systemInstruction, /non-artboard question/);
});

test("authoritative screenshot evidence is attached to the exact execution model turn", async () => {
  const request = requestForAttempt("research");
  let observedAssets: readonly import("@/lib/canvas-ai/northstar-turn-protocol").NorthstarTurnEvidenceAsset[] | undefined;
  let observedPrompt = "";
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute() {
        return {
          toolCalls: [{
            name: "prepare_composition_evidence",
            args: { query: "Compare activation" },
            result: {
              ok: true,
              data: {
                screens: [{
                  id: "atlas-screen-1",
                  name: "Welcome",
                  imageUrl: "https://assets.example/atlas/welcome.png",
                  appName: "Atlas",
                  flowName: "Activation",
                  index: 0,
                }],
              },
              resultView: { kind: "screenshots", title: "Evidence", items: [] },
              detail: "Prepared evidence",
            },
          }],
        };
      },
    },
    model: {
      async generateJSON(input) {
        observedAssets = input.evidenceAssets;
        observedPrompt = input.userPrompt;
        return {
          outcome: "success",
          result: {
            findings: ["The attached welcome screen leads with a single primary action."],
            selectedIdentities: [{ appName: "Atlas", flowName: "Activation", screenshotId: "atlas-screen-1" }],
            evidenceGaps: [],
            sufficientForNextStep: true,
          },
        };
      },
    },
  });
  assert.equal(response.type, "attempt-result");
  assert.equal(observedAssets?.length, 1);
  assert.deepEqual(observedAssets?.[0], {
    id: "atlas-screen-1",
    title: "Welcome",
    imageUrl: "https://assets.example/atlas/welcome.png",
    appName: "Atlas",
    flowName: "Activation",
    screenshotIndex: 0,
  });
  assert.match(observedPrompt, /attachedEvidenceAssets/);
  assert.match(observedPrompt, /atlas-screen-1/);
});

test("tool lookup failures preserve retrieved evidence in the wire response", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute() {
        throw new NorthstarTurnToolError({
          failureKind: "correctable",
          code: "TOOL_LOOKUP_EMPTY",
          message: "No exact flow matched.",
          correctionContext: { recommendedNextTools: ["list_app_flows"] },
          evidence: { toolCalls: [{ name: "list_available_apps", result: { ok: true } }] },
        });
      },
    },
    model: {
      async generateJSON() {
        throw new Error("model must not run after deterministic lookup failure");
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.code, "TOOL_LOOKUP_EMPTY");
    assert.deepEqual(response.evidence, {
      toolCalls: [{ name: "list_available_apps", result: { ok: true } }],
    });
  }
});
