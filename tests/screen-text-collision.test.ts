import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectScreenTextCollisions } from '../lib/canvas-v2/screen-text-collision';

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
class TextNode {
  nodeType = 3; parentElement?: FakeElement;
  constructor(public textContent: string, public rects: Rect[]) {}
}
class FakeElement {
  tagName: string; id = ''; hidden = false; parentElement: FakeElement | null = null; previousElementSibling: FakeElement | null = null;
  nextElementSibling: FakeElement | null = null; childNodes: Array<TextNode | FakeElement> = []; style = { display: 'block', visibility: 'visible', opacity: '1' };
  constructor(tag: string, public box: Rect, public attrs: string[] = []) { this.tagName = tag.toUpperCase(); }
  getClientRects() { return [this.box]; }
  hasAttribute(name: string) { return name === 'hidden' && this.hidden; }
  closest(selector: string) { return this.attrs.length && this.attrs.some(value => selector.includes(value)) ? this : null; }
  contains(node: unknown) { return node === this || this.childNodes.includes(node as never); }
  addText(text: string, ...rects: Rect[]) { const node = new TextNode(text, rects); node.parentElement = this; this.childNodes.push(node); return node; }
}
const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, right: left + width, bottom: top + height, width, height });
function pair(headingText: string, headingRects: Rect[], paragraphText: string, paragraphRects: Rect[], headingBox = rect(0, 0, 300, 100), paragraphBox = rect(0, 90, 300, 100), headingAttrs: string[] = []) {
  const heading = new FakeElement('h2', headingBox, headingAttrs); heading.addText(headingText, ...headingRects);
  const paragraph = new FakeElement('p', paragraphBox); paragraph.addText(paragraphText, ...paragraphRects);
  heading.nextElementSibling = paragraph; paragraph.previousElementSibling = heading;
  const doc = {
    querySelectorAll: () => [heading],
    createTreeWalker: (root: FakeElement) => { const texts = root.childNodes.filter(node => node instanceof TextNode) as TextNode[]; let index = 0; return { nextNode: () => texts[index++] ?? null }; },
    createRange: () => { let node: TextNode | undefined; return { selectNodeContents: (value: TextNode) => { node = value; }, getClientRects: () => node?.rects ?? [] }; },
    defaultView: { getComputedStyle: (element: FakeElement) => element.style, CSS: { escape: (value: string) => value } },
  };
  const serialized = new Function('doc', `return (${inspectScreenTextCollisions.toString()})(doc)`) as (doc: Document) => ReturnType<typeof inspectScreenTextCollisions>;
  return { result: serialized(doc as unknown as Document), heading, paragraph };
}

test('text line overlap between adjacent heading and intro yields bounded advisory evidence', () => {
  const { result } = pair('A season worth saving', [rect(20, 106, 240, 28), rect(20, 137, 230, 28.34)], 'A calm view of your spending.', [rect(20, 155, 260, 20)], rect(0, 90, 300, 90), rect(0, 150, 300, 80));
  assert.equal(result.status, 'advisory');
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.headingSelector, 'h2:nth-of-type(1)');
  assert.equal(result.warnings[0]?.paragraphSelector, 'p:nth-of-type(1)');
  assert.equal(result.warnings[0]?.headingText, 'A season worth saving');
  assert.ok((result.warnings[0]?.overlapArea ?? 0) > 0);
});

test('short heading with a separated intro does not trigger a collision warning', () => {
  const { result } = pair('Overview', [rect(16, 100, 80, 26)], 'Your latest activity.', [rect(16, 137, 180, 20)], rect(0, 90, 300, 50), rect(0, 130, 300, 60));
  assert.equal(result.warnings.length, 0);
});

test('overlapping element boxes do not warn when actual text line fragments are separate', () => {
  const { result } = pair('A heading', [rect(20, 100, 180, 20)], 'Intro copy', [rect(20, 160, 200, 20)], rect(0, 80, 300, 120), rect(0, 130, 300, 110));
  assert.equal(result.warnings.length, 0, 'detection uses Range line rectangles, not padded element rectangles');
});

test('text in separate columns and hidden or decorative content is excluded', () => {
  const columns = pair('Balance', [rect(10, 100, 100, 28)], 'Activity', [rect(180, 100, 100, 28)], rect(0, 80, 120, 70), rect(160, 80, 130, 70));
  assert.equal(columns.result.warnings.length, 0);
  const hidden = pair('Decorative title', [rect(10, 100, 180, 30)], 'Description', [rect(10, 110, 180, 20)], undefined, undefined, ['[aria-hidden="true"]']);
  assert.equal(hidden.result.warnings.length, 0);
});
