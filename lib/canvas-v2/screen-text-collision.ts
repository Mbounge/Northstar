export type ScreenTextCollision = {
  headingSelector: string;
  paragraphSelector: string;
  headingText: string;
  paragraphText: string;
  overlapRects: Array<{ x: number; y: number; width: number; height: number; area: number }>;
  overlapArea: number;
};

/** Advisory only: checks actual text Range line fragments for overlap between
 * adjacent visible heading/paragraph siblings. It does not decide whether a
 * screen is visually approved or inspect intentional overlays. */
export function inspectScreenTextCollisions(doc: Document, options: { maxPairs?: number; minOverlapArea?: number } = {}) {
  const warnings: ScreenTextCollision[] = [];
  const maxPairs = Number.isFinite(options.maxPairs) ? Math.max(1, Math.min(200, Math.floor(options.maxPairs!))) : 80;
  const minOverlapArea = Number.isFinite(options.minOverlapArea) ? Math.max(0, Math.min(100, options.minOverlapArea!)) : 0.75;
  if (!doc?.querySelectorAll || !doc?.createRange || !doc?.createTreeWalker) {
    return { status: 'unavailable' as const, reason: 'text-range-api-unavailable', inspectedPairs: 0, truncated: false, warnings };
  }
  const view = doc.defaultView;
  if (!view?.getComputedStyle) return { status: 'unavailable' as const, reason: 'computed-style-api-unavailable', inspectedPairs: 0, truncated: false, warnings };
  const selectors = {
    forElement(element: Element) {
      if (element.id) return `#${view.CSS?.escape ? view.CSS.escape(element.id) : element.id}`;
      const tag = element.tagName.toLowerCase();
      let ordinal = 1;
      for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) if (sibling.tagName === element.tagName) ordinal++;
      return `${tag}:nth-of-type(${ordinal})`;
    },
  };
  const visible = {
    element(element: Element) {
      if (element.hasAttribute('hidden') || element.closest('[hidden],[aria-hidden="true"],svg,[role="presentation"],[data-decorative="true"]')) return false;
      for (let current: Element | null = element; current; current = current.parentElement) {
        const style = view.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return element.getClientRects().length > 0;
    },
    textNode(node: Node) {
      const parent = node.parentElement;
      return Boolean(parent && !parent.closest('[aria-hidden="true"],svg,[role="presentation"],[data-decorative="true"]'));
    },
  };
  const textFragments = {
    read(element: Element) {
      const rects: Array<{ x: number; y: number; right: number; bottom: number }> = [];
      let text = '';
      const walker = doc.createTreeWalker(element, 4);
      let node: Node | null;
      const range = doc.createRange();
      while ((node = walker.nextNode())) {
        if (!visible.textNode(node) || !node.textContent?.trim()) continue;
        text += `${node.textContent} `;
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) continue;
          rects.push({ x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom });
        }
      }
      return { text: text.replace(/\s+/g, ' ').trim().slice(0, 180), rects };
    },
  };

  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  let inspectedPairs = 0, truncated = false;
  for (const heading of headings) {
    const paragraph = heading.nextElementSibling;
    if (!paragraph || paragraph.tagName !== 'P') continue;
    if (inspectedPairs >= maxPairs) { truncated = true; break; }
    inspectedPairs++;
    if (heading.contains(paragraph) || paragraph.contains(heading) || !visible.element(heading) || !visible.element(paragraph)) continue;
    const headingText = textFragments.read(heading), paragraphText = textFragments.read(paragraph);
    if (!headingText.text || !paragraphText.text || !headingText.rects.length || !paragraphText.rects.length) continue;
    const overlapRects: ScreenTextCollision['overlapRects'] = [];
    rectPairs: for (const a of headingText.rects) for (const b of paragraphText.rects) {
      const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), right = Math.min(a.right, b.right), bottom = Math.min(a.bottom, b.bottom);
      const width = right - x, height = bottom - y, area = width * height;
      if (width > 0 && height > 0 && area >= minOverlapArea) overlapRects.push({ x, y, width, height, area });
      if (overlapRects.length >= 24) break rectPairs;
    }
    if (!overlapRects.length) continue;
    warnings.push({
      headingSelector: selectors.forElement(heading), paragraphSelector: selectors.forElement(paragraph),
      headingText: headingText.text, paragraphText: paragraphText.text,
      overlapRects, overlapArea: overlapRects.reduce((sum, rect) => sum + rect.area, 0),
    });
  }
  return { status: 'advisory' as const, inspectedPairs, truncated, warnings };
}
