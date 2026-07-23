import type { NorthStarToolArguments } from "@/lib/canvas-ai/northstar-tool-registry";
import type { NorthstarLedgerLLMContext, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

export interface NorthstarKnownAppIdentity {
  appId: string;
  appName: string;
}

export interface NorthstarKnownFlowIdentity extends NorthstarKnownAppIdentity {
  flowId: string;
  flowName: string;
  platform?: string;
  sessionType?: string;
}

export interface NorthstarKnownScreenshotIdentity extends NorthstarKnownFlowIdentity {
  screenshotId: string;
  screenshotName?: string;
  screenshotIndex?: number;
  imageUrl?: string;
}

export interface NorthstarKnownEvidenceIdentities {
  apps: NorthstarKnownAppIdentity[];
  flows: NorthstarKnownFlowIdentity[];
  screenshots: NorthstarKnownScreenshotIdentity[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pushUnique<T>(items: T[], key: string, seen: Set<string>, value: T): void {
  if (!key || seen.has(key)) return;
  seen.add(key);
  items.push(value);
}

export function collectNorthstarKnownEvidenceIdentities(
  value: NorthstarLedgerValue | NorthstarLedgerLLMContext | unknown,
): NorthstarKnownEvidenceIdentities {
  const apps: NorthstarKnownAppIdentity[] = [];
  const flows: NorthstarKnownFlowIdentity[] = [];
  const screenshots: NorthstarKnownScreenshotIdentity[] = [];
  const seenApps = new Set<string>();
  const seenFlows = new Set<string>();
  const seenScreenshots = new Set<string>();
  const visited = new Set<object>();

  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    if (visited.has(candidate as object)) return;
    visited.add(candidate as object);
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    const record = candidate as Record<string, unknown>;
    const appId = stringField(record, "appId") ?? (
      stringField(record, "id") && (
        "flowCount" in record || "totalScreens" in record || "iconUrl" in record
      ) ? stringField(record, "id") : undefined
    );
    const appName = stringField(record, "appName") ?? (
      appId && stringField(record, "name") && !stringField(record, "flowName")
        ? stringField(record, "name")
        : undefined
    );
    if (appId && appName) {
      pushUnique(apps, appId, seenApps, { appId, appName });
    }

    const flowId = stringField(record, "flowId") ?? (
      stringField(record, "id") && stringField(record, "appName") && (
        "screenCount" in record || "screens" in record || "sessionType" in record
      ) ? stringField(record, "id") : undefined
    );
    const flowName = stringField(record, "flowName") ?? (
      flowId && stringField(record, "name") ? stringField(record, "name") : undefined
    );
    const resolvedAppId = appId ?? stringField(record, "appId");
    const resolvedAppName = appName ?? stringField(record, "appName");
    if (resolvedAppId && resolvedAppName && flowId && flowName) {
      pushUnique(flows, flowId, seenFlows, {
        appId: resolvedAppId,
        appName: resolvedAppName,
        flowId,
        flowName,
        platform: stringField(record, "platform"),
        sessionType: stringField(record, "sessionType"),
      });
    }

    const screenshotId = stringField(record, "screenshotId") ?? (
      stringField(record, "id") && stringField(record, "imageUrl") && stringField(record, "flowName")
        ? stringField(record, "id")
        : undefined
    );
    if (resolvedAppId && resolvedAppName && flowId && flowName && screenshotId) {
      const screenshotIndex = typeof record.index === "number" && Number.isFinite(record.index)
        ? record.index
        : typeof record.screenshotIndex === "number" && Number.isFinite(record.screenshotIndex)
          ? record.screenshotIndex
          : undefined;
      pushUnique(screenshots, screenshotId, seenScreenshots, {
        appId: resolvedAppId,
        appName: resolvedAppName,
        flowId,
        flowName,
        screenshotId,
        screenshotName: stringField(record, "screenshotName") ?? stringField(record, "name") ?? stringField(record, "title"),
        screenshotIndex,
        imageUrl: stringField(record, "imageUrl"),
        platform: stringField(record, "platform"),
        sessionType: stringField(record, "sessionType"),
      });
    }

    Object.values(record).forEach(visit);
  };

  visit(value);
  return { apps, flows, screenshots };
}

export function mergeNorthstarKnownEvidenceIdentities(
  target: NorthstarKnownEvidenceIdentities,
  incoming: NorthstarKnownEvidenceIdentities,
): NorthstarKnownEvidenceIdentities {
  const byApp = new Map(target.apps.map((identity) => [identity.appId, identity]));
  const byFlow = new Map(target.flows.map((identity) => [identity.flowId, identity]));
  const byScreenshot = new Map(target.screenshots.map((identity) => [identity.screenshotId, identity]));
  incoming.apps.forEach((identity) => byApp.set(identity.appId, identity));
  incoming.flows.forEach((identity) => byFlow.set(identity.flowId, identity));
  incoming.screenshots.forEach((identity) => byScreenshot.set(identity.screenshotId, identity));
  target.apps = [...byApp.values()];
  target.flows = [...byFlow.values()];
  target.screenshots = [...byScreenshot.values()];
  return target;
}

export function groundNorthstarExactLookupArguments(
  tool: string,
  args: NorthStarToolArguments,
  known: NorthstarKnownEvidenceIdentities,
): NorthStarToolArguments {
  if (["get_app_details", "get_app_icon", "list_app_flows", "search_app_flows"].includes(tool)) {
    const app = args.appId
      ? known.apps.find((identity) => identity.appId === args.appId)
      : known.apps.find((identity) => normalize(identity.appName) === normalize(args.appName));
    return app ? { ...args, appId: app.appId, appName: app.appName } : args;
  }

  if (tool === "get_flow_details" || tool === "get_flow_screenshots") {
    let candidates = known.flows;
    if (args.appId) candidates = candidates.filter((identity) => identity.appId === args.appId);
    else if (args.appName) candidates = candidates.filter((identity) => normalize(identity.appName) === normalize(args.appName));

    let flow = args.flowId
      ? candidates.find((identity) => identity.flowId === args.flowId) ?? known.flows.find((identity) => identity.flowId === args.flowId)
      : candidates.find((identity) => normalize(identity.flowName) === normalize(args.flowName));
    if (!flow && candidates.length === 1) flow = candidates[0];
    return flow
      ? {
          ...args,
          appId: flow.appId,
          appName: flow.appName,
          flowId: flow.flowId,
          flowName: flow.flowName,
        }
      : args;
  }

  if (tool === "get_screenshot" && args.screenshotId) {
    const screenshot = known.screenshots.find((identity) => identity.screenshotId === args.screenshotId);
    return screenshot
      ? {
          ...args,
          appId: screenshot.appId,
          appName: screenshot.appName,
          flowId: screenshot.flowId,
          flowName: screenshot.flowName,
        }
      : args;
  }

  return args;
}

export function exactIdentityLedgerValues(
  identities: NorthstarKnownEvidenceIdentities,
): NorthstarLedgerValue[] {
  return [
    ...identities.apps.map((identity) => ({
      kind: "app",
      appId: identity.appId,
      appName: identity.appName,
    })),
    ...identities.flows.map((identity) => ({
      kind: "flow",
      appId: identity.appId,
      appName: identity.appName,
      flowId: identity.flowId,
      flowName: identity.flowName,
      ...(identity.platform ? { platform: identity.platform } : {}),
      ...(identity.sessionType ? { sessionType: identity.sessionType } : {}),
    })),
    ...identities.screenshots.map((identity) => ({
      kind: "screenshot",
      appId: identity.appId,
      appName: identity.appName,
      flowId: identity.flowId,
      flowName: identity.flowName,
      screenshotId: identity.screenshotId,
      ...(identity.screenshotName ? { screenshotName: identity.screenshotName } : {}),
      ...(identity.screenshotIndex !== undefined ? { screenshotIndex: identity.screenshotIndex } : {}),
      ...(identity.imageUrl ? { imageUrl: identity.imageUrl } : {}),
      ...(identity.platform ? { platform: identity.platform } : {}),
      ...(identity.sessionType ? { sessionType: identity.sessionType } : {}),
    })),
  ];
}
