import test from "node:test";
import assert from "node:assert/strict";
import { streamCanvasV2Response, emitCanvasV2Activity } from "../lib/canvas-v2/activity-stream.server";
import { requestCanvasV2Json } from "../lib/canvas-v2/request-reliability";
import { mergeCanvasV2Activity, type CanvasV2Activity } from "../lib/canvas-v2/tool-activity";
import { CanvasV2ProviderContextRequest, fetchCanvasV2ProviderJsonWithModelChain } from "../lib/canvas-v2/provider-reliability";

const policy = { maxAttempts: 1, timeoutMs: 5000, baseDelayMs: 0, maxDelayMs: 0 };
function barrier() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
test("activity reaches the client before the terminal response and operation settlement is idempotent", async () => {
  const gate = barrier(), seen = barrier(); const events: CanvasV2Activity[] = [];
  const controller = new AbortController();
  const work = requestCanvasV2Json<{ answer: string }>({ endpoint: "http://local/design", body: {}, signal: controller.signal, requestId: "request", policy,
    onActivity(event) { events.push(event); seen.release(); },
    fetcher: async (_url, init) => streamCanvasV2Response(new Request("http://local/design", init), async () => {
      emitCanvasV2Activity({ id: "search", kind: "activity", status: "started", label: "Web research" });
      await gate.promise;
      emitCanvasV2Activity({ id: "search", kind: "activity", status: "completed", label: "Web research" });
      return Response.json({ answer: "Done" });
    }),
  });
  await seen.promise; assert.equal(events[0].status, "started"); gate.release();
  assert.deepEqual(await work, { answer: "Done" });
  assert.equal(events[1].status, "completed");
  let feed = mergeCanvasV2Activity([], events[0]); feed = mergeCanvasV2Activity(feed, events[1]); feed = mergeCanvasV2Activity(feed, events[0]);
  assert.equal(feed.length, 1); assert.equal(feed[0].status, "completed");
});
test("request scopes cannot leak activity between simultaneous users", async () => {
  const gate = barrier();
  const run = async (id: string) => {
    const seen: string[] = [];
    await requestCanvasV2Json({ endpoint: "http://local", body: {}, signal: new AbortController().signal, requestId: id, policy,
      onActivity: event => { seen.push(event.label); },
      fetcher: async (_, init) => streamCanvasV2Response(new Request("http://local", init), async () => {
        await gate.promise; emitCanvasV2Activity({ id, kind: "progress", label: id }); return Response.json({});
      }),
    }); return seen;
  };
  const a = run("a"), b = run("b"); gate.release();
  assert.deepEqual(await a, ["a"]); assert.deepEqual(await b, ["b"]);
});
test("stream failure preserves the actual HTTP failure rather than pretending success", async () => {
  await assert.rejects(requestCanvasV2Json({ endpoint: "http://local", body: {}, signal: new AbortController().signal, requestId: "a", policy,
    onActivity() {}, fetcher: async (_, init) => streamCanvasV2Response(new Request("http://local", init), async () => Response.json({ error: "Unavailable", retryable: false }, { status: 503 })),
  }), /Unavailable/);
});
test("a disconnected stream without terminal result cannot complete the turn", async () => {
  await assert.rejects(requestCanvasV2Json({ endpoint: "http://local", body: {}, signal: new AbortController().signal, requestId: "a", policy,
    onActivity() {}, fetcher: async () => new Response("", { headers: { "content-type": "application/x-ndjson" } }),
  }), /ended before the result/);
});

test("opening retained source details is a successful tool step, not a failed draft", async () => {
  const events: CanvasV2Activity[] = [];
  const corrections: Array<string | undefined> = [];
  let calls = 0;
  const result = await requestCanvasV2Json<{ attempts: Array<{ outcome: string }>; payload: { ready: boolean } }>({
    endpoint: "http://local", body: {}, signal: new AbortController().signal, requestId: "expand", policy,
    onActivity: event => { events.push(event); },
    fetcher: async (_, init) => streamCanvasV2Response(new Request("http://local", init), async () => Response.json(await fetchCanvasV2ProviderJsonWithModelChain<{ ready: boolean }>({
      models: ["gpt-5.6-luna"], maxInvalidResponsesPerModel: 1, attemptRole: "visual-director", requestSignal: new AbortController().signal,
      requestForModel(_model, correction) { corrections.push(correction); return { url: "http://provider", init: {} }; },
      fetcher: async () => Response.json({ ready: ++calls > 1 }),
      validatePayload(payload) { if (!payload.ready) throw new CanvasV2ProviderContextRequest("Source details are now available."); },
    }))),
  });
  assert.equal(calls, 2);
  assert.equal(result.payload.ready, true);
  assert.deepEqual(result.attempts.map(attempt => attempt.outcome), ["completed", "completed"]);
  assert.equal(corrections[1], "Source details are now available.");
  assert.equal(events.some(event => event.status === "failed"), false);
  assert.ok(events.some(event => event.label === "Inspected source details" && event.status === "completed"));
});

test("repeated source expansion cannot create an unbounded provider loop", async () => {
  let calls = 0;
  await assert.rejects(fetchCanvasV2ProviderJsonWithModelChain({ models: ["gpt-5.6-luna"], maxInvalidResponsesPerModel: 1, requestSignal: new AbortController().signal,
    requestForModel: () => ({ url: "http://provider", init: {} }),
    fetcher: async () => { calls++; return Response.json({}); },
    validatePayload() { throw new CanvasV2ProviderContextRequest("More details."); },
  }), /repeated context expansion/);
  assert.equal(calls, 2);
});


for (const succeeds of [true, false]) test(`private retries settle one logical activity (success=${succeeds})`, async () => {
  const events: CanvasV2Activity[] = []; let calls = 0;
  const run = requestCanvasV2Json({ endpoint: "http://local", body: {}, signal: new AbortController().signal, requestId: "retry", policy,
    onActivity: event => { events.push(event); },
    fetcher: async (_, init) => streamCanvasV2Response(new Request("http://local", init), async () => Response.json(await fetchCanvasV2ProviderJsonWithModelChain<{ ready: boolean }>({
      models: ["gpt-5.6-luna"], maxInvalidResponsesPerModel: 2, attemptRole: "source-author", requestSignal: new AbortController().signal,
      requestForModel: () => ({ url: "http://provider", init: {} }),
      fetcher: async () => Response.json({ ready: ++calls === 2 && succeeds }),
      validatePayload(payload) { if (!payload.ready) throw new Error("Bad private geometry"); },
    }))),
  });
  if (succeeds) {
    const result = await run as { attempts: Array<{ outcome: string }> };
    assert.deepEqual(result.attempts.map(attempt => attempt.outcome), ["invalid-response", "completed"]);
  } else await assert.rejects(run);
  assert.equal(calls, 2);
  assert.equal(new Set(events.map(event => event.id)).size, 1);
  assert.deepEqual(events.map(event => event.status), ["started", succeeds ? "completed" : "failed"]);
});

test("provider search events arrive before final evidence without exposing partial structured output", async () => {
  const { readCanvasV2ProviderEventStream } = await import("../lib/canvas-v2/provider-reliability");
  const { canvasV2WebSearchProgress } = await import("../lib/canvas-v2/external-evidence-provider");
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const messages: string[] = [];
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  let observed!: () => void;
  const progress = new Promise<void>(resolve => { observed = resolve; });
  let finished = false;
  const result = readCanvasV2ProviderEventStream<{ output: unknown[]; usage: { output_tokens: number } }>(new Response(stream), event => {
    const message = canvasV2WebSearchProgress(event);
    if (message) { messages.push(message); observed(); }
  }).then(value => { finished = true; return value; });
  const frame = 'data: ' + JSON.stringify({ type: "response.output_item.done", item: { type: "web_search_call", action: { type: "search", queries: ["asynchronous collaboration café"] } } }) + '\r\n\r\n';
  const bytes = encoder.encode(frame);
  for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
  await progress;
  assert.equal(finished, false);
  assert.match(messages[0], /café/);
  controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: "response.output_text.delta", delta: '{"privatePartial":' }) + '\n\n'));
  const terminal = { output: [], usage: { output_tokens: 42 } };
  controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: "response.completed", response: terminal }) + '\n\n'));
  controller.close();
  assert.deepEqual(await result, terminal);
  assert.equal(messages.length, 1);
});

test("a truncated provider stream cannot become successful evidence", async () => {
  const { readCanvasV2ProviderEventStream } = await import("../lib/canvas-v2/provider-reliability");
  await assert.rejects(readCanvasV2ProviderEventStream(new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n')), /before a complete response/);
});

test("incomplete provider envelopes cannot pass validation even when their partial JSON parses", async () => {
  let validations = 0;
  await assert.rejects(fetchCanvasV2ProviderJsonWithModelChain({
    models: ["gpt-5.6-luna"], attemptRole: "external-researcher", maxInvalidResponsesPerModel: 1,
    requestSignal: new AbortController().signal, requestForModel: () => ({ url: "http://provider", init: {} }),
    fetcher: async () => Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [], usage: { input_tokens: 100, output_tokens: 10000, total_tokens: 10100 } }),
    validatePayload() { validations++; },
  }), (error: unknown) => {
    const failure = error as { providerAttempts: Array<{ detail: string; usage: { outputTokens: number } }> };
    assert.match(failure.providerAttempts[0].detail, /incomplete \(max_output_tokens\)/);
    assert.equal(failure.providerAttempts[0].usage.outputTokens, 10000);
    return true;
  });
  assert.equal(validations, 0);
});

test("settling an operation preserves its place while subsequent search receipts append", () => {
  const event = (id: string, sequence: number, status: CanvasV2Activity["status"] = "completed"): CanvasV2Activity => ({ id, sequence, requestId: "r", at: "now", kind: "activity", status, label: id });
  let feed = mergeCanvasV2Activity([], event("research", 1, "started"));
  feed = mergeCanvasV2Activity(feed, event("search-one", 2));
  feed = mergeCanvasV2Activity(feed, event("search-two", 3));
  feed = mergeCanvasV2Activity(feed, event("research", 4));
  assert.deepEqual(feed.map(item => item.id), ["research", "search-one", "search-two"]);
  assert.equal(feed[0].status, "completed");
});

test("a failed evidence provider keeps its attempt audit alongside successful sources", async () => {
  const { runCanvasV2EvidenceBridge } = await import("../lib/canvas-v2/evidence-bridge");
  const { CanvasV2ProviderError } = await import("../lib/canvas-v2/provider-reliability");
  const descriptor = { id: "web", label: "Web", domains: ["external" as const], kinds: ["document" as const] };
  const attempts = [{ model: "gpt-5.6-luna", attempt: 1, outcome: "invalid-response" as const, durationMs: 100, detail: "incomplete" }];
  const result = await runCanvasV2EvidenceBridge({ providers: [{ descriptor, async retrieve() { throw new CanvasV2ProviderError({ error: "Incomplete research", code: "invalid-response", status: 502, retryable: false, providerAttempts: attempts }); } }], request: { instruction: "Explain", targetNames: [], domains: ["external"] } });
  assert.deepEqual(result.providerAttempts, attempts);
  assert.equal(result.packets.length, 0);
  assert.equal(result.issues[0].code, "provider-failure");
});


test('a thinking step streams its actual question and replaces it with the validated decision', async () => {
  const events: CanvasV2Activity[] = [];
  await requestCanvasV2Json({ endpoint: 'http://local', body: {}, signal: new AbortController().signal, requestId: 'question', policy,
    onActivity: event => { events.push(event); },
    fetcher: async (_, init) => streamCanvasV2Response(new Request('http://local', init), async () => Response.json(await fetchCanvasV2ProviderJsonWithModelChain<{ next: string }>({
      models: ['gpt-5.6-luna'], requestSignal: new AbortController().signal, attemptRole: 'discovery-director',
      activity: { label: 'Assessing the explanation', detail: 'Does asynchronous review remove scheduling friction?', completed: payload => ({ label: 'Chose the next step', detail: payload.next }) },
      requestForModel: () => ({ url: 'http://provider', init: {} }),
      fetcher: async () => Response.json({ next: 'Explain the workflow from the observed recording and transcript.' }),
      validatePayload: payload => { assert.ok(payload.next); },
    }))),
  });
  assert.equal(events[0].detail, 'Does asynchronous review remove scheduling friction?');
  assert.equal(events.at(-1)?.detail, 'Explain the workflow from the observed recording and transcript.');
  assert.equal(events[0].id, events.at(-1)?.id);
  assert.equal(mergeCanvasV2Activity([events[0]], events.at(-1)!).length, 1);
});
