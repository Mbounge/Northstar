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
  nextCanvasV2RequiredResearch,
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
  unresolvedOpportunities: ["Ground the contrasting product."],
  nextMoves: ["Retrieve the contrasting flow"],
};
const reflection = {
  observedResult: "The flow is not yet visible.",
  remainingOpportunity: "Ground the requested product.",
  conceptRead: "The concept awaits grounded evidence.",
  hierarchyRead: "The evidence sequence is the current anchor.",
  evidenceRead: "One requested source remains absent.",
  relationshipRead: "Comparison is premature until both sources are present.",
  legibilityRead: "The existing rail is readable.",
  distinctivenessRead: "This is research, not the final authored form.",
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

function revision(html = '<main data-canvas-v2-node-id="canvas"></main>', evidence: Array<{ id: string; url: string; label: string; app?: string }> = []) {
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

test("a named app cannot substitute browsing evidence for an onboarding request", () => {
  const browsingOnly: AppDataCatalog = { tenantId: "tenant", apps: [{
    id: "app:awin",
    name: "Awin",
    totalScreens: 2,
    flows: [{
      id: "flow:awin:browsing",
      name: "Managing affiliate links",
      appName: "Awin",
      platform: "mobile",
      sessionType: "browsing",
      scope: "journey",
      screens: [0, 1].map((index) => ({
        id: `awin-browsing-${index}`,
        name: `Browsing ${index + 1}`,
        imageUrl: `https://evidence.test/awin/browsing/${index}.png`,
        appName: "Awin",
        flowName: "Managing affiliate links",
        platform: "mobile",
        sessionType: "browsing",
        index,
      })),
    }],
  }] };
  const index = buildCanvasV2ResearchCatalogIndex(browsingOnly, "Compare Awin onboarding", revision(), ["Awin"]);
  assert.deepEqual(index.requirements[0]?.adequateFlowIds, []);
  assert.equal(index.requirements[0]?.preferredFlow, undefined);
  assert.equal(index.apps[0]?.flows[0]?.scopeMatch, "mismatch");
  assert.equal(index.apps[0]?.flows[0]?.selection, "supporting");
  assert.equal(nextCanvasV2RequiredResearch(index), undefined);
  assert.throws(() => resolveCanvasV2ResearchDecision(browsingOnly, {
    schema: "canvas-v2.decision.v1",
    decision: "research",
    moveKind: "research",
    creativeDirection,
    spatialStrategy,
    reflection,
    appId: "app:awin",
    flowId: "flow:awin:browsing",
    summary: "Ground Awin.",
    expectedVisualResult: "Show Awin onboarding.",
  }, [], index), /supporting evidence/);
});

test("a router flow hint cannot override the user's requested journey scope", () => {
  const screens = (flowName: string, count: number, sessionType: string) => Array.from({ length: count }, (_, index) => ({
    id: `${flowName}-${index}`,
    name: `Screen ${index + 1}`,
    imageUrl: `https://evidence.test/awin/${flowName}/${index}.png`,
    appName: "Awin",
    flowName,
    platform: "mobile",
    sessionType,
    index,
  }));
  const scopedCatalog: AppDataCatalog = { tenantId: "tenant", apps: [{
    id: "app:awin",
    name: "Awin",
    totalScreens: 72,
    flows: [
      {
        id: "flow:awin:explore",
        name: "Explore · Searching and browsing · Managing affiliate links · Opening external support article",
        appName: "Awin",
        platform: "mobile",
        sessionType: "browsing",
        scope: "journey",
        completeJourney: true,
        screens: screens("Explore", 25, "browsing"),
      },
      {
        id: "flow:awin:onboarding",
        name: "Account activation and first login",
        appName: "Awin",
        platform: "mobile",
        sessionType: "onboarding",
        scope: "journey",
        completeJourney: true,
        screens: screens("Onboarding", 47, "onboarding"),
      },
    ],
  }] };
  const instruction = "Build a balanced executive comparison of Awin and Whop onboarding. Choose representative flows and screenshots, keep the main board simple, and leave your working surface visible so I can inspect how the solution came together.";
  const index = buildCanvasV2ResearchCatalogIndex(scopedCatalog, instruction, revision(), [
    "Awin — Explore · Searching and browsing · Managing affiliate links · Opening external support article",
    "Awin",
  ]);

  assert.equal(index.requirements[0]?.preferredFlow?.id, "flow:awin:onboarding");
  assert.deepEqual(index.requirements[0]?.adequateFlowIds, ["flow:awin:onboarding"]);
  assert.deepEqual(nextCanvasV2RequiredResearch(index), {
    appId: "app:awin",
    appName: "Awin",
    flowId: "flow:awin:onboarding",
    flowName: "Account activation and first login",
    screenCount: 47,
  });
});

test("production research is evidence-first and synthesis cannot complete on the final retrieval turn", () => {
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const designLoop = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  assert.match(route, /if \(groundingRequired && requiredResearch\)/);
  assert.match(route, /const discoveryDirectorRequired/);
  assert.match(route, /mergeCanvasV2EvidencePackets\(\s*body\.revision\.evidencePackets,\s*retrievedEvidenceBridge\.packets/);
  assert.match(route, /requiredVisualEvidenceForBrief\(creativeCheckpointBrief\)/);
  assert.match(route, /const synthesisTurn = decisionPolicy\.phase !== "ground-required-evidence"/);
  assert.doesNotMatch(route, /const synthesisTurn = researchMode !== "evidence"/);
  assert.match(route, /authoritativeEvidenceCopyHandles[\s\S]*flowIndex === undefined/);
  assert.match(route, /brief\.targetIsland\.action === "repair" && existingScreenSelections\.length/);
  assert.match(route, /bounded analytical copies are evidence witnesses, not a duplicate flow/);
  assert.match(route, /canvasV2EvidencePacketsNeedingMaterialization\(\s*body\.revision\.document,\s*persistedEvidencePackets/);
  assert.match(route, /snapshotEvidencePackets,\s*researchStatus:[\s\S]*northstar-account-evidence-materializer/);
  assert.match(designLoop, /if \(payload\.snapshotEvidencePackets\?\.length\)[\s\S]*insertCanvasV2EvidencePackets/);
  assert.ok(designLoop.indexOf("if (payload.snapshotEvidencePackets?.length)") < designLoop.indexOf("if (!payload.decision)"));
  assert.match(designLoop, /pendingEdit\.moveKind === "research" \? "research" : pendingActionKind[\s\S]*label: "Reading the grounded evidence"/);
  assert.match(designLoop, /Reuse their already-verified detail atlas/);
  assert.match(designLoop, /moreRequiredFlowsRemain \? "research-fast-revision" : "research-revision"/);
  const chatPanel = readFileSync("components/canvas-v2/canvas-v2-chat-panel.tsx", "utf8");
  assert.match(chatPanel, /committedSteps\.at\(-1\)\?\.kind === "research"[\s\S]*label: "Reading the grounded evidence"/);
  const unresolved = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin and Whop onboarding", revision(), ["Awin", "Whop"]);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(unresolved, "synthesis", []).permittedDecisions, ["research"]);
  assert.deepEqual(nextCanvasV2RequiredResearch(unresolved), {
    appId: "app:awin",
    appName: "Awin",
    flowId: "flow:awin:onboarding",
    flowName: "Mobile onboarding",
    screenCount: 2,
  });

  const awinVisible = revision('<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-canonical-flow="flow:awin:onboarding"></article></main>');
  const oneRemaining = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin and Whop onboarding", awinVisible, ["Awin", "Whop"]);
  assert.equal(nextCanvasV2RequiredResearch(oneRemaining)?.appName, "Whop");

  const bothVisible = revision('<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-canonical-flow="flow:awin:onboarding"></article><article data-canvas-v2-canonical-flow="flow:whop:onboarding"></article></main>');
  const grounded = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin and Whop onboarding", bothVisible, ["Awin", "Whop"]);
  const firstSynthesis = canvasV2ResearchDecisionPolicy(grounded, "synthesis", [{ kind: "research" }, { kind: "research" }]);
  assert.deepEqual(firstSynthesis.permittedDecisions, ["edit"]);
  assert.match(firstSynthesis.reason, /Declare only the continuation moves genuinely warranted/);
  assert.doesNotMatch(firstSynthesis.reason, /at least three/);
  const refinement = canvasV2ResearchDecisionPolicy(grounded, "synthesis", [{ kind: "research" }, { kind: "design" }], { nextMoves: ["Develop the relationship"] });
  assert.equal(refinement.phase, "resolve-grounded-synthesis");
  assert.deepEqual(refinement.permittedDecisions, ["edit"]);
  assert.match(refinement.reason, /replan the remaining queue from the new visible result/);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(grounded, "synthesis", [{ kind: "research" }, { kind: "design" }, { kind: "design" }], { nextMoves: [], unresolvedOpportunities: [] }).permittedDecisions, ["research", "edit", "complete"]);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(grounded, "synthesis", [{ kind: "research" }, { kind: "design" }, { kind: "design" }], { nextMoves: [], unresolvedOpportunities: ["Make the relationship visible"] }).permittedDecisions, ["edit"]);
  assert.deepEqual(canvasV2ResearchDecisionPolicy(grounded, "evidence", [{ kind: "research" }]).permittedDecisions, ["research", "edit", "complete"]);
});

test("snapshot-only account requests do not fabricate a product research requirement", () => {
  const index = buildCanvasV2ResearchCatalogIndex(
    catalog,
    "Show Awin marketing and business snapshots",
    revision(),
    ["Awin"],
    undefined,
    { requireProductEvidence: false },
  );
  assert.deepEqual(index.requirements, []);
  assert.deepEqual(index.explicitlyNamedAppIds, []);
  assert.equal(canvasV2ResearchDecisionPolicy(index, "synthesis", []).phase, "open-design");
});

test("the production catalog is target-scoped, relevance-ranked, and bounded without truncating a selected flow", () => {
  const flow = (index: number, screens: number, name = `Onboarding path ${index}`, scope: "journey" | "path" | "flow" | "collection" | "session" = "flow") => ({
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
  assert.equal(index.apps[0]?.flows.some((candidate) => candidate.scope === "session"), false);
  assert.equal(index.apps[0]?.omittedUsableFlowCount, 9);
  assert.ok(JSON.stringify(index).length < 50_000);
});

test("a shallow stage and aggregate collection cannot satisfy a representative branch-path request", () => {
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
    totalScreens: 58,
    flows: [
      { id: "flow:awin:journey", name: "Partner onboarding all alternatives", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "collection", taxonomyPath: ["Partner onboarding"], descendantFlowCount: 4, screens: makeScreens("journey", 44) },
      { id: "flow:awin:leaf", name: "Landing and persona selection", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "flow", taxonomyPath: ["Partner onboarding", "Landing and persona selection"], descendantFlowCount: 1, screens: makeScreens("leaf", 3) },
      { id: "flow:awin:representative", name: "Guided creator registration", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "path", taxonomyPath: ["Partner onboarding", "Guided creator registration"], descendantFlowCount: 1, screens: makeScreens("representative", 11) },
    ],
  }] };
  const shallowVisible = revision('<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-canonical-flow="flow:awin:leaf"></article></main>');
  const index = buildCanvasV2ResearchCatalogIndex(coverageCatalog, "Build a representative executive comparison of Awin onboarding", shallowVisible, ["Awin"]);
  assert.equal(index.requirements[0]?.state, "unresolved");
  assert.deepEqual(index.requirements[0]?.adequateFlowIds, ["flow:awin:representative"]);
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
    flowId: "flow:awin:representative",
    summary: "Use the complete path.",
    expectedVisualResult: "The complete valid branch path is visible.",
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

  const representative = buildCanvasV2ResearchCatalogIndex(
    coverageCatalog,
    "Build an executive comparison of Awin onboarding. Choose representative flows and screenshots.",
    revision(),
    ["Awin"],
  );
  assert.equal(representative.apps[0]?.flows[0]?.id, "flow:awin:representative");
  assert.equal(representative.apps[0]?.flows[0]?.screenCount, 11);
  assert.deepEqual(representative.requirements[0]?.adequateFlowIds, ["flow:awin:representative"]);
  assert.equal(representative.apps[0]?.flows.find((flow) => flow.scope === "collection")?.selection, "supporting");
});

test("broad onboarding prefers a complete shared-entry journey over its branch-only candidate", () => {
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
  const completeCatalog: AppDataCatalog = { tenantId: "tenant", apps: [{
    id: "app:awin", name: "Awin", totalScreens: 47, flows: [
      { id: "flow:branch", name: "Creator & Influencer Onboarding", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "journey", screens: makeScreens("branch", 44) },
      { id: "flow:complete", name: "Landing & Persona Selection → Creator & Influencer Onboarding", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "path", completeJourney: true, journeySegments: [{ id: "entry", name: "Landing", kind: "shared-entry", startIndex: 0, screenCount: 3 }, { id: "creator", name: "Creator", kind: "branch", startIndex: 3, screenCount: 44 }], screens: makeScreens("complete", 47) },
    ],
  }] };
  const broad = buildCanvasV2ResearchCatalogIndex(completeCatalog, "Build an executive comparison of Awin onboarding. Choose representative flows and screenshots.", revision(), ["Awin"]);
  assert.equal(broad.apps[0]?.flows[0]?.id, "flow:complete");
  assert.equal(nextCanvasV2RequiredResearch(broad)?.screenCount, 47);
  const exactBranch = buildCanvasV2ResearchCatalogIndex(completeCatalog, "Inspect Awin Creator & Influencer Onboarding", revision(), ["Awin"]);
  assert.equal(exactBranch.apps[0]?.flows[0]?.id, "flow:branch");
});

test("an exact router flow target resolves inside its connected app and accepts a visible composite journey", () => {
  const screens = (flowName: string, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${flowName}-${index}`,
    name: `Step ${index + 1}`,
    imageUrl: `https://evidence.test/awin/${index}.png`,
    appName: "Awin",
    flowName,
    platform: "mobile",
    sessionType: "onboarding",
    index,
  }));
  const exactFlowCatalog: AppDataCatalog = { tenantId: "tenant", apps: [{
    id: "app:awin",
    name: "Awin",
    totalScreens: 21,
    flows: [
      { id: "flow:awin:publisher", name: "Publisher & Affiliate Solutions", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "flow", screens: screens("publisher", 9) },
      { id: "flow:awin:publisher-complete", name: "Landing & Persona Selection → Publisher & Affiliate Solutions", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "path", completeJourney: true, screens: screens("publisher-complete", 12) },
    ],
  }] };
  const visible = revision('<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-canonical-flow="flow:awin:publisher-complete"></article></main>');
  const index = buildCanvasV2ResearchCatalogIndex(
    exactFlowCatalog,
    "Inspect my Awin Publisher & Affiliate Solutions onboarding evidence.",
    visible,
    ["Awin", "Publisher & Affiliate Solutions"],
  );
  assert.deepEqual(index.requirements.map((requirement) => [requirement.requestedName, requirement.appName, requirement.state]), [
    ["Awin", "Awin", "visible"],
    ["Publisher & Affiliate Solutions", "Awin", "visible"],
  ]);
  assert.deepEqual(index.requirements[1]?.adequateFlowIds, ["flow:awin:publisher", "flow:awin:publisher-complete"]);
  assert.deepEqual(index.requirements[1]?.visibleAdequateFlowIds, ["flow:awin:publisher-complete"]);
  assert.equal(nextCanvasV2RequiredResearch(index), undefined);

  const expandedRouterTarget = buildCanvasV2ResearchCatalogIndex(
    exactFlowCatalog,
    "Inspect my Awin Publisher & Affiliate Solutions mobile onboarding evidence.",
    visible,
    ["Awin", "Awin · Publisher & Affiliate Solutions mobile onboarding flow"],
  );
  assert.equal(expandedRouterTarget.requirements[1]?.state, "visible");
  assert.deepEqual(expandedRouterTarget.requirements[1]?.visibleAdequateFlowIds, ["flow:awin:publisher-complete"]);
  assert.equal(nextCanvasV2RequiredResearch(expandedRouterTarget), undefined);
});

test("required research is selected from full catalog truth even when the bounded model index omits it", () => {
  const screens = (flowName: string, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${flowName}-${index}`,
    name: `Step ${index + 1}`,
    imageUrl: `https://evidence.test/whop/${flowName}/${index}.png`,
    appName: "Whop",
    flowName,
    platform: "mobile",
    sessionType: "onboarding",
    index,
  }));
  const largeCatalog: AppDataCatalog = { tenantId: "tenant", apps: [{
    id: "app:whop",
    name: "Whop",
    totalScreens: 250,
    flows: [
      { id: "flow:whop:canonical", name: "User Onboarding", appName: "Whop", platform: "mobile", sessionType: "onboarding", scope: "journey", completeJourney: true, screens: screens("canonical", 17) },
      ...Array.from({ length: 24 }, (_, index) => ({ id: `flow:whop:supporting:${index}`, name: `Supporting capture ${index}`, appName: "Whop", platform: "mobile", sessionType: "onboarding", scope: "session" as const, screens: screens(`supporting-${index}`, 9) })),
    ],
  }] };
  const index = buildCanvasV2ResearchCatalogIndex(largeCatalog, "Compare Whop onboarding", revision(), ["Whop"]);
  index.apps[0]!.flows = index.apps[0]!.flows.filter((flow) => flow.id !== "flow:whop:canonical");
  assert.equal(index.apps[0]?.flows.some((flow) => flow.id === "flow:whop:canonical"), false);
  assert.deepEqual(nextCanvasV2RequiredResearch(index), {
    appId: "app:whop",
    appName: "Whop",
    flowId: "flow:whop:canonical",
    flowName: "User Onboarding",
    screenCount: 17,
  });
});

test("an app-prefixed flow target selects the named canonical flow over a larger semantic match", () => {
  const screens = (flowName: string, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${flowName}-${index}`,
    name: `Step ${index + 1}`,
    imageUrl: `https://evidence.test/whop/${flowName}/${index}.png`,
    appName: "Whop",
    flowName,
    platform: "mobile",
    sessionType: "onboarding",
    index,
  }));
  const targetedCatalog: AppDataCatalog = { tenantId: "tenant", apps: [{
    id: "app:whop",
    name: "Whop",
    totalScreens: 211,
    flows: [
      { id: "flow:whop:user-onboarding", name: "User Onboarding", appName: "Whop", platform: "mobile", sessionType: "onboarding", scope: "journey", completeJourney: true, screens: screens("user-onboarding", 17) },
      { id: "flow:whop:dashboard", name: "Dashboard · Returning to community home and user settings", appName: "Whop", platform: "mobile", sessionType: "onboarding", scope: "journey", completeJourney: true, screens: screens("dashboard", 194) },
    ],
  }] };
  const index = buildCanvasV2ResearchCatalogIndex(
    targetedCatalog,
    "Build a balanced executive comparison of Awin and Whop onboarding.",
    revision(),
    ["Whop — User Onboarding"],
  );
  assert.deepEqual(nextCanvasV2RequiredResearch(index), {
    appId: "app:whop",
    appName: "Whop",
    flowId: "flow:whop:user-onboarding",
    flowName: "User Onboarding",
    screenCount: 17,
  });
});

test("specific journey targets are grounded before their generic app aliases", () => {
  const screens = (appName: string, flowName: string, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${appName}-${flowName}-${index}`,
    name: `Step ${index + 1}`,
    imageUrl: `https://evidence.test/${appName}/${flowName}/${index}.png`,
    appName,
    flowName,
    platform: "mobile",
    sessionType: "onboarding",
    index,
  }));
  const targetedCatalog: AppDataCatalog = { tenantId: "tenant", apps: [
    {
      id: "app:awin",
      name: "Awin",
      totalScreens: 49,
      flows: [
        { id: "flow:awin:broad", name: "Managing Affiliate Links", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "journey", completeJourney: true, screens: screens("Awin", "broad", 5) },
        { id: "flow:awin:creator", name: "Creator & Influencer Onboarding", appName: "Awin", platform: "mobile", sessionType: "onboarding", scope: "journey", completeJourney: true, screens: screens("Awin", "creator", 44) },
      ],
    },
    {
      id: "app:whop",
      name: "Whop",
      totalScreens: 17,
      flows: [{ id: "flow:whop:user", name: "User Onboarding", appName: "Whop", platform: "mobile", sessionType: "onboarding", scope: "journey", completeJourney: true, screens: screens("Whop", "user", 17) }],
    },
  ] };
  const index = buildCanvasV2ResearchCatalogIndex(
    targetedCatalog,
    "Build a balanced executive comparison of Awin and Whop onboarding.",
    revision(),
    ["Awin", "Whop", "Awin Creator & Influencer Onboarding", "Whop User Onboarding"],
  );
  assert.deepEqual(index.requirements.map((requirement) => requirement.requestedName), [
    "Awin Creator & Influencer Onboarding",
    "Whop User Onboarding",
    "Awin",
    "Whop",
  ]);
  assert.deepEqual(nextCanvasV2RequiredResearch(index), {
    appId: "app:awin",
    appName: "Awin",
    flowId: "flow:awin:creator",
    flowName: "Creator & Influencer Onboarding",
    screenCount: 44,
  });
});

test("required named apps remain unresolved until their evidence is visibly committed", () => {
  const awinVisible = revision('<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-canonical-flow="flow:awin:onboarding"><img data-canvas-v2-evidence-id="screen:Awin-0" src="https://evidence.test/Awin/0.png"></article></main>', [{ id: "screen:Awin-0", url: "https://evidence.test/Awin/0.png", label: "Awin", app: "Awin" }]);
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

  const unavailableAwinIndex = {
    ...terminalIndex,
    requirements: terminalIndex.requirements.map((requirement) => requirement.requestedName === "Awin"
      ? { ...requirement, state: "unavailable" as const }
      : { ...requirement, state: "visible" as const }),
  };
  const visibleLimitation = resolveCanvasV2ResearchCompletion(
    unavailableAwinIndex,
    "The evidence boundary is explicit.",
    "<section><h2>Findings withheld until authorized evidence arrives</h2><p>The current evidence set contains no authorized Awin app screenshots or data packets.</p></section>",
  );
  assert.equal(visibleLimitation.ready, true, "target-specific visible limitation prose is authoritative even when the model omits compiler metadata");
  assert.deepEqual(visibleLimitation.unacknowledgedUnavailable, []);

  const islandScopedLimitation = resolveCanvasV2ResearchCompletion(
    unavailableAwinIndex,
    "The evidence boundary is explicit.",
    '<section data-canvas-v2-design-region><h1>Awin onboarding to growth</h1><p><strong>EVIDENCE BOUNDARY</strong> No authorized screenshots or marketing/business source passages are available in this turn.</p></section>',
  );
  assert.equal(islandScopedLimitation.ready, true, "a named source and its explicit limitation may be separate reading objects in the same authored island");
  assert.deepEqual(islandScopedLimitation.unacknowledgedUnavailable, []);

  const unrelatedLimitation = resolveCanvasV2ResearchCompletion(
    unavailableAwinIndex,
    "The evidence boundary is explicit.",
    "<p>No authorized Whop screenshots are available.</p><p>Awin is the requested comparison.</p>",
  );
  assert.equal(unrelatedLimitation.ready, false, "a limitation for another source cannot acknowledge Awin");
  assert.deepEqual(unrelatedLimitation.unacknowledgedUnavailable, ["Awin"]);
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

test("generic connected-app aliases collapse into one coverage requirement", () => {
  const index = buildCanvasV2ResearchCatalogIndex(catalog, "Inspect Awin onboarding", revision(), ["Awin app", "Awin"]);
  assert.equal(index.requirements.length, 1);
  assert.equal(index.requirements[0]?.requestedName, "Awin");
  assert.equal(index.requirements[0]?.appId, "app:awin");
});

test("evidence metadata alone cannot impersonate a visibly committed flow", () => {
  const index = buildCanvasV2ResearchCatalogIndex(catalog, "Compare Awin", revision("<main></main>", [
    { id: "screen:Awin-0", url: "https://evidence.test/Awin/0.png", label: "Awin", app: "Awin" },
  ]), ["Awin"]);
  assert.equal(index.requirements[0]?.state, "unresolved");
  assert.deepEqual(index.visibleApps, []);
});

test("later authored revisions cannot erase visible canonical research", () => {
  const previous = { html: '<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="flow-awin" data-canvas-v2-canonical-flow="flow:awin"><img data-canvas-v2-node-id="flow-awin-screen-1" data-canvas-v2-evidence-id="awin-1" data-canvas-v2-evidence-role="canonical" data-canvas-v2-flow-index="0" src="https://evidence.test/awin.png"></article></main>', css: "" };
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
  assert.match(route, /decision: \{ type: "string", enum: \["edit"\] \}/);
  assert.match(route, /deterministicResearchDecision/);
  assert.match(route, /resolveCanvasV2ResearchDecision/);
  assert.match(route, /nextCanvasV2RequiredResearch/);
  assert.ok(route.indexOf("const requiredResearch =") < route.indexOf("const creativeBriefProvider = await"));
  assert.match(route, /northstar-deterministic-research-director/);
  assert.match(route, /railDetailParts/);
  assert.match(route, /resolveCanvasV2ResearchCompletion/);
  assert.match(route, /researchTargets/);
  assert.match(route, /buildCanvasV2EvidenceCopyHandles\(body\.revision\.document\)/);
  assert.match(route, /bounded analytical copies are evidence witnesses, not a duplicate flow/);
  assert.doesNotMatch(route, /loadCanvasV2EvidenceVisuals|buildCanvasV2AgentResearch/);
  assert.match(hook, /insertCanvasV2CanonicalFlow/);
  assert.match(hook, /settleCanvasV2ResearchRequirement/);
  assert.match(hook, /payload\.researchStatus \?\? loopWithProvider\.researchStatus/);
  assert.match(hook, /id\(moreRequiredFlowsRemain \? "research-fast-revision" : "research-revision"\)/);
  assert.match(hook, /kind: committedActionKind/);
  assert.doesNotMatch(hook, /canvas is still preparing its first visual observation/);
  assert.match(hook, /pendingInitialRequest/);
  assert.match(workspace, /bottom-\[18px\] left-1\/2/);
  assert.match(workspace, /bottom-24[^\n]*2xl:bottom-5/);
  assert.match(workspace, /Collapse North Star panel/);
  assert.match(workspace, /engine\.running \? "working"/);
  assert.match(loop, /CANVAS_V2_MAX_CONTEXT_STEPS = 24/);
  assert.doesNotMatch(loop, /edit-limit-reached/);
  assert.doesNotMatch(`${route}\n${hook}`, /@\/lib\/canvas-ai\//);
});
