import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarDataTurnToolExecutor } from "@/lib/canvas-ai/northstar-turn-data-tools";
import { executeNorthStarDataTool, type NorthStarDataCatalog } from "@/lib/canvas-ai/northstar-data-tools";
import { parseNorthstarTurnRequest } from "@/lib/canvas-ai/northstar-turn-validation";
import {
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  NorthstarTurnToolError,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import { activeAttemptFixture } from "./northstar-turn-fixtures";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

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

test("required exact-flow identity is rejected before any tenant lookup", async () => {
  const fixture = activeAttemptFixture("research");
  const task = { ...fixture.task, initialExecutionInput: {
    researchGoal: "Inspect one exact captured flow",
    toolCalls: [{ name: "get_flow_details", args: { appName: "Atlas" } }],
  } };
  const attempt = { ...fixture.attempt, executionInput: task.initialExecutionInput };
  const context = structuredClone(fixture.context);
  if (!context.activeTask) throw new Error("expected active task");
  context.tasks = context.tasks.map((entry) => entry.id === task.id ? task : entry);
  context.attempts = context.attempts.map((entry) => entry.id === attempt.id ? attempt : entry);
  context.activeTask = { task, attempts: [attempt] };
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:missing-flow-name",
    type: "execute-task-attempt",
    ledgerContext: context,
    task,
    attempt,
  });
  if (request.type !== "execute-task-attempt") throw new Error("expected execution request");

  let executions = 0;
  const executor = createNorthstarDataTurnToolExecutor({
    async getCatalog() { return { tenantId: "tenant", apps: [] }; },
    async executeTool() {
      executions += 1;
      throw new Error("must not execute");
    },
  });
  await assert.rejects(
    executor.execute({ request, signal: new AbortController().signal }),
    (error: unknown) => {
      if (!(error instanceof NorthstarTurnToolError)) return false;
      assert.equal(error.failureKind, "correctable");
      assert.equal(error.code, "TOOL_ARGUMENTS_INVALID");
      assert.match(error.message, /flowId/);
      assert.match(error.message, /appId\/appName/);
      assert.match(error.message, /flowName/);
      return true;
    },
  );
  assert.equal(executions, 0);
});

test("an empty exact lookup preserves prior evidence and recommends a discovery strategy", async () => {
  const fixture = activeAttemptFixture("research");
  const executionInput: NorthstarLedgerValue = {
    researchGoal: "Find an exact flow after confirming available apps",
    toolCalls: [
      { name: "list_available_apps", args: { limit: 4 } },
      { name: "get_flow_details", args: { appName: "Atlas", flowName: "Unknown flow" } },
    ],
  };
  const task = { ...fixture.task, initialExecutionInput: executionInput };
  const attempt = { ...fixture.attempt, executionInput };
  const context = structuredClone(fixture.context);
  if (!context.activeTask) throw new Error("expected active task");
  context.tasks = context.tasks.map((entry) => entry.id === task.id ? task : entry);
  context.attempts = context.attempts.map((entry) => entry.id === attempt.id ? attempt : entry);
  context.activeTask = { task, attempts: [attempt] };
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:empty-exact-lookup",
    type: "execute-task-attempt",
    ledgerContext: context,
    task,
    attempt,
  });
  if (request.type !== "execute-task-attempt") throw new Error("expected execution request");

  const executor = createNorthstarDataTurnToolExecutor({
    async getCatalog() { return { tenantId: "tenant", apps: [] }; },
    async executeTool({ tool }) {
      if (tool === "list_available_apps") {
        return {
          detail: "Found two apps.",
          data: [{ id: "atlas", name: "Atlas" }, { id: "beacon", name: "Beacon" }],
          resultView: { kind: "apps", title: "Apps", items: [] },
          ok: true,
        };
      }
      return {
        detail: "No flow matched Unknown flow for Atlas.",
        data: null,
        resultView: { kind: "flow", title: "Captured flow", items: [], emptyMessage: "No match" },
        ok: false,
      };
    },
  });

  await assert.rejects(
    executor.execute({ request, signal: new AbortController().signal }),
    (error: unknown) => {
      if (!(error instanceof NorthstarTurnToolError)) return false;
      assert.equal(error.code, "TOOL_LOOKUP_EMPTY");
      assert.match(JSON.stringify(error.correctionContext), /list_app_flows/);
      assert.match(JSON.stringify(error.correctionContext), /search_app_flows/);
      const evidence = error.evidence as { toolCalls?: unknown[] } | undefined;
      assert.equal(evidence?.toolCalls?.length, 2);
      return true;
    },
  );
});

function promptGroundedCatalog(): NorthStarDataCatalog {
  const makeFlow = (appName: string, appId: string, index: number) => ({
    id: `${appId}-flow-${index}`,
    name: `Activation path ${index}`,
    description: `A distinct onboarding path ${index}`,
    appName,
    appId,
    sessionId: `${appId}-session-${index}`,
    platform: index % 2 === 0 ? "web" : "mobile",
    sessionType: "onboarding",
    screens: Array.from({ length: 5 }, (_, screenIndex) => ({
      id: `${appId}-flow-${index}-screen-${screenIndex}`,
      name: `Screen ${screenIndex + 1}`,
      imageUrl: `https://assets.example/${appId}/${index}/${screenIndex}.png`,
      appId,
      appName,
      flowId: `${appId}-flow-${index}`,
      flowName: `Activation path ${index}`,
      platform: index % 2 === 0 ? "web" : "mobile",
      sessionType: "onboarding",
      index: screenIndex,
    })),
  });
  return {
    tenantId: "tenant",
    apps: ["Atlas", "Beacon"].map((name) => {
      const id = name.toLowerCase();
      return {
        id,
        name,
        tenantId: "tenant",
        totalScreens: 15,
        flows: [1, 2, 3].map((index) => makeFlow(name, id, index)),
      };
    }),
  };
}

test("composition evidence breadth follows tool arguments instead of a fixed one-flow policy", async () => {
  const catalog = promptGroundedCatalog();
  const result = await executeNorthStarDataTool({
    tool: "prepare_composition_evidence",
    args: {
      query: "Compare several onboarding approaches across Atlas and Beacon",
      appNames: ["Atlas", "Beacon"],
      sessionType: "onboarding",
      maxApps: 2,
      maxFlowsPerApp: 2,
      maxScreensPerFlow: 4,
      selectionStrategy: "diverse",
      limit: 16,
    },
    async getCatalog() { return catalog; },
  });
  assert.equal(result.ok, true);
  const data = result.data as {
    selectedFlowIdentity: Array<{ appName: string; flowName: string }>;
    candidateScreens: unknown[];
    researchSpec: { maxFlowsPerApp: number; selectionStrategy: string };
  };
  assert.equal(data.selectedFlowIdentity.length, 4);
  assert.equal(data.selectedFlowIdentity.filter((flow) => flow.appName === "Atlas").length, 2);
  assert.equal(data.selectedFlowIdentity.filter((flow) => flow.appName === "Beacon").length, 2);
  assert.equal(data.candidateScreens.length, 16);
  assert.deepEqual(data.researchSpec, {
    query: "Compare several onboarding approaches across Atlas and Beacon",
    requestedApps: ["Atlas", "Beacon"],
    requestedSessionType: "onboarding",
    requestedPlatform: undefined,
    selectionStrategy: "diverse",
    maxApps: 2,
    maxFlowsPerApp: 2,
    maxScreensPerFlow: 4,
    totalScreenLimit: 16,
  });
});

test("explicit unknown apps never fall back to unrelated catalog apps", async () => {
  const result = await executeNorthStarDataTool({
    tool: "prepare_composition_evidence",
    args: {
      query: "Study the requested product onboarding",
      appNames: ["Missing Product"],
      maxApps: 1,
      maxFlowsPerApp: 2,
      limit: 12,
    },
    async getCatalog() { return promptGroundedCatalog(); },
  });
  assert.equal(result.ok, false);
  const data = result.data as {
    apps: unknown[];
    flows: unknown[];
    candidateScreens: unknown[];
    missingApps: string[];
  };
  assert.deepEqual(data.apps, []);
  assert.deepEqual(data.flows, []);
  assert.deepEqual(data.candidateScreens, []);
  assert.deepEqual(data.missingApps, ["Missing Product"]);
});

test("a global screenshot limit is distributed across selected flows instead of starving later subjects", async () => {
  const result = await executeNorthStarDataTool({
    tool: "prepare_composition_evidence",
    args: {
      query: "Compare two onboarding paths for Atlas and Beacon",
      appNames: ["Atlas", "Beacon"],
      sessionType: "onboarding",
      maxApps: 2,
      maxFlowsPerApp: 2,
      maxScreensPerFlow: 5,
      selectionStrategy: "coverage",
      limit: 8,
    },
    async getCatalog() { return promptGroundedCatalog(); },
  });
  assert.equal(result.ok, true);
  const data = result.data as {
    candidateScreens: Array<{ appName: string; flowName: string }>;
    candidateScreenshotIds: string[];
    selectionTruncated: boolean;
    unselectedScreenshotCount: number;
  };
  const representedFlows = new Set(
    data.candidateScreens.map((screen) => `${screen.appName}::${screen.flowName}`),
  );
  assert.equal(representedFlows.size, 4);
  assert.equal(data.candidateScreenshotIds.length, 8);
  assert.equal(data.selectionTruncated, true);
  assert.equal(data.unselectedScreenshotCount, 12);
});

test("exact flow retrieval uses flowId even when a stale human name is supplied", async () => {
  const catalog = promptGroundedCatalog();
  const result = await executeNorthStarDataTool({
    tool: "get_flow_screenshots",
    args: {
      appId: "stale-app-id",
      appName: "Stale app name",
      flowId: "atlas-flow-1",
      flowName: "Publisher Registration",
      limit: 3,
    },
    async getCatalog() { return catalog; },
  });
  assert.equal(result.ok, true);
  const data = result.data as {
    app: { id: string; name: string };
    flow: { id: string; name: string };
    screens: Array<{ id: string; appId: string; flowId: string }>;
  };
  assert.equal(data.app.id, "atlas");
  assert.equal(data.flow.id, "atlas-flow-1");
  assert.equal(data.flow.name, "Activation path 1");
  assert.equal(data.screens.length, 3);
  assert.ok(data.screens.every((screen) => screen.appId === "atlas" && screen.flowId === "atlas-flow-1"));
});

test("a later exact lookup is grounded to the sole committed flow identity", async () => {
  const fixture = activeAttemptFixture("research");
  const executionInput: NorthstarLedgerValue = {
    toolCalls: [{
      name: "get_flow_screenshots",
      args: { appName: "Atlas", flowName: "Publisher Registration", limit: 4 },
    }],
  };
  const task = { ...fixture.task, initialExecutionInput: executionInput };
  const attempt = {
    ...fixture.attempt,
    executionInput,
    evidence: {
      committedEvidence: [{
        kind: "flow",
        appId: "atlas",
        appName: "Atlas",
        flowId: "atlas-flow-1",
        flowName: "Activation path 1",
      }],
    },
  };
  const context = structuredClone(fixture.context);
  if (!context.activeTask) throw new Error("expected active task");
  context.tasks = context.tasks.map((entry) => entry.id === task.id ? task : entry);
  context.attempts = context.attempts.map((entry) => entry.id === attempt.id ? attempt : entry);
  context.activeTask = { task, attempts: [attempt] };
  const request = parseNorthstarTurnRequest({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: "turnreq:ground-known-flow",
    type: "execute-task-attempt",
    ledgerContext: context,
    task,
    attempt,
  });
  if (request.type !== "execute-task-attempt") throw new Error("expected execution request");

  const seen: unknown[] = [];
  const executor = createNorthstarDataTurnToolExecutor({
    async getCatalog() { return promptGroundedCatalog(); },
    async executeTool({ args }) {
      seen.push(args);
      return executeNorthStarDataTool({
        tool: "get_flow_screenshots",
        args,
        async getCatalog() { return promptGroundedCatalog(); },
      });
    },
  });
  const result = await executor.execute({ request, signal: new AbortController().signal });
  assert.deepEqual(seen, [{
    appId: "atlas",
    appName: "Atlas",
    flowId: "atlas-flow-1",
    flowName: "Activation path 1",
    limit: 4,
  }]);
  assert.ok(result);
});
