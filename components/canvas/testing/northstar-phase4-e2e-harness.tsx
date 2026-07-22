"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeArtifactHost } from "@/components/canvas/artifacts/code-artifact-host";
import {
  NorthstarArchitectureProvider,
  type NorthstarArchitectureContextValue,
} from "@/components/canvas/northstar-architecture-context";
import { NorthstarLedgerInspector } from "@/components/canvas/northstar-ledger-inspector";
import {
  createNorthstarWorkspaceRuntime,
  type NorthstarWorkspaceRuntime,
  type NorthstarWorkspaceRuntimeSnapshot,
} from "@/lib/canvas-architecture/northstar-workspace-runtime";
import { createNorthstarDirectBootstrapArtifactPayload } from "@/lib/canvas-artifacts/northstar-direct-bootstrap";
import type { NorthstarTurnClient } from "@/lib/canvas-ai/northstar-turn-client";
import { NORTHSTAR_TURN_PROTOCOL_VERSION } from "@/lib/canvas-ai/northstar-turn-protocol";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { createNorthstarWindowProjectionSurface } from "@/lib/canvas-projection/window-surface";
import { NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA } from "@/lib/canvas-projection/types";
import { parseNorthstarProjectionState } from "@/lib/canvas-projection/validation";



const EMPTY_SNAPSHOT: NorthstarWorkspaceRuntimeSnapshot = {
  status: "idle",
  ledger: null,
  lastStep: null,
};

function textNodeIdUnderElement(value: NorthstarLedgerValue, elementId: string): string {
  const state = parseNorthstarProjectionState(value);
  const findElement = (node: typeof state.root): typeof state.root | null => {
    if (node.id === elementId) return node;
    for (const child of node.children) {
      if (child.kind !== "element") continue;
      const found = findElement(child);
      if (found) return found;
    }
    return null;
  };
  const element = findElement(state.root);
  if (!element) throw new Error(`The Phase 4 harness found no ${elementId} element.`);
  const text = element.children.find((child) => child.kind === "text" && child.text.trim().length > 0);
  if (!text) throw new Error(`The Phase 4 harness found no authored text under ${elementId}.`);
  return text.id;
}

function createHarnessTurnClient(): NorthstarTurnClient {
  let decisionCount = 0;
  return {
    async decideNextActivity(_context, options) {
      decisionCount += 1;
      if (decisionCount <= 2) {
        const second = decisionCount === 2;
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: options?.requestId ?? `phase4-decision-${decisionCount}`,
          type: "activity-draft",
          activity: {
            kind: "artboard-mutation",
            intent: second
              ? "Project a second verified browser-visible change"
              : "Project the first verified browser-visible change",
            expectedOutcome: second
              ? "The evidence card records the second committed act"
              : "The title records the first committed act",
            executionInput: second
              ? { marker: "Second verified visual commit" }
              : { marker: "First verified visual commit" },
          },
        };
      }
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: options?.requestId ?? "phase4-decision-final",
        type: "run-ready-to-finalize",
        reason: "The browser-visible candidate is committed.",
      };
    },

    async executeTaskAttempt(context, task, attempt, options) {
      const second = task.sequence === 2;
      const textNodeId = textNodeIdUnderElement(
        context.currentHead.stateSnapshot,
        second ? "northstar-evidence-value" : "northstar-title",
      );
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: options?.requestId ?? `phase4-execution-${task.sequence}`,
        type: "attempt-result",
        taskId: task.id,
        attemptId: attempt.id,
        resultKind: "artboard-mutation-draft",
        result: {
          schema: NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA,
          operations: [{
            type: "set-text",
            nodeId: textNodeId,
            text: second ? "Second verified visual commit" : "First verified visual commit",
          }],
        } as NorthstarLedgerValue,
      };
    },

    async correctActiveTask(_context, task, _latestAttempt, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: options?.requestId ?? "phase4-correction",
        type: "task-correction",
        taskId: task.id,
        action: { action: "cancel", reason: "Harness correction should not be needed." },
      };
    },

    async finalizeRun(_context, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: options?.requestId ?? "phase4-finalize",
        type: "run-finalized",
        summary: { answer: "Phase 4 completed through the production controller composition." },
      };
    },
  };
}

export function NorthstarPhase4E2EHarness() {
  const artifact = useMemo(
    () => createNorthstarDirectBootstrapArtifactPayload({
      artifactId: "phase4-browser-artifact",
      now: new Date("2026-07-21T00:00:00.000Z"),
    }),
    [],
  );
  const targetFrameRef = useRef<HTMLIFrameElement | null>(null);
  const runtimeRef = useRef<NorthstarWorkspaceRuntime | null>(null);
  const [runtime, setRuntime] = useState<NorthstarWorkspaceRuntime | null>(null);
  const [snapshot, setSnapshot] = useState<NorthstarWorkspaceRuntimeSnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);

  const registerProjectionFrame = useCallback<NorthstarArchitectureContextValue["registerProjectionFrame"]>(
    ({ frame }) => {
      targetFrameRef.current = frame;
      Object.assign(window, { __northstarPhase4Frame: frame });
      return () => {
        if (targetFrameRef.current === frame) targetFrameRef.current = null;
      };
    },
    [],
  );

  const architecture = useMemo<NorthstarArchitectureContextValue>(() => ({
    enabled: true,
    registerProjectionFrame,
  }), [registerProjectionFrame]);

  useEffect(() => {
    const surface = createNorthstarWindowProjectionSurface({
      ownerWindow: window,
      getTargetWindow: () => targetFrameRef.current?.contentWindow ?? null,
      timeoutMs: 3_000,
    });
    const nextRuntime = createNorthstarWorkspaceRuntime({
      projectionSurface: surface,
      turnClient: createHarnessTurnClient(),
      initialCaptureAttempts: 40,
      initialCaptureRetryMs: 25,
    });
    runtimeRef.current = nextRuntime;
    setRuntime(nextRuntime);
    setSnapshot(nextRuntime.getSnapshot());
    const unsubscribe = nextRuntime.subscribe(() => setSnapshot(nextRuntime.getSnapshot()));
    return () => {
      unsubscribe();
      nextRuntime.dispose();
      surface.dispose();
      runtimeRef.current = null;
    };
  }, []);

  const start = async () => {
    if (!runtimeRef.current) return;
    setError(null);
    try {
      await runtimeRef.current.startRun("Exercise the complete Phase 4 browser architecture");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <NorthstarArchitectureProvider value={architecture}>
      <main className="min-h-screen bg-zinc-100 p-6 text-zinc-950" data-testid="phase4-harness">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="phase4-start"
              onClick={() => void start()}
              disabled={!runtime || snapshot.status === "initializing" || snapshot.status === "running"}
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Run complete architecture
            </button>
            <output data-testid="phase4-status">{snapshot.status}</output>
            <output data-testid="phase4-commit-count">{snapshot.ledger?.commits.length ?? 0}</output>
          </div>
          {error && <p data-testid="phase4-error">{error}</p>}
          <div className="h-[620px] overflow-hidden rounded-3xl border border-black/10 bg-white">
            <CodeArtifactHost
              artifact={artifact}
              selected
              width={960}
              height={620}
              viewportZoom={1}
              onRequestSelect={() => undefined}
              onCanvasDragStart={() => undefined}
              onRuntimeReview={() => undefined}
              onContentSize={() => undefined}
              onProjectCommit={() => { throw new Error("Legacy projection callback must never run in Phase 4."); }}
              onProposalSettled={() => { throw new Error("Legacy proposal callback must never run in Phase 4."); }}
              onCanvasWheel={() => undefined}
            />
          </div>
          {snapshot.ledger && <NorthstarLedgerInspector snapshot={snapshot} />}
        </div>
      </main>
    </NorthstarArchitectureProvider>
  );
}
