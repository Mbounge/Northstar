// Northstar Artboard Mutation Engine v0.6.0 — safe atomic edits plus deterministic typed primitive realization.
import { createHash } from "node:crypto";
import {
  NORTHSTAR_ARTBOARD_MUTATION_SCHEMA,
  type CanvasCodeArtifactBuildPhase,
  type NorthstarArtboardGeometryIntent,
  type NorthstarArtboardMutationBatch,
  type NorthstarArtboardMutationOperation,
  type NorthstarConstructionBeat,
  type NorthstarConstructionBeatKind,
  type NorthstarConstructionPlan,
  type NorthstarGeneratedCodeArtifactPackage,
  type NorthstarRequiredPrimitive,
  type NorthstarRequiredPrimitiveKind,
} from "@/lib/canvas-artifacts/types";

export interface NorthstarArtboardMutationDraft {
  title: string;
  description: string;
  visualStrategy: string;
  visibleChange: string;
  geometryIntent: NorthstarArtboardGeometryIntent;
  transitionMs: number;
  operations: NorthstarArtboardMutationOperation[];
  requiredPrimitives?: NorthstarRequiredPrimitive[];
  constructionPlan?: NorthstarConstructionPlan;
  /** Full authored DesignAct intention used only for deterministic promise fidelity checks. */
  authoredIntention?: string;
}

const MUTATION_PHASES: Array<Exclude<CanvasCodeArtifactBuildPhase, "complete">> = [
  "foundation",
  "evidence",
  "analysis",
  "recommendation",
  "refinement",
];

const GEOMETRY_INTENTS: NorthstarArtboardGeometryIntent[] = [
  "preserve",
  "expand-horizontal",
  "expand-vertical",
  "expand-both",
  "recompose",
  "contract-after-refinement",
];

const TARGET_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/;
const FORBIDDEN_HTML = /<(?:script|iframe|object|embed|link|meta|base|form|input|textarea|select|option)\b|\son[a-z]+\s*=|javascript\s*:/i;
const FORBIDDEN_CSS = /@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|url\s*\(/i;
const FORBIDDEN_STYLE_NAME = /^(?:behavior|-moz-binding)$/i;
const FORBIDDEN_ATTRIBUTE = /^(?:on[a-z]+|srcdoc|formaction|action|target)$/i;
const REQUIRED_PRIMITIVE_KINDS: NorthstarRequiredPrimitiveKind[] = [
  "frame",
  "evidence-lane",
  "chart",
  "sparkline",
  "axis",
  "annotation",
  "relationship",
  "synthesis",
  "decision",
];
const CONSTRUCTION_BEAT_KINDS: NorthstarConstructionBeatKind[] = [
  "establish-frame",
  "open-layout",
  "choreograph-evidence",
  "draw-analysis",
  "anchor-annotations",
  "route-relationships",
  "reveal-synthesis",
  "resolve-decision",
  "settle",
];

export const NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 180 },
    description: { type: "string", minLength: 1, maxLength: 500 },
    visualStrategy: { type: "string", minLength: 1, maxLength: 1600 },
    visibleChange: { type: "string", minLength: 1, maxLength: 500 },
    geometryIntent: { type: "string", enum: GEOMETRY_INTENTS },
    transitionMs: { type: "integer", minimum: 80, maximum: 1200 },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 32,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["set-text"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              text: { type: "string", maxLength: 12000 },
            },
            required: ["op", "targetId", "text"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["set-html"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              html: { type: "string", minLength: 1, maxLength: 80000 },
            },
            required: ["op", "targetId", "html"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["insert-html"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              position: { type: "string", enum: ["beforebegin", "afterbegin", "beforeend", "afterend"] },
              html: { type: "string", minLength: 1, maxLength: 80000 },
            },
            required: ["op", "targetId", "position", "html"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["remove"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
            },
            required: ["op", "targetId"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["move"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              parentId: { type: "string", minLength: 1, maxLength: 120 },
              beforeId: { type: "string", minLength: 1, maxLength: 120 },
            },
            required: ["op", "targetId", "parentId"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["set-attributes"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              attributes: {
                type: "object",
                additionalProperties: { type: ["string", "null"] },
                maxProperties: 32,
              },
            },
            required: ["op", "targetId", "attributes"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["set-styles"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              styles: {
                type: "object",
                additionalProperties: { type: ["string", "null"] },
                maxProperties: 48,
              },
            },
            required: ["op", "targetId", "styles"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["set-classes"] },
              targetId: { type: "string", minLength: 1, maxLength: 120 },
              add: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 80 } },
              remove: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 80 } },
            },
            required: ["op", "targetId"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["set-css-layer"] },
              layerId: { type: "string", minLength: 1, maxLength: 80 },
              css: { type: "string", maxLength: 60000 },
            },
            required: ["op", "layerId", "css"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["set-runtime-module"] },
              moduleId: { type: "string", minLength: 1, maxLength: 80 },
              javascript: { type: "string", maxLength: 80000 },
            },
            required: ["op", "moduleId", "javascript"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["request-space"] },
              left: { type: "number", minimum: 0, maximum: 12000 },
              top: { type: "number", minimum: 0, maximum: 12000 },
              right: { type: "number", minimum: 0, maximum: 12000 },
              bottom: { type: "number", minimum: 0, maximum: 12000 },
            },
            required: ["op"],
          },
        ],
      },
    },
    requiredPrimitives: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 120 },
          kind: { type: "string", enum: REQUIRED_PRIMITIVE_KINDS },
          minimumInstances: { type: "integer", minimum: 1, maximum: 12 },
          criticality: { type: "string", enum: ["essential", "optional"] },
          instanceNodeIds: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 120 } },
          nodeIds: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 120 } },
          memberNodeIds: { type: "array", maxItems: 48, items: { type: "string", minLength: 1, maxLength: 120 } },
          anchorNodeIds: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 120 } },
          sourceNodeIds: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 120 } },
          targetNodeIds: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 120 } },
          parentNodeId: { type: "string", minLength: 1, maxLength: 120 },
          placement: {
            type: "string",
            enum: ["frame", "beneath-flow", "between-sections", "anchored-margin", "routed-overlay", "synthesis", "decision"],
          },
          label: { type: "string", maxLength: 180 },
          text: { type: "string", maxLength: 1200 },
          description: { type: "string", maxLength: 500 },
          encoding: { type: "string", enum: ["qualitative", "quantitative"] },
          valuesGrounded: { type: "boolean" },
          unit: { type: "string", maxLength: 80 },
          dataPoints: {
            type: "array",
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                sourceNodeId: { type: "string", minLength: 1, maxLength: 120 },
                label: { type: "string", minLength: 1, maxLength: 180 },
                value: { type: "number" },
                qualitativeLevel: { type: "string", enum: ["low", "medium", "high"] },
              },
              required: ["sourceNodeId", "label"],
            },
          },
          relationshipType: { type: "string", maxLength: 120 },
          route: { type: "string", enum: ["straight", "elbow", "soft-curve"] },
          confidence: { type: "string", enum: ["observed", "interpretive"] },
          priority: { type: "string", enum: ["low", "normal", "high"] },
        },
        required: ["id", "kind", "minimumInstances"],
      },
    },
    constructionPlan: {
      type: "object",
      additionalProperties: false,
      properties: {
        version: { type: "string", enum: ["northstar.live-visual-authorship.v2"] },
        mode: { type: "string", enum: ["cinematic", "compact"] },
        showBeatLabels: { type: "boolean" },
        coverageNodeIds: { type: "array", maxItems: 320, items: { type: "string", minLength: 1, maxLength: 120 } },
        strictCoverage: { type: "boolean" },
        totalDurationMs: { type: "integer", minimum: 600, maximum: 20000 },
        deadlineMs: { type: "integer", minimum: 1200, maximum: 26000 },
        beats: {
          type: "array",
          minItems: 1,
          maxItems: 18,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 1, maxLength: 120 },
              kind: { type: "string", enum: CONSTRUCTION_BEAT_KINDS },
              label: { type: "string", minLength: 1, maxLength: 180 },
              nodeIds: { type: "array", maxItems: 160, items: { type: "string", minLength: 1, maxLength: 120 } },
              durationMs: { type: "integer", minimum: 180, maximum: 2200 },
              staggerMs: { type: "integer", minimum: 0, maximum: 240 },
              holdMs: { type: "integer", minimum: 0, maximum: 1200 },
              emphasis: { type: "string", enum: ["quiet", "normal", "hero"] },
            },
            required: ["id", "kind", "label", "nodeIds", "durationMs", "staggerMs", "holdMs", "emphasis"],
          },
        },
      },
      required: ["version", "mode", "beats", "showBeatLabels"],
    },
  },
  required: [
    "title",
    "description",
    "visualStrategy",
    "visibleChange",
    "geometryIntent",
    "transitionMs",
    "operations",
  ],
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function cleanSource(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!TARGET_ID_PATTERN.test(id)) throw new Error(`Invalid semantic node id: ${id || "(empty)"}.`);
  return id;
}

function cleanOptionalIds(value: unknown, maximum = 24): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter((entry) => TARGET_ID_PATTERN.test(entry))))
    .slice(0, maximum);
}

function cleanOptionalId(value: unknown): string | undefined {
  const candidate = typeof value === "string" ? value.trim() : "";
  return TARGET_ID_PATTERN.test(candidate) ? candidate : undefined;
}

function sanitizePrimitiveDataPoints(value: unknown): NonNullable<NorthstarRequiredPrimitive["dataPoints"]> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as { sourceNodeId?: unknown; label?: unknown; value?: unknown; qualitativeLevel?: unknown };
    const sourceNodeId = cleanOptionalId(row.sourceNodeId);
    const label = cleanText(row.label, 180);
    if (!sourceNodeId || !label) return [];
    const numericValue = typeof row.value === "number" ? row.value : Number.NaN;
    const qualitativeLevel = ["low", "medium", "high"].includes(String(row.qualitativeLevel))
      ? row.qualitativeLevel as "low" | "medium" | "high"
      : undefined;
    return [{
      sourceNodeId,
      label,
      value: Number.isFinite(numericValue) ? numericValue : undefined,
      qualitativeLevel,
    }];
  });
}

function sanitizeRequiredPrimitives(value: unknown): NorthstarRequiredPrimitive[] {
  if (!Array.isArray(value)) return [];
  const result: NorthstarRequiredPrimitive[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, 24)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Partial<NorthstarRequiredPrimitive>;
    const id = typeof row.id === "string" && TARGET_ID_PATTERN.test(row.id.trim()) ? row.id.trim() : "";
    const kind = REQUIRED_PRIMITIVE_KINDS.includes(row.kind as NorthstarRequiredPrimitiveKind)
      ? row.kind as NorthstarRequiredPrimitiveKind
      : undefined;
    if (!id || !kind || seen.has(id)) continue;
    seen.add(id);
    const placement = ["frame", "beneath-flow", "between-sections", "anchored-margin", "routed-overlay", "synthesis", "decision"].includes(String(row.placement))
      ? row.placement
      : undefined;
    const route = ["straight", "elbow", "soft-curve"].includes(String(row.route)) ? row.route : undefined;
    const confidence = ["observed", "interpretive"].includes(String(row.confidence)) ? row.confidence : undefined;
    const priority = ["low", "normal", "high"].includes(String(row.priority)) ? row.priority : undefined;
    const encoding = ["qualitative", "quantitative"].includes(String(row.encoding)) ? row.encoding : undefined;
    result.push({
      id,
      kind,
      minimumInstances: Math.max(1, Math.min(12, Math.floor(Number(row.minimumInstances) || 1))),
      criticality: row.criticality === "essential" ? "essential" : "optional",
      instanceNodeIds: cleanOptionalIds(row.instanceNodeIds),
      nodeIds: cleanOptionalIds(row.nodeIds),
      memberNodeIds: cleanOptionalIds(row.memberNodeIds, 48),
      anchorNodeIds: cleanOptionalIds(row.anchorNodeIds),
      sourceNodeIds: cleanOptionalIds(row.sourceNodeIds),
      targetNodeIds: cleanOptionalIds(row.targetNodeIds),
      parentNodeId: cleanOptionalId(row.parentNodeId),
      placement,
      label: cleanText(row.label, 180) || undefined,
      text: cleanText(row.text, 1200) || undefined,
      description: cleanText(row.description, 500) || undefined,
      encoding,
      valuesGrounded: row.valuesGrounded === true,
      unit: cleanText(row.unit, 80) || undefined,
      dataPoints: sanitizePrimitiveDataPoints(row.dataPoints),
      relationshipType: cleanText(row.relationshipType, 120) || undefined,
      route,
      confidence,
      priority,
    });
  }
  return result;
}

function sanitizeConstructionBeat(raw: unknown, index: number): NorthstarConstructionBeat | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Partial<NorthstarConstructionBeat>;
  const kind = CONSTRUCTION_BEAT_KINDS.includes(row.kind as NorthstarConstructionBeatKind)
    ? row.kind as NorthstarConstructionBeatKind
    : undefined;
  if (!kind) return undefined;
  const id = typeof row.id === "string" && TARGET_ID_PATTERN.test(row.id.trim())
    ? row.id.trim()
    : `beat-${index + 1}`;
  return {
    id,
    kind,
    label: cleanText(row.label, 180) || kind.replaceAll("-", " "),
    nodeIds: cleanOptionalIds(row.nodeIds, 160),
    durationMs: Math.max(180, Math.min(2200, Math.round(Number(row.durationMs) || 680))),
    staggerMs: Math.max(0, Math.min(240, Math.round(Number(row.staggerMs) || 55))),
    holdMs: Math.max(0, Math.min(1200, Math.round(Number(row.holdMs) || 120))),
    emphasis: row.emphasis === "quiet" || row.emphasis === "hero" ? row.emphasis : "normal",
  };
}

function sanitizeConstructionPlan(value: unknown): NorthstarConstructionPlan | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Partial<NorthstarConstructionPlan>;
  const beats = (Array.isArray(row.beats) ? row.beats : [])
    .slice(0, 18)
    .map((beat, index) => sanitizeConstructionBeat(beat, index))
    .filter((beat): beat is NorthstarConstructionBeat => Boolean(beat));
  if (beats.length === 0) return undefined;
  const computedTotal = beats.reduce((sum, beat) => sum + beat.durationMs + beat.holdMs + Math.max(0, beat.nodeIds.length - 1) * beat.staggerMs, 0);
  const totalDurationMs = Math.max(600, Math.min(20_000, Math.round(Number(row.totalDurationMs) || computedTotal)));
  return {
    version: "northstar.live-visual-authorship.v2",
    mode: row.mode === "compact" ? "compact" : "cinematic",
    beats,
    coverageNodeIds: cleanOptionalIds(row.coverageNodeIds, 320),
    strictCoverage: row.strictCoverage !== false,
    totalDurationMs,
    deadlineMs: Math.max(totalDurationMs + 1_500, Math.min(26_000, Math.round(Number(row.deadlineMs) || totalDurationMs + 4_000))),
    showBeatLabels: row.showBeatLabels !== false,
  };
}

function cleanClassNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter((entry) => /^[a-zA-Z_][a-zA-Z0-9_-]{0,79}$/.test(entry))))
    .slice(0, 24);
}

function cleanStringMap(value: unknown, kind: "attributes" | "styles"): Record<string, string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, kind === "styles" ? 48 : 32)) {
    const key = rawKey.trim();
    if (!key || (kind === "attributes" ? FORBIDDEN_ATTRIBUTE.test(key) : FORBIDDEN_STYLE_NAME.test(key))) continue;
    if (rawValue === null) {
      result[key] = null;
      continue;
    }
    if (typeof rawValue !== "string") continue;
    const cleaned = rawValue.trim().slice(0, 2000);
    if (/javascript\s*:|expression\s*\(|url\s*\(/i.test(cleaned)) continue;
    result[key] = cleaned;
  }
  return result;
}


const FORBIDDEN_RUNTIME_JAVASCRIPT: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/, "network access"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, "browser storage"],
  [/document\s*\.\s*cookie/, "cookies"],
  [/\bparent\b|\bopener\b/, "parent-window access"],
  [/\bwindow\s*\.\s*top\b|\btop\s*\./, "top-window access"],
  [/\beval\s*\(|\bFunction\s*\(/, "dynamic code evaluation"],
  [/\bimport\s*\(|\brequire\s*\(/, "module loading"],
  [/\bprocess\b|\bDeno\b/, "server runtime access"],
  [/\b(?:window|document|globalThis|self|navigator|history)\b/, "ambient browser-global access; use the Northstar API"],
  [/\b(?:Worker|SharedWorker|ServiceWorker|BroadcastChannel|MessageChannel|RTCPeerConnection|WebTransport|WebAssembly)\b/, "external execution or communication"],
  [/\b(?:sendBeacon|open)\s*\(/, "external communication or navigation"],
  [/\b(?:constructor|__proto__|prototype)\b/, "prototype or constructor escape"],
  [/\b(?:setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|queueMicrotask)\s*\(/, "deferred scheduling"],
  [/\b(?:async|await|Promise)\b/, "asynchronous execution"],
  [/\bpostMessage\s*\(/, "cross-context messaging"],
  [/\blocation\s*=|\blocation\s*\.\s*(?:assign|replace)\s*\(/, "navigation"],
];

function sanitizeRuntimeJavascript(value: unknown): string {
  const javascript = cleanSource(value, 80000);
  for (const [pattern, label] of FORBIDDEN_RUNTIME_JAVASCRIPT) {
    if (pattern.test(javascript)) throw new Error(`A runtime source module contains prohibited ${label}.`);
  }
  try {
    // Syntax-only validation. The browser executes the module inside the existing
    // isolated runtime with Northstar/data/creative/reviews as its only inputs.
    new Function("Northstar", "data", "creative", "reviews", `"use strict";\n${javascript}`);
  } catch (error) {
    throw new Error(`A runtime source module has invalid JavaScript syntax: ${error instanceof Error ? error.message : String(error)}`);
  }
  return javascript;
}

function sanitizeOperation(operation: NorthstarArtboardMutationOperation): NorthstarArtboardMutationOperation {
  const protectedRoot = "targetId" in operation && ["artboard", "__root__"].includes(String(operation.targetId));
  if (protectedRoot && ["set-html", "recompose-region", "remove", "move"].includes(operation.op)) {
    throw new Error("The permanent living-artboard root cannot be replaced, removed, or moved.");
  }
  switch (operation.op) {
    case "set-text":
      return { op: "set-text", targetId: cleanId(operation.targetId), text: String(operation.text ?? "").slice(0, 12000) };
    case "set-html": {
      const html = cleanSource(operation.html, 80000);
      if (!html || FORBIDDEN_HTML.test(html)) throw new Error("A mutation contains unsafe or empty HTML.");
      return { op: "set-html", targetId: cleanId(operation.targetId), html };
    }
    case "recompose-region": {
      const html = cleanSource(operation.html, 80000);
      if (!html || FORBIDDEN_HTML.test(html)) throw new Error("A recomposition contains unsafe or empty HTML.");
      const placements = (operation.placements ?? []).slice(0, 240).map((placement) => ({
        targetId: cleanId(placement.targetId),
        parentId: cleanId(placement.parentId),
        beforeId: placement.beforeId ? cleanId(placement.beforeId) : undefined,
        runtimeInherited: placement.runtimeInherited === true || undefined,
        preserveGeometry: placement.preserveGeometry === true || undefined,
      }));
      return {
        op: "recompose-region",
        targetId: cleanId(operation.targetId),
        html,
        placements,
        retireNodeIds: Array.from(new Set((operation.retireNodeIds ?? []).map((nodeId) => cleanId(nodeId)))).slice(0, 240),
      };
    }
    case "insert-html": {
      const html = cleanSource(operation.html, 80000);
      if (!html || FORBIDDEN_HTML.test(html)) throw new Error("A mutation contains unsafe or empty inserted HTML.");
      if (!["beforebegin", "afterbegin", "beforeend", "afterend"].includes(operation.position)) {
        throw new Error("A mutation contains an invalid insertion position.");
      }
      return { op: "insert-html", targetId: cleanId(operation.targetId), position: operation.position, html };
    }
    case "remove":
      return { op: "remove", targetId: cleanId(operation.targetId) };
    case "move":
      return {
        op: "move",
        targetId: cleanId(operation.targetId),
        parentId: cleanId(operation.parentId),
        beforeId: operation.beforeId ? cleanId(operation.beforeId) : undefined,
      };
    case "set-attributes":
      return { op: "set-attributes", targetId: cleanId(operation.targetId), attributes: cleanStringMap(operation.attributes, "attributes") };
    case "set-styles":
      return { op: "set-styles", targetId: cleanId(operation.targetId), styles: cleanStringMap(operation.styles, "styles") };
    case "set-classes":
      return { op: "set-classes", targetId: cleanId(operation.targetId), add: cleanClassNames(operation.add), remove: cleanClassNames(operation.remove) };
    case "set-css-layer": {
      const layerId = cleanId(operation.layerId).slice(0, 80);
      const css = cleanSource(operation.css, 60000);
      if (FORBIDDEN_CSS.test(css)) throw new Error("A mutation CSS layer contains a prohibited construct.");
      return { op: "set-css-layer", layerId, css };
    }
    case "set-runtime-module": {
      const moduleId = cleanId(operation.moduleId).slice(0, 80);
      return { op: "set-runtime-module", moduleId, javascript: sanitizeRuntimeJavascript(operation.javascript) };
    }
    case "request-space":
      return {
        op: "request-space",
        left: Math.max(0, Math.min(12000, Number(operation.left) || 0)),
        top: Math.max(0, Math.min(12000, Number(operation.top) || 0)),
        right: Math.max(0, Math.min(12000, Number(operation.right) || 0)),
        bottom: Math.max(0, Math.min(12000, Number(operation.bottom) || 0)),
      };
  }
}

export function sanitizeNorthstarArtboardMutationDraft(
  draft: NorthstarArtboardMutationDraft,
): NorthstarArtboardMutationDraft {
  const operations = (Array.isArray(draft?.operations) ? draft.operations : [])
    .slice(0, 32)
    .map((operation) => sanitizeOperation(operation));
  if (operations.length === 0) throw new Error("The proposed artboard mutation contains no visible operations.");
  const geometryIntent = GEOMETRY_INTENTS.includes(draft.geometryIntent)
    ? draft.geometryIntent
    : "preserve";
  return {
    title: cleanText(draft.title, 180) || "Northstar visual artifact",
    description: cleanText(draft.description, 500) || "Northstar is continuously refining the same artboard.",
    visualStrategy: cleanText(draft.visualStrategy, 1600) || "Continuous visual reasoning on one persistent artboard.",
    visibleChange: cleanText(draft.visibleChange, 500) || "The same artboard visibly evolved.",
    geometryIntent,
    transitionMs: Math.max(80, Math.min(1200, Math.round(Number(draft.transitionMs) || 320))),
    operations,
    requiredPrimitives: sanitizeRequiredPrimitives(draft.requiredPrimitives),
    constructionPlan: sanitizeConstructionPlan(draft.constructionPlan),
  };
}


/**
 * Deterministic preflight repair for model-authored mutation drafts.
 * Keeps the established compiler contract while removing operations that would
 * replace structural roots or draw untyped freehand relationships.
 */
const PERMANENT_PRESENTATION_ANCHORS = [
  { nodeId: "synthesis", stage: "analysis", className: "ns-synthesis-anchor" },
  { nodeId: "decision", stage: "recommendation", className: "ns-decision-anchor" },
] as const;

function hasSemanticNode(markup: string, nodeId: string): boolean {
  return new RegExp(`data-ns-node-id\\s*=\\s*["']${nodeId}["']`, "i").test(markup);
}

function repairPermanentPresentationAnchors(markup: string): { markup: string; restoredNodeIds: string[] } {
  const restoredNodeIds = PERMANENT_PRESENTATION_ANCHORS
    .filter((anchor) => !hasSemanticNode(markup, anchor.nodeId))
    .map((anchor) => anchor.nodeId);
  if (restoredNodeIds.length === 0) return { markup, restoredNodeIds };

  const anchors = PERMANENT_PRESENTATION_ANCHORS
    .filter((anchor) => restoredNodeIds.includes(anchor.nodeId))
    .map((anchor) => `<section class="${anchor.className}" data-ns-node-id="${anchor.nodeId}" data-ns-stage="${anchor.stage}"></section>`)
    .join("");
  return { markup: `${markup}${anchors}`, restoredNodeIds };
}

export function repairNorthstarArtboardMutationDraft(
  draft: NorthstarArtboardMutationDraft,
): { draft: NorthstarArtboardMutationDraft; repairs: string[] } {
  const repairs: string[] = [];
  const operations: NorthstarArtboardMutationOperation[] = [];
  const structuralSetHtmlTargets = new Set([
    "artboard",
    "__root__",
  ]);

  for (const operation of draft.operations ?? []) {
    if (
      operation.op === "set-html" &&
      structuralSetHtmlTargets.has(String(operation.targetId))
    ) {
      repairs.push(`Dropped illegal structural replacement of ${String(operation.targetId)}.`);
      continue;
    }

    if (operation.op === "set-html" && operation.targetId === "presentation") {
      const repaired = repairPermanentPresentationAnchors(operation.html);
      operations.push({ ...operation, html: repaired.markup });
      if (repaired.restoredNodeIds.length > 0) {
        repairs.push(`Restored permanent presentation anchor${repaired.restoredNodeIds.length === 1 ? "" : "s"}: ${repaired.restoredNodeIds.join(", ")}.`);
      }
      continue;
    }

    if (operation.op === "set-css-layer") {
      const css = String(operation.css ?? "");
      const drawsFreehandRelationship =
        /(?:border(?:-top|-right|-bottom|-left)?\s*:\s*[^;]*(?:dashed|dotted)|stroke-dasharray|clip-path\s*:|rotate\s*:|transform\s*:[^;]*rotate|::(?:before|after)[\s\S]{0,500}(?:dashed|dotted|border-radius\s*:\s*50%))/i.test(css);
      const targetsTypedRelationship = /\[data-ns-relationship-id(?:=|\])/i.test(css);
      if (drawsFreehandRelationship && !targetsTypedRelationship) {
        repairs.push(`Dropped freehand relationship CSS layer ${operation.layerId}.`);
        continue;
      }
    }

    operations.push(operation);
  }

  return {
    draft: { ...draft, operations },
    repairs,
  };
}

/**
 * Verifies that a build stage contains an observable mutation and that
 * semantic stages are not represented by styling or geometry changes alone.
 */
export function validateNorthstarStageMateriality(input: {
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  operations: NorthstarArtboardMutationOperation[];
}): string[] {
  if (input.operations.length === 0) {
    return ["The proposed stage contains no visible operations."];
  }

  const semanticOperations = input.operations.filter(
    (operation) =>
      operation.op !== "set-css-layer" &&
      operation.op !== "request-space" &&
      operation.op !== "set-styles",
  );

  if (
    (input.phase === "evidence" ||
      input.phase === "analysis" ||
      input.phase === "recommendation") &&
    semanticOperations.length === 0
  ) {
    return [
      `The ${input.phase} stage requires a content or structural change; style-only operations cannot satisfy it.`,
    ];
  }

  return [];
}

export function createNorthstarArtboardMutationBatch(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  draft: NorthstarArtboardMutationDraft;
  label: string;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  intent: string;
  minimumMeaningfulChangedNodes?: number;
  allowTextOnly?: boolean;
  requiredChangeKinds?: NorthstarArtboardMutationBatch["requiredChangeKinds"];
  minimumChangedAreaRatio?: number;
  minimumSpatiallyChangedNodes?: number;
  minimumMovedNodes?: number;
  minimumResizedNodes?: number;
}): NorthstarArtboardMutationBatch {
  const draft = sanitizeNorthstarArtboardMutationDraft(input.draft);
  const styleOnly = draft.operations.every((operation) =>
    operation.op === "set-css-layer" || operation.op === "request-space" || operation.op === "set-styles",
  );
  const semanticIntent = /challenge|analysis|solution|synthesis|recommendation|resolution|settlement|publication/i.test(
    `${input.label} ${input.intent}`,
  );
  if (styleOnly && (input.phase === "analysis" || input.phase === "recommendation" || semanticIntent)) {
    throw new Error("A semantic visual stage cannot be satisfied by CSS, spacing, or style operations alone.");
  }
  const journal = input.previous.mutationJournal ?? [];
  const sequence = journal.length + 1;
  const parentMutationId = journal.at(-1)?.mutationId;
  const hash = createHash("sha256")
    .update(JSON.stringify({
      sequence,
      operations: draft.operations,
      requiredPrimitives: draft.requiredPrimitives,
      constructionPlan: draft.constructionPlan,
      label: input.label,
    }))
    .digest("hex")
    .slice(0, 14);
  return {
    schema: NORTHSTAR_ARTBOARD_MUTATION_SCHEMA,
    mutationId: `${input.previous.artifactId}-mutation-${sequence}-${hash}`,
    sequence,
    parentMutationId,
    label: cleanText(input.label, 120) || `Design adjustment ${sequence}`,
    phase: MUTATION_PHASES.includes(input.phase) ? input.phase : "analysis",
    intent: cleanText(input.intent, 700) || draft.visibleChange,
    visibleChange: draft.visibleChange,
    geometryIntent: draft.geometryIntent,
    transitionMs: draft.transitionMs,
    operations: draft.operations,
    requiredPrimitives: draft.requiredPrimitives,
    constructionPlan: draft.constructionPlan,
    minimumMeaningfulChangedNodes: input.minimumMeaningfulChangedNodes,
    allowTextOnly: input.allowTextOnly,
    requiredChangeKinds: input.requiredChangeKinds,
    minimumChangedAreaRatio: input.minimumChangedAreaRatio === undefined
      ? undefined
      : Math.max(0, Math.min(1, input.minimumChangedAreaRatio)),
    minimumSpatiallyChangedNodes: input.minimumSpatiallyChangedNodes === undefined
      ? undefined
      : Math.max(0, Math.floor(input.minimumSpatiallyChangedNodes)),
    minimumMovedNodes: input.minimumMovedNodes === undefined
      ? undefined
      : Math.max(0, Math.floor(input.minimumMovedNodes)),
    minimumResizedNodes: input.minimumResizedNodes === undefined
      ? undefined
      : Math.max(0, Math.floor(input.minimumResizedNodes)),
    createdAt: new Date().toISOString(),
  };
}


export function appendNorthstarArtboardMutation(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  draft: NorthstarArtboardMutationDraft;
  label: string;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  intent: string;
  verified?: boolean;
  diagnostics?: string[];
  minimumMeaningfulChangedNodes?: number;
  allowTextOnly?: boolean;
  requiredChangeKinds?: NorthstarArtboardMutationBatch["requiredChangeKinds"];
  minimumChangedAreaRatio?: number;
  minimumSpatiallyChangedNodes?: number;
  minimumMovedNodes?: number;
  minimumResizedNodes?: number;
}): NorthstarGeneratedCodeArtifactPackage {
  const sanitized = sanitizeNorthstarArtboardMutationDraft(input.draft);
  const batch = createNorthstarArtboardMutationBatch({
    previous: input.previous,
    draft: sanitized,
    label: input.label,
    phase: input.phase,
    intent: input.intent,
    minimumMeaningfulChangedNodes: input.minimumMeaningfulChangedNodes,
    allowTextOnly: input.allowTextOnly,
    requiredChangeKinds: input.requiredChangeKinds,
    minimumChangedAreaRatio: input.minimumChangedAreaRatio,
    minimumSpatiallyChangedNodes: input.minimumSpatiallyChangedNodes,
    minimumMovedNodes: input.minimumMovedNodes,
    minimumResizedNodes: input.minimumResizedNodes,
  });
  // Geometry is never estimated into the package. The currently mounted browser surface
  // applies the mutation first, measures its exact full bounds, and then updates the same
  // Canvas object's x/y/w/h. Preserving these values prevents a pre-mutation scale jump.
  const verified = Boolean(input.verified);
  return {
    ...input.previous,
    surfaceId: input.previous.surfaceId ?? input.previous.artifactId,
    revisionId: `${input.previous.artifactId}-live-${batch.sequence}-${batch.mutationId.slice(-10)}`,
    parentRevisionId: input.previous.revisionId,
    title: sanitized.title,
    description: sanitized.description,
    visualStrategy: sanitized.visualStrategy,
    mutationJournal: [...(input.previous.mutationJournal ?? []), batch],
    preferredWidth: input.previous.preferredWidth,
    preferredHeight: input.previous.preferredHeight,
    layoutBaseWidth: input.previous.layoutBaseWidth ?? input.previous.preferredWidth,
    layoutBaseHeight: input.previous.layoutBaseHeight ?? input.previous.preferredHeight,
    intrinsicBounds: input.previous.intrinsicBounds,
    dataBundle: input.previous.dataBundle,
    diagnostics: [...input.previous.diagnostics, ...(input.diagnostics ?? []), `Visible mutation ${batch.sequence}: ${batch.visibleChange}`].slice(-60),
    provisional: !verified,
    publicationState: verified ? "verified" : "working",
  };
}

export function getNorthstarMutationJournalDiagnostics(
  packageValue: NorthstarGeneratedCodeArtifactPackage,
): string[] {
  const journal = packageValue.mutationJournal ?? [];
  const issues: string[] = [];
  let previousId: string | undefined;
  for (let index = 0; index < journal.length; index += 1) {
    const batch = journal[index];
    if (batch.sequence !== index + 1) issues.push(`Mutation journal sequence ${batch.sequence} is not contiguous at index ${index}.`);
    if (index > 0 && batch.parentMutationId !== previousId) issues.push(`Mutation ${batch.mutationId} does not descend from the previous visible mutation.`);
    if (batch.operations.length === 0) issues.push(`Mutation ${batch.mutationId} contains no operations.`);
    previousId = batch.mutationId;
  }
  return issues;
}

export function buildNorthstarArtboardMutationSystemInstruction(designAddendum: string): string {
  return `
You are Northstar working like a world-class artist, researcher, strategist, and product designer on one living artboard.

${designAddendum}

ONE SURFACE — ABSOLUTE CONTRACT
- The user is already looking at the only artboard that will ever exist for this task.
- Do not generate another page, document, iframe, artboard, concept board, or final render.
- Return only a mutation batch that changes nodes inside the currently mounted surface.
- The starting surface and completed surface are the same DOM and the same Canvas object.
- Work through observable micro-adjustments: add, move, resize, regroup, annotate, simplify, emphasize, restyle, or remove.
- Preserve strong existing work. Never reset the composition.
- Every operation targets stable data-ns-node-id values. New inserted elements must include unique data-ns-node-id attributes.
- Use set-css-layer to evolve the visual system without replacing the base stylesheet.
- Use set-html only for a specific semantic region; never target artboard with set-html and never replace the entire root.
- One batch should express one focused design adjustment that a watching human notices.

GEOMETRY CONTRACT
- Content and composition determine the artboard bounds after every mutation.
- Never shrink screenshots or typography to fit the current rectangle.
- Use natural readable scale and let the same artboard grow left, right, up, or down.
- Use request-space only for deliberate negative-position or off-origin composition.
- Essential content cannot use internal scrolling, clipping, transform:scale, zoom, or viewport-fit compression.

GOLD-STANDARD NORTHSTAR LANGUAGE
- All eight attached reference images are active taste conditioning for every mutation.
- Learn their editorial confidence, hierarchy, typography, spacing, restrained violet/lilac character, evidence clarity, simplicity, and finish.
- Never copy any one reference's structure, section order, or component arrangement.
- The selected medium and metaphor must emerge through the accumulated mutations on the current surface.

REFERENCE FLOW BEHAVIOUR
- Preserve real app icon, app name, exact flow name, authoritative screenshot order, clean horizontal sequence, and natural aspect ratio.
- Screenshots are evidence, not decorative cards. Keep mobile screenshots readable and let the artboard widen.

SAFETY
- Return only the required JSON.
- HTML fragments cannot contain script, iframe, object, embed, link, meta, base, forms, inline event handlers, or invented asset URLs.
- CSS cannot use @import, url(), external fonts, viewport-fit scaling, or unsafe constructs.
- Do not include commentary outside the JSON.
`.trim();
}

export function buildNorthstarArtboardMutationModelInput(input: {
  objective: string;
  audience: string;
  artifactType: string;
  userRequest: string;
  designAct: {
    id: string;
    label: string;
    phase: "analysis" | "recommendation" | "refinement";
    intent: string;
    successCriteria: string[];
  };
  previous: NorthstarGeneratedCodeArtifactPackage;
  currentRender: { width: number; height: number; mimeType: string };
  groundedEvidence: unknown;
  creativeDirection: unknown;
  priorCritique?: { critique: string; requiredChanges: string[] };
  attempt: number;
  maxAttempts: number;
}): unknown {
  const journal = input.previous.mutationJournal ?? [];
  return {
    mode: "micro-adjust-one-existing-live-artboard",
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    userRequest: input.userRequest,
    currentDesignAct: input.designAct,
    currentRender: input.currentRender,
    priorVisualCritique: input.priorCritique,
    creativeDirection: input.creativeDirection,
    groundedEvidence: input.groundedEvidence,
    permanentSurface: {
      artifactId: input.previous.artifactId,
      surfaceId: input.previous.surfaceId ?? input.previous.artifactId,
      currentRevisionId: input.previous.revisionId,
      currentTitle: input.previous.title,
      currentDescription: input.previous.description,
      baseDocument: input.previous.document,
      existingMutationJournal: journal,
      currentSemanticNodeIds: extractSemanticNodeIds(input.previous),
      mutationCount: journal.length,
    },
    outputContract: {
      oneFocusedVisibleAdjustment: true,
      operationsTargetSemanticNodeIds: true,
      insertedMarkupNeedsUniqueSemanticNodeIds: true,
      neverReplaceRootOrDocument: true,
      sameSurfaceFromStartToFinish: true,
      geometryMeasuredAfterMutation: true,
    },
  };
}

function extractSemanticNodeIds(packageValue: NorthstarGeneratedCodeArtifactPackage): string[] {
  const ids = new Set<string>();
  const pattern = /data-ns-node-id\s*=\s*["']([^"']+)["']/gi;
  const sources = [
    packageValue.document.html,
    ...(packageValue.mutationJournal ?? []).flatMap((batch) => batch.operations
      .filter((operation): operation is Extract<NorthstarArtboardMutationOperation, { op: "set-html" | "insert-html" | "recompose-region" }> => operation.op === "set-html" || operation.op === "insert-html" || operation.op === "recompose-region")
      .map((operation) => operation.html)),
  ];
  for (const source of sources) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) ids.add(match[1]);
  }
  // Artifacts created before v0.4.8 may not have explicit semantic ids. The new runtime
  // resolves these stable aliases against the existing DOM without remounting it.
  const base = packageValue.document.html;
  if (/<(?:main|article)\b|class=["'][^"']*ns-artifact/i.test(base)) ids.add("artboard");
  if (/<header\b|class=["'][^"']*ns-header/i.test(base)) ids.add("header");
  if (/<h1\b|class=["'][^"']*ns-thesis/i.test(base)) ids.add("title");
  if (/class=["'][^"']*(?:ns-deck|working-deck)/i.test(base) || /<header[\s\S]*?<p\b/i.test(base)) ids.add("deck");
  if (/data-ns-flow-id|class=["'][^"']*(?:working-evidence|ns-atlas)/i.test(base)) ids.add("evidence");
  if (/class=["'][^"']*(?:working-synthesis|ns-synthesis|synthesis)/i.test(base) || /<footer\b/i.test(base)) ids.add("synthesis");
  if (/class=["'][^"']*(?:working-decision|ns-decision|recommendation)/i.test(base)) ids.add("decision");
  if (/class=["'][^"']*working-act/i.test(base)) { ids.add("current-act"); ids.add("current-act-text"); }
  return Array.from(ids).slice(0, 800);
}

function escapeMutationHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A grounded continuity fallback used only when model mutation authoring is unavailable.
 * It still performs a real, visible edit on the mounted surface so the progress stream and
 * artboard cannot drift apart. The next model-authored mutation can refine or replace it.
 */
export function buildDeterministicNorthstarArtboardMutationDraft(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  label: string;
  intent: string;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  summary?: string;
  synthesis?: string;
  decision?: string;
}): NorthstarArtboardMutationDraft {
  const sequence = (input.previous.mutationJournal?.length ?? 0) + 1;
  const summary = cleanText(input.summary, 900) || cleanText(input.intent, 900) || input.label;
  const phase = MUTATION_PHASES.includes(input.phase) ? input.phase : "analysis";
  const accentShift = sequence % 3;
  const operations: NorthstarArtboardMutationOperation[] = [
    {
      op: "set-text",
      targetId: "current-act-text",
      text: `${input.label}. ${summary}`.slice(0, 1400),
    },
    {
      op: "set-attributes",
      targetId: "artboard",
      attributes: {
        "data-ns-live-phase": phase,
        "data-ns-live-mutation": String(sequence),
      },
    },
    {
      op: "set-css-layer",
      layerId: `continuity-${sequence}`,
      css: `
[data-ns-node-id="artboard"]{
  --ns-live-accent:${accentShift === 0 ? "#6b4dff" : accentShift === 1 ? "#7658ff" : "#5f48e8"};
  row-gap:${30 + Math.min(18, sequence * 2)}px;
}
[data-ns-node-id="header"]{max-width:${Math.min(1480, 1080 + sequence * 34)}px}
[data-ns-node-id="title"]{text-wrap:balance;letter-spacing:${Math.max(-0.064, -0.05 - sequence * 0.001)}em}
[data-ns-node-id="current-act"]{border-left-color:var(--ns-live-accent);transition:all .32s cubic-bezier(.2,.8,.2,1)}
[data-ns-node-id="evidence"]{gap:${24 + Math.min(24, sequence * 2)}px}
[data-ns-node-id="artboard"] [data-ns-node-id]{transition-property:transform,opacity,width,height,padding,margin,gap,font-size,line-height,background-color,border-color;transition-duration:.32s;transition-timing-function:cubic-bezier(.2,.8,.2,1)}
      `.trim(),
    },
  ];

  if (phase === "analysis" && (input.synthesis || summary)) {
    operations.push(
      {
        op: "set-html",
        targetId: "synthesis",
        html: `<p class="ns-live-kicker" data-ns-node-id="synthesis-kicker">Emerging synthesis</p><p data-ns-node-id="synthesis-text">${escapeMutationHtml(cleanText(input.synthesis, 1200) || summary)}</p>`,
      },
      {
        op: "set-styles",
        targetId: "synthesis",
        styles: { display: "grid", opacity: "1" },
      },
    );
  }

  if (phase === "recommendation" && (input.decision || input.synthesis || summary)) {
    operations.push(
      {
        op: "set-html",
        targetId: "decision",
        html: `<p class="ns-live-kicker" data-ns-node-id="decision-kicker">Decision taking shape</p><p data-ns-node-id="decision-text">${escapeMutationHtml(cleanText(input.decision, 1200) || cleanText(input.synthesis, 1200) || summary)}</p>`,
      },
      {
        op: "set-styles",
        targetId: "decision",
        styles: { display: "grid", opacity: "1" },
      },
    );
  }

  return {
    title: input.previous.title,
    description: cleanText(input.previous.description, 500) || summary,
    visualStrategy: `${cleanText(input.previous.visualStrategy, 1200)} Continuous adjustment ${sequence}: ${cleanText(input.intent, 300)}`.trim(),
    visibleChange: `Adjusted the same live artboard for “${input.label}”.`,
    geometryIntent: phase === "evidence"
      ? "expand-horizontal"
      : phase === "recommendation"
        ? "expand-vertical"
        : phase === "refinement"
          ? "recompose"
          : "preserve",
    transitionMs: 320,
    operations,
  };
}
