# Phase 7C hardening: evidence authorship

Phase 7C hardening makes the growing North Star artboard safe for ambitious,
model-authored evidence composition without introducing a visual evaluator.

## Two evidence layers

1. **Canonical flow sources** are the complete, ordered app flows placed by the
   research adapter. Their lane identity, original image identities, evidence
   IDs, exact URLs, and screen order survive every later revision. The model may
   reposition and style a lane, add deliberate gaps, and author annotations or
   relationships around it, but it cannot replace the source record with a
   summary or a copy elsewhere.
2. **Analytical copies** are model-authored uses of canonical screenshots in
   comparisons, enlarged inspections, journeys, causal arguments, and synthesis.
   Each copy has its own node identity and declares the canonical image node it
   came from. Copies never consume or impersonate the source screenshot.

This is a provenance and document-integrity contract. It does not score taste,
choose a layout, prescribe cards, or decide what analysis North Star should make.

## Commit boundary

Before a source revision can render, the V2 boundary rejects duplicate node
identities, missing canonical lanes, moved or reordered canonical images,
changed evidence bindings, and untraceable analytical copies. Manual mutations
use the same continuity check as model-authored edits.

After the iframe renders, its factual observation includes every evidence
image's bounds, natural dimensions, role, source identity, object-fit behavior,
visibility, clipping ancestors, and aspect-ratio state. A candidate cannot
commit when grounded evidence failed to load or when canonical evidence is
hidden, clipped, cropped, distorted, or outside the rendered artboard.

## Additive working surface

The design prompt now treats existing research and useful analytical discoveries
as cumulative working context. North Star can grow, reorganize, refine, or
deliberately consolidate the surface according to the user's prompt and its own
design judgment. The runtime protects evidence lineage; the model remains the
sole author of composition, communication, and visual form.
