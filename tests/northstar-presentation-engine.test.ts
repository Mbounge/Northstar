import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNorthstarEditableSurfaceDescriptor,
  buildNorthstarFallbackPresentationDecision,
  compileNorthstarPresentationPass,
} from "@/lib/canvas-ai/northstar-presentation-engine";
import {
  buildNorthstarMoveContract,
  preflightNorthstarMove,
  northstarCssHidesCanonicalArtboard,
  type NorthstarObligationKey,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import { canonicalFlowNodeId } from "@/lib/canvas-ai/northstar-canonical-evidence-scene";
import type {
  CanvasCodeArtifactDataBundle,
  CanvasCodeArtifactFlowData,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

const flows: CanvasCodeArtifactFlowData[] = [
  {
    id: "flow-awin",
    appName: "Awin",
    flowName: "Onboarding",
    summary: "Awin onboarding",
    journeyStages: ["entry", "verification", "complete"],
    patterns: ["guided"],
    frictionSignals: ["manual review"],
    trustSignals: ["compliance"],
    openQuestions: [],
    screenshotIds: ["awin-1", "awin-2", "awin-3"],
  },
  {
    id: "flow-whop",
    appName: "Whop",
    flowName: "Onboarding",
    summary: "Whop onboarding",
    journeyStages: ["entry", "creation", "complete"],
    patterns: ["fast"],
    frictionSignals: [],
    trustSignals: ["social proof"],
    openQuestions: [],
    screenshotIds: ["whop-1", "whop-2", "whop-3"],
  },
];

const screenshots = flows.flatMap((flow) => flow.screenshotIds.map((id, index) => ({
  id,
  appName: flow.appName,
  flowName: flow.flowName,
  title: `${flow.appName} ${index + 1}`,
  imageUrl: `https://example.com/${id}.png`,
  index,
  journeyStage: flow.journeyStages[index] ?? "step",
  visibleCopy: [`Copy ${id}`],
  notablePatterns: index === 1 ? ["key pattern"] : [],
  frictionSignals: index === 1 && flow.appName === "Awin" ? ["manual approval"] : [],
  trustSignals: index === 2 ? ["confirmation"] : [],
  opportunities: [],
  relevance: 1,
})));

const dataBundle: CanvasCodeArtifactDataBundle = {
  version: "northstar.artifact-data.v0.2",
  objective: "Compare onboarding trust and velocity",
  audience: "executive",
  artifactType: "comparison-board",
  coverageSummary: "Both flows studied",
  apps: flows.map((flow, index) => ({
    id: `app-${index}`,
    name: flow.appName,
    summary: "",
    flowIds: [flow.id],
    patterns: [],
    strengths: [],
    risks: [],
    openQuestions: [],
  })),
  flows,
  screenshots,
  hypotheses: [{
    id: "hypothesis-1",
    statement: "Awin trades speed for trust",
    status: "active",
    supportingEvidenceIds: [],
    contradictingEvidenceIds: [],
  }],
  decisions: ["Prefer progressive trust controls over blanket friction."],
  corrections: [],
  openQuestions: ["Can trust be preserved with less friction?"],
  allowedAssetUrls: screenshots.flatMap((screen) => screen.imageUrl ? [screen.imageUrl] : []),
};

function flowMarkup(flow: CanvasCodeArtifactFlowData): string {
  const flowId = canonicalFlowNodeId(flow);
  return `<section data-ns-node-id="${flowId}"><div data-ns-node-id="${flowId}-sequence">${flow.screenshotIds.map((evidenceId) => `<article data-ns-node-id="${flowId}-screen-${evidenceId}" data-ns-evidence-id="${evidenceId}" data-ns-protected-evidence="true" data-ns-evidence-role="unresolved"><img src="https://example.com/${evidenceId}.png"/></article>`).join("")}</div></section>`;
}

const artifact: NorthstarGeneratedCodeArtifactPackage = {
  schema: "northstar.generated-web-artifact.v0.3",
  artifactId: "artifact-1",
  revisionId: "revision-1",
  title: "Board",
  description: "",
  objective: dataBundle.objective,
  audience: dataBundle.audience,
  artifactType: dataBundle.artifactType,
  visualStrategy: "",
  document: {
    schema: "northstar.web-artifact-document.v1",
    html: `<main data-ns-node-id="artboard"><h1 data-ns-node-id="title">Trust vs velocity</h1><p data-ns-node-id="deck">Comparison</p><section data-ns-node-id="reasoning-zone"><article data-ns-node-id="thought-primary"><div data-ns-node-id="thought-primary-body">Hypothesis</div></article></section><section data-ns-node-id="evidence">${flows.map(flowMarkup).join("")}</section><section data-ns-node-id="synthesis"></section><section data-ns-node-id="decision"></section></main>`,
    css: "",
    javascript: "",
  },
  preferredWidth: 2360,
  preferredHeight: 1272,
  minimumWidth: 1000,
  minimumHeight: 700,
  stages: [],
  dataBundle,
  thinkingDepth: "low",
  creativeReviews: [],
  diagnostics: [],
  provisional: true,
  publicationState: "working",
};

test("the typed presentation compiler creates preflight-safe passes for every core obligation", () => {
  const descriptor = buildNorthstarEditableSurfaceDescriptor(artifact);
  assert.equal(descriptor.flowRegions.length, 2);
  assert.equal(descriptor.evidenceNodes.length, 6);

  const obligations: NorthstarObligationKey[] = [
    "evidence-hierarchy",
    "hypothesis-tested",
    "relationship-visible",
    "synthesis",
    "contextual-resolution",
    "visual-thesis",
    "reasoning-placement",
    "geometry",
  ];

  for (const obligation of obligations) {
    const decision = buildNorthstarFallbackPresentationDecision({
      obligation,
      descriptor,
      bundle: dataBundle,
    });
    const compiled = compileNorthstarPresentationPass({ artifact, descriptor, decision });
    const contract = buildNorthstarMoveContract(compiled.contractInput);
    const preflight = preflightNorthstarMove({
      artifact,
      contract,
      draft: compiled.draft,
      acceptedFingerprints: new Set(),
      rejectedFingerprints: new Set(),
    });
    assert.equal(preflight.accepted, true, `${obligation}: ${preflight.issues.join(" ")}`);
    assert.ok(compiled.draft.operations.length > 0);
  }
});

test("fallback variants rotate focal evidence instead of repeating a rejected candidate", () => {
  const descriptor = buildNorthstarEditableSurfaceDescriptor(artifact);
  const first = buildNorthstarFallbackPresentationDecision({ obligation: "evidence-hierarchy", descriptor, bundle: dataBundle, variant: 0 });
  const second = buildNorthstarFallbackPresentationDecision({ obligation: "evidence-hierarchy", descriptor, bundle: dataBundle, variant: 1 });
  assert.notDeepEqual(first.focalEvidenceIds, second.focalEvidenceIds);
});


test("canonical-artboard CSS safety checks only reject rules that directly hide the root", () => {
  assert.equal(northstarCssHidesCanonicalArtboard('[data-ns-node-id="artboard"]{row-gap:42px}.ns-reasoning-zone{display:none!important}'), false);
  assert.equal(northstarCssHidesCanonicalArtboard('.ns-artifact [data-ns-working-role="status"]{display:none}'), false);
  assert.equal(northstarCssHidesCanonicalArtboard('.ns-artifact{display:none!important}'), true);
  assert.equal(northstarCssHidesCanonicalArtboard('.canvas-shell .ns-artifact{display:none!important}'), true);
  assert.equal(northstarCssHidesCanonicalArtboard('[data-ns-node-id="artboard"]{visibility:hidden}'), true);
});


test("presentation v2 allocates a dedicated analysis lane and never marks analytical references as protected evidence", () => {
  const descriptor = buildNorthstarEditableSurfaceDescriptor(artifact);
  const relationshipDecision = buildNorthstarFallbackPresentationDecision({
    obligation: "relationship-visible",
    descriptor,
    bundle: dataBundle,
    variant: 0,
  });
  const relationship = compileNorthstarPresentationPass({ artifact, descriptor, decision: relationshipDecision });
  const insertedHtml = relationship.draft.operations
    .filter((operation) => operation.op === "insert-html")
    .map((operation) => "html" in operation ? operation.html : "")
    .join("\n");
  assert.ok(insertedHtml.includes('data-ns-node-id="analysis-lane"'));
  assert.ok(insertedHtml.includes("ns-relationship-block"));
  assert.ok(insertedHtml.includes("data-ns-evidence-ref="));
  assert.equal(insertedHtml.includes("data-ns-protected-evidence"), false);
  assert.equal(insertedHtml.includes("data-ns-evidence-id="), false);
  assert.ok(relationship.draft.operations.some((operation) =>
    operation.op === "insert-html" && operation.targetId === "analysis-lane"
  ));
});

test("presentation variants rotate composition archetype, focal treatment, and relationship mode", () => {
  const descriptor = buildNorthstarEditableSurfaceDescriptor(artifact);
  const first = buildNorthstarFallbackPresentationDecision({ obligation: "relationship-visible", descriptor, bundle: dataBundle, variant: 0 });
  const second = buildNorthstarFallbackPresentationDecision({ obligation: "relationship-visible", descriptor, bundle: dataBundle, variant: 1 });
  assert.notEqual(first.archetype, second.archetype);
  assert.notEqual(first.focalTreatment, second.focalTreatment);
  assert.notEqual(first.relationshipMode, second.relationshipMode);
});

test("evidence hierarchy uses layout-affecting sizing instead of transform scaling", () => {
  const descriptor = buildNorthstarEditableSurfaceDescriptor(artifact);
  const decision = buildNorthstarFallbackPresentationDecision({ obligation: "evidence-hierarchy", descriptor, bundle: dataBundle, variant: 0 });
  const compiled = compileNorthstarPresentationPass({ artifact, descriptor, decision });
  const css = compiled.draft.operations
    .filter((operation) => operation.op === "set-css-layer")
    .map((operation) => "css" in operation ? operation.css : "")
    .join("\n");
  assert.ok(css.includes("flex:0 0"));
  assert.ok(css.includes("transform:none"));
  assert.equal(/transform\s*:\s*scale\(/.test(css), false);
});

test("final geometry pass includes analytical regions in collision-safe normal flow", () => {
  const descriptor = buildNorthstarEditableSurfaceDescriptor(artifact);
  const decision = buildNorthstarFallbackPresentationDecision({ obligation: "geometry", descriptor, bundle: dataBundle, variant: 0 });
  const compiled = compileNorthstarPresentationPass({ artifact, descriptor, decision });
  const css = compiled.draft.operations
    .filter((operation) => operation.op === "set-css-layer")
    .map((operation) => "css" in operation ? operation.css : "")
    .join("\n");
  assert.ok(css.includes('data-ns-node-id="analysis-lane"'));
  assert.ok(css.includes("ns-relationship-block"));
  assert.ok(css.includes("contain:layout style"));
});
