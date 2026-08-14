# Phase 7E.3.5 — Canonical journey rails and resilient research execution

This patch corrects the remaining behavior exposed by the authenticated
Awin/Whop run. V1 remains dormant and recoverable. Canvas state remains
in-memory only and this patch adds no Supabase writes.

## Canonical journey compilation

Tenant flow taxonomy is the authority. Explicit `spine`/`branches` structures
still compile into complete paths. Curated sibling taxonomies now also support
a shared journey entry: a node explicitly marked as a common entry, or a
semantically identified landing/persona/role/path-selection flow, is prepended
to each complete sibling branch. The compiler therefore exposes truthful
`shared entry → selected branch` candidates instead of either omitting the
entry or flattening every alternative into one false journey.

The rule is structural and semantic; it contains no product-name conditional.
For the browser proof, Awin resolves to 3 common-entry screens followed by one
44-screen creator branch, while Whop remains one linear 17-screen journey.

## Intrinsic horizontal evidence rails

Every canonical journey is one uninterrupted left-to-right rail. Screenshots
never wrap, crop, overlap, or reorder. The warm-white artboard grows to the
rail's intrinsic width and the outer canvas remains responsible for pan, zoom,
and fit behavior. Shared-entry and branch-specific segments receive quiet
transition markers directly on the rail; screenshots remain uncarded source
material.

Canonical render validation now rejects wrapped evidence. Analytical copies,
annotations, relationships, and model-authored synthesis remain free to occupy
the rest of the growing surface without removing the canonical source rail.

## Deterministic research before creative inference

Once the interaction router establishes explicit account-research targets, the
server resolves the next scope-adequate canonical journey deterministically.
Each retrieval is still rendered, observed, committed, and shown as a visible
turn, but no model request is spent deciding that Awin should be followed by
Whop. The model begins work after required evidence is grounded and remains the
sole author of framing, composition, relationships, analysis, and refinement.

## Wide-artboard visual context

The model receives the bounded full-artboard overview plus JPEG detail strips
covering canonical rails in groups of ten screenshots. This preserves overall
composition and screenshot-level legibility on a several-thousand-unit-wide
working surface. Exact spatial measurements remain the geometry authority.

## One provider deadline

Primary and fallback calls now share a single deadline. The primary has a
bounded slice and cannot consume the fallback's execution window. Every
attempt carries transient in-memory audit metadata: model, outcome, duration,
and failure code. A successful fallback continues the same logical turn; dual
availability failure pauses on the latest verified artboard for continuation.

## Verification

- Canvas V2 unit contracts cover sibling-entry compilation, deterministic
  research selection, no-wrap evidence integrity, segmented rail observations,
  and shared provider deadlines.
- The browser proof renders Awin as 47 ordered screenshots with two journey
  segments and Whop as 17 ordered screenshots.
- Both lanes occupy exactly one row on a 6,873-unit-wide artboard with no
  clipping, followed by framing, composition, analysis, and refinement turns.
- Refresh still produces a completely new in-memory Canvas V2 session.

```bash
npm run test:canvas-v2
npm run test:e2e:canvas-v2
npm run check:canvas-v2-production-proof
npm run check:canvas-v2-cutover
npm run typecheck
```

The repository-wide typecheck still reaches the pre-existing dormant-V1 type
error in `lib/canvas-ai/northstar-two-turn-design-reset.ts`; this patch adds no
V2 type error.
