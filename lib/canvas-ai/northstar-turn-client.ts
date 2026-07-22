import type {
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerTaskAttempt,
} from "@/lib/canvas-ledger/types";
import {
  NORTHSTAR_TURN_ENDPOINT,
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  type NorthstarActivityDraftResponse,
  type NorthstarAttemptFailureResponse,
  type NorthstarAttemptResultResponse,
  type NorthstarRunFinalizedResponse,
  type NorthstarRunReadyToFinalizeResponse,
  type NorthstarTaskCorrectionResponse,
  type NorthstarTurnRequest,
  type NorthstarTurnResponse,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  NorthstarTurnValidationError,
  parseNorthstarTurnRequest,
  parseNorthstarTurnResponse,
} from "@/lib/canvas-ai/northstar-turn-validation";

export class NorthstarTurnTransportError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly requestId: string;
  readonly outcomeUnknown: boolean;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    outcomeUnknown: boolean;
    status?: number;
    retryAfterMs?: number;
  }) {
    super(input.message);
    this.name = "NorthstarTurnTransportError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.status = input.status;
    this.retryAfterMs = input.retryAfterMs;
    this.requestId = input.requestId;
    this.outcomeUnknown = input.outcomeUnknown;
  }
}

export interface NorthstarTurnCallOptions {
  signal?: AbortSignal;
  /**
   * Reuse this exact correlation ID only when explicitly retrying an ambiguous
   * transport delivery. It is not a task or ledger identity.
   */
  requestId?: string;
}

export interface NorthstarTurnClient {
  decideNextActivity(
    context: NorthstarLedgerLLMContext,
    options?: NorthstarTurnCallOptions,
  ): Promise<NorthstarActivityDraftResponse | NorthstarRunReadyToFinalizeResponse>;
  executeTaskAttempt(
    context: NorthstarLedgerLLMContext,
    task: NorthstarLedgerTask,
    attempt: NorthstarLedgerTaskAttempt,
    options?: NorthstarTurnCallOptions,
  ): Promise<NorthstarAttemptResultResponse | NorthstarAttemptFailureResponse>;
  correctActiveTask(
    context: NorthstarLedgerLLMContext,
    task: NorthstarLedgerTask,
    latestAttempt: NorthstarLedgerTaskAttempt,
    options?: NorthstarTurnCallOptions,
  ): Promise<NorthstarTaskCorrectionResponse>;
  finalizeRun(
    context: NorthstarLedgerLLMContext,
    options?: NorthstarTurnCallOptions,
  ): Promise<NorthstarRunFinalizedResponse>;
}

export interface CreateNorthstarTurnClientInput {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  createRequestId?: () => string;
}

function defaultRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `turnreq:${random}`;
  return `turnreq:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createNorthstarTurnClient(
  input: CreateNorthstarTurnClientInput = {},
): NorthstarTurnClient {
  const endpoint = input.endpoint ?? NORTHSTAR_TURN_ENDPOINT;
  const fetchImpl = input.fetchImpl ?? fetch;
  const createRequestId = input.createRequestId ?? defaultRequestId;

  const post = async (
    rawRequest: NorthstarTurnRequest,
    signal?: AbortSignal,
  ): Promise<NorthstarTurnResponse> => {
    const request = parseNorthstarTurnRequest(rawRequest);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Northstar-Turn-Protocol": NORTHSTAR_TURN_PROTOCOL_VERSION,
        },
        body: JSON.stringify(request),
        cache: "no-store",
        signal,
      });
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw error;
      throw new NorthstarTurnTransportError({
        code: "TURN_TRANSPORT_FAILED",
        message: error instanceof Error ? error.message : "The stateless turn request failed.",
        retryable: true,
        requestId: request.requestId,
        outcomeUnknown: true,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new NorthstarTurnTransportError({
        code: "TURN_RESPONSE_NOT_JSON",
        message: `The turn endpoint returned non-JSON HTTP ${response.status}.`,
        retryable: response.status >= 500,
        requestId: request.requestId,
        outcomeUnknown: true,
        status: response.status,
      });
    }

    let parsed: NorthstarTurnResponse;
    try {
      parsed = parseNorthstarTurnResponse(payload, request);
    } catch (error) {
      if (error instanceof NorthstarTurnValidationError) {
        throw new NorthstarTurnTransportError({
          code: error.code,
          message: error.message,
          retryable: false,
          requestId: request.requestId,
          outcomeUnknown: false,
          status: response.status,
        });
      }
      throw error;
    }

    if (parsed.type === "turn-error") {
      throw new NorthstarTurnTransportError({
        code: parsed.code,
        message: parsed.message,
        retryable: parsed.retryable,
        retryAfterMs: parsed.retryAfterMs,
        requestId: request.requestId,
        outcomeUnknown: false,
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new NorthstarTurnTransportError({
        code: "TURN_HTTP_ERROR",
        message: `The turn endpoint returned HTTP ${response.status}.`,
        retryable: response.status >= 500,
        requestId: request.requestId,
        outcomeUnknown: false,
        status: response.status,
      });
    }
    return parsed;
  };

  const requestId = (options?: NorthstarTurnCallOptions) =>
    options?.requestId ?? createRequestId();

  return {
    async decideNextActivity(context, options) {
      const response = await post({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "decide-next-activity",
        ledgerContext: context,
      }, options?.signal);
      if (response.type !== "activity-draft" && response.type !== "run-ready-to-finalize") {
        throw new NorthstarTurnTransportError({
          code: "TURN_RESPONSE_TYPE_MISMATCH",
          message: `Decision request returned ${response.type}.`,
          retryable: false,
          requestId: response.requestId,
          outcomeUnknown: false,
        });
      }
      return response;
    },

    async executeTaskAttempt(context, task, attempt, options) {
      const response = await post({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "execute-task-attempt",
        ledgerContext: context,
        task,
        attempt,
      }, options?.signal);
      if (response.type !== "attempt-result" && response.type !== "attempt-failure") {
        throw new NorthstarTurnTransportError({
          code: "TURN_RESPONSE_TYPE_MISMATCH",
          message: `Execution request returned ${response.type}.`,
          retryable: false,
          requestId: response.requestId,
          outcomeUnknown: false,
        });
      }
      return response;
    },

    async correctActiveTask(context, task, latestAttempt, options) {
      const response = await post({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "correct-active-task",
        ledgerContext: context,
        task,
        latestAttempt,
      }, options?.signal);
      if (response.type !== "task-correction") {
        throw new NorthstarTurnTransportError({
          code: "TURN_RESPONSE_TYPE_MISMATCH",
          message: `Correction request returned ${response.type}.`,
          retryable: false,
          requestId: response.requestId,
          outcomeUnknown: false,
        });
      }
      return response;
    },

    async finalizeRun(context, options) {
      const response = await post({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "finalize-run",
        ledgerContext: context,
      }, options?.signal);
      if (response.type !== "run-finalized") {
        throw new NorthstarTurnTransportError({
          code: "TURN_RESPONSE_TYPE_MISMATCH",
          message: `Finalization request returned ${response.type}.`,
          retryable: false,
          requestId: response.requestId,
          outcomeUnknown: false,
        });
      }
      return response;
    },
  };
}
