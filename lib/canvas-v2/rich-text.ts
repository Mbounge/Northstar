import type { CanvasV2NativeTextContentUpdate } from "./manual-mutations";
import type { CanvasV2NativeSceneNode } from "./native-scene";

/** Describe the painted text runs, rather than just their container's style. */
export function canvasV2TextStyleSummary(element: Element, range?: Range) {
  const view = element.ownerDocument.defaultView!;
  const styles: CSSStyleDeclaration[] = [];
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  let text = walker.nextNode();
  while (text) {
    const selected = !range || (range.collapsed
      ? text === range.startContainer || text.parentElement === range.startContainer
      : range.intersectsNode(text) && range.comparePoint(text, text.textContent?.length ?? 0) !== -1 && range.comparePoint(text, 0) !== 1);
    if (selected && text.textContent?.trim() && text.parentElement) styles.push(view.getComputedStyle(text.parentElement));
    text = walker.nextNode();
  }
  if (!styles.length) styles.push(view.getComputedStyle(element));
  const uniform = (key: "fontFamily" | "fontSize" | "fontWeight" | "fontStyle" | "textDecorationLine" | "textAlign") => {
    const values = [...new Set(styles.map((style) => style[key]))];
    return values.length === 1 ? values[0] : "mixed";
  };
  return { textColors: [...new Set(styles.map((style) => style.color))], fontFamily: uniform("fontFamily"), fontSize: uniform("fontSize"), fontWeight: uniform("fontWeight"), fontStyle: uniform("fontStyle"), textDecoration: uniform("textDecorationLine"), textAlign: uniform("textAlign") };
}

export function canvasV2TextColorSwatch(colors: readonly string[]): string {
  if (colors.length < 2) return colors[0] || "#f4f3f8";
  return `conic-gradient(from 315deg, ${colors.map((color, index) => `${color} ${index * 100 / colors.length}% ${(index + 1) * 100 / colors.length}%`).join(",")})`;
}

/** React owns the text surface; the browser owns its editable descendants.
 * The native graph still owns their identities, formatting and history. Keeping
 * React fibers out of this subtree lets execCommand split or replace spans
 * without a later reconciliation trying to remove an already replaced node. */
export function canvasV2NativeTextMarkup(node: CanvasV2NativeSceneNode, byId: ReadonlyMap<string, CanvasV2NativeSceneNode>): string {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const seen = new Set<string>([node.id]);
  const content = (owner: CanvasV2NativeSceneNode): string => owner.content.map((item) => {
    if (item.kind === "text") return escape(item.value);
    const child = byId.get(item.id);
    if (!child || seen.has(child.id)) return "";
    seen.add(child.id);
    const tag = /^[a-z][a-z0-9]*$/.test(child.tagName) && !/^(script|style|iframe|object|embed)$/.test(child.tagName) ? child.tagName : "span";
    const attributes: Record<string, string> = {
      ...child.attributes,
      "data-canvas-v2-native-runtime-node": "true",
      "data-canvas-v2-native-scene-id": child.id,
      ...(child.sourceNodeId ? { "data-canvas-v2-node-id": child.sourceNodeId } : {}),
      style: Object.entries(child.inlineStyle).filter(([key, value]) => /^[a-z-]+$/.test(key) && !/[<>]|url\s*\(|expression\s*\(/i.test(value)).map(([key, value]) => `${key}:${value}`).join(";"),
    };
    const serialized = Object.entries(attributes).filter(([key, value]) => /^[a-zA-Z][\w:-]*$/.test(key) && !/^on/i.test(key) && key !== "srcdoc" && (key !== "href" || Boolean(canvasV2SafeTextLink(value)))).map(([key, value]) => ` ${key}="${escape(value)}"`).join("");
    return tag === "br" ? `<br${serialized}>` : `<${tag}${serialized}>${content(child)}</${tag}>`;
  }).join("");
  return content(node);
}

export const CANVAS_V2_RICH_TEXT_TAGS = new Set(["span", "b", "strong", "i", "em", "u", "s", "strike", "a", "br", "div", "p", "ul", "ol", "li", "blockquote", "code", "h1", "h2", "h3", "h4"]);
const STYLES = new Set(["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "text-decoration", "text-align", "line-height", "white-space", "list-style-type", "padding-left"]);
export function canvasV2SafeTextLink(value: string): string | undefined {
  const trimmed = value.trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(trimmed) && !/[\u0000-\u0020<>"']/.test(trimmed) ? trimmed : undefined;
}
export function canvasV2RichTextStyle(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => STYLES.has(key) && value.length <= 160 && !/[{}<>;]|url\s*\(|expression\s*\(/i.test(value)));
}
/** Keep range formatting in native content, including newly authored inline nodes. */
export function readCanvasV2RichText(editable: HTMLElement): CanvasV2NativeTextContentUpdate[] {
  const updates: CanvasV2NativeTextContentUpdate[] = [];
  const seenIds = new Set<string>();
  const visit = (element: HTMLElement, root = false): string => {
    const existingId = element.dataset.canvasV2NativeSceneId;
    const id = existingId && !seenIds.has(existingId) ? existingId : `rich-${crypto.randomUUID()}`;
    seenIds.add(id);
    const tag = element.tagName.toLowerCase();
    const style = canvasV2RichTextStyle(Object.fromEntries(Array.from(element.style).map((key) => [key, element.style.getPropertyValue(key)])));
    if (tag === "font") {
      if (element.getAttribute("color")) style.color = element.getAttribute("color")!;
      if (element.getAttribute("face")) style["font-family"] = element.getAttribute("face")!;
      if (element.getAttribute("size")) style["font-size"] = `${[10, 13, 16, 18, 24, 32, 48][Math.max(0, Math.min(6, Number(element.getAttribute("size")) - 1))]}px`;
    }
    const content: CanvasV2NativeTextContentUpdate["content"] = [];
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) content.push({ kind: "text", value: child.textContent ?? "" });
      else if (child instanceof HTMLElement && !/^(SCRIPT|STYLE|IFRAME|OBJECT)$/.test(child.tagName)) content.push({ kind: "node", id: visit(child) });
    }
    const href = tag === "a" ? canvasV2SafeTextLink(element.getAttribute("href") ?? "") : undefined;
    updates.push({ sceneNodeId: id, content, style, ...(!root ? { tagName: CANVAS_V2_RICH_TEXT_TAGS.has(tag) ? tag : "span", ...(href ? { href } : {}) } : {}) });
    return id;
  };
  visit(editable, true);
  return updates;
}

export function sanitizeCanvasV2RichTextHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html.slice(0, 180_000), "text/html");
  const clean = (element: Element) => {
    for (const child of Array.from(element.children)) {
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|IMG|SVG|VIDEO|AUDIO)$/.test(child.tagName)) { child.remove(); continue; }
      clean(child);
      if (!CANVAS_V2_RICH_TEXT_TAGS.has(child.tagName.toLowerCase())) { child.replaceWith(...Array.from(child.childNodes)); continue; }
      const style = child instanceof HTMLElement ? canvasV2RichTextStyle(Object.fromEntries(Array.from(child.style).map((key) => [key, child.style.getPropertyValue(key)]))) : {};
      const href = child.tagName === "A" ? canvasV2SafeTextLink(child.getAttribute("href") ?? "") : undefined;
      for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
      for (const [key, value] of Object.entries(style)) (child as HTMLElement).style.setProperty(key, value);
      if (href) child.setAttribute("href", href);
    }
  };
  clean(parsed.body);
  return parsed.body.innerHTML;
}
