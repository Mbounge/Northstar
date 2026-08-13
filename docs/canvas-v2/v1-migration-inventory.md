# Canvas V1 to V2 migration inventory

This inventory is a deletion and migration map, not permission to import V1
design logic into V2.

## Reuse through neutral adapters

- Supabase authentication and tenant resolution.
- Competitor, application, flow, and screenshot data access.
- Approved evidence URLs and durable evidence identity.
- Conversation transport and user-facing progress UI concepts.
- General application shell, navigation, theme, and account behavior.

## Rebuild behind a smaller interface

- The HTML/CSS/JavaScript artifact document becomes
  `CanvasV2ArtifactDocument`.
- Iframe isolation becomes a disposable candidate renderer.
- Persistence stores immutable V2 revisions rather than mutation journals.
- Browser reporting becomes one revision-bound render observation.
- Provider interruption resumes from a committed revision and instruction,
  without a long-lived server/browser acknowledgement loop.

## V1-only until cutover

- `components/canvas/north-star-canvas-workspace.tsx`
- `components/canvas/artifacts/code-artifact-host.tsx`
- `app/api/canvas-ai/route.ts`
- `lib/canvas-ai/**`
- `lib/canvas-artifacts/**`
- existing Northstar contract and diagnostic tests

These files may keep V1 operational. They are not V2 dependencies.

## Delete after V2 cutover

- Northstar mutation compiler and mutation journal.
- Authored/resolved relation authority.
- Geometry-intent and required-primitive protocols.
- Construction beats and presentation choreography.
- Strategy fingerprints and repair memory.
- Cumulative intent and rendered-integrity design audits.
- Candidate-slot and validator-driven spatial orchestration.
- Competing lifecycle, settlement, and completion authorities.
- Benchmark objective injection in the production API route.
- The fixed acceptance-objective fixture in production source.

## Known V1 contamination

At the Phase 1 baseline, `app/api/canvas-ai/route.ts` imports
`NORTHSTAR_ARTBOARD_BENCHMARK_OBJECTIVES` and passes that fixed queue into two
production execution paths. The fixture describes itself as acceptance input,
but it is wired into production.

Phase 1 records this without modifying V1. V2 must never import the fixture or
contain those objectives. When V2 reaches cutover, the V1 route and fixture are
removed together instead of partially rewriting the frozen legacy engine.

## Migration principle

Reuse data and product infrastructure. Rebuild creative authority. Do not
wrap a legacy design subsystem merely because it already exists.
