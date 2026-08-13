import { assertCanvasV2ArtifactDocument } from "@/lib/canvas-v2/artifact-safety";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

export type CanvasV2ManualMutation =
  | { kind: "move"; nodeId: string; deltaX: number; deltaY: number }
  | { kind: "resize"; nodeId: string; width: number; height: number }
  | { kind: "text"; nodeId: string; text: string }
  | { kind: "delete"; nodeId: string }
  | { kind: "duplicate"; nodeId: string; newNodeId: string }
  | { kind: "layer"; nodeId: string; direction: "forward" | "backward" | "front" | "back" }
  | { kind: "visibility"; nodeId: string; hidden: boolean }
  | { kind: "lock"; nodeId: string; locked: boolean }
  | { kind: "create"; nodeId: string; primitive: "text" | "frame" | "shape" | "table" };

export interface CanvasV2SourceNode {
  nodeId: string;
  tagName: string;
  hidden: boolean;
  locked: boolean;
}

export function listCanvasV2SourceNodes(artifact: CanvasV2ArtifactDocument): CanvasV2SourceNode[] {
  if (typeof DOMParser === "undefined") return [];
  const parsed = new DOMParser().parseFromString(`<body>${artifact.html}</body>`, "text/html");
  return Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).flatMap((element) => {
    const nodeId = element.dataset.canvasV2NodeId?.trim();
    return nodeId ? [{ nodeId, tagName: element.tagName.toLowerCase(), hidden: element.hidden, locked: element.dataset.canvasV2Locked === "true" }] : [];
  });
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return Math.round(value * 100) / 100;
}

function storedNumber(element: HTMLElement, key: "canvasV2ManualX" | "canvasV2ManualY"): number {
  const value = Number(element.dataset[key]);
  return Number.isFinite(value) ? value : 0;
}

function findUniqueNode(document: Document, nodeId: string): HTMLElement {
  const normalized = nodeId.trim();
  if (!normalized) throw new Error("A manual mutation requires a stable node identity.");
  const matches = Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))
    .filter((element) => element.dataset.canvasV2NodeId === normalized);
  if (matches.length !== 1) throw new Error(`Canvas V2 expected exactly one node named ${normalized}.`);
  return matches[0];
}

export function applyCanvasV2ManualMutation(
  artifact: CanvasV2ArtifactDocument,
  mutation: CanvasV2ManualMutation,
): CanvasV2ArtifactDocument {
  if (typeof DOMParser === "undefined") throw new Error("Manual canvas mutations require a browser document.");
  const parsed = new DOMParser().parseFromString(`<body>${artifact.html}</body>`, "text/html");
  if (mutation.kind === "create") {
    if (Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).some((element) => element.dataset.canvasV2NodeId === mutation.nodeId)) throw new Error("A created node requires a unique identity.");
    const markup = mutation.primitive === "text"
      ? `<p data-canvas-v2-node-id="${mutation.nodeId}" style="position:absolute;left:96px;top:96px;margin:0;font:600 28px/1.3 Inter,system-ui,sans-serif;color:#181824">New text</p>`
      : mutation.primitive === "frame"
        ? `<section data-canvas-v2-node-id="${mutation.nodeId}" style="position:absolute;left:96px;top:96px;width:360px;height:240px;border:2px solid #7661f3;border-radius:20px;background:#ffffff"></section>`
        : mutation.primitive === "shape"
          ? `<div data-canvas-v2-node-id="${mutation.nodeId}" style="position:absolute;left:96px;top:96px;width:160px;height:160px;border-radius:24px;background:#7661f3"></div>`
          : `<table data-canvas-v2-node-id="${mutation.nodeId}" style="position:absolute;left:96px;top:96px;width:480px;border-collapse:collapse;background:#fff"><tbody><tr><td style="border:1px solid #d9d9e7;padding:14px">Cell 1</td><td style="border:1px solid #d9d9e7;padding:14px">Cell 2</td></tr><tr><td style="border:1px solid #d9d9e7;padding:14px">Cell 3</td><td style="border:1px solid #d9d9e7;padding:14px">Cell 4</td></tr></tbody></table>`;
    parsed.body.insertAdjacentHTML("beforeend", markup);
    return assertCanvasV2ArtifactDocument({ ...artifact, html: parsed.body.innerHTML });
  }
  const element = findUniqueNode(parsed, mutation.nodeId);

  if (mutation.kind === "move") {
    const x = storedNumber(element, "canvasV2ManualX") + finite(mutation.deltaX, "Horizontal movement");
    const y = storedNumber(element, "canvasV2ManualY") + finite(mutation.deltaY, "Vertical movement");
    element.dataset.canvasV2ManualX = String(x);
    element.dataset.canvasV2ManualY = String(y);
    element.style.position = element.style.position || "relative";
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  } else if (mutation.kind === "resize") {
    const width = Math.max(24, finite(mutation.width, "Width"));
    const height = Math.max(24, finite(mutation.height, "Height"));
    element.dataset.canvasV2ManualWidth = String(width);
    element.dataset.canvasV2ManualHeight = String(height);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.maxWidth = "none";
  } else if (mutation.kind === "text") {
    if (element.childElementCount) throw new Error("Text editing is available only for a leaf node. Select a text node with its own stable identity.");
    element.textContent = mutation.text;
  } else if (mutation.kind === "delete") {
    element.remove();
  } else if (mutation.kind === "duplicate") {
    const clone = element.cloneNode(true) as HTMLElement;
    const identified = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))];
    identified.forEach((child, index) => { child.dataset.canvasV2NodeId = index ? `${mutation.newNodeId}-${index}` : mutation.newNodeId; });
    clone.style.position = clone.style.position || "relative";
    clone.style.left = `${storedNumber(element, "canvasV2ManualX") + 24}px`;
    clone.style.top = `${storedNumber(element, "canvasV2ManualY") + 24}px`;
    element.insertAdjacentElement("afterend", clone);
  } else if (mutation.kind === "layer") {
    const parent = element.parentElement;
    if (!parent) throw new Error("The selected node has no layer parent.");
    if (mutation.direction === "front") parent.append(element);
    else if (mutation.direction === "back") parent.prepend(element);
    else if (mutation.direction === "forward" && element.nextElementSibling) element.nextElementSibling.insertAdjacentElement("afterend", element);
    else if (mutation.direction === "backward" && element.previousElementSibling) element.previousElementSibling.insertAdjacentElement("beforebegin", element);
  } else if (mutation.kind === "visibility") {
    element.dataset.canvasV2Hidden = mutation.hidden ? "true" : "false";
    element.hidden = mutation.hidden;
  } else {
    element.dataset.canvasV2Locked = mutation.locked ? "true" : "false";
  }

  return assertCanvasV2ArtifactDocument({
    ...artifact,
    html: parsed.body.innerHTML,
  });
}

export function describeCanvasV2ManualMutation(mutation: CanvasV2ManualMutation): string {
  if (mutation.kind === "move") return `Moved ${mutation.nodeId} by ${Math.round(mutation.deltaX)} × ${Math.round(mutation.deltaY)} pixels.`;
  if (mutation.kind === "resize") return `Resized ${mutation.nodeId} to ${Math.round(mutation.width)} × ${Math.round(mutation.height)} pixels.`;
  if (mutation.kind === "text") return `Updated text in ${mutation.nodeId}.`;
  if (mutation.kind === "delete") return `Deleted ${mutation.nodeId}.`;
  if (mutation.kind === "duplicate") return `Duplicated ${mutation.nodeId}.`;
  if (mutation.kind === "layer") return `Moved ${mutation.nodeId} ${mutation.direction} in its layer stack.`;
  if (mutation.kind === "visibility") return `${mutation.hidden ? "Hid" : "Showed"} ${mutation.nodeId}.`;
  if (mutation.kind === "lock") return `${mutation.locked ? "Locked" : "Unlocked"} ${mutation.nodeId}.`;
  return `Created ${mutation.primitive} ${mutation.nodeId}.`;
}
