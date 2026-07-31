# Northstar 3.3 — One Lifecycle Authority

Phase 3.3 closes the main architectural loop. Creative convergence, recovery
classification, and terminal settlement now produce one typed lifecycle
receipt. Transport coordinates messages, the mounted browser decides revision
truth, and publication verifies metadata; none of those layers may silently
re-adjudicate another layer's decision.

## Final authority model

| Authority | Owns | Must not own |
| --- | --- | --- |
| Creative model and isolated reviewer | Source authorship, critique, creative closure | Browser commit truth |
| Lifecycle authority | Continue/publish/settle decision, failure classification, terminal outcome | Source execution |
| Mounted browser | Atomic apply, audit, commit, rollback, exact revision receipt | Creative taste |
| Realtime coordination | Lease and settlement-receipt delivery | Settlement policy |
| Publication transition | Metadata on the accepted revision | A final visual rewrite or second closure verdict |

## Terminal invariant

Every server terminal outcome carries
`northstar.lifecycle-authority.v1`. The receipt records:

- terminal state and classification
- stable reason code
- artifact and exact revision identity
- whether an operational browser revision was preserved
- whether publication was verified
- whether the client settlement receipt arrived
- exact failed predicates
- known limitations

Research, a requested action, or a successful tool call is not a preserved
deliverable. Only an exact applied browser acknowledgement for the canonical
revision may set `operationalRevisionPreserved`.

## Recovery matrix

| Condition | Terminal result |
| --- | --- |
| Exact client, browser, persistence, render, and publication contract passes | `completed` |
| Exact operational revision passes; creative/publication work remains advisory | `completed_with_notes` |
| Client settlement telemetry is missing but the browser revision is already preserved | `completed_with_notes` with `transport-degraded` |
| Recoverable design continuation fails after a preserved browser revision | `completed_with_notes` with `recoverable-design` |
| Recoverable design continuation fails before any operational browser revision | `incomplete` |
| Unexpected continuation fails after a preserved browser revision | `completed_with_notes`; the accepted deliverable survives |
| Infrastructure fails before an operational browser revision exists | `infrastructure_failed` |
| User cancellation | `cancelled` |

This removes the former `verifiedProgress` shortcut, which could incorrectly
convert research or dispatch activity into a successful recovered design.

## Retired architecture

- settlement policy inside realtime coordination
- outer-route `verifiedProgress` recovery classification
- direct recoverable-error terminal branch
- publication-time duplicate creative closure adjudication
- terminal events without a typed authority receipt
- the separate `northstar-creative-convergence` policy module

`northstar-lifecycle-authority.ts` is now the only module that decides creative
convergence, failure recovery class, or server terminal settlement.

## Diagnostics

The diagnostics panel now exposes the lifecycle outcome, classification,
browser-preservation fact, reason code, and exact count/list of failed checks.
The full authority receipt is also present in exported terminal events and the
`lifecycle.authority.settled` trace.

Existing live-source diagnostics remain intact:

- time to first committed transformation
- direct-live dispatch and commit counts
- normalization retries
- zero hidden runtime executions
- browser revision alignment and rollback
- iframe continuity
- evidence survival and collision receipts

## Validation

- TypeScript compilation: passing
- full unit and static-contract suite: 235/235 passing
- lifecycle failure/recovery truth table
- settlement-receipt degradation regression
- lifecycle diagnostics reduction and UI contract
- exact-browser-preservation route contract
- existing Phase 3.1 transaction and Phase 3.2 direct-source suites
- ESLint: 0 errors; 175 pre-existing warnings remain
- production build: blocked in this packaging runtime before application
  compilation because the host lacks `uv_resident_set_memory`
- Playwright: reached the browser test, but this packaging runtime has no
  installed Chromium executable

The deployment Chromium fault-injection matrix remains a release gate because
it verifies real browser, persistence, asset, and reconnect behavior that a
Node-only suite cannot prove.
