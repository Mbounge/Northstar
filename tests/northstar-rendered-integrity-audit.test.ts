import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildNorthstarRenderedIntegrityAudit,
  type BuildNorthstarRenderedIntegrityAuditInput,
} from "../lib/canvas-ai/northstar-rendered-integrity-audit";
import type {
  NorthstarCumulativeIntentAudit,
  NorthstarCumulativeIntentCommitment,
  NorthstarCumulativeIntentGraphView,
} from "../lib/canvas-ai/northstar-cumulative-intent-audit";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarAuthoredDesignRelation,
  NorthstarCommittedSemanticNode,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarResolvedDesignRelation,
} from "../lib/canvas-artifacts/types";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

function node(input: {
  nodeId: string;
  parentId?: string;
  bounds: ReturnType<typeof rect>;
  text?: string;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  classes?: string[];
}): NorthstarCommittedSemanticNode {
  return {
    nodeId: input.nodeId,
    parentId: input.parentId,
    bounds: input.bounds,
    normalizedText: input.text ?? "",
    normalizedAttributes: input.attributes ?? {},
    normalizedClasses: input.classes ?? [],
    normalizedStyles: input.styles ?? {},
    subtreeFingerprint: input.nodeId,
  };
}

function commitment(input: {
  nodeId: string;
  kind?: NorthstarCumulativeIntentCommitment["kind"];
  targetIds?: string[];
  regionIds?: string[];
  relationIds?: string[];
  parentNodeId?: string;
  bounds: ReturnType<typeof rect>;
}): NorthstarCumulativeIntentCommitment {
  return {
    commitmentId: `commitment:${input.nodeId}`,
    nodeId: input.nodeId,
    kind: input.kind ?? "authored-object",
    parentNodeId: input.parentNodeId,
    semanticTargetNodeIds: input.targetIds ?? [],
    semanticRegionIds: input.regionIds ?? [],
    relationIds: input.relationIds ?? [],
    sourceEvidenceIds: [],
    provenanceNodeIds: [],
    boundsAfter: input.bounds,
  };
}

function cumulativeAudit(commitments: NorthstarCumulativeIntentCommitment[]): NorthstarCumulativeIntentAudit {
  return {
    schema: "northstar.cumulative-intent-audit.v1",
    mode: "audit-only",
    turn: 6,
    instruction: "test",
    beforeRevisionId: "before",
    afterRevisionId: "after",
    mutationId: "mutation",
    activeCommitmentLedger: commitments,
    retiredCommitmentIds: [],
    resolutionWarnings: [],
    directEditScope: {
      directNodeIds: [],
      introducedNodeIds: [],
      removedNodeIds: [],
      containerContextNodeIds: [],
      relationSubjectNodeIds: [],
      relationReferenceNodeIds: [],
      structuralMemberNodeIds: [],
      artboardExpansionRequested: false,
      globalPresentationMutation: false,
    },
    affectedComposition: {
      directCommitmentIds: [],
      continuityDependentCommitmentIds: [],
      spatiallyExposedCommitmentIds: [],
      unrelatedCommitmentIds: commitments.map((item) => item.commitmentId),
      continuityAnchorNodeIds: [],
      geometryChangedNodeIds: [],
      dependencyPaths: [],
      spatialExposurePairs: [],
    },
    classification: {
      activeCommitmentCount: commitments.length,
      directCommitmentCount: 0,
      continuityDependentCommitmentCount: 0,
      spatiallyExposedCommitmentCount: 0,
      unrelatedCommitmentCount: commitments.length,
      structuralMemberCount: 0,
      everyActiveCommitmentClassifiedExactlyOnce: true,
      warnings: [],
    },
    executionInfluence: { modelInput: "none", modelResponse: "none", mutation: "none", browserRuntime: "none", commitDecision: "none" },
  };
}

function packageValue(html: string, relations: NorthstarAuthoredDesignRelation[] = []): NorthstarGeneratedCodeArtifactPackage {
  return {
    schema: "northstar.generated-web-artifact.v0.3",
    artifactId: "artifact",
    revisionId: "after",
    title: "test",
    description: "test",
    objective: "test",
    audience: "test",
    artifactType: "comparison-board",
    visualStrategy: "test",
    document: { schema: "northstar.web-artifact-document.v1", html, css: "", javascript: "" },
    authoredDesignRelations: relations,
    preferredWidth: 800,
    preferredHeight: 600,
    minimumWidth: 1,
    minimumHeight: 1,
    stages: [],
    dataBundle: { version: "northstar.artifact-data.v0.2", objective: "", audience: "", artifactType: "", coverageSummary: "", apps: [], flows: [], screenshots: [], hypotheses: [], decisions: [], corrections: [], openQuestions: [], allowedAssetUrls: [] },
    thinkingDepth: "low",
    creativeReviews: [],
    diagnostics: [],
  };
}

function acknowledgement(input: {
  nodes: NorthstarCommittedSemanticNode[];
  relations?: NorthstarAuthoredDesignRelation[];
  resolved?: NorthstarResolvedDesignRelation[];
  crossings?: Array<{ relationshipId: string; primitiveId: string; obstacleId: string; hitCount: number }>;
}): NorthstarArtifactMutationAcknowledgement {
  return {
    schema: "northstar.artboard-ack.v1",
    ackToken: "after",
    artifactId: "artifact",
    surfaceId: "surface",
    revisionId: "after",
    browserRevisionId: "after",
    status: "applied",
    changedNodeIds: [],
    meaningfulChangedNodeIds: [],
    changeKinds: [],
    requiredAssetUrls: [],
    loadedAssetUrls: [],
    missingAssetUrls: [],
    authoredDesignRelations: input.relations ?? [],
    resolvedDesignRelations: input.resolved,
    review: input.crossings ? {
      revisionId: "after",
      stageIndex: 0,
      evaluatedAt: "2026-01-01T00:00:00.000Z",
      rootWidth: 800,
      rootHeight: 600,
      elementCount: input.nodes.length,
      stageRegionCount: 0,
      visibleStageRegionCount: 0,
      overflowElementCount: 0,
      clippedTextCount: 0,
      smallTextCount: 0,
      tinyInteractiveCount: 0,
      missingImageCount: 0,
      documentScrollRisk: false,
      summary: "test",
      authoredInterferencePairs: input.crossings,
    } : undefined,
    snapshot: { html: "", css: "", capturedAt: "2026-01-01T00:00:00.000Z", semanticNodes: input.nodes },
    acknowledgedAt: "2026-01-01T00:00:00.000Z",
  };
}

function graph(input: {
  groupBounds?: ReturnType<typeof rect>;
  whopBounds?: ReturnType<typeof rect>;
  memberBounds?: Record<string, ReturnType<typeof rect>>;
} = {}): NorthstarCumulativeIntentGraphView {
  const groupBounds = input.groupBounds ?? rect(0, 0, 220, 120);
  const whopBounds = input.whopBounds ?? rect(0, 160, 220, 120);
  const memberBounds = input.memberBounds ?? {};
  return {
    revisionId: "after",
    regions: [
      { regionId: "flow:awin", rootNodeId: "flow-awin", memberNodeIds: ["awin-1", "awin-2"], bounds: groupBounds },
      { regionId: "flow:whop", rootNodeId: "flow-whop", memberNodeIds: ["whop-1"], bounds: whopBounds },
    ],
    evidenceItems: [
      { nodeId: "awin-1", evidenceId: "e1", flowId: "awin", index: 0, bounds: memberBounds["awin-1"] ?? rect(10, 10, 80, 100) },
      { nodeId: "awin-2", evidenceId: "e2", flowId: "awin", index: 1, bounds: memberBounds["awin-2"] ?? rect(120, 10, 80, 100) },
      { nodeId: "whop-1", evidenceId: "w1", flowId: "whop", index: 0, bounds: memberBounds["whop-1"] ?? rect(10, 170, 80, 100) },
    ],
    nodes: [
      { nodeId: "artboard", bounds: rect(0, 0, 800, 600) },
      { nodeId: "flow-awin", parentId: "artboard", bounds: groupBounds },
      { nodeId: "flow-whop", parentId: "artboard", bounds: whopBounds },
      { nodeId: "awin-1", parentId: "flow-awin", evidenceId: "e1", bounds: memberBounds["awin-1"] ?? rect(10, 10, 80, 100) },
      { nodeId: "awin-2", parentId: "flow-awin", evidenceId: "e2", bounds: memberBounds["awin-2"] ?? rect(120, 10, 80, 100) },
      { nodeId: "whop-1", parentId: "flow-whop", evidenceId: "w1", bounds: memberBounds["whop-1"] ?? rect(10, 170, 80, 100) },
    ],
  };
}

function auditInput(input: {
  nodes: NorthstarCommittedSemanticNode[];
  commitments: NorthstarCumulativeIntentCommitment[];
  html: string;
  relations?: NorthstarAuthoredDesignRelation[];
  resolved?: NorthstarResolvedDesignRelation[];
  crossings?: Array<{ relationshipId: string; primitiveId: string; obstacleId: string; hitCount: number }>;
  graph?: NorthstarCumulativeIntentGraphView;
}): BuildNorthstarRenderedIntegrityAuditInput {
  const relations = input.relations ?? [];
  return {
    turn: 6,
    package: packageValue(input.html, relations),
    acknowledgement: acknowledgement({ nodes: input.nodes, relations, resolved: input.resolved, crossings: input.crossings }),
    graph: input.graph ?? graph(),
    cumulativeIntentAudit: cumulativeAudit(input.commitments),
  };
}

const evidenceNodes = [
  node({ nodeId: "flow-awin", parentId: "artboard", bounds: rect(0, 0, 220, 120), styles: { "background-color": "#eef4ff", overflow: "visible" } }),
  node({ nodeId: "flow-whop", parentId: "artboard", bounds: rect(0, 160, 220, 120), styles: { "background-color": "#fff2ee", overflow: "visible" } }),
  node({ nodeId: "awin-1", parentId: "flow-awin", bounds: rect(10, 10, 80, 100), attributes: { "data-ns-evidence-id": "e1" } }),
  node({ nodeId: "awin-2", parentId: "flow-awin", bounds: rect(120, 10, 80, 100), attributes: { "data-ns-evidence-id": "e2" } }),
  node({ nodeId: "whop-1", parentId: "flow-whop", bounds: rect(10, 170, 80, 100), attributes: { "data-ns-evidence-id": "w1" } }),
];

const flowHtml = '<main data-ns-node-id="artboard"><section data-ns-node-id="flow-awin" style="background-color:#eef4ff;overflow:visible"><figure data-ns-node-id="awin-1"></figure><figure data-ns-node-id="awin-2"></figure></section><section data-ns-node-id="flow-whop" style="background-color:#fff2ee;overflow:visible"><figure data-ns-node-id="whop-1"></figure></section></main>';

function evidenceCommitments(): NorthstarCumulativeIntentCommitment[] {
  return [
    commitment({ nodeId: "flow-awin", kind: "region-presentation", bounds: rect(0, 0, 220, 120) }),
    commitment({ nodeId: "flow-whop", kind: "region-presentation", bounds: rect(0, 160, 220, 120) }),
    commitment({ nodeId: "awin-1", kind: "evidence-presentation", parentNodeId: "flow-awin", regionIds: ["flow:awin"], bounds: rect(10, 10, 80, 100) }),
    commitment({ nodeId: "awin-2", kind: "evidence-presentation", parentNodeId: "flow-awin", regionIds: ["flow:awin"], bounds: rect(120, 10, 80, 100) }),
    commitment({ nodeId: "whop-1", kind: "evidence-presentation", parentNodeId: "flow-whop", regionIds: ["flow:whop"], bounds: rect(10, 170, 80, 100) }),
  ];
}

test("reports a readable annotation crowded between unrelated evidence without prescribing placement", () => {
  const noteBounds = rect(92, 20, 16, 60);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [...evidenceNodes, node({ nodeId: "gap-note", parentId: "artboard", bounds: noteBounds, text: "Observation", styles: { "font-size": "12px", background: "#fff" } })],
    commitments: [...evidenceCommitments(), commitment({ nodeId: "gap-note", bounds: noteBounds })],
    html: flowHtml.replace("</main>", '<div data-ns-node-id="gap-note" style="font-size:12px;background:#fff">Observation</div></main>'),
  }));
  const observation = result.readableClearanceObservations.find((item) => item.subjectNodeId === "gap-note");
  assert.equal(observation?.status, "crowded");
  assert.ok(Object.values(observation?.nearestBySide ?? {}).some((item) => item && item.clearanceDeficit > 0));
  assert.ok(result.highConfidenceFindings.every((finding) => !/move|place|resize|reroute/i.test(finding.rationale)));
});

test("reports readable authored content that occludes protected evidence", () => {
  const noteBounds = rect(60, 20, 70, 70);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [...evidenceNodes, node({ nodeId: "role-note", parentId: "artboard", bounds: noteBounds, text: "Role explanation", attributes: { "data-ns-explains-node-id": "awin-1" }, styles: { "z-index": "5", background: "#fff" } })],
    commitments: [...evidenceCommitments(), commitment({ nodeId: "role-note", targetIds: ["awin-1"], bounds: noteBounds })],
    html: flowHtml.replace("</main>", '<div data-ns-node-id="role-note" data-ns-explains-node-id="awin-1" style="z-index:5;background:#fff">Role explanation</div></main>'),
  }));
  const observation = result.readableClearanceObservations.find((item) => item.subjectNodeId === "role-note");
  assert.equal(observation?.status, "occluding");
  assert.ok(result.highConfidenceFindings.some((finding) => finding.kind === "readable-occlusion" && finding.subjectNodeId === "role-note"));
});

test("does not reject intentional close proximity to an intended target when the target remains unobscured", () => {
  const noteBounds = rect(10, 116, 80, 30);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [...evidenceNodes, node({ nodeId: "target-note", parentId: "artboard", bounds: noteBounds, text: "Explains Awin", attributes: { "data-ns-explains-node-id": "awin-1" }, styles: { "font-size": "12px" } })],
    commitments: [...evidenceCommitments(), commitment({ nodeId: "target-note", targetIds: ["awin-1"], bounds: noteBounds })],
    html: flowHtml.replace("</main>", '<div data-ns-node-id="target-note" data-ns-explains-node-id="awin-1" style="font-size:12px">Explains Awin</div></main>'),
  }));
  assert.equal(result.readableClearanceObservations.find((item) => item.subjectNodeId === "target-note")?.status, "clear");
});

function connectorRelation(): NorthstarAuthoredDesignRelation {
  return {
    id: "rel-connector",
    subjectId: "connector-path",
    kind: "connector-attachment",
    references: [
      { role: "source", nodeId: "awin-1", geometry: "border-box" },
      { role: "target", nodeId: "whop-1", geometry: "border-box" },
    ],
    parameters: { primitiveNodeId: "connector-path" },
    realizationPolicy: "live",
  };
}

test("classifies a painted connector touching both intended endpoints as clear", () => {
  const relation = connectorRelation();
  const connectorBounds = rect(40, 100, 0.01, 70);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [...evidenceNodes, node({ nodeId: "connector-svg", parentId: "artboard", bounds: rect(0, 0, 500, 500) }), node({ nodeId: "connector-path", parentId: "connector-svg", bounds: connectorBounds, attributes: { "data-ns-authored-relationship": "true", d: "M40 100 L40 170", stroke: "#05f", fill: "none" } })],
    commitments: [...evidenceCommitments(), commitment({ nodeId: "connector-svg", kind: "visual-relationship", targetIds: ["awin-1", "whop-1"], relationIds: [relation.id], bounds: rect(0, 0, 500, 500) }), commitment({ nodeId: "connector-path", kind: "visual-relationship", targetIds: ["awin-1", "whop-1"], relationIds: [relation.id], bounds: connectorBounds })],
    html: flowHtml.replace("</main>", '<svg data-ns-node-id="connector-svg" style="position:absolute;width:500px;height:500px"><path data-ns-node-id="connector-path" data-ns-authored-relationship="true" d="M40 100 L40 170" stroke="#05f" fill="none"></path></svg></main>'),
    relations: [relation],
    resolved: [{ relationId: relation.id, revisionId: "after", inputBounds: {}, outputBounds: { ...connectorBounds, x: connectorBounds.left, y: connectorBounds.top }, status: "resolved" }],
  }));
  assert.equal(result.relationshipContinuityObservations[0]?.status, "clear");
  assert.ok(!result.objectRegistry.some((item) => item.nodeId === "connector-svg"));
  assert.ok(result.objectRegistry.some((item) => item.nodeId === "connector-path"));
});

test("uses anonymous painted SVG descendants for visual continuity without treating an unresolved runtime relation as a disconnect", () => {
  const relation: NorthstarAuthoredDesignRelation = {
    ...connectorRelation(),
    id: "rel-anonymous-connector",
    subjectId: "connector-svg",
    parameters: { primitiveNodeId: "connector-svg" },
  };
  const wrapperBounds = rect(0, 0, 500, 500);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [
      ...evidenceNodes,
      node({ nodeId: "connector-svg", parentId: "artboard", bounds: wrapperBounds, styles: { "z-index": "10" } }),
    ],
    commitments: [
      ...evidenceCommitments(),
      commitment({ nodeId: "connector-svg", kind: "visual-relationship", targetIds: ["awin-1", "whop-1"], relationIds: [relation.id], bounds: wrapperBounds }),
    ],
    html: flowHtml.replace(
      "</main>",
      '<svg data-ns-node-id="connector-svg" style="position:absolute;left:0;top:0;width:500px;height:500px;z-index:10"><path d="M 90 60 C 110 60 110 220 90 220" stroke="#05f" stroke-width="2" fill="none"></path></svg></main>',
    ),
    relations: [relation],
    resolved: [{ relationId: relation.id, revisionId: "after", inputBounds: {}, status: "unresolved" }],
  }));
  const observation = result.relationshipContinuityObservations.find((item) => item.relationshipId === relation.id);
  assert.equal(observation?.status, "clear");
  assert.equal(observation?.primitiveVisible, true);
  assert.equal(observation?.primitiveGeometrySource, "anonymous-painted-descendant");
  assert.equal(observation?.runtimeStatus, "unresolved");
  assert.ok((observation?.sourceAttachmentDistance ?? Number.POSITIVE_INFINITY) <= 2);
  assert.ok((observation?.targetAttachmentDistance ?? Number.POSITIVE_INFINITY) <= 2);
  assert.ok(!result.highConfidenceFindings.some((finding) => finding.findingId === `rendered-integrity:relationship:${relation.id}`));
  assert.ok(result.informationalObservations.some((finding) => finding.findingId === `rendered-integrity:relationship-runtime:${relation.id}`));
});

test("collapses reciprocal readable overlaps into one canonical high-confidence defect pair", () => {
  const firstBounds = rect(300, 300, 100, 60);
  const secondBounds = rect(320, 320, 100, 60);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [
      ...evidenceNodes,
      node({ nodeId: "first-card", parentId: "artboard", bounds: firstBounds, text: "First", styles: { background: "#fff", "z-index": "1" } }),
      node({ nodeId: "second-card", parentId: "artboard", bounds: secondBounds, text: "Second", styles: { background: "#fff", "z-index": "2" } }),
    ],
    commitments: [
      ...evidenceCommitments(),
      commitment({ nodeId: "first-card", bounds: firstBounds }),
      commitment({ nodeId: "second-card", bounds: secondBounds }),
    ],
    html: flowHtml.replace(
      "</main>",
      '<div data-ns-node-id="first-card" style="background:#fff;z-index:1">First</div><div data-ns-node-id="second-card" style="background:#fff;z-index:2">Second</div></main>',
    ),
  }));
  const pairFindings = result.highConfidenceFindings.filter((finding) =>
    finding.relatedNodeIds.includes("first-card") || finding.relatedNodeIds.includes("second-card")
  ).filter((finding) => finding.kind === "readable-occlusion" || finding.kind === "readable-clearance");
  assert.equal(pairFindings.length, 1);
  assert.equal(pairFindings[0]?.findingId, "rendered-integrity:overlap:first-card:second-card");
  assert.equal(pairFindings[0]?.subjectNodeId, "second-card");
  assert.deepEqual(pairFindings[0]?.relatedNodeIds, ["first-card"]);
});

test("measures a connector's sampled stroke corridor separately from endpoint attachment", () => {
  const relation = connectorRelation();
  const connectorBounds = rect(90, 110, 67.5, 60);
  const headingBounds = rect(145, 135, 30, 20);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [
      ...evidenceNodes,
      node({ nodeId: "connector-svg", parentId: "artboard", bounds: rect(0, 0, 500, 500) }),
      node({
        nodeId: "connector-path",
        parentId: "connector-svg",
        bounds: connectorBounds,
        attributes: {
          "data-ns-authored-relationship": "true",
          d: "M 90 110 C 180 120 180 160 90 170",
          stroke: "#05f",
          "stroke-width": "2",
          fill: "none",
        },
      }),
      node({ nodeId: "flow-heading", parentId: "artboard", bounds: headingBounds, text: "Whop onboarding", styles: { "font-size": "14px" } }),
    ],
    commitments: [
      ...evidenceCommitments(),
      commitment({ nodeId: "connector-path", kind: "visual-relationship", targetIds: ["awin-1", "whop-1"], relationIds: [relation.id], bounds: connectorBounds }),
      commitment({ nodeId: "flow-heading", bounds: headingBounds }),
    ],
    html: flowHtml.replace(
      "</main>",
      '<svg data-ns-node-id="connector-svg" style="position:absolute;left:0;top:0;width:500px;height:500px"><path data-ns-node-id="connector-path" data-ns-authored-relationship="true" d="M 90 110 C 180 120 180 160 90 170" stroke="#05f" stroke-width="2" fill="none"></path></svg><h2 data-ns-node-id="flow-heading">Whop onboarding</h2></main>',
    ),
    relations: [relation],
    resolved: [{ relationId: relation.id, revisionId: "after", inputBounds: {}, outputBounds: { ...connectorBounds, x: connectorBounds.left, y: connectorBounds.top }, status: "resolved" }],
  }));
  const observation = result.relationshipContinuityObservations.find((item) => item.relationshipId === relation.id);
  assert.equal(observation?.attachmentStatus, "clear");
  assert.equal(observation?.interferenceStatus, "crosses-readable-content");
  assert.equal(observation?.status, "weakened");
  assert.deepEqual(observation?.readableCrossingNodeIds, ["flow-heading"]);
  assert.ok((observation?.readableCrossingLengths["flow-heading"] ?? 0) > 0);
  assert.ok(result.highConfidenceFindings.some((finding) =>
    finding.findingId === `rendered-integrity:relationship:${relation.id}`
      && finding.measurement.attachmentStatus === "clear"
      && finding.measurement.interferenceStatus === "crosses-readable-content"
  ));
  assert.ok(!result.highConfidenceFindings.some((finding) => finding.findingId.includes("connector-path:flow-heading")));
});

test("does not report a readable crossing merely because a curve's rectangular bounds overlap text", () => {
  const relation = connectorRelation();
  const connectorBounds = rect(90, 110, 67.5, 60);
  const headingBounds = rect(92, 135, 18, 20);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [
      ...evidenceNodes,
      node({ nodeId: "connector-svg", parentId: "artboard", bounds: rect(0, 0, 500, 500) }),
      node({
        nodeId: "connector-path",
        parentId: "connector-svg",
        bounds: connectorBounds,
        attributes: { "data-ns-authored-relationship": "true", d: "M 90 110 C 180 120 180 160 90 170", stroke: "#05f", "stroke-width": "2", fill: "none" },
      }),
      node({ nodeId: "nearby-heading", parentId: "artboard", bounds: headingBounds, text: "Nearby", styles: { "font-size": "14px" } }),
    ],
    commitments: [
      ...evidenceCommitments(),
      commitment({ nodeId: "connector-path", kind: "visual-relationship", targetIds: ["awin-1", "whop-1"], relationIds: [relation.id], bounds: connectorBounds }),
      commitment({ nodeId: "nearby-heading", bounds: headingBounds }),
    ],
    html: flowHtml.replace(
      "</main>",
      '<svg data-ns-node-id="connector-svg" style="position:absolute;left:0;top:0;width:500px;height:500px"><path data-ns-node-id="connector-path" data-ns-authored-relationship="true" d="M 90 110 C 180 120 180 160 90 170" stroke="#05f" stroke-width="2" fill="none"></path></svg><h2 data-ns-node-id="nearby-heading">Nearby</h2></main>',
    ),
    relations: [relation],
    resolved: [{ relationId: relation.id, revisionId: "after", inputBounds: {}, outputBounds: { ...connectorBounds, x: connectorBounds.left, y: connectorBounds.top }, status: "resolved" }],
  }));
  const observation = result.relationshipContinuityObservations.find((item) => item.relationshipId === relation.id);
  assert.equal(observation?.attachmentStatus, "clear");
  assert.equal(observation?.interferenceStatus, "clear");
  assert.equal(observation?.status, "clear");
  assert.deepEqual(observation?.readableCrossingNodeIds, []);
});

test("collapses reciprocal readable crowding into one canonical informational pair", () => {
  const firstBounds = rect(300, 300, 100, 40);
  const secondBounds = rect(300, 348, 100, 40);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [
      ...evidenceNodes,
      node({ nodeId: "first-card", parentId: "artboard", bounds: firstBounds, text: "First", styles: { "font-size": "16px" } }),
      node({ nodeId: "second-card", parentId: "artboard", bounds: secondBounds, text: "Second", styles: { "font-size": "16px" } }),
    ],
    commitments: [
      ...evidenceCommitments(),
      commitment({ nodeId: "first-card", bounds: firstBounds }),
      commitment({ nodeId: "second-card", bounds: secondBounds }),
    ],
    html: flowHtml.replace(
      "</main>",
      '<div data-ns-node-id="first-card" style="font-size:16px">First</div><div data-ns-node-id="second-card" style="font-size:16px">Second</div></main>',
    ),
  }));
  const pairFindings = result.informationalObservations.filter((finding) =>
    finding.findingId === "rendered-integrity:clearance-pair:first-card:second-card"
  );
  assert.equal(pairFindings.length, 1);
  assert.equal(pairFindings[0]?.measurement.gap, 8);
  assert.ok(Number(pairFindings[0]?.measurement.maxClearanceDeficit) > 0);
});

test("reports a connector terminating in empty space and one crossing readable content", () => {
  const relation = connectorRelation();
  const connectorBounds = rect(40, 100, 0.01, 20);
  const noteBounds = rect(30, 105, 40, 20);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [...evidenceNodes, node({ nodeId: "connector-path", parentId: "artboard", bounds: connectorBounds, attributes: { "data-ns-authored-relationship": "true" } }), node({ nodeId: "obstacle-note", parentId: "artboard", bounds: noteBounds, text: "Readable", styles: { background: "#fff" } })],
    commitments: [...evidenceCommitments(), commitment({ nodeId: "connector-path", kind: "visual-relationship", targetIds: ["awin-1", "whop-1"], relationIds: [relation.id], bounds: connectorBounds }), commitment({ nodeId: "obstacle-note", bounds: noteBounds })],
    html: flowHtml.replace("</main>", '<path data-ns-node-id="connector-path" data-ns-authored-relationship="true"></path><div data-ns-node-id="obstacle-note" style="background:#fff">Readable</div></main>'),
    relations: [relation],
    crossings: [{ relationshipId: relation.id, primitiveId: "connector-path", obstacleId: "obstacle-note", hitCount: 1 }],
  }));
  const observation = result.relationshipContinuityObservations[0];
  assert.equal(observation?.status, "disconnected");
  assert.deepEqual(observation?.readableCrossingNodeIds, ["obstacle-note"]);
});

test("reports members outside a painted group even when overflow is visible", () => {
  const detachedBounds = rect(230, 10, 80, 100);
  const nodes = evidenceNodes.map((item) => item.nodeId === "awin-2" ? node({ nodeId: "awin-2", parentId: "flow-awin", bounds: detachedBounds, attributes: { "data-ns-evidence-id": "e2" } }) : item);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes,
    commitments: evidenceCommitments().map((item) => item.nodeId === "awin-2" ? { ...item, boundsAfter: detachedBounds } : item),
    html: flowHtml,
    graph: graph({ memberBounds: { "awin-2": detachedBounds } }),
  }));
  const observation = result.groupCongruenceObservations.find((item) => item.groupNodeId === "flow-awin" && item.memberNodeId === "awin-2");
  assert.equal(observation?.status, "detached");
  assert.equal(observation?.overflowVisible, true);
  const finding = result.highConfidenceFindings.find((item) => item.kind === "group-congruence" && item.subjectNodeId === "awin-2");
  assert.ok(finding);
  assert.equal(finding?.measurement.groupLeft, 0);
  assert.equal(finding?.measurement.memberRight, 310);
  assert.equal(finding?.measurement.requiredContainerWidth, 310);
  assert.equal(finding?.measurement.overflowRight, 90);
});

test("reports weakened target attribution when an explanation enters a competing semantic group", () => {
  const noteBounds = rect(100, 175, 90, 50);
  const result = buildNorthstarRenderedIntegrityAudit(auditInput({
    nodes: [...evidenceNodes, node({ nodeId: "role-note", parentId: "artboard", bounds: noteBounds, text: "Role explanation", attributes: { "data-ns-explains-node-id": "awin-2" }, styles: { background: "#fff" } })],
    commitments: [...evidenceCommitments(), commitment({ nodeId: "role-note", targetIds: ["awin-2"], bounds: noteBounds })],
    html: flowHtml.replace("</main>", '<div data-ns-node-id="role-note" data-ns-explains-node-id="awin-2" style="background:#fff">Role explanation</div></main>'),
  }));
  const observation = result.targetAttributionObservations.find((item) => item.subjectNodeId === "role-note");
  assert.equal(observation?.attribution, "weakened");
  assert.equal(observation?.crossesSemanticBoundary, true);
});

test("audit remains isolated from model input, mutation execution, and commit behavior", () => {
  const root = process.cwd();
  const source = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");
  const modelInputStart = source.indexOf("export function buildNorthstarDesignResetModelInput");
  const modelInputEnd = source.indexOf("export function sanitizeNorthstarDesignResetModelResponse");
  const modelInputSource = source.slice(modelInputStart, modelInputEnd);
  assert.doesNotMatch(modelInputSource, /renderedIntegrityAudit|buildNorthstarRenderedIntegrityAudit/);
  assert.match(source, /try \{[\s\S]*buildNorthstarRenderedIntegrityAudit[\s\S]*catch \(error\)/);
  assert.match(source, /renderedIntegrityAuditFailure/);
  assert.doesNotMatch(source, /if \([^)]*renderedIntegrityAudit[^)]*\)[\s\S]{0,160}(?:throw|return|commit|reject)/);
});
