import {
  scoreAppDataText,
  type AppDataApp,
  type AppDataCatalog,
  type AppDataFlow,
  type AppDataScreen,
} from "@/lib/app-data/canvas-v2-catalog";
import {
  CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  type CanvasV2EvidenceAsset,
  type CanvasV2EvidencePacket,
  type CanvasV2EvidenceSource,
} from "@/lib/canvas-v2/types";

export type CanvasV2ResearchOperation = "list-apps" | "list-flows" | "flow-screens" | "search";

export interface CanvasV2ResearchQuery {
  operation: CanvasV2ResearchOperation;
  query?: string;
  appName?: string;
  flowName?: string;
  platform?: "mobile" | "web";
  sessionType?: "onboarding" | "browsing";
  limit?: number;
}

export interface CanvasV2ResearchResult {
  operation: CanvasV2ResearchOperation;
  apps: AppDataApp[];
  flows: AppDataFlow[];
  screens: AppDataScreen[];
  evidence: CanvasV2EvidenceAsset[];
  packets: CanvasV2EvidencePacket[];
  sources: CanvasV2EvidenceSource[];
  issues: Array<{ code: string; message: string; targetName?: string }>;
  detail: string;
}

function now(): string {
  return new Date().toISOString();
}

function sourceForApp(app: AppDataApp, sourceType: CanvasV2EvidenceSource["sourceType"], sourceId: string, label: string): CanvasV2EvidenceSource {
  return {
    providerId: "northstar-account-apps",
    providerLabel: "North Star account data",
    sourceId,
    sourceType,
    label,
    retrievedAt: now(),
    capturedAt: app.lastScan,
    permission: "authorized",
    freshness: app.lastScan ? "current-snapshot" : "unknown",
  };
}

function limit(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.round(value!))) : fallback;
}

function bestApp(catalog: AppDataCatalog, name?: string): AppDataApp | undefined {
  if (!name) return undefined;
  const match = catalog.apps.map((app) => ({ app, score: scoreAppDataText(`${app.name} ${app.category ?? ""}`, name) })).sort((a, b) => b.score - a.score)[0];
  return match && match.score > 0 ? match.app : undefined;
}

function evidenceForScreen(screen: AppDataScreen, packetId?: string, source?: CanvasV2EvidenceSource): CanvasV2EvidenceAsset | undefined {
  return screen.imageUrl ? {
    id: `screen:${screen.id}`,
    url: screen.imageUrl,
    label: screen.name,
    app: screen.appName,
    flow: screen.flowName,
    screen: screen.name,
    description: [screen.platform, screen.sessionType, `Step ${screen.index + 1}`].filter(Boolean).join(" · "),
    kind: "screenshot",
    authority: "observed",
    packetId,
    source,
    sequenceIndex: screen.index,
    tags: [screen.platform, screen.sessionType].filter((value): value is string => Boolean(value)),
  } : undefined;
}

function evidenceForIcon(app: AppDataApp, packetId?: string, source?: CanvasV2EvidenceSource): CanvasV2EvidenceAsset | undefined {
  return app.iconUrl ? { id: `icon:${app.id}`, url: app.iconUrl, label: `${app.name} icon`, app: app.name, description: "App icon", kind: "app-identity", authority: "observed", packetId, source } : undefined;
}

function packetsForResult(apps: readonly AppDataApp[], flows: readonly AppDataFlow[], screens: readonly AppDataScreen[]): CanvasV2EvidencePacket[] {
  const packets: CanvasV2EvidencePacket[] = [];
  for (const app of apps) {
    const appFlows = flows.filter((flow) => flow.appName === app.name);
    for (const flow of appFlows) {
      const packetId = `packet:capture:${flow.id}`;
      const source = sourceForApp(app, "capture", flow.id, `${app.name} · ${flow.name}`);
      const assets = [evidenceForIcon(app, packetId, source), ...flow.screens.map((screen) => evidenceForScreen(screen, packetId, source))]
        .filter((asset): asset is CanvasV2EvidenceAsset => Boolean(asset));
      packets.push({
        schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
        id: packetId,
        kind: "screenshot-sequence",
        title: `${app.name} · ${flow.name}`,
        summary: `${flow.screens.length} ordered, image-backed product screens captured from ${[flow.platform, flow.sessionType].filter(Boolean).join(" ") || "the connected application"}.`,
        authority: "observed",
        source,
        assets,
        facts: [
          { id: `${packetId}:screen-count`, label: "Captured screens", value: String(flow.screens.length), authority: "calculated", description: "Count of ordered screenshots in this exact packet.", sourceAssetIds: assets.filter((asset) => asset.kind === "screenshot").map((asset) => asset.id) },
          ...(flow.taxonomyPath?.length ? [{ id: `${packetId}:taxonomy`, label: "Journey scope", value: flow.taxonomyPath.join(" → "), authority: "observed" as const }] : []),
        ],
        metrics: [],
        limitations: ["Captured screens describe visible product behavior and interface structure; they do not establish conversion, retention, causality, or user sentiment."],
        tags: [app.name, flow.platform, flow.sessionType, "product-capture"].filter((value): value is string => Boolean(value)),
        createdAt: source.retrievedAt,
        appId: app.id,
        appName: app.name,
        continuationKey: `capture:${flow.id}`,
      });
    }
    if (!appFlows.length && screens.some((screen) => screen.appName === app.name)) {
      const packetId = `packet:search:${app.id}`;
      const source = sourceForApp(app, "capture", packetId, `${app.name} screenshot matches`);
      const appScreens = screens.filter((screen) => screen.appName === app.name);
      const assets = appScreens.map((screen) => evidenceForScreen(screen, packetId, source)).filter((asset): asset is CanvasV2EvidenceAsset => Boolean(asset));
      packets.push({ schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA, id: packetId, kind: "screenshot", title: `${app.name} screenshot matches`, summary: `${assets.length} matching captured screens.`, authority: "observed", source, assets, facts: [], metrics: [], limitations: ["Search matches are not a complete user journey unless an ordered flow is explicitly selected."], tags: [app.name, "screenshot-search"], createdAt: source.retrievedAt, appId: app.id, appName: app.name });
    }
  }
  return packets;
}

function makeResult(operation: CanvasV2ResearchOperation, apps: AppDataApp[], flows: AppDataFlow[], screens: AppDataScreen[], detail: string, additionalPackets: readonly CanvasV2EvidencePacket[] = []): CanvasV2ResearchResult {
  const packets = [...packetsForResult(apps, flows, screens), ...additionalPackets];
  const evidence = [...packets.flatMap((packet) => packet.assets), ...apps.map((app) => evidenceForIcon(app)), ...screens.map((screen) => evidenceForScreen(screen))].filter((asset): asset is CanvasV2EvidenceAsset => Boolean(asset));
  return {
    operation,
    apps,
    flows,
    screens,
    evidence: Array.from(new Map(evidence.map((asset) => [asset.id, asset])).values()),
    packets: Array.from(new Map(packets.map((packet) => [packet.id, packet])).values()),
    sources: Array.from(new Map(packets.map((packet) => [`${packet.source.providerId}:${packet.source.sourceId}`, packet.source])).values()),
    issues: [],
    detail,
  };
}

export function canvasV2ResearchResultForFlow(app: AppDataApp, flow: AppDataFlow, additionalPackets: readonly CanvasV2EvidencePacket[] = []): CanvasV2ResearchResult {
  return makeResult("flow-screens", [app], [flow], flow.screens, `Retrieved ${flow.screens.length} ordered screens from ${app.name} · ${flow.name}.`, additionalPackets);
}

export function runCanvasV2Research(catalog: AppDataCatalog, query: CanvasV2ResearchQuery): CanvasV2ResearchResult {
  const max = limit(query.limit, 12, 60);
  if (query.operation === "list-apps") {
    const apps = catalog.apps.slice(0, max);
    return makeResult(query.operation, apps, [], [], `Found ${apps.length} available apps.`);
  }
  const app = bestApp(catalog, query.appName);
  if (query.operation === "list-flows") {
    const flows = (app?.flows ?? [])
      .filter((flow) => !query.platform || flow.platform === query.platform)
      .filter((flow) => !query.sessionType || flow.sessionType === query.sessionType)
      .slice(0, max);
    return makeResult(query.operation, app ? [app] : [], flows, [], app ? `Found ${flows.length} flows for ${app.name}.` : "No matching app was found.");
  }
  if (query.operation === "flow-screens") {
    const flowMatch = app?.flows.map((candidate) => ({ flow: candidate, score: scoreAppDataText(candidate.name, query.flowName ?? "") })).sort((a, b) => b.score - a.score)[0];
    const flow = flowMatch && flowMatch.score > 0 ? flowMatch.flow : undefined;
    const screens = flow?.screens.slice(0, max) ?? [];
    return makeResult(query.operation, app ? [app] : [], flow ? [flow] : [], screens, flow ? `Retrieved ${screens.length} ordered screens from ${flow.name}.` : "No matching flow was found.");
  }
  const search = query.query?.trim() ?? "";
  const matches = catalog.apps.flatMap((candidateApp) => candidateApp.flows.flatMap((flow) => flow.screens.map((screen) => ({ app: candidateApp, flow, screen, score: scoreAppDataText(`${candidateApp.name} ${flow.name} ${screen.name} ${flow.sessionType ?? ""}`, search) })))).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, max);
  return makeResult(query.operation, Array.from(new Map(matches.map((match) => [match.app.id, match.app])).values()), Array.from(new Map(matches.map((match) => [match.flow.id, match.flow])).values()), matches.map((match) => match.screen), `Found ${matches.length} grounded screenshot matches.`);
}
