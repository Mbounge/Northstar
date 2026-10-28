export interface FlowCapture {
  role: "app_splash" | "overview_reel";
  kind: "video";
  url: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
}

/** Keep the native app proportions instead of baking letterboxing into a phone. */
export function captureAspectRatio(asset?: { width?: number; height?: number }): string {
  return Number.isInteger(asset?.width) && Number.isInteger(asset?.height)
    && asset!.width! > 0 && asset!.height! > 0 && asset!.width! <= 16384 && asset!.height! <= 16384
    ? `${asset!.width} / ${asset!.height}` : "9 / 20";
}

/** Presentation captures are separate from the ordered screen catalog. */
export function resolveFlowCaptures(manifest: unknown, sessionBase: string): FlowCapture[] {
  const assets = (manifest as { assets?: unknown[] } | null)?.assets;
  if (!Array.isArray(assets)) return [];
  const base = new URL(sessionBase.endsWith("/") ? sessionBase : `${sessionBase}/`);
  return (["app_splash", "overview_reel"] as const).flatMap((role) => {
    const asset = assets.find((value: any) => value?.role === role && value?.kind === "video") as
      { file?: string; duration_seconds?: number; width?: number; height?: number } | undefined;
    if (!asset || typeof asset.file !== "string" || !/^media\/[\w.-]+\.mp4$/.test(asset.file)) return [];
    const url = new URL(asset.file, base);
    // A manifest must never redirect capture playback outside its own tenant/session.
    if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}media/`)
      || !url.pathname.endsWith(".mp4") || url.search || url.hash) return [];
    return [{ ...(captureAspectRatio(asset) !== "9 / 20" ? { width: asset.width, height: asset.height } : {}), role, kind: "video" as const, url: url.href,
      ...(Number.isFinite(asset.duration_seconds) && asset.duration_seconds! > 0
        ? { duration_seconds: asset.duration_seconds } : {}) }];
  });
}
