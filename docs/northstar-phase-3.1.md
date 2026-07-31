# Northstar 3.1 — Single Runtime Authority

Phase 3.1 establishes the mounted browser as the only authority allowed to
replace the accepted artboard revision. It deliberately preserves the existing
model-authoring and transport interfaces so Phase 3.2 can simplify those
systems without another live-state migration.

## Invariants

- A candidate is speculative until the exact mounted browser returns its
  matching terminal receipt.
- A rejected or malformed candidate cannot replace, blank, or resize the
  accepted artboard.
- Candidate application exceptions are `mutation-rejected` outcomes, not
  runtime failures.
- Protected evidence survival is runtime-owned.
- Temporary inherited evidence geometry is reported as an unresolved placement
  obligation and is never serialized into authored HTML.
- New protected-evidence collisions reject the candidate and restore the
  accepted revision.
- Recoverable design and bounded-budget failures preserve verified progress and
  complete with notes rather than producing `run.incomplete`.
- Server timing traces use the same `{ name, data, detail }` envelope consumed
  by the client diagnostics timeline.

## Authority boundary

`NorthstarSingleRuntimeAuthority` owns one ordered candidate ledger:

1. `candidate.staged`
2. `candidate.dispatched`
3. `candidate.committed` or `candidate.rejected`

`NorthstarArtboardActor` is now a compatibility adapter over that ledger. It no
longer stores an independent committed package, acknowledgement, and in-flight
proposal.

## Evidence receipt

Every browser audit exposes:

- expected evidence IDs
- present evidence IDs
- visible evidence IDs
- runtime-inherited evidence IDs
- unplaced evidence IDs
- missing evidence IDs

Runtime inheritance keeps evidence safe during intermediate transformations,
but final geometry readiness remains open until all inherited placements have
been replaced by authored placement.

## Validation

- TypeScript: passing
- Phase 3.1 focused tests: 39 passing
- ESLint: no errors; repository retains its pre-existing warnings
- Full unit/contract suite: no regression from the uploaded baseline
  (the same 16 pre-existing static-contract failures remain)
- Browser bridge generation: syntactically compiled in tests
- Playwright browser launch: not runnable in the packaging environment because
  its Chromium executable is not installed

The first live deployment should therefore run the existing Playwright
transaction gate and fault-injection matrix with the deployment's installed
browser before enabling Phase 3.1 for all users.
