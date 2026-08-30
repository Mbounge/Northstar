import type { AppDataApp, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";
import {
  CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  type CanvasV2EvidencePacket,
  type CanvasV2EvidenceSource,
} from "@/lib/canvas-v2/types";

function image(label: string, color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="720"><rect width="360" height="720" rx="28" fill="${color}"/><rect x="24" y="60" width="312" height="600" rx="22" fill="white"/><text x="44" y="120" font-family="Arial" font-size="22" font-weight="700" fill="#191922">${label}</text><rect x="44" y="160" width="272" height="210" rx="18" fill="#eeeaff"/><rect x="44" y="410" width="272" height="18" rx="9" fill="#dedee8"/><rect x="44" y="446" width="220" height="18" rx="9" fill="#dedee8"/><rect x="44" y="560" width="272" height="52" rx="26" fill="${color}"/></svg>`)}`;
}

function fixtureApp(name: string, color: string, screenNames: string[]): AppDataApp {
  const appId = `app:${name.toLowerCase()}`;
  const flow: AppDataFlow = {
    id: `flow:${name.toLowerCase()}:onboarding`,
    name: "Mobile onboarding",
    description: `Captured ${name} account creation`,
    appName: name,
    platform: "mobile",
    sessionType: "onboarding",
    scope: "journey",
    taxonomyPath: ["Mobile onboarding"],
    descendantFlowCount: 1,
    screens: screenNames.map((screenName, index) => ({ id: `${name.toLowerCase()}-screen-${index + 1}`, name: screenName, imageUrl: image(screenName, index % 2 ? color : `${color}dd`), appName: name, flowName: "Mobile onboarding", platform: "mobile", sessionType: "onboarding", index })),
  };
  return { id: appId, name, iconUrl: image(name.slice(0, 1), color), totalScreens: flow.screens.length, flows: [flow] };
}

const awin = fixtureApp("Awin", "#6b4dff", [
  "Landing", "Sign in", "Choose persona",
  ...Array.from({ length: 44 }, (_, index) => ["Creator promise", "Partner profile", "Company details", "Goals", "Verification", "Payment", "Preferences", "Activation"][index % 8] + ` · ${index + 1}`),
]);
const awinFlow = awin.flows[0]!;
awinFlow.name = "Landing & Persona Selection → Creator & Influencer Onboarding";
awinFlow.screens.forEach((screen) => { screen.flowName = awinFlow.name; });
awinFlow.scope = "path";
awinFlow.taxonomyPath = ["Landing & Persona Selection", "Creator & Influencer Onboarding"];
awinFlow.journeySegments = [
  { id: "awin-shared-entry", name: "Landing & Persona Selection", kind: "shared-entry", startIndex: 0, screenCount: 3 },
  { id: "awin-creator-branch", name: "Creator & Influencer Onboarding", kind: "branch", startIndex: 3, screenCount: 44 },
];

const awinContinuationFlow: AppDataFlow = {
  id: "flow:awin:marketing-continuation",
  name: "Marketing message continuation",
  description: "A later connected capture that extends the Awin discovery thread.",
  appName: "Awin",
  platform: "web",
  sessionType: "browsing",
  scope: "flow",
  taxonomyPath: ["Marketing message continuation"],
  descendantFlowCount: 1,
  screens: [
    { id: "awin-campaign-message", name: "Campaign message", imageUrl: image("Campaign message", "#6b4dff"), appName: "Awin", flowName: "Marketing message continuation", platform: "web", sessionType: "browsing", index: 0 },
    { id: "awin-audience-proof", name: "Audience proof", imageUrl: image("Audience proof", "#4b83df"), appName: "Awin", flowName: "Marketing message continuation", platform: "web", sessionType: "browsing", index: 1 },
  ],
};
awin.flows.push(awinContinuationFlow);

function fixtureSource(sourceId: string, label: string, capturedAt: string, sourceType: CanvasV2EvidenceSource["sourceType"]): CanvasV2EvidenceSource {
  return {
    providerId: "northstar-e2e-account-intelligence",
    providerLabel: "North Star account intelligence",
    sourceId,
    sourceType,
    label,
    tenantId: "e2e",
    sourceUrl: `https://evidence.northstar.test/${sourceId}`,
    retrievedAt: "2026-08-26T12:00:00.000Z",
    capturedAt,
    timeRange: { start: "2026-08-01", end: "2026-08-25", timezone: "UTC" },
    filters: { app: "Awin", account: "fixture" },
    permission: "authorized",
    freshness: "current-snapshot",
  };
}

const businessSource = fixtureSource("awin:business:snapshot-1", "Awin business operating snapshot", "2026-08-25", "business-manifest");
const marketingSourceOne = fixtureSource("awin:marketing:snapshot-1", "Awin marketing snapshot 1", "2026-08-20", "marketing-feed");
const marketingSourceTwo = fixtureSource("awin:marketing:snapshot-2", "Awin marketing snapshot 2", "2026-08-25", "marketing-feed");

export const CANVAS_V2_E2E_EVIDENCE_PACKETS: Record<"initial" | "continuation", CanvasV2EvidencePacket[]> = {
  initial: [{
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id: "packet:e2e:awin:business:1",
    kind: "business-record",
    title: "Awin business operating evidence",
    summary: "Authorized role and operating records relevant to publisher growth and support.",
    authority: "observed",
    source: businessSource,
    assets: [{ id: "asset:e2e:awin:business:1", url: image("Publisher success", "#ff6b35"), label: "Awin publisher-success operating capture", app: "Awin", kind: "image", authority: "observed", packetId: "packet:e2e:awin:business:1", source: businessSource }],
    facts: [{ id: "fact:e2e:awin:business-role", label: "Observed operating role", value: "Publisher success manager", authority: "observed", sourceAssetIds: ["asset:e2e:awin:business:1"] }],
    metrics: [{ id: "metric:e2e:awin:open-roles", label: "Captured open roles", value: 1, format: "number", definition: "Open roles present in the authorized business fixture snapshot.", authority: "calculated", sourceAssetIds: ["asset:e2e:awin:business:1"] }],
    limitations: ["The operating snapshot shows a role and responsibility, not the effectiveness or market impact of that function."],
    tags: ["Awin", "business", "publisher-success"],
    createdAt: businessSource.retrievedAt,
    appId: awin.id,
    appName: awin.name,
    continuationKey: "business:app:awin",
  }, {
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id: "packet:e2e:awin:marketing:1",
    kind: "marketing-signal",
    title: "Awin marketing message evidence",
    summary: "Observed campaign message and a measured account-level response signal.",
    authority: "observed",
    source: marketingSourceOne,
    assets: [{ id: "asset:e2e:awin:marketing:1", url: image("Partner growth", "#7557ef"), label: "Awin partner-growth campaign capture", app: "Awin", kind: "marketing-signal", authority: "observed", packetId: "packet:e2e:awin:marketing:1", source: marketingSourceOne, capturedAt: "2026-08-20" }],
    facts: [{ id: "fact:e2e:awin:message", label: "Observed message", value: "Grow partnerships with confidence", authority: "observed", sourceAssetIds: ["asset:e2e:awin:marketing:1"] }],
    metrics: [{ id: "metric:e2e:awin:engagement", label: "Fixture engagement rate", value: 4.2, unit: "%", format: "percent", definition: "Interactions divided by impressions for the authorized fixture account between 1–25 August 2026.", authority: "calculated", timeRange: marketingSourceOne.timeRange, filters: marketingSourceOne.filters, sourceAssetIds: ["asset:e2e:awin:marketing:1"] }],
    limitations: ["This account fixture demonstrates metric lineage; it does not establish causality or a market benchmark."],
    tags: ["Awin", "marketing", "campaign"],
    createdAt: marketingSourceOne.retrievedAt,
    appId: awin.id,
    appName: awin.name,
    continuationKey: "marketing:app:awin",
  }],
  continuation: [{
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id: "packet:e2e:awin:marketing:2",
    kind: "marketing-signal",
    title: "Awin audience continuation",
    summary: "A later authorized packet extends the same marketing discovery thread.",
    authority: "observed",
    source: marketingSourceTwo,
    assets: [{ id: "asset:e2e:awin:marketing:2", url: image("Publisher audience", "#4b83df"), label: "Awin publisher-audience capture", app: "Awin", kind: "marketing-signal", authority: "observed", packetId: "packet:e2e:awin:marketing:2", source: marketingSourceTwo, capturedAt: "2026-08-25" }],
    facts: [{ id: "fact:e2e:awin:audience", label: "Observed audience", value: "Publishers and advertisers", authority: "observed", sourceAssetIds: ["asset:e2e:awin:marketing:2"] }],
    metrics: [],
    limitations: ["Audience labels are scoped to the authorized connected snapshot."],
    tags: ["Awin", "marketing", "continuation"],
    createdAt: marketingSourceTwo.retrievedAt,
    appId: awin.id,
    appName: awin.name,
    continuationKey: "marketing:app:awin",
    parentPacketIds: ["packet:e2e:awin:marketing:1"],
  }],
};

const externalPrimarySource: CanvasV2EvidenceSource = {
  providerId: "openai-web-search",
  providerLabel: "OpenAI web search",
  sourceId: "web:https://northstar.example/research/adaptive-discovery",
  sourceType: "report",
  label: "Adaptive discovery field report",
  sourceUrl: "https://northstar.example/research/adaptive-discovery",
  canonicalUrl: "https://northstar.example/research/adaptive-discovery",
  publisher: "Northstar Research Institute",
  author: "Research desk",
  publishedAt: "2026-08-24",
  sourceClass: "primary",
  access: "open",
  retrievedAt: "2026-08-27T14:30:00.000Z",
  query: "current adaptive discovery agent evidence",
  filters: { freshness: "recent", stoppingReason: "One primary source and one independent corroborating source answered the material question." },
  permission: "authorized",
  freshness: "live",
};

const externalSupportingSource: CanvasV2EvidenceSource = {
  providerId: "openai-web-search",
  providerLabel: "OpenAI web search",
  sourceId: "web:https://standards.example/agentic-research",
  sourceType: "web-page",
  label: "Agentic research guidance",
  sourceUrl: "https://standards.example/agentic-research",
  canonicalUrl: "https://standards.example/agentic-research",
  publisher: "Open Systems Standards Group",
  publishedAt: "2026-08-21",
  sourceClass: "official",
  access: "open",
  retrievedAt: "2026-08-27T14:30:00.000Z",
  query: "current adaptive discovery agent evidence",
  filters: { freshness: "recent", stoppingReason: "One primary source and one independent corroborating source answered the material question." },
  permission: "authorized",
  freshness: "live",
};

export const CANVAS_V2_E2E_EXTERNAL_EVIDENCE_PACKETS: CanvasV2EvidencePacket[] = [{
  schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  id: "packet:e2e:external:adaptive-discovery",
  kind: "document",
  title: "Discovery systems are becoming inspectable, not merely conversational.",
  summary: "A recent primary report describes a shift toward bounded research cycles whose sources, unresolved questions, and stopping condition remain visible to the operator.",
  authority: "observed",
  source: externalPrimarySource,
  assets: [{
    id: "asset:e2e:external:adaptive-discovery",
    url: image("Inspect · learn · decide", "#684dff"),
    label: "Adaptive discovery cycle from the primary report",
    description: "A source-returned visual showing an inspect, learn, and decide research cycle.",
    kind: "image",
    authority: "observed",
    packetId: "packet:e2e:external:adaptive-discovery",
    source: externalPrimarySource,
    capturedAt: "2026-08-24",
  }],
  facts: [{
    id: "fact:e2e:external:inspectable-cycle",
    label: "Observed direction",
    value: "The reported systems expose source acquisition, unresolved questions, and stopping conditions as part of the work—not as a transcript afterthought.",
    authority: "observed",
    sourceAssetIds: ["asset:e2e:external:adaptive-discovery"],
  }],
  metrics: [{
    id: "metric:e2e:external:research-cycles",
    label: "Documented research cycles",
    value: 12,
    format: "number",
    definition: "Research cycles explicitly documented in the primary report; this is a source-native count, not a North Star calculation.",
    authority: "observed",
    sourceAssetIds: ["asset:e2e:external:adaptive-discovery"],
  }],
  limitations: ["This report describes the documented sample and does not establish a market-wide adoption rate."],
  tags: ["external", "discovery", "agentic-research", "primary"],
  createdAt: externalPrimarySource.retrievedAt,
  continuationKey: externalPrimarySource.canonicalUrl,
  presentation: { state: "promoted", materiality: 0.91, reason: "The source directly resolves the governing question and contributes an inspectable visual witness." },
}, {
  schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  id: "packet:e2e:external:agentic-guidance",
  kind: "document",
  title: "Independent guidance supports bounded stopping conditions.",
  summary: "An official guidance page corroborates the need to stop research when the material question is answered and remaining uncertainty is explicit.",
  authority: "observed",
  source: externalSupportingSource,
  assets: [],
  facts: [{
    id: "fact:e2e:external:bounded-stopping",
    label: "Corroborating guidance",
    value: "The research loop should stop when its material question is answered, its sources are traceable, and residual uncertainty is named.",
    authority: "observed",
  }],
  metrics: [],
  limitations: ["Guidance is normative and does not measure implementation quality."],
  tags: ["external", "discovery", "official", "supporting"],
  createdAt: externalSupportingSource.retrievedAt,
  continuationKey: externalSupportingSource.canonicalUrl,
  presentation: { state: "graph-only", materiality: 0.68, reason: "It corroborates the primary witness but would duplicate its semantic job on the canvas." },
}];

export const CANVAS_V2_E2E_APPS = [
  awin,
  fixtureApp("Whop", "#ff4f18", Array.from({ length: 17 }, (_, index) => ["Welcome", "Email", "Username", "Account", "Profile", "Interests", "Community", "Ready"][index % 8] + ` · ${index + 1}`)),
];
