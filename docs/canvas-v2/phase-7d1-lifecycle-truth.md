# Phase 7D.1: lifecycle truth

Phase 7D.1 makes North Star's visible lifecycle agree with the actual state of
the committed artboard. It does not add an evaluator, retry policy, persistence
authority, or another design controller.

## Truthful terminal states

- `completed` means the design model observed the current committed revision
  and explicitly declared the requested work complete.
- `incomplete` means the bounded run committed its last safe revision but
  reached the eight-edit safety ceiling before model-declared completion.
- `stopped` means the user cancelled active routing or design work. The latest
  committed revision remains canonical and visible.
- `failed` means the active request could not continue. A speculative candidate
  is discarded and the latest committed revision remains visible.
- conversational and inspection responses use `responded`; they never imply an
  artboard mutation.

The edit ceiling is therefore never mapped to success. Chat presents a
Continuation required state with an explicit action rather than claiming that
North Star finished.

## Bounded continuation

Continue starts a new bounded design run from the exact latest committed
revision and its observation. The new run carries forward the previous creative
direction and spatial strategy, records the previous run identity, and receives
a fresh eight-edit allowance. Earlier committed design turns remain visible in
chat. Repeated continuations remain possible until the model explicitly
completes or the user stops.

Continuation does not merge speculative candidates, restart from an empty
artboard, or bypass render-observe-commit.

## Request ownership

Routing and design use separate active turn identities. Every routing request
also receives a monotonically increasing sequence. A response may update chat
only while both its turn identity and sequence still own the request.

The design loop mirrors that rule with an imperative active-run identity and
current request controller. A late provider response, iframe observation, or
capture failure from a stopped run cannot commit a candidate or replace the
stopped state.

Stop invalidates ownership before clearing candidate UI state. This makes the
latest committed revision the deterministic recovery point even when Stop is
pressed immediately after routing, during model thinking, or while a candidate
is rendering.

## Verification boundary

Focused lifecycle tests cover status mapping, reload normalization,
continuation inheritance, separate request ownership, stale observation guards,
and the visible continuation control. A deterministic browser harness also
defines routing cancellation, design cancellation, and edit-limit continuation
scenarios for the cumulative Phase 7D browser suite.

Provider timeouts and safe retry classification belong to Phase 7D.2. Research
coverage and completeness belong to Phase 7D.3. Persistence and manual-edit
hardening belong to Phase 7D.4.
