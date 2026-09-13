/** Include overflowing glyphs without changing the authored layout or copy. */
export function canvasV2UnionTextBounds(box: { x: number; y: number; width: number; height: number }, paint: { x: number; y: number; width: number; height: number }) {
  const x = Math.min(box.x, paint.x), y = Math.min(box.y, paint.y);
  return { x, y, width: Math.max(box.x + box.width, paint.x + paint.width) - x, height: Math.max(box.y + box.height, paint.y + paint.height) - y };
}

export function canvasV2ElementPaintBounds(element: Element): DOMRect {
  const box = element.getBoundingClientRect();
  if (!element.textContent?.trim() || element.querySelector('[data-canvas-v2-node-id]') || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') return box;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style || style.transform !== 'none' || (style.rotate && style.rotate !== 'none' && parseFloat(style.rotate) !== 0)) return box;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  const paint = range.getBoundingClientRect();
  if (paint.width <= 0 || paint.height <= 0) return box;
  const union = canvasV2UnionTextBounds(box, paint);
  const clipsX = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX);
  const clipsY = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY);
  return new DOMRect(clipsX ? box.x : union.x, clipsY ? box.y : union.y, clipsX ? box.width : union.width, clipsY ? box.height : union.height);
}


export interface CanvasV2TextRect { x: number; y: number; width: number; height: number }

/** Measure the painted line fragments, not the empty corners of a wrapped span. */
export function canvasV2TextPaintRects(element: Element): CanvasV2TextRect[] | undefined {
  if (!element.textContent?.trim() || element.querySelector('[data-canvas-v2-node-id]') || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') return undefined;
  const walker = element.ownerDocument.createTreeWalker(element, 4 /* SHOW_TEXT */);
  const rects: CanvasV2TextRect[] = [];
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.textContent?.trim()) continue;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(text);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
    // Fall back conservatively for unusually large text objects; never ignore
    // the unmeasured tail when deciding whether a draft can commit.
    if (rects.length > 256) return undefined;
  }
  return rects.length ? rects : undefined;
}

export function canvasV2TextPaintIntersection(first: { bounds: CanvasV2TextRect; textPaintRects?: CanvasV2TextRect[] }, second: { bounds: CanvasV2TextRect; textPaintRects?: CanvasV2TextRect[] }): CanvasV2TextRect | undefined {
  for (const a of first.textPaintRects ?? [first.bounds]) {
    for (const b of second.textPaintRects ?? [second.bounds]) {
      const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
      const width = Math.min(a.x + a.width, b.x + b.width) - x;
      const height = Math.min(a.y + a.height, b.y + b.height) - y;
      if (width >= 2 && height >= 2 && width * height / Math.max(1, Math.min(a.width * a.height, b.width * b.height)) >= 0.025) return { x, y, width, height };
    }
  }
  return undefined;
}
