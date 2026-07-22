import type {
  NorthstarProjectionElementNode,
  NorthstarProjectionNode,
  NorthstarProjectionState,
} from "@/lib/canvas-projection/types";
import { parseNorthstarProjectionState } from "@/lib/canvas-projection/validation";

const VOID_HTML_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function styleText(node: NorthstarProjectionElementNode): string | undefined {
  const declarations = Object.entries(node.styles)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, declaration]) => `${name}:${declaration.value}${declaration.priority === "important" ? " !important" : ""}`);
  return declarations.length > 0 ? `${declarations.join(";")};` : undefined;
}

function nodeHtml(
  node: NorthstarProjectionNode,
  rootSpace?: NorthstarProjectionState["space"],
): string {
  if (node.kind === "text") return escapeText(node.text);
  const attributes = new Map<string, string>();
  for (const [name, value] of Object.entries(node.attributes)) attributes.set(name, value);
  attributes.set("data-ns-node-id", node.id);
  if (rootSpace) {
    attributes.set("data-ns-projection-space-left", String(rootSpace.left));
    attributes.set("data-ns-projection-space-top", String(rootSpace.top));
    attributes.set("data-ns-projection-space-right", String(rootSpace.right));
    attributes.set("data-ns-projection-space-bottom", String(rootSpace.bottom));
  }
  if (node.classes.length > 0) attributes.set("class", node.classes.join(" "));
  const inlineStyle = styleText(node);
  if (inlineStyle) attributes.set("style", inlineStyle);
  const serializedAttributes = [...attributes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
  const open = `<${node.tag}${serializedAttributes}>`;
  if (node.namespace === "html" && VOID_HTML_ELEMENTS.has(node.tag)) return open;
  return `${open}${node.children.map((child) => nodeHtml(child)).join("")}</${node.tag}>`;
}

export interface SerializedNorthstarProjectionState {
  html: string;
  css: string;
  space: NorthstarProjectionState["space"];
}

/** Serializes the verified canonical state back into the normal canvas artifact model. */
export function serializeNorthstarProjectionState(
  input: NorthstarProjectionState,
): SerializedNorthstarProjectionState {
  const state = parseNorthstarProjectionState(input);
  const css = Object.entries(state.cssLayers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([layerId, cssText]) => `/* northstar:${layerId} */\n${cssText}`)
    .join("\n\n");
  return {
    html: nodeHtml(state.root, state.space),
    css,
    space: { ...state.space },
  };
}
