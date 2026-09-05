import { CANVAS_V2_NATIVE_SCENE_SCHEMA, type CanvasV2NativeClipboard } from "./native-scene";
import { canvasV2NativeTextMarkup } from "./rich-text";

export const CANVAS_V2_CLIPBOARD_MARKER = "data-northstar-clipboard";
export function encodeCanvasV2Clipboard(clipboard: CanvasV2NativeClipboard): { html: string; text: string } {
  const payload = encodeURIComponent(JSON.stringify(clipboard));
  const byId = new Map(clipboard.scene.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const read = (id: string): string => {
    if (seen.has(id)) return "";
    seen.add(id);
    const node = byId.get(id);
    if (!node) return "";
    const value = node.content.map((item) => item.kind === "text" ? item.value : read(item.id)).join("");
    return value + (["div", "p", "li", "tr", "br"].includes(node.tagName) ? "\n" : node.tagName === "td" ? "\t" : "");
  };
  const text = clipboard.scene.rootIds.map(read).join("\n").trimEnd();
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const rich = clipboard.scene.rootIds.map((id) => byId.get(id)).filter((node) => node?.kind === "text").map((node) => `<div>${canvasV2NativeTextMarkup(node!, byId)}</div>`).join("");
  return { html: `<div ${CANVAS_V2_CLIPBOARD_MARKER}="${payload}">${rich || escaped}</div>`, text };
}
export function decodeCanvasV2Clipboard(html: string): CanvasV2NativeClipboard | undefined {
  const encoded = html.match(/data-northstar-clipboard="([^"]+)"/)?.[1];
  if (!encoded || encoded.length > 28_000_000) return undefined;
  try {
    const snapshot = JSON.parse(decodeURIComponent(encoded)) as CanvasV2NativeClipboard;
    const scene = snapshot.scene;
    if (scene?.schema !== CANVAS_V2_NATIVE_SCENE_SCHEMA || !Array.isArray(scene.nodes) || !Array.isArray(scene.rootIds) || scene.nodes.length > 10_000) return undefined;
    if (!scene.nodes.length || typeof scene.css !== "string" || typeof scene.revisionId !== "string" || !Number.isFinite(scene.width) || !Number.isFinite(scene.height)) return undefined;
    if (snapshot.evidenceAssets !== undefined && (!Array.isArray(snapshot.evidenceAssets) || !snapshot.evidenceAssets.every((asset) => asset && typeof asset.id === "string" && typeof asset.url === "string" && typeof asset.label === "string"))) return undefined;
    const ids = new Set(scene.nodes.map((node) => node.id));
    if (ids.size !== scene.nodes.length || !scene.rootIds.every((id) => ids.has(id))) return undefined;
    for (const node of scene.nodes) {
      if (typeof node.id !== "string" || !node.id || typeof node.tagName !== "string" || !/^[a-z][a-z0-9]*$/i.test(node.tagName) || !["html", "svg"].includes(node.namespace)) return undefined;
      if (node.sourceNodeId !== undefined && typeof node.sourceNodeId !== "string") return undefined;
      if (!node.geometry || !Object.values(node.geometry).every(Number.isFinite) || !node.attributes || !node.inlineStyle || !Array.isArray(node.content) || !Array.isArray(node.childIds)) return undefined;
      if (!Object.values(node.attributes).every((value) => typeof value === "string") || !Object.values(node.inlineStyle).every((value) => typeof value === "string")) return undefined;
      if (!node.childIds.every((id) => ids.has(id)) || node.childIds.includes(node.id)) return undefined;
      if (!node.content.every((item) => item && (item.kind === "text" ? typeof item.value === "string" : item.kind === "node" && node.childIds.includes(item.id)))) return undefined;
      const contentIds = node.content.flatMap((item) => item.kind === "node" ? [item.id] : []);
      if (contentIds.length !== node.childIds.length || new Set(contentIds).size !== contentIds.length || !node.childIds.every((id) => contentIds.includes(id))) return undefined;
    }
    // Validate the tree before recursive clone/serialization, including cycles.
    const byId = new Map(scene.nodes.map((node) => [node.id, node]));
    if (!scene.rootIds.every((id) => !byId.get(id)?.parentId)) return undefined;
    if (!scene.nodes.every((node) => node.childIds.every((id) => byId.get(id)?.parentId === node.id))) return undefined;
    const sourceIds = scene.nodes.flatMap((node) => node.sourceNodeId ? [node.sourceNodeId] : []);
    if (new Set(sourceIds).size !== sourceIds.length) return undefined;
    const seen = new Set<string>();
    const visit = (id: string): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      return byId.get(id)!.childIds.every(visit);
    };
    if (!scene.rootIds.every(visit) || seen.size !== scene.nodes.length) return undefined;
    return snapshot;
  } catch { return undefined; }
}

/** TSV supports spreadsheet quoted fields, tabs and multiline cells. */
export function parseCanvasV2TabularText(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && (quoted || !cell)) {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n" || char === "\r")) {
      rows.at(-1)!.push(cell); cell = "";
      if (char !== "\t") { if (char === "\r" && text[i + 1] === "\n") i += 1; rows.push([]); }
    } else cell += char;
  }
  rows.at(-1)!.push(cell);
  if (rows.length > 1 && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "") rows.pop();
  return rows;
}
