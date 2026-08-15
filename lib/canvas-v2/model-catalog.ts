export const CANVAS_V2_DEFAULT_MODEL = "gpt-5.6-luna" as const;

export const CANVAS_V2_SELECTABLE_MODELS = [
  CANVAS_V2_DEFAULT_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
] as const;

export type CanvasV2ModelProvider = "openai" | "google";
export type CanvasV2ModelSelection = (typeof CANVAS_V2_SELECTABLE_MODELS)[number];

export interface CanvasV2ModelCatalogEntry {
  id: string;
  label: string;
  provider: CanvasV2ModelProvider;
  enabled: boolean;
  selectable: boolean;
  description: string;
  disabledReason?: string;
}

/**
 * The client may display the expensive models as a future-facing cost guard,
 * but the server allowlist below makes them impossible to execute. A disabled
 * menu item is never treated as an authorization boundary.
 */
export const CANVAS_V2_MODEL_CATALOG: readonly CanvasV2ModelCatalogEntry[] = [
  {
    id: CANVAS_V2_DEFAULT_MODEL,
    label: "GPT-5.6 Luna",
    provider: "openai",
    enabled: true,
    selectable: true,
    description: "Fast, economical visual authorship",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "google",
    enabled: true,
    selectable: true,
    description: "Economical Google visual authorship",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    provider: "google",
    enabled: true,
    selectable: true,
    description: "Fast lightweight Google authorship",
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "google",
    enabled: true,
    selectable: true,
    description: "Balanced Google visual reasoning",
  },
  {
    id: "gemini-3.7-flash",
    label: "Gemini 3.7 Flash",
    provider: "google",
    enabled: true,
    selectable: true,
    description: "Latest fast Google visual reasoning",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    enabled: false,
    selectable: false,
    description: "Higher-cost OpenAI model",
    disabledReason: "Disabled by North Star's cost guard",
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    enabled: false,
    selectable: false,
    description: "Frontier OpenAI model",
    disabledReason: "Disabled by North Star's cost guard",
  },
] as const;

const OPENAI_EXECUTION_ALLOWLIST = new Set<string>([CANVAS_V2_DEFAULT_MODEL]);
const GOOGLE_EXECUTION_ALLOWLIST = new Set<string>([
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
]);

export function parseCanvasV2ModelSelection(value: unknown): CanvasV2ModelSelection {
  return CANVAS_V2_SELECTABLE_MODELS.includes(value as CanvasV2ModelSelection)
    ? value as CanvasV2ModelSelection
    : CANVAS_V2_DEFAULT_MODEL;
}

export function canvasV2ProviderForModel(model: string): CanvasV2ModelProvider {
  if (OPENAI_EXECUTION_ALLOWLIST.has(model)) return "openai";
  if (GOOGLE_EXECUTION_ALLOWLIST.has(model)) return "google";
  throw new Error(`Canvas V2 model is not executable under the active cost policy: ${model}.`);
}

/**
 * Telemetry and generic reliability tests may describe a model that is not in
 * North Star's execution catalog. Observability must never become an execution
 * authorization check, so unknown providers are simply omitted from audits.
 */
export function canvasV2ProviderForModelIfKnown(model: string): CanvasV2ModelProvider | undefined {
  if (OPENAI_EXECUTION_ALLOWLIST.has(model)) return "openai";
  if (GOOGLE_EXECUTION_ALLOWLIST.has(model)) return "google";
  return undefined;
}

export function assertCanvasV2ExecutableModel(model: string): void {
  canvasV2ProviderForModel(model);
}

/** A selected run stays pinned and never silently changes provider or cost tier. */
export function canvasV2DesignModelChain(selection: CanvasV2ModelSelection): readonly string[] {
  assertCanvasV2ExecutableModel(selection);
  return [selection];
}

export function canvasV2ModelLabel(model: string | undefined): string {
  if (!model) return "GPT-5.6 Luna";
  return CANVAS_V2_MODEL_CATALOG.find((entry) => entry.id === model)?.label
    ?? model.replace(/^gemini-/i, "Gemini ").replaceAll("-", " ");
}
