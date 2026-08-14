# Phase 7D.5 — Real-use proof

> Historical note: Phase 7E.3.3 replaces this phase's reload-continuity
> expectations with a hard refresh reset. Current browser coverage proves that
> artboard, chat, active work, and undo/redo history are cleared on reload.

Phase 7D.5 replaces the stale single-objective preview check with cumulative
browser journeys over the Canvas V2 architecture that will ship. It proves
mechanical and lifecycle truth; it does not add an aesthetic evaluator, score
model output, prescribe one composition, or move persistence to Supabase.

## A general proof surface

The deterministic browser provider now mirrors the semantic router boundary:

- conversation and inspection do not mutate the artifact;
- product-flow, screenshot, onboarding, evidence, and comparison requests for
  named connected products use research and design;
- visual product, marketing, business, and discovery questions that need no
  account evidence use a direct transform;
- selection-specific instructions target the selected stable source node.

The provider remains isolated under `app/canvas-v2-e2e`. Its deterministic
compositions exist only to make browser behavior reproducible. Production
Canvas V2 contains no Awin/Whop prompt branch, objective list, benchmark
language, or template selector; the production router and design model remain
semantic and model-authored.

Inspection is now revision-aware in the proof harness. It reports the evidence
flows and authored stages actually present in committed source instead of
always claiming the artboard is empty. Deterministic research responses also
carry the same target coverage truth as production, so a committed canonical
flow is shown as visible rather than unresolved.

## Real-use journeys

The new `canvas-v2-real-use.spec.ts` exercises:

1. the standard Awin/Whop request from a clean artboard through two visible
   research turns, framing, composition, analysis, refinement, and explicit
   model completion;
2. all 12 Awin screenshots, all 9 Whop screenshots, both app icons, original
   order, canonical roles, and exactly one flow lane per product;
3. normal conversation and grounded artboard inspection with no revision
   mutation;
4. a source-backed selected-title transformation that leaves both complete
   evidence flows intact;
5. browser-local reload of that committed selected revision and its chat
   context;
6. an unrelated vertical-SaaS market-entry problem that routes to a distinct
   2140×1420 decision landscape with facts and assumptions separated and zero
   fabricated app evidence;
7. a 3600×2400 two-dimensional discovery landscape that grows in both axes,
   auto-fits to 25%, remains selectable through stable source identity, and
   survives reload;
8. manual primitive creation plus undo, redo, and layer inspection through the
   same candidate-render-observe-commit authority.

The existing lifecycle, reliability, research-completeness, and local-recovery
specifications remain part of the same Canvas V2 suite. Together they cover
routing stop, design stop, late-response rejection, the explicit continuation
boundary, transient retries, retry exhaustion, backoff cancellation, partial
research, unavailable evidence, interrupted research recovery, corrupt local
state, future recovery schemas, manual history reload, and interrupted reload.

## Browser evidence

The live browser audit verified the following rendered facts:

| Journey | Rendered proof |
| --- | --- |
| Standard comparison | 2 canonical lanes, 23 canonical icon/screen nodes, 4 authored design stages, 1986×1447 geometry, Awin and Whop both visible |
| Market-entry landscape | `transform` route, 2140×1420 geometry, no canonical flow and no evidence binding |
| Large discovery landscape | exact 3600×2400 geometry, 25% fitted viewport, stable selection and reload |
| Conversation and inspection | committed revision identity unchanged and inspection names the 2 visible flows plus authored stages |
| Selected transformation | exactly one selected refinement; both canonical lanes and all 23 canonical nodes preserved |
| Exhausted failure | failed terminal state, no candidate publication, previous large artboard preserved |
| Interruption | stopped terminal state, no late lifecycle revision, previous large artboard preserved |

These assertions intentionally evaluate system behavior and factual source/render
integrity, not whether the model's visual taste is “correct.” The user remains
the visual evaluator. Browser screenshots are inspected during development for
composition quality while the automated suite protects the objective truths
that must never regress.

## Verification commands

```bash
npm run test:canvas-v2
npm run test:e2e:canvas-v2
```

The focused unit command covers all Canvas V2 contracts. The focused browser
command runs the complete set of Canvas V2 real-use, lifecycle, reliability,
research, and recovery journeys without coupling the patch to stale V1 E2E
expectations.
