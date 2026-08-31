import { assertCanvasV2ArtifactDocument } from "@/lib/canvas-v2/artifact-safety";
import { findCanvasV2SourceNodeRange } from "@/lib/canvas-v2/source-patch";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

const STAGE_COUNT_WORDS = new Map([
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
]);

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function declaredStageCount(value: string): number | undefined {
  const match = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})(?:[-\s]+)stages?\b/i.exec(value);
  if (!match) return undefined;
  const normalized = match[1].toLowerCase();
  const count = STAGE_COUNT_WORDS.get(normalized) ?? Number(normalized);
  return Number.isInteger(count) && count >= 2 && count <= 24 ? count : undefined;
}

function exactScreenWitnessExists(source: string): boolean {
  return Array.from(source.matchAll(/<img\b([^>]*)>/gi)).some((match) => {
    const attributes = match[1];
    const role = attribute(attributes, "data-canvas-v2-evidence-role");
    const evidenceId = attribute(attributes, "data-canvas-v2-evidence-id");
    return role === "analysis-copy" && Boolean(evidenceId) && !evidenceId!.toLowerCase().startsWith("icon:");
  });
}

export interface CanvasV2WitnessAssignment {
  evidenceId: string;
  witnessGroup: string;
}

function witnessGroupContainers(document: CanvasV2ArtifactDocument, islandId: string) {
  const islandRange = findCanvasV2SourceNodeRange(document.html, islandId);
  if (!islandRange) return [];
  const islandSource = document.html.slice(islandRange.start, islandRange.end);
  return Array.from(islandSource.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)).flatMap((match) => {
    const witnessGroup = attribute(match[2], "data-canvas-v2-evidence-group");
    const nodeId = attribute(match[2], "data-canvas-v2-node-id");
    if (!witnessGroup || !nodeId) return [];
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    return range ? [{ witnessGroup, nodeId, range }] : [];
  });
}

function analysisCopyForEvidence(document: CanvasV2ArtifactDocument, islandId: string, evidenceId: string) {
  const islandRange = findCanvasV2SourceNodeRange(document.html, islandId);
  if (!islandRange) return undefined;
  const islandSource = document.html.slice(islandRange.start, islandRange.end);
  for (const match of islandSource.matchAll(/<img\b([^>]*)>/gi)) {
    const attributes = match[1];
    if (attribute(attributes, "data-canvas-v2-evidence-role") !== "analysis-copy") continue;
    if (attribute(attributes, "data-canvas-v2-evidence-id") !== evidenceId) continue;
    const nodeId = attribute(attributes, "data-canvas-v2-node-id");
    const range = nodeId ? findCanvasV2SourceNodeRange(document.html, nodeId) : undefined;
    if (nodeId && range) return { nodeId, range };
  }
}

function withWitnessGroupAttribute(source: string, witnessGroup: string): string {
  return source.replace(/^(<img\b)([^>]*)(>)/i, (_match, opening: string, attributes: string, close: string) => {
    const retained = attributes.replace(/\s*data-canvas-v2-witness-group\s*=\s*["'][^"']*["']/ig, "");
    return `${opening}${retained} data-canvas-v2-witness-group="${witnessGroup}"${close}`;
  });
}

/**
 * A selected witness belongs to an exact semantic claim, stage, cell, or
 * conclusion. The source author creates that semantic structure; the compiler
 * performs only the mechanical reparenting of the already-approved image.
 * This prevents the durable evidence inbox from becoming visible final UI.
 */
export function reconcileCanvasV2WitnessOwnership(input: {
  document: CanvasV2ArtifactDocument;
  targetIslandId: string;
  evidenceAssignments: readonly CanvasV2WitnessAssignment[];
}): CanvasV2ArtifactDocument {
  let document = input.document;
  for (const assignment of input.evidenceAssignments) {
    const groups = witnessGroupContainers(document, input.targetIslandId)
      .filter((container) => container.witnessGroup === assignment.witnessGroup);
    if (groups.length !== 1) continue;
    const witness = analysisCopyForEvidence(document, input.targetIslandId, assignment.evidenceId);
    if (!witness) continue;
    const target = groups[0];
    const source = withWitnessGroupAttribute(
      document.html.slice(witness.range.start, witness.range.end),
      assignment.witnessGroup,
    );
    const alreadyOwned = witness.range.start >= target.range.openEnd && witness.range.end <= target.range.closeStart;
    if (alreadyOwned) {
      document = assertCanvasV2ArtifactDocument({
        ...document,
        html: `${document.html.slice(0, witness.range.start)}${source}${document.html.slice(witness.range.end)}`,
      });
      continue;
    }
    const withoutWitness = `${document.html.slice(0, witness.range.start)}${document.html.slice(witness.range.end)}`;
    const refreshedTarget = findCanvasV2SourceNodeRange(withoutWitness, target.nodeId);
    if (!refreshedTarget) continue;
    document = assertCanvasV2ArtifactDocument({
      ...document,
      html: `${withoutWitness.slice(0, refreshedTarget.closeStart)}${source}${withoutWitness.slice(refreshedTarget.closeStart)}`,
    });
  }
  return document;
}

/**
 * Presence somewhere in an island is not evidence ownership. Every selected
 * item must be inside the one semantic container named by its director-owned
 * witness group, so no detached screenshot can pass as a supported finding.
 */
export function validateCanvasV2WitnessOwnershipContract(input: {
  document: CanvasV2ArtifactDocument;
  targetIslandId: string;
  evidenceAssignments: readonly CanvasV2WitnessAssignment[];
}): string[] {
  if (!input.evidenceAssignments.length) return [];
  const islandRange = findCanvasV2SourceNodeRange(input.document.html, input.targetIslandId);
  if (!islandRange) return [`Evidence-bearing island ${input.targetIslandId} is missing, so its selected witnesses cannot be tied to their claims.`];
  const containers = witnessGroupContainers(input.document, input.targetIslandId);
  const failures: string[] = [];
  const assignments = Array.from(new Map(input.evidenceAssignments.map((assignment) => [assignment.evidenceId, assignment] as const)).values());
  for (const witnessGroup of new Set(assignments.map((assignment) => assignment.witnessGroup))) {
    const owners = containers.filter((container) => container.witnessGroup === witnessGroup);
    if (!owners.length) {
      failures.push(`Witness group ${witnessGroup} has no exact identified semantic container in island ${input.targetIslandId}. Create the claim, stage, comparison cell, or conclusion carrying data-canvas-v2-evidence-group="${witnessGroup}"; a generic evidence inbox is not finished composition.`);
    } else if (owners.length > 1) {
      failures.push(`Witness group ${witnessGroup} has ${owners.length} competing containers in island ${input.targetIslandId}. Give the selected evidence one unambiguous semantic owner.`);
    }
  }
  for (const assignment of assignments) {
    const owner = containers.find((container) => container.witnessGroup === assignment.witnessGroup);
    const witness = analysisCopyForEvidence(input.document, input.targetIslandId, assignment.evidenceId);
    if (!witness) {
      failures.push(`Witness group ${assignment.witnessGroup} is missing its exact selected evidence ${assignment.evidenceId}.`);
      continue;
    }
    if (!owner) continue;
    if (witness.range.start < owner.range.openEnd || witness.range.end > owner.range.closeStart) {
      failures.push(`Selected evidence ${assignment.evidenceId} is detached from witness group ${assignment.witnessGroup}. Place the exact image inside its supporting claim container rather than leaving it in a generic inbox or unrelated lane.`);
    }
  }
  return Array.from(new Set(failures));
}

/**
 * Exact evidence ownership is compiler work, not a reason to repurchase a
 * correct visual idea. The source author chooses the stage structure and may
 * leave compiler-bound screenshots in the island inbox or cluster several in
 * one stage. Move only already-selected exact screenshot nodes into empty
 * sourced stages, preferring unowned witnesses and then surplus witnesses from
 * a stage that retains at least one. No evidence is invented or duplicated.
 */
export function reconcileCanvasV2AuthoredStageEvidence(input: {
  document: CanvasV2ArtifactDocument;
  targetIslandId: string;
  authoredVisualRoles: readonly string[];
  selectedEvidenceIds: readonly string[];
}): CanvasV2ArtifactDocument {
  if (!input.authoredVisualRoles.includes("comparison-axis") || !input.selectedEvidenceIds.length) return input.document;
  const selected = new Set(input.selectedEvidenceIds.filter((id) => !id.toLowerCase().startsWith("icon:")));
  if (!selected.size) return input.document;
  let document = input.document;

  const stageIds = () => {
    const islandRange = findCanvasV2SourceNodeRange(document.html, input.targetIslandId);
    if (!islandRange) return [];
    const islandSource = document.html.slice(islandRange.start, islandRange.end);
    return Array.from(islandSource.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)).flatMap((match) => {
      if (attribute(match[2], "data-canvas-v2-stage-evidence") !== "sourced") return [];
      const nodeId = attribute(match[2], "data-canvas-v2-node-id");
      return nodeId ? [nodeId] : [];
    });
  };

  for (const emptyStageId of stageIds()) {
    const targetRange = findCanvasV2SourceNodeRange(document.html, emptyStageId);
    if (!targetRange || exactScreenWitnessExists(document.html.slice(targetRange.start, targetRange.end))) continue;
    const islandRange = findCanvasV2SourceNodeRange(document.html, input.targetIslandId);
    if (!islandRange) break;
    const stages = stageIds().flatMap((nodeId) => {
      const range = findCanvasV2SourceNodeRange(document.html, nodeId);
      return range ? [{ nodeId, range }] : [];
    });
    const screenshots = Array.from(document.html.slice(islandRange.start, islandRange.end).matchAll(/<img\b([^>]*)>/gi)).flatMap((match) => {
      const attributes = match[1];
      const evidenceId = attribute(attributes, "data-canvas-v2-evidence-id");
      const nodeId = attribute(attributes, "data-canvas-v2-node-id");
      if (attribute(attributes, "data-canvas-v2-evidence-role") !== "analysis-copy" || !evidenceId || !nodeId || !selected.has(evidenceId)) return [];
      const range = findCanvasV2SourceNodeRange(document.html, nodeId);
      if (!range) return [];
      const owner = stages.find((stage) => range.start >= stage.range.openEnd && range.end <= stage.range.closeStart)?.nodeId;
      return [{ nodeId, evidenceId, range, owner }];
    });
    const countByOwner = new Map<string, number>();
    for (const screenshot of screenshots) {
      if (screenshot.owner) countByOwner.set(screenshot.owner, (countByOwner.get(screenshot.owner) ?? 0) + 1);
    }
    const donor = screenshots.find((screenshot) => !screenshot.owner)
      ?? screenshots.find((screenshot) => screenshot.owner !== emptyStageId && (countByOwner.get(screenshot.owner ?? "") ?? 0) > 1);
    if (!donor) continue;
    const donorSource = document.html.slice(donor.range.start, donor.range.end);
    const withoutDonor = `${document.html.slice(0, donor.range.start)}${document.html.slice(donor.range.end)}`;
    const refreshedTarget = findCanvasV2SourceNodeRange(withoutDonor, emptyStageId);
    if (!refreshedTarget) continue;
    document = assertCanvasV2ArtifactDocument({
      ...document,
      html: `${withoutDonor.slice(0, refreshedTarget.closeStart)}${donorSource}${withoutDonor.slice(refreshedTarget.closeStart)}`,
    });
  }
  return document;
}

/**
 * A grounded stage is an inspectable evidence unit, not a heading whose
 * witnesses live elsewhere. This source-level contract closes the escape hatch
 * where an author could omit the sourced marker from one hollow stage and still
 * pass a whole-axis distribution check.
 */
export function validateCanvasV2AuthoredStageEvidenceContract(input: {
  document: CanvasV2ArtifactDocument;
  authoredVisualRoles: readonly string[];
  stagePlan: string;
  selectedScreenshotEvidenceCount: number;
}): string[] {
  if (!input.authoredVisualRoles.includes("comparison-axis") || input.selectedScreenshotEvidenceCount < 1) return [];

  const expectedStageCount = declaredStageCount(input.stagePlan);
  const axisNodeIds = Array.from(input.document.html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi))
    .filter((match) => attribute(match[2], "data-canvas-v2-visual-role") === "comparison-axis")
    .flatMap((match) => {
      const nodeId = attribute(match[2], "data-canvas-v2-node-id");
      return nodeId ? [nodeId] : [];
    });
  if (!axisNodeIds.length) {
    return ["The screenshot-led comparison axis needs one exact identified container carrying data-canvas-v2-visual-role=\"comparison-axis\" so stage evidence ownership can be verified."];
  }

  const failures: string[] = [];
  const stages: Array<{ nodeId: string; kind: string; source: string }> = [];
  for (const axisNodeId of axisNodeIds) {
    const axisRange = findCanvasV2SourceNodeRange(input.document.html, axisNodeId);
    if (!axisRange) continue;
    const axisSource = input.document.html.slice(axisRange.start, axisRange.end);
    for (const match of axisSource.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
      const kind = attribute(match[2], "data-canvas-v2-stage-evidence");
      if (kind !== "sourced" && kind !== "interpretation") continue;
      const nodeId = attribute(match[2], "data-canvas-v2-node-id");
      if (!nodeId) {
        failures.push("Every comparison stage must have a unique data-canvas-v2-node-id on the same container that declares data-canvas-v2-stage-evidence.");
        continue;
      }
      const range = findCanvasV2SourceNodeRange(input.document.html, nodeId);
      if (range) stages.push({ nodeId, kind, source: input.document.html.slice(range.start, range.end) });
    }
  }

  for (const stage of stages) {
    if (stage.kind === "sourced" && !exactScreenWitnessExists(stage.source)) {
      failures.push(`Observed comparison stage ${stage.nodeId} has no exact screenshot witness inside its own stage container. Place at least one grounded analysis-copy screen in that stage; evidence elsewhere on the axis does not support this claim.`);
    }
    if (stage.kind === "interpretation" && !/\binterpretation\b/i.test(stage.source.replace(/<[^>]+>/g, " "))) {
      failures.push(`Interpretive comparison stage ${stage.nodeId} must visibly say Interpretation so a user can distinguish reasoning from observed screen evidence.`);
    }
  }

  if (expectedStageCount !== undefined) {
    if (stages.length < expectedStageCount) {
      failures.push(`The visual brief declares ${expectedStageCount} comparison stages, but only ${stages.length} stage containers declare evidence ownership. Mark every stage itself with data-canvas-v2-stage-evidence so no heading can evade witness validation.`);
    }
    const sourcedStageCount = stages.filter((stage) => stage.kind === "sourced").length;
    if (sourcedStageCount < expectedStageCount) {
      failures.push(`The screenshot-led ${expectedStageCount}-stage comparison contains only ${sourcedStageCount} sourced stages. Every stage in this grounded comparison must own a visible screenshot witness; move any purely interpretive conclusion into its later implication chapter.`);
    }
  }

  return Array.from(new Set(failures));
}
