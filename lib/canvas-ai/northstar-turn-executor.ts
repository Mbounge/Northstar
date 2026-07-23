import type { NorthstarLedgerTask, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import {
  NORTHSTAR_TURN_DEFAULT_TIMEOUT_MS,
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  NorthstarTurnToolError,
  readNorthstarTurnModelEvidenceMetadata,
  type NorthstarAttemptResultKind,
  type NorthstarExecuteTaskAttemptRequest,
  type NorthstarTurnEvidenceAsset,
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
import { collectNorthstarTurnEvidenceAssets } from "@/lib/canvas-ai/northstar-turn-evidence-assets";
import { validateNorthstarTaskResultContract } from "@/lib/canvas-ai/northstar-turn-result-contracts";
import {
  buildNorthstarFallbackTaskResult,
  deterministicNorthstarFinalSummary,
  northstarObjectiveNeedsResilientVisualPipeline,
} from "@/lib/canvas-ai/northstar-turn-resilience";

export class NorthstarTurnProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly failureKind?: "transient" | "correctable" | "terminal";
  readonly correctionContext?: NorthstarLedgerValue;
  readonly evidence?: NorthstarLedgerValue;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    failureKind?: "transient" | "correctable" | "terminal";
    correctionContext?: NorthstarLedgerValue;
    evidence?: NorthstarLedgerValue;
  }) {
    super(input.message);
    this.name = "NorthstarTurnProviderError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
    this.failureKind = input.failureKind;
    this.correctionContext = input.correctionContext;
    this.evidence = input.evidence;
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
    evidence?: NorthstarLedgerValue;
  },
): NorthstarTurnResponse {
  return {
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: request.requestId,
    type: "attempt-failure",
    taskId: request.task.id,
    attemptId: request.attempt.id,
    failureKind: input.failureKind,
    code: input.code,
    message: input.message,
    correctionContext: input.correctionContext,
    retryAfterMs: input.retryAfterMs,
    evidence: input.evidence,
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
      failureKind: providerError?.failureKind ?? (retryable ? "transient" : "terminal"),
      code,
      message,
      retryAfterMs,
      correctionContext: providerError?.correctionContext,
      evidence: providerError?.evidence,
    });
  }
  return genericTurnError(request, { code, message, retryable, retryAfterMs });
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function providerAttachmentReport(error: NorthstarTurnProviderError | null): NorthstarLedgerValue | undefined {
  const evidence = recordValue(error?.evidence);
  return evidence?.evidenceAttachmentReport as NorthstarLedgerValue | undefined;
}

function loadedAssetIdsFromReport(report: NorthstarLedgerValue | undefined): string[] | undefined {
  const record = recordValue(report);
  if (!Array.isArray(record?.loadedAssetIds)) return undefined;
  return record.loadedAssetIds.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()));
}

function mergeNorthstarAttemptEvidence(
  toolContext: NorthstarLedgerValue | undefined,
  evidenceAttachmentReport: NorthstarLedgerValue | undefined,
): NorthstarLedgerValue | undefined {
  if (evidenceAttachmentReport === undefined) return toolContext;
  if (toolContext && typeof toolContext === "object" && !Array.isArray(toolContext)) {
    return {
      ...toolContext,
      evidenceAttachmentReport,
    };
  }
  return {
    ...(toolContext === undefined ? {} : { toolContext }),
    evidenceAttachmentReport,
  };
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
    evidenceAssets?: readonly NorthstarTurnEvidenceAsset[];
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
      const resilientVisualRun = northstarObjectiveNeedsResilientVisualPipeline(
        input.request.ledgerContext.run.objective,
      );
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
              evidence: error.evidence,
            });
          }
          return attemptFailure(input.request, {
            failureKind: "transient",
            code: "TASK_TOOL_EXECUTION_FAILED",
            message: error instanceof Error ? error.message : "The task-scoped tool execution failed.",
          });
        }
      }
      const evidenceAssetLimit = input.request.task.kind === "analysis"
        ? 16
        : input.request.task.kind === "verification"
          ? 8
          : 12;
      const evidenceAssets = collectNorthstarTurnEvidenceAssets({
        toolContext,
        ledgerContext: input.request.ledgerContext,
        executionInput: input.request.attempt.executionInput,
        maximum: evidenceAssetLimit,
      });
      const prompt = buildNorthstarExecutionPrompt(input.request, toolContext, evidenceAssets);
      let raw: unknown = {};
      let modelDiagnostic: NorthstarLedgerValue | undefined;
      let recoveredAttachmentReport: NorthstarLedgerValue | undefined;
      let recoveredLoadedAssetIds: string[] | undefined;
      try {
        raw = await generateOneModelResponse(input.model, {
          operation: input.request.type,
          ...prompt,
          maxOutputTokens: input.request.task.kind === "artboard-mutation" ? 8_000 : 4_000,
          temperature: 0.12,
          signal: timeout.signal,
          evidenceAssets,
        });
      } catch (error) {
        if ((input.signal?.aborted || isAbortError(error)) && !timeout.didTimeout()) throw error;
        if (!resilientVisualRun) {
          return providerFailureResponse(input.request, error, timeout.didTimeout());
        }
        const providerError = error instanceof NorthstarTurnProviderError ? error : null;
        recoveredAttachmentReport = providerAttachmentReport(providerError);
        recoveredLoadedAssetIds = loadedAssetIdsFromReport(recoveredAttachmentReport);
        modelDiagnostic = {
          phase: "model-generation",
          code: providerError?.code ?? "TURN_PROVIDER_ERROR",
          message: error instanceof Error ? error.message : String(error),
          recoveredDeterministically: true,
          ...(providerError?.correctionContext !== undefined
            ? { correctionContext: providerError.correctionContext }
            : {}),
        };
      }
      const modelEvidenceMetadata = readNorthstarTurnModelEvidenceMetadata(raw);
      const attachedAssetIds = modelEvidenceMetadata?.attachedEvidenceAssetIds
        ?? recoveredLoadedAssetIds;
      const attachedEvidenceAssets = attachedAssetIds
        ? evidenceAssets.filter((asset) => attachedAssetIds.includes(asset.id))
        : modelDiagnostic === undefined ? evidenceAssets : [];
      const evidenceAttachmentReport = modelEvidenceMetadata?.evidenceAttachmentReport
        ?? recoveredAttachmentReport;
      let candidateResult: NorthstarLedgerValue = {};
      if (modelDiagnostic === undefined) {
        try {
          const output = parseNorthstarAttemptModelOutput(raw);
          if (output.outcome === "failure") {
            if (!resilientVisualRun) {
              return attemptFailure(input.request, {
                failureKind: output.failureKind,
                code: output.code,
                message: output.message,
                correctionContext: output.correctionContext,
                evidence: toolContext,
              });
            }
            modelDiagnostic = {
              phase: "model-reported-failure",
              code: output.code,
              message: output.message,
              failureKind: output.failureKind,
              recoveredDeterministically: true,
              ...(output.correctionContext !== undefined
                ? { correctionContext: output.correctionContext }
                : {}),
            };
          } else {
            candidateResult = output.result;
          }
        } catch (error) {
          if (error instanceof NorthstarTurnValidationError) {
            if (!resilientVisualRun) {
              return attemptFailure(input.request, {
                failureKind: "correctable",
                code: "MODEL_OUTPUT_INVALID",
                message: error.message,
                correctionContext: { validationCode: error.code },
                evidence: mergeNorthstarAttemptEvidence(toolContext, evidenceAttachmentReport),
              });
            }
            const directResult = raw && typeof raw === "object" && !Array.isArray(raw)
              && typeof (raw as { schema?: unknown }).schema === "string"
              ? raw as NorthstarLedgerValue
              : {};
            candidateResult = directResult;
            modelDiagnostic = {
              phase: "model-validation",
              code: error.code,
              message: error.message,
              recoveredDeterministically: true,
            };
          } else {
            throw error;
          }
        }
      }
      let validatedResult: NorthstarLedgerValue;
      try {
        validatedResult = validateNorthstarTaskResultContract({
          task: input.request.task,
          result: candidateResult,
          toolContext,
          ledgerContext: input.request.ledgerContext,
          evidenceAssets: attachedEvidenceAssets,
          evidenceAttachmentReport,
        });
      } catch (error) {
        if (!(error instanceof NorthstarTurnValidationError) && !(error instanceof TypeError)) throw error;
        if (!resilientVisualRun) {
          return attemptFailure(input.request, {
            failureKind: "correctable",
            code: "MODEL_OUTPUT_INVALID",
            message: error instanceof Error ? error.message : String(error),
            correctionContext: {
              validationCode: error instanceof NorthstarTurnValidationError
                ? error.code
                : "RESULT_CONTRACT_INVALID",
            },
            evidence: mergeNorthstarAttemptEvidence(toolContext, evidenceAttachmentReport),
          });
        }
        modelDiagnostic = {
          phase: "result-contract",
          code: error instanceof NorthstarTurnValidationError ? error.code : "RESULT_CONTRACT_INVALID",
          message: error instanceof Error ? error.message : String(error),
          recoveredDeterministically: true,
        };
        validatedResult = buildNorthstarFallbackTaskResult({
          task: input.request.task,
          modelResult: candidateResult,
          toolContext,
          ledgerContext: input.request.ledgerContext,
          evidenceAssets: attachedEvidenceAssets.length > 0 ? attachedEvidenceAssets : evidenceAssets,
          attachmentReport: evidenceAttachmentReport,
        });
      }
      const attemptEvidence = mergeNorthstarAttemptEvidence(
        toolContext,
        evidenceAttachmentReport,
      );
      const evidence = modelDiagnostic === undefined
        ? attemptEvidence
        : {
            ...(attemptEvidence && typeof attemptEvidence === "object" && !Array.isArray(attemptEvidence)
              ? attemptEvidence
              : attemptEvidence === undefined ? {} : { toolContext: attemptEvidence }),
            modelDiagnostic,
          } as NorthstarLedgerValue;
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: input.request.requestId,
        type: "attempt-result",
        taskId: input.request.task.id,
        attemptId: input.request.attempt.id,
        resultKind: resultKindForTask(input.request.task),
        result: validatedResult,
        evidence,
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
    let summary: NorthstarLedgerValue;
    try {
      const raw = await generateOneModelResponse(input.model, {
        operation: input.request.type,
        ...prompt,
        maxOutputTokens: 4_000,
        temperature: 0.1,
        signal: timeout.signal,
      });
      summary = parseNorthstarFinalizationModelOutput(raw).summary;
    } catch (error) {
      if ((input.signal?.aborted || isAbortError(error)) && !timeout.didTimeout()) throw error;
      if (!northstarObjectiveNeedsResilientVisualPipeline(input.request.ledgerContext.run.objective)) {
        throw error;
      }
      summary = deterministicNorthstarFinalSummary(input.request.ledgerContext);
    }
    return {
      protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
      requestId: input.request.requestId,
      type: "run-finalized",
      summary,
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
