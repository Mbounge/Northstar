// Northstar Canvas Artifact Runtime v0.7.9 â€” idempotent terminal replay on one continuously mounted surface.
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
  const mutationJournal = artifact.mutationJournal ?? [];
  // A package carrying pendingAckToken is a proposal, not committed browser
  // state. Replaying its newest batch during iframe construction bypasses the
  // receipt/apply/terminal-ack transaction entirely. Mount the committed prefix
  // and let the host dispatch the final batch with its exact proposal identity.
  const initialJournal = artifact.pendingAckToken
    ? mutationJournal.slice(0, -1)
    : mutationJournal;
  const initialRevisionId = artifact.pendingAckToken
    ? artifact.parentRevisionId ?? artifact.revisionId
    : artifact.revisionId;
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
  let currentRevisionId = ${safeJson(initialRevisionId)};
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
  const queuedMutationIds = new Set();
  const terminalMutationMessages = new Map();
  const mutationQueue = [];
  let applyingMutation = false;
  let pendingAcknowledgement = null;
  let requestedBounds = { minX: 0, minY: 0, maxX: MINIMUM_WIDTH, maxY: MINIMUM_HEIGHT };
  let spatialBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let spatialLayoutVersion = 0;
  let lastSpatialAudit = null;
  let solvingSpatialLayout = false;

  const postTerminalMutation = (mutationId, message) => {
    if (mutationId) {
      terminalMutationMessages.set(mutationId, message);
      if (terminalMutationMessages.size > 80) {
        terminalMutationMessages.delete(terminalMutationMessages.keys().next().value);
      }
    }
    parent.postMessage(message, "*");
  };

  const stageSurface = document.getElementById("northstar-artifact-stage");
  const origin = document.getElementById("northstar-artifact-origin");
  const root = document.getElementById("northstar-artifact-root");
  if (!stageSurface || !origin || !root) return;

  // Runtime-owned overlays are derived browser state. A historical snapshot may
  // contain them, but a mount must always begin from one clean authored tree.
  root.querySelectorAll('[data-ns-runtime-owned="true"],[data-ns-spatial-system]').forEach((element) => element.remove());
  document.querySelectorAll('style[data-ns-runtime-owned="true"],style[data-ns-runtime-spatial-style]').forEach((element) => element.remove());

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


  // Isolated spatial service. It reads stable content geometry and reports only
  // actual resolved overlay extents back to getContentBounds().
  root.style.position = root.style.position || "relative";

  document.documentElement.style.margin = "0";
  document.documentElement.style.padding = "0";
  document.documentElement.style.width = "max-content";
  document.documentElement.style.height = "max-content";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.display = "block";
  document.body.style.width = "max-content";
  document.body.style.height = "max-content";
  document.body.style.minWidth = "0";
  document.body.style.minHeight = "0";
  root.style.margin = "0";

  const spatialStyle = document.createElement("style");
  spatialStyle.setAttribute("data-ns-runtime-spatial-style", "true");
  spatialStyle.setAttribute("data-ns-runtime-owned", "true");
  spatialStyle.textContent = [
    "[data-ns-spatial-system]{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:40}",
    "[data-ns-relationship-layer]{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}",
    "[data-ns-annotation-layer]{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}",
    "[data-ns-annotation-id]:not([data-ns-spatial-copy]){display:none!important}",
    "[data-ns-spatial-copy]{position:absolute!important;display:block!important;box-sizing:border-box;pointer-events:none;z-index:2}",
    "[data-ns-spatial-copy][data-ns-flow-caption=true]{text-align:center;line-height:1.2}",
    "[data-ns-relationship-id]{display:none!important}",
    ".ns-spatial-path{fill:none;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}",
    ".ns-spatial-route-label{font:700 12px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}",
  ].join("\\n");
  document.head.appendChild(spatialStyle);

  const spatialSystem = document.createElement("div");
  spatialSystem.setAttribute("data-ns-spatial-system", "true");
  spatialSystem.setAttribute("data-ns-runtime-owned", "true");
  const relationshipLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  relationshipLayer.setAttribute("data-ns-relationship-layer", "true");
  relationshipLayer.setAttribute("aria-hidden", "true");
  const annotationLayer = document.createElement("div");
  annotationLayer.setAttribute("data-ns-annotation-layer", "true");
  spatialSystem.append(relationshipLayer, annotationLayer);
  root.appendChild(spatialSystem);

  const emptySpatialAudit = (runtimeError) => ({
    snapshotRevisionId: currentRevisionId,
    layoutVersion: spatialLayoutVersion,
    unresolvedAnchorIds: [],
    overlappingAnnotationPairs: [],
    annotationTargetOverlapIds: [],
    clippedAnnotationIds: [],
    excessiveDistanceIds: [],
    unresolvedRelationshipIds: [],
    obstacleIntersectionIds: [],
    falseIntersectionIds: [],
    crossingCount: 0,
    hardFailureCount: 0,
    softIssueCount: runtimeError ? 1 : 0,
    runtimeError: runtimeError || undefined,
  });

  const localRect = (rect, rootRect) => ({
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right - rootRect.left,
    bottom: rect.bottom - rootRect.top,
  });
  const overlaps = (a, b, padding) =>
    a.x < b.right + padding && a.right > b.x - padding &&
    a.y < b.bottom + padding && a.bottom > b.y - padding;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ports = (rect) => ({
    top: { x: rect.x + rect.width / 2, y: rect.y },
    right: { x: rect.right, y: rect.y + rect.height / 2 },
    bottom: { x: rect.x + rect.width / 2, y: rect.bottom },
    left: { x: rect.x, y: rect.y + rect.height / 2 },
    center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
  });
  const semanticScene = () => {
    const rootRect = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll("[data-ns-node-id]"))
      .filter((element) => !element.closest("[data-ns-spatial-system]"))
      .map((element) => {
        const rect = localRect(element.getBoundingClientRect(), rootRect);
        const nodeId = element.getAttribute("data-ns-node-id") || "";
        return {
          nodeId,
          rect,
          center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
          ports: ports(rect),
          tagName: element.tagName.toLowerCase(),
          evidenceId: element.getAttribute("data-ns-evidence-id") || undefined,
          isScreenshot:
            element.tagName === "FIGURE"
            || Boolean(element.getAttribute("data-ns-evidence-id"))
            || Boolean(element.querySelector(":scope > img")),
          flowId: element.closest("[data-ns-flow-id]")?.getAttribute("data-ns-flow-id") || undefined,
          flowSequenceId: element.closest("[data-ns-flow-sequence],[data-ns-node-id$='-sequence']")?.getAttribute("data-ns-node-id") || undefined,
        };
      })
      .filter((node) => node.nodeId && node.rect.width > 0 && node.rect.height > 0);
  };
  const candidateRect = (anchorRect, width, height, side, alignment, gap) => {
    let x = anchorRect.x + (anchorRect.width - width) / 2;
    let y = anchorRect.bottom + gap;
    if (side === "top") y = anchorRect.y - height - gap;
    if (side === "left") {
      x = anchorRect.x - width - gap;
      y = anchorRect.y + (anchorRect.height - height) / 2;
    }
    if (side === "right") {
      x = anchorRect.right + gap;
      y = anchorRect.y + (anchorRect.height - height) / 2;
    }
    if (side === "top" || side === "bottom") {
      if (alignment === "start") x = anchorRect.x;
      if (alignment === "end") x = anchorRect.right - width;
    } else {
      if (alignment === "start") y = anchorRect.y;
      if (alignment === "end") y = anchorRect.bottom - height;
    }
    return { x, y, width, height, right: x + width, bottom: y + height };
  };
  const choosePorts = (source, target) => {
    const dx = target.center.x - source.center.x;
    const dy = target.center.y - source.center.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0
        ? [source.ports.right, target.ports.left]
        : [source.ports.left, target.ports.right];
    }
    return dy >= 0
      ? [source.ports.bottom, target.ports.top]
      : [source.ports.top, target.ports.bottom];
  };
  const makeRelationshipPath = (source, target, route) => {
    const selected = choosePorts(source, target);
    const start = selected[0], end = selected[1];
    if (route === "straight") {
      return { d: "M" + start.x + "," + start.y + " L" + end.x + "," + end.y, points: [start, end] };
    }
    if (route === "elbow" || route === "shared-spine" || route === "bracket") {
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
      const first = horizontal
        ? { x: (start.x + end.x) / 2, y: start.y }
        : { x: start.x, y: (start.y + end.y) / 2 };
      const second = horizontal
        ? { x: (start.x + end.x) / 2, y: end.y }
        : { x: end.x, y: (start.y + end.y) / 2 };
      return {
        d: "M" + start.x + "," + start.y + " L" + first.x + "," + first.y + " L" + second.x + "," + second.y + " L" + end.x + "," + end.y,
        points: [start, first, second, end],
      };
    }
    const curve = Math.max(48, Math.min(260, distance(start, end) * 0.28));
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    const c1 = horizontal
      ? { x: start.x + Math.sign(end.x - start.x || 1) * curve, y: start.y }
      : { x: start.x, y: start.y + Math.sign(end.y - start.y || 1) * curve };
    const c2 = horizontal
      ? { x: end.x - Math.sign(end.x - start.x || 1) * curve, y: end.y }
      : { x: end.x, y: end.y - Math.sign(end.y - start.y || 1) * curve };
    return {
      d: "M" + start.x + "," + start.y + " C" + c1.x + "," + c1.y + " " + c2.x + "," + c2.y + " " + end.x + "," + end.y,
      points: [start, c1, c2, end],
    };
  };

  const solveSpatialSystem = () => {
    if (solvingSpatialLayout) return lastSpatialAudit || emptySpatialAudit();
    solvingSpatialLayout = true;
    spatialLayoutVersion += 1;
    try {
      spatialBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      const scene = semanticScene();
      const byId = new Map(scene.map((node) => [node.nodeId, node]));
      const unresolvedAnchorIds = [];
      const overlappingAnnotationPairs = [];
      const annotationTargetOverlapIds = [];
      const clippedAnnotationIds = [];
      const excessiveDistanceIds = [];
      const unresolvedRelationshipIds = [];
      const obstacleIntersectionIds = [];
      const falseIntersectionIds = [];
      const placed = [];
      let crossingCount = 0;

      const annotations = Array.from(root.querySelectorAll("[data-ns-annotation-id]"))
        .filter((element) => !element.hasAttribute("data-ns-spatial-copy"));

      const flowCaptionCounts = new Map();
      for (const metadata of annotations) {
        const anchor = byId.get(metadata.getAttribute("data-ns-anchor-node-id") || "");
        if (!anchor?.isScreenshot || !anchor.flowId) continue;
        flowCaptionCounts.set(anchor.flowId, (flowCaptionCounts.get(anchor.flowId) || 0) + 1);
      }
      root.querySelectorAll("[data-ns-flow-id]").forEach((flow) => {
        const flowId = flow.getAttribute("data-ns-flow-id") || "";
        const count = flowCaptionCounts.get(flowId) || 0;
        const requiredPadding = count > 0 ? Math.min(132, 54 + Math.ceil(count / 5) * 26) : 0;
        const currentPadding = Number(flow.getAttribute("data-ns-spatial-caption-padding") || 0);
        if (currentPadding !== requiredPadding) {
          flow.setAttribute("data-ns-spatial-caption-padding", String(requiredPadding));
          flow.style.paddingBottom = requiredPadding ? requiredPadding + "px" : "";
        }
      });
      const activeAnnotationIds = new Set();
      for (const metadata of annotations) {
        const annotationId = metadata.getAttribute("data-ns-annotation-id") || metadata.getAttribute("data-ns-node-id") || "annotation";
        activeAnnotationIds.add(annotationId);
        const anchorId = metadata.getAttribute("data-ns-anchor-node-id") || "";
        const anchorNode = byId.get(anchorId);
        let annotation = annotationLayer.querySelector('[data-ns-spatial-copy][data-ns-annotation-id="' + CSS.escape(annotationId) + '"]');
        if (!anchorNode) {
          unresolvedAnchorIds.push(annotationId);
          annotation?.remove();
          continue;
        }
        if (!annotation) {
          annotation = metadata.cloneNode(true);
          annotation.setAttribute("data-ns-spatial-copy", "true");
          annotation.querySelectorAll("[data-ns-node-id]").forEach((node) => node.removeAttribute("data-ns-node-id"));
          annotation.removeAttribute("data-ns-node-id");
          annotationLayer.appendChild(annotation);
        } else if (annotation.innerHTML !== metadata.innerHTML) {
          annotation.innerHTML = metadata.innerHTML;
          annotation.querySelectorAll("[data-ns-node-id]").forEach((node) => node.removeAttribute("data-ns-node-id"));
        }
        for (const attribute of Array.from(metadata.attributes)) {
          if (attribute.name === "style" || attribute.name === "data-ns-node-id") continue;
          annotation.setAttribute(attribute.name, attribute.value);
        }
        annotation.setAttribute("data-ns-spatial-copy", "true");
        annotation.style.left = "0px";
        annotation.style.top = "0px";
        annotation.style.width = "max-content";
        annotation.style.height = "auto";
        const maxWidth = Math.max(80, Number(metadata.getAttribute("data-ns-max-width")) || 220);
        annotation.style.maxWidth = maxWidth + "px";
        const measured = annotation.getBoundingClientRect();
        const width = Math.min(maxWidth, Math.max(72, measured.width));
        annotation.style.width = width + "px";
        const height = Math.max(18, annotation.getBoundingClientRect().height);
        const rawPreferred = (metadata.getAttribute("data-ns-preferred-side") || "auto")
          .split(/[\s,|]+/)
          .filter(Boolean);
        const screenshotAnchor = Boolean(anchorNode.isScreenshot);
        const sides = screenshotAnchor
          ? ["bottom"]
          : rawPreferred.includes("auto") || !rawPreferred.length
            ? ["bottom", "top", "right", "left"]
            : rawPreferred.concat(["bottom", "top", "right", "left"].filter((side) => !rawPreferred.includes(side)));
        const alignment = screenshotAnchor ? "center" : (metadata.getAttribute("data-ns-alignment") || "center");
        const gap = Math.max(screenshotAnchor ? 18 : 6, Number(metadata.getAttribute("data-ns-gap")) || 14);
        let best = null;

        const flowScreens = screenshotAnchor && anchorNode.flowId
          ? scene.filter((node) => node.isScreenshot && node.flowId === anchorNode.flowId)
          : [];
        const captionLaneY = flowScreens.length
          ? Math.max(...flowScreens.map((node) => node.rect.bottom)) + gap
          : anchorNode.rect.bottom + gap;

        for (const side of sides) {
          for (const extra of screenshotAnchor ? [0, 28, 56] : [0, 10, 24, 44, 72, 110]) {
            const candidate = screenshotAnchor
              ? {
                  x: anchorNode.center.x - width / 2,
                  y: captionLaneY + extra,
                  width,
                  height,
                  right: anchorNode.center.x + width / 2,
                  bottom: captionLaneY + extra + height,
                }
              : candidateRect(anchorNode.rect, width, height, side, alignment, gap + extra);
            const protectedEvidenceCollisions = scene.filter(
              (node) => node.isScreenshot && overlaps(candidate, node.rect, 10),
            ).length;
            const nodeCollisions = scene.filter(
              (node) => node.nodeId !== anchorId && !node.isScreenshot && overlaps(candidate, node.rect, 4),
            ).length;
            const labelCollisions = placed.filter((item) => overlaps(candidate, item.rect, 10)).length;
            const targetCollision = overlaps(candidate, anchorNode.rect, 6) ? 1 : 0;
            const center = { x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 };
            const anchorDistance = distance(center, anchorNode.center);
            const cost =
              protectedEvidenceCollisions * 100000 +
              targetCollision * 100000 +
              labelCollisions * 20000 +
              nodeCollisions * 10000 +
              anchorDistance;
            if (!best || cost < best.cost) {
              best = { rect: candidate, cost, anchorDistance, protectedEvidenceCollisions };
            }
          }
        }
        if (!best) {
          unresolvedAnchorIds.push(annotationId);
          annotation.remove();
          continue;
        }
        annotation.style.left = best.rect.x + "px";
        annotation.style.top = best.rect.y + "px";
        annotation.style.width = best.rect.width + "px";
        annotation.setAttribute("data-ns-resolved-anchor-id", anchorId);
        annotation.setAttribute("data-ns-spatial-status", best.cost >= 10000 ? "adjusted" : "resolved");
        if (screenshotAnchor) annotation.setAttribute("data-ns-flow-caption", "true");
        else annotation.removeAttribute("data-ns-flow-caption");
        if (overlaps(best.rect, anchorNode.rect, 1) || best.protectedEvidenceCollisions > 0) {
          annotationTargetOverlapIds.push(annotationId);
        }
        if (best.anchorDistance > Math.max(360, Number(metadata.getAttribute("data-ns-maximum-distance")) || 520)) excessiveDistanceIds.push(annotationId);
        for (const item of placed) {
          if (overlaps(best.rect, item.rect, 4)) overlappingAnnotationPairs.push([item.id, annotationId]);
        }
        placed.push({ id: annotationId, rect: best.rect });
        spatialBounds.minX = Math.min(spatialBounds.minX, Math.floor(best.rect.x - 24));
        spatialBounds.minY = Math.min(spatialBounds.minY, Math.floor(best.rect.y - 24));
        spatialBounds.maxX = Math.max(spatialBounds.maxX, Math.ceil(best.rect.right + 24));
        spatialBounds.maxY = Math.max(spatialBounds.maxY, Math.ceil(best.rect.bottom + 24));
      }
      annotationLayer.querySelectorAll("[data-ns-spatial-copy][data-ns-annotation-id]").forEach((copy) => {
        const id = copy.getAttribute("data-ns-annotation-id") || "";
        if (!activeAnnotationIds.has(id)) copy.remove();
      });

      relationshipLayer.replaceChildren();
      const metadataNodes = Array.from(root.querySelectorAll("[data-ns-relationship-id]"))
        .filter((element) => !element.closest("[data-ns-spatial-system]"));
      const routedBounds = [];
      for (const metadata of metadataNodes) {
        const relationshipId = metadata.getAttribute("data-ns-relationship-id") || "";
        const source = byId.get(metadata.getAttribute("data-ns-source-id") || "");
        const target = byId.get(metadata.getAttribute("data-ns-target-id") || "");
        if (!relationshipId || !source || !target) {
          unresolvedRelationshipIds.push(relationshipId || "relationship");
          continue;
        }
        const routed = makeRelationshipPath(source, target, metadata.getAttribute("data-ns-route") || "soft-curve");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "ns-spatial-path");
        path.setAttribute("data-ns-routed-relationship-id", relationshipId);
        path.setAttribute("d", routed.d);
        const priority = metadata.getAttribute("data-ns-priority") || "secondary";
        const confidence = Math.max(0.5, Math.min(1, Number(metadata.getAttribute("data-ns-confidence")) || 0.65));
        path.setAttribute("stroke", priority === "primary" ? "#694cff" : priority === "supporting" ? "rgba(68,62,100,.42)" : "rgba(105,76,255,.68)");
        path.setAttribute("stroke-width", priority === "primary" ? "3.5" : priority === "supporting" ? "1.5" : "2.25");
        path.setAttribute("stroke-opacity", String(confidence));
        if ((metadata.getAttribute("data-ns-relationship-type") || "") === "contrastive") path.setAttribute("stroke-dasharray", "8 7");
        relationshipLayer.appendChild(path);
        const xs = routed.points.map((point) => point.x);
        const ys = routed.points.map((point) => point.y);
        const bounds = {
          x: Math.min.apply(null, xs),
          y: Math.min.apply(null, ys),
          right: Math.max.apply(null, xs),
          bottom: Math.max.apply(null, ys),
        };
        routedBounds.push(bounds);
        spatialBounds.minX = Math.min(spatialBounds.minX, Math.floor(bounds.x - 24));
        spatialBounds.minY = Math.min(spatialBounds.minY, Math.floor(bounds.y - 24));
        spatialBounds.maxX = Math.max(spatialBounds.maxX, Math.ceil(bounds.right + 24));
        spatialBounds.maxY = Math.max(spatialBounds.maxY, Math.ceil(bounds.bottom + 24));
        const label = metadata.getAttribute("data-ns-label");
        if (label) {
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          const midpoint = routed.points[Math.floor(routed.points.length / 2)];
          text.setAttribute("class", "ns-spatial-route-label");
          text.setAttribute("x", String(midpoint.x + 8));
          text.setAttribute("y", String(midpoint.y - 8));
          text.setAttribute("fill", "#40366f");
          text.textContent = label;
          relationshipLayer.appendChild(text);
        }
      }

      for (let first = 0; first < routedBounds.length; first += 1) {
        for (let second = first + 1; second < routedBounds.length; second += 1) {
          const a = routedBounds[first], b = routedBounds[second];
          const aa = { x: a.x, y: a.y, right: a.right, bottom: a.bottom };
          const bb = { x: b.x, y: b.y, right: b.right, bottom: b.bottom };
          if (overlaps(aa, bb, 0)) crossingCount += 1;
        }
      }

      const overlayWidth = Math.max(MINIMUM_WIDTH, spatialBounds.maxX - Math.min(0, spatialBounds.minX));
      const overlayHeight = Math.max(MINIMUM_HEIGHT, spatialBounds.maxY - Math.min(0, spatialBounds.minY));
      spatialSystem.style.width = overlayWidth + "px";
      spatialSystem.style.height = overlayHeight + "px";
      relationshipLayer.setAttribute("viewBox", "0 0 " + overlayWidth + " " + overlayHeight);
      relationshipLayer.setAttribute("width", String(overlayWidth));
      relationshipLayer.setAttribute("height", String(overlayHeight));

      const hardFailureCount =
        unresolvedAnchorIds.length +
        overlappingAnnotationPairs.length +
        annotationTargetOverlapIds.length +
        clippedAnnotationIds.length +
        unresolvedRelationshipIds.length;
      const softIssueCount =
        excessiveDistanceIds.length +
        obstacleIntersectionIds.length +
        falseIntersectionIds.length +
        crossingCount;
      lastSpatialAudit = {
        snapshotRevisionId: currentRevisionId,
        layoutVersion: spatialLayoutVersion,
        unresolvedAnchorIds,
        overlappingAnnotationPairs,
        annotationTargetOverlapIds,
        clippedAnnotationIds,
        excessiveDistanceIds,
        unresolvedRelationshipIds,
        obstacleIntersectionIds,
        falseIntersectionIds,
        crossingCount,
        hardFailureCount,
        softIssueCount,
        annotationCount: annotations.length,
        relationshipCount: metadataNodes.length,
      };
      return lastSpatialAudit;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Northstar isolated spatial service recovered without changing intrinsic layout.", error);
      spatialBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      lastSpatialAudit = emptySpatialAudit(message);
      return lastSpatialAudit;
    } finally {
      solvingSpatialLayout = false;
    }
  };

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
  const normalizeSemanticText = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 4000);
  const semanticAttributes = (element) => Object.fromEntries(
    Array.from(element.attributes || [])
      .filter((attribute) => !["class", "style"].includes(attribute.name) && !/^data-ns-(?:mutating|runtime-owned|spatial)/.test(attribute.name))
      .map((attribute) => [attribute.name, attribute.value])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
  const semanticStyles = (element) => Object.fromEntries(
    Array.from(element.style || [])
      .map((name) => [name, element.style.getPropertyValue(name).trim()])
      .filter((entry) => entry[1])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
  const semanticFingerprint = (value) => {
    let hash = 2166136261;
    const source = String(value || "");
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  const captureCommittedSemanticNodes = () => Array.from(root.querySelectorAll("[data-ns-node-id]"))
    .filter((element) => !element.closest('[data-ns-runtime-owned="true"],[data-ns-spatial-system]'))
    .map((element) => {
      const nodeId = element.getAttribute("data-ns-node-id") || "";
      const parent = element.parentElement?.closest("[data-ns-node-id]");
      const normalizedAttributes = semanticAttributes(element);
      const normalizedClasses = Array.from(element.classList || []).sort();
      const normalizedStyles = semanticStyles(element);
      const normalizedText = normalizeSemanticText(element.textContent);
      const childNodeIds = Array.from(element.children || [])
        .map((child) => child.getAttribute?.("data-ns-node-id") || "")
        .filter(Boolean);
      return {
        nodeId,
        parentId: parent?.getAttribute("data-ns-node-id") || undefined,
        normalizedText,
        normalizedAttributes,
        normalizedClasses,
        normalizedStyles,
        subtreeFingerprint: semanticFingerprint(JSON.stringify({
          tagName: element.tagName.toLowerCase(),
          normalizedText,
          normalizedAttributes,
          normalizedClasses,
          normalizedStyles,
          childNodeIds,
        })),
      };
    })
    .filter((node) => node.nodeId);
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
        attributes: semanticAttributes(element),
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
  const rectIntersectionArea = (a, b) => {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  };
  const visualSafetySnapshot = () => {
    const rootRect = root.getBoundingClientRect();
    const singletonRoleForElement = (element) => {
      const source = [
        element.getAttribute("data-ns-role") || "",
        element.getAttribute("data-ns-node-id") || "",
        element.className || "",
        element.querySelector(":scope > h1, :scope > h2, :scope > h3")?.textContent || "",
      ].join(" ").toLowerCase();
      if (/(?:executive|strategic)[-_ ]?synthesis|exec[-_ ]?summary/.test(source)) return "executive-synthesis";
      if (/(?:comparison|comparative|synthesis|trade[-_ ]?off)[-_ ]?matrix/.test(source)) return "comparison-matrix";
      if (/(?:primary|comparison|tension|divergence)[-_ ]?axis|decision[-_ ]?spine/.test(source)) return "primary-axis";
      if (/(?:primary|executive)[-_ ]?recommendation|recommendation[-_ ]?panel/.test(source)) return "recommendation";
      if (/(?:primary[-_ ]?decision|decision[-_ ]?panel|decision[-_ ]?summary)/.test(source)) return "decision";
      if (/(?:provenance[-_ ]?panel|evidence[-_ ]?provenance|source[-_ ]?register)/.test(source)) return "provenance";
      return "";
    };
    const classifySemanticGeometryRole = (element) => {
      const id = (element.getAttribute("data-ns-node-id") || "").toLowerCase();
      const role = (element.getAttribute("data-ns-role") || "").toLowerCase();
      const explicit = (element.getAttribute("data-ns-geometry-role") || "").toLowerCase();
      if (element === root || id === "artboard" || role === "root" || explicit === "root") return "root";
      if (explicit === "decorative" || element.hasAttribute("data-ns-decorative") || /(?:background|wash|glow|shadow|bleed|ornament)/.test(id + " " + role)) return "decorative";
      if (explicit === "structural" || element.hasAttribute("data-ns-structural-layer") || /(?:layer|wrapper|container|grid|rail|lane|surface)/.test(id + " " + role)) return "structural";
      return "content";
    };
    const semantic = Array.from(root.querySelectorAll("[data-ns-node-id]"))
      .filter((element) => element !== root && !element.closest("[data-ns-spatial-system]") && !PROGRESS_ONLY_NODE_IDS.has(element.getAttribute("data-ns-node-id") || ""))
      .map((element) => ({
        element,
        id: element.getAttribute("data-ns-node-id") || "",
        rect: element.getBoundingClientRect(),
        geometryRole: classifySemanticGeometryRole(element),
      }))
      .filter((item) => item.geometryRole !== "root" && item.rect.width > 1 && item.rect.height > 1);
    const evidenceElements = Array.from(root.querySelectorAll("[data-ns-evidence-id], figure:has(img)"));
    const evidenceRects = evidenceElements.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 4 && rect.height > 4);
    const unsafeEvidenceOverlayIds = [];
    const majorAnalyticalItems = [];
    for (const item of semantic) {
      const id = item.id.toLowerCase();
      const role = (item.element.getAttribute("data-ns-role") || "").toLowerCase();
      const isSynthetic = /(?:marker|callout|annotation|axis|badge|label|friction|trust|sso)/.test(id)
        || item.element.hasAttribute("data-ns-annotation-id")
        || item.element.hasAttribute("data-ns-relationship-id");
      const isMajorAnalytical = /(?:synthesis|summary|decision|recommendation|takeaway|trade[-_ ]?off|insight|conclusion|implication|comparison[-_ ]?axis)/.test(id + " " + role)
        || item.element.hasAttribute("data-ns-major-region")
        || ["synthesis", "decision", "recommendation", "takeaway", "conclusion"].includes(role);
      if (isMajorAnalytical && item.element.tagName !== "FIGCAPTION" && !item.element.hasAttribute("data-ns-evidence-caption")) {
        majorAnalyticalItems.push(item);
      }
      if (!isSynthetic || item.element.tagName === "FIGCAPTION" || item.element.hasAttribute("data-ns-evidence-caption")) continue;
      for (const evidenceRect of evidenceRects) {
        const overlapArea = rectIntersectionArea(item.rect, evidenceRect);
        const ownArea = Math.max(1, item.rect.width * item.rect.height);
        if (overlapArea / ownArea > 0.12) {
          unsafeEvidenceOverlayIds.push(item.id || "synthetic-overlay");
          break;
        }
      }
    }
    const incoherentMajorRegionIds = [];
    for (const item of majorAnalyticalItems) {
      const ownArea = Math.max(1, item.rect.width * item.rect.height);
      for (const evidenceRect of evidenceRects) {
        const overlapArea = rectIntersectionArea(item.rect, evidenceRect);
        const evidenceArea = Math.max(1, evidenceRect.width * evidenceRect.height);
        if (overlapArea / ownArea > 0.08 || overlapArea / evidenceArea > 0.10) {
          incoherentMajorRegionIds.push(item.id || "major-analytical-region");
          break;
        }
      }
    }
    const majorRegionCollisionPairs = [];
    for (let index = 0; index < majorAnalyticalItems.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < majorAnalyticalItems.length; otherIndex += 1) {
        const first = majorAnalyticalItems[index];
        const second = majorAnalyticalItems[otherIndex];
        if (first.element.contains(second.element) || second.element.contains(first.element)) continue;
        const overlapArea = rectIntersectionArea(first.rect, second.rect);
        const smallerArea = Math.max(1, Math.min(first.rect.width * first.rect.height, second.rect.width * second.rect.height));
        if (overlapArea / smallerArea > 0.16) {
          majorRegionCollisionPairs.push([first.id || "major-region", second.id || "major-region"]);
        }
      }
    }
    const singletonRoleOwners = new Map();
    for (const item of semantic) {
      const role = singletonRoleForElement(item.element);
      if (!role) continue;
      const owners = singletonRoleOwners.get(role) || [];
      owners.push(item.id || role);
      singletonRoleOwners.set(role, owners);
    }
    const duplicateSingletonRoles = Array.from(singletonRoleOwners.entries())
      .filter(([, owners]) => owners.length > 1)
      .map(([role, owners]) => ({ role, owners }));
    if (!semantic.length) return {
      occupiedWidthRatio: 0,
      occupiedHeightRatio: 0,
      centroidXRatio: .5,
      centroidYRatio: .5,
      evidenceCount: evidenceRects.length,
      evidenceArea: evidenceRects.reduce((sum, rect) => sum + rect.width * rect.height, 0),
      unsafeEvidenceOverlayIds,
      incoherentMajorRegionIds: Array.from(new Set(incoherentMajorRegionIds)),
      majorRegionCollisionPairs,
      outOfBoundsNodeIds: [],
      overflowDetails: [],
      clippedSemanticNodeIds: [],
      rootOriginOffset: { x: rootRect.left, y: rootRect.top },
      comparisonEntityCount: root.querySelectorAll("[data-ns-flow-id], [data-ns-comparison-entity]").length,
      declaredStructureFailures: [],
      duplicateSingletonRoles,
      contentBounds: { left: rootRect.left, top: rootRect.top, right: rootRect.right, bottom: rootRect.bottom },
    };
    const left = Math.min(...semantic.map((item) => item.rect.left));
    const right = Math.max(...semantic.map((item) => item.rect.right));
    const top = Math.min(...semantic.map((item) => item.rect.top));
    const bottom = Math.max(...semantic.map((item) => item.rect.bottom));
    const containmentTolerance = 4;
    const toRootLocalRect = (rect) => ({
      left: rect.left - rootRect.left,
      top: rect.top - rootRect.top,
      right: rect.right - rootRect.left,
      bottom: rect.bottom - rootRect.top,
      width: rect.width,
      height: rect.height,
    });
    // The canvas surface is sized from the complete measured content bounds,
    // including deliberate negative origins and wide filmstrips. Auditing only
    // against the root element's initial CSS box falsely rejected content that
    // the runtime had already measured and exposed on the artboard.
    const measuredArtboardBounds = getContentBounds();
    const rootLocalBounds = {
      left: measuredArtboardBounds.minX,
      top: measuredArtboardBounds.minY,
      right: measuredArtboardBounds.maxX,
      bottom: measuredArtboardBounds.maxY,
    };
    const meaningfulChildrenInside = (item) => {
      if (item.geometryRole === "content") return false;
      const children = Array.from(item.element.querySelectorAll("[data-ns-node-id]"))
        .filter((child) => classifySemanticGeometryRole(child) === "content")
        .map((child) => toRootLocalRect(child.getBoundingClientRect()))
        .filter((rect) => rect.width > 1 && rect.height > 1);
      return children.length > 0 && children.every((rect) => rect.left >= rootLocalBounds.left - containmentTolerance
        && rect.top >= rootLocalBounds.top - containmentTolerance
        && rect.right <= rootLocalBounds.right + containmentTolerance
        && rect.bottom <= rootLocalBounds.bottom + containmentTolerance);
    };
    const overflowDetails = semantic
      .map((item) => {
        const rect = toRootLocalRect(item.rect);
        const overflow = {
          left: Math.max(0, rootLocalBounds.left - rect.left),
          top: Math.max(0, rootLocalBounds.top - rect.top),
          right: Math.max(0, rect.right - rootLocalBounds.right),
          bottom: Math.max(0, rect.bottom - rootLocalBounds.bottom),
        };
        const maxOverflow = Math.max(overflow.left, overflow.top, overflow.right, overflow.bottom);
        if (maxOverflow <= containmentTolerance) return null;
        if ((item.geometryRole === "structural" || item.geometryRole === "decorative") && meaningfulChildrenInside(item)) return null;
        return { id: item.id || "semantic-node", geometryRole: item.geometryRole, overflow };
      })
      .filter(Boolean);
    const outOfBoundsNodeIds = overflowDetails.map((item) => item.id);
    const clippedSemanticNodeIds = semantic
      .filter((item) => {
        let ancestor = item.element.parentElement;
        while (ancestor && ancestor !== root) {
          const style = getComputedStyle(ancestor);
          const clipsX = ["hidden", "clip"].includes(style.overflowX);
          const clipsY = ["hidden", "clip"].includes(style.overflowY);
          if (clipsX || clipsY) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if ((clipsX && (item.rect.left < ancestorRect.left - 1 || item.rect.right > ancestorRect.right + 1))
              || (clipsY && (item.rect.top < ancestorRect.top - 1 || item.rect.bottom > ancestorRect.bottom + 1))) return true;
          }
          ancestor = ancestor.parentElement;
        }
        return false;
      })
      .map((item) => item.id || "semantic-node");
    const comparisonEntityCount = root.querySelectorAll("[data-ns-flow-id], [data-ns-comparison-entity]").length;
    const currentActText = (root.querySelector('[data-ns-node-id="current-act-text"]')?.textContent || "").toLowerCase();
    const declaredStructureFailures = [];
    if (/implemented|completed|finalized/.test(currentActText)) {
      if (/spine/.test(currentActText) && !root.querySelector('[data-ns-node-id*="spine"], [data-ns-role="spine"], [data-ns-comparison-axis]')) declaredStructureFailures.push("declared-spine-not-visible");
      if (/comparison/.test(currentActText) && comparisonEntityCount < 2) declaredStructureFailures.push("declared-comparison-incomplete");
    }
    const weightedArea = semantic.reduce((sum, item) => sum + Math.max(1, item.rect.width * item.rect.height), 0);
    const centroidX = semantic.reduce((sum, item) => sum + (item.rect.left + item.rect.width / 2) * Math.max(1, item.rect.width * item.rect.height), 0) / weightedArea;
    const centroidY = semantic.reduce((sum, item) => sum + (item.rect.top + item.rect.height / 2) * Math.max(1, item.rect.width * item.rect.height), 0) / weightedArea;
    return {
      occupiedWidthRatio: Math.max(0, Math.min(1, (right - left) / Math.max(1, rootRect.width))),
      occupiedHeightRatio: Math.max(0, Math.min(1, (bottom - top) / Math.max(1, rootRect.height))),
      centroidXRatio: Math.max(0, Math.min(1, (centroidX - rootRect.left) / Math.max(1, rootRect.width))),
      centroidYRatio: Math.max(0, Math.min(1, (centroidY - rootRect.top) / Math.max(1, rootRect.height))),
      evidenceCount: evidenceRects.length,
      evidenceArea: evidenceRects.reduce((sum, rect) => sum + rect.width * rect.height, 0),
      unsafeEvidenceOverlayIds: Array.from(new Set(unsafeEvidenceOverlayIds)),
      incoherentMajorRegionIds: Array.from(new Set(incoherentMajorRegionIds)),
      majorRegionCollisionPairs,
      outOfBoundsNodeIds: Array.from(new Set(outOfBoundsNodeIds)),
      overflowDetails,
      clippedSemanticNodeIds: Array.from(new Set(clippedSemanticNodeIds)),
      rootOriginOffset: { x: rootRect.left, y: rootRect.top },
      comparisonEntityCount,
      declaredStructureFailures,
      duplicateSingletonRoles,
      contentBounds: { left, top, right, bottom },
    };
  };
  const visualSafetyFailure = (before, after) => {
    if (after.duplicateSingletonRoles?.length) {
      return "Canonical artboard role uniqueness failed; duplicate singleton regions were present: " + after.duplicateSingletonRoles.map((entry) => entry.role + " [" + entry.owners.join(", ") + "]").join("; ");
    }
    if (after.unsafeEvidenceOverlayIds.length) {
      return "Synthetic annotation overlapped a protected evidence screenshot: " + after.unsafeEvidenceOverlayIds.join(", ");
    }
    if (after.incoherentMajorRegionIds?.length) {
      return "A major analytical region overlapped grounded evidence instead of receiving a complete atomic reflow: " + after.incoherentMajorRegionIds.join(", ");
    }
    if (after.majorRegionCollisionPairs?.length) {
      return "Major analytical regions collided in the visible composition: " + after.majorRegionCollisionPairs.map((pair) => pair.join(" â†” ")).join(", ");
    }
    if (after.outOfBoundsNodeIds?.length) {
      const detail = (after.overflowDetails || []).slice(0, 6).map((item) => {
        const directions = Object.entries(item.overflow)
          .filter(([, value]) => value > 4)
          .map(([direction, value]) => direction + " " + Math.ceil(value) + "px")
          .join("/");
        return item.id + (directions ? " (" + directions + ")" : "");
      });
      return "Whole-artboard containment failed; meaningful content extended beyond the rendered root: " + (detail.length ? detail.join(", ") : after.outOfBoundsNodeIds.slice(0, 8).join(", "));
    }
    if (after.clippedSemanticNodeIds?.length) {
      return "Whole-artboard clipping failed; meaningful nodes were clipped by an ancestor: " + after.clippedSemanticNodeIds.slice(0, 8).join(", ");
    }
    if (after.declaredStructureFailures?.length) {
      return "The working status claimed a completed structure that was not fully visible: " + after.declaredStructureFailures.join(", ");
    }
    if (before.comparisonEntityCount >= 2 && after.comparisonEntityCount < 2) {
      return "Comparison completeness failed; a required comparison entity or evidence lane disappeared.";
    }
    const excessiveVerticalVoid = after.occupiedHeightRatio < .42 && after.occupiedWidthRatio > .55 && after.centroidYRatio < .42;
    const excessiveHorizontalVoid = after.occupiedWidthRatio < .48 && after.occupiedHeightRatio > .42;
    if (excessiveVerticalVoid || excessiveHorizontalVoid) {
      return "Whole-artboard utilization failed; the visible composition occupied only a thin strip and left disproportionate empty space.";
    }
    const widthCollapsed = before.occupiedWidthRatio >= .52 && after.occupiedWidthRatio < Math.max(.28, before.occupiedWidthRatio * .58);
    const heightCollapsed = before.occupiedHeightRatio >= .45 && after.occupiedHeightRatio < Math.max(.24, before.occupiedHeightRatio * .55);
    const edgeCollapsed = after.occupiedWidthRatio < .46 && (after.centroidXRatio < .22 || after.centroidXRatio > .78);
    const evidenceDestroyed = before.evidenceCount >= 4 && after.evidenceCount < Math.ceil(before.evidenceCount * .35) && after.evidenceArea < before.evidenceArea * .28;
    if (widthCollapsed || heightCollapsed || edgeCollapsed) return "The proposed recomposition collapsed meaningful content into an unsafe edge-weighted or mostly empty layout.";
    if (evidenceDestroyed) return "The proposed recomposition removed or collapsed too much grounded evidence at once.";
    return "";
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
  const captureLiveSnapshot = () => {
    const authoredRoot = root.cloneNode(true);
    authoredRoot.querySelectorAll?.('[data-ns-runtime-owned="true"],[data-ns-spatial-system]').forEach((element) => element.remove());
    return {
      html: authoredRoot.innerHTML,
      css: Array.from(document.querySelectorAll("style"))
        .filter((style) => !style.hasAttribute("data-ns-runtime-owned") && !style.hasAttribute("data-ns-runtime-spatial-style"))
        .map((style) => style.textContent || "")
        .join("\n"),
      capturedAt: new Date().toISOString(),
      semanticNodes: captureCommittedSemanticNodes(),
    };
  };
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

  const applyMutationBatch = async (batch, revisionId, acknowledge = true, proposal = null) => {
    if (!batch || appliedMutationIds.has(batch.mutationId)) return;
    if (proposal?.baseRevisionId && proposal.baseRevisionId !== currentRevisionId) {
      throw new Error("Proposal base revision does not match the mounted browser revision.");
    }
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
      beforeVisualSafety: visualSafetySnapshot(),
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
      pendingAcknowledgement = {
        batch,
        transaction,
        mutationId: batch.mutationId,
        revisionId: currentRevisionId,
        visibleChange: batch.visibleChange,
        proposal,
        pendingSince: Date.now(),
      };
    } else {
      appliedMutationIds.add(batch.mutationId);
    }
    // Report the complete live DOM throughout the transition for internal audit.
    // The host buffers these provisional measurements and publishes outer Canvas
    // geometry only from terminal ready/applied events.
    queueContentSize();
    const transitionWindow = Math.max(120, Math.min(1400, Number(batch.transitionMs) || 320));
    // The acceptance gate below intentionally waits up to three seconds for
    // layout stability and eight seconds for remote assets. Keep auditing at
    // both deadlines; otherwise the last early audit can leave a received
    // mutation pending forever when no later ResizeObserver/image event fires.
    [0, 40, 90, 160, 260, 420, 700, transitionWindow, 1_600, 3_100, 8_100].forEach((delay) => {
      window.setTimeout(queueContentSize, delay);
    });
  };

  const processQueue = async () => {
    if (applyingMutation) return;
    applyingMutation = true;
    try {
      while (mutationQueue.length) {
        const item = mutationQueue.shift();
        try { await applyMutationBatch(item.batch, item.revisionId, true, item.proposal); }
        catch (error) {
          const terminalMessage = {
            type: "northstar.artifact.runtime-error",
            artifactId: ARTIFACT_ID,
            surfaceId: SURFACE_ID,
            revisionId: currentRevisionId,
            baseRevisionId: item.proposal?.baseRevisionId,
            proposalId: item.proposal?.proposalId,
            ackToken: item.proposal?.ackToken,
            mutationId: item.batch?.mutationId,
            message: error instanceof Error ? error.message : String(error),
            snapshot: captureLiveSnapshot(),
          };
          postTerminalMutation(item.batch?.mutationId, terminalMessage);
        }
        finally { if (item.batch?.mutationId) queuedMutationIds.delete(item.batch.mutationId); }
      }
    } finally { applyingMutation = false; }
  };

  const getContentBounds = () => {
    const rootRect = root.getBoundingClientRect();
    let minX = Math.min(0, requestedBounds.minX), minY = Math.min(0, requestedBounds.minY);
    let maxX = Math.max(MINIMUM_WIDTH, requestedBounds.maxX), maxY = Math.max(MINIMUM_HEIGHT, requestedBounds.maxY);
    [root, ...root.querySelectorAll("*")].forEach((element) => {
      if (element !== root && element.closest("[data-ns-spatial-system]")) return;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return;
      const left = rect.left - rootRect.left, top = rect.top - rootRect.top;
      minX = Math.min(minX, left); minY = Math.min(minY, top);
      maxX = Math.max(maxX, rect.right - rootRect.left, left + (element.scrollWidth || 0));
      maxY = Math.max(maxY, rect.bottom - rootRect.top, top + (element.scrollHeight || 0));
    });
    minX = Math.min(minX, spatialBounds.minX);
    minY = Math.min(minY, spatialBounds.minY);
    maxX = Math.max(maxX, spatialBounds.maxX);
    maxY = Math.max(maxY, spatialBounds.maxY);
    minX = Math.floor(minX); minY = Math.floor(minY); maxX = Math.ceil(maxX); maxY = Math.ceil(maxY);
    return { minX, minY, maxX, maxY, width: Math.max(MINIMUM_WIDTH, maxX - minX), height: Math.max(MINIMUM_HEIGHT, maxY - minY) };
  };

  const audit = () => {
    const elements = Array.from(root.querySelectorAll("*")).filter((element) => !element.closest("[data-ns-spatial-system]"));
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
      spatialAudit: lastSpatialAudit || emptySpatialAudit(),
      spatialSnapshot: {
        artifactId: ARTIFACT_ID,
        revisionId: currentRevisionId,
        mutationId: currentMutationId,
        measuredAt: new Date().toISOString(),
        layoutVersion: spatialLayoutVersion,
        artboardBounds: { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height, right: bounds.maxX, bottom: bounds.maxY },
        audit: lastSpatialAudit || emptySpatialAudit(),
      },
      summary: issueCount ? "Live artboard audit detected " + issueCount + " potential visual issues for the next micro-adjustment." : "Live artboard audit passed.",
    };
    parent.postMessage({ type: "northstar.artifact.runtime-review", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: currentMutationId, review }, "*");
    return review;
  };

  let sizeFrame = 0, lastSignature = "", stableCount = 0, sequence = 0, initialReady = false;
  const reportContentSize = () => {
    solveSpatialSystem();
    const bounds = getContentBounds(), signature = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(":");
    stableCount = signature === lastSignature ? stableCount + 1 : 1; lastSignature = signature; sequence += 1;
    stageSurface.style.width = bounds.width + "px"; stageSurface.style.height = bounds.height + "px";
    origin.style.transform = "translate(" + (-bounds.minX) + "px," + (-bounds.minY) + "px)";
    const resourcesSettled =
      document.readyState === "complete" &&
      (!document.fonts || document.fonts.status === "loaded") &&
      Array.from(document.images).every((image) => image.complete);
    const pendingAge = pendingAcknowledgement ? Date.now() - (pendingAcknowledgement.pendingSince || Date.now()) : 0;
    // A remote image can remain in the browser's pending state indefinitely.
    // The transaction audit already rejects missing required assets, so a
    // resource must never prevent the runtime from returning a terminal result.
    const resourceDeadlineReached = Boolean(pendingAcknowledgement) && pendingAge >= 8_000;
    const settled = (resourcesSettled || resourceDeadlineReached) && (stableCount >= 3 || pendingAge >= 3_000);
    const verifiedDocumentWidth = Math.max(bounds.width, root.scrollWidth, root.getBoundingClientRect().width);
    const verifiedDocumentHeight = Math.max(bounds.height, root.scrollHeight, root.getBoundingClientRect().height);
    const size = {
      artifactId: ARTIFACT_ID,
      surfaceId: SURFACE_ID,
      revisionId: currentRevisionId,
      mutationId: currentMutationId,
      measuredAt: new Date().toISOString(),
      intrinsicWidth: Math.ceil(verifiedDocumentWidth),
      intrinsicHeight: Math.ceil(verifiedDocumentHeight),
      contentBounds: {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: Math.max(bounds.maxX, bounds.minX + verifiedDocumentWidth),
        maxY: Math.max(bounds.maxY, bounds.minY + verifiedDocumentHeight),
      },
      // sequence is monotonic for the lifetime of the mounted iframe. The host and
      // workspace use it as the live-layout clock, independent of proposal commit.
      sequence,
      layoutVersion: sequence,
      settled,
      live: true,
    };
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
        // Geometry remains browser-measured, but unchanged outer bounds must not
        // roll back an otherwise meaningful and safe internal recomposition.
        const missingRequiredKinds = requiredKinds.filter(
          (kind) => kind !== "geometry" && !changeKinds.includes(kind),
        );
        const spatialMutation = acknowledgement.batch.operations.some((operation) =>
          (operation.op === "insert-html" || operation.op === "set-html")
          && /data-ns-(?:annotation-id|relationship-id)/i.test(operation.html || "")
        );
        const hardIssues =
          review.overflowElementCount +
          review.clippedTextCount +
          review.missingImageCount +
          (review.documentScrollRisk ? 1 : 0) +
          (spatialMutation ? (review.spatialAudit?.hardFailureCount || 0) : 0);
        const afterVisualSafety = visualSafetySnapshot();
        const visualSafetyReason = visualSafetyFailure(acknowledgement.transaction.beforeVisualSafety || afterVisualSafety, afterVisualSafety);
        const rejectedReason = visualSafetyReason
          ? visualSafetyReason
          : missingAssets.length
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
          const terminalMessage = {
            type: "northstar.artifact.mutation-rejected",
            artifactId: ARTIFACT_ID,
            surfaceId: SURFACE_ID,
            revisionId: currentRevisionId,
            baseRevisionId: acknowledgement.proposal?.baseRevisionId,
            proposalId: acknowledgement.proposal?.proposalId,
            ackToken: acknowledgement.proposal?.ackToken,
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
            snapshot: captureLiveSnapshot(),
          };
          postTerminalMutation(acknowledgement.mutationId, terminalMessage);
          queueContentSize();
        } else {
          pendingAcknowledgement = null;
          appliedMutationIds.add(acknowledgement.mutationId);
          // request-space is provisional room for composing the mutation. Once
          // the browser has measured the accepted visible result, actual content
          // and resolved spatial extents become the sole sizing authority.
          requestedBounds = { minX: 0, minY: 0, maxX: MINIMUM_WIDTH, maxY: MINIMUM_HEIGHT };
          solveSpatialSystem();
          const terminalBounds = getContentBounds();
          const terminalDocumentWidth = Math.max(terminalBounds.width, root.scrollWidth, root.getBoundingClientRect().width);
          const terminalDocumentHeight = Math.max(terminalBounds.height, root.scrollHeight, root.getBoundingClientRect().height);
          const terminalSize = {
            ...size,
            measuredAt: new Date().toISOString(),
            intrinsicWidth: Math.ceil(terminalDocumentWidth),
            intrinsicHeight: Math.ceil(terminalDocumentHeight),
            contentBounds: {
              minX: terminalBounds.minX,
              minY: terminalBounds.minY,
              maxX: Math.max(terminalBounds.maxX, terminalBounds.minX + terminalDocumentWidth),
              maxY: Math.max(terminalBounds.maxY, terminalBounds.minY + terminalDocumentHeight),
            },
            settled: true,
          };
          stageSurface.style.width = terminalBounds.width + "px";
          stageSurface.style.height = terminalBounds.height + "px";
          origin.style.transform = "translate(" + (-terminalBounds.minX) + "px," + (-terminalBounds.minY) + "px)";
          const changedRects = diff.meaningful.map((id) => nodeById(id)?.getBoundingClientRect()).filter(Boolean);
          const rootRect = root.getBoundingClientRect();
          const changedBounds = changedRects.length ? {
            minX: Math.floor(Math.min(...changedRects.map((rect) => rect.left - rootRect.left))),
            minY: Math.floor(Math.min(...changedRects.map((rect) => rect.top - rootRect.top))),
            maxX: Math.ceil(Math.max(...changedRects.map((rect) => rect.right - rootRect.left))),
            maxY: Math.ceil(Math.max(...changedRects.map((rect) => rect.bottom - rootRect.top))),
          } : terminalSize.contentBounds;
          const acknowledgedSize = { ...terminalSize, changedBounds, changedNodeIds: diff.changed, meaningfulChangedNodeIds: diff.meaningful };
          const terminalMessage = {
            type: "northstar.artifact.mutation-applied",
            artifactId: ARTIFACT_ID,
            surfaceId: SURFACE_ID,
            revisionId: acknowledgement.revisionId,
            baseRevisionId: acknowledgement.proposal?.baseRevisionId,
            proposalId: acknowledgement.proposal?.proposalId,
            ackToken: acknowledgement.proposal?.ackToken,
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
          };
          postTerminalMutation(acknowledgement.mutationId, terminalMessage);
          queueContentSize();
        }
      }
    }
  };
  const queueContentSize = () => { cancelAnimationFrame(sizeFrame); sizeFrame = requestAnimationFrame(() => requestAnimationFrame(reportContentSize)); };

  const observer = new MutationObserver((records) => {
    const externalChange = records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return !target?.closest?.("[data-ns-spatial-system]");
    });
    if (!externalChange) return;
    enforceAssetPolicy(root);
    queueContentSize();
  });
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
      const mutationId = message.batch.mutationId;
      parent.postMessage({
        type: "northstar.artifact.mutation-received",
        artifactId: ARTIFACT_ID,
        surfaceId: SURFACE_ID,
        revisionId: message.revisionId,
        baseRevisionId: message.baseRevisionId,
        proposalId: message.proposalId,
        ackToken: message.ackToken,
        mutationId,
      }, "*");
      const terminalMessage = terminalMutationMessages.get(mutationId);
      if (terminalMessage) {
        parent.postMessage(terminalMessage, "*");
        return;
      }
      if (
        appliedMutationIds.has(mutationId) ||
        queuedMutationIds.has(mutationId) ||
        pendingAcknowledgement?.mutationId === mutationId
      ) return;
      if (message.baseRevisionId && message.baseRevisionId !== currentRevisionId) {
        const lineageMessage = {
          type: "northstar.artifact.mutation-rejected",
          artifactId: ARTIFACT_ID,
          surfaceId: SURFACE_ID,
          revisionId: currentRevisionId,
          baseRevisionId: message.baseRevisionId,
          proposalId: message.proposalId,
          ackToken: message.ackToken,
          mutationId,
          message: "The proposal base revision does not match the mounted browser revision.",
          changedNodeIds: [],
          meaningfulChangedNodeIds: [],
          changeKinds: [],
          requiredAssetUrls: [],
          loadedAssetUrls: loadedAssetUrls(),
          missingAssetUrls: [],
          snapshot: captureLiveSnapshot(),
        };
        postTerminalMutation(mutationId, lineageMessage);
        return;
      }
      queuedMutationIds.add(mutationId);
      mutationQueue.push({
        batch: message.batch,
        revisionId: message.revisionId,
        proposal: {
          proposalId: message.proposalId,
          ackToken: message.ackToken,
          baseRevisionId: message.baseRevisionId,
        },
      });
      processQueue();
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
    #northstar-artifact-root>[data-ns-node-id="artboard"]{background-color:#fff!important}
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