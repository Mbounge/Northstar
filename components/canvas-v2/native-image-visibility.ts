/** Public-camera paint optimization only: never changes scene data or sources. */
export function observeCanvasV2ImageVisibility(scene: HTMLElement): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  // A captured flow is one complete source sequence. Never hide its distant
  // screens while the user pans across a long lane: the observer callback can
  // arrive after the camera has moved and makes those screens pop in late.
  const images = Array.from(scene.querySelectorAll<HTMLImageElement>(
    'img[data-canvas-v2-native-scene-id]:not([data-canvas-v2-evidence-role="canonical"])',
  ));
  let disposed = false;
  const observer = new IntersectionObserver((entries) => {
    if (disposed) return;
    for (const entry of entries) {
      // Intersection uses geometry, not CSS visibility. Hidden images therefore
      // re-enter normally after a pan, zoom, resize, or object move. Keep a wide
      // screen-space buffer so they start painting before reaching the viewport.
      entry.target.toggleAttribute("data-canvas-v2-image-offscreen", !entry.isIntersecting);
    }
  }, {
    root: scene.closest<HTMLElement>("[data-canvas-v2-native-wheel-capture]"),
    rootMargin: "1024px",
    threshold: 0,
  });
  // Start visible. Do not gate the initial rail on an observer callback or
  // unmount images: every source stays loaded, selectable, and exportable.
  for (const image of images) observer.observe(image);
  return () => {
    disposed = true;
    observer.disconnect();
    for (const image of images) image.removeAttribute("data-canvas-v2-image-offscreen");
  };
}
