import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseCanvasV2AssetSourcePatch } from "../lib/canvas-v2/source-patch";

import { assertCanvasV2NativeRelationshipStaging, assertCanvasV2NativeRelationshipAuthorship, materializeCanvasV2ConnectorRequests, applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange, normalizeCanvasV2SourcePatchHeadingHierarchy, repairCanvasV2RenderedRelationshipGeometry, retireCanvasV2BrokenAuthoredRelationships, retireCanvasV2CollidingRelationshipLabels } from "../lib/canvas-v2/source-patch";
import { validateCanvasV2EvidenceContinuity } from "../lib/canvas-v2/artifact-safety";
import { compactCanvasV2IslandSourceForModel } from "../lib/canvas-v2/model-context";
import type { CanvasV2WorkingContext } from "../lib/canvas-v2/working-context";

const evidence = [{ id: "screen-1", url: "https://evidence.test/screen-1.png", label: "Screen 1" }];
const previous = {
  html: '<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="lane" data-canvas-v2-canonical-flow="flow:1"><div data-canvas-v2-node-id="nested"><img data-canvas-v2-node-id="canonical-1" data-canvas-v2-evidence-id="screen-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/screen-1.png"></div></article></main>',
  css: ".northstar-canvas { display:block; }",
};

test("registered image bytes are expanded after the authored patch size check", () => {
  const bytes = readFileSync("evals/discovery/cases/ikea-breakfast/assets/original-post.png");
  const asset = { id: "upload", url: `data:image/png;base64,${bytes.toString("base64")}`, label: "Original post", authority: "supplied" as const };
  const patch = JSON.stringify({ operations: [{ op: "append-html", targetNodeId: "canvas", html: '<img data-canvas-v2-node-id="placed-image" data-canvas-v2-evidence-id="upload" src="northstar-asset:upload" alt="Original post">' }] });
  assert.ok(patch.length < 1000); assert.ok(asset.url.length > 1_000_000);
  const result = applyCanvasV2SourcePatch({ previous: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: '' }, evidence: [asset], operations: parseCanvasV2AssetSourcePatch(patch, [asset]) });
  assert.ok(result.html.includes(asset.url)); assert.ok(result.html.includes('data-canvas-v2-evidence-id="upload"'));
  assert.throws(() => parseCanvasV2AssetSourcePatch(patch, []), /Unknown canvas asset/);
  assert.throws(() => parseCanvasV2AssetSourcePatch(JSON.stringify({ operations: [{ op: 'append-html', targetNodeId: 'canvas', html: 'x'.repeat(32001) }] }), [asset]), /too large/);
});

test("approved public image copies retain exact pixels and source identity without an app journey", () => {
  const document = { html: '<main data-canvas-v2-node-id="canvas"><img data-canvas-v2-node-id="public-image" data-canvas-v2-evidence-id="screen-1" src="https://evidence.test/screen-1.png"></main>', css: "" };
  const result = applyCanvasV2SourcePatch({
    previous: document, evidence,
    operations: [{ op: "append-html", targetNodeId: "canvas", html: '<img data-canvas-v2-node-id="public-copy" data-canvas-v2-copy-evidence-handle="source-image-0">' }],
  });
  assert.match(result.html, /data-canvas-v2-source-node-id="public-image"/);
  assert.match(result.html, /data-canvas-v2-scale-intent="peer"/);
  assert.equal((result.html.match(/src="https:\/\/evidence.test\/screen-1.png"/g) ?? []).length, 2);
  assert.throws(() => applyCanvasV2SourcePatch({ previous: document, evidence: [], operations: [{ op: "append-html", targetNodeId: "canvas", html: '<img data-canvas-v2-node-id="bad" data-canvas-v2-copy-evidence-handle="source-image-0">' }] }), /approved source/);
});

function selectionContext(policy: "modify" | "reference" = "modify"): CanvasV2WorkingContext {
  return {
    schema: "canvas-v2.working-context.v1",
    scope: "selection",
    selectionPolicy: policy,
    selectedNodeIds: ["selected-title"],
    selectedBounds: { x: 400, y: 300, width: 480, height: 72 },
    visibleBounds: { x: 0, y: 0, width: 1_600, height: 900 },
    viewportScale: 1,
    visibleNodeIds: ["selected-title", "unselected-note"],
    nearbyNodeIds: ["selected-title", "unselected-note"],
    editableNodeIds: policy === "modify" ? ["selected-title"] : [],
    protectedNodeIds: policy === "reference" ? ["selected-title"] : ["unselected-note"],
    objects: [],
    relationships: [],
  };
}

test("source node ranges survive nested elements with the same tag", () => {
  const html = '<main data-canvas-v2-node-id="a"><main data-canvas-v2-node-id="b"></main></main>';
  const range = findCanvasV2SourceNodeRange(html, "a");
  assert.equal(range?.start, 0);
  assert.equal(range?.end, html.length);
});

test("analytical h1 output is demoted with its current CSS selectors without touching title work", () => {
  const operations = normalizeCanvasV2SourcePatchHeadingHierarchy([
    { op: "append-html", targetNodeId: "canvas", html: '<section data-canvas-v2-node-id="analysis"><h1 class="thesis">Trust is the constraint.</h1></section>' },
    { op: "upsert-css", layerId: "analysis", css: '[data-canvas-v2-node-id="analysis"] h1, h1.thesis{font-size:72px}.h1-token{color:red}' },
  ], "analysis");
  assert.match(operations[0].op === "append-html" ? operations[0].html : "", /<h2 class="thesis">/);
  assert.doesNotMatch(operations[0].op === "append-html" ? operations[0].html : "", /<h1\b/);
  assert.match(operations[1].op === "upsert-css" ? operations[1].css : "", /\] h2, h2\.thesis/);
  assert.match(operations[1].op === "upsert-css" ? operations[1].css : "", /\.h1-token/);

  const titleOperations = normalizeCanvasV2SourcePatchHeadingHierarchy(operations, "title");
  assert.deepEqual(titleOperations, operations);
});

test("exhausted relationship repair retires only exact broken relationship marks", () => {
  const document = {
    html: '<section data-canvas-v2-node-id="island"><p data-canvas-v2-node-id="copy">Keep me</p><svg data-canvas-v2-node-id="logic"><path data-canvas-v2-node-id="broken-line" data-canvas-v2-relationship-source="copy" data-canvas-v2-relationship-target="result" d="M0 0L10 10"></path><path data-canvas-v2-node-id="good-line" data-canvas-v2-relationship-source="copy" data-canvas-v2-relationship-target="result" d="M0 0L20 20"></path></svg><p data-canvas-v2-node-id="result">Result</p></section>',
    css: '[data-canvas-v2-node-id="island"]{display:grid}',
  };
  const recovered = retireCanvasV2BrokenAuthoredRelationships(document, ["broken-line", "copy", "unknown"]);
  assert.doesNotMatch(recovered.html, /broken-line/);
  assert.match(recovered.html, /good-line/);
  assert.match(recovered.html, /Keep me/);
  assert.equal(recovered.css, document.css);
});

test("relationship recovery removes only colliding optional SVG labels", () => {
  const document = {
    html: '<section data-canvas-v2-node-id="island"><h2 data-canvas-v2-node-id="stage-title">Evidence</h2><svg data-canvas-v2-node-id="logic"><path data-canvas-v2-node-id="required-line" data-canvas-v2-relationship-source="stage-title" data-canvas-v2-relationship-target="result" d="M0 0L20 20"></path><text data-canvas-v2-node-id="transition-label-notice">NOTICE</text><text data-canvas-v2-node-id="confidence-label">CONFIDENCE</text></svg><p data-canvas-v2-node-id="result">Result</p></section>',
    css: "",
  };
  const recovered = retireCanvasV2CollidingRelationshipLabels(document, ["transition-label-notice", "required-line", "stage-title", "confidence-label"]);
  assert.doesNotMatch(recovered.html, /transition-label-notice/);
  assert.match(recovered.html, /required-line/);
  assert.match(recovered.html, /stage-title/);
  assert.match(recovered.html, /confidence-label/);
});

test("relationship geometry recovery snaps only measured endpoints while preserving the authored route and styling", () => {
  const document = {
    html: '<section data-canvas-v2-node-id="island"><svg data-canvas-v2-node-id="logic"><path data-canvas-v2-node-id="required-line" data-canvas-v2-relationship-source="source" data-canvas-v2-relationship-target="target" marker-end="url(#arrow)" d="M 20 30 C 80 5 140 95 200 70"></path></svg></section>',
    css: '[data-canvas-v2-node-id="required-line"]{stroke:#6d4aff}',
  };
  const recovered = repairCanvasV2RenderedRelationshipGeometry(document, [{
    nodeId: "required-line",
    tagName: "path",
    sourceNodeIds: ["source"],
    targetNodeIds: ["target"],
    bounds: { x: 20, y: 5, width: 180, height: 90 },
    geometryMidLocalPoint: { x: 108, y: 48 },
    geometrySuggestedStartLocalPoint: { x: 32, y: 42 },
    geometrySuggestedEndLocalPoint: { x: 188, y: 76 },
  }]);
  assert.match(recovered.html, /d="M 32 42 Q 106 37 188 76"/);
  assert.match(recovered.html, /marker-end="url\(#arrow\)"/);
  assert.match(recovered.html, /data-canvas-v2-relationship-source="source"/);
  assert.equal(recovered.css, document.css);
});

test("appending to inert workspace metadata creates a body-level native object", () => {
  const workspace = {
    html: '<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true"></template><section data-canvas-v2-node-id="title" data-canvas-v2-design-region data-canvas-v2-story-role="title"><h1 data-canvas-v2-node-id="heading">Title</h1></section>',
    css: "",
  };
  const next = applyCanvasV2SourcePatch({
    previous: workspace,
    evidence: [],
    operations: [{
      op: "append-html",
      targetNodeId: "canvas-root",
      html: '<section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region><h2 data-canvas-v2-node-id="analysis-heading">Analysis</h2></section>',
    }],
  });
  assert.ok(next.html.indexOf('data-canvas-v2-node-id="title"') < next.html.indexOf('data-canvas-v2-node-id="analysis"'));
  assert.match(next.html, /<\/section><section[^>]+data-canvas-v2-node-id="analysis"/);
  assert.doesNotMatch(next.html, /<template[^>]*><section/);
  assert.throws(() => applyCanvasV2SourcePatch({
    previous: workspace,
    evidence: [],
    operations: [{ op: "remove-node", targetNodeId: "canvas-root" }],
  }), /workspace metadata is immutable/i);
});

test("model CSS cannot use inert workspace metadata as a layout parent", () => {
  const workspace = {
    html: '<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true"></template><section data-canvas-v2-node-id="title" data-canvas-v2-design-region><h1 data-canvas-v2-node-id="heading">Title</h1></section>',
    css: "",
  };
  assert.throws(() => applyCanvasV2SourcePatch({
    previous: workspace,
    evidence: [],
    operations: [{
      op: "upsert-css",
      layerId: "dead-root-grid",
      css: '[data-canvas-v2-node-id="canvas-root"]{display:grid;grid-template-rows:2000px 4000px}',
    }],
  }), /workspace metadata is inert.*body-level island nodes/i);
  assert.doesNotThrow(() => applyCanvasV2SourcePatch({
    previous: workspace,
    evidence: [],
    operations: [{
      op: "upsert-css",
      layerId: "live-island-layout",
      css: '[data-canvas-v2-node-id="title"]{width:3200px;margin-bottom:192px}',
    }],
  }));
});

test("evidence-wide compatibility roots hug composition content instead of the navigation world", () => {
  const next = applyCanvasV2SourcePatch({
    previous: {
      ...previous,
      css: '.northstar-canvas{display:grid;align-content:space-between;height:100%;min-height:100%}',
    },
    evidence,
    operations: [{
      op: "upsert-css",
      layerId: "comparison",
      css: '[data-canvas-v2-node-id="lane"]{width:1600px}',
    }],
  });
  assert.match(next.css, /height:auto!important/);
  assert.match(next.css, /min-height:0!important/);
  assert.match(next.css, /align-content:start!important/);
  assert.doesNotMatch(next.css, /canvas-v2-canvas--evidence-wide[^}]*min-height:100%!important/);
});

test("render repair keeps the original visual layer while appending a bounded correction", () => {
  const workspace = {
    html: '<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true"></template><section data-canvas-v2-node-id="title" data-canvas-v2-design-region><h1 data-canvas-v2-node-id="heading">Title</h1><p data-canvas-v2-node-id="eyebrow">Context</p></section>',
    css: '/* canvas-v2-model-layer:title-style */\n[data-canvas-v2-node-id="heading"]{font-size:120px;line-height:1}\n/* /canvas-v2-model-layer:title-style */',
  };
  const repaired = applyCanvasV2SourcePatch({
    previous: workspace,
    evidence: [],
    mergeExistingCssLayers: true,
    operations: [{
      op: "upsert-css",
      layerId: "title-style",
      css: '[data-canvas-v2-node-id="eyebrow"]{font-size:28px}',
    }],
  });
  assert.match(repaired.css, /heading[^}]*font-size:120px/);
  assert.match(repaired.css, /eyebrow[^}]*font-size:28px/);
  assert.equal((repaired.css.match(/\/\* canvas-v2-model-layer:title-style \*\//g) ?? []).length, 1);
  const repairedAgain = applyCanvasV2SourcePatch({
    previous: repaired,
    evidence: [],
    mergeExistingCssLayers: true,
    operations: [{
      op: "upsert-css",
      layerId: "title-style",
      css: '[data-canvas-v2-node-id="eyebrow"]{line-height:1.3}',
    }],
  });
  assert.match(repairedAgain.css, /heading[^}]*font-size:120px/);
  assert.match(repairedAgain.css, /eyebrow[^}]*font-size:28px/);
  assert.match(repairedAgain.css, /eyebrow[^}]*line-height:1\.3/);
  assert.equal((repairedAgain.css.match(/\/\* canvas-v2-model-layer:title-style \*\//g) ?? []).length, 1);
});

test("a later design turn cannot erase an established layer by reusing its ID", () => {
  const workspace = {
    html: '<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true"></template><section data-canvas-v2-node-id="title" data-canvas-v2-design-region><div data-canvas-v2-node-id="kicker">DECISION LANDSCAPE</div><h1 data-canvas-v2-node-id="heading">Title</h1></section>',
    css: '/* canvas-v2-model-layer:title-style */\n[data-canvas-v2-node-id="kicker"]{font-size:24px;white-space:nowrap}\n[data-canvas-v2-node-id="heading"]{font-size:78px}\n/* /canvas-v2-model-layer:title-style */',
  };
  const next = applyCanvasV2SourcePatch({
    previous: workspace,
    evidence: [],
    mergeExistingCssLayers: true,
    operations: [{
      op: "upsert-css",
      layerId: "title-style",
      css: '[data-canvas-v2-node-id="heading"]{max-width:720px}',
    }],
  });
  assert.match(next.css, /kicker[^}]*font-size:24px[^}]*white-space:nowrap/);
  assert.match(next.css, /heading[^}]*font-size:78px/);
  assert.match(next.css, /heading[^}]*max-width:720px/);
  assert.equal((next.css.match(/\/\* canvas-v2-model-layer:title-style \*\//g) ?? []).length, 1);
});

test("bounded patches preserve canonical rails and bind evidence copies server-side", () => {
  const next = applyCanvasV2SourcePatch({
    previous,
    evidence,
    operations: [
      { op: "insert-after", targetNodeId: "lane", html: '<section data-canvas-v2-node-id="analysis"><img data-canvas-v2-node-id="copy-1" data-canvas-v2-copy-evidence-handle="lane-0-screen-0" data-canvas-v2-witness-group="qualified-assessment" alt="Evidence detail"></section>' },
      { op: "upsert-css", layerId: "analysis", css: ".northstar-canvas { display:grid; }" },
    ],
  });
  assert.match(next.html, /data-canvas-v2-source-node-id="canonical-1"/);
  assert.match(next.html, /data-canvas-v2-scale-intent="peer"/);
  assert.match(next.html, /data-canvas-v2-witness-group="qualified-assessment"/);
  assert.match(next.html, /alt="Screen 1"/);
  assert.doesNotMatch(next.html, /alt="Evidence detail"/);
  assert.match(next.html, /max-height:376px!important/);
  assert.match(next.html, /src="https:\/\/evidence\.test\/screen-1\.png"/);
  assert.match(next.css, /canvas-v2-model-layer:analysis/);
  assert.match(next.css, /canvas-v2-canonical-evidence-geometry-guard/);
  assert.ok(next.css.indexOf("canvas-v2-canonical-evidence-geometry-guard") > next.css.indexOf("canvas-v2-model-layer:analysis"));
  assert.match(next.css, /width:max-content!important/);
  assert.match(next.css, /canvas-v2-canvas--evidence-wide\{[^}]*padding:0!important/);
  assert.match(next.css, /canvas-v2-canvas--evidence-wide>\[data-canvas-v2-design-region\]:not\(\[data-canvas-v2-layout-owner="model"\]\)\{[^}]*position:relative!important[^}]*inset:auto!important[^}]*max-width:8880px!important/);
  assert.match(next.css, /data-canvas-v2-story-role="title"[^}]*grid-column:1\/-1!important[^}]*max-width:4200px!important[^}]*margin-bottom:192px!important/);
  assert.doesNotMatch(next.css, /data-canvas-v2-story-role="title"[^}]*(?:^|[;{])width:4200px!important/);
  assert.match(next.css, /\.canvas-v2-flow-lane\{[^}]*transform:none!important[^}]*grid-template-columns:170px max-content!important/);
  assert.match(next.css, /\.canvas-v2-grounded-evidence\{[^}]*width:max-content!important[^}]*min-width:0!important/);
  assert.match(next.css, /\.canvas-v2-flow-lane\{[^}]*width:max-content!important[^}]*min-width:0!important/);
  assert.doesNotMatch(next.css, /\.canvas-v2-(?:grounded-evidence|flow-lane)\{[^}]*min-width:100%!important/);
  assert.match(next.css, /\.canvas-v2-flow-screen\{[^}]*transform:none!important[^}]*height:235px!important/);
  assert.match(next.css, /data-canvas-v2-scale-intent="peer"[^}]*max-height:376px!important/);
  assert.match(next.css, /data-canvas-v2-scale-intent="bounded-emphasis"[^}]*max-height:646px!important/);
  assert.match(next.css, /canvas-v2-evidence-inbox\{[^}]*display:grid!important[^}]*gap:20px!important/);
  assert.match(next.css, /canvas-v2-evidence-inbox>img\[data-canvas-v2-scale-intent="identity-mark"\]\{[^}]*max-width:96px!important/);
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

test("the compiler owns intrinsic-ratio analysis-copy geometry and scale ceilings", () => {
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
      { op: "upsert-css", layerId: "oversized", css: '.northstar-canvas img[data-canvas-v2-evidence-role="analysis-copy"]{width:2400px!important;height:4800px!important;min-height:4800px!important}' },
    ],
  });
  assert.match(next.html, /data-canvas-v2-scale-intent="bounded-emphasis"/);
  assert.match(next.html, /style="[^"]*width:auto!important[^"]*height:auto!important[^"]*max-height:646px!important/);
  assert.doesNotMatch(next.html, /(?:width:2400px|height:4800px)/);
  assert.match(next.html, /min-height:0!important/);
  assert.doesNotMatch(next.html, /min-height:4800px/);
  assert.doesNotMatch(next.html, /\swidth="2400"/);
  assert.ok(next.css.lastIndexOf("max-height:646px!important") > next.css.indexOf("height:4800px!important"));
});

test("model patches cannot mutate canonical lane internals", () => {
  assert.throws(() => applyCanvasV2SourcePatch({ previous, evidence, operations: [{ op: "append-html", targetNodeId: "lane", html: '<p data-canvas-v2-node-id="bad">Bad</p>' }] }), /immutable/);
  assert.throws(() => applyCanvasV2SourcePatch({ previous, evidence, operations: [{ op: "remove-node", targetNodeId: "lane" }] }), /immutable/);
});

test("model patches cannot erase human-edited nodes or their containing subtree", () => {
  const humanEdited = {
    ...previous,
    html: previous.html.replace(
      '<div data-canvas-v2-node-id="nested">',
      '<div data-canvas-v2-node-id="nested" data-canvas-v2-user-edited="move text" data-canvas-v2-last-author="user" data-canvas-v2-edit-version="2">',
    ),
  };
  assert.throws(() => applyCanvasV2SourcePatch({
    previous: humanEdited,
    evidence,
    operations: [{ op: "replace-node", targetNodeId: "canvas", html: '<main data-canvas-v2-node-id="canvas">Reset</main>' }],
  }), /Human-authored node nested is protected/);
  const appended = applyCanvasV2SourcePatch({
    previous: humanEdited,
    evidence,
    operations: [{ op: "insert-after", targetNodeId: "lane", html: '<p data-canvas-v2-node-id="new-analysis">Analysis</p>' }],
  });
  assert.match(appended.html, /data-canvas-v2-user-edited="move text"/);
});

test("selection patches can revise only the exact editable stable object", () => {
  const selectionDocument = {
    html: '<main data-canvas-v2-node-id="canvas"><h2 data-canvas-v2-node-id="selected-title" data-canvas-v2-origin="northstar" data-canvas-v2-user-edited="text" data-canvas-v2-last-author="user" data-canvas-v2-edit-version="1">Human title</h2><p data-canvas-v2-node-id="unselected-note" data-canvas-v2-origin="user" data-canvas-v2-user-edited="create" data-canvas-v2-last-author="user">Keep this</p></main>',
    css: "",
  };
  const revised = applyCanvasV2SourcePatch({
    previous: selectionDocument,
    evidence: [],
    workingContext: selectionContext(),
    operations: [
      { op: "replace-node", targetNodeId: "selected-title", html: '<h2 data-canvas-v2-node-id="selected-title">Northstar revision</h2>' },
      { op: "upsert-css", layerId: "selected-title", css: '[data-canvas-v2-node-id="selected-title"]{color:#181820}' },
    ],
  });
  assert.match(revised.html, /data-canvas-v2-node-id="selected-title"[^>]*data-canvas-v2-origin="northstar"/);
  assert.match(revised.html, /data-canvas-v2-node-id="selected-title"[^>]*data-canvas-v2-user-edited="text"/);
  assert.match(revised.html, /data-canvas-v2-node-id="selected-title"[^>]*data-canvas-v2-last-author="northstar"/);
  assert.match(revised.html, /data-canvas-v2-node-id="selected-title"[^>]*data-canvas-v2-edit-version="2"/);
  assert.match(revised.html, />Northstar revision<\/h2>/);
  assert.match(revised.html, />Keep this<\/p>/);

  assert.throws(() => applyCanvasV2SourcePatch({
    previous: selectionDocument,
    evidence: [],
    workingContext: selectionContext(),
    operations: [{ op: "replace-node", targetNodeId: "unselected-note", html: '<p data-canvas-v2-node-id="unselected-note">Wrong target</p>' }],
  }), /cannot mutate unselected node/);
  assert.throws(() => applyCanvasV2SourcePatch({
    previous: selectionDocument,
    evidence: [],
    workingContext: selectionContext(),
    operations: [{ op: "insert-after", targetNodeId: "unselected-note", html: '<p data-canvas-v2-node-id="unexpected">Unexpected</p>' }],
  }), /cannot mutate unselected node/);
  assert.throws(() => applyCanvasV2SourcePatch({
    previous: selectionDocument,
    evidence: [],
    workingContext: selectionContext(),
    operations: [{ op: "upsert-css", layerId: "global", css: ".northstar-canvas h2{color:red}" }],
  }), /must contain only direct rules for exact authorized stable node IDs|not scoped to an exact authorized stable node ID/);
});

test("reference selections allow only new exactly-scoped work beside the immutable anchor", () => {
  const selectionDocument = {
    html: '<main data-canvas-v2-node-id="canvas"><h2 data-canvas-v2-node-id="selected-title">Reference</h2></main>',
    css: "",
  };
  const derived = applyCanvasV2SourcePatch({
    previous: selectionDocument,
    evidence: [],
    workingContext: selectionContext("reference"),
    operations: [
      { op: "insert-after", targetNodeId: "selected-title", html: '<aside data-canvas-v2-node-id="derived-comparison">Derived comparison</aside>' },
      { op: "upsert-css", layerId: "derived-comparison", css: '[data-canvas-v2-node-id="derived-comparison"]{display:grid;gap:16px}' },
    ],
  });
  assert.match(derived.html, /data-canvas-v2-node-id="selected-title">Reference<\/h2>/);
  assert.match(derived.html, /data-canvas-v2-node-id="derived-comparison"/);
  for (const operation of [
    { op: "replace-node" as const, targetNodeId: "selected-title", html: '<h2 data-canvas-v2-node-id="selected-title">Changed</h2>' },
    { op: "append-html" as const, targetNodeId: "selected-title", html: '<span data-canvas-v2-node-id="nested">Changed</span>' },
    { op: "remove-node" as const, targetNodeId: "selected-title" },
  ]) {
    assert.throws(() => applyCanvasV2SourcePatch({ previous: selectionDocument, evidence: [], workingContext: selectionContext("reference"), operations: [operation] }), /may only insert new identified work immediately beside an exact selected reference/);
  }
  assert.throws(() => applyCanvasV2SourcePatch({
    previous: { html: selectionDocument.html.replace("</main>", '<p data-canvas-v2-node-id="other">Other</p></main>'), css: "" },
    evidence: [],
    workingContext: selectionContext("reference"),
    operations: [{ op: "insert-after", targetNodeId: "other", html: '<aside data-canvas-v2-node-id="wrong-anchor">Wrong anchor</aside>' }],
  }), /may only insert new identified work immediately beside an exact selected reference/);
  assert.throws(() => applyCanvasV2SourcePatch({
    previous: selectionDocument,
    evidence: [],
    workingContext: selectionContext("reference"),
    operations: [
      { op: "insert-after", targetNodeId: "selected-title", html: '<aside data-canvas-v2-node-id="derived-comparison">Derived comparison</aside>' },
      { op: "upsert-css", layerId: "unsafe-reference", css: ".northstar-canvas h2{color:red}" },
    ],
  }), /not scoped to an exact authorized stable node ID/);
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


test("AI connector requests compile into the shared native primitive without model path data", () => {
  const html = materializeCanvasV2ConnectorRequests('<div data-canvas-v2-node-id="test-link" data-canvas-v2-connector-request="true" data-from="left" data-to="right" data-x1="100" data-y1="120" data-x2="500" data-y2="120" data-variant="bent" data-label="informs"></div>');
  assert.match(html, /<svg[^>]*data-canvas-v2-primitive="connector"/);
  assert.match(html, /data-canvas-v2-connector-from="left"/);
  assert.match(html, /data-canvas-v2-connector-to="right"/);
  assert.match(html, /data-canvas-v2-connector-part="hit"/);
  assert.match(html, /data-canvas-v2-connector-part="start"/);
  assert.match(html, /data-canvas-v2-connector-part="end"/);
  assert.match(html, /data-canvas-v2-connector-label="informs"/);
  assert.doesNotMatch(html, /data-canvas-v2-user-edited|data-canvas-v2-connector-request/);
  assert.throws(() => materializeCanvasV2ConnectorRequests('<div data-canvas-v2-connector-request="true"></div>'), /requires/);
  assert.throws(() => materializeCanvasV2ConnectorRequests('<div data-canvas-v2-connector-request="true"><span>Custom line</span></div>'), /must be empty div/);
  assert.throws(() => materializeCanvasV2ConnectorRequests('<span data-canvas-v2-connector-request="true"></span>'), /must be empty div/);
  assert.throws(() => materializeCanvasV2ConnectorRequests('<div data-canvas-v2-node-id="bad-color" data-canvas-v2-connector-request="true" data-from="left" data-to="right" data-x1="0" data-y1="0" data-x2="50" data-y2="0" data-color="#12345"></div>'), /hex color/);
});


test("new custom relationship SVG is rejected while legacy artwork and data graphics are preserved", () => {
  const custom = '<svg data-canvas-v2-node-id="legacy"><path data-canvas-v2-relationship-source="a" data-canvas-v2-relationship-target="b" d="M 0 0 L 20 20" /></svg>';
  assert.throws(() => assertCanvasV2NativeRelationshipAuthorship(custom, ""), /native endpoint IDs/);
  assert.doesNotThrow(() => assertCanvasV2NativeRelationshipAuthorship(custom, custom));
  assert.doesNotThrow(() => assertCanvasV2NativeRelationshipAuthorship('<svg><path d="M 0 0 L 20 20" /></svg>', ""));
});

test("AI route corridors survive materialization as editable native waypoints", () => {
  const request = (route: string, variant = "bent") => `<div data-canvas-v2-node-id="route" data-canvas-v2-connector-request="true" data-from="left" data-to="right" data-x1="100" data-y1="120" data-x2="500" data-y2="120" data-variant="${variant}" data-waypoints="${route}"></div>`;
  const upper = materializeCanvasV2ConnectorRequests(request("100,200 500,200"));
  const lower = materializeCanvasV2ConnectorRequests(request("100,300 500,300"));
  assert.notEqual(upper, lower);
  assert.match(upper, /data-canvas-v2-connector-waypoints=/);
  assert.match(upper, /data-canvas-v2-connector-route-space="parent"/);
  assert.match(upper, /data-canvas-v2-connector-part="hit"/);
  assert.doesNotMatch(upper, /data-canvas-v2-user-edited/);
  for (const route of ["", "100,", "100,NaN", "100,Infinity", "100,200,300", Array(13).fill("100,200").join(" ")]) {
    assert.throws(() => materializeCanvasV2ConnectorRequests(request(route)), /waypoints/);
  }
  assert.throws(() => materializeCanvasV2ConnectorRequests(request("100,200", "arrow")), /waypoints/);
});


test("native connector integration requires a separately measured composition", () => {
  const request = (id: string, to = "right") => materializeCanvasV2ConnectorRequests(`<div data-canvas-v2-node-id="${id}" data-canvas-v2-connector-request="true" data-from="left" data-to="${to}" data-x1="0" data-y1="0" data-x2="100" data-y2="0"></div>`);
  const input = { previousHtml: "", candidateHtml: request("link"), observedNodeIds: ["left", "right"], relationshipGeometryAllowed: true, targetAction: "enrich" };
  assert.throws(() => assertCanvasV2NativeRelationshipStaging({ ...input, relationshipGeometryAllowed: false }), /separate/);
  assert.throws(() => assertCanvasV2NativeRelationshipStaging({ ...input, targetAction: "create" }), /separate/);
  assert.throws(() => assertCanvasV2NativeRelationshipStaging({ ...input, observedNodeIds: ["left"] }), /measured/);
  assert.doesNotThrow(() => assertCanvasV2NativeRelationshipStaging(input));
  assert.throws(() => assertCanvasV2NativeRelationshipStaging({ ...input, eligibleEndpointNodeIds: ["left"] }), /ineligible endpoint IDs: right/);
  assert.doesNotThrow(() => assertCanvasV2NativeRelationshipStaging({ ...input, previousHtml: input.candidateHtml, relationshipGeometryAllowed: false }));
  assert.throws(() => assertCanvasV2NativeRelationshipStaging({ ...input, previousHtml: input.candidateHtml, candidateHtml: request("replacement", "unmeasured") }), /measured/);
});


test("AI connectors accept precise native interior attachments and reject invalid fractions", () => {
  const request = (anchor: string) => `<div data-canvas-v2-node-id="link" data-canvas-v2-connector-request="true" data-from="left" data-to="right" data-x1="0" data-y1="0" data-x2="100" data-y2="0" data-from-anchor="${anchor}" data-to-anchor="0.75,0.25"></div>`;
  const source = materializeCanvasV2ConnectorRequests(request("0.5,0.5"));
  assert.match(source, /data-canvas-v2-connector-from-anchor="0.5,0.5"/);
  assert.match(source, /data-canvas-v2-connector-to-anchor="0.75,0.25"/);
  for (const bad of ["-1,0", "0,2", "NaN,0", "0,", "0,0,0"]) assert.throws(() => materializeCanvasV2ConnectorRequests(request(bad)), /normalized coordinates/);
});

test("a local CSS merge retains the first composition while explicit replacement remains available", () => {
  const document = { html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="story"><p data-canvas-v2-node-id="caption">Keep the story</p></section></main>', css: '' };
  const firstRules = '[data-canvas-v2-node-id="story"]{width:6200px;display:grid;gap:40px}[data-canvas-v2-node-id="caption"]{color:blue;font-size:32px}';
  const correction = '[data-canvas-v2-node-id="caption"]{color:green}';
  const first = applyCanvasV2SourcePatch({ previous: document, evidence: [], operations: [{ op:'upsert-css',layerId:'story',css:firstRules }] });
  const patch = (mode: string) => parseCanvasV2AssetSourcePatch(JSON.stringify({operations:[{op:'upsert-css',layerId:'story',mode,css:correction}]}), []);
  const repaired = applyCanvasV2SourcePatch({ previous:first, evidence:[], operations:patch('merge') });
  assert.ok(repaired.css.includes(firstRules));
  assert.ok(repaired.css.indexOf(correction) > repaired.css.indexOf(firstRules));
  assert.equal(repaired.html, first.html);
  const replaced = applyCanvasV2SourcePatch({ previous:first, evidence:[], operations:patch('replace') });
  assert.ok(!replaced.css.includes(firstRules));
  assert.ok(replaced.css.includes(correction));
});
