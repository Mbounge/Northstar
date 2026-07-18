// lib/canvas-ai/northstar-visual-scene-engine.ts
// Northstar v0.6.0.2.1 — CSS-integrity scene rendering with horizontal ordered evidence flows.

import type { CanvasCodeArtifactDataBundle, NorthstarWebArtifactDocument } from "@/lib/canvas-artifacts/types";

export type NorthstarSceneBand = "opening" | "working" | "evidence" | "resolution";
export type NorthstarSceneEmphasis = "hero" | "primary" | "supporting" | "peripheral";
export type NorthstarSceneMaterial = "ink" | "paper" | "note" | "outline" | "quiet" | "signal" | "image";
export type NorthstarSceneRole =
  | "title"
  | "framing"
  | "identity"
  | "status"
  | "hypothesis"
  | "open-question"
  | "research-note"
  | "contradiction"
  | "evidence-field"
  | "synthesis"
  | "decision"
  | "provenance";

export type NorthstarVisualSceneObject = {
  id: string;
  role: NorthstarSceneRole;
  content: string;
  band: NorthstarSceneBand;
  emphasis: NorthstarSceneEmphasis;
  material: NorthstarSceneMaterial;
  span: number;
  order: number;
  appName?: string;
};

export type NorthstarVisualScenePlan = {
  sceneId: string;
  threeSecondRead: string;
  governingIdea: string;
  emotionalRegister: string;
  signatureMoveInProgress: string;
  artDirection: {
    background: string;
    ink: string;
    accent: string;
    supporting: string;
    radius: "sharp" | "soft" | "mixed";
    density: "airy" | "balanced" | "dense";
  };
  objects: NorthstarVisualSceneObject[];
};

export const NORTHSTAR_VISUAL_SCENE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sceneId", "threeSecondRead", "governingIdea", "emotionalRegister", "signatureMoveInProgress", "artDirection", "objects"],
  properties: {
    sceneId: { type: "string" },
    threeSecondRead: { type: "string" },
    governingIdea: { type: "string" },
    emotionalRegister: { type: "string" },
    signatureMoveInProgress: { type: "string" },
    artDirection: {
      type: "object",
      additionalProperties: false,
      required: ["background", "ink", "accent", "supporting", "radius", "density"],
      properties: {
        background: { type: "string" }, ink: { type: "string" }, accent: { type: "string" }, supporting: { type: "string" },
        radius: { type: "string", enum: ["sharp", "soft", "mixed"] }, density: { type: "string", enum: ["airy", "balanced", "dense"] },
      },
    },
    objects: {
      type: "array", minItems: 3, maxItems: 14,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "role", "content", "band", "emphasis", "material", "span", "order"],
        properties: {
          id: { type: "string" }, role: { type: "string", enum: ["title","framing","identity","status","hypothesis","open-question","research-note","contradiction","evidence-field","synthesis","decision","provenance"] },
          content: { type: "string" }, band: { type: "string", enum: ["opening","working","evidence","resolution"] },
          emphasis: { type: "string", enum: ["hero","primary","supporting","peripheral"] }, material: { type: "string", enum: ["ink","paper","note","outline","quiet","signal","image"] },
          span: { type: "integer", minimum: 2, maximum: 12 }, order: { type: "integer", minimum: 0, maximum: 100 }, appName: { type: "string" },
        },
      },
    },
  },
} as const;

export function buildNorthstarVisualSceneSystemInstruction(): string {
  return `You are Northstar's blank-slate visual scene planner. Compose the first visible artboard as an open visual field, not a dashboard and not a template.

Do not assume a header, sidebar, evidence bay, card grid, or fixed slots. Choose only the semantic objects that serve this exact problem. You may use typography, notes, identities, questions, contradictions, negative space, evidence fields, and other visual roles when justified.

Express hierarchy and relationships through semantic objects, band, order, span, emphasis, and material. Never output x/y coordinates, pixel widths, CSS, HTML, or layout templates. The renderer owns collision-free geometry.

The title must belong to the governing visual idea. Working objects must visibly distinguish provisional, contested, confirmed, and resolved thinking. Evidence-field is an invisible semantic anchor, not a giant placeholder card. Use it exactly once.

The opening scene should already feel premium, problem-specific, and intentionally composed. Avoid generic slogans, filler, and invented claims unsupported by the supplied evidence. Return JSON only.`;
}

export function buildNorthstarVisualSceneModelInput(input: {
  objective: string; audience: string; artifactType: string; dataBundle: CanvasCodeArtifactDataBundle; message?: string;
}): string {
  const apps = input.dataBundle.apps.slice(0, 6).map((app) => ({ name: app.name, summary: app.summary, iconUrl: app.iconUrl }));
  const evidence = input.dataBundle.screenshots.slice(0, 24).map((screen) => ({ app: screen.appName, title: screen.title, stage: screen.journeyStage, friction: screen.frictionSignals, trust: screen.trustSignals }));
  return JSON.stringify({ objective: input.objective, audience: input.audience, artifactType: input.artifactType, currentMessage: input.message, coverageSummary: input.dataBundle.coverageSummary, apps, evidence }, null, 2);
}

const safeHex = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
const safeId = (value: string, fallback: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || fallback;
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function sanitizeNorthstarVisualScenePlan(raw: unknown, input: { objective: string; dataBundle: CanvasCodeArtifactDataBundle }): NorthstarVisualScenePlan {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const direction = source.artDirection && typeof source.artDirection === "object" ? source.artDirection as Record<string, unknown> : {};
  const objectsRaw = Array.isArray(source.objects) ? source.objects : [];
  const validRoles = new Set<NorthstarSceneRole>(["title","framing","identity","status","hypothesis","open-question","research-note","contradiction","evidence-field","synthesis","decision","provenance"]);
  const validBands = new Set<NorthstarSceneBand>(["opening","working","evidence","resolution"]);
  const validEmphasis = new Set<NorthstarSceneEmphasis>(["hero","primary","supporting","peripheral"]);
  const validMaterials = new Set<NorthstarSceneMaterial>(["ink","paper","note","outline","quiet","signal","image"]);
  const objects: NorthstarVisualSceneObject[] = [];
  for (const [index, item] of objectsRaw.entries()) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = validRoles.has(row.role as NorthstarSceneRole) ? row.role as NorthstarSceneRole : "research-note";
    objects.push({
      id: safeId(String(row.id ?? `${role}-${index + 1}`), `${role}-${index + 1}`), role,
      content: String(row.content ?? "").trim().slice(0, 900),
      band: validBands.has(row.band as NorthstarSceneBand) ? row.band as NorthstarSceneBand : "working",
      emphasis: validEmphasis.has(row.emphasis as NorthstarSceneEmphasis) ? row.emphasis as NorthstarSceneEmphasis : "supporting",
      material: validMaterials.has(row.material as NorthstarSceneMaterial) ? row.material as NorthstarSceneMaterial : "quiet",
      span: Math.max(2, Math.min(12, Math.round(Number(row.span) || 4))), order: Math.max(0, Math.min(100, Math.round(Number(row.order) || index))),
      appName: row.appName ? String(row.appName).slice(0, 120) : undefined,
    });
  }
  const title = objects.find((object) => object.role === "title");
  if (!title) objects.push({ id: "title", role: "title", content: input.objective.slice(0, 120), band: "opening", emphasis: "hero", material: "ink", span: 8, order: 0 });
  if (!objects.some((object) => object.role === "evidence-field")) objects.push({ id: "evidence", role: "evidence-field", content: "", band: "evidence", emphasis: "primary", material: "quiet", span: 12, order: 70 });
  const seen = new Set<string>();
  const unique = objects.filter((object) => !seen.has(object.id) && seen.add(object.id)).slice(0, 14);
  return {
    sceneId: safeId(String(source.sceneId ?? "opening-scene"), "opening-scene"),
    threeSecondRead: String(source.threeSecondRead ?? input.objective).slice(0, 420),
    governingIdea: String(source.governingIdea ?? "Let evidence and unresolved questions shape the composition as understanding grows.").slice(0, 700),
    emotionalRegister: String(source.emotionalRegister ?? "precise, curious, editorial").slice(0, 240),
    signatureMoveInProgress: String(source.signatureMoveInProgress ?? "The visual hierarchy will change as evidence resolves the central tension.").slice(0, 500),
    artDirection: {
      background: safeHex(String(direction.background ?? "#fbfaff"), "#fbfaff"), ink: safeHex(String(direction.ink ?? "#171820"), "#171820"),
      accent: safeHex(String(direction.accent ?? "#6b4dff"), "#6b4dff"), supporting: safeHex(String(direction.supporting ?? "#77798a"), "#77798a"),
      radius: (["sharp","soft","mixed"] as const).includes(direction.radius as any) ? direction.radius as any : "mixed",
      density: (["airy","balanced","dense"] as const).includes(direction.density as any) ? direction.density as any : "balanced",
    }, objects: unique.sort((a, b) => a.order - b.order),
  };
}

export function deterministicNorthstarVisualScenePlan(input: { objective: string; dataBundle: CanvasCodeArtifactDataBundle }): NorthstarVisualScenePlan {
  const apps = input.dataBundle.apps.slice(0, 3);
  return sanitizeNorthstarVisualScenePlan({
    sceneId: "grounded-opening", threeSecondRead: input.objective, governingIdea: "Begin with the central question and let the evidence reorganize the field.", emotionalRegister: "editorial, curious, exact", signatureMoveInProgress: "The board will progressively replace questions with evidence-backed claims.",
    artDirection: { background: "#fbfaff", ink: "#171820", accent: "#6b4dff", supporting: "#747787", radius: "mixed", density: "airy" },
    objects: [
      { id: "title", role: "title", content: input.objective.replace(/^(build|create|make|design)\s+/i, "").split(/[.!?]/)[0].slice(0, 96), band: "opening", emphasis: "hero", material: "ink", span: 8, order: 0 },
      ...apps.map((app, index) => ({ id: `identity-${index + 1}`, role: "identity", content: app.name, appName: app.name, band: "opening", emphasis: "supporting", material: "paper", span: 2, order: 10 + index })),
      { id: "current-act", role: "status", content: "Northstar is establishing the question, evidence, and provisional visual direction.", band: "working", emphasis: "peripheral", material: "quiet", span: 3, order: 25 },
      { id: "evidence", role: "evidence-field", content: "", band: "evidence", emphasis: "primary", material: "quiet", span: 12, order: 70 },
    ],
  }, input);
}

function identityMarkup(object: NorthstarVisualSceneObject, dataBundle: CanvasCodeArtifactDataBundle): string {
  const app = dataBundle.apps.find((candidate) => candidate.name.toLowerCase() === (object.appName || object.content).toLowerCase());
  return `<article class="ns-scene-object ns-role-identity ns-material-${object.material}" data-ns-node-id="${escapeHtml(object.id)}" data-ns-working-role="identity" style="--span:${object.span}">${app?.iconUrl ? `<img src="${escapeHtml(app.iconUrl)}" alt="${escapeHtml(app.name)} icon">` : ""}<div><strong>${escapeHtml(app?.name || object.content)}</strong>${app?.summary ? `<span>${escapeHtml(app.summary)}</span>` : ""}</div></article>`;
}

type NorthstarCssDeclarationValue = string | number;
type NorthstarCssRule = {
  selector: string;
  declarations: Record<string, NorthstarCssDeclarationValue>;
};

function serializeNorthstarCssRules(rules: NorthstarCssRule[]): string {
  return rules.map((rule) => {
    const declarations = Object.entries(rule.declarations)
      .filter(([, value]) => value !== "")
      .map(([property, value]) => `${property}:${String(value)}`)
      .join(";");
    return `${rule.selector}{${declarations}}`;
  }).join("");
}

export function validateNorthstarVisualSceneDocument(document: NorthstarWebArtifactDocument): string[] {
  const issues: string[] = [];
  let depth = 0;
  for (const character of document.css) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) {
      issues.push("Scene CSS closes a rule before it opens one.");
      break;
    }
  }
  if (depth !== 0) issues.push("Scene CSS contains unbalanced rule braces.");
  const requiredSelectors = [
    ".ns-visual-scene",
    ".ns-scene-grid",
    ".working-flow",
    ".working-flow__sequence",
    ".working-flow figure",
  ];
  for (const selector of requiredSelectors) {
    if (!document.css.includes(`${selector}{`)) issues.push(`Scene CSS is missing required selector ${selector}.`);
  }
  if (!/\.working-flow__sequence\{[^}]*display:flex[^}]*flex-wrap:nowrap[^}]*width:max-content/i.test(document.css)) {
    issues.push("Ordered evidence sequences must render as one horizontal, non-wrapping flow.");
  }
  if (/grid-template-columns:repeat\(auto-fit/i.test(document.css)) {
    issues.push("Ordered evidence sequences may not silently wrap into an auto-fit grid.");
  }
  return issues;
}

export function renderNorthstarVisualSceneDocument(plan: NorthstarVisualScenePlan, dataBundle: CanvasCodeArtifactDataBundle): NorthstarWebArtifactDocument {
  const radius = plan.artDirection.radius === "sharp" ? "8px" : plan.artDirection.radius === "soft" ? "28px" : "18px";
  const gap = plan.artDirection.density === "airy" ? 28 : plan.artDirection.density === "dense" ? 14 : 20;
  const evidenceScreenCount = Math.max(0, ...dataBundle.flows.slice(0, 4).map((flow) => Math.min(12, flow.screenshotIds.length)));
  const evidenceWidth = evidenceScreenCount > 0
    ? 170 + 24 + evidenceScreenCount * 156 + Math.max(0, evidenceScreenCount - 1) * 18
    : 0;
  const artboardWidth = Math.max(2360, 112 + evidenceWidth);
  const objects = plan.objects.map((object) => {
    if (object.role === "identity") return identityMarkup(object, dataBundle);
    if (object.role === "evidence-field") return `<section class="ns-scene-object ns-role-evidence" data-ns-node-id="evidence" data-ns-working-role="evidence" style="--span:${object.span}"></section>`;
    if (object.role === "title") return `<h1 class="ns-scene-object ns-role-title ns-emphasis-${object.emphasis}" data-ns-node-id="title" data-ns-working-role="title" style="--span:${object.span}">${escapeHtml(object.content)}</h1>`;
    if (object.role === "framing") return `<div class="ns-scene-object ns-role-framing ns-material-${object.material}" data-ns-node-id="deck" data-ns-working-role="framing" style="--span:${object.span}">${escapeHtml(object.content)}</div>`;
    if (object.role === "status") return `<div class="ns-scene-object ns-role-status ns-material-${object.material}" data-ns-node-id="current-act" data-ns-working-role="status" style="--span:${object.span}"><span>Current design act</span><strong data-ns-node-id="current-act-text">${escapeHtml(object.content)}</strong></div>`;
    return `<article class="ns-scene-object ns-role-${object.role} ns-material-${object.material} ns-emphasis-${object.emphasis}" data-ns-node-id="${escapeHtml(object.id)}" data-ns-working-role="${object.role}" style="--span:${object.span}">${escapeHtml(object.content)}</article>`;
  }).join("");

  const css = serializeNorthstarCssRules([
    { selector: ".ns-visual-scene", declarations: { width: `${artboardWidth}px`, "min-width": "1180px", "min-height": "720px", "box-sizing": "border-box", padding: "48px 56px 64px", background: `radial-gradient(circle at 18% -8%,color-mix(in srgb,${plan.artDirection.accent} 13%,transparent),transparent 36%),${plan.artDirection.background}`, color: plan.artDirection.ink, "font-family": "Inter,ui-sans-serif,system-ui,sans-serif", overflow: "visible" } },
    { selector: ".ns-scene-grid", declarations: { display: "grid", "grid-template-columns": "repeat(12,minmax(0,1fr))", "grid-auto-flow": "row dense", gap: `${gap}px`, "align-items": "start" } },
    { selector: ".ns-scene-object", declarations: { "grid-column": "span min(var(--span,4),12)", "min-width": "0", "box-sizing": "border-box" } },
    { selector: ".ns-role-title", declarations: { margin: "0", "font-size": "clamp(52px,4.2vw,88px)", "line-height": ".92", "letter-spacing": "-.062em", "font-weight": "900", "text-wrap": "balance", "max-width": "18ch" } },
    { selector: ".ns-role-framing", declarations: { "font-size": "21px", "line-height": "1.42", "max-width": "72ch", color: plan.artDirection.supporting } },
    { selector: ".ns-role-status", declarations: { "justify-self": "end", padding: "14px 16px", "border-left": `2px solid ${plan.artDirection.accent}`, "font-size": "14px", "line-height": "1.4", "max-width": "36ch" } },
    { selector: ".ns-role-status span", declarations: { display: "block", "font-size": "10px", "letter-spacing": ".14em", "text-transform": "uppercase", color: plan.artDirection.accent } },
    { selector: ".ns-role-status strong", declarations: { display: "block", "margin-top": "7px" } },
    { selector: ".ns-role-identity", declarations: { display: "flex", "align-items": "center", gap: "14px", padding: "14px 16px", "border-radius": radius, background: "rgba(255,255,255,.78)", "box-shadow": "0 12px 34px rgba(30,20,70,.08)", "min-height": "78px" } },
    { selector: ".ns-role-identity img", declarations: { width: "58px", height: "58px", "border-radius": "16px", "object-fit": "cover", flex: "0 0 auto" } },
    { selector: ".ns-role-identity strong", declarations: { display: "block", "font-size": "18px", "letter-spacing": "-.02em" } },
    { selector: ".ns-role-identity span", declarations: { display: "block", "margin-top": "4px", "font-size": "13px", "line-height": "1.38", color: plan.artDirection.supporting, "max-width": "44ch" } },
    { selector: ".ns-role-hypothesis,.ns-role-open-question,.ns-role-research-note,.ns-role-contradiction", declarations: { padding: "18px 20px", "border-radius": radius, "font-size": "17px", "line-height": "1.42" } },
    { selector: ".ns-material-note", declarations: { background: "#fff0a8", "box-shadow": "0 15px 38px rgba(100,75,0,.12)" } },
    { selector: ".ns-material-paper", declarations: { background: "rgba(255,255,255,.84)", "box-shadow": "0 16px 42px rgba(30,20,70,.09)" } },
    { selector: ".ns-material-outline", declarations: { border: `1.5px solid color-mix(in srgb,${plan.artDirection.accent} 45%,transparent)` } },
    { selector: ".ns-material-signal", declarations: { background: `color-mix(in srgb,${plan.artDirection.accent} 11%,white)`, "border-left": `4px solid ${plan.artDirection.accent}` } },
    { selector: ".ns-material-quiet", declarations: { color: plan.artDirection.supporting } },
    { selector: ".ns-role-evidence", declarations: { "grid-column": "1/-1", display: "grid", gap: "30px", "min-height": "0", padding: "0", background: "none", border: "0", "min-width": "0" } },
    { selector: ".ns-role-evidence:empty", declarations: { display: "none" } },
    { selector: ".working-flow", declarations: { display: "grid", "grid-template-columns": "170px minmax(0,1fr)", gap: "24px", "align-items": "center", padding: "22px 0", "border-top": `1px solid color-mix(in srgb,${plan.artDirection.ink} 11%,transparent)`, "min-width": "0" } },
    { selector: ".working-flow__identity", declarations: { display: "flex", "align-items": "center", gap: "12px", "align-self": "center" } },
    { selector: ".working-flow__identity img", declarations: { width: "46px", height: "46px", "border-radius": "13px", "object-fit": "cover", flex: "0 0 auto" } },
    { selector: ".working-flow__identity strong", declarations: { display: "block", "font-size": "18px" } },
    { selector: ".working-flow__identity span", declarations: { display: "block", "font-size": "12px", color: plan.artDirection.supporting } },
    { selector: ".working-flow__sequence", declarations: { display: "flex", "flex-wrap": "nowrap", "align-items": "flex-end", gap: "18px", width: "max-content", "min-width": "0" } },
    { selector: ".working-flow figure", declarations: { margin: "0", width: "156px", "min-width": "156px", flex: "0 0 156px" } },
    { selector: ".working-flow figure img", declarations: { display: "block", width: "100%", height: "auto", "max-height": "286px", "object-fit": "contain", filter: "drop-shadow(0 12px 20px rgba(32,24,80,.09))" } },
    { selector: "[data-ns-node-id=\"synthesis\"],[data-ns-node-id=\"decision\"]", declarations: { display: "grid", gap: "18px", "margin-top": "24px" } },
    { selector: ".ns-artifact [data-ns-node-id]", declarations: { transition: "transform 320ms cubic-bezier(.2,.8,.2,1),opacity 240ms ease,width 320ms ease,height 320ms ease,margin 320ms ease,padding 320ms ease" } },
  ]);

  const document: NorthstarWebArtifactDocument = {
    schema: "northstar.web-artifact-document.v1",
    html: `<main class="ns-artifact ns-visual-scene" data-ns-node-id="artboard" data-ns-design-kernel="scene-v1" data-ns-publication="working" data-ns-three-second-read="${escapeHtml(plan.threeSecondRead)}"><header data-ns-node-id="header" data-ns-stage="foundation"></header><div class="ns-scene-grid">${objects}</div><section data-ns-node-id="synthesis" data-ns-stage="analysis"></section><section data-ns-node-id="decision" data-ns-stage="recommendation"></section></main>`,
    css,
    javascript: "",
  };
  const issues = validateNorthstarVisualSceneDocument(document);
  if (issues.length) throw new Error(`Northstar visual scene integrity failed: ${issues.join(" ")}`);
  return document;
}
