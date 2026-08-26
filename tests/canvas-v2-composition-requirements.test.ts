import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasV2NonTitleDesignText,
  validateCanvasV2RequestedCompositionCoverage,
} from "../lib/canvas-v2/composition-requirements";
import type { CanvasV2ArtifactDocument } from "../lib/canvas-v2/types";

function documentWith(analysis: string, title = "A decision map promising NEXT, LATER, NOT YET and convergence."): CanvasV2ArtifactDocument {
  return {
    html: [
      '<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true"></template>',
      `<section data-canvas-v2-node-id="title" data-canvas-v2-design-region="true" data-canvas-v2-story-role="title"><h1>${title}</h1></section>`,
      `<section data-canvas-v2-node-id="analysis" data-canvas-v2-design-region="true" data-canvas-v2-story-role="analysis">${analysis}</section>`,
    ].join(""),
    css: "",
  };
}

const decisionInstruction = "Separate observed signals from assumptions, show where the entry wedge converges, and make the NEXT, LATER, and NOT-YET decisions easy to inspect.";

test("title promises cannot satisfy explicit analytical coverage", () => {
  const document = documentWith("<p>Observed signals</p><p>Assumptions</p>");
  const failures = validateCanvasV2RequestedCompositionCoverage(document, decisionInstruction);
  assert.equal(failures.length, 2);
  assert.match(failures.join(" "), /NEXT, LATER, and NOT YET/);
  assert.match(failures.join(" "), /convergence/);
});

test("explicit requested categories and horizons pass only when analytical islands materialize them", () => {
  const document = documentWith(`
    <div><h2>Observed signals</h2><p>No external evidence supplied.</p></div>
    <div><h2>Assumptions</h2><p>The wedge remains provisional.</p></div>
    <div><h2>Where the wedge converges</h2><p>One repeatable workflow.</p></div>
    <div><h3>Next</h3><p>Test the narrow workflow.</p></div>
    <div><h3>Later</h3><p>Broaden after repeatable pull.</p></div>
    <div><h3>Not yet</h3><p>Do not scale while signals are empty.</p></div>
  `);
  assert.deepEqual(validateCanvasV2RequestedCompositionCoverage(document, decisionInstruction), []);
});

test("coverage extraction excludes title text and inert workspace metadata", () => {
  const document = documentWith("<h2>Observed signals</h2><p>Assumptions remain explicit.</p>");
  const text = canvasV2NonTitleDesignText(document);
  assert.equal(text.includes("promising next"), false);
  assert.equal(text.includes("canvas root"), false);
  assert.equal(text, "observed signals assumptions remain explicit");
});

test("paired categories are guarded without prescribing an aesthetic or layout", () => {
  const document = documentWith("<p>Risks are visible.</p>", "Market entry");
  const failures = validateCanvasV2RequestedCompositionCoverage(document, "Map risks and opportunities for this decision.");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /risks and opportunities/);
  assert.deepEqual(validateCanvasV2RequestedCompositionCoverage(document, "Create a restrained market-entry landscape."), []);
});

test("explicit campaign deliverables cannot disappear behind a completed narrative sequence", () => {
  const instruction = "Create a campaign concept with an opening hook, three creative moments, channel adaptations, and a final call to action.";
  const partial = documentWith(`
    <p>Opening hook</p>
    <h2>Moment 01</h2><h2>Moment 02</h2><h2>Moment 03</h2>
  `, "A softer forecast");
  assert.match(validateCanvasV2RequestedCompositionCoverage(partial, instruction).join(" "), /channel adaptations/);

  const complete = documentWith(`
    <p>Opening hook</p>
    <h2>Moment 01</h2><h2>Moment 02</h2><h2>Moment 03</h2>
    <h2>Channel adaptations</h2><p>Email · Social · In product</p>
    <h2>Call to action</h2><p>Meet your steadier month.</p>
  `, "A softer forecast");
  assert.deepEqual(validateCanvasV2RequestedCompositionCoverage(complete, instruction), []);

  const authoredWithoutDiagnosticLabels = documentWith(`
    <h2>The campaign in three moments</h2>
    <div><span>01</span><h3>The quiet week</h3></div>
    <div><span>02</span><h3>Make room</h3></div>
    <div><span>03</span><h3>Find your footing</h3></div>
    <p>Social · A pause can be progress.</p>
    <p>Email · Make room for the shape of your month.</p>
    <p>Landing · See what your month can hold.</p>
    <h2>The next step</h2><p>Start understanding your month.</p>
  `, "Make room for the in-between.");
  assert.deepEqual(validateCanvasV2RequestedCompositionCoverage(authoredWithoutDiagnosticLabels, instruction), []);
});

test("8E.3 named deliverables are checked semantically without prescribing geometry", () => {
  assert.equal(validateCanvasV2RequestedCompositionCoverage(
    documentWith("<p>Diverge</p><p>Challenge</p><p>Commit</p>", "Founder workshop"),
    "Design a founder workshop that supports divergence, challenge, commitment, and a written decision.",
  ).length, 1);
  assert.equal(validateCanvasV2RequestedCompositionCoverage(
    documentWith("<p>Diverge</p><p>Challenge</p><p>Commit</p><p>Written decision</p>", "Founder workshop"),
    "Design a founder workshop that supports divergence, challenge, commitment, and a written decision.",
  ).length, 1, "an agenda naming the phases is not yet a usable workshop");
  assert.deepEqual(validateCanvasV2RequestedCompositionCoverage(
    documentWith(`
      <div data-canvas-v2-node-id="candidate-writing-field"><h2>Divergence</h2></div>
      <div data-canvas-v2-visual-role="counterargument-margin"><h2>Challenge</h2></div>
      <div data-canvas-v2-node-id="vote-and-prioritization"><h2>Commitment</h2></div>
      <div data-canvas-v2-visual-role="decision-record"><h2>Written decision</h2><p>Chosen segment</p><p>Rationale</p><p>Owner</p><p>Next experiment</p><p>Review date</p></div>
    `, "Founder workshop"),
    "Design a founder workshop that supports divergence, challenge, commitment, and a written decision.",
  ), []);
  assert.deepEqual(validateCanvasV2RequestedCompositionCoverage(
    documentWith(`
      <div data-canvas-v2-node-id="stage-explore"><h2>Explore</h2></div>
      <div data-canvas-v2-node-id="stage-test"><h2>Test</h2></div>
      <div data-canvas-v2-node-id="stage-converge"><h2>Converge</h2></div>
      <div data-canvas-v2-node-id="stage-commit"><h2>Commit</h2></div>
      <div data-canvas-v2-node-id="decision-record"><h2>Decision record</h2><p>Chosen segment</p><p>Rationale</p><p>Owner</p><p>Next experiment</p><p>Review date</p></div>
    `, "Founder workshop"),
    "Design a founder workshop that supports divergence, challenge, commitment, and a written decision.",
  ), [], "model-chosen live facilitation synonyms count when backed by real semantic surfaces");
  assert.deepEqual(validateCanvasV2RequestedCompositionCoverage(
    documentWith(`
      <section data-canvas-v2-node-id="divergence-field" data-canvas-v2-visual-role="divergence-field"><h2>Diverge</h2></section>
      <section data-canvas-v2-node-id="challenge-pressure-test" data-canvas-v2-visual-role="assumption-pressure-test"><h2>Challenge</h2></section>
      <section data-canvas-v2-node-id="commitment-fork" data-canvas-v2-visual-role="commitment-fork"><h2>Commit</h2></section>
      <section data-canvas-v2-node-id="decision-record" data-canvas-v2-visual-role="decision-record"><h2>Record</h2><p>Chosen segment</p><p>Rationale</p><p>Owner</p><p>Review date</p></section>
    `, "Founder workshop"),
    "Design a founder workshop that supports divergence, challenge, commitment, and a written decision.",
  ), [], "native divergence-field semantics satisfy the workshop arc without relying on agenda copy");

  assert.equal(validateCanvasV2RequestedCompositionCoverage(
    documentWith("<p>Customer emotion</p><p>Visible product moment</p><p>Operational handoff</p>", "Recovery"),
    "Create a service-recovery blueprint with emotional state, visible product moments, behind-the-scenes actions, and handoffs.",
  ).length, 1);
});
