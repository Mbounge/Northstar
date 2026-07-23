import {
  cloneNorthstarLedgerValue,
  createNorthstarLedgerHash,
  stableStringifyNorthstarLedgerValue,
} from "@/lib/canvas-ledger/northstar-ledger-value";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import type {
  NorthstarProjectionElementNode,
  NorthstarProjectionNode,
  NorthstarProjectionOperation,
  NorthstarProjectionState,
} from "@/lib/canvas-projection/types";
import {
  NorthstarProjectionValidationError,
  parseNorthstarProjectionOperation,
  parseNorthstarProjectionState,
} from "@/lib/canvas-projection/validation";

export class NorthstarProjectionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NorthstarProjectionStateError";
  }
}

interface NodeLocation {
  node: NorthstarProjectionNode;
  parent: NorthstarProjectionElementNode | null;
  index: number;
  depth: number;
}

function mutableNode(node: NorthstarProjectionNode): NorthstarProjectionNode {
  if (node.kind === "text") return { ...node };
  return {
    ...node,
    attributes: { ...node.attributes },
    classes: [...node.classes],
    styles: Object.fromEntries(
      Object.entries(node.styles).map(([name, declaration]) => [name, { ...declaration }]),
    ),
    children: node.children.map((child) => mutableNode(child)),
  };
}

export function cloneNorthstarProjectionState(
  state: NorthstarProjectionState,
): NorthstarProjectionState {
  return {
    schema: state.schema,
    root: mutableNode(state.root) as NorthstarProjectionElementNode,
    cssLayers: { ...state.cssLayers },
    space: { ...state.space },
  };
}

function buildIndex(state: NorthstarProjectionState): Map<string, NodeLocation> {
  const index = new Map<string, NodeLocation>();
  const visit = (
    node: NorthstarProjectionNode,
    parent: NorthstarProjectionElementNode | null,
    childIndex: number,
    depth: number,
  ): void => {
    if (index.has(node.id)) {
      throw new NorthstarProjectionStateError(`Projection state contains duplicate node ${node.id}.`);
    }
    index.set(node.id, { node, parent, index: childIndex, depth });
    if (node.kind === "element") {
      node.children.forEach((child, position) => visit(child, node, position, depth + 1));
    }
  };
  visit(state.root, null, 0, 0);
  return index;
}

function mutableChildren(node: NorthstarProjectionElementNode): NorthstarProjectionNode[] {
  return node.children as NorthstarProjectionNode[];
}

function sameLedgerValue(left: unknown, right: unknown): boolean {
  return stableStringifyNorthstarLedgerValue(left as NorthstarLedgerValue) ===
    stableStringifyNorthstarLedgerValue(right as NorthstarLedgerValue);
}

function requireElement(
  index: Map<string, NodeLocation>,
  id: string,
  role: string,
): NorthstarProjectionElementNode {
  const location = index.get(id);
  if (!location) throw new NorthstarProjectionStateError(`${role} ${id} does not exist.`);
  if (location.node.kind !== "element") {
    throw new NorthstarProjectionStateError(`${role} ${id} is not an element.`);
  }
  return location.node;
}

function removeNodeByLocation(location: NodeLocation): void {
  if (!location.parent) {
    throw new NorthstarProjectionStateError("The projection root cannot be removed or moved.");
  }
  mutableChildren(location.parent).splice(location.index, 1);
}

function insertAt(
  parent: NorthstarProjectionElementNode,
  index: number,
  node: NorthstarProjectionNode,
): void {
  const children = mutableChildren(parent);
  if (index > children.length) {
    throw new NorthstarProjectionStateError(
      `Insertion index ${index} exceeds child count ${children.length} for ${parent.id}.`,
    );
  }
  children.splice(index, 0, node);
}

function isDescendant(
  index: Map<string, NodeLocation>,
  candidateId: string,
  ancestorId: string,
): boolean {
  let location = index.get(candidateId);
  while (location?.parent) {
    if (location.parent.id === ancestorId) return true;
    location = index.get(location.parent.id);
  }
  return false;
}

export function applyNorthstarProjectionOperation(
  inputState: NorthstarProjectionState,
  inputOperation: NorthstarProjectionOperation,
): NorthstarProjectionState {
  const state = cloneNorthstarProjectionState(parseNorthstarProjectionState(inputState));
  const operation = parseNorthstarProjectionOperation(inputOperation);
  const index = buildIndex(state);

  switch (operation.type) {
    case "insert-node": {
      const parent = requireElement(index, operation.parentId, "Insertion parent");
      const existing = index.get(operation.node.id);
      if (existing) {
        if (
          sameLedgerValue(existing.node, operation.node) &&
          existing.parent?.id === parent.id &&
          existing.index === operation.index
        ) return state;
        throw new NorthstarProjectionStateError(
          `Insertion node ${operation.node.id} already exists with different content or placement.`,
        );
      }
      const insertedState = parseNorthstarProjectionState({
        schema: state.schema,
        root: operation.node.kind === "element"
          ? operation.node
          : {
              kind: "element",
              id: "projection-validation-wrapper",
              tag: "div",
              namespace: "html",
              attributes: {},
              classes: [],
              styles: {},
              children: [operation.node],
            },
        cssLayers: {},
        space: { left: 0, top: 0, right: 0, bottom: 0 },
      });
      const inserted = operation.node.kind === "element"
        ? insertedState.root
        : insertedState.root.children[0]!;
      insertAt(parent, operation.index, mutableNode(inserted));
      break;
    }

    case "remove-node": {
      const location = index.get(operation.nodeId);
      if (!location) return state;
      removeNodeByLocation(location);
      break;
    }

    case "move-node": {
      const location = index.get(operation.nodeId);
      if (!location) throw new NorthstarProjectionStateError(`Move node ${operation.nodeId} does not exist.`);
      if (!location.parent) throw new NorthstarProjectionStateError("The projection root cannot be moved.");
      const targetParent = requireElement(index, operation.parentId, "Move parent");
      if (targetParent.id === operation.nodeId || isDescendant(index, targetParent.id, operation.nodeId)) {
        throw new NorthstarProjectionStateError(
          `Move would place ${operation.nodeId} inside its own subtree.`,
        );
      }
      if (location.parent.id === targetParent.id && location.index === operation.index) return state;
      const moving = location.node;
      removeNodeByLocation(location);
      insertAt(targetParent, operation.index, moving);
      break;
    }

    case "set-text": {
      const location = index.get(operation.nodeId);
      if (!location) throw new NorthstarProjectionStateError(`Text node ${operation.nodeId} does not exist.`);
      if (location.node.kind !== "text") {
        throw new NorthstarProjectionStateError(`Node ${operation.nodeId} is not a text node.`);
      }
      (location.node as { text: string }).text = operation.text;
      break;
    }

    case "set-attributes": {
      const node = requireElement(index, operation.nodeId, "Attribute target");
      (node as { attributes: Readonly<Record<string, string>> }).attributes = { ...operation.attributes };
      break;
    }

    case "set-styles": {
      const node = requireElement(index, operation.nodeId, "Style target");
      (node as { styles: NorthstarProjectionElementNode["styles"] }).styles = Object.fromEntries(
        Object.entries(operation.styles).map(([name, declaration]) => [name, { ...declaration }]),
      );
      break;
    }

    case "set-classes": {
      const node = requireElement(index, operation.nodeId, "Class target");
      (node as { classes: readonly string[] }).classes = [...operation.classes];
      break;
    }

    case "set-css-layer": {
      const layers = state.cssLayers as Record<string, string>;
      if (operation.cssText === null) delete layers[operation.layerId];
      else layers[operation.layerId] = operation.cssText;
      state.cssLayers = Object.fromEntries(
        Object.entries(layers).sort(([left], [right]) => left.localeCompare(right)),
      );
      break;
    }

    case "set-space":
      state.space = { ...operation.space };
      break;
  }

  // Parsing after every operation guarantees that no operation can create an
  // invalid, duplicate, cyclic, or unsupported canonical state.
  return parseNorthstarProjectionState(state);
}

export function applyNorthstarProjectionOperations(
  state: NorthstarProjectionState,
  operations: readonly NorthstarProjectionOperation[],
): NorthstarProjectionState {
  return operations.reduce(
    (current, operation) => applyNorthstarProjectionOperation(current, operation),
    parseNorthstarProjectionState(state),
  );
}

function compatibleIdentity(
  base: NorthstarProjectionNode,
  target: NorthstarProjectionNode,
): boolean {
  if (base.kind !== target.kind) return false;
  if (base.kind === "text") return true;
  return base.tag === (target as NorthstarProjectionElementNode).tag &&
    base.namespace === (target as NorthstarProjectionElementNode).namespace;
}

function shallowNode(node: NorthstarProjectionNode): NorthstarProjectionNode {
  if (node.kind === "text") return { ...node };
  return { ...node, children: [] };
}

function subtreeContainsIndexedNode(
  node: NorthstarProjectionNode,
  index: ReadonlyMap<string, NodeLocation>,
): boolean {
  if (index.has(node.id)) return true;
  return node.kind === "element" &&
    node.children.some((child) => subtreeContainsIndexedNode(child, index));
}

export function diffNorthstarProjectionStates(
  inputBase: NorthstarProjectionState,
  inputTarget: NorthstarProjectionState,
): readonly NorthstarProjectionOperation[] {
  const base = parseNorthstarProjectionState(inputBase);
  const target = parseNorthstarProjectionState(inputTarget);
  if (base.root.id !== target.root.id) {
    throw new NorthstarProjectionStateError(
      `Projection root identity cannot change from ${base.root.id} to ${target.root.id}.`,
    );
  }

  const baseIndex = buildIndex(base);
  const targetIndex = buildIndex(target);
  for (const [id, baseLocation] of baseIndex) {
    const targetLocation = targetIndex.get(id);
    if (targetLocation && !compatibleIdentity(baseLocation.node, targetLocation.node)) {
      throw new NorthstarProjectionStateError(
        `Stable node ${id} changed node kind, tag, or namespace. Use a new node ID for replacement.`,
      );
    }
  }

  let current = cloneNorthstarProjectionState(base);
  const operations: NorthstarProjectionOperation[] = [];
  const emit = (operation: NorthstarProjectionOperation): void => {
    const parsed = parseNorthstarProjectionOperation(operation);
    current = applyNorthstarProjectionOperation(current, parsed);
    operations.push(parsed);
  };

  const placeChildren = (targetParent: NorthstarProjectionElementNode): void => {
    for (let targetPosition = 0; targetPosition < targetParent.children.length; targetPosition += 1) {
      const targetChild = targetParent.children[targetPosition]!;
      const currentIndex = buildIndex(current);
      const existing = currentIndex.get(targetChild.id);
      let insertedWholeSubtree = false;
      if (!existing) {
        // Preserve a complete new subtree as one primitive insertion whenever
        // none of its stable IDs already exists. Besides being more efficient,
        // this keeps the prepared plan within the same bounded operation budget
        // as the Phase 2 draft that introduced it.
        insertedWholeSubtree = !subtreeContainsIndexedNode(targetChild, currentIndex);
        emit({
          type: "insert-node",
          parentId: targetParent.id,
          index: targetPosition,
          node: insertedWholeSubtree ? targetChild : shallowNode(targetChild),
        });
      } else if (existing.parent?.id !== targetParent.id || existing.index !== targetPosition) {
        emit({
          type: "move-node",
          nodeId: targetChild.id,
          parentId: targetParent.id,
          index: targetPosition,
        });
      }
      if (targetChild.kind === "element" && !insertedWholeSubtree) placeChildren(targetChild);
    }
  };
  placeChildren(target.root);

  // Remove only top-most nodes absent from the target. Stable descendants have
  // already been moved to their target parents by the placement pass.
  const removeMissing = (currentParent: NorthstarProjectionElementNode): void => {
    for (let index = currentParent.children.length - 1; index >= 0; index -= 1) {
      const child = currentParent.children[index]!;
      if (!targetIndex.has(child.id)) {
        emit({ type: "remove-node", nodeId: child.id });
        continue;
      }
      const refreshed = buildIndex(current).get(child.id)?.node;
      if (refreshed?.kind === "element") removeMissing(refreshed);
    }
  };
  removeMissing(current.root);

  const updateContent = (targetNode: NorthstarProjectionNode): void => {
    const currentNode = buildIndex(current).get(targetNode.id)?.node;
    if (!currentNode) throw new NorthstarProjectionStateError(`Node ${targetNode.id} vanished during diff.`);
    if (targetNode.kind === "text") {
      if (currentNode.kind !== "text") throw new NorthstarProjectionStateError(`Node ${targetNode.id} changed kind.`);
      if (currentNode.text !== targetNode.text) {
        emit({ type: "set-text", nodeId: targetNode.id, text: targetNode.text });
      }
      return;
    }
    if (currentNode.kind !== "element") throw new NorthstarProjectionStateError(`Node ${targetNode.id} changed kind.`);
    if (!sameLedgerValue(currentNode.attributes, targetNode.attributes)) {
      emit({ type: "set-attributes", nodeId: targetNode.id, attributes: targetNode.attributes });
    }
    if (!sameLedgerValue(currentNode.styles, targetNode.styles)) {
      emit({ type: "set-styles", nodeId: targetNode.id, styles: targetNode.styles });
    }
    if (!sameLedgerValue(currentNode.classes, targetNode.classes)) {
      emit({ type: "set-classes", nodeId: targetNode.id, classes: targetNode.classes });
    }
    targetNode.children.forEach(updateContent);
  };
  updateContent(target.root);

  const layerIds = [...new Set([
    ...Object.keys(current.cssLayers),
    ...Object.keys(target.cssLayers),
  ])].sort((left, right) => left.localeCompare(right));
  for (const layerId of layerIds) {
    const currentCss = current.cssLayers[layerId];
    const targetCss = target.cssLayers[layerId];
    if (currentCss !== targetCss) {
      emit({ type: "set-css-layer", layerId, cssText: targetCss ?? null });
    }
  }
  if (!sameLedgerValue(current.space, target.space)) {
    emit({ type: "set-space", space: target.space });
  }

  if (!sameLedgerValue(current, target)) {
    throw new NorthstarProjectionStateError("Deterministic projection diff did not reproduce the target state.");
  }
  return operations;
}


export interface NorthstarProjectionStateDifference {
  path: string;
  kind: "missing" | "type" | "value" | "length";
  expected: NorthstarLedgerValue;
  actual: NorthstarLedgerValue;
  expectedNodeCount: number;
  actualNodeCount: number;
}

function projectionNodeCount(node: NorthstarProjectionNode): number {
  if (node.kind === "text") return 1;
  return 1 + node.children.reduce((total, child) => total + projectionNodeCount(child), 0);
}

function diagnosticValue(value: unknown): NorthstarLedgerValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length <= 12) return value.map(diagnosticValue);
    return [
      ...value.slice(0, 10).map(diagnosticValue),
      `… ${value.length - 10} more items`,
    ];
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const limited = entries.slice(0, 20).map(([key, entry]) => [key, diagnosticValue(entry)] as const);
    if (entries.length > 20) limited.push(["…", `${entries.length - 20} more keys`]);
    return Object.fromEntries(limited);
  }
  return String(value);
}

function firstProjectionValueDifference(
  expected: unknown,
  actual: unknown,
  path: string,
): Omit<NorthstarProjectionStateDifference, "expectedNodeCount" | "actualNodeCount"> | null {
  if (expected === actual) return null;
  if (expected === undefined || actual === undefined) {
    return {
      path,
      kind: "missing",
      expected: diagnosticValue(expected),
      actual: diagnosticValue(actual),
    };
  }
  if (expected === null || actual === null || typeof expected !== typeof actual) {
    return {
      path,
      kind: "type",
      expected: diagnosticValue(expected),
      actual: diagnosticValue(actual),
    };
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return { path, kind: "type", expected: diagnosticValue(expected), actual: diagnosticValue(actual) };
    }
    if (expected.length !== actual.length) {
      return {
        path: `${path}.length`,
        kind: "length",
        expected: expected.length,
        actual: actual.length,
      };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstProjectionValueDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (typeof expected === "object" && typeof actual === "object") {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])]
      .sort((left, right) => left.localeCompare(right));
    for (const key of keys) {
      const difference = firstProjectionValueDifference(
        expectedRecord[key],
        actualRecord[key],
        `${path}.${key}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return {
    path,
    kind: "value",
    expected: diagnosticValue(expected),
    actual: diagnosticValue(actual),
  };
}

/**
 * Produces a bounded, copy-safe first structural difference for projection
 * failures. This is diagnostics only and never participates in authority.
 */
export function diagnoseNorthstarProjectionStateDifference(
  inputExpected: NorthstarProjectionState,
  inputActual: NorthstarProjectionState,
): NorthstarProjectionStateDifference | null {
  const expected = parseNorthstarProjectionState(inputExpected);
  const actual = parseNorthstarProjectionState(inputActual);
  const difference = firstProjectionValueDifference(expected, actual, "$state");
  if (!difference) return null;
  return {
    ...difference,
    expectedNodeCount: projectionNodeCount(expected.root),
    actualNodeCount: projectionNodeCount(actual.root),
  };
}

export function hashNorthstarProjectionState(state: NorthstarProjectionState): string {
  const parsed = parseNorthstarProjectionState(state);
  return createNorthstarLedgerHash(parsed as unknown as NorthstarLedgerValue);
}

export function northstarProjectionStatesEqual(
  left: NorthstarProjectionState,
  right: NorthstarProjectionState,
): boolean {
  return sameLedgerValue(
    parseNorthstarProjectionState(left),
    parseNorthstarProjectionState(right),
  );
}

export function projectionStateAsLedgerValue(
  state: NorthstarProjectionState,
): NorthstarLedgerValue {
  const parsed = parseNorthstarProjectionState(state);
  return cloneNorthstarLedgerValue(parsed as unknown as NorthstarLedgerValue);
}

export function assertNorthstarProjectionStateValue(
  value: unknown,
): asserts value is NorthstarProjectionState {
  try {
    parseNorthstarProjectionState(value);
  } catch (error) {
    if (error instanceof NorthstarProjectionValidationError) throw error;
    throw new NorthstarProjectionValidationError(
      error instanceof Error ? error.message : String(error),
    );
  }
}
