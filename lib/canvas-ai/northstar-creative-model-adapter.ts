import type {
  NorthstarEmergentCreativeActDraft,
  NorthstarEmergentCreativeCritiqueDraft,
} from "@/lib/canvas-ai/northstar-emergent-creative-authorship";
import type {
  NorthstarIndependentCreativeReviewDraft,
} from "@/lib/canvas-ai/northstar-independent-creative-review";
import type {
  NorthstarEmergentDesignIntelligenceDraft,
} from "@/lib/canvas-ai/northstar-emergent-design-intelligence";
import type {
  NorthstarCreativeClosureAdjudicationDraft,
} from "@/lib/canvas-ai/northstar-creative-closure-adjudication";

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
  formDesignIntelligence(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarEmergentDesignIntelligenceDraft>;
  authorCreativeAct(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarEmergentCreativeActDraft>;
  critiqueRenderedAct(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarEmergentCreativeCritiqueDraft>;
  reviewCreativeArtifact(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarIndependentCreativeReviewDraft>;
  adjudicateCreativeClosure(
    request: NorthstarCreativeAuthoringRequest,
  ): Promise<NorthstarCreativeClosureAdjudicationDraft>;
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
