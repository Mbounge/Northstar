// lib/canvas-ai/northstar-semantic-layout.ts
// Northstar Canvas vNext — semantic artifact blueprint and deterministic layout scaffolding.

import {
  getNorthStarComponentContract,
  type NorthStarCanvasDensity,
  type NorthStarComponentPreset,
} from "./northstar-design-system";

export type NorthStarArtifactAudience =
  | "general"
  | "executive"
  | "product"
  | "design"
  | "research"
  | "operations"
  | "sales"
  | "marketing";

export type NorthStarArtifactType =
  | "comparison-board"
  | "journey-map"
  | "screenshot-analysis"
  | "strategy-board"
  | "research-map"
  | "roadmap"
  | "causal-map"
  | "storyboard"
  | "dashboard"
  | "operating-model"
  | "market-map"
  | "decision-tree"
  | "design-board"
  | "workflow"
  | "product-concept"
  | "freeform";

export type NorthStarArtifactZoneKind =
  | "decision"
  | "comparison"
  | "evidence"
  | "reasoning"
  | "sources"
  | "next-steps"
  | "freeform";

export interface NorthStarLayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NorthStarSemanticComponentBlueprint {
  id: string;
  preset: NorthStarComponentPreset;
  title: string;
  subtitle?: string;
  body?: string;
  density?: NorthStarCanvasDensity;
  evidenceIds?: string[];
  appName?: string;
  flowName?: string;
  priority?: number;
  children?: NorthStarSemanticComponentBlueprint[];
  region?: NorthStarLayoutRect;
}

export interface NorthStarArtifactZoneBlueprint {
  id: string;
  kind: NorthStarArtifactZoneKind;
  title: string;
  description?: string;
  density?: NorthStarCanvasDensity;
  components: NorthStarSemanticComponentBlueprint[];
  region?: NorthStarLayoutRect;
}

export interface NorthStarUnifiedArtifactBlueprint {
  version: "northstar.canvas.unified-artifact.v1";
  artifactId: string;
  artifactType: NorthStarArtifactType;
  title: string;
  subtitle?: string;
  objective: string;
  audience: NorthStarArtifactAudience;
  density: NorthStarCanvasDensity;
  visualStrategy: string;
  mainTakeaway: string;
  zones: NorthStarArtifactZoneBlueprint[];
}

export interface NorthStarLayoutOptions {
  canvasWidth?: number;
  canvasHeight?: number;
  margin?: number;
  gap?: number;
  minReadableTextPx?: number;
}

export interface NorthStarPositionedComponent extends NorthStarSemanticComponentBlueprint {
  absoluteRect: NorthStarLayoutRect;
  zoneId: string;
  zoneKind: NorthStarArtifactZoneKind;
}

export interface NorthStarPositionedArtifact {
  blueprint: NorthStarUnifiedArtifactBlueprint;
  canvas: { width: number; height: number; margin: number; gap: number };
  positionedZones: Array<NorthStarArtifactZoneBlueprint & { absoluteRect: NorthStarLayoutRect }>;
  positionedComponents: NorthStarPositionedComponent[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix: string, value: string) {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item"}`;
}

function rectFromPercent(region: NorthStarLayoutRect, width: number, height: number): NorthStarLayoutRect {
  return {
    x: (region.x / 100) * width,
    y: (region.y / 100) * height,
    w: (region.w / 100) * width,
    h: (region.h / 100) * height,
  };
}

function inset(rect: NorthStarLayoutRect, value: number): NorthStarLayoutRect {
  return { x: rect.x + value, y: rect.y + value, w: Math.max(1, rect.w - value * 2), h: Math.max(1, rect.h - value * 2) };
}

function defaultZonesForArtifact(type: NorthStarArtifactType): Array<Pick<NorthStarArtifactZoneBlueprint, "kind" | "title" | "region">> {
  if (type === "comparison-board" || type === "journey-map") {
    return [
      { kind: "decision", title: "Decision", region: { x: 0, y: 0, w: 100, h: 18 } },
      { kind: "comparison", title: "Comparison", region: { x: 0, y: 18, w: 100, h: 45 } },
      { kind: "evidence", title: "Evidence", region: { x: 0, y: 63, w: 68, h: 37 } },
      { kind: "reasoning", title: "Reasoning", region: { x: 68, y: 63, w: 32, h: 37 } },
    ];
  }
  if (type === "product-concept" || type === "design-board") {
    return [
      { kind: "decision", title: "Direction", region: { x: 0, y: 0, w: 34, h: 35 } },
      { kind: "evidence", title: "Reference Evidence", region: { x: 34, y: 0, w: 66, h: 35 } },
      { kind: "comparison", title: "Concept", region: { x: 0, y: 35, w: 70, h: 65 } },
      { kind: "reasoning", title: "Design Rationale", region: { x: 70, y: 35, w: 30, h: 65 } },
    ];
  }
  return [
    { kind: "decision", title: "Answer", region: { x: 0, y: 0, w: 100, h: 20 } },
    { kind: "evidence", title: "Evidence", region: { x: 0, y: 20, w: 60, h: 50 } },
    { kind: "reasoning", title: "Reasoning", region: { x: 60, y: 20, w: 40, h: 50 } },
    { kind: "next-steps", title: "Next Steps", region: { x: 0, y: 70, w: 100, h: 30 } },
  ];
}

export function createUnifiedArtifactBlueprint(input: {
  artifactId?: string;
  artifactType: NorthStarArtifactType;
  title: string;
  subtitle?: string;
  objective: string;
  audience?: NorthStarArtifactAudience;
  density?: NorthStarCanvasDensity;
  mainTakeaway?: string;
  visualStrategy?: string;
  apps?: Array<{ name: string; flowName?: string; evidenceIds?: string[] }>;
  evidenceIds?: string[];
  recommendations?: string[];
  hypotheses?: string[];
}): NorthStarUnifiedArtifactBlueprint {
  const artifactId = input.artifactId ?? makeId("artifact", input.title);
  const zones = defaultZonesForArtifact(input.artifactType).map((zone, index): NorthStarArtifactZoneBlueprint => ({
    id: `${artifactId}-zone-${index + 1}-${zone.kind}`,
    kind: zone.kind,
    title: zone.title,
    density: input.density ?? "balanced",
    region: zone.region,
    components: [],
  }));

  const decisionZone = zones.find((zone) => zone.kind === "decision");
  const comparisonZone = zones.find((zone) => zone.kind === "comparison");
  const evidenceZone = zones.find((zone) => zone.kind === "evidence");
  const reasoningZone = zones.find((zone) => zone.kind === "reasoning");
  const nextZone = zones.find((zone) => zone.kind === "next-steps");

  decisionZone?.components.push({
    id: `${artifactId}-executive-summary`,
    preset: input.audience === "executive" ? "executive-summary" : "recommendation-block",
    title: input.mainTakeaway || input.title,
    subtitle: input.subtitle,
    body: input.recommendations?.slice(0, 3).join("\n") || "Decision-ready synthesis grounded in the selected evidence.",
    density: input.density ?? "balanced",
    priority: 100,
  });

  for (const app of input.apps ?? []) {
    comparisonZone?.components.push({
      id: `${artifactId}-flow-${makeId("app", app.name)}`,
      preset: "reference-flow",
      title: app.name,
      subtitle: app.flowName,
      body: `Ordered reference flow for ${app.name}.`,
      appName: app.name,
      flowName: app.flowName,
      evidenceIds: app.evidenceIds ?? [],
      density: input.density === "compact" ? "compact" : "balanced",
      priority: 90,
    });
  }

  comparisonZone?.components.push({
    id: `${artifactId}-comparison-matrix`,
    preset: "comparison-matrix",
    title: "Comparison matrix",
    body: "Equivalent dimensions, edge, and implication.",
    density: input.density ?? "balanced",
    priority: 75,
  });

  evidenceZone?.components.push({
    id: `${artifactId}-evidence-strip`,
    preset: "evidence-strip",
    title: "Evidence highlights",
    body: "Curated proof moments that materially support the decision.",
    evidenceIds: input.evidenceIds ?? [],
    density: input.density ?? "balanced",
    priority: 70,
  });

  evidenceZone?.components.push({
    id: `${artifactId}-source-ledger`,
    preset: "source-ledger",
    title: "Source ledger",
    body: "Source, relevance, and summary.",
    evidenceIds: input.evidenceIds ?? [],
    density: "compact",
    priority: 50,
  });

  reasoningZone?.components.push({
    id: `${artifactId}-research-trail`,
    preset: "research-trail",
    title: "Research trail",
    body: "What Northstar inspected, accepted, rejected, and decided.",
    density: "compact",
    priority: 60,
  });

  if (input.hypotheses?.length) {
    reasoningZone?.components.push({
      id: `${artifactId}-hypotheses`,
      preset: "hypothesis-panel",
      title: "Hypotheses tested",
      body: input.hypotheses.slice(0, 5).join("\n"),
      density: "compact",
      priority: 45,
    });
  }

  nextZone?.components.push({
    id: `${artifactId}-next-steps`,
    preset: "decision-card",
    title: "Next steps",
    body: input.recommendations?.slice(0, 4).join("\n") || "Convert the recommendation into a test plan, owner, and timeline.",
    density: "compact",
    priority: 40,
  });

  return {
    version: "northstar.canvas.unified-artifact.v1",
    artifactId,
    artifactType: input.artifactType,
    title: input.title,
    subtitle: input.subtitle,
    objective: input.objective,
    audience: input.audience ?? "general",
    density: input.density ?? "balanced",
    visualStrategy:
      input.visualStrategy ||
      "Create one coherent artifact where the decision, comparison, evidence, and reasoning trail are visually connected and inspectable.",
    mainTakeaway: input.mainTakeaway || input.title,
    zones,
  };
}

function layoutComponentsInZone(
  zone: NorthStarArtifactZoneBlueprint,
  zoneRect: NorthStarLayoutRect,
  gap: number,
): NorthStarPositionedComponent[] {
  const sorted = [...zone.components].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (sorted.length === 0) return [];
  const padded = inset(zoneRect, gap);
  const result: NorthStarPositionedComponent[] = [];

  if (zone.kind === "comparison") {
    let y = padded.y;
    const flowComponents = sorted.filter((component) => component.preset === "reference-flow" || component.preset === "flow-lane");
    const otherComponents = sorted.filter((component) => !flowComponents.includes(component));
    const flowHeight = flowComponents.length > 1 ? Math.min(270, (padded.h * 0.62) / flowComponents.length) : Math.min(310, padded.h * 0.52);
    flowComponents.forEach((component) => {
      result.push({ ...component, zoneId: zone.id, zoneKind: zone.kind, absoluteRect: { x: padded.x, y, w: padded.w, h: Math.max(getNorthStarComponentContract(component.preset).minHeight, flowHeight) } });
      y += flowHeight + gap;
    });
    const remainingH = Math.max(160, padded.y + padded.h - y);
    otherComponents.forEach((component, index) => {
      const width = padded.w / Math.max(1, otherComponents.length) - gap;
      result.push({
        ...component,
        zoneId: zone.id,
        zoneKind: zone.kind,
        absoluteRect: { x: padded.x + index * (width + gap), y, w: width, h: remainingH },
      });
    });
    return result;
  }

  if (zone.kind === "evidence" && sorted.length > 1) {
    const firstH = Math.round(padded.h * 0.58);
    result.push({ ...sorted[0], zoneId: zone.id, zoneKind: zone.kind, absoluteRect: { x: padded.x, y: padded.y, w: padded.w, h: firstH } });
    const rest = sorted.slice(1);
    const restH = padded.h - firstH - gap;
    rest.forEach((component, index) => {
      const width = padded.w / rest.length - gap;
      result.push({ ...component, zoneId: zone.id, zoneKind: zone.kind, absoluteRect: { x: padded.x + index * (width + gap), y: padded.y + firstH + gap, w: width, h: restH } });
    });
    return result;
  }

  if (zone.kind === "decision") {
    const columns = sorted.length > 1 ? Math.min(2, sorted.length) : 1;
    const width = padded.w / columns - gap;
    sorted.forEach((component, index) => {
      result.push({ ...component, zoneId: zone.id, zoneKind: zone.kind, absoluteRect: { x: padded.x + (index % columns) * (width + gap), y: padded.y, w: width, h: padded.h } });
    });
    return result;
  }

  const totalGap = gap * (sorted.length - 1);
  const rowH = Math.max(1, (padded.h - totalGap) / sorted.length);
  sorted.forEach((component, index) => {
    const contract = getNorthStarComponentContract(component.preset);
    result.push({
      ...component,
      zoneId: zone.id,
      zoneKind: zone.kind,
      absoluteRect: {
        x: padded.x,
        y: padded.y + index * (rowH + gap),
        w: padded.w,
        h: Math.max(contract.minHeight, rowH),
      },
    });
  });
  return result;
}

export function layoutUnifiedArtifact(
  blueprint: NorthStarUnifiedArtifactBlueprint,
  options: NorthStarLayoutOptions = {},
): NorthStarPositionedArtifact {
  const canvasWidth = options.canvasWidth ?? 1600;
  const canvasHeight = options.canvasHeight ?? 1080;
  const margin = options.margin ?? 32;
  const gap = options.gap ?? 18;
  const innerWidth = canvasWidth - margin * 2;
  const innerHeight = canvasHeight - margin * 2;

  const positionedZones = blueprint.zones.map((zone) => {
    const region = zone.region ?? { x: 0, y: 0, w: 100, h: 100 / Math.max(1, blueprint.zones.length) };
    const raw = rectFromPercent(region, innerWidth, innerHeight);
    return {
      ...zone,
      absoluteRect: {
        x: margin + raw.x,
        y: margin + raw.y,
        w: clamp(raw.w - gap, 1, innerWidth),
        h: clamp(raw.h - gap, 1, innerHeight),
      },
    };
  });

  const positionedComponents = positionedZones.flatMap((zone) => layoutComponentsInZone(zone, zone.absoluteRect, gap));

  return {
    blueprint,
    canvas: { width: canvasWidth, height: canvasHeight, margin, gap },
    positionedZones,
    positionedComponents,
  };
}

export function summarizePositionedArtifact(artifact: NorthStarPositionedArtifact): string {
  const zoneCount = artifact.positionedZones.length;
  const componentCount = artifact.positionedComponents.length;
  const evidenceComponents = artifact.positionedComponents.filter((component) => getNorthStarComponentContract(component.preset).supportsEvidence).length;
  return `Unified artifact ${artifact.blueprint.title} has ${zoneCount} zones, ${componentCount} semantic components, and ${evidenceComponents} evidence-aware components.`;
}
