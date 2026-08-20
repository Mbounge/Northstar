import assert from "node:assert/strict";
import test from "node:test";

import {
  commitCanvasV2Candidate,
  createCanvasV2CandidateRevision,
  createCanvasV2CommittedRevision,
} from "@/lib/canvas-v2/revisions";
import { compileCanvasV2SceneTransaction } from "@/lib/canvas-v2/scene-transaction";

const first = createCanvasV2CommittedRevision({
  id: "revision-1",
  document: { html: "<main>Before</main>", css: "main { color: black; }" },
  evidence: [{ id: "screen-1", url: "https://example.com/screen.png", label: "Screen" }],
  createdAt: "2026-08-11T12:00:00.000Z",
});
test("a candidate is a separate immutable transition from its committed parent", () => {
  const candidate = createCanvasV2CandidateRevision({
    id: "revision-2",
    parent: first,
    document: { html: "<main>After</main>", css: "main { color: blue; }" },
    createdAt: "2026-08-11T12:01:00.000Z",
  });

  assert.equal(first.state, "committed");
  assert.equal(first.document.html, "<main>Before</main>");
  assert.equal(candidate.state, "candidate");
  assert.equal(candidate.parentId, first.id);
  assert.equal(candidate.document.html, "<main>After</main>");
  assert.notEqual(candidate.document, first.document);
  assert.notEqual(candidate.evidence, first.evidence);
});

test("commit rejects a stale parent and preserves revision identity", () => {
  const candidate = createCanvasV2CandidateRevision({
    id: "revision-2",
    parent: first,
    document: { html: "<main>After</main>", css: "main { color: blue; }" },
    createdAt: "2026-08-11T12:01:00.000Z",
  });

  assert.throws(
    () => commitCanvasV2Candidate({ candidate, expectedParentId: "revision-stale" }),
    /stale parent revision/,
  );

  const committed = commitCanvasV2Candidate({ candidate, expectedParentId: first.id });
  assert.equal(committed.id, candidate.id);
  assert.equal(committed.parentId, first.id);
  assert.equal(committed.state, "committed");
  assert.notEqual(committed.document, candidate.document);
});

test("candidate creation refuses candidate-on-candidate branching", () => {
  const candidate = createCanvasV2CandidateRevision({
    id: "revision-2",
    parent: first,
    document: { html: "<main>Candidate</main>", css: "" },
    createdAt: "2026-08-11T12:01:00.000Z",
  });

  assert.throws(
    () => createCanvasV2CandidateRevision({
      id: "revision-3",
      parent: candidate,
      document: { html: "<main>Nested candidate</main>", css: "" },
      createdAt: "2026-08-11T12:02:00.000Z",
    }),
    /must be based on a committed revision/,
  );
});

test("scene authority remains attached from candidate through commit", () => {
  const previous = {
    html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-design-region data-canvas-v2-island-id="island-1" data-canvas-v2-node-id="island-1"></section></main>',
    css: "",
  };
  const next = {
    html: '<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-design-region data-canvas-v2-island-id="island-1" data-canvas-v2-node-id="island-1"><h2 data-canvas-v2-node-id="heading-1">Insight</h2></section></main>',
    css: "",
  };
  const parent = createCanvasV2CommittedRevision({
    id: "scene-parent",
    document: previous,
    evidence: [],
    createdAt: "2026-08-11T12:00:00.000Z",
  });
  const sceneTransaction = compileCanvasV2SceneTransaction({
    origin: "northstar",
    baseRevisionId: parent.id,
    previous,
    next,
  });
  const candidate = createCanvasV2CandidateRevision({
    id: "scene-candidate",
    parent,
    document: next,
    sceneTransaction,
    createdAt: "2026-08-11T12:01:00.000Z",
  });
  const committed = commitCanvasV2Candidate({ candidate, expectedParentId: parent.id });

  assert.equal(committed.sceneTransaction?.baseRevisionId, parent.id);
  assert.equal(committed.sceneTransaction?.origin, "northstar");
  assert.ok(committed.sceneTransaction?.mutations.some((mutation) => mutation.kind === "create" && mutation.nodeId === "heading-1"));
});
