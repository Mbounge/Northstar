# Northstar 3.2 — Direct Live Source Authorship

Phase 3.2 removes the hidden creative workspace and its second Chromium
transaction lifecycle. The model still authors complete cumulative
HTML/CSS/SVG/safe-JavaScript source, but every statically safe source stage now
goes directly to the already-mounted artboard. The Phase 3.1 browser authority
is the only system that executes, audits, commits, or rolls back a candidate.

## Lifecycle

1. Materialize the exact browser-committed package and semantic snapshot.
2. Give the creative model that cumulative source, grounded evidence, current
   compositor observation, and previous browser critique.
3. Normalize aliases, harmless schema omissions, protected-evidence
   inheritance, and transaction metadata deterministically.
4. Compile and statically preflight safety, identity, lineage, and
   executability.
5. Dispatch the first safe candidate to the existing mounted iframe.
6. Let the browser atomically apply and audit the candidate.
7. Commit its exact browser-materialized snapshot or restore the accepted
   revision.
8. Critique the visible accepted result and author the next small stage.

There is no server-side candidate render, private acknowledgement, hidden
compositor critique, private candidate ranking, or second transaction engine.

## Invariants

- `canonicalFiles` always describe accepted browser state.
- A failed normalization draft may be retained only as correction context. It
  is never accepted state and can never replace the artboard.
- Normalization is bounded to two attempts at low/medium thinking and three at
  high thinking.
- A safe source candidate has exactly one runtime execution: the mounted
  browser transaction.
- Static rejection leaves the browser untouched.
- Browser rejection atomically restores the exact accepted revision.
- Model critique is advisory. Structured browser facts own delivery.
- Protected evidence remains runtime-owned and survives unmentioned source
  edits.
- Optional creative continuation failure preserves the latest operational
  browser revision and settles with notes instead of poisoning the run.

## Retired architecture

- `NorthstarCreativeSourceWorkspace`
- private applied-candidate history and ranking
- private implementation-clean fallback selection
- private delivery policy
- `captureNorthstarExactRuntimePreview`
- server-side runtime-document mutation execution
- preview acknowledgement and cinema-frame handoff
- duplicate private/live evidence-inheritance execution

The remaining render-capture utility is observation-only. It renders an already
materialized document for model observation and cannot execute a mutation.

## Diagnostics

The diagnostics panel now reports:

- source delivery mode (`direct live`)
- time from run start to the first committed creative transformation
- live source candidates ready, dispatched, committed, and rejected
- deterministic normalization retries
- mounted-browser execution count
- hidden runtime execution count (must remain zero)
- existing revision authority, rollback, frame continuity, snapshot sanitation,
  evidence survival, and collision receipts

Every source lifecycle event carries the exact base/candidate revision and
fingerprint:

- `creative.source.normalization_retry`
- `creative.live_source.candidate_ready`
- `creative.live_source.dispatched`
- `creative.live_source.committed`
- `creative.live_source.rejected`

## Failure policy

| Condition | Result |
| --- | --- |
| Parse/schema omission that can be corrected | One bounded source correction |
| Static unsafe source or invalid identity | Never dispatched; accepted revision retained |
| Browser runtime/audit rejection | Atomic rollback; browser reason becomes next source critique |
| Optional later refinement fails | Stronger accepted revision retained; complete with notes |
| Provider, network, asset, persistence, or browser infrastructure fails | Existing typed infrastructure failure path |

## Validation

- TypeScript compilation: passing
- full unit and static-contract suite: 227/227 passing
- direct-source state and correction-buffer tests
- zero-hidden-execution route contract
- observation-only render-capture contract
- live-source diagnostics reduction and UI contract
- existing Phase 3.1 transaction, rollback, evidence, and iframe continuity tests
- ESLint: 0 errors; 175 pre-existing warnings remain
- production build: blocked in the packaging runtime by its missing
  `uv_resident_set_memory` host facility, before application compilation
- Playwright: server reached the test runner, but the packaging runtime has no
  installed Chromium executable

The deployment browser fault-injection matrix remains the final release gate
because the packaging environment does not include a Playwright Chromium
binary.
