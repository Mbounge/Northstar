import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing start marker ${start}`);
  assert.notEqual(to, -1, `Missing end marker ${end}`);
  return source.slice(from, to);
}

test("the production workspace owns one Phase 2 plus Phase 3 runtime behind the total-architecture flag", () => {
  const workspace = read("components/canvas/north-star-canvas-workspace.tsx");
  assert.match(workspace, /NEXT_PUBLIC_NORTHSTAR_TOTAL_ARCHITECTURE/);
  assert.match(workspace, /createNorthstarWindowProjectionSurface/);
  assert.match(workspace, /createNorthstarWorkspaceRuntime/);
  assert.match(workspace, /createNorthstarTurnClient/);
  assert.match(workspace, /NorthstarArchitectureProvider/);
  assert.match(workspace, /northstarWorkspaceRuntime=\{northstarWorkspaceRuntime\}/);
  assert.match(workspace, /runtime\.dispose\(\)/);
  assert.match(workspace, /projectionSurface\.dispose\(\)/);
});

test("Phase 4 never falls through to the legacy SSE route while its runtime is mounting", () => {
  const workspace = read("components/canvas/north-star-canvas-workspace.tsx");
  const send = between(workspace, "const sendMessage = async", "const resumeNorthstarRun = async");
  const phase4Gate = send.indexOf("if (northstarTotalArchitectureEnabled)");
  const legacyFetch = send.indexOf('fetch("/api/canvas-ai"');
  assert.ok(phase4Gate >= 0);
  assert.ok(legacyFetch > phase4Gate);
  assert.match(send.slice(phase4Gate, legacyFetch), /if \(!northstarWorkspaceRuntime\)/);
  assert.match(send.slice(phase4Gate, legacyFetch), /return;/);
});

test("the code artifact host chooses exactly one writer and the direct writer has no repository or acknowledgement behavior", () => {
  const host = read("components/canvas/artifacts/code-artifact-host.tsx");
  const direct = between(host, "function DirectCodeArtifactHostImpl", "const DirectCodeArtifactHost = memo");
  const writerSwitch = between(host, "function CodeArtifactHostSwitch", "export const CodeArtifactHost");

  assert.match(writerSwitch, /architecture\.enabled/);
  assert.match(writerSwitch, /DirectCodeArtifactHost/);
  assert.match(writerSwitch, /LegacyCodeArtifactHost/);
  assert.match(direct, /data-northstar-writer="direct-projection"/);
  assert.match(direct, /registerProjectionFrame/);
  for (const forbidden of [
    "getNorthstarSurfaceRepository",
    "artifact-ack",
    "pendingProposal",
    "pendingAckToken",
    "deliverAcknowledgement",
    "activate-commit",
    "checkout-commit",
    "onProjectCommit(",
  ]) {
    assert.equal(direct.includes(forbidden), false, `Direct writer contains forbidden legacy behavior: ${forbidden}`);
  }
});

test("the workspace runtime composes ledger authority with the stateless client and direct projection controller", () => {
  const runtime = read("lib/canvas-architecture/northstar-workspace-runtime.ts");
  assert.match(runtime, /createNorthstarEphemeralLedger/);
  assert.match(runtime, /createNorthstarProjectionTaskController/);
  assert.match(runtime, /createNorthstarTurnClient/);
  assert.match(runtime, /projectionSurface\.capture/);
  assert.match(runtime, /controller\.runNextTask/);
  assert.match(runtime, /controller\.resumeActiveTask/);
  assert.match(runtime, /cancelAuthoritativeLedger/);
  for (const forbidden of [
    "northstar-artboard-ack",
    "northstar-artboard-actor",
    "northstar-repository",
    "artifact-ack",
    "activate-commit",
    "checkout-commit",
    "localStorage",
    "indexedDB",
    "Supabase",
  ]) {
    assert.equal(runtime.includes(forbidden), false, `Workspace runtime contains forbidden authority dependency: ${forbidden}`);
  }
});

test("the production ledger inspector is read-only", () => {
  const inspector = read("components/canvas/northstar-ledger-inspector.tsx");
  assert.match(inspector, /Run/);
  assert.match(inspector, /Task/);
  assert.match(inspector, /Commits/);
  assert.match(inspector, /Events/);
  for (const mutation of [
    ".createTask(",
    ".startAttempt(",
    ".recordAttemptFailure(",
    ".prepareArtboardCommit(",
    ".commitTask(",
    ".cancelTask(",
    ".completeRun(",
  ]) {
    assert.equal(inspector.includes(mutation), false, `Inspector contains mutation ${mutation}`);
  }
});

test("Phase 4 preserves the Phase 3 primitive-only projection boundary", () => {
  const projectionFiles = fs.readdirSync(path.join(root, "lib/canvas-projection"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => read(`lib/canvas-projection/${name}`))
    .join("\n");
  for (const forbidden of ["innerHTML", "outerHTML", "replaceChildren", "document.write", "insertAdjacentHTML"]) {
    assert.equal(projectionFiles.includes(forbidden), false, `Projection subsystem contains ${forbidden}`);
  }
});

test("the Phase 4 bootstrap is a canonical direct-projection document rather than a legacy runtime URL", async () => {
  const { createNorthstarDirectBootstrapArtifactPayload } = await import(
    "@/lib/canvas-artifacts/northstar-direct-bootstrap"
  );
  const { buildCanvasArtifactRuntimeDocument } = await import(
    "@/lib/canvas-artifacts/runtime-document"
  );
  const artifact = createNorthstarDirectBootstrapArtifactPayload({
    artifactId: "phase4-bootstrap-test",
    now: new Date("2026-07-21T00:00:00.000Z"),
  });

  assert.equal(artifact.runtimeUrl, undefined);
  assert.ok(artifact.document);
  assert.ok(artifact.dataBundle);
  assert.equal(artifact.surfaceId, artifact.artifactId);
  assert.match(artifact.document.html, /data-ns-node-id="northstar-artboard"/);

  const runtimeDocument = buildCanvasArtifactRuntimeDocument(artifact);
  assert.ok(runtimeDocument);
  assert.match(runtimeDocument, /northstar\.projection\.capture/);
  assert.match(runtimeDocument, /northstar\.projection\.prepare/);
  assert.match(runtimeDocument, /northstar\.projection\.apply/);
});

test("Phase 4 never registers or loads a bridge-less legacy runtime URL as the direct projection target", () => {
  const host = read("components/canvas/artifacts/code-artifact-host.tsx");
  const direct = between(host, "function DirectCodeArtifactHostImpl", "const DirectCodeArtifactHost = memo");
  assert.match(direct, /mountedSurface\?\.document && mountedSurface\.dataBundle/);
  assert.match(direct, /if \(!frame \|\| !mountedSurface \|\| !runtimeDocument\) return/);
  assert.equal(direct.includes("src={runtimeDocument ? undefined : mountedSurface.runtimeUrl}"), false);
  assert.match(direct, /northstar-direct-artifact-incompatible/);

  const workspace = read("components/canvas/north-star-canvas-workspace.tsx");
  assert.match(workspace, /createNorthstarDirectBootstrapArtifactPayload/);
  assert.match(workspace, /object\.codeArtifact\?\.document && object\.codeArtifact\.dataBundle/);
});
