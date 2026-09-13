import type { CanvasV2ProviderAttemptAudit } from "./request-reliability";

/** A planned search is not a receipt. Only the validated researcher result qualifies. */
export function canvasV2HasConfirmedWebSearch(attempts: readonly CanvasV2ProviderAttemptAudit[]): boolean {
  return attempts.some(attempt => attempt.role === "external-researcher" && attempt.outcome === "completed");
}

export interface CanvasV2Activity {
  id: string;
  requestId: string;
  sequence: number;
  at: string;
  kind: "activity" | "progress";
  operationId?: string;
  tool?: "web-search" | "web-page";
  status?: "started" | "completed" | "failed" | "cancelled";
  label: string;
  detail?: string;
  sources?: Array<{ label: string; href: string }>;
  apps?: Array<{ name: string; iconUrl?: string }>;
}

/** Replace the same operation as it settles; duplicate delivery is harmless. */
export function mergeCanvasV2Activity(current: readonly CanvasV2Activity[], event: CanvasV2Activity): CanvasV2Activity[] {
  const previous = current.find(item => item.id === event.id);
  if (previous && previous.sequence >= event.sequence) return [...current];
  return previous ? current.map(item => item.id === event.id ? event : item) : [...current, event];
}

/** Internal drafts are attempts within work, not separate user-visible failures. */
export function canvasV2ActivitySummary(items: readonly CanvasV2Activity[], active: boolean): string {
  const internal = new Set(["Planning the composition", "Composing the canvas", "Investigating the next question", "Checking the explanation against sources", "Assessing the explanation", "Chose a research question", "Reviewed the final explanation", "Chose the next step"]);
  const latest = new Map<string, CanvasV2Activity>();
  for (const item of items) latest.set(item.label, item);
  return Array.from(latest.values(), item => {
    if (item.status === "started") return `${item.label}${active ? "…" : " interrupted"}`;
    if (internal.has(item.label) || item.status === "completed") return item.label;
    return `${item.label} ${item.status}`;
  }).join(" · ");
}
