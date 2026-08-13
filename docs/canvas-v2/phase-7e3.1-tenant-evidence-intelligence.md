# Phase 7E.3.1 — Tenant evidence intelligence and retrieval adequacy

Phase 7E.3.1 repairs the retrieval mistake exposed by the first authenticated
standard-prompt run. That run proved authentication, tenant resolution, exact
asset delivery, visible research commits, and post-research source authorship,
but its three-screen first-product selection was not adequate evidence for a
broad onboarding comparison. It is retained as historical mechanical proof and
is not accepted as retirement-quality visual proof.

V1 remains present, dormant, and recoverable. Phase 7E.4 is paused until this
resolver is exercised through the authenticated standard prompt and the visible
result satisfies the proof conditions in
`config/canvas-v2-cutover-manifest.json`.

## One neutral tenant evidence model

The Canvas V2 adapter still reads the existing tenant-scoped `target_apps` and
`app_sessions` records. It does not import V1 creative code, add product-specific
branches, create a second evidence database, or write canvas state remotely.

For each captured session it now preserves four useful levels of truth:

1. application identity and authoritative platform/session scope;
2. coherent taxonomy-root journeys assembled from their terminal paths;
3. focused child paths with their complete ordered screenshots;
4. a complete session capture as an explicit fallback rather than a default.

Taxonomy-root journeys follow the same evidence semantics as North Star's flow
explorer. Terminal paths are visited in stored taxonomy order. Repeated image
assets are removed by canonical screenshot identity, preserving the first
meaningful occurrence. The focused paths remain available, so deduplication does
not erase the source hierarchy or prevent a later screen-specific request.

Every candidate carries neutral retrieval metadata: scope, taxonomy path,
descendant-path count, unique screen count, duplicate count, session/platform,
selection rank, scope match, adequacy classification, and a short factual reason.
This is evidence resolution, not a visual template or an aesthetic evaluator.

## Scope before brevity

The research director now interprets onboarding, browsing, mobile, and web scope
against authoritative session metadata. It gives an explicitly named child path
priority for a focused request. For a broad journey request, a coherent taxonomy
journey outranks a shallow leaf and a session-wide dump.

`representative`, `simple`, and `executive` affect how the model should
communicate the answer. They no longer reward retrieving fewer screenshots.
The final composition may be concise while its canonical evidence remains
complete and inspectable.

Candidates are classified as:

- `preferred`: the strongest relevant coverage for the requested scope;
- `adequate`: materially equivalent coverage within the preferred set;
- `supporting`: useful evidence that cannot by itself resolve the request.

While a named app is unresolved, the production route accepts only a preferred
or adequate flow. A shallow leaf already present on the artboard therefore does
not impersonate complete journey coverage. The app remains unresolved, the
research-only lifecycle policy stays active, and completion remains impossible
until adequate evidence is visibly committed.

## Artboard result

The trusted insertion path is unchanged: a selected journey is placed in full
as a canonical identity rail plus an ordered, unwrapped screenshot sequence.
The lane records its evidence scope and taxonomy path. Original images, URLs,
evidence IDs, order, aspect ratios, and canonical provenance remain protected.

After adequate evidence is visible, the model retains its open authorship over
the growing North Star surface. It may space or reposition the lanes, annotate
steps, connect relationships, enlarge canonical screenshots as traceable
analysis copies, and build comparisons, hypotheses, charts, or other grounded
forms warranted by the prompt.

## Generality

There is no Awin/Whop lookup rule in this patch. The behavior derives from every
tenant's stored application names, session types, taxonomy hierarchy, flow
labels, and screenshot identities. The same resolver applies to any connected
product and provides the base for later product, marketing, business, and web
research adapters.

## Verification

```bash
npm run test:canvas-v2
npm run check:canvas-v2-production-proof
npm run check:canvas-v2-cutover
npm run typecheck
```

The new unit coverage proves taxonomy-root reconstruction, stable deduplication,
child-path preservation, session fallback retention, scope-aware ranking, and
the lifecycle rule that rejects inadequate shallow evidence. Clearing the live
hold requires a fresh authenticated browser run after the patch is applied; no
receipt is fabricated in advance. The first three gates and targeted lint pass.
Repository-wide typecheck still reaches the pre-existing dormant-V1 error in
`lib/canvas-ai/northstar-two-turn-design-reset.ts`; Phase 7E.3.1 introduces no
new V2 lint or test failure and does not disguise that remaining baseline issue.
