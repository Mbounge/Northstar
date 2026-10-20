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
  const rememberVisibility=(images:HTMLImageElement[])=>{
    // Read styles as one batch, before writing any culling markers. Source
    // revisions can change authored visibility while an image remains offscreen.
    const culled=images.filter(image=>image.hasAttribute('data-canvas-v2-image-offscreen'));
    for(const image of culled)image.removeAttribute('data-canvas-v2-image-offscreen');
    try{const values=images.map(image=>typeof getComputedStyle==='function'?getComputedStyle(image).visibility:'visible');images.forEach((image,i)=>image.setAttribute('data-canvas-v2-image-authored-visibility',values[i]))}
    finally{for(const image of culled)image.setAttribute('data-canvas-v2-image-offscreen','')}
  };
  const observer = new IntersectionObserver((entries) => {
    if (disposed) return;
    const current=entries.filter(entry=>observed.has(entry.target as HTMLImageElement));
    rememberVisibility(current.filter(entry=>!entry.isIntersecting&&!entry.target.hasAttribute('data-canvas-v2-image-authored-visibility')).map(entry=>entry.target as HTMLImageElement));
    for(const entry of current){entry.target.toggleAttribute('data-canvas-v2-image-offscreen',!entry.isIntersecting);if(entry.isIntersecting)entry.target.removeAttribute('data-canvas-v2-image-authored-visibility')}
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
      image.removeAttribute("data-canvas-v2-image-authored-visibility");
    }
    rememberVisibility([...current].filter(image=>image.hasAttribute('data-canvas-v2-image-offscreen')));
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
