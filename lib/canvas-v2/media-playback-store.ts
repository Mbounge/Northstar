/** Lightweight playback metadata. Only the selected control subscribes; camera
 * visibility changes must never invalidate the entire workspace. */
export function createCanvasV2MediaPlaybackStore() {
  const playing = new Map<string, boolean>();
  const subscribers = new Map<string, Set<() => void>>();
  return {
    playing: (nodeId: string) => playing.get(nodeId) ?? false,
    receive(event: Event) {
      const detail = (event as CustomEvent<{ nodeId: string; playing: boolean }>).detail;
      if (!detail || typeof detail.nodeId !== 'string' || typeof detail.playing !== 'boolean'
        || (playing.get(detail.nodeId) ?? false) === detail.playing) return;
      if (detail.playing) playing.set(detail.nodeId, true); else playing.delete(detail.nodeId);
      for (const notify of subscribers.get(detail.nodeId) ?? []) notify();
    },
    subscribe(nodeId: string, notify: () => void) {
      const listeners = subscribers.get(nodeId) ?? new Set<() => void>();
      listeners.add(notify); subscribers.set(nodeId, listeners);
      return () => { listeners.delete(notify); if (!listeners.size && subscribers.get(nodeId) === listeners) subscribers.delete(nodeId); };
    },
  };
}

export type CanvasV2MediaPlaybackStore = ReturnType<typeof createCanvasV2MediaPlaybackStore>;
export interface CanvasV2RetainedMediaPlayback { currentTime?: number; userPaused?: boolean; }

/** Keep a few recently viewed native decoders warm. Visible media never compete
 * for the offscreen budget; leaving view pauses playback in the component. */
export function createCanvasV2WarmMediaRetention({ maxOffscreen = 4, ttlMs = 45_000, timers = {
  set: (run: () => void, delay: number) => setTimeout(run, delay),
  clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
} } = {}) {
  if (!Number.isInteger(maxOffscreen) || maxOffscreen < 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Use a bounded native media retention policy.');
  type Entry = { visible: boolean; order: number; evict: () => void; timer?: ReturnType<typeof setTimeout> };
  const entries = new Map<object, Entry>();
  let order = 0;
  const remove = (owner: object) => {
    const entry = entries.get(owner);
    if (entry?.timer !== undefined) timers.clear(entry.timer);
    entries.delete(owner);
  };
  const evict = (owner: object, entry: Entry) => {
    if (entries.get(owner) !== entry || entry.visible) return;
    remove(owner); entry.evict();
  };
  return {
    visible(owner: object, release: () => void) {
      remove(owner);
      entries.set(owner, { visible: true, order: ++order, evict: release });
    },
    offscreen(owner: object) {
      const entry = entries.get(owner);
      if (!entry || !entry.visible) return;
      entry.visible = false; entry.order = ++order;
      entry.timer = timers.set(() => evict(owner, entry), ttlMs);
      const offscreen = [...entries].filter(([, value]) => !value.visible).sort((a, b) => a[1].order - b[1].order);
      for (const [key, value] of offscreen.slice(0, Math.max(0, offscreen.length - maxOffscreen))) evict(key, value);
    },
    remove,
    dispose() { for (const owner of entries.keys()) remove(owner); },
  };
}

/** Shared across native GIF/video objects in this window, not authored apps or
 * provider iframes whose playback cannot be controlled safely here. */
export const canvasV2WarmMediaRetention = createCanvasV2WarmMediaRetention();

export function rememberCanvasV2MediaTime(playback: CanvasV2RetainedMediaPlayback, video: Pick<HTMLVideoElement, "readyState" | "currentTime">) {
  if (video.readyState >= 1 && Number.isFinite(video.currentTime)) playback.currentTime = video.currentTime;
}

export function releaseCanvasV2VideoSource(playback: CanvasV2RetainedMediaPlayback, video: Pick<HTMLVideoElement, "readyState" | "currentTime" | "currentSrc" | "getAttribute" | "load">) {
  // Removing src alone can leave the previously selected resource decoded.
  // Read the committed attribute to protect a source reattached by a quick pan.
  if (video.getAttribute("src") !== null || (!video.currentSrc && video.readyState === 0)) return false;
  rememberCanvasV2MediaTime(playback, video);
  video.load();
  return true;
}

export function restoreCanvasV2MediaTime(playback: CanvasV2RetainedMediaPlayback, video: Pick<HTMLVideoElement, "duration" | "currentTime">) {
  const time = playback.currentTime;
  if (time === undefined || !Number.isFinite(time) || time <= 0) return;
  const target = Number.isFinite(video.duration) ? Math.min(time, Math.max(0, video.duration - 0.01)) : time;
  try { video.currentTime = target; } catch { /* A source may not yet permit seeking. */ }
}
