import assert from "node:assert/strict";
import test from "node:test";
import { resolveFlowCaptures, captureAspectRatio } from "../lib/app-data/flow-captures";

const base = "https://example.test/storage/v1/object/public/reviews/tenant/Medito/onboarding/";
test("captures contain only splash and overview in presentation order", () => {
  const result = resolveFlowCaptures({ assets: [
    { role: "overview_reel", kind: "video", file: "media/overview_reel.mp4", duration_seconds: 23.266667 },
    { role: "onboarding_journey", kind: "video", file: "media/onboarding_local_proof.mp4" },
    { role: "app_splash", kind: "video", file: "media/splash_local_proof.mp4", duration_seconds: 0.93 },
  ] }, base);
  assert.deepEqual(result.map((item) => item.role), ["app_splash", "overview_reel"]);
  assert.equal(result[1].url, `${base}media/overview_reel.mp4`);
  assert.equal(result[1].duration_seconds, 23.266667);
});
test("capture manifests cannot point at another tenant, external hosts or non-media files", () => {
  for (const file of ["../other/media/test.mp4", "https://other.test/media/test.mp4", "//other.test/media/test.mp4", "screenshots/test.mp4", "media/test.svg", "media/test.mp4?redirect=x"]) {
    assert.deepEqual(resolveFlowCaptures({ assets: [{ role: "app_splash", kind: "video", file }] }, base), []);
  }
  assert.deepEqual(resolveFlowCaptures(null, base), []);
});

test("recorded iOS reels preserve native dimensions without letterboxing", () => {
 const [capture] = resolveFlowCaptures({assets:[{role:"overview_reel",kind:"video",file:"media/live.mp4",width:750,height:1624}]},base);
 assert.equal(captureAspectRatio(capture),"750 / 1624");
 assert.equal(captureAspectRatio({width:750,height:0}),"9 / 20");
 assert.equal(captureAspectRatio({width:750,height:Infinity}),"9 / 20");
 assert.equal(captureAspectRatio(),"9 / 20");
});
