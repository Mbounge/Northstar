# Phase 7D.3 — Research completeness

Phase 7D.3 makes research coverage explicit and truthful without introducing a
visual evaluator or a second design authority. North Star still decides what to
research, how to compose it, and how to communicate the result. The runtime now
ensures that an explicitly requested product cannot silently disappear from the
work.

## Semantic targets

The interaction router returns `researchTargets` for a research-and-design
request. These are the products the user explicitly named, including a product
that is not present in the connected account catalog. The design loop preserves
that target list across every observed turn and across an explicit continuation.

The research director also detects exact connected-app names in the original
instruction. This is a compatibility safeguard, not prompt-specific policy.

## One truthful state per target

Each target is represented by one requirement:

- `unresolved`: the connected app has at least one complete captured flow, but
  no such flow is yet visible on the committed artboard.
- `pending`: the model selected an exact app and flow and its candidate is being
  rendered and verified.
- `visible`: an exact complete canonical flow is present in committed source.
- `unavailable`: the app is absent from this account, or it has no complete flow
  whose screenshots are all renderable.

Only the canonical flow marker in committed artifact source establishes
visibility. Evidence metadata, a loose screenshot, an analytical copy, model
text, or an uncommitted candidate cannot impersonate completed research.

## Completion contract

North Star cannot complete while any target remains `unresolved` or `pending`.
It may complete with unavailable targets because that state is terminal and
truthful, but the design prompt requires the limitation to remain explicit on
the artboard. A neutral `data-canvas-v2-research-unavailable` source marker ties
that visible limitation to the exact requested target; completion is rejected
until every unavailable target has one. This marker does not prescribe layout
or evaluate visual quality. The runtime also adds the exact unavailable targets
to the final chat summary, so an unavailable product cannot be silently omitted
even if the model's prose is incomplete.

A research decision is accepted only when it identifies an exact catalog app
and an exact complete captured flow. The flow is inserted once as an ordered
canonical lane. Duplicate requests are rejected. Existing Phase 7C continuity
and rendered-integrity checks continue to protect every canonical screenshot,
while analytical copies remain freely available for comparisons, annotations,
relationships, and deeper analysis elsewhere on the growing artboard.

## Lifecycle and recovery

The `pending` transition belongs to the same render-observe-commit lifecycle as
every other design turn. It becomes `visible` only after the candidate commits.
Stop, stale ownership, render failure, or integrity failure clears pending work
without claiming visibility. A later user request can research the target from
the last committed revision, and the duplicate-flow guard prevents a recovered
request from inserting the same canonical flow twice.

Research coverage is shown in the chat progress surface throughout the run and
after completion. The user can therefore see which requested products are
visible, pending, unavailable, or still unresolved without the runtime judging
the quality of the model's composition.

The deterministic browser proof covers both a mixed available/unavailable
request and interruption followed by recovery. It verifies one complete
canonical flow, an explicit unavailable limitation, no fabricated placeholder
flow, and no duplicate insertion.
