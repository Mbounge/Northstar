// Northstar Artboard Mutation Engine v0.4.8.3 — granular observable edits, asset declarations, design-act contracts, and no-op rejection on one persistent surface.
import { createHash } from "node:crypto";
import {
  NORTHSTAR_ARTBOARD_MUTATION_SCHEMA,
  type CanvasCodeArtifactBuildPhase,
  type NorthstarArtboardChangeKind,
  type NorthstarArtboardGeometryIntent,
  type NorthstarArtboardMutationBatch,
  type NorthstarArtboardMutationOperation,
  type NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

export interface NorthstarArtboardMutationDraft {
  title: string;
  description: string;
  visualStrategy: string;
  visibleChange: string;
  geometryIntent: NorthstarArtboardGeometryIntent;
  transitionMs: number;
  operations: NorthstarArtboardMutationOperation[];
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
const STRUCTURAL_SET_HTML_TARGETS = new Set(["artboard", "__root__", "header", "evidence"]);
const PROGRESS_ONLY_TARGETS = new Set(["kicker", "current-act", "current-act-text"]);

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

function sanitizeOperation(operation: NorthstarArtboardMutationOperation): NorthstarArtboardMutationOperation {
  const protectedRoot = "targetId" in operation && ["artboard", "__root__"].includes(String(operation.targetId));
  if (protectedRoot && ["set-html", "remove", "move"].includes(operation.op)) {
    throw new Error("The permanent living-artboard root cannot be replaced, removed, or moved.");
  }
  switch (operation.op) {
    case "set-text":
      return { op: "set-text", targetId: cleanId(operation.targetId), text: String(operation.text ?? "").slice(0, 12000) };
    case "set-html": {
      const targetId = cleanId(operation.targetId);
      if (STRUCTURAL_SET_HTML_TARGETS.has(targetId)) throw new Error(`Structural region ${targetId} cannot be replaced; mutate its stable children instead.`);
      const html = cleanSource(operation.html, 80000);
      if (!html || FORBIDDEN_HTML.test(html)) throw new Error("A mutation contains unsafe or empty HTML.");
      return { op: "set-html", targetId, html };
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
  };
}

function extractRequiredAssetUrls(operations: NorthstarArtboardMutationOperation[]): string[] {
  const urls = new Set<string>();
  const pattern = /\b(?:src|href|poster)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  for (const operation of operations) {
    if (operation.op === "set-html" || operation.op === "insert-html") {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(operation.html))) urls.add(match[1]);
    }
    if (operation.op === "set-attributes") {
      for (const [name, value] of Object.entries(operation.attributes)) {
        if (/^(?:src|href|poster)$/i.test(name) && typeof value === "string" && /^https?:\/\//i.test(value)) urls.add(value);
      }
    }
  }
  return Array.from(urls).slice(0, 160);
}

function inferMutationContract(input: {
  label: string;
  intent: string;
  operations: NorthstarArtboardMutationOperation[];
}): {
  minimumMeaningfulChangedNodes: number;
  allowTextOnly: boolean;
  requiredChangeKinds: NorthstarArtboardChangeKind[];
} {
  const haystack = `${input.label} ${input.intent}`.toLowerCase();
  const structural = input.operations.some((operation) => ["insert-html", "remove", "move"].includes(operation.op));
  const scale = input.operations.some((operation) => operation.op === "set-styles" && Object.keys(operation.styles).some((key) => /width|height|flex-basis|font-size|transform/i.test(key)));
  const required = new Set<NorthstarArtboardChangeKind>();
  if (/curate|organize|relationship|argument|decisive proof|synthesis|decision|annotation|interpretation/.test(haystack)) required.add(structural ? "structure" : "style");
  if (/scale|breathing room|emphasize|decisive proof/.test(haystack)) required.add(scale ? "scale" : "style");
  if (/geometry|recompose|rebalance|space/.test(haystack)) required.add("geometry");
  if (/evidence|flow|screenshot/.test(haystack) && extractRequiredAssetUrls(input.operations).length) required.add("assets");
  const nonProgressTargets = new Set(input.operations.flatMap((operation) => {
    if ("targetId" in operation && !PROGRESS_ONLY_TARGETS.has(operation.targetId)) return [operation.targetId];
    return [];
  }));
  return {
    minimumMeaningfulChangedNodes: Math.max(1, Math.min(6, nonProgressTargets.size || (structural ? 2 : 1))),
    allowTextOnly: /sharpen|copy|title|thesis|wording/.test(haystack),
    requiredChangeKinds: Array.from(required),
  };
}

function semanticIdsFromMarkup(markup: string): string[] {
  const ids: string[] = [];
  const pattern = /data-ns-node-id\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markup))) ids.push(match[1]);
  return ids;
}

function existingSemanticIds(previous: NorthstarGeneratedCodeArtifactPackage): Set<string> {
  const ids = new Set<string>(semanticIdsFromMarkup(previous.document.html));
  for (const batch of previous.mutationJournal ?? []) {
    for (const operation of batch.operations) {
      if (operation.op === "insert-html" || operation.op === "set-html") {
        for (const id of semanticIdsFromMarkup(operation.html)) ids.add(id);
      }
      if (operation.op === "remove") ids.delete(operation.targetId);
    }
  }
  return ids;
}

function assertInsertedSemanticIdsAreUnique(previous: NorthstarGeneratedCodeArtifactPackage, operations: NorthstarArtboardMutationOperation[]): void {
  const known = existingSemanticIds(previous);
  const inserted = new Set<string>();
  for (const operation of operations) {
    if (operation.op !== "insert-html" && operation.op !== "set-html") continue;
    for (const id of semanticIdsFromMarkup(operation.html)) {
      if (known.has(id) || inserted.has(id)) {
        throw new Error(`The proposed mutation would duplicate semantic node id “${id}”. Modify the existing node instead of inserting it again.`);
      }
      inserted.add(id);
    }
  }
}


function assertVisualMarksAreSemantic(operations: NorthstarArtboardMutationOperation[]): void {
  for (const operation of operations) {
    const source = operation.op === "insert-html" || operation.op === "set-html"
      ? operation.html
      : operation.op === "set-css-layer"
        ? operation.css
        : "";
    if (!source) continue;
    const createsDecorativeConnector = /(?:dotted|dashed|pulse|connector|path-marker|relationship-line|border-radius\s*:\s*50%)/i.test(source);
    if (!createsDecorativeConnector) continue;
    const hasMeaning = /data-ns-meaning\s*=\s*["'][^"']+["']/i.test(source);
    const hasAnchors = /data-ns-source-id\s*=\s*["'][^"']+["']/i.test(source)
      && /data-ns-target-id\s*=\s*["'][^"']+["']/i.test(source);
    if (!hasMeaning || !hasAnchors) {
      throw new Error("Decorative connectors, dotted lines, pulse markers, and circular pointers require data-ns-meaning plus anchored data-ns-source-id and data-ns-target-id semantics.");
    }
  }
}

function assertMutationDoesNotOnlyAccumulate(
  previous: NorthstarGeneratedCodeArtifactPackage,
  operations: NorthstarArtboardMutationOperation[],
): void {
  const recent = (previous.mutationJournal ?? []).slice(-2);
  const recentWereAdditive = recent.length === 2 && recent.every((batch) =>
    batch.operations.some((operation) => operation.op === "insert-html")
    && !batch.operations.some((operation) => operation.op === "remove" || operation.op === "move"),
  );
  const currentAdds = operations.some((operation) => operation.op === "insert-html");
  const currentTransforms = operations.some((operation) =>
    operation.op === "remove"
    || operation.op === "move"
    || operation.op === "set-styles"
    || operation.op === "set-classes",
  );
  if (recentWereAdditive && currentAdds && !currentTransforms) {
    throw new Error("The artboard has accumulated enough new sections. Transform, move, resize, merge, quiet, or remove existing nodes before appending another standalone region.");
  }
}

export function createNorthstarArtboardMutationBatch(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  draft: NorthstarArtboardMutationDraft;
  label: string;
  phase: Exclude<CanvasCodeArtifactBuildPhase, "complete">;
  intent: string;
}): NorthstarArtboardMutationBatch {
  const draft = sanitizeNorthstarArtboardMutationDraft(input.draft);
  assertInsertedSemanticIdsAreUnique(input.previous, draft.operations);
  assertVisualMarksAreSemantic(draft.operations);
  assertMutationDoesNotOnlyAccumulate(input.previous, draft.operations);
  const journal = input.previous.mutationJournal ?? [];
  const sequence = journal.length + 1;
  const parentMutationId = journal.at(-1)?.mutationId;
  const hash = createHash("sha256")
    .update(JSON.stringify({ sequence, operations: draft.operations, label: input.label }))
    .digest("hex")
    .slice(0, 14);
  const contract = inferMutationContract({ label: input.label, intent: input.intent, operations: draft.operations });
  const requiredAssetUrls = extractRequiredAssetUrls(draft.operations);
  const previousFingerprint = journal.at(-1)
    ? createHash("sha256").update(JSON.stringify(journal.at(-1)?.operations ?? [])).digest("hex")
    : "";
  const nextFingerprint = createHash("sha256").update(JSON.stringify(draft.operations)).digest("hex");
  if (previousFingerprint && previousFingerprint === nextFingerprint) {
    throw new Error("The proposed adjustment duplicates the immediately previous mutation.");
  }
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
    requiredAssetUrls,
    minimumMeaningfulChangedNodes: contract.minimumMeaningfulChangedNodes,
    allowTextOnly: contract.allowTextOnly,
    requiredChangeKinds: contract.requiredChangeKinds,
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
}): NorthstarGeneratedCodeArtifactPackage {
  const sanitized = sanitizeNorthstarArtboardMutationDraft(input.draft);
  const batch = createNorthstarArtboardMutationBatch({
    previous: input.previous,
    draft: sanitized,
    label: input.label,
    phase: input.phase,
    intent: input.intent,
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
    if ((batch.minimumMeaningfulChangedNodes ?? 0) < 1) issues.push(`Mutation ${batch.mutationId} has no meaningful-change floor.`);
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
- Never use set-html on artboard, header, or evidence. Add and mutate stable child nodes individually. set-html is limited to a small leaf synthesis or decision node that already exists.
- One batch should express one focused design adjustment that a watching human notices. Different design-act labels must produce materially different operations; changing only the progress copy does not count.

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

SEMANTIC VISUAL DISCIPLINE
- Every mark must communicate. Never add a free-floating dot, circle, dashed line, pulse, arrow, or connector merely to make the board feel designed.
- Any relationship mark must declare data-ns-meaning, data-ns-source-id, and data-ns-target-id, and its geometry must visibly connect those existing semantic nodes.
- Do not present qualitative opinions as quantitative metrics or a scored matrix unless the grounded evidence contains a defensible basis.
- Prefer rearranging, enlarging, compressing, merging, and removing existing evidence over appending generic cards or tables.
- A later move should often simplify or transform prior work. The artboard must become more coherent, not merely longer.

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
      existingMutationJournal: journal.slice(-6),
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
      .filter((operation): operation is Extract<NorthstarArtboardMutationOperation, { op: "set-html" | "insert-html" }> => operation.op === "set-html" || operation.op === "insert-html")
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
