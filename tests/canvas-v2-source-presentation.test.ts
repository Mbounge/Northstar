import assert from "node:assert/strict";
import test from "node:test";
import { bindCanvasV2SourceCitations, identifyCanvasV2SourceLabels, normalizeCanvasV2ProvenanceBadges, canvasV2SourceLinkDirectory } from "../lib/canvas-v2/source-presentation";
import { canvasV2DiscoveryTransitionSchema } from "../lib/canvas-v2/discovery-orchestrator";
import type { CanvasV2EvidencePacket } from "../lib/canvas-v2/types";

test("source citations bind exact retained URLs to editable labels without inventing source identity", () => {
  const packets = [{ title: "Source", source: { label: "Verified page", canonicalUrl: "https://example.com/menu?a=1&b=2" } }] as CanvasV2EvidencePacket[];
  const directory = canvasV2SourceLinkDirectory(packets);
  const html = '<main data-canvas-v2-node-id="root"><span class="source" data-canvas-v2-node-id="source-label">Read the menu</span></main>';
  const document = { html, css: ".source{font-size:24px}" };
  const input = { document, authoredHtml: html, directory, citations: [{ sourceHandle: "source-1", nodeId: "source-label" }] };
  const bound = bindCanvasV2SourceCitations(input);
  assert.match(bound.html, /<a class="source" data-canvas-v2-node-id="source-label" href="https:\/\/example.com\/menu\?a=1&amp;b=2"/);
  assert.match(bound.html, />Read the menu<\/a>/);
  assert.equal(bound.css, document.css);
  assert.throws(() => bindCanvasV2SourceCitations({ ...input, citations: [{ sourceHandle: "invented", nodeId: "source-label" }] }), /exact source/);
  assert.throws(() => bindCanvasV2SourceCitations({ ...input, authoredHtml: '<span data-canvas-v2-node-id="other">Other</span>' }), /authored in this patch/);
  assert.equal(canvasV2SourceLinkDirectory([{ source: { canonicalUrl: "javascript:alert(1)" } }] as CanvasV2EvidencePacket[]).length, 0);
});

test("internal provenance badges stay off the canvas while ordinary claims, quotes and human edits survive", () => {
  assert.equal(normalizeCanvasV2ProvenanceBadges('<div id="a">STARTING CLAIM · HUMAN-PROVIDED</div>'), '<div id="a">STARTING CLAIM</div>');
  assert.equal(normalizeCanvasV2ProvenanceBadges('<p>HUMAN-SUPPLIED WITNESS</p>'), '<p></p>');
  for (const html of ['<p>The supplied post has not been independently verified.</p>', '<blockquote class="quote"><p>HUMAN-PROVIDED</p></blockquote>', '<p data-canvas-v2-last-author="user">HUMAN-PROVIDED</p>']) assert.equal(normalizeCanvasV2ProvenanceBadges(html), html);
});

test("inline source handles bind the actual label without a duplicate citation map", () => {
  const html = '<span data-canvas-v2-node-id="ref" data-canvas-v2-source-handle="source-1">Read the finding</span>';
  const input = { document: { html, css: "" }, authoredHtml: html, citations: [], directory: [{ handle: "source-1", label: "Finding", href: "https://example.com/finding" }] };
  const bound = bindCanvasV2SourceCitations(input);
  assert.match(bound.html, /href="https:\/\/example.com\/finding"/);
  assert.equal(bindCanvasV2SourceCitations({ ...input, citations: [{ sourceHandle: "source-1", nodeId: "ref" }] }).html, bound.html);
  assert.throws(() => bindCanvasV2SourceCitations({ ...input, authoredHtml: html.replace("source-1", "unknown") }), /exact source/);
  assert.throws(() => bindCanvasV2SourceCitations({ ...input, directory: [...input.directory, { handle: "source-2", label: "Different", href: "https://example.com/other" }], citations: [{ sourceHandle: "source-2", nodeId: "ref" }] }), /two different sources/);
});

test("contradiction updates use exact known handles while an empty ledger permits no updates", () => {
  const known = canvasV2DiscoveryTransitionSchema(["tension-001", "tension-002"]);
  assert.deepEqual(known.properties.contradictionUpdates.items.properties.id.enum, ["tension-001", "tension-002"]);
  assert.equal(canvasV2DiscoveryTransitionSchema([]).properties.contradictionUpdates.maxItems, 0);
});


test("missing native IDs on explicit source labels are allocated without changing content or existing identities", () => {
  const original = '<span data-canvas-v2-source-handle="source-1">Source</span><span data-canvas-v2-node-id="source-label-2" data-canvas-v2-source-handle="source-1">Another label</span>';
  const html = identifyCanvasV2SourceLabels(original, new Set(["source-label-1"]));
  assert.match(html, /data-canvas-v2-node-id="source-label-3"/);
  assert.equal(identifyCanvasV2SourceLabels(html, new Set()), html);
  const bound = bindCanvasV2SourceCitations({ document: { html, css: "" }, authoredHtml: html, citations: [], directory: [{ handle: "source-1", label: "Source", href: "https://example.com/source" }] });
  assert.equal(bound.html.match(/href="https:\/\/example.com\/source"/g)?.length, 2);
  const invalid = '<div data-canvas-v2-source-handle="source-1"><p>Whole section</p></div>';
  assert.equal(identifyCanvasV2SourceLabels(invalid, new Set()), invalid);
});
