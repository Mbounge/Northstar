# Canvas V2 Phase 2 vertical slice

Phase 2 implements one complete, manually controlled source-to-render turn:

```text
committed source + exact PNG + instruction
→ model returns complete HTML/CSS
→ immutable candidate revision
→ script-disabled iframe render
→ exact revision-bound PNG observation
→ human commit or discard
```

## Runtime boundary

- `/api/canvas-v2/design` is authenticated and performs one model decision.
- `/canvas-v2` exposes the isolated workspace for signed-in users.
- `CANVAS_ENGINE=v2` switches the existing `/canvas` page to V2.
- The default `/canvas` behavior remains V1 when the flag is absent.
- `CANVAS_V2_MODEL` optionally overrides `gemini-3.1-flash-lite`.

The model returns complete HTML and CSS. Full-source replacement is deliberate:
Phase 2 prioritizes one canonical result over a second patch or mutation language.

## Candidate rendering

The candidate iframe has `sandbox="allow-same-origin"` and no `allow-scripts`.
Model-authored JavaScript, event handlers, embedded browsing contexts, external
CSS imports, CSS URLs, and unapproved images are rejected before rendering.

`html-to-image` captures the exact iframe document after fonts and images settle.
Every observation names the revision it captured. The model endpoint rejects a
request when source and screenshot revision IDs differ.

## Human authority

Phase 2 provides explicit Commit and Discard controls. It does not implement an
automated visual evaluator. The model owns the source; the user judges the visual
result.

## Evidence

Every `<img>` must include `data-canvas-v2-evidence-id` and its exact approved
asset URL. This protects evidence identity without freezing its placement, size,
or composition.

## Deliberate Phase 2 limits

- no automatic continuation loop;
- no persistence or V1 artifact migration;
- no generated JavaScript;
- no canvas selection context;
- no research/data adapter;
- no visual-quality validator;
- no Northstar imports.

## Browser proof

The `/canvas-v2-e2e` harness renders a fixed revision and exposes its captured
observation. The Phase 2 verification captured a PNG of 29,022 data-URL
characters, with both the iframe and observation reporting revision
`canvas-v2-browser-proof`.
