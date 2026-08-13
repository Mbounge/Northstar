import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { validateCanvasV2EvidenceContinuity } from "../lib/canvas-v2/artifact-safety";
import {
  buildCanvasV2ResearchCatalogIndex,
  canvasV2MissingRequiredApps,
  canvasV2ResearchDecisionPolicy,
  canvasV2ResearchStatusForDecision,
  canvasV2UnacknowledgedUnavailableApps,
  canvasV2UnavailableRequiredApps,
  resolveCanvasV2ResearchCompletion,
  resolveCanvasV2ResearchDecision,
  settleCanvasV2ResearchRequirement,
} from "../lib/canvas-v2/research-director";
import { parseCanvasV2DesignDecision } from "../lib/canvas-v2/model-response";
import { createCanvasV2CommittedRevision } from "../lib/canvas-v2/revisions";
import type { AppDataCatalog } from "../lib/app-data/canvas-v2-catalog";

const creativeDirection = {
  designIntent: "Ground the comparison.",
  visualThesis: "Complete evidence before synthesis.",
  compositionStrategy: "Use visible flow lanes.",
  visualLanguage: "Quiet editorial surface.",
  evidenceStrategy: "Preserve every screen in order.",
  currentFocus: "Retrieve one complete flow.",
  nextMoves: ["Retrieve the contrasting flow"],
};
const reflection = {
  observedResult: "The flow is not yet visible.",
  remainingOpportunity: "Ground the requested product.",
  nextMoveReason: "The comparison requires visible evidence.",
};
const spatialStrategy = {
  growthDirection: "horizontal" as const,
  layoutSystem: "Identity rail followed by a complete evidence sequence.",
  primaryAnchor: "The app identity anchors the left edge.",
  hierarchyAndScale: "Peer screenshots share one height.",
  spacingRhythm: "Use a consistent gap between screens.",
  relationshipLogic: "Sequence order communicates progression.",
  currentAdjustment: "Extend the evidence lane.",
  intentionalOverlaps: [],
};

const catalog: AppDataCatalog = { tenantId: "tenant", apps: ["Awin", "Whop"].map((name) => ({
  id: `app:${name.toLowerCase()}`,
  name,
  totalScreens: 2,
  flows: [{ id: `flow:${name.toLowerCase()}:onboarding`, name: "Mobile onboarding", appName: name, platform: "mobile", sessionType: "onboarding", screens: [0, 1].map((index) => ({ id: `${name}-${index}`, name: `Screen ${index + 1}`, imageUrl: `https://evidence.test/${name}/${index}.png`, appName: name, flowName: "Mobile onboarding", index })) }],
})) };

function revision(html = '<main data-canvas-v2-node-id="artboard"></main>', evidence: Array<{ id: string; url: string; label: string; app?: string }> = []) {
  return createCanvasV2CommittedRevision({ id: "revision", document: { html, css: "" }, evidence, createdAt: "2026-08-12T12:00:00.000Z" });
}

test("the model sees both explicitly named apps and chooses exact complete flows", () => {
  const index = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin and Whop onboarding", revision());
  assert.deepEqual(index.explicitlyNamedAppIds, ["app:awin", "app:whop"]);
  assert.deepEqual(index.apps.map((app) => [app.name, app.flows[0]?.screenCount]), [["Awin", 2], ["Whop", 2]]);
  const decision = parseCanvasV2DesignDecision({ decision: "research", moveKind: "research", creativeDirection, spatialStrategy, reflection, appId: "app:awin", flowId: "flow:awin:onboarding", summary: "Ground Awin.", expectedVisualResult: "The complete Awin lane is visible." });
  assert.equal(decision.decision, "research");
  if (decision.decision !== "research") return;
  const result = resolveCanvasV2ResearchDecision(catalog, decision, []);
  assert.equal(result.screens.length, 2);
  assert.deepEqual(result.evidence.filter((asset) => asset.screen).map((asset) => asset.app), ["Awin", "Awin"]);
});

test("production research is evidence-first and synthesis cannot complete on the final retrieval turn", () => {
  const unresolved = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin and Whop onboarding", revision(), ["Awin", "Whop"]);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(unresolved, "synthesis", []).permittedDecisions, ["research"]);

  const bothVisible = revision('<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-canonical-flow="flow:awin:onboarding"></article><article data-canvas-v2-canonical-flow="flow:whop:onboarding"></article></main>');
  const grounded = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin and Whop onboarding", bothVisible, ["Awin", "Whop"]);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(grounded, "synthesis", [{ kind: "research" }, { kind: "research" }]).permittedDecisions, ["edit"]);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(grounded, "synthesis", [{ kind: "research" }, { kind: "design" }]).permittedDecisions, ["research", "edit", "complete"]);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(grounded, "evidence", [{ kind: "research" }]).permittedDecisions, ["research", "edit", "complete"]);
});

test("the production catalog is target-scoped, relevance-ranked, and bounded without truncating a selected flow", () => {
  const flow = (index: number, screens: number, name = `Onboarding path ${index}`, scope: "journey" | "flow" | "session" = "flow") => ({
    id: `flow:awin:${index}`,
    name,
    appName: "Awin",
    platform: "mobile",
    sessionType: "onboarding",
    scope,
    taxonomyPath: [name],
    descendantFlowCount: scope === "journey" ? 4 : 1,
    screens: Array.from({ length: screens }, (_, screenIndex) => ({ id: `awin-${index}-${screenIndex}`, name: `Step ${screenIndex + 1}`, imageUrl: `https://evidence.test/awin/${index}/${screenIndex}.png`, appName: "Awin", flowName: name, index: screenIndex })),
  });
  const largeCatalog: AppDataCatalog = {
    tenantId: "tenant",
    apps: [
      { id: "app:awin", name: "Awin", totalScreens: 0, flows: [flow(0, 70, "Mobile onboarding complete capture", "session"), flow(1, 12, "Partner onboarding", "journey"), ...Array.from({ length: 25 }, (_, index) => flow(index + 2, 8))] },
      ...Array.from({ length: 30 }, (_, index) => ({ id: `app:other:${index}`, name: `Other ${index}`, totalScreens: 1, flows: [{ id: `flow:other:${index}`, name: "Onboarding", appName: `Other ${index}`, screens: [{ id: `other-${index}`, name: "Welcome", imageUrl: `https://evidence.test/other/${index}.png`, appName: `Other ${index}`, flowName: "Onboarding", index: 0 }] }] })),
    ],
  };
  const index = buildCanvasV2ResearchCatalogIndex(largeCatalog, "Build a simple representative executive view of Awin onboarding", revision(), ["Awin"]);
  assert.equal(index.apps.length, 1);
  assert.equal(index.apps[0]?.name, "Awin");
  assert.equal(index.apps[0]?.flows.length, 18);
  assert.equal(index.apps[0]?.flows[0]?.name, "Partner onboarding");
  assert.equal(index.apps[0]?.flows[0]?.screenCount, 12);
  assert.equal(index.apps[0]?.flows[0]?.screenNames.length, 12);
  assert.equal(index.apps[0]?.flows[0]?.scope, "journey");
  assert.equal(index.apps[0]?.flows[0]?.selection, "preferred");
  assert.equal(index.apps[0]?.flows.find((candidate) => candidate.scope === "session")?.selection, "supporting");
  assert.equal(index.apps[0]?.omittedUsableFlowCount, 9);
  assert.ok(JSON.stringify(index).length < 50_000);
});

test("a shallow visible leaf cannot satisfy a broad journey request when coherent coverage exists", () => {
  const makeScreens = (flowName: string, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${flowName}-${index}`,
    name: `Step ${index + 1}`,
    imageUrl: `https://evidence.test/awin/${flowName}/${index}.png`,
    appName: "Awin",
    flowName,
    platform: "mobile",
    sessionType: "onboarding",
    index,
  }));
  const coverageCatalog: AppDataCatalog = { tenantId: "tenant", apps: [{
    id: "app:awin",
    name: "Awin",
    totalScreens: 14,
    flows: [
      { id: "flow:awin:journey", name: "Partner onboarding", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "journey", taxonomyPath: ["Partner onboarding"], descendantFlowCount: 4, screens: makeScreens("journey", 11) },
      { id: "flow:awin:leaf", name: "Landing and persona selection", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "flow", taxonomyPath: ["Partner onboarding", "Landing and persona selection"], descendantFlowCount: 1, screens: makeScreens("leaf", 3) },
    ],
  }] };
  const shallowVisible = revision('<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-canonical-flow="flow:awin:leaf"></article></main>');
  const index = buildCanvasV2ResearchCatalogIndex(coverageCatalog, "Build a representative executive comparison of Awin onboarding", shallowVisible, ["Awin"]);
  assert.equal(index.requirements[0]?.state, "unresolved");
  assert.deepEqual(index.requirements[0]?.adequateFlowIds, ["flow:awin:journey"]);
  assert.deepEqual(index.requirements[0]?.visibleFlowIds, ["flow:awin:leaf"]);
  assert.deepEqual(index.requirements[0]?.visibleAdequateFlowIds, []);
  assert.match(index.requirements[0]?.reason ?? "", /does not adequately cover/);
  assert.throws(() => resolveCanvasV2ResearchDecision(coverageCatalog, {
    schema: "canvas-v2.decision.v1",
    decision: "research",
    moveKind: "research",
    creativeDirection,
    spatialStrategy,
    reflection,
    appId: "app:awin",
    flowId: "flow:awin:leaf",
    summary: "Use the leaf.",
    expectedVisualResult: "The leaf is visible.",
  }, [], index), /does not adequately cover/);
  const result = resolveCanvasV2ResearchDecision(coverageCatalog, {
    schema: "canvas-v2.decision.v1",
    decision: "research",
    moveKind: "research",
    creativeDirection,
    spatialStrategy,
    reflection,
    appId: "app:awin",
    flowId: "flow:awin:journey",
    summary: "Use the journey.",
    expectedVisualResult: "The complete journey is visible.",
  }, [], index);
  assert.equal(result.screens.length, 11);

  const focused = buildCanvasV2ResearchCatalogIndex(
    coverageCatalog,
    "Inspect Awin landing and persona selection onboarding",
    revision(),
    ["Awin"],
  );
  assert.equal(focused.apps[0]?.flows[0]?.id, "flow:awin:leaf");
  assert.equal(focused.apps[0]?.flows[0]?.selection, "preferred");
  assert.deepEqual(focused.requirements[0]?.adequateFlowIds, ["flow:awin:leaf"]);
});

test("required named apps remain unresolved until their evidence is visibly committed", () => {
  const awinVisible = revision('<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-canonical-flow="flow:awin:onboarding"><img data-canvas-v2-evidence-id="screen:Awin-0" src="https://evidence.test/Awin/0.png"></article></main>', [{ id: "screen:Awin-0", url: "https://evidence.test/Awin/0.png", label: "Awin", app: "Awin" }]);
  const index = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin and Whop onboarding", awinVisible);
  assert.deepEqual(canvasV2MissingRequiredApps(index), ["Whop"]);
  assert.throws(() => resolveCanvasV2ResearchDecision(catalog, { schema: "canvas-v2.decision.v1", decision: "research", moveKind: "research", creativeDirection, spatialStrategy, reflection, appId: "app:awin", flowId: "flow:awin:onboarding", summary: "Again", expectedVisualResult: "Again" }, index.visibleFlowIds), /already visible/);
});

test("every router target resolves to visible, unavailable, or unresolved research truth", () => {
  const catalogWithEmpty: AppDataCatalog = {
    ...catalog,
    apps: [
      ...catalog.apps,
      { id: "app:empty", name: "Empty", totalScreens: 0, flows: [] },
      {
        id: "app:partial",
        name: "Partial",
        totalScreens: 2,
        flows: [{
          id: "flow:partial",
          name: "Incomplete capture",
          appName: "Partial",
          screens: [0, 1].map((index) => ({
            id: `Partial-${index}`,
            name: `Screen ${index + 1}`,
            imageUrl: index === 0 ? `https://evidence.test/Partial/${index}.png` : undefined,
            appName: "Partial",
            flowName: "Incomplete capture",
            index,
          })),
        }],
      },
    ],
  };
  const index = buildCanvasV2ResearchCatalogIndex(catalogWithEmpty, "Build the comparison", revision(), ["Awin", "Ghost", "Empty", "Partial", "awin"]);
  assert.deepEqual(index.requirements.map((requirement) => [requirement.requestedName, requirement.state]), [
    ["Awin", "unresolved"],
    ["Ghost", "unavailable"],
    ["Empty", "unavailable"],
    ["Partial", "unavailable"],
  ]);
  assert.match(index.requirements[1]?.reason ?? "", /No connected app named Ghost/);
  assert.match(index.requirements[2]?.reason ?? "", /no complete captured flow/);
  assert.match(index.requirements[3]?.reason ?? "", /no complete captured flow/);
  assert.deepEqual(canvasV2MissingRequiredApps(index), ["Awin"]);
  assert.deepEqual(canvasV2UnavailableRequiredApps(index).map((requirement) => requirement.requestedName), ["Ghost", "Empty", "Partial"]);
  const blocked = resolveCanvasV2ResearchCompletion(index, "The comparison is complete.", "<main></main>");
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.unresolved, ["Awin"]);
  assert.deepEqual(blocked.unacknowledgedUnavailable, ["Ghost", "Empty", "Partial"]);

  const terminalIndex = { ...index, requirements: index.requirements.map((requirement) => requirement.requestedName === "Awin" ? { ...requirement, state: "visible" as const } : requirement) };
  assert.deepEqual(canvasV2UnacknowledgedUnavailableApps(terminalIndex, '<p data-canvas-v2-research-unavailable="Ghost"></p>').map((requirement) => requirement.requestedName), ["Empty", "Partial"]);
  const terminal = resolveCanvasV2ResearchCompletion(terminalIndex, "The available comparison is complete.", '<p data-canvas-v2-research-unavailable="Ghost"></p><p data-canvas-v2-research-unavailable="Empty"></p><p data-canvas-v2-research-unavailable="Partial"></p>');
  assert.equal(terminal.ready, true);
  assert.match(terminal.summary, /Evidence unavailable in this account: Ghost, Empty, Partial/);
});

test("research moves from unresolved through pending to canonical visibility", () => {
  const index = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin", revision(), ["Awin"]);
  const pending = canvasV2ResearchStatusForDecision(index, { appId: "app:awin", flowId: "flow:awin:onboarding" });
  assert.equal(pending[0]?.state, "pending");
  assert.equal(pending[0]?.pendingFlowId, "flow:awin:onboarding");
  const visible = settleCanvasV2ResearchRequirement(pending, "app:awin", "flow:awin:onboarding");
  assert.equal(visible?.[0]?.state, "visible");
  assert.deepEqual(visible?.[0]?.visibleFlowIds, ["flow:awin:onboarding"]);
});

test("evidence metadata alone cannot impersonate a visibly committed flow", () => {
  const index = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin", revision("<main></main>", [
    { id: "screen:Awin-0", url: "https://evidence.test/Awin/0.png", label: "Awin", app: "Awin" },
  ]), ["Awin"]);
  assert.equal(index.requirements[0]?.state, "unresolved");
  assert.deepEqual(index.visibleApps, []);
});

test("later authored revisions cannot erase visible canonical research", () => {
  const previous = { html: '<main data-canvas-v2-node-id="artboard"><article data-canvas-v2-node-id="flow-awin" data-canvas-v2-canonical-flow="flow:awin"><img data-canvas-v2-node-id="flow-awin-screen-1" data-canvas-v2-evidence-id="awin-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/awin.png"></article></main>', css: "" };
  const evidence = [{ id: "awin-1", url: "https://evidence.test/awin.png", label: "Awin screen" }];
  assert.deepEqual(validateCanvasV2EvidenceContinuity(previous, previous, evidence), []);
  const failures = validateCanvasV2EvidenceContinuity(previous, { html: "<main></main>", css: "" }, evidence).join(" ");
  assert.match(failures, /must remain visible/);
  assert.match(failures, /Canonical research flow/);
});

test("the production loop materializes research before another model turn and removes hidden screenshot injection", () => {
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const loop = readFileSync("lib/canvas-v2/design-loop.ts", "utf8");
  assert.match(route, /decision: \{ type: "string", enum: \["research", "edit", "complete"\] \}/);
  assert.match(route, /resolveCanvasV2ResearchDecision/);
  assert.match(route, /resolveCanvasV2ResearchCompletion/);
  assert.match(route, /researchTargets/);
  assert.doesNotMatch(route, /loadCanvasV2EvidenceVisuals|buildCanvasV2AgentResearch/);
  assert.match(hook, /insertCanvasV2CanonicalFlow/);
  assert.match(hook, /settleCanvasV2ResearchRequirement/);
  assert.match(hook, /id\("research-revision"\)/);
  assert.match(hook, /kind: pendingActionKind/);
  assert.match(hook, /artboard is still preparing its first visual observation/);
  assert.match(workspace, /left-\[max\(50%,770px\)\]/);
  assert.match(loop, /CANVAS_V2_MAX_AUTOMATIC_EDITS = 8/);
  assert.doesNotMatch(`${route}\n${hook}`, /@\/lib\/canvas-ai\//);
});
