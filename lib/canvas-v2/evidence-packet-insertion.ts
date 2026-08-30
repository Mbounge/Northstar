import { assertCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "@/lib/canvas-v2/artifact-safety";
import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import { mergeCanvasV2EvidenceAssets, mergeCanvasV2EvidencePackets } from "@/lib/canvas-v2/evidence-packets";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset, CanvasV2EvidencePacket } from "@/lib/canvas-v2/types";

export interface CanvasV2EvidencePacketInsertion {
  document: CanvasV2ArtifactDocument;
  evidence: CanvasV2EvidenceAsset[];
  evidencePackets: CanvasV2EvidencePacket[];
  packetNodeIds: string[];
}

export const CANVAS_V2_EVIDENCE_PACKET_CSS = `
/* canvas-v2-evidence-packets-v2: source-native snapshot grammars remain inspectable */
.canvas-v2-evidence-packet-region { --canvas-v2-packet-ink:#151620; --canvas-v2-packet-muted:#555968; --canvas-v2-packet-accent:#5f49e8; --canvas-v2-packet-line:rgba(66,54,123,.20); --canvas-v2-packet-soft:#f4f1ff; box-sizing:border-box; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; gap:56px 34px; width:min(2760px,100%); padding:56px 0 104px; color:var(--canvas-v2-packet-ink); font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
:root[data-canvas-v2-theme="dark"] .canvas-v2-evidence-packet-region { --canvas-v2-packet-ink:#f4f3f8; --canvas-v2-packet-muted:#c7c3cf; --canvas-v2-packet-accent:#aa9cff; --canvas-v2-packet-line:rgba(255,255,255,.16); --canvas-v2-packet-soft:#24202f; }
.canvas-v2-evidence-packet { box-sizing:border-box; display:grid; gap:24px; min-width:0; padding:34px 0 52px; border:0; border-top:1px solid var(--canvas-v2-packet-line); border-radius:0; background:transparent; box-shadow:none; overflow:visible; }
.canvas-v2-evidence-packet--wide { grid-column:1/-1; }
.canvas-v2-evidence-packet--marketing,.canvas-v2-evidence-packet--business { grid-column:1/-1; }
.canvas-v2-evidence-packet--external { grid-column:1/-1; grid-template-columns:minmax(300px,.72fr) minmax(0,1.28fr); column-gap:64px; padding:44px 0 64px; border-top:2px solid var(--canvas-v2-packet-accent); }
.canvas-v2-evidence-packet--external>header { grid-column:1; }
.canvas-v2-evidence-packet--external>.canvas-v2-evidence-packet__facts,.canvas-v2-evidence-packet--external>.canvas-v2-evidence-packet__media { grid-column:2; grid-row:1/span 2; }
.canvas-v2-evidence-packet--external>.canvas-v2-evidence-packet__limits { grid-column:1; }
.canvas-v2-evidence-packet--external .canvas-v2-evidence-packet__title { font-family:Georgia,"Times New Roman",serif; font-size:42px; font-weight:520; line-height:1.03; letter-spacing:-.035em; }
.canvas-v2-evidence-packet--external .canvas-v2-evidence-fact { padding:18px 0 22px; }
.canvas-v2-evidence-packet--external .canvas-v2-evidence-fact__value { max-width:62ch; font-size:18px; line-height:1.48; }
.canvas-v2-evidence-packet--external .canvas-v2-evidence-packet__image { height:420px; border-radius:8px; }
.canvas-v2-evidence-packet--marketing { grid-template-columns:minmax(0,1.55fr) minmax(340px,.45fr); padding:42px 0 60px; }
.canvas-v2-evidence-packet--business { grid-template-columns:minmax(0,1.35fr) minmax(360px,.65fr); padding:42px 0 60px; border-top:4px solid var(--canvas-v2-packet-accent); }
.canvas-v2-evidence-packet--marketing>header,.canvas-v2-evidence-packet--business>header,.canvas-v2-evidence-packet--marketing>.canvas-v2-evidence-packet__limits,.canvas-v2-evidence-packet--business>.canvas-v2-evidence-packet__limits { grid-column:1/-1; }
.canvas-v2-evidence-packet--marketing>.canvas-v2-evidence-packet__media { grid-column:1; grid-row:2/span 2; grid-template-columns:repeat(auto-fit,minmax(360px,560px)); }
.canvas-v2-evidence-packet--marketing>.canvas-v2-evidence-packet__facts,.canvas-v2-evidence-packet--marketing>.canvas-v2-evidence-packet__metrics { grid-column:2; grid-template-columns:1fr; align-content:start; }
.canvas-v2-evidence-packet--business>.canvas-v2-evidence-packet__media { grid-column:1; grid-template-columns:repeat(auto-fit,minmax(300px,460px)); }
.canvas-v2-evidence-packet--business>.canvas-v2-evidence-packet__facts { grid-column:2; grid-template-columns:1fr; align-content:start; }
.canvas-v2-evidence-packet--business>.canvas-v2-evidence-packet__metrics { grid-column:1/-1; grid-template-columns:repeat(3,minmax(0,1fr)); }
.canvas-v2-evidence-packet--business.canvas-v2-evidence-packet--textual>.canvas-v2-evidence-packet__facts { grid-column:1; grid-template-columns:repeat(2,minmax(0,1fr)); }
.canvas-v2-evidence-packet--business.canvas-v2-evidence-packet--textual>.canvas-v2-evidence-packet__metrics { grid-column:2; grid-template-columns:1fr; }
.canvas-v2-evidence-packet__eyebrow,.canvas-v2-evidence-packet__authority { margin:0; color:var(--canvas-v2-packet-accent); font-size:11px; font-weight:880; letter-spacing:.17em; text-transform:uppercase; }
.canvas-v2-evidence-packet__title { margin:7px 0 0; max-width:24ch; color:var(--canvas-v2-packet-ink); font-size:38px; font-weight:780; line-height:.98; letter-spacing:-.045em; }
.canvas-v2-evidence-packet__summary { margin:12px 0 0; max-width:72ch; color:var(--canvas-v2-packet-muted); font-size:15px; font-weight:540; line-height:1.55; }
.canvas-v2-evidence-packet__source { display:flex; flex-wrap:wrap; gap:7px 16px; margin-top:18px; padding-top:15px; border-top:1px solid var(--canvas-v2-packet-line); color:var(--canvas-v2-packet-muted); font-size:11px; font-weight:580; line-height:1.45; }
.canvas-v2-evidence-packet__source strong { color:var(--canvas-v2-packet-ink); }
.canvas-v2-evidence-packet__source a { color:var(--canvas-v2-packet-accent); font-weight:720; text-decoration:none; }
.canvas-v2-evidence-packet__source a:hover { text-decoration:underline; }
.canvas-v2-evidence-packet__facts,.canvas-v2-evidence-packet__metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 18px; }
.canvas-v2-evidence-fact,.canvas-v2-evidence-metric { min-width:0; padding:15px 0; border-top:1px solid var(--canvas-v2-packet-line); }
.canvas-v2-evidence-fact__label,.canvas-v2-evidence-metric__label { margin:0; color:var(--canvas-v2-packet-muted); font-size:9px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
.canvas-v2-evidence-fact__value,.canvas-v2-evidence-metric__value { margin:7px 0 0; color:var(--canvas-v2-packet-ink); font-size:16px; font-weight:680; line-height:1.4; overflow-wrap:anywhere; }
.canvas-v2-evidence-metric__value { color:var(--canvas-v2-packet-accent); font-size:28px; letter-spacing:-.035em; }
.canvas-v2-evidence-metric__definition { margin:5px 0 0; color:var(--canvas-v2-packet-muted); font-size:10px; font-weight:540; line-height:1.45; }
.canvas-v2-evidence-packet__media { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); align-items:start; gap:20px; }
.canvas-v2-evidence-capture { min-width:0; margin:0; padding:0; border:0; border-radius:0; background:transparent; }
.canvas-v2-evidence-capture--marketing { padding:0; box-shadow:none; }
.canvas-v2-evidence-packet__image { display:block; width:100%; height:320px; max-width:100%; border-radius:12px; object-fit:contain; background:var(--canvas-v2-packet-soft); filter:drop-shadow(0 10px 20px rgba(32,24,80,.08)); }
.canvas-v2-evidence-capture--marketing .canvas-v2-evidence-packet__image { height:460px; }
.canvas-v2-evidence-capture__caption { display:grid; gap:5px; margin-top:13px; color:var(--canvas-v2-packet-muted); font-size:11px; font-weight:560; line-height:1.45; }
.canvas-v2-evidence-capture__caption strong { color:var(--canvas-v2-packet-ink); font-size:13px; }
.canvas-v2-evidence-packet__limits { margin:0; padding-top:16px; border-top:1px solid var(--canvas-v2-packet-line); color:var(--canvas-v2-packet-muted); font-size:11px; font-weight:540; line-height:1.55; }
`;

export function canvasV2EvidencePacketAssetBinding(
  evidenceId: string,
  canonicalSourceByEvidenceId: ReadonlyMap<string, string>,
): { role: "reference" | "analysis-copy"; sourceNodeId?: string; scaleIntent?: "identity-mark" } {
  const sourceNodeId = canonicalSourceByEvidenceId.get(evidenceId);
  return sourceNodeId
    ? { role: "analysis-copy", sourceNodeId, scaleIntent: "identity-mark" }
    : { role: "reference" };
}

function safeToken(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const readable = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 38) || "evidence";
  return `${readable}-${(hash >>> 0).toString(36)}`;
}

function hasAttributeValue(html: string, attribute: string, value: string): boolean {
  return html.includes(`${attribute}="${value}"`) || html.includes(`${attribute}='${value}'`);
}

function displaySourceHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Original source";
  }
}

const CANVAS_V2_EVIDENCE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function displayCanvasV2EvidenceTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  const date = `${CANVAS_V2_EVIDENCE_MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCDate()}, ${parsed.getUTCFullYear()}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return date;
  return `${date} · ${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/**
 * A provider packet is discovery memory only until every source object has a
 * native DOM binding. Keep this check pure so the server can defer synthesis
 * and the browser can materialize the exact same packet transaction.
 */
export function canvasV2EvidencePacketsNeedingMaterialization(
  document: CanvasV2ArtifactDocument,
  packets: readonly CanvasV2EvidencePacket[],
): CanvasV2EvidencePacket[] {
  return packets.filter((packet) => {
    if (packet.presentation?.state === "graph-only") return false;
    // Ordered product capture packets are discovery memory plus canonical-rail
    // lineage. They never earn a second generic packet surface, even during the
    // brief transaction before their flow shell is committed. The canonical
    // flow compiler is the only visible grammar for a complete app journey.
    if (packet.kind === "screenshot-sequence") return false;
    const shellExists = hasAttributeValue(document.html, "data-canvas-v2-evidence-packet-id", packet.id)
      || Boolean(packet.continuationKey && hasAttributeValue(document.html, "data-canvas-v2-evidence-continuation", packet.continuationKey));
    // A canonical product journey is already the premium visible witness: it
    // carries app identity, ordered screenshots, scope, and exact packet/source
    // lineage. Appending packet facts and limitations into that same lane
    // duplicates provenance as narrow diagnostic columns and damages the
    // evidence presentation. Keep those packet facts in discovery memory;
    // marketing, business, and promoted external witnesses still earn their
    // own source-native visible treatment below.
    if (shellExists && packet.kind === "screenshot") return false;
    if (!shellExists) return true;
    return packet.assets.some((asset) => !hasAttributeValue(document.html, "data-canvas-v2-evidence-id", asset.id))
      || packet.facts.some((fact) => !hasAttributeValue(document.html, "data-canvas-v2-evidence-fact-id", fact.id))
      || packet.metrics.some((metric) => !hasAttributeValue(document.html, "data-canvas-v2-evidence-metric-id", metric.id));
  });
}

function addText(parsed: Document, parent: Element, tag: string, className: string, nodeId: string, value: string): HTMLElement {
  const element = parsed.createElement(tag);
  element.className = className;
  element.dataset.canvasV2NodeId = nodeId;
  element.dataset.canvasV2Origin = "research";
  element.textContent = value;
  parent.append(element);
  return element;
}

function ensurePacketShell(parsed: Document, host: HTMLElement, packet: CanvasV2EvidencePacket): HTMLElement {
  const existing = Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-evidence-packet-id]")).find((element) => element.dataset.canvasV2EvidencePacketId === packet.id || Boolean(packet.continuationKey && element.dataset.canvasV2EvidenceContinuation === packet.continuationKey));
  if (existing) return existing;
  let region = parsed.querySelector<HTMLElement>("[data-canvas-v2-evidence-region=packets]");
  if (!region) {
    region = parsed.createElement("section");
    region.className = "canvas-v2-evidence-packet-region";
    region.dataset.canvasV2NodeId = "grounded-evidence-packets";
    region.dataset.canvasV2EvidenceRegion = "packets";
    region.dataset.canvasV2Origin = "research";
    host.append(region);
  }
  const token = safeToken(packet.continuationKey ?? packet.id);
  const article = parsed.createElement("article");
  const external = packet.source.providerId === "openai-web-search" || packet.source.sourceType === "web-page" || packet.source.sourceType === "web-image" || packet.source.sourceType === "report";
  const domainClass = external
    ? "canvas-v2-evidence-packet--external"
    : packet.kind === "marketing-signal"
    ? "canvas-v2-evidence-packet--marketing"
    : packet.kind === "business-record"
      ? "canvas-v2-evidence-packet--business"
      : "canvas-v2-evidence-packet--generic";
  article.className = `canvas-v2-evidence-packet ${domainClass}${packet.assets.length > 2 ? " canvas-v2-evidence-packet--wide" : ""}${packet.assets.length ? "" : " canvas-v2-evidence-packet--textual"}`;
  article.dataset.canvasV2NodeId = `evidence-packet-${token}`;
  article.dataset.canvasV2IslandId = `evidence-packet-${token}`;
  // Provider-rendered evidence is compiler-owned source material, not a
  // model-authored narrative region. Marking it as a design region makes the
  // composition validator demand title-island semantics and lets a later
  // model repair rewrite source furniture. Stable island identity is enough
  // for native selection, movement, editing, and source inspection.
  article.dataset.canvasV2VisualRole = "grounded-evidence-island";
  article.dataset.canvasV2Origin = "research";
  article.dataset.canvasV2EvidencePacketId = packet.id;
  article.dataset.canvasV2EvidenceDomain = external ? "external" : packet.kind === "marketing-signal" ? "marketing" : packet.kind === "business-record" ? "business" : "general";
  article.dataset.canvasV2EvidenceSourceId = packet.source.sourceId;
  article.dataset.canvasV2EvidenceAuthority = packet.authority;
  if (packet.continuationKey) article.dataset.canvasV2EvidenceContinuation = packet.continuationKey;
  const header = parsed.createElement("header");
  header.dataset.canvasV2NodeId = `${article.dataset.canvasV2NodeId}-header`;
  header.dataset.canvasV2Origin = "research";
  addText(parsed, header, "p", "canvas-v2-evidence-packet__eyebrow", `${article.dataset.canvasV2NodeId}-eyebrow`, `${external ? "external witness" : packet.kind.replaceAll("-", " ")} · ${packet.source.providerLabel}`);
  addText(parsed, header, "h2", "canvas-v2-evidence-packet__title", `${article.dataset.canvasV2NodeId}-title`, packet.title);
  addText(parsed, header, "p", "canvas-v2-evidence-packet__summary", `${article.dataset.canvasV2NodeId}-summary`, packet.summary);
  const sourceLine = parsed.createElement("div");
  sourceLine.className = "canvas-v2-evidence-packet__source";
  sourceLine.dataset.canvasV2NodeId = `${article.dataset.canvasV2NodeId}-source`;
  sourceLine.dataset.canvasV2Origin = "research";
  sourceLine.dataset.canvasV2EvidenceSourceId = packet.source.sourceId;
  addText(parsed, sourceLine, "strong", "", `${article.dataset.canvasV2NodeId}-source-label`, external ? "Source · Web search" : `Source · ${packet.source.label}`);
  if (packet.source.sourceUrl) {
    const sourceLink = parsed.createElement("a");
    sourceLink.dataset.canvasV2NodeId = `${article.dataset.canvasV2NodeId}-source-link`;
    sourceLink.dataset.canvasV2Origin = "research";
    sourceLink.href = packet.source.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    sourceLink.textContent = packet.source.publisher ?? displaySourceHostname(packet.source.sourceUrl);
    sourceLine.append(sourceLink);
  }
  addText(parsed, sourceLine, "span", "", `${article.dataset.canvasV2NodeId}-source-time`, `${packet.source.publishedAt ? `Published ${displayCanvasV2EvidenceTimestamp(packet.source.publishedAt)} · ` : ""}Retrieved ${displayCanvasV2EvidenceTimestamp(packet.source.retrievedAt)}${packet.source.capturedAt ? ` · Captured ${displayCanvasV2EvidenceTimestamp(packet.source.capturedAt)}` : ""}`);
  header.append(sourceLine);
  article.append(header);
  region.append(article);
  return article;
}

function appendPacketContent(
  parsed: Document,
  article: HTMLElement,
  packet: CanvasV2EvidencePacket,
  canonicalSourceByEvidenceId: ReadonlyMap<string, string>,
): void {
  const articleNodeId = article.dataset.canvasV2NodeId!;
  if (packet.facts.length) {
    let facts = article.querySelector<HTMLElement>(":scope > .canvas-v2-evidence-packet__facts");
    if (!facts) {
      facts = parsed.createElement("section");
      facts.className = "canvas-v2-evidence-packet__facts";
      facts.dataset.canvasV2NodeId = `${articleNodeId}-facts`;
      facts.dataset.canvasV2Origin = "research";
      article.append(facts);
    }
    for (const fact of packet.facts) {
      if (article.querySelector(`[data-canvas-v2-evidence-fact-id="${CSS.escape(fact.id)}"]`)) continue;
      const token = safeToken(fact.id);
      const item = parsed.createElement("article");
      item.className = "canvas-v2-evidence-fact";
      item.dataset.canvasV2NodeId = `${articleNodeId}-fact-${token}`;
      item.dataset.canvasV2EvidenceFactId = fact.id;
      item.dataset.canvasV2EvidenceAuthority = fact.authority;
      item.dataset.canvasV2Origin = "research";
      addText(parsed, item, "p", "canvas-v2-evidence-fact__label", `${item.dataset.canvasV2NodeId}-label`, `${fact.label} · ${fact.authority}`);
      addText(parsed, item, "p", "canvas-v2-evidence-fact__value", `${item.dataset.canvasV2NodeId}-value`, fact.value);
      facts.append(item);
    }
  }
  if (packet.metrics.length) {
    let metrics = article.querySelector<HTMLElement>(":scope > .canvas-v2-evidence-packet__metrics");
    if (!metrics) {
      metrics = parsed.createElement("section");
      metrics.className = "canvas-v2-evidence-packet__metrics";
      metrics.dataset.canvasV2NodeId = `${articleNodeId}-metrics`;
      metrics.dataset.canvasV2Origin = "research";
      article.append(metrics);
    }
    for (const metric of packet.metrics) {
      if (article.querySelector(`[data-canvas-v2-evidence-metric-id="${CSS.escape(metric.id)}"]`)) continue;
      const token = safeToken(metric.id);
      const item = parsed.createElement("article");
      item.className = "canvas-v2-evidence-metric";
      item.dataset.canvasV2NodeId = `${articleNodeId}-metric-${token}`;
      item.dataset.canvasV2EvidenceMetricId = metric.id;
      item.dataset.canvasV2EvidenceAuthority = metric.authority;
      item.dataset.canvasV2Origin = "research";
      addText(parsed, item, "p", "canvas-v2-evidence-metric__label", `${item.dataset.canvasV2NodeId}-label`, metric.label);
      addText(parsed, item, "p", "canvas-v2-evidence-metric__value", `${item.dataset.canvasV2NodeId}-value`, `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`);
      addText(parsed, item, "p", "canvas-v2-evidence-metric__definition", `${item.dataset.canvasV2NodeId}-definition`, metric.definition);
      metrics.append(item);
    }
  }
  if (packet.assets.length) {
    let media = article.querySelector<HTMLElement>(":scope > .canvas-v2-evidence-packet__media");
    if (!media) {
      media = parsed.createElement("section");
      media.className = "canvas-v2-evidence-packet__media";
      media.dataset.canvasV2NodeId = `${articleNodeId}-media`;
      media.dataset.canvasV2Origin = "research";
      article.append(media);
    }
    for (const asset of packet.assets) {
      if (article.querySelector(`[data-canvas-v2-evidence-id="${CSS.escape(asset.id)}"]`)) continue;
      const figure = parsed.createElement("figure");
      const captureKind = packet.kind === "marketing-signal" ? "marketing" : packet.kind === "business-record" ? "business" : "general";
      figure.className = `canvas-v2-evidence-capture canvas-v2-evidence-capture--${captureKind}`;
      figure.dataset.canvasV2NodeId = `${articleNodeId}-capture-${safeToken(asset.id)}`;
      figure.dataset.canvasV2Origin = "research";
      const image = parsed.createElement("img");
      image.className = "canvas-v2-evidence-packet__image";
      image.dataset.canvasV2NodeId = `${articleNodeId}-asset-${safeToken(asset.id)}`;
      image.dataset.canvasV2EvidenceId = asset.id;
      const binding = canvasV2EvidencePacketAssetBinding(asset.id, canonicalSourceByEvidenceId);
      image.dataset.canvasV2EvidenceRole = binding.role;
      if (binding.sourceNodeId) image.dataset.canvasV2SourceNodeId = binding.sourceNodeId;
      if (binding.scaleIntent) image.dataset.canvasV2ScaleIntent = binding.scaleIntent;
      image.dataset.canvasV2EvidenceAuthority = asset.authority ?? packet.authority;
      image.dataset.canvasV2Origin = "research";
      image.src = asset.url;
      image.alt = asset.label;
      const caption = parsed.createElement("figcaption");
      caption.className = "canvas-v2-evidence-capture__caption";
      caption.dataset.canvasV2NodeId = `${figure.dataset.canvasV2NodeId}-caption`;
      caption.dataset.canvasV2Origin = "research";
      addText(parsed, caption, "strong", "", `${figure.dataset.canvasV2NodeId}-label`, asset.label);
      if (asset.description) addText(parsed, caption, "span", "", `${figure.dataset.canvasV2NodeId}-description`, asset.description);
      if (asset.capturedAt) addText(parsed, caption, "span", "", `${figure.dataset.canvasV2NodeId}-captured`, `Captured ${asset.capturedAt}`);
      figure.append(image, caption);
      media.append(figure);
    }
  }
  if (packet.limitations.length && !article.querySelector(":scope > .canvas-v2-evidence-packet__limits")) {
    addText(parsed, article, "p", "canvas-v2-evidence-packet__limits", `${articleNodeId}-limitations`, `Boundary · ${packet.limitations.join(" ")}`);
  }
}

export function insertCanvasV2EvidencePackets(input: {
  document: CanvasV2ArtifactDocument;
  currentEvidence: readonly CanvasV2EvidenceAsset[];
  currentPackets?: readonly CanvasV2EvidencePacket[];
  packets: readonly CanvasV2EvidencePacket[];
}): CanvasV2EvidencePacketInsertion {
  if (typeof DOMParser === "undefined") throw new Error("Evidence packet insertion requires a browser document.");
  if (!input.packets.length) return { document: input.document, evidence: [...input.currentEvidence], evidencePackets: [...(input.currentPackets ?? [])], packetNodeIds: [] };
  const parsed = new DOMParser().parseFromString(`<body>${input.document.html}</body>`, "text/html");
  const canonicalSourceByEvidenceId = new Map(readCanvasV2CanonicalFlowManifests(input.document)
    .flatMap((flow) => flow.items.map((item) => [item.evidenceId, item.nodeId] as const)));
  const host = parsed.querySelector<HTMLElement>('[data-canvas-v2-node-id="canvas"]') ?? parsed.querySelector<HTMLElement>("main") ?? parsed.body;
  const packetNodeIds: string[] = [];
  for (const packet of input.packets) {
    const article = ensurePacketShell(parsed, host, packet);
    appendPacketContent(parsed, article, packet, canonicalSourceByEvidenceId);
    packetNodeIds.push(article.dataset.canvasV2NodeId!);
  }
  const evidencePackets = mergeCanvasV2EvidencePackets(input.currentPackets, input.packets);
  const evidence = mergeCanvasV2EvidenceAssets(input.currentEvidence, input.packets);
  const document = assertCanvasV2ArtifactDocument({
    ...input.document,
    html: parsed.body.innerHTML,
    css: input.document.css.includes("canvas-v2-evidence-packets-v2") ? input.document.css : `${input.document.css}\n${CANVAS_V2_EVIDENCE_PACKET_CSS}`,
  });
  const failures = validateCanvasV2EvidenceBindings(document, evidence);
  if (failures.length) throw new Error(failures.join(" "));
  return { document, evidence, evidencePackets, packetNodeIds };
}
