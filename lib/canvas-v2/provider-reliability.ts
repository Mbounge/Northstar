import type {
  CanvasV2FailureCode,
  CanvasV2FailurePayload,
  CanvasV2ProviderAttemptAudit,
} from "@/lib/canvas-v2/request-reliability";

export class CanvasV2ProviderError extends Error {
  readonly code: CanvasV2FailureCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly providerAttempts?: CanvasV2ProviderAttemptAudit[];
  readonly providerHttpStatus?: number;

  constructor(input: CanvasV2FailurePayload & { status: number; providerHttpStatus?: number }) {
    super(input.error);
    this.name = "CanvasV2ProviderError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
    this.providerAttempts = input.providerAttempts;
    this.providerHttpStatus = input.providerHttpStatus;
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

export function invalidCanvasV2ProviderResponse(message: string, providerAttempts?: CanvasV2ProviderAttemptAudit[]): CanvasV2ProviderError {
  return new CanvasV2ProviderError({
    error: message,
    code: "invalid-response",
    status: 502,
    retryable: true,
    providerAttempts,
  });
}

export function canvasV2ProviderSupportsFallback(error: unknown): error is CanvasV2ProviderError {
  return error instanceof CanvasV2ProviderError
    && (error.code === "provider-unavailable" || error.code === "rate-limited" || error.code === "timeout" || error.code === "transport" || error.code === "invalid-response");
}

export async function fetchCanvasV2ProviderJson<T>(input: {
  url: string;
  init: RequestInit;
  requestSignal: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
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
      await response.text().catch(() => "");
      throw providerFailure(response.status, parseRetryAfterMs(response.headers.get("retry-after")));
    }
    try {
      return await response.json() as T;
    } catch (cause) {
      if (timedOut || input.requestSignal.aborted) throw cause;
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
  requestForModel: (model: string, correction?: string) => { url: string; init: RequestInit };
  validatePayload?: (payload: T, model: string) => void;
  fetcher?: typeof fetch;
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
  const models = [...new Set(input.models.filter(Boolean))];
  if (!models.length) throw new Error("Canvas V2 requires at least one provider model.");
  const attempts: CanvasV2ProviderAttemptAudit[] = [];
  const call = async (model: string, correction: string | undefined, timeoutMs: number | undefined) => {
    const request = input.requestForModel(model, correction);
    const attemptStartedAt = Date.now();
    const modelAttempt = attempts.filter((attempt) => attempt.model === model).length + 1;
    try {
      const payload = await fetchCanvasV2ProviderJson<T>({
        ...request,
        requestSignal: input.requestSignal,
        timeoutMs,
        fetcher: input.fetcher,
      });
      try {
        input.validatePayload?.(payload, model);
      } catch (error) {
        throw invalidCanvasV2ProviderResponse(error instanceof Error ? error.message : "North Star’s model returned invalid output.");
      }
      attempts.push({ model, attempt: modelAttempt, outcome: "completed", durationMs: Date.now() - attemptStartedAt });
      return payload;
      } catch (error) {
        if (error instanceof CanvasV2ProviderError) attempts.push({
        model,
        attempt: modelAttempt,
        outcome: providerAttemptOutcome(error),
        code: error.code,
        durationMs: Date.now() - attemptStartedAt,
        httpStatus: error.providerHttpStatus,
          detail: error.message.slice(0, 500),
        });
        if (process.env.NODE_ENV !== "production" && error instanceof CanvasV2ProviderError && error.code === "invalid-response") {
          console.warn("[canvas-v2] model output failed deterministic validation", {
            model,
            attempt: modelAttempt,
            detail: error.message.slice(0, 1_200),
          });
        }
        throw error;
      }
  };
  const maxInvalidResponses = Math.max(1, input.maxInvalidResponsesPerModel ?? 1);
  let lastFailure: CanvasV2ProviderError | undefined;
  let retryAfterMs: number | undefined;
  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    let correction: string | undefined;
    for (let invalidAttempt = 1; invalidAttempt <= maxInvalidResponses; invalidAttempt += 1) {
      try {
        return {
          payload: await call(model, correction, modelIndex === 0 ? input.primaryTimeoutMs ?? input.timeoutMs : input.timeoutMs),
          model,
          fallbackUsed: modelIndex > 0,
          attempts,
        };
      } catch (failure) {
        if (!(failure instanceof CanvasV2ProviderError)) throw failure;
        lastFailure = failure;
        retryAfterMs = failure.retryAfterMs ?? retryAfterMs;
        if (failure.code === "invalid-response" && invalidAttempt < maxInvalidResponses) {
          correction = failure.message;
          continue;
        }
        if (!canvasV2ProviderSupportsFallback(failure)) throw providerErrorWithAttempts(failure, attempts);
        break;
      }
    }
  }
  if (!lastFailure) throw new Error("Canvas V2 provider chain ended without an outcome.");
  const onlyInvalidResponses = attempts.every((attempt) => attempt.outcome === "invalid-response");
  throw new CanvasV2ProviderError({
    error: onlyInvalidResponses
      ? `North Star’s model chain could not repair its structured design output. ${lastFailure.message}`
      : `North Star’s model chain could not complete this design turn (${attempts.map((attempt) => `${attempt.model}: ${attempt.outcome}`).join("; ")}). The verified artboard is preserved and this run can continue from it.`,
    code: lastFailure.code,
    status: lastFailure.code === "provider-rejected" || lastFailure.code === "invalid-response" ? 502 : 503,
    retryable: onlyInvalidResponses,
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
