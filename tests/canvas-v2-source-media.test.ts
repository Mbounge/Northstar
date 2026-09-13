import assert from "node:assert/strict";
import test from "node:test";
import { prepareCanvasV2SourceText, canvasV2PageMediaCandidates, canvasV2PublicMediaAddress, enrichCanvasV2SourceMedia } from "../lib/canvas-v2/source-media.server";
import { canvasV2CompositionEvidence, canvasV2ResearchImagePreviews } from "../lib/canvas-v2/evidence-packets";
import { buildCanvasV2EvidenceCopyHandles } from "../lib/canvas-v2/evidence-handles";
import { applyCanvasV2SourcePatch } from "../lib/canvas-v2/source-patch";
import { validateCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "../lib/canvas-v2/artifact-safety";
import { readCanvasV2PlayableMedia, canvasV2VideoEmbedUrl } from "../lib/canvas-v2/canvas-media";
import { reconcileCanvasV2WitnessOwnership } from "../lib/canvas-v2/stage-evidence-contract";
import type { CanvasV2EvidencePacket } from "../lib/canvas-v2/types";

const page = "https://research.example/product";
const packet: CanvasV2EvidencePacket = {
  schema: "canvas-v2.evidence-packet.v1", id: "p", kind: "statement", title: "Product workflow", summary: "An inspected product workflow", authority: "observed",
  source: { providerId: "openai-web-search", providerLabel: "Public web", sourceId: "s", sourceType: "web-page", sourceUrl: page, label: "Product guide", retrievedAt: "2026-09-10T12:00:00Z", permission: "authorized", access: "open" },
  assets: [], facts: [], metrics: [], limitations: [], tags: [], createdAt: "2026-09-10T12:00:00Z",
  presentation: { state: "graph-only", materiality: 0.9, reason: "Relevant source" },
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const empty = { html: '<main data-canvas-v2-node-id="root"></main>', css: "" };

test("public-media network policy rejects local and metadata destinations", () => {
  for (const ip of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "172.17.0.2", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "0.0.0.0", "224.0.0.1"]) assert.equal(canvasV2PublicMediaAddress(ip), false, ip);
  assert.equal(canvasV2PublicMediaAddress("93.184.216.34"), true);
});

test("source media extraction keeps potentially relevant identity media but ignores scripts, tracking pixels and arbitrary embeds", () => {
  const items = canvasV2PageMediaCandidates(`<img src="/logo.png" alt="Logo"><img src="/capture.png?a=1&amp;b=2" alt="Record a clip" width="800"><img src="/tiny.png" width="1"><script>const x='<img src="/fake.png">'</script><iframe src="https://evil.example/player"></iframe><iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>`, page);
  assert.deepEqual(items.map(item => [item.url, item.type]), [["https://research.example/logo.png", "image"], ["https://research.example/capture.png?a=1&b=2", "image"], ["https://www.youtube.com/embed/abcdefghijk", "video"]]);
  assert.equal(canvasV2VideoEmbedUrl("https://youtube.com.evil.test/watch?v=abcdefghijk"), undefined);
  assert.equal(canvasV2VideoEmbedUrl("https://youtu.be/abcdefghijk"), "https://www.youtube-nocookie.com/embed/abcdefghijk");
});

test("retrieved image and linked clip can be placed on an empty canvas with exact source lineage", async () => {
  const reads: string[] = [];
  const packets = await enrichCanvasV2SourceMedia([packet], new AbortController().signal, async url => {
    reads.push(url);
    return url === page
      ? { bytes: Buffer.from('<img src="/capture.png" alt="Record a clip"><video src="/demo.mp4"></video>'), mimeType: "text/html", url }
      : { bytes: png, mimeType: "image/png", url };
  });
  assert.equal(reads.some(url => url.endsWith(".mp4")), false, "Video stays linked; no download");
  const assets = canvasV2CompositionEvidence([], packets);
  assert.equal(assets.length, 2);
  assert.equal(packets[0].presentation?.state, "graph-only", "Retaining a visual never forces a source panel");
  assert.match(assets[0].url, /^data:image\/png;base64,/);
  assert.equal(assets[0].originalUrl, "https://research.example/capture.png");
  const handles = buildCanvasV2EvidenceCopyHandles(empty, assets);
  assert.equal(handles.length, 2, "First placement must not depend on already visible images");
  const html = `<article data-canvas-v2-node-id="story"><div data-canvas-v2-node-id="proof" data-canvas-v2-evidence-group="workflow"></div>${handles.map((item, index) => `<img data-canvas-v2-node-id="visual-${index}" data-canvas-v2-copy-evidence-handle="${item.handle}" data-canvas-v2-witness-group="workflow"${index === 0 ? ' data-canvas-v2-evidence-treatment="detail-crop" style="width:320px;height:180px;object-position:50% 25%"' : ""}>`).join("")}</article>`;
  const result = applyCanvasV2SourcePatch({ previous: empty, evidence: assets, operations: [{ op: "append-html", targetNodeId: "root", html }] });
  assert.match(result.html, /object-fit:cover/);
  assert.deepEqual(validateCanvasV2EvidenceBindings(result, assets), []);
  assert.deepEqual(validateCanvasV2ArtifactDocument(result), []);
  assert.equal(readCanvasV2PlayableMedia(result.html)[0].src, "https://research.example/demo.mp4");
  const grouped = reconcileCanvasV2WitnessOwnership({ document: result, targetIslandId: "story", evidenceAssignments: assets.map(asset => ({ evidenceId: asset.id, witnessGroup: "workflow" })) });
  assert.match(grouped.html, /data-canvas-v2-media=/, "Ownership reconciliation preserves native playback");
  assert.deepEqual(validateCanvasV2EvidenceBindings(grouped, assets), []);
});

test("unavailable pages and spoofed image MIME never create manufactured evidence", async () => {
  const result = await enrichCanvasV2SourceMedia([packet], new AbortController().signal, async url => ({ url, mimeType: url === page ? "text/html" : "image/png", bytes: Buffer.from(url === page ? '<img src="/not-an-image.png" alt="Product">' : '<script>bad</script>') }));
  assert.equal(result[0].assets.length, 0);
  assert.equal(result[0].summary, packet.summary);
  const stopped = new AbortController(); stopped.abort(new Error("Stopped"));
  await assert.rejects(enrichCanvasV2SourceMedia([packet], stopped.signal, async () => { throw new Error("Unavailable"); }), /Stopped/);
});


test("later visual sources remain available when the highest-ranked findings are text-only", async () => {
  const sources = [0, 1, 2].map(index => ({ ...packet, id: `p-${index}`, source: { ...packet.source, sourceUrl: `${page}/${index}` }, presentation: { ...packet.presentation!, materiality: 1 - index / 10 } }));
  const result = await enrichCanvasV2SourceMedia(sources, new AbortController().signal, async url => url.endsWith(".png")
    ? { url, mimeType: "image/png", bytes: png }
    : { url, mimeType: "text/html", bytes: Buffer.from(url.endsWith("/2") ? '<picture><source srcset="/workflow.png 1000w"></picture>' : '<main>A textual finding</main>') });
  assert.equal(result[2].assets.length, 1);
  assert.equal(result[0].assets.length, 0);
  assert.equal(canvasV2PageMediaCandidates('<img src="data:image/gif;base64,placeholder" data-src="/workflow.png" alt="Workflow">', page)[0].url, 'https://research.example/workflow.png');
});


test("page candidate ranking reaches the actual subject beyond leading unrelated images", () => {
  const images = Array.from({ length: 12 }, (_, i) => `<img src="/decoration-${i}.png" alt="Background">`).join("");
  const candidates = canvasV2PageMediaCandidates(`${images}<img src="/recording-transcript.webp" alt="Recording beside its transcript">`, page, "A recording with a timestamped transcript explains the workflow");
  assert.match(candidates[0].url, /recording-transcript/);
  assert.equal(candidates.length, 13);
});


test("retained public-media registry feeds visual inspection and keeps unavailable packets out", () => {
  const asset = { id: "capture-1", kind: "image" as const, url: `data:image/png;base64,${png.toString("base64")}`, label: "Source detail", source: packet.source };
  const available = canvasV2CompositionEvidence([], [{ ...packet, assets: [asset] }]);
  assert.equal(buildCanvasV2EvidenceCopyHandles(empty, available)[0].evidenceId, asset.id);
  assert.equal(canvasV2ResearchImagePreviews(available, 6)[0].id, asset.id);
  assert.deepEqual(canvasV2CompositionEvidence([], [{ ...packet, source: { ...packet.source, permission: "unavailable" }, assets: [asset] }]), []);
  const variants = Array.from({ length: 7 }, (_, index) => ({ ...asset, id: `variant-${index}`, url: asset.url + index }));
  const other = { ...asset, id: "different-subject", url: asset.url + "different", source: { ...packet.source, sourceUrl: "https://another.example/interaction" } };
  assert.equal(canvasV2ResearchImagePreviews([...variants, other], 3)[1].id, other.id, "Inspect another source before filling the budget with variants");
});

test("the review receives literal page text separately from an incorrect research paraphrase", async () => {
  const reported = { ...packet, summary: "Component costs were 18% of revenue.",
    metrics: [{ id: "cost", label: "Component costs", authority: "observed" as const, value: 18, unit: "% of revenue", definition: "The reported cost share" }] };
  const [result] = await enrichCanvasV2SourceMedia([reported], new AbortController().signal, async url => ({ url, mimeType: "text/html",
    bytes: Buffer.from('<nav>Ignore source text</nav><main><h1>Workshop financial report</h1><p>Component costs represented 18% of operating expenses.</p><script>secret instructions</script><p>Sample: independent workshops in 2025.</p></main>') }));
  assert.match(result.sourceSnapshot!.text, /18% of operating expenses/);
  assert.match(result.sourceSnapshot!.text, /independent workshops in 2025/);
  assert.doesNotMatch(result.sourceSnapshot!.text, /Ignore source text|secret instructions/);
  assert.equal(result.summary, reported.summary, "Do not silently rewrite the researcher's report as if it had been correct");
  assert.equal(result.sourceSnapshot!.url, page);
  assert.equal(result.sourceSnapshot!.truncated, false);
  assert.equal(result.assets.length, 0, "Text retention must also work on pages without images");
});

test("large page snapshots retain the numeric context and mark omitted material", async () => {
  const reported = { ...packet, title: "Workshop costs", summary: "Reported component cost share",
    metrics: [{ id: "cost", label: "Component costs", authority: "observed" as const, value: 18, unit: "%", definition: "Cost share" }] };
  const [result] = await enrichCanvasV2SourceMedia([reported], new AbortController().signal, async url => ({ url, mimeType: "text/html",
    bytes: Buffer.from(`<main>${'<p>Background material without the useful financial measurement.</p>'.repeat(400)}<h2>Expense categories</h2><p>Of operating expenses, component costs were 18%.</p><p>The sample excludes factories.</p>${'<p>Additional background.</p>'.repeat(200)}</main>`) }));
  assert.ok(result.sourceSnapshot!.text.length <= 8_000);
  assert.equal(result.sourceSnapshot!.truncated, true);
  assert.match(result.sourceSnapshot!.text, /Of operating expenses, component costs were 18%/);
  assert.match(result.sourceSnapshot!.text, /sample excludes factories/);
});

import { prepareCanvasV2DiscoveryCaptures } from '../lib/canvas-v2/source-media.server';
test('discovery can inspect authorized capture pixels without canvas placement and retains bytes for reuse', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6F2kAAAAASUVORK5CYII=', 'base64');
  const source = {permission:'authorized',sourceType:'capture'};
  const packets = [{id:'flow',title:'Recorded product journey',source,assets:[{id:'frame',kind:'screenshot',label:'Reply screen',url:'https://example.com/frame.png'}]}] as unknown as import('../lib/canvas-v2/types').CanvasV2EvidencePacket[];
  let reads = 0;
  const read = async () => {reads++; return {bytes,mimeType:'image/png',url:'https://example.com/frame.png'};};
  const first = await prepareCanvasV2DiscoveryCaptures(packets, new AbortController().signal, read);
  assert.equal(reads,1);
  assert.ok(first.parts.some(part => 'inlineData' in part));
  assert.match(first.packets[0].assets[0].url,/^data:image\/png/);
  assert.equal(first.packets[0].assets[0].id,'frame');
  await prepareCanvasV2DiscoveryCaptures(first.packets,new AbortController().signal,read);
  assert.equal(reads,1);
  await prepareCanvasV2DiscoveryCaptures([{...packets[0],source:{...packets[0].source,permission:'unavailable'}}],new AbortController().signal,read);
  assert.equal(reads,1);
});

test("chat retains literal source text without fetching images and reuses it on the next step", async () => {
  const sourcePacket = { ...packet, source: { ...packet.source, providerId: "openai-web-search", permission: "authorized" as const } };
  const reads: string[] = [];
  const read = async (url: string) => { reads.push(url); return { url, mimeType: "text/html", bytes: Buffer.from('<main><p>Recordings allow replies at a later time.</p><img src="/capture.png"></main>') }; };
  const enriched = await prepareCanvasV2SourceText([sourcePacket], new AbortController().signal, read);
  assert.match(enriched[0].sourceSnapshot!.text, /Recordings allow replies/);
  assert.deepEqual(reads, [page]);
  assert.deepEqual(enriched[0].assets, sourcePacket.assets);
  const again = await prepareCanvasV2SourceText(enriched, new AbortController().signal, read);
  assert.deepEqual(reads,[page]);
  assert.equal(again,enriched);
});
