import type { SupabaseClient } from "@supabase/supabase-js";

export type ReviewPlatform = "mobile" | "web" | string | undefined;

export interface ReviewScreenshotLocation {
  supabaseUrl?: string;
  tenantId: string;
  appName: string;
  platform?: ReviewPlatform;
  sessionType: string;
  storagePrefix?: string;
}

function storageSegment(value: string): string {
  return value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

export function isAbsoluteReviewMediaUrl(value?: string): boolean {
  return Boolean(value && (/^https?:\/\//i.test(value) || value.startsWith("data:image/")));
}

export function reviewScreenshotFileName(value?: string): string | undefined {
  const file = value?.split(/[?#]/, 1)[0]?.split("/").filter(Boolean).pop();
  return file?.trim() || undefined;
}

export function reviewScreenshotBaseUrl(input: ReviewScreenshotLocation): string | undefined {
  const base = input.supabaseUrl?.replace(/\/$/, "");
  if (!base || !input.sessionType.trim()) return undefined;
  const prefix = input.storagePrefix?.replace(/^\/+|\/+$/g, "");
  const path = [input.tenantId, input.appName, prefix, input.sessionType, "screenshots"]
    .filter((part): part is string => Boolean(part))
    .map(storageSegment)
    .join("/");
  return `${base}/storage/v1/object/public/reviews/${path}`;
}

export function canonicalReviewScreenshotUrl(reference: string | undefined, input: ReviewScreenshotLocation): string | undefined {
  if (!reference) return undefined;
  if (isAbsoluteReviewMediaUrl(reference)) return reference;
  const file = reviewScreenshotFileName(reference);
  const base = reviewScreenshotBaseUrl(input);
  return file && base ? `${base}/${encodeURIComponent(file)}` : undefined;
}

function candidatePrefixes(platform: ReviewPlatform): string[] {
  if (platform === "web") return ["web"];
  if (platform === "mobile") return ["", "mobile"];
  return [""];
}

/**
 * Resolve the physical review-storage layout once at the data boundary. Older
 * tenants store mobile captures directly under the app while newer captures
 * may use a /mobile segment. Renderers must never guess between those layouts.
 */
export async function resolveReviewScreenshotStoragePrefix(input: {
  storage: SupabaseClient["storage"];
  tenantId: string;
  appName: string;
  platform?: ReviewPlatform;
  sessionType: string;
  reference?: string;
}): Promise<string> {
  const candidates = candidatePrefixes(input.platform);
  if (candidates.length === 1) return candidates[0];
  const reference = reviewScreenshotFileName(input.reference);
  const bucket = input.storage.from("reviews");
  const probes = await Promise.all(candidates.map(async (prefix) => {
    const path = [input.tenantId, input.appName, prefix, input.sessionType, "screenshots"].filter(Boolean).join("/");
    try {
      const { data, error } = await bucket.list(path, {
        limit: reference ? 20 : 1,
        ...(reference ? { search: reference } : {}),
      });
      const names = error ? [] : (data ?? []).map((entry) => entry.name);
      return {
        prefix,
        exact: Boolean(reference && names.some((name) => name.toLowerCase() === reference.toLowerCase())),
        populated: names.length > 0,
      };
    } catch {
      return { prefix, exact: false, populated: false };
    }
  }));
  return probes.find((probe) => probe.exact)?.prefix
    ?? probes.find((probe) => probe.populated)?.prefix
    ?? candidates[0];
}
