import { emitCanvasV2Activity } from "./activity-stream.server";
import type {
  CanvasV2FailureCode,
  CanvasV2FailurePayload,
  CanvasV2ProviderAttemptAudit,
  CanvasV2ProviderRequestAudit,
  CanvasV2ProviderUsage,
} from "@/lib/canvas-v2/request-reliability";
import { canvasV2ProviderForModelIfKnown } from "@/lib/canvas-v2/model-catalog";

/**
 * Product orchestration is first-pass by contract. Structured-output or
 * semantic validation failures must be prevented by server-owned schemas,
 * handles, canonicalization, and compilers. One correction is retained only
 * as a rare provider-variance seatbelt so an internal private draft never
 * becomes a user-visible dead end. Exercising attempt two is unhealthy in the
 * release proof even when the run ultimately succeeds.
 *
 * The generic provider harness still supports higher values in isolated
 * reliability tests and non-product callers. Every North Star product phase
 * must opt into this constant explicitly.
 */
export const CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS = 2;

/** A valid request for additional context, distinct from a rejected draft. */
export class CanvasV2ProviderContextRequest extends Error {
  constructor(message: string) { super(message); this.name = "CanvasV2ProviderContextRequest"; }
}

export class CanvasV2ProviderError extends Error {
  readonly code: CanvasV2FailureCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly providerAttempts?: CanvasV2ProviderAttemptAudit[];
  readonly providerHttpStatus?: number;
  /** Private corrective context for the next provider call; never returned to the client. */
  readonly repairContext?: string;

  constructor(input: CanvasV2FailurePayload & { status: number; providerHttpStatus?: number; repairContext?: string }) {
    super(input.error);
    this.name = "CanvasV2ProviderError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
    this.providerAttempts = input.providerAttempts;
    this.providerHttpStatus = input.providerHttpStatus;
    this.repairContext = input.repairContext;
  }
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function providerFailure(status: number, retryAfterMs?: number): CanvasV2ProviderError {
  if (status === 429) return new CanvasV2ProviderError({
    error: "North Star’s model provider is temporarily rate limited.",
    code: "rate-limited",
    status: 429,
    retryable: true,
    retryAfterMs,
    providerHttpStatus: status,
  });
  if (status === 408 || status === 425 || status >= 500) return new CanvasV2ProviderError({
    error: "North Star’s model provider is temporarily unavailable.",
    code: status === 408 ? "timeout" : "provider-unavailable",
    status: 502,
    retryable: true,
    retryAfterMs,
    providerHttpStatus: status,
  });
  return new CanvasV2ProviderError({
    error: `North Star’s model provider rejected the request (${status}).`,
    code: "provider-rejected",
    status: 502,
    retryable: false,
    providerHttpStatus: status,
  });
}

function providerRejectionDiagnostic(raw: string): Record<string, string | number> {
  const fallback = raw.replace(/\s+/g, " ").trim().slice(0, 1_200);
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const error = payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
      ? payload.error as Record<string, unknown>
      : {};
    const text = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0, limit) : "";
    return {
      message: text(error.message, 1_200) || fallback,
      type: text(error.type, 160),
      param: text(error.param, 240),
      code: text(error.code, 160),
    };
  } catch {
    return { message: fallback };
  }
}

export function invalidCanvasV2ProviderResponse(message: string, providerAttempts?: CanvasV2ProviderAttemptAudit[], repairContext?: string): CanvasV2ProviderError {
  return new CanvasV2ProviderError({
    error: message,
    code: "invalid-response",
    status: 502,
    retryable: true,
    providerAttempts,
    repairContext,
  });
}

export function canvasV2ProviderSupportsFallback(error: unknown): error is CanvasV2ProviderError {
  return error instanceof CanvasV2ProviderError
    && (error.code === "provider-unavailable" || error.code === "rate-limited" || error.code === "timeout" || error.code === "transport" || error.code === "invalid-response");
}

/** Consume Responses SSE without exposing partial JSON or private reasoning.
 * Only a terminal response can enter the existing validation/usage pipeline. */
export async function readCanvasV2ProviderEventStream<T>(response: Response, onEvent?: (event: Record<string, unknown>) => void): Promise<T> {
  const reader = response.body?.getReader();
  if (!reader) throw invalidCanvasV2ProviderResponse("The model stream had no response body.");
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  let terminal: T | undefined;
  const dispatch = () => {
    const payload = data.join("\n"); data = [];
    if (!payload || payload === "[DONE]") return;
    const event = JSON.parse(payload) as Record<string, unknown>;
    if (event.type === "error" || event.type === "response.failed") throw invalidCanvasV2ProviderResponse("The model stream ended with a provider error.");
    onEvent?.(event);
    if (event.type === "response.completed" || event.type === "response.incomplete") terminal = event.response as T;
  };
  try {
    while (terminal === undefined) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, ""); buffer = buffer.slice(newline + 1);
        if (!line) dispatch();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (chunk.done) {
        if (buffer.startsWith("data:")) data.push(buffer.slice(5).trimStart());
        dispatch();
        break;
      }
    }
    if (terminal === undefined) throw invalidCanvasV2ProviderResponse("The model stream ended before a complete response arrived.");
    return terminal;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function fetchCanvasV2ProviderJson<T>(input: {
  url: string;
  init: RequestInit;
  requestSignal: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  onStreamEvent?: (event: Record<string, unknown>) => void;
}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  input.requestSignal.addEventListener("abort", cancel, { once: true });
  const timeout = input.timeoutMs === undefined ? undefined : setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  try {
    const response = await (input.fetcher ?? fetch)(input.url, { ...input.init, signal: controller.signal });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      if (process.env.NODE_ENV !== "production") {
        console.warn("[canvas-v2] provider rejected request", {
          status: response.status,
          ...providerRejectionDiagnostic(raw),
        });
      }
      throw providerFailure(response.status, parseRetryAfterMs(response.headers.get("retry-after")));
    }
    try {
      return response.headers.get("content-type")?.includes("text/event-stream")
        ? await readCanvasV2ProviderEventStream<T>(response, input.onStreamEvent)
        : await response.json() as T;
    } catch (cause) {
      if (cause instanceof CanvasV2ProviderError || timedOut || input.requestSignal.aborted) throw cause;
      throw invalidCanvasV2ProviderResponse("North Star’s model provider returned unreadable JSON.");
    }
  } catch (cause) {
    if (cause instanceof CanvasV2ProviderError) throw cause;
    if (input.requestSignal.aborted) throw new CanvasV2ProviderError({
      error: "The North Star request was stopped.",
      code: "cancelled",
      status: 499,
      retryable: false,
    });
    if (timedOut) throw new CanvasV2ProviderError({
      error: "North Star’s model provider timed out.",
      code: "timeout",
      status: 504,
      retryable: true,
    });
    throw new CanvasV2ProviderError({
      error: "North Star could not reach the model provider.",
      code: "transport",
      status: 502,
      retryable: true,
    });
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    input.requestSignal.removeEventListener("abort", cancel);
  }
}

export interface CanvasV2ProviderFallbackOutcome<T> {
  payload: T;
  model: string;
  fallbackUsed: boolean;
  attempts: CanvasV2ProviderAttemptAudit[];
}

export interface CanvasV2ProviderModelChainInput<T> {
  models: readonly string[];
  requestSignal: AbortSignal;
  /** Structural correction attempts are internal and receive the exact validator failure. */
  maxInvalidResponsesPerModel?: number;
  /** Optional only for callers that explicitly own a deadline. Design calls omit it. */
  timeoutMs?: number;
  primaryTimeoutMs?: number;
  requestForModel: (model: string, correction?: string) => { url: string; init: RequestInit; audit?: CanvasV2ProviderRequestAudit };
  attemptRole?: CanvasV2ProviderAttemptAudit["role"];
  /** Public task context and a receipt derived only from the validated result. */
  activity?: { label: string; detail?: string; completed?: (payload: T, model: string) => { label?: string; detail: string } };
  onStreamEvent?: (event: Record<string, unknown>) => void;
  validatePayload?: (payload: T, model: string) => void;
  /** Caller-owned authoritative context revealed progressively across repairs. */
  repairContextForAttempt?: (input: {
    model: string;
    repairAttempt: number;
    totalRepairAttempts: number;
    failureHistory: readonly string[];
  }) => string | undefined;
  fetcher?: typeof fetch;
}

function tokenCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function providerUsage(payload: unknown, model: string): CanvasV2ProviderUsage | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  const provider = canvasV2ProviderForModelIfKnown(model);
  if (provider === "openai") {
    if (!record.usage || typeof record.usage !== "object" || Array.isArray(record.usage)) return undefined;
    const usage = record.usage as Record<string, unknown>;
    const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === "object"
      ? usage.input_tokens_details as Record<string, unknown>
      : {};
    const outputDetails = usage.output_tokens_details && typeof usage.output_tokens_details === "object"
      ? usage.output_tokens_details as Record<string, unknown>
      : {};
    return {
      requestCount: 1,
      inputTokens: tokenCount(usage.input_tokens),
      cachedInputTokens: tokenCount(inputDetails.cached_tokens),
      cacheWriteTokens: tokenCount(inputDetails.cache_write_tokens),
      outputTokens: tokenCount(usage.output_tokens),
      reasoningTokens: tokenCount(outputDetails.reasoning_tokens),
      totalTokens: tokenCount(usage.total_tokens),
    };
  }
  if (provider === "google" && record.usageMetadata && typeof record.usageMetadata === "object" && !Array.isArray(record.usageMetadata)) {
    const usage = record.usageMetadata as Record<string, unknown>;
    return {
      requestCount: 1,
      inputTokens: tokenCount(usage.promptTokenCount),
      cachedInputTokens: tokenCount(usage.cachedContentTokenCount),
      cacheWriteTokens: 0,
      outputTokens: tokenCount(usage.candidatesTokenCount),
      reasoningTokens: tokenCount(usage.thoughtsTokenCount),
      totalTokens: tokenCount(usage.totalTokenCount),
    };
  }
  return undefined;
}

function providerAttemptOutcome(error: CanvasV2ProviderError): CanvasV2ProviderAttemptAudit["outcome"] {
  if (error.code === "timeout") return "timeout";
  if (error.code === "provider-unavailable") return "provider-unavailable";
  if (error.code === "rate-limited") return "rate-limited";
  if (error.code === "invalid-response") return "invalid-response";
  if (error.code === "cancelled") return "cancelled";
  if (error.code === "transport") return "transport";
  return "rejected";
}

function providerErrorWithAttempts(error: CanvasV2ProviderError, providerAttempts: CanvasV2ProviderAttemptAudit[]): CanvasV2ProviderError {
  return new CanvasV2ProviderError({
    error: error.message,
    code: error.code,
    status: error.status,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
    providerAttempts,
    providerHttpStatus: error.providerHttpStatus,
  });
}

/**
 * One logical design request across an ordered model chain. Invalid structured
 * output is repaired by the same model with the exact validator failure before
 * the request advances to another provider model.
 */
export async function fetchCanvasV2ProviderJsonWithModelChain<T>(input: CanvasV2ProviderModelChainInput<T>): Promise<CanvasV2ProviderFallbackOutcome<T>> {
  // Activity describes the logical operation. Private attempts remain in the
  // audit and must not appear as contradictory failed/completed user steps.
  const operationId = crypto.randomUUID();
  const label = input.activity?.label ?? (input.attemptRole === "external-researcher" ? "Web research"
    : input.attemptRole === "explanation-reviewer" ? "Checking the explanation against sources"
    : input.attemptRole === "discovery-director" ? "Investigating the next question"
    : input.attemptRole === "visual-director" ? "Planning the composition"
    : input.attemptRole === "source-author" ? "Composing the canvas" : "Preparing the response");
  emitCanvasV2Activity({ id: operationId, operationId, kind: "activity", status: "started", label, detail: input.activity?.detail });
  try {
    const result = await runCanvasV2ProviderModelChain(input);
    const receipt = input.activity?.completed?.(result.payload, result.model);
    emitCanvasV2Activity({ id: operationId, operationId, kind: "activity", status: "completed", label: receipt?.label ?? label, detail: receipt?.detail ?? input.activity?.detail });
    return result;
  } catch (error) {
    emitCanvasV2Activity({ id: operationId, operationId, kind: "activity", status: input.requestSignal.aborted ? "cancelled" : "failed", label });
    throw error;
  }
}

async function runCanvasV2ProviderModelChain<T>(input: CanvasV2ProviderModelChainInput<T>): Promise<CanvasV2ProviderFallbackOutcome<T>> {
  const models = [...new Set(input.models.filter(Boolean))];
  if (!models.length) throw new Error("Canvas V2 requires at least one provider model.");
  const attempts: CanvasV2ProviderAttemptAudit[] = [];
  const call = async (model: string, correction: string | undefined, timeoutMs: number | undefined) => {
    const request = input.requestForModel(model, correction);
    const attemptStartedAt = Date.now();
    const modelAttempt = attempts.filter((attempt) => attempt.model === model).length + 1;
    let observedUsage: CanvasV2ProviderUsage | undefined;
    try {
      const payload = await fetchCanvasV2ProviderJson<T>({
        ...request,
        requestSignal: input.requestSignal,
        timeoutMs,
        fetcher: input.fetcher,
        onStreamEvent: input.onStreamEvent,
      });
      observedUsage = providerUsage(payload, model);
      // An incomplete provider response is not malformed authored JSON. Keep its
      // usage and cause, and never let even parseable partial content validate.
      const envelope = payload as { status?: string; incomplete_details?: { reason?: string } } | null;
      if (envelope?.status === "incomplete") {
        const reason = envelope.incomplete_details?.reason ?? "unspecified";
        throw invalidCanvasV2ProviderResponse(`The provider response was incomplete (${reason}).`, undefined,
          "The provider ended the preceding response before completion. Return a concise complete report; preserve consequential findings and omit repetitive metadata. Do not treat partial output as accepted evidence.");
      }
      try {
        input.validatePayload?.(payload, model);
      } catch (error) {
        if (error instanceof CanvasV2ProviderContextRequest) throw error;
        const message = error instanceof Error ? error.message : "North Star’s model returned invalid output.";
        throw invalidCanvasV2ProviderResponse(message, undefined, [
          `Your preceding structured draft failed deterministic validation: ${message}`,
          "The committed revision did not change. Return a corrected response for the exact same brief and source. Do not explain the failure.",
        ].join("\n\n"));
      }
      attempts.push({
        model,
        ...(canvasV2ProviderForModelIfKnown(model) ? { provider: canvasV2ProviderForModelIfKnown(model) } : {}),
        ...(input.attemptRole ? { role: input.attemptRole } : {}),
        attempt: modelAttempt,
        outcome: "completed",
        durationMs: Date.now() - attemptStartedAt,
        ...(observedUsage ? { usage: observedUsage } : {}),
        ...(request.audit ? { request: request.audit } : {}),
      });
      return payload;
      } catch (error) {
        if (error instanceof CanvasV2ProviderContextRequest) {
          attempts.push({ model, ...(input.attemptRole ? { role: input.attemptRole } : {}), attempt: modelAttempt,
            outcome: "completed", durationMs: Date.now() - attemptStartedAt, detail: "Requested retained source details",
            ...(observedUsage ? { usage: observedUsage } : {}), ...(request.audit ? { request: request.audit } : {}),
          });
          emitCanvasV2Activity({ id: crypto.randomUUID(), kind: "activity", status: "completed", label: "Inspected source details" });
          throw error;
        }
        if (error instanceof CanvasV2ProviderError) attempts.push({
        model,
        ...(canvasV2ProviderForModelIfKnown(model) ? { provider: canvasV2ProviderForModelIfKnown(model) } : {}),
        ...(input.attemptRole ? { role: input.attemptRole } : {}),
        attempt: modelAttempt,
        outcome: providerAttemptOutcome(error),
        code: error.code,
        durationMs: Date.now() - attemptStartedAt,
        httpStatus: error.providerHttpStatus,
        detail: error.message.slice(0, 500),
        ...(observedUsage ? { usage: observedUsage } : {}),
        ...(request.audit ? { request: request.audit } : {}),
        });
        if (process.env.NODE_ENV !== "production" && error instanceof CanvasV2ProviderError && error.code === "invalid-response") {
          console.warn("[canvas-v2] model output failed deterministic validation", {
            model,
            role: input.attemptRole,
            attempt: modelAttempt,
            usage: observedUsage,
            detail: error.message.slice(0, 1_200),
          });
        }
        throw error;
      }
  };
  const maxInvalidResponses = Math.max(1, input.maxInvalidResponsesPerModel ?? 1);
  const totalRepairAttempts = Math.max(0, maxInvalidResponses - 1);
  let lastFailure: CanvasV2ProviderError | undefined;
  let retryAfterMs: number | undefined;
  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    let correction: string | undefined;
    let contextRequests = 0;
    const correctionFailures: string[] = [];
    for (let invalidAttempt = 1; invalidAttempt <= maxInvalidResponses; invalidAttempt += 1) {
      try {
        return {
          payload: await call(model, correction, modelIndex === 0 ? input.primaryTimeoutMs ?? input.timeoutMs : input.timeoutMs),
          model,
          fallbackUsed: modelIndex > 0,
          attempts,
        };
      } catch (failure) {
        if (failure instanceof CanvasV2ProviderContextRequest) {
          if (++contextRequests > 1) throw invalidCanvasV2ProviderResponse("The retained source details are already available; repeated context expansion did not produce a decision.", attempts);
          correction = failure.message;
          invalidAttempt -= 1;
          continue;
        }
        if (!(failure instanceof CanvasV2ProviderError)) throw failure;
        lastFailure = failure;
        retryAfterMs = failure.retryAfterMs ?? retryAfterMs;
        if (failure.code === "invalid-response" && invalidAttempt < maxInvalidResponses) {
          correctionFailures.push(failure.message);
          const repairAttempt = invalidAttempt;
          const repairPosture = repairAttempt === 1
            ? "Repair the exact rejected field or patch operation and preserve every valid part of the intended move."
            : repairAttempt === 2
              ? "Re-read the response schema and authoritative source handles. Rebuild the complete minimal response; do not preserve malformed optional structure from the rejected draft."
              : "Final structural repair: discard the malformed response shape and reconstruct only the required fields from the unchanged brief and committed source. Prefer the smallest valid patch that realizes the same move.";
          const callerContext = input.repairContextForAttempt?.({
            model,
            repairAttempt,
            totalRepairAttempts,
            failureHistory: correctionFailures,
          });
          correction = [
            `REPAIR PASS ${repairAttempt} OF ${totalRepairAttempts}.`,
            repairPosture,
            `Validator failure history: ${correctionFailures.map((message, index) => `${index + 1}. ${message.slice(0, 800)}`).join(" | ")}`,
            failure.repairContext ?? failure.message,
            ...(callerContext ? [callerContext] : []),
          ].join("\n\n");
          continue;
        }
        if (!canvasV2ProviderSupportsFallback(failure)) throw providerErrorWithAttempts(failure, attempts);
        break;
      }
    }
  }
  if (!lastFailure) throw new Error("Canvas V2 provider chain ended without an outcome.");
  const onlyInvalidResponses = attempts.every((attempt) => attempt.outcome === "invalid-response");
  // A pinned OpenAI experience deliberately has no cross-provider fallback.
  // Preserve a real 429 as retryable so the existing client request envelope
  // can honor Retry-After once without exposing a transient capacity failure as
  // a finished chat error. Exhausted multi-model chains and structural drafts
  // still pause rather than replaying the complete endpoint.
  const pinnedModelRateLimit = models.length === 1 && lastFailure.code === "rate-limited";
  throw new CanvasV2ProviderError({
    error: onlyInvalidResponses
      ? "North Star did not accept the private model draft because it failed the phase's deterministic contract. The verified canvas is preserved."
      : `North Star’s model chain could not complete this design turn (${attempts.map((attempt) => `${attempt.model}: ${attempt.outcome}`).join("; ")}). The verified canvas is preserved and this run can continue from it.`,
    code: lastFailure.code,
    status: pinnedModelRateLimit
      ? 429
      : lastFailure.code === "provider-rejected" || lastFailure.code === "invalid-response" ? 502 : 503,
    // Every invalid draft has already received the caller-owned corrective
    // attempts. Do not make the client repeat the entire logical turn.
    retryable: pinnedModelRateLimit,
    retryAfterMs,
    providerAttempts: attempts,
    providerHttpStatus: lastFailure.providerHttpStatus,
  });
}

/** Backwards-compatible two-model wrapper for routing and existing callers. */
export async function fetchCanvasV2ProviderJsonWithFallback<T>(input: {
  primaryModel: string;
  fallbackModel: string;
  requestSignal: AbortSignal;
  timeoutMs?: number;
  primaryTimeoutMs?: number;
  requestForModel: (model: string) => { url: string; init: RequestInit };
  validatePayload?: (payload: T, model: string) => void;
  fetcher?: typeof fetch;
}): Promise<CanvasV2ProviderFallbackOutcome<T>> {
  return fetchCanvasV2ProviderJsonWithModelChain({
    ...input,
    models: [input.primaryModel, input.fallbackModel],
  });
}

export function canvasV2ProviderErrorResponse(error: CanvasV2ProviderError): {
  status: number;
  body: CanvasV2FailurePayload;
  headers?: Record<string, string>;
} {
  return {
    status: error.status,
    body: {
      error: error.message,
      code: error.code,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      providerAttempts: error.providerAttempts,
    },
    ...(error.retryAfterMs !== undefined ? { headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1_000)) } } : {}),
  };
}
