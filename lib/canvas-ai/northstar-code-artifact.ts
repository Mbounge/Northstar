// Northstar Visual Web Artifact Authoring v0.4.8.2 — one mounted surface, stable semantic evidence nodes, authoritative ordering, and reference-conditioned craft
import { Script } from "node:vm";
import { createHash } from "node:crypto";
import {
  NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
  NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
  type CanvasCodeArtifactDataBundle,
  type CanvasCodeArtifactRuntimeReview,
  type CanvasCodeArtifactStage,
  type NorthstarCreativeConcept,
  type NorthstarCreativeDirection,
  type NorthstarCreativeReview,
  type NorthstarGeneratedCodeArtifactPackage,
  type NorthstarThinkingDepth,
  type NorthstarWebArtifactDocument,
  type NorthstarArtboardMutationOperation,
} from "@/lib/canvas-artifacts/types";
import {
  appendNorthstarArtboardMutation,
  getNorthstarMutationJournalDiagnostics,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import type { NorthstarCreativeCritiqueDraft, NorthstarProgressiveDesignAct } from "@/lib/canvas-ai/northstar-design-intelligence";
import {
  NORTHSTAR_FLOW_REFERENCE_PROTOCOL,
  NORTHSTAR_ORIGINALITY_PROTOCOL,
  NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL,
  NORTHSTAR_VISUAL_IDENTITY,
} from "@/lib/canvas-ai/northstar-design-intelligence";

export interface NorthstarCodeArtifactDraft {
  title: string;
  description: string;
  visualStrategy: string;
  preferredWidth: number;
  preferredHeight: number;
  stages: CanvasCodeArtifactStage[];
  document: NorthstarWebArtifactDocument;
}

export interface NorthstarArtifactFlowObligation {
  id: string;
  appName: string;
  flowName: string;
  requiredScreenshotIds: string[];
  minimumVisibleScreens: number;
  presentationDefault: "horizontal-sequence";
  identityAnchor: "app-icon-name-flow-name";
  screenshotTreatment: "plain-clean";
  captions: "optional";
  preserveOrder: true;
  platform?: string;
}

export interface NorthstarArtifactDeliveryObligations {
  evidenceLed: boolean;
  comparison: boolean;
  requiredAppIdentities: Array<{ id: string; name: string; iconUrl?: string }>;
  requiredFlows: NorthstarArtifactFlowObligation[];
  minimumVisibleScreenshotCount: number;
  requirePrimaryEvidenceRegion: boolean;
  requireResearchTrail: boolean;
  requireRecommendation: boolean;
  forbidPlaceholders: boolean;
}

export interface NorthstarCodeArtifactGenerationInput {
  artifactId: string;
  objective: string;
  audience: string;
  artifactType: string;
  userRequest: string;
  conversationSummary?: string;
  evidenceBrief: unknown;
  researchLedger: unknown;
  dataBundle: CanvasCodeArtifactDataBundle;
  thinkingDepth: NorthstarThinkingDepth;
  creativeDirection: NorthstarCreativeDirection;
  previousArtifact?: {
    artifactId?: string;
    revisionId: string;
    title: string;
    description?: string;
    visualStrategy?: string;
    document?: NorthstarWebArtifactDocument;
    sourceTsx?: string;
    runtimeReview?: CanvasCodeArtifactRuntimeReview;
    preferredWidth?: number;
    preferredHeight?: number;
    dataBundle?: CanvasCodeArtifactDataBundle;
    publicationState?: "working" | "verified";
  };
  revisionInstruction?: string;
  revisionTag?: string;
  designAct?: NorthstarProgressiveDesignAct;
}

export type NorthstarArtifactSourceFailureKind =
  | "validation"
  | "javascript-syntax"
  | "unsafe-source"
  | "empty-output";

export class NorthstarArtifactSourceError extends Error {
  readonly kind: NorthstarArtifactSourceFailureKind;
  readonly issues: string[];

  constructor(kind: NorthstarArtifactSourceFailureKind, issues: string[]) {
    const normalized = issues.filter(Boolean).slice(0, 24);
    super(`Generated web artifact failed ${kind}: ${normalized.join(" ")}`);
    this.name = "NorthstarArtifactSourceError";
    this.kind = kind;
    this.issues = normalized;
  }
}

export function getNorthstarArtifactSourceDiagnostics(error: unknown): string[] {
  if (error instanceof NorthstarArtifactSourceError) return error.issues;
  if (error instanceof Error && error.message.trim()) return [error.message.trim().slice(0, 2_000)];
  return ["The generated web artifact could not be validated."];
}

export const NORTHSTAR_ONE_ARTBOARD_PROTOCOL = `
NORTHSTAR ONE-LIVING-ARTBOARD PROTOCOL

There is one Canvas object and one mounted artifact document for the entire run. The starting artboard and completed artboard are the same live surface.

After the initial surface exists, every visible revision must be an incremental mutation batch:
- never return or mount another document
- never replace the iframe, root, or complete artboard HTML
- add, move, resize, regroup, annotate, simplify, restyle, or remove semantic nodes already on the surface
- preserve the same artifactId and surfaceId
- append to the existing mutation journal in direct sequence
- make a visible, coherent adjustment that a watching human can notice
- allow geometry to change after every mutation so content determines x, y, width, and height

Private concept studies may influence judgment, but their markup never reaches the live surface. The final state is only the accumulated result of all mutations made to the original artboard.
`.trim();

function sourceImageUrls(document: NorthstarWebArtifactDocument, dataBundle: CanvasCodeArtifactDataBundle): string[] {
  const allowed = new Set(dataBundle.allowedAssetUrls);
  return urlsFromSource(`${document.html}\n${document.css}`).filter((url) => allowed.has(url));
}

function containsUnpublishablePlaceholder(document: NorthstarWebArtifactDocument): boolean {
  const source = `${document.html}\n${document.css}\n${document.javascript}`;
  return /(?:>\s*(?:\.{3}|…|TODO|TBD)\s*<|\[?screenshot placeholder\]?|evidence placeholder|placeholder image|lorem ipsum|coming soon|select a node to inspect evidence|class=["'][^"']*(?:placeholder|skeleton)[^"']*["'])/i.test(source);
}

export function getNorthstarArtboardContinuityDiagnostics(input: {
  previous?: Pick<NorthstarGeneratedCodeArtifactPackage, "artifactId" | "revisionId" | "document" | "preferredWidth" | "preferredHeight" | "dataBundle" | "surfaceId" | "mutationJournal">;
  candidate: NorthstarGeneratedCodeArtifactPackage;
}): string[] {
  const { previous, candidate } = input;
  const issues: string[] = [];
  if (containsUnpublishablePlaceholder(candidate.document)) {
    issues.push("The permanent surface document contains placeholder or skeletal content.");
  }
  issues.push(...getNorthstarMutationJournalDiagnostics(candidate));
  if (!previous) return Array.from(new Set(issues));
  if (candidate.artifactId !== previous.artifactId) issues.push("A live mutation must keep the original artifactId.");
  if ((candidate.surfaceId ?? candidate.artifactId) !== (previous.surfaceId ?? previous.artifactId)) {
    issues.push("A live mutation must keep the original mounted surfaceId.");
  }
  if (candidate.parentRevisionId !== previous.revisionId) {
    issues.push("A live mutation must directly descend from the currently visible revision.");
  }
  if (
    candidate.document.html !== previous.document.html ||
    candidate.document.css !== previous.document.css ||
    candidate.document.javascript !== previous.document.javascript
  ) {
    issues.push("The mounted surface document changed. After creation, Northstar must append mutations instead of replacing the document.");
  }
  const previousJournal = previous.mutationJournal ?? [];
  const candidateJournal = candidate.mutationJournal ?? [];
  if (candidateJournal.length <= previousJournal.length) {
    issues.push("A live revision must append at least one visible mutation to the existing journal.");
  } else {
    for (let index = 0; index < previousJournal.length; index += 1) {
      if (candidateJournal[index]?.mutationId !== previousJournal[index]?.mutationId) {
        issues.push("The mutation journal was rewritten instead of appended.");
        break;
      }
    }
  }
  return Array.from(new Set(issues));
}

export function prepareNorthstarArtboardRevisionForPublication(input: {
  previous?: NorthstarGeneratedCodeArtifactPackage;
  candidate: NorthstarGeneratedCodeArtifactPackage;
}): NorthstarGeneratedCodeArtifactPackage {
  const previous = input.previous;
  const candidate: NorthstarGeneratedCodeArtifactPackage = previous
    ? { ...input.candidate, artifactId: previous.artifactId, parentRevisionId: previous.revisionId }
    : input.candidate;
  const issues = getNorthstarArtboardContinuityDiagnostics({ previous, candidate });
  if (issues.length) throw new NorthstarArtifactSourceError("validation", issues);
  return candidate;
}

function changedCharacterSpan(previous: string, candidate: string): number {
  if (previous === candidate) return 0;
  const shortest = Math.min(previous.length, candidate.length);
  let prefix = 0;
  while (prefix < shortest && previous.charCodeAt(prefix) === candidate.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    previous.charCodeAt(previous.length - 1 - suffix) === candidate.charCodeAt(candidate.length - 1 - suffix)
  ) suffix += 1;
  return Math.max(0, previous.length - prefix - suffix) + Math.max(0, candidate.length - prefix - suffix);
}

export function getNorthstarArtboardProgressDiagnostics(input: {
  previous?: Pick<NorthstarGeneratedCodeArtifactPackage, "mutationJournal">;
  candidate: Pick<NorthstarGeneratedCodeArtifactPackage, "mutationJournal">;
  minimumChangedCharacters?: number;
}): string[] {
  if (!input.previous) return [];
  const previousCount = input.previous.mutationJournal?.length ?? 0;
  const journal = input.candidate.mutationJournal ?? [];
  const appended = journal.slice(previousCount);
  if (appended.length === 0) return ["The proposed design act does not append a visible artboard mutation."];
  const operationCount = appended.reduce((total, batch) => total + batch.operations.length, 0);
  const visibleDescription = appended.map((batch) => batch.visibleChange).join(" ").trim();
  if (operationCount === 0) return ["The proposed design act contains no mutation operations."];
  if (!visibleDescription) return ["The proposed design act does not describe an observable visual change."];
  return [];
}

export function prepareNorthstarDesignActRevisionForPublication(input: {
  previous?: NorthstarGeneratedCodeArtifactPackage;
  candidate: NorthstarGeneratedCodeArtifactPackage;
  minimumChangedCharacters?: number;
}): NorthstarGeneratedCodeArtifactPackage {
  const candidate = prepareNorthstarArtboardRevisionForPublication({
    previous: input.previous,
    candidate: input.candidate,
  });
  const issues = getNorthstarArtboardProgressDiagnostics({
    previous: input.previous,
    candidate,
    minimumChangedCharacters: input.minimumChangedCharacters,
  });
  if (issues.length) throw new NorthstarArtifactSourceError("validation", issues);
  return candidate;
}

const REQUIRED_PHASES: CanvasCodeArtifactStage["phase"][] = [
  "foundation",
  "evidence",
  "analysis",
  "recommendation",
  "refinement",
];

const DEFAULT_STAGES: Record<CanvasCodeArtifactStage["phase"], Omit<CanvasCodeArtifactStage, "phase">> = {
  foundation: {
    id: "foundation",
    label: "Create the live artifact foundation",
    message: "Establishing the question, app identities, and provisional visual direction",
  },
  evidence: {
    id: "evidence",
    label: "Bring grounded evidence into the artifact",
    message: "Selecting flows, screenshots, and proof moments while the research develops",
  },
  analysis: {
    id: "analysis",
    label: "Develop the visual argument",
    message: "Connecting the evidence to patterns, tension, and implications",
  },
  recommendation: {
    id: "recommendation",
    label: "Resolve the decision",
    message: "Turning the analysis into a clear recommendation and next action",
  },
  refinement: {
    id: "refinement",
    label: "Refine the communication",
    message: "Improving hierarchy, originality, evidence legibility, and finish",
  },
};

function normalizeId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return normalized || fallback;
}

function normalizeStages(input: CanvasCodeArtifactStage[]): CanvasCodeArtifactStage[] {
  const byPhase = new Map<CanvasCodeArtifactStage["phase"], CanvasCodeArtifactStage>();
  for (const stage of input) {
    if (!REQUIRED_PHASES.includes(stage.phase) || byPhase.has(stage.phase)) continue;
    byPhase.set(stage.phase, {
      id: normalizeId(stage.id || stage.phase, stage.phase),
      phase: stage.phase,
      label: stage.label.trim().slice(0, 120) || DEFAULT_STAGES[stage.phase].label,
      message: stage.message.trim().slice(0, 220) || DEFAULT_STAGES[stage.phase].message,
    });
  }
  return REQUIRED_PHASES.map((phase) => byPhase.get(phase) ?? { phase, ...DEFAULT_STAGES[phase] });
}

export const NORTHSTAR_CODE_ARTIFACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 180 },
    description: { type: "string", minLength: 1, maxLength: 500 },
    visualStrategy: { type: "string", minLength: 1, maxLength: 1600 },
    preferredWidth: { type: "integer", minimum: 1080, maximum: 12000 },
    preferredHeight: { type: "integer", minimum: 760, maximum: 12000 },
    stages: {
      type: "array",
      minItems: 4,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 60 },
          phase: { type: "string", enum: REQUIRED_PHASES },
          label: { type: "string", minLength: 1, maxLength: 120 },
          message: { type: "string", minLength: 1, maxLength: 220 },
        },
        required: ["id", "phase", "label", "message"],
      },
    },
    document: {
      type: "object",
      additionalProperties: false,
      properties: {
        schema: { type: "string", enum: [NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA] },
        html: { type: "string", minLength: 100, maxLength: 120000 },
        css: { type: "string", minLength: 40, maxLength: 100000 },
        javascript: { type: "string", maxLength: 80000 },
      },
      required: ["schema", "html", "css", "javascript"],
    },
  },
  required: [
    "title",
    "description",
    "visualStrategy",
    "preferredWidth",
    "preferredHeight",
    "stages",
    "document",
  ],
} as const;


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasQuotedAttribute(html: string, name: string, value?: string): boolean {
  const attribute = escapeRegExp(name);
  if (value === undefined) {
    return new RegExp(`\\b${attribute}\\s*=\\s*["'][^"']*["']`, "i").test(html);
  }
  return new RegExp(
    `\\b${attribute}\\s*=\\s*(["'])${escapeRegExp(value)}\\1`,
    "i",
  ).test(html);
}

function hasClass(html: string, className: string): boolean {
  return new RegExp(`\\bclass\\s*=\\s*(["'])[^"']*\\b${escapeRegExp(className)}\\b[^"']*\\1`, "i").test(html);
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function taskSignals(input: Pick<NorthstarCodeArtifactGenerationInput, "objective" | "artifactType" | "userRequest">): string {
  return `${input.objective} ${input.userRequest} ${input.artifactType}`.toLowerCase();
}

export function buildNorthstarArtifactDeliveryObligations(
  input: Pick<NorthstarCodeArtifactGenerationInput, "objective" | "artifactType" | "userRequest" | "dataBundle">,
): NorthstarArtifactDeliveryObligations {
  const data = input.dataBundle;
  const signals = taskSignals(input);
  const comparison =
    data.apps.length >= 2 &&
    (/(?:compare|comparison|versus|\bvs\b|trade-?off|difference|contrast)/i.test(signals) ||
      input.artifactType.includes("comparison"));
  const evidenceLed =
    data.screenshots.some((screen) => Boolean(screen.imageUrl)) &&
    (comparison ||
      /(?:screenshot|flow|journey|evidence|research|onboarding|teardown|audit|reference)/i.test(signals));

  const flowsWithImages = data.flows
    .map((flow) => {
      const requiredScreenshotIds = flow.screenshotIds.filter((id) =>
        data.screenshots.some((screen) => screen.id === id && Boolean(screen.imageUrl)),
      );
      return { flow, requiredScreenshotIds };
    })
    .filter((entry) => entry.requiredScreenshotIds.length > 0);

  const selectedFlows: typeof flowsWithImages = [];
  if (comparison) {
    for (const app of data.apps.slice(0, 4)) {
      const candidates = flowsWithImages
        .filter((entry) => entry.flow.appName === app.name)
        .sort((a, b) => b.requiredScreenshotIds.length - a.requiredScreenshotIds.length);
      if (candidates[0]) selectedFlows.push(candidates[0]);
    }
  } else if (evidenceLed) {
    selectedFlows.push(...flowsWithImages.slice(0, 3));
  }

  const requiredFlows = selectedFlows.map(({ flow, requiredScreenshotIds }) => {
    // The data layer has already selected the authoritative reference flow. Preserve its
    // ordered story rather than reducing it to an arbitrary screenshot quota. A very long
    // flow is capped only for provider/runtime safety while retaining authoritative order.
    const ordered = requiredScreenshotIds.slice(0, 24);
    return {
      id: flow.id,
      appName: flow.appName,
      flowName: flow.flowName,
      requiredScreenshotIds: ordered,
      minimumVisibleScreens: ordered.length,
      presentationDefault: "horizontal-sequence" as const,
      identityAnchor: "app-icon-name-flow-name" as const,
      screenshotTreatment: "plain-clean" as const,
      captions: "optional" as const,
      preserveOrder: true as const,
      platform: flow.platform,
    };
  });

  return {
    evidenceLed,
    comparison,
    requiredAppIdentities: evidenceLed
      ? data.apps.slice(0, comparison ? 4 : 3).map((app) => ({
          id: app.id,
          name: app.name,
          iconUrl: app.iconUrl,
        }))
      : [],
    requiredFlows,
    minimumVisibleScreenshotCount: requiredFlows.reduce(
      (total, flow) => total + flow.minimumVisibleScreens,
      0,
    ),
    requirePrimaryEvidenceRegion: evidenceLed,
    requireResearchTrail: evidenceLed,
    requireRecommendation: comparison || data.decisions.length > 0,
    forbidPlaceholders: true,
  };
}

function urlsFromSource(source: string): string[] {
  const urls = new Set<string>();
  const patterns = [
    /(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) urls.add(match[1]);
  }
  return Array.from(urls);
}

function validateWebArtifactDocument(
  document: NorthstarWebArtifactDocument,
  input: Pick<NorthstarCodeArtifactGenerationInput, "objective" | "artifactType" | "userRequest" | "dataBundle">,
): string[] {
  const issues: string[] = [];
  const html = document.html.trim();
  const css = document.css.trim();
  const javascript = document.javascript.trim();
  if (document.schema !== NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA) {
    issues.push(`document.schema must be ${NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA}.`);
  }
  if (!html) issues.push("The artifact HTML is empty.");
  if (!css) issues.push("The artifact CSS is empty.");
  if (!hasQuotedAttribute(html, "data-ns-design-kernel", "v1") || !hasClass(html, "ns-artifact")) {
    issues.push('The artifact root must use class="ns-artifact" and data-ns-design-kernel="v1" so the trusted Northstar design kernel governs the composition.');
  }
  if (!hasClass(html, "ns-thesis")) {
    issues.push("The artifact must contain an authored editorial thesis using the ns-thesis design primitive.");
  }
  if (/\bns-(?:live|progress)-composition\b/i.test(html) || /data-ns-publication\s*=\s*["']trusted-(?:live|progress)["']/i.test(html)) {
    issues.push("The bespoke artifact may not copy or submit the trusted working-checkpoint composition as its final design.");
  }
  if (
    /\bns-live-flow-stack\b/i.test(html) &&
    /\bns-live-analysis\b/i.test(html) &&
    /\bns-live-decision\b/i.test(html)
  ) {
    issues.push("The artifact repeats the legacy fixed compositor module stack instead of expressing the selected composition genome.");
  }
  if (html.length > 120_000) issues.push("The artifact HTML exceeds 120 KB.");
  if (css.length > 100_000) issues.push("The artifact CSS exceeds 100 KB.");
  if (javascript.length > 80_000) issues.push("The artifact JavaScript exceeds 80 KB.");

  const forbiddenHtml = [
    /<\s*script\b/i,
    /<\s*iframe\b/i,
    /<\s*object\b/i,
    /<\s*embed\b/i,
    /<\s*link\b/i,
    /<\s*meta\b/i,
    /<\s*base\b/i,
    /\son[a-z]+\s*=/i,
    /\ssrcset\s*=/i,
    /javascript\s*:/i,
    /<\s*form\b[^>]*\baction\s*=/i,
  ];
  forbiddenHtml.forEach((pattern) => {
    if (pattern.test(html)) issues.push(`HTML contains a prohibited construct matching ${pattern}.`);
  });
  // Stage annotations are enhancement metadata, not a delivery gate. The runtime
  // infers a safe root stage when authored regions omit data-ns-stage.
  if (/@import\b/i.test(css)) issues.push("CSS @import is prohibited.");
  if (/expression\s*\(/i.test(css)) issues.push("CSS expressions are prohibited.");
  if (/text-overflow\s*:\s*ellipsis/i.test(css) || /-webkit-line-clamp\s*:\s*(?!unset\b|none\b|initial\b)\d+/i.test(css)) {
    issues.push("Important artifact text may not be ellipsized or line-clamped. Let text wrap or expand the composition.");
  }
  if (/height\s*:\s*100vh/i.test(css) || /max-height\s*:\s*(?:100vh|\d+px)/i.test(css)) {
    issues.push("The artifact may not use a viewport or fixed maximum height as a content boundary.");
  }

  const forbiddenJavascript: Array<[RegExp, string]> = [
    [/\bfetch\s*\(/, "fetch/network access"],
    [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
    [/\bWebSocket\b/, "WebSocket"],
    [/\bEventSource\b/, "EventSource"],
    [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, "browser storage"],
    [/document\s*\.\s*cookie/, "cookies"],
    [/\bparent\b|\bopener\b/, "parent-window access"],
    [/\bwindow\s*\.\s*top\b|\btop\s*\./, "top-window access"],
    [/\beval\s*\(|\bFunction\s*\(/, "dynamic code evaluation"],
    [/\bimport\s*\(|\brequire\s*\(/, "module loading"],
    [/\bprocess\b|\bDeno\b/, "server runtime access"],
    [/\blocation\s*=|\blocation\s*\.\s*(?:assign|replace)\s*\(/, "navigation"],
  ];
  for (const [pattern, label] of forbiddenJavascript) {
    if (pattern.test(javascript)) issues.push(`JavaScript contains prohibited ${label}.`);
  }

  if (javascript) {
    try {
      new Script(`(function(Northstar,data,creative,reviews){\n${javascript}\n})`, {
        filename: "northstar-web-artifact.js",
      });
    } catch (error) {
      issues.push(
        `JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const allowed = new Set(input.dataBundle.allowedAssetUrls);
  for (const url of urlsFromSource(`${html}\n${css}`)) {
    if (
      !url ||
      url.startsWith("#") ||
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      url.startsWith("var(") ||
      allowed.has(url)
    ) continue;
    issues.push(`The artifact references an asset URL that was not supplied in the grounded data: ${url.slice(0, 300)}`);
  }

  const obligations = buildNorthstarArtifactDeliveryObligations(input);
  // The validator verifies grounded delivery, not a prescribed component tree.
  // Visual primitives and recommendation treatments are judged by rendered review,
  // so bespoke spatial compositions are not rejected for using different markup.
  const plainText = plainTextFromHtml(html).toLowerCase();
  if (
    obligations.forbidPlaceholders &&
    /(?:\[?screenshot placeholder\]?|evidence placeholder|placeholder image|lorem ipsum|coming soon|select a node to inspect evidence)/i.test(
      `${html}\n${javascript}`,
    )
  ) {
    issues.push("The artifact contains placeholder evidence or unfinished placeholder copy even though grounded assets are available.");
  }

  for (const app of obligations.requiredAppIdentities) {
    if (!plainText.includes(app.name.toLowerCase())) {
      issues.push(`The artifact must visibly display the app name ${app.name}.`);
    }
    if (app.iconUrl && !html.includes(app.iconUrl)) {
      issues.push(`The artifact must use the supplied ${app.name} app icon in the visible composition.`);
    }
  }

  const visibleEvidenceIds = new Set<string>();
  for (const flow of obligations.requiredFlows) {
    if (!plainText.includes(flow.flowName.toLowerCase())) {
      issues.push(`The artifact must visibly display the flow name “${flow.flowName}”.`);
    }
    const flowMarker = new RegExp(`data-ns-flow-id\\s*=\\s*(["'])${escapeRegExp(flow.id)}\\1`, "i");
    const markerMatch = flowMarker.exec(html);
    if (!markerMatch) {
      issues.push(`${flow.appName} · ${flow.flowName} must use data-ns-flow-id so the runtime and reviewer can identify the reference sequence without dictating its layout.`);
    }
    const flowRegionStart = markerMatch?.index ?? 0;
    const nextFlowOffset = html.slice(flowRegionStart + 1).search(/data-ns-flow-id\s*=\s*["']/i);
    const flowRegionEnd = nextFlowOffset >= 0 ? flowRegionStart + 1 + nextFlowOffset : html.length;
    const flowRegion = markerMatch ? html.slice(flowRegionStart, flowRegionEnd) : html;
    let visibleForFlow = 0;
    const orderedSourcePositions: number[] = [];
    for (const screenshotId of flow.requiredScreenshotIds) {
      const screen = input.dataBundle.screenshots.find((item) => item.id === screenshotId);
      if (!screen?.imageUrl) continue;
      const sourcePosition = flowRegion.indexOf(screen.imageUrl);
      if (sourcePosition >= 0) {
        visibleForFlow += 1;
        orderedSourcePositions.push(sourcePosition);
        visibleEvidenceIds.add(screenshotId);
      }
    }
    if (visibleForFlow < flow.minimumVisibleScreens) {
      issues.push(
        `${flow.appName} · ${flow.flowName} must visibly use at least ${flow.minimumVisibleScreens} real ordered screenshots from the supplied flow; found ${visibleForFlow}.`,
      );
    }
    if (
      orderedSourcePositions.length > 1 &&
      orderedSourcePositions.some((position, index) => index > 0 && position <= orderedSourcePositions[index - 1])
    ) {
      issues.push(`${flow.appName} · ${flow.flowName} screenshots must appear in authoritative flow order inside its reference-flow region.`);
    }
  }

  if (visibleEvidenceIds.size < obligations.minimumVisibleScreenshotCount) {
    issues.push(
      `The artifact must visibly use at least ${obligations.minimumVisibleScreenshotCount} grounded screenshots; found ${visibleEvidenceIds.size}.`,
    );
  }

  const requestWords = input.userRequest.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((word) => word.length > 3);
  const headingMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const headingText = plainTextFromHtml(headingMatch?.[1] ?? "").toLowerCase();
  if (headingText && requestWords.length >= 6) {
    const overlap = requestWords.filter((word) => headingText.includes(word)).length / requestWords.length;
    if (overlap >= 0.72 || headingText.length > 190) {
      issues.push("The main headline appears to repeat the user's instruction instead of presenting an authored editorial thesis.");
    }
  }

  return Array.from(new Set(issues)).slice(0, 32);
}

function appendBeforeRootClose(html: string, addition: string): string {
  const mainClose = html.match(/<\/main\s*>\s*$/i);
  if (mainClose?.index !== undefined) {
    return `${html.slice(0, mainClose.index)}${addition}${html.slice(mainClose.index)}`;
  }
  return `${html}${addition}`;
}

function normalizeNorthstarRoot(html: string): string {
  let normalized = html.trim();
  if (!hasClass(normalized, "ns-artifact") || !hasQuotedAttribute(normalized, "data-ns-design-kernel", "v1")) {
    normalized = `<main class="ns-artifact" data-ns-design-kernel="v1">${normalized}</main>`;
  }
  if (!hasClass(normalized, "ns-thesis")) {
    if (/<h1\b/i.test(normalized)) {
      normalized = normalized.replace(/<h1\b([^>]*)>/i, (_match, attrs: string) => {
        if (/\bclass\s*=/.test(attrs)) {
          return `<h1${attrs.replace(/\bclass\s*=\s*(["'])(.*?)\1/i, (_classMatch: string, quote: string, classes: string) => ` class=${quote}${classes} ns-thesis${quote}`)}>`;
        }
        return `<h1 class="ns-thesis"${attrs}>`;
      });
    } else if (/<h2\b/i.test(normalized)) {
      normalized = normalized.replace(/<h2\b([^>]*)>/i, '<h2 class="ns-thesis"$1>');
    } else {
      normalized = normalized.replace(/(<main\b[^>]*>)/i, '$1<header><p class="ns-kicker">Northstar</p><h1 class="ns-thesis">A grounded product decision</h1></header>');
    }
  }
  return normalized;
}

function groundedEvidenceAnnex(
  _html: string,
  _input: Pick<NorthstarCodeArtifactGenerationInput, "objective" | "artifactType" | "userRequest" | "dataBundle">,
): string {
  // v0.4.4 never injects a fixed visual fallback into model-authored work. Missing
  // grounding is repaired privately so the selected composition remains genuinely bespoke.
  return "";
}

function normalizeArtifactCss(css: string): string {
  const withoutScroll = css
    .replace(/overflow-x\s*:\s*(?:auto|scroll)\s*;?/gi, "overflow-x:visible;")
    .replace(/overflow-y\s*:\s*(?:auto|scroll)\s*;?/gi, "overflow-y:visible;")
    .replace(/overflow\s*:\s*(?:auto|scroll)\s*;?/gi, "overflow:visible;")
    .replace(/text-overflow\s*:\s*ellipsis\s*;?/gi, "text-overflow:clip;")
    .replace(/-webkit-line-clamp\s*:[^;]+;?/gi, "");
  return `${withoutScroll}
html,body,.ns-artifact{height:auto!important;max-height:none!important;overflow:visible!important}
.ns-flow__rail,[data-ns-reference-flow]{overflow:visible!important}
.ns-screen__meta b,.ns-screen__meta span,[data-ns-important-text]{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;-webkit-line-clamp:unset!important}
`;
}

function normalizedDocument(
  value: NorthstarWebArtifactDocument,
  input?: Pick<NorthstarCodeArtifactGenerationInput, "objective" | "artifactType" | "userRequest" | "dataBundle">,
): NorthstarWebArtifactDocument {
  let html = normalizeNorthstarRoot(value.html);
  if (input) {
    const annex = groundedEvidenceAnnex(html, input);
    if (annex) html = appendBeforeRootClose(html, annex);
  }
  return {
    schema: NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
    html: html.trim(),
    css: normalizeArtifactCss(value.css.trim()),
    javascript: value.javascript.trim(),
  };
}

export function buildNorthstarCodeArtifactSystemInstruction(
  designAddendum: string,
): string {
  return `
You are Northstar's senior creative technologist, product designer, researcher, strategist, and visual storyteller.

Create one bespoke STANDARD WEB ARTIFACT with semantic HTML, CSS, SVG, Canvas, and optional vanilla JavaScript. Do not write React, JSX, TSX, imports, packages, or framework code.

${NORTHSTAR_VISUAL_IDENTITY}

${NORTHSTAR_ORIGINALITY_PROTOCOL}

${NORTHSTAR_FLOW_REFERENCE_PROTOCOL}

${NORTHSTAR_PRESENTATION_QUALITY_PROTOCOL}

${NORTHSTAR_ONE_ARTBOARD_PROTOCOL}

AUTHORSHIP CONTRACT
- Solve the viewer's actual job first. Derive the composition from the selected concept's visual metaphor, spatial system, evidence choreography, and narrative arc.
- The eight reference images teach Northstar taste. Never copy one reference's layout, section order, module inventory, named composition, or component arrangement.
- Synthesize a concise editorial title from the evidence. Never use the user's instruction as the headline.
- Make the main implication understandable in roughly three seconds while preserving inspectable evidence and honest uncertainty.
- Treat screenshots, app identity, quotes, numbers, stages, flows, provenance, and product UI as visual communication material—not fields to place into a template.
- Do not default to cards. A surface, border, frame, or shadow must have a communicative purpose.

STANDARD WEB CONTRACT
- Return only the required JSON.
- document.html may contain ordinary semantic HTML and inline SVG. It must not contain script, iframe, object, embed, link, meta, base, inline event handlers, or external navigation.
- document.css may not use @import or external fonts.
- document.javascript is optional vanilla JavaScript and receives Northstar, data, creative, reviews.
- Never use network APIs, storage, cookies, parent/top/opener access, navigation, eval, Function, dynamic imports, require, process, or credentials.
- Images and icons must use exact supplied imageUrl/iconUrl values. Never invent URLs, products, metrics, claims, or evidence.
- Northstar.viz offers safe chart mechanics. Use charts only when observed or supplied quantitative data genuinely benefits from visualization.

ADAPTIVE CANVAS CONTRACT
- The initial width and height are a starting coordinate system, not a page boundary.
- The composition may expand down, up, left, or right. The Canvas object measures and exposes the complete visual bounds.
- Never require essential internal scrolling, fixed viewport height, root clipping, or an expanded page.
- Let text wrap or expand the composition. Do not ellipsize or line-clamp important text.
- Use at least 14px for normal copy and 12px only for compact metadata. Keep evidence legible at normal Canvas zoom.
- data-ns-stage is optional progress metadata. The required root remains <main class="ns-artifact ..." data-ns-design-kernel="v1">.

REFERENCE FLOW CONTRACT
- When mandatoryDeliveryContract.requiredFlows is non-empty, create one identifiable semantic flow region per entry using its exact data-ns-flow-id.
- Anchor each flow with the real app icon, app name, and exact flow name.
- Present the supplied referenced screenshots in authoritative order as one clean horizontal sequence. Allow the artifact to widen instead of wrapping the journey into a grid or shrinking screenshots until unreadable.
- Display screenshots plainly by default: natural aspect ratio, transparent or quiet background, minimal border, no thick device cards or tinted screenshot containers unless the frame itself communicates a meaningful state.
- Captions and stage labels are optional. Omit them when the sequence is self-explanatory; use concise annotations only when they improve understanding.
- Essential screenshots must be static img elements, not available only after interaction.

CREATIVE EXECUTION
- Express the selected concept in the rendered pixels. A metaphor that appears only in metadata is failure.
- Interaction must clarify, compare, focus, reveal, connect, or simulate. Decorative controls are prohibited.
- Do not recreate Northstar application chrome inside the artifact.
- When revising, preserve what works and materially improve the same artifact.

DESIGN INTELLIGENCE
${designAddendum}

The evidence brief and rendered concept study are design inputs, not component templates. Produce the complete code for this exact objective and grounded data. Preserve the selected medium, but do not trace the study layout.
`.trim();
}

export function buildNorthstarLiveArtifactSystemInstruction(
  designAddendum: string,
): string {
  return `${buildNorthstarCodeArtifactSystemInstruction(designAddendum)}

LIVE POLISHED-STATE MODE
- This is an intermediate visible revision, not a loading screen and not a wireframe.
- Produce a complete, polished composition using only the evidence available at this stage.
- Do not invent missing research. Use app identity and current evidence beautifully, then leave room for later revisions without placeholder boxes.
- The revision must look intentionally designed at intrinsic size even though Northstar will continue evolving it.
- Use a concise provisional editorial statement, never the full user prompt.
- Return a complete artifact JSON.`;
}

export function buildNorthstarDesignActSystemInstruction(
  designAddendum: string,
): string {
  return `${buildNorthstarCodeArtifactSystemInstruction(designAddendum)}

PROGRESSIVE DESIGN-ACT MODE
- The attached CURRENT ARTBOARD RENDER is the only visible artifact. Edit that same artboard; never restart, replace it with a study, or return a new shell.
- Perform exactly one substantial visual design act. Make the act unmistakably visible in composition, hierarchy, evidence treatment, spacing, typography, or interaction—not only in prose.
- This pass must leave a coherent visual delta that a watching human can notice immediately. Do not defer several design decisions into a later all-at-once rewrite.
- Preserve all grounded app identities, reference-flow sequences, and strong existing visual structure unless the act deliberately repositions them.
- The eight attached reference images are active identity conditioning for this pass. Internalize their shared taste, then solve the current act from first principles. Do not copy a reference layout.
- Return one complete standard-web artifact JSON. Keep JavaScript optional and minimal.
- Do not explain the change inside the artifact. The visual result itself must communicate the improvement.
- Never return placeholders, ellipses, empty evidence regions, or a loading/checkpoint composition.

CONTENT-DRIVEN ARTBOARD GEOMETRY
- The artboard viewport is not a frame to fit into. Content and composition determine preferredWidth and preferredHeight.
- Keep reference screenshots readable. For mobile flows, target at least 168px per visible screenshot; for desktop/web flows, target at least 240px. Expand the artboard instead of shrinking evidence.
- Preserve the current readable scale. A new design act may grow width, height, or both, but must not compress existing evidence to make room.
- When adding synthesis, recommendations, annotations, or new visual regions, add the spatial room they need. Do not overlap, crop, or push content beyond the authored bounds.
- Set preferredWidth and preferredHeight to a realistic natural-size estimate for the complete revised document. The browser will measure the exact final bounds, but your estimate must never intentionally crop the composition.
- Use Northstar.canvas.requestSpace({ left, top, right, bottom }) when the composition deliberately extends beyond its current authored origin.
- Never use transform:scale, zoom, max-width compression, or viewport-relative sizing to force the complete composition into the previous rectangle.
- The outer Canvas camera will reframe the artboard after every accepted act. Your job is to author the complete document at its natural readable dimensions.`;
}

function compactDesignActEvidence(dataBundle: CanvasCodeArtifactDataBundle): unknown {
  const screenshotsById = new Map(dataBundle.screenshots.map((screen) => [screen.id, screen]));
  return {
    objective: dataBundle.objective,
    coverageSummary: dataBundle.coverageSummary,
    apps: dataBundle.apps.map((app) => ({
      id: app.id,
      name: app.name,
      iconUrl: app.iconUrl,
      summary: app.summary,
      strengths: app.strengths.slice(0, 5),
      risks: app.risks.slice(0, 5),
    })),
    flows: dataBundle.flows.map((flow) => ({
      id: flow.id,
      appName: flow.appName,
      flowName: flow.flowName,
      platform: flow.platform,
      summary: flow.summary,
      journeyStages: flow.journeyStages.slice(0, 10),
      orderedScreens: flow.screenshotIds
        .map((id) => screenshotsById.get(id))
        .filter((screen): screen is CanvasCodeArtifactDataBundle["screenshots"][number] => Boolean(screen))
        .map((screen) => ({
          id: screen.id,
          index: screen.index,
          title: screen.title,
          imageUrl: screen.imageUrl,
          journeyStage: screen.journeyStage,
          frictionSignals: screen.frictionSignals.slice(0, 3),
          trustSignals: screen.trustSignals.slice(0, 3),
        })),
    })),
    hypotheses: dataBundle.hypotheses.slice(0, 8),
    decisions: dataBundle.decisions.slice(0, 8),
    corrections: dataBundle.corrections.slice(0, 6),
    openQuestions: dataBundle.openQuestions.slice(0, 6),
    allowedAssetUrls: dataBundle.allowedAssetUrls,
  };
}

export function buildNorthstarDesignActModelInput(input: {
  generationInput: NorthstarCodeArtifactGenerationInput;
  act: NorthstarProgressiveDesignAct;
  attempt: number;
  maxAttempts: number;
  diagnostics?: string[];
  priorCritique?: { critique: string; requiredChanges: string[] };
  currentRender: { width: number; height: number; mimeType: string };
}): unknown {
  const previous = input.generationInput.previousArtifact;
  return {
    mode: "evolve-one-artboard-through-one-design-act",
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    objective: input.generationInput.objective,
    audience: input.generationInput.audience,
    artifactType: input.generationInput.artifactType,
    userRequest: input.generationInput.userRequest,
    currentDesignAct: input.act,
    exactDiagnostics: input.diagnostics?.slice(0, 20) ?? [],
    priorVisualCritique: input.priorCritique,
    currentRender: input.currentRender,
    creativeDirection: {
      brief: input.generationInput.creativeDirection.brief,
      selectedConcept: input.generationInput.creativeDirection.selectedConcept,
      selectionRationale: input.generationInput.creativeDirection.selectionRationale,
    },
    currentArtboard: previous ? {
      artifactId: previous.artifactId ?? input.generationInput.artifactId,
      revisionId: previous.revisionId,
      title: previous.title,
      description: previous.description,
      visualStrategy: previous.visualStrategy,
      preferredWidth: previous.preferredWidth,
      preferredHeight: previous.preferredHeight,
      publicationState: previous.publicationState,
      document: previous.document,
    } : undefined,
    groundedEvidence: compactDesignActEvidence(input.generationInput.dataBundle),
    mandatoryDeliveryContract: buildNorthstarArtifactDeliveryObligations(input.generationInput),
    oneArtboardInvariant: {
      sameArtifactId: input.generationInput.artifactId,
      parentRevisionId: previous?.revisionId,
      preserveGroundedEvidence: true,
      conceptStudiesRemainPrivate: true,
      noBlankRestart: true,
      noInternalScrolling: true,
    },
    geometryContract: {
      mode: "content-determines-artboard-bounds",
      currentWidth: previous?.preferredWidth,
      currentHeight: previous?.preferredHeight,
      mayExpandLeftRightUpDown: true,
      preserveReadableEvidenceScale: true,
      mobileReferenceScreenMinimumWidth: 168,
      desktopReferenceScreenMinimumWidth: 240,
      neverShrinkToFitPreviousViewport: true,
      outerCanvasCameraHandlesReframing: true,
    },
    outputRequirement: "Return the complete artifact JSON after performing this one design act. Do not return a patch, commentary, or concept study.",
  };
}

export function buildNorthstarCodeArtifactRepairSystemInstruction(
  designAddendum: string,
): string {
  return `${buildNorthstarCodeArtifactSystemInstruction(designAddendum)}

REPAIR MODE
- The previous standard-web document failed a deterministic local safety or syntax check.
- Return the complete corrected artifact JSON, not a patch or explanation.
- Repair every exact diagnostic while preserving the selected concept and grounded evidence.
- Prefer removing optional JavaScript over weakening the visual composition.
- Do not retreat to a generic board.
- Standard HTML/CSS/SVG alone is a fully valid artifact; JavaScript is optional.`;
}

export function buildNorthstarCodeArtifactModelInput(
  input: NorthstarCodeArtifactGenerationInput,
): unknown {
  return {
    mode: input.previousArtifact ? "revise-existing-live-web-artifact" : "create-live-web-artifact",
    userRequest: input.userRequest,
    revisionInstruction: input.revisionInstruction || undefined,
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    thinkingDepth: input.thinkingDepth,
    conversationSummary: input.conversationSummary || undefined,
    evidenceBrief: input.evidenceBrief,
    researchLedger: input.researchLedger,
    artifactData: input.dataBundle,
    creativeDirection: input.creativeDirection,
    previousArtifact: input.previousArtifact || undefined,
    availableBridge: {
      variables: ["Northstar", "data", "creative", "reviews"],
      visualizationHelpers: [
        "extent",
        "linearScale",
        "bandScale",
        "niceTicks",
        "linePath",
        "areaPath",
        "arcPath",
        "polarPoint",
        "clamp",
        "formatNumber",
      ],
    },
    mandatoryDeliveryContract: buildNorthstarArtifactDeliveryObligations(input),
    designBehaviour: {
      requiredRootClass: "ns-artifact",
      requiredRootAttribute: 'data-ns-design-kernel="v1"',
      selectedMedium: input.creativeDirection.selectedConcept.medium,
      viewerJob: input.creativeDirection.selectedConcept.viewerJob,
      spatialBehavior: input.creativeDirection.selectedConcept.spatialBehavior,
      designActs: input.creativeDirection.selectedConcept.designActs,
      renderedConceptStudy: input.creativeDirection.selectedConcept.study,
      principle: "The rendered concept study is a private hypothesis for medium and spatial behaviour, never a replacement document. Evolve the currently visible artboard in place while preserving its grounded evidence and strongest visual structure.",
      oneArtboardInvariant: {
        createOnce: true,
        sameArtifactId: input.artifactId,
        currentVisibleRevisionId: input.previousArtifact?.revisionId,
        evolveCurrentDocument: true,
        conceptStudiesArePrivate: true,
        forbidBlankRestart: true,
      },
    },
    requiredIntrinsicSurface: {
      startingWidth: 1680,
      startingHeight: 945,
      adaptiveInAllDirections: true,
      minimumWidth: 840,
      minimumHeight: 472,
      noDocumentScrolling: true,
      noExpandedView: true,
    },
  };
}

export function buildNorthstarCodeArtifactRepairModelInput(input: {
  generationInput: NorthstarCodeArtifactGenerationInput;
  failedDraft?: Partial<NorthstarCodeArtifactDraft>;
  diagnostics: string[];
  attempt: number;
  maxAttempts: number;
  repairContext?: string[];
}): unknown {
  return {
    mode: "repair-rejected-live-web-artifact",
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    exactDiagnostics: input.diagnostics.slice(0, 24),
    repairContext: input.repairContext?.slice(0, 16),
    rejectedDraft: input.failedDraft,
    originalAssignment: buildNorthstarCodeArtifactModelInput(input.generationInput),
    nonNegotiableResult: {
      completeDocument: true,
      standardHtmlCssSvgJavascript: true,
      preserveCreativeDirection: true,
      preserveGrounding: true,
      noGenericFallback: true,
      mustPassLocalSafetyAndSyntaxChecks: true,
      evolveTheSameVisibleArtboard: true,
      preserveCurrentGroundedStructure: true,
      neverPublishConceptStudyMarkup: true,
    },
  };
}

export function finalizeNorthstarCodeArtifactPackage(
  draft: NorthstarCodeArtifactDraft,
  input: NorthstarCodeArtifactGenerationInput,
): NorthstarGeneratedCodeArtifactPackage {
  const stages = normalizeStages(Array.isArray(draft.stages) ? draft.stages : []);
  const obligations = buildNorthstarArtifactDeliveryObligations(input);
  const wideEvidenceSurface = obligations.evidenceLed || obligations.comparison;
  const horizontalFlowWidth = obligations.requiredFlows.reduce((largest, flow) => {
    const screenWidth = /desktop|web/i.test(flow.platform ?? "") ? 260 : 176;
    const gap = 20;
    const identityRail = 240;
    const outerPadding = 144;
    const required = outerPadding + identityRail + flow.requiredScreenshotIds.length * screenWidth + Math.max(0, flow.requiredScreenshotIds.length - 1) * gap;
    return Math.max(largest, required);
  }, 0);
  const previousWidth = Math.max(0, input.previousArtifact?.preferredWidth ?? 0);
  const previousHeight = Math.max(0, input.previousArtifact?.preferredHeight ?? 0);
  const preferredWidth = Math.max(
    wideEvidenceSurface ? 1680 : 1200,
    previousWidth,
    Math.min(12000, Math.round(draft.preferredWidth || (wideEvidenceSurface ? 1680 : 1600))),
    Math.min(12000, horizontalFlowWidth),
  );
  const preferredHeight = Math.max(
    wideEvidenceSurface ? 945 : 760,
    previousHeight,
    Math.min(12000, Math.round(draft.preferredHeight || (wideEvidenceSurface ? 1280 : 1000))),
  );
  const document = normalizedDocument(draft.document, input);
  const issues = validateWebArtifactDocument(document, input);
  if (issues.length) {
    const syntaxIssue = issues.some((issue) => issue.startsWith("JavaScript syntax error"));
    throw new NorthstarArtifactSourceError(syntaxIssue ? "javascript-syntax" : "validation", issues);
  }

  const candidate: NorthstarGeneratedCodeArtifactPackage = {
    schema: NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
    artifactId: input.artifactId,
    revisionId: `${input.artifactId}-${normalizeId(input.revisionTag ?? "design-act", "design-act")}-${createHash("sha256").update(`${document.html}\n${document.css}\n${document.javascript}`).digest("hex").slice(0, 12)}`,
    parentRevisionId: input.previousArtifact?.revisionId,
    title: draft.title.trim().slice(0, 180) || input.creativeDirection.brief.editorialThesis || input.objective,
    description: draft.description.trim().slice(0, 500) || "Northstar live web artifact",
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    visualStrategy: draft.visualStrategy.trim().slice(0, 1600),
    document,
    mutationJournal: [],
    surfaceId: input.artifactId,
    preferredWidth,
    preferredHeight,
    layoutBaseWidth: preferredWidth,
    layoutBaseHeight: preferredHeight,
    intrinsicBounds: {
      minX: 0,
      minY: 0,
      maxX: preferredWidth,
      maxY: preferredHeight,
    },
    minimumWidth: Math.max(540, Math.round(preferredWidth / 2)),
    minimumHeight: Math.max(380, Math.round(preferredHeight / 2)),
    stages,
    dataBundle: input.dataBundle,
    thinkingDepth: input.thinkingDepth,
    creativeDirection: input.creativeDirection,
    creativeReviews: [],
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  };
  if (input.previousArtifact?.document) {
    const previousPackage = {
      ...candidate,
      artifactId: input.previousArtifact.artifactId ?? input.artifactId,
      revisionId: input.previousArtifact.revisionId,
      parentRevisionId: undefined,
      title: input.previousArtifact.title,
      description: input.previousArtifact.description ?? candidate.description,
      visualStrategy: input.previousArtifact.visualStrategy ?? candidate.visualStrategy,
      document: input.previousArtifact.document,
      preferredWidth: input.previousArtifact.preferredWidth ?? candidate.preferredWidth,
      preferredHeight: input.previousArtifact.preferredHeight ?? candidate.preferredHeight,
      layoutBaseWidth: input.previousArtifact.preferredWidth ?? candidate.layoutBaseWidth,
      layoutBaseHeight: input.previousArtifact.preferredHeight ?? candidate.layoutBaseHeight,
      intrinsicBounds: { minX: 0, minY: 0, maxX: input.previousArtifact.preferredWidth ?? candidate.preferredWidth, maxY: input.previousArtifact.preferredHeight ?? candidate.preferredHeight },
      dataBundle: input.previousArtifact.dataBundle ?? input.dataBundle,
      publicationState: input.previousArtifact.publicationState ?? "working",
    } satisfies NorthstarGeneratedCodeArtifactPackage;
    const continuityIssues = getNorthstarArtboardContinuityDiagnostics({ previous: previousPackage, candidate });
    if (continuityIssues.length) throw new NorthstarArtifactSourceError("validation", continuityIssues);
  }
  return candidate;
}

export function applyCreativeCritiqueToCodeArtifactPackage(
  packageValue: NorthstarGeneratedCodeArtifactPackage,
  critique: NorthstarCreativeCritiqueDraft & { review: NorthstarCreativeReview },
): NorthstarGeneratedCodeArtifactPackage {
  const validationInput = {
    objective: packageValue.objective,
    artifactType: packageValue.artifactType,
    userRequest: packageValue.objective,
    dataBundle: packageValue.dataBundle,
  };
  const document = normalizedDocument(critique.revisedDocument ?? packageValue.document, validationInput);
  const issues = validateWebArtifactDocument(document, validationInput);
  if (issues.length) {
    const syntaxIssue = issues.some((issue) => issue.startsWith("JavaScript syntax error"));
    throw new NorthstarArtifactSourceError(syntaxIssue ? "javascript-syntax" : "validation", issues);
  }
  const pass = Math.max(1, critique.review.pass);
  const diversityKey = packageValue.creativeDirection?.diversityKey ?? "live";
  return {
    ...packageValue,
    revisionId: `${packageValue.artifactId}-web-${diversityKey}-r${pass + 1}`,
    parentRevisionId: packageValue.revisionId,
    title: critique.revisedTitle.trim().slice(0, 180) || packageValue.title,
    description: critique.revisedDescription.trim().slice(0, 500) || packageValue.description,
    visualStrategy: critique.revisedVisualStrategy.trim().slice(0, 1600) || packageValue.visualStrategy,
    document,
    creativeReviews: [...packageValue.creativeReviews, critique.review],
    diagnostics: packageValue.diagnostics.slice(0, 40),
    provisional: true,
    publicationState: "working",
  };
}


export function prepareNorthstarConceptStudyDocument(
  document: NorthstarWebArtifactDocument,
  input: Pick<NorthstarCodeArtifactGenerationInput, "objective" | "artifactType" | "userRequest" | "dataBundle">,
): NorthstarWebArtifactDocument {
  const normalized = normalizedDocument(document, input);
  const deliveryOnly = [
    /must visibly display the app name/i,
    /must use the supplied .* app icon/i,
    /must visibly display the flow name/i,
    /must use data-ns-flow-id/i,
    /must visibly use at least/i,
    /screenshots must appear in authoritative flow order/i,
    /main headline appears to repeat/i,
  ];
  const issues = validateWebArtifactDocument(normalized, input).filter(
    (issue) => !deliveryOnly.some((pattern) => pattern.test(issue)),
  );
  if (issues.length) {
    const syntaxIssue = issues.some((issue) => issue.startsWith("JavaScript syntax error"));
    throw new NorthstarArtifactSourceError(syntaxIssue ? "javascript-syntax" : "validation", issues);
  }
  return normalized;
}

export function createNorthstarConceptStudyPackage(input: {
  artifactId: string;
  objective: string;
  audience: string;
  artifactType: string;
  dataBundle: CanvasCodeArtifactDataBundle;
  thinkingDepth: NorthstarThinkingDepth;
  creativeDirection: NorthstarCreativeDirection;
  concept: NorthstarCreativeConcept;
  parentRevisionId?: string;
}): NorthstarGeneratedCodeArtifactPackage {
  const study = input.concept.study;
  if (!study) throw new NorthstarArtifactSourceError("empty-output", ["The selected concept did not include a rendered study document."]);
  const document = prepareNorthstarConceptStudyDocument(study.document, {
    objective: input.objective,
    artifactType: input.artifactType,
    userRequest: input.objective,
    dataBundle: input.dataBundle,
  });
  const width = Math.max(960, Math.min(12000, Math.round(study.preferredWidth)));
  const height = Math.max(600, Math.min(12000, Math.round(study.preferredHeight)));
  const fingerprint = createHash("sha256").update(`${document.html}\n${document.css}`).digest("hex").slice(0, 14);
  return {
    schema: NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
    artifactId: input.artifactId,
    revisionId: `${input.artifactId}-concept-${input.concept.id}-${fingerprint}`,
    parentRevisionId: input.parentRevisionId,
    title: input.creativeDirection.brief.editorialThesis || input.concept.name,
    description: `${input.concept.medium ?? "Visual medium"}: ${study.visualIntent}`.slice(0, 500),
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    visualStrategy: [
      `Medium: ${input.concept.medium ?? "problem-specific visual artifact"}`,
      `Viewer job: ${input.concept.viewerJob ?? "understand the answer and proof"}`,
      `Spatial behaviour: ${input.concept.spatialBehavior ?? input.concept.compositionLanguage}`,
      `Study intent: ${study.visualIntent}`,
    ].join("\n"),
    document,
    mutationJournal: [],
    surfaceId: input.artifactId,
    preferredWidth: width,
    preferredHeight: height,
    layoutBaseWidth: width,
    layoutBaseHeight: height,
    intrinsicBounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    minimumWidth: Math.max(540, Math.round(width / 2)),
    minimumHeight: Math.max(380, Math.round(height / 2)),
    stages: normalizeStages([]),
    dataBundle: input.dataBundle,
    thinkingDepth: input.thinkingDepth,
    creativeDirection: input.creativeDirection,
    creativeReviews: [],
    diagnostics: ["Rendered concept study selected from multiple private visual prototypes."],
    provisional: true,
    publicationState: "working",
  };
}


function provisionalWorkingTitle(input: { objective: string; dataBundle: CanvasCodeArtifactDataBundle }): string {
  const appNames = Array.from(new Set(input.dataBundle.apps.map((app) => app.name.trim()).filter(Boolean))).slice(0, 3);
  if (appNames.length >= 2) return `${appNames[0]} × ${appNames[1]}`;
  if (appNames.length === 1) return appNames[0];
  const objective = input.objective
    .replace(/^(?:build|create|make|design|show|compare|analyse|analyze|research|explore)\s+/i, "")
    .split(/[.!?\n]|\s+[—–-]\s+/)[0]
    .trim();
  return objective && objective.length <= 96 ? objective : "Northstar visual study";
}

function workingIdentityMarkup(dataBundle: CanvasCodeArtifactDataBundle): string {
  const identities = dataBundle.apps.slice(0, 6).map((app, index) => `
    <article class="working-identity" data-ns-node-id="identity-${index + 1}">
      ${app.iconUrl ? `<img src="${escapeWorkingHtml(app.iconUrl)}" alt="${escapeWorkingHtml(app.name)} icon">` : ""}
      <div><strong>${escapeWorkingHtml(app.name)}</strong><span>${escapeWorkingHtml(app.summary || "Grounded product context")}</span></div>
    </article>`).join("");
  return identities
    ? `<section class="working-identities" data-ns-node-id="identities">${identities}</section>`
    : "";
}

export function createNorthstarWorkingArtifactPackage(input: {
  artifactId: string;
  objective: string;
  audience: string;
  artifactType: string;
  dataBundle: CanvasCodeArtifactDataBundle;
  phase: CanvasCodeArtifactStage["phase"];
  thinkingDepth: NorthstarThinkingDepth;
  parentRevisionId?: string;
  creativeDirection?: NorthstarCreativeDirection;
  message?: string;
  previousPackage?: NorthstarGeneratedCodeArtifactPackage;
}): NorthstarGeneratedCodeArtifactPackage {
  const phaseIndex = Math.max(0, REQUIRED_PHASES.indexOf(input.phase));
  const title = input.creativeDirection?.brief.editorialThesis || provisionalWorkingTitle(input);
  const designActs = input.creativeDirection?.selectedConcept.designActs ?? [];
  const activeAct = designActs[Math.min(phaseIndex, Math.max(0, designActs.length - 1))] || input.message || "Curating the strongest grounded material.";
  const appByName = new Map(input.dataBundle.apps.map((app) => [app.name.toLowerCase(), app]));
  const screensById = new Map(input.dataBundle.screenshots.map((screen) => [screen.id, screen]));
  const identities = workingIdentityMarkup(input.dataBundle);
  const flows = input.dataBundle.flows.slice(0, 4).map((flow) => {
    const app = appByName.get(flow.appName.toLowerCase());
    const screens = flow.screenshotIds.map((id) => screensById.get(id)).filter(Boolean).slice(0, 12);
    const flowNodeId = `flow-${normalizeId(flow.id, "flow")}`;
    const identity = `<div class="working-flow__identity" data-ns-node-id="${flowNodeId}-identity">${app?.iconUrl ? `<img data-ns-node-id="${flowNodeId}-icon" src="${escapeWorkingHtml(app.iconUrl)}" alt="${escapeWorkingHtml(flow.appName)} icon">` : ""}<div><strong data-ns-node-id="${flowNodeId}-app-name">${escapeWorkingHtml(flow.appName)}</strong><span data-ns-node-id="${flowNodeId}-flow-name">${escapeWorkingHtml(flow.flowName)}</span></div></div>`;
    const sequence = screens.map((screen, screenIndex) => { const screenNodeId = `${flowNodeId}-screen-${normalizeId(screen!.id, String(screen!.index ?? screenIndex))}`; return `<figure data-ns-node-id="${screenNodeId}" data-ns-evidence-id="${escapeWorkingHtml(screen!.id)}"><img data-ns-node-id="${screenNodeId}-image" src="${escapeWorkingHtml(screen!.imageUrl ?? "")}" alt="${escapeWorkingHtml(screen!.title)}"></figure>`; }).join("");
    return `<section class="working-flow" data-ns-node-id="${flowNodeId}" data-ns-flow-id="${escapeWorkingHtml(flow.id)}" data-ns-stage="evidence">${identity}<div class="working-flow__sequence" data-ns-node-id="${flowNodeId}-sequence">${sequence || '<p class="working-empty">Grounded screens are arriving.</p>'}</div></section>`;
  }).join("");
  const longestFlowWidth = input.dataBundle.flows.reduce((largest, flow) => {
    const screenWidth = /desktop|web/i.test(flow.platform ?? "") ? 260 : 176;
    const count = Math.min(12, flow.screenshotIds.length);
    return Math.max(largest, 420 + count * screenWidth + Math.max(0, count - 1) * 20);
  }, 0);
  const computedWidth = 1480; // starting surface only; the live browser measures content-driven growth.
  const computedHeight = Math.max(720, 330 + Math.max(1, input.dataBundle.flows.slice(0, 4).length) * 280);
  const width = input.previousPackage?.preferredWidth ?? computedWidth;
  const height = Math.max(computedHeight, input.previousPackage?.preferredHeight ?? 0);
  const document: NorthstarWebArtifactDocument = {
    schema: NORTHSTAR_WEB_ARTIFACT_DOCUMENT_SCHEMA,
    html: `<main class="ns-artifact ns-working-artifact" data-ns-node-id="artboard" data-ns-design-kernel="v1" data-ns-publication="working"><header data-ns-node-id="header" data-ns-stage="foundation"><p class="working-kicker" data-ns-node-id="kicker">Northstar · live artboard</p><h1 class="ns-thesis" data-ns-node-id="title">${escapeWorkingHtml(title)}</h1><p class="working-deck" data-ns-node-id="deck">${escapeWorkingHtml(input.message || input.dataBundle.coverageSummary || activeAct)}</p><div class="working-act" data-ns-node-id="current-act"><span>Current design act</span><strong data-ns-node-id="current-act-text">${escapeWorkingHtml(activeAct)}</strong></div></header><div class="working-evidence" data-ns-node-id="evidence">${flows || identities}</div><section class="working-synthesis" data-ns-node-id="synthesis" data-ns-stage="analysis"></section><section class="working-decision" data-ns-node-id="decision" data-ns-stage="recommendation"></section></main>`,
    css: `.ns-working-artifact{width:2360px;max-width:2360px;min-width:1180px;min-height:${height}px;padding:44px 52px 60px;background:radial-gradient(circle at 30% -15%,rgba(107,77,255,.12),transparent 38%),linear-gradient(180deg,#fdfcff,#f6f4fb);color:#151620;font-family:Inter,ui-sans-serif,system-ui,sans-serif;display:grid;align-content:start;gap:30px}.ns-working-artifact header{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:32px;align-items:end}.working-kicker{grid-column:1/-1;margin:0;color:#6b4dff;font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.ns-working-artifact .ns-thesis{margin:0;font-size:56px;line-height:.97;letter-spacing:-.055em;max-width:1050px}.working-deck{margin:14px 0 0;color:#6b6e7d;font-size:16px;line-height:1.5;max-width:920px}.working-act{align-self:start;padding:16px 18px;border-left:2px solid #6b4dff;background:rgba(255,255,255,.72)}.working-act span{display:block;color:#8b8f9f;font-size:11px;text-transform:uppercase;letter-spacing:.12em}.working-act strong{display:block;margin-top:8px;font-size:17px;line-height:1.35}.working-evidence{display:grid;gap:24px}.working-evidence:empty{display:none}.working-identities{display:flex;flex-wrap:wrap;gap:14px;padding-top:20px;border-top:1px solid rgba(78,67,135,.13)}.working-identity{display:flex;align-items:center;gap:14px;min-width:300px;max-width:520px;padding:14px 18px;background:rgba(255,255,255,.66);border:1px solid rgba(78,67,135,.10);border-radius:18px}.working-identity img{width:52px;height:52px;border-radius:15px;object-fit:cover}.working-identity strong{display:block;font-size:18px}.working-identity span{display:block;margin-top:4px;color:#737686;font-size:13px;line-height:1.35}.working-flow{display:grid;grid-template-columns:180px max-content;gap:26px;align-items:center;padding:22px 0;border-top:1px solid rgba(78,67,135,.13)}.working-flow__identity{position:sticky;left:0;display:flex;align-items:center;gap:13px;background:#f9f8fd;padding-right:18px;z-index:1}.working-flow__identity img{width:48px;height:48px;border-radius:14px;object-fit:cover}.working-flow__identity strong{display:block;font-size:20px}.working-flow__identity span{display:block;margin-top:4px;color:#737686;font-size:13px}.working-flow__sequence{display:flex;align-items:flex-end;gap:20px;min-height:286px;width:max-content;overflow:visible}.working-flow figure{margin:0;width:184px;min-width:184px;flex:0 0 184px}.working-flow figure img{width:100%;height:auto;max-height:286px;object-fit:contain;filter:drop-shadow(0 12px 18px rgba(43,34,93,.08))}.working-empty{margin:0;color:#7f8290;font-size:15px}.working-synthesis:empty,.working-decision:empty{display:none}.working-synthesis,.working-decision{display:grid;gap:18px}.ns-artifact [data-ns-node-id]{transition:transform 320ms cubic-bezier(.2,.8,.2,1),opacity 240ms ease,width 320ms ease,height 320ms ease,margin 320ms ease,padding 320ms ease}`,
    javascript: "",
  };
  const fingerprint = createHash("sha256").update(`${input.phase}:${document.html}`).digest("hex").slice(0, 14);
  return {
    schema: NORTHSTAR_GENERATED_CODE_ARTIFACT_SCHEMA,
    artifactId: input.artifactId,
    revisionId: `${input.artifactId}-working-${input.phase}-${fingerprint}`,
    parentRevisionId: input.parentRevisionId,
    title,
    description: input.message || "Northstar is building the visual solution live.",
    objective: input.objective,
    audience: input.audience,
    artifactType: input.artifactType,
    visualStrategy: `A coherent live checkpoint. The selected medium and bespoke composition are still evolving. Current design act: ${activeAct}`,
    document,
    mutationJournal: [],
    surfaceId: input.artifactId,
    preferredWidth: width,
    preferredHeight: height,
    layoutBaseWidth: width,
    layoutBaseHeight: height,
    intrinsicBounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    minimumWidth: 1180,
    minimumHeight: Math.max(420, Math.round(height / 2)),
    stages: normalizeStages([]),
    dataBundle: input.dataBundle,
    thinkingDepth: input.thinkingDepth,
    creativeDirection: input.creativeDirection,
    creativeReviews: [],
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  };
}


function liveFlowNodeId(flowId: string): string {
  return `flow-${normalizeId(flowId, "flow")}`;
}

function stableNodeHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function liveScreenNodeId(flowId: string, screenshotId: string, index: number): string {
  return `${liveFlowNodeId(flowId)}-screen-${String(index).padStart(2, "0")}-${stableNodeHash(`${flowId}:${screenshotId}`)}`;
}

function liveFlowMarkup(
  dataBundle: CanvasCodeArtifactDataBundle,
  flow: CanvasCodeArtifactDataBundle["flows"][number],
): string {
  const app = dataBundle.apps.find((candidate) => candidate.name.toLowerCase() === flow.appName.toLowerCase());
  const screensById = new Map(dataBundle.screenshots.map((screen) => [screen.id, screen]));
  const nodeId = liveFlowNodeId(flow.id);
  const screens = flow.screenshotIds.map((id) => screensById.get(id)).filter(Boolean).slice(0, 24);
  const images = screens.map((screen, position) => {
    const screenNodeId = liveScreenNodeId(flow.id, screen!.id, screen!.index ?? position);
    return `<figure data-ns-node-id="${screenNodeId}" data-ns-evidence-id="${escapeWorkingHtml(screen!.id)}"><img data-ns-node-id="${screenNodeId}-image" src="${escapeWorkingHtml(screen!.imageUrl ?? "")}" alt="${escapeWorkingHtml(screen!.title)}"></figure>`;
  }).join("");
  return `<section class="working-flow" data-ns-node-id="${nodeId}" data-ns-flow-id="${escapeWorkingHtml(flow.id)}" data-ns-stage="evidence"><div class="working-flow__identity" data-ns-node-id="${nodeId}-identity">${app?.iconUrl ? `<img data-ns-node-id="${nodeId}-icon" src="${escapeWorkingHtml(app.iconUrl)}" alt="${escapeWorkingHtml(flow.appName)} icon">` : ""}<div><strong data-ns-node-id="${nodeId}-app-name">${escapeWorkingHtml(flow.appName)}</strong><span data-ns-node-id="${nodeId}-flow-name">${escapeWorkingHtml(flow.flowName)}</span></div></div><div class="working-flow__sequence" data-ns-node-id="${nodeId}-sequence">${images || '<p class="working-empty" data-ns-node-id="' + nodeId + '-empty">Grounded screens are arriving.</p>'}</div></section>`;
}

function buildGranularResearchOperations(input: {
  previous: CanvasCodeArtifactDataBundle;
  next: CanvasCodeArtifactDataBundle;
}): NorthstarArtboardMutationOperation[] {
  const operations: NorthstarArtboardMutationOperation[] = [];
  const previousFlows = new Map(input.previous.flows.map((flow) => [flow.id, flow]));
  const previousScreens = new Set(input.previous.screenshots.map((screen) => screen.id));
  const screensById = new Map(input.next.screenshots.map((screen) => [screen.id, screen]));
  const appsByName = new Map(input.next.apps.map((app) => [app.name.toLowerCase(), app]));

  for (const flow of input.next.flows.slice(0, 4)) {
    const flowNodeId = liveFlowNodeId(flow.id);
    const previousFlow = previousFlows.get(flow.id);
    if (!previousFlow) {
      const predecessor = input.previous.flows.find((candidate) =>
        candidate.appName.toLowerCase() === flow.appName.toLowerCase() && candidate.id !== flow.id,
      );
      if (predecessor) operations.push({ op: "remove", targetId: liveFlowNodeId(predecessor.id) });
      operations.push({ op: "insert-html", targetId: "evidence", position: "beforeend", html: liveFlowMarkup(input.next, flow) });
      continue;
    }
    operations.push({ op: "set-text", targetId: `${flowNodeId}-app-name`, text: flow.appName });
    operations.push({ op: "set-text", targetId: `${flowNodeId}-flow-name`, text: flow.flowName });
    const app = appsByName.get(flow.appName.toLowerCase());
    if (app?.iconUrl) operations.push({ op: "set-attributes", targetId: `${flowNodeId}-icon`, attributes: { src: app.iconUrl, alt: `${flow.appName} icon` } });

    const desiredNodeIds: string[] = [];
    flow.screenshotIds.slice(0, 24).forEach((screenshotId, position) => {
      const screen = screensById.get(screenshotId);
      if (!screen) return;
      const nodeId = liveScreenNodeId(flow.id, screenshotId, screen.index ?? position);
      desiredNodeIds.push(nodeId);
      if (!previousScreens.has(screenshotId) || !previousFlow.screenshotIds.includes(screenshotId)) {
        operations.push({
          op: "insert-html",
          targetId: `${flowNodeId}-sequence`,
          position: "beforeend",
          html: `<figure data-ns-node-id="${nodeId}" data-ns-evidence-id="${escapeWorkingHtml(screen.id)}"><img data-ns-node-id="${nodeId}-image" src="${escapeWorkingHtml(screen.imageUrl ?? "")}" alt="${escapeWorkingHtml(screen.title)}"></figure>`,
        });
      } else {
        operations.push({ op: "set-attributes", targetId: `${nodeId}-image`, attributes: { src: screen.imageUrl ?? null, alt: screen.title } });
      }
    });
    let beforeId: string | undefined;
    for (const nodeId of [...desiredNodeIds].reverse()) {
      operations.push({ op: "move", targetId: nodeId, parentId: `${flowNodeId}-sequence`, beforeId });
      beforeId = nodeId;
    }
    operations.push({ op: "remove", targetId: `${flowNodeId}-empty` });
  }

  let beforeFlowId: string | undefined;
  for (const flow of [...input.next.flows.slice(0, 4)].reverse()) {
    const nodeId = liveFlowNodeId(flow.id);
    operations.push({ op: "move", targetId: nodeId, parentId: "evidence", beforeId: beforeFlowId });
    beforeFlowId = nodeId;
  }
  if (input.next.flows.length > 0) operations.push({ op: "remove", targetId: "identities" });
  return operations;
}

export function createNorthstarWorkingMutationPackage(input: {
  previousPackage: NorthstarGeneratedCodeArtifactPackage;
  dataBundle: CanvasCodeArtifactDataBundle;
  phase: CanvasCodeArtifactStage["phase"];
  message: string;
  creativeDirection?: NorthstarCreativeDirection;
}): NorthstarGeneratedCodeArtifactPackage {
  const phaseIndex = Math.max(0, REQUIRED_PHASES.indexOf(input.phase));
  const title = input.creativeDirection?.brief.editorialThesis || input.previousPackage.title;
  const designActs = input.creativeDirection?.selectedConcept.designActs ?? [];
  const activeAct = designActs[Math.min(phaseIndex, Math.max(0, designActs.length - 1))] || input.message;
  const operations: NorthstarArtboardMutationOperation[] = [
    { op: "set-text", targetId: "title", text: title },
    { op: "set-text", targetId: "deck", text: input.message || input.dataBundle.coverageSummary },
    { op: "set-text", targetId: "current-act-text", text: activeAct || input.message },
    ...buildGranularResearchOperations({ previous: input.previousPackage.dataBundle, next: input.dataBundle }),
  ];
  operations.push({
    op: "set-css-layer",
    layerId: "research-evolution",
    css: input.phase === "evidence"
      ? `[data-ns-node-id="evidence"]{gap:30px}[data-ns-node-id="header"]{padding-bottom:10px}`
      : input.phase === "analysis"
        ? `[data-ns-node-id="header"]{grid-template-columns:minmax(0,1fr) 340px}[data-ns-node-id="evidence"]{gap:36px}`
        : input.phase === "recommendation"
          ? `[data-ns-node-id="artboard"]{gap:42px}`
          : `[data-ns-node-id="artboard"]{letter-spacing:-.005em}`,
  });
  const draft: NorthstarArtboardMutationDraft = {
    title,
    description: input.message || input.previousPackage.description,
    visualStrategy: `The same live artboard is being adjusted through the ${input.phase} phase.`,
    visibleChange: `Updated the same artboard with the latest ${input.phase} evidence and composition state.`,
    geometryIntent: input.phase === "evidence" ? "expand-horizontal" : input.phase === "analysis" ? "expand-vertical" : "recompose",
    transitionMs: 360,
    operations,
  };
  return appendNorthstarArtboardMutation({
    previous: { ...input.previousPackage, dataBundle: input.dataBundle, creativeDirection: input.creativeDirection ?? input.previousPackage.creativeDirection },
    draft,
    label: `Live ${input.phase} adjustment`,
    phase: input.phase,
    intent: input.message,
    diagnostics: [`Northstar v0.4.8.1 granularly updated the original surface during ${input.phase}.`],
  });
}

function escapeWorkingHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
