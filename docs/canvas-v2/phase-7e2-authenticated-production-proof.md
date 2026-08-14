# Phase 7E.2 — Authenticated production proof

> Historical note: the authenticated observation recorded here correctly
> described browser-local recovery at that time. Phase 7E.3.3 subsequently
> removed that behavior; Canvas V2 now starts a clean in-memory session on every
> refresh and still performs no remote canvas writes.

Phase 7E.2 proves Canvas V2 through the real authenticated application boundary
before North Star changes its canonical route. The proof used an approved account,
the configured Gemini provider, production tenant resolution, the production app
catalog, real stored icons and screenshots, and the production source → render →
observe loop. It did not use the deterministic E2E fixture.

The non-secret receipt is
`config/canvas-v2-production-proof.json`; its source-contract verifier is
`npm run check:canvas-v2-production-proof`.

## Verdict

> **7E.3.1 qualification:** this run remains valid proof of production mechanics,
> but its three-screen first-product selection and underdeveloped final
> composition do not satisfy the visual retirement bar. It no longer authorizes
> V1 retirement. See `phase-7e3.1-tenant-evidence-intelligence.md`.

The production path is operational, and the standard Awin/Whop synthesis prompt
now completes in the correct causal order:

1. route the request as research plus design with synthesis intent;
2. retrieve and visibly commit one complete representative flow for each named
   app;
3. render and observe both canonical evidence lanes;
4. author a synthesis from that rendered evidence;
5. declare completion only after the synthesis revision is committed.

This closes the 7E.1 blocker for authenticated router, model, tenant data, assets,
and standard-prompt execution at a mechanical level. The later 7E.3.1 audit keeps
visual retirement readiness open until taxonomy-aware retrieval is proven live.
It does not authorize retirement by itself; 7E.3 remains a separate reversible
route cutover patch.

## What the live run exposed

The first production run was useful precisely because it was not predetermined.
It exposed two failures that fixture-only coverage could not prove away:

- the model could author a generic comparison before retrieving the named app
  evidence, including proxy flow placeholders;
- after research, it could treat the two inserted flow lanes as a finished
  comparison and complete without a post-evidence analytical turn.

The production catalog was also much larger than the small deterministic fixture.
The unbounded model index contained 286 usable flow summaries and 2,135 screen
names (149,176 serialized bytes). That volume weakened flow selection and spent
context on unrelated apps.

## Repairs made from production evidence

### Explicit research intent

The semantic router now classifies research work as either:

- `evidence`: the visible evidence is itself the requested deliverable; or
- `synthesis`: the user asked for comparison, analysis, insight, explanation,
  strategy, or another authored conclusion grounded in evidence.

That intent and the bounded tail of committed decision history follow the run
through continuation and browser-local recovery, so a fresh edit budget cannot
erase the evidence-before-synthesis boundary. Old recovery records without the
new fields remain valid.

### Evidence-first decision authority

The research director derives a factual policy from the exact visible revision:

| State | Permitted model decision |
| --- | --- |
| A required named app is unresolved or pending | `research` only |
| Synthesis mode and the last committed move was research | `edit` only |
| Required evidence is visible and synthesis has occurred | `research`, `edit`, or `complete` |

The model still chooses the flow, the composition, the analytical form, and when
further work is useful. The runtime only prevents causally invalid actions. An
invalid decision is rejected before commit and retried against the same verified
revision; the latest committed artboard remains intact.

### Target-scoped catalog context

For explicitly named apps, only those apps enter the model's research index.
Each app exposes at most 18 complete candidate flows and at most 12 screen names
per flow. Candidates are relevance-ranked, and focused journeys are preferred
over umbrella captures when the user explicitly asks for a simple,
representative, concise, focused, or executive result.

This bounds the standard prompt's real catalog context to two apps, 36 flow
summaries, 293 screen names, and 28,787 serialized bytes. Bounding affects only
model discovery. Once a flow is chosen, its complete ordered screenshot sequence
is inserted without truncation.

### Claim-level grounding and truthful retry UI

The design instruction now requires every product-specific analytical claim to
name a visible screen, step, sequence, or pattern, or be presented explicitly as
a hypothesis. It forbids invented causality and unsupported value judgments.

The live run also revealed that a rejected logical decision was displayed as a
network interruption. Retry progress now distinguishes model-response correction,
provider load, timeout, service availability, and actual transport interruption.

## Recorded production proof

- unauthenticated access redirected to login;
- an approved authenticated account rendered the V2 workspace;
- the real semantic router returned `research-design`, synthesis mode, and both
  named targets;
- the configured Gemini design model returned parseable structured decisions;
- tenant resolution exposed 11 apps, including 44 and 50 complete usable flows
  for the two requested products;
- six HTTP range probes covering both icons and the first and last screenshots
  of both selected flows returned renderable PNG data;
- the final committed run contained two complete canonical lanes totaling 20
  screenshots, one post-evidence design revision, and terminal completion;
- two premature completion responses were rejected without committing source;
- the final rendered artboard retained both complete flows and the authored
  synthesis.

The receipt intentionally records counts and outcomes only. It contains no user,
tenant, token, key, app/flow/evidence identifier, asset URL, or canvas source.

## Persistence and cutover boundary

This phase added no Supabase canvas writes. Authentication and app evidence
remained read-only production dependencies, and Canvas V2 revision/chat recovery
remained local to the browser. At the time of this proof, `/canvas` was still in
the declared dual-run state and `/canvas-v2` was the authenticated V2 preview;
Phase 7E.3 now supersedes that route topology.

## Commands

```bash
npm run check:canvas-v2-production-proof
npm run check:canvas-v2-cutover
npm run test:canvas-v2
npm run typecheck
```

The proof receipt is a release record, not a substitute for future live smoke
tests. Phase 7E.3 reruns and records the canonical-route smoke path immediately
after changing ownership of `/canvas`.
