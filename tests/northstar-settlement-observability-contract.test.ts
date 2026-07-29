import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
const workspace = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);
const diagnostics = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-ai/canvas-diagnostics.ts"),
  "utf8",
);

test("publication settlement trusts browser preservation rather than accepted-act count", () => {
  assert.match(
    route,
    /const operationalRevisionPreserved = publicationReadiness\.operationallyReady\s+&& publicationAcknowledgement\?\.status === "applied"/,
  );
  const publicationBlock = route.slice(
    route.indexOf("const publicationReadiness = assessNorthstarAdaptiveReadiness"),
    route.indexOf("if (!operationalRevisionPreserved)"),
  );
  assert.doesNotMatch(publicationBlock, /acceptedActCount/);
});

test("incomplete diagnostics retain the terminal settlement receipt", () => {
  const incompleteBlock = workspace.slice(
    workspace.indexOf('if (eventName === "run.incomplete")'),
    workspace.indexOf('if (eventName === "run.blocked")'),
  );
  assert.match(incompleteBlock, /terminalState:/);
  assert.match(incompleteBlock, /expectedFinalRevisionId:/);
  assert.match(incompleteBlock, /clientReceipt:/);
});

test("completed-with-notes is terminal across lifecycle and diagnostics", () => {
  assert.match(route, /event === "run\.completed_with_notes"\) runLifecycle\.finish\("complete"\)/);
  assert.match(workspace, /event\.name === "run\.completed_with_notes"/);
  assert.match(diagnostics, /candidate\.name === "run\.completed_with_notes"/);
  assert.match(diagnostics, /terminal\?\.name === "run\.completed_with_notes"/);
});
