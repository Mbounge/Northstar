import assert from "node:assert/strict";
import test from "node:test";
import { mergeNorthstarEvidenceIntoDataBundle } from "@/lib/canvas-ai/northstar-evidence-data-bundle";
import type { CanvasCodeArtifactDataBundle } from "@/lib/canvas-artifacts/types";
import type { NorthstarLedgerSnapshot } from "@/lib/canvas-ledger/types";

const emptyBundle: CanvasCodeArtifactDataBundle = {
  version: "northstar.artifact-data.v0.2",
  objective: "Old objective",
  audience: "Executives",
  artifactType: "comparison",
  coverageSummary: "Empty",
  apps: [],
  flows: [],
  screenshots: [],
  hypotheses: [],
  decisions: [],
  corrections: [],
  openQuestions: [],
  allowedAssetUrls: [],
};

function ledgerWithEvidence(): NorthstarLedgerSnapshot {
  return {
    run: { id: "run-1", objective: "Build Awin and Whop", status: "active", createdAt: 1 },
    tasks: [{ id: "task-1", runId: "run-1", sequence: 1, kind: "research", intent: "Research", expectedOutcome: "Evidence", executionInput: {}, status: "completed", createdAt: 2, currentAttemptId: null, completedAt: 4, commitHash: "commit-1" }],
    attempts: [{
      id: "attempt-1",
      runId: "run-1",
      taskId: "task-1",
      attemptNumber: 1,
      executionInput: {},
      status: "completed",
      startedAt: 3,
      completedAt: 4,
      result: {},
      evidence: {
        toolCalls: [{
          name: "get_flow_screenshots",
          result: {
            detail: "Retrieved onboarding screenshots.",
            data: {
              app: {
                id: "app-awin",
                name: "Awin",
                iconUrl: "https://assets.example/awin.png",
                description: "Affiliate platform",
                flows: [{ id: "flow-awin", name: "Onboarding", screenCount: 2 }],
              },
              flow: {
                id: "flow-awin",
                appName: "Awin",
                name: "Onboarding",
                description: "Account onboarding",
                screenCount: 2,
                screens: [{
                  id: "screen-awin-1",
                  appName: "Awin",
                  flowName: "Onboarding",
                  name: "Sign in",
                  imageUrl: "https://assets.example/awin-sign-in.png",
                  index: 0,
                }],
              },
              screens: [{
                id: "screen-awin-2",
                appName: "Awin",
                flowName: "Onboarding",
                name: "Verification",
                imageUrl: "https://assets.example/awin-verification.png",
                index: 1,
              }],
            },
            resultView: {
              kind: "screenshots",
              title: "Awin onboarding screenshots",
              items: [{
                id: "screen-awin-2",
                kind: "screenshot",
                title: "Verification",
                appName: "Awin",
                flowName: "Onboarding",
                imageUrl: "https://assets.example/awin-verification.png",
              }],
            },
            ok: true,
          },
        }],
      },
    }],
    commits: [],
    events: [],
    headCommit: { hash: "root", stateHash: "state", sequence: 0, parentHash: null, taskId: null, attemptId: null, stateSnapshot: {}, createdAt: 1 },
    activeTask: null,
  } as unknown as NorthstarLedgerSnapshot;
}

test("ledger evidence is persisted into the normal artifact data bundle", () => {
  const merged = mergeNorthstarEvidenceIntoDataBundle(emptyBundle, ledgerWithEvidence());

  assert.equal(merged.objective, "Build Awin and Whop");
  assert.match(merged.coverageSummary, /1 grounded activity/);
  assert.equal(merged.apps.length, 1);
  assert.equal(merged.apps[0].name, "Awin");
  assert.deepEqual(merged.apps[0].flowIds, ["flow-awin"]);
  assert.equal(merged.flows.length, 1);
  assert.deepEqual(merged.flows[0].screenshotIds.sort(), ["screen-awin-1", "screen-awin-2"]);
  assert.equal(merged.screenshots.length, 2);
  assert.deepEqual(merged.allowedAssetUrls.sort(), [
    "https://assets.example/awin-sign-in.png",
    "https://assets.example/awin-verification.png",
    "https://assets.example/awin.png",
  ]);
});

test("evidence merging is idempotent and preserves richer existing analysis", () => {
  const current: CanvasCodeArtifactDataBundle = {
    ...emptyBundle,
    screenshots: [{
      id: "screen-awin-2",
      appName: "Awin",
      flowName: "Onboarding",
      title: "Verification",
      imageUrl: "https://assets.example/awin-verification.png",
      visibleCopy: ["Verify your account"],
      notablePatterns: ["Identity check"],
      frictionSignals: [],
      trustSignals: [],
      opportunities: [],
      relevance: 0.9,
    }],
  };
  const first = mergeNorthstarEvidenceIntoDataBundle(current, ledgerWithEvidence());
  const second = mergeNorthstarEvidenceIntoDataBundle(first, ledgerWithEvidence());

  assert.deepEqual(second, first);
  assert.deepEqual(second.screenshots.find((screen) => screen.id === "screen-awin-2")?.visibleCopy, ["Verify your account"]);
});
