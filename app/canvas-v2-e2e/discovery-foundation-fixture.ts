import {
  applyCanvasV2DiscoveryTransition, assessCanvasV2DiscoveryCompletion, completeCanvasV2DiscoveryState,
  type CanvasV2DiscoveryState,
} from "@/lib/canvas-v2/discovery-state";
import { directCanvasV2CreationTransition, parseCanvasV2DiscoveryTransition } from "@/lib/canvas-v2/discovery-orchestrator";
import { findCanvasV2SourceNodeRange, materializeCanvasV2ConnectorRequests } from "@/lib/canvas-v2/source-patch";
import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";

/** Deterministic model substitute; executes the production discovery reducer. */
export function discoveryFoundationFixture(instruction: string, revision: CanvasV2ArtifactRevision, state?: CanvasV2DiscoveryState) {
  const stage = instruction === "Exercise discovery branches" ? "start"
    : instruction === "Defer the teaser branch" ? "pause"
    : instruction === "Resume the teaser branch" ? "resume" : undefined;
  if (!stage || !state) return undefined;
  const now = new Date().toISOString();
  // Native serialization intentionally drops fixture-only attributes after a
  // human edit. Recognize the visible result instead of requiring that marker.
  const stageVisible = stage === "start"
    ? revision.document.html.includes('data-canvas-v2-node-id="discovery-title"')
    : revision.document.html.includes(stage === "pause" ? "Teaser · Revisit when evidence arrives" : "Teaser · Resumed with new context");
  const done = stageVisible && (stage !== "start" || revision.document.html.includes('data-canvas-v2-node-id="discovery-link"'));
  const summary = stage === "start" ? "Two explanations remain open for investigation."
    : stage === "pause" ? "The teaser question is retained for later; hiring remains open."
    : "The teaser question is active again, with the other work preserved.";
  if (done) return {
    done, summary,
    discoveryState: completeCanvasV2DiscoveryState({ state: assessCanvasV2DiscoveryCompletion(state, {
      satisfiedCriteria: [...state.completion.criteria], materialOpenRequirements: [], rationale: "The requested board update is visible; open research questions remain honestly open.",
    }), summary, now }),
    document: revision.document,
  };
  if (stage === "start" && stageVisible) {
    const range = findCanvasV2SourceNodeRange(revision.document.html, "discovery-study");
    if (!range) throw new Error("The relationship turn needs its existing composition island.");
    const connector = materializeCanvasV2ConnectorRequests('<div data-canvas-v2-node-id="discovery-link" data-canvas-v2-connector-request="true" data-from="discovery-teaser" data-to="discovery-hiring" data-x1="580" data-y1="320" data-x2="980" data-y2="320" data-variant="bent" data-waypoints="740,480 920,480"></div>');
    const transition = { ...directCanvasV2CreationTransition(state),
      move: { ...directCanvasV2CreationTransition(state).move, id: "discovery-fixture-relationships", status: "completed" as const } };
    return { done: false, summary: "Connect the observed investigation branches with a native route in the existing island.",
      discoveryState: applyCanvasV2DiscoveryTransition({ state, transition, graph: revision.discoveryGraph, now }),
      document: { ...revision.document, html: revision.document.html.slice(0, range.closeStart) + connector + revision.document.html.slice(range.closeStart) } };
  }
  const initial = stage === "start";
  const draft = {
    ...directCanvasV2CreationTransition(state),
    move: { ...directCanvasV2CreationTransition(state).move, id: `discovery-fixture-${stage}`, status: "completed" as const },
    latestUnderstanding: summary,
    addQuestions: initial ? [
      { id: "teaser-question", question: "Does the teaser indicate a new product?", priority: "high" as const, whyItMatters: "It changes the launch interpretation." },
      { id: "hiring-question", question: "Which explanation fits the hiring signal?", priority: "medium" as const, whyItMatters: "The evidence may support another explanation." },
    ] : [],
    questionUpdates: initial ? [] : [{ id: "teaser-question", status: stage === "pause" ? "deferred" as const : "open" as const, reason: summary, evidenceNodeIds: [] }],
    lineUpdates: [
      { id: "teaser-line", label: "Teaser investigation", questionIds: ["teaser-question"], status: stage === "pause" ? "deferred" as const : "active" as const, reason: summary },
      ...(initial ? [{ id: "hiring-line", label: "Hiring investigation", questionIds: ["hiring-question"], status: "active" as const, reason: "Keep the alternative available." }] : []),
    ],
    contradictionUpdates: [],
    completion: { ...state.completion, satisfiedCriteria: [], materialOpenRequirements: [], readiness: "not-ready" as const, rationale: "Verify the requested update on the canvas." },
  };
  const discoveryState = applyCanvasV2DiscoveryTransition({ state, transition: parseCanvasV2DiscoveryTransition(draft, state), graph: revision.discoveryGraph, now });
  let html = revision.document.html;
  let css = revision.document.css;
  if (initial) {
    const content = materializeCanvasV2ConnectorRequests('<section data-canvas-v2-node-id="discovery-study" data-discovery-foundation-stage="start" data-canvas-v2-design-region><h2 data-canvas-v2-node-id="discovery-title">Follow the signals. Keep the alternatives.</h2><p data-canvas-v2-node-id="discovery-teaser">Teaser · Open question</p><p data-canvas-v2-node-id="discovery-hiring">Hiring · Alternative explanation</p><p data-canvas-v2-node-id="discovery-note">Team note: keep both possibilities visible.</p></section>');
    html = /<\/main>\s*$/.test(html) ? html.replace(/<\/main>\s*$/, `${content}</main>`) : html + content;
    css += '\n[data-canvas-v2-node-id="discovery-study"]{position:relative;width:1700px;height:800px;color:var(--northstar-ink)}[data-canvas-v2-node-id="discovery-title"]{position:absolute;left:70px;top:60px;width:1500px;font:600 84px/1.2 Georgia}[data-canvas-v2-node-id="discovery-teaser"],[data-canvas-v2-node-id="discovery-hiring"]{position:absolute;top:300px;width:640px;font:500 48px/1.4 Inter,sans-serif}[data-canvas-v2-node-id="discovery-teaser"]{left:70px;color:var(--northstar-accent)}[data-canvas-v2-node-id="discovery-hiring"]{left:980px}[data-canvas-v2-node-id="discovery-note"]{position:absolute;left:70px;top:560px;width:1350px;font:400 46px/1.4 Inter,sans-serif}';
  } else {
    html = html.replace(/data-discovery-foundation-stage="[^"]+"/, `data-discovery-foundation-stage="${stage}"`);
    const range = findCanvasV2SourceNodeRange(html, "discovery-teaser");
    if (!range) throw new Error("The deterministic inquiry needs its existing teaser object.");
    const label = stage === "pause" ? "Teaser · Revisit when evidence arrives" : "Teaser · Resumed with new context";
    html = html.slice(0, range.openEnd) + label + html.slice(range.closeStart);
  }
  return { done, summary, discoveryState, document: { ...revision.document, html, css } };
}
