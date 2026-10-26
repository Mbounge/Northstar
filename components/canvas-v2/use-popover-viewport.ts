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
    // Retain the menu's CSS centring. Replacing translate with just our pixel
    // correction drops Tailwind's -50% anchor and makes repeated clamps drift.
    const computed = getComputedStyle(popup);
    const base = (axis: string) => {
      const value = computed.getPropertyValue(`--tw-translate-${axis}`).trim();
      // Tailwind's unitless zero is valid for translate, but not in a calc sum
      // with a length. Resolve it before adding the viewport correction.
      return !value || value === "0" ? "0px" : value;
    };
    popup.style.translate = `calc(${base('x')} + ${delta.x}px) calc(${base('y')} + ${delta.y}px)`;
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
    // Most camera frames leave the screen-space anchor untouched. If visibility
    // requires a relocation, clamp its open menus before the next paint too.
    const movement = new MutationObserver(place);
    movement.observe(root.current.closest('[data-testid="canvas-v2-context-toolbar"]') ?? root.current, { attributes: true, attributeFilter: ["style"] });
    root.current.querySelectorAll("[data-canvas-v2-popover]").forEach(popup => observer.observe(popup));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { movement.disconnect(); observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [menu, root]);
}
