"use client";

import { useLayoutEffect, type RefObject } from "react";

type Bounds = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export function canvasV2PopoverTranslation(popup: Bounds, anchor: Bounds, viewport: { width: number; height: number }) {
  const margin = 12;
  const gap = 10;
  const above = popup.bottom <= anchor.top;
  let top = popup.top;
  if (above && top < margin && anchor.bottom + gap + popup.height <= viewport.height - margin) top = anchor.bottom + gap;
  else if (!above && popup.bottom > viewport.height - margin && anchor.top - gap - popup.height >= margin) top = anchor.top - gap - popup.height;
  top = Math.max(margin, Math.min(viewport.height - margin - popup.height, top));
  const left = Math.max(margin, Math.min(viewport.width - margin - popup.width, popup.left));
  return { x: left - popup.left, y: top - popup.top };
}

/** Keep menus in their toolbar DOM so text selections and outside-click ownership survive. */
function placePopovers(toolbar: HTMLElement | null, menu: string | undefined) {
  if (!toolbar || !menu) return;
  for (const popup of toolbar.querySelectorAll<HTMLElement>("[data-canvas-v2-popover]")) {
    // Reset only our correction; the menu's CSS retains its original anchor.
    popup.style.translate = "";
    popup.style.maxWidth = "calc(100vw - 24px)";
    popup.style.maxHeight = "calc(100vh - 24px)";
    popup.style.overflow = "auto";
    const anchor = (popup.offsetParent ?? toolbar).getBoundingClientRect();
    const delta = canvasV2PopoverTranslation(popup.getBoundingClientRect(), anchor, { width: window.innerWidth, height: window.innerHeight });
    popup.style.translate = `${delta.x}px ${delta.y}px`;
  }
}

export function useCanvasV2PopoverViewport(root: RefObject<HTMLElement | null>, menu: string | undefined) {
  // Reposition after toolbar movement as well as menu changes, before paint.
  useLayoutEffect(() => placePopovers(root.current, menu));
  useLayoutEffect(() => {
    if (!menu || !root.current) return;
    const place = () => placePopovers(root.current, menu);
    const observer = new ResizeObserver(place);
    observer.observe(root.current);
    root.current.querySelectorAll("[data-canvas-v2-popover]").forEach(popup => observer.observe(popup));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [menu, root]);
}
