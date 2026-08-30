import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CANVAS_V2_DISCOVERY_GRAPH_SCHEMA,
  syncCanvasV2DiscoveryGraph,
} from "../lib/canvas-v2/discovery-graph";
import {
  buildCanvasV2DeltaFirstDiscoveryContext,
  buildCanvasV2DiscoveryWorkingSet,
  clearCanvasV2DiscoveryWorkingSetCache,
  expandCanvasV2DiscoveryWorkingSet,
} from "../lib/canvas-v2/discovery-working-set";
import {
  CANVAS_V2_DISCOVERY_CONTEXT_RUNTIME,
  buildCanvasV2DiscoveryContextRuntime,
} from "../lib/canvas-v2/discovery-context-runtime";
import { buildCanvasV2BoundedModelContext } from "../lib/canvas-v2/model-context";
import {
  commitCanvasV2Candidate,
  createCanvasV2CandidateRevision,
  createCanvasV2CommittedRevision,
} from "../lib/canvas-v2/revisions";
import {
  commitCanvasV2HistoryTransaction,
  createCanvasV2TransactionalHistory,
  travelCanvasV2History,
} from "../lib/canvas-v2/transactional-history";
import {
  CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  type CanvasV2EvidencePacket,
  type CanvasV2RenderObservation,
} from "../lib/canvas-v2/types";
import type { CanvasV2WorkingContext } from "../lib/canvas-v2/working-context";

const timestamp = "2026-08-26T14:00:00.000Z";

function packet(input: {
  id: string;
  label: string;
  value: string;
  sourceId?: string;
  authority?: "observed" | "supplied" | "calculated" | "inferred";
  limitation?: string;
}): CanvasV2EvidencePacket {
  const sourceId = input.sourceId ?? input.id;
  return {
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id: input.id,
    kind: "business-record",
    title: `${input.label} evidence`,
    summary: `Grounded account evidence for ${input.label}.`,
    authority: input.authority ?? "observed",
    source: {
      providerId: "account-intelligence",
      providerLabel: "Account intelligence",
      sourceId,
      sourceType: "business-manifest",
      label: `Business source ${sourceId}`,
      retrievedAt: timestamp,
      timeRange: { start: "2026-08-01", end: "2026-08-25", timezone: "UTC" },
      filters: { workspace: "northstar" },
      permission: "authorized",
      freshness: "current-snapshot",
    },
    assets: [{
      id: `asset:${input.id}`,
      url: `https://evidence.example/${input.id}.png`,
      label: `${input.label} capture`,
      kind: "image",
      authority: input.authority ?? "observed",
      packetId: input.id,
    }],
    facts: [{
      id: `fact:${input.label.toLowerCase().replaceAll(" ", "-")}`,
      label: input.label,
      value: input.value,
      authority: input.authority ?? "observed",
      sourceAssetIds: [`asset:${input.id}`],
    }],
    metrics: [],
    limitations: [input.limitation ?? "This source describes one authorized account snapshot."],
    tags: ["business", input.label],
    createdAt: timestamp,
  };
}

const document = {
  html: '<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="human-thesis" data-canvas-v2-origin="northstar" data-canvas-v2-user-edited="text move" data-canvas-v2-last-author="user" data-canvas-v2-edit-version="3">Protect this interpretation.</article></main>',
  css: "",
};

function context(): CanvasV2WorkingContext {
  return {
    schema: "canvas-v2.working-context.v1",
    scope: "selection",
    selectionPolicy: "modify",
    selectedNodeIds: ["human-thesis"],
    visibleBounds: { x: 0, y: 0, width: 1_600, height: 900 },
    viewportScale: 0.5,
    visibleNodeIds: ["human-thesis"],
    nearbyNodeIds: ["human-thesis"],
    editableNodeIds: ["human-thesis"],
    protectedNodeIds: [],
    objects: [{
      nodeId: "human-thesis",
      kind: "text",
      origin: "northstar",
      lastAuthor: "user",
      userEdited: true,
      editVersion: 3,
      locked: false,
      hidden: false,
      canonicalEvidence: false,
      bounds: { x: 100, y: 100, width: 400, height: 100 },
      textPreview: "Protect this interpretation.",
    }],
    relationships: [],
  };
}

function observation(revisionId: string): CanvasV2RenderObservation {
  return {
    schema: "canvas-v2.observation.v1",
    revisionId,
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
    capturedAt: timestamp,
  };
}

test("the discovery graph keeps provenance, human corrections, and contradictory active claims", () => {
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-1",
    updatedAt: timestamp,
    document,
    evidencePackets: [
      packet({ id: "crm", label: "Enterprise readiness", value: "Ready", limitation: "Sales notes are qualitative." }),
      packet({ id: "support", label: "Enterprise readiness", value: "Not ready", limitation: "Support load excludes weekends." }),
    ],
  });

  assert.equal(graph.schema, CANVAS_V2_DISCOVERY_GRAPH_SCHEMA);
  assert.equal(graph.nodes.filter((node) => node.kind === "source").length, 2);
  assert.equal(graph.nodes.filter((node) => node.kind === "human-edit").length, 1);
  assert.equal(graph.nodes.filter((node) => node.kind === "fact" && node.status === "active").length, 2);
  assert.equal(graph.edges.filter((edge) => edge.kind === "challenges").length, 1);
  assert.equal(graph.index.contradictionGroupIds.length, 1);
  assert.ok(graph.edges.some((edge) => edge.kind === "captured-from"));
});

test("the same journey field on different products is comparative, not contradictory", () => {
  const awin = packet({ id: "awin-flow", label: "Captured screens", value: "47" });
  awin.kind = "screenshot-sequence";
  awin.appId = "app:awin";
  awin.appName = "Awin";
  awin.facts[0] = { ...awin.facts[0]!, label: "Captured screens", sourceAssetIds: [awin.assets[0]!.id] };
  const whop = packet({ id: "whop-flow", label: "Captured screens", value: "17" });
  whop.kind = "screenshot-sequence";
  whop.appId = "app:whop";
  whop.appName = "Whop";
  whop.facts[0] = { ...whop.facts[0]!, label: "Captured screens", sourceAssetIds: [whop.assets[0]!.id] };
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "product-comparison",
    updatedAt: timestamp,
    document,
    evidencePackets: [awin, whop],
  });
  const facts = graph.nodes.filter((node) => node.kind === "fact" && node.label === "Captured screens");

  assert.equal(facts.length, 2);
  assert.notEqual(facts[0]!.semanticKey, facts[1]!.semanticKey);
  assert.equal(graph.edges.some((edge) => edge.kind === "challenges" && facts.some((node) => node.id === edge.from) && facts.some((node) => node.id === edge.to)), false);
  assert.equal(facts.some((node) => node.tags.some((tag) => tag.startsWith("asset:"))), false);
});

test("an evidence-led comparison keeps every canonical side in compact model context", () => {
  const atlasDocument = {
    html: '<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="flow-awin" data-canvas-v2-canonical-flow="flow:awin"><img data-canvas-v2-node-id="awin-screen" data-canvas-v2-evidence-id="screen:awin" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.example/awin.png"></article><article data-canvas-v2-node-id="flow-whop" data-canvas-v2-canonical-flow="flow:whop"><img data-canvas-v2-node-id="whop-screen" data-canvas-v2-evidence-id="screen:whop" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.example/whop.png"></article></main>',
    css: "",
  };
  const unrelatedPacket = packet({ id: "business", label: "Revenue", value: "$1m" });
  const model = buildCanvasV2BoundedModelContext({
    schema: "canvas-v2.artifact.v1",
    id: "balanced-comparison",
    state: "committed",
    document: atlasDocument,
    evidence: [
      { id: "screen:awin", url: "https://evidence.example/awin.png", label: "Awin screen", app: "Awin" },
      { id: "screen:whop", url: "https://evidence.example/whop.png", label: "Whop screen", app: "Whop" },
    ],
    evidencePackets: [unrelatedPacket],
    createdAt: timestamp,
  }, observation("balanced-comparison"), undefined, {
    instruction: "Compare Awin and Whop using representative flows and screenshots.",
    phase: "composition",
    evidencePolicy: "required",
  });
  assert.deepEqual(model.canonicalEvidence.map((flow) => flow.flowId), ["flow:awin", "flow:whop"]);
});

test("a later value supersedes without erasing the historical source claim", () => {
  const first = packet({ id: "crm", label: "Qualified pipeline", value: "$120k" });
  const graph1 = syncCanvasV2DiscoveryGraph({ revisionId: "revision-1", updatedAt: timestamp, document, evidencePackets: [first] });
  const graph2 = syncCanvasV2DiscoveryGraph({
    previous: graph1,
    revisionId: "revision-2",
    updatedAt: "2026-08-26T15:00:00.000Z",
    document,
    evidencePackets: [{ ...first, facts: [{ ...first.facts[0]!, value: "$145k" }] }],
  });

  const claims = graph2.nodes.filter((node) => node.kind === "fact" && node.semanticKey === "fact:qualified-pipeline");
  assert.equal(claims.length, 2);
  assert.equal(claims.find((node) => node.value === "$120k")?.status, "historical");
  assert.equal(claims.find((node) => node.value === "$145k")?.status, "active");
  assert.ok(graph2.edges.some((edge) => edge.kind === "supersedes"));
  assert.ok(graph2.changeSet.historicalNodeIds.some((id) => id.includes("fact:crm")));
});

test("refreshed source and packet snapshots preserve their prior provenance", () => {
  const first = packet({ id: "crm", label: "Qualified pipeline", value: "$120k" });
  const graph1 = syncCanvasV2DiscoveryGraph({ revisionId: "revision-source-1", updatedAt: timestamp, document, evidencePackets: [first] });
  const refreshed = {
    ...first,
    source: {
      ...first.source,
      retrievedAt: "2026-08-27T14:00:00.000Z",
      timeRange: { start: "2026-08-02", end: "2026-08-26", timezone: "UTC" },
      filters: { workspace: "northstar", segment: "enterprise" },
    },
  } satisfies CanvasV2EvidencePacket;
  const graph2 = syncCanvasV2DiscoveryGraph({
    previous: graph1,
    revisionId: "revision-source-2",
    updatedAt: "2026-08-27T14:00:00.000Z",
    document,
    evidencePackets: [refreshed],
  });

  const sources = graph2.nodes.filter((node) => node.kind === "source" && node.sourceId === "crm");
  assert.equal(sources.length, 2);
  assert.equal(sources.find((node) => node.retrievedAt === timestamp)?.status, "historical");
  assert.equal(sources.find((node) => node.retrievedAt === "2026-08-27T14:00:00.000Z")?.status, "active");
  assert.ok(graph2.edges.some((edge) => edge.kind === "supersedes" && sources.some((node) => node.id === edge.from) && sources.some((node) => node.id === edge.to)));
});

test("a retrieval timestamp alone refreshes last-seen memory without fabricating a new source version", () => {
  const first = packet({ id: "crm", label: "Qualified pipeline", value: "$120k" });
  const graph1 = syncCanvasV2DiscoveryGraph({ revisionId: "retrieval-1", updatedAt: timestamp, document, evidencePackets: [first] });
  const graph2 = syncCanvasV2DiscoveryGraph({
    previous: graph1,
    revisionId: "retrieval-2",
    updatedAt: "2026-08-26T14:01:00.000Z",
    document,
    evidencePackets: [{
      ...first,
      source: { ...first.source, retrievedAt: "2026-08-26T14:01:00.000Z" },
      createdAt: "2026-08-26T14:01:00.000Z",
    }],
  });

  assert.equal(graph2.nodes.filter((node) => node.kind === "source" && node.sourceId === "crm").length, 1);
  assert.equal(graph2.nodes.filter((node) => node.kind === "packet" && node.packetId === "crm").length, 1);
  assert.equal(graph2.nodes.filter((node) => node.kind === "fact" && node.packetId === "crm").length, 1);
  assert.equal(graph2.changeSet.historicalNodeIds.some((nodeId) => nodeId.includes("crm")), false);
  assert.equal(graph2.nodes.find((node) => node.kind === "source" && node.sourceId === "crm")?.lastSeenRevisionId, "retrieval-2");
});

test("native object copy and human edit memory are versioned without losing prior wording", () => {
  const graph1 = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-object-1",
    updatedAt: timestamp,
    document,
  });
  const revisedDocument = {
    ...document,
    html: document.html
      .replace('data-canvas-v2-edit-version="3"', 'data-canvas-v2-edit-version="4"')
      .replace("Protect this interpretation.", "Protect this revised interpretation."),
  };
  const graph2 = syncCanvasV2DiscoveryGraph({
    previous: graph1,
    revisionId: "revision-object-2",
    updatedAt: "2026-08-26T15:00:00.000Z",
    document: revisedDocument,
  });

  const objects = graph2.nodes.filter((node) => node.kind === "canvas-object" && node.canvasNodeId === "human-thesis");
  assert.equal(objects.length, 2);
  assert.equal(objects.find((node) => node.value === "Protect this interpretation.")?.status, "historical");
  assert.equal(objects.find((node) => node.value === "Protect this revised interpretation.")?.status, "active");
  assert.equal(graph2.nodes.find((node) => node.kind === "human-edit" && node.status === "active")?.value, "Protect this revised interpretation.");
  assert.ok(graph2.edges.some((edge) => edge.kind === "supersedes" && objects.some((node) => node.id === edge.from) && objects.some((node) => node.id === edge.to)));
});

test("quality-preserving retrieval includes both sides of a relevant contradiction and their lineage", () => {
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-quality",
    updatedAt: timestamp,
    document,
    evidencePackets: [
      packet({ id: "crm", label: "Enterprise readiness", value: "Ready" }),
      packet({ id: "support", label: "Enterprise readiness", value: "Not ready" }),
      ...Array.from({ length: 80 }, (_, index) => packet({ id: `noise-${index}`, label: `Unrelated field ${index}`, value: `Value ${index}` })),
    ],
  });
  const workingSet = buildCanvasV2DiscoveryWorkingSet({
    graph,
    phase: "sensemaking",
    query: "Should we launch enterprise now? Assess enterprise readiness and the conflicting signals.",
    workingContext: context(),
    characterBudget: 5_000,
    evidencePolicy: "required",
  });

  const readiness = workingSet.nodes.filter((node) => node.semanticKey === "fact:enterprise-readiness");
  assert.deepEqual(new Set(readiness.map((node) => node.value)), new Set(["Ready", "Not ready"]));
  assert.ok(workingSet.nodes.some((node) => node.kind === "human-edit"));
  assert.ok(workingSet.nodes.some((node) => node.kind === "source" && node.sourceId === "crm"));
  assert.ok(workingSet.nodes.some((node) => node.kind === "source" && node.sourceId === "support"));
  assert.ok(workingSet.nodes.length < graph.nodes.length / 2);
  assert.equal(workingSet.receipt.qualityChecks.relevantContradictionsPreserved, true);
  assert.equal(workingSet.receipt.qualityChecks.sourceLineagePreserved, true);
  assert.equal(workingSet.receipt.qualityChecks.humanEditsPreserved, true);
  assert.ok(workingSet.onDemand.availableNodeIds.length > 0);
});

test("context size stays bounded as irrelevant discovery memory grows", () => {
  const large = syncCanvasV2DiscoveryGraph({
    revisionId: "large",
    updatedAt: timestamp,
    document,
    evidencePackets: [
      packet({ id: "revenue", label: "Revenue", value: "$2m" }),
      ...Array.from({ length: 180 }, (_, index) => packet({ id: `archive-${index}`, label: `Archived signal ${index}`, value: String(index) })),
    ],
  });
  const grown = buildCanvasV2DiscoveryWorkingSet({ graph: large, phase: "composition", query: "Create a revenue narrative", characterBudget: 5_000, evidencePolicy: "required" });

  assert.ok(grown.receipt.estimatedCharacters <= grown.receipt.effectiveCharacterBudget);
  assert.ok(grown.receipt.estimatedCharacters <= 8_000);
  assert.ok(grown.receipt.estimatedCharacters < JSON.stringify(large.nodes).length / 20);
  assert.ok(grown.receipt.omittedAvailableNodeCount > 500);
  assert.ok(grown.nodes.some((node) => node.semanticKey === "fact:revenue"));
  assert.ok(JSON.stringify(grown).length < 45_000, "the complete working-set envelope, not just its node payload, must remain bounded");
  assert.ok(grown.onDemand.availableNodeIds.length <= 120);
  assert.equal(grown.evidenceIndex.sources.length < 20, true);
});

test("protected evidence atlases stay durable without becoming mandatory model payload", () => {
  clearCanvasV2DiscoveryWorkingSetCache();
  const atlasPacket = packet({ id: "onboarding-atlas", label: "Onboarding journey", value: "Captured" });
  atlasPacket.assets = Array.from({ length: 72 }, (_, index) => ({
    id: `asset:onboarding-${index}`,
    url: `https://evidence.example/onboarding-${index}.png`,
    label: `Onboarding screen ${index + 1}`,
    kind: "image" as const,
    authority: "observed" as const,
    packetId: atlasPacket.id,
    sequenceIndex: index,
  }));
  atlasPacket.facts = [{
    ...atlasPacket.facts[0]!,
    sourceAssetIds: atlasPacket.assets.map((asset) => asset.id),
  }];
  const evidenceNodeIds = atlasPacket.assets.map((_, index) => `atlas-screen-${index}`);
  const atlasDocument = {
    html: [
      '<main data-canvas-v2-node-id="canvas">',
      '<h1 data-canvas-v2-node-id="comparison-heading" data-canvas-v2-origin="northstar" data-canvas-v2-user-edited="text" data-canvas-v2-edit-version="1">Compare the onboarding journeys.</h1>',
      ...atlasPacket.assets.map((asset, index) => (
        `<img data-canvas-v2-node-id="${evidenceNodeIds[index]}" data-canvas-v2-origin="northstar" data-canvas-v2-evidence-id="${asset.id}" data-canvas-v2-evidence-packet-id="${atlasPacket.id}" alt="${asset.label}" />`
      )),
      '</main>',
    ].join(""),
    css: "",
  };
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "protected-atlas",
    updatedAt: timestamp,
    document: atlasDocument,
    evidencePackets: [atlasPacket],
  });
  const heading = context().objects[0]!;
  const protectedContext: CanvasV2WorkingContext = {
    ...context(),
    selectedNodeIds: ["comparison-heading"],
    editableNodeIds: ["comparison-heading"],
    visibleNodeIds: ["comparison-heading", ...evidenceNodeIds.slice(0, 8)],
    nearbyNodeIds: ["comparison-heading", ...evidenceNodeIds.slice(0, 12)],
    protectedNodeIds: [...evidenceNodeIds],
    objects: [
      { ...heading, nodeId: "comparison-heading", textPreview: "Compare the onboarding journeys." },
      ...evidenceNodeIds.map((nodeId, index) => ({
        nodeId,
        kind: "image" as const,
        origin: "northstar" as const,
        lastAuthor: "northstar" as const,
        userEdited: false,
        editVersion: 0,
        locked: false,
        hidden: false,
        canonicalEvidence: true,
        evidenceId: atlasPacket.assets[index]!.id,
        bounds: { x: 200 + index * 120, y: 300, width: 100, height: 200 },
        textPreview: atlasPacket.assets[index]!.label,
      })),
    ],
  };
  const workingSet = buildCanvasV2DiscoveryWorkingSet({
    graph,
    phase: "sensemaking",
    query: "Compare the onboarding journeys and find the most decision-relevant difference.",
    workingContext: protectedContext,
    characterBudget: 18_000,
    evidencePolicy: "required",
  });
  const modelContext = buildCanvasV2DeltaFirstDiscoveryContext(workingSet);
  const targetedAssetNodeId = graph.nodes.find((node) => node.kind === "asset" && node.evidenceId === atlasPacket.assets[0]!.id)!.id;
  const targeted = buildCanvasV2DiscoveryWorkingSet({
    graph,
    phase: "sensemaking",
    query: "Inspect one exact onboarding witness.",
    workingContext: protectedContext,
    characterBudget: 4_000,
    evidencePolicy: "required",
    requestedNodeIds: [targetedAssetNodeId],
    contextProfile: "protected-atlas:targeted",
  });
  const targetedFactNodeId = graph.nodes.find((node) => node.kind === "fact" && node.packetId === atlasPacket.id)!.id;
  const factTargeted = buildCanvasV2DiscoveryWorkingSet({
    graph,
    phase: "sensemaking",
    query: "Inspect the calculated journey count and its provenance.",
    characterBudget: 4_000,
    evidencePolicy: "required",
    requestedNodeIds: [targetedFactNodeId],
    contextProfile: "protected-atlas:fact-targeted",
  });

  assert.ok(workingSet.receipt.estimatedCharacters < 30_000);
  assert.ok(JSON.stringify(modelContext).length < 80_000);
  assert.ok(
    JSON.stringify(modelContext).length <= modelContext.receipt.modelCharacterBudget,
    JSON.stringify({
      actual: JSON.stringify(modelContext).length,
      budget: modelContext.receipt.modelCharacterBudget,
      required: modelContext.requiredNodes.length,
      mandatoryKinds: Object.fromEntries(Array.from(new Set(modelContext.requiredNodes.map((node) => node.kind))).map((kind) => [kind, modelContext.requiredNodes.filter((node) => node.kind === kind).length])),
    }),
  );
  assert.equal(modelContext.receipt.modelContextCharacters, JSON.stringify(modelContext).length);
  assert.ok(workingSet.receipt.omittedAvailableNodeCount > 80);
  assert.ok(workingSet.receipt.mandatoryNodeIds.length < 12);
  assert.ok(workingSet.nodes.some((node) => node.canvasNodeId === "comparison-heading"));
  assert.equal(workingSet.receipt.qualityChecks.selectedObjectsPreserved, true);
  assert.equal(workingSet.receipt.qualityChecks.humanEditsPreserved, true);
  assert.equal(
    workingSet.receipt.mandatoryNodeIds.some((nodeId) => graph.nodes.find((node) => node.id === nodeId)?.canvasNodeId?.startsWith("atlas-screen-")),
    false,
  );
  assert.ok(targeted.receipt.mandatoryNodeIds.includes(targetedAssetNodeId));
  assert.ok(targeted.nodes.filter((node) => node.canvasNodeId?.startsWith("atlas-screen-")).length <= 1);
  assert.ok(factTargeted.receipt.mandatoryNodeIds.includes(targetedFactNodeId));
  assert.ok(factTargeted.receipt.mandatoryNodeIds.filter((nodeId) => graph.nodes.find((node) => node.id === nodeId)?.kind === "asset").length <= 2);
});

test("a reasoning step can expand one named omission without replaying the complete graph", () => {
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "progressive",
    updatedAt: timestamp,
    document,
    evidencePackets: Array.from({ length: 90 }, (_, index) => packet({ id: `signal-${index}`, label: `Signal ${index}`, value: `Value ${index}` })),
  });
  const first = buildCanvasV2DiscoveryWorkingSet({
    graph,
    phase: "sensemaking",
    query: "Understand signal 0",
    characterBudget: 4_000,
    evidencePolicy: "required",
  });
  const requestedNodeId = first.onDemand.availableNodeIds.find((nodeId) => graph.nodes.find((node) => node.id === nodeId)?.kind === "fact")
    ?? first.onDemand.availableNodeIds[0];
  assert.ok(requestedNodeId);
  const expanded = expandCanvasV2DiscoveryWorkingSet({ graph, previous: first, requestedNodeIds: [requestedNodeId!] });
  assert.ok(expanded.receipt.includedNodeIds.includes(requestedNodeId!));
  assert.ok(expanded.receipt.reasonByNodeId[requestedNodeId!]?.includes("targeted on-demand expansion"));
  assert.ok(expanded.nodes.length < graph.nodes.length / 2);
});

test("the shared runtime sends unchanged discovery memory as stable references and hydrates one exact record on demand", () => {
  const packets = Array.from({ length: 100 }, (_, index) => packet({
    id: `runtime-${index}`,
    label: index === 0 ? "Publisher activation" : `Archived runtime signal ${index}`,
    value: `Value ${index}`,
  }));
  const firstRevision = createCanvasV2CommittedRevision({
    id: "runtime-1",
    document,
    evidence: packets.flatMap((item) => item.assets),
    evidencePackets: packets,
    createdAt: timestamp,
  });
  const continuedRevision = createCanvasV2CommittedRevision({
    id: "runtime-2",
    document,
    evidence: packets.flatMap((item) => item.assets),
    evidencePackets: packets,
    discoveryGraph: firstRevision.discoveryGraph,
    createdAt: "2026-08-26T14:05:00.000Z",
  });
  const initial = buildCanvasV2DiscoveryContextRuntime({
    revision: continuedRevision,
    operation: {
      instruction: "Understand publisher activation",
      phase: "sensemaking",
      evidencePolicy: "required",
      characterBudget: 4_000,
      contextProfile: "test:sensemaking:compact",
    },
  });

  assert.equal(initial.schema, CANVAS_V2_DISCOVERY_CONTEXT_RUNTIME);
  assert.ok(initial.modelContext.stableReferences.length > 0);
  assert.equal(initial.receipt.modelContextCharacters, JSON.stringify(initial.modelContext).length);
  assert.ok(initial.receipt.modelContextCharacters < initial.receipt.fullGraphCharacters);
  assert.ok(initial.modelContext.receipt.fullNodeCount < initial.workingSet.nodes.length);
  const requestedNodeId = initial.modelContext.onDemand.availableNodeIds.find((nodeId) => (
    continuedRevision.discoveryGraph?.nodes.find((node) => node.id === nodeId)?.kind === "fact"
  )) ?? initial.modelContext.stableReferences[0]?.id;
  assert.ok(requestedNodeId);

  const expanded = buildCanvasV2DiscoveryContextRuntime({
    revision: continuedRevision,
    operation: {
      instruction: "Understand publisher activation",
      phase: "sensemaking",
      evidencePolicy: "required",
      characterBudget: 4_000,
      contextProfile: "test:sensemaking:expanded",
      previousDiscoveryWorkingSet: initial.workingSet,
      requestedDiscoveryNodeIds: [requestedNodeId!],
    },
  });
  const hydrated = [...expanded.modelContext.delta.nodes, ...expanded.modelContext.requiredNodes];
  assert.equal(expanded.receipt.expansionApplied, true);
  assert.ok(hydrated.some((node) => node.id === requestedNodeId));
  assert.ok(expanded.receipt.selectedCharacters < expanded.receipt.fullGraphCharacters / 4);
  assert.ok(expanded.receipt.assemblyDurationMs < 1_000);
});

test("an evidence-free composition receives human state but no unrelated account evidence", () => {
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "creative",
    updatedAt: timestamp,
    document,
    evidencePackets: [packet({ id: "crm", label: "Pipeline", value: "$120k" })],
  });
  const workingSet = buildCanvasV2DiscoveryWorkingSet({
    graph,
    phase: "composition",
    query: "Write a playful launch poster using only the words in my selected heading.",
    workingContext: context(),
    evidencePolicy: "exclude",
  });
  assert.ok(workingSet.nodes.some((node) => node.kind === "human-edit"));
  assert.equal(workingSet.nodes.some((node) => ["source", "packet", "asset", "fact", "metric", "limitation"].includes(node.kind)), false);
  assert.deepEqual(workingSet.evidenceIndex.sources, []);
  assert.deepEqual(workingSet.evidenceIndex.packets, []);
  assert.equal(workingSet.evidenceIndex.activeClaimCount, 0);
});

test("unchanged working sets are reused without changing their quality receipt", () => {
  clearCanvasV2DiscoveryWorkingSetCache();
  const graph = syncCanvasV2DiscoveryGraph({ revisionId: "cache", updatedAt: timestamp, document, evidencePackets: [packet({ id: "marketing", label: "Engagement", value: "4.2%" })] });
  const input = { graph, phase: "sensemaking" as const, query: "Interpret engagement", evidencePolicy: "required" as const };
  const first = buildCanvasV2DiscoveryWorkingSet(input);
  const second = buildCanvasV2DiscoveryWorkingSet(input);
  assert.equal(first.receipt.cacheStatus, "miss");
  assert.equal(second.receipt.cacheStatus, "hit");
  assert.deepEqual(second.receipt.includedNodeIds, first.receipt.includedNodeIds);
  assert.deepEqual(second.receipt.qualityChecks, first.receipt.qualityChecks);
});

test("working-set cache keys separate incompatible model context profiles", () => {
  clearCanvasV2DiscoveryWorkingSetCache();
  const graph = syncCanvasV2DiscoveryGraph({ revisionId: "profile-cache", updatedAt: timestamp, document, evidencePackets: [packet({ id: "marketing", label: "Engagement", value: "4.2%" })] });
  const compact = buildCanvasV2DiscoveryWorkingSet({ graph, phase: "sensemaking", query: "Interpret engagement", evidencePolicy: "required", contextProfile: "director:compact" });
  const compactAgain = buildCanvasV2DiscoveryWorkingSet({ graph, phase: "sensemaking", query: "Interpret engagement", evidencePolicy: "required", contextProfile: "director:compact" });
  const expandedProfile = buildCanvasV2DiscoveryWorkingSet({ graph, phase: "sensemaking", query: "Interpret engagement", evidencePolicy: "required", contextProfile: "author:expanded" });
  assert.equal(compact.receipt.cacheStatus, "miss");
  assert.equal(compactAgain.receipt.cacheStatus, "hit");
  assert.equal(expandedProfile.receipt.cacheStatus, "miss");
  assert.notEqual(expandedProfile.receipt.cacheKey, compact.receipt.cacheKey);
});

test("working-set cache keys include viewport and selection state", () => {
  clearCanvasV2DiscoveryWorkingSetCache();
  const graph = syncCanvasV2DiscoveryGraph({ revisionId: "viewport-cache", updatedAt: timestamp, document, evidencePackets: [packet({ id: "marketing", label: "Engagement", value: "4.2%" })] });
  const firstContext = context();
  const first = buildCanvasV2DiscoveryWorkingSet({ graph, phase: "revision", query: "Refine the visible analysis", evidencePolicy: "required", workingContext: firstContext });
  const second = buildCanvasV2DiscoveryWorkingSet({ graph, phase: "revision", query: "Refine the visible analysis", evidencePolicy: "required", workingContext: { ...firstContext, visibleBounds: { ...firstContext.visibleBounds, x: 8_000 } } });
  assert.equal(first.receipt.cacheStatus, "miss");
  assert.equal(second.receipt.cacheStatus, "miss");
  assert.notEqual(second.receipt.cacheKey, first.receipt.cacheKey);
});

test("production and deterministic design routes invoke the shared discovery context runtime", () => {
  const productionRoute = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const deterministicRoute = readFileSync("app/canvas-v2-e2e/design/route.ts", "utf8");
  assert.match(productionRoute, /buildCanvasV2BoundedModelContext\(/);
  assert.match(productionRoute, /discoveryModelContext: context\.discoveryModelContext/);
  assert.match(deterministicRoute, /buildCanvasV2DiscoveryContextRuntime\(/);
  assert.match(deterministicRoute, /workingContext[\s\S]*phase: workingContext\?\.scope === "selection" \? "revision" : "composition"/);
});

test("delta-first serialization is smaller than the complete bounded working set on continuation", () => {
  const firstGraph = syncCanvasV2DiscoveryGraph({
    revisionId: "delta-1",
    updatedAt: timestamp,
    document,
    evidencePackets: Array.from({ length: 30 }, (_, index) => packet({ id: `delta-${index}`, label: `Discovery fact ${index}`, value: `Value ${index}` })),
  });
  const nextGraph = syncCanvasV2DiscoveryGraph({
    previous: firstGraph,
    revisionId: "delta-2",
    updatedAt: "2026-08-26T14:10:00.000Z",
    document,
    evidencePackets: Array.from({ length: 30 }, (_, index) => packet({ id: `delta-${index}`, label: `Discovery fact ${index}`, value: `Value ${index}` })),
  });
  const workingSet = buildCanvasV2DiscoveryWorkingSet({
    graph: nextGraph,
    phase: "composition",
    query: "Compose the discovery findings",
    evidencePolicy: "required",
    characterBudget: 12_000,
  });
  const deltaContext = buildCanvasV2DeltaFirstDiscoveryContext(workingSet);
  assert.ok(deltaContext.stableReferences.length > 0);
  assert.ok(JSON.stringify(deltaContext).length < JSON.stringify(workingSet).length);
});

test("unchanged node payloads are reused across a new revision without reusing stale deltas", () => {
  clearCanvasV2DiscoveryWorkingSetCache();
  const firstGraph = syncCanvasV2DiscoveryGraph({ revisionId: "payload-cache-1", updatedAt: timestamp, document, evidencePackets: [packet({ id: "marketing", label: "Engagement", value: "4.2%" })] });
  const first = buildCanvasV2DiscoveryWorkingSet({ graph: firstGraph, phase: "sensemaking", query: "Interpret engagement", evidencePolicy: "required" });
  const secondGraph = syncCanvasV2DiscoveryGraph({ previous: firstGraph, revisionId: "payload-cache-2", updatedAt: "2026-08-26T14:05:00.000Z", document, evidencePackets: [packet({ id: "marketing", label: "Engagement", value: "4.2%" })] });
  const second = buildCanvasV2DiscoveryWorkingSet({ graph: secondGraph, phase: "sensemaking", query: "Interpret engagement", evidencePolicy: "required" });
  assert.equal(first.receipt.cacheStatus, "miss");
  assert.equal(second.receipt.cacheStatus, "miss");
  assert.ok(second.receipt.payloadCacheHitCount > 0);
  assert.equal(second.graphRevisionId, "payload-cache-2");
});

test("large source context keeps a selected object in the middle instead of arbitrary head-tail truncation", () => {
  const middle = '<article data-canvas-v2-node-id="middle-decision" data-canvas-v2-user-edited="text" data-canvas-v2-edit-version="2">Human middle decision</article>';
  const largeDocument = {
    html: `<main data-canvas-v2-node-id="canvas">${"<section data-canvas-v2-node-id=\"before filler\">Before</section>".repeat(900)}${middle}${"<section data-canvas-v2-node-id=\"after filler\">After</section>".repeat(900)}</main>`,
    css: "",
  };
  const revision = createCanvasV2CommittedRevision({ id: "large-source", document: largeDocument, evidence: [], createdAt: timestamp });
  const selectedContext = context();
  selectedContext.selectedNodeIds = ["middle-decision"];
  selectedContext.editableNodeIds = ["middle-decision"];
  selectedContext.visibleNodeIds = ["middle-decision"];
  selectedContext.nearbyNodeIds = ["middle-decision"];
  selectedContext.protectedNodeIds = [];
  selectedContext.objects = [{ ...selectedContext.objects[0]!, nodeId: "middle-decision", textPreview: "Human middle decision" }];
  const modelContext = buildCanvasV2BoundedModelContext(revision, observation(revision.id), selectedContext, {
    instruction: "Rewrite my selected middle decision",
    phase: "revision",
    evidencePolicy: "exclude",
  });
  assert.match(modelContext.source.htmlOutline, /data-canvas-v2-node-id="middle-decision"/);
  assert.match(modelContext.source.htmlOutline, /Human middle decision/);
  assert.match(modelContext.source.htmlOutline, /mode="relevance-first"/);
  assert.ok(modelContext.source.htmlOutline.length <= 42_000);
});

test("revision history restores discovery memory atomically with visible canvas truth", () => {
  const firstPacket = packet({ id: "crm", label: "Pipeline", value: "$120k" });
  const initial = createCanvasV2CommittedRevision({ id: "initial", document, evidence: [], createdAt: timestamp });
  const candidate = createCanvasV2CandidateRevision({
    id: "grounded",
    parent: initial,
    document,
    evidence: firstPacket.assets,
    evidencePackets: [firstPacket],
    createdAt: "2026-08-26T15:00:00.000Z",
  });
  const grounded = commitCanvasV2Candidate({ candidate, expectedParentId: initial.id });
  let history = createCanvasV2TransactionalHistory(initial);
  history = commitCanvasV2HistoryTransaction({ history, revision: grounded, transactionId: "northstar:ground" });
  assert.ok(history.revisions[history.index]?.discoveryGraph?.nodes.some((node) => node.semanticKey === "fact:pipeline"));

  history = travelCanvasV2History(history, -1);
  assert.equal(history.revisions[history.index]?.discoveryGraph?.nodes.some((node) => node.semanticKey === "fact:pipeline"), false);
  history = travelCanvasV2History(history, 1);
  assert.ok(history.revisions[history.index]?.discoveryGraph?.nodes.some((node) => node.semanticKey === "fact:pipeline"));
});
