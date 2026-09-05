import type { CanvasV2ExternalResearchRequest } from "@/lib/canvas-v2/discovery-state";
import type {
  CanvasV2EvidenceProvider,
  CanvasV2EvidenceProviderRequest,
  CanvasV2EvidenceProviderResult,
} from "@/lib/canvas-v2/evidence-bridge";
import {
  CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
  fetchCanvasV2ProviderJsonWithModelChain,
} from "@/lib/canvas-v2/provider-reliability";
import {
  buildCanvasV2StructuredProviderRequest,
  extractCanvasV2StructuredText,
} from "@/lib/canvas-v2/structured-provider";
import type {
  CanvasV2EvidenceAuthority,
  CanvasV2EvidencePacket,
  CanvasV2EvidenceSource,
} from "@/lib/canvas-v2/types";

export const CANVAS_V2_OPENAI_WEB_PROVIDER_ID = "openai-web-search";

const DESCRIPTOR = {
  id: CANVAS_V2_OPENAI_WEB_PROVIDER_ID,
  label: "Public web",
  domains: ["external"] as const,
  kinds: ["document", "statement", "image"] as CanvasV2EvidencePacket["kind"][],
};

const SYSTEM = `You are North Star's bounded external evidence researcher. Use web search only to answer the supplied exact research question and evidence gap.

Research is a discovery move, not a content harvest. Prefer primary, official, directly inspectable sources and respect the requested freshness. Stop when the stated stopping condition is satisfied, when the source ceiling is reached, or when further searching is unlikely to change the inquiry. Distinguish what a source directly states from your interpretation. Report contradictions rather than smoothing them away. Never fabricate a URL, publisher, date, quotation, metric, image, or chart.

Every finding must cite one exact source URL that you actually opened or received from web search. A finding is one concise, decision-relevant statement, not a page summary. When visual evidence was requested, visualUrl must be the exact image_url from a returned image_result, while sourceUrl remains the page that authorizes the claim. Use canvasCandidate only when the finding or visual is materially useful as an inspectable canvas witness; ordinary supporting sources belong in discovery memory and should remain false. Return JSON only.`;

const nullableString = { type: ["string", "null"] } as const;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    queries: { type: "array", items: { type: "string" }, maxItems: 8 },
    findings: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          statement: { type: "string" },
          sourceUrl: { type: "string" },
          sourceTitle: { type: "string" },
          sourceClass: { type: "string", enum: ["primary", "official", "dataset", "report", "news", "analysis", "community", "unknown"] },
          publisher: nullableString,
          author: nullableString,
          publishedAt: nullableString,
          eventAt: nullableString,
          access: { type: "string", enum: ["open", "partial", "paywalled", "inaccessible", "unknown"] },
          authority: { type: "string", enum: ["observed", "calculated", "inferred"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          limitations: { type: "array", items: { type: "string" }, maxItems: 8 },
          metrics: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                value: { type: ["number", "string"] },
                unit: nullableString,
                definition: { type: "string" },
                timeRangeLabel: nullableString,
              },
              required: ["label", "value", "unit", "definition", "timeRangeLabel"],
            },
          },
          visualUrl: nullableString,
          visualType: { anyOf: [{ type: "string", enum: ["image", "chart", "table", "document"] }, { type: "null" }] },
          visualCaption: nullableString,
          materiality: { type: "number", minimum: 0, maximum: 1 },
          canvasCandidate: { type: "boolean" },
        },
        required: ["title", "statement", "sourceUrl", "sourceTitle", "sourceClass", "publisher", "author", "publishedAt", "eventAt", "access", "authority", "confidence", "limitations", "metrics", "visualUrl", "visualType", "visualCaption", "materiality", "canvasCandidate"],
      },
    },
    conflicts: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          sourceUrls: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        },
        required: ["summary", "sourceUrls"],
      },
    },
    unresolved: { type: "array", items: { type: "string" }, maxItems: 8 },
    stoppingReason: { type: "string" },
  },
  required: ["summary", "queries", "findings", "conflicts", "unresolved", "stoppingReason"],
} as const;

interface WebFinding {
  title: string;
  statement: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceClass: CanvasV2EvidenceSource["sourceClass"];
  publisher?: string;
  author?: string;
  publishedAt?: string;
  eventAt?: string;
  access: NonNullable<CanvasV2EvidenceSource["access"]>;
  authority: Exclude<CanvasV2EvidenceAuthority, "supplied">;
  confidence: "high" | "medium" | "low";
  limitations: string[];
  metrics: Array<{ label: string; value: number | string; unit?: string; definition: string; timeRangeLabel?: string }>;
  visualUrl?: string;
  visualType?: "image" | "chart" | "table" | "document";
  visualCaption?: string;
  materiality: number;
  canvasCandidate: boolean;
}

interface WebResearchOutput {
  summary: string;
  queries: string[];
  findings: WebFinding[];
  conflicts: Array<{ summary: string; sourceUrls: string[] }>;
  unresolved: string[];
  stoppingReason: string;
}

function safeText(value: unknown, maximum = 1_200): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalText(value: unknown, maximum = 1_200): string | undefined {
  const result = safeText(value, maximum);
  return result || undefined;
}

function safeStrings(value: unknown, maximumItems = 8, maximumLength = 500): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => safeText(item, maximumLength)).filter(Boolean))).slice(0, maximumItems);
}

export function canonicalizeCanvasV2ExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|referrer)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch {
    return undefined;
  }
}

function stableToken(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function collectWebSourceUrls(payload: unknown): { urls: Set<string>; imageUrls: Set<string> } {
  const urls = new Set<string>();
  const imageUrls = new Set<string>();
  const visit = (value: unknown, key?: string): void => {
    if (typeof value === "string" && ["url", "source_url", "source_website_url", "image_url", "thumbnail_url"].includes(key ?? "")) {
      const canonical = canonicalizeCanvasV2ExternalUrl(value);
      if (canonical) {
        if (key === "image_url" || key === "thumbnail_url") imageUrls.add(canonical);
        else urls.add(canonical);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [entryKey, entry] of Object.entries(value as Record<string, unknown>)) visit(entry, entryKey);
  };
  visit(payload);
  return { urls, imageUrls };
}

function parseOutput(value: unknown, allowedSources: { urls: ReadonlySet<string>; imageUrls: ReadonlySet<string> }): WebResearchOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("External research returned an invalid evidence report.");
  const input = value as Record<string, unknown>;
  const findings = (Array.isArray(input.findings) ? input.findings : []).map((entry): WebFinding => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("External research returned an invalid finding.");
    const finding = entry as Record<string, unknown>;
    const sourceUrl = canonicalizeCanvasV2ExternalUrl(safeText(finding.sourceUrl, 2_000));
    if (!sourceUrl || !allowedSources.urls.has(sourceUrl)) throw new Error("External research cited a source URL that was not returned by web search.");
    const visualUrl = optionalText(finding.visualUrl, 2_000);
    const canonicalVisualUrl = visualUrl ? canonicalizeCanvasV2ExternalUrl(visualUrl) : undefined;
    if (visualUrl && (!canonicalVisualUrl || !allowedSources.imageUrls.has(canonicalVisualUrl))) throw new Error("External research cited a visual URL that was not returned as an image result.");
    const sourceClass = ["primary", "official", "dataset", "report", "news", "analysis", "community"].includes(String(finding.sourceClass))
      ? finding.sourceClass as NonNullable<CanvasV2EvidenceSource["sourceClass"]>
      : "unknown";
    const access = ["open", "partial", "paywalled", "inaccessible"].includes(String(finding.access))
      ? finding.access as NonNullable<CanvasV2EvidenceSource["access"]>
      : "unknown";
    const authority = finding.authority === "calculated" || finding.authority === "inferred" ? finding.authority : "observed";
    const visualType = ["image", "chart", "table", "document"].includes(String(finding.visualType))
      ? finding.visualType as WebFinding["visualType"]
      : undefined;
    return {
      title: safeText(finding.title, 240),
      statement: safeText(finding.statement, 1_200),
      sourceUrl,
      sourceTitle: safeText(finding.sourceTitle, 300),
      sourceClass,
      publisher: optionalText(finding.publisher, 240),
      author: optionalText(finding.author, 240),
      publishedAt: optionalText(finding.publishedAt, 80),
      eventAt: optionalText(finding.eventAt, 80),
      access,
      authority,
      confidence: finding.confidence === "high" || finding.confidence === "low" ? finding.confidence : "medium",
      limitations: safeStrings(finding.limitations, 8, 500),
      metrics: (Array.isArray(finding.metrics) ? finding.metrics : []).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const metric = entry as Record<string, unknown>;
        const label = safeText(metric.label, 240);
        const definition = safeText(metric.definition, 600);
        const value = typeof metric.value === "number" && Number.isFinite(metric.value) ? metric.value : safeText(metric.value, 160);
        return label && definition && value !== "" ? [{
          label,
          value,
          unit: optionalText(metric.unit, 80),
          definition,
          timeRangeLabel: optionalText(metric.timeRangeLabel, 160),
        }] : [];
      }).slice(0, 6),
      // Validate through a canonical identity, but render the exact returned
      // image URL. Reordering a signed CDN query string can invalidate it.
      visualUrl,
      visualType,
      visualCaption: optionalText(finding.visualCaption, 500),
      materiality: Math.max(0, Math.min(1, typeof finding.materiality === "number" ? finding.materiality : 0)),
      canvasCandidate: finding.canvasCandidate === true,
    };
  }).filter((finding) => finding.title && finding.statement && finding.sourceTitle);
  const conflicts = (Array.isArray(input.conflicts) ? input.conflicts : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const conflict = entry as Record<string, unknown>;
    const sourceUrls = safeStrings(conflict.sourceUrls, 6, 2_000)
      .map(canonicalizeCanvasV2ExternalUrl)
      .filter((url): url is string => Boolean(url && allowedSources.urls.has(url)));
    const summary = safeText(conflict.summary, 1_000);
    return summary && sourceUrls.length > 1 ? [{ summary, sourceUrls }] : [];
  }).slice(0, 8);
  return {
    summary: safeText(input.summary, 1_600),
    queries: safeStrings(input.queries, 8, 300),
    findings,
    conflicts,
    unresolved: safeStrings(input.unresolved, 8, 500),
    stoppingReason: safeText(input.stoppingReason, 1_000),
  };
}

function packetsFromOutput(output: WebResearchOutput, request: CanvasV2ExternalResearchRequest, retrievedAt: string): CanvasV2EvidencePacket[] {
  const byUrl = new Map<string, WebFinding[]>();
  for (const finding of output.findings) byUrl.set(finding.sourceUrl, [...(byUrl.get(finding.sourceUrl) ?? []), finding]);
  const packets = [...byUrl.entries()].slice(0, request.maxSources).map(([canonicalUrl, findings]): CanvasV2EvidencePacket => {
    const lead = [...findings].sort((left, right) => right.materiality - left.materiality)[0];
    const sourceToken = stableToken(canonicalUrl);
    const isPdf = (() => {
      try { return /\.pdf$/i.test(new URL(canonicalUrl).pathname); } catch { return false; }
    })();
    const source: CanvasV2EvidenceSource = {
      providerId: CANVAS_V2_OPENAI_WEB_PROVIDER_ID,
      providerLabel: DESCRIPTOR.label,
      sourceId: `external-source:${sourceToken}`,
      sourceType: isPdf ? "pdf" : lead.sourceClass === "report" || lead.visualType === "document" ? "report" : "web-page",
      label: lead.sourceTitle,
      sourceUrl: canonicalUrl,
      canonicalUrl,
      publisher: lead.publisher,
      author: lead.author,
      publishedAt: lead.publishedAt,
      eventAt: lead.eventAt,
      sourceClass: lead.sourceClass,
      access: lead.access,
      retrievedAt,
      query: request.question,
      filters: {
        searches: output.queries.join(" | ").slice(0, 1_200),
        stoppingReason: output.stoppingReason.slice(0, 1_000),
      },
      permission: lead.access === "inaccessible" ? "limited" : "authorized",
      freshness: request.freshness === "historical" ? "historical" : request.freshness === "any" ? "unknown" : "current-snapshot",
    };
    const highestMateriality = Math.max(...findings.map((finding) => finding.materiality));
    const sourceConflicts = output.conflicts.filter((conflict) => conflict.sourceUrls.includes(canonicalUrl));
    return {
      schema: "canvas-v2.evidence-packet.v1",
      id: `external-packet:${sourceToken}`,
      kind: lead.visualUrl ? "image" : findings.some((finding) => finding.metrics.length) ? "metric" : isPdf ? "document" : "statement",
      title: lead.title,
      summary: findings.map((finding) => finding.statement).join(" ").slice(0, 1_800),
      authority: findings.some((finding) => finding.authority === "inferred") ? "inferred" : findings.some((finding) => finding.authority === "calculated") ? "calculated" : "observed",
      source,
      assets: lead.visualUrl ? [{
        id: `external-asset:${sourceToken}`,
        url: lead.visualUrl,
        label: lead.visualCaption ?? lead.title,
        description: lead.statement,
        kind: "image",
        authority: lead.authority,
        source,
        packetId: `external-packet:${sourceToken}`,
        capturedAt: lead.publishedAt ?? retrievedAt,
        limitations: lead.limitations,
      }] : [],
      facts: [
        ...findings.map((finding) => ({
          id: `external-fact:${stableToken(`${canonicalUrl}:${finding.statement}`)}`,
          label: finding.title,
          value: finding.statement,
          authority: finding.authority,
          description: `Reported by ${finding.sourceTitle}; confidence ${finding.confidence}.`,
        })),
        ...sourceConflicts.map((conflict) => ({
          id: `external-conflict-position:${stableToken(`${canonicalUrl}:${conflict.summary}`)}`,
          label: `Disputed evidence · ${conflict.summary}`,
          value: findings.map((finding) => finding.statement).join(" ").slice(0, 1_200),
          authority: "observed" as const,
          description: "This source position conflicts with another active source position retained in the discovery graph.",
        })),
      ],
      metrics: findings.flatMap((finding) => finding.metrics.map((metric) => ({
        id: `external-metric:${stableToken(`${canonicalUrl}:${metric.label}:${metric.value}:${metric.timeRangeLabel ?? ""}`)}`,
        label: metric.label,
        value: metric.value,
        unit: metric.unit,
        format: typeof metric.value === "number" ? "number" as const : "text" as const,
        definition: metric.definition,
        authority: finding.authority,
        timeRange: metric.timeRangeLabel ? { label: metric.timeRangeLabel } : undefined,
      }))),
      limitations: Array.from(new Set([
        ...findings.flatMap((finding) => finding.limitations),
        ...sourceConflicts.map((conflict) => `Conflicting evidence: ${conflict.summary}`),
        ...(lead.access === "paywalled" || lead.access === "partial" ? ["Only partial source access was available."] : []),
      ])),
      tags: ["external", lead.sourceClass ?? "unknown", request.freshness, ...findings.map((finding) => finding.confidence)],
      createdAt: retrievedAt,
      continuationKey: canonicalUrl,
      presentation: {
        state: "graph-only",
        materiality: highestMateriality,
        reason: "External sources enter discovery memory before presentation selection.",
      },
    };
  });
  const promoted = [...packets]
    .filter((packet) => (request.visualEvidence !== "required" || packet.assets.length > 0)
      && packet.presentation!.materiality >= 0.72
      && output.findings.some((finding) => finding.sourceUrl === packet.source.canonicalUrl && finding.canvasCandidate))
    .sort((left, right) => Number(Boolean(right.assets.length)) - Number(Boolean(left.assets.length)) || right.presentation!.materiality - left.presentation!.materiality)
    .slice(0, 1);
  const promotedIds = new Set(promoted.map((packet) => packet.id));
  return packets.map((packet) => promotedIds.has(packet.id) ? {
    ...packet,
    presentation: { ...packet.presentation!, state: "promoted", reason: packet.assets.length ? "A material visual witness earned canvas space." : "A material source finding earned one bounded canvas witness." },
  } : packet);
}

interface CacheEntry {
  expiresAt: number;
  result: CanvasV2EvidenceProviderResult;
}
const CACHE = new Map<string, CacheEntry>();

function cacheKey(model: string, request: CanvasV2EvidenceProviderRequest): string {
  return `${model}:${stableToken(JSON.stringify({
    instruction: request.instruction,
    targetNames: request.targetNames,
    research: request.externalResearchRequest,
  }))}`;
}

function freshnessIssue(packet: CanvasV2EvidencePacket, request: CanvasV2ExternalResearchRequest, retrievedAt: string): CanvasV2EvidenceProviderResult["issues"][number] | undefined {
  if (request.freshness === "any" || request.freshness === "historical" || request.freshnessWindowDays === null) return undefined;
  const published = packet.source.publishedAt ? Date.parse(packet.source.publishedAt) : Number.NaN;
  if (!Number.isFinite(published)) return { code: "stale", message: `Freshness could not be verified for ${packet.source.label}.`, targetName: packet.source.label };
  const ageDays = Math.max(0, (Date.parse(retrievedAt) - published) / 86_400_000);
  return ageDays > request.freshnessWindowDays
    ? { code: "stale", message: `${packet.source.label} is older than the ${request.freshnessWindowDays}-day evidence window.`, targetName: packet.source.label }
    : undefined;
}

function cloneResult(result: CanvasV2EvidenceProviderResult): CanvasV2EvidenceProviderResult {
  return structuredClone(result);
}

export function createCanvasV2OpenAIWebEvidenceProvider(input: {
  model: string;
  requestSignal: AbortSignal;
  fetcher?: typeof fetch;
}): CanvasV2EvidenceProvider {
  return {
    descriptor: { ...DESCRIPTOR, domains: [...DESCRIPTOR.domains], kinds: [...DESCRIPTOR.kinds] },
    async retrieve(providerRequest: CanvasV2EvidenceProviderRequest): Promise<CanvasV2EvidenceProviderResult> {
      const request = providerRequest.externalResearchRequest;
      if (!request) throw new Error("External evidence retrieval requires a bounded research request.");
      const key = cacheKey(input.model, providerRequest);
      const cached = CACHE.get(key);
      if (cached && cached.expiresAt > Date.now()) return cloneResult(cached.result);
      const researchContext = {
        instruction: providerRequest.instruction,
        researchRequest: request,
        targetNames: providerRequest.targetNames,
        contract: {
          maximumSources: request.maxSources,
          canvasPromotionBudget: 1,
          graphDefault: "All valid sources remain graph-only unless one material witness clearly earns promotion.",
        },
      };
      let parsed: WebResearchOutput | undefined;
      const response = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
        models: [input.model],
        maxInvalidResponsesPerModel: CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
        requestSignal: input.requestSignal,
        attemptRole: "external-researcher",
        fetcher: input.fetcher,
        validatePayload: (payload, model) => {
          const allowedSources = collectWebSourceUrls(payload);
          if (!allowedSources.urls.size) throw new Error("Web search returned no inspectable source URLs.");
          const text = extractCanvasV2StructuredText(payload, model);
          if (!text) throw new Error("External research returned no evidence report.");
          parsed = parseOutput(JSON.parse(text), allowedSources);
        },
        requestForModel: (model, correction) => {
          const provider = buildCanvasV2StructuredProviderRequest({
            model,
            system: SYSTEM,
            parts: [{ text: JSON.stringify(researchContext) }],
            schemaName: "canvas_v2_external_evidence",
            schema: RESPONSE_SCHEMA,
            maxOutputTokens: 6_000,
            maxInputImages: 0,
            maxTextCharacters: 80_000,
            reasoningEffort: "low",
            correction,
            tools: [{
              type: "web_search",
              search_context_size: request.freshness === "current" ? "high" : "medium",
              ...(request.visualEvidence !== "unnecessary" ? {
                search_content_types: ["image", "text"],
                image_settings: { max_results: Math.min(3, request.maxSources), caption: true },
              } : {}),
            }],
            toolChoice: "required",
            include: request.visualEvidence === "unnecessary"
              ? ["web_search_call.action.sources"]
              : ["web_search_call.action.sources", "web_search_call.results"],
          });
          return { url: provider.url, init: provider.init, audit: provider.audit };
        },
      });
      if (!parsed) throw new Error("External research could not be validated.");
      const retrievedAt = new Date().toISOString();
      const packets = packetsFromOutput(parsed, request, retrievedAt);
      const issues: CanvasV2EvidenceProviderResult["issues"] = [
        ...(!packets.length ? [{ code: "unavailable" as const, message: "The bounded web search returned no source-backed findings." }] : []),
        ...(request.visualEvidence === "required" && !packets.some((packet) => packet.assets.length)
          ? [{ code: "unavailable" as const, message: "The bounded web search returned no source-backed visual evidence." }]
          : []),
        ...parsed.conflicts.map((conflict) => ({ code: "conflict" as const, message: conflict.summary })),
        ...parsed.unresolved.map((message) => ({ code: "unavailable" as const, message })),
        ...packets.flatMap((packet) => {
          const stale = freshnessIssue(packet, request, retrievedAt);
          const access = packet.source.access === "paywalled" || packet.source.access === "partial" || packet.source.access === "inaccessible"
            ? { code: "inaccessible" as const, message: `${packet.source.label} was only ${packet.source.access}.`, targetName: packet.source.label }
            : undefined;
          return [stale, access].filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));
        }),
      ];
      const packetsWithIssues = packets.map((packet) => {
        const sourceBoundaries = issues
          .filter((issue) => issue.targetName === packet.source.label)
          .map((issue) => issue.message);
        return sourceBoundaries.length ? {
          ...packet,
          limitations: Array.from(new Set([...packet.limitations, ...sourceBoundaries])),
        } : packet;
      });
      const result: CanvasV2EvidenceProviderResult = {
        provider: { ...DESCRIPTOR, domains: [...DESCRIPTOR.domains], kinds: [...DESCRIPTOR.kinds] },
        packets: packetsWithIssues,
        sources: packetsWithIssues.map((packet) => packet.source),
        issues,
        providerAttempts: response.attempts,
      };
      CACHE.set(key, { expiresAt: Date.now() + 5 * 60_000, result: cloneResult(result) });
      while (CACHE.size > 32) CACHE.delete(CACHE.keys().next().value!);
      return result;
    },
  };
}
