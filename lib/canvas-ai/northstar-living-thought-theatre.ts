// lib/canvas-ai/northstar-living-thought-theatre.ts
// Northstar v0.6.4.0 — centralized reasoning theatre, truthful phase status, and settlement lifecycle.

import type { CanvasCodeArtifactDataBundle } from "@/lib/canvas-artifacts/types";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";

type Stage = "evidence" | "analysis" | "recommendation" | "refinement";

type Context = {
  stage: Stage;
  moveLabel: string;
  objective: string;
  dataBundle: CanvasCodeArtifactDataBundle;
};

const genericComparisonTitle = /^\s*[^\n]{1,80}\s*[×xXvV][sS]?\.?\s*[^\n]{1,80}\s*$/;
const escapeHtml = (value: string) => value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

type NorthstarScreenshotData = CanvasCodeArtifactDataBundle["screenshots"][number];

function evidenceCandidate(bundle: CanvasCodeArtifactDataBundle, stage: Stage): NorthstarScreenshotData | undefined {
  const screens = bundle.screenshots;
  if (!screens.length) return undefined;
  if (stage === "evidence") return screens[0];
  if (stage === "analysis") {
    return screens.find((screen) => screen.frictionSignals.length > 0) ?? screens[Math.floor(screens.length / 2)];
  }
  return screens.at(-1);
}


function identityStatus(stage: Stage): string {
  if (stage === "evidence") return "Inspecting grounded flows and evidence.";
  if (stage === "analysis") return "Comparing patterns, friction, and trust signals.";
  if (stage === "recommendation") return "Resolving implications from the evidence.";
  return "Evidence resolved and composition settling.";
}

function thoughtCopy(context: Context): { headline: string; body: string; status: string } {
  const label = context.moveLabel.trim();
  if (context.stage === "evidence") return { headline: "Evidence entering the frame", body: label || "Northstar is testing the opening hypothesis against grounded proof.", status: "Grounding the argument" };
  if (context.stage === "analysis") return { headline: "Pattern becoming visible", body: label || "Northstar is connecting the strongest evidence to the central tension.", status: "Reframing from evidence" };
  if (context.stage === "recommendation") return { headline: "Decision taking shape", body: label || "The working insight is being tested for executive usefulness.", status: "Resolving the implication" };
  return { headline: "Composition resolving", body: label || "Northstar is subtracting temporary visual furniture and sharpening the final argument.", status: "Editing toward publication" };
}

function mediaOps(context: Context): any[] {
  const screen = evidenceCandidate(context.dataBundle, context.stage);
  const src = screen?.imageUrl ?? "";
  const title = screen?.title ?? "Grounded evidence";
  if (!src) return [{ op: "set-attributes", targetId: "thought-primary-media", attributes: { class: "ns-thought__media ns-thought__media--empty", "aria-hidden": "true" } }];
  if (context.stage === "evidence") {
    return [
      { op: "set-attributes", targetId: "thought-primary-media", attributes: { class: "ns-thought__media", "aria-hidden": null, "data-ns-evidence-id": screen?.id ?? "" } },
      { op: "insert-html", targetId: "thought-primary-media", position: "beforeend", html: `<img data-ns-node-id="thought-primary-media-image" src="${escapeHtml(src)}" alt="${escapeHtml(title)}"><figcaption data-ns-node-id="thought-primary-media-caption">${escapeHtml(title)}</figcaption>` },
      { op: "set-attributes", targetId: "thought-primary-media-image", attributes: { src, alt: title } },
      { op: "set-text", targetId: "thought-primary-media-caption", text: title },
    ];
  }
  return [
    { op: "set-attributes", targetId: "thought-primary-media", attributes: { class: "ns-thought__media", "aria-hidden": null, "data-ns-evidence-id": screen?.id ?? "" } },
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
  const operations = draft.operations.filter((operation: any) => {
    if (operation.op !== "set-text" || operation.targetId !== "title") return true;
    return !genericComparisonTitle.test(String(operation.text ?? ""));
  });

  const hasPrimary = operations.some((operation: any) => operation.targetId === "thought-primary" || operation.targetId === "thought-primary-body");
  if (!hasPrimary) {
    operations.push(
      { op: "set-text", targetId: "thought-primary-body", text: copy.body },
      { op: "set-text", targetId: "thought-primary-status", text: copy.status },
      { op: "set-attributes", targetId: "thought-primary", attributes: { "data-ns-thought-state": "evolving", "data-ns-current-focus": "true", "data-ns-publication-policy": "working-only" } },
      ...mediaOps(context),
    );
  }
  for (const app of context.dataBundle.apps.slice(0, 3)) {
    const slug = app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    operations.push({ op: "set-text", targetId: `identity-${slug}-status`, text: identityStatus(context.stage) });
    operations.push({ op: "set-attributes", targetId: `identity-${slug}-status`, attributes: { "data-ns-identity-status": context.stage } });
  }
  operations.push({
    op: "set-attributes",
    targetId: "artboard",
    attributes: {
      "data-ns-thought-stage": context.stage,
      "data-ns-transaction-state": "forming",
      "data-ns-canonical-surface": "true",
    },
  });
  operations.push({
    op: "set-css-layer",
    layerId: "visible-transaction-state",
    css: `.ns-reasoning-zone{position:absolute;top:48px;right:56px;width:min(620px,32%);display:grid;gap:14px;z-index:4}.ns-reasoning-zone .ns-thought{width:100%;margin:0}.ns-reasoning-zone .ns-thought__body{max-width:58ch}[data-ns-transaction-state="forming"] [data-ns-current-focus="true"]{opacity:.86;filter:saturate(.92);transform:translateY(-1px)}[data-ns-transaction-state="forming"] [data-ns-current-focus="true"]::after{content:"testing";display:inline-block;margin-left:8px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:currentColor;opacity:.55}`,
  });
  return { ...draft, operations };
}

export function prepareNorthstarEditorialPublicationDraft(draft: NorthstarArtboardMutationDraft): NorthstarArtboardMutationDraft {
  const operations = draft.operations.filter((operation: any) => {
    if (operation.op === "set-text" && operation.targetId === "title" && genericComparisonTitle.test(String(operation.text ?? ""))) return false;
    return true;
  });
  for (const targetId of ["thought-primary","thought-secondary","thought-tertiary"]) {
    operations.push({ op: "remove", targetId });
  }
  operations.push(
    { op: "remove", targetId: "current-act" },
    { op: "set-text", targetId: "identity-awin-status", text: "Evidence resolved for the published comparison." },
    { op: "set-text", targetId: "identity-whop-status", text: "Evidence resolved for the published comparison." },
    { op: "set-attributes", targetId: "artboard", attributes: { "data-ns-transaction-state": "resolved", "data-ns-publication": "verified" } },
    { op: "set-css-layer", layerId: "living-thought-publication-cleanup", css: `[data-ns-publication-policy="working-only"],[data-ns-working-role="status"],[data-ns-current-focus="true"]{display:none!important}.ns-published-artifact .ns-thought{display:none!important}.ns-published-artifact .ns-thought__status{display:none!important}.ns-published-artifact .ns-role-identity{background:transparent!important;box-shadow:none!important;border-radius:0!important}` },
  );
  return { ...draft, operations };
}
