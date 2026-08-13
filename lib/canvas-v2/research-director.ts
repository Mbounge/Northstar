import type { AppDataApp, AppDataCatalog, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";
import { canvasV2ResearchResultForFlow, type CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ArtifactRevision, CanvasV2ResearchDecision } from "@/lib/canvas-v2/types";

export interface CanvasV2ResearchCatalogIndex {
  catalogScope: {
    totalAppCount: number;
    includedAppCount: number;
    omittedAppCount: number;
    maxFlowsPerApp: number;
    selectionGuidance: string;
  };
  apps: Array<{
    id: string;
    name: string;
    category?: string;
    description?: string;
    totalFlowCount: number;
    usableFlowCount: number;
    omittedUsableFlowCount: number;
    flows: Array<{
      id: string;
      name: string;
      description?: string;
      platform?: string;
      sessionType?: string;
      scope: "journey" | "flow" | "session";
      taxonomyPath: string[];
      descendantFlowCount: number;
      screenCount: number;
      duplicateScreenCount: number;
      screenNames: string[];
      selectionRank: number;
      selection: "preferred" | "adequate" | "supporting";
      scopeMatch: "exact" | "compatible" | "mismatch";
      selectionReason: string;
    }>;
  }>;
  explicitlyNamedAppIds: string[];
  visibleFlowIds: string[];
  visibleApps: string[];
  requirements: CanvasV2ResearchRequirement[];
}

export type CanvasV2ResearchRequirementState = "visible" | "pending" | "unavailable" | "unresolved";

export interface CanvasV2ResearchRequirement {
  requestedName: string;
  appId?: string;
  appName?: string;
  state: CanvasV2ResearchRequirementState;
  reason?: string;
  usableFlowIds: string[];
  adequateFlowIds: string[];
  visibleFlowIds: string[];
  visibleAdequateFlowIds: string[];
  pendingFlowId?: string;
}

export type CanvasV2ResearchDecisionKind = "research" | "edit" | "complete";

export interface CanvasV2ResearchDecisionPolicy {
  phase: "ground-required-evidence" | "synthesize-grounded-evidence" | "open-design";
  permittedDecisions: CanvasV2ResearchDecisionKind[];
  reason: string;
}

function normalize(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

const MAX_INDEX_APPS = 24;
const MAX_INDEX_FLOWS_PER_APP = 18;
const MAX_INDEX_SCREEN_NAMES = 12;
const NON_RESEARCH_TERMS = new Set([
  "analysis", "analyze", "and", "are", "artboard", "balanced", "board", "build", "can", "canvas", "choose", "compare", "comparison", "complete",
  "design", "executive", "for", "from", "how", "insight", "insights", "inspect", "into", "keep", "leave", "main", "make",
  "prompt", "representative", "research", "screens", "screenshots", "simple", "that", "the", "their", "this",
  "visible", "what", "when", "where", "which", "with", "working", "you",
]);

const GENERIC_FLOW_TERMS = new Set([
  "account", "app", "browsing", "capture", "complete", "desktop", "flow", "journey", "mobile", "onboarding", "path", "session", "web",
]);

interface FlowAssessment {
  flow: AppDataFlow;
  score: number;
  sourceIndex: number;
  selection: "preferred" | "adequate" | "supporting";
  scopeMatch: "exact" | "compatible" | "mismatch";
  selectionReason: string;
}

function researchTerms(instruction: string, catalog: AppDataCatalog): string[] {
  const appTerms = new Set(catalog.apps.flatMap((app) => normalize(app.name).trim().split(" ")));
  return Array.from(new Set(normalize(instruction).trim().split(" ")
    .filter((term) => term.length > 2 && !NON_RESEARCH_TERMS.has(term) && !appTerms.has(term))));
}

function canonicalSessionType(value?: string): "onboarding" | "browsing" | undefined {
  const normalized = normalize(value ?? "");
  if (/\b(onboard|onboarding|activation|registration|sign up|signup|account creation|first login)\b/.test(normalized)) return "onboarding";
  if (/\b(browse|browsing|discover|discovery|explore|navigation|usage)\b/.test(normalized)) return "browsing";
}

function requestedSessionTypes(instruction: string): Array<"onboarding" | "browsing"> {
  return Array.from(new Set([
    canonicalSessionType(instruction),
    /\b(browse|browsing|discover|discovery|explore|navigation)\b/i.test(instruction) ? "browsing" : undefined,
  ].filter((value): value is "onboarding" | "browsing" => Boolean(value))));
}

function requestedPlatforms(instruction: string): Array<"mobile" | "web"> {
  return [
    /\b(mobile|ios|android|phone)\b/i.test(instruction) ? "mobile" as const : undefined,
    /\b(web|website|desktop|browser)\b/i.test(instruction) ? "web" as const : undefined,
  ].filter((value): value is "mobile" | "web" => Boolean(value));
}

function descriptiveFlowTerms(flow: AppDataFlow): string[] {
  const appTerms = new Set(normalize(flow.appName).trim().split(" "));
  return normalize(flow.name).trim().split(" ").filter((term) => term.length > 2 && !GENERIC_FLOW_TERMS.has(term) && !appTerms.has(term));
}

function explicitlyNamesFlow(instruction: string, flow: AppDataFlow): boolean {
  const terms = descriptiveFlowTerms(flow);
  if (!terms.length) return false;
  const prompt = normalize(instruction);
  const title = normalize(flow.name);
  return prompt.includes(title) || terms.every((term) => prompt.includes(` ${term} `));
}

function flowScopeMatch(flow: AppDataFlow, sessions: readonly string[], platforms: readonly string[]): "exact" | "compatible" | "mismatch" {
  const session = canonicalSessionType(flow.sessionType) ?? canonicalSessionType(`${flow.name} ${flow.description ?? ""}`);
  const sessionMatches = !sessions.length || Boolean(session && sessions.includes(session));
  const platformMatches = !platforms.length || Boolean(flow.platform && platforms.includes(flow.platform));
  if (sessionMatches && platformMatches && (sessions.length || platforms.length)) return "exact";
  if (!sessions.length && !platforms.length) return "compatible";
  return "mismatch";
}

function flowRelevance(flow: AppDataFlow, terms: readonly string[], scopeMatch: FlowAssessment["scopeMatch"], preferJourney: boolean, exactFlowName: boolean): number {
  const title = normalize(flow.name);
  const description = normalize(flow.description ?? "");
  const session = normalize([flow.platform, flow.sessionType].filter(Boolean).join(" "));
  const path = normalize(flow.taxonomyPath?.join(" ") ?? "");
  const screens = normalize(flow.screens.slice(0, 40).map((screen) => screen.name).join(" "));
  let score = terms.reduce((total, term) => total
    + (title.includes(` ${term} `) ? 28 : 0)
    + (session.includes(` ${term} `) ? 24 : 0)
    + (path.includes(` ${term} `) ? 18 : 0)
    + (description.includes(` ${term} `) ? 10 : 0)
    + (screens.includes(` ${term} `) ? 4 : 0), 0);
  score += scopeMatch === "exact" ? 90 : scopeMatch === "mismatch" ? -120 : 0;
  score += flow.scope === "journey" ? 110 : flow.scope === "session" ? 30 : 20;
  score += Math.min(24, flow.screens.length) * 3;
  score += Math.min(8, flow.descendantFlowCount ?? 0) * 4;
  if (flow.scope === "session" && flow.screens.length > 40) score -= Math.min(60, flow.screens.length - 40);
  if (exactFlowName) score += 220;
  if (preferJourney) score += flow.scope === "journey" ? 100 : flow.scope === "flow" ? -40 : -15;
  return score;
}

function assessedFlows(app: AppDataApp, instruction: string, catalog: AppDataCatalog): FlowAssessment[] {
  const terms = researchTerms(instruction, catalog);
  const sessions = requestedSessionTypes(instruction);
  const platforms = requestedPlatforms(instruction);
  const usable = app.flows.filter((flow) => flow.screens.length > 0 && flow.screens.every((screen) => Boolean(screen.imageUrl)));
  const exactNames = new Set(usable.filter((flow) => explicitlyNamesFlow(instruction, flow)).map((flow) => flow.id));
  const scopedJourneys = usable.filter((flow) => flow.scope === "journey" && flowScopeMatch(flow, sessions, platforms) !== "mismatch");
  const preferJourney = Boolean(sessions.length && !exactNames.size && scopedJourneys.length);
  const scored = usable.map((flow, sourceIndex) => {
    const scopeMatch = flowScopeMatch(flow, sessions, platforms);
    return {
      flow,
      sourceIndex,
      scopeMatch,
      score: flowRelevance(flow, terms, scopeMatch, preferJourney, exactNames.has(flow.id)),
    };
  });
  const preferredPool = scored.filter((assessment) => {
    if (exactNames.size) return exactNames.has(assessment.flow.id);
    if (preferJourney) return assessment.flow.scope === "journey" && assessment.scopeMatch !== "mismatch";
    const hasExactScope = scored.some((candidate) => candidate.scopeMatch === "exact");
    return hasExactScope ? assessment.scopeMatch === "exact" : assessment.scopeMatch !== "mismatch";
  });
  const fallbackPool = preferredPool.length ? preferredPool : scored;
  const bestScore = Math.max(...fallbackPool.map((assessment) => assessment.score), Number.NEGATIVE_INFINITY);
  return scored
    .map((assessment): FlowAssessment => {
      const inPool = fallbackPool.includes(assessment);
      const distance = bestScore - assessment.score;
      const selection = inPool && distance <= 0 ? "preferred" : inPool && distance <= 18 ? "adequate" : "supporting";
      const scope = assessment.flow.scope ?? "flow";
      const selectionReason = selection === "preferred"
        ? `Best ${assessment.scopeMatch === "exact" ? "scope-matched " : ""}${scope} coverage for this request.`
        : selection === "adequate"
          ? `Comparable ${scope} coverage within the preferred evidence set.`
          : preferJourney && scope !== "journey"
            ? "A narrower path or session-wide capture is supporting evidence; a coherent taxonomy journey is available."
            : assessment.scopeMatch === "mismatch"
              ? "The captured session or platform does not match the requested scope."
              : "Useful supporting evidence, but not the strongest coverage for the requested scope.";
      return { ...assessment, selection, selectionReason };
    })
    .sort((left, right) => right.score - left.score || left.sourceIndex - right.sourceIndex);
}

function indexedFlows(app: AppDataApp, instruction: string, catalog: AppDataCatalog): FlowAssessment[] {
  return assessedFlows(app, instruction, catalog).slice(0, MAX_INDEX_FLOWS_PER_APP);
}

export function canvasV2VisibleFlowIds(html: string): string[] {
  return Array.from(new Set(Array.from(html.matchAll(/\bdata-canvas-v2-canonical-flow\s*=\s*["']([^"']+)["']/gi), (match) => match[1])));
}

function usableFlowIds(app: AppDataApp): string[] {
  return app.flows.filter((flow) => flow.screens.length > 0 && flow.screens.every((screen) => Boolean(screen.imageUrl))).map((flow) => flow.id);
}

function matchingApp(catalog: AppDataCatalog, requestedName: string): AppDataApp | undefined {
  const requested = normalize(requestedName);
  return catalog.apps.find((app) => normalize(app.name) === requested)
    ?? catalog.apps.find((app) => requested.includes(normalize(app.name)) || normalize(app.name).includes(requested));
}

function uniqueTargets(targets: readonly string[]): string[] {
  const values = new Map<string, string>();
  for (const target of targets) {
    const value = target.trim().slice(0, 160);
    const key = normalize(value);
    if (value && key.trim() && !values.has(key)) values.set(key, value);
  }
  return Array.from(values.values()).slice(0, 12);
}

function requirementForTarget(catalog: AppDataCatalog, requestedName: string, visibleFlowIds: readonly string[], instruction: string): CanvasV2ResearchRequirement {
  const app = matchingApp(catalog, requestedName);
  if (!app) return {
    requestedName,
    state: "unavailable",
    reason: `No connected app named ${requestedName} is available in this account.`,
    usableFlowIds: [],
    adequateFlowIds: [],
    visibleFlowIds: [],
    visibleAdequateFlowIds: [],
  };
  const usable = usableFlowIds(app);
  const visible = usable.filter((flowId) => visibleFlowIds.includes(flowId));
  const adequate = assessedFlows(app, instruction, catalog).filter((assessment) => assessment.selection !== "supporting").map((assessment) => assessment.flow.id);
  const visibleAdequate = adequate.filter((flowId) => visibleFlowIds.includes(flowId));
  if (!usable.length) return {
    requestedName,
    appId: app.id,
    appName: app.name,
    state: "unavailable",
    reason: `${app.name} has no complete captured flow with renderable screenshots.`,
    usableFlowIds: [],
    adequateFlowIds: [],
    visibleFlowIds: [],
    visibleAdequateFlowIds: [],
  };
  return {
    requestedName,
    appId: app.id,
    appName: app.name,
    state: visibleAdequate.length ? "visible" : "unresolved",
    reason: visible.length && !visibleAdequate.length
      ? `${app.name} has visible evidence, but it does not adequately cover the requested journey scope.`
      : undefined,
    usableFlowIds: usable,
    adequateFlowIds: adequate,
    visibleFlowIds: visible,
    visibleAdequateFlowIds: visibleAdequate,
  };
}

export function buildCanvasV2ResearchCatalogIndex(
  catalog: AppDataCatalog,
  instruction: string,
  revision: CanvasV2ArtifactRevision,
  researchTargets: readonly string[] = [],
): CanvasV2ResearchCatalogIndex {
  const prompt = normalize(instruction);
  const visibleFlowIds = canvasV2VisibleFlowIds(revision.document.html);
  const catalogNamedApps = catalog.apps.filter((app) => prompt.includes(normalize(app.name)));
  const targets = uniqueTargets([...researchTargets, ...catalogNamedApps.map((app) => app.name)]);
  const requirements = targets.map((target) => requirementForTarget(catalog, target, visibleFlowIds, instruction));
  const visibleApps = Array.from(new Set(requirements.filter((requirement) => requirement.state === "visible").map((requirement) => requirement.appName).filter((app): app is string => Boolean(app))));
  const requiredAppIds = new Set(requirements.map((requirement) => requirement.appId).filter((appId): appId is string => Boolean(appId)));
  const scopedApps = (requiredAppIds.size ? catalog.apps.filter((app) => requiredAppIds.has(app.id)) : catalog.apps)
    .slice(0, MAX_INDEX_APPS);
  return {
    catalogScope: {
      totalAppCount: catalog.apps.length,
      includedAppCount: scopedApps.length,
      omittedAppCount: Math.max(0, catalog.apps.length - scopedApps.length),
      maxFlowsPerApp: MAX_INDEX_FLOWS_PER_APP,
      selectionGuidance: "Choose a preferred or adequate candidate, never a supporting candidate while its app remains unresolved. Scope comes before brevity: use a coherent taxonomy journey for broad onboarding or browsing requests, an exact child path when the user names that path, and a session-wide capture only when it is the strongest truthful coverage. Representative and executive describe the final communication, not permission to discard journey evidence. A selected flow is inserted in full and is never truncated.",
    },
    apps: scopedApps.map((app) => {
      const usable = usableFlowIds(app);
      const flows = indexedFlows(app, instruction, catalog);
      return {
        id: app.id,
        name: app.name,
        category: app.category,
        description: app.description,
        totalFlowCount: app.flows.length,
        usableFlowCount: usable.length,
        omittedUsableFlowCount: Math.max(0, usable.length - flows.length),
        flows: flows.map((assessment, selectionRank) => ({
          id: assessment.flow.id,
          name: assessment.flow.name,
          description: assessment.flow.description,
          platform: assessment.flow.platform,
          sessionType: assessment.flow.sessionType,
          scope: assessment.flow.scope ?? "flow",
          taxonomyPath: assessment.flow.taxonomyPath ?? [assessment.flow.name],
          descendantFlowCount: assessment.flow.descendantFlowCount ?? 0,
          screenCount: assessment.flow.screens.length,
          duplicateScreenCount: assessment.flow.duplicateScreenCount ?? 0,
          screenNames: assessment.flow.screens.slice(0, MAX_INDEX_SCREEN_NAMES).map((screen) => screen.name),
          selectionRank: selectionRank + 1,
          selection: assessment.selection,
          scopeMatch: assessment.scopeMatch,
          selectionReason: assessment.selectionReason,
        })),
      };
    }),
    explicitlyNamedAppIds: Array.from(new Set(requirements.map((requirement) => requirement.appId).filter((appId): appId is string => Boolean(appId)))),
    visibleFlowIds,
    visibleApps,
    requirements,
  };
}

function exactFlow(catalog: AppDataCatalog, appId: string, flowId: string): { app: AppDataApp; flow: AppDataFlow } | undefined {
  const app = catalog.apps.find((candidate) => candidate.id === appId);
  const flow = app?.flows.find((candidate) => candidate.id === flowId);
  return app && flow ? { app, flow } : undefined;
}

export function resolveCanvasV2ResearchDecision(catalog: AppDataCatalog, decision: CanvasV2ResearchDecision, visibleFlowIds: readonly string[], index?: CanvasV2ResearchCatalogIndex): CanvasV2ResearchResult {
  const match = exactFlow(catalog, decision.appId, decision.flowId);
  if (!match) throw new Error("The requested research flow is not available in this account catalog.");
  if (visibleFlowIds.includes(match.flow.id)) throw new Error(`${match.app.name} · ${match.flow.name} is already visible on the artboard.`);
  const unresolvedRequirement = index?.requirements.find((requirement) => requirement.appId === decision.appId && requirement.state === "unresolved");
  if (unresolvedRequirement && !unresolvedRequirement.adequateFlowIds.includes(decision.flowId)) {
    throw new Error(`${match.app.name} · ${match.flow.name} is supporting evidence, but it does not adequately cover the requested journey. Choose a preferred or adequate catalog candidate.`);
  }
  const result = canvasV2ResearchResultForFlow(match.app, match.flow);
  if (!result.screens.length || result.screens.some((screen) => !screen.imageUrl)) throw new Error(`${match.app.name} · ${match.flow.name} is not a complete captured flow with renderable screenshots.`);
  return result;
}

export function canvasV2MissingRequiredApps(index: CanvasV2ResearchCatalogIndex): string[] {
  return index.requirements.filter((requirement) => requirement.state === "unresolved" || requirement.state === "pending").map((requirement) => requirement.appName ?? requirement.requestedName);
}

export function canvasV2ResearchDecisionPolicy(
  index: CanvasV2ResearchCatalogIndex,
  researchMode: CanvasV2ResearchMode | undefined,
  priorSteps: ReadonlyArray<{ kind: "research" | "design" }>,
): CanvasV2ResearchDecisionPolicy {
  const unresolved = canvasV2MissingRequiredApps(index);
  if (unresolved.length) return {
    phase: "ground-required-evidence",
    permittedDecisions: ["research"],
    reason: `Ground one complete, scope-adequate journey for an unresolved required app before authoring claims: ${unresolved.join(", ")}.`,
  };
  const lastResearchStep = priorSteps.findLastIndex((step) => step.kind === "research");
  const lastDesignStep = priorSteps.findLastIndex((step) => step.kind === "design");
  if (researchMode === "synthesis" && lastResearchStep >= 0 && lastDesignStep < lastResearchStep) return {
    phase: "synthesize-grounded-evidence",
    permittedDecisions: ["edit"],
    reason: "The final required flow is now visible. Author a meaningful evidence-grounded synthesis edit before completion.",
  };
  return {
    phase: "open-design",
    permittedDecisions: ["research", "edit", "complete"],
    reason: "Choose the next meaningful action from the exact rendered state.",
  };
}

export function canvasV2UnavailableRequiredApps(index: CanvasV2ResearchCatalogIndex): CanvasV2ResearchRequirement[] {
  return index.requirements.filter((requirement) => requirement.state === "unavailable");
}

export function canvasV2UnacknowledgedUnavailableApps(index: CanvasV2ResearchCatalogIndex, html: string): CanvasV2ResearchRequirement[] {
  const acknowledged = new Set(Array.from(html.matchAll(/\bdata-canvas-v2-research-unavailable\s*=\s*["']([^"']+)["']/gi), (match) => normalize(match[1])));
  return canvasV2UnavailableRequiredApps(index).filter((requirement) => !acknowledged.has(normalize(requirement.requestedName)));
}

export function resolveCanvasV2ResearchCompletion(index: CanvasV2ResearchCatalogIndex, modelSummary: string, html: string): {
  ready: boolean;
  unresolved: string[];
  unacknowledgedUnavailable: string[];
  unavailable: CanvasV2ResearchRequirement[];
  summary: string;
} {
  const unresolved = canvasV2MissingRequiredApps(index);
  const unavailable = canvasV2UnavailableRequiredApps(index);
  const unacknowledgedUnavailable = canvasV2UnacknowledgedUnavailableApps(index, html).map((requirement) => requirement.requestedName);
  const limitation = unavailable.length
    ? ` Evidence unavailable in this account: ${unavailable.map((requirement) => requirement.requestedName).join(", ")}.`
    : "";
  return { ready: unresolved.length === 0 && unacknowledgedUnavailable.length === 0, unresolved, unacknowledgedUnavailable, unavailable, summary: `${modelSummary.trim()}${limitation}` };
}

export function canvasV2ResearchStatusForDecision(
  index: CanvasV2ResearchCatalogIndex,
  decision?: Pick<CanvasV2ResearchDecision, "appId" | "flowId">,
): CanvasV2ResearchRequirement[] {
  const pendingAppId = decision?.appId;
  const pendingFlowId = decision?.flowId;
  return index.requirements.map((requirement) => requirement.appId === pendingAppId && pendingFlowId && requirement.state === "unresolved" && (requirement.adequateFlowIds ?? requirement.usableFlowIds).includes(pendingFlowId)
    ? { ...requirement, state: "pending", pendingFlowId }
    : { ...requirement });
}

export function settleCanvasV2ResearchRequirement(
  requirements: readonly CanvasV2ResearchRequirement[] | undefined,
  appId: string,
  flowId: string,
): CanvasV2ResearchRequirement[] | undefined {
  return requirements?.map((requirement) => requirement.appId === appId && requirement.pendingFlowId === flowId && (requirement.adequateFlowIds ?? requirement.usableFlowIds).includes(flowId)
    ? {
        ...requirement,
        state: "visible",
        pendingFlowId: undefined,
        visibleFlowIds: Array.from(new Set([...requirement.visibleFlowIds, flowId])),
        visibleAdequateFlowIds: Array.from(new Set([...(requirement.visibleAdequateFlowIds ?? requirement.visibleFlowIds), flowId])),
      }
    : { ...requirement });
}
