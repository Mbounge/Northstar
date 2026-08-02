import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  remapNorthstarDesignIntelligenceEvidenceAliases,
  type NorthstarEvidenceAliasRegistry,
} from "@/lib/canvas-ai/northstar-evidence-aliases";
import {
  sanitizeNorthstarEmergentDesignIntelligence,
} from "@/lib/canvas-ai/northstar-emergent-design-intelligence";
import {
  classifyNorthstarLifecycleFailure,
  decideNorthstarRunSettlement,
} from "@/lib/canvas-ai/northstar-lifecycle-authority";
import { NorthstarBudgetExceededError } from "@/lib/canvas-ai/northstar-run-health";

function aliasRegistry(): NorthstarEvidenceAliasRegistry {
  const entries = [
    {
      alias: "screen-awin-sign-in",
      nodeId: "flow-awin-onboarding-screen-0xdb1vd",
      kind: "evidence" as const,
      label: "Awin · Sign in",
    },
    {
      alias: "screen-whop-verify-email",
      nodeId: "flow-whop-onboarding-screen-1yihji2",
      kind: "evidence" as const,
      label: "Whop · Verify email",
    },
  ];
  return {
    version: "northstar.evidence-alias-registry.v1",
    entries,
    aliasToNodeId: new Map(entries.map((entry) => [entry.alias, entry.nodeId])),
    nodeIdToAlias: new Map(entries.map((entry) => [entry.nodeId, entry.alias])),
  };
}

function healthyReceipt(revisionId: string): Record<string, unknown> {
  return {
    expectedFinalRevisionId: revisionId,
    acknowledgedFinalRevisionId: revisionId,
    materializedFinalRevisionId: revisionId,
    receivedFinal: true,
    browserAcknowledged: true,
    outerCanvasMaterialized: true,
    persistenceHealthy: true,
    pipelineSettled: true,
    renderHealthy: true,
    noHardFailures: true,
    localOperationalHealthy: true,
  };
}

test("all design-intelligence evidence aliases resolve before sanitization", () => {
  const registry = aliasRegistry();
  const evidenceIdByNodeId = new Map([
    ["flow-awin-onboarding-screen-0xdb1vd", "evidence-awin-sign-in"],
    ["flow-whop-onboarding-screen-1yihji2", "evidence-whop-verify-email"],
  ]);
  const remapped = remapNorthstarDesignIntelligenceEvidenceAliases({
    evidenceChoreography: [{
      evidenceId: "screen-awin-sign-in",
      roleInArgument: "turning point",
      visibleTreatment: "Make it focal.",
      reason: "It establishes the trust burden.",
    }],
    premiumPlan: {
      narrativeBeats: [{
        id: "proof",
        communicationRole: "evidence",
        purpose: "Show the proof.",
        evidenceIds: ["screen-awin-sign-in", "screen-whop-verify-email"],
        visibleRealization: "Opposed evidence.",
        requiredAtPublication: true,
      }],
      analyticalIntents: [{
        id: "comparison",
        question: "Where does friction occur?",
        form: "Structural comparison",
        sourceEvidenceIds: ["screen-awin-sign-in", "screen-whop-verify-email"],
        groundedClaim: "The visible steps place friction differently.",
        encoding: "structural",
        requiredAtPublication: true,
      }],
    },
  }, registry, evidenceIdByNodeId);

  assert.equal(
    remapped?.evidenceChoreography?.[0]?.evidenceId,
    "evidence-awin-sign-in",
  );
  assert.deepEqual(
    remapped?.premiumPlan?.narrativeBeats?.[0]?.evidenceIds,
    ["evidence-awin-sign-in", "evidence-whop-verify-email"],
  );
  assert.deepEqual(
    remapped?.premiumPlan?.analyticalIntents?.[0]?.sourceEvidenceIds,
    ["evidence-awin-sign-in", "evidence-whop-verify-email"],
  );
});

test("incomplete descriptive metadata is repaired without suppressing executable authorship", () => {
  const result = sanitizeNorthstarEmergentDesignIntelligence({
    evidenceChoreography: [],
    publicationStandard: [],
  }, {
    diversityAnchor: "exact-failing-run",
    groundedEvidenceIds: ["evidence-awin-sign-in", "evidence-whop-verify-email"],
  });

  assert.equal(result.evidenceChoreography.length, 2);
  assert.equal(result.publicationStandard.length, 3);
  assert.match(result.firstCreativeAct, /visibly advances the objective/i);
  assert.ok(result.normalizationRepairs.length >= 3);
});

test("an operational scaffold can never settle a required creative run", () => {
  const result = decideNorthstarRunSettlement({
    expectedFinalRevisionId: "scaffold-revision",
    serverState: {
      creativeTransformationRequired: true,
      acceptedCreativeActCount: 0,
      materialCreativeRevisionPreserved: false,
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
      revisionId: "scaffold-revision",
    },
    clientReceipt: healthyReceipt("scaffold-revision"),
  });

  assert.equal(result.terminalState, "incomplete");
  assert.equal(result.authorityReceipt.reasonCode, "CREATIVE_TRANSFORMATION_REQUIRED");
  assert.deepEqual(result.authorityReceipt.failedPredicates, [
    "browser-accepted material creative revision",
  ]);
});

test("a browser-accepted creative revision permits truthful advisory settlement", () => {
  const result = decideNorthstarRunSettlement({
    expectedFinalRevisionId: "creative-revision",
    serverState: {
      creativeTransformationRequired: true,
      acceptedCreativeActCount: 1,
      materialCreativeRevisionId: "creative-revision",
      materialCreativeRevisionPreserved: true,
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
      revisionId: "creative-revision",
    },
    clientReceipt: healthyReceipt("creative-revision"),
  });

  assert.equal(result.terminalState, "completed_with_notes");
  assert.equal(result.authorityReceipt.acceptedCreativeActCount, 1);
  assert.equal(result.authorityReceipt.materialCreativeRevisionPreserved, true);
});

test("the outer failure classifier cannot convert zero creative acts into completion", () => {
  const receipt = classifyNorthstarLifecycleFailure({
    error: new NorthstarBudgetExceededError(
      "creative-materiality",
      1,
      "No browser-accepted material creative transformation exists.",
    ),
    serverState: {
      creativeTransformationRequired: true,
      acceptedCreativeActCount: 0,
      materialCreativeRevisionPreserved: false,
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
      revisionId: "scaffold-revision",
    },
  });

  assert.equal(receipt.terminalState, "incomplete");
  assert.equal(receipt.reasonCode, "CREATIVE_TRANSFORMATION_REQUIRED");
});

test("an unexpected lineage error cannot convert a preserved scaffold into completion", () => {
  const receipt = classifyNorthstarLifecycleFailure({
    error: new Error(
      "Browser revision candidate-revision does not match requested base accepted-revision.",
    ),
    serverState: {
      creativeTransformationRequired: true,
      acceptedCreativeActCount: 0,
      materialCreativeRevisionPreserved: false,
      publicationRequired: true,
      publicationVerified: false,
      communicativelyReady: false,
      publicationClean: true,
      operationalRevisionPreserved: true,
      revisionId: "accepted-revision",
    },
  });

  assert.equal(receipt.terminalState, "incomplete");
  assert.equal(receipt.classification, "unsafe");
  assert.equal(receipt.reasonCode, "CREATIVE_TRANSFORMATION_REQUIRED");
  assert.deepEqual(receipt.failedPredicates, [
    "browser-accepted material creative revision",
  ]);
});

test("the production route carries material creative identity from browser commit to settlement", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
    "utf8",
  );
  assert.match(route, /remapNorthstarDesignIntelligenceEvidenceAliases/);
  assert.match(route, /Boolean\(creativeLeaseId\)/);
  assert.match(route, /acceptedCreativeActCount \+= 1/);
  assert.match(route, /materialCreativeRevisionId = artifact\.revisionId/);
  assert.match(route, /materialCreativeRevisionPreserved:/);
  assert.match(
    route,
    /currentSession\.acceptedActCount > 0\s+&& continuation\.readiness\.operationallyReady/,
  );
});
