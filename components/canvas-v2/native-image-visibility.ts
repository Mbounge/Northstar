/** Public-camera paint optimization only: never changes scene data or sources. */
export function observeCanvasV2ImageVisibility(scene: HTMLElement): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const images = Array.from(scene.querySelectorAll<HTMLImageElement>("img[data-canvas-v2-native-scene-id]"));
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
    rootMargin: "512px",
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
