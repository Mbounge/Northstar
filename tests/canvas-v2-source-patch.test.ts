import assert from "node:assert/strict";
import test from "node:test";

import { applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange } from "../lib/canvas-v2/source-patch";
import { validateCanvasV2EvidenceContinuity } from "../lib/canvas-v2/artifact-safety";

const evidence = [{ id: "screen-1", url: "https://evidence.test/screen-1.png", label: "Screen 1" }];
const previous = {
  html: '<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-node-id="lane" data-canvas-v2-canonical-flow="flow:1"><div data-canvas-v2-node-id="nested"><img data-canvas-v2-node-id="canonical-1" data-canvas-v2-evidence-id="screen-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/screen-1.png"></div></article></main>',
  css: ".northstar-artboard { display:block; }",
};

test("source node ranges survive nested elements with the same tag", () => {
  const html = '<main data-canvas-v2-node-id="a"><main data-canvas-v2-node-id="b"></main></main>';
  const range = findCanvasV2SourceNodeRange(html, "a");
  assert.equal(range?.start, 0);
  assert.equal(range?.end, html.length);
});

test("bounded patches preserve canonical rails and bind evidence copies server-side", () => {
  const next = applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [
      { op: "insert-after", targetNodeId: "lane", html: '<section data-canvas-v2-node-id="analysis"><img data-canvas-v2-node-id="copy-1" data-canvas-v2-copy-evidence-handle="lane-0-screen-0" alt="Evidence detail"></section>' },
      { op: "upsert-css", layerId: "analysis", css: ".northstar-artboard { display:grid; }" },
    ],
  });
  assert.match(next.html, /data-canvas-v2-source-node-id="canonical-1"/);
  assert.match(next.html, /src="https:\/\/evidence\.test\/screen-1\.png"/);
  assert.match(next.css, /canvas-v2-model-layer:analysis/);
  assert.deepEqual(validateCanvasV2EvidenceContinuity(previous, next, evidence), []);
  assert.throws(() => applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [{ op: "insert-after", targetNodeId: "lane", html: '<img data-canvas-v2-node-id="bad-copy" data-canvas-v2-copy-evidence-handle="unknown-handle">' }],
  }), /handle is not grounded/);
});

test("model patches cannot mutate canonical lane internals", () => {
  assert.throws(() => applyCanvasV2SourcePatch({ previous, evidence, operations: [{ op: "append-html", targetNodeId: "lane", html: '<p data-canvas-v2-node-id="bad">Bad</p>' }] }), /immutable/);
  assert.throws(() => applyCanvasV2SourcePatch({ previous, evidence, operations: [{ op: "remove-node", targetNodeId: "lane" }] }), /immutable/);
});
