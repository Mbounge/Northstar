import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildNorthstarProjectionBridgeScript } from "@/lib/canvas-projection/bridge-script";
import { buildCanvasArtifactRuntimeDocument } from "@/lib/canvas-artifacts/runtime-document";
import type { CanvasCodeArtifactPayload } from "@/lib/canvas-artifacts/types";

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

test("Phase 3 projection modules do not depend on the legacy repository or acknowledgement path", () => {
  const root = join(process.cwd(), "lib", "canvas-projection");
  const prohibited = [
    "northstar-artboard-ack",
    "northstar-artboard-actor",
    "northstar-repository",
    "northstar-repository-reducer",
    "artifact-ack",
    "pendingAckToken",
    "activate-commit",
    "checkout-commit",
    "Supabase",
    "localStorage",
    "indexedDB",
  ];
  for (const file of filesUnder(root)) {
    const source = readFileSync(file, "utf8");
    for (const token of prohibited) {
      assert.equal(
        source.includes(token),
        false,
        `${relative(process.cwd(), file)} contains prohibited Phase 3 token ${token}`,
      );
    }
  }
});

test("the direct bridge contains no whole-tree or HTML-string mutation primitive", () => {
  const source = buildNorthstarProjectionBridgeScript();
  for (const token of ["innerHTML", "outerHTML", "replaceChildren", "document.write", "insertAdjacentHTML"]) {
    assert.equal(source.includes(token), false, `bridge contains prohibited ${token}`);
  }
  for (const operation of [
    "insert-node",
    "remove-node",
    "move-node",
    "set-text",
    "set-attributes",
    "set-styles",
    "set-classes",
    "set-css-layer",
    "set-space",
  ]) {
    assert.equal(source.includes(operation), true, `bridge is missing ${operation}`);
  }
});

test("the web artifact runtime includes the dormant direct projection bridge", () => {
  const artifact: CanvasCodeArtifactPayload = {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "phase3-artifact",
    revisionId: "phase3-root",
    title: "Phase 3 bridge",
    description: "Projection bridge test",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: '<main data-ns-node-id="artboard"><h1 data-ns-node-id="title">Hello</h1></main>',
      css: "main{display:block}",
      javascript: "",
    },
    mutationJournal: [],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Test",
      audience: "Test",
      artifactType: "comparison",
      coverageSummary: "Test",
      apps: [], flows: [], screenshots: [], hypotheses: [], decisions: [], corrections: [], openQuestions: [], allowedAssetUrls: [],
    },
    stagePlan: [],
    activeStageIndex: 0,
    visualStrategy: "Test",
    artifactType: "comparison",
    audience: "Test",
    thinkingDepth: "low",
    creativeReviews: [],
    status: "ready",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    preferredWidth: 1200,
    preferredHeight: 720,
    layoutBaseWidth: 1200,
    layoutBaseHeight: 720,
    intrinsicBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 720 },
    minimumWidth: 1200,
    minimumHeight: 720,
    buildState: { phase: "foundation", completedSteps: 0, totalSteps: 1, message: "Ready", isBuilding: false },
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  };
  const document = buildCanvasArtifactRuntimeDocument(artifact);
  assert.match(document ?? "", /northstar\.projection\.capture/);
  assert.match(document ?? "", /northstar\.projection\.prepare/);
  assert.match(document ?? "", /northstar\.projection\.apply/);
});

test("the Phase 3 writer remains isolated behind the explicit Phase 4 production flag", () => {
  const workspace = readFileSync(
    join(process.cwd(), "components", "canvas", "north-star-canvas-workspace.tsx"),
    "utf8",
  );
  assert.equal(workspace.includes("createNorthstarProjectionTaskController"), false);
  assert.match(workspace, /NEXT_PUBLIC_NORTHSTAR_TOTAL_ARCHITECTURE/);
  assert.match(workspace, /if \(!northstarTotalArchitectureEnabled\) return;/);
  assert.match(workspace, /createNorthstarWindowProjectionSurface/);
});

test("the Phase 4 controller composition exports one preparer and one projector", () => {
  const source = readFileSync(
    join(process.cwd(), "lib", "canvas-projection", "controller.ts"),
    "utf8",
  );
  assert.match(source, /createNorthstarDirectArtboardPreparer/);
  assert.match(source, /createNorthstarDirectArtboardProjector/);
  assert.match(source, /createNorthstarTurnTaskController/);
});
