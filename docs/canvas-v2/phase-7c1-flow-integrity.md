# Phase 7C.1: canonical flow integrity

Phase 7C.1 seals two factual gaps found in the pre-7D audit. It does not add a
visual evaluator or constrain the model's analytical composition.

## Saved-canvas compatibility

Canonical screenshots saved before the Phase 7C hardening may not yet declare
an evidence role. V2 now derives canonical status from membership in a protected
`data-canvas-v2-canonical-flow` lane and normalizes those images when evidence is
reused. A role attribute outside a canonical lane cannot nominate an image as a
canonical provenance source.

This lets an older saved flow produce a correctly identified analytical copy:
the original receives the canonical role, while the copy receives a new node
identity, `analysis-copy`, and the original source node reference.

## Rendered sequence integrity

Every canonical flow must keep complete contiguous screen indices. At the
render boundary, the indexed screenshots must also appear from left to right
without overlapping one another. CSS `order`, grid placement, transforms, or
absolute coordinates therefore cannot silently contradict the protected source
sequence.

The rule applies only to original canonical screenshots. North Star remains free
to introduce gaps and annotations around the flow, and analytical copies may be
repositioned, enlarged, cropped for detail, compared, connected, or layered
elsewhere according to the model's visual judgment.
