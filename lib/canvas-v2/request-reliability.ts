export type CanvasV2FailureCode =
  | "cancelled"
  | "configuration"
  | "invalid-request"
  | "invalid-response"
  | "rate-limited"
  | "timeout"
  | "transport"
  | "provider-unavailable"
  | "provider-rejected"
  | "server-unavailable";

export interface CanvasV2FailurePayload {
  error: string;
  code: CanvasV2FailureCode;
  retryable: boolean;
  retryAfterMs?: number;
  providerAttempts?: CanvasV2ProviderAttemptAudit[];
}

export interface CanvasV2ProviderUsage {
  /** Every provider HTTP request counts, including a structurally invalid draft. */
  requestCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface CanvasV2ProviderRequestAudit {
  textCharacters: number;
  imageCount: number;
  encodedImageBytes: number;
  imageDetails: {
    low: number;
    high: number;
    auto: number;
    original: number;
  };
  promptCacheMode: "explicit" | "implicit" | "none";
  cacheNamespace?: string;
}

export interface CanvasV2ProviderAttemptAudit {
  model: string;
  provider?: "openai" | "google";
  role?: "router" | "discovery-director" | "external-researcher" | "visual-director" | "source-author";
  attempt?: number;
  outcome: "completed" | "provider-unavailable" | "rate-limited" | "timeout" | "invalid-response" | "rejected" | "cancelled" | "transport";
  durationMs: number;
  code?: CanvasV2FailureCode;
  httpStatus?: number;
  detail?: string;
  /** Exact provider-reported usage. It is diagnostic state, never canvas copy. */
  usage?: CanvasV2ProviderUsage;
  /** Preflight request shape, retained even when the provider rejects the call. */
  request?: CanvasV2ProviderRequestAudit;
}

export const CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS = {
  // These values produce diagnostic signals for evaluation and cost analysis.
  // They never pause, fail, or complete a run: inquiry-specific readiness and
  // actual infrastructure state remain the only execution authorities.
  requestsWithoutCommit: 8,
  uncachedInputTokensWithoutCommit: 500_000,
  cacheWriteTokensWithoutCommit: 192_000,
} as const;

function finiteTokenCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function parseCanvasV2ProviderUsage(value: unknown): CanvasV2ProviderUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const usage = value as Partial<CanvasV2ProviderUsage>;
  return {
    requestCount: finiteTokenCount(usage.requestCount),
    inputTokens: finiteTokenCount(usage.inputTokens),
    cachedInputTokens: finiteTokenCount(usage.cachedInputTokens),
    cacheWriteTokens: finiteTokenCount(usage.cacheWriteTokens),
    outputTokens: finiteTokenCount(usage.outputTokens),
    reasoningTokens: finiteTokenCount(usage.reasoningTokens),
    totalTokens: finiteTokenCount(usage.totalTokens),
  };
}

export function mergeCanvasV2ProviderUsage(
  ...values: Array<CanvasV2ProviderUsage | undefined>
): CanvasV2ProviderUsage {
  return values.reduce<CanvasV2ProviderUsage>((total, value) => ({
    requestCount: total.requestCount + (value?.requestCount ?? 0),
    inputTokens: total.inputTokens + (value?.inputTokens ?? 0),
    cachedInputTokens: total.cachedInputTokens + (value?.cachedInputTokens ?? 0),
    cacheWriteTokens: total.cacheWriteTokens + (value?.cacheWriteTokens ?? 0),
    outputTokens: total.outputTokens + (value?.outputTokens ?? 0),
    reasoningTokens: total.reasoningTokens + (value?.reasoningTokens ?? 0),
    totalTokens: total.totalTokens + (value?.totalTokens ?? 0),
  }), {
    requestCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  });
}

export function canvasV2ProviderUsageFromAttempts(
  attempts: readonly CanvasV2ProviderAttemptAudit[] | undefined,
): CanvasV2ProviderUsage {
  return mergeCanvasV2ProviderUsage(...(attempts ?? []).map((attempt) => (
    attempt.usage ?? {
      requestCount: 1,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    }
  )));
}

export function canvasV2ProviderUsageSignals(
  usage: CanvasV2ProviderUsage | undefined,
  checkpoint?: CanvasV2ProviderUsage,
): {
  sinceCommit: Pick<CanvasV2ProviderUsage, "requestCount" | "inputTokens" | "cachedInputTokens" | "cacheWriteTokens">;
  uncachedInputTokens: number;
  signals: Array<"request-density" | "uncached-input-density" | "cache-write-density">;
} {
  const sinceCommit = {
    requestCount: Math.max(0, (usage?.requestCount ?? 0) - (checkpoint?.requestCount ?? 0)),
    inputTokens: Math.max(0, (usage?.inputTokens ?? 0) - (checkpoint?.inputTokens ?? 0)),
    cachedInputTokens: Math.max(0, (usage?.cachedInputTokens ?? 0) - (checkpoint?.cachedInputTokens ?? 0)),
    cacheWriteTokens: Math.max(0, (usage?.cacheWriteTokens ?? 0) - (checkpoint?.cacheWriteTokens ?? 0)),
  };
  const uncachedInputTokens = Math.max(0, sinceCommit.inputTokens - sinceCommit.cachedInputTokens);
  const signals: Array<"request-density" | "uncached-input-density" | "cache-write-density"> = [];
  if (sinceCommit.requestCount >= CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS.requestsWithoutCommit) signals.push("request-density");
  if (uncachedInputTokens >= CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS.uncachedInputTokensWithoutCommit) signals.push("uncached-input-density");
  if (sinceCommit.cacheWriteTokens >= CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS.cacheWriteTokensWithoutCommit) signals.push("cache-write-density");
  return { sinceCommit, uncachedInputTokens, signals };
}

export interface CanvasV2RequestPolicy {
  maxAttempts: number;
  timeoutMs?: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface CanvasV2RetryState {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  code: CanvasV2FailureCode;
}

export function canvasV2RetryReason(code: CanvasV2FailureCode): string {
  switch (code) {
    case "invalid-response":
      return "North Star is correcting its response";
    case "rate-limited":
      return "Provider busy";
    case "timeout":
      return "Response timed out";
    case "provider-unavailable":
    case "server-unavailable":
      return "Service temporarily unavailable";
    case "transport":
      return "Connection interrupted";
    case "provider-rejected":
      return "Provider rejected the request";
    case "configuration":
      return "Configuration unavailable";
    case "invalid-request":
      return "Request needs revision";
    case "cancelled":
      return "Request stopped";
  }
}

export function canvasV2PublicFailureMessage(error: unknown): string {
  if (!(error instanceof CanvasV2RequestError)) {
    return "North Star couldn’t finish that safely. Your latest canvas is unchanged.";
  }
  switch (error.code) {
    case "configuration":
      return "North Star isn’t available in this workspace yet. Your canvas is unchanged.";
    case "invalid-request":
      return "North Star needs a little more context before it can continue safely. Your canvas is unchanged.";
    case "invalid-response":
      return "North Star couldn’t form a reliable next step. Your latest canvas is unchanged, so you can try again.";
    case "rate-limited":
    case "provider-unavailable":
    case "server-unavailable":
      return "North Star is temporarily unavailable. Your latest canvas is safe, and you can continue when it reconnects.";
    case "timeout":
    case "transport":
      return "The connection was interrupted. Your latest canvas is safe, and you can continue from it.";
    case "provider-rejected":
      return "North Star couldn’t complete that request safely. Your latest canvas is unchanged.";
    case "cancelled":
      return "Stopped. Your latest canvas remains visible.";
  }
}

export const CANVAS_V2_ROUTING_REQUEST_POLICY: CanvasV2RequestPolicy = {
  maxAttempts: 2,
  baseDelayMs: 350,
  maxDelayMs: 1_400,
};

export const CANVAS_V2_DESIGN_REQUEST_POLICY: CanvasV2RequestPolicy = {
  maxAttempts: 2,
  baseDelayMs: 500,
  maxDelayMs: 2_000,
};

export class CanvasV2RequestError extends Error {
  readonly code: CanvasV2FailureCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly attempts: number;
  readonly providerAttempts?: CanvasV2ProviderAttemptAudit[];

  constructor(input: CanvasV2FailurePayload & { attempts: number }) {
    super(input.error);
    this.name = "CanvasV2RequestError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
    this.attempts = input.attempts;
    this.providerAttempts = input.providerAttempts;
  }
}

function abortError(): Error {
  return new DOMException("The request was stopped.", "AbortError");
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function statusCode(status: number): CanvasV2FailureCode {
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "provider-unavailable";
  return "provider-rejected";
}

function failureFromResponse(response: Response, payload: unknown, attempt: number): CanvasV2RequestError {
  const record = payload && typeof payload === "object" ? payload as Partial<CanvasV2FailurePayload> : {};
  const retryable = typeof record.retryable === "boolean" ? record.retryable : retryableStatus(response.status);
  const code = typeof record.code === "string" ? record.code as CanvasV2FailureCode : statusCode(response.status);
  const retryAfterMs = typeof record.retryAfterMs === "number" && record.retryAfterMs >= 0
    ? record.retryAfterMs
    : parseRetryAfterMs(response.headers.get("retry-after"));
  return new CanvasV2RequestError({
    error: typeof record.error === "string" && record.error.trim() ? record.error : `North Star request failed (${response.status}).`,
    code,
    retryable,
    retryAfterMs,
    providerAttempts: Array.isArray(record.providerAttempts) ? record.providerAttempts : undefined,
    attempts: attempt,
  });
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function requestCanvasV2Json<T>(input: {
  endpoint: string;
  body: unknown;
  signal: AbortSignal;
  requestId: string;
  policy: CanvasV2RequestPolicy;
  onRetry?: (state: CanvasV2RetryState) => void;
  fetcher?: typeof fetch;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}): Promise<T> {
  const fetcher = input.fetcher ?? fetch;
  const wait = input.wait ?? waitForRetry;
  const serializedBody = JSON.stringify(input.body);
  let lastFailure: CanvasV2RequestError | undefined;
  let correction: string | undefined;

  for (let attempt = 1; attempt <= input.policy.maxAttempts; attempt += 1) {
    if (input.signal.aborted) throw abortError();
    const attemptController = new AbortController();
    let timedOut = false;
    const cancelAttempt = () => attemptController.abort();
    input.signal.addEventListener("abort", cancelAttempt, { once: true });
    const timeout = input.policy.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      attemptController.abort();
    }, input.policy.timeoutMs);

    try {
      const response = await fetcher(input.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Canvas-V2-Request-ID": input.requestId,
          "X-Canvas-V2-Attempt": String(attempt),
          ...(correction ? { "X-Canvas-V2-Previous-Failure": encodeURIComponent(correction.slice(0, 1_200)) } : {}),
        },
        signal: attemptController.signal,
        body: serializedBody,
      });
      const raw = await response.text();
      let payload: unknown;
      try {
        payload = raw ? JSON.parse(raw) : undefined;
      } catch {
        // A proxy, authentication layer, or framework error page can return
        // HTML for a failed HTTP response. That is an infrastructure/status
        // failure, not malformed model output, and must not consume a model
        // correction retry or mislead the user about the provider response.
        if (!response.ok) throw failureFromResponse(response, undefined, attempt);
        throw new CanvasV2RequestError({
          error: "North Star received an unreadable provider response.",
          code: "invalid-response",
          retryable: true,
          attempts: attempt,
        });
      }
      if (!response.ok) throw failureFromResponse(response, payload, attempt);
      if (payload === undefined) throw new CanvasV2RequestError({
        error: "North Star received an empty provider response.",
        code: "invalid-response",
        retryable: true,
        attempts: attempt,
      });
      return payload as T;
    } catch (cause) {
      if (input.signal.aborted) throw abortError();
      if (cause instanceof CanvasV2RequestError) {
        lastFailure = cause;
        correction = cause.code === "invalid-response" ? cause.message : undefined;
      }
      else if (timedOut) lastFailure = new CanvasV2RequestError({
        error: "North Star’s model request timed out.",
        code: "timeout",
        retryable: true,
        attempts: attempt,
      });
      else lastFailure = new CanvasV2RequestError({
        error: "North Star could not reach the model provider.",
        code: "transport",
        retryable: true,
        attempts: attempt,
      });
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      input.signal.removeEventListener("abort", cancelAttempt);
    }

    if (!lastFailure.retryable || attempt >= input.policy.maxAttempts) break;
    const delayMs = Math.min(
      input.policy.maxDelayMs,
      Math.max(lastFailure.retryAfterMs ?? 0, input.policy.baseDelayMs * 2 ** (attempt - 1)),
    );
    input.onRetry?.({ attempt: attempt + 1, maxAttempts: input.policy.maxAttempts, delayMs, code: lastFailure.code });
    await wait(delayMs, input.signal);
  }

  if (!lastFailure) throw new CanvasV2RequestError({
    error: "North Star could not complete the request.",
    code: "transport",
    retryable: false,
    attempts: 0,
  });
  throw new CanvasV2RequestError({
    error: lastFailure.retryable && lastFailure.attempts > 1
      ? `${lastFailure.message} The request stopped after ${lastFailure.attempts} attempts.`
      : lastFailure.message,
    code: lastFailure.code,
    retryable: lastFailure.retryable,
    retryAfterMs: lastFailure.retryAfterMs,
    providerAttempts: lastFailure.providerAttempts,
    attempts: lastFailure.attempts,
  });
}
