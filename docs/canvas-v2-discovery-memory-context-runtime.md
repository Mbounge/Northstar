# Patch 9.2 — Discovery Memory and Context Runtime

Patch 9.2 gives Northstar durable discovery memory without making every model
operation reread the entire canvas. The graph is the complete record. A
working set is the bounded, quality-preserving view used for one operation.

## Product contract

- Evidence, sources, screenshots, facts, metrics, limitations, authored canvas
  objects, relationships, model turns, and human edits have stable graph
  identities.
- Refreshed evidence creates historical lineage. It never silently overwrites
  the prior value, source snapshot, time range, filters, or limitations.
- Conflicting active claims remain visible as contradictions. Retrieval keeps
  both sides and their provenance together.
- The graph belongs to the artifact revision. Human and Northstar undo/redo
  therefore restores visible canvas truth and discovery memory atomically.
- Routing, research, sensemaking, composition, revision, and verification use
  different context budgets and relevance priorities.
- Selected objects, relevant human corrections, source lineage, limitations,
  and material contradictions are quality requirements, not optional records
  removed to meet a token target.
- Context expands by exact graph identity when a later reasoning step needs a
  missing detail. Expansion does not replay unrelated discovery history.
- Creative work that does not request evidence stays evidence-free.
- Large-board source context keeps relevant objects losslessly where practical
  and a stable identity map for everything else. It never uses an arbitrary
  middle cut that can hide the selected object.
- Unchanged record payloads, working sets, and static design references are
  reused instead of decoded or rebuilt for every turn.
- Cache identity includes the graph revision, prompt, exact selection,
  viewport bounds and scale, local relationships, freshness digest, requested
  operation, and model/context profile.
- The model-facing discovery payload is delta-first. Changed and mandatory
  records remain complete; unchanged records remain available through compact
  stable references and exact-ID expansion.
- Screenshot journeys stay visual and bounded: the first synthesis read uses
  one representative atlas per lane (up to three), later reads rotate one
  relevant atlas, and exact screenshot or identity copies are compiler-bound
  only when the analytical move needs them.
- Provider retrieval is cached inside a freshness window and independent
  marketing/business source probes run concurrently. Provider attempt counts
  and durations remain attached to the internal turn audit.

## Quality and performance gates

Patch 9.2 is accepted only when tests prove all of the following together:

1. Provenance, historical values, contradictions, and human corrections
   survive successive revisions.
2. Selection and source inspection resolve to the local discovery lineage in
   both `/canvas` and `/canvas-v2-e2e`.
3. A relevant contradiction retrieves both claims and both source chains.
4. An omitted record can be expanded deliberately without loading the entire
   graph.
5. Serialized working context remains bounded as irrelevant graph size grows.
6. Evidence-free creative requests receive no unrelated account evidence.
7. Undo and redo restore the graph with the corresponding native composition.
8. Routing avoids unnecessary full-source and multimodal payloads while
   composition and revision retain their richer quality budgets.
9. The exact delta-first model payload size and context-assembly time are
   recorded, allowing context and latency regressions to be detected.
10. Production `/canvas` and deterministic `/canvas-v2-e2e` invoke the same
    discovery-context runtime and differ only in who produces the authored
    decision.

## Completion statement

Patch 9.2 is complete when Northstar maintains a durable, inspectable evidence
graph while supplying every model operation with a bounded, relevant,
phase-specific discovery working set; progressively expands context only when
needed; reuses unchanged evidence and decoded assets; preserves provenance,
contradictions, uncertainty, human edits, and transactional history; and
demonstrates that discovery quality remains high without prompt size, model
latency, or multimodal processing growing with the entire canvas.
