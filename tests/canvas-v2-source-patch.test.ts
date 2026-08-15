import assert from "node:assert/strict";
import test from "node:test";

import { applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange } from "../lib/canvas-v2/source-patch";
import { validateCanvasV2EvidenceContinuity } from "../lib/canvas-v2/artifact-safety";
import { compactCanvasV2IslandSourceForModel } from "../lib/canvas-v2/model-context";

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
  assert.match(next.html, /data-canvas-v2-scale-intent="peer"/);
  assert.match(next.html, /max-height:376px!important/);
  assert.match(next.html, /src="https:\/\/evidence\.test\/screen-1\.png"/);
  assert.match(next.css, /canvas-v2-model-layer:analysis/);
  assert.match(next.css, /canvas-v2-canonical-evidence-geometry-guard/);
  assert.ok(next.css.indexOf("canvas-v2-canonical-evidence-geometry-guard") > next.css.indexOf("canvas-v2-model-layer:analysis"));
  assert.match(next.css, /width:max-content!important/);
  assert.match(next.css, /canvas-v2-artboard--evidence-wide\{[^}]*padding:56px!important/);
  assert.match(next.css, /canvas-v2-artboard--evidence-wide>\[data-canvas-v2-design-region\]\{[^}]*position:relative!important[^}]*inset:auto!important[^}]*max-width:100%!important/);
  assert.match(next.css, /data-canvas-v2-story-role="title"[^}]*grid-column:1\/-1!important[^}]*margin-bottom:72px!important/);
  assert.match(next.css, /\.canvas-v2-flow-lane\{[^}]*transform:none!important[^}]*grid-template-columns:170px max-content!important/);
  assert.match(next.css, /\.canvas-v2-flow-screen\{[^}]*transform:none!important[^}]*height:235px!important/);
  assert.match(next.css, /data-canvas-v2-scale-intent="peer"[^}]*max-height:376px!important/);
  assert.match(next.css, /data-canvas-v2-scale-intent="bounded-emphasis"[^}]*max-height:646px!important/);
  assert.deepEqual(validateCanvasV2EvidenceContinuity(previous, next, evidence), []);
  assert.throws(() => applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [{ op: "insert-after", targetNodeId: "lane", html: '<img data-canvas-v2-node-id="bad-copy" data-canvas-v2-copy-evidence-handle="unknown-handle">' }],
  }), /handle is not grounded/);
});

test("the compiler assigns a stable unique identity when a grounded evidence tag omits clerical node identity", () => {
  const next = applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [{ op: "insert-after", targetNodeId: "lane", html: '<section data-canvas-v2-node-id="analysis"><img data-canvas-v2-copy-evidence-handle="lane-0-screen-0"></section>' }],
  });
  assert.match(next.html, /data-canvas-v2-node-id="analysis-copy-lane-0-screen-0-1"/);
  assert.match(next.html, /data-canvas-v2-evidence-id="screen-1"/);
});

test("nested composition chapters cannot become overlapping programmatic islands", () => {
  const next = applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [{
      op: "insert-after",
      targetNodeId: "lane",
      html: '<section data-canvas-v2-node-id="comparison-island" data-canvas-v2-design-region data-canvas-v2-story-role="comparison"><div data-canvas-v2-node-id="synthesis-chapter" data-canvas-v2-design-region data-canvas-v2-island-id="invented" data-canvas-v2-story-role="synthesis" data-canvas-v2-placement-mode="attached" data-canvas-v2-target-zone="bottom-center">Synthesis</div></section>',
    }],
  });
  assert.match(next.html, /data-canvas-v2-node-id="comparison-island"[^>]*data-canvas-v2-design-region[^>]*data-canvas-v2-island-id="comparison-island"/);
  const nestedTag = /<div\b[^>]*data-canvas-v2-node-id="synthesis-chapter"[^>]*>/.exec(next.html)?.[0] ?? "";
  assert.doesNotMatch(nestedTag, /data-canvas-v2-design-region|data-canvas-v2-island-id|data-canvas-v2-story-role|data-canvas-v2-placement-mode|data-canvas-v2-target-zone/);
});

test("the compiler, not model CSS, owns grounded analysis-copy scale ceilings", () => {
  const next = applyCanvasV2SourcePatch({
    previous,
    evidence,
    scaleIntentByEvidenceId: new Map([["screen-1", "bounded-emphasis"]]),
    operations: [
      {
        op: "insert-after",
        targetNodeId: "lane",
        html: '<img data-canvas-v2-node-id="copy-oversized" data-canvas-v2-copy-evidence-handle="lane-0-screen-0" width="2400" height="4800" style="width:2400px!important;height:4800px!important;min-height:4800px!important;object-fit:cover!important" alt="Evidence detail">',
      },
      { op: "upsert-css", layerId: "oversized", css: '.northstar-artboard img[data-canvas-v2-evidence-role="analysis-copy"]{width:2400px!important;height:4800px!important;min-height:4800px!important}' },
    ],
  });
  assert.match(next.html, /data-canvas-v2-scale-intent="bounded-emphasis"/);
  assert.match(next.html, /style="[^"]*height:4800px!important[^"]*max-height:646px!important/);
  assert.match(next.html, /min-height:0!important/);
  assert.doesNotMatch(next.html, /min-height:4800px/);
  assert.doesNotMatch(next.html, /\swidth="2400"/);
  assert.ok(next.css.lastIndexOf("max-height:646px!important") > next.css.indexOf("height:4800px!important"));
});

test("model patches cannot mutate canonical lane internals", () => {
  assert.throws(() => applyCanvasV2SourcePatch({ previous, evidence, operations: [{ op: "append-html", targetNodeId: "lane", html: '<p data-canvas-v2-node-id="bad">Bad</p>' }] }), /immutable/);
  assert.throws(() => applyCanvasV2SourcePatch({ previous, evidence, operations: [{ op: "remove-node", targetNodeId: "lane" }] }), /immutable/);
});

test("the compiler owns stable programmatic island identity", () => {
  const next = applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [{
      op: "insert-after",
      targetNodeId: "lane",
      html: '<section data-canvas-v2-node-id="analysis-island" data-canvas-v2-island-id="model-invented-id" data-canvas-v2-design-region data-canvas-v2-placement-mode="evidence-relative-island" data-canvas-v2-target-zone="bottom-right"><h2>Analysis</h2></section>',
    }],
  });
  assert.match(next.html, /data-canvas-v2-node-id="analysis-island"[^>]*data-canvas-v2-island-id="analysis-island"/);
  assert.doesNotMatch(next.html, /model-invented-id/);
});

test("focused island context uses short compiler handles instead of tenant URLs and evidence IDs", () => {
  const document = applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [{
      op: "insert-after",
      targetNodeId: "lane",
      html: '<section data-canvas-v2-node-id="analysis-island" data-canvas-v2-design-region><img data-canvas-v2-node-id="copy-1" data-canvas-v2-copy-evidence-handle="lane-0-screen-0"></section>',
    }],
  });
  const focused = compactCanvasV2IslandSourceForModel({ document, evidence } as never, "analysis-island");
  assert.match(focused ?? "", /data-canvas-v2-copy-evidence-handle="lane-0-screen-0"/);
  assert.doesNotMatch(focused ?? "", /https:\/\/evidence\.test/);
  assert.doesNotMatch(focused ?? "", /data-canvas-v2-evidence-id="screen-1"/);
});
