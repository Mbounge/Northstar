import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasV2EvidenceSourceForSelection,
  compactCanvasV2EvidencePacketsForModel,
  mergeCanvasV2EvidencePackets,
} from "../lib/canvas-v2/evidence-packets";
import {
  CANVAS_V2_EVIDENCE_PACKET_CSS,
  canvasV2EvidencePacketAssetBinding,
  canvasV2EvidencePacketsNeedingMaterialization,
  displayCanvasV2EvidenceTimestamp,
} from "../lib/canvas-v2/evidence-packet-insertion";
import { buildCanvasV2BoundedModelContext } from "../lib/canvas-v2/model-context";
import {
  CANVAS_V2_ARTIFACT_SCHEMA,
  CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  CANVAS_V2_OBSERVATION_SCHEMA,
  type CanvasV2ArtifactRevision,
  type CanvasV2EvidencePacket,
  type CanvasV2RenderObservation,
} from "../lib/canvas-v2/types";

const first: CanvasV2EvidencePacket = {
  schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  id: "packet:marketing:snapshot-1",
  kind: "marketing-signal",
  title: "Awin marketing signals",
  summary: "The first authorized snapshot.",
  authority: "observed",
  source: {
    providerId: "account-intelligence",
    providerLabel: "Account intelligence",
    sourceId: "marketing:snapshot-1",
    sourceType: "marketing-feed",
    label: "Awin marketing feed",
    retrievedAt: "2026-08-26T12:00:00.000Z",
    capturedAt: "snapshot-1",
    timeRange: { start: "2026-08-01", end: "2026-08-07", timezone: "UTC" },
    filters: { channel: "linkedin" },
    permission: "authorized",
    freshness: "current-snapshot",
  },
  assets: [{
    id: "marketing-image-1",
    url: "https://evidence.example/marketing-1.png",
    label: "LinkedIn post",
    app: "Awin",
    kind: "marketing-signal",
    authority: "observed",
    packetId: "packet:marketing:snapshot-1",
  }],
  facts: [{ id: "fact:message", label: "Message", value: "Partner growth", authority: "observed", sourceAssetIds: ["marketing-image-1"] }],
  metrics: [{ id: "metric:engagement", label: "Engagement rate", value: 4.2, unit: "%", format: "percent", definition: "Interactions divided by impressions for the filtered LinkedIn posts.", authority: "calculated", timeRange: { start: "2026-08-01", end: "2026-08-07", timezone: "UTC" }, filters: { channel: "linkedin" }, sourceAssetIds: ["marketing-image-1"] }],
  limitations: ["This snapshot does not establish causality."],
  tags: ["Awin", "marketing"],
  createdAt: "2026-08-26T12:00:00.000Z",
  appId: "app:awin",
  appName: "Awin",
  continuationKey: "marketing:app:awin",
};

const continuation: CanvasV2EvidencePacket = {
  ...first,
  id: "packet:marketing:snapshot-2",
  source: { ...first.source, sourceId: "marketing:snapshot-2", capturedAt: "snapshot-2" },
  assets: [{ ...first.assets[0]!, id: "marketing-image-2", packetId: "packet:marketing:snapshot-2", url: "https://evidence.example/marketing-2.png" }],
  facts: [{ id: "fact:audience", label: "Audience", value: "Publishers", authority: "observed", sourceAssetIds: ["marketing-image-2"] }],
  metrics: [],
  limitations: ["Audience labels are supplied by the connected dataset."],
  tags: ["Awin", "continuation"],
  createdAt: "2026-08-26T12:05:00.000Z",
};

test("compiler-owned evidence packets use accessible theme-local tokens in light and dark mode", () => {
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /--canvas-v2-packet-ink:#151620/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /--canvas-v2-packet-muted:#555968/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /:root\[data-canvas-v2-theme="dark"\]/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /--canvas-v2-packet-ink:#f4f3f8/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /canvas-v2-evidence-packets-v2/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /canvas-v2-evidence-packet--marketing/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /canvas-v2-evidence-packet--business/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /canvas-v2-evidence-capture--marketing \.canvas-v2-evidence-packet__image \{ height:460px;/);
  assert.match(CANVAS_V2_EVIDENCE_PACKET_CSS, /\.canvas-v2-evidence-packet \{[^}]*background:transparent; box-shadow:none; overflow:visible;/);
  assert.doesNotMatch(CANVAS_V2_EVIDENCE_PACKET_CSS, /\.canvas-v2-evidence-packet \{[^}]*border-radius:2[0-9]px/);
  assert.doesNotMatch(CANVAS_V2_EVIDENCE_PACKET_CSS, /--northstar-paper/);
});

test("evidence timestamps are concise, readable, and explicitly UTC", () => {
  assert.equal(displayCanvasV2EvidenceTimestamp("2026-08-24"), "Aug 24, 2026");
  assert.equal(displayCanvasV2EvidenceTimestamp("2026-08-27T14:30:00.000Z"), "Aug 27, 2026 · 14:30 UTC");
  assert.equal(displayCanvasV2EvidenceTimestamp("snapshot-1"), "snapshot-1");
});

test("snapshot materialization is source-object complete and continuation aware", () => {
  const emptyDocument = revision().document;
  assert.deepEqual(canvasV2EvidencePacketsNeedingMaterialization(emptyDocument, [first]), [first]);

  const materializedDocument = {
    html: `<article data-canvas-v2-evidence-packet-id="${first.id}" data-canvas-v2-evidence-continuation="${first.continuationKey}"><img data-canvas-v2-evidence-id="marketing-image-1"/><div data-canvas-v2-evidence-fact-id="fact:message"></div><div data-canvas-v2-evidence-metric-id="metric:engagement"></div></article>`,
    css: "",
  };
  assert.deepEqual(canvasV2EvidencePacketsNeedingMaterialization(materializedDocument, [first]), []);
  assert.deepEqual(canvasV2EvidencePacketsNeedingMaterialization(materializedDocument, [continuation]), [continuation]);
});

test("canonical product journeys keep packet metadata internal instead of appending diagnostic columns", () => {
  const productPacket: CanvasV2EvidencePacket = {
    ...first,
    id: "packet:capture:whop-onboarding",
    kind: "screenshot-sequence",
    title: "Whop · User Onboarding",
    continuationKey: "capture:whop-onboarding",
    assets: [{ ...first.assets[0]!, id: "screen:whop:create-account", kind: "screenshot", packetId: "packet:capture:whop-onboarding" }],
    facts: [{ id: "packet:capture:whop-onboarding:screen-count", label: "Captured screens", value: "17", authority: "calculated" }],
    metrics: [],
  };
  const canonicalJourney = {
    html: `<article data-canvas-v2-canonical-flow="whop-onboarding" data-canvas-v2-evidence-packet-id="${productPacket.id}" data-canvas-v2-evidence-continuation="${productPacket.continuationKey}"><img data-canvas-v2-evidence-id="screen:whop:create-account" /></article>`,
    css: "",
  };
  assert.deepEqual(canvasV2EvidencePacketsNeedingMaterialization(canonicalJourney, [productPacket]), []);
  assert.deepEqual(canvasV2EvidencePacketsNeedingMaterialization({ html: "<main></main>", css: "" }, [productPacket]), []);
});

test("a packet copy of canonical evidence is source-linked instead of becoming a second canonical identity", () => {
  const canonical = new Map([["icon:app:awin", "flow-awin-onboarding-icon"]]);
  assert.deepEqual(canvasV2EvidencePacketAssetBinding("icon:app:awin", canonical), {
    role: "analysis-copy",
    sourceNodeId: "flow-awin-onboarding-icon",
    scaleIntent: "identity-mark",
  });
  assert.deepEqual(canvasV2EvidencePacketAssetBinding("marketing-image-1", canonical), { role: "reference" });
});

function revision(packet: CanvasV2EvidencePacket = first): CanvasV2ArtifactRevision {
  return {
    schema: CANVAS_V2_ARTIFACT_SCHEMA,
    id: "revision",
    state: "committed",
    document: { html: '<main data-canvas-v2-node-id="canvas"><p data-canvas-v2-node-id="human-note" data-canvas-v2-last-author="user">Keep this human interpretation.</p></main>', css: "" },
    evidence: packet.assets,
    evidencePackets: [packet],
    createdAt: "2026-08-26T12:00:00.000Z",
  };
}

function observation(): CanvasV2RenderObservation {
  return {
    schema: CANVAS_V2_OBSERVATION_SCHEMA,
    revisionId: "revision",
    screenshotDataUrl: "data:image/png;base64,AA==",
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    contentBounds: { x: 0, y: 0, width: 1440, height: 900 },
    runtimeErrors: [],
    missingEvidenceIds: [],
    spatial: {
      measuredNodeCount: 0,
      reportedNodeCount: 0,
      nodes: [],
      notableIntersections: [],
      contentOverflowNodeIds: [],
      evidence: [],
    },
    capturedAt: "2026-08-26T12:00:00.000Z",
  };
}

test("progressive retrieval extends one evidence thread instead of duplicating or replacing it", () => {
  const merged = mergeCanvasV2EvidencePackets([first], [continuation]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, first.id);
  assert.deepEqual(merged[0]?.parentPacketIds, [first.id]);
  assert.deepEqual(merged[0]?.assets.map((asset) => asset.id), ["marketing-image-1", "marketing-image-2"]);
  assert.deepEqual(merged[0]?.facts.map((fact) => fact.id), ["fact:message", "fact:audience"]);
  assert.deepEqual(merged[0]?.metrics.map((metric) => metric.id), ["metric:engagement"]);
  assert.deepEqual(merged[0]?.limitations, [
    "This snapshot does not establish causality.",
    "Audience labels are supplied by the connected dataset.",
  ]);
  const continuedRevision = revision(merged[0]);
  const selected = canvasV2EvidenceSourceForSelection(continuedRevision, {
    nodeId: "metric-after-continuation",
    tagName: "article",
    locked: false,
    hidden: false,
    evidencePacketId: first.id,
    textEditable: false,
    bounds: { x: 0, y: 0, width: 320, height: 180 },
  });
  assert.equal(selected?.packet.id, first.id);
  assert.equal(selected?.source.sourceId, continuation.source.sourceId);
});

test("bounded model context retains metric definition, time range, filters, authority, and limitations", () => {
  const context = buildCanvasV2BoundedModelContext(revision(), observation());
  const grounded = context.groundedEvidencePackets[0];
  assert.equal(grounded?.authority, "observed");
  assert.deepEqual(grounded?.source.timeRange, { start: "2026-08-01", end: "2026-08-07", timezone: "UTC" });
  assert.deepEqual(grounded?.source.filters, { channel: "linkedin" });
  assert.equal(grounded?.metrics[0]?.definition, "Interactions divided by impressions for the filtered LinkedIn posts.");
  assert.equal(grounded?.metrics[0]?.authority, "calculated");
  assert.match(context.evidenceContract, /Evidence-free creative work must remain evidence-free/);
});

test("the source inspector resolves a selected native evidence object back to its provider packet", () => {
  const selected = canvasV2EvidenceSourceForSelection(revision(), {
    nodeId: "marketing-native-image",
    tagName: "img",
    label: "LinkedIn post",
    locked: false,
    hidden: false,
    origin: "research",
    lastAuthor: "northstar",
    editVersion: 1,
    evidenceId: "marketing-image-1",
    evidencePacketId: first.id,
    evidenceSourceId: first.source.sourceId,
    evidenceAuthority: "observed",
    textEditable: false,
    bounds: { x: 0, y: 0, width: 320, height: 180 },
  });
  assert.equal(selected?.packet.id, first.id);
  assert.equal(selected?.asset?.id, "marketing-image-1");
  assert.equal(selected?.source.providerLabel, "Account intelligence");
});

test("evidence-free revisions expose no synthetic grounded packets to the model", () => {
  const ungrounded = revision();
  delete ungrounded.evidencePackets;
  ungrounded.evidence = [];
  const context = buildCanvasV2BoundedModelContext(ungrounded, observation());
  assert.deepEqual(context.groundedEvidencePackets, []);
  assert.deepEqual(compactCanvasV2EvidencePacketsForModel(undefined), []);
});
