import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const host = fs.readFileSync(
  path.join(process.cwd(), "components/canvas/artifacts/code-artifact-host.tsx"),
  "utf8",
);
const runtime = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
  "utf8",
);
const healthPolicy = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-ai/northstar-health-policy.ts"),
  "utf8",
);


test("delivers each browser mutation exactly once with immutable deadlines", () => {
  assert.equal(host.includes("if (input.proposal.firstSentAt > 0) return true"), true);
  assert.equal(host.includes("deliveryDeadlineAt"), true);
  assert.equal(host.includes("proposal.dispatchAttempts"), false);
  assert.equal(host.includes("proposal.lastDispatchedAt"), false);
  assert.equal(host.includes("retryBeforeReceiptMs"), false);
  assert.equal(host.includes("retryAfterReceiptMs"), false);
  assert.equal(healthPolicy.includes("deliveryTimeoutMs: 5_000"), true);
});


test("probes the mounted runtime without delaying mutation delivery", () => {
  const probeSend = host.indexOf('type: "northstar.artifact.transport-probe"');
  const mutationSend = host.indexOf('targetWindow.postMessage(mutationMessage, "*")');
  assert.notEqual(probeSend, -1);
  assert.notEqual(mutationSend, -1);
  assert.equal(probeSend < mutationSend, true);
  assert.equal(runtime.includes('message.type === "northstar.artifact.transport-probe"'), true);
  assert.equal(runtime.includes('type: "northstar.artifact.transport-probe-ack"'), true);
  assert.equal(host.includes('name: "transport.probe_acknowledged"'), true);
});


test("rejects proposals that reach the runtime after their delivery deadline", () => {
  const deadlineCheck = runtime.indexOf("Date.now() > Number(message.deliveryDeadlineAt)");
  const assetRegistration = runtime.indexOf("registerAssets(message.assetUrls || [])", deadlineCheck);
  assert.notEqual(deadlineCheck, -1);
  assert.notEqual(assetRegistration, -1);
  assert.equal(deadlineCheck < assetRegistration, true);
  assert.equal(runtime.includes("NORTHSTAR_TRANSPORT_DELIVERY_DEADLINE_EXPIRED"), true);
  assert.equal(runtime.includes("postTerminalMutation(mutationId, expiredMessage)"), true);
});


test("classifies transport interruption without replacing the accepted artboard", () => {
  assert.equal(host.includes("NORTHSTAR_TRANSPORT_FRAME_UNRESPONSIVE_BEFORE_DELIVERY"), true);
  assert.equal(host.includes("NORTHSTAR_TRANSPORT_MUTATION_NOT_ENTERED_AFTER_LIVE_PROBE"), true);
  assert.equal(host.includes("NORTHSTAR_TRANSPORT_MUTATION_ENTERED_WITHOUT_TERMINAL"), true);
  assert.equal(host.includes("delivery-deadline-expired-before-application"), true);
  assert.equal(host.includes('terminalStatus: "timed_out"'), true);
  assert.equal(host.includes('browserRevisionId: proposal.baseRevisionId ?? browserRevisionRef.current'), true);
});


test("stops only design continuation after a transport interruption", () => {
  assert.equal(route.includes('callbacks.trace?.("linear.design.transport_interrupted"'), true);
  assert.equal(route.includes("if (!continuationInterruptionDetail && session.appliedActionCount === 0)"), true);
  assert.equal(route.includes('publicationState: continuationInterruptionDetail ? "working" : "verified"'), true);
  assert.equal(route.includes('send(publicationVerified ? "run.completed" : "run.completed_with_notes"'), true);
  assert.equal(route.includes('detail.startsWith("NORTHSTAR_TRANSPORT_")'), true);
});
