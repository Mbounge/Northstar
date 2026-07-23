import { createNorthstarLedgerHash } from "@/lib/canvas-ledger/northstar-ledger-value";
import type {
  NorthstarActivityDraft,
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";
import {
  collectNorthstarKnownEvidenceIdentities,
  exactIdentityLedgerValues,
} from "@/lib/canvas-ai/northstar-evidence-identities";
import type { NorthstarTurnEvidenceAsset } from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  verifiedArtboardCommitCount,
  hasDesignIntelligenceResult,
  hasGroundedResearchResult,
  hasScreenshotGroundedResearchResult,
  hasSuccessfulVerificationAfterLatestArtboardCommit,
} from "@/lib/canvas-ai/northstar-turn-intelligence";
import {
  parseNorthstarArtboardMutationDraft,
  parseNorthstarProjectionState,
} from "@/lib/canvas-projection/validation";
import {
  applyNorthstarProjectionOperations,
  diffNorthstarProjectionStates,
} from "@/lib/canvas-projection/state";
import type {
  NorthstarProjectionElementNode,
  NorthstarProjectionNode,
  NorthstarProjectionOperation,
  NorthstarProjectionStyleDeclaration,
} from "@/lib/canvas-projection/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
    : [];
}

function ledgerArray(value: unknown): NorthstarLedgerValue[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is NorthstarLedgerValue => entry !== undefined)
    : [];
}

export function northstarObjectiveNeedsResilientVisualPipeline(objective: string): boolean {
  return /\b(?:artboard|canvas|visual|design|presentation|slides?|diagram|board|composition|layout|poster|infographic|comparison|journey|storyboard|flows?|screenshots?|working surface)\b/i.test(objective);
}

function objectiveNeedsTenantFlows(objective: string): boolean {
  return /\b(?:flows?|onboarding|browsing|screenshots?|screens?)\b/i.test(objective);
}

function objectiveNeedsScreenshots(objective: string): boolean {
  return /\b(?:screenshots?|screens?)\b/i.test(objective)
    || (northstarObjectiveNeedsResilientVisualPipeline(objective) && objectiveNeedsTenantFlows(objective));
}

function objectiveRequestsProgression(objective: string): boolean {
  return /\b(?:progress(?:ion|ive|ively)?|evolv(?:e|es|ed|ing)?|working surface|came together|step[- ]by[- ]step|inspect how)\b/i.test(objective);
}

function requestedSessionType(objective: string): "onboarding" | "browsing" | undefined {
  if (/\bonboard(?:ing)?\b|\bregistration\b|\bactivation\b|\bsign[ -]?up\b/i.test(objective)) return "onboarding";
  if (/\bbrows(?:e|ing)\b|\bdiscover(?:y)?\b|\bexplor(?:e|ation)\b/i.test(objective)) return "browsing";
  return undefined;
}

function style(value: string, priority: "" | "important" = ""): NorthstarProjectionStyleDeclaration {
  return { value, priority };
}

function textNode(id: string, text: string): NorthstarProjectionNode {
  return { kind: "text", id, text };
}

function elementNode(input: {
  id: string;
  tag: string;
  attributes?: Record<string, string>;
  classes?: string[];
  styles?: Record<string, NorthstarProjectionStyleDeclaration>;
  children?: NorthstarProjectionNode[];
}): NorthstarProjectionElementNode {
  return {
    kind: "element",
    id: input.id,
    tag: input.tag,
    namespace: "html",
    attributes: input.attributes ?? {},
    classes: input.classes ?? [],
    styles: input.styles ?? {},
    children: input.children ?? [],
  };
}

function safeNodeToken(value: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9._:/-]+/g, "-")
    .replace(/^-+/, "");
  // Real tenant screenshot identities contain app/session/flow IDs and the
  // source URL. Their distinguishing suffix is commonly beyond the first 96
  // characters, so prefix truncation alone collapses several screenshots into
  // one DOM identity. Preserve a readable prefix and append a hash of the full
  // authoritative identity.
  const prefix = (sanitized || "evidence").slice(0, 64);
  const digest = createNorthstarLedgerHash(value).slice(-20);
  return `${prefix}-${digest}`;
}

function collectNodeIds(node: NorthstarProjectionNode, ids = new Set<string>()): Set<string> {
  ids.add(node.id);
  if (node.kind === "element") node.children.forEach((child) => collectNodeIds(child, ids));
  return ids;
}

function findNodeById(node: NorthstarProjectionNode, id: string): NorthstarProjectionNode | undefined {
  if (node.id === id) return node;
  if (node.kind !== "element") return undefined;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return undefined;
}

function firstTextNodeId(node: NorthstarProjectionNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.kind === "text") return node.id;
  for (const child of node.children) {
    const found = firstTextNodeId(child);
    if (found) return found;
  }
  return undefined;
}

function textTargetId(root: NorthstarProjectionNode, authoredElementId: string): string | undefined {
  return firstTextNodeId(findNodeById(root, authoredElementId));
}

function latestDesignResult(context: NorthstarLedgerLLMContext): Record<string, unknown> | undefined {
  return [...context.attempts].reverse().find((attempt) =>
    attempt.status === "completed"
    && isRecord(attempt.result)
    && attempt.result.schema === "northstar.design-intelligence-result.v1"
  )?.result as Record<string, unknown> | undefined;
}

function toolDetails(value: unknown, details: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => toolDetails(entry, details));
    return details;
  }
  if (!isRecord(value)) return details;
  if (typeof value.detail === "string" && value.detail.trim()) details.push(value.detail.trim());
  Object.values(value).forEach((entry) => toolDetails(entry, details));
  return details;
}

function failedToolGaps(value: unknown, gaps: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => failedToolGaps(entry, gaps));
    return gaps;
  }
  if (!isRecord(value)) return gaps;
  if (value.ok === false && typeof value.detail === "string") gaps.push(value.detail);
  Object.values(value).forEach((entry) => failedToolGaps(entry, gaps));
  return gaps;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function modelObservationText(value: Record<string, unknown>): string | undefined {
  return stringValue(value.observation)
    ?? stringValue(value.finding)
    ?? stringValue(value.summary)
    ?? stringValue(value.text)
    ?? stringValue(value.insight);
}

function normalizeVisualObservations(
  modelResult: unknown,
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[],
): NorthstarLedgerValue[] {
  const attached = new Map(evidenceAssets.map((asset) => [asset.id, asset]));
  const raw = isRecord(modelResult) ? modelResult.visualObservations : undefined;
  const output: NorthstarLedgerValue[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const ids = uniqueStrings([
        ...(typeof entry.screenshotId === "string" ? [entry.screenshotId] : []),
        ...stringArray(entry.screenshotIds),
      ]).filter((id) => attached.has(id));
      const fallbackAsset = evidenceAssets[index % Math.max(1, evidenceAssets.length)];
      const resolvedIds = ids.length > 0 ? ids : fallbackAsset ? [fallbackAsset.id] : [];
      const observation = modelObservationText(entry);
      if (!observation || resolvedIds.length === 0) return;
      output.push({
        ...(resolvedIds.length === 1
          ? { screenshotId: resolvedIds[0] }
          : { screenshotIds: resolvedIds }),
        observation,
        ...(stringValue(entry.implication) ? { implication: stringValue(entry.implication)! } : {}),
        ...(stringValue(entry.confidence) ? { confidence: stringValue(entry.confidence)! } : {}),
      });
    });
  }
  if (output.length > 0) return output;
  return evidenceAssets.map((asset) => ({
    screenshotId: asset.id,
    observation: `Authoritative screenshot evidence from ${asset.appName ?? "the selected app"}${asset.flowName ? ` · ${asset.flowName}` : ""} was attached for visual interpretation.`,
  }));
}

function evidenceGraph(identities: ReturnType<typeof collectNorthstarKnownEvidenceIdentities>): NorthstarLedgerValue[] {
  return [
    ...identities.apps.map((app) => ({
      type: "app-evidence",
      appId: app.appId,
      appName: app.appName,
    })),
    ...identities.flows.map((flow) => ({
      type: "flow-belongs-to-app",
      appId: flow.appId,
      flowId: flow.flowId,
      flowName: flow.flowName,
      ...(flow.platform ? { platform: flow.platform } : {}),
      ...(flow.sessionType ? { sessionType: flow.sessionType } : {}),
    })),
    ...identities.screenshots.map((screen) => ({
      type: "screenshot-belongs-to-flow",
      appId: screen.appId,
      flowId: screen.flowId,
      screenshotId: screen.screenshotId,
      ...(screen.screenshotIndex !== undefined ? { screenshotIndex: screen.screenshotIndex } : {}),
      ...(screen.imageUrl ? { imageUrl: screen.imageUrl } : {}),
    })),
  ];
}

export function normalizeNorthstarResearchResult(input: {
  modelResult: unknown;
  toolContext?: NorthstarLedgerValue;
  ledgerContext: NorthstarLedgerLLMContext;
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[];
  attachmentReport?: NorthstarLedgerValue;
}): NorthstarLedgerValue {
  const identities = collectNorthstarKnownEvidenceIdentities({
    ledgerContext: input.ledgerContext,
    toolContext: input.toolContext,
  });
  const model = isRecord(input.modelResult) ? input.modelResult : {};
  const findings = ledgerArray(model.findings);
  const deterministicFindings = toolDetails(input.toolContext).map((detail) => ({ type: "tool-finding", detail }));
  let visualObservations = normalizeVisualObservations(model, input.evidenceAssets);
  if (visualObservations.length === 0 && identities.screenshots.length > 0) {
    visualObservations = identities.screenshots.slice(0, 12).map((screen) => ({
      screenshotId: screen.screenshotId,
      observation: `The authoritative screenshot reference for ${screen.appName} · ${screen.flowName} is preserved for the artboard, but pixel inspection was unavailable in this model turn.`,
      inspectionStatus: "pixel-unavailable",
    }));
  }
  const report = isRecord(input.attachmentReport) ? input.attachmentReport : {};
  const unavailableAssets = Array.isArray(report.unavailableAssets) ? report.unavailableAssets : [];
  const gaps = uniqueStrings([
    ...stringArray(model.remainingGaps),
    ...failedToolGaps(input.toolContext),
    ...unavailableAssets.map((entry) => isRecord(entry)
      ? `Screenshot ${stringValue(entry.id) ?? "unknown"} was unavailable (${stringValue(entry.reason) ?? "unknown reason"}).`
      : "A requested screenshot was unavailable."),
  ]);
  const requiredScreens = objectiveNeedsScreenshots(input.ledgerContext.run.objective);
  const hasGroundedFlow = identities.apps.length > 0 && identities.flows.length > 0;
  const hasScreens = identities.screenshots.length > 0;
  const hasAttachedVisuals = input.evidenceAssets.length > 0;
  if (requiredScreens && hasScreens && !hasAttachedVisuals) {
    gaps.push("Screenshot identities and image URLs are available, but pixel inspection was unavailable in this model turn. The artboard may still render those authoritative assets.");
  }
  const sufficientForNextStep = hasGroundedFlow
    && (!requiredScreens || hasScreens)
    && failedToolGaps(input.toolContext).length === 0;
  return {
    schema: "northstar.research-result.v1",
    findings: findings.length > 0 ? findings : deterministicFindings,
    exactIdentities: exactIdentityLedgerValues(identities),
    evidenceGraphDelta: evidenceGraph(identities),
    visualObservations,
    remainingGaps: gaps,
    sufficientForNextStep,
    ...(Array.isArray(model.suggestedNextEvidenceActivities)
      ? { suggestedNextEvidenceActivities: ledgerArray(model.suggestedNextEvidenceActivities) }
      : {}),
  };
}

export function normalizeNorthstarDesignResult(input: {
  modelResult: unknown;
  ledgerContext: NorthstarLedgerLLMContext;
}): NorthstarLedgerValue {
  const model = isRecord(input.modelResult) ? input.modelResult : {};
  const identities = collectNorthstarKnownEvidenceIdentities(input.ledgerContext);
  const appNames = uniqueStrings(identities.apps.map((app) => app.appName));
  const subject = appNames.length > 0 ? appNames.join(" and ") : "the requested evidence";
  const objective = input.ledgerContext.run.objective;
  const editorialArgument = stringValue(model.editorialArgument)
    ?? `Reveal the most consequential contrast in ${subject} without turning the board into a screenshot inventory.`;
  const threeSecondRead = stringValue(model.threeSecondRead)
    ?? `${subject}: the decisive onboarding differences are visible at a glance.`;
  const visualThesis = stringValue(model.visualThesis)
    ?? `Use representative journey moments as evidence anchors, then let hierarchy and spacing expose the governing contrast.`;
  return {
    schema: "northstar.design-intelligence-result.v1",
    viewerJob: stringValue(model.viewerJob) ?? `Understand the answer to “${objective}” quickly and trust the evidence behind it.`,
    editorialArgument,
    threeSecondRead,
    visualThesis,
    informationTopology: stringValue(model.informationTopology) ?? "A decisive headline, balanced evidence lanes, and a concise synthesis layer.",
    evidenceHierarchy: Array.isArray(model.evidenceHierarchy)
      ? ledgerArray(model.evidenceHierarchy)
      : exactIdentityLedgerValues(identities).slice(0, 16),
    governingVisualIdea: stringValue(model.governingVisualIdea) ?? "Continuity versus interruption, expressed through aligned journey evidence.",
    spatialLogic: stringValue(model.spatialLogic) ?? "Keep stable app lanes, preserve screenshot order, and reserve a synthesis region below the evidence.",
    emotionalRegister: stringValue(model.emotionalRegister) ?? "Calm, exact, editorial, and confident.",
    signatureMove: stringValue(model.signatureMove) ?? "Use one enlarged decisive screenshot per subject with supporting moments receding behind it.",
    provisional: typeof model.provisional === "boolean" ? model.provisional : true,
    unresolvedQuestions: stringArray(model.unresolvedQuestions),
    nextVisibleMove: {
      intent: isRecord(model.nextVisibleMove) && stringValue(model.nextVisibleMove.intent)
        ? stringValue(model.nextVisibleMove.intent)!
        : "Place the first grounded screenshot evidence on the living artboard.",
      expectedVisibleDelta: isRecord(model.nextVisibleMove) && stringValue(model.nextVisibleMove.expectedVisibleDelta)
        ? stringValue(model.nextVisibleMove.expectedVisibleDelta)!
        : "The bootstrap becomes a real comparison surface with stable app anchors and readable evidence.",
      acceptanceCriteria: isRecord(model.nextVisibleMove)
        ? stringArray(model.nextVisibleMove.acceptanceCriteria)
        : ["At least one authoritative screenshot is visible.", "The board remains stable and readable."],
    },
    alternateDirectionsConsidered: Array.isArray(model.alternateDirectionsConsidered)
      ? model.alternateDirectionsConsidered.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          const concept = stringValue(entry.concept);
          const whyRejectedForNow = stringValue(entry.whyRejectedForNow);
          return concept && whyRejectedForNow ? [{ concept, whyRejectedForNow }] : [];
        })
      : [],
  };
}

function firstEvidenceAssets(
  context: NorthstarLedgerLLMContext,
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[],
): NorthstarTurnEvidenceAsset[] {
  if (evidenceAssets.length > 0) return [...evidenceAssets];
  return collectNorthstarKnownEvidenceIdentities(context).screenshots
    .filter((screen) => Boolean(screen.imageUrl))
    .map((screen) => ({
      id: screen.screenshotId,
      title: screen.screenshotName ?? `${screen.appName} screenshot`,
      imageUrl: screen.imageUrl!,
      appName: screen.appName,
      flowName: screen.flowName,
      screenshotIndex: screen.screenshotIndex,
    }));
}

function balancedAssets(assets: readonly NorthstarTurnEvidenceAsset[], maximum = 4): NorthstarTurnEvidenceAsset[] {
  const groups = new Map<string, NorthstarTurnEvidenceAsset[]>();
  const seen = new Set<string>();
  assets.forEach((asset) => {
    const identity = `${asset.id}\0${asset.imageUrl}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    const key = asset.appName ?? asset.flowName ?? "evidence";
    const group = groups.get(key) ?? [];
    group.push(asset);
    groups.set(key, group);
  });
  const output: NorthstarTurnEvidenceAsset[] = [];
  while (output.length < maximum && [...groups.values()].some((group) => group.length > 0)) {
    for (const group of groups.values()) {
      const asset = group.shift();
      if (asset) output.push(asset);
      if (output.length >= maximum) break;
    }
  }
  return output;
}

function evidenceLane(asset: NorthstarTurnEvidenceAsset, laneIndex: number): NorthstarProjectionElementNode {
  const token = `${safeNodeToken(asset.id)}-${laneIndex + 1}`;
  return elementNode({
    id: `northstar-evidence-lane-${token}`,
    tag: "article",
    attributes: { "aria-label": `${asset.appName ?? "App"} evidence` },
    styles: {
      display: style("grid"),
      gap: style("14px"),
      padding: style("18px"),
      border: style("1px solid rgba(107,78,255,.18)"),
      "border-radius": style("22px"),
      background: style(laneIndex % 2 === 0 ? "rgba(255,255,255,.94)" : "rgba(244,240,255,.92)"),
      "min-width": style("0"),
    },
    children: [
      elementNode({
        id: `northstar-evidence-label-${token}`,
        tag: "p",
        styles: {
          margin: style("0"),
          color: style("#6b4eff"),
          "font-size": style("12px"),
          "font-weight": style("800"),
          "letter-spacing": style(".1em"),
          "text-transform": style("uppercase"),
        },
        children: [textNode(`northstar-evidence-label-text-${token}`, asset.appName ?? `Evidence ${laneIndex + 1}`)],
      }),
      elementNode({
        id: `northstar-evidence-flow-${token}`,
        tag: "h2",
        styles: {
          margin: style("0"),
          "font-size": style("22px"),
          "line-height": style("1.15"),
          "letter-spacing": style("-.025em"),
        },
        children: [textNode(`northstar-evidence-flow-text-${token}`, asset.flowName ?? asset.title)],
      }),
      elementNode({
        id: `northstar-evidence-frame-${token}`,
        tag: "figure",
        styles: {
          margin: style("0"),
          overflow: style("hidden"),
          "border-radius": style("18px"),
          background: style("#eceaf2"),
          "box-shadow": style("0 18px 40px rgba(32,25,65,.14)"),
        },
        children: [
          elementNode({
            id: `northstar-evidence-image-${token}`,
            tag: "img",
            attributes: {
              src: asset.imageUrl,
              alt: `${asset.appName ?? "App"} · ${asset.flowName ?? asset.title}`,
              loading: "eager",
              decoding: "async",
            },
            styles: {
              display: style("block"),
              width: style("100%"),
              height: style("340px"),
              "object-fit": style("contain"),
              background: style("#f7f6fb"),
            },
          }),
        ],
      }),
    ],
  });
}

function fallbackEvidenceSection(
  context: NorthstarLedgerLLMContext,
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[],
): NorthstarProjectionElementNode {
  const assets = balancedAssets(firstEvidenceAssets(context, evidenceAssets), 4);
  const children: NorthstarProjectionNode[] = [
    elementNode({
      id: "northstar-grounded-evidence-heading",
      tag: "div",
      styles: { display: style("grid"), gap: style("8px"), "grid-column": style("1 / -1") },
      children: [
        elementNode({
          id: "northstar-grounded-evidence-kicker",
          tag: "p",
          styles: {
            margin: style("0"),
            color: style("#6b4eff"),
            "font-size": style("12px"),
            "font-weight": style("800"),
            "letter-spacing": style(".12em"),
            "text-transform": style("uppercase"),
          },
          children: [textNode("northstar-grounded-evidence-kicker-text", "Grounded evidence")],
        }),
        elementNode({
          id: "northstar-grounded-evidence-title",
          tag: "h2",
          styles: { margin: style("0"), "font-size": style("34px"), "letter-spacing": style("-.04em") },
          children: [textNode("northstar-grounded-evidence-title-text", "The comparison is now on the board.")],
        }),
      ],
    }),
    ...assets.map(evidenceLane),
  ];
  if (assets.length === 0) {
    children.push(elementNode({
      id: "northstar-grounded-evidence-empty",
      tag: "p",
      styles: { margin: style("0"), color: style("#575060"), "font-size": style("18px") },
      children: [textNode("northstar-grounded-evidence-empty-text", "The first authored structure is established while evidence retrieval continues.")],
    }));
  }
  return elementNode({
    id: "northstar-grounded-evidence",
    tag: "section",
    attributes: { "aria-label": "Grounded comparison evidence" },
    styles: {
      display: style("grid"),
      "grid-template-columns": style(assets.length > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"),
      gap: style("20px"),
      padding: style("28px"),
      border: style("1px solid rgba(107,78,255,.18)"),
      "border-radius": style("28px"),
      background: style("rgba(255,255,255,.72)"),
    },
    children,
  });
}

function fallbackInsightSection(context: NorthstarLedgerLLMContext): NorthstarProjectionElementNode {
  const design = latestDesignResult(context) ?? {};
  const argument = stringValue(design.editorialArgument) ?? "The evidence now resolves into a clear comparison.";
  const thesis = stringValue(design.visualThesis) ?? "Hierarchy promotes the decisive journey moments and lets supporting evidence recede.";
  const threeSecondRead = stringValue(design.threeSecondRead) ?? "The governing contrast is visible at a glance.";
  const cards = [
    ["Executive read", threeSecondRead],
    ["What the evidence says", argument],
    ["Visual thesis", thesis],
  ];
  return elementNode({
    id: "northstar-insight-stage",
    tag: "section",
    attributes: { "aria-label": "North Star synthesis" },
    styles: {
      display: style("grid"),
      "grid-template-columns": style("1.05fr 1fr 1fr"),
      gap: style("16px"),
    },
    children: cards.map(([label, copy], index) => elementNode({
      id: `northstar-insight-card-${index + 1}`,
      tag: "article",
      styles: {
        display: style("grid"),
        gap: style("18px"),
        padding: style("24px"),
        "border-radius": style("22px"),
        background: style(index === 0 ? "#17151f" : "rgba(239,235,255,.88)"),
        color: style(index === 0 ? "#fff" : "#17151f"),
      },
      children: [
        elementNode({
          id: `northstar-insight-label-${index + 1}`,
          tag: "p",
          styles: {
            margin: style("0"),
            color: style(index === 0 ? "#c8bbff" : "#6b4eff"),
            "font-size": style("12px"),
            "font-weight": style("800"),
            "letter-spacing": style(".1em"),
            "text-transform": style("uppercase"),
          },
          children: [textNode(`northstar-insight-label-text-${index + 1}`, label)],
        }),
        elementNode({
          id: `northstar-insight-copy-${index + 1}`,
          tag: "p",
          styles: { margin: style("0"), "font-size": style(index === 0 ? "25px" : "18px"), "line-height": style("1.35") },
          children: [textNode(`northstar-insight-copy-text-${index + 1}`, copy)],
        }),
      ],
    })),
  });
}

function modelDraftOperations(
  modelResult: unknown,
  state: ReturnType<typeof parseNorthstarProjectionState>,
): NorthstarProjectionOperation[] | undefined {
  if (!isRecord(modelResult) || !Array.isArray(modelResult.operations) || modelResult.operations.length === 0) return undefined;
  try {
    const draft = parseNorthstarArtboardMutationDraft({
      schema: "northstar.artboard-mutation-draft.v1",
      operations: modelResult.operations,
    });
    // Apply the model draft to the detached canonical state before returning it.
    // Invalid targets, duplicate IDs, unsafe attributes, and no-op plans fall
    // through to the deterministic grounded mutation instead of blocking the run.
    const target = applyNorthstarProjectionOperations(state, draft.operations);
    if (diffNorthstarProjectionStates(state, target).length === 0) return undefined;
    return [...draft.operations];
  } catch {
    return undefined;
  }
}

function insertedImageUrls(operations: readonly NorthstarProjectionOperation[]): string[] {
  const urls: string[] = [];
  const visit = (node: NorthstarProjectionNode): void => {
    if (node.kind !== "element") return;
    if (node.tag === "img" && typeof node.attributes.src === "string") urls.push(node.attributes.src);
    node.children.forEach(visit);
  };
  operations.forEach((operation) => {
    if (operation.type === "insert-node") visit(operation.node);
  });
  return urls;
}

function operationsContainGroundedScreenshot(
  operations: readonly NorthstarProjectionOperation[],
  groundedUrls: ReadonlySet<string>,
): boolean {
  const urls = insertedImageUrls(operations);
  return urls.length > 0 && urls.every((url) => groundedUrls.has(url));
}

function validatedMutationDraft(
  state: ReturnType<typeof parseNorthstarProjectionState>,
  operations: readonly NorthstarProjectionOperation[],
): NorthstarLedgerValue {
  const draft = parseNorthstarArtboardMutationDraft({
    schema: "northstar.artboard-mutation-draft.v1",
    operations,
  });
  const target = applyNorthstarProjectionOperations(state, draft.operations);
  if (diffNorthstarProjectionStates(state, target).length === 0) {
    throw new TypeError("The resilient artboard mutation produced no canonical change.");
  }
  return {
    schema: "northstar.artboard-mutation-draft.v1",
    operations: [...draft.operations] as unknown as NorthstarLedgerValue,
  };
}

export function normalizeNorthstarArtboardMutationResult(input: {
  modelResult: unknown;
  ledgerContext: NorthstarLedgerLLMContext;
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[];
}): NorthstarLedgerValue {
  const state = parseNorthstarProjectionState(input.ledgerContext.currentHead.stateSnapshot);
  const ids = collectNodeIds(state.root);
  const identities = collectNorthstarKnownEvidenceIdentities(input.ledgerContext);
  const groundedImageUrls = new Set(identities.screenshots.flatMap((screen) => screen.imageUrl ? [screen.imageUrl] : []));
  const modelOperations = modelDraftOperations(input.modelResult, state);
  const needsScreenshot = objectiveNeedsScreenshots(input.ledgerContext.run.objective);
  if (modelOperations && (
    !needsScreenshot
    || ids.has("northstar-grounded-evidence")
    || operationsContainGroundedScreenshot(modelOperations, groundedImageUrls)
  )) {
    return validatedMutationDraft(state, modelOperations);
  }

  const operations: NorthstarProjectionOperation[] = [];
  const appNames = uniqueStrings(identities.apps.map((app) => app.appName));
  const titleTextId = textTargetId(state.root, "northstar-title");
  const deckTextId = textTargetId(state.root, "northstar-deck");
  const statusTextId = textTargetId(state.root, "northstar-status-value");
  const evidenceTextId = textTargetId(state.root, "northstar-evidence-value");
  if (titleTextId) {
    operations.push({
      type: "set-text",
      nodeId: titleTextId,
      text: appNames.length > 1 ? `${appNames.join(" and ")}, compared with evidence.` : "A grounded visual story is taking shape.",
    });
  }
  if (deckTextId) {
    operations.push({
      type: "set-text",
      nodeId: deckTextId,
      text: "Representative journey moments stay visible while the analysis resolves into a clear executive reading path.",
    });
  }
  if (statusTextId) {
    operations.push({
      type: "set-text",
      nodeId: statusTextId,
      text: ids.has("northstar-grounded-evidence") ? "Refining the visual argument" : "Grounded evidence is now visible",
    });
  }
  if (evidenceTextId) {
    operations.push({
      type: "set-text",
      nodeId: evidenceTextId,
      text: `${identities.flows.length} exact flows and ${identities.screenshots.length} screenshots are retained with provenance.`,
    });
  }
  const authoredArtboard = findNodeById(state.root, "northstar-artboard");
  const layoutRoot = authoredArtboard?.kind === "element" ? authoredArtboard : state.root;
  operations.push({
    type: "set-styles",
    nodeId: layoutRoot.id,
    styles: {
      ...layoutRoot.styles,
      "min-height": style(ids.has("northstar-grounded-evidence") ? "1280px" : "1100px"),
      gap: style("32px"),
    },
  });
  if (!ids.has("northstar-grounded-evidence")) {
    operations.push({
      type: "insert-node",
      parentId: layoutRoot.id,
      index: layoutRoot.children.length,
      node: fallbackEvidenceSection(input.ledgerContext, input.evidenceAssets),
    });
  } else if (!ids.has("northstar-insight-stage")) {
    operations.push({
      type: "insert-node",
      parentId: layoutRoot.id,
      index: layoutRoot.children.length,
      node: fallbackInsightSection(input.ledgerContext),
    });
  } else if (ids.has("northstar-grounded-evidence-title-text")) {
    operations.push({
      type: "set-text",
      nodeId: "northstar-grounded-evidence-title-text",
      text: "The evidence has resolved into a focused visual argument.",
    });
  }
  return validatedMutationDraft(state, operations);
}

export function normalizeNorthstarVerificationResult(input: {
  modelResult: unknown;
  ledgerContext: NorthstarLedgerLLMContext;
}): NorthstarLedgerValue {
  const model = isRecord(input.modelResult) ? input.modelResult : {};
  const state = parseNorthstarProjectionState(input.ledgerContext.currentHead.stateSnapshot);
  const ids = collectNodeIds(state.root);
  const identities = collectNorthstarKnownEvidenceIdentities(input.ledgerContext);
  const hasImage = (() => {
    const visit = (node: NorthstarProjectionNode): boolean =>
      node.kind === "element" && (node.tag === "img" || node.children.some(visit));
    return visit(state.root);
  })();
  const requiredCommitCount = objectiveRequestsProgression(input.ledgerContext.run.objective) ? 2 : 1;
  const objectiveSatisfied = verifiedArtboardCommitCount(input.ledgerContext) >= requiredCommitCount;
  const evidenceGrounded = !objectiveNeedsScreenshots(input.ledgerContext.run.objective)
    || (identities.screenshots.length > 0 && hasImage);
  const artboardStable = input.ledgerContext.commits.some((commit) =>
    commit.taskKind === "artboard-mutation" && commit.projectionReceipt?.verified === true
  );
  const readingPathClear = objectiveNeedsScreenshots(input.ledgerContext.run.objective)
    ? ids.has("northstar-grounded-evidence")
    : state.root.children.length > 0;
  const modelReviewNotes = stringArray(model.issues);
  const issues = uniqueStrings([
    ...(!objectiveSatisfied ? ["The required verified visual progression is incomplete."] : []),
    ...(!evidenceGrounded ? ["The visible artboard does not yet contain grounded screenshot evidence."] : []),
    ...(!artboardStable ? ["No browser-verified artboard commit exists."] : []),
    ...(!readingPathClear ? ["The structural reading path is incomplete."] : []),
  ]);
  const allClear = objectiveSatisfied && evidenceGrounded && artboardStable && readingPathClear && issues.length === 0;
  return {
    schema: "northstar.verification-result.v1",
    objectiveSatisfied,
    evidenceGrounded,
    artboardStable,
    readingPathClear,
    issues,
    ...(modelReviewNotes.length > 0 ? { modelReviewNotes } : {}),
    recommendation: allClear ? "finalize" : "revise",
  };
}

export function buildNorthstarFallbackTaskResult(input: {
  task: NorthstarLedgerTask;
  modelResult?: unknown;
  toolContext?: NorthstarLedgerValue;
  ledgerContext: NorthstarLedgerLLMContext;
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[];
  attachmentReport?: NorthstarLedgerValue;
}): NorthstarLedgerValue {
  if (input.task.kind === "research") {
    return normalizeNorthstarResearchResult({
      modelResult: input.modelResult,
      toolContext: input.toolContext,
      ledgerContext: input.ledgerContext,
      evidenceAssets: input.evidenceAssets,
      attachmentReport: input.attachmentReport,
    });
  }
  if (input.task.kind === "analysis") {
    return normalizeNorthstarDesignResult({
      modelResult: input.modelResult,
      ledgerContext: input.ledgerContext,
    });
  }
  if (input.task.kind === "artboard-mutation") {
    return normalizeNorthstarArtboardMutationResult({
      modelResult: input.modelResult,
      ledgerContext: input.ledgerContext,
      evidenceAssets: input.evidenceAssets,
    });
  }
  if (input.task.kind === "verification") {
    return normalizeNorthstarVerificationResult({
      modelResult: input.modelResult,
      ledgerContext: input.ledgerContext,
    });
  }
  return isRecord(input.modelResult) ? input.modelResult as NorthstarLedgerValue : {};
}

function latestVerificationAfterLatestArtboardCommit(
  context: NorthstarLedgerLLMContext,
): Record<string, unknown> | undefined {
  const latestArtboardSequence = context.commits
    .filter((commit) => commit.taskKind === "artboard-mutation" && commit.projectionReceipt?.verified === true)
    .reduce((latest, commit) => Math.max(latest, commit.sequence), -1);
  if (latestArtboardSequence < 0) return undefined;
  const verification = [...context.commits]
    .reverse()
    .find((commit) => commit.taskKind === "verification" && commit.sequence > latestArtboardSequence);
  return verification?.result && typeof verification.result === "object" && !Array.isArray(verification.result)
    ? verification.result as Record<string, unknown>
    : undefined;
}

export function requiredNorthstarActivity(context: NorthstarLedgerLLMContext): NorthstarActivityDraft | null {
  const objective = context.run.objective;
  if (!northstarObjectiveNeedsResilientVisualPipeline(objective)) return null;
  if (objectiveNeedsTenantFlows(objective) && !hasGroundedResearchResult(context)) {
    const sessionType = requestedSessionType(objective);
    return {
      kind: "research",
      intent: "Resolve exact tenant apps, representative flows, and ordered screenshot evidence for the requested visual answer.",
      expectedOutcome: "A committed, identity-grounded evidence bundle with accessible representative screenshots.",
      executionInput: {
        researchGoal: objective,
        toolCalls: [{
          name: "prepare_composition_evidence",
          args: {
            query: objective,
            ...(sessionType ? { sessionType } : {}),
            maxApps: 4,
            maxFlowsPerApp: 1,
            maxScreensPerFlow: 8,
            limit: 24,
            selectionStrategy: "representative",
          },
        }],
      },
    };
  }
  if (objectiveNeedsScreenshots(objective) && !hasScreenshotGroundedResearchResult(context)) {
    return {
      kind: "research",
      intent: "Visually inspect the exact representative screenshots already committed for this objective.",
      expectedOutcome: "Screenshot-grounded observations tied to exact screenshot identities without rediscovering tenant data.",
      executionInput: {
        researchGoal: "Interpret the committed screenshot evidence and preserve exact identities.",
        reuseCommittedEvidence: true,
        toolCalls: [],
      },
    };
  }
  if (!hasDesignIntelligenceResult(context)) {
    return {
      kind: "analysis",
      intent: "Originate a grounded visual thesis and the next visible move for the living artboard.",
      expectedOutcome: "A validated design-intelligence direction grounded in the committed evidence.",
      executionInput: { analysisGoal: objective, reuseCommittedEvidence: true },
    };
  }
  const requiredCommits = objectiveRequestsProgression(objective) ? 2 : 1;
  if (verifiedArtboardCommitCount(context) < requiredCommits) {
    return {
      kind: "artboard-mutation",
      intent: verifiedArtboardCommitCount(context) === 0
        ? "Make the first meaningful grounded visual move on the canonical artboard."
        : "Refine the same artboard into a clearer, stronger visual argument.",
      expectedOutcome: verifiedArtboardCommitCount(context) === 0
        ? "At least one authoritative screenshot becomes visibly integrated into the stable artboard."
        : "A second cumulative verified state strengthens hierarchy and synthesis without replacing the board.",
      executionInput: {
        mutationGoal: objective,
        commitOrdinal: verifiedArtboardCommitCount(context) + 1,
        reuseCommittedEvidence: true,
      },
    };
  }
  const latestVerification = latestVerificationAfterLatestArtboardCommit(context);
  if (latestVerification?.recommendation === "revise") {
    return {
      kind: "artboard-mutation",
      intent: "Repair the same artboard using the latest verification findings without discarding verified evidence.",
      expectedOutcome: "The verification issues are resolved in a new cumulative browser-verified commit.",
      executionInput: {
        mutationGoal: objective,
        commitOrdinal: verifiedArtboardCommitCount(context) + 1,
        verificationIssues: Array.isArray(latestVerification.issues) ? latestVerification.issues : [],
        reuseCommittedEvidence: true,
      },
    };
  }
  if (!hasSuccessfulVerificationAfterLatestArtboardCommit(context)) {
    return {
      kind: "verification",
      intent: "Verify the latest browser-committed artboard against the objective and grounded evidence.",
      expectedOutcome: "A consistent finalization or revision recommendation tied to the latest verified HEAD.",
      executionInput: { verificationGoal: objective },
    };
  }
  return null;
}

function modelRecoveryStages(context: NorthstarLedgerLLMContext): string[] {
  const stages: string[] = [];
  for (const attempt of context.attempts) {
    if (!isRecord(attempt.evidence)) continue;
    const diagnostic = isRecord(attempt.evidence.modelDiagnostic)
      ? attempt.evidence.modelDiagnostic
      : undefined;
    const phase = stringValue(diagnostic?.phase);
    if (phase) stages.push(`${attempt.taskId}:${phase}`);
  }
  return uniqueStrings(stages);
}

export function deterministicNorthstarFinalSummary(context: NorthstarLedgerLLMContext): NorthstarLedgerValue {
  const identities = collectNorthstarKnownEvidenceIdentities(context);
  const recoveredModelStages = modelRecoveryStages(context);
  const degradedRecovery = recoveredModelStages.length > 0;
  return {
    message: degradedRecovery
      ? "North Star completed a grounded browser-verified artboard baseline, but one or more model stages required deterministic recovery. Review the composition before treating it as final creative polish."
      : "North Star completed the requested visual artifact and preserved the latest browser-verified artboard.",
    qualityStatus: degradedRecovery ? "degraded-recovery" : "model-assisted",
    requiresVisualReview: degradedRecovery,
    ...(degradedRecovery ? { recoveredModelStages } : {}),
    objective: context.run.objective,
    verifiedArtboardCommits: verifiedArtboardCommitCount(context),
    groundedApps: identities.apps.map((app) => ({ appId: app.appId, appName: app.appName })),
    groundedFlows: identities.flows.map((flow) => ({
      flowId: flow.flowId,
      flowName: flow.flowName,
      appId: flow.appId,
      appName: flow.appName,
    })),
    groundedScreenshotCount: identities.screenshots.length,
    headCommitHash: context.currentHead.hash,
  };
}
