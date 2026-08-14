# Canvas V2

This directory is a clean design-engine boundary.

Read `docs/canvas-v2/phase-1-authority-contract.md` before adding production
code. Canvas V2 must not import Northstar canvas or artifact modules.

Phase 2 provides the first vertical slice: strict full-source model decisions,
a script-disabled disposable iframe, exact revision-bound PNG capture, and
explicit candidate commit or discard. It does not yet automate continuation,
persist V2 revisions, or execute generated JavaScript.

Phase 3 adds one bounded automatic loop over committed revisions. It has no
repair controller: each exact render returns to the model, and completion,
failure, cancellation, or the edit limit ends the run on the last committed
source.

Phase 4 mounts that engine inside an independent North Star canvas shell with
chat, selection, pan, zoom, progress, and stop behavior. The shell changes the
experience only; it does not introduce another creative authority.

Phase 5A adds read-only element inspection. Stable `data-canvas-v2-node-id`
values connect iframe hit testing to shell-owned hover, selection, and inspector
overlays. It does not mutate artifact source; see
`docs/canvas-v2/phase-5a-element-selection.md`.

Phase 5B compiles move, resize, leaf-text, and delete intents into complete
candidate source revisions. Manual and AI edits share the same render,
observation, and commit authority; see
`docs/canvas-v2/phase-5b-direct-manipulation.md`.

Phase 5C adds bounded revision history, local reopening, source-backed creation
tools, layers, visibility, locking, duplication, and the neutral evidence
insertion contract. See `docs/canvas-v2/phase-5c-operational-canvas.md`.

Phase 6A reconnects authenticated app, flow, screenshot, icon, and search data
through neutral tenant-scoped adapters. It does not import the legacy creative
engine; see `docs/canvas-v2/phase-6a-research-adapters.md`.

Phase 6B surfaces that adapter through Apps and References. Complete captured
flows compile into canonical premium evidence lanes with exact icon and screen
bindings, stable selectable identities, and committed ordering; individual
screens can also be inserted as grounded artboard objects. See
`docs/canvas-v2/phase-6b-grounded-evidence.md`.

Phase 6C gives every bounded design objective a small tenant research context
and exact multimodal screenshot parts. The model can independently choose and
author with approved evidence, while only evidence used in accepted source is
committed. See `docs/canvas-v2/phase-6c-agent-research.md`.

Phase 6D replaces the fixed slide with a measured, scroll-free artboard that
grows with model-authored geometry. It also restores the clean-white,
direct-on-surface North Star visual grammar as isolated V2-native defaults. See
`docs/canvas-v2/phase-6d-growing-artboard.md`.

Phase 7B adds model-owned creative direction and rendered reflection. The
runtime carries the visual thesis between observed turns while the model stays
responsible for choosing the form, meaningful next move, and completion. See
`docs/canvas-v2/phase-7b-creative-direction.md`.

Phase 7C adds model-owned spatial strategy and factual rendered geometry. Every
observed turn includes a bounded map of stable-node bounds and computed layout,
so the model can execute and refine precise placement without a template,
spatial repair controller, or aesthetic score. See
`docs/canvas-v2/phase-7c-spatial-precision.md`.

The Phase 7C evidence-authorship hardening preserves complete canonical flow
sources while allowing source-linked analytical screenshot copies anywhere on
the growing artboard. Source continuity and rendered evidence integrity are
checked before commit without evaluating the model's visual taste. See
`docs/canvas-v2/phase-7c-evidence-authorship-hardening.md`.

Phase 7C.1 upgrades role-less canonical evidence from saved V2 canvases and
verifies that indexed canonical screenshots remain a non-overlapping rendered
left-to-right sequence. See `docs/canvas-v2/phase-7c1-flow-integrity.md`.

Phase 7D.1 makes every chat and design lifecycle state truthful. Routing and
design requests have separate ownership, stopped work cannot publish a late
response or candidate, and the bounded edit ceiling is explicitly incomplete
until the user continues from the preserved committed artboard and the model
declares completion. See `docs/canvas-v2/phase-7d1-lifecycle-truth.md`.

Phase 7D.2 adds bounded provider and transport reliability around those owned
requests. Safe retries reuse one logical request identity and exact body, remain
visible and stoppable, and can materialize at most one accepted response. Retry
exhaustion preserves the latest committed artboard. See
`docs/canvas-v2/phase-7d2-request-reliability.md`.

Phase 7D.3 makes research coverage explicit from routing through completion.
Every requested product is visible, pending, unavailable, or unresolved;
canonical committed flows are the only source of visibility truth, completion
cannot silently omit available research, and interruption recovery cannot
duplicate a flow. See `docs/canvas-v2/phase-7d3-research-completeness.md`.

Phase 7E.3.3 supersedes the earlier 7D.4 browser-recovery decision. Canvas V2
is an in-memory page session: refresh starts the clean canonical artboard with
empty chat and history, cancels active work, and discards obsolete V2 recovery
keys. Manual candidates remain validated and discardable within the current
page lifetime. No Supabase or browser-local canvas persistence exists. See
`docs/canvas-v2/phase-7e3.3-refresh-reset.md`.

Phase 7D.5 replaces stale preview coverage with cumulative real-use proof. The
standard complete-flow comparison, unrelated startup-discovery compositions,
conversation, grounded inspection, selection edits, interruption, failure,
refresh reset, manual history, and a 3600×2400 artboard now exercise the same V2
authority path. The deterministic provider remains test-only and production
contains no benchmark-specific behavior. See
`docs/canvas-v2/phase-7d5-real-use-proof.md`.

Phase 7E.1 freezes the production-cutover topology in a machine-readable
manifest. It inventories every V2 route, V1 runtime root, shared adapter,
feature flag, and legacy-only test; adds a phase-sensitive verifier; and makes
all deterministic harness routes fail closed in production. It does not switch
the canonical route or delete V1. See
`docs/canvas-v2/phase-7e1-cutover-readiness.md`.
