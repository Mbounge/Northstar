import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeCanvasV2ExternalUrl,
  canvasV2RetainedResearchContext,
  createCanvasV2OpenAIWebEvidenceProvider,
} from "../lib/canvas-v2/external-evidence-provider";
import { canvasV2EvidencePacketsNeedingMaterialization } from "../lib/canvas-v2/evidence-packet-insertion";
import { compactCanvasV2EvidencePacketsForModel, mergeCanvasV2EvidencePackets } from "../lib/canvas-v2/evidence-packets";
import { runCanvasV2EvidenceBridge, type CanvasV2EvidenceProviderRequest } from "../lib/canvas-v2/evidence-bridge";
import {
  canvasV2DiscoveryMoveNeedsRetrieval,
  parseCanvasV2DiscoveryTransition,
} from "../lib/canvas-v2/discovery-orchestrator";
import { constrainCanvasV2ExternalDiscoveryProgress } from "../lib/canvas-v2/discovery-reliability";
import { createCanvasV2DiscoveryState } from "../lib/canvas-v2/discovery-state";
import { syncCanvasV2DiscoveryGraph } from "../lib/canvas-v2/discovery-graph";

const NOW = "2026-08-28T12:00:00.000Z";

function state() {
  return createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "new",
      objective: "Understand the current market",
      desiredOutcome: "A grounded market decision",
      framing: "Which current signal should change the decision?",
      inquiryKind: "business-investigation",
      evidenceNeed: "required",
      sourceCategories: ["external", "canvas"],
      materialUnknowns: ["What changed this quarter?"],
      completionCriteria: ["Current evidence is inspectable."],
      rationale: "The decision depends on current public evidence.",
    },
    now: NOW,
  });
}

function transition(externalResearchRequest: unknown, sourceCategories: string[] = ["external"]) {
  return {
    move: {
      id: "move:external:1",
      kind: "inspect-evidence",
      label: "Resolve the current market signal",
      question: "What changed this quarter?",
      rationale: "One current fact could change the recommendation.",
      expectedInformationGain: "Resolve the material market uncertainty.",
      sourceCategories,
      targetNames: [],
      evidenceNodeIds: [],
      cost: "medium",
      latency: "short",
      status: "active",
      visibleAction: "materialize-evidence",
      continueWhen: "The sources materially disagree.",
      stopWhen: "Two primary sources converge or the source ceiling is reached.",
      result: null,
      externalResearchRequest,
    },
    framing: null,
    latestUnderstanding: "Current public evidence is still missing.",
    addQuestions: [],
    resolveQuestionIds: [],
    statements: [],
    supersedeStatementIds: [],
    contradictions: [],
    candidates: [],
    progress: { stage: "investigating", label: "Checking the market", detail: "Resolving one current evidence gap." },
    completion: {
      criteria: ["Current evidence is inspectable."],
      satisfiedCriteria: [],
      materialOpenRequirements: ["What changed this quarter?"],
      readiness: "not-ready",
      rationale: "Current public evidence is still missing.",
    },
    clarification: null,
  };
}

const researchRequest = {
  question: "What changed in the market this quarter?",
  evidenceGap: "The canvas has no current market evidence.",
  sourceTypes: ["primary", "official", "visual"] as Array<"primary" | "official" | "visual">,
  freshness: "current" as const,
  freshnessWindowDays: 45,
  maxSources: 4,
  stoppingCondition: "Stop when two primary sources converge or four sources have been inspected.",
  visualEvidence: "preferred" as const,
};

function request(): CanvasV2EvidenceProviderRequest {
  return {
    instruction: "Research the current market and develop the board.",
    targetNames: [],
    domains: ["external"],
    externalResearchRequest: researchRequest,
  };
}

function webPayload() {
  const report = "https://Example.com/report/?utm_source=newsletter";
  const chart = "https://example.com/chart.png?utm_campaign=launch";
  const secondary = "https://news.example.org/coverage?ref=homepage";
  return {
    output: [
      { type: "web_search_call", action: { sources: [
        { type: "url", url: report, title: "Official market report" },
        { type: "url", url: secondary, title: "Contradictory coverage" },
      ] }, results: [{ type: "image_result", image_url: chart, thumbnail_url: "https://example.com/chart-thumb.png", source_website_url: report, caption: "Quarterly market movement" }] },
      { type: "message", content: [{
        type: "output_text",
        text: JSON.stringify({
          summary: "The primary report shows a material current shift, while one secondary source disputes its breadth.",
          queries: ["current market official report"],
          findings: [
            {
              title: "The current shift",
              statement: "The official report records a material current change.",
              sourceUrl: report,
              sourceTitle: "Official market report",
              sourceSubject: "A regional sample of customer firms, not the publishing institute",
              documentContext: "Survey findings about customers in one market",
              supportingPassage: "The regional customer sample grew this quarter.",
              sourceClass: "official",
              publisher: "Example Institute",
              author: null,
              publishedAt: "2026-08-20",
              eventAt: "2026-Q3",
              access: "open",
              authority: "observed",
              confidence: "high",
              limitations: ["The report covers one geography."],
              metrics: [{ label: "Market movement", value: 18, unit: "%", definition: "Quarter-over-quarter movement reported by the institute.", timeRangeLabel: "2026 Q3" }],
              visualUrl: chart,
              visualType: "chart",
              visualCaption: "Quarterly market movement",
              materiality: 0.94,
              canvasCandidate: true,
            },
            {
              title: "The breadth is disputed",
              statement: "Secondary coverage disputes whether the change is broad.",
              sourceUrl: secondary,
              sourceTitle: "Contradictory coverage",
              sourceClass: "news",
              publisher: "Example News",
              author: null,
              publishedAt: "2026-08-22",
              eventAt: null,
              access: "open",
              authority: "observed",
              confidence: "medium",
              limitations: ["The article does not publish its full methodology."],
              metrics: [],
              visualUrl: null,
              visualType: null,
              visualCaption: null,
              materiality: 0.68,
              canvasCandidate: false,
            },
          ],
          conflicts: [{ summary: "The sources disagree about the breadth of the change.", sourceUrls: [report, secondary] }],
          unresolved: [],
          stoppingReason: "The primary claim is established and the remaining disagreement is explicit.",
        }),
        annotations: [{ type: "url_citation", url: report }, { type: "url_citation", url: secondary }],
      }] },
    ],
  };
}

test("external discovery recovers a bounded request and never turns direct composition into browsing", () => {
  const current = state();
  const recovered = parseCanvasV2DiscoveryTransition(transition(null), current);
  assert.equal(recovered.move.externalResearchRequest?.question, "What changed this quarter?");
  assert.deepEqual(recovered.move.externalResearchRequest?.sourceTypes, ["primary", "official"]);
  assert.equal(recovered.move.externalResearchRequest?.maxSources, 4);
  assert.throws(() => parseCanvasV2DiscoveryTransition(transition(researchRequest, ["canvas"]), current), /Only an external discovery move/);
  assert.throws(() => parseCanvasV2DiscoveryTransition(transition({ ...researchRequest, sourceTypes: [] }), current), /at least one preferred source type/);
  const parsed = parseCanvasV2DiscoveryTransition(transition(researchRequest), current);
  assert.equal(parsed.move.externalResearchRequest?.maxSources, 4);
  assert.equal(canvasV2DiscoveryMoveNeedsRetrieval(parsed.move), true);
  assert.equal(canvasV2DiscoveryMoveNeedsRetrieval({ kind: "compose", sourceCategories: ["canvas"] }), false);
});

test("external URLs receive tracking-free stable identity", () => {
  assert.equal(canonicalizeCanvasV2ExternalUrl("https://Example.com/report/?utm_source=x&b=2&a=1#section"), "https://example.com/report?a=1&b=2");
  assert.equal(canonicalizeCanvasV2ExternalUrl("javascript:alert(1)"), undefined);
});

test("using external evidence for synthesis does not manufacture another research request", () => {
  for (const kind of ["compose", "compare", "revise-hypothesis", "summarize-boundary"] as const) {
    for (const request of [null, researchRequest]) {
      const input = transition(request, ["external", "canvas"]);
      input.move.kind = kind;
      input.move.visibleAction = "compose";
      const parsed = parseCanvasV2DiscoveryTransition({ ...input, sensemaking: {
        mode: "investigating", synthesis: "Compare the retained source findings.", operators: [], triangulations: [], uncertainties: [], materialEvidenceNodeIds: [], backgroundEvidenceNodeIds: [],
      } }, state());
      assert.deepEqual(parsed.move.sourceCategories, ["external", "canvas"]);
      assert.equal(parsed.move.externalResearchRequest, undefined, kind);
      assert.equal(canvasV2DiscoveryMoveNeedsRetrieval(parsed.move), false, kind);
    }
  }
  const followup = transition(researchRequest);
  followup.move.kind = "inspect-evidence";
  assert.equal(parseCanvasV2DiscoveryTransition(followup, state()).move.externalResearchRequest?.question, researchRequest.question);
});

test("OpenAI web evidence preserves all sources in memory, promotes one material witness, records conflict, and caches an identical resume", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "high", search_content_types: ["image", "text"], image_settings: { max_results: 3, caption: true } }]);
    assert.equal(body.tool_choice, "required");
    assert.deepEqual(body.include, ["web_search_call.action.sources", "web_search_call.results"]);
    assert.equal(body.max_tool_calls, undefined);
    return new Response(JSON.stringify(webPayload()), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, fetcher });
    const first = await runCanvasV2EvidenceBridge({ providers: [provider], request: request() });
    const second = await runCanvasV2EvidenceBridge({ providers: [provider], request: request() });
    assert.equal(calls, 1);
    assert.equal(first.packets.length, 2);
    assert.equal(first.packets.filter((packet) => packet.presentation?.state === "promoted").length, 1);
    assert.equal(first.packets.filter((packet) => packet.presentation?.state === "graph-only").length, 1);
    const promoted = first.packets.find((packet) => packet.presentation?.state === "promoted");
    assert.equal(promoted?.assets[0]?.kind, "image");
    assert.equal(promoted?.assets[0]?.url, "https://example.com/chart.png?utm_campaign=launch");
    assert.equal(promoted?.source.sourceUrl, "https://example.com/report");
    assert.equal(promoted?.source.sourceType, "web-page");
    assert.match(promoted!.facts[0].description!, /regional sample of customer firms, not the publishing institute/);
    assert.match(promoted!.facts[0].description!, /Survey findings about customers/);
    assert.match(promoted!.facts[0].description!, /extracted passage.*regional customer sample grew/);
    assert.equal(first.packets.some((packet) => packet.metrics.some((metric) => metric.value === 18)), true);
    assert.equal(first.issues.some((issue) => issue.code === "conflict"), true);
    const graph = syncCanvasV2DiscoveryGraph({ revisionId: "external-research", updatedAt: NOW, document: { html: "<main></main>", css: "" }, evidencePackets: first.packets });
    assert.equal(graph.index.contradictionGroupIds.length, 1);
    assert.equal(graph.edges.some((edge) => edge.kind === "challenges"), true);
    assert.equal(canvasV2EvidencePacketsNeedingMaterialization({ html: "<main></main>", css: "" }, first.packets).length, 0);
    assert.equal(mergeCanvasV2EvidencePackets(first.packets, second.packets).length, 2);
    assert.deepEqual(first.packets.map((packet) => packet.id), second.packets.map((packet) => packet.id));
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("a fabricated finding is excluded without rerunning valid research", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  const payload = webPayload();
  const message = (payload.output[1] as { content: Array<{ text: string }> }).content[0];
  const report = JSON.parse(message.text) as { findings: Array<{ sourceUrl: string }> };
  report.findings[0].sourceUrl = "https://fabricated.example/finding";
  message.text = JSON.stringify(report);
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, fetcher });
    const result = await provider.retrieve({ ...request(), externalResearchRequest: { ...researchRequest, question: "Unique fabricated URL test" } });
    assert.equal(calls, 1);
    assert.equal(result.packets.length, 1);
    assert.equal(result.packets[0].source.sourceUrl, "https://news.example.org/coverage");
    assert.ok(result.issues.some(issue => /excluded/.test(issue.message)));
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("an image result cannot be laundered into a page citation", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  const payload = webPayload();
  const message = (payload.output[1] as { content: Array<{ text: string }> }).content[0];
  const report = JSON.parse(message.text) as { findings: Array<{ sourceUrl: string }> };
  report.findings[0].sourceUrl = "https://example.com/chart.png?utm_campaign=launch";
  message.text = JSON.stringify(report);
  const fetcher: typeof fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, fetcher });
    const result = await provider.retrieve({ ...request(), instruction: "Unique image laundering test" });
    assert.equal(result.packets.length, 1);
    assert.equal(result.packets[0].source.sourceUrl, "https://news.example.org/coverage");
    assert.ok(result.issues.some(issue => /excluded/.test(issue.message)));
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("required visual evidence stays off-canvas when the search returns no validated image", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  const payload = webPayload();
  const message = (payload.output[1] as { content: Array<{ text: string }> }).content[0];
  const report = JSON.parse(message.text) as { findings: Array<{ visualUrl: string | null; visualType: string | null; canvasCandidate: boolean }> };
  for (const finding of report.findings) {
    finding.visualUrl = null;
    finding.visualType = null;
  }
  message.text = JSON.stringify(report);
  const fetcher: typeof fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, fetcher });
    const result = await provider.retrieve({
      ...request(),
      instruction: "Unique required visual test",
      externalResearchRequest: { ...researchRequest, visualEvidence: "required" },
    });
    assert.equal(result.packets.length, 2);
    assert.equal(result.packets.every((packet) => packet.presentation?.state === "graph-only"), true);
    assert.equal(result.issues.some((issue) => issue.code === "unavailable" && /visual evidence/.test(issue.message)), true);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("public research continues for new evidence gaps but never repeats an unchanged search", () => {
  const parsed = parseCanvasV2DiscoveryTransition(transition(researchRequest), state());
  const materiallyDifferent = parseCanvasV2DiscoveryTransition(transition({
    ...researchRequest,
    question: "Which official source contradicts the first finding?",
    evidenceGap: "The first search exposed a new contradiction.",
  }), state()).move;
  assert.equal(constrainCanvasV2ExternalDiscoveryProgress({ transition: parsed, acceptedMoves: [materiallyDifferent] }), parsed);

  const constrained = constrainCanvasV2ExternalDiscoveryProgress({
    transition: parsed,
    acceptedMoves: [parsed.move],
  });
  assert.equal(constrained.move.kind, "compose");
  assert.deepEqual(constrained.move.sourceCategories, ["canvas"]);
  assert.equal(constrained.move.externalResearchRequest, undefined);
  assert.equal(constrained.progress.label, "Turning the research into a decision");
});

test("external estimates retain inferred authority through packets and discovery graph metrics", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-key";
  try {
    const payload = webPayload();
    const item = payload.output.find((item) => item.type === "message")!.content![0];
    const report = JSON.parse(item.text);
    report.findings[0].authority = "inferred";
    report.findings[0].metrics[0].definition = "An estimate inferred from the source.";
    item.text = JSON.stringify(report);
    const provider = createCanvasV2OpenAIWebEvidenceProvider({
      model: "gpt-5.6-luna", requestSignal: new AbortController().signal,
      fetcher: async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    });
    const result = await provider.retrieve({ ...request(), externalResearchRequest: { ...researchRequest, question: "Estimate authority regression" } });
    const packet = result.packets.find((packet) => packet.metrics.length)!;
    assert.equal(packet.authority, "inferred");
    assert.equal(packet.metrics[0].authority, "inferred");
    assert.equal(compactCanvasV2EvidencePacketsForModel([packet])[0].metrics[0].authority, "inferred");
    const graph = syncCanvasV2DiscoveryGraph({ revisionId: "estimated", updatedAt: NOW, document: { html: "<main></main>", css: "" }, evidencePackets: result.packets });
    assert.equal(graph.nodes.find((node) => node.kind === "metric")?.authority, "inferred");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("text findings stay available for synthesis without an automatic source-summary board", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-key";
  try {
    const payload = webPayload();
    const item = payload.output.find(item => item.type === "message")!.content![0];
    const report = JSON.parse(item.text);
    for (const finding of report.findings) { finding.visualUrl = null; finding.canvasCandidate = true; finding.materiality = 0.95; }
    item.text = JSON.stringify(report);
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal,
      fetcher: async () => new Response(JSON.stringify(payload), { status: 200 }) });
    const result = await provider.retrieve({ ...request(), instruction: "Text witnesses should become an explanation" });
    assert.equal(result.packets.length, 2);
    assert.ok(result.packets.every(packet => packet.presentation?.state === "graph-only"));
    assert.equal(canvasV2EvidencePacketsNeedingMaterialization({ html: "<main></main>", css: "" }, result.packets).length, 0);
    assert.ok(compactCanvasV2EvidencePacketsForModel(result.packets).length > 0);
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("a relevant visual is retained when another finding on the same page leads the packet", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-key";
  try {
    const payload = webPayload();
    const item = payload.output.find(item => item.type === "message")!.content![0];
    const report = JSON.parse(item.text);
    report.findings.unshift({ ...report.findings[0], title: "Leading text finding", visualUrl: null, materiality: 0.99 });
    item.text = JSON.stringify(report);
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal,
      fetcher: async () => new Response(JSON.stringify(payload), { status: 200 }) });
    const result = await provider.retrieve({ ...request(), instruction: "Retain non-leading visual regression" });
    const visualPacket = result.packets.find(packet => packet.presentation?.state === "promoted")!;
    assert.equal(visualPacket.title, "Leading text finding");
    assert.equal(visualPacket.assets[0].url, "https://example.com/chart.png?utm_campaign=launch");
    assert.equal(visualPacket.assets[0].description, "The official report records a material current change.");
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("an entirely ungrounded research report is still rejected", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-key";
  try {
    const payload = webPayload();
    const item = payload.output.find(item => item.type === "message")!.content![0];
    const report = JSON.parse(item.text);
    for (const finding of report.findings) finding.sourceUrl = "https://fabricated.example/not-returned";
    item.text = JSON.stringify(report);
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal,
      fetcher: async () => new Response(JSON.stringify(payload), { status: 200 }) });
    await assert.rejects(() => provider.retrieve({ ...request(), instruction: "All sources invalid regression" }), /no valid findings remain|did not accept/);
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});


test("text-only research still collects source media when its destination is a composition", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  const readUrls: string[] = [];
  try {
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal,
      collectCompositionMedia: true,
      fetcher: async () => new Response(JSON.stringify(webPayload()), { status: 200 }),
      readSourceMedia: async url => {
        readUrls.push(url);
        return { url, mimeType: "text/html", bytes: Buffer.from('<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>') };
      },
    });
    const result = await provider.retrieve({ ...request(), externalResearchRequest: { ...researchRequest, visualEvidence: "unnecessary", question: "Text facts with optional composition media" } });
    assert.ok(readUrls.length > 0);
    assert.ok(result.packets.some(packet => packet.assets.some(asset => asset.mediaType === "video")));
    assert.ok(result.packets.some(packet => packet.facts.length));
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("different source scopes remain limitations without manufacturing disputed facts", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  try {
    const payload = webPayload();
    const message = payload.output.find(item => item.type === "message")!;
    const content = message.content![0];
    const report = JSON.parse(content.text!);
    report.sourceComparisons = report.conflicts.map((item: { summary: string; sourceUrls: string[] }) => ({ ...item, kind: "scope-difference", summary: "The sources cover different periods; this does not establish a disagreement." }));
    delete report.conflicts;
    content.text = JSON.stringify(report);
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal,
      fetcher: async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }) });
    const result = await runCanvasV2EvidenceBridge({ providers: [provider], request: { ...request(), externalResearchRequest: { ...researchRequest, question: "Do these two reports cover the same period?" } } });
    assert.ok(result.packets.some(packet => packet.limitations.some(limit => limit.startsWith("Scope difference:"))));
    assert.ok(result.packets.every(packet => packet.facts.every(fact => !fact.id.startsWith("external-conflict-position:"))));
    assert.equal(result.issues.filter(issue => issue.code === "conflict").length, 0);
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("research receives supplied pixels and its cache cannot reuse a report for different pixels", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  const requests: Array<{ input: Array<{ content: Array<{ type: string; image_url?: string; detail?: string; text?: string }> }> }> = [];
  const asset = (data: string) => ({ id: "upload:context", url: `data:image/png;base64,${data}`, label: "Original interface capture", kind: "image" as const,
    source: { providerId: "northstar-chat-upload", providerLabel: "Supplied", sourceId: "context", sourceType: "uploaded" as const, label: "Original interface capture", retrievedAt: NOW, permission: "authorized" as const } });
  const fetcher: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(webPayload()), { status: 200 });
  };
  const query = { ...request(), externalResearchRequest: { ...researchRequest, question: "Investigate the interaction in the original interface capture" } };
  try {
    const first = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, suppliedAssets: [asset("YQ==")], fetcher });
    await first.retrieve(query);
    await first.retrieve(query);
    const changed = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, suppliedAssets: [asset("Yg==")], fetcher });
    await changed.retrieve(query);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(body => body.input[0].content.filter(part => part.type === "input_image").map(part => part.image_url)),
      [["data:image/png;base64,YQ=="], ["data:image/png;base64,Yg=="]]);
    assert.ok(requests.every(body => body.input[0].content.find(part => part.type === "input_image")?.detail === "high"));
    assert.match(requests[0].input[0].content.map(part => part.text ?? "").join(" "), /never attribute its contents to a web page/);
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("unapproved or remote assets do not masquerade as inspected supplied images", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  try {
    const provider = createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal,
      suppliedAssets: [{ id: "unapproved", url: "data:image/png;base64,YQ==", kind: "image", label: "Unapproved" }],
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.input[0].content.some((part: { type: string }) => part.type === "input_image"), false);
        assert.match(JSON.stringify(body.input), /No supplied image pixels/);
        return new Response(JSON.stringify(webPayload()), { status: 200 });
      } });
    await provider.retrieve({ ...request(), externalResearchRequest: { ...researchRequest, question: "Inspect missing image context boundary" } });
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("follow-up research receives retained public passages and invalidates cached conclusions when they change", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  const contexts: Array<{ retainedResearch: ReturnType<typeof canvasV2RetainedResearchContext> }> = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const part = body.input[0].content.find((item: { text?: string }) => item.text?.startsWith('{"instruction"'));
    contexts.push(JSON.parse(part.text));
    return new Response(JSON.stringify(webPayload()), { status: 200 });
  };
  const query = { ...request(), externalResearchRequest: { ...researchRequest, question: "What does the workshop's new enrollment evidence change?" } };
  try {
    const initial = await createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, fetcher }).retrieve(query);
    const packet = { ...initial.packets[0], sourceSnapshot: { text: "The workshop has 80 enrolled students.", sha256: "first", retrievedAt: NOW, url: "https://example.com/workshop", scope: "Literal text", truncated: false } };
    const make = (text: string, question = "How many students enrolled?") => createCanvasV2OpenAIWebEvidenceProvider({ model: "gpt-5.6-luna", requestSignal: new AbortController().signal, fetcher,
      retainedEvidence: [{ ...packet, sourceSnapshot: { ...packet.sourceSnapshot, text } }], researchHistory: [{ question }] });
    const retained = make(packet.sourceSnapshot.text);
    await retained.retrieve(query);
    await retained.retrieve(query);
    await make("The workshop has 40 enrolled students.").retrieve(query);
    await make("The workshop has 40 enrolled students.", "Which applicants returned?").retrieve(query);
    assert.equal(contexts.length, 4, "identical context is cached; changed passages or questions require a new investigation");
    assert.equal(contexts[1].retainedResearch.sources[0].sourceSnapshot?.text, packet.sourceSnapshot.text);
    assert.deepEqual(contexts[1].retainedResearch.priorQuestions, ["How many students enrolled?"]);
    const privatePacket = { ...packet, source: { ...packet.source, providerId: "private-account-provider" } };
    const limitedPacket = { ...packet, source: { ...packet.source, permission: "limited" as const } };
    const context = canvasV2RetainedResearchContext([privatePacket, limitedPacket, ...Array.from({ length: 16 }, () => ({ ...packet, sourceSnapshot: { ...packet.sourceSnapshot, text: "A".repeat(20_000) } }))], []);
    assert.equal(context.sources.length, 12);
    assert.equal(context.omittedSourceCount, 4);
    assert.equal(context.sources.reduce((sum, source) => sum + (source.sourceSnapshot?.text.length ?? 0), 0), 32_000);
    assert.ok(context.sources.every(source => source.sourceSnapshot?.truncated));
    assert.ok(context.sources.every(source => !("assets" in source)));
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});
