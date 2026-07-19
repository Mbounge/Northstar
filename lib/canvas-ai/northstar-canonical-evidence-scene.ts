// lib/canvas-ai/northstar-canonical-evidence-scene.ts
// Northstar v0.6.0.4 — materialized committed evidence state.
import type {
  CanvasCodeArtifactDataBundle,
  NorthstarArtboardMutationOperation,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_CANONICAL_EVIDENCE_SCENE_VERSION = "northstar.materialized-committed-scene.v0.6.0.4";

type Flow = CanvasCodeArtifactDataBundle["flows"][number];
type Screenshot = CanvasCodeArtifactDataBundle["screenshots"][number];
type MutationJournalEntry = { operations: NorthstarArtboardMutationOperation[] };

function normalizeToken(value: unknown, fallback: string): string {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized || fallback;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function normalizeMarkup(value: string): string {
  return value.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

export function canonicalJourneyKind(flow: Flow): string {
  const source = [flow.flowName, flow.sessionType, flow.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/onboard|sign[ -]?up|registration|activation|account creation/.test(source)) return "onboarding";
  if (/checkout|purchase|payment/.test(source)) return "checkout";
  if (/search|browse|discovery/.test(source)) return "discovery";
  const cleaned = source
    .replace(/\b(?:mobile|desktop|web|app|flow|journey|session|experience)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalizeToken(cleaned, "journey");
}

export function canonicalFlowSemanticKey(flow: Flow): string {
  return `${normalizeToken(flow.appName, "app")}--${canonicalJourneyKind(flow)}`;
}

export function canonicalFlowNodeId(flowOrKey: Flow | string): string {
  const key = typeof flowOrKey === "string" ? flowOrKey : canonicalFlowSemanticKey(flowOrKey);
  return `flow-${normalizeToken(key, "journey")}`;
}

export function canonicalizeFlows(flows: CanvasCodeArtifactDataBundle["flows"]): Flow[] {
  const byKey = new Map<string, Flow>();
  for (const flow of flows) {
    const key = canonicalFlowSemanticKey(flow);
    const existing = byKey.get(key);
    if (!existing || flow.screenshotIds.length >= existing.screenshotIds.length) byKey.set(key, flow);
  }
  return [...byKey.values()];
}

function canonicalKeyFromRenderedFlowId(value: string): string | undefined {
  const normalized = normalizeToken(value, "");
  if (!normalized) return undefined;
  const app = normalized.split("-").filter(Boolean)[0];
  if (!app) return undefined;
  if (/onboard|sign-up|registration|activation|account-creation/.test(normalized)) return `${app}--onboarding`;
  if (/checkout|purchase|payment/.test(normalized)) return `${app}--checkout`;
  if (/search|browse|discovery/.test(normalized)) return `${app}--discovery`;
  return undefined;
}

export interface RenderedFlowIdentity {
  nodeId: string;
  rawFlowId: string;
  canonicalKey?: string;
  innerHtml?: string;
  sourceFlowId?: string;
}

export function inspectRenderedFlowIdentities(html: string): RenderedFlowIdentity[] {
  const results: RenderedFlowIdentity[] = [];
  const pattern = /<section\b([^>]*)\bdata-ns-node-id=["']([^"']+)["']([^>]*)\bdata-ns-flow-id=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/section>/gi;
  for (const match of html.matchAll(pattern)) {
    const attributes = `${match[1]} ${match[3]} ${match[5]}`;
    const sourceMatch = attributes.match(/data-ns-source-flow-id=["']([^"']+)["']/i);
    results.push({
      nodeId: match[2],
      rawFlowId: match[4],
      canonicalKey: canonicalKeyFromRenderedFlowId(match[4]),
      innerHtml: match[6],
      sourceFlowId: sourceMatch?.[1],
    });
  }
  return results;
}

export interface MaterializedCommittedEvidenceState {
  flowsByNodeId: Map<string, RenderedFlowIdentity>;
  order: string[];
}

export function materializeCommittedEvidenceState(input: {
  baseHtml: string;
  mutationJournal?: MutationJournalEntry[];
}): MaterializedCommittedEvidenceState {
  const flowsByNodeId = new Map<string, RenderedFlowIdentity>();
  const order: string[] = [];

  const put = (identity: RenderedFlowIdentity, beforeId?: string) => {
    flowsByNodeId.set(identity.nodeId, identity);
    const oldIndex = order.indexOf(identity.nodeId);
    if (oldIndex >= 0) order.splice(oldIndex, 1);
    if (beforeId) {
      const beforeIndex = order.indexOf(beforeId);
      if (beforeIndex >= 0) order.splice(beforeIndex, 0, identity.nodeId);
      else order.push(identity.nodeId);
    } else {
      order.push(identity.nodeId);
    }
  };

  for (const identity of inspectRenderedFlowIdentities(input.baseHtml)) put(identity);

  for (const entry of input.mutationJournal ?? []) {
    for (const operation of entry.operations) {
      if (operation.op === "insert-html") {
        for (const identity of inspectRenderedFlowIdentities(operation.html)) put(identity);
        continue;
      }
      if (operation.op === "remove") {
        flowsByNodeId.delete(operation.targetId);
        const index = order.indexOf(operation.targetId);
        if (index >= 0) order.splice(index, 1);
        continue;
      }
      if (operation.op === "set-html") {
        const existing = flowsByNodeId.get(operation.targetId);
        if (existing) flowsByNodeId.set(operation.targetId, { ...existing, innerHtml: operation.html });
        for (const nested of inspectRenderedFlowIdentities(operation.html)) put(nested);
        continue;
      }
      if (operation.op === "set-attributes") {
        const existing = flowsByNodeId.get(operation.targetId);
        if (!existing) continue;
        const rawFlowId = operation.attributes["data-ns-flow-id"] ?? existing.rawFlowId;
        flowsByNodeId.set(operation.targetId, {
          ...existing,
          rawFlowId,
          canonicalKey: canonicalKeyFromRenderedFlowId(rawFlowId),
          sourceFlowId: operation.attributes["data-ns-source-flow-id"] ?? existing.sourceFlowId,
        });
        continue;
      }
      if (operation.op === "move" && operation.parentId === "evidence") {
        const existing = flowsByNodeId.get(operation.targetId);
        if (existing) put(existing, operation.beforeId);
      }
    }
  }

  return { flowsByNodeId, order };
}

function screenNodeId(flow: Flow, screenshotId: string): string {
  const key = canonicalFlowSemanticKey(flow);
  return `${canonicalFlowNodeId(key)}-screen-${stableHash(`${key}:${screenshotId}`)}`;
}

export function renderCanonicalFlowMarkup(bundle: CanvasCodeArtifactDataBundle, flow: Flow): string {
  const app = bundle.apps.find((candidate) => candidate.name.toLowerCase() === flow.appName.toLowerCase());
  const screensById = new Map(bundle.screenshots.map((screen) => [screen.id, screen]));
  const nodeId = canonicalFlowNodeId(flow);
  const key = canonicalFlowSemanticKey(flow);
  const screens = flow.screenshotIds
    .map((id) => screensById.get(id))
    .filter((screen): screen is Screenshot => Boolean(screen))
    .slice(0, 24);
  const images = screens.map((screen) => {
    const id = screenNodeId(flow, screen.id);
    return `<figure data-ns-node-id="${id}" data-ns-evidence-id="${escapeHtml(screen.id)}"><img data-ns-node-id="${id}-image" src="${escapeHtml(screen.imageUrl ?? "")}" alt="${escapeHtml(screen.title)}"></figure>`;
  }).join("");
  return `<section class="working-flow" data-ns-node-id="${nodeId}" data-ns-flow-id="${escapeHtml(key)}" data-ns-source-flow-id="${escapeHtml(flow.id)}" data-ns-stage="evidence"><div class="working-flow__identity" data-ns-node-id="${nodeId}-identity">${app?.iconUrl ? `<img data-ns-node-id="${nodeId}-icon" src="${escapeHtml(app.iconUrl)}" alt="${escapeHtml(flow.appName)} icon">` : ""}<div><strong data-ns-node-id="${nodeId}-app-name">${escapeHtml(flow.appName)}</strong><span data-ns-node-id="${nodeId}-flow-name">${escapeHtml(flow.flowName)}</span></div></div><div class="working-flow__sequence" data-ns-node-id="${nodeId}-sequence">${images || `<p class="working-empty" data-ns-node-id="${nodeId}-empty">Grounded screens are arriving.</p>`}</div></section>`;
}

function innerFlowMarkup(markup: string): string {
  return markup.replace(/^<section[^>]*>/, "").replace(/<\/section>$/, "");
}

export function buildCanonicalEvidenceOperations(input: {
  currentHtml: string;
  currentJournal?: MutationJournalEntry[];
  nextBundle: CanvasCodeArtifactDataBundle;
  maxFlows?: number;
}): NorthstarArtboardMutationOperation[] {
  const operations: NorthstarArtboardMutationOperation[] = [];
  const nextFlows = canonicalizeFlows(input.nextBundle.flows).slice(0, input.maxFlows ?? 4);
  const materialized = materializeCommittedEvidenceState({
    baseHtml: input.currentHtml,
    mutationJournal: input.currentJournal,
  });
  const rendered = [...materialized.flowsByNodeId.values()];
  const renderedByKey = new Map<string, RenderedFlowIdentity[]>();
  for (const identity of rendered) {
    if (!identity.canonicalKey) continue;
    const entries = renderedByKey.get(identity.canonicalKey) ?? [];
    entries.push(identity);
    renderedByKey.set(identity.canonicalKey, entries);
  }

  for (const flow of nextFlows) {
    const key = canonicalFlowSemanticKey(flow);
    const canonicalNode = canonicalFlowNodeId(key);
    const matchingRendered = renderedByKey.get(key) ?? [];
    const currentCanonical = matchingRendered.find((item) => item.nodeId === canonicalNode);
    const markup = renderCanonicalFlowMarkup(input.nextBundle, flow);
    const desiredInner = innerFlowMarkup(markup);

    if (currentCanonical) {
      if (normalizeMarkup(currentCanonical.innerHtml ?? "") !== normalizeMarkup(desiredInner)) {
        operations.push({ op: "set-html", targetId: canonicalNode, html: desiredInner });
        operations.push({
          op: "set-attributes",
          targetId: canonicalNode,
          attributes: {
            "data-ns-flow-id": key,
            "data-ns-source-flow-id": flow.id,
            "data-ns-stage": "evidence",
          },
        });
      }
    } else {
      operations.push({ op: "insert-html", targetId: "evidence", position: "beforeend", html: markup });
    }

    for (const legacy of matchingRendered) {
      if (legacy.nodeId !== canonicalNode) operations.push({ op: "remove", targetId: legacy.nodeId });
    }
  }

  const nextKeys = new Set(nextFlows.map(canonicalFlowSemanticKey));
  for (const identity of rendered) {
    if (identity.canonicalKey && !nextKeys.has(identity.canonicalKey)) {
      operations.push({ op: "remove", targetId: identity.nodeId });
    }
  }

  const desiredOrder = nextFlows.map(canonicalFlowNodeId);
  const currentOrder = materialized.order.filter((nodeId) => desiredOrder.includes(nodeId));
  const orderDiffers = desiredOrder.length !== currentOrder.length || desiredOrder.some((nodeId, index) => currentOrder[index] !== nodeId);
  if (orderDiffers) {
    let beforeId: string | undefined;
    for (const nodeId of [...desiredOrder].reverse()) {
      operations.push({ op: "move", targetId: nodeId, parentId: "evidence", beforeId });
      beforeId = nodeId;
    }
  }

  assertCanonicalEvidenceOperations(operations);
  return operations;
}

export function assertCanonicalEvidenceOperations(operations: NorthstarArtboardMutationOperation[]): void {
  const insertedKeys = new Set<string>();
  for (const operation of operations) {
    if (operation.op === "set-text" && operation.targetId === "title") {
      throw new Error("Canonical evidence mutations may not overwrite the model-authored visible title.");
    }
    if (operation.op !== "insert-html") continue;
    for (const identity of inspectRenderedFlowIdentities(operation.html)) {
      const key = identity.canonicalKey;
      if (!key) throw new Error(`Inserted flow ${identity.nodeId} does not expose a canonical journey identity.`);
      if (identity.nodeId !== canonicalFlowNodeId(key)) {
        throw new Error(`Inserted flow ${identity.nodeId} is not the canonical node for ${key}.`);
      }
      if (insertedKeys.has(key)) throw new Error(`Canonical mutation attempted to insert ${key} more than once.`);
      insertedKeys.add(key);
    }
    if (/mobile-mobile|onboarding-mobile-onboarding|mobile-onboarding-mobile-onboarding/i.test(operation.html)) {
      throw new Error("Legacy repeated-token flow identity escaped canonical reconciliation.");
    }
  }
}
