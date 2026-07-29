// lib/canvas-ai/northstar-living-thought-theatre.ts
// Northstar Canvas v0.7.1 — reserved horizontal reasoning theatre with transaction-aware scene alignment.

import type {
  CanvasCodeArtifactDataBundle,
  NorthstarCommittedSemanticNode,
} from "@/lib/canvas-artifacts/types";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";

type Stage = "evidence" | "analysis" | "recommendation" | "refinement";

type Context = {
  stage: Stage;
  moveLabel: string;
  objective: string;
  dataBundle: CanvasCodeArtifactDataBundle;
  hypothesis?: string;
  currentTest?: string;
};

const genericComparisonTitle = /^\s*[^\n]{1,80}\s*[×xXvV][sS]?\.?\s*[^\n]{1,80}\s*$/;
const escapeHtml = (value: string) => value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type NorthstarScreenshotData = CanvasCodeArtifactDataBundle["screenshots"][number];

function evidenceCandidate(bundle: CanvasCodeArtifactDataBundle, stage: Stage): NorthstarScreenshotData | undefined {
  const screens = [...bundle.screenshots].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  if (!screens.length) return undefined;
  if (stage === "evidence") return screens[0];
  if (stage === "analysis") return screens.find((screen) => screen.frictionSignals.length > 0 || screen.trustSignals.length > 0) ?? screens[0];
  return screens.find((screen) => screen.opportunities.length > 0) ?? screens.at(-1);
}

function identityStatus(stage: Stage): string {
  if (stage === "evidence") return "Grounded evidence is entering the visible argument.";
  if (stage === "analysis") return "Patterns and tensions are being tested against the evidence.";
  if (stage === "recommendation") return "The evidence is resolving into an implication.";
  return "The composition is being verified and prepared for settlement.";
}

function thoughtCopy(context: Context): {
  hypothesis: { body: string; status: string };
  test: { body: string; status: string };
} {
  const label = context.moveLabel.trim();
  const objective = context.objective.trim();
  if (context.stage === "evidence") {
    return {
      hypothesis: {
        body: context.hypothesis?.trim() || `The strongest evidence will reveal the governing pattern behind ${objective}.`,
        status: "Working hypothesis · evidence entering",
      },
      test: {
        body: context.currentTest?.trim() || label || "Northstar is testing which grounded evidence deserves focal weight.",
        status: "What Northstar is testing · hierarchy",
      },
    };
  }
  if (context.stage === "analysis") {
    return {
      hypothesis: {
        body: context.hypothesis?.trim() || "The visible pattern becomes useful only when evidence, tension, and claim are connected.",
        status: "Working hypothesis · under test",
      },
      test: {
        body: context.currentTest?.trim() || label || "Northstar is testing the central relationship against the exact current scene.",
        status: "What Northstar is testing · relationship",
      },
    };
  }
  if (context.stage === "recommendation") {
    return {
      hypothesis: {
        body: context.hypothesis?.trim() || "The emerging synthesis should answer the viewer's central question without detaching from its proof.",
        status: "Working hypothesis · resolving",
      },
      test: {
        body: context.currentTest?.trim() || label || "Northstar is testing whether the implication is grounded, visible, and decision-useful.",
        status: "What Northstar is testing · resolution",
      },
    };
  }
  return {
    hypothesis: {
      body: context.hypothesis?.trim() || "The visual argument is resolved when temporary reasoning can be transformed or removed without losing meaning.",
      status: "Working hypothesis · settlement review",
    },
    test: {
      body: context.currentTest?.trim() || label || "Northstar is testing publication geometry, cleanup, and final-state consistency.",
      status: "What Northstar is testing · settlement",
    },
  };
}

function mediaOps(context: Context): any[] {
  const screen = evidenceCandidate(context.dataBundle, context.stage);
  const src = screen?.imageUrl ?? "";
  const title = screen?.title ?? "Grounded evidence";
  if (!src) {
    return [{ op: "set-attributes", targetId: "thought-primary-media", attributes: { class: "ns-thought__media ns-thought__media--empty", "aria-hidden": "true", "data-ns-evidence-id": null } }];
  }
  return [
    { op: "set-attributes", targetId: "thought-primary-media", attributes: { class: "ns-thought__media", "aria-hidden": null, "data-ns-evidence-id": screen?.id ?? "", "data-ns-evidence-role": context.stage === "evidence" ? "focal" : "supporting" } },
    // The insert is retained only when the media children do not yet exist. The
    // visible-scene aligner removes it on later moves and keeps the update ops.
    { op: "insert-html", targetId: "thought-primary-media", position: "beforeend", html: `<img data-ns-node-id="thought-primary-media-image" src="${escapeHtml(src)}" alt="${escapeHtml(title)}"><figcaption data-ns-node-id="thought-primary-media-caption">${escapeHtml(title)}</figcaption>` },
    { op: "set-attributes", targetId: "thought-primary-media-image", attributes: { src, alt: title } },
    { op: "set-text", targetId: "thought-primary-media-caption", text: title },
  ];
}

function semanticIdsFromHtml(html: string): Set<string> {
  return new Set([...html.matchAll(/data-ns-node-id=["']([^"']+)["']/g)].map((match) => match[1]));
}

function semanticIdsFromOperationHtml(operation: Record<string, unknown>): string[] {
  if (typeof operation.html !== "string") return [];
  return [...operation.html.matchAll(/data-ns-node-id=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

function semanticChildren(snapshot?: NorthstarCommittedSemanticNode[]): Map<string, Set<string>> {
  const children = new Map<string, Set<string>>();
  for (const node of snapshot ?? []) {
    if (!node.parentId) continue;
    const bucket = children.get(node.parentId) ?? new Set<string>();
    bucket.add(node.nodeId);
    children.set(node.parentId, bucket);
  }
  return children;
}

function semanticDescendants(
  nodeId: string,
  children: Map<string, Set<string>>,
): Set<string> {
  const result = new Set<string>();
  const queue = [...(children.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const candidate = queue.shift()!;
    if (result.has(candidate)) continue;
    result.add(candidate);
    queue.push(...(children.get(candidate) ?? []));
  }
  return result;
}

function isSemanticDescendant(
  nodeId: string,
  ancestorId: string,
  children: Map<string, Set<string>>,
): boolean {
  return nodeId === ancestorId || semanticDescendants(ancestorId, children).has(nodeId);
}

/**
 * Align an already-sanitized/compiled transaction to the exact visible scene.
 *
 * This is deliberately sequential. A later operation may target a semantic node
 * introduced by an earlier set-html, insert-html, or recompose-region operation.
 * The previous implementation built a mostly static target inventory and silently
 * discarded those dependent operations before the compiler could form an atomic
 * recomposition. The staged inventory below follows the transaction in order and
 * only removes operations that are impossible against both the committed scene and
 * the semantic nodes introduced earlier in the same transaction.
 */
export function alignNorthstarMutationToVisibleScene(
  draft: NorthstarArtboardMutationDraft,
  visibleHtml: string,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
  authoritativeNodeIds?: string[],
): NorthstarArtboardMutationDraft {
  const visible = semanticIdsFromHtml(visibleHtml);
  const available = new Set(visible);
  for (const node of semanticSnapshot ?? []) available.add(node.nodeId);
  for (const nodeId of authoritativeNodeIds ?? []) {
    const normalized = String(nodeId ?? "").trim();
    if (normalized) available.add(normalized);
  }
  const children = semanticChildren(semanticSnapshot);
  const operations: NorthstarArtboardMutationDraft["operations"] = [];
  const evacuatedRoots = new Set<string>();
  const isEvacuated = (nodeId: string): boolean => [...evacuatedRoots].some((rootId) =>
    isSemanticDescendant(nodeId, rootId, children),
  );

  for (const operation of draft.operations) {
    if (operation.op === "set-css-layer" || operation.op === "set-runtime-module" || operation.op === "request-space") {
      operations.push(operation);
      continue;
    }

    if (operation.op === "insert-html") {
      if (!available.has(operation.targetId)) continue;
      const introducedIds = semanticIdsFromOperationHtml(operation as unknown as Record<string, unknown>);
      if (introducedIds.some((id) => available.has(id))) continue;
      operations.push(operation);
      for (const id of introducedIds) available.add(id);
      continue;
    }

    if (operation.op === "set-html") {
      if (!available.has(operation.targetId)) continue;
      operations.push(operation);
      // set-html replaces only the target's children. Once the compiler has had
      // an opportunity to coalesce preservation moves, descendants that are not
      // present in the replacement must no longer be treated as valid targets.
      for (const id of semanticDescendants(operation.targetId, children)) available.delete(id);
      available.add(operation.targetId);
      for (const id of semanticIdsFromOperationHtml(operation as unknown as Record<string, unknown>)) {
        available.add(id);
      }
      continue;
    }

    if (operation.op === "recompose-region") {
      if (!available.has(operation.targetId)) continue;
      const introducedIds = semanticIdsFromOperationHtml(operation as unknown as Record<string, unknown>);
      const stagedIds = new Set([...available, ...introducedIds, operation.targetId]);
      const placementsResolve = operation.placements.every((placement) =>
        stagedIds.has(placement.targetId)
        && stagedIds.has(placement.parentId)
        && (!placement.beforeId || stagedIds.has(placement.beforeId)),
      );
      if (!placementsResolve) continue;
      operations.push(operation);
      const preservedRoots = new Set(operation.placements.map((placement) => placement.targetId));
      for (const placement of operation.placements) evacuatedRoots.add(placement.targetId);
      for (const id of semanticDescendants(operation.targetId, children)) {
        const preserved = [...preservedRoots].some((rootId) =>
          isSemanticDescendant(id, rootId, children),
        );
        if (!preserved && !isEvacuated(id)) available.delete(id);
      }
      available.add(operation.targetId);
      for (const id of introducedIds) available.add(id);
      for (const placement of operation.placements) {
        available.add(placement.targetId);
        for (const id of semanticDescendants(placement.targetId, children)) available.add(id);
      }
      for (const retiredId of operation.retireNodeIds ?? []) {
        available.delete(retiredId);
        for (const id of semanticDescendants(retiredId, children)) available.delete(id);
      }
      continue;
    }

    if (operation.op === "move") {
      if (!available.has(operation.targetId) || !available.has(operation.parentId)) continue;
      if (operation.beforeId && !available.has(operation.beforeId)) continue;
      operations.push(operation);
      evacuatedRoots.add(operation.targetId);
      continue;
    }

    if (operation.op === "remove") {
      if (!available.has(operation.targetId)) continue;
      operations.push(operation);
      if (!isEvacuated(operation.targetId)) available.delete(operation.targetId);
      for (const id of semanticDescendants(operation.targetId, children)) {
        if (!isEvacuated(id)) available.delete(id);
      }
      continue;
    }

    if (!available.has(operation.targetId)) continue;
    operations.push(operation);
  }

  return { ...draft, operations };
}

export function enrichNorthstarMutationWithLivingThoughtTheatre(draft: NorthstarArtboardMutationDraft, context: Context): NorthstarArtboardMutationDraft {
  const copy = thoughtCopy(context);
  const testedEvidence = evidenceCandidate(context.dataBundle, context.stage);
  const operations = draft.operations.filter((operation: any) => {
    if (operation.op !== "set-text" || operation.targetId !== "title") return true;
    return !genericComparisonTitle.test(String(operation.text ?? ""));
  });

  operations.push(
    { op: "set-text", targetId: "thought-primary-body", text: copy.hypothesis.body },
    { op: "set-text", targetId: "thought-primary-status", text: copy.hypothesis.status },
    { op: "set-attributes", targetId: "thought-primary", attributes: { "data-ns-thought-state": "evolving", "data-ns-current-focus": "true", "data-ns-publication-policy": "working-only", "data-ns-working-role": "hypothesis", "data-ns-hypothesis-tested-against": testedEvidence?.id ?? null } },
    { op: "set-text", targetId: "thought-secondary-body", text: copy.test.body },
    { op: "set-text", targetId: "thought-secondary-status", text: copy.test.status },
    { op: "set-attributes", targetId: "thought-secondary", attributes: { "data-ns-thought-state": "evolving", "data-ns-current-focus": "true", "data-ns-publication-policy": "working-only", "data-ns-working-role": "open-question" } },
    ...mediaOps(context),
  );

  for (const app of context.dataBundle.apps.slice(0, 8)) {
    const slug = slugify(app.name);
    if (!slug) continue;
    operations.push({ op: "set-text", targetId: `identity-${slug}-status`, text: identityStatus(context.stage) });
    operations.push({ op: "set-attributes", targetId: `identity-${slug}-status`, attributes: { "data-ns-identity-status": context.stage } });
  }

  operations.push(
    {
      op: "set-attributes",
      targetId: "artboard",
      attributes: {
        "data-ns-thought-stage": context.stage,
        "data-ns-transaction-state": "visible",
        "data-ns-canonical-surface": "true",
      },
    },
    {
      op: "set-css-layer",
      layerId: "continuous-reasoning-theatre",
      css: `.ns-scene-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:start}.ns-reasoning-zone{position:relative!important;inset:auto!important;grid-column:7/-1;grid-row:1/span 3;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:start;gap:18px;width:auto!important;min-width:0;z-index:auto!important}.ns-reasoning-zone .ns-thought{grid-column:auto!important;width:auto!important;min-width:0;margin:0!important}.ns-reasoning-zone .ns-thought__body{max-width:34ch}.ns-reasoning-zone .ns-thought__media{grid-template-columns:72px minmax(0,1fr)}.ns-reasoning-zone .ns-thought__media img{width:72px;height:54px}[data-ns-transaction-state="visible"] .ns-reasoning-zone{opacity:.92}`,
    },
  );
  return { ...draft, operations };
}

export function prepareNorthstarEditorialPublicationDraft(
  draft: NorthstarArtboardMutationDraft,
  dataBundle?: CanvasCodeArtifactDataBundle,
): NorthstarArtboardMutationDraft {
  const operations = draft.operations.filter((operation: any) => {
    if (operation.op === "set-text" && operation.targetId === "title" && genericComparisonTitle.test(String(operation.text ?? ""))) return false;
    return true;
  });
  operations.push(
    {
      op: "insert-html",
      targetId: "synthesis",
      position: "beforeend",
      html: `<aside class="ns-process-provenance" data-ns-node-id="process-provenance" data-ns-origin="working-hypothesis" data-ns-provenance="hypothesis-resolution"><span>Process trail</span><p>The working hypothesis was tested against grounded evidence and transformed into the published synthesis.</p></aside>`,
    },
    { op: "remove", targetId: "thought-primary" },
    { op: "remove", targetId: "thought-secondary" },
    { op: "remove", targetId: "thought-tertiary" },
    { op: "remove", targetId: "current-act" },
    {
      op: "set-attributes",
      targetId: "evidence-reservoir",
      attributes: {
        open: null,
        "data-ns-evidence-reservoir-state": "collapsed-for-publication",
      },
    },
  );
  for (const app of dataBundle?.apps ?? []) {
    const slug = slugify(app.name);
    if (!slug) continue;
    operations.push({ op: "set-text", targetId: `identity-${slug}-status`, text: "Evidence resolved in the published visual argument." });
    operations.push({ op: "set-attributes", targetId: `identity-${slug}-status`, attributes: { "data-ns-identity-status": "settled" } });
  }
  operations.push(
    { op: "set-attributes", targetId: "artboard", attributes: { "data-ns-transaction-state": "settled", "data-ns-publication": "verified", "data-ns-thought-stage": "settled" } },
    { op: "set-css-layer", layerId: "continuous-authorship-publication-cleanup", css: `[data-ns-publication-policy="working-only"],[data-ns-working-role="status"],[data-ns-current-focus="true"],.ns-reasoning-zone{display:none!important}.ns-process-provenance{display:flex;align-items:baseline;gap:12px;margin-top:18px;padding-top:14px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);font-size:11px;line-height:1.45;opacity:.66}.ns-process-provenance span{font-weight:800;letter-spacing:.1em;text-transform:uppercase}.ns-process-provenance p{margin:0;max-width:72ch}.ns-published-artifact .ns-role-identity{background:transparent!important;box-shadow:none!important;border-radius:0!important}[data-ns-node-id="evidence-reservoir"]:not([open]){margin-top:18px!important;padding-top:10px!important;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)!important}[data-ns-node-id="evidence-reservoir"]:not([open])>summary{font-size:9px!important;letter-spacing:.13em!important;text-transform:uppercase!important;opacity:.58!important}` },
  );
  return { ...draft, operations };
}
