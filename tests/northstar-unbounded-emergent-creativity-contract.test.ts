import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const authorship = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-creative-authorship.ts"), "utf8");
const intelligence = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-design-intelligence.ts"), "utf8");
const review = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-independent-creative-review.ts"), "utf8");
const convergence = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-lifecycle-authority.ts"), "utf8");
const artifact = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-code-artifact.ts"), "utf8");

test("design intelligence is formed from the first model-authored source act rather than a runtime visual menu", () => {
  const author = route.indexOf("creativeModel.authorCreativeAct");
  const formInline = route.indexOf("creative.design_intelligence.formed_inline", author);
  assert.ok(author >= 0);
  assert.ok(formInline > author);
  assert.match(route, /formDesignIntelligenceInline/);
  assert.match(route, /emergentDesignIntelligence = act\.designIntelligence/);
  assert.match(route, /premiumPlan\.noveltySignature/);
});

test("the inherited evidence board is source material rather than the final composition", () => {
  assert.match(artifact, /data-ns-node-id="presentation"/);
  assert.match(artifact, /data-ns-node-id="evidence-reservoir"/);
  assert.match(authorship, /inherited layout is disposable presentation scaffolding/i);
  assert.match(authorship, /set-html on presentation/i);
  assert.match(authorship, /evidence reservoir is source material/i);
});

test("the model owns whether and how its governing idea is recomposed", () => {
  assert.doesNotMatch(route, /validateNorthstarFirstCreativeActAmbition/);
  assert.doesNotMatch(route, /creative\.act\.ambition_rejected/);
  assert.match(route, /creativeSourceAuthority: true/);
  assert.match(route, /No visual primitive, placement grammar, ambition score, or layout recipe was applied/);
  assert.match(intelligence, /must materially recompose the presentation/i);
  assert.match(intelligence, /must visibly transform the choreography of real grounded evidence/i);
});

test("all thinking levels share one creative publication bar", () => {
  assert.match(review, /same publication-quality floor applies to Low, Medium, and High/i);
  assert.match(review, /publicationReady/);
  assert.match(review, /structuralBlockers/);
  assert.match(convergence, /CREATIVE_CLOSURE_ADJUDICATION_REQUIRED/);
  assert.match(convergence, /CREATIVE_CLOSURE_SETTLE_WITH_NOTES/);
  assert.doesNotMatch(convergence, /AUTHOR_CONVERGED_LOW_DEPTH/);
});

test("the active emergent path contains no application-authored visual menu", () => {
  assert.match(intelligence, /No application-authored list of media, metaphors, structures, or styles exists/i);
  assert.doesNotMatch(intelligence, /editorial spread, cinematic storyboard/i);
  assert.doesNotMatch(intelligence, /selectedConceptId/);
  assert.doesNotMatch(intelligence, /visualFamily/);
});

test("publication collapses the source reservoir without deleting grounded evidence", () => {
  const theatre = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-living-thought-theatre.ts"), "utf8");
  assert.match(theatre, /targetId: "evidence-reservoir"/);
  assert.match(theatre, /open: null/);
  assert.doesNotMatch(theatre, /remove", targetId: "evidence-reservoir"/);
});
