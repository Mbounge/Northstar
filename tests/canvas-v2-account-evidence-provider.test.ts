import assert from "node:assert/strict";
import test from "node:test";

import type { AppDataCatalog } from "../lib/app-data/canvas-v2-catalog";
import {
  canvasV2EvidenceDomainsForInstruction,
  canvasV2ProductEvidenceRequestedForInstruction,
  clearCanvasV2AccountEvidenceProviderCache,
  createCanvasV2AccountEvidenceProvider,
} from "../lib/canvas-v2/account-evidence-provider";

const catalog: AppDataCatalog = {
  tenantId: "tenant-1",
  apps: [{
    id: "app:awin",
    name: "Awin",
    category: "Affiliate marketing",
    description: "Partner growth platform",
    iconUrl: "https://assets.example/awin.png",
    rank: "12",
    revenue: "$100m–$250m",
    employees: "1,200",
    lastScan: "2026-08-25",
    totalScreens: 5,
    flows: [],
  }],
};

function supabase(snapshotIds: string[] = []) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "ilike", "order", "limit"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: snapshotIds.map((snapshot_id) => ({ snapshot_id })), error: null });
  return { from: () => chain } as any;
}

test("discovery domain classification keeps creative product work separate from account business retrieval", () => {
  assert.deepEqual(canvasV2EvidenceDomainsForInstruction("Create a visual metaphor for trust"), ["product"]);
  assert.deepEqual(canvasV2EvidenceDomainsForInstruction("Review Awin's marketing campaign"), ["marketing"]);
  assert.deepEqual(canvasV2EvidenceDomainsForInstruction("Compare the Awin onboarding screenshots with its marketing positioning"), ["mixed"]);
  assert.equal(canvasV2ProductEvidenceRequestedForInstruction("Show Awin marketing and business evidence"), false);
  assert.equal(canvasV2ProductEvidenceRequestedForInstruction("Show Awin screenshots with its marketing positioning"), true);
  assert.equal(canvasV2ProductEvidenceRequestedForInstruction("Compare Awin and Whop"), true);
});

test("missing authorized snapshots return an inspectable issue without throwing or fabricating evidence", async () => {
  const provider = createCanvasV2AccountEvidenceProvider({ supabase: supabase(), tenantId: catalog.tenantId, catalog });
  const result = await provider.retrieve({
    instruction: "Review Awin marketing",
    targetNames: ["Awin"],
    domains: ["marketing"],
  });
  assert.deepEqual(result.packets, []);
  assert.deepEqual(result.issues, [{ code: "unavailable", message: "Awin has no authorized marketing snapshot.", targetName: "Awin" }]);
});

test("connected business metadata remains available to reasoning without requiring a snapshot", async () => {
  const provider = createCanvasV2AccountEvidenceProvider({ supabase: supabase(), tenantId: catalog.tenantId, catalog });
  const result = await provider.retrieve({
    instruction: "Review Awin's business position",
    targetNames: ["Awin"],
    domains: ["business"],
  });
  assert.equal(result.issues.length, 0);
  assert.equal(result.packets.length, 1);
  assert.equal(result.packets[0]?.title, "Awin connected business record");
  assert.deepEqual(result.packets[0]?.facts.map((fact) => fact.value), ["Affiliate marketing", "Partner growth platform"]);
  assert.deepEqual(result.packets[0]?.metrics.map((item) => item.value), ["12", "$100m–$250m", "1,200"]);
  assert.deepEqual(result.packets[0]?.assets, []);
});

test("marketing retrieval ranks prompt-relevant records and keeps fact-to-image provenance exact", async () => {
  const previousRoot = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.example";
  const fetcher = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("marketing/master_feed.json")) return new Response(JSON.stringify([
      { platform: "LinkedIn", post_text: "A generic company update", screenshot: "generic.png" },
      { platform: "LinkedIn", post_text: "Publisher onboarding turns partner traffic into growth", screenshot: "growth.png" },
    ]), { status: 200 });
    return new Response(null, { status: 404 });
  };
  try {
    const provider = createCanvasV2AccountEvidenceProvider({ supabase: supabase(["snapshot-42"]), tenantId: catalog.tenantId, catalog, fetcher: fetcher as typeof fetch });
    const result = await provider.retrieve({ instruction: "Investigate publisher onboarding growth", targetNames: ["Awin"], domains: ["marketing"], limit: 1 });
    const packet = result.packets[0];
    assert.equal(packet?.facts[0]?.value, "Publisher onboarding turns partner traffic into growth");
    assert.equal(packet?.assets[0]?.id, `${packet?.id}:post:1`);
    assert.deepEqual(packet?.facts[0]?.sourceAssetIds, [packet?.assets[0]?.id]);
  } finally {
    if (previousRoot === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousRoot;
  }
});

test("marketing and business snapshots produce multimodal packets with explicit provenance and limitations", async () => {
  const previousRoot = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.example";
  const fetcher = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("marketing/master_feed.json")) return new Response(JSON.stringify([{ platform: "LinkedIn", post_text: "Grow partnerships with confidence", screenshot: "post-1.png", timestamp: "2026-08-20", meta: { sentiment: "positive" } }]), { status: 200 });
    if (url.includes("business/master_manifest.json")) return new Response(JSON.stringify({ jobs: [{ title: "Product Marketing Lead" }], pages: [] }), { status: 200 });
    if (url.includes("business/awin_omni_roster.json")) return new Response(JSON.stringify([{ name: "Ada", role: "CMO" }]), { status: 200 });
    return new Response(null, { status: 404 });
  };
  try {
    const provider = createCanvasV2AccountEvidenceProvider({ supabase: supabase(["snapshot-42"]), tenantId: catalog.tenantId, catalog, fetcher: fetcher as typeof fetch });
    const result = await provider.retrieve({
      instruction: "Compare Awin's marketing and business signals",
      targetNames: ["Awin"],
      domains: ["mixed"],
    });
    assert.deepEqual(result.packets.map((packet) => packet.kind), ["marketing-signal", "business-record"]);
    const marketing = result.packets.find((packet) => packet.kind === "marketing-signal");
    assert.equal(marketing?.assets[0]?.kind, "marketing-signal");
    assert.equal(marketing?.assets[0]?.capturedAt, "2026-08-20");
    assert.equal(marketing?.source.filters?.snapshotId, "snapshot-42");
    assert.match(marketing?.limitations[0] ?? "", /do not establish campaign performance/);
    const business = result.packets.find((packet) => packet.title === "Awin business signals");
    assert.deepEqual(business?.facts.map((fact) => fact.value), ["Product Marketing Lead", "Ada · CMO"]);
    assert.equal(business?.metrics.find((metric) => metric.label === "Captured open roles")?.value, 1);
  } finally {
    if (previousRoot === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousRoot;
  }
});

test("account evidence falls back to the newest snapshot that actually contains the requested domain", async () => {
  const previousRoot = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.example";
  const requested: string[] = [];
  const fetcher = async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("snapshot-new")) return new Response(null, { status: 404 });
    if (url.includes("snapshot-with-data/marketing/master_feed.json")) {
      return new Response(JSON.stringify([{ platform: "LinkedIn", post_text: "Join the network", screenshot: "post.png" }]), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  try {
    const provider = createCanvasV2AccountEvidenceProvider({
      supabase: supabase(["snapshot-new", "snapshot-with-data", "snapshot-old", "snapshot-same-batch", "snapshot-after-match"]),
      tenantId: catalog.tenantId,
      catalog,
      fetcher: fetcher as typeof fetch,
    });
    const result = await provider.retrieve({
      instruction: "Review Awin marketing",
      targetNames: ["Awin", "Publisher & Affiliate Solutions"],
      domains: ["marketing"],
    });
    assert.equal(result.packets.length, 1);
    assert.equal(result.packets[0]?.source.filters?.snapshotId, "snapshot-with-data");
    assert.equal(result.issues.length, 0);
    assert.ok(requested.some((url) => url.includes("snapshot-new")));
    assert.ok(requested.some((url) => url.includes("snapshot-with-data")));
    assert.ok(!requested.some((url) => url.includes("snapshot-after-match")));
  } finally {
    if (previousRoot === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousRoot;
  }
});

test("unchanged authorized payloads and snapshot lookups are reused inside the freshness window", async () => {
  clearCanvasV2AccountEvidenceProviderCache();
  const previousRoot = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.example";
  let snapshotQueries = 0;
  let payloadRequests = 0;
  const snapshotClient = {
    from: () => {
      snapshotQueries += 1;
      return supabase(["snapshot-42"]).from();
    },
  } as any;
  const fetcher = async (input: string | URL | Request) => {
    payloadRequests += 1;
    const url = String(input);
    if (url.includes("marketing/master_feed.json")) {
      return new Response(JSON.stringify([{ platform: "LinkedIn", post_text: "Publisher growth", screenshot: "growth.png" }]), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  try {
    const provider = createCanvasV2AccountEvidenceProvider({
      supabase: snapshotClient,
      tenantId: catalog.tenantId,
      catalog,
      fetcher: fetcher as typeof fetch,
      freshnessTtlMs: 60_000,
    });
    const request = { instruction: "Review Awin marketing", targetNames: ["Awin"], domains: ["marketing" as const] };
    const first = await provider.retrieve(request);
    const second = await provider.retrieve(request);
    assert.equal(first.packets.length, 1);
    assert.equal(second.packets.length, 1);
    assert.equal(snapshotQueries, 1);
    assert.equal(payloadRequests, 1);
  } finally {
    clearCanvasV2AccountEvidenceProviderCache();
    if (previousRoot === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousRoot;
  }
});

test("request-scoped Supabase clients share snapshot lookups only through an explicit authorized cache scope", async () => {
  clearCanvasV2AccountEvidenceProviderCache();
  let snapshotQueries = 0;
  const scopedClient = () => ({
    from: () => {
      snapshotQueries += 1;
      return supabase([]).from();
    },
  }) as any;
  const request = { instruction: "Review Awin marketing", targetNames: ["Awin"], domains: ["marketing" as const] };
  try {
    await createCanvasV2AccountEvidenceProvider({
      supabase: scopedClient(),
      tenantId: catalog.tenantId,
      catalog,
      snapshotCacheScope: "supabase:https://storage.example",
      freshnessTtlMs: 60_000,
    }).retrieve(request);
    await createCanvasV2AccountEvidenceProvider({
      supabase: scopedClient(),
      tenantId: catalog.tenantId,
      catalog,
      snapshotCacheScope: "supabase:https://storage.example",
      freshnessTtlMs: 60_000,
    }).retrieve(request);
    assert.equal(snapshotQueries, 1);
  } finally {
    clearCanvasV2AccountEvidenceProviderCache();
  }
});
