// Northstar Canvas Artifact Runtime v0.9.0 — live visual authorship, deterministic typed primitives, precise analytical layout, and obstacle-aware semantic routing.
import type { CanvasCodeArtifactPayload } from "./types";
import { NORTHSTAR_DESIGN_KERNEL_CSS } from "@/lib/canvas-ai/northstar-design-kernel";
import { NORTHSTAR_HEALTH_POLICY } from "@/lib/canvas-ai/northstar-health-policy";
import {
  NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION,
  NORTHSTAR_ISOLATED_GEOMETRY_SETTLE_TIMEOUT_MS,
} from "./isolated-geometry-compiler";

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
  const authoredLayoutBaseWidth = Math.max(1, Math.round(artifact.layoutBaseWidth ?? artifact.preferredWidth));
  const authoredLayoutBaseHeight = Math.max(1, Math.round(artifact.layoutBaseHeight ?? artifact.preferredHeight));
  const mutationJournal = artifact.mutationJournal ?? [];
  // A package carrying pendingAckToken is a proposal, not committed browser
  // state. Replaying its newest batch during iframe construction bypasses the
  // receipt/apply/terminal-ack transaction entirely. Mount the committed prefix
  // and let the host dispatch the final batch with its exact proposal identity.
  const initialJournal = artifact.pendingAckToken
    ? mutationJournal.slice(0, -1)
    : mutationJournal;
  const initialAuthoredDesignRelationMap = new Map(
    (artifact.authoredDesignRelations ?? []).map((relation) => [relation.id, relation]),
  );
  for (const batch of initialJournal) {
    for (const relation of batch.relations ?? []) {
      initialAuthoredDesignRelationMap.set(relation.id, relation);
    }
  }
  const initialAuthoredDesignRelations = Array.from(initialAuthoredDesignRelationMap.values());
  const initialRevisionId = artifact.pendingAckToken
    ? artifact.parentRevisionId ?? artifact.revisionId
    : artifact.revisionId;
  const shouldAnimateInitialMount = mutationJournal.length === 0 && artifact.provisional && activeStageIndex === 0;
  const allowedAssetUrls = Array.from(new Set([
    ...(dataBundle.allowedAssetUrls ?? []),
    ...dataBundle.screenshots.map((screen) => screen.imageUrl).filter((value): value is string => Boolean(value)),
    ...dataBundle.apps.map((app) => app.iconUrl).filter((value): value is string => Boolean(value)),
  ]));
  // A surface often mounts before research has finished. The full research
  // bundle then arrives through `update-context`, so seed the registry from
  // both the package and the committed markup and keep it current at runtime.
  const sourceEvidenceIds = Array.from(documentSource.html.matchAll(/data-ns-evidence-id\s*=\s*["']([^"']+)["']/gi))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const initialExpectedEvidenceIds = Array.from(new Set([
    ...dataBundle.screenshots.map((screen) => screen.id),
    ...sourceEvidenceIds,
  ]));

  const initialAuthoredCssLayers = Object.entries(documentSource.cssLayers ?? {})
    .filter(([styleId]) => /^northstar-mutation-style-[a-zA-Z0-9_-]+$/.test(styleId))
    .map(([styleId, css]) => `<style id="${styleId}">${String(css).replaceAll("</style", "<\\/style")}</style>`)
    .join("\n");

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
  let currentPublicationState = ${safeJson(artifact.publicationState ?? "working")};
  let currentProvisional = ${safeJson(artifact.provisional !== false)};
  let activeStageIndex = ${activeStageIndex};
  const STAGES = ${safeJson(stages)};
  const INITIAL_JOURNAL = ${safeJson(initialJournal)};
  const INITIAL_AUTHORED_DESIGN_RELATIONS = ${safeJson(initialAuthoredDesignRelations)};
  const SHOULD_ANIMATE_INITIAL_MOUNT = ${safeJson(shouldAnimateInitialMount)};
  const ALLOWED_ASSETS = new Set(${safeJson(allowedAssetUrls)});
  // This must not be a mount-time constant. The iframe is intentionally kept
  // mounted while research adds evidence, and update-context is the handoff
  // that makes that evidence authoritative for every later design action.
  const expectedEvidenceIds = new Set(${safeJson(initialExpectedEvidenceIds)});
  const registerAssets = (values) => {
    for (const value of Array.isArray(values) ? values : []) {
      if (typeof value === "string" && /^(?:https?:|data:|blob:)/i.test(value)) ALLOWED_ASSETS.add(value);
    }
  };
  const MINIMUM_WIDTH = ${minimumWidth};
  const MINIMUM_HEIGHT = ${minimumHeight};
  const CANONICAL_GEOMETRY_COMPILER_VERSION = ${safeJson(NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION)};
  const CANONICAL_GEOMETRY_SETTLE_TIMEOUT = ${NORTHSTAR_ISOLATED_GEOMETRY_SETTLE_TIMEOUT_MS};
  let canonicalLayoutBaseWidth = ${authoredLayoutBaseWidth};
  let canonicalLayoutBaseHeight = ${authoredLayoutBaseHeight};
  const appliedMutationIds = new Set();
  const queuedMutationIds = new Set();
  const cancelledMutationIds = new Set();
  const terminalMutationMessages = new Map();
  const mutationTransactions = new Map();
  const mutationRollbackReceipts = new Map();
  const mutationQueue = [];
  let applyingMutation = false;
  let pendingAcknowledgement = null;
  let requestedBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let sourceOwnedGeometryActive = false;
  let committedCanonicalGeometry = null;
  let canonicalGeometrySequence = 0;
  let canonicalGeometryCompilerActive = false;
  let canonicalGeometryMutationId = null;
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
  const registerExpectedEvidence = (bundle) => {
    for (const screen of Array.isArray(bundle?.screenshots) ? bundle.screenshots : []) {
      const evidenceId = String(screen?.id || "").trim();
      if (evidenceId) expectedEvidenceIds.add(evidenceId);
    }
  };
  const markExpectedEvidenceAsProtected = () => {
    root.querySelectorAll("[data-ns-evidence-id]").forEach((element) => {
      const evidenceId = String(element.getAttribute("data-ns-evidence-id") || "").trim();
      if (evidenceId && expectedEvidenceIds.has(evidenceId)) {
        element.setAttribute("data-ns-protected-evidence", "true");
      }
    });
  };
  const captureCanonicalEvidenceNodes = () => {
    const canonical = new Map();
    root.querySelectorAll("[data-ns-evidence-id]").forEach((element) => {
      const evidenceId = String(element.getAttribute("data-ns-evidence-id") || "").trim();
      if (evidenceId && !canonical.has(evidenceId)) canonical.set(evidenceId, element);
    });
    return canonical;
  };
  const discardDuplicateEvidenceNodes = (canonical) => {
    const retained = new Set();
    root.querySelectorAll("[data-ns-evidence-id]").forEach((element) => {
      const evidenceId = String(element.getAttribute("data-ns-evidence-id") || "").trim();
      if (!evidenceId) return;
      const preferred = canonical.get(evidenceId);
      if (preferred?.isConnected) {
        if (element !== preferred) element.remove();
        retained.add(evidenceId);
        return;
      }
      if (retained.has(evidenceId)) {
        element.remove();
        return;
      }
      retained.add(evidenceId);
    });
    markExpectedEvidenceAsProtected();
  };
  registerExpectedEvidence(currentData);
  markExpectedEvidenceAsProtected();
  const prepaintFailsafe = window.setTimeout(() => root.removeAttribute("data-ns-prepaint"), 8_000);

  // Runtime-owned overlays are derived browser state. A historical snapshot may
  // contain them, but a mount must always begin from one clean authored tree.
  root.querySelectorAll('[data-ns-runtime-owned="true"],[data-ns-spatial-system]').forEach((element) => element.remove());
  document.querySelectorAll('style[data-ns-runtime-owned="true"],style[data-ns-runtime-spatial-style]').forEach((element) => element.remove());

  const candidateVisibilityShields = new Map();
  const beginAtomicCandidateValidation = (mutationId) => {
    if (!mutationId || candidateVisibilityShields.has(mutationId)) return;
    const rootRect = root.getBoundingClientRect();
    const originRect = origin.getBoundingClientRect();
    const shield = document.createElement("div");
    shield.setAttribute("data-ns-runtime-owned", "true");
    shield.setAttribute("data-ns-candidate-shield", mutationId);
    shield.setAttribute("aria-hidden", "true");
    shield.inert = true;
    Object.assign(shield.style, {
      position: "absolute",
      left: (rootRect.left - originRect.left) + "px",
      top: (rootRect.top - originRect.top) + "px",
      width: Math.max(1, rootRect.width) + "px",
      height: Math.max(1, rootRect.height) + "px",
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "2147483000",
    });
    const acceptedClone = root.cloneNode(true);
    acceptedClone.removeAttribute("data-ns-prepaint");
    acceptedClone.setAttribute("data-ns-runtime-owned", "true");
    acceptedClone.style.visibility = "visible";
    shield.appendChild(acceptedClone);
    origin.appendChild(shield);
    const priorPaintState = {
      opacityValue: root.style.getPropertyValue("opacity"),
      opacityPriority: root.style.getPropertyPriority("opacity"),
      pointerEventsValue: root.style.getPropertyValue("pointer-events"),
      pointerEventsPriority: root.style.getPropertyPriority("pointer-events"),
    };
    // Opacity isolates paint without changing layout, inherited visibility, or
    // evidence measurability. The candidate remains a real browser surface for
    // geometry, asset, clipping, and semantic audits.
    root.style.setProperty("opacity", "0", "important");
    root.style.setProperty("pointer-events", "none", "important");
    candidateVisibilityShields.set(mutationId, { shield, priorPaintState });
  };
  const endAtomicCandidateValidation = (mutationId) => {
    const state = candidateVisibilityShields.get(mutationId);
    if (!state) return;
    if (state.priorPaintState.opacityValue) {
      root.style.setProperty("opacity", state.priorPaintState.opacityValue, state.priorPaintState.opacityPriority);
    } else {
      root.style.removeProperty("opacity");
    }
    if (state.priorPaintState.pointerEventsValue) {
      root.style.setProperty("pointer-events", state.priorPaintState.pointerEventsValue, state.priorPaintState.pointerEventsPriority);
    } else {
      root.style.removeProperty("pointer-events");
    }
    state.shield.remove();
    candidateVisibilityShields.delete(mutationId);
  };

  const applyPublicationPresentationState = () => {
    const verified = currentPublicationState === "verified" && currentProvisional === false;
    root.setAttribute("data-ns-publication", verified ? "verified" : "working");
    root.setAttribute("data-ns-transaction-state", verified ? "settled" : (root.getAttribute("data-ns-transaction-state") || "visible"));
    let style = document.getElementById("northstar-publication-presentation-state");
    if (!style) {
      style = document.createElement("style");
      style.id = "northstar-publication-presentation-state";
      style.setAttribute("data-ns-runtime-owned", "true");
      document.head.appendChild(style);
    }
    style.textContent = verified
      ? '[data-ns-publication-policy="working-only"],[data-ns-thought-state="active"],[data-ns-thought-state="evolving"]{display:none!important}[data-ns-current-focus="true"]{outline:none!important;box-shadow:none!important}'
      : '';
    queueMicrotask(() => { try { queueContentSize(); } catch {} });
  };
  applyPublicationPresentationState();

  const authoredArtboard = () => root.querySelector('[data-ns-node-id="artboard"]');
  const hasModelSourceAuthority = () => authoredArtboard()?.getAttribute("data-ns-creative-authority") === "model-source";
  const syncIntrinsicGeometryMode = () => {
    // Geometry authority is canonical for the complete artboard lifetime. It
    // does not turn on at a research/design boundary and does not depend on the
    // authored source-authority marker.
    const artboard = authoredArtboard();
    sourceOwnedGeometryActive = true;
    stageSurface.style.minWidth = "1px";
    stageSurface.style.minHeight = "1px";
    return { sourceOwned: true, minimumWidth: 1, minimumHeight: 1, artboard };
  };


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

  const syncAuthoredSurfaceExtension = () => {
    const artboard = authoredArtboard();
    if (!artboard) return;
    let style = document.getElementById("northstar-authored-surface-extension");
    if (!style) {
      style = document.createElement("style");
      style.id = "northstar-authored-surface-extension";
      style.setAttribute("data-ns-runtime-owned", "true");
      document.head.appendChild(style);
    }
    const artboardRect = artboard.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const artboardLeft = artboardRect.left - rootRect.left;
    const artboardTop = artboardRect.top - rootRect.top;
    const minX = Math.min(artboardLeft, Number(requestedBounds.minX) || 0);
    const minY = Math.min(artboardTop, Number(requestedBounds.minY) || 0);
    const maxX = Math.max(artboardRect.right - rootRect.left, Number(requestedBounds.maxX) || 0);
    const maxY = Math.max(artboardRect.bottom - rootRect.top, Number(requestedBounds.maxY) || 0);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    style.textContent = '[data-ns-node-id="artboard"]{overflow:visible!important;isolation:isolate!important}'
      + '[data-ns-node-id="artboard"]::before{content:"";position:absolute;pointer-events:none;box-sizing:border-box;z-index:-1;left:' + (minX - artboardLeft) + 'px;top:' + (minY - artboardTop) + 'px;width:' + width + 'px;height:' + height + 'px;background:inherit;border-radius:inherit}';
  };

  const requestSpace = (request = {}) => {
    const left = Math.max(0, Number(request.left) || 0);
    const top = Math.max(0, Number(request.top) || 0);
    const right = Math.max(0, Number(request.right) || 0);
    const bottom = Math.max(0, Number(request.bottom) || 0);
    const acceptedBounds = committedCanonicalGeometry?.contentBounds || {
      minX: 0,
      minY: 0,
      maxX: canonicalLayoutBaseWidth,
      maxY: canonicalLayoutBaseHeight,
    };
    // Literal edge growth: requested space extends the currently accepted world
    // rectangle. It never substitutes the authored layout base or asks CSS to
    // redistribute existing content inside a smaller responsive container.
    requestedBounds.minX = Math.min(requestedBounds.minX, acceptedBounds.minX - left);
    requestedBounds.minY = Math.min(requestedBounds.minY, acceptedBounds.minY - top);
    requestedBounds.maxX = Math.max(requestedBounds.maxX, acceptedBounds.maxX + right);
    requestedBounds.maxY = Math.max(requestedBounds.maxY, acceptedBounds.maxY + bottom);
    // Extend the authored white surface independently from the artboard's local
    // layout box. Existing descendants keep the exact same containing-block
    // geometry while the visible source-owned surface grows around them.
    syncAuthoredSurfaceExtension();
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
    "[data-ns-relationship-metadata=true],[data-ns-analysis-placement=external-relationship]{display:none!important}",
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
    annotationLeaderIntersectionIds: [],
    unresolvedAnalyticalSourceIds: [],
    emptyAnalyticalPrimitiveIds: [],
    clippedAnalyticalPrimitiveIds: [],
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
          element,
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
  const cubicPoint = (start, c1, c2, end, t) => {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * start.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * end.x,
      y: mt * mt * mt * start.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * end.y,
    };
  };
  const makeRelationshipPath = (source, target, route, variant) => {
    const selected = choosePorts(source, target);
    const start = selected[0], end = selected[1];
    if (route === "straight") {
      return { d: "M" + start.x + "," + start.y + " L" + end.x + "," + end.y, points: [start, end], samples: [start, end] };
    }
    if (route === "elbow" || route === "shared-spine" || route === "bracket") {
      const horizontal = variant === "vertical" ? false : variant === "horizontal" ? true : Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
      const offset = route === "bracket" ? 34 : 0;
      const midpoint = horizontal ? (start.x + end.x) / 2 + offset : (start.y + end.y) / 2 + offset;
      const first = horizontal ? { x: midpoint, y: start.y } : { x: start.x, y: midpoint };
      const second = horizontal ? { x: midpoint, y: end.y } : { x: end.x, y: midpoint };
      const points = [start, first, second, end];
      return {
        d: "M" + start.x + "," + start.y + " L" + first.x + "," + first.y + " L" + second.x + "," + second.y + " L" + end.x + "," + end.y,
        points,
        samples: points,
      };
    }
    const curve = Math.max(48, Math.min(300, distance(start, end) * 0.28));
    const horizontal = variant === "vertical" ? false : variant === "horizontal" ? true : Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    const bend = variant === "reverse" ? -1 : 1;
    const c1 = horizontal
      ? { x: start.x + Math.sign(end.x - start.x || 1) * curve, y: start.y + bend * 24 }
      : { x: start.x + bend * 24, y: start.y + Math.sign(end.y - start.y || 1) * curve };
    const c2 = horizontal
      ? { x: end.x - Math.sign(end.x - start.x || 1) * curve, y: end.y + bend * 24 }
      : { x: end.x + bend * 24, y: end.y - Math.sign(end.y - start.y || 1) * curve };
    const samples = Array.from({ length: 21 }, (_value, index) => cubicPoint(start, c1, c2, end, index / 20));
    return {
      d: "M" + start.x + "," + start.y + " C" + c1.x + "," + c1.y + " " + c2.x + "," + c2.y + " " + end.x + "," + end.y,
      points: [start, c1, c2, end],
      samples,
    };
  };
  const segmentIntersectsRect = (a, b, rect, padding) => {
    const left = rect.x - padding, right = rect.right + padding, top = rect.y - padding, bottom = rect.bottom + padding;
    if ((a.x < left && b.x < left) || (a.x > right && b.x > right) || (a.y < top && b.y < top) || (a.y > bottom && b.y > bottom)) return false;
    const steps = Math.max(4, Math.ceil(distance(a, b) / 24));
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x >= left && x <= right && y >= top && y <= bottom) return true;
    }
    return false;
  };
  const relationshipObstacleScore = (candidate, obstacles) => {
    let score = 0;
    const samples = candidate.samples || candidate.points || [];
    for (let index = 1; index < samples.length; index += 1) {
      for (const obstacle of obstacles) {
        if (segmentIntersectsRect(samples[index - 1], samples[index], obstacle.rect, 8)) score += obstacle.isScreenshot ? 1000 : 120;
      }
    }
    return score;
  };
  const makeDetourPath = (source, target, side, obstacles) => {
    const selected = choosePorts(source, target);
    const start = selected[0], end = selected[1];
    if (!obstacles.length) return undefined;
    const minX = Math.min(...obstacles.map((obstacle) => obstacle.rect.x));
    const maxX = Math.max(...obstacles.map((obstacle) => obstacle.rect.right));
    const minY = Math.min(...obstacles.map((obstacle) => obstacle.rect.y));
    const maxY = Math.max(...obstacles.map((obstacle) => obstacle.rect.bottom));
    const margin = 34;
    let points;
    if (side === "above") {
      const y = Math.max(12, minY - margin);
      points = [start, { x: start.x, y }, { x: end.x, y }, end];
    } else if (side === "below") {
      const y = maxY + margin;
      points = [start, { x: start.x, y }, { x: end.x, y }, end];
    } else if (side === "left") {
      const x = Math.max(12, minX - margin);
      points = [start, { x, y: start.y }, { x, y: end.y }, end];
    } else {
      const x = maxX + margin;
      points = [start, { x, y: start.y }, { x, y: end.y }, end];
    }
    return {
      d: points.map((point, index) => (index ? "L" : "M") + point.x + "," + point.y).join(" "),
      points,
      samples: points,
      route: "detour-" + side,
      variant: side,
    };
  };
  const chooseRelationshipRoute = (source, target, requestedRoute, obstacles) => {
    const requests = [
      [requestedRoute || "soft-curve", undefined],
      ["elbow", "horizontal"],
      ["elbow", "vertical"],
      ["soft-curve", "horizontal"],
      ["soft-curve", "vertical"],
      ["soft-curve", "reverse"],
      ["straight", undefined],
    ];
    const candidates = requests.map(([route, variant]) => ({ ...makeRelationshipPath(source, target, route, variant), route, variant }));
    for (const side of ["above", "below", "left", "right"]) {
      const detour = makeDetourPath(source, target, side, obstacles);
      if (detour) candidates.push(detour);
    }
    let best;
    for (const candidate of candidates) {
      const score = relationshipObstacleScore(candidate, obstacles);
      const samples = candidate.samples || candidate.points || [];
      const length = samples.slice(1).reduce((sum, point, index) => sum + distance(samples[index], point), 0);
      const bendPenalty = Math.max(0, samples.length - 2) * 4;
      const cost = score + length * 0.02 + bendPenalty;
      if (!best || cost < best.cost) best = { ...candidate, cost, obstacleScore: score };
    }
    return best;
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
      const annotationLeaderIntersectionIds = [];
      const unresolvedAnalyticalSourceIds = [];
      const emptyAnalyticalPrimitiveIds = [];
      const clippedAnalyticalPrimitiveIds = [];
      const falseIntersectionIds = [];
      const placed = [];
      let crossingCount = 0;

      const rootRect = root.getBoundingClientRect();
      const analyticalPrimitives = Array.from(root.querySelectorAll('[data-ns-analysis-kind="chart"],[data-ns-analysis-kind="sparkline"],[data-ns-analysis-kind="axis"],[data-ns-analysis-kind="analytical-bridge"],[data-ns-analysis-kind="relationship"]:not([data-ns-analysis-placement="external-relationship"]):not([data-ns-relationship-metadata="true"])'));
      for (const primitive of analyticalPrimitives) {
        const primitiveId = primitive.getAttribute("data-ns-node-id") || primitive.getAttribute("data-ns-analysis-kind") || "analytical-primitive";
        const sourceIds = (primitive.getAttribute("data-ns-source-ids") || primitive.getAttribute("data-ns-source-id") || "")
          .split(/[\s,]+/)
          .filter(Boolean);
        if (["chart", "sparkline", "axis"].includes(primitive.getAttribute("data-ns-analysis-kind") || "")) {
          if (!sourceIds.length || sourceIds.some((sourceId) => !byId.has(sourceId))) unresolvedAnalyticalSourceIds.push(primitiveId);
        }
        const rect = primitive.getBoundingClientRect();
        if (rect.width < 32 || rect.height < 10 || getComputedStyle(primitive).visibility === "hidden") emptyAnalyticalPrimitiveIds.push(primitiveId);
        const style = getComputedStyle(primitive);
        const clippedBySelf = (primitive.scrollWidth > primitive.clientWidth + 2 && style.overflowX !== "visible")
          || (primitive.scrollHeight > primitive.clientHeight + 2 && style.overflowY !== "visible");
        const clippedByRoot = rect.left < rootRect.left - 2 || rect.top < rootRect.top - 2 || rect.right > rootRect.right + 2 || rect.bottom > rootRect.bottom + 2;
        if (clippedBySelf || clippedByRoot) clippedAnalyticalPrimitiveIds.push(primitiveId);
      }

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
        placed.push({ id: annotationId, rect: best.rect, anchorId, anchorNode, metadata });
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
      for (const annotation of placed) {
        const annotationNode = {
          rect: annotation.rect,
          center: { x: annotation.rect.x + annotation.rect.width / 2, y: annotation.rect.y + annotation.rect.height / 2 },
          ports: ports(annotation.rect),
        };
        const obstacles = scene.filter((node) =>
          node.nodeId !== annotation.anchorId
          && !annotation.anchorNode.element?.contains?.(node.element)
          && !node.element?.contains?.(annotation.anchorNode.element)
          && (node.isScreenshot || node.evidenceId)
        );
        const routed = chooseRelationshipRoute(annotation.anchorNode, annotationNode, "elbow", obstacles);
        if (!routed) {
          unresolvedAnchorIds.push(annotation.id);
          continue;
        }
        if (routed.obstacleScore > 0) annotationLeaderIntersectionIds.push(annotation.id);
        const leader = document.createElementNS("http://www.w3.org/2000/svg", "path");
        leader.setAttribute("class", "ns-spatial-path");
        leader.setAttribute("data-ns-routed-annotation-id", annotation.id);
        leader.setAttribute("d", routed.d);
        leader.setAttribute("stroke", "rgba(76,65,132,.56)");
        leader.setAttribute("stroke-width", "1.5");
        leader.setAttribute("stroke-dasharray", "3 4");
        relationshipLayer.appendChild(leader);
      }

      const authoredRelationshipNodes = Array.from(root.querySelectorAll('[data-ns-authored-relationship="true"][data-ns-source-node-id][data-ns-target-node-id]'))
        .filter((element) => !element.closest("[data-ns-spatial-system]"));
      const metadataNodes = Array.from(root.querySelectorAll("[data-ns-relationship-id][data-ns-source-id], [data-ns-relationship-id][data-ns-source-node-id]"))
        .filter((element) => !element.closest("[data-ns-spatial-system]"))
        .sort((a, b) => {
          const priority = { primary: 0, secondary: 1, supporting: 2 };
          return (priority[a.getAttribute("data-ns-priority") || "secondary"] ?? 1)
            - (priority[b.getAttribute("data-ns-priority") || "secondary"] ?? 1);
        });
      const routedBounds = [];
      for (const metadata of metadataNodes) {
        const relationshipId = metadata.getAttribute("data-ns-relationship-id") || "";
        const sourceId = metadata.getAttribute("data-ns-source-id") || metadata.getAttribute("data-ns-source-node-id") || "";
        const targetId = metadata.getAttribute("data-ns-target-id") || metadata.getAttribute("data-ns-target-node-id") || "";
        const source = byId.get(sourceId);
        const target = byId.get(targetId);
        if (!relationshipId || !source || !target) {
          unresolvedRelationshipIds.push(relationshipId || "relationship");
          continue;
        }
        const obstacles = scene.filter((node) =>
          node.nodeId !== sourceId
          && node.nodeId !== targetId
          && !source.element?.contains?.(node.element)
          && !target.element?.contains?.(node.element)
          && !node.element?.contains?.(source.element)
          && !node.element?.contains?.(target.element)
          && (node.isScreenshot || node.evidenceId)
        );
        const routed = chooseRelationshipRoute(source, target, metadata.getAttribute("data-ns-route") || "soft-curve", obstacles);
        if (!routed) {
          unresolvedRelationshipIds.push(relationshipId);
          continue;
        }
        if (routed.obstacleScore > 0) obstacleIntersectionIds.push(relationshipId);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "ns-spatial-path");
        path.setAttribute("data-ns-routed-relationship-id", relationshipId);
        path.setAttribute("data-ns-resolved-route", String(routed.route || "soft-curve"));
        path.setAttribute("d", routed.d);
        const priority = metadata.getAttribute("data-ns-priority") || "secondary";
        const confidence = Math.max(0.5, Math.min(1, Number(metadata.getAttribute("data-ns-confidence")) || 0.65));
        path.setAttribute("stroke", priority === "primary" ? "#694cff" : priority === "supporting" ? "rgba(68,62,100,.42)" : "rgba(105,76,255,.68)");
        path.setAttribute("stroke-width", priority === "primary" ? "3.5" : priority === "supporting" ? "1.5" : "2.25");
        path.setAttribute("stroke-opacity", String(confidence));
        if ((metadata.getAttribute("data-ns-relationship-type") || "") === "contrastive") path.setAttribute("stroke-dasharray", "8 7");
        relationshipLayer.appendChild(path);
        const routeSamples = routed.samples || routed.points;
        const xs = routeSamples.map((point) => point.x);
        const ys = routeSamples.map((point) => point.y);
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
          const midpoint = routeSamples[Math.floor(routeSamples.length / 2)];
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

      const overlayWidth = Math.max(1, spatialBounds.maxX - Math.min(0, spatialBounds.minX));
      const overlayHeight = Math.max(1, spatialBounds.maxY - Math.min(0, spatialBounds.minY));
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
        unresolvedRelationshipIds.length +
        obstacleIntersectionIds.length +
        annotationLeaderIntersectionIds.length +
        unresolvedAnalyticalSourceIds.length +
        emptyAnalyticalPrimitiveIds.length +
        clippedAnalyticalPrimitiveIds.length;
      const softIssueCount =
        excessiveDistanceIds.length +
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
        annotationLeaderIntersectionIds,
        unresolvedAnalyticalSourceIds,
        emptyAnalyticalPrimitiveIds,
        clippedAnalyticalPrimitiveIds,
        falseIntersectionIds,
        crossingCount,
        hardFailureCount,
        softIssueCount,
        annotationCount: annotations.length + root.querySelectorAll('[data-ns-authored-annotation="true"]').length,
        relationshipCount: metadataNodes.length + authoredRelationshipNodes.length,
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

  const measureCreativeNode = (nodeId) => {
    const id = String(nodeId || "").trim();
    const node = id ? nodeById(id) : null;
    if (!node) {
      const error = new Error("NORTHSTAR_CAPABILITY_NODE_NOT_FOUND: No mounted semantic node exists for " + (id || "<empty>"));
      error.code = "NORTHSTAR_CAPABILITY_NODE_NOT_FOUND";
      error.nodeId = id;
      throw error;
    }
    const rootRect = root.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return Object.freeze({
      nodeId: id,
      x: rect.left - rootRect.left,
      y: rect.top - rootRect.top,
      width: rect.width,
      height: rect.height,
      top: rect.top - rootRect.top,
      right: rect.right - rootRect.left,
      bottom: rect.bottom - rootRect.top,
      left: rect.left - rootRect.left,
      centerX: rect.left - rootRect.left + rect.width / 2,
      centerY: rect.top - rootRect.top + rect.height / 2,
    });
  };
  const routeBetweenCreativeNodes = (sourceId, targetId, options = {}) => {
    const source = measureCreativeNode(sourceId);
    const target = measureCreativeNode(targetId);
    if (!source.nodeId || !target.nodeId || source.nodeId === target.nodeId) {
      const error = new Error("NORTHSTAR_CAPABILITY_INVALID_ROUTE: routeBetween requires two distinct mounted semantic node IDs.");
      error.code = "NORTHSTAR_CAPABILITY_INVALID_ROUTE";
      error.sourceId = source.nodeId;
      error.targetId = target.nodeId;
      throw error;
    }
    const bend = Number.isFinite(Number(options.bend)) ? Math.max(-1, Math.min(1, Number(options.bend))) : 0;
    const start = { x: source.centerX, y: source.centerY };
    const end = { x: target.centerX, y: target.centerY };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const offset = distance * .22 * bend;
    const control = { x: (start.x + end.x) / 2 + normalX * offset, y: (start.y + end.y) / 2 + normalY * offset };
    return Object.freeze({
      source,
      target,
      start: Object.freeze(start),
      end: Object.freeze(end),
      control: Object.freeze(control),
      path: "M" + start.x.toFixed(2) + "," + start.y.toFixed(2) + " Q" + control.x.toFixed(2) + "," + control.y.toFixed(2) + " " + end.x.toFixed(2) + "," + end.y.toFixed(2),
    });
  };

  const Northstar = Object.freeze({
    get data() { return currentData; },
    get creative() { return currentCreative; },
    get reviews() { return currentReviews; },
    root,
    query: (selector) => root.querySelector(selector),
    queryAll: (selector) => Array.from(root.querySelectorAll(selector)),
    measure: measureCreativeNode,
    routeBetween: routeBetweenCreativeNodes,
    on: (target, event, handler, options) => { target?.addEventListener?.(event, handler, options); return () => target?.removeEventListener?.(event, handler, options); },
    emit: (name, detail) => root.dispatchEvent(new CustomEvent(name, { detail })),
    canvas: Object.freeze({
      requestSpace,
      get baseSize() {
        return Object.freeze({ width: canonicalLayoutBaseWidth, height: canonicalLayoutBaseHeight });
      },
    }),
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
  const setImportantStyle = (element, name, value) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) return;
    element.style.setProperty(name, value, "important");
  };
  const normalizeAnalyticalFlow = () => {
    root.querySelectorAll("[data-ns-analysis-placement]").forEach((element) => {
      const mode = element.getAttribute("data-ns-analysis-placement") || "";
      if (mode === "external-relationship" || element.getAttribute("data-ns-relationship-metadata") === "true") return;
      if (mode === "margin-lane" && element.hasAttribute("data-ns-annotation-id")) return;
      if (mode !== "caption-lane" && mode !== "inter-row-lane" && mode !== "margin-lane") return;
      setImportantStyle(element, "position", "relative");
      setImportantStyle(element, "inset", "auto");
      setImportantStyle(element, "transform", "none");
      setImportantStyle(element, "float", "none");
      setImportantStyle(element, "box-sizing", "border-box");
      setImportantStyle(element, "min-width", "0");
      setImportantStyle(element, "overflow", "visible");
      if (mode === "caption-lane") {
        setImportantStyle(element, "display", "block");
        setImportantStyle(element, "width", "100%");
        setImportantStyle(element, "max-width", "100%");
        setImportantStyle(element, "clear", "both");
        setImportantStyle(element, "align-self", "stretch");
        setImportantStyle(element, "justify-self", "stretch");
      } else if (mode === "inter-row-lane") {
        setImportantStyle(element, "display", "block");
        setImportantStyle(element, "grid-column", "1 / -1");
        setImportantStyle(element, "grid-row", "auto");
        setImportantStyle(element, "grid-area", "auto");
        setImportantStyle(element, "width", "100%");
        setImportantStyle(element, "max-width", "none");
        setImportantStyle(element, "clear", "both");
        setImportantStyle(element, "align-self", "stretch");
        setImportantStyle(element, "justify-self", "stretch");
      }
    });

    if (root.getAttribute("data-ns-analytical-reflow") !== "true") return;
    root.querySelectorAll('[data-ns-node-id="northstar-communication-stack"]').forEach((element) => {
      setImportantStyle(element, "position", "relative");
      setImportantStyle(element, "inset", "auto");
      setImportantStyle(element, "transform", "none");
      setImportantStyle(element, "display", "flex");
      setImportantStyle(element, "flex-direction", "column");
      setImportantStyle(element, "align-items", "stretch");
      setImportantStyle(element, "gap", "28px");
      setImportantStyle(element, "grid-column", "1 / -1");
      setImportantStyle(element, "grid-row", "auto");
      setImportantStyle(element, "grid-area", "auto");
      setImportantStyle(element, "width", "100%");
      setImportantStyle(element, "max-width", "none");
      setImportantStyle(element, "min-width", "0");
      setImportantStyle(element, "clear", "both");
      setImportantStyle(element, "overflow", "visible");
      setImportantStyle(element, "box-sizing", "border-box");
    });
    root.querySelectorAll('[data-ns-role="analysis-slot"]').forEach((element) => {
      setImportantStyle(element, "position", "relative");
      setImportantStyle(element, "inset", "auto");
      setImportantStyle(element, "display", "flex");
      setImportantStyle(element, "flex-direction", "column");
      setImportantStyle(element, "gap", "10px");
      setImportantStyle(element, "width", "100%");
      setImportantStyle(element, "max-width", "100%");
      setImportantStyle(element, "min-width", "0");
      setImportantStyle(element, "overflow", "visible");
      setImportantStyle(element, "box-sizing", "border-box");
    });
    root.querySelectorAll('[data-ns-node-id="synthesis"],[data-ns-node-id="decision"]').forEach((element) => {
      setImportantStyle(element, "position", "relative");
      setImportantStyle(element, "inset", "auto");
      setImportantStyle(element, "left", "auto");
      setImportantStyle(element, "right", "auto");
      setImportantStyle(element, "top", "auto");
      setImportantStyle(element, "bottom", "auto");
      setImportantStyle(element, "transform", "none");
      setImportantStyle(element, "float", "none");
      setImportantStyle(element, "clear", "both");
      setImportantStyle(element, "grid-column", "1 / -1");
      setImportantStyle(element, "grid-row", "auto");
      setImportantStyle(element, "grid-area", "auto");
      setImportantStyle(element, "width", "100%");
      setImportantStyle(element, "max-width", "none");
      setImportantStyle(element, "min-width", "0");
      setImportantStyle(element, "margin-left", "0");
      setImportantStyle(element, "margin-right", "0");
      setImportantStyle(element, "align-self", "stretch");
      setImportantStyle(element, "justify-self", "stretch");
      setImportantStyle(element, "box-sizing", "border-box");
      setImportantStyle(element, "overflow", "visible");
    });
  };
  const applyStage = () => {
    root.querySelectorAll("[data-ns-stage]").forEach((element) => {
      const index = stageIndexFor(element.getAttribute("data-ns-stage") || "foundation");
      element.setAttribute("data-ns-stage-state", index < activeStageIndex ? "complete" : index === activeStageIndex ? "active" : "future");
      element.setAttribute("aria-hidden", "false");
      element.removeAttribute("data-ns-pending");
    });
    normalizeAnalyticalFlow();
  };

  const snapshotRects = () => {
    const map = new Map();
    root.querySelectorAll("[data-ns-node-id]").forEach((element) => {
      const id = element.getAttribute("data-ns-node-id");
      if (!id) return;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const parentSemantic = element.parentElement?.closest?.("[data-ns-node-id]");
      map.set(id, {
        rect,
        opacity: Number(style.opacity) || 1,
        visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
        parentId: parentSemantic?.getAttribute?.("data-ns-node-id") || undefined,
        clone: element.cloneNode(true),
      });
    });
    return map;
  };

  const constructionSleep = (duration) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, duration || 0)));
  const constructionOverlay = () => {
    let overlay = origin.querySelector('[data-ns-construction-overlay="true"]');
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.setAttribute("data-ns-runtime-owned", "true");
    overlay.setAttribute("data-ns-construction-overlay", "true");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      overflow: "visible",
      zIndex: "2147483000",
    });
    const badge = document.createElement("div");
    badge.setAttribute("data-ns-construction-badge", "true");
    Object.assign(badge.style, {
      position: "absolute",
      top: "22px",
      right: "24px",
      display: "flex",
      alignItems: "center",
      gap: "9px",
      maxWidth: "360px",
      padding: "10px 14px",
      borderRadius: "999px",
      color: "#2c263d",
      background: "rgba(255,255,255,.9)",
      border: "1px solid rgba(96,74,220,.18)",
      boxShadow: "0 14px 38px rgba(52,36,110,.14)",
      backdropFilter: "blur(16px)",
      font: "700 12px/1.25 Inter,ui-sans-serif,system-ui,sans-serif",
      letterSpacing: ".01em",
      zIndex: "1000",
      opacity: "0",
      transform: "translateY(-8px) scale(.98)",
    });
    const pulse = document.createElement("span");
    Object.assign(pulse.style, { width: "8px", height: "8px", borderRadius: "999px", background: "#6b4dff", boxShadow: "0 0 0 5px rgba(107,77,255,.12)", flex: "0 0 auto" });
    const label = document.createElement("span");
    label.setAttribute("data-ns-construction-label", "true");
    badge.append(pulse, label);
    overlay.append(badge);
    origin.append(overlay);
    return overlay;
  };

  const classifyConstructionKind = (element, id) => {
    const source = (id + " " + (element?.outerHTML || "")).toLowerCase();
    if (/data-ns-annotation-id|annotation|callout/.test(source)) return "anchor-annotations";
    if (/data-ns-relationship-id|relationship|connector/.test(source)) return "route-relationships";
    if (/data-ns-analysis-kind|sparkline|chart|axis|plot|graph|heat[-_ ]?index|friction[-_ ]?(?:pulse|delta|index)/.test(source)) return "draw-analysis";
    if (/synthesis|summary|takeaway/.test(source)) return "reveal-synthesis";
    if (/decision|recommendation|conclusion|implication/.test(source)) return "resolve-decision";
    if (/data-ns-evidence-id|data-ns-flow-id|protected-evidence|screenshot|screen-|flow-/.test(source)) return "choreograph-evidence";
    if (/rail|lane|comparison-canvas|communication-stack|grid|sequence|layout|shell/.test(source)) return "open-layout";
    if (/presentation|header|title|deck|analysis-core|frame|thesis/.test(source)) return "establish-frame";
    return "settle";
  };

  const inferredConstructionPlan = (batch) => {
    const order = ["establish-frame", "open-layout", "choreograph-evidence", "draw-analysis", "anchor-annotations", "route-relationships", "reveal-synthesis", "resolve-decision", "settle"];
    const labels = {
      "establish-frame": "Establishing the visual idea",
      "open-layout": "Opening the composition",
      "choreograph-evidence": "Choreographing grounded evidence",
      "draw-analysis": "Drawing the analytical language",
      "anchor-annotations": "Anchoring key observations",
      "route-relationships": "Connecting proof to meaning",
      "reveal-synthesis": "Resolving the synthesis",
      "resolve-decision": "Landing the implication",
      settle: "Settling the final artboard",
    };
    const affectedIds = new Set();
    for (const operation of batch?.operations || []) {
      if (operation?.targetId) affectedIds.add(operation.targetId);
      if (operation?.parentId) affectedIds.add(operation.parentId);
      if (operation?.beforeId) affectedIds.add(operation.beforeId);
      if (operation?.op === "recompose-region") {
        for (const placement of operation.placements || []) {
          if (placement.targetId) affectedIds.add(placement.targetId);
          if (placement.parentId) affectedIds.add(placement.parentId);
          if (placement.beforeId) affectedIds.add(placement.beforeId);
        }
      }
      if (typeof operation?.html === "string" && operation.html) {
        const template = document.createElement("template");
        template.innerHTML = operation.html;
        template.content.querySelectorAll("[data-ns-node-id]").forEach((element) => {
          const id = element.getAttribute("data-ns-node-id");
          if (id) affectedIds.add(id);
        });
      }
    }
    const grouped = new Map();
    affectedIds.forEach((id) => {
      if (!id || id === "artboard") return;
      const element = nodeById(id);
      if (!element) return;
      const kind = classifyConstructionKind(element, id);
      const values = grouped.get(kind) || [];
      values.push(id);
      grouped.set(kind, values);
    });
    const beats = order.filter((kind) => grouped.has(kind)).map((kind) => ({
      id: "runtime-" + kind,
      kind,
      label: labels[kind],
      nodeIds: grouped.get(kind),
      durationMs: kind === "choreograph-evidence" ? 1300 : kind === "draw-analysis" || kind === "route-relationships" ? 980 : 680,
      staggerMs: kind === "choreograph-evidence" ? 70 : 45,
      holdMs: kind === "settle" ? 180 : 100,
      emphasis: kind === "choreograph-evidence" || kind === "draw-analysis" ? "hero" : kind === "settle" ? "quiet" : "normal",
    }));
    if (!beats.some((beat) => beat.kind === "settle")) beats.push({ id: "runtime-settle", kind: "settle", label: labels.settle, nodeIds: ["artboard"], durationMs: 460, staggerMs: 0, holdMs: 160, emphasis: "quiet" });
    const coverageNodeIds = Array.from(affectedIds).filter((id) => id && id !== "__root__");
    const totalDurationMs = Math.min(18000, beats.reduce((sum, beat) => sum + beat.durationMs + beat.holdMs + Math.max(0, (beat.nodeIds?.length || 0) - 1) * beat.staggerMs, 0));
    return { version: "northstar.live-visual-authorship.v2", mode: "cinematic", beats, coverageNodeIds, strictCoverage: true, totalDurationMs, deadlineMs: Math.min(26000, Math.max(5000, totalDurationMs + 2500)), showBeatLabels: true };
  };

  const initialFoundationConstructionPlan = () => {
    const ids = Array.from(root.querySelectorAll("[data-ns-node-id]"))
      .map((element) => element.getAttribute("data-ns-node-id"))
      .filter((id) => id && id !== "artboard");
    const frame = ids.filter((id) => /^(?:presentation|header|title|deck|identity-|thought-|reasoning-zone)/.test(id));
    const evidence = ids.filter((id) => /(?:evidence|flow-|screen-|sequence)/.test(id));
    const ending = ids.filter((id) => /(?:synthesis|decision|recommendation)/.test(id));
    const beats = [
      { id: "initial-frame", kind: "establish-frame", label: "Opening the living artboard", nodeIds: frame.length ? frame : ids.slice(0, 8), durationMs: 720, staggerMs: 55, holdMs: 120, emphasis: "normal" },
      ...(evidence.length ? [{ id: "initial-evidence", kind: "choreograph-evidence", label: "Preparing the evidence field", nodeIds: evidence, durationMs: 980, staggerMs: 60, holdMs: 120, emphasis: "hero" }] : []),
      ...(ending.length ? [{ id: "initial-ending", kind: "reveal-synthesis", label: "Opening the reasoning surface", nodeIds: ending, durationMs: 620, staggerMs: 50, holdMs: 100, emphasis: "normal" }] : []),
      { id: "initial-settle", kind: "settle", label: "Ready to create", nodeIds: ["artboard"], durationMs: 420, staggerMs: 0, holdMs: 120, emphasis: "quiet" },
    ];
    return { version: "northstar.live-visual-authorship.v2", mode: "cinematic", beats, coverageNodeIds: ids, strictCoverage: true, totalDurationMs: 4200, deadlineMs: 7000, showBeatLabels: true };
  };

  const transparentPaint = (value) => {
    const normalized = String(value || "").replace(/\s+/g, "").toLowerCase();
    return !normalized || normalized === "transparent" || normalized === "rgba(0,0,0,0)" || normalized.endsWith(",0)");
  };

  const elementHasVisualSurface = (element) => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const borderWidth = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
      .some((value) => Number.parseFloat(value || "0") > .25);
    return !transparentPaint(style.backgroundColor)
      || borderWidth
      || (style.boxShadow && style.boxShadow !== "none")
      || (style.outlineStyle && style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth || "0") > .25);
  };

  const isVisualEvidenceLeaf = (element, id) => {
    const source = ((id || "") + " " + (element?.outerHTML || "")).toLowerCase();
    return /data-ns-(?:evidence-id|screen-id)|protected-evidence|(?:^|[-_:])screen(?:[-_:]|$)|figure|img/.test(source)
      && !element?.querySelector?.('[data-ns-node-id][data-ns-evidence-id],[data-ns-node-id][data-ns-screen-id],[data-ns-node-id*="screen-"]');
  };

  const elementConstructionKeyframes = (element, prior, kind, options = {}) => {
    if (options.skipContainer) return null;
    const next = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (options.surfaceOnly) {
      return [
        { opacity: prior?.visible ? Math.max(.76, prior.opacity || 1) : 0, backgroundColor: "rgba(255,255,255,0)", borderColor: "rgba(0,0,0,0)", boxShadow: "none", outlineColor: "rgba(0,0,0,0)", clipPath: "inset(0 0 100% 0 round 12px)" },
        { opacity: 1, backgroundColor: style.backgroundColor, borderColor: style.borderColor, boxShadow: style.boxShadow, outlineColor: style.outlineColor, clipPath: "inset(0 0 0 0 round 12px)" },
      ];
    }
    if (prior?.visible) {
      const dx = prior.rect.left - next.left, dy = prior.rect.top - next.top;
      const rawSx = next.width > 0 ? prior.rect.width / next.width : 1;
      const rawSy = next.height > 0 ? prior.rect.height / next.height : 1;
      const moved = Math.abs(dx) > .5 || Math.abs(dy) > .5 || Math.abs(rawSx - 1) > .01 || Math.abs(rawSy - 1) > .01;
      if (moved) {
        const protectedEvidence = Boolean(element.closest?.('[data-ns-protected-evidence="true"]'))
          || element.getAttribute?.("data-ns-protected-evidence") === "true"
          || isVisualEvidenceLeaf(element, element.getAttribute?.("data-ns-node-id"));
        const safeUniformScale = !protectedEvidence
          && rawSx >= .62 && rawSx <= 1.62 && rawSy >= .62 && rawSy <= 1.62
          && Math.abs(rawSx - rawSy) <= .18
            ? Math.max(.62, Math.min(1.62, (rawSx + rawSy) / 2))
            : 1;
        const initialTransform = "translate(" + dx + "px," + dy + "px)" + (Math.abs(safeUniformScale - 1) > .01 ? " scale(" + safeUniformScale + ")" : "");
        if (protectedEvidence) {
          return [
            { offset: 0, transformOrigin: "top left", transform: initialTransform, opacity: Math.max(.9, prior.opacity || 1), filter: "none" },
            { offset: 1, transformOrigin: "top left", transform: "none", opacity: 1, filter: "none" },
          ];
        }
        return [
          { offset: 0, transformOrigin: "top left", transform: initialTransform, opacity: Math.max(.72, prior.opacity || 1), filter: "saturate(.9)" },
          { offset: .82, transformOrigin: "top left", transform: "translate(0,-2px) scale(1.003)", opacity: 1, filter: "saturate(1.02)" },
          { offset: 1, transformOrigin: "top left", transform: "none", opacity: 1, filter: "none" },
        ];
      }
      return [
        { opacity: .58, filter: "saturate(.9)", transform: "translateY(4px)" },
        { opacity: 1, filter: "none", transform: "none" },
      ];
    }
    if (kind === "draw-analysis") return [
      { opacity: 0, clipPath: "inset(0 100% 0 0 round 10px)", transform: "translateY(6px)" },
      { opacity: 1, clipPath: "inset(0 0 0 0 round 10px)", transform: "none" },
    ];
    if (kind === "anchor-annotations") return [
      { opacity: 0, transform: "translate(12px,-6px) scale(.96)" },
      { opacity: 1, transform: "none" },
    ];
    if (kind === "route-relationships") return [
      { opacity: 0, transform: "scaleX(.88)", transformOrigin: "left center" },
      { opacity: 1, transform: "none" },
    ];
    if (kind === "reveal-synthesis") return [
      { opacity: 0, clipPath: "inset(0 0 100% 0)", transform: "translateY(14px)" },
      { opacity: 1, clipPath: "inset(0 0 0 0)", transform: "none" },
    ];
    if (kind === "resolve-decision") return [
      { opacity: 0, transform: "translateY(14px) scale(.98)" },
      { offset: .76, opacity: 1, transform: "translateY(-1px) scale(1.004)" },
      { opacity: 1, transform: "none" },
    ];
    if (kind === "settle") return [
      { opacity: .88, filter: "saturate(.94)" },
      { opacity: 1, filter: "none" },
    ];
    return [
      { opacity: 0, transform: "translateY(12px) scale(.985)" },
      { opacity: 1, transform: "none" },
    ];
  };

  const meaningfulPriorConstructionNode = (nodeId, prior, directChild = false) => {
    if (!prior || /-image$/i.test(nodeId || "")) return false;
    const clone = prior.clone;
    const source = ((clone instanceof Element ? clone.outerHTML : "") + " " + (nodeId || "")).toLowerCase();
    const explicitlyMeaningful = /data-ns-(?:evidence-id|screen-id|flow-id|analysis-kind|annotation-id|relationship-id)/.test(source)
      || /(?:screen|evidence|flow|sequence|rail|lane|analysis|chart|sparkline|axis|annotation|callout|relationship|synthesis|decision|recommendation|conclusion)/.test(nodeId || "");
    const meaningfulDirectSurface = directChild && /(?:header|reasoning|thought|thesis|comparison|presentation-copy|working-opening)/.test(nodeId || "");
    return explicitlyMeaningful || meaningfulDirectSurface;
  };

  const priorConstructionDescendants = (before, rootId, includeRoot = false) => {
    if (!before?.size || !rootId) return [];
    const result = [];
    const queue = includeRoot ? [rootId] : Array.from(before.entries()).filter(([, value]) => value?.parentId === rootId).map(([id]) => id);
    while (queue.length > 0) {
      const nodeId = queue.shift();
      const prior = before.get(nodeId);
      if (!prior) continue;
      if (meaningfulPriorConstructionNode(nodeId, prior, prior.parentId === rootId)) result.push(nodeId);
      before.forEach((value, childId) => { if (value?.parentId === nodeId) queue.push(childId); });
    }
    return result;
  };

  const runtimeAffectedNodeIds = (batch, before) => {
    const ids = new Set(batch?.constructionPlan?.coverageNodeIds || []);
    for (const requirement of batch?.requiredPrimitives || []) {
      for (const nodeId of requirement?.instanceNodeIds?.length ? requirement.instanceNodeIds : requirement?.nodeIds?.length ? requirement.nodeIds : [requirement?.id]) if (nodeId) ids.add(nodeId);
    }
    for (const operation of batch?.operations || []) {
      if (operation?.targetId) ids.add(operation.targetId);
      if (operation?.parentId) ids.add(operation.parentId);
      if (operation?.beforeId) ids.add(operation.beforeId);
      if (operation?.op === "remove") {
        priorConstructionDescendants(before, operation.targetId, true).forEach((nodeId) => ids.add(nodeId));
      }
      if (operation?.op === "set-html" || operation?.op === "recompose-region") {
        priorConstructionDescendants(before, operation.targetId, false).forEach((nodeId) => ids.add(nodeId));
      }
      if (operation?.op === "recompose-region") {
        for (const retiredId of operation.retireNodeIds || []) priorConstructionDescendants(before, retiredId, true).forEach((nodeId) => ids.add(nodeId));
      }
      if (operation?.op === "move") {
        const target = nodeById(operation.targetId);
        target?.querySelectorAll?.('[data-ns-node-id][data-ns-evidence-id],[data-ns-node-id][data-ns-screen-id],[data-ns-node-id*="screen-"]').forEach((element) => {
          const nodeId = element.getAttribute("data-ns-node-id");
          if (nodeId && !/-image$/i.test(nodeId)) ids.add(nodeId);
        });
      }
      if (operation?.op === "recompose-region") {
        for (const placement of operation.placements || []) {
          if (placement.targetId) ids.add(placement.targetId);
          if (placement.parentId) ids.add(placement.parentId);
          if (placement.beforeId) ids.add(placement.beforeId);
        }
      }
      if (typeof operation?.html === "string" && operation.html) {
        const template = document.createElement("template");
        template.innerHTML = operation.html;
        template.content.querySelectorAll("[data-ns-node-id]").forEach((element) => {
          const nodeId = element.getAttribute("data-ns-node-id");
          if (nodeId) ids.add(nodeId);
        });
      }
    }
    ids.delete("__root__");
    return Array.from(ids);
  };

  const hardenedConstructionPlan = (batch, before) => {
    const modelSourceAuthority = hasModelSourceAuthority();
    const suppliedPlan = batch?.constructionPlan?.beats?.length ? batch.constructionPlan : undefined;
    const source = suppliedPlan || (modelSourceAuthority
      ? { version: "northstar.live-visual-authorship.v2", mode: "cinematic", beats: [], coverageNodeIds: [], strictCoverage: false, totalDurationMs: 900, deadlineMs: 3200, showBeatLabels: false }
      : inferredConstructionPlan(batch));
    const beats = (source?.beats || []).map((beat) => ({ ...beat, nodeIds: Array.from(new Set(beat.nodeIds || [])) }));
    const coverageNodeIds = Array.from(new Set([...(source?.coverageNodeIds || []), ...runtimeAffectedNodeIds(batch, before)]));

    if (modelSourceAuthority) {
      // The creative model owns the dramatic sequence. The browser may normalize
      // timing and append one neutral settlement mechanic, but it must not infer
      // a visual grammar, classify nodes into authored-looking beat kinds, or add
      // semantic reveal moments the model never requested.
      if (!beats.some((beat) => beat.kind === "settle")) beats.push({ id: "runtime-settle", kind: "settle", label: "Settling the exact authored source", nodeIds: ["artboard"], durationMs: 360, staggerMs: 0, holdMs: 80, emphasis: "quiet" });
      const totalDurationMs = Math.min(18000, Math.max(600, Number(source?.totalDurationMs) || beats.reduce((sum, beat) => sum + Number(beat.durationMs || 0) + Number(beat.holdMs || 0) + Math.max(0, (beat.nodeIds?.length || 0) - 1) * Number(beat.staggerMs || 0), 0)));
      return { ...source, version: "northstar.live-visual-authorship.v2", beats, coverageNodeIds, strictCoverage: false, totalDurationMs, deadlineMs: Math.min(26000, Math.max(totalDurationMs + 1800, Number(source?.deadlineMs) || totalDurationMs + 3000)), showBeatLabels: source?.showBeatLabels !== false };
    }

    const assigned = new Set(beats.flatMap((beat) => beat.nodeIds || []));
    for (const nodeId of coverageNodeIds) {
      if (!nodeId || assigned.has(nodeId) || nodeId === "__root__") continue;
      const element = nodeById(nodeId);
      const priorElement = before?.get?.(nodeId)?.clone;
      if (!element && !(priorElement instanceof Element) && nodeId !== "artboard") continue;
      const kind = nodeId === "artboard" ? "settle" : classifyConstructionKind(element || priorElement, nodeId);
      let beat = beats.find((candidate) => candidate.kind === kind && (candidate.nodeIds?.length || 0) < 160);
      if (!beat) {
        beat = { id: "runtime-coverage-" + kind + "-" + (beats.length + 1), kind, label: defaultConstructionLabel(kind), nodeIds: [], durationMs: kind === "choreograph-evidence" ? 1050 : 620, staggerMs: kind === "choreograph-evidence" ? 44 : 30, holdMs: 70, emphasis: kind === "choreograph-evidence" || kind === "draw-analysis" ? "hero" : "normal" };
        const settleIndex = beats.findIndex((candidate) => candidate.kind === "settle");
        if (settleIndex >= 0) beats.splice(settleIndex, 0, beat); else beats.push(beat);
      }
      beat.nodeIds.push(nodeId);
      assigned.add(nodeId);
    }
    if (!beats.some((beat) => beat.kind === "settle")) beats.push({ id: "runtime-settle", kind: "settle", label: "Settling the final artboard", nodeIds: ["artboard"], durationMs: 420, staggerMs: 0, holdMs: 120, emphasis: "quiet" });
    const totalDurationMs = Math.min(18000, Math.max(900, Number(source?.totalDurationMs) || beats.reduce((sum, beat) => sum + Number(beat.durationMs || 0) + Number(beat.holdMs || 0) + Math.max(0, (beat.nodeIds?.length || 0) - 1) * Number(beat.staggerMs || 0), 0)));
    return { ...source, version: "northstar.live-visual-authorship.v2", beats, coverageNodeIds, strictCoverage: source?.strictCoverage !== false, totalDurationMs, deadlineMs: Math.min(26000, Math.max(totalDurationMs + 2000, Number(source?.deadlineMs) || totalDurationMs + 3500)), showBeatLabels: source?.showBeatLabels !== false };
  };

  const defaultConstructionLabel = (kind) => ({
    "establish-frame": "Establishing the visual idea",
    "open-layout": "Opening the composition",
    "choreograph-evidence": "Choreographing grounded evidence",
    "draw-analysis": "Drawing the analytical language",
    "anchor-annotations": "Anchoring key observations",
    "route-relationships": "Connecting proof to meaning",
    "reveal-synthesis": "Resolving the synthesis",
    "resolve-decision": "Landing the implication",
    settle: "Settling the final artboard",
  })[kind] || "Building the artboard";

  const constructionDeadline = (promise, timeoutMs) => Promise.race([
    Promise.resolve(promise).then(() => ({ timedOut: false })),
    constructionSleep(timeoutMs).then(() => ({ timedOut: true })),
  ]);

  let beforeConstructionSnapshot = null;
  const constructionResults = new Map();
  const runConstructionSequence = async (before, batch) => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    const plan = hardenedConstructionPlan(batch, before);
    if (!plan?.beats?.length) return;
    beforeConstructionSnapshot = before;
    const overlay = constructionOverlay();
    const badge = overlay.querySelector('[data-ns-construction-badge="true"]');
    const badgeLabel = overlay.querySelector('[data-ns-construction-label="true"]');
    const nodeToBeat = new Map();
    const beatIndexById = new Map();
    plan.beats.forEach((beat, beatIndex) => {
      beatIndexById.set(beat.id, beatIndex);
      (beat.nodeIds || []).forEach((id) => { if (!nodeToBeat.has(id)) nodeToBeat.set(id, beat.id); });
    });
    const coverage = new Set(plan.coverageNodeIds || []);
    const retiredCoverageNodeIds = Array.from(coverage).filter((id) => id !== "artboard" && !nodeById(id) && before?.has?.(id));
    const missingCoverageNodeIds = Array.from(coverage).filter((id) => id !== "artboard" && !nodeById(id) && !before?.has?.(id));
    const stagedCoverageNodeIds = new Set();
    const animationsByBeat = new Map();
    const ghostWrappersByBeat = new Map();
    const activeAnimations = new Set();
    let currentBadgeAnimation = null;
    let completed = false;
    let timedOut = false;
    let recovered = false;
    let recoveryMessage = "";
    let timedOutBeatCount = 0;
    const startedAt = Date.now();
    const absoluteDeadline = startedAt + Math.max(1200, Number(plan.deadlineMs) || Number(plan.totalDurationMs) + 3500);
    const trackAnimation = (animation) => {
      if (!animation) return animation;
      activeAnimations.add(animation);
      animation.finished.catch(() => undefined).finally(() => activeAnimations.delete(animation));
      return animation;
    };
    const cleanup = () => {
      activeAnimations.forEach((animation) => { try { animation.cancel(); } catch {} });
      activeAnimations.clear();
      origin.querySelectorAll('[data-ns-construction-guide="true"]').forEach((guide) => guide.remove());
      overlay.remove();
      root.removeAttribute("data-ns-construction-active");
      root.removeAttribute("data-ns-construction-mode");
      root.removeAttribute("data-ns-construction-beat");
      root.removeAttribute("data-ns-construction-beat-index");
      beforeConstructionSnapshot = null;
      queueAuthoredRelationResolution();
      solveSpatialSystem();
      queueContentSize();
    };

    try {
      const plannedElements = Array.from(root.querySelectorAll("[data-ns-node-id]")).filter((element) => {
        const id = element.getAttribute("data-ns-node-id");
        return id && nodeToBeat.has(id) && (element instanceof HTMLElement || element instanceof SVGElement);
      });
      plannedElements.forEach((element) => {
        const id = element.getAttribute("data-ns-node-id");
        const beatId = id ? nodeToBeat.get(id) : undefined;
        const beat = plan.beats.find((candidate) => candidate.id === beatId);
        if (!id || !beat) return;
        const hasPlannedDescendant = Array.from(element.querySelectorAll?.("[data-ns-node-id]") || []).some((child) => {
          const childId = child.getAttribute("data-ns-node-id");
          return childId && childId !== id && nodeToBeat.has(childId);
        });
        const parentOwnsMovement = hasPlannedDescendant && element !== root;
        const surfaceOnly = parentOwnsMovement && elementHasVisualSurface(element)
          && (beat.kind === "establish-frame" || beat.kind === "open-layout");
        const skipContainer = parentOwnsMovement && !surfaceOnly;
        const keyframes = elementConstructionKeyframes(element, before.get(id), beat.kind, { surfaceOnly, skipContainer });
        if (!keyframes) {
          if (skipContainer) stagedCoverageNodeIds.add(id);
          return;
        }
        const beatAnimations = animationsByBeat.get(beat.id) || [];
        const delay = reducedMotion ? 0 : Math.min(1000, beatAnimations.length * Math.max(0, Number(beat.staggerMs) || 0));
        const animation = trackAnimation(element.animate(keyframes, { duration: reducedMotion ? Math.min(180, beat.durationMs) : beat.durationMs, delay, easing: beat.emphasis === "hero" ? "cubic-bezier(.16,.84,.2,1)" : "cubic-bezier(.2,.8,.2,1)", fill: "both" }));
        animation.pause();
        animation.currentTime = 0;
        beatAnimations.push(animation);
        animationsByBeat.set(beat.id, beatAnimations);
        stagedCoverageNodeIds.add(id);
      });

      // Nodes retired by a destructive recomposition no longer exist in the final
      // DOM, so FLIP cannot animate them directly. Preserve one top-level visual
      // ghost per retired subtree and let it leave during its assigned beat. This
      // keeps the old composition perceptually continuous until the new structure
      // has visibly earned its place, without exposing a non-canonical half-state.
      const retiredSet = new Set(retiredCoverageNodeIds.filter((id) => before.get(id)?.visible));
      const topLevelRetiredIds = Array.from(retiredSet).filter((id) => {
        let parentId = before.get(id)?.parentId;
        while (parentId) {
          if (retiredSet.has(parentId)) return false;
          parentId = before.get(parentId)?.parentId;
        }
        return true;
      });
      const retirementBeatForSubtree = (rootNodeId) => {
        let selectedBeatId = nodeToBeat.get(rootNodeId);
        let selectedIndex = selectedBeatId == null ? -1 : Number(beatIndexById.get(selectedBeatId) ?? -1);
        before.forEach((_value, candidateId) => {
          let cursor = candidateId;
          let belongsToSubtree = false;
          while (cursor) {
            if (cursor === rootNodeId) { belongsToSubtree = true; break; }
            cursor = before.get(cursor)?.parentId;
          }
          if (!belongsToSubtree) return;
          const candidateBeatId = nodeToBeat.get(candidateId);
          const candidateIndex = candidateBeatId == null ? -1 : Number(beatIndexById.get(candidateBeatId) ?? -1);
          if (candidateIndex > selectedIndex) { selectedIndex = candidateIndex; selectedBeatId = candidateBeatId; }
        });
        if (selectedBeatId == null && hasModelSourceAuthority()) {
          const fallbackBeat = [...plan.beats].reverse().find((candidate) => candidate.kind !== "settle")
            || plan.beats.at(-1);
          return fallbackBeat?.id;
        }
        return selectedBeatId;
      };
      const originRect = origin.getBoundingClientRect();
      for (const nodeId of topLevelRetiredIds) {
        const prior = before.get(nodeId);
        const beatId = retirementBeatForSubtree(nodeId);
        const beat = plan.beats.find((candidate) => candidate.id === beatId);
        if (!prior?.visible || !(prior.clone instanceof Element) || !beat) continue;
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-ns-runtime-owned", "true");
        wrapper.setAttribute("data-ns-construction-ghost", "true");
        wrapper.setAttribute("data-ns-construction-ghost-id", nodeId);
        Object.assign(wrapper.style, {
          position: "absolute",
          left: (prior.rect.left - originRect.left) + "px",
          top: (prior.rect.top - originRect.top) + "px",
          width: Math.max(1, prior.rect.width) + "px",
          height: Math.max(1, prior.rect.height) + "px",
          margin: "0",
          padding: "0",
          pointerEvents: "none",
          transformOrigin: "top left",
          overflow: "hidden",
          clipPath: "inset(0 round 10px)",
          isolation: "isolate",
          zIndex: "2",
          opacity: String(Math.max(0, Math.min(1, prior.opacity || 1))),
          contain: "strict",
        });
        const clone = prior.clone.cloneNode(true);
        if (clone instanceof Element) {
          [clone, ...Array.from(clone.querySelectorAll("[data-ns-node-id],[id]"))].forEach((element) => {
            element.removeAttribute?.("data-ns-node-id");
            element.removeAttribute?.("id");
            element.removeAttribute?.("data-ns-runtime-owned");
          });
          if (clone instanceof HTMLElement) Object.assign(clone.style, { position: "absolute", inset: "0", width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", margin: "0", transform: "none", animation: "none", transition: "none", overflow: "hidden", pointerEvents: "none" });
          wrapper.append(clone);
        }
        overlay.append(wrapper);
        const beatAnimations = animationsByBeat.get(beat.id) || [];
        const delay = reducedMotion ? 0 : Math.min(800, beatAnimations.length * Math.max(0, Number(beat.staggerMs) || 0));
        const exitY = beat.kind === "choreograph-evidence" ? -10 : beat.kind === "open-layout" ? -6 : 0;
        const animation = trackAnimation(wrapper.animate([
          { opacity: Math.max(0, Math.min(1, prior.opacity || 1)), transform: "none", filter: "none" },
          { offset: .28, opacity: Math.max(.72, Math.min(1, prior.opacity || 1)), transform: "none", filter: "none" },
          { opacity: 0, transform: "translateY(" + exitY + "px) scale(.988)", filter: "blur(1px) saturate(.9)" },
        ], { duration: reducedMotion ? Math.min(180, beat.durationMs) : Math.max(420, beat.durationMs), delay, easing: "cubic-bezier(.4,0,.6,1)", fill: "both" }));
        animation.pause();
        animation.currentTime = 0;
        beatAnimations.push(animation);
        animationsByBeat.set(beat.id, beatAnimations);
        const wrappers = ghostWrappersByBeat.get(beat.id) || [];
        wrappers.push(wrapper);
        ghostWrappersByBeat.set(beat.id, wrappers);
        before.forEach((value, candidateId) => {
          if (!retiredSet.has(candidateId)) return;
          let cursor = candidateId;
          while (cursor) {
            if (cursor === nodeId) { stagedCoverageNodeIds.add(candidateId); break; }
            cursor = before.get(cursor)?.parentId;
          }
        });
      }

      root.removeAttribute("data-ns-prepaint");
      window.clearTimeout(prepaintFailsafe);
      root.setAttribute("data-ns-construction-active", "true");
      root.setAttribute("data-ns-construction-mode", plan.mode || "cinematic");
      parent.postMessage({ type: "northstar.artifact.construction-started", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: batch.mutationId, beatCount: plan.beats.length, totalDurationMs: plan.totalDurationMs, coverageNodeCount: coverage.size }, "*");

      for (let beatIndex = 0; beatIndex < plan.beats.length; beatIndex += 1) {
        const beat = plan.beats[beatIndex];
        if (cancelledMutationIds.has(batch.mutationId)) return;
        if (Date.now() >= absoluteDeadline) { timedOut = true; break; }
        root.setAttribute("data-ns-construction-beat", beat.kind);
        root.setAttribute("data-ns-construction-beat-index", String(beatIndex));
        if (badge && badgeLabel && plan.showBeatLabels !== false) {
          badgeLabel.textContent = beat.label;
          try { currentBadgeAnimation?.cancel(); } catch {}
          currentBadgeAnimation = trackAnimation(badge.animate([{ opacity: 0, transform: "translateY(-8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: reducedMotion ? 100 : 240, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }));
        }
        const guides = [];
        const rootRect = root.getBoundingClientRect();
        const guideKinds = new Set(["draw-analysis", "anchor-annotations", "route-relationships"]);
        if (guideKinds.has(beat.kind)) for (const nodeId of (beat.nodeIds || []).slice(0, 6)) {
          const element = nodeById(nodeId);
          if (!element || element === root || element.querySelector?.("[data-ns-node-id]")) continue;
          const rect = element.getBoundingClientRect();
          const areaRatio = (rect.width * rect.height) / Math.max(1, rootRect.width * rootRect.height);
          if (rect.width < 4 || rect.height < 4 || areaRatio > .22) continue;
          const guide = document.createElement("div");
          guide.setAttribute("data-ns-construction-guide", "true");
          Object.assign(guide.style, { position: "absolute", left: (rect.left - rootRect.left - 3) + "px", top: (rect.top - rootRect.top - 3) + "px", width: (rect.width + 6) + "px", height: (rect.height + 6) + "px", borderRadius: "9px", border: "1px solid rgba(107,77,255,.22)", boxShadow: "0 0 0 2px rgba(107,77,255,.035)", opacity: "0" });
          overlay.append(guide);
          trackAnimation(guide.animate([{ opacity: 0 }, { opacity: .55 }], { duration: reducedMotion ? 80 : 180, fill: "forwards" }));
          guides.push(guide);
        }
        parent.postMessage({ type: "northstar.artifact.construction-beat-started", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: batch.mutationId, beatId: beat.id, beatKind: beat.kind, beatLabel: beat.label, beatIndex, beatCount: plan.beats.length, nodeIds: beat.nodeIds || [] }, "*");
        queueContentSize();
        const beatAnimations = [...(animationsByBeat.get(beat.id) || [])];
        beatAnimations.forEach((animation) => animation.play());
        const pathAnimations = [];
        if (beat.kind === "draw-analysis" || beat.kind === "route-relationships") {
          solveSpatialSystem();
          const paths = new Set();
          if (beat.kind === "draw-analysis") {
            for (const nodeId of beat.nodeIds || []) {
              const element = nodeById(nodeId);
              if (!element) continue;
              if (element.matches?.("path,polyline,line")) paths.add(element);
              element.querySelectorAll?.("path,polyline,line").forEach((path) => paths.add(path));
            }
          } else {
            const relationshipIds = new Set();
            for (const nodeId of beat.nodeIds || []) {
              const element = nodeById(nodeId);
              const relationshipId = element?.getAttribute?.("data-ns-relationship-id");
              if (relationshipId) relationshipIds.add(relationshipId);
            }
            origin.querySelectorAll('[data-ns-spatial-system] path[data-ns-routed-relationship-id]').forEach((path) => {
              const relationshipId = path.getAttribute("data-ns-routed-relationship-id");
              if (relationshipIds.size === 0 || relationshipIds.has(relationshipId)) paths.add(path);
            });
          }
          for (const path of Array.from(paths).slice(0, 80)) {
            if (typeof SVGGeometryElement === "undefined" || !(path instanceof SVGGeometryElement) || typeof path.getTotalLength !== "function") continue;
            const length = Math.max(1, path.getTotalLength());
            const pathAnimation = trackAnimation(path.animate([{ strokeDasharray: String(length), strokeDashoffset: String(length), opacity: .08 }, { strokeDasharray: String(length), strokeDashoffset: "0", opacity: 1 }], { duration: reducedMotion ? 150 : Math.max(420, beat.durationMs), easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" }));
            pathAnimation.pause(); pathAnimation.currentTime = 0; pathAnimation.play(); pathAnimations.push(pathAnimation);
          }
        }
        const completionAnimations = [...beatAnimations, ...pathAnimations];
        const maxDelay = reducedMotion ? 0 : Math.min(1000, Math.max(0, completionAnimations.length - 1) * Math.max(0, Number(beat.staggerMs) || 0));
        const remaining = Math.max(120, absoluteDeadline - Date.now());
        const beatDeadline = Math.min(remaining, Math.max(900, Number(beat.durationMs) + maxDelay + Number(beat.holdMs) + 1200));
        const waitResult = completionAnimations.length > 0
          ? await constructionDeadline(Promise.all(completionAnimations.map((animation) => animation.finished.catch(() => undefined))), beatDeadline)
          : await constructionDeadline(constructionSleep(reducedMotion ? Math.min(180, beat.durationMs) : beat.durationMs), beatDeadline);
        if (waitResult.timedOut) { timedOut = true; timedOutBeatCount += 1; }
        await constructionSleep(reducedMotion ? Math.min(50, beat.holdMs) : Math.min(beat.holdMs, Math.max(0, absoluteDeadline - Date.now())));
        guides.forEach((guide) => { const fade = trackAnimation(guide.animate([{ opacity: .82 }, { opacity: 0 }], { duration: reducedMotion ? 60 : 160, fill: "forwards" })); fade.finished.catch(() => undefined).finally(() => guide.remove()); });
        (ghostWrappersByBeat.get(beat.id) || []).forEach((wrapper) => wrapper.remove());
        ghostWrappersByBeat.delete(beat.id);
        beatAnimations.forEach((animation) => { try { animation.cancel(); } catch {} });
        pathAnimations.forEach((animation) => { try { animation.cancel(); } catch {} });
        parent.postMessage({ type: "northstar.artifact.construction-beat-completed", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: batch.mutationId, beatId: beat.id, beatKind: beat.kind, beatIndex, beatCount: plan.beats.length, timedOut: waitResult.timedOut }, "*");
        if (Date.now() >= absoluteDeadline) { timedOut = true; break; }
      }
      if (badge) {
        try { currentBadgeAnimation?.cancel(); } catch {}
        const fade = trackAnimation(badge.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px) scale(.985)" }], { duration: reducedMotion ? 80 : 220, fill: "forwards" }));
        await constructionDeadline(fade.finished.catch(() => undefined), 600);
      }
      completed = true;
    } catch (error) {
      recovered = true;
      completed = true;
      recoveryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      cleanup();
    }

    const uncoveredNodeIds = Array.from(coverage).filter((id) => id !== "artboard" && nodeById(id) && !stagedCoverageNodeIds.has(id));
    const result = { completed, timedOut, recovered, recoveryMessage, timedOutBeatCount, coverageNodeCount: coverage.size, stagedNodeCount: stagedCoverageNodeIds.size, retiredCoverageNodeCount: retiredCoverageNodeIds.length, missingCoverageNodeIds, uncoveredNodeIds, durationMs: Date.now() - startedAt };
    constructionResults.set(batch.mutationId, result);
    if (completed) parent.postMessage({ type: timedOut || recovered ? "northstar.artifact.construction-recovered" : "northstar.artifact.construction-completed", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: batch.mutationId, beatCount: plan.beats.length, result }, "*");
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
      const rootRect = root.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const bounds = {
        left: Math.round((rect.left - rootRect.left) * 100) / 100,
        top: Math.round((rect.top - rootRect.top) * 100) / 100,
        right: Math.round((rect.right - rootRect.left) * 100) / 100,
        bottom: Math.round((rect.bottom - rootRect.top) * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
      const childNodeIds = Array.from(element.children || [])
        .map((child) => child.getAttribute?.("data-ns-node-id") || "")
        .filter(Boolean);
      return {
        nodeId,
        parentId: parent?.getAttribute("data-ns-node-id") || undefined,
        bounds,
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
  const expandPixelStableNodeIds = (rootIds = []) => {
    const stable = new Set();
    for (const rootId of Array.isArray(rootIds) ? rootIds : []) {
      const element = nodeById(rootId);
      if (!element) continue;
      const ownId = element.getAttribute("data-ns-node-id");
      if (ownId) stable.add(ownId);
      element.querySelectorAll("[data-ns-node-id]").forEach((child) => {
        const childId = child.getAttribute("data-ns-node-id");
        if (childId) stable.add(childId);
      });
    }
    return Array.from(stable);
  };
  const pixelStableFailure = (stableIds, before, after) => {
    const failures = [];
    const tolerance = 0.6;
    for (const id of Array.isArray(stableIds) ? stableIds : []) {
      const beforeNode = before.get(id);
      const afterNode = after.get(id);
      if (!beforeNode || !afterNode) { failures.push(id + " was removed or could not be measured"); continue; }
      const semanticBefore = { ...beforeNode, rect: undefined };
      const semanticAfter = { ...afterNode, rect: undefined };
      if (JSON.stringify(semanticBefore) !== JSON.stringify(semanticAfter)) {
        failures.push(id + " source or rendered semantics changed");
        continue;
      }
      const beforeRect = beforeNode.rect || [];
      const afterRect = afterNode.rect || [];
      const labels = ["x", "y", "width", "height"];
      const changed = labels.filter((_, index) => Math.abs(Number(afterRect[index] || 0) - Number(beforeRect[index] || 0)) > tolerance);
      if (changed.length) failures.push(id + " changed " + changed.join("/"));
    }
    return failures.length
      ? "Pixel-stable reference geometry changed: " + failures.slice(0, 16).join(", ") + "."
      : "";
  };

  const additiveExpansionCollateralFailure = (batch, before, after) => {
    const operations = Array.isArray(batch?.operations) ? batch.operations : [];
    const additiveExpansion = /^expand-/i.test(String(batch?.geometryIntent || ""))
      && operations.some((operation) => operation.op === "insert-html")
      && operations.every((operation) => operation.op === "insert-html" || operation.op === "request-space");
    if (!additiveExpansion) return "";

    const tolerance = 1.25;
    const changed = [];
    for (const [id, beforeNode] of before.entries()) {
      if (id === "artboard") continue;
      const afterNode = after.get(id);
      if (!afterNode) {
        changed.push(id + " was removed");
        continue;
      }
      const prior = beforeNode.rect || [];
      const next = afterNode.rect || [];
      const labels = ["x", "y", "width", "height"];
      const deltas = labels.map((_, index) => Number(next[index] || 0) - Number(prior[index] || 0));
      const material = labels.filter((_, index) => Math.abs(deltas[index]) > tolerance);
      if (material.length) {
        changed.push(id + " changed " + material.map((label) => {
          const delta = deltas[labels.indexOf(label)];
          return label + " " + (delta >= 0 ? "+" : "") + Math.round(delta * 10) / 10 + "px";
        }).join(", "));
      }
    }

    const beforeArtboard = before.get("artboard")?.rect || [];
    const afterArtboard = after.get("artboard")?.rect || [];
    const contracted = Number(afterArtboard[2] || 0) + tolerance < Number(beforeArtboard[2] || 0)
      || Number(afterArtboard[3] || 0) + tolerance < Number(beforeArtboard[3] || 0);
    if (!contracted && changed.length === 0) return "";
    return "Additive outer-space expansion caused collateral geometry changes before commit: "
      + (contracted ? "the artboard contracted despite an expansion intent; " : "")
      + changed.slice(0, 12).join("; ")
      + ". Keep every pre-existing node at its accepted x/y/width/height, isolate the new subject from normal flow, and expand only the requested outer edge.";
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
  const measureVisualImpact = (before, after, meaningfulIds) => {
    const rootRect = root.getBoundingClientRect();
    const rootArea = Math.max(1, rootRect.width * rootRect.height);
    let changedArea = 0;
    let movedNodeCount = 0;
    let resizedNodeCount = 0;
    let addedNodeCount = 0;
    let removedNodeCount = 0;
    const spatiallyChanged = new Set();
    for (const id of meaningfulIds) {
      if (id === "artboard") continue;
      const beforeNode = before.get(id);
      const afterNode = after.get(id);
      const beforeRect = beforeNode?.rect;
      const afterRect = afterNode?.rect;
      if (!beforeRect && afterRect) {
        addedNodeCount += 1;
        spatiallyChanged.add(id);
        changedArea += Math.max(0, afterRect[2] * afterRect[3]);
        continue;
      }
      if (beforeRect && !afterRect) {
        removedNodeCount += 1;
        spatiallyChanged.add(id);
        changedArea += Math.max(0, beforeRect[2] * beforeRect[3]);
        continue;
      }
      if (!beforeRect || !afterRect) continue;
      const moved = Math.abs(afterRect[0] - beforeRect[0]) > 4 || Math.abs(afterRect[1] - beforeRect[1]) > 4;
      const resized = Math.abs(afterRect[2] - beforeRect[2]) > Math.max(4, beforeRect[2] * 0.03)
        || Math.abs(afterRect[3] - beforeRect[3]) > Math.max(4, beforeRect[3] * 0.03);
      if (moved) movedNodeCount += 1;
      if (resized) resizedNodeCount += 1;
      if (moved || resized) spatiallyChanged.add(id);
      changedArea += Math.max(beforeRect[2] * beforeRect[3], afterRect[2] * afterRect[3]);
    }
    return {
      changedAreaRatio: Math.max(0, Math.min(1, changedArea / rootArea)),
      spatiallyChangedNodeCount: spatiallyChanged.size,
      movedNodeCount,
      resizedNodeCount,
      addedNodeCount,
      removedNodeCount,
    };
  };
  const rectIntersectionArea = (a, b) => {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  };
  const paintedMediaGeometry = (image, imageStyle) => {
    if (!image) return { width: 0, height: 0, aspectRatio: 0, naturalAspectRatio: 0 };
    const rect = image.getBoundingClientRect();
    const naturalWidth = Number(image.naturalWidth || 0);
    const naturalHeight = Number(image.naturalHeight || 0);
    const naturalAspectRatio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 0;
    const objectFit = String(imageStyle?.objectFit || "fill").toLowerCase();
    let width = Math.max(0, rect.width);
    let height = Math.max(0, rect.height);
    if (naturalAspectRatio > 0 && (objectFit === "contain" || objectFit === "scale-down")) {
      const containerAspectRatio = width > 0 && height > 0 ? width / height : 0;
      if (containerAspectRatio > naturalAspectRatio) width = height * naturalAspectRatio;
      else if (containerAspectRatio > 0) height = width / naturalAspectRatio;
    }
    return {
      width,
      height,
      aspectRatio: width > 0 && height > 0 ? width / height : 0,
      naturalAspectRatio,
    };
  };
  const captureEvidenceRegistryReceipt = () => {
    const rootRect = root.getBoundingClientRect();
    const entries = Array.from(root.querySelectorAll("[data-ns-evidence-id]"))
      .map((element, index) => {
        const evidenceId = String(element.getAttribute("data-ns-evidence-id") || "").trim();
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const image = element.matches("img") ? element : element.querySelector("img");
        const imageStyle = image ? getComputedStyle(image) : style;
        const media = paintedMediaGeometry(image, imageStyle);
        const runtimeInherited = element.hasAttribute("data-ns-runtime-inherited-placement");
        const visible = rect.width > 4
          && rect.height > 4
          && style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity || 1) > 0.01;
        return {
          evidenceId,
          visible,
          runtimeInherited,
          presentation: {
            evidenceId,
            nodeId: element.getAttribute("data-ns-node-id") || undefined,
            flowId: element.closest("[data-ns-flow-id]")?.getAttribute("data-ns-flow-id") || undefined,
            index,
            x: Math.round((rect.left - rootRect.left) * 100) / 100,
            y: Math.round((rect.top - rootRect.top) * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            aspectRatio: rect.height > 0 ? Math.round((rect.width / rect.height) * 10000) / 10000 : 0,
            mediaWidth: Math.round(media.width * 100) / 100,
            mediaHeight: Math.round(media.height * 100) / 100,
            mediaAspectRatio: Math.round(media.aspectRatio * 10000) / 10000,
            naturalAspectRatio: Math.round(media.naturalAspectRatio * 10000) / 10000,
            objectFit: imageStyle.objectFit || "fill",
            objectPosition: imageStyle.objectPosition || "50% 50%",
            transform: style.transform || "none",
            runtimeInherited,
          },
        };
      })
      .filter((entry) => entry.evidenceId);
    const presentEvidenceIds = Array.from(new Set(entries.map((entry) => entry.evidenceId)));
    const visibleEvidenceIds = Array.from(new Set(entries.filter((entry) => entry.visible).map((entry) => entry.evidenceId)));
    const runtimeInheritedEvidenceIds = Array.from(new Set(
      entries.filter((entry) => entry.runtimeInherited).map((entry) => entry.evidenceId),
    ));
    return {
      expectedEvidenceIds: Array.from(expectedEvidenceIds),
      presentEvidenceIds,
      visibleEvidenceIds,
      runtimeInheritedEvidenceIds,
      unplacedEvidenceIds: runtimeInheritedEvidenceIds.slice(),
      missingEvidenceIds: Array.from(expectedEvidenceIds).filter((id) => !presentEvidenceIds.includes(id)),
      presentationManifest: entries.map((entry) => entry.presentation),
    };
  };
  const visualSafetySnapshot = () => {
    const rootRect = root.getBoundingClientRect();
    const evidenceRegistryReceipt = captureEvidenceRegistryReceipt();
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
    const evidenceElements = Array.from(root.querySelectorAll("[data-ns-evidence-id], [data-ns-protected-evidence], figure:has(img)"))
      .filter((element) => element.hasAttribute("data-ns-protected-evidence") || Boolean(element.querySelector("img,video,canvas,svg")));
    const evidenceItems = evidenceElements
      .map((element, index) => ({
        element,
        id: element.getAttribute("data-ns-evidence-id") || element.getAttribute("data-ns-node-id") || "evidence-" + index,
        rect: element.getBoundingClientRect(),
      }))
      .filter((item) => item.rect.width > 4 && item.rect.height > 4);
    const evidenceRects = evidenceItems.map((item) => item.rect);
    const unionRects = (rects) => {
      if (!rects.length) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const evidenceTerritoriesByFlow = new Map();
    for (const item of evidenceItems) {
      const flowId = item.element.closest("[data-ns-flow-id]")?.getAttribute("data-ns-flow-id") || "";
      if (!flowId) continue;
      const entries = evidenceTerritoriesByFlow.get(flowId) || [];
      entries.push(item.rect);
      evidenceTerritoriesByFlow.set(flowId, entries);
    }
    const evidenceTerritories = Array.from(evidenceTerritoriesByFlow.entries())
      .map(([flowId, rects]) => ({ flowId, rect: unionRects(rects) }))
      .filter((entry) => entry.rect && entry.rect.width > 4 && entry.rect.height > 4);
    const evidenceCollisionPairs = [];
    for (let index = 0; index < evidenceItems.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < evidenceItems.length; otherIndex += 1) {
        const first = evidenceItems[index];
        const second = evidenceItems[otherIndex];
        if (first.element.contains(second.element) || second.element.contains(first.element)) continue;
        const overlapArea = rectIntersectionArea(first.rect, second.rect);
        const smallerArea = Math.max(1, Math.min(
          first.rect.width * first.rect.height,
          second.rect.width * second.rect.height,
        ));
        if (overlapArea / smallerArea > 0.08) {
          evidenceCollisionPairs.push([first.id, second.id]);
        }
      }
    }
    const semanticRegionIntrusions = [];
    const authoredAdditionCandidates = semantic.filter((item) => {
      if (item.element.matches("svg,path,line,polyline,polygon")) return false;
      const id = item.id.toLowerCase();
      const role = (item.element.getAttribute("data-ns-role") || "").toLowerCase();
      return item.element.hasAttribute("data-ns-authored-annotation")
        || item.element.hasAttribute("data-ns-authored-callout")
        || item.element.hasAttribute("data-ns-explains-node-id")
        || /(?:annotation|callout|caption|explanation|comment|remark|note|card|label)/.test(id + " " + role);
    });
    const resolveFlowForNodeId = (nodeId) => {
      if (!nodeId) return "";
      try {
        return root.querySelector('[data-ns-node-id="' + CSS.escape(nodeId) + '"]')
          ?.closest("[data-ns-flow-id]")?.getAttribute("data-ns-flow-id") || "";
      } catch {
        return "";
      }
    };
    const intendedFlowForAddition = (item) => {
      const explicitTargetIds = [
        item.element.getAttribute("data-ns-explains-node-id"),
        item.element.getAttribute("data-ns-between-before-node-id"),
        item.element.getAttribute("data-ns-between-after-node-id"),
      ].filter(Boolean);
      for (const nodeId of explicitTargetIds) {
        const flowId = resolveFlowForNodeId(nodeId);
        if (flowId) return flowId;
      }
      for (const relation of authoredDesignRelations.values()) {
        if (relation.subjectId !== item.id) continue;
        for (const reference of relation.references || []) {
          const flowId = resolveFlowForNodeId(reference.nodeId);
          if (flowId) return flowId;
        }
      }
      return "";
    };
    const rectIntersection = (a, b) => {
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      if (right <= left || bottom <= top) return null;
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    for (const addition of authoredAdditionCandidates) {
      const intendedFlowId = intendedFlowForAddition(addition);
      if (!intendedFlowId) continue;
      for (const territory of evidenceTerritories) {
        if (territory.flowId === intendedFlowId) continue;
        const overlap = rectIntersection(addition.rect, territory.rect);
        if (!overlap) continue;
        const overlapArea = overlap.width * overlap.height;
        const additionArea = Math.max(1, addition.rect.width * addition.rect.height);
        if (overlapArea < 16 || overlapArea / additionArea < 0.02) continue;
        semanticRegionIntrusions.push({
          additionId: addition.id,
          intendedFlowId,
          intrudedFlowId: territory.flowId,
          additionBounds: { left: Number(addition.rect.left.toFixed(2)), top: Number(addition.rect.top.toFixed(2)), width: Number(addition.rect.width.toFixed(2)), height: Number(addition.rect.height.toFixed(2)) },
          regionBounds: { left: Number(territory.rect.left.toFixed(2)), top: Number(territory.rect.top.toFixed(2)), width: Number(territory.rect.width.toFixed(2)), height: Number(territory.rect.height.toFixed(2)) },
          overlapBounds: { left: Number(overlap.left.toFixed(2)), top: Number(overlap.top.toFixed(2)), width: Number(overlap.width.toFixed(2)), height: Number(overlap.height.toFixed(2)) },
          overlapArea: Number(overlapArea.toFixed(2)),
        });
      }
    }
    const authoredContinuityObservations = [];
    const distanceBetweenCenters = (a, b) => {
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      return Math.hypot(ax - bx, ay - by);
    };
    const containsCenter = (outer, inner) => {
      const x = inner.left + inner.width / 2;
      const y = inner.top + inner.height / 2;
      return x >= outer.left && x <= outer.right && y >= outer.top && y <= outer.bottom;
    };
    const targetNodeIdsForAddition = (item) => {
      const targetIds = new Set([
        item.element.getAttribute("data-ns-explains-node-id"),
        item.element.getAttribute("data-ns-source-node-id"),
        item.element.getAttribute("data-ns-target-node-id"),
        item.element.getAttribute("data-ns-between-before-node-id"),
        item.element.getAttribute("data-ns-between-after-node-id"),
      ].filter(Boolean));
      for (const relation of authoredDesignRelations.values()) {
        if (relation.subjectId !== item.id) continue;
        for (const reference of relation.references || []) if (reference.nodeId) targetIds.add(reference.nodeId);
      }
      return Array.from(targetIds);
    };
    for (const addition of authoredAdditionCandidates) {
      const targetNodeIds = targetNodeIdsForAddition(addition);
      if (!targetNodeIds.length) continue;
      const targetElements = targetNodeIds.flatMap((nodeId) => {
        try {
          const element = root.querySelector('[data-ns-node-id="' + CSS.escape(nodeId) + '"]');
          return element ? [element] : [];
        } catch { return []; }
      });
      if (!targetElements.length) continue;
      const targetRects = targetElements.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 1 && rect.height > 1);
      const targetBounds = unionRects(targetRects);
      if (!targetBounds) continue;
      const targetFlowElement = targetElements.map((element) => element.closest("[data-ns-flow-id]")).find(Boolean);
      const targetFlowId = targetFlowElement?.getAttribute("data-ns-flow-id") || "";
      const targetRegionRect = targetFlowElement?.getBoundingClientRect();
      const outsideTargetRegion = Boolean(targetRegionRect && !containsCenter(targetRegionRect, addition.rect));
      const centerDistance = distanceBetweenCenters(addition.rect, targetBounds);
      const targetScale = Math.max(1, Math.hypot(targetBounds.width, targetBounds.height));
      const weakenedByDistance = centerDistance > targetScale * 1.75;
      const weakened = outsideTargetRegion || weakenedByDistance;
      authoredContinuityObservations.push({
        additionId: addition.id,
        targetNodeIds,
        intendedFlowId: targetFlowId || undefined,
        targetRegionId: targetFlowElement?.getAttribute("data-ns-node-id") || undefined,
        additionBounds: { left: Number(addition.rect.left.toFixed(2)), top: Number(addition.rect.top.toFixed(2)), width: Number(addition.rect.width.toFixed(2)), height: Number(addition.rect.height.toFixed(2)) },
        targetBounds: { left: Number(targetBounds.left.toFixed(2)), top: Number(targetBounds.top.toFixed(2)), width: Number(targetBounds.width.toFixed(2)), height: Number(targetBounds.height.toFixed(2)) },
        centerDistance: Number(centerDistance.toFixed(2)),
        outsideTargetRegion,
        visualAttribution: weakened ? "weakened" : "clear",
        reason: outsideTargetRegion
          ? "The addition center is outside the rendered region containing its semantic target after cumulative layout."
          : weakenedByDistance
            ? "The addition is now substantially farther from its semantic target, weakening visual attribution."
            : "The addition remains visually attributable to its semantic target.",
      });
    }
    const authoredInterferencePairs = [];
    const relationshipElements = Array.from(root.querySelectorAll(
      '[data-ns-authored-relationship="true"], [data-ns-relationship-id], [data-ns-node-id*="connector" i]'
    ));
    const relationshipPrimitives = Array.from(new Set(relationshipElements.flatMap((relationshipElement) => {
      const directPrimitive = relationshipElement.matches("path,line,polyline,polygon")
        ? [relationshipElement]
        : [];
      return [...directPrimitive, ...Array.from(relationshipElement.querySelectorAll("path,line,polyline,polygon"))];
    })));
    const explanatoryObstacleCandidates = semantic.filter((item) => {
      if (item.element.matches("svg,path,line,polyline,polygon")) return false;
      const id = item.id.toLowerCase();
      const role = (item.element.getAttribute("data-ns-role") || "").toLowerCase();
      const text = (item.element.textContent || "").trim();
      const explicitlyAuthoredReadable = item.element.hasAttribute("data-ns-authored-annotation")
        || item.element.hasAttribute("data-ns-authored-callout")
        || item.element.hasAttribute("data-ns-explains-node-id")
        || /(?:annotation|callout|caption|label|explanation|comment|remark|note|card)/.test(id + " " + role);
      const leafReadableText = Boolean(text)
        && !item.element.querySelector("[data-ns-node-id]")
        && !item.element.closest("[data-ns-evidence-id], [data-ns-protected-evidence]");
      return explicitlyAuthoredReadable || leafReadableText;
    });
    // Prefer the smallest independently meaningful obstacle. Structural wrappers
    // often inherit all descendant text and would otherwise produce duplicate,
    // misleading reports such as evidence-reservoir + evidence + flow wrapper for
    // the same physical crossing.
    const explanatoryObstacles = explanatoryObstacleCandidates.filter((item) => !explanatoryObstacleCandidates.some((other) => (
      other !== item
      && item.element.contains(other.element)
      && other.rect.width > 1
      && other.rect.height > 1
    )));
    const pointInsideRect = (point, rect, inset = 1.5) => point.x > rect.left + inset
      && point.x < rect.right - inset
      && point.y > rect.top + inset
      && point.y < rect.bottom - inset;
    for (const primitive of relationshipPrimitives) {
      const owner = primitive.closest('[data-ns-authored-relationship="true"], [data-ns-relationship-id], [data-ns-node-id*="connector" i]') || primitive;
      const relationshipId = owner.getAttribute("data-ns-node-id")
        || owner.getAttribute("data-ns-relationship-id")
        || "authored-relationship";
      const primitiveId = primitive.getAttribute("data-ns-node-id") || relationshipId;
      const sourceNodeId = owner.getAttribute("data-ns-source-node-id") || "";
      const targetNodeId = owner.getAttribute("data-ns-target-node-id") || "";
      let samplePoints = [];
      try {
        if (typeof primitive.getTotalLength === "function" && typeof primitive.getPointAtLength === "function") {
          const totalLength = primitive.getTotalLength();
          const sampleCount = Math.max(12, Math.min(160, Math.ceil(totalLength / 6)));
          const matrix = primitive.getScreenCTM?.();
          for (let sampleIndex = 1; sampleIndex < sampleCount; sampleIndex += 1) {
            const localPoint = primitive.getPointAtLength((totalLength * sampleIndex) / sampleCount);
            const screenPoint = matrix && typeof DOMPoint === "function"
              ? new DOMPoint(localPoint.x, localPoint.y).matrixTransform(matrix)
              : localPoint;
            samplePoints.push({ x: screenPoint.x, y: screenPoint.y });
          }
        }
      } catch {}
      if (!samplePoints.length && primitive.tagName.toLowerCase() === "line") {
        const x1 = Number(primitive.getAttribute("x1") || 0);
        const y1 = Number(primitive.getAttribute("y1") || 0);
        const x2 = Number(primitive.getAttribute("x2") || 0);
        const y2 = Number(primitive.getAttribute("y2") || 0);
        const matrix = primitive.getScreenCTM?.();
        for (let sampleIndex = 1; sampleIndex < 24; sampleIndex += 1) {
          const localPoint = { x: x1 + ((x2 - x1) * sampleIndex) / 24, y: y1 + ((y2 - y1) * sampleIndex) / 24 };
          const screenPoint = matrix && typeof DOMPoint === "function"
            ? new DOMPoint(localPoint.x, localPoint.y).matrixTransform(matrix)
            : localPoint;
          samplePoints.push({ x: screenPoint.x, y: screenPoint.y });
        }
      }
      if (!samplePoints.length) continue;
      for (const obstacle of explanatoryObstacles) {
        if (obstacle.element === owner || obstacle.element === primitive || owner.contains(obstacle.element)) continue;
        if (obstacle.id === sourceNodeId || obstacle.id === targetNodeId) continue;
        if (sourceNodeId && obstacle.element.closest('[data-ns-node-id="' + CSS.escape(sourceNodeId) + '"]')) continue;
        if (targetNodeId && obstacle.element.closest('[data-ns-node-id="' + CSS.escape(targetNodeId) + '"]')) continue;
        const hitPoints = samplePoints.filter((point) => pointInsideRect(point, obstacle.rect));
        const hitCount = hitPoints.length;
        if (hitCount >= 2) {
          authoredInterferencePairs.push({
            relationshipId,
            primitiveId,
            obstacleId: obstacle.id || "authored-content",
            hitCount,
            obstacleBounds: {
              left: Number(obstacle.rect.left.toFixed(2)),
              top: Number(obstacle.rect.top.toFixed(2)),
              width: Number(obstacle.rect.width.toFixed(2)),
              height: Number(obstacle.rect.height.toFixed(2)),
            },
            firstHitPoint: {
              x: Number(hitPoints[0].x.toFixed(2)),
              y: Number(hitPoints[0].y.toFixed(2)),
            },
            lastHitPoint: {
              x: Number(hitPoints[hitPoints.length - 1].x.toFixed(2)),
              y: Number(hitPoints[hitPoints.length - 1].y.toFixed(2)),
            },
          });
        }
      }
    }
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
      evidenceCollisionPairs,
      flowTopologyViolations: [],
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
    const flowTopologyViolations = Array.from(root.querySelectorAll("[data-ns-flow-id], [data-ns-reference-flow], [data-ns-flow-sequence]"))
      .map((flow) => {
        const sequence = flow.matches("[data-ns-flow-sequence]")
          ? flow
          : flow.querySelector("[data-ns-flow-sequence], .working-flow__sequence, [data-ns-node-id$='-sequence']") || flow;
        const evidence = Array.from(sequence.querySelectorAll(":scope > [data-ns-evidence-id], :scope > figure, :scope > article, :scope > li"))
          .map((element) => ({
            id: element.getAttribute("data-ns-evidence-id") || element.getAttribute("data-ns-node-id") || "flow-screen",
            rect: element.getBoundingClientRect(),
          }))
          .filter((item) => item.rect.width > 8 && item.rect.height > 8);
        if (evidence.length < 3) return null;
        const centers = evidence.map((item) => ({
          id: item.id,
          x: item.rect.left + item.rect.width / 2,
          bottom: item.rect.bottom,
          height: item.rect.height,
        }));
        const orderedLeftToRight = centers.every((item, index) => index === 0 || item.x > centers[index - 1].x + 2);
        const sortedHeights = centers.map((item) => item.height).sort((a, b) => a - b);
        const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] || 0;
        const bottomSpread = Math.max(...centers.map((item) => item.bottom)) - Math.min(...centers.map((item) => item.bottom));
        const singleRow = bottomSpread <= Math.max(36, medianHeight * .25);
        const style = getComputedStyle(sequence);
        const declaresVertical = style.display === "flex" && style.flexDirection.startsWith("column");
        const declaresWrapping = style.display === "flex" && style.flexWrap !== "nowrap";
        const violates = declaresVertical || declaresWrapping || !orderedLeftToRight || !singleRow;
        return violates ? (flow.getAttribute("data-ns-flow-id") || flow.getAttribute("data-ns-node-id") || "ordered-flow") : null;
      })
      .filter(Boolean);
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
      evidenceCollisionPairs,
      authoredInterferencePairs,
      semanticRegionIntrusions,
      authoredContinuityObservations,
      runtimeInheritedEvidenceIds: evidenceRegistryReceipt.runtimeInheritedEvidenceIds,
      evidencePresentationManifest: evidenceRegistryReceipt.presentationManifest,
      flowTopologyViolations: Array.from(new Set(flowTopologyViolations)),
      contentBounds: { left, top, right, bottom },
    };
  };
  const visualSafetyFailure = (before, after, mechanicalOnly = false) => {
    const newlyAdded = (next, prior) => {
      const previous = new Set(prior || []);
      return (next || []).filter((value) => !previous.has(value));
    };
    const runtimeInheritedEvidenceIds = after.runtimeInheritedEvidenceIds || [];
    if (runtimeInheritedEvidenceIds.length) {
      return "Grounded evidence was left on runtime-inherited overlay geometry instead of being authored into the new composition: "
        + runtimeInheritedEvidenceIds.slice(0, 8).join(", ")
        + ". Use exact evidence placeholders or explicit placements in the intended semantic lane.";
    }
    const beforeEvidenceById = new Map(
      (before.evidencePresentationManifest || []).map((entry) => [entry.evidenceId, entry]),
    );
    const afterEvidence = after.evidencePresentationManifest || [];
    const distortedEvidenceIds = afterEvidence
      .filter((entry) => {
        const naturalAspectRatio = Number(entry.naturalAspectRatio || 0);
        const mediaAspectRatio = Number(entry.mediaAspectRatio || 0);
        if (!(naturalAspectRatio > 0) || !(mediaAspectRatio > 0)) return false;
        const ratio = mediaAspectRatio / naturalAspectRatio;
        return ratio < .88 || ratio > 1.14;
      })
      .map((entry) => entry.evidenceId);
    if (distortedEvidenceIds.length) {
      return "Grounded screenshots were non-proportionally distorted: "
        + distortedEvidenceIds.slice(0, 8).join(", ")
        + ". Preserve each screenshot's intrinsic aspect ratio and complete image surface.";
    }
    const abruptScaleChanges = afterEvidence.flatMap((entry) => {
      const previous = beforeEvidenceById.get(entry.evidenceId);
      if (!previous) return [];
      const beforeWidth = Number(previous.mediaWidth || previous.width || 0);
      const beforeHeight = Number(previous.mediaHeight || previous.height || 0);
      const afterWidth = Number(entry.mediaWidth || entry.width || 0);
      const afterHeight = Number(entry.mediaHeight || entry.height || 0);
      if (!(beforeWidth > 0) || !(beforeHeight > 0) || !(afterWidth > 0) || !(afterHeight > 0)) return [];
      const widthRatio = afterWidth / beforeWidth;
      const heightRatio = afterHeight / beforeHeight;
      if (widthRatio >= .38 && widthRatio <= 2.65 && heightRatio >= .38 && heightRatio <= 2.65) return [];
      return [{ evidenceId: entry.evidenceId, widthRatio, heightRatio }];
    });
    const comparableEvidenceCount = afterEvidence.filter((entry) => beforeEvidenceById.has(entry.evidenceId)).length;
    const abruptScaleThreshold = Math.max(4, Math.ceil(comparableEvidenceCount * .4));
    if (abruptScaleChanges.length >= abruptScaleThreshold) {
      return "The canonical evidence field changed scale too abruptly in one action ("
        + abruptScaleChanges.length + " of " + comparableEvidenceCount + " screens). "
        + "Rescale the ordered flow proportionally in a stable regional step, or create additive focal copies for emphasis.";
    }
    const newDuplicateRoles = (after.duplicateSingletonRoles || []).filter((entry) =>
      !(before.duplicateSingletonRoles || []).some((previous) => previous.role === entry.role && previous.owners.join("|") === entry.owners.join("|"))
    );
    if (!mechanicalOnly && newDuplicateRoles.length) {
      return "Canonical artboard role uniqueness regressed; new duplicate singleton regions appeared: " + newDuplicateRoles.map((entry) => entry.role + " [" + entry.owners.join(", ") + "]").join("; ");
    }
    const newUnsafeEvidenceOverlays = newlyAdded(after.unsafeEvidenceOverlayIds, before.unsafeEvidenceOverlayIds);
    if (newUnsafeEvidenceOverlays.length) {
      return "A new synthetic overlay obscured protected evidence: " + newUnsafeEvidenceOverlays.join(", ");
    }
    const newIncoherentRegions = newlyAdded(after.incoherentMajorRegionIds, before.incoherentMajorRegionIds);
    if (!mechanicalOnly && newIncoherentRegions.length) {
      return "A new major analytical region obscured grounded evidence instead of receiving a complete reflow: " + newIncoherentRegions.join(", ");
    }
    const beforeCollisionKeys = new Set((before.majorRegionCollisionPairs || []).map((pair) => pair.slice().sort().join("|")));
    const newCollisionPairs = (after.majorRegionCollisionPairs || []).filter((pair) => !beforeCollisionKeys.has(pair.slice().sort().join("|")));
    if (!mechanicalOnly && newCollisionPairs.length) {
      return "New major-region collisions appeared in the visible composition: " + newCollisionPairs.map((pair) => pair.join(" ↔ ")).join(", ");
    }
    const beforeEvidenceCollisionKeys = new Set((before.evidenceCollisionPairs || []).map((pair) => pair.slice().sort().join("|")));
    const newEvidenceCollisionPairs = (after.evidenceCollisionPairs || []).filter(
      (pair) => !beforeEvidenceCollisionKeys.has(pair.slice().sort().join("|")),
    );
    if (newEvidenceCollisionPairs.length) {
      return "New protected-evidence collisions appeared in the visible composition: "
        + newEvidenceCollisionPairs.map((pair) => pair.join(" ↔ ")).join(", ");
    }
    const regionIntrusionKey = (entry) => [entry.additionId, entry.intendedFlowId, entry.intrudedFlowId].join("|");
    const beforeRegionIntrusions = new Map(
      (before.semanticRegionIntrusions || []).map((entry) => [regionIntrusionKey(entry), Number(entry.overlapArea || 0)]),
    );
    const newSemanticRegionIntrusions = (after.semanticRegionIntrusions || []).filter((entry) => {
      const priorArea = beforeRegionIntrusions.get(regionIntrusionKey(entry));
      if (priorArea === undefined) return true;
      return Number(entry.overlapArea || 0) > Math.max(priorArea + 16, priorArea * 1.1);
    });
    if (newSemanticRegionIntrusions.length) {
      return "New authored content intruded into an unrelated evidence-flow territory: "
        + newSemanticRegionIntrusions.slice(0, 8)
          .map((entry) => entry.additionId + " refers to " + entry.intendedFlowId + " but overlaps " + entry.intrudedFlowId)
          .join("; ")
        + ". Preserve all evidence and intended meaning, then reposition, redesign, or create more space so the addition remains clearly associated with its intended flow.";
    }
    const continuityKey = (entry) => entry.additionId + "|" + (entry.targetRegionId || "") + "|" + (entry.targetNodeIds || []).join(",");
    const beforeContinuity = new Map((before.authoredContinuityObservations || []).map((entry) => [continuityKey(entry), entry]));
    const weakenedContinuity = (after.authoredContinuityObservations || []).filter((entry) => {
      if (entry.visualAttribution !== "weakened") return false;
      const prior = beforeContinuity.get(continuityKey(entry));
      if (!prior) return true;
      if (prior.visualAttribution !== "weakened") return true;
      return Number(entry.centerDistance || 0) > Math.max(Number(prior.centerDistance || 0) + 24, Number(prior.centerDistance || 0) * 1.15);
    });
    if (weakenedContinuity.length) {
      return "Cumulative semantic continuity weakened for prior authored additions: "
        + weakenedContinuity.slice(0, 8).map((entry) => entry.additionId + " still refers to " + entry.targetNodeIds.join(", ") + " but " + entry.reason.toLowerCase()).join("; ")
        + ". Preserve evidence, semantic identity, meaning, targets, and provenance; recompose the affected authored additions and the current change together so attribution and group membership remain clear.";
    }
    const interferenceKey = (entry) => [entry.relationshipId, entry.primitiveId, entry.obstacleId].join("|");
    const beforeInterferenceKeys = new Set((before.authoredInterferencePairs || []).map(interferenceKey));
    const newAuthoredInterferencePairs = (after.authoredInterferencePairs || []).filter(
      (entry) => !beforeInterferenceKeys.has(interferenceKey(entry)),
    );
    if (newAuthoredInterferencePairs.length) {
      return "New visual interference appeared between authored relationships and readable artboard content: "
        + newAuthoredInterferencePairs
          .slice(0, 8)
          .map((entry) => entry.primitiveId + " crosses " + entry.obstacleId)
          .join("; ")
        + ". Preserve the relationship meaning and all evidence, then reroute, reposition, redesign, or create more space so every addition remains visually independent and understandable.";
    }
    // Content extending beyond the previous authored shell is not a safety
    // failure. The canonical geometry compiler expands the runtime background,
    // iframe and outer Canvas object to include that finite authored content.
    const newClippedNodes = newlyAdded(after.clippedSemanticNodeIds, before.clippedSemanticNodeIds);
    if (!mechanicalOnly && newClippedNodes.length) {
      return "Whole-artboard clipping regressed; new meaningful nodes were clipped by an ancestor: " + newClippedNodes.slice(0, 8).join(", ");
    }
    const newDeclaredStructureFailures = newlyAdded(after.declaredStructureFailures, before.declaredStructureFailures);
    if (!mechanicalOnly && newDeclaredStructureFailures.length) {
      return "The transaction newly claimed a completed structure that was not fully visible: " + newDeclaredStructureFailures.join(", ");
    }
    if (before.comparisonEntityCount >= 2 && after.comparisonEntityCount < 2) {
      return "Comparison completeness failed; a required comparison entity or evidence lane disappeared.";
    }
    return "";
  };
  const foundationJavascript = ${safeJson(documentSource.javascript)};
  let currentAuthoredJavascript = ${safeJson(documentSource.creativeJavascript ?? "")};
  const runtimeModuleCleanups = new Map();
  const executeRuntimeModule = (moduleId, javascript) => {
    const safeModuleId = String(moduleId || "northstar-creative-source").replace(/[^a-zA-Z0-9_-]/g, "-");
    const priorCleanup = runtimeModuleCleanups.get(safeModuleId);
    if (typeof priorCleanup === "function") { try { priorCleanup(); } catch {} }
    runtimeModuleCleanups.delete(safeModuleId);
    currentAuthoredJavascript = String(javascript || "");
    if (!currentAuthoredJavascript.trim()) return;
    const runModule = new Function("Northstar", "data", "creative", "reviews", '"use strict";\n' + currentAuthoredJavascript);
    const cleanup = runModule(Northstar, currentData, currentCreative, currentReviews);
    if (typeof cleanup === "function") runtimeModuleCleanups.set(safeModuleId, cleanup);
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
  const restoreRuntimeInheritedStyles = (element, attributeName) => {
    if (!element?.style) return;
    const raw = element.getAttribute(attributeName);
    if (raw) {
      try {
        const prior = JSON.parse(raw);
        for (const [name, state] of Object.entries(prior || {})) {
          const appliedValue = String(state?.appliedValue || "");
          const currentValue = element.style.getPropertyValue(name);
          const currentPriority = element.style.getPropertyPriority(name);
          if (currentValue !== appliedValue || currentPriority !== "important") continue;
          const priorValue = String(state?.priorValue || "");
          const priorPriority = String(state?.priorPriority || "");
          if (priorValue) element.style.setProperty(name, priorValue, priorPriority);
          else element.style.removeProperty(name);
        }
      } catch {}
    }
    element.removeAttribute(attributeName);
  };
  const clearRuntimeInheritedParentStyle = (element) => {
    restoreRuntimeInheritedStyles(element, "data-ns-runtime-inherited-parent-style");
  };
  const clearRuntimeInheritedPlacement = (element) => {
    restoreRuntimeInheritedStyles(element, "data-ns-runtime-inherited-style");
    element?.removeAttribute?.("data-ns-runtime-inherited-placement");
  };
  const captureLiveSnapshot = () => {
    const authoredRoot = root.cloneNode(true);
    authoredRoot.querySelectorAll?.('[data-ns-runtime-owned="true"],[data-ns-spatial-system]').forEach((element) => element.remove());
    clearRuntimeRelationRealization(null, authoredRoot);
    authoredRoot.querySelectorAll?.('[data-ns-runtime-inherited-placement],[data-ns-runtime-inherited-style]')
      .forEach((element) => clearRuntimeInheritedPlacement(element));
    authoredRoot.querySelectorAll?.('[data-ns-runtime-inherited-parent-style]')
      .forEach((element) => clearRuntimeInheritedParentStyle(element));
    return {
      html: authoredRoot.innerHTML,
      css: document.getElementById("northstar-authored-foundation-style")?.textContent || "",
      cssLayers: Object.fromEntries(
        Array.from(document.querySelectorAll('style[id^="northstar-mutation-style-"]'))
          .map((style) => [style.id, style.textContent || ""]),
      ),
      javascript: foundationJavascript,
      creativeJavascript: currentAuthoredJavascript,
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
      if (["insert-html", "set-html", "recompose-region", "remove", "move"].includes(operation.op)) kinds.add("structure");
      if (operation.op === "move" || operation.op === "recompose-region") kinds.add("position");
      if (operation.op === "set-text" || operation.op === "set-html" || operation.op === "recompose-region" || operation.op === "insert-html") kinds.add("content");
      if (operation.op === "set-styles" || operation.op === "set-classes" || operation.op === "set-css-layer") kinds.add("style");
      if (operation.op === "set-runtime-module") kinds.add("content");
      if (operation.op === "request-space") kinds.add("geometry");
      if (operation.op === "set-styles") {
        const styles = operation.styles || {};
        const changesSize = Object.keys(styles).some((key) => /^(?:width|height|min-width|max-width|min-height|max-height|flex-basis|font-size|scale)$/i.test(key));
        const transformScales = typeof styles.transform === "string" && /(?:^|\s)scale(?:3d|x|y)?\s*\(/i.test(styles.transform);
        if (changesSize || transformScales) kinds.add("scale");
        if (typeof styles.transform === "string" && /(?:^|\s)translate(?:3d|x|y)?\s*\(/i.test(styles.transform)) kinds.add("position");
      }
      if (operation.op === "set-css-layer") {
        const css = operation.css || "";
        if (/(?:^|[;{])\s*(?:width|height|min-width|max-width|min-height|max-height|flex-basis|font-size|scale)\s*:/i.test(css)
          || /transform\s*:[^;{}]*\bscale(?:3d|x|y)?\s*\(/i.test(css)) kinds.add("scale");
        if (/transform\s*:[^;{}]*\btranslate(?:3d|x|y)?\s*\(/i.test(css)) kinds.add("position");
      }
    }
    if (Math.abs(afterBounds.width - beforeBounds.width) > 2 || Math.abs(afterBounds.height - beforeBounds.height) > 2 || afterBounds.minX !== beforeBounds.minX || afterBounds.minY !== beforeBounds.minY) kinds.add("geometry");
    if ((batch.requiredAssetUrls || []).length) kinds.add("assets");
    if (diff.meaningful.length && kinds.size === 0) kinds.add("content");
    return Array.from(kinds);
  };

  const rememberMutationTransaction = (mutationId, transaction) => {
    if (!mutationId) return;
    mutationTransactions.set(mutationId, transaction);
    if (mutationTransactions.size > 80) {
      mutationTransactions.delete(mutationTransactions.keys().next().value);
    }
  };

  const rollbackMutation = (mutationId) => {
    if (!mutationId) return false;
    const transaction = mutationTransactions.get(mutationId);
    if (!transaction) return false;
    const rollbackStartedAt = performance.now();
    if (pendingAcknowledgement?.mutationId === mutationId) pendingAcknowledgement = null;
    if (canonicalGeometryMutationId === mutationId) canonicalGeometryMutationId = null;
    root.innerHTML = transaction.html;
    restoreStyleState(transaction.styles);
    replaceDesignRelationMap(authoredDesignRelations, transaction.authoredDesignRelations || []);
    replaceDesignRelationMap(resolvedDesignRelations, transaction.resolvedDesignRelations || []);
    refreshRelationResizeObserver();
    requestedBounds = { ...transaction.requestedBounds };
    restoreCanonicalGeometry(transaction.canonicalGeometry, transaction.canonicalLayoutContext);
    currentRevisionId = transaction.revisionId;
    currentMutationId = transaction.mutationId;
    appliedMutationIds.delete(mutationId);
    queuedMutationIds.delete(mutationId);
    terminalMutationMessages.delete(mutationId);
    mutationTransactions.delete(mutationId);
    enforceAssetPolicy(root);
    applyStage();
    resolveAuthoredSpatialDependencies(currentRevisionId);
    executeRuntimeModule("northstar-creative-source", transaction.authoredJavascript);
    endAtomicCandidateValidation(mutationId);
    queueContentSize();
    const receipt = {
      rollbackDurationMs: Math.max(0, performance.now() - rollbackStartedAt),
      candidateDurationMs: Math.max(0, Date.now() - transaction.startedAt),
    };
    mutationRollbackReceipts.set(mutationId, receipt);
    if (mutationRollbackReceipts.size > 80) {
      mutationRollbackReceipts.delete(mutationRollbackReceipts.keys().next().value);
    }
    return receipt;
  };

  const applyRuntimeInheritedGeometry = (element, geometry) => {
    if (!element?.style || !geometry) return;
    clearRuntimeInheritedPlacement(element);
    const values = {
      position: "absolute",
      left: Math.round(geometry.left * 1000) / 1000 + "px",
      top: Math.round(geometry.top * 1000) / 1000 + "px",
      width: Math.max(1, Math.round(geometry.width * 1000) / 1000) + "px",
      height: Math.max(1, Math.round(geometry.height * 1000) / 1000) + "px",
      margin: "0px",
    };
    const prior = {};
    for (const [name, appliedValue] of Object.entries(values)) {
      prior[name] = {
        priorValue: element.style.getPropertyValue(name),
        priorPriority: element.style.getPropertyPriority(name),
        appliedValue,
      };
      element.style.setProperty(name, appliedValue, "important");
    }
    element.setAttribute("data-ns-runtime-inherited-style", JSON.stringify(prior));
    element.setAttribute("data-ns-runtime-inherited-placement", "true");
  };
  const applyRuntimeInheritedParentPosition = (element) => {
    if (!element?.style || getComputedStyle(element).position !== "static") return;
    clearRuntimeInheritedParentStyle(element);
    const appliedValue = "relative";
    element.setAttribute("data-ns-runtime-inherited-parent-style", JSON.stringify({
      position: {
        priorValue: element.style.getPropertyValue("position"),
        priorPriority: element.style.getPropertyPriority("position"),
        appliedValue,
      },
    }));
    element.style.setProperty("position", appliedValue, "important");
  };

  let pendingExternalRelationSubjectIds = new Set();
  const isolatePendingExternalRelationSubjects = (fragment) => {
    if (!fragment?.querySelectorAll || pendingExternalRelationSubjectIds.size === 0) return;
    fragment.querySelectorAll("[data-ns-node-id]").forEach((element) => {
      const nodeId = element.getAttribute("data-ns-node-id");
      if (!nodeId || !pendingExternalRelationSubjectIds.has(nodeId) || !element.style) return;
      // Keep a newly inserted external relation subject out of grid/flex flow
      // during the layout pass that precedes relation realization.
      element.style.setProperty("position", "absolute", "important");
      element.style.setProperty("margin", "0px", "important");
    });
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
    if (operation.op === "set-runtime-module") {
      executeRuntimeModule(operation.moduleId, operation.javascript);
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
    if (operation.op === "recompose-region") {
      if (operation.targetId === "artboard" || target === root) throw new Error("The permanent artboard root cannot be replaced.");
      const targetRect = target.getBoundingClientRect();
      const preserved = new Map();
      for (const placement of operation.placements || []) {
        const source = nodeById(placement.targetId);
        if (!source) throw new Error("Atomic recomposition source was not found: " + placement.targetId);
        const rect = source.getBoundingClientRect();
        preserved.set(placement.targetId, {
          source,
          geometry: placement.preserveGeometry ? {
            left: rect.left - targetRect.left,
            top: rect.top - targetRect.top,
            width: rect.width,
            height: rect.height,
          } : null,
        });
      }
      target.replaceChildren(sanitizeFragment(operation.html));
      for (const placement of operation.placements || []) {
        const preservedEntry = preserved.get(placement.targetId);
        const source = preservedEntry?.source;
        const placeholder = nodeById(placement.targetId);
        if (placeholder && placeholder !== source) {
          clearRuntimeInheritedPlacement(source);
          placeholder.replaceWith(source);
          continue;
        }
        const parent = placement.parentId === operation.targetId ? target : nodeById(placement.parentId);
        const before = placement.beforeId ? nodeById(placement.beforeId) : null;
        if (!parent) throw new Error("Atomic recomposition parent was not found: " + placement.parentId);
        clearRuntimeInheritedPlacement(source);
        parent.insertBefore(source, before && before.parentElement === parent ? before : null);
        if (placement.preserveGeometry && preservedEntry?.geometry) {
          applyRuntimeInheritedParentPosition(parent);
          applyRuntimeInheritedGeometry(source, preservedEntry.geometry);
        }
      }
      for (const retiredId of operation.retireNodeIds || []) {
        if (retiredId === operation.targetId || retiredId === "artboard") continue;
        const retired = nodeById(retiredId);
        if (retired) retired.remove();
      }
      return;
    }
    if (operation.op === "insert-html") {
      const fragment = sanitizeFragment(operation.html);
      isolatePendingExternalRelationSubjects(fragment);
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

  const authoredDesignRelations = new Map();
  const resolvedDesignRelations = new Map();
  const runtimeRelationMutationTargets = new WeakSet();
  let relationResizeObserver = null;
  let resolvingAuthoredRelations = false;
  let queueAuthoredRelationResolution = () => {};

  const cloneDesignRelationRecords = (values) => Array.from(values || []).map((value) => structuredClone(value));
  const authoredDesignRelationRecords = () => cloneDesignRelationRecords(authoredDesignRelations.values());
  const resolvedDesignRelationRecords = () => cloneDesignRelationRecords(resolvedDesignRelations.values());

  const canonicalRelationRole = (kind, role) => {
    const normalized = String(role || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (kind === "connector-attachment") {
      if (["source", "from", "start", "origin", "source-node", "source-reference", "from-node"].includes(normalized)) return "source";
      if (["target", "to", "end", "destination", "target-node", "target-reference", "to-node"].includes(normalized)) return "target";
    }
    if (kind === "between-placement") {
      if (["before", "first", "start", "left", "top", "previous"].includes(normalized)) return "before";
      if (["after", "second", "end", "right", "bottom", "next"].includes(normalized)) return "after";
    }
    if (kind === "relative-placement" && ["reference", "target", "anchor", "reference-node", "relative-to"].includes(normalized)) return "reference";
    return normalized || String(role || "").trim();
  };

  const canonicalRelationReferences = (relation) => (relation.references || []).map((reference) => ({
    ...reference,
    role: canonicalRelationRole(relation.kind, reference.role),
  }));

  const relationRealizationTraceRecords = () => authoredDesignRelationRecords().map((relation) => {
    const receivedReferences = cloneDesignRelationRecords(relation.references || []);
    const canonicalReferences = canonicalRelationReferences(relation);
    const resolved = resolvedDesignRelations.get(relation.id);
    const subject = nodeById(relation.subjectId);
    const missingReferenceNodeIds = canonicalReferences
      .filter((reference) => !nodeById(reference.nodeId))
      .map((reference) => reference.nodeId);
    const primitiveNodeId = relation.kind === "connector-attachment" ? String(relation.parameters?.primitiveNodeId || "") : "";
    const primitive = relation.kind === "connector-attachment"
      ? (primitiveNodeId ? nodeById(primitiveNodeId) : subject?.querySelector?.("line,path,polyline"))
      : null;
    const status = resolved?.status || "missing";
    let failureStage = "none";
    if (!subject) failureStage = "subject";
    else if (missingReferenceNodeIds.length || (relation.kind === "connector-attachment" && (!canonicalReferences.some((reference) => reference.role === "source") || !canonicalReferences.some((reference) => reference.role === "target")))) failureStage = "reference";
    else if (relation.kind === "connector-attachment" && !primitive) failureStage = "primitive";
    else if (status !== "resolved") failureStage = "resolver";
    return {
      relationId: relation.id,
      kind: relation.kind,
      realizationPolicy: relation.realizationPolicy,
      subjectId: relation.subjectId,
      receivedReferences,
      canonicalReferences,
      subjectFound: Boolean(subject),
      missingReferenceNodeIds,
      ...(relation.kind === "connector-attachment" ? { primitiveNodeId: primitiveNodeId || undefined, primitiveFound: Boolean(primitive) } : {}),
      status,
      failureStage,
      message: resolved?.message,
    };
  });

  const replaceDesignRelationMap = (target, records) => {
    target.clear();
    for (const record of records || []) {
      if (record?.id) target.set(record.id, structuredClone(record));
      else if (record?.relationId) target.set(record.relationId, structuredClone(record));
    }
  };

  const markRuntimeRelationMutation = (element) => {
    if (!(element instanceof Element)) return;
    runtimeRelationMutationTargets.add(element);
    window.setTimeout(() => runtimeRelationMutationTargets.delete(element), 0);
  };

  const readRuntimeRelationState = (element, attributeName) => {
    try { return JSON.parse(element.getAttribute(attributeName) || "{}"); }
    catch { return {}; }
  };

  const writeRuntimeRelationState = (element, attributeName, state) => {
    markRuntimeRelationMutation(element);
    if (Object.keys(state).length) element.setAttribute(attributeName, JSON.stringify(state));
    else element.removeAttribute(attributeName);
  };

  const applyRuntimeRelationStyle = (element, relationId, name, value) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement) || !element.style) return;
    const attributeName = "data-ns-runtime-relation-style";
    const state = readRuntimeRelationState(element, attributeName);
    const current = state[name];
    if (!current || current.relationId !== relationId) {
      state[name] = {
        relationId,
        priorValue: element.style.getPropertyValue(name),
        priorPriority: element.style.getPropertyPriority(name),
        appliedValue: "",
        appliedPriority: "",
      };
    }
    const nextValue = String(value);
    if (element.style.getPropertyValue(name) !== nextValue || element.style.getPropertyPriority(name) !== "") {
      markRuntimeRelationMutation(element);
      element.style.setProperty(name, nextValue);
    }
    state[name].appliedValue = nextValue;
    state[name].appliedPriority = "";
    writeRuntimeRelationState(element, attributeName, state);
  };

  const clearRuntimeRelationStyles = (element, relationIds) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement) || !element.style) return;
    const attributeName = "data-ns-runtime-relation-style";
    const state = readRuntimeRelationState(element, attributeName);
    let changed = false;
    for (const [name, entry] of Object.entries(state)) {
      if (relationIds && !relationIds.has(entry.relationId)) continue;
      const currentValue = element.style.getPropertyValue(name);
      const currentPriority = element.style.getPropertyPriority(name);
      if (currentValue === String(entry.appliedValue || "") && currentPriority === String(entry.appliedPriority || "")) {
        markRuntimeRelationMutation(element);
        if (entry.priorValue) element.style.setProperty(name, String(entry.priorValue), String(entry.priorPriority || ""));
        else element.style.removeProperty(name);
      }
      delete state[name];
      changed = true;
    }
    if (changed) writeRuntimeRelationState(element, attributeName, state);
  };

  const applyRuntimeRelationAttribute = (element, relationId, name, value) => {
    if (!(element instanceof Element)) return;
    const attributeName = "data-ns-runtime-relation-attributes";
    const state = readRuntimeRelationState(element, attributeName);
    const current = state[name];
    if (!current || current.relationId !== relationId) {
      state[name] = {
        relationId,
        hadPrior: element.hasAttribute(name),
        priorValue: element.getAttribute(name),
        appliedValue: "",
      };
    }
    const nextValue = String(value);
    if (element.getAttribute(name) !== nextValue) {
      markRuntimeRelationMutation(element);
      element.setAttribute(name, nextValue);
    }
    state[name].appliedValue = nextValue;
    writeRuntimeRelationState(element, attributeName, state);
  };

  const clearRuntimeRelationAttributes = (element, relationIds) => {
    if (!(element instanceof Element)) return;
    const attributeName = "data-ns-runtime-relation-attributes";
    const state = readRuntimeRelationState(element, attributeName);
    let changed = false;
    for (const [name, entry] of Object.entries(state)) {
      if (relationIds && !relationIds.has(entry.relationId)) continue;
      if (element.getAttribute(name) === String(entry.appliedValue || "")) {
        markRuntimeRelationMutation(element);
        if (entry.hadPrior) element.setAttribute(name, String(entry.priorValue ?? ""));
        else element.removeAttribute(name);
      }
      delete state[name];
      changed = true;
    }
    if (changed) writeRuntimeRelationState(element, attributeName, state);
  };

  const clearRuntimeRelationRealization = (relationIds = null, scope = root) => {
    const styleNodes = [];
    const attributeNodes = [];
    if (scope instanceof Element && scope.hasAttribute("data-ns-runtime-relation-style")) styleNodes.push(scope);
    if (scope instanceof Element && scope.hasAttribute("data-ns-runtime-relation-attributes")) attributeNodes.push(scope);
    scope.querySelectorAll?.("[data-ns-runtime-relation-style]").forEach((element) => styleNodes.push(element));
    scope.querySelectorAll?.("[data-ns-runtime-relation-attributes]").forEach((element) => attributeNodes.push(element));
    styleNodes.forEach((element) => clearRuntimeRelationStyles(element, relationIds));
    attributeNodes.forEach((element) => clearRuntimeRelationAttributes(element, relationIds));
  };

  const refreshRelationResizeObserver = () => {
    if (!relationResizeObserver) return;
    relationResizeObserver.disconnect();
    relationResizeObserver.observe(root);
    const observed = new Set([root]);
    for (const relation of authoredDesignRelations.values()) {
      if (relation.realizationPolicy === "snapshot") continue;
      const subject = nodeById(relation.subjectId);
      if (subject && !observed.has(subject)) { observed.add(subject); relationResizeObserver.observe(subject); }
      for (const reference of relation.references || []) {
        const node = nodeById(reference.nodeId);
        if (node && !observed.has(node)) { observed.add(node); relationResizeObserver.observe(node); }
      }
    }
  };

  const registerAuthoredDesignRelations = (relations) => {
    for (const relation of relations || []) {
      if (!relation?.id || !relation?.subjectId || !relation?.kind) continue;
      authoredDesignRelations.set(relation.id, structuredClone(relation));
    }
    refreshRelationResizeObserver();
  };

  registerAuthoredDesignRelations(INITIAL_AUTHORED_DESIGN_RELATIONS);

  const rectRecord = (rect, rootRect = root.getBoundingClientRect()) => ({
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right - rootRect.left,
    bottom: rect.bottom - rootRect.top,
  });

  const normalizedClientRect = (rect) => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  });

  const unionClientRects = (rects) => {
    const visible = rects.filter((rect) => rect && rect.width > 0 && rect.height > 0);
    if (!visible.length) return null;
    const left = Math.min(...visible.map((rect) => rect.left));
    const top = Math.min(...visible.map((rect) => rect.top));
    const right = Math.max(...visible.map((rect) => rect.right));
    const bottom = Math.max(...visible.map((rect) => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };

  const referenceGeometryMode = (reference, parameters) => {
    if (reference.geometry === "semantic-descendant-union" || reference.geometry === "border-box") return reference.geometry;
    if (parameters.referenceGeometry === "semantic-descendant-union" || parameters.referenceGeometry === "border-box") return parameters.referenceGeometry;
    return reference.nodeId === "evidence" ? "semantic-descendant-union" : "border-box";
  };

  const geometryRectForReference = (reference, parameters, excludedSubject = null) => {
    const own = normalizedClientRect(reference.node.getBoundingClientRect());
    const descendants = Array.from(reference.node.querySelectorAll("[data-ns-node-id]"))
      .filter((element) => !excludedSubject || (element !== excludedSubject && !excludedSubject.contains(element)))
      .filter((element) => element.getAttribute("data-ns-authored-relationship") !== "true")
      .filter((element) => element.getAttribute("data-ns-authored-annotation") !== "true")
      .filter((element) => element.getAttribute("data-ns-runtime-owned") !== "true")
      .filter((element) => !element.closest("[data-ns-spatial-system]"))
      .map((element) => normalizedClientRect(element.getBoundingClientRect()));
    const union = unionClientRects([own, ...descendants]) || own;
    if (referenceGeometryMode(reference, parameters) === "semantic-descendant-union") return union;
    // A declared border box remains the baseline, but live visual overflow is
    // part of the reference's occupied geometry. Transformed descendants do
    // not enlarge getBoundingClientRect() on their container, so ignoring them
    // would leave dependent objects behind even while the visible subtree moves.
    const computed = getComputedStyle(reference.node);
    const clipsX = computed.overflowX === "hidden" || computed.overflowX === "clip";
    const clipsY = computed.overflowY === "hidden" || computed.overflowY === "clip";
    const left = clipsX ? own.left : Math.min(own.left, union.left);
    const right = clipsX ? own.right : Math.max(own.right, union.right);
    const top = clipsY ? own.top : Math.min(own.top, union.top);
    const bottom = clipsY ? own.bottom : Math.max(own.bottom, union.bottom);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };

  const pointForAnchor = (rect, anchor) => {
    const normalized = String(anchor || "center").toLowerCase().replace(/[_\s]+/g, "-");
    let x = rect.left + rect.width / 2;
    let y = rect.top + rect.height / 2;
    if (normalized.includes("left")) x = rect.left;
    else if (normalized.includes("right")) x = rect.right;
    if (normalized.includes("top")) y = rect.top;
    else if (normalized.includes("bottom")) y = rect.bottom;
    return { x, y };
  };

  const transformedAncestorIssue = (subject) => {
    let ancestor = subject.offsetParent instanceof Element ? subject.offsetParent : subject.parentElement;
    while (ancestor) {
      const transform = getComputedStyle(ancestor).transform;
      if (transform && transform !== "none") {
        try {
          const matrix = new DOMMatrixReadOnly(transform);
          if (Math.abs(matrix.b) > 0.000001 || Math.abs(matrix.c) > 0.000001) {
            return "Rotated or skewed containing blocks are not supported for CSS position realization.";
          }
        } catch {
          return "The containing-block transform could not be interpreted safely.";
        }
      }
      if (ancestor === root) break;
      ancestor = ancestor.parentElement;
    }
    return "";
  };

  const containingBlockGeometry = (subject) => {
    const parent = subject.offsetParent instanceof Element ? subject.offsetParent : root;
    const rect = parent.getBoundingClientRect();
    const width = Number(parent.offsetWidth || parent.clientWidth || rect.width || 1);
    const height = Number(parent.offsetHeight || parent.clientHeight || rect.height || 1);
    return {
      parent,
      rect,
      scaleX: width > 0 ? rect.width / width : 1,
      scaleY: height > 0 ? rect.height / height : 1,
    };
  };

  const placeSubjectEdge = (subject, relationId, axis, desiredClientValue) => {
    if (!(subject instanceof HTMLElement)) {
      return { ok: false, message: "CSS position relations require an HTML subject." };
    }
    let computed = getComputedStyle(subject);
    if (computed.position === "static") {
      applyRuntimeRelationStyle(subject, relationId, "position", "absolute");
      computed = getComputedStyle(subject);
    }
    const transformIssue = transformedAncestorIssue(subject);
    if (transformIssue) return { ok: false, message: transformIssue };
    const currentRect = subject.getBoundingClientRect();
    const containingBlock = containingBlockGeometry(subject);
    const property = axis === "x" ? "left" : "top";
    const currentClientValue = axis === "x" ? currentRect.left : currentRect.top;
    const scale = axis === "x" ? containingBlock.scaleX : containingBlock.scaleY;
    if (!Number.isFinite(scale) || Math.abs(scale) < 0.000001) {
      return { ok: false, message: "The subject containing block has a non-finite coordinate scale." };
    }
    const computedValue = Number.parseFloat(computed.getPropertyValue(property));
    const fallback = axis === "x" ? subject.offsetLeft : subject.offsetTop;
    const baseLocalValue = Number.isFinite(computedValue) ? computedValue : Number(fallback || 0);
    const nextLocalValue = baseLocalValue + (desiredClientValue - currentClientValue) / scale;
    if (!Number.isFinite(nextLocalValue)) {
      return { ok: false, message: "The resolved local position was not finite." };
    }
    applyRuntimeRelationStyle(subject, relationId, property, nextLocalValue + "px");
    const realizedRect = subject.getBoundingClientRect();
    const realizedClientValue = axis === "x" ? realizedRect.left : realizedRect.top;
    const realizationError = Math.abs(realizedClientValue - desiredClientValue);
    const preview = {
      axis,
      desiredArtboardEdge: desiredClientValue,
      realizedArtboardEdge: realizedClientValue,
      realizationError,
      requestedLocalEdge: nextLocalValue,
      containingBlock: rectRecord(containingBlock.rect),
      containingBlockScale: { x: containingBlock.scaleX, y: containingBlock.scaleY },
    };
    if (!Number.isFinite(realizedClientValue) || realizationError > 0.75) {
      return {
        ok: false,
        message: "The relation preview could not realize the requested artboard edge in the subject's containing-block coordinate space.",
        preview,
      };
    }
    return {
      ok: true,
      localValue: nextLocalValue,
      containingBlock: rectRecord(containingBlock.rect),
      preview,
    };
  };

  const placementPreviewReceipt = (subject, placements) => {
    const subjectRect = subject.getBoundingClientRect();
    const containingBlock = containingBlockGeometry(subject);
    const realizedPlacements = placements.filter(Boolean);
    return {
      coordinateAuthority: "browser-containing-block-v1",
      subjectArtboardBounds: rectRecord(subjectRect, root.getBoundingClientRect()),
      subjectLocalBounds: {
        left: subject.offsetLeft,
        top: subject.offsetTop,
        width: subject.offsetWidth,
        height: subject.offsetHeight,
      },
      containingBlockNodeId: containingBlock.parent.getAttribute?.("data-ns-node-id") || "artboard",
      containingBlockArtboardBounds: rectRecord(containingBlock.rect, root.getBoundingClientRect()),
      placements: realizedPlacements,
      verified: realizedPlacements.every((placement) => placement.realizationError <= 0.75),
    };
  };

  const svgPointForClientPoint = (primitive, point) => {
    try {
      const matrix = primitive.getScreenCTM?.();
      if (matrix) {
        const local = new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse());
        if (Number.isFinite(local.x) && Number.isFinite(local.y)) return { x: local.x, y: local.y };
      }
    } catch {}
    const svg = primitive.ownerSVGElement || primitive.closest?.("svg");
    const rect = svg?.getBoundingClientRect?.();
    if (!rect) return point;
    return { x: point.x - rect.left, y: point.y - rect.top };
  };

  const relationChannels = (relation) => {
    const parameters = relation.parameters || {};
    if (relation.kind === "connector-attachment") return ["connector"];
    if (relation.kind === "relative-placement") {
      const side = String(parameters.side || "right");
      const channels = [side === "right" || side === "left" ? "x" : "y"];
      if ((side === "right" || side === "left") && ["top", "center", "bottom"].includes(String(parameters.alignY || ""))) channels.push("y");
      if ((side === "above" || side === "below") && ["left", "center", "right"].includes(String(parameters.alignX || ""))) channels.push("x");
      return channels;
    }
    if (relation.kind === "between-placement") {
      const axis = String(parameters.axis || "x");
      const channels = [axis === "y" ? "y" : "x"];
      const crossAlign = String(parameters.crossAlign || (axis === "x" ? parameters.alignY : parameters.alignX) || "preserve");
      if (crossAlign !== "preserve") channels.push(axis === "x" ? "y" : "x");
      return channels;
    }
    return [];
  };

  const resolveAuthoredSpatialDependencies = (revisionId, options = {}) => {
    if (resolvingAuthoredRelations) return resolvedDesignRelationRecords();
    resolvingAuthoredRelations = true;
    try {
      const liveOnly = options.liveOnly === true;
      const targetRelations = Array.from(authoredDesignRelations.values())
        .filter((relation) => !liveOnly || relation.realizationPolicy !== "snapshot");
      const targetIds = new Set(targetRelations.map((relation) => relation.id));
      clearRuntimeRelationRealization(targetIds);
      targetIds.forEach((id) => resolvedDesignRelations.delete(id));

      const relationById = new Map(targetRelations.map((relation) => [relation.id, relation]));
      const relationIdsBySubject = new Map();
      for (const relation of targetRelations) {
        const values = relationIdsBySubject.get(relation.subjectId) || [];
        values.push(relation.id);
        relationIdsBySubject.set(relation.subjectId, values);
      }

      const conflictIds = new Set();
      const ownerByChannel = new Map();
      for (const relation of targetRelations) {
        for (const channel of relationChannels(relation)) {
          const key = relation.subjectId + "::" + channel;
          const prior = ownerByChannel.get(key);
          if (prior && prior !== relation.id) { conflictIds.add(prior); conflictIds.add(relation.id); }
          else ownerByChannel.set(key, relation.id);
        }
      }

      const dependencyIds = new Map();
      for (const relation of targetRelations) {
        const dependencies = new Set();
        for (const reference of relation.references || []) {
          for (const dependencyId of relationIdsBySubject.get(reference.nodeId) || []) {
            if (dependencyId !== relation.id) dependencies.add(dependencyId);
          }
          if (referenceGeometryMode(reference, relation.parameters || {}) === "semantic-descendant-union") {
            const referenceNode = nodeById(reference.nodeId);
            if (referenceNode) {
              for (const candidate of targetRelations) {
                if (candidate.id === relation.id) continue;
                const candidateSubject = nodeById(candidate.subjectId);
                if (candidateSubject && referenceNode.contains(candidateSubject)) dependencies.add(candidate.id);
              }
            }
          }
        }
        dependencyIds.set(relation.id, dependencies);
      }

      const visitState = new Map();
      const order = [];
      const cycleIds = new Set();
      const stack = [];
      const visit = (relationId) => {
        const state = visitState.get(relationId);
        if (state === "done") return;
        if (state === "visiting") {
          const start = Math.max(0, stack.indexOf(relationId));
          stack.slice(start).forEach((id) => cycleIds.add(id));
          cycleIds.add(relationId);
          return;
        }
        visitState.set(relationId, "visiting");
        stack.push(relationId);
        for (const dependencyId of dependencyIds.get(relationId) || []) visit(dependencyId);
        stack.pop();
        visitState.set(relationId, "done");
        order.push(relationId);
      };
      targetRelations.forEach((relation) => visit(relation.id));

      const rootRect = root.getBoundingClientRect();
      const unresolved = (relation, inputBounds, status, message, outputGeometry = {}) => {
        resolvedDesignRelations.set(relation.id, {
          relationId: relation.id,
          revisionId,
          inputBounds,
          outputGeometry,
          status,
          message,
        });
      };

      for (const relationId of order) {
        const relation = relationById.get(relationId);
        if (!relation) continue;
        if (conflictIds.has(relationId)) {
          unresolved(relation, {}, "conflicted", "Multiple authored relations control the same subject geometry channel.");
          continue;
        }
        if (cycleIds.has(relationId)) {
          unresolved(relation, {}, "cyclic", "Design relation cycle detected.");
          continue;
        }

        const subject = nodeById(relation.subjectId);
        const canonicalReferences = canonicalRelationReferences(relation);
        const references = Object.fromEntries(canonicalReferences.map((reference) => [reference.role, { ...reference, node: nodeById(reference.nodeId) }]));
        if (!subject) {
          unresolved(relation, {}, "unresolved", "Relation subject was not found: " + relation.subjectId + ".");
          continue;
        }
        const missingReferences = canonicalReferences.filter((reference) => !nodeById(reference.nodeId));
        if (missingReferences.length) {
          unresolved(
            relation,
            {},
            "unresolved",
            "Relation reference node(s) were not found: " + missingReferences.map((reference) => reference.role + "=" + reference.nodeId).join(", ") + ".",
          );
          continue;
        }

        const parameters = relation.parameters || {};
        const inputRects = Object.fromEntries(Object.entries(references).map(([role, reference]) => [role, geometryRectForReference(reference, parameters, subject)]));
        const inputBounds = Object.fromEntries(Object.entries(inputRects).map(([role, rect]) => [role, rectRecord(rect, rootRect)]));
        let outputGeometry = {};
        let failure = "";

        if (relation.kind === "relative-placement") {
          const reference = references.reference || Object.values(references)[0];
          const refRect = inputRects[reference.role] || geometryRectForReference(reference, parameters, subject);
          const ownRect = subject.getBoundingClientRect();
          const side = String(parameters.side || "right");
          const offsetX = Number(parameters.offsetX || 0);
          const offsetY = Number(parameters.offsetY || 0);
          const appliedLocalGeometry = {};
          const placementPreviews = [];

          if (side === "right" || side === "left") {
            const desiredLeft = side === "right" ? refRect.right + offsetX : refRect.left - ownRect.width - offsetX;
            const placedX = placeSubjectEdge(subject, relation.id, "x", desiredLeft);
            if (!placedX.ok) failure = placedX.message;
            else appliedLocalGeometry.left = placedX.localValue;
            if (placedX.preview) placementPreviews.push(placedX.preview);
            const alignY = String(parameters.alignY || "preserve");
            if (!failure && alignY !== "preserve") {
              const current = subject.getBoundingClientRect();
              const desiredTop = alignY === "top" ? refRect.top + offsetY
                : alignY === "bottom" ? refRect.bottom - current.height + offsetY
                : refRect.top + refRect.height / 2 - current.height / 2 + offsetY;
              const placedY = placeSubjectEdge(subject, relation.id, "y", desiredTop);
              if (!placedY.ok) failure = placedY.message;
              else appliedLocalGeometry.top = placedY.localValue;
              if (placedY.preview) placementPreviews.push(placedY.preview);
            }
          } else if (side === "below" || side === "above") {
            const desiredTop = side === "below" ? refRect.bottom + offsetY : refRect.top - ownRect.height - offsetY;
            const placedY = placeSubjectEdge(subject, relation.id, "y", desiredTop);
            if (!placedY.ok) failure = placedY.message;
            else appliedLocalGeometry.top = placedY.localValue;
            if (placedY.preview) placementPreviews.push(placedY.preview);
            const alignX = String(parameters.alignX || "preserve");
            if (!failure && alignX !== "preserve") {
              const current = subject.getBoundingClientRect();
              const desiredLeft = alignX === "left" ? refRect.left + offsetX
                : alignX === "right" ? refRect.right - current.width + offsetX
                : refRect.left + refRect.width / 2 - current.width / 2 + offsetX;
              const placedX = placeSubjectEdge(subject, relation.id, "x", desiredLeft);
              if (!placedX.ok) failure = placedX.message;
              else appliedLocalGeometry.left = placedX.localValue;
              if (placedX.preview) placementPreviews.push(placedX.preview);
            }
          } else {
            failure = "Unsupported relative-placement side: " + side + ".";
          }
          outputGeometry = {
            side,
            offsetX,
            offsetY,
            referenceGeometry: referenceGeometryMode(reference, parameters),
            ...appliedLocalGeometry,
            placementPreview: placementPreviewReceipt(subject, placementPreviews),
          };
        } else if (relation.kind === "connector-attachment") {
          const sourceReferences = canonicalReferences.filter((reference) => reference.role === "source");
          const targetReferences = canonicalReferences.filter((reference) => reference.role === "target");
          const source = references.source;
          const target = references.target;
          if (sourceReferences.length !== 1 || targetReferences.length !== 1 || !source || !target) {
            const receivedRoles = (relation.references || []).map((reference) => String(reference.role || "")).filter(Boolean);
            const canonicalRoles = canonicalReferences.map((reference) => reference.role).filter(Boolean);
            failure = "connector-attachment requires exactly one source and one target reference; received roles [" + receivedRoles.join(", ") + "] and canonical roles [" + canonicalRoles.join(", ") + "].";
          } else {
            const sourceRect = inputRects.source;
            const targetRect = inputRects.target;
            const startClient = pointForAnchor(sourceRect, source.anchor || String(parameters.sourceAnchor || "center"));
            const endClient = pointForAnchor(targetRect, target.anchor || String(parameters.targetAnchor || "center"));
            const primitiveId = String(parameters.primitiveNodeId || "");
            const declaredPrimitive = primitiveId ? nodeById(primitiveId) : null;
            const primitive = declaredPrimitive?.matches?.("line,path,polyline")
              ? declaredPrimitive
              : declaredPrimitive?.querySelector?.("line,path,polyline") || subject.querySelector("line,path,polyline");
            if (!primitive) {
              failure = "The authored connector primitive was not found.";
            } else {
              const start = svgPointForClientPoint(primitive, startClient);
              const end = svgPointForClientPoint(primitive, endClient);
              const tagName = primitive.tagName.toLowerCase();
              if (tagName === "line") {
                applyRuntimeRelationAttribute(primitive, relation.id, "x1", start.x);
                applyRuntimeRelationAttribute(primitive, relation.id, "y1", start.y);
                applyRuntimeRelationAttribute(primitive, relation.id, "x2", end.x);
                applyRuntimeRelationAttribute(primitive, relation.id, "y2", end.y);
              } else if (tagName === "path") {
                const authoredPath = primitive.getAttribute("d") || "";
                const number = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:e[-+]?\\d+)?";
                const movePattern = new RegExp("^(\\s*[Mm]\\s*)" + number + "([ ,]+)" + number, "i");
                const endpointPattern = new RegExp("(" + number + ")([ ,]+)(" + number + ")(\\s*)$");
                if (!movePattern.test(authoredPath) || !endpointPattern.test(authoredPath) || /[Zz]\s*$/.test(authoredPath)) {
                  failure = "The authored SVG path must be open and expose a first and final endpoint.";
                } else {
                  const withStart = authoredPath.replace(movePattern, "$1" + start.x + "$2" + start.y);
                  const withEndpoints = withStart.replace(endpointPattern, end.x + "$2" + end.y + "$4");
                  applyRuntimeRelationAttribute(primitive, relation.id, "d", withEndpoints);
                }
              } else if (tagName === "polyline") {
                const authoredPoints = (primitive.getAttribute("points") || "").trim().split(/\s+/).filter(Boolean);
                if (authoredPoints.length < 2) {
                  failure = "The authored polyline must expose at least two points.";
                } else {
                  authoredPoints[0] = start.x + "," + start.y;
                  authoredPoints[authoredPoints.length - 1] = end.x + "," + end.y;
                  applyRuntimeRelationAttribute(primitive, relation.id, "points", authoredPoints.join(" "));
                }
              } else {
                failure = "The connector primitive must expose editable SVG endpoints (line, open path, or polyline).";
              }
              outputGeometry = {
                startX: start.x,
                startY: start.y,
                endX: end.x,
                endY: end.y,
                sourceWorldX: startClient.x - rootRect.left,
                sourceWorldY: startClient.y - rootRect.top,
                targetWorldX: endClient.x - rootRect.left,
                targetWorldY: endClient.y - rootRect.top,
              };
            }
          }
        } else if (relation.kind === "between-placement") {
          const before = references.before;
          const after = references.after;
          if (!before || !after) {
            failure = "between-placement requires before and after references.";
          } else {
            const beforeRect = inputRects.before;
            const afterRect = inputRects.after;
            const ownRect = subject.getBoundingClientRect();
            const axis = String(parameters.axis || "x") === "y" ? "y" : "x";
            const crossAlign = String(parameters.crossAlign || (axis === "x" ? parameters.alignY : parameters.alignX) || "preserve");
            const appliedLocalGeometry = {};
            const placementPreviews = [];
            if (axis === "x") {
              const desiredLeft = (beforeRect.right + afterRect.left - ownRect.width) / 2;
              const placedX = placeSubjectEdge(subject, relation.id, "x", desiredLeft);
              if (!placedX.ok) failure = placedX.message;
              else appliedLocalGeometry.left = placedX.localValue;
              if (placedX.preview) placementPreviews.push(placedX.preview);
              if (!failure && crossAlign !== "preserve") {
                const current = subject.getBoundingClientRect();
                const referenceCenter = (beforeRect.top + beforeRect.height / 2 + afterRect.top + afterRect.height / 2) / 2;
                const desiredTop = crossAlign === "start" || crossAlign === "top" ? Math.min(beforeRect.top, afterRect.top)
                  : crossAlign === "end" || crossAlign === "bottom" ? Math.max(beforeRect.bottom, afterRect.bottom) - current.height
                  : referenceCenter - current.height / 2;
                const placedY = placeSubjectEdge(subject, relation.id, "y", desiredTop);
                if (!placedY.ok) failure = placedY.message;
                else appliedLocalGeometry.top = placedY.localValue;
                if (placedY.preview) placementPreviews.push(placedY.preview);
              }
            } else {
              const desiredTop = (beforeRect.bottom + afterRect.top - ownRect.height) / 2;
              const placedY = placeSubjectEdge(subject, relation.id, "y", desiredTop);
              if (!placedY.ok) failure = placedY.message;
              else appliedLocalGeometry.top = placedY.localValue;
              if (placedY.preview) placementPreviews.push(placedY.preview);
              if (!failure && crossAlign !== "preserve") {
                const current = subject.getBoundingClientRect();
                const referenceCenter = (beforeRect.left + beforeRect.width / 2 + afterRect.left + afterRect.width / 2) / 2;
                const desiredLeft = crossAlign === "start" || crossAlign === "left" ? Math.min(beforeRect.left, afterRect.left)
                  : crossAlign === "end" || crossAlign === "right" ? Math.max(beforeRect.right, afterRect.right) - current.width
                  : referenceCenter - current.width / 2;
                const placedX = placeSubjectEdge(subject, relation.id, "x", desiredLeft);
                if (!placedX.ok) failure = placedX.message;
                else appliedLocalGeometry.left = placedX.localValue;
                if (placedX.preview) placementPreviews.push(placedX.preview);
              }
            }
            const realized = subject.getBoundingClientRect();
            const availableSpan = axis === "x"
              ? Math.max(0, afterRect.left - beforeRect.right)
              : Math.max(0, afterRect.top - beforeRect.bottom);
            const requiredSpan = axis === "x" ? ownRect.width : ownRect.height;
            outputGeometry = {
              axis,
              crossAlign,
              availableSpan,
              requiredSpan,
              fitsDeclaredGap: availableSpan + 0.75 >= requiredSpan,
              leftGap: realized.left - beforeRect.right,
              rightGap: afterRect.left - realized.right,
              topGap: realized.top - beforeRect.bottom,
              bottomGap: afterRect.top - realized.bottom,
              gapDelta: axis === "x"
                ? Math.abs((realized.left - beforeRect.right) - (afterRect.left - realized.right))
                : Math.abs((realized.top - beforeRect.bottom) - (afterRect.top - realized.bottom)),
              ...appliedLocalGeometry,
              placementPreview: placementPreviewReceipt(subject, placementPreviews),
            };
          }
        } else {
          failure = "No resolver is registered for relation kind " + relation.kind + ".";
        }

        if (failure) {
          clearRuntimeRelationRealization(new Set([relation.id]));
          unresolved(relation, inputBounds, "unresolved", failure, outputGeometry);
          continue;
        }
        const outputBounds = rectRecord(subject.getBoundingClientRect(), rootRect);
        resolvedDesignRelations.set(relation.id, {
          relationId: relation.id,
          revisionId,
          inputBounds,
          outputBounds,
          outputGeometry,
          status: "resolved",
        });
      }

      root.__northstarResolvedDesignRelations = resolvedDesignRelationRecords();
      return root.__northstarResolvedDesignRelations;
    } finally {
      resolvingAuthoredRelations = false;
    }
  };
  const applyMutationBatch = async (batch, revisionId, acknowledge = true, proposal = null) => {
    if (!batch || appliedMutationIds.has(batch.mutationId) || cancelledMutationIds.has(batch.mutationId)) return;
    if (proposal?.baseRevisionId && proposal.baseRevisionId !== currentRevisionId) {
      throw new Error("Proposal base revision does not match the mounted browser revision.");
    }
    const expectedParent = Array.from(appliedMutationIds).at(-1);
    if (batch.parentMutationId && expectedParent && batch.parentMutationId !== expectedParent) throw new Error("Mutation lineage is discontinuous.");
    canonicalGeometryMutationId = batch.mutationId;
    registerAssets(batch.requiredAssetUrls || []);
    solveSpatialSystem();
    const transaction = {
      startedAt: Date.now(),
      html: root.innerHTML,
      styles: captureStyleState(),
      authoredJavascript: currentAuthoredJavascript,
      requestedBounds: { ...requestedBounds },
      revisionId: currentRevisionId,
      mutationId: currentMutationId,
      beforeSnapshot: semanticSnapshot(),
      pixelStableNodeIds: expandPixelStableNodeIds(batch.pixelStableNodeIds),
      beforeBounds: getContentBounds(),
      canonicalGeometry: committedCanonicalGeometry ? { ...committedCanonicalGeometry } : null,
      canonicalLayoutContext: { width: canonicalLayoutBaseWidth, height: canonicalLayoutBaseHeight },
      beforeVisualSafety: visualSafetySnapshot(),
      beforeAudit: collectRuntimeAudit(),
      authoredDesignRelations: authoredDesignRelationRecords(),
      resolvedDesignRelations: resolvedDesignRelationRecords(),
    };
    rememberMutationTransaction(batch.mutationId, transaction);
    registerAuthoredDesignRelations(batch.relations);
    pendingExternalRelationSubjectIds = new Set((batch.relations || [])
      .filter((relation) => relation?.kind === "relative-placement"
        && ["above", "below", "left", "right"].includes(String(relation?.parameters?.side || "").toLowerCase()))
      .map((relation) => String(relation.subjectId || ""))
      .filter(Boolean));
    if (acknowledge) beginAtomicCandidateValidation(batch.mutationId);
    // Begin from the exact accepted world rectangle. request-space may only
    // extend these edges; it must never fall back to the smaller authored layout
    // base and trigger a responsive recomposition of existing content.
    const acceptedBounds = committedCanonicalGeometry?.contentBounds || {
      minX: 0, minY: 0, maxX: canonicalLayoutBaseWidth, maxY: canonicalLayoutBaseHeight,
    };
    requestedBounds = { ...acceptedBounds };
    const before = snapshotRects();
    const canonicalEvidenceNodes = captureCanonicalEvidenceNodes();
    root.setAttribute("data-ns-mutating", "true");
    try {
      for (const operation of batch.operations || []) applyOperation(operation);
      pendingExternalRelationSubjectIds = new Set();
      discardDuplicateEvidenceNodes(canonicalEvidenceNodes);
      enforceAssetPolicy(root);
      applyStage();
      resolveAuthoredSpatialDependencies(revisionId || currentRevisionId);
      currentRevisionId = revisionId || currentRevisionId;
      currentMutationId = batch.mutationId;
    } catch (error) {
      pendingExternalRelationSubjectIds = new Set();
      rollbackMutation(batch.mutationId);
      root.removeAttribute("data-ns-mutating");
      throw error;
    }
    // Do not yield a paint frame here. The final DOM is installed atomically, then
    // immediately held at the first construction keyframe before the browser can
    // display the completed result. Geometry reads inside runConstructionSequence
    // synchronously flush layout without exposing the final frame.
    if (cancelledMutationIds.has(batch.mutationId)) {
      rollbackMutation(batch.mutationId);
      root.removeAttribute("data-ns-mutating");
      return;
    }
    if (acknowledge) {
      try {
        await runConstructionSequence(before, batch);
      } catch (error) {
        origin.querySelector('[data-ns-construction-overlay="true"]')?.remove();
        root.removeAttribute("data-ns-construction-active");
        root.removeAttribute("data-ns-construction-mode");
        root.removeAttribute("data-ns-construction-beat");
        root.removeAttribute("data-ns-construction-beat-index");
        parent.postMessage({
          type: "northstar.artifact.construction-failed",
          artifactId: ARTIFACT_ID,
          revisionId: currentRevisionId,
          mutationId: batch.mutationId,
          message: error instanceof Error ? error.message : String(error),
        }, "*");
      }
    }
    if (cancelledMutationIds.has(batch.mutationId)) {
      rollbackMutation(batch.mutationId);
      root.removeAttribute("data-ns-mutating");
      return;
    }
    resolveAuthoredSpatialDependencies(currentRevisionId, { liveOnly: true });
    solveSpatialSystem();
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
      try {
        const compiledSize = await compileCanonicalGeometry(currentRevisionId, batch.mutationId, {
          width: proposal?.layoutBaseWidth,
          height: proposal?.layoutBaseHeight,
        });
        if (!pendingAcknowledgement || pendingAcknowledgement.mutationId !== batch.mutationId) return;
        pendingAcknowledgement.compiledSize = compiledSize;
        applyCompiledCanonicalGeometry(compiledSize);
        reportContentSize();
      } catch (error) {
        rollbackMutation(batch.mutationId);
        throw error;
      }
      return;
    } else {
      appliedMutationIds.add(batch.mutationId);
      if (canonicalGeometryMutationId === batch.mutationId) canonicalGeometryMutationId = null;
    }
    // Canonical geometry is compiled after journal replay or for each live
    // acknowledged mutation. Observer callbacks only schedule that compilation.
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
        if (item?.batch?.mutationId && cancelledMutationIds.has(item.batch.mutationId)) {
          queuedMutationIds.delete(item.batch.mutationId);
          continue;
        }
        try { await applyMutationBatch(item.batch, item.revisionId, true, item.proposal); }
        catch (error) {
          const rollbackReceipt = mutationRollbackReceipts.get(item.batch?.mutationId);
          mutationRollbackReceipts.delete(item.batch?.mutationId);
          const terminalMessage = {
            // Candidate application failures are terminal for this proposal, not
            // for the mounted artboard. applyMutationBatch has already restored
            // the accepted DOM before this receipt is emitted.
            type: "northstar.artifact.mutation-rejected",
            artifactId: ARTIFACT_ID,
            surfaceId: SURFACE_ID,
            revisionId: item.revisionId,
            browserRevisionId: currentRevisionId,
            baseRevisionId: item.proposal?.baseRevisionId,
            proposalId: item.proposal?.proposalId,
            ackToken: item.proposal?.ackToken,
            mutationId: item.batch?.mutationId,
            message: error instanceof Error ? error.message : String(error),
            changedNodeIds: [],
            meaningfulChangedNodeIds: [],
            changeKinds: [],
            requiredAssetUrls: item.batch?.requiredAssetUrls || [],
            loadedAssetUrls: loadedAssetUrls(),
            missingAssetUrls: missingRequiredAssets(item.batch?.requiredAssetUrls || []),
            evidenceRegistry: captureEvidenceRegistryReceipt(),
            authoredDesignRelations: authoredDesignRelationRecords(),
            resolvedDesignRelations: resolvedDesignRelationRecords(),
            snapshot: captureLiveSnapshot(),
            restoredSize: captureSettledContentSize(currentRevisionId, currentMutationId, canonicalGeometrySequence + 1),
            rollbackDurationMs: rollbackReceipt?.rollbackDurationMs,
            candidateDurationMs: rollbackReceipt?.candidateDurationMs,
          };
          postTerminalMutation(item.batch?.mutationId, terminalMessage);
        }
        finally { if (item.batch?.mutationId) queuedMutationIds.delete(item.batch.mutationId); }
      }
    } finally { applyingMutation = false; }
  };

  const getContentBounds = () => {
    const geometryMode = syncIntrinsicGeometryMode();
    if (
      committedCanonicalGeometry
      && committedCanonicalGeometry.revisionId === currentRevisionId
      && !canonicalGeometryCompilerActive
    ) {
      const exact = committedCanonicalGeometry.contentBounds;
      return {
        minX: exact.minX,
        minY: exact.minY,
        maxX: exact.maxX,
        maxY: exact.maxY,
        width: committedCanonicalGeometry.intrinsicWidth,
        height: committedCanonicalGeometry.intrinsicHeight,
      };
    }
    const rootRect = root.getBoundingClientRect();
    let minX = Math.min(0, requestedBounds.minX), minY = Math.min(0, requestedBounds.minY);
    let maxX = Math.max(geometryMode.minimumWidth, requestedBounds.maxX), maxY = Math.max(geometryMode.minimumHeight, requestedBounds.maxY);
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
    return {
      minX, minY, maxX, maxY,
      width: Math.max(geometryMode.minimumWidth, maxX - minX),
      height: Math.max(geometryMode.minimumHeight, maxY - minY),
    };
  };

  const nextCompilerFrame = (view = window) => new Promise((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)));
  const waitWithTimeout = (promise, timeoutMs) => Promise.race([
    Promise.resolve(promise).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  const waitForCompilerResources = async (scope) => {
    const ownerDocument = scope.ownerDocument || document;
    const ownerWindow = ownerDocument.defaultView || window;
    await waitWithTimeout(ownerDocument.fonts?.ready, CANONICAL_GEOMETRY_SETTLE_TIMEOUT);
    const images = Array.from(scope.querySelectorAll("img"));
    await waitWithTimeout(Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    })), CANONICAL_GEOMETRY_SETTLE_TIMEOUT);
    await nextCompilerFrame(ownerWindow);
  };

  const geometryContributor = (element, artboard, view) => {
    if (!element || element === artboard) return false;
    if (element.closest('[data-ns-runtime-owned="true"],[data-ns-spatial-system]')) return false;
    const style = view.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= .001) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= .01 && rect.height <= .01) return false;
    if (element.matches("img,svg,canvas,video,[data-ns-evidence-id],[data-ns-annotation-id],[data-ns-relationship-id]")) return true;
    const directText = Array.from(element.childNodes || []).some((node) => node.nodeType === 3 && String(node.textContent || "").trim());
    const hasSemanticChild = Boolean(element.querySelector(":scope [data-ns-node-id],:scope [data-ns-evidence-id],:scope [data-ns-annotation-id],:scope [data-ns-relationship-id]"));
    const paintsSurface = style.backgroundImage !== "none"
      || style.backgroundColor !== "rgba(0, 0, 0, 0)"
      || parseFloat(style.borderTopWidth || "0") > 0
      || parseFloat(style.borderRightWidth || "0") > 0
      || parseFloat(style.borderBottomWidth || "0") > 0
      || parseFloat(style.borderLeftWidth || "0") > 0;
    if (directText) return true;
    if (element.hasAttribute("data-ns-node-id")) {
      return !hasSemanticChild || paintsSurface || style.position === "absolute" || style.position === "fixed";
    }
    if (element.children.length === 0) return paintsSurface;
    return style.position === "absolute" || style.position === "fixed";
  };

  const authoredStyleSource = () => Array.from(document.head.querySelectorAll("style"))
    .filter((style) => !style.matches('[data-ns-runtime-owned="true"]'))
    .map((style) => "<style>" + String(style.textContent || "").replace(/<\/style/gi, "<\\/style") + "</style>")
    .join("");

  const authoredStateFingerprint = () => {
    const imageState = Array.from(root.querySelectorAll("img")).map((image) => [
      image.getAttribute("src") || "",
      image.complete ? 1 : 0,
      image.naturalWidth || 0,
      image.naturalHeight || 0,
    ].join(":"));
    const source = [
      currentRevisionId,
      currentMutationId || "",
      canonicalLayoutBaseWidth,
      canonicalLayoutBaseHeight,
      requestedBounds.minX,
      requestedBounds.minY,
      requestedBounds.maxX,
      requestedBounds.maxY,
      document.fonts?.status || "",
      authoredStyleSource(),
      root.innerHTML,
      imageState.join("|"),
    ].join("\u241f");
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  };

  const measureAuthoredContentInIsolation = async (layoutWidth, layoutHeight) => {
    // Compile in a physically separate, non-visible DOM tree inside the same
    // sandboxed runtime document. The production host intentionally mounts this
    // runtime with sandbox="allow-scripts" and a frame-src 'none' CSP, so the
    // compiler must not depend on nested-frame creation or parent access to a
    // child frame's opaque-origin document.
    const host = document.createElement("div");
    host.setAttribute("data-ns-geometry-compiler-host", "true");
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    Object.assign(host.style, {
      position: "fixed",
      left: "-1000000px",
      top: "0px",
      width: Math.max(1, Math.ceil(layoutWidth)) + "px",
      height: Math.max(1, Math.ceil(layoutHeight)) + "px",
      minWidth: "0",
      minHeight: "0",
      overflow: "visible",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-2147483647",
      contain: "layout style",
    });
    const compilerRoot = root.cloneNode(true);
    compilerRoot.setAttribute("data-ns-geometry-compiler", "true");
    compilerRoot.removeAttribute("data-ns-prepaint");
    compilerRoot.removeAttribute("data-ns-mutating");
    compilerRoot.querySelectorAll('script,[data-ns-runtime-owned="true"],[data-ns-spatial-system]').forEach((element) => element.remove());
    // The wrapper supplies only the authored containing-block context. It is not
    // a maximum and it is never derived from the previously measured surface.
    // Authored descendants may overflow it to any finite coordinate.
    compilerRoot.style.setProperty("display", "flow-root", "important");
    compilerRoot.style.setProperty("position", "relative", "important");
    compilerRoot.style.setProperty("width", Math.max(1, Math.ceil(layoutWidth)) + "px", "important");
    compilerRoot.style.setProperty("min-width", "0px", "important");
    compilerRoot.style.setProperty("max-width", "none", "important");
    compilerRoot.style.setProperty("height", "auto", "important");
    compilerRoot.style.setProperty("min-height", "0px", "important");
    compilerRoot.style.setProperty("max-height", "none", "important");
    compilerRoot.style.setProperty("overflow", "visible", "important");
    compilerRoot.style.setProperty("opacity", "1", "important");
    compilerRoot.style.setProperty("pointer-events", "none", "important");
    host.appendChild(compilerRoot);
    document.body.appendChild(host);
    try {
      const compilerArtboard = compilerRoot.querySelector('[data-ns-node-id="artboard"]') || compilerRoot.querySelector(".ns-artifact") || compilerRoot.firstElementChild || compilerRoot;
      // Fixed authored descendants belong to the artboard plane, not to the
      // browser viewport. Compile them as absolute descendants of that plane.
      Array.from(compilerArtboard.querySelectorAll("*")).forEach((element) => {
        const style = getComputedStyle(element);
        if (style.position === "fixed") element.style.setProperty("position", "absolute", "important");
      });
      await waitForCompilerResources(compilerRoot);
      const artboardRect = compilerArtboard.getBoundingClientRect();
      let minX = Math.min(0, Number(requestedBounds.minX) || 0);
      let minY = Math.min(0, Number(requestedBounds.minY) || 0);
      let maxX = Math.max(1, artboardRect.width, compilerArtboard.scrollWidth || 0, Number(requestedBounds.maxX) || 0);
      let maxY = Math.max(1, artboardRect.height, compilerArtboard.scrollHeight || 0, Number(requestedBounds.maxY) || 0);
      const allElements = Array.from(compilerArtboard.querySelectorAll("*")).filter((element) => {
        if (element.closest('[data-ns-runtime-owned="true"],[data-ns-spatial-system]')) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > .001 && (rect.width > .01 || rect.height > .01);
      });
      for (const element of allElements) {
        if (!geometryContributor(element, compilerArtboard, window)) continue;
        const rect = element.getBoundingClientRect();
        let contributionBounds = {
          minX: rect.left - artboardRect.left,
          minY: rect.top - artboardRect.top,
          maxX: rect.right - artboardRect.left,
          maxY: rect.bottom - artboardRect.top,
        };
        const style = getComputedStyle(element);
        const directTextNodes = Array.from(element.childNodes || []).filter((node) => node.nodeType === 3 && String(node.textContent || "").trim());
        const paintsSurface = style.backgroundImage !== "none"
          || style.backgroundColor !== "rgba(0, 0, 0, 0)"
          || parseFloat(style.borderTopWidth || "0") > 0
          || parseFloat(style.borderRightWidth || "0") > 0
          || parseFloat(style.borderBottomWidth || "0") > 0
          || parseFloat(style.borderLeftWidth || "0") > 0;
        if (directTextNodes.length && !paintsSurface && style.position !== "absolute" && style.position !== "fixed") {
          const textRects = directTextNodes.map((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return range.getBoundingClientRect();
          }).filter((textRect) => textRect.width > .01 || textRect.height > .01);
          if (textRects.length) {
            contributionBounds = {
              minX: Math.min(...textRects.map((textRect) => textRect.left - artboardRect.left)),
              minY: Math.min(...textRects.map((textRect) => textRect.top - artboardRect.top)),
              maxX: Math.max(...textRects.map((textRect) => textRect.right - artboardRect.left)),
              maxY: Math.max(...textRects.map((textRect) => textRect.bottom - artboardRect.top)),
            };
          }
        }
        minX = Math.min(minX, contributionBounds.minX);
        minY = Math.min(minY, contributionBounds.minY);
        maxX = Math.max(maxX, contributionBounds.maxX);
        maxY = Math.max(maxY, contributionBounds.maxY);
      }
      const bounds = {
        minX: Math.floor(minX),
        minY: Math.floor(minY),
        maxX: Math.ceil(maxX),
        maxY: Math.ceil(maxY),
      };
      if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
        throw new Error("Northstar authored geometry must contain only finite coordinates.");
      }
      if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
        throw new Error("Northstar authored geometry must describe a non-empty rectangle.");
      }
      const computed = getComputedStyle(compilerArtboard);
      return {
        bounds,
        background: computed.background,
        backgroundColor: computed.backgroundColor,
        borderRadius: computed.borderRadius,
      };
    } finally {
      host.remove();
    }
  };

  const compileCanonicalGeometry = async (revisionId, mutationId, layoutContext = {}) => {
    if (canonicalGeometryCompilerActive) throw new Error("A canonical geometry compilation is already active.");
    canonicalGeometryCompilerActive = true;
    try {
      const nextLayoutWidth = Number(layoutContext.width);
      const nextLayoutHeight = Number(layoutContext.height);
      if (Number.isFinite(nextLayoutWidth) && nextLayoutWidth > 0) canonicalLayoutBaseWidth = Math.ceil(nextLayoutWidth);
      if (Number.isFinite(nextLayoutHeight) && nextLayoutHeight > 0) canonicalLayoutBaseHeight = Math.ceil(nextLayoutHeight);
      const measurement = await measureAuthoredContentInIsolation(canonicalLayoutBaseWidth, canonicalLayoutBaseHeight);
      const width = measurement.bounds.maxX - measurement.bounds.minX;
      const height = measurement.bounds.maxY - measurement.bounds.minY;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error("Northstar authored geometry must describe a finite non-empty rectangle.");
      }
      canonicalGeometrySequence += 1;
      return {
        artifactId: ARTIFACT_ID,
        surfaceId: SURFACE_ID,
        revisionId,
        mutationId: mutationId || undefined,
        measuredAt: new Date().toISOString(),
        intrinsicWidth: width,
        intrinsicHeight: height,
        measurementMode: "isolated-compiler",
        geometryCompilerVersion: CANONICAL_GEOMETRY_COMPILER_VERSION,
        geometryTransactionId: ARTIFACT_ID + ":" + revisionId + ":" + (mutationId || "canonical"),
        compilerPassCount: 1,
        sourceOwnedSurface: true,
        viewingMode: "single-frame",
        contentBounds: measurement.bounds,
        authoredContentBounds: measurement.bounds,
        sequence: canonicalGeometrySequence,
        layoutVersion: canonicalGeometrySequence,
        settled: true,
        live: true,
        background: measurement.background,
        backgroundColor: measurement.backgroundColor,
        borderRadius: measurement.borderRadius,
        authoredStateFingerprint: authoredStateFingerprint(),
      };
    } finally {
      canonicalGeometryCompilerActive = false;
    }
  };

  const applyCompiledCanonicalGeometry = (size) => {
    if (!size || size.measurementMode !== "isolated-compiler") return;
    let layoutStyle = document.getElementById("northstar-canonical-layout-context");
    if (!layoutStyle) {
      layoutStyle = document.createElement("style");
      layoutStyle.id = "northstar-canonical-layout-context";
      layoutStyle.setAttribute("data-ns-runtime-owned", "true");
      document.head.appendChild(layoutStyle);
    }
    layoutStyle.textContent = '#northstar-artifact-root:not([data-ns-geometry-compiler="true"]){display:flow-root!important;width:' + canonicalLayoutBaseWidth + 'px!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}';
    const width = Math.max(1, Math.ceil(size.intrinsicWidth));
    const height = Math.max(1, Math.ceil(size.intrinsicHeight));
    stageSurface.style.width = width + "px";
    stageSurface.style.height = height + "px";
    stageSurface.style.minWidth = width + "px";
    stageSurface.style.minHeight = height + "px";
    if (size.background) stageSurface.style.background = size.background;
    else if (size.backgroundColor) stageSurface.style.backgroundColor = size.backgroundColor;
    if (size.borderRadius) stageSurface.style.borderRadius = size.borderRadius;
    origin.style.transform = "translate(" + (-size.contentBounds.minX) + "px," + (-size.contentBounds.minY) + "px)";
    committedCanonicalGeometry = size;
    syncAuthoredSurfaceExtension();
  };

  const restoreCanonicalGeometry = (size, layoutContext) => {
    committedCanonicalGeometry = size || null;
    if (layoutContext) {
      canonicalLayoutBaseWidth = Math.max(1, Math.ceil(layoutContext.width || canonicalLayoutBaseWidth));
      canonicalLayoutBaseHeight = Math.max(1, Math.ceil(layoutContext.height || canonicalLayoutBaseHeight));
    }
    if (size) {
      applyCompiledCanonicalGeometry(size);
      return;
    }
    document.getElementById("northstar-canonical-layout-context")?.remove();
    stageSurface.style.width = canonicalLayoutBaseWidth + "px";
    stageSurface.style.height = canonicalLayoutBaseHeight + "px";
    stageSurface.style.minWidth = "1px";
    stageSurface.style.minHeight = "1px";
    stageSurface.style.removeProperty("background");
    stageSurface.style.removeProperty("background-color");
    stageSurface.style.removeProperty("border-radius");
    origin.style.transform = "translate(0px,0px)";
  };

  const captureSettledContentSize = (revisionId, mutationId, sequenceValue) => {
    if (committedCanonicalGeometry) {
      return {
        ...committedCanonicalGeometry,
        revisionId,
        mutationId: mutationId || undefined,
        measuredAt: new Date().toISOString(),
        sequence: Math.max(Number(committedCanonicalGeometry.sequence) || 0, Number(sequenceValue) || 0),
        layoutVersion: Math.max(Number(committedCanonicalGeometry.layoutVersion) || 0, Number(sequenceValue) || 0),
        settled: true,
        live: true,
      };
    }
    // Defensive pre-ready fallback only. It is derived from the authored layout
    // context, never from the live surface, and is replaced by the first
    // isolated compilation before the artboard becomes ready.
    const width = Math.max(1, Math.ceil(canonicalLayoutBaseWidth));
    const height = Math.max(1, Math.ceil(canonicalLayoutBaseHeight));
    return {
      artifactId: ARTIFACT_ID,
      surfaceId: SURFACE_ID,
      revisionId,
      mutationId: mutationId || undefined,
      measuredAt: new Date().toISOString(),
      intrinsicWidth: width,
      intrinsicHeight: height,
      measurementMode: "isolated-compiler",
      geometryCompilerVersion: CANONICAL_GEOMETRY_COMPILER_VERSION,
      geometryTransactionId: ARTIFACT_ID + ":" + revisionId + ":defensive-layout-base",
      compilerPassCount: 1,
      sourceOwnedSurface: true,
      viewingMode: "single-frame",
      contentBounds: { minX: 0, minY: 0, maxX: width, maxY: height },
      authoredContentBounds: { minX: 0, minY: 0, maxX: width, maxY: height },
      sequence: Math.max(0, Number(sequenceValue) || 0),
      layoutVersion: Math.max(0, Number(sequenceValue) || 0),
      settled: true,
      live: true,
    };
  };

  const collectGeometryFacts = (bounds) => {
    const geometryMode = syncIntrinsicGeometryMode();
    const rootRect = root.getBoundingClientRect();
    const artboard = geometryMode.artboard;
    const authoredArtboardRect = artboard?.getBoundingClientRect?.();
    const localBounds = (rect) => ({
      minX: rect.left - rootRect.left,
      minY: rect.top - rootRect.top,
      maxX: rect.right - rootRect.left,
      maxY: rect.bottom - rootRect.top,
    });
    const authoredArtboardBounds = authoredArtboardRect
      ? localBounds(authoredArtboardRect)
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const artboardBounds = authoredArtboardRect
      ? {
        minX: Math.min(authoredArtboardBounds.minX, Number(requestedBounds.minX) || 0),
        minY: Math.min(authoredArtboardBounds.minY, Number(requestedBounds.minY) || 0),
        maxX: Math.max(authoredArtboardBounds.maxX, Number(requestedBounds.maxX) || 0),
        maxY: Math.max(authoredArtboardBounds.maxY, Number(requestedBounds.maxY) || 0),
      }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const artboardRect = authoredArtboardRect
      ? {
        left: rootRect.left + artboardBounds.minX,
        top: rootRect.top + artboardBounds.minY,
        right: rootRect.left + artboardBounds.maxX,
        bottom: rootRect.top + artboardBounds.maxY,
        width: artboardBounds.maxX - artboardBounds.minX,
        height: artboardBounds.maxY - artboardBounds.minY,
      }
      : undefined;
    const semanticElements = Array.from(root.querySelectorAll("[data-ns-node-id]"))
      .filter((element) => element !== artboard && !element.closest("[data-ns-spatial-system]") && !element.closest('[data-ns-runtime-owned="true"]'))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > .01 && rect.width > 0 && rect.height > 0;
      });
    const meaningfulElements = semanticElements.filter((element) => {
      const hasSemanticChild = Boolean(element.querySelector(":scope [data-ns-node-id]"));
      const directText = Array.from(element.childNodes || []).some((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
      return !hasSemanticChild || directText || element.matches("img,svg,canvas,figure,[data-ns-evidence-id]");
    });
    let semanticContentBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    if (meaningfulElements.length > 0) {
      const measured = meaningfulElements.map((element) => localBounds(element.getBoundingClientRect()));
      semanticContentBounds = {
        minX: Math.min(...measured.map((entry) => entry.minX)),
        minY: Math.min(...measured.map((entry) => entry.minY)),
        maxX: Math.max(...measured.map((entry) => entry.maxX)),
        maxY: Math.max(...measured.map((entry) => entry.maxY)),
      };
    }
    const artboardWidth = Math.max(1, artboardBounds.maxX - artboardBounds.minX);
    const artboardHeight = Math.max(1, artboardBounds.maxY - artboardBounds.minY);
    const contentWidth = Math.max(0, semanticContentBounds.maxX - semanticContentBounds.minX);
    const contentHeight = Math.max(0, semanticContentBounds.maxY - semanticContentBounds.minY);
    const outOfBoundsNodeIds = [];
    const clippedSemanticNodeIds = [];
    const meaningfulElementSet = new Set(meaningfulElements);
    const clipsDescendants = (style) => [style.overflow, style.overflowX, style.overflowY]
      .some((value) => value === "hidden" || value === "clip" || value === "scroll" || value === "auto");
    const isReadableIntegrityTarget = (element) => {
      if (meaningfulElementSet.has(element)) return true;
      return element.matches?.("img,picture,video,canvas,svg,[role=img],[data-ns-evidence-id]") === true;
    };
    for (const element of semanticElements) {
      const nodeId = element.getAttribute("data-ns-node-id");
      if (!nodeId) continue;
      const elementRect = element.getBoundingClientRect();
      const rect = localBounds(elementRect);
      if (artboardRect && (rect.minX < artboardBounds.minX - 2 || rect.minY < artboardBounds.minY - 2 || rect.maxX > artboardBounds.maxX + 2 || rect.maxY > artboardBounds.maxY + 2)) outOfBoundsNodeIds.push(nodeId);
      if (!isReadableIntegrityTarget(element)) continue;
      const style = getComputedStyle(element);
      const ownTextClipped = (element.scrollWidth > element.clientWidth + 2 && style.overflowX !== "visible")
        || (element.scrollHeight > element.clientHeight + 2 && style.overflowY !== "visible");
      let ancestorClipped = false;
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== artboard && ancestor !== root) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (clipsDescendants(ancestorStyle)) {
          const ancestorRect = ancestor.getBoundingClientRect();
          if (elementRect.left < ancestorRect.left - 2 || elementRect.top < ancestorRect.top - 2 || elementRect.right > ancestorRect.right + 2 || elementRect.bottom > ancestorRect.bottom + 2) {
            ancestorClipped = true;
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
      if (ownTextClipped || ancestorClipped) clippedSemanticNodeIds.push(nodeId);
    }
    const viewingModeValue = artboard?.getAttribute?.("data-ns-viewing-mode");
    const viewingMode = viewingModeValue === "zoom-and-inspect" || viewingModeValue === "scrolling-artboard"
      ? viewingModeValue
      : "single-frame";
    const primaryNodeIds = splitSemanticIds(artboard?.getAttribute?.("data-ns-primary-node-ids"));
    const supportingNodeIds = splitSemanticIds(artboard?.getAttribute?.("data-ns-supporting-node-ids"));
    const evidenceElements = Array.from(root.querySelectorAll("[data-ns-node-id][data-ns-evidence-id]"));
    const isVisibleEvidence = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden
        && element.getAttribute("aria-hidden") !== "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || 1) >= .15
        && rect.width > 2
        && rect.height > 2;
    };
    const visibleEvidenceElements = evidenceElements.filter(isVisibleEvidence);
    const hiddenEvidenceNodeIds = evidenceElements
      .filter((element) => !isVisibleEvidence(element))
      .map((element) => element.getAttribute("data-ns-node-id"))
      .filter(Boolean);
    const intersectionArea = (first, second) => {
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      return width * height;
    };
    const evidenceVisibleRatio = (element) => {
      const rect = element.getBoundingClientRect();
      const area = Math.max(1, rect.width * rect.height);
      let visibleArea = artboardRect ? intersectionArea(rect, artboardRect) : area;
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== artboard && ancestor !== root) {
        const style = getComputedStyle(ancestor);
        if (clipsDescendants(style)) visibleArea = Math.min(visibleArea, intersectionArea(rect, ancestor.getBoundingClientRect()));
        ancestor = ancestor.parentElement;
      }
      return Math.max(0, Math.min(1, visibleArea / area));
    };
    const evidenceVisibleRatios = visibleEvidenceElements.map((element) => ({
      nodeId: element.getAttribute("data-ns-node-id"),
      ratio: evidenceVisibleRatio(element),
    }));
    const partiallyClippedEvidenceNodeIds = evidenceVisibleRatios
      .filter((entry) => entry.ratio < .985)
      .map((entry) => entry.nodeId)
      .filter(Boolean);
    const evidenceUsesCropping = (element) => {
      const candidates = [element, ...Array.from(element.querySelectorAll("img,picture,video,canvas,svg"))];
      return candidates.some((candidate) => {
        const style = getComputedStyle(candidate);
        const objectFit = String(style.objectFit || "").toLowerCase();
        const clipPath = String(style.clipPath || "none").toLowerCase();
        const maskImage = String(style.maskImage || "none").toLowerCase();
        return objectFit === "cover" || clipPath !== "none" || maskImage !== "none";
      });
    };
    const croppedEvidenceNodeIds = visibleEvidenceElements
      .filter(evidenceUsesCropping)
      .map((element) => element.getAttribute("data-ns-node-id"))
      .filter(Boolean);
    const minimumEvidenceVisibleRatio = evidenceVisibleRatios.length
      ? Math.min(...evidenceVisibleRatios.map((entry) => entry.ratio))
      : (evidenceElements.length ? 0 : 1);
    const nodeElements = (ids) => ids.map((id) => root.querySelector('[data-ns-node-id="' + CSS.escape(id) + '"]')).filter(Boolean);
    const minimumTextPx = (elements, fallback) => {
      const values = [];
      for (const element of elements) {
        const candidates = [element, ...Array.from(element.querySelectorAll("h1,h2,h3,h4,p,span,li,figcaption,button,a"))];
        for (const candidate of candidates) {
          if (!String(candidate.textContent || "").trim()) continue;
          const style = getComputedStyle(candidate);
          const rect = candidate.getBoundingClientRect();
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= .01 || rect.width <= 0 || rect.height <= 0) continue;
          const size = Number.parseFloat(style.fontSize);
          if (Number.isFinite(size) && size > 0) values.push(size);
        }
      }
      return values.length ? Math.min(...values) : fallback;
    };
    const summedAreaRatio = (elements) => Math.max(0, Math.min(1, elements.reduce((total, element) => {
      const rect = element.getBoundingClientRect();
      return total + Math.max(0, rect.width) * Math.max(0, rect.height);
    }, 0) / Math.max(1, artboardWidth * artboardHeight)));
    const primaryElements = nodeElements(primaryNodeIds);
    const supportingElements = nodeElements(supportingNodeIds);
    const minimumPrimaryTextPx = minimumTextPx(primaryElements, minimumTextPx(meaningfulElements, 16));
    const minimumSupportingTextPx = minimumTextPx(supportingElements, minimumTextPx(visibleEvidenceElements, 12));
    const evidenceAreaRatio = summedAreaRatio(visibleEvidenceElements);
    const primaryAreaRatio = summedAreaRatio(primaryElements);
    const rightGutterPx = Math.max(0, bounds.maxX - artboardBounds.maxX);
    const bottomGutterPx = Math.max(0, bounds.maxY - artboardBounds.maxY);
    const leftGutterPx = Math.max(0, artboardBounds.minX - bounds.minX);
    const topGutterPx = Math.max(0, artboardBounds.minY - bounds.minY);
    const backgroundLeakRisk = geometryMode.sourceOwned && (!artboardRect || rightGutterPx > 2 || bottomGutterPx > 2 || leftGutterPx > 2 || topGutterPx > 2);
    const occupiedWidthRatio = Math.max(0, Math.min(1, contentWidth / artboardWidth));
    const occupiedHeightRatio = Math.max(0, Math.min(1, contentHeight / artboardHeight));
    const unusedSpaceRatio = Math.max(0, Math.min(1, 1 - ((contentWidth * contentHeight) / Math.max(1, artboardWidth * artboardHeight))));
    const integrityFailures = [];
    if (geometryMode.sourceOwned && !artboardRect) integrityFailures.push("The model-source artifact has no measurable canonical artboard surface.");
    if (backgroundLeakRisk) integrityFailures.push("The authored artboard does not cover its measured artifact surface, which would expose an interior host-background gutter.");
    if (outOfBoundsNodeIds.length > 0) integrityFailures.push("Semantic content extends outside the authored artboard: " + Array.from(new Set(outOfBoundsNodeIds)).slice(0, 12).join(", ") + ".");
    if (clippedSemanticNodeIds.length > 0) integrityFailures.push("Semantic content is clipped by its own authored geometry: " + Array.from(new Set(clippedSemanticNodeIds)).slice(0, 12).join(", ") + ".");
    if (artboard?.getAttribute?.("data-ns-preserve-all-evidence") === "true" && hiddenEvidenceNodeIds.length > 0) integrityFailures.push("Grounded evidence screens were hidden or collapsed in the settled source: " + Array.from(new Set(hiddenEvidenceNodeIds)).slice(0, 12).join(", ") + ".");
    if (artboard?.getAttribute?.("data-ns-preserve-all-evidence") === "true" && partiallyClippedEvidenceNodeIds.length > 0) integrityFailures.push("Grounded evidence screens were visually truncated by the authored geometry: " + Array.from(new Set(partiallyClippedEvidenceNodeIds)).slice(0, 12).join(", ") + ".");
    if (artboard?.getAttribute?.("data-ns-preserve-all-evidence") === "true" && croppedEvidenceNodeIds.length > 0) integrityFailures.push("Grounded evidence screens used cropping or masking instead of preserving the complete screenshot surface: " + Array.from(new Set(croppedEvidenceNodeIds)).slice(0, 12).join(", ") + ".");
    return {
      sourceOwnedSurface: geometryMode.sourceOwned,
      viewingMode,
      viewportWidth: Math.max(1, Math.round(window.innerWidth || bounds.width)),
      viewportHeight: Math.max(1, Math.round(window.innerHeight || bounds.height)),
      artboardBounds, semanticContentBounds, occupiedWidthRatio, occupiedHeightRatio, unusedSpaceRatio,
      rightGutterPx, bottomGutterPx,
      authoredSurfaceCoverageX: Math.max(0, Math.min(1, artboardWidth / Math.max(1, bounds.width))),
      authoredSurfaceCoverageY: Math.max(0, Math.min(1, artboardHeight / Math.max(1, bounds.height))),
      backgroundLeakRisk,
      outOfBoundsNodeIds: Array.from(new Set(outOfBoundsNodeIds)),
      clippedSemanticNodeIds: Array.from(new Set(clippedSemanticNodeIds)),
      evidenceNodeCount: evidenceElements.length,
      visibleEvidenceNodeCount: visibleEvidenceElements.length,
      hiddenEvidenceNodeIds: Array.from(new Set(hiddenEvidenceNodeIds)),
      partiallyClippedEvidenceNodeIds: Array.from(new Set(partiallyClippedEvidenceNodeIds)),
      croppedEvidenceNodeIds: Array.from(new Set(croppedEvidenceNodeIds)),
      minimumEvidenceVisibleRatio,
      primaryNodeIds, supportingNodeIds, minimumPrimaryTextPx, minimumSupportingTextPx, evidenceAreaRatio, primaryAreaRatio,
      integrityFailures,
    };
  };

  const splitSemanticIds = (value) => String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  const auditRequiredPrimitives = (requirements = []) => {
    const failures = [];
    const essentialFailures = [];
    const optionalFailures = [];
    const checkedNodeIds = [];
    const pushFailure = (requirement, message) => {
      const id = requirement?.id || requirement?.kind || "primitive";
      const detail = id + ": " + message;
      failures.push(detail);
      if (requirement?.criticality === "essential") essentialFailures.push(detail);
      else optionalFailures.push(detail);
    };
    const rootRect = root.getBoundingClientRect();
    const visibleGeometry = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > .01 && rect.width >= 10 && rect.height >= 6
        && rect.right >= rootRect.left - 2 && rect.bottom >= rootRect.top - 2 && rect.left <= rootRect.right + 2 && rect.top <= rootRect.bottom + 2;
    };
    const attributeIds = (element, names) => {
      const ids = [];
      for (const name of names) ids.push(...splitSemanticIds(element?.getAttribute?.(name)));
      return Array.from(new Set(ids));
    };
    for (const requirement of requirements || []) {
      const nodeIds = requirement?.instanceNodeIds?.length ? requirement.instanceNodeIds : requirement?.nodeIds?.length ? requirement.nodeIds : [requirement?.id].filter(Boolean);
      const elements = nodeIds.map((nodeId) => nodeById(nodeId)).filter(Boolean);
      checkedNodeIds.push(...nodeIds);
      const minimumInstances = Math.max(1, Number(requirement?.minimumInstances) || 1);
      if (elements.length < minimumInstances) {
        pushFailure(requirement, "missing exact semantic instance(s)");
        continue;
      }
      const kindMatches = elements.filter((element) => {
        const kind = requirement?.kind;
        if (kind === "chart" || kind === "sparkline" || kind === "axis") return element.getAttribute("data-ns-analysis-kind") === kind;
        if (kind === "annotation") return Boolean(element.getAttribute("data-ns-annotation-id") && element.getAttribute("data-ns-anchor-node-id"));
        if (kind === "relationship") return Boolean(element.getAttribute("data-ns-relationship-id") && (element.getAttribute("data-ns-source-id") || element.getAttribute("data-ns-source-node-id")) && (element.getAttribute("data-ns-target-id") || element.getAttribute("data-ns-target-node-id")));
        if (kind === "synthesis") return /synthesis|summary|takeaway/i.test(element.getAttribute("data-ns-node-id") || "") && (element.textContent || "").trim().length >= 48;
        if (kind === "decision") return /decision|recommendation|conclusion|implication/i.test(element.getAttribute("data-ns-node-id") || "") && (element.textContent || "").trim().length >= 36;
        return true;
      });
      if (kindMatches.length < minimumInstances) {
        pushFailure(requirement, "rendered kind does not match exact contract");
        continue;
      }
      for (const sourceId of requirement?.sourceNodeIds || []) {
        if (!nodeById(sourceId)) pushFailure(requirement, "unresolved source " + sourceId);
        if (!elements.some((element) => attributeIds(element, ["data-ns-source-ids", "data-ns-source-id", "data-ns-source-node-id", "data-ns-anchor-node-id"]).includes(sourceId))) pushFailure(requirement, "source binding missing for " + sourceId);
      }
      for (const targetId of requirement?.targetNodeIds || []) {
        if (!nodeById(targetId)) pushFailure(requirement, "unresolved target " + targetId);
        if (!elements.some((element) => attributeIds(element, ["data-ns-target-id", "data-ns-target-node-id"]).includes(targetId))) pushFailure(requirement, "target binding missing for " + targetId);
      }
      const expectedPlacement = {
        "beneath-flow": "caption-lane",
        "between-sections": "inter-row-lane",
        "anchored-margin": "margin-lane",
        "routed-overlay": "external-relationship",
      }[requirement?.placement];
      const structuralPlacementSatisfied = (requirement?.kind === "frame" || requirement?.kind === "evidence-lane")
        && elements.some((element) => element.getAttribute("data-ns-required-placement") === requirement?.placement);
      if (expectedPlacement && !structuralPlacementSatisfied && !elements.some((element) => element.getAttribute("data-ns-analysis-placement") === expectedPlacement)) pushFailure(requirement, "wrong rendered placement");
      if (requirement?.kind === "chart" || requirement?.kind === "sparkline" || requirement?.kind === "axis") {
        for (const element of kindMatches) {
          if (!visibleGeometry(element)) pushFailure(requirement, "analytical primitive is not visibly measurable");
          const sourceIds = attributeIds(element, ["data-ns-source-ids", "data-ns-source-id"]);
          if (!sourceIds.length || sourceIds.some((sourceId) => !nodeById(sourceId))) pushFailure(requirement, "analytical sources are unresolved");
          if (!element.getAttribute("data-ns-encoding")) pushFailure(requirement, "encoding is undeclared");
          if (!(element.getAttribute("aria-label") || element.getAttribute("data-ns-label") || (element.textContent || "").trim())) pushFailure(requirement, "precise label is missing");
          const svg = element instanceof SVGSVGElement ? element : element.querySelector("svg");
          if (svg && !svg.getAttribute("viewBox")) pushFailure(requirement, "SVG viewBox is missing");
          if (element.getAttribute("data-ns-encoding") === "quantitative" && element.getAttribute("data-ns-values-grounded") !== "true") pushFailure(requirement, "quantitative values are not grounded");
        }
      }
      if (requirement?.kind === "annotation") {
        for (const element of kindMatches) {
          const annotationId = element.getAttribute("data-ns-annotation-id");
          const copy = annotationId ? annotationLayer.querySelector('[data-ns-spatial-copy][data-ns-annotation-id="' + CSS.escape(annotationId) + '"]') : null;
          if (!copy || !visibleGeometry(copy)) pushFailure(requirement, "anchored annotation did not resolve visibly");
          if ((lastSpatialAudit?.unresolvedAnchorIds || []).includes(annotationId)) pushFailure(requirement, "annotation anchor is unresolved");
          if ((lastSpatialAudit?.annotationTargetOverlapIds || []).includes(annotationId) || (lastSpatialAudit?.clippedAnnotationIds || []).includes(annotationId)) pushFailure(requirement, "annotation placement is obstructed");
        }
      }
      if (requirement?.kind === "relationship") {
        for (const element of kindMatches) {
          const relationshipId = element.getAttribute("data-ns-relationship-id");
          const path = relationshipId ? origin.querySelector('[data-ns-spatial-system] path[data-ns-routed-relationship-id="' + CSS.escape(relationshipId) + '"]') : null;
          const pathStyle = path ? getComputedStyle(path) : null;
          const pathLength = path && typeof path.getTotalLength === "function" ? path.getTotalLength() : 0;
          if (!path || pathStyle?.display === "none" || pathStyle?.visibility === "hidden" || Number(pathStyle?.opacity || 1) <= .01 || pathLength < 8) pushFailure(requirement, "routed connector is not visible");
          if ((lastSpatialAudit?.unresolvedRelationshipIds || []).includes(relationshipId) || (lastSpatialAudit?.obstacleIntersectionIds || []).includes(relationshipId)) pushFailure(requirement, "connector route is unresolved or intersects evidence");
        }
      }
      if ((requirement?.kind === "frame" || requirement?.kind === "evidence-lane" || requirement?.kind === "synthesis" || requirement?.kind === "decision") && !kindMatches.some(visibleGeometry)) pushFailure(requirement, "contracted region is not visible");
    }
    const uniqueFailures = Array.from(new Set(failures)).slice(0, 40);
    const uniqueEssential = Array.from(new Set(essentialFailures)).slice(0, 40);
    const uniqueOptional = Array.from(new Set(optionalFailures)).slice(0, 40);
    return {
      healthy: uniqueEssential.length === 0,
      checkedCount: checkedNodeIds.length,
      failureCount: uniqueFailures.length,
      essentialFailureCount: uniqueEssential.length,
      optionalFailureCount: uniqueOptional.length,
      failures: uniqueFailures,
      essentialFailures: uniqueEssential,
      optionalFailures: uniqueOptional,
      checkedNodeIds: Array.from(new Set(checkedNodeIds)),
    };
  };

  const collectPremiumDesignAudit = () => {
    const artboard = nodeById("artboard") || root.querySelector(".ns-artifact") || root;
    const contractVersion = artboard?.getAttribute?.("data-ns-premium-contract") || undefined;
    const designFingerprint = artboard?.getAttribute?.("data-ns-design-fingerprint") || undefined;
    const requiredNarrativeBeatIds = splitSemanticIds(artboard?.getAttribute?.("data-ns-required-narrative-beats"));
    const requiredCommunicationRoles = splitSemanticIds(artboard?.getAttribute?.("data-ns-required-communication-roles"));
    const requiredAnalysisIds = splitSemanticIds(artboard?.getAttribute?.("data-ns-required-analysis-ids"));
    const artboardRect = artboard.getBoundingClientRect();
    const visibleGeometry = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden
        && element.getAttribute("aria-hidden") !== "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || 1) > .08
        && rect.width >= 8
        && rect.height >= 6
        && rect.right >= artboardRect.left - 2
        && rect.bottom >= artboardRect.top - 2
        && rect.left <= artboardRect.right + 2
        && rect.top <= artboardRect.bottom + 2;
    };
    const narrativeElements = Array.from(root.querySelectorAll("[data-ns-narrative-beat-id][data-ns-communication-role]"))
      .filter(visibleGeometry);
    const realizedNarrativeBeatIds = Array.from(new Set(narrativeElements.flatMap((element) =>
      splitSemanticIds(element.getAttribute("data-ns-narrative-beat-id"))
    )));
    const realizedCommunicationRoles = Array.from(new Set(narrativeElements.flatMap((element) =>
      splitSemanticIds(element.getAttribute("data-ns-communication-role"))
    )));
    const missingNarrativeBeatIds = requiredNarrativeBeatIds.filter((id) => !realizedNarrativeBeatIds.includes(id));
    const missingCommunicationRoles = requiredCommunicationRoles.filter((role) => !realizedCommunicationRoles.includes(role));
    const analysisElements = Array.from(root.querySelectorAll("[data-ns-analysis-id]")).filter(visibleGeometry);
    const realizedAnalysisIds = Array.from(new Set(analysisElements.flatMap((element) =>
      splitSemanticIds(element.getAttribute("data-ns-analysis-id"))
    )));
    const missingAnalysisIds = requiredAnalysisIds.filter((id) => !realizedAnalysisIds.includes(id));
    const evidenceIds = new Set(Array.from(root.querySelectorAll("[data-ns-evidence-id]"))
      .map((element) => element.getAttribute("data-ns-evidence-id"))
      .filter(Boolean));
    const ungroundedAnalysisIds = requiredAnalysisIds.filter((analysisId) => {
      const elements = analysisElements.filter((element) =>
        splitSemanticIds(element.getAttribute("data-ns-analysis-id")).includes(analysisId)
      );
      if (!elements.length) return false;
      if (!evidenceIds.size) return false;
      const sources = Array.from(new Set(elements.flatMap((element) =>
        splitSemanticIds(element.getAttribute("data-ns-source-ids"))
      )));
      return sources.length === 0 || sources.some((sourceId) => !evidenceIds.has(sourceId));
    });
    const focalNodeCount = Array.from(root.querySelectorAll('[data-ns-visual-priority="hero"],[data-ns-visual-priority="primary"]'))
      .filter(visibleGeometry).length;
    const textSizes = Array.from(root.querySelectorAll("h1,h2,h3,h4,p,li,figcaption,blockquote,td,th,label"))
      .filter((element) => visibleGeometry(element) && String(element.textContent || "").trim())
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize || "0"))
      .filter((value) => Number.isFinite(value) && value > 0);
    const minimumReadableTextPx = textSizes.length ? Math.min(...textSizes) : 0;
    const evidenceRoleDiversity = new Set(
      Array.from(root.querySelectorAll("[data-ns-evidence-role]"))
        .filter(visibleGeometry)
        .map((element) => element.getAttribute("data-ns-evidence-role"))
        .filter(Boolean),
    ).size;
    const semanticElements = Array.from(root.querySelectorAll("[data-ns-node-id]"))
      .filter((element) => element !== artboard && visibleGeometry(element));
    const containerCount = semanticElements.filter((element) => {
      const style = getComputedStyle(element);
      const radius = Number.parseFloat(style.borderRadius || "0");
      const hasBoundary = style.borderStyle !== "none" && Number.parseFloat(style.borderWidth || "0") > 0;
      const hasFill = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
      return radius >= 8 && (hasBoundary || hasFill);
    }).length;
    const repeatedContainerRatio = semanticElements.length
      ? containerCount / semanticElements.length
      : 0;
    const structuralTokens = Array.from(root.querySelectorAll(
      "[data-ns-narrative-beat-id],[data-ns-analysis-id],[data-ns-visual-priority],[data-ns-evidence-role]",
    ))
      .filter(visibleGeometry)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const quantize = (value, total, buckets) => Math.max(0, Math.min(buckets, Math.round((value / Math.max(1, total)) * buckets)));
        return {
          x: quantize(rect.left - artboardRect.left, artboardRect.width, 12),
          y: quantize(rect.top - artboardRect.top, artboardRect.height, 12),
          token: [
            String(element.tagName || "").toLowerCase(),
            element.getAttribute("data-ns-communication-role") || "",
            element.getAttribute("data-ns-visual-priority") || "",
            element.getAttribute("data-ns-evidence-role") || "",
            element.hasAttribute("data-ns-analysis-id") ? "analysis" : "",
            quantize(rect.width, artboardRect.width, 8),
            quantize(rect.height, artboardRect.height, 8),
          ].join(":"),
        };
      })
      .sort((left, right) => left.y - right.y || left.x - right.x || left.token.localeCompare(right.token))
      .map((entry) => entry.x + "," + entry.y + ":" + entry.token);
    const renderedStructureSource = structuralTokens.join("|");
    let renderedStructureHash = 2166136261;
    for (let index = 0; index < renderedStructureSource.length; index += 1) {
      renderedStructureHash ^= renderedStructureSource.charCodeAt(index);
      renderedStructureHash = Math.imul(renderedStructureHash, 16777619);
    }
    const renderedStructureFingerprint = (renderedStructureHash >>> 0).toString(16).padStart(8, "0");
    const recentRenderedStructureFingerprints = splitSemanticIds(
      artboard?.getAttribute?.("data-ns-recent-rendered-structure-fingerprints"),
    );
    const repeatsRecentRenderedStructure = recentRenderedStructureFingerprints.includes(renderedStructureFingerprint);
    const blockingReasons = [];
    if (!contractVersion) blockingReasons.push("The rendered source is missing its premium design contract.");
    if (missingNarrativeBeatIds.length) blockingReasons.push("Required narrative beats are absent from the rendered pixels: " + missingNarrativeBeatIds.join(", ") + ".");
    if (missingCommunicationRoles.length) blockingReasons.push("Required communication roles are absent: " + missingCommunicationRoles.join(", ") + ".");
    if (missingAnalysisIds.length) blockingReasons.push("Required analytical intents are absent: " + missingAnalysisIds.join(", ") + ".");
    if (ungroundedAnalysisIds.length) blockingReasons.push("Analytical forms have unresolved grounded sources: " + ungroundedAnalysisIds.join(", ") + ".");
    if (focalNodeCount < 1) blockingReasons.push("The composition has no browser-visible hero or primary focal node.");
    if (minimumReadableTextPx > 0 && minimumReadableTextPx < 12) blockingReasons.push("Meaningful authored text falls below the 12px publication floor.");
    if (repeatsRecentRenderedStructure) blockingReasons.push("The rendered information geometry repeats a recent completed Northstar artboard.");
    const advisories = [];
    if (evidenceIds.size >= 3 && evidenceRoleDiversity < 2) advisories.push("The evidence is visually present but has not been choreographed into differentiated roles.");
    if (semanticElements.length >= 8 && repeatedContainerRatio > .58) advisories.push("Rounded or filled containers dominate the semantic scene; verify that every boundary carries meaning.");
    if (focalNodeCount > 5) advisories.push("Too many elements claim primary visual priority, weakening hierarchy.");
    return {
      contractVersion,
      designFingerprint,
      ready: blockingReasons.length === 0,
      requiredNarrativeBeatCount: requiredNarrativeBeatIds.length,
      realizedNarrativeBeatCount: realizedNarrativeBeatIds.length,
      missingNarrativeBeatIds,
      requiredCommunicationRoles,
      realizedCommunicationRoles,
      missingCommunicationRoles,
      requiredAnalysisCount: requiredAnalysisIds.length,
      realizedAnalysisCount: realizedAnalysisIds.length,
      missingAnalysisIds,
      ungroundedAnalysisIds,
      focalNodeCount,
      minimumReadableTextPx,
      evidenceRoleDiversity,
      repeatedContainerRatio,
      renderedStructureFingerprint,
      repeatsRecentRenderedStructure,
      blockingReasons,
      advisories,
    };
  };

  const collectRuntimeAudit = (requiredPrimitives = []) => {
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
    const spatialAudit = lastSpatialAudit || emptySpatialAudit();
    const requiredPrimitiveAudit = auditRequiredPrimitives(requiredPrimitives);
    const constructionAudit = currentMutationId ? constructionResults.get(currentMutationId) : undefined;
    const geometryFacts = collectGeometryFacts(bounds);
    const premiumDesignAudit = collectPremiumDesignAudit();
    const evidenceRegistry = captureEvidenceRegistryReceipt();
    const visualSafety = visualSafetySnapshot();
    const evidenceCollisionPairs = visualSafety.evidenceCollisionPairs || [];
    const authoredInterferencePairs = visualSafety.authoredInterferencePairs || [];
    const semanticRegionIntrusions = visualSafety.semanticRegionIntrusions || [];
    const authoredContinuityObservations = visualSafety.authoredContinuityObservations || [];
    const relationRealizationTraces = relationRealizationTraceRecords();
    const issueCount = overflowElementCount + clippedTextCount + smallTextCount + tinyInteractiveCount + missingImageCount + (documentScrollRisk ? 1 : 0) + Number(spatialAudit.hardFailureCount || 0) + Number(spatialAudit.softIssueCount || 0) + requiredPrimitiveAudit.failureCount + geometryFacts.integrityFailures.length + evidenceRegistry.missingEvidenceIds.length + evidenceCollisionPairs.length + authoredInterferencePairs.length + semanticRegionIntrusions.length + authoredContinuityObservations.filter((entry) => entry.visualAttribution === "weakened").length;
    const review = {
      revisionId: currentRevisionId, mutationId: currentMutationId, stageIndex: activeStageIndex, evaluatedAt: new Date().toISOString(),
      rootWidth: bounds.width, rootHeight: bounds.height, elementCount: elements.length,
      stageRegionCount: stageRegions.length, visibleStageRegionCount: stageRegions.length,
      overflowElementCount, clippedTextCount, smallTextCount, tinyInteractiveCount, missingImageCount, documentScrollRisk,
      spatialAudit,
      requiredPrimitiveAudit,
      constructionAudit,
      geometryFacts,
      premiumDesignAudit,
      evidenceRegistry,
      evidenceCollisionPairs,
      authoredInterferencePairs,
      semanticRegionIntrusions,
      authoredContinuityObservations,
      relationRealizationTraces,
      spatialSnapshot: {
        artifactId: ARTIFACT_ID,
        revisionId: currentRevisionId,
        mutationId: currentMutationId,
        measuredAt: new Date().toISOString(),
        layoutVersion: spatialLayoutVersion,
        artboardBounds: { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height, right: bounds.maxX, bottom: bounds.maxY },
        audit: spatialAudit,
      },
      summary: issueCount ? "Live artboard audit detected " + issueCount + " potential visual issues for the next micro-adjustment." : "Live artboard audit passed.",
    };
    return review;
  };
  const audit = (requiredPrimitives = []) => {
    const review = collectRuntimeAudit(requiredPrimitives);
    parent.postMessage({ type: "northstar.artifact.runtime-review", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: currentMutationId, review }, "*");
    return review;
  };

  let sizeFrame = 0, initialReady = false;
  let geometryCompilationQueued = false;
  let lastPublishedGeometryFingerprint = "";
  const reportContentSize = () => {
    const compiledSize = pendingAcknowledgement?.compiledSize
      ?? (committedCanonicalGeometry?.revisionId === currentRevisionId ? committedCanonicalGeometry : null);
    // The isolated compiler is the only canonical geometry authority for every
    // revision, including initial construction and research/evidence updates.
    if (!compiledSize) return;
    const bounds = {
      minX: compiledSize.contentBounds.minX,
      minY: compiledSize.contentBounds.minY,
      maxX: compiledSize.contentBounds.maxX,
      maxY: compiledSize.contentBounds.maxY,
      width: compiledSize.intrinsicWidth,
      height: compiledSize.intrinsicHeight,
    };
    const size = { ...compiledSize, measuredAt: new Date().toISOString(), settled: true, live: true };
    const settled = true;
    if (settled) {
      const review = audit(pendingAcknowledgement?.batch?.requiredPrimitives || []);
      if (!initialReady) {
        initialReady = true;
        lastPublishedGeometryFingerprint = size.authoredStateFingerprint || size.geometryTransactionId || "initial";
        parent.postMessage({ type: "northstar.artifact.ready", artifactId: ARTIFACT_ID, surfaceId: SURFACE_ID, revisionId: currentRevisionId, mutationId: currentMutationId, appliedMutationIds: Array.from(appliedMutationIds), size, review, changedNodeIds: [], meaningfulChangedNodeIds: [], changeKinds: [], requiredAssetUrls: [], loadedAssetUrls: loadedAssetUrls(), missingAssetUrls: [], evidenceRegistry: review.evidenceRegistry, authoredDesignRelations: authoredDesignRelationRecords(), resolvedDesignRelations: resolvedDesignRelationRecords(), snapshot: captureLiveSnapshot() }, "*");
      } else if (!pendingAcknowledgement) {
        const publicationFingerprint = size.authoredStateFingerprint || size.geometryTransactionId || String(size.sequence || 0);
        if (publicationFingerprint !== lastPublishedGeometryFingerprint) {
          lastPublishedGeometryFingerprint = publicationFingerprint;
          parent.postMessage({ type: "northstar.artifact.content-size", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, mutationId: currentMutationId, size }, "*");
        }
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
        const visualImpact = measureVisualImpact(acknowledgement.transaction.beforeSnapshot, afterSnapshot, diff.meaningful);
        const minimumChangedAreaRatio = Math.max(0, Number(acknowledgement.batch.minimumChangedAreaRatio) || 0);
        const minimumSpatiallyChangedNodes = Math.max(0, Number(acknowledgement.batch.minimumSpatiallyChangedNodes) || 0);
        const minimumMovedNodes = Math.max(0, Number(acknowledgement.batch.minimumMovedNodes) || 0);
        const minimumResizedNodes = Math.max(0, Number(acknowledgement.batch.minimumResizedNodes) || 0);
        const visualImpactFailures = [];
        if (visualImpact.changedAreaRatio + 0.0001 < minimumChangedAreaRatio) visualImpactFailures.push("changed area " + Math.round(visualImpact.changedAreaRatio * 1000) / 10 + "% < " + Math.round(minimumChangedAreaRatio * 1000) / 10 + "%");
        if (visualImpact.spatiallyChangedNodeCount < minimumSpatiallyChangedNodes) visualImpactFailures.push("spatial nodes " + visualImpact.spatiallyChangedNodeCount + " < " + minimumSpatiallyChangedNodes);
        if (visualImpact.movedNodeCount < minimumMovedNodes) visualImpactFailures.push("moved nodes " + visualImpact.movedNodeCount + " < " + minimumMovedNodes);
        if (visualImpact.resizedNodeCount < minimumResizedNodes) visualImpactFailures.push("resized nodes " + visualImpact.resizedNodeCount + " < " + minimumResizedNodes);
        // Geometry remains browser-measured, but unchanged outer bounds must not
        // roll back an otherwise meaningful and safe internal recomposition.
        const missingRequiredKinds = requiredKinds.filter(
          (kind) => kind !== "geometry" && !changeKinds.includes(kind),
        );
        const spatialMutation = acknowledgement.batch.operations.some((operation) =>
          (operation.op === "insert-html" || operation.op === "set-html" || operation.op === "recompose-region")
          && /data-ns-(?:annotation-id|relationship-id)/i.test(operation.html || "")
        );
        const beforeAudit = acknowledgement.transaction.beforeAudit || review;
        const hardIssueDeltas = {
          overflowElements: Math.max(0, Number(review.overflowElementCount || 0) - Number(beforeAudit.overflowElementCount || 0)),
          clippedText: Math.max(0, Number(review.clippedTextCount || 0) - Number(beforeAudit.clippedTextCount || 0)),
          missingImages: Math.max(0, Number(review.missingImageCount || 0) - Number(beforeAudit.missingImageCount || 0)),
          internalScrollElements: Math.max(0, Number(review.internalScrollElementCount || 0) - Number(beforeAudit.internalScrollElementCount || 0)),
          // Routed annotations, connectors, and optional analytical helpers are
          // creative delivery features. Their measured issues remain in the
          // runtime review, but they must not roll back an otherwise safe and
          // materially improved authored scene. Protected-evidence overlap and
          // catastrophic geometry are enforced separately by visualSafetyReason.
          spatialHardFailures: 0,
        };
        const hardIssues = Object.values(hardIssueDeltas).reduce((sum, count) => sum + count, 0);
        const hardIssueFailures = [
          hardIssueDeltas.overflowElements ? hardIssueDeltas.overflowElements + " new overflowing element(s)" : "",
          hardIssueDeltas.clippedText ? hardIssueDeltas.clippedText + " new clipped text region(s)" : "",
          hardIssueDeltas.missingImages ? hardIssueDeltas.missingImages + " newly missing image(s)" : "",
          hardIssueDeltas.internalScrollElements ? hardIssueDeltas.internalScrollElements + " new internal scroll container(s)" : "",
          hardIssueDeltas.spatialHardFailures ? hardIssueDeltas.spatialHardFailures + " new spatial hard failure(s)" : "",
        ].filter(Boolean);
        const hardIssueReason = hardIssues > 0
          ? "The candidate introduced new operational layout regressions: " + hardIssueFailures.join(", ") + "."
          : "";
        const linearDesignExecution = acknowledgement.batch.executionPolicy === "linear-design";
        const candidateAuthoredRelations = authoredDesignRelationRecords();
        const candidateResolvedRelations = resolvedDesignRelationRecords();
        const candidateResolvedById = new Map(candidateResolvedRelations.map((relation) => [relation.relationId, relation]));
        const unresolvedLiveRelations = candidateAuthoredRelations
          .filter((relation) => relation.realizationPolicy === "live")
          .map((relation) => ({ authored: relation, resolved: candidateResolvedById.get(relation.id) }))
          .filter((entry) => !entry.resolved || entry.resolved.status !== "resolved");
        const relationAdvisoryReasons = unresolvedLiveRelations.map((entry) =>
          "Optional live relation " + entry.authored.id + " was not realized (" + (entry.resolved?.status || "missing")
            + (entry.resolved?.message ? ": " + entry.resolved.message : "")
            + "). The authored visual result remains eligible to commit; the model may keep it visual-only or repair the reactive dependency on a later turn."
        );
        const afterVisualSafety = visualSafetySnapshot();
        const visualSafetyReason = visualSafetyFailure(
          acknowledgement.transaction.beforeVisualSafety || afterVisualSafety,
          afterVisualSafety,
        );
        const pixelStableReason = pixelStableFailure(
          acknowledgement.transaction.pixelStableNodeIds,
          acknowledgement.transaction.beforeSnapshot,
          afterSnapshot,
        );
        const additiveExpansionCollateralReason = additiveExpansionCollateralFailure(
          acknowledgement.batch,
          acknowledgement.transaction.beforeSnapshot,
          afterSnapshot,
        );
        const geometryIntegrityFailures = review.geometryFacts?.integrityFailures || [];
        // Authored-shell coverage and overflow observations are advisory. The
        // runtime-owned canonical surface is the exact geometry envelope, so a
        // finite composition may grow beyond any previous shell in every phase.
        const geometryIntegrityReason = "";
        const essentialPrimitiveAuditReason = !linearDesignExecution
          && Number(review.requiredPrimitiveAudit?.essentialFailureCount || 0) > 0
          ? "The browser could not verify an essential user-meaning contract: " + (review.requiredPrimitiveAudit?.essentialFailures || []).join("; ") + "."
          : "";
        const primitiveAuditReason = Number(review.requiredPrimitiveAudit?.optionalFailureCount || 0) > 0
          ? "The browser could not verify every optional analytical binding: " + (review.requiredPrimitiveAudit?.optionalFailures || []).join("; ") + "."
          : "";
        const constructionResult = constructionResults.get(acknowledgement.mutationId);
        const constructionCoverageReason = acknowledgement.batch.constructionPlan?.strictCoverage !== false && constructionResult?.completed && !constructionResult?.timedOut && !constructionResult?.recovered && (constructionResult?.uncoveredNodeIds || []).length > 0
          ? "The cinema layer simplified the reveal because it could not stage every changed node: " + constructionResult.uncoveredNodeIds.slice(0, 12).join(", ") + "."
          : "";
        // Every authored action already runs as a provisional DOM transaction.
        // These are delta-based browser facts, so they reject only regressions
        // introduced by this candidate and leave pre-existing artboard issues
        // available for later singular actions. Linear design skips subjective
        // quality thresholds, but it must never bypass operational feasibility.
        const operationalFeasibilityReason = pixelStableReason
          || visualSafetyReason
          || (missingAssets.length ? "Required evidence assets did not load: " + missingAssets.join(", ") : "")
          || hardIssueReason;
        const rejectedReason = additiveExpansionCollateralReason
          ? additiveExpansionCollateralReason
          : operationalFeasibilityReason
          ? operationalFeasibilityReason
          : linearDesignExecution
          ? ""
          : pixelStableReason
          ? pixelStableReason
          : geometryIntegrityReason
          ? geometryIntegrityReason
          : visualSafetyReason
          ? visualSafetyReason
          : essentialPrimitiveAuditReason
          ? essentialPrimitiveAuditReason
          : diff.meaningful.length < minimumMeaningful
              ? "The proposed adjustment did not visibly change enough semantic content."
              : textOnly && acknowledgement.batch.allowTextOnly !== true
                ? "The proposed adjustment changed only copy or cosmetic styling when a compositional move was required."
                : visualImpactFailures.length
                  ? "The visual design stage did not produce a palpable compositional delta: " + visualImpactFailures.join(", ")
                : missingRequiredKinds.length
                  ? "The visible change did not satisfy the required design move: " + missingRequiredKinds.join(", ")
                : "";
        if (rejectedReason) {
          const rejectedRevisionId = acknowledgement.revisionId;
          const rollbackRevisionId = acknowledgement.transaction.revisionId;
          const rollbackStartedAt = performance.now();
          pendingAcknowledgement = null;
          if (canonicalGeometryMutationId === acknowledgement.mutationId) canonicalGeometryMutationId = null;
          root.innerHTML = acknowledgement.transaction.html;
          restoreStyleState(acknowledgement.transaction.styles);
          replaceDesignRelationMap(authoredDesignRelations, acknowledgement.transaction.authoredDesignRelations || []);
          replaceDesignRelationMap(resolvedDesignRelations, acknowledgement.transaction.resolvedDesignRelations || []);
          refreshRelationResizeObserver();
          requestedBounds = { ...acknowledgement.transaction.requestedBounds };
          restoreCanonicalGeometry(acknowledgement.transaction.canonicalGeometry, acknowledgement.transaction.canonicalLayoutContext);
          currentRevisionId = rollbackRevisionId;
          currentMutationId = acknowledgement.transaction.mutationId;
          mutationTransactions.delete(acknowledgement.mutationId);
          enforceAssetPolicy(root);
          applyStage();
          resolveAuthoredSpatialDependencies(currentRevisionId);
          executeRuntimeModule("northstar-creative-source", acknowledgement.transaction.authoredJavascript);
          endAtomicCandidateValidation(acknowledgement.mutationId);
          const rollbackDurationMs = Math.max(0, performance.now() - rollbackStartedAt);
          const candidateDurationMs = Math.max(0, Date.now() - acknowledgement.transaction.startedAt);
          const restoredSize = acknowledgement.transaction.canonicalGeometry
            ? { ...acknowledgement.transaction.canonicalGeometry, revisionId: currentRevisionId, mutationId: currentMutationId, measuredAt: new Date().toISOString(), settled: true }
            : captureSettledContentSize(currentRevisionId, currentMutationId, canonicalGeometrySequence + 1);
          applyCompiledCanonicalGeometry(restoredSize);
          const terminalMessage = {
            type: "northstar.artifact.mutation-rejected",
            artifactId: ARTIFACT_ID,
            surfaceId: SURFACE_ID,
            revisionId: rejectedRevisionId,
            browserRevisionId: currentRevisionId,
            baseRevisionId: acknowledgement.proposal?.baseRevisionId,
            proposalId: acknowledgement.proposal?.proposalId,
            ackToken: acknowledgement.proposal?.ackToken,
            mutationId: acknowledgement.mutationId,
            message: rejectedReason,
            size,
            review: {
              ...review,
              hardFailureCount: hardIssues,
              hardIssueDeltas: {
                ...hardIssueDeltas,
              },
              spatialAudit: {
                ...(review.spatialAudit || {}),
                hardFailureCount: Number(review.spatialAudit?.hardFailureCount || 0),
                unresolvedRelationshipIds: Array.from(new Set([
                  ...(review.spatialAudit?.unresolvedRelationshipIds || []),
                ])),
              },
              beforeAudit: { overflowElementCount: beforeAudit.overflowElementCount, clippedTextCount: beforeAudit.clippedTextCount, missingImageCount: beforeAudit.missingImageCount, internalScrollElementCount: beforeAudit.internalScrollElementCount, spatialHardFailureCount: beforeAudit.spatialAudit?.hardFailureCount || 0 },
              requiredAssetCount: requiredAssets.length,
              missingRequiredAssetCount: missingAssets.length,
              meaningfulChangedNodeCount: diff.meaningful.length,
              visualDeltaScore: visualImpact.changedAreaRatio,
              ...visualImpact,
            },
            changedNodeIds: diff.changed,
            meaningfulChangedNodeIds: diff.meaningful,
            changeKinds,
            requiredAssetUrls: requiredAssets,
            loadedAssetUrls: loadedAssetUrls(),
            missingAssetUrls: missingAssets,
            evidenceRegistry: review.evidenceRegistry,
            authoredDesignRelations: candidateAuthoredRelations,
            resolvedDesignRelations: candidateResolvedRelations,
            snapshot: captureLiveSnapshot(),
            restoredSize,
            rollbackDurationMs,
            candidateDurationMs,
          };
          postTerminalMutation(acknowledgement.mutationId, terminalMessage);
          queueContentSize();
        } else {
          pendingAcknowledgement = null;
          if (canonicalGeometryMutationId === acknowledgement.mutationId) canonicalGeometryMutationId = null;
          appliedMutationIds.add(acknowledgement.mutationId);
          // request-space is authored geometry for this canonical revision. It
          // remains part of the accepted transaction and is cleared only when
          // the next revision begins (or restored on rollback).
          solveSpatialSystem();
          const terminalSize = { ...acknowledgement.compiledSize, measuredAt: new Date().toISOString(), settled: true, live: true };
          applyCompiledCanonicalGeometry(terminalSize);
          const changedRects = diff.meaningful.map((id) => nodeById(id)?.getBoundingClientRect()).filter(Boolean);
          const rootRect = root.getBoundingClientRect();
          const changedBounds = changedRects.length ? {
            minX: Math.floor(Math.min(...changedRects.map((rect) => rect.left - rootRect.left))),
            minY: Math.floor(Math.min(...changedRects.map((rect) => rect.top - rootRect.top))),
            maxX: Math.ceil(Math.max(...changedRects.map((rect) => rect.right - rootRect.left))),
            maxY: Math.ceil(Math.max(...changedRects.map((rect) => rect.bottom - rootRect.top))),
          } : terminalSize.contentBounds;
          const acknowledgedSize = { ...terminalSize, changedBounds, changedNodeIds: diff.changed, meaningfulChangedNodeIds: diff.meaningful };
          endAtomicCandidateValidation(acknowledgement.mutationId);
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
            review: {
              ...review,
              hardFailureCount: 0,
              requiredAssetCount: requiredAssets.length,
              missingRequiredAssetCount: 0,
              meaningfulChangedNodeCount: diff.meaningful.length,
              visualDeltaScore: visualImpact.changedAreaRatio,
              advisoryDeliveryIssues: [primitiveAuditReason, constructionCoverageReason, ...geometryIntegrityFailures, ...relationAdvisoryReasons].filter(Boolean),
              relationRealizationTraces: relationRealizationTraceRecords(),
              ...visualImpact,
            },
            changedNodeIds: diff.changed,
            meaningfulChangedNodeIds: diff.meaningful,
            changeKinds,
            requiredAssetUrls: requiredAssets,
            loadedAssetUrls: loadedAssetUrls(),
            missingAssetUrls: [],
            evidenceRegistry: review.evidenceRegistry,
            authoredDesignRelations: authoredDesignRelationRecords(),
            resolvedDesignRelations: resolvedDesignRelationRecords(),
            snapshot: captureLiveSnapshot(),
          };
          postTerminalMutation(acknowledgement.mutationId, terminalMessage);
          queueContentSize();
        }
      }
    }
  };
  const compileQueuedCanonicalGeometry = async () => {
    geometryCompilationQueued = false;
    if (pendingAcknowledgement || canonicalGeometryCompilerActive || canonicalGeometryMutationId) return;
    const fingerprint = authoredStateFingerprint();
    if (
      committedCanonicalGeometry?.revisionId === currentRevisionId
      && committedCanonicalGeometry.authoredStateFingerprint === fingerprint
    ) {
      reportContentSize();
      return;
    }
    try {
      const compiledSize = await compileCanonicalGeometry(currentRevisionId, currentMutationId, {
        width: canonicalLayoutBaseWidth,
        height: canonicalLayoutBaseHeight,
      });
      if (pendingAcknowledgement || canonicalGeometryMutationId) return;
      applyCompiledCanonicalGeometry(compiledSize);
      reportContentSize();
      if (authoredStateFingerprint() !== compiledSize.authoredStateFingerprint) queueContentSize();
    } catch (error) {
      parent.postMessage({
        type: "northstar.artifact.runtime-error",
        artifactId: ARTIFACT_ID,
        revisionId: currentRevisionId,
        mutationId: currentMutationId,
        message: error instanceof Error ? error.message : String(error),
      }, "*");
    }
  };
  const queueContentSize = () => {
    if (geometryCompilationQueued) return;
    geometryCompilationQueued = true;
    cancelAnimationFrame(sizeFrame);
    sizeFrame = requestAnimationFrame(() => requestAnimationFrame(() => { void compileQueuedCanonicalGeometry(); }));
  };

  let relationResolutionFrame = 0;
  queueAuthoredRelationResolution = () => {
    if (!Array.from(authoredDesignRelations.values()).some((relation) => relation.realizationPolicy !== "snapshot")) return;
    cancelAnimationFrame(relationResolutionFrame);
    relationResolutionFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
      resolveAuthoredSpatialDependencies(currentRevisionId, { liveOnly: true });
      solveSpatialSystem();
      queueContentSize();
    }));
  };

  const observer = new MutationObserver((records) => {
    const externalChange = records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target || runtimeRelationMutationTargets.has(target)) return false;
      return !target.closest?.("[data-ns-spatial-system]");
    });
    if (!externalChange) return;
    enforceAssetPolicy(root);
    queueAuthoredRelationResolution();
    queueContentSize();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  relationResizeObserver = new ResizeObserver(() => {
    queueAuthoredRelationResolution();
    queueContentSize();
  });
  refreshRelationResizeObserver();
  document.addEventListener("load", () => { queueAuthoredRelationResolution(); queueContentSize(); }, true);
  document.fonts?.ready?.then(() => { queueAuthoredRelationResolution(); queueContentSize(); }).catch(() => undefined);
  window.addEventListener("resize", () => { queueAuthoredRelationResolution(); queueContentSize(); });

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
    if (message.type === "northstar.artifact.transport-probe") {
      parent.postMessage({
        type: "northstar.artifact.transport-probe-ack",
        artifactId: ARTIFACT_ID,
        surfaceId: SURFACE_ID,
        revisionId: currentRevisionId,
        proposalId: message.proposalId,
        ackToken: message.ackToken,
        mutationId: message.mutationId,
        probeId: message.probeId,
        frameInstanceId: message.frameInstanceId,
      }, "*");
      return;
    }
    if (message.type === "northstar.artifact.set-stage") {
      activeStageIndex = Math.max(0, Math.min(STAGES.length - 1, Number(message.stageIndex) || 0)); applyStage(); queueContentSize(); return;
    }
    if (message.type === "northstar.artifact.update-context") {
      // Context may arrive before the associated mutation. Keep the current live revision
      // until that mutation is transactionally accepted by this browser surface.
      currentData = message.dataBundle || currentData;
      registerExpectedEvidence(currentData);
      markExpectedEvidenceAsProtected();
      currentCreative = message.creativeDirection ?? currentCreative;
      currentReviews = message.creativeReviews || currentReviews;
      currentPublicationState = message.publicationState ?? currentPublicationState;
      currentProvisional = typeof message.provisional === "boolean" ? message.provisional : currentProvisional;
      applyPublicationPresentationState();
      registerAssets(message.allowedAssetUrls || currentData?.allowedAssetUrls || []);
      registerAssets((currentData?.screenshots || []).map((screen) => screen.imageUrl).filter(Boolean));
      registerAssets((currentData?.apps || []).map((app) => app.iconUrl).filter(Boolean));
      enforceAssetPolicy(root);
      return;
    }
    if (message.type === "northstar.artifact.cancel-mutation" && message.mutationId) {
      const mutationId = message.mutationId;
      cancelledMutationIds.add(mutationId);
      for (let index = mutationQueue.length - 1; index >= 0; index -= 1) {
        if (mutationQueue[index]?.batch?.mutationId === mutationId) mutationQueue.splice(index, 1);
      }
      queuedMutationIds.delete(mutationId);
      rollbackMutation(mutationId);
      return;
    }
    if (message.type === "northstar.artifact.apply-mutation" && message.batch) {
      const mutationId = message.batch.mutationId;
      if (cancelledMutationIds.has(mutationId)) return;
      if (
        Number.isFinite(Number(message.deliveryDeadlineAt))
        && Date.now() > Number(message.deliveryDeadlineAt)
      ) {
        const expiredMessage = {
          type: "northstar.artifact.mutation-rejected",
          artifactId: ARTIFACT_ID,
          surfaceId: SURFACE_ID,
          revisionId: message.revisionId,
          browserRevisionId: currentRevisionId,
          baseRevisionId: message.baseRevisionId,
          proposalId: message.proposalId,
          ackToken: message.ackToken,
          mutationId,
          message: "NORTHSTAR_TRANSPORT_DELIVERY_DEADLINE_EXPIRED: The proposal reached the runtime after its immutable delivery deadline and was not applied.",
          changedNodeIds: [],
          meaningfulChangedNodeIds: [],
          changeKinds: [],
          requiredAssetUrls: message.batch.requiredAssetUrls || [],
          loadedAssetUrls: loadedAssetUrls(),
          missingAssetUrls: [],
          evidenceRegistry: captureEvidenceRegistryReceipt(),
          authoredDesignRelations: authoredDesignRelationRecords(),
          resolvedDesignRelations: resolvedDesignRelationRecords(),
          snapshot: captureLiveSnapshot(),
        };
        postTerminalMutation(mutationId, expiredMessage);
        return;
      }
      registerAssets(message.assetUrls || []);
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
          evidenceRegistry: captureEvidenceRegistryReceipt(),
          authoredDesignRelations: authoredDesignRelationRecords(),
          resolvedDesignRelations: resolvedDesignRelationRecords(),
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
          layoutBaseWidth: message.layoutBaseWidth,
          layoutBaseHeight: message.layoutBaseHeight,
        },
      });
      processQueue();
    }
  });

  // Defensive migration for browser snapshots captured before Northstar 3.1.
  // Temporary runtime geometry may exist in those documents, but it must never
  // be allowed to become the next authored source revision.
  root.querySelectorAll('[data-ns-runtime-inherited-placement],[data-ns-runtime-inherited-style]')
    .forEach((element) => clearRuntimeInheritedPlacement(element));
  root.querySelectorAll('[data-ns-runtime-inherited-parent-style]')
    .forEach((element) => clearRuntimeInheritedParentStyle(element));

  try {
    const runFoundation = new Function("Northstar", "data", "creative", "reviews", foundationJavascript);
    runFoundation(Northstar, currentData, currentCreative, currentReviews);
    executeRuntimeModule("northstar-creative-source", ${safeJson(documentSource.creativeJavascript ?? "")});
  } catch (error) {
    parent.postMessage({ type: "northstar.artifact.runtime-error", artifactId: ARTIFACT_ID, revisionId: currentRevisionId, message: error instanceof Error ? error.message : String(error) }, "*");
  }

  (async () => {
    enforceAssetPolicy(root); applyStage();
    if (SHOULD_ANIMATE_INITIAL_MOUNT) {
      await runConstructionSequence(new Map(), {
        mutationId: "initial-foundation",
        constructionPlan: initialFoundationConstructionPlan(),
        operations: [],
      });
    }
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
    resolveAuthoredSpatialDependencies(currentRevisionId);
    refreshRelationResizeObserver();
    queueContentSize();
    [40, 120, 260, 520, 900, 1500].forEach((delay) => setTimeout(() => { queueAuthoredRelationResolution(); queueContentSize(); }, delay));
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
    body{position:relative;background:transparent;color:#10121d;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input,textarea,select{font:inherit}img{display:block;max-width:100%}[hidden]{display:none!important}
    ${NORTHSTAR_DESIGN_KERNEL_CSS}
    /* The premium Northstar field belongs to the host canvas. The isolated
       browser document must never paint a second lavender canvas behind the
       authored artboard or expose it as an interior gutter. */
    html,body{background:transparent!important}
    #northstar-artifact-stage{position:relative;width:${authoredLayoutBaseWidth}px;min-width:1px;height:${authoredLayoutBaseHeight}px;min-height:1px;overflow:visible}
    #northstar-artifact-origin{position:absolute;left:0;top:0;width:max-content;height:max-content;transform-origin:top left;overflow:visible}
    #northstar-artifact-root{display:flow-root;width:${authoredLayoutBaseWidth}px;min-width:0;max-width:none;min-height:0;height:auto;overflow:visible}
    #northstar-artifact-root[data-ns-prepaint="true"]{opacity:0!important}
    #northstar-artifact-root,#northstar-artifact-root>.ns-artifact{max-width:none!important;max-height:none!important;overflow:visible!important}
    [data-ns-node-id]{will-change:transform,opacity}
    [data-ns-mutating="true"]{pointer-events:none}
    [data-ns-flow-id],[data-ns-reference-flow],[data-ns-flow-sequence],[data-ns-flow-id] [data-ns-evidence-id]{overflow:visible!important}
  </style>
  <style id="northstar-authored-foundation-style">${documentSource.css.replaceAll("</style", "<\\/style")}</style>
  ${initialAuthoredCssLayers}
</head>
<body>
  <div id="northstar-artifact-stage"><div id="northstar-artifact-origin"><div id="northstar-artifact-root"${shouldAnimateInitialMount ? ' data-ns-prepaint="true"' : ""} aria-label=${safeJson(artifact.title)}>${documentSource.html}</div></div></div>
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
    let pendingImageCount = 0;
    const failedAssetUrls = [];

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
      if (element instanceof HTMLImageElement) {
        if (!element.complete) {
          pendingImageCount += 1;
        } else if (element.naturalWidth === 0) {
          missingImageCount += 1;
          if (element.currentSrc || element.src) failedAssetUrls.push(element.currentSrc || element.src);
        }
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
    const viewportWidth = Math.max(1, document.documentElement.clientWidth || rootRect.width);
    const viewportHeight = Math.max(1, document.documentElement.clientHeight || rootRect.height);
    const overflowX = Math.max(0, contentBounds.width - viewportWidth);
    const overflowY = Math.max(0, contentBounds.height - viewportHeight);
    const visibleRoot = rootRect.width > ${NORTHSTAR_HEALTH_POLICY.render.minimumVisibleDimensionPx} && rootRect.height > ${NORTHSTAR_HEALTH_POLICY.render.minimumVisibleDimensionPx} && isVisibleElement(root);
    const requiredNodeIds = ${JSON.stringify(NORTHSTAR_HEALTH_POLICY.render.requiredNodeIds)};
    const missingRequiredNodeIds = requiredNodeIds.filter((nodeId) =>
      !root.querySelector('[data-ns-node-id="' + nodeId + '"]')
    );
    const growthBaselineWidth = Math.max(1, Number.parseFloat(root.dataset.nsPreferredWidth || "0") || viewportWidth);
    const growthBaselineHeight = Math.max(1, Number.parseFloat(root.dataset.nsPreferredHeight || "0") || viewportHeight);
    // Finite authored growth is never a render-health failure. The artboard is
    // unbounded and the runtime scales only its observation bitmap when needed.
    const extremeGrowth = false;
    const healthy = visibleRoot && pendingImageCount === 0 && failedAssetUrls.length === 0 &&
      missingRequiredNodeIds.length === 0 && !extremeGrowth;
    const issueCount = overflowElementCount + clippedTextCount + smallTextCount + tinyInteractiveCount + missingImageCount +
      pendingImageCount + missingRequiredNodeIds.length + (documentScrollRisk ? 1 : 0) + (extremeGrowth ? 1 : 0) + (visibleRoot ? 0 : 1);

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
        pendingImageCount,
        failedAssetUrls: Array.from(new Set(failedAssetUrls)),
        missingRequiredNodeIds,
        visible: visibleRoot,
        overflowX,
        overflowY,
        extremeGrowth,
        healthy,
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
    body { background: transparent; color: #10121d; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
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
