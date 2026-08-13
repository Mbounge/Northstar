import type { CanvasV2FailureCode, CanvasV2FailurePayload } from "@/lib/canvas-v2/request-reliability";

export class CanvasV2ProviderError extends Error {
  readonly code: CanvasV2FailureCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(input: CanvasV2FailurePayload & { status: number }) {
    super(input.error);
    this.name = "CanvasV2ProviderError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
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
  });
  if (status === 408 || status === 425 || status >= 500) return new CanvasV2ProviderError({
    error: "North Star’s model provider is temporarily unavailable.",
    code: status === 408 ? "timeout" : "provider-unavailable",
    status: 502,
    retryable: true,
    retryAfterMs,
  });
  return new CanvasV2ProviderError({
    error: `North Star’s model provider rejected the request (${status}).`,
    code: "provider-rejected",
    status: 502,
    retryable: false,
  });
}

export function invalidCanvasV2ProviderResponse(message: string): CanvasV2ProviderError {
  return new CanvasV2ProviderError({
    error: message,
    code: "invalid-response",
    status: 502,
    retryable: true,
  });
}

export async function fetchCanvasV2ProviderJson<T>(input: {
  url: string;
  init: RequestInit;
  requestSignal: AbortSignal;
  timeoutMs: number;
  fetcher?: typeof fetch;
}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  input.requestSignal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
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
    clearTimeout(timeout);
    input.requestSignal.removeEventListener("abort", cancel);
  }
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
    },
    ...(error.retryAfterMs !== undefined ? { headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1_000)) } } : {}),
  };
}
