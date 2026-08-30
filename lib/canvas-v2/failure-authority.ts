import { CanvasV2RequestError, type CanvasV2FailureCode } from "@/lib/canvas-v2/request-reliability";

export type CanvasV2FailureAuthority =
  | "private-contract"
  | "public-infrastructure"
  | "public-input"
  | "silent-cancel";

const INFRASTRUCTURE_CODES = new Set<CanvasV2FailureCode>([
  "configuration",
  "rate-limited",
  "timeout",
  "transport",
  "provider-unavailable",
  "provider-rejected",
  "server-unavailable",
]);

/**
 * One authority owns every failure. Deterministic draft/render failures are
 * North Star's private implementation concern; provider, network, and workspace
 * availability may be reported; cancellation stays silent; genuinely invalid
 * human input may ask for a correction.
 */
export function canvasV2FailureAuthority(error: unknown): CanvasV2FailureAuthority {
  if (error instanceof DOMException && error.name === "AbortError") return "silent-cancel";
  if (!(error instanceof CanvasV2RequestError)) return "private-contract";
  if (error.code === "cancelled") return "silent-cancel";
  if (error.code === "invalid-response") return "private-contract";
  if (error.code === "invalid-request") return "public-input";
  return INFRASTRUCTURE_CODES.has(error.code) ? "public-infrastructure" : "private-contract";
}

export function canvasV2PrivateFailureFingerprint(
  kind: "phase-contract" | "render-integrity" | "capture",
  failures: readonly string[],
): string {
  const normalized = failures
    .map((failure) => failure.toLowerCase().replace(/\b(?:revision|run|candidate)-[a-z0-9:_-]+\b/gi, "<id>").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort()
    .join(" | ");
  let hash = 2_166_136_261;
  const source = `${kind}:${normalized}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${kind}:${(hash >>> 0).toString(36)}`;
}
