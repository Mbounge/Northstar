import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runtime = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
  "utf8",
);

test("candidate application exceptions are rejected after rollback, not emitted as runtime failures", () => {
  const queueStart = runtime.indexOf("const processQueue = async");
  const queueEnd = runtime.indexOf("const getContentBounds", queueStart);
  const queue = runtime.slice(queueStart, queueEnd);
  assert.match(queue, /type:\s*"northstar\.artifact\.mutation-rejected"/);
  assert.doesNotMatch(queue, /type:\s*"northstar\.artifact\.runtime-error"/);
  assert.match(queue, /browserRevisionId:\s*currentRevisionId/);
});

test("browser receipts expose evidence survival while canonical snapshots strip temporary geometry", () => {
  assert.match(runtime, /captureEvidenceRegistryReceipt/);
  assert.match(runtime, /unplacedEvidenceIds:\s*runtimeInheritedEvidenceIds\.slice\(\)/);
  assert.match(runtime, /clearRuntimeInheritedPlacement\(element\)/);
  assert.match(runtime, /clearRuntimeInheritedParentStyle\(element\)/);
  assert.match(runtime, /New protected-evidence collisions appeared/);
  assert.match(runtime, /rollbackDurationMs/);
  assert.match(runtime, /candidateDurationMs/);
});

test("only an exact browser-preserved revision may recover a design continuation", () => {
  assert.doesNotMatch(route, /verifiedProgress/);
  assert.match(route, /classifyNorthstarLifecycleFailure/);
  assert.match(route, /recordBrowserCommittedLifecycleState/);
  assert.match(route, /operationalRevisionPreserved/);
  assert.match(route, /recovery:\s*"accepted-browser-revision-preserved"/);
  assert.match(route, /send\("run\.completed_with_notes"/);
});

test("server timing traces use the same typed envelope consumed by the client", () => {
  assert.match(route, /name:\s*`server\.\$\{stage\}\.\$\{status\}`/);
  assert.match(route, /data,/);
  assert.match(route, /detail:/);
});
