import {
  canvasV2ProviderForModel,
  type CanvasV2ModelProvider,
} from "@/lib/canvas-v2/model-catalog";

export type CanvasV2ModelInputPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

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
      detail: "auto",
    });
  }
  if (correction) content.push({
    type: "input_text",
    text: `STRUCTURAL REPAIR REQUIRED. Your preceding draft was not committed. The exact validator failure was:\n${correction}\nReturn a corrected response for the same current revision. Treat the validator failure as authoritative. Preserve only fields and authored decisions that the failure did not reject. If it rejects the intended move, target territory, completion choice, or patch content, replace that rejected part rather than repeating it. Fix the exact failure and do not explain the repair.`,
  });
  return content;
}

export function buildCanvasV2StructuredProviderRequest(input: CanvasV2StructuredModelRequest): {
  provider: CanvasV2ModelProvider;
  url: string;
  init: RequestInit;
} {
  const provider = canvasV2ProviderForModel(input.model);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    return {
      provider,
      url: "https://api.openai.com/v1/responses",
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
          input: [{ role: "user", content: openAIContent(input.parts, input.correction) }],
          max_output_tokens: input.maxOutputTokens,
          ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  return {
    provider,
    url: `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [
          ...input.parts,
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
