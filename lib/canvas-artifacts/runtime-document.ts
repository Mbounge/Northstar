// Northstar Canvas Artifact Runtime v0.4.8.2 — browser-authoritative transactional mutations, dynamic assets, exact acknowledgements, and live geometry
import type { CanvasCodeArtifactPayload } from "./types";
import { NORTHSTAR_DESIGN_KERNEL_CSS } from "@/lib/canvas-ai/northstar-design-kernel";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeScript(value: string): string {
  return value
    .replaceAll("</script", "<\\/script")
    .replaceAll("<!--", "<\\!--")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function safeJson(value: unknown): string {
  return escapeScript(JSON.stringify(value));
}


function buildWebCanvasArtifactRuntimeDocument(artifact: CanvasCodeArtifactPayload): string | undefined {
  const documentSource = artifact.document;
  const dataBundle = artifact.dataBundle;
  if (!documentSource || !dataBundle) return undefined;

  const activeStageIndex = Math.max(0, artifact.activeStageIndex ?? 0);
  const stages = artifact.stagePlan ?? [];
  const minimumWidth = Math.max(1, Math.round(artifact.minimumWidth));
  const minimumHeight = Math.max(1, Math.round(artifact.minimumHeight));
  const initialJournal = artifact.mutationJournal ?? [];
  const allowedAssetUrls = Array.from(new Set([
    ...(dataBundle.allowedAssetUrls ?? []),
    ...dataBundle.screenshots.map((screen) => screen.imageUrl).filter((value): value is string => Boolean(value)),
    ...dataBundle.apps.map((app) => app.iconUrl).filter((value): value is string => Boolean(value)),
  ]));

  const bridgeScript = String.raw`
(() => {
  "use strict";
  const ARTIFACT_ID = ${safeJson(artifact.artifactId)};
  const SURFACE_ID = ${safeJson(artifact.surfaceId ?? artifact.artifactId)};
  let currentRevisionId = ${safeJson(artifact.revisionId)};
  let currentMutationId = null;
  let currentData = ${safeJson(dataBundle)};
  let currentCreative = ${safeJson(artifact.creativeDirection ?? null)};
  let currentReviews = ${safeJson(artifact.creativeReviews ?? [])};
  let activeStageIndex = ${activeStageIndex};
  const STAGES = ${safeJson(stages)};
  const INITIAL_JOURNAL = ${safeJson(initialJournal)};
  const ALLOWED_ASSETS = new Set(${safeJson(allowedAssetUrls)});
  const registerAssets = (values) => {
    for (const value of Array.isArray(values) ? values : []) {
      if (typeof value === "string" && /^(?:https?:|data:|blob:)/i.test(value)) ALLOWED_ASSETS.add(value);
    }
  };
  const MINIMUM_WIDTH = ${minimumWidth};
  const MINIMUM_HEIGHT = ${minimumHeight};
  const appliedMutationIds = new Set();
  const mutationQueue = [];
  let applyingMutation = false;
  let pendingAcknowledgement = null;
  let requestedBounds = { minX: 0, minY: 0, maxX: MINIMUM_WIDTH, maxY: MINIMUM_HEIGHT };

  const stageSurface = document.getElementById("northstar-artifact-stage");
  const origin = document.getElementById("northstar-artifact-origin");
  const root = document.getElementById("northstar-artifact-root");
  if (!stageSurface || !origin || !root) return;

  const cssEscape = (value) => window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9:_-]/g, "");
  const LEGACY_NODE_SELECTORS = Object.freeze({
    artboard: ".ns-artifact,main,article",
    header: "header,.ns-header",
    title: ".ns-thesis,h1",
    deck: ".ns-deck,.working-deck,header p",
    evidence: ".working-evidence,.ns-atlas,[data-ns-reference-flow],[data-ns-flow-id]",
    synthesis: ".working-synthesis,.ns-synthesis,.synthesis,footer",
    decision: ".working-decision,.ns-decision,.recommendation,[data-ns-stage=\"recommendation\"]",
    "current-act": ".working-act",
    "current-act-text": ".working-act strong",
  });
  const nodeById = (id) => {
    if (id === "__root__") return root;
    const direct = root.querySelector('[data-ns-node-id="' + cssEscape(id) + '"]');
    if (direct) return direct;
    const selector = LEGACY_NODE_SELECTORS[id];
    const legacy = selector ? root.querySelector(selector) : null;
    if (legacy && !legacy.hasAttribute("data-ns-node-id")) legacy.setAttribute("data-ns-node-id", id);
    return legacy;
  };
  const assetAllowed = (value) => !value || value.startsWith("data:") || value.startsWith("blob:") || ALLOWED_ASSETS.has(value);
  const sanitizeFragment = (html) => {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    template.content.querySelectorAll("script,iframe,object,embed,link,meta,base,form,input,textarea,select,option").forEach((element) => element.remove());
    template.content.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        if (name.startsWith("on") || name === "srcdoc" || name === "formaction" || /javascript\s*:/i.test(value)) element.removeAttribute(attribute.name);
      });
      if (element instanceof HTMLImageElement && !assetAllowed(element.getAttribute("src") || "")) element.removeAttribute("src");
      if (element.matches("a[href]")) element.removeAttribute("href");
    });
    return template.content;
  };
  const enforceAssetPolicy = (scope = root) => {
    scope.querySelectorAll?.("img[src],image[href],source[src],video[poster]").forEach((element) => {
      const attribute = element.hasAttribute("src") ? "src" : element.hasAttribute("href") ? "href" : "poster";
      const value = element.getAttribute(attribute) || "";
      if (!assetAllowed(value)) element.removeAttribute(attribute);
    });
    scope.querySelectorAll?.("a[href]").forEach((element) => element.removeAttribute("href"));
  };

  const requestSpace = (request = {}) => {
    const left = Math.max(0, Number(request.left) || 0);
    const top = Math.max(0, Number(request.top) || 0);
    const right = Math.max(0, Number(request.right) || 0);
    const bottom = Math.max(0, Number(request.bottom) || 0);
    requestedBounds.minX = Math.min(requestedBounds.minX, -left);
    requestedBounds.minY = Math.min(requestedBounds.minY, -top);
    requestedBounds.maxX = Math.max(requestedBounds.maxX, MINIMUM_WIDTH + right);
    requestedBounds.maxY = Math.max(requestedBounds.maxY, MINIMUM_HEIGHT + bottom);
    queueContentSize();
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const extent = (values) => {
    const nums = (values || []).map(Number).filter(Number.isFinite);
    return nums.length ? [Math.min(...nums), Math.max(...nums)] : [0, 1];
  };
  const linearScale = (domain, range) => {
    const d0 = Number(domain?.[0]) || 0, d1 = Number(domain?.[1]) || 1;
    const r0 = Number(range?.[0]) || 0, r1 = Number(range?.[1]) || 1;
    const span = d1 - d0 || 1;
    return (value) => r0 + ((Number(value) - d0) / span) * (r1 - r0);
  };
  const bandScale = (domain, range, padding = .16) => {
    const values = Array.from(domain || []), start = Number(range?.[0]) || 0, end = Number(range?.[1]) || 1;
    const step = Math.max(1, end - start) / Math.max(1, values.length + padding * Math.max(0, values.length - 1));
    const width = step * (1 - padding), index = new Map(values.map((value, i) => [String(value), i]));
    const scale = (value) => start + (index.get(String(value)) ?? 0) * step;
    scale.bandwidth = () => width;
    return scale;
  };
  const linePath = (points) => (points || []).map((point, index) => (index ? "L" : "M") + Number(point[0]).toFixed(2) + "," + Number(point[1]).toFixed(2)).join(" ");
  const formatNumber = (value, options) => new Intl.NumberFormat(undefined, options || {}).format(Number(value) || 0);

  const Northstar = Object.freeze({
    get data() { return currentData; },
    get creative() { return currentCreative; },
    get reviews() { return currentReviews; },
    root,
    query: (selector) => root.querySelector(selector),
    queryAll: (selector) => Array.from(root.querySelectorAll(selector)),
    on: (target, event, handler, options) => { target?.addEventListener?.(event, handler, options); return () => target?.removeEventListener?.(event, handler, options); },
    emit: (name, detail) => root.dispatchEvent(new CustomEvent(name, { detail })),
    canvas: Object.freeze({ requestSpace, baseSize: Object.freeze({ width: MINIMUM_WIDTH, height: MINIMUM_HEIGHT }) }),
    viz: Object.freeze({ clamp, extent, linearScale, bandScale, linePath, formatNumber }),
  });
  Object.defineProperty(window, "Northstar", { value: Northstar, writable: false, configurable: false });
  const forbidden = () => Promise.reject(new Error("Network and credential access are unavailable inside Northstar artifacts."));
  try { Object.defineProperty(window, "fetch", { value: forbidden, configurable: false }); } catch {}
  try { Object.defineProperty(window, "XMLHttpRequest", { value: undefined, configurable: false }); } catch {}
  try { Object.defineProperty(window, "WebSocket", { value: undefined, configurable: false }); } catch {}

  const stageIndexFor = (phase) => {
    const found = STAGES.findIndex((stage) => stage.phase === phase);
    return found < 0 ? 0 : found;
  };
  const applyStage = () => {
    root.querySelectorAll("[data-ns-stage]").forEach((element) => {
      const index = stageIndexFor(element.getAttribute("data-ns-stage") || "foundation");
      element.setAttribute("data-ns-stage-state", index < activeStageIndex ? "complete" : index === activeStageIndex ? "active" : "future");
      element.setAttribute("aria-hidden", "false");
      element.removeAttribute("data-ns-pending");
    });
  };

  const snapshotRects = () => {
    const map = new Map();
    root.querySelectorAll("[data-ns-node-id]").forEach((element) => {
      const id = element.getAttribute("data-ns-node-id");
      if (id) map.set(id, element.getBoundingClientRect());
    });
    return map;
  };
  const animateMutation = (before, duration) => {
    root.querySelectorAll("[data-ns-node-id]").forEach((element) => {
      const id = element.getAttribute("data-ns-node-id");
      if (!id || !(element instanceof HTMLElement || element instanceof SVGElement)) return;
      const prior = before.get(id), next = element.getBoundingClientRect();
      if (!prior) {
        element.animate([{ opacity: 0, transform: "translateY(10px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration, easing: "cubic-bezier(.2,.8,.2,1)" });
        return;
      }
      const dx = prior.left - next.left, dy = prior.top - next.top;
      const sx = next.width > 0 ? prior.width / next.width : 1, sy = next.height > 0 ? prior.height / next.height : 1;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
      element.animate([{ transformOrigin: "top left", transform: "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")" }, { transformOrigin: "top left", transform: "none" }], { duration, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
  };

  const PROGRESS_ONLY_NODE_IDS = new Set(["kicker", "current-act", "current-act-text"]);
  const semanticSnapshot = () => {
    const snapshot = new Map();
    root.querySelectorAll("[data-ns-node-id]").forEach((element) => {
      const id = element.getAttribute("data-ns-node-id");
      if (!id) return;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      snapshot.set(id, {
        rect: [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value * 10) / 10),
        text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 1200),
        className: element.getAttribute("class") || "",
        inlineStyle: element.getAttribute("style") || "",
        display: style.display,
        opacity: style.opacity,
        fontSize: style.fontSize,
        src: element instanceof HTMLImageElement ? element.currentSrc || element.getAttribute("src") || "" : "",
        childCount: element.children.length,
      });
    });
    return snapshot;
  };
  const diffSemanticSnapshots = (before, after) => {
    const changed = [];
    const ids = new Set([...before.keys(), ...after.keys()]);
    for (const id of ids) {
      if (JSON.stringify(before.get(id) || null) !== JSON.stringify(after.get(id) || null)) changed.push(id);
    }
    const meaningful = changed.filter((id) => !PROGRESS_ONLY_NODE_IDS.has(id));
    return { changed, meaningful };
  };
  const captureStyleState = () => new Map(Array.from(document.querySelectorAll('style[id^="northstar-mutation-style-"]')).map((style) => [style.id, style.textContent || ""]));
  const restoreStyleState = (state) => {
    document.querySelectorAll('style[id^="northstar-mutation-style-"]').forEach((style) => {
      if (!state.has(style.id)) style.remove();
    });
    for (const [id, css] of state) {
      let style = document.getElementById(id);
      if (!style) { style = document.createElement("style"); style.id = id; document.head.appendChild(style); }
      style.textContent = css;
    }
  };
  const captureLiveSnapshot = () => ({
    html: root.innerHTML,
    css: Array.from(document.querySelectorAll("style")).map((style) => style.textContent || "").join("\n"),
    capturedAt: new Date().toISOString(),
  });
  const loadedAssetUrls = () => Array.from(root.querySelectorAll("img[src]")).filter((image) => image.complete && image.naturalWidth > 0).map((image) => image.currentSrc || image.getAttribute("src") || "").filter(Boolean);
  const missingRequiredAssets = (required) => {
    const loaded = new Set(loadedAssetUrls());
    return Array.from(new Set(required || [])).filter((url) => !loaded.has(url));
  };
  const classifyChangeKinds = (batch, diff, beforeBounds, afterBounds) => {
    const kinds = new Set();
    for (const operation of batch.operations || []) {
      if (["insert-html", "remove", "move"].includes(operation.op)) kinds.add("structure");
      if (operation.op === "move") kinds.add("position");
      if (operation.op === "set-text" || operation.op === "set-html" || operation.op === "insert-html") kinds.add("content");
      if (operation.op === "set-styles" || operation.op === "set-classes" || operation.op === "set-css-layer") kinds.add("style");
      if (operation.op === "request-space") kinds.add("geometry");
      if (operation.op === "set-styles" && Object.keys(operation.styles || {}).some((key) => /width|height|flex-basis|font-size|transform|scale/i.test(key))) kinds.add("scale");
    }
    if (Math.abs(afterBounds.width - beforeBounds.width) > 2 || Math.abs(afterBounds.height - beforeBounds.height) > 2 || afterBounds.minX !== beforeBounds.minX || afterBounds.minY !== beforeBounds.minY) kinds.add("geometry");
    if ((batch.requiredAssetUrls || []).length) kinds.add("assets");
    if (diff.meaningful.length && kinds.size === 0) kinds.add("content");
    return Array.from(kinds);
  };

  const applyOperation = (operation) => {
    if (!operation || typeof operation.op !== "string") return;
    if (operation.op === "request-space") { requestSpace(operation); return; }
    if (operation.op === "set-css-layer") {
      const styleId = "northstar-mutation-style-" + String(operation.layerId || "layer").replace(/[^a-zA-Z0-9_-]/g, "-");
      let style = document.getElementById(styleId);
      if (!style) { style = document.createElement("style"); style.id = styleId; document.head.appendChild(style); }
      style.textContent = String(operation.css || "").replace(/@import|url\s*\([^)]*\)|expression\s*\([^)]*\)/gi, "");
      return;
    }
    const target = nodeById(operation.targetId);
    // A stale optional target should not freeze the living surface. Other operations in
    // the same batch still apply, and the next model move receives the exact rendered state.
    if (!target) return;
    if (operation.op === "set-text") { target.textContent = String(operation.text || ""); return; }
    if (operation.op === "set-html") {
      if (operation.targetId === "artboard" || target === root) throw new Error("The permanent artboard root cannot be replaced.");
      target.replaceChildren(sanitizeFragment(operation.html));
      return;
    }
    if (operation.op === "insert-html") {
      const fragment = sanitizeFragment(operation.html);
      if (operation.position === "afterbegin") target.prepend(fragment);
      else if (operation.position === "beforeend") target.append(fragment);
      else if (operation.position === "beforebegin") target.before(fragment);
      else if (operation.position === "afterend") target.after(fragment);
      return;
    }
    if (operation.op === "remove") { if (operation.targetId !== "artboard") target.remove(); return; }
    if (operation.op === "move") {
      const parent = nodeById(operation.parentId), before = operation.beforeId ? nodeById(operation.beforeId) : null;
      if (!parent) throw new Error("Mutation parent was not found: " + operation.parentId);
      parent.insertBefore(target, before && before.parentElement === parent ? before : null);
      return;
    }
    if (operation.op === "set-attributes") {
      Object.entries(operation.attributes || {}).forEach(([name, value]) => {
        if (/^on/i.test(name) || ["srcdoc", "formaction", "action", "target"].includes(name.toLowerCase())) return;
        if (value === null) target.removeAttribute(name); else target.setAttribute(name, String(value));
      });
      return;
    }
    if (operation.op === "set-styles") {
      Object.entries(operation.styles || {}).forEach(([name, value]) => {
        if (/^(behavior|-moz-binding)$/i.test(name)) return;
        if (value === null) target.style.removeProperty(name); else if (!/url\s*\(|expression\s*\(|javascript\s*:/i.test(String(value))) target.style.setProperty(name, String(value));
      });
      return;
    }
    if (operation.op === "set-classes") {
      (operation.remove || []).forEach((value) => target.classList.remove(value));
      (operation.add || []).forEach((value) => target.classList.add(value));
    }
  };

  const applyMutationBatch = async (batch, revisionId, acknowledge = true) => {
    if (!batch || appliedMutationIds.has(batch.mutationId)) return;
    const expectedParent = Array.from(appliedMutationIds).at(-1);
    if (batch.parentMutationId && expectedParent && batch.parentMutationId !== expectedParent) throw new Error("Mutation lineage is discontinuous.");
    registerAssets(batch.requiredAssetUrls || []);
    const transaction = {
      html: root.innerHTML,
      styles: captureStyleState(),
      requestedBounds: { ...requestedBounds },
      revisionId: currentRevisionId,
      mutationId: currentMutationId,
      beforeSnapshot: semanticSnapshot(),
      beforeBounds: getContentBounds(),
    };
    if (batch.geometryIntent === "contract-after-refinement" || batch.geometryIntent === "recompose") {
      requestedBounds = { minX: 0, minY: 0, maxX: MINIMUM_WIDTH, maxY: MINIMUM_HEIGHT };
    }
    const before = snapshotRects();
    root.setAttribute("data-ns-mutating", "true");
    for (const operation of batch.operations || []) applyOperation(operation);
    enforceAssetPolicy(root);
    applyStage();
    currentRevisionId = revisionId || currentRevisionId;
    currentMutationId = batch.mutationId;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    animateMutation(before, Math.max(80, Math.min(1200, Number(batch.transitionMs) || 320)));
    root.removeAttribute("data-ns-mutating");
    if (acknowledge) {
      pendingAcknowledgement = { batch, transaction, mutationId: batch.mutationId, revisionId: currentRevisionId, visibleChange: batch.visibleChange };
    } else {
      appliedMutationIds.add(batch.mutationId);
    }
    queueContentSize();
  };

  const processQueue = async () => {
    if (applyingMutation) return;
    applyingMutation = true;
    try {
      while (mutationQueue.length) {
        const item = mutationQueue.shift();
        try { await applyMutationBatch(item.batch, item.revisionId, true); }
        catch (error) {
          parent.postMessage({ type: "northstar.artifact.runtime-error", artifactId: ARTIFACT_ID, revisionId: item.revisionId, mutationId: item.batch?.mutationId, message: error instanceof Error ? error.message : String(error) }, "*");
        }
      }
    } finally { applyingMutation = false; }
  };

  const getContentBounds = () => {
    const rootRect = root.getBoundingClientRect();
    let minX = Math.min(0, requestedBounds.minX), minY = Math.min(0, requestedBounds.minY);
    let maxX = Math.max(MINIMUM_WIDTH, requestedBounds.maxX), maxY = Math.max(MINIMUM_HEIGHT, requestedBounds.maxY);
    [root, ...root.querySelectorAll("*")].forEach((element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return;
      const left = rect.left - rootRect.left, top = rect.top - rootRect.top;
      minX = Math.min(minX, left); minY = Math.min(minY, top);
      maxX = Math.max(maxX, rect.right - rootRect.left, left + (element.scrollWidth || 0));
      maxY = Math.max(maxY, rect.bottom - rootRect.top, top + (element.scrollHeight || 0));
    });
    minX = Math.floor(minX); minY = Math.floor(minY); maxX = Math.ceil(maxX); maxY = Math.ceil(maxY);
    return { minX, minY, maxX, maxY, width: Math.max(MINIMUM_WIDTH, maxX - minX), height: Math.max(MINIMUM_HEIGHT, maxY - minY) };
  };

  const audit = () => {
    const elements = Array.from(root.querySelectorAll("*"));
    let overflowElementCount = 0, clippedTextCount = 0, smallTextCount = 0, tinyInteractiveCount = 0, missingImageCount = 0, internalScrollElementCount = 0;
    elements.forEach((element) => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      const overflowX = element.scrollWidth > element.clientWidth + 2, overflowY = element.scrollHeight > element.clientHeight + 2;
      const clipsX = ["hidden", "clip"].includes(style.overflowX), clipsY = ["hidden", "clip"].includes(style.overflowY);
      const scrollsX = ["auto", "scroll"].includes(style.overflowX), scrollsY = ["auto", "scroll"].includes(style.overflowY);
      if ((clipsX && overflowX) || (clipsY && overflowY)) clippedTextCount += 1;
      if ((scrollsX && overflowX) || (scrollsY && overflowY)) internalScrollElementCount += 1;
      if ((clipsX && overflowX) || (clipsY && overflowY) || (scrollsX && overflowX) || (scrollsY && overflowY)) overflowElementCount += 1;
      const fontSize = Number.parseFloat(style.fontSize || "0");
      if ((element.textContent || "").trim() && element.children.length === 0 && fontSize > 0 && fontSize < 12) smallTextCount += 1;
      if (element.matches("button,input,select,textarea,[role=button],[tabindex]") && (rect.width < 28 || rect.height < 28)) tinyInteractiveCount += 1;
      if (element instanceof HTMLImageElement && element.complete && element.naturalWidth === 0) missingImageCount += 1;
    });
    const bounds = getContentBounds(), stageRegions = Array.from(root.querySelectorAll("[data-ns-stage]"));
    const documentScrollRisk = internalScrollElementCount > 0;
    const issueCount = overflowElementCount + clippedTextCount + smallTextCount + tinyInteractiveCount + missingImageCount + (documentScrollRisk ? 1 : 0);
    const review = {
      revisionId: currentRevisionId, mutationId: currentMutationId, stageIndex: activeStageIndex, evaluatedAt: new Date().toISOString(),
      rootWidth: bounds.width, rootHeight: bounds.height, elementCount: elements.length,
      stageRegionCount: stageRegions.length, visibleStageRegionCount: stageRegions.length,
      overflowElementCount, clippedTextCount, smallTextCount, tinyInteractiveCount, missingImageCount, documentScrollRisk,
      summary: issueCount ? "Live artboard audit detected " + issueCount + " potential visual issues for the next micro-adjustment." : "Live artboard audit passed.",
    };
    parent.postMessage({ type: "northstar.artifact.runtime-review", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: currentMutationId, review }, "*");
    return review;
  };

  let sizeFrame = 0, lastSignature = "", stableCount = 0, sequence = 0, initialReady = false;
  const reportContentSize = () => {
    const bounds = getContentBounds(), signature = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(":");
    stableCount = signature === lastSignature ? stableCount + 1 : 1; lastSignature = signature; sequence += 1;
    stageSurface.style.width = bounds.width + "px"; stageSurface.style.height = bounds.height + "px";
    origin.style.transform = "translate(" + (-bounds.minX) + "px," + (-bounds.minY) + "px)";
    const settled = document.readyState === "complete" && (!document.fonts || document.fonts.status === "loaded") && Array.from(document.images).every((image) => image.complete) && stableCount >= 2;
    const size = { artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: currentMutationId, measuredAt: new Date().toISOString(), intrinsicWidth: bounds.width, intrinsicHeight: bounds.height, contentBounds: { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY }, sequence, settled };
    parent.postMessage({ type: "northstar.artifact.content-size", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: currentMutationId, size }, "*");
    if (settled) {
      const review = audit();
      if (!initialReady) {
        initialReady = true;
        parent.postMessage({ type: "northstar.artifact.ready", artifactId: ARTIFACT_ID, surfaceId: SURFACE_ID, revisionId: currentRevisionId, mutationId: currentMutationId, appliedMutationIds: Array.from(appliedMutationIds), size, review, changedNodeIds: [], meaningfulChangedNodeIds: [], changeKinds: [], requiredAssetUrls: [], loadedAssetUrls: loadedAssetUrls(), missingAssetUrls: [], snapshot: captureLiveSnapshot() }, "*");
      }
      if (pendingAcknowledgement) {
        const acknowledgement = pendingAcknowledgement;
        const afterSnapshot = semanticSnapshot();
        const diff = diffSemanticSnapshots(acknowledgement.transaction.beforeSnapshot, afterSnapshot);
        const requiredAssets = Array.from(new Set(acknowledgement.batch.requiredAssetUrls || []));
        const missingAssets = missingRequiredAssets(requiredAssets);
        const afterBounds = getContentBounds();
        const changeKinds = classifyChangeKinds(acknowledgement.batch, diff, acknowledgement.transaction.beforeBounds, afterBounds);
        const minimumMeaningful = Math.max(1, Number(acknowledgement.batch.minimumMeaningfulChangedNodes) || 1);
        const textOnly = changeKinds.length === 1 && changeKinds[0] === "content";
        const requiredKinds = acknowledgement.batch.requiredChangeKinds || [];
        const missingRequiredKinds = requiredKinds.filter((kind) => !changeKinds.includes(kind));
        const hardIssues = review.overflowElementCount + review.clippedTextCount + review.missingImageCount + (review.documentScrollRisk ? 1 : 0);
        const rejectedReason = missingAssets.length
          ? "Required evidence assets did not load: " + missingAssets.join(", ")
          : diff.meaningful.length < minimumMeaningful
            ? "The proposed adjustment did not visibly change enough semantic content."
            : textOnly && acknowledgement.batch.allowTextOnly !== true
              ? "The proposed adjustment changed only copy or cosmetic styling when a compositional move was required."
              : missingRequiredKinds.length
                ? "The visible change did not satisfy the required design move: " + missingRequiredKinds.join(", ")
                : hardIssues > 0
                  ? "The live artboard audit rejected clipping, overflow, internal scrolling, or missing imagery."
                  : "";
        if (rejectedReason) {
          pendingAcknowledgement = null;
          root.innerHTML = acknowledgement.transaction.html;
          restoreStyleState(acknowledgement.transaction.styles);
          requestedBounds = { ...acknowledgement.transaction.requestedBounds };
          currentRevisionId = acknowledgement.transaction.revisionId;
          currentMutationId = acknowledgement.transaction.mutationId;
          enforceAssetPolicy(root);
          applyStage();
          parent.postMessage({
            type: "northstar.artifact.mutation-rejected",
            artifactId: ARTIFACT_ID,
            surfaceId: SURFACE_ID,
            revisionId: acknowledgement.revisionId,
            mutationId: acknowledgement.mutationId,
            message: rejectedReason,
            size,
            review: { ...review, hardFailureCount: hardIssues, requiredAssetCount: requiredAssets.length, missingRequiredAssetCount: missingAssets.length, meaningfulChangedNodeCount: diff.meaningful.length },
            changedNodeIds: diff.changed,
            meaningfulChangedNodeIds: diff.meaningful,
            changeKinds,
            requiredAssetUrls: requiredAssets,
            loadedAssetUrls: loadedAssetUrls(),
            missingAssetUrls: missingAssets,
          }, "*");
          queueContentSize();
        } else {
          pendingAcknowledgement = null;
          appliedMutationIds.add(acknowledgement.mutationId);
          const changedRects = diff.meaningful.map((id) => nodeById(id)?.getBoundingClientRect()).filter(Boolean);
          const rootRect = root.getBoundingClientRect();
          const changedBounds = changedRects.length ? {
            minX: Math.floor(Math.min(...changedRects.map((rect) => rect.left - rootRect.left))),
            minY: Math.floor(Math.min(...changedRects.map((rect) => rect.top - rootRect.top))),
            maxX: Math.ceil(Math.max(...changedRects.map((rect) => rect.right - rootRect.left))),
            maxY: Math.ceil(Math.max(...changedRects.map((rect) => rect.bottom - rootRect.top))),
          } : size.contentBounds;
          const acknowledgedSize = { ...size, changedBounds, changedNodeIds: diff.changed, meaningfulChangedNodeIds: diff.meaningful };
          parent.postMessage({
            type: "northstar.artifact.mutation-applied",
            artifactId: ARTIFACT_ID,
            surfaceId: SURFACE_ID,
            revisionId: acknowledgement.revisionId,
            mutationId: acknowledgement.mutationId,
            visibleChange: acknowledgement.visibleChange,
            size: acknowledgedSize,
            review: { ...review, hardFailureCount: 0, requiredAssetCount: requiredAssets.length, missingRequiredAssetCount: 0, meaningfulChangedNodeCount: diff.meaningful.length },
            changedNodeIds: diff.changed,
            meaningfulChangedNodeIds: diff.meaningful,
            changeKinds,
            requiredAssetUrls: requiredAssets,
            loadedAssetUrls: loadedAssetUrls(),
            missingAssetUrls: [],
            snapshot: captureLiveSnapshot(),
          }, "*");
        }
      }
    }
  };
  const queueContentSize = () => { cancelAnimationFrame(sizeFrame); sizeFrame = requestAnimationFrame(() => requestAnimationFrame(reportContentSize)); };

  const observer = new MutationObserver(() => { enforceAssetPolicy(root); queueContentSize(); });
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  new ResizeObserver(queueContentSize).observe(root);
  document.addEventListener("load", queueContentSize, true);
  document.fonts?.ready?.then(queueContentSize).catch(() => undefined);
  window.addEventListener("resize", queueContentSize);

  document.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button,input,select,textarea,a,[role=button],[contenteditable=true],[data-ns-interactive]")) {
      parent.postMessage({ type: "northstar.artifact.select", artifactId: ARTIFACT_ID }, "*"); return;
    }
    event.preventDefault();
    parent.postMessage({ type: "northstar.artifact.drag-start", artifactId: ARTIFACT_ID, clientX: event.clientX, clientY: event.clientY }, "*");
  }, true);
  document.addEventListener("wheel", (event) => {
    event.preventDefault();
    parent.postMessage({ type: "northstar.artifact.wheel", artifactId: ARTIFACT_ID, clientX: event.clientX, clientY: event.clientY, deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey, metaKey: event.metaKey }, "*");
  }, { passive: false, capture: true });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.artifactId !== ARTIFACT_ID) return;
    if (message.type === "northstar.artifact.set-stage") {
      activeStageIndex = Math.max(0, Math.min(STAGES.length - 1, Number(message.stageIndex) || 0)); applyStage(); queueContentSize(); return;
    }
    if (message.type === "northstar.artifact.update-context") {
      // Context may arrive before the associated mutation. Keep the current live revision
      // until that mutation is transactionally accepted by this browser surface.
      currentData = message.dataBundle || currentData;
      currentCreative = message.creativeDirection ?? currentCreative;
      currentReviews = message.creativeReviews || currentReviews;
      registerAssets(message.allowedAssetUrls || currentData?.allowedAssetUrls || []);
      registerAssets((currentData?.screenshots || []).map((screen) => screen.imageUrl).filter(Boolean));
      registerAssets((currentData?.apps || []).map((app) => app.iconUrl).filter(Boolean));
      enforceAssetPolicy(root);
      return;
    }
    if (message.type === "northstar.artifact.apply-mutation" && message.batch) {
      registerAssets(message.assetUrls || []);
      mutationQueue.push({ batch: message.batch, revisionId: message.revisionId }); processQueue();
    }
  });

  try {
    const runArtifact = new Function("Northstar", "data", "creative", "reviews", ${safeJson(documentSource.javascript)});
    runArtifact(Northstar, currentData, currentCreative, currentReviews);
  } catch (error) {
    parent.postMessage({ type: "northstar.artifact.runtime-error", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, message: error instanceof Error ? error.message : String(error) }, "*");
  }

  (async () => {
    enforceAssetPolicy(root); applyStage();
    for (const batch of INITIAL_JOURNAL) {
      try { await applyMutationBatch(batch, currentRevisionId, false); }
      catch (error) {
        parent.postMessage({
          type: "northstar.artifact.runtime-error",
          artifactId: ARTIFACT_ID,
          revisionId: currentRevisionId,
          mutationId: batch?.mutationId,
          message: error instanceof Error ? error.message : String(error),
        }, "*");
      }
    }
    queueContentSize();
    [40, 120, 260, 520, 900, 1500].forEach((delay) => setTimeout(queueContentSize, delay));
  })();
})();
`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" />
  <title>${escapeHtml(artifact.title)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    html,body{width:100%;min-height:100%;height:auto;margin:0;overflow:hidden}
    body{position:relative;background:#f7f7fd;color:#10121d;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input,textarea,select{font:inherit}img{display:block;max-width:100%}[hidden]{display:none!important}
    ${NORTHSTAR_DESIGN_KERNEL_CSS}
    #northstar-artifact-stage{position:relative;width:${minimumWidth}px;min-width:${minimumWidth}px;height:${minimumHeight}px;min-height:${minimumHeight}px;overflow:visible}
    #northstar-artifact-origin{position:absolute;left:0;top:0;width:max-content;height:max-content;transform-origin:top left;overflow:visible}
    #northstar-artifact-root{display:flow-root;width:max-content;min-width:${minimumWidth}px;min-height:${minimumHeight}px;height:auto;overflow:visible}
    ${documentSource.css}
    #northstar-artifact-root,#northstar-artifact-root>.ns-artifact{max-width:none!important;max-height:none!important;overflow:visible!important}
    [data-ns-node-id]{will-change:transform,opacity}
    [data-ns-mutating="true"]{pointer-events:none}
    [data-ns-flow-id],[data-ns-reference-flow],[data-ns-flow-sequence],[data-ns-flow-id] [data-ns-evidence-id]{overflow:visible!important}
  </style>
</head>
<body>
  <div id="northstar-artifact-stage"><div id="northstar-artifact-origin"><div id="northstar-artifact-root" aria-label=${safeJson(artifact.title)}>${documentSource.html}</div></div></div>
  <script>${escapeScript(bridgeScript)}</script>
</body>
</html>`;
}

export function buildCanvasArtifactRuntimeDocument(artifact: CanvasCodeArtifactPayload): string | undefined {
  if (artifact.document && artifact.dataBundle) return buildWebCanvasArtifactRuntimeDocument(artifact);
  return buildLegacyCanvasArtifactRuntimeDocument(artifact);
}

function buildLegacyCanvasArtifactRuntimeDocument(
  artifact: CanvasCodeArtifactPayload,
): string | undefined {
  if (!artifact.compiledJs || !artifact.dataBundle) return undefined;

  const activeStageIndex = Math.max(0, artifact.activeStageIndex ?? 0);
  const stages = artifact.stagePlan ?? [];
  const allowedAssetUrls = Array.from(
    new Set([
      ...(artifact.dataBundle.allowedAssetUrls ?? []),
      ...artifact.dataBundle.screenshots
        .map((screen) => screen.imageUrl)
        .filter((value): value is string => Boolean(value)),
      ...artifact.dataBundle.apps
        .map((app) => app.iconUrl)
        .filter((value): value is string => Boolean(value)),
    ]),
  );

  const runtimeScript = String.raw`
(() => {
  "use strict";

  const ARTIFACT_ID = ${safeJson(artifact.artifactId)};
  const REVISION_ID = ${safeJson(artifact.revisionId)};
  const DATA = ${safeJson(artifact.dataBundle)};
  const CREATIVE = ${safeJson(artifact.creativeDirection ?? null)};
  const REVIEWS = ${safeJson(artifact.creativeReviews ?? [])};
  const STAGES = ${safeJson(stages)};
  const ALLOWED_ASSETS = new Set(${safeJson(allowedAssetUrls)});
  let activeStageIndex = ${activeStageIndex};
  const MINIMUM_INTRINSIC_HEIGHT = ${Math.max(1, artifact.minimumHeight)};
  let componentFactory = null;
  let hookState = [];
  let hookDeps = [];
  let hookIndex = 0;
  let pendingEffects = [];
  let isRendering = false;

  const Fragment = Symbol("Northstar.Fragment");

  function flattenChildren(input, output = []) {
    for (const child of input) {
      if (Array.isArray(child)) flattenChildren(child, output);
      else if (child !== null && child !== undefined && child !== false && child !== true) output.push(child);
    }
    return output;
  }

  function createElement(type, props, ...children) {
    return {
      type,
      props: {
        ...(props || {}),
        children: flattenChildren(children),
      },
    };
  }

  function depsChanged(previous, next) {
    if (!previous || !next || previous.length !== next.length) return true;
    return previous.some((value, index) => !Object.is(value, next[index]));
  }

  function useState(initialValue) {
    const index = hookIndex++;
    if (!(index in hookState)) {
      hookState[index] = typeof initialValue === "function" ? initialValue() : initialValue;
    }
    const setValue = (nextValue) => {
      const current = hookState[index];
      hookState[index] = typeof nextValue === "function" ? nextValue(current) : nextValue;
      scheduleRender();
    };
    return [hookState[index], setValue];
  }

  function useMemo(factory, dependencies) {
    const index = hookIndex++;
    if (depsChanged(hookDeps[index], dependencies)) {
      hookState[index] = factory();
      hookDeps[index] = dependencies;
    }
    return hookState[index];
  }

  function useEffect(effect, dependencies) {
    const index = hookIndex++;
    if (depsChanged(hookDeps[index], dependencies)) {
      hookDeps[index] = dependencies;
      pendingEffects.push(() => {
        const previousCleanup = hookState[index];
        if (typeof previousCleanup === "function") previousCleanup();
        hookState[index] = effect();
      });
    }
  }

  function cx(...values) {
    return values.flat(Infinity).filter(Boolean).join(" ");
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    const min = Math.min(finiteNumber(minimum), finiteNumber(maximum));
    const max = Math.max(finiteNumber(minimum), finiteNumber(maximum));
    return Math.min(max, Math.max(min, finiteNumber(value)));
  }

  function extent(values, accessor) {
    const numbers = (Array.isArray(values) ? values : [])
      .map((value, index) => finiteNumber(typeof accessor === "function" ? accessor(value, index) : value, NaN))
      .filter(Number.isFinite);
    if (numbers.length === 0) return [0, 1];
    const minimum = Math.min(...numbers);
    const maximum = Math.max(...numbers);
    return minimum === maximum ? [minimum - 1, maximum + 1] : [minimum, maximum];
  }

  function linearScale(domain, range, shouldClamp = false) {
    const d0 = finiteNumber(domain?.[0], 0);
    const d1 = finiteNumber(domain?.[1], 1);
    const r0 = finiteNumber(range?.[0], 0);
    const r1 = finiteNumber(range?.[1], 1);
    const span = d1 - d0 || 1;
    return (value) => {
      let ratio = (finiteNumber(value) - d0) / span;
      if (shouldClamp) ratio = clamp(ratio, 0, 1);
      return r0 + ratio * (r1 - r0);
    };
  }

  function bandScale(domain, range, padding = 0.12) {
    const values = Array.from(new Set(Array.isArray(domain) ? domain.map(String) : []));
    const start = finiteNumber(range?.[0], 0);
    const end = finiteNumber(range?.[1], 1);
    const safePadding = clamp(padding, 0, 0.8);
    const count = Math.max(1, values.length);
    const step = (end - start) / count;
    const bandwidth = Math.abs(step) * (1 - safePadding);
    const offset = (Math.abs(step) - bandwidth) / 2;
    return {
      domain: values,
      step: Math.abs(step),
      bandwidth,
      position(value) {
        const index = Math.max(0, values.indexOf(String(value)));
        return start + index * step + Math.sign(step || 1) * offset;
      },
    };
  }

  function niceTicks(minimum, maximum, count = 5) {
    const min = finiteNumber(minimum, 0);
    const max = finiteNumber(maximum, 1);
    const desired = Math.max(2, Math.min(12, Math.round(finiteNumber(count, 5))));
    const span = Math.abs(max - min) || 1;
    const rough = span / (desired - 1);
    const power = 10 ** Math.floor(Math.log10(rough));
    const normalized = rough / power;
    const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const step = factor * power;
    const first = Math.ceil(Math.min(min, max) / step) * step;
    const last = Math.floor(Math.max(min, max) / step) * step;
    const ticks = [];
    for (let value = first; value <= last + step * 0.001 && ticks.length < 24; value += step) {
      ticks.push(Number(value.toFixed(12)));
    }
    return ticks.length > 0 ? ticks : [min, max];
  }

  function pointPair(value) {
    if (Array.isArray(value)) return { x: finiteNumber(value[0]), y: finiteNumber(value[1]) };
    return { x: finiteNumber(value?.x), y: finiteNumber(value?.y) };
  }

  function linePath(points) {
    return (Array.isArray(points) ? points : [])
      .map((value, index) => {
        const point = pointPair(value);
        return (index === 0 ? "M" : "L") + point.x.toFixed(2) + "," + point.y.toFixed(2);
      })
      .join(" ");
  }

  function areaPath(points, baseline = 0) {
    const normalized = (Array.isArray(points) ? points : []).map(pointPair);
    if (normalized.length === 0) return "";
    const base = finiteNumber(baseline, 0);
    const top = linePath(normalized);
    const last = normalized[normalized.length - 1];
    const first = normalized[0];
    return top + " L" + last.x.toFixed(2) + "," + base.toFixed(2) + " L" + first.x.toFixed(2) + "," + base.toFixed(2) + " Z";
  }

  function polarPoint(cx, cy, radius, angleRadians) {
    const angle = finiteNumber(angleRadians);
    const r = Math.max(0, finiteNumber(radius));
    return {
      x: finiteNumber(cx) + Math.cos(angle) * r,
      y: finiteNumber(cy) + Math.sin(angle) * r,
    };
  }

  function arcPath(options = {}) {
    const cx = finiteNumber(options.cx);
    const cy = finiteNumber(options.cy);
    const innerRadius = Math.max(0, finiteNumber(options.innerRadius));
    const outerRadius = Math.max(innerRadius, finiteNumber(options.outerRadius, 1));
    const startAngle = finiteNumber(options.startAngle);
    const endAngle = finiteNumber(options.endAngle, Math.PI * 2);
    const delta = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, endAngle - startAngle));
    const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
    const sweep = delta >= 0 ? 1 : 0;
    const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
    const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
    if (innerRadius <= 0) {
      return "M" + cx.toFixed(2) + "," + cy.toFixed(2) + " L" + outerStart.x.toFixed(2) + "," + outerStart.y.toFixed(2) + " A" + outerRadius.toFixed(2) + "," + outerRadius.toFixed(2) + " 0 " + largeArc + " " + sweep + " " + outerEnd.x.toFixed(2) + "," + outerEnd.y.toFixed(2) + " Z";
    }
    const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
    const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
    return "M" + outerStart.x.toFixed(2) + "," + outerStart.y.toFixed(2) + " A" + outerRadius.toFixed(2) + "," + outerRadius.toFixed(2) + " 0 " + largeArc + " " + sweep + " " + outerEnd.x.toFixed(2) + "," + outerEnd.y.toFixed(2) + " L" + innerEnd.x.toFixed(2) + "," + innerEnd.y.toFixed(2) + " A" + innerRadius.toFixed(2) + "," + innerRadius.toFixed(2) + " 0 " + largeArc + " " + (sweep ? 0 : 1) + " " + innerStart.x.toFixed(2) + "," + innerStart.y.toFixed(2) + " Z";
  }

  function formatNumber(value, maximumFractionDigits = 1) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: Math.max(0, Math.min(6, Math.round(finiteNumber(maximumFractionDigits, 1)))),
    }).format(finiteNumber(value));
  }

  const viz = Object.freeze({
    clamp,
    extent,
    linearScale,
    bandScale,
    niceTicks,
    linePath,
    areaPath,
    polarPoint,
    arcPath,
    formatNumber,
  });

  const Northstar = {
    createElement,
    Fragment,
    useState,
    useMemo,
    useEffect,
    cx,
    viz,
  };

  function setStyle(element, value) {
    if (!value || typeof value !== "object") return;
    for (const [property, propertyValue] of Object.entries(value)) {
      if (propertyValue === null || propertyValue === undefined) continue;
      try {
        element.style[property] = typeof propertyValue === "number" && ![
          "opacity", "zIndex", "fontWeight", "lineHeight", "flex", "flexGrow", "flexShrink", "order",
        ].includes(property)
          ? propertyValue + "px"
          : String(propertyValue);
      } catch (_) {
        // Invalid style properties are ignored inside the isolated runtime.
      }
    }
  }

  function safeAsset(value) {
    if (typeof value !== "string") return "";
    if (value.startsWith("data:image/") || value.startsWith("blob:")) return value;
    return ALLOWED_ASSETS.has(value) ? value : "";
  }

  function setProperty(element, key, value) {
    if (key === "children" || key === "key" || key === "ref") return;
    if (key === "className") {
      element.setAttribute("class", String(value || ""));
      return;
    }
    if (key === "style") {
      setStyle(element, value);
      return;
    }
    if (key === "dangerouslySetInnerHTML" || key === "srcDoc") return;
    if (/^on[A-Z]/.test(key) && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value);
      return;
    }
    if (key === "src" && element.tagName === "IMG") {
      const asset = safeAsset(value);
      if (asset) element.setAttribute("src", asset);
      return;
    }
    if (key === "href") {
      if (typeof value === "string" && (value.startsWith("#") || value === "")) {
        element.setAttribute("href", value || "#");
      }
      return;
    }
    if (key === "htmlFor") {
      element.setAttribute("for", String(value));
      return;
    }
    if (key === "value" || key === "checked" || key === "selected" || key === "disabled") {
      try { element[key] = value; } catch (_) {}
      if (typeof value === "boolean") {
        if (value) element.setAttribute(key, "");
      } else if (value !== null && value !== undefined) {
        element.setAttribute(key, String(value));
      }
      return;
    }
    if (value === false || value === null || value === undefined) return;
    if (value === true) {
      element.setAttribute(key, "");
      return;
    }
    const attribute = key === "strokeWidth" ? "stroke-width" : key === "viewBox" ? "viewBox" : key;
    element.setAttribute(attribute, String(value));
  }

  function renderVNode(vnode, namespace) {
    if (vnode === null || vnode === undefined || vnode === false || vnode === true) {
      return document.createTextNode("");
    }
    if (typeof vnode === "string" || typeof vnode === "number") {
      return document.createTextNode(String(vnode));
    }
    if (Array.isArray(vnode)) {
      const fragment = document.createDocumentFragment();
      vnode.forEach((child) => fragment.appendChild(renderVNode(child, namespace)));
      return fragment;
    }
    if (typeof vnode.type === "function") {
      return renderVNode(vnode.type(vnode.props || {}), namespace);
    }
    if (vnode.type === Fragment) {
      return renderVNode(vnode.props?.children || [], namespace);
    }

    const tag = String(vnode.type || "div");
    const nextNamespace = tag === "svg" || namespace === "svg" ? "svg" : undefined;
    const element = nextNamespace
      ? document.createElementNS("http://www.w3.org/2000/svg", tag)
      : document.createElement(tag);
    const props = vnode.props || {};
    Object.entries(props).forEach(([key, value]) => setProperty(element, key, value));
    flattenChildren(props.children || []).forEach((child) => {
      element.appendChild(renderVNode(child, nextNamespace));
    });
    return element;
  }

  function applyStageVisibility() {
    document.documentElement.dataset.northstarStage = String(activeStageIndex);
    document.querySelectorAll("[data-ns-stage]").forEach((element) => {
      const phase = element.getAttribute("data-ns-stage");
      const index = STAGES.findIndex((stage) => stage.phase === phase || stage.id === phase);
      const shouldShow = index < 0 || index <= activeStageIndex;
      element.toggleAttribute("hidden", !shouldShow);
      element.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    });
  }


  function getContentBounds() {
    const root = document.getElementById("northstar-artifact-root");
    if (!root) return { width: Math.max(1, innerWidth), height: Math.max(MINIMUM_INTRINSIC_HEIGHT, innerHeight) };
    const rootRect = root.getBoundingClientRect();
    let right = Math.max(root.clientWidth, root.scrollWidth, rootRect.width);
    let bottom = Math.max(root.clientHeight, root.scrollHeight, rootRect.height);
    root.querySelectorAll("*").forEach((element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;
      const rect = element.getBoundingClientRect();
      right = Math.max(right, rect.right - rootRect.left, element.scrollWidth || 0);
      bottom = Math.max(bottom, rect.bottom - rootRect.top, element.scrollHeight || 0);
    });
    return {
      width: Math.max(1, Math.ceil(right)),
      height: Math.max(MINIMUM_INTRINSIC_HEIGHT, Math.ceil(bottom)),
    };
  }

  let contentSizeFrame = 0;
  let lastMeasuredSignature = "";
  let lastReportedSignature = "";
  let lastReportedSettled = false;
  let stableMeasurementCount = 0;
  let contentMeasurementSequence = 0;
  let readyPosted = false;
  function reportContentSize() {
    const bounds = getContentBounds();
    const signature = Math.ceil(bounds.width) + ":" + Math.ceil(bounds.height);
    contentMeasurementSequence += 1;
    stableMeasurementCount = signature === lastMeasuredSignature ? stableMeasurementCount + 1 : 1;
    lastMeasuredSignature = signature;
    const imagesSettled = Array.from(document.images).every((image) => image.complete);
    const fontsSettled = !document.fonts || document.fonts.status === "loaded";
    const settled = document.readyState === "complete" && imagesSettled && fontsSettled && stableMeasurementCount >= 2;
    const shouldReport = signature !== lastReportedSignature || settled !== lastReportedSettled || contentMeasurementSequence <= 2;
    if (shouldReport) {
      lastReportedSignature = signature;
      lastReportedSettled = settled;
      parent.postMessage({
        type: "northstar.artifact.content-size",
        artifactId: ARTIFACT_ID,
        revisionId: REVISION_ID,
        size: {
          artifactId: ARTIFACT_ID,
          revisionId: REVISION_ID,
          measuredAt: new Date().toISOString(),
          intrinsicWidth: bounds.width,
          intrinsicHeight: bounds.height,
          contentBounds: { minX: 0, minY: 0, maxX: bounds.width, maxY: bounds.height },
          sequence: contentMeasurementSequence,
          settled,
        },
      }, "*");
    }
    if (settled && !readyPosted) {
      readyPosted = true;
      reportRuntimeReview();
      requestAnimationFrame(() => {
        parent.postMessage({
          type: "northstar.artifact.ready",
          artifactId: ARTIFACT_ID,
          revisionId: REVISION_ID,
        }, "*");
      });
    }
  }
  function queueContentSize() {
    cancelAnimationFrame(contentSizeFrame);
    contentSizeFrame = requestAnimationFrame(() => requestAnimationFrame(reportContentSize));
  }

  let reviewFrame = 0;
  function queueRuntimeReview() {
    cancelAnimationFrame(reviewFrame);
    reviewFrame = requestAnimationFrame(() => {
      requestAnimationFrame(reportRuntimeReview);
    });
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0.5 && rect.height > 0.5;
  }

  function reportRuntimeReview() {
    const root = document.getElementById("northstar-artifact-root");
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const elements = Array.from(root.querySelectorAll("*"));
    const visible = elements.filter(isVisibleElement);
    let overflowElementCount = 0;
    let clippedTextCount = 0;
    let smallTextCount = 0;
    let tinyInteractiveCount = 0;
    let missingImageCount = 0;

    for (const element of visible) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      const clipsX = overflowX === "hidden" || overflowX === "clip";
      const clipsY = overflowY === "hidden" || overflowY === "clip";
      const hasOverflow = element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
      if (hasOverflow) overflowElementCount += 1;
      if ((clipsX || clipsY) && hasOverflow && (element.textContent || "").trim().length > 0) {
        clippedTextCount += 1;
      }
      const text = (element.textContent || "").trim();
      if (text && element.children.length === 0) {
        const fontSize = Number.parseFloat(style.fontSize || "0");
        if (fontSize > 0 && fontSize < 10) smallTextCount += 1;
      }
      if (element.matches('button, a, input, textarea, select, summary, [role="button"], [role="slider"], [role="tab"], [data-ns-interactive="true"]')) {
        if (rect.width < 24 || rect.height < 24) tinyInteractiveCount += 1;
      }
      if (element instanceof HTMLImageElement && element.complete && element.naturalWidth === 0) {
        missingImageCount += 1;
      }
    }

    const stageRegions = Array.from(root.querySelectorAll("[data-ns-stage]"));
    const visibleStageRegions = stageRegions.filter(isVisibleElement);
    const internalScrollElementCount = visible.filter((element) => {
      const style = getComputedStyle(element);
      const hasOverflowX = element.scrollWidth > element.clientWidth + 2;
      const hasOverflowY = element.scrollHeight > element.clientHeight + 2;
      return ((style.overflowY === "auto" || style.overflowY === "scroll") && hasOverflowY) ||
        ((style.overflowX === "auto" || style.overflowX === "scroll") && hasOverflowX);
    }).length;
    const contentBounds = getContentBounds();
    const documentScrollRisk = internalScrollElementCount > 0;
    const issueCount = overflowElementCount + clippedTextCount + smallTextCount + tinyInteractiveCount + missingImageCount + (documentScrollRisk ? 1 : 0);

    parent.postMessage({
      type: "northstar.artifact.runtime-review",
      artifactId: ARTIFACT_ID,
      review: {
        revisionId: REVISION_ID,
        stageIndex: activeStageIndex,
        evaluatedAt: new Date().toISOString(),
        rootWidth: contentBounds.width,
        rootHeight: contentBounds.height,
        elementCount: visible.length,
        stageRegionCount: stageRegions.length,
        visibleStageRegionCount: visibleStageRegions.length,
        overflowElementCount,
        clippedTextCount,
        smallTextCount,
        tinyInteractiveCount,
        missingImageCount,
        documentScrollRisk,
        summary: issueCount === 0
          ? "Runtime layout audit passed with no detected overflow, clipped text, tiny controls, or missing images."
          : "Runtime layout audit detected " + issueCount + " potential visual issue" + (issueCount === 1 ? "" : "s") + ".",
      },
    }, "*");
  }

  function performRender() {
    if (!componentFactory || isRendering) return;
    isRendering = true;
    hookIndex = 0;
    pendingEffects = [];
    const root = document.getElementById("northstar-artifact-root");
    if (!root) return;
    try {
      const stage = STAGES[Math.max(0, Math.min(STAGES.length - 1, activeStageIndex))] || null;
      const vnode = componentFactory({
        data: DATA,
        creative: CREATIVE,
        reviews: REVIEWS,
        stage,
        activeStageIndex,
        stages: STAGES,
      });
      root.replaceChildren(renderVNode(vnode));
      applyStageVisibility();
      queueRuntimeReview();
      queueContentSize();
      pendingEffects.splice(0).forEach((effect) => {
        try { effect(); } catch (error) { console.error(error); }
      });
    } catch (error) {
      console.error(error);
      root.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "northstar-runtime-error";
      panel.textContent = "Northstar could not render this artifact revision.";
      root.appendChild(panel);
      parent.postMessage({
        type: "northstar.artifact.runtime-error",
        artifactId: ARTIFACT_ID,
        message: error instanceof Error ? error.message : String(error),
      }, "*");
    } finally {
      isRendering = false;
    }
  }

  let renderFrame = 0;
  function scheduleRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(performRender);
  }

  try {
    const module = { exports: {} };
    const exports = module.exports;
    const factory = new Function(
      "module",
      "exports",
      "Northstar",
      ${safeJson(`${artifact.compiledJs}\n; return module.exports.default || exports.default;`)},
    );
    componentFactory = factory(module, exports, Northstar);
    if (typeof componentFactory !== "function") {
      throw new Error("The generated TSX module did not export a component.");
    }
    performRender();
  } catch (error) {
    console.error(error);
    const root = document.getElementById("northstar-artifact-root");
    if (root) {
      root.innerHTML = '<div class="northstar-runtime-error">Northstar could not mount this artifact revision.</div>';
    }
  }

  function isInteractiveTarget(target) {
    return Boolean(target && target.closest && target.closest(
      'button, a, input, textarea, select, option, summary, [role="button"], [role="slider"], [role="tab"], [contenteditable="true"], [data-ns-interactive="true"]'
    ));
  }

  document.addEventListener("pointerdown", (event) => {
    parent.postMessage({
      type: "northstar.artifact.select",
      artifactId: ARTIFACT_ID,
    }, "*");
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    event.preventDefault();
    parent.postMessage({
      type: "northstar.artifact.drag-start",
      artifactId: ARTIFACT_ID,
      clientX: event.clientX,
      clientY: event.clientY,
    }, "*");
  }, true);

  document.addEventListener("wheel", (event) => {
    event.preventDefault();
    parent.postMessage({
      type: "northstar.artifact.wheel",
      artifactId: ARTIFACT_ID,
      clientX: event.clientX,
      clientY: event.clientY,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    }, "*");
  }, { passive: false, capture: true });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "northstar.artifact.set-stage") return;
    if (message.artifactId !== ARTIFACT_ID) return;
    activeStageIndex = Math.max(0, Math.min(STAGES.length - 1, Number(message.stageIndex) || 0));
    scheduleRender();
    queueContentSize();
  });

  const legacyRoot = document.getElementById("northstar-artifact-root");
  if (legacyRoot) {
    new ResizeObserver(queueContentSize).observe(legacyRoot);
    new MutationObserver(queueContentSize).observe(legacyRoot, { childList: true, subtree: true, attributes: true, characterData: true });
  }
  window.addEventListener("resize", queueContentSize);
  document.addEventListener("load", queueContentSize, true);
  document.fonts?.ready?.then(queueContentSize).catch(() => undefined);
  Array.from(document.images).forEach((image) => {
    image.addEventListener("load", queueContentSize, { once: true });
    image.addEventListener("error", queueContentSize, { once: true });
  });
  [0, 32, 80, 160, 320, 640, 1000, 1600, 2400].forEach((delay) => setTimeout(queueContentSize, delay));
  queueContentSize();
})();
`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" />
  <title>${escapeHtml(artifact.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; height: auto; margin: 0; overflow: hidden; }
    body { background: #f7f7fd; color: #10121d; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button, input, textarea, select { font: inherit; }
    img { display: block; max-width: 100%; }
    [hidden] { display: none !important; }
    #northstar-artifact-root { display: flow-root; width: 100%; min-height: 100%; height: auto; overflow: visible; }
    .northstar-runtime-error { display: grid; width: 100%; height: 100%; place-items: center; padding: 48px; color: #b42318; background: #fff6f5; font-size: 18px; font-weight: 750; text-align: center; }
  </style>
</head>
<body>
  <div id="northstar-artifact-root" aria-label=${safeJson(artifact.title)}></div>
  <script>${escapeScript(runtimeScript)}</script>
</body>
</html>`;
}
