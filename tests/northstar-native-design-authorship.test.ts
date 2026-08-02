import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL,
  buildNorthstarCurrentDesignReading,
} from "@/lib/canvas-ai/northstar-design-intelligence";
import { NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA } from "@/lib/canvas-artifacts/types";

test("native design authorship gives every artboard a concrete Northstar visual language", () => {
  assert.match(NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL, /artboard, not webpage/i);
  assert.match(NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL, /editorial hierarchy/i);
  assert.match(NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL, /local-first transformation/i);
  assert.match(NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL, /preserve current rendered size, crop, spacing, card treatment, flow grouping, and authoritative sequence order/i);
  assert.match(NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL, /add analysis and narrative around it instead of reflowing or restyling it/i);
  assert.match(NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL, /do not make a mobile screenshot the dominant artboard-sized surface by accident/i);
  assert.doesNotMatch(NORTHSTAR_NATIVE_DESIGN_AUTHORSHIP_PROTOCOL, /inherited layout is disposable presentation scaffolding/i);
});

test("current design reading exposes source language and exact evidence choreography to the same model call", () => {
  const reading = buildNorthstarCurrentDesignReading({
    document: {
      schema: NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
      html: '<main data-ns-node-id="presentation"><section data-ns-node-id="flow-awin"><div data-ns-node-id="flow-awin-sequence"></div></section></main>',
      css: `
        :root { --ns-ink: #17171b; --ns-surface: #ffffff; }
        .ns-artifact { font-family: "Inter", sans-serif; display: grid; gap: 24px; padding: 40px; }
        .ns-sequence { display: flex; flex-wrap: nowrap; column-gap: 18px; }
      `,
      javascript: "",
    },
    editableSurface: {
      availableRegionIds: ["presentation", "flow-awin", "flow-awin-sequence", "evidence-awin-1", "evidence-awin-2"],
      flowRegions: [{
        nodeId: "flow-awin",
        sequenceNodeId: "flow-awin-sequence",
        appName: "Awin",
        flowName: "Mobile onboarding",
        evidenceNodeIds: ["evidence-awin-1", "evidence-awin-2"],
        evidenceIds: ["awin-1", "awin-2"],
      }],
      evidenceNodes: [
        {
          nodeId: "evidence-awin-1",
          evidenceId: "awin-1",
          flowNodeId: "flow-awin",
          sequenceNodeId: "flow-awin-sequence",
          index: 0,
          currentRole: "supporting",
        },
        {
          nodeId: "evidence-awin-2",
          evidenceId: "awin-2",
          flowNodeId: "flow-awin",
          sequenceNodeId: "flow-awin-sequence",
          index: 1,
          currentRole: "focal",
        },
      ],
    },
  });

  assert.deepEqual(reading.sourceSignals.fontFamilies, ['"Inter", sans-serif']);
  assert.ok(reading.sourceSignals.designTokens.some((token) => /--ns-ink/.test(token)));
  assert.ok(reading.sourceSignals.spacingValues.includes("24px"));
  assert.ok(reading.sourceSignals.layoutModes.includes("grid"));
  assert.ok(reading.sourceSignals.layoutModes.includes("non-wrapping sequences"));
  assert.deepEqual(reading.evidenceGroups[0]?.sequenceOrder, ["awin-1", "awin-2"]);
  assert.equal(reading.evidenceNodes[1]?.currentRole, "focal");
  assert.match(reading.instruction, /supplied existing node IDs/i);
});
