import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_MAX_CHAT_ATTACHMENTS,
  canvasV2ChatAttachmentEvidence,
  canvasV2ChatAttachmentHandle,
  canvasV2ChatAttachmentModelParts,
  parseCanvasV2ChatAttachments,
  parseCanvasV2ChatImageAttachments,
  type CanvasV2ChatImageAttachment,
} from "../lib/canvas-v2/chat-attachments";
import { applyCanvasV2SourcePatch } from "../lib/canvas-v2/source-patch";

const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=";

function image(id = "visual-1"): CanvasV2ChatImageAttachment {
  return {
    kind: "image",
    id,
    name: "customer-interview-map.png",
    mimeType: "image/png",
    dataUrl: `data:image/png;base64,${pixel}`,
    width: 1,
    height: 1,
    byteSize: 68,
    createdAt: "2026-08-29T12:00:00.000Z",
  };
}

test("chat images are validated, bounded, and transported as deliberate low-detail visual evidence", () => {
  const parsed = parseCanvasV2ChatImageAttachments([image()]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.mimeType, "image/png");
  assert.ok((parsed[0]?.byteSize ?? 0) > 0);
  const parts = canvasV2ChatAttachmentModelParts(parsed, "low");
  assert.deepEqual(parts[0], { inlineData: { mimeType: "image/png", data: pixel, detail: "low", purpose: "reference" } });
  assert.throws(() => parseCanvasV2ChatImageAttachments(Array.from({ length: CANVAS_V2_MAX_CHAT_ATTACHMENTS + 1 }, (_, index) => image(`visual-${index}`))), /up to 8 attachments/);
  assert.throws(() => parseCanvasV2ChatImageAttachments([{ ...image(), mimeType: "image/jpeg" }]), /inconsistent media metadata/);
});

test("long pasted text is a bounded supplied attachment and remains exact model context", () => {
  const exactText = "Customer interviews repeatedly describe setup confidence as the adoption blocker.";
  const attachments = parseCanvasV2ChatAttachments([{
    kind: "text",
    id: "pasted-1",
    name: "Pasted text 1",
    mimeType: "text/plain",
    text: exactText,
    charCount: exactText.length,
    createdAt: "2026-08-29T12:00:00.000Z",
  }]);
  assert.equal(attachments[0]?.kind, "text");
  assert.deepEqual(canvasV2ChatAttachmentModelParts(attachments), [{ text: `Human-supplied text attachment \"Pasted text 1\":\n${exactText}` }]);
  const evidence = canvasV2ChatAttachmentEvidence(attachments);
  assert.equal(evidence.packets[0]?.kind, "document");
  assert.equal(evidence.packets[0]?.authority, "supplied");
  assert.match(evidence.packets[0]?.summary ?? "", new RegExp(exactText));
  assert.equal(evidence.packets[0]?.presentation?.state, "graph-only");
});

test("human uploads enter the discovery graph as supplied evidence without automatically occupying canvas space", () => {
  const attachment = parseCanvasV2ChatImageAttachments([image()]);
  const evidence = canvasV2ChatAttachmentEvidence(attachment);
  assert.equal(evidence.assets[0]?.authority, "supplied");
  assert.equal(evidence.assets[0]?.source?.sourceType, "uploaded");
  assert.equal(evidence.packets[0]?.presentation?.state, "graph-only");
  assert.match(evidence.packets[0]?.limitations[0] ?? "", /independently verified fact/);
});

test("a selected upload handle resolves to the exact supplied pixels only when an island asks for it", () => {
  const attachment = parseCanvasV2ChatImageAttachments([image()]);
  const evidence = canvasV2ChatAttachmentEvidence(attachment);
  const asset = evidence.assets[0]!;
  const handle = canvasV2ChatAttachmentHandle(asset.id, 0);
  const next = applyCanvasV2SourcePatch({
    previous: {
      html: '<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true"></template>',
      css: "",
    },
    operations: [{
      op: "append-html",
      targetNodeId: "canvas-root",
      html: `<section data-canvas-v2-node-id="insight" data-canvas-v2-design-region data-canvas-v2-island-id="insight"><img data-canvas-v2-node-id="witness" data-canvas-v2-copy-evidence-handle="${handle}"></section>`,
    }],
    evidence: evidence.assets,
    evidenceIdByHandle: new Map([[handle, asset.id]]),
  });
  assert.match(next.html, new RegExp(`src="${asset.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(next.html, new RegExp(`data-canvas-v2-evidence-id="${asset.id}"`));
  assert.match(next.html, /data-canvas-v2-evidence-role="analysis-copy"/);
  assert.doesNotMatch(next.html, /data-canvas-v2-copy-evidence-handle/);
});
