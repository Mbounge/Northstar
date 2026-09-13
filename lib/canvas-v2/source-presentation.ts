import { findCanvasV2SourceNodeRange } from "./source-patch";
import type { CanvasV2ArtifactDocument, CanvasV2EvidencePacket } from "./types";

/** URL identity belongs to retained evidence, not generated markup. */
export function canvasV2SourceLinkDirectory(packets: readonly CanvasV2EvidencePacket[] = []) {
  const seen = new Set<string>();
  return packets.flatMap(packet => {
    const href = packet.source.canonicalUrl || packet.source.sourceUrl;
    if (!href || seen.has(href)) return [];
    try { const url = new URL(href); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return []; } catch { return []; }
    seen.add(href);
    return [{ handle: `source-${seen.size}`, label: packet.source.label || packet.title, href }];
  });
}

const escapeAttribute = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** Allocate native identity for explicitly authored source labels before compilation. */
export function identifyCanvasV2SourceLabels(html: string, reservedIds: Set<string>): string {
  for (const match of html.matchAll(/\bdata-canvas-v2-node-id\s*=\s*(["'])(.*?)\1/gi)) reservedIds.add(match[2]);
  let serial = 0;
  return html.replace(/<(a|span|p|div)\b([^>]*)>([^<>]+)<\/\1>/gi, (original, tag: string, attrs: string, label: string) => {
    if (!/\bdata-canvas-v2-source-handle\s*=/.test(attrs) || /\bdata-canvas-v2-node-id\s*=/.test(attrs) || !label.trim()) return original;
    let id: string;
    do { id = `source-label-${++serial}`; } while (reservedIds.has(id));
    reservedIds.add(id);
    return `<${tag}${attrs} data-canvas-v2-node-id="${id}">${label}</${tag}>`;
  });
}

export function bindCanvasV2SourceCitations(input: {
  document: CanvasV2ArtifactDocument;
  citations: unknown;
  directory: ReturnType<typeof canvasV2SourceLinkDirectory>;
  /** Only nodes authored in this patch may receive new bindings. */
  authoredHtml: string;
}): CanvasV2ArtifactDocument {
  if (input.citations !== undefined && (!Array.isArray(input.citations) || input.citations.length > 12)) throw new Error("Source citations must be a bounded list.");
  // Inline source identity keeps the binding with the actual authored label,
  // instead of asking the model to duplicate node IDs in a second structure.
  const inline = Array.from(input.authoredHtml.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)).flatMap(([tag]) => {
    const sourceHandle = /\bdata-canvas-v2-source-handle\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
    if (!sourceHandle) return [];
    const nodeId = /\bdata-canvas-v2-node-id\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
    return [{ sourceHandle, nodeId }];
  });
  const citations = [...inline, ...(Array.isArray(input.citations) ? input.citations : [])];
  let html = input.document.html;
  const seen = new Map<string, string>();
  for (const citation of citations) {
    if (!citation || typeof citation !== "object") throw new Error("A source citation requires a source handle and a text node.");
    const source = input.directory.find(item => item.handle === citation.sourceHandle);
    if (!source) throw new Error("Choose an exact source handle from sourceLinkDirectory.");
    const nodeId = citation.nodeId;
    if (typeof nodeId !== "string" || !findCanvasV2SourceNodeRange(input.authoredHtml, nodeId)) throw new Error(`Source ${citation.sourceHandle} must bind a text node authored in this patch; missing node: ${String(nodeId)}. Put data-canvas-v2-source-handle on its identified leaf label.`);
    if (seen.get(nodeId) === citation.sourceHandle) continue;
    if (seen.has(nodeId)) throw new Error(`Source label ${nodeId} cannot link to two different sources. Author separate leaf labels.`);
    const range = findCanvasV2SourceNodeRange(html, nodeId);
    if (!range) throw new Error("The source citation text node is missing.");
    const opening = html.slice(range.start, range.openEnd);
    const content = html.slice(range.openEnd, range.closeStart);
    if (!/^<(?:a|span|p|div)\b/i.test(opening) || /<[^>]+>/.test(content) || !content.trim()) throw new Error("A citation must target a short leaf text label, not a container or image.");
    const attributes = opening.replace(/^<\w+\b/, "").replace(/>$/, "")
      .replace(/\s+(?:href|target|rel)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
    const linked = `<a${attributes} href="${escapeAttribute(source.href)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
    html = html.slice(0, range.start) + linked + html.slice(range.end);
    seen.set(nodeId, citation.sourceHandle);
  }
  return { ...input.document, html };
}

/** Suppress only compiler provenance badges, never claims, quotes or source metadata. */
export function normalizeCanvasV2ProvenanceBadges(html: string): string {
  return html.replace(/<(p|span|div|small|h[1-6])\b([^>]*)>([^<>]{1,100})<\/\1>/gi, (original, tag: string, attributes: string, text: string, offset: number) => {
    const before = html.slice(0, offset).toLowerCase();
    if (["blockquote", "q"].some(tag => Array.from(before.matchAll(new RegExp(`<\\/?${tag}\\b[^>]*>`, "g"))).reduce((depth, match) => depth + (match[0].startsWith("</") ? -1 : 1), 0) > 0)) return original;
    if (/data-canvas-v2-(?:user-edited|last-author)\s*=\s*["'](?:true|user)["']/i.test(attributes)) return original;
    const parts = text.split(/\s*[·|]\s*/);
    const retained = parts.filter(part => !/^(?:(?:human|user)[- ](?:supplied|provided|uploaded)(?:\s+(?:image|evidence|witness|source))*|(?:external|grounded)\s+(?:evidence\s+)?witness)$/i.test(part.trim()));
    return retained.length === parts.length ? original : `<${tag}${attributes}>${retained.join(" · ")}</${tag}>`;
  });
}
