import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarTurnClient, NorthstarTurnTransportError } from "@/lib/canvas-ai/northstar-turn-client";
import { NORTHSTAR_TURN_PROTOCOL_VERSION } from "@/lib/canvas-ai/northstar-turn-protocol";
import { activeAttemptFixture, decisionFixture } from "./northstar-turn-fixtures";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("one client method call sends one request and preserves authoritative task identity", async () => {
  const fixture = activeAttemptFixture("research");
  const bodies: Array<Record<string, unknown>> = [];
  const client = createNorthstarTurnClient({
    createRequestId: () => "turnreq:client-once",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      const task = body.task as { id: string };
      const attempt = body.attempt as { id: string };
      return jsonResponse({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: body.requestId,
        type: "attempt-result",
        taskId: task.id,
        attemptId: attempt.id,
        resultKind: "research-result",
        result: { evidenceIds: ["e-1"] },
      });
    },
  });

  const response = await client.executeTaskAttempt(fixture.context, fixture.task, fixture.attempt);
  assert.equal(response.type, "attempt-result");
  assert.equal(bodies.length, 1);
  assert.equal((bodies[0]?.task as { id: string }).id, fixture.task.id);
  assert.equal((bodies[0]?.attempt as { id: string }).id, fixture.attempt.id);
});

test("manual ambiguous transport retry can reuse the same correlation ID without creating task identity", async () => {
  const fixture = activeAttemptFixture("research");
  const requestIds: string[] = [];
  const client = createNorthstarTurnClient({
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestIds.push(String(body.requestId));
      const task = body.task as { id: string };
      const attempt = body.attempt as { id: string };
      return jsonResponse({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: body.requestId,
        type: "attempt-result",
        taskId: task.id,
        attemptId: attempt.id,
        resultKind: "research-result",
        result: { ok: true },
      });
    },
  });

  const options = { requestId: "turnreq:ambiguous-retry" };
  await client.executeTaskAttempt(fixture.context, fixture.task, fixture.attempt, options);
  await client.executeTaskAttempt(fixture.context, fixture.task, fixture.attempt, options);
  assert.deepEqual(requestIds, [options.requestId, options.requestId]);
});

test("stale or contradictory response identity is rejected", async () => {
  const fixture = activeAttemptFixture("research");
  const client = createNorthstarTurnClient({
    createRequestId: () => "turnreq:client-stale",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: body.requestId,
        type: "attempt-result",
        taskId: "task-wrong",
        attemptId: fixture.attempt.id,
        resultKind: "research-result",
        result: {},
      });
    },
  });

  await assert.rejects(
    client.executeTaskAttempt(fixture.context, fixture.task, fixture.attempt),
    (error: unknown) => error instanceof NorthstarTurnTransportError && error.code === "STALE_RESPONSE",
  );
});

test("malformed non-JSON and typed turn errors become transport errors", async () => {
  const fixture = decisionFixture();
  const nonJsonClient = createNorthstarTurnClient({
    createRequestId: () => "turnreq:client-non-json",
    fetchImpl: async () => new Response("bad gateway", { status: 502 }),
  });
  await assert.rejects(
    nonJsonClient.decideNextActivity(fixture.context),
    (error: unknown) => {
      assert.ok(error instanceof NorthstarTurnTransportError);
      assert.equal(error.code, "TURN_RESPONSE_NOT_JSON");
      assert.equal(error.requestId, "turnreq:client-non-json");
      assert.equal(error.outcomeUnknown, true);
      return true;
    },
  );

  const errorClient = createNorthstarTurnClient({
    createRequestId: () => "turnreq:client-turn-error",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: body.requestId,
        type: "turn-error",
        code: "MODEL_UNAVAILABLE",
        message: "Model unavailable",
        retryable: true,
      }, 503);
    },
  });
  await assert.rejects(
    errorClient.decideNextActivity(fixture.context),
    (error: unknown) => {
      assert.ok(error instanceof NorthstarTurnTransportError);
      assert.equal(error.code, "MODEL_UNAVAILABLE");
      assert.equal(error.retryable, true);
      assert.equal(error.requestId, "turnreq:client-turn-error");
      assert.equal(error.outcomeUnknown, false);
      return true;
    },
  );
});

test("an aborted request stays aborted", async () => {
  const fixture = decisionFixture();
  const controller = new AbortController();
  const client = createNorthstarTurnClient({
    createRequestId: () => "turnreq:client-abort",
    fetchImpl: async (_url, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
      return jsonResponse({});
    },
  });
  const pending = client.decideNextActivity(fixture.context, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});


test("network delivery uncertainty preserves the exact request ID for explicit recovery", async () => {
  const fixture = activeAttemptFixture("research");
  const client = createNorthstarTurnClient({
    fetchImpl: async () => {
      throw new TypeError("connection reset after upload");
    },
  });
  await assert.rejects(
    client.executeTaskAttempt(
      fixture.context,
      fixture.task,
      fixture.attempt,
      { requestId: "turnreq:client-explicit-recovery" },
    ),
    (error: unknown) => {
      assert.ok(error instanceof NorthstarTurnTransportError);
      assert.equal(error.requestId, "turnreq:client-explicit-recovery");
      assert.equal(error.outcomeUnknown, true);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});
