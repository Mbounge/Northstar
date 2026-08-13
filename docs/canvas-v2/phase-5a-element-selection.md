# Canvas V2 Phase 5A: element selection

Phase 5A makes the rendered artboard inspectable without making it mutable.

## Contract

- Selectable elements opt in with a stable `data-canvas-v2-node-id`.
- Hit testing happens inside the same-origin, script-disabled preview iframe.
- The preview reports identity, semantic metadata, and rendered geometry to the shell.
- Hover and selection overlays are drawn by the shell and never written into artifact source.
- Coordinates remain in the artboard's intrinsic coordinate space, so the existing canvas transform scales the iframe and overlays together.
- Selection is cleared when the user clicks outside the artboard and remeasured after iframe scroll or resize.

## Deliberate boundary

This phase contains no move, resize, text-edit, delete, or source-rewrite behavior. Phase 5B will translate explicit manual gestures into immutable V2 candidate revisions. It must use the same render, observation, and commit path as AI-produced revisions.

The legacy canvas engine remains outside the dependency boundary.
