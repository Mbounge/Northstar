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
