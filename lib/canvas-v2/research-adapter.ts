import {
  scoreAppDataText,
  type AppDataApp,
  type AppDataCatalog,
  type AppDataFlow,
  type AppDataScreen,
} from "@/lib/app-data/canvas-v2-catalog";
import type { CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";

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
  detail: string;
}

function limit(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.round(value!))) : fallback;
}

function bestApp(catalog: AppDataCatalog, name?: string): AppDataApp | undefined {
  if (!name) return undefined;
  const match = catalog.apps.map((app) => ({ app, score: scoreAppDataText(`${app.name} ${app.category ?? ""}`, name) })).sort((a, b) => b.score - a.score)[0];
  return match && match.score > 0 ? match.app : undefined;
}

function evidenceForScreen(screen: AppDataScreen): CanvasV2EvidenceAsset | undefined {
  return screen.imageUrl ? {
    id: `screen:${screen.id}`,
    url: screen.imageUrl,
    label: screen.name,
    app: screen.appName,
    flow: screen.flowName,
    screen: screen.name,
    description: [screen.platform, screen.sessionType, `Step ${screen.index + 1}`].filter(Boolean).join(" · "),
  } : undefined;
}

function evidenceForIcon(app: AppDataApp): CanvasV2EvidenceAsset | undefined {
  return app.iconUrl ? { id: `icon:${app.id}`, url: app.iconUrl, label: `${app.name} icon`, app: app.name, description: "App icon" } : undefined;
}

function makeResult(operation: CanvasV2ResearchOperation, apps: AppDataApp[], flows: AppDataFlow[], screens: AppDataScreen[], detail: string): CanvasV2ResearchResult {
  const evidence = [...apps.map(evidenceForIcon), ...screens.map(evidenceForScreen)].filter((asset): asset is CanvasV2EvidenceAsset => Boolean(asset));
  return { operation, apps, flows, screens, evidence: Array.from(new Map(evidence.map((asset) => [asset.id, asset])).values()), detail };
}

export function canvasV2ResearchResultForFlow(app: AppDataApp, flow: AppDataFlow): CanvasV2ResearchResult {
  return makeResult("flow-screens", [app], [flow], flow.screens, `Retrieved ${flow.screens.length} ordered screens from ${app.name} · ${flow.name}.`);
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
