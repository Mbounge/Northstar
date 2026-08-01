import { expect, test, type Page } from "@playwright/test";
import { buildCanvasArtifactRuntimeDocument } from "../lib/canvas-artifacts/runtime-document";
import type {
  CanvasCodeArtifactPayload,
  NorthstarArtboardMutationBatch,
} from "../lib/canvas-artifacts/types";

const ARTIFACT_ID = "northstar-transport-diagnosis-e2e";

function artifact(): CanvasCodeArtifactPayload {
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: ARTIFACT_ID,
    surfaceId: ARTIFACT_ID,
    revisionId: "transport-revision-1",
    title: "Transport diagnosis runtime",
    description: "Single-send transport proof.",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: `<main class="ns-artifact" data-ns-node-id="artboard" style="position:relative;width:1200px;min-height:800px;background:white">
        <section data-ns-node-id="presentation" style="width:1200px;min-height:800px">
          <h1 data-ns-node-id="headline">Before</h1>
          <div data-ns-node-id="content">Ready</div>
        </section>
      </main>`,
      css: "",
      javascript: "",
      creativeJavascript: "",
    },
    mutationJournal: [],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Verify single-send transport",
      audience: "release engineering",
      artifactType: "comparison",
      coverageSummary: "Probe, delivery, consecutive mutation, and deadline containment.",
      apps: [],
      flows: [],
      screenshots: [],
      hypotheses: [],
      decisions: [],
      corrections: [],
      openQuestions: [],
      allowedAssetUrls: [],
    },
    stagePlan: [{ id: "foundation", phase: "foundation", label: "Foundation", message: "Mount" }],
    activeStageIndex: 0,
    visualStrategy: "Transport proof",
    artifactType: "comparison",
    audience: "release engineering",
    thinkingDepth: "low",
    creativeReviews: [],
    status: "ready",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    preferredWidth: 1200,
    preferredHeight: 800,
    layoutBaseWidth: 1200,
    layoutBaseHeight: 800,
    intrinsicBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 800 },
    minimumWidth: 1200,
    minimumHeight: 800,
    buildState: {
      phase: "foundation",
      completedSteps: 0,
      totalSteps: 1,
      message: "Mounting",
      isBuilding: true,
    },
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  };
}

function batch(
  mutationId: string,
  sequence: number,
  operations: NorthstarArtboardMutationBatch["operations"],
): NorthstarArtboardMutationBatch {
  return {
    schema: "northstar.artboard-mutation.v1",
    mutationId,
    sequence,
    label: mutationId,
    phase: "analysis",
    intent: mutationId,
    visibleChange: mutationId,
    geometryIntent: "preserve",
    transitionMs: 0,
    operations,
    minimumMeaningfulChangedNodes: 1,
    allowTextOnly: true,
    executionPolicy: "linear-design",
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

async function mountRuntime(page: Page) {
  const runtime = buildCanvasArtifactRuntimeDocument(artifact());
  expect(runtime).toBeTruthy();
  await page.setContent(`<!doctype html><html><body>
    <script>
      window.__northstarMessages=[];
      window.addEventListener("message",event=>window.__northstarMessages.push({...event.data,receivedAt:Date.now()}));
    </script>
    <iframe id="runtime" sandbox="allow-scripts" style="width:1400px;height:900px;border:0"></iframe>
  </body></html>`);
  await page.locator("#runtime").evaluate((frame, source) => {
    (frame as HTMLIFrameElement).srcdoc = source as string;
  }, runtime);
  await waitForMessage(page, "northstar.artifact.ready");
}

async function waitForMessage(page: Page, type: string, mutationId?: string) {
  await page.waitForFunction(
    ([messageType, expectedMutationId]) => (
      (window as typeof window & { __northstarMessages?: Array<{ type?: string; mutationId?: string }> })
        .__northstarMessages ?? []
    ).some((message) => message?.type === messageType && (!expectedMutationId || message.mutationId === expectedMutationId)),
    [type, mutationId],
  );
  return page.evaluate(
    ([messageType, expectedMutationId]) => (
      (window as typeof window & { __northstarMessages?: Array<Record<string, unknown>> })
        .__northstarMessages ?? []
    ).find((message) => message?.type === messageType && (!expectedMutationId || message.mutationId === expectedMutationId)),
    [type, mutationId],
  );
}

async function sendProposal(page: Page, input: {
  revisionId: string;
  baseRevisionId: string;
  proposalId: string;
  batch: NorthstarArtboardMutationBatch;
  deadlineAt?: number;
  payloadPadding?: string;
}) {
  await page.locator("#runtime").evaluate((frame, proposal) => {
    const target = (frame as HTMLIFrameElement).contentWindow;
    target?.postMessage({
      type: "northstar.artifact.transport-probe",
      artifactId: proposal.artifactId,
      frameInstanceId: "e2e-frame",
      probeId: `${proposal.proposalId}-probe`,
      proposalId: proposal.proposalId,
      ackToken: proposal.ackToken,
      revisionId: proposal.revisionId,
      mutationId: proposal.batch.mutationId,
    }, "*");
    target?.postMessage({
      type: "northstar.artifact.apply-mutation",
      artifactId: proposal.artifactId,
      surfaceId: proposal.artifactId,
      revisionId: proposal.revisionId,
      baseRevisionId: proposal.baseRevisionId,
      proposalId: proposal.proposalId,
      ackToken: proposal.ackToken,
      batch: proposal.batch,
      layoutBaseWidth: 1200,
      layoutBaseHeight: 800,
      assetUrls: [],
      deliveryDeadlineAt: proposal.deadlineAt,
      payloadPadding: proposal.payloadPadding,
    }, "*");
  }, {
    artifactId: ARTIFACT_ID,
    revisionId: input.revisionId,
    baseRevisionId: input.baseRevisionId,
    proposalId: input.proposalId,
    ackToken: `${ARTIFACT_ID}:${input.proposalId}`,
    batch: input.batch,
    deadlineAt: input.deadlineAt ?? Date.now() + 5_000,
    payloadPadding: input.payloadPadding,
  });
}

test("probe and mutation enter the exact sandboxed runtime in order with one send", async ({ page }) => {
  await mountRuntime(page);
  const mutation = batch("transport-one", 1, [{ op: "set-text", targetId: "headline", text: "After one" }]);
  await sendProposal(page, {
    revisionId: "transport-revision-2",
    baseRevisionId: "transport-revision-1",
    proposalId: "transport-proposal-one",
    batch: mutation,
    payloadPadding: "x".repeat(100_000),
  });

  const probe = await waitForMessage(page, "northstar.artifact.transport-probe-ack", mutation.mutationId) as { receivedAt?: number };
  const received = await waitForMessage(page, "northstar.artifact.mutation-received", mutation.mutationId) as { receivedAt?: number };
  await waitForMessage(page, "northstar.artifact.mutation-applied", mutation.mutationId);
  expect(Number(probe.receivedAt)).toBeLessThanOrEqual(Number(received.receivedAt));
  await expect(page.frameLocator("#runtime").locator('[data-ns-node-id="headline"]')).toHaveText("After one");
});

test("a broad region replacement is followed by another accepted mutation", async ({ page }) => {
  await mountRuntime(page);
  const broad = batch("transport-broad", 1, [
    {
      op: "set-html",
      targetId: "presentation",
      html: '<h1 data-ns-node-id="headline">Broad revision</h1><div data-ns-node-id="content">Rebuilt</div>',
    },
    { op: "set-css-layer", layerId: "broad", css: '[data-ns-node-id="presentation"]{display:grid;gap:24px}' },
  ]);
  await sendProposal(page, {
    revisionId: "transport-revision-2",
    baseRevisionId: "transport-revision-1",
    proposalId: "transport-proposal-broad",
    batch: broad,
  });
  await waitForMessage(page, "northstar.artifact.mutation-applied", broad.mutationId);

  const follow = batch("transport-follow", 2, [{ op: "set-text", targetId: "headline", text: "Follow-up revision" }]);
  await sendProposal(page, {
    revisionId: "transport-revision-3",
    baseRevisionId: "transport-revision-2",
    proposalId: "transport-proposal-follow",
    batch: follow,
  });
  await waitForMessage(page, "northstar.artifact.transport-probe-ack", follow.mutationId);
  await waitForMessage(page, "northstar.artifact.mutation-received", follow.mutationId);
  await waitForMessage(page, "northstar.artifact.mutation-applied", follow.mutationId);
  await expect(page.frameLocator("#runtime").locator('[data-ns-node-id="headline"]')).toHaveText("Follow-up revision");
});

test("an expired delivery is rejected before authored DOM changes", async ({ page }) => {
  await mountRuntime(page);
  const expired = batch("transport-expired", 1, [{ op: "set-text", targetId: "headline", text: "Must not apply" }]);
  await sendProposal(page, {
    revisionId: "transport-revision-expired",
    baseRevisionId: "transport-revision-1",
    proposalId: "transport-proposal-expired",
    batch: expired,
    deadlineAt: Date.now() - 1,
  });
  const rejected = await waitForMessage(page, "northstar.artifact.mutation-rejected", expired.mutationId) as { message?: string };
  expect(rejected.message).toContain("NORTHSTAR_TRANSPORT_DELIVERY_DEADLINE_EXPIRED");
  const receivedCount = await page.evaluate((mutationId) => (
    (window as typeof window & { __northstarMessages?: Array<{ type?: string; mutationId?: string }> }).__northstarMessages ?? []
  ).filter((message) => message.type === "northstar.artifact.mutation-received" && message.mutationId === mutationId).length, expired.mutationId);
  expect(receivedCount).toBe(0);
  await expect(page.frameLocator("#runtime").locator('[data-ns-node-id="headline"]')).toHaveText("Before");
});
