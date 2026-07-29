//lib/canvas-ai/northstar-mutation-compiler.ts
// Northstar v1.2.0 — resilient typed DesignActs, exact evidence preservation, and degradable creative compilation.
import {
  normalizeNorthstarRelationshipMarkup,
  relationshipInventory,
  validateNorthstarSemanticRelationships,
} from "@/lib/canvas-ai/northstar-semantic-relationships";
import {
  repairNorthstarArtboardMutationDraft,
  validateNorthstarStageMateriality,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtboardMutationOperation,
  NorthstarCommittedSemanticNode,
  NorthstarConstructionBeat,
  NorthstarConstructionBeatKind,
  NorthstarConstructionPlan,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarPrimitiveDataPoint,
  NorthstarRequiredPrimitive,
} from "@/lib/canvas-artifacts/types";

const PROTECTED_ROOTS = new Set(["artboard", "__root__", "header"]);

export type NorthstarCompilerDiagnosticSeverity = "hard" | "repairable" | "advisory";

export interface NorthstarCompilerDiagnostic {
  code: string;
  severity: NorthstarCompilerDiagnosticSeverity;
  message: string;
}

export interface NorthstarMutationCompilationResult {
  draft: NorthstarArtboardMutationDraft;
  repairs: string[];
  diagnostics: NorthstarCompilerDiagnostic[];
  blocked: boolean;
}

function compilerDiagnostic(message: string): NorthstarCompilerDiagnostic {
  return {
    code: "COMPILER_REPAIR",
    severity: "advisory",
    message: String(message ?? "").trim(),
  };
}

function compilationResult(
  draft: NorthstarArtboardMutationDraft,
  repairs: string[],
  extraDiagnostics: NorthstarCompilerDiagnostic[] = [],
): NorthstarMutationCompilationResult {
  const diagnostics = [
    ...repairs.map(compilerDiagnostic),
    ...extraDiagnostics,
  ];
  const blocked = draft.operations.length === 0
    && diagnostics.some((diagnostic) => diagnostic.severity === "hard");
  return { draft, repairs, diagnostics, blocked };
}

interface NorthstarPrimitiveFailure {
  code: string;
  primitiveId: string;
  message: string;
}

function degradablePrimitiveSet(
  primitives: NorthstarRequiredPrimitive[] | undefined,
  failures: NorthstarPrimitiveFailure[],
): { remaining: NorthstarRequiredPrimitive[]; removed: NorthstarRequiredPrimitive[]; essentialFailures: NorthstarRequiredPrimitive[] } {
  const source = primitives ?? [];
  const failureIds = new Set(failures.map((failure) => failure.primitiveId));
  const failing = source.filter((primitive) => failureIds.has(primitive.id));
  const essentialFailures = failing.filter((primitive) => primitive.criticality === "essential");
  const removed = failing.filter((primitive) => primitive.criticality !== "essential");
  const removedIds = new Set(removed.map((primitive) => primitive.id));
  return {
    remaining: source.filter((primitive) => !removedIds.has(primitive.id)),
    removed,
    essentialFailures,
  };
}

type NorthstarAnalysisPlacementMode =
  | "caption-lane"
  | "margin-lane"
  | "inter-row-lane"
  | "external-relationship";

const ANALYTICAL_PLACEMENT_MODES = new Set<NorthstarAnalysisPlacementMode>([
  "caption-lane",
  "margin-lane",
  "inter-row-lane",
  "external-relationship",
]);

function looksLikeAnalyticalMarkup(markup: string): boolean {
  const source = String(markup ?? "");
  return /data-ns-(?:annotation|relationship)-id|data-ns-analysis-(?:placement|kind)|data-ns-encoding|data-ns-role\s*=\s*["'][^"']*(?:axis|spine|marker|callout|annotation|friction|sparkline|pulse|delta|chart|plot|graph|encoding|tension|milestone|relationship)|(?:class|data-ns-node-id)\s*=\s*["'][^"']*(?:axis|spine|marker|callout|annotation|friction|sparkline|pulse|delta|chart|plot|graph|encoding|tension|milestone|relationship)/i.test(source);
}

function analysisPlacementMode(markup: string): NorthstarAnalysisPlacementMode | undefined {
  const value = String(markup ?? "").match(/data-ns-analysis-placement\s*=\s*["']([^"']+)["']/i)?.[1] as NorthstarAnalysisPlacementMode | undefined;
  return value && ANALYTICAL_PLACEMENT_MODES.has(value) ? value : undefined;
}

function containsFreehandAnalyticalGeometry(value: string): boolean {
  const source = String(value ?? "");
  if (!/(?:axis|spine|marker|callout|annotation|friction|sparkline|pulse|delta|chart|plot|graph|encoding|tension|milestone|relationship|label)/i.test(source)) return false;
  return /position\s*:\s*(?:absolute|fixed)|(?:left|right|top|bottom|inset)\s*:\s*-?\d+(?:\.\d+)?%/i.test(source);
}

function semanticSlug(value: string): string {
  return String(value ?? "analysis")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "analysis";
}

function injectRootAttributes(markup: string, attributes: Record<string, string>): string {
  const source = String(markup ?? "");
  const opening = source.match(/<\s*([a-zA-Z][\w:-]*)\b[^>]*>/)?.[0];
  if (!opening) return source;
  let nextOpening = opening;
  for (const [name, value] of Object.entries(attributes)) {
    const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])[^"']*\\1`, "i");
    if (pattern.test(nextOpening)) {
      nextOpening = nextOpening.replace(pattern, ` ${name}="${value}"`);
    } else {
      nextOpening = nextOpening.replace(/\s*\/?>(?=$)/, (ending) => ` ${name}="${value}"${ending}`);
    }
  }
  return source.replace(opening, nextOpening);
}

function injectSemanticNodeAttributes(
  markup: string,
  nodeId: string,
  attributes: Record<string, string>,
): string {
  const opening = semanticNodeOpeningTag(markup, nodeId);
  if (!opening) return markup;
  let nextOpening = opening.source;
  for (const [name, value] of Object.entries(attributes)) {
    const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])[^"']*\\1`, "i");
    if (pattern.test(nextOpening)) {
      nextOpening = nextOpening.replace(pattern, ` ${name}="${value}"`);
    } else {
      nextOpening = nextOpening.replace(/\s*\/?>(?=$)/, (ending) => ` ${name}="${value}"${ending}`);
    }
  }
  return `${markup.slice(0, opening.start)}${nextOpening}${markup.slice(opening.end + 1)}`;
}

function visibleTextLength(markup: string): number {
  return String(markup ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .length;
}

function analysisKind(markup: string):
  | "sparkline"
  | "chart"
  | "axis"
  | "annotation"
  | "relationship"
  | "callout"
  | "analytical-bridge" {
  const source = String(markup ?? "");
  const explicit = source.match(/data-ns-analysis-kind\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
  if (["sparkline", "chart", "axis", "annotation", "relationship", "callout", "analytical-bridge"].includes(explicit ?? "")) {
    return explicit as ReturnType<typeof analysisKind>;
  }
  if (/data-ns-annotation-id|(?:callout|annotation)/i.test(source)) return /callout/i.test(source) ? "callout" : "annotation";
  if (/data-ns-relationship-id/i.test(source)) return "relationship";
  if (/(?:sparkline|friction[-_ ]?(?:delta|pulse)|pulse[-_ ]?line)/i.test(source)) return "sparkline";
  if (/(?:data-ns-chart|chart|plot|graph|<svg\b)/i.test(source)) return "chart";
  if (/(?:axis|continuum|matrix|comparison-spine|tension-map)/i.test(source)) return "axis";
  return "analytical-bridge";
}

function relationshipMetadataOnly(markup: string): boolean {
  const source = String(markup ?? "");
  if (/data-ns-relationship-metadata\s*=\s*["']true["']/i.test(source)) return true;
  if (/data-ns-analysis-placement\s*=\s*["']external-relationship["']/i.test(source)) return true;
  const rootTag = source.match(/^\s*<\s*([a-zA-Z][\w:-]*)\b/)?.[1]?.toLowerCase();
  return ["span", "i", "b", "template", "meta"].includes(rootTag ?? "") && visibleTextLength(source) < 8;
}

function inferAnalysisPlacementMode(input: {
  markup: string;
  targetId: string;
}): NorthstarAnalysisPlacementMode {
  if (/data-ns-annotation-id/i.test(input.markup)) return "margin-lane";
  if (/data-ns-relationship-id/i.test(input.markup)) {
    return relationshipMetadataOnly(input.markup) ? "external-relationship" : "inter-row-lane";
  }
  if (/(?:^|[-_:])(?:lane|flow|sequence)(?:[-_:]|$)|content$/i.test(input.targetId)) return "caption-lane";
  if (/^(?:evidence|analysis-lane|synthesis|decision|presentation|comparison-canvas|northstar-communication-stack)$/i.test(input.targetId)) return "inter-row-lane";
  return "caption-lane";
}

function firstAttribute(markup: string, names: string[]): string | undefined {
  for (const name of names) {
    const value = String(markup ?? "").match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
    if (value) return value;
  }
  return undefined;
}

function isBroadStructuralTarget(targetId: string): boolean {
  return /^(?:artboard|presentation|evidence|analysis-lane|comparison-canvas|synthesis|decision|northstar-communication-stack)$/i.test(targetId)
    || /(?:content|container|wrapper|surface|grid|lane)$/i.test(targetId);
}

function inferredAnalyticalSourceIds(
  targetId: string,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): string[] {
  const descendants = semanticDescendants(targetId, semanticSnapshot);
  const candidates = (semanticSnapshot ?? []).filter((node) =>
    (node.nodeId === targetId || descendants.has(node.nodeId))
    && (
      Boolean(node.normalizedAttributes?.["data-ns-evidence-id"])
      || Boolean(node.normalizedAttributes?.["data-ns-flow-id"])
      || Boolean(node.normalizedAttributes?.["data-ns-flow-sequence"])
      || /(?:flow|sequence|evidence|screen|step)/i.test(node.normalizedAttributes?.["data-ns-role"] ?? "")
      || /(?:flow|sequence|evidence|screen|step)/i.test(node.nodeId)
    )
  );
  const ranked = candidates.sort((a, b) => {
    const score = (node: NorthstarCommittedSemanticNode): number =>
      (node.normalizedAttributes?.["data-ns-evidence-id"] ? 8 : 0)
      + (node.normalizedAttributes?.["data-ns-flow-id"] ? 6 : 0)
      + (/sequence/i.test(node.nodeId) ? 4 : 0)
      + (/flow/i.test(node.nodeId) ? 3 : 0);
    return score(b) - score(a);
  });
  const exactEvidence = ranked.filter((node) => Boolean(node.normalizedAttributes?.["data-ns-evidence-id"]));
  const selected = exactEvidence.length > 0 ? exactEvidence : ranked;
  return Array.from(new Set(selected.map((node) => node.nodeId))).slice(0, 16);
}

function prepareAnalyticalPlacement(input: {
  markup: string;
  targetId: string;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
  knownNodeIds?: Set<string>;
}): {
  allowed: boolean;
  markup: string;
  mode?: NorthstarAnalysisPlacementMode;
  kind?: ReturnType<typeof analysisKind>;
  repair?: string;
  reason?: string;
} {
  if (!looksLikeAnalyticalMarkup(input.markup)) return { allowed: true, markup: input.markup };
  const kind = analysisKind(input.markup);
  const declaredMode = analysisPlacementMode(input.markup);
  const mode = declaredMode ?? inferAnalysisPlacementMode(input);
  if (containsFreehandAnalyticalGeometry(input.markup)) {
    return {
      allowed: false,
      markup: input.markup,
      mode,
      kind,
      reason: `ANALYTICAL_GEOMETRY_UNSAFE: ${mode} analytical insertion used freehand absolute or percentage positioning.`,
    };
  }
  if (mode === "external-relationship" && !/data-ns-relationship-id/i.test(input.markup)) {
    return {
      allowed: false,
      markup: input.markup,
      mode,
      kind,
      reason: "ANALYTICAL_RELATIONSHIP_INVALID: external relationship metadata requires typed semantic relationship markup.",
    };
  }

  const role = mode === "external-relationship"
    ? "relationship-metadata"
    : mode === "margin-lane"
      ? "anchored-annotation"
      : mode === "inter-row-lane"
        ? kind === "relationship" ? "visible-relationship" : "analytical-bridge"
        : "lane-analysis";
  const existingNodeId = input.markup.match(/data-ns-node-id\s*=\s*["']([^"']+)["']/i)?.[1];
  const existingRole = input.markup.match(/data-ns-role\s*=\s*["']([^"']+)["']/i)?.[1];
  const existingGeometryRole = input.markup.match(/data-ns-geometry-role\s*=\s*["']([^"']+)["']/i)?.[1];
  const nodeId = existingNodeId
    ?? `${semanticSlug(input.targetId)}-${semanticSlug(role)}-${stableFingerprint(input.markup).slice(0, 8)}`;

  const attributes: Record<string, string> = {
    "data-ns-node-id": nodeId,
    ...(existingRole ? {} : { "data-ns-role": role }),
    "data-ns-analysis-placement": mode,
    "data-ns-analysis-kind": kind,
    ...(existingGeometryRole ? {} : {
      "data-ns-geometry-role": mode === "external-relationship" || mode === "margin-lane" ? "decorative" : "structural",
    }),
  };

  if (mode === "external-relationship") attributes["data-ns-relationship-metadata"] = "true";

  if (kind === "annotation" || kind === "callout") {
    const anchorId = firstAttribute(input.markup, [
      "data-ns-anchor-node-id",
      "data-ns-source-id",
      "data-ns-source-node-id",
      "data-ns-evidence-ref",
    ]) ?? (!isBroadStructuralTarget(input.targetId) ? input.targetId : undefined);
    if (!anchorId) {
      return {
        allowed: false,
        markup: input.markup,
        mode,
        kind,
        reason: `ANALYTICAL_ANCHOR_UNRESOLVED: annotation “${nodeId}” needs an exact data-ns-anchor-node-id.`,
      };
    }
    const localIds = new Set(semanticIds(input.markup));
    if (input.knownNodeIds && !input.knownNodeIds.has(anchorId) && !localIds.has(anchorId)) {
      return {
        allowed: false,
        markup: input.markup,
        mode,
        kind,
        reason: `ANALYTICAL_ANCHOR_UNRESOLVED: annotation “${nodeId}” references missing anchor “${anchorId}”.`,
      };
    }
    attributes["data-ns-anchor-node-id"] = anchorId;
  }

  if (["sparkline", "chart", "axis"].includes(kind)) {
    const existingEncoding = firstAttribute(input.markup, ["data-ns-encoding"]);
    const explicitSourceIds = firstAttribute(input.markup, [
      "data-ns-source-ids",
      "data-ns-source-id",
      "data-ns-source-node-id",
      "data-ns-evidence-id",
      "data-ns-evidence-ref",
    ]);
    const inferredSourceIds = inferredAnalyticalSourceIds(input.targetId, input.semanticSnapshot);
    const sourceIds = explicitSourceIds
      ?? (inferredSourceIds.length > 0 ? inferredSourceIds.join(",") : undefined)
      ?? (!isBroadStructuralTarget(input.targetId) ? input.targetId : undefined);
    if (!sourceIds) {
      return {
        allowed: false,
        markup: input.markup,
        mode,
        kind,
        reason: `ANALYTICAL_SOURCE_UNRESOLVED: ${kind} “${nodeId}” needs exact data-ns-source-ids referencing grounded evidence or observed flow steps.`,
      };
    }
    const resolvedSourceIds = sourceIds.split(/[\s,]+/).filter(Boolean);
    if (input.knownNodeIds && resolvedSourceIds.some((sourceId) => !input.knownNodeIds!.has(sourceId))) {
      return {
        allowed: false,
        markup: input.markup,
        mode,
        kind,
        reason: `ANALYTICAL_SOURCE_UNRESOLVED: ${kind} “${nodeId}” references missing source node${resolvedSourceIds.length === 1 ? "" : "s"}: ${resolvedSourceIds.filter((sourceId) => !input.knownNodeIds!.has(sourceId)).join(", ")}.`,
      };
    }
    attributes["data-ns-encoding"] = existingEncoding ?? "qualitative";
    attributes["data-ns-source-ids"] = sourceIds;
    const chartLabel = firstAttribute(input.markup, ["data-ns-label", "aria-label"])
      ?? normalizeSemanticText(decodedText(input.markup)).slice(0, 120);
    if (!chartLabel) {
      return {
        allowed: false,
        markup: input.markup,
        mode,
        kind,
        reason: `ANALYTICAL_LABEL_MISSING: ${kind} “${nodeId}” needs a concise visible or aria label explaining what it encodes.`,
      };
    }
    attributes["data-ns-label"] = chartLabel;
    if (/<svg\b/i.test(input.markup) && !/<svg\b[^>]*\bviewBox\s*=\s*["'][^"']+["']/i.test(input.markup)) {
      return {
        allowed: false,
        markup: input.markup,
        mode,
        kind,
        reason: `ANALYTICAL_CHART_GEOMETRY_INCOMPLETE: ${kind} “${nodeId}” uses SVG without a viewBox.`,
      };
    }
    if (attributes["data-ns-encoding"] === "quantitative" && !/data-ns-values-grounded\s*=\s*["']true["']/i.test(input.markup)) {
      return {
        allowed: false,
        markup: input.markup,
        mode,
        kind,
        reason: `ANALYTICAL_PROVENANCE_MISSING: quantitative ${kind} “${nodeId}” requires data-ns-values-grounded="true" and grounded values.`,
      };
    }
    if (attributes["data-ns-encoding"] === "qualitative") {
      attributes["data-ns-interpretive"] = "true";
      attributes["data-ns-observation-basis"] = firstAttribute(input.markup, ["data-ns-observation-basis"]) ?? "observed-interface-sequence";
    }
  }

  const markup = injectRootAttributes(input.markup, attributes);
  return {
    allowed: true,
    markup,
    mode,
    kind,
    repair: declaredMode
      ? undefined
      : `Inferred ${mode} analytical placement for “${nodeId}” against “${input.targetId}” instead of discarding the authored visual primitive.`,
  };
}




function sanitizeWholeBoardCss(css: string): { css: string; repairs: string[] } {
  const repairs: string[] = [];
  let next = String(css ?? "");
  const dangerousSelector = /(?:\[data-ns-node-id=["']?(?:artboard|evidence|header)["']?\]|\.ns-(?:artifact|composition-artifact)|\.working-evidence)/i;
  next = next.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector: string, body: string) => {
    if (!dangerousSelector.test(selector)) return rule;
    const kept = body.split(";").map((part) => part.trim()).filter(Boolean).filter((declaration) => {
      const unsafe = /^(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|overflow(?:-x|-y)?\s*:\s*(?:hidden|clip)|(?:height|max-height)\s*:\s*(?:0|\d{1,3}px)|transform\s*:\s*(?:translate|scale\(0|matrix\())/i.test(declaration);
      if (unsafe) repairs.push(`Removed whole-board hiding or clipping declaration from selector “${selector.trim()}”.`);
      return !unsafe;
    });
    return kept.length ? `${selector}{${kept.join(";")}}` : "";
  });
  return { css: next, repairs };
}

function isCssOnlyStructuralClaim(draft: NorthstarArtboardMutationDraft): boolean {
  const structuralWords = /(?:spine|atlas|map|matrix|timeline|constellation|dialectic|stage|divergence|architecture)/i;
  if (!structuralWords.test(`${draft.title} ${draft.description} ${draft.visualStrategy} ${draft.visibleChange}`)) return false;
  const meaningfulStructure = draft.operations.some((operation) => {
    if (["insert-html", "move", "remove", "set-html", "recompose-region"].includes(operation.op)) return true;
    if (operation.op !== "set-attributes") return false;
    return Object.keys(operation.attributes).some((name) =>
      /data-ns-(?:evidence-role|relationship|claim|role|stage|sequence|flow)/i.test(name),
    );
  });
  const cssOnly = draft.operations.some((operation) => operation.op === "set-css-layer") && !meaningfulStructure;
  return cssOnly;
}

function sanitizeAnchoredSpatialMarkup(markup: string): { markup: string; repairs: string[] } {
  const repairs: string[] = [];
  let next = String(markup ?? "");
  if (/data-ns-annotation-id/i.test(next)) {
    const before = next;
    next = next.replace(
      /\sstyle\s*=\s*(["'])(.*?)\1/gi,
      (_match, quote: string, style: string) => {
        const cleaned = style
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .filter((part) => !/^(?:position|left|right|top|bottom|inset|transform|translate)\s*:/i.test(part))
          .join("; ");
        return cleaned ? ` style=${quote}${cleaned}${quote}` : "";
      },
    );
    if (next !== before) repairs.push("Removed model-authored coordinates from anchored annotations; browser spatial solving is authoritative.");
  }
  return { markup: next, repairs };
}


function validateSpatialMarkup(markup: string): { markup: string; repairs: string[] } {
  const repairs: string[] = [];
  let next = String(markup ?? "");
  if (/data-ns-annotation-id/i.test(next)) {
    const annotationTags = next.match(/<[^>]+data-ns-annotation-id[^>]*>/gi) ?? [];
    for (const tag of annotationTags) {
      if (!/data-ns-anchor-node-id\s*=\s*["'][^"']+["']/i.test(tag)) {
        repairs.push("Dropped an anchored annotation without an exact data-ns-anchor-node-id.");
        next = next.replace(tag, "");
      }
    }
    const before = next;
    next = next.replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (_match, quote: string, style: string) => {
      const cleaned = style
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => !/^(?:position|left|right|top|bottom|inset|transform|translate)\s*:/i.test(part))
        .join("; ");
      return cleaned ? ` style=${quote}${cleaned}${quote}` : "";
    });
    if (before !== next) repairs.push("Removed model-authored coordinates from anchored annotations.");
  }
  return { markup: next, repairs };
}

function semanticIds(markup: string): string[] {
  const result: string[] = [];
  const pattern = /data-ns-node-id\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markup))) result.push(match[1]);
  return result;
}

type NorthstarSingletonRole =
  | "executive-synthesis"
  | "comparison-matrix"
  | "primary-axis"
  | "recommendation"
  | "decision"
  | "provenance";

const SINGLETON_ROLE_PATTERNS: ReadonlyArray<readonly [NorthstarSingletonRole, RegExp]> = [
  ["executive-synthesis", /(?:executive[-_ ]?synthesis|strategic[-_ ]?synthesis|summary[-_ ]?takeaway|exec[-_ ]?summary)/i],
  ["comparison-matrix", /(?:comparison[-_ ]?matrix|comparative[-_ ]?matrix|synthesis[-_ ]?matrix|trade[-_ ]?off[-_ ]?matrix)/i],
  ["primary-axis", /(?:primary[-_ ]?axis|comparison[-_ ]?axis|tension[-_ ]?axis|decision[-_ ]?spine|divergence[-_ ]?axis)/i],
  ["recommendation", /(?:primary[-_ ]?recommendation|executive[-_ ]?recommendation|recommendation[-_ ]?panel)/i],
  ["decision", /(?:primary[-_ ]?decision|decision[-_ ]?panel|decision[-_ ]?summary)/i],
  ["provenance", /(?:provenance[-_ ]?panel|evidence[-_ ]?provenance|source[-_ ]?register)/i],
];

function decodedText(markup: string): string {
  return normalizeSemanticText(
    String(markup ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function singletonRoles(markup: string): NorthstarSingletonRole[] {
  const source = String(markup ?? "");
  const explicit = Array.from(source.matchAll(/data-ns-role\s*=\s*["']([^"']+)["']/gi)).map((match) => match[1]);
  const ids = semanticIds(source);
  const classes = Array.from(source.matchAll(/class\s*=\s*["']([^"']+)["']/gi)).map((match) => match[1]);
  const haystack = [...explicit, ...ids, ...classes, decodedText(source)].join(" ");
  return SINGLETON_ROLE_PATTERNS.filter(([, pattern]) => pattern.test(haystack)).map(([role]) => role);
}

function committedSingletonOwners(previous: NorthstarGeneratedCodeArtifactPackage): Map<NorthstarSingletonRole, string> {
  const owners = new Map<NorthstarSingletonRole, string>();
  const ingest = (markup: string) => {
    const rootId = semanticIds(markup)[0];
    if (!rootId) return;
    for (const role of singletonRoles(markup)) owners.set(role, rootId);
  };
  ingest(previous.document.html);
  for (const batch of previous.mutationJournal ?? []) {
    for (const operation of batch.operations) {
      if (operation.op === "insert-html" || operation.op === "set-html") {
        ingest(operation.html);
      } else if (operation.op === "recompose-region") {
        for (const retiredId of operation.retireNodeIds ?? []) {
          for (const [role, owner] of owners) if (owner === retiredId) owners.delete(role);
        }
        ingest(operation.html);
      } else if (operation.op === "remove") {
        for (const [role, owner] of owners) if (owner === operation.targetId) owners.delete(role);
      }
    }
  }
  return owners;
}

function committedSemanticIds(previous: NorthstarGeneratedCodeArtifactPackage): Set<string> {
  const ids = new Set(semanticIds(previous.document.html));
  for (const batch of previous.mutationJournal ?? []) {
    for (const operation of batch.operations) {
      if (operation.op === "insert-html" || operation.op === "set-html" || operation.op === "recompose-region") {
        for (const id of semanticIds(operation.html)) ids.add(id);
        if (operation.op === "recompose-region") {
          for (const placement of operation.placements) ids.add(placement.targetId);
          for (const retiredId of operation.retireNodeIds ?? []) ids.delete(retiredId);
        }
      } else if (operation.op === "remove") {
        ids.delete(operation.targetId);
      }
    }
  }
  return ids;
}



function normalizeSemanticText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function semanticFingerprintFromMarkup(markup: string): string {
  const source = String(markup ?? "");
  const rootTag = source.match(/<\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? "";
  const text = normalizeSemanticText(
    source
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
  const nodes = Array.from(source.matchAll(/data-ns-node-id\s*=\s*["']([^"']+)["']/gi))
    .map((match) => match[1])
    .filter(Boolean)
    .sort();
  const openingTag = source.match(/<[^>]+>/)?.[0] ?? "";
  const attributes = Array.from(openingTag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))
    .map((match) => [match[1], normalizeSemanticText(match[2])] as const)
    .filter(([name]) =>
      name !== "style"
      && name !== "class"
      && !name.startsWith("data-ns-spatial-")
      && name !== "data-ns-live-phase"
      && name !== "data-ns-live-mutation"
    )
    .sort((left, right) => left[0].localeCompare(right[0]));
  return stableFingerprint(JSON.stringify({ tag: rootTag, text, nodes, attributes }));
}

function semanticSnapshotMap(
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): Map<string, NorthstarCommittedSemanticNode> {
  return new Map(
    (semanticSnapshot ?? [])
      .filter((node) => node?.nodeId)
      .map((node) => [node.nodeId, node] as const),
  );
}

function semanticChildrenMap(
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): Map<string, Set<string>> {
  const children = new Map<string, Set<string>>();
  for (const node of semanticSnapshot ?? []) {
    if (!node.parentId) continue;
    const bucket = children.get(node.parentId) ?? new Set<string>();
    bucket.add(node.nodeId);
    children.set(node.parentId, bucket);
  }
  return children;
}

function semanticDescendants(
  rootId: string,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): Set<string> {
  const children = semanticChildrenMap(semanticSnapshot);
  const result = new Set<string>();
  const queue = [...(children.get(rootId) ?? [])];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (result.has(nodeId)) continue;
    result.add(nodeId);
    queue.push(...(children.get(nodeId) ?? []));
  }
  return result;
}

function semanticSubtree(
  rootId: string,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): Set<string> {
  return new Set([rootId, ...semanticDescendants(rootId, semanticSnapshot)]);
}

function isSameOrDescendant(
  nodeId: string,
  ancestorId: string,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): boolean {
  return nodeId === ancestorId || semanticDescendants(ancestorId, semanticSnapshot).has(nodeId);
}

function findTagEnd(markup: string, startIndex: number): number {
  let quote: string | undefined;
  for (let index = startIndex; index < markup.length; index += 1) {
    const char = markup[index];
    if (quote) {
      if (char === quote && markup[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function semanticNodeOpeningTag(markup: string, targetId: string): {
  start: number;
  end: number;
  tagName: string;
  source: string;
} | undefined {
  let cursor = 0;
  while (cursor < markup.length) {
    const start = markup.indexOf("<", cursor);
    if (start < 0) return undefined;
    if (markup.startsWith("<!--", start)) {
      const commentEnd = markup.indexOf("-->", start + 4);
      cursor = commentEnd < 0 ? markup.length : commentEnd + 3;
      continue;
    }
    const end = findTagEnd(markup, start + 1);
    if (end < 0) return undefined;
    const source = markup.slice(start, end + 1);
    const tagName = source.match(/^<\s*([a-zA-Z][\w:-]*)\b/)?.[1];
    const nodeId = source.match(/\bdata-ns-node-id\s*=\s*["']([^"']+)["']/i)?.[1];
    if (tagName && nodeId === targetId) return { start, end, tagName, source };
    cursor = end + 1;
  }
  return undefined;
}

function replaceSemanticNodeChildren(markup: string, targetId: string, replacementHtml: string): string | undefined {
  const opening = semanticNodeOpeningTag(markup, targetId);
  if (!opening || /\/\s*>$/.test(opening.source)) return undefined;
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  if (voidTags.has(opening.tagName.toLowerCase())) return undefined;

  let depth = 1;
  let cursor = opening.end + 1;
  while (cursor < markup.length) {
    const start = markup.indexOf("<", cursor);
    if (start < 0) return undefined;
    if (markup.startsWith("<!--", start)) {
      const commentEnd = markup.indexOf("-->", start + 4);
      cursor = commentEnd < 0 ? markup.length : commentEnd + 3;
      continue;
    }
    const end = findTagEnd(markup, start + 1);
    if (end < 0) return undefined;
    const source = markup.slice(start, end + 1);
    const closing = source.match(/^<\s*\/\s*([a-zA-Z][\w:-]*)\b/);
    const openingTag = source.match(/^<\s*([a-zA-Z][\w:-]*)\b/);
    if (closing?.[1]?.toLowerCase() === opening.tagName.toLowerCase()) {
      depth -= 1;
      if (depth === 0) {
        return `${markup.slice(0, opening.end + 1)}${replacementHtml}${markup.slice(start)}`;
      }
    } else if (
      openingTag?.[1]?.toLowerCase() === opening.tagName.toLowerCase()
      && !/\/\s*>$/.test(source)
      && !voidTags.has(opening.tagName.toLowerCase())
    ) {
      depth += 1;
    }
    cursor = end + 1;
  }
  return undefined;
}


function semanticNodeInnerMarkup(markup: string, targetId: string): string | undefined {
  const opening = semanticNodeOpeningTag(markup, targetId);
  if (!opening || /\/\s*>$/.test(opening.source)) return undefined;
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  if (voidTags.has(opening.tagName.toLowerCase())) return undefined;
  let depth = 1;
  let cursor = opening.end + 1;
  while (cursor < markup.length) {
    const tagStart = markup.indexOf("<", cursor);
    if (tagStart < 0) return undefined;
    if (markup.startsWith("<!--", tagStart)) {
      const commentEnd = markup.indexOf("-->", tagStart + 4);
      cursor = commentEnd < 0 ? markup.length : commentEnd + 3;
      continue;
    }
    const tagEnd = findTagEnd(markup, tagStart + 1);
    if (tagEnd < 0) return undefined;
    const source = markup.slice(tagStart, tagEnd + 1);
    const closing = source.match(/^<\s*\/\s*([a-zA-Z][\w:-]*)\b/);
    const nestedOpening = source.match(/^<\s*([a-zA-Z][\w:-]*)\b/);
    if (closing?.[1]?.toLowerCase() === opening.tagName.toLowerCase()) {
      depth -= 1;
      if (depth === 0) return markup.slice(opening.end + 1, tagStart);
    } else if (
      nestedOpening?.[1]?.toLowerCase() === opening.tagName.toLowerCase()
      && !/\/\s*>$/.test(source)
      && !voidTags.has(opening.tagName.toLowerCase())
    ) {
      depth += 1;
    }
    cursor = tagEnd + 1;
  }
  return undefined;
}

function evidenceBearingPlaceholderRoots(input: {
  targetId: string;
  introducedIds: Set<string>;
  explicitPlacementIds: Set<string>;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
}): string[] {
  const nodes = semanticSnapshotMap(input.semanticSnapshot);
  const evidenceNodeIds = new Set(
    (input.semanticSnapshot ?? [])
      .filter((node) => Boolean(node.normalizedAttributes?.["data-ns-evidence-id"]))
      .map((node) => node.nodeId),
  );
  const candidates = [...input.introducedIds].filter((nodeId) => {
    if (!nodes.has(nodeId) || nodeId === input.targetId) return false;
    if (!isSameOrDescendant(nodeId, input.targetId, input.semanticSnapshot)) return false;
    if ([...input.explicitPlacementIds].some((placedId) =>
      isSameOrDescendant(nodeId, placedId, input.semanticSnapshot)
      || isSameOrDescendant(placedId, nodeId, input.semanticSnapshot)
    )) return false;
    return [...evidenceNodeIds].some((evidenceId) =>
      isSameOrDescendant(evidenceId, nodeId, input.semanticSnapshot),
    );
  });

  return candidates.filter((candidate) => !candidates.some((other) =>
    other !== candidate && isSameOrDescendant(candidate, other, input.semanticSnapshot),
  ));
}

function coalesceAtomicRegionRecompositions(
  operations: NorthstarArtboardMutationOperation[],
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): { operations: NorthstarArtboardMutationOperation[]; repairs: string[] } {
  const repairs: string[] = [];
  const consumed = new Set<number>();
  const replacements = new Map<number, NorthstarArtboardMutationOperation>();
  const evidenceNodes = (semanticSnapshot ?? []).filter((node) => node.normalizedAttributes?.["data-ns-evidence-id"]);

  operations.forEach((operation, index) => {
    if (consumed.has(index) || operation.op !== "set-html" || PROTECTED_ROOTS.has(operation.targetId)) return;

    let materializedHtml = operation.html;
    let introduced = new Set(semanticIds(materializedHtml));
    const nestedSetHtmlIndexes: number[] = [];

    // Materialize dependent set-html operations into the earliest enclosing
    // replacement. This turns a model-authored transaction such as
    // presentation -> comparison-tracks -> flow placements into one coherent
    // staged region before any destructive DOM operation reaches the browser.
    for (let nextIndex = index + 1; nextIndex < operations.length; nextIndex += 1) {
      if (consumed.has(nextIndex)) continue;
      const candidate = operations[nextIndex];
      if (candidate.op !== "set-html" || !introduced.has(candidate.targetId)) continue;
      const replaced = replaceSemanticNodeChildren(materializedHtml, candidate.targetId, candidate.html);
      if (!replaced) continue;
      materializedHtml = replaced;
      introduced = new Set(semanticIds(materializedHtml));
      nestedSetHtmlIndexes.push(nextIndex);
    }

    const placements: Array<{ targetId: string; parentId: string; beforeId?: string }> = [];
    const placementIndexes: number[] = [];
    for (let nextIndex = index + 1; nextIndex < operations.length; nextIndex += 1) {
      if (consumed.has(nextIndex) || nestedSetHtmlIndexes.includes(nextIndex)) continue;
      const candidate = operations[nextIndex];
      if (candidate.op !== "move") continue;
      const destinationExistsInReplacement = candidate.parentId === operation.targetId || introduced.has(candidate.parentId);
      if (!destinationExistsInReplacement) continue;
      placements.push({
        targetId: candidate.targetId,
        parentId: candidate.parentId,
        beforeId: candidate.beforeId,
      });
      placementIndexes.push(nextIndex);
    }

    // If the authored replacement carries exact placeholders for existing
    // evidence-bearing subtrees, preserve those subtrees automatically. The
    // runtime replaces the placeholder with the committed node, so provenance,
    // identity, and loaded assets survive without asking the model to reproduce
    // opaque evidence IDs or every descendant operation.
    const explicitPlacementIds = new Set(placements.map((placement) => placement.targetId));
    for (const placeholderId of evidenceBearingPlaceholderRoots({
      targetId: operation.targetId,
      introducedIds: introduced,
      explicitPlacementIds,
      semanticSnapshot,
    })) {
      placements.push({ targetId: placeholderId, parentId: operation.targetId });
      explicitPlacementIds.add(placeholderId);
      repairs.push(`Preserved evidence-bearing placeholder “${placeholderId}” during atomic recomposition of “${operation.targetId}”.`);
    }

    const preservedRoots = new Set(placements.map((placement) => placement.targetId));
    const retireNodeIds: string[] = [];
    const retireIndexes: number[] = [];
    for (let nextIndex = index + 1; nextIndex < operations.length; nextIndex += 1) {
      if (consumed.has(nextIndex) || nestedSetHtmlIndexes.includes(nextIndex)) continue;
      const candidate = operations[nextIndex];
      if (candidate.op !== "remove" || PROTECTED_ROOTS.has(candidate.targetId) || candidate.targetId === operation.targetId) continue;

      const removedEvidence = evidenceNodes.filter((node) => isSameOrDescendant(node.nodeId, candidate.targetId, semanticSnapshot));
      const allRemovedEvidenceMovesWithPreservedSubtrees = removedEvidence.every((node) =>
        [...preservedRoots].some((rootId) => isSameOrDescendant(node.nodeId, rootId, semanticSnapshot)),
      );
      const alreadyReplacedWithRegion = isSameOrDescendant(candidate.targetId, operation.targetId, semanticSnapshot);
      if (!alreadyReplacedWithRegion && (removedEvidence.length === 0 || !allRemovedEvidenceMovesWithPreservedSubtrees)) continue;
      retireNodeIds.push(candidate.targetId);
      retireIndexes.push(nextIndex);
    }

    for (const consumedIndex of [...nestedSetHtmlIndexes, ...placementIndexes, ...retireIndexes]) consumed.add(consumedIndex);

    if (placements.length > 0) {
      replacements.set(index, {
        op: "recompose-region",
        targetId: operation.targetId,
        html: materializedHtml,
        placements,
        retireNodeIds,
      });
      repairs.push(
        `Coalesced set-html${nestedSetHtmlIndexes.length ? ` + ${nestedSetHtmlIndexes.length} nested replacement${nestedSetHtmlIndexes.length === 1 ? "" : "s"}` : ""} + ${placements.length} placement${placements.length === 1 ? "" : "s"}${retireNodeIds.length ? ` + ${retireNodeIds.length} retired wrapper${retireNodeIds.length === 1 ? "" : "s"}` : ""} into one atomic region recomposition for “${operation.targetId}”.`,
      );
    } else if (nestedSetHtmlIndexes.length > 0) {
      replacements.set(index, { ...operation, html: materializedHtml });
      repairs.push(
        `Materialized ${nestedSetHtmlIndexes.length} dependent set-html operation${nestedSetHtmlIndexes.length === 1 ? "" : "s"} inside “${operation.targetId}” before browser dispatch.`,
      );
    }
  });

  const next: NorthstarArtboardMutationOperation[] = [];
  operations.forEach((operation, index) => {
    if (consumed.has(index)) return;
    next.push(replacements.get(index) ?? operation);
  });
  return { operations: next, repairs };
}

type CommittedMutationState = {
  text: Map<string, string>;
  attributes: Map<string, Map<string, string | null>>;
  styles: Map<string, Map<string, string | null>>;
  classes: Map<string, Set<string>>;
  parent: Map<string, { parentId: string; beforeId?: string }>;
  cssLayers: Map<string, string>;
  runtimeModules: Map<string, string>;
};

function parseInitialNodeState(markup: string, state: CommittedMutationState): void {
  const tags = markup.match(/<[^>]+data-ns-node-id\s*=\s*["'][^"']+["'][^>]*>/gi) ?? [];
  for (const tag of tags) {
    const id = tag.match(/data-ns-node-id\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!id) continue;
    const classValue = tag.match(/\sclass\s*=\s*["']([^"']*)["']/i)?.[1];
    if (classValue) state.classes.set(id, new Set(classValue.split(/\s+/).filter(Boolean)));
    const attrs = new Map<string, string | null>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
      if (match[1] !== "data-ns-node-id" && match[1] !== "class") attrs.set(match[1], match[2]);
    }
    state.attributes.set(id, attrs);
  }
}

function committedMutationState(
  previous: NorthstarGeneratedCodeArtifactPackage,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): CommittedMutationState {
  const state: CommittedMutationState = {
    text: new Map(),
    attributes: new Map(),
    styles: new Map(),
    classes: new Map(),
    parent: new Map(),
    cssLayers: new Map(
      Object.entries(previous.document.cssLayers ?? {}).map(([styleId, css]) => [
        styleId.replace(/^northstar-mutation-style-/, ""),
        String(css).trim(),
      ]),
    ),
    runtimeModules: new Map([["northstar-creative-source", previous.document.creativeJavascript ?? ""]]),
  };
  parseInitialNodeState(previous.document.html, state);
  for (const node of semanticSnapshot ?? []) {
    state.text.set(node.nodeId, node.normalizedText);
    state.attributes.set(node.nodeId, new Map(Object.entries(node.normalizedAttributes ?? {})));
    state.styles.set(node.nodeId, new Map(Object.entries(node.normalizedStyles ?? {})));
    state.classes.set(node.nodeId, new Set(node.normalizedClasses ?? []));
    if (node.parentId) state.parent.set(node.nodeId, { parentId: node.parentId });
  }
  for (const batch of previous.mutationJournal ?? []) {
    for (const operation of batch.operations) {
      if (operation.op === "set-text") {
        state.text.set(operation.targetId, operation.text);
      } else if (operation.op === "set-attributes") {
        const attrs = state.attributes.get(operation.targetId) ?? new Map<string, string | null>();
        for (const [key, value] of Object.entries(operation.attributes)) attrs.set(key, value);
        state.attributes.set(operation.targetId, attrs);
      } else if (operation.op === "set-styles") {
        const styles = state.styles.get(operation.targetId) ?? new Map<string, string | null>();
        for (const [key, value] of Object.entries(operation.styles)) styles.set(key, value);
        state.styles.set(operation.targetId, styles);
      } else if (operation.op === "set-classes") {
        const classes = state.classes.get(operation.targetId) ?? new Set<string>();
        for (const value of operation.remove ?? []) classes.delete(value);
        for (const value of operation.add ?? []) classes.add(value);
        state.classes.set(operation.targetId, classes);
      } else if (operation.op === "move") {
        state.parent.set(operation.targetId, { parentId: operation.parentId, beforeId: operation.beforeId });
      } else if (operation.op === "recompose-region") {
        for (const placement of operation.placements) {
          state.parent.set(placement.targetId, { parentId: placement.parentId, beforeId: placement.beforeId });
        }
        for (const retiredId of operation.retireNodeIds ?? []) {
          state.text.delete(retiredId);
          state.attributes.delete(retiredId);
          state.styles.delete(retiredId);
          state.classes.delete(retiredId);
          state.parent.delete(retiredId);
        }
      } else if (operation.op === "set-css-layer") {
        state.cssLayers.set(operation.layerId, operation.css.trim());
      } else if (operation.op === "set-runtime-module") {
        state.runtimeModules.set(operation.moduleId, operation.javascript.trim());
      } else if (operation.op === "remove") {
        state.text.delete(operation.targetId);
        state.attributes.delete(operation.targetId);
        state.styles.delete(operation.targetId);
        state.classes.delete(operation.targetId);
        state.parent.delete(operation.targetId);
      }
    }
  }
  return state;
}

function filterDeterministicNoOps(
  previous: NorthstarGeneratedCodeArtifactPackage,
  operations: NorthstarArtboardMutationOperation[],
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): { operations: NorthstarArtboardMutationOperation[]; skipped: number } {
  const state = committedMutationState(previous, semanticSnapshot);
  const next: NorthstarArtboardMutationOperation[] = [];
  let skipped = 0;

  for (const operation of operations) {
    let noOp = false;
    if (operation.op === "set-text") {
      noOp = state.text.get(operation.targetId) === operation.text;
      if (!noOp) state.text.set(operation.targetId, operation.text);
    } else if (operation.op === "set-attributes") {
      const current = state.attributes.get(operation.targetId) ?? new Map<string, string | null>();
      noOp = Object.entries(operation.attributes).every(([key, value]) => current.get(key) === value);
      if (!noOp) {
        for (const [key, value] of Object.entries(operation.attributes)) current.set(key, value);
        state.attributes.set(operation.targetId, current);
      }
    } else if (operation.op === "set-styles") {
      const current = state.styles.get(operation.targetId) ?? new Map<string, string | null>();
      noOp = Object.entries(operation.styles).every(([key, value]) => current.get(key) === value);
      if (!noOp) {
        for (const [key, value] of Object.entries(operation.styles)) current.set(key, value);
        state.styles.set(operation.targetId, current);
      }
    } else if (operation.op === "set-classes") {
      const current = state.classes.get(operation.targetId) ?? new Set<string>();
      const addsChange = (operation.add ?? []).some((value) => !current.has(value));
      const removesChange = (operation.remove ?? []).some((value) => current.has(value));
      noOp = !addsChange && !removesChange;
      if (!noOp) {
        for (const value of operation.remove ?? []) current.delete(value);
        for (const value of operation.add ?? []) current.add(value);
        state.classes.set(operation.targetId, current);
      }
    } else if (operation.op === "move") {
      const current = state.parent.get(operation.targetId);
      noOp = current?.parentId === operation.parentId && current?.beforeId === operation.beforeId;
      if (!noOp) state.parent.set(operation.targetId, { parentId: operation.parentId, beforeId: operation.beforeId });
    } else if (operation.op === "recompose-region") {
      noOp = false;
      for (const placement of operation.placements) {
        state.parent.set(placement.targetId, { parentId: placement.parentId, beforeId: placement.beforeId });
      }
      for (const retiredId of operation.retireNodeIds ?? []) state.parent.delete(retiredId);
    } else if (operation.op === "set-css-layer") {
      noOp = state.cssLayers.get(operation.layerId) === operation.css.trim();
      if (!noOp) state.cssLayers.set(operation.layerId, operation.css.trim());
    } else if (operation.op === "set-runtime-module") {
      noOp = state.runtimeModules.get(operation.moduleId) === operation.javascript.trim();
      if (!noOp) state.runtimeModules.set(operation.moduleId, operation.javascript.trim());
    } else if (operation.op === "request-space") {
      noOp = !operation.left && !operation.top && !operation.right && !operation.bottom;
    }

    if (noOp) {
      skipped += 1;
      continue;
    }
    next.push(operation);
  }
  return { operations: next, skipped };
}

const NORTHSTAR_COMMUNICATION_STACK_ID = "northstar-communication-stack";

const NORTHSTAR_ANALYTICAL_REFLOW_CSS = `
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-node-id="${NORTHSTAR_COMMUNICATION_STACK_ID}"]{position:relative!important;inset:auto!important;transform:none!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:28px!important;box-sizing:border-box!important;grid-column:1/-1!important;grid-row:auto!important;grid-area:auto!important;width:100%!important;max-width:none!important;min-width:0!important;clear:both!important;overflow:visible!important;isolation:isolate!important}
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-role="analysis-slot"]{position:relative!important;inset:auto!important;transform:none!important;display:flex!important;flex-direction:column!important;gap:10px!important;box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;clear:both!important;margin:14px 0 4px!important;align-self:stretch!important;justify-self:stretch!important;overflow:visible!important;isolation:isolate!important}
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-analysis-placement="caption-lane"]{position:relative!important;inset:auto!important;transform:none!important;display:block!important;box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;clear:both!important;margin:0!important;align-self:stretch!important;justify-self:stretch!important;z-index:1!important;overflow:visible!important}
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-analysis-placement="caption-lane"] svg{display:block!important;width:100%!important;max-width:100%!important;height:auto!important;overflow:visible!important}
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-analysis-placement="inter-row-lane"]{position:relative!important;inset:auto!important;transform:none!important;display:block!important;box-sizing:border-box!important;grid-column:1/-1!important;grid-row:auto!important;grid-area:auto!important;width:100%!important;max-width:none!important;min-width:0!important;clear:both!important;margin:0!important;align-self:stretch!important;justify-self:stretch!important;z-index:2!important;overflow:visible!important}
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-analysis-placement="external-relationship"],.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-relationship-metadata="true"]{display:none!important}
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-node-id="comparison-canvas"]{position:relative!important;inset:auto!important;transform:none!important;grid-column:1/-1!important;grid-row:auto!important;grid-area:auto!important;width:100%!important;max-width:none!important;min-width:0!important;overflow:visible!important}
.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-node-id="synthesis"],.ns-artifact[data-ns-analytical-reflow="true"] [data-ns-node-id="decision"]{position:relative!important;inset:auto!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;transform:none!important;float:none!important;clear:both!important;display:block!important;grid-column:1/-1!important;grid-row:auto!important;grid-area:auto!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;align-self:stretch!important;justify-self:stretch!important;box-sizing:border-box!important;overflow:visible!important;z-index:2!important}
`.trim();

function analysisSlotId(targetId: string): string {
  return `${semanticSlug(targetId)}-analysis-slot`;
}

function operationMarkup(operation: NorthstarArtboardMutationOperation): string {
  return operation.op === "insert-html" || operation.op === "set-html" || operation.op === "recompose-region"
    ? operation.html
    : "";
}

function semanticParents(snapshot?: NorthstarCommittedSemanticNode[]): Map<string, string> {
  return new Map((snapshot ?? []).flatMap((node) => node.parentId ? [[node.nodeId, node.parentId] as const] : []));
}

function addAnalyticalCommunicationReflow(input: {
  source: NorthstarArtboardMutationOperation[];
  previous: NorthstarGeneratedCodeArtifactPackage;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
}): { operations: NorthstarArtboardMutationOperation[]; repairs: string[] } {
  const hasAnalyticalMarkup = input.source.some((operation) => {
    const markup = operationMarkup(operation);
    return Boolean(markup && (looksLikeAnalyticalMarkup(markup) || /data-ns-analysis-placement/i.test(markup)));
  });
  const changesMajorRegion = input.source.some((operation) =>
    (operation.op === "set-html" || operation.op === "insert-html")
    && /^(?:synthesis|decision)$/i.test(operation.targetId),
  );
  if (!hasAnalyticalMarkup && !changesMajorRegion) return { operations: input.source, repairs: [] };

  const operations = [...input.source];
  const repairs: string[] = [];
  const known = committedSemanticIds(input.previous);
  for (const operation of operations) {
    for (const id of semanticIds(operationMarkup(operation))) known.add(id);
  }
  const parents = semanticParents(input.semanticSnapshot);

  const artboardAttributes = operations.find(
    (operation): operation is Extract<NorthstarArtboardMutationOperation, { op: "set-attributes" }> =>
      operation.op === "set-attributes" && operation.targetId === "artboard",
  );
  if (artboardAttributes) {
    artboardAttributes.attributes = {
      ...artboardAttributes.attributes,
      "data-ns-analytical-reflow": "true",
    };
  } else if (known.has("artboard")) {
    operations.unshift({
      op: "set-attributes",
      targetId: "artboard",
      attributes: { "data-ns-analytical-reflow": "true" },
    });
  }

  if (known.has("presentation")) {
    if (!known.has(NORTHSTAR_COMMUNICATION_STACK_ID)) {
      operations.push({
        op: "insert-html",
        targetId: "presentation",
        position: "beforeend",
        html: `<section data-ns-node-id="${NORTHSTAR_COMMUNICATION_STACK_ID}" data-ns-role="communication-stack" data-ns-geometry-role="structural"></section>`,
      });
      known.add(NORTHSTAR_COMMUNICATION_STACK_ID);
      parents.set(NORTHSTAR_COMMUNICATION_STACK_ID, "presentation");
      repairs.push("Created one stable communication stack for comparison evidence, analytical primitives, synthesis, and decision content.");
    } else if (parents.get(NORTHSTAR_COMMUNICATION_STACK_ID) && parents.get(NORTHSTAR_COMMUNICATION_STACK_ID) !== "presentation") {
      operations.push({ op: "move", targetId: NORTHSTAR_COMMUNICATION_STACK_ID, parentId: "presentation" });
      parents.set(NORTHSTAR_COMMUNICATION_STACK_ID, "presentation");
    }

    for (const nodeId of ["comparison-canvas", "synthesis", "decision"]) {
      if (!known.has(nodeId)) continue;
      if (parents.get(nodeId) === NORTHSTAR_COMMUNICATION_STACK_ID) continue;
      operations.push({ op: "move", targetId: nodeId, parentId: NORTHSTAR_COMMUNICATION_STACK_ID });
      parents.set(nodeId, NORTHSTAR_COMMUNICATION_STACK_ID);
    }
  }

  if (!operations.some((operation) => operation.op === "set-css-layer" && operation.layerId === "analytical-reflow-v2")) {
    operations.push({
      op: "set-css-layer",
      layerId: "analytical-reflow-v2",
      css: NORTHSTAR_ANALYTICAL_REFLOW_CSS,
    });
  }

  const analyticalCount = operations.filter((operation) => /data-ns-analysis-kind/i.test(operationMarkup(operation))).length;
  const requestedBottom = Math.min(960, 260 + analyticalCount * 120 + (changesMajorRegion ? 240 : 0));
  const existingSpaceRequest = operations.find(
    (operation): operation is Extract<NorthstarArtboardMutationOperation, { op: "request-space" }> => operation.op === "request-space",
  );
  if (existingSpaceRequest) {
    existingSpaceRequest.bottom = Math.max(existingSpaceRequest.bottom ?? 0, requestedBottom);
  } else {
    operations.unshift({ op: "request-space", bottom: requestedBottom });
  }
  repairs.push("Compiled analytical additions and executive synthesis into one deterministic normal-flow communication reflow instead of isolated overlapping edits.");
  return { operations, repairs };
}

type PromisedPrimitive = "chart" | "annotation" | "relationship" | "synthesis" | "decision";

function promisedPrimitives(draft: NorthstarArtboardMutationDraft): Set<PromisedPrimitive> {
  const promise = `${draft.description} ${draft.visibleChange}`.toLowerCase();
  const result = new Set<PromisedPrimitive>();
  const contractedKinds = new Set((draft.requiredPrimitives ?? []).map((requirement) => requirement.kind));
  const actionable = (term: RegExp): boolean => {
    const matcher = new RegExp(term.source, "gi");
    const visible = draft.visibleChange.toLowerCase();
    for (const match of promise.matchAll(matcher)) {
      const start = match.index ?? 0;
      const before = promise.slice(Math.max(0, start - 120), start);
      const local = promise.slice(Math.max(0, start - 80), Math.min(promise.length, start + match[0].length + 40));
      if (/\b(?:defer|deferred|later|future|not in this act|without|will not|do not)\b/i.test(local)) continue;
      if (/\b(?:add|build|create|draw|encode|establish|implement|include|inject|insert|introduce|make|populate|render|replace|show|transform|write|anchor|expand|finalize)\b/i.test(before) || visible.includes(match[0].toLowerCase())) {
        return true;
      }
    }
    return false;
  };
  if (
    contractedKinds.has("chart")
    || contractedKinds.has("sparkline")
    || contractedKinds.has("axis")
    || actionable(/sparkline|friction\s+(?:delta|pulse)|\bchart\b|\bgraph\b|\bplot\b|visual\s+encoding|comparison\s+axis/i)
  ) result.add("chart");
  if (contractedKinds.has("annotation") || actionable(/annotation|annotated|callout|call-out|evidence\s+label/i)) result.add("annotation");
  // A bare mention of “relationship” often describes the comparison itself,
  // not a promise to render a routed connector. Treat the explicit primitive
  // contract as authoritative, while still detecting concrete connector/link
  // promises in prose so omitted visual relationships cannot slip through.
  if (
    contractedKinds.has("relationship")
    || actionable(/connector|evidence[- ]to[- ](?:claim|conclusion)|link(?:s|ed)?\s+(?:proof|evidence)|(?:draw|route|add|create|show|introduce|render)\s+(?:an?\s+|the\s+)?relationship/i)
  ) result.add("relationship");
  if (actionable(/synthesis|executive\s+summary|strategic\s+summary|takeaway/i)) result.add("synthesis");
  if (actionable(/decision|recommendation|conclusion|implication/i)) result.add("decision");
  return result;
}

function nodeReplacementText(operations: NorthstarArtboardMutationOperation[], nodeId: string): string {
  const direct = operations
    .filter((operation): operation is Extract<NorthstarArtboardMutationOperation, { op: "set-html" | "set-text" }> =>
      (operation.op === "set-html" || operation.op === "set-text") && operation.targetId === nodeId,
    )
    .map((operation) => operation.op === "set-text" ? operation.text : decodedText(operation.html))
    .join(" ");
  const nested = operations
    .map(operationMarkup)
    .filter(Boolean)
    .map((markup) => decodedText(semanticNodeInnerMarkup(markup, nodeId) ?? ""))
    .join(" ");
  return normalizeSemanticText(`${direct} ${nested}`);
}

function primitiveFidelityFailures(
  draft: NorthstarArtboardMutationDraft,
  operations: NorthstarArtboardMutationOperation[],
  availableNodeIds: Set<string>,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): string[] {
  const promised = promisedPrimitives(draft);
  if (promised.size === 0) return [];
  const markup = operations.map(operationMarkup).join("\n");
  const failures: string[] = [];

  const contractedStates = (draft.requiredPrimitives ?? []).flatMap((requirement) =>
    (requirement.nodeIds?.length ? requirement.nodeIds : [requirement.id]).map((nodeId) => ({
      requirement,
      nodeId,
      state: effectivePrimitiveState({ nodeId, operations, semanticSnapshot }),
    })),
  );
  const hasChart = (/data-ns-analysis-kind=["'](?:sparkline|chart|axis)["']/i.test(markup)
    && /data-ns-source-ids?=["'][^"']+["']/i.test(markup))
    || contractedStates.some(({ requirement, state }) => ["chart", "sparkline", "axis"].includes(requirement.kind)
      && state.exists
      && /data-ns-analysis-kind=["'](?:sparkline|chart|axis)["']/i.test(state.tag)
      && /data-ns-source-ids?=["'][^"']+["']/i.test(state.tag));
  const hasAnnotation = (/data-ns-annotation-id=["'][^"']+["']/i.test(markup)
    && /data-ns-anchor-node-id=["'][^"']+["']/i.test(markup))
    || contractedStates.some(({ requirement, state }) => requirement.kind === "annotation"
      && state.exists
      && /data-ns-annotation-id=["'][^"']+["']/i.test(state.tag)
      && /data-ns-anchor-node-id=["'][^"']+["']/i.test(state.tag));
  const hasRelationship = (/data-ns-relationship-id=["'][^"']+["']/i.test(markup)
    && /data-ns-source-(?:id|node-id)=["'][^"']+["']/i.test(markup)
    && /data-ns-target-(?:id|node-id)=["'][^"']+["']/i.test(markup))
    || contractedStates.some(({ requirement, state }) => requirement.kind === "relationship"
      && state.exists
      && /data-ns-relationship-id=["'][^"']+["']/i.test(state.tag)
      && /data-ns-source-(?:id|node-id)=["'][^"']+["']/i.test(state.tag)
      && /data-ns-target-(?:id|node-id)=["'][^"']+["']/i.test(state.tag));
  const synthesisText = nodeReplacementText(operations, "synthesis")
    || contractedStates.find(({ requirement }) => requirement.kind === "synthesis")?.state.text
    || "";
  const decisionText = nodeReplacementText(operations, "decision")
    || contractedStates.find(({ requirement }) => requirement.kind === "decision")?.state.text
    || "";

  if (promised.has("chart") && !hasChart) failures.push("chart or sparkline");
  if (promised.has("annotation") && !hasAnnotation) failures.push("anchored annotation");
  if (promised.has("relationship") && !hasRelationship) failures.push("typed evidence relationship");
  if (promised.has("synthesis") && synthesisText.length < 48) failures.push("substantive synthesis");
  if (promised.has("decision") && decisionText.length < 36) failures.push("substantive decision or implication");

  const analyticalRoots = Array.from(markup.matchAll(/<[^>]+data-ns-analysis-kind=["'](?:sparkline|chart|axis)["'][^>]*>/gi)).map((match) => match[0]);
  for (const tag of analyticalRoots) {
    const encoding = firstAttribute(tag, ["data-ns-encoding"]);
    const sourceIds = (firstAttribute(tag, ["data-ns-source-ids", "data-ns-source-id", "data-ns-source-node-id"]) ?? "")
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!encoding || sourceIds.length === 0 || sourceIds.some((id) => !availableNodeIds.has(id))) {
      failures.push("grounded analytical encoding with only resolvable source nodes");
      break;
    }
    if (encoding === "quantitative" && !/data-ns-values-grounded=["']true["']/i.test(tag)) {
      failures.push("verified quantitative provenance");
      break;
    }
  }

  const annotationTags = Array.from(markup.matchAll(/<[^>]+data-ns-annotation-id=["'][^"']+["'][^>]*>/gi)).map((match) => match[0]);
  for (const tag of annotationTags) {
    const anchor = firstAttribute(tag, ["data-ns-anchor-node-id"]);
    if (!anchor || !availableNodeIds.has(anchor)) {
      failures.push("resolvable annotation anchor");
      break;
    }
  }

  return Array.from(new Set(failures));
}

function openingTagForNode(markup: string, nodeId: string): string {
  return semanticNodeOpeningTag(markup, nodeId)?.source ?? "";
}

function operationTargetsNode(
  operations: NorthstarArtboardMutationOperation[],
  nodeId: string,
): boolean {
  return operations.some((operation) => {
    if ("targetId" in operation && operation.targetId === nodeId) return true;
    if (operation.op === "move" && operation.parentId === nodeId) return true;
    if (operation.op === "recompose-region") {
      return operation.placements.some((placement) => placement.targetId === nodeId || placement.parentId === nodeId);
    }
    return semanticIds(operationMarkup(operation)).includes(nodeId);
  });
}

function attributeIdList(tag: string, names: string[]): string[] {
  const value = firstAttribute(tag, names) ?? "";
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function openingTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of String(tag ?? "").matchAll(/\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g)) {
    if (match[1]) attributes[match[1].toLowerCase()] = match[2] ?? "";
  }
  return attributes;
}

function syntheticOpeningTag(nodeId: string, attributes: Record<string, string>): string {
  const entries = Object.entries({ ...attributes, "data-ns-node-id": nodeId })
    .filter(([, value]) => typeof value === "string")
    .map(([name, value]) => `${name}="${String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`);
  return `<div ${entries.join(" ")}>`;
}

function effectivePrimitiveState(input: {
  nodeId: string;
  operations: NorthstarArtboardMutationOperation[];
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
}): { exists: boolean; tag: string; text: string } {
  const snapshotById = semanticSnapshotMap(input.semanticSnapshot);
  const committed = snapshotById.get(input.nodeId);
  let exists = Boolean(committed);
  let attributes: Record<string, string> = {
    ...(committed?.normalizedAttributes ?? {}),
    "data-ns-node-id": input.nodeId,
  };
  let tag = committed ? syntheticOpeningTag(input.nodeId, attributes) : "";
  let text = committed?.normalizedText ?? "";

  for (const operation of input.operations) {
    const markup = operationMarkup(operation);
    if (operation.op === "remove" && isSameOrDescendant(input.nodeId, operation.targetId, input.semanticSnapshot)) {
      exists = false;
      tag = "";
      text = "";
      continue;
    }
    if (operation.op === "set-html" && input.nodeId !== operation.targetId && isSameOrDescendant(input.nodeId, operation.targetId, input.semanticSnapshot)) {
      exists = false;
      tag = "";
      text = "";
    }
    if (operation.op === "recompose-region" && input.nodeId !== operation.targetId && isSameOrDescendant(input.nodeId, operation.targetId, input.semanticSnapshot)) {
      const preserved = operation.placements.some((placement) => isSameOrDescendant(input.nodeId, placement.targetId, input.semanticSnapshot));
      if (!preserved) {
        exists = false;
        tag = "";
        text = "";
      }
    }
    const introducedTag = markup ? openingTagForNode(markup, input.nodeId) : "";
    if (introducedTag) {
      exists = true;
      attributes = openingTagAttributes(introducedTag);
      attributes["data-ns-node-id"] = input.nodeId;
      tag = introducedTag;
      text = semanticNodeInnerMarkup(markup, input.nodeId)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? text;
    }
    if (operation.op === "set-attributes" && operation.targetId === input.nodeId) {
      exists = true;
      for (const [name, value] of Object.entries(operation.attributes ?? {})) {
        const normalizedName = name.toLowerCase();
        if (value === null) delete attributes[normalizedName];
        else attributes[normalizedName] = String(value);
      }
      tag = syntheticOpeningTag(input.nodeId, attributes);
    }
    if (operation.op === "set-text" && operation.targetId === input.nodeId) text = operation.text;
    if (operation.op === "set-html" && operation.targetId === input.nodeId) {
      exists = true;
      text = operation.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!tag) tag = syntheticOpeningTag(input.nodeId, attributes);
    }
  }
  return { exists, tag: exists ? (tag || syntheticOpeningTag(input.nodeId, attributes)) : "", text };
}

function immutableOpeningNodeIds(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
  authoritativeNodeIds?: string[];
}): Set<string> {
  const available = committedSemanticIds(input.previous);
  for (const node of input.semanticSnapshot ?? []) available.add(node.nodeId);
  for (const nodeId of input.authoritativeNodeIds ?? []) {
    const normalized = String(nodeId ?? "").trim();
    if (normalized) available.add(normalized);
  }
  return available;
}

function simulateAvailableNodeIds(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  operations: NorthstarArtboardMutationOperation[];
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
  authoritativeNodeIds?: string[];
}): Set<string> {
  const available = immutableOpeningNodeIds(input);
  const evacuatedRoots = new Set<string>();
  const isEvacuated = (nodeId: string): boolean => [...evacuatedRoots].some((rootId) =>
    isSameOrDescendant(nodeId, rootId, input.semanticSnapshot),
  );
  for (const operation of input.operations) {
    if (operation.op === "move") evacuatedRoots.add(operation.targetId);
    if (operation.op === "remove") {
      for (const nodeId of semanticSubtree(operation.targetId, input.semanticSnapshot)) {
        if (!isEvacuated(nodeId)) available.delete(nodeId);
      }
      if (!isEvacuated(operation.targetId)) available.delete(operation.targetId);
      continue;
    }
    if (operation.op === "set-html") {
      for (const nodeId of semanticDescendants(operation.targetId, input.semanticSnapshot)) {
        if (!isEvacuated(nodeId)) available.delete(nodeId);
      }
    }
    if (operation.op === "recompose-region") {
      const preserved = new Set<string>();
      for (const placement of operation.placements) {
        evacuatedRoots.add(placement.targetId);
        for (const nodeId of semanticSubtree(placement.targetId, input.semanticSnapshot)) preserved.add(nodeId);
      }
      for (const nodeId of semanticDescendants(operation.targetId, input.semanticSnapshot)) {
        if (!preserved.has(nodeId) && !isEvacuated(nodeId)) available.delete(nodeId);
      }
      for (const retiredId of operation.retireNodeIds ?? []) {
        for (const nodeId of semanticSubtree(retiredId, input.semanticSnapshot)) {
          if (!preserved.has(nodeId) && !isEvacuated(nodeId)) available.delete(nodeId);
        }
      }
      for (const nodeId of preserved) available.add(nodeId);
    }
    for (const nodeId of semanticIds(operationMarkup(operation))) available.add(nodeId);
    if ("targetId" in operation) available.add(operation.targetId);
  }
  return available;
}

function authoredNodeIsNestedWithin(input: {
  operations: NorthstarArtboardMutationOperation[];
  nodeId: string;
  parentId: string;
}): boolean {
  for (const operation of input.operations) {
    const markup = operationMarkup(operation);
    if (!markup || !semanticIds(markup).includes(input.parentId)) continue;
    const parentMarkup = semanticNodeInnerMarkup(markup, input.parentId);
    if (parentMarkup && semanticIds(parentMarkup).includes(input.nodeId)) return true;
  }
  return false;
}

function primitiveDependencyIds(requirements: NorthstarRequiredPrimitive[]): Set<string> {
  const ids = new Set<string>();
  for (const requirement of requirements) {
    for (const nodeId of [
      ...(requirement.memberNodeIds ?? []),
      ...(requirement.anchorNodeIds ?? []),
      ...(requirement.sourceNodeIds ?? []),
      ...(requirement.targetNodeIds ?? []),
      ...(requirement.dataPoints ?? []).map((point) => point.sourceNodeId),
    ]) {
      if (nodeId) ids.add(nodeId);
    }
  }
  return ids;
}

function operationThreatensReservedNode(input: {
  operation: NorthstarArtboardMutationOperation;
  reservedNodeIds: Set<string>;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
}): boolean {
  const { operation, reservedNodeIds, semanticSnapshot } = input;
  if (operation.op === "remove" || operation.op === "set-html") {
    return [...reservedNodeIds].some((nodeId) => isSameOrDescendant(nodeId, operation.targetId, semanticSnapshot));
  }
  if (operation.op !== "recompose-region") return false;
  return [...reservedNodeIds].some((nodeId) => {
    if (!isSameOrDescendant(nodeId, operation.targetId, semanticSnapshot)) return false;
    return !operation.placements.some((placement) => isSameOrDescendant(nodeId, placement.targetId, semanticSnapshot));
  });
}

function scheduleReservedEvidenceEvacuation(input: {
  operations: NorthstarArtboardMutationOperation[];
  reservedNodeIds: Set<string>;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
}): { operations: NorthstarArtboardMutationOperation[]; repairs: string[] } {
  if (input.reservedNodeIds.size === 0) return { operations: input.operations, repairs: [] };
  const delayed: NorthstarArtboardMutationOperation[] = [];
  const immediate: NorthstarArtboardMutationOperation[] = [];
  for (const operation of input.operations) {
    if (operationThreatensReservedNode({
      operation,
      reservedNodeIds: input.reservedNodeIds,
      semanticSnapshot: input.semanticSnapshot,
    })) delayed.push(operation);
    else immediate.push(operation);
  }
  if (delayed.length === 0) return { operations: input.operations, repairs: [] };
  return {
    operations: [...immediate, ...delayed],
    repairs: [`Deferred ${delayed.length} destructive operation${delayed.length === 1 ? "" : "s"} until all reserved evidence members, anchors, and endpoints were evacuated from the immutable opening scene.`],
  };
}

type NamedPrimitivePromiseKind = "chart" | "sparkline" | "axis" | "annotation" | "relationship";

interface NamedPrimitivePromise {
  label: string;
  kind: NamedPrimitivePromiseKind;
  minimumInstances: number;
  tokens: string[];
}

function promiseTokens(value: string): string[] {
  const stopWords = new Set([
    "a", "an", "and", "the", "new", "visual", "analytical", "analysis", "graphic", "graphics",
    "indicator", "strip", "diagram", "show", "showing", "display", "displaying", "beneath", "under",
  ]);
  return Array.from(new Set(value.toLowerCase().split(/[^a-z0-9]+/g).filter((token) => token.length >= 3 && !stopWords.has(token))));
}

function namedPrimitivePromises(draft: NorthstarArtboardMutationDraft): NamedPrimitivePromise[] {
  const source = `${draft.authoredIntention ?? ""} ${draft.description} ${draft.visibleChange}`.trim();
  if (!source) return [];
  const candidates: Array<{ label: string; index: number }> = [];
  for (const match of source.matchAll(/["'“”]([^"'“”]{2,100})["'“”]/g)) {
    if (match[1]) candidates.push({ label: match[1].trim(), index: match.index ?? 0 });
  }
  const namedPattern = /\b((?:[a-z0-9]+[\s_-]+){0,4}(?:heat[\s_-]*index|sparkline|friction[\s_-]*(?:pulse|delta|index)|comparison[\s_-]*axis|evidence[\s_-]*(?:callout|connector)|callout|annotation|connector|relationship))\b/gi;
  for (const match of source.matchAll(namedPattern)) {
    if (match[1]) candidates.push({ label: match[1].trim(), index: match.index ?? 0 });
  }
  const results: NamedPrimitivePromise[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const lower = candidate.label.toLowerCase();
    let kind: NamedPrimitivePromiseKind | undefined;
    if (/sparkline/.test(lower)) kind = "sparkline";
    else if (/\baxis\b/.test(lower)) kind = "axis";
    else if (/annotation|callout/.test(lower)) kind = "annotation";
    else if (/connector|relationship/.test(lower)) kind = "relationship";
    else if (/heat[\s_-]*index|friction[\s_-]*(?:pulse|delta|index)|\bchart\b|\bgraph\b|\bplot\b/.test(lower)) kind = "chart";
    if (!kind) continue;
    const local = source.slice(Math.max(0, candidate.index - 90), Math.min(source.length, candidate.index + candidate.label.length + 120));
    if (/\b(?:defer|deferred|later|future|not in this act|without|will not|do not)\b/i.test(local)) continue;
    const tokens = promiseTokens(candidate.label);
    if (tokens.length === 0) continue;
    const key = `${kind}:${tokens.join("-")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      label: candidate.label,
      kind,
      minimumInstances: /\b(?:both|each|two|per\s+(?:flow|lane|rail|journey)|each\s+(?:flow|lane|rail|journey))\b/i.test(local) ? 2 : 1,
      tokens,
    });
  }
  return results.slice(0, 12);
}

function namedPromiseContractFailures(
  draft: NorthstarArtboardMutationDraft,
  requirements: NorthstarRequiredPrimitive[] | undefined,
  operations: NorthstarArtboardMutationOperation[],
): string[] {
  const promises = namedPrimitivePromises(draft);
  if (promises.length === 0) return [];
  const failures: string[] = [];
  const compatible = (promiseKind: NamedPrimitivePromiseKind, requirementKind: NorthstarRequiredPrimitive["kind"]): boolean => {
    if (promiseKind === "chart") return requirementKind === "chart" || requirementKind === "sparkline";
    return promiseKind === requirementKind;
  };
  for (const promise of promises) {
    const requirement = (requirements ?? []).find((candidate) => {
      if (!compatible(promise.kind, candidate.kind)) return false;
      const contractText = `${candidate.id} ${candidate.description ?? ""} ${(candidate.nodeIds ?? []).join(" ")}`.toLowerCase();
      const overlap = promise.tokens.filter((token) => contractText.includes(token)).length;
      return overlap >= Math.min(2, promise.tokens.length);
    });
    if (!requirement) {
      failures.push(`named primitive “${promise.label}” is missing from requiredPrimitives`);
      continue;
    }
    if (requirement.minimumInstances < promise.minimumInstances || (requirement.nodeIds?.length ?? 0) < promise.minimumInstances) {
      failures.push(`named primitive “${promise.label}” requires ${promise.minimumInstances} exact instances`);
      continue;
    }
    const nodeIds = requirement.nodeIds?.length ? requirement.nodeIds : [requirement.id];
    const authoredMarkup = operations
      .filter((operation) => nodeIds.some((nodeId) => operationTargetsNode([operation], nodeId)))
      .map(operationMarkup)
      .join(" ");
    const actualText = `${nodeIds.join(" ")} ${authoredMarkup}`.toLowerCase();
    const actualOverlap = promise.tokens.filter((token) => actualText.includes(token)).length;
    if (actualOverlap < Math.min(2, promise.tokens.length)) {
      failures.push(`named primitive “${promise.label}” is represented only by a generic analytical region`);
    }
  }
  return Array.from(new Set(failures));
}


function escapePrimitiveHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function humanizePrimitiveId(value: string): string {
  return String(value ?? "")
    .replace(/[_:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueIds(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function ensurePrimitiveInstanceIds(base: string[], id: string, minimumInstances: number): string[] {
  const result = uniqueIds(base.length > 0 ? base : [id]);
  while (result.length < minimumInstances) result.push(`${id}-${result.length + 1}`);
  return result.slice(0, Math.max(1, minimumInstances));
}

function normalizePrimitiveSpecifications(input: {
  requirements: NorthstarRequiredPrimitive[] | undefined;
  availableNodeIds: Set<string>;
}): NorthstarRequiredPrimitive[] {
  return (input.requirements ?? []).map((requirement) => {
    const minimumInstances = Math.max(1, requirement.minimumInstances || 1);
    const legacyNodeIds = uniqueIds(requirement.nodeIds ?? []);
    const explicitInstances = uniqueIds(requirement.instanceNodeIds ?? []);
    const explicitSources = uniqueIds(requirement.sourceNodeIds ?? []);
    const explicitMembers = uniqueIds(requirement.memberNodeIds ?? []);
    const explicitAnchors = uniqueIds(requirement.anchorNodeIds ?? []);
    const dataPointSources = uniqueIds((requirement.dataPoints ?? []).map((point) => point.sourceNodeId));

    let instanceNodeIds: string[] = [];
    let memberNodeIds = explicitMembers;
    let anchorNodeIds = explicitAnchors;
    let sourceNodeIds = explicitSources;

    if (requirement.kind === "frame" || requirement.kind === "evidence-lane") {
      instanceNodeIds = ensurePrimitiveInstanceIds(explicitInstances.length ? explicitInstances : [requirement.id], requirement.id, minimumInstances);
      memberNodeIds = uniqueIds([
        ...memberNodeIds,
        ...sourceNodeIds,
        ...legacyNodeIds.filter((nodeId) => !instanceNodeIds.includes(nodeId)),
      ]);
      sourceNodeIds = memberNodeIds;
    } else if (requirement.kind === "annotation") {
      anchorNodeIds = uniqueIds([
        ...anchorNodeIds,
        ...sourceNodeIds,
        ...legacyNodeIds.filter((nodeId) => input.availableNodeIds.has(nodeId) && nodeId !== requirement.id),
      ]);
      const legacyInstances = legacyNodeIds.filter((nodeId) =>
        nodeId === requirement.id
        || explicitInstances.includes(nodeId)
        || (!input.availableNodeIds.has(nodeId) && !anchorNodeIds.includes(nodeId)),
      );
      instanceNodeIds = ensurePrimitiveInstanceIds(explicitInstances.length ? explicitInstances : legacyInstances, requirement.id, minimumInstances);
      sourceNodeIds = anchorNodeIds;
    } else if (requirement.kind === "relationship") {
      const endpointIds = new Set([...sourceNodeIds, ...(requirement.targetNodeIds ?? [])]);
      const legacyInstances = legacyNodeIds.filter((nodeId) =>
        nodeId === requirement.id || explicitInstances.includes(nodeId) || (!input.availableNodeIds.has(nodeId) && !endpointIds.has(nodeId)),
      );
      instanceNodeIds = ensurePrimitiveInstanceIds(explicitInstances.length ? explicitInstances : legacyInstances, requirement.id, minimumInstances);
    } else if (["chart", "sparkline", "axis"].includes(requirement.kind)) {
      sourceNodeIds = uniqueIds([
        ...sourceNodeIds,
        ...dataPointSources,
        ...legacyNodeIds.filter((nodeId) => input.availableNodeIds.has(nodeId) && nodeId !== requirement.id),
      ]);
      const legacyInstances = legacyNodeIds.filter((nodeId) =>
        nodeId === requirement.id
        || explicitInstances.includes(nodeId)
        || (!input.availableNodeIds.has(nodeId) && !sourceNodeIds.includes(nodeId)),
      );
      instanceNodeIds = ensurePrimitiveInstanceIds(explicitInstances.length ? explicitInstances : legacyInstances, requirement.id, minimumInstances);
    } else {
      instanceNodeIds = ensurePrimitiveInstanceIds(explicitInstances.length ? explicitInstances : [requirement.id], requirement.id, minimumInstances);
    }

    return {
      ...requirement,
      minimumInstances,
      instanceNodeIds,
      nodeIds: instanceNodeIds,
      memberNodeIds,
      anchorNodeIds,
      sourceNodeIds,
    };
  });
}

function requirementStateSatisfied(input: {
  requirement: NorthstarRequiredPrimitive;
  operations: NorthstarArtboardMutationOperation[];
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
}): boolean {
  const nodeIds = input.requirement.instanceNodeIds?.length
    ? input.requirement.instanceNodeIds
    : input.requirement.nodeIds?.length
      ? input.requirement.nodeIds
      : [input.requirement.id];
  const states = nodeIds.map((nodeId) => effectivePrimitiveState({ nodeId, operations: input.operations, semanticSnapshot: input.semanticSnapshot }));
  const minimum = Math.max(1, input.requirement.minimumInstances || 1);
  const matching = states.filter((state) => {
    if (!state.exists) return false;
    switch (input.requirement.kind) {
      case "chart": return /data-ns-analysis-kind=["']chart["']/i.test(state.tag);
      case "sparkline": return /data-ns-analysis-kind=["']sparkline["']/i.test(state.tag);
      case "axis": return /data-ns-analysis-kind=["']axis["']/i.test(state.tag);
      case "annotation": return /data-ns-annotation-id=["'][^"']+["']/i.test(state.tag) && /data-ns-anchor-node-id=["'][^"']+["']/i.test(state.tag);
      case "relationship": return /data-ns-relationship-id=["'][^"']+["']/i.test(state.tag)
        && /data-ns-source-(?:id|node-id)=["'][^"']+["']/i.test(state.tag)
        && /data-ns-target-(?:id|node-id)=["'][^"']+["']/i.test(state.tag);
      case "synthesis": return state.text.trim().length >= 48;
      case "decision": return state.text.trim().length >= 36;
      case "frame":
      case "evidence-lane": return true;
    }
  });
  return matching.length >= minimum;
}

function primitiveParentId(requirement: NorthstarRequiredPrimitive, availableNodeIds: Set<string>): string {
  if (requirement.parentNodeId && availableNodeIds.has(requirement.parentNodeId)) return requirement.parentNodeId;
  if (availableNodeIds.has("northstar-communication-stack") && ["chart", "sparkline", "axis", "synthesis", "decision"].includes(requirement.kind)) {
    return "northstar-communication-stack";
  }
  if (availableNodeIds.has("presentation")) return "presentation";
  return availableNodeIds.has("artboard") ? "artboard" : "presentation";
}

function qualitativeLevelY(level: "low" | "medium" | "high" | undefined): number {
  if (level === "high") return 22;
  if (level === "low") return 74;
  return 48;
}

function deterministicChartMarkup(input: {
  requirement: NorthstarRequiredPrimitive;
  nodeId: string;
  sourceNodeIds: string[];
}): { markup: string; normalizedEncoding: "qualitative" | "quantitative"; downgraded: boolean } {
  const requirement = input.requirement;
  const label = requirement.label || requirement.description || humanizePrimitiveId(requirement.id);
  const rawPoints = (requirement.dataPoints ?? []).filter((point) => input.sourceNodeIds.includes(point.sourceNodeId));
  const fallbackPoints: NorthstarPrimitiveDataPoint[] = input.sourceNodeIds.map((sourceNodeId) => ({
    sourceNodeId,
    label: humanizePrimitiveId(sourceNodeId),
    qualitativeLevel: "medium",
  }));
  const points: NorthstarPrimitiveDataPoint[] = (rawPoints.length ? rawPoints : fallbackPoints).slice(0, 16);
  const requestedQuantitative = requirement.encoding === "quantitative";
  const quantitativeReady = requestedQuantitative
    && requirement.valuesGrounded === true
    && points.length > 0
    && points.every((point) => typeof point.value === "number" && Number.isFinite(point.value));
  const normalizedEncoding = quantitativeReady ? "quantitative" : "qualitative";
  const numericValues = quantitativeReady ? points.map((point) => Number(point.value)) : [];
  const minimum = numericValues.length ? Math.min(...numericValues) : 0;
  const maximum = numericValues.length ? Math.max(...numericValues) : 1;
  const range = Math.max(1e-9, maximum - minimum);
  const width = 360;
  const height = 104;
  const left = 24;
  const right = 336;
  const xFor = (index: number) => points.length <= 1 ? width / 2 : left + ((right - left) * index) / (points.length - 1);
  const yFor = (point: typeof points[number]) => quantitativeReady
    ? 78 - ((Number(point.value) - minimum) / range) * 56
    : qualitativeLevelY(point.qualitativeLevel);
  const coordinates = points.map((point, index) => ({ point, x: xFor(index), y: yFor(point) }));
  const path = coordinates.map((coordinate, index) => `${index === 0 ? "M" : "L"}${coordinate.x.toFixed(1)} ${coordinate.y.toFixed(1)}`).join(" ");
  const marks = coordinates.map((coordinate) => `<circle cx="${coordinate.x.toFixed(1)}" cy="${coordinate.y.toFixed(1)}" r="4" data-ns-source-id="${escapePrimitiveHtml(coordinate.point.sourceNodeId)}"></circle>`).join("");
  const tickLabels = coordinates.map((coordinate) => `<li data-ns-source-id="${escapePrimitiveHtml(coordinate.point.sourceNodeId)}">${escapePrimitiveHtml(coordinate.point.label)}</li>`).join("");
  const placement = requirement.placement === "beneath-flow" ? "caption-lane" : "inter-row-lane";
  const kind = requirement.kind;
  const note = normalizedEncoding === "qualitative"
    ? "Interpretive encoding of observed interface stages; it is not a measured performance metric."
    : `Grounded quantitative encoding${requirement.unit ? ` in ${escapePrimitiveHtml(requirement.unit)}` : ""}.`;
  return {
    normalizedEncoding,
    downgraded: requestedQuantitative && !quantitativeReady,
    markup: `<figure data-ns-node-id="${escapePrimitiveHtml(input.nodeId)}" data-ns-analysis-kind="${kind}" data-ns-analysis-placement="${placement}" data-ns-encoding="${normalizedEncoding}" data-ns-source-ids="${escapePrimitiveHtml(input.sourceNodeIds.join(","))}" data-ns-label="${escapePrimitiveHtml(label)}" data-ns-values-grounded="${quantitativeReady ? "true" : "false"}" data-ns-realized-primitive="true" aria-label="${escapePrimitiveHtml(label)}"><figcaption>${escapePrimitiveHtml(label)}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapePrimitiveHtml(label)}"><path d="M${left} 82 L${right} 82" data-ns-axis-line="true"></path>${path ? `<path d="${path}" data-ns-series-line="true"></path>` : ""}${marks}</svg><ol data-ns-chart-source-labels="true">${tickLabels}</ol><p data-ns-interpretive-note="true">${note}</p></figure>`,
  };
}

const NORTHSTAR_REALIZED_PRIMITIVE_CSS = `
[data-ns-realized-primitive="true"]{box-sizing:border-box;min-width:0}
figure[data-ns-realized-primitive="true"]{display:grid;gap:10px;margin:0;padding:14px 16px;border:1px solid color-mix(in srgb,currentColor 13%,transparent);border-radius:14px;background:color-mix(in srgb,#ffffff 92%,#ede9ff 8%)}
figure[data-ns-realized-primitive="true"] figcaption{font-weight:700;letter-spacing:-.015em}
figure[data-ns-realized-primitive="true"] svg{display:block;width:100%;height:auto;overflow:visible}
figure[data-ns-realized-primitive="true"] [data-ns-axis-line="true"]{fill:none;stroke:currentColor;stroke-width:1;opacity:.24}
figure[data-ns-realized-primitive="true"] [data-ns-series-line="true"]{fill:none;stroke:currentColor;stroke-width:2.25;stroke-linecap:round;stroke-linejoin:round}
figure[data-ns-realized-primitive="true"] circle{fill:#6f55ff;stroke:#fff;stroke-width:2}
figure[data-ns-realized-primitive="true"] [data-ns-chart-source-labels="true"]{display:flex;flex-wrap:wrap;gap:6px 12px;margin:0;padding:0;list-style:none;font-size:.78em;opacity:.72}
figure[data-ns-realized-primitive="true"] [data-ns-interpretive-note="true"]{margin:0;font-size:.78em;line-height:1.45;opacity:.64}
[data-ns-annotation-id][data-ns-realized-primitive="true"]{max-width:280px;padding:10px 12px;border:1px solid color-mix(in srgb,#6f55ff 30%,transparent);border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(36,28,79,.12);font-size:13px;line-height:1.4}
`.trim();

function materializeRequiredPrimitiveSpecifications(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  draft: NorthstarArtboardMutationDraft;
  operations: NorthstarArtboardMutationOperation[];
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
  authoritativeNodeIds?: string[];
}): {
  operations: NorthstarArtboardMutationOperation[];
  requirements: NorthstarRequiredPrimitive[];
  repairs: string[];
  failures: NorthstarPrimitiveFailure[];
} {
  const openingAvailable = immutableOpeningNodeIds({
    previous: input.previous,
    semanticSnapshot: input.semanticSnapshot,
    authoritativeNodeIds: input.authoritativeNodeIds,
  });
  const authoredIntroduced = new Set(input.operations.flatMap((operation) => semanticIds(operationMarkup(operation))));
  const authoredAvailable = new Set([...openingAvailable, ...authoredIntroduced]);
  const requirements = normalizePrimitiveSpecifications({ requirements: input.draft.requiredPrimitives, availableNodeIds: authoredAvailable });
  if (requirements.length === 0) return { operations: input.operations, requirements, repairs: [], failures: [] };

  const operations = [...input.operations];
  // Planning availability is intentionally monotonic. Destructive authored operations
  // cannot erase opening-scene dependencies before the compiler has reserved and
  // evacuated them into their typed destinations.
  const available = new Set([...openingAvailable, ...authoredIntroduced]);
  const repairs: string[] = [];
  const failures: NorthstarPrimitiveFailure[] = [];
  let generatedVisiblePrimitive = false;
  const addOperation = (operation: NorthstarArtboardMutationOperation) => {
    operations.push(operation);
    for (const nodeId of semanticIds(operationMarkup(operation))) available.add(nodeId);
    if ("targetId" in operation) available.add(operation.targetId);
  };

  // Phase one: materialize every structural destination before any membership
  // choreography is planned. This makes frame/lane specification order irrelevant.
  for (const requirement of requirements.filter((candidate) => candidate.kind === "frame" || candidate.kind === "evidence-lane")) {
    const instanceNodeIds = requirement.instanceNodeIds?.length ? requirement.instanceNodeIds : [requirement.id];
    const members = uniqueIds(requirement.memberNodeIds ?? requirement.sourceNodeIds ?? []);
    for (const nodeId of instanceNodeIds) {
      if (!available.has(nodeId)) {
        const parentId = primitiveParentId(requirement, available);
        addOperation({
          op: "insert-html",
          targetId: parentId,
          position: "beforeend",
          html: `<section data-ns-node-id="${escapePrimitiveHtml(nodeId)}" data-ns-role="${requirement.kind}" data-ns-geometry-role="structural" data-ns-required-placement="${escapePrimitiveHtml(requirement.placement ?? (requirement.kind === "frame" ? "frame" : "between-sections"))}" data-ns-source-ids="${escapePrimitiveHtml(members.join(","))}" data-ns-realized-primitive="true" aria-label="${escapePrimitiveHtml(requirement.label || requirement.description || humanizePrimitiveId(requirement.id))}"></section>`,
        });
        repairs.push(`Materialized typed ${requirement.kind} “${nodeId}” from the DesignAct specification.`);
      }
      addOperation({
        op: "set-attributes",
        targetId: nodeId,
        attributes: {
          "data-ns-role": requirement.kind,
          "data-ns-geometry-role": "structural",
          "data-ns-required-placement": requirement.placement ?? (requirement.kind === "frame" ? "frame" : "between-sections"),
          "data-ns-source-ids": members.join(","),
          "data-ns-realized-primitive": "true",
        },
      });
    }
  }

  // Phase two: connect the dependency graph after every structural destination is
  // known. Existing members resolve from the immutable opening scene; newly authored
  // members resolve from the staged scene.
  for (const requirement of requirements) {
    const instanceNodeIds = requirement.instanceNodeIds?.length ? requirement.instanceNodeIds : [requirement.id];

    if (requirement.kind === "frame" || requirement.kind === "evidence-lane") {
      const members = uniqueIds(requirement.memberNodeIds ?? requirement.sourceNodeIds ?? []);
      for (const [index, nodeId] of instanceNodeIds.entries()) {
        const assignedMembers = members.filter((_, memberIndex) => memberIndex % instanceNodeIds.length === index);
        for (const memberNodeId of assignedMembers) {
          if (!openingAvailable.has(memberNodeId) && !available.has(memberNodeId)) {
            failures.push({ code: "EVIDENCE_MEMBER_UNRESOLVED", primitiveId: requirement.id, message: `Unresolved evidence member ${memberNodeId}.` });
            continue;
          }
          const alreadyMoves = operations.some((operation) => operation.op === "move" && operation.targetId === memberNodeId && operation.parentId === nodeId)
            || operations.some((operation) => operation.op === "recompose-region" && operation.placements.some((placement) => placement.targetId === memberNodeId && placement.parentId === nodeId));
          const alreadyAuthoredInside = !openingAvailable.has(memberNodeId)
            && authoredIntroduced.has(memberNodeId)
            && authoredNodeIsNestedWithin({ operations: input.operations, nodeId: memberNodeId, parentId: nodeId });
          if (!alreadyMoves && !alreadyAuthoredInside) {
            addOperation({ op: "move", targetId: memberNodeId, parentId: nodeId });
            repairs.push(`Materialized evidence choreography by moving “${memberNodeId}” into typed ${requirement.kind} “${nodeId}”.`);
          } else if (alreadyAuthoredInside) {
            repairs.push(`Accepted authored structural membership “${memberNodeId}” inside “${nodeId}” without generating an invalid placement for a newly introduced node.`);
          }
        }
      }
      continue;
    }

    if (requirementStateSatisfied({ requirement, operations, semanticSnapshot: input.semanticSnapshot })) continue;

    if (requirement.kind === "annotation") {
      const anchors = uniqueIds(requirement.anchorNodeIds ?? requirement.sourceNodeIds ?? []);
      if (anchors.length === 0) {
        failures.push({ code: "ANNOTATION_ANCHOR_MISSING", primitiveId: requirement.id, message: "Annotation specification has no exact anchorNodeIds." });
        continue;
      }
      const parentId = primitiveParentId(requirement, available);
      for (const [index, nodeId] of instanceNodeIds.entries()) {
        const anchorId = anchors[index % anchors.length];
        if (!openingAvailable.has(anchorId) && !available.has(anchorId)) {
          failures.push({ code: "ANNOTATION_ANCHOR_UNRESOLVED", primitiveId: requirement.id, message: `Unresolved annotation anchor ${anchorId}.` });
          continue;
        }
        const label = requirement.label || requirement.description || humanizePrimitiveId(requirement.id);
        const text = requirement.text || requirement.description || label;
        if (available.has(nodeId)) {
          addOperation({
            op: "set-attributes",
            targetId: nodeId,
            attributes: {
              "data-ns-annotation-id": nodeId,
              "data-ns-anchor-node-id": anchorId,
              "data-ns-analysis-kind": "annotation",
              "data-ns-analysis-placement": "margin-lane",
              "data-ns-role": "annotation",
              "data-ns-label": label,
              "data-ns-realized-primitive": "true",
            },
          });
          addOperation({ op: "set-html", targetId: nodeId, html: `<span>${escapePrimitiveHtml(text)}</span>` });
        } else {
          addOperation({
            op: "insert-html",
            targetId: parentId,
            position: "beforeend",
            html: `<aside data-ns-node-id="${escapePrimitiveHtml(nodeId)}" data-ns-annotation-id="${escapePrimitiveHtml(nodeId)}" data-ns-anchor-node-id="${escapePrimitiveHtml(anchorId)}" data-ns-analysis-kind="annotation" data-ns-analysis-placement="margin-lane" data-ns-role="annotation" data-ns-label="${escapePrimitiveHtml(label)}" data-ns-realized-primitive="true" aria-label="${escapePrimitiveHtml(label)}"><span>${escapePrimitiveHtml(text)}</span></aside>`,
          });
        }
        generatedVisiblePrimitive = true;
        repairs.push(`Deterministically realized annotation “${nodeId}” against exact anchor “${anchorId}”; no model repair call was required.`);
      }
      continue;
    }

    if (requirement.kind === "relationship") {
      const sourceNodeIds = uniqueIds(requirement.sourceNodeIds ?? []);
      const targetNodeIds = uniqueIds(requirement.targetNodeIds ?? []);
      if (sourceNodeIds.length === 0 || targetNodeIds.length === 0) {
        failures.push({ code: "RELATIONSHIP_ENDPOINTS_MISSING", primitiveId: requirement.id, message: "Relationship specification needs exact sourceNodeIds and targetNodeIds." });
        continue;
      }
      const parentId = primitiveParentId(requirement, available);
      for (const [index, nodeId] of instanceNodeIds.entries()) {
        const sourceId = sourceNodeIds[index % sourceNodeIds.length];
        const targetId = targetNodeIds[index % targetNodeIds.length];
        const sourceResolved = openingAvailable.has(sourceId) || available.has(sourceId);
        const targetResolved = openingAvailable.has(targetId) || available.has(targetId);
        if (!sourceResolved || !targetResolved) {
          failures.push({ code: "RELATIONSHIP_ENDPOINT_UNRESOLVED", primitiveId: requirement.id, message: `Unresolved relationship endpoint ${!sourceResolved ? sourceId : targetId}.` });
          continue;
        }
        const attributes = {
          "data-ns-relationship-id": nodeId,
          "data-ns-source-id": sourceId,
          "data-ns-target-id": targetId,
          "data-ns-relationship-type": requirement.relationshipType || "evidence-to-claim",
          "data-ns-meaning": requirement.text || requirement.description || requirement.label || humanizePrimitiveId(requirement.id),
          "data-ns-confidence": requirement.confidence || "interpretive",
          "data-ns-priority": requirement.priority || "normal",
          "data-ns-route": requirement.route || "soft-curve",
          "data-ns-analysis-kind": "relationship",
          "data-ns-analysis-placement": "external-relationship",
          "data-ns-relationship-metadata": "true",
          "data-ns-realized-primitive": "true",
        } as const;
        if (available.has(nodeId)) {
          addOperation({ op: "set-attributes", targetId: nodeId, attributes });
        } else {
          const serialized = Object.entries(attributes).map(([name, value]) => `${name}="${escapePrimitiveHtml(value)}"`).join(" ");
          addOperation({ op: "insert-html", targetId: parentId, position: "beforeend", html: `<span data-ns-node-id="${escapePrimitiveHtml(nodeId)}" ${serialized}></span>` });
        }
        repairs.push(`Deterministically realized routed relationship “${nodeId}” from “${sourceId}” to “${targetId}”.`);
      }
      continue;
    }

    if (["chart", "sparkline", "axis"].includes(requirement.kind)) {
      const sourceNodeIds = uniqueIds([
        ...(requirement.sourceNodeIds ?? []),
        ...(requirement.dataPoints ?? []).map((point) => point.sourceNodeId),
      ]);
      const unresolved = sourceNodeIds.filter((nodeId) => !openingAvailable.has(nodeId) && !available.has(nodeId));
      if (sourceNodeIds.length === 0 || unresolved.length > 0) {
        failures.push({ code: "ANALYTICAL_SOURCE_UNRESOLVED", primitiveId: requirement.id, message: `Analytical specification has ${sourceNodeIds.length === 0 ? "no grounded sources" : `unresolved sources ${unresolved.join(", ")}`}.` });
        continue;
      }
      for (const nodeId of instanceNodeIds) {
        const generated = deterministicChartMarkup({ requirement, nodeId, sourceNodeIds });
        if (generated.downgraded) {
          requirement.encoding = "qualitative";
          requirement.valuesGrounded = false;
          repairs.push(`Converted ungrounded quantitative request “${requirement.id}” into an explicitly interpretive qualitative encoding instead of inventing measurements.`);
        }
        const targetId = requirement.placement === "beneath-flow" ? sourceNodeIds[0] : primitiveParentId(requirement, available);
        if (available.has(nodeId)) {
          addOperation({
            op: "set-attributes",
            targetId: nodeId,
            attributes: {
              "data-ns-analysis-kind": requirement.kind,
              "data-ns-analysis-placement": requirement.placement === "beneath-flow" ? "caption-lane" : "inter-row-lane",
              "data-ns-encoding": generated.normalizedEncoding,
              "data-ns-source-ids": sourceNodeIds.join(","),
              "data-ns-label": requirement.label || requirement.description || humanizePrimitiveId(requirement.id),
              "data-ns-values-grounded": generated.normalizedEncoding === "quantitative" ? "true" : "false",
              "data-ns-realized-primitive": "true",
            },
          });
          addOperation({ op: "set-html", targetId: nodeId, html: semanticNodeInnerMarkup(generated.markup, nodeId) || generated.markup });
        } else {
          addOperation({ op: "insert-html", targetId, position: requirement.placement === "beneath-flow" ? "afterend" : "beforeend", html: generated.markup });
        }
        generatedVisiblePrimitive = true;
        repairs.push(`Deterministically realized grounded ${requirement.kind} “${nodeId}” from its typed DesignAct data.`);
      }
      continue;
    }

    if (requirement.kind === "synthesis" || requirement.kind === "decision") {
      const canonicalId = requirement.kind === "synthesis" ? "synthesis" : "decision";
      const nodeId = instanceNodeIds[0] || canonicalId;
      const authoredText = normalizeSemanticText([
        requirement.text,
        requirement.description,
        requirement.label,
        requirement.kind === "synthesis" ? input.draft.description : input.draft.visibleChange,
      ].filter(Boolean).join(" "));
      const minimumLength = requirement.kind === "synthesis" ? 48 : 36;
      if (authoredText.length < minimumLength) {
        failures.push({ code: "PRIMITIVE_TEXT_INCOMPLETE", primitiveId: requirement.id, message: `Typed ${requirement.kind} specification needs substantive authored text.` });
        continue;
      }
      const targetId = available.has(nodeId) ? nodeId : (available.has(canonicalId) ? canonicalId : nodeId);
      if (!available.has(targetId)) {
        addOperation({
          op: "insert-html",
          targetId: primitiveParentId(requirement, available),
          position: "beforeend",
          html: `<section data-ns-node-id="${escapePrimitiveHtml(targetId)}" data-ns-role="${requirement.kind}" data-ns-required-placement="${requirement.kind}" data-ns-source-ids="${escapePrimitiveHtml((requirement.sourceNodeIds ?? []).join(","))}" data-ns-realized-primitive="true"></section>`,
        });
      }
      addOperation({
        op: "set-attributes",
        targetId,
        attributes: {
          "data-ns-role": requirement.kind,
          "data-ns-required-placement": requirement.kind,
          "data-ns-source-ids": (requirement.sourceNodeIds ?? []).join(","),
          "data-ns-realized-primitive": "true",
        },
      });
      addOperation({ op: "set-html", targetId, html: `<p data-ns-node-id="${escapePrimitiveHtml(targetId)}-text">${escapePrimitiveHtml(authoredText)}</p>` });
      generatedVisiblePrimitive = true;
      repairs.push(`Deterministically realized substantive ${requirement.kind} “${targetId}” from the typed DesignAct specification.`);
    }
  }

  if (generatedVisiblePrimitive && !operations.some((operation) => operation.op === "set-css-layer" && operation.layerId === "realized-primitives-v1")) {
    operations.push({ op: "set-css-layer", layerId: "realized-primitives-v1", css: NORTHSTAR_REALIZED_PRIMITIVE_CSS });
  }

  return { operations, requirements, repairs, failures: Array.from(new Set(failures)) };
}

function normalizeStructuralPrimitiveContracts(
  requirements: NorthstarRequiredPrimitive[] | undefined,
  operations: NorthstarArtboardMutationOperation[],
): { operations: NorthstarArtboardMutationOperation[]; repairs: string[] } {
  if (!requirements?.length) return { operations, repairs: [] };
  const repairs: string[] = [];
  let next = operations.map((operation) => ({ ...operation })) as NorthstarArtboardMutationOperation[];

  for (const requirement of requirements) {
    if (requirement.kind !== "frame" && requirement.kind !== "evidence-lane") continue;
    const nodeIds = requirement.nodeIds?.length ? requirement.nodeIds : [requirement.id];
    for (const nodeId of nodeIds) {
      let repaired = false;
      next = next.map((operation) => {
        if (repaired || !("html" in operation) || typeof operation.html !== "string") return operation;
        const opening = semanticNodeOpeningTag(operation.html, nodeId);
        if (!opening) return operation;
        const attributes: Record<string, string> = {
          "data-ns-required-placement": requirement.placement ?? (requirement.kind === "frame" ? "frame" : "between-sections"),
        };
        if (!/\bdata-ns-geometry-role\s*=/.test(opening.source)) attributes["data-ns-geometry-role"] = "structural";
        if (!/\bdata-ns-role\s*=/.test(opening.source)) {
          attributes["data-ns-role"] = requirement.kind === "frame" ? "frame" : "evidence-lane";
        }
        const html = injectSemanticNodeAttributes(operation.html, nodeId, attributes);
        repaired = html !== operation.html;
        return repaired ? { ...operation, html } : operation;
      });
      if (repaired) {
        repairs.push(`Normalized exact ${requirement.kind} contract “${requirement.id}” on “${nodeId}” as a structural ${requirement.placement ?? "frame"} primitive.`);
      }
    }
  }

  return { operations: next, repairs };
}

function requiredPrimitiveFailures(
  requirements: NorthstarRequiredPrimitive[] | undefined,
  operations: NorthstarArtboardMutationOperation[],
  availableNodeIds: Set<string>,
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): NorthstarPrimitiveFailure[] {
  if (!requirements?.length) return [];
  const failures: NorthstarPrimitiveFailure[] = [];
  const fail = (primitiveId: string, code: string, message: string) => {
    failures.push({ primitiveId, code, message });
  };

  for (const requirement of requirements) {
    const nodeIds = requirement.nodeIds?.length ? requirement.nodeIds : [requirement.id];
    const states = nodeIds.map((nodeId) => ({
      nodeId,
      ...effectivePrimitiveState({ nodeId, operations, semanticSnapshot }),
    }));
    const presentStates = states.filter((state) => state.exists && availableNodeIds.has(state.nodeId));
    const minimumInstances = Math.max(1, requirement.minimumInstances || 1);
    if (presentStates.length < minimumInstances) {
      fail(requirement.id, "PRIMITIVE_INSTANCE_COUNT", `${requirement.kind} requires ${minimumInstances} exact semantic instance${minimumInstances === 1 ? "" : "s"}.`);
      continue;
    }

    const tags = presentStates.map((state) => state.tag).filter(Boolean);
    const joinedTags = tags.join("\n");
    const kindSatisfied = (() => {
      switch (requirement.kind) {
        case "chart":
          return tags.filter((tag) => /data-ns-analysis-kind=["']chart["']/i.test(tag)).length >= minimumInstances;
        case "sparkline":
          return tags.filter((tag) => /data-ns-analysis-kind=["']sparkline["']/i.test(tag)).length >= minimumInstances;
        case "axis":
          return tags.filter((tag) => /data-ns-analysis-kind=["']axis["']/i.test(tag)).length >= minimumInstances;
        case "annotation":
          return tags.filter((tag) => /data-ns-annotation-id=["'][^"']+["']/i.test(tag)
            && /data-ns-anchor-node-id=["'][^"']+["']/i.test(tag)).length >= minimumInstances;
        case "relationship":
          return tags.filter((tag) => /data-ns-relationship-id=["'][^"']+["']/i.test(tag)
            && /data-ns-source-(?:id|node-id)=["'][^"']+["']/i.test(tag)
            && /data-ns-target-(?:id|node-id)=["'][^"']+["']/i.test(tag)).length >= minimumInstances;
        case "synthesis":
          return presentStates.some((state) => (state.nodeId === "synthesis" || /synthesis|summary|takeaway/i.test(state.nodeId))
            && state.text.trim().length >= 48);
        case "decision":
          return presentStates.some((state) => (state.nodeId === "decision" || /decision|recommendation|conclusion|implication/i.test(state.nodeId))
            && state.text.trim().length >= 36);
        case "evidence-lane":
        case "frame":
          return presentStates.length >= minimumInstances;
      }
    })();
    if (!kindSatisfied) {
      fail(requirement.id, "PRIMITIVE_CONTRACT_UNREALIZED", `Did not implement the exact ${requirement.kind} contract.`);
      continue;
    }

    for (const sourceNodeId of requirement.sourceNodeIds ?? []) {
      if (!availableNodeIds.has(sourceNodeId)) {
        fail(requirement.id, "PRIMITIVE_SOURCE_UNRESOLVED", `References unresolved source ${sourceNodeId}.`);
        continue;
      }
      if (!tags.some((tag) => attributeIdList(tag, ["data-ns-source-ids", "data-ns-source-id", "data-ns-source-node-id", "data-ns-anchor-node-id"]).includes(sourceNodeId))) {
        fail(requirement.id, "PRIMITIVE_SOURCE_UNBOUND", `Does not visibly bind required source ${sourceNodeId}.`);
      }
    }
    for (const targetNodeId of requirement.targetNodeIds ?? []) {
      if (!availableNodeIds.has(targetNodeId)) {
        fail(requirement.id, "PRIMITIVE_TARGET_UNRESOLVED", `References unresolved target ${targetNodeId}.`);
        continue;
      }
      if (!tags.some((tag) => attributeIdList(tag, ["data-ns-target-id", "data-ns-target-node-id"]).includes(targetNodeId))) {
        fail(requirement.id, "PRIMITIVE_TARGET_UNBOUND", `Does not visibly bind required target ${targetNodeId}.`);
      }
    }

    const placementByContract: Record<NonNullable<NorthstarRequiredPrimitive["placement"]>, RegExp> = {
      frame: /data-ns-required-placement=["']frame["']|data-ns-(?:role|geometry-role)=["'][^"']*(?:frame|structural|root)/i,
      "beneath-flow": /data-ns-analysis-placement=["']caption-lane["']/i,
      "between-sections": /data-ns-analysis-placement=["']inter-row-lane["']/i,
      "anchored-margin": /data-ns-analysis-placement=["']margin-lane["']/i,
      "routed-overlay": /data-ns-analysis-placement=["']external-relationship["']/i,
      synthesis: /data-ns-node-id=["'][^"']*(?:synthesis|summary|takeaway)/i,
      decision: /data-ns-node-id=["'][^"']*(?:decision|recommendation|conclusion|implication)/i,
    };
    const structuralPlacementSatisfied = (requirement.kind === "frame" || requirement.kind === "evidence-lane")
      && requirement.placement
      && tags.some((tag) => new RegExp(`data-ns-required-placement=["']${requirement.placement}["']`, "i").test(tag));
    if (requirement.placement && !structuralPlacementSatisfied && !placementByContract[requirement.placement].test(joinedTags)) {
      fail(requirement.id, "PRIMITIVE_PLACEMENT_UNREALIZED", `Is not in required placement ${requirement.placement}.`);
    }
  }
  const deduped = new Map<string, NorthstarPrimitiveFailure>();
  for (const failure of failures) deduped.set(`${failure.primitiveId}:${failure.code}:${failure.message}`, failure);
  return [...deduped.values()];
}

const CONSTRUCTION_BEAT_ORDER: NorthstarConstructionBeatKind[] = [
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

function allOperationNodeIds(operations: NorthstarArtboardMutationOperation[]): string[] {
  const ids = new Set<string>();
  for (const operation of operations) {
    if ("targetId" in operation) ids.add(operation.targetId);
    if (operation.op === "move") {
      ids.add(operation.parentId);
    }
    if (operation.op === "recompose-region") {
      for (const placement of operation.placements) {
        ids.add(placement.targetId);
        ids.add(placement.parentId);
      }
    }
    for (const nodeId of semanticIds(operationMarkup(operation))) ids.add(nodeId);
  }
  return Array.from(ids).filter((id) => id !== "__root__");
}

function constructionBeatKindForNode(nodeId: string, markup: string): NorthstarConstructionBeatKind {
  const tag = openingTagForNode(markup, nodeId);
  const source = `${nodeId} ${tag}`.toLowerCase();
  if (/data-ns-annotation-id|annotation|callout/.test(source)) return "anchor-annotations";
  if (/data-ns-relationship-id|relationship|connector/.test(source)) return "route-relationships";
  if (/data-ns-analysis-kind|sparkline|chart|axis|plot|graph|heat[-_ ]?index|friction[-_ ]?(?:pulse|delta|index)/.test(source)) return "draw-analysis";
  if (/^(?:synthesis|executive-synthesis)$|synthesis|summary|takeaway/.test(source)) return "reveal-synthesis";
  if (/^(?:decision|recommendation)$|decision|recommendation|conclusion|implication/.test(source)) return "resolve-decision";
  if (/data-ns-evidence-id|data-ns-flow-id|protected-evidence|screenshot|screen-|flow-/.test(source)) return "choreograph-evidence";
  if (/rail|lane|comparison-canvas|communication-stack|grid|sequence|stage|layout|shell/.test(source)) return "open-layout";
  if (/^(?:presentation|header|title|deck|analysis-core|artboard)$|frame|thesis/.test(source)) return "establish-frame";
  return "settle";
}

function defaultBeatLabel(kind: NorthstarConstructionBeatKind): string {
  switch (kind) {
    case "establish-frame": return "Establishing the visual idea";
    case "open-layout": return "Opening the composition";
    case "choreograph-evidence": return "Choreographing grounded evidence";
    case "draw-analysis": return "Drawing the analytical language";
    case "anchor-annotations": return "Anchoring key observations";
    case "route-relationships": return "Connecting proof to meaning";
    case "reveal-synthesis": return "Resolving the synthesis";
    case "resolve-decision": return "Landing the implication";
    case "settle": return "Settling the final artboard";
  }
}

function expandEvidenceConstructionNodes(
  nodeIds: string[],
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): string[] {
  if (!semanticSnapshot?.length) return Array.from(new Set(nodeIds));
  const snapshotById = semanticSnapshotMap(semanticSnapshot);
  const result: string[] = [];
  for (const nodeId of nodeIds) {
    const descendants = semanticDescendants(nodeId, semanticSnapshot);
    const itemCandidates = Array.from(descendants)
      .map((descendantId) => snapshotById.get(descendantId))
      .filter((node): node is NorthstarCommittedSemanticNode => Boolean(node))
      .filter((node) => {
        if (/-image$/i.test(node.nodeId)) return false;
        const attributes = node.normalizedAttributes ?? {};
        return Boolean(attributes["data-ns-evidence-id"] || attributes["data-ns-screen-id"])
          || /(?:^|[-_:])screen(?:[-_:]|$)/i.test(node.nodeId);
      });
    const candidateIds = new Set(itemCandidates.map((node) => node.nodeId));
    const topLevelCandidates = itemCandidates
      .filter((node) => !node.parentId || !candidateIds.has(node.parentId))
      .map((node) => node.nodeId);
    if (topLevelCandidates.length >= 2) result.push(...topLevelCandidates);
    else result.push(nodeId);
  }
  return Array.from(new Set(result));
}

function requiredPrimitiveBeatKind(kind: NorthstarRequiredPrimitive["kind"]): NorthstarConstructionBeatKind {
  switch (kind) {
    case "chart":
    case "sparkline":
    case "axis": return "draw-analysis";
    case "annotation": return "anchor-annotations";
    case "relationship": return "route-relationships";
    case "synthesis": return "reveal-synthesis";
    case "decision": return "resolve-decision";
    case "evidence-lane": return "open-layout";
    case "frame": return "establish-frame";
  }
}

function chunkConstructionNodes(nodeIds: string[], maximum: number): string[][] {
  const values = Array.from(new Set(nodeIds));
  if (values.length === 0) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += maximum) chunks.push(values.slice(index, index + maximum));
  return chunks;
}

function replacedConstructionNodeIds(
  operations: NorthstarArtboardMutationOperation[],
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): Set<string> {
  const snapshotById = semanticSnapshotMap(semanticSnapshot);
  const children = semanticChildrenMap(semanticSnapshot);
  const result = new Set<string>();
  const addMeaningfulSubtree = (rootId: string, includeRoot: boolean) => {
    const queue = [...(includeRoot ? [rootId] : Array.from(children.get(rootId) ?? []))];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = snapshotById.get(nodeId);
      if (!node) continue;
      const attributes = node.normalizedAttributes ?? {};
      const directChild = node.parentId === rootId;
      const meaningful = directChild
        || Boolean(attributes["data-ns-evidence-id"])
        || Boolean(attributes["data-ns-screen-id"])
        || Boolean(attributes["data-ns-flow-id"])
        || Boolean(attributes["data-ns-analysis-kind"])
        || Boolean(attributes["data-ns-annotation-id"])
        || Boolean(attributes["data-ns-relationship-id"])
        || /(?:screen|evidence|flow|sequence|rail|lane|analysis|chart|sparkline|axis|annotation|callout|relationship|synthesis|decision|recommendation|conclusion)/i.test(nodeId);
      if (meaningful && !/-image$/i.test(nodeId)) result.add(nodeId);
      queue.push(...(children.get(nodeId) ?? []));
    }
  };

  for (const operation of operations) {
    if (operation.op === "remove") addMeaningfulSubtree(operation.targetId, true);
    if (operation.op === "set-html" || operation.op === "recompose-region") {
      addMeaningfulSubtree(operation.targetId, false);
    }
    if (operation.op === "recompose-region") {
      for (const nodeId of operation.retireNodeIds ?? []) addMeaningfulSubtree(nodeId, true);
    }
  }
  return result;
}

function normalizedConstructionTiming(beats: NorthstarConstructionBeat[]): {
  beats: NorthstarConstructionBeat[];
  totalDurationMs: number;
} {
  const measure = (values: NorthstarConstructionBeat[]) => values.reduce(
    (sum, beat) => sum + beat.durationMs + beat.holdMs + Math.max(0, beat.nodeIds.length - 1) * beat.staggerMs,
    0,
  );
  const maximumDuration = 18_000;
  const initialTotal = measure(beats);
  if (initialTotal <= maximumDuration) return { beats, totalDurationMs: initialTotal };
  const scale = maximumDuration / Math.max(1, initialTotal);
  const scaled = beats.map((beat) => ({
    ...beat,
    durationMs: Math.max(beat.kind === "settle" ? 260 : 340, Math.round(beat.durationMs * scale)),
    staggerMs: Math.max(beat.nodeIds.length > 1 ? 10 : 0, Math.round(beat.staggerMs * scale)),
    holdMs: Math.max(beat.kind === "settle" ? 70 : 30, Math.round(beat.holdMs * scale)),
  }));
  return { beats: scaled, totalDurationMs: measure(scaled) };
}

function compileConstructionPlan(
  draft: NorthstarArtboardMutationDraft,
  operations: NorthstarArtboardMutationOperation[],
  semanticSnapshot?: NorthstarCommittedSemanticNode[],
): NorthstarConstructionPlan {
  const markup = operations.map(operationMarkup).join("\n");
  const affected = new Set(allOperationNodeIds(operations).filter((nodeId) => nodeId !== "__root__"));
  for (const nodeId of replacedConstructionNodeIds(operations, semanticSnapshot)) affected.add(nodeId);
  for (const requirement of draft.requiredPrimitives ?? []) {
    for (const nodeId of requirement.nodeIds?.length ? requirement.nodeIds : [requirement.id]) affected.add(nodeId);
  }
  const affectedNodeIds = Array.from(affected);
  const structuralOperationCount = operations.filter((operation) => ["set-html", "insert-html", "recompose-region", "move", "remove"].includes(operation.op)).length;
  const cinematic = structuralOperationCount >= 2 || affectedNodeIds.length >= 7;
  const assigned = new Set<string>();
  const explicitBeats: NorthstarConstructionBeat[] = [];

  for (const beat of draft.constructionPlan?.beats ?? []) {
    const declaredNodeIds = beat.nodeIds.filter((nodeId) => affected.has(nodeId) || nodeId === "artboard");
    const nodeIds = beat.kind === "choreograph-evidence"
      ? expandEvidenceConstructionNodes(declaredNodeIds, semanticSnapshot)
      : Array.from(new Set(declaredNodeIds));
    if (nodeIds.length === 0 && beat.kind !== "settle") continue;
    declaredNodeIds.forEach((nodeId) => assigned.add(nodeId));
    nodeIds.forEach((nodeId) => assigned.add(nodeId));
    explicitBeats.push({
      ...beat,
      nodeIds,
      durationMs: cinematic
        ? Math.max(beat.durationMs, beat.kind === "choreograph-evidence" ? 980 : 460)
        : Math.min(900, beat.durationMs),
    });
  }

  const inferredByKind = new Map<NorthstarConstructionBeatKind, string[]>();
  const addInferred = (kind: NorthstarConstructionBeatKind, nodeId: string) => {
    if (assigned.has(nodeId)) return;
    const values = inferredByKind.get(kind) ?? [];
    values.push(nodeId);
    inferredByKind.set(kind, values);
    assigned.add(nodeId);
  };
  for (const requirement of draft.requiredPrimitives ?? []) {
    const kind = requiredPrimitiveBeatKind(requirement.kind);
    for (const nodeId of requirement.nodeIds?.length ? requirement.nodeIds : [requirement.id]) addInferred(kind, nodeId);
  }
  for (const nodeId of affectedNodeIds) addInferred(constructionBeatKindForNode(nodeId, markup), nodeId);

  const inferredBeats: NorthstarConstructionBeat[] = [];
  for (const kind of CONSTRUCTION_BEAT_ORDER) {
    const rawNodeIds = inferredByKind.get(kind) ?? [];
    const expanded = kind === "choreograph-evidence"
      ? expandEvidenceConstructionNodes(rawNodeIds, semanticSnapshot)
      : Array.from(new Set(rawNodeIds));
    const chunks = chunkConstructionNodes(expanded, kind === "choreograph-evidence" ? 36 : 64);
    chunks.forEach((nodeIds, chunkIndex) => inferredBeats.push({
      id: `construction-${kind}${chunks.length > 1 ? `-${chunkIndex + 1}` : ""}`,
      kind,
      label: chunks.length > 1 ? `${defaultBeatLabel(kind)} · ${chunkIndex + 1}/${chunks.length}` : defaultBeatLabel(kind),
      nodeIds,
      durationMs: kind === "choreograph-evidence" ? (cinematic ? 1250 : 720)
        : kind === "draw-analysis" || kind === "route-relationships" ? (cinematic ? 980 : 620)
          : kind === "settle" ? 460
            : cinematic ? 720 : 480,
      staggerMs: kind === "choreograph-evidence" ? 54 : kind === "anchor-annotations" ? 72 : 36,
      holdMs: kind === "settle" ? 150 : cinematic ? 95 : 50,
      emphasis: kind === "choreograph-evidence" || kind === "draw-analysis" ? "hero" : kind === "settle" ? "quiet" : "normal",
    }));
  }

  const byKind = new Map<NorthstarConstructionBeatKind, NorthstarConstructionBeat[]>();
  for (const beat of [...explicitBeats, ...inferredBeats]) {
    const values = byKind.get(beat.kind) ?? [];
    values.push(beat);
    byKind.set(beat.kind, values);
  }
  if (!byKind.has("settle")) {
    byKind.set("settle", [{
      id: "construction-settle",
      kind: "settle",
      label: defaultBeatLabel("settle"),
      nodeIds: ["artboard"],
      durationMs: 460,
      staggerMs: 0,
      holdMs: 150,
      emphasis: "quiet",
    }]);
  }

  let beats = CONSTRUCTION_BEAT_ORDER.flatMap((kind) => byKind.get(kind) ?? []);
  const covered = new Set(beats.flatMap((beat) => beat.nodeIds));
  const uncovered = affectedNodeIds.filter((nodeId) => !covered.has(nodeId));
  for (const nodeId of uncovered) {
    const kind = constructionBeatKindForNode(nodeId, markup);
    const beat = beats.find((candidate) => candidate.kind === kind && candidate.nodeIds.length < 160);
    if (beat) beat.nodeIds.push(nodeId);
    else beats.splice(Math.max(0, beats.length - 1), 0, {
      id: `construction-${kind}-coverage-${beats.length + 1}`,
      kind,
      label: defaultBeatLabel(kind),
      nodeIds: [nodeId],
      durationMs: kind === "choreograph-evidence" ? 980 : 620,
      staggerMs: 36,
      holdMs: 70,
      emphasis: kind === "choreograph-evidence" || kind === "draw-analysis" ? "hero" : "normal",
    });
  }

  if (cinematic && beats.filter((beat) => beat.kind !== "settle").length < 3) {
    const nonSettle = beats.filter((beat) => beat.kind !== "settle");
    const settle = beats.filter((beat) => beat.kind === "settle");
    while (nonSettle.length < 3) {
      nonSettle.push({
        id: `construction-breath-${nonSettle.length + 1}`,
        kind: nonSettle.length === 0 ? "establish-frame" : nonSettle.length === 1 ? "open-layout" : "choreograph-evidence",
        label: nonSettle.length === 0 ? "Framing the visual idea" : nonSettle.length === 1 ? "Making room for the composition" : "Settling the evidence into place",
        nodeIds: nonSettle.length === 2 ? affectedNodeIds.filter((nodeId) => constructionBeatKindForNode(nodeId, markup) === "choreograph-evidence") : [],
        durationMs: 520,
        staggerMs: 24,
        holdMs: 60,
        emphasis: "quiet",
      });
    }
    beats = [...nonSettle, ...settle];
  }

  const normalizedTiming = normalizedConstructionTiming(beats);
  const totalDurationMs = Math.max(900, normalizedTiming.totalDurationMs);
  return {
    version: "northstar.live-visual-authorship.v2",
    mode: cinematic ? "cinematic" : "compact",
    beats: normalizedTiming.beats,
    coverageNodeIds: affectedNodeIds,
    strictCoverage: true,
    totalDurationMs,
    deadlineMs: Math.min(26_000, Math.max(totalDurationMs + 2_500, 5_000)),
    showBeatLabels: draft.constructionPlan?.showBeatLabels !== false,
  };
}

function committedRelationshipIds(previous: NorthstarGeneratedCodeArtifactPackage): Set<string> {
  const markup = [
    previous.document.html,
    ...(previous.mutationJournal ?? []).flatMap((batch) =>
      batch.operations.flatMap((operation) =>
        operation.op === "insert-html" || operation.op === "set-html" || operation.op === "recompose-region" ? [operation.html] : []
      )
    ),
  ];
  return new Set(relationshipInventory(markup).map((relationship) => relationship.id));
}

export function compileNorthstarMutationDraft(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  draft: NorthstarArtboardMutationDraft;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
  /** Exact node identities already proven by the editable-surface descriptor. */
  authoritativeNodeIds?: string[];
  /** Internal guard used when optional primitive contracts are degraded once. */
  allowOptionalPrimitiveDegradation?: boolean;
  /** Creative source revisions bypass every legacy visual-primitive and layout-repair system. */
  creativeSourceAuthority?: boolean;
}): NorthstarMutationCompilationResult {
  if (input.creativeSourceAuthority) {
    return compilationResult(
      {
        ...input.draft,
        requiredPrimitives: [],
        operations: [...input.draft.operations],
      },
      [
        "MODEL_SOURCE_AUTHORITY: Preserved the model-authored HTML/CSS/SVG/JavaScript transaction without primitive realization, analytical placement repair, layout recipes, named-promise grading, or ambition enforcement.",
      ],
      [],
    );
  }

  const initiallyRepaired = input.creativeSourceAuthority
    ? { draft: { ...input.draft, requiredPrimitives: [] }, repairs: [] as string[] }
    : repairNorthstarArtboardMutationDraft(input.draft);
  let repairedDraft = initiallyRepaired.draft;
  const repairs = [...initiallyRepaired.repairs];

  // Typed primitive realization happens before region coalescing. Generated evidence
  // moves must participate in the same atomic recomposition as authored replacements;
  // appending them after coalescing previously left valid opening-scene members behind.
  const primitiveRealization = input.creativeSourceAuthority
    ? {
        operations: repairedDraft.operations,
        requirements: [] as NorthstarRequiredPrimitive[],
        repairs: [] as string[],
        failures: [] as NorthstarPrimitiveFailure[],
      }
    : materializeRequiredPrimitiveSpecifications({
        previous: input.previous,
        draft: repairedDraft,
        operations: repairedDraft.operations,
        semanticSnapshot: input.semanticSnapshot,
        authoritativeNodeIds: input.authoritativeNodeIds,
      });
  repairedDraft = {
    ...repairedDraft,
    operations: primitiveRealization.operations,
    requiredPrimitives: primitiveRealization.requirements,
  };
  repairs.push(...primitiveRealization.repairs);
  if (primitiveRealization.failures.length > 0) {
    const detail = `PRIMITIVE_SPEC_UNRESOLVED: ${primitiveRealization.failures.map((failure) => `${failure.primitiveId}: ${failure.message}`).join(" ")}`;
    const degradation = degradablePrimitiveSet(input.draft.requiredPrimitives, primitiveRealization.failures);
    if (degradation.essentialFailures.length > 0) {
      return compilationResult(
        { ...repairedDraft, operations: [] },
        [...repairs, detail],
        [{
          code: "ESSENTIAL_PRIMITIVE_UNRESOLVED",
          severity: "hard",
          message: `${detail} Essential bindings: ${degradation.essentialFailures.map((primitive) => primitive.id).join(", ")}.`,
        }],
      );
    }
    if (input.allowOptionalPrimitiveDegradation !== false && degradation.removed.length > 0) {
      const degraded = compileNorthstarMutationDraft({
        ...input,
        draft: {
          ...input.draft,
          requiredPrimitives: degradation.remaining,
        },
        allowOptionalPrimitiveDegradation: false,
      });
      return compilationResult(
        degraded.draft,
        [
          ...repairs,
          detail,
          `Skipped only unresolved optional primitive bindings: ${degradation.removed.map((primitive) => primitive.id).join(", ")}.`,
          ...degraded.repairs,
        ],
        [
          ...primitiveRealization.failures.map((failure) => ({
            code: failure.code,
            severity: "repairable" as const,
            message: `${failure.primitiveId}: ${failure.message}`,
          })),
          ...degraded.diagnostics,
        ],
      );
    }
    repairs.push(`${detail} The remaining authored transaction could not be compiled safely.`);
    return compilationResult(
      { ...repairedDraft, operations: [] },
      repairs,
      [{ code: "PRIMITIVE_SPEC_UNRESOLVED", severity: "repairable", message: detail }],
    );
  }

  const reservedNodeIds = primitiveDependencyIds(primitiveRealization.requirements);
  const coalesced = coalesceAtomicRegionRecompositions(
    repairedDraft.operations,
    input.semanticSnapshot,
  );
  repairs.push(...coalesced.repairs);
  const scheduled = scheduleReservedEvidenceEvacuation({
    operations: coalesced.operations,
    reservedNodeIds,
    semanticSnapshot: input.semanticSnapshot,
  });
  repairs.push(...scheduled.repairs);
  repairedDraft = {
    ...repairedDraft,
    operations: scheduled.operations,
  };
  if (isCssOnlyStructuralClaim(repairedDraft)) {
    const message = "Rejected a CSS-only structural concept claim; major visual architecture requires semantic nodes and explicit composition operations.";
    return compilationResult(
      { ...repairedDraft, operations: [] },
      [...repairs, `MATERIALITY_CSS_ONLY: ${message}`],
      [{ code: "MATERIALITY_CSS_ONLY", severity: "repairable", message }],
    );
  }
  const knownNodes = committedSemanticIds(input.previous);
  const browserNodes = semanticSnapshotMap(input.semanticSnapshot);
  for (const nodeId of browserNodes.keys()) knownNodes.add(nodeId);
  for (const nodeId of input.authoritativeNodeIds ?? []) {
    const normalized = String(nodeId ?? "").trim();
    if (normalized) knownNodes.add(normalized);
  }
  const knownRelationships = committedRelationshipIds(input.previous);
  const singletonOwners = committedSingletonOwners(input.previous);
  const operations: NorthstarArtboardMutationOperation[] = [];
  const removedRoots = new Set<string>();
  const lastSingletonOperationIndex = new Map<NorthstarSingletonRole, number>();
  repairedDraft.operations.forEach((operation, index) => {
    if (operation.op !== "insert-html" && operation.op !== "set-html" && operation.op !== "recompose-region") return;
    for (const role of singletonRoles(operation.html)) lastSingletonOperationIndex.set(role, index);
  });

  for (const [operationIndex, rawOperation] of repairedDraft.operations.entries()) {
    if (rawOperation.op === "recompose-region") {
      const spatiallySanitized = sanitizeAnchoredSpatialMarkup(rawOperation.html);
      const spatiallyValidated = validateSpatialMarkup(spatiallySanitized.markup);
      repairs.push(...spatiallySanitized.repairs, ...spatiallyValidated.repairs);
      const normalizedMarkup = normalizeNorthstarRelationshipMarkup(spatiallyValidated.markup);
      // A whole-region recomposition may contain several declared analytical lanes.
      // Validate their anchored markup and relationships, but do not collapse the
      // entire scene into the placement mode of the outer replacement target.

      const ids = semanticIds(normalizedMarkup);
      const targetSubtree = semanticSubtree(rawOperation.targetId, input.semanticSnapshot);
      const preservedSubtrees = new Set<string>();
      for (const placement of rawOperation.placements) {
        for (const nodeId of semanticSubtree(placement.targetId, input.semanticSnapshot)) preservedSubtrees.add(nodeId);
      }
      const replacementOwnedIds = new Set([...targetSubtree, ...preservedSubtrees]);
      // When the browser semantic snapshot is unavailable, keep the complete
      // transaction intact and let the final-state simulator/preflight prove
      // duplicate safety. Silently dropping a valid replacement is worse than
      // returning an explicit deterministic preflight repair request.
      const invalidDuplicates = input.semanticSnapshot?.length
        ? ids.filter((id) => knownNodes.has(id) && !replacementOwnedIds.has(id))
        : [];
      if (invalidDuplicates.length > 0) {
        repairs.push(`Dropped atomic region recomposition containing duplicate semantic ids outside the replaced scene: ${invalidDuplicates.slice(0, 6).join(", ")}.`);
        continue;
      }

      const introduced = new Set(ids);
      const invalidPlacement = rawOperation.placements.find((placement) => {
        const sourceExists = knownNodes.has(placement.targetId);
        const parentExists = placement.parentId === rawOperation.targetId
          || introduced.has(placement.parentId)
          || knownNodes.has(placement.parentId);
        const beforeExists = !placement.beforeId
          || introduced.has(placement.beforeId)
          || knownNodes.has(placement.beforeId)
          || rawOperation.placements.some((candidate) => candidate.targetId === placement.beforeId);
        return !sourceExists || !parentExists || !beforeExists;
      });
      if (invalidPlacement) {
        repairs.push(`Dropped atomic region recomposition because placement “${invalidPlacement.targetId}” could not resolve its exact source, parent, or before-node.`);
        continue;
      }

      if (/data-ns-relationship-id/i.test(normalizedMarkup)) {
        try {
          const relationships = validateNorthstarSemanticRelationships({
            markup: normalizedMarkup,
            existingNodeIds: knownNodes,
            insertedNodeIds: new Set([...ids, ...rawOperation.placements.map((placement) => placement.targetId)]),
            existingRelationshipIds: knownRelationships,
          });
          for (const relationship of relationships) knownRelationships.add(relationship.id);
        } catch (error) {
          repairs.push(`Dropped one invalid atomic relationship recomposition: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
      }

      for (const nodeId of targetSubtree) {
        // recompose-region replaces the target's children, not the target node.
        if (nodeId !== rawOperation.targetId && !preservedSubtrees.has(nodeId)) knownNodes.delete(nodeId);
      }
      for (const retiredId of rawOperation.retireNodeIds ?? []) {
        for (const nodeId of semanticSubtree(retiredId, input.semanticSnapshot)) {
          if (!preservedSubtrees.has(nodeId)) knownNodes.delete(nodeId);
        }
      }
      for (const id of ids) knownNodes.add(id);
      for (const id of preservedSubtrees) knownNodes.add(id);

      const incomingSingletonRoles = singletonRoles(normalizedMarkup);
      const rootId = ids[0];
      for (const [role, owner] of singletonOwners) {
        if (targetSubtree.has(owner) || (rawOperation.retireNodeIds ?? []).some((retiredId) => isSameOrDescendant(owner, retiredId, input.semanticSnapshot))) {
          singletonOwners.delete(role);
        }
      }
      if (rootId) for (const role of incomingSingletonRoles) singletonOwners.set(role, rootId);

      operations.push({ ...rawOperation, html: normalizedMarkup });
      continue;
    }

    if (rawOperation.op !== "insert-html" && rawOperation.op !== "set-html") {
      if (rawOperation.op === "set-css-layer" && containsFreehandAnalyticalGeometry(rawOperation.css)) {
        repairs.push(`Dropped freehand analytical CSS layer “${rawOperation.layerId}”; analytical meaning must occupy a declared structural lane or typed relationship.`);
        continue;
      }
      if (rawOperation.op === "set-css-layer") {
        const safeCss = sanitizeWholeBoardCss(rawOperation.css);
        repairs.push(...safeCss.repairs);
        if (!safeCss.css.trim()) continue;
        operations.push({ ...rawOperation, css: safeCss.css });
      } else {
        operations.push(rawOperation);
      }
      if (rawOperation.op === "remove") knownNodes.delete(rawOperation.targetId);
      continue;
    }

    const spatiallySanitized = sanitizeAnchoredSpatialMarkup(rawOperation.html);
    const spatiallyValidated = validateSpatialMarkup(spatiallySanitized.markup);
    repairs.push(...spatiallySanitized.repairs, ...spatiallyValidated.repairs);
    const relationshipNormalizedMarkup = normalizeNorthstarRelationshipMarkup(spatiallyValidated.markup);
    const placement = prepareAnalyticalPlacement({
      markup: relationshipNormalizedMarkup,
      targetId: rawOperation.targetId,
      semanticSnapshot: input.semanticSnapshot,
      knownNodeIds: knownNodes,
    });
    if (!placement.allowed) {
      repairs.push(placement.reason || "Dropped one unsafe analytical placement operation.");
      continue;
    }
    if (placement.repair) repairs.push(placement.repair);
    const normalizedMarkup = placement.markup;
    let effectiveOperation: Extract<NorthstarArtboardMutationOperation, { op: "insert-html" | "set-html" }> = rawOperation;
    let pendingSlotOperation: Extract<NorthstarArtboardMutationOperation, { op: "insert-html" }> | undefined;
    if (placement.mode === "caption-lane") {
      const slotId = /analysis-slot$/i.test(rawOperation.targetId)
        ? rawOperation.targetId
        : analysisSlotId(rawOperation.targetId);
      if (!knownNodes.has(slotId)) {
        pendingSlotOperation = {
          op: "insert-html",
          targetId: rawOperation.targetId,
          position: "afterend",
          html: `<div data-ns-node-id="${slotId}" data-ns-role="analysis-slot" data-ns-analysis-slot-for="${rawOperation.targetId}" data-ns-geometry-role="structural"></div>`,
        };
      }
      effectiveOperation = {
        op: "insert-html",
        targetId: slotId,
        position: "beforeend",
        html: normalizedMarkup,
      };
      repairs.push(`Routed ${placement.kind ?? "analytical"} content into “${slotId}” so protected evidence remains untouched and the visual enters normal flow.`);
    } else if ((placement.mode === "margin-lane" || placement.mode === "external-relationship") && rawOperation.op === "set-html") {
      effectiveOperation = {
        op: "insert-html",
        targetId: rawOperation.targetId,
        position: "beforeend",
        html: normalizedMarkup,
      };
      repairs.push(`Converted destructive ${placement.mode} replacement into a non-destructive metadata insertion.`);
    } else {
      effectiveOperation = { ...rawOperation, html: normalizedMarkup };
    }
    const ids = semanticIds(normalizedMarkup);
    const rootId = ids[0];
    const incomingSingletonRoles = singletonRoles(normalizedMarkup);
    const supersededRole = incomingSingletonRoles.find(
      (role) => lastSingletonOperationIndex.get(role) !== operationIndex,
    );
    if (supersededRole) {
      repairs.push(`Dropped an earlier ${supersededRole} insertion because the same transaction supplied a later owner.`);
      continue;
    }

    const replacedDescendants = effectiveOperation.op === "set-html"
      ? semanticDescendants(effectiveOperation.targetId, input.semanticSnapshot)
      : new Set<string>();
    const invalidDuplicates = effectiveOperation.op === "set-html" && !input.semanticSnapshot?.length
      ? []
      : ids.filter((id) => knownNodes.has(id) && !replacedDescendants.has(id));

    // set-html replaces the target's children. Reusing semantic identities that
    // already belong to that exact subtree is therefore a valid in-place
    // reconstruction, not a duplicate insertion. This is what allows a model to
    // rebuild presentation/header/synthesis structure without the compiler
    // deleting the transaction merely because those stable IDs already exist.
    if (effectiveOperation.op === "set-html") {
      if (invalidDuplicates.length > 0) {
        repairs.push(`Dropped set-html for “${effectiveOperation.targetId}” containing semantic ids owned outside the replaced subtree: ${invalidDuplicates.slice(0, 6).join(", ")}.`);
        continue;
      }
      for (const [role, owner] of singletonOwners) {
        if (replacedDescendants.has(owner)) singletonOwners.delete(role);
      }
    } else if (invalidDuplicates.length > 0) {
      if (rootId && knownNodes.has(rootId) && !PROTECTED_ROOTS.has(rootId)) {
        const committedFingerprint = browserNodes.get(rootId)?.subtreeFingerprint;
        const proposedFingerprint = semanticFingerprintFromMarkup(normalizedMarkup);
        if (committedFingerprint && committedFingerprint === proposedFingerprint) {
          repairs.push(`Dropped semantically identical replacement of “${rootId}”.`);
          continue;
        }
        if (!removedRoots.has(rootId)) {
          operations.push({ op: "remove", targetId: rootId });
          removedRoots.add(rootId);
          knownNodes.delete(rootId);
          repairs.push(`Converted changed duplicate insert of “${rootId}” into an atomic remove-and-reinsert update.`);
        }
      } else {
        repairs.push(`Dropped insert containing duplicate semantic ids: ${invalidDuplicates.slice(0, 4).join(", ")}.`);
        continue;
      }
    }

    for (const role of incomingSingletonRoles) {
      const existingOwner = singletonOwners.get(role);
      if (!existingOwner || existingOwner === rootId) continue;
      if (PROTECTED_ROOTS.has(existingOwner)) {
        repairs.push(`Dropped ${role} insertion because its canonical owner is the protected structural root “${existingOwner}”.`);
        continue;
      }
      if (!removedRoots.has(existingOwner)) {
        operations.push({ op: "remove", targetId: existingOwner });
        removedRoots.add(existingOwner);
        knownNodes.delete(existingOwner);
        repairs.push(`Replaced canonical singleton role “${role}” by removing its previous owner “${existingOwner}” atomically.`);
      }
      singletonOwners.delete(role);
    }

    if (/data-ns-relationship-id/i.test(normalizedMarkup)) {
      try {
        const insertedNodes = new Set(ids);
        const relationshipExistingNodes = new Set(knownNodes);
        for (const nodeId of replacedDescendants) relationshipExistingNodes.delete(nodeId);
        const relationships = validateNorthstarSemanticRelationships({
          markup: normalizedMarkup,
          existingNodeIds: relationshipExistingNodes,
          insertedNodeIds: insertedNodes,
          existingRelationshipIds: knownRelationships,
        });
        for (const relationship of relationships) knownRelationships.add(relationship.id);
      } catch (error) {
        repairs.push(
          `Dropped one invalid optional relationship operation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
    }

    if (effectiveOperation.op === "set-html") {
      for (const nodeId of replacedDescendants) knownNodes.delete(nodeId);
    }
    if (pendingSlotOperation) {
      operations.push(pendingSlotOperation);
      for (const id of semanticIds(pendingSlotOperation.html)) knownNodes.add(id);
      repairs.push(`Created stable analytical slot “${effectiveOperation.targetId}” directly beneath “${pendingSlotOperation.targetId}”.`);
    }
    const operation = effectiveOperation as NorthstarArtboardMutationOperation;
    operations.push(operation);
    for (const id of ids) knownNodes.add(id);
    if (rootId) for (const role of incomingSingletonRoles) singletonOwners.set(role, rootId);
  }

  const guarded = input.creativeSourceAuthority
    ? { operations, repairs: [] as string[] }
    : addAnalyticalCommunicationReflow({
        source: operations,
        previous: input.previous,
        semanticSnapshot: input.semanticSnapshot,
      });
  repairs.push(...guarded.repairs);
  const structuralContracts = input.creativeSourceAuthority
    ? { operations: guarded.operations, repairs: [] as string[] }
    : normalizeStructuralPrimitiveContracts(
        repairedDraft.requiredPrimitives,
        guarded.operations,
      );
  repairs.push(...structuralContracts.repairs);
  const availableAfterCompilation = simulateAvailableNodeIds({
    previous: input.previous,
    operations: structuralContracts.operations,
    semanticSnapshot: input.semanticSnapshot,
    authoritativeNodeIds: input.authoritativeNodeIds,
  });
  const fidelityFailures = input.creativeSourceAuthority
    ? []
    : primitiveFidelityFailures(repairedDraft, structuralContracts.operations, availableAfterCompilation, input.semanticSnapshot);
  const exactPrimitiveFailures = input.creativeSourceAuthority
    ? []
    : requiredPrimitiveFailures(
        repairedDraft.requiredPrimitives,
        structuralContracts.operations,
        availableAfterCompilation,
        input.semanticSnapshot,
      );
  const namedPromiseFailures = input.creativeSourceAuthority
    ? []
    : namedPromiseContractFailures(
        repairedDraft,
        repairedDraft.requiredPrimitives,
        structuralContracts.operations,
      );

  // Prose promises and global fidelity heuristics are creative-review signals, not
  // transaction authorities. Exact typed primitive contracts remain attributable
  // to one primitive ID and can therefore degrade or block independently.
  if (fidelityFailures.length > 0) {
    repairs.push(...fidelityFailures.map((message) => `CREATIVE_FIDELITY_ADVISORY: ${message}`));
  }
  if (namedPromiseFailures.length > 0) {
    repairs.push(...namedPromiseFailures.map((message) => `NAMED_PROMISE_ADVISORY: ${message}`));
  }

  if (exactPrimitiveFailures.length > 0) {
    const detail = `PRIMITIVE_REALIZATION_INVARIANT_FAILED: ${exactPrimitiveFailures.map((failure) => `${failure.primitiveId}: ${failure.message}`).join(" ")}`;
    const degradation = degradablePrimitiveSet(input.draft.requiredPrimitives, exactPrimitiveFailures);
    if (degradation.essentialFailures.length > 0) {
      return compilationResult(
        { ...repairedDraft, operations: [] },
        [...repairs, detail],
        exactPrimitiveFailures.map((failure) => ({
          code: failure.code,
          severity: degradation.essentialFailures.some((primitive) => primitive.id === failure.primitiveId) ? "hard" as const : "repairable" as const,
          message: `${failure.primitiveId}: ${failure.message}`,
        })),
      );
    }
    if (input.allowOptionalPrimitiveDegradation !== false && degradation.removed.length > 0) {
      const degraded = compileNorthstarMutationDraft({
        ...input,
        draft: {
          ...input.draft,
          requiredPrimitives: degradation.remaining,
        },
        allowOptionalPrimitiveDegradation: false,
      });
      return compilationResult(
        degraded.draft,
        [
          ...repairs,
          detail,
          `Removed only unresolved optional primitive bindings: ${degradation.removed.map((primitive) => primitive.id).join(", ")}.`,
          ...degraded.repairs,
        ],
        [
          ...exactPrimitiveFailures.map((failure) => ({
            code: failure.code,
            severity: "repairable" as const,
            message: `${failure.primitiveId}: ${failure.message}`,
          })),
          ...degraded.diagnostics,
        ],
      );
    }
    return compilationResult(
      { ...repairedDraft, operations: [] },
      [...repairs, detail],
      exactPrimitiveFailures.map((failure) => ({
        code: failure.code,
        severity: "repairable" as const,
        message: `${failure.primitiveId}: ${failure.message}`,
      })),
    );
  }

  const filtered = filterDeterministicNoOps(input.previous, structuralContracts.operations, input.semanticSnapshot);
  if (filtered.skipped > 0) {
    repairs.push(`Skipped ${filtered.skipped} deterministic no-op operation${filtered.skipped === 1 ? "" : "s"} before browser dispatch.`);
  }

  const phaseMatch = `${initiallyRepaired.draft.title} ${initiallyRepaired.draft.description} ${initiallyRepaired.draft.visualStrategy}`.match(/\b(evidence|analysis|recommendation|refinement)\b/i);
  const inferredPhase = (phaseMatch?.[1]?.toLowerCase() ?? "analysis") as "evidence" | "analysis" | "recommendation" | "refinement";
  const materialityIssues = validateNorthstarStageMateriality({ phase: inferredPhase, operations: filtered.operations });
  if (materialityIssues.length > 0) {
    repairs.push(...materialityIssues.map((issue) => `MATERIALITY_UNDERSPECIFIED: ${issue}`));
    return compilationResult(
      { ...repairedDraft, operations: [] },
      repairs,
      materialityIssues.map((message) => ({ code: "MATERIALITY_UNDERSPECIFIED", severity: "repairable" as const, message })),
    );
  }

  const constructionPlan = compileConstructionPlan(repairedDraft, filtered.operations, input.semanticSnapshot);
  repairs.push(`Compiled ${constructionPlan.beats.length} browser-owned construction beats (${constructionPlan.mode}, ${constructionPlan.totalDurationMs}ms) over one atomic final-state transaction.`);

  return compilationResult(
    {
      ...repairedDraft,
      operations: filtered.operations,
      constructionPlan,
    },
    repairs,
  );
}
