// Northstar Trusted Progress Compositor v0.4.4 — a neutral, polished live checkpoint.
// It keeps grounded evidence visible while bespoke model authorship happens privately.
// It is intentionally not a final template and never dictates the bespoke composition.

import {
  NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
  NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
  type CanvasCodeArtifactBuildPhase,
  type CanvasCodeArtifactDataBundle,
  type CanvasCodeArtifactFlowData,
  type CanvasCodeArtifactScreenshotData,
  type CanvasCodeArtifactStage,
  type NorthstarCreativeDirection,
  type NorthstarGeneratedCodeArtifactPackage,
  type NorthstarThinkingDepth,
  type NorthstarWebArtifactDocument,
} from "@/lib/canvas-artifacts/types";

const PHASES: Array<Exclude<CanvasCodeArtifactBuildPhase, "complete">> = [
  "foundation",
  "evidence",
  "analysis",
  "recommendation",
  "refinement",
];

const DEFAULT_STAGES: CanvasCodeArtifactStage[] = [
  { id: "foundation", phase: "foundation", label: "Establish the visual question", message: "Framing the question and relevant product identities" },
  { id: "evidence", phase: "evidence", label: "Curate the reference evidence", message: "Arranging grounded flows and proof in authoritative order" },
  { id: "analysis", phase: "analysis", label: "Develop the visual argument", message: "Connecting evidence to tensions, patterns, and implications" },
  { id: "recommendation", phase: "recommendation", label: "Resolve the decision", message: "Turning the synthesis into a useful recommendation" },
  { id: "refinement", phase: "refinement", label: "Author the bespoke composition", message: "Preparing the next privately verified Northstar revision" },
];

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hash(value: string): string {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ code, 3266489917) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`.slice(0, 14);
}

function concise(value: string | undefined, max = 260): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function orderedScreens(data: CanvasCodeArtifactDataBundle, flow: CanvasCodeArtifactFlowData): CanvasCodeArtifactScreenshotData[] {
  const byId = new Map(data.screenshots.map((screen) => [screen.id, screen]));
  const ordered = flow.screenshotIds
    .map((id) => byId.get(id))
    .filter((screen): screen is CanvasCodeArtifactScreenshotData => Boolean(screen?.imageUrl));
  if (ordered.length) return ordered;
  return data.screenshots
    .filter((screen) => screen.appName === flow.appName && Boolean(screen.imageUrl))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function effectiveFlows(data: CanvasCodeArtifactDataBundle): CanvasCodeArtifactFlowData[] {
  if (data.flows.length) return data.flows.slice(0, 4);
  return data.apps.slice(0, 4).map((app, index) => ({
    id: `progress-flow-${index + 1}`,
    appName: app.name,
    flowName: "reference flow",
    platform: undefined,
    sessionType: undefined,
    summary: app.summary,
    journeyStages: [],
    patterns: app.patterns,
    frictionSignals: app.risks,
    trustSignals: app.strengths,
    openQuestions: app.openQuestions,
    screenshotIds: data.screenshots.filter((screen) => screen.appName === app.name).map((screen) => screen.id),
  }));
}

function editorialThesis(data: CanvasCodeArtifactDataBundle): string {
  const apps = data.apps.slice(0, 3).map((app) => app.name);
  if (data.decisions[0]) return concise(data.decisions[0], 150);
  if (apps.length === 2) return `${apps[0]} and ${apps[1]} reveal different paths to value.`;
  if (apps.length === 1) return `${apps[0]}: the moments shaping the path to value.`;
  return "The evidence is taking shape around a clear decision.";
}

function deck(data: CanvasCodeArtifactDataBundle, phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">): string {
  const coverage = concise(data.coverageSummary, 340);
  if (coverage && !/^northstar is /i.test(coverage)) return coverage;
  if (phase === "foundation") return "Northstar is establishing the visual question and the evidence that deserves attention.";
  if (phase === "evidence") return "The authoritative reference flows are visible in order while the deeper interpretation develops.";
  if (phase === "analysis") return "Northstar is resolving patterns, tensions, and implications without hiding the source material.";
  if (phase === "recommendation") return "The evidence is being translated into a useful decision and next action.";
  return "A bespoke Northstar composition is being privately authored and visually verified.";
}

function flowMarkup(data: CanvasCodeArtifactDataBundle, flow: CanvasCodeArtifactFlowData): string {
  const app = data.apps.find((candidate) => candidate.name === flow.appName);
  const screens = orderedScreens(data, flow);
  const icon = app?.iconUrl
    ? `<img class="ns-progress-app-icon" src="${escapeHtml(app.iconUrl)}" alt="${escapeHtml(flow.appName)} icon" />`
    : `<span class="ns-progress-monogram">${escapeHtml(flow.appName.slice(0, 1).toUpperCase())}</span>`;
  const images = screens.length
    ? screens.map((screen) => `<figure class="ns-progress-screen" data-ns-evidence-id="${escapeHtml(screen.id)}"><img src="${escapeHtml(screen.imageUrl)}" alt="${escapeHtml(screen.title || `${flow.appName} ${flow.flowName}`)}" /></figure>`).join("")
    : `<div class="ns-progress-awaiting">Grounding the first reference moments…</div>`;
  return `<article class="ns-progress-flow" data-ns-reference-flow="true" data-ns-flow-id="${escapeHtml(flow.id)}">
    <header class="ns-progress-identity">${icon}<div><strong>${escapeHtml(flow.appName)}</strong><span>${escapeHtml(flow.flowName)}${flow.platform ? ` · ${escapeHtml(flow.platform)}` : ""}</span></div></header>
    <div class="ns-progress-sequence">${images}</div>
  </article>`;
}

function synthesisItems(data: CanvasCodeArtifactDataBundle): string[] {
  const items = [
    ...data.apps.map((app) => app.summary),
    ...data.hypotheses.map((hypothesis) => hypothesis.statement),
    ...data.decisions,
  ].map((item) => concise(item, 260)).filter(Boolean);
  return Array.from(new Set(items)).slice(0, 4);
}

function buildDocument(input: {
  dataBundle: CanvasCodeArtifactDataBundle;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
}): NorthstarWebArtifactDocument {
  const data = input.dataBundle;
  const flows = effectiveFlows(data);
  const phaseIndex = PHASES.indexOf(input.phase);
  const showSynthesis = phaseIndex >= PHASES.indexOf("analysis");
  const showDecision = phaseIndex >= PHASES.indexOf("recommendation");
  const synthesis = synthesisItems(data);
  const totalScreens = data.screenshots.filter((screen) => screen.imageUrl).length;

  const html = `<main class="ns-artifact ns-progress-composition" data-ns-design-kernel="v1" data-ns-publication="trusted-progress">
    <header class="ns-progress-header" data-ns-stage="foundation">
      <div><p class="ns-kicker">Northstar working surface</p><h1 class="ns-thesis">${escapeHtml(editorialThesis(data))}</h1><p class="ns-deck">${escapeHtml(deck(data, input.phase))}</p></div>
      <div class="ns-progress-status"><span class="ns-dot ns-dot--green"></span><strong>Building live</strong><small>${escapeHtml(input.phase)}</small></div>
    </header>
    <section class="ns-progress-evidence" data-ns-stage="evidence" data-ns-primary-evidence="true">
      <div class="ns-progress-section-heading"><div><h2>Reference evidence</h2><p>Clean ordered flows remain visible while Northstar decides how the final composition should speak.</p></div><span>${totalScreens} grounded screen${totalScreens === 1 ? "" : "s"}</span></div>
      <div class="ns-progress-flow-stack">${flows.map((flow) => flowMarkup(data, flow)).join("")}</div>
    </section>
    ${showSynthesis ? `<section class="ns-progress-synthesis" data-ns-stage="analysis"><div><p class="ns-kicker">Current synthesis</p><h2>The argument is becoming clearer.</h2></div><div class="ns-progress-signals">${synthesis.map((item, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(item)}</p></article>`).join("")}</div></section>` : ""}
    ${showDecision ? `<section class="ns-progress-decision" data-ns-stage="recommendation"><p class="ns-kicker">Decision forming</p><h2>${escapeHtml(concise(data.decisions[0] || data.hypotheses[0]?.statement || "Northstar is testing the strongest evidence-backed direction.", 240))}</h2><p>The bespoke artifact is being authored privately against the eight-reference Northstar identity pack.</p></section>` : ""}
    <footer class="ns-progress-ledger" data-ns-stage="refinement" data-ns-research-trail="true"><span>${data.apps.length} app${data.apps.length === 1 ? "" : "s"}</span><span>${flows.length} reference flow${flows.length === 1 ? "" : "s"}</span><span>${totalScreens} ordered screens</span><span>${data.hypotheses.length} hypotheses</span></footer>
  </main>`;

  const css = String.raw`
.ns-progress-composition{width:max-content;min-width:1680px;min-height:945px;padding:46px 54px 38px;gap:26px;background:radial-gradient(circle at 44% -15%,rgba(107,77,255,.10),transparent 34%),linear-gradient(180deg,#fdfcff 0%,#f6f5fb 100%)}
.ns-progress-header{display:grid;grid-template-columns:minmax(760px,1fr) 170px;gap:42px;align-items:start;min-width:1570px}.ns-progress-header .ns-thesis{max-width:1180px;font-size:58px}.ns-progress-status{justify-self:end;display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;padding:11px 13px;border:1px solid var(--ns-line);border-radius:15px;background:rgba(255,255,255,.92);box-shadow:var(--ns-shadow)}.ns-progress-status strong{font-size:12px}.ns-progress-status small{grid-column:2;color:var(--ns-muted);font-size:10px;text-transform:capitalize}
.ns-progress-evidence{display:grid;gap:12px;min-width:1570px}.ns-progress-section-heading{display:flex;align-items:end;justify-content:space-between;gap:32px;padding:0 2px}.ns-progress-section-heading h2{margin:0;font-size:18px}.ns-progress-section-heading p{margin:4px 0 0;color:var(--ns-muted);font-size:12px}.ns-progress-section-heading>span{font-size:11px;color:var(--ns-muted)}
.ns-progress-flow-stack{display:grid;gap:18px}.ns-progress-flow{display:grid;grid-template-columns:170px max-content;gap:22px;align-items:start;padding:20px 0;border-top:1px solid var(--ns-line);overflow:visible}.ns-progress-flow:first-child{border-top:0}.ns-progress-identity{display:flex;align-items:center;gap:12px;padding-top:4px}.ns-progress-identity div{display:grid;gap:4px}.ns-progress-identity strong{font-size:18px}.ns-progress-identity span{max-width:130px;color:var(--ns-muted);font-size:11px;line-height:1.35}.ns-progress-app-icon,.ns-progress-monogram{width:48px;height:48px;border-radius:14px;box-shadow:0 10px 24px rgba(39,30,93,.13)}.ns-progress-app-icon{object-fit:cover}.ns-progress-monogram{display:grid;place-items:center;background:var(--ns-violet);color:white;font-size:20px;font-weight:900}.ns-progress-sequence{display:flex;flex-flow:row nowrap;gap:15px;align-items:start;width:max-content;overflow:visible}.ns-progress-screen{position:relative;margin:0;flex:0 0 auto}.ns-progress-screen:not(:last-child)::after{content:"";position:absolute;left:calc(100% + 5px);top:46%;width:5px;height:1px;background:var(--ns-line-strong)}.ns-progress-screen img{display:block;width:auto;height:235px;max-width:none;border-radius:7px;object-fit:contain;box-shadow:0 14px 30px rgba(39,30,93,.10)}.ns-progress-awaiting{display:grid;place-items:center;width:360px;height:180px;border:1px dashed var(--ns-line-strong);border-radius:18px;color:var(--ns-muted);font-size:13px}
.ns-progress-synthesis{display:grid;grid-template-columns:360px minmax(0,1fr);gap:40px;align-items:start;min-width:1570px;padding:28px 30px;border-top:1px solid var(--ns-line);border-bottom:1px solid var(--ns-line)}.ns-progress-synthesis h2{margin:0;font-size:34px;line-height:1.05;letter-spacing:-.035em}.ns-progress-signals{display:grid;grid-template-columns:repeat(2,minmax(360px,1fr));gap:18px 30px}.ns-progress-signals article{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px}.ns-progress-signals span{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--ns-violet-soft);color:var(--ns-violet);font-size:10px;font-weight:900}.ns-progress-signals p{margin:2px 0 0;color:#454957;font-size:14px;line-height:1.45}
.ns-progress-decision{max-width:1180px;padding:30px 34px;border-radius:28px;background:linear-gradient(145deg,#6f4dff,#4e31e8);color:white;box-shadow:0 24px 62px rgba(78,49,232,.20)}.ns-progress-decision .ns-kicker{color:rgba(255,255,255,.82)}.ns-progress-decision h2{max-width:1040px;margin:0;font-size:38px;line-height:1.02;letter-spacing:-.04em}.ns-progress-decision>p:last-child{margin:12px 0 0;color:rgba(255,255,255,.82);font-size:13px}
.ns-progress-ledger{display:flex;gap:22px;flex-wrap:wrap;min-width:1570px;padding:12px 2px 0;color:var(--ns-muted);font-size:11px}.ns-progress-ledger span+span::before{content:"·";margin-right:22px;color:var(--ns-faint)}
`;

  return { schema: NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA, html, css, javascript: "document.documentElement.dataset.northstarTrustedProgress='true';" };
}

export function createTrustedNorthstarArtifactPackage(input: {
  artifactId: string;
  objective: string;
  audience: string;
  artifactType: string;
  dataBundle: CanvasCodeArtifactDataBundle;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  thinkingDepth: NorthstarThinkingDepth;
  parentRevisionId?: string;
  creativeDirection?: NorthstarCreativeDirection;
  provisional: boolean;
  message?: string;
}): NorthstarGeneratedCodeArtifactPackage {
  const document = buildDocument({ dataBundle: input.dataBundle, phase: input.phase });
  const flows = effectiveFlows(input.dataBundle);
  const maxScreens = Math.max(1, ...flows.map((flow) => orderedScreens(input.dataBundle, flow).length));
  const preferredWidth = Math.max(1680, 54 + 170 + 22 + maxScreens * 135 + Math.max(0, maxScreens - 1) * 15 + 54);
  const phaseIndex = PHASES.indexOf(input.phase);
  const preferredHeight = Math.max(945, 250 + flows.length * 285 + (phaseIndex >= 2 ? 250 : 0) + (phaseIndex >= 3 ? 230 : 0) + 80);
  const title = editorialThesis(input.dataBundle);
  const fingerprint = hash(JSON.stringify({
    phase: input.phase,
    apps: input.dataBundle.apps.map((app) => [app.id, app.name]),
    flows: input.dataBundle.flows.map((flow) => [flow.id, flow.screenshotIds]),
    decisions: input.dataBundle.decisions,
  }));

  return {
    schema: NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
    artifactId: input.artifactId,
    revisionId: `${input.artifactId}-progress-${input.phase}-${fingerprint}`,
    parentRevisionId: input.parentRevisionId,
    title,
    description: input.message || deck(input.dataBundle, input.phase),
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    visualStrategy: "A neutral, polished, evidence-visible working checkpoint. It preserves ordered reference flows while Northstar privately invents and verifies a bespoke final composition.",
    document,
    preferredWidth,
    preferredHeight,
    layoutBaseWidth: preferredWidth,
    layoutBaseHeight: preferredHeight,
    intrinsicBounds: { minX: 0, minY: 0, maxX: preferredWidth, maxY: preferredHeight },
    minimumWidth: 840,
    minimumHeight: 472,
    stages: DEFAULT_STAGES,
    dataBundle: input.dataBundle,
    thinkingDepth: input.thinkingDepth,
    creativeDirection: input.creativeDirection,
    creativeReviews: [],
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  };
}
