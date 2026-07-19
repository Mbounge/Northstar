// lib/canvas-ai/northstar-living-thought-theatre.ts
// Northstar Canvas v0.7.0 — reserved horizontal reasoning theatre with truthful lifecycle settlement.

import type { CanvasCodeArtifactDataBundle } from "@/lib/canvas-artifacts/types";
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

function insertedSemanticIds(draft: NorthstarArtboardMutationDraft): Set<string> {
  const ids = new Set<string>();
  for (const operation of draft.operations as any[]) {
    if (operation.op !== "insert-html" || typeof operation.html !== "string") continue;
    for (const match of operation.html.matchAll(/data-ns-node-id=["']([^"']+)["']/g)) ids.add(match[1]);
  }
  return ids;
}

export function alignNorthstarMutationToVisibleScene(draft: NorthstarArtboardMutationDraft, visibleHtml: string): NorthstarArtboardMutationDraft {
  const visible = semanticIdsFromHtml(visibleHtml);
  const available = new Set(visible);
  for (const id of insertedSemanticIds(draft)) available.add(id);
  const operations = (draft.operations as any[]).filter((operation) => {
    if (operation.op === "set-css-layer") return true;
    if (operation.op === "insert-html") {
      if (!available.has(String(operation.targetId ?? ""))) return false;
      const insertedIds = typeof operation.html === "string"
        ? [...operation.html.matchAll(/data-ns-node-id=["']([^"']+)["']/g)].map((match: RegExpMatchArray) => match[1])
        : [];
      return insertedIds.every((id: string) => !visible.has(id));
    }
    for (const key of ["targetId", "parentId", "beforeId"] as const) {
      const value = typeof operation[key] === "string" ? operation[key] : "";
      if (value && !available.has(value)) return false;
    }
    return true;
  });
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
  );
  for (const app of dataBundle?.apps ?? []) {
    const slug = slugify(app.name);
    if (!slug) continue;
    operations.push({ op: "set-text", targetId: `identity-${slug}-status`, text: "Evidence resolved in the published visual argument." });
    operations.push({ op: "set-attributes", targetId: `identity-${slug}-status`, attributes: { "data-ns-identity-status": "settled" } });
  }
  operations.push(
    { op: "set-attributes", targetId: "artboard", attributes: { "data-ns-transaction-state": "settled", "data-ns-publication": "verified", "data-ns-thought-stage": "settled" } },
    { op: "set-css-layer", layerId: "continuous-authorship-publication-cleanup", css: `[data-ns-publication-policy="working-only"],[data-ns-working-role="status"],[data-ns-current-focus="true"],.ns-reasoning-zone{display:none!important}.ns-process-provenance{display:flex;align-items:baseline;gap:12px;margin-top:18px;padding-top:14px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);font-size:11px;line-height:1.45;opacity:.66}.ns-process-provenance span{font-weight:800;letter-spacing:.1em;text-transform:uppercase}.ns-process-provenance p{margin:0;max-width:72ch}.ns-published-artifact .ns-role-identity{background:transparent!important;box-shadow:none!important;border-radius:0!important}` },
  );
  return { ...draft, operations };
}
