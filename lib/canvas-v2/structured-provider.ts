import {
  canvasV2ProviderForModel,
  type CanvasV2ModelProvider,
} from "@/lib/canvas-v2/model-catalog";
import type { CanvasV2ProviderRequestAudit } from "@/lib/canvas-v2/request-reliability";

export interface CanvasV2ModelInputImage {
  mimeType: string;
  data: string;
  /** `auto` is intentionally representable so the cost guard can reject it. */
  detail?: "low" | "high" | "auto" | "original";
  purpose?: "whole-board-overview" | "canonical-evidence-detail" | "focused-island" | "surrounding-island" | "reference";
}

export type CanvasV2ModelInputPart =
  | { text: string }
  | { inlineData: CanvasV2ModelInputImage };

export interface CanvasV2StructuredModelRequest {
  model: string;
  system: string;
  parts: readonly CanvasV2ModelInputPart[];
  schemaName: string;
  schema: object;
  maxOutputTokens: number;
  /** OpenAI reasoning effort. Google providers ignore this field. */
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  temperature?: number;
  correction?: string;
  /** OpenAI Responses tools. Tool-bearing research calls are OpenAI-only. */
  tools?: ReadonlyArray<Record<string, unknown>>;
  toolChoice?: "auto" | "required";
  include?: readonly string[];
  /** Per-call visual budget. Canvas V2 never needs an unbounded image bundle. */
  maxInputImages?: number;
  /** Includes system instructions and the strict JSON schema before image tokens. */
  maxTextCharacters?: number;
  /** Stable role/schema namespace; dynamic revision IDs must never enter this key. */
  cacheNamespace?: string;
}

function strictOpenAIJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictOpenAIJsonSchema);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output = Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, strictOpenAIJsonSchema(entry)]));
  if (output.type === "object" && output.properties && typeof output.properties === "object" && !Array.isArray(output.properties)) {
    output.additionalProperties = false;
    output.required = Object.keys(output.properties as Record<string, unknown>);
  }
  return output;
}

function openAIContent(parts: readonly CanvasV2ModelInputPart[], correction?: string) {
  const content: Array<Record<string, unknown>> = [];
  for (const part of parts) {
    if ("text" in part) content.push({ type: "input_text", text: part.text });
    else content.push({
      type: "input_image",
      image_url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
      // GPT-5.6 preserves original dimensions for auto detail. A low-detail
      // overview plus one or two deliberate high-detail crops retains visual
      // judgment without turning a canvas observation into long context.
      detail: part.inlineData.detail ?? "low",
    });
  }
  if (correction) content.push({
    type: "input_text",
    text: `STRUCTURAL REPAIR REQUIRED. Your preceding draft was not committed. The exact validator failure was:\n${correction}\nReturn a corrected response for the same current revision. Treat the validator failure as authoritative. Preserve only fields and authored decisions that the failure did not reject. If it rejects the intended move, target territory, completion choice, or patch content, replace that rejected part rather than repeating it. Fix the exact failure and do not explain the repair.`,
  });
  return content;
}

function encodedBytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(data.length * 3 / 4) - padding);
}

function cacheNamespace(value: string): string {
  return `northstar-v2-${value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 44)}`.slice(0, 64);
}

function requestAudit(input: CanvasV2StructuredModelRequest): CanvasV2ProviderRequestAudit {
  const images = input.parts.filter((part): part is { inlineData: CanvasV2ModelInputImage } => "inlineData" in part);
  const details = images.map((part) => part.inlineData.detail ?? "low");
  const correctionCharacters = input.correction?.length ?? 0;
  const textCharacters = input.system.length
    + JSON.stringify(input.schema).length
    + input.parts.reduce((sum, part) => sum + ("text" in part ? part.text.length : 0), 0)
    + correctionCharacters;
  return {
    textCharacters,
    imageCount: images.length,
    encodedImageBytes: images.reduce((sum, part) => sum + encodedBytes(part.inlineData.data), 0),
    imageDetails: {
      low: details.filter((detail) => detail === "low").length,
      high: details.filter((detail) => detail === "high").length,
      auto: details.filter((detail) => detail === "auto").length,
      original: details.filter((detail) => detail === "original").length,
    },
    promptCacheMode: "explicit",
    cacheNamespace: cacheNamespace(input.cacheNamespace ?? input.schemaName),
  };
}

function assertRequestBudget(input: CanvasV2StructuredModelRequest, audit: CanvasV2ProviderRequestAudit): void {
  const maxInputImages = Math.max(0, input.maxInputImages ?? 3);
  const maxTextCharacters = Math.max(24_000, input.maxTextCharacters ?? 240_000);
  if (audit.imageCount > maxInputImages) {
    throw new Error(`Canvas V2 provider preflight rejected ${audit.imageCount} images; this ${input.schemaName} call permits at most ${maxInputImages}.`);
  }
  if (audit.textCharacters > maxTextCharacters) {
    throw new Error(`Canvas V2 provider preflight rejected ${audit.textCharacters} text characters; compact ${input.schemaName} below ${maxTextCharacters} before calling the model.`);
  }
  if (audit.imageDetails.auto || audit.imageDetails.original) {
    throw new Error("Canvas V2 provider preflight forbids auto/original image detail. Use one low-detail overview and only decision-relevant high-detail crops.");
  }
}

export function buildCanvasV2StructuredProviderRequest(input: CanvasV2StructuredModelRequest): {
  provider: CanvasV2ModelProvider;
  url: string;
  init: RequestInit;
  audit: CanvasV2ProviderRequestAudit;
} {
  const provider = canvasV2ProviderForModel(input.model);
  const audit = requestAudit(input);
  assertRequestBudget(input, audit);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    return {
      provider,
      url: "https://api.openai.com/v1/responses",
      audit,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          model: input.model,
          instructions: input.system,
          input: [{ role: "user", content: [
            {
              type: "input_text",
              text: `North Star Canvas V2 stable ${input.schemaName} request contract.`,
              prompt_cache_breakpoint: { mode: "explicit" },
            },
            ...openAIContent(input.parts, input.correction),
          ] }],
          prompt_cache_key: audit.cacheNamespace,
          prompt_cache_options: { mode: "explicit", ttl: "30m" },
          max_output_tokens: input.maxOutputTokens,
          ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort, context: "current_turn" } } : {}),
          ...(input.tools?.length ? { tools: input.tools } : {}),
          ...(input.toolChoice ? { tool_choice: input.toolChoice } : {}),
          ...(input.include?.length ? { include: input.include } : {}),
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: input.schemaName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
              strict: true,
              schema: strictOpenAIJsonSchema(input.schema),
            },
          },
        }),
      },
    };
  }

  if (input.tools?.length || input.toolChoice || input.include?.length) {
    throw new Error("Canvas V2 tool-bearing research is currently supported only by OpenAI models.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  return {
    provider,
    url: `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
    audit: { ...audit, promptCacheMode: "none", cacheNamespace: undefined },
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [
          ...input.parts.map((part) => "text" in part
            ? part
            : { inlineData: { mimeType: part.inlineData.mimeType, data: part.inlineData.data } }),
          ...(input.correction ? [{ text: `STRUCTURAL REPAIR REQUIRED. Your preceding draft was not committed. The exact validator failure was:\n${input.correction}\nTreat the validator failure as authoritative. Preserve only fields and authored decisions it did not reject. Replace any intended move, target territory, completion choice, or patch content it explicitly rejects instead of repeating it. Return a corrected response only.` }] : []),
        ] }],
        generationConfig: {
          temperature: input.temperature,
          maxOutputTokens: input.maxOutputTokens,
          responseMimeType: "application/json",
          responseJsonSchema: input.schema,
        },
      }),
    },
  };
}

export function extractCanvasV2StructuredText(payload: unknown, model: string): string {
  const provider = canvasV2ProviderForModel(model);
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (provider === "google") {
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const candidate = candidates[0] && typeof candidates[0] === "object" ? candidates[0] as Record<string, unknown> : {};
    const content = candidate.content && typeof candidate.content === "object" ? candidate.content as Record<string, unknown> : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.map((part) => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string"
      ? String((part as Record<string, unknown>).text)
      : "").join("");
  }

  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const entry = part as Record<string, unknown>;
      if (entry.type === "output_text" && typeof entry.text === "string") texts.push(entry.text);
      if (entry.type === "refusal" && typeof entry.refusal === "string") throw new Error("The selected model declined this design request.");
    }
  }
  return texts.join("");
}
