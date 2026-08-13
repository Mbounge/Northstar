# Canvas V2 Phase 3 automatic loop

Phase 3 makes one user objective a bounded sequence of model-owned source edits:

```text
committed revision + exact render
→ model edit
→ candidate render
→ automatic technical commit
→ exact new render returned to model
→ edit again or complete
```

There is one controller and no repair subsystem. A model edit is committed only
after its candidate source renders and produces a revision-matched observation.
The browser does not choose a correction.

## Termination

The loop ends when:

- the model declares the observed revision complete;
- the user stops it;
- transport, provider, parsing, or capture fails; or
- six successfully rendered edits have been committed.

Every failure preserves the last committed revision. Provider calls are not
silently retried. The edit bound is a circuit breaker, not an objective plan.

## Model context

Every call receives the current complete source, its exact PNG, current browser
facts, the original instruction, the turn number, and compact summaries of prior
committed edits. Historical source and screenshots are omitted because the current
committed revision is authoritative.

## Human authority

The model decides when its observed work satisfies the objective. The runtime
enforces technical integrity only. The user remains the visual evaluator.

## Deliberate limits

Phase 3 still uses the temporary V2 harness. Existing North Star shell integration,
evidence/data loading, persistence, undo, selection, and V1 artifact migration are
later phases.
