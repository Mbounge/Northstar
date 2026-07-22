import type { NorthstarTurnModelAdapter } from "@/lib/canvas-ai/northstar-turn-protocol";
import { NorthstarTurnProviderError } from "@/lib/canvas-ai/northstar-turn-executor";

export interface CreateNorthstarGeminiTurnModelInput {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "")
      .join("");
    if (text.trim()) return text;
  }
  return "";
}

function parseJSON(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(normalized);
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3_600_000, Math.ceil(seconds * 1_000));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.min(3_600_000, date - Date.now()));
}

export function createNorthstarGeminiTurnModel(
  input: CreateNorthstarGeminiTurnModelInput,
): NorthstarTurnModelAdapter {
  const model = input.model ?? "gemini-3.1-flash-lite";
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!input.apiKey.trim()) throw new TypeError("A Gemini API key is required.");

  return {
    async generateJSON(request) {
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": input.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `${request.systemInstruction}\n\nReturn JSON conforming to this response contract:\n${JSON.stringify(request.responseSchema)}`,
              }],
            },
            contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
            generationConfig: {
              temperature: request.temperature,
              maxOutputTokens: request.maxOutputTokens,
              responseMimeType: "application/json",
            },
          }),
          cache: "no-store",
          signal: request.signal,
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as
          | { error?: { message?: unknown; status?: unknown; code?: unknown } }
          | null;
        const message = typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Gemini returned HTTP ${response.status}.`;
        const providerCode = typeof payload?.error?.status === "string"
          ? payload.error.status
          : typeof payload?.error?.code === "number"
            ? String(payload.error.code)
            : `HTTP_${response.status}`;
        throw new NorthstarTurnProviderError({
          code: providerCode,
          message,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
        });
      }

      const payload = await response.json().catch(() => null);
      const text = extractText(payload);
      if (!text.trim()) {
        throw new NorthstarTurnProviderError({
          code: "EMPTY_MODEL_RESPONSE",
          message: "Gemini returned no structured response text.",
          retryable: true,
        });
      }
      try {
        return parseJSON(text);
      } catch (error) {
        throw new NorthstarTurnProviderError({
          code: "INVALID_MODEL_JSON",
          message: error instanceof Error ? error.message : "Gemini returned invalid JSON.",
          retryable: false,
        });
      }
    },
  };
}
