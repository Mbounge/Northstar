import {
  NORTHSTAR_CODE_ARTIFACT_SCHEMA,
  NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
  type CanvasCodeArtifactPayload,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_DIRECT_BOOTSTRAP_VERSION = "1" as const;

const BOOTSTRAP_HTML = String.raw`
<main data-ns-node-id="northstar-artboard" class="northstar-bootstrap">
  <header data-ns-node-id="northstar-header" class="northstar-bootstrap__header">
    <p data-ns-node-id="northstar-eyebrow" class="northstar-bootstrap__eyebrow">Northstar artboard</p>
    <h1 data-ns-node-id="northstar-title" class="northstar-bootstrap__title">Ready to build a grounded visual story.</h1>
    <p data-ns-node-id="northstar-deck" class="northstar-bootstrap__deck">Research, analysis, and visual authorship will appear here as verified commits.</p>
  </header>
  <section data-ns-node-id="northstar-workspace" class="northstar-bootstrap__workspace" aria-label="Northstar working area">
    <article data-ns-node-id="northstar-status-card" class="northstar-bootstrap__card">
      <span data-ns-node-id="northstar-status-label" class="northstar-bootstrap__label">Architecture status</span>
      <strong data-ns-node-id="northstar-status-value" class="northstar-bootstrap__value">Awaiting the first bounded activity</strong>
    </article>
    <article data-ns-node-id="northstar-evidence-card" class="northstar-bootstrap__card northstar-bootstrap__card--muted">
      <span data-ns-node-id="northstar-evidence-label" class="northstar-bootstrap__label">Evidence trail</span>
      <p data-ns-node-id="northstar-evidence-value" class="northstar-bootstrap__copy">Verified source material and conclusions will accumulate without replacing the mounted artboard.</p>
    </article>
  </section>
</main>
`.trim();

const BOOTSTRAP_CSS = String.raw`
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f4f1ff;
  color: #17151f;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-width: 100%; min-height: 100%; background: #f4f1ff; }
body { padding: 0; }
.northstar-bootstrap {
  width: 1120px;
  min-height: 720px;
  display: grid;
  align-content: start;
  gap: 36px;
  padding: 64px;
  border-radius: 32px;
  background:
    radial-gradient(circle at 88% 2%, rgba(111, 79, 255, 0.20), transparent 34%),
    linear-gradient(145deg, #ffffff 0%, #f7f4ff 100%);
  box-shadow: 0 28px 90px rgba(54, 40, 112, 0.16);
}
.northstar-bootstrap__header { max-width: 860px; display: grid; gap: 16px; }
.northstar-bootstrap__eyebrow,
.northstar-bootstrap__label {
  margin: 0;
  color: #6b4eff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.northstar-bootstrap__title {
  margin: 0;
  max-width: 820px;
  font-size: 56px;
  line-height: 1.02;
  letter-spacing: -0.045em;
}
.northstar-bootstrap__deck {
  margin: 0;
  max-width: 720px;
  color: #575060;
  font-size: 21px;
  line-height: 1.55;
}
.northstar-bootstrap__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}
.northstar-bootstrap__card {
  min-height: 190px;
  display: grid;
  align-content: space-between;
  gap: 22px;
  padding: 28px;
  border: 1px solid rgba(107, 78, 255, 0.20);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
}
.northstar-bootstrap__card--muted { background: rgba(239, 235, 255, 0.72); }
.northstar-bootstrap__value { max-width: 430px; font-size: 25px; line-height: 1.22; }
.northstar-bootstrap__copy { margin: 0; color: #575060; font-size: 17px; line-height: 1.55; }
`.trim();

export interface CreateNorthstarDirectBootstrapOptions {
  artifactId?: string;
  now?: Date;
}

function createArtifactId(now: Date): string {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `northstar-direct-${suffix}`;
}

/**
 * Creates the one canonical mounted artboard used to bootstrap the Phase 4
 * architecture. Unlike the legacy prototype payload, this always contains an
 * authored document and data bundle, so runtime-document.ts installs the
 * direct projection bridge in the iframe before the ledger performs its first
 * canonical capture.
 */
export function createNorthstarDirectBootstrapArtifactPayload(
  options: CreateNorthstarDirectBootstrapOptions = {},
): CanvasCodeArtifactPayload {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const artifactId = options.artifactId ?? createArtifactId(now);

  return {
    schema: NORTHSTAR_CODE_ARTIFACT_SCHEMA,
    artifactId,
    revisionId: `${artifactId}-root`,
    surfaceId: artifactId,
    title: "Northstar — direct architecture artboard",
    description: "Canonical bootstrap surface for ledger-owned direct projection.",
    document: {
      schema: NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
      html: BOOTSTRAP_HTML,
      css: BOOTSTRAP_CSS,
      javascript: "",
    },
    mutationJournal: [],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Build a grounded visual artifact through verified Northstar commits.",
      audience: "Northstar workspace user",
      artifactType: "living-artboard",
      coverageSummary: "Canonical empty artboard awaiting its first ledger-owned activity.",
      apps: [],
      flows: [],
      screenshots: [],
      hypotheses: [],
      decisions: [],
      corrections: [],
      openQuestions: [],
      allowedAssetUrls: [],
    },
    stagePlan: [],
    activeStageIndex: 0,
    visualStrategy: "Ledger-owned direct projection",
    artifactType: "living-artboard",
    audience: "Northstar workspace user",
    thinkingDepth: "high",
    creativeReviews: [],
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
    preferredWidth: 1120,
    preferredHeight: 720,
    layoutBaseWidth: 1120,
    layoutBaseHeight: 720,
    intrinsicBounds: { minX: 0, minY: 0, maxX: 1120, maxY: 720 },
    minimumWidth: 1120,
    minimumHeight: 720,
    buildState: {
      phase: "complete",
      completedSteps: 1,
      totalSteps: 1,
      message: "Direct projection surface ready",
      isBuilding: false,
    },
    diagnostics: [],
    provisional: false,
    publicationState: "working",
  };
}
