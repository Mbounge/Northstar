import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarDataTurnToolExecutor } from "@/lib/canvas-ai/northstar-turn-data-tools";
import { parseNorthstarTurnRequest } from "@/lib/canvas-ai/northstar-turn-validation";
import {
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  NorthstarTurnToolError,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import { activeAttemptFixture } from "./northstar-turn-fixtures";

test("task-scoped data tool execution uses only calls recorded in the exact attempt input", async () => {
  const fixture = activeAttemptFixture("research");
  const task = { ...fixture.task, initialExecutionInput: {
    toolCalls: [{ name: "search_screenshots", args: { query: "onboarding", limit: 4 } }],
  } };
  const attempt = { ...fixture.attempt, executionInput: task.initialExecutionInput };
  const context = structuredClone(fixture.context);
  if (!context.activeTask) throw new Error("expected active task");
  context.tasks = context.tasks.map((entry) => entry.id === task.id ? task : entry);
  context.attempts = context.attempts.map((entry) => entry.id === attempt.id ? attempt : entry);
  context.activeTask = { task, attempts: [attempt] };
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:data-tools",
    type: "execute-task-attempt",
    ledgerContext: context,
    task,
    attempt,
  });
  if (request.type !== "execute-task-attempt") throw new Error("expected execution request");

  const calls: string[] = [];
  const executor = createNorthstarDataTurnToolExecutor({
    async getCatalog() { return { tenantId: "tenant", apps: [] }; },
    async executeTool({ tool, args }) {
      calls.push(tool);
      assert.deepEqual(args, { query: "onboarding", limit: 4 });
      return {
        detail: "found",
        data: [{ id: "screen-1" }],
        resultView: { kind: "screenshots", title: "Screens", items: [] },
        ok: true,
      };
    },
  });
  const result = await executor.execute({ request, signal: new AbortController().signal });
  assert.deepEqual(calls, ["search_screenshots"]);
  assert.deepEqual(result, {
    toolCalls: [{
      name: "search_screenshots",
      args: { query: "onboarding", limit: 4 },
      result: {
        detail: "found",
        data: [{ id: "screen-1" }],
        resultView: { kind: "screenshots", title: "Screens", items: [] },
        ok: true,
      },
    }],
  });
});

test("canvas write tools and unknown tools are rejected before execution", async () => {
  const fixture = activeAttemptFixture("research");
  const task = { ...fixture.task, initialExecutionInput: {
    toolCalls: [{ name: "create_text", args: { text: "bad" } }],
  } };
  const attempt = { ...fixture.attempt, executionInput: task.initialExecutionInput };
  const context = structuredClone(fixture.context);
  if (!context.activeTask) throw new Error("expected active task");
  context.tasks = context.tasks.map((entry) => entry.id === task.id ? task : entry);
  context.attempts = context.attempts.map((entry) => entry.id === attempt.id ? attempt : entry);
  context.activeTask = { task, attempts: [attempt] };
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:data-tools-reject",
    type: "execute-task-attempt",
    ledgerContext: context,
    task,
    attempt,
  });
  if (request.type !== "execute-task-attempt") throw new Error("expected execution request");
  const executor = createNorthstarDataTurnToolExecutor({
    async getCatalog() { return { tenantId: "tenant", apps: [] }; },
  });
  await assert.rejects(
    executor.execute({ request, signal: new AbortController().signal }),
    (error: unknown) => {
      assert.ok(error instanceof NorthstarTurnToolError);
      assert.equal(error.failureKind, "correctable");
      assert.equal(error.code, "TOOL_NOT_ALLOWED");
      return true;
    },
  );
});


test("tool result normalization omits absent optional fields without coercing invalid numbers", async () => {
  const fixture = activeAttemptFixture("research");
  const task = { ...fixture.task, initialExecutionInput: {
    toolCalls: [{ name: "search_screenshots", args: { query: "onboarding" } }],
  } };
  const attempt = { ...fixture.attempt, executionInput: task.initialExecutionInput };
  const context = structuredClone(fixture.context);
  if (!context.activeTask) throw new Error("expected active task");
  context.tasks = context.tasks.map((entry) => entry.id === task.id ? task : entry);
  context.attempts = context.attempts.map((entry) => entry.id === attempt.id ? attempt : entry);
  context.activeTask = { task, attempts: [attempt] };
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:data-tools-values",
    type: "execute-task-attempt",
    ledgerContext: context,
    task,
    attempt,
  });
  if (request.type !== "execute-task-attempt") throw new Error("expected execution request");

  const optionalExecutor = createNorthstarDataTurnToolExecutor({
    async getCatalog() { return { tenantId: "tenant", apps: [] }; },
    async executeTool() {
      return {
        detail: "found",
        data: { imageUrl: undefined, score: 1 },
        resultView: { kind: "screenshots", title: "Screens", items: [] },
        ok: true,
      };
    },
  });
  const normalized = await optionalExecutor.execute({ request, signal: new AbortController().signal });
  assert.deepEqual(normalized, {
    toolCalls: [{
      name: "search_screenshots",
      args: { query: "onboarding" },
      result: {
        detail: "found",
        data: { score: 1 },
        resultView: { kind: "screenshots", title: "Screens", items: [] },
        ok: true,
      },
    }],
  });

  const invalidExecutor = createNorthstarDataTurnToolExecutor({
    async getCatalog() { return { tenantId: "tenant", apps: [] }; },
    async executeTool() {
      return {
        detail: "bad",
        data: { score: Number.NaN },
        resultView: { kind: "screenshots", title: "Screens", items: [] },
        ok: true,
      };
    },
  });
  await assert.rejects(
    invalidExecutor.execute({ request, signal: new AbortController().signal }),
    (error: unknown) => {
      assert.ok(error instanceof NorthstarTurnToolError);
      assert.equal(error.failureKind, "terminal");
      assert.equal(error.code, "TOOL_RESULT_INVALID");
      assert.match(error.message, /finite number/);
      return true;
    },
  );
});
