import { NextRequest, NextResponse } from "next/server";

import { canvasV2ResearchResultForFlow } from "@/lib/canvas-v2/research-adapter";
import {
  CANVAS_V2_DECISION_SCHEMA,
  type CanvasV2ArtifactRevision,
  type CanvasV2CreativeDirection,
  type CanvasV2RenderedReflection,
  type CanvasV2RenderObservation,
  type CanvasV2SpatialStrategy,
} from "@/lib/canvas-v2/types";
import { CANVAS_V2_E2E_APPS } from "@/app/canvas-v2-e2e/research-fixture";
import {
  buildCanvasV2ResearchCatalogIndex,
  canvasV2ResearchStatusForDecision,
} from "@/lib/canvas-v2/research-director";

function direction(currentFocus: string, nextMoves: string[]): CanvasV2CreativeDirection {
  return {
    designIntent: "Make the different onboarding philosophies immediately legible while keeping the complete research surface inspectable.",
    visualThesis: "Two paths, two operating beliefs: Awin establishes confidence through guided depth while Whop converts momentum through compression.",
    compositionStrategy: "Use an editorial opening, a horizontal evidence field, and a concluding analytical sequence connected by one continuous reading axis.",
    visualLanguage: "Warm white field, near-black editorial type, fine graphite rules, Awin violet and Whop vermilion used sparingly as semantic signals.",
    evidenceStrategy: "Keep both canonical flows complete and full-size, then build conclusions beside and below them without replacing evidence with decorative thumbnails.",
    currentFocus,
    nextMoves,
  };
}

function reflection(observedResult: string, remainingOpportunity: string, nextMoveReason: string): CanvasV2RenderedReflection {
  return { observedResult, remainingOpportunity, nextMoveReason };
}

function spatial(currentAdjustment: string, growthDirection: CanvasV2SpatialStrategy["growthDirection"] = "vertical"): CanvasV2SpatialStrategy {
  return {
    growthDirection,
    layoutSystem: "A 1560px editorial rail: 170px identity axis, flexible evidence sequence, and three-column analytical resolution.",
    primaryAnchor: "The oversized editorial thesis anchors the top-left; every later section returns to its left edge and shared 1560px rule.",
    hierarchyAndScale: "58px thesis, 38px analytical conclusion, 17px deck, 13–18px supporting copy, and peer screenshots at one natural-aspect-ratio height.",
    spacingRhythm: "Use a 12/24/36/54/72px rhythm, with the largest transitions between framing, evidence, and analysis.",
    relationshipLogic: "Shared horizontal rails connect the comparison; violet and vermilion rules identify the two paths without enclosing them.",
    currentAdjustment,
    intentionalOverlaps: [],
  };
}

function mapDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Explain how raw signal becomes an executive decision through one immediately readable spatial relationship.",
    visualThesis: "Conviction is not a leap; it is a visible chain of transformations.",
    compositionStrategy: "Use one continuous horizontal argument with a deliberately overlapping evidence lens at its center.",
    visualLanguage: "Warm white, large near-black editorial type, hairline graphite structure, and one translucent violet focal gesture.",
    evidenceStrategy: "This conceptual prompt needs no app research; the relationship itself is the primary evidence structure.",
    currentFocus: "Resolve the causal chain with exact alignment and one intentional focal overlap.",
    nextMoves: [],
  };
}

function mapSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "stable",
    layoutSystem: "A 1440px horizontal causal rail with four unequal editorial stages aligned to one baseline.",
    primaryAnchor: "The title anchors the upper-left while the oversized interpretation stage becomes the central focal point.",
    hierarchyAndScale: "64px thesis, 30px focal stage, 20px peer stages, and 13–16px explanatory copy.",
    spacingRhythm: "Use 18px internal intervals and 72–108px transitions along the causal rail.",
    relationshipLogic: "A continuous graphite rule establishes sequence; one translucent violet lens overlaps interpretation to show synthesis rather than a separate step.",
    currentAdjustment: "Place every stage on one precise baseline and preserve generous negative space around the central overlap.",
    intentionalOverlaps: ["The violet evidence lens intentionally overlaps the interpretation stage while remaining behind its text."],
  };
}

function marketDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Turn an ambiguous market-entry question into a decision landscape that distinguishes facts, assumptions, and strategic choices.",
    visualThesis: "A credible wedge appears where urgent workflow pain, reachable distribution, and a defensible learning loop intersect.",
    compositionStrategy: "Use an asymmetric editorial field: observable signals on the left, a large wedge argument in the center, and sequenced decision horizons below.",
    visualLanguage: "Warm white, near-black type, fine graphite rules, signal blue, assumption amber, and one decisive North Star violet axis.",
    evidenceStrategy: "Keep observable signals and unverified assumptions visibly distinct; this conceptual prompt must not impersonate account research.",
    currentFocus: "Resolve the market-entry decision into a legible spatial argument with explicit uncertainty.",
    nextMoves: [],
  };
}

function marketSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "both",
    layoutSystem: "A 1960px asymmetric editorial field with a 430px signal rail, an 880px wedge argument, and three decision horizons on a shared lower baseline.",
    primaryAnchor: "The oversized entry-wedge statement anchors the center while the evidence taxonomy creates a disciplined left edge.",
    hierarchyAndScale: "68px thesis, 42px wedge, 24px horizon labels, and readable 14–18px supporting copy.",
    spacingRhythm: "Use an 18/30/48/78px rhythm, with deliberate open space around the wedge intersection.",
    relationshipLogic: "Three fine lines converge from pain, reach, and learning into the entry wedge; a lower temporal rail carries now, next, and later decisions.",
    currentAdjustment: "Preserve the asymmetric center of gravity and keep uncertainty labels adjacent to the claims they qualify.",
    intentionalOverlaps: ["The translucent violet wedge sits behind the three converging criteria while all labels remain unobstructed."],
  };
}

function largeDirection(): CanvasV2CreativeDirection {
  return {
    designIntent: "Prove that the living artboard can expand in both dimensions while preserving a coherent discovery narrative.",
    visualThesis: "Distance can communicate decision scale when every remote region remains connected to one governing question.",
    compositionStrategy: "Place evidence, opportunity, experiment, and decision regions across a large coordinate field connected by one diagonal reading path.",
    visualLanguage: "Warm white, oversized black editorial anchors, fine violet coordinates, and sparse blue and orange semantic signals.",
    evidenceStrategy: "This is a geometric behavior proof with clearly labeled conceptual material, not fabricated product evidence.",
    currentFocus: "Keep distant regions purposeful and connected while making the full two-dimensional extent measurable.",
    nextMoves: [],
  };
}

function largeSpatial(): CanvasV2SpatialStrategy {
  return {
    growthDirection: "both",
    layoutSystem: "A 3600×2400 coordinate field with four editorial regions distributed across two axes and connected by a diagonal argument.",
    primaryAnchor: "The governing question at the northwest origin anchors a path that resolves at the southeast decision region.",
    hierarchyAndScale: "72px origin thesis, 44px regional titles, 22px wayfinding labels, and 16px supporting copy.",
    spacingRhythm: "Use large 240–520px transitions between regions and compact 18–36px internal intervals.",
    relationshipLogic: "A single diagonal line and numbered coordinates make the distant regions part of one continuous reading sequence.",
    currentAdjustment: "Fit the complete expanded surface after render without collapsing its intentional spatial distance.",
    intentionalOverlaps: [],
  };
}

const BASE_CSS = `
.northstar-artboard{--ns-ink:#171721;--ns-muted:#666678;--ns-rule:rgba(42,39,66,.13);--ns-violet:#684dff;--ns-orange:#f04b23;box-sizing:border-box;width:max-content;min-width:1680px;min-height:945px;padding:58px 64px 76px;background:#fefdfb;color:var(--ns-ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
.e2e-editorial-header{display:grid;grid-template-columns:minmax(520px,760px) 320px 320px;gap:72px;align-items:start;width:1560px;padding-bottom:34px;border-bottom:1px solid var(--ns-rule)}
.e2e-eyebrow,.e2e-note-label,.e2e-section-label{margin:0;color:var(--ns-violet);font-size:10px;font-weight:850;letter-spacing:.17em;text-transform:uppercase}
.e2e-editorial-header h1{max-width:720px;margin:13px 0 15px;font-size:58px;line-height:.94;letter-spacing:-.058em}
.e2e-deck{max-width:710px;margin:0;color:#4f4f60;font-size:17px;line-height:1.55}
.e2e-note{min-height:96px;padding-left:15px;border-left:2px solid #a89aff}
.e2e-note:last-child{border-left-color:#ffc0ad}
.e2e-note p:last-child{margin:9px 0 0;color:#33333f;font-size:13px;font-weight:650;line-height:1.45}
.e2e-reading-axis{display:grid;grid-template-columns:170px repeat(3,1fr);gap:24px;width:1560px;padding:27px 0 12px}
.e2e-axis-intro{color:#858393;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.e2e-axis-point{padding-top:10px;border-top:1px solid var(--ns-rule);color:#545363;font-size:13px;line-height:1.45}
.e2e-axis-point strong{display:block;margin-bottom:4px;color:#1e1e28;font-size:14px}
.e2e-analysis{display:grid;grid-template-columns:300px 1fr 1fr;column-gap:54px;width:1560px;margin-top:36px;padding-top:31px;border-top:1px solid var(--ns-rule)}
.e2e-analysis-heading h2{margin:11px 0 0;font-size:38px;line-height:1;letter-spacing:-.045em}
.e2e-analysis-column{position:relative;padding-left:20px;border-left:2px solid var(--ns-violet)}
.e2e-analysis-column--whop{border-left-color:var(--ns-orange)}
.e2e-analysis-column h3{margin:0 0 10px;font-size:18px;letter-spacing:-.025em}
.e2e-analysis-column p{max-width:430px;margin:0;color:#555563;font-size:14px;line-height:1.55}
.e2e-analysis-column small{display:block;margin-top:16px;color:#868493;font-size:10px;font-weight:780;letter-spacing:.1em;text-transform:uppercase}
.e2e-conclusion{display:grid;grid-template-columns:300px 1fr;gap:54px;width:1560px;margin-top:42px;padding:33px 0 9px;border-top:1px solid var(--ns-rule)}
.e2e-conclusion blockquote{max-width:920px;margin:0;font-size:32px;font-weight:780;line-height:1.16;letter-spacing:-.035em}
.e2e-conclusion em{color:var(--ns-violet);font-style:normal}
.e2e-refined .canvas-v2-grounded-title{margin-top:26px}
.e2e-refined .canvas-v2-flow-lane{position:relative;padding:24px 0;border-top:1px solid rgba(42,39,66,.08)}
.e2e-refined .canvas-v2-flow-lane:first-of-type{border-top:0}
.e2e-refined .canvas-v2-flow-lane:first-of-type .canvas-v2-flow-app{color:#5135d9}
.e2e-refined .canvas-v2-flow-lane:last-of-type .canvas-v2-flow-app{color:#d83f1d}
.e2e-refined .canvas-v2-flow-screen{filter:drop-shadow(0 13px 22px rgba(31,25,62,.11))}
`;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json() as { revision?: CanvasV2ArtifactRevision; observation?: CanvasV2RenderObservation; instruction?: string; run?: { researchTargets?: string[] } };
  const revision = body.revision;
  if (!revision) return NextResponse.json({ error: "Missing revision" }, { status: 400 });
  if (!body.observation?.spatial || body.observation.spatial.reportedNodeCount !== body.observation.spatial.nodes.length) {
    return NextResponse.json({ error: "Missing exact spatial observation" }, { status: 400 });
  }
  const attempt = Number(request.headers.get("x-canvas-v2-attempt")) || 1;

  if (body.instruction === "Audit partial research for Awin and Ghost" || body.instruction === "Interrupt Awin and Ghost research") {
    if (body.instruction === "Interrupt Awin and Ghost research") await new Promise((resolve) => setTimeout(resolve, 700));
    const catalog = { tenantId: "e2e", apps: CANVAS_V2_E2E_APPS };
    const researchIndex = buildCanvasV2ResearchCatalogIndex(catalog, body.instruction, revision, body.run?.researchTargets);
    const awin = CANVAS_V2_E2E_APPS.find((app) => app.name === "Awin")!;
    const flow = awin.flows[0]!;
    if (!researchIndex.visibleFlowIds.includes(flow.id)) {
      const researchDecision = {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "research" as const,
        moveKind: "research" as const,
        creativeDirection: direction("Ground the available Awin evidence and preserve Ghost as an explicit account limitation.", ["State the unavailable evidence limitation"]),
        spatialStrategy: spatial("Extend the canonical evidence rail for the one available requested product.", "horizontal"),
        reflection: reflection("Neither requested product is grounded yet.", "Awin has a usable flow while Ghost is unavailable in this account.", "Materialize the available Awin flow before resolving the limitation."),
        appId: awin.id,
        flowId: flow.id,
        summary: `Retrieved the complete ${awin.name} onboarding flow and placed it on the visible working surface.`,
        expectedVisualResult: "Awin's complete ordered screenshots are visible while Ghost remains truthfully unavailable.",
      };
      return NextResponse.json({
        decision: researchDecision,
        research: canvasV2ResearchResultForFlow(awin, flow),
        researchStatus: canvasV2ResearchStatusForDecision(researchIndex, researchDecision),
      });
    }
    if (!revision.document.html.includes("data-e2e-research-limitation")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: direction("Present available evidence without fabricating symmetry for an unavailable product.", ["Complete with the limitation preserved"]),
        spatialStrategy: spatial("Place one direct-on-surface limitation note beneath the available canonical evidence.", "vertical"),
        reflection: reflection("Awin is visibly grounded and Ghost is unavailable.", "The unavailable state must become explicit on the artboard.", "Add one factual limitation note without creating a placeholder flow."),
        summary: "Made the unavailable Ghost evidence explicit without fabricating a comparison lane.",
        expectedVisualResult: "A factual Ghost evidence limitation appears beneath the complete Awin flow.",
        document: {
          html: revision.document.html.replace("</main>", '<p data-e2e-research-limitation="true" data-canvas-v2-research-unavailable="Ghost" data-canvas-v2-node-id="ghost-research-limitation">Ghost evidence unavailable in this account.</p></main>'),
          css: `${revision.document.css}\n[data-e2e-research-limitation]{margin:40px 0 0;padding-top:20px;border-top:1px solid rgba(35,31,55,.16);color:#756f67;font:600 14px/1.5 Inter,sans-serif}`,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Present available evidence without fabricating symmetry for an unavailable product.", []),
        spatialStrategy: spatial("Preserve the complete Awin evidence rail and its open limitation context.", "stable"),
        reflection: reflection("Awin is visibly grounded and Ghost is explicitly unavailable.", "No unresolved research remains.", "Complete with a truthful partial-research summary."),
        summary: "Awin is grounded with its complete flow. Evidence unavailable in this account: Ghost.",
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (body.instruction === "Fail design without mutation" || (body.instruction === "Retry design once" && attempt === 1)) {
    return NextResponse.json({ error: "The deterministic design provider is temporarily unavailable.", code: "provider-unavailable", retryable: true }, { status: 503 });
  }

  if (body.instruction === "Retry design once") {
    if (revision.document.html.includes("data-e2e-retry-revision")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Prove that a recovered logical request commits exactly one revision.", []),
        spatialStrategy: spatial("Preserve the single recovered marker on the committed surface.", "stable"),
        reflection: reflection("One recovered revision is committed and visible.", "No duplicate candidate or additional edit remains.", "Complete after observing the one accepted retry result."),
        summary: "The provider recovered and exactly one verified revision was committed.",
      },
      evidence: revision.evidence,
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "refinement",
        creativeDirection: direction("Prove that a recovered logical request commits exactly one revision.", ["Observe the recovered revision before completion"]),
        spatialStrategy: spatial("Place one compact recovery marker without changing the wider artboard.", "stable"),
        reflection: reflection("The committed artboard is intact after the transient failure.", "One recovered revision must be rendered and observed.", "Author exactly one marker from the accepted response."),
        summary: "Committed the one recovered provider revision.",
        expectedVisualResult: "Exactly one recovered revision marker is visible.",
        document: {
          html: revision.document.html.replace("</main>", '<p data-e2e-retry-revision="true" data-canvas-v2-node-id="retry-revision">Recovered provider revision</p></main>'),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction === "Keep designing until I stop") {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: direction("Prove that stopped design work cannot publish a late revision.", []),
        spatialStrategy: spatial("Keep the clean artboard stable while the lifecycle test owns the timing.", "stable"),
        reflection: reflection("The committed artboard remains unchanged.", "A delayed candidate would demonstrate stale publication if accepted.", "Prepare one delayed revision for the stop boundary."),
        summary: "Prepared a delayed lifecycle revision.",
        expectedVisualResult: "The delayed revision is visible only if the active run still owns it.",
        document: {
          html: revision.document.html.replace("</main>", '<p data-canvas-v2-node-id="late-lifecycle-revision">Late lifecycle revision</p></main>'),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction === "Exercise lifecycle edit limit") {
    const completedSteps = Array.from(revision.document.html.matchAll(/data-e2e-lifecycle-step=/g)).length;
    if (completedSteps >= 8) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: direction("Resolve the bounded lifecycle proof without inventing another edit.", []),
        spatialStrategy: spatial("Preserve the eight verified lifecycle marks on the committed surface.", "stable"),
        reflection: reflection("Eight committed and observed revisions are visible.", "No further visual work is required for this lifecycle proof.", "Declare completion only now, after continuation returned the verified artboard."),
        summary: "The continued run reviewed the preserved artboard and declared the lifecycle proof complete.",
      },
      evidence: revision.evidence,
    });
    const nextStep = completedSteps + 1;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "refinement",
        creativeDirection: direction("Make every committed lifecycle revision visible and countable.", ["Continue until the safe boundary"]),
        spatialStrategy: spatial(`Place verified lifecycle revision ${nextStep} on the existing reading rail.`, "stable"),
        reflection: reflection(`${completedSteps} lifecycle revisions are currently committed.`, "The safe boundary has not yet been reached.", `Commit and observe lifecycle revision ${nextStep}.`),
        summary: `Committed lifecycle revision ${nextStep}.`,
        expectedVisualResult: `Eight compact lifecycle marks are eventually visible on the clean artboard.`,
        document: {
          html: revision.document.html.replace("</main>", `<span data-e2e-lifecycle-step="${nextStep}" data-canvas-v2-node-id="lifecycle-step-${nextStep}">${nextStep}</span></main>`),
          css: `${revision.document.css}\n[data-e2e-lifecycle-step]{display:inline-grid;place-items:center;width:42px;height:42px;margin:8px;border:1px solid #d8d2ff;border-radius:50%;color:#5f4ce0;font:700 14px/1 Inter,sans-serif}`,
        },
      },
      evidence: revision.evidence,
    });
  }

  if (body.instruction?.toLowerCase().includes("spatial relationship map")) {
    if (revision.document.html.includes("data-e2e-spatial-map")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The four-stage causal rail is balanced, the reading order is immediate, and the single overlap clearly marks interpretation as the synthesis point.", "No spatial correction remains for the requested relationship map.", "Completion preserves the resolved geometry instead of adding unnecessary structure."),
        summary: "The visible relationship map now presents a precise editorial path from signal to decision.",
      },
      evidence: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "relationship",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The current surface has no authored relationship structure.", "The requested causal stages need a precise shared axis and focal synthesis point.", "A single direct-on-surface rail communicates sequence more clearly than separate containers."),
        summary: "Composed a precise causal relationship from signal through evidence and interpretation to decision.",
        expectedVisualResult: "Four editorial stages align on one continuous rail, with one intentional violet overlap emphasizing interpretation.",
        document: {
          html: `<main class="northstar-artboard e2e-spatial-map" data-e2e-spatial-map="true" data-canvas-v2-node-id="artboard" aria-label="Editorial relationship map"><header data-canvas-v2-node-id="map-header"><p data-canvas-v2-node-id="map-kicker">North Star reasoning model</p><h1 data-canvas-v2-node-id="map-title">From signal to conviction.</h1><p data-canvas-v2-node-id="map-deck">A decision becomes trustworthy when every transformation remains visible.</p></header><section data-canvas-v2-node-id="causal-rail" class="map-rail"><article data-canvas-v2-node-id="stage-signal" class="map-stage"><span data-canvas-v2-node-id="signal-index">01</span><h2 data-canvas-v2-node-id="signal-title">Signal</h2><p data-canvas-v2-node-id="signal-copy">Something changed.</p></article><article data-canvas-v2-node-id="stage-evidence" class="map-stage"><span data-canvas-v2-node-id="evidence-index">02</span><h2 data-canvas-v2-node-id="evidence-title">Evidence</h2><p data-canvas-v2-node-id="evidence-copy">The change becomes observable.</p></article><article data-canvas-v2-node-id="stage-interpretation" class="map-stage map-stage--focus"><div data-canvas-v2-node-id="evidence-lens" class="map-lens" aria-label="Intentional evidence and interpretation overlap"></div><span data-canvas-v2-node-id="interpretation-index">03</span><h2 data-canvas-v2-node-id="interpretation-title">Interpretation</h2><p data-canvas-v2-node-id="interpretation-copy">Evidence acquires meaning in context.</p></article><article data-canvas-v2-node-id="stage-decision" class="map-stage"><span data-canvas-v2-node-id="decision-index">04</span><h2 data-canvas-v2-node-id="decision-title">Decision</h2><p data-canvas-v2-node-id="decision-copy">Conviction becomes action.</p></article></section><footer data-canvas-v2-node-id="map-footer"><p data-canvas-v2-node-id="map-implication">The quality of the decision is limited by the least visible transformation.</p></footer></main>`,
          css: `.northstar-artboard{--ink:#18171f;--muted:#706e7c;--line:rgba(35,31,55,.20);--violet:#6b4dff;box-sizing:border-box;width:1680px;min-width:1680px;min-height:945px;padding:74px 92px 72px;background:#fefdfb;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}.e2e-spatial-map header{display:grid;grid-template-columns:1fr 430px;column-gap:100px;width:1440px}.e2e-spatial-map header>p:first-child{grid-column:1/-1;margin:0 0 18px;color:var(--violet);font-size:10px;font-weight:850;letter-spacing:.18em;text-transform:uppercase}.e2e-spatial-map h1{margin:0;font-size:64px;line-height:.94;letter-spacing:-.06em}.e2e-spatial-map header>p:last-child{align-self:end;margin:0;color:var(--muted);font-size:16px;line-height:1.55}.map-rail{position:relative;display:grid;grid-template-columns:250px 300px 480px 260px;gap:50px;align-items:center;width:1440px;margin-top:145px}.map-rail::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--line)}.map-stage{position:relative;z-index:1;min-height:180px;padding:36px 16px 28px 0;background:#fefdfb}.map-stage span{color:#9a97a5;font-size:10px;font-weight:800;letter-spacing:.16em}.map-stage h2{margin:34px 0 10px;font-size:22px;letter-spacing:-.035em}.map-stage p{max-width:240px;margin:0;color:var(--muted);font-size:13px;line-height:1.5}.map-stage--focus{padding-left:84px;background:transparent}.map-stage--focus h2{position:relative;margin-top:23px;font-size:34px}.map-stage--focus span,.map-stage--focus p{position:relative}.map-lens{position:absolute;z-index:-1;left:12px;top:-54px;width:300px;height:300px;border:1px solid rgba(107,77,255,.28);border-radius:50%;background:rgba(107,77,255,.09)}.e2e-spatial-map footer{width:1440px;margin-top:128px;padding-top:24px;border-top:1px solid var(--line)}.e2e-spatial-map footer p{max-width:720px;margin:0;font-size:24px;font-weight:720;line-height:1.25;letter-spacing:-.025em}`,
        },
      },
      evidence: [],
    });
  }

  if (body.instruction?.toLowerCase().includes("market-entry decision landscape")) {
    if (revision.document.html.includes("data-e2e-market-landscape")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: marketDirection(),
        spatialStrategy: marketSpatial(),
        reflection: reflection("The market question is now a legible, non-dashboard spatial argument: facts and assumptions remain distinct, three criteria converge on one wedge, and the temporal decisions resolve below.", "No material communication gap remains for this conceptual decision landscape.", "Complete without adding decorative structure or fabricated evidence."),
        summary: "The market-entry landscape now separates evidence from assumptions and resolves the wedge across immediate, next, and later decisions.",
      },
      evidence: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: marketDirection(),
        spatialStrategy: marketSpatial(),
        reflection: reflection("The current surface has no authored decision model.", "The startup needs a way to see which claims are observed, which are assumed, and where a credible entry wedge exists.", "Compose one direct-on-surface decision landscape rather than a generic collection of cards."),
        summary: "Composed a market-entry decision landscape that makes evidence, assumptions, convergence, and timing immediately inspectable.",
        expectedVisualResult: "A premium asymmetric decision field distinguishes observed signals from assumptions and connects three wedge criteria to sequenced decisions.",
        document: {
          html: `<main class="northstar-artboard market-landscape" data-e2e-market-landscape="true" data-canvas-v2-node-id="artboard" aria-label="Market entry decision landscape"><header data-canvas-v2-node-id="market-header"><p data-canvas-v2-node-id="market-kicker">North Star · market entry</p><h1 data-canvas-v2-node-id="market-title">Find the wedge<br/>that teaches fastest.</h1><p data-canvas-v2-node-id="market-deck">A decision landscape for entering a vertical SaaS market without confusing confidence with evidence.</p></header><aside data-canvas-v2-node-id="signal-rail" class="signal-rail"><p data-canvas-v2-node-id="signal-label">Observed signals</p><ol data-canvas-v2-node-id="signal-list"><li data-canvas-v2-node-id="signal-one"><strong>Workflow pain</strong><span>Repeated manual reconciliation</span></li><li data-canvas-v2-node-id="signal-two"><strong>Reachable buyer</strong><span>A concentrated operator community</span></li><li data-canvas-v2-node-id="signal-three"><strong>Learning velocity</strong><span>Usage reveals value inside one week</span></li></ol><div data-canvas-v2-node-id="assumption-note" class="assumption-note"><b>Assumption · unverified</b><span>The end user can influence budget.</span></div></aside><section data-canvas-v2-node-id="wedge-field" class="wedge-field"><div data-canvas-v2-node-id="wedge-shape" class="wedge-shape"></div><p data-canvas-v2-node-id="criterion-pain" class="criterion criterion--pain">Urgent enough<br/>to change</p><p data-canvas-v2-node-id="criterion-reach" class="criterion criterion--reach">Narrow enough<br/>to reach</p><p data-canvas-v2-node-id="criterion-learn" class="criterion criterion--learn">Fast enough<br/>to learn</p><div data-canvas-v2-node-id="entry-wedge" class="entry-wedge"><span>The entry wedge</span><h2>Own reconciliation<br/>before owning workflow.</h2><p>Start where pain is frequent, the buyer is reachable, and each use produces proprietary learning.</p></div></section><section data-canvas-v2-node-id="decision-horizons" class="decision-horizons"><p data-canvas-v2-node-id="horizons-label">Decision horizons</p><article data-canvas-v2-node-id="horizon-now"><span>Now · 0–30 days</span><h3>Prove pain frequency.</h3><p>Observe ten real reconciliations and measure the cost of delay.</p></article><article data-canvas-v2-node-id="horizon-next"><span>Next · 30–90 days</span><h3>Prove repeatable reach.</h3><p>Test whether one channel can create five qualified learning loops.</p></article><article data-canvas-v2-node-id="horizon-later"><span>Later · after signal</span><h3>Expand from evidence.</h3><p>Broaden the workflow only after retention identifies the durable job.</p></article></section><footer data-canvas-v2-node-id="market-footer">Evidence narrows the choice. The choice creates the next evidence.</footer></main>`,
          css: `.northstar-artboard{--ink:#17171f;--muted:#6d6b78;--rule:rgba(34,31,53,.16);--violet:#684dff;--blue:#2f6fff;--amber:#c47a20;position:relative;box-sizing:border-box;width:2140px;min-width:2140px;min-height:1420px;padding:72px 86px 84px;background:#fefdfb;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}.market-landscape header{width:1040px}.market-landscape header>p:first-child{margin:0 0 22px;color:var(--violet);font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.market-landscape h1{margin:0;font-size:68px;line-height:.91;letter-spacing:-.062em}.market-landscape header>p:last-child{max-width:630px;margin:24px 0 0;color:var(--muted);font-size:17px;line-height:1.55}.signal-rail{position:absolute;left:86px;top:420px;width:430px;border-top:1px solid var(--rule);padding-top:18px}.signal-rail>p{margin:0 0 30px;color:var(--blue);font-size:10px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}.signal-rail ol{list-style:none;margin:0;padding:0}.signal-rail li{display:grid;grid-template-columns:44px 1fr;padding:18px 0;border-top:1px solid rgba(34,31,53,.09);counter-increment:signal}.signal-rail li::before{content:"0" counter(signal);color:#aaa7b2;font-size:11px}.signal-rail strong,.signal-rail span{display:block}.signal-rail strong{font-size:17px}.signal-rail span{grid-column:2;margin-top:5px;color:var(--muted);font-size:13px}.assumption-note{margin-top:34px;padding-left:16px;border-left:2px solid #e1a24f}.assumption-note b,.assumption-note span{display:block}.assumption-note b{color:var(--amber);font-size:10px;letter-spacing:.12em;text-transform:uppercase}.assumption-note span{margin-top:8px;color:#55525f;font-size:14px}.wedge-field{position:absolute;left:650px;top:270px;width:1370px;height:650px}.wedge-shape{position:absolute;left:350px;top:90px;width:570px;height:440px;background:rgba(104,77,255,.08);clip-path:polygon(0 0,100% 50%,0 100%)}.criterion{position:absolute;margin:0;color:#5b5868;font-size:14px;font-weight:720;line-height:1.35}.criterion::after{content:"";position:absolute;height:1px;background:var(--rule);transform-origin:left}.criterion--pain{left:0;top:70px}.criterion--pain::after{left:125px;top:32px;width:370px;transform:rotate(18deg)}.criterion--reach{left:5px;top:300px}.criterion--reach::after{left:126px;top:18px;width:360px}.criterion--learn{left:0;top:525px}.criterion--learn::after{left:125px;top:-3px;width:370px;transform:rotate(-18deg)}.entry-wedge{position:absolute;left:565px;top:185px;width:660px}.entry-wedge span{color:var(--violet);font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.entry-wedge h2{margin:15px 0 18px;font-size:42px;line-height:.98;letter-spacing:-.05em}.entry-wedge p{max-width:540px;margin:0;color:var(--muted);font-size:15px;line-height:1.55}.decision-horizons{position:absolute;left:650px;top:970px;display:grid;grid-template-columns:180px repeat(3,380px);gap:28px;width:1370px;padding-top:22px;border-top:1px solid var(--rule)}.decision-horizons>p{margin:0;color:#918e9d;font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}.decision-horizons article{padding-left:18px;border-left:1px solid var(--rule)}.decision-horizons span{color:var(--violet);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.decision-horizons h3{margin:13px 0 9px;font-size:22px;letter-spacing:-.035em}.decision-horizons article p{max-width:320px;margin:0;color:var(--muted);font-size:13px;line-height:1.5}.market-landscape footer{position:absolute;left:86px;bottom:78px;width:430px;padding-top:18px;border-top:1px solid var(--rule);font-size:20px;font-weight:720;line-height:1.25;letter-spacing:-.025em}`,
        },
      },
      evidence: [],
    });
  }

  if (body.instruction?.toLowerCase().includes("large two-dimensional discovery landscape")) {
    if (revision.document.html.includes("data-e2e-large-artboard")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: largeDirection(),
        spatialStrategy: largeSpatial(),
        reflection: reflection("The full 3600 by 2400 surface is rendered as one connected discovery argument with meaningful content at every extreme.", "No clipping or disconnected region remains.", "Complete after the runtime has observed the expanded geometry."),
        summary: "The expanded discovery landscape remains coherent and fully inspectable across both spatial axes.",
      },
      evidence: [],
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: largeDirection(),
        spatialStrategy: largeSpatial(),
        reflection: reflection("The current surface is still at its minimum geometry.", "The real-use proof needs purposeful content at distant bounds in both dimensions.", "Author one connected coordinate field so runtime growth, capture, fitting, and inspection are exercised together."),
        summary: "Expanded the living artboard into a connected two-dimensional discovery landscape.",
        expectedVisualResult: "Four distant editorial regions remain visible on a 3600 by 2400 warm-white surface joined by a continuous diagonal argument.",
        document: {
          html: `<main class="northstar-artboard large-landscape" data-e2e-large-artboard="true" data-canvas-v2-node-id="artboard" aria-label="Large two-dimensional discovery landscape"><svg data-canvas-v2-node-id="landscape-path" class="landscape-path" viewBox="0 0 3300 2060" aria-label="Discovery path"><path d="M240 270 C850 300 760 900 1500 940 S2380 1180 3060 1810"/><circle cx="240" cy="270" r="8"/><circle cx="1500" cy="940" r="8"/><circle cx="3060" cy="1810" r="8"/></svg><header data-canvas-v2-node-id="large-origin" class="large-region origin"><span>01 · governing question</span><h1>Where does uncertainty<br/>become useful?</h1><p>Follow the discovery path from raw evidence to a decision worth making.</p></header><section data-canvas-v2-node-id="large-evidence" class="large-region evidence"><span>02 · evidence field</span><h2>What changed?</h2><p>Separate the observed behavior from the story the team tells about it.</p></section><section data-canvas-v2-node-id="large-opportunity" class="large-region opportunity"><span>03 · opportunity</span><h2>What becomes possible?</h2><p>Find the smallest intervention that changes the trajectory and increases learning.</p></section><section data-canvas-v2-node-id="large-decision" class="large-region decision"><span>04 · decision</span><h2>Act where the next signal<br/>arrives fastest.</h2><p>A useful decision creates evidence, not merely alignment.</p></section><p data-canvas-v2-node-id="large-coordinate-x" class="coordinate coordinate-x">breadth of market understanding →</p><p data-canvas-v2-node-id="large-coordinate-y" class="coordinate coordinate-y">depth of validated learning →</p></main>`,
          css: `.northstar-artboard{position:relative;box-sizing:border-box;width:3600px;min-width:3600px;height:2400px;min-height:2400px;background:#fefdfb;color:#18171f;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.large-landscape{overflow:visible}.landscape-path{position:absolute;left:150px;top:150px;width:3300px;height:2060px;overflow:visible}.landscape-path path{fill:none;stroke:rgba(104,77,255,.30);stroke-width:2;stroke-dasharray:8 13}.landscape-path circle{fill:#684dff}.large-region{position:absolute;width:660px}.large-region span{color:#684dff;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.large-region h1,.large-region h2{margin:20px 0 22px;letter-spacing:-.058em}.large-region h1{font-size:72px;line-height:.93}.large-region h2{font-size:46px;line-height:.98}.large-region p{max-width:520px;margin:0;color:#676471;font-size:17px;line-height:1.55}.origin{left:210px;top:210px}.evidence{left:1000px;top:720px}.opportunity{left:2020px;top:1050px}.decision{left:2780px;top:1740px}.coordinate{position:absolute;margin:0;color:#aaa5b4;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.coordinate-x{left:210px;bottom:95px}.coordinate-y{left:74px;top:2000px;transform:rotate(-90deg);transform-origin:left top}`,
        },
      },
      evidence: [],
    });
  }

  if (body.instruction?.includes("Selected node:") && !revision.document.html.includes("data-e2e-selection-edited")) return NextResponse.json({
    decision: {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "edit",
      moveKind: "refinement",
      creativeDirection: direction("Give the selected conclusion a precise violet emphasis without disturbing the composition.", []),
      spatialStrategy: spatial("Keep every bound stable and change only the selected title's semantic emphasis.", "stable"),
      reflection: reflection("The resolved comparison is visible and the selected conclusion is structurally isolated.", "Only the requested local emphasis remains.", "A restrained selection refinement preserves the wider visual thesis."),
      summary: "Refined the selected synthesis title while preserving the surrounding composition.",
      expectedVisualResult: "The selected title carries the requested violet emphasis and all research remains unchanged.",
      document: {
        html: revision.document.html.replace('data-canvas-v2-node-id="synthesis-title"', 'data-canvas-v2-node-id="synthesis-title" data-e2e-selection-edited="true"'),
        css: `${revision.document.css}\n[data-e2e-selection-edited]{color:#6953ea}`,
      },
    },
    evidence: revision.evidence,
  });

  if (body.instruction?.includes("Selected node:") && revision.document.html.includes("data-e2e-selection-edited")) return NextResponse.json({
    decision: {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "complete",
      creativeDirection: direction("Give the selected conclusion a precise violet emphasis without disturbing the composition.", []),
      spatialStrategy: spatial("Preserve the selected refinement and the complete surrounding evidence field.", "stable"),
      reflection: reflection("The selected synthesis title now carries the requested emphasis and the surrounding composition is unchanged.", "No selection-specific adjustment remains.", "Complete after observing the isolated transformation."),
      summary: "The selected synthesis title was refined without changing either canonical evidence flow.",
    },
    evidence: revision.evidence,
  });

  if (!(body.run?.researchTargets?.length)) {
    if (revision.document.html.includes("data-e2e-generic-transform")) return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "complete",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The requested idea is now expressed as a concise visual thesis without unrelated product research.", "No further visual structure is required for this bounded request.", "Complete after observing the authored transform."),
        summary: "The requested visual idea is complete and the artboard contains no unrelated app evidence.",
      },
      evidence: revision.evidence,
    });
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "framing",
        creativeDirection: mapDirection(),
        spatialStrategy: mapSpatial(),
        reflection: reflection("The current surface has no answer to the user's conceptual request.", "A clear visual thesis is needed without introducing irrelevant app flows.", "Author a restrained editorial transform directly on the surface."),
        summary: "Created a focused editorial visual answer without invoking account research.",
        expectedVisualResult: "A direct-on-surface visual thesis appears with no unrelated product evidence.",
        document: {
          html: `<main class="northstar-artboard generic-transform" data-e2e-generic-transform="true" data-canvas-v2-node-id="artboard" aria-label="Conceptual visual answer"><p data-canvas-v2-node-id="generic-kicker">North Star · visual reasoning</p><h1 data-canvas-v2-node-id="generic-title">Make the decision<br/>legible.</h1><p data-canvas-v2-node-id="generic-copy">The artboard changed because the request called for a visual answer. No account research was required or fabricated.</p></main>`,
          css: `.northstar-artboard{box-sizing:border-box;width:1680px;min-width:1680px;min-height:945px;padding:120px 130px;background:#fefdfb;color:#18171f;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.generic-transform>p:first-child{margin:0;color:#684dff;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.generic-transform h1{margin:28px 0 30px;font-size:78px;line-height:.9;letter-spacing:-.065em}.generic-transform>p:last-child{max-width:620px;margin:0;padding-top:22px;border-top:1px solid rgba(35,31,55,.16);color:#676471;font-size:17px;line-height:1.6}`,
        },
      },
      evidence: revision.evidence,
    });
  }

  const catalog = { tenantId: "e2e", apps: CANVAS_V2_E2E_APPS };
  const researchIndex = buildCanvasV2ResearchCatalogIndex(catalog, body.instruction ?? "", revision, body.run?.researchTargets);
  const requestedNames = new Set((body.run?.researchTargets ?? []).map((name) => name.toLowerCase()));
  const nextApp = CANVAS_V2_E2E_APPS.find((app) => requestedNames.has(app.name.toLowerCase()) && !revision.document.html.includes(`data-canvas-v2-canonical-flow="${app.flows[0]?.id}"`));
  if (nextApp?.flows[0]) {
    const isFirst = revision.evidence.length === 0;
    const researchDecision = {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "research",
        moveKind: "research",
        creativeDirection: direction(
          `Ground the complete ${nextApp.name} sequence before deciding how the comparison should resolve spatially.`,
          isFirst ? ["Retrieve the contrasting flow", "Establish the editorial frame"] : ["Establish the editorial frame", "Organize the evidence field"],
        ),
        spatialStrategy: spatial(`Let the canonical ${nextApp.name} sequence extend the evidence field horizontally while preserving the 170px identity rail.`, "horizontal"),
        reflection: reflection(
          isFirst ? "The artboard is an open working surface with no grounded comparison evidence yet." : "One complete onboarding flow is visible, preserving its sequence and product identity.",
          `The complete ${nextApp.name} flow is still needed for a truthful comparison.`,
          "Visible research is the next meaningful move because the visual argument must begin from complete source material.",
        ),
        appId: nextApp.id,
        flowId: nextApp.flows[0].id,
        summary: `Retrieved the complete ${nextApp.name} onboarding flow and placed it on the visible working surface.`,
        expectedVisualResult: `${nextApp.name}'s icon and complete ordered screenshots appear as a premium canonical lane.`,
      } as const;
    return NextResponse.json({
      decision: researchDecision,
      research: canvasV2ResearchResultForFlow(nextApp, nextApp.flows[0]),
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex, researchDecision),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"framing\"")) {
    const header = `<header class="e2e-editorial-header" data-e2e-stage="framing" data-canvas-v2-node-id="editorial-header"><div data-canvas-v2-node-id="editorial-title-group"><p class="e2e-eyebrow" data-canvas-v2-node-id="editorial-eyebrow">Executive onboarding study</p><h1 data-canvas-v2-node-id="editorial-title">Confidence, built at two speeds.</h1><p class="e2e-deck" data-canvas-v2-node-id="editorial-deck">Awin makes qualification explicit before momentum. Whop protects momentum and lets identity emerge through action.</p></div><div class="e2e-note" data-canvas-v2-node-id="working-hypothesis"><p class="e2e-note-label" data-canvas-v2-node-id="hypothesis-label">Working hypothesis</p><p data-canvas-v2-node-id="hypothesis-copy">Trust is staged in Awin; velocity is staged in Whop.</p></div><div class="e2e-note" data-canvas-v2-node-id="research-question"><p class="e2e-note-label" data-canvas-v2-node-id="question-label">What the evidence tests</p><p data-canvas-v2-node-id="question-copy">Where does each product ask the user to commit?</p></div></header>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "framing",
        creativeDirection: direction("Give the grounded comparison a concise editorial premise and an explicit question.", ["Build a reading axis through both flows", "Develop the executive analysis"]),
        spatialStrategy: spatial("Establish the 1560px alignment rail and distribute the headline plus two research notes across a controlled three-column opening.", "vertical"),
        reflection: reflection("Both complete flows now read as an inspectable evidence field, but their strategic difference is not yet framed.", "The viewer needs a thesis and a question before reading the sequences.", "An editorial frame creates meaning without enclosing or reducing the evidence."),
        summary: "Established a clear editorial premise above the complete evidence surface.",
        expectedVisualResult: "A strong headline, working hypothesis, and evidence question lead directly into both intact onboarding flows.",
        document: {
          html: revision.document.html.replace('<section class="canvas-v2-grounded-evidence"', `${header}<section class="canvas-v2-grounded-evidence"`),
          css: `${revision.document.css}\n${BASE_CSS}`,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"composition\"")) {
    const axis = `<section class="e2e-reading-axis" data-e2e-stage="composition" data-canvas-v2-node-id="reading-axis"><div class="e2e-axis-intro" data-canvas-v2-node-id="axis-intro">Read the flows through</div><div class="e2e-axis-point" data-canvas-v2-node-id="axis-entry"><strong>Entry promise</strong>What value is offered before effort?</div><div class="e2e-axis-point" data-canvas-v2-node-id="axis-commitment"><strong>Commitment point</strong>When does identity become required?</div><div class="e2e-axis-point" data-canvas-v2-node-id="axis-reward"><strong>First reward</strong>How quickly does progress feel tangible?</div></section>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "composition",
        creativeDirection: direction("Turn the two raw sequences into one legible comparative reading field without hiding their completeness.", ["Translate the evidence into an executive finding", "Refine hierarchy and rhythm"]),
        spatialStrategy: spatial("Align three comparison questions to the evidence sequence while preserving the fixed identity rail and peer screenshot scale.", "vertical"),
        reflection: reflection("The opening now supplies a distinctive thesis, but the eye still reads the flows as two independent rows.", "A shared reading axis can make the comparison scannable without adding containers.", "Three simple questions create a compositional bridge between the editorial premise and the evidence."),
        summary: "Introduced a shared reading axis that organizes both complete flows as one comparison.",
        expectedVisualResult: "Three crisp comparison lenses sit directly above the evidence lanes and create a strong left-to-right reading rhythm.",
        document: {
          html: revision.document.html.replace('<section class="canvas-v2-grounded-evidence"', `${axis}<section class="canvas-v2-grounded-evidence"`),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"analysis\"")) {
    const analysis = `<section class="e2e-analysis" data-e2e-stage="analysis" data-canvas-v2-node-id="executive-analysis"><div class="e2e-analysis-heading" data-canvas-v2-node-id="analysis-heading"><p class="e2e-section-label" data-canvas-v2-node-id="analysis-label">What the sequences reveal</p><h2 data-canvas-v2-node-id="synthesis-title">Friction is doing different jobs.</h2></div><article class="e2e-analysis-column" data-canvas-v2-node-id="awin-analysis"><h3 data-canvas-v2-node-id="awin-analysis-title">Awin · confidence before velocity</h3><p data-canvas-v2-node-id="awin-analysis-copy">More guided context creates confidence for a higher-consideration partner relationship. The cost is a later feeling of forward motion.</p><small data-canvas-v2-node-id="awin-analysis-signal">Signal · qualification is part of the promise</small></article><article class="e2e-analysis-column e2e-analysis-column--whop" data-canvas-v2-node-id="whop-analysis"><h3 data-canvas-v2-node-id="whop-analysis-title">Whop · velocity before certainty</h3><p data-canvas-v2-node-id="whop-analysis-copy">A compressed identity path protects the creator's momentum. Confidence is deferred until the product can prove value through action.</p><small data-canvas-v2-node-id="whop-analysis-signal">Signal · progress is part of the promise</small></article></section>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "analysis",
        creativeDirection: direction("Resolve the comparison into one grounded executive distinction while keeping the evidence immediately available above it.", ["Refine the complete visual system and conclusion"]),
        spatialStrategy: spatial("Extend the composition downward into a 300px conclusion anchor plus two equal analytical columns on the same outer rail.", "vertical"),
        reflection: reflection("The evidence now shares a strong comparative axis and the two product philosophies are easy to inspect.", "The board still needs an explicit conclusion that translates sequence into strategic meaning.", "A direct-on-surface analysis completes the argument without covering the research in summary cards."),
        summary: "Developed the evidence into a balanced executive analysis of confidence and velocity.",
        expectedVisualResult: "A disciplined analysis section beneath the flows explains the distinct role friction plays in each onboarding strategy.",
        document: {
          html: revision.document.html.replace("</main>", `${analysis}</main>`),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  if (!revision.document.html.includes("data-e2e-stage=\"refinement\"")) {
    const conclusion = `<footer class="e2e-conclusion" data-e2e-stage="refinement" data-canvas-v2-node-id="executive-conclusion"><p class="e2e-section-label" data-canvas-v2-node-id="conclusion-label">Executive implication</p><blockquote data-canvas-v2-node-id="conclusion-copy">The better pattern is not fewer steps. It is making every step <em>earn the user's next commitment.</em></blockquote></footer>`;
    return NextResponse.json({
      decision: {
        schema: CANVAS_V2_DECISION_SCHEMA,
        decision: "edit",
        moveKind: "refinement",
        creativeDirection: direction("Unify the full board into one polished editorial argument with a memorable final implication.", []),
        spatialStrategy: spatial("Reconcile section rules, screenshot shadows, semantic colors, and vertical intervals without changing the established geometry.", "stable"),
        reflection: reflection("The board is analytically complete and grounded, with a clear frame, shared reading axis, and balanced interpretation.", "The final pass should tighten visual rhythm and leave the viewer with one memorable implication.", "A restrained refinement can unify color, rules, shadows, spacing, and the concluding statement without changing the evidence."),
        summary: "Refined typography, semantic accents, spacing, and the final executive implication into one coherent North Star composition.",
        expectedVisualResult: "The full artboard reads as a premium editorial analysis from thesis to evidence to conclusion, with no card-grid treatment.",
        document: {
          html: revision.document.html.replace('class="northstar-artboard"', 'class="northstar-artboard e2e-refined"').replace("</main>", `${conclusion}</main>`),
          css: revision.document.css,
        },
      },
      evidence: revision.evidence,
      researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
    });
  }

  return NextResponse.json({
    decision: {
      schema: CANVAS_V2_DECISION_SCHEMA,
      decision: "complete",
      creativeDirection: direction("Hold the resolved editorial comparison as the final visible artifact.", []),
      spatialStrategy: spatial("Preserve the resolved alignment system and complete evidence field; no spatial adjustment remains.", "stable"),
      reflection: reflection("The visible artboard now moves coherently from premise, through complete source flows, to grounded analysis and a concise executive implication.", "No material communication gap remains for the requested balanced comparison.", "Completion is appropriate because further elements would dilute the hierarchy rather than clarify the answer."),
      summary: "The visible artboard preserves both complete onboarding flows and resolves them into a distinctive, grounded executive comparison.",
    },
    evidence: revision.evidence,
    researchStatus: canvasV2ResearchStatusForDecision(researchIndex),
  });
}
