import { NORTHSTAR_PROJECTION_PROTOCOL_VERSION } from "@/lib/canvas-projection/types";

/**
 * Builds the isolated iframe-side direct projection bridge. The script is
 * intentionally self-contained because srcDoc artifacts cannot import host
 * modules. It never accepts HTML strings and never replaces the authored root.
 */
export function buildNorthstarProjectionBridgeScript(): string {
  return String.raw`
(() => {
  "use strict";

  const PROTOCOL_VERSION = ${NORTHSTAR_PROJECTION_PROTOCOL_VERSION};
  const STATE_SCHEMA = "northstar.projection-state.v1";
  const ROOT_SELECTOR = "#northstar-artifact-root";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
  const FORBIDDEN_TAGS = new Set(["script","iframe","object","embed","base","meta","link","form","input","textarea","select","option","button","style","template"]);
  const RESERVED_ATTRIBUTES = new Set(["class","style","data-ns-node-id","data-ns-runtime-owned","data-ns-projection-layer","data-ns-projection-space"]);
  const URL_ATTRIBUTES = new Set(["src","href","xlink:href","poster"]);
  const surfaceSessionId = "projection-surface:" + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const nodeIdentity = new WeakMap();
  let generatedIdentity = 0;

  class ProjectionBridgeError extends Error {
    constructor(code, message, retryable, outcomeUnknown) {
      super(message);
      this.name = "ProjectionBridgeError";
      this.code = code;
      this.retryable = Boolean(retryable);
      this.outcomeUnknown = Boolean(outcomeUnknown);
    }
  }

  const ownRecord = (value, name) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ProjectionBridgeError("INVALID_MESSAGE", name + " must be an object.", false, false);
    }
    return value;
  };

  const exactKeys = (value, allowed, required, name) => {
    const allowedSet = new Set(allowed);
    Object.keys(value).forEach((key) => {
      if (!allowedSet.has(key)) throw new ProjectionBridgeError("INVALID_MESSAGE", name + "." + key + " is not allowed.", false, false);
    });
    required.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new ProjectionBridgeError("INVALID_MESSAGE", name + "." + key + " is required.", false, false);
      }
    });
  };

  const stableId = (value, name) => {
    if (typeof value !== "string" || !ID_PATTERN.test(value)) {
      throw new ProjectionBridgeError("INVALID_NODE_ID", name + " is not a valid stable node identifier.", false, false);
    }
    return value;
  };

  const safeUrl = (value, name) => {
    const compact = String(value).trim().replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
    if (compact.startsWith("javascript:") || compact.startsWith("vbscript:") || compact.startsWith("data:text/html")) {
      throw new ProjectionBridgeError("UNSAFE_ATTRIBUTE", name + " contains an unsafe URL.", false, false);
    }
  };

  const assertCssText = (value, name) => {
    if (typeof value !== "string" || value.length > 500000) {
      throw new ProjectionBridgeError("INVALID_CSS", name + " must be a bounded string.", false, false);
    }
    const compact = value.toLowerCase();
    if (compact.includes("@import") || compact.includes("javascript:") || compact.includes("expression(") || compact.includes("behavior:") || compact.includes("-moz-binding") || compact.includes("</style")) {
      throw new ProjectionBridgeError("UNSAFE_CSS", name + " contains prohibited CSS.", false, false);
    }
    if (typeof CSSStyleSheet === "function" && CSSStyleSheet.prototype && typeof CSSStyleSheet.prototype.replaceSync === "function") {
      const sheet = new CSSStyleSheet();
      try { sheet.replaceSync(value); }
      catch (error) {
        throw new ProjectionBridgeError("INVALID_CSS", name + " is not valid stylesheet text: " + (error && error.message ? error.message : String(error)), false, false);
      }
    }
  };

  const parseSpace = (space, name) => {
    const value = ownRecord(space, name);
    exactKeys(value, ["left","top","right","bottom"], ["left","top","right","bottom"], name);
    const result = {};
    ["left","top","right","bottom"].forEach((key) => {
      const number = value[key];
      if (typeof number !== "number" || !Number.isFinite(number) || number < 0) {
        throw new ProjectionBridgeError("INVALID_SPACE", name + "." + key + " must be a finite non-negative number.", false, false);
      }
      result[key] = Object.is(number, -0) ? 0 : number;
    });
    return result;
  };

  const parseAttributes = (attributes, name, namespace) => {
    const value = ownRecord(attributes, name);
    const output = {};
    const canonicalNames = new Set();
    Object.keys(value).sort().forEach((rawName) => {
      const lower = rawName.toLowerCase();
      const canonicalName = namespace === "html" ? lower : rawName;
      const rawValue = value[rawName];
      if (!/^[A-Za-z_:][A-Za-z0-9_.:-]{0,159}$/.test(rawName) || lower.startsWith("on") || lower === "srcdoc" || lower === "formaction" || RESERVED_ATTRIBUTES.has(lower) || lower.startsWith("data-ns-projection-")) {
        throw new ProjectionBridgeError("UNSAFE_ATTRIBUTE", name + "." + rawName + " is reserved or unsafe.", false, false);
      }
      if (canonicalNames.has(canonicalName)) {
        throw new ProjectionBridgeError("INVALID_ATTRIBUTE", name + "." + rawName + " duplicates canonical attribute " + canonicalName + ".", false, false);
      }
      canonicalNames.add(canonicalName);
      if (typeof rawValue !== "string" || rawValue.length > 64000 || /javascript\s*:/i.test(rawValue)) {
        throw new ProjectionBridgeError("UNSAFE_ATTRIBUTE", name + "." + rawName + " is invalid.", false, false);
      }
      if (URL_ATTRIBUTES.has(lower)) safeUrl(rawValue, name + "." + rawName);
      output[canonicalName] = rawValue;
    });
    return output;
  };

  const parseClasses = (classes, name) => {
    if (!Array.isArray(classes) || classes.length > 500) {
      throw new ProjectionBridgeError("INVALID_CLASSES", name + " must be a bounded array.", false, false);
    }
    const tokens = classes.map((value, index) => {
      if (typeof value !== "string" || !value.trim() || /\s/.test(value) || value.length > 256) {
        throw new ProjectionBridgeError("INVALID_CLASSES", name + "[" + index + "] is not one class token.", false, false);
      }
      return value;
    });
    return Array.from(new Set(tokens)).sort();
  };

  const parseStyles = (styles, name, tag, namespace) => {
    const value = ownRecord(styles, name);
    const scratch = namespace === "svg"
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);
    const output = {};
    const canonicalProperties = new Set();
    Object.keys(value).sort().forEach((rawName) => {
      const property = rawName.startsWith("--") ? rawName : rawName.toLowerCase();
      if (!/^(?:--[A-Za-z0-9_-]{1,120}|-?[a-z][a-z0-9-]{0,120})$/.test(property)) {
        throw new ProjectionBridgeError("INVALID_STYLE_PROPERTY", name + "." + rawName + " is not a valid CSS property.", false, false);
      }
      if (canonicalProperties.has(property)) {
        throw new ProjectionBridgeError("INVALID_STYLE_PROPERTY", name + "." + rawName + " duplicates canonical CSS property " + property + ".", false, false);
      }
      canonicalProperties.add(property);
      const declaration = ownRecord(value[rawName], name + "." + rawName);
      exactKeys(declaration, ["value","priority"], ["value","priority"], name + "." + rawName);
      if (typeof declaration.value !== "string" || declaration.value.length > 16000 || /javascript\s*:|expression\s*\(/i.test(declaration.value)) {
        throw new ProjectionBridgeError("INVALID_STYLE_VALUE", name + "." + rawName + " has an invalid value.", false, false);
      }
      if (declaration.priority !== "" && declaration.priority !== "important") {
        throw new ProjectionBridgeError("INVALID_STYLE_PRIORITY", name + "." + rawName + " has an invalid priority.", false, false);
      }
      scratch.style.setProperty(property, declaration.value, declaration.priority);
      const canonicalValue = scratch.style.getPropertyValue(property);
      if (declaration.value.trim() && !canonicalValue) {
        throw new ProjectionBridgeError("INVALID_STYLE_VALUE", name + "." + rawName + " was rejected by the browser CSSOM.", false, false);
      }
    });
    Array.from(scratch.style).sort().forEach((property) => {
      output[property] = {
        value: scratch.style.getPropertyValue(property),
        priority: scratch.style.getPropertyPriority(property) === "important" ? "important" : ""
      };
    });
    return output;
  };

  const parseNode = (node, name, ids, depth) => {
    if (depth > 80) throw new ProjectionBridgeError("TREE_TOO_DEEP", name + " exceeds maximum depth.", false, false);
    const value = ownRecord(node, name);
    const kind = value.kind;
    if (kind !== "text" && kind !== "element") throw new ProjectionBridgeError("INVALID_NODE", name + ".kind is invalid.", false, false);
    const id = stableId(value.id, name + ".id");
    if (ids.has(id)) throw new ProjectionBridgeError("DUPLICATE_NODE_ID", name + ".id duplicates " + id + ".", false, false);
    ids.add(id);
    if (ids.size > 5000) throw new ProjectionBridgeError("TOO_MANY_NODES", name + " exceeds the 5000-node limit.", false, false);
    if (kind === "text") {
      exactKeys(value, ["kind","id","text"], ["kind","id","text"], name);
      if (typeof value.text !== "string" || value.text.length > 200000) throw new ProjectionBridgeError("INVALID_TEXT", name + ".text is invalid.", false, false);
      return { kind: "text", id, text: value.text };
    }
    exactKeys(value, ["kind","id","tag","namespace","attributes","classes","styles","children"], ["kind","id","tag","namespace","attributes","classes","styles","children"], name);
    if (value.namespace !== "html" && value.namespace !== "svg") throw new ProjectionBridgeError("INVALID_NAMESPACE", name + ".namespace is invalid.", false, false);
    const rawTag = typeof value.tag === "string" ? value.tag : "";
    const tag = value.namespace === "html" ? rawTag.toLowerCase() : rawTag;
    const validTag = value.namespace === "html"
      ? /^[a-z][a-z0-9-]{0,79}$/.test(tag)
      : /^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(tag);
    if (!validTag || FORBIDDEN_TAGS.has(tag.toLowerCase())) throw new ProjectionBridgeError("FORBIDDEN_TAG", name + ".tag is prohibited.", false, false);
    if (!Array.isArray(value.children)) throw new ProjectionBridgeError("INVALID_CHILDREN", name + ".children must be an array.", false, false);
    const attributes = parseAttributes(value.attributes, name + ".attributes", value.namespace);
    const classes = parseClasses(value.classes, name + ".classes");
    const styles = parseStyles(value.styles, name + ".styles", tag, value.namespace);
    return {
      kind: "element",
      id,
      tag,
      namespace: value.namespace,
      attributes,
      classes,
      styles,
      children: value.children.map((child, index) => parseNode(child, name + ".children[" + index + "]", ids, depth + 1))
    };
  };

  const parseState = (state, name) => {
    const value = ownRecord(state, name);
    exactKeys(value, ["schema","root","cssLayers","space"], ["schema","root","cssLayers","space"], name);
    if (value.schema !== STATE_SCHEMA) throw new ProjectionBridgeError("INVALID_STATE_SCHEMA", name + ".schema is invalid.", false, false);
    const root = parseNode(value.root, name + ".root", new Set(), 0);
    if (root.kind !== "element") throw new ProjectionBridgeError("INVALID_ROOT", name + ".root must be an element.", false, false);
    const layers = ownRecord(value.cssLayers, name + ".cssLayers");
    const cssLayers = {};
    if (Object.keys(layers).length > 500) throw new ProjectionBridgeError("TOO_MANY_CSS_LAYERS", name + ".cssLayers exceeds 500 entries.", false, false);
    Object.keys(layers).sort().forEach((id) => {
      stableId(id, name + ".cssLayers key");
      assertCssText(layers[id], name + ".cssLayers." + id);
      cssLayers[id] = layers[id];
    });
    return { schema: STATE_SCHEMA, root, cssLayers, space: parseSpace(value.space, name + ".space") };
  };

  const parseOperation = (operation, name) => {
    const value = ownRecord(operation, name);
    const type = value.type;
    if (typeof type !== "string") throw new ProjectionBridgeError("INVALID_OPERATION", name + ".type is required.", false, false);
    switch (type) {
      case "insert-node":
        exactKeys(value, ["type","parentId","index","node"], ["type","parentId","index","node"], name);
        if (!Number.isInteger(value.index) || value.index < 0 || value.index > 5000) throw new ProjectionBridgeError("INVALID_INDEX", name + ".index is invalid.", false, false);
        return { type, parentId: stableId(value.parentId, name + ".parentId"), index: value.index, node: parseNode(value.node, name + ".node", new Set(), 0) };
      case "remove-node":
        exactKeys(value, ["type","nodeId"], ["type","nodeId"], name);
        return { type, nodeId: stableId(value.nodeId, name + ".nodeId") };
      case "move-node":
        exactKeys(value, ["type","nodeId","parentId","index"], ["type","nodeId","parentId","index"], name);
        if (!Number.isInteger(value.index) || value.index < 0 || value.index > 5000) throw new ProjectionBridgeError("INVALID_INDEX", name + ".index is invalid.", false, false);
        return { type, nodeId: stableId(value.nodeId, name + ".nodeId"), parentId: stableId(value.parentId, name + ".parentId"), index: value.index };
      case "set-text":
        exactKeys(value, ["type","nodeId","text"], ["type","nodeId","text"], name);
        if (typeof value.text !== "string" || value.text.length > 200000) throw new ProjectionBridgeError("INVALID_TEXT", name + ".text is invalid.", false, false);
        return { type, nodeId: stableId(value.nodeId, name + ".nodeId"), text: value.text };
      case "set-attributes":
        exactKeys(value, ["type","nodeId","attributes"], ["type","nodeId","attributes"], name);
        return { type, nodeId: stableId(value.nodeId, name + ".nodeId"), attributes: parseAttributes(value.attributes, name + ".attributes", null) };
      case "set-styles":
        exactKeys(value, ["type","nodeId","styles"], ["type","nodeId","styles"], name);
        return { type, nodeId: stableId(value.nodeId, name + ".nodeId"), styles: value.styles };
      case "set-classes":
        exactKeys(value, ["type","nodeId","classes"], ["type","nodeId","classes"], name);
        return { type, nodeId: stableId(value.nodeId, name + ".nodeId"), classes: parseClasses(value.classes, name + ".classes") };
      case "set-css-layer":
        exactKeys(value, ["type","layerId","cssText"], ["type","layerId","cssText"], name);
        stableId(value.layerId, name + ".layerId");
        if (value.cssText !== null) assertCssText(value.cssText, name + ".cssText");
        return { type, layerId: value.layerId, cssText: value.cssText };
      case "set-space":
        exactKeys(value, ["type","space"], ["type","space"], name);
        return { type, space: parseSpace(value.space, name + ".space") };
      default:
        throw new ProjectionBridgeError("UNSUPPORTED_OPERATION", name + ".type " + type + " is not supported.", false, false);
    }
  };

  const visibleChildren = (element) => Array.from(element.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE);

  const allocateId = (node, suggested) => {
    const existing = nodeIdentity.get(node);
    if (existing) return existing;
    const authored = node.nodeType === Node.ELEMENT_NODE ? node.getAttribute("data-ns-node-id") : null;
    const candidate = authored && ID_PATTERN.test(authored)
      ? authored
      : suggested || ((node.nodeType === Node.TEXT_NODE ? "auto-t-" : "auto-e-") + (++generatedIdentity));
    nodeIdentity.set(node, candidate);
    return candidate;
  };

  const captureNode = (node, nodesById, suggested) => {
    const id = allocateId(node, suggested);
    if (nodesById.has(id) && nodesById.get(id) !== node) throw new ProjectionBridgeError("DUPLICATE_NODE_ID", "Live DOM duplicates node ID " + id + ".", false, false);
    nodesById.set(id, node);
    if (node.nodeType === Node.TEXT_NODE) return { kind: "text", id, text: node.data };
    const element = node;
    const attributes = {};
    const namespace = element.namespaceURI === SVG_NS ? "svg" : "html";
    Array.from(element.attributes).sort((a,b) => a.name.localeCompare(b.name)).forEach((attribute) => {
      const safetyName = attribute.name.toLowerCase();
      const name = namespace === "html" ? safetyName : attribute.name;
      if (!RESERVED_ATTRIBUTES.has(safetyName) && !safetyName.startsWith("data-ns-runtime-") && !safetyName.startsWith("data-ns-projection-")) attributes[name] = attribute.value;
    });
    const styles = {};
    Array.from(element.style).sort().forEach((property) => {
      styles[property] = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property) === "important" ? "important" : ""
      };
    });
    return {
      kind: "element",
      id,
      tag: namespace === "html" ? element.localName.toLowerCase() : element.localName,
      namespace,
      attributes,
      classes: Array.from(element.classList).sort(),
      styles,
      children: visibleChildren(element).map((child, index) => captureNode(child, nodesById, id + ":child-" + index))
    };
  };

  const readSpace = (root) => ({
    left: Number(root.getAttribute("data-ns-projection-space-left")) || 0,
    top: Number(root.getAttribute("data-ns-projection-space-top")) || 0,
    right: Number(root.getAttribute("data-ns-projection-space-right")) || 0,
    bottom: Number(root.getAttribute("data-ns-projection-space-bottom")) || 0
  });

  const captureLive = () => {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) throw new ProjectionBridgeError("PROJECTION_ROOT_MISSING", "The live projection root is missing.", true, false);
    const nodesById = new Map();
    const capturedRoot = captureNode(root, nodesById, "root");
    const cssLayers = {};
    document.querySelectorAll("style[data-ns-projection-layer]").forEach((style) => {
      const id = style.getAttribute("data-ns-projection-layer");
      if (id && ID_PATTERN.test(id)) cssLayers[id] = style.textContent || "";
    });
    return {
      state: parseState({ schema: STATE_SCHEMA, root: capturedRoot, cssLayers, space: readSpace(root) }, "capturedState"),
      root,
      nodesById,
      live: true,
      cssLayers,
      space: readSpace(root)
    };
  };

  const setElementAttributes = (element, attributes) => {
    const namespace = element.namespaceURI === SVG_NS ? "svg" : "html";
    const parsed = parseAttributes(attributes, "operation.attributes", namespace);
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (!RESERVED_ATTRIBUTES.has(name) && !name.startsWith("data-ns-runtime-") && !name.startsWith("data-ns-projection-")) element.removeAttribute(attribute.name);
    });
    Object.keys(parsed).forEach((name) => element.setAttribute(name, parsed[name]));
  };

  const setElementClasses = (element, classes) => {
    element.setAttribute("class", parseClasses(classes, "operation.classes").join(" "));
  };

  const setElementStyles = (element, styles) => {
    const namespace = element.namespaceURI === SVG_NS ? "svg" : "html";
    const parsed = parseStyles(styles, "operation.styles", element.localName.toLowerCase(), namespace);
    while (element.style.length) element.style.removeProperty(element.style.item(0));
    Object.keys(parsed).forEach((property) => {
      const declaration = parsed[property];
      element.style.setProperty(property, declaration.value, declaration.priority);
    });
  };

  const createDomNode = (node, ownerDocument, nodesById) => {
    const parsed = parseNode(node, "operation.node", new Set(), 0);
    let created;
    if (parsed.kind === "text") {
      created = ownerDocument.createTextNode(parsed.text);
      nodeIdentity.set(created, parsed.id);
      nodesById.set(parsed.id, created);
      return created;
    }
    created = parsed.namespace === "svg"
      ? ownerDocument.createElementNS(SVG_NS, parsed.tag)
      : ownerDocument.createElement(parsed.tag);
    nodeIdentity.set(created, parsed.id);
    nodesById.set(parsed.id, created);
    created.setAttribute("data-ns-node-id", parsed.id);
    setElementAttributes(created, parsed.attributes);
    setElementClasses(created, parsed.classes);
    setElementStyles(created, parsed.styles);
    parsed.children.forEach((child) => created.appendChild(createDomNode(child, ownerDocument, nodesById)));
    return created;
  };

  const contextFromState = (state) => {
    const parsed = parseState(state, "baseState");
    const nodesById = new Map();
    const root = createDomNode(parsed.root, document, nodesById);
    return { state: parsed, root, nodesById, live: false, cssLayers: Object.assign({}, parsed.cssLayers), space: Object.assign({}, parsed.space) };
  };

  const refreshContext = (context) => {
    const nodesById = new Map();
    const root = captureNode(context.root, nodesById, context.state && context.state.root ? context.state.root.id : "root");
    context.nodesById = nodesById;
    context.state = parseState({ schema: STATE_SCHEMA, root, cssLayers: context.cssLayers, space: context.space }, "contextState");
    return context;
  };

  const requireElement = (context, id, role) => {
    const node = context.nodesById.get(id);
    if (!node) throw new ProjectionBridgeError("NODE_NOT_FOUND", role + " " + id + " does not exist.", false, false);
    if (node.nodeType !== Node.ELEMENT_NODE) throw new ProjectionBridgeError("NODE_KIND_MISMATCH", role + " " + id + " is not an element.", false, false);
    return node;
  };

  const nodeIds = (node, output) => {
    output.push(node.id);
    if (node.kind === "element") node.children.forEach((child) => nodeIds(child, output));
    return output;
  };

  const applyOperation = (context, rawOperation) => {
    refreshContext(context);
    const operation = parseOperation(rawOperation, "operation");
    switch (operation.type) {
      case "insert-node": {
        const parent = requireElement(context, operation.parentId, "Insertion parent");
        const collidingId = nodeIds(operation.node, []).find((id) => context.nodesById.has(id));
        if (collidingId) throw new ProjectionBridgeError("DUPLICATE_NODE_ID", "Insertion subtree node " + collidingId + " already exists.", false, false);
        const created = createDomNode(operation.node, document, context.nodesById);
        const children = visibleChildren(parent);
        if (operation.index > children.length) throw new ProjectionBridgeError("INVALID_INDEX", "Insertion index exceeds child count.", false, false);
        parent.insertBefore(created, children[operation.index] || null);
        break;
      }
      case "remove-node": {
        const node = context.nodesById.get(operation.nodeId);
        if (!node) return;
        if (node === context.root) throw new ProjectionBridgeError("ROOT_MUTATION_FORBIDDEN", "The projection root cannot be removed.", false, false);
        node.remove();
        break;
      }
      case "move-node": {
        const node = context.nodesById.get(operation.nodeId);
        const parent = requireElement(context, operation.parentId, "Move parent");
        if (!node) throw new ProjectionBridgeError("NODE_NOT_FOUND", "Move node " + operation.nodeId + " does not exist.", false, false);
        if (node === context.root || node.contains(parent)) throw new ProjectionBridgeError("INVALID_MOVE", "Move would create a cycle or move the root.", false, false);
        node.remove();
        const children = visibleChildren(parent);
        if (operation.index > children.length) throw new ProjectionBridgeError("INVALID_INDEX", "Move index exceeds child count.", false, false);
        parent.insertBefore(node, children[operation.index] || null);
        break;
      }
      case "set-text": {
        const node = context.nodesById.get(operation.nodeId);
        if (!node) throw new ProjectionBridgeError("NODE_NOT_FOUND", "Text node " + operation.nodeId + " does not exist.", false, false);
        if (node.nodeType !== Node.TEXT_NODE) throw new ProjectionBridgeError("NODE_KIND_MISMATCH", "Node " + operation.nodeId + " is not text.", false, false);
        node.data = operation.text;
        break;
      }
      case "set-attributes": setElementAttributes(requireElement(context, operation.nodeId, "Attribute target"), operation.attributes); break;
      case "set-styles": setElementStyles(requireElement(context, operation.nodeId, "Style target"), operation.styles); break;
      case "set-classes": setElementClasses(requireElement(context, operation.nodeId, "Class target"), operation.classes); break;
      case "set-css-layer": {
        if (context.live) {
          let style = document.querySelector('style[data-ns-projection-layer="' + CSS.escape(operation.layerId) + '"]');
          if (operation.cssText === null) { if (style) style.remove(); }
          else {
            if (!style) {
              style = document.createElement("style");
              style.setAttribute("data-ns-projection-layer", operation.layerId);
              document.head.appendChild(style);
            }
            style.textContent = operation.cssText;
          }
        }
        if (operation.cssText === null) delete context.cssLayers[operation.layerId];
        else context.cssLayers[operation.layerId] = operation.cssText;
        break;
      }
      case "set-space": {
        context.space = operation.space;
        if (context.live) {
          ["left","top","right","bottom"].forEach((key) => context.root.setAttribute("data-ns-projection-space-" + key, String(operation.space[key])));
        }
        break;
      }
    }
    refreshContext(context);
  };

  const prepareDetached = (baseState, operations) => {
    if (!Array.isArray(operations) || operations.length > 500) throw new ProjectionBridgeError("INVALID_OPERATIONS", "operations must be a bounded array.", false, false);
    const context = contextFromState(baseState);
    operations.forEach((operation) => applyOperation(context, operation));
    return refreshContext(context).state;
  };

  const responseTarget = () => parent && typeof parent.postMessage === "function" ? parent : window;
  const respond = (requestId, payload) => {
    responseTarget().postMessage(Object.assign({
      protocolVersion: PROTOCOL_VERSION,
      type: "northstar.projection.response",
      requestId,
      surfaceSessionId
    }, payload), "*");
  };

  addEventListener("message", (event) => {
    if (event.source !== responseTarget()) return;
    const message = event.data;
    if (!message || typeof message !== "object" || message.protocolVersion !== PROTOCOL_VERSION || typeof message.requestId !== "string") return;
    if (message.type !== "northstar.projection.capture" && message.type !== "northstar.projection.prepare" && message.type !== "northstar.projection.apply") return;
    try {
      if (message.type === "northstar.projection.capture") {
        exactKeys(message, ["protocolVersion","type","requestId","surfaceSessionId"], ["protocolVersion","type","requestId"], "request");
        if (message.surfaceSessionId && message.surfaceSessionId !== surfaceSessionId) throw new ProjectionBridgeError("SURFACE_SESSION_MISMATCH", "Capture targeted a stale surface session.", false, false);
        respond(message.requestId, { ok: true, state: captureLive().state });
        return;
      }
      if (message.type === "northstar.projection.prepare") {
        exactKeys(message, ["protocolVersion","type","requestId","surfaceSessionId","baseState","operations"], ["protocolVersion","type","requestId","baseState","operations"], "request");
        if (message.surfaceSessionId && message.surfaceSessionId !== surfaceSessionId) throw new ProjectionBridgeError("SURFACE_SESSION_MISMATCH", "Preparation targeted a stale surface session.", false, false);
        respond(message.requestId, { ok: true, state: prepareDetached(message.baseState, message.operations) });
        return;
      }
      exactKeys(message, ["protocolVersion","type","requestId","surfaceSessionId","operationIndex","operation"], ["protocolVersion","type","requestId","surfaceSessionId","operationIndex","operation"], "request");
      if (message.surfaceSessionId !== surfaceSessionId) throw new ProjectionBridgeError("SURFACE_SESSION_MISMATCH", "Operation targeted a stale surface session.", false, false);
      if (!Number.isInteger(message.operationIndex)) throw new ProjectionBridgeError("INVALID_OPERATION_INDEX", "operationIndex must be an integer.", false, false);
      const context = captureLive();
      applyOperation(context, message.operation);
      respond(message.requestId, { ok: true });
    } catch (error) {
      const known = error instanceof ProjectionBridgeError;
      respond(message.requestId, {
        ok: false,
        code: known ? error.code : "PROJECTION_BRIDGE_INTERNAL_ERROR",
        message: known ? error.message : (error && error.message ? error.message : String(error)),
        retryable: known ? error.retryable : false,
        outcomeUnknown: known ? error.outcomeUnknown : true
      });
    }
  });

  responseTarget().postMessage({
    protocolVersion: PROTOCOL_VERSION,
    type: "northstar.projection.ready",
    surfaceSessionId
  }, "*");
})();`;
}
