import type { AppDataApp, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";
import { assertCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "@/lib/canvas-v2/artifact-safety";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";

export interface CanvasV2FlowInsertion {
  document: CanvasV2ArtifactDocument;
  evidence: CanvasV2EvidenceAsset[];
  regionNodeId: string;
  laneNodeId: string;
}

const FLOW_CSS = `
.canvas-v2-grounded-evidence { box-sizing:border-box; width:max-content; min-width:1568px; padding:0; background:transparent; color:#151620; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
.canvas-v2-grounded-evidence--standalone { min-width:1680px; padding:52px 56px 64px; background:#fff; }
.canvas-v2-grounded-title { margin:0 0 28px; color:#23232b; font-size:9px; font-weight:850; letter-spacing:.18em; text-transform:uppercase; }
.canvas-v2-flow-lane { display:grid; grid-template-columns:170px max-content; align-items:center; gap:24px; min-height:270px; padding:16px 0; }
.canvas-v2-flow-identity { display:flex; align-items:center; gap:12px; align-self:center; }
.canvas-v2-flow-icon { width:46px; height:46px; flex:none; border-radius:13px; object-fit:contain; box-shadow:0 10px 24px rgba(39,30,93,.10); }
.canvas-v2-flow-app { margin:0; color:#17171e; font-size:18px; font-weight:850; letter-spacing:-.02em; }
.canvas-v2-flow-meta { margin:3px 0 0; max-width:118px; color:#737686; font-size:11px; line-height:1.35; }
.canvas-v2-flow-sequence { display:flex; flex-flow:row nowrap; align-items:flex-end; width:max-content; gap:18px; padding-right:56px; overflow:visible; }
.canvas-v2-flow-screen { display:block; width:auto; height:235px; max-width:none; flex:none; object-fit:contain; filter:drop-shadow(0 12px 20px rgba(32,24,80,.09)); }
`;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "flow";
}

function mergeEvidence(current: readonly CanvasV2EvidenceAsset[], next: readonly CanvasV2EvidenceAsset[]): CanvasV2EvidenceAsset[] {
  return Array.from(new Map([...current, ...next].map((asset) => [asset.id, { ...asset }])).values());
}

export function insertCanvasV2CanonicalFlow(input: {
  document: CanvasV2ArtifactDocument;
  currentEvidence: readonly CanvasV2EvidenceAsset[];
  app: AppDataApp;
  flow: AppDataFlow;
  evidence: readonly CanvasV2EvidenceAsset[];
}): CanvasV2FlowInsertion {
  if (typeof DOMParser === "undefined") throw new Error("Flow insertion requires a browser document.");
  const screenEvidence = input.flow.screens.map((screen) => input.evidence.find((asset) => asset.id === `screen:${screen.id}`)).filter((asset): asset is CanvasV2EvidenceAsset => Boolean(asset));
  if (!screenEvidence.length) throw new Error("This flow has no renderable screenshots.");

  const parsed = new DOMParser().parseFromString(`<body>${input.document.html}</body>`, "text/html");
  const host = parsed.querySelector<HTMLElement>('[data-canvas-v2-node-id="artboard"]') ?? parsed.querySelector<HTMLElement>("main") ?? parsed.body;
  let region = parsed.querySelector<HTMLElement>("[data-canvas-v2-evidence-region=canonical]");
  const regionNodeId = region?.dataset.canvasV2NodeId ?? "grounded-evidence";
  if (!region) {
    region = parsed.createElement("section");
    region.className = `canvas-v2-grounded-evidence${host === parsed.body ? " canvas-v2-grounded-evidence--standalone" : ""}`;
    region.dataset.canvasV2NodeId = regionNodeId;
    region.dataset.canvasV2EvidenceRegion = "canonical";
    const title = parsed.createElement("h2");
    title.className = "canvas-v2-grounded-title";
    title.dataset.canvasV2NodeId = `${regionNodeId}-title`;
    title.textContent = "Grounded evidence";
    region.append(title);
    host.append(region);
  }

  const laneNodeId = `flow-${slug(input.app.name)}-${slug(input.flow.id)}`;
  const existing = Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).find((element) => element.dataset.canvasV2NodeId === laneNodeId);
  if (existing) throw new Error(`${input.flow.name} is already on the artboard.`);
  const lane = parsed.createElement("article");
  lane.className = "canvas-v2-flow-lane";
  lane.dataset.canvasV2NodeId = laneNodeId;
  lane.dataset.canvasV2CanonicalFlow = input.flow.id;
  lane.dataset.canvasV2FlowScope = input.flow.scope ?? "flow";
  if (input.flow.taxonomyPath?.length) lane.dataset.canvasV2TaxonomyPath = input.flow.taxonomyPath.join(" / ");

  const identity = parsed.createElement("div");
  identity.className = "canvas-v2-flow-identity";
  identity.dataset.canvasV2NodeId = `${laneNodeId}-identity`;
  const icon = input.evidence.find((asset) => asset.id === `icon:${input.app.id}`);
  if (icon) {
    const image = parsed.createElement("img");
    image.className = "canvas-v2-flow-icon";
    image.dataset.canvasV2NodeId = `${laneNodeId}-icon`;
    image.dataset.canvasV2EvidenceId = icon.id;
    image.dataset.canvasV2EvidenceRole = "canonical";
    image.src = icon.url;
    image.alt = icon.label;
    identity.append(image);
  }
  const copy = parsed.createElement("div");
  const name = parsed.createElement("h3");
  name.className = "canvas-v2-flow-app";
  name.dataset.canvasV2NodeId = `${laneNodeId}-app`;
  name.textContent = input.app.name;
  const meta = parsed.createElement("p");
  meta.className = "canvas-v2-flow-meta";
  meta.dataset.canvasV2NodeId = `${laneNodeId}-meta`;
  meta.textContent = [input.flow.platform, input.flow.sessionType].filter(Boolean).join(" ") || input.flow.name;
  copy.append(name, meta);
  identity.append(copy);

  const sequence = parsed.createElement("div");
  sequence.className = "canvas-v2-flow-sequence";
  sequence.dataset.canvasV2NodeId = `${laneNodeId}-sequence`;
  screenEvidence.forEach((asset, index) => {
    const image = parsed.createElement("img");
    image.className = "canvas-v2-flow-screen";
    image.dataset.canvasV2NodeId = `${laneNodeId}-screen-${index + 1}`;
    image.dataset.canvasV2EvidenceId = asset.id;
    image.dataset.canvasV2EvidenceRole = "canonical";
    image.dataset.canvasV2FlowIndex = String(index);
    image.src = asset.url;
    image.alt = asset.label;
    sequence.append(image);
  });
  lane.append(identity, sequence);
  region.append(lane);

  const evidence = mergeEvidence(input.currentEvidence, input.evidence.filter((asset) => asset.id === `icon:${input.app.id}` || screenEvidence.some((screen) => screen.id === asset.id)));
  const document = assertCanvasV2ArtifactDocument({ ...input.document, html: parsed.body.innerHTML, css: input.document.css.includes(".canvas-v2-grounded-evidence") ? input.document.css : `${input.document.css}\n${FLOW_CSS}` });
  const failures = validateCanvasV2EvidenceBindings(document, evidence);
  if (failures.length) throw new Error(failures.join(" "));
  return { document, evidence, regionNodeId, laneNodeId };
}
