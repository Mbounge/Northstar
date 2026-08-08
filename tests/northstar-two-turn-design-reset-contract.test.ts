import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const reset = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const diagnostics = fs.readFileSync(path.join(root, "lib/canvas-ai/canvas-diagnostics.ts"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/canvas/north-star-canvas-workspace.tsx"), "utf8");
const runtime = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");
const mutations = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-artboard-mutations.ts"), "utf8");
const artifactTypes = fs.readFileSync(path.join(root, "lib/canvas-artifacts/types.ts"), "utf8");

const removedDesignFiles = [
  "northstar-linear-design-session.ts",
  "northstar-linear-design-transaction.ts",
  "northstar-live-source-authorship.ts",
  "northstar-design-reference-pack.ts",
  "northstar-visual-observation.ts",
  "northstar-render-capture.ts",
  "northstar-creative-completion-invariant.ts",
  "northstar-gemini-creative-adapter.ts",
  "northstar-adaptive-creative-session.ts",
  "northstar-emergent-creative-authorship.ts",
  "northstar-emergent-design-intelligence.ts",
  "northstar-independent-creative-review.ts",
  "northstar-creative-closure-adjudication.ts",
  "northstar-creative-journal.ts",
  "northstar-creative-model-adapter.ts",
  "northstar-premium-design-contract.ts",
  "northstar-viewing-intent.ts",
  "northstar-evidence-aliases.ts",
];

test("the old model-facing design stack is physically removed", () => {
  for (const file of removedDesignFiles) {
    assert.equal(fs.existsSync(path.join(root, "lib/canvas-ai", file)), false, file);
  }
  assert.doesNotMatch(route, /buildLinearDesignArtifactPackage|NorthstarLinearDesignSession/);
});

test("all thinking modes execute the same seven cumulative benchmark instructions", () => {
  assert.match(reset, /1: "Place a Hello World card below the research\."/);
  assert.match(reset, /2: "Place a Hello World 2 card to the right of the research and vertically center-align it with the research\."/);
  assert.match(reset, /3: "Construct a visual relationship between the first Awin screenshot and the first Whop screenshot\."/);
  assert.match(reset, /4: "Create equal space between the first and second Awin screenshots and insert an annotation in that space\."/);
  assert.match(reset, /5: "Add an explanation to the Awin screenshot where the user chooses their role\."/);
  assert.match(reset, /6: "Make the Awin and Whop onboarding flows easier to distinguish as separate groups\."/);
  assert.match(reset, /7: "Create a new analysis area below the current onboarding flows and reuse the Awin screenshot where the user chooses their role there\. Preserve the original evidence and make the reused view clearly part of the new analysis area\."/);
  assert.match(route, /for \(const turn of \[1, 2, 3, 4, 5, 6, 7\] as const\)/);
  assert.match(route, /effectiveDesignMode: "fixed-seven-turn"/);
  assert.match(route, /temperature: 0/);
});

test("the orchestrator does not choose card styling, coordinates, or layout", () => {
  const systemInstruction = reset.match(/export function buildNorthstarDesignResetSystemInstruction[\s\S]*?\n}\n\nexport function buildNorthstarDesignResetModelInput/)?.[0] ?? "";
  assert.match(systemInstruction, /Decide the complete authored solution yourself/);
  assert.match(systemInstruction, /HTML, CSS, SVG, JavaScript, visual style, dimensions, spacing, layout method, placement/);
  assert.match(systemInstruction, /model-authored world-space positioning/);
  assert.match(systemInstruction, /explicit left\/top coordinates chosen from the measured graph/);
  assert.match(systemInstruction, /bounds and anchors describe the current committed revision/);
  assert.match(systemInstruction, /The model chooses every subject, reference, anchor, geometry mode, controlled axis, alignment, offset, dimension, style, route/);
  assert.match(systemInstruction, /measures the subject's actual rendered size/);
  assert.match(systemInstruction, /real containing-block coordinate space/);
  assert.match(systemInstruction, /owns CSS geometry on the controlled axes/);
  assert.doesNotMatch(systemInstruction, /left:\s*2450|top:\s*123|width:\s*300|request only bottom|request only right|card center|research center/);
  assert.doesNotMatch(reset, /design-reset-hello-world|cssLayerId|RESET_CARD_BY_TURN/);
  assert.match(reset, /mutation: NORTHSTAR_ARTBOARD_MUTATION_JSON_SCHEMA/);
});

test("each model turn receives canonical source plus the strongest optional browser observation", () => {
  assert.match(reset, /package: input\.artifact/);
  assert.match(reset, /browserAcknowledgement: input\.acknowledgement/);
  assert.match(reset, /browserMaterializedSource: observation\.source === "browser-snapshot" \? snapshot : undefined/);
  assert.match(reset, /canonicalSource: snapshot/);
  assert.match(reset, /observationAvailability/);
  assert.match(reset, /sourceSha256: sourceHash\(snapshot\)/);
  assert.match(route, /EXACT CURRENT ARTBOARD\\n\$\{JSON\.stringify\(modelInput\)\}/);
});

test("optional observation failure never becomes an artboard liveness prerequisite", () => {
  assert.doesNotMatch(reset, /requires the exact browser source snapshot before every model turn/);
  assert.doesNotMatch(reset, /Cannot build semantic graph without the exact browser snapshot/);
  assert.doesNotMatch(reset, /Cannot archive a design reset turn without its exact source-before snapshot/);
  assert.match(reset, /canonicalPackageSnapshot/);
  assert.match(route, /design\.reset\.observation_degraded/);
  assert.match(route, /design\.reset\.review_observation_degraded/);
  assert.match(route, /did not convert an observation failure into a design failure/);
});

test("revision disagreement remains a hard authority boundary", () => {
  assert.match(route, /browser revision \$\{liveAcknowledgement\.revisionId\} does not match canonical revision/);
  assert.match(route, /liveAcknowledgement\.artifactId !== currentPackage\.artifactId/);
  assert.match(route, /liveAcknowledgement\.revisionId !== currentPackage\.revisionId/);
});

test("diagnostics retain exact model requests, responses, before and after code, and diffs", () => {
  assert.match(reset, /requestBody: unknown/);
  assert.match(reset, /providerPayload\?: unknown/);
  assert.match(reset, /rawModelText\?: string/);
  assert.match(reset, /providerAttempts\?: NorthstarDesignResetProviderAttemptAudit\[\]/);
  assert.match(reset, /rawParsedResponse\?: unknown/);
  assert.match(reset, /sourceBefore:[\s\S]*package: NorthstarGeneratedCodeArtifactPackage/);
  assert.match(reset, /sourceAfter\?:[\s\S]*package: NorthstarGeneratedCodeArtifactPackage/);
  assert.match(reset, /exactSourceDiff\?: NorthstarExactDocumentDiff/);
  assert.match(reset, /modelAuthoredPatch\?: NorthstarArtboardMutationDraft/);
  assert.match(diagnostics, /northstar\.canvas-diagnostics\.v4/);
  assert.match(diagnostics, /designTurnAuditPayloadMode: "exact-model-boundary-and-browser-source"/);
  assert.match(diagnostics, /designTurnAuditArchives/);
  assert.match(workspace, /eventName === "design\.audit\.archive"/);
  assert.match(workspace, /recordNorthstarDesignTurnAuditArchive/);
  assert.match(route, /event === "design\.audit\.archive" \? data : normalizeNorthstarDisplayPayload\(data\)/);
});

test("the audited reset call uses prompt-enforced schema instead of Gemini responseJsonSchema", () => {
  assert.match(route, /Return exactly one JSON object matching this schema/);
  const auditedCall = route.slice(route.indexOf("async function callGeminiJsonOnceAudited"), route.indexOf("function collectSelectedVisualCandidates"));
  assert.doesNotMatch(auditedCall, /responseJsonSchema\s*:/);
  assert.match(auditedCall, /parseJsonResponse<T>\(rawText\)/);
});

test("every turn receives an authoritative evolving semantic-spatial graph", () => {
  assert.match(reset, /northstar\.artboard-semantic-graph\.v1/);
  assert.match(reset, /conceptId: "research"/);
  assert.match(reset, /canonicalNodeIds: \[researchRootId\]/);
  assert.match(reset, /exclusions: \["presentation", "reasoning-zone"/);
  assert.match(reset, /presentationManifest/);
  assert.match(reset, /researchBounds/);
  assert.match(reset, /semanticContract:[\s\S]*authoritative: true/);
  assert.match(reset, /graph: semanticGraph/);
  assert.match(reset, /focusCandidates: focus\.candidates/);
});

test("turn three resolves exact cross-flow evidence through the common focus path", () => {
  assert.match(reset, /const evidenceCandidates = input\.graph\.evidenceItems\.map/);
  assert.match(reset, /flowId: item\.flowId/);
  assert.match(reset, /index: item\.index/);
  assert.match(reset, /connectorAttachment:/);
  assert.match(reset, /exact rendered anchors/);
  assert.match(reset, /data-ns-authored-relationship/);
});


test("turn four resolves adjacent evidence through the common focus path", () => {
  assert.match(reset, /betweenPlacement:/);
  assert.match(reset, /centered between two exact references/);
  assert.match(reset, /Preserve evidence source identity, content, dimensions, order, visibility, appearance, and provenance/);
  assert.match(reset, /data-ns-authored-annotation/);
});

test("the reset does not reject model grounding or placement choices before execution", () => {
  assert.match(reset, /intentionally performs no semantic, placement, preservation, or/);
  assert.doesNotMatch(reset, /The model did not resolve research to the canonical evidence node/);
  assert.doesNotMatch(reset, /External artboard-world content must use model-authored absolute positioning/);
  assert.doesNotMatch(reset, /explicit world-space left and top coordinates/);
});

test("semantic graphs and graph diffs are archived before and after each turn", () => {
  assert.match(reset, /semanticGraph: NorthstarArtboardSemanticGraph/);
  assert.match(reset, /semanticGraphDiff\?:/);
  assert.match(reset, /beforeSemanticGraph = buildNorthstarArtboardSemanticGraph/);
  assert.match(reset, /afterSemanticGraph =/);
  assert.match(reset, /addedNodeIds/);
  assert.match(reset, /removedNodeIds/);
  assert.match(reset, /retainedNodeIds/);
});

test("the persistent design context stays cumulative while prompts remain simple", () => {
  assert.match(reset, /1: "Place a Hello World card below the research\."/);
  assert.match(reset, /6: "Make the Awin and Whop onboarding flows easier to distinguish as separate groups\."/);
  assert.match(reset, /The full graph and browser state are available on every turn/);
  assert.match(reset, /availableSpatialRelations:/);
  assert.match(reset, /designPartnerContext/);
  assert.match(runtime, /authoredDesignRelations: authoredDesignRelationRecords\(\)/);
  assert.match(runtime, /resolvedDesignRelations: resolvedDesignRelationRecords\(\)/);
});

test("communication quality and evidence safety guide every authored turn", () => {
  assert.match(reset, /Treat communication quality and evidence safety as part of every design decision, on every turn/);
  assert.match(reset, /Anything you add must be clear, readable, and understandable from the rendered artboard itself/);
  assert.match(reset, /General comments, synthesis, or remarks may address the whole artifact/);
  assert.match(reset, /Never place cards, annotations, labels, text, filled shapes, or decorative surfaces over protected evidence pixels/);
  assert.match(reset, /Treat the current layout as a composition you can solve, not as a field of immovable obstacles/);
  assert.match(reset, /create deliberate negative space by recomposing the smallest coherent affected structure necessary/);
  assert.match(reset, /designPartnerContext/);
  assert.match(reset, /protectedEvidenceNodeIds/);
  assert.match(reset, /currentEvidencePresentation/);
  assert.match(reset, /authoringQuestions/);
  assert.match(reset, /Intentional movement must be mechanically explicit in the mutation/);
  assert.match(reset, /Do not change margin, gap, flex growth\/shrink, grid tracks, wrapping/);
  assert.match(reset, /Preserve every protected evidence item's measured border-box width and height exactly/);
  assert.match(reset, /every expected movement has an explicit owner/);
  assert.match(reset, /do not oscillate between natural-flow and absolute\/translated strategy families/);
  assert.match(reset, /perform a simple fit test from the current rendered measurements/);
  assert.match(reset, /required span is the planned outer size/);
  assert.match(reset, /available span is smaller than required span/);
  assert.match(reset, /Moving only the same failing subject remains one subject-only placement strategy/);
  assert.match(reset, /Do not move that subject alone again unless/);
  assert.match(reset, /Trading an overlap below the target for an overlap to its right/);
});

test("every turn uses the same general semantic focus resolver", () => {
  assert.match(reset, /function resolveNorthstarInstructionFocus/);
  assert.match(reset, /const focus = resolveNorthstarInstructionFocus\(\{ instruction, graph: semanticGraph \}\)/);
  assert.match(reset, /focusCandidates: focus\.candidates/);
  assert.match(reset, /selectedRegionPairs: focus\.regionPairs/);
  assert.match(reset, /The full graph and browser state are available on every turn/);
  assert.doesNotMatch(reset, /const instructionResolution = input\.turn ===/);
  assert.doesNotMatch(reset, /regionId: "awin-flow"|regionId: "whop-flow"|requestedRelation: "groups-flows"/);
});

test("composition strategy is general instead of benchmark-specific", () => {
  assert.match(reset, /No content type or benchmark objective receives a privileged movement recipe/);
  assert.match(reset, /Referenced evidence follows the same integrity and recomposition rules as on every other design turn/);
  assert.match(reset, /Use the same fit, evidence-integrity, explicit-movement, and smallest-coherent-recomposition reasoning used for every other design objective/);
  assert.doesNotMatch(reset, /Move only the minimum necessary Awin sequence suffix/);
  assert.doesNotMatch(reset, /keep the Whop flow and unrelated artboard content unchanged/);
  assert.doesNotMatch(reset, /For an annotation between adjacent screenshots, first author enough positive horizontal room/);
  assert.doesNotMatch(reset, /The source screenshots remain pixel-stable/);
});

test("protected evidence is explicitly position-recomposable without weakening integrity", () => {
  assert.match(reset, /evidencePositionPolicy: "recomposable-when-needed"/);
  assert.match(reset, /recomposableEvidenceNodeIds: \[\.\.\.evidenceIds\]/);
  assert.match(reset, /recomposableAuthoredNodeIds: affectedAdditions\.map/);
  assert.match(reset, /Protection does not freeze x\/y position/);
  assert.doesNotMatch(reset, /editableForRecompositionNodeIds/);
});

test("turn six tests structural grouping without forcing a relation or visual form", () => {
  assert.match(reset, /Make the Awin and Whop onboarding flows easier to distinguish as separate groups/);
  assert.match(reset, /For requests about groups, flows, sections, boundaries, or new analysis areas/);
  assert.match(reset, /Choose the visual treatment yourself/);
  assert.match(reset, /declare no runtime relation unless your authored result genuinely needs a persistent dependency/);
  assert.doesNotMatch(reset, /northstarBenchmarkRelationIssues|assertNorthstarBenchmarkRelations|turn [1-6] requires a live/);
});



test("turn seven tests evidence reuse in a new analysis area while preserving provenance", () => {
  assert.match(reset, /Create a new analysis area below the current onboarding flows and reuse the Awin screenshot where the user chooses their role there/);
  assert.match(reset, /preserve the original evidence instance/);
  assert.match(reset, /distinct authored presentation instance/);
  assert.match(reset, /data-ns-source-node-id/);
  assert.match(reset, /Reused evidence is not a new source/);
  assert.match(reset, /preserve the original instance and create a distinct authored presentation instance for the reused view/);
  assert.doesNotMatch(reset, /turn === 7/);
});

test("the reset forwards the model mutation without candidate-policy validation", () => {
  assert.match(reset, /No candidate-policy validation is performed in the reset/);
  assert.match(reset, /return \{ ok: true, issues: \[\], batch \}/);
  assert.doesNotMatch(reset, /forbiddenTargets = new Set/);
  assert.doesNotMatch(reset, /model did not author explicit artboard expansion with request-space/);
  assert.doesNotMatch(reset, /pixelStableNodeIds: \["evidence"\]/);
});

test("semantic graph protects evidence integrity while allowing necessary spatial recomposition", () => {
  assert.match(reset, /expansionModel: "infinite-world-space"/);
  assert.match(reset, /source: "unchanged"/);
  assert.match(reset, /evidenceIdentity: "unchanged"/);
  assert.match(reset, /itemDimensions: "unchanged"/);
  assert.match(reset, /itemOrder: "unchanged"/);
  assert.match(reset, /placement: "recomposable-when-needed"/);
  assert.match(reset, /visualAppearance: "unchanged"/);
  assert.doesNotMatch(reset, /continuity: \{ source: "unchanged", bounds: "unchanged"/);
  assert.match(reset, /design-reset-turn-archive\.v5/);
  assert.match(reset, /northstar\.artboard-benchmark\.v1/);
});

test("every turn receives general compositional space-making agency", () => {
  assert.match(reset, /Treat the current layout as a composition you can solve, not as a field of immovable obstacles/);
  assert.match(reset, /create deliberate negative space by recomposing the smallest coherent affected structure necessary/);
  assert.match(reset, /translate an intact screenshot, a sequence suffix, or a whole evidence flow/);
  assert.match(reset, /Use the same spatial problem-solving ability on every turn/);
  assert.match(reset, /Solve the complete affected composition, not just the new object's coordinates/);
  assert.match(reset, /This directional-reference rule does not globally freeze evidence placement for later objectives/);
  assert.doesNotMatch(reset, /Create negative space, move only explicitly editable authored material/);
});

test("post-render repair must escalate beyond a repeatedly failed local placement strategy", () => {
  assert.match(reset, /reason about failed design strategies rather than merely trying unused coordinates/);
  assert.match(reset, /A repeated local-placement strategy remains the same strategy even when its x\/y values differ/);
  assert.match(reset, /stop searching nearby coordinates and broaden the affected composition/);
  assert.match(reset, /Do not repeat a strategy family that the live artboard has already shown cannot satisfy the whole set of findings/);
});


test("request-space performs literal accepted-edge growth instead of layout-base recomposition", () => {
  assert.match(runtime, /const acceptedBounds = committedCanonicalGeometry\?\.contentBounds/);
  assert.match(runtime, /acceptedBounds\.maxX \+ right/);
  assert.match(runtime, /acceptedBounds\.maxY \+ bottom/);
  assert.match(runtime, /requestedBounds = \{ \.\.\.acceptedBounds \}/);
  assert.doesNotMatch(runtime, /requestedBounds\.maxX = Math\.max\(requestedBounds\.maxX, canonicalLayoutBaseWidth \+ right\)/);
  assert.doesNotMatch(runtime, /requestedBounds\.maxY = Math\.max\(requestedBounds\.maxY, canonicalLayoutBaseHeight \+ bottom\)/);
});

test("optional live relation failures are observed without blocking model-authored visual results", () => {
  assert.match(runtime, /const unresolvedLiveRelations = candidateAuthoredRelations/);
  assert.match(runtime, /const relationAdvisoryReasons = unresolvedLiveRelations/);
  assert.match(runtime, /The authored visual result remains eligible to commit/);
  assert.match(runtime, /const rejectedReason = linearDesignExecution[\s\S]*?\? ""/);
  assert.doesNotMatch(runtime, /designRelationIntegrityReason/);
  assert.match(runtime, /relationRealizationTraces: relationRealizationTraceRecords\(\)/);
  assert.match(runtime, /authoredDesignRelations: authoredDesignRelationRecords\(\)/);
  assert.match(runtime, /resolvedDesignRelations: resolvedDesignRelationRecords\(\)/);
});


test("browser snapshots include measured bounds for every semantic node", () => {
  assert.match(artifactTypes, /NorthstarCommittedSemanticNode[\s\S]*bounds\?: \{ left: number; top: number; right: number; bottom: number; width: number; height: number \}/);
  assert.match(runtime, /const bounds = \{[\s\S]*rect\.left - rootRect\.left[\s\S]*width: Math\.round\(rect\.width/);
  assert.match(runtime, /parentId: parent\?\.getAttribute\("data-ns-node-id"\) \|\| undefined,[\s\S]*bounds,[\s\S]*normalizedText/);
  assert.match(reset, /const bounds = rectFromUnknown\(raw\.bounds \?\? raw\.rect \?\? raw\.layout\)/);
});

test("request-space extends the visible authored surface without resizing its layout box", () => {
  assert.match(runtime, /const syncAuthoredSurfaceExtension = \(\) =>/);
  assert.match(runtime, /northstar-authored-surface-extension/);
  assert.match(runtime, /\[data-ns-node-id="artboard"\]::before/);
  assert.match(runtime, /background:inherit/);
  assert.match(runtime, /syncAuthoredSurfaceExtension\(\);[\s\S]*queueContentSize\(\)/);
  assert.match(runtime, /const authoredArtboardBounds = authoredArtboardRect/);
  assert.match(runtime, /maxX: Math\.max\(authoredArtboardBounds\.maxX, Number\(requestedBounds\.maxX\)/);
  assert.match(runtime, /maxY: Math\.max\(authoredArtboardBounds\.maxY, Number\(requestedBounds\.maxY\)/);
});


test("browser diagnostics observe model-authored relationship provenance without routing or repair", () => {
  assert.match(runtime, /authoredRelationshipNodes = Array\.from\(root\.querySelectorAll/);
  assert.match(runtime, /data-ns-authored-relationship="true"/);
  assert.match(runtime, /data-ns-source-node-id/);
  assert.match(runtime, /data-ns-target-node-id/);
  assert.match(runtime, /relationshipCount: metadataNodes\.length \+ authoredRelationshipNodes\.length/);
  assert.match(reset, /authoredRelationships = semanticNodesRaw\.flatMap/);
  assert.match(reset, /predicate: "visually-related-to"/);
  assert.match(reset, /\.\.\.authoredRelationships/);
});

test("semantic diagnostics observe authored gap annotation provenance without calculating placement", () => {
  assert.match(reset, /authoredGapAnnotations = semanticNodesRaw\.flatMap/);
  assert.match(reset, /data-ns-authored-annotation/);
  assert.match(reset, /data-ns-between-before-node-id/);
  assert.match(reset, /data-ns-between-after-node-id/);
  assert.match(reset, /predicate: "annotates-gap-after"/);
  assert.match(reset, /predicate: "annotates-gap-before"/);
  assert.match(reset, /\.\.\.authoredGapAnnotations/);
});

test("authored spatial dependencies are explicit, live, coordinate-safe, and source-separated", () => {
  assert.match(reset, /reactiveSpatialDependencies/);
  assert.match(reset, /mutation\.relations/);
  assert.match(reset, /semantic-descendant-union/);
  assert.match(reset, /border-box/);
  assert.match(reset, /crossAlign so the annotation remains visually attached to the pair/);
  assert.match(reset, /realizationPolicy "live"/);
  assert.match(runtime, /const resolveAuthoredSpatialDependencies = \(revisionId, options = \{\}\) =>/);
  assert.match(runtime, /const containingBlockGeometry = \(subject\) =>/);
  assert.match(runtime, /const placeSubjectEdge = \(subject, relationId, axis, desiredClientValue\) =>/);
  assert.match(runtime, /baseLocalValue \+ \(desiredClientValue - currentClientValue\) \/ scale/);
  assert.match(runtime, /const placementPreviewReceipt = \(subject, placements\) =>/);
  assert.match(runtime, /coordinateAuthority: "browser-containing-block-v1"/);
  assert.match(runtime, /desiredArtboardEdge: desiredClientValue/);
  assert.match(runtime, /realizedArtboardEdge: realizedClientValue/);
  assert.match(runtime, /realizationError > 0\.75/);
  assert.match(runtime, /fitsDeclaredGap: availableSpan \+ 0\.75 >= requiredSpan/);
  assert.match(reset, /Treat that receipt as the only coordinate authority/);
  assert.match(reset, /do not remove the relation and search with raw coordinates/);
  assert.match(runtime, /clearRuntimeRelationRealization\(null, authoredRoot\)/);
  assert.match(runtime, /data-ns-runtime-relation-style/);
  assert.match(runtime, /data-ns-runtime-relation-attributes/);
  assert.match(runtime, /relationResizeObserver/);
  assert.match(runtime, /queueAuthoredRelationResolution/);
});


test("canonical design relations are authored separately, persisted transactionally, and transported with browser geometry", () => {
  assert.match(artifactTypes, /interface NorthstarAuthoredDesignRelation/);
  assert.match(artifactTypes, /interface NorthstarResolvedDesignRelation/);
  assert.match(artifactTypes, /geometry\?: NorthstarDesignRelationGeometryMode/);
  assert.match(artifactTypes, /authoredDesignRelations\?: NorthstarAuthoredDesignRelation\[\]/);
  assert.match(artifactTypes, /resolvedDesignRelations\?: NorthstarResolvedDesignRelation\[\]/);
  assert.match(mutations, /relations\?: NorthstarAuthoredDesignRelation\[\]/);
  assert.match(mutations, /sanitizeAuthoredDesignRelations/);
  assert.match(mutations, /semantic-descendant-union/);
  assert.match(runtime, /const authoredDesignRelations = new Map\(\)/);
  assert.match(runtime, /relation\.kind === "relative-placement"/);
  assert.match(runtime, /relation\.kind === "connector-attachment"/);
  assert.match(runtime, /relation\.kind === "between-placement"/);
  assert.match(runtime, /"conflicted"/);
  assert.match(runtime, /"cyclic"/);
  assert.match(runtime, /authoredDesignRelations: authoredDesignRelationRecords\(\)/);
  assert.match(runtime, /resolvedDesignRelations: resolvedDesignRelationRecords\(\)/);
  assert.match(runtime, /transaction\.authoredDesignRelations/);
  assert.match(runtime, /transaction\.resolvedDesignRelations/);
  assert.match(runtime, /root\.__northstarResolvedDesignRelations/);
});

test("every turn receives the same relation capability catalog", () => {
  assert.match(reset, /availableSpatialRelations:/);
  assert.match(reset, /relativePlacement:/);
  assert.match(reset, /connectorAttachment:/);
  assert.match(reset, /betweenPlacement:/);
  assert.match(reset, /The candidate ranking is semantic assistance, not a design decision/);
});

test("the mutation schema supports optional model-authored relations without benchmark gates", () => {
  assert.match(mutations, /"operations",\s*"relations",/);
  assert.match(mutations, /relations:\s*\{[\s\S]*type:\s*"array"/);
  assert.doesNotMatch(reset, /northstarBenchmarkRelationIssues|assertNorthstarBenchmarkRelations/);
  assert.doesNotMatch(reset, /turn [1-6] requires a live|canonical benchmark relation|generic gap label is not sufficient/);
  assert.doesNotMatch(route, /design\.reset\.authored_contract_observations/);
  assert.doesNotMatch(route, /const authoredIssues =/);
  assert.match(route, /maximumRepairAttempts = 6/);
  assert.match(route, /Correct all reported causes together/);
});

test("turn three preserves model-authored connector form while attaching its endpoints", () => {
  assert.doesNotMatch(reset, /straight SVG path/);
  assert.doesNotMatch(route, /cubic or curved path/);
  assert.match(runtime, /tagName === "path"/);
  assert.match(runtime, /withEndpoints/);
  assert.match(runtime, /tagName === "polyline"/);
});

test("browser receipts observe only relations the model actually authored", () => {
  assert.match(reset, /northstarAuthoredRelationRealizationIssues/);
  assert.match(reset, /browser acknowledgement omitted authored relation/);
  assert.match(reset, /cumulative live relation/);
  assert.match(route, /northstarAuthoredRelationRealizationIssues/);
  assert.match(route, /silently requested a corrected model-authored turn/);
});

test("every rejected and accepted model attempt is retained in the design-turn archive", () => {
  assert.match(reset, /providerAttempts\?: NorthstarDesignResetProviderAttemptAudit\[\]/);
  assert.match(reset, /repairHistory\?: unknown\[\]/);
  assert.match(route, /repairHistory,/);
  assert.match(reset, /providerAttempts: input\.providerAttempts\?\.length/);
  assert.match(route, /const providerAttempts: NorthstarDesignResetProviderAttemptAudit\[\] = \[\]/);
  assert.match(route, /attempt: providerAttempts\.length \+ 1/);
  assert.match(route, /providerAttempts\.push\(providerAttempt\)/);
});

test("protected evidence construction never uses scale interpolation", () => {
  assert.match(runtime, /const protectedEvidence = Boolean\(element\.closest/);
  assert.match(runtime, /if \(protectedEvidence\) \{[\s\S]*transform: initialTransform[\s\S]*transform: "none"/);
  assert.match(runtime, /const safeUniformScale = !protectedEvidence/);
});

test("translation is diagnosed as position rather than scale", () => {
  assert.match(runtime, /translate\(\?:3d\|x\|y\)\?/);
  assert.match(runtime, /kinds\.add\("position"\)/);
  assert.match(runtime, /scale\(\?:3d\|x\|y\)\?/);
  assert.doesNotMatch(runtime, /width\|height\|flex-basis\|font-size\|transform\|scale\/i/);
});

test("the completed benchmark reports its seven-turn runtime name", () => {
  assert.match(route, /designRuntime: "seven-turn-artboard-benchmark"/);
  assert.doesNotMatch(route, /designRuntime: "two-turn-design-reset"/);
});

test("cumulative visual review reports authored relationship paths crossing readable content", () => {
  assert.match(runtime, /const authoredInterferencePairs = \[\]/);
  assert.match(runtime, /const explanatoryObstacleCandidates = semantic\.filter/);
  assert.match(runtime, /Prefer the smallest independently meaningful obstacle/);
  assert.match(runtime, /getTotalLength/);
  assert.match(runtime, /getPointAtLength/);
  assert.match(runtime, /obstacleBounds:/);
  assert.match(runtime, /firstHitPoint:/);
  assert.match(runtime, /lastHitPoint:/);
  assert.match(runtime, /New visual interference appeared between authored relationships and readable artboard content/);
  assert.match(artifactTypes, /authoredInterferencePairs\?: Array/);
  assert.match(route, /Visual interference summary:/);
  assert.match(route, /smallest independently meaningful obstacles/);
  assert.doesNotMatch(route, /Visual interference: relationship primitive/);
  assert.match(reset, /Does any connector, leader, bracket, line, or relationship mark cross text/);
});


test("cumulative review reports authored additions intruding into unrelated evidence-flow territory", () => {
  assert.match(runtime, /const evidenceTerritoriesByFlow = new Map/);
  assert.match(runtime, /const semanticRegionIntrusions = \[\]/);
  assert.match(runtime, /const intendedFlowForAddition/);
  assert.match(runtime, /relation\.subjectId !== item\.id/);
  assert.match(runtime, /New authored content intruded into an unrelated evidence-flow territory/);
  assert.match(artifactTypes, /semanticRegionIntrusions\?: Array/);
  assert.match(route, /Semantic-region interference summary:/);
  assert.match(route, /outside unrelated evidence territory/);
});


test("partial benchmark runs are reported truthfully without a red user-facing failure", () => {
  assert.match(route, /publicationVerified \? "run\.completed" : "run\.incomplete"/);
  assert.match(route, /outcome: publicationVerified \? "completed" : "incomplete"/);
  assert.doesNotMatch(route, /stopped only the remaining design continuation after a transport interruption/);
  assert.match(workspace, /if \(eventName === "run\.incomplete"\)/);
  assert.match(workspace, /runStatus: "completed_with_notes"/);
  assert.match(workspace, /error: false/);
});


test("repair memory detects repeated semantic failures before exhausting model calls", () => {
  assert.match(route, /const maximumRepairAttempts = 6/);
  assert.match(route, /repeatedRepairFingerprintLimit = 1/);
  assert.match(route, /repairFingerprintCounts = new Map/);
  assert.match(route, /unresolvedRelations\.length/);
  assert.match(route, /PREVIOUS REPAIR MEMORY/);
  assert.match(route, /rawModelResponse/);
  assert.match(route, /sanitizedMutation/);
  assert.match(route, /relationPipelineTrace/);
  assert.match(route, /design\.reset\.repair_stalled/);
});

test("every design turn carries cumulative semantic continuity and recomposition context", () => {
  assert.match(reset, /buildNorthstarContinuityContext/);
  assert.match(reset, /appliesToEveryTurn: true/);
  assert.match(reset, /affectedAuthoredAdditions/);
  assert.match(reset, /visualFormAndPlacementRecomposable: true/);
  assert.match(reset, /Preserve evidence identity and pixels, semantic identity, meaning, target references, and provenance/);
  assert.doesNotMatch(reset, /turn === 6[\s\S]*continuity/i);
  assert.match(runtime, /const authoredContinuityObservations = \[\]/);
  assert.match(runtime, /Cumulative semantic continuity weakened for prior authored additions/);
  assert.match(artifactTypes, /authoredContinuityObservations\?: Array/);
  assert.match(route, /Cumulative continuity summary:/);
  assert.match(route, /exact prior coordinates and visual form are not protected/);
});


test("relationship authorship remains open-ended while reactive dependencies stay optional", () => {
  assert.match(reset, /A visual relationship does not require a runtime relation/);
  assert.match(reset, /spatial arrangement, grouping, alignment, repeated emphasis, labels, brackets, connectors, insets, comparison regions/);
  assert.match(reset, /mutation\.relations is optional/);
  assert.match(reset, /If reactive attachment is unnecessary, omit connector-attachment and keep the relationship entirely visual/);
  assert.doesNotMatch(reset, /turn === 3/);
});

test("relation roles are normalized consistently and traced across every layer", () => {
  assert.match(mutations, /function canonicalNorthstarRelationRole/);
  assert.match(mutations, /\["source", "from", "start", "origin"/);
  assert.match(mutations, /\["target", "to", "end", "destination"/);
  assert.match(runtime, /const canonicalRelationRole =/);
  assert.match(runtime, /canonicalRelationReferences/);
  assert.match(runtime, /requires exactly one source and one target reference; received roles/);
  assert.match(runtime, /relationRealizationTraceRecords/);
  assert.match(artifactTypes, /export interface NorthstarRelationRealizationTrace/);
  assert.match(artifactTypes, /relationRealizationTraces\?: NorthstarRelationRealizationTrace\[\]/);
  assert.match(route, /rawModelRelations/);
  assert.match(route, /sanitizedRelations/);
  assert.match(route, /browserAuthoredRelations/);
  assert.match(route, /browserResolvedRelations/);
  assert.match(route, /browserRealizationTraces/);
});

test("focused relationship repair excludes unrelated premium-design commentary", () => {
  assert.match(route, /const relationshipFocusedRepair = pipelineObservations\.length > 0/);
  assert.match(route, /!relationshipFocusedRepair \?[\s\S]*?premiumDesignAudit/);
  assert.match(route, /Relationship realization trace:/);
  assert.match(route, /optional reactive dependency trace, not a required visual form/);
});
