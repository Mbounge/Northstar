//lib/canvas-ai/northstar-mutation-compiler.ts
// Northstar v0.7.1.2 — compile-correct evidence-safe analytical placement and whole-board creative safety compiler.
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
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

const PROTECTED_ROOTS = new Set(["artboard", "__root__", "header", "evidence", "synthesis", "decision"]);

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
  return /data-ns-(?:annotation|relationship)-id|data-ns-role\s*=\s*["'][^"']*(?:axis|spine|marker|callout|annotation|friction|tension|milestone|relationship)|(?:class|data-ns-node-id)\s*=\s*["'][^"']*(?:axis|spine|marker|callout|annotation|friction|tension|milestone|relationship)/i.test(source);
}

function analysisPlacementMode(markup: string): NorthstarAnalysisPlacementMode | undefined {
  const value = String(markup ?? "").match(/data-ns-analysis-placement\s*=\s*["']([^"']+)["']/i)?.[1] as NorthstarAnalysisPlacementMode | undefined;
  return value && ANALYTICAL_PLACEMENT_MODES.has(value) ? value : undefined;
}

function containsFreehandAnalyticalGeometry(value: string): boolean {
  const source = String(value ?? "");
  if (!/(?:axis|spine|marker|callout|annotation|friction|tension|milestone|relationship|label)/i.test(source)) return false;
  return /position\s*:\s*(?:absolute|fixed)|(?:left|right|top|bottom|inset)\s*:\s*-?\d+(?:\.\d+)?%/i.test(source);
}

function validateAnalyticalPlacement(input: { markup: string; targetId: string }): { allowed: boolean; reason?: string } {
  if (!looksLikeAnalyticalMarkup(input.markup)) return { allowed: true };
  const mode = analysisPlacementMode(input.markup);
  if (!mode) {
    return { allowed: false, reason: "Dropped analytical insertion without a declared data-ns-analysis-placement mode." };
  }
  if (containsFreehandAnalyticalGeometry(input.markup)) {
    return { allowed: false, reason: `Dropped ${mode} analytical insertion because it used freehand absolute or percentage positioning.` };
  }
  if (mode === "external-relationship" && !/data-ns-relationship-id/i.test(input.markup)) {
    return { allowed: false, reason: "Dropped external-relationship analytical insertion without typed semantic relationship markup." };
  }
  if (mode === "inter-row-lane" && !/^(?:evidence|synthesis|decision)$/i.test(input.targetId)) {
    return { allowed: false, reason: `Dropped inter-row-lane insertion because target “${input.targetId}” is not a structural analytical region.` };
  }
  if (mode === "margin-lane" && /(?:screen|image|sequence)$/i.test(input.targetId)) {
    return { allowed: false, reason: `Dropped margin-lane insertion because target “${input.targetId}” is inside protected evidence structure.` };
  }
  return { allowed: true };
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
  const meaningfulStructure = draft.operations.some((operation) => operation.op === "insert-html" || operation.op === "move" || operation.op === "remove" || operation.op === "set-html");
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
      if (operation.op === "insert-html" || operation.op === "set-html") ingest(operation.html);
      else if (operation.op === "remove") {
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
      if (operation.op === "insert-html" || operation.op === "set-html") {
        for (const id of semanticIds(operation.html)) ids.add(id);
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

type CommittedMutationState = {
  text: Map<string, string>;
  attributes: Map<string, Map<string, string | null>>;
  styles: Map<string, Map<string, string | null>>;
  classes: Map<string, Set<string>>;
  parent: Map<string, { parentId: string; beforeId?: string }>;
  cssLayers: Map<string, string>;
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
    cssLayers: new Map(),
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
      } else if (operation.op === "set-css-layer") {
        state.cssLayers.set(operation.layerId, operation.css.trim());
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
    } else if (operation.op === "set-css-layer") {
      noOp = state.cssLayers.get(operation.layerId) === operation.css.trim();
      if (!noOp) state.cssLayers.set(operation.layerId, operation.css.trim());
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

function committedRelationshipIds(previous: NorthstarGeneratedCodeArtifactPackage): Set<string> {
  const markup = [
    previous.document.html,
    ...(previous.mutationJournal ?? []).flatMap((batch) =>
      batch.operations.flatMap((operation) =>
        operation.op === "insert-html" || operation.op === "set-html" ? [operation.html] : []
      )
    ),
  ];
  return new Set(relationshipInventory(markup).map((relationship) => relationship.id));
}

export function compileNorthstarMutationDraft(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  draft: NorthstarArtboardMutationDraft;
  semanticSnapshot?: NorthstarCommittedSemanticNode[];
}): { draft: NorthstarArtboardMutationDraft; repairs: string[] } {
  const initiallyRepaired = repairNorthstarArtboardMutationDraft(input.draft);
  const repairs = [...initiallyRepaired.repairs];
  if (isCssOnlyStructuralClaim(initiallyRepaired.draft)) {
    return {
      draft: { ...initiallyRepaired.draft, operations: [] },
      repairs: [...repairs, "Rejected a CSS-only structural concept claim; major visual architecture requires semantic nodes and explicit composition operations."],
    };
  }
  const knownNodes = committedSemanticIds(input.previous);
  const browserNodes = semanticSnapshotMap(input.semanticSnapshot);
  for (const nodeId of browserNodes.keys()) knownNodes.add(nodeId);
  const knownRelationships = committedRelationshipIds(input.previous);
  const singletonOwners = committedSingletonOwners(input.previous);
  const operations: NorthstarArtboardMutationOperation[] = [];
  const removedRoots = new Set<string>();
  const lastSingletonOperationIndex = new Map<NorthstarSingletonRole, number>();
  initiallyRepaired.draft.operations.forEach((operation, index) => {
    if (operation.op !== "insert-html" && operation.op !== "set-html") return;
    for (const role of singletonRoles(operation.html)) lastSingletonOperationIndex.set(role, index);
  });

  for (const [operationIndex, rawOperation] of initiallyRepaired.draft.operations.entries()) {
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
    const normalizedMarkup = normalizeNorthstarRelationshipMarkup(spatiallyValidated.markup);
    const placementValidation = validateAnalyticalPlacement({ markup: normalizedMarkup, targetId: rawOperation.targetId });
    if (!placementValidation.allowed) {
      repairs.push(placementValidation.reason || "Dropped one unsafe analytical placement operation.");
      continue;
    }
    const ids = semanticIds(normalizedMarkup);
    const duplicates = ids.filter((id) => knownNodes.has(id));
    const rootId = ids[0];
    const incomingSingletonRoles = singletonRoles(normalizedMarkup);
    const supersededRole = incomingSingletonRoles.find(
      (role) => lastSingletonOperationIndex.get(role) !== operationIndex,
    );
    if (supersededRole) {
      repairs.push(`Dropped an earlier ${supersededRole} insertion because the same transaction supplied a later owner.`);
      continue;
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

    if (duplicates.length > 0) {
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
        repairs.push(`Dropped insert containing duplicate semantic ids: ${duplicates.slice(0, 4).join(", ")}.`);
        continue;
      }
    }

    if (/data-ns-relationship-id/i.test(normalizedMarkup)) {
      try {
        const insertedNodes = new Set(ids);
        const relationships = validateNorthstarSemanticRelationships({
          markup: normalizedMarkup,
          existingNodeIds: knownNodes,
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

    const operation = { ...rawOperation, html: normalizedMarkup } as NorthstarArtboardMutationOperation;
    operations.push(operation);
    for (const id of ids) knownNodes.add(id);
    if (rootId) for (const role of incomingSingletonRoles) singletonOwners.set(role, rootId);
  }

  const filtered = filterDeterministicNoOps(input.previous, operations, input.semanticSnapshot);
  if (filtered.skipped > 0) {
    repairs.push(`Skipped ${filtered.skipped} deterministic no-op operation${filtered.skipped === 1 ? "" : "s"} before browser dispatch.`);
  }

  const phaseMatch = `${initiallyRepaired.draft.title} ${initiallyRepaired.draft.description} ${initiallyRepaired.draft.visualStrategy}`.match(/\b(evidence|analysis|recommendation|refinement)\b/i);
  const inferredPhase = (phaseMatch?.[1]?.toLowerCase() ?? "analysis") as "evidence" | "analysis" | "recommendation" | "refinement";
  const materialityIssues = validateNorthstarStageMateriality({ phase: inferredPhase, operations: filtered.operations });
  if (materialityIssues.length > 0) {
    repairs.push(...materialityIssues);
    return { draft: { ...initiallyRepaired.draft, operations: [] }, repairs };
  }

  return {
    draft: {
      ...initiallyRepaired.draft,
      operations: filtered.operations,
    },
    repairs,
  };
}
