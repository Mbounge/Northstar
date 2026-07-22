import type {
  NorthstarLedgerLLMContext,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";
import type { NorthstarTurnEvidenceAsset } from "@/lib/canvas-ai/northstar-turn-protocol";

const DEFAULT_MAX_ASSETS = 12;
const MAX_SCAN_NODES = 25_000;

type Candidate = NorthstarTurnEvidenceAsset & { order: number; group: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function collectFromValue(
  value: NorthstarLedgerValue | undefined,
  candidates: Candidate[],
  seenUrls: Set<string>,
  orderOffset: number,
): void {
  if (value === undefined) return;
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_SCAN_NODES) {
    const current = stack.pop();
    visited += 1;
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
      continue;
    }
    if (!isRecord(current)) continue;

    const imageUrl = safeImageUrl(current.imageUrl);
    if (imageUrl && !seenUrls.has(imageUrl)) {
      seenUrls.add(imageUrl);
      const appName = stringField(current, "appName", "app_name");
      const flowName = stringField(current, "flowName", "flow_name");
      const contextualTitle = [appName, flowName].filter(Boolean).join(" · ");
      const title = stringField(current, "title", "name", "displayLabel", "display_label")
        ?? (contextualTitle || "Northstar evidence screenshot");
      const id = stringField(current, "id", "screenshotId", "screenshot_id")
        ?? `evidence-${orderOffset + candidates.length + 1}`;
      const screenshotIndex = numberField(current, "screenshotIndex", "index", "screenIndex", "screen_index");
      candidates.push({
        id,
        title,
        imageUrl,
        appName,
        flowName,
        screenshotIndex,
        order: orderOffset + candidates.length,
        group: `${appName ?? "unknown-app"}::${flowName ?? "unknown-flow"}`,
      });
    }

    for (const entry of Object.values(current)) stack.push(entry);
  }
}

function balancedSelection(candidates: Candidate[], maximum: number): NorthstarTurnEvidenceAsset[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates.sort((left, right) => left.order - right.order)) {
    const group = groups.get(candidate.group) ?? [];
    group.push(candidate);
    groups.set(candidate.group, group);
  }
  const queues = Array.from(groups.values());
  const selected: Candidate[] = [];
  while (queues.length > 0 && selected.length < maximum) {
    for (let index = 0; index < queues.length && selected.length < maximum;) {
      const queue = queues[index];
      const next = queue.shift();
      if (next) selected.push(next);
      if (queue.length === 0) queues.splice(index, 1);
      else index += 1;
    }
  }
  return selected.map(({ order: _order, group: _group, ...asset }) => asset);
}

/**
 * Extracts a balanced bounded set of screenshot assets from authoritative tool
 * evidence. Current-attempt evidence is prioritized, followed by recent ledger
 * evidence. Model-authored result values are intentionally not trusted as asset
 * sources.
 */
export function collectNorthstarTurnEvidenceAssets(input: {
  toolContext?: NorthstarLedgerValue;
  ledgerContext: NorthstarLedgerLLMContext;
  maximum?: number;
}): NorthstarTurnEvidenceAsset[] {
  const maximum = Math.max(1, Math.min(24, input.maximum ?? DEFAULT_MAX_ASSETS));
  const candidates: Candidate[] = [];
  const seenUrls = new Set<string>();

  collectFromValue(input.toolContext, candidates, seenUrls, 0);
  const recentAttempts = [...input.ledgerContext.attempts].reverse();
  recentAttempts.forEach((attempt, index) => {
    collectFromValue(attempt.evidence, candidates, seenUrls, (index + 1) * 100_000);
  });

  return balancedSelection(candidates, maximum);
}
