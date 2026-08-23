import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasV2RuntimeDocument } from "@/lib/canvas-v2/runtime-document";
import { createCanvasV2CommittedRevision } from "@/lib/canvas-v2/revisions";

test("runtime source is revision-bound and contains no executable bridge", () => {
  const revision = createCanvasV2CommittedRevision({
    id: "revision-exact",
    document: { html: "<main>Rendered</main>", css: "main { color: blue; }" },
    evidence: [],
    createdAt: "2026-08-11T12:00:00.000Z",
  });
  const runtime = buildCanvasV2RuntimeDocument(revision);
  assert.match(runtime, /data-canvas-v2-revision-id="revision-exact"/);
  assert.match(runtime, /<main>Rendered<\/main>/);
  assert.match(runtime, /h1, h2, h3, h4, h5, h6 \{ font-size:inherit; font-weight:inherit; \}/);
  assert.match(runtime, /ol, ul, menu \{ list-style:none; \}/);
  assert.match(runtime, /img, svg, video, canvas, audio, iframe, embed, object \{ display:block; vertical-align:middle; \}/);
  assert.match(runtime, /background:transparent!important/);
  assert.match(runtime, /\[data-canvas-v2-node-id="canvas"\]/);
  assert.match(runtime, /body \{[\s\S]*padding:192px!important/);
  assert.match(runtime, /html > body \{[\s\S]*padding:192px!important/);
  assert.match(runtime, /body > \[data-canvas-v2-design-region\]\[data-canvas-v2-story-role="title"\][\s\S]*max-width:8880px!important/);
  assert.doesNotMatch(runtime, /data-canvas-v2-story-role="title"\][^{]*\{[^}]*(?:^|[;{])width:8880px!important/);
  assert.match(runtime, /body > \[data-canvas-v2-node-id="canvas"\][\s\S]*padding:0!important/);
  assert.match(runtime, /data-canvas-v2-theme="light"/);
  assert.match(runtime, /--northstar-surface:#ffffff/);
  assert.match(runtime, /:root\[data-canvas-v2-theme="dark"\]/);
  assert.match(runtime, /--northstar-ink:#f4f3f8/);
  assert.match(runtime, /--northstar-muted:#c7c3cf/);
  assert.doesNotMatch(runtime, /color-scheme:dark/);
  assert.doesNotMatch(runtime, /postMessage|<script/);
});
