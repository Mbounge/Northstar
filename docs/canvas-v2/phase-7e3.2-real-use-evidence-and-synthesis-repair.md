# Phase 7E.3.2 — Real-use evidence and synthesis repair

> Phase 7E.3.3 supersedes this patch's recovery-notice hardening. Refresh is now
> intentionally a total reset and no Canvas V2 recovery state is restored.

The first authenticated run after 7E.3.1 exposed three independent failures in
the standard Awin/Whop prompt. The tenant adapter retrieved real evidence, but
the representative-evidence request selected a 44-screen umbrella journey; the
canonical composer forced long flows into one unwrapped row; and the first
synthesis response omitted stable identities from analytical image copies. The
candidate was correctly rejected, but identical logical retries received no
validator feedback, so no design turn committed.

This phase repairs those general contracts. It contains no Awin/Whop lookup
branch, no visual evaluator, no remote canvas persistence, and no V1 deletion.

## Representative evidence is a scope, not a shortcut

Broad onboarding or browsing requests still prefer coherent taxonomy journeys.
An explicitly named path still resolves to that exact path. When the user
explicitly asks North Star to choose representative flows, paths, screens, or
screenshots, the resolver may prefer a substantial complete child path over an
umbrella containing every branch. A relative coverage floor prevents the old
three-screen-fragment failure. The selected representative path remains complete
and is never truncated by the runtime.

## Complete evidence uses bounded row-major geometry

The canonical working surface now presents long flows as a row-major evidence
atlas. Screens remain in their original DOM and flow-index order, retain natural
aspect ratios, and never overlap. Short paths stay on one row; long paths wrap
left-to-right into successive rows. This keeps complete source evidence visible
without expanding the artboard into an extreme horizontal strip or forcing the
workspace to crop at its previous minimum zoom.

Rendered integrity now accepts only that reading order: left-to-right without
overlap within each row, followed by a lower row. Canonical provenance,
contiguous indices, exact URLs, and original node identities remain unchanged.

## Invalid synthesis becomes correctable

Model-authored layout and styling remain authoritative. A narrow normalization
pass may supply only omitted metadata for approved images: a deterministic
stable node ID, the approved evidence ID inferred from an exact URL, and an
analysis-copy/source relationship inferred from the canonical manifest. It does
not change layout, copy, CSS, image URLs, or canonical source identities.

If any deterministic validation failure remains, the next logical retry carries
the validator message as correction context while retaining the same request ID,
committed revision, and serialized request body. The retry can repair the source
contract instead of blindly sampling the unchanged instruction.

## Real-use readiness remains truthful

The workspace can now fit unusually large two-dimensional artboards below the
old 25% floor rather than clipping them. Manual creation controls stay disabled
until the committed revision has produced its first browser observation, so an
immediate click after load cannot silently race source authority. Recovery
notices also survive React's development remount and the browser proof asserts
the real typed provider failure reason instead of a stale generic label.

## Retirement remains paused

V1 remains dormant and recoverable. Phase 7E.4 cannot begin until an
authenticated standard-prompt run proves all of the following together:

- representative but non-shallow tenant flow selection;
- complete and inspectable row-major evidence geometry;
- at least one post-evidence synthesis revision that commits successfully;
- a final evidence-grounded composition at a useful inspection scale.

The deterministic browser fixture now exercises production-scale evidence
volume (44 and 17 screenshots) so the single-row blind spot cannot return.
