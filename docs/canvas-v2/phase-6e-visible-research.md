# Canvas V2 Phase 6E — visible research direction

Phase 6E makes research part of the visible authored workflow. It corrects the
6C experiment that privately attached screenshot pixels to a design request.

## Runtime contract

The model receives the user's objective, the complete committed source, the
rendered observation, and a tenant-scoped catalog index containing app, flow,
screen names, and counts. It chooses exactly one action per turn:

- `research`: request one exact app and complete flow from the catalog;
- `edit`: author the next complete HTML/CSS document;
- `complete`: stop on the current committed revision.

A research decision is resolved server-side against the authenticated catalog.
The client composes the app icon and every available ordered screenshot as a
canonical lane, renders that candidate, observes it, commits it, and only then
asks the model for another action. The model therefore sees the same growing
artboard the user sees.

## Accuracy guarantees

- Explicitly named apps with usable flows must have visible evidence before the
  route accepts completion.
- A canonical flow cannot be requested twice in one artboard.
- Later model-authored revisions must preserve every current evidence identity,
  exact source URL, and canonical flow marker.
- Research narration is generated from the resolved catalog result, rather
  than trusting an unverified model claim.
- Up to eight committed research or design turns may accumulate; every turn is
  rendered and observed through the same revision authority.

## North Star presentation

The composer follows the V1 premium evidence grammar without importing its
runtime: clean warm-white artboard, direct-on-surface composition, quiet app
identity at left, one uncropped ordered screenshot row, restrained shadows,
and generous whitespace. The artboard expands horizontally and vertically as
evidence and synthesis accumulate. Cards and panels are never default evidence
containers.

The chat records `Grounded research` and `Designed revision` separately so the
user can inspect how the final communication came together. The floating tool
bar is clamped to the canvas region at compact desktop widths and cannot cover
the chat submission control.

## Removed architecture

`agent-research.ts`, `evidence-visuals.ts`, and their hidden multimodal
injection path are deleted. Phase 6E remains isolated from `lib/canvas-ai` and
does not reintroduce a planner, repair loop, runtime document, or visual score.
