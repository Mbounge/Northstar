# Northstar Phase 3.4 — Adaptive Atomic Design Surface

Phase 3.4 closes the architectural gap between source authorship, browser
validation, visible geometry, settlement, and diagnostics. A design candidate
now runs exactly once in the mounted browser, behind the last accepted revision,
and becomes visible only when that same execution commits.

## Runtime contract

### One adaptive geometry authority

The mounted document measures the authored scene after layout and reconciles
the following surfaces from the same settled bounds:

- the authored artboard background;
- the iframe document and intrinsic content size;
- the outer canvas placement and bounds.

Measurements include ordinary flow, absolutely positioned descendants, SVG
content, and visual bounds changed by CSS transforms. The reconciliation loop
is bounded and preserves the current canvas display scale. Runtime-owned
measurement and validation nodes are excluded from authored content.

This makes the artboard an adaptive design surface instead of a fixed crop. The
background and outer canvas can grow or shrink with the composition while the
browser remains the sole geometry authority.

### Atomic validation in the mounted browser

There is no private rendering workspace and no second candidate execution.
Before a candidate mutation is applied, the runtime clones the accepted scene
as a non-interactive visual shield. The real authored root remains mounted and
measurable behind that shield while the candidate:

1. executes in the live browser;
2. reaches layout settlement;
3. passes structural, geometry, overlap, evidence, and design checks;
4. commits or rolls back in that same runtime.

On commit, the shield is removed and the already-validated candidate is
revealed. On rejection, the candidate is rolled back before the shield is
removed. The user therefore never observes an unvalidated candidate or a
rollback flash.

### Synchronous settlement and rollback

The browser revision pointer is settled synchronously when a terminal event is
received. Transport acknowledgement remains asynchronous, but cannot leave the
UI pointing at a rejected candidate.

Rejection terminals include the restored content size. The host immediately
restores the accepted revision's geometry alongside its source pointer, keeping
the visible document, iframe bounds, and outer canvas aligned.

### Exact candidate-source observability

Diagnostics schema v3 stores a bounded archive of the exact source sent for
each candidate:

- the exact base document;
- the raw mutation batch;
- candidate and base revision identifiers;
- dispatch, acknowledgement, and settlement state;
- rejection or timeout details.

The archive is settled from browser acknowledgements and exported with the
diagnostic trace. This replaces inference from sanitized summaries when a
candidate needs to be reproduced.

### Separate operational and creative outcomes

Diagnostics no longer call a run healthy merely because the request reached a
terminal state. They report separate axes:

- operational health;
- creative outcome;
- publication readiness;
- accepted design count;
- atomic validation count;
- browser/source alignment and rollback state.

A run can therefore be operationally complete while truthfully reporting that
no new design was accepted.

### Rejection re-enters design reasoning

Non-system browser rejections mark design intelligence for reconsideration
before the next authored act. Repeated system-repair rejection does the same.
Northstar cannot keep emitting variants from a design premise the browser has
already disproved.

## Verification

Phase 3.4 adds contract coverage for adaptive outer-canvas geometry, single
mounted-browser execution, exact candidate-source archives, synchronous
rollback settlement, and split run outcomes.

The implementation passes:

- 240 unit and contract tests;
- TypeScript type checking;
- ESLint with zero errors; the same 175 pre-existing warnings remain.

The production build is blocked in this packaging runtime before application
compilation because the host lacks `uv_resident_set_memory`. Playwright reaches
the browser test, but this runtime has no installed Chromium executable. The
deployment browser matrix remains a release gate for real rendering, asset,
reconnect, and rollback behavior.

## Deliberate boundary

Phase 3.4 supplies the truthful execution substrate for excellent design work.
It does not prescribe a fixed visual template or fake quality with a fallback
layout. Richer composition planning, quantitative visual critique, semantic
chart and annotation choice, and staged narrative transformation belong to the
next design-intelligence layer and can now be built without fighting divergent
geometry or candidate authority.
