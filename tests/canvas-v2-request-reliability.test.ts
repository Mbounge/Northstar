import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS,
  CanvasV2RequestError,
  canvasV2ProviderUsageSignals,
  canvasV2ProviderUsageFromAttempts,
  canvasV2RetryReason,
  mergeCanvasV2ProviderUsage,
  requestCanvasV2Json,
  type CanvasV2RetryState,
} from "../lib/canvas-v2/request-reliability";
import {
  CanvasV2ProviderError,
  fetchCanvasV2ProviderJson,
  fetchCanvasV2ProviderJsonWithFallback,
  fetchCanvasV2ProviderJsonWithModelChain,
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

test("an invalid model response carries validator feedback into the corrective retry", async () => {
  const corrections: Array<string | null> = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    corrections.push(headers.get("x-canvas-v2-previous-failure"));
    if (corrections.length === 1) return new Response(JSON.stringify({
      error: "Every image needs a stable identity.",
      code: "invalid-response",
      retryable: true,
    }), { status: 502 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  await requestCanvasV2Json({
    endpoint: "/canvas-v2",
    body: { revisionId: "revision-1" },
    signal: new AbortController().signal,
    requestId: "run-1:revision-1",
    policy: { maxAttempts: 2, timeoutMs: 100, baseDelayMs: 1, maxDelayMs: 1 },
    fetcher,
    wait: immediateWait,
  });
  assert.equal(corrections[0], null);
  assert.equal(decodeURIComponent(corrections[1] ?? ""), "Every image needs a stable identity.");
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

test("an HTML proxy failure is reported by HTTP status instead of as malformed model output", async () => {
  let calls = 0;
  await assert.rejects(
    requestCanvasV2Json({
      endpoint: "/canvas-v2",
      body: {},
      signal: new AbortController().signal,
      requestId: "proxy-failure",
      policy: { maxAttempts: 3, timeoutMs: 100, baseDelayMs: 1, maxDelayMs: 2 },
      fetcher: async () => {
        calls += 1;
        return new Response("<!doctype html><title>Not found</title>", { status: 404 });
      },
      wait: immediateWait,
    }),
    (error) => error instanceof CanvasV2RequestError
      && error.code === "provider-rejected"
      && error.message === "North Star request failed (404)."
      && error.attempts === 1,
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

test("provider attempts retain exact billed usage and bounded request shape", async () => {
  const requestAudit = {
    textCharacters: 42_000,
    imageCount: 2,
    encodedImageBytes: 180_000,
    imageDetails: { low: 1, high: 1, auto: 0, original: 0 },
    promptCacheMode: "explicit" as const,
    cacheNamespace: "northstar-v2-test",
  };
  const result = await fetchCanvasV2ProviderJsonWithModelChain<{ ok: boolean; usage: Record<string, unknown> }>({
    models: ["gpt-5.6-luna"],
    requestSignal: new AbortController().signal,
    requestForModel: () => ({ url: "https://provider.test/gpt-5.6-luna", init: {}, audit: requestAudit }),
    fetcher: async () => new Response(JSON.stringify({
      ok: true,
      usage: {
        input_tokens: 52_000,
        input_tokens_details: { cached_tokens: 31_000, cache_write_tokens: 7_000 },
        output_tokens: 2_400,
        output_tokens_details: { reasoning_tokens: 900 },
        total_tokens: 54_400,
      },
    }), { status: 200 }),
  });
  assert.deepEqual(result.attempts[0].request, requestAudit);
  assert.deepEqual(result.attempts[0].usage, {
    requestCount: 1,
    inputTokens: 52_000,
    cachedInputTokens: 31_000,
    cacheWriteTokens: 7_000,
    outputTokens: 2_400,
    reasoningTokens: 900,
    totalTokens: 54_400,
  });
  assert.deepEqual(canvasV2ProviderUsageFromAttempts(result.attempts), result.attempts[0].usage);
});

test("provider usage is observable without becoming an execution guard", () => {
  const first = {
    requestCount: 7,
    inputTokens: 320_000,
    cachedInputTokens: 180_000,
    cacheWriteTokens: 70_000,
    outputTokens: 20_000,
    reasoningTokens: 8_000,
    totalTokens: 780_000,
  };
  const second = {
    requestCount: 5,
    inputTokens: 10_000,
    cachedInputTokens: 4_000,
    cacheWriteTokens: 2_000,
    outputTokens: 500,
    reasoningTokens: 100,
    totalTokens: 10_500,
  };
  assert.deepEqual(canvasV2ProviderUsageSignals(mergeCanvasV2ProviderUsage(first, second), first), {
    sinceCommit: { requestCount: 5, inputTokens: 10_000, cachedInputTokens: 4_000, cacheWriteTokens: 2_000 },
    uncachedInputTokens: 6_000,
    signals: [],
  });
  const dense = canvasV2ProviderUsageSignals(mergeCanvasV2ProviderUsage(first, {
    ...second,
    requestCount: CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS.requestsWithoutCommit,
    inputTokens: CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS.uncachedInputTokensWithoutCommit + second.cachedInputTokens,
    cacheWriteTokens: CANVAS_V2_PROVIDER_OBSERVABILITY_THRESHOLDS.cacheWriteTokensWithoutCommit,
  }), first);
  assert.deepEqual(dense.signals, ["request-density", "uncached-input-density", "cache-write-density"]);
  assert.equal("exhausted" in dense, false);
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

test("a real primary overload hands the same logical request to the fallback model", async () => {
  const models: string[] = [];
  const result = await fetchCanvasV2ProviderJsonWithFallback<{ ok: boolean }>({
    primaryModel: "primary-model",
    fallbackModel: "fallback-model",
    requestSignal: new AbortController().signal,
    timeoutMs: 100,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: { method: "POST", body: "same-request" } }),
    fetcher: async (input) => {
      const model = String(input).split("/").pop() ?? "";
      models.push(model);
      return model === "primary-model"
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.deepEqual(models, ["primary-model", "fallback-model"]);
  assert.deepEqual({ payload: result.payload, model: result.model, fallbackUsed: result.fallbackUsed }, { payload: { ok: true }, model: "fallback-model", fallbackUsed: true });
  assert.deepEqual(result.attempts.map((attempt) => [attempt.model, attempt.outcome]), [
    ["primary-model", "provider-unavailable"],
    ["fallback-model", "completed"],
  ]);
});

test("design providers have no North Star deadline unless a caller explicitly supplies one", async () => {
  let receivedSignal: AbortSignal | null | undefined;
  const result = await fetchCanvasV2ProviderJsonWithFallback<{ ok: boolean }>({
    primaryModel: "primary-model",
    fallbackModel: "fallback-model",
    requestSignal: new AbortController().signal,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: {} }),
    fetcher: async (_input, init) => {
      receivedSignal = init?.signal;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.equal(result.model, "primary-model");
  assert.equal(receivedSignal?.aborted, false);
});

test("invalid primary output is attributed and handed to fallback", async () => {
  const result = await fetchCanvasV2ProviderJsonWithFallback<{ ok: boolean }>({
    primaryModel: "primary-model",
    fallbackModel: "fallback-model",
    requestSignal: new AbortController().signal,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: {} }),
    validatePayload: (payload) => { if (!payload.ok) throw new Error("Invalid source patch."); },
    fetcher: async (input) => new Response(JSON.stringify({ ok: String(input).endsWith("fallback-model") }), { status: 200 }),
  });
  assert.equal(result.model, "fallback-model");
  assert.deepEqual(result.attempts.map((attempt) => attempt.outcome), ["invalid-response", "completed"]);
});

test("two invalid design outputs remain corrective instead of masquerading as provider downtime", async () => {
  await assert.rejects(fetchCanvasV2ProviderJsonWithFallback<{ ok: boolean }>({
    primaryModel: "primary-model",
    fallbackModel: "fallback-model",
    requestSignal: new AbortController().signal,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: {} }),
    validatePayload: () => { throw new Error("Completion is premature: resolve the visible relationship."); },
    fetcher: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  }), (error) => {
    assert.ok(error instanceof CanvasV2ProviderError);
    assert.equal(error.code, "invalid-response");
    assert.equal(error.retryable, false);
    assert.match(error.message, /did not accept the private model draft/);
    assert.doesNotMatch(error.message, /resolve the visible relationship/);
    return true;
  });
});

test("invalid structured output is repaired by the same model with exact validator context", async () => {
  const corrections: Array<string | undefined> = [];
  let calls = 0;
  const result = await fetchCanvasV2ProviderJsonWithModelChain<{ ok: boolean }>({
    models: ["primary-model", "fallback-model", "tertiary-model"],
    maxInvalidResponsesPerModel: 3,
    requestSignal: new AbortController().signal,
    requestForModel: (model, correction) => {
      corrections.push(correction);
      return { url: `https://provider.test/${model}`, init: {} };
    },
    validatePayload: (payload) => { if (!payload.ok) throw new Error("Every image needs a unique stable node identity."); },
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: calls === 2 }), { status: 200 });
    },
  });
  assert.equal(result.model, "primary-model");
  assert.equal(result.fallbackUsed, false);
  assert.equal(corrections[0], undefined);
  assert.match(corrections[1] ?? "", /Every image needs a unique stable node identity/);
  assert.match(corrections[1] ?? "", /REPAIR PASS 1 OF 2/);
  assert.doesNotMatch(corrections[1] ?? "", /\{\"ok\":false\}/);
  assert.deepEqual(result.attempts.map((attempt) => [attempt.model, attempt.attempt, attempt.outcome]), [
    ["primary-model", 1, "invalid-response"],
    ["primary-model", 2, "completed"],
  ]);
});

test("a corrective retry receives the exact validator failure without resending a bloated invalid draft", async () => {
  const corrections: Array<string | undefined> = [];
  const controller = new AbortController();
  const outcome = await fetchCanvasV2ProviderJsonWithModelChain<{ draft: string }>({
    models: ["primary-model"],
    requestSignal: controller.signal,
    maxInvalidResponsesPerModel: 2,
    requestForModel: (_model, correction) => {
      corrections.push(correction);
      return { url: "https://provider.test/repair", init: {} };
    },
    fetcher: async () => new Response(JSON.stringify({ draft: corrections.length === 1 ? "Whop has 47 screens" : "Whop has 17 screens" }), { status: 200 }),
    validatePayload: (payload) => {
      if (payload.draft.includes("47")) throw new Error("Whop has 17 screens, not 47.");
    },
  });

  assert.equal(outcome.payload.draft, "Whop has 17 screens");
  assert.equal(corrections[0], undefined);
  assert.match(corrections[1] ?? "", /Whop has 17 screens, not 47/);
  assert.doesNotMatch(corrections[1] ?? "", /Preceding invalid provider response/);
});

test("one model receives exactly three progressively labeled repairs after its original draft", async () => {
  const corrections: Array<string | undefined> = [];
  let calls = 0;
  const result = await fetchCanvasV2ProviderJsonWithModelChain<{ valid: boolean }>({
    models: ["primary-model"],
    requestSignal: new AbortController().signal,
    maxInvalidResponsesPerModel: 4,
    requestForModel: (_model, correction) => {
      corrections.push(correction);
      return { url: "https://provider.test/progressive-repair", init: {} };
    },
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ valid: calls === 4 }), { status: 200 });
    },
    validatePayload: (payload) => {
      if (!payload.valid) throw new Error(`Draft ${calls} still violates the current revision.`);
    },
  });

  assert.equal(result.payload.valid, true);
  assert.equal(calls, 4);
  assert.equal(corrections[0], undefined);
  assert.match(corrections[1] ?? "", /REPAIR PASS 1 OF 3/);
  assert.match(corrections[2] ?? "", /REPAIR PASS 2 OF 3/);
  assert.match(corrections[2] ?? "", /Draft 1[\s\S]*Draft 2/);
  assert.match(corrections[3] ?? "", /REPAIR PASS 3 OF 3/);
  assert.match(corrections[3] ?? "", /Draft 1[\s\S]*Draft 2[\s\S]*Draft 3/);
});

test("the model chain reaches a third fallback after corrective attempts are exhausted", async () => {
  const result = await fetchCanvasV2ProviderJsonWithModelChain<{ model: string }>({
    models: ["primary-model", "fallback-model", "gemini-3.7-flash"],
    maxInvalidResponsesPerModel: 2,
    requestSignal: new AbortController().signal,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: {} }),
    validatePayload: (payload) => { if (payload.model !== "gemini-3.7-flash") throw new Error("Complete is premature; author the visible relationship."); },
    fetcher: async (input) => new Response(JSON.stringify({ model: String(input).split("/").pop() }), { status: 200 }),
  });
  assert.equal(result.model, "gemini-3.7-flash");
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.attempts.map((attempt) => attempt.model), [
    "primary-model",
    "primary-model",
    "fallback-model",
    "fallback-model",
    "gemini-3.7-flash",
  ]);
});

test("a slow primary cannot consume the fallback model's shared deadline", async () => {
  const result = await fetchCanvasV2ProviderJsonWithFallback<{ ok: boolean }>({
    primaryModel: "slow-primary",
    fallbackModel: "ready-fallback",
    requestSignal: new AbortController().signal,
    timeoutMs: 40,
    primaryTimeoutMs: 5,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: {} }),
    fetcher: async (input, init) => String(input).endsWith("ready-fallback")
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true })),
  });
  assert.equal(result.model, "ready-fallback");
  assert.deepEqual(result.attempts.map((attempt) => attempt.outcome), ["timeout", "completed"]);
});

test("two unavailable models pause without repeating the whole endpoint three times", async () => {
  let calls = 0;
  await assert.rejects(fetchCanvasV2ProviderJsonWithFallback({
    primaryModel: "primary-model",
    fallbackModel: "fallback-model",
    requestSignal: new AbortController().signal,
    timeoutMs: 100,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: {} }),
    fetcher: async () => {
      calls += 1;
      return new Response("busy", { status: 503 });
    },
  }), (error) => {
    assert.ok(error instanceof CanvasV2ProviderError);
    assert.equal(error.code, "provider-unavailable");
    assert.equal(error.retryable, false);
    assert.deepEqual(error.providerAttempts?.map((attempt) => attempt.model), ["primary-model", "fallback-model"]);
    return true;
  });
  assert.equal(calls, 2);
});

test("a pinned OpenAI rate limit remains retryable by the bounded client envelope", async () => {
  await assert.rejects(fetchCanvasV2ProviderJsonWithModelChain({
    models: ["gpt-5.6-luna"],
    requestSignal: new AbortController().signal,
    requestForModel: () => ({ url: "https://provider.test/gpt-5.6-luna", init: {} }),
    fetcher: async () => new Response("busy", { status: 429, headers: { "Retry-After": "1" } }),
  }), (error) => {
    assert.ok(error instanceof CanvasV2ProviderError);
    assert.equal(error.code, "rate-limited");
    assert.equal(error.status, 429);
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfterMs, 1_000);
    assert.equal(error.providerAttempts?.length, 1);
    return true;
  });
});

test("a rejected primary request never escapes policy through fallback", async () => {
  let calls = 0;
  await assert.rejects(fetchCanvasV2ProviderJsonWithFallback({
    primaryModel: "primary-model",
    fallbackModel: "fallback-model",
    requestSignal: new AbortController().signal,
    timeoutMs: 100,
    requestForModel: (model) => ({ url: `https://provider.test/${model}`, init: {} }),
    fetcher: async () => {
      calls += 1;
      return new Response("rejected", { status: 400 });
    },
  }), (error) => error instanceof CanvasV2ProviderError && error.code === "provider-rejected");
  assert.equal(calls, 1);
});
