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
  assert.doesNotMatch(runtime, /postMessage|<script/);
});
