import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import type { CanvasV2SelectionPolicy } from "@/lib/canvas-v2/working-context";

export const CANVAS_V2_INTERACTION_SCHEMA = "canvas-v2.interaction.v1" as const;

export type CanvasV2InteractionRoute =
  | "conversation"
  | "inspect"
  | "transform"
  | "research-design"
  | "selection-transform";

export type CanvasV2ResearchMode = "evidence" | "synthesis";

export interface CanvasV2InteractionDecision {
  schema: typeof CANVAS_V2_INTERACTION_SCHEMA;
  route: CanvasV2InteractionRoute;
  summary: string;
  answer?: string;
  canvasInstruction?: string;
  selectionPolicy?: CanvasV2SelectionPolicy;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
}

const ROUTES = new Set<CanvasV2InteractionRoute>([
  "conversation",
  "inspect",
  "transform",
  "research-design",
  "selection-transform",
]);

function requiredString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Canvas V2 router requires ${label}.`);
  return value.trim().slice(0, maximum);
}

function researchTargets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const targets = new Map<string, string>();
  for (const entry of value.slice(0, 12)) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const target = entry.trim().slice(0, 160);
    const key = target.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key && !targets.has(key)) targets.set(key, target);
  }
  return Array.from(targets.values());
}

export function parseCanvasV2InteractionDecision(
  value: unknown,
  userMessage: string,
  selection?: CanvasV2InspectableElement,
  selections?: readonly CanvasV2InspectableElement[],
): CanvasV2InteractionDecision {
  if (!value || typeof value !== "object") throw new Error("Canvas V2 router returned an invalid decision.");
  const input = value as Record<string, unknown>;
  if (typeof input.route !== "string" || !ROUTES.has(input.route as CanvasV2InteractionRoute)) throw new Error("Canvas V2 router returned an unknown route.");
  const route = input.route as CanvasV2InteractionRoute;
  if (route === "selection-transform" && !selection) throw new Error("Select an canvas element before requesting a selection-specific change.");
  const summary = requiredString(input.summary, "a concise route summary", 600);
  if (route === "conversation" || route === "inspect") {
    return {
      schema: CANVAS_V2_INTERACTION_SCHEMA,
      route,
      summary,
      answer: requiredString(input.answer, "a chat answer", 8_000),
    };
  }
  let canvasInstruction = typeof input.canvasInstruction === "string" && input.canvasInstruction.trim()
    ? input.canvasInstruction.trim().slice(0, 8_000)
    : userMessage.trim().slice(0, 8_000);
  if (!canvasInstruction) throw new Error("Canvas V2 router requires a canvas instruction.");
  if (route === "selection-transform" && selection) {
    const activeSelection = selections?.length ? selections : [selection];
    const selectionPolicy: CanvasV2SelectionPolicy = input.selectionPolicy === "reference" ? "reference" : "modify";
    canvasInstruction += selectionPolicy === "reference"
      ? `\n\nUse the selected stable canvas node${activeSelection.length === 1 ? "" : "s"} only as explicit references for the requested new work. Preserve every selected object exactly. Selected objects: ${JSON.stringify(activeSelection)}.`
      : `\n\nTransform only the selected stable canvas node${activeSelection.length === 1 ? "" : "s"} as one coherent user selection. Preserve every unselected object and preserve selected geometry unless the request explicitly changes it. Selected objects: ${JSON.stringify(activeSelection)}.`;
    return {
      schema: CANVAS_V2_INTERACTION_SCHEMA,
      route,
      summary,
      canvasInstruction,
      selectionPolicy,
    };
  }
  return {
    schema: CANVAS_V2_INTERACTION_SCHEMA,
    route,
    summary,
    canvasInstruction,
    selectionPolicy: "none",
    ...(route === "research-design" ? {
      researchTargets: researchTargets(input.researchTargets),
      researchMode: input.researchMode === "evidence" ? "evidence" : "synthesis",
    } : {}),
  };
}

export function canvasV2RouteMutatesCanvas(route: CanvasV2InteractionRoute): boolean {
  return route === "transform" || route === "research-design" || route === "selection-transform";
}

/**
 * Routing may clarify an instruction, but it is not allowed to rewrite the
 * research object. Preserve the user's exact words alongside any paraphrase so
 * deterministic app/flow selection still sees terms such as onboarding,
 * browsing, mobile, web, and explicitly named taxonomy paths.
 */
export function canvasV2AuthoritativeCanvasInstruction(message: string, routedInstruction: string): string {
  const original = message.trim();
  const routed = routedInstruction.trim();
  if (!original) return routed;
  const comparableOriginal = original.replace(/\s+/g, " ").toLowerCase();
  const comparableRouted = routed.replace(/\s+/g, " ").toLowerCase();
  return comparableRouted.includes(comparableOriginal)
    ? routed
    : `${routed}\n\nAuthoritative user request (preserve exact product and journey scope): ${original}`;
}
