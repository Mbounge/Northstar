import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileCanvasV2AuthoredStageEvidence,
  reconcileCanvasV2WitnessOwnership,
  validateCanvasV2AuthoredStageEvidenceContract,
  validateCanvasV2WitnessOwnershipContract,
} from "@/lib/canvas-v2/stage-evidence-contract";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

function documentWithStages(stages: string): CanvasV2ArtifactDocument {
  return {
    html: `<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="comparison" data-canvas-v2-design-region data-canvas-v2-visual-role="comparison-axis">${stages}</section></main>`,
    css: "",
  };
}

function sourcedStage(index: number, withWitness = true): string {
  return `<article data-canvas-v2-node-id="stage-${index}" data-canvas-v2-stage-evidence="sourced"><h2 data-canvas-v2-node-id="stage-${index}-title">Stage ${index}</h2>${withWitness ? `<img data-canvas-v2-node-id="stage-${index}-screen" data-canvas-v2-evidence-id="screen:stage-${index}" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="canonical-${index}" src="https://evidence.test/${index}.png">` : ""}</article>`;
}

const contract = (document: CanvasV2ArtifactDocument) => validateCanvasV2AuthoredStageEvidenceContract({
  document,
  authoredVisualRoles: ["comparison-axis"],
  stagePlan: "Create a five-stage grounded screenshot comparison axis.",
  selectedScreenshotEvidenceCount: 8,
});

test("a declared five-stage comparison cannot omit evidence ownership from one hollow stage", () => {
  const failures = contract(documentWithStages(Array.from({ length: 4 }, (_, index) => sourcedStage(index + 1)).join("")));
  assert.match(failures.join(" "), /declares 5 comparison stages, but only 4 stage containers/);
  assert.match(failures.join(" "), /contains only 4 sourced stages/);
});

test("a sourced comparison stage must own its exact screenshot witness", () => {
  const stages = Array.from({ length: 5 }, (_, index) => sourcedStage(index + 1, index !== 1)).join("");
  assert.match(contract(documentWithStages(stages)).join(" "), /Observed comparison stage stage-2 has no exact screenshot witness inside its own stage container/);
});

test("every stage in a valid grounded comparison owns a visible screenshot", () => {
  const stages = Array.from({ length: 5 }, (_, index) => sourcedStage(index + 1)).join("");
  assert.deepEqual(contract(documentWithStages(stages)), []);
});

test("compiler-bound screenshots are deterministically moved into empty sourced stages", () => {
  const emptyStages = Array.from({ length: 4 }, (_, index) => sourcedStage(index + 1, false)).join("");
  const inbox = `<div data-canvas-v2-node-id="evidence-inbox">${Array.from({ length: 4 }, (_, index) => `<img data-canvas-v2-node-id="inbox-screen-${index + 1}" data-canvas-v2-evidence-id="screen:stage-${index + 1}" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="canonical-${index + 1}" src="https://evidence.test/${index + 1}.png">`).join("")}</div>`;
  const previous = documentWithStages(`${emptyStages}${inbox}`);
  const next = reconcileCanvasV2AuthoredStageEvidence({
    document: previous,
    targetIslandId: "comparison",
    authoredVisualRoles: ["comparison-axis"],
    selectedEvidenceIds: ["screen:stage-1", "screen:stage-2", "screen:stage-3", "screen:stage-4"],
  });
  assert.deepEqual(validateCanvasV2AuthoredStageEvidenceContract({
    document: next,
    authoredVisualRoles: ["comparison-axis"],
    stagePlan: "Create a four-stage grounded screenshot comparison axis.",
    selectedScreenshotEvidenceCount: 4,
  }), []);
  for (let index = 1; index <= 4; index += 1) {
    const stageStart = next.html.indexOf(`data-canvas-v2-node-id="stage-${index}"`);
    const nextStageStart = next.html.indexOf(`data-canvas-v2-node-id="stage-${index + 1}"`);
    const stageSource = next.html.slice(stageStart, nextStageStart > stageStart ? nextStageStart : undefined);
    assert.match(stageSource, new RegExp(`data-canvas-v2-evidence-id="screen:stage-${index}"`));
  }
  assert.equal((next.html.match(/data-canvas-v2-evidence-role="analysis-copy"/g) ?? []).length, 4);
});

test("the stage contract does not force comparison machinery onto simpler visual work", () => {
  assert.deepEqual(validateCanvasV2AuthoredStageEvidenceContract({
    document: documentWithStages("<p data-canvas-v2-node-id=\"copy\">A direct answer.</p>"),
    authoredVisualRoles: ["thesis-anchor"],
    stagePlan: "Create one clear answer.",
    selectedScreenshotEvidenceCount: 0,
  }), []);
});

test("selected witnesses are moved from the compiler inbox into their exact semantic owners", () => {
  const previous: CanvasV2ArtifactDocument = {
    html: `<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="comparison" data-canvas-v2-design-region><article data-canvas-v2-node-id="entry-claim" data-canvas-v2-evidence-group="entry"><h2 data-canvas-v2-node-id="entry-title">Entry</h2></article><article data-canvas-v2-node-id="assessment-claim" data-canvas-v2-evidence-group="qualified-assessment"><h2 data-canvas-v2-node-id="assessment-title">Qualified assessment</h2></article><div data-canvas-v2-node-id="comparison-evidence-inbox" class="canvas-v2-evidence-inbox"><img data-canvas-v2-node-id="entry-screen" data-canvas-v2-evidence-id="screen:entry" data-canvas-v2-evidence-role="analysis-copy" src="https://evidence.test/entry.png"><img data-canvas-v2-node-id="assessment-screen" data-canvas-v2-evidence-id="screen:assessment" data-canvas-v2-evidence-role="analysis-copy" src="https://evidence.test/assessment.png"></div></section></main>`,
    css: "",
  };
  const evidenceAssignments = [
    { evidenceId: "screen:entry", witnessGroup: "entry" },
    { evidenceId: "screen:assessment", witnessGroup: "qualified-assessment" },
  ];
  assert.match(validateCanvasV2WitnessOwnershipContract({ document: previous, targetIslandId: "comparison", evidenceAssignments }).join(" "), /detached from witness group entry/);
  const next = reconcileCanvasV2WitnessOwnership({ document: previous, targetIslandId: "comparison", evidenceAssignments });
  assert.deepEqual(validateCanvasV2WitnessOwnershipContract({ document: next, targetIslandId: "comparison", evidenceAssignments }), []);
  assert.match(next.html, /data-canvas-v2-evidence-id="screen:entry"[^>]*data-canvas-v2-witness-group="entry"/);
  assert.match(next.html, /data-canvas-v2-evidence-id="screen:assessment"[^>]*data-canvas-v2-witness-group="qualified-assessment"/);
  const entryStart = next.html.indexOf('data-canvas-v2-node-id="entry-claim"');
  const assessmentStart = next.html.indexOf('data-canvas-v2-node-id="assessment-claim"');
  assert.ok(next.html.indexOf('data-canvas-v2-evidence-id="screen:entry"') > entryStart);
  assert.ok(next.html.indexOf('data-canvas-v2-evidence-id="screen:entry"') < assessmentStart);
  assert.ok(next.html.indexOf('data-canvas-v2-evidence-id="screen:assessment"') > assessmentStart);
});

test("witness ownership has no fixed sixteen-screenshot composition ceiling", () => {
  const count = 24;
  const groups = Array.from({ length: count }, (_, index) => `<article data-canvas-v2-node-id="claim-${index}" data-canvas-v2-evidence-group="claim-${index}"><img data-canvas-v2-node-id="screen-${index}" data-canvas-v2-evidence-id="screen:${index}" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-witness-group="claim-${index}" src="https://evidence.test/${index}.png"></article>`).join("");
  const document: CanvasV2ArtifactDocument = {
    html: `<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="comparison" data-canvas-v2-design-region>${groups}</section></main>`,
    css: "",
  };
  const evidenceAssignments = Array.from({ length: count }, (_, index) => ({ evidenceId: `screen:${index}`, witnessGroup: `claim-${index}` }));
  assert.deepEqual(validateCanvasV2WitnessOwnershipContract({ document, targetIslandId: "comparison", evidenceAssignments }), []);
});
