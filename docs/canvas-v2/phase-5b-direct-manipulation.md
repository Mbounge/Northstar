# Canvas V2 Phase 5B: direct manipulation

Phase 5B turns read-only element selection into source-backed manual editing.

## One revision authority

Move, resize, leaf-text edit, and delete operations never mutate the live iframe. A gesture becomes a typed mutation intent, the compiler applies that intent to the latest committed HTML, and the result becomes a normal candidate revision. The disposable iframe renders and observes that candidate before it can become committed.

AI and manual edits therefore converge on the same pipeline:

`intent -> complete candidate source -> render -> observation -> commit`

## Precision rules

- Pointer deltas are divided by canvas zoom before entering artifact coordinates.
- Node identity must resolve to exactly one element.
- Moves accumulate explicit intrinsic-pixel offsets on the source element.
- Resize dimensions are finite and clamped to a safe minimum.
- Text replacement is restricted to leaf elements so a container cannot accidentally lose its children.
- Source safety validation runs after every compiled mutation.
- Generated documents must assign unique stable IDs to meaningful editable elements and preserve surviving IDs across revisions.

Undo/redo, creation tools, layers, and persistence remain Phase 5C work.
