import assert from "node:assert/strict";
import test from "node:test";
import {
  attachNorthstarTurnModelEvidenceMetadata,
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


function validResearchResult(overrides: Record<string, unknown> = {}) {
  return {
    schema: "northstar.research-result.v1",
    findings: [],
    exactIdentities: [],
    evidenceGraphDelta: [],
    visualObservations: [],
    remainingGaps: [],
    sufficientForNextStep: true,
    suggestedNextEvidenceActivities: [],
    ...overrides,
  };
}

function requestForDecision() {
  const fixture = decisionFixture();
  return parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:executor-decision",
    type: "decide-next-activity",
    ledgerContext: fixture.context,
  });
}

function requestForAttempt(kind: "research" | "analysis" | "artboard-mutation" | "verification" = "research"): NorthstarExecuteTaskAttemptRequest {
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
        return { outcome: "success", result: validResearchResult({ findings: [{ evidenceIds: ["e-1"] }] }) };
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
            schema: "northstar.artboard-mutation-draft.v1",
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
  assert.match(systemInstruction, /get_flow_details[\s\S]*(?:flowId|flowName)/);
  assert.match(systemInstruction, /appId/);
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
                  appId: "atlas",
                  appName: "Atlas",
                  flowId: "activation",
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
          result: validResearchResult({
            findings: ["The attached welcome screen leads with a single primary action."],
            exactIdentities: [{
              appId: "atlas",
              appName: "Atlas",
              flowId: "activation",
              flowName: "Activation",
              screenshotId: "atlas-screen-1",
            }],
            visualObservations: [{
              screenshotId: "atlas-screen-1",
              observation: "The welcome screen leads with a single primary action.",
            }],
          }),
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

test("research success is rejected when the structured evidence contract is missing", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return { outcome: "success", result: { findings: ["Narrative only"] } };
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.code, "MODEL_OUTPUT_INVALID");
    assert.match(JSON.stringify(response.correctionContext), /RESEARCH_RESULT_SCHEMA_INVALID/);
  }
});

test("deterministic tool identities are merged into the authoritative research result", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute() {
        return {
          toolCalls: [{
            name: "prepare_composition_evidence",
            args: { query: "Atlas onboarding" },
            result: {
              ok: true,
              detail: "Prepared exact evidence",
              data: {
                app: { id: "atlas", name: "Atlas", flowCount: 1 },
                flow: {
                  id: "atlas-activation",
                  appId: "atlas",
                  appName: "Atlas",
                  name: "Account activation",
                  screenCount: 1,
                },
                screens: [{
                  id: "atlas-screen-1",
                  appId: "atlas",
                  appName: "Atlas",
                  flowId: "atlas-activation",
                  flowName: "Account activation",
                  name: "Welcome",
                  imageUrl: "https://assets.example/atlas-screen-1.png",
                  index: 0,
                }],
              },
              resultView: { kind: "screenshots", title: "Evidence", items: [] },
            },
          }],
        };
      },
    },
    model: {
      async generateJSON() {
        return { outcome: "success", result: validResearchResult() };
      },
    },
  });
  assert.equal(response.type, "attempt-result");
  if (response.type === "attempt-result") {
    const result = response.result as { exactIdentities: Array<Record<string, unknown>> };
    assert.ok(result.exactIdentities.some((identity) => identity.kind === "app" && identity.appId === "atlas"));
    assert.ok(result.exactIdentities.some((identity) => identity.kind === "flow" && identity.flowId === "atlas-activation"));
    assert.ok(result.exactIdentities.some((identity) => identity.kind === "screenshot" && identity.screenshotId === "atlas-screen-1"));
  }
});

test("analysis success is rejected unless the complete design-intelligence contract is present", async () => {
  const request = requestForAttempt("analysis");
  const response = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return {
          outcome: "success",
          result: { schema: "northstar.design-intelligence-result.v1", visualThesis: "Too shallow" },
        };
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.code, "MODEL_OUTPUT_INVALID");
    assert.match(response.message, /nextVisibleMove/);
  }
});

test("visual observations must cite screenshot IDs attached to that exact model turn", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute() {
        return {
          toolCalls: [{
            name: "get_screenshot",
            args: { screenshotId: "attached-screen" },
            result: {
              ok: true,
              detail: "Retrieved screenshot",
              data: {
                id: "attached-screen",
                appId: "atlas",
                appName: "Atlas",
                flowId: "activation",
                flowName: "Activation",
                name: "Welcome",
                imageUrl: "https://assets.example/attached.png",
                index: 0,
              },
              resultView: { kind: "screenshot", title: "Welcome", items: [] },
            },
          }],
        };
      },
    },
    model: {
      async generateJSON() {
        return {
          outcome: "success",
          result: validResearchResult({
            visualObservations: [{ screenshotId: "different-screen", observation: "Unsupported" }],
          }),
        };
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.code, "MODEL_OUTPUT_INVALID");
    assert.match(response.message, /unattached screenshot different-screen/);
  }
});


test("visual observations cannot cite a screenshot the provider failed to attach", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    toolExecutor: {
      async execute() {
        return {
          toolCalls: [{
            name: "get_flow_screenshots",
            args: { flowId: "activation" },
            result: {
              ok: true,
              detail: "Retrieved screenshots",
              data: {
                screens: [
                  {
                    id: "loaded-screen",
                    appId: "atlas",
                    appName: "Atlas",
                    flowId: "activation",
                    flowName: "Activation",
                    name: "Welcome",
                    imageUrl: "https://assets.example/loaded.png",
                    index: 0,
                  },
                  {
                    id: "missing-screen",
                    appId: "atlas",
                    appName: "Atlas",
                    flowId: "activation",
                    flowName: "Activation",
                    name: "Verify",
                    imageUrl: "https://assets.example/missing.png",
                    index: 1,
                  },
                ],
              },
              resultView: { kind: "screenshots", title: "Activation", items: [] },
            },
          }],
        };
      },
    },
    model: {
      async generateJSON() {
        return attachNorthstarTurnModelEvidenceMetadata({
          outcome: "success",
          result: validResearchResult({
            visualObservations: [{ screenshotId: "missing-screen", observation: "Unsupported" }],
          }),
        }, {
          attachedEvidenceAssetIds: ["loaded-screen"],
          evidenceAttachmentReport: {
            requestedAssetIds: ["loaded-screen", "missing-screen"],
            loadedAssetIds: ["loaded-screen"],
            unavailableAssets: [{ id: "missing-screen", reason: "http-403" }],
          },
        });
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.code, "MODEL_OUTPUT_INVALID");
    assert.match(response.message, /unattached screenshot missing-screen/);
    assert.match(JSON.stringify(response.evidence), /http-403/);
  }
});


test("model-authored tenant identities are rejected unless committed evidence returned them", async () => {
  const request = requestForAttempt("research");
  const response = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return {
          outcome: "success",
          result: validResearchResult({
            exactIdentities: [{
              appId: "invented-app",
              appName: "Invented",
              flowId: "invented-flow",
              flowName: "Invented flow",
            }],
          }),
        };
      },
    },
  });
  assert.equal(response.type, "attempt-failure");
  if (response.type === "attempt-failure") {
    assert.equal(response.code, "MODEL_OUTPUT_INVALID");
    assert.match(JSON.stringify(response.correctionContext), /EXACT_IDENTITY_UNGROUNDED/);
  }
});


test("verification results must be internally consistent before they can gate finalization", async () => {
  const request = requestForAttempt("verification");
  const invalid = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return {
          outcome: "success",
          result: {
            schema: "northstar.verification-result.v1",
            objectiveSatisfied: false,
            evidenceGrounded: true,
            artboardStable: true,
            readingPathClear: true,
            issues: ["The comparison does not yet answer the executive question."],
            recommendation: "finalize",
          },
        };
      },
    },
  });
  assert.equal(invalid.type, "attempt-failure");
  if (invalid.type === "attempt-failure") {
    assert.match(JSON.stringify(invalid.correctionContext), /VERIFICATION_RESULT_INCONSISTENT/);
  }

  const valid = await executeNorthstarTurn({
    request,
    model: {
      async generateJSON() {
        return {
          outcome: "success",
          result: {
            schema: "northstar.verification-result.v1",
            objectiveSatisfied: true,
            evidenceGrounded: true,
            artboardStable: true,
            readingPathClear: true,
            issues: [],
            recommendation: "finalize",
          },
        };
      },
    },
  });
  assert.equal(valid.type, "attempt-result");
});
