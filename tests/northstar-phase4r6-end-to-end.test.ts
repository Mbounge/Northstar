import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  attachNorthstarTurnModelEvidenceMetadata,
  type NorthstarAttemptFailureResponse,
  type NorthstarAttemptResultResponse,
  type NorthstarTurnModelAdapter,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import type { NorthstarTurnClient } from "@/lib/canvas-ai/northstar-turn-client";
import { executeNorthstarTurn, NorthstarTurnProviderError } from "@/lib/canvas-ai/northstar-turn-executor";
import { createNorthstarDataTurnToolExecutor } from "@/lib/canvas-ai/northstar-turn-data-tools";
import { createNorthstarWorkspaceRuntime } from "@/lib/canvas-architecture/northstar-workspace-runtime";
import { createNorthstarMemoryProjectionSurface } from "@/lib/canvas-projection/memory-surface";
import {
  NORTHSTAR_PROJECTION_STATE_SCHEMA,
  type NorthstarProjectionNode,
  type NorthstarProjectionState,
} from "@/lib/canvas-projection/types";
import type { NorthStarDataCatalog } from "@/lib/northstar-data/catalog";

function bootstrapState(): NorthstarProjectionState {
  return {
    schema: NORTHSTAR_PROJECTION_STATE_SCHEMA,
    root: {
      kind: "element",
      id: "root",
      tag: "div",
      namespace: "html",
      attributes: {},
      classes: [],
      styles: {},
      children: [{
        kind: "element",
        id: "northstar-artboard",
        tag: "main",
        namespace: "html",
        attributes: {},
        classes: ["northstar-bootstrap"],
        styles: {
          display: { value: "grid", priority: "" },
          gap: { value: "36px", priority: "" },
          padding: { value: "64px", priority: "" },
          width: { value: "1120px", priority: "" },
          "min-height": { value: "720px", priority: "" },
        },
        children: [
          {
            kind: "element",
            id: "northstar-header",
            tag: "header",
            namespace: "html",
            attributes: {},
            classes: [],
            styles: {},
            children: [
              {
                kind: "element",
                id: "northstar-title",
                tag: "h1",
                namespace: "html",
                attributes: {},
                classes: [],
                styles: {},
                children: [{ kind: "text", id: "northstar-title:child-0", text: "Building your visual story." }],
              },
              {
                kind: "element",
                id: "northstar-deck",
                tag: "p",
                namespace: "html",
                attributes: {},
                classes: [],
                styles: {},
                children: [{ kind: "text", id: "northstar-deck:child-0", text: "Research will appear progressively." }],
              },
            ],
          },
          {
            kind: "element",
            id: "northstar-workspace",
            tag: "section",
            namespace: "html",
            attributes: {},
            classes: [],
            styles: {},
            children: [
              {
                kind: "element",
                id: "northstar-status-value",
                tag: "strong",
                namespace: "html",
                attributes: {},
                classes: [],
                styles: {},
                children: [{ kind: "text", id: "northstar-status-value:child-0", text: "Preparing the first grounded activity" }],
              },
              {
                kind: "element",
                id: "northstar-evidence-value",
                tag: "p",
                namespace: "html",
                attributes: {},
                classes: [],
                styles: {},
                children: [{ kind: "text", id: "northstar-evidence-value:child-0", text: "Evidence will accumulate here." }],
              },
            ],
          },
        ],
      }],
    },
    cssLayers: {},
    space: { left: 0, top: 0, right: 0, bottom: 0 },
  };
}

const catalog: NorthStarDataCatalog = {
  tenantId: "tenant-northstar",
  apps: [
    {
      id: "app-awin",
      name: "Awin",
      tenantId: "tenant-northstar",
      iconUrl: "https://assets.example/awin/icon.png",
      totalScreens: 3,
      flows: [{
        id: "flow-awin-activation",
        appId: "app-awin",
        appName: "Awin",
        sessionId: "session-awin-mobile-onboarding",
        name: "Account Activation & First Login",
        platform: "mobile",
        sessionType: "onboarding",
        screens: [0, 1, 2].map((index) => ({
          id: `screen-awin-${"a".repeat(140)}-${index}`,
          name: `Awin activation ${index + 1}`,
          appId: "app-awin",
          flowId: "flow-awin-activation",
          appName: "Awin",
          flowName: "Account Activation & First Login",
          platform: "mobile",
          sessionType: "onboarding",
          index,
          imageUrl: `https://assets.example/awin/${index}.png`,
        })),
      }],
    },
    {
      id: "app-whop",
      name: "Whop",
      tenantId: "tenant-northstar",
      iconUrl: "https://assets.example/whop/icon.png",
      totalScreens: 3,
      flows: [{
        id: "flow-whop-signup",
        appId: "app-whop",
        appName: "Whop",
        sessionId: "session-whop-web-onboarding",
        name: "User Sign-up",
        platform: "web",
        sessionType: "onboarding",
        screens: [0, 1, 2].map((index) => ({
          id: `screen-whop-${"b".repeat(140)}-${index}`,
          name: `Whop sign-up ${index + 1}`,
          appId: "app-whop",
          flowId: "flow-whop-signup",
          appName: "Whop",
          flowName: "User Sign-up",
          platform: "web",
          sessionType: "onboarding",
          index,
          imageUrl: `https://assets.example/whop/${index}.png`,
        })),
      }],
    },
  ],
};

function collectNodes(node: NorthstarProjectionNode, output: NorthstarProjectionNode[] = []): NorthstarProjectionNode[] {
  output.push(node);
  if (node.kind === "element") node.children.forEach((child) => collectNodes(child, output));
  return output;
}

test("a malformed provider result still completes a grounded progressive Awin/Whop run with visible screenshots", async () => {
  const modelCalls: Array<{ operation: string; evidenceIds: string[] }> = [];
  const model: NorthstarTurnModelAdapter = {
    async generateJSON(request) {
      const evidenceIds = request.evidenceAssets?.map((asset) => asset.id) ?? [];
      modelCalls.push({ operation: request.operation, evidenceIds });
      return attachNorthstarTurnModelEvidenceMetadata(
        { outcome: "success", result: { malformed: true } },
        {
          attachedEvidenceAssetIds: evidenceIds,
          evidenceAttachmentReport: {
            requestedAssetIds: evidenceIds,
            loadedAssetIds: evidenceIds,
            unavailableAssets: [],
          },
        },
      );
    },
  };
  const toolExecutor = createNorthstarDataTurnToolExecutor({ getCatalog: async () => catalog });
  let requestNumber = 0;
  const client: NorthstarTurnClient = {
    async decideNextActivity() {
      throw new Error("Visual runs must use the deterministic mandatory activity sequence.");
    },
    async executeTaskAttempt(context, task, attempt, options) {
      const response = await executeNorthstarTurn({
        request: {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: options?.requestId ?? `request-${++requestNumber}`,
          type: "execute-task-attempt",
          ledgerContext: context,
          task,
          attempt,
        },
        model,
        toolExecutor,
        signal: options?.signal,
      });
      if (response.type !== "attempt-result" && response.type !== "attempt-failure") {
        throw new Error(`Unexpected response ${response.type}`);
      }
      return response as NorthstarAttemptResultResponse | NorthstarAttemptFailureResponse;
    },
    async correctActiveTask() {
      throw new Error("The resilient baseline must not enter correction for malformed model output.");
    },
    async finalizeRun() {
      throw new Error("Visual runs finalize deterministically after latest-HEAD verification.");
    },
  };

  const surface = createNorthstarMemoryProjectionSurface({ initialState: bootstrapState() });
  const runtime = createNorthstarWorkspaceRuntime({
    projectionSurface: surface,
    turnClient: client,
    maximumTasksPerRun: 12,
  });
  const result = await runtime.startRun(
    "Build a balanced executive comparison of Awin and Whop onboarding. Choose representative flows and screenshots, keep the main board simple, and leave your working surface visible so I can inspect how the solution came together.",
  );

  assert.equal(result.status, "completed");
  assert.ok(result.ledger);
  assert.deepEqual(result.ledger.tasks.map((task) => task.kind), [
    "research",
    "analysis",
    "artboard-mutation",
    "artboard-mutation",
    "verification",
  ]);
  assert.equal(result.ledger.attempts.every((attempt) => attempt.status === "completed"), true);
  const visualCommits = result.ledger.commits.filter((commit) => commit.taskKind === "artboard-mutation");
  assert.equal(visualCommits.length, 2);
  assert.equal(visualCommits.every((commit) => commit.projectionReceipt?.verified === true), true);

  const nodes = collectNodes(surface.getState().root);
  const images = nodes.filter((node) => node.kind === "element" && node.tag === "img");
  assert.equal(images.length >= 2, true);
  const imageSources = images.flatMap((node) => node.kind === "element" ? [node.attributes.src] : []);
  assert.equal(imageSources.some((source) => source?.includes("/awin/")), true);
  assert.equal(imageSources.some((source) => source?.includes("/whop/")), true);
  assert.equal(nodes.some((node) => node.id === "northstar-grounded-evidence"), true);
  assert.equal(nodes.some((node) => node.id === "northstar-insight-stage"), true);
  assert.equal(modelCalls.length, 5);
  assert.equal(modelCalls[0]?.evidenceIds.some((id) => id.startsWith("screen-awin")), true);
  assert.equal(modelCalls[0]?.evidenceIds.some((id) => id.startsWith("screen-whop")), true);
  assert.match(JSON.stringify(result.finalSummary), /browser-verified artboard/);
  runtime.dispose();
});


test("a completely unavailable model provider still preserves tenant evidence and completes the verified visual baseline", async () => {
  let modelCalls = 0;
  const model: NorthstarTurnModelAdapter = {
    async generateJSON() {
      modelCalls += 1;
      throw new NorthstarTurnProviderError({
        code: "PROVIDER_UNAVAILABLE",
        message: "Provider unavailable during the bounded task.",
        retryable: true,
      });
    },
  };
  const toolExecutor = createNorthstarDataTurnToolExecutor({ getCatalog: async () => catalog });
  let requestNumber = 0;
  const client: NorthstarTurnClient = {
    async decideNextActivity() {
      throw new Error("Visual runs must use the deterministic mandatory activity sequence.");
    },
    async executeTaskAttempt(context, task, attempt, options) {
      const response = await executeNorthstarTurn({
        request: {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: options?.requestId ?? `provider-request-${++requestNumber}`,
          type: "execute-task-attempt",
          ledgerContext: context,
          task,
          attempt,
        },
        model,
        toolExecutor,
        signal: options?.signal,
      });
      if (response.type !== "attempt-result" && response.type !== "attempt-failure") {
        throw new Error(`Unexpected response ${response.type}`);
      }
      return response as NorthstarAttemptResultResponse | NorthstarAttemptFailureResponse;
    },
    async correctActiveTask() {
      throw new Error("Provider failure recovery must not restart or enter task correction.");
    },
    async finalizeRun() {
      throw new Error("Visual runs finalize deterministically after latest-HEAD verification.");
    },
  };

  const surface = createNorthstarMemoryProjectionSurface({ initialState: bootstrapState() });
  const runtime = createNorthstarWorkspaceRuntime({
    projectionSurface: surface,
    turnClient: client,
    maximumTasksPerRun: 12,
  });
  const result = await runtime.startRun(
    "Build a balanced visual comparison of Awin and Whop onboarding with representative flows and screenshots, and show how the same working surface evolves progressively.",
  );

  assert.equal(result.status, "completed");
  assert.ok(result.ledger);
  assert.equal(result.ledger.attempts.every((attempt) => attempt.status === "completed"), true);
  assert.deepEqual(result.ledger.tasks.map((task) => task.kind), [
    "research",
    "analysis",
    "artboard-mutation",
    "artboard-mutation",
    "verification",
  ]);
  const visualCommits = result.ledger.commits.filter((commit) => commit.taskKind === "artboard-mutation");
  assert.equal(visualCommits.length, 2);
  assert.equal(visualCommits.every((commit) => commit.projectionReceipt?.verified === true), true);
  const nodes = collectNodes(surface.getState().root);
  const images = nodes.filter((node) => node.kind === "element" && node.tag === "img");
  assert.equal(images.length >= 2, true);
  assert.equal(images.some((node) => node.kind === "element" && node.attributes.src?.includes("/awin/")), true);
  assert.equal(images.some((node) => node.kind === "element" && node.attributes.src?.includes("/whop/")), true);
  assert.equal(modelCalls, 5);
  assert.match(JSON.stringify(result.finalSummary), /browser-verified artboard/);
  runtime.dispose();
});

test("a failed latest-HEAD verification schedules a repair commit instead of repeating verification until the task limit", async () => {
  const toolExecutor = createNorthstarDataTurnToolExecutor({ getCatalog: async () => catalog });
  let requestNumber = 0;
  let artboardAttempt = 0;
  const client: NorthstarTurnClient = {
    async decideNextActivity() {
      throw new Error("Visual runs must use the deterministic mandatory activity sequence.");
    },
    async executeTaskAttempt(context, task, attempt, options) {
      if (task.kind === "artboard-mutation") artboardAttempt += 1;
      const model: NorthstarTurnModelAdapter = {
        async generateJSON(request) {
          const evidenceIds = request.evidenceAssets?.map((asset) => asset.id) ?? [];
          if (task.kind === "artboard-mutation" && artboardAttempt === 2) {
            return {
              outcome: "success",
              result: {
                schema: "northstar.artboard-mutation-draft.v1",
                operations: [{ type: "remove-node", nodeId: "northstar-grounded-evidence" }],
              },
            };
          }
          return attachNorthstarTurnModelEvidenceMetadata(
            { outcome: "success", result: { malformed: true } },
            {
              attachedEvidenceAssetIds: evidenceIds,
              evidenceAttachmentReport: {
                requestedAssetIds: evidenceIds,
                loadedAssetIds: evidenceIds,
                unavailableAssets: [],
              },
            },
          );
        },
      };
      const response = await executeNorthstarTurn({
        request: {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: options?.requestId ?? `repair-request-${++requestNumber}`,
          type: "execute-task-attempt",
          ledgerContext: context,
          task,
          attempt,
        },
        model,
        toolExecutor,
        signal: options?.signal,
      });
      if (response.type !== "attempt-result" && response.type !== "attempt-failure") {
        throw new Error(`Unexpected response ${response.type}`);
      }
      return response as NorthstarAttemptResultResponse | NorthstarAttemptFailureResponse;
    },
    async correctActiveTask() {
      throw new Error("A deterministic verification revision must not enter correction.");
    },
    async finalizeRun() {
      throw new Error("Visual runs finalize deterministically after latest-HEAD verification.");
    },
  };

  const surface = createNorthstarMemoryProjectionSurface({ initialState: bootstrapState() });
  const runtime = createNorthstarWorkspaceRuntime({
    projectionSurface: surface,
    turnClient: client,
    maximumTasksPerRun: 12,
  });
  const result = await runtime.startRun(
    "Build a progressive visual comparison of Awin and Whop onboarding with representative flows and screenshots.",
  );

  assert.equal(result.status, "completed");
  assert.ok(result.ledger);
  assert.deepEqual(result.ledger.tasks.map((task) => task.kind), [
    "research",
    "analysis",
    "artboard-mutation",
    "artboard-mutation",
    "verification",
    "artboard-mutation",
    "verification",
  ]);
  const visualCommits = result.ledger.commits.filter((commit) => commit.taskKind === "artboard-mutation");
  assert.equal(visualCommits.length, 3);
  assert.equal(visualCommits.every((commit) => commit.projectionReceipt?.verified === true), true);
  const verificationResults = result.ledger.commits
    .filter((commit) => commit.taskKind === "verification")
    .map((commit) => commit.result as Record<string, unknown>);
  assert.equal(verificationResults[0]?.recommendation, "revise");
  assert.equal(verificationResults.at(-1)?.recommendation, "finalize");
  const nodes = collectNodes(surface.getState().root);
  assert.equal(nodes.some((node) => node.id === "northstar-grounded-evidence"), true);
  assert.equal(nodes.some((node) => node.kind === "element" && node.tag === "img"), true);
  runtime.dispose();
});
