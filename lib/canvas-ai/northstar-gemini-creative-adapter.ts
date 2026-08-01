import {
  NORTHSTAR_EMERGENT_CREATIVE_ACT_JSON_SCHEMA,
  NORTHSTAR_EMERGENT_CREATIVE_CRITIQUE_JSON_SCHEMA,
  type NorthstarEmergentCreativeActDraft,
  type NorthstarEmergentCreativeCritiqueDraft,
} from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import {
  NORTHSTAR_INDEPENDENT_CREATIVE_REVIEW_JSON_SCHEMA,
  type NorthstarIndependentCreativeReviewDraft,
} from "@/lib/canvas-ai/northstar-independent-creative-review";
import type {
  NorthstarCreativeJsonGenerator,
  NorthstarCreativeModelAdapter,
} from "@/lib/canvas-ai/northstar-creative-model-adapter";
import {
  NORTHSTAR_CREATIVE_CLOSURE_ADJUDICATION_JSON_SCHEMA,
  type NorthstarCreativeClosureAdjudicationDraft,
} from "@/lib/canvas-ai/northstar-creative-closure-adjudication";
import {
  NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_JSON_SCHEMA,
  type NorthstarEmergentDesignIntelligenceDraft,
} from "@/lib/canvas-ai/northstar-emergent-design-intelligence";

export function createNorthstarGeminiCreativeAdapter(input: {
  apiKey: string;
  modelId: string;
  generateJson: NorthstarCreativeJsonGenerator;
}): NorthstarCreativeModelAdapter {
  return {
    providerId: "google",
    modelId: input.modelId,
    formDesignIntelligence: (request) => input.generateJson<NorthstarEmergentDesignIntelligenceDraft>({
      apiKey: input.apiKey,
      systemInstruction: request.systemInstruction,
      contents: [{ role: "user", parts: request.parts }],
      schema: NORTHSTAR_EMERGENT_DESIGN_INTELLIGENCE_JSON_SCHEMA,
      signal: request.signal,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      thinkingLevel: request.thinkingLevel,
    }),
    authorCreativeAct: (request) => input.generateJson<NorthstarEmergentCreativeActDraft>({
      apiKey: input.apiKey,
      systemInstruction: request.systemInstruction,
      contents: [{ role: "user", parts: request.parts }],
      schema: NORTHSTAR_EMERGENT_CREATIVE_ACT_JSON_SCHEMA,
      signal: request.signal,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      thinkingLevel: request.thinkingLevel,
    }),
    critiqueRenderedAct: (request) => input.generateJson<NorthstarEmergentCreativeCritiqueDraft>({
      apiKey: input.apiKey,
      systemInstruction: request.systemInstruction,
      contents: [{ role: "user", parts: request.parts }],
      schema: NORTHSTAR_EMERGENT_CREATIVE_CRITIQUE_JSON_SCHEMA,
      signal: request.signal,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      thinkingLevel: request.thinkingLevel,
    }),
    reviewCreativeArtifact: (request) => input.generateJson<NorthstarIndependentCreativeReviewDraft>({
      apiKey: input.apiKey,
      systemInstruction: request.systemInstruction,
      contents: [{ role: "user", parts: request.parts }],
      schema: NORTHSTAR_INDEPENDENT_CREATIVE_REVIEW_JSON_SCHEMA,
      signal: request.signal,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      thinkingLevel: request.thinkingLevel,
    }),
    adjudicateCreativeClosure: (request) => input.generateJson<NorthstarCreativeClosureAdjudicationDraft>({
      apiKey: input.apiKey,
      systemInstruction: request.systemInstruction,
      contents: [{ role: "user", parts: request.parts }],
      schema: NORTHSTAR_CREATIVE_CLOSURE_ADJUDICATION_JSON_SCHEMA,
      signal: request.signal,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      thinkingLevel: request.thinkingLevel,
    }),
  };
}
