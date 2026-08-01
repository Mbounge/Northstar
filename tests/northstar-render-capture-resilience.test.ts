import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildNorthstarUnavailableVisualObservation,
  buildNorthstarVisualObservationParts,
} from "@/lib/canvas-ai/northstar-visual-observation";
import {
  classifyCanvasDiagnosticEvent,
  getCanvasRunTelemetry,
} from "@/lib/canvas-ai/canvas-diagnostics";

const root = process.cwd();
const captureSource = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-render-capture.ts"), "utf8");
const routeSource = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const diagnosticsSource = fs.readFileSync(path.join(root, "lib/canvas-ai/canvas-diagnostics.ts"), "utf8");

test("capture unavailability degrades to semantic observation without sending a fake image", () => {
  const observation = buildNorthstarUnavailableVisualObservation({
    revisionId: "revision-accepted",
    width: 2400,
    height: 1800,
    warning: "No Chromium executable is available.",
    acknowledgement: {
      schema: "northstar.artboard-ack.v1",
      ackToken: "token",
      artifactId: "artifact",
      surfaceId: "surface",
      revisionId: "revision-accepted",
      status: "applied",
      changedNodeIds: ["synthesis"],
      meaningfulChangedNodeIds: ["synthesis"],
      changeKinds: ["content"],
      requiredAssetUrls: [],
      loadedAssetUrls: [],
      missingAssetUrls: [],
      acknowledgedAt: new Date(0).toISOString(),
      size: {
        artifactId: "artifact",
        revisionId: "revision-accepted",
        measuredAt: new Date(0).toISOString(),
        intrinsicWidth: 2400,
        intrinsicHeight: 1800,
      },
    },
  });

  assert.equal(observation.captureStatus, "unavailable");
  assert.equal(observation.intrinsicMeasurement?.width, 2400);
  const parts = buildNorthstarVisualObservationParts({ observation });
  assert.equal(parts.some((part) => "inlineData" in part), false);
  const text = parts
    .filter((part): part is { text: string } => "text" in part)
    .map((part) => part.text)
    .join("\n");
  assert.match(text, /image capture unavailable/i);
  assert.match(text, /infrastructure degradation/i);
  assert.match(text, /semantic inventory/i);
});

test("render capture preserves the first executable failure instead of masking it with a later ENOENT", () => {
  assert.match(captureSource, /class NorthstarChromiumUnavailableError/);
  assert.match(captureSource, /if \(error instanceof NorthstarChromiumUnavailableError\)/);
  assert.match(captureSource, /throw new Error\(`Northstar render capture failed using \$\{command\}/);
  assert.doesNotMatch(captureSource, /let lastError/);
  assert.match(captureSource, /totalTimeoutMs/);
  assert.match(captureSource, /remainingBudget\("PNG capture"\)/);
});

test("accepted revisions survive optional capture failure in both design loops", () => {
  assert.match(routeSource, /linear\.design\.observation_degraded/);
  assert.match(routeSource, /creative\.observation\.degraded/);
  assert.match(routeSource, /buildNorthstarUnavailableVisualObservation/);
  assert.match(routeSource, /browserRevisionPreserved: true/);
  assert.match(routeSource, /timeoutMs: 8_000/);
  assert.match(routeSource, /maximumViews: thinkingPolicy\.optionalDetailViewCount/);
  assert.match(routeSource, /northstarThinkingModePolicy\(thinkingDepth\)/);
  assert.match(diagnosticsSource, /linear\.design\.observation_degraded/);
  assert.match(diagnosticsSource, /creative\.observation\.degraded/);
});

test("capture degradation is a warning on a completed run and is counted as a render failure", () => {
  const events = [
    {
      id: "started",
      timestamp: "2026-08-01T00:00:00.000Z",
      phase: "run" as const,
      name: "run.started",
      runId: "run-1",
    },
    {
      id: "degraded",
      timestamp: "2026-08-01T00:00:01.000Z",
      phase: "run" as const,
      name: "linear.design.observation_degraded",
      runId: "run-1",
      data: { browserRevisionPreserved: true },
    },
    {
      id: "completed",
      timestamp: "2026-08-01T00:00:02.000Z",
      phase: "run" as const,
      name: "run.completed_with_notes",
      runId: "run-1",
    },
  ];
  assert.equal(classifyCanvasDiagnosticEvent(events[1], events), "warning");
  const telemetry = getCanvasRunTelemetry(events);
  assert.equal(telemetry.completedRuns, 1);
  assert.equal(telemetry.incompleteRuns, 0);
  assert.equal(telemetry.renderFailureRuns, 1);
});
