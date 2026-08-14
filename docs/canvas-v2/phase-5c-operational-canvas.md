# Canvas V2 Phase 5C: operational canvas

> Historical note: Phase 7E.3.3 supersedes this phase's local-persistence
> behavior. Canvas V2 now resets completely on refresh.

Phase 5C completes the first operational editing surface.

## Capabilities

- Undo and redo travel through committed artifact revisions produced by either AI or manual work.
- The latest committed revision reopens from local browser persistence.
- Text, frame, shape, and table tools create source-backed elements with stable identities.
- The Layers panel exposes source order, visibility, and lock state, including hidden nodes that cannot be selected on the artboard.
- Selected nodes can be duplicated, reordered, hidden, locked, or deleted.
- Delete/Backspace and Cmd/Ctrl-Z shortcuts use the same mutation and history paths as visible controls.
- History is bounded and branching: committing after undo discards the abandoned redo branch.

## Evidence boundary

`evidence-insertion.ts` establishes the Phase 6 handoff. An adapter supplies a typed approved asset; insertion binds its exact URL and evidence ID into a candidate document and extends the candidate evidence manifest. Research retrieval, flow selection, screenshot browsing, icons, and remote persistence arrive through Phase 6 adapters rather than legacy creative logic.

All operations still converge on complete candidate source, disposable rendering, observation, and commit.
