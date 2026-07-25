import type {
  NorthstarEmergentCreativeActDraft,
  NorthstarEmergentCreativeCritiqueDraft,
} from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import type {
  NorthstarIndependentCreativeReviewDraft,
} from "@/lib/canvas-ai/northstar-independent-creative-review";

export type NorthstarCreativeModelPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface NorthstarCreativeAuthoringRequest {
  systemInstruction: string;
  parts: NorthstarCreativeModelPart[];
  signal: AbortSignal;
  maxOutputTokens: number;
  temperature: number;
}

export interface NorthstarCreativeModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  authorCreativeAct(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarEmergentCreativeActDraft>;
  critiqueRenderedAct(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarEmergentCreativeCritiqueDraft>;
  reviewCreativeArtifact(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarIndependentCreativeReviewDraft>;
}

export interface NorthstarCreativeJsonCall {
  apiKey: string;
  systemInstruction: string;
  contents: Array<{
    role: "user" | "model";
    parts: NorthstarCreativeModelPart[];
  }>;
  schema: unknown;
  signal: AbortSignal;
  maxOutputTokens: number;
  temperature?: number;
}

export type NorthstarCreativeJsonGenerator = <T>(
  request: NorthstarCreativeJsonCall,
) => Promise<T>;
