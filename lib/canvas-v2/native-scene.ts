import type { CanvasV2ArtifactDocument, CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import type { CanvasV2BoardObjectKind } from "@/lib/canvas-v2/board-object-graph";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import type { CanvasV2ManualMutation } from "@/lib/canvas-v2/manual-mutations";

export const CANVAS_V2_NATIVE_SCENE_SCHEMA = "canvas-v2.native-scene.v1" as const;

export interface CanvasV2NativeSceneGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface CanvasV2NativeSceneNode {
  id: string;
  sourceNodeId?: string;
  parentId?: string;
  /** Evidence/source nesting retained only for compatibility serialization. */
  detachedFromParentId?: string;
  detachedFromParentIndex?: number;
  childIds: string[];
  order: number;
  tagName: string;
  namespace: "html" | "svg";
  layoutMode: "absolute" | "flow";
  kind: CanvasV2BoardObjectKind;
  selectable: boolean;
  hidden: boolean;
  locked: boolean;
  canonicalEvidence: boolean;
  userEdited: boolean;
  lastAuthor?: "user" | "northstar";
  editVersion: number;
  geometry: CanvasV2NativeSceneGeometry;
  attributes: Record<string, string>;
  inlineStyle: Record<string, string>;
  directText?: string;
  content: Array<{ kind: "text"; value: string } | { kind: "node"; id: string }>;
  evidence?: {
    id: string;
    role?: string;
    sourceNodeId?: string;
  };
}

export interface CanvasV2NativeSceneDocument {
  schema: typeof CANVAS_V2_NATIVE_SCENE_SCHEMA;
  revisionId: string;
  width: number;
  height: number;
  css: string;
  rootIds: string[];
  nodes: CanvasV2NativeSceneNode[];
}

/**
 * A selected group owns pointer interaction for every node in its subtree.
 * Browsers hit-test the deepest painted child, but canvas selection semantics
 * must resolve that leaf back to the already-selected ancestor before a drag
 * begins. The stable source identity is used because that is what the public
 * selection model exposes.
 */
export function canvasV2NativeSceneSelectionContainsTarget(
  scene: CanvasV2NativeSceneDocument | undefined,
  selectedNodeIds: readonly string[],
  targetNodeId: string,
): boolean {
  if (!scene || !selectedNodeIds.length) return false;
  const selected = new Set(selectedNodeIds);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const bySelectionId = new Map(scene.nodes.map((node) => [node.sourceNodeId ?? node.id, node]));
  let current = bySelectionId.get(targetNodeId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (selected.has(current.sourceNodeId ?? current.id)) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function kindFor(element: Element): CanvasV2BoardObjectKind {
  const html = element as HTMLElement;
  const nodeId = html.dataset?.canvasV2NodeId;
  if (html.dataset?.canvasV2WorkspaceRoot === "true" || html.dataset?.canvasV2PermanentRoot === "true" || nodeId === "canvas") return "root";
  if (html.dataset?.canvasV2Group === "true") return "group";
  if (html.dataset?.canvasV2IslandId || html.dataset?.canvasV2DesignRegion !== undefined) return "island";
  if (html.dataset?.canvasV2EvidenceId) return element.tagName === "IMG" ? "image" : "evidence";
  if (element.tagName === "IMG") return "image";
  if (/^H[1-6]$/.test(element.tagName) || ["P", "SPAN", "SMALL", "STRONG", "EM", "LABEL", "BUTTON"].includes(element.tagName)) return "text";
  if (element.tagName === "TABLE") return "table";
  if (html.dataset?.canvasV2UserEdited?.includes("create") && element.tagName === "SECTION") return "frame";
  if (["SVG", "PATH", "LINE", "CIRCLE", "RECT", "POLYGON", "POLYLINE", "ELLIPSE"].includes(element.tagName)) return "shape";
  return "object";
}

function inlineStyle(element: Element): Record<string, string> {
  const style = (element as HTMLElement | SVGElement).style;
  const entries: Array<[string, string]> = [];
  for (let index = 0; index < style.length; index += 1) {
    const property = style.item(index);
    const value = style.getPropertyValue(property);
    if (property && value) entries.push([property, value]);
  }
  return Object.fromEntries(entries);
}

function safeAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name === "style" || name === "class" || name === "contenteditable" || name.startsWith("on")) continue;
    if (name === "srcdoc" || name === "sandbox") continue;
    attributes[attribute.name] = attribute.value;
  }
  if (element.getAttribute("class")) attributes.class = element.getAttribute("class")!;
  return attributes;
}

function directText(element: Element): string | undefined {
  const value = Array.from(element.childNodes)
    .filter((node) => node.nodeType === node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("");
  return value ? value : undefined;
}

/**
 * Compile a fully laid-out HTML candidate into the live native scene format.
 * The iframe document is an isolated measuring instrument: none of its DOM
 * nodes, focus state, scrolling, or coordinate system survives this boundary.
 */
export function compileCanvasV2NativeScene(input: {
  document: Document;
  revision: CanvasV2ArtifactRevision;
  width: number;
  height: number;
}): CanvasV2NativeSceneDocument {
  const bodyRect = input.document.body.getBoundingClientRect();
  const allElements = Array.from(input.document.body.querySelectorAll("*"))
    .filter((element) => !["SCRIPT", "STYLE", "LINK", "META", "BASE", "TEMPLATE"].includes(element.tagName));
  const runtimeIds = new Map<Element, string>();
  const usedIds = new Set<string>();
  let renderSequence = 0;
  for (const element of allElements) {
    const sourceNodeId = element.getAttribute("data-canvas-v2-node-id")?.trim();
    let id = sourceNodeId || `render-${input.revision.id}-${++renderSequence}`;
    while (usedIds.has(id)) id = `${id}-${++renderSequence}`;
    usedIds.add(id);
    runtimeIds.set(element, id);
  }

  const nodes = allElements.map((element, order): CanvasV2NativeSceneNode => {
    const id = runtimeIds.get(element)!;
    const sourceNodeId = element.getAttribute("data-canvas-v2-node-id")?.trim() || undefined;
    const parentElement = element.parentElement && runtimeIds.has(element.parentElement) ? element.parentElement : undefined;
    const parentId = parentElement ? runtimeIds.get(parentElement) : undefined;
    const parentRect = parentElement?.getBoundingClientRect() ?? bodyRect;
    const rect = element.getBoundingClientRect();
    const computed = input.document.defaultView?.getComputedStyle(element);
    const html = element as HTMLElement;
    const rotation = Number(html.dataset?.canvasV2Rotation) || 0;
    const nativeMetric = (property: string, fallback: number) => {
      if (!html.dataset?.canvasV2SceneLayout) return fallback;
      const value = Number.parseFloat(html.style.getPropertyValue(property));
      return Number.isFinite(value) ? value : fallback;
    };
    const evidenceId = html.dataset?.canvasV2EvidenceId;
    const attributes = safeAttributes(element);
    attributes["data-canvas-v2-native-runtime-node"] = "true";
    attributes["data-canvas-v2-native-scene-id"] = id;
    if (sourceNodeId) attributes["data-canvas-v2-node-id"] = sourceNodeId;
    return {
      id,
      ...(sourceNodeId ? { sourceNodeId } : {}),
      ...(parentId ? { parentId } : {}),
      childIds: Array.from(element.children).flatMap((child) => runtimeIds.get(child) ?? []),
      order,
      tagName: element.tagName.toLowerCase(),
      namespace: element.namespaceURI === SVG_NAMESPACE ? "svg" : "html",
      layoutMode: parentElement && computed?.position !== "absolute" && computed?.position !== "fixed" ? "flow" : "absolute",
      kind: kindFor(element),
      selectable: Boolean(sourceNodeId) && kindFor(element) !== "root",
      hidden: html.hidden || computed?.display === "none" || computed?.visibility === "hidden",
      locked: html.dataset?.canvasV2Locked === "true" || kindFor(element) === "root",
      canonicalEvidence: Boolean(element.closest("[data-canvas-v2-canonical-flow]")),
      userEdited: Boolean(html.dataset?.canvasV2UserEdited),
      ...(html.dataset?.canvasV2LastAuthor === "user" || html.dataset?.canvasV2LastAuthor === "northstar"
        ? { lastAuthor: html.dataset.canvasV2LastAuthor }
        : {}),
      editVersion: Number(html.dataset?.canvasV2EditVersion) || 0,
      geometry: {
        // A compatibility document serialized from native truth carries the
        // untransformed scene rectangle explicitly. getBoundingClientRect()
        // is an axis-aligned box *after* rotation; feeding that back as base
        // geometry and then rotating it again causes delayed jumps, growth,
        // and apparent image copies. Browser measurement is used only for the
        // first HTML-to-native compilation.
        x: round(nativeMetric("--canvas-v2-scene-x", rect.left - parentRect.left)),
        y: round(nativeMetric("--canvas-v2-scene-y", rect.top - parentRect.top)),
        width: round(nativeMetric("--canvas-v2-scene-width", rect.width)),
        height: round(nativeMetric("--canvas-v2-scene-height", rect.height)),
        rotation,
        zIndex: Number.parseInt(computed?.zIndex ?? "0", 10) || 0,
      },
      attributes,
      inlineStyle: inlineStyle(element),
      ...(directText(element) !== undefined ? { directText: directText(element) } : {}),
      content: Array.from(element.childNodes).reduce<CanvasV2NativeSceneNode["content"]>((content, child) => {
        if (child.nodeType === child.TEXT_NODE) {
          if (child.textContent) content.push({ kind: "text", value: child.textContent });
          return content;
        }
        if (child.nodeType === child.ELEMENT_NODE) {
          const id = runtimeIds.get(child as Element);
          if (id) content.push({ kind: "node", id });
        }
        return content;
      }, []),
      ...(evidenceId ? {
        evidence: {
          id: evidenceId,
          ...(html.dataset?.canvasV2EvidenceRole ? { role: html.dataset.canvasV2EvidenceRole } : {}),
          ...(html.dataset?.canvasV2EvidenceCopyOf ? { sourceNodeId: html.dataset.canvasV2EvidenceCopyOf } : {}),
        },
      } : {}),
    };
  });

  // Source documents from early V2 phases may place authored siblings directly
  // on the body, while newer documents keep them beneath a full-workspace
  // compatibility root. Normalize both forms into the same useful opening
  // territory. This is a one-time scene compilation offset, never a camera
  // change, so zoom and pan remain wholly user-owned.
  const preferredLeft = Math.max(CANVAS_V2_WORKSPACE.aiAuthoringInset, 1_920);
  const preferredTop = CANVAS_V2_WORKSPACE.aiAuthoringInset;
  const roots = nodes.filter((node) => !node.parentId);
  const fullWorkspaceRoot = roots.find((node) => node.kind === "root" && node.geometry.width >= input.width * 0.9);
  const placementNodes = fullWorkspaceRoot
    ? nodes.filter((node) => node.parentId === fullWorkspaceRoot.id)
    : roots;
  const visiblePlacementNodes = placementNodes.filter((node) => !node.hidden && node.geometry.width > 0 && node.geometry.height > 0);
  const sourceOwnsNativePlacement = input.revision.document.html.includes("data-canvas-v2-scene-layout");
  if (visiblePlacementNodes.length && !sourceOwnsNativePlacement) {
    const left = Math.min(...visiblePlacementNodes.map((node) => node.geometry.x));
    const top = Math.min(...visiblePlacementNodes.map((node) => node.geometry.y));
    const right = Math.max(...visiblePlacementNodes.map((node) => node.geometry.x + node.geometry.width));
    const bottom = Math.max(...visiblePlacementNodes.map((node) => node.geometry.y + node.geometry.height));
    const inset = CANVAS_V2_WORKSPACE.aiAuthoringInset;
    const fitAxis = (preferred: number, span: number, canvasSize: number) => {
      const maximum = canvasSize - inset - span;
      if (maximum >= inset) return Math.min(preferred, maximum);
      // A composition larger than the inset-safe territory cannot satisfy
      // both margins. Preserve the finite canvas first and use whatever margin
      // remains instead of allowing the scene to extend past its hard edge.
      // Leave a few physical pixels of breathing room for rotated outlines and
      // browser sub-pixel rounding so authored content never expands the hard
      // 12,000 x 8,000 scroll geometry by a handful of pixels.
      return Math.max(0, canvasSize - span - 8);
    };
    const desiredX = fitAxis(preferredLeft, right - left, input.width);
    const desiredY = fitAxis(preferredTop, bottom - top, input.height);
    const deltaX = desiredX - left;
    const deltaY = desiredY - top;
    for (const node of placementNodes) {
      node.geometry.x = round(node.geometry.x + deltaX);
      node.geometry.y = round(node.geometry.y + deltaY);
    }
  }

  const compiledScene: CanvasV2NativeSceneDocument = {
    schema: CANVAS_V2_NATIVE_SCENE_SCHEMA,
    revisionId: input.revision.id,
    width: input.width,
    height: input.height,
    css: input.revision.document.css,
    rootIds: nodes.filter((node) => !node.parentId).map((node) => node.id),
    nodes,
  };
  // Earlier 8C revisions made a visually moved child absolute but left its
  // structural parent attached. Upgrade those revisions at the compiler
  // boundary: a user-moved object that was not subsequently regrouped is a
  // root-level canvas object and must not follow its former group later.
  normalizeUserDetachedNodes(compiledScene);
  return compiledScene;
}

export function canvasV2NativeSceneNodeMap(scene: CanvasV2NativeSceneDocument): Map<string, CanvasV2NativeSceneNode> {
  return new Map(scene.nodes.map((node) => [node.id, node]));
}

export function canvasV2NativeSceneSourceNodeMap(scene: CanvasV2NativeSceneDocument): Map<string, CanvasV2NativeSceneNode> {
  return new Map(scene.nodes.flatMap((node) => node.sourceNodeId ? [[node.sourceNodeId, node] as const] : []));
}

function cloneScene(scene: CanvasV2NativeSceneDocument): CanvasV2NativeSceneDocument {
  return {
    ...scene,
    rootIds: [...scene.rootIds],
    nodes: scene.nodes.map((node) => ({
      ...node,
      childIds: [...node.childIds],
      geometry: { ...node.geometry },
      attributes: { ...node.attributes },
      inlineStyle: { ...node.inlineStyle },
      content: node.content.map((item) => ({ ...item })),
      ...(node.evidence ? { evidence: { ...node.evidence } } : {}),
    })),
  };
}

function sourceNode(scene: CanvasV2NativeSceneDocument, nodeId: string): CanvasV2NativeSceneNode {
  const node = scene.nodes.find((candidate) => candidate.sourceNodeId === nodeId);
  if (!node) throw new Error(`Canvas V2 expected one native scene node named ${nodeId}.`);
  if (node.kind === "root") throw new Error("The workspace root is permanent. Select an element inside it instead.");
  return node;
}

function markNativeUserEdit(node: CanvasV2NativeSceneNode, kind: string): void {
  const edits = new Set((node.attributes["data-canvas-v2-user-edited"] ?? "").split(/\s+/).filter(Boolean));
  edits.add(kind);
  node.attributes["data-canvas-v2-user-edited"] = Array.from(edits).join(" ");
  node.attributes["data-canvas-v2-last-author"] = "user";
  node.editVersion += 1;
  node.attributes["data-canvas-v2-edit-version"] = String(node.editVersion);
  node.userEdited = true;
  node.lastAuthor = "user";
}

function removeNodeReference(scene: CanvasV2NativeSceneDocument, id: string): void {
  scene.rootIds = scene.rootIds.filter((rootId) => rootId !== id);
  for (const node of scene.nodes) {
    node.childIds = node.childIds.filter((childId) => childId !== id);
    node.content = node.content.filter((item) => item.kind !== "node" || item.id !== id);
  }
}

function removeNativeSubtree(scene: CanvasV2NativeSceneDocument, id: string): void {
  const byId = canvasV2NativeSceneNodeMap(scene);
  const remove = new Set<string>();
  const visit = (nodeId: string) => {
    if (remove.has(nodeId)) return;
    remove.add(nodeId);
    byId.get(nodeId)?.childIds.forEach(visit);
  };
  visit(id);
  for (const node of scene.nodes) {
    if (!node.detachedFromParentId || !remove.has(node.detachedFromParentId)) continue;
    node.detachedFromParentId = undefined;
    node.detachedFromParentIndex = undefined;
    delete node.attributes["data-canvas-v2-detached-from"];
    delete node.attributes["data-canvas-v2-detached-index"];
  }
  removeNodeReference(scene, id);
  scene.nodes = scene.nodes.filter((node) => !remove.has(node.id));
}

function freezeFlowSiblings(scene: CanvasV2NativeSceneDocument, node: CanvasV2NativeSceneNode): void {
  if (node.layoutMode !== "flow") return;
  if (!node.parentId) {
    node.layoutMode = "absolute";
    return;
  }
  const byId = canvasV2NativeSceneNodeMap(scene);
  const parent = byId.get(node.parentId);
  if (!parent) {
    node.layoutMode = "absolute";
    return;
  }
  // A flex/grid child leaving flow must not pull every sibling into its old
  // slot. Freeze the measured sibling positions and the parent's measured
  // footprint before direct manipulation. This turns an authored layout group
  // into a stable canvas group at the first geometry edit without changing
  // what the user sees.
  parent.inlineStyle.width = `${parent.geometry.width}px`;
  parent.inlineStyle.height = `${parent.geometry.height}px`;
  parent.inlineStyle["min-width"] = `${parent.geometry.width}px`;
  parent.inlineStyle["min-height"] = `${parent.geometry.height}px`;
  parent.attributes["data-canvas-v2-frozen-children"] = "true";
  for (const childId of parent.childIds) {
    const sibling = byId.get(childId);
    if (sibling) sibling.layoutMode = "absolute";
  }
}

function detachNativeNodeFromParent(scene: CanvasV2NativeSceneDocument, node: CanvasV2NativeSceneNode): void {
  if (!node.parentId) return;
  const byId = canvasV2NativeSceneNodeMap(scene);
  const semanticParentId = node.parentId;
  const semanticParent = byId.get(semanticParentId);
  const semanticIndex = semanticParent?.content.findIndex((item) => item.kind === "node" && item.id === node.id) ?? -1;
  let x = node.geometry.x;
  let y = node.geometry.y;
  let parentId: string | undefined = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.geometry.x;
    y += parent.geometry.y;
    parentId = parent.parentId;
  }
  removeNodeReference(scene, node.id);
  node.parentId = undefined;
  node.layoutMode = "absolute";
  node.geometry.x = round(x);
  node.geometry.y = round(y);
  node.detachedFromParentId = semanticParentId;
  node.detachedFromParentIndex = Math.max(0, semanticIndex);
  node.attributes["data-canvas-v2-detached"] = "true";
  node.attributes["data-canvas-v2-detached-from"] = semanticParentId;
  node.attributes["data-canvas-v2-detached-index"] = String(node.detachedFromParentIndex);
  if (!scene.rootIds.includes(node.id)) scene.rootIds.push(node.id);
}

function normalizeUserDetachedNodes(scene: CanvasV2NativeSceneDocument): void {
  for (const node of scene.nodes) {
    const edits = new Set((node.attributes["data-canvas-v2-user-edited"] ?? "").split(/\s+/).filter(Boolean));
    const detached = node.attributes["data-canvas-v2-detached"];
    if (node.parentId && (detached === "true" || (detached === undefined && edits.has("move") && !edits.has("group")))) {
      detachNativeNodeFromParent(scene, node);
    }
  }
}

function nativePrimitiveNode(
  scene: CanvasV2NativeSceneDocument,
  mutation: Extract<CanvasV2ManualMutation, { kind: "create" }>,
): CanvasV2NativeSceneNode {
  const base = {
    id: mutation.nodeId,
    sourceNodeId: mutation.nodeId,
    childIds: [],
    order: scene.nodes.length,
    namespace: "html" as const,
    layoutMode: "absolute" as const,
    selectable: true,
    hidden: false,
    locked: false,
    canonicalEvidence: false,
    userEdited: true,
    lastAuthor: "user" as const,
    editVersion: 1,
    attributes: {
      "data-canvas-v2-node-id": mutation.nodeId,
      "data-canvas-v2-user-edited": "create",
      "data-canvas-v2-last-author": "user",
      "data-canvas-v2-edit-version": "1",
      "data-canvas-v2-native-runtime-node": "true",
      "data-canvas-v2-native-scene-id": mutation.nodeId,
    },
    inlineStyle: {},
  };
  if (mutation.primitive === "text") return {
    ...base,
    tagName: "p",
    kind: "text",
    geometry: { x: mutation.x, y: mutation.y, width: 220, height: 48, rotation: 0, zIndex: 0 },
    inlineStyle: { margin: "0", font: "600 28px/1.3 Inter,system-ui,sans-serif", color: "var(--northstar-ink)" },
    directText: "New text",
    content: [{ kind: "text", value: "New text" }],
  };
  if (mutation.primitive === "frame") return {
    ...base,
    tagName: "section",
    kind: "frame",
    geometry: { x: mutation.x, y: mutation.y, width: 360, height: 240, rotation: 0, zIndex: 0 },
    inlineStyle: { border: "2px solid var(--northstar-violet)", "border-radius": "20px", background: "var(--northstar-surface)" },
    content: [],
  };
  if (mutation.primitive === "shape") return {
    ...base,
    tagName: "div",
    kind: "shape",
    geometry: { x: mutation.x, y: mutation.y, width: 160, height: 160, rotation: 0, zIndex: 0 },
    inlineStyle: { "border-radius": "24px", background: "#7661f3" },
    content: [],
  };
  return {
    ...base,
    tagName: "table",
    kind: "table",
    geometry: { x: mutation.x, y: mutation.y, width: 480, height: 120, rotation: 0, zIndex: 0 },
    inlineStyle: { "border-collapse": "collapse", background: "var(--northstar-surface)", color: "var(--northstar-ink)" },
    directText: "Cell 1    Cell 2\nCell 3    Cell 4",
    content: [{ kind: "text", value: "Cell 1    Cell 2\nCell 3    Cell 4" }],
  };
}

function applyAtomicNativeMutation(
  scene: CanvasV2NativeSceneDocument,
  mutation: Exclude<CanvasV2ManualMutation, { kind: "batch" }>,
): void {
  if (mutation.kind === "create") {
    if (scene.nodes.some((node) => node.sourceNodeId === mutation.nodeId)) throw new Error("A created node requires a unique identity.");
    const node = nativePrimitiveNode(scene, mutation);
    scene.nodes.push(node);
    scene.rootIds.push(node.id);
    return;
  }
  if (mutation.kind === "group") {
    const groupedNodes = mutation.items.map((item) => sourceNode(scene, item.nodeId));
    const group: CanvasV2NativeSceneNode = {
      id: mutation.groupNodeId,
      sourceNodeId: mutation.groupNodeId,
      childIds: groupedNodes.map((node) => node.id),
      order: scene.nodes.length,
      tagName: "div",
      namespace: "html",
      layoutMode: "absolute",
      kind: "group",
      selectable: true,
      hidden: false,
      locked: false,
      canonicalEvidence: groupedNodes.some((node) => node.canonicalEvidence),
      userEdited: true,
      lastAuthor: "user",
      editVersion: 1,
      geometry: { ...mutation.bounds, rotation: 0, zIndex: Math.max(0, ...groupedNodes.map((node) => node.geometry.zIndex)) },
      attributes: {
        "data-canvas-v2-node-id": mutation.groupNodeId,
        "data-canvas-v2-group": "true",
        "data-canvas-v2-user-edited": "group",
        "data-canvas-v2-last-author": "user",
        "data-canvas-v2-edit-version": "1",
        "data-canvas-v2-native-runtime-node": "true",
        "data-canvas-v2-native-scene-id": mutation.groupNodeId,
        "aria-label": mutation.label ?? "Object group",
      },
      inlineStyle: {},
      content: groupedNodes.map((node) => ({ kind: "node" as const, id: node.id })),
    };
    for (const [index, node] of groupedNodes.entries()) {
      removeNodeReference(scene, node.id);
      node.parentId = group.id;
      node.layoutMode = "absolute";
      node.geometry.x = mutation.items[index].bounds.x - mutation.bounds.x;
      node.geometry.y = mutation.items[index].bounds.y - mutation.bounds.y;
      node.detachedFromParentId = undefined;
      node.detachedFromParentIndex = undefined;
      node.attributes["data-canvas-v2-detached"] = "false";
      delete node.attributes["data-canvas-v2-detached-from"];
      delete node.attributes["data-canvas-v2-detached-index"];
      markNativeUserEdit(node, "group");
    }
    scene.nodes.push(group);
    scene.rootIds.push(group.id);
    return;
  }
  const node = sourceNode(scene, mutation.nodeId);
  if (mutation.kind === "move") {
    freezeFlowSiblings(scene, node);
    detachNativeNodeFromParent(scene, node);
    node.layoutMode = "absolute";
    node.geometry.x = round(node.geometry.x + mutation.deltaX);
    node.geometry.y = round(node.geometry.y + mutation.deltaY);
  } else if (mutation.kind === "resize") {
    freezeFlowSiblings(scene, node);
    node.layoutMode = "absolute";
    node.geometry.width = Math.max(24, round(mutation.width));
    node.geometry.height = Math.max(24, round(mutation.height));
    if (mutation.fontSize !== undefined) node.inlineStyle["font-size"] = `${round(mutation.fontSize)}px`;
  } else if (mutation.kind === "transform") {
    freezeFlowSiblings(scene, node);
    node.layoutMode = "absolute";
    node.geometry.x = round(node.geometry.x + mutation.deltaX);
    node.geometry.y = round(node.geometry.y + mutation.deltaY);
    node.geometry.width = Math.max(24, round(mutation.width));
    node.geometry.height = Math.max(24, round(mutation.height));
    if (mutation.fontSize !== undefined) node.inlineStyle["font-size"] = `${round(mutation.fontSize)}px`;
  } else if (mutation.kind === "text") {
    node.content = [{ kind: "text", value: mutation.text }];
    node.childIds = [];
    node.directText = mutation.text;
  } else if (mutation.kind === "style") {
    node.inlineStyle[mutation.property] = mutation.value;
  } else if (mutation.kind === "attribute") {
    node.attributes.alt = mutation.value;
  } else if (mutation.kind === "delete") {
    if (node.canonicalEvidence) throw new Error("Grounded evidence is protected. Move, resize, or copy it instead of deleting the source evidence.");
    removeNativeSubtree(scene, node.id);
    return;
  } else if (mutation.kind === "duplicate") {
    const byId = canvasV2NativeSceneNodeMap(scene);
    const cloneIds = new Map<string, string>();
    const collect = (id: string) => {
      const current = byId.get(id);
      if (!current) return;
      cloneIds.set(id, id === node.id ? mutation.newNodeId : `${mutation.newNodeId}-${cloneIds.size}`);
      current.childIds.forEach(collect);
    };
    collect(node.id);
    const copies = Array.from(cloneIds).map(([sourceId, copyId]) => {
      const source = byId.get(sourceId)!;
      const sourceNodeId = sourceId === node.id ? mutation.newNodeId : source.sourceNodeId ? `${mutation.newNodeId}-${source.sourceNodeId}` : undefined;
      return {
        ...source,
        id: copyId,
        ...(sourceNodeId ? { sourceNodeId } : { sourceNodeId: undefined }),
        parentId: sourceId === node.id ? source.parentId : source.parentId ? cloneIds.get(source.parentId) : undefined,
        childIds: source.childIds.map((id) => cloneIds.get(id)!).filter(Boolean),
        content: source.content.map((item) => item.kind === "node" ? { kind: "node" as const, id: cloneIds.get(item.id)! } : { ...item }),
        geometry: { ...source.geometry, ...(sourceId === node.id ? { x: source.geometry.x + 36, y: source.geometry.y + 36 } : {}) },
        attributes: { ...source.attributes, ...(sourceNodeId ? { "data-canvas-v2-node-id": sourceNodeId } : {}) },
        inlineStyle: { ...source.inlineStyle },
        canonicalEvidence: false,
        evidence: source.evidence ? { ...source.evidence, role: "analysis-copy", sourceNodeId: source.sourceNodeId } : undefined,
      } satisfies CanvasV2NativeSceneNode;
    });
    scene.nodes.push(...copies);
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      parent?.childIds.push(mutation.newNodeId);
      parent?.content.push({ kind: "node", id: mutation.newNodeId });
    } else scene.rootIds.push(mutation.newNodeId);
    copies.forEach((copy) => markNativeUserEdit(copy, "duplicate"));
    return;
  } else if (mutation.kind === "layer") {
    const values = scene.nodes.map((item) => item.geometry.zIndex);
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    node.geometry.zIndex = mutation.direction === "front" ? maximum + 1
      : mutation.direction === "back" ? minimum - 1
        : mutation.direction === "forward" ? node.geometry.zIndex + 1
          : node.geometry.zIndex - 1;
  } else if (mutation.kind === "visibility") {
    node.hidden = mutation.hidden;
    if (mutation.hidden) node.attributes.hidden = "";
    else delete node.attributes.hidden;
  } else if (mutation.kind === "lock") {
    node.locked = mutation.locked;
    node.attributes["data-canvas-v2-locked"] = String(mutation.locked);
  } else if (mutation.kind === "rotate") {
    node.geometry.rotation = round(mutation.rotation);
    node.attributes["data-canvas-v2-rotation"] = String(node.geometry.rotation);
  } else if (mutation.kind === "ungroup") {
    if (node.kind !== "group") throw new Error("Only a group can be ungrouped.");
    const byId = canvasV2NativeSceneNodeMap(scene);
    const childIds = [...node.childIds];
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      child.parentId = node.parentId;
      child.geometry.x += node.geometry.x;
      child.geometry.y += node.geometry.y;
      if (node.parentId) {
        const parent = byId.get(node.parentId);
        parent?.childIds.push(child.id);
        parent?.content.push({ kind: "node", id: child.id });
      } else scene.rootIds.push(child.id);
      markNativeUserEdit(child, "ungroup");
    }
    // The children have been reparented above. Detach them from the group
    // before removing the group itself so subtree deletion cannot consume the
    // newly promoted objects.
    node.childIds = [];
    node.content = node.content.filter((item) => item.kind !== "node" || !childIds.includes(item.id));
    removeNativeSubtree(scene, node.id);
    return;
  }
  markNativeUserEdit(node, mutation.kind);
}

export function applyCanvasV2NativeSceneMutation(
  source: CanvasV2NativeSceneDocument,
  mutation: CanvasV2ManualMutation,
): CanvasV2NativeSceneDocument {
  const scene = cloneScene(source);
  // Hot-reloaded or already-open revisions may predate the explicit detached
  // marker. Normalize them before the next mutation so moving an old group
  // cannot carry a child that the user had already pulled away.
  normalizeUserDetachedNodes(scene);
  if (mutation.kind === "batch") {
    for (const item of mutation.mutations) applyAtomicNativeMutation(scene, item);
  } else applyAtomicNativeMutation(scene, mutation);
  scene.nodes.forEach((node, order) => { node.order = order; });
  return scene;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function serializeAttributes(node: CanvasV2NativeSceneNode): string {
  const entries = Object.entries(node.attributes)
    .filter(([name]) => !name.startsWith("data-canvas-v2-native-"))
    // This marker is derived scene state. Keeping the value captured from the
    // previous revision and then appending the new value produced duplicate
    // HTML attributes; browsers keep the first one, so an object changed from
    // flow to absolute snapped back on the next compile.
    .filter(([name]) => name !== "data-canvas-v2-scene-layout")
    .filter(([name]) => name !== "style")
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`);
  if (node.sourceNodeId && !entries.some((entry) => entry.startsWith("data-canvas-v2-node-id="))) {
    entries.push(`data-canvas-v2-node-id="${escapeHtml(node.sourceNodeId)}"`);
  }
  const style = {
    ...node.inlineStyle,
    "--canvas-v2-scene-x": `${node.geometry.x}px`,
    "--canvas-v2-scene-y": `${node.geometry.y}px`,
    "--canvas-v2-scene-width": `${node.geometry.width}px`,
    "--canvas-v2-scene-height": `${node.geometry.height}px`,
    "--canvas-v2-scene-rotation": `${node.geometry.rotation}deg`,
    "z-index": String(node.geometry.zIndex),
  };
  entries.push(`style="${escapeHtml(Object.entries(style).map(([property, value]) => `${property}:${value}`).join(";"))}"`);
  entries.push(`data-canvas-v2-scene-layout="${node.layoutMode}"`);
  return entries.join(" ");
}

export function serializeCanvasV2NativeScene(scene: CanvasV2NativeSceneDocument): CanvasV2ArtifactDocument {
  const byId = canvasV2NativeSceneNodeMap(scene);
  const detachedBySemanticParent = new Map<string, CanvasV2NativeSceneNode[]>();
  for (const node of scene.nodes) {
    if (!node.detachedFromParentId || !byId.has(node.detachedFromParentId)) continue;
    const siblings = detachedBySemanticParent.get(node.detachedFromParentId) ?? [];
    siblings.push(node);
    detachedBySemanticParent.set(node.detachedFromParentId, siblings);
  }
  for (const siblings of detachedBySemanticParent.values()) {
    siblings.sort((left, right) => (left.detachedFromParentIndex ?? Number.MAX_SAFE_INTEGER) - (right.detachedFromParentIndex ?? Number.MAX_SAFE_INTEGER));
  }
  const absoluteOrigin = (id: string) => {
    const node = byId.get(id);
    if (!node) return { x: 0, y: 0 };
    let x = node.geometry.x;
    let y = node.geometry.y;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      x += parent.geometry.x;
      y += parent.geometry.y;
      parentId = parent.parentId;
    }
    return { x, y };
  };
  const serialize = (id: string, semanticParentId?: string): string => {
    const node = byId.get(id);
    if (!node) return "";
    const attributesNode = semanticParentId && node.detachedFromParentId === semanticParentId
      ? {
          ...node,
          geometry: {
            ...node.geometry,
            x: round(node.geometry.x - absoluteOrigin(semanticParentId).x),
            y: round(node.geometry.y - absoluteOrigin(semanticParentId).y),
          },
        }
      : node;
    const attributes = serializeAttributes(attributesNode);
    const opening = `<${node.tagName}${attributes ? ` ${attributes}` : ""}>`;
    if (VOID_ELEMENTS.has(node.tagName)) return opening;
    const contentItems = node.content.map((item) => ({ ...item }));
    for (const child of detachedBySemanticParent.get(node.id) ?? []) {
      const index = Math.min(contentItems.length, Math.max(0, child.detachedFromParentIndex ?? contentItems.length));
      contentItems.splice(index, 0, { kind: "node", id: child.id });
    }
    const content = contentItems.map((item) => item.kind === "text" ? escapeHtml(item.value) : serialize(item.id, node.id)).join("");
    return `${opening}${content}</${node.tagName}>`;
  };
  const geometryGuard = `
/* canvas-v2-native-scene-geometry-v1 */
[data-canvas-v2-scene-layout="absolute"]{box-sizing:border-box!important;position:absolute!important;left:var(--canvas-v2-scene-x)!important;top:var(--canvas-v2-scene-y)!important;width:var(--canvas-v2-scene-width)!important;height:var(--canvas-v2-scene-height)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;translate:none!important;rotate:var(--canvas-v2-scene-rotation)!important;transform-origin:center!important}
[data-canvas-v2-scene-layout="flow"]{position:relative!important;rotate:var(--canvas-v2-scene-rotation)!important;transform-origin:center!important}
/* /canvas-v2-native-scene-geometry-v1 */`;
  const css = scene.css.replace(/\n?\/\* canvas-v2-native-scene-geometry-v1 \*\/[\s\S]*?\/\* \/canvas-v2-native-scene-geometry-v1 \*\//g, "");
  // An empty visible board is still a valid canvas revision. The native
  // compiler intentionally omits inert <template> metadata from its node
  // graph, so deleting the final object would otherwise serialize to an empty
  // string and trip the source validator. Preserve a non-rendering metadata
  // sentinel; it never becomes a scene object or a second surface.
  const workspaceMetadata = `<template data-canvas-v2-node-id="canvas-root" data-canvas-v2-workspace-root="true" aria-label="North Star canvas metadata"></template>`;
  return {
    html: `${workspaceMetadata}${scene.rootIds
      .filter((id) => {
        const node = byId.get(id);
        return !node?.detachedFromParentId || !byId.has(node.detachedFromParentId);
      })
      .map((id) => serialize(id))
      .join("")}`,
    css: `${css}\n${geometryGuard}`,
  };
}
