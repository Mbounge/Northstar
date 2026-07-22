import {
  NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA,
  NORTHSTAR_PREPARED_PROJECTION_SCHEMA,
  NORTHSTAR_PROJECTION_STATE_SCHEMA,
  type NorthstarArtboardMutationDraft,
  type NorthstarPreparedProjection,
  type NorthstarProjectionElementNode,
  type NorthstarProjectionNode,
  type NorthstarProjectionOperation,
  type NorthstarProjectionSpace,
  type NorthstarProjectionState,
  type NorthstarProjectionStyleDeclaration,
} from "@/lib/canvas-projection/types";

export class NorthstarProjectionValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "NorthstarProjectionValidationError";
  }
}

const MAX_OPERATIONS = 500;
const MAX_NODES = 5_000;
const MAX_DEPTH = 80;
const MAX_TEXT_LENGTH = 200_000;
const MAX_CSS_LENGTH = 500_000;
const MAX_VALUE_LENGTH = 64_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const TAG_PATTERN = /^[a-z][a-z0-9-]{0,79}$/;
const ATTRIBUTE_PATTERN = /^[A-Za-z_:][A-Za-z0-9_.:-]{0,159}$/;
const CSS_PROPERTY_PATTERN = /^(?:--[A-Za-z0-9_-]{1,120}|-?[a-z][a-z0-9-]{0,120})$/;
const FORBIDDEN_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "meta",
  "link",
  "form",
  "input",
  "textarea",
  "select",
  "option",
  "button",
  "style",
  "template",
]);
const URL_ATTRIBUTES = new Set(["src", "href", "xlink:href", "poster"]);
const RESERVED_ATTRIBUTES = new Set([
  "class",
  "style",
  "data-ns-node-id",
  "data-ns-runtime-owned",
  "data-ns-projection-layer",
  "data-ns-projection-space",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new NorthstarProjectionValidationError(`${path} must be an object.`);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new NorthstarProjectionValidationError(`${path}.${key} is not allowed.`);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new NorthstarProjectionValidationError(`${path}.${key} is required.`);
    }
  }
}

function stringValue(value: unknown, path: string, maximum = MAX_VALUE_LENGTH): string {
  if (typeof value !== "string") {
    throw new NorthstarProjectionValidationError(`${path} must be a string.`);
  }
  if (value.length > maximum) {
    throw new NorthstarProjectionValidationError(`${path} exceeds ${maximum} characters.`);
  }
  return value;
}

function identifier(value: unknown, path: string): string {
  const parsed = stringValue(value, path, 160);
  if (!ID_PATTERN.test(parsed)) {
    throw new NorthstarProjectionValidationError(`${path} is not a valid stable node identifier.`);
  }
  return parsed;
}

function integer(value: unknown, path: string, maximum = MAX_NODES): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new NorthstarProjectionValidationError(
      `${path} must be an integer from 0 through ${maximum}.`,
    );
  }
  return value as number;
}

function finiteNonNegative(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new NorthstarProjectionValidationError(`${path} must be a finite non-negative number.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function sortedRecord<T>(entries: readonly (readonly [string, T])[]): Record<string, T> {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function safeURL(value: string, path: string): void {
  const compact = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
  if (
    compact.startsWith("javascript:") ||
    compact.startsWith("vbscript:") ||
    compact.startsWith("data:text/html")
  ) {
    throw new NorthstarProjectionValidationError(`${path} contains an unsafe URL.`);
  }
}

export function assertSafeNorthstarProjectionCSS(cssText: string, path = "$.cssText"): void {
  const compact = cssText.toLowerCase();
  if (
    compact.includes("@import") ||
    compact.includes("javascript:") ||
    compact.includes("expression(") ||
    compact.includes("behavior:") ||
    compact.includes("-moz-binding") ||
    compact.includes("</style")
  ) {
    throw new NorthstarProjectionValidationError(`${path} contains prohibited CSS.`);
  }
}

function parseAttributes(
  value: unknown,
  path: string,
  namespace: "html" | "svg" | null = null,
): Readonly<Record<string, string>> {
  const input = record(value, path);
  const entries: Array<readonly [string, string]> = [];
  const canonicalNames = new Set<string>();
  for (const [rawName, rawValue] of Object.entries(input)) {
    const safetyName = rawName.toLowerCase();
    const name = namespace === "html" ? safetyName : rawName;
    if (!ATTRIBUTE_PATTERN.test(rawName)) {
      throw new NorthstarProjectionValidationError(`${path}.${rawName} is not a valid attribute name.`);
    }
    if (canonicalNames.has(name)) {
      throw new NorthstarProjectionValidationError(
        `${path}.${rawName} duplicates canonical attribute ${name}.`,
      );
    }
    canonicalNames.add(name);
    if (
      safetyName.startsWith("on") ||
      safetyName === "srcdoc" ||
      safetyName === "formaction" ||
      RESERVED_ATTRIBUTES.has(safetyName) ||
      safetyName.startsWith("data-ns-projection-")
    ) {
      throw new NorthstarProjectionValidationError(`${path}.${rawName} is reserved or unsafe.`);
    }
    const parsed = stringValue(rawValue, `${path}.${rawName}`);
    if (URL_ATTRIBUTES.has(safetyName)) safeURL(parsed, `${path}.${rawName}`);
    if (/javascript\s*:/i.test(parsed)) {
      throw new NorthstarProjectionValidationError(`${path}.${rawName} contains unsafe content.`);
    }
    entries.push([name, parsed]);
  }
  return sortedRecord(entries);
}

function parseClasses(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new NorthstarProjectionValidationError(`${path} must be an array.`);
  }
  if (value.length > 500) {
    throw new NorthstarProjectionValidationError(`${path} contains too many classes.`);
  }
  const classes = value.map((entry, index) => {
    const parsed = stringValue(entry, `${path}[${index}]`, 256).trim();
    if (!parsed || /\s/.test(parsed)) {
      throw new NorthstarProjectionValidationError(`${path}[${index}] must be one class token.`);
    }
    return parsed;
  });
  return [...new Set(classes)].sort((left, right) => left.localeCompare(right));
}

function parseStyleDeclaration(
  value: unknown,
  path: string,
): NorthstarProjectionStyleDeclaration {
  const input = record(value, path);
  exactKeys(input, ["value", "priority"], ["value", "priority"], path);
  const parsedValue = stringValue(input.value, `${path}.value`, 16_000);
  const priority = input.priority;
  if (priority !== "" && priority !== "important") {
    throw new NorthstarProjectionValidationError(`${path}.priority must be empty or important.`);
  }
  if (/javascript\s*:/i.test(parsedValue) || /expression\s*\(/i.test(parsedValue)) {
    throw new NorthstarProjectionValidationError(`${path}.value contains unsafe CSS.`);
  }
  return { value: parsedValue, priority };
}

function parseStyles(
  value: unknown,
  path: string,
): Readonly<Record<string, NorthstarProjectionStyleDeclaration>> {
  const input = record(value, path);
  const entries: Array<readonly [string, NorthstarProjectionStyleDeclaration]> = [];
  const canonicalNames = new Set<string>();
  for (const [rawName, rawValue] of Object.entries(input)) {
    // Custom property names are case-sensitive; standard property names are not.
    const name = rawName.startsWith("--") ? rawName : rawName.toLowerCase();
    if (!CSS_PROPERTY_PATTERN.test(name)) {
      throw new NorthstarProjectionValidationError(`${path}.${rawName} is not a valid CSS property.`);
    }
    if (canonicalNames.has(name)) {
      throw new NorthstarProjectionValidationError(
        `${path}.${rawName} duplicates canonical CSS property ${name}.`,
      );
    }
    canonicalNames.add(name);
    entries.push([name, parseStyleDeclaration(rawValue, `${path}.${rawName}`)]);
  }
  return sortedRecord(entries);
}

function parseSpace(value: unknown, path: string): NorthstarProjectionSpace {
  const input = record(value, path);
  exactKeys(input, ["left", "top", "right", "bottom"], ["left", "top", "right", "bottom"], path);
  return {
    left: finiteNonNegative(input.left, `${path}.left`),
    top: finiteNonNegative(input.top, `${path}.top`),
    right: finiteNonNegative(input.right, `${path}.right`),
    bottom: finiteNonNegative(input.bottom, `${path}.bottom`),
  };
}

interface NodeParseTracker {
  count: number;
  ids: Set<string>;
}

function parseNode(
  value: unknown,
  path: string,
  depth: number,
  tracker: NodeParseTracker,
): NorthstarProjectionNode {
  if (depth > MAX_DEPTH) {
    throw new NorthstarProjectionValidationError(`${path} exceeds maximum tree depth ${MAX_DEPTH}.`);
  }
  tracker.count += 1;
  if (tracker.count > MAX_NODES) {
    throw new NorthstarProjectionValidationError(`Projection tree exceeds ${MAX_NODES} nodes.`);
  }
  const input = record(value, path);
  const kind = input.kind;
  if (kind !== "text" && kind !== "element") {
    throw new NorthstarProjectionValidationError(`${path}.kind must be text or element.`);
  }
  const id = identifier(input.id, `${path}.id`);
  if (tracker.ids.has(id)) {
    throw new NorthstarProjectionValidationError(`${path}.id duplicates stable node ${id}.`);
  }
  tracker.ids.add(id);

  if (kind === "text") {
    exactKeys(input, ["kind", "id", "text"], ["kind", "id", "text"], path);
    return {
      kind,
      id,
      text: stringValue(input.text, `${path}.text`, MAX_TEXT_LENGTH),
    };
  }

  exactKeys(
    input,
    ["kind", "id", "tag", "namespace", "attributes", "classes", "styles", "children"],
    ["kind", "id", "tag", "namespace", "attributes", "classes", "styles", "children"],
    path,
  );
  const namespace = input.namespace;
  if (namespace !== "html" && namespace !== "svg") {
    throw new NorthstarProjectionValidationError(`${path}.namespace must be html or svg.`);
  }
  const rawTag = stringValue(input.tag, `${path}.tag`, 80);
  const tag = namespace === "html" ? rawTag.toLowerCase() : rawTag;
  const validTag = namespace === "html"
    ? TAG_PATTERN.test(tag)
    : /^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(tag);
  if (!validTag || FORBIDDEN_TAGS.has(tag.toLowerCase())) {
    throw new NorthstarProjectionValidationError(`${path}.tag ${tag} is prohibited.`);
  }
  if (!Array.isArray(input.children)) {
    throw new NorthstarProjectionValidationError(`${path}.children must be an array.`);
  }
  const children = input.children.map((child, index) =>
    parseNode(child, `${path}.children[${index}]`, depth + 1, tracker),
  );
  return {
    kind,
    id,
    tag,
    namespace,
    attributes: parseAttributes(input.attributes, `${path}.attributes`, namespace),
    classes: parseClasses(input.classes, `${path}.classes`),
    styles: parseStyles(input.styles, `${path}.styles`),
    children,
  } satisfies NorthstarProjectionElementNode;
}

function parseCssLayers(value: unknown, path: string): Readonly<Record<string, string>> {
  const input = record(value, path);
  if (Object.keys(input).length > 500) {
    throw new NorthstarProjectionValidationError(`${path} exceeds 500 CSS layers.`);
  }
  const entries: Array<readonly [string, string]> = [];
  for (const [rawId, rawCss] of Object.entries(input)) {
    const id = identifier(rawId, `${path}.${rawId}`);
    const cssText = stringValue(rawCss, `${path}.${rawId}`, MAX_CSS_LENGTH);
    assertSafeNorthstarProjectionCSS(cssText, `${path}.${rawId}`);
    entries.push([id, cssText]);
  }
  return sortedRecord(entries);
}

export function parseNorthstarProjectionState(
  value: unknown,
  path = "$",
): NorthstarProjectionState {
  const input = record(value, path);
  exactKeys(input, ["schema", "root", "cssLayers", "space"], ["schema", "root", "cssLayers", "space"], path);
  if (input.schema !== NORTHSTAR_PROJECTION_STATE_SCHEMA) {
    throw new NorthstarProjectionValidationError(
      `${path}.schema must be ${NORTHSTAR_PROJECTION_STATE_SCHEMA}.`,
    );
  }
  const tracker: NodeParseTracker = { count: 0, ids: new Set() };
  const root = parseNode(input.root, `${path}.root`, 0, tracker);
  if (root.kind !== "element") {
    throw new NorthstarProjectionValidationError(`${path}.root must be an element node.`);
  }
  return {
    schema: NORTHSTAR_PROJECTION_STATE_SCHEMA,
    root,
    cssLayers: parseCssLayers(input.cssLayers, `${path}.cssLayers`),
    space: parseSpace(input.space, `${path}.space`),
  };
}

export function parseNorthstarProjectionOperation(
  value: unknown,
  path = "$",
): NorthstarProjectionOperation {
  const input = record(value, path);
  const type = input.type;
  if (typeof type !== "string") {
    throw new NorthstarProjectionValidationError(`${path}.type is required.`);
  }
  switch (type) {
    case "insert-node": {
      exactKeys(input, ["type", "parentId", "index", "node"], ["type", "parentId", "index", "node"], path);
      const tracker: NodeParseTracker = { count: 0, ids: new Set() };
      return {
        type,
        parentId: identifier(input.parentId, `${path}.parentId`),
        index: integer(input.index, `${path}.index`),
        node: parseNode(input.node, `${path}.node`, 0, tracker),
      };
    }
    case "remove-node":
      exactKeys(input, ["type", "nodeId"], ["type", "nodeId"], path);
      return { type, nodeId: identifier(input.nodeId, `${path}.nodeId`) };
    case "move-node":
      exactKeys(input, ["type", "nodeId", "parentId", "index"], ["type", "nodeId", "parentId", "index"], path);
      return {
        type,
        nodeId: identifier(input.nodeId, `${path}.nodeId`),
        parentId: identifier(input.parentId, `${path}.parentId`),
        index: integer(input.index, `${path}.index`),
      };
    case "set-text": {
      exactKeys(input, ["type", "nodeId", "target", "text"], ["type", "text"], path);
      const target = input.nodeId ?? input.target;
      if (input.nodeId !== undefined && input.target !== undefined && input.nodeId !== input.target) {
        throw new NorthstarProjectionValidationError(`${path} contains contradictory node targets.`);
      }
      return {
        type,
        nodeId: identifier(target, `${path}.nodeId`),
        text: stringValue(input.text, `${path}.text`, MAX_TEXT_LENGTH),
      };
    }
    case "set-attributes":
      exactKeys(input, ["type", "nodeId", "attributes"], ["type", "nodeId", "attributes"], path);
      return {
        type,
        nodeId: identifier(input.nodeId, `${path}.nodeId`),
        attributes: parseAttributes(input.attributes, `${path}.attributes`, null),
      };
    case "set-styles":
      exactKeys(input, ["type", "nodeId", "styles"], ["type", "nodeId", "styles"], path);
      return {
        type,
        nodeId: identifier(input.nodeId, `${path}.nodeId`),
        styles: parseStyles(input.styles, `${path}.styles`),
      };
    case "set-classes":
      exactKeys(input, ["type", "nodeId", "classes"], ["type", "nodeId", "classes"], path);
      return {
        type,
        nodeId: identifier(input.nodeId, `${path}.nodeId`),
        classes: parseClasses(input.classes, `${path}.classes`),
      };
    case "set-css-layer": {
      exactKeys(input, ["type", "layerId", "cssText"], ["type", "layerId", "cssText"], path);
      const cssText = input.cssText === null
        ? null
        : stringValue(input.cssText, `${path}.cssText`, MAX_CSS_LENGTH);
      if (cssText !== null) assertSafeNorthstarProjectionCSS(cssText, `${path}.cssText`);
      return {
        type,
        layerId: identifier(input.layerId, `${path}.layerId`),
        cssText,
      };
    }
    case "set-space":
      exactKeys(input, ["type", "space"], ["type", "space"], path);
      return { type, space: parseSpace(input.space, `${path}.space`) };
    default:
      throw new NorthstarProjectionValidationError(`${path}.type ${type} is not supported.`);
  }
}

export function parseNorthstarArtboardMutationDraft(
  value: unknown,
  path = "$",
): NorthstarArtboardMutationDraft {
  const input = record(value, path);
  exactKeys(input, ["schema", "operations"], ["operations"], path);
  if (
    input.schema !== undefined &&
    input.schema !== NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA
  ) {
    throw new NorthstarProjectionValidationError(
      `${path}.schema must be ${NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA}.`,
    );
  }
  if (!Array.isArray(input.operations)) {
    throw new NorthstarProjectionValidationError(`${path}.operations must be an array.`);
  }
  if (input.operations.length === 0 || input.operations.length > MAX_OPERATIONS) {
    throw new NorthstarProjectionValidationError(
      `${path}.operations must contain 1 through ${MAX_OPERATIONS} operations.`,
    );
  }
  return {
    schema: NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA,
    operations: input.operations.map((operation, index) =>
      parseNorthstarProjectionOperation(operation, `${path}.operations[${index}]`),
    ),
  };
}

export function parseNorthstarPreparedProjection(
  value: unknown,
  path = "$",
): NorthstarPreparedProjection {
  const input = record(value, path);
  exactKeys(
    input,
    ["schema", "baseStateHash", "targetStateHash", "operations"],
    ["schema", "baseStateHash", "targetStateHash", "operations"],
    path,
  );
  if (input.schema !== NORTHSTAR_PREPARED_PROJECTION_SCHEMA) {
    throw new NorthstarProjectionValidationError(
      `${path}.schema must be ${NORTHSTAR_PREPARED_PROJECTION_SCHEMA}.`,
    );
  }
  const baseStateHash = stringValue(input.baseStateHash, `${path}.baseStateHash`, 96);
  const targetStateHash = stringValue(input.targetStateHash, `${path}.targetStateHash`, 96);
  if (!/^nsl1-[a-f0-9]{64}$/.test(baseStateHash) || !/^nsl1-[a-f0-9]{64}$/.test(targetStateHash)) {
    throw new NorthstarProjectionValidationError(`${path} contains an invalid state hash.`);
  }
  if (!Array.isArray(input.operations) || input.operations.length > MAX_OPERATIONS) {
    throw new NorthstarProjectionValidationError(
      `${path}.operations must be an array with at most ${MAX_OPERATIONS} entries.`,
    );
  }
  return {
    schema: NORTHSTAR_PREPARED_PROJECTION_SCHEMA,
    baseStateHash,
    targetStateHash,
    operations: input.operations.map((operation, index) =>
      parseNorthstarProjectionOperation(operation, `${path}.operations[${index}]`),
    ),
  };
}
