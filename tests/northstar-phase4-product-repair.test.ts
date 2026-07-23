import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  northstarRecoveryKind,
  northstarUserFacingRunMessage,
  resolveNorthstarProductRunBinding,
  routeNorthstarProductMessage,
} from "@/lib/canvas-ai/northstar-product-routing";
import type { NorthstarWorkspaceRuntimeSnapshot } from "@/lib/canvas-architecture/northstar-workspace-runtime";
import type { NorthstarLedgerSnapshot } from "@/lib/canvas-ledger/types";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function runtimeSnapshot(input: {
  status: NorthstarWorkspaceRuntimeSnapshot["status"];
  failureKind?: "transient" | "correctable" | "terminal";
  failureDetail?: string;
}): NorthstarWorkspaceRuntimeSnapshot {
  const ledger = input.failureKind
    ? ({
        run: { id: "run-1", objective: "Build", status: "active" },
        attempts: [{
          id: "attempt-1",
          taskId: "task-1",
          runId: "run-1",
          attemptNumber: 1,
          executionInput: {},
          status: "failed",
          startedAt: 1,
          failure: {
            kind: input.failureKind,
            code: "MODEL_OUTPUT_INVALID",
            detail: input.failureDetail ?? "$.outcome is not allowed.",
            phase: "execution",
          },
        }],
        tasks: [],
        commits: [],
        events: [],
      } as unknown as NorthstarLedgerSnapshot)
    : null;
  return { status: input.status, ledger, lastStep: null };
}

test("casual messages remain on the established conversational experience", () => {
  for (const message of ["Hi", "hello!", "Thanks", "How are you?"]) {
    assert.equal(routeNorthstarProductMessage({ message, hasAttachments: false, contextMode: "canvas" }), "legacy-conversation");
  }
});

test("only a clear text-only whole-canvas objective enters ledger authoring", () => {
  assert.equal(routeNorthstarProductMessage({
    message: "Build a balanced executive comparison of Awin and Whop onboarding.",
    hasAttachments: false,
    contextMode: "canvas",
  }), "ledger-authoring");
  assert.equal(routeNorthstarProductMessage({
    message: "What do you think of this?",
    hasAttachments: false,
    contextMode: "canvas",
  }), "legacy-conversation");
  assert.equal(routeNorthstarProductMessage({
    message: "Build a comparison from this image",
    hasAttachments: true,
    contextMode: "canvas",
  }), "legacy-conversation");
  assert.equal(routeNorthstarProductMessage({
    message: "Redesign the selected card",
    hasAttachments: false,
    contextMode: "selection",
  }), "legacy-conversation");
});

test("an older ledger can never attach its Whop activity to a newer Hi message", () => {
  const oldRun = {
    status: "blocked",
    ledger: {
      run: { id: "run-awin-whop", objective: "Build an Awin and Whop comparison" },
    },
    lastStep: null,
  } as unknown as NorthstarWorkspaceRuntimeSnapshot;

  assert.equal(resolveNorthstarProductRunBinding({
    assistantMessageId: "assistant-hi",
    objective: "Hi",
    runId: null,
  }, oldRun), null);

  assert.deepEqual(resolveNorthstarProductRunBinding({
    assistantMessageId: "assistant-build",
    objective: "Build an Awin and Whop comparison",
    runId: null,
  }, oldRun), {
    assistantMessageId: "assistant-build",
    objective: "Build an Awin and Whop comparison",
    runId: "run-awin-whop",
  });

  assert.equal(resolveNorthstarProductRunBinding({
    assistantMessageId: "assistant-other",
    objective: "Build something else",
    runId: "run-other",
  }, oldRun), null);
});

test("recovery actions match the authoritative failure classification", () => {
  assert.equal(northstarRecoveryKind(runtimeSnapshot({ status: "awaiting-recovery" })), "transport");
  assert.equal(northstarRecoveryKind(runtimeSnapshot({ status: "blocked", failureKind: "correctable" })), "task");
  assert.equal(northstarRecoveryKind(runtimeSnapshot({ status: "blocked", failureKind: "transient" })), "task");
  assert.equal(northstarRecoveryKind(runtimeSnapshot({ status: "blocked", failureKind: "terminal" })), "none");
});

test("raw protocol paths stay hidden while the actionable validation class remains visible", () => {
  const snapshot = runtimeSnapshot({
    status: "blocked",
    failureKind: "terminal",
    failureDetail: "$.outcome is not allowed.",
  });
  const message = northstarUserFacingRunMessage(snapshot);
  assert.equal(message.includes("$.outcome"), false);
  assert.match(message, /MODEL_OUTPUT_INVALID/);
  assert.match(message, /structured model result/i);
});

test("the workspace preserves legacy chat, binds ledger activity to one message, and creates a surface lazily", () => {
  const workspace = read("components/canvas/north-star-canvas-workspace.tsx");
  assert.match(workspace, /routeNorthstarProductMessage/);
  assert.match(workspace, /productRoute === "ledger-authoring"/);
  assert.match(workspace, /fetch\("\/api\/canvas-ai"/);
  assert.match(workspace, /northstarRunBindingRef/);
  assert.match(workspace, /resolveNorthstarProductRunBinding/);
  assert.match(workspace, /binding\.assistantMessageId/);
  assert.match(workspace, /latestAttempt\?\.failure[\s\S]{0,120}northstarUserFacingRunMessage\(snapshot\)/);
  assert.match(workspace, /ensureNorthstarProjectionTarget\(modelMessage\)/);
  assert.match(workspace, /NORTHSTAR_PROJECTION_HOST_VARIANT/);
  assert.match(workspace, /visibility: isNorthstarProjectionHostObject\(object\) \? "hidden"/);
  assert.match(workspace, /provisional: true/);
  assert.match(workspace, /northstarBootstrapArtifactRef = useRef<string \| null>\(null\)/);
  assert.match(workspace, /discardUnverifiedNorthstarBootstrap/);
  assert.match(workspace, /objects: objects\.filter\(\(object\) => !isNorthstarProjectionHostObject\(object\)\)/);
  assert.match(workspace, /wasProjectionHost[\s\S]{0,180}northstarBootstrapArtifactRef\.current = null/);
  assert.match(workspace, /canPrepareNorthstarProductSurface/);
  assert.match(workspace, /prepareNorthstarProductSurface/);
  assert.match(workspace, /object\.id === targetObject\.id/);
  assert.match(workspace, /mergeNorthstarEvidenceIntoDataBundle/);
  assert.match(workspace, /objectsRef\.current = nextObjects/);
  assert.match(workspace, /setObjectsState\(nextObjects\)/);
  assert.match(workspace, /NEXT_PUBLIC_NORTHSTAR_DEBUG_INSPECTOR/);
  assert.equal(/useEffect\(\(\) => \{[\s\S]{0,500}createNorthstarDirectBootstrapArtifactPayload/.test(workspace), false);
});

test("only the bound authoring artifact switches writers while the rest of the legacy canvas experience remains intact", () => {
  const host = read("components/canvas/artifacts/code-artifact-host.tsx");
  assert.match(host, /props\.artifact\.artifactId === architecture\.directArtifactId/);
  assert.match(host, /directWriterOwnsArtifact[\s\S]{0,180}DirectCodeArtifactHost[\s\S]{0,80}LegacyCodeArtifactHost/);
  assert.match(host, /data-ns-writer="display-only"/);
  assert.match(host, /northstar\.artifact\.set-writer/);
  assert.match(host, /writer: "direct-projection"/);
  assert.match(host, /mountedSurface\.runtimeUrl/);
  assert.match(host, /promotingDisplayOnlySurface/);
  assert.match(host, /promotingRepositorySurface/);
  const context = read("components/canvas/northstar-architecture-context.tsx");
  assert.match(context, /directArtifactId: string \| null/);
});

test("the synchronized canvas artifact survives a full refresh instead of being intentionally erased", () => {
  const workspace = read("components/canvas/north-star-canvas-workspace.tsx");
  assert.match(workspace, /northstar-canvas:v79:\$\{userEmail\}:primary/);
  assert.match(workspace, /localStorage\.getItem\(storageKey\)/);
  assert.match(workspace, /localStorage\.setItem\(storageKey/);
  assert.doesNotMatch(workspace, /startsWith\("northstar-canvas:"\).*removeItem/);
  assert.doesNotMatch(workspace, /Prototype sessions intentionally begin clean/);
});
