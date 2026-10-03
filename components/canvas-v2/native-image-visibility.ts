export interface CanvasV2ImageVisibilityObserver {
  refresh: () => void;
  dispose: () => void;
}

/** Public-camera paint optimization only: never changes scene data or sources. */
export function observeCanvasV2ImageVisibility(scene: HTMLElement): CanvasV2ImageVisibilityObserver {
  if (typeof IntersectionObserver === "undefined") return { refresh: () => {}, dispose: () => {} };
  // A captured flow is one complete source sequence. Never hide its distant
  // screens while the user pans across a long lane: the observer callback can
  // arrive after the camera has moved and makes those screens pop in late.
  const selector = 'img[data-canvas-v2-native-scene-id]:not([data-canvas-v2-evidence-role="canonical"])';
  const observed = new Set<HTMLImageElement>();
  let disposed = false;
  const observer = new IntersectionObserver((entries) => {
    if (disposed) return;
    for (const entry of entries) {
      // Intersection uses geometry, not CSS visibility. Hidden images therefore
      // re-enter normally after a pan, zoom, resize, or object move. Keep a wide
      // screen-space buffer so they start painting before reaching the viewport.
      if (observed.has(entry.target as HTMLImageElement)) entry.target.toggleAttribute("data-canvas-v2-image-offscreen", !entry.isIntersecting);
    }
  }, {
    root: scene.closest<HTMLElement>("[data-canvas-v2-native-wheel-capture]"),
    rootMargin: "1024px",
    threshold: 0,
  });
  const refresh = () => {
    if (disposed) return;
    const current = new Set(scene.querySelectorAll<HTMLImageElement>(selector));
    for (const image of observed) {
      if (current.has(image)) continue;
      observer.unobserve(image);
      observed.delete(image);
      image.removeAttribute("data-canvas-v2-image-offscreen");
    }
    // Retain the observer and the offscreen state of unchanged images across
    // scene revisions. Resetting both after every edit briefly paints every
    // distant screenshot and makes dense boards stall on pointer release.
    for (const image of current) {
      if (observed.has(image)) continue;
      observed.add(image);
      observer.observe(image);
    }
  };
  refresh();
  return {
    refresh,
    dispose: () => {
      disposed = true;
      observer.disconnect();
      observed.clear();
    },
  };
}
