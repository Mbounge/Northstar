import assert from "node:assert/strict";
import test from "node:test";
import { decodeCanvasV2Request, readCanvasV2Request, serializeCanvasV2Request } from "../lib/canvas-v2/media-transport";
import { requestCanvasV2Json } from "../lib/canvas-v2/request-reliability";

const image = `data:image/png;base64,${"abcd".repeat(400_000)}`;

test("a media-rich follow-up fits the wire limit without losing document or source bytes", async () => {
  const body = { revision: { document: { html: `<img src="${image}">` }, evidence: [{ url: image, sourceUrl: "https://example.com/photo" }],
    evidencePackets: Array.from({ length: 6 }, () => ({ assets: [{ url: image }] })) }, instruction: "Review the current composition" };
  assert.ok(JSON.stringify(body).length > 10 * 1024 * 1024);
  await requestCanvasV2Json({ endpoint: "/design", body, signal: new AbortController().signal, requestId: "media-follow-up",
    policy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, fetcher: async (_url, init) => {
      assert.ok(String(init?.body).length < 2 * 1024 * 1024);
      assert.deepEqual(await readCanvasV2Request(new Request("https://example.com/design", { method: "POST", body: init?.body })), body);
      return Response.json({ ok: true });
    } });
});

test("distinct images and literal placeholder-looking user text survive exactly", () => {
  const body = { note: "__canvas_media_0_0__", images: [image, image, image.replace("abcd", "efgh")], html: `<a href="https://example.com">Source</a><img src="${image}">` };
  const packed = JSON.parse(serializeCanvasV2Request(body));
  assert.equal(packed.media.length, 2);
  assert.equal(packed.prefix, "__canvas_media_1_");
  assert.deepEqual(decodeCanvasV2Request(packed), body);
});

test("a retained collection of distinct images survives the larger bounded wire contract", async () => {
  const images = Array.from({ length: 8 }, (_, index) => image.replace("abcd", String(index).repeat(4)));
  const body = { images, records: images.map(url => ({ url, source: "https://example.com/media" })) };
  const packed = serializeCanvasV2Request(body);
  assert.ok(packed.length > 10 * 1024 * 1024, "Deduplication cannot remove distinct images");
  assert.deepEqual(await readCanvasV2Request(new Request("https://example.com/design", { method: "POST", body: packed })), body);
});

test("small and non-media requests keep the ordinary JSON protocol", () => {
  for (const body of [{ instruction: "Hello" }, { note: "x".repeat(300_000) }, { image: "data:image/png;base64,YQ==" }]) {
    assert.equal(serializeCanvasV2Request(body), JSON.stringify(body));
    assert.deepEqual(decodeCanvasV2Request(body), body);
  }
});

test("invalid media tables, references and excessive expansion are rejected before decoding", () => {
  const envelope = { schema: "canvas-v2.media-transport.v1", prefix: "__canvas_media_0_", media: [image], bodyJson: '{"image":"__canvas_media_0_0__"}' };
  for (const bad of [
    { ...envelope, media: ["https://example.com"] },
    { ...envelope, media: [123] },
    { ...envelope, prefix: ".*" },
    { ...envelope, bodyJson: '"__canvas_media_0_1__"' },
    { ...envelope, bodyJson: '"__canvas_media_0_00__"' },
    { ...envelope, bodyJson: '"__canvas_media_0_bad__"' },
    { ...envelope, bodyJson: JSON.stringify(Array(90).fill("__canvas_media_0_0__")) },
  ]) assert.throws(() => decodeCanvasV2Request(bad), /Invalid canvas media transport/);
});
