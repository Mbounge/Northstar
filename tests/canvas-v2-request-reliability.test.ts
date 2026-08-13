import assert from "node:assert/strict";
import test from "node:test";

import {
  CanvasV2RequestError,
  canvasV2RetryReason,
  requestCanvasV2Json,
  type CanvasV2RetryState,
} from "../lib/canvas-v2/request-reliability";
import {
  CanvasV2ProviderError,
  fetchCanvasV2ProviderJson,
} from "../lib/canvas-v2/provider-reliability";

test("retry progress distinguishes policy correction from a network interruption", () => {
  assert.equal(canvasV2RetryReason("invalid-response"), "North Star is correcting its response");
  assert.equal(canvasV2RetryReason("transport"), "Connection interrupted");
  assert.equal(canvasV2RetryReason("rate-limited"), "Provider busy");
});

const immediateWait = async (_delayMs: number, signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
};

test("a transient logical request retries with one stable identity and body", async () => {
  const attempts: Array<{ requestId: string | null; attempt: string | null; body: string }> = [];
  const retries: CanvasV2RetryState[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    attempts.push({
      requestId: headers.get("x-canvas-v2-request-id"),
      attempt: headers.get("x-canvas-v2-attempt"),
      body: String(init?.body),
    });
    if (attempts.length < 3) return new Response(JSON.stringify({
      error: "Temporarily unavailable",
      code: "provider-unavailable",
      retryable: true,
    }), { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const result = await requestCanvasV2Json<{ ok: boolean }>({
    endpoint: "/canvas-v2",
    body: { revisionId: "revision-1" },
    signal: new AbortController().signal,
    requestId: "run-1:revision-1",
    policy: { maxAttempts: 3, timeoutMs: 100, baseDelayMs: 1, maxDelayMs: 2 },
    fetcher,
    wait: immediateWait,
    onRetry: (retry) => retries.push(retry),
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(attempts.map((entry) => entry.requestId), ["run-1:revision-1", "run-1:revision-1", "run-1:revision-1"]);
  assert.deepEqual(attempts.map((entry) => entry.attempt), ["1", "2", "3"]);
  assert.equal(new Set(attempts.map((entry) => entry.body)).size, 1);
  assert.deepEqual(retries.map((retry) => retry.attempt), [2, 3]);
});

test("a non-retryable request failure stops after its first response", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "Authentication required", code: "invalid-request", retryable: false }), { status: 401 });
  };
  await assert.rejects(
    requestCanvasV2Json({
      endpoint: "/canvas-v2",
      body: {},
      signal: new AbortController().signal,
      requestId: "request",
      policy: { maxAttempts: 3, timeoutMs: 100, baseDelayMs: 1, maxDelayMs: 2 },
      fetcher,
      wait: immediateWait,
    }),
    (error) => error instanceof CanvasV2RequestError && error.code === "invalid-request" && error.attempts === 1,
  );
  assert.equal(calls, 1);
});

test("a timed-out provider attempt is bounded and retryable", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
    });
  };
  await assert.rejects(
    requestCanvasV2Json({
      endpoint: "/canvas-v2",
      body: {},
      signal: new AbortController().signal,
      requestId: "timeout-request",
      policy: { maxAttempts: 2, timeoutMs: 5, baseDelayMs: 1, maxDelayMs: 1 },
      fetcher,
      wait: immediateWait,
    }),
    (error) => error instanceof CanvasV2RequestError && error.code === "timeout" && error.attempts === 2,
  );
  assert.equal(calls, 2);
});

test("Stop during retry backoff cancels the complete request chain", async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "Unavailable", code: "provider-unavailable", retryable: true }), { status: 503 });
  };
  await assert.rejects(
    requestCanvasV2Json({
      endpoint: "/canvas-v2",
      body: {},
      signal: controller.signal,
      requestId: "stopped-request",
      policy: { maxAttempts: 3, timeoutMs: 100, baseDelayMs: 10, maxDelayMs: 10 },
      fetcher,
      onRetry: () => controller.abort(),
    }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(calls, 1);
});

test("provider rate limits retain retry metadata", async () => {
  await assert.rejects(
    fetchCanvasV2ProviderJson({
      url: "https://provider.invalid",
      init: {},
      requestSignal: new AbortController().signal,
      timeoutMs: 100,
      fetcher: async () => new Response("busy", { status: 429, headers: { "Retry-After": "2" } }),
    }),
    (error) => {
      assert.ok(error instanceof CanvasV2ProviderError);
      assert.equal(error.code, "rate-limited");
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterMs, 2_000);
      return true;
    },
  );
});

test("the provider deadline reports a retryable timeout", async () => {
  await assert.rejects(
    fetchCanvasV2ProviderJson({
      url: "https://provider.invalid",
      init: {},
      requestSignal: new AbortController().signal,
      timeoutMs: 5,
      fetcher: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
      }),
    }),
    (error) => error instanceof CanvasV2ProviderError && error.code === "timeout" && error.retryable,
  );
});
