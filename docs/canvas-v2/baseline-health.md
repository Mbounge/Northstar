# Frozen V1 baseline health

Recorded from commit `0231c871d2beabecee14eef3420b41f763a432c7` on
2026-08-11 before any V1 runtime modification.

## Repository state

- Branch: `stable2`
- Worktree: clean
- V1 production files changed by Phase 1: none

## Typecheck

`npm run typecheck` has one existing V1 error:

```text
lib/canvas-ai/northstar-two-turn-design-reset.ts(2107,41): TS2345
NorthstarArtboardMutationDraft is passed where NorthstarArtboardMutationBatch is required.
```

The same error occurs in the untouched active repository and the Phase 1
working copy. It was not introduced by Canvas V2.

## Test runner

The package script uses:

```text
node --import tsx --test tests/**/*.test.ts
```

In the current shell this glob is passed literally, so `npm test` reports that
the path cannot be found. Running `node --import tsx --test tests/*.test.ts`
executes the suite.

Untouched V1 baseline:

```text
tests 359
pass 312
fail 41
skipped 6
```

Phase 1 working copy:

```text
tests 364
pass 317
fail 41
skipped 6
```

Canvas V2 adds five passing tests and no additional failure.

## Interpretation

These failures are legacy contract drift, not a Phase 1 acceptance standard.
They reinforce the decision to isolate V2 instead of repairing V1 while
creating the new engine. V2 must maintain its own small, executable, green
test boundary. V1 debt may be deleted with V1 after cutover rather than
carried into the new architecture.
