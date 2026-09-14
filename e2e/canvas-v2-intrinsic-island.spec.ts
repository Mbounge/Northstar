import { expect, test } from '@playwright/test';
import { buildCanvasV2RuntimeDocument } from '../lib/canvas-v2/runtime-document';
import { createCanvasV2CommittedRevision } from '../lib/canvas-v2/revisions';

test('island wrappers measure their composition, while explicit large widths remain authoritative', async ({ page }) => {
  const revision = createCanvasV2CommittedRevision({ id: 'intrinsic-islands', createdAt: '2026-09-13T00:00:00Z', evidence: [], document: {
    html: '<section data-canvas-v2-node-id="island" data-canvas-v2-design-region="true" data-canvas-v2-layout-owner="model"><div data-canvas-v2-node-id="content" class="content">Comparison</div></section><section data-canvas-v2-node-id="large" data-canvas-v2-design-region="true" data-canvas-v2-layout-owner="model">Large authored composition</section>',
    css: '.content{width:1700px;height:900px}[data-canvas-v2-node-id="large"]{width:18000px;height:1000px}',
  } });
  await page.setContent(buildCanvasV2RuntimeDocument(revision));
  const boxes = await page.locator('[data-canvas-v2-design-region]').evaluateAll(elements => elements.map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })));
  expect(boxes).toEqual([{ width: 1700, height: 900 }, { width: 18000, height: 1000 }]);
});
