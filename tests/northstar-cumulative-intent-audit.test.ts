import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildNorthstarCumulativeIntentAudit,
  type BuildNorthstarCumulativeIntentAuditInput,
  type NorthstarCumulativeIntentAudit,
  type NorthstarCumulativeIntentCommitment,
  type NorthstarCumulativeIntentGraphView,
} from "../lib/canvas-ai/northstar-cumulative-intent-audit";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardMutationBatch,
  NorthstarAuthoredDesignRelation,
  NorthstarCommittedSemanticNode,
  NorthstarGeneratedCodeArtifactPackage,
} from "../lib/canvas-artifacts/types";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

function semanticNode(input: {
  nodeId: string;
  parentId?: string;
  bounds?: ReturnType<typeof rect>;
  attributes?: Record<string, string>;
}): NorthstarCommittedSemanticNode {
  return {
    nodeId: input.nodeId,
    parentId: input.parentId,
    bounds: input.bounds,
    normalizedText: "",
    normalizedAttributes: input.attributes ?? {},
    normalizedClasses: [],
    normalizedStyles: {},
    subtreeFingerprint: input.nodeId,
  };
}

function graph(input?: {
  evidenceBounds?: ReturnType<typeof rect>;
  awinBounds?: ReturnType<typeof rect>;
  whopBounds?: ReturnType<typeof rect>;
  nodeBounds?: Record<string, ReturnType<typeof rect>>;
}): NorthstarCumulativeIntentGraphView {
  const nodeBounds = input?.nodeBounds ?? {};
  const awinMembers = ["awin-1", "awin-2"];
  const whopMembers = ["whop-1", "whop-2"];
  const bounds = (nodeId: string, fallback: ReturnType<typeof rect>) => nodeBounds[nodeId] ?? fallback;
  return {
    revisionId: "revision",
    regions: [
      { regionId: "research", rootNodeId: "evidence", memberNodeIds: [...awinMembers, ...whopMembers], bounds: input?.evidenceBounds ?? rect(0, 0, 500, 300) },
      { regionId: "flow:awin", rootNodeId: "flow-awin", memberNodeIds: awinMembers, bounds: input?.awinBounds ?? rect(0, 0, 220, 130) },
      { regionId: "flow:whop", rootNodeId: "flow-whop", memberNodeIds: whopMembers, bounds: input?.whopBounds ?? rect(0, 170, 220, 130) },
      { regionId: "working-reasoning", rootNodeId: "reasoning-zone", memberNodeIds: [], bounds: rect(550, 0, 180, 120) },
    ],
    evidenceItems: [
      { nodeId: "awin-1", evidenceId: "e-awin-1", flowId: "awin", index: 0, bounds: bounds("awin-1", rect(10, 10, 80, 100)) },
      { nodeId: "awin-2", evidenceId: "e-awin-2", flowId: "awin", index: 1, bounds: bounds("awin-2", rect(120, 10, 80, 100)) },
      { nodeId: "whop-1", evidenceId: "e-whop-1", flowId: "whop", index: 0, bounds: bounds("whop-1", rect(10, 180, 80, 100)) },
      { nodeId: "whop-2", evidenceId: "e-whop-2", flowId: "whop", index: 1, bounds: bounds("whop-2", rect(120, 180, 80, 100)) },
    ],
    nodes: [
      { nodeId: "artboard", bounds: rect(0, 0, 800, 600) },
      { nodeId: "evidence", parentId: "artboard", bounds: input?.evidenceBounds ?? rect(0, 0, 500, 300) },
      { nodeId: "flow-awin", parentId: "evidence", bounds: input?.awinBounds ?? rect(0, 0, 220, 130) },
      { nodeId: "flow-whop", parentId: "evidence", bounds: input?.whopBounds ?? rect(0, 170, 220, 130) },
      { nodeId: "reasoning-zone", parentId: "artboard", bounds: rect(550, 0, 180, 120) },
      ...awinMembers.map((nodeId, index) => ({ nodeId, parentId: "flow-awin", evidenceId: `e-awin-${index + 1}`, bounds: bounds(nodeId, rect(10 + (index * 110), 10, 80, 100)) })),
      ...whopMembers.map((nodeId, index) => ({ nodeId, parentId: "flow-whop", evidenceId: `e-whop-${index + 1}`, bounds: bounds(nodeId, rect(10 + (index * 110), 180, 80, 100)) })),
      { nodeId: "connector", parentId: "artboard", bounds: rect(40, 100, 20, 90) },
      { nodeId: "gap-note", parentId: "flow-awin", bounds: rect(92, 30, 25, 50) },
      { nodeId: "role-note", parentId: "artboard", bounds: rect(210, 20, 110, 70) },
      { nodeId: "unrelated-note", parentId: "artboard", bounds: rect(600, 300, 120, 70) },
      { nodeId: "hello-card", parentId: "artboard", bounds: rect(0, 330, 120, 60) },
      { nodeId: "visual-pair", parentId: "artboard", bounds: rect(230, 120, 80, 40) },
      { nodeId: "reused-awin-2", parentId: "artboard", evidenceId: "e-awin-2", bounds: rect(350, 330, 80, 100) },
    ],
  };
}

function relations(): NorthstarAuthoredDesignRelation[] {
  return [
    {
      id: "rel-connector",
      subjectId: "connector",
      kind: "connector-attachment",
      references: [
        { role: "source", nodeId: "awin-1" },
        { role: "target", nodeId: "whop-1" },
      ],
      parameters: { primitiveNodeId: "connector" },
      realizationPolicy: "live",
    },
    {
      id: "rel-gap",
      subjectId: "gap-note",
      kind: "between-placement",
      references: [
        { role: "before", nodeId: "awin-1" },
        { role: "after", nodeId: "awin-2" },
      ],
      parameters: { axis: "x" },
      realizationPolicy: "live",
    },
    {
      id: "rel-role",
      subjectId: "role-note",
      kind: "relative-placement",
      references: [{ role: "reference", nodeId: "awin-2" }],
      parameters: { side: "below" },
      realizationPolicy: "live",
    },
    {
      id: "rel-hello",
      subjectId: "hello-card",
      kind: "relative-placement",
      references: [{ role: "reference", nodeId: "evidence", geometry: "semantic-descendant-union" }],
      parameters: { side: "below" },
      realizationPolicy: "live",
    },
  ];
}

function snapshotNodes(input?: { movedAwin2?: boolean; includeReused?: boolean; includeUnrelated?: boolean }): NorthstarCommittedSemanticNode[] {
  const awin2Bounds = input?.movedAwin2 ? rect(150, 10, 80, 100) : rect(120, 10, 80, 100);
  return [
    semanticNode({ nodeId: "artboard", bounds: rect(0, 0, 800, 600) }),
    semanticNode({ nodeId: "evidence", parentId: "artboard", bounds: rect(0, 0, 500, 300) }),
    semanticNode({ nodeId: "flow-awin", parentId: "evidence", bounds: rect(0, 0, 220, 130) }),
    semanticNode({ nodeId: "flow-whop", parentId: "evidence", bounds: rect(0, 170, 220, 130) }),
    semanticNode({ nodeId: "reasoning-zone", parentId: "artboard", bounds: rect(550, 0, 180, 120) }),
    semanticNode({ nodeId: "awin-1", parentId: "flow-awin", bounds: rect(10, 10, 80, 100), attributes: { "data-ns-evidence-id": "e-awin-1" } }),
    semanticNode({ nodeId: "awin-2", parentId: "flow-awin", bounds: awin2Bounds, attributes: { "data-ns-evidence-id": "e-awin-2" } }),
    semanticNode({ nodeId: "whop-1", parentId: "flow-whop", bounds: rect(10, 180, 80, 100), attributes: { "data-ns-evidence-id": "e-whop-1" } }),
    semanticNode({ nodeId: "whop-2", parentId: "flow-whop", bounds: rect(120, 180, 80, 100), attributes: { "data-ns-evidence-id": "e-whop-2" } }),
    semanticNode({ nodeId: "connector", parentId: "artboard", bounds: rect(40, 100, 20, 90), attributes: { "data-ns-authored-relationship": "true", "data-ns-source-node-id": "awin-1", "data-ns-target-node-id": "whop-1" } }),
    semanticNode({ nodeId: "gap-note", parentId: "flow-awin", bounds: rect(92, 30, 25, 50), attributes: { "data-ns-authored-annotation": "true", "data-ns-between-before-node-id": "awin-1", "data-ns-between-after-node-id": "awin-2" } }),
    semanticNode({ nodeId: "role-note", parentId: "artboard", bounds: rect(210, 20, 110, 70), attributes: { "data-ns-explains-node-id": "awin-2" } }),
    semanticNode({ nodeId: "hello-card", parentId: "artboard", bounds: rect(0, 330, 120, 60) }),
    semanticNode({ nodeId: "visual-pair", parentId: "artboard", bounds: rect(230, 120, 80, 40), attributes: { "data-ns-authored-relationship": "true", "data-ns-source-node-id": "awin-1", "data-ns-target-node-id": "whop-1" } }),
    ...(input?.includeUnrelated === false ? [] : [semanticNode({ nodeId: "unrelated-note", parentId: "artboard", bounds: rect(600, 300, 120, 70), attributes: { "data-ns-authored-annotation": "true" } })]),
    ...(input?.includeReused ? [semanticNode({ nodeId: "reused-awin-2", parentId: "artboard", bounds: rect(350, 330, 80, 100), attributes: { "data-ns-evidence-id": "e-awin-2", "data-ns-source-node-id": "awin-2" } })] : []),
  ];
}

function packageValue(revisionId: string, authoredRelations = relations(), html = ""): NorthstarGeneratedCodeArtifactPackage {
  return {
    schema: "northstar.generated-web-artifact.v0.3",
    artifactId: "artifact",
    revisionId,
    title: "test",
    description: "test",
    objective: "test",
    audience: "test",
    artifactType: "comparison-board",
    visualStrategy: "test",
    document: { schema: "northstar.web-artifact-document.v1", html, css: "", javascript: "" },
    authoredDesignRelations: authoredRelations,
    preferredWidth: 800,
    preferredHeight: 600,
    minimumWidth: 1,
    minimumHeight: 1,
    stages: [],
    dataBundle: { schema: "northstar.canvas-data-bundle.v1", screens: [], flows: [], apps: [] },
    thinkingDepth: "low",
    creativeReviews: [],
    diagnostics: [],
  } as unknown as NorthstarGeneratedCodeArtifactPackage;
}

function acknowledgement(revisionId: string, nodes: NorthstarCommittedSemanticNode[], authoredRelations = relations()): NorthstarArtifactMutationAcknowledgement {
  return {
    schema: "northstar.artboard-ack.v1",
    ackToken: revisionId,
    artifactId: "artifact",
    surfaceId: "surface",
    revisionId,
    browserRevisionId: revisionId,
    status: "applied",
    changedNodeIds: [],
    meaningfulChangedNodeIds: [],
    changeKinds: [],
    requiredAssetUrls: [],
    loadedAssetUrls: [],
    missingAssetUrls: [],
    authoredDesignRelations: authoredRelations,
    snapshot: { html: "", css: "", capturedAt: "2026-01-01T00:00:00.000Z", semanticNodes: nodes },
    acknowledgedAt: "2026-01-01T00:00:00.000Z",
  };
}

function batch(input: { operations: NorthstarArtboardMutationBatch["operations"]; relations?: NorthstarAuthoredDesignRelation[]; id?: string }): NorthstarArtboardMutationBatch {
  return {
    schema: "northstar.artboard-mutation.v1",
    mutationId: input.id ?? "mutation-current",
    sequence: 1,
    label: "Current turn",
    phase: "refinement",
    intent: "Current turn intent",
    visibleChange: "Current turn visible change",
    geometryIntent: "recompose",
    transitionMs: 300,
    operations: input.operations,
    relations: input.relations,
  } as NorthstarArtboardMutationBatch;
}

function previousAudit(commitments: NorthstarCumulativeIntentCommitment[]): NorthstarCumulativeIntentAudit {
  return {
    schema: "northstar.cumulative-intent-audit.v1",
    mode: "audit-only",
    turn: 5,
    instruction: "prior",
    beforeRevisionId: "r4",
    afterRevisionId: "r5",
    mutationId: "m5",
    activeCommitmentLedger: commitments,
    retiredCommitmentIds: [],
    resolutionWarnings: [],
    directEditScope: {
      directNodeIds: [], introducedNodeIds: [], removedNodeIds: [], containerContextNodeIds: [], relationSubjectNodeIds: [], relationReferenceNodeIds: [], structuralMemberNodeIds: [], artboardExpansionRequested: false, globalPresentationMutation: false,
    },
    affectedComposition: {
      directCommitmentIds: [], continuityDependentCommitmentIds: [], spatiallyExposedCommitmentIds: [], unrelatedCommitmentIds: commitments.map((item) => item.commitmentId), continuityAnchorNodeIds: [], geometryChangedNodeIds: [], dependencyPaths: [], spatialExposurePairs: [],
    },
    classification: {
      activeCommitmentCount: commitments.length, directCommitmentCount: 0, continuityDependentCommitmentCount: 0, spatiallyExposedCommitmentCount: 0, unrelatedCommitmentCount: commitments.length, structuralMemberCount: 0, everyActiveCommitmentClassifiedExactlyOnce: true, warnings: [],
    },
    executionInfluence: { modelInput: "none", modelResponse: "none", mutation: "none", browserRuntime: "none", commitDecision: "none" },
  };
}

const priorCommitments: NorthstarCumulativeIntentCommitment[] = [
  { commitmentId: "commitment:connector", nodeId: "connector", kind: "visual-relationship", semanticTargetNodeIds: ["awin-1", "whop-1"], semanticRegionIds: [], relationIds: ["rel-connector"], sourceEvidenceIds: [], provenanceNodeIds: ["awin-1"], boundsAfter: rect(40, 100, 20, 90) },
  { commitmentId: "commitment:gap-note", nodeId: "gap-note", kind: "authored-object", parentNodeId: "flow-awin", semanticTargetNodeIds: ["awin-1", "awin-2"], semanticRegionIds: ["flow:awin"], relationIds: ["rel-gap"], sourceEvidenceIds: [], provenanceNodeIds: [], boundsAfter: rect(92, 30, 25, 50) },
  { commitmentId: "commitment:role-note", nodeId: "role-note", kind: "authored-object", semanticTargetNodeIds: ["awin-2"], semanticRegionIds: [], relationIds: ["rel-role"], sourceEvidenceIds: [], provenanceNodeIds: [], boundsAfter: rect(210, 20, 110, 70) },
  { commitmentId: "commitment:hello-card", nodeId: "hello-card", kind: "authored-object", semanticTargetNodeIds: ["evidence"], semanticRegionIds: [], relationIds: ["rel-hello"], sourceEvidenceIds: [], provenanceNodeIds: [], boundsAfter: rect(0, 330, 120, 60) },
  { commitmentId: "commitment:visual-pair", nodeId: "visual-pair", kind: "visual-relationship", semanticTargetNodeIds: ["whop-1"], semanticRegionIds: [], relationIds: [], sourceEvidenceIds: [], provenanceNodeIds: ["awin-1"], boundsAfter: rect(230, 120, 80, 40) },
  { commitmentId: "commitment:unrelated-note", nodeId: "unrelated-note", kind: "authored-object", semanticTargetNodeIds: [], semanticRegionIds: [], relationIds: [], sourceEvidenceIds: [], provenanceNodeIds: [], boundsAfter: rect(600, 300, 120, 70) },
];

function auditInput(input: {
  currentMutation: NorthstarArtboardMutationBatch;
  beforeGraph?: NorthstarCumulativeIntentGraphView;
  afterGraph?: NorthstarCumulativeIntentGraphView;
  beforeNodes?: NorthstarCommittedSemanticNode[];
  afterNodes?: NorthstarCommittedSemanticNode[];
  previous?: NorthstarCumulativeIntentAudit;
  authoredRelations?: NorthstarAuthoredDesignRelation[];
  beforeHtml?: string;
  afterHtml?: string;
  acceptedGrounding?: BuildNorthstarCumulativeIntentAuditInput["acceptedGrounding"];
}): BuildNorthstarCumulativeIntentAuditInput {
  const authoredRelations = input.authoredRelations ?? relations();
  return {
    turn: 6,
    instruction: "Make two groups clearer",
    beforePackage: packageValue("before", authoredRelations, input.beforeHtml ?? ""),
    beforeAcknowledgement: acknowledgement("before", input.beforeNodes ?? snapshotNodes(), authoredRelations),
    beforeGraph: input.beforeGraph ?? graph(),
    currentMutation: input.currentMutation,
    afterPackage: packageValue("after", authoredRelations, input.afterHtml ?? input.beforeHtml ?? ""),
    afterAcknowledgement: acknowledgement("after", input.afterNodes ?? snapshotNodes(), authoredRelations),
    afterGraph: input.afterGraph ?? graph(),
    previousAudit: input.previous ?? previousAudit(priorCommitments),
    acceptedGrounding: input.acceptedGrounding,
  };
}

test("group edits expose members and prior dependants without making the whole artboard editable", () => {
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      operations: [
        { op: "set-styles", targetId: "flow-awin", styles: { background: "#eef" } },
        { op: "set-styles", targetId: "flow-whop", styles: { background: "#eee" } },
      ],
    }),
  }));

  assert.deepEqual(result.directEditScope.directNodeIds, ["flow-awin", "flow-whop"]);
  assert.deepEqual(result.directEditScope.structuralMemberNodeIds, ["awin-1", "awin-2", "whop-1", "whop-2"]);
  assert.deepEqual(result.affectedComposition.continuityDependentCommitmentIds, [
    "commitment:connector",
    "commitment:gap-note",
    "commitment:role-note",
    "commitment:visual-pair",
  ]);
  assert.ok(result.affectedComposition.unrelatedCommitmentIds.includes("commitment:hello-card"));
  assert.ok(result.affectedComposition.unrelatedCommitmentIds.includes("commitment:unrelated-note"));
  assert.ok(!result.directEditScope.directNodeIds.includes("evidence"));
  assert.ok(!result.directEditScope.directNodeIds.includes("reasoning-zone"));
  assert.equal(result.classification.everyActiveCommitmentClassifiedExactlyOnce, true);
});

test("editing one evidence item does not fan out through all region siblings", () => {
  const beforeGraph = graph();
  const afterGraph = graph({ nodeBounds: { "awin-2": rect(150, 10, 80, 100) } });
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { transform: "translateX(30px)" } }] }),
    beforeGraph,
    afterGraph,
    afterNodes: snapshotNodes({ movedAwin2: true }),
  }));

  assert.deepEqual(result.directEditScope.directNodeIds, ["awin-2"]);
  assert.deepEqual(result.directEditScope.structuralMemberNodeIds, []);
  assert.deepEqual(result.affectedComposition.continuityDependentCommitmentIds, ["commitment:gap-note", "commitment:role-note"]);
  assert.ok(result.affectedComposition.unrelatedCommitmentIds.includes("commitment:connector"));
  assert.ok(result.affectedComposition.unrelatedCommitmentIds.includes("commitment:visual-pair"));
  assert.ok(!result.affectedComposition.geometryChangedNodeIds.includes("awin-1"));
});

test("a local turn reports material geometry drift of pre-existing content outside its explained scope", () => {
  const beforeGraph = graph();
  const afterGraph = graph({ nodeBounds: { "awin-2": rect(150, 10, 80, 100) } });
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-text", targetId: "hello-card", text: "Hello World" }] }),
    beforeGraph,
    afterGraph,
    afterNodes: snapshotNodes({ movedAwin2: true }),
  }));

  const finding = result.affectedComposition.collateralGeometryFindings?.find((entry) => entry.nodeId === "awin-2");
  assert.ok(finding);
  assert.equal(finding.originTurn, 6);
  assert.equal(finding.baselineBounds.left, 120);
  assert.equal(finding.renderedBounds.left, 150);
  assert.equal(finding.delta.left, 30);
  assert.equal(finding.changeKind, "position-only");
  assert.equal(finding.explicitlyOwnedInCurrentMutation, false);
  assert.ok(!result.affectedComposition.collateralGeometryFindings?.some((entry) => entry.nodeId === "hello-card"));
});

test("geometry directly owned by the turn is not mislabeled as collateral", () => {
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { left: "150px" } }] }),
    beforeGraph: graph(),
    afterGraph: graph({ nodeBounds: { "awin-2": rect(150, 10, 80, 100) } }),
    afterNodes: snapshotNodes({ movedAwin2: true }),
  }));
  assert.ok(!result.affectedComposition.collateralGeometryFindings?.some((entry) => entry.nodeId === "awin-2"));
});

test("directly targeting protected evidence does not excuse a rendered size change", () => {
  const resizedAwin2 = snapshotNodes().map((node) => node.nodeId === "awin-2"
    ? { ...node, bounds: rect(150, 10, 70, 100) }
    : node);
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { left: "150px", width: "70px" } }] }),
    beforeGraph: graph(),
    afterGraph: graph({ nodeBounds: { "awin-2": rect(150, 10, 70, 100) } }),
    afterNodes: resizedAwin2,
  }));
  const finding = result.affectedComposition.collateralGeometryFindings?.find((entry) => entry.nodeId === "awin-2");
  assert.ok(finding);
  assert.equal(finding.changeKind, "size-or-shape");
  assert.equal(finding.explicitlyOwnedInCurrentMutation, true);
  assert.equal(finding.delta.width, -10);
});

test("derived collective region bounds may change when the turn intentionally moves a region member", () => {
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { left: "150px" } }] }),
    beforeGraph: graph(),
    afterGraph: graph({
      evidenceBounds: rect(0, 0, 530, 300),
      awinBounds: rect(0, 0, 250, 130),
      nodeBounds: { "awin-2": rect(150, 10, 80, 100) },
    }),
    afterNodes: snapshotNodes({ movedAwin2: true }),
  }));
  const collateralNodeIds = result.affectedComposition.collateralGeometryFindings?.map((entry) => entry.nodeId) ?? [];
  assert.ok(!collateralNodeIds.includes("awin-2"));
  assert.ok(!collateralNodeIds.includes("flow-awin"));
  assert.ok(!collateralNodeIds.includes("evidence"));
});

test("derived collective region drift remains collateral when an unrelated turn moved the member", () => {
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-text", targetId: "hello-card", text: "Hello World" }] }),
    beforeGraph: graph(),
    afterGraph: graph({
      evidenceBounds: rect(0, 0, 530, 300),
      awinBounds: rect(0, 0, 250, 130),
      nodeBounds: { "awin-2": rect(150, 10, 80, 100) },
    }),
    afterNodes: snapshotNodes({ movedAwin2: true }),
  }));
  const collateralNodeIds = result.affectedComposition.collateralGeometryFindings?.map((entry) => entry.nodeId) ?? [];
  assert.ok(collateralNodeIds.includes("awin-2"));
  assert.ok(collateralNodeIds.includes("flow-awin"));
  assert.ok(collateralNodeIds.includes("evidence"));
});

test("same-turn repair may explicitly adopt a position-only collateral displacement", () => {
  const shiftedGraph = graph({ nodeBounds: { "awin-2": rect(150, 10, 80, 100) } });
  const initial = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-text", targetId: "hello-card", text: "Hello World" }] }),
    beforeGraph: graph(),
    afterGraph: shiftedGraph,
    afterNodes: snapshotNodes({ movedAwin2: true }),
  }));
  assert.ok(initial.affectedComposition.collateralGeometryFindings?.some((entry) => entry.nodeId === "awin-2"));

  const stillShifted = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { left: "150px" } }] }),
    beforeGraph: shiftedGraph,
    afterGraph: shiftedGraph,
    beforeNodes: snapshotNodes({ movedAwin2: true }),
    afterNodes: snapshotNodes({ movedAwin2: true }),
    previous: initial,
  }));
  assert.ok(!stillShifted.affectedComposition.collateralGeometryFindings?.some((entry) => entry.nodeId === "awin-2"));
});

test("same-turn repair carries protected evidence size damage until exact dimensions are restored", () => {
  const resizedGraph = graph({ nodeBounds: { "awin-2": rect(150, 10, 70, 100) } });
  const resizedNodes = snapshotNodes().map((node) => node.nodeId === "awin-2"
    ? { ...node, bounds: rect(150, 10, 70, 100) }
    : node);
  const initial = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-text", targetId: "hello-card", text: "Hello World" }] }),
    beforeGraph: graph(),
    afterGraph: resizedGraph,
    afterNodes: resizedNodes,
  }));
  assert.equal(
    initial.affectedComposition.collateralGeometryFindings?.find((entry) => entry.nodeId === "awin-2")?.changeKind,
    "size-or-shape",
  );

  const explicitlyMovedButStillResized = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { left: "160px", width: "70px" } }] }),
    beforeGraph: resizedGraph,
    afterGraph: graph({ nodeBounds: { "awin-2": rect(160, 10, 70, 100) } }),
    beforeNodes: resizedNodes,
    afterNodes: resizedNodes.map((node) => node.nodeId === "awin-2" ? { ...node, bounds: rect(160, 10, 70, 100) } : node),
    previous: initial,
  }));
  const carried = explicitlyMovedButStillResized.affectedComposition.collateralGeometryFindings?.find((entry) => entry.nodeId === "awin-2");
  assert.ok(carried);
  assert.equal(carried.changeKind, "size-or-shape");
  assert.equal(carried.explicitlyOwnedInCurrentMutation, true);

  const restored = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { left: "160px", width: "80px" } }] }),
    beforeGraph: resizedGraph,
    afterGraph: graph({ nodeBounds: { "awin-2": rect(160, 10, 80, 100) } }),
    beforeNodes: resizedNodes,
    afterNodes: snapshotNodes().map((node) => node.nodeId === "awin-2" ? { ...node, bounds: rect(160, 10, 80, 100) } : node),
    previous: explicitlyMovedButStillResized,
  }));
  assert.ok(!restored.affectedComposition.collateralGeometryFindings?.some((entry) => entry.nodeId === "awin-2"));
});

test("collective-anchor dependants are included only when the collective bounds actually change", () => {
  const unchanged = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "flow-awin", styles: { background: "#eef" } }] }),
  }));
  assert.ok(unchanged.affectedComposition.unrelatedCommitmentIds.includes("commitment:hello-card"));

  const changed = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "flow-awin", styles: { padding: "20px" } }] }),
    beforeGraph: graph(),
    afterGraph: graph({ evidenceBounds: rect(0, 0, 540, 330), awinBounds: rect(0, 0, 260, 150) }),
  }));
  assert.ok(changed.affectedComposition.continuityDependentCommitmentIds.includes("commitment:hello-card"));
  assert.ok(changed.affectedComposition.dependencyPaths.some((path) => path.fromNodeId === "evidence" && path.toNodeId === "hello-card" && path.reason === "changed-collective-anchor"));
});

test("visual-only relationship provenance survives without a typed runtime relation", () => {
  const typedRelations = relations().filter((relation) => relation.subjectId !== "visual-pair");
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-1", styles: { left: "20px" } }] }),
    authoredRelations: typedRelations,
  }));
  assert.ok(result.affectedComposition.continuityDependentCommitmentIds.includes("commitment:visual-pair"));
  assert.ok(result.affectedComposition.dependencyPaths.some((path) => path.fromNodeId === "awin-1" && path.toNodeId === "visual-pair" && path.reason === "provenance-source"));
});

test("reused evidence remains one presentation commitment with source provenance", () => {
  const first = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      id: "mutation-reuse",
      operations: [{
        op: "insert-html",
        targetId: "artboard",
        position: "beforeend",
        html: '<div data-ns-node-id="reused-awin-2" data-ns-evidence-id="e-awin-2" data-ns-source-node-id="awin-2"></div>',
      }],
    }),
    afterNodes: snapshotNodes({ includeReused: true }),
    afterGraph: graph(),
  }));
  const reused = first.activeCommitmentLedger.find((commitment) => commitment.nodeId === "reused-awin-2");
  assert.equal(reused?.kind, "reused-evidence-presentation");
  assert.deepEqual(reused?.sourceEvidenceIds, ["e-awin-2"]);
  assert.deepEqual(reused?.provenanceNodeIds, ["awin-2"]);

  const second = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { left: "150px" } }] }),
    beforeNodes: snapshotNodes({ includeReused: true }),
    afterNodes: snapshotNodes({ includeReused: true, movedAwin2: true }),
    beforeGraph: graph(),
    afterGraph: graph({ nodeBounds: { "awin-2": rect(150, 10, 80, 100) } }),
    previous: first,
  }));
  assert.ok(second.affectedComposition.continuityDependentCommitmentIds.includes("commitment:reused-awin-2"));
});

test("accepted structured grounding reconstructs a semantic target without changing execution", () => {
  const first = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      id: "mutation-grounded-card",
      operations: [{
        op: "insert-html",
        targetId: "artboard",
        position: "beforeend",
        html: '<div data-ns-node-id="grounded-card">Grounded</div>',
      }],
    }),
    previous: previousAudit([]),
    afterNodes: [
      ...snapshotNodes().filter((node) => node.nodeId !== "hello-card"),
      semanticNode({ nodeId: "grounded-card", parentId: "artboard", bounds: rect(0, 330, 120, 60) }),
    ],
    acceptedGrounding: {
      conceptId: "research",
      resolvedNodeId: "evidence",
      requestedRelation: "below",
      evidenceNodeIds: ["evidence"],
      expectedPreservedNodeIds: ["evidence"],
    },
  }));

  const card = first.activeCommitmentLedger.find((commitment) => commitment.nodeId === "grounded-card");
  assert.deepEqual(card?.semanticTargetNodeIds, ["evidence"]);
  assert.equal(card?.grounding?.source, "accepted-model-grounding");
  assert.equal(card?.grounding?.requestedRelation, "below");
  assert.deepEqual(first.resolutionWarnings, []);

  const changed = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "flow-awin", styles: { padding: "20px" } }] }),
    beforeGraph: graph(),
    afterGraph: graph({ evidenceBounds: rect(0, 0, 540, 330), awinBounds: rect(0, 0, 260, 150) }),
    previous: first,
    beforeNodes: [
      ...snapshotNodes().filter((node) => node.nodeId !== "hello-card"),
      semanticNode({ nodeId: "grounded-card", parentId: "artboard", bounds: rect(0, 330, 120, 60) }),
    ],
    afterNodes: [
      ...snapshotNodes().filter((node) => node.nodeId !== "hello-card"),
      semanticNode({ nodeId: "grounded-card", parentId: "artboard", bounds: rect(0, 330, 120, 60) }),
    ],
  }));
  assert.ok(changed.affectedComposition.continuityDependentCommitmentIds.includes("commitment:grounded-card"));
  assert.ok(changed.affectedComposition.dependencyPaths.some((path) =>
    path.fromNodeId === "evidence"
    && path.toNodeId === "grounded-card"
    && path.reason === "grounding-target-geometry-changed"));
});

test("explicit authored targets remain authoritative over accepted grounding", () => {
  const explicitRelation: NorthstarAuthoredDesignRelation = {
    id: "rel-explicit-card",
    subjectId: "explicit-card",
    kind: "relative-placement",
    references: [{ role: "reference", nodeId: "evidence" }],
    parameters: { side: "below" },
    realizationPolicy: "live",
  };
  const authoredRelations = [...relations(), explicitRelation];
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      operations: [{
        op: "insert-html",
        targetId: "artboard",
        position: "beforeend",
        html: '<div data-ns-node-id="explicit-card">Explicit</div>',
      }],
      relations: [explicitRelation],
    }),
    authoredRelations,
    previous: previousAudit([]),
    afterNodes: [
      ...snapshotNodes(),
      semanticNode({ nodeId: "explicit-card", parentId: "artboard", bounds: rect(0, 330, 120, 60) }),
    ],
    acceptedGrounding: {
      conceptId: "research",
      resolvedNodeId: "evidence",
      requestedRelation: "below",
      evidenceNodeIds: ["evidence"],
      expectedPreservedNodeIds: ["evidence"],
    },
  }));
  const card = result.activeCommitmentLedger.find((commitment) => commitment.nodeId === "explicit-card");
  assert.deepEqual(card?.semanticTargetNodeIds, ["evidence"]);
  assert.equal(card?.grounding?.source, "explicit-authored-relation");
  assert.ok(!result.resolutionWarnings.some((warning) => warning.code === "grounding-conflicts-with-explicit-target"));
});

test("exact canonical asset reuse resolves provenance without fuzzy matching", () => {
  const canonicalUrl = "https://assets.example.test/awin/role-selection.png";
  const beforeHtml = `<main data-ns-node-id="artboard"><figure data-ns-node-id="awin-2"><img src="${canonicalUrl}"></figure></main>`;
  const afterHtml = `<main data-ns-node-id="artboard"><figure data-ns-node-id="awin-2"><img src="${canonicalUrl}"></figure><section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-exact"><img src="${canonicalUrl}"></figure></section></main>`;
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      id: "mutation-exact-reuse",
      operations: [{
        op: "insert-html",
        targetId: "artboard",
        position: "beforeend",
        html: `<section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-exact"><img src="${canonicalUrl}"></figure></section>`,
      }],
    }),
    previous: previousAudit([]),
    beforeHtml,
    afterHtml,
    afterNodes: [
      ...snapshotNodes(),
      semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: rect(0, 330, 300, 160) }),
      semanticNode({ nodeId: "reused-exact", parentId: "analysis-area", bounds: rect(10, 350, 80, 100) }),
    ],
    acceptedGrounding: {
      conceptId: "evidence-reuse",
      resolvedNodeId: "awin-2",
      requestedRelation: "reuses",
      evidenceNodeIds: ["awin-2"],
      expectedPreservedNodeIds: ["awin-2"],
    },
  }));

  const analysis = result.activeCommitmentLedger.find((commitment) => commitment.nodeId === "analysis-area");
  assert.deepEqual(analysis?.semanticTargetNodeIds, ["awin-2"]);
  assert.equal(analysis?.grounding?.source, "accepted-model-grounding");

  const reused = result.activeCommitmentLedger.find((commitment) => commitment.nodeId === "reused-exact");
  assert.equal(reused?.kind, "reused-evidence-presentation");
  assert.equal(reused?.provenanceResolution?.status, "exact-canonical-asset-match");
  assert.equal(reused?.provenanceResolution?.sourcePresentationNodeId, "awin-2");
  assert.equal(reused?.provenanceResolution?.sourceEvidenceId, "e-awin-2");
  assert.deepEqual(reused?.provenanceNodeIds, ["awin-2"]);
  assert.deepEqual(reused?.sourceEvidenceIds, ["e-awin-2"]);
  assert.deepEqual(result.resolutionWarnings, []);
});

test("exact reuse provenance becomes a continuity dependency when its canonical source changes", () => {
  const canonicalUrl = "https://assets.example.test/awin/role-selection.png";
  const beforeHtml = `<main data-ns-node-id="artboard"><figure data-ns-node-id="awin-2"><img src="${canonicalUrl}"></figure></main>`;
  const afterHtml = `<main data-ns-node-id="artboard"><figure data-ns-node-id="awin-2"><img src="${canonicalUrl}"></figure><section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-exact"><img src="${canonicalUrl}"></figure></section></main>`;
  const reuseAudit = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      operations: [{ op: "insert-html", targetId: "artboard", position: "beforeend", html: `<section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-exact"><img src="${canonicalUrl}"></figure></section>` }],
    }),
    previous: previousAudit([]),
    beforeHtml,
    afterHtml,
    afterNodes: [
      ...snapshotNodes(),
      semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: rect(0, 330, 300, 160) }),
      semanticNode({ nodeId: "reused-exact", parentId: "analysis-area", bounds: rect(10, 350, 80, 100) }),
    ],
    acceptedGrounding: { conceptId: "evidence-reuse", resolvedNodeId: "awin-2", requestedRelation: "reuses", evidenceNodeIds: ["awin-2"], expectedPreservedNodeIds: ["awin-2"] },
  }));

  const changed = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "awin-2", styles: { transform: "translateX(30px)" } }] }),
    previous: reuseAudit,
    beforeHtml: afterHtml,
    afterHtml,
    beforeNodes: [
      ...snapshotNodes(),
      semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: rect(0, 330, 300, 160) }),
      semanticNode({ nodeId: "reused-exact", parentId: "analysis-area", bounds: rect(10, 350, 80, 100) }),
    ],
    afterNodes: [
      ...snapshotNodes({ movedAwin2: true }),
      semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: rect(0, 330, 300, 160) }),
      semanticNode({ nodeId: "reused-exact", parentId: "analysis-area", bounds: rect(10, 350, 80, 100) }),
    ],
    beforeGraph: graph(),
    afterGraph: graph({ nodeBounds: { "awin-2": rect(150, 10, 80, 100) } }),
  }));
  assert.ok(changed.affectedComposition.continuityDependentCommitmentIds.includes("commitment:reused-exact"));
  assert.ok(changed.affectedComposition.dependencyPaths.some((path) =>
    path.fromNodeId === "awin-2"
    && path.toNodeId === "reused-exact"
    && path.reason === "canonical-provenance-source-changed"));
});

test("ambiguous and non-exact reuse assets are reported without selecting a source", () => {
  const sharedUrl = "https://assets.example.test/shared.png";
  const beforeHtml = `<main data-ns-node-id="artboard"><figure data-ns-node-id="awin-1"><img src="${sharedUrl}"></figure><figure data-ns-node-id="awin-2"><img src="${sharedUrl}"></figure></main>`;
  const ambiguousHtml = `${beforeHtml.slice(0, -7)}<section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-ambiguous"><img src="${sharedUrl}"></figure></section></main>`;
  const ambiguous = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      operations: [{ op: "insert-html", targetId: "artboard", position: "beforeend", html: `<section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-ambiguous"><img src="${sharedUrl}"></figure></section>` }],
    }),
    previous: previousAudit([]),
    beforeHtml,
    afterHtml: ambiguousHtml,
    afterNodes: [
      ...snapshotNodes(),
      semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: rect(0, 330, 300, 160) }),
      semanticNode({ nodeId: "reused-ambiguous", parentId: "analysis-area", bounds: rect(10, 350, 80, 100) }),
    ],
    acceptedGrounding: { conceptId: "evidence-reuse", resolvedNodeId: "awin-2", requestedRelation: "reuses", evidenceNodeIds: ["awin-2"], expectedPreservedNodeIds: ["awin-2"] },
  }));
  const ambiguousReuse = ambiguous.activeCommitmentLedger.find((commitment) => commitment.nodeId === "reused-ambiguous");
  assert.equal(ambiguousReuse?.provenanceResolution?.status, "ambiguous");
  assert.deepEqual(ambiguousReuse?.provenanceNodeIds, []);
  assert.ok(ambiguous.resolutionWarnings.some((warning) => warning.code === "reuse-provenance-ambiguous" && warning.nodeId === "reused-ambiguous"));

  const nearUrl = "https://assets.example.test/awin/role-selection-copy.png";
  const missingHtml = `${beforeHtml.slice(0, -7)}<section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-missing"><img src="${nearUrl}"></figure></section></main>`;
  const missing = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({
      operations: [{ op: "insert-html", targetId: "artboard", position: "beforeend", html: `<section data-ns-node-id="analysis-area"><figure data-ns-node-id="reused-missing"><img src="${nearUrl}"></figure></section>` }],
    }),
    previous: previousAudit([]),
    beforeHtml,
    afterHtml: missingHtml,
    afterNodes: [
      ...snapshotNodes(),
      semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: rect(0, 330, 300, 160) }),
      semanticNode({ nodeId: "reused-missing", parentId: "analysis-area", bounds: rect(10, 350, 80, 100) }),
    ],
    acceptedGrounding: { conceptId: "evidence-reuse", resolvedNodeId: "awin-2", requestedRelation: "reuses", evidenceNodeIds: ["awin-2"], expectedPreservedNodeIds: ["awin-2"] },
  }));
  const missingReuse = missing.activeCommitmentLedger.find((commitment) => commitment.nodeId === "reused-missing");
  assert.equal(missingReuse?.provenanceResolution?.status, "missing");
  assert.deepEqual(missingReuse?.provenanceNodeIds, []);
  assert.ok(missing.resolutionWarnings.some((warning) => warning.code === "reuse-provenance-missing" && warning.nodeId === "reused-missing"));
});

test("removed authored objects retire instead of remaining active", () => {
  const result = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation: batch({ operations: [{ op: "remove", targetId: "unrelated-note" }] }),
    afterNodes: snapshotNodes({ includeUnrelated: false }),
  }));
  assert.ok(result.retiredCommitmentIds.includes("commitment:unrelated-note"));
  assert.ok(!result.activeCommitmentLedger.some((commitment) => commitment.nodeId === "unrelated-note"));
});

test("audit construction is deterministic and does not mutate any execution input", () => {
  const input = auditInput({
    currentMutation: batch({ operations: [{ op: "set-styles", targetId: "flow-awin", styles: { background: "#eef" } }] }),
  });
  const before = structuredClone(input);
  const first = buildNorthstarCumulativeIntentAudit(input);
  const second = buildNorthstarCumulativeIntentAudit(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.executionInfluence, {
    modelInput: "none",
    modelResponse: "none",
    mutation: "none",
    browserRuntime: "none",
    commitDecision: "none",
  });
});

test("audit telemetry is not included in the model input path", () => {
  const root = process.cwd();
  const resetSource = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");
  const modelInputStart = resetSource.indexOf("export function buildNorthstarDesignResetModelInput");
  const modelInputEnd = resetSource.indexOf("export function sanitizeNorthstarDesignResetModelResponse", modelInputStart);
  const modelInputSource = resetSource.slice(modelInputStart, modelInputEnd);
  assert.ok(modelInputStart >= 0 && modelInputEnd > modelInputStart);
  assert.doesNotMatch(modelInputSource, /cumulativeIntentAudit|buildNorthstarCumulativeIntentAudit/);

  const auditSource = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-cumulative-intent-audit.ts"), "utf8");
  assert.doesNotMatch(auditSource, /NORTHSTAR_DESIGN_RESET_INSTRUCTION_BY_TURN|turn\s*===|first Awin|first Whop|Hello World|Role Selection Gate|recomposablePresentationNodeIds/);
  assert.match(resetSource, /try \{[\s\S]*buildNorthstarCumulativeIntentAudit[\s\S]*catch \(error\)/);
  assert.match(resetSource, /cumulativeIntentAuditFailure/);
});

test("spatial exposure ignores non-painted SVG wrappers and uses addressed primitive bounds", () => {
  const wrapperBounds = rect(0, 0, 500, 500);
  const clearPathBounds = rect(20, 20, 10, 100);
  const intersectingPathBounds = rect(320, 320, 10, 50);
  const analysisBounds = rect(300, 300, 100, 100);
  const baseGraph = graph();
  const graphWith = (pathBounds: ReturnType<typeof rect>): NorthstarCumulativeIntentGraphView => ({
    ...baseGraph,
    nodes: [
      ...baseGraph.nodes,
      { nodeId: "svg-wrapper", parentId: "artboard", bounds: wrapperBounds },
      { nodeId: "svg-path", parentId: "svg-wrapper", bounds: pathBounds },
      { nodeId: "analysis-area", parentId: "artboard", bounds: analysisBounds },
    ],
  });
  const nodesWith = (pathBounds: ReturnType<typeof rect>, includeAnalysis: boolean) => [
    ...snapshotNodes(),
    semanticNode({ nodeId: "svg-wrapper", parentId: "artboard", bounds: wrapperBounds, attributes: { "data-ns-authored-relationship": "true" } }),
    semanticNode({ nodeId: "svg-path", parentId: "svg-wrapper", bounds: pathBounds, attributes: { "data-ns-authored-relationship": "true" } }),
    ...(includeAnalysis ? [semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: analysisBounds })] : []),
  ];
  const commitments: NorthstarCumulativeIntentCommitment[] = [
    { commitmentId: "commitment:svg-wrapper", nodeId: "svg-wrapper", kind: "visual-relationship", semanticTargetNodeIds: [], semanticRegionIds: [], relationIds: [], sourceEvidenceIds: [], provenanceNodeIds: [], boundsAfter: wrapperBounds },
    { commitmentId: "commitment:svg-path", nodeId: "svg-path", parentNodeId: "svg-wrapper", kind: "visual-relationship", semanticTargetNodeIds: [], semanticRegionIds: [], relationIds: [], sourceEvidenceIds: [], provenanceNodeIds: [], boundsAfter: clearPathBounds },
  ];
  const beforeHtml = '<main data-ns-node-id="artboard"><svg data-ns-node-id="svg-wrapper" style="position:absolute;left:0;top:0;width:500px;height:500px;pointer-events:none"><path data-ns-node-id="svg-path" d="M20 20 L30 120" fill="none" stroke="#05f"></path></svg></main>';
  const afterHtml = beforeHtml.replace("</main>", '<section data-ns-node-id="analysis-area">Analysis</section></main>');
  const currentMutation = batch({
    operations: [{ op: "insert-html", targetId: "artboard", position: "beforeend", html: '<section data-ns-node-id="analysis-area">Analysis</section>' }],
  });

  const clear = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation,
    previous: previousAudit(commitments),
    beforeHtml,
    afterHtml,
    beforeNodes: nodesWith(clearPathBounds, false),
    afterNodes: nodesWith(clearPathBounds, true),
    beforeGraph: graphWith(clearPathBounds),
    afterGraph: graphWith(clearPathBounds),
  }));
  assert.ok(!clear.affectedComposition.spatiallyExposedCommitmentIds.includes("commitment:svg-wrapper"));
  assert.ok(!clear.affectedComposition.spatiallyExposedCommitmentIds.includes("commitment:svg-path"));

  const intersecting = buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation,
    previous: previousAudit([
      commitments[0],
      { ...commitments[1], boundsAfter: intersectingPathBounds },
    ]),
    beforeHtml,
    afterHtml,
    beforeNodes: nodesWith(intersectingPathBounds, false),
    afterNodes: nodesWith(intersectingPathBounds, true),
    beforeGraph: graphWith(intersectingPathBounds),
    afterGraph: graphWith(intersectingPathBounds),
  }));
  assert.ok(!intersecting.affectedComposition.spatiallyExposedCommitmentIds.includes("commitment:svg-wrapper"));
  assert.ok(intersecting.affectedComposition.spatiallyExposedCommitmentIds.includes("commitment:svg-path"));
  assert.ok(intersecting.affectedComposition.spatialExposurePairs.some((pair) => pair.exposedNodeId === "svg-path"));
});

test("SVG wrappers fall back to their bounds only for visible wrapper surfaces or unaddressed painted primitives", () => {
  const wrapperBounds = rect(0, 0, 500, 500);
  const analysisBounds = rect(300, 300, 100, 100);
  const baseGraph = graph();
  const extendedGraph: NorthstarCumulativeIntentGraphView = {
    ...baseGraph,
    nodes: [
      ...baseGraph.nodes,
      { nodeId: "svg-wrapper", parentId: "artboard", bounds: wrapperBounds },
      { nodeId: "analysis-area", parentId: "artboard", bounds: analysisBounds },
    ],
  };
  const beforeNodes = [
    ...snapshotNodes(),
    semanticNode({ nodeId: "svg-wrapper", parentId: "artboard", bounds: wrapperBounds, attributes: { "data-ns-authored-relationship": "true" } }),
  ];
  const afterNodes = [...beforeNodes, semanticNode({ nodeId: "analysis-area", parentId: "artboard", bounds: analysisBounds })];
  const previous = previousAudit([{
    commitmentId: "commitment:svg-wrapper",
    nodeId: "svg-wrapper",
    kind: "visual-relationship",
    semanticTargetNodeIds: [],
    semanticRegionIds: [],
    relationIds: [],
    sourceEvidenceIds: [],
    provenanceNodeIds: [],
    boundsAfter: wrapperBounds,
  }]);
  const currentMutation = batch({
    operations: [{ op: "insert-html", targetId: "artboard", position: "beforeend", html: '<section data-ns-node-id="analysis-area">Analysis</section>' }],
  });
  const run = (svgMarkup: string) => buildNorthstarCumulativeIntentAudit(auditInput({
    currentMutation,
    previous,
    beforeHtml: `<main data-ns-node-id="artboard">${svgMarkup}</main>`,
    afterHtml: `<main data-ns-node-id="artboard">${svgMarkup}<section data-ns-node-id="analysis-area">Analysis</section></main>`,
    beforeNodes,
    afterNodes,
    beforeGraph: extendedGraph,
    afterGraph: extendedGraph,
  }));

  const unaddressedPrimitive = run('<svg data-ns-node-id="svg-wrapper"><path d="M0 0 L500 500" fill="none" stroke="#05f"></path></svg>');
  assert.ok(unaddressedPrimitive.affectedComposition.spatiallyExposedCommitmentIds.includes("commitment:svg-wrapper"));

  const visibleSurface = run('<svg data-ns-node-id="svg-wrapper" style="background:#fff"><path data-ns-node-id="addressed-path" d="M0 0 L10 10" fill="none" stroke="#05f"></path></svg>');
  assert.ok(visibleSurface.affectedComposition.spatiallyExposedCommitmentIds.includes("commitment:svg-wrapper"));
});
