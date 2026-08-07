import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { normalizeNorthstarSpatialAuthority, sanitizeNorthstarDesignResetModelResponse, type NorthstarDesignResetModelResponse } from "../lib/canvas-ai/northstar-two-turn-design-reset";

function belowResponse(operations: NorthstarDesignResetModelResponse["mutation"]["operations"]): NorthstarDesignResetModelResponse {
  return {
    turn: 1, observedBaseRevisionId: "revision-1", understanding: "Place subject below research",
    grounding: {
      conceptId: "research", resolvedNodeId: "research", requestedRelation: "below",
      placementSpace: "artboard-world", referenceContinuity: "pixel-stable", expansionDirection: "down",
      evidenceNodeIds: ["research"], expectedPreservedNodeIds: [], interpretation: "",
    },
    mutation: {
      title: "Place", description: "Place", visualStrategy: "Place", visibleChange: "Place",
      geometryIntent: "expand-vertical", transitionMs: 0, requiredPrimitives: [], operations,
      relations: [{
        id: "subject-below", subjectId: "subject", kind: "relative-placement", realizationPolicy: "live",
        references: [{ role: "reference", nodeId: "research", geometry: "semantic-descendant-union" }],
        parameters: { side: "below", alignX: "center", offsetY: 40 },
      }],
    },
  };
}

function betweenResponse(): NorthstarDesignResetModelResponse {
  const response = belowResponse([{ op: "insert-html", targetId: "artboard", position: "beforeend", html: '<aside data-ns-node-id="subject">Gap</aside>' }]);
  response.grounding.requestedRelation = "equal-space-with-annotation";
  response.grounding.resolvedNodeId = "flow";
  response.grounding.evidenceNodeIds = ["first", "second"];
  response.mutation.relations = [{
    id: "subject-between", subjectId: "subject", kind: "between-placement", realizationPolicy: "live",
    references: [{ role: "reference", nodeId: "first" }, { role: "reference", nodeId: "second" }],
    parameters: { axis: "x", crossAlign: "center" },
  }];
  return response;
}

test("directional placement requires cross-axis alignment", () => {
  const candidate = belowResponse([{ op: "set-text", targetId: "subject", text: "Subject" }]);
  delete candidate.mutation.relations![0].parameters.alignX;
  assert.match(normalizeNorthstarSpatialAuthority({ response: candidate }).issues.join(" "), /must declare alignX/);
});

test("directional placement accepts either typed reference geometry mode", () => {
  const subtree = belowResponse([{ op: "set-text", targetId: "subject", text: "Subject" }]);
  assert.deepEqual(normalizeNorthstarSpatialAuthority({ response: subtree }).issues, []);
  const ownBox = belowResponse([{ op: "set-text", targetId: "subject", text: "Subject" }]);
  ownBox.mutation.relations![0].references[0].geometry = "border-box";
  assert.deepEqual(normalizeNorthstarSpatialAuthority({ response: ownBox }).issues, []);
});

test("redundant model coordinates are normalized instead of retried", () => {
  const candidate = belowResponse([{ op: "set-styles", targetId: "subject", styles: { top: "900px", left: "40px", color: "red" } }]);
  const normalized = normalizeNorthstarSpatialAuthority({ response: candidate });
  assert.deepEqual(normalized.issues, []);
  assert.deepEqual(normalized.response.mutation.operations[0], { op: "set-styles", targetId: "subject", styles: { color: "red" } });
  assert.deepEqual(normalized.normalizedFields, ["set-styles.subject.top", "set-styles.subject.left"]);
});

test("continuation space growth is neutralized and relation ownership is retained", () => {
  const candidate = belowResponse([{ op: "request-space", left: 0, top: 0, right: 0, bottom: 600 }]);
  const normalized = normalizeNorthstarSpatialAuthority({
    response: candidate, continuation: true, existingRelations: candidate.mutation.relations,
  });
  assert.deepEqual(normalized.issues, []);
  assert.deepEqual(normalized.response.mutation.operations[0], { op: "request-space", left: 0, top: 0, right: 0, bottom: 0 });
  assert.deepEqual(normalized.normalizedFields, ["continuation.request-space"]);
});

test("continuation inherits an omitted accepted relation contract", () => {
  const accepted = belowResponse([{ op: "set-text", targetId: "subject", text: "Accepted" }]);
  const repair = belowResponse([{ op: "set-text", targetId: "subject", text: "Repaired" }]);
  repair.mutation.relations = [];
  const normalized = normalizeNorthstarSpatialAuthority({
    response: repair, continuation: true, existingRelations: accepted.mutation.relations,
  });
  assert.deepEqual(normalized.issues, []);
  assert.deepEqual(normalized.response.mutation.relations, accepted.mutation.relations);
  assert.deepEqual(normalized.normalizedFields, ["continuation.relation.subject-below.inherited"]);
});

test("continuation preserves relation identity while retaining model-owned parameters", () => {
  const accepted = belowResponse([{ op: "set-text", targetId: "subject", text: "Accepted" }]);
  const repair = belowResponse([{ op: "set-text", targetId: "subject", text: "Repaired" }]);
  repair.mutation.relations![0] = {
    ...repair.mutation.relations![0],
    id: "replacement-id",
    subjectId: "replacement-subject",
    references: [{ role: "reference", nodeId: "wrong-reference", geometry: "border-box" }],
    parameters: { side: "below", alignX: "right", offsetY: 64 },
  };
  const normalized = normalizeNorthstarSpatialAuthority({
    response: repair, continuation: true, existingRelations: accepted.mutation.relations,
  });
  assert.deepEqual(normalized.issues, []);
  assert.equal(normalized.response.mutation.relations![0].id, "subject-below");
  assert.equal(normalized.response.mutation.relations![0].subjectId, "subject");
  assert.deepEqual(normalized.response.mutation.relations![0].references, accepted.mutation.relations![0].references);
  assert.deepEqual(normalized.response.mutation.relations![0].parameters, { side: "below", alignX: "right", offsetY: 64 });
});

test("continuation restores accepted grounding before sanitizer validation", () => {
  const accepted = belowResponse([{ op: "set-text", targetId: "subject", text: "Accepted" }]);
  const repair = belowResponse([{ op: "set-text", targetId: "subject", text: "Repaired" }]);
  repair.grounding.resolvedNodeId = "subject";
  const sanitized = sanitizeNorthstarDesignResetModelResponse({
    raw: repair,
    turn: repair.turn,
    baseRevisionId: "repair-revision",
    continuation: true,
    existingRelations: accepted.mutation.relations,
  });
  assert.equal(sanitized.grounding.resolvedNodeId, "research");
  assert.deepEqual(sanitized.mutation.relations![0].references, accepted.mutation.relations![0].references);
});

test("typed relation activates authority independently of objective wording", () => {
  const candidate = belowResponse([{ op: "set-styles", targetId: "subject", styles: { top: "600px", color: "blue" } }]);
  candidate.grounding.requestedRelation = "relationship-between";
  candidate.grounding.resolvedNodeId = "subject";
  const normalized = normalizeNorthstarSpatialAuthority({ response: candidate });
  assert.deepEqual(normalized.issues, []);
  assert.deepEqual(normalized.response.mutation.operations[0], { op: "set-styles", targetId: "subject", styles: { color: "blue" } });
});

test("coordinate-only continuation is rejected before another no-op render", () => {
  const accepted = belowResponse([{ op: "set-text", targetId: "subject", text: "Accepted" }]);
  const repair = belowResponse([{ op: "set-styles", targetId: "subject", styles: { top: "980px" } }]);
  repair.grounding.requestedRelation = "relationship-between";
  const normalized = normalizeNorthstarSpatialAuthority({
    response: repair, continuation: true, existingRelations: accepted.mutation.relations,
  });
  assert.match(normalized.issues.join(" "), /only coordinates owned by the live relation/);
  assert.deepEqual(normalized.response.mutation.operations[0], { op: "set-styles", targetId: "subject", styles: {} });
});

test("ordered generic references canonicalize before between-placement validation", () => {
  const normalized = normalizeNorthstarSpatialAuthority({ response: betweenResponse() });
  assert.deepEqual(normalized.issues, []);
  assert.deepEqual(normalized.response.mutation.relations![0].references.map((reference) => reference.role), ["before", "after"]);
  assert.deepEqual(normalized.normalizedFields, [
    "relation.subject-between.references.0.role",
    "relation.subject-between.references.1.role",
  ]);
});

test("ambiguous between-placement references remain invalid", () => {
  const response = betweenResponse();
  response.mutation.relations![0].references[1].nodeId = "first";
  const normalized = normalizeNorthstarSpatialAuthority({ response });
  assert.match(normalized.issues.join(" "), /two exact grounded evidence nodes/);
});

test("connector roles and omitted connector continuations use the same lifecycle boundary", () => {
  const response = belowResponse([{ op: "set-attributes", targetId: "connector", attributes: { stroke: "blue" } }]);
  response.grounding.requestedRelation = "relationship-between";
  response.grounding.evidenceNodeIds = ["first", "second"];
  const connector = {
    id: "flow-connector", subjectId: "connector", kind: "connector-attachment", realizationPolicy: "live" as const,
    references: [{ role: "reference", nodeId: "first" }, { role: "reference", nodeId: "second" }],
    parameters: { primitiveNodeId: "connector" },
  };
  response.mutation.relations = [connector];
  const initial = normalizeNorthstarSpatialAuthority({ response });
  assert.deepEqual(initial.response.mutation.relations![0].references.map((reference) => reference.role), ["source", "target"]);
  const continuation = structuredClone(response);
  continuation.mutation.relations = [];
  const normalized = normalizeNorthstarSpatialAuthority({
    response: continuation, continuation: true, existingRelations: initial.response.mutation.relations,
  });
  assert.deepEqual(normalized.issues, []);
  assert.equal(normalized.response.mutation.relations![0].id, "flow-connector");
});

test("runtime geometry is distinguished from the model-authored relation", () => {
  const runtime = fs.readFileSync(path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"), "utf8");
  assert.match(runtime, /computed\.position === "static"[\s\S]*applyRuntimeRelationStyle\(subject, relationId, "position", "absolute"\)/);
});

test("the repair loop stops a repeated model-boundary failure", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
  assert.match(route, /const repeatedModelFailure = detail === previousLiveRepairIssue/);
  assert.match(route, /if \(repeatedModelFailure \|\| liveRepairPass === emergencyLiveRepairAttemptLimit\)[\s\S]*break;/);
  assert.match(route, /design\.reset\.spatial_authority_normalized/);
});

test("geometry policy contains no benchmark identity or turn branch", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");
  const start = source.indexOf("export function normalizeNorthstarSpatialAuthority");
  const end = source.indexOf("export function northstarAuthoredRelationRealizationIssues", start);
  const policy = source.slice(start, end);
  assert.doesNotMatch(policy, /Awin|Whop|Hello World|turn\s*===|response\.turn/i);
});

test("live border-box references include visible descendant overflow", () => {
  const runtime = fs.readFileSync(path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"), "utf8");
  const geometry = runtime.slice(runtime.indexOf("const geometryRectForReference"), runtime.indexOf("const pointForAnchor"));
  assert.match(geometry, /const union = unionClientRects/);
  assert.match(geometry, /clipsX[\s\S]*Math\.max\(own\.right, union\.right\)/);
  assert.match(geometry, /clipsY[\s\S]*Math\.max\(own\.bottom, union\.bottom\)/);
  assert.match(runtime, /MutationObserver[\s\S]*queueAuthoredRelationResolution\(\)/);
});

test("connector attachment falls through from a declared SVG container to its primitive", () => {
  const runtime = fs.readFileSync(path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"), "utf8");
  assert.match(runtime, /declaredPrimitive\?\.matches\?\.\("line,path,polyline"\)/);
  assert.match(runtime, /declaredPrimitive\?\.querySelector\?\.\("line,path,polyline"\)/);
});
