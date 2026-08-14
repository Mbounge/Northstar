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

export interface CanvasV2ProviderAttemptAudit {
  model: string;
  attempt?: number;
  outcome: "completed" | "provider-unavailable" | "rate-limited" | "timeout" | "invalid-response" | "rejected" | "cancelled" | "transport";
  durationMs: number;
  code?: CanvasV2FailureCode;
  httpStatus?: number;
  detail?: string;
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
