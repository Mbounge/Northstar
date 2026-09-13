export const CANVAS_V2_MEDIA_TOGGLE_EVENT = "canvas-v2:toggle-media";
export const CANVAS_V2_MEDIA_STATE_EVENT = "canvas-v2:media-state";
export const MEDIA_ATTRIBUTE = "data-canvas-v2-media";
export interface CanvasV2PlayableMedia { version: 1; type: "video" | "gif"; src: string; evidenceId: string; description: string; }
/** Only host-owned players may embed supported watch URLs. Never accept arbitrary iframe URLs. */
export function canvasV2VideoEmbedUrl(src: string): string | undefined {
  let url: URL; try { url = new URL(src); } catch { return undefined; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
  const host = url.hostname.toLowerCase();
  const youtube = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host);
  const id = host === "youtu.be" ? url.pathname.slice(1) : youtube
    ? url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts)\/([\w-]+)$/.exec(url.pathname)?.[1]
    : undefined;
  if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  const vimeo = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host) ? /^\/(?:video\/)?(\d+)$/.exec(url.pathname)?.[1] : undefined;
  return vimeo ? `https://player.vimeo.com/video/${vimeo}` : undefined;
}
export function parseCanvasV2PlayableMedia(raw: string): CanvasV2PlayableMedia {
  if (raw.length > 12000) throw new Error("The media reference is too large.");
  const value = JSON.parse(raw) as CanvasV2PlayableMedia;
  if (!value || value.version !== 1 || !["video", "gif"].includes(value.type) || typeof value.src !== "string" || value.src.length > 8000 || typeof value.evidenceId !== "string" || !value.evidenceId || typeof value.description !== "string" || value.description.length > 1800) throw new Error("Invalid playable media reference.");
  const url = new URL(value.src);
  if (!["https:", "http:", "blob:"].includes(url.protocol) || url.username || url.password || (url.protocol === "blob:" && !/^blob:https?:\/\//.test(value.src))) throw new Error("Use a direct hosted video/GIF URL or a local media upload.");
  return { version: 1, type: value.type, src: value.src, evidenceId: value.evidenceId, description: value.description };
}
export function readCanvasV2PlayableMedia(html: string): CanvasV2PlayableMedia[] {
  return [...html.matchAll(/\bdata-canvas-v2-media\s*=\s*(["'])([\s\S]*?)\1/g)].map(match => parseCanvasV2PlayableMedia(match[2].replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")));
}


export function canvasV2MediaDisplaySize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("The media has no readable frame dimensions.");
  const scale = Math.min(480 / width, 360 / height, 1);
  return { width: width * scale, height: height * scale };
}

/** Read frame dimensions locally; never extract or send frames to the model. */
export function measureCanvasV2PlayableMedia(src: string, type: "video" | "gif"): Promise<{ width: number; height: number }> {
  if (type === "video" && canvasV2VideoEmbedUrl(src)) return Promise.resolve({ width: 480, height: 270 });
  return new Promise((resolve, reject) => {
    const element = type === "video" ? document.createElement("video") : new Image();
    const readyEvent = type === "video" ? "loadedmetadata" : "load";
    const cleanup = () => {
      clearTimeout(timeout); element.removeEventListener(readyEvent, ready); element.removeEventListener("error", failed);
      element.removeAttribute("src");
      if (element instanceof HTMLVideoElement) element.load();
    };
    const failed = () => { cleanup(); reject(new Error("This media could not be loaded. Choose a playable MP4, WebM or GIF file.")); };
    const ready = () => {
      try {
        const dimensions = element instanceof HTMLVideoElement ? { width: element.videoWidth, height: element.videoHeight } : { width: element.naturalWidth, height: element.naturalHeight };
        const size = canvasV2MediaDisplaySize(dimensions.width, dimensions.height);
        cleanup(); resolve(size);
      } catch { failed(); }
    };
    const timeout = setTimeout(failed, 15000);
    element.addEventListener(readyEvent, ready); element.addEventListener("error", failed);
    if (element instanceof HTMLVideoElement) element.preload = "metadata";
    element.src = src;
  });
}
