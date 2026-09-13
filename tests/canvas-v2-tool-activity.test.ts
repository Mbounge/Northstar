import assert from "node:assert/strict";
import test from "node:test";
import { canvasV2HasConfirmedWebSearch, canvasV2ActivitySummary, type CanvasV2Activity } from "../lib/canvas-v2/tool-activity";

test("a corrected internal draft is one activity while unavailable external tools remain explicit", () => {
  const action = (label: string, status: CanvasV2Activity["status"]): CanvasV2Activity => ({ id: `${label}:${status}`, requestId: "r", sequence: 1, at: "now", kind: "activity", label, status });
  assert.equal(canvasV2ActivitySummary([action("Composing the canvas", "failed"), action("Composing the canvas", "started")], true), "Composing the canvas…");
  assert.equal(canvasV2ActivitySummary([action("Composing the canvas", "failed")], true), "Composing the canvas");
  assert.equal(canvasV2ActivitySummary([action("Web research", "failed")], false), "Web research failed");
  assert.equal(canvasV2ActivitySummary([action("Composing the canvas", "started")], false), "Composing the canvas interrupted");
});

test("web-search activity requires a completed researcher receipt, not planning or a failed request", () => {
  assert.equal(canvasV2HasConfirmedWebSearch([]), false);
  assert.equal(canvasV2HasConfirmedWebSearch([{ model: "test", role: "discovery-director", outcome: "completed", durationMs: 1 }]), false);
  assert.equal(canvasV2HasConfirmedWebSearch([{ model: "test", role: "external-researcher", outcome: "rejected", durationMs: 1 }]), false);
  assert.equal(canvasV2HasConfirmedWebSearch([{ model: "test", role: "external-researcher", outcome: "completed", durationMs: 1 }]), true);
});
