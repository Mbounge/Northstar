// Northstar Semantic Relationship Intelligence v0.4.9.1

export type NorthstarRelationshipType =
  | "causal"
  | "comparative"
  | "contrastive"
  | "evidentiary"
  | "sequential"
  | "synthesis";

export type NorthstarRelationshipRoute =
  | "straight"
  | "elbow"
  | "soft-curve"
  | "bracket"
  | "shared-spine"
  | "converging"
  | "diverging";

export interface NorthstarSemanticRelationship {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: NorthstarRelationshipType;
  meaning: string;
  confidence: number;
  priority: "primary" | "secondary" | "supporting";
  route: NorthstarRelationshipRoute;
  label?: string;
}

const TYPES = new Set<NorthstarRelationshipType>([
  "causal", "comparative", "contrastive", "evidentiary", "sequential", "synthesis",
]);
const ROUTES = new Set<NorthstarRelationshipRoute>([
  "straight", "elbow", "soft-curve", "bracket", "shared-spine", "converging", "diverging",
]);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/;

function normalizeConfidence(raw: string | number | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1 && raw <= 100) return Math.max(0.5, Math.min(1, raw / 100));
    return Math.max(0.5, Math.min(1, raw));
  }
  const value = String(raw ?? "").trim();
  if (!value) return 0.65;
  const percentage = value.endsWith("%");
  const parsed = Number(value.replace("%", ""));
  if (!Number.isFinite(parsed)) return 0.65;
  const normalized = percentage || parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0.5, Math.min(1, normalized));
}


const TYPE_ALIASES: Record<string, NorthstarRelationshipType> = {
  cause: "causal",
  causes: "causal",
  "leads-to": "causal",
  dependency: "causal",
  compare: "comparative",
  comparison: "comparative",
  parallel: "comparative",
  contrast: "contrastive",
  tension: "contrastive",
  opposition: "contrastive",
  opposes: "contrastive",
  evidence: "evidentiary",
  supports: "evidentiary",
  support: "evidentiary",
  proof: "evidentiary",
  "evidence-supports": "evidentiary",
  sequence: "sequential",
  flow: "sequential",
  progression: "sequential",
  summary: "synthesis",
  recommendation: "synthesis",
  conclusion: "synthesis",
  convergence: "synthesis",
};

const ROUTE_ALIASES: Record<string, NorthstarRelationshipRoute> = {
  curve: "soft-curve",
  curved: "soft-curve",
  bezier: "soft-curve",
  orthogonal: "elbow",
  spine: "shared-spine",
  shared: "shared-spine",
  converge: "converging",
  convergence: "converging",
  diverge: "diverging",
  divergence: "diverging",
};

function normalizeRelationshipType(raw: string | undefined): NorthstarRelationshipType {
  const value = String(raw ?? "").trim().toLowerCase();
  if (TYPES.has(value as NorthstarRelationshipType)) return value as NorthstarRelationshipType;
  return TYPE_ALIASES[value] ?? "evidentiary";
}

function normalizeRelationshipRoute(raw: string | undefined): NorthstarRelationshipRoute {
  const value = String(raw ?? "").trim().toLowerCase();
  if (ROUTES.has(value as NorthstarRelationshipRoute)) return value as NorthstarRelationshipRoute;
  return ROUTE_ALIASES[value] ?? "soft-curve";
}

export function normalizeNorthstarRelationshipMarkup(markup: string): string {
  return String(markup ?? "")
    .replace(
      /data-ns-relationship-type\s*=\s*(["'])([^"']*)\1/gi,
      (_match, quote: string, value: string) =>
        `data-ns-relationship-type=${quote}${normalizeRelationshipType(value)}${quote}`,
    )
    .replace(
      /data-ns-route\s*=\s*(["'])([^"']*)\1/gi,
      (_match, quote: string, value: string) =>
        `data-ns-route=${quote}${normalizeRelationshipRoute(value)}${quote}`,
    )
    .replace(
      /data-ns-confidence\s*=\s*(["'])([^"']*)\1/gi,
      (_match, quote: string, value: string) =>
        `data-ns-confidence=${quote}${normalizeConfidence(value)}${quote}`,
    )
    .replace(
      /data-ns-priority\s*=\s*(["'])([^"']*)\1/gi,
      (_match, quote: string, value: string) => {
        const normalized = ["primary", "secondary", "supporting"].includes(value.trim().toLowerCase())
          ? value.trim().toLowerCase()
          : "secondary";
        return `data-ns-priority=${quote}${normalized}${quote}`;
      },
    );
}

function attrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag))) result[match[1].toLowerCase()] = match[2].trim();
  return result;
}

export function extractNorthstarSemanticRelationships(markup: string): NorthstarSemanticRelationship[] {
  const relationships: NorthstarSemanticRelationship[] = [];
  const pattern = /<[^>]+data-ns-relationship-id\s*=\s*["'][^"']+["'][^>]*>/gi;
  for (const tag of markup.match(pattern) ?? []) {
    const value = attrs(tag);
    const type = normalizeRelationshipType(value["data-ns-relationship-type"]);
    const route = normalizeRelationshipRoute(value["data-ns-route"]);
    relationships.push({
      id: value["data-ns-relationship-id"] || "",
      sourceNodeId: value["data-ns-source-id"] || "",
      targetNodeId: value["data-ns-target-id"] || "",
      type,
      meaning: value["data-ns-meaning"] || "",
      confidence: normalizeConfidence(value["data-ns-confidence"]),
      priority: (value["data-ns-priority"] || "secondary") as NorthstarSemanticRelationship["priority"],
      route,
      label: value["data-ns-label"] || undefined,
    });
  }
  return relationships;
}

export function validateNorthstarSemanticRelationships(input: {
  markup: string;
  existingNodeIds: Set<string>;
  insertedNodeIds?: Set<string>;
  existingRelationshipIds?: Set<string>;
}): NorthstarSemanticRelationship[] {
  const relationships = extractNorthstarSemanticRelationships(input.markup);
  const available = new Set([...input.existingNodeIds, ...(input.insertedNodeIds ?? [])]);
  const seen = new Set(input.existingRelationshipIds ?? []);
  for (const relationship of relationships) {
    if (!ID.test(relationship.id)) throw new Error("A relationship requires a stable data-ns-relationship-id.");
    if (seen.has(relationship.id)) throw new Error(`Relationship “${relationship.id}” already exists; update or remove it instead of duplicating it.`);
    seen.add(relationship.id);
    if (!ID.test(relationship.sourceNodeId) || !available.has(relationship.sourceNodeId)) {
      throw new Error(`Relationship “${relationship.id}” has an unresolved source node “${relationship.sourceNodeId}”.`);
    }
    if (!ID.test(relationship.targetNodeId) || !available.has(relationship.targetNodeId)) {
      throw new Error(`Relationship “${relationship.id}” has an unresolved target node “${relationship.targetNodeId}”.`);
    }
    if (relationship.sourceNodeId === relationship.targetNodeId) throw new Error(`Relationship “${relationship.id}” cannot connect a node to itself.`);
    if (!TYPES.has(relationship.type)) throw new Error(`Relationship “${relationship.id}” needs a valid semantic relationship type.`);
    if (!ROUTES.has(relationship.route)) throw new Error(`Relationship “${relationship.id}” needs a supported route grammar.`);
    if (relationship.meaning.length < 12) throw new Error(`Relationship “${relationship.id}” needs a precise data-ns-meaning explanation.`);
    relationship.confidence = normalizeConfidence(relationship.confidence);
  }
  return relationships;
}

export function relationshipIdsFromMarkup(markup: string): string[] {
  return extractNorthstarSemanticRelationships(markup).map((relationship) => relationship.id);
}

export function relationshipInventory(markupSources: string[]): NorthstarSemanticRelationship[] {
  const byId = new Map<string, NorthstarSemanticRelationship>();
  for (const source of markupSources) {
    for (const relationship of extractNorthstarSemanticRelationships(source)) byId.set(relationship.id, relationship);
  }
  return Array.from(byId.values());
}

export const NORTHSTAR_RELATIONSHIP_RENDERING_CONTRACT = `
RELATIONSHIP FIDELITY
- A visual relationship is allowed only when it has data-ns-relationship-id, data-ns-relationship-type, data-ns-source-id, data-ns-target-id, data-ns-meaning, data-ns-confidence, data-ns-priority, and data-ns-route.
- Relationship types are causal, comparative, contrastive, evidentiary, sequential, or synthesis.
- Route grammars are straight, elbow, soft-curve, bracket, shared-spine, converging, or diverging.
- Endpoints must be stable existing semantic nodes. Never use invented coordinates as the semantic source of truth.
- Lines, pills, labels, and markers must read as one system. A label belongs to a relationship, not to empty space.
- Prefer real app icons and grounded product assets as actors in maps and diagrams when they improve recognition.
- Qualitative maps must explicitly say they are interpretive and must explain their axes.
- Do not create generic dots, anonymous pills, arbitrary dashed diagonals, or connector crossings through important content.
- Use relationships sparingly: one primary relationship system is stronger than many competing marks.
- Confidence accepts 0–1 values, percentages, or 0–100 values; the runtime normalizes harmless formatting differences instead of rejecting the whole visual move.
- Prefer surprising, problem-specific relationship grammars when they improve comprehension; never collapse every problem into rows plus cards.
`.trim();
