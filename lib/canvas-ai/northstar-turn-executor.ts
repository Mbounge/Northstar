import type { NorthstarLedgerTask, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import {
  NORTHSTAR_TURN_DEFAULT_TIMEOUT_MS,
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  NorthstarTurnToolError,
  type NorthstarAttemptResultKind,
  type NorthstarExecuteTaskAttemptRequest,
  type NorthstarTurnModelAdapter,
  type NorthstarTurnRequest,
  type NorthstarTurnResponse,
  type NorthstarTurnToolExecutor,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  buildNorthstarCorrectionPrompt,
  buildNorthstarDecisionPrompt,
  buildNorthstarExecutionPrompt,
  buildNorthstarFinalizationPrompt,
} from "@/lib/canvas-ai/northstar-turn-prompts";
import {
  NorthstarTurnValidationError,
  parseNorthstarActivityDraftModelOutput,
  parseNorthstarAttemptModelOutput,
  parseNorthstarCorrectionModelOutput,
  parseNorthstarFinalizationModelOutput,
} from "@/lib/canvas-ai/northstar-turn-validation";

export class NorthstarTurnProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  }) {
    super(input.message);
    this.name = "NorthstarTurnProviderError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
  }
}

export interface ExecuteNorthstarTurnInput {
  request: NorthstarTurnRequest;
  model: NorthstarTurnModelAdapter;
  toolExecutor?: NorthstarTurnToolExecutor;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError(message = "The Northstar turn was aborted."): DOMException {
  return new DOMException(message, "AbortError");
}

function createTurnSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("Northstar turn timeoutMs must be a finite positive number.");
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(abortError("The Northstar turn timed out."));
  }, Math.floor(timeoutMs));
  const parentAbort = () => controller.abort(parent?.reason ?? abortError());
  if (parent?.aborted) parentAbort();
  else parent?.addEventListener("abort", parentAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", parentAbort);
    },
    didTimeout: () => timedOut,
  };
}

function resultKindForTask(task: NorthstarLedgerTask): NorthstarAttemptResultKind {
  const resultKinds: Record<NorthstarLedgerTask["kind"], NorthstarAttemptResultKind> = {
    research: "research-result",
    analysis: "analysis-result",
    "artboard-mutation": "artboard-mutation-draft",
    verification: "verification-result",
    finalization: "finalization-result",
  };
  return resultKinds[task.kind];
}

function genericTurnError(
  request: NorthstarTurnRequest,
  input: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  },
): NorthstarTurnResponse {
  return {
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: request.requestId,
    type: "turn-error",
    ...input,
  };
}

function attemptFailure(
  request: NorthstarExecuteTaskAttemptRequest,
  input: {
    failureKind: "transient" | "correctable" | "terminal";
    code: string;
    message: string;
    correctionContext?: NorthstarLedgerValue;
    retryAfterMs?: number;
  },
): NorthstarTurnResponse {
  return {
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: request.requestId,
    type: "attempt-failure",
    taskId: request.task.id,
    attemptId: request.attempt.id,
    ...input,
  };
}

function providerFailureResponse(
  request: NorthstarTurnRequest,
  error: unknown,
  didTimeout: boolean,
): NorthstarTurnResponse {
  const providerError = error instanceof NorthstarTurnProviderError ? error : null;
  const code = didTimeout
    ? "TURN_TIMEOUT"
    : providerError?.code ?? "TURN_PROVIDER_ERROR";
  const message = didTimeout
    ? "The model turn exceeded its bounded execution time."
    : error instanceof Error
      ? error.message
      : "The model provider failed without a structured error.";
  const retryable = didTimeout || providerError?.retryable !== false;
  const retryAfterMs = providerError?.retryAfterMs;

  if (request.type === "execute-task-attempt") {
    return attemptFailure(request, {
      failureKind: retryable ? "transient" : "terminal",
      code,
      message,
      retryAfterMs,
    });
  }
  return genericTurnError(request, { code, message, retryable, retryAfterMs });
}

async function generateOneModelResponse(
  model: NorthstarTurnModelAdapter,
  input: {
    operation: NorthstarTurnRequest["type"];
    systemInstruction: string;
    userPrompt: string;
    responseSchema: NorthstarLedgerValue;
    maxOutputTokens: number;
    temperature: number;
    signal: AbortSignal;
  },
): Promise<unknown> {
  return model.generateJSON(input);
}

export async function executeNorthstarTurn(
  input: ExecuteNorthstarTurnInput,
): Promise<NorthstarTurnResponse> {
  const timeout = createTurnSignal(
    input.signal,
    input.timeoutMs ?? NORTHSTAR_TURN_DEFAULT_TIMEOUT_MS,
  );
  try {
    if (timeout.signal.aborted && !timeout.didTimeout()) throw abortError();

    if (input.request.type === "decide-next-activity") {
      const prompt = buildNorthstarDecisionPrompt(input.request);
      const raw = await generateOneModelResponse(input.model, {
        operation: input.request.type,
        ...prompt,
        maxOutputTokens: 1_500,
        temperature: 0.15,
        signal: timeout.signal,
      });
      const output = parseNorthstarActivityDraftModelOutput(raw);
      if (output.decision === "activity") {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: input.request.requestId,
          type: "activity-draft",
          activity: output.activity,
        };
      }
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: input.request.requestId,
        type: "run-ready-to-finalize",
        reason: output.reason,
      };
    }

    if (input.request.type === "execute-task-attempt") {
      let toolContext: NorthstarLedgerValue | undefined;
      if (input.toolExecutor) {
        try {
          toolContext = await input.toolExecutor.execute({
            request: input.request,
            signal: timeout.signal,
          });
        } catch (error) {
          if (isAbortError(error) || timeout.signal.aborted) throw error;
          if (error instanceof NorthstarTurnToolError) {
            return attemptFailure(input.request, {
              failureKind: error.failureKind,
              code: error.code,
              message: error.message,
              correctionContext: error.correctionContext,
            });
          }
          return attemptFailure(input.request, {
            failureKind: "transient",
            code: "TASK_TOOL_EXECUTION_FAILED",
            message: error instanceof Error ? error.message : "The task-scoped tool execution failed.",
          });
        }
      }
      const prompt = buildNorthstarExecutionPrompt(input.request, toolContext);
      const raw = await generateOneModelResponse(input.model, {
        operation: input.request.type,
        ...prompt,
        maxOutputTokens: input.request.task.kind === "artboard-mutation" ? 8_000 : 4_000,
        temperature: 0.12,
        signal: timeout.signal,
      });
      let output: ReturnType<typeof parseNorthstarAttemptModelOutput>;
      try {
        output = parseNorthstarAttemptModelOutput(raw);
      } catch (error) {
        if (error instanceof NorthstarTurnValidationError) {
          return attemptFailure(input.request, {
            failureKind: "correctable",
            code: "MODEL_OUTPUT_INVALID",
            message: error.message,
            correctionContext: { validationCode: error.code },
          });
        }
        throw error;
      }
      if (output.outcome === "failure") {
        return attemptFailure(input.request, output);
      }
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: input.request.requestId,
        type: "attempt-result",
        taskId: input.request.task.id,
        attemptId: input.request.attempt.id,
        resultKind: resultKindForTask(input.request.task),
        result: output.result,
      };
    }

    if (input.request.type === "correct-active-task") {
      const prompt = buildNorthstarCorrectionPrompt(input.request);
      const raw = await generateOneModelResponse(input.model, {
        operation: input.request.type,
        ...prompt,
        maxOutputTokens: 2_000,
        temperature: 0.1,
        signal: timeout.signal,
      });
      const output = parseNorthstarCorrectionModelOutput(raw);
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: input.request.requestId,
        type: "task-correction",
        taskId: input.request.task.id,
        action: output,
      };
    }

    const prompt = buildNorthstarFinalizationPrompt(input.request);
    const raw = await generateOneModelResponse(input.model, {
      operation: input.request.type,
      ...prompt,
      maxOutputTokens: 4_000,
      temperature: 0.1,
      signal: timeout.signal,
    });
    const output = parseNorthstarFinalizationModelOutput(raw);
    return {
      protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
      requestId: input.request.requestId,
      type: "run-finalized",
      summary: output.summary,
    };
  } catch (error) {
    if (input.signal?.aborted && !timeout.didTimeout()) throw abortError();
    if (isAbortError(error) && !timeout.didTimeout()) throw error;
    if (error instanceof NorthstarTurnValidationError) {
      if (input.request.type === "execute-task-attempt") {
        return attemptFailure(input.request, {
          failureKind: "correctable",
          code: "MODEL_OUTPUT_INVALID",
          message: error.message,
          correctionContext: { validationCode: error.code },
        });
      }
      return genericTurnError(input.request, {
        code: "MODEL_OUTPUT_INVALID",
        message: error.message,
        retryable: false,
      });
    }
    return providerFailureResponse(input.request, error, timeout.didTimeout());
  } finally {
    timeout.cleanup();
  }
}
