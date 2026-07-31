import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_LIVE_SOURCE_AUTHORSHIP_VERSION,
  NorthstarLiveSourceAuthorship,
} from "@/lib/canvas-ai/northstar-live-source-authorship";
import {
  NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
  type NorthstarWebArtifactDocument,
} from "@/lib/canvas-artifacts/types";

const document: NorthstarWebArtifactDocument = {
  schema: NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
  html: [
    '<main data-ns-node-id="artboard">',
    '<section data-ns-node-id="presentation"><h1>Accepted source</h1></section>',
    "</main>",
  ].join(""),
  css: "main{display:grid}",
  cssLayers: {
    "northstar-mutation-style-northstar-creative-source": "h1{color:navy}",
  },
  javascript: "",
  creativeJavascript: "Northstar.ready()",
};

test("live source authorship exposes the exact accepted cumulative source", () => {
  const authorship = new NorthstarLiveSourceAuthorship({
    baseRevisionId: "revision-accepted",
    baseFiles: document,
    maximumNormalizationAttempts: 2,
  });
  const view = authorship.modelView() as {
    version: string;
    mode: string;
    baseRevisionId: string;
    canonicalFiles: {
      html: string;
      css: string;
      creativeCss: string;
      javascript: string;
    };
  };

  assert.equal(view.version, NORTHSTAR_LIVE_SOURCE_AUTHORSHIP_VERSION);
  assert.equal(view.mode, "atomic-mounted-source");
  assert.equal(view.baseRevisionId, "revision-accepted");
  assert.equal(view.canonicalFiles.html, "<h1>Accepted source</h1>");
  assert.equal(view.canonicalFiles.css, document.css);
  assert.equal(view.canonicalFiles.creativeCss, "h1{color:navy}");
  assert.equal(view.canonicalFiles.javascript, "Northstar.ready()");
});

test("normalization retries are small, bounded, and contain no render state", () => {
  const authorship = new NorthstarLiveSourceAuthorship({
    baseRevisionId: "revision-accepted",
    baseFiles: document,
    maximumNormalizationAttempts: 99,
  });

  assert.equal(authorship.maximumNormalizationAttempts, 3);
  assert.equal(authorship.beginAttempt(), 1);
  assert.equal(authorship.beginAttempt(), 2);
  assert.equal(authorship.beginAttempt(), 3);
  assert.equal(authorship.hasRemainingAttempts(), false);
  assert.throws(() => authorship.beginAttempt(), /exhausted its 3 deterministic normalization attempts/);
  assert.doesNotMatch(JSON.stringify(authorship.modelView()), /preview|candidate ranking|chromium/i);
});

test("a deterministic correction can repair the exact prior draft without making it accepted state", () => {
  const authorship = new NorthstarLiveSourceAuthorship({
    baseRevisionId: "revision-accepted",
    baseFiles: document,
    maximumNormalizationAttempts: 2,
  });
  authorship.rememberDraft({
    targetId: "presentation",
    html: "<h1>Draft needing repair</h1>",
    css: "h1{color:tomato}",
  });
  const view = authorship.modelView() as {
    canonicalFiles: { html: string };
    correctionDraft: { html: string };
  };

  assert.equal(view.canonicalFiles.html, "<h1>Accepted source</h1>");
  assert.equal(view.correctionDraft.html, "<h1>Draft needing repair</h1>");
});
