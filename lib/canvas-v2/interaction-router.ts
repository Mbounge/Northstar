import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import type { CanvasV2SelectionPolicy } from "@/lib/canvas-v2/working-context";
import {
  parseCanvasV2InquiryInterpretation,
  type CanvasV2DiscoveryState,
  type CanvasV2InquiryInterpretation,
} from "@/lib/canvas-v2/discovery-state";
import { assertCanvasV2UserFacingLanguage } from "@/lib/canvas-v2/presentation-language";

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
  inquiry?: CanvasV2InquiryInterpretation;
  discoveryState?: CanvasV2DiscoveryState;
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

const GENERIC_RESEARCH_TARGET_TERMS = new Set([
  "app", "apps", "browsing", "capture", "comparison", "desktop", "evidence", "flow", "flows", "journey", "journeys",
  "mobile", "onboarding", "product", "products", "research", "screen", "screens", "screenshot", "screenshots", "session", "user", "web",
]);

function normalizedTargetTerms(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

/**
 * The semantic router may identify products, but it may not quietly choose a
 * catalog flow the person never named. Exact flow selection belongs to the
 * deterministic catalog ranker, which can honor session scope and completeness
 * without turning a model guess such as "Awin — Links" into an authoritative
 * retrieval target.
 */
export function canvasV2ResearchTargetSupportedByUserMessage(target: string, userMessage: string): boolean {
  const messageTerms = new Set(normalizedTargetTerms(userMessage));
  const distinctiveTargetTerms = normalizedTargetTerms(target).filter((term) => !GENERIC_RESEARCH_TARGET_TERMS.has(term));
  return distinctiveTargetTerms.length > 0 && distinctiveTargetTerms.every((term) => messageTerms.has(term));
}

function researchTargets(value: unknown, userMessage: string): string[] {
  if (!Array.isArray(value)) return [];
  const targets = new Map<string, string>();
  for (const entry of value.slice(0, 12)) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const target = entry.trim().slice(0, 160);
    if (!canvasV2ResearchTargetSupportedByUserMessage(target, userMessage)) continue;
    const key = target.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key && !targets.has(key)) targets.set(key, target);
  }
  return Array.from(targets.values());
}

/**
 * The model still owns semantic routing. This narrow guard only protects a
 * research-design decision from dropping an explicit request to consult the
 * public web. Without it, a well-routed current-source prompt can arrive at
 * discovery with account/canvas sources only and proceed from model memory.
 */
export function canvasV2ExplicitExternalResearchRequested(message: string): boolean {
  return /\b(?:internet|web[- ]search|search (?:on |the )?web|browse (?:on |the )?web|public[- ]web|external (?:research|discovery|evidence|sources?))\b/i.test(message)
    || /\b(?:official|public|primary) sources?\b/i.test(message)
    || /\b(?:current|latest|recent|today'?s?)\b[^.!?\n]{0,100}\b(?:market|competitor|industry|landscape|official source|public source)\b/i.test(message);
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
  assertCanvasV2UserFacingLanguage(summary, "The route summary", userMessage);
  if (route === "conversation" || route === "inspect") {
    return {
      schema: CANVAS_V2_INTERACTION_SCHEMA,
      route,
      summary,
      answer: requiredString(input.answer, "a chat answer", 8_000),
    };
  }
  const inquiry = parseCanvasV2InquiryInterpretation(input.inquiry, userMessage);
  const normalizedInquiry = route === "research-design" && canvasV2ExplicitExternalResearchRequested(userMessage)
    ? {
        ...inquiry,
        evidenceNeed: "required" as const,
        sourceCategories: Array.from(new Set([...inquiry.sourceCategories, "external" as const])).slice(0, 5),
      }
    : inquiry;
  let canvasInstruction = typeof input.canvasInstruction === "string" && input.canvasInstruction.trim()
    ? input.canvasInstruction.trim().slice(0, 8_000)
    : userMessage.trim().slice(0, 8_000);
  if (!canvasInstruction) throw new Error("Canvas V2 router requires a canvas instruction.");
  assertCanvasV2UserFacingLanguage(canvasInstruction, "The routed canvas instruction", userMessage);
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
      inquiry: normalizedInquiry,
    };
  }
  return {
    schema: CANVAS_V2_INTERACTION_SCHEMA,
    route,
    summary,
    canvasInstruction,
    selectionPolicy: "none",
    inquiry: normalizedInquiry,
    ...(route === "research-design" ? {
      researchTargets: researchTargets(input.researchTargets, userMessage),
      researchMode: input.researchMode === "evidence" ? "evidence" : "synthesis",
    } : {}),
  };
}

export function canvasV2RouteMutatesCanvas(route: CanvasV2InteractionRoute): boolean {
  return route === "transform" || route === "research-design" || route === "selection-transform";
}

const CANVAS_V2_AUTHORITATIVE_USER_REQUEST_MARKER = "Authoritative user request (preserve exact product and journey scope):";

/**
 * Return the human-authored request that is allowed to establish binding
 * product, journey, and spatial scope. Router prose may clarify the task for a
 * model, but it must not manufacture authority the person never supplied.
 */
export function canvasV2AuthoritativeUserRequest(instruction: string): string {
  const markerIndex = instruction.lastIndexOf(CANVAS_V2_AUTHORITATIVE_USER_REQUEST_MARKER);
  return markerIndex >= 0
    ? instruction.slice(markerIndex + CANVAS_V2_AUTHORITATIVE_USER_REQUEST_MARKER.length).trim()
    : instruction.trim();
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
    : `${routed}\n\n${CANVAS_V2_AUTHORITATIVE_USER_REQUEST_MARKER} ${original}`;
}
