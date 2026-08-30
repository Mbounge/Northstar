import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppDataApp, AppDataCatalog } from "@/lib/app-data/canvas-v2-catalog";
import type {
  CanvasV2EvidenceDomain,
  CanvasV2EvidenceProvider,
  CanvasV2EvidenceProviderRequest,
  CanvasV2EvidenceProviderResult,
} from "@/lib/canvas-v2/evidence-bridge";
import {
  CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  type CanvasV2EvidenceAsset,
  type CanvasV2EvidenceFact,
  type CanvasV2EvidenceMetric,
  type CanvasV2EvidencePacket,
  type CanvasV2EvidenceSource,
} from "@/lib/canvas-v2/types";

type UnknownRecord = Record<string, unknown>;

const PROVIDER = {
  id: "northstar-account-intelligence",
  label: "North Star account intelligence",
  domains: ["marketing", "business", "mixed"] as CanvasV2EvidenceDomain[],
  kinds: ["marketing-signal", "business-record", "metric", "image"] as CanvasV2EvidencePacket["kind"][],
};

const DEFAULT_FRESHNESS_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 256;
const rawPayloadCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
const snapshotIdCache = new Map<string, { expiresAt: number; value: Promise<string[]> }>();
const runtimeObjectIds = new WeakMap<object, number>();
let nextRuntimeObjectId = 1;

function runtimeObjectId(value: object): number {
  const current = runtimeObjectIds.get(value);
  if (current) return current;
  const id = nextRuntimeObjectId++;
  runtimeObjectIds.set(value, id);
  return id;
}

export function clearCanvasV2AccountEvidenceProviderCache(): void {
  rawPayloadCache.clear();
  snapshotIdCache.clear();
}

function setFreshCacheValue<T>(
  cache: Map<string, { expiresAt: number; value: Promise<T> }>,
  key: string,
  entry: { expiresAt: number; value: Promise<T> },
  now: number,
): void {
  for (const [candidateKey, candidate] of cache) {
    if (candidate.expiresAt <= now) cache.delete(candidateKey);
  }
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
  }
  cache.set(key, entry);
}

function record(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(record) : [];
}

function text(value: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function token(value: string): string {
  return encodeURIComponent(normalize(value).replaceAll(" ", "-"));
}

const RELEVANCE_STOP_WORDS = new Set([
  "about", "after", "again", "alongside", "available", "build", "canvas", "compare", "create",
  "evidence", "from", "into", "northstar", "review", "show", "their", "these", "this", "those",
  "using", "what", "where", "which", "with", "would",
]);

function relevanceTerms(value: string): string[] {
  return Array.from(new Set(normalize(value).split(" ")
    .filter((term) => term.length > 3 && !RELEVANCE_STOP_WORDS.has(term))));
}

function relevanceScore(value: unknown, terms: readonly string[]): number {
  if (!terms.length) return 0;
  let source = "";
  try {
    source = normalize(typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    return 0;
  }
  return terms.reduce((score, term) => score + (source.includes(term) ? 1 : 0), 0);
}

function relevantRecords<T extends UnknownRecord>(items: readonly T[], instruction: string, limit: number): Array<{ item: T; sourceIndex: number }> {
  const terms = relevanceTerms(instruction);
  return items
    .map((item, sourceIndex) => ({ item, sourceIndex, score: relevanceScore(item, terms) }))
    .sort((left, right) => right.score - left.score || left.sourceIndex - right.sourceIndex)
    .slice(0, limit)
    .map(({ item, sourceIndex }) => ({ item, sourceIndex }));
}

function appForTarget(catalog: AppDataCatalog, target: string): AppDataApp | undefined {
  const name = normalize(target);
  return catalog.apps.find((app) => normalize(app.name) === name)
    ?? catalog.apps.find((app) => normalize(app.name).includes(name) || name.includes(normalize(app.name)));
}

function source(input: {
  tenantId: string;
  app: AppDataApp;
  snapshotId?: string;
  sourceType: CanvasV2EvidenceSource["sourceType"];
  sourceId: string;
  label: string;
  sourceUrl?: string;
  query: string;
}): CanvasV2EvidenceSource {
  return {
    providerId: PROVIDER.id,
    providerLabel: PROVIDER.label,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    label: input.label,
    tenantId: input.tenantId,
    sourceUrl: input.sourceUrl,
    retrievedAt: new Date().toISOString(),
    capturedAt: input.snapshotId ?? input.app.lastScan,
    query: input.query,
    filters: input.snapshotId ? { snapshotId: input.snapshotId, app: input.app.name } : { app: input.app.name },
    permission: "authorized",
    freshness: input.snapshotId || input.app.lastScan ? "current-snapshot" : "unknown",
  };
}

function metric(input: {
  packetId: string;
  label: string;
  value?: string;
  definition: string;
  sourceAssetIds?: string[];
}): CanvasV2EvidenceMetric | undefined {
  if (!input.value || input.value === "?") return undefined;
  return {
    id: `${input.packetId}:metric:${token(input.label)}`,
    label: input.label,
    value: input.value,
    format: "text",
    definition: input.definition,
    authority: "observed",
    sourceAssetIds: input.sourceAssetIds,
  };
}

function publicDataUrl(tenantId: string, appName: string, snapshotId: string, path: string): string | undefined {
  const root = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!root) return undefined;
  return `${root}/storage/v1/object/public/data/${encodeURIComponent(tenantId)}/${encodeURIComponent(appName.toLowerCase())}/snapshots/${encodeURIComponent(snapshotId)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function absoluteAssetUrl(tenantId: string, appName: string, snapshotId: string, folder: string, value?: string): string | undefined {
  if (!value) return undefined;
  if (/^(?:https?:|data:image\/)/i.test(value)) return value;
  const file = value.split("/").pop();
  return file ? publicDataUrl(tenantId, appName, snapshotId, `${folder}/${file}`) : undefined;
}

async function json(fetcher: typeof fetch, url: string | undefined, freshnessTtlMs: number): Promise<unknown> {
  if (!url) return undefined;
  const key = `${runtimeObjectId(fetcher)}:${url}`;
  const now = Date.now();
  const cached = rawPayloadCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = (async () => {
    try {
      const response = await fetcher(url, { cache: "no-store" });
      return response.ok ? await response.json() : undefined;
    } catch {
      return undefined;
    }
  })();
  setFreshCacheValue(rawPayloadCache, key, { expiresAt: now + freshnessTtlMs, value }, now);
  return value;
}

async function snapshotIds(supabase: SupabaseClient, cacheScope: string, tenantId: string, appName: string, freshnessTtlMs: number): Promise<string[]> {
  const key = `${cacheScope}:${tenantId}:${normalize(appName)}`;
  const now = Date.now();
  const cached = snapshotIdCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = (async () => {
    const { data } = await supabase
      .from("app_snapshots")
      .select("snapshot_id")
      .eq("tenant_id", tenantId)
      .ilike("app_name", appName)
      .order("snapshot_id", { ascending: false })
      .limit(100);
    return records(data).flatMap((row) => text(row, ["snapshot_id"]) ?? []);
  })();
  setFreshCacheValue(snapshotIdCache, key, { expiresAt: now + freshnessTtlMs, value }, now);
  return value;
}

async function firstSnapshotPacket<T>(
  snapshotIds: readonly string[],
  load: (snapshotId: string) => Promise<T | undefined>,
): Promise<T | undefined> {
  // Product, marketing, and business captures may be written as separate
  // snapshots. Probe small newest-first batches so a product-only latest
  // snapshot cannot hide older authorized account intelligence, while keeping
  // the lookup latency bounded when several recent snapshots are sparse.
  for (let index = 0; index < snapshotIds.length; index += 4) {
    const batch = await Promise.all(snapshotIds.slice(index, index + 4).map(load));
    const packet = batch.find((candidate) => candidate !== undefined);
    if (packet !== undefined) return packet;
  }
}

function marketingPacket(input: { app: AppDataApp; tenantId: string; snapshotId: string; instruction: string; raw: unknown; limit?: number }): CanvasV2EvidencePacket | undefined {
  const posts = Array.isArray(input.raw) ? records(input.raw) : record(input.raw) ? records(input.raw.posts) : [];
  if (!posts.length) return undefined;
  const selectedPosts = relevantRecords(posts, input.instruction, Math.min(Math.max(input.limit ?? 12, 1), 12));
  const packetId = `packet:marketing:${input.app.id}:${token(input.snapshotId)}`;
  const feedUrl = publicDataUrl(input.tenantId, input.app.name, input.snapshotId, "marketing/master_feed.json");
  const packetSource = source({ tenantId: input.tenantId, app: input.app, snapshotId: input.snapshotId, sourceType: "marketing-feed", sourceId: `${input.app.id}:marketing:${input.snapshotId}`, label: `${input.app.name} marketing feed`, sourceUrl: feedUrl, query: input.instruction });
  const assets: CanvasV2EvidenceAsset[] = selectedPosts.flatMap(({ item: post, sourceIndex }) => {
    const screenshot = absoluteAssetUrl(input.tenantId, input.app.name, input.snapshotId, "marketing/screenshots", text(post, ["screenshot", "image", "image_url"]));
    return screenshot ? [{ id: `${packetId}:post:${sourceIndex}`, url: screenshot, label: `${text(post, ["platform"]) ?? "Marketing"} post ${sourceIndex + 1}`, app: input.app.name, description: text(post, ["post_text", "raw_text", "caption", "summary"])?.slice(0, 280), kind: "marketing-signal", authority: "observed", packetId, source: packetSource, sequenceIndex: sourceIndex, capturedAt: text(post, ["timestamp", "post_date"]) }] : [];
  });
  const assetBySourceIndex = new Map(assets.map((asset) => [asset.sequenceIndex, asset] as const));
  const facts: CanvasV2EvidenceFact[] = selectedPosts.flatMap(({ item: post, sourceIndex }) => {
    const meta = record(post.meta) ? post.meta : {};
    const body = text(post, ["post_text", "raw_text", "caption"]);
    const sourceAsset = assetBySourceIndex.get(sourceIndex);
    return [
      ...(body ? [{ id: `${packetId}:post:${sourceIndex}:text`, label: `${text(post, ["platform"]) ?? "Marketing"} post`, value: body.slice(0, 700), authority: "observed" as const, sourceAssetIds: sourceAsset ? [sourceAsset.id] : undefined }] : []),
      ...(text(meta, ["sentiment"]) ? [{ id: `${packetId}:post:${sourceIndex}:sentiment`, label: "Captured sentiment label", value: text(meta, ["sentiment"])!, authority: "observed" as const, description: "Label supplied by the connected marketing dataset; not independently inferred by Canvas." }] : []),
      ...(text(meta, ["category", "summary"]) ? [{ id: `${packetId}:post:${sourceIndex}:category`, label: "Captured marketing category", value: text(meta, ["category", "summary"])!, authority: "observed" as const }] : []),
    ];
  });
  return { schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA, id: packetId, kind: "marketing-signal", title: `${input.app.name} marketing signals`, summary: `${posts.length} connected marketing records from snapshot ${input.snapshotId}.`, authority: "observed", source: packetSource, assets, facts, metrics: [{ id: `${packetId}:record-count`, label: "Marketing records in snapshot", value: posts.length, format: "number", definition: "Count of records in the connected marketing feed snapshot.", authority: "calculated", timeRange: { label: input.snapshotId }, sourceAssetIds: assets.map((asset) => asset.id) }], limitations: ["Post content and dataset labels are observed records. They do not establish campaign performance, audience causality, or market-wide sentiment without corresponding measurement data."], tags: [input.app.name, "marketing", "snapshot"], createdAt: packetSource.retrievedAt, appId: input.app.id, appName: input.app.name, continuationKey: `marketing:${input.app.id}` };
}

function businessPacket(input: { app: AppDataApp; tenantId: string; snapshotId: string; instruction: string; manifest: unknown; roster: unknown }): CanvasV2EvidencePacket | undefined {
  const manifest = record(input.manifest) ? input.manifest : {};
  const jobs = records(manifest.jobs);
  const pages = records(manifest.pages);
  const people = records(input.roster);
  if (!jobs.length && !pages.length && !people.length) return undefined;
  const packetId = `packet:business:${input.app.id}:${token(input.snapshotId)}`;
  const manifestUrl = publicDataUrl(input.tenantId, input.app.name, input.snapshotId, "business/master_manifest.json");
  const packetSource = source({ tenantId: input.tenantId, app: input.app, snapshotId: input.snapshotId, sourceType: "business-manifest", sourceId: `${input.app.id}:business:${input.snapshotId}`, label: `${input.app.name} business manifest`, sourceUrl: manifestUrl, query: input.instruction });
  const screenshotRecords = [...pages, ...jobs].flatMap((entry) => records(entry.screenshots).length ? records(entry.screenshots).map((item) => text(item, ["path", "url", "name"])) : Array.isArray(entry.screenshots) ? entry.screenshots.filter((value): value is string => typeof value === "string") : []);
  const assets = screenshotRecords.slice(0, 16).flatMap((value, index) => {
    const url = absoluteAssetUrl(input.tenantId, input.app.name, input.snapshotId, "business/screenshots", value);
    return url ? [{ id: `${packetId}:capture:${index}`, url, label: `${input.app.name} business capture ${index + 1}`, app: input.app.name, kind: "image" as const, authority: "observed" as const, packetId, source: packetSource, sequenceIndex: index }] : [];
  });
  const facts: CanvasV2EvidenceFact[] = [
    ...jobs.slice(0, 20).map((job, index) => ({ id: `${packetId}:job:${index}`, label: "Open role", value: text(job, ["title", "name"]) ?? `Role ${index + 1}`, authority: "observed" as const, description: text(job, ["url", "summary"]) })),
    ...people.slice(0, 20).map((person, index) => ({ id: `${packetId}:person:${index}`, label: "Identified person", value: [text(person, ["name"]), text(person, ["role", "title"])].filter(Boolean).join(" · "), authority: "observed" as const })),
  ];
  return { schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA, id: packetId, kind: "business-record", title: `${input.app.name} business signals`, summary: `${jobs.length} roles, ${people.length} people, and ${pages.length} captured business pages from snapshot ${input.snapshotId}.`, authority: "observed", source: packetSource, assets, facts, metrics: [{ id: `${packetId}:jobs`, label: "Captured open roles", value: jobs.length, format: "number", definition: "Count of job records in the connected business manifest snapshot.", authority: "calculated", timeRange: { label: input.snapshotId } }, { id: `${packetId}:people`, label: "Identified people", value: people.length, format: "number", definition: "Count of people records in the connected roster snapshot.", authority: "calculated", timeRange: { label: input.snapshotId } }], limitations: ["Hiring and roster records are point-in-time business signals. They do not independently prove company strategy, budget, performance, or organizational intent."], tags: [input.app.name, "business", "snapshot"], createdAt: packetSource.retrievedAt, appId: input.app.id, appName: input.app.name, continuationKey: `business:${input.app.id}` };
}

function catalogBusinessPacket(input: { app: AppDataApp; tenantId: string; instruction: string }): CanvasV2EvidencePacket | undefined {
  const values = [input.app.category, input.app.description, input.app.rank, input.app.revenue, input.app.employees];
  if (!values.some((value) => Boolean(value && value !== "?"))) return undefined;
  const packetId = `packet:business:${input.app.id}:account-record`;
  const packetSource = source({
    tenantId: input.tenantId,
    app: input.app,
    sourceType: "account-app",
    sourceId: `${input.app.id}:account-record`,
    label: `${input.app.name} connected account record`,
    query: input.instruction,
  });
  const facts: CanvasV2EvidenceFact[] = [
    input.app.category ? { id: `${packetId}:category`, label: "Account category", value: input.app.category, authority: "observed" } : undefined,
    input.app.description ? { id: `${packetId}:description`, label: "Account description", value: input.app.description, authority: "observed" } : undefined,
  ].filter((fact): fact is CanvasV2EvidenceFact => Boolean(fact));
  const metrics = [
    metric({ packetId, label: "Recorded rank", value: input.app.rank, definition: "Descriptive rank value stored on the connected account record; its market, period, and methodology are not supplied unless separately stated." }),
    metric({ packetId, label: "Recorded revenue", value: input.app.revenue, definition: "Descriptive revenue value stored on the connected account record; it is not treated as a live financial metric without an explicit period and unit definition." }),
    metric({ packetId, label: "Recorded employees", value: input.app.employees, definition: "Descriptive employee value stored on the connected account record; it is point-in-time metadata rather than a live headcount." }),
  ].filter((item): item is CanvasV2EvidenceMetric => Boolean(item));
  return {
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id: packetId,
    kind: "business-record",
    title: `${input.app.name} connected business record`,
    summary: "Authorized business metadata already attached to this account app.",
    authority: "observed",
    source: packetSource,
    assets: [],
    facts,
    metrics,
    limitations: ["These are connected account descriptors. They do not independently establish current performance, strategy, causality, or market-wide truth."],
    tags: [input.app.name, "business", "account-record"],
    createdAt: packetSource.retrievedAt,
    appId: input.app.id,
    appName: input.app.name,
    continuationKey: `business:${input.app.id}`,
  };
}

export function canvasV2EvidenceDomainsForInstruction(instruction: string): CanvasV2EvidenceDomain[] {
  const marketing = /\b(marketing|campaign|social|content|brand|creative|audience|post|messaging|positioning)\b/i.test(instruction);
  const business = /\b(business|company|revenue|rank|employee|team|hiring|job|organization|commercial|market|sales|strategy)\b/i.test(instruction);
  const product = canvasV2ProductEvidenceRequestedForInstruction(instruction);
  if ([marketing, business, product].filter(Boolean).length > 1) return ["mixed"];
  if (marketing) return ["marketing"];
  if (business) return ["business"];
  return ["product"];
}

export function canvasV2ProductEvidenceRequestedForInstruction(instruction: string): boolean {
  if (/\b(apps?|products?|screens?|screenshots?|flows?|journeys?|onboarding|browsing|mobile|web|experiences?|interfaces?)\b/i.test(instruction)) return true;
  // Product is the safe historical default for an otherwise unclassified
  // discovery request. Opt out only when the person has explicitly scoped the
  // turn to account-level marketing/business intelligence.
  return !/\b(marketing|campaign|social|content|brand|creative|audience|post|messaging|positioning|business|company|revenue|rank|employee|team|hiring|job|organization|commercial|market|sales|strategy)\b/i.test(instruction);
}

export function createCanvasV2AccountEvidenceProvider(input: {
  supabase: SupabaseClient;
  tenantId: string;
  catalog: AppDataCatalog;
  fetcher?: typeof fetch;
  freshnessTtlMs?: number;
  /** Stable authorized backend identity. Supply this to reuse snapshot lookups across request-scoped clients. */
  snapshotCacheScope?: string;
}): CanvasV2EvidenceProvider {
  return {
    descriptor: PROVIDER,
    async retrieve(request: CanvasV2EvidenceProviderRequest): Promise<CanvasV2EvidenceProviderResult> {
      const fetcher = input.fetcher ?? fetch;
      const freshnessTtlMs = Math.max(1_000, input.freshnessTtlMs ?? DEFAULT_FRESHNESS_TTL_MS);
      const snapshotCacheScope = input.snapshotCacheScope ?? `client:${runtimeObjectId(input.supabase)}`;
      const packets: CanvasV2EvidencePacket[] = [];
      const issues: CanvasV2EvidenceProviderResult["issues"] = [];
      const targets = request.targetNames.length ? request.targetNames : input.catalog.apps.slice(0, 6).map((app) => app.name);
      // Research targets can contain both an app name and one of its flow names.
      // Account intelligence is app-scoped, so silently ignore unmatched flow
      // labels once at least one authorized app target has resolved. Treating a
      // flow label as a missing account app produced a false warning beside valid
      // Awin research and encouraged the model to author an irrelevant boundary.
      const matchedApps = Array.from(new Map(targets.slice(0, 12)
        .flatMap((target) => {
          const app = appForTarget(input.catalog, target);
          return app ? [[app.id, app] as const] : [];
        })).values());
      if (!matchedApps.length && targets.length) {
        issues.push({ code: "unavailable", message: `No authorized account app matching ${targets[0]} is available.`, targetName: targets[0] });
      }
      for (const app of matchedApps) {
        if (!request.domains.some((domain) => domain === "marketing" || domain === "business" || domain === "mixed")) continue;
        const availableSnapshotIds = await snapshotIds(input.supabase, snapshotCacheScope, input.tenantId, app.name, freshnessTtlMs);
        if (!availableSnapshotIds.length) {
          const accountRecord = (request.domains.includes("business") || request.domains.includes("mixed"))
            ? catalogBusinessPacket({ app, tenantId: input.tenantId, instruction: request.instruction })
            : undefined;
          if (accountRecord) packets.push(accountRecord);
          if (request.domains.includes("marketing") || (request.domains.includes("business") && !accountRecord) || request.domains.includes("mixed")) {
            const message = request.domains.includes("marketing") || request.domains.includes("mixed")
              ? `${app.name} has no authorized marketing snapshot.`
              : `${app.name} has no authorized business snapshot or connected account record.`;
            issues.push({ code: "unavailable", message, targetName: app.name });
          }
          continue;
        }
        const domainTasks: Promise<void>[] = [];
        if (request.domains.includes("marketing") || request.domains.includes("mixed")) {
          domainTasks.push((async () => {
            const packet = await firstSnapshotPacket(availableSnapshotIds, async (snapshotId) => {
              const raw = await json(fetcher, publicDataUrl(input.tenantId, app.name, snapshotId, "marketing/master_feed.json"), freshnessTtlMs);
              return marketingPacket({ app, tenantId: input.tenantId, snapshotId, instruction: request.instruction, raw, limit: request.limit });
            });
            if (packet) packets.push(packet);
            else issues.push({ code: "unavailable", message: `${app.name} has no authorized marketing feed in its available snapshots.`, targetName: app.name });
          })());
        }
        if (request.domains.includes("business") || request.domains.includes("mixed")) {
          domainTasks.push((async () => {
            const packet = await firstSnapshotPacket(availableSnapshotIds, async (snapshotId) => {
              const [manifest, roster] = await Promise.all([
                json(fetcher, publicDataUrl(input.tenantId, app.name, snapshotId, "business/master_manifest.json"), freshnessTtlMs),
                json(fetcher, publicDataUrl(input.tenantId, app.name, snapshotId, `business/${app.name.toLowerCase()}_omni_roster.json`), freshnessTtlMs),
              ]);
              return businessPacket({ app, tenantId: input.tenantId, snapshotId, instruction: request.instruction, manifest, roster });
            }) ?? catalogBusinessPacket({ app, tenantId: input.tenantId, instruction: request.instruction });
            if (packet) packets.push(packet);
            else issues.push({ code: "unavailable", message: `${app.name} has no authorized business manifest or roster in its available snapshots.`, targetName: app.name });
          })());
        }
        await Promise.all(domainTasks);
      }
      const appOrder = new Map(matchedApps.map((app, index) => [app.id, index]));
      const kindOrder = new Map<CanvasV2EvidencePacket["kind"], number>([
        ["marketing-signal", 0],
        ["business-record", 1],
        ["metric", 2],
        ["image", 3],
      ]);
      packets.sort((left, right) => (
        (appOrder.get(left.appId ?? "") ?? Number.MAX_SAFE_INTEGER) - (appOrder.get(right.appId ?? "") ?? Number.MAX_SAFE_INTEGER)
        || (kindOrder.get(left.kind) ?? 99) - (kindOrder.get(right.kind) ?? 99)
        || left.id.localeCompare(right.id)
      ));
      return { provider: PROVIDER, packets, sources: Array.from(new Map(packets.map((packet) => [`${packet.source.providerId}:${packet.source.sourceId}`, packet.source])).values()), issues };
    },
  };
}
