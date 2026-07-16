import {
  NORTHSTAR_CODE_ARTIFACT_SCHEMA,
  type CanvasCodeArtifactPayload,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_RUNTIME_PROTOTYPE_VERSION = "0.1.4" as const;

export const PROTOTYPE_ARTIFACT_SOURCE_TSX = String.raw`
import type { PrototypeComparisonArtifactProps } from "@northstar/runtime";

export default function AwinWhopComparison({ data }: PrototypeComparisonArtifactProps) {
  return (
    <NorthstarArtifact title="Awin vs. Whop onboarding">
      <ExecutiveTakeaway
        eyebrow="Executive comparison"
        title="Awin builds confidence. Whop builds momentum."
        description="The strongest onboarding direction combines Awin's early trust and value framing with Whop's faster account progression."
      />

      <JourneyComparison
        left={{ app: "Awin", strategy: "Trust-first", screens: data.awin }}
        right={{ app: "Whop", strategy: "Momentum-first", screens: data.whop }}
      />

      <DecisionGrid
        dimensions={data.dimensions}
        recommendation="Lead with a clear economic promise, establish trust with proof, then move into a short account path without repetitive verification."
      />

      <ResearchTrail
        evidenceCount={20}
        presentedCount={8}
        caveat="Captured screens show experience design, not conversion performance."
      />
    </NorthstarArtifact>
  );
}
`.trim();

export function createPrototypeCodeArtifactPayload(): CanvasCodeArtifactPayload {
  const now = new Date().toISOString();
  const artifactId = `prototype-${Date.now().toString(36)}`;

  return {
    schema: NORTHSTAR_CODE_ARTIFACT_SCHEMA,
    artifactId,
    revisionId: `${artifactId}-r1`,
    title: "Awin vs. Whop — runtime prototype",
    description:
      "Patch 1 proof that a React-authored Northstar experience can live as one native canvas object.",
    runtimeUrl: `/api/canvas-artifacts/prototype?artifactId=${encodeURIComponent(artifactId)}`,
    sourceTsx: PROTOTYPE_ARTIFACT_SOURCE_TSX,
    status: "ready",
    createdAt: now,
    updatedAt: now,
    preferredWidth: 1440,
    preferredHeight: 1080,
    minimumWidth: 720,
    minimumHeight: 540,
    buildState: {
      phase: "complete",
      completedSteps: 5,
      totalSteps: 5,
      message: "Prototype artifact ready",
      isBuilding: false,
    },
  };
}
