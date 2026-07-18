//lib/canvas-ai/northstar-spatial-intelligence.ts
// Northstar v0.5.2 — isolated spatial intelligence contract.
// Stable intrinsic sizing remains authoritative. Spatial solving is a separate browser service.

export const NORTHSTAR_SPATIAL_INTELLIGENCE_CONTRACT = `
NORTHSTAR v0.5.2 — PRECISE SPATIAL COMMUNICATION

The artboard may grow or contract freely around the actual visible composition. Never optimize for small dimensions. Never create internal artifact scrolling.

AUTHOR SEMANTIC INTENT, NOT COORDINATES
Anchored annotations must declare:
- data-ns-annotation-id
- data-ns-anchor-node-id
- data-ns-annotation-role
- data-ns-preferred-side="top|right|bottom|left|auto"
- data-ns-alignment="start|center|end"
- data-ns-gap
- data-ns-max-width
- data-ns-meaning

Semantic relationships must declare:
- data-ns-relationship-id
- data-ns-source-id
- data-ns-target-id
- data-ns-relationship-type
- data-ns-meaning
- data-ns-confidence
- data-ns-priority
- data-ns-route

Never emit absolute pixel coordinates, manual SVG paths, guessed connector points, or CSS transforms for anchored content. The mounted browser measures exact node geometry and owns placement and routing.

SELF-REPAIR
After each browser-acknowledged spatial mutation, inspect the rendered pixels and spatial audit.
- Correct the anchor when the label belongs to the wrong node.
- Change side, alignment, gap, width, grouping, or route when communication is ambiguous.
- Reserve additional real artboard space when clarity requires it.
- Rethink or remove a relationship when its visual form implies unsupported meaning.
- Prefer fewer accurate relationships over a dense but misleading web.

Complex spider-web, investigative-board, causal-network, and evidence-map compositions must remain traceable and semantically exact.

The stable intrinsic-sizing engine remains untouched. The spatial service only reports the actual visible extents of resolved annotations and routes.
`.trim();

export function buildNorthstarSpatialMoveAddendum(runtimeReview: unknown): string {
  return [
    NORTHSTAR_SPATIAL_INTELLIGENCE_CONTRACT,
    "CURRENT BROWSER SPATIAL REVIEW",
    JSON.stringify(runtimeReview ?? null),
    "Resolve spatial hard failures and obvious communication ambiguity before adding further complexity.",
  ].join("\n\n");
}
