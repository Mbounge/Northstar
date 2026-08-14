import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the model owns an evolving creative direction rather than a runtime aesthetic score", () => {
  const types = readFileSync("lib/canvas-v2/types.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const loop = readFileSync("lib/canvas-v2/design-loop.ts", "utf8");

  assert.match(types, /interface CanvasV2CreativeDirection/);
  assert.match(types, /interface CanvasV2RenderedReflection/);
  assert.match(types, /unresolvedOpportunities: string\[\]/);
  for (const read of ["conceptRead", "hierarchyRead", "evidenceRead", "relationshipRead", "legibilityRead", "distinctivenessRead"]) {
    assert.match(types, new RegExp(`${read}: string`));
  }
  assert.match(route, /evolving visual point of view/);
  assert.match(route, /preserve it, sharpen it, or deliberately change it/);
  assert.match(loop, /creativeDirection: input\.creativeDirection/);
  assert.doesNotMatch(`${types}\n${loop}`, /aestheticScore|visualScore|scoreThreshold/);
});

test("creative moves are purposeful and remain open to divergent visual forms", () => {
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const grammar = readFileSync("lib/canvas-v2/northstar-artboard-grammar.ts", "utf8");

  for (const move of ["framing", "composition", "relationship", "analysis", "refinement"]) {
    assert.match(route, new RegExp(`\\"${move}\\"`));
  }
  assert.match(route, /original hybrid/);
  assert.match(route, /never prescribed templates/);
  assert.match(grammar, /editorial intelligence/);
  assert.match(grammar, /artifact-scoped CSS with custom properties/);
  assert.match(grammar, /Avoid returning the same header-plus-cards composition/);
  assert.match(grammar, /complete-artboard overview as a first-class reading distance/);
  assert.match(route, /Four edits are not inherently enough; twelve are not inherently required/);
  assert.match(route, /North Star visual-language references/);
  assert.match(route, /strategic-storyline-atlas\.png/);
  assert.match(route, /evidence-constellation\.png/);
  assert.match(route, /quick-visible-foundation/);
  assert.match(route, /progressive-visible-development/);
  assert.match(route, /creative-checkpoint/);
  assert.match(route, /use its exact icon as an analysis copy at least once/);
  assert.match(route, /required: \["op", "targetNodeId"\]/);
  assert.match(route, /firstRailDetailPerLane/);
  assert.match(route, /FOUNDATION_MODEL/);
  assert.match(route, /observedDesignTurns % 2 === 0/);
  assert.match(route, /creativeDirectionTurn \? 7_000 : firstSynthesisTurn \? 4_200 : 5_500/);
  assert.match(route, /CREATIVE_DIRECTOR_SYSTEM/);
  assert.match(route, /creativeCheckpointBrief/);
  assert.match(route, /maxOutputTokens: 1_800/);
  assert.match(route, /models: \[CREATIVE_MODEL, CREATIVE_TERTIARY_MODEL, FOUNDATION_MODEL\]/);
  assert.match(route, /\? \[FOUNDATION_MODEL, FALLBACK_MODEL, TERTIARY_MODEL\]/);
  assert.match(route, /synthesisTurn && creativeDirectionTurn/);
  assert.match(route, /completionQualityReview/);
  assert.match(route, /creativeRequiresContinuation/);
  assert.match(route, /evidenceSelections/);
  assert.match(route, /authoredVisualRoles/);
  assert.doesNotMatch(route, /evidenceId: evidenceId\.slice/);
  assert.match(route, /data-canvas-v2-visual-role/);
  assert.match(route, /data-canvas-v2-copy-evidence-handle/);
  assert.match(route, /data-canvas-v2-evidence-treatment/);
  assert.match(route, /data-canvas-v2-annotation-for/);
  assert.match(route, /data-canvas-v2-relationship-source/);
  assert.match(route, /validateCanvasV2RenderedAnalysisEvidenceScale/);
  assert.match(route, /validateCanvasV2RenderedComparisonCommunication/);
  assert.match(route, /validateCanvasV2RenderedRelationshipGeometry/);
  assert.match(grammar, /Inline SVG is available for model-authored relationship geometry/);
  assert.match(grammar, /Never let two unannotated phone screens swallow the synthesis/);
  assert.match(grammar, /Side-by-side prose with decorative thumbnails is scaffolding/);
  assert.match(route, /Relationship geometry is integration work, not an early scaffold/);
  assert.match(route, /Do not introduce SVG relationship geometry while the composition is still a scaffold/);
  assert.match(route, /rebuild the affected geometry in the same patch/);
  assert.match(grammar, /SVG is not mandatory/);
  assert.match(grammar, /rebuild every affected path in that same edit/);
  assert.match(route, /validateCanvasV2CreativeBriefExecution/);
  assert.match(route, /validateCanvasV2AnalysisEvidenceContinuity/);
  assert.match(route, /focused evidence selection list of no more than four items/);
  assert.match(route, /authoredVisualRoles\.some/);
  assert.doesNotMatch(route, /slice\(0, 4\)\.flatMap/);
});

test("the visible proof develops a composition across research, framing, analysis, and refinement", () => {
  const fixture = readFileSync("app/canvas-v2-e2e/design/route.ts", "utf8");
  assert.match(fixture, /moveKind: "research"/);
  assert.match(fixture, /moveKind: "framing"/);
  assert.match(fixture, /moveKind: "composition"/);
  assert.match(fixture, /moveKind: "analysis"/);
  assert.match(fixture, /moveKind: "refinement"/);
  assert.match(fixture, /Executive implication/);
  assert.doesNotMatch(fixture, /class="[^"]*card/);
});
