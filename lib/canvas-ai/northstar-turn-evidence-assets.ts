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

function collectRequestedScreenshotIds(value: NorthstarLedgerValue | undefined): Set<string> {
  const ids = new Set<string>();
  const stack: unknown[] = value === undefined ? [] : [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (!isRecord(current)) continue;
    for (const key of ["screenshotId", "screenshot_id"]) {
      const id = current[key];
      if (typeof id === "string" && id.trim()) ids.add(id.trim());
    }
    for (const key of ["screenshotIds", "screenshot_ids", "candidateScreenshotIds"]) {
      const values = current[key];
      if (Array.isArray(values)) {
        values.forEach((id) => {
          if (typeof id === "string" && id.trim()) ids.add(id.trim());
        });
      }
    }
    Object.values(current).forEach((entry) => stack.push(entry));
  }
  return ids;
}

function collectFromValue(
  value: NorthstarLedgerValue | undefined,
  candidates: Candidate[],
  seenIds: Set<string>,
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
    const id = stringField(current, "screenshotId", "screenshot_id", "id");
    if (imageUrl && id && !seenIds.has(id)) {
      seenIds.add(id);
      const appName = stringField(current, "appName", "app_name");
      const flowName = stringField(current, "flowName", "flow_name");
      const contextualTitle = [appName, flowName].filter(Boolean).join(" · ");
      const title = stringField(current, "title", "name", "displayLabel", "display_label")
        ?? (contextualTitle || "Northstar evidence screenshot");
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

function balancedSelection(
  candidates: Candidate[],
  maximum: number,
  requestedIds: Set<string>,
): NorthstarTurnEvidenceAsset[] {
  const ordered = [...candidates].sort((left, right) => {
    const leftRequested = requestedIds.has(left.id) ? 0 : 1;
    const rightRequested = requestedIds.has(right.id) ? 0 : 1;
    return leftRequested - rightRequested
      || (left.screenshotIndex ?? Number.MAX_SAFE_INTEGER) - (right.screenshotIndex ?? Number.MAX_SAFE_INTEGER)
      || left.order - right.order;
  });
  const groups = new Map<string, Candidate[]>();
  for (const candidate of ordered) {
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
 * Builds an explicit, identity-stable visual evidence manifest. Current task
 * evidence is authoritative. Previous attempts are consulted only when the
 * task intentionally reuses committed evidence or the current tool call did not
 * produce image-backed records.
 */
export function collectNorthstarTurnEvidenceAssets(input: {
  toolContext?: NorthstarLedgerValue;
  ledgerContext: NorthstarLedgerLLMContext;
  executionInput?: NorthstarLedgerValue;
  maximum?: number;
}): NorthstarTurnEvidenceAsset[] {
  const maximum = Math.max(1, Math.min(24, input.maximum ?? DEFAULT_MAX_ASSETS));
  const candidates: Candidate[] = [];
  const seenIds = new Set<string>();
  const requestedIds = collectRequestedScreenshotIds(input.executionInput);

  collectFromValue(input.toolContext, candidates, seenIds, 0);
  const reuseCommittedEvidence = isRecord(input.executionInput)
    && input.executionInput.reuseCommittedEvidence === true;
  if (candidates.length === 0 || reuseCommittedEvidence) {
    const recentAttempts = [...input.ledgerContext.attempts].reverse();
    recentAttempts.forEach((attempt, index) => {
      collectFromValue(attempt.evidence, candidates, seenIds, (index + 1) * 100_000);
    });
  }

  return balancedSelection(candidates, maximum, requestedIds);
}
