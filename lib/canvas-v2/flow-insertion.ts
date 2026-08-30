import type { AppDataApp, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";
import { assertCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "@/lib/canvas-v2/artifact-safety";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset, CanvasV2EvidencePacket } from "@/lib/canvas-v2/types";

export interface CanvasV2FlowInsertion {
  document: CanvasV2ArtifactDocument;
  evidence: CanvasV2EvidenceAsset[];
  regionNodeId: string;
  laneNodeId: string;
}

const FLOW_CSS = `
/* canvas-v2-flow-layout-v5: complete canonical journeys stay on one finite intrinsic horizontal rail */
.northstar-canvas.canvas-v2-canvas--evidence-wide { box-sizing:border-box; width:100%; min-width:100%; min-height:100%; max-width:none; padding:0; overflow:visible; }
.canvas-v2-grounded-evidence { box-sizing:border-box; width:max-content; min-width:0; max-width:none; padding:0; background:transparent; color:var(--northstar-ink); font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
.canvas-v2-grounded-evidence--standalone { min-width:1680px; padding:52px 0 96px 96px; background:transparent; }
.canvas-v2-grounded-title { margin:0 0 28px; color:var(--northstar-ink); font-size:11px; font-weight:850; letter-spacing:.18em; text-transform:uppercase; }
.canvas-v2-flow-lane { display:grid; grid-template-columns:170px max-content; align-items:start; gap:24px; width:max-content; min-width:0; max-width:none; min-height:270px; padding:16px 0; }
.canvas-v2-flow-identity { display:flex; align-items:center; gap:12px; align-self:start; padding-top:94px; }
.canvas-v2-flow-icon { width:46px; height:46px; flex:none; border-radius:13px; object-fit:contain; box-shadow:0 10px 24px rgba(39,30,93,.10); }
.canvas-v2-flow-app { margin:0; color:var(--northstar-ink); font-size:18px; font-weight:850; letter-spacing:-.02em; }
.canvas-v2-flow-meta { margin:3px 0 0; max-width:118px; color:var(--northstar-muted); font-size:12px; font-weight:580; line-height:1.35; }
.canvas-v2-flow-sequence { display:flex; flex-flow:row nowrap; align-items:flex-end; width:max-content; min-width:0; max-width:none; column-gap:10px; padding-right:0; overflow:visible; }
.canvas-v2-flow-screen { display:block; width:auto; height:235px; max-width:none; flex:none; object-fit:contain; filter:drop-shadow(0 12px 20px rgba(32,24,80,.09)); }
.canvas-v2-flow-segment { box-sizing:border-box; display:grid; grid-template-columns:1px minmax(0,1fr); column-gap:14px; width:132px; height:235px; flex:none; align-items:start; color:var(--northstar-muted); font-size:10px; font-weight:820; line-height:1.45; letter-spacing:.08em; text-transform:uppercase; }
.canvas-v2-flow-segment-rule { width:1px; height:235px; background:var(--northstar-line); }
.canvas-v2-flow-segment-label { display:-webkit-box; max-width:102px; margin-top:12px; overflow:hidden; overflow-wrap:normal; word-break:normal; -webkit-box-orient:vertical; -webkit-line-clamp:4; }
.canvas-v2-flow-segment--branch { color:var(--northstar-violet); }
.canvas-v2-flow-segment--branch .canvas-v2-flow-segment-rule { background:var(--northstar-violet); }
`;

function stableTokenHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

/**
 * Tenant taxonomy ids can share a long generated prefix. A plain truncation
 * therefore collapses distinct entry/branch segments into one DOM identity.
 * Keep a readable stem while suffixing a hash of the complete source value.
 */
export function canvasV2StableNodeToken(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "flow";
  return `${normalized.slice(0, 48)}-${stableTokenHash(value)}`;
}

export function canvasV2CompactJourneySegmentLabel(value: string): string {
  const parts = value.split(/\s+(?:→|>)\s+|\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return value;
  return `${parts[0]} → ${parts.at(-1)}`;
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
  packet?: CanvasV2EvidencePacket;
}): CanvasV2FlowInsertion {
  if (typeof DOMParser === "undefined") throw new Error("Flow insertion requires a browser document.");
  const screenEvidence = input.flow.screens.map((screen) => input.evidence.find((asset) => asset.id === `screen:${screen.id}`)).filter((asset): asset is CanvasV2EvidenceAsset => Boolean(asset));
  if (!screenEvidence.length) throw new Error("This flow has no renderable screenshots.");

  const parsed = new DOMParser().parseFromString(`<body>${input.document.html}</body>`, "text/html");
  const host = parsed.querySelector<HTMLElement>('[data-canvas-v2-node-id="canvas"]') ?? parsed.querySelector<HTMLElement>("main") ?? parsed.body;
  if (host !== parsed.body) host.classList.add("canvas-v2-canvas--evidence-wide");
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
  if (region.dataset.canvasV2SceneLayout === "absolute") {
    // Undo/redo serializes accepted native geometry as an absolute compatibility
    // surface. Its x/y/width remain the durable placement authority, but a
    // compiler-owned fixed height would make a later research lane overflow
    // the old rail and collide with downstream evidence islands. Release only
    // that height: the next native compile remeasures the expanded rail, keeps
    // its anchor, and reflows related followers by the measured growth.
    region.style.removeProperty("--canvas-v2-scene-height");
  }
  region.dataset.canvasV2LayoutVersion = "5";

  const laneNodeId = `flow-${canvasV2StableNodeToken(input.app.name)}-${canvasV2StableNodeToken(input.flow.id)}`;
  const existing = Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).find((element) => element.dataset.canvasV2NodeId === laneNodeId);
  if (existing) throw new Error(`${input.flow.name} is already on the canvas.`);
  const lane = parsed.createElement("article");
  lane.className = "canvas-v2-flow-lane";
  lane.dataset.canvasV2NodeId = laneNodeId;
  lane.dataset.canvasV2CanonicalFlow = input.flow.id;
  const packet = input.packet;
  const packetId = packet?.id ?? screenEvidence.map((asset) => asset.packetId).find((value): value is string => Boolean(value));
  // Heal any pre-9.5 generic sequence packet that may already exist in a
  // continued canvas. Once the canonical flow is inserted, its complete rail
  // is the sole visible product witness; stale metadata furniture must not
  // survive beside it.
  if (packetId) {
    Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-evidence-packet-id]"))
      .filter((candidate) => candidate.dataset.canvasV2EvidencePacketId === packetId
        || Boolean(packet?.continuationKey && candidate.dataset.canvasV2EvidenceContinuation === packet.continuationKey))
      .forEach((candidate) => candidate.remove());
    parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-evidence-region=packets]").forEach((packetRegion) => {
      if (!packetRegion.querySelector("[data-canvas-v2-evidence-packet-id]")) packetRegion.remove();
    });
  }
  if (packetId) lane.dataset.canvasV2EvidencePacketId = packetId;
  if (packet?.source.sourceId) lane.dataset.canvasV2EvidenceSourceId = packet.source.sourceId;
  lane.dataset.canvasV2EvidenceAuthority = packet?.authority ?? "observed";
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
  const segmentByStartIndex = new Map((input.flow.journeySegments ?? []).map((segment) => [segment.startIndex, segment]));
  screenEvidence.forEach((asset, index) => {
    const segment = segmentByStartIndex.get(index);
    if (segment) {
      const marker = parsed.createElement("div");
      marker.className = `canvas-v2-flow-segment canvas-v2-flow-segment--${segment.kind}`;
      marker.dataset.canvasV2NodeId = `${laneNodeId}-segment-${canvasV2StableNodeToken(segment.id)}`;
      marker.dataset.canvasV2JourneySegment = segment.id;
      marker.dataset.canvasV2SegmentKind = segment.kind;
      marker.title = segment.name;
      marker.setAttribute("aria-label", segment.name);
      const markerRule = parsed.createElement("div");
      markerRule.className = "canvas-v2-flow-segment-rule";
      markerRule.dataset.canvasV2NodeId = `${marker.dataset.canvasV2NodeId}-rule`;
      const markerLabel = parsed.createElement("span");
      markerLabel.className = "canvas-v2-flow-segment-label";
      markerLabel.dataset.canvasV2NodeId = `${marker.dataset.canvasV2NodeId}-label`;
      markerLabel.textContent = canvasV2CompactJourneySegmentLabel(segment.name);
      marker.removeAttribute("data-canvas-v2-node-id");
      marker.append(markerRule, markerLabel);
      sequence.append(marker);
    }
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
  region.dataset.canvasV2Origin = "research";
  for (const element of Array.from(region.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))) {
    if (!element.dataset.canvasV2Origin) element.dataset.canvasV2Origin = "research";
  }

  const evidence = mergeEvidence(input.currentEvidence, input.evidence.filter((asset) => asset.id === `icon:${input.app.id}` || screenEvidence.some((screen) => screen.id === asset.id)));
  const document = assertCanvasV2ArtifactDocument({ ...input.document, html: parsed.body.innerHTML, css: input.document.css.includes("canvas-v2-flow-layout-v4") ? input.document.css : `${input.document.css}\n${FLOW_CSS}` });
  const failures = validateCanvasV2EvidenceBindings(document, evidence);
  if (failures.length) throw new Error(failures.join(" "));
  return { document, evidence, regionNodeId, laneNodeId };
}
