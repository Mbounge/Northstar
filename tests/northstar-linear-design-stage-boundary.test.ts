import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NorthstarLinearDesignSession } from "@/lib/canvas-ai/northstar-linear-design-session";
import { appendNorthstarArtboardMutation } from "@/lib/canvas-ai/northstar-artboard-mutations";
import { compileNorthstarMutationDraft } from "@/lib/canvas-ai/northstar-mutation-compiler";
import { validateNorthstarLinearDesignCandidate } from "@/lib/canvas-ai/northstar-linear-design-transaction";
import { summarizeNorthstarRunOutcome } from "@/lib/canvas-ai/canvas-diagnostics";
import type { NorthstarGeneratedCodeArtifactPackage } from "@/lib/canvas-artifacts/types";


function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const artifact = {
  schema: "northstar.generated-web-artifact.v0.3",
  artifactId: "artifact-linear",
  revisionId: "research-revision",
  title: "Northstar analysis",
  description: "Exact research artboard",
  objective: "Compare products",
  audience: "executive",
  artifactType: "comparison-board",
  visualStrategy: "Existing premium research surface",
  document: {
    schema: "northstar.web-artifact-document.v1",
    html: '<main data-ns-node-id="artboard"><section data-ns-node-id="presentation"><div data-ns-node-id="title">Title</div></section><section data-ns-node-id="evidence-reservoir"></section></main>',
    css: "",
    javascript: "",
  },
  mutationJournal: [],
  preferredWidth: 2360,
  preferredHeight: 1326,
  minimumWidth: 1000,
  minimumHeight: 700,
  stages: [],
  dataBundle: { screenshots: [], flows: [], apps: [], hypotheses: [], decisions: [], allowedAssetUrls: [] },
  diagnostics: [],
  creativeReviews: [],
  provisional: false,
  publicationState: "working",
} as unknown as NorthstarGeneratedCodeArtifactPackage;

test("linear design memory is monotonic across applied and mechanically failed actions", () => {
  const session = new NorthstarLinearDesignSession("Improve the exact artboard", "low");
  assert.equal(session.nextActionIndex, 1);
  session.recordApplied({
    baseRevisionId: "research-revision",
    revisionId: "design-1",
    intention: "Establish hierarchy",
    visibleChange: "Hierarchy changes",
    viewerUnderstanding: "The argument is clearer",
  });
  assert.equal(session.nextActionIndex, 2);
  session.recordExecutionFailure({
    baseRevisionId: "design-1",
    attemptedRevisionId: "design-2",
    intention: "Add annotation",
    visibleChange: "Annotation appears",
    viewerUnderstanding: "Evidence connects to conclusion",
    runtimeIssues: ["Target not found"],
  });
  assert.equal(session.nextActionIndex, 3);
  assert.equal(session.appliedActionCount, 1);
  assert.equal(session.executionFailureCount, 1);
  assert.equal(session.modelView().actions[1]?.baseRevisionId, "design-1");
});

test("linear design actions keep infrastructure-owned sequence numbers after browser snapshot compaction", () => {
  const first = appendNorthstarArtboardMutation({
    previous: artifact,
    label: "First action",
    phase: "analysis",
    intent: "Create hierarchy",
    executionPolicy: "linear-design",
    sequenceOverride: 1,
    allowTextOnly: true,
    draft: {
      title: "First",
      description: "First",
      visualStrategy: "First",
      visibleChange: "First",
      geometryIntent: "preserve",
      transitionMs: 240,
      operations: [{ op: "set-text", targetId: "title", text: "First" }],
    },
  });
  const compacted = { ...first, document: artifact.document, mutationJournal: [] };
  const third = appendNorthstarArtboardMutation({
    previous: compacted,
    label: "Third attempt",
    phase: "analysis",
    intent: "Continue",
    executionPolicy: "linear-design",
    sequenceOverride: 3,
    allowTextOnly: true,
    draft: {
      title: "Third",
      description: "Third",
      visualStrategy: "Third",
      visibleChange: "Third",
      geometryIntent: "preserve",
      transitionMs: 240,
      operations: [{ op: "set-text", targetId: "title", text: "Third" }],
    },
  });
  assert.equal(third.mutationJournal?.[0]?.sequence, 3);
  assert.match(third.revisionId, /-live-3-/);
  assert.equal(third.parentRevisionId, first.revisionId);
});

test("style-only design refinements remain executable only on the linear design path", () => {
  const draft = {
    title: "Refine typography",
    description: "Refine typography",
    visualStrategy: "Refine typography",
    visibleChange: "Type hierarchy becomes clearer",
    geometryIntent: "preserve" as const,
    transitionMs: 240,
    operations: [{ op: "set-css-layer" as const, layerId: "type-refinement", css: '[data-ns-node-id="title"]{letter-spacing:-.04em}' }],
  };
  const legacy = compileNorthstarMutationDraft({ previous: artifact, draft });
  assert.equal(legacy.draft.operations.length, 0);
  const linear = compileNorthstarMutationDraft({ previous: artifact, draft, executionPolicy: "linear-design" });
  assert.equal(linear.draft.operations.length, 1);
});



test("the design-stage seam permits one mutation but cannot replace the current3 research source or geometry", () => {
  const candidate = appendNorthstarArtboardMutation({
    previous: artifact,
    label: "First visible design action",
    phase: "analysis",
    intent: "Create a clear visual hierarchy",
    executionPolicy: "linear-design",
    sequenceOverride: 1,
    allowTextOnly: true,
    draft: {
      title: "First",
      description: "First",
      visualStrategy: "First",
      visibleChange: "First",
      geometryIntent: "preserve",
      transitionMs: 240,
      operations: [{ op: "set-text", targetId: "title", text: "First" }],
    },
  });
  const valid = validateNorthstarLinearDesignCandidate({ base: artifact, candidate, actionIndex: 1 });
  assert.equal(valid.ok, true);
  assert.equal(valid.batch?.sequence, 1);

  const replacedSource = {
    ...candidate,
    document: { ...candidate.document, html: '<main data-ns-node-id="artboard">replacement</main>' },
  };
  const invalid = validateNorthstarLinearDesignCandidate({ base: artifact, candidate: replacedSource, actionIndex: 1 });
  assert.equal(invalid.ok, false);
  assert.match(invalid.issues.join(" "), /replaced the current3 research source/);
});



test("a later linear action may append to an authoritative unsnapshotted journal without replaying it to the browser", () => {
  const first = appendNorthstarArtboardMutation({
    previous: artifact,
    label: "First",
    phase: "analysis",
    intent: "First",
    executionPolicy: "linear-design",
    sequenceOverride: 1,
    allowTextOnly: true,
    draft: {
      title: "First",
      description: "First",
      visualStrategy: "First",
      visibleChange: "First",
      geometryIntent: "preserve",
      transitionMs: 240,
      operations: [{ op: "set-text", targetId: "title", text: "First" }],
    },
  });
  const second = appendNorthstarArtboardMutation({
    previous: first,
    label: "Second",
    phase: "analysis",
    intent: "Second",
    executionPolicy: "linear-design",
    sequenceOverride: 2,
    allowTextOnly: true,
    draft: {
      title: "Second",
      description: "Second",
      visualStrategy: "Second",
      visibleChange: "Second",
      geometryIntent: "preserve",
      transitionMs: 240,
      operations: [{ op: "set-text", targetId: "title", text: "Second" }],
    },
  });
  const validation = validateNorthstarLinearDesignCandidate({ base: first, candidate: second, actionIndex: 2 });
  assert.equal(validation.ok, true);
  assert.equal(validation.batch?.sequence, 2);
  assert.equal(second.mutationJournal?.length, 2);
});

test("the production route preserves current3 research startup and switches only at the design-stage seam", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const startup = source.indexOf("if (!selectedCodeArtifact && !preparedInitialLivePackage)");
  const researchCheckpoint = source.indexOf("scheduleResearchVisualCheckpoint");
  const dataBundle = source.indexOf("const codeArtifactDataBundle");
  const linearDesign = source.indexOf("await buildLinearDesignArtifactPackage", dataBundle);
  assert.ok(startup >= 0);
  assert.ok(researchCheckpoint >= 0);
  assert.ok(dataBundle >= 0);
  assert.ok(linearDesign > dataBundle);
  assert.match(source.slice(startup, linearDesign), /buildPolishedLiveArtifactPackage/);
  assert.match(source.slice(startup, linearDesign), /dispatchLiveArtifactPackage\(initialLivePackage/);
});


test("the current3 opening, evidence streaming, and research retrieval source remain exact through the design seam", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const openingBuilder = sourceBlock(
    source,
    "async function buildPolishedLiveArtifactPackage",
    "async function buildLinearDesignArtifactPackage",
  );
  const openingAndResearchCheckpoints = sourceBlock(
    source,
    "            if (!selectedCodeArtifact && !preparedInitialLivePackage)",
    "            const emitCompositionCheckpoint = (",
  );
  const researchRetrieval = sourceBlock(
    source,
    "            const selectedArtifactDataBundle = selectedCodeArtifact?.dataBundle;",
    "            compositionUsedLinearDesign = true;",
  );

  assert.equal(sha256(openingBuilder), "2fbc5c4fad6f8d201bcafd205c3dc1cee2bb1b9bfcc5b89621abddef0029c6a8");
  assert.equal(sha256(openingAndResearchCheckpoints), "86904637d9c3f1ef1fd24abfd08340352e4bc0f900d964294c1c779bb4149be2");
  assert.equal(sha256(researchRetrieval), "42be6f976f49c8118e12ef302c109789ed35d0019a526c3051afca3575d0e21e");
});

test("a malformed or stale linear action cannot fall through as a normal canonical Canvas update", async () => {
  const workspace = await readFile(new URL("../components/canvas/north-star-canvas-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /if \(linearDesignAction && !linearDesignTransportValid\) \{/);
  assert.match(workspace, /LINEAR_DESIGN_PROTOCOL_INVALID/);
  assert.match(workspace, /const transactionalCandidate = linearDesignAction\s*\? true/);
});

test("the completed linear loop never republishes its final source through the legacy composition transport", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const seam = source.indexOf("const codeArtifactPackage = await buildLinearDesignArtifactPackage");
  const completionSteps = source.indexOf("const compositionSteps = buildCompositionActionSteps", seam);
  const completionBranch = source.slice(completionSteps, source.indexOf('emitCompositionCheckpoint("building"', completionSteps));
  assert.ok(seam >= 0 && completionSteps > seam);
  assert.match(completionBranch, /alreadyMaterialized: true/);
});

test("an ambiguous receipt stops the linear loop instead of dispatching against a guessed browser revision", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("const dispatchLinearDesignAction = async");
  const end = source.indexOf("if (!selectedCodeArtifact && !preparedInitialLivePackage)", start);
  const dispatcher = source.slice(start, end);
  assert.match(dispatcher, /status: "transport-unknown"/);
  assert.match(dispatcher, /will not dispatch another action until the exact mounted revision is known/);
  assert.match(source, /if \(dispatchResult\.status === "transport-unknown"\) \{\s*throw new Error\(dispatchResult\.detail\)/);
});

test("linear completion and failure paths do not enter legacy lifecycle settlement", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const completionStart = source.indexOf("if (requestedCanvasActionCount > 0 && compositionUsedLinearDesign)");
  const completionEnd = source.indexOf("if (requestedCanvasActionCount > 0) {", completionStart);
  const completion = source.slice(completionStart, completionEnd);
  assert.doesNotMatch(completion, /run\.settlement\.requested|lifecycle\.authority\.settled|decideNorthstarRunSettlement/);
  assert.match(completion, /designRuntime: "linear-living-artboard"/);

  const catchStart = source.indexOf("if (compositionUsedLinearDesign) {", source.indexOf("} catch (error)"));
  const catchEnd = source.indexOf("if (request.signal.aborted", catchStart);
  const linearCatch = source.slice(catchStart, catchEnd);
  assert.doesNotMatch(linearCatch, /classifyNorthstarLifecycleFailure|lifecycle\.authority\.settled/);
});

test("the legacy whole-candidate design builder is no longer invoked by the production composition path", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  assert.equal(source.match(/buildGeneratedCodeArtifactPackage\(\{/g)?.length ?? 0, 1);
  assert.equal(source.match(/buildLinearDesignArtifactPackage\(\{/g)?.length ?? 0, 2);
});

test("the new design dispatcher has no actor, creative lease, semantic acceptance, or post-render contract review", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("const dispatchLinearDesignAction = async");
  const end = source.indexOf("if (!selectedCodeArtifact && !preparedInitialLivePackage)", start);
  const dispatcher = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(dispatcher, /liveArtboardActor|acceptMaterialized|reviewNorthstarBrowserCommit|semanticAcceptance|acceptedCreativeActCount|acquireCreativeLease/);
  assert.doesNotMatch(dispatcher, /send\("plan\.extended"|send\("step\.started"|send\("tool\.started"/);
  assert.match(dispatcher, /validateNorthstarLinearDesignCandidate/);
  assert.match(dispatcher, /executionMode: "linear-design"/);
  assert.match(dispatcher, /acknowledgement\.status !== "applied"/);
});




test("the linear loop completes only after rendered self-critique explicitly declares the artboard finished", async () => {
  const source = await readFile(new URL("../app/api/canvas-ai/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function buildLinearDesignArtifactPackage");
  const end = source.indexOf("async function buildGeneratedCodeArtifactPackage", start);
  const loop = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(loop, /let modelDeclaredComplete = false/);
  assert.match(loop, /if \(!critique\.continueWorking && critique\.implementationDefects\.length === 0\) \{\s*modelDeclaredComplete = true;/);
  assert.match(loop, /if \(!modelDeclaredComplete\) \{\s*throw new Error\(/);
  assert.match(loop, /could not inspect the resulting artboard before choosing the next action/);
  assert.doesNotMatch(loop, /fallback critique|assume.*complete|publicationState:\s*"verified"[\s\S]*session\.appliedActionCount === 0/);
});

test("diagnostics count browser-applied linear actions instead of reporting zero accepted designs", () => {
  const outcome = summarizeNorthstarRunOutcome([
    {
      phase: "run",
      name: "run.started",
      runId: "run-linear",
      timestamp: "2026-07-30T00:00:00.000Z",
      id: "start",
    },
    {
      phase: "runtime",
      name: "linear.design.browser_applied",
      runId: "run-linear",
      timestamp: "2026-07-30T00:00:01.000Z",
      id: "applied-1",
      data: { actionIndex: 1, revisionId: "design-1" },
    },
    {
      phase: "runtime",
      name: "linear.design.browser_applied",
      runId: "run-linear",
      timestamp: "2026-07-30T00:00:02.000Z",
      id: "applied-2",
      data: { actionIndex: 2, revisionId: "design-2" },
    },
    {
      phase: "run",
      name: "run.completed",
      runId: "run-linear",
      timestamp: "2026-07-30T00:00:03.000Z",
      id: "complete",
      data: { designRuntime: "linear-living-artboard" },
    },
  ]);
  assert.equal(outcome.acceptedCreativeStages, 2);
  assert.equal(outcome.attemptedCreativeStages, 2);
  assert.equal(outcome.creativeOutcome, "accepted-progress");
  assert.equal(outcome.publicationReadiness, "ready");
});

test("client and runtime isolate the linear design transport without changing the research path", async () => {
  const workspace = await readFile(new URL("../components/canvas/north-star-canvas-workspace.tsx", import.meta.url), "utf8");
  const host = await readFile(new URL("../components/canvas/artifacts/code-artifact-host.tsx", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../lib/canvas-artifacts/runtime-document.ts", import.meta.url), "utf8");
  assert.match(workspace, /codeArtifactAction\.executionMode === "linear-design"/);
  assert.match(workspace, /pendingLinearDesignActionsRef/);
  assert.match(host, /onContentSize\(restoredSize\)/);
  assert.match(runtime, /const compileCanonicalGeometry = async/);
  assert.match(runtime, /const compiledSize = await compileCanonicalGeometry\(currentRevisionId, batch\.mutationId/);
  assert.doesNotMatch(runtime, /pendingAcknowledgement\?\.batch\?\.executionPolicy === "linear-design"/);
  assert.match(runtime, /linearDesignExecution\s*\? ""/);
  assert.match(runtime, /visualSafetyFailure\([\s\S]*linearDesignExecution/);
  assert.match(runtime, /if \(!mechanicalOnly && newUnsafeEvidenceOverlays\.length\)/);
  assert.match(runtime, /if \(!mechanicalOnly && newEvidenceCollisionPairs\.length\)/);
  assert.match(runtime, /blockingGeometryIntegrityFailures = linearDesignExecution/);
  assert.match(runtime, /const essentialPrimitiveAuditReason = !linearDesignExecution/);
});
