# Phase 7E.3.4 — Canonical evidence, spatial integrity, and provider continuity

This patch closes the three failures exposed by the authenticated Awin/Whop
run without adding product-specific rules or remote canvas persistence. V1
remains dormant and recoverable; retirement is still paused until this exact
path is exercised live.

## Canonical tenant evidence

One neutral media authority now resolves the physical screenshot directory at
the data boundary. It supports both historical root mobile paths and newer
`mobile/` paths, verifies the reference filename against storage, and gives the
Flow explorer and Canvas V2 the same absolute URL. Renderers no longer guess a
storage layout. These are read-only storage probes; Canvas state is not written
to Supabase.

The taxonomy adapter now distinguishes five evidence shapes:

- a `journey` is one linear root journey assembled from sequential stages;
- a `path` is one complete route through explicit alternatives;
- a `flow` is an ordered taxonomy stage that is useful when named directly;
- a `collection` contains multiple alternatives and is supporting context, not
  a user journey;
- a `session` is the complete capture fallback when no stronger taxonomy path
  exists.

Explicit `spine` and `branches` metadata produces separate complete path
candidates. Sibling alternatives are never concatenated into a fake 44-step
journey. The model still chooses the relevant path from tenant metadata; no
Awin or Whop conditional exists.

## Complete spatial bounds

Canonical evidence lanes now occupy the authored surface width and wrap whole,
naturally proportioned screenshots. The old nested 2,380/2,600/2,680px caps and
the iframe's hidden overflow are removed. The first render uses the 1,680px
North Star surface, grows vertically for long flows, and exposes complete
intrinsic bounds to the outer pan/zoom canvas. Later model-authored turns remain
free to grow either axis when the communication requires it.

## Provider continuity

Both V2 model entry points now perform one audited primary call and hand the
same logical request to the configured fallback only for genuine availability
or timeout failures. Authentication, policy, rate-limit, and invalid-response
errors do not escape through fallback. If both models are unavailable, the run
pauses on the latest verified revision and exposes the existing continuation
action instead of repeating the entire endpoint three times or discarding the
research already committed.

## Verification

The V2 tests now use raw database-shaped sequential and branching taxonomies,
both supported storage layouts, non-clipping layout contracts, provider
handoff/exhaustion, and resumable pause state. The deterministic browser fixture
no longer encodes a flattened 44-screen Awin journey as the expected result.

```bash
npm run test:canvas-v2
npm run test:e2e:canvas-v2
npm run check:canvas-v2-production-proof
npm run check:canvas-v2-cutover
npm run typecheck
```

The repository-wide typecheck still reaches the pre-existing dormant-V1 type
error in `lib/canvas-ai/northstar-two-turn-design-reset.ts`; this patch adds no
V2 type errors.
