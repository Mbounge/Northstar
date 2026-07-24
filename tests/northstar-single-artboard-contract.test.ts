import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_ACTION_TOOL_NAMES,
  NORTHSTAR_AGENT_TOOL_NAMES,
  NORTHSTAR_TOOL_REGISTRY,
  getToolRegistryPromptSummary,
} from "@/lib/canvas-ai/northstar-tool-registry";

const RETIRED_WORKING_SURFACE_TOOLS = [
  "create_working_surface",
  "update_working_surface",
] as const;

test("the planner registry exposes only the canonical artboard contract", () => {
  for (const tool of RETIRED_WORKING_SURFACE_TOOLS) {
    assert.equal(CANVAS_ACTION_TOOL_NAMES.includes(tool as never), false);
    assert.equal(NORTHSTAR_AGENT_TOOL_NAMES.includes(tool as never), false);
    assert.equal(Object.prototype.hasOwnProperty.call(NORTHSTAR_TOOL_REGISTRY, tool), false);
  }
});

test("planner prompt guidance cannot advertise a parallel working surface", () => {
  const prompt = getToolRegistryPromptSummary();
  for (const tool of RETIRED_WORKING_SURFACE_TOOLS) {
    assert.equal(prompt.includes(tool), false);
  }
  assert.equal(prompt.includes("placed in a reserved non-overlapping canvas region"), false);
  assert.equal(prompt.includes("distinct from the final presentation"), false);
});
