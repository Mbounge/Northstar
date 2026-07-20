


"use client";

import { useCallback, useRef, useState } from "react";
import { CodeArtifactHost } from "@/components/canvas/artifacts/code-artifact-host";
import { materializeNorthstarBrowserCommit, type NorthstarBrowserCommit } from "@/lib/canvas-ai/northstar-transaction-kernel";
import type {
  CanvasCodeArtifactPayload,
  NorthstarArtboardMutationBatch,
} from "@/lib/canvas-artifacts/types";

const ARTIFACT_ID = "northstar-e2e-artifact";
const SURFACE_ID = "northstar-e2e-surface";
const CREATED_AT = "2026-07-20T00:00:00.000Z";

const dataBundle = {
  version: "northstar.artifact-data.v0.2" as const,
  objective: "Verify one continuously mounted living artboard",
  audience: "Northstar release engineering",
  artifactType: "comparison",
  coverageSummary: "Two ordered browser mutations must commit without replacing the iframe.",
  apps: [],
  flows: [],
  screenshots: [],
  hypotheses: [],
  decisions: [],
  corrections: [],
  openQuestions: [],
  allowedAssetUrls: [],
};

function foundation(): CanvasCodeArtifactPayload {
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: ARTIFACT_ID,
    surfaceId: SURFACE_ID,
    revisionId: "northstar-e2e-revision-1",
    title: "Northstar transaction release gate",
    description: "A real browser test for the persistent artboard protocol.",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: `<main data-ns-node-id="artboard" data-ns-canonical-surface="true">
        <header data-ns-node-id="header"><p>RELEASE GATE</p><h1 data-ns-node-id="title">One living artboard</h1></header>
        <section data-ns-node-id="evidence"><h2>Browser-committed evidence</h2></section>
        <footer data-ns-node-id="synthesis">The frame must stay mounted from start to finish.</footer>
      </main>`,
      css: `*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%;background:#fff;color:#18181b;font-family:Arial,sans-serif}main{width:1200px;min-height:720px;padding:72px;display:grid;grid-template-rows:auto 1fr auto;gap:32px;background:#fff}header{border-bottom:2px solid #6b5cff;padding-bottom:24px}h1{font-size:64px;line-height:1;margin:8px 0}#northstar-artifact-root{background:#fff}[data-ns-node-id="evidence"]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-content:start}.proof{min-height:180px;padding:28px;border:2px solid #d8d4ff;border-radius:24px;background:#f8f7ff}.proof strong{display:block;font-size:28px;margin-bottom:12px}`,
      javascript: "",
    },
    mutationJournal: [],
    dataBundle,
    stagePlan: [{ id: "evidence", phase: "evidence", label: "Evidence", message: "Verify the browser transaction." }],
    activeStageIndex: 0,
    visualStrategy: "A stable, continuously mounted proof surface.",
    artifactType: "comparison",
    audience: "release engineering",
    thinkingDepth: "low",
    creativeReviews: [],
    runtimeReview: undefined,
    status: "ready",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    preferredWidth: 1200,
    preferredHeight: 720,
    layoutBaseWidth: 1200,
    layoutBaseHeight: 720,
    intrinsicBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 720 },
    minimumWidth: 1200,
    minimumHeight: 720,
    buildState: {
      phase: "evidence",
      completedSteps: 0,
      totalSteps: 2,
      message: "Verifying the persistent browser transaction",
      isBuilding: true,
    },
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  };
}

function candidate(
  previous: CanvasCodeArtifactPayload,
  index: 1 | 2,
): CanvasCodeArtifactPayload {
  const mutationId = `northstar-e2e-mutation-${index}`;
  const nextRevision = `northstar-e2e-revision-${index + 1}`;
  const batch: NorthstarArtboardMutationBatch = {
    schema: "northstar.artboard-mutation.v1",
    mutationId,
    sequence: index,
    label: index === 1 ? "Commit the first proof" : "Commit the second proof",
    phase: "evidence",
    intent: "Exercise the real persistent iframe mutation protocol.",
    visibleChange: `Browser proof ${index} appeared on the same artboard.`,
    geometryIntent: "preserve",
    transitionMs: 0,
    minimumMeaningfulChangedNodes: 1,
    requiredChangeKinds: ["structure"],
    operations: [{
      op: "insert-html",
      targetId: "evidence",
      position: "beforeend",
      html: `<article class="proof" data-ns-node-id="proof-${index}"><strong>Commit ${index}</strong><span>Applied by the isolated browser runtime.</span></article>`,
    }],
    createdAt: CREATED_AT,
  };
  return {
    ...previous,
    revisionId: nextRevision,
    parentRevisionId: previous.revisionId,
    pendingAckToken: `${ARTIFACT_ID}:proposal-${index}`,
    mutationJournal: [batch],
    updatedAt: CREATED_AT,
    buildState: {
      ...previous.buildState,
      completedSteps: index - 1,
      message: batch.label,
      isBuilding: true,
    },
  };
}

export function NorthstarArtboardE2EHarness() {
  const [artifact, setArtifact] = useState<CanvasCodeArtifactPayload>(() => foundation());
  const [status, setStatus] = useState("mounting");
  const [commitCount, setCommitCount] = useState(0);
  const startedRef = useRef(false);
  const handledMutationIdsRef = useRef(new Set<string>());

  const handleBrowserCommit = useCallback((commit: NorthstarBrowserCommit) => {
    setArtifact((current) => {
      const materialized = materializeNorthstarBrowserCommit(current, commit);
      if (!commit.mutationId) {
        if (!startedRef.current) {
          startedRef.current = true;
          window.setTimeout(() => {
            setStatus("mutation-1-pending");
            setArtifact((latest) => candidate(latest, 1));
          }, 350);
        }
        return materialized;
      }
      if (handledMutationIdsRef.current.has(commit.mutationId)) return materialized;
      handledMutationIdsRef.current.add(commit.mutationId);
      setCommitCount((count) => count + 1);
      if (commit.mutationId === "northstar-e2e-mutation-1") {
        window.setTimeout(() => {
          setStatus("mutation-2-pending");
          setArtifact((latest) => candidate(latest, 2));
        }, 250);
      } else {
        setStatus("complete");
      }
      return materialized;
    });
  }, []);

  return (
    <main className="min-h-screen bg-zinc-100 p-8 text-zinc-950">
      <div className="mx-auto mb-4 flex w-[1200px] items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm">
        <strong>Northstar browser transaction release gate</strong>
        <span data-testid="northstar-e2e-status">{status}</span>
        <span data-testid="northstar-e2e-commit-count">{commitCount}</span>
      </div>
      <div data-testid="northstar-e2e-host" className="mx-auto h-[720px] w-[1200px] overflow-hidden rounded-3xl bg-[#ECECF3] shadow-xl">
        <CodeArtifactHost
          artifact={artifact}
          selected={false}
          width={1200}
          height={720}
          viewportZoom={1}
          onRequestSelect={() => undefined}
          onCanvasDragStart={() => undefined}
          onRuntimeReview={() => undefined}
          onContentSize={() => undefined}
          onBrowserCommit={handleBrowserCommit}
          onCanvasWheel={() => undefined}
        />
      </div>
    </main>
  );
}